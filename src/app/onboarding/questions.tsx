import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar, RiskCard } from '@/components/onboarding/Controls';
import { StepQuestions } from '@/components/onboarding/StepQuestions';
import { Button, Text } from '@/components/ui';
import { STEP_TITLE } from '@/profile/answers';
import { canContinue, riskCard, STEPS } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import type { Profile } from '@/profile/types';
import { colors, minTouchTarget, spacing } from '@/theme';

/** Onboarding questions, one step per screen, with the live risk card filling in. */
export default function QuestionsScreen() {
  const { profile, update, keepPhoto } = useProfile();
  const [index, setIndex] = useState(0);
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
          {STEP_TITLE[step]}
        </Text>

        <StepQuestions step={step} profile={profile} set={set} keepPhoto={keepPhoto} />
      </ScrollView>
      <View style={styles.bottom}>
        <RiskCard line={card.line} remaining={card.remaining} confidence={card.confidence} />
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
  bottom: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
});
