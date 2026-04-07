import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../hooks';
import { Badge } from '../common';
import type { UpgradeImpact } from '../../types';

interface UpgradeModalProps {
  visible: boolean;
  impact: UpgradeImpact | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function UpgradeModal({
  visible,
  impact,
  onClose,
  onConfirm,
}: UpgradeModalProps) {
  const theme = useTheme();

  if (!impact) return null;

  const riskVariant =
    impact.risk === 'high'
      ? 'error'
      : impact.risk === 'medium'
      ? 'warning'
      : impact.risk === 'low'
      ? 'info'
      : 'success';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Upgrade Impact Preview
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.closeBtn, { color: theme.colors.textSecondary }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pkgInfo}>
            <Text style={[styles.pkgName, { color: theme.colors.text }]}>
              {impact.packageName}
            </Text>
            <Text style={[styles.versionChange, { color: theme.colors.textSecondary }]}>
              {impact.currentVersion} → {impact.targetVersion}
            </Text>
            <View style={styles.badges}>
              <Badge label={impact.bumpType.toUpperCase()} variant="info" />
              <Badge label={`${impact.risk} risk`} variant={riskVariant} />
              <Badge
                label={`${impact.filesAffected} files affected`}
                variant="neutral"
              />
            </View>
          </View>

          <ScrollView style={styles.content}>
            {impact.breakingChanges.length > 0 ? (
              <>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.error }]}>
                  Breaking Changes ({impact.breakingChanges.length})
                </Text>
                {impact.breakingChanges.map((bc, i) => (
                  <View
                    key={i}
                    style={[
                      styles.breakingItem,
                      {
                        backgroundColor: bc.affectsUser
                          ? theme.colors.errorBg
                          : theme.colors.surface,
                        borderColor: bc.affectsUser
                          ? theme.colors.error
                          : theme.colors.border,
                      },
                    ]}>
                    <Text
                      style={[styles.breakingText, { color: theme.colors.text }]}>
                      {bc.description}
                    </Text>
                    {bc.affectsUser && (
                      <View style={styles.callSites}>
                        <Badge label="Affects your code" variant="error" />
                        {bc.affectedCallSites.map((cs, j) => (
                          <Text
                            key={j}
                            style={[
                              styles.callSite,
                              { color: theme.colors.textTertiary },
                            ]}>
                            {cs.filePath}:{cs.line}
                          </Text>
                        ))}
                      </View>
                    )}
                    {!bc.affectsUser && (
                      <Badge label="Does not affect your code" variant="success" />
                    )}
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.noBreaking}>
                <Badge label="No breaking changes detected" variant="success" size="md" />
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
              onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: theme.colors.primary }]}
              onPress={onConfirm}>
              <Text style={styles.confirmText}>Proceed with Upgrade</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700' },
  closeBtn: { fontSize: 15, fontWeight: '500' },
  pkgInfo: { paddingHorizontal: 20, marginBottom: 16 },
  pkgName: { fontSize: 18, fontWeight: '600' },
  versionChange: { fontSize: 14, fontFamily: 'monospace', marginTop: 2 },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  content: { paddingHorizontal: 20, maxHeight: 400 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  breakingItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  breakingText: { fontSize: 14, lineHeight: 20 },
  callSites: { marginTop: 8, gap: 4 },
  callSite: { fontSize: 12, fontFamily: 'monospace' },
  noBreaking: { alignItems: 'center', paddingVertical: 20 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  confirmText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
