import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScalpMap } from '@/components/scan/ScalpMap';
import { CloseButton, Text } from '@/components/ui';
import { availableViews, DEG_PER_POINT, layersAt, nearestView, RING, stepAngle, TOP, wrap } from '@/scan/panorama';
import type { MapZone } from '@/scan/headModel';
import { compareZone, comparisonText, MAP_ZONE_LABEL, MAP_ZONES, previousGoodScan, scanHairMap } from '@/scan/scalpMap';
import { useScans } from '@/scan/ScanProvider';
import type { ScanRecord } from '@/scan/session';
import { colors, radius, spacing } from '@/theme';

/**
 * Your whole head of hair from one scan: the scalp map (photos stitched top-down, with the hair
 * the camera saw and each zone against your first scan), or turn around your head.
 */
export default function PanoramaScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { records, latest, baseline } = useScans();
  const scan = (id ? records.find((r) => r.id === id) : undefined) ?? latest;
  const [mode, setMode] = useState<'map' | 'turn'>('map');

  if (!scan) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text color="textMuted">No scan to show yet.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
          {mode === 'map' ? 'Your scalp map' : 'Your hair, all the way round'}
        </Text>
        <CloseButton />
      </View>
      <Segments
        options={[
          { key: 'map', label: 'Map' },
          { key: 'turn', label: 'Turn around' },
        ]}
        value={mode}
        onChange={(k) => setMode(k as 'map' | 'turn')}
      />
      {mode === 'map' ? <MapView scan={scan} baseline={baseline} previous={previousGoodScan(records, scan)} /> : <TurnAround scan={scan} />}
    </SafeAreaView>
  );
}

function Segments({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="tab"
          accessibilityLabel={o.label}
          accessibilityState={{ selected: value === o.key }}
          onPress={() => onChange(o.key)}
          style={[styles.segment, value === o.key && styles.segmentOn]}>
          <Text variant="caption" color={value === o.key ? 'onAccent' : 'textMuted'} style={{ fontWeight: '700' }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MapView({ scan, baseline, previous }: { scan: ScanRecord; baseline?: ScanRecord; previous?: ScanRecord }) {
  const { width } = useWindowDimensions();
  const [layer, setLayer] = useState<'photos' | 'hair' | 'both'>('both');
  const [selected, setSelected] = useState<MapZone | null>(null);
  const maps = useMemo(
    () => ({ now: scanHairMap(scan), then: baseline ? scanHairMap(baseline) : undefined, previous }),
    [scan, baseline, previous],
  );
  const size = Math.min(width - spacing.lg * 2, 360);
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, alignItems: 'center' }}>
      <ScalpMap scan={scan} layer={layer} selected={selected} size={size} />
      <Segments
        options={[
          { key: 'photos', label: 'Photos' },
          { key: 'both', label: 'Both' },
          { key: 'hair', label: 'Hair only' },
        ]}
        value={layer}
        onChange={(k) => setLayer(k as 'photos' | 'hair' | 'both')}
      />
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        Your five photos mapped onto a model head and seen from above, forehead at the top. Green is the hair the camera picked out.
        It depends on light and angle, so it is an estimate to compare with your own scans, not a medical measurement.
      </Text>
      <View style={styles.zoneList}>
        {MAP_ZONES.map((z) => (
          <Pressable
            key={z}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === z }}
            onPress={() => setSelected(selected === z ? null : z)}
            style={[styles.zoneRow, selected === z && styles.thumbOn]}
            testID={`zone-row-${z}`}>
            <Text variant="headline" style={{ width: 90 }}>
              {MAP_ZONE_LABEL[z]}
            </Text>
            <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
              {comparisonText(compareZone(z, scan, baseline, maps), z)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

/** Drag to turn around your head, or jump to an angle. */
function TurnAround({ scan }: { scan: ScanRecord }) {
  const [angle, setAngle] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const drag = useRef({ x: 0, angle: 0 });
  const views = useMemo(() => availableViews(scan), [scan]);

  const layers = showTop ? [{ view: TOP.view, opacity: 1 }] : layersAt(angle, views);
  const here = showTop ? TOP.label : (nearestView(angle, views)?.label ?? '');
  const turn = (dir: 1 | -1) => {
    setShowTop(false);
    setAngle(stepAngle(angle, dir, views));
  };

  return (
    <>
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
        {/* The photo layers change while dragging. Kept out of touch handling, so the touch
            always belongs to this stable view: a touch whose target unmounts mid-drag is never
            ended, and the next tap anywhere on screen was swallowed by this view. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {layers.map((l) => (
            <Image
              key={l.view}
              source={{ uri: scan.views[l.view]?.uri }}
              style={[StyleSheet.absoluteFill, { opacity: l.opacity }]}
              contentFit="cover"
              transition={0}
            />
          ))}
        </View>
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
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center' },
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
  segments: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  segment: { minHeight: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.accent },
  zoneList: { alignSelf: 'stretch', gap: spacing.xs },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  thumb: { flex: 1, gap: 4, alignItems: 'center', borderRadius: radius.sm, padding: 4, borderWidth: 1, borderColor: colors.line },
  thumbOn: { borderColor: colors.accent },
  thumbImg: { width: '100%', aspectRatio: 62 / 80, borderRadius: radius.sm - 4, backgroundColor: colors.surface },
});
