# Build Log

构建过程的工程笔记，记下踩过的坑、做过的判断、回滚过的方向。

## 2026-05-28 · v1.0 上线

### 时间线（约 4-5 小时）

1. **起点**：已有 `~/claw/todo/english-interview/` CLI 雏形（`interview.py` + 基础 profile），但只能打字答题。
2. **CLI 增强**：补 `question_bank.md`（HSBC 8 values + 75 题）+ `PLAN.md`（6 周课表）+ `daily.py` 每日 routine + `tts-edge` wrapper（Microsoft Edge Neural，免 key，UK/IN 口音）+ `--accent` / `--style` / `--progress` flags。
3. **决策点 1**：WSL 不能练口语（麦克风穿透烦 + 必须坐桌前打字）→ 转手机 web app。
4. **决策点 2**：Mac mini vs pyf 服务器 vs cloudflared？pyf 是国内阿里云 + DeepSeek 国内直连，**不需要绕 GFW**，确定后端宿主 = pyf。
5. **决策点 3**：LLM？claude-p 跑 sonnet $0.16/次 → 改 DeepSeek V4 Flash（OpenAI 兼容协议 + json_object mode，便宜十倍）。
6. **DNS + 证书**：阿里云 cli 加 A 记录（撞 RAM 权限墙，用户加 `AliyunDNSFullAccess`）→ acme.sh DNS-01 + Ali_Key 自动签证书。
7. **反代**：1panel openresty 在 docker 容器内，reload 走 `docker exec 1Panel-openresty-nq6R nginx -s reload`。
8. **systemd 持久化**：写 unit + `TimeoutStopSec=8 + KillMode=mixed`（避免 fastapi background tasks hang 时 stop 卡死）。
9. **防白嫖**：DeepSeek 一调用就烧钱 → 加 `X-Auth-Token` middleware + nginx limit_req（/api/turn 15req/min 单 IP）+ 不暴露默认 backend URL → magic link `?token=…` 一次性带入 localStorage。
10. **UX 三轮**：
    - 第一版：答完立即跳下一题。问题：用户来不及看反馈。
    - 第二版：加 **Review phase**——答完先全屏看评分/改写/错误/教练，点 "Next →" 才进。
    - 加 **Live caption**：Web Speech API（iOS Safari `webkitSpeechRecognition`）边录边显示，零成本零后端。
11. **稳定性**：MediaRecorder webm 偶发 EOF → 后端 ffmpeg 强转 16kHz wav 再喂 whisper；前端 <4KB 录音拦下。
12. **重组**：把 v1 从 marginalia 子目录搬出来，开独立公开仓 `pyf-labrary/english-interview`，仓库 self-contained（server + index.html + cli + bin），GH Pages 自部署。

### 架构最终态

```
iPhone Safari (MediaRecorder + Web Speech API live caption)
       │ HTTPS  + X-Auth-Token
       ▼
openresty :443 (1panel docker, letsencrypt cert + limit_req)
       │
       ▼
FastAPI :8765 (systemd, eng-interview.service)
   ├─ faster-whisper tiny.en (CPU, hf-mirror)
   ├─ DeepSeek V4 Flash (OpenAI 兼容 / json_object mode / 503 自动 fallback 到 Pro)
   └─ tts-edge (Microsoft Edge Neural, en-GB / en-IN)
```

### 关键踩坑

| 坑 | 现象 | 修法 |
|---|---|---|
| aliyun cli env var 不读 | `profile default is not configure` | 显式 `--mode AK --access-key-id $K --access-key-secret $S --region cn-hangzhou` |
| RAM 子账号无 DNS 权限 | `Forbidden.RAM ImplicitDeny` | 控制台给 bot 加 AliyunDNSFullAccess |
| 1panel openresty 不在宿主机 | `nginx: command not found` | 走 docker exec 容器名 `1Panel-openresty-nq6R` |
| CORS preflight 401 | 浏览器 "Failed to fetch" | middleware 先判 `request.method == "OPTIONS"` 直接放行 |
| MediaRecorder webm EOF | faster-whisper `End of file` | 后端 ffmpeg 强转 wav 兜底 |
| DeepSeek "service too busy" | requests 挂死无返回 | `timeout=(8, 90)` 分开 connect/read + 重试 + flash→pro |
| systemd shutdown 卡死 | `Waiting for background tasks` | `TimeoutStopSec=8 + KillMode=mixed` |
| GH Pages 405 | POST 落到同源 Pages | 前端缺 backend URL 时显式 401 / 错误页 |
| WSL 无声 | `aplay: no soundcards` | `ffmpeg → paplay` pipe（PulseAudio）替代 sox/ALSA |

### 决定不做

- **STT 流式**：Web Speech API 字幕够用（200-500ms 词级刷新），WebSocket+streaming whisper 复杂度上一档但 UX 提升不大
- **云 ASR（阿里云/火山）**：质量更高但烧钱（¥10-15/h），与"低成本"原则冲突
- **真发音评分**：Allosaurus / Azure Pronunciation Assessment 复杂度高，先把内容评分练到 7/10 再说
- **PWA manifest**：iOS Safari 加到主屏已经够好用，不需要 service worker 缓存（每次都连后端）
- **gRPC / WebSocket**：HTTP+JSON 已经满足，不堆抽象

