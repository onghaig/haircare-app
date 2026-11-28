import type { Amount, CurlPattern, Density, HairAnalysis } from '@/scan/hairAnalysis';

/** A hair reading with just the traits a test cares about. */
export function hairReading({
  curl = 'straight',
  dryness = 'low',
  frizz = 'low',
  density = 'normal',
  score = 70,
}: { curl?: CurlPattern; dryness?: Amount; frizz?: Amount; density?: Density; score?: number } = {}): HairAnalysis {
  const r = <T extends string>(value: T) => ({ value, score: 0.5, sure: 'fair' as const });
  return {
    version: 1,
    analyser: 'test',
    score: { value: score, low: score - 6, high: score + 6, label: 'Good', parts: [] },
    quality: { curl: r(curl), definition: null, frizz: r(frizz), shine: r<Amount>('some'), dryness: r(dryness), greys: r('none' as const) },
    density: r(density),
    caveats: [],
  };
}
