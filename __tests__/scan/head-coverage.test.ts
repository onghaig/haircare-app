import {
  BACK_CELLS,
  CELL_COUNT,
  cellAt,
  cellCentre,
  coverage,
  coveragePaths,
  FACE_CELLS,
  nextMove,
  panoramaIntro,
  TOP_CELL,
} from '@/scan/headCoverage';
import { backCameraAxes, panoramaCameraAxes, panoramaSources, viewForDirection } from '@/scan/headModel';

const ALL = Array.from({ length: CELL_COUNT }, (_, c) => c);

describe('head regions', () => {
  it('splits the head into 25 regions, the same as the native panorama', () => {
    expect(CELL_COUNT).toBe(25);
    expect(cellAt(0, 10)).toBe(0);
    expect(cellAt(359, 10)).toBe(11);
    expect(cellAt(-1, 10)).toBe(11);
    expect(cellAt(185, 40)).toBe(18);
    expect(cellAt(90, 75)).toBe(TOP_CELL);
    for (const c of ALL) expect(cellAt(cellCentre(c).azimuth, cellCentre(c).elevation)).toBe(c);
  });

  it('gives the front half to the face sweep and the back half and top to the back camera', () => {
    expect(FACE_CELLS).toHaveLength(12);
    expect(BACK_CELLS).toHaveLength(13);
    expect(new Set([...FACE_CELLS, ...BACK_CELLS]).size).toBe(25);
    expect(BACK_CELLS).toContain(TOP_CELL);
    expect(FACE_CELLS).toContain(0);
    expect(BACK_CELLS).toContain(6);
  });

  it('counts what is covered and what is missing', () => {
    const c = coverage([0, 1, 2]);
    expect(c).toMatchObject({ filled: 3, total: 25, complete: false });
    expect(c.missing).toHaveLength(22);
    expect(coverage(ALL).complete).toBe(true);
    expect(coverage([...FACE_CELLS], FACE_CELLS).complete).toBe(true);
  });

  it('draws one region per area, for the picture from above', () => {
    const paths = coveragePaths(120);
    expect(paths.map((p) => p.cell).sort((a, b) => a - b)).toEqual(ALL);
    for (const p of paths) expect(p.d).toMatch(/^M[\d.]+ [\d.]+ A/);
  });
});

describe('spoken hints', () => {
  it('face sweep: turn toward the side still missing, then tilt down', () => {
    // Your left (positive azimuth) is missing: it shows when you turn toward your right shoulder.
    expect(nextMove('face', [9, 10, 11])).toMatch(/right shoulder/);
    expect(nextMove('face', [0, 1, 2])).toMatch(/left shoulder/);
    expect(nextMove('face', [0, 1, 2, 9, 10, 11])).toMatch(/tilt your head down/);
    expect(nextMove('face', [...FACE_CELLS])).toBeNull();
  });

  it('back of the head: round to the nearest gap, then higher, then over the top', () => {
    // The phone at the back (180): the gap at 225 is to your left.
    const low = [3, 4, 5, 6, 7, 8].filter((c) => c !== 7);
    expect(nextMove('back', low, { azimuth: 180 })).toMatch(/left side/);
    expect(nextMove('back', low, { azimuth: 225 })).toMatch(/Hold it there/);
    expect(nextMove('back', [3, 4, 5, 6, 7, 8], { azimuth: 180 })).toMatch(/higher/);
    expect(nextMove('back', BACK_CELLS.filter((c) => c !== TOP_CELL))).toMatch(/straight above/);
    expect(nextMove('back', [...BACK_CELLS])).toBeNull();
  });

  it('asks for a helper for the back, and says how to do it alone', () => {
    expect(panoramaIntro('face')).toMatch(/hair pulled back/);
    expect(panoramaIntro('back')).toMatch(/someone helps/);
    expect(panoramaIntro('back')).toMatch(/On your own/);
  });
});

describe('placing panorama frames on the head', () => {
  it('a back-camera frame from behind and above looks like the crown photo', () => {
    const p = panoramaCameraAxes(180, 45);
    const c = backCameraAxes('crown');
    for (let i = 0; i < 3; i++) {
      expect(p.toCamera[i]).toBeCloseTo(c.toCamera[i]);
      expect(p.m[0][i]).toBeCloseTo(c.m[0][i]);
      expect(p.m[1][i]).toBeCloseTo(c.m[1][i]);
    }
  });

  it('names the nearest scan view for each direction', () => {
    expect(viewForDirection(0, 17)).toBe('front');
    expect(viewForDirection(75, 17)).toBe('leftTemple');
    expect(viewForDirection(285, 17)).toBe('rightTemple');
    expect(viewForDirection(180, 52)).toBe('crown');
    expect(viewForDirection(0, 82)).toBe('top');
  });

  it('places back frames from their hair and skips frames it cannot place', () => {
    const cols = 12;
    const rows = 16;
    const values = Array.from({ length: cols * rows }, (_, i) => (Math.hypot((i % cols) + 0.5 - 6, Math.floor(i / cols) + 0.5 - 8) < 5 ? 1 : 0));
    const sources = panoramaSources(
      [
        { cell: 18, azimuth: 195, elevation: 50, mode: 'back', score: 90, hairGrid: { cols, rows, values }, frameSize: [720, 960] },
        { cell: 19, azimuth: 225, elevation: 50, mode: 'back', score: 90, frameSize: [720, 960] },
        { cell: 0, azimuth: 15, elevation: 17, mode: 'face', score: 20, frameSize: [720, 960] },
      ],
      50,
    );
    expect(sources.map((s) => s.key)).toEqual(['pano-18']);
    expect(sources[0].view).toBe('crown');
  });
});
