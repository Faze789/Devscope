import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks';
import { healthGrade } from '../../utils';

interface HealthScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function HealthScore({ score, size = 'md' }: HealthScoreProps) {
  const theme = useTheme();
  const grade = healthGrade(score);
  const color = scoreColor(score, theme);
  const dimensions = sizes[size];

  return (
    <View
      style={[
        styles.container,
        {
          width: dimensions.outer,
          height: dimensions.outer,
          borderRadius: dimensions.outer / 2,
          borderColor: color,
          borderWidth: dimensions.border,
        },
      ]}>
      <Text
        style={[
          styles.grade,
          { color, fontSize: dimensions.fontSize },
        ]}>
        {grade}
      </Text>
      <Text
        style={[
          styles.score,
          { color: theme.colors.textSecondary, fontSize: dimensions.scoreFontSize },
        ]}>
        {score}
      </Text>
    </View>
  );
}

const sizes = {
  sm: { outer: 44, border: 2, fontSize: 16, scoreFontSize: 9 },
  md: { outer: 64, border: 3, fontSize: 22, scoreFontSize: 11 },
  lg: { outer: 88, border: 4, fontSize: 30, scoreFontSize: 13 },
};

function scoreColor(score: number, theme: any): string {
  if (score >= 80) return theme.colors.success;
  if (score >= 60) return theme.colors.warning;
  return theme.colors.error;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grade: {
    fontWeight: '700',
  },
  score: {
    fontWeight: '500',
    marginTop: -2,
  },
});
