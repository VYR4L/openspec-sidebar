import type { WorkflowAction } from '../shared/protocol';

export function buildWorkflowPrompt(
  action: WorkflowAction,
  workspacePath: string,
  changeName?: string
): string {
  const invocation = action === 'explore' ? '/opsx:explore' : `/opsx:${action} ${changeName}`;
  return `${invocation}\n\nWorkspace: ${workspacePath}`;
}

export function discoverProviderCommands(provider: string, commands: string[]): string[] {
  if (provider === 'universal') {
    return commands.filter((command) => command === 'workbench.action.chat.open');
  }
  const expression = provider === 'trae' ? /trae/i : /(?:codex|chatgpt|openai)/i;
  return commands
    .filter((command) => expression.test(command) && /(?:chat|open|focus)/i.test(command))
    .sort();
}
