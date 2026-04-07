import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks';
import { Card, Badge } from '../common';
import type { CVE } from '../../types';

interface CVECardProps {
  cve: CVE;
  onPress: () => void;
}

export function CVECard({ cve, onPress }: CVECardProps) {
  const theme = useTheme();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <View style={styles.header}>
          <View style={styles.idRow}>
            <Text style={[styles.id, { color: theme.colors.text }]}>
              {cve.id}
            </Text>
            <Badge
              label={cve.severity}
              variant={
                cve.severity === 'CRITICAL'
                  ? 'critical'
                  : cve.severity === 'HIGH'
                  ? 'high'
                  : cve.severity === 'MEDIUM'
                  ? 'medium'
                  : cve.severity === 'LOW'
                  ? 'low'
                  : 'neutral'
              }
            />
          </View>
          {cve.cvssScore > 0 && (
            <Text style={[styles.cvss, { color: theme.colors.textSecondary }]}>
              CVSS {cve.cvssScore.toFixed(1)}
            </Text>
          )}
        </View>

        <Text
          style={[styles.summary, { color: theme.colors.textSecondary }]}
          numberOfLines={2}>
          {cve.summary}
        </Text>

        <View style={styles.footer}>
          {cve.inUsagePath ? (
            <Badge label="In your usage path" variant="error" size="md" />
          ) : (
            <Badge label="Not in your usage path" variant="success" size="md" />
          )}

          {cve.fixedVersion && (
            <Text style={[styles.fix, { color: theme.colors.info }]}>
              Fixed in {cve.fixedVersion}
            </Text>
          )}
        </View>

        {cve.affectedFunctions.length > 0 && (
          <View style={styles.functions}>
            <Text style={[styles.functionsLabel, { color: theme.colors.textTertiary }]}>
              Affected: {cve.affectedFunctions.join(', ')}
            </Text>
          </View>
        )}
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
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  id: { fontSize: 15, fontWeight: '600', fontFamily: 'monospace' },
  cvss: { fontSize: 13, fontWeight: '600' },
  summary: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fix: { fontSize: 13, fontWeight: '500' },
  functions: { marginTop: 8 },
  functionsLabel: { fontSize: 12, fontFamily: 'monospace' },
});
