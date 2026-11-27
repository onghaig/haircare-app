import { render, screen } from '@testing-library/react-native';

import { HeadGuide, highlightPoints } from '@/components/scan/HeadGuide';
import { SCAN_ORDER } from '@/scan/session';
import { curveToScreen, isUsableCurve, polylineLength, TEMPLATES, toPath, toScreen } from '@/scan/hairlineGuide';

const W = 390;
const H = 844;

describe('hairline templates', () => {
  it('has a line to highlight for every view of the scan', () => {
    for (const v of SCAN_ORDER) {
      expect(TEMPLATES[v].length).toBeGreaterThan(5);
      expect(polylineLength(TEMPLATES[v])).toBeGreaterThan(40);
    }
  });

  // Pinned: the preview is mirrored, so your left temple is on the left of the screen. This was
  // flipped twice before; checked on a phone, the left temple view's line belongs on screen-left.
  it('draws the left temple line on the left of the screen and the right temple line on the right', () => {
    const meanX = (pts: readonly (readonly [number, number])[]) => pts.reduce((s, p) => s + p[0], 0) / pts.length;
    expect(meanX(TEMPLATES.leftTemple)).toBeLessThan(100);
    expect(meanX(TEMPLATES.rightTemple)).toBeGreaterThan(100);
    expect(meanX(TEMPLATES.leftTemple) + meanX(TEMPLATES.rightTemple)).toBeCloseTo(200);
    // On screen too, through the guide frame.
    const left = highlightPoints('leftTemple', undefined, W, H).points;
    const right = highlightPoints('rightTemple', undefined, W, H).points;
    expect(meanX(left)).toBeLessThan(W / 2);
    expect(meanX(right)).toBeGreaterThan(W / 2);
  });

  it('switches the temple views to the detected temple hairline, like the front view', () => {
    const curve = [[0.2, 0.3], [0.25, 0.26], [0.32, 0.24]] as [number, number][];
    const hl = highlightPoints('leftTemple', { foreheadVisible: true, interPupilPx: 90, curve }, W, H);
    expect(hl.detected).toBe(true);
    expect(hl.points[0]).toEqual([0.2 * W, 0.3 * H]);
  });

  it('maps template and native points to the screen', () => {
    expect(toScreen([[0, 0], [200, 240]], { x: 10, y: 20, scale: 2 })).toEqual([[10, 20], [410, 500]]);
    expect(curveToScreen([[0.5, 0.25], [NaN, 0.3], [1, 1]], W, H)).toEqual([[195, 211], [390, 844]]);
    expect(toPath([[1, 2], [3, 4]])).toBe('M1.0 2.0 L3.0 4.0');
  });

  it('only trusts a detected curve with enough points and length', () => {
    expect(isUsableCurve([])).toBe(false);
    expect(isUsableCurve([[0, 0], [100, 0]])).toBe(false);
    expect(isUsableCurve([[0, 0], [50, 0], [100, 0]])).toBe(true);
    expect(isUsableCurve([[0, 0], [1, 0], [2, 0]])).toBe(false);
  });
});

describe('the green hairline highlight', () => {
  const found = { foreheadVisible: true, interPupilPx: 120, curve: [[0.3, 0.3], [0.5, 0.27], [0.7, 0.3]] as [number, number][] };

  it('follows the real hairline once found, and the template until then', () => {
    expect(highlightPoints('front', undefined, W, H).detected).toBe(false);
    const hit = highlightPoints('front', found, W, H);
    expect(hit.detected).toBe(true);
    expect(hit.points[1]).toEqual([195, 0.27 * H]);
    // The crown has no face tracking, so it always shows its whorl.
    expect(highlightPoints('crown', found, W, H).detected).toBe(false);
  });

  it('draws for every view, and marks the crown target in the top-down view', async () => {
    for (const v of SCAN_ORDER) {
      await render(<HeadGuide view={v} aligned={false} width={W} height={H} />);
      expect(screen.getByTestId('hairline-template')).toBeOnTheScreen();
      if (v === 'top') expect(screen.getByTestId('crown-target')).toBeOnTheScreen();
      else expect(screen.queryByTestId('crown-target')).toBeNull();
    }
    await render(<HeadGuide view="front" aligned width={W} height={H} hairline={found} />);
    expect(screen.getByTestId('hairline-detected')).toBeOnTheScreen();
  });
});
