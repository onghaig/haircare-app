import { ownPhoto, projectCurve } from '@/look/ownPhoto';
import { band, restorePhoto, stagePhoto, stylePhoto } from '@/look/references';

import { record } from '../../test-utils/scanFixtures';

const curve: [number, number][] = [[0.3, 0.3], [0.4, 0.27], [0.5, 0.26], [0.6, 0.27], [0.7, 0.3]];

describe('your own photo instead of a drawing', () => {
  it('uses the latest front photo, with its trace only when the scan was good', () => {
    const good = record('a', '2026-11-01T00:00:00Z', { hairline: { curve } });
    const weak = record('b', '2026-11-02T00:00:00Z', { hairline: { curve }, lowConfidence: true });
    expect(ownPhoto([good])).toEqual({ scanId: 'a', uri: 'file:///scans/a/front.heic', curve, aspect: [3, 4] });
    expect(ownPhoto([good, weak])?.curve).toBeUndefined();
    expect(ownPhoto([])).toBeNull();
  });

  it('moves the hairline up for a later stage, temples first, and back down for a transplant', () => {
    const at3 = projectCurve(curve, 1, 3);
    expect(at3[0][1]).toBeLessThan(curve[0][1]);
    expect(curve[0][1] - at3[0][1]).toBeGreaterThan(curve[2][1] - at3[2][1]);
    const at6 = projectCurve(curve, 3, 6);
    expect(curve[2][1] - at6[2][1]).toBeGreaterThan(0.05);
    const restored = projectCurve(curve, 5, 2);
    expect(restored[2][1]).toBeGreaterThan(curve[2][1]);
    expect(projectCurve(curve, 3, 3)).toEqual(curve);
  });
});

describe('bundled example photos', () => {
  const photos = { 'stage-n4': 11, 'style-crop-n3': 12, 'restore-n5': 13 };
  it('are found by stage, style band and restore band, and absent until made', () => {
    expect(band(1.5)).toBe(1);
    expect(band(3.5)).toBe(3);
    expect(band(6)).toBe(5);
    expect(stagePhoto(4.2, photos)).toBe(11);
    expect(stylePhoto('crop', 4, photos)).toBe(12);
    expect(restorePhoto(6, photos)).toBe(13);
    expect(stylePhoto('crop', 1, photos)).toBeNull();
    expect(stagePhoto(4)).toBeNull();
  });
});
