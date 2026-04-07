import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks';
import { Card, Badge } from '../common';
import { formatBytes, formatPercent } from '../../utils';
import type { RefactorSuggestion } from '../../types';

interface SuggestionCardProps {
  suggestion: RefactorSuggestion;
  onCopy?: () => void;
  onExport?: () => void;
}

const TYPE_LABELS: Record<RefactorSuggestion['type'], string> = {
  replace_package: 'Replace Package',
  inline_code: 'Inline Code',
  use_native: 'Use Native',
  tree_shake: 'Tree Shake',
};

export function SuggestionCard({ suggestion, onCopy, onExport }: SuggestionCardProps) {
  const theme = useTheme();

  return (
    <Card>
      <View style={styles.header}>
        <Badge label={TYPE_LABELS[suggestion.type]} variant="info" />
        <Text style={[styles.confidence, { color: theme.colors.textTertiary }]}>
          {formatPercent(suggestion.confidence)} confidence
        </Text>
      </View>

      <Text style={[styles.package, { color: theme.colors.text }]}>
        {suggestion.packageName}
      </Text>

      <Text style={[styles.reason, { color: theme.colors.textSecondary }]}>
        {suggestion.reason}
      </Text>

      {suggestion.alternative && (
        <View
          style={[
            styles.alternative,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderSubtle },
          ]}>
          <Text style={[styles.altLabel, { color: theme.colors.textTertiary }]}>
            Alternative:
          </Text>
          <Text style={[styles.altValue, { color: theme.colors.primary }]}>
            {suggestion.alternative}
          </Text>
        </View>
      )}

      {suggestion.codeSnippet && (
        <View
          style={[styles.codeBlock, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.code, { color: theme.colors.text }]}>
            {suggestion.codeSnippet}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={[styles.savings, { color: theme.colors.success }]}>
          Saves ~{formatBytes(suggestion.sizeReduction)}
        </Text>

        <View style={styles.actions}>
          {onCopy && (
            <TouchableOpacity onPress={onCopy} style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>
                Copy
              </Text>
            </TouchableOpacity>
          )}
          {onExport && (
            <TouchableOpacity onPress={onExport} style={styles.actionBtn}>
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>
                Export
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  confidence: { fontSize: 12 },
  package: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  reason: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  alternative: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  altLabel: { fontSize: 13 },
  altValue: { fontSize: 13, fontWeight: '600' },
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  code: { fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savings: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: { fontSize: 14, fontWeight: '600' },
});
