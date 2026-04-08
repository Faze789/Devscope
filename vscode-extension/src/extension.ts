/**
 * DepScope VS Code Extension
 *
 * Provides usage-level dependency intelligence directly in the editor:
 * - Sidebar with dependency tree, CVEs, and health overview
 * - Inline diagnostics in manifest files (CVE warnings)
 * - CodeLens above imports showing CVE/usage info
 * - Status bar with repo health score
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { analyzeRepo, parseGitRemote, type AnalysisResult } from './api';
import { OverviewProvider, DependencyProvider, CVEProvider } from './treeProvider';
import { DiagnosticsManager } from './diagnostics';

let statusBarItem: vscode.StatusBarItem;
let currentResult: AnalysisResult | null = null;

export function activate(context: vscode.ExtensionContext) {
  // Tree providers
  const overviewProvider = new OverviewProvider();
  const dependencyProvider = new DependencyProvider();
  const cveProvider = new CVEProvider();
  const diagnosticsManager = new DiagnosticsManager();

  vscode.window.registerTreeDataProvider('depscopeOverview', overviewProvider);
  vscode.window.registerTreeDataProvider('depscopeDependencies', dependencyProvider);
  vscode.window.registerTreeDataProvider('depscopeCVEs', cveProvider);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = 'depscope.analyze';
  statusBarItem.text = '$(shield) DepScope';
  statusBarItem.tooltip = 'Click to analyze repository dependencies';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Shared analysis logic
  async function runAnalysis(owner: string, repo: string) {
    const config = vscode.workspace.getConfiguration('depscope');
    const apiUrl = config.get<string>('apiUrl', 'https://depscope-lyart.vercel.app');
    const token = config.get<string>('githubToken', '') || undefined;

    statusBarItem.text = '$(loading~spin) Analyzing...';

    try {
      const result = await analyzeRepo(owner, repo, apiUrl, token);
      currentResult = result;

      // Update all views
      overviewProvider.setResult(result);
      dependencyProvider.setDependencies(result.dependencies);
      cveProvider.setCVEs(result.cves, result.dependencies);
      diagnosticsManager.setResult(result);

      // Update status bar
      const grade = healthGrade(result.repository.healthScore);
      const cveCount = result.cves.length;
      const inPath = result.cves.filter(c => c.inUsagePath).length;
      statusBarItem.text = `$(shield) ${grade} ${result.repository.healthScore}`;
      statusBarItem.tooltip = `DepScope: ${owner}/${repo}\n` +
        `Health: ${grade} (${result.repository.healthScore}/100)\n` +
        `Dependencies: ${result.repository.dependencyCount}\n` +
        `CVEs: ${cveCount}${inPath > 0 ? ` (${inPath} in usage path!)` : ''}\n` +
        `Ecosystems: ${result.repository.ecosystems?.join(', ') || result.repository.ecosystem}`;

      if (cveCount > 0) {
        statusBarItem.backgroundColor = inPath > 0
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.backgroundColor = undefined;
      }

      // Show summary notification
      const eco = result.repository.ecosystems?.join(', ') || result.repository.ecosystem;
      vscode.window.showInformationMessage(
        `DepScope: ${owner}/${repo} — ${result.repository.dependencyCount} deps, ` +
        `${cveCount} CVEs, health ${result.repository.healthScore}/100 [${eco}]`,
      );

      // Store result for later use
      context.workspaceState.update('depscope.lastResult', {
        owner, repo, timestamp: Date.now(),
      });

    } catch (error: any) {
      statusBarItem.text = '$(shield) DepScope';
      statusBarItem.backgroundColor = undefined;
      vscode.window.showErrorMessage(`DepScope: ${error.message}`);
    }
  }

  // Command: Analyze current workspace repo
  const analyzeCmd = vscode.commands.registerCommand('depscope.analyze', async () => {
    const remote = await detectGitRemote();
    if (!remote) {
      // Fallback to manual input
      vscode.commands.executeCommand('depscope.analyzeCustom');
      return;
    }
    await runAnalysis(remote.owner, remote.repo);
  });

  // Command: Analyze any repo by URL
  const analyzeCustomCmd = vscode.commands.registerCommand('depscope.analyzeCustom', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter GitHub repository (owner/repo or full URL)',
      placeHolder: 'facebook/react',
      validateInput: (value) => {
        if (!value) return 'Required';
        const match = value.match(/(?:github\.com[/:])?([^/]+)\/([^/.]+)/);
        return match ? null : 'Enter owner/repo or a GitHub URL';
      },
    });
    if (!input) return;

    const parsed = parseGitRemote(input) ?? (() => {
      const parts = input.split('/');
      if (parts.length >= 2) return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
      return null;
    })();

    if (!parsed) {
      vscode.window.showErrorMessage('Invalid repository format');
      return;
    }

    await runAnalysis(parsed.owner, parsed.repo);
  });

  // Command: Refresh
  const refreshCmd = vscode.commands.registerCommand('depscope.refresh', async () => {
    if (currentResult) {
      await runAnalysis(currentResult.repository.owner, currentResult.repository.name);
    } else {
      vscode.commands.executeCommand('depscope.analyze');
    }
  });

  context.subscriptions.push(analyzeCmd, analyzeCustomCmd, refreshCmd, diagnosticsManager);

  // Auto-analyze on open if configured
  const config = vscode.workspace.getConfiguration('depscope');
  if (config.get<boolean>('analyzeOnOpen', false)) {
    detectGitRemote().then(remote => {
      if (remote) runAnalysis(remote.owner, remote.repo);
    });
  }
}

async function detectGitRemote(): Promise<{ owner: string; repo: string } | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  return new Promise((resolve) => {
    cp.exec(
      'git remote get-url origin',
      { cwd: workspaceFolders[0].uri.fsPath },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        resolve(parseGitRemote(stdout.trim()));
      },
    );
  });
}

function healthGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function deactivate() {
  statusBarItem?.dispose();
}
