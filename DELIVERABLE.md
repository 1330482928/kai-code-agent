# Kai Code Agent Roadmap Deliverable

本轮只产出文档体系，不写实际实现代码。所有文档位于 `kai-code-agent/code-agent-roadmap/`，该目录可作为后续个人 Code Agent 项目的规划根。

## 1. 文档清单与统计

统计口径：字数按 Markdown 字符数近似统计；图按 `mermaid` 代码块统计；表按连续 Markdown 表格块统计。

| 文档 | 约字数 | 图 | 表 | 说明 |
| --- | ---: | ---: | ---: | --- |
| `code-agent-roadmap/README.md` | 5.0K | 3 | 4 | 项目愿景、X/Y 能力曲线、阶段索引、全局架构、预算、学习路线 |
| `code-agent-roadmap/00-design-principles.md` | 3.5K | 0 | 8 | 参考边界、不做清单、技术选型、代码风格、安全原则 |
| `code-agent-roadmap/01-references-map.md` | 9.0K | 1 | 4 | OpenCode、Claude Code、Codex 文件级引用与 Kai 模块映射 |
| `code-agent-roadmap/architecture/final-architecture.md` | 4.4K | 1 | 2 | 最终态模块架构、数据流和关键接口 |
| `code-agent-roadmap/appendix/code-budget.md` | 1.8K | 0 | 3 | 6.4K 核心代码预算与测试预算 |
| `code-agent-roadmap/appendix/tech-choices.md` | 1.7K | 0 | 7 | Runtime、CLI、数据、Provider、MCP、测试选型 |
| `code-agent-roadmap/appendix/glossary.md` | 0.9K | 0 | 1 | 术语表 |
| `code-agent-roadmap/stages/stage-01-minimal-loop.md` | 4.0K | 1 | 7 | 最小 Agent loop |
| `code-agent-roadmap/stages/stage-02-core-tools.md` | 5.0K | 1 | 7 | Read/Write/Edit/Bash 四件套 |
| `code-agent-roadmap/stages/stage-03-streaming-cli.md` | 4.7K | 1 | 7 | 流式 CLI 与工具状态 |
| `code-agent-roadmap/stages/stage-04-session-persistence.md` | 4.3K | 1 | 7 | SQLite session 与 resume |
| `code-agent-roadmap/stages/stage-05-system-prompt.md` | 4.4K | 1 | 7 | prompt composer 与项目指令 |
| `code-agent-roadmap/stages/stage-06-context-mgmt.md` | 4.6K | 1 | 7 | compaction、prune、tail |
| `code-agent-roadmap/stages/stage-07-grep-glob-patch.md` | 5.0K | 1 | 7 | grep/glob/apply_patch |
| `code-agent-roadmap/stages/stage-08-failure-handling.md` | 4.4K | 1 | 7 | retry、错误回填、中断恢复 |
| `code-agent-roadmap/stages/stage-09-mcp-client.md` | 4.7K | 1 | 7 | MCP stdio client |
| `code-agent-roadmap/stages/stage-10-skill-memory.md` | 4.5K | 1 | 7 | Skill 与轻量 Memory |
| `code-agent-roadmap/stages/stage-11-sub-agent.md` | 4.6K | 1 | 7 | 同进程子 Agent |
| `code-agent-roadmap/stages/stage-12-permission.md` | 4.8K | 1 | 7 | 三档权限与审计 |
| `code-agent-roadmap/stages/stage-13-polish.md` | 4.3K | 1 | 7 | config、doctor、debug、发布整理 |
| `code-agent-roadmap/architecture/diagrams/stage-01.md` 到 `stage-13.md` | 6.6K | 13 | 0 | 每阶段独立 Mermaid 图 |

## 2. 自检清单结果

| 检查项 | 结果 |
| --- | --- |
| 13 份 stage 文档全部存在 | 通过 |
| stage 文件名与 prompt 目录结构一致 | 通过 |
| 每份 stage 按 9 节模板填写 | 通过 |
| 每份 stage 至少 3 张三家对比表 | 通过 |
| 对比表包含 OpenCode、Claude Code、Codex、我们的选择、理由 | 通过 |
| 每份 stage 有 Mermaid 架构图 | 通过 |
| 每份 stage 有 demo commands | 通过 |
| 每个阶段列出具体源码路径与行号 | 通过 |
| README 包含项目愿景、X/Y 能力曲线、阶段简介、全局架构、预算、学习路径 | 通过 |
| 代码预算落在 6.0K 到 8.0K 区间 | 通过，目标约 6.4K |
| 未复制参考项目实现或内部 prompt | 通过，所有引用均为路径级和设计级 |
| 未引入 Effect-TS，且说明原因 | 通过 |

## 3. 已知风险与开放问题

| 风险 | 说明 | 建议处理 |
| --- | --- | --- |
| Stage 02 的 Edit 初版较保守 | 只规划 old/new string 精准替换，复杂 LSP-aware 编辑后置 | 先实现唯一匹配和 replaceAll，再用 fixtures 加强 |
| 权限不是 OS 级沙箱 | Stage 12 是 agent 内 policy，不保证进程级隔离 | v0.2 再评估真实 sandbox |
| Provider API 会变化 | 真实 OpenAI/Anthropic API 需要实现时再查官方文档 | Stage 01-08 先用 mock + OpenAI-compatible 抽象 |
| MCP 范围刻意收窄 | Stage 09 只覆盖 stdio tools/list 和 tools/call | resources/prompts/elicitation 放到后续 |
| Token 估算不精确 | Stage 06 先用估算与 usage 回写 | 真实 provider 接入后校准 tokenizer |

## 4. 建议第一步

先从 `stage-01-minimal-loop.md` 开始，建立最小 `package.json`、`src/agent/loop.ts`、`src/provider/mock.ts` 和 `kai run --provider mock`。第一天的目标不是做工具，而是确保“用户输入 -> provider -> CLI 输出 -> 测试”这条线稳定可重复。
