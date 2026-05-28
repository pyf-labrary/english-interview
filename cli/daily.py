#!/usr/bin/env python3
"""daily.py — 每日 30-min 英文面试训练入口（按 6 周课表自动挑当天 routine）.

用法：
  ./daily.py             # 跑今天该练的（自动识别第几天 + 今日重点）
  ./daily.py --plan      # 只看课表，不练
  ./daily.py --day 12    # 强制按第 12 天的内容练
  ./daily.py --reset     # 重置开始日期为今天（重新开始 6 周计划）
  ./daily.py --shadow    # 只跑 shadowing（听 5 个问题 + 跟读，不做完整面试）

每天 routine 默认 ≈30 分钟：
  ① 5 min   听力暖身（tts-edge 朗读 3 道当天 style 的题，候选跟读）
  ② 20 min  4 题模拟面试（interview.py，当天的 style + accent）
  ③ 5 min   背 5 个英式/印式表达（从 question_bank.md「五、」抽）

完成后写 .state.json + 自动 --progress 跑一遍看趋势。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = HERE / ".state.json"
BANK = HERE / "question_bank.md"
TTS_EDGE = os.path.expanduser("~/claw/bin/tts-edge")
INTERVIEW = HERE / "interview.py"

# 6 周课表：每天 (style, accent, n_questions, focus_note)
PLAN = [
    # Week 1 — 适应：让耳朵和嘴打开
    ("strengths", "british",   4, "W1·D1 暖身：4 道 strengths 题，慢一点没关系"),
    ("behavioral","british",   4, "W1·D2 把 Army 故事讲一次（STAR 四件套）"),
    ("behavioral","british",   4, "W1·D3 把 LLM gateway 故事讲一次"),
    ("strengths", "british-f", 5, "W1·D4 换女声 RP，节奏稍快"),
    ("behavioral","british",   5, "W1·D5 跨文化/跨时区合作题"),
    ("mixed",     "british",   5, "W1·D6 混合面 5 题"),
    ("mixed",     "indian",    4, "W1·D7 第一次印度口音，纯听适应"),

    # Week 2 — STAR 故事库打磨
    ("behavioral","british",   5, "W2·D1 Top 5 故事之一：最难的技术问题"),
    ("behavioral","british",   5, "W2·D2 影响力 / 跨部门沟通"),
    ("behavioral","indian",    5, "W2·D3 印度音 STAR 5 题"),
    ("behavioral","british-f", 5, "W2·D4 incident handling 故事"),
    ("behavioral","british",   5, "W2·D5 推回 / 反对意见 故事"),
    ("strengths", "mixed",     6, "W2·D6 混口音 strengths 6 题"),
    ("behavioral","british",   6, "W2·D7 周复盘场，全 STAR"),

    # Week 3 — HireVue 单向自录练习（无对话节奏）
    ("strengths", "british",   6, "W3·D1 HireVue 模拟：30s 准备+90s 答"),
    ("strengths", "indian",    6, "W3·D2 HireVue 印度音版"),
    ("strengths", "british-f", 6, "W3·D3 HireVue 女声"),
    ("strengths", "mixed",     8, "W3·D4 8 题 HireVue 强度"),
    ("behavioral","british",   6, "W3·D5 转回对话面，practise warmth"),
    ("strengths", "mixed",     8, "W3·D6 8 题 HireVue 二刷"),
    ("mixed",     "mixed",     6, "W3·D7 周末综合 6 题"),

    # Week 4 — HSBC strengths-based + values 体感
    ("hsbc", "british",   6, "W4·D1 HSBC 风格，6 题，映射 values"),
    ("hsbc", "british-f", 6, "W4·D2 HSBC 女经理风格"),
    ("hsbc", "indian",    6, "W4·D3 HSBC 印度同事风格"),
    ("hsbc", "british",   7, "W4·D4 risk-aware / regulated industry 题"),
    ("hsbc", "mixed",     7, "W4·D5 customer-first 题"),
    ("hsbc", "british",   8, "W4·D6 满 8 题，配速 HireVue"),
    ("hsbc", "mixed",     6, "W4·D7 周末复盘"),

    # Week 5 — tech / system design 深挖
    ("tech", "british",   4, "W5·D1 LLM gateway 深挖（4 题大 + 多追问）"),
    ("tech", "british",   4, "W5·D2 Agent runtime 深挖"),
    ("tech", "indian",    4, "W5·D3 印度音 tech，listening 强化"),
    ("tech", "british-f", 4, "W5·D4 system design：multi-tenant gateway"),
    ("tech", "british",   4, "W5·D5 incident / observability"),
    ("hsbc", "british",   5, "W5·D6 tech×bank：合规 / auditability"),
    ("mixed","mixed",     6, "W5·D7 周末综合"),

    # Week 6 — 终面模拟 + reverse 问题
    ("mixed","british",   8, "W6·D1 完整 manager 面 8 题"),
    ("hsbc", "british",   8, "W6·D2 完整 HSBC 终面 8 题"),
    ("hsbc", "indian",    8, "W6·D3 印度 senior 风格 8 题"),
    ("hsbc", "mixed",     8, "W6·D4 panel 模拟（混口音）"),
    ("tech", "british",   5, "W6·D5 tech 收尾"),
    ("hsbc", "british-f", 8, "W6·D6 最后一次满压力"),
    ("mixed","mixed",     6, "W6·D7 收官 + 准备 reverse questions"),
]

ACCENT_MAP_TTS = {"british": "british", "british-f": "british-f",
                  "indian": "indian", "indian-f": "indian-f", "mixed": "british"}


def _play_audio_file(path: str):
    """跨平台播 mp3。WSL/Pulse 优先走 ffmpeg→paplay pipe（aplay/sox 走 ALSA 在 WSL 上崩）。"""
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
    for player in ("ffplay", "mpv", "afplay", "play"):
        if subprocess.run(["which", player], capture_output=True).returncode == 0:
            flags = (["-nodisp", "-autoexit", "-loglevel", "quiet"] if player == "ffplay"
                     else ["-q", "0"] if player == "play"
                     else [])
            subprocess.run([player, *flags, path], capture_output=True)
            return


def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"start": dt.date.today().isoformat(), "completed_days": []}


def save_state(s):
    STATE.write_text(json.dumps(s, indent=2))


def day_index(state):
    """从 start 起的第几天（1-based），上限 = PLAN 长度。"""
    start = dt.date.fromisoformat(state["start"])
    delta = (dt.date.today() - start).days + 1
    return max(1, min(delta, len(PLAN)))


def warmup_listen(style, accent, n=3):
    """从题库抽 n 道当前 style 章节的题，tts-edge 朗读。候选可以跟读。"""
    if not BANK.exists() or not os.path.exists(TTS_EDGE):
        print("（题库或 tts-edge 不可用，跳过听力暖身）")
        return
    text = BANK.read_text(encoding="utf-8")
    section_map = {
        "strengths": "一、Strengths-based",
        "hsbc": "一、Strengths-based",
        "behavioral": "二、Behavioral",
        "tech": "三、Tech",
        "mixed": "二、Behavioral",
    }
    anchor = section_map.get(style, "二、Behavioral")
    # 抠出锚点后到下一个 ## 之间的内容，从中取编号项
    m = re.search(rf"##\s*{re.escape(anchor)}.*?(?=\n##\s|\Z)", text, re.S)
    pool = re.findall(r"^\d+\.\s+(.+?)$", m.group(0), re.M) if m else []
    if not pool:
        return
    picks = random.sample(pool, min(n, len(pool)))
    voice = ACCENT_MAP_TTS.get(accent, "british")

    print(f"\n🎧 听力暖身 · {n} 道题 · 口音 {accent}")
    print("─" * 60)
    for i, q in enumerate(picks, 1):
        print(f"\n  [{i}/{n}] {q}")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            out = f.name
        try:
            subprocess.run([TTS_EDGE, "--text", q, "--out", out, "--voice", voice],
                           capture_output=True, timeout=60)
            _play_audio_file(out)
            try:
                input("    跟读完按回车继续…")
            except (EOFError, KeyboardInterrupt):
                print("\n（跳过剩余暖身）")
                return
        finally:
            try: os.remove(out)
            except OSError: pass


def vocab_drill(n=5):
    """从题库「五、」节抽 n 个表达背一背。"""
    if not BANK.exists():
        return
    text = BANK.read_text(encoding="utf-8")
    m = re.search(r"##\s*五、英式.*?(?=\n##\s|\Z)", text, re.S)
    if not m:
        return
    items = re.findall(r"^- \*\"([^\"]+)\"\*\s*（([^）]+)）", m.group(0), re.M)
    if not items:
        return
    picks = random.sample(items, min(n, len(items)))
    print("\n📚 今日 5 个英式 / 印式表达")
    print("─" * 60)
    for en, zh in picks:
        print(f"  • \"{en}\"  ——  {zh}")
    print()


def show_plan():
    print("\n📋 6 周训练课表（共 42 天）")
    print("─" * 76)
    state = load_state()
    today = day_index(state)
    for i, (style, accent, n, note) in enumerate(PLAN, 1):
        mark = "●" if i in state["completed_days"] else ("◆" if i == today else "·")
        print(f"  {mark}  D{i:02d}  {style:10s}  {accent:10s}  {n}题   {note}")
    print("─" * 76)
    print(f"  ● 已完成 · ◆ 今天 · · 待做")
    print(f"  开始日: {state['start']} · 今天是第 {today} 天 · 已完成 {len(state['completed_days'])} 天\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true", help="只看课表，不开练")
    ap.add_argument("--day", type=int, help="按指定日号练（覆盖自动判定）")
    ap.add_argument("--reset", action="store_true", help="重置开始日期为今天")
    ap.add_argument("--shadow", action="store_true", help="只跑听力暖身，不做面试")
    ap.add_argument("--no-warmup", action="store_true", help="跳过听力暖身")
    ap.add_argument("--no-vocab", action="store_true", help="跳过结尾背词")
    ap.add_argument("--voice", action="store_true", default=True,
                    help="面试中朗读问题（默认开）")
    ap.add_argument("--no-voice", dest="voice", action="store_false")
    ap.add_argument("--model", default="sonnet")
    args = ap.parse_args()

    if args.reset:
        save_state({"start": dt.date.today().isoformat(), "completed_days": []})
        print("✓ 已重置开始日期为今天，从 D1 开始")

    state = load_state()
    if args.plan:
        show_plan()
        return

    d = args.day or day_index(state)
    style, accent, n, note = PLAN[d - 1]
    print(f"\n📅 今天是 Day {d} · {style} · {accent} · {n} 题")
    print(f"   {note}\n")

    if not args.no_warmup:
        warmup_listen(style, accent, n=3)

    if args.shadow:
        print("\n（--shadow 模式：跳过模拟面试）")
    else:
        cmd = ["python3", str(INTERVIEW), "--style", style, "--accent", accent,
               "-n", str(n), "--model", args.model]
        if args.voice:
            cmd.append("--voice")
        print(f"\n🎤 开始模拟面试  ({' '.join(cmd[1:])})")
        print("─" * 60)
        try:
            rc = subprocess.call(cmd)
        except KeyboardInterrupt:
            rc = 130
        if rc == 0 and d not in state["completed_days"]:
            state["completed_days"].append(d)
            save_state(state)
            print(f"\n✓ Day {d} 完成 · 已记录")

    if not args.no_vocab:
        vocab_drill(5)

    print("\n📈 进度速览")
    print("─" * 60)
    subprocess.call(["python3", str(INTERVIEW), "--progress"])

    # 友好提示
    done = len(state["completed_days"])
    total = len(PLAN)
    if done >= total:
        print(f"\n🎓 6 周课表已全部完成！可以正式投递了。")
    else:
        print(f"\n下一步：明天再跑 `./daily.py`，或 `./daily.py --plan` 看全图。")


if __name__ == "__main__":
    main()
