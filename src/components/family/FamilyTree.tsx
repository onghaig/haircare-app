import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg';

import { MOST_PREDICTIVE } from '@/profile/onboarding';
import type { FamilyMember, HairStatus, Profile, Relative } from '@/profile/types';
import { colors, illustration as il } from '@/theme';

/** Tree layout in a 280 x 300 box: grandparents, parents (plus Mum's brother), then you and your brother. */
export const NODES: { member: FamilyMember | 'you'; x: number; y: number; label: string; sub?: string }[] = [
  { member: 'paternalGrandfather', x: 33, y: 46, label: 'Grandpa', sub: 'Dad’s side' },
  { member: 'paternalGrandmother', x: 99, y: 46, label: 'Grandma', sub: 'Dad’s side' },
  { member: 'maternalGrandfather', x: 165, y: 46, label: 'Grandpa', sub: 'Mum’s side' },
  { member: 'maternalGrandmother', x: 231, y: 46, label: 'Grandma', sub: 'Mum’s side' },
  { member: 'father', x: 66, y: 150, label: 'Dad' },
  { member: 'mother', x: 176, y: 150, label: 'Mum' },
  { member: 'maternalUncle', x: 244, y: 150, label: 'Uncle', sub: 'Mum’s brother' },
  { member: 'you', x: 99, y: 254, label: 'You' },
  { member: 'brother', x: 165, y: 254, label: 'Brother' },
];

export const MEMBER_NAME: Record<FamilyMember, string> = {
  paternalGrandfather: 'Grandpa, Dad’s side',
  paternalGrandmother: 'Grandma, Dad’s side',
  maternalGrandfather: 'Grandpa, Mum’s side',
  maternalGrandmother: 'Grandma, Mum’s side',
  father: 'Dad',
  mother: 'Mum',
  maternalUncle: 'Uncle, Mum’s brother',
  brother: 'Brother',
};

export const STATUS_LABEL: Record<HairStatus, string> = {
  full: 'Full',
  thinning: 'Thinning',
  receding: 'Receding',
  bald: 'Bald',
  unknown: 'Not sure',
};

const BADGE: Record<HairStatus, string> = { full: 'Full', thinning: 'Thin', receding: 'Rec', bald: 'Bald', unknown: '?' };

/** Couple bars, the drop from each couple to their children, and the sibling bars. */
const LINES = [
  'M57 46H75', // Dad's parents
  'M189 46H207', // Mum's parents
  'M66 46V126', // Dad's parents to Dad
  'M198 46V100H176V126M198 100H244V126', // Mum's parents to Mum and her brother
  'M90 150H152', // Dad and Mum
  'M121 150V214H99V230M121 214H165V230', // Parents to you and your brother
];
/** The path from the most predictive relatives down to you, drawn in green. */
const PREDICTIVE_LINES = ['M66 46V126', 'M198 46V100H176V126'];

const R = 24;
const BOX = { w: 280, h: 300 };

/**
 * The family tree: three tidy generations with explicit lines. A relative's photo fills their
 * circle. The father and maternal grandfather are ringed as "most predictive".
 */
