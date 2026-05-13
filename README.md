# Kai Code Agent

Kai Code Agent is a personal code-agent project planned from Claude Code, OpenCode, and Codex references. The current repository is intentionally small: it keeps the design roadmap in place and adds a TypeScript CLI scaffold that can grow stage by stage.

## Current Shape

- `src/cli`: command-line entrypoint.
- `src/tools`: shared tool interfaces and result contracts.
- `src/bash`: future Claude-Bash-like shell tool implementation.
- `src/session`: session and persistence layer.
- `src/provider`: model provider adapters.
- `src/context`: context building and compaction.
- `src/memory`: staged memory system, from manual Memory v0 to scoped/cited lifecycle memory.
- `src/prompt`: system prompt and prompt assembly.
- `src/mcp`: MCP integration.
- `src/permissions`: command and filesystem approval policies.
- `code-agent-roadmap`: design notes, architecture, and staged implementation plan.
- `openspec`: OpenSpec workspace for future behavior specs.

## Development

```bash
bun install
bun run dev
bun run check
bun test
```

The CLI is currently a scaffold. Start implementation from `code-agent-roadmap/stages/stage-01-minimal-loop.md`, then evolve toward the Bash/session/tooling/memory plan described in the roadmap.

## Repository Notes

Generated runtime state should stay out of Git. Use `.kai/sessions`, `.kai/tmp`, and `.kai/tool-results` for local agent runs.
