import { Rng } from '@/forecast/rng';

describe('Rng', () => {
  it('is reproducible for the same seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const xa = Array.from({ length: 5 }, () => a.uniform());
    expect(Array.from({ length: 5 }, () => b.uniform())).toEqual(xa);
    expect(Array.from({ length: 5 }, () => c.uniform())).not.toEqual(xa);
  });

  it('draws uniforms in [0, 1) with mean about 0.5', () => {
    const r = new Rng(1);
    let s = 0;
    for (let i = 0; i < 100_000; i++) {
      const u = r.uniform();
      expect(u >= 0 && u < 1).toBe(true);
      s += u;
    }
    expect(s / 100_000).toBeCloseTo(0.5, 2);
  });

  it('draws standard normals (mean 0, sd 1, about 68% within 1 sd)', () => {
    const x = new Rng(7).normals(200_000);
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / x.length);
    const within = x.filter((v) => Math.abs(v) < 1).length / x.length;
    expect(mean).toBeCloseTo(0, 2);
    expect(sd).toBeCloseTo(1, 2);
    expect(within).toBeCloseTo(0.6827, 2);
  });
});
