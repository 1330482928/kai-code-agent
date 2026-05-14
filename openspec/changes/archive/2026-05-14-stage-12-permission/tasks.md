## 1. Permission core

- [x] 1.1 Define `PermissionAction`, `PermissionDecision`, and permission profile types.
- [x] 1.2 Implement the permission engine decision router.
- [x] 1.3 Add tests for auto / ask / reject routing across tool kinds.

## 2. Policy modules

- [x] 2.1 Add file path and writable-root policy checks.
- [x] 2.2 Add bash readonly classification and deny handling.
- [x] 2.3 Add patch, MCP, sub-agent, and plan policy modules.
- [x] 2.4 Add tests for each policy module.

## 3. Settings and remembered approvals

- [x] 3.1 Add layered settings load and save helpers for user, project, and project-local scopes.
- [x] 3.2 Add merge helpers with union/override semantics.
- [x] 3.3 Add scoped remembered approval persistence and lookup.
- [x] 3.4 Add tests for settings merge and remembered approvals.

## 4. Middleware and audit

- [x] 4.1 Add permission middleware for `beforeToolUse`.
- [x] 4.2 Route ask decisions through `HumanInteractionManager`.
- [x] 4.3 Add permission audit persistence and export coverage.
- [x] 4.4 Add middleware tests for denied, approved, and remembered decisions.

## 5. Migration and validation

- [x] 5.1 Migrate Stage 05 plan guard into `PlanPolicy`.
- [x] 5.2 Wire permission checks into build and plan tool execution.
- [x] 5.3 Keep UI rendering and approval prompts on the existing manager path.
- [x] 5.4 Run `openspec validate stage-12-permission --strict`, focused permission tests, and `git diff --check`.
