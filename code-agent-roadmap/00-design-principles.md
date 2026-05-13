# 00 Design Principles

Kai Code Agent 的 v0.1 目标是一个可日常使用、可调试、可继续扩展的个人 code agent。路线从当前阶段开始调整为 Bun-first、transcript-first、Ink-first、middleware-first、plan-aware，但仍坚持小步闭环：每个阶段都要能跑真实 CLI、能用 fixture provider 验证行为、能用 OpenSpec 描述验收标准。

## 1. 核心原则

| 原则 | 含义 |
| --- | --- |
| Bun-first | Bun 是主 runtime、package manager、test runner 和 binary build 路线；Node stdlib 兼容只作为 fallback |
| Foundation first | Model、Message、Tool、UiEvent、Result、JSON schema 放在 `foundation`，避免 provider/agent/tools 互相缠绕 |
| Transcript first | Message transcript 是权威事实；UiEvent 是实时过程事件；TUI 是 transcript/event 的投影 |
| Context Kernel first | Stage 06 建立 `ContextItem[] -> ModelInput` 唯一出口，后续 skill/memory/sub-agent 不旁路拼 prompt |
| Middleware first | approval、skills、memory、todo、audit、plan guard 都通过 lifecycle hooks 接入，不写死在 agent loop |
| Ink first | CLI 不是 `console.log` 串起来的脚本；交互态优先走 Ink，脚本态保留 plain renderer |
| Plan-aware | 计划模式是早期核心能力，先实现窄约束 plan agent，再在 Stage 12 迁入统一 permission engine |
| Real API first | Stage 01 直接接真实 OpenAI-compatible API；fixture provider 只用于测试、CI 和 deterministic replay |
| Tool protocol stable | `ToolDef.execute(): Promise<ToolResult>` 保持简单；stream/progress 通过 `ToolContext.emit` 发出 |
| Complete ToolUse boundary | 流式 tool arguments 在 JSON 完整解析前不能成为可执行 ToolUse |
| Model-visible result formatting | 工具原始结果不等于回传给模型的结果，必须经过统一 formatter |
| Thinking separation | reasoning/thinking 是独立 part，默认不作为用户可见正文渲染 |
| HITL manager boundary | approval、question、plan approval 等交互先进入 manager queue，再由 UI 订阅和回答 |
| Shared tool summaries | tool_use 展示摘要由共享 `summarizeToolUse` 生成，plain/Ink 不各自拼 JSON |
| UI state discipline | 输入编辑、slash picker、renderer batching 都是 UI 内部状态，不进入 transcript 事实层 |
| Layered settings | user/project/project-local settings 有明确合并语义，approval persistence 不只存在 session 内 |
| Slash as context selector | slash command 可以产生下一轮 `PromptSubmission` metadata，而不只是执行本地命令 |
| Memory is scoped and auditable | memory 分层、类型化、可引用、可删除；不能把 transcript 或可从仓库推导的事实当长期记忆 |
| Safety by boundary | patch、bash、file、MCP 都先有结构化边界，再逐步增强权限策略 |

## 2. Transcript First 原则

| 规则 | 说明 |
| --- | --- |
| transcript 是事实源 | session store 持久化 `messages` 和 `parts`，它们是历史、工具调用、tool result、summary、token 统计和 resume 的权威数据 |
| UiEvent 是过程事件 | `UiEvent` 只负责实时展示和交互反馈，不应该成为长期状态的唯一来源 |
| TUI 是投影 | Ink/plain renderer 从 transcript 和当前 turn event 派生显示状态，不能拥有独立事实副本 |
| 可重放 | 重启后应能从 session messages/parts 重新投影出基本历史摘要和工具状态 |
| 可测试 | Stage 04 起加入 `replay session -> rendered history summary stable` 验收，防止 UI 状态和 agent 状态分裂 |

这个原则优先级高于 UI 便利性。TUI 可以缓存当前输入、hover、selection 等瞬时状态，但任务历史、tool_use 展示、todo snapshots、token count 和恢复上下文都必须能回到 message transcript 推导。

## 3. Context Kernel 原则

Stage 06 的核心不是“prompt 字符串拼接”，而是建立所有模型输入的预算、来源和审计边界。

