import { emptyProfile } from '@/profile/types';
import { assess, hairTypeLine, hairTypeOf, parseIngredients, type HairType } from '@/products/ingredients';
import { fromObf, isProductBarcode, lookupProduct, OBF_URL } from '@/products/lookup';

import { hairReading } from '../../test-utils/hairFixtures';
import { record } from '../../test-utils/scanFixtures';

const SHAMPOO =
  'Ingredients: Aqua (Water), Sodium Laureth Sulfate, Cocamidopropyl Betaine, Dimethicone, PEG-12 Dimethicone, Glycerin, Parfum*, Cetearyl Alcohol, Methylisothiazolinone, CI 19140 (Yellow 5, E102). *Natural origin';
const curlyDry: HairType = { traits: ['curly', 'dry'], from: '2026-11-20T09:00:00Z' };
const straight: HairType = { traits: [], from: '2026-11-20T09:00:00Z' };

describe('ingredient list', () => {
  it('splits on commas outside brackets, lower-cased, without the label, stars or footnote', () => {
    const list = parseIngredients(SHAMPOO);
    expect(list[0]).toBe('aqua (water)');
    expect(list).toContain('parfum');
    expect(list).toContain('ci 19140 (yellow 5, e102)');
    expect(list).toContain('sodium laureth sulfate');
    expect(list.at(-1)).toBe('ci 19140 (yellow 5, e102)');
  });
});

describe('assessment', () => {
  it('calls sulfates harsh for curly, dry hair and keeps fatty alcohols and soluble silicones out', () => {
    const a = assess(parseIngredients(SHAMPOO), curlyDry);
    expect(a.verdict).toBe('harsh');
    expect(a.title).toBe('Harsh for your hair');
    const sul = a.flags.find((f) => f.id === 'sulfates')!;
    expect(sul.severity).toBe('harsh');
    expect(sul.because).toEqual(['curly', 'dry']);
    expect(a.flags.find((f) => f.id === 'silicones')!.found).toEqual(['dimethicone']);
    expect(a.flags.some((f) => f.id === 'drying-alcohol')).toBe(false);
    expect(a.good.map((g) => g.id)).toEqual(expect.arrayContaining(['glycerin', 'gentle']));
  });

  it('lets the same shampoo pass for straight, healthy hair, except the preservative everyone should know about', () => {
    const a = assess(parseIngredients(SHAMPOO), straight);
    expect(a.verdict).toBe('watch');
    expect(a.flags.map((f) => f.id)).toEqual(['isothiazolinones']);
    expect(a.other).toEqual(expect.arrayContaining(['Strong sulfate cleansers', 'Fragrance']));
    expect(a.good.map((g) => g.id)).not.toContain('glycerin');
  });

  it('flags silicones and mineral oil for thinning hair', () => {
    const a = assess(parseIngredients('Aqua, Amodimethicone, Paraffinum Liquidum'), { traits: ['fine'], from: 'x' });
    expect(a.flags.map((f) => [f.id, f.severity])).toEqual([
      ['silicones', 'watch'],
      ['heavy-oils', 'watch'],
    ]);
  });

  it('says it looks fine when nothing matters', () => {
    expect(assess(parseIngredients('Aqua, Decyl Glucoside, Glycerin, Ketoconazole'), straight)).toMatchObject({ verdict: 'fine', title: 'Looks fine for your hair' });
  });

  it('without a hair reading, shows everything that might matter as worth watching', () => {
    const a = assess(parseIngredients(SHAMPOO), { traits: [], from: null });
    expect(a.generic).toBe(true);
    expect(a.flags.every((f) => f.severity === 'watch')).toBe(true);
    expect(a.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['sulfates', 'silicones', 'fragrance', 'isothiazolinones']));
  });

  it('treats a sensitive scalp from the profile', () => {
    const a = assess(parseIngredients('Aqua, Parfum, DMDM Hydantoin'), { traits: ['sensitive'], from: 'x' });
    expect(a.flags.map((f) => [f.id, f.severity])).toEqual([
      ['formaldehyde', 'harsh'],
      ['fragrance', 'watch'],
    ]);
  });
});

describe('hair type', () => {
  it('comes from the latest scan with a hair reading, plus the profile', () => {
    const scans = [
      record('old', '2026-10-01T09:00:00Z', { hair: hairReading({ curl: 'straight' }) }),
      record('new', '2026-11-20T09:00:00Z', { hair: hairReading({ curl: 'curly', dryness: 'some', density: 'thinner' }) }),
      record('none', '2026-11-25T09:00:00Z'),
    ];
    const h = hairTypeOf(scans, { ...emptyProfile(), conditions: ['scalp'] });
    expect(h).toEqual({ traits: ['curly', 'dry', 'fine', 'sensitive'], from: '2026-11-20T09:00:00Z' });
    expect(hairTypeLine(h, () => '20 Nov')).toBe('Checked for your wavy or curly, dry or frizzy, thinning hair and sensitive scalp, from your scan of 20 Nov.');
    expect(hairTypeLine({ traits: [], from: null }, () => '')).toBe('Not tailored yet. Scan your hair and we will check against it.');
  });
});

describe('Open Beauty Facts lookup', () => {
  it('accepts product barcodes only', () => {
    expect(isProductBarcode('3600541358386')).toBe(true);
    expect(isProductBarcode('https://example.com')).toBe(false);
  });

  it('reads the product, preferring English', () => {
    expect(
      fromObf('1', { status: 1, product: { product_name: 'Shampooing', product_name_en: 'Shampoo', brands: 'Acme, Acme Group', ingredients_text: 'Aqua', ingredients_text_en: 'Water' } }),
    ).toEqual({ barcode: '1', name: 'Shampoo', brand: 'Acme', ingredientsText: 'Water', imageUrl: undefined });
    expect(fromObf('1', { status: 0 })).toBeNull();
  });

  it('sends only the barcode, and reports missing and failed lookups', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'X', ingredients_text: 'Aqua' } }) }));
    expect(await lookupProduct('12345678', fetcher as unknown as typeof fetch)).toMatchObject({ kind: 'found', product: { name: 'X' } });
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toMatch(new RegExp(`^${OBF_URL}/12345678\\.json\\?fields=`));
    const missing = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await lookupProduct('12345678', missing as unknown as typeof fetch)).toEqual({ kind: 'notFound' });
    const down = jest.fn(async () => {
      throw new Error('offline');
    });
    expect(await lookupProduct('12345678', down as unknown as typeof fetch)).toEqual({ kind: 'error' });
  });
});
