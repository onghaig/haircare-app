import Svg, { G, Path } from 'react-native-svg';

import { Face, hairlineGeometry } from '@/components/head/Face';
import { faceForStage } from '@/reveal/reveal';
import type { SketchShape } from '@/styles/catalog';
import { illustration as il, mix } from '@/theme';

/**
 * A drawn try-on, for when there's no AI image. The hairline stays where the user's stage puts
 * it, and hair is drawn thinner as the stage goes up, so a style never looks fuller than it would.
 */
export function StyleSketch({ id, shape, stage, size = '100%' }: { id: string; shape: SketchShape; stage: number; size?: number | string }) {
  const { recede, top } = faceForStage(stage);
  const g = hairlineGeometry(recede, top);
  const density = Math.max(0.25, 1 - top * 0.8);
  const ownHair = shape === 'part' || shape === 'volume' || shape === 'back' || shape === 'long';
  const hair = il.hair;
  const light = mix(il.hair, il.hairLight, 0.6);
  // The skull cap above the hairline, lifted for longer cuts.
  const cap = (lift: number) => `${g.d} C154 ${60 - lift} ${138 - lift / 2} ${26 - lift} 100 ${26 - lift} C${62 + lift / 2} ${26 - lift} 46 ${60 - lift} 46 ${g.ty}Z`;
  const fringeTop = Math.min(g.hy, g.ty) - 4;
  const fringe =
    `M50 ${fringeTop} C70 ${fringeTop - 30} 130 ${fringeTop - 30} 150 ${fringeTop} L148 72 ` +
    Array.from({ length: 12 }, (_, i) => `l-8 ${i % 2 ? -6 : 6}`).join(' ') +
    ' Z';

  return (
    <Svg width={size} height={size} viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice">
      <Face id={id} recede={recede} top={top} shoulders noHair={!ownHair} />
      <G>
        {shape === 'stubble' ? <Path d={cap(0)} fill={hair} opacity={0.45 * density} /> : null}
        {shape === 'bare' ? <Path d="M70 40 Q100 30 130 40" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" opacity={0.12} fill="none" /> : null}
        {shape === 'short' ? <Path d={cap(6)} fill={hair} opacity={0.9 * density} /> : null}
        {shape === 'fringe' ? (
          <>
            <Path d={cap(8)} fill={hair} opacity={0.9 * density} />
            <Path d={fringe} fill={hair} opacity={density} />
          </>
        ) : null}
        {shape === 'part' ? (
          <>
            <Path d={`M74 ${g.mid} Q72 40 80 15`} stroke={il.skin} strokeWidth={2.2} fill="none" opacity={0.8} />
            <Path d={`M82 18 Q120 14 150 ${g.ty - 10}`} stroke={light} strokeWidth={1.6} fill="none" opacity={0.6} />
            <Path d={`M86 30 Q120 26 146 ${g.ty}`} stroke={light} strokeWidth={1.6} fill="none" opacity={0.5} />
          </>
        ) : null}
        {shape === 'volume' ? (
          <Path d={`M64 ${g.hy + 2} C52 20 92 -2 136 8 C154 14 150 36 136 ${g.hy + 2} Z`} fill={hair} opacity={density} />
        ) : null}
        {shape === 'back' ? (
          <>
            {[70, 85, 100, 115, 130].map((x) => (
              <Path key={x} d={`M${x} ${g.hy + 4} Q${x + (x - 100) * 0.1} 34 ${100 + (x - 100) * 0.7} 14`} stroke={light} strokeWidth={1.5} fill="none" opacity={0.55} />
            ))}
          </>
        ) : null}
        {shape === 'long' ? (
          <>
            <Path d="M46 64 C30 100 30 150 48 176 L60 170 C48 140 48 108 54 84Z" fill={hair} opacity={density} />
            <Path d="M154 64 C170 100 170 150 152 176 L140 170 C152 140 152 108 146 84Z" fill={hair} opacity={density} />
          </>
        ) : null}
      </G>
    </Svg>
  );
}
