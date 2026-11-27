import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ring } from '@/components/onboarding/Controls';
import { TrendChart } from '@/components/progress/TrendChart';
import { HairlineNumbers } from '@/components/scan/HairlineNumbers';
import { Button, Card, Screen, Text } from '@/components/ui';
import { shortDate } from '@/paywall/plans';
import { usePlan } from '@/plan/PlanProvider';
import { dailyTasks } from '@/plan/tasks';
import { useProfile } from '@/profile/ProfileProvider';
import { consistency, latestReport, metricChanges, overallVerdict, reportSchedule, timelineScans, trendScans, VERDICT_TITLE } from '@/progress/verdict';
import { useScans } from '@/scan/ScanProvider';
import type { ScanRecord } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

/** Answers one question: better or worse than when I started? */
export default function ProgressScreen() {
  const { profile } = useProfile();
  const { records } = useScans();
  const { book } = usePlan();
  const now = useMemo(() => new Date(), []);
  const scans = trendScans(records);
  const timeline = timelineScans(records);
  const baseline = scans[0];
  const scanned = records.some((r) => r.source !== 'upload');
  const latest = scans.at(-1);
  const medIds = dailyTasks(profile, now, records)
    .filter((t) => t.kind === 'medication')
    .map((t) => t.id);
  const report = latestReport(records, book, profile, medIds, now);
  const keep = consistency(book, now, medIds, 30);

  if (!scanned) {
    return (
      <Screen title="Progress">
        <Card style={styles.hero}>
          <Text variant="caption" color="accent">
            Nothing to compare yet
          </Text>
          <Text variant="headline">Your first scan sets your baseline</Text>
          <Text color="textMuted">
            {records.length ? 'Your added photos show on the trend once your first scan is in.' : 'Everything here is measured against it.'}
          </Text>
          <Button label="Start your first scan" onPress={() => router.push('/scan/session')} style={{ marginTop: spacing.sm }} />
        </Card>
      </Screen>
    );
  }

  const compared = baseline && latest && latest.id !== baseline.id;
  const verdict = compared ? overallVerdict(metricChanges(baseline, latest)) : null;
  const schedule = baseline ? reportSchedule(baseline, now) : null;

  return (
    <Screen title="Progress">
      <Card style={styles.hero}>
        <Text variant="caption" color="accent">
          Better or worse than when you started?
        </Text>
        <Text variant="title" testID="progress-verdict">
          {!baseline ? 'No baseline yet' : verdict ? VERDICT_TITLE[verdict] : 'Your baseline is set'}
        </Text>
        <Text color="textMuted">
          {!baseline
            ? 'Your last scan was low confidence. Your next good scan sets your baseline.'
            : verdict
              ? `Compared with your baseline from ${shortDate(new Date(baseline.takenAt))}.`
              : 'Scan weekly and we will compare every scan with this one.'}
        </Text>
        {!baseline ? (
          <Button label="Retake your scan" onPress={() => router.push('/scan/session')} style={{ marginTop: spacing.sm }} />
        ) : null}
        {baseline ? (
          <View style={styles.photos}>
            <Photo scan={baseline} label="Baseline" />
            {compared ? <Photo scan={latest} label="Latest" /> : null}
          </View>
        ) : null}
      </Card>

      {latest ? <HairlineNumbers scan={latest} baseline={baseline} /> : null}

      {baseline && timeline.length >= 2 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">Hairline trend</Text>
          <TrendChart scans={timeline} baseline={baseline} />
        </Card>
      ) : null}

      <Card style={styles.row}>
        <View accessible accessibilityLabel={`${keep.label} ${Math.round(keep.share * 100)}% of the last 30 days`}>
          <Ring percent={keep.share * 100} size={56} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{keep.label}</Text>
          <Text variant="caption" color="textMuted">
            Last 30 days. Sticking with the plan matters more than anything else you can do.
          </Text>
        </View>
      </Card>

      {report ? (
        <Card style={styles.report}>
          <Text variant="caption" color="accent">
            Month {report.month} report is ready
          </Text>
          <Text variant="headline">{VERDICT_TITLE[report.verdict]}</Text>
          <Button label="See your report" onPress={() => router.push('/verdict')} style={{ marginTop: spacing.sm }} />
        </Card>
      ) : schedule ? (
        <Card>
          <Text variant="headline">
            Your {schedule.due ? 'next' : 'first'} verdict arrives on {shortDate(schedule.next)}
          </Text>
          <Text variant="caption" color="textMuted">
            Hair changes slowly, so we wait eight weeks before calling it. Keep scanning weekly.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Photo({ scan, label }: { scan: ScanRecord; label: string }) {
  const uri = scan.views.front?.uri;
  return (
    <View style={styles.photoCol}>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} contentFit="cover" accessibilityLabel={`${label} front photo`} />
      ) : (
        <View style={styles.photo} />
      )}
      <Text variant="caption" color="textMuted">
        {label}, {shortDate(new Date(scan.takenAt))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderColor: colors.accentDim, gap: 4 },
  photos: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  photoCol: { width: '48%', gap: 4 },
  photo: { aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  report: { borderColor: colors.accent, gap: 2 },
});
