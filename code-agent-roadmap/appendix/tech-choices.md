# Appendix: Tech Choices

## Runtime And Toolchain

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| Runtime | Bun 1.3.x | 主运行时。Node stdlib 兼容只作为必要 fallback，不再把 Node 作为主路线 |
| Package manager | Bun | `packageManager: bun@1.3.x`，开发命令统一为 `bun install`、`bun run ...` |
| Test runner | `bun:test` | fixture provider、tool parser、middleware、session store 都用同一 runner |
| TypeScript | TS strict-ish | 保持库化边界清晰，避免 runtime magic |
| Build | `bun build --compile` | Stage 14 产出本地可执行 binary |

影响：

| 变化 | 影响 |
| --- | --- |
| 从上一套 Node-based 工具链转 Bun-first | 项目脚本、CI、文档、测试 fixture 都要统一迁移 |
| 优先 Bun API | file、bash、SQLite 的默认实现更短；需要为少数 SDK 兼容保留 adapter 边界 |
| binary release 提前纳入设计 | config path、asset path、fixture path 不能依赖源码目录假设 |

## UI

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| TUI | Ink + React | Stage 01 first-run setup 即采用，Stage 04 发展为 session-backed chat shell |
| Plain renderer | 保留 | `kai run ... --plain`、CI、脚本化输出需要稳定文本 |
| Input editor | pure reducer + hook | `input-editor.ts` 处理文本/光标，`use-command-input.ts` 处理键盘状态机 |
| Command registry | shared registry | builtins、`/plan`、skills 显式 invocation 共用同一注册表，返回 local action / PromptSubmission / input transform |
| Slash command picker | Ink command list | `/plan`、`/plan open`、skills、profile/model/mode context selection 都走统一入口 |
| Render batching | short flush window | 高频 stream delta 以 30-80ms 批量提交，边界事件立即 flush |
| Approval UI | Ink prompt | 权限审批和 plan approval 走 ApprovalPrompt |
| Structured question UI | Ink prompt | `ask_user_question` 展示 1-4 个问题和选项 |
| HITL manager | queue + subscribe/resolve | 工具/middleware 不直接依赖 Ink，approval/question/plan/MCP/OAuth prompt 可复用 |

## Data And Schema

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| Config | YAML | 用户配置默认在 `~/.kai-code-agent/config.yaml`，API key 不写项目根目录 |
| Settings | layered JSON | `~/.kai-code-agent/settings.json`、`.kai/settings.json`、`.kai/settings.local.json`，用于非密钥偏好、权限、remembered approvals |
| Project state | `.kai/` | plan files、局部状态和可提交/可忽略资产按类型分开 |
| Transcript store | `bun:sqlite` | messages、parts 是权威事实；session metadata、audit、memory、bash task records 作为关联数据 |
| Validation | Zod | 内部输入校验 |
| Provider tools | JSON schema | `ToolDef.inputSchema` 转成 OpenAI-compatible tools |
| Thinking parts | hidden/debug policy | provider reasoning_content、thinking 或 `<think>` 拆成独立 part，renderer 默认隐藏 |
| Context input | ContextItem + ModelInputBuilder | Stage 06 建立模型输入唯一出口，prompt debug 和 Stage 15 trace/eval 都基于这个结构 |

Settings 合并规则：`allow` 类字段 union，`deny` / `reject` 类字段 union 且 deny 优先；普通标量和对象后层覆盖；未标注 union 的数组后层覆盖。`.kai/settings.local.json` 是本机私有文件，默认应进入 `.gitignore`。`config.yaml` 继续只承担模型 profile/API key 等密钥相关职责。

## Provider

| Provider | 阶段 | 说明 |
| --- | --- | --- |
| OpenAI-compatible | Stage 01 | 真实 API 主路径。Minimax Global preset 使用 baseURL `https://api.minimax.io/v1`，内部 provider 类型为 `openai` |
| Fixture provider | Stage 01 | 只用于测试、CI、deterministic replay，不作为产品主路径 |
| Anthropic/others | Stage 14+ | 通过 `community` layer 增加 adapter，不污染 agent loop |

Provider adapter 必须输出结构化 `ProviderEvent`，其中用户可见文本和 reasoning/thinking 分离。兼容 provider 如果把 reasoning 包在 `<think>` 中，也要在 adapter 层拆出，plain renderer 不能裸打印。

## Tools

