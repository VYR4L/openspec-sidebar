export type LifecycleState = 'not-started' | 'partial' | 'completed' | 'archived';
export type DashboardTab = 'overview' | 'artifacts' | 'tasks' | 'files' | 'git';
export type WorkflowAction = 'explore' | 'apply' | 'sync' | 'archive';

export interface WorkspaceOption {
  id: string;
  name: string;
  path: string;
}

export interface ChangeSummary {
  id: string;
  name: string;
  lifecycle: LifecycleState;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  planningComplete: boolean;
  archived: boolean;
  lastModified?: string;
  path?: string;
}

export interface MainSpecSummary {
  id: string;
  name: string;
  path: string;
  requirementCount?: number;
}

export interface ResourceItem {
  id: string;
  label: string;
  path: string;
  kind: 'proposal' | 'design' | 'tasks' | 'spec' | 'file';
  readOnly?: boolean;
}

export interface TaskItem {
  id: string;
  description: string;
  done: boolean;
}

export interface DeltaItem {
  id: string;
  capability: string;
  deltaPath: string;
  mainPath?: string;
  isNewCapability: boolean;
}

export interface ChangeDetail {
  name: string;
  archived: boolean;
  path: string;
  completedTasks: number;
  totalTasks: number;
  planningComplete: boolean;
  artifacts: ResourceItem[];
  tasks: TaskItem[];
  deltas: DeltaItem[];
  canApply: boolean;
  canSync: boolean;
  canArchive: boolean;
  eligibilityNotes: Partial<Record<WorkflowAction, string>>;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  loaded?: boolean;
  children?: FileNode[];
}

export type GitFileGroup = 'working' | 'staged' | 'conflict';

export interface GitFile {
  id: string;
  path: string;
  uri: string;
  status: string;
  group: GitFileGroup;
  outsideSelectedChange: boolean;
}

export interface GitRepositorySummary {
  id: string;
  name: string;
  path: string;
}

export interface GitSnapshot {
  available: boolean;
  message?: string;
  repositories: GitRepositorySummary[];
  selectedRepositoryId?: string;
  branch?: string;
  working: GitFile[];
  staged: GitFile[];
  conflicts: GitFile[];
  indexFingerprint: string;
  suggestedMessage: string;
  requiresMixedAcknowledgement: boolean;
}

export interface DashboardSnapshot {
  version: number;
  generatedAt: string;
  trusted: boolean;
  workspaces: WorkspaceOption[];
  selectedWorkspaceId?: string;
  selectedChangeName?: string;
  selectedTab?: DashboardTab;
  rootPath?: string;
  stale: boolean;
  error?: string;
  changes: ChangeSummary[];
  mainSpecs: MainSpecSummary[];
  supportRoots: FileNode[];
  git: GitSnapshot;
}

export interface OperationNotice {
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
}

export type HostToWebviewMessage =
  | { type: 'snapshot'; snapshot: DashboardSnapshot }
  | { type: 'detail'; detail?: ChangeDetail }
  | { type: 'directory'; parentPath: string; children: FileNode[] }
  | { type: 'busy'; key: string; active: boolean }
  | { type: 'notice'; notice: OperationNotice };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'selectWorkspace'; workspaceId: string }
  | { type: 'selectChange'; changeName?: string }
  | { type: 'selectTab'; tab: DashboardTab }
  | { type: 'selectRepository'; repositoryId: string }
  | { type: 'loadDirectory'; path: string }
  | { type: 'openFile'; path: string }
  | { type: 'openDiff'; deltaPath: string; mainPath: string; title: string }
  | { type: 'workflow'; action: WorkflowAction; changeName?: string }
  | { type: 'directArchive'; changeName: string }
  | { type: 'stage'; repositoryId: string; uris: string[] }
  | { type: 'unstage'; repositoryId: string; uris: string[] }
  | {
      type: 'commit';
      repositoryId: string;
      message: string;
      expectedFingerprint: string;
      acknowledgeMixed: boolean;
    };

const allowedTypes = new Set([
  'ready',
  'refresh',
  'selectWorkspace',
  'selectChange',
  'selectTab',
  'selectRepository',
  'loadDirectory',
  'openFile',
  'openDiff',
  'workflow',
  'directArchive',
  'stage',
  'unstage',
  'commit'
]);

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !allowedTypes.has(value.type)) {
    return false;
  }

  switch (value.type) {
    case 'ready':
    case 'refresh':
      return true;
    case 'selectWorkspace':
      return isNonEmptyString(value.workspaceId);
    case 'selectChange':
      return value.changeName === undefined || isSafeChangeName(value.changeName);
    case 'selectTab':
      return ['overview', 'artifacts', 'tasks', 'files', 'git'].includes(String(value.tab));
    case 'selectRepository':
      return isNonEmptyString(value.repositoryId);
    case 'loadDirectory':
    case 'openFile':
      return isNonEmptyString(value.path);
    case 'openDiff':
      return (
        isNonEmptyString(value.deltaPath) &&
        isNonEmptyString(value.mainPath) &&
        isNonEmptyString(value.title)
      );
    case 'workflow':
      return (
        ['explore', 'apply', 'sync', 'archive'].includes(String(value.action)) &&
        (value.changeName === undefined || isSafeChangeName(value.changeName))
      );
    case 'directArchive':
      return isSafeChangeName(value.changeName);
    case 'stage':
    case 'unstage':
      return isNonEmptyString(value.repositoryId) && isStringArray(value.uris);
    case 'commit':
      return (
        isNonEmptyString(value.repositoryId) &&
        isNonEmptyString(value.message) &&
        isNonEmptyString(value.expectedFingerprint) &&
        typeof value.acknowledgeMixed === 'boolean'
      );
    default:
      return false;
  }
}

export function isSafeChangeName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
