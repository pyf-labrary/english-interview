# English Interview · Drill

全英面试训练器，为投递汇丰 / Standard Chartered / DBS / Citi 这类外资银行 + 同档外企远程 AI 岗的全英面试做的口语训练器。两种用法：

- **自己练**：按住麦克风说英文，AI 面试官现场给评分、**标准范答**、地道改写、错误点评、中文教练点评。不会答 → 一键「看范答」。
- **AI 对练观摩**：让 AI 面试官 × AI 考生现场**双语对答**（双声线 TTS），你只管听 + 看中英字幕，学好答案长什么样。

题材**全方位**（综合·从零 / AI·LLM / 后端 / 系统设计 / CS 基础 / 行为面 / 个人项目）× 5 种面试风格 × 5 种口音，题数 4–20。

**Live demo（需 token）**：<https://eng.panyifeng.xyz/>

```
┌─ Android Chrome / 桌面 Chrome / 手机浏览器 ───────────────────────┐
│  自己练：按住 mic 说 → Web Speech 实时字幕 → 松手出评分+范答      │
│  AI 对练：两个 AI 双语对答，双声线 TTS，聊天式自动播放            │
└──────────────────────────────│───────────────────────────────────┘
                               │ HTTPS + X-Auth-Token（同域，无 CORS）
                               ▼
                openresty :443 (1panel docker, LE cert + limit_req)
                               │  location / 整站反代
                               ▼
                FastAPI :8765 (systemd eng-interview.service)
                  ├─ GET / · /app.js · /vendor/*   ← 同域托管前端（不再用 GH Pages）
                  ├─ STT：浏览器 Web Speech 为主转写源；
                  │        faster-whisper base.en (CPU) 仅在浏览器识别失败时兜底
                  ├─ DeepSeek V4 (LLM：出题 / 评分 / 范答 / 对话，503 自动 flash→pro)
                  └─ Microsoft Edge Neural TTS (en-GB / en-IN，对练模式双声线)
```

## 设计原则

- **手机优先**：单手按住录音，松开提交；不需要安装任何 app
- **教学优先**：每题都给标准范答 + 答题要点（看理想答案，不只是改写烂答案）；不会就跳过看范答；对练模式纯听学
- **全方位**：题材不绑定个人项目，从零覆盖 AI / 后端 / 系统设计 / CS / 行为面（`myproj` 才挖个人简历）
- **墙内即开即用**：前端全资源同域自托管 + 系统字体，不依赖 Google Fonts / unpkg / CDN（这些在国内会阻塞渲染）
- **不烧成本**：评分/对话用 DeepSeek（按 token），STT 主走浏览器免费引擎、服务器 whisper 仅兜底，TTS 用 Edge Neural（免 key）
- **白嫖防护**：token 鉴权 + nginx 限流

## 仓库结构

```
.
├── index.html          ← 3KB 前端壳（HTML + CSS + 系统字体），<script src=app.js>
├── app.src.jsx         ← ★前端逻辑源（改这里！React 18，JSX/TS）
├── app.js              ← app.src.jsx 的预编译产物（勿手改）
├── build.sh / build.js ← app.src.jsx → app.js（首次自动 npm i babel）
├── vendor/             ← 自托管 react / react-dom / tailwind(Play CDN)
├── server/             ← FastAPI 后端
│   ├── server.py
│   ├── requirements.txt
│   ├── run.sh          本地启动
│   └── deploy-pyf.sh   一键部署到 ssh pyf（含前端 rsync）
├── cli/                ← CLI 版（早期版本，复用同一份题库 + profile）
│   ├── interview.py / daily.py / profile.md / question_bank.md / PLAN.md
└── bin/tts-edge        ← Microsoft Edge Neural TTS wrapper
```

> ⚠️ **不是"单文件无构建"了**。改前端逻辑：编辑 `app.src.jsx` → `./build.sh` → 部署；只改 HTML 壳/CSS 才动 `index.html`。预编译去掉了浏览器端 3.1MB Babel 运行时（墙内载荷 3.6MB→~580KB，全同域）。

## 快速开始

```bash
# 1. 后端（同时托管前端）：DeepSeek key 必填
export DEEPSEEK_API_KEY=sk-xxx
export INTERVIEW_TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
cd server && ./run.sh    # 起 :8765，GET / 直接发同目录上层的 index.html

# 2. 如果改过前端逻辑，先构建
./build.sh               # app.src.jsx → app.js

# → http://localhost:8765/?token=<同一个 INTERVIEW_TOKEN>
```

第一次访问，token 会被前端从 URL 抹掉并存进 localStorage，之后直接访问 root 即可。

## API

所有 `/api/*`（除 `/api/health`）必须带 `X-Auth-Token: <INTERVIEW_TOKEN>` 头。`GET /`、`/app.js`、`/vendor/*` 是开放的前端资源。

