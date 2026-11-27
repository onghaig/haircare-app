import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ToggleRow } from '@/components/onboarding/Controls';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { applyReminders, DEFAULT_REMINDERS, reminderPlan, requestReminderPermission } from '@/plan/reminders';
import { STEP_LABEL, summary } from '@/profile/answers';
import { STEPS, type Step } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import { colors, spacing } from '@/theme';

const edit = (step: Step) => router.push({ pathname: '/settings/[step]', params: { step } });

/** Settings: what you're doing now, every onboarding answer to change, reminders and privacy. */
export default function SettingsScreen() {
  const { profile, update } = useProfile();
  const remindersOn = profile.reminders?.enabled ?? false;

  async function toggleReminders() {
    const enabled = !remindersOn;
    if (enabled && !(await requestReminderPermission())) return;
    const reminders = { ...DEFAULT_REMINDERS, ...profile.reminders, enabled };
    await update((p) => ({ ...p, reminders }));
    await applyReminders(reminderPlan({ ...profile, reminders }, reminders, new Date())).catch(() => {});
  }

  return (
    <SubScreen title="Settings">
      <Card style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          What you use now
        </Text>
        <Text variant="headline" testID="settings-treatments">
          {summary('treatments', profile)}
        </Text>
        <Text variant="caption" color="textMuted">
          Started or stopped something? Change it here and your plan and forecast follow.
        </Text>
        <Button label="Update what I’m doing" onPress={() => edit('treatments')} />
      </Card>

      <Text variant="headline">Your answers</Text>
      <Card style={{ paddingVertical: 2 }}>
        {STEPS.filter((s) => s !== 'treatments').map((s, i, list) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`Change ${STEP_LABEL[s].toLowerCase()}`}
            onPress={() => edit(s)}
            style={[styles.row, i < list.length - 1 && styles.border]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '600' }}>{STEP_LABEL[s]}</Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {summary(s, profile)}
              </Text>
            </View>
            <Text color="textMuted">›</Text>
          </Pressable>
        ))}
      </Card>

      <ToggleRow label="Reminders" on={remindersOn} onPress={() => void toggleReminders()} />

      <Pressable accessibilityRole="link" accessibilityLabel="Privacy" onPress={() => router.push('/privacy')} style={styles.row}>
        <Text style={{ flex: 1 }}>Privacy</Text>
        <Text color="textMuted">›</Text>
      </Pressable>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
