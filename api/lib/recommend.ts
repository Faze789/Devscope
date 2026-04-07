/**
 * Recommendation engine for serverless.
 */
import type { DependencyResult, RefactorSuggestion } from './types';

const KNOWN_ALTERNATIVES: Record<string, { alternative: string; reason: string }> = {
  moment: { alternative: 'date-fns or dayjs', reason: 'moment.js is 300KB+ and mutable. date-fns is tree-shakeable; dayjs is 2KB.' },
  lodash: { alternative: 'Native JS or lodash-es', reason: 'Most lodash utilities have native equivalents in modern JS.' },
  underscore: { alternative: 'Native JS', reason: 'Underscore utilities are covered by modern JS built-ins.' },
  axios: { alternative: 'Native fetch API', reason: 'fetch() is built into modern runtimes.' },
  request: { alternative: 'Native fetch or undici', reason: 'request is deprecated.' },
  bluebird: { alternative: 'Native Promises', reason: 'Native Promises cover most bluebird use-cases.' },
  uuid: { alternative: 'crypto.randomUUID()', reason: 'crypto.randomUUID() is built-in.' },
  chalk: { alternative: 'picocolors', reason: 'picocolors is 14x smaller.' },
  'left-pad': { alternative: 'String.prototype.padStart()', reason: 'padStart() is built-in.' },
};

const INLINE_SNIPPETS: Record<string, Record<string, string>> = {
  lodash: {
    debounce: `function debounce(fn, ms) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}`,
    throttle: `function throttle(fn, ms) {\n  let last = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - last >= ms) { last = now; return fn(...args); }\n  };\n}`,
    cloneDeep: `function cloneDeep(obj) { return structuredClone(obj); }`,
    get: `function get(obj, path, def) {\n  const keys = path.replace(/\\[(\\d+)\\]/g, '.$1').split('.');\n  let r = obj;\n  for (const k of keys) { r = r?.[k]; if (r === undefined) return def; }\n  return r;\n}`,
  },
};

export function generateSuggestions(dependencies: DependencyResult[]): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];

  for (const dep of dependencies) {
    if (dep.isDev) continue;

    const alt = KNOWN_ALTERNATIVES[dep.name];
    if (alt && dep.usageRatio < 0.3) {
      suggestions.push({
        type: 'replace_package', packageName: dep.name, reason: alt.reason,
        alternative: alt.alternative, sizeReduction: Math.round(dep.packageSize * 0.8), confidence: dep.usageRatio < 0.1 ? 0.9 : 0.7,
      });
    }

    const snippets = INLINE_SNIPPETS[dep.name];
    if (snippets && dep.usedExports.length <= 2) {
      for (const exp of dep.usedExports) {
        const snippet = snippets[exp.name];
        if (snippet) {
          suggestions.push({
            type: 'inline_code', packageName: dep.name,
            reason: `You only use "${exp.name}" from ${dep.name}. Inline it to eliminate the dependency.`,
            codeSnippet: snippet, sizeReduction: dep.packageSize, confidence: 0.85,
          });
        }
      }
    }

    if (dep.usageRatio < 0.05 && dep.packageSize > 50000 && !alt) {
      suggestions.push({
        type: 'tree_shake', packageName: dep.name,
        reason: `Only ${Math.round(dep.usageRatio * 100)}% of ${dep.name} is used. Consider tree-shaking or targeted imports.`,
        sizeReduction: Math.round(dep.packageSize * (1 - dep.usageRatio) * 0.5), confidence: 0.6,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence * b.sizeReduction - a.confidence * a.sizeReduction);
  return suggestions;
}
