# 6 周英语面试突击计划 · 目标：能过汇丰类外企全英面

## 目标拆解

- **终点**：能在 45–60 min 的全英面试中（**英国/印度面试官**）从容回答 8–10 道题，
  覆盖 strengths-based + STAR 行为面 + system design + reverse 提问。
- **过关基准**（自评 + 模拟面试 agent 评估）：
  - 口语 CEFR：**B2 stable**（B1 起步是当前位置）
  - 每题平均分（10 分制） ≥ **7.0**
  - 英式 / 印度英语听力**关键术语**听得懂，不会 freeze
  - 三个核心故事（Army / LLM gateway / agent runtime）能各 90 秒讲完，不带嗯啊
- **时长**：**6 周 × 7 天 × 30 分钟 = 21 小时核心训练**（外加平时听播客碎片）。

## 工具栈（全在 `~/claw/todo/english-interview/`）

| 命令 | 干什么 |
|---|---|
| `./daily.py` | 跑今天的训练（自动按课表 + 听力暖身 + 模拟面 + 背词 + 进度看板）|
| `./daily.py --plan` | 看 42 天课表 + 今天位置 |
| `./daily.py --day 12` | 强制按第 12 天的内容练 |
| `./daily.py --shadow` | 只跑听力暖身（地铁 / 起床 5 分钟） |
| `./daily.py --reset` | 重置开始日期，从 D1 重来 |
| `./interview.py --style hsbc --accent british -n 6` | 自由跑一场（按需调） |
| `./interview.py --progress` | 看历次评分趋势曲线 |
| `~/claw/bin/tts-edge --voice british --text "..." --out q.mp3` | 单独造一段 TTS |

每天 30 分钟 routine（`./daily.py` 自动串起来）：
1. **5 min** 听力暖身：tts-edge 朗读 3 道当天 style 的题，候选跟读
2. **20 min** 模拟面试：4–8 题，每答一题立刻出**地道改写 + 错误点评 + 评分 + 教练建议**
3. **5 min** 背 5 个英式/印式表达 + 看进度趋势

## 周课表概览

| 周 | 主题 | 核心目标 |
|---|---|---|
| **W1** | 适应 | 让耳朵和嘴打开，把 Army / LLM gateway 故事从中文搬到英文 |
| **W2** | STAR 故事库 | 5 个核心故事打磨到 90 秒可讲，I-ownership / 量化产出到位 |
| **W3** | HireVue 强度 | 适应单向自录节奏：30 s 准备 + 90 s 答，无对话反馈 |
| **W4** | HSBC strengths-based + values | 切到银行外企节奏：风险意识、合规、客户视角、values 映射 |
| **W5** | tech / system design 深挖 | LLM gateway / agent runtime trade-off 讲清；面对追问不结巴 |
| **W6** | 终面 + reverse | 完整 panel 模拟 + 准备 3+ 个 reverse 问题，最后一次满压力 |

## 三个**必须能讲**的核心故事（90 s 英文版）

> 这三个是 pyf 区别于普通候选人的最强差异点。**第 1 周内**就要把英文 outline
> 写出来，之后每周都用不同口音的 agent 练讲，直到肌肉记忆。

1. **Army — multi-agent autonomous dev pipeline**
   - 1 句 hook：「I built a multi-agent pipeline that runs my GitHub issues end-to-end, 24/7, fully unattended.」
   - 3 个差异点：PM/Worker/Auditor 三角色 · redline guard 拒绝 push to main · 飞书一键 approve-merge
   - 量化：~300 lines, no Airflow, ~$0 marginal cost, several real bugs auto-fixed and merged
2. **LLM gateway — multi-tenant, multi-provider, billing-aware**
   - 1 句 hook：「I built a Go gateway that unifies five LLM provider protocols with token-level billing and Stripe.」
   - 3 个差异点：weighted scheduling + failover · sticky sessions · ent/PG 30+ schemas
   - 量化：5 providers, Stripe/Alipay/WeChat, multi-region
3. **Agent runtime — cross-platform multi-agent loop**
   - 1 句 hook：「I shipped a cross-platform AI agent runtime: Tauri+Rust desktop, Go gateway, hybrid long-term memory.」
   - 3 个差异点：tool-calling + permission system · vector + BM25 + graph memory · 50+ skills + MCP

## 自评 checkpoint

| 节点 | 该达到 | 怎么测 |
|---|---|---|
| W1 结束 | 完整答出 1 个 STAR 故事 90 s 不停顿 | `interview.py --style behavioral` 平均分 ≥ 5.5 |
| W2 结束 | 5 个故事都能讲，I-ownership 到位 | 平均分 ≥ 6.0，鸳鸯口音都行 |
| W3 结束 | HireVue 节奏稳，能 90 s 内压住一题 | strengths 平均 ≥ 6.5 |
| W4 结束 | HSBC values 能在故事里被自然映射 | hsbc 风格平均 ≥ 6.5 |
| W5 结束 | system design 题不结巴，trade-off 讲清 | tech 平均 ≥ 6.5 |
| W6 结束 | 完整 panel 8 题 ≥ 7.0，准备好 3 个 reverse | 进 prod：投递 |

## 6 周训练之后做什么

1. **正式投递 HSBC Tech / HSBC Innovation Banking / Standard Chartered / DBS / Citi**
   （以及同档外企远程 AI 平台岗）。
2. **拿到 HireVue 邀请 → 24h 内做完**（不要拖），录前用 `interview.py --style strengths
   --voice` 热身 2 题。
3. **每场真面试后立刻复盘**：把对方原题录进 `question_bank.md` 自有题库，按口音
   开 `daily.py --day <N>` 二刷。
4. **课表完成后 daily.py 不要停**：每周维持 2–3 次轻量 session 防遗忘。

## 万一英语崩了怎么办（兜底）

- **碰到听不懂**：`"Could you rephrase that, please?"` / `"Just to make sure I understand,
  you're asking about X — is that right?"` —— 这两句永远不丢分。
- **碰到想不起词**：`"The English word escapes me — what I mean is …"` —— 比硬卡好。
- **碰到 panic**：深呼吸 + `"That's a great question, let me take a second to think."`
  —— **真的可以**沉默 3-5 秒。

## 汇丰系面试漏斗速查（背一下）

```
Online application
    ↓
SHL / Pymetrics 评测            （英语阅读 + 逻辑 + 行为偏好；无口语）
    ↓
HireVue 单向自录 5-8 题         ★ 淘汰率最高
    ↓
Recruiter HR phone 30 min       （动机 / 期望 / 简历核实）
    ↓
Hiring manager 45-60 min        （技术 + STAR）
    ↓
Final / panel                   （多人，跨地域）
    ↓
（部分岗）assessment centre：case study + group + presentation
    ↓
Offer
```

具体题面见 [`question_bank.md`](question_bank.md)。
