import type { QualityCheck, QualityReport } from '@modules/headmap';
import { promptFor, statusChips } from '@/scan/guidance';

const ALL: QualityCheck[] = ['faceFound', 'hairInFrame', 'centred', 'pose', 'distance', 'backlight', 'exposure', 'foreheadVisible', 'sharpness', 'hairlineFound'];

function report(failed: QualityCheck[], extra: Partial<QualityReport> = {}): QualityReport {
  return {
    view: 'front',
    score: 100,
    allPassed: failed.length === 0,
    passed: ALL.filter((c) => !failed.includes(c)),
    failed,
    topIssue: failed[0],
    distance: 'ok',
    centring: 'ok',
    ...extra,
  };
}

describe('promptFor', () => {
  it('says hold still when everything is green', () => {
    expect(promptFor(report([]))).toMatchObject({ title: 'Hold still', tone: 'ready' });
  });

  it('gives a fix for every check', () => {
    for (const c of ALL) {
      const p = promptFor(report([c]));
      expect(p.tone).toBe('fix');
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.voice.length).toBeGreaterThan(3);
    }
  });

  it('only talks about the most important issue', () => {
    expect(promptFor(report(['pose', 'foreheadVisible'])).title).toBe('Look straight at the phone, chin level');
  });

  it('asks for the spec’s "push your hair back" when a fringe covers the forehead', () => {
    expect(promptFor(report(['foreheadVisible']))).toMatchObject({
      title: 'Push your hair back a little',
      detail: 'Your forehead needs to be visible',
    });
  });

  it('names the target pose for each view', () => {
    // MediaPipe yaw is negative when the nose turns to your right, so the left temple (yaw -45)
    // shows when you turn toward your right shoulder.
    expect(promptFor(report(['pose'], { view: 'leftTemple' })).title).toMatch(/toward your right shoulder/);
    expect(promptFor(report(['pose'], { view: 'rightTemple' })).title).toMatch(/toward your left shoulder/);
    expect(promptFor(report(['pose'], { view: 'top' })).title).toMatch(/Tilt your head down/);
  });

  it('shows how far off the pose is', () => {
    expect(promptFor(report(['pose'], { pose: { yaw: 9, pitch: 0, roll: 0 }, poseError: 9.4 })).detail).toBe('9 degrees off');
  });

  it('points the user in the right direction for distance and centring', () => {
    expect(promptFor(report(['distance'], { distance: 'moveCloser' })).title).toBe('Move a little closer');
    expect(promptFor(report(['distance'], { distance: 'moveBack' })).title).toBe('Back a little');
    expect(promptFor(report(['centred'], { centring: 'moveLeft' })).title).toBe('Move your head left a little');
  });

  it('tells dark and bright frames apart', () => {
    expect(promptFor(report(['exposure'], { stats: { sharpness: 100, faceBrightness: 30, backlit: false } })).title).toBe('Find more light');
    expect(promptFor(report(['exposure'], { stats: { sharpness: 100, faceBrightness: 230, backlit: false } })).title).toBe('Too bright');
  });

  it('uses voice guidance for the crown, where the user cannot see the screen', () => {
    const p = promptFor(report(['faceFound'], { view: 'crown' }));
    expect(p.voice).toMatch(/higher/);
  });
});

describe('statusChips', () => {
  it('shows five chips on the front view, four on the temples, and hair checks for top and crown', () => {
    expect(statusChips(report([])).map((c) => c.label)).toEqual(['Head level', 'Distance', 'Light', 'Still', 'Forehead']);
    expect(statusChips(report([], { view: 'leftTemple' }))).toHaveLength(4);
    expect(statusChips(report(['hairInFrame'], { view: 'top' }))).toEqual([
      { label: 'Hair in frame', ok: false },
      { label: 'Light', ok: true },
      { label: 'Still', ok: true },
    ]);
  });

  it('asks top and crown views for hair, not a face', () => {
    expect(promptFor(report(['hairInFrame'], { view: 'top' })).title).toBe('Tilt your head down');
    expect(promptFor(report(['hairInFrame'], { view: 'crown' })).title).toBe('Point the camera at your crown');
  });

  it('marks only the failing chip', () => {
    const chips = statusChips(report(['foreheadVisible']));
    expect(chips.filter((c) => !c.ok).map((c) => c.label)).toEqual(['Forehead']);
  });

  it('groups backlight and exposure under Light', () => {
    expect(statusChips(report(['backlight'])).find((c) => c.label === 'Light')?.ok).toBe(false);
  });
});
