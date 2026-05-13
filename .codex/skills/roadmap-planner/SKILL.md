---
name: roadmap-planner
description: Transform rough project documents, PRDs, architecture notes, reference analyses, or brainstorming material into a staged code-agent-roadmap style planning directory. Use when Codex needs to create or update a 0-to-1 implementation roadmap with design principles, architecture, stage plans, appendices, traceability to source documents, and consistency checks before development begins.
---

# Roadmap Planner

Use this skill to turn messy planning input into a maintainable roadmap directory that can guide staged development. Prefer producing structured files over a single long document.

## Workflow

1. Inspect the input material and the target repository.
   - Identify project goal, target users, runtime/platform choices, constraints, reference implementations, risks, and already-decided tradeoffs.
   - If a roadmap already exists, scan it before editing and preserve useful structure.
   - Ask only when a missing decision would change the stage order or architecture.

2. Build the planning model.
   - Extract capabilities, dependencies, public interfaces, data flow, persistence needs, UI/CLI surfaces, permissions, testing strategy, and release constraints.
   - Separate long-horizon roadmap decisions from near-term implementation tasks.
   - Record conflicts or uncertainty as assumptions, risks, or open questions instead of hiding them.

3. Create or update the roadmap directory.
   - Use `code-agent-roadmap/` when the user wants this exact pattern; otherwise use `<project>-roadmap/`.
   - Read `references/roadmap-structure.md` before creating files or making broad edits.
   - Keep each file focused on one purpose: overview, principles, references, architecture, stages, or appendices.

4. Write stage documents as implementation guidance.
   - Each stage should have a clear goal, dependency boundary, deliverables, public interfaces or data models when relevant, validation commands, exit criteria, and deferred work.
   - Make stages independently reviewable. Avoid stages that are only vague themes such as "improve quality" unless they include measurable acceptance criteria.
   - Prefer incremental capability growth over planning a perfect final system too early.

5. Run a consistency pass.
   - Verify stage numbers, filenames, stage table, diagrams, appendix references, and glossary terms agree.
   - Check that every major requirement from the input appears in a stage or an explicit non-goal.
   - Check that risky capabilities have tests or validation, not just prose.

6. Report the result.
   - Summarize the roadmap shape, key stage boundaries, major tradeoffs, and any open decisions.
   - Mention which files were created or updated.

## Roadmap Quality Rules

- Treat the roadmap as a development control surface, not a marketing plan.
- Preserve traceability: important claims from input documents should map to a stage, principle, reference note, or assumption.
- Keep architecture and implementation separated: architecture describes target shape; stages describe how to get there.
- Keep the first stages small enough to build and validate quickly.
- Make later stages explicit but revisable.
- For code-agent projects, explicitly cover model loop, tools, transcript/session, permissions, context, plan mode, memory, sub-agents, UI, provider adapters, and release packaging.

## OpenSpec Coordination

When the repository uses OpenSpec, keep the roadmap and OpenSpec roles distinct:

- Roadmap: long-horizon capability sequence, architecture direction, staged learning path.
- OpenSpec change: one focused implementation proposal with design, spec deltas, and tasks.

Link OpenSpec changes back to stages when useful, but do not replace the roadmap with per-change specs.

## Resource

- `references/roadmap-structure.md`: target directory shape, file responsibilities, stage template, and final checklist.
