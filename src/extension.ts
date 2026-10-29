import * as vscode from 'vscode';
import { DashboardPanel, dashboardViewType, type DashboardServices } from './dashboardPanel';
import { AssistantService } from './services/assistantService';
import { CliRunner } from './services/cliRunner';
import { GitService } from './services/gitService';
import { OpenSpecService } from './services/openSpecService';
import { WorkspaceService } from './services/workspaceService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspace = new WorkspaceService();
  const cli = new CliRunner();
  const openspec = new OpenSpecService(cli);
  const git = new GitService();
  const assistant = new AssistantService();
  const output = vscode.window.createOutputChannel('OpenSpec Workbench');
  let gitRefreshTimer: NodeJS.Timeout | undefined;

  const services: DashboardServices = { workspace, openspec, git, assistant, output };
  const openDashboard = () => DashboardPanel.open(context.extensionUri, context, services);

  context.subscriptions.push(
    workspace,
    git,
    output,
    vscode.commands.registerCommand('openspecWorkbench.openDashboard', openDashboard),
    vscode.commands.registerCommand('openspecWorkbench.refreshDashboard', async () => {
      if (!DashboardPanel.current) {
        openDashboard();
      }
      await DashboardPanel.refreshCurrent();
    }),
    vscode.commands.registerCommand('openspecWorkbench.openSettings', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:local.openspec-sidebar-local'
      );
    }),
    vscode.window.registerWebviewPanelSerializer(dashboardViewType, {
      async deserializeWebviewPanel(panel) {
        DashboardPanel.restore(panel, context.extensionUri, context, services);
      }
    }),
    workspace.onDidChange(() => {
      void DashboardPanel.refreshCurrent();
    }),
    git.onDidChange(() => {
      if (gitRefreshTimer) {
        clearTimeout(gitRefreshTimer);
      }
      gitRefreshTimer = setTimeout(() => {
        gitRefreshTimer = undefined;
        void DashboardPanel.refreshCurrent();
      }, 500);
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      void DashboardPanel.refreshCurrent();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('openspecWorkbench.cliCommand')) {
        openspec.clearCliCache();
      }
    })
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 25);
  status.name = 'OpenSpec Workbench';
  status.text = '$(database) OpenSpec';
  status.tooltip = 'Open the OpenSpec Workbench dashboard';
  status.command = 'openspecWorkbench.openDashboard';
  status.show();
  context.subscriptions.push(status);

  // Git initialization must not delay command/serializer registration.
  git
    .initialize()
    .then(() => DashboardPanel.refreshCurrent())
    .catch((error: unknown) => {
      output.appendLine(`Git initialization failed: ${String(error)}`);
    });
}

export function deactivate(): void {}
