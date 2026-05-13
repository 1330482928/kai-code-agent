# Appendix: Code Budget

核心代码目标从 6.9K 调整为约 11.1K 行，允许实现期间在 10.0K 到 13.0K 行内浮动。Bun-first、Ink-first、middleware、plan mode、真实 LLM API、首次配置向导、thinking 分离、HITL manager、可测试输入层、Context Kernel、layered settings、slash context selection、typed/scoped memory、Bash 后台任务、只读状态工具、大输出管理和真实使用后的 context 质量优化都纳入 v0.1。预算用于控制复杂度，不是为了压线牺牲更合理的实现。

## 累计预算

| 阶段 | 新增核心行数 | 累计核心行数 | 测试新增行数 | 累计测试行数 |
| --- | ---: | ---: | ---: | ---: |
| 01 | 990 | 990 | 240 | 240 |
| 02 | 750 | 1740 | 260 | 500 |
| 03 | 860 | 2600 | 260 | 760 |
| 04 | 680 | 3280 | 290 | 1050 |
| 05 | 500 | 3780 | 180 | 1230 |
| 06 | 900 | 4680 | 300 | 1530 |
| 07 | 500 | 5180 | 240 | 1770 |
| 08 | 600 | 5780 | 220 | 1990 |
| 09 | 400 | 6180 | 160 | 2150 |
| 10 | 720 | 6900 | 250 | 2400 |
| 11 | 400 | 7300 | 160 | 2560 |
| 12 | 820 | 8120 | 320 | 2880 |
| 13 | 1100 | 9220 | 420 | 3300 |
| 14 | 1190 | 10410 | 350 | 3650 |
| 15 | 650 | 11060 | 260 | 3910 |

## 模块预算

| 模块 | 预算行数 | 内容 |
| --- | ---: | --- |
| `foundation/` | 560 | model、message/part/thinking、tool、tool summary、result、UiEvent、JSON schema |
| `agent/` | 1180 | generic loop、middleware pipeline、ToolUse assembly、HumanInteractionManager、ToolResult formatter、turn/session orchestration、retry/recovery |
| `coding/` | 2650 | build/plan profiles、coding prompt、file tools、bash、tool result policies、plan tools、Context Kernel、context quality、patch wrapper |
| `community/` | 650 | OpenAI-compatible adapter、reasoning split、fixture replay、provider factory、tool conversion |
| `ui/` | 1160 | Ink first-run、chat shell、input editor、command input hook、command registry、PromptSubmission、render batching、approval/question prompts、slash picker、plain renderer |
| `session/` | 600 | bun:sqlite transcript schema、messages/parts、resume、history projection、export |
| `patch/` | 420 | parser、apply、diff summary |
| `mcp/` | 380 | config、stdio client、tool adapter |
| `skills/` | 570 | multi-directory discovery、frontmatter scan、PromptSubmission explicit activation、progressive loader、router |
| `memory/` | 1180 | Memory v0 CRUD, typed/scoped store, retrieval ranking, post-turn extraction, citations, lifecycle, secret guard |
| `agents/` | 280 | sub-agent definitions、runner、side transcript |
| `permissions/` | 650 | policy engine、approval middleware、audit、scoped remembered approvals |
| `config/diagnostics/` | 780 | config YAML、layered settings、settings merge/explain、provider presets、doctor、debug events、context trace export |

## 控制策略

| 风险 | 控制方式 |
| --- | --- |
| 抽象膨胀 | `foundation` 只放协议类型；业务能力进入 `coding` 或 middleware |
| Bun API 锁死 | Bun-first，但 provider/MCP 等外部 SDK 通过 adapter 隔离 |
| TUI 过早复杂 | Ink 先服务 first-run、current-turn、approval/question；完整 chat shell 到 Stage 04 |
| 输入层变成一坨 key handling | input editor 做纯 reducer，command input hook 做键盘状态机，Stage 04 必须有单测 |
| Thinking 泄漏到用户正文 | provider adapter 拆分 thinking/text，renderer 默认隐藏 thinking，plain 禁止裸打 `<think>` |
| HITL 和 UI 耦合 | approval/question/plan/MCP/OAuth 走 HumanInteractionManager queue，工具层不 import Ink |
| 终端闪烁 | renderer batching 以 30-80ms flush 高频事件，边界事件立即刷新 |
| Settings 合并失控 | 只对 allow/deny 类字段做 union；普通字段覆盖；`.kai/settings.local.json` 默认 gitignore |
| Slash 被做成纯命令 | command registry 返回 PromptSubmission metadata 或 local action，middleware/profile 决定上下文效果 |
| Context 地基太薄 | Stage 06 必须落 ContextItem + ModelInputBuilder，后续 skill/memory/sub-agent 不允许旁路拼 prompt |
| Context 优化变玄学 | Stage 15 只基于真实 trace、eval fixture、metric report 调 budget/ranking/compaction |
| Plan mode 过深 | Stage 05 只做 plan/build switching；完整 restore 和统一权限迁移到 Stage 12 |
| Skills 膨胀上下文 | 只扫描 frontmatter，命中后 progressive loading |
| Memory 误存和过期 | Stage 10 只手动写入，Stage 13 加 secret guard、citations、stale/merge/delete lifecycle |
| Bash 复杂度上涨 | Stage 02 前台执行，Stage 08 hardening，Stage 14 background/status |

## 每阶段预算验收

1. `bun run check` 通过。
2. `bun test` 通过。
3. `bunx cloc src tests` 或等价统计不明显偏离预算。
4. 若某阶段超预算，优先删重复 adapter、合并轻量模块、延后可选体验；不要为了省行数破坏公开接口边界。
