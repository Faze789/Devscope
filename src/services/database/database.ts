import { open, type DB } from '@op-engineering/op-sqlite';
import { CREATE_TABLES_SQL } from './schema';
import type {
  Repository,
  Dependency,
  ImportRecord,
  UsageNode,
  CVE,
  ChangelogEntry,
} from '../../types';

let db: DB | null = null;

export async function getDatabase(): Promise<DB> {
  if (db) return db;
  db = open({ name: 'depscope.db' });
  // Execute schema creation
  const statements = CREATE_TABLES_SQL.split(';').filter((s) => s.trim());
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Repository CRUD ───

export async function upsertRepository(repo: Repository): Promise<void> {
  const d = await getDatabase();
  await d.execute(
    `INSERT INTO repositories (id, name, path, remote_url, last_analyzed, package_manager, is_monorepo, workspace_roots, dependency_count, health_score, analysis_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, path=excluded.path, remote_url=excluded.remote_url,
       last_analyzed=excluded.last_analyzed, package_manager=excluded.package_manager,
       is_monorepo=excluded.is_monorepo, workspace_roots=excluded.workspace_roots,
       dependency_count=excluded.dependency_count, health_score=excluded.health_score,
       analysis_status=excluded.analysis_status, updated_at=datetime('now')`,
    [
      repo.id,
      repo.name,
      repo.path,
      repo.remoteUrl ?? null,
      repo.lastAnalyzed ?? null,
      repo.packageManager,
      repo.isMonorepo ? 1 : 0,
      JSON.stringify(repo.workspaceRoots),
      repo.dependencyCount,
      repo.healthScore,
      JSON.stringify(repo.analysisStatus),
    ],
  );
}

export async function getAllRepositories(): Promise<Repository[]> {
  const d = await getDatabase();
  const result = await d.execute('SELECT * FROM repositories ORDER BY updated_at DESC');
  return (result.rows ?? []).map(rowToRepository);
}

export async function getRepository(id: string): Promise<Repository | null> {
  const d = await getDatabase();
  const result = await d.execute('SELECT * FROM repositories WHERE id = ?', [id]);
  const row = result.rows?.[0];
  return row ? rowToRepository(row) : null;
}

export async function deleteRepository(id: string): Promise<void> {
  const d = await getDatabase();
  await d.execute('DELETE FROM repositories WHERE id = ?', [id]);
}

function rowToRepository(row: any): Repository {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    remoteUrl: row.remote_url ?? undefined,
    lastAnalyzed: row.last_analyzed ?? undefined,
    packageManager: row.package_manager,
    isMonorepo: !!row.is_monorepo,
    workspaceRoots: JSON.parse(row.workspace_roots || '[]'),
    dependencyCount: row.dependency_count,
    healthScore: row.health_score,
    analysisStatus: JSON.parse(row.analysis_status || '{"type":"idle"}'),
  };
}

// ─── Dependency CRUD ───

export async function upsertDependency(
  repoId: string,
  dep: Dependency,
): Promise<void> {
  const d = await getDatabase();
  await d.execute(
    `INSERT INTO dependencies (repository_id, name, version, is_dev, total_exports, used_exports, usage_ratio, package_size, transitive_deps, health_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(repository_id, name) DO UPDATE SET
       version=excluded.version, is_dev=excluded.is_dev, total_exports=excluded.total_exports,
       used_exports=excluded.used_exports, usage_ratio=excluded.usage_ratio,
       package_size=excluded.package_size, transitive_deps=excluded.transitive_deps,
       health_score=excluded.health_score, updated_at=datetime('now')`,
    [
      repoId,
      dep.name,
      dep.version,
      dep.isDev ? 1 : 0,
      dep.totalExports,
      JSON.stringify(dep.usedExports),
      dep.usageRatio,
      dep.packageSize,
      JSON.stringify(dep.transitiveDeps),
      dep.healthScore,
    ],
  );
}

export async function getDependencies(repoId: string): Promise<Dependency[]> {
  const d = await getDatabase();
  const result = await d.execute(
    'SELECT * FROM dependencies WHERE repository_id = ? ORDER BY name',
    [repoId],
  );
  return (result.rows ?? []).map(rowToDependency);
}

function rowToDependency(row: any): Dependency {
  return {
    name: row.name,
    version: row.version,
    isDev: !!row.is_dev,
    totalExports: row.total_exports,
    usedExports: JSON.parse(row.used_exports || '[]'),
    usageRatio: row.usage_ratio,
    packageSize: row.package_size,
    transitiveDeps: JSON.parse(row.transitive_deps || '[]'),
    cves: [],
    healthScore: row.health_score,
  };
}

// ─── Import Records ───

