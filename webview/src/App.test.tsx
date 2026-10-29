import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot } from '../../src/shared/protocol';
import { App } from './App';

describe('OpenSpec dashboard', () => {
  it('requests state on mount and renders lifecycle semantics from a snapshot', async () => {
    render(<App />);
    expect((globalThis as typeof globalThis & { __postedMessages: unknown[] }).__postedMessages).toContainEqual({ type: 'ready' });

    const snapshot: DashboardSnapshot = {
      version: 1,
      generatedAt: new Date(0).toISOString(),
      trusted: true,
      workspaces: [{ id: 'workspace', name: 'Project', path: '/project' }],
      selectedWorkspaceId: 'workspace',
      rootPath: '/project',
      stale: false,
      changes: [
        {
          id: 'add-dashboard',
          name: 'add-dashboard',
          lifecycle: 'partial',
          completedTasks: 2,
          totalTasks: 4,
          progressPercent: 50,
          planningComplete: true,
          archived: false
        }
      ],
      mainSpecs: [{ id: 'dashboard', name: 'dashboard', path: '/project/openspec/specs/dashboard/spec.md', requirementCount: 3 }],
      supportRoots: [],
      git: {
        available: false,
        repositories: [],
        working: [],
        staged: [],
        conflicts: [],
        indexFingerprint: '',
        suggestedMessage: '',
        requiresMixedAcknowledgement: false
      }
    };

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'snapshot', snapshot } }));
    });

    expect(screen.getByRole('heading', { name: 'OpenSpec Workbench' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add-dashboard/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('In progress')).toHaveLength(2);
  });

  it('shows trust limitations with textual feedback', async () => {
    render(<App />);
    const snapshot: DashboardSnapshot = {
      version: 1,
      generatedAt: new Date(0).toISOString(),
      trusted: false,
      workspaces: [],
      stale: false,
      changes: [],
      mainSpecs: [],
      supportRoots: [],
      git: {
        available: false,
        repositories: [],
        working: [],
        staged: [],
        conflicts: [],
        indexFingerprint: '',
        suggestedMessage: '',
        requiresMixedAcknowledgement: false
      }
    };
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'snapshot', snapshot } }));
    });
    expect(screen.getByText(/workspace is untrusted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore/i })).toBeDisabled();
  });
});
