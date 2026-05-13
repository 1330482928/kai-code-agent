## ADDED Requirements

### Requirement: Run loop compacts context before provider overflow
The system SHALL evaluate ContextItems through the context budget planner before each provider request and SHALL compact session-backed history before the provider call when the planned input exceeds the configured compaction threshold.

#### Scenario: Provider request is within budget
- **WHEN** a run-loop provider request is planned within budget
- **THEN** the run loop sends provider input built from the planned ContextItems without invoking compaction

#### Scenario: Provider request exceeds compaction threshold
- **WHEN** a session-backed provider request exceeds the compaction threshold
- **THEN** the run loop generates or reuses a summary, persists it through the session recorder, rebuilds ContextItems with summary plus protected tail, and only then calls the provider

#### Scenario: Compaction fails
- **WHEN** summary generation or summary persistence fails before a provider call
- **THEN** the run loop returns a concise compaction error and leaves the original transcript history intact

#### Scenario: Non-session run exceeds budget
- **WHEN** a non-session-backed run exceeds the configured input budget and cannot persist a summary
- **THEN** the run loop uses deterministic budget trimming where valid or returns a concise context-budget error instead of sending an invalid provider request

### Requirement: Run loop preserves ModelInputBuilder as the provider boundary
The system SHALL continue to send provider requests only from `ModelInputBuilder` output after budget planning and compaction have completed.

#### Scenario: Compaction changes context
- **WHEN** compaction replaces older history with a summary ContextItem
- **THEN** the run loop rebuilds provider input through `ModelInputBuilder` and does not manually splice provider messages

#### Scenario: Tool continuation follows compaction
- **WHEN** the provider requests a tool after a compacted request
- **THEN** subsequent provider continuations use the same context manager and builder path while preserving formatted tool result messages

### Requirement: Compaction remains hidden from ordinary UI output
The system SHALL treat compaction as internal context management and SHALL NOT print summary generation prompts, hidden thinking, or compaction internals as ordinary assistant-visible text.

#### Scenario: Compaction occurs during command-mode run
- **WHEN** a command-mode run compacts history before calling the provider
- **THEN** stdout contains only normal renderer output and assistant visible text from provider `text_delta` events

#### Scenario: Thinking appears during summary generation
- **WHEN** the summary provider emits hidden thinking or reasoning content
- **THEN** the run loop handles it as hidden thinking and does not add it to assistant visible text, prompt debug visible content, or plain replay output