| 规则 | 说明 |
| --- | --- |
| ContextItem 是统一货币 | profile、instruction、runtime、history、summary、plan、skill、memory、permission、sub-agent result 都先变成 `ContextItem` |
| ModelInputBuilder 是唯一出口 | AgentLoop、middleware、skills、memory、sub-agent 不能绕过 builder 手写 provider messages |
| 来源可解释 | 每个 item 记录 kind/source/priority/token/cutReason，`kai prompt --debug` 能解释为什么进入或被裁剪 |
| 预算分层 | 长期规则、当前任务、历史 tail、tool result、skill、memory 各有预算意识，不互相无限挤占 |
| tool pair 不拆散 | tool_use/tool_result pair 必须作为可执行协议边界保护，compaction 或裁剪不能让 continuation 失效 |
| cache 稳定预留 | 静态 rules/profile/instruction 尽量保持顺序和内容稳定，为 Stage 15 prompt cache 诊断预留 |
| 真实质量后置 | Stage 06 先做可解释地基；真实使用后的 ranking/budget/summary 调优放到 Stage 15 |

这条原则让“优化 Agent”不退化成到处改 prompt。工具系统、context、memory、skill 和 sub-agent 都是在生产更好的 ContextItem；最终 prompt 质量由统一 builder、预算策略、debug 和 eval 闭环保障。

## 4. Tool Call Stream Boundary

| 规则 | 说明 |
| --- | --- |
| partial arguments 只是原始片段 | provider stream 中的 tool argument delta 只能进入 accumulator，不能直接进入 runner、approval、TUI 参数展示或 session transcript 的 executable tool_use |
| JSON parse 是执行边界 | 只有参数缓冲能成功 JSON parse 后，才创建 `ExecutableToolUse` |
| middleware 只看完整 ToolUse | `beforeToolUse`、permission、approval、plan guard 都只能接收已解析的 `ExecutableToolUse` |
| UI 不展示半截参数 | TUI 可以显示“模型正在准备工具调用”，但不能把半截 JSON 当作 tool input 展示给用户审批 |
| 最终帧兜底 | provider finish 时仍无法 parse 的 tool call 变成非执行的 parse_error ToolResult / failure part，不进入工具执行 |
| 必测 fixture | fixture 必须覆盖多 chunk JSON 参数，验证 runner 只在完整 JSON 后执行 |

这个原则避免四类错误：模型还没吐完整参数时工具已执行、approval 展示错误参数、TUI 显示半截 tool_use、以及 session transcript 落入不可重放的半成品工具调用。

## 5. Model-visible ToolResult Formatting

| 规则 | 说明 |
| --- | --- |
| raw result 不是 model result | 工具内部可返回结构化 metadata、完整输出路径、诊断详情，但不能原样塞进模型上下文 |
| formatter 是一等公民 | `formatToolResultForModel(toolName, rawResult): string` 必须独立成模块，不能散落在各工具里 |
| 成功/失败统一 normalize | success/error 都转成稳定结构；失败必须推断 `error.kind`，不能随便扔字符串 |
| 按工具策略裁剪 | bash、grep、glob、MCP、大文件输出按 tool policy 截断或摘要；`read_file` 可按 limit 保留正文 |
| summary 和正文分离 | 某些工具只给模型 summary，完整内容通过 persisted path 或后续 read 工具读取 |
| transcript 可复现 | session part 同时记录 normalized raw result 摘要和 model-visible content，方便 replay/debug |

这个原则防止 bash 大输出、MCP 返回、搜索结果、大文件和异常堆栈污染上下文。工具可以收集丰富事实，但进入模型的内容必须小、稳定、结构化、可预算。

## 6. UI / Reasoning / HITL 边界

| 规则 | 说明 |
| --- | --- |
| thinking 不是正文 | provider adapter 必须把 `thinking` / `reasoning_content` / `<think>...</think>` 拆成独立 `thinking` part，不能混进普通 text |
| renderer 默认隐藏 thinking | Ink/plain 默认只展示 text、tool summary、tool result summary；thinking 只能在 debug 或折叠视图中显式查看 |
| plain renderer 不裸打 `<think>` | 即使 provider 返回原始 `<think>` 包裹内容，也必须先清洗和拆分，不能直接写 stdout |
| input editor 独立 | TUI 输入层拆为纯文本/光标操作和键盘状态机，避免把 key handling 写进主 App |
| HITL 走 manager queue | 工具和 middleware 不直接调用 Ink 组件，而是向 `HumanInteractionManager` enqueue request，UI 订阅 pending request 并 resolve promise |
| tool summary 共享 | `summarizeToolUse(toolUse)` 输出 `{ title, detail? }`，plain 和 Ink 只负责各自渲染 |
| renderer 批量提交 | stream delta 和密集 tool event 进入 pending queue，以约 30-80ms flush window 合并到 React state，避免终端闪烁 |

