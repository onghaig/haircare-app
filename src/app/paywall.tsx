import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { ctaLabel, DEFAULT_PLAN, planLine, PLANS, shortDate, trialEnd, usd, weeklyEquivalent, type PlanId } from '@/paywall/plans';
import { usePurchases } from '@/paywall/PurchasesProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { isLowRisk } from '@/reveal/reveal';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

const BENEFITS = [
  'Year-by-year forecast to age 50',
  'You vs your forecast, every month',
  'Family breakdown for every relative',
  'Your daily plan, adjusted monthly',
];
const LOW_RISK_BENEFITS = [
  'Weekly scans that catch change early',
  'You vs your forecast, every month',
  'Family breakdown for every relative',
  'A prevention plan, adjusted monthly',
];

/**
 * One screen: annual pre-selected with the trial-end date stated, weekly as the alternative,
 * monthly under "More options", a visible close button, cancel in one tap. No dark patterns.
 */
export default function PaywallScreen() {
  const purchases = usePurchases();
  const { update } = useProfile();
  const { forecast } = useForecast();
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = PLANS[planId];
  const end = trialEnd(plan, new Date());
  const low = forecast ? isLowRisk(forecast) : false;
  const visible = Object.values(PLANS).filter((p) => !p.hidden || more);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const subscription = await purchases.purchase(planId, new Date());
      await update((p) => ({ ...p, subscription }));
      router.dismissAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The purchase did not go through. You have not been charged.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.dismissAll()} style={styles.close}>
          <Text variant="headline">×</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          {low ? 'Keep your hair on track' : 'Unlock your full forecast and your plan'}
        </Text>
        <View style={{ gap: spacing.sm }}>
          {(low ? LOW_RISK_BENEFITS : BENEFITS).map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.dot} />
              <Text style={{ flex: 1 }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {visible.map((p) => {
            const on = p.id === planId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.label}, ${planLine(p)}`}
                onPress={() => setPlanId(p.id)}
                style={[styles.plan, on && styles.planOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700' }}>{p.label}</Text>
                  <Text variant="caption" color="textMuted">
                    {planLine(p)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '700' }}>{p.period === 'year' ? usd(weeklyEquivalent(p)) : usd(p.priceUSD)}</Text>
                  <Text variant="caption" color="textMuted">
                    {p.period === 'year' ? 'a week' : `a ${p.period}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {!more ? (
            <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={styles.more}>
              <Text variant="caption" color="textMuted">
                More options
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.bottom}>
        {error ? (
          <Text variant="caption" style={{ color: colors.warning, textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
        <Button label={busy ? 'One moment…' : ctaLabel(plan)} disabled={busy} onPress={() => void buy()} />
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
          {end
            ? `Free until ${shortDate(end)}. We'll remind you the day before. Cancel in one tap.`
            : 'Cancel in one tap, any time.'}
        </Text>
        {purchases.isTest ? (
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }} testID="test-purchase-note">
            Test build: no payment is taken.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  close: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
  },
  planOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  more: { alignSelf: 'center', padding: spacing.sm, minHeight: minTouchTarget, justifyContent: 'center' },
  bottom: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
});
