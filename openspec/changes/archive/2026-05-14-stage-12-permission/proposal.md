# Stage 12: Full Permission Engine

## Why

Stage 11 gave Kai isolated sub-agents, but tool safety is still split across plan guard, tool-specific checks, and ad hoc approval handling. Stage 12 consolidates permission decisions into one engine so file, bash, patch, MCP, sub-agent, and plan restrictions all follow the same auto / ask / reject path and produce the same audit trail.

This stage also introduces layered settings and scoped remembered approvals so a user can persist choices at session, project-local, or user scope without scattering policy state across tools.

## What Changes

- Add a centralized permission engine with `PermissionAction` routing and `auto / ask / reject` decisions.
- Move plan-profile restrictions into the unified permission path.
- Add layered settings loading and merging for user, project, and project-local scopes.
- Add scoped remembered approvals and permission audit records.
- Add middleware integration so `beforeToolUse` can ask, reject, or allow tools without direct UI coupling.

## Scope Boundaries

### In scope

- Permission actions for file, bash, patch, MCP, sub-agent, and plan tools.
- Settings load/merge for user, project, and project-local scopes.
- Remembered approvals with session, project-local, and user persistence scopes.
- Session audit of permission decisions.
- Plan-mode restrictions migrating into the permission engine.

### Out of scope

- OS-level sandboxing or container isolation.
- Memory extraction, retrieval, citations, or lifecycle work.
- New sub-agent execution features beyond permission classification.
- UI redesign beyond the existing approval prompt path.
- Lockfile or package-manager changes.

## Risks

- If the engine is added per-tool instead of centrally, permission behavior will diverge again.
- Settings merge semantics need to be explicit or remembered approvals will behave unpredictably across scopes.
- Approval persistence must stay scoped and auditable so a remembered decision never becomes implicit global trust by accident.

## Validation

- `openspec validate stage-12-permission --strict`
- Focused permission engine and settings merge tests
- Plan-mode regression tests covering plan guard migration
- `git diff --check`
