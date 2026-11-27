import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MinePill, EvidencePill, RolePill, RxPill } from '@/components/options/Pills';
import { ForecastFan } from '@/components/predict/ForecastFan';
import { FuturePreview } from '@/components/reveal/FuturePreview';
import { Button, Card, Screen, Text } from '@/components/ui';
import type { Forecast, YearForecast } from '@/forecast';
import { inPlan, showsRx, visibleOptions } from '@/options/catalog';
import { biggestNudge, planByRole, planItems, type PlanEntry } from '@/options/plan';
import { isPremium } from '@/paywall/purchases';
import { usePlan } from '@/plan/PlanProvider';
import { basedOn, chanceRangeLabel, HEADLINE_YEARS, isYearFree, PREDICT_YEARS, yearLabel, type PredictYear } from '@/predict/predict';
import { isMinor } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import type { Profile } from '@/profile/types';
import { useForecast } from '@/reveal/ForecastProvider';
import { confidenceLabel, isLowRisk, rangeLabel, stageLabel, yearOf } from '@/reveal/reveal';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

/**
 * Where am I heading, and what would change it? One forecast that splits into "do nothing" and
 * "your plan", the plan split by what each part does, and the one nudge that matters most.
 */
export default function PredictScreen() {
  const { profile } = useProfile();
  const { forecast, plan } = useForecast();

  if (!forecast) {
    return (
      <Screen title="Predict">
        <Card>
          <Text variant="headline">Working out your forecast</Text>
          <Text color="textMuted">This runs on your phone and takes a few seconds.</Text>
        </Card>
      </Screen>
    );
  }
  if (isMinor(profile)) return <TeenOutlook forecast={forecast} profile={profile} plan={plan} />;
  return <AdultForecast forecast={forecast} profile={profile} plan={plan} />;
}

function AdultForecast({ forecast, profile, plan }: { forecast: Forecast; profile: Profile; plan: PlanEntry[] }) {
  const premium = isPremium(profile);
  const { book } = usePlan();
  const ten = yearOf(forecast, HEADLINE_YEARS) ?? forecast.byYear.at(-1)!;
  const one = yearOf(forecast, 1) ?? forecast.byYear[0];
  const nudge = useMemo(() => biggestNudge(plan, book, new Date()), [plan, book]);

  return (
    <Screen title="Predict">
      <Text color="textMuted">
        Age {forecast.ageNow}, {stageLabel(forecast.stageNow.p50)} today
      </Text>
      <Card style={{ paddingHorizontal: spacing.sm }}>
        <ForecastFan forecast={forecast} horizon={HEADLINE_YEARS} lockedAfter={premium ? undefined : 1} />
      </Card>

      {premium ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text color="textMuted">Chance of Norwood 3 or worse by {ten.age}</Text>
            {ten.plan ? (
              <View style={styles.baseline} testID="predict-headline">
                <Text variant="title" color="accent">
                  {chanceRangeLabel(ten.plan.pNorwood3Plus)}
                </Text>
                <Text color="textMuted">on your plan</Text>
              </View>
            ) : null}
            <View style={styles.baseline} testID={ten.plan ? 'predict-untreated' : 'predict-headline'}>
              <Text variant={ten.plan ? 'headline' : 'title'}>{chanceRangeLabel(ten.pNorwood3Plus)}</Text>
              <Text color="textMuted">doing nothing</Text>
            </View>
          </Card>
          <PlanByRole plan={plan} profile={profile} />
          {nudge ? (
            <View style={styles.nudge} testID="predict-nudge">
              <Text variant="caption">{nudge.text}</Text>
            </View>
          ) : null}
          <Link label="Compare all options" onPress={() => router.push('/options')} />
        </>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <Text color="textMuted">Next 12 months</Text>
            <Text variant="headline" testID="predict-headline">
              {one.plan ? `Your plan: ${rangeLabel(one.plan.band)} at ${one.age}. Doing nothing: ${rangeLabel(one.untreated)}.` : `Likely at ${one.age}: ${rangeLabel(one.untreated)}.`}
            </Text>
            <Text variant="caption" color="textMuted">
              Paths usually split after year 1.
            </Text>
          </Card>
          <Card style={{ paddingVertical: 2 }}>
            {visibleOptions(profile).map((o, i, all) => (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityLabel={o.name}
                onPress={() => router.push({ pathname: '/options/[id]', params: { id: o.id } })}
                style={[styles.optRow, i < all.length - 1 && styles.border]}>
                <Text style={{ flex: 1, fontWeight: '600' }}>{o.name}</Text>
                {inPlan(o, planItems(plan)) ? <MinePill /> : null}
                {o.rx ? <RxPill /> : null}
                <EvidencePill level={o.evidence} />
              </Pressable>
            ))}
          </Card>
          <Button label="See what each option does for you" onPress={() => router.push('/paywall')} />
        </>
      )}

      <FutureYou forecast={forecast} premium={premium} />

      <Text variant="caption" color="textMuted">
        Confidence: {confidenceLabel(forecast)}. Based on {basedOn(profile).join(', ').toLowerCase() || 'your answers'}. Treatment effects are early estimates, not yet checked against trials.
      </Text>
    </Screen>
  );
}

