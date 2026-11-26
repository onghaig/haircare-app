import { colors, contrastRatio, luminance, minTouchTarget, type } from '@/theme';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio(colors.text, colors.bg)).toBeCloseTo(contrastRatio(colors.bg, colors.text), 10);
  });

  it('rejects malformed colours', () => {
    expect(() => luminance('#abc')).toThrow();
    expect(() => luminance('green')).toThrow();
  });
});

describe('palette accessibility (WCAG AA)', () => {
  const surfaces = [colors.bg, colors.surface, colors.surfaceRaised];

  it.each(surfaces)('body text is at least 4.5:1 on %s', (s) => {
    expect(contrastRatio(colors.text, s)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('muted text is at least 4.5:1 on %s', (s) => {
    expect(contrastRatio(colors.textMuted, s)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('the accent is at least 3:1 on %s (large text and graphics)', (s) => {
    expect(contrastRatio(colors.accent, s)).toBeGreaterThanOrEqual(3);
  });

  it('text on the accent button is at least 4.5:1', () => {
    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('warning and info read on the background', () => {
    expect(contrastRatio(colors.warning, colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.info, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('type and touch targets', () => {
  it('never goes below 13 pt', () => {
    for (const v of Object.values(type)) expect(v.fontSize).toBeGreaterThanOrEqual(13);
  });

  it('keeps the HIG minimum touch target', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });
});
