import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FamilyTree } from '@/components/family/FamilyTree';
import { pickPhoto, RelativeSheet } from '@/components/family/RelativeSheet';
import { HeadZonePicker } from '@/components/head/HeadZonePicker';
import { Chips, ProgressBar, RiskCard, ToggleRow, type Option } from '@/components/onboarding/Controls';
import { Button, Text } from '@/components/ui';
import {
  canContinue,
  isMinor,
  MAX_AGE,
  MIN_AGE,
  riskCard,
  STEPS,
  toggleMulti,
  toggleWorried,
  toggleZone,
  treatmentOptions,
  type Step,
} from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import type {
  AncestryChoice,
  Condition,
  FamilyMember,
  Goal,
  Noticed,
  Profile,
  Sex,
  Shedding,
  Sleep,
  StressEvent,
  TreatmentChoice,
  Zone,
} from '@/profile/types';
import { colors, minTouchTarget, radius, spacing, type as typeScale } from '@/theme';

const SEX: Option<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const ANCESTRY: Option<AncestryChoice>[] = [
  { value: 'white', label: 'White or European' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'south_asian', label: 'South Asian' },
  { value: 'black', label: 'Black or African' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'middle_eastern', label: 'Middle Eastern' },
  { value: 'other', label: 'Other or mixed' },
];
const ZONES: Option<Zone>[] = [
  { value: 'hairline', label: 'Hairline' },
  { value: 'temples', label: 'Temples' },
  { value: 'top', label: 'Top' },
  { value: 'crown', label: 'Crown' },
  { value: 'allOver', label: 'All over' },
];
const NOTICED: Option<Noticed>[] = [
  { value: 'under6m', label: 'Under 6 months' },
  { value: '6to12m', label: '6 to 12 months' },
  { value: '1to3y', label: '1 to 3 years' },
  { value: '3yPlus', label: '3+ years' },
  { value: 'notSure', label: 'Not sure' },
];
const SHEDDING: Option<Shedding>[] = [
  { value: 'under50', label: 'Under 50', hint: 'A few on the pillow' },
  { value: '50to100', label: '50 to 100', hint: 'Some in the shower drain' },
  { value: '100to200', label: '100 to 200', hint: 'A clump in the drain' },
  { value: '200plus', label: '200+', hint: 'Handfuls when washing' },
];
const TREATMENT_LABEL: Record<TreatmentChoice, string> = {
  finasteride: 'Finasteride',
  dutasteride: 'Dutasteride',
  minoxidil: 'Minoxidil',
  ketoconazole: 'Ketoconazole shampoo',
  microneedling: 'Microneedling',
  none: 'None yet',
};
const CONDITIONS: Option<Condition>[] = [
  { value: 'thyroid', label: 'Thyroid issues' },
  { value: 'anemia', label: 'Anaemia or low iron' },
  { value: 'pcos', label: 'PCOS' },
  { value: 'alopeciaAreata', label: 'Alopecia areata (patches)' },
  { value: 'scalp', label: 'Dandruff or psoriasis' },
  { value: 'recentIllness', label: 'Recent illness or surgery' },
];
const STRESS: Option<StressEvent>[] = [
  { value: 'jobLoss', label: 'Job loss' },
  { value: 'breakup', label: 'Breakup' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'moving', label: 'Moving home' },
  { value: 'illness', label: 'Illness' },
  { value: 'exams', label: 'Exams' },
];
const SLEEP: Option<Sleep>[] = [
  { value: 'poor', label: 'Under 6 hours' },
  { value: 'ok', label: '6 to 7 hours' },
  { value: 'good', label: '7+ hours' },
];
const SMOKER: Option<'yes' | 'no'>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];
const GOALS: Option<Goal>[] = [
  { value: 'keep', label: 'Keep what I have' },
  { value: 'regrow', label: 'Regrow' },
  { value: 'know', label: 'Just know where it is heading' },
  { value: 'shave', label: 'Prepare to shave it' },
];

