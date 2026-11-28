import type { HairGrid, ScanView } from '@modules/headmap';

import type { Rgb } from './headModel';
import type { HairState } from './session';

/**
 * Hair quality and density from the ordinary scan photos, measured on the phone.
 *
 * There is no labelled set of hair photos behind this yet, so every reading here is a
 * hand-tuned rule on what the camera can see, not a trained model:
 *
 * - Scalp show-through (density): on the top and crown photos, the share of the hair area whose
 *   colour is closer to your skin (taken from your forehead in the front photo) than to your
 *   hair. Thick hair hides the scalp; thinning hair lets it show. Reliable enough to rank thick
 *   against thin; not a hairs-per-cm² count, which needs a close-up of a parting.
 * - Curl pattern: how lined up the strands are, close up and over a few centimetres. Straight
 *   hair runs in one direction; waves turn slowly; curls and coils turn within a few pixels.
 * - Curl definition: whether the curls show as clumps (mid-size detail) or as fuzz (fine detail).
 * - Frizz: at the edge of the hair, the share of pixels that are a blend of hair and background
 *   colour (a fuzzy halo of loose strands) rather than a clean edge.
 * - Shine: how bright the brightest hair is compared with the typical hair, relative to the
 *   headroom left. Depends heavily on the light.
 * - Grey hairs: thin, bright, colourless strands against darker hair. Hard on light hair.
 * - Signs of dryness: frizz plus low shine together. A photo can't show split ends.
 *
 * Every rule lives behind `HairAnalyser`, so a trained model can replace it with
 * `setHairAnalyser` without touching the screens, the stage estimate or the forecast.
 */
export const HAIR_ANALYSIS_VERSION = 1;

/** Analysis runs at this width; all window sizes below are in these pixels. */
export const WORK_WIDTH = 480;

export type Sureness = 'rough' | 'fair';

/** Curly and coily are one group: phone photos can't reliably tell a tight curl from a coil. */
export type CurlPattern = 'straight' | 'wavy' | 'curly';
export type Amount = 'low' | 'some' | 'high';
export type Definition = 'fuzzy' | 'fair' | 'clear';
export type Greys = 'none' | 'few' | 'some' | 'lots' | 'mostly';
export type Density = 'thick' | 'normal' | 'thinner' | 'thin';

/** One trait the scan read, or why it couldn't. Scores are 0 to 1, kept for trends later. */
export type Reading<T extends string> =
  | { value: T; score: number; sure: Sureness }
  | { value: null; reason: string };

export interface HairQuality {
  curl: Reading<CurlPattern>;
  /** Only when the curl pattern is wavy or curlier. */
  definition: Reading<Definition> | null;
  frizz: Reading<Amount>;
  shine: Reading<Amount>;
  dryness: Reading<Amount>;
  greys: Reading<Greys>;
}

export interface DensityReading {
  /** Share of the hair area on top and at the crown where the scalp shows, 0 to 1. */
  showThrough: number;
  /** Top and crown separately, when each could be read. */
  top?: number;
  crown?: number;
  level: Density;
  sure: Sureness;
}

/** One number for the whole head of hair, as a range. Higher is thicker, smoother and shinier. */
export interface HairScore {
  value: number;
  low: number;
  high: number;
  label: 'Strong' | 'Good' | 'Fair' | 'Needs care';
  /** What went into it, for the breakdown. */
  parts: { key: 'thickness' | 'smoothness' | 'shine'; score: number }[];
}

export interface HairAnalysis {
  version: number;
  /** Null when too few traits could be read to make one fair number. */
  score: HairScore | null;
  /** Which analyser made it, for the record and for later comparison with a trained model. */
  analyser: string;
  quality: HairQuality;
  density: Reading<Density> & { detail?: DensityReading };
  /** Things about this scan that change the readings, in plain words. */
  caveats: string[];
  /** The raw numbers per photo, kept so the rules can be calibrated against labelled photos later. */
  metrics?: ViewMetrics[];
}

