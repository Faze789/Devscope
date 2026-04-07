/**
 * Dependency Detail Screen — Deep view into a single dependency showing
 * export usage, CVE alerts, usage graph, and upgrade impact.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks';
import { useDependencyStore } from '../../store';
import {
  Card,
  Badge,
  ProgressBar,
  HealthScore,
  SectionHeader,
} from '../../components/common';
import { CVECard } from '../../components/cve/CVECard';
import { DependencyGraph } from '../../components/graph/DependencyGraph';
import { SuggestionCard } from '../../components/refactor/SuggestionCard';
import { UpgradeModal } from '../../components/refactor/UpgradeModal';
import { formatBytes, formatPercent } from '../../utils';
import type { RootStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'DependencyDetail'>;

const screenWidth = Dimensions.get('window').width;

export function DependencyDetailScreen() {
  const theme = useTheme();
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavProp>();
  const { packageName } = route.params;

  const dep = useDependencyStore((s) => s.getDependency(packageName));
  const usageGraph = useDependencyStore((s) => s.usageGraph);
  const suggestions = useDependencyStore((s) => s.suggestions);
  const upgradeImpacts = useDependencyStore((s) => s.upgradeImpacts);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'exports' | 'cves' | 'graph' | 'refactor'>('exports');

  const graphNodes = useMemo(
    () => Array.from(usageGraph.values()).filter((n) => n.packageName === packageName),
    [usageGraph, packageName],
  );

  const depSuggestions = useMemo(
    () => suggestions.filter((s) => s.packageName === packageName),
    [suggestions, packageName],
  );

  const depUpgrade = useMemo(
    () => upgradeImpacts.find((u) => u.packageName === packageName),
    [upgradeImpacts, packageName],
  );

  if (!dep) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: 40 }}>
          Dependency not found
        </Text>
      </View>
    );
  }

  const usedCount = dep.usedExports.length;
  const totalCount = dep.totalExports;

  const tabs = [
    { key: 'exports' as const, label: `Exports (${usedCount}/${totalCount})` },
    { key: 'cves' as const, label: `CVEs (${dep.cves.length})` },
    { key: 'graph' as const, label: 'Graph' },
    { key: 'refactor' as const, label: 'Refactor' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.pkgName, { color: theme.colors.text }]}>
              {dep.name}
            </Text>
            <Text style={[styles.version, { color: theme.colors.textTertiary }]}>
              {dep.version}
            </Text>
            <View style={styles.badges}>
              {dep.isDev && <Badge label="DEV" variant="neutral" />}
              <Badge
                label={formatBytes(dep.packageSize)}
                variant="neutral"
              />
              {dep.cves.length > 0 && (
                <Badge
                  label={`${dep.cves.length} CVE${dep.cves.length > 1 ? 's' : ''}`}
                  variant={dep.cves.some((c) => c.inUsagePath) ? 'error' : 'warning'}
                />
              )}
            </View>
          </View>
          <HealthScore score={dep.healthScore} size="lg" />
        </View>

        {/* Usage Summary */}
        <Card>
          <Text style={[styles.usageTitle, { color: theme.colors.textSecondary }]}>
            Export Usage
          </Text>
          <View style={styles.usageSummary}>
            <Text style={[styles.usageFraction, { color: theme.colors.text }]}>
              {usedCount}
              <Text style={{ color: theme.colors.textTertiary }}> / {totalCount}</Text>
            </Text>
            <Text style={[styles.usagePercent, { color: theme.colors.primary }]}>
              {formatPercent(dep.usageRatio)}
            </Text>
          </View>
          <ProgressBar
            progress={dep.usageRatio}
            color={
              dep.usageRatio < 0.05
                ? theme.colors.error
                : dep.usageRatio < 0.2
                ? theme.colors.warning
                : theme.colors.success
            }
            height={8}
          />
          <Text style={[styles.usageCaption, { color: theme.colors.textTertiary }]}>
            {totalCount - usedCount} exports unused ({formatPercent(1 - dep.usageRatio)} dead weight)
          </Text>
        </Card>

        {depUpgrade && (
          <TouchableOpacity onPress={() => setShowUpgradeModal(true)}>
            <Card elevated>
              <View style={styles.upgradeRow}>
                <View>
                  <Text style={[styles.upgradeLabel, { color: theme.colors.info }]}>
                    Upgrade Available
                  </Text>
                  <Text style={[styles.upgradeVersion, { color: theme.colors.textSecondary }]}>
                    {depUpgrade.currentVersion} → {depUpgrade.targetVersion}
                  </Text>
                </View>
                <Badge
                  label={`${depUpgrade.risk} risk`}
                  variant={
                    depUpgrade.risk === 'high'
                      ? 'error'
                      : depUpgrade.risk === 'medium'
                      ? 'warning'
                      : 'success'
                  }
                  size="md"
                />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Tabs */}
        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tab,
                {
                  borderBottomColor:
                    activeTab === tab.key
                      ? theme.colors.primary
                      : 'transparent',
                },
              ]}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === tab.key
                        ? theme.colors.primary
                        : theme.colors.textTertiary,
                  },
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'exports' && (
          <View>
            {dep.usedExports.map((exp, i) => (
              <Card key={i}>
                <View style={styles.exportRow}>
                  <View style={styles.exportInfo}>
                    <Text style={[styles.exportName, { color: theme.colors.text }]}>
                      {exp.name}
                    </Text>
                    <Badge label={exp.kind} variant="neutral" />
                  </View>
                  {exp.isDefault && <Badge label="default" variant="info" />}
                  {exp.isReExport && (
                    <Text style={[styles.reExport, { color: theme.colors.textTertiary }]}>
                      re-exported from {exp.reExportSource}
                    </Text>
                  )}
                </View>
              </Card>
            ))}
            {dep.usedExports.length === 0 && (
              <Text
                style={[styles.emptyTab, { color: theme.colors.textTertiary }]}>
                No used exports detected
              </Text>
            )}
          </View>
        )}

        {activeTab === 'cves' && (
          <View>
            {dep.cves.map((cve) => (
              <CVECard
                key={cve.id}
                cve={cve}
                onPress={() =>
                  navigation.navigate('CVEDetail', { cveId: cve.id })
                }
              />
            ))}
            {dep.cves.length === 0 && (
              <Card>
                <View style={styles.noCves}>
                  <Badge label="No known vulnerabilities" variant="success" size="md" />
                </View>
              </Card>
            )}
          </View>
        )}

        {activeTab === 'graph' && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <DependencyGraph
              nodes={graphNodes}
              packageName={packageName}
              width={screenWidth - 32}
              height={300}
            />
          </Card>
        )}

        {activeTab === 'refactor' && (
          <View>
            {depSuggestions.map((suggestion, i) => (
              <SuggestionCard key={i} suggestion={suggestion} />
            ))}
            {depSuggestions.length === 0 && (
              <Text
                style={[styles.emptyTab, { color: theme.colors.textTertiary }]}>
                No refactoring suggestions
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <UpgradeModal
        visible={showUpgradeModal}
        impact={depUpgrade ?? null}
        onClose={() => setShowUpgradeModal(false)}
        onConfirm={() => {
          setShowUpgradeModal(false);
          // Would trigger actual upgrade
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 16 },
  pkgName: { fontSize: 24, fontWeight: '700' },
  version: { fontSize: 14, fontFamily: 'monospace', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  usageTitle: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  usageSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  usageFraction: { fontSize: 28, fontWeight: '700' },
  usagePercent: { fontSize: 20, fontWeight: '600' },
  usageCaption: { fontSize: 12, marginTop: 6 },
  upgradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upgradeLabel: { fontSize: 14, fontWeight: '600' },
  upgradeVersion: { fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  exportRow: { gap: 4 },
  exportInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportName: { fontSize: 15, fontWeight: '500', fontFamily: 'monospace' },
  reExport: { fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  emptyTab: { textAlign: 'center', padding: 30, fontSize: 14 },
  noCves: { alignItems: 'center', padding: 16 },
});
