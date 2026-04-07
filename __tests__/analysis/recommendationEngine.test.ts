import { generateSuggestions } from '../../src/services/analysis/recommendationEngine';
import type { Dependency } from '../../src/types';

describe('recommendationEngine', () => {
  it('should suggest replacing lodash when usage is low', () => {
    const deps: Dependency[] = [
      {
        name: 'lodash',
        version: '4.17.21',
        isDev: false,
        totalExports: 300,
        usedExports: [
          { name: 'debounce', filePath: '', isDefault: false, isReExport: false, kind: 'function' },
        ],
        usageRatio: 0.003,
        packageSize: 500000,
        transitiveDeps: [],
        cves: [],
        healthScore: 70,
      },
    ];

    const suggestions = generateSuggestions(deps);
    expect(suggestions.length).toBeGreaterThan(0);

    const lodashSuggestion = suggestions.find((s) => s.packageName === 'lodash');
    expect(lodashSuggestion).toBeDefined();
  });

  it('should suggest inline code for single-function usage', () => {
    const deps: Dependency[] = [
      {
        name: 'lodash',
        version: '4.17.21',
        isDev: false,
        totalExports: 300,
        usedExports: [
          { name: 'debounce', filePath: '', isDefault: false, isReExport: false, kind: 'function' },
        ],
        usageRatio: 0.003,
        packageSize: 500000,
        transitiveDeps: [],
        cves: [],
        healthScore: 70,
      },
    ];

    const suggestions = generateSuggestions(deps);
    const inlineSuggestion = suggestions.find(
      (s) => s.type === 'inline_code' && s.packageName === 'lodash',
    );
    expect(inlineSuggestion).toBeDefined();
    expect(inlineSuggestion?.codeSnippet).toBeDefined();
  });

  it('should suggest replacing moment.js', () => {
    const deps: Dependency[] = [
      {
        name: 'moment',
        version: '2.29.4',
        isDev: false,
        totalExports: 50,
        usedExports: [
          { name: 'default', filePath: '', isDefault: true, isReExport: false, kind: 'function' },
        ],
        usageRatio: 0.02,
        packageSize: 300000,
        transitiveDeps: [],
        cves: [],
        healthScore: 60,
      },
    ];

    const suggestions = generateSuggestions(deps);
    const momentSuggestion = suggestions.find((s) => s.packageName === 'moment');
    expect(momentSuggestion).toBeDefined();
    expect(momentSuggestion?.alternative).toContain('date-fns');
  });

  it('should flag tree-shaking for large low-usage unknown packages', () => {
    const deps: Dependency[] = [
      {
        name: 'huge-package',
        version: '1.0.0',
        isDev: false,
        totalExports: 500,
        usedExports: [
          { name: 'oneFunction', filePath: '', isDefault: false, isReExport: false, kind: 'function' },
        ],
        usageRatio: 0.002,
        packageSize: 200000,
        transitiveDeps: [],
        cves: [],
        healthScore: 70,
      },
    ];

    const suggestions = generateSuggestions(deps);
    const treeshake = suggestions.find(
      (s) => s.type === 'tree_shake' && s.packageName === 'huge-package',
    );
    expect(treeshake).toBeDefined();
  });

  it('should skip dev dependencies', () => {
    const deps: Dependency[] = [
      {
        name: 'lodash',
        version: '4.17.21',
        isDev: true,
        totalExports: 300,
        usedExports: [],
        usageRatio: 0,
        packageSize: 500000,
        transitiveDeps: [],
        cves: [],
        healthScore: 50,
      },
    ];

    const suggestions = generateSuggestions(deps);
    expect(suggestions).toHaveLength(0);
  });

  it('should sort by impact (confidence * sizeReduction)', () => {
    const deps: Dependency[] = [
      {
        name: 'moment',
        version: '2.29.4',
        isDev: false,
        totalExports: 50,
        usedExports: [],
        usageRatio: 0.01,
        packageSize: 300000,
        transitiveDeps: [],
        cves: [],
        healthScore: 60,
      },
      {
        name: 'small-pkg',
        version: '1.0.0',
        isDev: false,
        totalExports: 200,
        usedExports: [],
        usageRatio: 0.01,
        packageSize: 60000,
        transitiveDeps: [],
        cves: [],
        healthScore: 70,
      },
    ];

    const suggestions = generateSuggestions(deps);
    if (suggestions.length >= 2) {
      const scores = suggestions.map((s) => s.confidence * s.sizeReduction);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    }
  });
});
