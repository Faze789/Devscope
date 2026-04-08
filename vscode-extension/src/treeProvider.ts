/**
 * Tree data providers for the DepScope sidebar views.
 */
import * as vscode from 'vscode';
import type { AnalysisResult, DependencyInfo, CVEInfo } from './api';

// ---------------------------------------------------------------------------
// Overview tree (repo summary)
// ---------------------------------------------------------------------------
export class OverviewProvider implements vscode.TreeDataProvider<OverviewItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private result: AnalysisResult | null = null;

  setResult(result: AnalysisResult | null) {
    this.result = result;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: OverviewItem) { return el; }

  getChildren(): OverviewItem[] {
    if (!this.result) {
      return [new OverviewItem('No analysis yet', 'Run "DepScope: Analyze Repository"', 'info')];
    }
    const r = this.result.repository;
    const cveCount = this.result.cves.length;
    const inPathCount = this.result.cves.filter(c => c.inUsagePath).length;
    const ecosystems = r.ecosystems?.join(', ') || r.ecosystem || 'unknown';

    return [
      new OverviewItem(`${r.owner}/${r.name}`, `Branch: ${r.branch}`, 'repo'),
      new OverviewItem(`Health: ${healthGrade(r.healthScore)} (${r.healthScore})`, scoreDescription(r.healthScore), 'health'),
      new OverviewItem(`Ecosystems: ${ecosystems}`, `${r.dependencyCount} dependencies`, 'package'),
      new OverviewItem(`Files analyzed: ${r.fileCount}`, '', 'files'),
      new OverviewItem(
        `CVEs: ${cveCount}${inPathCount > 0 ? ` (${inPathCount} in usage path)` : ''}`,
        cveCount === 0 ? 'No known vulnerabilities' : `${inPathCount} reachable via your imports`,
        cveCount > 0 ? 'warning' : 'pass',
      ),
      new OverviewItem(`Suggestions: ${this.result.suggestions.length}`, '', 'lightbulb'),
    ];
  }
}

class OverviewItem extends vscode.TreeItem {
  constructor(label: string, description: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(
      icon === 'repo' ? 'github' :
      icon === 'health' ? 'heart' :
      icon === 'package' ? 'package' :
      icon === 'files' ? 'file-code' :
      icon === 'warning' ? 'warning' :
      icon === 'pass' ? 'pass' :
      icon === 'lightbulb' ? 'lightbulb' :
      'info',
    );
  }
}

// ---------------------------------------------------------------------------
// Dependencies tree
// ---------------------------------------------------------------------------
export class DependencyProvider implements vscode.TreeDataProvider<DependencyNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private deps: DependencyInfo[] = [];

  setDependencies(deps: DependencyInfo[]) {
    this.deps = deps;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: DependencyNode) { return el; }

  getChildren(el?: DependencyNode): DependencyNode[] {
    if (!el) {
      if (this.deps.length === 0) {
        return [new DependencyNode('No dependencies found', '', 0, 0, false, [])];
      }
      // Group: production then dev
      const prod = this.deps.filter(d => !d.isDev).sort((a, b) => a.healthScore - b.healthScore);
      const dev = this.deps.filter(d => d.isDev).sort((a, b) => a.healthScore - b.healthScore);
      return [
        ...prod.map(d => this.depToNode(d)),
        ...dev.map(d => this.depToNode(d)),
      ];
    }
    return el.details;
  }

  private depToNode(d: DependencyInfo): DependencyNode {
    const details: DependencyNode[] = [];
    details.push(new DependencyNode(`Usage: ${Math.round(d.usageRatio * 100)}%`, `${d.usedExports.length}/${d.totalExports} exports used`, 0, 0, false, []));
    if (d.ecosystem) details.push(new DependencyNode(`Ecosystem: ${d.ecosystem}`, '', 0, 0, false, []));
    if (d.cves.length > 0) {
      details.push(new DependencyNode(`CVEs: ${d.cves.length}`, d.cves.map(c => c.id).join(', '), 0, 0, false, []));
    }
    for (const exp of d.usedExports.slice(0, 10)) {
      details.push(new DependencyNode(`  ${exp.name}`, exp.kind, 0, 0, false, []));
    }

    return new DependencyNode(
      `${d.name}@${d.version}`,
      `${healthGrade(d.healthScore)} ${d.isDev ? '(dev)' : ''}`,
      d.healthScore,
      d.cves.length,
      details.length > 0,
      details,
    );
  }
}

