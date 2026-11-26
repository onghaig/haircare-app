import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Card, Text } from '@/components/ui';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

const tick = () => void Haptics.selectionAsync().catch(() => {});

/** Wrapping chips. Single choice reads as radio buttons, multi as checkboxes. */
export function Chips<T extends string>({
  options,
  selected,
  onToggle,
  multi = false,
}: {
  options: Option<T>[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chips} accessibilityRole={multi ? undefined : 'radiogroup'}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: on } : { selected: on }}
            accessibilityLabel={o.label}
            accessibilityHint={o.hint}
            onPress={() => {
              tick();
              onToggle(o.value);
            }}
            style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: colors.accent }]}>{o.label}</Text>
            {o.hint ? (
              <Text variant="caption" color="textMuted">
                {o.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A full-width toggle row, for answers that stand apart from the chips. */
export function ToggleRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[styles.row, on && styles.chipOn]}>
      <Text style={[{ flex: 1 }, on && { color: colors.accent }]}>{label}</Text>
      <View style={[styles.radio, on && styles.radioOn]} />
    </Pressable>
  );
}

export function ProgressBar({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.progressText}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="caption" color="textMuted">
          {step} of {total}
        </Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
    </View>
  );
}

/** A percentage ring, as on the risk card and the dashboard. */
export function Ring({ percent, size = 44, label }: { percent: number; size?: number; label?: string }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={5} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, Math.max(0, percent))) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="caption" style={{ fontWeight: '700', fontSize: size > 50 ? 14 : 11 }}>
        {label ?? `${Math.round(percent)}%`}
      </Text>
    </View>
  );
}

/** The live risk card that fills in as the user answers. */
export function RiskCard({ percent, line, remaining }: { percent: number; line: string; remaining: number }) {
  return (
    <Card style={styles.risk} accessibilityLabel={`Your risk card, ${percent}% built. ${line}`}>
      <Ring percent={percent} />
      <View style={{ flex: 1 }}>
        <Text variant="headline">Your risk card</Text>
        <Text variant="caption" color="textMuted">
          {line}. {remaining > 0 ? `${remaining} more answer${remaining === 1 ? '' : 's'}.` : 'Ready.'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { fontWeight: '500' },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.textMuted },
  radioOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  progressText: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  risk: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
});
