import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks';
import { Card } from '../common';

interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

interface StatsRowProps {
  stats: StatItem[];
}

export function StatsRow({ stats }: StatsRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {stats.map((stat, i) => (
        <Card key={i} style={styles.statCard}>
          <Text
            style={[
              styles.value,
              { color: stat.color ?? theme.colors.text },
            ]}>
            {stat.value}
          </Text>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {stat.label}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
