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

// ---------------------------------------------------------------------------
// Python import parser
// ---------------------------------------------------------------------------
export function parsePythonImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // from package import x, y, z
    const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9_.]+)?\s+import\s+(.+)/);
    if (fromMatch) {
      const pkgName = fromMatch[1];
      if (pkgName.startsWith('_') || pkgName === 'typing') continue;
      const names = fromMatch[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const symbols: ImportedSymbol[] = names.map(n => ({
        exportedName: n, localName: n, isDefault: false, isTypeOnly: false,
      }));
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: pkgName, rawSpecifier: fromMatch[0],
        importedSymbols: symbols, isNamespaceImport: false, isSideEffect: false, isDynamic: false, isRequire: false,
      });
      continue;
    }

    // import package, package2
    const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_]+(?:\s*,\s*[a-zA-Z0-9_]+)*)/);
    if (importMatch) {
      const pkgs = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      for (const pkg of pkgs) {
        if (pkg.startsWith('_')) continue;
        records.push({
          sourceFile, line: lineNum, column: 0, packageName: pkg, rawSpecifier: `import ${pkg}`,
          importedSymbols: [{ exportedName: '*', localName: pkg, isDefault: false, isTypeOnly: false }],
          isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: false,
        });
      }
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Ruby import parser
// ---------------------------------------------------------------------------
export function parseRubyImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // require 'gem_name' or require "gem_name"
    const reqMatch = trimmed.match(/^require\s+['"]([a-zA-Z0-9_-]+)(?:\/[^'"]*)?['"]/);
    if (reqMatch) {
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: reqMatch[1], rawSpecifier: reqMatch[0],
        importedSymbols: [{ exportedName: '*', localName: reqMatch[1], isDefault: false, isTypeOnly: false }],
        isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: true,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Go import parser
// ---------------------------------------------------------------------------
export function parseGoImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (trimmed === 'import (') { inImportBlock = true; continue; }
    if (trimmed === ')') { inImportBlock = false; continue; }

    // Single import: import "pkg"
    const singleMatch = trimmed.match(/^import\s+(?:(\w+)\s+)?"([^"]+)"/);
    if (singleMatch) {
      const pkg = singleMatch[2];
      if (!isStdlib(pkg)) {
        records.push(goImportRecord(sourceFile, lineNum, pkg, singleMatch[1]));
      }
      continue;
    }

    // Inside import block
    if (inImportBlock) {
      const blockMatch = trimmed.match(/^(?:(\w+)\s+)?"([^"]+)"/);
      if (blockMatch) {
        const pkg = blockMatch[2];
        if (!isStdlib(pkg)) {
          records.push(goImportRecord(sourceFile, lineNum, pkg, blockMatch[1]));
        }
      }
    }
  }
  return records;
}

function isStdlib(pkg: string): boolean {
  return !pkg.includes('.'); // Go stdlib packages don't have dots
}

function goImportRecord(sourceFile: string, line: number, pkg: string, alias?: string): ImportRecord {
  // Go module path: github.com/owner/repo/subpkg → package = first 3 parts
  const parts = pkg.split('/');
  const packageName = parts.length >= 3 ? parts.slice(0, 3).join('/') : pkg;
  return {
    sourceFile, line, column: 0, packageName, rawSpecifier: pkg,
    importedSymbols: [{ exportedName: '*', localName: alias ?? parts[parts.length - 1], isDefault: false, isTypeOnly: false }],
    isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: false,
  };
}

