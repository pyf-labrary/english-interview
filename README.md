# English Interview · Drill

按住麦克风说英文，AI 面试官（英国 / 印度口音）现场给评分、地道改写、错误点评和中文教练点评。
为投递汇丰 / Standard Chartered / DBS / Citi 这类外资银行 + 同档外企远程 AI 岗的全英面试做的口语训练器。

**Live demo（需 token）**：<https://pyf-labrary.github.io/english-interview/>

```
┌─ iPhone Safari / Android Chrome ──────────────────────────────────┐
│                                                                   │
│  press-and-hold mic            HSBC · UK ♂ · 6 questions          │
│  Web Speech API live caption    ← 字幕实时刷新                    │
│                                                                   │
└─────────────────────────────│─────────────────────────────────────┘
                              │ HTTPS  + X-Auth-Token
                              ▼
        cdn / cdn-less (GH Pages) ─▶ openresty TLS terminate
                                                       │
                                                       ▼
                                        FastAPI :8765 (systemd)
                                          ├─ faster-whisper (tiny.en, CPU)
                                          ├─ DeepSeek V4 Flash  (LLM judge)
                                          └─ Microsoft Edge Neural TTS
```

## 设计原则

- **手机优先**：单手按住录音，松开提交；不需要任何 app 安装
- **不烧成本**：评分用 DeepSeek（按 token），STT 用本地 faster-whisper，TTS 用 Edge Neural（免 key）
- **强口音覆盖**：英国男 / 英国女 / 印度男 / 印度女 / Panel 混音 — 真实模拟汇丰系跨国面试官
- **作品级 UI**：深色严肃感，避开 AI slop 配色
- **白嫖防护**：token 鉴权 + nginx 限流（每 IP /api/turn 15req/min）

## 仓库结构

```
.
├── index.html          ← 单文件前端（React 18 + Tailwind via CDN，无构建）
├── server/             ← FastAPI 后端
│   ├── server.py
│   ├── requirements.txt
│   ├── run.sh          本地启动
│   └── deploy-pyf.sh   一键部署到 ssh pyf
├── cli/                ← CLI 版（早期版本，复用同一份题库 + profile）
│   ├── interview.py
│   ├── daily.py
│   ├── profile.md      ← 候选人简历（agent 据此追问）
│   ├── question_bank.md ← 汇丰类题库 + 英印听力词
│   └── PLAN.md         ← 6 周训练计划
└── bin/
    └── tts-edge        ← Microsoft Edge Neural TTS wrapper
```

## 快速开始

```bash
# 1. 后端：DeepSeek key 必填
export DEEPSEEK_API_KEY=sk-xxx
export INTERVIEW_TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
cd server && ./run.sh    # 起 :8765

# 2. 前端：任何静态 server 都能挂
python3 -m http.server 8000
# → http://localhost:8000/?token=<同一个 INTERVIEW_TOKEN>
```

第一次访问，token 会被前端从 URL 抹掉并存进 localStorage，之后直接访问 root 即可（无须每次带 token）。

## API

所有 `/api/*`（除 `/api/health`）必须带 `X-Auth-Token: <INTERVIEW_TOKEN>` 头。

| 路由 | 用途 | 输入 | 输出 |
|---|---|---|---|
| `POST /api/start` | 起首题 | `{style, accent, questions}` | `{question, question_zh, audio_b64}` |
| `POST /api/turn` | 提交录音 + 拿评分 + 下一题 | multipart audio + style/accent/idx/transcript/current_question | `{stt_text, feedback, question, question_zh, audio_b64, transcript}` |
| `POST /api/summary` | 最终总评 | `{transcript, style, accent}` | `{cefr, verdict_zh, strengths, weaknesses, vocab, action_items}` |
| `GET  /api/health` | 健康 | — | `{ok, tts_edge, profile_loaded, qbank_loaded, auth_required}` |

### Style × Accent

| Style | 用什么场景 |
|---|---|
| `mixed` | 综合面 |
| `hsbc` | 汇丰 / 银行外企经理面（strengths-based + 8 values） |
| `strengths` | HireVue 单向自录（30s + 90s） |
| `tech` | system design / agent infra 深挖 |
| `behavioral` | 纯 STAR |

| Accent | TTS voice |
|---|---|
| `british` | en-GB-RyanNeural / en-GB-ThomasNeural |
| `british-f` | en-GB-SoniaNeural / en-GB-LibbyNeural |
| `indian` | en-IN-PrabhatNeural |
| `indian-f` | en-IN-NeerjaNeural |
| `mixed` | 上述随机轮换 |

## 部署到 ssh pyf（一键）

前提：服务器已配 `ssh pyf`、本地有 `~/bin/.deepseek.env`。

```bash
cd server && ./deploy-pyf.sh
```

会做：rsync server/ cli/ bin/ → apt install ffmpeg → venv + pip → 写 systemd unit → restart。
首次会下 faster-whisper tiny.en (~75MB) 走 hf-mirror。

`/api/* `经 openresty 反代到 127.0.0.1:8765 + Let's Encrypt 证书。

## 鉴权 + 限流

- `X-Auth-Token` 头校验，不带或错 → 401
- `OPTIONS` preflight 放行（CORS 必须）
- nginx：`/api/turn` 每 IP **15 req/min** burst 3；其它 `/api/*` **60 req/min** burst 10；超限返 429
- Token 轮换：
  ```bash
  NEW=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
  ssh pyf "sed -i 's/^INTERVIEW_TOKEN=.*/INTERVIEW_TOKEN=$NEW/' /root/bin/.deepseek.env && systemctl restart eng-interview"
  echo "https://pyf-labrary.github.io/english-interview/?token=$NEW"
  ```

## CLI 版（终端跑面试）

`cli/daily.py` 是更早做的终端版，跑 6 周训练计划：

```bash
cd cli && ./daily.py --plan     # 看 42 天课表
cd cli && ./daily.py            # 跑今天的训练（30min）
cd cli && ./interview.py --progress    # 看历次评分趋势
```

文字答题 + 文字反馈，不需 TTS / STT，本地 `claude -p` 跑评分。详见 `cli/PLAN.md`。

## 已知限制

- iOS Safari 实时字幕偶发漏词（用 Apple Siri 引擎）—— 最终评分用 faster-whisper 不靠 Web Speech，所以不影响
- DeepSeek 偶发 "service is too busy"：后端已加 connect timeout + 重试 + flash → pro fallback
- 内存 1.7G 服务器跑 tiny.en 够用，base.en 紧张

## 致谢

- [Microsoft Edge Neural TTS](https://github.com/rany2/edge-tts) — 免 key 英印音
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2 + Whisper
- [DeepSeek](https://platform.deepseek.com) — V4 Flash 出题 + 评分
- 题库受 HSBC/Standard Chartered/Citi 公开招聘文档 + Glassdoor 真实面试反馈启发

## License

MIT，详见 `LICENSE`。
