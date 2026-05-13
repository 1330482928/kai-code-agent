# Code-Agent Roadmap Structure

Use this reference when creating or updating a `code-agent-roadmap` style planning directory.

## Directory Shape

```text
code-agent-roadmap/
  README.md
  00-design-principles.md
  01-references-map.md
  architecture/
    final-architecture.md
    diagrams/
      stage-XX.md
  stages/
    stage-01-<slug>.md
    stage-02-<slug>.md
  appendix/
    glossary.md
    tech-choices.md
    code-budget.md
```

Only create files that help the project. For small projects, fewer appendices are fine. For larger projects, add appendices for migration notes, risk register, or validation matrix if they would be used during development.

## File Responsibilities

### README.md

Use as the roadmap entry point. Include:

- Project goal and target outcome.
- Stage table with stage number, name, capability, and exit signal.
- Capability curve showing how the system grows over time.
- Architecture overview or link to architecture files.
- How to use the roadmap during development.
- Current assumptions and important boundaries.

### 00-design-principles.md

Capture stable decisions that should constrain all stages:

- Runtime and dependency choices.
- Architecture layering.
- Persistence and state authority.
- Extension mechanism.
- Security and permission posture.
- Testing and validation philosophy.
- Naming and compatibility rules.

Use this file for principles that should not be rediscovered in every stage.

### 01-references-map.md

Map input documents, reference projects, competitor designs, or research notes to roadmap decisions.

For each reference, record:

- What was borrowed.
- What was rejected or deferred.
- Which stage or architecture section uses the insight.
- Any uncertainty or follow-up needed.

### architecture/final-architecture.md

Describe the intended end-state architecture. Include:

- Layers/modules and ownership boundaries.
- Core data flow.
- Key interfaces and extension points.
- Persistence model.
- UI/API surfaces.
- Safety and permission boundaries.
- Where future capabilities plug in.

Do not turn this into a stage task list. Link to stages for sequencing.

### stages/stage-XX-<slug>.md

Each stage should be independently implementable and reviewable. Use this template:

```markdown
# Stage XX: <Name>

## Goal

One paragraph describing the capability unlocked by this stage.

## Why This Stage

Explain why this comes now and what later work it enables.

## Scope

List what is included and what is intentionally excluded.

## Inputs And Dependencies

List earlier stages, decisions, source documents, or external systems required.

## Design

Describe interfaces, modules, data models, workflows, or UI behavior needed for the stage.

## Implementation Tasks

Keep tasks small enough to review independently.

## Validation

List tests, fixtures, replay checks, CLI commands, or manual checks.

## Exit Criteria

Define what must be true before moving to the next stage.

## Deferred Work

State what is postponed and where it should land.
```

### appendix/glossary.md

Define project-specific terms, especially terms that could mean different things in adjacent projects.

### appendix/tech-choices.md

Record runtime, storage, UI, testing, packaging, protocol, and provider choices. Include alternatives and reasons when they affect architecture.

### appendix/code-budget.md

Use when implementation size matters. Track target size by stage or subsystem, but treat the budget as a planning guardrail, not a law.

## Quality Checklist

Before finishing, verify:

- Stage numbers and filenames are consistent.
- README stage table matches `stages/`.
- Every major input requirement is represented or explicitly rejected.
- Architecture does not contradict stage sequencing.
- Design principles are reflected in stage plans.
- Public interfaces are named before multiple stages depend on them.
- Tests or validation exist for risky behavior.
- Deferred work has a future home.
- Terminology in stage docs matches the glossary.
- The first stage can produce a running or verifiable result.
- The roadmap distinguishes durable transcript/state from UI events when planning agent systems.
- Permission-sensitive tools have allow/ask/deny thinking somewhere in the roadmap.
- Context, memory, and sub-agent features have clear boundaries rather than sharing one vague bucket.
