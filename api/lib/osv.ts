/**
 * OSV.dev vulnerability fetcher for serverless.
 */
import type { CVE } from './types';

const OSV_API = 'https://api.osv.dev/v1';

export async function queryVulnerabilities(packageName: string, version: string): Promise<CVE[]> {
  try {
    const res = await fetch(`${OSV_API}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.vulns || data.vulns.length === 0) return [];
    return data.vulns.map((v: any) => mapVuln(v, packageName));
  } catch {
    return [];
  }
}

export async function batchQueryVulnerabilities(
  packages: { name: string; version: string }[],
): Promise<Map<string, CVE[]>> {
  const results = new Map<string, CVE[]>();
  const batchSize = 8;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    const promises = batch.map(async (pkg) => {
      const cves = await queryVulnerabilities(pkg.name, pkg.version);
      return { name: pkg.name, cves };
    });
    const batchResults = await Promise.allSettled(promises);
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.set(r.value.name, r.value.cves);
    }
  }
  return results;
}

export function mapCVEsToUsagePath(
  cves: CVE[],
  usedExports: Set<string>,
  hasNamespaceImport: boolean,
): CVE[] {
  return cves.map((cve) => {
    if (hasNamespaceImport) return { ...cve, inUsagePath: true };
    if (cve.affectedFunctions.length === 0) {
      const text = `${cve.summary} ${cve.details}`.toLowerCase();
      for (const exp of usedExports) {
        if (exp === 'default' || exp === '*') continue;
        if (exp.length > 3 && text.includes(exp.toLowerCase())) return { ...cve, inUsagePath: true };
      }
      return { ...cve, inUsagePath: false };
    }
    const inPath = cve.affectedFunctions.some((fn) => {
      const fnName = fn.split('.').pop() || fn;
      return usedExports.has(fnName) || usedExports.has(fn);
    });
    return { ...cve, inUsagePath: inPath };
  });
}

function mapVuln(vuln: any, packageName: string): CVE {
  const affected = vuln.affected?.find(
    (a: any) => a.package.name === packageName && a.package.ecosystem === 'npm',
  );
  let cvssScore = 0;
  let severity: CVE['severity'] = 'UNKNOWN';
  if (vuln.severity?.length > 0) {
    const cvss = vuln.severity.find((s: any) => s.type === 'CVSS_V3');
    if (cvss) {
      cvssScore = parseFloat(cvss.score) || 0;
      severity = cvssScore >= 9 ? 'CRITICAL' : cvssScore >= 7 ? 'HIGH' : cvssScore >= 4 ? 'MEDIUM' : cvssScore > 0 ? 'LOW' : 'UNKNOWN';
    }
  }
  let fixedVersion: string | undefined;
  if (affected?.ranges) {
    for (const range of affected.ranges) {
      for (const event of range.events) {
        if (event.fixed) { fixedVersion = event.fixed; break; }
      }
    }
  }
  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    summary: vuln.summary ?? '',
    details: vuln.details ?? '',
    severity,
    cvssScore,
    affectedVersions: affected?.versions ?? [],
    fixedVersion,
    affectedFunctions: affected?.ecosystem_specific?.functions ?? [],
    inUsagePath: false,
    published: vuln.published ?? '',
    modified: vuln.modified ?? '',
    references: vuln.references?.map((r: any) => r.url) ?? [],
  };
}
