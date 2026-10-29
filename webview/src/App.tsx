import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type {
  ChangeDetail,
  ChangeSummary,
  DashboardSnapshot,
  DashboardTab,
  FileNode,
  GitFile,
  HostToWebviewMessage,
  OperationNotice,
  WebviewToHostMessage,
  WorkflowAction
} from '../../src/shared/protocol';
import { vscodeApi } from './vscode';

const lifecycleMeta = {
  'not-started': { label: 'Not started', glyph: '○' },
  partial: { label: 'In progress', glyph: '◐' },
  completed: { label: 'Completed', glyph: '●' },
  archived: { label: 'Archived', glyph: '◌' }
} as const;

export function App(): ReactElement {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>();
  const [detail, setDetail] = useState<ChangeDetail>();
  const [selectedChange, setSelectedChange] = useState<string>();
  const [tab, setTabState] = useState<DashboardTab>('overview');
  const [filter, setFilter] = useState('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [notice, setNotice] = useState<OperationNotice>();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [workingSelection, setWorkingSelection] = useState<Set<string>>(new Set());
  const [stagedSelection, setStagedSelection] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [acknowledgeMixed, setAcknowledgeMixed] = useState(false);
  const previousSuggestion = useRef('');
  const previousFingerprint = useRef('');

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'snapshot':
          setSnapshot(message.snapshot);
          setFiles((current) => mergeRootNodes(current, message.snapshot.supportRoots));
          setSelectedChange(message.snapshot.selectedChangeName);
          setTabState(message.snapshot.selectedTab ?? 'overview');
          setCommitMessage((current) =>
            current.length === 0 || current === previousSuggestion.current
              ? message.snapshot.git.suggestedMessage
              : current
          );
          previousSuggestion.current = message.snapshot.git.suggestedMessage;
          if (previousFingerprint.current !== message.snapshot.git.indexFingerprint) {
            previousFingerprint.current = message.snapshot.git.indexFingerprint;
            setAcknowledgeMixed(false);
            setStagedSelection(new Set());
          }
          setWorkingSelection(new Set());
          break;
        case 'detail':
          setDetail(message.detail);
          break;
        case 'directory':
          setFiles((current) => mergeDirectoryChildren(current, message.parentPath, message.children));
          break;
        case 'busy':
          setBusy((current) => {
            const next = new Set(current);
            if (message.active) next.add(message.key);
            else next.delete(message.key);
            return next;
          });
          break;
        case 'notice':
          setNotice(message.notice);
          break;
      }
    };
    window.addEventListener('message', handler);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const visibleChanges = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (snapshot?.changes ?? []).filter(
      (change) => !needle || change.name.toLowerCase().includes(needle)
    );
  }, [filter, snapshot?.changes]);

  const selectChange = (change: ChangeSummary) => {
    setSelectedChange(change.name);
    setDetail(undefined);
    selectTab('overview');
    post({ type: 'selectChange', changeName: change.name });
  };

  const selectTab = (nextTab: DashboardTab) => {
    setTabState(nextTab);
    post({ type: 'selectTab', tab: nextTab });
  };

  if (!snapshot) {
    return <LoadingState />;
  }

  const groups = (['not-started', 'partial', 'completed', 'archived'] as const).map((lifecycle) => ({
    lifecycle,
    changes: visibleChanges.filter((change) => change.lifecycle === lifecycle)
  }));
  const activeChange = snapshot.changes.find((change) => change.name === selectedChange);
  const anyBusy = busy.size > 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">◎</div>
          <div>
            <h1>OpenSpec Workbench</h1>
            <p>{snapshot.rootPath ?? 'No OpenSpec root resolved'}</p>
          </div>
        </div>
        <div className="toolbar" aria-label="Dashboard actions">
          {snapshot.workspaces.length > 1 && (
            <label className="select-label">
              <span>Workspace</span>
              <select
                value={snapshot.selectedWorkspaceId}
                onChange={(event) => post({ type: 'selectWorkspace', workspaceId: event.target.value })}
              >
                {snapshot.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
          )}
          <button className="button ghost" onClick={() => post({ type: 'refresh' })} disabled={anyBusy}>
            ↻ Refresh
          </button>
          <button
            className="button primary"
            onClick={() => post({ type: 'workflow', action: 'explore' })}
            disabled={!snapshot.trusted || anyBusy}
            title={!snapshot.trusted ? 'Trust this workspace to dispatch workflows' : undefined}
          >
            ✦ Explore
          </button>
        </div>
      </header>

      {!snapshot.trusted && (
        <Banner level="warning" message="This workspace is untrusted. Inspection remains available, but workflows and Git mutations are disabled." />
      )}
      {snapshot.error && (
        <Banner
          level="error"
          message={snapshot.stale ? `Showing stale data: ${snapshot.error}` : snapshot.error}
          actionLabel="Retry"
          onAction={() => post({ type: 'refresh' })}
        />
      )}
      {notice && (
        <Banner
          level={notice.level}
          message={notice.message}
          detail={notice.detail}
          onDismiss={() => setNotice(undefined)}
        />
      )}

      <section className="metrics" aria-label="OpenSpec summary">
        {groups.map(({ lifecycle, changes }) => (
          <div key={lifecycle} className={`metric metric-${lifecycle}`}>
            <span className="metric-glyph" aria-hidden="true">{lifecycleMeta[lifecycle].glyph}</span>
            <strong>{changes.length}</strong>
            <span>{lifecycleMeta[lifecycle].label}</span>
          </div>
        ))}
        <div className="metric metric-specs">
          <span className="metric-glyph" aria-hidden="true">◆</span>
          <strong>{snapshot.mainSpecs.length}</strong>
          <span>Main specs</span>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="rail">
          <label className="search-box">
            <span className="sr-only">Filter changes</span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter changes…"
            />
          </label>
          <section className="rail-section">
            <h2>Main specs</h2>
            {snapshot.mainSpecs.length === 0 ? (
              <p className="muted">No main specs yet.</p>
            ) : (
              <ul className="plain-list">
                {snapshot.mainSpecs.map((spec) => (
                  <li key={spec.id}>
                    <button className="link-button" onClick={() => post({ type: 'openFile', path: spec.path })}>
                      <span>◇</span> {spec.name}
                      {spec.requirementCount !== undefined && <small>{spec.requirementCount}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="main-content">
          {snapshot.workspaces.length === 0 ? (
            <EmptyState title="Open a workspace" description="Open a project folder to discover OpenSpec changes." />
          ) : !snapshot.rootPath && !snapshot.stale ? (
            <EmptyState title="No OpenSpec project" description="Initialize OpenSpec in this workspace or configure the CLI command." />
          ) : (
            <>
              <section className="change-board" aria-label="OpenSpec changes">
                {groups.map(({ lifecycle, changes }) => (
                  <LifecycleColumn
                    key={lifecycle}
                    lifecycle={lifecycle}
                    changes={changes}
                    selected={selectedChange}
                    onSelect={selectChange}
                  />
                ))}
              </section>

              <section className="detail-panel" aria-label="Selected change details">
                {!activeChange ? (
                  <EmptyState title="Select a change" description="Choose a change card to inspect artifacts, tasks, deltas, files, and Git state." compact />
                ) : !detail ? (
                  <div className="detail-loading" role="status">Loading {activeChange.name}…</div>
                ) : (
                  <ChangeWorkspace
                    snapshot={snapshot}
                    detail={detail}
                    tab={tab}
                    setTab={selectTab}
                    files={files}
                    anyBusy={anyBusy}
                    workingSelection={workingSelection}
                    setWorkingSelection={setWorkingSelection}
                    stagedSelection={stagedSelection}
                    setStagedSelection={setStagedSelection}
                    commitMessage={commitMessage}
                    setCommitMessage={setCommitMessage}
                    acknowledgeMixed={acknowledgeMixed}
                    setAcknowledgeMixed={setAcknowledgeMixed}
                  />
                )}
              </section>
            </>
          )}
        </main>
      </div>
      <div className="sr-only" aria-live="polite">{notice?.message}</div>
    </div>
  );
}

function LifecycleColumn({
  lifecycle,
  changes,
  selected,
  onSelect
}: {
  lifecycle: ChangeSummary['lifecycle'];
  changes: ChangeSummary[];
  selected?: string;
  onSelect(change: ChangeSummary): void;
}): ReactElement {
  const meta = lifecycleMeta[lifecycle];
  return (
    <section className={`lifecycle-column lifecycle-${lifecycle}`}>
      <h2><span aria-hidden="true">{meta.glyph}</span> {meta.label}<small>{changes.length}</small></h2>
      <div className="card-stack">
        {changes.length === 0 ? (
          <p className="column-empty">Nothing here</p>
        ) : changes.map((change) => (
          <button
            key={change.id}
            className={`change-card ${selected === change.name ? 'selected' : ''}`}
            onClick={() => onSelect(change)}
            aria-pressed={selected === change.name}
          >
            <strong>{change.name}</strong>
            <span className="change-meta">
              {change.totalTasks > 0
                ? `${change.completedTasks}/${change.totalTasks} tasks`
                : change.planningComplete ? 'No tasks' : 'Planning'}
              <span>{change.progressPercent}%</span>
            </span>
            <span className="progress-track" aria-label={`${change.progressPercent}% complete`}>
              <span style={{ width: `${change.progressPercent}%` }} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface ChangeWorkspaceProps {
  snapshot: DashboardSnapshot;
  detail: ChangeDetail;
  tab: DashboardTab;
  setTab(tab: DashboardTab): void;
  files: FileNode[];
  anyBusy: boolean;
  workingSelection: Set<string>;
  setWorkingSelection(value: Set<string>): void;
  stagedSelection: Set<string>;
  setStagedSelection(value: Set<string>): void;
  commitMessage: string;
  setCommitMessage(value: string): void;
  acknowledgeMixed: boolean;
  setAcknowledgeMixed(value: boolean): void;
}

function ChangeWorkspace(props: ChangeWorkspaceProps): ReactElement {
  const { snapshot, detail, tab, setTab, anyBusy } = props;
  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'tasks', label: `Tasks ${detail.completedTasks}/${detail.totalTasks}` },
    { id: 'files', label: 'Files' },
    { id: 'git', label: 'Git' }
  ];
  return (
    <>
      <div className="detail-header">
        <div>
          <span className="eyebrow">{detail.archived ? 'Archived change' : 'Active change'}</span>
          <h2>{detail.name}</h2>
        </div>
        {!detail.archived && (
          <div className="action-row">
            <ActionButton action="apply" disabled={!snapshot.trusted || !detail.canApply || anyBusy} note={detail.eligibilityNotes.apply} changeName={detail.name} />
            <ActionButton action="sync" disabled={!snapshot.trusted || !detail.canSync || anyBusy} note={detail.eligibilityNotes.sync} changeName={detail.name} />
            <ActionButton action="archive" disabled={!snapshot.trusted || anyBusy} changeName={detail.name} />
            <button
              className="button danger ghost"
              disabled={!snapshot.trusted || !detail.canArchive || anyBusy}
              title={detail.eligibilityNotes.archive ?? 'Archive directly with the OpenSpec CLI'}
              onClick={() => post({ type: 'directArchive', changeName: detail.name })}
            >
              CLI archive
            </button>
          </div>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Change sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="tab-content" role="tabpanel">
        {tab === 'overview' && <Overview detail={detail} />}
        {tab === 'artifacts' && <Artifacts detail={detail} />}
        {tab === 'tasks' && <Tasks detail={detail} />}
        {tab === 'files' && <FileBrowser roots={props.files} />}
        {tab === 'git' && <GitWorkspace {...props} />}
      </div>
    </>
  );
}

function ActionButton({ action, disabled, note, changeName }: { action: WorkflowAction; disabled: boolean; note?: string; changeName: string }): ReactElement {
  return (
    <button
      className="button ghost"
      disabled={disabled}
      title={note}
      onClick={() => post({ type: 'workflow', action, changeName })}
    >
      {action[0]?.toUpperCase()}{action.slice(1)}
    </button>
  );
}

function Overview({ detail }: { detail: ChangeDetail }): ReactElement {
  const percent = detail.totalTasks ? Math.round((detail.completedTasks / detail.totalTasks) * 100) : 0;
  return (
    <div className="overview-grid">
      <section className="surface progress-surface">
        <span className="eyebrow">Implementation progress</span>
        <div className="progress-number">{percent}<small>%</small></div>
        <div className="progress-track large"><span style={{ width: `${percent}%` }} /></div>
        <p>{detail.completedTasks} of {detail.totalTasks} tasks complete</p>
      </section>
      <section className="surface">
        <span className="eyebrow">Planning</span>
        <h3>{detail.planningComplete ? 'Ready' : 'Incomplete'}</h3>
        <p>{detail.artifacts.length} artifacts · {detail.deltas.length} delta specs</p>
      </section>
      <section className="surface delta-surface">
        <div className="section-heading"><div><span className="eyebrow">Specification impact</span><h3>Delta ↔ Main</h3></div></div>
        {detail.deltas.length === 0 ? <p className="muted">No delta specs.</p> : (
          <ul className="delta-list">
            {detail.deltas.map((delta) => (
              <li key={delta.id}>
                <div><strong>{delta.capability}</strong><span>{delta.isNewCapability ? 'New capability' : 'Modifies main spec'}</span></div>
                <div className="inline-actions">
                  <button className="link-button" onClick={() => post({ type: 'openFile', path: delta.deltaPath })}>Open delta</button>
                  {delta.mainPath && (
                    <button className="button compact" onClick={() => post({ type: 'openDiff', deltaPath: delta.deltaPath, mainPath: delta.mainPath!, title: `${delta.capability}: Main ↔ Delta` })}>Compare</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Artifacts({ detail }: { detail: ChangeDetail }): ReactElement {
  return detail.artifacts.length === 0 ? <p className="muted">No artifacts found.</p> : (
    <div className="resource-grid">
      {detail.artifacts.map((artifact) => (
        <button key={artifact.id} className="resource-card" onClick={() => post({ type: 'openFile', path: artifact.path })}>
          <span className="resource-icon" aria-hidden="true">{artifact.kind === 'spec' ? '◇' : '▤'}</span>
          <span><strong>{artifact.label}</strong><small>{artifact.kind}{artifact.readOnly ? ' · read-only' : ''}</small></span>
        </button>
      ))}
    </div>
  );
}

function Tasks({ detail }: { detail: ChangeDetail }): ReactElement {
  return detail.tasks.length === 0 ? <p className="muted">No tasks found.</p> : (
    <ol className="task-list">
      {detail.tasks.map((task) => (
        <li key={task.id} className={task.done ? 'done' : ''}>
          <span className="task-check" aria-label={task.done ? 'Complete' : 'Pending'}>{task.done ? '✓' : '○'}</span>
          <span>{task.description}</span>
        </li>
      ))}
    </ol>
  );
}

function FileBrowser({ roots }: { roots: FileNode[] }): ReactElement {
  if (roots.length === 0) return <p className="muted">No configured support folders were found.</p>;
  return <ul className="file-tree">{roots.map((node) => <FileEntry key={node.id} node={node} />)}</ul>;
}

function FileEntry({ node }: { node: FileNode }): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const activate = () => {
    if (node.type === 'file') {
      post({ type: 'openFile', path: node.path });
      return;
    }
    const next = !expanded;
    setExpanded(next);
    if (next && !node.loaded) post({ type: 'loadDirectory', path: node.path });
  };
  return (
    <li>
      <button className="file-entry" onClick={activate} aria-expanded={node.type === 'directory' ? expanded : undefined}>
        <span aria-hidden="true">{node.type === 'directory' ? (expanded ? '▾' : '▸') : '·'}</span>
        <span>{node.name}</span>
      </button>
      {expanded && node.type === 'directory' && (
        node.children?.length ? <ul>{node.children.map((child) => <FileEntry key={child.id} node={child} />)}</ul> : <p className="tree-empty">Empty folder</p>
      )}
    </li>
  );
}

function GitWorkspace(props: ChangeWorkspaceProps): ReactElement {
  const git = props.snapshot.git;
  const toggle = (current: Set<string>, value: string, setter: (value: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  if (!git.available && git.repositories.length === 0) {
    return <EmptyState title="Git unavailable" description={git.message ?? 'No repository found.'} compact />;
  }
  if (!git.selectedRepositoryId) {
    return (
      <section className="surface">
        <h3>Select a repository</h3>
        <select defaultValue="" onChange={(event) => post({ type: 'selectRepository', repositoryId: event.target.value })}>
          <option value="" disabled>Choose repository…</option>
          {git.repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name}</option>)}
        </select>
      </section>
    );
  }

  const canCommit =
    props.snapshot.trusted &&
    git.staged.length > 0 &&
    git.conflicts.length === 0 &&
    props.commitMessage.trim().length > 0 &&
    (!git.requiresMixedAcknowledgement || props.acknowledgeMixed) &&
    !props.anyBusy;

  return (
    <div className="git-grid">
      <section className="surface git-status">
        <div className="section-heading">
          <div><span className="eyebrow">Repository</span><h3>{git.branch ?? 'Detached HEAD'}</h3></div>
          {git.repositories.length > 1 && (
            <select value={git.selectedRepositoryId} onChange={(event) => post({ type: 'selectRepository', repositoryId: event.target.value })}>
              {git.repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name}</option>)}
            </select>
          )}
        </div>
        {git.conflicts.length > 0 && <Banner level="error" message={`${git.conflicts.length} conflict(s) must be resolved in Source Control.`} />}
        <GitFileSection
          title={`Changes (${git.working.length})`}
          files={git.working}
          selection={props.workingSelection}
          onToggle={(uri) => toggle(props.workingSelection, uri, props.setWorkingSelection)}
        />
        <button
          className="button compact"
          disabled={!props.snapshot.trusted || props.workingSelection.size === 0 || props.anyBusy}
          onClick={() => post({ type: 'stage', repositoryId: git.selectedRepositoryId!, uris: [...props.workingSelection] })}
        >
          Stage selected
        </button>
        <GitFileSection
          title={`Staged (${git.staged.length})`}
          files={git.staged}
          selection={props.stagedSelection}
          onToggle={(uri) => toggle(props.stagedSelection, uri, props.setStagedSelection)}
        />
        <button
          className="button compact"
          disabled={!props.snapshot.trusted || props.stagedSelection.size === 0 || props.anyBusy}
          onClick={() => post({ type: 'unstage', repositoryId: git.selectedRepositoryId!, uris: [...props.stagedSelection] })}
        >
          Unstage selected
        </button>
      </section>
      <section className="surface commit-surface">
        <span className="eyebrow">Commit reviewed index</span>
        <h3>{git.staged.length} staged file{git.staged.length === 1 ? '' : 's'}</h3>
        <label>
          <span>Commit message</span>
          <textarea rows={3} value={props.commitMessage} onChange={(event) => props.setCommitMessage(event.target.value)} placeholder="docs: update change-name" />
        </label>
        {git.requiresMixedAcknowledgement && (
          <label className="acknowledgement">
            <input type="checkbox" checked={props.acknowledgeMixed} onChange={(event) => props.setAcknowledgeMixed(event.target.checked)} />
            <span>I reviewed staged files outside this OpenSpec change.</span>
          </label>
        )}
        <button
          className="button primary full"
          disabled={!canCommit}
          onClick={() => post({
            type: 'commit',
            repositoryId: git.selectedRepositoryId!,
            message: props.commitMessage,
            expectedFingerprint: git.indexFingerprint,
            acknowledgeMixed: props.acknowledgeMixed
          })}
        >
          Commit staged files
        </button>
        <p className="fine-print">The commit always contains the complete staged set shown here. Nothing is staged automatically.</p>
      </section>
    </div>
  );
}

function GitFileSection({ title, files, selection, onToggle }: { title: string; files: GitFile[]; selection: Set<string>; onToggle(uri: string): void }): ReactElement {
  return (
    <div className="git-file-section">
      <h4>{title}</h4>
      {files.length === 0 ? <p className="muted">None</p> : (
        <ul>
          {files.map((file) => (
            <li key={file.id} className={file.outsideSelectedChange ? 'mixed' : ''}>
              <label>
                <input type="checkbox" checked={selection.has(file.uri)} onChange={() => onToggle(file.uri)} />
                <span className="file-path">{file.path}</span>
                <small>{file.status}{file.outsideSelectedChange ? ' · outside change' : ''}</small>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Banner({ level, message, detail, actionLabel, onAction, onDismiss }: { level: OperationNotice['level']; message: string; detail?: string; actionLabel?: string; onAction?: () => void; onDismiss?: () => void }): ReactElement {
  return (
    <div className={`banner banner-${level}`} role={level === 'error' ? 'alert' : 'status'}>
      <div><strong>{message}</strong>{detail && <details><summary>Details</summary><pre>{detail}</pre></details>}</div>
      <div className="inline-actions">
        {onAction && <button className="link-button" onClick={onAction}>{actionLabel}</button>}
        {onDismiss && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss">×</button>}
      </div>
    </div>
  );
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }): ReactElement {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}><span aria-hidden="true">◎</span><h2>{title}</h2><p>{description}</p></div>;
}

function LoadingState(): ReactElement {
  return <div className="loading-state" role="status"><div className="loader" /><h1>Opening OpenSpec Workbench</h1><p>Resolving project state…</p></div>;
}

function mergeRootNodes(current: FileNode[], roots: FileNode[]): FileNode[] {
  return roots.map((root) => current.find((candidate) => candidate.path === root.path) ?? root);
}

function mergeDirectoryChildren(nodes: FileNode[], parentPath: string, children: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.path === parentPath) return { ...node, loaded: true, children };
    if (!node.children) return node;
    return { ...node, children: mergeDirectoryChildren(node.children, parentPath, children) };
  });
}

function post(message: WebviewToHostMessage): void {
  vscodeApi().postMessage(message);
}
