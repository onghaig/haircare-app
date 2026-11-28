import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Ring } from '@/components/onboarding/Controls';
import { PlanOdds } from '@/components/predict/PlanOdds';
import { ResumeScanCard } from '@/components/scan/ResumeScanCard';
import { Button, Card, Screen, Text } from '@/components/ui';
import { answer, missedYesterday, progress, streak, type Answer } from '@/plan/log';
import { usePlan } from '@/plan/PlanProvider';
import { biggestNudge, weekStrip } from '@/options/plan';
import { activeSupplies, sheddingHeadsUp, supplies, supplyCopy } from '@/plan/coach';
import { applyReminders, DEFAULT_REMINDERS, reminderPlan, requestReminderPermission } from '@/plan/reminders';
import { dailyTasks, dayKey, type Task, type TaskId } from '@/plan/tasks';
import { TASK_WHY } from '@/plan/why';
import { HEADLINE_YEARS } from '@/predict/predict';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { goalCopy } from '@/reveal/goal';
import { isLowRisk, rangeLabel, yearOf } from '@/reveal/reveal';
import { isPremium } from '@/paywall/purchases';
import { useScans } from '@/scan/ScanProvider';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

/** One daily ring, one big next action, the forecast as a small card. Under 60 seconds a day. */
export default function TodayScreen() {
  const { profile, update } = useProfile();
  const { records, draft } = useScans();
  const { book, change } = usePlan();
  const { forecast, plan } = useForecast();
  const now = useMemo(() => new Date(), []);
  const today = dayKey(now);
  const tasks = dailyTasks(profile, now, records);
  const ids = tasks.map((t) => t.id);
  const medIds = tasks.filter((t) => t.kind === 'medication').map((t) => t.id);
  const { done, total } = progress(book, today, ids);
  const days = streak(book, now);
  const answers = book[today]?.answers ?? {};
  const scanDue = tasks.some((t) => t.id === 'scan');
  const ten = forecast ? yearOf(forecast, HEADLINE_YEARS) : undefined;
  const one = forecast ? yearOf(forecast, 1) : undefined;
  const premium = isPremium(profile);
  const nudge = biggestNudge(plan, book, now);
  const strip = nudge ? weekStrip(book, now, nudge.entry.task) : null;
  const remindersOn = profile.reminders?.enabled ?? false;
  const goal = goalCopy(profile.goal, forecast ? isLowRisk(forecast) : false);
  const active = activeSupplies(profile);
  const lowSupplies = supplies(profile, active, book, now).filter((s) => s.state !== 'ok');
  const headsUp = sheddingHeadsUp(profile, active, book, now);

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
    await applyReminders(reminderPlan({ ...profile, reminders }, reminders, new Date(), book));
  }

  const dismiss = (key: string) => void update((p) => ({ ...p, coach: { ...p.coach, dismissed: [...(p.coach?.dismissed ?? []), key] } }));

  return (
    <Screen
      title="Today"
      action={
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={styles.settings}>
          <Text color="accent">Settings</Text>
        </Pressable>
      }>
      <View style={styles.header}>
        <Text color="textMuted">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
        <View accessible accessibilityLabel={`${done} of ${total} done today`}>
          <Ring percent={total ? (done / total) * 100 : 0} size={56} label={`${done}/${total}`} />
        </View>
      </View>

      {draft ? (
        <ResumeScanCard firstScan={records.length === 0} />
      ) : scanDue ? (
        <Card style={styles.hero}>
          <Text variant="caption" color="accent">
            {records.length === 0 ? 'Your first scan sets your baseline' : 'Weekly scan due today'}
          </Text>
          <Text variant="headline">Same time, same spot</Text>
          <Button label={records.length === 0 ? 'Start your first scan' : 'Start weekly scan'} onPress={() => router.push('/scan/session')} />
        </Card>
      ) : null}

      {lowSupplies.map((s) => (
        <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={supplyCopy(s)} onPress={() => router.push('/coach')}>
          <Card style={styles.alert} testID={`low-${s.id}`}>
            <Text variant="caption" color="warning">
              {s.state === 'out' ? 'Used up' : 'Running low'}
            </Text>
            <Text>{supplyCopy(s)}</Text>
          </Card>
        </Pressable>
      ))}

      {headsUp ? (
        <Card style={styles.headsUp} testID="shedding-heads-up">
          <Text variant="headline">{headsUp.title}</Text>
          <Text variant="caption">{headsUp.body}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Got it" onPress={() => dismiss(headsUp.key)} style={styles.gotIt}>
            <Text color="accent">Got it</Text>
          </Pressable>
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
                  accessibilityHint={TASK_WHY[t.id].text.slice(2)}
                  onPress={() => (t.answer === 'open' && a !== 'done' ? open(t) : set(t.id, a === 'done' ? undefined : 'done'))}
                  style={styles.tap}>
                  <View style={[styles.box, a === 'done' && styles.boxOn]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{t.title}</Text>
                    <Text variant="caption" color="textMuted">
                      {a === 'skipped' ? 'Skipped today' : t.detail}
                    </Text>
                    <Text variant="caption" color={TASK_WHY[t.id].counts && t.kind === 'medication' ? 'accent' : 'textMuted'} style={{ marginTop: 2 }}>
                      {TASK_WHY[t.id].text}
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

      {nudge && strip ? (
        <Card style={{ gap: spacing.sm }} testID="week-strip">
          <View style={styles.spread}>
            <Text variant="headline">{nudge.entry.name} this week</Text>
            <Text>
              <Text style={{ fontWeight: '700' }}>{nudge.done}</Text>
              <Text color="textMuted"> of 7</Text>
            </Text>
          </View>
          <View style={styles.strip} accessible accessibilityLabel={`${nudge.done} of the last 7 days done`}>
            {strip.map((d, i) => (
              <View key={i} style={[styles.day, d && styles.dayOn]} />
            ))}
          </View>
          <Text variant="caption">
            {nudge.entry.role === 'grows' ? 'Gains fade if you stop.' : 'Works best every day.'}
          </Text>
        </Card>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Your Plan" onPress={() => router.push('/predict')}>
        <Card style={{ gap: 4 }}>
          {days > 0 ? (
            <Text variant="caption" color="accent" style={{ alignSelf: 'flex-end' }}>
              {days}-day streak
            </Text>
          ) : null}
          {!ten || !one ? (
            <Text variant="headline" testID="today-forecast">
              Finish your first scan to see your forecast.
            </Text>
          ) : !premium ? (
            <>
              <Text variant="headline">Your Plan</Text>
              <Text variant="headline" testID="today-forecast">
                {`At ${one.age}: ${rangeLabel(one.plan?.band ?? one.untreated)}${one.plan ? ' with plan' : ''}`}
              </Text>
            </>
          ) : (
            <PlanOdds stage={forecast!.reachStage} age={ten.age} before={ten.pReach} withPlan={ten.plan?.pReach} />
          )}
          {goal.today ? (
            <Text variant="caption" color="textMuted">
              {goal.today}
            </Text>
          ) : null}
        </Card>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="Routine coach" onPress={() => router.push('/coach')}>
        <Card style={{ gap: 2 }}>
          <Text variant="headline">Routine coach</Text>
          <Text variant="caption" color="textMuted">
            Reminder times, supplies and product checks
          </Text>
        </Card>
      </Pressable>

      {!remindersOn ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="headline">Reminders</Text>
          <Text variant="caption" color="textMuted">
            Morning, evening and weekly scan. The lock screen never names a medicine.
          </Text>
          <Button label="Turn on reminders" variant="secondary" onPress={() => void turnOnReminders()} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settings: { minHeight: minTouchTarget, justifyContent: 'center', paddingLeft: spacing.sm },
  hero: { gap: spacing.sm, backgroundColor: colors.surfaceRaised, borderColor: colors.accentDim },
  alert: { gap: 2, borderColor: colors.warning },
  headsUp: { gap: spacing.xs, borderColor: colors.info },
  gotIt: { minHeight: minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center' },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  skip: { minHeight: minTouchTarget, minWidth: minTouchTarget, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  strip: { flexDirection: 'row', gap: 5 },
  day: { flex: 1, height: 26, borderRadius: 7, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line },
  dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
