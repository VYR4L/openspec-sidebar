import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { classifyLifecycle, progressPercent } from '../core/classification';
import { isPathWithin, isRelatedOpenSpecRoot, toPortableRelative } from '../core/paths';
import type {
  ChangeDetail,
  ChangeSummary,
  DeltaItem,
  MainSpecSummary,
  ResourceItem,
  TaskItem
} from '../shared/protocol';
import { CliError, CliRunner } from './cliRunner';

interface ContextOutput {
  root?: { path?: string };
  members?: Array<string | { path?: string }>;
}

interface ListChange {
  name?: string;
  completedTasks?: number;
  totalTasks?: number;
  status?: string;
  lastModified?: string;
}

interface ChangeListOutput {
  changes?: ListChange[];
}

interface SpecListOutput {
  specs?: Array<Record<string, unknown>>;
}

interface StatusOutput {
  changeName?: string;
  changeRoot?: string;
  isPlanningComplete?: boolean;
  artifactPaths?: Record<
    string,
    { existingOutputPaths?: string[]; resolvedOutputPath?: string; outputPath?: string }
  >;
  artifacts?: Array<{ id?: string; status?: string }>;
}

interface ApplyOutput {
  progress?: { total?: number; complete?: number; remaining?: number };
  tasks?: Array<{ id?: string; description?: string; done?: boolean }>;
}

export interface ProjectSummary {
  rootPath: string;
  changes: ChangeSummary[];
  mainSpecs: MainSpecSummary[];
}

export class OpenSpecService {
  constructor(private readonly cli: CliRunner) {}

  clearCliCache(): void {
    this.cli.clearCache();
  }

  async getSummary(folder: vscode.WorkspaceFolder): Promise<ProjectSummary> {
    const rootPath = await this.resolveRoot(folder);
    const [changesOutput, specsOutput, archived] = await Promise.all([
      this.cli.runJson<ChangeListOutput>(['list', '--json'], folder.uri.fsPath),
      this.cli.runJson<SpecListOutput>(['list', '--specs', '--json'], folder.uri.fsPath),
      this.listArchived(rootPath)
    ]);

    const changes: ChangeSummary[] = (changesOutput.changes ?? [])
      .filter((item): item is ListChange & { name: string } => typeof item.name === 'string')
      .map((item) => {
        const completedTasks = count(item.completedTasks);
        const totalTasks = count(item.totalTasks);
        return {
          id: item.name,
          name: item.name,
          lifecycle: classifyLifecycle(item),
          completedTasks,
          totalTasks,
          progressPercent: progressPercent(completedTasks, totalTasks),
          planningComplete: totalTasks > 0,
          archived: false,
          lastModified: item.lastModified,
          path: path.join(rootPath, 'openspec', 'changes', item.name)
        } satisfies ChangeSummary;
      });

    changes.push(...archived);
    return {
      rootPath,
      changes,
      mainSpecs: await this.listMainSpecs(rootPath, specsOutput)
    };
  }

  async getDetail(
    folder: vscode.WorkspaceFolder,
    summary: ChangeSummary,
    rootPath: string
  ): Promise<ChangeDetail> {
    if (summary.archived) {
      return this.getArchivedDetail(summary, rootPath);
    }

    const [statusOutput, applyOutput] = await Promise.all([
      this.cli.runJson<StatusOutput>(
        ['status', '--change', summary.name, '--json'],
        folder.uri.fsPath
      ),
      this.cli
        .runJson<ApplyOutput>(
          ['instructions', 'apply', '--change', summary.name, '--json'],
          folder.uri.fsPath
        )
        .catch(() => ({ progress: undefined, tasks: undefined }))
    ]);

    const changeRoot = statusOutput.changeRoot ?? summary.path;
    if (!changeRoot || !isPathWithin(rootPath, changeRoot)) {
      throw new Error('OpenSpec returned a change path outside the selected root.');
    }

    const tasks = normalizeTasks(applyOutput.tasks);
    const completedTasks = applyOutput.progress?.complete ?? tasks.filter((task) => task.done).length;
    const totalTasks = applyOutput.progress?.total ?? tasks.length;
    const deltas = await this.buildDeltas(
      rootPath,
      changeRoot,
      statusOutput.artifactPaths?.specs?.existingOutputPaths ?? []
    );
    const artifacts = this.buildArtifacts(statusOutput.artifactPaths, false);
    const planningComplete = Boolean(statusOutput.isPlanningComplete);
    const canApply = planningComplete && (totalTasks === 0 || completedTasks < totalTasks);
    const canSync = deltas.length > 0;
    const canArchive = totalTasks > 0 && completedTasks >= totalTasks;

    return {
      name: summary.name,
      archived: false,
      path: changeRoot,
      completedTasks,
      totalTasks,
      planningComplete,
      artifacts,
      tasks,
      deltas,
      canApply,
      canSync,
      canArchive,
      eligibilityNotes: {
        apply: canApply
          ? undefined
          : planningComplete
            ? 'All implementation tasks are already complete.'
            : 'Required planning artifacts are missing.',
        sync: canSync ? undefined : 'This change has no delta specifications.',
        archive: canArchive ? undefined : 'Complete every task before direct archive.'
      }
    };
  }

