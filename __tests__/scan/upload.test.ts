import { timelineScans, trendScans } from '@/progress/verdict';
import { baselineOf, daysUntilNextScan, latestOf } from '@/scan/store';
import { buildUploadRecord, exifCaptureDate, monthDate, uploadProblem } from '@/scan/upload';
import { previewPhoto } from '@/visualize/preview';

import { record, report } from '../../test-utils/scanFixtures';

const NOW = new Date('2026-11-27T12:00:00Z');
const hairline = { foreheadVisible: true, interPupilPx: 120, centreMM: 70, leftTempleMM: 74, rightTempleMM: 75, templeRecessionIPD: 0.2, curve: [[0.3, 0.3], [0.7, 0.3]] as [number, number][] };

describe('exifCaptureDate', () => {
  it('reads DateTimeOriginal with its offset', () => {
    expect(exifCaptureDate({ DateTimeOriginal: '2021:03:12 14:05:33', OffsetTimeOriginal: '+01:00' }, NOW)?.toISOString()).toBe('2021-03-12T13:05:33.000Z');
  });

  it('reads it as local time without an offset, and from the nested iOS dictionary', () => {
    const d = exifCaptureDate({ '{Exif}': { DateTimeOriginal: '2019:07:04 09:00:00' } }, NOW)!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2019, 6, 4, 9]);
  });

  it('falls back to the digitised and file dates', () => {
    expect(exifCaptureDate({ DateTime: '2020:01:02 03:04:05' }, NOW)?.getFullYear()).toBe(2020);
  });

  it('returns null for no data, a blank camera clock, or a future date', () => {
    expect(exifCaptureDate(null, NOW)).toBeNull();
    expect(exifCaptureDate({}, NOW)).toBeNull();
    expect(exifCaptureDate({ DateTimeOriginal: '0000:00:00 00:00:00' }, NOW)).toBeNull();
    expect(exifCaptureDate({ DateTimeOriginal: '1970:01:01 00:00:00' }, NOW)).toBeNull();
    expect(exifCaptureDate({ DateTimeOriginal: '2030:01:01 00:00:00' }, NOW)).toBeNull();
  });

  it('picks the middle of a chosen month', () => {
    expect(monthDate(2022, 4).getDate()).toBe(15);
  });
});

describe('uploadProblem', () => {
  it('accepts a measurable front photo even when centring and distance fail', () => {
    expect(uploadProblem(report('front', ['centred', 'distance'], { score: 100, hairline }), 'front')).toBeNull();
  });

  it('refuses a photo with no face, a turned head, or a hidden hairline', () => {
    expect(uploadProblem(report('front', ['faceFound'], { score: 0 }), 'front')).toMatch(/couldn’t find a face/);
    expect(uploadProblem(report('front', ['pose'], { score: 75, poseError: 30, hairline }), 'front')).toMatch(/turned too far/);
    expect(uploadProblem(report('front', ['foreheadVisible'], { score: 80, hairline }), 'front')).toMatch(/hairline/);
    expect(uploadProblem(report('front', [], { hairline: undefined }), 'front')).toMatch(/hairline/);
  });

  it('says plainly when a photo is too blurry or dark', () => {
    expect(uploadProblem(report('front', ['sharpness', 'exposure'], { score: 55, hairline }), 'front')).toBe('This photo is too blurry to measure.');
    expect(uploadProblem(report('front', ['exposure', 'backlight'], { score: 55, hairline }), 'front')).toBe('This photo is too dark or too bright to measure.');
  });

  it('needs hair in the frame for top and crown photos', () => {
    const grid = { cols: 2, rows: 1, values: [0.8, 0.7] };
    expect(uploadProblem(report('crown', ['hairInFrame'], { score: 40, hairGrid: grid }), 'crown')).toMatch(/crown/);
    expect(uploadProblem(report('top', [], { hairGrid: undefined }), 'top')).toMatch(/top of your head/);
    expect(uploadProblem(report('top', [], { hairGrid: grid }), 'top')).toBeNull();
  });
});

describe('uploaded photos on the timeline', () => {
  const upload = buildUploadRecord(report('front', ['pose'], { score: 75, hairline, frameSize: [900, 1200] }), {
    id: 'old',
    uri: 'file:///cache/pick.jpg',
    view: 'front',
    takenAt: new Date('2020-05-01T10:00:00Z'),
    dateFrom: 'photo',
  });
  const scans = [record('a', '2026-10-01T10:00:00Z'), record('b', '2026-11-20T10:00:00Z')];

  it('builds a one-view record at the photo’s date with its hairline numbers', () => {
    expect(upload).toMatchObject({ source: 'upload', takenAt: '2020-05-01T10:00:00.000Z', quality: 75, lowConfidence: false, hairline: { centreMM: 70 } });
    expect(Object.keys(upload.views)).toEqual(['front']);
    expect(upload.hairState).toBeUndefined();
  });

  it('never becomes the baseline or the latest scan, and doesn’t reset the weekly scan', () => {
    const all = [upload, ...scans];
    expect(baselineOf(all)?.id).toBe('a');
    expect(latestOf(all)?.id).toBe('b');
    expect(latestOf([...scans, { ...upload, takenAt: '2026-11-26T10:00:00Z' }])?.id).toBe('b');
    expect(daysUntilNextScan([...scans, { ...upload, takenAt: '2026-11-26T10:00:00Z' }], NOW)).toBe(0);
    expect(previewPhoto([...scans, { ...upload, takenAt: '2026-11-26T10:00:00Z' }])?.scanId).toBe('b');
  });

  it('shows on the chart timeline but not in the verdict', () => {
    const all = [upload, ...scans];
    expect(timelineScans(all).map((r) => r.id)).toEqual(['old', 'a', 'b']);
    expect(trendScans(all).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
