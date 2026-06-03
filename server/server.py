"""english-interview-web · FastAPI 后端.

无状态：每次 /api/turn 由前端传完整 transcript + style + accent。
- STT: faster-whisper (CPU, tiny.en 默认，env WHISPER_SIZE 可改)
- LLM: DeepSeek V4 Flash (OpenAI 兼容 /v1/chat/completions, json_object mode)
- TTS: ~/claw/bin/tts-edge（免 key，英印音）

部署目标：pyf 服务器（panyifeng.xyz 阿里云，国内直连 DeepSeek + GFW 不挡）。
- 必需环境变量 DEEPSEEK_API_KEY（或在 ~/bin/.deepseek.env 里）

接口：
  POST /api/turn           开始一轮（含上传音频）→ 返回评分 + 下一题 + TTS mp3 (base64)
  POST /api/start          初始化：返回首题（无评分）+ TTS
  POST /api/summary        结束：要 transcript 全文 → 返回总评
  GET  /api/health         健康检查
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ─── 路径 / 题库 / profile ────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
# 默认从相邻的 cli/ 加载 profile.md + question_bank.md（仓库自带）；env SRC_ROOT 可覆盖
SRC_ROOT = Path(os.environ.get("SRC_ROOT", str(HERE.parent / "cli")))
PROFILE = (SRC_ROOT / "profile.md").read_text(encoding="utf-8") if (SRC_ROOT / "profile.md").exists() else ""
QBANK = (SRC_ROOT / "question_bank.md").read_text(encoding="utf-8") if (SRC_ROOT / "question_bank.md").exists() else ""
# tts-edge：默认仓库根 ./bin/tts-edge；env TTS_EDGE 可覆盖
TTS_EDGE = Path(os.environ.get("TTS_EDGE", str(HERE.parent / "bin" / "tts-edge")))
# 前端：默认仓库根 ./index.html + ./app.js + ./vendor/（部署时 rsync 到 REMOTE_ROOT/）。
# 后端同域托管全部前端资源 → 墙内无需代理、不依赖 Google Fonts/unpkg/CDN（否则渲染阻塞十几秒）。
FRONTEND_DIR = Path(os.environ.get("FRONTEND_DIR", str(HERE.parent)))
FRONTEND_HTML = FRONTEND_DIR / "index.html"
APP_JS = FRONTEND_DIR / "app.js"
VENDOR_DIR = FRONTEND_DIR / "vendor"

# style / accent 复用 CLI 版本一致定义
STYLE_HINTS = {
    "mixed": "Balance behavioral and technical questions. Mix STAR-style probes with system-design depth.",
    "hsbc": ("Behave like an HSBC / Standard Chartered / DBS hiring manager. STRENGTHS-BASED + HSBC 8 values "
             "(value difference, succeed together, take responsibility, get it done, act with courage, act "
             "with integrity, see the future first, do the right thing for the customer). Probe risk awareness, "
             "regulated-industry mindset, auditability, cross-cultural collaboration. Accent: British or Indian."),
    "strengths": ("STRENGTHS-BASED HireVue style. Short questions about what energises the candidate, what drains "
                  "them. Each question answerable in 60-90s."),
    "tech": "TECHNICAL deep-dive. System design, trade-offs, failure modes. Probe agent-runtime / LLM-gateway depth.",
    "behavioral": "Pure BEHAVIORAL STAR. Push for quantified impact and crisp 'I' ownership.",
}

ACCENT_VOICES = {
    "british": ["british", "british-thomas"],
    "british-f": ["british-f", "british-libby"],
    "indian": ["indian"],
    "indian-f": ["indian-f"],
    "mixed": ["british", "british-thomas", "british-f", "indian", "indian-f"],
}

# ─── faster-whisper 懒加载（启动时跳过，第一次调用才下模型） ─────────
# whisper 现在只是「兜底」路径：主路径是前端浏览器 Web Speech（流式 + 更准），
# 只有浏览器实时识别失败/为空时才回落到上传音频走这里。
# 默认 base.en：比 tiny.en 明显更准，int8 ≈150MB，pyf 1.7G 内存放得下。
# 内存够还想更准：export WHISPER_SIZE=small.en（int8 ≈500MB，1.7G 偏紧需实测）。
_whisper_model = None
_whisper_lock = asyncio.Lock()

# initial_prompt：给 whisper 喂领域词表做偏置，降低人名/术语误转写。
# 注意 base/small.en 的 initial_prompt 别太长（会占解码窗口），点到为止即可。
WHISPER_PROMPT = os.environ.get(
    "WHISPER_PROMPT",
    "A software engineer answers a technical job interview about AI agents, "
    "LLM gateway, agent runtime, RAG, latency, throughput, Kubernetes, Redis, "
    "Postgres, observability, STAR examples, ownership and quantified impact.",
)


async def get_whisper():
    global _whisper_model
    async with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            size = os.environ.get("WHISPER_SIZE", "base.en")
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute = os.environ.get("WHISPER_COMPUTE", "int8")
            _whisper_model = WhisperModel(size, device=device, compute_type=compute)
        return _whisper_model


# ─── DeepSeek LLM 客户端 ─────────────────────────────────────────────
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = os.environ.get("DEEPSEEK_BASE", "https://api.deepseek.com") + "/v1/chat/completions"
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")


def call_llm(prompt: str, model: Optional[str] = None,
             connect_timeout: int = 8, read_timeout: int = 90) -> dict:
    """走 DeepSeek (OpenAI 兼容) chat/completions，json_object 强制结构化返回。

    - timeout=(connect, read) 分开，避免 SSL/socket 卡死时无限挂起
    - DeepSeek 偶发 'Service is too busy'，retry 一次（指数退避）
    - flash 撞 503 时自动 fallback 到 pro
    """
    if not DEEPSEEK_KEY:
        return {"_error": "DEEPSEEK_API_KEY 未设置（~/bin/.deepseek.env 或环境变量）"}

    chosen_model = model or DEEPSEEK_MODEL
    last_err = ""
    for attempt in range(2):
        body = {
            "model": chosen_model,
            "messages": [
                {"role": "system", "content": "You are a professional interviewer + English coach. Always respond with a single valid JSON object as instructed. Do not include any text outside the JSON."},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
            "max_tokens": 2048,
        }
        try:
            r = requests.post(
                DEEPSEEK_URL,
                headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"},
                json=body, timeout=(connect_timeout, read_timeout),
            )
        except requests.RequestException as e:
            last_err = f"DeepSeek 网络错误: {e}"
            if attempt == 0:
                import time; time.sleep(1.5)
                continue
            return {"_error": last_err}

        if r.status_code == 200:
            try:
                envelope = r.json()
                text = envelope["choices"][0]["message"]["content"]
            except Exception as e:
                return {"_error": f"DeepSeek 响应解析失败: {e}: {r.text[:300]}"}
            obj = _extract_json(text)
            return obj or {"_error": f"模型未返回 JSON: {text[:300]}"}

        # 非 200：429/503 重试 + flash → pro fallback；其它直接报错
        last_err = f"DeepSeek HTTP {r.status_code}: {r.text[:300]}"
        if r.status_code in (429, 503) and attempt == 0:
            if chosen_model == "deepseek-v4-flash":
                chosen_model = "deepseek-v4-pro"  # fallback to pro
            import time; time.sleep(1.5)
            continue
        return {"_error": last_err}

    return {"_error": last_err}


# ─── 工具函数 ─────────────────────────────────────────────────────────
# TOPIC = 面试范围/题材（决定问什么）。和 STYLE（面试官人设/形式）正交。
# 默认 general：全方位、从零、不绑定候选人具体项目。myproj 才挖 Army 等。
TOPIC_HINTS = {
    "general": ("FULL-SPECTRUM interview for a software / AI engineer. Rotate across areas across the "
                "session: a little behavioral (motivation, teamwork, a challenge), core CS, general "
                "backend engineering, AI/LLM basics, and one light system-design probe. Do NOT assume "
                "the candidate has any specific named project — ask questions anyone in the field should "
                "handle. The candidate is a BEGINNER learning from scratch, so favour foundational "
                "questions and build up gradually."),
    "myproj": ("Probe the candidate's OWN real projects (see CANDIDATE PROFILE — the Army agent-org "
               "pipeline, the LLM gateway, the agent runtime). STAR follow-ups, quantified impact, "
               "'I' not 'we'."),
    "ai": ("AI / LLM / agent FUNDAMENTALS as general knowledge: embeddings, tokens, context window, "
           "temperature, RAG, fine-tuning vs prompting, what an agent / tool-calling is, hallucination, "
           "evaluation, guardrails. Conceptual and beginner-friendly, not tied to any one project."),
    "backend": ("General backend / software engineering: REST APIs, databases & indexing, caching, "
                "message queues, concurrency, testing, debugging, deployment & CI/CD. Practical and "
                "foundational."),
    "sysdesign": ("System design at BEGINNER level: pick simple targets (URL shortener, rate limiter, "
                  "a chat app, a news feed) and walk the candidate through requirements → components → "
                  "trade-offs. Teach the framework, don't just grill."),
    "cs": ("Computer-science fundamentals as spoken interview questions: data structures & Big-O, OS "
           "(process vs thread, memory), networking (TCP vs UDP, HTTP, DNS), databases (ACID, indexing, "
           "transactions). Conceptual and foundational."),
    "behavioral": ("Pure BEHAVIORAL questions: tell me about yourself, a hard problem you solved, a "
                   "conflict, a failure and what you learned, why this role. Generic — works for any "
                   "candidate. Teach the STAR structure as you go."),
}

SYS_TEMPLATE = """You are a sharp, friendly interviewer for a {role} role, and at the SAME TIME the \
candidate's English-speaking coach. The candidate is an engineer whose ENGLISH SPEAKING is weak \
(around CEFR B1) AND who is still LEARNING the subject matter — so be encouraging, keep questions \
clear and concrete, and TEACH through your model answers and feedback.

