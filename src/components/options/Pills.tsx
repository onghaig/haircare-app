import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { EVIDENCE_LABEL, ROLE_LABEL, type Evidence, type OptionRole } from '@/options/catalog';
import { colors, radius } from '@/theme';

/** Evidence as three dots plus a word: strong, some, limited, or not for pattern loss. */
export function EvidencePill({ level }: { level: Evidence }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={`Evidence: ${EVIDENCE_LABEL[level]}`}>
      <View style={styles.dots}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i <= level && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.label} color="textMuted">
        {EVIDENCE_LABEL[level]}
      </Text>
    </View>
  );
}

export function RolePill({ role }: { role: OptionRole }) {
  if (role === 'none') return null;
  const parts = role === 'both' ? (['slows', 'grows'] as const) : [role];
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {parts.map((r) => (
        <View key={r} style={[styles.pill, styles.role]}>
          <Text style={styles.label}>{r === 'slows' ? '= ' : '↑ '}{ROLE_LABEL[r]}</Text>
        </View>
      ))}
    </View>
  );
}

export function RxPill() {
  return (
    <View style={[styles.pill, { borderColor: colors.info }]} accessible accessibilityLabel="Prescription only">
      <Text style={[styles.label, { color: colors.info }]}>Rx</Text>
    </View>
  );
}

export function MinePill() {
  return (
    <View style={[styles.pill, { borderColor: colors.accentDim, backgroundColor: colors.surfaceRaised }]}>
      <Text style={[styles.label, { color: colors.accent }]}>Your plan</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 1 },
  role: { borderColor: colors.textMuted },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.accent },
});
