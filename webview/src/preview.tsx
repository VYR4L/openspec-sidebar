import React from 'react';
import { createRoot } from 'react-dom/client';
import type { ChangeDetail, DashboardSnapshot, WebviewToHostMessage } from '../../src/shared/protocol';
import './styles.css';

const previewVariables = {
  '--vscode-foreground': '#cccccc',
  '--vscode-editor-background': '#1e1e1e',
  '--vscode-sideBar-background': '#181818',
  '--vscode-button-background': '#6c5ce7',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#7d6fec',
  '--vscode-button-secondaryBackground': '#313131',
  '--vscode-button-secondaryForeground': '#cccccc',
  '--vscode-button-secondaryHoverBackground': '#3c3c3c',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-focusBorder': '#8f83ff',
  '--vscode-input-background': '#252526',
  '--vscode-input-foreground': '#cccccc',
  '--vscode-input-border': '#454545',
  '--vscode-textLink-foreground': '#75beff',
  '--vscode-textLink-activeForeground': '#9cdcfe',
  '--vscode-charts-purple': '#b180d7',
  '--vscode-editorWarning-foreground': '#cca700',
  '--vscode-errorForeground': '#f48771',
  '--vscode-testing-iconPassed': '#73c991',
  '--vscode-badge-background': '#4d4d4d',
  '--vscode-badge-foreground': '#ffffff',
  '--vscode-font-family': 'Segoe UI, sans-serif',
  '--vscode-font-size': '13px'
};
for (const [name, value] of Object.entries(previewVariables)) {
  document.documentElement.style.setProperty(name, value);
}

const api = {
  postMessage(message: WebviewToHostMessage) {
    if (message.type === 'selectChange') send({ type: 'detail', detail });
  },
  getState: () => undefined,
  setState: () => undefined
};
(globalThis as typeof globalThis & { acquireVsCodeApi: () => typeof api }).acquireVsCodeApi = () => api;

const { App } = await import('./App');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

const snapshot: DashboardSnapshot = {
  version: 1,
  generatedAt: new Date().toISOString(),
  trusted: true,
  workspaces: [{ id: 'demo', name: 'Demo project', path: 'C:\\projects\\demo' }],
  selectedWorkspaceId: 'demo',
  selectedChangeName: 'add-openspec-workbench-dashboard',
  selectedTab: 'overview',
  rootPath: 'C:\\projects\\demo',
  stale: false,
  changes: [
    change('design-auth', 'not-started', 0, 8),
    change('add-openspec-workbench-dashboard', 'partial', 24, 37),
    change('fix-callback-date-range', 'completed', 12, 12),
    { ...change('2026-09-18-old-dashboard', 'archived', 6, 6), archived: true }
  ],
  mainSpecs: [
    { id: 'workbench-dashboard', name: 'workbench-dashboard', path: 'C:\\projects\\demo\\openspec\\specs\\workbench-dashboard\\spec.md', requirementCount: 17 },
    { id: 'git-review', name: 'git-review', path: 'C:\\projects\\demo\\openspec\\specs\\git-review\\spec.md', requirementCount: 8 }
  ],
  supportRoots: [{ id: 'openspec', name: 'openspec', path: 'C:\\projects\\demo\\openspec', type: 'directory', loaded: false }],
  git: {
    available: true,
    repositories: [{ id: 'repo', name: 'demo', path: 'C:\\projects\\demo' }],
    selectedRepositoryId: 'repo',
    branch: 'feature/workbench',
    working: [], staged: [], conflicts: [], indexFingerprint: 'preview',
    suggestedMessage: 'docs: update add-openspec-workbench-dashboard', requiresMixedAcknowledgement: false
  }
};

const detail: ChangeDetail = {
  name: 'add-openspec-workbench-dashboard', archived: false,
  path: 'C:\\projects\\demo\\openspec\\changes\\add-openspec-workbench-dashboard',
  completedTasks: 24, totalTasks: 37, planningComplete: true,
  artifacts: [
    { id: 'proposal', label: 'proposal.md', path: 'proposal.md', kind: 'proposal' },
    { id: 'design', label: 'design.md', path: 'design.md', kind: 'design' },
    { id: 'tasks', label: 'tasks.md', path: 'tasks.md', kind: 'tasks' }
  ],
  tasks: [],
  deltas: [
    { id: 'dashboard', capability: 'workbench-dashboard', deltaPath: 'delta.md', mainPath: 'main.md', isNewCapability: false },
    { id: 'git', capability: 'git-review', deltaPath: 'git.md', isNewCapability: true }
  ],
  canApply: true, canSync: true, canArchive: false,
  eligibilityNotes: { archive: 'Complete every task before direct archive.' }
};

setTimeout(() => {
  send({ type: 'snapshot', snapshot });
  send({ type: 'detail', detail });
}, 20);

function change(name: string, lifecycle: DashboardSnapshot['changes'][number]['lifecycle'], complete: number, total: number) {
  return { id: name, name, lifecycle, completedTasks: complete, totalTasks: total, progressPercent: total ? Math.round(complete / total * 100) : 0, planningComplete: true, archived: false };
}

function send(message: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
}
