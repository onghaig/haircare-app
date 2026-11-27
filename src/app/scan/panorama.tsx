import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { availableViews, DEG_PER_POINT, layersAt, nearestView, RING, stepAngle, TOP, wrap } from '@/scan/panorama';
import { useScans } from '@/scan/ScanProvider';
import { colors, minTouchTarget, radius, spacing } from '@/theme';

/** Your whole head of hair from one scan: drag to turn around it, or jump to an angle. */
export default function PanoramaScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { records, latest } = useScans();
  const scan = (id ? records.find((r) => r.id === id) : undefined) ?? latest;
  const [angle, setAngle] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const drag = useRef({ x: 0, angle: 0 });
  const views = useMemo(() => (scan ? availableViews(scan) : []), [scan]);

  if (!scan) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text color="textMuted">No scan to show yet.</Text>
      </SafeAreaView>
    );
  }

  const layers = showTop ? [{ view: TOP.view, opacity: 1 }] : layersAt(angle, views);
  const here = showTop ? TOP.label : (nearestView(angle, views)?.label ?? '');
  const turn = (dir: 1 | -1) => {
    setShowTop(false);
    setAngle(stepAngle(angle, dir, views));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
          Your hair, all the way round
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
          <Text color="textMuted">Close</Text>
        </Pressable>
      </View>

      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          drag.current = { x: e.nativeEvent.pageX, angle };
        }}
        onResponderMove={(e) => {
          setShowTop(false);
          setAngle(wrap(drag.current.angle - (e.nativeEvent.pageX - drag.current.x) * DEG_PER_POINT));
        }}
        style={styles.viewer}
        testID="panorama-viewer"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Hair panorama"
        accessibilityValue={{ text: here }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => turn(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        {layers.map((l) => (
          <Image
            key={l.view}
            source={{ uri: scan.views[l.view]?.uri }}
            style={[StyleSheet.absoluteFill, { opacity: l.opacity }]}
            contentFit="cover"
            transition={0}
          />
        ))}
        <View style={styles.badge} pointerEvents="none">
          <Text variant="caption" style={{ fontWeight: '700' }} testID="panorama-angle">
            {here}
          </Text>
        </View>
      </View>
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        Drag to turn around your head. Your scan photos, blended between angles.
      </Text>

      <View style={styles.strip}>
        {[...RING.map((r) => ({ ...r, top: false })), { view: TOP.view, label: TOP.label, angle: 0, top: true }]
          .filter((r) => views.includes(r.view))
          .map((r) => {
            const on = showTop ? r.top : !r.top && r.label === here;
            return (
              <Pressable
                key={r.view}
                accessibilityRole="button"
                accessibilityLabel={`Show ${r.label.toLowerCase()}`}
                testID={`panorama-thumb-${r.view}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setShowTop(r.top);
                  if (!r.top) setAngle(r.angle);
                }}
                style={[styles.thumb, on && styles.thumbOn]}>
                <Image source={{ uri: scan.views[r.view]?.uri }} style={styles.thumbImg} contentFit="cover" />
                <Text variant="caption" color={on ? 'accent' : 'textMuted'}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center' },
  close: { minHeight: minTouchTarget, justifyContent: 'center' },
  viewer: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  badge: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  strip: { flexDirection: 'row', gap: spacing.xs },
  thumb: { flex: 1, gap: 4, alignItems: 'center', borderRadius: radius.sm, padding: 4, borderWidth: 1, borderColor: colors.line },
  thumbOn: { borderColor: colors.accent },
  thumbImg: { width: '100%', aspectRatio: 62 / 80, borderRadius: radius.sm - 4, backgroundColor: colors.surface },
});
