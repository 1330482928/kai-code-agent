# Appendix: Code Budget

核心代码目标是 6.4K 行，允许实现期间在 6.0K 到 8.0K 行内浮动。测试、fixtures、docs 不计入核心预算。Bash 相关任务表、只读状态工具和大输出管理被纳入 v0.1，而不是为压线强行推迟。

## 累计预算

| 阶段 | 新增核心行数 | 累计核心行数 | 测试新增行数 | 累计测试行数 |
| --- | ---: | ---: | ---: | ---: |
| 01 | 400 | 400 | 120 | 120 |
| 02 | 800 | 1200 | 250 | 370 |
| 03 | 500 | 1700 | 120 | 490 |
| 04 | 300 | 2000 | 120 | 610 |
| 05 | 300 | 2300 | 100 | 710 |
| 06 | 600 | 2900 | 180 | 890 |
| 07 | 500 | 3400 | 220 | 1110 |
| 08 | 400 | 3800 | 150 | 1260 |
| 09 | 400 | 4200 | 160 | 1420 |
| 10 | 500 | 4700 | 150 | 1570 |
| 11 | 400 | 5100 | 150 | 1720 |
| 12 | 300 | 5400 | 120 | 1840 |
| 13 | 1000 | 6400 | 300 | 2140 |

## 模块预算

| 模块 | 预算行数 | 内容 |
| --- | ---: | --- |
| `cli/` | 400 | command parse、config path、entrypoint、tasks list/read |
| `agent/` | 850 | loop、turn、stream、retry、recovery |
| `provider/` | 300 | mock、OpenAI-compatible adapter、tool conversion |
| `tools/` | 1350 | registry、scheduler、read/write/edit/bash/bash_status/grep/glob |
| `patch/` | 400 | parser、apply、diff summary |
| `session/` | 520 | schema、store、resume、audit、bash metadata |
| `prompt/` | 350 | instructions、composer、runtime context |
| `context/` | 420 | token estimate、budget、compaction |
| `mcp/` | 380 | config、client、tool adapter |
| `skills/` | 330 | frontmatter、loader、router、memory |
| `agents/` | 280 | definitions、runner、side transcript |
| `permissions/` | 300 | policy、approval、path/bash safety |
| `ui/` | 240 | stream renderer、status lines |
| `config/telemetry/` | 280 | config load、debug events、bash task lifecycle |

## 控制策略

| 风险 | 控制方式 |
| --- | --- |
| 抽象膨胀 | Bash 任务表和 `bash_status` 作为明确例外，其它模块仍按阶段最小化 |
| Provider 兼容过度 | Stage 01-08 只支持 mock + OpenAI-compatible |
| UI 过早复杂 | Stage 03 只做文本流和工具状态 |
| MCP 过深 | Stage 09 只做 tools/list + tools/call |
| 权限过深 | Stage 12 先做路径、bash、patch 三类决策 |

## 每阶段预算验收

1. `pnpm lint` 通过。
2. `pnpm test` 通过。
3. `pnpm exec cloc src tests` 或等价统计不明显偏离预算。
4. 若某阶段超预算，优先删重复 adapter、合并轻量模块、延后可选体验。
