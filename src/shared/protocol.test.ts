import { describe, expect, it } from 'vitest';
import { isWebviewToHostMessage } from './protocol';

describe('Webview message validation', () => {
  it('accepts allowlisted messages with validated values', () => {
    expect(isWebviewToHostMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewToHostMessage({ type: 'workflow', action: 'apply', changeName: 'add-dashboard' })).toBe(true);
    expect(isWebviewToHostMessage({ type: 'stage', repositoryId: 'repo', uris: ['file:///a'] })).toBe(true);
  });

  it('rejects unknown messages and unsafe change identifiers', () => {
    expect(isWebviewToHostMessage({ type: 'executeShell', command: 'rm -rf .' })).toBe(false);
    expect(isWebviewToHostMessage({ type: 'directArchive', changeName: '../other' })).toBe(false);
    expect(isWebviewToHostMessage({ type: 'stage', repositoryId: 'repo', uris: [12] })).toBe(false);
  });
});
