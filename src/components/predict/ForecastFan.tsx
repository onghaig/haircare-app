import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import type { Forecast, StageRange } from '@/forecast';
import { alpha, colors, spacing } from '@/theme';

const HEIGHT = 170;
const LEFT = 26;
const BOTTOM = 18;
const TOP = 8;
const MAX_STAGE = 6;

interface Pt {
  years: number;
  age: number;
  r: StageRange;
}

/**
 * One chart, two bands: "do nothing" (grey, dashed median) and "your plan" (accent, solid median),
 * with the Norwood 3 line. Up is more hair. When `lockedAfter` is set, the chart past that year
 * is covered.
 */
export function ForecastFan({ forecast, horizon = 10, lockedAfter }: { forecast: Forecast; horizon?: number; lockedAfter?: number }) {
  const [width, setWidth] = useState(300);
  const now: Pt = { years: 0, age: forecast.ageNow, r: forecast.stageNow };
  const years = forecast.byYear.filter((y) => y.years <= horizon);
  const untreated: Pt[] = [now, ...years.map((y) => ({ years: y.years, age: y.age, r: y.untreated }))];
  const plan: Pt[] | null = years.every((y) => y.plan) ? [now, ...years.map((y) => ({ years: y.years, age: y.age, r: y.plan!.band }))] : null;

  const x = (yr: number) => LEFT + (yr / horizon) * (width - LEFT - 6);
  const y = (stage: number) => TOP + ((Math.min(stage, MAX_STAGE) - 1) / (MAX_STAGE - 1)) * (HEIGHT - TOP - BOTTOM);
  const line = (pts: Pt[], k: keyof StageRange) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.years).toFixed(1)},${y(p.r[k]).toFixed(1)}`).join(' ');
  const band = (pts: Pt[]) => `${line(pts, 'p10')} ${[...pts].reverse().map((p) => `L${x(p.years).toFixed(1)},${y(p.r.p90).toFixed(1)}`).join(' ')} Z`;
  const last = years.at(-1);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      testID="forecast-fan"
      accessibilityLabel={`Forecast chart to age ${last?.age}. Grey: doing nothing.${plan ? ' Green: your plan.' : ''}${lockedAfter != null ? ` Years after ${lockedAfter} locked.` : ''}`}>
      <Svg width={width} height={HEIGHT}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Line key={n} x1={LEFT} x2={width} y1={y(n)} y2={y(n)} stroke={colors.line} strokeWidth={1} />
        ))}
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <SvgText key={`l${n}`} x={0} y={y(n) + 4} fill={colors.textMuted} fontSize={10}>
            {`N${n}`}
          </SvgText>
        ))}
        <Line x1={LEFT} x2={width} y1={y(2.5)} y2={y(2.5)} stroke={colors.warning} strokeDasharray="3 3" strokeOpacity={0.7} />
        <SvgText x={LEFT + 2} y={y(2.5) - 3} fill={colors.warning} fontSize={9.5} fillOpacity={0.85}>
          Norwood 3
        </SvgText>
        <Path d={band(untreated)} fill={alpha(colors.text, 0.07)} />
        <Path d={line(untreated, 'p50')} stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth={1.4} fill="none" />
        {plan ? (
          <>
            <Path d={band(plan)} fill={alpha(colors.accent, 0.2)} />
            <Path d={line(plan, 'p50')} stroke={colors.accent} strokeWidth={2.4} fill="none" />
          </>
        ) : null}
        <Circle cx={x(0)} cy={y(now.r.p50)} r={4} fill={plan ? colors.accent : colors.text} stroke={colors.bg} strokeWidth={2} />
        {untreated.map((p) => (
          <SvgText key={`a${p.years}`} x={x(p.years)} y={HEIGHT - 4} fill={colors.textMuted} fontSize={10} textAnchor="middle">
            {String(p.age)}
          </SvgText>
        ))}
        {lockedAfter != null ? <Rect x={x(lockedAfter)} y={0} width={width - x(lockedAfter)} height={HEIGHT - BOTTOM} fill={alpha(colors.bg, 0.92)} /> : null}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.key}>
          <View style={[styles.swatch, { backgroundColor: colors.textMuted }]} />
          <Text variant="caption" color="textMuted">
            Do nothing
          </Text>
        </View>
        {plan ? (
          <View style={styles.key}>
            <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
            <Text variant="caption" color="accent">
              Your plan
            </Text>
          </View>
        ) : null}
        {lockedAfter != null ? (
          <Text variant="caption" color="textMuted" style={{ marginLeft: 'auto' }}>
            Years {lockedAfter + 1} to {horizon} locked
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs, alignItems: 'center' },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 12, height: 3, borderRadius: 2 },
});
