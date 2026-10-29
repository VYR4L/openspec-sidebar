## Why

The current extension removes OpenSpec-related folders from the standard Explorer, but replaces that clutter with another file tree in the sidebar. As OpenSpec usage grows, users need a visual workspace that communicates change progress, compares delta and main specs, launches workflow actions, and supports documentation commits without overloading the narrow sidebar.

## What Changes

- **BREAKING** Replace the Activity Bar tree as the primary interface with a persistent OpenSpec dashboard opened in an editor tab. Keep OpenSpec support folders hidden from the standard Explorer and make their files available from the dashboard.
- Add a theme-aware visual dashboard for draft/not-started, partially completed, completed, and archived changes, together with main specs and per-change progress.
- Add a change-detail workspace with overview, artifacts, task progress, delta-to-main comparison, files, and Git views.
- Add configurable workflow actions for Explore, Apply, Sync, and Archive. Route agent-driven operations through an assistant adapter and keep direct CLI archive as an explicit, confirmed advanced action.
- Add a Git workspace that shows changed and staged files, stages or unstages only explicit selections, suggests editable Conventional Commit messages such as `docs: add <change>` and `docs: archive <change>`, and commits only the visible staged set.
- Preserve multi-root workspace support, automatic refresh, and theme compatibility.

## Capabilities

### New Capabilities

- `workbench-dashboard`: Editor-hosted OpenSpec dashboard, lifecycle visualization, change details, artifact and file navigation, main specs, archived changes, and delta-to-main comparison.
- `workflow-actions`: Safe, configurable invocation of OpenSpec agent workflows and direct CLI operations from dashboard context.
- `git-commits`: Git status, explicit staging controls, lifecycle-aware commit-message suggestions, and guarded commits from the OpenSpec dashboard.

### Modified Capabilities

None. This project does not yet have main OpenSpec capabilities.

## Impact

- Replaces the existing `viewsContainers`/Tree View-centric UX in `package.json` and `extension.js` with a command-driven editor Webview panel and a lightweight entry point such as a status-bar item.
- Introduces a structured extension-host architecture for OpenSpec CLI access, workspace watching, assistant adapters, Git integration, and Webview messaging.
- Introduces a bundled Webview frontend and build pipeline, likely using React and Vite with VS Code theme variables and a strict content security policy.
- Uses the installed OpenSpec CLI for authoritative status and instruction JSON, with clear error states when the CLI or an OpenSpec root is unavailable.
- Integrates with the built-in VS Code Git extension where available and must preserve unrelated staged changes.
- Keeps existing `files.exclude` defaults and configurable OpenSpec folder names.
