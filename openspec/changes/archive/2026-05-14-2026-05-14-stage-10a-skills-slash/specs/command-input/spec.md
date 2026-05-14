## ADDED Requirements

### Requirement: Skill slash commands submit activation metadata

The system SHALL register skill catalog entries as slash commands that submit typed `PromptSubmission` metadata for the next agent run.

#### Scenario: Skill appears in slash picker
- **WHEN** the slash picker opens with a discovered `typescript` skill in the catalog
- **THEN** the picker includes a `/typescript` command using catalog description metadata

#### Scenario: Skill slash command is submitted
- **WHEN** the user submits `/typescript refactor this file`
- **THEN** command input emits a `PromptSubmission` with text `refactor this file`, `metadata.slashCommand` set to `/typescript`, and `metadata.requestedSkillName` set to `typescript`

#### Scenario: Skill slash command does not load full body
- **WHEN** a skill slash command is displayed or submitted
- **THEN** command input uses catalog metadata only and does not read the full `SKILL.md` body

#### Scenario: Unknown skill slash command is ignored
- **WHEN** the user types a slash command that is not registered in the skill catalog or built-in registry
- **THEN** command input follows the existing unknown-command behavior without attempting arbitrary filesystem lookup