class DependencyNode extends vscode.TreeItem {
  details: DependencyNode[];

  constructor(
    label: string,
    description: string,
    healthScore: number,
    cveCount: number,
    hasChildren: boolean,
    details: DependencyNode[],
  ) {
    super(label, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.details = details;

    if (cveCount > 0) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    } else if (healthScore >= 80) {
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else if (healthScore >= 50) {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    } else if (healthScore > 0) {
      this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('problemsErrorIcon.foreground'));
    }
  }
}

// ---------------------------------------------------------------------------
// CVE tree
// ---------------------------------------------------------------------------
export class CVEProvider implements vscode.TreeDataProvider<CVENode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private cves: (CVEInfo & { packageName?: string })[] = [];

  setCVEs(cves: CVEInfo[], deps: DependencyInfo[]) {
    this.cves = [];
    for (const dep of deps) {
      for (const cve of dep.cves) {
        this.cves.push({ ...cve, packageName: dep.name });
      }
    }
    // Sort: in-path first, then by severity
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
    this.cves.sort((a, b) => {
      if (a.inUsagePath !== b.inUsagePath) return a.inUsagePath ? -1 : 1;
      return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
    });
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: CVENode) { return el; }

  getChildren(el?: CVENode): CVENode[] {
    if (el) return el.children;
    if (this.cves.length === 0) {
      return [new CVENode('No vulnerabilities found', '', 'pass', [])];
    }
    return this.cves.map(cve => {
      const children: CVENode[] = [
        new CVENode(cve.summary || 'No summary', '', 'info', []),
        new CVENode(`Package: ${cve.packageName}`, '', 'package', []),
        new CVENode(`Score: ${cve.cvssScore}`, cve.severity, 'graph', []),
        new CVENode(
          cve.inUsagePath ? 'IN YOUR USAGE PATH' : 'Not in usage path',
          cve.inUsagePath ? 'Your code calls affected functions' : 'May not affect your code',
          cve.inUsagePath ? 'error' : 'info',
          [],
        ),
      ];
      if (cve.fixedVersion) {
        children.push(new CVENode(`Fix: upgrade to ${cve.fixedVersion}`, '', 'arrow-up', []));
      }
      const icon = cve.inUsagePath ? 'error' :
                   cve.severity === 'CRITICAL' || cve.severity === 'HIGH' ? 'warning' : 'info';
      return new CVENode(
        `${cve.id} [${cve.severity}]`,
        cve.packageName || '',
        icon,
        children,
      );
    });
  }
}

class CVENode extends vscode.TreeItem {
  children: CVENode[];
  constructor(label: string, description: string, icon: string, children: CVENode[]) {
    super(label, children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.children = children;
    this.iconPath = new vscode.ThemeIcon(
      icon === 'error' ? 'error' :
      icon === 'warning' ? 'warning' :
      icon === 'pass' ? 'pass' :
      icon === 'package' ? 'package' :
      icon === 'graph' ? 'graph' :
      icon === 'arrow-up' ? 'arrow-up' :
      'info',
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function healthGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function scoreDescription(score: number): string {
  if (score >= 90) return 'Excellent dependency health';
  if (score >= 80) return 'Good — minor improvements possible';
  if (score >= 70) return 'Fair — some unused or vulnerable deps';
  if (score >= 60) return 'Needs attention';
  return 'Poor — significant issues detected';
}
