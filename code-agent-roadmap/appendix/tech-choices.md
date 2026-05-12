# Appendix: Tech Choices

## Runtime 与语言

| 选项 | 选择 | 理由 |
| --- | --- | --- |
| TypeScript vs Rust | TypeScript | 个人 CLI 开发快，OpenCode 可作为主参考 |
| Node.js vs Bun | Node.js LTS | PTY、sqlite、MCP SDK、测试生态更稳 |
| ESM vs CJS | ESM | 现代包默认，便于动态 import |

## CLI 与 UI

| 能力 | 技术 | 备注 |
| --- | --- | --- |
| 命令解析 | `commander` 或 `cac` | Stage 01 只需要 `kai run` 和 `kai chat` |
| 终端渲染 | `chalk` + 原生 stdout | Stage 03 后再考虑 Ink |
| Prompt 输入 | `readline/promises` | 先稳定，后续可换更好的 line editor |

## 数据与 Schema

| 能力 | 技术 | 备注 |
| --- | --- | --- |
| 输入校验 | `zod` | 工具 schema、config、frontmatter 统一 |
| 存储 | `better-sqlite3` 或 `sqlite` | Stage 04 引入 |
| Debug 导出 | JSONL | 便于复盘 stream event |
| Token 估计 | 轻量估算 + provider usage | Stage 06 先可用，再精细 |

## LLM Provider

| 能力 | 技术 | 备注 |
| --- | --- | --- |
| Mock provider | 本地 async generator | Stage 01 必须有 |
| OpenAI-compatible | Responses 或 Chat Completions adapter | 按最新官方 API 实现时再查文档 |
| Tool conversion | 内部 ToolDef -> provider tool schema | 避免工具和 provider 耦合 |

## 文件与 Bash

| 能力 | 技术 | 备注 |
| --- | --- | --- |
| 文件 IO | Node `fs/promises` | 统一走 workspace resolver |
| 搜索 | `rg` subprocess | 与成熟 agent 行为一致 |
| Bash | `child_process.spawn` | Stage 02 只做最小前台 Bash；目标形态参考 Claude BashTool，后续补 progress/background |
| Patch | 自写 parser/applier | 借鉴 Codex grammar，但 TS 实现 |

## MCP

| 能力 | 技术 | 备注 |
| --- | --- | --- |
| Client | 官方 MCP TS SDK | Stage 09 引入 |
| Transport | stdio 优先 | 本地个人工具足够 |
| Approval | server/tool policy | Stage 12 与全局 permission 合流 |

## 测试

| 类型 | 工具 | 覆盖 |
| --- | --- | --- |
| 单元测试 | `vitest` | parser、budget、permission、tools |
| CLI smoke | `execa` | `kai run` 和工具闭环 |
| Fixture | 临时 workspace | 文件编辑、grep、patch |
| Golden | JSONL snapshots | stream event 不漂移 |
