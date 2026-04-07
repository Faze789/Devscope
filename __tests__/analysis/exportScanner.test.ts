import { scanExports } from '../../src/services/analysis/exportScanner';

describe('exportScanner', () => {
  it('should scan named export functions', () => {
    const source = `
export function debounce() {}
export function throttle() {}
export const VERSION = '1.0';
`;
    const result = scanExports('/pkg/index.js', source);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('debounce');
    expect(result[0].kind).toBe('function');
    expect(result[2].kind).toBe('variable');
  });

  it('should scan default exports', () => {
    const source = `export default function main() {}`;
    const result = scanExports('/pkg/index.js', source);
    expect(result).toHaveLength(1);
    expect(result[0].isDefault).toBe(true);
    expect(result[0].kind).toBe('function');
  });

  it('should scan re-exports', () => {
    const source = `
export { foo, bar } from './sub';
export * from './utils';
export * as helpers from './helpers';
`;
    const result = scanExports('/pkg/index.js', source);
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.some((e) => e.isReExport && e.name === 'foo')).toBe(true);
    expect(result.some((e) => e.name === '*' && e.isReExport)).toBe(true);
    expect(result.some((e) => e.name === 'helpers' && e.kind === 'namespace')).toBe(true);
  });

  it('should scan class exports', () => {
    const source = `export class MyService {}`;
    const result = scanExports('/pkg/index.js', source);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MyService');
    expect(result[0].kind).toBe('class');
  });

  it('should scan type exports', () => {
    const source = `
export interface Config {}
export type Options = {};
export enum Status { Active, Inactive }
`;
    const result = scanExports('/pkg/index.ts', source);
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('type');
    expect(result[1].kind).toBe('type');
    expect(result[2].kind).toBe('enum');
  });

  it('should scan named export blocks', () => {
    const source = `
const a = 1;
const b = 2;
export { a, b };
`;
    const result = scanExports('/pkg/index.js', source);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('a');
    expect(result[1].name).toBe('b');
  });
});
