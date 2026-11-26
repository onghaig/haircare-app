import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/onboarding/Controls';
import { FuturePreview } from '@/components/reveal/FuturePreview';
import { Button, Card, Screen, Text } from '@/components/ui';
import { ForecastModel, type Forecast, type Treatment } from '@/forecast';
import { isPremium } from '@/paywall/purchases';
import { basedOn, chanceLabel, headline, isYearFree, likelyRange, PREDICT_YEARS, scenarioInput, scenariosFor, WHAT_IF_SAMPLES, yearLabel, type PredictYear } from '@/predict/predict';
import { toForecastInput, treatmentFor } from '@/profile/forecastInput';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { confidenceLabel, rangeLabel, yearOf } from '@/reveal/reveal';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

/** Where am I heading? The look, the range and the odds, year by year, and what treatment might change. */
export default function PredictScreen() {
  const { profile } = useProfile();
  const { forecast } = useForecast();
  const premium = isPremium(profile);
  const [years, setYears] = useState<PredictYear>(1);
  const current = treatmentFor(profile.treatments);
  const [whatIf, setWhatIf] = useState<Treatment | null>(null);
  const scenarios = scenariosFor(profile);
  const alt = useWhatIf(premium ? whatIf : null, current);

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

  const y = yearOf(forecast, years) ?? forecast.byYear[0];
  const locked = !premium && !isYearFree(years);
  const altYear = alt ? yearOf(alt, years) : undefined;

  return (
    <Screen title="Predict">
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
                {n === 1 ? '1y' : `${n}y`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FuturePreview stage={likelyRange(y).p50} age={y.age} locked={locked} />

      {locked ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">See yourself in {yearLabel(years)}</Text>
          <Text color="textMuted">Premium unlocks every year of your forecast and the treatment comparison.</Text>
          <Button label="Unlock your forecast" onPress={() => router.push('/paywall')} />
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          <Text variant="headline" testID="predict-headline">
            {headline(y)}
          </Text>
          <Text color="textMuted">Chance of Norwood 3 or more: {chanceLabel(y.pNorwood3Plus).toLowerCase()}</Text>
          <Text variant="caption" color="textMuted">
            Confidence: {confidenceLabel(forecast)}. Based on {basedOn(profile).join(', ').toLowerCase() || 'your answers'}.
          </Text>
        </Card>
      )}

      <Card style={{ gap: spacing.sm }}>
        <Text variant="headline">Year by year</Text>
        {forecast.byYear.map((b) => {
          const hidden = !premium && !isYearFree(b.years);
          return (
            <View key={b.years} style={styles.row} accessible accessibilityLabel={`Age ${b.age}: ${hidden ? 'locked' : rangeLabel(likelyRange(b))}`}>
              <Text>Age {b.age}</Text>
              <Text color={hidden ? 'textMuted' : 'text'} style={{ fontWeight: '600' }}>
                {hidden ? 'Locked' : rangeLabel(likelyRange(b))}
              </Text>
            </View>
          );
        })}
      </Card>

      {scenarios.length ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">What if?</Text>
          {premium ? (
            <>
              <Chips options={scenarios.map((s) => ({ value: s.treatment, label: s.label }))} selected={[whatIf ?? current]} onToggle={(t) => setWhatIf(t === current ? null : t)} />
              {altYear && !locked ? (
                <Text testID="what-if-result">
                  {scenarios.find((s) => s.treatment === whatIf)?.label}: {rangeLabel(likelyRange(altYear))} at {altYear.age}, versus {rangeLabel(likelyRange(y))} on your current plan.
                </Text>
              ) : whatIf && !alt ? (
                <Text color="textMuted">Working it out…</Text>
              ) : null}
              <Text variant="caption" color="textMuted">
                Estimates from published averages. Talk to a doctor before starting or changing any treatment.
              </Text>
            </>
          ) : (
            <>
              <Text color="textMuted">Compare your forecast with and without treatment.</Text>
              <Button label="Unlock the comparison" variant="secondary" onPress={() => router.push('/paywall')} />
            </>
          )}
        </Card>
      ) : null}

      <Button
        label="Share your forecast"
        variant="secondary"
        onPress={() => router.push({ pathname: '/share', params: { years: String(locked ? 1 : years) } })}
      />
    </Screen>
  );
}

/** Runs the same forecast with another treatment, off the render. Null while computing or when not asked. */
function useWhatIf(treatment: Treatment | null, current: Treatment): Forecast | null {
  const { profile } = useProfile();
  const base = useMemo(() => toForecastInput(profile), [profile]);
  const key = treatment && treatment !== current && base ? JSON.stringify(scenarioInput(base, treatment)) : null;
  const [result, setResult] = useState<{ key: string; forecast: Forecast } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const t = setTimeout(() => {
      const forecast = new ForecastModel().forecast(JSON.parse(key), { years: [...PREDICT_YEARS], samples: WHAT_IF_SAMPLES });
      if (live) setResult({ key, forecast });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return result && result.key === key ? result.forecast : null;
}

const styles = StyleSheet.create({
  years: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 },
  year: { flex: 1, minHeight: minTouchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  yearOn: { backgroundColor: colors.accent },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
