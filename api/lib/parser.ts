/**
 * Import parser for serverless — extracts imports from source files.
 * Adapted from src/services/analysis/importParser.ts for server use.
 */
import type { ImportRecord, ImportedSymbol } from './types';

export function parseImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const esImports = parseESImport(line, lines, i, sourceFile, lineNum);
    if (esImports) {
      records.push(...esImports.records);
      i = esImports.endLine;
      continue;
    }

    const dynamicImport = parseDynamicImport(line, sourceFile, lineNum);
    if (dynamicImport) { records.push(dynamicImport); continue; }

    const requireImport = parseRequire(line, sourceFile, lineNum);
    if (requireImport) records.push(requireImport);
  }

  return records;
}

function parseESImport(
  line: string, lines: string[], startIdx: number, sourceFile: string, lineNum: number,
): { records: ImportRecord[]; endLine: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('import ') && !trimmed.startsWith('import{')) return null;

  let fullStatement = line;
  let endLine = startIdx;
  while (!fullStatement.includes(';') && !fullStatement.match(/from\s+['"][^'"]+['"]\s*$/) && endLine < lines.length - 1) {
    endLine++;
    fullStatement += ' ' + lines[endLine];
  }

  const sideEffectMatch = fullStatement.match(/import\s+['"]([^'"]+)['"]/);
  if (sideEffectMatch && !fullStatement.includes('from')) {
    const specifier = sideEffectMatch[1];
    const pkgName = extractPackageName(specifier);
    if (!pkgName || isRelative(specifier)) return null;
    return {
      records: [{
        sourceFile, line: lineNum, column: 0, packageName: pkgName, rawSpecifier: specifier,
        importedSymbols: [], isNamespaceImport: false, isSideEffect: true, isDynamic: false, isRequire: false,
      }],
      endLine,
    };
  }

  const fromMatch = fullStatement.match(/from\s+['"]([^'"]+)['"]/);
  if (!fromMatch) return null;

  const specifier = fromMatch[1];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;

  const symbols: ImportedSymbol[] = [];
  let isNamespace = false;
  const isTypeOnlyImport = /import\s+type\s/.test(fullStatement);

  const defaultMatch = fullStatement.match(/import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from/);
  if (defaultMatch && defaultMatch[1] !== 'type') {
    symbols.push({ exportedName: 'default', localName: defaultMatch[1], isDefault: true, isTypeOnly: isTypeOnlyImport });
  }

  const nsMatch = fullStatement.match(/import\s+\*\s+as\s+(\w+)\s+from/);
  if (nsMatch) {
    isNamespace = true;
    symbols.push({ exportedName: '*', localName: nsMatch[1], isDefault: false, isTypeOnly: isTypeOnlyImport });
  }

  const namedMatch = fullStatement.match(/\{([^}]+)\}/);
  if (namedMatch) {
    const parts = namedMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const isTypeOnly = isTypeOnlyImport || part.startsWith('type ');
      const cleaned = part.replace(/^type\s+/, '');
      const asMatch = cleaned.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch) {
        symbols.push({ exportedName: asMatch[1], localName: asMatch[2], isDefault: asMatch[1] === 'default', isTypeOnly });
      } else {
        symbols.push({ exportedName: cleaned, localName: cleaned, isDefault: false, isTypeOnly });
      }
    }
  }

  const comboMatch = fullStatement.match(/import\s+([A-Za-z_$][\w$]*)\s*,\s*\{/);
  if (comboMatch && !symbols.some((s) => s.isDefault)) {
    symbols.unshift({ exportedName: 'default', localName: comboMatch[1], isDefault: true, isTypeOnly: isTypeOnlyImport });
  }

  return {
    records: [{
      sourceFile, line: lineNum, column: 0, packageName: pkgName, rawSpecifier: specifier,
      importedSymbols: symbols, isNamespaceImport: isNamespace, isSideEffect: false, isDynamic: false, isRequire: false,
    }],
    endLine,
  };
}

function parseDynamicImport(line: string, sourceFile: string, lineNum: number): ImportRecord | null {
  const match = line.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
  if (!match) return null;
  const specifier = match[1];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;
  return {
    sourceFile, line: lineNum, column: match.index ?? 0, packageName: pkgName, rawSpecifier: specifier,
    importedSymbols: [], isNamespaceImport: false, isSideEffect: false, isDynamic: true, isRequire: false,
  };
}

