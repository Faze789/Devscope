/**
 * CVE Detail Screen — Full view of a vulnerability including
 * affected functions, usage path mapping, and references.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTheme } from '../../hooks';
import { useDependencyStore } from '../../store';
import { Card, Badge, SectionHeader } from '../../components/common';
import type { RootStackParamList } from '../../navigation/types';

type RoutePropType = RouteProp<RootStackParamList, 'CVEDetail'>;

export function CVEDetailScreen() {
  const theme = useTheme();
  const route = useRoute<RoutePropType>();
  const { cveId } = route.params;
  const cve = useDependencyStore((s) => s.cves.find((c) => c.id === cveId));

  if (!cve) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.textTertiary, padding: 40, textAlign: 'center' }}>
          CVE not found
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.cveId, { color: theme.colors.text }]}>
            {cve.id}
          </Text>
          <View style={styles.badges}>
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
              size="md"
            />
            {cve.cvssScore > 0 && (
              <Badge
                label={`CVSS ${cve.cvssScore.toFixed(1)}`}
                variant="neutral"
                size="md"
              />
            )}
          </View>
        </View>

        {/* Usage Path Badge */}
        <Card
          style={{
            backgroundColor: cve.inUsagePath
              ? theme.colors.errorBg
              : theme.colors.successBg,
          }}>
          <View style={styles.usagePathRow}>
            <Text
              style={[
                styles.usagePathText,
                {
                  color: cve.inUsagePath
                    ? theme.colors.error
                    : theme.colors.success,
                },
              ]}>
              {cve.inUsagePath
                ? 'This vulnerability IS in your usage path'
                : 'This vulnerability is NOT in your usage path'}
            </Text>
            <Text
              style={[
                styles.usagePathSub,
                { color: theme.colors.textSecondary },
              ]}>
              {cve.inUsagePath
                ? 'Your code directly or transitively uses affected functions'
                : 'Your code does not invoke any of the affected functions'}
            </Text>
          </View>
        </Card>

        {/* Summary */}
        <SectionHeader title="Summary" />
        <Card>
          <Text style={[styles.summary, { color: theme.colors.text }]}>
            {cve.summary}
          </Text>
        </Card>

        {/* Details */}
        {cve.details && (
          <>
            <SectionHeader title="Details" />
            <Card>
              <Text style={[styles.details, { color: theme.colors.textSecondary }]}>
                {cve.details}
              </Text>
            </Card>
          </>
        )}

        {/* Affected Functions */}
        {cve.affectedFunctions.length > 0 && (
          <>
            <SectionHeader
              title="Affected Functions"
              subtitle={`${cve.affectedFunctions.length} function(s)`}
            />
            <Card>
              {cve.affectedFunctions.map((fn, i) => (
                <View
                  key={i}
                  style={[
                    styles.functionItem,
                    i > 0 && { borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 },
                  ]}>
                  <Text style={[styles.functionName, { color: theme.colors.text }]}>
                    {fn}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* Fix Info */}
        {cve.fixedVersion && (
          <>
            <SectionHeader title="Fix" />
            <Card>
              <Text style={[styles.fixLabel, { color: theme.colors.textSecondary }]}>
                Fixed in version:
              </Text>
              <Text style={[styles.fixVersion, { color: theme.colors.success }]}>
                {cve.fixedVersion}
              </Text>
            </Card>
          </>
        )}

        {/* Affected Versions */}
        {cve.affectedVersions.length > 0 && (
          <>
            <SectionHeader title="Affected Versions" />
            <Card>
              <Text style={[styles.versions, { color: theme.colors.textSecondary }]}>
                {cve.affectedVersions.join(', ')}
              </Text>
            </Card>
          </>
        )}

        {/* Aliases */}
        {cve.aliases.length > 0 && (
          <>
            <SectionHeader title="Aliases" />
            <View style={styles.aliasRow}>
              {cve.aliases.map((alias) => (
                <Badge key={alias} label={alias} variant="neutral" />
              ))}
            </View>
          </>
        )}

        {/* References */}
        {cve.references.length > 0 && (
          <>
            <SectionHeader title="References" />
            <Card>
              {cve.references.map((url, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(url)}
                  style={styles.refLink}>
                  <Text
                    style={[styles.refUrl, { color: theme.colors.info }]}
                    numberOfLines={1}>
                    {url}
                  </Text>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}

        {/* Dates */}
        <View style={styles.dates}>
          {cve.published && (
            <Text style={[styles.dateText, { color: theme.colors.textTertiary }]}>
              Published: {new Date(cve.published).toLocaleDateString()}
            </Text>
          )}
          {cve.modified && (
            <Text style={[styles.dateText, { color: theme.colors.textTertiary }]}>
              Modified: {new Date(cve.modified).toLocaleDateString()}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  cveId: { fontSize: 24, fontWeight: '700', fontFamily: 'monospace' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  usagePathRow: { alignItems: 'center' },
  usagePathText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  usagePathSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  summary: { fontSize: 16, lineHeight: 24 },
  details: { fontSize: 14, lineHeight: 22 },
  functionItem: { paddingVertical: 8 },
  functionName: { fontSize: 14, fontFamily: 'monospace', fontWeight: '500' },
  fixLabel: { fontSize: 14 },
  fixVersion: { fontSize: 18, fontWeight: '600', fontFamily: 'monospace', marginTop: 4 },
  versions: { fontSize: 13, fontFamily: 'monospace', lineHeight: 20 },
  aliasRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  refLink: { paddingVertical: 6 },
  refUrl: { fontSize: 13 },
  dates: { marginTop: 20, gap: 4 },
  dateText: { fontSize: 12 },
});
