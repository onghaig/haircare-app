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
