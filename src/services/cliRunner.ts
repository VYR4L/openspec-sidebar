import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  globalNpmCommandCandidates,
  parseJsonText,
  stripAnsi,
  windowsNodeExecutablePaths
} from '../core/cliOutput';

export interface CommandSpec {
  executable: string;
  argsPrefix: string[];
  displayName: string;
  shell: boolean;
}

export interface RunOptions {
  timeoutMs?: number;
  onOutput?: (chunk: string) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  command: string;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly stdout = '',
    readonly stderr = ''
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class CliRunner {
  private readonly resolved = new Map<string, CommandSpec>();
  private readonly failedAt = new Map<string, number>();

  async run(args: string[], cwd: string, options: RunOptions = {}): Promise<RunResult> {
    const command = await this.resolve(cwd);
    return this.execute(command, args, cwd, options);
  }

  async runJson<T>(args: string[], cwd: string, options: RunOptions = {}): Promise<T> {
    const result = await this.run(args, cwd, options);
    try {
      return parseJsonText<T>(result.stdout);
    } catch {
      throw new CliError('OpenSpec returned invalid JSON.', result.command, result.stdout, result.stderr);
    }
  }

  clearCache(): void {
    this.resolved.clear();
    this.failedAt.clear();
  }

  private async resolve(cwd: string): Promise<CommandSpec> {
    const key = path.resolve(cwd);
    const cached = this.resolved.get(key);
    if (cached) {
      return cached;
    }

    const failed = this.failedAt.get(key);
    if (failed && Date.now() - failed < 30_000) {
      throw new CliError(
        'OpenSpec CLI resolution recently failed. Configure openspecWorkbench.cliCommand or retry shortly.',
        'openspec'
      );
    }

    const configured = vscode.workspace
      .getConfiguration('openspecWorkbench')
      .get<string>('cliCommand', '')
      .trim();
    const candidates: CommandSpec[] = [];
    const nodeExecutables = await resolveNodeExecutables();

    if (configured) {
      const [executable, ...argsPrefix] = splitCommand(configured);
      if (executable) {
        if (needsShell(executable)) {
          const packageEntrypoint = npmEntrypointBesideShim(executable, cwd);
          if (!(await fileExists(packageEntrypoint))) {
            throw new CliError(
              'Configured .cmd/.bat launchers are not executed through a shell. Configure node with the OpenSpec bin/openspec.js entrypoint instead.',
              configured
            );
          }
          for (const nodeExecutable of nodeExecutables) {
            candidates.push({
              executable: nodeExecutable,
              argsPrefix: [packageEntrypoint, ...argsPrefix],
              displayName: packageEntrypoint,
              shell: false
            });
          }
        } else {
          candidates.push({
            executable,
            argsPrefix,
            displayName: configured,
            shell: false
          });
        }
      }
    }

    const localEntrypoint = path.join(
      cwd,
      'node_modules',
      '@fission-ai',
      'openspec',
      'bin',
      'openspec.js'
    );
    if (await fileExists(localEntrypoint)) {
      for (const nodeExecutable of nodeExecutables) {
        candidates.push({
          executable: nodeExecutable,
          argsPrefix: [localEntrypoint],
          displayName: localEntrypoint,
          shell: false
        });
      }
    }

    for (const nodeExecutable of nodeExecutables) {
      for (const globalCandidate of globalNpmCommandCandidates(
        process.platform,
        process.env,
        nodeExecutable
      )) {
        if (await fileExists(globalCandidate.argsPrefix[0] ?? '')) {
          candidates.push(globalCandidate);
        }
      }
    }

    if (process.platform === 'win32') {
      candidates.push({
        executable: 'openspec.exe',
        argsPrefix: [],
        displayName: 'openspec.exe',
        shell: false
      });
    } else {
      candidates.push({
        executable: 'openspec',
        argsPrefix: [],
        displayName: 'openspec',
        shell: false
      });
    }

    for (const nodeExecutable of nodeExecutables) {
      const systemNode = await windowsSystemNpxCandidate(nodeExecutable);
      if (systemNode) {
        candidates.push(systemNode);
      }
    }

    if (process.platform !== 'win32') {
      candidates.push({
        executable: 'npx',
        argsPrefix: ['--yes', '@fission-ai/openspec'],
        displayName: 'npx --yes @fission-ai/openspec',
        shell: false
      });
    }

    for (const candidate of candidates) {
      try {
        await this.execute(candidate, ['--version'], cwd, { timeoutMs: 12_000 });
        this.resolved.set(key, candidate);
        return candidate;
      } catch {
        // Continue through deterministic fallbacks.
      }
    }

    this.failedAt.set(key, Date.now());
    throw new CliError(
      'OpenSpec CLI was not found. Install @fission-ai/openspec or configure openspecWorkbench.cliCommand.',
      'openspec'
    );
  }

  private execute(
    command: CommandSpec,
    args: string[],
    cwd: string,
    options: RunOptions
  ): Promise<RunResult> {
    const allArgs = [...command.argsPrefix, ...args];
    const display = [command.displayName, ...args].join(' ');
    const timeoutMs = options.timeoutMs ?? 30_000;

    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, allArgs, {
        cwd,
        shell: command.shell,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          child.kill();
          settled = true;
          reject(new CliError(`OpenSpec command timed out after ${timeoutMs}ms.`, display, stdout, stderr));
        }
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        const text = String(chunk);
        stdout += text;
        options.onOutput?.(text);
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        const text = String(chunk);
        stderr += text;
        options.onOutput?.(text);
      });
      child.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new CliError(error.message, display, stdout, stderr));
        }
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), command: display });
        } else {
          reject(
            new CliError(
              `OpenSpec command exited with code ${code ?? 'unknown'}.`,
              display,
              stripAnsi(stdout),
              stripAnsi(stderr)
            )
          );
        }
      });
    });
  }
}

function splitCommand(command: string): string[] {
  const result: string[] = [];
  const expression = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  for (const match of command.matchAll(expression)) {
    result.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return result.filter(Boolean);
}

function needsShell(executable: string): boolean {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
}

function npmEntrypointBesideShim(executable: string, cwd: string): string {
  const resolved = path.isAbsolute(executable) ? executable : path.resolve(cwd, executable);
  return path.join(
    path.dirname(resolved),
    'node_modules',
    '@fission-ai',
    'openspec',
    'bin',
    'openspec.js'
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveNodeExecutables(): Promise<string[]> {
  if (process.platform !== 'win32') {
    return ['node'];
  }
  const found: string[] = [];
  for (const node of windowsNodeExecutablePaths(process.env)) {
    if (await fileExists(node)) {
      found.push(node);
    }
  }
  return found.length > 0 ? found : ['node.exe'];
}

async function windowsSystemNpxCandidate(
  nodeExecutable: string
): Promise<CommandSpec | undefined> {
  if (process.platform !== 'win32' || !path.isAbsolute(nodeExecutable)) {
    return undefined;
  }
  const npxCli = path.join(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!(await fileExists(npxCli))) {
    return undefined;
  }
  return {
    executable: nodeExecutable,
    argsPrefix: [npxCli, '--yes', '@fission-ai/openspec'],
    displayName: 'npx --yes @fission-ai/openspec',
    shell: false
  };
}