/** One scan photo, decoded, with what the camera saved alongside it. */
export interface ViewPhoto {
  view: ScanView;
  rgb: Rgb;
  grid: HairGrid;
  /** The view's quality score, 0 to 100. */
  score: number;
  anchors?: Record<string, [number, number]>;
}

export interface HairAnalyser {
  id: string;
  analyse(photos: ViewPhoto[], hairState: HairState | null): HairAnalysis;
  /** The same, pausing with `pause()` between steps so the screen stays responsive. Optional. */
  analyseAsync?(photos: ViewPhoto[], hairState: HairState | null, pause: () => Promise<void>): Promise<HairAnalysis>;
}

// ---------------------------------------------------------------------------------------------
// Image helpers

interface Work {
  w: number;
  h: number;
  /** RGB, 0 to 255. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Luminance, 0 to 255. */
  l: Float32Array;
}

/** Box-averages the photo down to `WORK_WIDTH` wide (or keeps it if it's already smaller). */
export function toWork(img: Rgb): Work {
  const k = Math.max(1, img.width / WORK_WIDTH);
  const w = Math.max(1, Math.round(img.width / k));
  const h = Math.max(1, Math.round(img.height / k));
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const l = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * img.width + xx) * 3;
          sr += img.data[o];
          sg += img.data[o + 1];
          sb += img.data[o + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const i = y * w + x;
      r[i] = sr / n;
      g[i] = sg / n;
      b[i] = sb / n;
      l[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
    }
  }
  return { w, h, r, g, b, l };
}

/** One pass of the [1 2 1]/4 blur each way (sigma about 0.7 px). */
function blur121(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = src[x > 0 ? i - 1 : i];
      const c = src[x < w - 1 ? i + 1 : i];
      tmp[i] = (a + 2 * src[i] + c) / 4;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = tmp[y > 0 ? i - w : i];
      const c = tmp[y < h - 1 ? i + w : i];
      out[i] = (a + 2 * tmp[i] + c) / 4;
    }
  }
  return out;
}

/** Summed-area table, (w+1) x (h+1). */
function integral(src: Float32Array, w: number, h: number): Float64Array {
  const s = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row;
    }
  }
  return s;
}

function boxMean(s: Float64Array, w: number, h: number, x: number, y: number, rad: number): number {
  const x0 = Math.max(0, x - rad);
  const y0 = Math.max(0, y - rad);
  const x1 = Math.min(w, x + rad + 1);
  const y1 = Math.min(h, y + rad + 1);
  const W = w + 1;
  return (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, q) => p - q);
  return a[Math.floor(a.length / 2)];
}

function percentile(sorted: Float32Array | number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------------------------------------
// Regions from the saved hair grid

type CellKind = 'interior' | 'edge' | 'hair' | 'background' | 'other';

interface Cells {
  cols: number;
  rows: number;
  kind: CellKind[];
  value: number[];
}

function cellsOf(grid: HairGrid): Cells {
  const { cols, rows, values } = grid;
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? null : values[r * cols + c]);
  const kind: CellKind[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = values[r * cols + c];
      let minN = 1;
      let maxN = 0;
      let max4 = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const n = at(c + dc, r + dr);
          if (n == null) continue;
          minN = Math.min(minN, n);
          maxN = Math.max(maxN, n);
          if (!dr || !dc) max4 = Math.max(max4, n);
        }
      }
      if (v >= 0.55 && minN >= 0.4) kind.push('interior');
      else if (v < 0.5 && max4 >= 0.5) kind.push('edge');
      else if (v >= 0.5) kind.push('hair');
      else if (v < 0.05 && maxN < 0.2) kind.push('background');
      else kind.push('other');
    }
  }
  return { cols, rows, kind, value: values };
}

function cellAt(cells: Cells, x: number, y: number, w: number, h: number): number {
  const c = Math.min(cells.cols - 1, Math.floor((x / w) * cells.cols));
  const r = Math.min(cells.rows - 1, Math.floor((y / h) * cells.rows));
  return r * cells.cols + c;
}

