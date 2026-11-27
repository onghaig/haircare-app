import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import type { Relative } from '@/profile/types';
import { stageLabel } from '@/reveal/reveal';
import { colors, radius, spacing } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SIZE = 168;
const DASH = 1200;

/**
 * A relative's photo with the hairline the scan engine found drawn over it in green, then their
 * estimated stage. The trace draws in once, like the scan's own line.
 */
export function RelativePhoto({ relative, name }: { relative: Relative; name: string }) {
  const a = relative.photoAnalysis;
  const [draw] = useState(() => new Animated.Value(DASH));

  useEffect(() => {
    if (!a) return;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) draw.setValue(0);
      else Animated.timing(draw, { toValue: 0, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
    return () => {
      live = false;
    };
  }, [a, draw]);

  if (!relative.photoUri) return null;
  const d = a && a.curve.length > 1 ? `M${a.curve.map(([x, y]) => `${(x * SIZE).toFixed(1)} ${(y * SIZE).toFixed(1)}`).join(' L')}` : null;

  return (
    <View style={styles.wrap} testID="relative-photo">
      <View style={styles.frame}>
        <Image source={{ uri: relative.photoUri }} style={styles.photo} accessibilityLabel={`${name}’s photo`} />
        {d ? (
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
            <AnimatedPath d={d} stroke={colors.accent} strokeWidth={3} strokeLinecap="round" fill="none" strokeDasharray={`${DASH}`} strokeDashoffset={draw} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {a ? (
          <>
            <Text variant="caption" color="textMuted">
              From this photo
            </Text>
            <Text variant="headline" testID="relative-stage">
              {`About ${stageLabel(a.stage)}`}
            </Text>
            <Text variant="caption" color="textMuted">
              {`Range ${stageLabel(a.low)} to ${stageLabel(a.high)}. Low confidence: old photos vary in angle and light.`}
            </Text>
          </>
        ) : (
          <Text variant="caption" color="textMuted">
            No hairline found in this photo. One with the forehead visible, roughly front-on, works best.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  frame: { width: SIZE, height: SIZE, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  photo: { width: SIZE, height: SIZE },
});
