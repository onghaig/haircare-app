import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { StepQuestions } from '@/components/onboarding/StepQuestions';
import { Button, SubScreen, Text } from '@/components/ui';
import { applyStep, isStep, STEP_TITLE, stepChanged } from '@/profile/answers';
import { canContinue } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import type { Profile } from '@/profile/types';

/**
 * Change one onboarding answer. Edits a copy and saves once: every saved change re-runs the
 * forecast, which holds the phone for a few seconds, so taps here never touch the saved profile.
 */
export default function EditAnswerScreen() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const { profile, loaded, update, keepPhoto } = useProfile();
  // Unedited, the copy is the saved answers (once they have loaded); the first tap forks it.
  const [edited, setEdited] = useState<Profile | null>(null);
  const draft = edited ?? (loaded ? profile : null);
  const [saving, setSaving] = useState(false);

  if (!isStep(step)) {
    return (
      <SubScreen title="Not found">
        <Text color="textMuted">This question doesn’t exist.</Text>
      </SubScreen>
    );
  }

  if (!draft) return <SubScreen title={STEP_TITLE[step]} />;
  const changed = stepChanged(profile, draft, step);

  async function save() {
    if (!isStep(step) || !draft) return;
    setSaving(true);
    await update((p) => applyStep(p, draft, step));
    router.back();
  }

  return (
    <SubScreen title={STEP_TITLE[step]}>
      <StepQuestions step={step} profile={draft} set={(change) => setEdited((d) => change(d ?? draft))} keepPhoto={keepPhoto} />
      <Button label="Save" disabled={!changed || saving || !canContinue(step, draft)} onPress={() => void save()} />
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        Your plan and forecast update when you save.
      </Text>
    </SubScreen>
  );
}
