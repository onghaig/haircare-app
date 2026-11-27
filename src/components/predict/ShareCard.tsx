import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { hairlineGeometry } from '@/components/head/HeadDiagram';
import { Text } from '@/components/ui';
import type { YearForecast } from '@/forecast';
import { chanceLabel, likelyRange } from '@/predict/predict';
import { faceForStage, rangeLabel } from '@/reveal/reveal';
import { colors, radius, spacing } from '@/theme';

const TRACE_W = 220;
const TRACE_H = 64;

/** A traced hairline scaled into the card's strip, keeping its shape. */
export function tracePath(curve: [number, number][], w = TRACE_W, h = TRACE_H): string | null {
  if (curve.length < 2) return null;
  const xs = curve.map((p) => p[0]);
  const ys = curve.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 6;
  const k = Math.min((w - pad * 2) / Math.max(x1 - x0, 1e-3), (h - pad * 2) / Math.max(y1 - y0, 1e-3));
  const ox = (w - (x1 - x0) * k) / 2;
  const oy = (h - (y1 - y0) * k) / 2;
  return `M${curve.map(([x, y]) => `${(ox + (x - x0) * k).toFixed(1)} ${(oy + (y - y0) * k).toFixed(1)}`).join(' L')}`;
}

/**
 * The card people post. It leads with their own hairline as the scan traced it (a line, never
 * their photo), then the range at that age and the chance said as "about N in 10", with the
 * app's mark so it is clearly an estimate from an app. Square, so it fits stories and chats.
 */
export function ShareCard({
  year,
  curve,
  ref,
}: {
  year: YearForecast;
  /** Today's traced hairline from the latest scan; the illustration stands in without one. */
  curve?: [number, number][];
  ref?: Ref<ComponentRef<typeof View>>;
}) {
  const range = likelyRange(year);
  const { recede, top } = faceForStage(range.p50);
  const d = curve ? tracePath(curve) : null;
  return (
    <View ref={ref} collapsable={false} style={styles.card} testID="share-card">
      <Text variant="caption" color="accent" style={styles.brand}>
        THE HAIR-LOSS FORECAST
      </Text>
      {d ? (
        <View style={styles.trace} testID="share-trace">
          <Svg width={TRACE_W} height={TRACE_H} viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}>
            <Path d={d} stroke={colors.accent} strokeWidth={4} strokeLinecap="round" fill="none" />
          </Svg>
          <Text variant="caption" color="textMuted">
            My hairline today, as my scan traced it
          </Text>
        </View>
      ) : (
        // No traced hairline: just the hairline shape at this stage, as a line. Never a drawn face.
        <View style={styles.trace} testID="share-shape">
          <Svg width={TRACE_W} height={TRACE_H} viewBox="40 40 120 70">
            <Path d={hairlineGeometry(recede, top).d} stroke={colors.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
          </Svg>
        </View>
      )}
      <Text variant="caption" color="textMuted">
        Me at {year.age}, likely
      </Text>
      <Text variant="display" style={{ color: colors.accent }}>
        {rangeLabel(range)}
      </Text>
      <Text variant="caption" style={{ textAlign: 'center' }}>
        {`${chanceLabel(year.pNorwood3Plus)} chance of Norwood 3 or more by ${year.age}`}
      </Text>
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        Estimate only.
      </Text>
      <Text variant="caption" color="textMuted" style={styles.mark} testID="share-watermark">
        Haircare · forecast from my answers and scan
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1,
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: 2,
  },
  brand: { letterSpacing: 2, fontWeight: '700' },
  trace: { alignItems: 'center', gap: 2, marginVertical: spacing.md },
  mark: { position: 'absolute', bottom: spacing.sm, fontSize: 11, letterSpacing: 0.5, opacity: 0.8 },
});
