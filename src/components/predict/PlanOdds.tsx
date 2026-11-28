import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { ChanceRange } from '@/forecast';
import { chanceRangeLabel } from '@/predict/predict';
import { spacing } from '@/theme';

/**
 * "Your Plan" at a glance: the chance of reaching Norwood N by an age, before the plan (red) and
 * with it (green). Without a plan, only the red number shows.
 */
export function PlanOdds({ stage, age, before, withPlan }: { stage: number; age: number; before: ChanceRange | number; withPlan?: ChanceRange }) {
  const b = chanceRangeLabel(before);
  const w = withPlan ? chanceRangeLabel(withPlan) : null;
  return (
    <View
      style={{ gap: 2 }}
      accessible
      testID="plan-odds"
      accessibilityLabel={`Your Plan. Chance of Norwood ${stage} by ${age}: ${b} before your plan${w ? `, ${w} with it` : ''}.`}>
      <Text variant="headline">Your Plan</Text>
      <View style={styles.row}>
        <Text variant="title">Norwood {stage}:</Text>
        <Text variant="title" color="danger" testID="plan-odds-before">
          {b}
        </Text>
        {w ? (
          <Text variant="title" color="accent" testID="plan-odds-with">
            {w}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textMuted">
        {w ? `By age ${age}. Red: before plan. Green: with plan.` : `By age ${age}. Add a plan to lower it.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
});
