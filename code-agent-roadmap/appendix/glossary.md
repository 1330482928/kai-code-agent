# Appendix: Glossary

| 术语 | 含义 |
| --- | --- |
| Agent loop | 一次或多次模型调用、工具调用、结果回传组成的任务循环 |
| Turn | 用户输入到 agent 停止之间的一轮交互 |
| Message | provider 可理解的对话消息 |
| Part | message 内部的文本、推理、tool_use、tool_result 等片段 |
| Thinking Part | provider reasoning/thinking_content 或 `<think>` 内容拆出的非默认展示 part，不等同于用户可见正文 |
| Reasoning Content | 模型内部推理或供应商 reasoning 字段；默认只用于 debug/session policy，不裸输出 |
| Message Transcript | 由 session store 持久化的 messages/parts 权威历史，是 resume、token budget、UI history projection 的事实源 |
| UiEvent | 当前 turn 的实时过程事件，用于渲染文本流、工具状态和进度，不作为长期历史事实源 |
| ToolDef | Kai 内部工具定义，包含 name、description、schema、execute |
| ToolCall | 模型请求调用某个工具的一次动作 |
| Tool Argument Accumulator | 累积 provider stream 中 tool argument delta 的组件，只有 JSON parse 成功后才产出可执行 ToolUse |
| Executable ToolUse | 已解析、可校验、可审批、可执行的工具调用；半截参数不允许成为 Executable ToolUse |
| ToolResult | 工具执行后的内部结构化结果，不等于直接回传给模型的文本 |
| Model-visible ToolResult | 经过 formatter 处理后回传模型的工具结果内容，需结构化、可截断、可预算 |
| ToolResult Formatter | `formatToolResultForModel(toolName, rawResult)`，把 raw tool result 转成模型可见内容 |
| ToolUse Summary | `summarizeToolUse(toolUse)` 生成的 `{ title, detail? }`，用于 plain/Ink 的 tool-specific 展示 |
| Foundation Layer | Kai 的协议底座，定义 Model、Message、Tool、UiEvent、Result、JSON schema |
| Community Provider | 位于 `community` 层的 provider adapter，例如 OpenAI-compatible、fixture 和后续 Anthropic adapter |
| Stream Processor | 把 provider stream event 转换为 UI event、tool action、session part 的模块 |
| Middleware | agent lifecycle hook 机制，可在 model/tool 前后观察、修改或拦截行为 |
| Human Interaction Manager | approval、ask_user_question、plan approval、MCP elicitation 等请求的 queue/subscribe/resolve 抽象，避免工具直接依赖 TUI |
| Input Editor | TUI 输入框的纯文本和光标 reducer，负责 insert/move/backspace/delete/history 等可单测逻辑 |
| Command Registry | slash command 的注册表，先包含 builtins，Stage 10 接入 skills 显式触发 |
| PromptSubmission | 用户输入进入 agent loop 的提交对象，包含 text 和 slash/profile/model/skill 等 metadata |
| Slash Context Selector | slash command 的一种形态，返回 PromptSubmission metadata 影响下一轮 agent context，而非直接执行本地命令 |
| ContextItem | Stage 06 起模型上下文的统一单位，包含 kind、source、content、priority、token 估算和 debug metadata |
| Context Kernel | 把 profile、instruction、runtime、history、summary、skill、memory、sub-agent result 等 ContextItem 统一排序、预算、裁剪和审计的层 |
| ModelInputBuilder | `ContextItem[] -> ModelInput` 的唯一出口，负责生成 provider system/messages/tools/generation/debug |
| Prompt Debug Snapshot | 记录每个 ContextItem 是否进入模型、token 估算、裁剪原因、hash 和最终 ModelInput 摘要的调试快照 |
| Context Quality Trace | Stage 15 从真实 session 导出的上下文质量样本，包含 ContextItem、budget、cutReason、ModelInput digest 和 outcome |
| Context Eval Fixture | 用于重放 Context Kernel 的测试样本，包含 critical facts、forbidden facts 和期望保留/裁剪规则 |
| Context Replay | 使用 fixture deterministic 重建 ContextItem 裁剪、compaction 和 ModelInput 的验证过程 |
| Renderer Batcher | 将 stream event 暂存并按 30-80ms window flush 到 Ink state 的组件，减少终端闪烁 |
| Layered Settings | user/project/project-local 三层 settings 合并模型，用于偏好、权限和 remembered approvals |
| Project Local Settings | `<project>/.kai/settings.local.json`，保存本机私有设置和 approvals，默认 gitignore |
| Settings Merge | `allow` 类字段 union，`deny` 类字段 union 且优先，普通字段按 user < project < projectLocal 覆盖 |
| Compaction | 将历史消息总结为摘要，保留最近上下文以控制 token |
| Snapshot | 某个 turn 或工具前后的会话状态记录 |
| Permission Policy | 对 bash、文件写入、patch、MCP 的 auto/ask/reject 规则 |
| Bash Tool | 模型可调用的命令执行工具。名称和目标形态参考 Claude BashTool，Stage 02 先实现前台执行 |
| Approval | 需要用户确认后才执行的动作 |
| Ask User Question | 模型用于澄清需求的结构化提问工具，区别于权限审批 |
| Build Agent | 默认 coding agent profile，可读取、修改、运行命令并完成实现任务 |
| Plan Agent | 只读规划 agent profile，只能读/search/readonly bash/question，并写 plan file |
| Plan File | plan mode 产生的 Markdown 计划文件，项目内默认位于 `.kai/plans/<created>-<slug>.md` |
| Plan Exit | `plan_exit` 读取 plan file 并通过 HumanInteractionManager 触发 ApprovalPrompt，批准后切回 build agent |
| MCP | Model Context Protocol，用于连接外部工具和资源 |
| Skill | 带 frontmatter 和说明的能力包，用于提示词和工具选择 |
| Memory | 跨 turn/session 仍有价值的长期偏好、反馈、决策、项目约定或引用信息；不等同于 transcript、context 或 skill |
| Memory Scope | memory 的作用域，Stage 13 支持 `session`、`projectLocal`、`project`、`user`，团队/云同步后置 |
| Memory Type | memory 的类型，例如 `preference`、`feedback`、`decision`、`project`、`reference`、`fact` |
| Memory Record | 一条结构化 memory，包含 scope/type/status/text/source/confidence/timestamps 等字段 |
| Memory Candidate | post-turn extraction sub-agent 产出的候选记忆，经过 secret guard、dedupe、policy/HITL 后才可写入 |
| Memory Citation | memory 被注入模型上下文时记录的引用，用于解释和审计“为什么模型记得这个” |
| Memory Retrieval | 根据 query、scope、type、recency、citation、confidence 等信号检索 top-k memory 并注入 prompt 的过程 |
| Memory Extraction | turn 结束后由受限 sub-agent 从 transcript 中提取候选 memory 的过程，默认 dry-run 或受 policy 控制 |
| Memory Lifecycle | memory 的 stale、archive、delete、merge、refresh、promote 等治理流程 |
| Memory Secret Guard | 阻止 API key、token、private key、cookie、`.env` 值和敏感数据进入长期 memory 的安全组件 |
| Sub-agent | 在隔离上下文里执行子任务的 agent 实例 |
| Side transcript | 子 Agent 运行过程的单独消息记录 |
| Provider Adapter | 把内部 message/tool 转换为某个 LLM API 的模块 |
| Fixture Provider | 不访问网络、按 fixture 重放 ProviderEvent 的测试 provider |
| Apply Patch | 结构化补丁协议，用于安全地新增、修改、删除文件 |
