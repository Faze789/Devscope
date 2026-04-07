/**
 * POST /api/analyze
 *
 * Analyzes a GitHub repository: fetches source files, parses imports,
 * queries CVEs, computes usage graph, generates recommendations.
 *
 * Body: { owner: string, repo: string, branch?: string, token?: string }
 * Returns: AnalysisResponse
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getDefaultBranch,
  getFileTree,
  filterSourceFiles,
  getFilesContent,
  getPackageJson,
  getNpmPackageInfo,
  getFileContent,
  detectProjectType,
  parsePubspecYaml,
} from './lib/github';
import type { ProjectType } from './lib/github';
import { parseImports, parseDartImports, extractPackageName } from './lib/parser';
import { batchQueryVulnerabilities, mapCVEsToUsagePath } from './lib/osv';
import { generateSuggestions } from './lib/recommend';
import type {
  AnalysisResponse,
  DependencyResult,
  UsageNode,
  ImportRecord,
  PackageExport,
  CVE,
} from './lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { owner, repo, branch: requestedBranch, token } = req.body || {};
    if (!owner || !repo) {
      return res.status(400).json({ error: 'owner and repo are required' });
    }

    const errors: string[] = [];

    // 1. Resolve branch
    const branch = requestedBranch || await getDefaultBranch(owner, repo, token);

    // 2. Get file tree and detect project type
    const tree = await getFileTree(owner, repo, branch, token);
    const projectType = detectProjectType(tree);

    // 3. Resolve dependencies based on project type
    let declaredDeps: Record<string, string> = {};
    let devDeps: Record<string, string> = {};
    let projectName = repo;
    let ecosystem: 'npm' | 'pub' | 'unknown' = 'unknown';

    if (projectType === 'node') {
      const pkgJson = await getPackageJson(owner, repo, branch, token);
      if (!pkgJson) {
        return res.status(400).json({ error: 'No package.json found in repository root' });
      }
      declaredDeps = pkgJson.dependencies || {};
      devDeps = pkgJson.devDependencies || {};
      projectName = pkgJson.name || repo;
      ecosystem = 'npm';
    } else if (projectType === 'dart') {
      const pubspecContent = await getFileContent(owner, repo, 'pubspec.yaml', branch, token);
      if (!pubspecContent) {
        return res.status(400).json({ error: 'No pubspec.yaml found in repository root' });
      }
      errors.push(`[debug] pubspec length=${pubspecContent.length}, first100=${JSON.stringify(pubspecContent.slice(0, 100))}`);
      const pubspec = parsePubspecYaml(pubspecContent);
      errors.push(`[debug] parsed name=${pubspec.name}, deps=${JSON.stringify(pubspec.dependencies)}`);
      declaredDeps = pubspec.dependencies;
      devDeps = pubspec.devDependencies;
      projectName = pubspec.name || repo;
      ecosystem = 'pub';
    } else {
      return res.status(400).json({
        error: `Unsupported project type. DepScope currently supports JavaScript/TypeScript (package.json) and Flutter/Dart (pubspec.yaml) projects.`,
      });
    }

    const allDeps = { ...declaredDeps, ...devDeps };
    errors.push(`[debug] projectType=${projectType}, ecosystem=${ecosystem}, declaredDeps=${Object.keys(declaredDeps).length}, devDeps=${Object.keys(devDeps).length}, allDeps=${Object.keys(allDeps).length}`);

    // 4. Filter and fetch source files
    const sourceExtensions = projectType === 'dart' ? ['.dart'] : ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const sourceFiles = filterSourceFiles(tree, sourceExtensions);

    const filesToAnalyze = sourceFiles.slice(0, 200);
    if (sourceFiles.length > 200) {
      errors.push(`Repo has ${sourceFiles.length} source files, analyzing first 200`);
    }

    const files = await getFilesContent(
      owner, repo,
      filesToAnalyze.map((f) => f.path),
      branch, token, 15,
    );

    // 5. Parse imports from all files
    const allImports: ImportRecord[] = [];
    for (const file of files) {
      try {
        const imports = projectType === 'dart'
          ? parseDartImports(file.path, file.content)
          : parseImports(file.path, file.content);
        allImports.push(...imports);
      } catch (e: any) {
        errors.push(`Parse error in ${file.path}: ${e.message}`);
      }
    }

    // 6. Aggregate per-package usage
    const packageUsage = new Map<string, {
      usedExports: Set<string>;
      exportDetails: PackageExport[];
      consumers: Map<string, { file: string; line: number }[]>;
      isNamespace: boolean;
      isSideEffect: boolean;
    }>();

    for (const imp of allImports) {
      // For Dart, package names from imports may use underscores (e.g., "supabase_flutter")
      if (!allDeps[imp.packageName]) continue;

      let usage = packageUsage.get(imp.packageName);
      if (!usage) {
        usage = { usedExports: new Set(), exportDetails: [], consumers: new Map(), isNamespace: false, isSideEffect: false };
        packageUsage.set(imp.packageName, usage);
      }

      if (imp.isNamespaceImport) usage.isNamespace = true;
      if (imp.isSideEffect) usage.isSideEffect = true;

      for (const sym of imp.importedSymbols) {
        if (sym.isTypeOnly) continue;
        const exportName = sym.isDefault ? 'default' : sym.exportedName;
        usage.usedExports.add(exportName);

        if (!usage.exportDetails.some((d) => d.name === exportName)) {
          usage.exportDetails.push({
            name: exportName, filePath: '', isDefault: sym.isDefault,
            isReExport: false, kind: 'unknown',
          });
        }

        const consumerList = usage.consumers.get(exportName) || [];
        consumerList.push({ file: imp.sourceFile, line: imp.line });
        usage.consumers.set(exportName, consumerList);
      }
    }

    // 7. Fetch package info + CVEs in parallel
    const depNames = Object.keys(allDeps);
    const npmInfoMap = new Map<string, { size: number; latestVersion: string }>();
    const cveMap = new Map<string, CVE[]>();

    if (ecosystem === 'npm') {
      const [infoMap, vulnMap] = await Promise.all([
        (async () => {
          const map = new Map<string, { size: number; latestVersion: string }>();
          const batch = depNames.filter((n) => !devDeps[n]).slice(0, 40);
          await Promise.all(batch.map(async (name) => {
            const info = await getNpmPackageInfo(name);
            if (info) map.set(name, { size: info.size, latestVersion: info.latestVersion });
          }));
          return map;
        })(),
        batchQueryVulnerabilities(
          depNames.filter((n) => !devDeps[n]).slice(0, 30).map((name) => ({
            name,
            version: cleanVersion(allDeps[name]),
          })),
        ),
      ]);
      for (const [k, v] of infoMap) npmInfoMap.set(k, v);
      for (const [k, v] of vulnMap) cveMap.set(k, v);
    } else if (ecosystem === 'pub') {
      // Fetch pub.dev package info for Dart packages
      const prodDeps = depNames.filter((n) => !devDeps[n]).slice(0, 40);
      await Promise.all(prodDeps.map(async (name) => {
        try {
          const pubRes = await fetch(`https://pub.dev/api/packages/${name}`);
          if (pubRes.ok) {
            const data = await pubRes.json();
            const latest = data.latest?.version ?? '';
            npmInfoMap.set(name, { size: 0, latestVersion: latest });
          }
        } catch { /* skip */ }
      }));
      // Query OSV for Dart/pub ecosystem
      const vulnMap = await batchQueryVulnerabilities(
        prodDeps.slice(0, 30).map((name) => ({
          name,
          version: cleanVersion(allDeps[name]),
          ecosystem: 'Pub',
        })),
      );
      for (const [k, v] of vulnMap) cveMap.set(k, v);
    }

    // 8. Build dependency results
    const dependencies: DependencyResult[] = [];
    const allCVEs: CVE[] = [];
    const usageNodes: UsageNode[] = [];

    for (const [name, version] of Object.entries(allDeps)) {
      const isDev = name in devDeps;
      const usage = packageUsage.get(name);
      const npmInfo = npmInfoMap.get(name);
      const packageSize = npmInfo?.size ?? 0;

      // Estimate total exports (npm packages average ~20-50 exports)
      const usedCount = usage?.usedExports.size ?? 0;
      const estimatedTotal = Math.max(usedCount, estimateExportCount(name));
      const usageRatio = usage?.isNamespace ? 1 :
        estimatedTotal > 0 ? Math.min(1, usedCount / estimatedTotal) : (usedCount > 0 ? 0.1 : 0);

      // Map CVEs to usage path
      let depCVEs = cveMap.get(name) ?? [];
      if (depCVEs.length > 0 && usage) {
        depCVEs = mapCVEsToUsagePath(depCVEs, usage.usedExports, usage.isNamespace);
      }
      allCVEs.push(...depCVEs);

      const cvesInPath = depCVEs.filter((c) => c.inUsagePath).length;
      let healthScore = 100;
      healthScore -= (1 - usageRatio) * 30;
      healthScore -= (depCVEs.length - cvesInPath) * 5;
      healthScore -= cvesInPath * 20;
      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      dependencies.push({
        name, version: cleanVersion(version), isDev,
        totalExports: estimatedTotal,
        usedExports: usage?.exportDetails ?? [],
        usageRatio, packageSize,
        transitiveDeps: [],
        cves: depCVEs,
        healthScore,
      });

      // Build usage nodes
      if (usage) {
        for (const [exportName, consumers] of usage.consumers) {
          usageNodes.push({
            id: `${name}::${exportName}`,
            packageName: name,
            exportName,
            consumers: consumers.map((c) => ({
              filePath: c.file, line: c.line, column: 0, context: '',
            })),
            internalDeps: [],
            depth: 0,
          });
        }
      }
    }

    // 9. Generate suggestions
    const suggestions = generateSuggestions(dependencies);

    // 10. Build response
    const avgHealth = dependencies.length > 0
      ? Math.round(dependencies.reduce((s, d) => s + d.healthScore, 0) / dependencies.length)
      : 100;

    const response: AnalysisResponse = {
      repository: {
        name: repo, owner, branch,
        url: `https://github.com/${owner}/${repo}`,
        analyzedAt: new Date().toISOString(),
        fileCount: files.length,
        dependencyCount: dependencies.length,
        healthScore: avgHealth,
      },
      dependencies: dependencies.sort((a, b) => a.name.localeCompare(b.name)),
      usageNodes,
      cves: allCVEs,
      suggestions,
      upgradeImpacts: [],
      errors,
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]*/g, '').split(' ')[0];
}

/** Estimate export count for well-known packages */
function estimateExportCount(name: string): number {
  const known: Record<string, number> = {
    lodash: 312, react: 65, 'react-dom': 40, express: 24, axios: 18,
    moment: 48, 'date-fns': 200, dayjs: 25, zod: 42, uuid: 7,
    chalk: 12, 'fs-extra': 30, dotenv: 4, jsonwebtoken: 5,
    bcrypt: 4, mongoose: 35, sequelize: 45, prisma: 20,
    'next': 30, vue: 60, angular: 80, svelte: 20,
  };
  return known[name] ?? 20;
}
