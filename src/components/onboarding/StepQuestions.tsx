import { useState } from 'react';
import { Keyboard, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { FamilyTree } from '@/components/family/FamilyTree';
import { pickPhoto, RelativeSheet } from '@/components/family/RelativeSheet';
import { HeadZonePicker } from '@/components/head/HeadZonePicker';
import { Chips, ToggleRow } from '@/components/onboarding/Controls';
import { Text } from '@/components/ui';
import { analyseRelativePhoto, statusForStage } from '@/family/photoAnalysis';
import {
  ANCESTRY,
  CONDITIONS,
  GOALS,
  NOTICED,
  SEX,
  SHEDDING,
  SLEEP,
  SMOKER,
  STRESS,
  TREATMENT_LABEL,
  ZONES,
} from '@/profile/answers';
import { isMinor, MAX_AGE, MIN_AGE, toggleMulti, toggleWorried, toggleZone, treatmentOptions, type Step } from '@/profile/onboarding';
import type { FamilyMember, Profile } from '@/profile/types';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const one = <T,>(v: T | undefined) => (v == null ? [] : [v]);

/**
 * The questions for one onboarding step. Used by onboarding, which saves every answer as it goes,
 * and by "Your answers" in settings, which edits a copy and saves once.
 */
export function StepQuestions({
  step,
  profile,
  set,
  keepPhoto,
}: {
  step: Step;
  profile: Profile;
  set: (change: (p: Profile) => Profile) => void;
  keepPhoto: (member: FamilyMember, uri: string) => Promise<string>;
}) {
  const [member, setMember] = useState<FamilyMember | null>(null);
  const { width } = useWindowDimensions();

  async function addPhoto(m: FamilyMember) {
    const uri = await pickPhoto();
    if (!uri) return;
    const kept = await keepPhoto(m, uri);
    set((p) => ({ ...p, family: { ...p.family, [m]: { status: 'unknown', ...p.family[m], photoUri: kept, photoAnalysis: undefined } } }));
    // Read the hairline from the photo. Its stage fills in their hair status only when the
    // person hasn't picked one; they can always change it.
    const found = await analyseRelativePhoto(kept);
    if (!found) return;
    const { signal: _s, ...photoAnalysis } = found;
    set((p) => {
      const r = p.family[m];
      if (!r || r.photoUri !== kept) return p;
      const status = r.status === 'unknown' ? statusForStage(found.stage) : r.status;
      return { ...p, family: { ...p.family, [m]: { ...r, status, photoAnalysis } } };
    });
  }

  switch (step) {
    case 'basics':
      return (
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
      );
    case 'ancestry':
      return (
        <>
          <Text color="textMuted">How common hair loss is varies by ancestry. Choose all that apply.</Text>
          <Chips multi options={ANCESTRY} selected={profile.ancestry} onToggle={(v) => set((p) => ({ ...p, ancestry: toggleMulti(p.ancestry, v) }))} />
        </>
      );
    case 'where':
      return (
        <>
          <Text color="textMuted">Tap every area that applies.</Text>
          <HeadZonePicker selected={profile.zones} onToggle={(z) => set((p) => toggleZone(p, z))} />
          <Chips multi options={ZONES} selected={profile.zones} onToggle={(z) => set((p) => toggleZone(p, z))} />
          <ToggleRow label="Not noticing it yet, but worried" on={profile.worriedOnly} onPress={() => set(toggleWorried)} />
        </>
      );
    case 'when':
      return (
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
      );
    case 'family':
      return (
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
            onChange={(r) => member && set((p) => ({ ...p, family: { ...p.family, [member]: r } }))}
            onAddPhoto={() => member && void addPhoto(member)}
            onClose={() => setMember(null)}
          />
        </>
      );
    case 'treatments':
      return (
        <>
          <Text color="textMuted">So your plan and your forecast start from where you are.</Text>
          <Chips
            multi
            options={treatmentOptions(profile).map((t) => ({ value: t, label: TREATMENT_LABEL[t] }))}
            selected={profile.treatments}
            onToggle={(v) => set((p) => ({ ...p, treatments: toggleMulti(p.treatments, v, 'none') }))}
          />
        </>
      );
    case 'health':
      return (
        <>
          <Text color="textMuted">Some conditions cause shedding that isn’t genetic. Choose any that apply, or skip.</Text>
          <Chips
            multi
            options={isMinor(profile) ? CONDITIONS.filter((c) => c.value !== 'pcos') : CONDITIONS}
            selected={profile.conditions}
            onToggle={(v) => set((p) => ({ ...p, conditions: toggleMulti(p.conditions, v) }))}
          />
        </>
      );
    case 'lifestyle':
      return (
        <>
          <Text variant="headline">Anything stressful in the past 12 months?</Text>
          <Text variant="caption" color="textMuted">
            Stress can cause temporary shedding 2 to 3 months later.
          </Text>
          <Chips multi options={STRESS} selected={profile.stressEvents} onToggle={(v) => set((p) => ({ ...p, stressEvents: toggleMulti(p.stressEvents, v) }))} />
          <Text variant="headline">Sleep on a typical night</Text>
          <Chips options={SLEEP} selected={one(profile.sleep)} onToggle={(v) => set((p) => ({ ...p, sleep: v }))} />
          <Text variant="headline">Do you smoke?</Text>
          <Chips
            options={SMOKER}
            selected={profile.smoker == null ? [] : [profile.smoker ? 'yes' : 'no']}
            onToggle={(v) => set((p) => ({ ...p, smoker: v === 'yes' }))}
          />
        </>
      );
    case 'goal':
      return <Chips options={GOALS} selected={one(profile.goal)} onToggle={(v) => set((p) => ({ ...p, goal: v }))} />;
  }
}

const styles = StyleSheet.create({
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
});
