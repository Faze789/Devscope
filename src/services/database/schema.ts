/** SQL schema definitions for the DepScope local cache database */

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    remote_url TEXT,
    last_analyzed TEXT,
    package_manager TEXT NOT NULL DEFAULT 'npm',
    is_monorepo INTEGER NOT NULL DEFAULT 0,
    workspace_roots TEXT, -- JSON array
    dependency_count INTEGER NOT NULL DEFAULT 0,
    health_score REAL NOT NULL DEFAULT 0,
    analysis_status TEXT NOT NULL DEFAULT '{"type":"idle"}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    is_dev INTEGER NOT NULL DEFAULT 0,
    total_exports INTEGER NOT NULL DEFAULT 0,
    used_exports TEXT, -- JSON array of PackageExport
    usage_ratio REAL NOT NULL DEFAULT 0,
    package_size INTEGER NOT NULL DEFAULT 0,
    transitive_deps TEXT, -- JSON array of strings
    health_score REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(repository_id, name)
  );

  CREATE TABLE IF NOT EXISTS import_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    source_file TEXT NOT NULL,
    line INTEGER NOT NULL,
    col INTEGER NOT NULL,
    package_name TEXT NOT NULL,
    raw_specifier TEXT NOT NULL,
    imported_symbols TEXT, -- JSON array of ImportedSymbol
    is_namespace_import INTEGER NOT NULL DEFAULT 0,
    is_side_effect INTEGER NOT NULL DEFAULT 0,
    is_dynamic INTEGER NOT NULL DEFAULT 0,
    is_require INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_nodes (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    package_name TEXT NOT NULL,
    export_name TEXT NOT NULL,
    consumers TEXT, -- JSON array of ConsumerRef
    internal_deps TEXT, -- JSON array of strings
    depth INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cves (
    id TEXT NOT NULL,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    dependency_name TEXT NOT NULL,
    aliases TEXT, -- JSON array
    summary TEXT,
    details TEXT,
    severity TEXT NOT NULL DEFAULT 'UNKNOWN',
    cvss_score REAL NOT NULL DEFAULT 0,
    affected_versions TEXT, -- JSON array
    fixed_version TEXT,
    affected_functions TEXT, -- JSON array
    in_usage_path INTEGER NOT NULL DEFAULT 0,
    published TEXT,
    modified TEXT,
    references_json TEXT, -- JSON array of URLs
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id, repository_id, dependency_name)
  );

  CREATE TABLE IF NOT EXISTS changelog_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dependency_name TEXT NOT NULL,
    version TEXT NOT NULL,
    date TEXT,
    breaking_changes TEXT, -- JSON array of BreakingChange
    features TEXT, -- JSON array
    fixes TEXT, -- JSON array
    raw_body TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(dependency_name, version)
  );

  CREATE TABLE IF NOT EXISTS file_hashes (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    hash TEXT NOT NULL,
    last_analyzed TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repository_id, file_path)
  );

  CREATE INDEX IF NOT EXISTS idx_deps_repo ON dependencies(repository_id);
  CREATE INDEX IF NOT EXISTS idx_imports_repo ON import_records(repository_id);
  CREATE INDEX IF NOT EXISTS idx_imports_package ON import_records(package_name);
  CREATE INDEX IF NOT EXISTS idx_usage_nodes_repo ON usage_nodes(repository_id);
  CREATE INDEX IF NOT EXISTS idx_cves_repo ON cves(repository_id);
  CREATE INDEX IF NOT EXISTS idx_cves_dep ON cves(dependency_name);
  CREATE INDEX IF NOT EXISTS idx_file_hashes_repo ON file_hashes(repository_id);
`;
