import * as vscode from 'vscode';
import type {
  ChangeDetail,
  ChangeSummary,
  DashboardSnapshot,
  DashboardTab,
  HostToWebviewMessage,
  OperationNotice,
  WebviewToHostMessage
} from './shared/protocol';
import { isWebviewToHostMessage } from './shared/protocol';
import { AssistantService } from './services/assistantService';
import { GitService } from './services/gitService';
import { OpenSpecService } from './services/openSpecService';
import { WorkspaceService } from './services/workspaceService';

export interface DashboardServices {
  workspace: WorkspaceService;
  openspec: OpenSpecService;
  git: GitService;
  assistant: AssistantService;
  output: vscode.OutputChannel;
}

interface PersistedSelection {
  workspaceId?: string;
  changeName?: string;
  repositoryId?: string;
  tab?: DashboardTab;
}

const viewType = 'openspecWorkbench.dashboard';
const selectionKey = 'openspecWorkbench.selection';

export class DashboardPanel implements vscode.Disposable {
  static current: DashboardPanel | undefined;

  private snapshot: DashboardSnapshot | undefined;
  private detail: ChangeDetail | undefined;
  private version = 0;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly running = new Set<string>();
  private selection: PersistedSelection;
  private refreshSequence = 0;
  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly services: DashboardServices
  ) {
    DashboardPanel.current = this;
    this.selection = context.workspaceState.get<PersistedSelection>(selectionKey, {});
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')]
    };
    this.panel.webview.html = this.getHtml();
    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      })
    );
  }

  static open(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    services: DashboardServices
  ): DashboardPanel {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal(vscode.ViewColumn.One);
      void DashboardPanel.current.refresh();
      return DashboardPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      viewType,
      'OpenSpec Workbench',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'coin-new.svg');
    return new DashboardPanel(panel, extensionUri, context, services);
  }

  static restore(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    services: DashboardServices
  ): DashboardPanel {
    const restored = new DashboardPanel(panel, extensionUri, context, services);
    void restored.refresh();
    return restored;
  }

  static async refreshCurrent(): Promise<void> {
    await DashboardPanel.current?.refresh();
  }

  async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    const workspaces = this.services.workspace.getWorkspaces();
    const selectedFolder = this.services.workspace.getFolder(this.selection.workspaceId);
    if (!selectedFolder) {
      this.snapshot = {
        version: ++this.version,
        generatedAt: new Date().toISOString(),
        trusted: vscode.workspace.isTrusted,
        workspaces,
        stale: false,
        changes: [],
        mainSpecs: [],
        supportRoots: [],
        git: emptyGit('Open a workspace folder to use Git tools.')
      };
      await this.post({ type: 'snapshot', snapshot: this.snapshot });
      return;
    }

    this.selection.workspaceId = selectedFolder.uri.toString();
    const supportPromise = this.services.workspace.getSupportRoots(selectedFolder);
    // Git state is secondary: it must never block or fail the OpenSpec snapshot.
    const gitFallback = emptyGit('Git state could not be loaded.');
    const gitPromise = withTimeout(
      this.services.git.getSnapshot(
        selectedFolder,
        this.selection.repositoryId,
        this.selection.changeName
      ),
      8_000,
      emptyGit('Git state timed out.')
    ).catch(() => gitFallback);

    try {
      const [summary, supportRoots, git] = await Promise.all([
        this.services.openspec.getSummary(selectedFolder),
        supportPromise,
        gitPromise
      ]);
      if (sequence !== this.refreshSequence) {
        return;
      }
      if (
        this.selection.changeName &&
        !summary.changes.some((change) => change.name === this.selection.changeName)
      ) {
        this.selection.changeName = undefined;
        this.detail = undefined;
      }
      if (git.selectedRepositoryId) {
        this.selection.repositoryId = git.selectedRepositoryId;
      }
      this.snapshot = {
        version: ++this.version,
        generatedAt: new Date().toISOString(),
        trusted: vscode.workspace.isTrusted,
        workspaces,
        selectedWorkspaceId: selectedFolder.uri.toString(),
        selectedChangeName: this.selection.changeName,
        selectedTab: this.selection.tab,
        rootPath: summary.rootPath,
        stale: false,
        changes: summary.changes,
        mainSpecs: summary.mainSpecs,
        supportRoots,
        git
      };
      await this.persistSelection();
      await this.post({ type: 'snapshot', snapshot: this.snapshot });
      await this.refreshDetail();
    } catch (error) {
      if (sequence !== this.refreshSequence) {
        return;
      }
      const [supportRoots, git] = await Promise.all([
        supportPromise.catch(() => []),
        gitPromise.catch(() => emptyGit('Git state could not be loaded.'))
      ]);
      const previous = this.snapshot?.selectedWorkspaceId === selectedFolder.uri.toString()
        ? this.snapshot
        : undefined;
      this.snapshot = {
        version: ++this.version,
        generatedAt: new Date().toISOString(),
        trusted: vscode.workspace.isTrusted,
        workspaces,
        selectedWorkspaceId: selectedFolder.uri.toString(),
        selectedChangeName: this.selection.changeName,
        selectedTab: this.selection.tab,
        rootPath: previous?.rootPath,
        stale: Boolean(previous),
        error: errorMessage(error),
        changes: previous?.changes ?? [],
        mainSpecs: previous?.mainSpecs ?? [],
        supportRoots,
        git
      };
      await this.post({ type: 'snapshot', snapshot: this.snapshot });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (DashboardPanel.current === this) {
      DashboardPanel.current = undefined;
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isWebviewToHostMessage(value)) {
      await this.notice('error', 'The dashboard sent an invalid request.');
      return;
    }
    const message: WebviewToHostMessage = value;
    try {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          await this.refresh();
          return;
        case 'selectWorkspace':
          this.selection = { workspaceId: message.workspaceId };
          this.detail = undefined;
          await this.persistSelection();
          await this.refresh();
          return;
        case 'selectChange':
          this.selection.changeName = message.changeName;
          this.detail = undefined;
          await this.persistSelection();
          await this.refresh();
          return;
        case 'selectTab':
          this.selection.tab = message.tab;
          await this.persistSelection();
          return;
        case 'selectRepository':
          this.selection.repositoryId = message.repositoryId;
          await this.persistSelection();
          await this.refresh();
          return;
        case 'loadDirectory':
          await this.loadDirectory(message.path);
          return;
        case 'openFile':
          await this.openFile(message.path);
          return;
        case 'openDiff':
          await this.openDiff(message.deltaPath, message.mainPath, message.title);
          return;
        case 'workflow':
          await this.runWorkflow(message.action, message.changeName);
          return;
        case 'directArchive':
          await this.runDirectArchive(message.changeName);
          return;
        case 'stage':
          await this.services.git.stage(message.repositoryId, message.uris);
          await this.notice('success', `Staged ${message.uris.length} selected file(s).`);
          await this.refresh();
          return;
        case 'unstage':
          await this.services.git.unstage(message.repositoryId, message.uris);
          await this.notice('success', `Unstaged ${message.uris.length} selected file(s).`);
          await this.refresh();
          return;
        case 'commit':
          await this.commit(message);
          return;
      }
    } catch (error) {
      this.services.output.appendLine(errorMessage(error));
      await this.notice('error', errorMessage(error), detailedError(error));
    }
  }

  private async refreshDetail(): Promise<void> {
    const folder = this.services.workspace.getFolder(this.selection.workspaceId);
    const selected = this.selectedChange();
    if (!folder || !selected || !this.snapshot?.rootPath) {
      this.detail = undefined;
      await this.post({ type: 'detail', detail: undefined });
      return;
    }
    try {
      this.detail = await this.services.openspec.getDetail(folder, selected, this.snapshot.rootPath);
      await this.post({ type: 'detail', detail: this.detail });
    } catch (error) {
      this.detail = undefined;
      await this.post({ type: 'detail', detail: undefined });
      await this.notice('error', `Could not load ${selected.name}.`, detailedError(error));
    }
  }

  private async loadDirectory(requestedPath: string): Promise<void> {
    const folder = this.requireFolder();
    const children = await this.services.workspace.readDirectory(folder, requestedPath);
    await this.post({ type: 'directory', parentPath: requestedPath, children });
  }

  private async openFile(requestedPath: string): Promise<void> {
    const folder = this.requireFolder();
    this.services.workspace.assertWorkspacePath(folder, requestedPath, this.snapshot?.rootPath);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(requestedPath));
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async openDiff(deltaPath: string, mainPath: string, title: string): Promise<void> {
    const folder = this.requireFolder();
    this.services.workspace.assertWorkspacePath(folder, deltaPath, this.snapshot?.rootPath);
    this.services.workspace.assertWorkspacePath(folder, mainPath, this.snapshot?.rootPath);
    await vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(mainPath),
      vscode.Uri.file(deltaPath),
      title
    );
  }

  private async runWorkflow(
    action: 'explore' | 'apply' | 'sync' | 'archive',
    changeName?: string
  ): Promise<void> {
    const folder = this.requireFolder();
    if (action !== 'explore') {
      const selected = this.selectedChange(changeName);
      if (!selected || selected.archived) {
        throw new Error('Select an active OpenSpec change first.');
      }
      if (!this.detail || this.detail.name !== selected.name) {
        await this.refreshDetail();
      }
      if (action === 'apply' && !this.detail?.canApply) {
        throw new Error(this.detail?.eligibilityNotes.apply ?? 'Apply is unavailable.');
      }
      if (action === 'sync' && !this.detail?.canSync) {
        throw new Error(this.detail?.eligibilityNotes.sync ?? 'Sync is unavailable.');
      }
      changeName = selected.name;
    }

    const key = `assistant:${folder.uri.toString()}:${action}:${changeName ?? ''}`;
    await this.singleFlight(key, async () => {
      const result = await this.services.assistant.dispatch(action, folder.uri.fsPath, changeName);
      const message =
        result.outcome === 'copied'
          ? 'Workflow prompt copied. Paste and submit it in the opened assistant chat.'
          : 'Workflow prompt prepared in the configured assistant chat.';
      await this.notice('success', message, result.prompt);
    });
  }

  private async runDirectArchive(changeName: string): Promise<void> {
    const folder = this.requireFolder();
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust this workspace before archiving a change.');
    }
    const selected = this.selectedChange(changeName);
    if (!selected || selected.archived) {
      throw new Error('Select an active OpenSpec change first.');
    }
    if (!this.detail || this.detail.name !== selected.name) {
      await this.refreshDetail();
    }
    if (!this.detail?.canArchive) {
      throw new Error(this.detail?.eligibilityNotes.archive ?? 'Direct archive is unavailable.');
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Archive ${changeName} in ${this.snapshot?.rootPath}? This validates the change, may update main specs, and moves it into the archive.`,
      { modal: true },
      'Archive'
    );
    if (confirmation !== 'Archive') {
      await this.notice('info', 'Direct archive cancelled.');
      return;
    }

    const key = `archive:${folder.uri.toString()}:${changeName}`;
    await this.singleFlight(key, async () => {
      this.services.output.show(true);
      this.services.output.appendLine(`Archiving ${changeName}...`);
      await this.services.openspec.archive(folder, changeName, (chunk) =>
        this.services.output.append(chunk)
      );
      this.services.output.appendLine(`\nArchived ${changeName}.`);
      this.selection.changeName = undefined;
      this.detail = undefined;
      await this.persistSelection();
      await this.notice('success', `Archived ${changeName}.`);
      await this.refresh();
    });
  }

  private async commit(message: Extract<WebviewToHostMessage, { type: 'commit' }>): Promise<void> {
    const folder = this.requireFolder();
    const key = `commit:${message.repositoryId}`;
    await this.singleFlight(key, async () => {
      await this.services.git.commit(
        folder,
        message.repositoryId,
        message.message,
        message.expectedFingerprint,
        message.acknowledgeMixed,
        this.selection.changeName
      );
      await this.notice('success', 'Commit created successfully.');
      await this.refresh();
    });
  }

  private async singleFlight(key: string, operation: () => Promise<void>): Promise<void> {
    if (this.running.has(key)) {
      await this.notice('info', 'That operation is already running.');
      return;
    }
    this.running.add(key);
    await this.post({ type: 'busy', key, active: true });
    try {
      await operation();
    } finally {
      this.running.delete(key);
      await this.post({ type: 'busy', key, active: false });
    }
  }

  private selectedChange(name = this.selection.changeName): ChangeSummary | undefined {
    return this.snapshot?.changes.find((change) => change.name === name);
  }

  private requireFolder(): vscode.WorkspaceFolder {
    const folder = this.services.workspace.getFolder(this.selection.workspaceId);
    if (!folder) {
      throw new Error('Open a workspace folder first.');
    }
    return folder;
  }

  private async persistSelection(): Promise<void> {
    await this.context.workspaceState.update(selectionKey, this.selection);
  }

  private async notice(
    level: OperationNotice['level'],
    message: string,
    detail?: string
  ): Promise<void> {
    await this.post({ type: 'notice', notice: { level, message, detail } });
  }

  private async post(message: HostToWebviewMessage): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const nonce = randomNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'dashboard.js')
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'dashboard.css')
    );
    const csp = [
      "default-src 'none'",
      `style-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${this.panel.webview.cspSource} data:`,
      "connect-src 'none'",
      "font-src 'none'"
    ].join('; ');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>OpenSpec Workbench</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function emptyGit(message: string): DashboardSnapshot['git'] {
  return {
    available: false,
    message,
    repositories: [],
    working: [],
    staged: [],
    conflicts: [],
    indexFingerprint: '',
    suggestedMessage: '',
    requiresMixedAcknowledgement: false
  };
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function detailedError(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const value = error as { stdout?: unknown; stderr?: unknown };
    const output = [value.stdout, value.stderr]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('\n');
    return output || undefined;
  }
  return undefined;
}

export { viewType as dashboardViewType };
