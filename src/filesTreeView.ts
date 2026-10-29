import * as vscode from 'vscode';
import type { WorkspaceService } from './services/workspaceService';

export const filesViewId = 'openspecWorkbench.files';

type Node =
  | { kind: 'workspace'; folder: vscode.WorkspaceFolder }
  | { kind: 'entry'; folder: vscode.WorkspaceFolder; uri: vscode.Uri; directory: boolean };

export class FilesTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly workspace: WorkspaceService) {
    this.subscription = workspace.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'workspace') {
      const item = new vscode.TreeItem(node.folder.name, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = 'workspace';
      return item;
    }
    const item = new vscode.TreeItem(
      node.uri,
      node.directory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    if (!node.directory) {
      item.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [node.uri]
      };
    }
    item.contextValue = node.directory ? 'directory' : 'file';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!node) {
      if (folders.length > 1) {
        return folders.map((folder) => ({ kind: 'workspace', folder }));
      }
      return folders[0] ? this.rootEntries(folders[0]) : [];
    }
    if (node.kind === 'workspace') {
      return this.rootEntries(node.folder);
    }
    if (!node.directory) {
      return [];
    }
    try {
      return await this.workspace.readDirectory(node.folder, node.uri.fsPath).then((entries) =>
        entries.map((entry) => ({
          kind: 'entry' as const,
          folder: node.folder,
          uri: vscode.Uri.file(entry.path),
          directory: entry.type === 'directory'
        }))
      );
    } catch {
      return [];
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }

  private async rootEntries(folder: vscode.WorkspaceFolder): Promise<Node[]> {
    const roots = await this.workspace.getSupportRoots(folder);
    return roots.map((root) => ({
      kind: 'entry' as const,
      folder,
      uri: vscode.Uri.file(root.path),
      directory: true
    }));
  }
}
