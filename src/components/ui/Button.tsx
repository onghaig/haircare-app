import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, minTouchTarget, radius, spacing } from '@/theme';

import { Text } from './Text';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary';
};

/** Primary action button. Fires a light haptic on press so taps feel physical. */
export function Button({ label, variant = 'primary', onPress, disabled, style, ...rest }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={(e) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={(state) => [
        styles.base,
        { backgroundColor: primary ? colors.accent : colors.surfaceRaised },
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <Text variant="headline" style={{ color: primary ? colors.onAccent : colors.text, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Math.max(50, minTouchTarget),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
});
