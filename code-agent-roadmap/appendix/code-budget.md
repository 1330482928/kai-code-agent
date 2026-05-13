# Appendix: Code Budget

核心代码目标是 6.9K 行，允许实现期间在 6.5K 到 8.5K 行内浮动。测试、fixtures、docs 不计入核心预算。真实 LLM API 接入、首次配置向导、Bash 相关任务表、只读状态工具和大输出管理被纳入 v0.1，而不是为压线强行推迟。

## 累计预算

| 阶段 | 新增核心行数 | 累计核心行数 | 测试新增行数 | 累计测试行数 |
| --- | ---: | ---: | ---: | ---: |
| 01 | 850 | 850 | 180 | 180 |
| 02 | 800 | 1650 | 250 | 430 |
| 03 | 500 | 2150 | 120 | 550 |
| 04 | 300 | 2450 | 120 | 670 |
| 05 | 300 | 2750 | 100 | 770 |
| 06 | 600 | 3350 | 180 | 950 |
| 07 | 500 | 3850 | 220 | 1170 |
| 08 | 400 | 4250 | 150 | 1320 |
| 09 | 400 | 4650 | 160 | 1480 |
| 10 | 500 | 5150 | 150 | 1630 |
| 11 | 400 | 5550 | 150 | 1780 |
| 12 | 300 | 5850 | 120 | 1900 |
| 13 | 1000 | 6850 | 300 | 2200 |

## 模块预算

| 模块 | 预算行数 | 内容 |
| --- | ---: | --- |
| `cli/` | 520 | command parse、first-run entrypoint、config commands、tasks list/read |
| `agent/` | 850 | loop、turn、stream、retry、recovery |
| `provider/` | 520 | OpenAI-compatible adapter、fixture replay、factory、tool conversion |
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
| `config/telemetry/` | 420 | user config YAML、first-run wizard、provider presets、debug events、bash task lifecycle |

## 控制策略

| 风险 | 控制方式 |
| --- | --- |
| 抽象膨胀 | Bash 任务表和 `bash_status` 作为明确例外，其它模块仍按阶段最小化 |
| Provider 兼容过度 | Stage 01-08 只支持 OpenAI-compatible + fixture provider；新增 vendor 通过 preset 映射，不新增 adapter |
| UI 过早复杂 | Stage 03 只做文本流和工具状态 |
| MCP 过深 | Stage 09 只做 tools/list + tools/call |
| 权限过深 | Stage 12 先做路径、bash、patch 三类决策 |

## 每阶段预算验收

1. `pnpm lint` 通过。
2. `pnpm test` 通过。
3. `pnpm exec cloc src tests` 或等价统计不明显偏离预算。
4. 若某阶段超预算，优先删重复 adapter、合并轻量模块、延后可选体验。
