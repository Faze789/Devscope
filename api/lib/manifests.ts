/**
 * Manifest parsers for all supported ecosystems.
 *
 * Each parser extracts dependency names and versions from the ecosystem's
 * manifest file format. Parsers are pure functions: string in, deps out.
 * They never throw — parse failures return empty results.
 */

export interface ManifestResult {
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

const EMPTY: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

// ---------------------------------------------------------------------------
// Node.js — package.json
// ---------------------------------------------------------------------------
export function parsePackageJson(content: string): ManifestResult {
  try {
    const pkg = JSON.parse(content);
    return {
      name: pkg.name ?? '',
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

// ---------------------------------------------------------------------------
// Dart / Flutter — pubspec.yaml (custom parser, no YAML lib)
// ---------------------------------------------------------------------------
export function parsePubspecYaml(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let section: 'none' | 'deps' | 'dev_deps' = 'none';

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      if (trimmed.startsWith('name:')) {
        result.name = trimmed.split(':')[1]?.trim().replace(/['"]/g, '') ?? '';
      } else if (trimmed === 'dependencies:') {
        section = 'deps';
      } else if (trimmed === 'dev_dependencies:') {
        section = 'dev_deps';
      } else {
        section = 'none';
      }
      continue;
    }

    if ((section === 'deps' || section === 'dev_deps') && indent === 2) {
      const inner = trimmed.trimStart();
      const depMatch = inner.match(/^(\S+):\s*(.*)/);
      if (depMatch) {
        const depName = depMatch[1];
        let version = depMatch[2]?.trim().replace(/['"]/g, '') || '';
        if (version === '' || depName === 'flutter' || depName === 'flutter_test' || depName === 'flutter_lints') continue;
        const target = section === 'deps' ? result.dependencies : result.devDependencies;
        target[depName] = version.startsWith('^') ? version.slice(1) : version;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Python — requirements.txt
// ---------------------------------------------------------------------------
export function parseRequirementsTxt(content: string): ManifestResult {
  const deps: Record<string, string> = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    // Handle: package==1.0, package>=1.0, package~=1.0, package[extra]==1.0
    const match = line.match(/^([a-zA-Z0-9_.-]+)(?:\[.*?\])?\s*(?:[=~!><]+\s*(.+?))?$/);
    if (match) deps[match[1]] = match[2]?.split(',')[0]?.trim() ?? '*';
  }
  return { name: '', dependencies: deps, devDependencies: {} };
}

// ---------------------------------------------------------------------------
// Python — pyproject.toml (basic TOML parser)
// ---------------------------------------------------------------------------
export function parsePyprojectToml(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let section = '';

  for (const raw of lines) {
    const line = raw.trim();

    // Track sections
    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }

    // Project name
    if (section === 'project' && line.startsWith('name')) {
      const val = line.split('=')[1]?.trim().replace(/["']/g, '');
      if (val) result.name = val;
      continue;
    }

    // [project] dependencies = ["pkg>=1.0", ...]
    if (section === 'project' && line.startsWith('dependencies')) {
      const inlineDeps = extractTomlArrayInline(line);
      for (const d of inlineDeps) parsePepDep(d, result.dependencies);
      // Multi-line array
      if (line.includes('[') && !line.includes(']')) {
        for (let i = lines.indexOf(raw) + 1; i < lines.length; i++) {
          const l = lines[i].trim();
          if (l === ']') break;
          parsePepDep(l.replace(/[",]/g, '').trim(), result.dependencies);
        }
      }
      continue;
    }

    // [project.optional-dependencies] dev = [...]
    if (section === 'project.optional-dependencies') {
      const inlineDeps = extractTomlArrayInline(line);
      for (const d of inlineDeps) parsePepDep(d, result.devDependencies);
    }
  }
  return result;
}

function extractTomlArrayInline(line: string): string[] {
  const match = line.match(/\[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(Boolean);
}

function parsePepDep(spec: string, target: Record<string, string>) {
  if (!spec) return;
  const m = spec.match(/^([a-zA-Z0-9_.-]+)(?:\[.*?\])?\s*(?:[=~!><]+\s*(.+?))?$/);
  if (m) target[m[1]] = m[2]?.split(',')[0]?.trim() ?? '*';
}

// ---------------------------------------------------------------------------
// Python — Pipfile (TOML-like)
// ---------------------------------------------------------------------------
export function parsePipfile(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let section = '';

  for (const raw of lines) {
    const line = raw.trim();
    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    if (!line || line.startsWith('#')) continue;

    const target = section === 'packages' ? result.dependencies
                 : section === 'dev-packages' ? result.devDependencies
                 : null;
    if (!target) continue;

    const depMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*"?([^"]*)"?/);
    if (depMatch) {
      const version = depMatch[2] === '*' ? '*' : depMatch[2].replace(/[=~><]/g, '');
      target[depMatch[1]] = version;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ruby — Gemfile
// ---------------------------------------------------------------------------
export function parseGemfile(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  let inDevGroup = false;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.match(/^group\s.*:development/)) { inDevGroup = true; continue; }
    if (line.match(/^group\s/) && !line.includes(':development')) { inDevGroup = false; continue; }
    if (line === 'end') { inDevGroup = false; continue; }

    const gemMatch = line.match(/^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
    if (gemMatch) {
      const target = inDevGroup ? result.devDependencies : result.dependencies;
      target[gemMatch[1]] = gemMatch[2]?.replace(/[~>=<\s]/g, '') ?? '*';
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// PHP — composer.json
// ---------------------------------------------------------------------------
export function parseComposerJson(content: string): ManifestResult {
  try {
    const pkg = JSON.parse(content);
    return {
      name: pkg.name ?? '',
      dependencies: pkg.require ?? {},
      devDependencies: pkg['require-dev'] ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

// ---------------------------------------------------------------------------
// Java / Kotlin — pom.xml (regex-based)
// ---------------------------------------------------------------------------
export function parsePomXml(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  // Project name from artifactId (first occurrence before <dependencies>)
  const artifactMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
  if (artifactMatch) result.name = artifactMatch[1];

  // Extract dependencies
  const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?(?:\s*<scope>([^<]+)<\/scope>)?/gs;
  let match;
  while ((match = depRegex.exec(content)) !== null) {
    const name = `${match[1]}:${match[2]}`;
    const version = match[3] ?? '*';
    const scope = match[4] ?? 'compile';
    const target = scope === 'test' ? result.devDependencies : result.dependencies;
    target[name] = version;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Java / Kotlin — build.gradle / build.gradle.kts
// ---------------------------------------------------------------------------
export function parseBuildGradle(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  // Configurations that are "dev" (test-only)
  const devConfigs = ['testImplementation', 'testCompileOnly', 'testRuntimeOnly', 'androidTestImplementation'];

  // Pattern: implementation 'group:artifact:version' or implementation("group:artifact:version")
  const depRegex = /(\w+)\s*[\(]?\s*['"]([^'"]+:[^'"]+(?::[^'"]+)?)['"]\s*\)?/g;
  let match;
  while ((match = depRegex.exec(content)) !== null) {
    const config = match[1];
    const coords = match[2];
    const parts = coords.split(':');
    if (parts.length < 2) continue;
    const name = `${parts[0]}:${parts[1]}`;
    const version = parts[2] ?? '*';
    const target = devConfigs.includes(config) ? result.devDependencies : result.dependencies;
    target[name] = version;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Go — go.mod
// ---------------------------------------------------------------------------
export function parseGoMod(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let inRequire = false;

  for (const raw of lines) {
    const line = raw.trim();

    // Module name
    const modMatch = line.match(/^module\s+(\S+)/);
    if (modMatch) { result.name = modMatch[1]; continue; }

    if (line === 'require (') { inRequire = true; continue; }
    if (line === ')') { inRequire = false; continue; }

    // Single-line require
    const singleMatch = line.match(/^require\s+(\S+)\s+(\S+)/);
    if (singleMatch) {
      result.dependencies[singleMatch[1]] = singleMatch[2];
      continue;
    }

    // Inside require block
    if (inRequire) {
      const reqMatch = line.match(/^(\S+)\s+(\S+)/);
      if (reqMatch && !reqMatch[1].startsWith('//')) {
        const indirect = line.includes('// indirect');
        const target = indirect ? result.devDependencies : result.dependencies;
        target[reqMatch[1]] = reqMatch[2];
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rust — Cargo.toml
// ---------------------------------------------------------------------------
export function parseCargoToml(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let section = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[(.+?)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }

    if (section === 'package' && line.startsWith('name')) {
      result.name = line.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
      continue;
    }

    const target = section === 'dependencies' ? result.dependencies
                 : section === 'dev-dependencies' ? result.devDependencies
                 : section.startsWith('dependencies.') ? result.dependencies
                 : section.startsWith('dev-dependencies.') ? result.devDependencies
                 : null;
    if (!target) continue;

    // name = "version" or name = { version = "x" }
    const simpleMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (simpleMatch) {
      target[simpleMatch[1]] = simpleMatch[2];
      continue;
    }
    // Inline table: name = { version = "x", ... }
    const tableMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);
    if (tableMatch) {
      target[tableMatch[1]] = tableMatch[2];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Swift — Package.swift (regex-based)
// ---------------------------------------------------------------------------
export function parsePackageSwift(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  // Name
  const nameMatch = content.match(/name:\s*"([^"]+)"/);
  if (nameMatch) result.name = nameMatch[1];

  // .package(url: "https://github.com/owner/repo", from: "1.0.0")
  const pkgRegex = /\.package\(\s*url:\s*"([^"]+)".*?(?:from:\s*"([^"]+)"|exact:\s*"([^"]+)"|\.upToNextMajor\(from:\s*"([^"]+)"\))/g;
  let match;
  while ((match = pkgRegex.exec(content)) !== null) {
    const url = match[1];
    const version = match[2] ?? match[3] ?? match[4] ?? '*';
    // Extract package name from URL
    const name = url.split('/').pop()?.replace('.git', '') ?? url;
    result.dependencies[name] = version;
  }
  return result;
}

// ---------------------------------------------------------------------------
// iOS — Podfile
// ---------------------------------------------------------------------------
export function parsePodfile(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const podMatch = line.match(/^\s*pod\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
    if (podMatch) {
      result.dependencies[podMatch[1]] = podMatch[2]?.replace(/[~>=<\s]/g, '') ?? '*';
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// .NET / C# — .csproj / .fsproj / .vbproj (XML)
// ---------------------------------------------------------------------------
export function parseCsproj(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  // <PackageReference Include="Name" Version="1.0" />
  const pkgRegex = /<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/gi;
  let match;
  while ((match = pkgRegex.exec(content)) !== null) {
    result.dependencies[match[1]] = match[2] ?? '*';
  }

  // Also handle packages.config format
  // <package id="Name" version="1.0" />
  const configRegex = /<package\s+id="([^"]+)"\s+version="([^"]+)"/gi;
  while ((match = configRegex.exec(content)) !== null) {
    result.dependencies[match[1]] = match[2];
  }

  return result;
}

// ---------------------------------------------------------------------------
// C / C++ — CMakeLists.txt
// ---------------------------------------------------------------------------
export function parseCMakeLists(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };

  // project(name ...)
  const projMatch = content.match(/project\s*\(\s*([A-Za-z0-9_-]+)/);
  if (projMatch) result.name = projMatch[1];

  // find_package(Name [version] ...)
  const findRegex = /find_package\s*\(\s*(\S+)(?:\s+(\d[\d.]*))?/g;
  let match;
  while ((match = findRegex.exec(content)) !== null) {
    result.dependencies[match[1]] = match[2] ?? '*';
  }

  // FetchContent_Declare(name GIT_REPOSITORY url GIT_TAG tag)
  const fetchRegex = /FetchContent_Declare\s*\(\s*(\S+)[\s\S]*?GIT_TAG\s+(\S+)/g;
  while ((match = fetchRegex.exec(content)) !== null) {
    result.dependencies[match[1]] = match[2];
  }

  return result;
}

// ---------------------------------------------------------------------------
// C / C++ — conanfile.txt
// ---------------------------------------------------------------------------
export function parseConanfile(content: string): ManifestResult {
  const result: ManifestResult = { name: '', dependencies: {}, devDependencies: {} };
  const lines = content.split('\n');
  let inRequires = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '[requires]') { inRequires = true; continue; }
    if (line.startsWith('[')) { inRequires = false; continue; }
    if (!inRequires || !line) continue;

    // fmt/10.0.0
    const match = line.match(/^([a-zA-Z0-9_.-]+)\/(.+)/);
    if (match) result.dependencies[match[1]] = match[2];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ecosystem → Manifest mapping
// ---------------------------------------------------------------------------
export type Ecosystem =
  | 'npm' | 'pub' | 'pypi' | 'rubygems' | 'packagist'
  | 'maven' | 'go' | 'crates.io' | 'nuget' | 'swifturl'
  | 'cocoapods' | 'conancenter' | 'unknown';

/** OSV ecosystem identifiers (case-sensitive as required by OSV API) */
export const OSV_ECOSYSTEM: Record<Ecosystem, string> = {
  npm: 'npm',
  pub: 'Pub',
  pypi: 'PyPI',
  rubygems: 'RubyGems',
  packagist: 'Packagist',
  maven: 'Maven',
  go: 'Go',
  'crates.io': 'crates.io',
  nuget: 'NuGet',
  swifturl: 'SwiftURL',
  cocoapods: 'CocoaPods',
  conancenter: 'ConanCenter',
  unknown: '',
};

/** Source file extensions per ecosystem for import parsing */
export const SOURCE_EXTENSIONS: Record<Ecosystem, string[]> = {
  npm: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  pub: ['.dart'],
  pypi: ['.py'],
  rubygems: ['.rb'],
  packagist: ['.php'],
  maven: ['.java', '.kt', '.kts'],
  go: ['.go'],
  'crates.io': ['.rs'],
  nuget: ['.cs', '.fs', '.vb'],
  swifturl: ['.swift'],
  cocoapods: ['.swift', '.m', '.mm'],
  conancenter: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
  unknown: [],
};

export interface EcosystemDetection {
  ecosystem: Ecosystem;
  manifestFile: string;
  manifestContent?: string;
  parsed: ManifestResult;
}

/** Map of manifest file → { ecosystem, parser } */
export const MANIFEST_MAP: Record<string, { ecosystem: Ecosystem; parser: (content: string) => ManifestResult }> = {
  'package.json': { ecosystem: 'npm', parser: parsePackageJson },
  'pubspec.yaml': { ecosystem: 'pub', parser: parsePubspecYaml },
  'requirements.txt': { ecosystem: 'pypi', parser: parseRequirementsTxt },
  'pyproject.toml': { ecosystem: 'pypi', parser: parsePyprojectToml },
  'Pipfile': { ecosystem: 'pypi', parser: parsePipfile },
  'Gemfile': { ecosystem: 'rubygems', parser: parseGemfile },
  'composer.json': { ecosystem: 'packagist', parser: parseComposerJson },
  'pom.xml': { ecosystem: 'maven', parser: parsePomXml },
  'build.gradle': { ecosystem: 'maven', parser: parseBuildGradle },
  'build.gradle.kts': { ecosystem: 'maven', parser: parseBuildGradle },
  'go.mod': { ecosystem: 'go', parser: parseGoMod },
  'Cargo.toml': { ecosystem: 'crates.io', parser: parseCargoToml },
  'Package.swift': { ecosystem: 'swifturl', parser: parsePackageSwift },
  'Podfile': { ecosystem: 'cocoapods', parser: parsePodfile },
  'CMakeLists.txt': { ecosystem: 'conancenter', parser: parseCMakeLists },
  'conanfile.txt': { ecosystem: 'conancenter', parser: parseConanfile },
};

/** Detect file names that should match via extension (e.g. *.csproj) */
export function getManifestForFile(filename: string): { ecosystem: Ecosystem; parser: (content: string) => ManifestResult } | null {
  if (MANIFEST_MAP[filename]) return MANIFEST_MAP[filename];
  if (filename.endsWith('.csproj') || filename.endsWith('.fsproj') || filename.endsWith('.vbproj')) {
    return { ecosystem: 'nuget', parser: parseCsproj };
  }
  if (filename === 'packages.config') {
    return { ecosystem: 'nuget', parser: parseCsproj };
  }
  return null;
}
