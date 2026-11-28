import { useMemo, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui';
import { alpha, colors, radius, spacing } from '@/theme';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Two pictures in one frame with a handle to drag between them: the left one shows up to the
 * handle, the right one after it. Screen readers get it as an adjustable control.
 */
export function BeforeAfter({
  left,
  right,
  leftLabel,
  rightLabel,
  height = 300,
  start = 0.5,
  testID,
}: {
  left: ReactNode;
  right: ReactNode;
  leftLabel: string;
  rightLabel: string;
  height?: number;
  start?: number;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [t, setT] = useState(start);
  const pan = useMemo(() => {
    const from = { x: 0 };
    return PanResponder.create({
      // Only a sideways drag moves the handle, so a vertical swipe over the picture still
      // scrolls the screen.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => {
        from.x = e.nativeEvent.locationX - g.dx;
        if (width) setT(clamp01(e.nativeEvent.locationX / width));
      },
      onPanResponderMove: (_, g) => {
        if (width) setT(clamp01((from.x + g.dx) / width));
      },
    });
  }, [width]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pct = Math.round(t * 100);

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={onLayout}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${leftLabel} or ${rightLabel}`}
      accessibilityValue={{ text: pct >= 50 ? `Mostly ${leftLabel}` : `Mostly ${rightLabel}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => setT((v) => clamp01(v + (e.nativeEvent.actionName === 'increment' ? 0.25 : -0.25)))}
      {...pan.panHandlers}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {right}
      </View>
      <View style={[styles.clip, { width: `${pct}%` }]} pointerEvents="none" testID={testID ? `${testID}-left` : undefined}>
        <View style={{ width: width || '100%', height }}>{left}</View>
      </View>
      <View style={[styles.handle, { left: `${pct}%` }]} pointerEvents="none">
        <View style={styles.knob}>
          <Text style={styles.knobText}>‹ ›</Text>
        </View>
      </View>
      <Tag label={leftLabel} side="left" />
      <Tag label={rightLabel} side="right" />
    </View>
  );
}

function Tag({ label, side }: { label: string; side: 'left' | 'right' }) {
  return (
    <View style={[styles.tag, side === 'left' ? { left: spacing.sm } : { right: spacing.sm }]} pointerEvents="none">
      <Text variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  clip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  knob: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  knobText: { color: colors.bg, fontWeight: '800', fontSize: 13, lineHeight: 16 },
  tag: { position: 'absolute', top: spacing.sm, backgroundColor: alpha(colors.bg, 0.75), borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
