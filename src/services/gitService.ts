import path from 'node:path';
import * as vscode from 'vscode';
import { defaultCommitTemplates, suggestCommitMessage, type CommitTemplates } from '../core/commitMessages';
import { fingerprint, isOutsideSelectedChange, selectAllowedValues } from '../core/gitSafety';
import { isPathWithin, toPortableRelative } from '../core/paths';
import type { GitFile, GitSnapshot } from '../shared/protocol';

interface GitChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri: vscode.Uri;
  status: number;
}

interface GitBranch {
  name?: string;
}

interface GitRepositoryState {
  HEAD?: GitBranch;
  indexChanges: GitChange[];
  workingTreeChanges: GitChange[];
  mergeChanges: GitChange[];
  onDidChange: vscode.Event<void>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
  add(resources: vscode.Uri[]): Promise<void>;
  revert(resources: vscode.Uri[]): Promise<void>;
  commit(message: string): Promise<void>;
  status(): Promise<void>;
}

interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

export class GitService implements vscode.Disposable {
  private api: GitApi | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly repositorySubscriptions = new Map<string, vscode.Disposable>();
  private readonly disposables: vscode.Disposable[] = [];

  readonly onDidChange = this.changeEmitter.event;

  async initialize(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!extension) {
      return;
    }
    const exports = extension.isActive ? extension.exports : await extension.activate();
    this.api = exports.getAPI(1);
    for (const repository of this.api.repositories) {
      this.watchRepository(repository);
    }
    this.disposables.push(
      this.api.onDidOpenRepository((repository) => {
        this.watchRepository(repository);
        this.changeEmitter.fire();
      }),
      this.api.onDidCloseRepository((repository) => {
        this.repositorySubscriptions.get(repository.rootUri.toString())?.dispose();
        this.repositorySubscriptions.delete(repository.rootUri.toString());
        this.changeEmitter.fire();
      })
    );
  }

  async getSnapshot(
    folder: vscode.WorkspaceFolder,
    selectedRepositoryId: string | undefined,
    selectedChangeName: string | undefined
  ): Promise<GitSnapshot> {
    if (!this.api) {
      return unavailableSnapshot('The built-in VS Code Git provider is unavailable.');
    }

    const repositories = this.repositoriesForWorkspace(folder);
    const summaries = repositories.map((repository) => ({
      id: repository.rootUri.toString(),
      name: path.basename(repository.rootUri.fsPath),
      path: repository.rootUri.fsPath
    }));
    const selected = repositories.find(
      (repository) => repository.rootUri.toString() === selectedRepositoryId
    ) ?? (repositories.length === 1 ? repositories[0] : undefined);

    if (!selected) {
      return {
        ...unavailableSnapshot(
          repositories.length > 1
            ? 'Select a Git repository to enable staging and commits.'
            : 'No Git repository is associated with this workspace.'
        ),
        available: repositories.length > 0,
        repositories: summaries
      };
    }

    // Do not call selected.status() here: it fires state.onDidChange, which triggers
    // another refresh, creating a loop that keeps superseding the pending snapshot.
    const working = selected.state.workingTreeChanges.map((change) =>
      mapChange(selected, change, 'working', selectedChangeName)
    );
    const staged = selected.state.indexChanges.map((change) =>
      mapChange(selected, change, 'staged', selectedChangeName)
    );
    const conflicts = selected.state.mergeChanges.map((change) =>
      mapChange(selected, change, 'conflict', selectedChangeName)
    );
    const templates = readTemplates();

    return {
      available: true,
      repositories: summaries,
      selectedRepositoryId: selected.rootUri.toString(),
      branch: selected.state.HEAD?.name,
      working,
      staged,
      conflicts,
      indexFingerprint: fingerprint(staged),
      suggestedMessage: suggestCommitMessage(staged, selectedChangeName, templates),
      requiresMixedAcknowledgement: staged.some((file) => file.outsideSelectedChange)
    };
  }

  async stage(repositoryId: string, uriStrings: string[]): Promise<void> {
    this.assertTrusted();
    const repository = this.getRepository(repositoryId);
    const allowed = new Map(
      repository.state.workingTreeChanges.map((change) => [change.uri.toString(), change.uri])
    );
    const selected = selectAllowedValues(uriStrings, allowed);
    if (selected.length === 0) {
      throw new Error('No current working-tree files were selected for staging.');
    }
    await repository.add(selected);
    await repository.status();
  }

  async unstage(repositoryId: string, uriStrings: string[]): Promise<void> {
    this.assertTrusted();
    const repository = this.getRepository(repositoryId);
    const allowed = new Map(
      repository.state.indexChanges.map((change) => [change.uri.toString(), change.uri])
    );
    const selected = selectAllowedValues(uriStrings, allowed);
    if (selected.length === 0) {
      throw new Error('No current staged files were selected for unstaging.');
    }
    await repository.revert(selected);
    await repository.status();
  }

  async commit(
    folder: vscode.WorkspaceFolder,
    repositoryId: string,
    message: string,
    expectedFingerprint: string,
    acknowledgeMixed: boolean,
    selectedChangeName: string | undefined
  ): Promise<void> {
    this.assertTrusted();
    const repository = this.getRepository(repositoryId);
    if (!isPathWithin(folder.uri.fsPath, repository.rootUri.fsPath) && !isPathWithin(repository.rootUri.fsPath, folder.uri.fsPath)) {
      throw new Error('The selected Git repository is outside the selected workspace.');
    }

    await repository.status();
    const staged = repository.state.indexChanges.map((change) =>
      mapChange(repository, change, 'staged', selectedChangeName)
    );
    const conflicts = repository.state.mergeChanges;
    if (message.trim().length === 0) {
      throw new Error('Enter a commit message.');
    }
    if (staged.length === 0) {
      throw new Error('There are no staged files to commit.');
    }
    if (conflicts.length > 0) {
      throw new Error('Resolve merge conflicts before committing.');
    }
    if (fingerprint(staged) !== expectedFingerprint) {
      throw new Error('The staged set changed. Review the updated files before committing.');
    }
    if (staged.some((file) => file.outsideSelectedChange) && !acknowledgeMixed) {
      throw new Error('Acknowledge the staged files outside the selected OpenSpec change.');
    }

    await repository.commit(message.trim());
    await repository.status();
  }

  dispose(): void {
    for (const disposable of this.repositorySubscriptions.values()) {
      disposable.dispose();
    }
    this.repositorySubscriptions.clear();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.changeEmitter.dispose();
  }

  private watchRepository(repository: GitRepository): void {
    const id = repository.rootUri.toString();
    this.repositorySubscriptions.get(id)?.dispose();
    this.repositorySubscriptions.set(id, repository.state.onDidChange(() => this.changeEmitter.fire()));
  }

  private repositoriesForWorkspace(folder: vscode.WorkspaceFolder): GitRepository[] {
    return (this.api?.repositories ?? []).filter(
      (repository) =>
        isPathWithin(folder.uri.fsPath, repository.rootUri.fsPath) ||
        isPathWithin(repository.rootUri.fsPath, folder.uri.fsPath)
    );
  }

  private getRepository(repositoryId: string): GitRepository {
    const repository = this.api?.repositories.find(
      (candidate) => candidate.rootUri.toString() === repositoryId
    );
    if (!repository) {
      throw new Error('The selected Git repository is no longer available.');
    }
    return repository;
  }

  private assertTrusted(): void {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust this workspace before changing Git state.');
    }
  }
}

