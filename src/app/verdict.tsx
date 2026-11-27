import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ring } from '@/components/onboarding/Controls';
import { VersusChart } from '@/components/progress/VersusChart';
import { Button, Card, Text } from '@/components/ui';
import { shortDate } from '@/paywall/plans';
import { usePlan } from '@/plan/PlanProvider';
import { dailyTasks } from '@/plan/tasks';
import { useProfile } from '@/profile/ProfileProvider';
import { deltaLabel, latestReport, trendScans, VERDICT_TITLE, type VerdictReport } from '@/progress/verdict';
import { pathTitle, versusPaths, type VersusPaths } from '@/progress/versusPaths';
import { useForecast } from '@/reveal/ForecastProvider';
import { useScans } from '@/scan/ScanProvider';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

const VERDICT_LINE = {
  better: 'Your hairline measured lower on your forehead than at your baseline, by more than a re-scan can explain.',
  holding: 'No change bigger than a re-scan can tell apart. For most people, holding steady is a win.',
  worse: 'Your hairline measured higher than at your baseline, by more than a re-scan can explain.',
} as const;

interface Page {
  title: string;
  body: ReactNode;
}

function pages(r: VerdictReport, vs: VersusPaths | null): Page[] {
  const s = r.summary;
  const did: string[] = [];
  if (r.treatmentShare != null) did.push(`Treatment taken on about ${Math.round(r.treatmentShare * 10) * 10}% of days`);
  did.push(`Massage on ${s.massageDays} of ${s.days} days`);
  if (s.avgSleep != null) did.push(`About ${Math.round(s.avgSleep)} hours of sleep a night`);
  if (s.avgStress != null) did.push(`Stress ${s.avgStress < 2.5 ? 'low' : s.avgStress < 3.5 ? 'medium' : 'high'} on most days`);

  return [
    {
      title: `Month ${r.month}: ${VERDICT_TITLE[r.verdict]}`,
      body: <Text color="textMuted">{VERDICT_LINE[r.verdict]}</Text>,
    },
    {
      title: 'Before and after',
      body: (
        <View style={styles.photos}>
          {[
            { scan: r.baseline, label: 'Baseline' },
            { scan: r.latest, label: 'Latest' },
          ].map(({ scan, label }) => (
            <View key={label} style={{ flex: 1, gap: 4 }}>
              {scan.views.front?.uri ? (
                <Image source={{ uri: scan.views.front.uri }} style={styles.photo} contentFit="cover" accessibilityLabel={`${label} front photo`} />
              ) : (
                <View style={styles.photo} />
              )}
              <Text variant="caption" color="textMuted">
                {label}, {shortDate(new Date(scan.takenAt))}
              </Text>
            </View>
          ))}
        </View>
      ),
    },
    {
      title: 'The numbers',
      body: (
        <View style={{ gap: spacing.sm }}>
          {r.changes.map((c) => (
            <View key={c.metric} style={styles.spread} accessible accessibilityLabel={`${c.label}: ${c.verdict === 'holding' ? 'no real change' : deltaLabel(c.deltaMM)}`}>
              <Text>{c.label}</Text>
              <Text style={{ color: c.verdict === 'lost' ? colors.warning : c.verdict === 'gained' ? colors.accent : colors.textMuted }}>
                {c.verdict === 'holding' ? 'No real change' : deltaLabel(c.deltaMM)}
              </Text>
            </View>
          ))}
          <Text variant="caption" color="textMuted">
            Estimated from your front photos. Changes inside the margin of a re-scan count as no real change.
          </Text>
        </View>
      ),
    },
    {
      title: 'What you did',
      body: (
        <View style={{ gap: spacing.sm }}>
          {r.treatmentShare != null ? <Ring percent={r.treatmentShare * 100} size={64} /> : null}
          {did.map((d) => (
            <Text key={d}>{d}</Text>
          ))}
        </View>
      ),
    },
    { title: 'What might explain it', body: <Bullets items={r.explanations} /> },
    vs
      ? {
          title: pathTitle(vs),
          body: (
            <View style={{ gap: spacing.sm }}>
              <Text>{vs.sentence}</Text>
              <VersusChart v={vs} />
              <Text variant="caption" color="textMuted">
                Ticks show scan noise, about {vs.noiseMM} mm at the centre.
              </Text>
              {r.treatmentShare != null && vs.hasPlan ? (
                <View style={styles.spread}>
                  <Text variant="headline">{Math.round(r.treatmentShare * 100)}%</Text>
                  <Text variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'right' }}>
                    of treatment days done. Your plan’s band already uses this number.
                  </Text>
                </View>
              ) : null}
            </View>
          ),
        }
      : { title: 'You vs your forecast', body: <Text color="textMuted">{r.versusForecast}</Text> },
    { title: 'Next month', body: <Bullets items={r.adjustments} /> },
  ];
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((t) => (
        <View key={t} style={styles.bullet}>
          <View style={styles.dot} />
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** The monthly report as a short story, one card at a time. */
export default function VerdictScreen() {
  const { profile } = useProfile();
  const { records } = useScans();
  const { book } = usePlan();
  const now = useMemo(() => new Date(), []);
  const [i, setI] = useState(0);
  const medIds = dailyTasks(profile, now, records)
    .filter((t) => t.kind === 'medication')
    .map((t) => t.id);
  const report = latestReport(records, book, profile, medIds, now);
  const { forecast } = useForecast();
  const vs = useMemo(() => (forecast && report ? versusPaths(forecast, trendScans(records).filter((s) => new Date(s.takenAt) <= now)) : null), [forecast, report, records, now]);
  const list = report ? pages(report, vs) : [];
  const page = list[Math.min(i, list.length - 1)];
  const last = i >= list.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <View style={styles.dots} accessible accessibilityLabel={list.length ? `Page ${i + 1} of ${list.length}` : undefined}>
          {list.map((p, j) => (
            <View key={p.title} style={[styles.seg, j <= i && styles.segOn]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
          <Text color="textMuted">Close</Text>
        </Pressable>
      </View>

      {page ? (
        <Card style={styles.card}>
          <Text variant="title" accessibilityRole="header">
            {page.title}
          </Text>
          {page.body}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text variant="headline">Your report isn’t ready yet</Text>
        </Card>
      )}

      <View style={styles.nav}>
        {i > 0 ? <Button label="Back" variant="secondary" onPress={() => setI(i - 1)} style={{ flex: 1 }} /> : null}
        <Button label={last ? 'Done' : 'Next'} onPress={() => (last ? router.back() : setI(i + 1))} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dots: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.line },
  segOn: { backgroundColor: colors.accent },
  close: { minHeight: minTouchTarget, justifyContent: 'center' },
  card: { flex: 1, gap: spacing.md, borderRadius: radius.lg },
  photos: { flexDirection: 'row', gap: spacing.sm },
  photo: { aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  spread: { flexDirection: 'row', justifyContent: 'space-between' },
  bullet: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 },
  nav: { flexDirection: 'row', gap: spacing.sm },
});
