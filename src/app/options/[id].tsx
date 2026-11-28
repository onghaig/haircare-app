import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EvidencePill, RolePill, RxPill } from '@/components/options/Pills';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { inPlan, OPTIONS, showsRx, type CatalogId } from '@/options/catalog';
import { planItems } from '@/options/plan';
import { NO_PARTNER_TEXT, REFERRAL_DISCLOSURE, TELEHEALTH_URL } from '@/options/telehealth';
import { useComparison } from '@/options/useComparison';
import { isPremium } from '@/paywall/purchases';
import { chanceRangeLabel, HEADLINE_YEARS } from '@/predict/predict';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { colors, spacing } from '@/theme';

/**
 * One option in plain words: what it does, the evidence, what it would do to the forecast as a
 * range, and the trade-offs. Prescriptions hand off to a licensed provider; "I already take
 * this" adds it to the plan for tracking only.
 */
export default function OptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: CatalogId }>();
  const { profile, update } = useProfile();
  const { plan } = useForecast();
  const premium = isPremium(profile);
  const o = OPTIONS.find((x) => x.id === id);
  const counted = !!o && o.items.length > 0;
  const cmp = useComparison(premium && counted, o?.id);
  const [askedProvider, setAskedProvider] = useState(false);

  // Rx detail never reaches under-18s, even by a deep link.
  if (!o || (o.rx && !showsRx(profile))) {
    return (
      <SubScreen title="Not available" close>
        <Text color="textMuted">This option isn’t shown for your profile.</Text>
      </SubScreen>
    );
  }

  const ten = cmp?.byYear.find((y) => y.years === HEADLINE_YEARS);
  const path = cmp?.paths[o.id]?.find((p) => p.years === HEADLINE_YEARS);
  const already = inPlan(o, planItems(plan)) || (o.takes.length > 0 && o.takes.every((t) => profile.treatments.includes(t)));

  async function talkToProvider() {
    if (TELEHEALTH_URL) await WebBrowser.openBrowserAsync(TELEHEALTH_URL);
    else setAskedProvider(true);
  }

  async function alreadyTake() {
    await update((p) => ({ ...p, treatments: [...new Set([...p.treatments.filter((t) => t !== 'none'), ...o!.takes])] }));
    router.back();
  }

  return (
    <SubScreen title={o.name} close>
      <View style={styles.pills}>
        <RolePill role={o.role} />
        {o.rx ? <RxPill /> : null}
        <EvidencePill level={o.evidence} />
      </View>
      <Text color="textMuted">{o.short}</Text>
      <Text>{o.about}</Text>

      {counted ? (
        <Card style={{ gap: 4 }} testID="option-effect">
          <Text variant="caption" color="textMuted">
            Norwood {cmp?.reachStage ?? 3} by {ten?.age ?? (profile.age ?? 0) + HEADLINE_YEARS}, if done most days
          </Text>
          {!premium ? (
            <Text color="textMuted">Your numbers are in Premium.</Text>
          ) : ten && path ? (
            <View style={styles.pills}>
              <Text color="danger">{chanceRangeLabel(ten.pReach)}</Text>
              <Text color="textMuted">→</Text>
              <Text variant="headline" style={{ color: o.rx ? colors.info : colors.accent }}>
                {chanceRangeLabel(path.pReach)}
              </Text>
            </View>
          ) : (
            <Text color="textMuted">Working it out…</Text>
          )}
          <Text variant="caption" color="textMuted">
            Early estimate.
          </Text>
        </Card>
      ) : null}

      <View style={styles.kv}>
        <Row k="Evidence" v={o.evidenceText} />
        <Row k="Timeline" v={o.timeline} />
        <Row k="Trade-offs" v={o.tradeoffs} />
        {o.notFor ? <Row k="Not for" v={o.notFor} /> : null}
      </View>

      {o.rx ? (
        <>
          <Button label="Talk to a licensed provider" onPress={() => void talkToProvider()} />
          {TELEHEALTH_URL ? (
            <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {REFERRAL_DISCLOSURE}
            </Text>
          ) : null}
          {askedProvider ? (
            <Text variant="caption" color="textMuted" testID="no-partner">
              {NO_PARTNER_TEXT}
            </Text>
          ) : null}
          <Text variant="caption" color="textMuted">
            Only a clinician can decide if a prescription suits you. This app tracks what you take; it doesn’t prescribe.
          </Text>
        </>
      ) : null}
      {o.id === 'massage' ? <Button label="Start a guided massage" variant={o.rx ? 'secondary' : 'primary'} onPress={() => router.push('/massage')} /> : null}
      {o.takes.length && !already ? (
        <Button label={o.rx ? 'I already take this' : 'I already use this'} variant="secondary" onPress={() => void alreadyTake()} />
      ) : null}
      {already ? (
        <Text variant="caption" color="accent">
          In your plan. Today tracks it.
        </Text>
      ) : null}
    </SubScreen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textMuted" style={{ width: 84 }}>
        {k}
      </Text>
      <Text variant="caption" style={{ flex: 1 }}>
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  kv: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
});
