/**
 * POST /api/analyze
 *
 * Universal repository analyzer — supports any GitHub repository regardless
 * of language, framework, or package manager. Detects all ecosystems present,
 * parses their manifests, analyzes source imports, queries CVEs, and returns
 * aggregated dependency intelligence.
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
  getNpmPackageInfo,
  detectManifestFiles,
  resolveEcosystems,
  getSourceExtensions,
} from './lib/github';
import { getImportParser, extractPackageName } from './lib/parser';
import { batchQueryVulnerabilities, mapCVEsToUsagePath } from './lib/osv';
import { generateSuggestions } from './lib/recommend';
import { OSV_ECOSYSTEM, type Ecosystem, type EcosystemDetection } from './lib/manifests';
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
    const { owner, repo, branch: requestedBranch, token: clientToken } = req.body || {};
    if (!owner || !repo) {
      return res.status(400).json({ error: 'owner and repo are required' });
    }

    const token = clientToken || process.env.GITHUB_TOKEN || undefined;
    const errors: string[] = [];

    // 1. Resolve branch
    const branch = requestedBranch || await getDefaultBranch(owner, repo, token);

    // 2. Get file tree
    const tree = await getFileTree(owner, repo, branch, token);

    // 3. Detect all ecosystems (manifest files) in the repo
    const manifestFiles = detectManifestFiles(tree);
    console.log(`[DepScope] Detected ${manifestFiles.length} manifest(s) in ${owner}/${repo}:`,
      manifestFiles.map(m => `${m.ecosystem}:${m.path}`).join(', ') || 'none');

    // 4. Fetch and parse all manifests
    const detections = await resolveEcosystems(manifestFiles, owner, repo, branch, token);
    const detectedEcosystems = [...new Set(detections.map(d => d.ecosystem))];

    // 5. Aggregate dependencies from all ecosystems
    const allDeps: Record<string, string> = {};
    const devDeps: Record<string, string> = {};
    const depEcosystem: Record<string, Ecosystem> = {}; // Track which ecosystem each dep belongs to
    let projectName = repo;

    for (const det of detections) {
      if (det.parsed.name && projectName === repo) {
        projectName = det.parsed.name;
      }
      for (const [name, version] of Object.entries(det.parsed.dependencies)) {
        allDeps[name] = version;
        depEcosystem[name] = det.ecosystem;
      }
      for (const [name, version] of Object.entries(det.parsed.devDependencies)) {
        allDeps[name] = version;
        devDeps[name] = version;
        depEcosystem[name] = det.ecosystem;
      }
    }

    if (detections.length === 0) {
      // No manifests found — not an error. Return a valid response with zero deps.
      const allFiles = tree.filter(i => i.type === 'blob').map(i => i.path);
      errors.push(`No recognized dependency manifest found. Scanned ${allFiles.length} files.`);
    }

    if (detections.length > 0) {
      for (const det of detections) {
        const depCount = Object.keys(det.parsed.dependencies).length + Object.keys(det.parsed.devDependencies).length;
        if (depCount === 0) {
          errors.push(`${det.manifestFile}: parsed but found 0 dependencies`);
        }
      }
    }

    // 6. Filter and fetch source files for all detected ecosystems
    const sourceExtensions = getSourceExtensions(detectedEcosystems);
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

    // 7. Parse imports from all files using the right parser per extension
    const allImports: ImportRecord[] = [];
    for (const file of files) {
      try {
        const parser = getImportParser(file.path);
        if (parser) {
          const imports = parser(file.path, file.content);
          allImports.push(...imports);
        }
      } catch (e: any) {
        errors.push(`Parse error in ${file.path}: ${e.message}`);
      }
    }

    // 8. Aggregate per-package usage
    const packageUsage = new Map<string, {
      usedExports: Set<string>;
      exportDetails: PackageExport[];
      consumers: Map<string, { file: string; line: number }[]>;
      isNamespace: boolean;
      isSideEffect: boolean;
    }>();

    for (const imp of allImports) {
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

    // 9. Fetch package info + CVEs in parallel
    const depNames = Object.keys(allDeps);
    const pkgInfoMap = new Map<string, { size: number; latestVersion: string }>();
    const cveMap = new Map<string, CVE[]>();

    // Group dependencies by ecosystem for targeted queries
    const depsByEcosystem = new Map<Ecosystem, string[]>();
    for (const name of depNames) {
      const eco = depEcosystem[name] ?? 'unknown';
      const list = depsByEcosystem.get(eco) ?? [];
      list.push(name);
      depsByEcosystem.set(eco, list);
    }

    // Fetch package metadata and CVEs for each ecosystem in parallel
    const fetchPromises: Promise<void>[] = [];

    for (const [eco, names] of depsByEcosystem) {
      const prodDeps = names.filter(n => !devDeps[n]).slice(0, 40);
      const osvEcosystem = OSV_ECOSYSTEM[eco] || '';

      // Package info fetching (ecosystem-specific registries)
      if (eco === 'npm') {
        fetchPromises.push((async () => {
          await Promise.all(prodDeps.map(async (name) => {
            const info = await getNpmPackageInfo(name);
            if (info) pkgInfoMap.set(name, { size: info.size, latestVersion: info.latestVersion });
          }));
        })());
      } else if (eco === 'pub') {
        fetchPromises.push((async () => {
          await Promise.all(prodDeps.map(async (name) => {
            try {
              const pubRes = await fetch(`https://pub.dev/api/packages/${name}`);
              if (pubRes.ok) {
                const data = await pubRes.json();
                pkgInfoMap.set(name, { size: 0, latestVersion: data.latest?.version ?? '' });
              }
            } catch { /* skip */ }
          }));
        })());
      } else if (eco === 'pypi') {
        fetchPromises.push((async () => {
          await Promise.all(prodDeps.map(async (name) => {
            try {
              const pyRes = await fetch(`https://pypi.org/pypi/${name}/json`);
              if (pyRes.ok) {
                const data = await pyRes.json();
                pkgInfoMap.set(name, { size: 0, latestVersion: data.info?.version ?? '' });
              }
            } catch { /* skip */ }
          }));
        })());
      } else if (eco === 'crates.io') {
        fetchPromises.push((async () => {
          await Promise.all(prodDeps.map(async (name) => {
            try {
              const crateRes = await fetch(`https://crates.io/api/v1/crates/${name}`, {
                headers: { 'User-Agent': 'DepScope-Analyzer' },
              });
              if (crateRes.ok) {
                const data = await crateRes.json();
                pkgInfoMap.set(name, { size: 0, latestVersion: data.crate?.newest_version ?? '' });
              }
            } catch { /* skip */ }
          }));
        })());
      } else if (eco === 'rubygems') {
        fetchPromises.push((async () => {
          await Promise.all(prodDeps.map(async (name) => {
            try {
              const gemRes = await fetch(`https://rubygems.org/api/v1/gems/${name}.json`);
              if (gemRes.ok) {
                const data = await gemRes.json();
                pkgInfoMap.set(name, { size: 0, latestVersion: data.version ?? '' });
              }
            } catch { /* skip */ }
          }));
        })());
      }
      // Other ecosystems: we skip registry lookup, rely on CVE data only

      // CVE queries via OSV (works for all ecosystems OSV supports)
      if (osvEcosystem) {
        fetchPromises.push((async () => {
          const vulnMap = await batchQueryVulnerabilities(
            prodDeps.slice(0, 30).map((name) => ({
              name,
              version: cleanVersion(allDeps[name]),
              ecosystem: osvEcosystem,
            })),
          );
          for (const [k, v] of vulnMap) cveMap.set(k, v);
        })());
      }
    }

    await Promise.all(fetchPromises);

    // 10. Build dependency results
    const dependencies: DependencyResult[] = [];
    const allCVEs: CVE[] = [];
    const usageNodes: UsageNode[] = [];

    for (const [name, version] of Object.entries(allDeps)) {
      const isDev = name in devDeps;
      const usage = packageUsage.get(name);
      const pkgInfo = pkgInfoMap.get(name);
      const packageSize = pkgInfo?.size ?? 0;
      const eco = depEcosystem[name] ?? 'unknown';

      const usedCount = usage?.usedExports.size ?? 0;
      const estimatedTotal = Math.max(usedCount, estimateExportCount(name));
      const usageRatio = usage?.isNamespace ? 1 :
        estimatedTotal > 0 ? Math.min(1, usedCount / estimatedTotal) : (usedCount > 0 ? 0.1 : 0);

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
        ecosystem: eco,
        totalExports: estimatedTotal,
        usedExports: usage?.exportDetails ?? [],
        usageRatio, packageSize,
        transitiveDeps: [],
        cves: depCVEs,
        healthScore,
      });

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

    // 11. Generate suggestions
    const suggestions = generateSuggestions(dependencies);

    // 12. Build response
    const avgHealth = dependencies.length > 0
      ? Math.round(dependencies.reduce((s, d) => s + d.healthScore, 0) / dependencies.length)
      : 100;

    const primaryEcosystem = detectedEcosystems[0] ?? 'unknown';

    const response: AnalysisResponse = {
      repository: {
        name: repo, owner, branch,
        url: `https://github.com/${owner}/${repo}`,
        analyzedAt: new Date().toISOString(),
        fileCount: files.length,
        dependencyCount: dependencies.length,
        healthScore: avgHealth,
        ecosystem: primaryEcosystem,
        ecosystems: detectedEcosystems,
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

function estimateExportCount(name: string): number {
  const known: Record<string, number> = {
    lodash: 312, react: 65, 'react-dom': 40, express: 24, axios: 18,
    moment: 48, 'date-fns': 200, dayjs: 25, zod: 42, uuid: 7,
    chalk: 12, 'fs-extra': 30, dotenv: 4, jsonwebtoken: 5,
    bcrypt: 4, mongoose: 35, sequelize: 45, prisma: 20,
    next: 30, vue: 60, angular: 80, svelte: 20,
  };
  return known[name] ?? 20;
}
