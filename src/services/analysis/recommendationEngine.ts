/**
 * Recommendation Engine — Generates refactoring suggestions based on
 * dependency usage analysis. Suggests alternatives when usage is low,
 * and provides inline code snippets for simple replacements.
 */
import type { Dependency, RefactorSuggestion } from '../../types';

/** Well-known lightweight alternatives for common heavy packages */
const KNOWN_ALTERNATIVES: Record<string, { alternative: string; reason: string }> = {
  'moment': {
    alternative: 'date-fns or dayjs',
    reason: 'moment.js is 300KB+ and mutable. date-fns is tree-shakeable; dayjs is 2KB.',
  },
  'lodash': {
    alternative: 'Native JS or lodash-es (individual imports)',
    reason: 'Most lodash utilities have native equivalents in modern JS.',
  },
  'underscore': {
    alternative: 'Native JS',
    reason: 'Underscore utilities are covered by modern JS built-ins.',
  },
  'axios': {
    alternative: 'Native fetch API',
    reason: 'fetch() is built into React Native and modern runtimes.',
  },
  'request': {
    alternative: 'Native fetch or undici',
    reason: 'request is deprecated. Use native fetch or undici.',
  },
  'bluebird': {
    alternative: 'Native Promises',
    reason: 'Native Promises cover most bluebird use-cases in modern JS.',
  },
  'uuid': {
    alternative: 'crypto.randomUUID()',
    reason: 'crypto.randomUUID() is built-in and generates v4 UUIDs.',
  },
  'chalk': {
    alternative: 'picocolors',
    reason: 'picocolors is 14x smaller and covers most chalk use-cases.',
  },
  'left-pad': {
    alternative: 'String.prototype.padStart()',
    reason: 'padStart() is a built-in JS string method.',
  },
};

/** Native code snippets for common single-function replacements */
const INLINE_SNIPPETS: Record<string, Record<string, string>> = {
  'lodash': {
    'debounce': `function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}`,
    'throttle': `function throttle<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      return fn(...args);
    }
  }) as T;
}`,
    'cloneDeep': `function cloneDeep<T>(obj: T): T {
  return structuredClone(obj);
}`,
    'get': `function get(obj: any, path: string, defaultValue?: any): any {
  const keys = path.replace(/\\[(\\d+)\\]/g, '.$1').split('.');
  let result = obj;
  for (const key of keys) {
    result = result?.[key];
    if (result === undefined) return defaultValue;
  }
  return result;
}`,
    'isEqual': `function isEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}`,
  },
};

const LOW_USAGE_THRESHOLD = 0.05;
const SIZE_THRESHOLD = 50 * 1024; // 50KB

export function generateSuggestions(
  dependencies: Dependency[],
): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];

  for (const dep of dependencies) {
    if (dep.isDev) continue;

    // Check for known alternatives
    const alt = KNOWN_ALTERNATIVES[dep.name];
    if (alt && dep.usageRatio < 0.3) {
      suggestions.push({
        type: 'replace_package',
        packageName: dep.name,
        reason: alt.reason,
        alternative: alt.alternative,
        sizeReduction: Math.round(dep.packageSize * 0.8),
        confidence: dep.usageRatio < 0.1 ? 0.9 : 0.7,
      });
    }

    // Check for inline-able single-function usage
    const snippets = INLINE_SNIPPETS[dep.name];
    if (snippets && dep.usedExports.length <= 2) {
      for (const exp of dep.usedExports) {
        const snippet = snippets[exp.name];
        if (snippet) {
          suggestions.push({
            type: 'inline_code',
            packageName: dep.name,
            reason: `You only use "${exp.name}" from ${dep.name}. Inline it to eliminate the dependency.`,
            codeSnippet: snippet,
            sizeReduction: dep.packageSize,
            confidence: 0.85,
          });
        }
      }
    }

    // Low usage + large package = tree-shake or replace
    if (
      dep.usageRatio < LOW_USAGE_THRESHOLD &&
      dep.packageSize > SIZE_THRESHOLD &&
      !alt
    ) {
      suggestions.push({
        type: 'tree_shake',
        packageName: dep.name,
        reason: `Only ${Math.round(dep.usageRatio * 100)}% of ${dep.name} is used (${dep.usedExports.length}/${dep.totalExports} exports). Consider tree-shaking or replacing with targeted imports.`,
        sizeReduction: Math.round(dep.packageSize * (1 - dep.usageRatio) * 0.5),
        confidence: 0.6,
      });
    }
  }

  // Sort by confidence * sizeReduction (impact score)
  suggestions.sort(
    (a, b) =>
      b.confidence * b.sizeReduction - a.confidence * a.sizeReduction,
  );

  return suggestions;
}
