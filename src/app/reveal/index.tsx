import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FuturePreview } from '@/components/reveal/FuturePreview';
import { Button, Card, Text } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import {
  confidenceLabel,
  isLowRisk,
  PREVIEW_YEARS,
  rangeLabel,
  showsFuturePreview,
  stageLabel,
  yearOf,
  zoneSummary,
  type PreviewYear,
} from '@/reveal/reveal';
import { colors, radius, spacing } from '@/theme';

/**
 * The free reveal and the tease: today's stage and zones are free; the future look and the
 * year-by-year forecast stay locked behind the paywall. Year 1 of the timeline is free.
 */
export default function RevealScreen() {
  const { profile, update } = useProfile();
  const { forecast } = useForecast();
  const [years, setYears] = useState<PreviewYear>(5);

  useEffect(() => {
    if (!profile.revealSeenAt) void update((p) => ({ ...p, revealSeenAt: new Date().toISOString() }));
  }, [profile.revealSeenAt, update]);

  if (!forecast) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text color="textMuted" style={{ textAlign: 'center', marginTop: spacing.xxl }}>
          Building your forecast…
        </Text>
      </SafeAreaView>
    );
  }

  const zones = zoneSummary(profile);
  const preview = yearOf(forecast, years);
  const low = isLowRisk(forecast);
  const timeline = PREVIEW_YEARS.map((y) => yearOf(forecast, y)).filter((y) => y != null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.today}>
          <View>
            <Text
              variant="display"
              style={{ fontSize: 34, lineHeight: 38 }}
              accessibilityLabel={`Norwood ${stageLabel(forecast.stageNow.p50).slice(1)} today`}>
              {stageLabel(forecast.stageNow.p50)}
            </Text>
            <Text variant="caption" color="textMuted">
              Norwood today, {confidenceLabel(forecast)} confidence
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="textMuted">
              Weakest zone
            </Text>
            <Text
              style={{
                fontWeight: '700',
                color: zones.weakest ? colors.warning : colors.text,
              }}>
              {zones.weakest ?? 'None yet'}
            </Text>
            <Text variant="caption" color="textMuted">
              Strongest
            </Text>
            <Text style={{ fontWeight: '700' }}>{zones.strongest ?? 'None stands out'}</Text>
          </View>
        </Card>
        <Text>{low ? 'Your forecast looks stable as of right now. Tracking keeps it that way.' : zones.sentence}</Text>

        {showsFuturePreview(profile) && preview ? (
          <>
            <Text variant="headline">
              You in {years} year{years === 1 ? '' : 's'}
            </Text>
            <FuturePreview stage={preview.untreated.p50} age={preview.age} />
            <View style={styles.segment} accessibilityRole="tablist">
              {PREVIEW_YEARS.map((y) => (
                <Pressable
                  key={y}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: y === years }}
                  accessibilityLabel={`${y} year${y === 1 ? '' : 's'}`}
                  onPress={() => setYears(y)}
                  style={[styles.segmentItem, y === years && styles.segmentOn]}>
                  <Text
                    variant="caption"
                    style={{
                      fontWeight: y === years ? '700' : '400',
                      color: y === years ? colors.bg : colors.textMuted,
                    }}>
                    {y} year{y === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">Your Norwood timeline</Text>
          {timeline.map((y, i) => (
            <View key={y!.years} style={styles.timelineRow}>
              <Text style={{ flex: 1 }}>
                In {y!.years} year{y!.years === 1 ? '' : 's'} (age {y!.age})
              </Text>
              <View>
                <Text
                  style={{ fontWeight: '700' }}
                  accessibilityElementsHidden={i > 0}
                  importantForAccessibility={i > 0 ? 'no-hide-descendants' : 'auto'}>
                  {rangeLabel(y!.untreated)}
                </Text>
                {i > 0 ? <BlurView intensity={40} tint="dark" style={styles.frost} testID="timeline-frost" /> : null}
              </View>
            </View>
          ))}
          <Text variant="caption" color="textMuted">
            Ranges, not certainties. Estimate for wellness tracking, not a medical prediction.
          </Text>
        </Card>
      </ScrollView>
      <View style={styles.bottom}>
        <Button label={low ? 'Unlock tracking and your plan' : 'Unlock your future look'} onPress={() => router.replace('/(tabs)')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  today: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.text },
  timelineRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  frost: {
    position: 'absolute',
    top: -4,
    left: -8,
    right: -8,
    bottom: -4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  bottom: { padding: spacing.lg },
});
