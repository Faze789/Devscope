/**
 * GitHub API client — fetches repo file tree and contents.
 */

const GITHUB_API = 'https://api.github.com';

interface GitTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitTreeResponse {
  sha: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

export interface RepoFile {
  path: string;
  content: string;
  size: number;
}

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DART_EXTENSIONS = ['.dart'];
const PYTHON_EXTENSIONS = ['.py'];
const ALL_SOURCE_EXTENSIONS = [...JS_EXTENSIONS, ...DART_EXTENSIONS, ...PYTHON_EXTENSIONS];
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__tests__', 'test', 'tests', '.dart_tool', '.pub-cache'];

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'DepScope-Analyzer',
  };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

/** Get the default branch for a repo */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string,
): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.default_branch;
}

/** Fetch the full file tree recursively */
export async function getFileTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<GitTreeItem[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new Error(`GitHub tree API error ${res.status}: ${await res.text()}`);
  const data: GitTreeResponse = await res.json();
  return data.tree;
}

/** Filter tree to only source files worth analyzing */
export function filterSourceFiles(tree: GitTreeItem[], extensions?: string[]): GitTreeItem[] {
  const exts = extensions ?? ALL_SOURCE_EXTENSIONS;
  return tree.filter((item) => {
    if (item.type !== 'blob') return false;
    const ext = '.' + item.path.split('.').pop();
    if (!exts.includes(ext)) return false;
    const parts = item.path.split('/');
    for (const dir of parts.slice(0, -1)) {
      if (SKIP_DIRS.includes(dir) || dir.startsWith('.')) return false;
    }
    return true;
  });
}

export type ProjectType = 'node' | 'dart' | 'python' | 'unknown';

/** Detect project type from files in tree root */
export function detectProjectType(tree: GitTreeItem[]): ProjectType {
  const rootFiles = new Set(tree.filter(i => !i.path.includes('/')).map(i => i.path));
  if (rootFiles.has('package.json')) return 'node';
  if (rootFiles.has('pubspec.yaml')) return 'dart';
  if (rootFiles.has('requirements.txt') || rootFiles.has('pyproject.toml') || rootFiles.has('setup.py')) return 'python';
  return 'unknown';
}

/** Parse pubspec.yaml to extract dependencies (simple YAML parser — no npm deps needed) */
export function parsePubspecYaml(content: string): {
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const result = { name: '', dependencies: {} as Record<string, string>, devDependencies: {} as Record<string, string> };

  const lines = content.split('\n');
  let section: 'none' | 'deps' | 'dev_deps' = 'none';
  let prevIndent = 0;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level keys
    if (indent === 0) {
      if (trimmed.startsWith('name:')) {
        result.name = trimmed.split(':')[1]?.trim().replace(/['"]/g, '') ?? '';
      } else if (trimmed === 'dependencies:') {
        section = 'deps';
        prevIndent = indent;
      } else if (trimmed === 'dev_dependencies:') {
        section = 'dev_deps';
        prevIndent = indent;
      } else {
        section = 'none';
      }
      continue;
    }

    // Dependency entries (indent level 2)
    if ((section === 'deps' || section === 'dev_deps') && indent === 2) {
      const depMatch = trimmed.match(/^(\S+):\s*(.*)/);
      if (depMatch) {
        const depName = depMatch[1];
        let version = depMatch[2]?.trim().replace(/['"]/g, '') || 'any';

        // Skip SDK deps and path/git deps
        if (version === '' || depName === 'flutter' || depName === 'flutter_test' || depName === 'flutter_lints') continue;

        const target = section === 'deps' ? result.dependencies : result.devDependencies;
        target[depName] = version.startsWith('^') ? version.slice(1) : version;
      }
    }
  }

  return result;
}

/** Fetch the content of a single file */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token?: string,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: headers(token) },
  );
  if (!res.ok) return '';
  const data = await res.json();
  if (data.encoding === 'base64' && data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return '';
}

/** Fetch multiple files in parallel with concurrency limit */
export async function getFilesContent(
  owner: string,
  repo: string,
  paths: string[],
  branch: string,
  token?: string,
  concurrency: number = 10,
): Promise<RepoFile[]> {
  const results: RepoFile[] = [];
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        const content = await getFileContent(owner, repo, path, branch, token);
        return { path, content, size: content.length };
      }),
    );
    results.push(...batchResults.filter((f) => f.content.length > 0));
  }
  return results;
}

/** Fetch package.json from the repo */
export async function getPackageJson(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<Record<string, any> | null> {
  const content = await getFileContent(owner, repo, 'package.json', branch, token);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Get package size from npm registry */
export async function getNpmPackageInfo(
  packageName: string,
): Promise<{ size: number; exports: number; latestVersion: string } | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      size: data.dist?.unpackedSize ?? 0,
      exports: 0, // Will be estimated from usage
      latestVersion: data.version ?? '',
    };
  } catch {
    return null;
  }
}
