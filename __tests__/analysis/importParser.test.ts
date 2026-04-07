import { parseImports, extractPackageName } from '../../src/services/analysis/importParser';

describe('importParser', () => {
  describe('parseImports', () => {
    it('should parse named imports', () => {
      const source = `import { useState, useEffect } from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].packageName).toBe('react');
      expect(result[0].importedSymbols).toHaveLength(2);
      expect(result[0].importedSymbols[0].exportedName).toBe('useState');
      expect(result[0].importedSymbols[1].exportedName).toBe('useEffect');
    });

    it('should parse default imports', () => {
      const source = `import React from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].importedSymbols).toHaveLength(1);
      expect(result[0].importedSymbols[0].isDefault).toBe(true);
      expect(result[0].importedSymbols[0].localName).toBe('React');
    });

    it('should parse namespace imports', () => {
      const source = `import * as lodash from 'lodash';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].isNamespaceImport).toBe(true);
      expect(result[0].importedSymbols[0].exportedName).toBe('*');
    });

    it('should parse side-effect imports', () => {
      const source = `import 'reflect-metadata';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].isSideEffect).toBe(true);
      expect(result[0].packageName).toBe('reflect-metadata');
    });

    it('should parse dynamic imports', () => {
      const source = `const mod = import('lodash/debounce');`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].isDynamic).toBe(true);
      expect(result[0].packageName).toBe('lodash');
    });

    it('should parse require with destructuring', () => {
      const source = `const { readFile, writeFile } = require('fs');`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].isRequire).toBe(true);
      expect(result[0].importedSymbols).toHaveLength(2);
      expect(result[0].importedSymbols[0].exportedName).toBe('readFile');
    });

    it('should parse scoped package imports', () => {
      const source = `import { S3Client } from '@aws-sdk/client-s3';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].packageName).toBe('@aws-sdk/client-s3');
    });

    it('should parse renamed imports', () => {
      const source = `import { useState as useStateAlias } from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result[0].importedSymbols[0].exportedName).toBe('useState');
      expect(result[0].importedSymbols[0].localName).toBe('useStateAlias');
    });

    it('should parse type-only imports', () => {
      const source = `import type { ReactNode } from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].importedSymbols[0].isTypeOnly).toBe(true);
    });

    it('should ignore relative imports', () => {
      const source = `
import { foo } from './local';
import { bar } from '../parent';
import { baz } from 'react';
`;
      const result = parseImports('/test/file.ts', source);
      expect(result).toHaveLength(1);
      expect(result[0].packageName).toBe('react');
    });

    it('should handle multi-line imports', () => {
      const source = `import {
  useState,
  useEffect,
  useCallback,
} from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      expect(result[0].importedSymbols.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle default + named combined imports', () => {
      const source = `import React, { useState } from 'react';`;
      const result = parseImports('/test/file.ts', source);

      expect(result).toHaveLength(1);
      const symbols = result[0].importedSymbols;
      expect(symbols.some((s) => s.isDefault && s.localName === 'React')).toBe(true);
      expect(symbols.some((s) => s.exportedName === 'useState')).toBe(true);
    });
  });

  describe('extractPackageName', () => {
    it('should extract simple package names', () => {
      expect(extractPackageName('react')).toBe('react');
      expect(extractPackageName('lodash')).toBe('lodash');
    });

    it('should extract scoped package names', () => {
      expect(extractPackageName('@aws-sdk/client-s3')).toBe('@aws-sdk/client-s3');
      expect(extractPackageName('@types/react')).toBe('@types/react');
    });

    it('should extract package from deep imports', () => {
      expect(extractPackageName('lodash/debounce')).toBe('lodash');
      expect(extractPackageName('@aws-sdk/client-s3/commands')).toBe('@aws-sdk/client-s3');
    });

    it('should return null for relative imports', () => {
      expect(extractPackageName('./local')).toBeNull();
      expect(extractPackageName('../parent')).toBeNull();
      expect(extractPackageName('/absolute')).toBeNull();
    });
  });
});
