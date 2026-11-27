import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { mapXY, MAP_ZONE_LABEL, ZONE_EDGES, type MapZone } from '@/scan/headModel';
import { renderScalpImage } from '@/scan/scalpRender';
import { scanHairMap } from '@/scan/scalpMap';
import type { ScanRecord } from '@/scan/session';
import { colors } from '@/theme';

/** Arc of constant angle-from-the-top between two directions, as an SVG path in a 0..s box. */
function arc(theta: number, phiFrom: number, phiTo: number, s: number): string {
  const pts: string[] = [];
  for (let k = 0; k <= 24; k++) {
    const phi = phiFrom + ((phiTo - phiFrom) * k) / 24;
    const [x, y] = mapXY(theta, phi);
    pts.push(`${k ? 'L' : 'M'} ${((x + 1) / 2) * s} ${((y + 1) / 2) * s}`);
  }
  return pts.join(' ');
}

function ray(phi: number, from: number, to: number, s: number): string {
  const [x0, y0] = mapXY(from, phi);
  const [x1, y1] = mapXY(to, phi);
  return `M ${((x0 + 1) / 2) * s} ${((y0 + 1) / 2) * s} L ${((x1 + 1) / 2) * s} ${((y1 + 1) / 2) * s}`;
}

/** Zone outlines on the map: the top cap, the front, the two sides and the crown. */
export function zonePaths(s: number): string[] {
  const { topTheta: t, frontPhi: f, sidePhi: b } = ZONE_EDGES;
  return [
    arc(105, -180, 180, s),
    arc(t, -b, b, s),
    arc(15, b, 360 - b, s),
    ray(f, t, 105, s),
    ray(-f, t, 105, s),
    ray(b, 15, 105, s),
    ray(-b, 15, 105, s),
  ];
}

const LABEL_AT: Record<MapZone, [number, number]> = {
  front: [80, 0],
  leftTemple: [78, 72],
  rightTemple: [78, -72],
  top: [22, 0],
  crown: [60, 180],
};

/**
 * The scan's photos mapped onto a model head and unrolled into one top-down map (forehead at
 * the top, your left on the left), with the hair the camera saw drawn over it.
 */
export function ScalpMap({
  scan,
  layer,
  selected,
  size,
}: {
  scan: ScanRecord;
  layer: 'photos' | 'hair' | 'both';
  selected?: MapZone | null;
  size: number;
}) {
  const [image, setImage] = useState<{ id: string; uri: string | null } | null>(null);
  const hair = useMemo(() => scanHairMap(scan), [scan]);
  const paths = useMemo(() => zonePaths(size), [size]);

  useEffect(() => {
    let live = true;
    renderScalpImage(scan)
      .then((uri) => live && setImage({ id: scan.id, uri }))
      .catch(() => live && setImage({ id: scan.id, uri: null }));
    return () => {
      live = false;
    };
  }, [scan]);

  const current = image?.id === scan.id ? image : null;
  const cell = size / hair.size;
  return (
    <View style={{ width: size, height: size }} testID="scalp-map" accessibilityLabel="Map of your scalp from above, forehead at the top">
      <View style={[StyleSheet.absoluteFill, styles.disc, { borderRadius: size / 2 }]} />
      {layer !== 'hair' && current?.uri ? (
        <Image
          source={{ uri: current.uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          contentFit="fill"
          transition={200}
          testID="scalp-map-image"
        />
      ) : null}
      {layer !== 'hair' && !current ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="caption" color="textMuted">
            Mapping your photos onto your head…
          </Text>
        </View>
      ) : null}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {layer !== 'photos' ? (
          <G testID="scalp-map-hair">
            {hair.hair.map((h, k) =>
              h > 0.02 ? (
                <Rect
                  key={k}
                  x={(k % hair.size) * cell}
                  y={Math.floor(k / hair.size) * cell}
                  width={cell + 0.4}
                  height={cell + 0.4}
                  fill={colors.accent}
                  opacity={(layer === 'both' ? 0.5 : 0.9) * h}
                />
              ) : null,
            )}
          </G>
        ) : null}
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke={colors.text} strokeOpacity={0.35} strokeWidth={1} fill="none" />
        ))}
        {(Object.keys(LABEL_AT) as MapZone[]).map((z) => {
          const [x, y] = mapXY(...LABEL_AT[z]);
          return (
            <SvgText
              key={z}
              x={((x + 1) / 2) * size}
              y={((y + 1) / 2) * size + 4}
              fill={selected === z ? colors.accent : colors.text}
              fontSize={12}
              fontWeight="700"
              textAnchor="middle"
              stroke={colors.bg}
              strokeWidth={0.6}>
              {MAP_ZONE_LABEL[z]}
            </SvgText>
          );
        })}
      </Svg>
      {current && !current.uri && layer !== 'hair' ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center', maxWidth: size * 0.7 }}>
            This scan’s photos can’t be placed on the head. Scans from this version on can.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.surfaceRaised },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
});
