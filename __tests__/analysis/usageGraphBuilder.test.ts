import {
  buildUsageGraph,
  computeUsageRatio,
  computeHealthScore,
} from '../../src/services/analysis/usageGraphBuilder';
import type { ImportRecord, PackageExport } from '../../src/types';

describe('usageGraphBuilder', () => {
  const mockExports: PackageExport[] = [
    { name: 'debounce', filePath: '/node_modules/lodash/index.js', isDefault: false, isReExport: false, kind: 'function' },
    { name: 'throttle', filePath: '/node_modules/lodash/index.js', isDefault: false, isReExport: false, kind: 'function' },
    { name: 'cloneDeep', filePath: '/node_modules/lodash/index.js', isDefault: false, isReExport: false, kind: 'function' },
    { name: 'merge', filePath: '/node_modules/lodash/index.js', isDefault: false, isReExport: false, kind: 'function' },
    { name: 'get', filePath: '/node_modules/lodash/index.js', isDefault: false, isReExport: false, kind: 'function' },
  ];

  const mockImports: ImportRecord[] = [
    {
      sourceFile: '/src/utils.ts',
      line: 1,
      column: 0,
      packageName: 'lodash',
      rawSpecifier: 'lodash',
      importedSymbols: [
        { exportedName: 'debounce', localName: 'debounce', isDefault: false, isTypeOnly: false },
        { exportedName: 'throttle', localName: 'throttle', isDefault: false, isTypeOnly: false },
      ],
      isNamespaceImport: false,
      isSideEffect: false,
      isDynamic: false,
      isRequire: false,
    },
  ];

  it('should build usage graph from imports and exports', () => {
    const { nodes, dependencySummaries } = buildUsageGraph(mockImports, [
      { name: 'lodash', version: '4.17.21', exports: mockExports },
    ]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].packageName).toBe('lodash');
    expect(nodes[0].exportName).toBe('debounce');

    const summary = dependencySummaries.get('lodash')!;
    expect(summary.usedExports.size).toBe(2);
    expect(summary.usedExports.has('debounce')).toBe(true);
    expect(summary.usedExports.has('throttle')).toBe(true);
    expect(summary.totalExports).toBe(5);
  });

  it('should track consumer references', () => {
    const { nodes } = buildUsageGraph(mockImports, [
      { name: 'lodash', version: '4.17.21', exports: mockExports },
    ]);

    const debounceNode = nodes.find((n) => n.exportName === 'debounce');
    expect(debounceNode?.consumers).toHaveLength(1);
    expect(debounceNode?.consumers[0].filePath).toBe('/src/utils.ts');
    expect(debounceNode?.consumers[0].line).toBe(1);
  });

  it('should skip type-only imports', () => {
    const typeOnlyImport: ImportRecord = {
      sourceFile: '/src/types.ts',
      line: 1,
      column: 0,
      packageName: 'lodash',
      rawSpecifier: 'lodash',
      importedSymbols: [
        { exportedName: 'merge', localName: 'merge', isDefault: false, isTypeOnly: true },
      ],
      isNamespaceImport: false,
      isSideEffect: false,
      isDynamic: false,
      isRequire: false,
    };

    const { dependencySummaries } = buildUsageGraph([typeOnlyImport], [
      { name: 'lodash', version: '4.17.21', exports: mockExports },
    ]);

    const summary = dependencySummaries.get('lodash')!;
    expect(summary.usedExports.size).toBe(0);
  });

  describe('computeUsageRatio', () => {
    it('should compute ratio correctly', () => {
      expect(
        computeUsageRatio({
          name: 'lodash',
          version: '4.17.21',
          totalExports: 100,
          usedExports: new Set(['a', 'b', 'c']),
          usedExportDetails: [],
          consumers: new Map(),
        }),
      ).toBe(0.03);
    });

    it('should return 1 for namespace imports', () => {
      expect(
        computeUsageRatio({
          name: 'lodash',
          version: '4.17.21',
          totalExports: 100,
          usedExports: new Set(['*']),
          usedExportDetails: [],
          consumers: new Map(),
        }),
      ).toBe(1);
    });

    it('should return 1 for packages with no exports', () => {
      expect(
        computeUsageRatio({
          name: 'polyfill',
          version: '1.0.0',
          totalExports: 0,
          usedExports: new Set(),
          usedExportDetails: [],
          consumers: new Map(),
        }),
      ).toBe(1);
    });
  });

  describe('computeHealthScore', () => {
    it('should give perfect score for fully used, no CVEs', () => {
      expect(computeHealthScore(1, 0, 0)).toBe(100);
    });

    it('should penalize low usage', () => {
      const score = computeHealthScore(0.1, 0, 0);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThan(50);
    });

    it('should heavily penalize CVEs in usage path', () => {
      const score = computeHealthScore(1, 1, 1);
      expect(score).toBeLessThanOrEqual(80);
    });

    it('should lightly penalize CVEs outside path', () => {
      const noPathScore = computeHealthScore(1, 1, 0);
      const inPathScore = computeHealthScore(1, 1, 1);
      expect(noPathScore).toBeGreaterThan(inPathScore);
    });
  });
});
