## Purpose

Provide a visual, editor-hosted workspace for understanding and navigating OpenSpec changes, specifications, artifacts, progress, and supporting files without crowding the VS Code sidebar.

## ADDED Requirements

### Requirement: Open the workbench as an editor dashboard
The extension SHALL provide an OpenSpec dashboard in a normal editor tab and SHALL expose a command and lightweight status-bar entry point for opening or revealing that dashboard. The extension SHALL NOT require the OpenSpec file tree to remain visible in the Activity Bar or sidebar.

#### Scenario: Open a new dashboard
- **WHEN** the user runs the OpenSpec dashboard command and no dashboard is open
- **THEN** the extension opens a single dashboard editor tab for the selected workspace

#### Scenario: Reveal an existing dashboard
- **WHEN** the user runs the OpenSpec dashboard command while its dashboard is already open
- **THEN** the extension reveals the existing tab instead of creating a duplicate

#### Scenario: Restore the dashboard
- **WHEN** VS Code restores a window in which the dashboard was open
- **THEN** the extension restores the dashboard tab and its last selected workspace, change, and section when those selections still exist

### Requirement: Present lifecycle-oriented change summaries
The dashboard SHALL group changes into not-started, partially completed, completed, and archived sections. Active change progress SHALL come from authoritative OpenSpec status data, and each change summary SHALL show completed and total task counts when tasks exist.

#### Scenario: Classify a change with no completed tasks
- **WHEN** a change has tasks and none are complete, or planning has not produced tasks yet
- **THEN** the dashboard presents the change as not started and distinguishes missing planning artifacts from zero implementation progress

#### Scenario: Classify partial progress
- **WHEN** a change has at least one completed task and at least one remaining task
- **THEN** the dashboard presents it as partially completed with a numeric count and percentage

#### Scenario: Classify a completed active change
- **WHEN** every task in an active change is complete
- **THEN** the dashboard presents it as completed but not archived

#### Scenario: Present archived changes
- **WHEN** archived changes exist under the resolved OpenSpec root
- **THEN** the dashboard lists them separately from active changes and allows their artifacts to be inspected read-only

### Requirement: Present main specifications and change details
The dashboard SHALL list main specifications and SHALL provide an expandable detail workspace for a selected change containing overview, artifacts, task progress, delta specifications, supporting files, and Git context.

#### Scenario: Inspect a selected change
- **WHEN** the user selects an active change
- **THEN** the dashboard displays its lifecycle state, progress, available artifacts, tasks, and delta specifications without requiring manual filesystem navigation

#### Scenario: Open an artifact or supporting file
- **WHEN** the user selects an artifact or file from the dashboard
- **THEN** the extension opens that resource in the normal VS Code editor

#### Scenario: Inspect a main specification
- **WHEN** the user selects a main specification
- **THEN** the extension opens or previews the source-of-truth specification associated with that capability

### Requirement: Compare delta specifications with main specifications
For each delta specification, the dashboard SHALL provide a comparison against the matching main specification when one exists and SHALL clearly identify deltas for new capabilities when no main specification exists.

#### Scenario: Compare an existing capability
- **WHEN** a selected delta targets a capability that has a main specification
- **THEN** the dashboard offers a Delta-to-Main comparison and labels both sides unambiguously

#### Scenario: Inspect a new capability delta
- **WHEN** a selected delta has no corresponding main specification
- **THEN** the dashboard identifies it as a new capability and presents the delta without fabricating an empty main specification

### Requirement: Support multiple workspace roots
The dashboard SHALL discover OpenSpec roots independently for each VS Code workspace folder and SHALL keep data, actions, files, and Git repositories scoped to the workspace selected by the user.

#### Scenario: Switch workspace root
- **WHEN** a multi-root workspace contains more than one OpenSpec project and the user selects another root
- **THEN** every dashboard section refreshes to show only the selected root's OpenSpec and Git state

#### Scenario: Workspace has no OpenSpec root
- **WHEN** the selected workspace does not resolve to an OpenSpec root
- **THEN** the dashboard presents an actionable empty state without showing data inherited from an unrelated ancestor root

### Requirement: Refresh state without losing context
The dashboard SHALL refresh after relevant OpenSpec or Git filesystem changes, SHALL debounce bursts of events, and SHALL preserve the current selection whenever the selected item still exists.

#### Scenario: Tasks change outside the dashboard
- **WHEN** an OpenSpec task file changes on disk
- **THEN** the dashboard updates its progress after a short debounce without resetting the selected tab or change

#### Scenario: Refresh fails
- **WHEN** the OpenSpec CLI or filesystem cannot provide valid state
- **THEN** the dashboard retains its last successful snapshot, marks it as stale, and displays a retryable error rather than an empty success state

### Requirement: Match VS Code themes and accessibility behavior
The dashboard SHALL use VS Code theme tokens, support keyboard navigation and visible focus, provide textual equivalents for status color and icons, and avoid remotely hosted runtime assets.

#### Scenario: Theme changes while open
- **WHEN** the active VS Code color theme changes
- **THEN** the dashboard updates its colors without requiring a reload and remains readable in light, dark, and high-contrast themes

#### Scenario: Navigate without a mouse
- **WHEN** the user navigates dashboard controls with the keyboard
- **THEN** all interactive controls are reachable in a logical order and expose a visible focus state and accessible name
