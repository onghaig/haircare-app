import type { HairGrid } from '@modules/headmap';
import type { Rgb } from '@/scan/headModel';
import type { CurlPattern } from '@/scan/hairAnalysis';

export type SynthPattern = CurlPattern | 'coily';

/**
 * Drawn hair for tests: strands of a known pattern painted over a hair-coloured patch, with
 * optional shine, flyaways, grey strands and scalp showing. Not a photo, but it has the
 * structure the rules look for, so each rule can be checked to move the right way.
 */
export interface SynthHairOptions {
  width?: number;
  height?: number;
  pattern?: SynthPattern;
  /** Brightness added along a band across the hair (specular shine). */
  shine?: number;
  /** Number of loose strands sticking out of the edge. */
  flyaways?: number;
  /** Share of strands that are grey. */
  grey?: number;
  /** Share of the hair area where scalp shows between strands, 0 to 1. */
  scalp?: number;
  hair?: [number, number, number];
  skin?: [number, number, number];
  background?: [number, number, number];
  /** The hair patch, as fractions of the frame. */
  box?: { x0: number; x1: number; y0: number; y1: number };
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const cache = new Map<string, { rgb: Rgb; grid: HairGrid }>();

/** Drawn hair (cached: drawing is the slow part of the tests). */
export function synthHair(o: SynthHairOptions = {}): { rgb: Rgb; grid: HairGrid } {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const out = draw(o);
  cache.set(key, out);
  return out;
}

function draw(o: SynthHairOptions): { rgb: Rgb; grid: HairGrid } {
  const W = o.width ?? 480;
  const H = o.height ?? 640;
  const rand = rng(o.seed ?? 7);
  const hair = o.hair ?? [55, 38, 28];
  const bg = o.background ?? [205, 205, 200];
  const skin = o.skin ?? [214, 168, 140];
  const box = o.box ?? { x0: 0.1, x1: 0.9, y0: 0.15, y1: 0.85 };
  const X0 = box.x0 * W;
  const X1 = box.x1 * W;
  const Y0 = box.y0 * H;
  const Y1 = box.y1 * H;
  const inBox = (x: number, y: number) => x >= X0 && x < X1 && y >= Y0 && y < Y1;

  // Layers: background, then the hair patch (scalp or the dark under-layer of hair).
  const img = new Float32Array(W * H * 3);
  const scalpAt = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let c = bg;
      if (inBox(x, y)) {
        // Scalp shows in round patches between strand bundles.
        const patch = (Math.sin(x / 9.3) * Math.sin(y / 7.1) + 1) / 2;
        const isScalp = (o.scalp ?? 0) > 0 && patch < (o.scalp ?? 0);
        scalpAt[y * W + x] = isScalp ? 1 : 0;
        c = isScalp ? skin : [hair[0] * 0.7, hair[1] * 0.7, hair[2] * 0.7];
      }
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  }