/** Pixel bounds of one grid cell in the work image. */
function cellBox(cells: Cells, i: number, w: number, h: number) {
  const c = i % cells.cols;
  const r = Math.floor(i / cells.cols);
  return {
    x0: Math.floor((c * w) / cells.cols),
    x1: Math.floor(((c + 1) * w) / cells.cols),
    y0: Math.floor((r * h) / cells.rows),
    y1: Math.floor(((r + 1) * h) / cells.rows),
  };
}

// ---------------------------------------------------------------------------------------------
// Per-photo measurements

/** Raw numbers from one photo. Exported for tests and for calibrating against labels later. */
export interface ViewMetrics {
  view: ScanView;
  score: number;
  /** Interior hair pixels used for texture. */
  interiorPx: number;
  hairL: number;
  hairSat: number;
  hairRgb: [number, number, number];
  /** Strand alignment within ~9 px (0 to 1), weighted by edge strength. */
  localCoherence: number;
  /** Strand alignment over one grid cell (~20 px, 1 to 2 cm of hair). */
  cellCoherence: number;
  /** Mean fine (pixel-scale) and mid (clump-scale) detail, in luminance levels. */
  fine: number;
  mid: number;
  /** Highlight strength, 0 to 1. */
  shine: number;
  /** Share of interior pixels that look like single grey or white strands. */
  greyShare: number;
  /** Edge cells with enough hair/background contrast to judge frizz, and their blended share. */
  edgeCells: number;
  frizz: number;
}

/** Fine detail at or under this (levels) is sensor noise, not strands. */
const TEXTURE_FLOOR = 1.2;

