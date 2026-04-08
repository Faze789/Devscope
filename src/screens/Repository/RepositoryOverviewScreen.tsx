/**
 * Repository Overview Screen — Main dashboard showing active repositories,
 * health scores, and dependency footprints.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks';
import { useRepositoryStore, useDependencyStore } from '../../store';
import { RepoCard } from '../../components/dashboard/RepoCard';
import { StatsRow } from '../../components/dashboard/StatsRow';
import { SectionHeader, EmptyState } from '../../components/common';
import type { RootStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function RepositoryOverviewScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const repositories = useRepositoryStore((s) => s.repositories);
  const dependencies = useDependencyStore((s) => s.dependencies);
  const cves = useDependencyStore((s) => s.cves);
  const [refreshing, setRefreshing] = React.useState(false);

  const totalDeps = dependencies.length;
  const totalCVEs = cves.length;
  const cvesInPath = cves.filter((c) => c.inUsagePath).length;
  const avgUsage =
    dependencies.length > 0
      ? Math.round(
          (dependencies.reduce((sum, d) => sum + d.usageRatio, 0) /
            dependencies.length) *
            100,
        )
      : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger re-analysis for active repo
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleAddRepo = useCallback(() => {
    // Navigate to the Settings tab within HomeTabs, not the stack screen
    navigation.navigate('Home', { screen: 'Settings' } as any);
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={theme.colors.statusBar}
        backgroundColor={theme.colors.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            DepScope
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Dependency Intelligence
          </Text>
        </View>

        {repositories.length > 0 && (
          <>
            {/* Global Stats */}
            <StatsRow
              stats={[
                { label: 'Dependencies', value: totalDeps },
                {
                  label: 'CVEs Total',
                  value: totalCVEs,
                  color: totalCVEs > 0 ? theme.colors.warning : undefined,
                },
                {
                  label: 'In Path',
                  value: cvesInPath,
                  color: cvesInPath > 0 ? theme.colors.error : theme.colors.success,
                },
                { label: 'Avg Usage', value: `${avgUsage}%` },
              ]}
            />

            {/* Repositories */}
            <SectionHeader
              title="Repositories"
              subtitle={`${repositories.length} tracked`}
              action={{ label: '+ Add', onPress: handleAddRepo }}
            />
            {repositories.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                onPress={() =>
                  navigation.navigate('DependencyList', {
                    repositoryId: repo.id,
                    repositoryName: repo.name,
                  })
                }
              />
            ))}
          </>
        )}

        {repositories.length === 0 && (
          <EmptyState
            title="No repositories tracked"
            description="Add a local repository to start analyzing dependency usage, detect dead weight, and scope CVEs to your actual code paths."
            action={{ label: 'Add Repository', onPress: handleAddRepo }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20, marginTop: 8 },
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 2 },
});
