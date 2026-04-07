import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useThemeStore } from '../store';
import type { Theme } from '../theme';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Create themed StyleSheets that automatically update with theme changes.
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T,
): T {
  const theme = useThemeStore((s) => s.theme);
  return useMemo(() => StyleSheet.create(factory(theme)) as unknown as T, [theme, factory]);
}

/** Access the current theme */
export function useTheme(): Theme {
  return useThemeStore((s) => s.theme);
}
