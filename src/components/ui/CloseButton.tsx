import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, minTouchTarget } from '@/theme';

/**
 * The one close control for modals and full-screen flows: a round × at the top right. Pushed
 * screens use the back chevron instead (SubScreen), so the two never mix on one screen.
 */
export function CloseButton({ onPress = () => router.back(), label = 'Close' }: { onPress?: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={styles.hit} testID="close-button">
      <View style={styles.round}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path d="M2 2 L12 12 M12 2 L2 12" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  round: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
