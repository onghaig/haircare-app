/**
 * The edit prompt is built here on the server from two numbers, so the app (and anyone calling
 * the endpoint) can't send arbitrary prompts. The image model only ever restyles hair.
 */
export const NORWOOD: Record<number, string> = {
  1: 'a full, adult hairline with no visible recession',
  2: 'a slightly mature hairline: the temples have moved back a little, evenly on both sides',
  3: 'clear recession at both temples, forming a gentle M shape, with the front centre still present',
  4: 'deep temple recession and visible thinning on the crown, with a band of hair still across the top',
  5: 'deep temple recession and a larger thin crown, with only a narrow, thinning band of hair between them',
  6: 'the top of the head mostly bare from the front to the crown, with hair remaining on the sides and back',
  7: 'only a horseshoe of hair around the sides and back of the head',
};

/** Rounds to the nearest stage the description table covers. */
export function stageKey(stage: number): number {
  return Math.min(7, Math.max(1, Math.round(stage)));
}

import { STYLE_PROMPTS } from './styles';

export function editPrompt(stage: number, years: number): string {
  const hair = NORWOOD[stageKey(stage)];
  const older = years <= 1 ? 'about a year older' : `about ${years} years older`;
  return [
    'Edit this photo of a real person. Keep it the same person: same face, identity, skin tone,',
    'expression, pose, lighting, background and clothing.',
    `Change the hair only, so it shows ${hair} (Norwood stage ${stageKey(stage)}),`,
    `and make the person look ${older}, subtly and naturally.`,
    "Keep their own hair colour and texture. Photorealistic, no text, no watermark, no added accessories.",
  ].join(' ');
}

const SAME_PERSON =
  'Edit this photo of a real person. Keep it the same person: same face, identity, skin tone, age, expression, pose, lighting, background and clothing.';
const CLEAN = 'Photorealistic, no text, no watermark, no added accessories.';

/**
 * A hairstyle on the user's own photo. Honest by design: the hairline and density stay as they
 * are, so a style never "fixes" thinning in the picture that it wouldn't fix in a mirror.
 */
export function stylePrompt(style: string, stage?: number): string {
  const look = STYLE_PROMPTS[style];
  if (!look) throw new Error(`Unknown style ${style}`);
  const now = stage == null ? '' : ` (about Norwood stage ${stageKey(stage)})`;
  return [
    SAME_PERSON,
    `Change only the haircut to ${look}.`,
    `Keep their current hairline position and hair density exactly as they are${now}:`,
    'do not add hair where the scalp shows and do not move the hairline forward.',
    'Keep their own hair colour and texture.',
    CLEAN,
  ].join(' ');
}

/**
 * A hair transplant result, kept realistic: a mature hairline, and less coverage the further the
 * loss has gone, because donor hair is limited.
 */
export function restorePrompt(stage: number): string {
  const s = stageKey(stage);
  const coverage =
    s <= 3
      ? 'natural density across the front and temples'
      : s <= 5
        ? 'good density at the front, and moderate, slightly thinner coverage further back on top'
        : 'a restored front hairline with moderate density, and the crown still noticeably thin';
  return [
    SAME_PERSON,
    'Change the hair only, to show a realistic result about a year after a successful hair transplant:',
    'a natural, mature adult hairline (not a teenage one), with softly rounded temples and an irregular, natural edge,',
    `and ${coverage}.`,
    'Keep their own hair colour and texture, and a similar haircut.',
    CLEAN,
  ].join(' ');
}
