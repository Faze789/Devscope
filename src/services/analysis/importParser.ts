/**
 * Import Parser — Extracts all import/require statements from source files
 * using regex-based parsing suitable for the React Native JS thread.
 *
 * For production, this should be backed by SWC native module for accuracy,
 * but regex parsing handles the vast majority of real-world import patterns.
 */
import type { ImportRecord, ImportedSymbol } from '../../types';

/** Parse all imports from a TypeScript/JavaScript source file */
export function parseImports(
  sourceFile: string,
  source: string,
): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ES module imports
    const esImports = parseESImport(line, lines, i, sourceFile, lineNum);
    if (esImports) {
      records.push(...esImports.records);
      i = esImports.endLine;
      continue;
    }

    // Dynamic imports
    const dynamicImport = parseDynamicImport(line, sourceFile, lineNum);
    if (dynamicImport) {
      records.push(dynamicImport);
      continue;
    }

    // CommonJS require
    const requireImport = parseRequire(line, sourceFile, lineNum);
    if (requireImport) {
      records.push(requireImport);
    }
  }

  return records;
}

/** Parse ES module import statements (potentially multi-line) */
function parseESImport(
  line: string,
  lines: string[],
  startIdx: number,
  sourceFile: string,
  lineNum: number,
): { records: ImportRecord[]; endLine: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('import ') && !trimmed.startsWith('import{')) return null;

  // Accumulate multi-line imports
  let fullStatement = line;
  let endLine = startIdx;
  while (!fullStatement.includes(';') && !fullStatement.match(/from\s+['"][^'"]+['"]\s*$/) && endLine < lines.length - 1) {
    endLine++;
    fullStatement += ' ' + lines[endLine];
  }

  // Side-effect import: import 'module'
  const sideEffectMatch = fullStatement.match(
    /import\s+['"]([^'"]+)['"]/,
  );
  if (sideEffectMatch && !fullStatement.includes('from')) {
    const specifier = sideEffectMatch[1];
    const pkgName = extractPackageName(specifier);
    if (!pkgName || isRelative(specifier)) return null;
    return {
      records: [
        {
          sourceFile,
          line: lineNum,
          column: 0,
          packageName: pkgName,
          rawSpecifier: specifier,
          importedSymbols: [],
          isNamespaceImport: false,
          isSideEffect: true,
          isDynamic: false,
          isRequire: false,
        },
      ],
      endLine,
    };
  }

  // Extract the from specifier
  const fromMatch = fullStatement.match(/from\s+['"]([^'"]+)['"]/);
  if (!fromMatch) return null;

  const specifier = fromMatch[1];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;

  const symbols: ImportedSymbol[] = [];
  let isNamespace = false;

  // Type-only import: import type { X } from 'Y'
  const isTypeOnlyImport = /import\s+type\s/.test(fullStatement);

  // Default import: import X from 'Y'
  const defaultMatch = fullStatement.match(
    /import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from/,
  );
  if (defaultMatch && defaultMatch[1] !== 'type') {
    symbols.push({
      exportedName: 'default',
      localName: defaultMatch[1],
      isDefault: true,
      isTypeOnly: isTypeOnlyImport,
    });
  }

  // Namespace import: import * as X from 'Y'
  const nsMatch = fullStatement.match(/import\s+\*\s+as\s+(\w+)\s+from/);
  if (nsMatch) {
    isNamespace = true;
    symbols.push({
      exportedName: '*',
      localName: nsMatch[1],
      isDefault: false,
      isTypeOnly: isTypeOnlyImport,
    });
  }

  // Named imports: import { a, b as c, type d } from 'Y'
  const namedMatch = fullStatement.match(/\{([^}]+)\}/);
  if (namedMatch) {
    const namedStr = namedMatch[1];
    const parts = namedStr.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const isTypeOnly =
        isTypeOnlyImport || part.startsWith('type ');
      const cleaned = part.replace(/^type\s+/, '');
      const asMatch = cleaned.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch) {
        symbols.push({
          exportedName: asMatch[1],
          localName: asMatch[2],
          isDefault: asMatch[1] === 'default',
          isTypeOnly,
        });
      } else {
        symbols.push({
          exportedName: cleaned,
          localName: cleaned,
          isDefault: false,
          isTypeOnly,
        });
      }
    }
  }

  // Default + named combined: import X, { a, b } from 'Y'
  const comboMatch = fullStatement.match(
    /import\s+([A-Za-z_$][\w$]*)\s*,\s*\{/,
  );
  if (comboMatch && !symbols.some((s) => s.isDefault)) {
    symbols.unshift({
      exportedName: 'default',
      localName: comboMatch[1],
      isDefault: true,
      isTypeOnly: isTypeOnlyImport,
    });
  }

  return {
    records: [
      {
        sourceFile,
        line: lineNum,
        column: 0,
        packageName: pkgName,
        rawSpecifier: specifier,
        importedSymbols: symbols,
        isNamespaceImport: isNamespace,
        isSideEffect: false,
        isDynamic: false,
        isRequire: false,
      },
    ],
    endLine,
  };
}

