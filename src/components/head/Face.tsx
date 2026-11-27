import { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { alpha, colors, illustration as il, mix } from '@/theme';

export interface FaceProps {
  /** Unique per instance: gradient ids are global inside an SVG document. */
  id: string;
  /** Temple recession, 0 (none) to 1 (deep). */
  recede?: number;
  /** How far back the central hairline sits, 0 (low) to 1 (bald on top). */
  top?: number;
  skin?: string;
  hair?: string;
  /** Draw the green hairline trace with temple and centre points. */
  trace?: boolean;
  shoulders?: boolean;
  /** Leave the hair off (a style sketch draws its own). Eyebrows stay. */
  noHair?: boolean;
}

/** The hairline curve for a given recession, in the 200 x 236 face box. */
export function hairlineGeometry(recede = 0, top = 0) {
  const hy = 58 + top * 26;
  const ty = 96 - recede * 30;
  const tx = recede * 10;
  const mid = 68 + top * 20;
  const knee = 74 + top * 16 - recede * 4;
  const d =
    `M46 ${ty} C${52 + tx} ${ty - 14} ${60 + tx} ${knee} ${74 + tx / 2} ${mid} ` +
    `C84 ${hy + 2} 92 ${hy} 100 ${hy} C108 ${hy} 116 ${hy + 2} ${126 - tx / 2} ${mid} ` +
    `C${140 - tx} ${knee} ${148 - tx} ${ty - 14} 154 ${ty}`;
  return { d, hy, ty, tx, mid, knee, points: [[46, ty], [100, hy], [154, ty]] as const };
}

/**
 * A realistic front-view head, drawn in a 200 x 236 box (put it in an Svg with that viewBox).
 * Ported from the signed-off mockups.
 */
export function Face({ id, recede = 0, top = 0, skin = il.skin, hair = il.hair, trace, shoulders, noHair }: FaceProps) {
  const g = hairlineGeometry(recede, top);
  const { hy, ty, tx, mid, knee } = g;
  const bald = top > 0.9;
  const hairShape =
    `M42 ${ty + 6} C36 50 62 14 100 13 C138 14 164 50 158 ${ty + 6} L154 ${ty} ` +
    `C${148 - tx} ${ty - 14} ${140 - tx} ${knee} ${126 - tx / 2} ${mid} C116 ${hy + 2} 108 ${hy} 100 ${hy} ` +
    `C92 ${hy} 84 ${hy + 2} ${74 + tx / 2} ${mid} C${60 + tx} ${knee} ${52 + tx} ${ty - 14} 46 ${ty}Z`;
  return (
    <G>
      <Defs>
        <RadialGradient id={`sk${id}`} cx="0.4" cy="0.35" r="0.75">
          <Stop offset="0" stopColor={skin} />
          <Stop offset="0.7" stopColor={mix(skin, il.skinShade, 0.18)} />
          <Stop offset="1" stopColor={mix(skin, il.skinDeep, 0.4)} />
        </RadialGradient>
        <LinearGradient id={`hr${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={mix(hair, il.hairLight, 0.3)} />
          <Stop offset="1" stopColor={hair} />
        </LinearGradient>
        <LinearGradient id={`nk${id}`} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={mix(skin, il.skinDeep, 0.45)} />
          <Stop offset="1" stopColor={mix(skin, il.skinShade, 0.2)} />
        </LinearGradient>
      </Defs>
      <Path d="M78 180 L76 226 Q100 236 124 226 L122 180Z" fill={`url(#nk${id})`} />
      {shoulders ? (
        <>
          <Path d="M20 240 C26 214 52 206 80 202 Q100 214 120 202 C148 206 174 214 180 240Z" fill={il.shirt} />
          <Path d="M80 202 Q100 222 120 202" fill="none" stroke={il.shirtShade} strokeWidth={3} />
        </>
      ) : null}
      <Ellipse cx={43} cy={118} rx={9} ry={17} fill={`url(#sk${id})`} />
      <Ellipse cx={157} cy={118} rx={9} ry={17} fill={`url(#sk${id})`} />
      <Path d="M100 26C62 26 46 60 46 104C46 146 62 184 100 194C138 184 154 146 154 104C154 60 138 26 100 26Z" fill={`url(#sk${id})`} />
      <Path d="M58 150Q70 186 100 194Q130 186 142 150Q132 176 100 182Q68 176 58 150Z" fill={alpha('#000000', 0.13)} />
      {bald || noHair ? null : <Path d={hairShape} fill={`url(#hr${id})`} />}
      <Path d="M66 100q12-6 24-1M110 99q12-5 24 1" stroke={hair} strokeWidth={3.6} fill="none" strokeLinecap="round" />
      <Path d="M68 114q10-6 20 0q-10 5-20 0zM112 114q10-6 20 0q-10 5-20 0z" fill={il.eyeWhite} />
      <Circle cx={78} cy={114} r={3.4} fill={il.iris} />
      <Circle cx={122} cy={114} r={3.4} fill={il.iris} />
      <Path d="M98 116 Q95 140 90 146 Q100 152 110 146 Q105 140 102 116" fill={alpha('#000000', 0.09)} />
      <Path d="M86 164 Q100 158 114 164 Q100 172 86 164Z" fill={mix(skin, il.lips, 0.4)} />
      {trace && !bald ? (
        <>
          <Path d={g.d} fill="none" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" />
          {g.points.map(([x, y]) => (
            <Circle key={`${x}`} cx={x} cy={y} r={3} fill={colors.bg} stroke={colors.accent} strokeWidth={1.6} />
          ))}
        </>
      ) : null}
    </G>
  );
}

/** The back-and-top view used for the crown and mid-scalp zones, in the same 200 x 236 box. */
export function CrownView({ id }: { id: string }) {
  const swirls = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const p = (r: number, da: number, ry = r) =>
      `${(100 + Math.cos(a + da) * r).toFixed(1)} ${(96 + Math.sin(a + da) * ry).toFixed(1)}`;
    return `M${p(6, 0)}Q${p(30, 0.9)} ${p(58, 1.4, 62)}`;
  });
  return (
    <G>
      <Defs>
        <RadialGradient id={`cv${id}`} cx="0.5" cy="0.4">
          <Stop offset="0" stopColor={il.crownHair} />
          <Stop offset="1" stopColor={il.crownHairDeep} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={38} cy={112} rx={9} ry={16} fill={mix(il.skin, il.skinShade, 0.1)} />
      <Ellipse cx={162} cy={112} rx={9} ry={16} fill={mix(il.skin, il.skinShade, 0.1)} />
      <Path d="M80 176 L78 226 Q100 236 122 226 L120 176Z" fill={mix(il.skin, il.skinShade, 0.3)} />
      <Path d="M100 20C58 20 40 56 40 100C40 140 60 174 100 182C140 174 160 140 160 100C160 56 142 20 100 20Z" fill={`url(#cv${id})`} />
      {swirls.map((d, i) => (
        <Path key={i} d={d} stroke={alpha('#FFFFFF', 0.09)} fill="none" strokeWidth={1.3} />
      ))}
    </G>
  );
}
