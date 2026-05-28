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
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── 路径 / 题库 / profile ────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
# 默认从相邻的 cli/ 加载 profile.md + question_bank.md（仓库自带）；env SRC_ROOT 可覆盖
SRC_ROOT = Path(os.environ.get("SRC_ROOT", str(HERE.parent / "cli")))
PROFILE = (SRC_ROOT / "profile.md").read_text(encoding="utf-8") if (SRC_ROOT / "profile.md").exists() else ""
QBANK = (SRC_ROOT / "question_bank.md").read_text(encoding="utf-8") if (SRC_ROOT / "question_bank.md").exists() else ""
# tts-edge：默认仓库根 ./bin/tts-edge；env TTS_EDGE 可覆盖
TTS_EDGE = Path(os.environ.get("TTS_EDGE", str(HERE.parent / "bin" / "tts-edge")))

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
# 默认 tiny.en：pyf 服务器 1.7G 内存，base.en 内存紧张
# 想换更大模型：export WHISPER_SIZE=base.en / small.en
_whisper_model = None
_whisper_lock = asyncio.Lock()


async def get_whisper():
    global _whisper_model
    async with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            size = os.environ.get("WHISPER_SIZE", "tiny.en")
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
SYS_TEMPLATE = """You are a sharp, friendly technical interviewer for a REMOTE / overseas \
AI-Agent engineering role, and simultaneously the candidate's English coach. The \
candidate is a strong engineer whose ENGLISH SPEAKING is the weak point (CEF B1 \
starting). Run a realistic interview AND upgrade his English.

Interview for role: {role}.
Interview STYLE: {style_hint}
Accent flavour: {accent} — use natural turns of phrase typical to that variety, \
but don't overdo it.

Rules:
- Ask ONE question at a time. Probe candidate's REAL projects (Army pipeline, LLM \
gateway, agent runtime). STAR follow-ups. Quantified impact. "I" not "we".
- Keep questions concise and human. Do NOT reuse the same question stem twice.

CANDIDATE PROFILE:
{profile}

QUESTION BANK (inspiration, do NOT read verbatim):
{qbank}
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


def tts_to_base64(text: str, accent: str) -> Optional[str]:
    """调 tts-edge 生成 mp3 → base64。失败返 None。"""
    import random
    voice = random.choice(ACCENT_VOICES.get(accent, ACCENT_VOICES["british"]))
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


def build_sys(role: str, style: str, accent: str) -> str:
    return SYS_TEMPLATE.format(
        role=role, style_hint=STYLE_HINTS.get(style, STYLE_HINTS["mixed"]),
        accent=accent, profile=PROFILE, qbank=QBANK,
    )


def turn_prompt(role, style, accent, transcript, last_answer, n, idx):
    head = build_sys(role, style, accent)
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
            "The candidate just answered. EVALUATE the answer as English coach AND interviewer, then "
            + ("END the interview (no next question)." if closing else "ask the NEXT question.")
            + "\nOutput ONLY a JSON object:\n"
            '{"feedback": {'
            '"score": <0-10 int>, '
            '"rewrite": "<rewrite in fluent native interview-grade English; keep his real facts>", '
            '"errors": ["<具体语法/用词错误，中文，原错+改法>", ...], '
            '"coach_zh": "<1-2 句中文教练点评>"'
            "}, " + nextq + "}\n"
            f"Transcript so far:\n{transcript}\n\nCandidate's latest answer:\n{last_answer}"
        )
    return head + "\n\n" + task


def summary_prompt(role, style, accent, transcript):
    head = build_sys(role, style, accent)
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
    role: str = "AI Agent Engineer (remote / overseas team)"
    questions: int = 6
    model: str = ""


class SummaryReq(BaseModel):
    transcript: str
    style: str = "mixed"
    accent: str = "british"
    role: str = "AI Agent Engineer (remote / overseas team)"
    model: str = ""


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "tts_edge": TTS_EDGE.exists(),
        "claude_cli": subprocess.run(["which", "claude"], capture_output=True).returncode == 0,
        "profile_loaded": bool(PROFILE),
        "qbank_loaded": bool(QBANK),
        "auth_required": bool(INTERVIEW_TOKEN),
    }


@app.post("/api/start")
def start(req: StartReq):
    prompt = turn_prompt(req.role, req.style, req.accent, "", None, req.questions, 0)
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
        segments, info = model_w.transcribe(wav_path, language="en", beam_size=1, vad_filter=True)
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

    # 2) Claude 评分 + 下一题
    updated_transcript = transcript + f"\nQ: {current_question}\nA: {text}\n"
    prompt = turn_prompt(role, style, accent, updated_transcript, text, questions, idx)
    resp = call_llm(prompt, model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])

    # 3) TTS 下一题
    next_q = resp.get("question") or ""
    audio_b64 = tts_to_base64(next_q, accent) if next_q else None

    return {
        "stt_text": text,
        "feedback": resp.get("feedback"),
        "question": next_q or None,
        "question_zh": resp.get("question_zh"),
        "audio_b64": audio_b64,
        "transcript": updated_transcript,
    }


@app.post("/api/summary")
def summary(req: SummaryReq):
    prompt = summary_prompt(req.role, req.style, req.accent, req.transcript)
    resp = call_llm(prompt, req.model)
    if "_error" in resp:
        raise HTTPException(status_code=502, detail=resp["_error"])
    return resp


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8765")))
