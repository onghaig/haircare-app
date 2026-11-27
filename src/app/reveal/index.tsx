import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FuturePreview } from '@/components/reveal/FuturePreview';
import { Button, Card, Text } from '@/components/ui';
import { isPremium } from '@/paywall/purchases';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { useOptionalScans } from '@/scan/ScanProvider';
import type { ScanRecord } from '@/scan/session';
import { estimateStage } from '@/scan/stageEstimate';
import { goalCopy } from '@/reveal/goal';
import { confidenceHint, retakeSeconds, shownConfidence, stageSource } from '@/reveal/trust';
import {
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
  const latest = useOptionalScans()?.latest;
  const estimate = estimateStage(latest, profile);
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
  const premium = isPremium(profile);
  const timeline = PREVIEW_YEARS.map((y) => yearOf(forecast, y)).filter((y) => y != null);
  const confidence = shownConfidence(forecast, latest, estimate);
  const hint = confidenceHint(latest);
  const goal = goalCopy(profile.goal, low);
  const today = rangeLabel(forecast.stageNow);
  const todayHigh = today.includes(' to ') ? today.split(' to ')[1] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.today}>
            <View style={{ flex: 1 }}>
              <Text
                variant="display"
                style={{ fontSize: 34, lineHeight: 38 }}
                accessibilityLabel={`Norwood ${stageLabel(forecast.stageNow.p50).slice(1)} today${todayHigh ? `, up to ${todayHigh.slice(1)}` : ''}`}>
                {stageLabel(forecast.stageNow.p50)}
                {todayHigh && todayHigh !== stageLabel(forecast.stageNow.p50) ? (
                  <Text variant="caption" color="textMuted">{`  to ${todayHigh}`}</Text>
                ) : null}
              </Text>
              <Text variant="caption" color="textMuted" testID="reveal-source">
                {`${stageSource(latest)}. Norwood today.`}
              </Text>
            </View>
            <View style={[styles.conf, confidence === 'low' && styles.confLow]} testID="reveal-confidence">
              <Text variant="caption" style={{ fontWeight: '700', color: confidence === 'low' ? colors.warning : colors.accent }}>
                {`${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`}
              </Text>
            </View>
          </View>
          {hint ? (
            <Pressable
              disabled={!latest || hint.retake.length === 0}
              accessibilityRole={hint.retake.length ? 'button' : 'text'}
              onPress={() =>
                latest && router.push({ pathname: '/scan/session', params: { replaces: latest.id, only: hint.retake.join(',') } })
              }
              style={styles.hint}
              testID="reveal-retake">
              <View style={styles.hintDot} />
              <Text variant="caption" style={{ flex: 1 }}>
                {hint.text}
                {hint.retake.length ? (
                  <Text variant="caption" color="accent" style={{ fontWeight: '600' }}>
                    {`  Retake ${hint.retake.length === 1 ? '1 view' : `${hint.retake.length} views`}, about ${retakeSeconds(hint.retake.length)} s ›`}
                  </Text>
                ) : null}
              </Text>
            </Pressable>
          ) : null}
        </Card>
        <Card style={styles.zones}>
          <Text variant="caption" color="textMuted">
            Where you notice it (your answer)
          </Text>
          <View style={styles.zoneRow}>
            {zones.weakest ? (
              <View style={styles.zoneChip}>
                <Text variant="caption" style={{ fontWeight: '700', color: colors.warning }}>
                  {zones.weakest}
                </Text>
              </View>
            ) : (
              <Text style={{ fontWeight: '700' }}>Nowhere yet</Text>
            )}
            <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
              {scanStageLine(latest)}
            </Text>
          </View>
        </Card>
        <Text>{low ? 'Your forecast looks stable as of right now. Tracking keeps it that way.' : goal.sentence ?? zones.sentence}</Text>

        {showsFuturePreview(profile) && preview ? (
          <>
            <Text variant="headline">
              You in {years} year{years === 1 ? '' : 's'}
            </Text>
            <FuturePreview stage={preview.untreated.p50} age={preview.age} locked={!premium} />
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
              {i > 0 && !premium ? (
                // Locked years are never rendered under a blur: a blur that fails (Android without
                // a blur method) would show the paid number.
                <View style={styles.lockedValue} testID="timeline-frost" accessibilityLabel="Locked">
                  <Text variant="caption" color="textMuted" style={{ fontWeight: '600' }}>
                    Locked
                  </Text>
                </View>
              ) : (
                <Text style={{ fontWeight: '700' }}>{rangeLabel(y!.untreated)}</Text>
              )}
            </View>
          ))}
          <Text variant="caption" color="textMuted">
            Ranges, not certainties. Estimate for wellness tracking, not a medical prediction.
          </Text>
        </Card>
      </ScrollView>
      <View style={styles.bottom}>
        {premium ? (
          <Button label="Done" onPress={() => router.dismissAll()} />
        ) : (
          <Button label={goal.cta ?? (low ? 'Unlock tracking and your plan' : 'Unlock your future look')} onPress={() => router.push('/paywall')} />
        )}
      </View>
    </SafeAreaView>
  );
}

function scanStageLine(scan: ScanRecord | undefined): string {
  if (!scan) return 'Your first scan will measure it.';
  return scan.lowConfidence ? 'Your scan will confirm this once it can be measured.' : 'Your scans now track it.';
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
  lockedValue: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  conf: { borderWidth: 1, borderColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  confLow: { borderColor: colors.warning },
  hint: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    minHeight: 44,
  },
  hintDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, marginTop: 5 },
  zones: { gap: 6 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneChip: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  bottom: { padding: spacing.lg },
});