function mapChange(
  repository: GitRepository,
  change: GitChange,
  group: GitFile['group'],
  selectedChangeName: string | undefined
): GitFile {
  const relativePath = toPortableRelative(repository.rootUri.fsPath, change.uri.fsPath);
  return {
    id: `${group}:${change.uri.toString()}`,
    path: relativePath,
    uri: change.uri.toString(),
    status: statusLabel(change.status),
    group,
    outsideSelectedChange: isOutsideSelectedChange(relativePath, selectedChangeName)
  };
}

function statusLabel(status: number): string {
  return (
    [
      'Index modified',
      'Index added',
      'Index deleted',
      'Index renamed',
      'Index copied',
      'Modified',
      'Deleted',
      'Untracked',
      'Ignored',
      'Intent to add',
      'Intent to rename',
      'Type changed',
      'Added by us',
      'Added by them',
      'Deleted by us',
      'Deleted by them',
      'Both added',
      'Both deleted',
      'Both modified'
    ][status] ?? `Status ${status}`
  );
}

function readTemplates(): CommitTemplates {
  const configured = vscode.workspace
    .getConfiguration('openspecWorkbench')
    .get<Partial<CommitTemplates>>('commitTemplates', {});
  return {
    add: configured.add ?? defaultCommitTemplates.add,
    update: configured.update ?? defaultCommitTemplates.update,
    sync: configured.sync ?? defaultCommitTemplates.sync,
    archive: configured.archive ?? defaultCommitTemplates.archive
  };
}

function unavailableSnapshot(message: string): GitSnapshot {
  return {
    available: false,
    message,
    repositories: [],
    working: [],
    staged: [],
    conflicts: [],
    indexFingerprint: fingerprint([]),
    suggestedMessage: '',
    requiresMixedAcknowledgement: false
  };
}
