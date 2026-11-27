import {
  backCameraAxes,
  fitBackCamera,
  fitFaceCamera,
  hairMap,
  mapSources,
  mapXY,
  project,
  renderScalp,
  scalpPoint,
  zoneAt,
  encodeBmp,
  type MapSource,
  type Rgb,
} from '@/scan/headModel';

import { photograph, synthCamera, texture } from '../../test-utils/synthHead';

const W = 240;
const H = 427;

/** Five photos of the synthetic head, taken the way the scan takes them. */
function shoot(baldAbove = Infinity) {
  return {
    front: photograph(synthCamera(0, 0, 1.6, W, H, { centre: [0, 10, 0] }), baldAbove),
    leftTemple: photograph(synthCamera(-45, 0, 1.6, W, H, { centre: [0, 10, 0] }), baldAbove),
    rightTemple: photograph(synthCamera(45, 0, 1.6, W, H, { centre: [0, 10, 0] }), baldAbove),
    top: photograph(synthCamera(0, 60, 1.2, W, H, { centre: [0, 80, -80] }), baldAbove),
    crown: photograph(synthCamera(180, 45, 1.2, W, H, { centre: [0, 80, -120], mirror: false }), baldAbove),
  };
}

function views(shots: ReturnType<typeof shoot>) {
  return Object.fromEntries(
    Object.entries(shots).map(([v, s]) => [
      v,
      { score: 90, hairGrid: s.grid, frameSize: s.frameSize, anchors: v === 'top' || v === 'crown' ? undefined : s.anchors },
    ]),
  );
}

describe('head model', () => {
  it('lays the scalp out from above: forehead at the top, your left on the left, crown at the back', () => {
    const top = scalpPoint(0, 0)!;
    expect(top.p[1]).toBeGreaterThan(100);
    expect(scalpPoint(0, -0.9)!.p[2]).toBeGreaterThan(0); // front
    expect(scalpPoint(-0.9, 0)!.p[0]).toBeGreaterThan(0); // your left
    expect(scalpPoint(0, 0.9)!.p[2]).toBeLessThan(-150); // back
    expect(scalpPoint(0.8, 0.8)).toBeNull();
    expect(zoneAt(...polar(0, -0.9))).toBe('front');
    expect(zoneAt(...polar(-0.9, -0.2))).toBe('leftTemple');
    expect(zoneAt(...polar(0.9, -0.2))).toBe('rightTemple');
    expect(zoneAt(...polar(0, 0.7))).toBe('crown');
    expect(zoneAt(...polar(0.05, 0.05))).toBe('top');
    const [x, y] = mapXY(45, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeLessThan(0);
  });

  it('recovers a face photo’s camera from its landmarks, mirrored or not', () => {
    const cam = synthCamera(-45, 5, 1.6, W, H);
    const shot = photograph(cam);
    const fit = fitFaceCamera(shot.anchors, W, H)!;
    const p = scalpPoint(0.3, -0.6)!.p;
    const want = project(cam, p);
    const got = project(fit, p);
    expect(Math.hypot(want[0] - got[0], want[1] - got[1])).toBeLessThan(0.5);
    expect(fit.toCamera[0]).toBeLessThan(-0.5); // camera off to your right
    expect(fitFaceCamera({ 468: [0.4, 0.5], 473: [0.6, 0.5] }, W, H)).toBeNull();
  });

  it('places top and crown cameras from where the hair sits in the photo', () => {
    expect(backCameraAxes('crown').toCamera[2]).toBeLessThan(0);
    expect(backCameraAxes('top').toCamera[2]).toBeGreaterThan(0);
    const cam = synthCamera(180, 45, 1.2, W, H, { centre: [0, 80, -120], mirror: false });
    const shot = photograph(cam);
    const fit = fitBackCamera('crown', shot.grid, W, H)!;
    const p = scalpPoint(0, 0.5)!.p;
    const want = project(cam, p);
    const got = project(fit, p);
    // Placed from the hair alone, so allow a few percent of the photo.
    expect(Math.abs(want[0] - got[0])).toBeLessThan(0.05 * W);
    expect(Math.abs(want[1] - got[1])).toBeLessThan(0.08 * H);
    expect(fitBackCamera('crown', { cols: 12, rows: 16, values: Array(192).fill(0) }, W, H)).toBeNull();
  });

  it('stitches five photos into one map that matches the head, with no seams out of line', () => {
    const shots = shoot();
    const sources = mapSources(views(shots));
    expect(sources.map((s) => s.view).sort()).toEqual(['crown', 'front', 'leftTemple', 'rightTemple', 'top']);
    const photos = Object.fromEntries(Object.entries(shots).map(([v, s]) => [v, s.photo])) as Record<string, Rgb>;
    const size = 96;
    const map = renderScalp(sources, photos, size);
    // Compare each mapped pixel with the true pattern at that point on the head.
    const errs: Record<string, number[]> = { face: [], back: [] };
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const s = scalpPoint(((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
        if (!s || s.theta > (95 * Math.PI) / 180) continue;
        const truth = texture(s.p);
        const o = (j * size + i) * 3;
        const e = Math.abs(map.data[o] - truth[0]) + Math.abs(map.data[o + 1] - truth[1]) + Math.abs(map.data[o + 2] - truth[2]);
        (Math.abs(s.phi) < Math.PI / 2 ? errs.face : errs.back).push(e / 3);
      }
    }
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    expect(median(errs.face)).toBeLessThan(10);
    expect(median(errs.back)).toBeLessThan(25);
  });

  it('maps hair coverage per zone and sees a bald crown', () => {
    const full = hairMap(mapSources(views(shoot())));
    const bald = hairMap(mapSources(views(shoot(60))));
    expect(full.zones.top!).toBeGreaterThan(0.7);
    expect(bald.zones.top!).toBeLessThan(full.zones.top! - 0.3);
    expect(full.hair.some((h) => h === -1)).toBe(true);
  });

  it('skips photos it cannot place', () => {
    const none: MapSource[] = mapSources({ front: { score: 90, frameSize: [W, H] }, crown: { score: 90 } });
    expect(none).toEqual([]);
    expect(hairMap(none).zones.front).toBeNull();
  });

  it('writes a BMP', () => {
    const bmp = encodeBmp({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 0, 0, 255]) });
    expect([bmp[0], bmp[1]]).toEqual([0x42, 0x4d]);
    expect(bmp.length).toBe(54 + 8);
    expect([bmp[54], bmp[55], bmp[56]]).toEqual([0, 0, 255]);
  });
});

function polar(mx: number, my: number): [number, number] {
  const s = scalpPoint(mx, my)!;
  return [s.theta, s.phi];
}
