# Stage 12: Full Permission Engine

## Context

Stage 03 introduced middleware and approval hooks. Stage 05 added a narrow plan guard. Stage 09 added MCP tool approval surfaces. Stage 11 added sub-agents. Stage 12 should unify these policy decisions so the run loop stops having separate safety paths for each capability.

The design goal is conservative: one permission engine, one decision shape, one audit record path, and one approval prompt path. Existing UI and middleware remain the contact surface; the permission engine only computes decisions.

## Decisions

### 1. Centralize permission evaluation

The engine evaluates a `PermissionAction` describing the tool kind, tool name, cwd, input payload, and active agent profile. It returns one of three decisions:

- `auto`: the tool may run immediately.
- `ask`: the tool requires approval via `HumanInteractionManager`.
- `reject`: the tool must not run.

### 2. Merge settings by scope

Permission configuration is loaded from user, project, and project-local settings layers. `allow`-style lists union together; deny/reject-style lists union together with deny precedence; other scalar and object fields follow later-layer override semantics.

Project-local settings are intended for private, machine-specific approvals and are not required to be committed to git.

### 3. Persist approvals with explicit scope

When a user approves a tool action and chooses to remember it, the decision can be persisted at session, project-local, or user scope. The engine consults the merged settings before asking again.

### 4. Route plan restrictions through the engine

The current Stage 05 plan guard should become a `PlanPolicy` inside the permission engine so planning restrictions share the same audit and decision flow as file, bash, patch, MCP, and sub-agent tools.

### 5. Keep UI out of the engine

The permission engine does not render prompts. It returns ask decisions and metadata, and middleware uses the existing `HumanInteractionManager` / approval prompt flow to interact with the user.

## Data Shape

```ts
export type PermissionDecision =
  | { type: "auto"; reason: string }
  | { type: "ask"; reason: string; prompt: string; rememberKey?: string }
  | { type: "reject"; reason: string };

export interface PermissionProfile {
  name: "readOnly" | "workspaceWrite" | "dangerFullAccess";
  rememberApprovals: boolean;
}

export interface PermissionAction {
  toolName: string;
  kind: "file" | "bash" | "patch" | "mcp" | "sub_agent" | "plan";
  cwd: string;
  input: unknown;
  agentProfile: "build" | "plan";
}
```

## Implementation Shape

Planned modules:

- `src/permissions/types.ts`: actions, decisions, profiles, and settings types.
- `src/permissions/engine.ts`: decision routing and remembered approval lookup.
- `src/permissions/file-policy.ts`: cwd and writable-root checks.
- `src/permissions/bash-policy.ts`: bash classification and readonly detection.
- `src/permissions/patch-policy.ts`: patch plan safety decisions.
- `src/permissions/mcp-policy.ts`: MCP server/tool profiles.
- `src/permissions/plan-policy.ts`: plan-profile restrictions.
- `src/permissions/audit.ts`: audit record persistence.
- `src/permissions/middleware.ts`: `beforeToolUse` integration.
- `src/config/settings.ts`: layered settings load/save.
- `src/config/settings-merge.ts`: settings merge helpers.

## Testing Strategy

- Test permission decision routing for file, bash, patch, MCP, sub-agent, and plan tools.
- Test layered settings merge semantics and scoped remembered approvals.
- Test ask/reject flows through middleware using the existing approval manager.
- Test audit records are written and can be exported from session state.
- Test Stage 05 plan guard behavior is preserved after migration into the permission engine.
