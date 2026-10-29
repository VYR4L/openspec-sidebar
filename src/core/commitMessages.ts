import type { GitFile } from '../shared/protocol';

export interface CommitTemplates {
  add: string;
  update: string;
  sync: string;
  archive: string;
}

export const defaultCommitTemplates: CommitTemplates = {
  add: 'docs: add {change}',
  update: 'docs: update {change}',
  sync: 'docs: sync {change}',
  archive: 'docs: archive {change}'
};

export function suggestCommitMessage(
  files: GitFile[],
  changeName: string | undefined,
  templates: CommitTemplates = defaultCommitTemplates
): string {
  if (!changeName || files.length === 0) {
    return '';
  }

  const normalized = files.map((file) => `/${file.path.replaceAll('\\', '/').replace(/^\/+/, '')}`);
  const archiveNeedle = `/openspec/changes/archive/`;
  const activeNeedle = `/openspec/changes/${changeName}/`;

  if (
    normalized.some(
      (filePath) => filePath.includes(archiveNeedle) && filePath.includes(changeName)
    )
  ) {
    return fillTemplate(templates.archive, changeName);
  }

  if (normalized.some((filePath) => filePath.includes('/openspec/specs/'))) {
    return fillTemplate(templates.sync, changeName);
  }

  const activeFiles = files.filter((file) =>
    `/${file.path.replaceAll('\\', '/').replace(/^\/+/, '')}`.includes(activeNeedle)
  );
  if (activeFiles.length === 0) {
    return '';
  }

  const onlyAdded = activeFiles.every((file) => /added|untracked/i.test(file.status));
  return fillTemplate(onlyAdded ? templates.add : templates.update, changeName);
}

export function fillTemplate(template: string, changeName: string): string {
  return template.replaceAll('{change}', changeName);
}
