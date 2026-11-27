import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { METRICS } from '@/progress/verdict';
import { MIN_DETECTABLE_CHANGE_MM } from '@/scan/change';
import type { ScanRecord } from '@/scan/session';
import { alpha, colors, spacing } from '@/theme';

const LINE_COLOR = { leftTemple: colors.info, centre: colors.accent, rightTemple: colors.text } as const;
const HEIGHT = 140;
const PAD = 10;

/**
 * Change since baseline for each hairline point, one dot per good scan. The shaded band is the
 * smallest change a re-scan can tell apart: anything inside it is "no real change". Photos you
 * added from your library show as hollow dots at the dates they were taken, often before the
 * baseline.
 */
export function TrendChart({ scans, baseline }: { scans: ScanRecord[]; baseline?: ScanRecord }) {
  const [width, setWidth] = useState(300);
  const base = baseline ?? scans[0];
  if (!base || scans.length < 2) return null;

  const t0 = new Date(scans[0].takenAt).getTime();
  const t1 = Math.max(t0 + 1, new Date(scans.at(-1)!.takenAt).getTime());
  const hasUploads = scans.some((s) => s.source === 'upload');
  const band = MIN_DETECTABLE_CHANGE_MM.centre;
  const deltas = METRICS.map((m) =>
    scans.map((s) => {
      const b = base.hairline?.[m.field];
      const v = s.hairline?.[m.field];
      return b != null && v != null ? v - b : null;
    }),
  );
  const extent = Math.max(band * 2, ...deltas.flat().map((d) => Math.abs(d ?? 0)));
  const x = (s: ScanRecord) => PAD + ((new Date(s.takenAt).getTime() - t0) / (t1 - t0)) * (width - 2 * PAD);
  // Up on the chart = hairline higher on the forehead.
  const y = (d: number) => HEIGHT / 2 - (d / extent) * (HEIGHT / 2 - PAD);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Hairline trend over ${scans.length} scans`} testID="trend-chart">
      <Svg width={width} height={HEIGHT}>
        <Rect x={0} y={y(band)} width={width} height={y(-band) - y(band)} fill={alpha(colors.accent, 0.08)} />
        <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.line} strokeWidth={1} />
        {METRICS.map((m, i) => {
          const pts = scans.map((s, j) => (deltas[i][j] == null ? null : ([x(s), y(deltas[i][j]!), s.source === 'upload'] as const))).filter((p) => p != null);
          if (!pts.length) return null;
          const d = pts.map(([px, py], j) => `${j ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
          return (
            <G key={m.key}>
              <Path d={d} stroke={LINE_COLOR[m.key]} strokeWidth={2} fill="none" strokeLinejoin="round" />
              {pts.map(([px, py, upload], j) =>
                upload ? (
                  <Circle key={j} cx={px} cy={py} r={3} fill={colors.bg} stroke={LINE_COLOR[m.key]} strokeWidth={1.5} />
                ) : (
                  <Circle key={j} cx={px} cy={py} r={3} fill={LINE_COLOR[m.key]} />
                ),
              )}
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <Text variant="caption" color="textMuted">
          Shaded: no real change
        </Text>
        {hasUploads ? (
          <Text variant="caption" color="textMuted">
            Hollow: your photos
          </Text>
        ) : null}
        {METRICS.map((m) => (
          <View key={m.key} style={styles.key}>
            <View style={[styles.swatch, { backgroundColor: LINE_COLOR[m.key] }]} />
            <Text variant="caption" color="textMuted">
              {m.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
});
