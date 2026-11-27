import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import type { HairState } from '@/scan/session';
import { colors, spacing } from '@/theme';

const ITEMS: { key: keyof HairState; label: string }[] = [
  { key: 'dry', label: 'My hair is dry' },
  { key: 'noProduct', label: 'No gel, wax or spray in it' },
  { key: 'sameLength', label: 'About the same length as last scan' },
];

/**
 * Quick hair-state check before the scan. Answers are saved with the scan, never block it:
 * a "no" just explains a possible jump in the numbers later.
 */
export function HairChecklist({
  onStart,
  firstScan,
  resume = null,
  retake = null,
}: {
  onStart: (s: HairState, opts?: { practise?: boolean }) => void;
  firstScan: boolean;
  /** Picking up a scan left part-way: how many photos are kept and the next view. */
  resume?: { done: number; next: string } | null;
  /** Retaking only these views of a scan. */
  retake?: string[] | null;
}) {
  const [state, setState] = useState<HairState>({ dry: true, noProduct: true, sameLength: true });
  if (resume) {
    return (
      <View style={styles.wrap}>
        <Text variant="title">Pick up where you left off</Text>
        <Text color="textMuted">{`${resume.done} of 5 photos are already saved. Next: ${resume.next}.`}</Text>
        <View style={{ flex: 1 }} />
        <Button label={`Continue with ${resume.next}`} onPress={() => onStart(state)} />
      </View>
    );
  }
  const items = firstScan ? ITEMS.filter((i) => i.key !== 'sameLength') : ITEMS;
  return (
    <View style={styles.wrap}>
      <Text variant="title">{retake ? `Retake ${retake.length === 1 ? '1 view' : `${retake.length} views`}` : 'Before you scan'}</Text>
      <Text color="textMuted">
        {retake
          ? `${retake.join(', ')}. The rest of your scan is kept. Same spot, same hair.`
          : 'Same time, same spot, same hair. It keeps every scan comparable.'}
      </Text>
      <Card style={{ paddingVertical: 4 }}>
        {items.map((i, n) => (
          <Pressable
            key={i.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state[i.key] }}
            accessibilityLabel={i.label}
            onPress={() => setState((s) => ({ ...s, [i.key]: !s[i.key] }))}
            style={[styles.row, n < items.length - 1 && styles.border]}>
            <View style={[styles.box, state[i.key] && styles.boxOn]} />
            <Text style={{ flex: 1 }}>{i.label}</Text>
          </Pressable>
        ))}
      </Card>
      <Text variant="caption" color="textMuted">
        The camera is used only for the scan. Photos are analysed on your phone.
      </Text>
      <View style={{ flex: 1 }} />
      {firstScan ? (
        <>
          <Button label="Try one view first" onPress={() => onStart(state, { practise: true })} />
          <Button label="Skip to the scan" variant="secondary" onPress={() => onStart(state)} />
        </>
      ) : (
        <Button label={retake ? 'Start the retake' : 'Start scan'} onPress={() => onStart(state)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#3A4643' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
