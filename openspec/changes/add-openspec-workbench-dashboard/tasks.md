## 1. Build and Type Foundations

- [x] 1.1 Add TypeScript, React, Vite, linting, and test dependencies with separate production builds for the extension host and Webview.
- [x] 1.2 Define shared serializable dashboard models and a discriminated, allowlisted message protocol with runtime validation at the extension-host boundary.
- [x] 1.3 Migrate the extension activation entry point to TypeScript while preserving the current folder exclusions, configurable folder names, file opening, and refresh behavior.
- [x] 1.4 Configure deterministic packaging so the VSIX includes compiled host/Webview assets and required resources but excludes development source maps, tests, and dependencies.

## 2. OpenSpec Data Services

- [x] 2.1 Implement the configurable OpenSpec CLI resolver for explicit path, workspace-local executable, PATH executable, and labeled npx fallback, including timeouts, ANSI removal, structured errors, and cache behavior.
- [x] 2.2 Implement per-workspace OpenSpec context resolution and reject unrelated ancestor roots while supporting explicit valid roots in single-root and multi-root workspaces.
- [x] 2.3 Implement immutable summary snapshots for active changes, lifecycle classification, task counts, main specs, archived changes, and workspace trust state.
- [x] 2.4 Implement lazy selected-change detail loading for status, artifacts, tasks, delta paths, main-spec mappings, and action eligibility.
- [x] 2.5 Implement configured support-folder browsing and secure normal-editor opening for artifacts, main specs, deltas, and support files.
- [x] 2.6 Implement debounced OpenSpec/workspace watchers, targeted refresh after operations, stale-snapshot retention, retry, and selection preservation.
- [x] 2.7 Add unit and integration tests for CLI resolution, JSON validation, lifecycle classification, new-capability deltas, archived changes, root isolation, refresh failures, and multi-root scoping.

## 3. Editor Dashboard

- [x] 3.1 Implement a singleton `WebviewPanel`, dashboard command, status-bar entry point, serializer, local resource roots, nonce-based CSP, and persisted workspace/change/tab selection.
- [x] 3.2 Build the responsive dashboard shell with VS Code theme tokens, workspace selection, summary metrics, logical keyboard order, accessible labels, and high-contrast focus states.
- [x] 3.3 Build lifecycle sections and visual change cards for not-started, partial, completed, and archived changes with textual status, progress counts, percentages, filtering, and selection.
- [x] 3.4 Build selected-change Overview, Artifacts, Tasks, Files, and Git tabs with normal-editor navigation and archived-change read-only presentation.
- [x] 3.5 Build Main Specs navigation and Delta-to-Main comparison, including an explicit new-capability state and integration with the native VS Code diff editor where appropriate.
- [x] 3.6 Build loading, no-workspace, no-OpenSpec-root, CLI-unavailable, stale-data, and retryable error states without discarding the last successful snapshot.
- [x] 3.7 Add Webview component and message-flow tests covering theme-independent semantics, keyboard navigation, state restoration, duplicate-open prevention, and stale refresh behavior.

## 4. Workflow Actions and Assistant Adapters

- [x] 4.1 Implement assistant adapter interfaces and the universal clipboard-and-focus adapter with explicit `copied`, `prefilled`, and `submitted` outcomes.
- [x] 4.2 Discover the installed Trae and Codex command capabilities, add configurable provider adapters where safe, and verify that unavailable or changed provider commands fall back without losing the prepared prompt.
- [x] 4.3 Implement validated, workspace-scoped Explore, Apply, Sync, and agent-driven Archive prompt generation with eligibility explanations and duplicate-action prevention.
- [x] 4.4 Implement advanced direct CLI archive with modal scope/effect confirmation, a per-change single-flight guard, dedicated output channel, parsed success/failure, and terminal-state refresh.
- [x] 4.5 Enforce workspace trust and extension-host revalidation for every workflow message, change identifier, selected root, and direct CLI operation.
- [x] 4.6 Add tests for prompt content, adapter fallback, unavailable providers, missing artifacts, changes without deltas, cancelled archive, failed validation, duplicate operations, and untrusted workspaces.

## 5. Git Review and Commits

- [x] 5.1 Implement a `GitService` over the built-in VS Code Git provider with capability detection, repository selection, branch/conflict/status snapshots, change events, and a read-only unavailable state.
- [x] 5.2 Build the Git tab with repository selection and clearly separated working-tree, staged, and conflicted file lists using repository-relative paths and status labels.
- [x] 5.3 Implement explicit Stage Selected and Unstage Selected operations that revalidate current state and never stage, unstage, discard, or commit unselected paths.
- [x] 5.4 Implement and test deterministic editable suggestions for `docs: add`, `docs: update`, `docs: sync`, and `docs: archive`, including ambiguous lifecycle states that produce no confident suggestion.
- [x] 5.5 Implement complete staged-set review, mixed-scope highlighting, acknowledgement invalidation when the index changes, and commit eligibility rules for message, files, conflicts, trust, and repository scope.
- [x] 5.6 Implement commits through the selected Git provider with progress, hook/identity/conflict error reporting, message preservation on failure, and post-commit refresh.
- [x] 5.7 Add integration tests proving unrelated staged work is always visible, mixed work requires acknowledgement, external index changes invalidate review, and no hidden `git add .` behavior occurs.

## 6. Migration, Documentation, and Release Verification

- [x] 6.1 Verify dashboard file navigation reaches feature parity with the current Tree View, then remove the Activity Bar container, Tree View provider, obsolete commands, and manifest contributions.
- [x] 6.2 Add and document settings for OpenSpec CLI resolution, assistant adapter/provider command, configured support folders, refresh behavior, and Git message templates while preserving existing folder exclusions.
- [x] 6.3 Update the README with dashboard usage, workflow handoff semantics, direct archive warnings, Git safety rules, troubleshooting, and local build/package/install instructions.
- [x] 6.4 Run automated extension-host and Webview tests plus manual smoke tests for single-root, multi-root, no-root, archived-only, CLI failure, Git-unavailable, and untrusted workspace cases.
- [x] 6.5 Run visual and accessibility QA in light, dark, and high-contrast themes at narrow and wide editor sizes, fixing overflow, focus, contrast, and screen-reader naming defects.
- [x] 6.6 Build the production assets, validate package contents, bump the private extension version, create the VSIX, install it locally, reload VS Code, and complete an end-to-end workflow and Git commit smoke test.
