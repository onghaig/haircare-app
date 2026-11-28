import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { projectCurve, type OwnPhoto } from '@/look/ownPhoto';
import { alpha, colors, radius, spacing } from '@/theme';

const pathOf = (pts: [number, number][], [w, h]: [number, number]) =>
  `M${pts.map(([x, y]) => `${(x * w).toFixed(4)} ${(y * h).toFixed(4)}`).join(' L')}`;

/**
 * The user's own, unedited photo. Optionally with today's traced hairline (thin, white) and
 * where another stage would put it (dashed, green). The overlay uses the photo's own frame, so
 * the lines sit on the real hairline.
 */
export function PhotoLook({
  photo,
  stageNow,
  stageTo,
  showToday = true,
  blur,
  testID = 'own-photo',
}: {
  photo: OwnPhoto;
  stageNow?: number;
  /** Draw the hairline at this stage too. */
  stageTo?: number;
  showToday?: boolean;
  blur?: boolean;
  testID?: string;
}) {
  const { curve, aspect } = photo;
  const projected = curve && stageNow != null && stageTo != null && Math.abs(stageTo - stageNow) >= 0.25 ? projectCurve(curve, stageNow, stageTo) : null;
  const sw = aspect[0] / 220;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={blur ? 24 : undefined} testID={testID} />
      {curve && !blur ? (
        <Svg width="100%" height="100%" viewBox={`0 0 ${aspect[0]} ${aspect[1]}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          {showToday ? <Path d={pathOf(curve, aspect)} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={sw * 1.6} fill="none" strokeLinecap="round" /> : null}
          {projected ? (
            <Path d={pathOf(projected, aspect)} stroke={colors.accent} strokeWidth={sw * 3} strokeDasharray={`${sw * 6} ${sw * 4}`} fill="none" strokeLinecap="round" testID={`${testID}-projected`} />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

/** No photo of the user and no example photo: words, never a drawn face. */
export function NoPhoto({ title, line }: { title: string; line: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.none]} testID="no-photo">
      <Text variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {line}
      </Text>
    </View>
  );
}

/** A small key under a photo with lines on it. */
export function LineKey({ today = 'Today', projected }: { today?: string; projected: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: alpha('#FFFFFF', 0.7), height: 2 }]} />
      <Text variant="caption" color="textMuted">
        {today}
      </Text>
      <View style={[styles.swatch, { borderColor: colors.accent, borderTopWidth: 3, borderStyle: 'dashed' }]} />
      <Text variant="caption" color="textMuted">
        {projected}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  none: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.xs, backgroundColor: colors.surfaceRaised, borderRadius: radius.lg },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 18 },
});
