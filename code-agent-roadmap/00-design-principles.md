# 00 Design Principles

## 1. 参考代码使用边界

| 原则 | 说明 |
| --- | --- |
| 学行为，不搬实现 | 只记录模块职责、数据流、状态机和边界条件 |
| 写 TypeScript 原生实现 | 即使 Codex 是 Rust 参考，也只抽象规则再用 TS 重写 |
| 路径级引用 | 文档引用文件路径和行号，不长篇摘录源码 |
| 最小闭环优先 | 每阶段先做到可运行，再扩大边界 |
| 个人项目优先 | 不引入大型平台假设、远程服务依赖或复杂多租户模型 |

## 2. 架构原则

| 原则 | 设计选择 |
| --- | --- |
| Agent loop 是核心 | 所有能力都围绕 `runTurn()`、stream、tool result 回到模型 |
| Tool 是边界 | 文件、bash、MCP、skills、sub-agent 都以 tool 或 tool-like handler 接入 |
| Prompt 可解释 | system prompt 由静态规则、项目指令、上下文、skills 显式合成 |
| Context 可预算 | 每次模型调用前都计算 token 预算，溢出时压缩 |
| Permission 可审计 | 每次写文件、bash、MCP、patch 都留下决策记录 |
| Failure 是协议部分 | 错误需要回传给模型，不让 tool_use 悬空 |

## 3. 技术原则

| 领域 | 选择 | 理由 |
| --- | --- | --- |
| 语言 | TypeScript | 与 OpenCode 参考和 CLI 生态贴合 |
| Runtime | Node.js LTS | PTY、fs、sqlite、MCP SDK 兼容好 |
| Package manager | pnpm | monorepo 与 lockfile 可控 |
| CLI | commander 或 cac | 足够轻量，易测试 |
| Schema | zod | 工具输入、config、frontmatter 都可复用 |
| Storage | SQLite 起步，JSONL 作为 debug 导出 | 可查询、可恢复、便于审计 |
| Search | ripgrep subprocess | 性能好，行为接近成熟 agent |
| Patch | 自写 parser + applier | 控制安全边界，学习 Codex grammar |

## 4. 安全原则

1. 默认只读，写操作必须显式进入可写阶段。
2. bash 命令先解析、分类、预览，再决定 auto/ask/reject。
3. apply_patch 先解析 action，再按路径做 safety check。
4. MCP 工具默认按 server/tool 建立 approval mode。
5. 权限判断结果写入 session store，便于复盘。

## 5. 用户体验原则

| 场景 | 体验要求 |
| --- | --- |
| 普通聊天 | 文字连续流式输出，不被内部事件刷屏 |
| 工具调用 | 显示工具名、摘要、耗时、结果状态 |
| 文件编辑 | 显示 touched files 和 diff 摘要 |
| 错误 | 给出可恢复状态，不把内部堆栈直接甩给用户 |
| 长任务 | 每个 turn 可中断，工具需要响应 abort signal |

## 6. 不做清单

| 暂不做 | 原因 |
| --- | --- |
| Server/Client 分离架构 | 个人 CLI 优先，单进程更容易调试和部署 |
| 云端多用户服务 | 偏离个人 CLI 项目目标，也会放大权限和数据隔离成本 |
| OS 级 Sandbox | Stage 12 先用三档权限、路径策略和命令策略替代，真实沙箱放到 v0.2 |
| 完整 Plugin 系统 | 先用 ToolDef、MCP、Skill 覆盖扩展需求，避免过早设计市场/加载隔离 |
| Effect-TS | OpenCode 可学习 Effect 风格的边界管理，但 Kai 使用普通 async/Result，降低学习成本 |
| 完整 TUI | Stage 03 只做流式行级 CLI，Ink/TUI 留到核心闭环稳定后 |
| 向量 Memory | Stage 10 使用 SQLite 轻量 memory，向量检索会引入额外服务和评估成本 |
| 完整 IDE 插件 | Stage 13 后再评估，先把 CLI 做稳 |
| 自动修改 git 历史 | 高风险且不属于核心能力 |
| 复制参考项目内部 prompt | 合规风险高，且个人项目应形成自己的行为规则 |

## 7. 关键技术选型决策

| 维度 | 选择 | 备选 | 理由 |
| --- | --- | --- | --- |
| Runtime | Node.js LTS | Bun | Node 对 PTY、MCP SDK、sqlite 包和跨平台分发更稳 |
| ORM/DB | SQLite + 轻量 query helper | Prisma/Drizzle | schema 很小，直接 SQL 更省行数 |
| 流式 | AsyncIterable event pipeline | RxJS | 原生 async iterator 足够表达 provider/tool/UI 流 |
| HTTP | 原生 fetch | undici/axios | provider adapter 初版不需要额外封装 |
| CLI 框架 | commander 或 cac | clipanion | API 简单，测试方便 |
| 测试 | vitest | bun:test | Node runtime 下生态成熟 |
| 日志 | JSONL debug events | pino | 先追求可复盘，Stage 13 再评估结构化 logger |

## 8. 代码风格约定

| 维度 | 约定 |
| --- | --- |
| 命名 | 文件名用 camelCase 或短 kebab；导出类型用 PascalCase；工具名用 snake_case |
| 目录 | `agent/` 管 loop，`tools/` 管本地工具，`prompt/` 管输入合成，`permissions/` 管安全决策 |
| 错误处理 | 工具错误必须转成 ToolResult；provider 错误进入 retry/recovery；CLI 只显示摘要 |
| 日志 | 默认安静；开启 debug 后写 JSONL，包含 turn、tool、permission、compaction 事件 |
| 接口 | 内部接口稳定优先，provider/MCP/CLI 适配层负责转换 |

## 9. 阶段推进规则

每个阶段必须满足：

1. 有一条 demo 命令可以本地执行。
2. 有至少一个单元测试覆盖核心纯逻辑。
3. 有至少一个集成式 smoke test 覆盖 CLI 或 agent loop。
4. 文档中的模块预算与实际实现偏差不超过 20%。
5. 新增能力不破坏上一阶段 demo。