const TITLE: Record<Step, string> = {
  basics: 'A bit about you',
  ancestry: 'Your background',
  where: 'Where are you noticing it?',
  when: 'How it has been going',
  family: 'Who in your family lost their hair?',
  treatments: 'Anything you already use?',
  health: 'Health',
  lifestyle: 'The past year',
  goal: 'What do you want most?',
};

const one = <T,>(v: T | undefined) => (v == null ? [] : [v]);

/** Onboarding questions, one step per screen, with the live risk card filling in. */
export default function QuestionsScreen() {
  const { profile, update, keepPhoto } = useProfile();
  const [index, setIndex] = useState(0);
  const [member, setMember] = useState<FamilyMember | null>(null);
  const { width } = useWindowDimensions();
  const step = STEPS[index];
  const set = (change: (p: Profile) => Profile) => void update(change);
  const last = index === STEPS.length - 1;

  async function next() {
    if (!last) {
      setIndex(index + 1);
      return;
    }
    await update((p) => ({ ...p, completedAt: new Date().toISOString() }));
    // Onboarding leaves the stack for good: the tabs become the root, with the first scan on top.
    // The first scan is required: it sets the baseline the forecast and every verdict use.
    router.dismissAll();
    router.replace('/(tabs)/scan');
    router.push('/scan/session');
  }

  async function addPhoto(m: FamilyMember) {
    const uri = await pickPhoto();
    if (!uri) return;
    const kept = await keepPhoto(m, uri);
    await update((p) => ({ ...p, family: { ...p.family, [m]: { status: 'unknown', ...p.family[m], photoUri: kept } } }));
  }

  const card = riskCard(profile, index + 1);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (index === 0 ? router.back() : setIndex(index - 1))}
          style={styles.back}>
          <Text variant="headline">‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar step={index + 1} total={STEPS.length} label="Building your hair profile" />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text variant="title" accessibilityRole="header">
          {TITLE[step]}
        </Text>

        {step === 'basics' ? (
          <>
            <Text variant="headline">Your age</Text>
            <TextInput
              accessibilityLabel="Your age"
              testID="age-input"
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={2}
              placeholder="Age"
              placeholderTextColor={colors.textMuted}
              value={profile.age != null ? String(profile.age) : ''}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/\D/g, ''), 10);
                set((p) => ({ ...p, age: Number.isNaN(n) ? undefined : n }));
              }}
              style={styles.input}
            />
            {profile.age != null && (profile.age < MIN_AGE || profile.age > MAX_AGE) ? (
              <Text variant="caption" style={{ color: colors.warning }}>
                Haircare is for ages {MIN_AGE} to {MAX_AGE}.
              </Text>
            ) : null}
            <Text variant="headline">Sex assigned at birth</Text>
            <Text variant="caption" color="textMuted">
              Male and female pattern hair loss look different and are measured on different scales.
            </Text>
            <Chips
              options={SEX}
              selected={one(profile.sex)}
              onToggle={(v) => {
                Keyboard.dismiss();
                set((p) => ({ ...p, sex: v }));
              }}
            />
          </>
        ) : null}

        {step === 'ancestry' ? (
          <>
            <Text color="textMuted">How common hair loss is varies by ancestry. Choose all that apply.</Text>
            <Chips
              multi
              options={ANCESTRY}
              selected={profile.ancestry}
              onToggle={(v) => set((p) => ({ ...p, ancestry: toggleMulti(p.ancestry, v) }))}
            />
          </>
        ) : null}

        {step === 'where' ? (
          <>
            <Text color="textMuted">Tap every area that applies.</Text>
            <HeadZonePicker selected={profile.zones} onToggle={(z) => set((p) => toggleZone(p, z))} />
            <Chips multi options={ZONES} selected={profile.zones} onToggle={(z) => set((p) => toggleZone(p, z))} />
            <ToggleRow label="Not noticing it yet, but worried" on={profile.worriedOnly} onPress={() => set(toggleWorried)} />
          </>
        ) : null}

        {step === 'when' ? (
          <>
            {!profile.worriedOnly ? (
              <>
                <Text variant="headline">When did you first notice changes?</Text>
                <Chips options={NOTICED} selected={one(profile.noticed)} onToggle={(v) => set((p) => ({ ...p, noticed: v }))} />
              </>
            ) : null}
            <Text variant="headline">Hairs you notice falling each day</Text>
            <Text variant="caption" color="textMuted">
              Up to about 100 a day is normal.
            </Text>
            <Chips options={SHEDDING} selected={one(profile.shedding)} onToggle={(v) => set((p) => ({ ...p, shedding: v }))} />
          </>
        ) : null}

        {step === 'family' ? (
          <>
            <Text color="textMuted">Tap anyone to add their hair and a photo. Not sure is fine.</Text>
            <FamilyTree family={profile.family} onSelect={setMember} width={Math.min(width - spacing.lg * 2, 420)} />
            <View style={styles.legend}>
              <View style={styles.legendRing} />
              <Text variant="caption" color="textMuted">
                Most predictive of your hair
              </Text>
            </View>
            <RelativeSheet
              member={member}
              relative={member ? profile.family[member] : undefined}
              onChange={(r) =>
                member && set((p) => ({ ...p, family: { ...p.family, [member]: r } }))
              }
              onAddPhoto={() => member && void addPhoto(member)}
              onClose={() => setMember(null)}
            />
          </>
        ) : null}

        {step === 'treatments' ? (
          <>
            <Text color="textMuted">So your plan and your forecast start from where you are.</Text>
            <Chips
              multi
              options={treatmentOptions(profile).map((t) => ({ value: t, label: TREATMENT_LABEL[t] }))}
              selected={profile.treatments}
              onToggle={(v) => set((p) => ({ ...p, treatments: toggleMulti(p.treatments, v, 'none') }))}
            />
          </>
        ) : null}

        {step === 'health' ? (
          <>
            <Text color="textMuted">
              Some conditions cause shedding that isn’t genetic. Choose any that apply, or skip.
            </Text>
            <Chips
              multi
              options={isMinor(profile) ? CONDITIONS.filter((c) => c.value !== 'pcos') : CONDITIONS}
              selected={profile.conditions}
              onToggle={(v) => set((p) => ({ ...p, conditions: toggleMulti(p.conditions, v) }))}
            />
          </>
        ) : null}

        {step === 'lifestyle' ? (
          <>
            <Text variant="headline">Anything stressful in the past 12 months?</Text>
            <Text variant="caption" color="textMuted">
              Stress can cause temporary shedding 2 to 3 months later.
            </Text>
            <Chips
              multi
              options={STRESS}
              selected={profile.stressEvents}
              onToggle={(v) => set((p) => ({ ...p, stressEvents: toggleMulti(p.stressEvents, v) }))}
            />
            <Text variant="headline">Sleep on a typical night</Text>
            <Chips options={SLEEP} selected={one(profile.sleep)} onToggle={(v) => set((p) => ({ ...p, sleep: v }))} />
            <Text variant="headline">Do you smoke?</Text>
            <Chips
              options={SMOKER}
              selected={profile.smoker == null ? [] : [profile.smoker ? 'yes' : 'no']}
              onToggle={(v) => set((p) => ({ ...p, smoker: v === 'yes' }))}
            />
          </>
        ) : null}

        {step === 'goal' ? (
          <Chips options={GOALS} selected={one(profile.goal)} onToggle={(v) => set((p) => ({ ...p, goal: v }))} />
        ) : null}
      </ScrollView>
      <View style={styles.bottom}>
        <RiskCard percent={card.percent} line={card.line} remaining={card.remaining} />
        <Button
          label={last ? 'Continue to your scan' : 'Continue'}
          disabled={!canContinue(step, profile)}
          onPress={() => void next()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: minTouchTarget, height: minTouchTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md },
  content: { padding: spacing.lg, gap: spacing.md },
  input: {
    ...typeScale.title,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.4, borderColor: colors.accent },
  bottom: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
});
