import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { RolePill } from '@/components/options/Pills';
import { Card, SubScreen, Text } from '@/components/ui';
import { illustrativeLine, ILLUSTRATION } from '@/options/illustrate';
import { colors, spacing } from '@/theme';

function Mini({ kinds, label }: { kinds: ('slows' | 'grows' | 'both' | 'grows-stopped')[]; label: string }) {
  const [w, setW] = useState(280);
  const H = 64;
  const { MONTHS, SLOPE, LIFT } = ILLUSTRATION;
  const x = (m: number) => 40 + (m / MONTHS) * (w - 46);
  const y = (v: number) => 10 + ((v + LIFT) / (SLOPE * MONTHS + LIFT)) * (H - 18);
  const path = (k: Parameters<typeof illustrativeLine>[0]) =>
    Array.from({ length: MONTHS + 1 }, (_, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(illustrativeLine(k, m)).toFixed(1)}`).join(' ');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
      <Svg width={w} height={H}>
        <SvgText x={0} y={12} fill={colors.textMuted} fontSize={9}>
          more hair
        </SvgText>
        <SvgText x={0} y={H - 4} fill={colors.textMuted} fontSize={9}>
          less
        </SvgText>
        <Path d={path('none')} stroke={colors.textMuted} strokeDasharray="4 4" fill="none" />
        {kinds.map((k) => (
          <Path
            key={k}
            d={path(k)}
            stroke={k === 'slows' || k === 'both' ? colors.text : colors.accent}
            strokeWidth={k === 'grows-stopped' ? 1.4 : 2.2}
            strokeDasharray={k === 'grows-stopped' ? '2 3' : undefined}
            fill="none"
          />
        ))}
        <Circle cx={x(0)} cy={y(0)} r={3} fill={colors.text} />
      </Svg>
    </View>
  );
}

export default function HowOptionsWorkScreen() {
  return (
    <SubScreen title="How options work">
      <Text color="textMuted">Dashed line: doing nothing. Shapes only, not your numbers.</Text>
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <RolePill role="slows" />
          <Text variant="caption" color="textMuted">
            finasteride
          </Text>
        </View>
        <Mini kinds={['slows']} label="Slowing loss: the line flattens" />
        <Text variant="caption" color="textMuted">
          Slows the loss underneath. Your line flattens and the gap grows every year.
        </Text>
      </Card>
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <RolePill role="grows" />
          <Text variant="caption" color="textMuted">
            minoxidil, massage
          </Text>
        </View>
        <Mini kinds={['grows', 'grows-stopped']} label="Growing hair: a lift with the same slope, fading if stopped" />
        <Text variant="caption" color="textMuted">
          Adds density on top and crown. Same slope. Stop, and it fades within months (dotted line).
        </Text>
      </Card>
      <Card style={{ gap: spacing.xs }}>
        <RolePill role="both" />
        <Mini kinds={['both']} label="Both: a lift plus a flatter line" />
        <Text variant="caption" color="textMuted">
          Lift plus a flatter line.
        </Text>
      </Card>
      <Text variant="caption" color="textMuted">
        Sleep, stress and food can change shedding for a few months, but aren’t shown to change pattern loss, so they don’t move your forecast.
      </Text>
    </SubScreen>
  );
}
