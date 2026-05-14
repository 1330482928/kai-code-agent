# permission Specification

## Purpose
TBD - created by archiving change stage-12-permission. Update Purpose after archive.

## Requirements

### Requirement: Permission decisions are centralized

The system SHALL evaluate tool safety through a centralized permission engine that returns `auto`, `ask`, or `reject` decisions for file, bash, patch, MCP, sub-agent, and plan actions.

#### Scenario: A tool is classified as auto
- **WHEN** a tool action is evaluated and the policy deems it safe
- **THEN** the engine returns an auto decision and the tool may execute without user intervention

#### Scenario: A tool requires approval
- **WHEN** a tool action is evaluated and the policy requires confirmation
- **THEN** the engine returns an ask decision and the tool does not execute until the approval flow resolves

#### Scenario: A tool is rejected
- **WHEN** a tool action violates policy
- **THEN** the engine returns a reject decision and the real tool is not executed

### Requirement: Permission settings are merged by scope

The system SHALL load permission-related settings from user, project, and project-local scopes and merge them deterministically before evaluation.

#### Scenario: User and project settings both exist
- **WHEN** user and project settings provide permission data
- **THEN** the merged settings apply allow-list unions, deny-list unions with deny precedence, and later-layer overrides for scalar or object fields

#### Scenario: Project-local settings are available
- **WHEN** project-local settings exist
- **THEN** they participate in the same merge path and may store private remembered approvals

### Requirement: Remembered approvals are scoped

The system SHALL persist remembered approvals with an explicit scope so approval state can survive at session, project-local, or user scope.

#### Scenario: Approval is remembered for the current session
- **WHEN** a user approves an ask decision and chooses session scope
- **THEN** the same action can auto-approve later in the same session

#### Scenario: Approval is remembered for the project
- **WHEN** a user approves an ask decision and chooses project-local or user scope
- **THEN** later runs in the matching scope can reuse the remembered approval

### Requirement: Plan restrictions are enforced by the permission engine

The system SHALL apply plan-profile restrictions through the permission engine rather than a separate plan-specific guard path.

#### Scenario: Plan profile requests a workspace mutation
- **WHEN** the active profile is `plan` and a workspace mutation tool is requested
- **THEN** the permission engine returns a reject decision or an ask decision consistent with the plan policy

#### Scenario: Plan profile requests read-only access
- **WHEN** the active profile is `plan` and a read-only action is requested
- **THEN** the permission engine may return auto if the plan policy allows it

### Requirement: Permission decisions are audited

The system SHALL record permission decisions in session audit state so they can be exported and reviewed after the run.

#### Scenario: A permission decision is made
- **WHEN** the engine returns auto, ask, or reject
- **THEN** the decision and its scope are recorded in session audit data

#### Scenario: Audit data is exported
- **WHEN** a session is exported or inspected later
- **THEN** the permission audit history remains available for review