这个边界把“用户应该看到什么”和“agent 内部知道什么”分开。thinking 可以被记录用于调试，但不是普通回答；approval/question 可以被 Ink、plain、未来 MCP elicitation 或 OAuth prompt 复用；工具展示摘要稳定后，UI 不需要理解每个工具的输入结构。

## 7. Settings / Slash Context 原则

### 7.1 多层 Settings

模型密钥和 provider profile 继续放在用户级 `~/.kai-code-agent/config.yaml`，避免 API key 进入项目仓库。运行偏好、权限 allowlist、remembered approvals、默认 profile/mode、tool policy 等非密钥配置使用 layered settings：

| 层级 | 路径 | 用途 |
| --- | --- | --- |
| user settings | `~/.kai-code-agent/settings.json` | 用户全局偏好和全局 remembered approvals |
| project settings | `<project>/.kai/settings.json` | 项目共享设置，可提交到仓库 |
| project local settings | `<project>/.kai/settings.local.json` | 本机私有设置，默认进入 `.gitignore` |

合并语义：

| 字段类型 | 语义 |
| --- | --- |
| `allow` 类字段 | union 合并，例如 `permissions.allow`、`tools.bash.allowCommands`、`mcp.allowedServers` |
| `deny` / `reject` 类字段 | union 合并，并且最终决策里 deny 优先于 allow |
| 普通标量和对象 | 后层覆盖前层：user < project < project local < CLI flags < slash submission metadata |
| 未标注 union 的数组 | 后层覆盖前层，避免意外把列表越合越大 |
| approval persistence | 支持 session、project local、user 三类 scope；不应只存在 session 内 |

这个规则让“用户全局允许 read_file、项目允许特定 bash、本机私有允许 write_file”可以自然叠加，同时避免普通配置被不可预期地深度合并。

### 7.2 Slash 是上下文选择器

slash command 不只是执行本地 CLI 命令。Command registry 中的命令可以返回：

| 类型 | 含义 |
| --- | --- |
| local action | 例如 `/plan open`、`/resume list`，直接由 UI/CLI 处理 |
| prompt submission | 例如 `/plan`、`/skill`、`/profile`、`/model`、`/mode`，提交用户文本和 metadata 进入 agent loop |
| input transform | 改写当前输入，例如插入模板或补齐命令参数 |

`PromptSubmission.metadata` 是 slash picker 到 agent run context 的桥梁。显式 skill invocation 应提交 `requestedSkillName`，而不是直接在 UI 层读完整 `SKILL.md`；`/plan` 应提交 plan profile/mode metadata，进入 agent loop 后由 middleware/profile orchestration 生效。

## 8. Memory 原则

Memory 的职责是保存跨 turn、跨 session 仍有价值的信息，不是替代 transcript、instruction 文件、skills 或代码搜索。

| 规则 | 说明 |
| --- | --- |
| 分层 scope | 支持 `session`、`projectLocal`、`project`、`user`；`team` 和云同步后置 |
| 类型化 | 至少区分 `preference`、`feedback`、`decision`、`project`、`reference`、`fact` |
| 来源可追踪 | 每条 memory 记录 source session/message/tool/file、confidence、createdAt、updatedAt |
| 检索可解释 | 注入模型前做 top-k、budget、dedupe 和 score explain，不把 memory store 当全文上下文塞入 prompt |
| 写入保守 | Stage 10 先 manual CRUD；Stage 13 的自动提取默认产出候选，写入 user/project scope 需要 settings 或 HITL approval |
| 引用可审计 | 被注入模型的 memory 记录 citation，session export 可解释“为什么模型记得这个” |
| 生命周期完整 | stale、archive、delete、merge、refresh、promote 都有 CLI 和测试 |
| 隐私优先 | API key、token、cookie、private key、`.env` 值和敏感个人/客户数据不得进入长期 memory |
| 不保存可推导事实 | 可从当前仓库文件、README、AGENTS/CLAUDE/CONTEXT 稳定推导的信息优先由 context loader/search 获取 |

这个设计吸收三类成熟经验：OpenCode 的 instruction/context/compaction 更像“上下文组织”；Claude Code 的 relevant memory prefetch 和 post-turn extraction 适合个人 agent；Codex 的 memory citations、thread memory mode 和 consolidation 思路适合做可审计边界。Kai 采用 scoped local memory + explainable retrieval + conservative extraction，不在 v0.1 引入云同步或向量数据库。

