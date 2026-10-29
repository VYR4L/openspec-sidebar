## Purpose

Enable users to start OpenSpec agent workflows and explicitly confirmed CLI operations from the context of the dashboard while preserving control over the selected project and change.

## ADDED Requirements

### Requirement: Offer context-aware OpenSpec workflow actions
The dashboard SHALL offer Explore globally and SHALL offer Apply, Sync, and Archive for an applicable selected change. Each action SHALL identify the workspace root and change that will receive the operation before dispatch.

#### Scenario: Prepare Explore
- **WHEN** the user invokes Explore for a selected workspace
- **THEN** the extension prepares the configured assistant with an `/opsx:explore` request scoped to that workspace

#### Scenario: Prepare Apply
- **WHEN** the user invokes Apply for a selected change whose required planning artifacts exist
- **THEN** the extension prepares `/opsx:apply <change-name>` for the configured assistant and includes the selected workspace context

#### Scenario: Apply is not ready
- **WHEN** the selected change is missing artifacts required for implementation
- **THEN** the dashboard disables Apply or explains which artifacts are missing instead of dispatching an invalid workflow request

#### Scenario: Prepare Sync
- **WHEN** the user invokes Sync for a selected change with delta specifications
- **THEN** the extension prepares `/opsx:sync <change-name>` for the configured assistant

#### Scenario: Prepare agent-driven Archive
- **WHEN** the user invokes the normal Archive action
- **THEN** the extension prepares `/opsx:archive <change-name>` for the configured assistant so validation, synchronization, and archive decisions remain visible to the user

### Requirement: Adapt workflow dispatch to the configured assistant
The extension SHALL use a configurable assistant adapter. An adapter MAY prefill or submit a workflow request only through an available integration, and the extension SHALL provide a universal clipboard-and-focus fallback when direct integration is unavailable.

#### Scenario: Configured assistant integration is available
- **WHEN** the configured assistant adapter can safely prefill its chat
- **THEN** the extension opens that chat with the generated workflow request and reports whether the request was merely prepared or actually submitted

#### Scenario: Assistant integration is unavailable
- **WHEN** the configured adapter or its command is unavailable
- **THEN** the extension copies the complete workflow request to the clipboard, opens the configured fallback chat when possible, and tells the user that they must submit it

#### Scenario: Change name requires validation
- **WHEN** a workflow request contains a change identifier that is not present in the selected OpenSpec root
- **THEN** the extension rejects the request without invoking the assistant or shell

### Requirement: Provide an explicitly confirmed direct archive operation
The dashboard SHALL offer direct CLI archive as an advanced alternative to agent-driven archive. Before execution, the extension SHALL show the target change, resolved OpenSpec root, validation behavior, and whether spec synchronization can occur, and SHALL require modal confirmation.

#### Scenario: Confirm direct archive
- **WHEN** the user confirms direct CLI archive for a completed change
- **THEN** the extension runs the non-interactive OpenSpec archive command for exactly that change and root, streams progress, and refreshes the dashboard after completion

#### Scenario: Cancel direct archive
- **WHEN** the user cancels the confirmation
- **THEN** the extension performs no archive, sync, file move, or Git operation

#### Scenario: Direct archive fails
- **WHEN** validation or the archive command fails
- **THEN** the extension leaves the change visible, presents the command output, and does not report success

### Requirement: Communicate action state and outcomes
The dashboard SHALL prevent duplicate execution of the same action, display progress for running operations, retain diagnostic output, and refresh affected OpenSpec and Git data only after an operation reaches a terminal state.

#### Scenario: Action already running
- **WHEN** the user activates an action that is already running for the same workspace and change
- **THEN** the extension focuses the existing operation status instead of launching a duplicate

#### Scenario: Assistant request prepared
- **WHEN** an agent-driven workflow request is handed off or copied successfully
- **THEN** the dashboard reports that the request was prepared and does not claim that the workflow itself completed

### Requirement: Respect workspace trust
The dashboard SHALL remain available for read-only inspection in an untrusted workspace but SHALL disable assistant dispatch, direct CLI mutation, staging, and committing until the workspace is trusted.

#### Scenario: Open an untrusted workspace
- **WHEN** the dashboard opens in an untrusted workspace
- **THEN** it displays OpenSpec information that can be read safely and explains why mutating workflow actions are unavailable
