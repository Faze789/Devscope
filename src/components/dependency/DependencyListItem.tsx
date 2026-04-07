import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks';
import { Card, Badge, ProgressBar } from '../common';
import { formatPercent, formatBytes } from '../../utils';
import type { Dependency } from '../../types';

interface DependencyListItemProps {
  dependency: Dependency;
  onPress: () => void;
}

export function DependencyListItem({ dependency, onPress }: DependencyListItemProps) {
  const theme = useTheme();
  const usagePercent = formatPercent(dependency.usageRatio);
  const usedCount = dependency.usedExports.length;
  const totalCount = dependency.totalExports;

  const cveCount = dependency.cves.length;
  const cvesInPath = dependency.cves.filter((c) => c.inUsagePath).length;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <View style={styles.header}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.colors.text }]}>
              {dependency.name}
            </Text>
            <Text style={[styles.version, { color: theme.colors.textTertiary }]}>
              {dependency.version}
            </Text>
          </View>
          {dependency.isDev && <Badge label="DEV" variant="neutral" />}
        </View>

        <View style={styles.usageRow}>
          <Text style={[styles.usageLabel, { color: theme.colors.textSecondary }]}>
            Usage: {usedCount} / {totalCount} exports ({usagePercent})
          </Text>
        </View>
        <ProgressBar
          progress={dependency.usageRatio}
          color={
            dependency.usageRatio < 0.1
              ? theme.colors.error
              : dependency.usageRatio < 0.3
              ? theme.colors.warning
              : theme.colors.success
          }
          height={5}
        />

        <View style={styles.footer}>
          <Text style={[styles.size, { color: theme.colors.textTertiary }]}>
            {formatBytes(dependency.packageSize)}
          </Text>

          {cveCount > 0 && (
            <View style={styles.cveRow}>
              {cvesInPath > 0 ? (
                <Badge label={`${cvesInPath} CVE in path`} variant="error" />
              ) : (
                <Badge label={`${cveCount} CVE (safe)`} variant="success" />
              )}
            </View>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontSize: 16, fontWeight: '600' },
  version: { fontSize: 13, fontFamily: 'monospace' },
  usageRow: { marginBottom: 6 },
  usageLabel: { fontSize: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  size: { fontSize: 12 },
  cveRow: { flexDirection: 'row', gap: 6 },
});
