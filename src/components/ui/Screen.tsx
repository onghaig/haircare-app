import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

import { Text } from './Text';

/** A tab screen: large title, scrollable content, dark background, safe areas. `action` sits right of the title. */
export function Screen({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          {action}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