## 9. 技术选择

| 领域 | 选择 | 理由 |
| --- | --- | --- |
| Language | TypeScript | 与 OpenCode、Ink、provider SDK、MCP SDK 生态匹配 |
| Runtime | Bun 1.3.x | 安装、运行、测试、打包链路短，适合个人 CLI 快速迭代 |
| Package manager | Bun | `bun install` + lockfile，减少双运行时/包管理链路复杂度 |
| Test runner | `bun:test` | 与 Bun runtime 同源，Stage 01 就能做快速 fixture tests |
| UI | Ink + plain renderer | Ink 承载交互体验；plain renderer 保持脚本友好 |
| Storage | `bun:sqlite` | session、memory、audit、bash task records 统一本地持久化 |
| File IO | `Bun.file` / `Bun.write` | Bun-first，同时保留必要 Node stdlib 兼容 |
| Shell | `Bun.spawn` | bash 工具名称和目标形态靠近 Claude Bash，执行实现走 Bun |
| Schema | Zod + JSON schema | 内部校验和 provider tool schema 可转换 |
| Build | `bun build --compile` | Stage 14 产出本地 binary |

## 10. 架构边界

| 层 | 可以知道 | 不应该知道 |
| --- | --- | --- |
| `foundation` | Model、Message、Part、ThinkingPart、Tool、ToolResult、UiEvent、Result、JSON schema | provider、coding prompt、具体工具实现 |
| `agent` | ReAct loop、middleware、turn/session orchestration | bash 细节、patch grammar、具体 provider SDK |
| `coding` | coding prompt、build/plan profiles、file/bash/patch/plan tools | provider transport 细节 |
| `community` | OpenAI-compatible、fixture、未来 provider adapters | coding tool 的内部实现 |
| `ui` | Ink/plain renderer、input editor、command registry、approval/question prompts、slash picker、PromptSubmission metadata | model provider 的请求协议、工具执行细节 |

## 11. Plan Mode 原则

Plan mode 采用 OpenCode-first + Claude approval：

| 设计点 | v0.1 选择 |
| --- | --- |
| 进入计划 | `/plan` 命令和模型可调用 `plan_enter` |
| 执行主体 | `plan` agent/profile，区别于普通 `build` agent |
| 工具限制 | 只允许 read/search/readonly bash/question，以及写 plan file |
| 计划文件 | 项目内 `.kai/plans/<created>-<slug>.md`；无项目时 fallback 到 `~/.kai-code-agent/plans` |
| 退出计划 | `plan_exit` 读取 plan file，通过 HumanInteractionManager 弹出 ApprovalPrompt |
| 交接 | 用户批准后切回 build agent，并把 approved plan 注入上下文 |
| 延后项 | Claude-style `prePlanMode` 完整 restore 到 Stage 12 再做 |

## 12. Middleware 原则

最小公共接口：

```ts
export interface Middleware {
  beforeAgentRun?(ctx: AgentRunContext): Promise<void>;
  afterAgentRun?(ctx: AgentRunContext): Promise<void>;
  beforeModel?(ctx: ModelContext): Promise<ModelInput | void>;
  afterModel?(ctx: ModelContext): Promise<void>;
  beforeToolUse?(ctx: ToolUseContext): Promise<ToolResult | void>;
  afterToolUse?(ctx: ToolUseContext): Promise<void>;
}
```

约束：

| 规则 | 说明 |
| --- | --- |
| loop 保持干净 | agent loop 只调 middleware pipeline，不直接写 approval/skills/memory 分支 |
| 可拦截工具 | `beforeToolUse` 可以直接返回 `ToolResult`，用于拒绝、批准失败、plan guard 等场景 |
| 可观察可测试 | middleware 必须能用 fixture context 独立测试 |
| 顺序显式 | middleware 注册顺序进入 debug event，避免隐藏行为 |

## 13. Human-in-the-loop 原则

| 类型 | 目的 | UI |
| --- | --- | --- |
| approval | 授权危险操作，或批准 plan | ApprovalPrompt |
| ask_user_question | 模型澄清需求、让用户做结构化决策 | AskUserQuestionPrompt |

`ask_user_question` 输入支持 1-4 个问题、每题 2-4 个选项、单选/多选、`label` / `description` / `preview`。它不是权限系统的一部分，不能替代 approval。

