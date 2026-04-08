/**
 * DepScope API Client — calls the Vercel-hosted analysis backend.
 */
import type {
  Repository,
  Dependency,
  CVE,
  UsageNode,
  RefactorSuggestion,
  UpgradeImpact,
} from '../../types';

// Will be updated after Vercel deployment
const API_BASE = 'https://depscope-lyart.vercel.app';

export interface AnalysisApiResponse {
  repository: {
    name: string;
    owner: string;
    branch: string;
    url: string;
    analyzedAt: string;
    fileCount: number;
    dependencyCount: number;
    healthScore: number;
    ecosystem?: string;
    ecosystems?: string[];
  };
  dependencies: Dependency[];
  usageNodes: UsageNode[];
  cves: CVE[];
  suggestions: RefactorSuggestion[];
  upgradeImpacts: UpgradeImpact[];
  errors: string[];
}

/** Parse a GitHub URL into owner/repo */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  // Handle full URLs: https://github.com/owner/repo
  const urlMatch = input.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  // Handle owner/repo format
  const slashMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };

  return null;
}

/** Analyze a GitHub repository via the backend API */
export async function analyzeRepo(
  owner: string,
  repo: string,
  branch?: string,
  token?: string,
): Promise<AnalysisApiResponse> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, branch, token }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(err.error || `Analysis failed with status ${response.status}`);
  }

  return response.json();
}

/** Convert API response to app store format */
export function apiResponseToStoreData(res: AnalysisApiResponse) {
  const repository: Repository = {
    id: `${res.repository.owner}/${res.repository.name}`,
    name: res.repository.name,
    path: res.repository.url,
    remoteUrl: res.repository.url,
    lastAnalyzed: res.repository.analyzedAt,
    packageManager: (res.repository.ecosystem === 'npm' ? 'npm' : 'unknown') as any,
    isMonorepo: false,
    workspaceRoots: [],
    dependencyCount: res.repository.dependencyCount,
    healthScore: res.repository.healthScore,
    analysisStatus: { type: 'complete', timestamp: res.repository.analyzedAt },
  };

  const usageGraph = new Map<string, UsageNode>();
  for (const node of res.usageNodes) {
    usageGraph.set(node.id, node);
  }

  return {
    repository,
    dependencies: res.dependencies,
    cves: res.cves,
    usageGraph,
    suggestions: res.suggestions,
    upgradeImpacts: res.upgradeImpacts,
    errors: res.errors,
  };
}
