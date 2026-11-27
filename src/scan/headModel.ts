import type { HairGrid, ScanView } from '@modules/headmap';

/**
 * A simple 3D head, so the five scan photos can be mapped onto one scalp instead of laid side
 * by side. Each photo's camera is worked out on its own:
 *
 * - Front and temple photos: from the face landmarks saved with the photo, fitted to where those
 *   landmarks sit on an average head (an affine camera, least squares). So the hairline in the
 *   front photo and in each temple photo lands on the same place on the scalp.
 * - Top and crown photos (no face to fit): the camera direction comes from how the photo is
 *   taken (head tilted 60 degrees down; phone above and behind the head), and the position and
 *   size come from where the hair sits in the photo.
 *
 * Head coordinates are millimetres with the origin between the pupils: X towards your left,
 * Y up, Z forward out of the face. The scalp is an ellipsoid of average head size.
 */
export type Vec3 = [number, number, number];

/** Average positions of the saved landmarks (MediaPipe indices), in head coordinates. */
export const ANCHOR_MODEL: Record<number, Vec3> = {
  468: [-31.5, 0, 0], // your right iris
  473: [31.5, 0, 0], // your left iris
  9: [0, 14, 6], // glabella
  1: [0, -40, 20], // nose tip
  152: [0, -100, 0], // chin
  234: [-72, -18, -60], // right edge of the face
  454: [72, -18, -60], // left edge of the face
  10: [0, 58, -2], // top of the forehead
};

/** The scalp: an ellipsoid about 156 mm wide, 204 mm front to back, its top 127 mm above the eyes. */
export const HEAD = { centre: [0, 5, -92] as Vec3, radii: [78, 122, 102] as Vec3 };

/** The map runs from the top of the head (centre) down to this angle from vertical (edge). */
export const MAP_THETA_MAX = (105 * Math.PI) / 180;

/** Image = M · P + t, in pixels of the photo. */
export interface Camera {
  m: [Vec3, Vec3];
  t: [number, number];
  /** Unit vector from the head towards the camera. */
  toCamera: Vec3;
  /** Photo size in pixels. */
  width: number;
  height: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Solves a 4x4 linear system (Gaussian elimination with pivoting). Null if singular. */
function solve4(a: number[][], b: number[]): number[] | null {
  const n = 4;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Fits a face photo's camera to its landmarks. `anchors` are normalised 0..1 positions keyed
 * by landmark index, as saved with the scan. Null when too few landmarks or a poor fit.
 */
export function fitFaceCamera(anchors: Record<string, [number, number]>, width: number, height: number): Camera | null {
  const pts = Object.entries(anchors)
    .map(([k, uv]) => ({ P: ANCHOR_MODEL[Number(k)], u: uv[0] * width, v: uv[1] * height }))
    .filter((p) => !!p.P);
  if (pts.length < 5) return null;
  const ata = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const atu = [0, 0, 0, 0];
  const atv = [0, 0, 0, 0];
  for (const { P, u, v } of pts) {
    const row = [P[0], P[1], P[2], 1];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) ata[i][j] += row[i] * row[j];
      atu[i] += row[i] * u;
      atv[i] += row[i] * v;
    }
  }
  const ru = solve4(ata, atu);
  const rv = solve4(ata, atv);
  if (!ru || !rv) return null;
  const m: [Vec3, Vec3] = [
    [ru[0], ru[1], ru[2]],
    [rv[0], rv[1], rv[2]],
  ];
  const t: [number, number] = [ru[3], rv[3]];
  // Reject fits whose landmarks land far from where they were seen (in pupil distances).
  const ipd = Math.hypot(...m[0]) * 63;
  let err = 0;
  for (const { P, u, v } of pts) err += Math.hypot(dot(m[0], P) + t[0] - u, dot(m[1], P) + t[1] - v) ** 2;
  if (!(ipd > 0) || Math.sqrt(err / pts.length) > 0.35 * ipd) return null;
  // The camera looks along the cross product of the rows; the face (and nose) points at it.
  let toCamera = norm(cross(m[0], m[1]));
  if (toCamera[2] < 0) toCamera = [-toCamera[0], -toCamera[1], -toCamera[2]];
  return { m, t, toCamera, width, height };
}