实现上，所有 HITL request 先进入 `HumanInteractionManager<TRequest, TResult>`。ApprovalPrompt、AskUserQuestionPrompt、plan approval、MCP elicitation、未来 OAuth/login prompt 都只是 manager 的消费者；工具层只等待 promise 结果，不依赖 Ink。

## 14. 非目标

| 非目标 | 原因 |
| --- | --- |
| v0.1 做完整 OS sandbox | 先做 agent 内权限边界，OS sandbox 需要跨平台成本 |
| 一次性复刻 Claude/OpenCode/Codex 全功能 | 只吸收可解释的架构模式和交互协议 |
| 早期支持所有 provider | Stage 01-08 只保 OpenAI-compatible + fixture，新增厂商先走 preset |
| 把所有 skill 内容塞进 prompt | Stage 10 采用 progressive loading，避免上下文膨胀 |
| 把 TUI 和 plain CLI 绑定死 | Ink 是主体验，plain renderer 仍服务脚本化和 CI |
| 让 UI 状态成为历史事实源 | 会导致 resume、token budget、tool history 和 TUI 展示分裂 |
| 让半截 tool arguments 泄漏到下游 | 会导致 runner、approval、UI 和 transcript 看到不可执行的半成品 |
| 把 raw tool output 原样塞回模型 | 会污染上下文、放大 token 成本，并让错误格式不可控 |
| 裸打印 provider thinking | 会把内部 reasoning 当成用户正文，破坏渲染边界和隐私/调试策略 |
| 让工具直接调用 TUI 组件 | 会让 tool layer 依赖 Ink，后续 plain renderer、MCP elicitation、OAuth prompt 难以复用 |
| 每个 stream delta 都触发 React commit | 会让终端闪烁、输入卡顿，并放大多工具并发时的渲染成本 |
| 只把 remembered approvals 存在 session | 用户和项目级信任决策无法复用，日常使用会反复审批 |
| 把 slash command 限定成本地命令 | 会阻断 `/skill`、`/profile`、`/model` 这类上下文选择能力 |
| 让每个能力自己拼 prompt | 会让 skill/memory/sub-agent/permission 互相污染上下文；Stage 06 必须统一 ContextItem 和 ModelInputBuilder |
| 把 memory 当 transcript 或全文知识库 | 会导致隐私泄漏、上下文膨胀、过期事实污染和错误记忆难以删除 |
| 自动无条件写入长期 memory | 用户反馈、临时事实、敏感信息可能被误存；Stage 13 必须经过 policy、secret guard 和可审计候选流程 |
| 在没有真实 trace 前过度调 context | 会把优化变成主观 prompt 微调；Stage 15 才基于 dogfooding trace、eval/replay 和 metrics 调 ranking/budget |

## 15. 选型变化记录

| 旧口径 | 新口径 | 影响 |
| --- | --- | --- |
| Previous Node-based primary stack | Bun/Bun package manager/bun:test primary | package、test、build、docs 命令统一迁移 |
| TUI 不早于 Stage 04 | Ink 从 Stage 01 first-run setup 开始进入 | approval/question/chat 体验更早成型 |
| UI-first session 状态 | Transcript-first session 状态 | 重启恢复和历史投影不依赖 TUI 内存状态 |
| permission/skills 后期硬接 loop | middleware Stage 03 引入 | 后续扩展不反复改主循环 |
| Stage 05 system prompt | Stage 05 plan mode | prompt composer 和 context management 合并到 Stage 06 |
| Stage 06 只是 prompt composer | Stage 06A Context Kernel / ModelInput builder + Stage 06B compaction/debug/budget | 后续 skill/memory/sub-agent 都通过 ContextItem 注入，context 架构先立住 |
| renderer 直接消费 provider 文本 | provider 拆分 text/thinking/tool_use | 避免 `<think>` 裸输出和工具参数半截泄漏 |
| prompt 组件被工具直接调用 | HITL manager queue | approval/question/plan/MCP/OAuth 交互可复用、可测试 |
| session-only approval memory | layered settings + scoped approval persistence | 常用信任决策可按 user/project-local 复用 |
| slash command 只是本地动作 | slash command 可产生 PromptSubmission metadata | skills/profile/model/mode 能影响下一轮 agent context |
| memory 附属于 skills | Stage 10 manual memory v0 + Stage 13 dedicated memory system | 长期记忆有独立 scope/type/retrieval/citation/lifecycle，避免和 skill/context 混淆 |
| v0.1 到 Stage 14 收尾 | 新增 Stage 15 context quality optimization | 真实使用后再做 trace/eval/replay 和 budget/ranking 调优 |
