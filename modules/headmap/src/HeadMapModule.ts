import { requireOptionalNativeModule } from 'expo-modules-core';

import type { PermissionStatus, QualityReport, ScanView } from './HeadMap.types';

interface NativeHeadMap {
  meanInterPupilMM: number;
  requestCameraPermissionAsync(): Promise<PermissionStatus>;
  analyzeImageAsync(uri: string, view: ScanView, baselineFaceWidth: number | null): Promise<QualityReport>;
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
