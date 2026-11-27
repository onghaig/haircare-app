import type { Profile } from '@/profile/types';
import type { HairAnalysis } from '@/scan/hairAnalysis';
import type { ScanRecord } from '@/scan/session';

/**
 * Reads a product's ingredient list against the user's hair, as the hair score read it from the
 * scans. Rules of thumb from cosmetic chemistry, not a safety rating: an ingredient flagged
 * here is fine for many people, and the same product can suit one head of hair and not another.
 */

/** What about the user's hair changes which ingredients matter. */
export type Trait = 'curly' | 'dry' | 'fine' | 'sensitive';

export const TRAIT_LABEL: Record<Trait, string> = {
  curly: 'wavy or curly',
  dry: 'dry or frizzy',
  fine: 'thinning',
  sensitive: 'sensitive scalp',
};

export interface HairType {
  traits: Trait[];
  /** When the scan that set it was taken, or null when there's no hair reading yet. */
  from: string | null;
}

/** The user's hair traits, from the latest scan with a hair reading and the profile. */
export function hairTypeOf(records: ScanRecord[], profile: Profile): HairType {
  const withHair = [...records].filter((r) => r.hair).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const latest = withHair[0];
  const traits = new Set<Trait>(latest?.hair ? traitsFrom(latest.hair) : []);
  if (profile.conditions.includes('scalp')) traits.add('sensitive');
  return { traits: [...traits], from: latest?.takenAt ?? null };
}

export function traitsFrom(h: HairAnalysis): Trait[] {
  const out: Trait[] = [];
  const q = h.quality;
  if (q.curl.value === 'wavy' || q.curl.value === 'curly') out.push('curly');
  if (q.dryness.value === 'high' || q.dryness.value === 'some' || q.frizz.value === 'high') out.push('dry');
  if (h.density.value === 'thinner' || h.density.value === 'thin') out.push('fine');
  return out;
}

export type Severity = 'harsh' | 'watch';

interface Rule {
  id: string;
  name: string;
  match: RegExp;
  /** Never flag when this matches too (gentle cousins of a harsh ingredient). */
  except?: RegExp;
  /** Which traits make it matter, and how much. `all` applies to everyone. */
  for: Partial<Record<Trait | 'all', Severity>>;
  why: string;
}

export const RULES: Rule[] = [
  {
    id: 'sulfates',
    name: 'Strong sulfate cleansers',
    match: /\b(sodium|ammonium|magnesium|tea|mea)[\s-]*(lauryl|laureth|myreth|coco)[\s-]*sulfate\b|\bsodium c14-16 olefin sulfonate\b/,
    for: { dry: 'harsh', curly: 'harsh', sensitive: 'watch' },
    why: 'Strip natural oils, which leaves dry or curly hair rougher and frizzier.',
  },
  {
    id: 'drying-alcohol',
    name: 'Drying alcohol',
    match: /\balcohol denat\b|\bsd alcohol\b|\bisopropyl alcohol\b|^alcohol$|^ethanol$/,
    for: { dry: 'harsh', curly: 'harsh', sensitive: 'watch' },
    why: 'Evaporates fast and takes moisture with it. Fatty alcohols like cetearyl alcohol are fine.',
  },
  {
    id: 'silicones',
    name: 'Silicones that build up',
    match: /\b(dimethicone|amodimethicone|cyclopentasiloxane|cyclomethicone|cetearyl methicone|trimethylsiloxysilicate|dimethiconol)\b/,
    except: /\b(peg|pg|bis-peg)-\d+[\w\s/-]*dimethicone\b/,
    for: { fine: 'watch', curly: 'watch' },
    why: 'Coat the hair and build up without a strong wash, which weighs down thin hair and flattens curls.',
  },
  {
    id: 'heavy-oils',
    name: 'Heavy mineral oils',
    match: /\b(mineral oil|paraffinum liquidum|petrolatum|paraffin)\b/,
    for: { fine: 'watch' },
    why: 'Sit on the hair and scalp and can make thin hair look flatter and sparser.',
  },
  {
    id: 'fragrance',
    name: 'Fragrance',
    match: /^(parfum|fragrance|perfume|aroma)$|\bparfum\b|\bfragrance\b/,
    for: { sensitive: 'watch' },
    why: 'One of the most common causes of scalp irritation.',
  },
  {
    id: 'isothiazolinones',
    name: 'MI and MCI preservatives',
    match: /\bmethylchloroisothiazolinone\b|\bmethylisothiazolinone\b/,
    for: { sensitive: 'harsh', all: 'watch' },
    why: 'Strong preservatives that often irritate the skin, even in rinse-off products.',
  },
  {
    id: 'formaldehyde',
    name: 'Formaldehyde releasers',
    match: /\b(dmdm hydantoin|quaternium-15|imidazolidinyl urea|diazolidinyl urea|sodium hydroxymethylglycinate|2-bromo-2-nitropropane-1,3-diol|bronopol)\b/,
    for: { sensitive: 'harsh', all: 'watch' },
    why: 'Preservatives that slowly release formaldehyde, which can irritate the scalp.',
  },
];

interface Good {
  id: string;
  name: string;
  match: RegExp;
  /** Only worth pointing out for these traits. Absent means for everyone. */
  for?: Trait[];
  why: string;
}

