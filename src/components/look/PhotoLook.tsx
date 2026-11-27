import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, G, Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { projectCurve, type OwnPhoto } from '@/look/ownPhoto';
import { useTones } from '@/look/tones';
import { alpha, colors, mix, radius, spacing } from '@/theme';

const pathOf = (pts: [number, number][], [w, h]: [number, number]) =>
  `M${pts.map(([x, y]) => `${(x * w).toFixed(4)} ${(y * h).toFixed(4)}`).join(' L')}`;

/**
 * How the free preview paints the change onto the photo, on the phone, without any AI:
 * recede fills the lost band of hair with skin, restore fills the regained band with hair,
 * bare and stubble paint over everything above the hairline.
 */
export type Paint = 'recede' | 'restore' | 'bare' | 'stubble';

/**
 * The user's own photo. Optionally with today's traced hairline (thin, white), where another
 * stage would put it (dashed, green), and the change roughly painted in with colours read from
 * the photo itself. That paint is only an approximation, so it's soft-edged and is shown blurred
 * until the user unlocks the real AI picture. The overlay uses the photo's own frame, so it
 * sits on the real hairline.
 */
export function PhotoLook({
  photo,
  stageNow,
  stageTo,
  showToday = true,
  paint,
  blur,
  testID = 'own-photo',
}: {
  photo: OwnPhoto;
  stageNow?: number;
  /** Draw the hairline at this stage too. */
  stageTo?: number;
  showToday?: boolean;
  paint?: Paint;
  blur?: boolean;
  testID?: string;
}) {
  const { curve, aspect } = photo;
  const tones = useTones(paint ? photo : null);
  const projected = curve && stageNow != null && stageTo != null && Math.abs(stageTo - stageNow) >= 0.25 ? projectCurve(curve, stageNow, stageTo) : null;
  const sw = aspect[0] / 220;
  const [w, h] = aspect;
  let painted: { d: string; fill: string } | null = null;
  if (curve && paint && (paint === 'bare' || paint === 'stubble')) {
    const first = curve[0];
    const last = curve[curve.length - 1];
    const d = `${pathOf(curve, aspect)} L${(Math.min(1, last[0] + 0.06) * w).toFixed(4)} ${(last[1] * h).toFixed(4)} L${(Math.min(1, last[0] + 0.06) * w).toFixed(4)} 0 L${(Math.max(0, first[0] - 0.06) * w).toFixed(4)} 0 L${(Math.max(0, first[0] - 0.06) * w).toFixed(4)} ${(first[1] * h).toFixed(4)} Z`;
    painted = { d, fill: paint === 'bare' ? tones.skin : mix(tones.skin, tones.hair, 0.35) };
  } else if (curve && projected && (paint === 'recede' || paint === 'restore')) {
    const back = [...projected].reverse();
    const d = `${pathOf(curve, aspect)} L${back.map(([x, y]) => `${(x * w).toFixed(4)} ${(y * h).toFixed(4)}`).join(' L')} Z`;
    painted = { d, fill: paint === 'recede' ? tones.skin : tones.hair };
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={blur ? 24 : undefined} testID={testID} />
      {curve && (painted || !blur) ? (
        <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          {painted ? (
            <>
              <Defs>
                <Filter id={`soft-${testID}`} x="-20%" y="-20%" width="140%" height="140%">
                  <FeGaussianBlur stdDeviation={w * (blur ? 0.03 : 0.008)} />
                </Filter>
              </Defs>
              <G filter={`url(#soft-${testID})`}>
                <Path d={painted.d} fill={painted.fill} testID={`${testID}-paint`} />
              </G>
            </>
          ) : null}
          {!blur && showToday ? <Path d={pathOf(curve, aspect)} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={sw * 1.6} fill="none" strokeLinecap="round" /> : null}
          {!blur && projected ? (
            <Path d={pathOf(projected, aspect)} stroke={colors.accent} strokeWidth={sw * 3} strokeDasharray={`${sw * 6} ${sw * 4}`} fill="none" strokeLinecap="round" testID={`${testID}-projected`} />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

/** A lock over a blurred free preview, with what unlocking gives. */
export function LockOver({ line }: { line: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.lock]} testID="preview-locked">
      <View style={styles.lockPill}>
        <Text variant="caption" style={{ fontWeight: '700' }}>
          {line}
        </Text>
      </View>
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
  lock: { alignItems: 'center', justifyContent: 'center' },
  lockPill: { backgroundColor: alpha(colors.bg, 0.8), borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 18 },
});