export async function insertImportRecords(
  repoId: string,
  records: ImportRecord[],
): Promise<void> {
  const d = await getDatabase();
  await d.execute('DELETE FROM import_records WHERE repository_id = ?', [repoId]);
  for (const rec of records) {
    await d.execute(
      `INSERT INTO import_records (repository_id, source_file, line, col, package_name, raw_specifier, imported_symbols, is_namespace_import, is_side_effect, is_dynamic, is_require)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        repoId,
        rec.sourceFile,
        rec.line,
        rec.column,
        rec.packageName,
        rec.rawSpecifier,
        JSON.stringify(rec.importedSymbols),
        rec.isNamespaceImport ? 1 : 0,
        rec.isSideEffect ? 1 : 0,
        rec.isDynamic ? 1 : 0,
        rec.isRequire ? 1 : 0,
      ],
    );
  }
}

export async function getImportRecords(repoId: string): Promise<ImportRecord[]> {
  const d = await getDatabase();
  const result = await d.execute(
    'SELECT * FROM import_records WHERE repository_id = ?',
    [repoId],
  );
  return (result.rows ?? []).map((row: any) => ({
    sourceFile: row.source_file,
    line: row.line,
    column: row.col,
    packageName: row.package_name,
    rawSpecifier: row.raw_specifier,
    importedSymbols: JSON.parse(row.imported_symbols || '[]'),
    isNamespaceImport: !!row.is_namespace_import,
    isSideEffect: !!row.is_side_effect,
    isDynamic: !!row.is_dynamic,
    isRequire: !!row.is_require,
  }));
}

// ─── Usage Nodes ───

export async function upsertUsageNodes(
  repoId: string,
  nodes: UsageNode[],
): Promise<void> {
  const d = await getDatabase();
  await d.execute('DELETE FROM usage_nodes WHERE repository_id = ?', [repoId]);
  for (const node of nodes) {
    await d.execute(
      `INSERT INTO usage_nodes (id, repository_id, package_name, export_name, consumers, internal_deps, depth)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        repoId,
        node.packageName,
        node.exportName,
        JSON.stringify(node.consumers),
        JSON.stringify(node.internalDeps),
        node.depth,
      ],
    );
  }
}

// ─── CVEs ───

export async function upsertCVEs(
  repoId: string,
  depName: string,
  cves: CVE[],
): Promise<void> {
  const d = await getDatabase();
  for (const cve of cves) {
    await d.execute(
      `INSERT INTO cves (id, repository_id, dependency_name, aliases, summary, details, severity, cvss_score, affected_versions, fixed_version, affected_functions, in_usage_path, published, modified, references_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, repository_id, dependency_name) DO UPDATE SET
         aliases=excluded.aliases, summary=excluded.summary, details=excluded.details,
         severity=excluded.severity, cvss_score=excluded.cvss_score,
         affected_versions=excluded.affected_versions, fixed_version=excluded.fixed_version,
         affected_functions=excluded.affected_functions, in_usage_path=excluded.in_usage_path,
         published=excluded.published, modified=excluded.modified,
         references_json=excluded.references_json, fetched_at=datetime('now')`,
      [
        cve.id,
        repoId,
        depName,
        JSON.stringify(cve.aliases),
        cve.summary,
        cve.details,
        cve.severity,
        cve.cvssScore,
        JSON.stringify(cve.affectedVersions),
        cve.fixedVersion ?? null,
        JSON.stringify(cve.affectedFunctions),
        cve.inUsagePath ? 1 : 0,
        cve.published,
        cve.modified,
        JSON.stringify(cve.references),
      ],
    );
  }
}

export async function getCVEs(repoId: string): Promise<CVE[]> {
  const d = await getDatabase();
  const result = await d.execute(
    'SELECT * FROM cves WHERE repository_id = ? ORDER BY cvss_score DESC',
    [repoId],
  );
  return (result.rows ?? []).map(rowToCVE);
}

function rowToCVE(row: any): CVE {
  return {
    id: row.id,
    aliases: JSON.parse(row.aliases || '[]'),
    summary: row.summary,
    details: row.details,
    severity: row.severity,
    cvssScore: row.cvss_score,
    affectedVersions: JSON.parse(row.affected_versions || '[]'),
    fixedVersion: row.fixed_version ?? undefined,
    affectedFunctions: JSON.parse(row.affected_functions || '[]'),
    inUsagePath: !!row.in_usage_path,
    published: row.published,
    modified: row.modified,
    references: JSON.parse(row.references_json || '[]'),
  };
}

// ─── File Hashes (for incremental analysis) ───

export async function getFileHash(
  repoId: string,
  filePath: string,
): Promise<string | null> {
  const d = await getDatabase();
  const result = await d.execute(
    'SELECT hash FROM file_hashes WHERE repository_id = ? AND file_path = ?',
    [repoId, filePath],
  );
  return result.rows?.[0]?.hash as string | null ?? null;
}

export async function upsertFileHash(
  repoId: string,
  filePath: string,
  hash: string,
): Promise<void> {
  const d = await getDatabase();
  await d.execute(
    `INSERT INTO file_hashes (repository_id, file_path, hash)
     VALUES (?, ?, ?)
     ON CONFLICT(repository_id, file_path) DO UPDATE SET
       hash=excluded.hash, last_analyzed=datetime('now')`,
    [repoId, filePath, hash],
  );
}

// ─── Changelog ───

export async function upsertChangelog(
  entry: ChangelogEntry & { dependencyName: string },
): Promise<void> {
  const d = await getDatabase();
  await d.execute(
    `INSERT INTO changelog_entries (dependency_name, version, date, breaking_changes, features, fixes, raw_body)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(dependency_name, version) DO UPDATE SET
       date=excluded.date, breaking_changes=excluded.breaking_changes,
       features=excluded.features, fixes=excluded.fixes, raw_body=excluded.raw_body,
       fetched_at=datetime('now')`,
    [
      entry.dependencyName,
      entry.version,
      entry.date,
      JSON.stringify(entry.breakingChanges),
      JSON.stringify(entry.features),
      JSON.stringify(entry.fixes),
      entry.rawBody,
    ],
  );
}
