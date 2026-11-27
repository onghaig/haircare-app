import { emptyProfile } from '@/profile/types';
import { countUse, MONTHLY_AI_CAP, previewAvailability, previewKey, previewPhoto, stageStep, usedThisMonth } from '@/visualize/preview';
import { HttpPreviewProvider, createPreviewProvider } from '@/visualize/provider';

import { record } from '../../test-utils/scanFixtures';

const free = { ...emptyProfile(), age: 30 };
const adult = { ...free, subscription: { plan: 'annual' as const, startedAt: '2026-11-26T10:00:00Z', trialEndsAt: null, test: true } };

describe('AI preview rules', () => {
  it('is never offered to under-18s, and needs a service and a front photo', () => {
    expect(previewAvailability({ ...adult, age: 16 }, true, true)).toBe('unavailable');
    expect(previewAvailability(adult, false, true)).toBe('unavailable');
    expect(previewAvailability(adult, true, false)).toBe('unavailable');
    expect(previewAvailability({ ...emptyProfile() }, true, true)).toBe('unavailable');
  });

  it('makes nothing for people who haven’t subscribed', () => {
    expect(previewAvailability({ ...free, aiPreview: { consentAt: 'x' } }, true, true)).toBe('locked');
  });

  it('stops at the monthly cap, and a new month starts again', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    let p: typeof adult = { ...adult, aiPreview: { consentAt: 'x' } };
    for (let i = 0; i < MONTHLY_AI_CAP; i++) p = countUse(p, now) as typeof adult;
    expect(usedThisMonth(p, now)).toBe(MONTHLY_AI_CAP);
    expect(previewAvailability(p, true, true, now)).toBe('capped');
    expect(previewAvailability(p, true, true, new Date('2026-12-01T00:00:00Z'))).toBe('ready');
    expect(p.aiPreview?.consentAt).toBe('x');
  });

  it('asks first, remembers a no, and runs once agreed', () => {
    expect(previewAvailability(adult, true, true)).toBe('needs-consent');
    expect(previewAvailability({ ...adult, aiPreview: { declinedAt: 'x' } }, true, true)).toBe('declined');
    expect(previewAvailability({ ...adult, aiPreview: { consentAt: 'x' } }, true, true)).toBe('ready');
  });

  it('caches per photo, half stage and year', () => {
    expect(stageStep(3.24)).toBe(3);
    expect(stageStep(3.3)).toBe(3.5);
    expect(stageStep(9)).toBe(7);
    expect(previewKey('abc', 3.3, 5)).toBe('abc-s3.5-y5');
    expect(previewKey('abc', 3.3, 5)).toBe(previewKey('abc', 3.4, 5));
    expect(previewKey('abc', 3.3, 5)).not.toBe(previewKey('abc', 3.3, 10));
  });

  it('uses the latest scan with a front photo', () => {
    const noFront = record('c', '2026-11-20T00:00:00Z', { views: { crown: { uri: 'file:///c.jpg', score: 90 } } });
    expect(previewPhoto([record('a', '2026-11-01T00:00:00Z'), record('b', '2026-11-08T00:00:00Z'), noFront])).toEqual({
      scanId: 'b',
      uri: 'file:///scans/b/front.heic',
    });
    expect(previewPhoto([])).toBeNull();
  });
});

describe('HTTP preview provider', () => {
  it('has no provider until a service URL is configured', () => {
    expect(createPreviewProvider(null)).toBeNull();
    expect(createPreviewProvider('https://x.workers.dev')).toBeInstanceOf(HttpPreviewProvider);
  });

  it('sends the photo, stage and years, and returns the image', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ image: 'SU1H', mimeType: 'image/png' }), { status: 200 }));
    const p = new HttpPreviewProvider('https://x.workers.dev', fetchImpl);
    await expect(p.generate({ imageBase64: 'UEhP', stage: 3.5, years: 5 })).resolves.toEqual({ imageBase64: 'SU1H', mimeType: 'image/png' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.workers.dev');
    expect(JSON.parse(init.body as string)).toEqual({ image: 'UEhP', stage: 3.5, years: 5 });
  });

  it('passes the service’s error message on', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ error: 'Too many previews right now.' }), { status: 429 }));
    const p = new HttpPreviewProvider('https://x.workers.dev', fetchImpl);
    await expect(p.generate({ imageBase64: 'UEhP', stage: 3, years: 1 })).rejects.toThrow('Too many previews right now.');
  });
});
