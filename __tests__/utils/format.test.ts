import {
  formatBytes,
  formatPercent,
  truncatePath,
  healthGrade,
  severityColor,
} from '../../src/utils/format';

describe('format utilities', () => {
  describe('formatBytes', () => {
    it('should format zero', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(5120)).toBe('5.0 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });
  });

  describe('formatPercent', () => {
    it('should format ratios as percentages', () => {
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(1)).toBe('100%');
      expect(formatPercent(0.033)).toBe('3%');
    });
  });

  describe('truncatePath', () => {
    it('should not truncate short paths', () => {
      expect(truncatePath('/src/file.ts')).toBe('/src/file.ts');
    });

    it('should truncate long paths', () => {
      const longPath = '/very/long/path/that/goes/on/and/on/src/file.ts';
      const result = truncatePath(longPath, 30);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toContain('src/file.ts');
    });
  });

  describe('healthGrade', () => {
    it('should return correct grades', () => {
      expect(healthGrade(95)).toBe('A');
      expect(healthGrade(85)).toBe('B');
      expect(healthGrade(75)).toBe('C');
      expect(healthGrade(65)).toBe('D');
      expect(healthGrade(50)).toBe('F');
    });
  });

  describe('severityColor', () => {
    it('should map severity to color keys', () => {
      expect(severityColor('CRITICAL')).toBe('critical');
      expect(severityColor('HIGH')).toBe('high');
      expect(severityColor('MEDIUM')).toBe('medium');
      expect(severityColor('LOW')).toBe('low');
      expect(severityColor('UNKNOWN')).toBe('textTertiary');
    });
  });
});