Interview STYLE / persona: {style_hint}
Interview TOPIC / scope: {topic_hint}
Accent flavour: {accent} — use natural turns of phrase typical to that variety, but don't overdo it.

Rules:
- Ask ONE question at a time, concise and human. Never reuse the same question stem.
- Calibrate difficulty to a BEGINNER who wants to learn from scratch; start easy, build up.
"""


def _extract_json(text: str):
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{": depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try: return json.loads(text[start:i + 1])
                except json.JSONDecodeError: return None
    return None


def tts_voice_b64(text: str, voice: str) -> Optional[str]:
    """指定 voice 调 tts-edge 生成 mp3 → base64。失败返 None。"""
    if not TTS_EDGE.exists():
        return None
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        out = f.name
    try:
        r = subprocess.run(
            [str(TTS_EDGE), "--text", text, "--out", out, "--voice", voice],
            capture_output=True, timeout=60,
        )
        if r.returncode != 0:
            return None
        with open(out, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    except Exception:
        return None
    finally:
        try: os.remove(out)
        except OSError: pass


def tts_to_base64(text: str, accent: str) -> Optional[str]:
    """面试官提问用：按 accent 随机挑一个声线。"""
    import random
    return tts_voice_b64(text, random.choice(ACCENT_VOICES.get(accent, ACCENT_VOICES["british"])))


def spar_voice(accent: str, role: str) -> str:
    """对练模式：面试官用所选口音主声线，候选人用对比声线（不同性别/口音）以便区分。"""
    interviewer = ACCENT_VOICES.get(accent, ACCENT_VOICES["british"])[0]
    if role == "candidate":
        return "british-f" if interviewer not in ("british-f", "indian-f") else "british"
    return interviewer


def build_sys(role, style, accent, topic="general"):
    # 用 concat 拼 PROFILE/QBANK，避免 .format 解析到其中可能出现的 {} 花括号
    head = SYS_TEMPLATE.format(
        role=role, style_hint=STYLE_HINTS.get(style, STYLE_HINTS["mixed"]),
        topic_hint=TOPIC_HINTS.get(topic, TOPIC_HINTS["general"]), accent=accent,
    )
    if topic == "myproj":
        head += ("\nCANDIDATE PROFILE (use ONLY to ground project questions):\n" + PROFILE +
                 "\n\nQUESTION BANK (inspiration, do NOT read verbatim):\n" + QBANK + "\n")
    return head


# 每题反馈/范答共用的 JSON 片段：score + 候选人答案改写 + 标准范答 + 要点 + 错误 + 教练
_FEEDBACK_SCHEMA = (
    '"feedback": {'
    '"score": <0-10 int>, '
    '"rewrite": "<rewrite THE CANDIDATE\'S OWN answer in fluent native interview English; keep his facts. If the answer was empty/garbled, set to null>", '
    '"model_answer": "<a STRONG, natural, concise model answer to the QUESTION that a good native candidate would give, 3-6 sentences — this teaches the learner what good looks like>", '
    '"key_points_zh": ["<中文：一个好答案应覆盖的要点，最多4条>", ...], '
    '"errors": ["<具体语法/用词错误，中文，原错→改法；没有就空数组>", ...], '
    '"coach_zh": "<1-2 句中文教练点评>"'
    '}'
)


def turn_prompt(role, style, accent, transcript, last_answer, n, idx, topic="general"):
    head = build_sys(role, style, accent, topic)
    if last_answer is None:
        task = (
            f"This is the START of a {n}-question interview. Output ONLY a JSON object:\n"
            '{"feedback": null, "question": "<your first interview question in English>", '
            '"question_zh": "<one-line 中文 释义>"}'
        )
    else:
        closing = idx >= n
        nextq = ('"question": null, "question_zh": null' if closing
                 else '"question": "<next English question>", "question_zh": "<一行中文释义>"')
        task = (
            "The candidate just answered. EVALUATE the answer as English coach AND interviewer (and "
            "always include a model_answer so the learner sees the ideal), then "
            + ("END the interview (no next question)." if closing else "ask the NEXT question.")
            + "\nOutput ONLY a JSON object:\n"
            "{" + _FEEDBACK_SCHEMA + ", " + nextq + "}\n"
            f"Transcript so far:\n{transcript}\n\nCandidate's latest answer:\n{last_answer}"
        )
    return head + "\n\n" + task


def skip_prompt(role, style, accent, transcript, question, n, idx, topic="general"):
    """候选人跳过本题 → 直接给范答（教学），并出下一题。"""
    head = build_sys(role, style, accent, topic)
    closing = idx >= n
    nextq = ('"question": null, "question_zh": null' if closing
             else '"question": "<next English question>", "question_zh": "<一行中文释义>"')
    task = (
        "The candidate SKIPPED this question because they don't know how to answer — they want to "
        "LEARN. Do NOT score. Teach them: give a strong model answer + 中文 讲解, then "
        + ("END the interview (no next question)." if closing else "ask the NEXT question.")
        + "\nOutput ONLY a JSON object:\n"
        '{"feedback": {'
        '"skipped": true, '
        '"model_answer": "<a strong, natural model answer to the question, 3-6 sentences>", '
        '"model_answer_zh": "<上面范答的中文翻译/讲解>", '
        '"key_points_zh": ["<中文：好答案的要点，最多4条>", ...], '
        '"vocab": ["<地道英文表达 + 中文注，最多5条>", ...]'
        "}, " + nextq + "}\n"
        f"Transcript so far:\n{transcript}\n\nThe question being skipped:\n{question}"
    )
    return head + "\n\n" + task


def spar_prompt(role, style, accent, topic, rounds):
    """AI 对练观摩：生成完整 面试官×候选人 双人对话（教学样例）。"""
    head = build_sys(role, style, accent, topic)
    return head + (
        f"\n\nGenerate a realistic MOCK-INTERVIEW DIALOGUE between an INTERVIEWER and a strong "
        f"CANDIDATE for this role/topic — exactly {rounds} question→answer rounds "
        f"({rounds * 2} turns total), alternating, STARTING with the interviewer. The candidate gives "
        "STRONG, natural, native-level but realistic spoken answers (3-6 sentences each) — these are "
        "TEACHING EXAMPLES for an English learner, so they should be clear and idiomatic, not rambling. "
        "Vary the questions to cover the topic well. Output ONLY a JSON object:\n"
        '{"dialogue": [{"role": "interviewer", "en": "<English>", "zh": "<faithful 中文 translation>"}, '
        '{"role": "candidate", "en": "<English>", "zh": "<中文 translation>"}, ...]}'
    )


def summary_prompt(role, style, accent, transcript, topic="general"):
    head = build_sys(role, style, accent, topic)
    return head + (
        "\n\nThe interview is OVER. Final debrief. Output ONLY a JSON object:\n"
        '{"cefr": "<spoken-English CEFR e.g. B1+>", '
        '"verdict_zh": "<2-3 句中文总评>", '
        '"strengths": ["<中文，最多3条>"], '
        '"weaknesses": ["<中文，最多3条>"], '
        '"vocab": ["<面试地道英文表达，带中文注，最多8条>"], '
        '"action_items": ["<中文，下次练什么，最多4条>"]}\n'
        f"Full transcript:\n{transcript}"
    )


# ─── FastAPI ──────────────────────────────────────────────────────────
app = FastAPI(title="english-interview-web")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "X-Auth-Token"],
)

# ─── 鉴权：所有 /api/* 除 /api/health 之外都需 X-Auth-Token 头 ─────────
INTERVIEW_TOKEN = os.environ.get("INTERVIEW_TOKEN", "")
OPEN_PATHS = {"/api/health"}


@app.middleware("http")
async def require_token(request: Request, call_next):
    # OPTIONS = CORS preflight，浏览器不会带自定义 header；放行交给 CORSMiddleware 答
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if (path.startswith("/api/") and path not in OPEN_PATHS) and INTERVIEW_TOKEN:
        supplied = request.headers.get("x-auth-token") or request.query_params.get("t") or ""
        if supplied != INTERVIEW_TOKEN:
            return JSONResponse(status_code=401, content={"detail": "unauthorized"})
    return await call_next(request)


class StartReq(BaseModel):
    style: str = "mixed"
    accent: str = "british"
    topic: str = "general"
    role: str = "AI Agent Engineer (remote / overseas team)"
    questions: int = 6
    model: str = ""


class SummaryReq(BaseModel):
    transcript: str
    style: str = "mixed"
    accent: str = "british"
    topic: str = "general"
    role: str = "AI Agent Engineer (remote / overseas team)"
    model: str = ""


@app.get("/")
def index():
    """同域托管前端。不在 /api/ 下 → 不被 token 中间件拦（页面要先能打开再填 token）。"""
    if FRONTEND_HTML.exists():
        return FileResponse(str(FRONTEND_HTML), media_type="text/html",
                            headers={"Cache-Control": "no-cache"})
    raise HTTPException(status_code=404, detail="frontend index.html 未部署到服务器")


@app.get("/app.js")
def app_js():
    """预编译后的前端逻辑（由 app.src.jsx → build.sh 生成），no-cache 便于更新即时生效。"""
    if APP_JS.exists():
        return FileResponse(str(APP_JS), media_type="application/javascript",
                            headers={"Cache-Control": "no-cache"})
    raise HTTPException(status_code=404, detail="app.js 未部署（在本地跑 ./build.sh 再部署）")


# 第三方库（react / react-dom / tailwind）同域托管；可长缓存（内容固定）。
if VENDOR_DIR.is_dir():
    app.mount("/vendor", StaticFiles(directory=str(VENDOR_DIR)), name="vendor")


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "tts_edge": TTS_EDGE.exists(),
        "claude_cli": subprocess.run(["which", "claude"], capture_output=True).returncode == 0,
        "profile_loaded": bool(PROFILE),
        "qbank_loaded": bool(QBANK),
        "auth_required": bool(INTERVIEW_TOKEN),
        "frontend_html": FRONTEND_HTML.exists(),
    }


@app.post("/api/start")
def start(req: StartReq):
    prompt = turn_prompt(req.role, req.style, req.accent, "", None, req.questions, 0, req.topic)
    resp = call_llm(prompt, req.model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])
    q = resp.get("question") or ""
    audio = tts_to_base64(q, req.accent) if q else None
    return {**resp, "audio_b64": audio}


@app.post("/api/turn")
async def turn(
    audio: UploadFile = File(...),
    style: str = Form("mixed"),
    accent: str = Form("british"),
    role: str = Form("AI Agent Engineer (remote / overseas team)"),
    questions: int = Form(6),
    idx: int = Form(1),  # 1-based：刚答的是第 idx 题
    transcript: str = Form(""),
    current_question: str = Form(""),
    topic: str = Form("general"),
    model: str = Form(""),
):
    """收音频 → STT → 拼接 transcript → claude 评分+出下一题 → TTS。返回 JSON。"""
    # 1) STT
    data = await audio.read()
    if not data or len(data) < 1024:  # < 1KB 一般是空录音
        raise HTTPException(status_code=400, detail="录音太短或为空，请再试一次")
    in_suffix = Path(audio.filename or "a.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=in_suffix, delete=False) as f:
        f.write(data)
        in_path = f.name
    # 用 ffmpeg 强解码 → 16kHz mono wav，避免 webm/mp4 容器残缺导致 av 直接 EOF
    wav_path = in_path.replace(in_suffix, ".wav")
    try:
        conv = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-nostdin",
             "-i", in_path, "-ac", "1", "-ar", "16000", "-f", "wav", wav_path],
            capture_output=True, timeout=30,
        )
        if conv.returncode != 0 or not os.path.exists(wav_path):
            raise HTTPException(status_code=400,
                detail=f"音频解码失败（可能空录音）: {conv.stderr.decode('utf-8','ignore')[:300]}")
        model_w = await get_whisper()
        segments, info = model_w.transcribe(
            wav_path, language="en", beam_size=5, vad_filter=True,
            initial_prompt=WHISPER_PROMPT,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="STT 超时")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT 失败: {e}")
    finally:
        for p in (in_path, wav_path):
            try: os.remove(p)
            except OSError: pass

    if not text:
        text = "(no speech detected)"

    # 2+3) 评分 + 下一题 + TTS（与 /api/turn-text 共用）
    return evaluate_answer(text, style, accent, role, questions, idx,
                           transcript, current_question, model, stt_source="whisper", topic=topic)


def evaluate_answer(text, style, accent, role, questions, idx,
                    transcript, current_question, model, stt_source, topic="general"):
    """拿到答案文本后：拼 transcript → LLM 评分+出下一题 → TTS。

    被两条路共用：/api/turn（whisper 兜底转写后）和 /api/turn-text（前端浏览器
    实时转写直接传文本，跳过音频上传 + ffmpeg + whisper）。
    """
    text = (text or "").strip() or "(no speech detected)"
    updated_transcript = transcript + f"\nQ: {current_question}\nA: {text}\n"
    prompt = turn_prompt(role, style, accent, updated_transcript, text, questions, idx, topic)
    resp = call_llm(prompt, model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])

    next_q = resp.get("question") or ""
    audio_b64 = tts_to_base64(next_q, accent) if next_q else None

    return {
        "stt_text": text,
        "stt_source": stt_source,
        "feedback": resp.get("feedback"),
        "question": next_q or None,
        "question_zh": resp.get("question_zh"),
        "audio_b64": audio_b64,
        "transcript": updated_transcript,
    }


class TurnTextReq(BaseModel):
    text: str
    style: str = "mixed"
    accent: str = "british"
    topic: str = "general"
    role: str = "AI Agent Engineer (remote / overseas team)"
    questions: int = 6
    idx: int = 1  # 1-based：刚答的是第 idx 题
    transcript: str = ""
    current_question: str = ""
    model: str = ""


@app.post("/api/turn-text")
def turn_text(req: TurnTextReq):
    """主路径：前端浏览器实时 STT（Web Speech）已转好文本，直接传过来评分。

    跳过音频上传 / ffmpeg / whisper —— 延迟和服务器负载都远低于 /api/turn，
    且 Chrome 走 Google 引擎的转写准确率远高于服务器 tiny/base.en。
    """
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="空转写文本")
    return evaluate_answer(text, req.style, req.accent, req.role, req.questions,
                           req.idx, req.transcript, req.current_question, req.model,
                           stt_source="browser", topic=req.topic)


class SkipReq(BaseModel):
    style: str = "mixed"
    accent: str = "british"
    topic: str = "general"
    role: str = "AI Agent Engineer (remote / overseas team)"
    questions: int = 6
    idx: int = 1
    transcript: str = ""
    current_question: str = ""
    model: str = ""


@app.post("/api/skip")
def skip(req: SkipReq):
    """跳过本题 → 直接给范答（教学），不评分，出下一题 + TTS。"""
    q = (req.current_question or "").strip()
    prompt = skip_prompt(req.role, req.style, req.accent, req.transcript, q,
                         req.questions, req.idx, req.topic)
    resp = call_llm(prompt, req.model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])
    fb = resp.get("feedback") or {}
    # transcript 里把范答记成这一题的答案，保证后续追问有上下文
    model_ans = fb.get("model_answer") or ""
    updated_transcript = req.transcript + f"\nQ: {q}\nA (model, skipped): {model_ans}\n"
    next_q = resp.get("question") or ""
    audio_b64 = tts_to_base64(next_q, req.accent) if next_q else None
    return {
        "stt_text": "(已跳过 · 看范答)",
        "stt_source": "skip",
        "feedback": fb,
        "question": next_q or None,
        "question_zh": resp.get("question_zh"),
        "audio_b64": audio_b64,
        "transcript": updated_transcript,
    }


class SparReq(BaseModel):
    style: str = "mixed"
    accent: str = "british"
    topic: str = "general"
    role: str = "AI Agent Engineer (remote / overseas team)"
    rounds: int = 6
    model: str = ""


@app.post("/api/spar")
def spar(req: SparReq):
    """AI 对练观摩：一次性生成完整 面试官×候选人 双人对话（文本，前端逐句配 TTS 播）。"""
    rounds = max(2, min(12, int(req.rounds or 6)))
    prompt = spar_prompt(req.role, req.style, req.accent, req.topic, rounds)
    resp = call_llm(prompt, req.model, read_timeout=120)  # 多轮对话生成较慢
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])
    dialogue = resp.get("dialogue") or []
    if not isinstance(dialogue, list) or not dialogue:
        raise HTTPException(status_code=502, detail="对话生成失败（空）")
    return {"dialogue": dialogue}


class TTSReq(BaseModel):
    text: str
    accent: str = "british"
    role: str = ""   # "interviewer" | "candidate" | "" (随机)


@app.post("/api/tts")
def tts(req: TTSReq):
    """文本 → mp3 base64。对练模式逐句调用：面试官/候选人用不同声线区分。"""
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="空文本")
    if req.role in ("interviewer", "candidate"):
        voice = spar_voice(req.accent, req.role)
    else:
        import random
        voice = random.choice(ACCENT_VOICES.get(req.accent, ACCENT_VOICES["british"]))
    b64 = tts_voice_b64(text, voice)
    if not b64:
        raise HTTPException(status_code=500, detail="TTS 生成失败")
    return {"audio_b64": b64, "voice": voice}


@app.post("/api/summary")
def summary(req: SummaryReq):
    prompt = summary_prompt(req.role, req.style, req.accent, req.transcript, req.topic)
    resp = call_llm(prompt, req.model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])
    return resp


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8765")))