/** Parse dynamic import() expressions */
function parseDynamicImport(
  line: string,
  sourceFile: string,
  lineNum: number,
): ImportRecord | null {
  const match = line.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
  if (!match) return null;

  const specifier = match[1];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;

  return {
    sourceFile,
    line: lineNum,
    column: match.index ?? 0,
    packageName: pkgName,
    rawSpecifier: specifier,
    importedSymbols: [],
    isNamespaceImport: false,
    isSideEffect: false,
    isDynamic: true,
    isRequire: false,
  };
}

/** Parse require() calls */
function parseRequire(
  line: string,
  sourceFile: string,
  lineNum: number,
): ImportRecord | null {
  const match = line.match(/(?:const|let|var)\s+(?:(\w+)|(\{[^}]+\}))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/);
  if (!match) {
    // Bare require
    const bareMatch = line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!bareMatch) return null;
    const specifier = bareMatch[1];
    const pkgName = extractPackageName(specifier);
    if (!pkgName || isRelative(specifier)) return null;
    return {
      sourceFile,
      line: lineNum,
      column: bareMatch.index ?? 0,
      packageName: pkgName,
      rawSpecifier: specifier,
      importedSymbols: [],
      isNamespaceImport: false,
      isSideEffect: true,
      isDynamic: false,
      isRequire: true,
    };
  }

  const specifier = match[3];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;

  const symbols: ImportedSymbol[] = [];

  if (match[1]) {
    // const X = require('Y')
    symbols.push({
      exportedName: 'default',
      localName: match[1],
      isDefault: true,
      isTypeOnly: false,
    });
  } else if (match[2]) {
    // const { a, b } = require('Y')
    const destructured = match[2]
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of destructured) {
      const asMatch = part.match(/^(\w+)\s*:\s*(\w+)$/);
      if (asMatch) {
        symbols.push({
          exportedName: asMatch[1],
          localName: asMatch[2],
          isDefault: false,
          isTypeOnly: false,
        });
      } else {
        symbols.push({
          exportedName: part,
          localName: part,
          isDefault: false,
          isTypeOnly: false,
        });
      }
    }
  }

  return {
    sourceFile,
    line: lineNum,
    column: match.index ?? 0,
    packageName: pkgName,
    rawSpecifier: specifier,
    importedSymbols: symbols,
    isNamespaceImport: false,
    isSideEffect: false,
    isDynamic: false,
    isRequire: true,
  };
}

/** Extract the npm package name from an import specifier */
export function extractPackageName(specifier: string): string | null {
  if (isRelative(specifier)) return null;
  // Scoped: @scope/pkg or @scope/pkg/sub
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }
  // Regular: pkg or pkg/sub
  return specifier.split('/')[0];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/');
}
