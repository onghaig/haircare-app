import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Face } from '@/components/head/Face';
import { Text } from '@/components/ui';
import { faceForStage } from '@/reveal/reveal';
import { alpha, colors, radius, spacing } from '@/theme';
import { AI_ILLUSTRATION_LABEL } from '@/visualize/preview';

export const ILLUSTRATION_LABEL = 'Illustration based on your forecast, not a medical prediction';

/**
 * The projected look at N years, kept blurred until unlocked. Drawn from the forecast's median
 * stage, so it is never worse than the model predicts. Always labelled as an illustration.
 */
export function FuturePreview({
  stage,
  age,
  locked = true,
  photoUri,
}: {
  stage: number;
  age: number;
  locked?: boolean;
  /** The user's own photo, AI-restyled to this stage. Without it, the drawing shows. */
  photoUri?: string;
}) {
  const { recede, top } = faceForStage(stage);
  const label = photoUri ? AI_ILLUSTRATION_LABEL : ILLUSTRATION_LABEL;
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`You at age ${age}, projected. ${locked ? 'Locked.' : ''} ${label}`}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.fill} contentFit="cover" testID="future-photo" />
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice">
          <Face id="future" recede={recede} top={top} shoulders />
        </Svg>
      )}
      {locked ? (
        <>
          <BlurView intensity={55} tint="dark" style={styles.fill} testID="future-blur" />
          <View style={[styles.fill, styles.center]}>
            <View style={styles.lockBadge}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Rect x={5} y={11} width={14} height={10} rx={2} fill="none" stroke={colors.text} strokeWidth={1.8} />
                <Path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke={colors.text} strokeWidth={1.8} />
              </Svg>
            </View>
            <Text variant="headline" style={styles.shadow}>
              Age {age}, projected
            </Text>
          </View>
        </>
      ) : null}
      <Text variant="caption" style={[styles.label, styles.shadow]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  lockBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: alpha(colors.bg, 0.8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    textShadowColor: colors.bg,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  label: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    textAlign: 'center',
    fontSize: 11,
  },
});
