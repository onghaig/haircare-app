import Constants from 'expo-constants';

/**
 * Where "Find a clinic" goes. The referral partner isn't chosen yet, so this is a placeholder:
 * set app.json > expo.extra.clinicReferralUrl to the partner's https link when there is one.
 * Until then the button says clinic search is coming soon.
 */
export function clinicReferralUrl(extra: unknown = Constants.expoConfig?.extra): string | null {
  const v = (extra as { clinicReferralUrl?: unknown } | undefined)?.clinicReferralUrl;
  return typeof v === 'string' && /^https:\/\//.test(v) ? v : null;
}

/**
 * The link we open: only the stage band and that it came from the app. Never the photo, age
 * or anything else from the profile.
 */
export function referralLink(base: string, stage: number): string {
  const band = stage < 3 ? 'early' : stage < 5 ? 'moderate' : 'advanced';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}source=haircare&loss=${band}`;
}

export const TRANSPLANT_LABEL = 'Illustration of a possible result, not a promise';

/** The drawn "after": a mature hairline, less full the further loss has gone, as donor hair allows. */
export function restoredStage(stage: number): number {
  return stage < 3 ? 1.5 : stage < 5 ? 2 : 3;
}
