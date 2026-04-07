/**
 * OSV.dev API Client — Fetches vulnerability data for npm packages.
 * Provides precision mapping of CVEs to specific functions where possible.
 */
import type { CVE, UsageNode } from '../../types';

const OSV_API_BASE = 'https://api.osv.dev/v1';

interface OSVVulnerability {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package: {
      ecosystem: string;
      name: string;
    };
    ranges?: Array<{
      type: string;
      events: Array<{ introduced?: string; fixed?: string }>;
    }>;
    versions?: string[];
    ecosystem_specific?: {
      functions?: string[];
    };
    database_specific?: Record<string, any>;
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  published?: string;
  modified?: string;
}

interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

/** Query OSV.dev for vulnerabilities affecting a specific npm package version */
export async function queryVulnerabilities(
  packageName: string,
  version: string,
): Promise<CVE[]> {
  try {
    const response = await fetch(`${OSV_API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: {
          name: packageName,
          ecosystem: 'npm',
        },
        version,
      }),
    });

    if (!response.ok) {
      throw new Error(`OSV API error: ${response.status}`);
    }

    const data: OSVQueryResponse = await response.json();
    if (!data.vulns || data.vulns.length === 0) return [];

    return data.vulns.map((vuln) => mapOSVToCVE(vuln, packageName));
  } catch (error: any) {
    console.warn(`Failed to query OSV for ${packageName}@${version}: ${error.message}`);
    return [];
  }
}

/** Batch query multiple packages at once */
export async function queryBatchVulnerabilities(
  packages: Array<{ name: string; version: string }>,
): Promise<Map<string, CVE[]>> {
  const results = new Map<string, CVE[]>();

  // OSV doesn't have a batch endpoint for npm, so we parallelize individual queries
  const batchSize = 10;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    const promises = batch.map(async (pkg) => {
      const cves = await queryVulnerabilities(pkg.name, pkg.version);
      return { name: pkg.name, cves };
    });

    const batchResults = await Promise.allSettled(promises);
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.name, result.value.cves);
      }
    }
  }

  return results;
}

/**
 * Cross-reference CVE affected functions with usage graph nodes
 * to determine if a CVE is in the user's actual usage path.
 */
export function mapCVEsToUsagePath(
  cves: CVE[],
  usageNodes: UsageNode[],
  packageName: string,
): CVE[] {
  const usedExports = new Set(
    usageNodes
      .filter((n) => n.packageName === packageName)
      .map((n) => n.exportName),
  );

  // If namespace import (*), all CVEs are in usage path
  const hasNamespaceImport = usedExports.has('*');

  return cves.map((cve) => {
    if (hasNamespaceImport) {
      return { ...cve, inUsagePath: true };
    }

    if (cve.affectedFunctions.length === 0) {
      // No function-level data — use heuristic matching against advisory text
      const inPath = heuristicFunctionMatch(cve, usedExports);
      return { ...cve, inUsagePath: inPath };
    }

    // Check if any affected function matches used exports
    const inPath = cve.affectedFunctions.some((fn) => {
      const fnName = fn.split('.').pop() || fn;
      return usedExports.has(fnName) || usedExports.has(fn);
    });

    return { ...cve, inUsagePath: inPath };
  });
}

/** Heuristic matching: check if CVE summary/details mention any used exports */
function heuristicFunctionMatch(
  cve: CVE,
  usedExports: Set<string>,
): boolean {
  const text = `${cve.summary} ${cve.details}`.toLowerCase();
  for (const exp of usedExports) {
    if (exp === 'default' || exp === '*') continue;
    if (exp.length > 3 && text.includes(exp.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function mapOSVToCVE(vuln: OSVVulnerability, packageName: string): CVE {
  const affected = vuln.affected?.find(
    (a) => a.package.name === packageName && a.package.ecosystem === 'npm',
  );

  // Extract CVSS score
  let cvssScore = 0;
  let severity: CVE['severity'] = 'UNKNOWN';
  if (vuln.severity && vuln.severity.length > 0) {
    const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3');
    if (cvss) {
      cvssScore = parseFloat(cvss.score) || 0;
      severity = cvssToSeverity(cvssScore);
    }
  }

  // Extract affected versions
  const affectedVersions: string[] = affected?.versions ?? [];

  // Extract fixed version
  let fixedVersion: string | undefined;
  if (affected?.ranges) {
    for (const range of affected.ranges) {
      for (const event of range.events) {
        if (event.fixed) {
          fixedVersion = event.fixed;
          break;
        }
      }
    }
  }

  // Extract affected functions
  const affectedFunctions: string[] =
    affected?.ecosystem_specific?.functions ?? [];

  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    summary: vuln.summary ?? '',
    details: vuln.details ?? '',
    severity,
    cvssScore,
    affectedVersions,
    fixedVersion,
    affectedFunctions,
    inUsagePath: false, // Determined later by mapCVEsToUsagePath
    published: vuln.published ?? '',
    modified: vuln.modified ?? '',
    references: vuln.references?.map((r) => r.url) ?? [],
  };
}

function cvssToSeverity(score: number): CVE['severity'] {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'UNKNOWN';
}
