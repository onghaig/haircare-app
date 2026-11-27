import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { hasLifestyleData, type LifestyleTrend, type LifestyleWeek } from '@/plan/lifestyle';
import { alpha, colors, radius, spacing } from '@/theme';

type Tone = 'good' | 'poor' | 'plain';

interface Row {
  label: string;
  /** Short value for a cell, its tone, and the words a screen reader says. */
  cell(w: LifestyleWeek): { text: string; tone: Tone; spoken: string } | null;
}

const fmt1 = (n: number) => n.toFixed(1).replace(/\.0$/, '');

function rows(t: LifestyleTrend): Row[] {
  return [
    {
      label: t.measure === 'score' ? 'Hair score' : 'Hairline',
      cell: (w) =>
        w.hair == null
          ? null
          : t.measure === 'score'
            ? { text: String(Math.round(w.hair)), tone: 'plain', spoken: `hair score ${Math.round(w.hair)}` }
            : {
                text: `${w.hair >= 0 ? '+' : ''}${Math.round(w.hair)}`,
                tone: 'plain',
                spoken: `hairline ${Math.abs(Math.round(w.hair))} mm ${w.hair >= 0 ? 'better' : 'worse'} than baseline`,
              },
    },
    {
      label: 'Sleep',
      cell: (w) => (w.sleep == null ? null : { text: fmt1(w.sleep), tone: w.sleep >= 7 ? 'good' : w.sleep < 6 ? 'poor' : 'plain', spoken: `${fmt1(w.sleep)} hours sleep` }),
    },
    {
      label: 'Stress',
      cell: (w) =>
        w.stress == null ? null : { text: fmt1(w.stress), tone: w.stress <= 2.5 ? 'good' : w.stress >= 3.5 ? 'poor' : 'plain', spoken: `stress ${fmt1(w.stress)} of 5` },
    },
    {
      label: 'Eating',
      cell: (w) => {
        if (w.diet == null) return null;
        const word = w.diet >= 0.7 ? 'Good' : w.diet <= 0.4 ? 'Poor' : 'OK';
        return { text: word, tone: word === 'Good' ? 'good' : word === 'Poor' ? 'poor' : 'plain', spoken: `ate ${word.toLowerCase()}` };
      },
    },
    {
      label: 'Workouts',
      cell: (w) => (w.workouts == null ? null : { text: `${w.workouts}×`, tone: w.workouts >= 2 ? 'good' : 'plain', spoken: `${w.workouts} workouts` }),
    },
  ];
}

const TONE_BG: Record<Tone, string> = {
  good: alpha(colors.accent, 0.16),
  poor: alpha(colors.warning, 0.18),
  plain: colors.surfaceRaised,
};

/** Habits from the quick log, week by week, under the hair trend. */
export function LifestyleCard({ trend }: { trend: LifestyleTrend }) {
  if (!hasLifestyleData(trend)) {
    return (
      <Card style={{ gap: spacing.sm }} testID="lifestyle-empty">
        <Text variant="headline">Habits vs your hair</Text>
        <Text variant="caption" color="textMuted">
          Log sleep, stress, food and workouts in the quick log. They show up here, week by week, next to your hair.
        </Text>
        <Button label="Open quick log" variant="secondary" onPress={() => router.push('/log')} />
      </Card>
    );
  }
  const list = rows(trend);
  return (
    <Card style={{ gap: spacing.sm }} testID="lifestyle-card">
      <Text variant="headline">Habits vs your hair</Text>
      {list.map((r) => (
        <View key={r.label} style={styles.row} accessible accessibilityLabel={`${r.label}: ${spokenRow(r, trend.weeks)}`}>
          <Text variant="caption" color="textMuted" style={styles.label}>
            {r.label}
          </Text>
          {trend.weeks.map((w, i) => {
            const c = r.cell(w);
            return (
              <View key={i} style={[styles.cell, { backgroundColor: c ? TONE_BG[c.tone] : 'transparent' }]}>
                <Text variant="caption" color={c ? 'text' : 'textMuted'}>
                  {c?.text ?? '·'}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.label} />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {trend.weeks.length} weeks ago
        </Text>
        <Text variant="caption" color="textMuted">
          This week
        </Text>
      </View>
      <Text variant="caption" testID="lifestyle-links">
        {trend.links.length
          ? `${trend.links.join(' ')} A possible link, not proof.`
          : trend.enough
            ? 'No clear link between your habits and your hair so far.'
            : 'Not enough to compare yet. Keep logging a few times a week and scanning weekly. Links take a couple of months to show.'}
      </Text>
    </Card>
  );
}

function spokenRow(r: Row, weeks: LifestyleWeek[]): string {
  const parts = weeks.map((w, i) => {
    const c = r.cell(w);
    return c ? `week ${i + 1} ${c.spoken}` : null;
  });
  const said = parts.filter(Boolean);
  return said.length ? said.join(', ') : 'nothing logged';
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { width: 72 },
  cell: { flex: 1, height: 28, borderRadius: radius.sm / 2, alignItems: 'center', justifyContent: 'center' },
});