| 路由 | 用途 | 输入（关键字段） | 输出（关键字段） |
|---|---|---|---|
| `POST /api/start` | 起首题 | `{style, accent, topic, questions}` | `{question, question_zh, audio_b64}` |
| `POST /api/turn-text` | **主路径**：浏览器实时转写文本 → 评分 + 下一题 | `{text, style, accent, topic, idx, transcript, current_question, questions}` | `{stt_text, feedback, question, question_zh, audio_b64, transcript}` |
| `POST /api/turn` | 兜底：上传录音 → whisper → 评分 + 下一题 | multipart `audio` + 上面那些字段 | 同上（`stt_source=whisper`） |
| `POST /api/skip` | 跳过本题 → 直接范答（不评分）+ 下一题 | `{style, accent, topic, idx, transcript, current_question, questions}` | `{feedback{skipped,model_answer,model_answer_zh,key_points_zh,vocab}, question, ...}` |
| `POST /api/spar` | AI 对练：生成整段 面试官×考生 双语对话 | `{style, accent, topic, rounds}` | `{dialogue:[{role,en,zh}...]}` |
| `POST /api/tts` | 文本 → mp3（对练逐句配音，面试官/考生不同声线） | `{text, accent, role}` | `{audio_b64, voice}` |
| `POST /api/summary` | 最终总评 | `{transcript, style, accent, topic}` | `{cefr, verdict_zh, strengths, weaknesses, vocab, action_items}` |
| `GET  /api/health` | 健康 | — | `{ok, tts_edge, frontend_html, auth_required, ...}` |

`feedback`（turn 系）字段：`{score, rewrite, model_answer, key_points_zh, errors, coach_zh}`。

### Topic × Style × Accent

| Topic 范围 | 内容 |
|---|---|
| `general`（默认） | 全方位综合，从零，不绑个人项目 |
| `ai` | AI/LLM/Agent 基础（embedding/RAG/token/agent…） |
| `backend` | API / DB / 缓存 / 队列 / 并发 / 部署 |
| `sysdesign` | 系统设计（入门级，带框架引导） |
| `cs` | CS 基础（数据结构 / OS / 网络 / DB） |
| `behavioral` | 通用行为面（STAR） |
| `myproj` | 挖候选人个人项目（注入 `cli/profile.md` + `question_bank.md`） |

| Style | 场景 |
|---|---|
| `mixed` | 综合 | `hsbc` | 汇丰系 strengths + values | `strengths` | HireVue 单向 | `tech` | 技术深挖 | `behavioral` | 纯 STAR |

| Accent | TTS voice |
|---|---|
| `british` | en-GB-Ryan/Thomas | `british-f` | en-GB-Sonia/Libby | `indian` | en-IN-Prabhat | `indian-f` | en-IN-Neerja | `mixed` | 随机轮换 |

对练模式：面试官用所选口音主声线，考生用对比声线（不同性别/口音）以便区分。

## 部署到 ssh pyf（一键）

前提：服务器已配 `ssh pyf`、本地有 `~/bin/.deepseek.env`。

```bash
cd server && ./deploy-pyf.sh
```

会做：rsync `server/` `cli/` `bin/tts-edge` **+ `index.html` `app.js` `vendor/`** → apt install ffmpeg → venv + pip → 写 systemd unit（`WHISPER_SIZE=base.en`）→ restart。首次 STT 兜底触发时下 faster-whisper base.en (~150MB) 走 hf-mirror。

> ⚠️ **别盲跑全套 deploy 会抹 token**：脚本会把本地 `~/bin/.deepseek.env` rsync 覆盖服务器的，而本地这份通常**没有 `INTERVIEW_TOKEN`** → 抹掉鉴权全站 401。安全做法：只 `rsync server/ + index.html + app.js + vendor/`（不带 key 文件），改 unit 用 `ssh pyf` 里 sed。

`location /` 经 openresty 整站反代到 127.0.0.1:8765 + Let's Encrypt 证书。**openresty 站点配置（含限流 location）是服务器端手改、不在仓库**：`/opt/1panel/apps/openresty/openresty/conf/conf.d/eng.panyifeng.xyz.conf`，限流 location 用 `~ ^/api/turn(-text)?$`（严格区盖主路径）。

## 鉴权 + 限流

- `X-Auth-Token` 头校验，不带或错 → 401；`OPTIONS` preflight 放行（CORS 必须）
- nginx：`/api/turn(-text)` 每 IP **15 req/min** burst 3；其它 `/api/*` **60 req/min** burst 10；超限 429
- Token 轮换：
  ```bash
  NEW=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
  ssh pyf "sed -i 's/^INTERVIEW_TOKEN=.*/INTERVIEW_TOKEN=$NEW/' /root/bin/.deepseek.env && systemctl restart eng-interview"
  echo "https://eng.panyifeng.xyz/?token=$NEW"
  ```

## CLI 版（终端跑面试）

`cli/daily.py` 是更早的终端版，跑 6 周训练计划（文字答题 + 文字反馈，本地 `claude -p` 评分）：

```bash
cd cli && ./daily.py --plan     # 看 42 天课表
cd cli && ./daily.py            # 跑今天的训练
cd cli && ./interview.py --progress    # 历次评分趋势
```

## 已知限制

- 流式实时字幕依赖浏览器能连到识别引擎（Chrome 走 Google）。墙内**没代理时**实时字幕起不来 → 自动回落上传音频走服务器 whisper（能用但非流式、base.en 准度）。Chrome + 代理是最佳组合。
- DeepSeek 偶发 "service is too busy"：后端已加 connect timeout + 重试 + flash→pro fallback。
- pyf 1.7G 内存：base.en 兜底够用；small.en 偏紧，需实测。
- 对练模式每轮要现生成对话 + 逐句 TTS，点开始后会先"准备对话"几秒；轮数后端封顶 12。

## 致谢

- [Microsoft Edge Neural TTS](https://github.com/rany2/edge-tts) · [faster-whisper](https://github.com/SYSTRAN/faster-whisper) · [DeepSeek](https://platform.deepseek.com)
- 题库受 HSBC/Standard Chartered/Citi 公开招聘文档 + Glassdoor 真实面试反馈启发

## License

MIT，详见 `LICENSE`。
