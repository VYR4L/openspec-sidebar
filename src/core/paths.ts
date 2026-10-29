import path from 'node:path';

export function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isPathWithin(parent: string, candidate: string): boolean {
  const root = normalizedPath(parent);
  const child = normalizedPath(candidate);
  const relative = path.relative(root, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isRelatedOpenSpecRoot(
  workspacePath: string,
  rootPath: string,
  memberPaths: string[],
  rootIsGitRepository: boolean
): boolean {
  if (normalizedPath(workspacePath) === normalizedPath(rootPath)) {
    return true;
  }
  if (isPathWithin(workspacePath, rootPath)) {
    return true;
  }
  if (!isPathWithin(rootPath, workspacePath)) {
    return false;
  }
  return rootIsGitRepository || memberPaths.some((member) => isPathWithin(member, workspacePath));
}

export function toPortableRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}