/** Runs a measurement to the end in one go (tests, and analysers that don't need to pause). */
export function drain<T>(steps: Generator<void, T>): T {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

export function measureView(p: ViewPhoto): ViewMetrics {
  return drain(measureViewSteps(p));
}

/**
 * The measurement, as steps: it yields every few dozen rows so a caller on the JS thread can
 * let the screen draw between steps (see `analyseAsync`).
 */
export function* measureViewSteps(p: ViewPhoto): Generator<void, ViewMetrics> {
  const img = toWork(p.rgb);
  yield;
  const { w, h, r, g, b, l } = img;
  const cells = cellsOf(p.grid);
  const l1 = blur121(l, w, h);
  const sL = integral(l, w, h);
  yield;

  // Gradients on the lightly blurred image, and the structure tensor's parts.
  const jxx = new Float32Array(w * h);
  const jyy = new Float32Array(w * h);
  const jxy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    if (y % 96 === 0) yield;
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = l1[i - w + 1] + 2 * l1[i + 1] + l1[i + w + 1] - l1[i - w - 1] - 2 * l1[i - 1] - l1[i + w - 1];
      const gy = l1[i + w - 1] + 2 * l1[i + w] + l1[i + w + 1] - l1[i - w - 1] - 2 * l1[i - w] - l1[i - w + 1];
      jxx[i] = gx * gx;
      jyy[i] = gy * gy;
      jxy[i] = gx * gy;
    }
  }
  const sxx = integral(jxx, w, h);
  const syy = integral(jyy, w, h);
  const sxy = integral(jxy, w, h);
  yield;

  // Interior hair: texture, colour, shine and greys.
  let n = 0;
  let cohNum = 0;
  let cohDen = 0;
  let fine = 0;
  let mid = 0;
  const ls: number[] = [];
  const sats: number[] = [];
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const interiorL: number[] = [];
  let greys = 0;
  // Every other pixel each way: a quarter of the work, and the windows overlap anyway.
  for (let y = 4; y < h - 4; y += 2) {
    if (y % 64 === 0) yield;
    for (let x = 4; x < w - 4; x += 2) {
      const ci = cellAt(cells, x, y, w, h);
      if (cells.kind[ci] !== 'interior') continue;
      const i = y * w + x;
      n++;
      const a = boxMean(sxx, w, h, x, y, 4);
      const c = boxMean(syy, w, h, x, y, 4);
      const bb = boxMean(sxy, w, h, x, y, 4);
      cohNum += Math.sqrt((a - c) * (a - c) + 4 * bb * bb);
      cohDen += a + c;
      fine += Math.abs(l[i] - l1[i]);
      const m4 = boxMean(sL, w, h, x, y, 4);
      mid += Math.abs(l1[i] - m4);
      // Shine is a broad band of light, so it's judged on the local mean: single bright (grey)
      // strands average out.
      interiorL.push(m4);
      if (n % 3 === 0) {
        const mx = Math.max(r[i], g[i], b[i]);
        const mn = Math.min(r[i], g[i], b[i]);
        ls.push(l[i]);
        sats.push(mx > 0 ? (mx - mn) / mx : 0);
        rs.push(r[i]);
        gs.push(g[i]);
        bs.push(b[i]);
      }
    }
  }
  const hairL = median(ls);
  const hairSat = median(sats);
  const hairRgb: [number, number, number] = [median(rs), median(gs), median(bs)];

  // Cell-scale alignment: the tensor summed over each interior cell.
  let ccNum = 0;
  let ccDen = 0;
  for (let ci = 0; ci < cells.kind.length; ci++) {
    if (cells.kind[ci] !== 'interior') continue;
    const bx = cellBox(cells, ci, w, h);
    const x0 = Math.max(1, bx.x0);
    const y0 = Math.max(1, bx.y0);
    const x1 = Math.min(w - 1, bx.x1);
    const y1 = Math.min(h - 1, bx.y1);
    if (x1 <= x0 || y1 <= y0) continue;
    const W = w + 1;
    const sum = (s: Float64Array) => s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
    const a = sum(sxx);
    const c = sum(syy);
    const bb = sum(sxy);
    ccNum += Math.sqrt((a - c) * (a - c) + 4 * bb * bb);
    ccDen += a + c;
  }

  // Shine: the brightest hair against typical hair, as a share of the headroom left above it.
  const sortedL = Float32Array.from(interiorL).sort();
  const p50 = percentile(sortedL, 0.5);
  const p97 = percentile(sortedL, 0.97);
  const shine = n > 0 ? clamp01((p97 - p50) / Math.max(30, 255 - p50)) : 0;

  // Greys: thin bright colourless strands. A broad shine band is bright but not thin, so the
  // pixel must stand out from its own neighbourhood too.
  yield;
  for (let y = 4; y < h - 4; y += 2) {
    if (y % 128 === 0) yield;
    for (let x = 4; x < w - 4; x += 2) {
      if (cells.kind[cellAt(cells, x, y, w, h)] !== 'interior') continue;
      const i = y * w + x;
      const mx = Math.max(r[i], g[i], b[i]);
      const mn = Math.min(r[i], g[i], b[i]);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const around = boxMean(sL, w, h, x, y, 4);
      if (l[i] > Math.max(115, hairL + 55) && sat < 0.2 && around - hairL < 0.5 * (l[i] - hairL)) greys++;
    }
  }
  const greySamples = Math.max(1, n);

  // Frizz: in each edge cell, how many pixels are a blend of hair and background colour.
  let edgeCells = 0;
  let blended = 0;
  for (let ci = 0; ci < cells.kind.length; ci++) {
    if (ci % 96 === 0) yield;
    if (cells.kind[ci] !== 'edge' || n === 0) continue;
    const bx = cellBox(cells, ci, w, h);
    const px: { d: number; i: number }[] = [];
    for (let y = bx.y0; y < bx.y1; y++) {
      for (let x = bx.x0; x < bx.x1; x++) {
        const i = y * w + x;
        px.push({ d: Math.hypot(r[i] - hairRgb[0], g[i] - hairRgb[1], b[i] - hairRgb[2]), i });
      }
    }
    if (px.length < 20) continue;
    px.sort((p1, p2) => p1.d - p2.d);
    // The background colour: the pixels least like hair in this cell.
    const far = px.slice(Math.floor(px.length * 0.8));
    const bg = [0, 0, 0];
    for (const q of far) {
      bg[0] += r[q.i];
      bg[1] += g[q.i];
      bg[2] += b[q.i];
    }
    bg[0] /= far.length;
    bg[1] /= far.length;
    bg[2] /= far.length;
    const axis = [bg[0] - hairRgb[0], bg[1] - hairRgb[1], bg[2] - hairRgb[2]];
    const len2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
    if (len2 < 50 * 50) continue; // hair and background too alike to see the edge
    let mix = 0;
    for (const q of px) {
      const t = ((r[q.i] - hairRgb[0]) * axis[0] + (g[q.i] - hairRgb[1]) * axis[1] + (b[q.i] - hairRgb[2]) * axis[2]) / len2;
      if (t > 0.2 && t < 0.75) mix++;
    }
    edgeCells++;
    blended += mix / px.length;
  }

  return {
    view: p.view,
    score: p.score,
    interiorPx: n * 4,
    hairL,
    hairSat,
    hairRgb,
    localCoherence: cohDen > 0 ? cohNum / cohDen : 0,
    cellCoherence: ccDen > 0 ? ccNum / ccDen : 0,
    fine: n > 0 ? fine / n : 0,
    mid: n > 0 ? mid / n : 0,
    shine,
    greyShare: greys / greySamples,
    edgeCells,
    frizz: edgeCells > 0 ? blended / edgeCells : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Scalp show-through

/** Forehead skin colour from the front photo: a patch between the brows and the top of the forehead. */
export function skinColour(p: ViewPhoto): [number, number, number] | null {
  const a = p.anchors?.['9'];
  const t = p.anchors?.['10'];
  if (!a || !t) return null;
  const img = p.rgb;
  const cx = (a[0] + (t[0] - a[0]) * 0.45) * img.width;
  const cy = (a[1] + (t[1] - a[1]) * 0.45) * img.height;
  const span = Math.abs(t[1] - a[1]) * img.height;
  const rad = Math.max(2, Math.round(span * 0.15));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = Math.round(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.round(cx - rad * 2); x <= cx + rad * 2; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const o = (y * img.width + x) * 3;
      rs.push(img.data[o]);
      gs.push(img.data[o + 1]);
      bs.push(img.data[o + 2]);
    }
  }
  return rs.length ? [median(rs), median(gs), median(bs)] : null;
}

