import type { HairGrid } from '@modules/headmap';
import { ANCHOR_MODEL, HEAD, type Rgb, type Vec3 } from '@/scan/headModel';

/**
 * A synthetic head for tests: a known pattern painted on the scalp, photographed by known
 * cameras, so a rebuilt scalp map can be checked against the truth.
 */
export function texture(p: Vec3): [number, number, number] {
  return [128 + 90 * Math.sin(p[0] / 18), 128 + 90 * Math.sin(p[2] / 21), 128 + 90 * Math.cos(p[1] / 16)];
}

/** Bald on top above this height (mm above the eyes); hair below it except the face. */
export function isHair(p: Vec3, baldAbove = Infinity): boolean {
  return (p[1] > 40 || p[2] < -40) && !(p[1] > baldAbove && p[2] > -150);
}

export interface SynthCamera {
  /** Rows of the 2x3 projection, pixels per mm. */
  m: [Vec3, Vec3];
  t: [number, number];
  width: number;
  height: number;
  /** Unit vector from the head towards the camera. */
  d: Vec3;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** An orthographic camera from yaw/pitch (degrees), scale and image size; mirrored like the front camera. */
export function synthCamera(
  yawDeg: number,
  pitchDeg: number,
  scale: number,
  width: number,
  height: number,
  { centre = [0, 20, -60] as Vec3, mirror = true } = {},
): SynthCamera {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  // Direction to the camera: yaw turns towards your left (+X), pitch raises it.
  const d: Vec3 = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
  // Image right: the camera's own right, or flipped for a mirrored (front camera) photo.
  const k = mirror ? -1 : 1;
  const right: Vec3 = [k * Math.cos(y), 0, -k * Math.sin(y)];
  // Image up: the head's up direction, made perpendicular to the view.
  const up: Vec3 = [-Math.sin(p) * d[0], 1 - Math.sin(p) * d[1], -Math.sin(p) * d[2]];
  const upN = Math.hypot(...up);
  const upU: Vec3 = [up[0] / upN, up[1] / upN, up[2] / upN];
  const m: [Vec3, Vec3] = [
    [right[0] * scale, right[1] * scale, right[2] * scale],
    [-upU[0] * scale, -upU[1] * scale, -upU[2] * scale],
  ];
  const t: [number, number] = [width / 2 - dot(m[0], centre), height / 2 - dot(m[1], centre)];
  return { m, t, width, height, d };
}

/** Renders the scalp ellipsoid as the camera sees it, plus its hair grid and the face anchors. */
export function photograph(cam: SynthCamera, baldAbove = Infinity) {
  const [m0, m1] = cam.m;
  const d = cam.d;
  // Pseudo-inverse for a point on the image plane through the head.
  const a = dot(m0, m0), b = dot(m0, m1), c = dot(m1, m1);
  const det = a * c - b * b;
  const data = new Uint8Array(cam.width * cam.height * 3);
  const hair = new Float32Array(cam.width * cam.height);
  const [cx, cy, cz] = HEAD.centre;
  const [ra, rb, rc] = HEAD.radii;
  for (let v = 0; v < cam.height; v++) {
    for (let u = 0; u < cam.width; u++) {
      const du = u + 0.5 - cam.t[0];
      const dv = v + 0.5 - cam.t[1];
      const k0 = (c * du - b * dv) / det;
      const k1 = (a * dv - b * du) / det;
      const p0: Vec3 = [m0[0] * k0 + m1[0] * k1, m0[1] * k0 + m1[1] * k1, m0[2] * k0 + m1[2] * k1];
      // Intersect p0 + s*d with the ellipsoid; take the side facing the camera.
      const q: Vec3 = [(p0[0] - cx) / ra, (p0[1] - cy) / rb, (p0[2] - cz) / rc];
      const e: Vec3 = [d[0] / ra, d[1] / rb, d[2] / rc];
      const A = dot(e, e), B = 2 * dot(q, e), C = dot(q, q) - 1;
      const disc = B * B - 4 * A * C;
      const o = (v * cam.width + u) * 3;
      if (disc < 0) continue;
      const s = (-B + Math.sqrt(disc)) / (2 * A);
      const p: Vec3 = [p0[0] + s * d[0], p0[1] + s * d[1], p0[2] + s * d[2]];
      const col = texture(p);
      data[o] = col[0];
      data[o + 1] = col[1];
      data[o + 2] = col[2];
      hair[v * cam.width + u] = isHair(p, baldAbove) ? 1 : 0;
    }
  }
  const cols = 24, rows = 32;
  const values: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      let sum = 0, n = 0;
      for (let v = Math.floor((r * cam.height) / rows); v < Math.floor(((r + 1) * cam.height) / rows); v++) {
        for (let u = Math.floor((cc * cam.width) / cols); u < Math.floor(((cc + 1) * cam.width) / cols); u++) {
          sum += hair[v * cam.width + u];
          n++;
        }
      }
      values.push(n ? sum / n : 0);
    }
  }
  const grid: HairGrid = { cols, rows, values };
  const anchors: Record<string, [number, number]> = {};
  for (const [k, P] of Object.entries(ANCHOR_MODEL)) {
    anchors[k] = [(dot(m0, P) + cam.t[0]) / cam.width, (dot(m1, P) + cam.t[1]) / cam.height];
  }
  const photo: Rgb = { width: cam.width, height: cam.height, data };
  return { photo, grid, anchors, frameSize: [cam.width, cam.height] as [number, number] };
}

const SHOTS: Record<string, () => SynthCamera> = {
  front: () => synthCamera(0, 0, 1.6, 240, 427, { centre: [0, 10, 0] }),
  leftTemple: () => synthCamera(-45, 0, 1.6, 240, 427, { centre: [0, 10, 0] }),
  rightTemple: () => synthCamera(45, 0, 1.6, 240, 427, { centre: [0, 10, 0] }),
  top: () => synthCamera(0, 60, 1.2, 240, 427, { centre: [0, 80, -80] }),
  crown: () => synthCamera(180, 45, 1.2, 240, 427, { centre: [0, 80, -120], mirror: false }),
};

const cache = new Map<string, ReturnType<typeof photograph>>();

/** The five photos of the synthetic head, taken the way the scan takes them. */
export function synthShots(baldAbove = Infinity) {
  return Object.fromEntries(
    Object.entries(SHOTS).map(([v, cam]) => {
      const key = `${v}:${baldAbove}`;
      if (!cache.has(key)) cache.set(key, photograph(cam(), baldAbove));
      return [v, cache.get(key)!];
    }),
  ) as Record<'front' | 'leftTemple' | 'rightTemple' | 'top' | 'crown', ReturnType<typeof photograph>>;
}

/** Scan record views for the synthetic head (what a real scan saves), optionally bald on top. */
export function synthViews(id: string, { baldAbove = Infinity, score = 90 } = {}) {
  return Object.fromEntries(
    Object.entries(synthShots(baldAbove)).map(([v, s]) => [
      v,
      {
        uri: `file:///scans/${id}/${v}.jpg`,
        score,
        hairGrid: s.grid,
        frameSize: s.frameSize,
        ...(v === 'top' || v === 'crown' ? {} : { anchors: s.anchors }),
      },
    ]),
  );
}
