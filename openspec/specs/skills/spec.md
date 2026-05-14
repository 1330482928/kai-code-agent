# skills Specification

## Purpose
Define how Kai discovers, catalogs, activates, and injects skills as model context without treating skills as executable tools.
## Requirements
### Requirement: Skills are discovered from project and user directories

The system SHALL discover skills from ordered project and user directories by locating directories that contain a `SKILL.md` file.

#### Scenario: Project skill is discovered
- **WHEN** a project contains `skills/typescript/SKILL.md`
- **THEN** discovery includes a `typescript` skill with source metadata pointing to that path

#### Scenario: User skill is discovered
- **WHEN** a user skill exists under `~/.kai-code-agent/skills/review/SKILL.md`
- **THEN** discovery includes the `review` skill when user skill directories are enabled

#### Scenario: Missing directories are ignored
- **WHEN** one or more configured skill directories do not exist
- **THEN** discovery completes without errors and reports no entries for those directories

### Requirement: Skill frontmatter is parsed into catalog metadata

The system SHALL parse `SKILL.md` frontmatter and bounded description text into catalog metadata without loading full inactive skill bodies into provider input.

#### Scenario: Frontmatter metadata is parsed
- **WHEN** `SKILL.md` declares `name`, `description`, `whenToUse`, `allowedTools`, and `priority`
- **THEN** the catalog entry contains those fields as structured metadata

#### Scenario: Description fallback is used
- **WHEN** frontmatter omits `description` but the body starts with a short paragraph
- **THEN** the catalog uses the bounded first body paragraph as the skill description

#### Scenario: Invalid frontmatter is reported
- **WHEN** `SKILL.md` frontmatter has an invalid `priority` or `allowedTools` value
- **THEN** discovery reports a concise diagnostic and does not inject invalid metadata into model context

### Requirement: Duplicate skills resolve deterministically

The system SHALL select one active catalog entry for each skill name using explicit priority first, directory priority second, and stable path ordering as a final tie-breaker.

#### Scenario: Higher priority skill wins
- **WHEN** two discovered skills have the same name and one declares a higher numeric priority
- **THEN** the higher priority skill is selected for normal catalog injection

#### Scenario: Directory priority breaks ties
- **WHEN** duplicate skills have the same explicit priority or no explicit priority
- **THEN** the skill from the higher-priority directory is selected

#### Scenario: Shadowed skills are inspectable
- **WHEN** a duplicate skill is not selected
- **THEN** `kai skills list --all` can show the shadowed skill source and the selected skill that shadowed it

### Requirement: Skill catalog is injected as bounded skill context

The system SHALL inject selected skill catalog metadata through `ContextItem(kind="skill")` and the `ModelInputBuilder` path.

#### Scenario: Catalog is injected before activation
- **WHEN** a model run starts with discovered skills and no activated skill
- **THEN** provider input includes bounded catalog context with names and descriptions but not full `SKILL.md` bodies

#### Scenario: Catalog respects context budgets
- **WHEN** the skill catalog exceeds the configured skill context budget
- **THEN** lower-priority catalog entries are excluded or truncated with debug cut reasons

#### Scenario: Provider adapters do not receive hand-built skill messages
- **WHEN** skill context is included for a provider request
- **THEN** it reaches the adapter only through `ModelInputBuilder` output

### Requirement: Explicit skill activation is supported

The system SHALL activate explicitly requested skills from `PromptSubmission.metadata.requestedSkillName` or leading `$SkillName` task text.

#### Scenario: Slash metadata activates a skill
- **WHEN** a prompt submission contains `metadata.requestedSkillName` for an existing skill
- **THEN** that skill is activated with activation mode `explicit`

#### Scenario: Dollar prefix activates a skill
- **WHEN** the user prompt starts with `$TypeScript refactor this file`
- **THEN** the `TypeScript` skill is activated with activation mode `explicit` and the remaining task text is preserved for the run

#### Scenario: Slash metadata takes precedence
- **WHEN** slash metadata requests `review` and prompt text starts with `$TypeScript`
- **THEN** the slash-requested `review` skill is treated as the explicit activation source

#### Scenario: Unknown explicit skill is diagnosed
- **WHEN** explicit activation requests a skill that is not in the catalog
- **THEN** the run receives a bounded diagnostic without loading arbitrary filesystem paths

### Requirement: Activated skills are loaded progressively

The system SHALL load full `SKILL.md` content only for explicitly activated skills and inject loaded bodies through skill ContextItems.

#### Scenario: Activated skill body is loaded
- **WHEN** the `typescript` skill is explicitly activated
- **THEN** the full `typescript/SKILL.md` body is loaded and included in an activated skill ContextItem

#### Scenario: Inactive skill body is not loaded
- **WHEN** `review` is present in the catalog but not explicitly activated
- **THEN** its full `SKILL.md` body is not read for that model run

#### Scenario: Loader failure is bounded
- **WHEN** an activated skill file cannot be read
- **THEN** the run records a bounded loader diagnostic and does not crash the agent loop

### Requirement: Skills middleware is the injection boundary

The system SHALL use skills middleware to produce skill ContextItems before model input assembly.

#### Scenario: Skills middleware runs before provider input
- **WHEN** an agent run prepares a provider request
- **THEN** skills middleware contributes catalog and activated skill ContextItems before `ModelInputBuilder` assembles input

#### Scenario: Skills middleware does not execute tools
- **WHEN** a skill declares `allowedTools`
- **THEN** the middleware treats that field as metadata or model-visible guidance and does not execute or grant tools directly

#### Scenario: Plan mode restrictions are preserved
- **WHEN** a plan-profile run includes skill context
- **THEN** skill activation does not bypass existing plan-mode tool restrictions or approval middleware

### Requirement: Skills CLI exposes catalog inspection

The system SHALL provide CLI commands for inspecting discovered skills without starting a model run.

#### Scenario: Selected skills are listed
- **WHEN** the user runs `kai skills list`
- **THEN** stdout lists selected skill names, descriptions, sources, and priorities

#### Scenario: All skills are listed
- **WHEN** the user runs `kai skills list --all`
- **THEN** stdout includes selected and shadowed skills with concise shadowing information

#### Scenario: Skill list does not print full bodies
- **WHEN** skills are listed through the CLI
- **THEN** the command prints catalog metadata only and does not dump full `SKILL.md` bodies by default
