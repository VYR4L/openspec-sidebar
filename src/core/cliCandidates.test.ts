import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as cliUtilities from './cliOutput';

describe('OpenSpec CLI candidate discovery', () => {
  it('runs the Windows npm package entrypoint without a shell when PATH omits the shim', () => {
    const candidateDiscovery = (
      cliUtilities as typeof cliUtilities & {
        globalNpmCommandCandidates?: (
          platform: NodeJS.Platform,
          environment: NodeJS.ProcessEnv,
          nodeExecutable: string
        ) => Array<{
          executable: string;
          argsPrefix: string[];
          displayName: string;
          shell: boolean;
        }>;
      }
    ).globalNpmCommandCandidates;

    expect(candidateDiscovery).toBeTypeOf('function');
    expect(candidateDiscovery?.('win32', {
      APPDATA: 'C:\\Users\\Jane Doe\\AppData\\Roaming',
      PATH: 'C:\\Windows\\System32'
    }, 'C:\\Program Files\\nodejs\\node.exe')).toEqual([{
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      argsPrefix: [path.win32.join(
        'C:\\Users\\Jane Doe\\AppData\\Roaming',
        'npm',
        'node_modules',
        '@fission-ai',
        'openspec',
        'bin',
        'openspec.js'
      )],
      displayName: path.win32.join(
        'C:\\Users\\Jane Doe\\AppData\\Roaming',
        'npm',
        'node_modules',
        '@fission-ai',
        'openspec',
        'bin',
        'openspec.js'
      ),
      shell: false
    }]);
  });

  it('prefers Node installations from PATH before Program Files fallbacks', () => {
    const pathDiscovery = (
      cliUtilities as typeof cliUtilities & {
        windowsNodeExecutablePaths?: (environment: NodeJS.ProcessEnv) => string[];
      }
    ).windowsNodeExecutablePaths;

    expect(pathDiscovery).toBeTypeOf('function');
    expect(pathDiscovery?.({
      PATH: 'D:\\portable-node;C:\\Windows\\System32',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)'
    })).toEqual([
      'D:\\portable-node\\node.exe',
      'C:\\Windows\\System32\\node.exe',
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe'
    ]);
  });
});
