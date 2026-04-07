/**
 * Monorepo Detector — Identifies monorepo structures and discovers
 * workspace roots for multi-package repositories.
 */

export interface MonorepoInfo {
  isMonorepo: boolean;
  tool: 'npm' | 'yarn' | 'pnpm' | 'lerna' | 'nx' | 'turborepo' | 'none';
  workspaceRoots: string[];
}

/**
 * Detect monorepo configuration from package.json and config files.
 */
export async function detectMonorepo(
  repoPath: string,
  readFile: (path: string) => Promise<string>,
  fileExists: (path: string) => Promise<boolean>,
): Promise<MonorepoInfo> {
  const result: MonorepoInfo = {
    isMonorepo: false,
    tool: 'none',
    workspaceRoots: [],
  };

  try {
    // Check package.json workspaces (npm/yarn)
    const pkgContent = await readFile(`${repoPath}/package.json`);
    const pkg = JSON.parse(pkgContent);

    if (pkg.workspaces) {
      result.isMonorepo = true;
      result.tool = 'npm';
      const patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces.packages || [];
      result.workspaceRoots = patterns;
    }
  } catch {}

  // Check for pnpm-workspace.yaml
  try {
    if (await fileExists(`${repoPath}/pnpm-workspace.yaml`)) {
      result.isMonorepo = true;
      result.tool = 'pnpm';
      const content = await readFile(`${repoPath}/pnpm-workspace.yaml`);
      // Simple YAML parsing for packages field
      const match = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (match) {
        result.workspaceRoots = match[1]
          .split('\n')
          .map((l) => l.replace(/^\s+-\s+['"]?/, '').replace(/['"]?\s*$/, ''))
          .filter(Boolean);
      }
    }
  } catch {}

  // Check for lerna.json
  try {
    if (await fileExists(`${repoPath}/lerna.json`)) {
      const content = await readFile(`${repoPath}/lerna.json`);
      const lerna = JSON.parse(content);
      if (!result.isMonorepo) {
        result.isMonorepo = true;
        result.tool = 'lerna';
        result.workspaceRoots = lerna.packages || ['packages/*'];
      }
    }
  } catch {}

  // Check for nx.json
  try {
    if (await fileExists(`${repoPath}/nx.json`)) {
      if (!result.isMonorepo) {
        result.isMonorepo = true;
        result.tool = 'nx';
      }
    }
  } catch {}

  // Check for turbo.json
  try {
    if (await fileExists(`${repoPath}/turbo.json`)) {
      if (!result.isMonorepo) {
        result.isMonorepo = true;
        result.tool = 'turborepo';
      }
    }
  } catch {}

  return result;
}

/**
 * Detect the package manager used by the repository.
 */
export async function detectPackageManager(
  repoPath: string,
  fileExists: (path: string) => Promise<boolean>,
): Promise<'npm' | 'yarn' | 'pnpm' | 'unknown'> {
  try {
    if (await fileExists(`${repoPath}/pnpm-lock.yaml`)) return 'pnpm';
    if (await fileExists(`${repoPath}/yarn.lock`)) return 'yarn';
    if (await fileExists(`${repoPath}/package-lock.json`)) return 'npm';
  } catch {}
  return 'unknown';
}
