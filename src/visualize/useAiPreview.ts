import { useEffect, useRef, useState } from 'react';

import { useProfile } from '@/profile/ProfileProvider';
import { useScans } from '@/scan/ScanProvider';

import { useAiPreviewServices } from './AiPreviewProvider';
import { previewAvailability, previewKey, previewPhoto, stageStep, type PreviewAvailability } from './preview';

export type AiPreviewState =
  | { status: 'off'; availability: PreviewAvailability }
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  | { status: 'error'; message: string; retry(): void };

/**
 * The user's own photo at the forecast's stage for that year, made once and cached on the phone.
 * Only the year on screen is generated.
 */
export function useAiPreview(stage: number, years: number): AiPreviewState {
  const { profile } = useProfile();
  const { records } = useScans();
  const { provider, store, prepare } = useAiPreviewServices();
  const photo = previewPhoto(records);
  const availability = previewAvailability(profile, !!provider, !!photo);
  const key = photo ? previewKey(photo.scanId, stage, years) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; uri?: string; error?: string } | null>(null);
  const inFlight = useRef(new Set<string>());

  const photoUri = photo?.uri ?? null;
  const step = stageStep(stage);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (availability !== 'ready' || !key || !photoUri || !provider) return;
    // One request per image and attempt, however often this re-renders. A result for a key
    // that's no longer on screen is kept but not shown (it's matched by key below).
    const tag = `${key}#${attempt}`;
    if (inFlight.current.has(tag)) return;
    inFlight.current.add(tag);
    (async () => {
      const cached = store.get(key);
      if (cached) return cached;
      const imageBase64 = await prepare(photoUri);
      const out = await provider.generate({ imageBase64, stage: step, years });
      return store.put(key, out.imageBase64, out.mimeType);
    })()
      .then((uri) => mounted.current && setResult({ key, uri }))
      .catch((e: unknown) => mounted.current && setResult({ key, error: e instanceof Error ? e.message : String(e) }));
  }, [availability, key, photoUri, provider, store, prepare, step, years, attempt]);

  if (availability !== 'ready' || !key) return { status: 'off', availability };
  const cached = result?.key === key ? result : null;
  if (cached?.uri) return { status: 'ready', uri: cached.uri };
  if (cached?.error) {
    return {
      status: 'error',
      message: cached.error,
      retry: () => {
        setResult(null);
        setAttempt((a) => a + 1);
      },
    };
  }
  return { status: 'loading' };
}
