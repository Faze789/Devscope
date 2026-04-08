export interface AnalysisRequest {
  owner: string;
  repo: string;
  branch?: string;
}

export interface ImportedSymbol {
  exportedName: string;
  localName: string;
  isDefault: boolean;
  isTypeOnly: boolean;
}

export interface ImportRecord {
  sourceFile: string;
  line: number;
  column: number;
  packageName: string;
  rawSpecifier: string;
  importedSymbols: ImportedSymbol[];
  isNamespaceImport: boolean;
  isSideEffect: boolean;
  isDynamic: boolean;
  isRequire: boolean;
}

export interface PackageExport {
  name: string;
  filePath: string;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'enum' | 'namespace' | 'unknown';
}

export interface CVE {
  id: string;
  aliases: string[];
  summary: string;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cvssScore: number;
  affectedVersions: string[];
  fixedVersion?: string;
  affectedFunctions: string[];
  inUsagePath: boolean;
  published: string;
  modified: string;
  references: string[];
}

export interface DependencyResult {
  name: string;
  version: string;
  isDev: boolean;
  totalExports: number;
  usedExports: PackageExport[];
  usageRatio: number;
  packageSize: number;
  transitiveDeps: string[];
  cves: CVE[];
  healthScore: number;
}

export interface UsageNode {
  id: string;
  packageName: string;
  exportName: string;
  consumers: { filePath: string; line: number; column: number; context: string }[];
  internalDeps: string[];
  depth: number;
}

export interface RefactorSuggestion {
  type: 'replace_package' | 'inline_code' | 'use_native' | 'tree_shake';
  packageName: string;
  reason: string;
  alternative?: string;
  codeSnippet?: string;
  sizeReduction: number;
  confidence: number;
}

export interface UpgradeImpact {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  bumpType: 'major' | 'minor' | 'patch';
  breakingChanges: {
    description: string;
    affectedApis: string[];
    affectsUser: boolean;
    affectedCallSites: { filePath: string; line: number; column: number; context: string }[];
  }[];
  filesAffected: number;
  risk: 'high' | 'medium' | 'low' | 'none';
}

export interface AnalysisResponse {
  repository: {
    name: string;
    owner: string;
    branch: string;
    url: string;
    analyzedAt: string;
    fileCount: number;
    dependencyCount: number;
    healthScore: number;
    ecosystem: 'npm' | 'pub' | 'unknown';
  };
  dependencies: DependencyResult[];
  usageNodes: UsageNode[];
  cves: CVE[];
  suggestions: RefactorSuggestion[];
  upgradeImpacts: UpgradeImpact[];
  errors: string[];
}
