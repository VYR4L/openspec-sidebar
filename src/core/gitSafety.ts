import { createHash } from 'node:crypto';
import type { GitFile } from '../shared/protocol';

export function isOutsideSelectedChange(relativePath: string, changeName: string | undefined): boolean {
  if (!changeName) {
    return true;
  }
  const normalized = `/${relativePath.replaceAll('\\', '/')}`;
  return !(
    normalized.startsWith(`/openspec/changes/${changeName}/`) ||
    (normalized.startsWith('/openspec/changes/archive/') && normalized.includes(changeName)) ||
    normalized.startsWith('/openspec/specs/')
  );
}

export function fingerprint(files: GitFile[]): string {
  return createHash('sha256')
    .update(files.map((file) => `${file.uri}:${file.status}`).sort().join('\n'))
    .digest('hex');
}

export function selectAllowedValues<T>(requested: string[], allowed: Map<string, T>): T[] {
  return [...new Set(requested)]
    .map((value) => allowed.get(value))
    .filter((value): value is T => value !== undefined);
}
