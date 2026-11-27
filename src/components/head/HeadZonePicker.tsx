import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import type { Zone } from '@/profile/types';
import { alpha, colors } from '@/theme';

import { CrownView, Face, hairlineGeometry } from './Face';

const BOX = { w: 200, h: 236 };
const RECEDE = 0.35;

interface Hit {
  zone: Zone;
  /** Hit area in the 200 x 236 box. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRONT_HITS: Hit[] = [
  { zone: 'temples', x: 34, y: 54, w: 36, h: 46 },
  { zone: 'temples', x: 130, y: 54, w: 36, h: 46 },
  { zone: 'hairline', x: 70, y: 40, w: 60, h: 36 },
];
const BACK_HITS: Hit[] = [
  { zone: 'top', x: 58, y: 32, w: 84, h: 50 },
  { zone: 'crown', x: 72, y: 76, w: 56, h: 54 },
];

/**
 * Tap-the-head: a realistic front view (hairline, temples) and a back-and-top view (top, crown).
 * Selected zones glow green. The zone chips under it are the accessible control; these taps are
 * a faster, visual shortcut to the same toggles.
 */
export function HeadZonePicker({
  selected,
  onToggle,
  height = 150,
}: {
  selected: Zone[];
  onToggle: (z: Zone) => void;
  height?: number;
}) {
  const on = (z: Zone) => selected.includes(z) || selected.includes('allOver');
  const width = (height * BOX.w) / BOX.h;
  const s = height / BOX.h;
  const line = hairlineGeometry(RECEDE);
  const zoneFill = (z: Zone) => (on(z) ? alpha(colors.accent, 0.25) : alpha('#FFFFFF', 0.03));
  const zoneStroke = (z: Zone) => (on(z) ? colors.accent : colors.textMuted);
  const dash = (z: Zone) => (on(z) ? undefined : '4 3');

  const hits = (list: Hit[], side: string) =>
    list.map((h, i) => (
      <Pressable
        key={`${side}${i}`}
        testID={`zone-${h.zone}-${side}${i}`}
        accessible={false}
        onPress={() => onToggle(h.zone)}
        style={{ position: 'absolute', left: h.x * s, top: h.y * s, width: h.w * s, height: h.h * s }}
      />
    ));

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <View style={{ width, height }}>
          <Svg width={width} height={height} viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
            <Face id="zp" recede={RECEDE} />
            <Path d={line.d} fill="none" stroke={colors.accent} strokeOpacity={on('hairline') ? 0.35 : 0.08} strokeWidth={14} strokeLinecap="round" />
            <Path d={line.d} fill="none" stroke={on('hairline') ? colors.accent : colors.textMuted} strokeWidth={2} strokeDasharray={dash('hairline')} />
            <Ellipse cx={54} cy={78} rx={14} ry={18} fill={zoneFill('temples')} stroke={zoneStroke('temples')} strokeWidth={1.6} strokeDasharray={dash('temples')} />
            <Ellipse cx={146} cy={78} rx={14} ry={18} fill={zoneFill('temples')} stroke={zoneStroke('temples')} strokeWidth={1.6} strokeDasharray={dash('temples')} />
          </Svg>
          {hits(FRONT_HITS, 'f')}
        </View>
        <Text variant="caption" color="textMuted">
          Front
        </Text>
      </View>
      <View style={styles.col}>
        <View style={{ width, height }}>
          <Svg width={width} height={height} viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
            <CrownView id="zp" />
            <Ellipse cx={100} cy={58} rx={40} ry={24} fill={zoneFill('top')} stroke={zoneStroke('top')} strokeWidth={1.6} strokeDasharray={dash('top')} />
            <Circle cx={100} cy={102} r={26} fill={zoneFill('crown')} stroke={zoneStroke('crown')} strokeWidth={1.6} strokeDasharray={dash('crown')} />
          </Svg>
          {hits(BACK_HITS, 'b')}
        </View>
        <Text variant="caption" color="textMuted">
          Back and top
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  col: { alignItems: 'center', gap: 2 },
});
