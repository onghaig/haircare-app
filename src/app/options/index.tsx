import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { EvidencePill, MinePill, RxPill } from '@/components/options/Pills';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { groupedOptions, inPlan, ROLE_LABEL, ROLE_MEANING, visibleOptions, type OptionInfo } from '@/options/catalog';
import { planItems } from '@/options/plan';
import { useComparison } from '@/options/useComparison';
import { isPremium } from '@/paywall/purchases';
import { chanceRangeLabel, chanceTenths, HEADLINE_YEARS } from '@/predict/predict';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { alpha, colors, spacing } from '@/theme';

/**
 * Every option on the same 10-year scale, grouped by what it does. The do-nothing range sits as
 * a faint band behind every bar. Never ranked or badged as best for you.
 */
export default function CompareOptionsScreen() {
  const { profile } = useProfile();
  const { plan } = useForecast();
  const premium = isPremium(profile);
  const cmp = useComparison(premium);
  const ten = cmp?.byYear.find((y) => y.years === HEADLINE_YEARS);
  const items = planItems(plan);
  const notCounted = visibleOptions(profile).filter((o) => o.role === 'none');

  const row = (o: OptionInfo) => {
    const path = cmp?.paths[o.id]?.find((p) => p.years === HEADLINE_YEARS);
    return (
      <Pressable
        key={o.id}
        accessibilityRole="button"
        accessibilityLabel={`${o.name}${path ? `: ${chanceRangeLabel(path.pReach)}` : ''}`}
        onPress={() => router.push({ pathname: '/options/[id]', params: { id: o.id } })}
        style={styles.row}
        testID={`option-${o.id}`}>
        <View style={styles.spread}>
          <Text style={{ fontWeight: '600', flexShrink: 1 }}>{o.name}</Text>
          <View style={styles.pills}>
            {inPlan(o, items) ? <MinePill /> : null}
            {o.rx ? <RxPill /> : null}
            <EvidencePill level={o.evidence} />
          </View>
        </View>
        {premium ? (
          path && ten ? (
            <Bar untreated={chanceTenths(ten.pReach)} option={chanceTenths(path.pReach)} mid={path.pReach.mid} rx={o.rx} label={chanceRangeLabel(path.pReach)} />
          ) : (
            <Text variant="caption" color="textMuted">
              Working it out…
            </Text>
          )
        ) : (
          <Text variant="caption" color="textMuted">
            {o.short}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <SubScreen title="Compare options">
      <Text color="textMuted">
        {premium
          ? `Chance of Norwood ${cmp?.reachStage ?? 3} by ${ten?.age ?? (profile.age ?? 0) + HEADLINE_YEARS}. Faint band: no plan.`
          : 'What each option does.'}
      </Text>
      {groupedOptions(profile).map((g) => (
        <View key={g.role} style={{ gap: spacing.xs }}>
          <View style={styles.spread}>
            <Text variant="caption" color="textMuted" style={styles.sect}>
              {ROLE_LABEL[g.role].toUpperCase()}
            </Text>
            <Text variant="caption" color="textMuted">
              {ROLE_MEANING[g.role]}
            </Text>
          </View>
          <Card style={{ paddingVertical: 2 }}>{g.options.map(row)}</Card>
        </View>
      ))}
      {!premium ? <Button label="See what each option does for you" onPress={() => router.push('/paywall')} /> : null}
      <Text variant="caption" color="textMuted">
        Not counted: {notCounted.map((o) => o.name.toLowerCase()).join(', ')}. Prescriptions need a clinician. Effects are early estimates.
      </Text>
      <Pressable accessibilityRole="link" accessibilityLabel="How these work" onPress={() => router.push('/options/how')} style={styles.link}>
        <Text color="accent">How these work ›</Text>
      </Pressable>
    </SubScreen>
  );
}

/** 0 to 10 scale: faint do-nothing band, the option's range, and a dot at the middle case. */
function Bar({ untreated, option, mid, rx, label }: { untreated: { lo: number; hi: number }; option: { lo: number; hi: number }; mid: number; rx: boolean; label: string }) {
  const pct = (t: number) => `${t * 10}%` as const;
  const fill = rx ? colors.info : colors.accent;
  return (
    <View style={styles.barRow}>
      <View style={styles.bar}>
        <View style={styles.axis} />
        <View style={[styles.range, { left: pct(untreated.lo), width: pct(Math.max(0.3, untreated.hi - untreated.lo)), backgroundColor: alpha(colors.text, 0.1) }]} />
        <View style={[styles.range, { left: pct(option.lo), width: pct(Math.max(0.3, option.hi - option.lo)), backgroundColor: alpha(fill, 0.45) }]} />
        <View style={[styles.dot, { left: pct(Math.min(10, Math.max(0, mid * 10))) }]} />
      </View>
      <Text variant="caption" color="textMuted" style={{ width: 92, textAlign: 'right' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  pills: { flexDirection: 'row', gap: 4 },
  sect: { letterSpacing: 0.6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1, height: 16 },
  axis: { position: 'absolute', left: 0, right: 0, top: 7, height: 2, backgroundColor: colors.line },
  range: { position: 'absolute', top: 3, height: 10, borderRadius: 5 },
  dot: { position: 'absolute', top: 2, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.bg },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
