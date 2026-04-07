/**
 * Settings Screen — Theme selection, repository management,
 * API tokens, and export options.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../hooks';
import { useThemeStore, useRepositoryStore, useDependencyStore } from '../../store';
import { Card, SectionHeader } from '../../components/common';
import type { Repository } from '../../types';
import { parseGitHubUrl, analyzeRepo, apiResponseToStoreData } from '../../services/api/depScopeApi';

export function SettingsScreen() {
  const theme = useTheme();
  const themePreference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const repositories = useRepositoryStore((s) => s.repositories);
  const addRepository = useRepositoryStore((s) => s.addRepository);
  const removeRepository = useRepositoryStore((s) => s.removeRepository);

  const [repoPath, setRepoPath] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const setDependencies = useDependencyStore((s) => s.setDependencies);
  const setCVEs = useDependencyStore((s) => s.setCVEs);
  const setUsageGraph = useDependencyStore((s) => s.setUsageGraph);
  const setSuggestions = useDependencyStore((s) => s.setSuggestions);
  const setUpgradeImpacts = useDependencyStore((s) => s.setUpgradeImpacts);

  const handleAddRepo = useCallback(async () => {
    const input = repoPath.trim();
    if (!input) return;

    const parsed = parseGitHubUrl(input);
    if (!parsed) {
      Alert.alert('Invalid Input', 'Enter a GitHub URL or owner/repo format.\nExample: facebook/react');
      return;
    }

    setAnalyzing(true);
    setStatusText('Analyzing repository...');

    try {
      const response = await analyzeRepo(
        parsed.owner,
        parsed.repo,
        undefined,
        githubToken || undefined,
      );

      const data = apiResponseToStoreData(response);

      addRepository(data.repository);
      setDependencies(data.dependencies);
      setCVEs(data.cves);
      setUsageGraph(data.usageGraph);
      setSuggestions(data.suggestions);
      setUpgradeImpacts(data.upgradeImpacts);

      setRepoPath('');
      setStatusText('');

      if (data.errors.length > 0) {
        Alert.alert('Analysis Complete', `Done with ${data.errors.length} warning(s):\n${data.errors.slice(0, 3).join('\n')}`);
      }
    } catch (err: any) {
      Alert.alert('Analysis Failed', err.message || 'Something went wrong');
      setStatusText('');
    } finally {
      setAnalyzing(false);
    }
  }, [repoPath, githubToken, addRepository, setDependencies, setCVEs, setUsageGraph, setSuggestions, setUpgradeImpacts]);

  const handleRemoveRepo = useCallback(
    (repo: Repository) => {
      Alert.alert(
        'Remove Repository',
        `Remove "${repo.name}" from DepScope? Analysis data will be deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeRepository(repo.id),
          },
        ],
      );
    },
    [removeRepository],
  );

  const themeOptions: Array<{ key: 'system' | 'dark' | 'light'; label: string }> = [
    { key: 'system', label: 'System' },
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Theme */}
        <SectionHeader title="Appearance" />
        <Card>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            Theme
          </Text>
          <View style={styles.themeRow}>
            {themeOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setPreference(opt.key)}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor:
                      themePreference === opt.key
                        ? theme.colors.primary
                        : theme.colors.surface,
                    borderColor:
                      themePreference === opt.key
                        ? theme.colors.primary
                        : theme.colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.themeText,
                    {
                      color:
                        themePreference === opt.key
                          ? '#FFF'
                          : theme.colors.textSecondary,
                    },
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Add Repository */}
        <SectionHeader title="Repositories" />
        <Card>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            Analyze GitHub Repository
          </Text>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
            Enter owner/repo or full GitHub URL
          </Text>
          <View style={styles.addRepoRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                },
              ]}
              placeholder="owner/repo or github.com/owner/repo"
              placeholderTextColor={theme.colors.textTertiary}
              value={repoPath}
              onChangeText={setRepoPath}
              editable={!analyzing}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: analyzing ? theme.colors.border : theme.colors.primary }]}
              onPress={handleAddRepo}
              disabled={analyzing}>
              {analyzing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.addBtnText}>Analyze</Text>
              )}
            </TouchableOpacity>
          </View>
          {analyzing && statusText ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
                {statusText}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Repository List */}
        {repositories.map((repo) => (
          <Card key={repo.id}>
            <View style={styles.repoRow}>
              <View style={styles.repoInfo}>
                <Text style={[styles.repoName, { color: theme.colors.text }]}>
                  {repo.name}
                </Text>
                <Text style={[styles.repoPath, { color: theme.colors.textTertiary }]}>
                  {repo.path}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveRepo(repo)}>
                <Text style={{ color: theme.colors.error, fontWeight: '600' }}>
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        {/* API Configuration */}
        <SectionHeader title="API Configuration" />
        <Card>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            GitHub Personal Access Token (optional)
          </Text>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
            Increases rate limits and enables private repo access
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                marginTop: 8,
              },
            ]}
            placeholder="ghp_..."
            placeholderTextColor={theme.colors.textTertiary}
            value={githubToken}
            onChangeText={setGithubToken}
            secureTextEntry
          />
        </Card>

        {/* Export */}
        <SectionHeader title="Reports & Export" />
        <Card>
          <TouchableOpacity style={styles.exportBtn}>
            <Text style={[styles.exportBtnText, { color: theme.colors.primary }]}>
              Export PDF Report
            </Text>
            <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
              Generate SOC2-ready exposure surface report
            </Text>
          </TouchableOpacity>
        </Card>
        <Card>
          <TouchableOpacity style={styles.exportBtn}>
            <Text style={[styles.exportBtnText, { color: theme.colors.primary }]}>
              Export CSV Data
            </Text>
            <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
              Download dependency and CVE data as CSV
            </Text>
          </TouchableOpacity>
        </Card>

        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: theme.colors.textTertiary }]}>
            DepScope v0.1.0
          </Text>
          <Text style={[styles.appDesc, { color: theme.colors.textTertiary }]}>
            Usage-level dependency intelligence
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  hint: { fontSize: 12, marginTop: 2 },
  themeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  themeText: { fontSize: 14, fontWeight: '600' },
  addRepoRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  repoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  repoInfo: { flex: 1 },
  repoName: { fontSize: 15, fontWeight: '600' },
  repoPath: { fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  statusText: { fontSize: 13 },
  exportBtn: { paddingVertical: 4 },
  exportBtnText: { fontSize: 15, fontWeight: '600' },
  appInfo: { alignItems: 'center', marginTop: 40 },
  appName: { fontSize: 14, fontWeight: '600' },
  appDesc: { fontSize: 12, marginTop: 2 },
});
