import {
  curlFrom,
  densityLevel,
  measureView,
  ruleAnalyser,
  setHairAnalyser,
  showThrough,
  hairAnalyser,
  summarise,
  type HairAnalyser,
  type ViewMetrics,
  type ViewPhoto,
} from '@/scan/hairAnalysis';

import { synthFace, synthHair, type SynthHairOptions } from '../../test-utils/synthHair';

const BOX = { x0: 0.1, x1: 0.9, y0: 0.25, y1: 0.95 };

function top(o: SynthHairOptions = {}, view: 'top' | 'crown' = 'top'): ViewPhoto {
  const { rgb, grid } = synthHair({ box: BOX, ...o });
  return { view, rgb, grid, score: 90 };
}

function front(): ViewPhoto {
  const f = synthFace();
  return { view: 'front', rgb: f.rgb, grid: f.grid, anchors: f.anchors, score: 90 };
}

const dryClean = { dry: true, noProduct: true, sameLength: true };

describe('hair quality rules on drawn hair', () => {
  it('tells straight, wavy and curly strands apart', () => {
    const read = (pattern: SynthHairOptions['pattern']) => ruleAnalyser.analyse([top({ pattern })], dryClean).quality.curl.value;
    expect(read('straight')).toBe('straight');
    expect(read('wavy')).toBe('wavy');
    expect(read('curly')).toBe('curly');
    // Tight coils are grouped with curls: a phone photo can't tell them apart reliably.
    expect(['curly', 'wavy']).toContain(read('coily'));
  });

  it('rates curlier hair higher on the curl score', () => {
    const score = (pattern: SynthHairOptions['pattern']) => {
      const m = measureView(top({ pattern }));
      return curlFrom(m.localCoherence, m.cellCoherence).score;
    };
    expect(score('straight')).toBeLessThan(score('wavy'));
    expect(score('wavy')).toBeLessThan(score('curly'));
  });

  it('only gives curl definition for wavy or curlier hair', () => {
    expect(ruleAnalyser.analyse([top({ pattern: 'straight' })], dryClean).quality.definition).toBeNull();
    expect(ruleAnalyser.analyse([top({ pattern: 'curly' })], dryClean).quality.definition?.value).toBeTruthy();
  });

  it('sees frizz as loose strands at the edge of the hair', () => {
    const clean = ruleAnalyser.analyse([top()], dryClean).quality.frizz;
    const frizzy = ruleAnalyser.analyse([top({ flyaways: 300 })], dryClean).quality.frizz;
    expect(clean.value).toBe('low');
    expect(frizzy.value).not.toBe('low');
    expect(frizzy.value != null && clean.value != null && frizzy.score > clean.score).toBe(true);
  });

  it('can’t judge frizz when the hair and background are the same colour', () => {
    const q = ruleAnalyser.analyse([top({ flyaways: 300, background: [55, 38, 28] })], dryClean).quality;
    expect(q.frizz.value).toBeNull();
    expect(q.dryness.value).toBeNull();
  });

  it('sees shine as a bright band', () => {
    const dull = ruleAnalyser.analyse([top()], dryClean).quality.shine;
    const shiny = ruleAnalyser.analyse([top({ shine: 120 })], dryClean).quality.shine;
    expect(dull.value).toBe('low');
    expect(shiny.value).not.toBe('low');
  });

  it('counts grey strands, and doesn’t mistake shine for greys', () => {
    expect(ruleAnalyser.analyse([top()], dryClean).quality.greys.value).toBe('none');
    expect(['none', 'few']).toContain(ruleAnalyser.analyse([top({ shine: 120 })], dryClean).quality.greys.value);
    expect(['some', 'lots']).toContain(ruleAnalyser.analyse([top({ grey: 0.15 })], dryClean).quality.greys.value);
  });

  it('says light hair is hard to read for greys', () => {
    const g = ruleAnalyser.analyse([top({ hair: [200, 160, 90] })], dryClean).quality.greys;
    expect(g.value).toBeNull();
  });

  it('rates frizzy dull hair drier than smooth shiny hair', () => {
    const smooth = ruleAnalyser.analyse([top({ shine: 120 })], dryClean).quality.dryness;
    const dry = ruleAnalyser.analyse([top({ flyaways: 300 })], dryClean).quality.dryness;
    expect(smooth.value != null && dry.value != null && dry.score > smooth.score).toBe(true);
  });

  it('says why when too little hair is in the photos', () => {
    const q = ruleAnalyser.analyse([top({ box: { x0: 0.45, x1: 0.55, y0: 0.45, y1: 0.55 } })], dryClean).quality;
    expect(q.curl.value).toBeNull();
    expect(q.shine.value).toBeNull();
  });

  it('notes wet hair and product', () => {
    const a = ruleAnalyser.analyse([top()], { dry: false, noProduct: false, sameLength: true });
    expect(a.caveats).toHaveLength(2);
    expect(ruleAnalyser.analyse([top()], dryClean).caveats).toHaveLength(0);
  });
});