/**
 * The hair area of a top or crown photo, scalp included: cells with some hair, plus cells
 * enclosed by hair (a thin patch the segmenter didn't call hair is still part of the head).
 */
function headArea(grid: HairGrid): boolean[] {
  const { cols, rows, values } = grid;
  const has = values.map((v) => v >= 0.15);
  const out = [...has];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (has[r * cols + c]) continue;
      let left = false;
      let right = false;
      let up = false;
      let down = false;
      for (let k = 0; k < c; k++) left ||= has[r * cols + k];
      for (let k = c + 1; k < cols; k++) right ||= has[r * cols + k];
      for (let k = 0; k < r; k++) up ||= has[k * cols + c];
      for (let k = r + 1; k < rows; k++) down ||= has[k * cols + c];
      if ((left && right && up) || (up && down && (left || right))) out[r * cols + c] = true;
    }
  }
  return out;
}

/**
 * Share of the head area whose colour is nearer the skin than the hair. The hair colour is taken
 * from the pixels least like skin, so it works even where little of the hair is thick. Null when
 * skin and hair are too alike to tell apart, or too little of the head is in view.
 */
export function showThrough(p: ViewPhoto, skin: [number, number, number]): number | null {
  const area = headArea(p.grid);
  const img = p.rgb;
  const { cols, rows } = p.grid;
  const stride = Math.max(2, Math.floor((img.width / WORK_WIDTH) * 2));
  const idx: number[] = [];
  const dist: number[] = [];
  for (let y = 0; y < img.height; y += stride) {
    const r = Math.min(rows - 1, Math.floor((y / img.height) * rows));
    for (let x = 0; x < img.width; x += stride) {
      const c = Math.min(cols - 1, Math.floor((x / img.width) * cols));
      if (!area[r * cols + c]) continue;
      const o = (y * img.width + x) * 3;
      idx.push(o);
      dist.push(Math.hypot(img.data[o] - skin[0], img.data[o + 1] - skin[1], img.data[o + 2] - skin[2]));
    }
  }
  if (idx.length < 300) return null;
  const cut = [...dist].sort((a, b) => a - b)[Math.floor(dist.length * 0.7)];
  const hr: number[] = [];
  const hg: number[] = [];
  const hb: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    if (dist[k] < cut) continue;
    hr.push(img.data[idx[k]]);
    hg.push(img.data[idx[k] + 1]);
    hb.push(img.data[idx[k] + 2]);
  }
  const hair = [median(hr), median(hg), median(hb)];
  const axis = [skin[0] - hair[0], skin[1] - hair[1], skin[2] - hair[2]];
  const len2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  if (len2 < 45 * 45) return null;
  let skinPx = 0;
  for (const o of idx) {
    const t = ((img.data[o] - hair[0]) * axis[0] + (img.data[o + 1] - hair[1]) * axis[1] + (img.data[o + 2] - hair[2]) * axis[2]) / len2;
    if (t > 0.5) skinPx++;
  }
  return skinPx / idx.length;
}

