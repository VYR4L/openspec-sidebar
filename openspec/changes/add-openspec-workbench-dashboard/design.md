## Context

The extension is currently a small JavaScript entry point backed by a native Tree View. Its manifest contributes an Activity Bar container, a configurable list of support folders, default Explorer exclusions, file watching, and two commands. The approved behavior in `proposal.md` adds several coordinated surfaces: an editor dashboard, OpenSpec CLI snapshots, change details and comparisons, agent workflow dispatch, and Git staging and commits.

OpenSpec distinguishes deterministic CLI operations from agent workflows. The CLI can provide structured project, change, artifact, and task data, while Explore, Apply, Sync, and the normal Archive experience are assistant-driven workflows. VS Code Webviews cannot access Node.js, the filesystem, Git, or extension APIs directly, so every privileged operation must remain in the extension host.

## Goals / Non-Goals

**Goals:**

- Establish a maintainable boundary between the Webview UI and privileged extension-host services.
- Make the dashboard responsive while treating OpenSpec CLI JSON and the VS Code Git provider as authoritative state.
- Keep actions explicit, scoped to one workspace/change/repository, and safe around unrelated staged work.
- Deliver a polished theme-aware UI that can evolve without returning complex content to the sidebar.
- Preserve a universal assistant fallback even when Trae, Codex, or another chat provider exposes no stable command API.

**Non-Goals:**

- Reimplement OpenSpec parsing, validation, sync, or archive semantics inside the extension.
- Implement an AI agent or execute Apply/Explore/Sync directly without an assistant.
- Replace VS Code's full Source Control experience, resolve merge conflicts, amend commits, push, pull, or manage branches.
- Host remote services, load remote Webview assets, or publish the extension to a marketplace.
- Automatically stage, commit, synchronize, or archive as a side effect of another operation.

## Decisions

### Use a singleton editor Webview panel rather than an Activity Bar view

The extension will expose `OpenSpec: Open Dashboard` and a compact status-bar entry point. One `WebviewPanel` will exist per VS Code window, with a serializer so an open dashboard can be restored. The current Activity Bar container and Tree View contributions will be removed after equivalent file navigation is available in the dashboard.

An editor panel provides the width required for cards, progress, split detail views, diffs, and Git review. Keeping a minimal sidebar launcher was considered, but clicking an Activity Bar container necessarily opens a sidebar surface and creates an unnecessary intermediate step.

### Build the Webview with React, TypeScript, and Vite

The dashboard will use a small React frontend compiled into local static assets. Components will use VS Code CSS variables and accessible native semantics rather than a large design-system dependency. The extension host will also migrate to TypeScript so Webview messages and snapshot models share discriminated interfaces.

Vanilla HTML and JavaScript would minimize dependencies, but state synchronization across lifecycle groups, tabs, selections, operations, and Git review would become harder to maintain. A framework-heavy component suite was rejected because it would increase package size and make VS Code theme fidelity harder.

### Keep all privileged work in extension-host services

The extension host will be divided into focused services:

- `DashboardPanel`: lifecycle, serialization, CSP-safe asset URIs, and message routing.
- `OpenSpecService`: root resolution, CLI execution, JSON validation, archive discovery, main specs, and selected-change details.
- `GitService`: repository discovery, status, stage, unstage, commit, and change events through the built-in Git extension API.
- `AssistantService`: adapter selection, capability reporting, prompt preparation, clipboard fallback, and chat focus.
- `WorkspaceService`: workspace selection, file access, trust state, watchers, and debounced refresh.

The Webview will receive serializable snapshots and send typed intent messages. It will never receive raw command lines to execute or arbitrary filesystem paths to read.

### Use an immutable dashboard snapshot with lazy selected-change detail

Summary refresh will call OpenSpec context/list surfaces for the selected workspace and read the archive directory. Per-change status, apply instructions, artifacts, tasks, and delta mappings will be fetched only for the selected change. This avoids running one CLI process per visible card.

Each successful refresh creates a versioned snapshot. If refresh fails, the previous snapshot remains visible with a stale marker and diagnostic information. Filesystem and Git events are debounced, and an operation completion triggers a targeted refresh.

The extension will reject an OpenSpec root resolved only from an unrelated ancestor unless it contains or explicitly owns the selected workspace. This prevents a folder nested under a broad home-level OpenSpec root from displaying unrelated changes.

### Resolve the OpenSpec CLI without embedding workflow semantics

CLI resolution order will be:

1. A user-configured executable or command template.
2. A workspace-local OpenSpec executable.
3. `openspec` available on the extension-host PATH.
4. A clearly labeled `npx --yes @fission-ai/openspec` fallback.

