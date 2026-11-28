import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { VERDICT_LABEL, type StyleVerdict } from '@/styles/catalog';
import { colors, radius } from '@/theme';

const COLOR: Record<StyleVerdict, string> = { hides: colors.accent, works: colors.textMuted, shows: colors.warning };

export function VerdictPill({ verdict }: { verdict: StyleVerdict }) {
  return (
    <View style={[styles.pill, { borderColor: COLOR[verdict] }]}>
      <Text style={[styles.label, { color: COLOR[verdict] }]}>{VERDICT_LABEL[verdict]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 1 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
});
