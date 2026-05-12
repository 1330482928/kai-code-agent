# Stage 02: Core Tools

## 1. 本阶段目标

引入最小工具系统：`read_file`、`write_file`、`edit_file`、`bash`。模型可以请求工具，Agent 执行后把 ToolResult 回传，再由 provider 继续产出最终回答。`bash` 的名称和最终产品形态向 Claude Code BashTool 靠拢，但 Stage 02 只实现最小前台命令执行：`command`、`timeout`、`description`、stdout/stderr preview、exitCode。

闭环可调试性声明：本阶段完成后，可运行第 7 节中的 Demo commands 验证 CLI、测试和核心场景。

## 2. 前置依赖

| 依赖 | 用途 |
| --- | --- |
| Stage 01 | CLI、loop、provider event 基础 |
| zod | 工具入参校验 |
| Node `fs/promises` | read/write |
| Node `child_process.spawn` | bash 命令执行 |

## 3. 三家方案对比

### 3.1 Tool 定义对比

| 维度 | OpenCode | Claude Code | Codex | 我们的选择 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 工具接口 | `Tool.Def` + Context | tool object + runToolUse | ToolHandler trait | `ToolDef<TInput>`；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| schema | 标准 schema 包装 | zod/自定义 schema | JSON schema/protocol | zod 作为内部权威；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| 输出 | title/output/metadata | tool_result block | protocol item | `{ ok, output, metadata }`；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |

### 3.2 Tool Registry 对比

| 维度 | OpenCode | Claude Code | Codex | 我们的选择 | 理由 |
| --- | --- | --- | --- | --- | --- |
| builtin | registry 初始化内置工具 | 工具由上下文选择 | registry handler | 手工注册三件套；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| 自定义工具 | 支持本地动态加载 | skills/agents 可扩展 | MCP handler 扩展 | Stage 13 再做插件；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| provider 暴露 | 按模型过滤工具 | 按权限/模式过滤 | 按协议暴露 | 只暴露 enabled tools；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |

### 3.3 执行策略对比

| 维度 | OpenCode | Claude Code | Codex | 我们的选择 | 理由 |
| --- | --- | --- | --- | --- | --- |
| read/write | 工具内部处理权限和诊断 | 读状态影响编辑 | sandbox/approval 强 | Stage 02 只限制 cwd；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| bash | parse + ask + run | BashTool schema + progress/background | sandbox 外层 | 名称和目标形态参考 Claude Bash，Stage 02 执行骨架参考 OpenCode；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |
| 并发 | processor 跟踪 toolcalls | 读工具可并发 | handler 支持 parallel 标记 | Stage 02 串行；参考 §4 源码引用 | 个人项目优先小代码量、可调试、阶段闭环。 |

## 4. 源码引用（必读清单）

| 来源 | 行号 | 参考点 |
| --- | --- | --- |
| `$OPENCODE_REPO/packages/opencode/src/tool/tool.ts` | L16-L45 | Tool.Context 与 ExecuteResult |
| `$OPENCODE_REPO/packages/opencode/src/tool/tool.ts` | L79-L127 | schema 校验、执行、截断包装 |
| `$OPENCODE_REPO/packages/opencode/src/tool/registry.ts` | L114-L132 | builtin 工具初始化 |
| `$OPENCODE_REPO/packages/opencode/src/tool/read.ts` | L29-L87 | read 参数、目录和不存在文件处理 |
| `$OPENCODE_REPO/packages/opencode/src/tool/write.ts` | L38-L90 | write、format、diagnostics 流程 |
| `$OPENCODE_REPO/packages/opencode/src/tool/shell.ts` | L261-L307 | 命令 parse、approval、process 创建 |
| `$CLAUDE_CODE_REPO/src/tools/BashTool/BashTool.tsx` | L227-L294 | BashTool 输入/输出 schema，作为 Kai `bash` 的目标形态 |
| `$CLAUDE_CODE_REPO/src/tools/BashTool/BashTool.tsx` | L852-L1142 | progress、background、long-running command 的后续增强方向 |
| `$CLAUDE_CODE_REPO/src/services/tools/toolOrchestration.ts` | L86-L176 | 读工具并发、危险工具串行的后续方向 |

## 5. 本阶段架构图（mermaid）

```mermaid
flowchart LR
  Loop["Agent Loop"] --> Registry["Tool Registry"]
  Registry --> Read["read_file"]
  Registry --> Write["write_file"]
  Registry --> Edit["edit_file"]
  Registry --> Bash["bash"]
  Read --> Result["ToolResult"]
  Write --> Result
  Edit --> Result
  Bash --> Result
  Result --> Loop

  classDef existing fill:#eef2ff,stroke:#4f46e5,color:#111;
  classDef new fill:#e8f5e9,stroke:#2e7d32,color:#111;
  class Loop existing;
  class Registry,Read,Write,Edit,Bash,Result new;
```

