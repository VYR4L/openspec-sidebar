export function parseJsonText<T>(output: string): T {
  const clean = stripAnsi(output).trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    const starts = [...clean.matchAll(/(?:\{|\[)/g)].map((match) => match.index ?? -1);
    for (const start of starts) {
      if (start < 0) continue;
      try {
        return JSON.parse(clean.slice(start)) as T;
      } catch {
        // Try the next JSON boundary.
      }
    }
    throw new Error('OpenSpec returned invalid JSON.');
  }
}

export function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, 'g'), '');
}
import path from 'node:path';


export interface CliCommandCandidate {
  executable: string;
  argsPrefix: string[];
  displayName: string;
  shell: boolean;
}

export function globalNpmCommandCandidates(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  nodeExecutable: string
): CliCommandCandidate[] {
  const prefixes = new Set<string>();
  if (environment.NPM_CONFIG_PREFIX) {
    prefixes.add(environment.NPM_CONFIG_PREFIX);
  }
  if (platform === 'win32' && environment.APPDATA) {
    prefixes.add(path.win32.join(environment.APPDATA, 'npm'));
  }

  return [...prefixes].map((prefix) => {
    const entrypoint = platform === 'win32'
      ? path.win32.join(
          prefix,
          'node_modules',
          '@fission-ai',
          'openspec',
          'bin',
          'openspec.js'
        )
      : path.posix.join(
          prefix,
          'lib',
          'node_modules',
          '@fission-ai',
          'openspec',
          'bin',
          'openspec.js'
        );
    return {
      executable: nodeExecutable,
      argsPrefix: [entrypoint],
      displayName: entrypoint,
      shell: false
    };
  });
}

export function windowsNodeExecutablePaths(environment: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  const pathValue = environment.PATH ?? environment.Path ?? environment.path;
  for (const directory of pathValue?.split(path.win32.delimiter) ?? []) {
    const clean = directory.trim().replace(/^"|"$/g, '');
    if (clean) {
      candidates.push(path.win32.join(clean, 'node.exe'));
    }
  }
  for (const programFiles of [environment.ProgramFiles, environment['ProgramFiles(x86)']]) {
    if (programFiles) {
      candidates.push(path.win32.join(programFiles, 'nodejs', 'node.exe'));
    }
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