/** How the top and crown photos are taken, as the camera's elevation above the head's horizon. */
export const BACK_VIEWS: Record<'top' | 'crown', { elevationDeg: number; behind: boolean }> = {
  // Head tilted 60 degrees down, phone at eye level in front: the camera sees the top and front.
  top: { elevationDeg: 60, behind: false },
  // Phone held above and behind the head, rear camera pointing at the crown.
  crown: { elevationDeg: 45, behind: true },
};

/**
 * The camera of a top or crown photo, at unit scale and no offset: image right is your right
 * (mirrored front camera and rear camera alike), image down is down the photo.
 */
export function backCameraAxes(view: 'top' | 'crown'): { m: [Vec3, Vec3]; toCamera: Vec3 } {
  const { elevationDeg, behind } = BACK_VIEWS[view];
  const e = (elevationDeg * Math.PI) / 180;
  const z = behind ? -1 : 1;
  const toCamera: Vec3 = [0, Math.sin(e), z * Math.cos(e)];
  // Up in the photo: perpendicular to the view, in the head's mid-plane.
  const up: Vec3 = [0, Math.cos(e), -z * Math.sin(e)];
  return { m: [[-1, 0, 0], [-up[0], -up[1], -up[2]]], toCamera };
}

/** A point on the scalp for map coordinates (-1..1, forehead at the top, your left on the left). */
export function scalpPoint(mx: number, my: number): { p: Vec3; n: Vec3; theta: number; phi: number } | null {
  const r = Math.hypot(mx, my);
  if (r > 1) return null;
  const theta = r * MAP_THETA_MAX;
  // phi: 0 at the front, positive towards your left, ±180 at the back.
  const phi = r > 1e-9 ? Math.atan2(-mx, -my) : 0;
  const s = Math.sin(theta);
  const [cx, cy, cz] = HEAD.centre;
  const [a, b, c] = HEAD.radii;
  const local: Vec3 = [a * s * Math.sin(phi), b * Math.cos(theta), c * s * Math.cos(phi)];
  const p: Vec3 = [cx + local[0], cy + local[1], cz + local[2]];
  const n = norm([local[0] / (a * a), local[1] / (b * b), local[2] / (c * c)]);
  return { p, n, theta, phi };
}

export function project(cam: Pick<Camera, 'm' | 't'>, p: Vec3): [number, number] {
  return [dot(cam.m[0], p) + cam.t[0], dot(cam.m[1], p) + cam.t[1]];
}

/** Where hair usually grows on the head: above the hairline at the front, above the ears elsewhere. */
export function typicalHair(p: Vec3): boolean {
  return p[1] > 40 || p[2] < -40;
}

/** Points all over the head surface, for fitting the top and crown cameras. */
const HEAD_SAMPLES: { p: Vec3; n: Vec3; hair: boolean; area: number }[] = (() => {
  const out: { p: Vec3; n: Vec3; hair: boolean; area: number }[] = [];
  const [cx, cy, cz] = HEAD.centre;
  const [a, b, c] = HEAD.radii;
  for (let i = 0; i < 36; i++) {
    const theta = ((i + 0.5) / 36) * Math.PI;
    for (let j = 0; j < 72; j++) {
      const phi = ((j + 0.5) / 72) * 2 * Math.PI;
      const local: Vec3 = [a * Math.sin(theta) * Math.sin(phi), b * Math.cos(theta), c * Math.sin(theta) * Math.cos(phi)];
      const p: Vec3 = [cx + local[0], cy + local[1], cz + local[2]];
      // Samples are even in angle, so weight each by the surface area it stands for.
      out.push({ p, n: norm([local[0] / (a * a), local[1] / (b * b), local[2] / (c * c)]), hair: typicalHair(p), area: Math.sin(theta) });
    }
  }
  return out;
})();

/**
 * Places a top or crown camera so a typical head of hair, seen from that direction, lines up
 * with the hair in the photo: the same centre and the same width (moment matching), counting
 * only what falls inside the photo. Starts from the framing the on-screen guide asks for.
 * Null when the photo shows little hair.
 */