describe('scalp show-through', () => {
  const density = (scalp: number) => ruleAnalyser.analyse([front(), top({ scalp }), top({ scalp }, 'crown')], dryClean).density;

  it('reads thick hair as thick and rises as more scalp shows', () => {
    const thick = density(0);
    const some = density(0.25);
    const thin = density(0.6);
    expect(thick.value).toBe('thick');
    expect(thick.value && some.value && thin.value).toBeTruthy();
    expect(thick.value != null && some.value != null && some.score > thick.score).toBe(true);
    expect(some.value != null && thin.value != null && thin.score > some.score).toBe(true);
    expect(thin.value).toBe('thin');
  });

  it('is fair, not more, with clear top and crown photos', () => {
    const d = density(0);
    expect(d.value != null && d.sure).toBe('fair');
  });

  it('needs the front photo for your skin tone', () => {
    expect(ruleAnalyser.analyse([top({ scalp: 0.5 })], dryClean).density.value).toBeNull();
  });

  it('can’t tell when skin and hair are alike', () => {
    // A head where everything is the colour of the skin: blond hair on fair skin looks like this.
    const f = synthFace([214, 168, 140]);
    const all = { view: 'top' as const, rgb: f.rgb, grid: { cols: 24, rows: 32, values: new Array(24 * 32).fill(0.8) }, score: 90 };
    expect(showThrough(all, [214, 168, 140])).toBeNull();
  });

  it('maps show-through to plain levels', () => {
    expect([0.05, 0.15, 0.3, 0.5].map(densityLevel)).toEqual(['thick', 'normal', 'thinner', 'thin']);
  });
});

describe('summarise', () => {
  const base: ViewMetrics = {
    view: 'top',
    score: 70,
    interiorPx: 20000,
    hairL: 40,
    hairSat: 0.3,
    hairRgb: [55, 38, 28],
    localCoherence: 0.95,
    cellCoherence: 0.95,
    fine: 3,
    mid: 3.5,
    shine: 0.05,
    greyShare: 0,
    edgeCells: 10,
    frizz: 0,
  };

  it('stays rough when the photos are only fair', () => {
    const s = summarise([base], null, dryClean);
    expect(s.quality.curl.value != null && s.quality.curl.sure).toBe('rough');
  });

  it('won’t read a pattern from a photo with no strand detail', () => {
    const s = summarise([{ ...base, fine: 0.5, mid: 0.8 }], null, dryClean);
    expect(s.quality.curl.value).toBeNull();
  });

  it('calls very light, colourless hair mostly grey', () => {
    expect(summarise([{ ...base, hairL: 170, hairSat: 0.05 }], null, dryClean).quality.greys.value).toBe('mostly');
  });
});

describe('swappable analyser', () => {
  it('can be replaced by another model', () => {
    const fake: HairAnalyser = { id: 'fake', analyse: () => ({ ...ruleAnalyser.analyse([], null), analyser: 'fake' }) };
    setHairAnalyser(fake);
    expect(hairAnalyser().id).toBe('fake');
    setHairAnalyser(ruleAnalyser);
    expect(hairAnalyser().id).toBe('rules-v1');
  });
});
