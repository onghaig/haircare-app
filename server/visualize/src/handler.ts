import { editPrompt } from './prompt';

/**
 * POST { image: base64 JPEG, stage: 1..7, years: 1..15 } -> { image: base64, mimeType }.
 *
 * Privacy: the photo is held in memory only for this one request. Nothing is written to storage
 * and request bodies are never logged. The key stays in the Worker's secrets, never in the app.
 */
export interface Env {
  GEMINI_API_KEY: string;
  /** Optional override, e.g. a newer image model id. */
  GEMINI_IMAGE_MODEL?: string;
  /** Workers rate limiting binding (per device), optional. */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export const DEFAULT_MODEL = 'gemini-3.1-flash-image';
/** About 1.5 MB of JPEG; the app sends a 768 px photo, well under this. */
export const MAX_IMAGE_BASE64 = 2_000_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function handle(request: Request, env: Env, fetchImpl: Fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Use POST' });
  if (!env.GEMINI_API_KEY) return json(503, { error: 'The preview service is not set up yet' });

  if (env.LIMITER) {
    const key = request.headers.get('x-device-id') ?? request.headers.get('cf-connecting-ip') ?? 'anon';
    const { success } = await env.LIMITER.limit({ key });
    if (!success) return json(429, { error: 'Too many previews right now. Try again in a minute.' });
  }

  let body: { image?: unknown; stage?: unknown; years?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Send JSON' });
  }
  const { image, stage, years } = body;
  if (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return json(400, { error: 'Send one JPEG photo, base64-encoded, under 1.5 MB' });
  }
  if (typeof stage !== 'number' || !(stage >= 1 && stage <= 7)) return json(400, { error: 'stage must be 1 to 7' });
  if (typeof years !== 'number' || !(years >= 1 && years <= 15)) return json(400, { error: 'years must be 1 to 15' });

  const model = env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
  const upstream = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: editPrompt(stage, years) }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!upstream.ok) {
    // Status only: the upstream body can echo the request.
    return json(502, { error: `The image model failed (${upstream.status})` });
  }
  const out = (await upstream.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] } }[];
  };
  for (const part of out.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) return json(200, { image: data, mimeType: part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png' });
  }
  return json(502, { error: 'The image model returned no image' });
}