  async archive(
    folder: vscode.WorkspaceFolder,
    changeName: string,
    onOutput: (chunk: string) => void
  ): Promise<void> {
    await this.cli.run(['archive', changeName, '--yes', '--json'], folder.uri.fsPath, {
      timeoutMs: 120_000,
      onOutput
    });
  }

  private async resolveRoot(folder: vscode.WorkspaceFolder): Promise<string> {
    const context = await this.cli.runJson<ContextOutput>(['context', '--json'], folder.uri.fsPath);
    const rootPath = context.root?.path;
    if (!rootPath) {
      throw new CliError('No OpenSpec root was found for this workspace.', 'openspec context');
    }

    const memberPaths = (context.members ?? [])
      .map((member) => (typeof member === 'string' ? member : member.path))
      .filter((member): member is string => typeof member === 'string');
    const rootIsGitRepository = await exists(path.join(rootPath, '.git'));

    if (!isRelatedOpenSpecRoot(folder.uri.fsPath, rootPath, memberPaths, rootIsGitRepository)) {
      throw new CliError(
        `OpenSpec resolved an unrelated ancestor root at ${rootPath}. Initialize OpenSpec in this workspace or configure a project root.`,
        'openspec context'
      );
    }
    return path.resolve(rootPath);
  }

  private async listArchived(rootPath: string): Promise<ChangeSummary[]> {
    const archiveRoot = path.join(rootPath, 'openspec', 'changes', 'archive');
    try {
      const entries = await readdir(archiveRoot, { withFileTypes: true });
      const archived: ChangeSummary[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const archivePath = path.join(archiveRoot, entry.name);
        const tasks = await readTasksFile(path.join(archivePath, 'tasks.md'));
        const completedTasks = tasks.filter((task) => task.done).length;
        archived.push({
          id: `archive:${entry.name}`,
          name: entry.name,
          lifecycle: 'archived',
          completedTasks,
          totalTasks: tasks.length,
          progressPercent: progressPercent(completedTasks, tasks.length),
          planningComplete: true,
          archived: true,
          path: archivePath
        });
      }
      return archived.sort((left, right) => right.name.localeCompare(left.name));
    } catch {
      return [];
    }
  }

