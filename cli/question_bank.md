# 汇丰类外企面试题库 · 全英面

为 pyf 投递 HSBC / Standard Chartered / DBS / Citi / HSBC Innovation Banking /
HSBC Technology China 这类「外资银行 + 科技岗」+ 同档外企远程 AI/平台岗 编的真实
题库。**英国 / 印度面试官口音**为主，全英作答。

题库是面试官 agent 的「灵感池」——`interview.py --style <X>` 会把对应章节注入到
system prompt，让 agent 按这个套路出题（仍允许它根据 profile.md 即兴追问）。

---

## 套路速览：HSBC 类银行外企的招聘漏斗

1. **Online application + SHL/Pymetrics 评测**（英语阅读 / 逻辑 / 行为偏好，无需口语）
2. **HireVue / OnDemand video interview**（单向自录，5–8 题 strengths-based，
   每题 30s 准备 + 90–180s 回答；**全英、无人对话**）—— 这一关淘汰率最高
3. **Recruiter / HR phone screen**（30 min，英语沟通能力 + 动机 + 期望 + 简历核实）
4. **Hiring manager 面**（45–60 min，英国/印度经理，技术 + 项目深挖 + STAR）
5. **Final / panel**（多人，跨地域，含 senior tech + business stakeholder）
6. （部分岗）**Assessment centre**：case study + group exercise + presentation

> 关键洞察：HSBC 不是 FAANG。**不考 LeetCode hard**，但会考**风险意识 / 合规 /
> 客户视角 / 跨文化协作 / values fit**。这一项跟纯科技外企（Stripe/Cloudflare）很不一样。

---

## HSBC 八大 Values（每场面试都会被映射）

> 这八条是 HSBC 官方对员工的期待，**strengths-based** 面试就是把题映射回这八条
> 来打分。背熟，并准备每条对应一个**真实故事**（30–60 秒英文）。

| Value 关键词 | 英文 anchor | pyf 的对应故事 |
|---|---|---|
| **We value difference** | seeking out different perspectives | （跨团队/跨文化合作） |
| **We succeed together** | collaborating across boundaries | Army 流水线把 PM/Worker/Auditor 跨角色串通 |
| **We take responsibility** | holding ourselves accountable and taking the long view | LLM 网关上线后亲自值班排 Stripe 异常 |
| **We get it done** | moving at pace and finding ways to break through | Army 从想法到 24×7 上线 6 周 |
| **We act with courage** | speaking up and stepping forward | 主动提出 redline guard 拒绝 push to main |
| **We act with integrity** | doing the right thing | 拒绝绕过备案/合规步骤 |
| **We see the future first** | embracing innovation | 把 agent runtime 引入产品 |
| **We do the right thing for the customer** | putting customer outcomes at the heart of decisions | 用户中心 89 表服务百万用户 |

⚠️ **绝不照搬八条价值名**，要的是「我在 X 项目做了 Y，结果 Z」这种**事实驱动**叙事，
让面试官自己映射到价值上——这是 strengths-based 高分的关键。

---

## 一、Strengths-based / Values 题（HireVue + HR phone 必考）

这一组**节奏快**：30s 准备 + 90s 答。考你的「自然反应 + 真实自我」，不是套答案。

1. What motivates you most at work, and can you give an example?
2. Describe a time when you found a more efficient way to do something. What did you change and why?
3. Tell me about a time you had to learn something completely new in a short period.
4. When working in a team, do you prefer to lead or to support? Give an example.
5. Describe a situation where you had to deliver under significant time pressure.
6. Tell me about a time you disagreed with a teammate or manager. How did you handle it?
7. Give an example of when you took responsibility for something that went wrong.
8. What's a task you genuinely enjoy doing, and one you find draining? Why?
9. Describe a time you helped someone in your team grow or succeed.
10. Tell me about a moment you stepped outside your comfort zone.
11. How do you keep yourself up to date with technology? Give a concrete recent example.
12. Tell me about the most ambitious goal you've set yourself and how you approached it.
13. Describe a time you challenged a process or assumption. What was the outcome?
14. What does «doing the right thing for the customer» mean to you in your engineering work?
15. Give an example of how you've balanced delivery speed with quality or risk.

---

## 二、Behavioral / STAR 题（hiring manager 面深挖）

这一组**慢节奏**：3–5 分钟，要 Situation / Task / Action / Result 四件套。

16. Walk me through a project where you owned something end-to-end. (→ Army or LLM gateway)
17. Tell me about the most complex technical problem you've solved. What made it hard?
18. Describe a time you had to make a trade-off between two reasonable approaches.
19. Tell me about a time you had to influence stakeholders without authority.
20. Have you ever worked in a fully remote / distributed team? What did you learn?
21. Have you worked across time zones or cultures? Give a concrete example.
22. Describe a time a project missed a deadline. What was your role and what did you change next time?
23. Tell me about a moment you had to push back on a requirement.
24. Describe a production incident you handled. What did you do in the first 30 minutes?
25. Tell me about a piece of feedback that changed how you work.
26. Tell me about a time you mentored or onboarded someone.
27. How did you decide what to **stop** doing in a project to ship on time?
28. Describe a time you spotted a risk others missed.
29. Tell me about a time you simplified something complex.
30. What's a decision you made that you'd make differently today?

