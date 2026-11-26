import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { classifyHairlineChange, type ChangeVerdict, type HairlineMetric } from '@/scan/change';
import type { ScanRecord } from '@/scan/session';
import { colors } from '@/theme';

const COLS: { key: HairlineMetric; label: string; field: 'leftTempleMM' | 'centreMM' | 'rightTempleMM' }[] = [
  { key: 'leftTemple', label: 'Left temple', field: 'leftTempleMM' },
  { key: 'centre', label: 'Centre', field: 'centreMM' },
  { key: 'rightTemple', label: 'Right temple', field: 'rightTempleMM' },
];

const VERDICT_TEXT: Record<ChangeVerdict, string> = { holding: 'No real change', gained: 'Gained ground', lost: 'Moved up' };

/** Brow-to-hairline distances, with change since baseline shown only when it beats the noise. */
export function HairlineNumbers({ scan, baseline }: { scan: ScanRecord; baseline?: ScanRecord }) {
  if (!scan.hairline) return null;
  const compare = baseline && baseline.id !== scan.id && !scan.lowConfidence ? baseline.hairline : null;
  return (
    <Card>
      <Text variant="caption" color="textMuted">
        Hairline from brow line (estimated)
      </Text>
      <View style={styles.row}>
        {COLS.map((c) => {
          const v = scan.hairline?.[c.field];
          const b = compare?.[c.field];
          const verdict = v != null && b != null ? classifyHairlineChange(c.key, b, v) : null;
          return (
            <View key={c.key} style={styles.col} accessible accessibilityLabel={`${c.label} ${v != null ? `${Math.round(v)} millimetres` : 'not found'}`}>
              <Text variant="title">
                {v != null ? Math.round(v) : '–'}
                <Text variant="caption" color="textMuted">
                  {' '}
                  mm
                </Text>
              </Text>
              <Text variant="caption" color="textMuted">
                {c.label}
              </Text>
              {verdict ? (
                <Text variant="caption" style={{ color: verdict === 'lost' ? colors.warning : colors.accent }}>
                  {VERDICT_TEXT[verdict]}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  col: { alignItems: 'center', flex: 1 },
});
