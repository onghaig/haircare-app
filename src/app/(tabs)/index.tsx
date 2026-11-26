import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Ring } from '@/components/onboarding/Controls';
import { Button, Card, Screen, Text } from '@/components/ui';
import { answer, missedYesterday, progress, streak, type Answer } from '@/plan/log';
import { usePlan } from '@/plan/PlanProvider';
import { applyReminders, DEFAULT_REMINDERS, reminderPlan, requestReminderPermission } from '@/plan/reminders';
import { dailyTasks, dayKey, type Task, type TaskId } from '@/plan/tasks';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { rangeLabel, yearOf } from '@/reveal/reveal';
import { useScans } from '@/scan/ScanProvider';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

/** One daily ring, one big next action, the forecast as a small card. Under 60 seconds a day. */
export default function TodayScreen() {
  const { profile, update } = useProfile();
  const { records } = useScans();
  const { book, change } = usePlan();
  const { forecast } = useForecast();
  const now = useMemo(() => new Date(), []);
  const today = dayKey(now);
  const tasks = dailyTasks(profile, now, records);
  const ids = tasks.map((t) => t.id);
  const medIds = tasks.filter((t) => t.kind === 'medication').map((t) => t.id);
  const { done, total } = progress(book, today, ids);
  const days = streak(book, now);
  const answers = book[today]?.answers ?? {};
  const scanDue = tasks.some((t) => t.id === 'scan');
  const fiveYears = forecast ? yearOf(forecast, 5) : undefined;
  const remindersOn = profile.reminders?.enabled ?? false;

  const set = (id: TaskId, a: Answer | undefined) => void change((b) => answer(b, today, id, a));

  function open(t: Task) {
    if (t.id === 'massage') router.push('/massage');
    else if (t.id === 'quickLog') router.push('/log');
    else if (t.id === 'scan') router.push('/scan/session');
  }

  async function turnOnReminders() {
    if (!(await requestReminderPermission())) return;
    const reminders = { ...DEFAULT_REMINDERS, ...profile.reminders, enabled: true };
    await update((p) => ({ ...p, reminders }));
    await applyReminders(reminderPlan({ ...profile, reminders }, reminders, new Date()));
  }

  return (
    <Screen title="Today">
      <View style={styles.header}>
        <Text color="textMuted">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
        <View accessible accessibilityLabel={`${done} of ${total} done today`}>
          <Ring percent={total ? (done / total) * 100 : 0} size={56} label={`${done}/${total}`} />
        </View>
      </View>

      {scanDue ? (
        <Card style={styles.hero}>
          <Text variant="caption" color="accent">
            {records.length === 0 ? 'Your first scan sets your baseline' : 'Weekly scan due today'}
          </Text>
          <Text variant="headline">Same time, same spot</Text>
          <Button label={records.length === 0 ? 'Start your first scan' : 'Start weekly scan'} onPress={() => router.push('/scan/session')} />
        </Card>
      ) : null}

      {missedYesterday(book, now, medIds) ? (
        <Text variant="caption" color="textMuted">
          Missed yesterday? Just take today’s dose as usual.
        </Text>
      ) : null}

      <Card style={{ paddingVertical: 2 }}>
        {tasks
          .filter((t) => t.id !== 'scan')
          .map((t, i, list) => {
            const a = answers[t.id];
            return (
              <View key={t.id} style={[styles.row, i < list.length - 1 && styles.border]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: a === 'done' }}
                  accessibilityLabel={t.title}
                  onPress={() => (t.answer === 'open' && a !== 'done' ? open(t) : set(t.id, a === 'done' ? undefined : 'done'))}
                  style={styles.tap}>
                  <View style={[styles.box, a === 'done' && styles.boxOn]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{t.title}</Text>
                    <Text variant="caption" color="textMuted">
                      {a === 'skipped' ? 'Skipped today' : t.detail}
                    </Text>
                  </View>
                </Pressable>
                {t.answer === 'yesSkip' && !a ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${t.title}`} onPress={() => set(t.id, 'skipped')} style={styles.skip}>
                    <Text variant="caption" color="textMuted">
                      Skip
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
      </Card>

      <Card style={{ gap: 4 }}>
        <View style={styles.spread}>
          <Text variant="headline">Your forecast</Text>
          {days > 0 ? (
            <Text variant="caption" color="accent">
              {days}-day streak
            </Text>
          ) : null}
        </View>
        <Text color="textMuted">
          {fiveYears ? `Likely at ${fiveYears.age}: ${rangeLabel(fiveYears.untreated)}` : 'Finish your first scan to see your forecast.'}
        </Text>
        <Text variant="caption" color="textMuted">
          You vs your forecast starts with your first monthly verdict.
        </Text>
      </Card>

      {!remindersOn ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">Reminders</Text>
          <Text variant="caption" color="textMuted">
            A morning and an evening nudge, and your weekly scan. They never name a medication on the lock screen.
          </Text>
          <Button label="Turn on reminders" variant="secondary" onPress={() => void turnOnReminders()} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { gap: spacing.sm, backgroundColor: colors.surfaceRaised, borderColor: colors.accentDim },
  row: { flexDirection: 'row', alignItems: 'center' },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  skip: { minHeight: minTouchTarget, minWidth: minTouchTarget, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
