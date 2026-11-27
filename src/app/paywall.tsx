import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CloseButton, Text } from '@/components/ui';
import {
  billedLabel,
  ctaLabel,
  DEFAULT_PLAN,
  equivalentLabel,
  planLine,
  PLANS,
  TERMS_URL,
  trialEnd,
  trialLine,
  type PlanId,
} from '@/paywall/plans';
import { usePurchases } from '@/paywall/PurchasesProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { goalCopy } from '@/reveal/goal';
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
  const { profile, update } = useProfile();
  const { forecast } = useForecast();
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const plan = PLANS[planId];
  const end = trialEnd(plan, new Date());
  const low = forecast ? isLowRisk(forecast) : false;
  const visible = Object.values(PLANS).filter((p) => !p.hidden || more);
  const goal = goalCopy(profile.goal, low);
  const benefits = goal.benefits ?? (low ? LOW_RISK_BENEFITS : BENEFITS);

  async function restore() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const subscription = await purchases.restore();
      if (subscription) {
        await update((p) => ({ ...p, subscription }));
        router.dismissAll();
      } else {
        setNote('No earlier subscription found for this Apple or Google account.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t reach the store. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

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
        <CloseButton onPress={() => router.dismissAll()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          {goal.headline ?? (low ? 'Keep your hair on track' : 'Unlock your full forecast and your plan')}
        </Text>
        <View style={{ gap: spacing.sm }}>
          {benefits.map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.dot} />
              <Text style={{ flex: 1 }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {visible.map((p) => {
            const on = p.id === planId;
            const billed = billedLabel(p);
            const eq = equivalentLabel(p);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.label}, ${billed.price} a ${p.period}, ${planLine(p)}`}
                onPress={() => setPlanId(p.id)}
                style={[styles.plan, on && styles.planOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700' }}>{p.label}</Text>
                  <Text variant="caption" color="textMuted">
                    {planLine(p)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '700', fontSize: 17 }} testID={`price-${p.id}`}>
                    {billed.price}
                    <Text variant="caption" color="textMuted">{` ${billed.per}`}</Text>
                  </Text>
                  {eq ? (
                    <Text variant="caption" color="textMuted">
                      {eq}
                    </Text>
                  ) : null}
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
          {trialLine(plan, end)}
        </Text>
        {note ? (
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        <View style={styles.legal}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()} style={styles.link}>
            <Text variant="caption">Restore purchases</Text>
          </Pressable>
          <Text variant="caption" color="textMuted">·</Text>
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} style={styles.link}>
            <Text variant="caption">Terms</Text>
          </Pressable>
          <Text variant="caption" color="textMuted">·</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.link}>
            <Text variant="caption">Privacy</Text>
          </Pressable>
        </View>
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
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 2 },
  link: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm },
});