export function fitBackCamera(view: 'top' | 'crown', grid: HairGrid, width: number, height: number): Camera | null {
  const { m, toCamera } = backCameraAxes(view);
  // The outline of the hair in the photo: each row filled from its leftmost to its rightmost
  // hair, so thinning or a bald patch inside the outline doesn't move the camera.
  let w = 0;
  let hu = 0;
  let hv = 0;
  let huu = 0;
  let hairCells = 0;
  for (let r = 0; r < grid.rows; r++) {
    let first = -1;
    let last = -1;
    for (let c = 0; c < grid.cols; c++) {
      if ((grid.values[r * grid.cols + c] ?? 0) < 0.3) continue;
      hairCells++;
      if (first < 0) first = c;
      last = c;
    }
    if (first < 0) continue;
    const v = ((r + 0.5) / grid.rows) * height;
    for (let c = first; c <= last; c++) {
      const u = ((c + 0.5) / grid.cols) * width;
      w += 1;
      hu += u;
      hv += v;
      huu += u * u;
    }
  }
  if (hairCells < grid.cols * grid.rows * 0.05) return null;
  const cu = hu / w;
  const cv = hv / w;
  const sdHair = Math.sqrt(Math.max(1e-9, huu / w - cu * cu));
  const visible = HEAD_SAMPLES.filter((s) => s.hair && dot(s.n, toCamera) > 0);
  // Start: the head about 55% of the photo wide, centred where the guide is.
  let k = (0.55 * width) / (2 * HEAD.radii[0]);
  const top: Vec3 = [HEAD.centre[0], HEAD.centre[1] + HEAD.radii[1] * 0.6, HEAD.centre[2]];
  let t: [number, number] = [0.5 * width - k * dot(m[0], top), 0.45 * height - k * dot(m[1], top)];
  for (let iter = 0; iter < 12; iter++) {
    let n = 0;
    let su = 0;
    let sv = 0;
    let suu = 0;
    for (const s of visible) {
      const u = k * dot(m[0], s.p) + t[0];
      const v = k * dot(m[1], s.p) + t[1];
      if (u < 0 || v < 0 || u >= width || v >= height) continue;
      // Same footing as the photo: weight by the area it covers on screen.
      const f = dot(s.n, toCamera) * s.area;
      n += f;
      su += f * u;
      sv += f * v;
      suu += f * u * u;
    }
    if (n <= 0) return null;
    const mu = su / n;
    const mv = sv / n;
    const sd = Math.sqrt(Math.max(1e-9, suu / n - mu * mu));
    const ratio = Math.min(1.5, Math.max(0.67, sdHair / sd));
    // Scale about the current hair centre, then move the centre onto the photo's.
    t = [mu - ratio * (mu - t[0]) + (cu - mu), mv - ratio * (mv - t[1]) + (cv - mv)];
    k *= ratio;
  }
  return {
    m: [
      [m[0][0] * k, m[0][1] * k, m[0][2] * k],
      [m[1][0] * k, m[1][1] * k, m[1][2] * k],
    ],
    t,
    toCamera,
    width,
    height,
  };
}

/** What the map needs from one photo of a scan. */
export interface MapSource {
  view: ScanView;
  camera: Camera;
  hairGrid?: HairGrid;
}

export interface SavedView {
  hairGrid?: HairGrid;
  anchors?: Record<string, [number, number]>;
  frameSize?: [number, number];
  score: number;
}

/** Cameras for every photo in a scan that can be placed on the head. */
export function mapSources(views: Partial<Record<ScanView, SavedView>>, minScore = 0): MapSource[] {
  const out: MapSource[] = [];
  for (const view of Object.keys(views) as ScanView[]) {
    const v = views[view];
    if (!v || v.score < minScore || !v.frameSize) continue;
    const [w, h] = v.frameSize;
    const camera =
      view === 'top' || view === 'crown'
        ? v.hairGrid
          ? fitBackCamera(view, v.hairGrid, w, h)
          : null
        : v.anchors
          ? fitFaceCamera(v.anchors, w, h)
          : null;
    if (camera) out.push({ view, camera, hairGrid: v.hairGrid });
  }
  return out;
}