The service will execute fixed argument arrays, validate workspace and change identifiers, apply timeouts, strip ANSI output, and parse JSON before updating state. Npx fallback failures will produce setup guidance and will not be retried continuously by file watchers. Bundling the OpenSpec CLI was rejected because it would make the private VSIX substantially larger and couple extension releases to CLI releases.

### Model assistant integration as capability-based adapters

The built-in universal adapter will always work by copying the complete `/opsx:*` request and focusing a configured chat command when available. Provider adapters for Trae or Codex may additionally prefill or submit text only if their installed extension exposes a known command contract. The dashboard will distinguish `copied`, `prefilled`, and `submitted`; it will never label a prepared request as a completed workflow.

Provider-specific command IDs will be settings rather than hardcoded assumptions when no stable public API exists. This preserves a useful flow as providers change.

### Keep direct archive separate and explicit

Normal Archive will be an assistant workflow. A secondary advanced action will run `openspec archive <change> --yes --json` only after a VS Code modal confirmation describing the resolved root and the fact that main specs may be updated and the change moved. The operation will have a single-flight key per workspace/change, stream output to a dedicated output channel, and refresh only after exit.

No equivalent direct buttons will pretend to perform Explore, Apply, or Sync because those require agent judgment.

### Use the built-in VS Code Git provider and commit the reviewed index

The extension will activate and consume the built-in `vscode.git` API when available. Repository state will be mapped into Webview-safe models. Stage and unstage actions will accept explicit resource identifiers, re-resolve them against the current repository state, and invoke only the corresponding provider operation.

Commit will always operate on Git's complete staged set. The Webview must show that complete set, invalidate acknowledgement when it changes, highlight paths outside the selected OpenSpec change, and require acknowledgement before committing mixed work. This is safer than trying to construct a temporary index or silently modifying existing staged changes.

Commit-message suggestions will be deterministic templates based on staged path transitions and the selected change. Ambiguous state produces choices or no suggestion. The user remains responsible for the final editable message.

### Enforce Webview and workspace security boundaries

The Webview will use a nonce-based content security policy, `localResourceRoots`, local assets only, encoded text rendering, and a narrow typed message allowlist. Mutating actions will be disabled when VS Code does not trust the workspace. Extension-host handlers will revalidate trust, selected root, change, repository, current Git state, and action eligibility instead of trusting Webview state.

## Risks / Trade-offs

- **Provider chat commands may be undocumented or change across Trae/Codex versions** → Keep the clipboard-and-focus adapter as the guaranteed behavior and expose provider command IDs as configuration.
- **Npx fallback can be slow or require network access** → Cache successful resolution, avoid invoking it for every card, retain stale snapshots, and show installation guidance for a local/global CLI.
- **The built-in Git extension API is an integration dependency** → Detect its version and capabilities, isolate it behind `GitService`, and degrade to a read-only unavailable state rather than shelling out unexpectedly.
- **Replacing the Tree View removes a familiar quick file browser** → Provide a Files section and normal editor opening before removing the existing view contribution.
- **Webview build tooling increases source and VSIX complexity** → Keep dependencies small, emit deterministic production assets, exclude source maps and development dependencies from the VSIX, and add package validation.
- **Archive and commit are destructive or externally visible operations** → Require explicit confirmation/review, serialize operations, retain output, and never chain archive to commit automatically.
- **Multiple roots and repositories can create ambiguous scope** → Require an explicit workspace and repository selection and show both in every mutating confirmation.

## Migration Plan

1. Add TypeScript and Webview build tooling while preserving the current extension entry point and packaged behavior.
2. Introduce shared message types and read-only OpenSpec/Git services with automated tests.
3. Add the dashboard command, status-bar entry point, theme-aware shell, restoration, and empty/error states.
4. Add lifecycle summaries, selected-change details, file navigation, and Delta-to-Main comparison.
5. Add assistant adapters and guarded direct archive.
6. Add Git staging, commit review, and message suggestions.
7. Remove the Activity Bar Tree View only after dashboard file navigation passes manual and automated verification.
8. Bump the private extension version, package a VSIX, install it locally, and run an end-to-end smoke test in single-root, multi-root, no-OpenSpec, and untrusted workspaces.

Rollback consists of reinstalling the previous VSIX. Existing OpenSpec files, Git state, and user/workspace settings remain compatible because the migration does not rewrite them automatically.

## Open Questions

- The exact command IDs and argument shapes exposed by the installed Trae and Codex integrations will be discovered during the adapter task. Absence of either integration does not block the universal adapter.