---

## 三、Tech / System design 题（manager 面 + final 面）

按 pyf 简历的强差异点（agent runtime / LLM gateway / Army pipeline）来出。**不考
LeetCode**，考的是**讲清 trade-off + 估算 + 风险意识**。

### Agent / LLM systems
31. Walk me through your LLM gateway architecture. Why a unified protocol layer?
32. How do you handle upstream provider failover? What's your concurrency limiting strategy?
33. How do you bill at token level? What edge cases did you hit?
34. How does your multi-agent loop avoid runaway loops or infinite tool calls?
35. How do you design a permission / tool allowlist for agent safety?
36. How would you design a memory layer that combines vector, BM25 and graph? When does each win?
37. Your Army pipeline is fully unattended — how do you stop it from doing something catastrophic?
38. How would you design a redline guard for an agent in a regulated environment (e.g. a bank)?
39. If you had to add observability to an agent runtime from scratch, where would you start?
40. How do you evaluate agent quality? What metrics? How do you detect regression?

### General platform / backend
41. Design a multi-tenant API gateway that fronts 5 LLM providers, with usage-based billing.
42. How would you migrate a 89-table user-center DB to a new sharding scheme with zero downtime?
43. Walk me through a payment integration you've shipped. What failure modes did you guard against?
44. Design a job queue for tasks that may take 30s–30min, with retry, idempotency, and dead-lettering.
45. How do you keep a Go service's p99 latency under 100ms under bursty traffic?

### Bank / risk-flavoured questions (HSBC-specific)
46. If your AI agent gave a wrong answer to a customer query in a banking app, how would you detect, contain, and remediate it?
47. What controls would you put around a code-generation agent that has write access to a production repo?
48. How do you make sure an AI feature in a financial app is auditable and explainable?
49. What's your view on using third-party LLM APIs in a regulated environment? What's the trade-off vs self-hosted?
50. How would you design rate limits and abuse detection for a customer-facing AI assistant?

---

## 四、Why-HSBC / Why-remote 必答题

51. Why HSBC specifically, and not another bank or a pure tech company?
52. Why do you want a remote role? How do you stay productive without an office?
53. What attracts you to working in a global, multicultural team?
54. Where do you see yourself in 3 years?
55. What's your salary expectation? (注意英镑/新加坡币/港币口径)
56. We're in a regulated industry — how do you feel about working within strict change controls?
57. What's the biggest thing you'd want from your next manager?
58. What questions do you have for us? **（必须准备 3 个，宁多勿少）**

### Reverse 问题样本（你问面试官的）
- How is the team distributed across regions, and how do you handle async collaboration?
- What does success look like in this role at the 3-month and 12-month mark?
- How does the team balance delivery pressure with the change-management process in a bank?
- What's the biggest engineering challenge the team is working on right now?
- How is AI / agent technology being adopted within HSBC engineering today?

---

## 五、英式 / 印式英语听力关键词（耳朵适应训练）

英国/印度面试官常用、但中国候选人陌生的表达。**daily.py 会随机抽来做听写。**

- *"Could you walk me through...?"* （= tell me about）
- *"Talk me through how you would..."* （= explain）
- *"What's your take on...?"* （= what do you think about）
- *"Give us a flavour of..."* （= give us a brief overview）
- *"Spot on."* （= exactly right）
- *"That's brilliant, can you double-click on...?"* （= go deeper on）
- *"Were there any spanners in the works?"* （UK: 出过什么岔子）
- *"How did you get on with...?"* （= how did it go with）
- *"On the back of that..."* （= as a result of that）
- *"I'm keen to understand..."* （= I'd like to understand）
- *"What kit do you use?"* （UK: what tools / stack）
- *"At pace"* （= quickly, 高频 HSBC values 词）
- *"Stakeholder management"*（= 跨部门沟通）
- *"Day one / day zero"* （= 第一天 / 上线前一天）
- *"Sign off"* （= 批准 / 审批通过）
- *"Push back"* （= 提反对意见）
- *"Raise a flag"* （= 提出风险预警）
- *"Bandwidth"* （= 时间/精力余量）
- *"Touch base"* （= 同步一下进展）
- *"BAU"* （Business As Usual）
- *"EOD / EOW"* （End of Day / Week）
- *"ETA"* （= 预计完成时间）

印度英语额外特征：
- 节奏更快、辅音更硬、卷舌少
- 经常用 *"only"* 做语气强调：「I did it yesterday only.」
- *"What is your good name?"* （= what's your name, 礼貌问法）
- *"Do the needful"* （= do what's necessary）—— 听到不要懵
