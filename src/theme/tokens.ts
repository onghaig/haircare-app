/**
 * Design tokens. Dark, clinical-premium look with one accent colour (hairline green),
 * as set in the spec's UI decisions and the signed-off screen mockups.
 * Change values here, never inline in components.
 */
export const colors = {
  bg: '#07090A',
  surface: '#111615',
  surfaceRaised: '#171E1C',
  line: '#1F2826',
  text: '#EEF3F1',
  textMuted: '#93A19C',
  /** The one accent: hairline traces, primary actions, "on track". */
  accent: '#3CF0A0',
  accentDim: '#1D6B4B',
  onAccent: '#03140C',
  /** Only for "needs attention" states, such as a failed scan check. */
  warning: '#F2B35A',
  /** Markers on charts, for example treatment start dates. */
  info: '#6AA8FF',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 16, lg: 18, pill: 999 } as const;

/** Four type sizes plus the big-number style. Sizes scale with Dynamic Type. */
export const type = {
  display: { fontSize: 54, lineHeight: 56, fontWeight: '800', letterSpacing: -1.5 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypeVariant = keyof typeof type;

/** Minimum touch target, per Apple HIG. */
export const minTouchTarget = 44;

/**
 * Illustration palette for the drawn heads and the family tree. Not for UI chrome: skin and hair
 * tones are picked per person, these are the defaults and the fixed details.
 */
export const illustration = {
  skin: '#C79A7E',
  skinShade: '#3A2217',
  skinDeep: '#2A160E',
  hair: '#2B1E17',
  hairLight: '#6B5444',
  lips: '#7A3D33',
  eyeWhite: '#F4EDE6',
  iris: '#3A2A20',
  shirt: '#2D3A45',
  shirtShade: '#1D262E',
  crownHair: '#4A3528',
  crownHairDeep: '#22170F',
  photoBackdrop: '#26302D',
  greyHair: '#D9D4CF',
} as const;
