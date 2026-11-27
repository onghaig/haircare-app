/**
 * @jest-environment node
 */
import { DEFAULT_MODEL, handle, MAX_IMAGE_BASE64, type Env } from '../../server/visualize/src/handler';
import { editPrompt, restorePrompt, stageKey, stylePrompt } from '../../server/visualize/src/prompt';

const env: Env = { GEMINI_API_KEY: 'test-key' };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://visualize.test/', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const ok = { image: 'UEhPVE8=', stage: 4, years: 5 };
const gemini = (parts: unknown[]) => jest.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 }));

describe('visualize worker', () => {
  it('builds the prompt itself and keeps the key server-side', async () => {
    const f = gemini([{ inlineData: { mimeType: 'image/png', data: 'T1VU' } }]);
    const res = await handle(post(ok), env, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: 'T1VU', mimeType: 'image/png' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/models/${DEFAULT_MODEL}:generateContent`);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const sent = JSON.parse(init.body as string);
    expect(sent.contents[0].parts[0].text).toBe(editPrompt(4, 5));
    expect(sent.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/jpeg', data: 'UEhPVE8=' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects anything but a small photo and sane numbers', async () => {
    const f = gemini([]);
    expect((await handle(new Request('https://visualize.test/'), env, f)).status).toBe(405);
    expect((await handle(post({ ...ok, image: 'not base64!' }), env, f)).status).toBe(400);
    expect((await handle(post({ ...ok, image: 'A'.repeat(MAX_IMAGE_BASE64 + 1) }), env, f)).status).toBe(400);
    expect((await handle(post({ ...ok, stage: 9 }), env, f)).status).toBe(400);
    expect((await handle(post({ ...ok, years: 40 }), env, f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('ignores a prompt sent by the caller', async () => {
    const f = gemini([{ inlineData: { mimeType: 'image/png', data: 'T1VU' } }]);
    await handle(post({ ...ok, prompt: 'draw something else' }), env, f);
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.contents[0].parts[0].text).toBe(editPrompt(4, 5));
  });

  it('says so when the model returns no image', async () => {
    expect((await handle(post(ok), env, gemini([{ text: 'no' }]))).status).toBe(502);
  });

  it('says it isn’t set up without a key', async () => {
    expect((await handle(post(ok), { GEMINI_API_KEY: '' })).status).toBe(503);
  });

  it('rate-limits per caller IP, ignoring client-sent ids', async () => {
    const limiter = { limit: jest.fn(async () => ({ success: false })) };
    const res = await handle(post(ok, { 'x-device-id': 'd1', 'cf-connecting-ip': '203.0.113.7' }), { ...env, LIMITER: limiter }, gemini([]));
    expect(res.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('reports upstream failures by status only, never echoing the body', async () => {
    const f = jest.fn(async () => new Response('secret echo of the request', { status: 500 }));
    const res = await handle(post(ok), env, f);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret');
  });

  it('describes every Norwood stage and only ever changes hair', () => {
    for (let s = 1; s <= 7; s++) expect(editPrompt(s, 3)).toMatch(new RegExp(`Norwood stage ${s}`));
    expect(stageKey(3.5)).toBe(4);
    expect(editPrompt(2, 1)).toMatch(/Change the hair only/);
    expect(editPrompt(2, 1)).toMatch(/about a year older/);
  });

  const sentText = (f: jest.Mock) => JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).contents[0].parts[0].text as string;

  it('tries on a hairstyle from the list, keeping the hairline as it is', async () => {
    const f = gemini([{ inlineData: { mimeType: 'image/png', data: 'T1VU' } }]);
    const res = await handle(post({ image: 'UEhPVE8=', kind: 'style', style: 'crop', stage: 3 }), env, f);
    expect(res.status).toBe(200);
    expect(sentText(f)).toBe(stylePrompt('crop', 3));
    expect(sentText(f)).toMatch(/French crop/);
    expect(sentText(f)).toMatch(/do not add hair where the scalp shows/);
  });

  it('refuses a style that isn’t on the list, even an inherited key', async () => {
    const f = gemini([]);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'style', style: 'mohawk of my choosing' }), env, f)).status).toBe(400);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'style', style: 'toString' }), env, f)).status).toBe(400);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'style', style: 'buzz', stage: 12 }), env, f)).status).toBe(400);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'paint' }), env, f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('makes a transplant preview scaled to the stage', async () => {
    const f = gemini([{ inlineData: { mimeType: 'image/png', data: 'T1VU' } }]);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'restore', stage: 6 }), env, f)).status).toBe(200);
    expect(sentText(f)).toBe(restorePrompt(6));
    expect(restorePrompt(6)).toMatch(/crown still noticeably thin/);
    expect(restorePrompt(2)).toMatch(/mature adult hairline/);
    expect((await handle(post({ image: 'UEhPVE8=', kind: 'restore' }), env, f)).status).toBe(400);
  });

  it('caps each caller per day, counting only pictures that came back', async () => {
    const kv = new Map<string, string>();
    const USAGE = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) };
    const e = { ...env, USAGE, DAILY_CAP: '2' };
    const ip = { 'cf-connecting-ip': '203.0.113.9' };
    const ok1 = gemini([{ inlineData: { mimeType: 'image/png', data: 'T1VU' } }]);
    expect((await handle(post(ok, ip), e, gemini([{ text: 'no' }]))).status).toBe(502);
    expect((await handle(post(ok, ip), e, ok1)).status).toBe(200);
    expect((await handle(post(ok, ip), e, ok1)).status).toBe(200);
    const res = await handle(post(ok, ip), e, ok1);
    expect(res.status).toBe(429);
    expect(ok1).toHaveBeenCalledTimes(2);
    expect((await handle(post(ok, { 'cf-connecting-ip': '198.51.100.1' }), e, ok1)).status).toBe(200);
  });
});
