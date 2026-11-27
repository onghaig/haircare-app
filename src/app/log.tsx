import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips, type Option } from '@/components/onboarding/Controls';
import { Button, CloseButton, Text } from '@/components/ui';
import { logQuick, type Diet, type Shedding } from '@/plan/log';
import { usePlan } from '@/plan/PlanProvider';
import { dayKey } from '@/plan/tasks';
import { colors, spacing } from '@/theme';

const SHEDDING: Option<Shedding>[] = [
  { value: 'less', label: 'Less than usual' },
  { value: 'normal', label: 'Normal' },
  { value: 'more', label: 'More than usual' },
];
const STRESS: Option<'1' | '2' | '3' | '4' | '5'>[] = [
  { value: '1', label: '1 calm' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5 very stressed' },
];
const SLEEP: Option<'5' | '6' | '7' | '8' | '9'>[] = [
  { value: '5', label: '5 h or less' },
  { value: '6', label: '6 h' },
  { value: '7', label: '7 h' },
  { value: '8', label: '8 h' },
  { value: '9', label: '9 h+' },
];

const DIET: Option<Diet>[] = [
  { value: 'well', label: 'Well' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'poorly', label: 'Poorly' },
];
const WORKOUT: Option<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/**
 * Three questions and two optional ones, about ten seconds. Feeds the monthly report's "what
 * changed" and the habits vs hair view on Progress.
 */
export default function QuickLogScreen() {
  const { book, change } = usePlan();
  const today = dayKey(new Date());
  const prev = book[today]?.quick;
  const [shedding, setShedding] = useState<Shedding | undefined>(prev?.shedding);
  const [stress, setStress] = useState<string | undefined>(prev ? String(prev.stress) : undefined);
  const [sleep, setSleep] = useState<string | undefined>(prev ? String(Math.min(9, Math.max(5, prev.sleepHours))) : undefined);
  const [diet, setDiet] = useState<Diet | undefined>(prev?.diet);
  const [workout, setWorkout] = useState<'yes' | 'no' | undefined>(prev?.workout == null ? undefined : prev.workout ? 'yes' : 'no');
  const ready = shedding && stress && sleep;

  async function save() {
    if (!ready) return;
    await change((b) =>
      logQuick(b, today, {
        shedding,
        stress: Number(stress),
        sleepHours: Number(sleep),
        ...(diet ? { diet } : {}),
        ...(workout ? { workout: workout === 'yes' } : {}),
      }),
    );
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text variant="headline">Quick log</Text>
        <CloseButton />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headline">Shedding today</Text>
        <Chips options={SHEDDING} selected={shedding ? [shedding] : []} onToggle={setShedding} />
        <Text variant="headline">Stress</Text>
        <Chips options={STRESS} selected={stress ? [stress as '1'] : []} onToggle={setStress} />
        <Text variant="headline">Sleep last night</Text>
        <Chips options={SLEEP} selected={sleep ? [sleep as '5'] : []} onToggle={setSleep} />
        <Text variant="headline">How you ate today</Text>
        <Chips options={DIET} selected={diet ? [diet] : []} onToggle={(v) => setDiet(v === diet ? undefined : v)} />
        <Text variant="headline">Workout or sport today</Text>
        <Chips options={WORKOUT} selected={workout ? [workout] : []} onToggle={(v) => setWorkout(v === workout ? undefined : v)} />
        <Text variant="caption" color="textMuted">
          The last two are optional.
        </Text>
      </ScrollView>
      <View style={styles.bottom}>
        <Button label="Save" disabled={!ready} onPress={() => void save()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md },
  bottom: { padding: spacing.lg },
});
