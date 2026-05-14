## Context

Stage 10A narrows the next implementation slice to skills and explicit slash activation. Kai already has the primitives this work should use:

- `ContextItem` and `ModelInputBuilder` for model-visible context.
- Middleware hooks for model input contribution.
- `PromptSubmission.metadata` for slash commands that affect the next agent run.
- Shared command registry and slash picker behavior.

The core architectural constraint is that skills are context, not executable tools. Discovery, cataloging, activation, and body loading should produce `ContextItem(kind="skill")` values. Provider adapters should remain unaware of skill internals.

## Decisions

### 1. Use ordered project and user skill directories

Kai will scan these directories in deterministic priority order:

1. `<project>/skills`
2. `<project>/.agents/skills`
3. `<project>/.kai/skills`
4. `~/skills`
5. `~/.agents/skills`
6. `~/.kai-code-agent/skills`

Each skill is a directory containing `SKILL.md`. Missing directories are ignored. Discovery reads only frontmatter and a short description.

### 2. Parse a small catalog from `SKILL.md`

The parser will support `name`, `description`, `whenToUse`, `allowedTools`, and `priority`. If `description` is missing, discovery can use a bounded first body paragraph as a fallback.

Inactive skill bodies are not loaded into provider input. The catalog is enough for users to inspect skills, for slash commands to display descriptions, and for model-visible catalog hints.

### 3. Resolve duplicates deterministically

Duplicate skill names are resolved by:

1. higher explicit numeric `priority`
2. higher directory priority
3. stable path ordering as a final tie-breaker

Normal catalog injection includes only selected skills. `kai skills list --all` shows selected and shadowed entries with concise shadowing information.

### 4. Inject catalog and activated bodies as skill ContextItems

Skills middleware contributes:

- a bounded catalog `ContextItem(kind="skill")` containing selected names, descriptions, sources, and optional `whenToUse`
- activated skill body `ContextItem(kind="skill")` values after explicit activation

`ModelInputBuilder` remains the only provider input assembly boundary. Skill middleware must not hand-write provider messages or call provider adapters directly.

### 5. Support explicit activation only

10A supports:

- slash metadata: `PromptSubmission.metadata.requestedSkillName`
- leading prefix: `$SkillName task text`

Explicit slash activation takes precedence over prefix parsing if both are present. Unknown skill requests become bounded diagnostics and do not trigger arbitrary filesystem lookup.

### 6. Keep slash command UI catalog-only

Skill slash commands are registered from catalog entries. Selecting or typing a skill command emits:

```ts
{
  text: "refactor this file",
  metadata: {
    slashCommand: "/typescript",
    requestedSkillName: "typescript"
  }
}
```

The command registry and UI use catalog metadata only. Full `SKILL.md` body loading belongs to skills middleware during the agent run.

### 7. Treat `allowedTools` as metadata

`allowedTools` can appear in catalog and activated skill metadata, and may be included as model-visible guidance. It does not grant permissions or change tool exposure in 10A. Existing plan-mode and approval restrictions continue to apply.

### 8. Keep Bun as the execution baseline

Implementation and validation should use the existing Bun scripts. Lockfile cleanup is outside this change.

## Planned Code Modules

- `src/skills/frontmatter.ts`: parse and validate `SKILL.md` metadata.
- `src/skills/discovery.ts`: scan ordered directories and resolve duplicates.
- `src/skills/catalog.ts`: expose selected and all-entry catalog views.
- `src/skills/router.ts`: resolve explicit slash metadata and `$SkillName` activation.
- `src/skills/loader.ts`: load full `SKILL.md` only for activated skills.
- `src/skills/middleware.ts`: produce catalog and activated skill ContextItems.
- `src/ui/slash/skills.ts` or existing command registry code: register catalog-backed slash commands.
- `src/cli/main.ts`: add `kai skills list` and `kai skills list --all`.
- `src/index.ts`: export test-facing skill helpers and types.

## Testing Strategy

- Unit tests for frontmatter parsing, invalid metadata diagnostics, and description fallback.
- Discovery tests for missing directories, project/user directory priority, explicit priority, and shadowed duplicates.
- Command-input tests for slash picker entries and `PromptSubmission.metadata.requestedSkillName`.
- Router tests for slash metadata activation, `$SkillName` activation, unknown skill diagnostics, and task-text preservation.
- Loader tests proving inactive skills do not load full bodies and activated skills do.
- Middleware/context tests proving skills enter provider input only through `ContextItem(kind="skill")` and `ModelInputBuilder` debug metadata.
- CLI smoke tests for `bun run kai skills list` and `bun run kai skills list --all`.
- Validation commands during apply: `bun run check`, focused Stage 10A tests, command-input/context tests, and full `bun run test` before archive.

## Risks / Trade-offs

- [Risk] Catalog context can grow with many skills -> Mitigation: bounded catalog text, stable priority ordering, and budget/debug cut reasons.
- [Risk] Duplicate resolution surprises users -> Mitigation: `--all` output includes shadowed source and selected source.
- [Risk] Prefix parsing damages prompts -> Mitigation: only parse a leading `$SkillName` token and preserve remaining text exactly.
- [Risk] Slash UI loads too much -> Mitigation: slash registry accepts catalog entries only and tests assert no body loading.

## Open Questions

- Should `allowedTools` be hidden from model-visible context until a later permission-focused change, or shown as advisory guidance in 10A?
- Should skill catalog context be one combined item or one item per selected skill if prompt debug readability becomes more important than compactness?
