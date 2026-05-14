## 1. Skill Frontmatter and Discovery

- [x] 1.1 Add `src/skills/frontmatter.ts` with `SKILL.md` frontmatter parsing, description fallback, metadata validation, and concise diagnostics.
- [x] 1.2 Add `src/skills/discovery.ts` for ordered project/user directory scanning and `SKILL.md` detection.
- [x] 1.3 Implement duplicate resolution by explicit priority, directory priority, and stable path tie-breaker.
- [x] 1.4 Add tests for valid metadata, invalid metadata, missing directories, description fallback, priority selection, and shadowed duplicate tracking.

## 2. Skill Catalog and CLI Inspection

- [x] 2.1 Add `src/skills/catalog.ts` for selected catalog entries and all-entry views.
- [x] 2.2 Add `kai skills list` with selected skill names, descriptions, sources, and priorities.
- [x] 2.3 Add `kai skills list --all` with selected and shadowed entries plus concise shadowing reasons.
- [x] 2.4 Add CLI smoke tests for catalog output without dumping full `SKILL.md` bodies.

## 3. Explicit Skill Activation

- [x] 3.1 Add `src/skills/router.ts` for `PromptSubmission.metadata.requestedSkillName` activation.
- [x] 3.2 Add leading `$SkillName` activation and preserve the remaining task text for the run.
- [x] 3.3 Return bounded diagnostics for unknown explicit skills without arbitrary filesystem lookup.
- [x] 3.4 Add tests proving explicit slash metadata and `$SkillName` activation work without loading unrelated skill bodies.

## 4. Progressive Loading

- [x] 4.1 Add `src/skills/loader.ts` to load full `SKILL.md` bodies only for activated skills.
- [x] 4.2 Bound loader diagnostics for unreadable activated skill files.
- [x] 4.3 Add tests proving inactive skills only contribute catalog metadata and activated skills contribute full bodies.

## 5. Skills Middleware and ContextItem Integration

- [x] 5.1 Add `src/skills/middleware.ts` to contribute catalog `ContextItem(kind="skill")` values before model input assembly.
- [x] 5.2 Add activated skill body ContextItems with activation mode, reason, source path, and priority metadata.
- [x] 5.3 Ensure skill context reaches providers only through `ModelInputBuilder` and never through hand-written provider messages.
- [x] 5.4 Add context debug tests for included/excluded skill items, source metadata, and budget behavior.

## 6. Slash Command Integration

- [x] 6.1 Register catalog-backed skill slash commands in `src/ui/slash/skills.ts` or the existing command registry boundary.
- [x] 6.2 Ensure skill slash commands emit `PromptSubmission.metadata.requestedSkillName` and `metadata.slashCommand`.
- [x] 6.3 Ensure command input uses catalog metadata only and does not load full `SKILL.md` bodies.
- [x] 6.4 Add command-input tests for picker entries, prompt submission text, metadata, and unknown command behavior.

## 7. Integration and Exports

- [x] 7.1 Register skills middleware in run setup without changing provider adapters.
- [x] 7.2 Keep plan-mode and approval restrictions intact; `allowedTools` must not grant permissions in 10A.
- [x] 7.3 Update `src/index.ts` exports for skill types/helpers needed by tests.
- [x] 7.4 Do not change lockfiles in 10A.

## 8. Validation

- [x] 8.1 Run `openspec validate 2026-05-14-stage-10a-skills-slash --strict`.
- [x] 8.2 Run `bun run check`.
- [x] 8.3 Run focused Stage 10A tests, for example `bun run test -- stage-10`.
- [x] 8.4 Run related command-input, context-kernel, and middleware tests.
- [x] 8.5 Run full `bun run test` before archive.
