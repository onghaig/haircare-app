import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { NoPhoto, PhotoLook } from '@/components/look/PhotoLook';
import { Text } from '@/components/ui';
import { REFERENCE_LABEL, stagePhoto } from '@/look/references';
import { useCurrentStage } from '@/look/useCurrentStage';
import { useOwnPhoto } from '@/look/useOwnPhoto';
import { stageLabel } from '@/reveal/reveal';
import { alpha, colors, radius, spacing } from '@/theme';
import { AI_ILLUSTRATION_LABEL } from '@/visualize/preview';

/** Shown on the user's own photo with the forecast hairline drawn on it. */
export const ILLUSTRATION_LABEL = 'Rough preview on your photo, dashed line at your likely hairline. Not a medical prediction';
export const NO_PHOTO_LABEL = 'An estimate, not a medical prediction';

/**
 * The projected look at N years, kept blurred until unlocked. Always a real photo, never a
 * drawing: the AI image of the user's photo when there is one, else their own photo with the
 * forecast's hairline traced on it, else an example photo made ahead of time, else just words.
 * Uses the forecast's median, so it is never worse than the model predicts.
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
  /** The user's own photo, AI-restyled to this stage. */
  photoUri?: string;
}) {
  const own = useOwnPhoto();
  const { stage: stageNow } = useCurrentStage();
  const example = !photoUri && !own ? stagePhoto(stage) : null;
  const label = photoUri ? AI_ILLUSTRATION_LABEL : own ? ILLUSTRATION_LABEL : example ? REFERENCE_LABEL : NO_PHOTO_LABEL;
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`You at age ${age}, projected. ${locked ? 'Locked.' : ''} ${label}`}>
      {photoUri ? (
        // Locked: the blur is baked into the image too, because the Android overlay only dims it.
        <Image source={{ uri: photoUri }} style={styles.fill} contentFit="cover" blurRadius={locked ? 24 : undefined} testID="future-photo" />
      ) : own ? (
        // The free preview: the change painted onto their photo on the phone, no AI and no cost.
        <PhotoLook photo={own} stageNow={stageNow} stageTo={stage} paint={stage >= stageNow ? 'recede' : 'restore'} blur={locked} testID="future-own-photo" />
      ) : example ? (
        <Image source={example} style={styles.fill} contentFit="cover" blurRadius={locked ? 24 : undefined} testID="future-example" />
      ) : locked ? null : (
        <NoPhoto title={`${stageLabel(stage)} at ${age}`} line="Do a scan to see this on your own photo." />
      )}
      {locked ? (
        <>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={55} tint="dark" style={styles.fill} testID="future-blur" />
          ) : (
            <View style={[styles.fill, { backgroundColor: alpha(colors.bg, 0.45) }]} testID="future-blur" />
          )}
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
