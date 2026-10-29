# OpenSpec Workbench

Private VS Code extension for browsing and operating an OpenSpec project from a visual editor dashboard. The support folders stay hidden from the normal Explorer, while the Workbench keeps lifecycle, artifacts, tasks, specs, workflows, files, and Git review together.

## Open the dashboard

- Click **OpenSpec Workbench** in the status bar; or
- Run **OpenSpec: Open Dashboard** from the Command Palette.

Only one dashboard is opened per VS Code window. The selected workspace, change, repository, and detail tab survive panel reloads.

## What it shows

- Active changes grouped as **Not started**, **In progress**, and **Completed**.
- Archived changes in a separate read-only lifecycle section.
- Task totals and progress percentages.
- Main specs and Delta-to-Main comparisons in the native VS Code diff editor.
- Proposal, design, tasks, delta specs, and lazily loaded support folders.
- Git working-tree, staged, and conflicted files using repository-relative paths.

The configured folders default to `.agents`, `agents`, `.trae`, `openspec`, and `.agent`. Existing folders appear in the Files tab, while matching default `files.exclude` entries keep them out of Explorer. Set an entry to `false` in VS Code settings if you want it visible in Explorer again.

## OpenSpec workflows

**Explore**, **Apply**, **Sync**, and agent-driven **Archive** prepare the matching `/opsx:*` prompt. The prompt is always copied first, so it is not lost if Trae, Codex, or another chat command is unavailable or changes its command ID.

The universal adapter opens VS Code Chat when available. Trae and Codex adapters conservatively discover chat/focus commands. A known command can be set explicitly; enable prompt arguments only when that provider documents support for them.

**Direct Archive** is the advanced destructive path. It is enabled only for an eligible completed change, requires workspace trust and a modal confirmation, runs `openspec archive`, streams output to the **OpenSpec Workbench** output channel, and refreshes the dashboard afterward.

## Git safety

- Stage and unstage act only on the files explicitly checked in the dashboard. There is no hidden `git add .`.
- Every staged path remains visible, including files unrelated to the selected OpenSpec change.
- Mixed-scope commits require an explicit acknowledgement.
- Any external index change invalidates the acknowledgement and requires another review.
- Commits are blocked for an empty message, empty staged set, conflicts, an untrusted workspace, a stale staged fingerprint, or a repository outside the selected workspace.
- Commit-message suggestions are editable. The defaults are `docs: add`, `docs: update`, `docs: sync`, and `docs: archive`.

## Settings

Search VS Code Settings for **OpenSpec Workbench**:

- `openspecWorkbench.folderNames`: support folders shown in Files.
- `openspecWorkbench.cliCommand`: explicit OpenSpec executable/command prefix.
- `openspecWorkbench.assistantProvider`: `universal`, `trae`, or `codex`.
- `openspecWorkbench.assistantCommand`: explicit assistant command ID.
- `openspecWorkbench.assistantCommandAcceptsPrompt`: pass the prompt to that explicit command.
- `openspecWorkbench.refreshDebounceMs`: filesystem refresh debounce.
- `openspecWorkbench.commitTemplates`: editable Git message templates.

CLI resolution tries the explicit setting, a workspace-local package, npm's default global installation directory (or `NPM_CONFIG_PREFIX`), `openspec` on PATH, and finally a labeled `npx --yes @fission-ai/openspec` fallback. Results and short failures are cached per workspace.

## Troubleshooting

- **No OpenSpec root:** initialize OpenSpec inside the selected workspace. Unrelated ancestor roots are deliberately rejected.
- **CLI unavailable:** install `@fission-ai/openspec` or set `openspecWorkbench.cliCommand`.
- **Workflow buttons disabled:** trust the workspace and select an eligible active change.
- **No Git controls:** open a Git repository associated with the workspace; choose a repository when the workspace contains more than one.
- **Stale banner:** the last valid snapshot is retained when refresh fails. Fix the reported CLI/filesystem issue and press Refresh.
- **Folders still visible:** inspect workspace-level `files.exclude` overrides; an explicit `false` wins over the extension default.

## Build and package locally

Requirements: Node.js 20 or newer and npm.

```powershell
cd "C:\path\to\openspec-sidebar"
npm install
npm run check
npm run package
```

If the Windows `npm` shim is broken but Node's bundled npm exists, use:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run package
```

The VSIX is written to this directory. Install it with **Extensions: Install from VSIX...**, choose the generated file, and run **Developer: Reload Window**. Rebuild and reinstall after source changes.