/** "Your plan, by what it does": a plan with no stopping power says so. */
function PlanByRole({ plan, profile }: { plan: PlanEntry[]; profile: Profile }) {
  const by = planByRole(plan);
  const names = (xs: PlanEntry[]) => xs.map((e) => (e.option === 'massage' ? 'massage' : e.name.toLowerCase())).join(', ');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <Card style={{ gap: spacing.sm }} testID="plan-by-role">
      <Text variant="headline">Your plan, by what it does</Text>
      <View style={styles.roleRow}>
        <View style={styles.spread}>
          <RolePill role="grows" />
          <Text variant="caption" color={by.grows.length ? 'text' : 'warning'}>
            {by.grows.length ? cap(names(by.grows)) : 'Nothing in your plan'}
          </Text>
        </View>
        <Text variant="caption" color="textMuted">
          {by.grows.length ? 'Likely some regrowth on top and crown by 6 to 12 months, while you keep it up.' : 'Minoxidil and massage add density while you use them.'}
        </Text>
      </View>
      <View style={styles.roleRow}>
        <View style={styles.spread}>
          <RolePill role="slows" />
          <Text variant="caption" color={by.slows.length ? 'text' : 'warning'}>
            {by.slows.length ? cap(names(by.slows)) : 'Nothing in your plan'}
          </Text>
        </View>
        <Text variant="caption" color="textMuted">
          This is what changes your 10-year odds most.
        </Text>
        {!by.slows.length && showsRx(profile) ? <Link label="Options to discuss" onPress={() => router.push('/options')} align="left" /> : null}
      </View>
    </Card>
  );
}

