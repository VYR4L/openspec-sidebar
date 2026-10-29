import * as vscode from 'vscode';
import { buildWorkflowPrompt, discoverProviderCommands } from '../core/workflows';
import type { WorkflowAction } from '../shared/protocol';

export interface AssistantDispatchResult {
  outcome: 'copied' | 'prefilled' | 'submitted';
  prompt: string;
  commandId?: string;
  discoveredCommands: string[];
}

export class AssistantService {
  async dispatch(
    action: WorkflowAction,
    workspacePath: string,
    changeName?: string
  ): Promise<AssistantDispatchResult> {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust this workspace before dispatching an assistant workflow.');
    }
    if (action !== 'explore' && !changeName) {
      throw new Error(`${action} requires a selected OpenSpec change.`);
    }

    const prompt = buildWorkflowPrompt(action, workspacePath, changeName);
    await vscode.env.clipboard.writeText(prompt);

    const configuration = vscode.workspace.getConfiguration('openspecWorkbench');
    const provider = configuration.get<string>('assistantProvider', 'universal');
    const configuredCommand = configuration.get<string>('assistantCommand', '').trim();
    const acceptsPrompt = configuration.get<boolean>('assistantCommandAcceptsPrompt', false);
    const availableCommands = await vscode.commands.getCommands(true);
    const discoveredCommands = discoverProviderCommands(provider, availableCommands);
    const commandId =
      configuredCommand && availableCommands.includes(configuredCommand)
        ? configuredCommand
        : provider === 'universal' && availableCommands.includes('workbench.action.chat.open')
          ? 'workbench.action.chat.open'
          : discoveredCommands[0];

    if (commandId) {
      if (acceptsPrompt && commandId === configuredCommand) {
        await vscode.commands.executeCommand(commandId, prompt);
        return { outcome: 'prefilled', prompt, commandId, discoveredCommands };
      }
      await vscode.commands.executeCommand(commandId);
    }
    return { outcome: 'copied', prompt, commandId, discoveredCommands };
  }
}
