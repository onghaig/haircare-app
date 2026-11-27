import { analyzeImageAsync, isHeadMapAvailable, type QualityReport } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';
import type { ScanRecord } from './session';

/**
 * Photos from the library, measured on the phone with the same engine as a scan. They have no
 * live checks, so the checks run once on the photo and anything that can't be measured is
 * refused with a plain reason. Saved photos join the timeline at the date they were taken, but
 * never become the baseline and never count toward the verdict: their angle, light and distance
 * aren't controlled.
 */
export type UploadView = 'front' | 'top' | 'crown';

export const UPLOAD_VIEWS: readonly { value: UploadView; label: string; hint: string }[] = [
  { value: 'front', label: 'Hairline', hint: 'Facing the camera' },
  { value: 'top', label: 'Top of head', hint: 'From above' },
  { value: 'crown', label: 'Crown', hint: 'From behind' },
];

/** A face turned more than this from the camera can't be measured, even with lower confidence. */
export const MAX_UPLOAD_POSE_DEG = 20;
/** Photos before this year are almost certainly a wrong date. */
const MIN_YEAR = 1990;

export function isUpload(r: Pick<ScanRecord, 'source'>): boolean {
  return r.source === 'upload';
}

/** EXIF dates look like "2021:03:12 14:05:33"; the offset tag, when there is one, like "+01:00". */
function parseExifDate(value: unknown, offset: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim())) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${offset.trim()}`;
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  // No offset: the camera's clock, read as local time.
  const t = new Date(y, mo - 1, d, h, mi, s || 0);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * When the photo was taken, from its EXIF data, or null if it has none (screenshots, photos sent
 * through messaging apps) or the date is clearly wrong.
 */
export function exifCaptureDate(exif: Record<string, unknown> | null | undefined, now: Date): Date | null {
  if (!exif) return null;
  // iOS can nest the EXIF tags under "{Exif}"; Android and expo-image-picker flatten them.
  const nested = exif['{Exif}'];
  const tags: Record<string, unknown> = nested && typeof nested === 'object' ? { ...(nested as object), ...exif } : exif;
  const candidates: [string, string][] = [
    ['DateTimeOriginal', 'OffsetTimeOriginal'],
    ['DateTimeDigitized', 'OffsetTimeDigitized'],
    ['DateTime', 'OffsetTime'],
  ];
  for (const [tag, off] of candidates) {
    const d = parseExifDate(tags[tag], tags[off]);
    if (!d) continue;
    if (d.getFullYear() < MIN_YEAR || d.getTime() > now.getTime() + 86_400_000) continue;
    return d;
  }
  return null;
}

/** The middle of a chosen month, at noon, for photos without a date. */
export function monthDate(year: number, month: number): Date {
  return new Date(year, month, 15, 12, 0, 0);
}

/**
 * Why this photo can't be used, in plain words, or null when it can. Centring and distance are
 * left out: they only matter for lining up a live scan with the outline.
 */
export function uploadProblem(report: QualityReport, view: UploadView): string | null {
  const failed = new Set(report.failed);
  if (view === 'front') {
    if (failed.has('faceFound')) return 'We couldn’t find a face. Pick a photo where you face the camera.';
    if ((report.poseError ?? 0) > MAX_UPLOAD_POSE_DEG) return 'Your head is turned too far. Pick a photo where you face the camera.';
    const hl = report.hairline;
    const measured = hl && (hl.centreMM != null || hl.templeRecessionIPD != null);
    if (failed.has('foreheadVisible') || failed.has('hairlineFound') || !measured) {
      return 'We couldn’t see your hairline. Pick a photo with your hair off your forehead.';
    }
  } else if (failed.has('hairInFrame') || !report.hairGrid) {
    return view === 'top'
      ? 'Not enough hair in this photo. Pick a closer photo of the top of your head.'
      : 'Not enough hair in this photo. Pick a closer photo of your crown.';
  }
  if (report.score < MIN_TREND_QUALITY) {
    const worst = report.failed.find((c) => c === 'sharpness' || c === 'exposure' || c === 'backlight' || c === 'pose');
    switch (worst) {
      case 'sharpness':
        return 'This photo is too blurry to measure.';
      case 'exposure':
        return 'This photo is too dark or too bright to measure.';
      case 'backlight':
        return 'There’s too much light behind you to measure.';
      case 'pose':
        return 'Your head is at too much of an angle to measure.';
      default:
        return 'This photo isn’t clear enough to measure.';
    }
  }
  return null;
}

export type UploadAnalysis = { ok: true; report: QualityReport } | { ok: false; reason: string };

/** Runs the scan engine on a library photo, on the phone. */
export async function analyseUpload(uri: string, view: UploadView): Promise<UploadAnalysis> {
  if (!isHeadMapAvailable) return { ok: false, reason: 'Photo analysis needs the full app. It isn’t available here.' };
  let report: QualityReport;
  try {
    report = await analyzeImageAsync(uri, view);
  } catch {
    return { ok: false, reason: 'We couldn’t open this photo. Try another one.' };
  }
  const problem = uploadProblem(report, view);
  return problem ? { ok: false, reason: problem } : { ok: true, report };
}

/** A one-view record for a photo that passed `uploadProblem`. */
export function buildUploadRecord(
  report: QualityReport,
  opts: { id: string; uri: string; view: UploadView; takenAt: Date; dateFrom: 'photo' | 'you' },
): ScanRecord {
  const r = report;
  const hl = opts.view === 'front' ? r.hairline : undefined;
  return {
    id: opts.id,
    takenAt: opts.takenAt.toISOString(),
    source: 'upload',
    dateFrom: opts.dateFrom,
    views: {
      [opts.view]: {
        uri: opts.uri,
        score: r.score,
        ...(r.hairGrid ? { hairGrid: r.hairGrid } : {}),
        ...(r.anchors ? { anchors: r.anchors } : {}),
        ...(r.frameSize ? { frameSize: r.frameSize } : {}),
      },
    },
    quality: r.score,
    lowConfidence: r.score < MIN_TREND_QUALITY,
    hairline: hl
      ? {
          centreMM: hl.centreMM,
          leftTempleMM: hl.leftTempleMM,
          rightTempleMM: hl.rightTempleMM,
          templeRecessionIPD: hl.templeRecessionIPD,
          curve: hl.curve,
        }
      : null,
  };
}