/** The "future you" picture: only the untreated path and the current plan (design decision 2). */
function FutureYou({ forecast, premium }: { forecast: Forecast; premium: boolean }) {
  const [years, setYears] = useState<PredictYear>(1);
  const hasPlan = forecast.byYear.some((y) => y.plan);
  const [path, setPath] = useState<'plan' | 'none'>('plan');
  const y = yearOf(forecast, years) ?? forecast.byYear[0];
  const locked = !premium && !isYearFree(years);
  const showPlan = hasPlan && path === 'plan' && !!y.plan;
  const range = (b: YearForecast) => (showPlan && b.plan ? b.withTreatment! : b.untreated);

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="headline">Future you</Text>
      <View style={styles.years} accessibilityRole="tablist">
        {PREDICT_YEARS.map((n) => {
          const on = n === years;
          return (
            <Pressable
              key={n}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={yearLabel(n)}
              onPress={() => setYears(n)}
              style={[styles.year, on && styles.yearOn]}>
              <Text variant="caption" style={{ fontWeight: '700', color: on ? colors.onAccent : colors.textMuted }}>
                {`${n}y`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hasPlan ? (
        <View style={styles.years} accessibilityRole="tablist">
          {(['plan', 'none'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: path === k }}
              accessibilityLabel={k === 'plan' ? 'Your plan' : 'Do nothing'}
              onPress={() => setPath(k)}
              style={[styles.year, path === k && styles.segOn]}>
              <Text variant="caption" style={{ fontWeight: '700', color: path === k ? colors.bg : colors.textMuted }}>
                {k === 'plan' ? 'Your plan' : 'Do nothing'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FuturePreview stage={range(y).p50} age={y.age} locked={locked} />
      {locked ? (
        <Button label="Unlock your forecast" onPress={() => router.push('/paywall')} />
      ) : (
        <Text testID="future-headline">
          Likely at {y.age}: {rangeLabel(range(y))}
          {hasPlan ? (showPlan ? ' on your plan' : ' doing nothing') : ''}
        </Text>
      )}
      <ShareButton years={locked ? 1 : years} />
    </Card>
  );
}

/** Under 18: the risk, what a teen can do alone, and a doctor-with-a-parent route. No Rx, no 10-year odds. */
function TeenOutlook({ forecast, profile, plan }: { forecast: Forecast; profile: Profile; plan: PlanEntry[] }) {
  const one = yearOf(forecast, 1) ?? forecast.byYear[0];
  const low = isLowRisk(forecast);
  const relatives = Object.values(profile.family ?? {}).some((r) => r && (r.status === 'bald' || r.status === 'thinning' || r.status === 'receding'));
  const items = planItems(plan);
  const things = visibleOptions(profile).filter((o) => o.role !== 'none' || o.id === 'ketoconazole');
  return (
    <Screen title="Your outlook">
      <Text color="textMuted">Age {forecast.ageNow}</Text>
      <Card style={{ gap: 4 }}>
        <Text color="textMuted">Your risk card</Text>
        <Text variant="headline">{low ? 'Lower than average' : `Higher than average${relatives ? ', mostly from family history' : ''}`}</Text>
        <Text testID="predict-headline">
          Likely at {one.age}: {rangeLabel(one.untreated)}
        </Text>
      </Card>
      <Text variant="headline">Things you can do now</Text>
      <Card style={{ paddingVertical: 2 }}>
        {things.map((o) => (
          <View key={o.id} style={[styles.optRow, styles.border]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{o.name}</Text>
              <Text variant="caption" color="textMuted">
                {o.id === 'ketoconazole' ? 'Ask a parent first' : 'Low risk'}
              </Text>
            </View>
            {inPlan(o, items) ? <MinePill /> : null}
            <EvidencePill level={o.evidence} />
          </View>
        ))}
        <View style={styles.optRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>Scan every month</Text>
            <Text variant="caption" color="textMuted">
              Catch changes early
            </Text>
          </View>
        </View>
      </Card>
      <Card style={{ gap: 4, borderColor: colors.info }}>
        <Text variant="headline">Worried about it?</Text>
        <Text color="textMuted">A doctor can check your scalp with a parent or guardian. Medicines aren’t shown under 18.</Text>
      </Card>
      <ShareButton years={1} />
    </Screen>
  );
}

function ShareButton({ years }: { years: number }) {
  return <Button label="Share your forecast" variant="secondary" onPress={() => router.push({ pathname: '/share', params: { years: String(years) } })} />;
}

function Link({ label, onPress, align = 'center' }: { label: string; onPress: () => void; align?: 'center' | 'left' }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={[styles.link, align === 'left' && { alignItems: 'flex-start' }]}>
      <Text color="accent">{label} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  roleRow: { gap: 4 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  nudge: { backgroundColor: colors.surfaceRaised, borderColor: colors.accentDim, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  link: { minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  years: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 4 },
  year: { flex: 1, minHeight: minTouchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  yearOn: { backgroundColor: colors.accent },
  segOn: { backgroundColor: colors.text },
});