export function FamilyTree({
  family,
  onSelect,
  width,
}: {
  family: Profile['family'];
  onSelect: (member: FamilyMember) => void;
  width: number;
}) {
  const s = width / BOX.w;
  const height = BOX.h * s;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 -6 ${BOX.w} ${BOX.h}`}>
        <Defs>
          {NODES.map((n) => (
            <ClipPath key={n.member} id={`clip-${n.member}`}>
              <Circle cx={n.x} cy={n.y} r={R} />
            </ClipPath>
          ))}
        </Defs>
        {LINES.map((d) => (
          <Path key={d} d={d} stroke={colors.textMuted} strokeOpacity={0.45} strokeWidth={1.6} fill="none" />
        ))}
        {PREDICTIVE_LINES.map((d) => (
          <Path key={`p${d}`} d={d} stroke={colors.accent} strokeWidth={2} fill="none" />
        ))}
        {NODES.map((n) => (
          <Node key={n.member} node={n} relative={n.member === 'you' ? undefined : family[n.member]} />
        ))}
      </Svg>
      {NODES.filter((n) => n.member !== 'you').map((n) => {
        const member = n.member as FamilyMember;
        const r = family[member];
        const state = r ? `${STATUS_LABEL[r.status]}${r.photoUri ? ', photo added' : ''}` : 'not answered';
        return (
          <Pressable
            key={member}
            testID={`relative-${member}`}
            accessibilityRole="button"
            accessibilityLabel={`${MEMBER_NAME[member]}, ${state}`}
            onPress={() => onSelect(member)}
            style={[styles.hit, { left: (n.x - R - 6) * s, top: (n.y + 6 - R - 6) * s, width: (2 * R + 12) * s, height: (2 * R + 34) * s }]}
          />
        );
      })}
    </View>
  );
}

function Node({ node, relative }: { node: (typeof NODES)[number]; relative?: Relative }) {
  const { x, y, member, label, sub } = node;
  const you = member === 'you';
  const highlighted = MOST_PREDICTIVE.includes(member as FamilyMember);
  const optional = member === 'brother' || member === 'maternalUncle';
  const status = relative?.status;
  return (
    <G>
      {relative?.photoUri ? (
        <G clipPath={`url(#clip-${member})`}>
          <Rect x={x - R} y={y - R} width={2 * R} height={2 * R} fill={il.photoBackdrop} />
          <SvgImage href={{ uri: relative.photoUri }} x={x - R} y={y - R} width={2 * R} height={2 * R} preserveAspectRatio="xMidYMid slice" />
        </G>
      ) : you ? (
        <>
          <Circle cx={x} cy={y} r={R} fill={colors.surfaceRaised} />
          <SvgText x={x} y={y + 4} textAnchor="middle" fill={colors.accent} fontSize={11} fontWeight="700">
            You
          </SvgText>
        </>
      ) : optional && !relative ? (
        <>
          <Circle cx={x} cy={y} r={R} fill="none" stroke={colors.textMuted} strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="4 4" />
          <Path d={`M${x - 7} ${y}h14M${x} ${y - 7}v14`} stroke={colors.textMuted} strokeWidth={2} />
        </>
      ) : (
        <>
          <Circle cx={x} cy={y} r={R} fill={colors.surfaceRaised} />
          {/* Camera glyph: "add a photo" */}
          <Path d={`M${x - 8} ${y - 2}h4l2-3h4l2 3h4v10h-16z`} fill="none" stroke={colors.textMuted} strokeWidth={1.4} />
          <Circle cx={x} cy={y + 3} r={2.6} fill="none" stroke={colors.textMuted} strokeWidth={1.4} />
        </>
      )}
      {!(optional && !relative) ? (
        <Circle
          cx={x}
          cy={y}
          r={R}
          fill="none"
          stroke={highlighted || you ? colors.accent : colors.line}
          strokeWidth={highlighted ? 2.4 : 1.4}
        />
      ) : null}
      {status ? (
        <G>
          <Rect
            x={x + 6}
            y={y - R - 4}
            width={BADGE[status].length * 6 + 12}
            height={16}
            rx={8}
            fill={status === 'unknown' ? colors.surfaceRaised : status === 'full' ? colors.text : colors.warning}
          />
          <SvgText
            x={x + 12 + BADGE[status].length * 3}
            y={y - R + 8}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight="700"
            fill={status === 'unknown' ? colors.textMuted : colors.bg}>
            {BADGE[status]}
          </SvgText>
        </G>
      ) : null}
      <SvgText x={x} y={y + R + 15} textAnchor="middle" fill={colors.text} fontSize={11} fontWeight="600">
        {label}
      </SvgText>
      {sub || (optional && !relative) ? (
        <SvgText x={x} y={y + R + 28} textAnchor="middle" fill={colors.textMuted} fontSize={9.5}>
          {optional && !relative ? 'Add' : sub}
        </SvgText>
      ) : null}
    </G>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute' },
});
