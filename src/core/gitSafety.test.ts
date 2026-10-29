import { describe, expect, it } from 'vitest';
import type { GitFile } from '../shared/protocol';
import { fingerprint, isOutsideSelectedChange, selectAllowedValues } from './gitSafety';

describe('Git safety boundaries', () => {
  it('keeps unrelated staged work visible as mixed scope', () => {
    expect(isOutsideSelectedChange('src/app.ts', 'add-dashboard')).toBe(true);
    expect(isOutsideSelectedChange('openspec/changes/add-dashboard/tasks.md', 'add-dashboard')).toBe(false);
    expect(isOutsideSelectedChange('openspec/specs/dashboard/spec.md', 'add-dashboard')).toBe(false);
  });

  it('invalidates review when any staged file or status changes', () => {
    const first = [file('a', 'Index added')];
    const second = [file('a', 'Index modified')];
    expect(fingerprint(first)).not.toBe(fingerprint(second));
    expect(fingerprint(first)).not.toBe(fingerprint([...first, file('b', 'Index added')]));
  });

  it('returns only explicitly selected current paths', () => {
    const allowed = new Map([['file:///a', 'A'], ['file:///b', 'B']]);
    expect(selectAllowedValues(['file:///b', 'file:///b', 'file:///missing'], allowed)).toEqual(['B']);
  });
});

function file(uri: string, status: string): GitFile {
  return { id: uri, path: uri, uri, status, group: 'staged', outsideSelectedChange: false };
}
