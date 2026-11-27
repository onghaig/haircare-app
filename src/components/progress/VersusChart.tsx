import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import type { VersusPaths } from '@/progress/versusPaths';
import { alpha, colors } from '@/theme';

const H = 170;
const PAD = 14;

/**
 * Your scans as dots between the do-nothing band and your plan's band. Bands are the expected
 * change plus or minus scan noise; tick marks on each dot show the same noise. Up is more hair.
 */
export function VersusChart({ v }: { v: VersusPaths }) {
  const [w, setW] = useState(300);
  const end = Math.max(3, v.monthsSoFar + 2);
  const lo = Math.min(-v.noiseMM * 2, ...v.scans.map((s) => s.mm - v.noiseMM), v.planAt(end) - v.noiseMM);
  const hi = Math.max(v.noiseMM * 2, ...v.scans.map((s) => s.mm + v.noiseMM), v.untreatedAt(end) + v.noiseMM);
  const x = (m: number) => PAD + (m / end) * (w - 2 * PAD - 60);
  // Loss (positive mm) is drawn lower.
  const y = (mm: number) => PAD + ((mm - lo) / (hi - lo)) * (H - 2 * PAD);
  const band = (at: (m: number) => number) => `M${x(0)},${y(at(0) - v.noiseMM)} L${x(end)},${y(at(end) - v.noiseMM)} L${x(end)},${y(at(end) + v.noiseMM)} L${x(0)},${y(at(0) + v.noiseMM)} Z`;
  const line = (at: (m: number) => number) => `M${x(0)},${y(at(0))} L${x(end)},${y(at(end))}`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible testID="versus-chart" accessibilityLabel={`Your ${v.scans.length} scans against ${v.hasPlan ? 'with and without your plan' : 'your forecast'}`}>
      <Svg width={w} height={H}>
        <Path d={band(v.untreatedAt)} fill={alpha(colors.text, 0.07)} />
        <Path d={line(v.untreatedAt)} stroke={colors.textMuted} strokeDasharray="5 5" strokeWidth={1.4} fill="none" />
        {v.hasPlan ? (
          <>
            <Path d={band(v.planAt)} fill={alpha(colors.accent, 0.18)} />
            <Path d={line(v.planAt)} stroke={colors.accent} strokeWidth={1.6} strokeOpacity={0.7} fill="none" />
            <SvgText x={x(end) + 4} y={y(v.planAt(end)) - 2} fill={colors.accent} fontSize={10.5} fontWeight="600">
              Your plan
            </SvgText>
          </>
        ) : null}
        <SvgText x={x(end) + 4} y={y(v.untreatedAt(end)) + 12} fill={colors.textMuted} fontSize={10.5}>
          No plan
        </SvgText>
        {v.scans.map((s, i) => (
          <G key={i}>
            <Line x1={x(s.months)} x2={x(s.months)} y1={y(s.mm - v.noiseMM)} y2={y(s.mm + v.noiseMM)} stroke={alpha(colors.text, 0.35)} />
            <Circle cx={x(s.months)} cy={y(s.mm)} r={4.2} fill={colors.text} />
          </G>
        ))}
      </Svg>
    </View>
  );
}