// ---------------------------------------------------------------------------
// Rust import parser
// ---------------------------------------------------------------------------
export function parseRustImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // use crate_name::... or extern crate name;
    const useMatch = trimmed.match(/^use\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:::\{([^}]+)\})?/);
    if (useMatch) {
      const crateName = useMatch[1];
      if (['std', 'core', 'alloc', 'crate', 'self', 'super'].includes(crateName)) continue;
      const symbols: ImportedSymbol[] = useMatch[2]
        ? useMatch[2].split(',').map(s => s.trim()).filter(Boolean).map(n => ({
            exportedName: n, localName: n, isDefault: false, isTypeOnly: false,
          }))
        : [{ exportedName: '*', localName: crateName, isDefault: false, isTypeOnly: false }];
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: crateName, rawSpecifier: trimmed,
        importedSymbols: symbols, isNamespaceImport: !useMatch[2], isSideEffect: false, isDynamic: false, isRequire: false,
      });
      continue;
    }

    const externMatch = trimmed.match(/^extern\s+crate\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (externMatch) {
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: externMatch[1], rawSpecifier: trimmed,
        importedSymbols: [{ exportedName: '*', localName: externMatch[1], isDefault: false, isTypeOnly: false }],
        isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: false,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Java / Kotlin import parser
// ---------------------------------------------------------------------------
export function parseJavaImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // import [static] com.group.artifact.ClassName;
    const importMatch = trimmed.match(/^import\s+(?:static\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/);
    if (importMatch) {
      const fqn = importMatch[1];
      const parts = fqn.split('.');
      // Java stdlib
      if (parts[0] === 'java' || parts[0] === 'javax' || parts[0] === 'kotlin' || parts[0] === 'kotlinx') continue;
      // Maven convention: groupId is typically 2-3 parts, artifactId follows
      const groupId = parts.length >= 3 ? parts.slice(0, 2).join('.') : parts[0];
      const className = parts[parts.length - 1];
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: groupId, rawSpecifier: fqn,
        importedSymbols: [{ exportedName: className, localName: className, isDefault: false, isTypeOnly: false }],
        isNamespaceImport: className === '*', isSideEffect: false, isDynamic: false, isRequire: false,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Swift import parser
// ---------------------------------------------------------------------------
export function parseSwiftImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // import ModuleName or @testable import ModuleName
    const importMatch = trimmed.match(/^(?:@\w+\s+)?import\s+(?:class\s+|struct\s+|enum\s+|protocol\s+|func\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
    if (importMatch) {
      const mod = importMatch[1];
      if (['Foundation', 'UIKit', 'SwiftUI', 'Combine', 'CoreData', 'CoreGraphics', 'Darwin', 'Swift', 'os'].includes(mod)) continue;
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: mod, rawSpecifier: trimmed,
        importedSymbols: [{ exportedName: '*', localName: mod, isDefault: false, isTypeOnly: false }],
        isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: false,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// C# / .NET import parser
// ---------------------------------------------------------------------------
export function parseCSharpImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // using Namespace.Sub;  or  using static Namespace.Sub.Type;
    const usingMatch = trimmed.match(/^using\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/);
    if (usingMatch) {
      const ns = usingMatch[1];
      if (ns.startsWith('System')) continue;
      const rootNs = ns.split('.')[0];
      records.push({
        sourceFile, line: lineNum, column: 0, packageName: rootNs, rawSpecifier: ns,
        importedSymbols: [{ exportedName: ns, localName: ns, isDefault: false, isTypeOnly: false }],
        isNamespaceImport: true, isSideEffect: false, isDynamic: false, isRequire: false,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// PHP import parser
// ---------------------------------------------------------------------------
export function parsePhpImports(sourceFile: string, source: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // use Vendor\Package\Class;
    const useMatch = trimmed.match(/^use\s+([A-Za-z_\\][A-Za-z0-9_\\]*)/);
    if (useMatch) {
      const fqn = useMatch[1];
      const parts = fqn.split('\\');
      // Composer convention: vendor/package maps to Vendor\Package namespace
      const packageName = parts.length >= 2 ? `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}` : parts[0].toLowerCase();
      const className = parts[parts.length - 1];
      records.push({
        sourceFile, line: lineNum, column: 0, packageName, rawSpecifier: fqn,
        importedSymbols: [{ exportedName: className, localName: className, isDefault: false, isTypeOnly: false }],
        isNamespaceImport: false, isSideEffect: false, isDynamic: false, isRequire: false,
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Dispatcher — pick the right parser based on file extension
// ---------------------------------------------------------------------------
export type ImportParser = (sourceFile: string, source: string) => ImportRecord[];

const PARSER_BY_EXT: Record<string, ImportParser> = {
  '.ts': parseImports, '.tsx': parseImports, '.js': parseImports, '.jsx': parseImports,
  '.mjs': parseImports, '.cjs': parseImports,
  '.dart': parseDartImports,
  '.py': parsePythonImports,
  '.rb': parseRubyImports,
  '.go': parseGoImports,
  '.rs': parseRustImports,
  '.java': parseJavaImports, '.kt': parseJavaImports, '.kts': parseJavaImports,
  '.swift': parseSwiftImports,
  '.cs': parseCSharpImports, '.fs': parseCSharpImports, '.vb': parseCSharpImports,
  '.php': parsePhpImports,
};

/** Get the appropriate import parser for a file based on its extension */
export function getImportParser(filePath: string): ImportParser | null {
  const ext = '.' + filePath.split('.').pop();
  return PARSER_BY_EXT[ext] ?? null;
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
