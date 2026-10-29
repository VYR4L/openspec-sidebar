import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue: unknown) => defaultValue
    })
  }
}));

import { CliRunner } from './cliRunner';

const originalAppData = process.env.APPDATA;
const originalPrefix = process.env.NPM_CONFIG_PREFIX;
const originalPath = process.env.PATH;
const originalProgramFiles = process.env.ProgramFiles;
const createdDirectories: string[] = [];

afterEach(async () => {
  restoreEnvironment('APPDATA', originalAppData);
  restoreEnvironment('NPM_CONFIG_PREFIX', originalPrefix);
  restoreEnvironment('PATH', originalPath);
  restoreEnvironment('ProgramFiles', originalProgramFiles);
  await Promise.all(createdDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('CliRunner resolution', () => {
  it('executes the installed global npm package before any npx fallback', async () => {
    const appData = await mkdtemp(path.join(os.tmpdir(), 'OpenSpec resolver with spaces '));
    createdDirectories.push(appData);
    const entrypoint = path.join(
      appData,
      'npm',
      'node_modules',
      '@fission-ai',
      'openspec',
      'bin',
      'openspec.js'
    );
    await mkdir(path.dirname(entrypoint), { recursive: true });
    await writeFile(
      entrypoint,
      [
        "if (process.argv[2] === '--version') {",
        "  process.stdout.write('test-version');",
        '} else {',
        "  process.stdout.write(JSON.stringify({ source: 'global-npm', args: process.argv.slice(2) }));",
        '}'
      ].join('\n'),
      'utf8'
    );
    process.env.APPDATA = appData;
    delete process.env.NPM_CONFIG_PREFIX;
    process.env.PATH = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
    process.env.ProgramFiles = originalProgramFiles;

    const result = await new CliRunner().runJson<{ source: string; args: string[] }>(
      ['list', '--json'],
      appData,
      { timeoutMs: 3_000 }
    );

    expect(result).toEqual({ source: 'global-npm', args: ['list', '--json'] });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
