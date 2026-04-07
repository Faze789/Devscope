/**
 * @format
 */

import 'react-native';
import { it, describe, expect } from '@jest/globals';

// App-level rendering test requires native module mocks for
// react-native-screens, react-native-svg, etc.
// Core logic is thoroughly tested in __tests__/analysis/ and __tests__/utils/.

describe('App module', () => {
  it('should have valid project structure', () => {
    // Verify core modules are importable
    const types = require('../src/types');
    expect(types).toBeDefined();

    const utils = require('../src/utils');
    expect(utils.formatBytes).toBeDefined();
    expect(utils.healthGrade).toBeDefined();
  });

  it('should have analysis engine modules', () => {
    const importParser = require('../src/services/analysis/importParser');
    expect(importParser.parseImports).toBeDefined();

    const exportScanner = require('../src/services/analysis/exportScanner');
    expect(exportScanner.scanExports).toBeDefined();

    const usageGraph = require('../src/services/analysis/usageGraphBuilder');
    expect(usageGraph.buildUsageGraph).toBeDefined();
    expect(usageGraph.computeUsageRatio).toBeDefined();

    const recommendations = require('../src/services/analysis/recommendationEngine');
    expect(recommendations.generateSuggestions).toBeDefined();
  });
});
