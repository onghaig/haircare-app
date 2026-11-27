import Svg, { ClipPath, Defs, G, Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg';

import { gridCells, mapZones, MAP_SIZE, photoPlacement } from '@/scan/scalpMap';
import type { ScanRecord } from '@/scan/session';
import { colors } from '@/theme';

/**
 * The scan's photos stitched into one top-down map of the head, each clipped to its zone,
 * with the hair the camera saw drawn over them. `layer` picks photos, the hair map, or both.
 */
export function ScalpMap({
  scan,
  layer,
  selected,
  size,
}: {
  scan: ScanRecord;
  layer: 'photos' | 'hair' | 'both';
  selected?: string | null;
  size: number;
}) {
  const zones = mapZones(scan);
  const pad = 14;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${MAP_SIZE + pad * 2} ${MAP_SIZE + pad * 2}`}
      testID="scalp-map"
      accessibilityLabel="Map of your scalp from above, forehead at the top">
      <Defs>
        {zones.map((z) => (
          <ClipPath key={z.view} id={`zone-${z.view}`}>
            <Path d={z.path} />
          </ClipPath>
        ))}
      </Defs>
      {zones.map((z) => {
        const v = scan.views[z.view]!;
        const p = photoPlacement(z);
        const showPhoto = layer !== 'hair';
        const showHair = layer !== 'photos' && !!v.hairGrid;
        return (
          <G key={z.view} clipPath={`url(#zone-${z.view})`} testID={`scalp-zone-${z.view}`}>
            <Rect x={z.box.x} y={z.box.y} width={z.box.w} height={z.box.h} fill={colors.surfaceRaised} />
            {showPhoto ? (
              <SvgImage href={{ uri: v.uri }} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="none" />
            ) : null}
            {showHair
              ? gridCells(z, v.hairGrid!).map((c, i) => (
                  <Rect
                    key={i}
                    x={c.x}
                    y={c.y}
                    width={c.w + 0.3}
                    height={c.h + 0.3}
                    fill={colors.accent}
                    opacity={(layer === 'both' ? 0.55 : 0.9) * c.value}
                  />
                ))
              : null}
          </G>
        );
      })}
      {zones.map((z) => (
        <Path
          key={`edge-${z.view}`}
          d={z.path}
          fill="none"
          stroke={selected === z.view ? colors.accent : colors.line}
          strokeWidth={selected === z.view ? 2.5 : 1}
        />
      ))}
      {zones.map((z) => (
        <SvgText
          key={`label-${z.view}`}
          x={z.labelAt[0]}
          y={z.labelAt[1]}
          fill={colors.textMuted}
          fontSize={9}
          fontWeight="600"
          textAnchor="middle"
          rotation={z.view === 'leftTemple' ? -90 : z.view === 'rightTemple' ? 90 : 0}
          origin={`${z.labelAt[0]}, ${z.labelAt[1]}`}>
          {z.label}
        </SvgText>
      ))}
    </Svg>
  );
}
