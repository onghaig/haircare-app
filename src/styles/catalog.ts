import type { Profile } from '@/profile/types';

/**
 * Preset hairstyles for the try-on, each with how it plays with thinning. Ids match the preview
 * service's list (server/visualize/src/styles.ts), which holds the words the image model sees.
 */
export type StyleId = 'buzz' | 'shaved' | 'crew' | 'crop' | 'fringe' | 'caesar' | 'ivy' | 'sidepart' | 'quiff' | 'slick' | 'flow';

/** How the sketch draws it when there's no AI image. */
export type SketchShape = 'stubble' | 'bare' | 'short' | 'fringe' | 'part' | 'volume' | 'back' | 'long';

export interface HairStyle {
  id: StyleId;
  name: string;
  /** One plain line about the cut. */
  blurb: string;
  /** What to say at the barber. */
  barber: string;
  sketch: SketchShape;
  /** Brings hair forward over the hairline, so a receding front shows less. */
  coversFront: boolean;
  /** Pulls hair off the forehead or parts it, so temples and the hairline show more. */
  showsFront: boolean;
  /** Short enough that thin areas don't contrast with thick ones. */
  short: boolean;
  /** Needs density on top to hold its shape. */
  needsDensity: boolean;
}

export const STYLES: readonly HairStyle[] = [
  { id: 'buzz', name: 'Buzz cut', blurb: 'Even and short all over.', barber: 'Number 2 all over, squared at the neck.', sketch: 'stubble', coversFront: false, showsFront: false, short: true, needsDensity: false },
  { id: 'crop', name: 'French crop', blurb: 'Short sides, a blunt fringe forward.', barber: 'Skin or low fade on the sides, textured top, blunt fringe about 2 cm.', sketch: 'fringe', coversFront: true, showsFront: false, short: true, needsDensity: false },
  { id: 'fringe', name: 'Textured fringe', blurb: 'Messy top pushed onto the forehead.', barber: 'Mid fade, 5 to 7 cm on top, point-cut for texture, styled forward.', sketch: 'fringe', coversFront: true, showsFront: false, short: false, needsDensity: true },
  { id: 'caesar', name: 'Caesar', blurb: 'Short all over, straight fringe.', barber: 'Short taper, top about 2 cm combed forward, straight line across.', sketch: 'fringe', coversFront: true, showsFront: false, short: true, needsDensity: false },
  { id: 'crew', name: 'Crew cut', blurb: 'The classic. Tapered and neat.', barber: 'Number 2 taper on the sides, 2 to 3 cm on top, a little longer at the front.', sketch: 'short', coversFront: false, showsFront: false, short: true, needsDensity: false },
  { id: 'shaved', name: 'Shaved', blurb: 'Clean and bold.', barber: 'Clipper down, then shave. Keep it up every few days.', sketch: 'bare', coversFront: false, showsFront: false, short: true, needsDensity: false },
  { id: 'ivy', name: 'Ivy League', blurb: 'Crew cut, grown out, side part.', barber: 'Taper on the sides, 4 to 5 cm on top, soft side part.', sketch: 'part', coversFront: false, showsFront: true, short: false, needsDensity: false },
  { id: 'sidepart', name: 'Side part', blurb: 'Combed over with a clear part.', barber: 'Scissor taper, longer top, hard or soft part on your natural side.', sketch: 'part', coversFront: false, showsFront: true, short: false, needsDensity: true },
  { id: 'quiff', name: 'Quiff', blurb: 'Height at the front.', barber: 'Short sides, 7 to 10 cm at the front, blow-dried up and back.', sketch: 'volume', coversFront: false, showsFront: true, short: false, needsDensity: true },
  { id: 'slick', name: 'Slick back', blurb: 'Everything combed straight back.', barber: 'Undercut or taper, 10 cm or more on top, combed back with pomade.', sketch: 'back', coversFront: false, showsFront: true, short: false, needsDensity: true },
  { id: 'flow', name: 'Flow', blurb: 'Grown out to the chin.', barber: 'Grow it out, then a light trim to keep the ends clean.', sketch: 'long', coversFront: false, showsFront: true, short: false, needsDensity: true },
];

export type StyleVerdict = 'hides' | 'works' | 'shows';

export const VERDICT_LABEL: Record<StyleVerdict, string> = {
  hides: 'Hides thinning',
  works: 'Works for you',
  shows: 'Shows thinning',
};

export interface StyleFit {
  verdict: StyleVerdict;
  /** Why, in one short line. */
  why: string;
}

/**
 * How a style suits today's hair: the stage (from the scan, or the forecast) and where the user
 * said it's thinning. Hand-written rules, the kind a good barber would give.
 */
export function styleFit(style: HairStyle, stage: number, profile?: Pick<Profile, 'zones'>): StyleFit {
  const s = Math.min(7, Math.max(1, stage));
  const crown = s >= 4 || !!profile?.zones.includes('crown');
  const front = s >= 2 || !!profile?.zones.some((z) => z === 'temples' || z === 'hairline');

  if (style.sketch === 'bare') {
    return s >= 4 ? { verdict: 'hides', why: 'No contrast between thin and full areas at all.' } : { verdict: 'works', why: 'Bold at any stage, if you like the look.' };
  }
  if (style.short && !style.coversFront) {
    return s >= 3
      ? { verdict: 'hides', why: 'Short and even, so thin spots blend in.' }
      : { verdict: 'works', why: 'Clean and low effort at any stage.' };
  }
  if (style.coversFront) {
    if (s >= 5) return { verdict: 'shows', why: 'A fringe needs hair on top to pull forward.' };
    if (style.needsDensity && s >= 4) return { verdict: 'shows', why: 'Longer texture on top shows a thin crown.' };
    return front ? { verdict: 'hides', why: 'Brings hair forward over the temples.' } : { verdict: 'works', why: 'Easy to style and suits a full hairline.' };
  }
  // Styles that pull hair back, up or to the side.
  if (s >= 3 || (style.needsDensity && crown)) {
    return { verdict: 'shows', why: style.sketch === 'long' ? 'Longer hair spreads out and shows scalp.' : 'Pulls hair off the temples and shows the hairline.' };
  }
  if (front && style.showsFront) return { verdict: 'shows', why: 'Opens up the temples, so recession shows more.' };
  return { verdict: 'works', why: 'Your hairline can carry it.' };
}

const ORDER: Record<StyleVerdict, number> = { hides: 0, works: 1, shows: 2 };

/** Every style with its fit, best first, keeping the catalog order within a group. */
export function rankedStyles(stage: number, profile?: Pick<Profile, 'zones'>) {
  return STYLES.map((style, i) => ({ style, fit: styleFit(style, stage, profile), i }))
    .sort((a, b) => ORDER[a.fit.verdict] - ORDER[b.fit.verdict] || a.i - b.i)
    .map(({ style, fit }) => ({ style, fit }));
}

export function styleById(id: string): HairStyle | undefined {
  return STYLES.find((s) => s.id === id);
}

export const STYLE_AI_LABEL = 'AI try-on. Your hairline is kept as it is.';
export const STYLE_SKETCH_LABEL = 'Sketch at your stage';