export const GOOD: Good[] = [
  { id: 'ketoconazole', name: 'Ketoconazole', match: /\bketoconazole\b/, why: 'An anti-dandruff ingredient with some evidence for hair loss too.' },
  { id: 'piroctone', name: 'Piroctone olamine', match: /\bpiroctone olamine\b/, why: 'A gentle anti-dandruff ingredient.' },
  { id: 'zinc', name: 'Zinc pyrithione', match: /\bzinc pyrithione\b/, why: 'An anti-dandruff ingredient.' },
  { id: 'caffeine', name: 'Caffeine', match: /\bcaffeine\b/, why: 'Common in hair-loss shampoos. The evidence is limited, but it does no harm.' },
  { id: 'panthenol', name: 'Panthenol', match: /\bpanthenol\b/, for: ['dry', 'curly'], why: 'Holds moisture in the hair.' },
  { id: 'glycerin', name: 'Glycerin', match: /\bglycerin\b/, for: ['dry', 'curly'], why: 'Draws in moisture.' },
  {
    id: 'gentle',
    name: 'Gentle cleansers',
    match: /\b(cocamidopropyl betaine|coco[\s-]?glucoside|decyl glucoside|lauryl glucoside|sodium cocoyl isethionate|sodium lauroyl sarcosinate)\b/,
    for: ['dry', 'curly', 'sensitive'],
    why: 'Clean without stripping as much as sulfates.',
  },
];

/** "Aqua (Water), Sodium Laureth Sulfate, Parfum*." to one lower-case name per entry. */
export function parseIngredients(text: string): string[] {
  const body = text
    .replace(/^[\s\S]*?\b(ingredients|ingrédients|inci)\s*:/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ');
  // Commas inside brackets ("CI 19140 (Yellow 5, E102)") belong to one entry.
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    // A full stop then a new sentence ends the list: "... Yellow 5. *Natural origin".
    if (ch === '.' && depth === 0 && /^\s+[*A-Z]/.test(body.slice(i + 1, i + 3))) break;
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';' || ch === '•') && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out
    .map((s) =>
      s
        .toLowerCase()
        .replace(/[*†°]+/g, '')
        .replace(/\.$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => s.length > 1 && s.length < 120);
}

export interface Flag {
  id: string;
  name: string;
  severity: Severity;
  why: string;
  /** The ingredients as listed that triggered it. */
  found: string[];
  /** The traits that made it matter for this user. Empty when it applies to everyone. */
  because: Trait[];
}

export interface Assessment {
  verdict: 'fine' | 'watch' | 'harsh';
  title: string;
  flags: Flag[];
  good: { id: string; name: string; why: string; found: string[] }[];
  /** Flags that would matter for other hair types, kept short for "also in it". */
  other: string[];
  count: number;
  /** True when there was no hair reading to tailor it. */
  generic: boolean;
}

export const VERDICT_TITLE: Record<Assessment['verdict'], string> = {
  fine: 'Looks fine for your hair',
  watch: 'A few things to watch',
  harsh: 'Harsh for your hair',
};

const rank = (s: Severity) => (s === 'harsh' ? 2 : 1);

/**
 * Flags the ingredients that matter for this hair type. Without a hair reading, anything that
 * matters for some hair type is shown as "watch", so nothing is hidden.
 */
export function assess(ingredients: string[], hair: HairType): Assessment {
  const generic = hair.from == null;
  const flags: Flag[] = [];
  const other: string[] = [];
  for (const r of RULES) {
    const found = ingredients.filter((i) => r.match.test(i) && !(r.except && r.except.test(i)));
    if (!found.length) continue;
    let severity: Severity | null = null;
    const because: Trait[] = [];
    for (const t of hair.traits) {
      const s = r.for[t];
      if (!s) continue;
      because.push(t);
      if (!severity || rank(s) > rank(severity)) severity = s;
    }
    if (!severity && r.for.all) severity = r.for.all;
    if (!severity && generic) severity = 'watch';
    if (severity) flags.push({ id: r.id, name: r.name, severity, why: r.why, found, because });
    else other.push(r.name);
  }
  flags.sort((a, b) => rank(b.severity) - rank(a.severity));
  const good = GOOD.filter((g) => !g.for || generic || g.for.some((t) => hair.traits.includes(t)))
    .map((g) => ({ id: g.id, name: g.name, why: g.why, found: ingredients.filter((i) => g.match.test(i)) }))
    .filter((g) => g.found.length > 0);
  const verdict = flags.some((f) => f.severity === 'harsh') ? 'harsh' : flags.length ? 'watch' : 'fine';
  return { verdict, title: VERDICT_TITLE[verdict], flags, good, other, count: ingredients.length, generic };
}

/** "Checked for your wavy or curly, thinning hair and sensitive scalp, from your scan of 3 Dec." */
export function hairTypeLine(hair: HairType, date: (d: Date) => string): string {
  const hairWords = hair.traits.filter((t) => t !== 'sensitive').map((t) => TRAIT_LABEL[t]);
  const scalp = hair.traits.includes('sensitive');
  const what = [hairWords.length ? `${hairWords.join(', ')} hair` : null, scalp ? 'sensitive scalp' : null].filter(Boolean).join(' and ');
  if (hair.from == null) {
    return what ? `Checked for your ${what}. Scan your hair to tailor it further.` : 'Not tailored yet. Scan your hair and we will check against it.';
  }
  const when = date(new Date(hair.from));
  if (!what) return `Your scan of ${when} found no dry, curly or thin hair to watch for.`;
  return `Checked for your ${what}, from your scan of ${when}.`;
}
