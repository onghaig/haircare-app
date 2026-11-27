import { useEffect, useRef, useState } from 'react';

import { useProfile } from '@/profile/ProfileProvider';
import { useScans } from '@/scan/ScanProvider';

import { useAiPreviewServices } from './AiPreviewProvider';
import { aiKey, previewAvailability, previewPhoto, stageStep, type PreviewAvailability } from './preview';
import type { PreviewRequest } from './provider';

export type AiPreviewState =
  | { status: 'off'; availability: PreviewAvailability }
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  | { status: 'error'; message: string; retry(): void };

type Without<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** One AI image: a cache name (unique per kind and inputs) and what to ask the service for. */
export interface AiJob {
  name: string;
  request: Without<PreviewRequest, 'imageBase64'>;
}

/**
 * One AI image of the user's own latest front photo, made once and cached on the phone. Pass
 * null to ask for nothing (a screen that isn't showing it yet). Only what's on screen is made.
 */
export function useAiImage(job: AiJob | null): AiPreviewState {
  const { profile } = useProfile();
  const { records } = useScans();
  const { provider, store, prepare } = useAiPreviewServices();
  const photo = previewPhoto(records);
  const availability = previewAvailability(profile, !!provider, !!photo);
  const key = photo && job ? aiKey(photo.scanId, job.name) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; uri?: string; error?: string } | null>(null);
  const inFlight = useRef(new Set<string>());
  // Compared by value, so a new but equal job object each render doesn't re-run anything.
  const requestJson = job ? JSON.stringify(job.request) : null;

  const photoUri = photo?.uri ?? null;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (availability !== 'ready' || !key || !photoUri || !provider || !requestJson) return;
    const req = JSON.parse(requestJson) as AiJob['request'];
    // One request per image and attempt, however often this re-renders. A result for a key
    // that's no longer on screen is kept but not shown (it's matched by key below).
    const tag = `${key}#${attempt}`;
    if (inFlight.current.has(tag)) return;
    inFlight.current.add(tag);
    (async () => {
      const cached = store.get(key);
      if (cached) return cached;
      const imageBase64 = await prepare(photoUri);
      const out = await provider.generate({ ...req, imageBase64 } as PreviewRequest);
      return store.put(key, out.imageBase64, out.mimeType);
    })()
      .then((uri) => mounted.current && setResult({ key, uri }))
      .catch((e: unknown) => mounted.current && setResult({ key, error: e instanceof Error ? e.message : String(e) }));
  }, [availability, key, photoUri, provider, store, prepare, requestJson, attempt]);

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

/** The "future you" job for a stage and year. Shared by Future you and Two futures, so they share the cache. */
export function futureJob(stage: number, years: number): AiJob {
  const step = stageStep(stage);
  return { name: `s${step.toFixed(1)}-y${years}`, request: { stage: step, years } };
}

/** The user's own photo at the forecast's stage for that year. */
export function useAiPreview(stage: number, years: number): AiPreviewState {
  return useAiImage(futureJob(stage, years));
}

/** An AI image already saved on the phone for this job, without making one. */
export function useSavedAiImage(name: string): string | null {
  const { profile } = useProfile();
  const { records } = useScans();
  const { provider, store } = useAiPreviewServices();
  const photo = previewPhoto(records);
  if (!photo || previewAvailability(profile, !!provider, true) !== 'ready') return null;
  return store.get(aiKey(photo.scanId, name));
}
