import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { Path } from 'react-native-svg';

import { polylineLength, toPath, type Pt } from '@/scan/hairlineGuide';
import { colors } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One draw takes this long, then holds, then redraws, so the eye is led along the hairline. */
export const DRAW_MS = 1400;
const HOLD_MS = 700;

/**
 * The animated green hairline line. While searching it traces where the hairline should be for
 * this view; once the native module finds the real hairline it traces that instead, brighter.
 * With Reduce Motion on, the line is drawn without animation.
 */
export function HairlineHighlight({ points, detected, aligned }: { points: Pt[]; detected: boolean; aligned: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const d = toPath(points);
  const length = Math.max(1, polylineLength(points));

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => live && setReduceMotion(r));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: DRAW_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.delay(HOLD_MS),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // Redraw from the start when the line itself changes (new view, or hairline found).
  }, [progress, reduceMotion, d, detected]);

  if (points.length < 2) return null;
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });
  const strong = detected || aligned;
  return (
    <>
      {/* Soft glow under the line. */}
      <AnimatedPath
        d={d}
        stroke={colors.accent}
        strokeOpacity={strong ? 0.35 : 0.18}
        strokeWidth={strong ? 12 : 9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${length} ${length}`}
        strokeDashoffset={dashOffset}
      />
      <AnimatedPath
        testID={detected ? 'hairline-detected' : 'hairline-template'}
        d={d}
        stroke={colors.accent}
        strokeOpacity={strong ? 1 : 0.75}
        strokeWidth={strong ? 3.2 : 2.4}
        strokeDasharray={`${length} ${length}`}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDashoffset={dashOffset}
      />
    </>
  );
}
