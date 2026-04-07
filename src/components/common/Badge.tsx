import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks';
import type { Theme } from '../../theme';

interface BadgeProps {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'critical' | 'high' | 'medium' | 'low';
  size?: 'sm' | 'md';
}

export function Badge({ label, variant, size = 'sm' }: BadgeProps) {
  const theme = useTheme();
  const colors = getBadgeColors(theme, variant);

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, size === 'md' && styles.badgeMd]}>
      <Text style={[styles.label, { color: colors.text }, size === 'md' && styles.labelMd]}>
        {label}
      </Text>
    </View>
  );
}

function getBadgeColors(theme: Theme, variant: BadgeProps['variant']) {
  switch (variant) {
    case 'success':
      return { bg: theme.colors.successBg, text: theme.colors.success };
    case 'warning':
      return { bg: theme.colors.warningBg, text: theme.colors.warning };
    case 'error':
      return { bg: theme.colors.errorBg, text: theme.colors.error };
    case 'critical':
      return { bg: theme.colors.errorBg, text: theme.colors.critical };
    case 'high':
      return { bg: theme.colors.warningBg, text: theme.colors.high };
    case 'medium':
      return { bg: theme.colors.warningBg, text: theme.colors.medium };
    case 'low':
      return { bg: theme.colors.successBg, text: theme.colors.low };
    case 'info':
      return {
        bg: theme.mode === 'dark' ? '#1E1B4B' : '#EFF6FF',
        text: theme.colors.info,
      };
    case 'neutral':
    default:
      return {
        bg: theme.colors.surface,
        text: theme.colors.textSecondary,
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelMd: {
    fontSize: 13,
  },
});
