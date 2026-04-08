#!/usr/bin/env node
/**
 * DepScope CLI — Usage-level dependency intelligence from your terminal.
 *
 * Usage:
 *   npx depscope-cli facebook/react
 *   npx depscope-cli https://github.com/pallets/flask
 *   depscope facebook/react --token ghp_xxx
 *   depscope . (auto-detect from git remote)
 */

const https = require('https');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = 'https://depscope-lyart.vercel.app';
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let repoArg = null;
let token = process.env.GITHUB_TOKEN || null;
let showHelp = false;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') showHelp = true;
  else if (arg === '--json') jsonOutput = true;
  else if ((arg === '--token' || arg === '-t') && args[i + 1]) { token = args[++i]; }
  else if (!arg.startsWith('-')) repoArg = arg;
}

if (showHelp || (!repoArg && !detectFromGit())) {
  console.log(`
${COLORS.bold}${COLORS.cyan}DepScope${COLORS.reset} — Usage-level dependency intelligence

${COLORS.bold}USAGE${COLORS.reset}
  depscope <owner/repo>              Analyze a GitHub repository
  depscope <github-url>              Analyze from full URL
  depscope .                         Auto-detect from git remote

${COLORS.bold}OPTIONS${COLORS.reset}
  --token, -t <token>   GitHub token (or set GITHUB_TOKEN env var)
  --json                Output raw JSON
  --help, -h            Show this help

${COLORS.bold}EXAMPLES${COLORS.reset}
  depscope facebook/react
  depscope https://github.com/pallets/flask
  depscope . --token ghp_abc123
  npx depscope-cli rust-lang/cargo --json

${COLORS.bold}SUPPORTED ECOSYSTEMS${COLORS.reset}
  Node.js, Python, Dart, Ruby, PHP, Java/Kotlin,
  Go, Rust, Swift, .NET/C#, C/C++
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Parse input
// ---------------------------------------------------------------------------
function parseInput(input) {
  if (input === '.') return detectFromGit();
  const urlMatch = input.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace('.git', '') };
  const slashMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };
  return null;
}

function detectFromGit() {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    return parseInput(remote);
  } catch {
    return null;
  }
}

const parsed = parseInput(repoArg);
if (!parsed) {
  console.error(`${COLORS.red}Error: Invalid repository. Use owner/repo or a GitHub URL.${COLORS.reset}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
function analyze(owner, repo) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ owner, repo, token: token || undefined });
    const url = new URL(`${API_BASE}/api/analyze`);
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
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function healthGrade(score) {
  if (score >= 90) return `${COLORS.green}A${COLORS.reset}`;
  if (score >= 80) return `${COLORS.green}B${COLORS.reset}`;
  if (score >= 70) return `${COLORS.yellow}C${COLORS.reset}`;
  if (score >= 60) return `${COLORS.yellow}D${COLORS.reset}`;
  return `${COLORS.red}F${COLORS.reset}`;
}

function severityColor(sev) {
  if (sev === 'CRITICAL') return `${COLORS.bgRed}${COLORS.white} CRIT ${COLORS.reset}`;
  if (sev === 'HIGH') return `${COLORS.red} HIGH ${COLORS.reset}`;
  if (sev === 'MEDIUM') return `${COLORS.yellow} MED  ${COLORS.reset}`;
  if (sev === 'LOW') return `${COLORS.dim} LOW  ${COLORS.reset}`;
  return `${COLORS.dim} UNK  ${COLORS.reset}`;
}

function bar(ratio, width = 20) {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const color = ratio >= 0.5 ? COLORS.green : ratio >= 0.2 ? COLORS.yellow : COLORS.red;
  return `${color}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset} ${Math.round(ratio * 100)}%`;
}

