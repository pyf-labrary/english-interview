#!/usr/bin/env python3
"""english-interview — 模拟英文面试 + 实时纠错 agent（求职英语前置工程）.

为 pyf 投递「外企 / 远程」AI Agent 岗做英语口语/写作突击。面试官大脑走
`claude -p`（headless，免 API key），基于 profile.md 里的真实经历追问，
每答一题给：地道改写 + 错误点评（中文）+ 评分 + 追问。可选 --voice 朗读
问题练听力（tts-openai，账户撞 limit 时自动降级跳过）。

用法：
  ./interview.py                      # 混合面试，8 题，sonnet
  ./interview.py --mode behavioral    # 只考行为面（讲 army / gateway 故事）
  ./interview.py --mode technical -n 12
  ./interview.py --voice              # 朗读每道题（英音听力练习）
  ./interview.py --role "LLM Platform Engineer (remote)"

面试中输入 `skip` 跳过当前题，`quit` 提前结束并出总评。
session 落盘到 logs/session-YYYYmmdd-HHMMSS.md，可回看。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFILE = HERE / "profile.md"
QUESTION_BANK = HERE / "question_bank.md"
LOGDIR = HERE / "logs"

# 口音 → tts-edge voice 别名（详见 ~/claw/bin/tts-edge --list）
ACCENT_VOICES = {
    "british": ["british", "british-thomas"],         # 男声 RP × 2
    "british-f": ["british-f", "british-libby"],
    "indian": ["indian"],
    "indian-f": ["indian-f"],
    "mixed": ["british", "british-thomas", "british-f", "indian", "indian-f"],
}

# 面试风格 → 注入到 SYS prompt 的额外指示 + 题库筛选段
STYLE_HINTS = {
    "mixed": "Balance behavioral and technical questions. Mix STAR-style probes with system-design depth.",
    "hsbc": (
        "Behave like an HSBC / Standard Chartered / DBS hiring manager. Many questions should be "
        "STRENGTHS-BASED (what energises the candidate, natural reactions, real preferences). "
        "Map answers implicitly to HSBC's 8 values (value difference, succeed together, take "
        "responsibility, get it done, act with courage, act with integrity, see the future first, "
        "do the right thing for the customer). Probe risk awareness, regulated-industry mindset, "
        "auditability, cross-cultural / cross-timezone collaboration. NEVER reuse LeetCode-style "
        "puzzles. Accent flavour: British or Indian."
    ),
    "strengths": (
        "Run a STRENGTHS-BASED interview (HireVue style). Short, fast questions about what energises "
        "the candidate, what drains them, real examples of natural behaviour. Each question should be "
        "answerable in 60-90s. Probe authenticity, not rehearsed scripts."
    ),
    "tech": (
        "Run a TECHNICAL deep-dive. Focus on system design, trade-offs, failure modes, observability, "
        "scaling. Probe agent-runtime / LLM-gateway depth as per the candidate profile. Ask one big "
        "question and follow up 2-3 times like a real manager interview."
    ),
    "behavioral": (
        "Run a pure BEHAVIORAL interview. Every question must be a STAR probe. Push for quantified "
        "impact and crisp 'I' (not 'we') ownership. Drill into ambiguity, conflict, and trade-offs."
    ),
}

# ANSI
def c(s, code):
    return f"\033[{code}m{s}\033[0m" if sys.stdout.isatty() else s
BOLD = lambda s: c(s, "1")
CYAN = lambda s: c(s, "36")
GREEN = lambda s: c(s, "32")
YELLOW = lambda s: c(s, "33")
RED = lambda s: c(s, "31")
GREY = lambda s: c(s, "90")


def call_claude(prompt: str, model: str) -> dict:
    """跑 claude -p，在临时空目录执行以避开 CLAUDE.md 项目上下文，返回解析后的 JSON dict。"""
    with tempfile.TemporaryDirectory() as td:
        try:
            proc = subprocess.run(
                ["claude", "-p", "--output-format", "json",
                 "--model", model, "--max-turns", "1"],
                input=prompt, text=True, capture_output=True,
                cwd=td, timeout=180,
            )
        except subprocess.TimeoutExpired:
            return {"_error": "claude 调用超时（180s）"}
    if proc.returncode != 0:
        return {"_error": f"claude 退出码 {proc.returncode}: {proc.stderr[:400]}"}
    try:
        envelope = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"_error": f"无法解析 claude 输出: {proc.stdout[:300]}"}
    text = envelope.get("result", "")
    obj = _extract_json(text)
    if obj is None:
        return {"_error": f"模型未返回 JSON: {text[:300]}"}
    return obj


def _extract_json(text: str):
    """从模型文本里抠出第一个 JSON 对象（容忍 ```json 包裹和前后废话）。"""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def speak(text: str, accent: str = "british"):
    """朗读问题（英语听力练习）。优先 tts-edge（免 key，英/印音），失败兜底 tts-openai。"""
    import random
    voice_pool = ACCENT_VOICES.get(accent, ACCENT_VOICES["british"])
    voice = random.choice(voice_pool)

    tts_edge = os.path.expanduser("~/claw/bin/tts-edge")
    tts_openai = os.path.expanduser("~/claw/bin/tts-openai")
    out = tempfile.mktemp(suffix=".mp3")

    spoken = False
    if os.path.exists(tts_edge):
        try:
            r = subprocess.run(
                [tts_edge, "--text", text, "--out", out, "--voice", voice],
                capture_output=True, text=True, timeout=60,
            )
            spoken = (r.returncode == 0 and os.path.exists(out))
        except Exception:
            pass

    if not spoken and os.path.exists(tts_openai):
        try:
            r = subprocess.run(
                [tts_openai, "--text", text, "--out", out, "--voice", "ash",
                 "--instructions", f"Professional {accent.replace('-',' ')} accent recruiter, natural pace."],
                capture_output=True, text=True, timeout=60,
            )
            spoken = (r.returncode == 0 and os.path.exists(out))
        except Exception:
            pass

    if not spoken:
        try: os.remove(out)
        except OSError: pass
        return

    try:
        _play_audio_file(out)
    finally:
        try: os.remove(out)
        except OSError: pass


def _play_audio_file(path: str):
    """跨平台播 mp3。WSL/Pulse 优先走 ffmpeg→paplay pipe（aplay/sox 走 ALSA 在 WSL 上崩）。"""
    # WSLg / Linux + PulseAudio：ffmpeg 解码到 wav 喂 paplay
    if os.environ.get("PULSE_SERVER") or os.path.exists("/mnt/wslg/PulseServer"):
        if subprocess.run(["which", "ffmpeg"], capture_output=True).returncode == 0 and \
           subprocess.run(["which", "paplay"], capture_output=True).returncode == 0:
            ff = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error",
                                   "-i", path, "-f", "wav", "-"], stdout=subprocess.PIPE)
            subprocess.run(["paplay"], stdin=ff.stdout, capture_output=True)
            try: ff.stdout.close()
            except Exception: pass
            ff.wait()
            return
    # 其他系统 / 兜底
    for player in ("ffplay", "mpv", "afplay", "play"):
        if subprocess.run(["which", player], capture_output=True).returncode == 0:
            flags = (["-nodisp", "-autoexit", "-loglevel", "quiet"] if player == "ffplay"
                     else ["-q", "0"] if player == "play"
                     else [])
            subprocess.run([player, *flags, path], capture_output=True)
            return


SYS = """You are a sharp, friendly technical interviewer for a REMOTE / overseas \
AI-Agent engineering role, and simultaneously the candidate's English coach. The \
candidate is a strong engineer whose ENGLISH SPEAKING is the weak point (reading/\
writing ~CEF B1). Your job: run a realistic interview AND upgrade his English.

Interview for role: {role}.
Interview STYLE: {style_hint}
Accent flavour for your questions: {accent} (use natural turns of phrase typical \
to that variety of English — UK idioms like "walk me through" / "spot on" / \
"on the back of that" / "raise a flag", or Indian-English softeners like "kindly" \
/ "do the needful" — but don't overdo it).

Rules:
- Ask ONE question at a time. Questions must be answerable and grounded in the \
candidate's REAL profile below — probe his actual projects (Army pipeline, LLM \
gateway, agent runtime), ask STAR follow-ups, dig for quantified impact and crisp \
"I" (not "we") ownership.
- Keep questions concise and human, like a real interviewer (not a checklist bot).
- Do NOT reuse the same question stem twice in a session.

CANDIDATE PROFILE:
{profile}

QUESTION BANK (use as INSPIRATION — pick / adapt, do NOT just read verbatim):
{question_bank}
"""


def turn_prompt(role, style, accent, profile, qbank, transcript, last_answer, n, idx):
    """构造单轮 prompt：评上一答 + 出下一题。返回要求严格 JSON。"""
    head = SYS.format(
        role=role, style_hint=STYLE_HINTS.get(style, STYLE_HINTS["mixed"]),
        accent=accent, profile=profile, question_bank=qbank,
    )
    if last_answer is None:
        task = (
            f"This is the START of a {n}-question interview. Output ONLY a JSON object:\n"
            '{"feedback": null, "question": "<your first interview question in English>", '
            '"question_zh": "<one-line 中文 释义，帮候选人确认理解>"}'
        )
    else:
        closing = idx >= n
        nextq = (
            '"question": null, "question_zh": null'
            if closing else
            '"question": "<next English question>", "question_zh": "<一行中文释义>"'
        )
        task = (
            "The candidate just answered. First EVALUATE that answer as an English "
            "coach AND interviewer, then "
            + ("END the interview (no next question)." if closing
               else "ask the NEXT question.")
            + "\nOutput ONLY a JSON object:\n"
            '{"feedback": {'
            '"score": <0-10 int, content+communication>, '
            '"rewrite": "<the candidate answer rewritten in fluent, natural, '
            'interview-grade native English; keep his real facts>", '
            '"errors": ["<具体语法/用词/表达错误点评，中文，每条点出原错+改法>", ...], '
            '"coach_zh": "<1-2 句中文教练点评：内容是否到位、有没有 undersell、下次怎么答更强>"'
            "}, " + nextq + "}\n"
            f"Transcript so far:\n{transcript}\n\n"
            f"Candidate's latest answer:\n{last_answer}"
        )
    return head + "\n\n" + task


def summary_prompt(role, style, accent, profile, qbank, transcript):
    head = SYS.format(
        role=role, style_hint=STYLE_HINTS.get(style, STYLE_HINTS["mixed"]),
        accent=accent, profile=profile, question_bank=qbank,
    )
    return head + (
        "\n\nThe interview is OVER. Give a final debrief. Output ONLY a JSON object:\n"
        '{"cefr": "<rough spoken-English CEFR estimate, e.g. B1+>", '
        '"verdict_zh": "<2-3 句中文总评：这场面试整体表现、能不能撑外企/远程岗>", '
        '"strengths": ["<中文，最多3条>"], '
        '"weaknesses": ["<中文，最多3条，含英语+内容>"], '
        '"vocab": ["<面试该掌握的地道英文表达/句型，带中文注，最多8条>"], '
        '"action_items": ["<中文，下次练什么，最多4条>"]}\n'
        f"Full transcript:\n{transcript}"
    )


def hr(ch="─"):
    return GREY(ch * 64)


def render_feedback(fb):
    score = fb.get("score")
    bar = ("█" * int(score) + "░" * (10 - int(score))) if isinstance(score, int) else ""
    print(f"\n{BOLD('评分')} {YELLOW(bar)} {score}/10")
    rewrite = fb.get("rewrite")
    if rewrite:
        print(f"\n{BOLD(GREEN('地道改写'))}\n  {rewrite}")
    errors = fb.get("errors") or []
    if errors:
        print(f"\n{BOLD(RED('错误点评'))}")
        for e in errors:
            print(f"  • {e}")
    coach = fb.get("coach_zh")
    if coach:
        print(f"\n{BOLD(CYAN('教练'))} {coach}")


def show_progress():
    """扫 logs/session-*.md，画一张分数趋势 ASCII 图 + 关键指标。"""
    if not LOGDIR.exists():
        print(GREY("尚无 session 记录"))
        return
    sessions = sorted(LOGDIR.glob("session-*.md"))
    if not sessions:
        print(GREY("尚无 session 记录"))
        return
    rows = []
    for p in sessions:
        text = p.read_text(encoding="utf-8", errors="ignore")
        scores = [int(m) for m in re.findall(r"评分:\s*(\d+)/10", text)]
        cefr_m = re.search(r"CEFR:\s*([A-C][12][+\-]?)", text)
        if scores:
            rows.append((p.stem, scores, sum(scores) / len(scores), cefr_m.group(1) if cefr_m else "-"))

    if not rows:
        print(GREY("session 文件里没有评分行"))
        return
    print(BOLD("\n  📈 训练进度"))
    print(hr())
    for stem, scores, avg, cefr in rows:
        bar = "█" * int(round(avg)) + "░" * (10 - int(round(avg)))
        print(f"  {stem[-13:]}  {YELLOW(bar)}  avg {avg:4.1f}  CEFR {cefr}  (n={len(scores)})")
    overall = [s for _, ss, _, _ in rows for s in ss]
    print(hr())
    print(f"  共 {len(rows)} 场 · {len(overall)} 题 · 总均分 {BOLD(f'{sum(overall)/len(overall):.2f}')}/10")
    if len(rows) >= 2:
        delta = rows[-1][2] - rows[0][2]
        arrow = "↑" if delta > 0 else ("↓" if delta < 0 else "→")
        col = GREEN if delta > 0 else (RED if delta < 0 else GREY)
        print(f"  首→末: {rows[0][2]:.1f} {arrow} {rows[-1][2]:.1f}  ({col(f'{delta:+.1f}')})")
    print()


def main():
    ap = argparse.ArgumentParser(description="模拟英文面试 + 纠错 agent")
    ap.add_argument("--style", choices=list(STYLE_HINTS.keys()), default="mixed",
                    help="面试风格：mixed/hsbc/strengths/tech/behavioral")
    ap.add_argument("--mode", dest="style", help=argparse.SUPPRESS)  # 老 flag 兼容
    ap.add_argument("--accent", choices=list(ACCENT_VOICES.keys()), default="british",
                    help="面试官口音：british/british-f/indian/indian-f/mixed")
    ap.add_argument("-n", "--questions", type=int, default=8)
    ap.add_argument("--role", default="AI Agent Engineer (remote / overseas team)")
    ap.add_argument("--model", default="sonnet", help="claude 模型别名 (sonnet/opus/haiku) 或全名")
    ap.add_argument("--voice", action="store_true", help="朗读每道题（英语听力练习）")
    ap.add_argument("--progress", action="store_true", help="显示历次评分趋势后退出")
    args = ap.parse_args()

    if args.progress:
        show_progress()
        return

    if not PROFILE.exists():
        sys.exit(f"缺少 {PROFILE}")
    profile = PROFILE.read_text(encoding="utf-8")
    qbank = QUESTION_BANK.read_text(encoding="utf-8") if QUESTION_BANK.exists() else "(no bank)"
    # 老 flag 兼容：technical/behavioral → 新风格
    if args.style == "technical": args.style = "tech"
    LOGDIR.mkdir(exist_ok=True)
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    logpath = LOGDIR / f"session-{ts}.md"
    log = [f"# 英文模拟面试 · {ts}", f"- 角色: {args.role}",
           f"- 风格: {args.style} · 口音: {args.accent} · {args.questions} 题",
           f"- 模型: {args.model}", ""]

    print(hr("━"))
    print(BOLD(f"  英文模拟面试 · {args.role}"))
    print(f"  {args.style} · {args.accent} 口音 · {args.questions} 题 · 输入 {BOLD('quit')} 提前结束 / {BOLD('skip')} 跳题")
    print(hr("━"))

    transcript = ""
    last_answer = None
    idx = 0
    while idx < args.questions:
        prompt = turn_prompt(args.role, args.style, args.accent, profile, qbank,
                             transcript, last_answer, args.questions, idx)
        if idx == 0:
            print(GREY("\n（面试官准备问题中…）"))
        resp = call_claude(prompt, args.model)
        if "_error" in resp:
            print(RED(f"\n[错误] {resp['_error']}"))
            sys.exit(1)

        fb = resp.get("feedback")
        if fb:
            render_feedback(fb)
            log += [f"### 反馈 (Q{idx})", f"- 评分: {fb.get('score')}/10",
                    f"- 改写: {fb.get('rewrite','')}",
                    "- 错误: " + "; ".join(fb.get("errors") or []),
                    f"- 教练: {fb.get('coach_zh','')}", ""]

        q = resp.get("question")
        if not q:  # 面试官主动收尾
            break
        idx += 1
        print(f"\n{hr()}")
        print(f"{BOLD(CYAN(f'Q{idx}.'))} {BOLD(q)}")
        if resp.get("question_zh"):
            print(GREY(f"     {resp['question_zh']}"))
        if args.voice:
            speak(q, args.accent)
        log += [f"### Q{idx}", f"**{q}**", f"_{resp.get('question_zh','')}_", ""]

        try:
            ans = input(f"\n{GREEN('你的回答 ▶ ')}").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n" + GREY("（中断，出总评）"))
            ans = "quit"
        if ans.lower() in ("quit", "q", "exit"):
            log += [f"(Q{idx} 提前结束)", ""]
            break
        if ans.lower() in ("skip", "s", ""):
            last_answer = None  # 不评分，下一轮重新出题
            transcript += f"\nQ: {q}\nA: (skipped)\n"
            log += [f"A{idx}: (skipped)", ""]
            continue
        last_answer = ans
        transcript += f"\nQ: {q}\nA: {ans}\n"
        log += [f"A{idx}: {ans}", ""]

    # 总评
    print(f"\n{hr('━')}")
    print(GREY("（生成总评中…）"))
    summ = call_claude(summary_prompt(args.role, args.style, args.accent, profile, qbank, transcript), args.model)
    if "_error" in summ:
        print(RED(f"（总评生成失败，跳过：{summ['_error']}）"))
    else:
        print(f"\n{BOLD('口语水平估计')} {YELLOW(summ.get('cefr','?'))}")
        print(f"{BOLD('总评')} {summ.get('verdict_zh','')}")
        for title, key, col in [("优势", "strengths", GREEN), ("待补", "weaknesses", RED),
                                ("地道表达/句型", "vocab", CYAN), ("行动项", "action_items", YELLOW)]:
            items = summ.get(key) or []
            if items:
                print(f"\n{BOLD(col(title))}")
                for it in items:
                    print(f"  • {it}")
        log += ["", "## 总评", f"- CEFR: {summ.get('cefr','')}", f"- 总评: {summ.get('verdict_zh','')}",
                "- 优势: " + "; ".join(summ.get("strengths") or []),
                "- 待补: " + "; ".join(summ.get("weaknesses") or []),
                "- 地道表达: " + "; ".join(summ.get("vocab") or []),
                "- 行动项: " + "; ".join(summ.get("action_items") or [])]
    logpath.write_text("\n".join(log), encoding="utf-8")
    print(f"\n{GREY('session 已存：')}{logpath}")


if __name__ == "__main__":
    main()
