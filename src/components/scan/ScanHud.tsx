import { StyleSheet, View } from 'react-native';

import type { ScanView } from '@modules/headmap';
import { Text } from '@/components/ui';
import type { Prompt, StatusChip } from '@/scan/guidance';
import { SCAN_ORDER } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

export function ViewProgress({
  current,
  done,
  only,
}: {
  current: ScanView;
  done: Partial<Record<ScanView, unknown>>;
  /** Retaking some views: only those get a dot. */
  only?: ScanView[] | null;
}) {
  const order = only ?? SCAN_ORDER;
  return (
    <View style={styles.dots} accessible accessibilityLabel={`View ${order.indexOf(current) + 1} of ${order.length}`}>
      {order.map((v) => (
        <View
          key={v}
          style={[
            styles.dot,
            v === current && styles.dotCurrent,
            { backgroundColor: v === current || done[v] ? colors.accent : 'rgba(255,255,255,0.25)' },
          ]}
        />
      ))}
    </View>
  );
}

export function PromptCard({ prompt, tip }: { prompt: Prompt; tip?: string | null }) {
  const fix = prompt.tone === 'fix';
  return (
    <View
      style={[styles.prompt, { borderColor: fix ? colors.warning : colors.accentDim }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="text">
      <Text variant="headline">{prompt.title}</Text>
      {prompt.detail ? (
        <Text variant="caption" color="textMuted">
          {prompt.detail}
        </Text>
      ) : null}
      {tip ? (
        <Text variant="caption" color="accent" style={{ marginTop: 6 }}>
          Tip: {tip}
        </Text>
      ) : null}
    </View>
  );
}

export function StatusChips({ chips }: { chips: StatusChip[] }) {
  return (
    <View style={styles.chips}>
      {chips.map((c) => (
        <View key={c.label} style={styles.chip} accessible accessibilityLabel={`${c.label}: ${c.ok ? 'OK' : 'needs fixing'}`}>
          <View style={[styles.chipDot, { backgroundColor: c.ok ? colors.accent : colors.warning }]} />
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotCurrent: { width: 30 },
  prompt: { backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderColor: '#2A3532',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
});
