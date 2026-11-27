import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Card, Text } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { analysisCounters, ANALYSING_MS, FREE_SHARE} from '@/reveal/reveal';
import { useScans } from '@/scan/ScanProvider';
import { colors, spacing } from '@/theme';

const TICK_MS = 100;
const SIZE = 200;
const R = 86;

/**
 * 8 to 12 seconds of real processing with real counters. The forecast runs underneath; the meter
 * climbs to the free share of the analysis, then locks, and the reveal opens.
 */
export default function AnalysingScreen() {
  const { profile } = useProfile();
  const { latest } = useScans();
  const { forecast } = useForecast();
  const [elapsed, setElapsed] = useState(0);
  const c = analysisCounters(profile, latest);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => Math.min(ANALYSING_MS, e + TICK_MS)), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const paced = elapsed / ANALYSING_MS;
  const done = paced >= 1 && forecast != null;
  // Hold just short of the free share until the forecast is really ready.
  const percent = Math.round(Math.min(paced, done ? 1 : 0.97) * FREE_SHARE);

  useEffect(() => {
    if (!done) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => router.replace('/reveal'), 900);
    return () => clearTimeout(t);
  }, [done]);

  const stage = (from: number, to: number) => Math.min(1, Math.max(0, (paced - from) / (to - from)));
  const rows: { label: string; value: string; on: boolean }[] = [
    {
      label: 'Scan views processed',
      value: `${Math.round(stage(0, 0.25) * c.views)} of 5`,
      on: stage(0, 0.25) >= 1,
    },
    {
      // What the app really measures: the traced hairline, not generic face points.
      label: 'Hairline points traced',
      value: c.hairlinePoints ? String(Math.round(stage(0.15, 0.5) * c.hairlinePoints)) : 'Next scan',
      on: c.hairlinePoints > 0 && stage(0.15, 0.5) >= 1,
    },
    {
      label: c.relatives === 1 ? 'Relative analysed' : 'Relatives analysed',
      value: String(Math.round(stage(0.4, 0.75) * c.relatives)),
      on: stage(0.4, 0.75) >= 1,
    },
    { label: `Projecting to age ${c.projectTo}`, value: '', on: done },
  ];

  const circ = 2 * Math.PI * R;
  return (
    <SafeAreaView style={styles.safe}>
      <Text variant="headline" color="textMuted" style={{ textAlign: 'center', marginTop: spacing.xxl }}>
        Building your forecast
      </Text>
      <View
        style={styles.meter}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${percent}% analysed${done ? ', the rest is locked' : ''}`}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.line} strokeWidth={10} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.accent}
            strokeWidth={10}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${(circ * percent) / 100} ${circ}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.meterText}>
          <Text variant="display">{percent}%</Text>
          <Text variant="caption" color="textMuted">
            analysed
          </Text>
        </View>
        {done ? (
          <Svg width={26} height={26} viewBox="0 0 24 24" style={styles.lock} testID="analysis-locked">
            <Rect x={5} y={11} width={14} height={10} rx={2} fill={colors.bg} stroke={colors.textMuted} strokeWidth={1.8} />
            <Path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke={colors.textMuted} strokeWidth={1.8} />
          </Svg>
        ) : null}
      </View>
      <Card style={styles.list}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.border]}>
            <View style={[styles.box, r.on && styles.boxOn]} />
            <Text style={{ flex: 1 }}>{r.label}</Text>
            <Text style={{ fontWeight: '700' }}>{r.value}</Text>
          </View>
        ))}
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  meter: { width: SIZE, height: SIZE, marginVertical: spacing.xl },
  meterText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: { position: 'absolute', left: 44, top: 14 },
  list: { alignSelf: 'stretch', paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
