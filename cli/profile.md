# Candidate Profile — Pan Yifeng (for the interviewer agent)

Use these REAL facts to probe deeply and to judge whether the candidate's English
answers are grounded in actual experience. Push for specifics (STAR: Situation,
Task, Action, Result). Do not let vague answers slide.

## One-liner
AI Agent & automation engineer, 5 years. Builds end-to-end agent systems:
multi-agent orchestration, LLM gateways, fully-automated dev/content pipelines.
985 bachelor (Southeast University, Robotics). Target: remote / overseas-friendly
AI Agent / platform / application engineering roles. Stack: Go / TypeScript+React /
Python / Rust(Tauri) / Bash.

## Current role — Full-stack engineer at an overseas AI-tools company (2025.03–now)
Core dev of an overseas AI-tool product (AI agent assistant + remote control).
- Cross-platform AI agent runtime: Go gateway, ~900 files / 2000+ commits;
  multi-agent loop + tool-calling + permission system; hybrid long-term memory
  (vector + BM25 + graph); 50+ skills and MCP integrated; multi-channel
  (Telegram/Slack/Web/Desktop) + offline relay; Tauri(Rust)+React 19 desktop.
- Multi-tenant LLM gateway: Go + Gin + Ent/PostgreSQL (30+ schemas); unifies
  OpenAI/Anthropic/Gemini/OpenRouter protocols; weighted upstream scheduling +
  failover + concurrency limiting + sticky sessions; token-level usage billing;
  multi-region payments (Stripe/Alipay/WeChat).
- User center / high-concurrency backend: Node/Koa, ~89 tables, serving millions
  of users / millions of devices; 7+ payment adapters; Nacos service discovery.

## Personal project — "Army": self-built multi-agent autonomous dev pipeline
PM / Worker / Auditor three roles + redline guard run the full loop:
Issue → triage → coding → tests → PR → review → approval → merge. Only human
action = tapping approve in IM. Tool allowlist for separation of duties + git
worktree isolation; GitHub Issue/PR state + runs.jsonl ledger for
stateless/recoverable/fault-tolerant runs; PreToolUse redline hook deterministically
blocks dangerous ops (push to main / edit secrets / delete prod). systemd polls
every 15 min, true 24/7 unattended. Feishu two-way bridge (@PM trigger + streaming
cards + one-tap approve-merge). Built on Claude Code headless (`claude -p`), ~300
lines, no Airflow, no queue, near-zero marginal cost. Has autonomously fixed and
merged several real bug PRs. Public ops dashboard:
https://pyf-labrary.github.io/marginalia/showcases/army-ops/

## Personal project — "Claw": end-to-end content automation pipeline
6+ output formats (daily news, short drama, weekly video, HTML games, research
reports, interactive teaching site). GitHub Actions daily cron, 8-step chain
auto-publishes (AI Morning Post, runs 06:00 daily unattended). Unified image/video/
TTS wrappers (cost tracking + SHA-idempotent resumable runs + version locking),
6+ generation providers with fallbacks.

## Earlier career
- Sany Marine Heavy Industry — Project Manager (2022.09–2024.12): autonomous
  driving assistance for engineering vehicles; led full cycle (requirements →
  design → dev → acceptance → delivery → maintenance). Perception (lidar point
  cloud + vision detection), control, HMI on embedded Linux (C++/Python). Shipped
  auto container-alignment, 360 safety, anti-collision, remote-controlled stacker,
  auto battery-swap. 2023 performance grade A; multiple invention patents; tech
  pioneer & innovation awards.
- Changhong — software R&D (2021.07–2022.07): smart-home IoT modules
  (Realtek/ASR/MTK/ESP32), BLE+WiFi combo, MQTT remote control to multiple clouds,
  OTA, provisioning, encrypted BLE. Shipped 5 projects on time.

## Education
Southeast University (985/211), B.Eng Robotics, 2017–2021. National 2nd prize TI Cup
electronics design 2019. Thesis: Web/WebGL + PCL 3D point-cloud reconstruction
(RANSAC/DBSCAN/Super-4PCS registration).

## Known weak spots to coach around
- Spoken English fluency is the gap; reading/writing is okay (CET-4 level).
- Tends to undersell. Push for quantified impact and crisp ownership ("I" not "we").
- Make sure he can tell the Army story and the LLM-gateway story fluently in English —
  these are his strongest differentiators for remote/overseas roles.
