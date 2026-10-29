## Purpose

Provide a transparent Git staging and commit experience tailored to OpenSpec lifecycle changes, including useful editable messages without silently including unrelated work.

## ADDED Requirements

### Requirement: Display repository and file state
The dashboard SHALL show the selected workspace's Git repository, current branch, working-tree changes, staged changes, and conflict state. Every file SHALL show its repository-relative path and status.

#### Scenario: Repository is available
- **WHEN** the selected workspace belongs to an open Git repository
- **THEN** the Git section displays its branch and separates unstaged, staged, and conflicted files

#### Scenario: No repository is available
- **WHEN** the selected workspace does not belong to a Git repository or the VS Code Git provider is unavailable
- **THEN** the Git section presents a non-destructive unavailable state and disables staging and committing

#### Scenario: Multiple repositories are open
- **WHEN** more than one Git repository is associated with the selected workspace
- **THEN** the dashboard requires an explicit repository selection and scopes all subsequent Git actions to it

### Requirement: Stage and unstage only explicit selections
The dashboard SHALL allow the user to select files for staging or unstaging and SHALL operate only on those explicit selections. It SHALL NOT provide or simulate a hidden `git add .` operation.

#### Scenario: Stage selected files
- **WHEN** the user selects two unstaged files and activates Stage Selected
- **THEN** only those two files are staged and any other working-tree changes remain unstaged

#### Scenario: Unstage selected files
- **WHEN** the user selects staged files and activates Unstage Selected
- **THEN** only those files are removed from the staged set without discarding their working-tree content

#### Scenario: File state changes externally
- **WHEN** a file is staged, unstaged, reverted, or modified outside the dashboard
- **THEN** the dashboard refreshes to show the Git provider's current state before allowing a commit

### Requirement: Suggest editable lifecycle-aware commit messages
The dashboard SHALL suggest Conventional Commit-style documentation messages based on the selected OpenSpec change and observable file transition, and SHALL always allow the user to edit or replace the suggestion.

#### Scenario: New change artifacts are staged
- **WHEN** staged files create a new active OpenSpec change
- **THEN** the dashboard suggests `docs: add <change-name>`

#### Scenario: Active change artifacts are updated
- **WHEN** staged files update an existing active OpenSpec change without syncing or archiving it
- **THEN** the dashboard suggests `docs: update <change-name>`

#### Scenario: Main specs are synchronized
- **WHEN** staged files update main specs while the associated change remains active
- **THEN** the dashboard suggests `docs: sync <change-name>` when that association can be determined

#### Scenario: A change is archived
- **WHEN** staged changes move an OpenSpec change into the archive
- **THEN** the dashboard suggests `docs: archive <change-name>`

#### Scenario: Lifecycle intent is ambiguous
- **WHEN** the staged paths do not identify one unambiguous OpenSpec lifecycle event
- **THEN** the dashboard offers generic editable suggestions or leaves the message empty rather than presenting a confident but incorrect message

### Requirement: Commit the complete visible staged set
Before committing, the dashboard SHALL show the exact staged files that Git will include. The commit action SHALL use the user's current editable message and SHALL be disabled for an empty message, an empty staged set, unresolved conflicts, or an untrusted workspace.

#### Scenario: Commit a reviewed staged set
- **WHEN** the user reviews the complete staged list, provides a non-empty message, and activates Commit
- **THEN** Git creates one commit containing that staged set and the dashboard refreshes to show the resulting repository state

#### Scenario: Staged files extend beyond the selected change
- **WHEN** the staged set includes files outside the currently selected OpenSpec change
- **THEN** the dashboard highlights those files and requires acknowledgement before committing the complete staged set

#### Scenario: Staged set changes before confirmation
- **WHEN** the Git staged set changes after the commit form was populated but before Commit is activated
- **THEN** the dashboard updates the review list and requires the user to review the changed set before committing

#### Scenario: Commit fails
- **WHEN** Git rejects the commit because of hooks, identity configuration, conflicts, or another error
- **THEN** the dashboard displays the error, preserves the entered message, and does not report a successful commit
