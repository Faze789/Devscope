/**
 * Report Generator — Produces exposure surface reports for export
 * as PDF/CSV for SOC2/compliance teams.
 */
import type {
  Repository,
  Dependency,
  CVE,
  RefactorSuggestion,
  ExposureReport,
} from '../../types';

/** Generate the full exposure report data structure */
export function generateExposureReport(
  repository: Repository,
  dependencies: Dependency[],
  cves: CVE[],
  suggestions: RefactorSuggestion[],
): ExposureReport {
  const cvesInPath = cves.filter((c) => c.inUsagePath);
  const cvesOutside = cves.filter((c) => !c.inUsagePath);

  const unusedExports = dependencies
    .filter((d) => d.usageRatio < 1 && d.totalExports > 0)
    .map((d) => {
      const usedNames = new Set(d.usedExports.map((e) => e.name));
      return {
        packageName: d.name,
        exports: Array.from({ length: d.totalExports - d.usedExports.length }, (_, i) =>
          `unused_export_${i + 1}`,
        ),
      };
    })
    .filter((e) => e.exports.length > 0);

  const avgUsageRatio =
    dependencies.length > 0
      ? dependencies.reduce((sum, d) => sum + d.usageRatio, 0) / dependencies.length
      : 0;

  const totalDeadWeight = dependencies.reduce(
    (sum, d) => sum + d.packageSize * (1 - d.usageRatio),
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    repository,
    dependencies,
    cves,
    unusedExports,
    refactorSuggestions: suggestions,
    summary: {
      totalDependencies: dependencies.length,
      totalCVEs: cves.length,
      cvesInUsagePath: cvesInPath.length,
      cvesOutsideUsagePath: cvesOutside.length,
      averageUsageRatio: avgUsageRatio,
      totalDeadWeight,
    },
  };
}

/** Convert report to CSV rows */
export function reportToCSV(report: ExposureReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Package,Version,Dev,Usage Ratio,Used Exports,Total Exports,Size (bytes),CVE Count,CVEs In Path,Health Score');

  // Rows
  for (const dep of report.dependencies) {
    const cveCount = dep.cves.length;
    const cvesInPath = dep.cves.filter((c) => c.inUsagePath).length;
    lines.push(
      [
        csvEscape(dep.name),
        csvEscape(dep.version),
        dep.isDev ? 'true' : 'false',
        dep.usageRatio.toFixed(3),
        dep.usedExports.length.toString(),
        dep.totalExports.toString(),
        dep.packageSize.toString(),
        cveCount.toString(),
        cvesInPath.toString(),
        dep.healthScore.toString(),
      ].join(','),
    );
  }

  // CVE section
  lines.push('');
  lines.push('CVE ID,Severity,CVSS,In Usage Path,Summary,Fixed Version');
  for (const cve of report.cves) {
    lines.push(
      [
        csvEscape(cve.id),
        cve.severity,
        cve.cvssScore.toFixed(1),
        cve.inUsagePath ? 'true' : 'false',
        csvEscape(cve.summary),
        cve.fixedVersion ?? '',
      ].join(','),
    );
  }

  // Summary section
  lines.push('');
  lines.push('Summary');
  lines.push(`Total Dependencies,${report.summary.totalDependencies}`);
  lines.push(`Total CVEs,${report.summary.totalCVEs}`);
  lines.push(`CVEs In Usage Path,${report.summary.cvesInUsagePath}`);
  lines.push(`CVEs Outside Usage Path,${report.summary.cvesOutsideUsagePath}`);
  lines.push(`Average Usage Ratio,${report.summary.averageUsageRatio.toFixed(3)}`);
  lines.push(`Total Dead Weight (bytes),${Math.round(report.summary.totalDeadWeight)}`);

  return lines.join('\n');
}

/** Generate HTML for PDF rendering */
export function reportToHTML(report: ExposureReport): string {
  const { summary } = report;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DepScope Exposure Report - ${report.repository.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 8px; }
    h2 { color: #374151; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
    .stat { background: #F3F4F6; border-radius: 8px; padding: 16px; text-align: center; }
    .stat .value { font-size: 28px; font-weight: 700; }
    .stat .label { font-size: 12px; color: #6B7280; text-transform: uppercase; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #F9FAFB; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; color: #6B7280; }
    td { padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-safe { background: #D1FAE5; color: #059669; }
    .badge-danger { background: #FEE2E2; color: #DC2626; }
    .badge-warn { background: #FEF3C7; color: #D97706; }
    .footer { margin-top: 40px; font-size: 12px; color: #9CA3AF; text-align: center; }
  </style>
</head>
<body>
  <h1>DepScope Exposure Report</h1>
  <p><strong>Repository:</strong> ${report.repository.name} (${report.repository.path})</p>
  <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>

  <div class="summary">
    <div class="stat"><div class="value">${summary.totalDependencies}</div><div class="label">Dependencies</div></div>
    <div class="stat"><div class="value">${summary.totalCVEs}</div><div class="label">Total CVEs</div></div>
    <div class="stat"><div class="value" style="color: ${summary.cvesInUsagePath > 0 ? '#DC2626' : '#059669'}">${summary.cvesInUsagePath}</div><div class="label">CVEs in Usage Path</div></div>
    <div class="stat"><div class="value">${summary.cvesOutsideUsagePath}</div><div class="label">CVEs Outside Path</div></div>
    <div class="stat"><div class="value">${Math.round(summary.averageUsageRatio * 100)}%</div><div class="label">Avg Usage Ratio</div></div>
    <div class="stat"><div class="value">${formatBytesHTML(summary.totalDeadWeight)}</div><div class="label">Dead Weight</div></div>
  </div>

  <h2>Dependencies</h2>
  <table>
    <thead><tr><th>Package</th><th>Version</th><th>Usage</th><th>CVEs</th><th>Health</th></tr></thead>
    <tbody>
      ${report.dependencies.map((d) => `
        <tr>
          <td><strong>${d.name}</strong></td>
          <td><code>${d.version}</code></td>
          <td>${d.usedExports.length}/${d.totalExports} (${Math.round(d.usageRatio * 100)}%)</td>
          <td>${d.cves.length > 0
            ? d.cves.some((c) => c.inUsagePath)
              ? `<span class="badge badge-danger">${d.cves.length} (in path)</span>`
              : `<span class="badge badge-warn">${d.cves.length} (safe)</span>`
            : '<span class="badge badge-safe">None</span>'}</td>
          <td>${d.healthScore}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${report.cves.length > 0 ? `
  <h2>Vulnerabilities</h2>
  <table>
    <thead><tr><th>CVE ID</th><th>Severity</th><th>CVSS</th><th>In Path</th><th>Summary</th></tr></thead>
    <tbody>
      ${report.cves.map((c) => `
        <tr>
          <td><code>${c.id}</code></td>
          <td>${c.severity}</td>
          <td>${c.cvssScore.toFixed(1)}</td>
          <td>${c.inUsagePath
            ? '<span class="badge badge-danger">YES</span>'
            : '<span class="badge badge-safe">NO</span>'}</td>
          <td>${c.summary}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="footer">
    Generated by DepScope &mdash; Usage-level Dependency Intelligence
  </div>
</body>
</html>`;
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatBytesHTML(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
