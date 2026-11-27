import { useEffect, useState } from 'react';

import { loadRgb } from '@/scan/scalpRender';
import type { Rgb } from '@/scan/headModel';

import type { OwnPhoto } from './ownPhoto';

/** Skin and hair colour from the user's own photo, for painting the free preview. */
export interface Tones {
  skin: string;
  hair: string;
}

/** Used until the photo is read, or if it can't be. Under the blur they read as skin and hair. */
export const DEFAULT_TONES: Tones = { skin: '#B58A70', hair: '#2E241E' };

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mean colour of a box given in 0..1 frame units. Null if the box is off the photo. */
function mean(img: Rgb, x0: number, y0: number, x1: number, y1: number): string | null {
  const [ax, bx] = [Math.max(0, Math.floor(x0 * img.width)), Math.min(img.width, Math.ceil(x1 * img.width))];
  const [ay, by] = [Math.max(0, Math.floor(y0 * img.height)), Math.min(img.height, Math.ceil(y1 * img.height))];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const i = (y * img.width + x) * 3;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      n++;
    }
  }
  return n ? hex(r / n, g / n, b / n) : null;
}

/**
 * Skin from the forehead just under the middle of today's hairline, hair from just above it.
 * The hairline trace says where those are on this photo.
 */
export function sampleTones(img: Rgb, curve: [number, number][]): Tones {
  const xs = curve.map((p) => p[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const mid = curve.reduce((best, p) => (Math.abs(p[0] - cx) < Math.abs(best[0] - cx) ? p : best), curve[0]);
  const w = 0.05;
  return {
    skin: mean(img, cx - w, mid[1] + 0.03, cx + w, mid[1] + 0.07) ?? DEFAULT_TONES.skin,
    hair: mean(img, cx - w, mid[1] - 0.06, cx + w, mid[1] - 0.02) ?? DEFAULT_TONES.hair,
  };
}

const cache = new Map<string, Tones>();

/** The tones for one photo, read once on the phone and remembered. */
export function useTones(photo: OwnPhoto | null): Tones {
  const uri = photo?.uri ?? null;
  const curve = photo?.curve;
  const [, setRead] = useState(0);
  useEffect(() => {
    if (!uri || !curve || cache.has(uri)) return;
    let live = true;
    loadRgb(uri, 120)
      .then((img) => {
        cache.set(uri, sampleTones(img, curve));
        if (live) setRead((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uri, curve]);
  return (uri && cache.get(uri)) || DEFAULT_TONES;
}
