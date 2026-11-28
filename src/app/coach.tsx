import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chips, ToggleRow, type Option } from '@/components/onboarding/Controls';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { shortDate } from '@/paywall/plans';
import {
  activeSupplies,
  PACKS,
  sheddingHeadsUp,
  START_OPTIONS,
  SUPPLY_NAME,
  supplyStatus,
  treatmentStart,
  type SupplyId,
} from '@/plan/coach';
import { usePlan } from '@/plan/PlanProvider';
import { DEFAULT_REMINDERS, EVENING_TIMES, MORNING_TIMES, requestReminderPermission, type ReminderSettings } from '@/plan/reminders';
import { addDays, dayKey } from '@/plan/tasks';
import { useProfile } from '@/profile/ProfileProvider';
import { colors, spacing } from '@/theme';

type Time = { hour: number; minute: number };
const timeKey = (t: Time) => `${t.hour}:${String(t.minute).padStart(2, '0')}`;
const timeOptions = (ts: Time[]): Option<string>[] => ts.map((t) => ({ value: timeKey(t), label: timeKey(t) }));
const parseTime = (k: string): Time => {
  const [hour, minute] = k.split(':').map(Number);
  return { hour, minute };
};

/** Reminders, supplies and start dates: the routine coach. */
export default function CoachScreen() {
  const { profile, update } = useProfile();
  const { book } = usePlan();
  const now = useMemo(() => new Date(), []);
  const active = activeSupplies(profile);
  const r: ReminderSettings = { ...DEFAULT_REMINDERS, ...profile.reminders };
  const headsUp = sheddingHeadsUp(profile, active, book, now);

  async function setReminders(next: Partial<ReminderSettings>) {
    const merged = { ...r, ...next };
    if (next.enabled && !(await requestReminderPermission())) return;
    // Scheduling follows from the profile (see ReminderSync).
    await update((p) => ({ ...p, reminders: merged }));
  }

  const restock = (id: SupplyId, doses: number) =>
    void update((p) => ({ ...p, supplies: { ...p.supplies, [id]: { packDoses: doses, since: dayKey(now) } } }));

  const setStart = (id: SupplyId, daysAgo: number) =>
    void update((p) => ({ ...p, treatmentStarts: { ...p.treatmentStarts, [id]: dayKey(addDays(now, -daysAgo)) } }));

  return (
    <SubScreen title="Routine coach">
      {headsUp ? (
        <Card style={styles.headsUp} testID="coach-heads-up">
          <Text variant="headline">{headsUp.title}</Text>
          <Text variant="caption">{headsUp.body}</Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text variant="headline">Reminders</Text>
        <ToggleRow label="Daily reminders" on={r.enabled} onPress={() => void setReminders({ enabled: !r.enabled })} />
        {r.enabled ? (
          <>
            <Text variant="caption" color="textMuted">
              Morning
            </Text>
            <Chips options={timeOptions(MORNING_TIMES)} selected={[timeKey(r.morning)]} onToggle={(k) => void setReminders({ morning: parseTime(k) })} />
            <Text variant="caption" color="textMuted">
              Evening
            </Text>
            <Chips options={timeOptions(EVENING_TIMES)} selected={[timeKey(r.evening)]} onToggle={(k) => void setReminders({ evening: parseTime(k) })} />
          </>
        ) : null}
        <Text variant="caption" color="textMuted">
          Also a week before something runs out. Reminders never name a medicine on the lock screen.
        </Text>
      </Card>

      {active.length === 0 ? (
        <Card style={styles.card}>
          <Text variant="headline">Supplies</Text>
          <Text variant="caption" color="textMuted">
            Nothing to track yet. The coach tracks the treatments you told us you use.
          </Text>
        </Card>
      ) : (
        active.map((id) => {
          const s = profile.supplies?.[id];
          const st = s ? supplyStatus(id, s, book, now) : null;
          const unit = id === 'ketoconazole' ? 'washes' : 'days';
          return (
            <Card key={id} style={styles.card} testID={`supply-${id}`}>
              <Text variant="headline">{SUPPLY_NAME[id]}</Text>
              <Text variant="caption" color={st && st.state !== 'ok' ? 'warning' : 'textMuted'}>
                {!st
                  ? 'Not tracked yet. Pick the pack you are on now.'
                  : st.state === 'out'
                    ? 'Your log says this pack is used up.'
                    : `About ${st.left} ${unit} left, so it runs out around ${shortDate(st.runsOut)}.`}
              </Text>
              <Text variant="caption" color="textMuted">
                {s ? 'Got a new pack? Tap its size.' : 'Pack size'}
              </Text>
              <Chips
                options={PACKS[id].map((p) => ({ value: String(p.doses), label: p.label }))}
                selected={s ? [String(s.packDoses)] : []}
                onToggle={(v) => restock(id, Number(v))}
              />
              {id !== 'ketoconazole' ? <StartRow id={id} start={treatmentStart(profile, book, id)} told={!!profile.treatmentStarts?.[id]} onPick={setStart} /> : null}
            </Card>
          );
        })
      )}

      <Card style={styles.card}>
        <Text variant="headline">Check a product</Text>
        <Text variant="caption" color="textMuted">
          Scan a shampoo’s barcode to see if anything in it is harsh for your hair.
        </Text>
        <Button label="Scan a product" variant="secondary" onPress={() => router.push('/products')} />
      </Card>
    </SubScreen>
  );
}

function StartRow({ id, start, told, onPick }: { id: SupplyId; start: Date | null; told: boolean; onPick: (id: SupplyId, daysAgo: number) => void }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption" color="textMuted">
        {start
          ? `Started around ${shortDate(start)}${told ? '' : ', from your log'}. Started earlier? Pick when.`
          : `When did you start ${SUPPLY_NAME[id].toLowerCase()}?`}
      </Text>
      <Chips options={START_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} selected={[]} onToggle={(v) => onPick(id, START_OPTIONS.find((o) => o.value === v)!.daysAgo)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  headsUp: { gap: spacing.xs, borderColor: colors.info },
});
