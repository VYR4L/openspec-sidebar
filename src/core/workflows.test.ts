import { describe, expect, it } from 'vitest';
import { buildWorkflowPrompt, discoverProviderCommands } from './workflows';

describe('assistant workflow adapters', () => {
  it('builds workspace-scoped OpenSpec prompts', () => {
    expect(buildWorkflowPrompt('explore', 'C:\\project')).toBe('/opsx:explore\n\nWorkspace: C:\\project');
    expect(buildWorkflowPrompt('apply', 'C:\\project', 'add-dashboard')).toContain('/opsx:apply add-dashboard');
    expect(buildWorkflowPrompt('sync', '/project', 'add-dashboard')).toContain('Workspace: /project');
    expect(buildWorkflowPrompt('archive', '/project', 'add-dashboard')).toContain('/opsx:archive add-dashboard');
  });

  it('discovers provider commands conservatively and tolerates unavailable providers', () => {
    const commands = ['trae.openChat', 'trae.deleteEverything', 'codex.focusChat', 'workbench.action.chat.open'];
    expect(discoverProviderCommands('trae', commands)).toEqual(['trae.openChat']);
    expect(discoverProviderCommands('codex', commands)).toEqual(['codex.focusChat']);
    expect(discoverProviderCommands('universal', commands)).toEqual(['workbench.action.chat.open']);
    expect(discoverProviderCommands('trae', [])).toEqual([]);
  });
});
