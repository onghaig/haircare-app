import type { ComponentRef, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

import { Face } from '@/components/head/Face';
import { Text } from '@/components/ui';
import type { YearForecast } from '@/forecast';
import { likelyRange } from '@/predict/predict';
import { faceForStage, rangeLabel } from '@/reveal/reveal';
import { colors, radius, spacing } from '@/theme';

/**
 * The card people post. An illustration, never their photo, with the range and the age, and a
 * plain "not a diagnosis" line. Square, so it fits stories and chats.
 */
export function ShareCard({ year, ref }: { year: YearForecast; ref?: Ref<ComponentRef<typeof View>> }) {
  const range = likelyRange(year);
  const { recede, top } = faceForStage(range.p50);
  return (
    <View ref={ref} collapsable={false} style={styles.card} testID="share-card">
      <Text variant="caption" color="accent" style={styles.brand}>
        THE HAIR-LOSS FORECAST
      </Text>
      <View style={styles.face}>
        <Svg width="100%" height="100%" viewBox="0 0 200 240">
          <Face id="share" recede={recede} top={top} shoulders />
        </Svg>
      </View>
      <Text variant="caption" color="textMuted">
        Me at {year.age}, likely
      </Text>
      <Text variant="display" style={{ color: colors.accent }}>
        {rangeLabel(range)}
      </Text>
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        Norwood scale. An illustrated estimate, not a diagnosis.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1,
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: 2,
  },
  brand: { letterSpacing: 2, fontWeight: '700' },
  face: { width: '50%', aspectRatio: 200 / 240, marginVertical: spacing.sm },
});
