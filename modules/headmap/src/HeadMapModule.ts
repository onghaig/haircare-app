import { requireOptionalNativeModule } from 'expo-modules-core';

import type { PermissionStatus, QualityReport, ScanView } from './HeadMap.types';

interface NativeHeadMap {
  meanInterPupilMM: number;
  requestCameraPermissionAsync(): Promise<PermissionStatus>;
  analyzeImageAsync(uri: string, view: ScanView, baselineFaceWidth: number | null): Promise<QualityReport>;
  prepareVoiceAudioAsync?(): Promise<void>;
  shrinkImageSync?(uri: string, width: number): string;
}

/** Null on web, in Jest and in Expo Go: the scan needs a development build. */
export const NativeHeadMapModule = requireOptionalNativeModule<NativeHeadMap>('HeadMap');

export const isHeadMapAvailable = NativeHeadMapModule != null;

export const MEAN_INTER_PUPIL_MM = NativeHeadMapModule?.meanInterPupilMM ?? 63;

function native(): NativeHeadMap {
  if (!NativeHeadMapModule) {
    throw new Error('The HeadMap scan module is not available. Run the app in a development build (npx expo run:ios).');
  }
  return NativeHeadMapModule;
}

export function requestCameraPermissionAsync(): Promise<PermissionStatus> {
  return native().requestCameraPermissionAsync();
}

/** Measure a saved photo (family photo, past photo of yourself) with the same checks as a live scan. */
export function analyzeImageAsync(uri: string, view: ScanView = 'front', baselineFaceWidth?: number): Promise<QualityReport> {
  return native().analyzeImageAsync(uri, view, baselineFaceWidth ?? null);
}

/**
 * Lets voice coaching play with the silent switch on and over music (ducking it). A no-op where
 * the native module is missing (Expo Go, Jest, web).
 */
export async function prepareVoiceAudioAsync(): Promise<void> {
  try {
    await NativeHeadMapModule?.prepareVoiceAudioAsync?.();
  } catch {
    // Speech still works with the default session; it just follows the silent switch.
  }
}

/**
 * Shrinks a photo to `width` pixels wide and returns the new file's URI, or null where the
 * native module (or this function) is missing, so callers can fall back.
 */
export function shrinkImageSync(uri: string, width: number): string | null {
  return NativeHeadMapModule?.shrinkImageSync?.(uri, width) ?? null;
}
