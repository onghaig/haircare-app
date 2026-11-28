import { useEffect, useRef } from 'react';

import { useProfile } from '@/profile/ProfileProvider';

import { usePlan } from './PlanProvider';
import { applyReminders, reminderPlan } from './reminders';

/**
 * Keeps the scheduled reminders in step with the plan: a logged dose moves the stock-out date,
 * a new pack or start date moves the heads-ups. Reschedules only when the plan really changed.
 */
export function ReminderSync() {
  const { profile, loaded } = useProfile();
  const { book, loaded: logLoaded } = usePlan();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !logLoaded || !profile.reminders?.enabled) return;
    const plan = reminderPlan(profile, profile.reminders, new Date(), book);
    const key = JSON.stringify(plan);
    if (key === last.current) return;
    last.current = key;
    void applyReminders(plan).catch(() => {
      last.current = null;
    });
  }, [profile, book, loaded, logLoaded]);

  return null;
}
