import type { Profile } from '@/profile/types';
import { isMinor } from '@/profile/onboarding';
import type { ScanRecord } from '@/scan/session';

export const AI_ILLUSTRATION_LABEL = 'AI illustration from your forecast. Estimate only.';

/** Stages are cached to the half step: finer changes in the forecast don't need a new image. */
export function stageStep(stage: number): number {
  return Math.min(7, Math.max(1, Math.round(stage * 2) / 2));
}

/** One image per photo, stage step and year, so a new scan or a changed forecast gets a new one. */
export function previewKey(scanId: string, stage: number, years: number): string {
  return aiKey(scanId, `s${stageStep(stage).toFixed(1)}-y${years}`);
}

/**
 * Every AI image is filed under the scan its photo came from (so deleting a scan deletes them),
 * then a name for what it shows.
 */
export function aiKey(scanId: string, name: string): string {
  return `${scanId}-${name}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** The photo the preview is made from: the latest scan's front view. */
export function previewPhoto(records: ScanRecord[]): { scanId: string; uri: string } | null {
  for (let i = records.length - 1; i >= 0; i--) {
    // Library photos never feed the preview: its consent covers your scan photo.
    if (records[i].source === 'upload') continue;
    const uri = records[i].views.front?.uri;
    if (uri) return { scanId: records[i].id, uri };
  }
  return null;
}

export type PreviewAvailability = 'unavailable' | 'needs-consent' | 'declined' | 'ready';

/**
 * Never for under-18s (no altered photos of minors), and only once a service is set up and
 * there's a front photo. Otherwise the drawn illustration stays.
 */
export function previewAvailability(profile: Profile, hasProvider: boolean, hasPhoto: boolean): PreviewAvailability {
  if (!hasProvider || !hasPhoto || isMinor(profile) || profile.age == null) return 'unavailable';
  if (profile.aiPreview?.consentAt) return 'ready';
  if (profile.aiPreview?.declinedAt) return 'declined';
  return 'needs-consent';
}
