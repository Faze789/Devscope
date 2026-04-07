import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks';
import { Card, Badge, HealthScore } from '../common';
import { formatRelativeTime } from '../../utils';
import type { Repository } from '../../types';

interface RepoCardProps {
  repo: Repository;
  onPress: () => void;
}

export function RepoCard({ repo, onPress }: RepoCardProps) {
  const theme = useTheme();

  const statusBadge = (() => {
    switch (repo.analysisStatus.type) {
      case 'analyzing':
        return <Badge label="Analyzing..." variant="info" />;
      case 'complete':
        return <Badge label="Up to date" variant="success" />;
      case 'error':
        return <Badge label="Error" variant="error" />;
      default:
        return <Badge label="Not analyzed" variant="neutral" />;
    }
  })();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.name, { color: theme.colors.text }]}>
              {repo.name}
            </Text>
            <Text style={[styles.path, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {repo.path}
            </Text>
          </View>
          <HealthScore score={repo.healthScore} size="sm" />
        </View>

        <View style={styles.meta}>
          {statusBadge}
          <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
            {repo.dependencyCount} deps
          </Text>
          <Badge
            label={repo.packageManager}
            variant="neutral"
          />
          {repo.lastAnalyzed && (
            <Text style={[styles.metaText, { color: theme.colors.textTertiary }]}>
              {formatRelativeTime(repo.lastAnalyzed)}
            </Text>
          )}
        </View>

        {repo.analysisStatus.type === 'analyzing' && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: theme.colors.borderSubtle },
              ]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.primary,
                    width: `${repo.analysisStatus.progress * 100}%`,
                  },
                ]}
              />
            </View>
            <Text
              style={[styles.progressText, { color: theme.colors.textTertiary }]}
              numberOfLines={1}>
              {repo.analysisStatus.currentFile}
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  name: { fontSize: 17, fontWeight: '600' },
  path: { fontSize: 12, marginTop: 2, fontFamily: 'monospace' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaText: { fontSize: 13 },
  progressContainer: { marginTop: 12 },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 11, fontFamily: 'monospace' },
});