### 性能档（pyf 1.7G + 8G swap）

- whisper tiny.en CPU int8：~3-6s 一段 10s 录音
- DeepSeek V4 Flash：3-15s 一次 turn（含 SSL handshake + LLM + JSON 序列化）
- TTS edge-tts：1-2s 一段问题
- 单 turn 总延迟：~10-15s（用户能等）
- 内存：38-45 MB（whisper 模型懒加载，第一次 STT 触发时下 ~75MB）

## 2026-06-03 · v2 STT 流式化 + 自托管 + 学习向大改

一个下午连做四块（commits `da0d914`→`9af5b9b`）：

### 1. STT：从"说完才出"改成流式 + 提准（`da0d914` `29d7739`）
- 之前 Web Speech 实时字幕被当"纯 UX"丢弃，真正喂 LLM 的是上传整段音频→`tiny.en`（最弱档），所以又慢又不准。
- 改：**Web Speech 的实时文本直接当评分依据**，走新端点 `POST /api/turn-text`（只收文本，跳过音频上传/ffmpeg/whisper）→ 真流式"边说边弹词" + 准确率碾压 tiny.en。识别为空/失败自动回落音频走 `/api/turn`。whisper 兜底升 `base.en + beam_size=5 + initial_prompt 词表`。
- **决定不做的反转**：v1 build-log 里写"STT 流式不值得做"——错了。不是去搞 streaming-whisper（那在 2 核无 GPU 服务器上确实不可行），而是直接用浏览器免费引擎当主转写源，零服务器成本就拿到了流式 + 高准确率。
- **bug：按住录音停不下来**（`29d7739`）。`beginRecord` 是 async（await getUserMedia，含首次授权弹窗），快速点按/松手时 `endRecord` 在录音器还没建好就跑了，之后 beginRecord 恢复又把录音重开，phase 卡死在 recording、两个按钮守卫互锁。修：await 后加竞态守卫（已松手就别开录）+ 提交只由 `rec.onstop`/`SR.onend` 触发，不在 endRecord 里提交。

### 2. 卡顿根因：墙内被 Google Fonts 阻塞（`c03a7b2`）
- 用户反馈"访问很卡"。实测：pyf 发页面 0.13s，但 `fonts.googleapis.com` 直连 **12s timeout**（被墙，且 `<link>` 渲染阻塞）→ 整页冻住十几秒；外加 unpkg/tailwind CDN 慢 + 浏览器端 3.1MB Babel 现编译。
- 修：**全部依赖本地自托管 + 系统字体 + 预编译去 Babel**。index.html 拆成 3KB 壳 + `app.src.jsx`(源) + `app.js`(预编译 27KB) + `vendor/`(react/react-dom/tailwind)。加 `build.sh`。载荷 3.6MB→~580KB 全同域。**从此不再是"单文件无构建"**。

### 3. 前端搬到同域自托管，GH Pages 退役（`65c669b` + DELETE /pages）
- FastAPI `GET /` 直接发 index.html，`/app.js` + mount `/vendor`。openresty 早就是 `location /` 整站反代，所以白嫖现成。
- 唯一入口改 **https://eng.panyifeng.xyz/**（前后端同域、无 CORS、墙内稳）。GitHub Pages 用 API `DELETE /repos/.../pages` 关停，旧址 404。Marginalia `/apps/` 链接改指新址。

### 4. 学习向功能：从"考你"变"教你"（`61d67e6`）
- 用户起步水平、很多题答不上 → 加：① **topic 维度**（general/ai/backend/sysdesign/cs/behavioral/myproj），默认全方位从零、不绑 Army，只 myproj 注入 profile。② **每题范答** model_answer + key_points_zh。③ **一键跳过看范答** `/api/skip`。④ 题数到 20。⑤ **AI 对练观摩** `/api/spar`（整段双语对话）+ `/api/tts`（逐句双声线），前端聊天式自动播放 + 播放控制 + 中英切换。

### 关键判断
- 主转写源选浏览器 Web Speech 而非云 ASR（Deepgram 等）：用户常挂代理 + Chrome，免费引擎已够好；云 ASR 留作"不够再上"。
- 预编译 vs 自托管 Babel：Babel standalone 3.1MB 太重，预编译到 27KB app.js 一步到位。

## 后续 vNext 备忘 / 待办

- **STT 升级（按需）**：用户取向"先免费不够再上付费"。若浏览器 Web Speech 不够稳/准，接 Deepgram 或 AssemblyAI 浏览器直连 WebSocket 流式（~¥0.03/min），是天花板方案。
- **录音交互**：当前是 press-and-hold。曾向用户提议 tap-to-toggle（点开始/点结束，手机更顺手），用户暂未要；若嫌按住累可切换。
- **openresty 配置不在仓**：限流 location 是服务器端手改，1panel 面板重写站点配置会丢，需按 README「部署」段重打。
- 发音评分：Azure Speech Pronunciation Assessment（首 5h 免费）。
- 进度云同步：每场 logs 落 GitHub gist。
- DeepSeek 兜底再加一层：撞 busy 自动切 MiniMax / 小米 MiMo（同 OpenAI/Anthropic 协议）。
