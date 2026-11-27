import type { CaptureResult, QualityCheck, QualityReport, ScanView } from '@modules/headmap';
import type { ScanRecord } from '@/scan/session';

export const ALL_CHECKS: QualityCheck[] = ['faceFound', 'hairInFrame', 'centred', 'pose', 'distance', 'backlight', 'exposure', 'foreheadVisible', 'sharpness', 'hairlineFound'];

export function report(view: ScanView, failed: QualityCheck[] = [], extra: Partial<QualityReport> = {}): QualityReport {
  return {
    view,
    score: failed.length ? 75 : 100,
    allPassed: failed.length === 0,
    passed: ALL_CHECKS.filter((c) => !failed.includes(c)),
    failed,
    topIssue: failed[0],
    distance: 'ok',
    centring: 'ok',
    ...extra,
  };
}

export function capture(view: ScanView, score = 100, extra: Partial<QualityReport> = {}): CaptureResult {
  return { uri: `file:///tmp/${view}.heic`, view, report: report(view, [], { score, ...extra }) };
}

export function record(id: string, takenAt: string, extra: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id,
    takenAt,
    hairState: { dry: true, noProduct: true, sameLength: true },
    views: { front: { uri: `file:///scans/${id}/front.heic`, score: 95 } },
    quality: 95,
    lowConfidence: false,
    hairline: { centreMM: 68, leftTempleMM: 71, rightTempleMM: 73 },
    faceWidthPx: 400,
    ...extra,
  };
}
