/**
 * Usage Graph Builder — Constructs a graph mapping actual usage of dependency
 * exports to their consumers in the user's codebase.
 */
import type {
  ImportRecord,
  PackageExport,
  UsageNode,
  ConsumerRef,
  Dependency,
} from '../../types';

interface PackageInfo {
  name: string;
  version: string;
  exports: PackageExport[];
}

/**
 * Build the usage graph from parsed import records and package export data.
 * Returns usage nodes and computed dependency summaries.
 */
export function buildUsageGraph(
  imports: ImportRecord[],
  packages: PackageInfo[],
): { nodes: UsageNode[]; dependencySummaries: Map<string, DependencySummary> } {
  const nodes = new Map<string, UsageNode>();
  const summaries = new Map<string, DependencySummary>();

  // Initialize summaries for all packages
  for (const pkg of packages) {
    summaries.set(pkg.name, {
      name: pkg.name,
      version: pkg.version,
      totalExports: pkg.exports.filter(
        (e) => e.kind !== 'type' && e.name !== '*',
      ).length,
      usedExports: new Set<string>(),
      usedExportDetails: [],
      consumers: new Map<string, Set<string>>(),
    });
  }

  // Process each import record
  for (const imp of imports) {
    const summary = summaries.get(imp.packageName);
    if (!summary) continue;

    const pkg = packages.find((p) => p.name === imp.packageName);
    if (!pkg) continue;

    if (imp.isSideEffect) {
      // Side-effect imports count as "using" the package but no specific exports
      ensureConsumer(summary, imp.sourceFile, '*');
      continue;
    }

    for (const sym of imp.importedSymbols) {
      if (sym.isTypeOnly) continue; // Type-only imports don't affect runtime usage

      const exportName = sym.isDefault ? 'default' : sym.exportedName;
      summary.usedExports.add(exportName);

      // Find the matching export
      const matchedExport = pkg.exports.find(
        (e) =>
          e.name === exportName ||
          (sym.isDefault && e.isDefault) ||
          // Handle re-exported names
          (e.isReExport && e.name === exportName),
      );

      if (matchedExport) {
        if (
          !summary.usedExportDetails.some((d) => d.name === matchedExport.name)
        ) {
          summary.usedExportDetails.push(matchedExport);
        }
      }

      ensureConsumer(summary, imp.sourceFile, exportName);

      // Create or update usage node
      const nodeId = `${imp.packageName}::${exportName}`;
      let node = nodes.get(nodeId);
      if (!node) {
        node = {
          id: nodeId,
          packageName: imp.packageName,
          exportName,
          consumers: [],
          internalDeps: [],
          depth: 0,
        };
        nodes.set(nodeId, node);
      }

      node.consumers.push({
        filePath: imp.sourceFile,
        line: imp.line,
        column: imp.column,
        context: '', // Would be populated with surrounding code in native module
      });
    }

    // Handle namespace imports
    if (imp.isNamespaceImport) {
      // Mark package as potentially using all exports
      summary.usedExports.add('*');
      ensureConsumer(summary, imp.sourceFile, '*');

      const nodeId = `${imp.packageName}::*`;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          packageName: imp.packageName,
          exportName: '*',
          consumers: [
            {
              filePath: imp.sourceFile,
              line: imp.line,
              column: imp.column,
              context: '',
            },
          ],
          internalDeps: [],
          depth: 0,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    dependencySummaries: summaries,
  };
}

function ensureConsumer(
  summary: DependencySummary,
  file: string,
  exportName: string,
): void {
  if (!summary.consumers.has(file)) {
    summary.consumers.set(file, new Set());
  }
  summary.consumers.get(file)!.add(exportName);
}

export interface DependencySummary {
  name: string;
  version: string;
  totalExports: number;
  usedExports: Set<string>;
  usedExportDetails: PackageExport[];
  consumers: Map<string, Set<string>>;
}

/** Compute a usage ratio from a DependencySummary */
export function computeUsageRatio(summary: DependencySummary): number {
  if (summary.totalExports === 0) return 1; // Package has no enumerable exports
  if (summary.usedExports.has('*')) return 1; // Namespace import = full usage assumed
  return Math.min(1, summary.usedExports.size / summary.totalExports);
}

/** Compute health score for a dependency based on usage and vulnerabilities */
export function computeHealthScore(
  usageRatio: number,
  cveCount: number,
  cvesInPath: number,
): number {
  let score = 100;
  // Penalize for dead weight (unused exports)
  score -= (1 - usageRatio) * 30;
  // Penalize for CVEs outside path
  score -= (cveCount - cvesInPath) * 5;
  // Heavily penalize for CVEs in usage path
  score -= cvesInPath * 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}
