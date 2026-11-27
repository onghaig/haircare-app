import type { CaptureResult, ScanView } from '@modules/headmap';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { tracePath } from '@/components/predict/ShareCard';
import { Text } from '@/components/ui';
import { SCAN_ORDER } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const TILE = 56;
const LINE_W = 260;
const LINE_H = 90;
const DASH = 900;

/** How long the finish moment holds before the result or the reveal opens. */
export const FINISH_MS = 2400;

/**
 * The moment a scan is done: the photos land one by one, your hairline draws in, and it says it
 * is saved. A beat of reward before the numbers, instead of a cut straight to a spinner.
 */
export function ScanFinish({
  captures,
  curve,
  saving,
}: {
  captures: Partial<Record<ScanView, CaptureResult>>;
  curve?: [number, number][];
  saving: boolean;
}) {
  const shots = SCAN_ORDER.map((v) => captures[v]).filter((c): c is CaptureResult => !!c);
  const [land] = useState(() => shots.map(() => new Animated.Value(0)));
  const [draw] = useState(() => new Animated.Value(DASH));

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) {
        land.forEach((a) => a.setValue(1));
        draw.setValue(0);
        return;
      }
      Animated.sequence([
        Animated.stagger(
          120,
          land.map((a) => Animated.timing(a, { toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true })),
        ),
        Animated.timing(draw, { toValue: 0, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    });
    return () => {
      live = false;
    };
  }, [land, draw]);

  const d = curve ? tracePath(curve, LINE_W, LINE_H) : null;

  return (
    <View
      style={styles.overlay}
      testID="scan-finish"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Scan complete. ${shots.length} photos saved.`}>
      <View style={styles.tiles}>
        {shots.map((c, i) => (
          <Animated.View
            key={c.view}
            style={[
              styles.tile,
              { opacity: land[i], transform: [{ translateY: land[i].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
            ]}>
            <Image source={{ uri: c.uri }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        ))}
      </View>
      {d ? (
        <Svg width={LINE_W} height={LINE_H} viewBox={`0 0 ${LINE_W} ${LINE_H}`}>
          <AnimatedPath
            d={d}
            stroke={colors.accent}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${DASH}`}
            strokeDashoffset={draw}
          />
        </Svg>
      ) : null}
      <Text variant="title">Scan complete</Text>
      <Text color="textMuted">{saving ? 'Saving your photos…' : `${shots.length} photos saved on this phone`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
  },
});