function parseRequire(line: string, sourceFile: string, lineNum: number): ImportRecord | null {
  const match = line.match(/(?:const|let|var)\s+(?:(\w+)|(\{[^}]+\}))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/);
  if (!match) {
    const bareMatch = line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!bareMatch) return null;
    const specifier = bareMatch[1];
    const pkgName = extractPackageName(specifier);
    if (!pkgName || isRelative(specifier)) return null;
    return {
      sourceFile, line: lineNum, column: bareMatch.index ?? 0, packageName: pkgName, rawSpecifier: specifier,
      importedSymbols: [], isNamespaceImport: false, isSideEffect: true, isDynamic: false, isRequire: true,
    };
  }

  const specifier = match[3];
  const pkgName = extractPackageName(specifier);
  if (!pkgName || isRelative(specifier)) return null;

  const symbols: ImportedSymbol[] = [];
  if (match[1]) {
    symbols.push({ exportedName: 'default', localName: match[1], isDefault: true, isTypeOnly: false });
  } else if (match[2]) {
    const destructured = match[2].replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of destructured) {
      const asMatch = part.match(/^(\w+)\s*:\s*(\w+)$/);
      if (asMatch) symbols.push({ exportedName: asMatch[1], localName: asMatch[2], isDefault: false, isTypeOnly: false });
      else symbols.push({ exportedName: part, localName: part, isDefault: false, isTypeOnly: false });
    }
  }

  return {
    sourceFile, line: lineNum, column: match.index ?? 0, packageName: pkgName, rawSpecifier: specifier,
    importedSymbols: symbols, isNamespaceImport: false, isSideEffect: false, isDynamic: false, isRequire: true,
  };
}

/**
 * Parse Dart import statements.
 * Dart imports look like: import 'package:name/file.dart';
 */
export function parseDartImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // import 'package:name/...';
    const pkgMatch = trimmed.match(/^import\s+['"]package:([^/]+)\/([^'"]+)['"]\s*(as\s+(\w+))?\s*;/);
    if (pkgMatch) {
      const packageName = pkgMatch[1];
      const importPath = pkgMatch[2];
      const alias = pkgMatch[4];

      // Extract a symbol name from the file path (e.g., "material.dart" -> "material")
      const fileName = importPath.split('/').pop()?.replace('.dart', '') ?? importPath;

      const symbols: ImportedSymbol[] = [{
        exportedName: fileName,
        localName: alias ?? fileName,
        isDefault: false,
        isTypeOnly: false,
      }];

      records.push({
        sourceFile, line: lineNum, column: 0,
        packageName, rawSpecifier: `package:${packageName}/${importPath}`,
        importedSymbols: symbols,
        isNamespaceImport: !!alias,
        isSideEffect: false,
        isDynamic: false,
        isRequire: false,
      });
      continue;
    }

    // import 'package:name/...'; with show/hide
    const showMatch = trimmed.match(/^import\s+['"]package:([^/]+)\/([^'"]+)['"]\s+show\s+([^;]+);/);
    if (showMatch) {
      const packageName = showMatch[1];
      const importPath = showMatch[2];
      const shownNames = showMatch[3].split(',').map(s => s.trim()).filter(Boolean);

      const symbols: ImportedSymbol[] = shownNames.map(name => ({
        exportedName: name,
        localName: name,
        isDefault: false,
        isTypeOnly: false,
      }));

      records.push({
        sourceFile, line: lineNum, column: 0,
        packageName, rawSpecifier: `package:${packageName}/${importPath}`,
        importedSymbols: symbols,
        isNamespaceImport: false,
        isSideEffect: false,
        isDynamic: false,
        isRequire: false,
      });
      continue;
    }
  }

  return records;
}

/** Extract package name from a Dart package specifier */
export function extractDartPackageName(specifier: string): string | null {
  const match = specifier.match(/^package:([^/]+)\//);
  return match ? match[1] : null;
}

export function extractPackageName(specifier: string): string | null {
  if (isRelative(specifier)) return null;
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }
  return specifier.split('/')[0];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/');
}