## 6. 详细设计

### 6.1 模块清单

| 文件路径 | 职责 | 预计行数 | 主要导出 |
|---|---|---:|---|
| `src/tools/types.ts` | ToolDef、ToolContext、ToolResult | ~80 | `types` |
| `src/tools/registry.ts` | 注册、查找、provider schema 转换 | ~90 | `ToolRegistry` |
| `src/tools/runner.ts` | zod 校验、异常捕获、输出 cap | ~90 | `runTool` |
| `src/tools/read.ts` | 读取文件、目录提示、offset/limit | ~100 | `readFileTool` |
| `src/tools/write.ts` | 写入文件、返回摘要 | ~90 | `writeFileTool` |
| `src/tools/edit.ts` | old/new string 精准替换、replaceAll、diff 摘要 | ~130 | `editFileTool` |
| `src/tools/bash.ts` | Claude-like BashTool 最小版：spawn、timeout、stdout/stderr preview、exitCode | ~160 | `bashTool` |
| `src/agent/toolLoop.ts` | tool call -> result -> continuation | ~60 | `runToolLoop` |

### 6.2 关键接口

```ts
export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  sessionId: string;
  toolCallId: string;
  emit(event: ToolRuntimeEvent): void;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  metadata?: Record<string, JsonValue>;
}

export type ToolRuntimeEvent =
  | { type: "bash_progress"; toolCallId: string; output: string; elapsedMs: number; totalBytes: number };

export interface BashToolInput {
  command: string;
  timeout?: number;
  description?: string;
}

export interface BashToolResult {
  stdoutPreview: string;
  stderrPreview: string;
  exitCode: number | null;
  interrupted: boolean;
  outputBytes: number;
  persistedOutputPath?: string;
}
```

`bashTool` 的结构化结果放在 `ToolResult.metadata.bash` 中；`ToolResult.output` 只保存给模型和用户阅读的摘要。为避免冗余，Stage 02 不在 `metadata.bash` 中保存完整 stdout/stderr，只保存 preview、输出字节数和可选 persisted output path。Stage 02 先不主动 emit progress，但 `ToolContext.emit` 从一开始预留，Stage 03 直接接入 `bash_progress`。

### 6.3 关键算法 / 数据流

1. Provider event 出现 `tool_call`。
2. registry 根据 name 找到 ToolDef。
3. runner 用 zod 校验 JSON input。
4. 执行工具，捕获错误为 `ok:false`。
5. loop 将 ToolResult 追加成 tool message，再继续 provider。

## 7. 实施步骤（Step-by-step）

1. 定义工具内部协议和 provider tool schema 转换。
2. 实现 registry 和 runner。
3. 实现 `read_file`，支持文本文件和目录提示。
4. 实现 `write_file`，限制在 cwd 内。
5. 实现 `edit_file`，要求 oldString 唯一匹配，必要时 replaceAll。
6. 实现 `bash`，默认 30 秒 timeout，输出 stdoutPreview/stderrPreview/exitCode/interrupted/outputBytes 到 `metadata.bash`；暂不支持 `run_in_background`。
7. 扩展 mock provider：可按 fixture 触发 tool call。

Demo commands:

```bash
pnpm kai run --provider mock --script fixtures/read-file.json "read package"
pnpm kai run --provider mock --script fixtures/bash.json "run pwd"
pnpm test -- stage-02
```

## 8. 验收标准

| 验收项 | 标准 |
| --- | --- |
| 工具可注册 | registry 能列出四种工具 |
| read 可用 | 读取 cwd 内文本文件并返回内容摘要 |
| write 可用 | 写入 cwd 内新文件并返回路径 |
| edit 可用 | 对 cwd 内文本文件做唯一 old/new 替换 |
| bash 可用 | 执行 `pwd`、`ls` 等短命令，返回 stdout/stderr preview 和 exitCode |
| bash metadata | BashToolResult 固定写入 `ToolResult.metadata.bash` |
| 错误回传 | schema 错误和执行错误都转成 ToolResult |
| 代码预算 | 累计核心代码约 1200 行 |

## 9. 已知限制 & 下一阶段衔接

此阶段 `bash` 只有基础 timeout，没有权限询问、progress event、长任务后台化和大输出持久化；write 没有 diff 和 LSP 诊断。下一阶段补 stream processor 和 CLI 工具状态展示，并为 Stage 03 的 `bash_progress` 事件预留通道。
