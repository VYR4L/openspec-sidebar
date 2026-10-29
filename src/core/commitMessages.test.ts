import { describe, expect, it } from 'vitest';
import type { GitFile } from '../shared/protocol';
import { suggestCommitMessage } from './commitMessages';

const change = 'add-dashboard';

describe('OpenSpec commit message suggestions', () => {
  it('suggests add and update for active change artifacts', () => {
    expect(suggestCommitMessage([file(`openspec/changes/${change}/proposal.md`, 'Index added')], change)).toBe(`docs: add ${change}`);
    expect(suggestCommitMessage([file(`openspec/changes/${change}/tasks.md`, 'Index modified')], change)).toBe(`docs: update ${change}`);
  });

  it('prioritizes archive and sync lifecycle transitions', () => {
    expect(suggestCommitMessage([file(`openspec/changes/archive/2026-10-06-${change}/tasks.md`, 'Index added')], change)).toBe(`docs: archive ${change}`);
    expect(suggestCommitMessage([file('openspec/specs/dashboard/spec.md', 'Index modified')], change)).toBe(`docs: sync ${change}`);
  });

  it('does not invent a message for unrelated staged files', () => {
    expect(suggestCommitMessage([file('src/app.ts', 'Index modified')], change)).toBe('');
  });
});

function file(filePath: string, status: string): GitFile {
  return {
    id: filePath,
    path: filePath,
    uri: `file:///${filePath}`,
    status,
    group: 'staged',
    outsideSelectedChange: false
  };
}