| 工具域 | 默认实现 | 说明 |
| --- | --- | --- |
| File read/write | `Bun.file` / `Bun.write` | 统一走 workspace resolver 和 path policy |
| Bash | `Bun.spawn` | 名称和目标形态向 Claude Bash 靠拢；progress 通过 `ToolContext.emit` |
| Search | `rg` subprocess | `rg` 不可用时再 fallback，默认不手写递归搜索 |
| Patch | Codex-style grammar | `apply_patch` 使用结构化 parser 和安全检查 |
| ToolResult formatting | `formatToolResultForModel` | raw tool result 统一 normalize/truncate/summary 后再回传模型 |
| ToolUse display | `summarizeToolUse` | bash/read_file/grep/apply_patch/todo/question 等展示 title/detail，不直接显示原始 JSON |
| SQLite | `bun:sqlite` | Stage 04 transcript/session，Stage 10 memory v0，Stage 12 audit，Stage 13 memory system，Stage 14 bash tasks，Stage 15 context trace index |
| MCP | MCP TypeScript SDK | Stage 09 先做 stdio `tools/list` + `tools/call` |

## Context

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| Context Kernel | `ContextItem[]` | profile、instruction、runtime、history、summary、plan、skill、memory、permission、sub-agent result 统一表达 |
| Model input | `ModelInputBuilder` | AgentLoop 和 middleware 不直接拼 provider messages，统一输出 system/messages/tools/generation/debug |
| Budget | per-kind budget + reserved output | 先保证当前任务、tool pair 和 tail，skill/memory 等扩展项受固定预算约束 |
| Compaction | summary message + recent tail | 原始 transcript 不删，summary 作为 ContextItem 回注 |
| Prompt debug | diff-friendly snapshot | 输出 item source/token/cutReason/hash，支撑 Stage 15 trace/eval/replay |
| Quality tuning | post-dogfooding eval | Stage 15 基于真实 trace 调 ranking、budget、dedupe、summary 和 prompt cache stability |

## Memory

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| Memory v0 | manual CRUD + relevant ContextItem injection | Stage 10 只做 `add/list/search/delete`、基础 scope/type 和 top relevant ContextItem 注入 |
| Memory system | typed/scoped local store | Stage 13 增加 `session/projectLocal/project/user` scope，`preference/feedback/decision/project/reference/fact` type |
| Retrieval | explainable ranking first | 先用 keyword/scope/type/recency/citation/confidence 组合评分；embedding/vector DB 后置 |
| Extraction | post-turn sub-agent candidates | extraction agent 只产出候选，默认 dry-run 或按 settings/HITL approval 写入 |
| Safety | secret guard + scope gate | API key、token、private key、cookie、`.env` 值和敏感数据不进入长期 memory |
| Citations | session audit | 被注入模型的 memory 记录 citation，便于解释“为什么模型记得这个” |
| Lifecycle | active/stale/archived + merge/delete | stale/archived 默认不注入；用户可以 explain、archive、delete、merge、refresh、promote |

## Testing

| 测试类型 | 工具 | 覆盖 |
| --- | --- | --- |
| Unit | `bun:test` | parser、schema、middleware、permission、context budget、ContextItem builder |
| Fixture integration | `bun:test` + fixture provider | agent loop、tools、session、plan flow |
| Context replay | `bun:test` + context fixtures | Stage 15 重放真实 trace，验证 critical facts、cutReason 和 prompt debug diff |
| CLI smoke | Bun subprocess | first-run、config、plain renderer、doctor |
| OpenSpec validation | `openspec validate --all --strict --no-interactive` | 需求和实现变更的一致性 |

## Commands

```bash
bun install
bun test
bun run check
bun run kai
bun build --compile
```

## Deferred Choices

| 事项 | 延后原因 |
| --- | --- |
| 完整 OS sandbox | Stage 12 先做 agent 内权限；OS sandbox 需要平台差异处理 |
| 多 provider 深度兼容 | 先保证 OpenAI-compatible 真实可用，再扩展 vendor adapter |
| 全量 MCP resources/prompts UI | Stage 09 只做 tools；resources UI 后续再设计 |
| 完整 Claude-style plan restore | Stage 05 只做 plan/build switching；Stage 12 再迁入统一 permission/profile restore |
| embedding/vector DB context retrieval | Stage 13/15 先用可解释 ranking 和真实 trace eval；需要后再引入 hybrid retrieval |
