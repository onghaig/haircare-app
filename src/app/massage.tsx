import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse } from 'react-native-svg';

import { CrownOutline, HeadOutline } from '@/components/head/HeadDiagram';
import { Chips, ToggleRow } from '@/components/onboarding/Controls';
import { Button, CloseButton, Text } from '@/components/ui';
import { answer } from '@/plan/log';
import { mmss, routineFor, stepAt, totalSeconds, type MassageStep, type Variation } from '@/plan/massage';
import { usePlan } from '@/plan/PlanProvider';
import { loadNaturalVoice, speakNaturally } from '@/scan/voice';
import { dayKey } from '@/plan/tasks';
import { alpha, colors, minTouchTarget, spacing } from '@/theme';

const VARIATIONS = [
  { value: 'full' as const, label: 'Full, 4 min' },
  { value: 'quick' as const, label: 'Quick, 2 min' },
  { value: 'minoxidil' as const, label: 'With minoxidil' },
];

/** Highlight ellipses in the 200 x 236 head box, per area. */
const AREAS: Record<MassageStep['zones'][number], { cx: number; cy: number; rx: number; ry: number }[]> = {
  allOver: [{ cx: 100, cy: 60, rx: 60, ry: 44 }],
  hairline: [{ cx: 100, cy: 66, rx: 40, ry: 12 }],
  temples: [
    { cx: 54, cy: 78, rx: 14, ry: 18 },
    { cx: 146, cy: 78, rx: 14, ry: 18 },
  ],
  sides: [
    { cx: 46, cy: 96, rx: 12, ry: 22 },
    { cx: 154, cy: 96, rx: 12, ry: 22 },
  ],
  top: [{ cx: 100, cy: 58, rx: 40, ry: 24 }],
  crown: [{ cx: 100, cy: 102, rx: 26, ry: 26 }],
  neck: [{ cx: 100, cy: 172, rx: 34, ry: 10 }],
};

/** Guided scalp massage: a timer per step, the area lit on the head, haptic pacing, optional voice. */
export default function MassageScreen() {
  const { change } = usePlan();
  const [variation, setVariation] = useState<Variation>('full');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voice, setVoice] = useState(false);
  const steps = useMemo(() => routineFor(variation), [variation]);
  const total = totalSeconds(steps);
  const at = stepAt(steps, elapsed);
  const finished = at == null;
  const step = steps[at?.index ?? steps.length - 1];

  useEffect(() => {
    if (!running || finished) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, finished]);

  useEffect(() => loadNaturalVoice(), []);

  // Each new step: a firm haptic, and the instruction spoken when voice is on.
  const index = at?.index ?? -1;
  useEffect(() => {
    if (!running || index < 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (voice) speakNaturally(`${steps[index].title}. ${steps[index].movement}`);
  }, [index, running, voice, steps]);

  // The routine auto-completes the day's massage task.
  useEffect(() => {
    if (!finished) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    void change((b) => answer(b, dayKey(new Date()), 'massage', 'done'));
  }, [finished, change]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <View style={{ width: minTouchTarget }} />
        <Text variant="headline">Scalp massage</Text>
        <CloseButton />
      </View>
      <View style={styles.content}>
        {!running && elapsed === 0 ? (
          <Chips options={VARIATIONS} selected={[variation]} onToggle={setVariation} />
        ) : (
          <Text variant="caption" color="textMuted" accessibilityLabel={`Step ${(at?.index ?? steps.length - 1) + 1} of ${steps.length}`}>
            Step {(at?.index ?? steps.length - 1) + 1} of {steps.length}
          </Text>
        )}
        <View style={styles.head}>
          <Svg width={180} height={212} viewBox="0 0 200 236">
            {step.view === 'front' ? <HeadOutline recede={0.2} /> : <CrownOutline />}
            {step.zones.flatMap((z) =>
              AREAS[z].map((e, i) => (
                <Ellipse key={`${z}${i}`} {...e} fill={alpha(colors.accent, 0.28)} stroke={colors.accent} strokeWidth={1.6} />
              )),
            )}
          </Svg>
        </View>
        {finished ? (
          <>
            <Text variant="title">Done. Nice work.</Text>
            <Text color="textMuted">A low-risk daily habit. It’s ticked off on Today.</Text>
          </>
        ) : (
          <>
            <Text variant="title">{step.title}</Text>
            <Text color="textMuted">
              {step.area}. {step.movement}.
            </Text>
            <Text variant="display" accessibilityLabel={`${at?.left ?? step.seconds} seconds left in this step`}>
              {mmss(at?.left ?? step.seconds)}
            </Text>
            <Text variant="caption" color="textMuted">
              {mmss(total - elapsed)} left in total
            </Text>
          </>
        )}
      </View>
      <View style={styles.bottom}>
        {!finished ? <ToggleRow label="Voice guidance" on={voice} onPress={() => setVoice((v) => !v)} /> : null}
        {finished ? (
          <Button label="Done" onPress={() => router.back()} />
        ) : (
          <Button label={running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'} onPress={() => setRunning((r) => !r)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  content: { flex: 1, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  head: { marginVertical: spacing.md },
  bottom: { padding: spacing.lg, gap: spacing.md },
});
