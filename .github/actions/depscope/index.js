/**
 * DepScope GitHub Action
 *
 * Analyzes a repository and optionally posts a PR comment with results.
 */
const https = require('https');

// ---------------------------------------------------------------------------
// Minimal GitHub Actions toolkit (no dependencies needed)
// ---------------------------------------------------------------------------
function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function setOutput(name, value) {
  const delimiter = `ghadelimiter_${Date.now()}`;
  const cmd = `${name}<<${delimiter}\n${value}\n${delimiter}`;
  require('fs').appendFileSync(process.env.GITHUB_OUTPUT || '/dev/null', cmd + '\n');
}

function setFailed(msg) {
  console.log(`::error::${msg}`);
  process.exitCode = 1;
}

function warning(msg) {
  console.log(`::warning::${msg}`);
}

function info(msg) {
  console.log(msg);
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
function analyze(owner, repo, apiUrl, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ owner, repo, token: token || undefined });
    const url = new URL(`${apiUrl}/api/analyze`);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch { reject(new Error('Invalid API response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Analysis timed out')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// PR Comment
// ---------------------------------------------------------------------------
function postComment(token, owner, repo, prNumber, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ body });
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `token ${token}`,
        'User-Agent': 'DepScope-Action',
        Accept: 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(d));
        else reject(new Error(`Comment failed: ${res.statusCode} ${d.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Format comment
// ---------------------------------------------------------------------------
function formatComment(result) {
  const r = result.repository;
  const deps = result.dependencies;
  const cves = result.cves;
  const inPath = cves.filter(c => c.inUsagePath);
  const ecosystems = r.ecosystems?.join(', ') || r.ecosystem;

  const grade = r.healthScore >= 90 ? 'A' : r.healthScore >= 80 ? 'B' : r.healthScore >= 70 ? 'C' : r.healthScore >= 60 ? 'D' : 'F';
  const gradeEmoji = grade === 'A' ? '🟢' : grade === 'B' ? '🟢' : grade === 'C' ? '🟡' : grade === 'D' ? '🟠' : '🔴';

  let md = `## ${gradeEmoji} DepScope Analysis — ${grade} (${r.healthScore}/100)\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| **Repository** | \`${r.owner}/${r.name}\` (${r.branch}) |\n`;
  md += `| **Ecosystems** | ${ecosystems} |\n`;
  md += `| **Dependencies** | ${r.dependencyCount} (${deps.filter(d => !d.isDev).length} prod, ${deps.filter(d => d.isDev).length} dev) |\n`;
  md += `| **Files Analyzed** | ${r.fileCount} |\n`;
  md += `| **Vulnerabilities** | ${cves.length}${inPath.length > 0 ? ` (**${inPath.length} in usage path!**)` : ''} |\n\n`;

  // CVE table
  if (cves.length > 0) {
    md += `### Vulnerabilities\n\n`;
    md += `| CVE | Severity | Package | In Usage Path | Fix |\n|---|---|---|---|---|\n`;
    const sorted = [...cves].sort((a, b) => b.cvssScore - a.cvssScore);
    for (const cve of sorted.slice(0, 20)) {
      const pkg = deps.find(d => d.cves.some(c => c.id === cve.id))?.name || '?';
      const inP = cve.inUsagePath ? '**YES**' : 'No';
      const fix = cve.fixedVersion ? `\`${cve.fixedVersion}\`` : '-';
      md += `| ${cve.id} | ${cve.severity} | ${pkg} | ${inP} | ${fix} |\n`;
    }
    if (cves.length > 20) md += `\n*...and ${cves.length - 20} more*\n`;
    md += '\n';
  }

  // Low-usage deps
  const lowUsage = deps.filter(d => !d.isDev && d.usageRatio < 0.1 && d.usageRatio > 0);
  if (lowUsage.length > 0) {
    md += `### Low Usage Dependencies\n\n`;
    md += `| Package | Usage | Health |\n|---|---|---|\n`;
    for (const d of lowUsage.slice(0, 10)) {
      md += `| ${d.name}@${d.version} | ${Math.round(d.usageRatio * 100)}% | ${d.healthScore} |\n`;
    }
    md += '\n';
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    md += `### Suggestions\n\n`;
    for (const s of result.suggestions.slice(0, 5)) {
      const icon = s.type === 'replace_package' ? '🔄' : s.type === 'inline_code' ? '📝' : '✂️';
      md += `- ${icon} **${s.packageName}**: ${s.reason}`;
      if (s.alternative) md += ` → *${s.alternative}*`;
      md += '\n';
    }
    md += '\n';
  }

  md += `---\n*Analyzed by [DepScope](https://github.com/Faze789/Devscope) — usage-level dependency intelligence*`;
  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const repoInput = getInput('repo') || process.env.GITHUB_REPOSITORY || '';
  const token = getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const apiUrl = getInput('api-url') || 'https://depscope-lyart.vercel.app';
  const failOnCVE = getInput('fail-on-cve') === 'true';
  const commentOnPR = getInput('comment-on-pr') !== 'false';

  const parts = repoInput.split('/');
  if (parts.length < 2) {
    setFailed('Invalid repo format. Expected owner/repo.');
    return;
  }
  const owner = parts[0];
  const repo = parts[1];

  info(`DepScope: Analyzing ${owner}/${repo}...`);

  try {
    const result = await analyze(owner, repo, apiUrl, token);
    const cves = result.cves;
    const inPath = cves.filter(c => c.inUsagePath);

    // Set outputs
    setOutput('health-score', String(result.repository.healthScore));
    setOutput('dependency-count', String(result.repository.dependencyCount));
    setOutput('cve-count', String(cves.length));
    setOutput('cves-in-path', String(inPath.length));
    setOutput('ecosystems', result.repository.ecosystems?.join(',') || result.repository.ecosystem);
    setOutput('json', JSON.stringify(result));

    info(`Health: ${result.repository.healthScore}/100`);
    info(`Dependencies: ${result.repository.dependencyCount}`);
    info(`CVEs: ${cves.length} (${inPath.length} in usage path)`);
    info(`Ecosystems: ${result.repository.ecosystems?.join(', ') || result.repository.ecosystem}`);

    // Post PR comment
    if (commentOnPR && process.env.GITHUB_EVENT_NAME === 'pull_request' && token) {
      try {
        const eventPath = process.env.GITHUB_EVENT_PATH;
        if (eventPath) {
          const event = JSON.parse(require('fs').readFileSync(eventPath, 'utf-8'));
          const prNumber = event.pull_request?.number;
          if (prNumber) {
            const comment = formatComment(result);
            await postComment(token, owner, repo, prNumber, comment);
            info(`Posted analysis comment on PR #${prNumber}`);
          }
        }
      } catch (err) {
        warning(`Failed to post PR comment: ${err.message}`);
      }
    }

    // Fail if configured and CVEs in path
    if (failOnCVE && inPath.length > 0) {
      setFailed(`${inPath.length} CVE(s) found in usage path.`);
    }

    // Annotations for CVEs
    for (const cve of inPath.slice(0, 10)) {
      const pkg = result.dependencies.find(d => d.cves.some(c => c.id === cve.id))?.name || 'unknown';
      console.log(`::error title=${cve.id} [${cve.severity}]::${pkg}: ${cve.summary}${cve.fixedVersion ? ' (fix: ' + cve.fixedVersion + ')' : ''}`);
    }

  } catch (err) {
    setFailed(`DepScope analysis failed: ${err.message}`);
  }
}

run();
