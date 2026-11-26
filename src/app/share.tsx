import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareCard } from '@/components/predict/ShareCard';
import { Button, Text } from '@/components/ui';
import { isPremium } from '@/paywall/purchases';
import { isYearFree, shareMessage } from '@/predict/predict';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { yearOf } from '@/reveal/reveal';
import { colors, minTouchTarget, spacing } from '@/theme';

/** Preview the share card, then hand it to the system share sheet as an image. */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ years?: string }>();
  const { profile } = useProfile();
  const { forecast } = useForecast();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = Number(params.years ?? 1);
  const years = isPremium(profile) || isYearFree(asked) ? asked : 1;
  const year = forecast ? (yearOf(forecast, years) ?? forecast.byYear[0]) : undefined;

  async function share() {
    if (!forecast || !card.current) return;
    setError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      const uri = await captureRef(card, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: shareMessage(forecast, years), UTI: 'public.png' });
    } catch {
      setError('Sharing isn’t available right now. Try a screenshot instead.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
          Share your forecast
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
          <Text color="textMuted">Close</Text>
        </Pressable>
      </View>
      {year ? <ShareCard ref={card} year={year} /> : <Text color="textMuted">Your forecast is still being worked out.</Text>}
      <Text variant="caption" color="textMuted">
        The card shows an illustration and your range, never your photos or your treatment.
      </Text>
      {error ? <Text color="warning">{error}</Text> : null}
      <Button label="Share image" onPress={share} disabled={!year} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center' },
  close: { minHeight: minTouchTarget, justifyContent: 'center' },
});