// ---------------------------------------------------------------------------------------------
// From numbers to readings

const reason = (r: string) => ({ value: null, reason: r }) as const;

export function curlFrom(local: number, cell: number): { value: CurlPattern; score: number } {
  // Curliness 0 (straight) to 1 (coily): low alignment close up and over a cell both mean the
  // strands turn a lot. Thresholds tuned on drawn strands, not yet on labelled photos.
  const score = clamp01(1 - (0.4 * local + 0.6 * cell));
  const value: CurlPattern = cell >= 0.75 ? 'straight' : cell >= 0.42 ? 'wavy' : 'curly';
  return { value, score };
}

function levelOf(x: number, some: number, high: number): Amount {
  return x >= high ? 'high' : x >= some ? 'some' : 'low';
}

function sure(score: number, enough: boolean): Sureness {
  return enough && score >= 80 ? 'fair' : 'rough';
}

/** Combines the photos into readings. Texture comes from the photos with the most hair in view. */
export function summarise(metrics: ViewMetrics[], density: DensityReading | null, hairState: HairState | null): Omit<HairAnalysis, 'analyser'> {
  const textured = metrics.filter((m) => m.interiorPx >= 2500);
  const caveats: string[] = [];
  if (hairState && !hairState.dry) caveats.push('Your hair was wet, which hides frizz and changes shine and curl.');
  if (hairState && !hairState.noProduct) caveats.push('Product can add shine and hide frizz, so those readings may be off.');

  const wsum = textured.reduce((s, m) => s + m.interiorPx, 0);
  const avg = (f: (m: ViewMetrics) => number) => (wsum > 0 ? textured.reduce((s, m) => s + f(m) * m.interiorPx, 0) / wsum : 0);
  const bestScore = textured.reduce((s, m) => Math.max(s, m.score), 0);
  const enough = wsum >= 12000;

  // Curl pattern.
  const fine = avg((m) => m.fine);
  const mid = avg((m) => m.mid);
  let curl: Reading<CurlPattern>;
  let definition: Reading<Definition> | null = null;
  if (!textured.length) curl = reason('Not enough hair filled the photos to read its pattern.');
  else if (fine < TEXTURE_FLOOR && mid < TEXTURE_FLOOR * 2) curl = reason('The strands didn’t show clearly. Very short hair, or a soft photo, can’t show a pattern.');
  else {
    const c = curlFrom(avg((m) => m.localCoherence), avg((m) => m.cellCoherence));
    curl = { value: c.value, score: c.score, sure: sure(bestScore, enough) };
    if (c.value !== 'straight') {
      const d = clamp01(mid / (mid + fine + 1e-6));
      definition = { value: d >= 0.62 ? 'clear' : d >= 0.5 ? 'fair' : 'fuzzy', score: d, sure: 'rough' };
    }
  }

  // Frizz, from the photos where the hair's edge could be seen against something else.
  const edged = metrics.filter((m) => m.edgeCells >= 4);
  let frizz: Reading<Amount>;
  if (!edged.length) frizz = reason('The edge of your hair didn’t stand out from the background. A plain wall helps.');
  else {
    const cells = edged.reduce((s, m) => s + m.edgeCells, 0);
    const f = edged.reduce((s, m) => s + m.frizz * m.edgeCells, 0) / cells;
    const score = clamp01((f - 0.03) / 0.17);
    frizz = { value: levelOf(score, 0.3, 0.65), score, sure: sure(edged.reduce((s, m) => Math.max(s, m.score), 0), cells >= 12) };
  }

  // Shine.
  let shine: Reading<Amount>;
  if (!textured.length) shine = reason('Not enough hair filled the photos.');
  else {
    const s = avg((m) => m.shine);
    shine = { value: levelOf(s, 0.12, 0.25), score: s, sure: 'rough' };
  }

  // Dryness: frizz and dullness together.
  let dryness: Reading<Amount>;
  if (frizz.value == null || shine.value == null) dryness = reason('Needs both the frizz and shine readings.');
  else {
    const d = clamp01(0.6 * frizz.score + 0.4 * (1 - clamp01(shine.score / 0.3)));
    dryness = { value: levelOf(d, 0.35, 0.65), score: d, sure: 'rough' };
  }

  // Greys.
  let greys: Reading<Greys>;
  if (!textured.length) greys = reason('Not enough hair filled the photos.');
  else {
    const L = avg((m) => m.hairL);
    const sat = avg((m) => m.hairSat);
    const g = avg((m) => m.greyShare);
    if (L > 140 && sat < 0.12) greys = { value: 'mostly', score: 1, sure: 'rough' };
    else if (L > 125) greys = reason('Hard to tell on light hair.');
    else greys = { value: g >= 0.06 ? 'lots' : g >= 0.02 ? 'some' : g >= 0.004 ? 'few' : 'none', score: clamp01(g / 0.15), sure: 'rough' };
  }

  const dens: HairAnalysis['density'] = density
    ? { value: density.level, score: density.showThrough, sure: density.sure, detail: density }
    : reason('Needs a clear front photo (for your skin tone) and a clear top or crown photo.');

  const quality = { curl, definition, frizz, shine, dryness, greys };
  return { version: HAIR_ANALYSIS_VERSION, score: hairScore(quality, density), quality, density: dens, caveats };
}

