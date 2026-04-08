/**
 * Dependency List Screen — Shows all dependencies for a repository
 * with search, sort, and filter capabilities.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks';
import { useDependencyStore } from '../../store';
import { DependencyListItem } from '../../components/dependency/DependencyListItem';
import { Badge } from '../../components/common';
import type { RootStackParamList } from '../../navigation/types';
import type { Dependency } from '../../types';

type SortKey = 'name' | 'usage' | 'size' | 'health' | 'cves';
type FilterKey = 'all' | 'production' | 'dev' | 'low-usage' | 'has-cve';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function DependencyListScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const dependencies = useDependencyStore((s) => s.dependencies);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    let result = [...dependencies];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.version.includes(q),
      );
    }

    // Filter
    switch (filter) {
      case 'production':
        result = result.filter((d) => !d.isDev);
        break;
      case 'dev':
        result = result.filter((d) => d.isDev);
        break;
      case 'low-usage':
        result = result.filter((d) => d.usageRatio < 0.1);
        break;
      case 'has-cve':
        result = result.filter((d) => d.cves.length > 0);
        break;
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return a.usageRatio - b.usageRatio;
        case 'size':
          return b.packageSize - a.packageSize;
        case 'health':
          return a.healthScore - b.healthScore;
        case 'cves':
          return b.cves.length - a.cves.length;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [dependencies, search, sortBy, filter]);

  const renderItem = ({ item }: { item: Dependency }) => (
    <DependencyListItem
      dependency={item}
      onPress={() =>
        navigation.navigate('DependencyDetail', {
          packageName: item.name,
        })
      }
    />
  );

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'production', label: 'Prod' },
    { key: 'dev', label: 'Dev' },
    { key: 'low-usage', label: '<10% used' },
    { key: 'has-cve', label: 'Has CVE' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            },
          ]}
          placeholder="Search dependencies..."
          placeholderTextColor={theme.colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  filter === f.key ? theme.colors.primary : theme.colors.surface,
                borderColor:
                  filter === f.key ? theme.colors.primary : theme.colors.border,
              },
            ]}>
            <Text
              style={[
                styles.chipText,
                {
                  color: filter === f.key ? '#FFF' : theme.colors.textSecondary,
                },
              ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort chips */}
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: theme.colors.textTertiary }]}>
          Sort:
        </Text>
        {(['name', 'usage', 'size', 'health', 'cves'] as SortKey[]).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setSortBy(key)}
            style={styles.sortChip}>
            <Text
              style={[
                styles.sortChipText,
                {
                  color:
                    sortBy === key
                      ? theme.colors.primary
                      : theme.colors.textTertiary,
                  fontWeight: sortBy === key ? '600' : '400',
                },
              ]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.textTertiary }}>
              No dependencies match your criteria
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  sortLabel: { fontSize: 12, fontWeight: '500' },
  sortChip: { paddingHorizontal: 6, paddingVertical: 4 },
  sortChipText: { fontSize: 12, textTransform: 'capitalize' },
  list: { padding: 16 },
  empty: { alignItems: 'center', paddingVertical: 40 },
});