/**
 * Why each photo of a scan could or couldn't be placed on the head, in a few words. Shown when
 * the map is empty, so a problem is visible instead of a silent blank map.
 */
export function placementReport(views: Partial<Record<ScanView, SavedView>>): string[] {
  const out: string[] = [];
  for (const view of Object.keys(views) as ScanView[]) {
    const v = views[view];
    if (!v) continue;
    const back = view === 'top' || view === 'crown';
    const missing = [
      !v.frameSize && 'size',
      back ? !v.hairGrid && 'hair map' : !v.anchors && 'face points',
    ].filter(Boolean);
    if (missing.length) {
      out.push(`${view}: no ${missing.join(' or ')}`);
      continue;
    }
    const [w, h] = v.frameSize!;
    const placed = back ? (v.hairGrid ? fitBackCamera(view, v.hairGrid, w, h) : null) : fitFaceCamera(v.anchors!, w, h);
    out.push(`${view}: ${placed ? 'placed' : back ? 'too little hair seen' : 'face points did not fit'}`);
  }
  return out;
}

/** How much a photo counts for a scalp point: facing the camera and inside the photo. */
export function viewWeight(cam: Camera, p: Vec3, n: Vec3): { w: number; u: number; v: number } | null {
  const facing = dot(n, cam.toCamera);
  if (facing <= 0.15) return null;
  const [u, v] = project(cam, p);
  if (u < 0 || v < 0 || u >= cam.width || v >= cam.height) return null;
  // Fade out near the photo's edges so seams blend.
  const edge = Math.min(u, v, cam.width - u, cam.height - v) / (0.08 * Math.min(cam.width, cam.height));
  return { w: facing ** 3 * Math.min(1, edge), u, v };
}

