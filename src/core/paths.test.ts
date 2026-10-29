import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPathWithin, isRelatedOpenSpecRoot, toPortableRelative } from './paths';

describe('workspace path boundaries', () => {
  const root = path.resolve('C:/work/project');
  const child = path.join(root, 'openspec', 'changes');

  it('accepts a path inside its root and rejects siblings', () => {
    expect(isPathWithin(root, child)).toBe(true);
    expect(isPathWithin(root, path.resolve('C:/work/other'))).toBe(false);
  });

  it('rejects a broad ancestor OpenSpec root unless it owns the workspace', () => {
    const workspace = path.resolve('C:/users/dev/Documents/project');
    const home = path.resolve('C:/users/dev');
    expect(isRelatedOpenSpecRoot(workspace, home, [], false)).toBe(false);
    expect(isRelatedOpenSpecRoot(workspace, home, [workspace], false)).toBe(true);
    expect(isRelatedOpenSpecRoot(workspace, home, [], true)).toBe(true);
  });

  it('creates portable capability paths', () => {
    expect(toPortableRelative(root, child)).toBe('openspec/changes');
  });
});
