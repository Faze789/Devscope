/**
 * DepScope API client for the VS Code extension.
 */
import * as https from 'https';

export interface AnalysisResult {
  repository: {
    name: string;
    owner: string;
    branch: string;
    url: string;
    analyzedAt: string;
    fileCount: number;
    dependencyCount: number;
    healthScore: number;
    ecosystem: string;
    ecosystems: string[];
  };
  dependencies: DependencyInfo[];
  usageNodes: UsageNode[];
  cves: CVEInfo[];
  suggestions: Suggestion[];
  errors: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  isDev: boolean;
  ecosystem?: string;
  totalExports: number;
  usedExports: { name: string; filePath: string; isDefault: boolean; kind: string }[];
  usageRatio: number;
  packageSize: number;
  cves: CVEInfo[];
  healthScore: number;
}

export interface CVEInfo {
  id: string;
  summary: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cvssScore: number;
  fixedVersion?: string;
  inUsagePath: boolean;
  affectedFunctions: string[];
}

export interface UsageNode {
  id: string;
  packageName: string;
  exportName: string;
  consumers: { filePath: string; line: number }[];
}

export interface Suggestion {
  type: string;
  packageName: string;
  reason: string;
  alternative?: string;
  confidence: number;
}

export async function analyzeRepo(
  owner: string,
  repo: string,
  apiUrl: string,
  token?: string,
): Promise<AnalysisResult> {
  const body = JSON.stringify({ owner, repo, token: token || undefined });

  return new Promise((resolve, reject) => {
    const url = new URL(`${apiUrl}/api/analyze`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Analysis timed out (120s)'));
    });
    req.write(body);
    req.end();
  });
}

/** Extract owner/repo from a git remote URL */
export function parseGitRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2].replace('.git', '') };
  return null;
}