  private async listMainSpecs(
    rootPath: string,
    output: SpecListOutput
  ): Promise<MainSpecSummary[]> {
    const specRoot = path.join(rootPath, 'openspec', 'specs');
    const files = await findNamedFiles(specRoot, 'spec.md');
    const counts = new Map<string, number>();
    for (const raw of output.specs ?? []) {
      const name = stringField(raw, 'name') ?? stringField(raw, 'id');
      const requirementCount = numberField(raw, 'requirementCount') ?? numberField(raw, 'requirements');
      if (name && requirementCount !== undefined) {
        counts.set(name, requirementCount);
      }
    }

    const specs: MainSpecSummary[] = [];
    for (const file of files) {
      const capability = toPortableRelative(specRoot, path.dirname(file));
      const content = await readFile(file, 'utf8').catch(() => '');
      specs.push({
        id: capability,
        name: capability,
        path: file,
        requirementCount:
          counts.get(capability) ?? (content.match(/^### Requirement:/gm)?.length ?? 0)
      });
    }
    return specs.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async getArchivedDetail(
    summary: ChangeSummary,
    rootPath: string
  ): Promise<ChangeDetail> {
    const changeRoot = summary.path;
    if (!changeRoot || !isPathWithin(path.join(rootPath, 'openspec', 'changes', 'archive'), changeRoot)) {
      throw new Error('Archived change path is outside the selected OpenSpec archive.');
    }
    const files = await findAllFiles(changeRoot);
    const tasks = await readTasksFile(path.join(changeRoot, 'tasks.md'));
    const deltaPaths = files.filter(
      (file) => isPathWithin(path.join(changeRoot, 'specs'), file) && path.basename(file) === 'spec.md'
    );
    const artifacts = files
      .filter((file) => /(?:proposal|design|tasks)\.md$/i.test(file) || deltaPaths.includes(file))
      .map((file) => resourceFromPath(file, true));

    return {
      name: summary.name,
      archived: true,
      path: changeRoot,
      completedTasks: tasks.filter((task) => task.done).length,
      totalTasks: tasks.length,
      planningComplete: true,
      artifacts,
      tasks,
      deltas: await this.buildDeltas(rootPath, changeRoot, deltaPaths),
      canApply: false,
      canSync: false,
      canArchive: false,
      eligibilityNotes: {
        apply: 'Archived changes are read-only.',
        sync: 'Archived changes are read-only.',
        archive: 'This change is already archived.'
      }
    };
  }

  private buildArtifacts(
    artifactPaths: StatusOutput['artifactPaths'],
    readOnly: boolean
  ): ResourceItem[] {
    const resources: ResourceItem[] = [];
    for (const [artifactId, entry] of Object.entries(artifactPaths ?? {})) {
      for (const file of entry.existingOutputPaths ?? []) {
        resources.push({
          ...resourceFromPath(file, readOnly),
          kind: artifactKind(artifactId)
        });
      }
    }
    return resources;
  }

  private async buildDeltas(
    rootPath: string,
    changeRoot: string,
    deltaPaths: string[]
  ): Promise<DeltaItem[]> {
    const deltaRoot = path.join(changeRoot, 'specs');
    const deltas: DeltaItem[] = [];
    for (const deltaPath of deltaPaths) {
      if (!isPathWithin(deltaRoot, deltaPath)) {
        continue;
      }
      const capability = toPortableRelative(deltaRoot, path.dirname(deltaPath));
      const mainPath = path.join(rootPath, 'openspec', 'specs', ...capability.split('/'), 'spec.md');
      const mainExists = await exists(mainPath);
      deltas.push({
        id: deltaPath,
        capability,
        deltaPath,
        mainPath: mainExists ? mainPath : undefined,
        isNewCapability: !mainExists
      });
    }
    return deltas.sort((left, right) => left.capability.localeCompare(right.capability));
  }
}

function normalizeTasks(tasks: ApplyOutput['tasks']): TaskItem[] {
  return (tasks ?? []).map((task, index) => ({
    id: task.id ?? String(index + 1),
    description: task.description ?? `Task ${index + 1}`,
    done: Boolean(task.done)
  }));
}

async function readTasksFile(filePath: string): Promise<TaskItem[]> {
  try {
    const content = await readFile(filePath, 'utf8');
    return [...content.matchAll(/^- \[([ xX])\] (.+)$/gm)].map((match, index) => ({
      id: match[2]?.match(/^(\d+(?:\.\d+)*)/)?.[1] ?? String(index + 1),
      description: match[2] ?? `Task ${index + 1}`,
      done: /x/i.test(match[1] ?? '')
    }));
  } catch {
    return [];
  }
}

async function findNamedFiles(root: string, fileName: string): Promise<string[]> {
  const files = await findAllFiles(root);
  return files.filter((file) => path.basename(file).toLowerCase() === fileName.toLowerCase());
}

async function findAllFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          return findAllFiles(entryPath);
        }
        return entry.isFile() ? [entryPath] : [];
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

function resourceFromPath(filePath: string, readOnly: boolean): ResourceItem {
  const base = path.basename(filePath).toLowerCase();
  return {
    id: filePath,
    label: path.basename(filePath),
    path: filePath,
    kind: base === 'proposal.md' ? 'proposal' : base === 'design.md' ? 'design' : base === 'tasks.md' ? 'tasks' : base === 'spec.md' ? 'spec' : 'file',
    readOnly
  };
}

function artifactKind(value: string): ResourceItem['kind'] {
  if (value === 'proposal' || value === 'design' || value === 'tasks' || value === 'spec') {
    return value;
  }
  return value === 'specs' ? 'spec' : 'file';
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function count(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  return typeof value[key] === 'number' ? value[key] : undefined;
}
