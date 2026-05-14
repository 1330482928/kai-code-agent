## Why

Kai already has a ContextItem-first model input path, middleware lifecycle hooks, prompt submission metadata, and a shared command registry. Stage 10A uses those existing boundaries to add skills and slash activation while keeping the first Stage 10 apply slice focused.

This change lets Kai discover project and user skills, expose a bounded catalog, let users explicitly activate a skill through slash commands or a leading `$SkillName`, progressively load the activated `SKILL.md`, and inject skill context only through middleware and `ModelInputBuilder`.

## What Changes

### Motivation

- Let Kai discover project and user skills without loading every skill body into every model request.
- Let explicit user intent activate a skill through the shared command registry or a leading `$SkillName`.
- Keep UI command handling lightweight: slash commands submit `PromptSubmission.metadata.requestedSkillName` and do not read full `SKILL.md` bodies.
- Preserve ContextItem-first and middleware-first architecture so skill context remains budgeted, debuggable, and provider-agnostic.

### Scope

- Add multi-directory skill discovery for project and user skill directories.
- Parse `SKILL.md` frontmatter and bounded descriptions into a skill catalog.
- Resolve duplicate skill names by explicit priority first and directory priority second.
- Inject selected catalog metadata as bounded `ContextItem(kind="skill")` context.
- Register skill catalog entries as slash commands in the shared command registry.
- Support explicit activation from slash metadata and leading `$SkillName`.
- Load full `SKILL.md` content only for explicitly activated skills.
- Inject activated skill bodies through skills middleware as `ContextItem(kind="skill")`.
- Add `kai skills list` and `kai skills list --all` for catalog inspection.

### Non-goals

- No sub-agent execution or forked skill-specific agent loop.
- No permission engine changes. `allowedTools` remains metadata or model-visible guidance in 10A.
- No provider-adapter-specific prompt construction and no hand-written provider messages outside `ModelInputBuilder`.
- No package-manager cleanup. The existing lockfile observation is not handled in this change.

### Risks

- Skill catalogs can become noisy if many skills are installed, so catalog context must be bounded and budget-aware.
- Duplicate skills can be confusing, so priority and shadowing decisions must be deterministic and inspectable.
- Explicit `$SkillName` parsing can accidentally alter user text, so the remaining task text must be preserved and tested.
- UI code can become coupled to filesystem loading, so slash commands must use catalog metadata only.
- Activated skill bodies can be large, so progressive loading still needs ContextItem budget metadata and truncation behavior.

## Capabilities

### New Capabilities

- `skills`: Covers skill discovery, frontmatter/catalog parsing, duplicate/priority selection, catalog ContextItems, explicit activation, progressive loading, middleware injection, and catalog CLI inspection.

### Modified Capabilities

- `command-input`: Adds catalog-backed skill slash commands that emit `PromptSubmission.metadata.requestedSkillName` without reading full skill bodies in UI code.

## Impact

- Planned implementation modules are limited to `src/skills/`, command registry/slash integration, run setup middleware registration, CLI command handling, and test exports.
- Planned tests include frontmatter parsing, directory discovery, duplicate priority, catalog-only injection, slash metadata, `$SkillName` activation, progressive loading, middleware ContextItems, and skills CLI smoke coverage.
- This proposal is intentionally limited to skills and slash activation so apply can be reviewed and archived independently.