/**
 * The hair score: thickness (half of it), smoothness and shine, each 0 to 1, over whichever were
 * read. Curl pattern and greys don't count: neither is better or worse. Shown as a range, wider
 * when the readings are rough.
 */
export function hairScore(q: HairQuality, density: DensityReading | null): HairScore | null {
  const parts: HairScore['parts'] = [];
  const weights: number[] = [];
  if (density) {
    parts.push({ key: 'thickness', score: 1 - clamp01((density.showThrough - 0.05) / 0.4) });
    weights.push(0.5);
  }
  if (q.frizz.value != null) {
    parts.push({ key: 'smoothness', score: 1 - q.frizz.score });
    weights.push(0.25);
  }
  if (q.shine.value != null) {
    parts.push({ key: 'shine', score: clamp01(q.shine.score / 0.3) });
    weights.push(0.25);
  }
  if (parts.length < 2) return null;
  const wsum = weights.reduce((a, b) => a + b, 0);
  const value = Math.round((100 * parts.reduce((a, p, i) => a + p.score * weights[i], 0)) / wsum);
  const spread = density?.sure === 'fair' && parts.length === 3 ? 6 : 10;
  const label = value >= 80 ? 'Strong' : value >= 60 ? 'Good' : value >= 40 ? 'Fair' : 'Needs care';
  return { value, low: Math.max(0, value - spread), high: Math.min(100, value + spread), label, parts };
}

