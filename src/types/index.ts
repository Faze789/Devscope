// ─── Core Domain Types for DepScope ───

/** Represents a single import found in source code */
export interface ImportRecord {
  /** Absolute file path where the import was found */
  sourceFile: string;
  /** Line number of the import statement */
  line: number;
  /** Column number */
  column: number;
  /** The package name (e.g., 'lodash', '@aws-sdk/client-s3') */
  packageName: string;
  /** Raw import specifier (e.g., 'lodash/debounce', '@aws-sdk/client-s3') */
  rawSpecifier: string;
  /** Individual symbols imported (e.g., ['debounce', 'throttle']) */
  importedSymbols: ImportedSymbol[];
  /** Whether it's a namespace import (import * as X) */
  isNamespaceImport: boolean;
  /** Whether it's a side-effect import (import 'module') */
  isSideEffect: boolean;
  /** Whether it's a dynamic import (import('module')) */
  isDynamic: boolean;
  /** Whether it's a require() call */
  isRequire: boolean;
}

export interface ImportedSymbol {
  /** The exported name from the package */
  exportedName: string;
  /** The local alias (if renamed via `as`) */
  localName: string;
  /** Whether this is the default export */
  isDefault: boolean;
  /** Whether this is a type-only import */
  isTypeOnly: boolean;
}

/** An exported symbol from a dependency package */
export interface PackageExport {
  name: string;
  filePath: string;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'enum' | 'namespace' | 'unknown';
}

/** Represents a tracked dependency in a repository */
export interface Dependency {
  name: string;
  version: string;
  isDev: boolean;
  /** Total exports found in the package */
  totalExports: number;
  /** Exports actually used by the project */
  usedExports: PackageExport[];
  /** Usage ratio (0-1) */
  usageRatio: number;
  /** File size of the package in bytes */
  packageSize: number;
  /** Transitive dependencies */
  transitiveDeps: string[];
  /** Associated CVEs */
  cves: CVE[];
  /** Health score (0-100) */
  healthScore: number;
}

/** Usage graph node representing a call-site chain */
export interface UsageNode {
  id: string;
  packageName: string;
  exportName: string;
  /** Source files that import this symbol */
  consumers: ConsumerRef[];
  /** If this export internally calls other exports */
  internalDeps: string[];
  /** Transitive depth level */
  depth: number;
}

export interface ConsumerRef {
  filePath: string;
  line: number;
  column: number;
  context: string; // surrounding code snippet
}

/** CVE/vulnerability record */
export interface CVE {
  id: string;
  aliases: string[];
  summary: string;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  /** CVSS score (0-10) */
  cvssScore: number;
  /** Affected package versions */
  affectedVersions: string[];
  /** Fixed version (if any) */
  fixedVersion?: string;
  /** Specific functions/files within the package that are vulnerable */
  affectedFunctions: string[];
  /** Whether this CVE is in the user's actual usage path */
  inUsagePath: boolean;
  /** Publish date */
  published: string;
  /** Last modified */
  modified: string;
  /** Reference URLs */
  references: string[];
}

/** Repository being analyzed */
export interface Repository {
  id: string;
  name: string;
  path: string;
  /** Remote URL if connected */
  remoteUrl?: string;
  /** Last analysis timestamp */
  lastAnalyzed?: string;
  /** Package manager detected */
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown';
  /** Whether this is a monorepo */
  isMonorepo: boolean;
  /** Workspace roots (for monorepos) */
  workspaceRoots: string[];
  /** Dependency count */
  dependencyCount: number;
  /** Overall health score */
  healthScore: number;
  /** Analysis status */
  analysisStatus: AnalysisStatus;
}

export type AnalysisStatus =
  | { type: 'idle' }
  | { type: 'analyzing'; progress: number; currentFile: string }
  | { type: 'complete'; timestamp: string }
  | { type: 'error'; message: string };

/** Changelog entry parsed from GitHub Releases */
export interface ChangelogEntry {
  version: string;
  date: string;
  breakingChanges: BreakingChange[];
  features: string[];
  fixes: string[];
  rawBody: string;
}

export interface BreakingChange {
  description: string;
  /** Specific functions/APIs affected */
  affectedApis: string[];
  /** Whether this breaking change affects the user's call-sites */
  affectsUser: boolean;
  /** Files and lines in user's code affected */
  affectedCallSites: ConsumerRef[];
}

/** Refactoring suggestion */
export interface RefactorSuggestion {
  type: 'replace_package' | 'inline_code' | 'use_native' | 'tree_shake';
  packageName: string;
  reason: string;
  /** Alternative package or native approach */
  alternative?: string;
  /** Code snippet for the refactoring */
  codeSnippet?: string;
  /** Estimated size reduction in bytes */
  sizeReduction: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Upgrade impact preview */
export interface UpgradeImpact {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  /** semver bump type */
  bumpType: 'major' | 'minor' | 'patch';
  breakingChanges: BreakingChange[];
  /** Total files affected */
  filesAffected: number;
  /** Risk level */
  risk: 'high' | 'medium' | 'low' | 'none';
}

/** Report data for export */
export interface ExposureReport {
  generatedAt: string;
  repository: Repository;
  dependencies: Dependency[];
  cves: CVE[];
  unusedExports: { packageName: string; exports: string[] }[];
  refactorSuggestions: RefactorSuggestion[];
  summary: {
    totalDependencies: number;
    totalCVEs: number;
    cvesInUsagePath: number;
    cvesOutsideUsagePath: number;
    averageUsageRatio: number;
    totalDeadWeight: number;
  };
}
