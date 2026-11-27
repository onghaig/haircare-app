import type { Profile } from '@/profile/types';
import { isPremium } from '@/paywall/purchases';
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

export type PreviewAvailability = 'unavailable' | 'locked' | 'needs-consent' | 'declined' | 'capped' | 'ready';

/** AI pictures each user can make per calendar month. Each one costs us about $0.05. */
export const MONTHLY_AI_CAP = 30;

export const monthKey = (now: Date) => now.toISOString().slice(0, 7);

/** Pictures made so far this month. */
export function usedThisMonth(profile: Profile, now = new Date()): number {
  const u = profile.aiPreview?.usage;
  return u && u.month === monthKey(now) ? u.count : 0;
}

/** The profile after one more picture this month. */
export function countUse(profile: Profile, now = new Date()): Profile {
  const month = monthKey(now);
  return { ...profile, aiPreview: { ...profile.aiPreview, usage: { month, count: usedThisMonth(profile, now) + 1 } } };
}

/**
 * When an AI picture can be made. Never for under-18s (no altered photos of minors), and only
 * with a service set up and a front photo. Only for paying users: everyone else sees the free
 * preview made on the phone, so no money goes on people who never subscribe. Then consent,
 * then the monthly cap.
 */
export function previewAvailability(profile: Profile, hasProvider: boolean, hasPhoto: boolean, now = new Date()): PreviewAvailability {
  if (!hasProvider || !hasPhoto || isMinor(profile) || profile.age == null) return 'unavailable';
  if (!isPremium(profile)) return 'locked';
  if (profile.aiPreview?.declinedAt && !profile.aiPreview?.consentAt) return 'declined';
  if (!profile.aiPreview?.consentAt) return 'needs-consent';
  if (usedThisMonth(profile, now) >= MONTHLY_AI_CAP) return 'capped';
  return 'ready';
}
