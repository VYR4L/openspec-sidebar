import * as vscode from 'vscode';
import { isPathWithin } from '../core/paths';
import type { FileNode, WorkspaceOption } from '../shared/protocol';

const defaultFolders = ['.agents', 'agents', '.trae', 'openspec', '.agent'];

export class WorkspaceService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchers: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private timer: NodeJS.Timeout | undefined;

  readonly onDidChange = this.changeEmitter.event;

  constructor() {
    this.rebuildWatchers();
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.rebuildWatchers();
        this.scheduleChange();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('openspecWorkbench')) {
          this.rebuildWatchers();
          this.scheduleChange();
        }
      })
    );
  }

  getWorkspaces(): WorkspaceOption[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      id: folder.uri.toString(),
      name: folder.name,
      path: folder.uri.fsPath
    }));
  }

  getFolder(workspaceId: string | undefined): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.find((folder) => folder.uri.toString() === workspaceId) ?? folders[0];
  }

  async getSupportRoots(folder: vscode.WorkspaceFolder): Promise<FileNode[]> {
    const roots: FileNode[] = [];
    for (const name of this.getFolderNames()) {
      const uri = vscode.Uri.joinPath(folder.uri, name);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
          roots.push({
            id: uri.toString(),
            name,
            path: uri.fsPath,
            type: 'directory',
            loaded: false
          });
        }
      } catch {
        // Configured folders that do not exist are omitted.
      }
    }
    return roots;
  }

  async readDirectory(folder: vscode.WorkspaceFolder, requestedPath: string): Promise<FileNode[]> {
    await this.assertSupportPath(folder, requestedPath);
    const uri = vscode.Uri.file(requestedPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .sort(([leftName, leftType], [rightName, rightType]) => {
        const leftDirectory = (leftType & vscode.FileType.Directory) !== 0;
        const rightDirectory = (rightType & vscode.FileType.Directory) !== 0;
        if (leftDirectory !== rightDirectory) {
          return leftDirectory ? -1 : 1;
        }
        return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: 'base' });
      })
      .map(([name, fileType]) => {
        const child = vscode.Uri.joinPath(uri, name);
        const directory = (fileType & vscode.FileType.Directory) !== 0;
        return {
          id: child.toString(),
          name,
          path: child.fsPath,
          type: directory ? 'directory' : 'file',
          loaded: directory ? false : undefined
        } satisfies FileNode;
      });
  }

  assertWorkspacePath(folder: vscode.WorkspaceFolder, requestedPath: string, extraRoot?: string): void {
    if (
      !isPathWithin(folder.uri.fsPath, requestedPath) &&
      (!extraRoot || !isPathWithin(extraRoot, requestedPath))
    ) {
      throw new Error('The requested path is outside the selected workspace and OpenSpec root.');
    }
  }

  getFolderNames(): string[] {
    const configured = vscode.workspace
      .getConfiguration('openspecWorkbench')
      .get<unknown>('folderNames', defaultFolders);
    if (!Array.isArray(configured)) {
      return defaultFolders;
    }
    return [...new Set(configured)]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !value.includes('/') && !value.includes('\\'));
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    for (const watcher of this.watchers.splice(0)) {
      watcher.dispose();
    }
    this.changeEmitter.dispose();
  }

  private async assertSupportPath(
    folder: vscode.WorkspaceFolder,
    requestedPath: string
  ): Promise<void> {
    const roots = await this.getSupportRoots(folder);
    if (!roots.some((root) => isPathWithin(root.path, requestedPath))) {
      throw new Error('The requested directory is outside configured support folders.');
    }
  }

  private rebuildWatchers(): void {
    for (const watcher of this.watchers.splice(0)) {
      watcher.dispose();
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const name of this.getFolderNames()) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, `{${name},${name}/**/*}`)
        );
        watcher.onDidCreate(() => this.scheduleChange());
        watcher.onDidChange(() => this.scheduleChange());
        watcher.onDidDelete(() => this.scheduleChange());
        this.watchers.push(watcher);
      }
    }
  }

  private scheduleChange(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const delay = vscode.workspace
      .getConfiguration('openspecWorkbench')
      .get<number>('refreshDebounceMs', 300);
    this.timer = setTimeout(() => this.changeEmitter.fire(), delay);
  }
}
