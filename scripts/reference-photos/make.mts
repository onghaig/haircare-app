/**
 * Makes the example photos the app shows when it has no AI image of the user's own photo.
 * One fictional man (made by the model, not a real person) is generated once, then edited with
 * the Worker's own prompts into every stage, hairstyle and transplant result, so all examples
 * show the same face.
 *
 *   GEMINI_API_KEY=... npm run reference-photos            # makes what's missing
 *   GEMINI_API_KEY=... npm run reference-photos -- --force # makes everything again
 *
 * Writes assets/reference/*.png and src/look/referencePhotos.generated.ts. About 45 images,
 * roughly $2 at current prices. Look through them before committing.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { editPrompt, restorePrompt, stylePrompt } from '../../server/visualize/src/prompt';
import { STYLE_IDS } from '../../server/visualize/src/styles';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'assets', 'reference');
const MAP = join(ROOT, 'src', 'look', 'referencePhotos.generated.ts');
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const KEY = process.env.GEMINI_API_KEY;
const FORCE = process.argv.includes('--force');

const BASE_PROMPT = [
  'A photorealistic head-and-shoulders photo of a fictional man of about 30, facing the camera straight on,',
  'eyes level, neutral expression, forehead and full hairline clearly visible, short-to-medium dark brown hair',
  'with a full adult hairline (Norwood 1), plain dark grey background, soft even front light, plain dark t-shirt.',
  'Like a careful phone selfie at arm’s length. Not a real or famous person. No text, no watermark.',
].join(' ');

async function gemini(parts: unknown[]): Promise<Buffer> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY! },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'] } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const out = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  const data = out.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) throw new Error('No image returned');
  return Buffer.from(data, 'base64');
}

const photoPart = (png: Buffer) => ({ inline_data: { mime_type: 'image/png', data: png.toString('base64') } });

async function make(key: string, run: () => Promise<Buffer>) {
  const file = join(OUT, `${key}.png`);
  if (existsSync(file) && !FORCE) return;
  process.stdout.write(`${key} … `);
  writeFileSync(file, await run());
  console.log('done');
}

async function main() {
  if (!KEY) throw new Error('Set GEMINI_API_KEY (a paid-tier key; see server/visualize/README.md).');
  mkdirSync(OUT, { recursive: true });
  await make('base', () => gemini([{ text: BASE_PROMPT }]));
  const base = readFileSync(join(OUT, 'base.png'));
  const edit = (text: string) => () => gemini([{ text }, photoPart(base)]);

  // Future you without a photo: the same man at each stage, a few years on.
  await make('stage-n1', async () => base);
  for (let s = 2; s <= 7; s++) await make(`stage-n${s}`, edit(editPrompt(s, Math.min(15, s * 2))));
  // Hairstyles and transplant results at three hairline bands, starting from that band's photo.
  for (const band of [1, 3, 5]) {
    const start = readFileSync(join(OUT, `stage-n${band}.png`));
    const from = (text: string) => () => gemini([{ text }, photoPart(start)]);
    for (const id of STYLE_IDS) await make(`style-${id}-n${band}`, from(stylePrompt(id, band)));
    if (band > 1) await make(`restore-n${band}`, from(restorePrompt(band)));
  }

  const keys = readdirSync(OUT)
    .filter((f) => f.endsWith('.png') && f !== 'base.png')
    .map((f) => f.replace(/\.png$/, ''))
    .sort();
  writeFileSync(
    MAP,
    [
      '// Written by scripts/reference-photos/make.mts. Do not edit by hand.',
      '// Keys: `stage-n<1..7>`, `style-<id>-n<1|3|5>`, `restore-n<3|5>`.',
      'export const REFERENCE_PHOTOS: Record<string, number> = {',
      ...keys.map((k) => `  '${k}': require('../../assets/reference/${k}.png'),`),
      '};',
      '',
    ].join('\n'),
  );
  console.log(`Wrote ${keys.length} photos and ${MAP}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
