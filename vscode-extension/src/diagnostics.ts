/**
 * Diagnostics provider — shows CVE warnings inline in manifest files
 * and CodeLens above imports that reference vulnerable packages.
 */
import * as vscode from 'vscode';
import type { AnalysisResult, DependencyInfo, CVEInfo } from './api';

const MANIFEST_FILES = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile',
  'pubspec.yaml', 'Gemfile', 'composer.json', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'go.mod', 'Cargo.toml',
  'Package.swift', 'Podfile',
];

export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;
  private result: AnalysisResult | null = null;
  private codeLensProviderDisposable: vscode.Disposable | null = null;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('depscope');
  }

  setResult(result: AnalysisResult | null) {
    this.result = result;
    this.collection.clear();
    if (result) {
      this.updateDiagnostics();
      this.registerCodeLens();
    }
  }

  private updateDiagnostics() {
    if (!this.result) return;

    // Find manifest files in workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      for (const manifest of MANIFEST_FILES) {
        const uri = vscode.Uri.joinPath(folder.uri, manifest);
        this.addManifestDiagnostics(uri);
      }
      // Also check for .csproj files
      vscode.workspace.findFiles('*.csproj', null, 5).then(files => {
        for (const file of files) {
          this.addManifestDiagnostics(file);
        }
      });
    }
  }

  private async addManifestDiagnostics(uri: vscode.Uri) {
    if (!this.result) return;

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      const diagnostics: vscode.Diagnostic[] = [];

      for (const dep of this.result.dependencies) {
        if (dep.cves.length === 0 && dep.healthScore >= 70) continue;

        // Find the dependency name in the manifest text
        const nameIdx = text.indexOf(dep.name);
        if (nameIdx === -1) continue;

        const pos = doc.positionAt(nameIdx);
        const endPos = doc.positionAt(nameIdx + dep.name.length);
        const range = new vscode.Range(pos, endPos);

        // CVE diagnostics
        for (const cve of dep.cves) {
          const severity = cve.inUsagePath
            ? vscode.DiagnosticSeverity.Error
            : cve.severity === 'CRITICAL' || cve.severity === 'HIGH'
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Information;

          const msg = cve.inUsagePath
            ? `[DepScope] ${cve.id} (${cve.severity}) — IN YOUR USAGE PATH: ${cve.summary}`
            : `[DepScope] ${cve.id} (${cve.severity}): ${cve.summary}`;

          const diag = new vscode.Diagnostic(range, msg, severity);
          diag.code = cve.id;
          diag.source = 'DepScope';
          if (cve.fixedVersion) {
            diag.message += ` — Fix: upgrade to ${cve.fixedVersion}`;
          }
          diagnostics.push(diag);
        }

        // Low usage warning (only for non-dev deps with > 0 size)
        if (!dep.isDev && dep.usageRatio < 0.05 && dep.packageSize > 50000) {
          const diag = new vscode.Diagnostic(
            range,
            `[DepScope] Only ${Math.round(dep.usageRatio * 100)}% of ${dep.name} is used. Consider tree-shaking or a lighter alternative.`,
            vscode.DiagnosticSeverity.Information,
          );
          diag.source = 'DepScope';
          diagnostics.push(diag);
        }
      }

      if (diagnostics.length > 0) {
        this.collection.set(uri, diagnostics);
      }
    } catch {
      // File doesn't exist — skip
    }
  }

  private registerCodeLens() {
    if (this.codeLensProviderDisposable) {
      this.codeLensProviderDisposable.dispose();
    }
    if (!this.result) return;

    const result = this.result;
    const provider: vscode.CodeLensProvider = {
      provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const text = doc.getText();
        const lines = text.split('\n');

        // Build a quick lookup of vulnerable/notable packages
        const notable = new Map<string, DependencyInfo>();
        for (const dep of result.dependencies) {
          if (dep.cves.length > 0 || dep.usageRatio < 0.1) {
            notable.set(dep.name, dep);
          }
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Match import/require/use/from patterns
          const importMatch = line.match(
            /(?:import|require|from|use)\s+['"]([^'"]+)['"]/,
          ) || line.match(
            /from\s+['"]([^'"]+)['"]/,
          );
          if (!importMatch) continue;

          const specifier = importMatch[1];
          // Extract package name
          let pkgName = specifier;
          if (specifier.startsWith('@')) {
            const parts = specifier.split('/');
            pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
          } else {
            pkgName = specifier.split('/')[0];
          }

          const dep = notable.get(pkgName);
          if (!dep) continue;

          const range = new vscode.Range(i, 0, i, line.length);
          const cveCount = dep.cves.length;
          const inPath = dep.cves.filter(c => c.inUsagePath).length;

          let title = '';
          if (cveCount > 0) {
            title = `$(warning) ${cveCount} CVE${cveCount > 1 ? 's' : ''}`;
            if (inPath > 0) title += ` (${inPath} in usage path!)`;
            title += ` | Health: ${dep.healthScore}`;
          } else {
            title = `$(info) Usage: ${Math.round(dep.usageRatio * 100)}% | Health: ${dep.healthScore}`;
          }

          lenses.push(new vscode.CodeLens(range, {
            title,
            command: '',
          }));
        }
        return lenses;
      },
    };

    this.codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'rust' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'kotlin' },
        { scheme: 'file', language: 'swift' },
        { scheme: 'file', language: 'csharp' },
        { scheme: 'file', language: 'ruby' },
        { scheme: 'file', language: 'php' },
        { scheme: 'file', language: 'dart' },
      ],
      provider,
    );
  }

  dispose() {
    this.collection.dispose();
    this.codeLensProviderDisposable?.dispose();
  }
}
