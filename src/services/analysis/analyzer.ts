/**
 * Main Analysis Orchestrator — Coordinates the full analysis pipeline:
 * 1. Discover source files
 * 2. Parse imports from each file
 * 3. Scan package exports
 * 4. Build usage graph
 * 5. Compute metrics
 */
import { parseImports, extractPackageName } from './importParser';
import { scanExports } from './exportScanner';
import {
  buildUsageGraph,
  computeUsageRatio,
  computeHealthScore,
  type DependencySummary,
} from './usageGraphBuilder';
import {
  insertImportRecords,
  upsertDependency,
  upsertUsageNodes,
  upsertRepository,
  getFileHash,
  upsertFileHash,
} from '../database';
import type {
  Repository,
  ImportRecord,
  Dependency,
  PackageExport,
  UsageNode,
} from '../../types';
import { useRepositoryStore } from '../../store';

export interface AnalysisCallbacks {
  onProgress: (progress: number, currentFile: string) => void;
  readFile: (path: string) => Promise<string>;
  listFiles: (dir: string, extensions: string[]) => Promise<string[]>;
  readPackageJson: (path: string) => Promise<Record<string, any> | null>;
  fileHash: (path: string) => Promise<string>;
  fileSize: (path: string) => Promise<number>;
}

export interface AnalysisResult {
  repository: Repository;
  dependencies: Dependency[];
  usageNodes: UsageNode[];
  importRecords: ImportRecord[];
  errors: string[];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export async function analyzeRepository(
  repo: Repository,
  callbacks: AnalysisCallbacks,
): Promise<AnalysisResult> {
  const errors: string[] = [];

  // Update status
  useRepositoryStore.getState().updateAnalysisStatus(repo.id, {
    type: 'analyzing',
    progress: 0,
    currentFile: 'Discovering files...',
  });

  // Step 1: Read package.json to get dependencies
  callbacks.onProgress(0.05, 'Reading package.json...');
  const pkgJson = await callbacks.readPackageJson(`${repo.path}/package.json`);
  if (!pkgJson) {
    const error = 'Could not read package.json';
    errors.push(error);
    useRepositoryStore.getState().updateAnalysisStatus(repo.id, {
      type: 'error',
      message: error,
    });
    return { repository: repo, dependencies: [], usageNodes: [], importRecords: [], errors };
  }

  const declaredDeps: Record<string, string> = {
    ...(pkgJson.dependencies || {}),
  };
  const devDeps: Record<string, string> = {
    ...(pkgJson.devDependencies || {}),
  };
  const allDeclaredDeps = { ...declaredDeps, ...devDeps };

  // Step 2: Discover source files
  callbacks.onProgress(0.1, 'Discovering source files...');
  const sourceFiles = await callbacks.listFiles(repo.path, SOURCE_EXTENSIONS);
  const totalFiles = sourceFiles.length;

  // Step 3: Parse imports from each file (with incremental check)
  callbacks.onProgress(0.15, 'Parsing imports...');
  const allImports: ImportRecord[] = [];
  let processedFiles = 0;

  for (const filePath of sourceFiles) {
    try {
      // Check file hash for incremental analysis
      const currentHash = await callbacks.fileHash(filePath);
      const cachedHash = await getFileHash(repo.id, filePath);

      if (cachedHash === currentHash) {
        // File unchanged, skip parsing
        processedFiles++;
        continue;
      }

      const source = await callbacks.readFile(filePath);
      const imports = parseImports(filePath, source);
      allImports.push(...imports);

      // Update file hash
      await upsertFileHash(repo.id, filePath, currentHash);
    } catch (err: any) {
      errors.push(`Failed to parse ${filePath}: ${err.message}`);
    }

    processedFiles++;
    const progress = 0.15 + (processedFiles / totalFiles) * 0.4;
    callbacks.onProgress(progress, filePath);
  }

  // Step 4: Scan package exports
  callbacks.onProgress(0.55, 'Scanning package exports...');
  const packageInfos: {
    name: string;
    version: string;
    exports: PackageExport[];
  }[] = [];

  const depNames = Object.keys(allDeclaredDeps);
  for (let i = 0; i < depNames.length; i++) {
    const depName = depNames[i];
    const version = allDeclaredDeps[depName];

    try {
      // Try to read the package's entry point
      const depPkgJsonPath = `${repo.path}/node_modules/${depName}/package.json`;
      const depPkgJson = await callbacks.readPackageJson(depPkgJsonPath);
      if (!depPkgJson) {
        packageInfos.push({ name: depName, version, exports: [] });
        continue;
      }

      // Resolve entry point
      const entryPoint =
        depPkgJson.module ||
        depPkgJson.main ||
        depPkgJson.exports?.['.']?.import ||
        depPkgJson.exports?.['.']?.require ||
        depPkgJson.exports?.['.']?.default ||
        (typeof depPkgJson.exports === 'string' ? depPkgJson.exports : null) ||
        'index.js';

      const entryPath = `${repo.path}/node_modules/${depName}/${entryPoint}`;
      try {
        const entrySource = await callbacks.readFile(entryPath);
        const exports = scanExports(entryPath, entrySource);
        packageInfos.push({ name: depName, version, exports });
      } catch {
        // Entry point not found, try index.js
        try {
          const fallbackPath = `${repo.path}/node_modules/${depName}/index.js`;
          const fallbackSource = await callbacks.readFile(fallbackPath);
          const exports = scanExports(fallbackPath, fallbackSource);
          packageInfos.push({ name: depName, version, exports });
        } catch {
          packageInfos.push({ name: depName, version, exports: [] });
        }
      }
    } catch (err: any) {
      errors.push(`Failed to scan exports for ${depName}: ${err.message}`);
      packageInfos.push({ name: depName, version, exports: [] });
    }

    const progress = 0.55 + ((i + 1) / depNames.length) * 0.2;
    callbacks.onProgress(progress, `Scanning ${depName}...`);
  }

  // Step 5: Build usage graph
  callbacks.onProgress(0.75, 'Building usage graph...');
  const { nodes, dependencySummaries } = buildUsageGraph(allImports, packageInfos);

  // Step 6: Compute dependency metrics
  callbacks.onProgress(0.85, 'Computing metrics...');
  const dependencies: Dependency[] = [];

  for (const [depName, version] of Object.entries(allDeclaredDeps)) {
    const summary = dependencySummaries.get(depName);
    const pkgInfo = packageInfos.find((p) => p.name === depName);
    const isDev = depName in devDeps;

    let packageSize = 0;
    try {
      packageSize = await callbacks.fileSize(
        `${repo.path}/node_modules/${depName}`,
      );
    } catch {}

    const totalExports = summary?.totalExports ?? pkgInfo?.exports.length ?? 0;
    const usageRatio = summary ? computeUsageRatio(summary) : 0;

    dependencies.push({
      name: depName,
      version,
      isDev,
      totalExports,
      usedExports: summary?.usedExportDetails ?? [],
      usageRatio,
      packageSize,
      transitiveDeps: [],
      cves: [],
      healthScore: computeHealthScore(usageRatio, 0, 0),
    });
  }

  // Step 7: Persist to database
  callbacks.onProgress(0.9, 'Saving results...');
  await insertImportRecords(repo.id, allImports);
  await upsertUsageNodes(repo.id, nodes);

  for (const dep of dependencies) {
    await upsertDependency(repo.id, dep);
  }

  const updatedRepo: Repository = {
    ...repo,
    lastAnalyzed: new Date().toISOString(),
    dependencyCount: dependencies.length,
    healthScore: dependencies.length > 0
      ? Math.round(
          dependencies.reduce((sum, d) => sum + d.healthScore, 0) /
            dependencies.length,
        )
      : 100,
    analysisStatus: { type: 'complete', timestamp: new Date().toISOString() },
  };

  await upsertRepository(updatedRepo);
  useRepositoryStore.getState().updateAnalysisStatus(repo.id, updatedRepo.analysisStatus);
  useRepositoryStore.getState().updateRepository(repo.id, {
    lastAnalyzed: updatedRepo.lastAnalyzed,
    dependencyCount: updatedRepo.dependencyCount,
    healthScore: updatedRepo.healthScore,
  });

  callbacks.onProgress(1, 'Complete');

  return {
    repository: updatedRepo,
    dependencies,
    usageNodes: nodes,
    importRecords: allImports,
    errors,
  };
}
