import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, minTouchTarget, spacing } from '@/theme';

import { CloseButton } from './CloseButton';
import { Text } from './Text';

/** A pushed screen (back chevron at the left) or a modal (round close at the right), a title, scrollable content. */
export function SubScreen({ title, close = false, children }: { title: string; close?: boolean; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.head}>
        {close ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
            <Text variant="headline" color="textMuted">
              ‹
            </Text>
          </Pressable>
        )}
        <Text variant="title" accessibilityRole="header" style={[{ flex: 1, fontSize: 22, lineHeight: 26 }, close && { paddingLeft: spacing.sm }]}>
          {title}
        </Text>
        {close ? <CloseButton /> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  back: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
});