/** Show-through to a level. Under 10% is a thick head of hair; over 35% is plainly thin. */
export function densityLevel(st: number): Density {
  return st < 0.1 ? 'thick' : st < 0.2 ? 'normal' : st < 0.35 ? 'thinner' : 'thin';
}

export function measureDensity(photos: ViewPhoto[]): DensityReading | null {
  const front = photos.find((p) => p.view === 'front');
  const skin = front ? skinColour(front) : null;
  if (!skin) return null;
  const out: Partial<Record<'top' | 'crown', number>> = {};
  let best = 0;
  for (const view of ['top', 'crown'] as const) {
    const p = photos.find((x) => x.view === view);
    if (!p) continue;
    const st = showThrough(p, skin);
    if (st == null) continue;
    out[view] = st;
    best = Math.max(best, p.score);
  }
  const vals = Object.values(out);
  if (!vals.length) return null;
  // The thinner of the two is what matters (thinning usually starts in one place).
  const st = Math.max(...vals);
  return { showThrough: st, ...out, level: densityLevel(st), sure: vals.length === 2 && best >= 80 ? 'fair' : 'rough' };
}

function roundMetrics(m: ViewMetrics): ViewMetrics {
  const out = { ...m } as Record<string, unknown>;
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') out[k] = Math.round(v * 1000) / 1000;
  out.hairRgb = m.hairRgb.map((v) => Math.round(v));
  return out as unknown as ViewMetrics;
}

const isQualityView = (p: ViewPhoto) => p.view === 'front' || p.view === 'top' || p.view === 'crown';

export const ruleAnalyser: HairAnalyser = {
  id: 'rules-v1',
  analyse(photos, hairState) {
    const metrics = photos.filter(isQualityView).map(measureView);
    const density = measureDensity(photos);
    return { ...summarise(metrics, density, hairState), analyser: ruleAnalyser.id, metrics: metrics.map(roundMetrics) };
  },
  async analyseAsync(photos, hairState, pause) {
    const metrics: ViewMetrics[] = [];
    for (const p of photos.filter(isQualityView)) {
      const steps = measureViewSteps(p);
      for (;;) {
        const next = steps.next();
        if (next.done) {
          metrics.push(next.value);
          break;
        }
        await pause();
      }
    }
    await pause();
    const density = measureDensity(photos);
    return { ...summarise(metrics, density, hairState), analyser: ruleAnalyser.id, metrics: metrics.map(roundMetrics) };
  },
};

let active: HairAnalyser = ruleAnalyser;

export function hairAnalyser(): HairAnalyser {
  return active;
}

/** Swap in another analyser (a trained model later, or a fake in tests). */
export function setHairAnalyser(a: HairAnalyser) {
  active = a;
}

// ---------------------------------------------------------------------------------------------
// Words for the screens

export const CURL_LABEL: Record<CurlPattern, string> = { straight: 'Straight', wavy: 'Wavy', curly: 'Curly or coily' };
export const AMOUNT_LABEL: Record<Amount, string> = { low: 'Low', some: 'Some', high: 'High' };
export const DEFINITION_LABEL: Record<Definition, string> = { fuzzy: 'Fuzzy', fair: 'Some', clear: 'Clear' };
export const GREYS_LABEL: Record<Greys, string> = { none: 'None seen', few: 'A few', some: 'Some', lots: 'Lots', mostly: 'Mostly grey' };
export const DENSITY_LABEL: Record<Density, string> = { thick: 'Thick', normal: 'Normal', thinner: 'A bit thin', thin: 'Thin' };

export const HAIR_NOTE =
  'Read from your photos with simple rules, not yet checked against expert ratings. Light, product and wet hair change the readings, so compare scans taken the same way.';
