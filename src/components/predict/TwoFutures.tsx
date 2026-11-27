import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FuturePreview } from '@/components/reveal/FuturePreview';
import { AiNote } from '@/components/styles/AiNote';
import { BeforeAfter } from '@/components/styles/BeforeAfter';
import { Button, Card, Text } from '@/components/ui';
import type { Forecast } from '@/forecast';
import { milestoneAges, twoFuturesAt } from '@/predict/twoFutures';
import { stageLabel } from '@/reveal/reveal';
import { colors, minTouchTarget, radius, spacing } from '@/theme';
import { futureJob, useAiImage } from '@/visualize/useAiPreview';

/**
 * Two futures in one frame: drag from "doing nothing" to "your plan" at a round age. Uses the
 * same images as Future you, so a year seen there isn't made twice.
 */
export function TwoFutures({ forecast, premium }: { forecast: Forecast; premium: boolean }) {
  const ages = milestoneAges(forecast.ageNow);
  const [age, setAge] = useState(ages[0]);
  const both = age != null ? twoFuturesAt(forecast, age) : null;
  const locked = !premium;
  // Locked: nothing is made, the drawings stay blurred.
  const none = useAiImage(both && !locked ? futureJob(both.untreated, both.years) : null);
  const plan = useAiImage(both && !locked ? futureJob(both.plan, both.years) : null);

  if (!ages.length) return null;
  return (
    <Card style={{ gap: spacing.sm }} testID="two-futures">
      <Text variant="headline">Two futures</Text>
      <View style={styles.seg} accessibilityRole="tablist">
        {ages.map((a) => {
          const on = a === age;
          return (
            <Pressable
              key={a}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`At ${a}`}
              onPress={() => setAge(a)}
              style={[styles.opt, on && styles.optOn]}>
              <Text variant="caption" style={{ fontWeight: '700', color: on ? colors.onAccent : colors.textMuted }}>
                {`At ${a}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {both ? (
        <>
          <BeforeAfter
            testID="two-futures-compare"
            height={280}
            leftLabel="Doing nothing"
            rightLabel="Your plan"
            left={<FuturePreview stage={both.untreated} age={age} locked={locked} photoUri={none.status === 'ready' ? none.uri : undefined} />}
            right={<FuturePreview stage={both.plan} age={age} locked={locked} photoUri={plan.status === 'ready' ? plan.uri : undefined} />}
          />
          {locked ? (
            <Button label="Unlock two futures" onPress={() => router.push('/paywall')} />
          ) : (
            <>
              <AiNote ai={plan.status === 'error' || plan.status === 'loading' ? plan : none} />
              <Text testID="two-futures-line">
                {`At ${age}: ${stageLabel(both.untreated)} doing nothing, ${stageLabel(both.plan)} on your plan.`}
              </Text>
            </>
          )}
        </>
      ) : (
        <>
          <Text color="textMuted">Add something that slows loss to your plan to see a second future.</Text>
          <Pressable accessibilityRole="link" accessibilityLabel="See options" onPress={() => router.push('/options')} style={styles.link}>
            <Text color="accent">See options ›</Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 4 },
  opt: { flex: 1, minHeight: minTouchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  optOn: { backgroundColor: colors.accent },
  link: { minHeight: minTouchTarget, justifyContent: 'center' },
});
