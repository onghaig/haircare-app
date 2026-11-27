import * as Notifications from 'expo-notifications';

import type { Profile } from '@/profile/types';

export interface ReminderSettings {
  enabled: boolean;
  morning: { hour: number; minute: number };
  evening: { hour: number; minute: number };
  /** 1 = Sunday ... 7 = Saturday (the notification API's numbering). */
  scanWeekday: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  morning: { hour: 8, minute: 0 },
  evening: { hour: 20, minute: 30 },
  scanWeekday: 1,
};

export type Reminder =
  | { id: string; title: string; body: string; trigger: { type: 'daily'; hour: number; minute: number } }
  | { id: string; title: string; body: string; trigger: { type: 'weekly'; weekday: number; hour: number; minute: number } }
  | { id: string; title: string; body: string; trigger: { type: 'date'; date: Date } };

/**
 * Local notifications only, so they work offline and keep medication details off push servers.
 * Lock-screen text never names a medication.
 */
export function reminderPlan(profile: Profile, s: ReminderSettings, now: Date): Reminder[] {
  if (!s.enabled) return [];
  const out: Reminder[] = [
    { id: 'morning', title: 'Haircare', body: 'Time for your morning routine', trigger: { type: 'daily', ...s.morning } },
    { id: 'evening', title: 'Haircare', body: 'Evening check-in: massage and quick log', trigger: { type: 'daily', ...s.evening } },
    { id: 'scan', title: 'Haircare', body: 'Your weekly scan is due', trigger: { type: 'weekly', weekday: s.scanWeekday, ...s.morning } },
  ];
  const end = profile.subscription?.trialEndsAt ? new Date(profile.subscription.trialEndsAt) : null;
  if (end) {
    // The paywall promises a reminder the day before the trial ends.
    const date = new Date(end.getTime() - 86_400_000);
    if (date > now) {
      out.push({ id: 'trial', title: 'Haircare', body: 'Your free trial ends tomorrow. Cancel in one tap in Settings if you want to.', trigger: { type: 'date', date } });
    }
  }
  return out;
}

/** Asks once. Returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Replaces every scheduled reminder with the plan. */
export async function applyReminders(plan: Reminder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of plan) {
    const t = r.trigger;
    const trigger: Notifications.NotificationTriggerInput =
      t.type === 'daily'
        ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: t.hour, minute: t.minute }
        : t.type === 'weekly'
          ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: t.weekday, hour: t.hour, minute: t.minute }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t.date };
    await Notifications.scheduleNotificationAsync({ identifier: r.id, content: { title: r.title, body: r.body }, trigger });
  }
}
