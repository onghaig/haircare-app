import { goalCopy } from '@/reveal/goal';
import { confidenceHint, confidenceWhy, retakeSeconds, scanBasis, stageSource } from '@/reveal/trust';

import { record } from '../../test-utils/scanFixtures';

describe('trust', () => {
  const good = record('g', '2026-11-01T09:00:00Z');
  const weak = record('w', '2026-11-01T09:00:00Z', { lowConfidence: true, views: { front: { uri: 'f', score: 30 } } });

  it('says where the stage comes from, and what would firm it up', () => {
    expect(scanBasis(undefined)).toBe('none');
    expect(scanBasis(weak)).toBe('weak');
    expect(stageSource(good)).toBe('From your scan and your answers');
    expect(stageSource(weak)).toBe('Estimate from your answers');
    expect(confidenceHint(good)).toBeNull();
    expect(confidenceHint(undefined)?.text).toBe('Your first scan will confirm or correct this.');
    expect(confidenceHint(weak)?.retake).toEqual(['front', 'leftTemple', 'rightTemple', 'top', 'crown']);
    expect(confidenceWhy('low', 'none')).toMatch(/answers only/);
    expect(retakeSeconds(1)).toBe(20);
    expect(retakeSeconds(3)).toBe(60);
  });
});

describe('goal copy', () => {
  it('changes the paywall and reveal for each goal, and keeps the default without one', () => {
    expect(goalCopy(undefined, false).headline).toBeNull();
    expect(goalCopy('regrow', false).headline).toBe('See what’s working');
    expect(goalCopy('keep', true).sentence).toBeNull();
    expect(goalCopy('shave', false).benefits).toHaveLength(4);
  });
});
