import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { stageLabel } from '@/reveal/reveal';
import { ESTIMATE_NOTE, type StageEstimate } from '@/scan/stageEstimate';
import { spacing } from '@/theme';

export function estimateRange(e: StageEstimate): string {
  const lo = stageLabel(e.low);
  const hi = stageLabel(e.high);
  return lo === hi ? lo : `${lo} to ${hi}`;
}

/** The estimated current Norwood stage from a scan: a likely range, how sure, and why. */
export function StageEstimateCard({ estimate }: { estimate: StageEstimate | null }) {
  if (!estimate) {
    return (
      <Card style={styles.card} testID="stage-estimate">
        <Text variant="caption" color="textMuted">
          Estimated Norwood stage
        </Text>
        <Text color="textMuted">Not enough clear photos in this scan to estimate a stage. A redo in good light usually fixes it.</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID="stage-estimate">
      <Text variant="caption" color="textMuted">
        Estimated Norwood stage
      </Text>
      <View style={styles.row}>
        <Text
          variant="display"
          style={{ fontSize: 34, lineHeight: 38 }}
          accessibilityLabel={`Estimated Norwood ${stageLabel(estimate.stage).slice(1)}, likely ${estimateRange(estimate)}`}>
          {stageLabel(estimate.stage)}
        </Text>
        <Text variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'right' }}>
          {`Likely ${estimateRange(estimate)}\n${estimate.confidence} confidence`}
        </Text>
      </View>
      {estimate.signals.map((s) => (
        <Text key={s} variant="caption">
          {`• ${s}`}
        </Text>
      ))}
      <Text variant="caption" color="textMuted">
        {ESTIMATE_NOTE}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