  const stamp = (x: number, y: number, col: [number, number, number], alpha: number, clip: boolean) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        if (clip && (!inBox(px, py) || scalpAt[py * W + px])) continue;
        const wgt = alpha * (1 - Math.abs(x - px)) * (1 - Math.abs(y - py));
        const i = (py * W + px) * 3;
        for (let c = 0; c < 3; c++) img[i + c] = img[i + c] * (1 - wgt) + col[c] * wgt;
      }
    }
  };

  const shineAt = (y: number) => (o.shine ?? 0) * Math.exp(-(((y - (Y0 + (Y1 - Y0) * 0.35)) / 14) ** 2));
  const pattern = o.pattern ?? 'straight';
  const strands = Math.round((X1 - X0) * 2.2);
  for (let s = 0; s < strands; s++) {
    const isGrey = rand() < (o.grey ?? 0);
    const base: [number, number, number] = isGrey ? [215, 212, 208] : [hair[0] * (0.9 + rand() * 0.5), hair[1] * (0.9 + rand() * 0.5), hair[2] * (0.9 + rand() * 0.5)];
    const x0 = X0 + rand() * (X1 - X0);
    const phase = rand() * Math.PI * 2;
    // Each strand is a short piece, so the patch fills with overlapping strands.
    const yStart = Y0 + rand() * (Y1 - Y0) - 40;
    const curled = pattern === 'curly' || pattern === 'coily';
    // Curls and coils clump and point every way; straight and wavy strands hang down.
    const axis = curled ? rand() * Math.PI * 2 : Math.PI / 2;
    const len = curled ? 60 + rand() * 60 : 120 + rand() * 120;
    if (curled) {
      const cx = x0;
      const cy = yStart + 40;
      const r = pattern === 'curly' ? 7 : 3;
      const period = pattern === 'curly' ? 22 : 9;
      for (let t = 0; t < len; t += 0.5) {
        const th = (2 * Math.PI * t) / period + phase;
        const along = t * (pattern === 'curly' ? 0.45 : 0.3);
        const u = along;
        const v = r * Math.cos(th);
        const x = cx + Math.cos(axis) * u - Math.sin(axis) * v;
        const y = cy + Math.sin(axis) * u + Math.cos(axis) * v + r * 0.6 * Math.sin(th) * Math.cos(axis);
        const sh = isGrey ? 0 : shineAt(y);
        stamp(x, y, [Math.min(255, base[0] + sh), Math.min(255, base[1] + sh), Math.min(255, base[2] + sh)], 0.9, true);
      }
      continue;
    }
    for (let t = 0; t < len; t += 0.5) {
      let x = x0;
      const y = yStart + t;
      if (pattern === 'wavy') x += 9 * Math.sin((2 * Math.PI * t) / 70 + phase);
      else x += t * 0.05;
      const sh = isGrey ? 0 : shineAt(y);
      stamp(x, y, [Math.min(255, base[0] + sh), Math.min(255, base[1] + sh), Math.min(255, base[2] + sh)], 0.9, true);
    }
  }

  // Flyaways: thin loose strands leaving the top edge of the hair.
  for (let f = 0; f < (o.flyaways ?? 0); f++) {
    let x = X0 + rand() * (X1 - X0);
    let y = Y0 + 2;
    let ang = -Math.PI / 2 + (rand() - 0.5) * 1.6;
    const len = 15 + rand() * 25;
    for (let t = 0; t < len; t += 0.5) {
      ang += (rand() - 0.5) * 0.25;
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
      stamp(x, y, hair, 0.55, false);
    }
  }

  // Sensor noise.
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(img[i] + (rand() - 0.5) * 6)));

  // The hair grid, as the segmenter would see it: the hair patch (scalp patches count as thin hair).
  const cols = 24;
  const rows = 32;
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      let hairN = 0;
      for (let y = Math.floor((r * H) / rows); y < Math.floor(((r + 1) * H) / rows); y++) {
        for (let x = Math.floor((c * W) / cols); x < Math.floor(((c + 1) * W) / cols); x++) {
          n++;
          if (inBox(x, y)) hairN += scalpAt[y * W + x] ? 0.3 : 1;
        }
      }
      values.push(n ? Math.round((hairN / n) * 100) / 100 : 0);
    }
  }
  return { rgb: { width: W, height: H, data }, grid: { cols, rows, values } };
}

/** A front photo for the skin tone: forehead skin at the anchors the analyser reads. */
export function synthFace(skin: [number, number, number] = [214, 168, 140]): { rgb: Rgb; grid: HairGrid; anchors: Record<string, [number, number]> } {
  const W = 480;
  const H = 640;
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    data[i * 3] = skin[0];
    data[i * 3 + 1] = skin[1];
    data[i * 3 + 2] = skin[2];
  }
  return {
    rgb: { width: W, height: H, data },
    grid: { cols: 24, rows: 32, values: new Array(24 * 32).fill(0) },
    anchors: { '9': [0.5, 0.5], '10': [0.5, 0.3] },
  };
}
