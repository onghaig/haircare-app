import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { Face } from '@/components/head/Face';
import { Button, Text } from '@/components/ui';
import { colors, spacing } from '@/theme';

const HEAD_H = 250;

/** Welcome: one promise, a live preview of the scan, the privacy line. No account wall. */
export default function WelcomeScreen() {
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(sweep, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [sweep]);

  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [HEAD_H * 0.2, HEAD_H * 0.62] });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero} accessible={false}>
        <Svg width={(HEAD_H * 200) / 236} height={HEAD_H} viewBox="0 0 200 236">
          <Face id="welcome" recede={0.3} trace shoulders />
        </Svg>
        <Animated.View pointerEvents="none" style={[styles.sweep, { transform: [{ translateY }] }]} />
      </View>
      <View style={styles.copy}>
        <Text variant="title" accessibilityRole="header">
          See where your hair is heading, and what to do about it.
        </Text>
        <Text color="textMuted">A 90-second scan and a few questions build your personal hair-loss forecast.</Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.bottom}>
        <Button label="Start my forecast" onPress={() => router.push('/onboarding/questions')} />
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
          Your photos stay encrypted and are never sold.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: { height: HEAD_H + 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sweep: {
    position: 'absolute',
    top: 20,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    borderRadius: 1,
    opacity: 0.9,
  },
  copy: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  bottom: { padding: spacing.lg, gap: spacing.sm },
});

