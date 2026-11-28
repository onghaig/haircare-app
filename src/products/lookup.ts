/**
 * Product lookup by barcode in Open Beauty Facts, a free, open database of cosmetics run by
 * volunteers. Only the barcode leaves the phone. Some products are missing or have no
 * ingredient list, so the scanner always offers typing the list in instead.
 */

export interface Product {
  barcode: string;
  name: string;
  brand?: string;
  /** Raw ingredient text, as printed on the pack. Empty when the database has none. */
  ingredientsText: string;
  imageUrl?: string;
}

export type LookupResult = { kind: 'found'; product: Product } | { kind: 'notFound' } | { kind: 'error' };

export const OBF_URL = 'https://world.openbeautyfacts.org/api/v2/product';
const FIELDS = 'product_name,product_name_en,brands,ingredients_text,ingredients_text_en,image_front_small_url';
const TIMEOUT_MS = 8000;

/** EAN-13, EAN-8 and UPC-A/E: 8 to 14 digits. QR codes and the like are not products. */
export function isProductBarcode(data: string): boolean {
  return /^\d{8,14}$/.test(data.trim());
}

interface ObfResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    ingredients_text?: string;
    ingredients_text_en?: string;
    image_front_small_url?: string;
  };
}

export function fromObf(barcode: string, body: ObfResponse): Product | null {
  if (body.status !== 1 || !body.product) return null;
  const p = body.product;
  return {
    barcode,
    name: (p.product_name_en || p.product_name || '').trim() || 'Unnamed product',
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    ingredientsText: (p.ingredients_text_en || p.ingredients_text || '').trim(),
    imageUrl: p.image_front_small_url || undefined,
  };
}

export async function lookupProduct(barcode: string, fetcher: typeof fetch = fetch): Promise<LookupResult> {
  const code = barcode.trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(`${OBF_URL}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
      // Open Beauty Facts asks apps to say who they are. No user details go in it.
      headers: { 'User-Agent': 'HaircareApp/1.0 (product check)' },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { kind: 'notFound' };
    if (!res.ok) return { kind: 'error' };
    const product = fromObf(code, (await res.json()) as ObfResponse);
    return product ? { kind: 'found', product } : { kind: 'notFound' };
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