function pad(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(result) {
  const r = result.repository;
  const deps = result.dependencies;
  const cves = result.cves;
  const suggestions = result.suggestions;
  const ecosystems = r.ecosystems?.join(', ') || r.ecosystem;
  const inPathCVEs = cves.filter(c => c.inUsagePath);

  console.log();
  console.log(`${COLORS.bold}${COLORS.cyan}  DepScope Analysis${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${'─'.repeat(55)}${COLORS.reset}`);
  console.log(`  ${COLORS.bold}Repository${COLORS.reset}   ${r.owner}/${r.name} (${r.branch})`);
  console.log(`  ${COLORS.bold}Ecosystems${COLORS.reset}   ${ecosystems}`);
  console.log(`  ${COLORS.bold}Health${COLORS.reset}       ${healthGrade(r.healthScore)} ${COLORS.dim}(${r.healthScore}/100)${COLORS.reset}`);
  console.log(`  ${COLORS.bold}Dependencies${COLORS.reset} ${r.dependencyCount}`);
  console.log(`  ${COLORS.bold}Files${COLORS.reset}        ${r.fileCount} analyzed`);
  console.log(`  ${COLORS.bold}CVEs${COLORS.reset}         ${cves.length}${inPathCVEs.length > 0 ? ` ${COLORS.red}(${inPathCVEs.length} in usage path!)${COLORS.reset}` : ''}`);

  // Dependencies table
  const prodDeps = deps.filter(d => !d.isDev).sort((a, b) => a.healthScore - b.healthScore);
  const devDeps = deps.filter(d => d.isDev);

  if (prodDeps.length > 0) {
    console.log();
    console.log(`${COLORS.bold}  Production Dependencies (${prodDeps.length})${COLORS.reset}`);
    console.log(`${COLORS.dim}  ${'─'.repeat(55)}${COLORS.reset}`);
    for (const d of prodDeps.slice(0, 30)) {
      const name = pad(`  ${d.name}@${d.version}`, 40);
      const grade = healthGrade(d.healthScore);
      const usage = bar(d.usageRatio, 10);
      const cveTag = d.cves.length > 0
        ? ` ${COLORS.red}${d.cves.length} CVE${d.cves.length > 1 ? 's' : ''}${COLORS.reset}`
        : '';
      console.log(`${name} ${grade} ${usage}${cveTag}`);
    }
    if (prodDeps.length > 30) {
      console.log(`${COLORS.dim}  ... and ${prodDeps.length - 30} more${COLORS.reset}`);
    }
  }

  if (devDeps.length > 0) {
    console.log();
    console.log(`${COLORS.dim}  Dev Dependencies: ${devDeps.length} (not shown — use --json for full data)${COLORS.reset}`);
  }

  // CVEs
  if (cves.length > 0) {
    console.log();
    console.log(`${COLORS.bold}${COLORS.red}  Vulnerabilities (${cves.length})${COLORS.reset}`);
    console.log(`${COLORS.dim}  ${'─'.repeat(55)}${COLORS.reset}`);
    const sorted = [...cves].sort((a, b) => {
      if (a.inUsagePath !== b.inUsagePath) return a.inUsagePath ? -1 : 1;
      return b.cvssScore - a.cvssScore;
    });
    for (const cve of sorted.slice(0, 15)) {
      const inPath = cve.inUsagePath
        ? `${COLORS.bgRed}${COLORS.white} IN PATH ${COLORS.reset}`
        : `${COLORS.dim}not in path${COLORS.reset}`;
      console.log(`  ${severityColor(cve.severity)} ${COLORS.bold}${cve.id}${COLORS.reset} ${inPath}`);
      console.log(`    ${COLORS.dim}${(cve.summary || '').slice(0, 70)}${COLORS.reset}`);
      if (cve.fixedVersion) {
        console.log(`    ${COLORS.green}Fix: upgrade to ${cve.fixedVersion}${COLORS.reset}`);
      }
    }
    if (cves.length > 15) {
      console.log(`${COLORS.dim}  ... and ${cves.length - 15} more${COLORS.reset}`);
    }
  }

  // Suggestions
  if (suggestions.length > 0) {
    console.log();
    console.log(`${COLORS.bold}${COLORS.blue}  Suggestions (${suggestions.length})${COLORS.reset}`);
    console.log(`${COLORS.dim}  ${'─'.repeat(55)}${COLORS.reset}`);
    for (const s of suggestions.slice(0, 5)) {
      const icon = s.type === 'replace_package' ? '↔' : s.type === 'inline_code' ? '⟨⟩' : '✂';
      console.log(`  ${icon} ${COLORS.bold}${s.packageName}${COLORS.reset}: ${s.reason.slice(0, 60)}`);
      if (s.alternative) {
        console.log(`    ${COLORS.green}→ ${s.alternative}${COLORS.reset}`);
      }
    }
  }

  // Warnings
  if (result.errors.length > 0) {
    console.log();
    console.log(`${COLORS.dim}  Warnings: ${result.errors.join('; ')}${COLORS.reset}`);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const { owner, repo } = parsed;
  process.stdout.write(`\n${COLORS.dim}  Analyzing ${owner}/${repo}...${COLORS.reset}`);

  try {
    const result = await analyze(owner, repo);
    process.stdout.write('\r' + ' '.repeat(60) + '\r'); // Clear loading line

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      render(result);
    }
    process.exit(result.cves.some(c => c.inUsagePath) ? 1 : 0);
  } catch (err) {
    console.error(`\n${COLORS.red}  Error: ${err.message}${COLORS.reset}\n`);
    process.exit(2);
  }
})();