export function sampleGrid(grid: HairGrid, u: number, v: number): number {
  const x = Math.min(grid.cols - 1, Math.max(0, u * grid.cols - 0.5));
  const y = Math.min(grid.rows - 1, Math.max(0, v * grid.rows - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const g = (c: number, r: number) => grid.values[r * grid.cols + c] ?? 0;
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
}

/** Map zones by where they sit on the head. */
export type MapZone = 'front' | 'leftTemple' | 'rightTemple' | 'top' | 'crown';
export const MAP_ZONE_LABEL: Record<MapZone, string> = {
  front: 'Front',
  leftTemple: 'Left side',
  rightTemple: 'Right side',
  top: 'Top',
  crown: 'Crown',
};
/** Boundaries, in degrees: the top cap, the front sector, and where the sides end at the back. */
export const ZONE_EDGES = { topTheta: 45, frontPhi: 35, sidePhi: 110 };

export function zoneAt(theta: number, phi: number): MapZone {
  const t = (theta * 180) / Math.PI;
  const f = (phi * 180) / Math.PI;
  if (Math.abs(f) > ZONE_EDGES.sidePhi && t > 15) return 'crown';
  if (t < ZONE_EDGES.topTheta) return 'top';
  if (Math.abs(f) <= ZONE_EDGES.frontPhi) return 'front';
  return f > 0 ? 'leftTemple' : 'rightTemple';
}

export interface HairMap {
  size: number;
  /** Hair coverage per map cell (0..1), or -1 where no photo reaches. Row-major. */
  hair: number[];
  /** Which photo counted most at each cell, or null. */
  source: (ScanView | null)[];
  /** Mean hair coverage per zone, over the cells photos reach. Null when a zone is not covered. */
  zones: Record<MapZone, number | null>;
}

/** The hair the camera saw, mapped onto the scalp. Cheap: works on the saved hair grids only. */
export function hairMap(sources: MapSource[], size = 48): HairMap {
  const hair: number[] = new Array(size * size).fill(-1);
  const source: (ScanView | null)[] = new Array(size * size).fill(null);
  const sums: Record<MapZone, [number, number]> = { front: [0, 0], leftTemple: [0, 0], rightTemple: [0, 0], top: [0, 0], crown: [0, 0] };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const s = scalpPoint(((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
      if (!s) continue;
      let w = 0;
      let h = 0;
      let best = 0;
      for (const src of sources) {
        if (!src.hairGrid) continue;
        const vw = viewWeight(src.camera, s.p, s.n);
        if (!vw) continue;
        w += vw.w;
        h += vw.w * sampleGrid(src.hairGrid, vw.u / src.camera.width, vw.v / src.camera.height);
        if (vw.w > best) {
          best = vw.w;
          source[j * size + i] = src.view;
        }
      }
      if (w <= 0) continue;
      const val = h / w;
      hair[j * size + i] = val;
      const z = sums[zoneAt(s.theta, s.phi)];
      z[0] += val;
      z[1] += 1;
    }
  }
  const zones = Object.fromEntries(
    (Object.keys(sums) as MapZone[]).map((k) => [k, sums[k][1] >= 3 ? sums[k][0] / sums[k][1] : null]),
  ) as Record<MapZone, number | null>;
  return { size, hair, source, zones };
}

/** An RGB photo, row-major, 3 bytes a pixel. */
export interface Rgb {
  width: number;
  height: number;
  data: Uint8Array;
}

function sampleRgb(img: Rgb, u: number, v: number, out: number[]) {
  const x = Math.min(img.width - 1.001, Math.max(0, u - 0.5));
  const y = Math.min(img.height - 1.001, Math.max(0, v - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * img.width + x0) * 3;
  const i10 = i00 + 3;
  const i01 = i00 + img.width * 3;
  const i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    out[c] =
      (img.data[i00 + c] * (1 - fx) + img.data[i10 + c] * fx) * (1 - fy) + (img.data[i01 + c] * (1 - fx) + img.data[i11 + c] * fx) * fy;
  }
}

/**
 * The photos themselves mapped onto the scalp: every map pixel takes its colour from the photos
 * that face that point, blended by how squarely each one sees it. `photos` are the decoded
 * photos (any size: the camera is scaled to fit). Outside the head is `background`.
 */
export function renderScalp(
  sources: MapSource[],
  photos: Partial<Record<ScanView, Rgb>>,
  size: number,
  background: [number, number, number] = [23, 30, 28],
): Rgb {
  const data = new Uint8Array(size * size * 3);
  const px = [0, 0, 0];
  const used = sources.filter((s) => photos[s.view]);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 3;
      const s = scalpPoint(((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let w = 0;
      if (s) {
        for (const src of used) {
          const vw = viewWeight(src.camera, s.p, s.n);
          if (!vw) continue;
          const img = photos[src.view]!;
          sampleRgb(img, (vw.u / src.camera.width) * img.width, (vw.v / src.camera.height) * img.height, px);
          r += vw.w * px[0];
          g += vw.w * px[1];
          b += vw.w * px[2];
          w += vw.w;
        }
      }
      if (w > 0) {
        data[o] = r / w;
        data[o + 1] = g / w;
        data[o + 2] = b / w;
      } else {
        data[o] = background[0];
        data[o + 1] = background[1];
        data[o + 2] = background[2];
      }
    }
  }
  return { width: size, height: size, data };
}

/** A 24-bit BMP of an RGB image: no encoder needed, and both platforms' image views read it. */
export function encodeBmp(img: Rgb): Uint8Array {
  const rowSize = Math.ceil((img.width * 3) / 4) * 4;
  const dataSize = rowSize * img.height;
  const out = new Uint8Array(54 + dataSize);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, 54 + dataSize, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, img.width, true);
  dv.setInt32(22, -img.height, true); // top-down rows
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, dataSize, true);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 3;
      const d = 54 + y * rowSize + x * 3;
      out[d] = img.data[s + 2];
      out[d + 1] = img.data[s + 1];
      out[d + 2] = img.data[s];
    }
  }
  return out;
}

/** Map coordinates (-1..1) of a point given by its angle from the top and its direction. */
export function mapXY(thetaDeg: number, phiDeg: number): [number, number] {
  const r = (thetaDeg * Math.PI) / 180 / MAP_THETA_MAX;
  const f = (phiDeg * Math.PI) / 180;
  return [-r * Math.sin(f), -r * Math.cos(f)];
}
