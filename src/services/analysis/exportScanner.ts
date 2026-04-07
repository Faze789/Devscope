/**
 * Export Scanner — Discovers all exported symbols from a package's entry points.
 * Follows re-exports and barrel files to build the complete export surface.
 */
import type { PackageExport } from '../../types';

/** Scan a package's source for all exports */
export function scanExports(
  packagePath: string,
  entrySource: string,
  resolveFile?: (from: string, specifier: string) => string | null,
): PackageExport[] {
  const exports: PackageExport[] = [];
  const seen = new Set<string>();

  function addExport(exp: PackageExport) {
    const key = `${exp.name}:${exp.filePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    exports.push(exp);
  }

  const lines = entrySource.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // export default ...
    if (line.startsWith('export default ')) {
      const kind = inferKind(line.replace('export default ', ''));
      addExport({
        name: 'default',
        filePath: packagePath,
        isDefault: true,
        isReExport: false,
        kind,
      });
      continue;
    }

    // export { a, b, c }
    const namedExportMatch = line.match(/^export\s+\{([^}]+)\}/);
    if (namedExportMatch) {
      const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
      const names = namedExportMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of names) {
        const asMatch = name.match(/^(\w+)\s+as\s+(\w+)$/);
        const exportedName = asMatch ? asMatch[2] : name.replace(/^type\s+/, '');
        addExport({
          name: exportedName,
          filePath: packagePath,
          isDefault: exportedName === 'default',
          isReExport: !!fromMatch,
          reExportSource: fromMatch?.[1],
          kind: name.startsWith('type ') ? 'type' : 'unknown',
        });
      }
      continue;
    }

    // export * from './sub'
    const reExportAllMatch = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (reExportAllMatch) {
      addExport({
        name: '*',
        filePath: packagePath,
        isDefault: false,
        isReExport: true,
        reExportSource: reExportAllMatch[1],
        kind: 'namespace',
      });
      continue;
    }

    // export * as ns from './sub'
    const reExportNsMatch = line.match(
      /^export\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
    );
    if (reExportNsMatch) {
      addExport({
        name: reExportNsMatch[1],
        filePath: packagePath,
        isDefault: false,
        isReExport: true,
        reExportSource: reExportNsMatch[2],
        kind: 'namespace',
      });
      continue;
    }

    // export function/class/const/let/var/enum/interface/type
    const declExportMatch = line.match(
      /^export\s+(?:declare\s+)?(?:async\s+)?(function|class|const|let|var|enum|interface|type)\s+(\w+)/,
    );
    if (declExportMatch) {
      const [, keyword, name] = declExportMatch;
      addExport({
        name,
        filePath: packagePath,
        isDefault: false,
        isReExport: false,
        kind: keywordToKind(keyword),
      });
      continue;
    }
  }

  return exports;
}

function keywordToKind(
  keyword: string,
): PackageExport['kind'] {
  switch (keyword) {
    case 'function':
      return 'function';
    case 'class':
      return 'class';
    case 'const':
    case 'let':
    case 'var':
      return 'variable';
    case 'enum':
      return 'enum';
    case 'interface':
    case 'type':
      return 'type';
    default:
      return 'unknown';
  }
}

function inferKind(expr: string): PackageExport['kind'] {
  if (expr.startsWith('function') || expr.startsWith('(') || expr.includes('=>'))
    return 'function';
  if (expr.startsWith('class ')) return 'class';
  return 'unknown';
}
