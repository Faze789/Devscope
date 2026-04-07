import { Appearance } from 'react-native';

export const palette = {
  // Brand
  primary: '#6366F1',       // Indigo-500
  primaryLight: '#818CF8',  // Indigo-400
  primaryDark: '#4F46E5',   // Indigo-600

  // Semantic
  success: '#22C55E',
  successBg: '#052E16',
  warning: '#F59E0B',
  warningBg: '#451A03',
  error: '#EF4444',
  errorBg: '#450A0A',
  info: '#3B82F6',

  // Severity
  critical: '#DC2626',
  high: '#F97316',
  medium: '#EAB308',
  low: '#22D3EE',

  // Neutrals
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  gray950: '#0A0F1A',
  black: '#000000',
} as const;

export interface Theme {
  mode: 'dark' | 'light';
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    border: string;
    borderSubtle: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    primary: string;
    primaryLight: string;
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    error: string;
    errorBg: string;
    info: string;
    critical: string;
    high: string;
    medium: string;
    low: string;
    cardBackground: string;
    statusBar: 'light-content' | 'dark-content';
  };
  spacing: typeof spacing;
  typography: typeof typography;
  borderRadius: typeof borderRadius;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionBold: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  mono: { fontSize: 13, fontWeight: '400' as const, fontFamily: 'monospace', lineHeight: 18 },
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: palette.gray950,
    surface: palette.gray900,
    surfaceElevated: palette.gray800,
    border: palette.gray700,
    borderSubtle: palette.gray800,
    text: palette.gray50,
    textSecondary: palette.gray400,
    textTertiary: palette.gray500,
    primary: palette.primary,
    primaryLight: palette.primaryLight,
    success: palette.success,
    successBg: palette.successBg,
    warning: palette.warning,
    warningBg: palette.warningBg,
    error: palette.error,
    errorBg: palette.errorBg,
    info: palette.info,
    critical: palette.critical,
    high: palette.high,
    medium: palette.medium,
    low: palette.low,
    cardBackground: palette.gray900,
    statusBar: 'light-content',
  },
  spacing,
  typography,
  borderRadius,
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: palette.gray50,
    surface: palette.white,
    surfaceElevated: palette.white,
    border: palette.gray200,
    borderSubtle: palette.gray100,
    text: palette.gray900,
    textSecondary: palette.gray600,
    textTertiary: palette.gray400,
    primary: palette.primaryDark,
    primaryLight: palette.primary,
    success: '#16A34A',
    successBg: '#F0FDF4',
    warning: '#D97706',
    warningBg: '#FFFBEB',
    error: '#DC2626',
    errorBg: '#FEF2F2',
    info: '#2563EB',
    critical: palette.critical,
    high: '#EA580C',
    medium: '#CA8A04',
    low: '#0891B2',
    cardBackground: palette.white,
    statusBar: 'dark-content',
  },
  spacing,
  typography,
  borderRadius,
};

export function getSystemTheme(): Theme {
  return Appearance.getColorScheme() === 'dark' ? darkTheme : lightTheme;
}
