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

## 后续 vNext 备忘

- DeepSeek 兜底：撞 busy 自动切 MiniMax abab6.5（同 OpenAI 协议）
- 进度云同步：每场 logs 落 GitHub gist
- 接 BOSS 直聘：当天感兴趣岗位 JD 自动塞 `role`
- 发音评分：尝试 Azure Speech Pronunciation Assessment（首 5 小时免费）
