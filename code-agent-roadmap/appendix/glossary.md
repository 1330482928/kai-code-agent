# Appendix: Glossary

| 术语 | 含义 |
| --- | --- |
| Agent loop | 一次或多次模型调用、工具调用、结果回传组成的任务循环 |
| Turn | 用户输入到 agent 停止之间的一轮交互 |
| Message | provider 可理解的对话消息 |
| Part | message 内部的文本、推理、tool_use、tool_result 等片段 |
| ToolDef | Kai 内部工具定义，包含 name、description、schema、execute |
| ToolCall | 模型请求调用某个工具的一次动作 |
| ToolResult | 工具执行后回传给模型的结构化结果 |
| Stream Processor | 把 provider stream event 转换为 UI event、tool action、session part 的模块 |
| Compaction | 将历史消息总结为摘要，保留最近上下文以控制 token |
| Snapshot | 某个 turn 或工具前后的会话状态记录 |
| Permission Policy | 对 bash、文件写入、patch、MCP 的 auto/ask/reject 规则 |
| Bash Tool | 模型可调用的命令执行工具。名称和目标形态参考 Claude BashTool，Stage 02 先实现前台执行 |
| Approval | 需要用户确认后才执行的动作 |
| MCP | Model Context Protocol，用于连接外部工具和资源 |
| Skill | 带 frontmatter 和说明的能力包，用于提示词和工具选择 |
| Sub-agent | 在隔离上下文里执行子任务的 agent 实例 |
| Side transcript | 子 Agent 运行过程的单独消息记录 |
| Provider Adapter | 把内部 message/tool 转换为某个 LLM API 的模块 |
| Fixture Provider | 不访问网络、按 fixture 重放 ProviderEvent 的测试 provider |
| Apply Patch | 结构化补丁协议，用于安全地新增、修改、删除文件 |
