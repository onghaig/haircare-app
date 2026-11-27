import { Circle, Ellipse, G, Path } from 'react-native-svg';

import { alpha, colors } from '@/theme';

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

const SKULL = 'M100 26C62 26 46 60 46 104C46 146 62 184 100 194C138 184 154 146 154 104C154 60 138 26 100 26Z';

/**
 * A clean line diagram of a head from the front, in a 200 x 236 box: outline, ears, hair area
 * and hairline only. No eyes, nose or mouth: the app never shows a drawn face.
 */
export function HeadOutline({ recede = 0, top = 0, trace, shoulders }: { recede?: number; top?: number; trace?: boolean; shoulders?: boolean }) {
  const g = hairlineGeometry(recede, top);
  const { hy, ty, tx, mid, knee } = g;
  const hairShape =
    `M42 ${ty + 6} C36 50 62 14 100 13 C138 14 164 50 158 ${ty + 6} L154 ${ty} ` +
    `C${148 - tx} ${ty - 14} ${140 - tx} ${knee} ${126 - tx / 2} ${mid} C116 ${hy + 2} 108 ${hy} 100 ${hy} ` +
    `C92 ${hy} 84 ${hy + 2} ${74 + tx / 2} ${mid} C${60 + tx} ${knee} ${52 + tx} ${ty - 14} 46 ${ty}Z`;
  const line = { stroke: colors.textMuted, strokeWidth: 1.6, fill: 'none' } as const;
  return (
    <G>
      {shoulders ? <Path d="M20 240 C26 214 52 206 80 202 M120 202 C148 206 174 214 180 240" {...line} /> : null}
      <Path d="M80 186 L78 204 M120 186 L122 204" {...line} />
      <Ellipse cx={43} cy={118} rx={8} ry={16} {...line} />
      <Ellipse cx={157} cy={118} rx={8} ry={16} {...line} />
      <Path d={SKULL} fill={colors.surfaceRaised} stroke={colors.textMuted} strokeWidth={1.6} />
      {top > 0.9 ? null : <Path d={hairShape} fill={alpha(colors.textMuted, 0.18)} stroke={colors.textMuted} strokeWidth={1.2} />}
      {trace && top <= 0.9 ? (
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

/** The back-and-top view, as the same kind of line diagram, for the top and crown zones. */
export function CrownOutline() {
  const line = { stroke: colors.textMuted, strokeWidth: 1.6, fill: 'none' } as const;
  return (
    <G>
      <Ellipse cx={38} cy={112} rx={8} ry={15} {...line} />
      <Ellipse cx={162} cy={112} rx={8} ry={15} {...line} />
      <Path d="M82 178 L80 204 M118 178 L120 204" {...line} />
      <Path d="M100 20C58 20 40 56 40 100C40 140 60 174 100 182C140 174 160 140 160 100C160 56 142 20 100 20Z" fill={alpha(colors.textMuted, 0.18)} stroke={colors.textMuted} strokeWidth={1.6} />
      <Path d="M100 96 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0" {...line} />
    </G>
  );
}
