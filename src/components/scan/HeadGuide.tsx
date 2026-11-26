import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ScanView } from '@modules/headmap';
import { colors } from '@/theme';

/**
 * The head outline the user lines up with. Its size and centre match the native centring
 * and distance checks (face centred 45% down the frame, face about half the frame wide),
 * so "inside the outline" and "all checks green" mean the same thing.
 */
export const GUIDE = { centreX: 0.5, centreY: 0.45, faceShare: 0.5 } as const;

// Head outline in a 200 x 240 box; the face (brow to chin) spans y 40..204, x 36..164.
const OUTLINE = 'M100 10C56 10 36 50 36 104C36 150 60 192 100 204C140 192 164 150 164 104C164 50 144 10 100 10Z';

export function guideFrame(width: number, height: number) {
  const scale = (GUIDE.faceShare * width) / 128;
  const x = GUIDE.centreX * width - 100 * scale;
  const y = GUIDE.centreY * height - 122 * scale;
  return { x, y, scale };
}

export function HeadGuide({ view, aligned, width, height }: { view: ScanView; aligned: boolean; width: number; height: number }) {
  const stroke = aligned ? colors.accent : colors.text;
  if (width <= 0 || height <= 0) return null;
  if (view === 'crown') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="head-guide">
        <Svg width={width} height={height}>
          <Circle cx={width / 2} cy={height * 0.45} r={width * 0.3} stroke={stroke} strokeWidth={3} strokeDasharray="10 8" fill="none" />
        </Svg>
      </View>
    );
  }
  const { x, y, scale } = guideFrame(width, height);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="head-guide">
      <Svg width={width} height={height}>
        <Path
          d={OUTLINE}
          transform={`translate(${x} ${y}) scale(${scale})`}
          stroke={stroke}
          strokeWidth={2.6 / scale}
          strokeOpacity={aligned ? 1 : 0.7}
          fill="none"
        />
      </Svg>
    </View>
  );
}
