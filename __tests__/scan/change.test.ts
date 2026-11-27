import { classifyHairlineChange, MIN_DETECTABLE_CHANGE_MM, usableForTrends } from '@/scan/change';

describe('classifyHairlineChange', () => {
  it('treats changes under the measurement noise as holding steady', () => {
    expect(classifyHairlineChange('centre', 68, 70.9)).toBe('holding');
    expect(classifyHairlineChange('centre', 68, 65.1)).toBe('holding');
    expect(classifyHairlineChange('leftTemple', 71, 75.5)).toBe('holding');
  });

  it('calls a real move up a loss and a move down a gain', () => {
    expect(classifyHairlineChange('centre', 68, 72)).toBe('lost');
    expect(classifyHairlineChange('centre', 68, 64)).toBe('gained');
    expect(classifyHairlineChange('rightTemple', 70, 76)).toBe('lost');
  });

  it('is stricter on the temples than the centre (they measure noisier)', () => {
    expect(MIN_DETECTABLE_CHANGE_MM.leftTemple).toBeGreaterThan(MIN_DETECTABLE_CHANGE_MM.centre);
    expect(classifyHairlineChange('centre', 60, 64)).toBe('lost');
    expect(classifyHairlineChange('leftTemple', 60, 64)).toBe('holding');
  });
});

describe('usableForTrends', () => {
  it('keeps scans of 60 or more', () => {
    expect(usableForTrends(59)).toBe(false);
    expect(usableForTrends(60)).toBe(true);
    expect(usableForTrends(100)).toBe(true);
  });
});
