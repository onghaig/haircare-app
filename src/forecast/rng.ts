/**
 * Small, fast, seedable PRNG (xoshiro128**) with standard-normal draws.
 * Seeded so a forecast is reproducible: the same inputs always give the same numbers,
 * which keeps the reveal and the monthly "forecast then vs now" stable.
 */
export class Rng {
  private s = new Uint32Array(4);
  private spare: number | null = null;

  constructor(seed: number) {
    // splitmix32 to spread the seed over the state
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
    if (this.s.every((v) => v === 0)) this.s[0] = 1;
  }

  /** Uniform in [0, 1). */
  uniform(): number {
    const s = this.s;
    const r = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return r / 4294967296;
  }

  /** Standard normal (Box-Muller, polar form). */
  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let q = 0;
    do {
      u = this.uniform() * 2 - 1;
      v = this.uniform() * 2 - 1;
      q = u * u + v * v;
    } while (q === 0 || q >= 1);
    const m = Math.sqrt((-2 * Math.log(q)) / q);
    this.spare = v * m;
    return u * m;
  }

  /**
   * Fill a new array with n standard-normal draws. Bulk version with the generator state held
   * in locals: several times faster than calling normal() in a loop, which matters for the
   * forecast's 200k-sample draws on a phone.
   */
  normals(n: number, mean = 0): Float64Array {
    const a = new Float64Array(n);
    const st = this.s;
    let s0 = st[0], s1 = st[1], s2 = st[2], s3 = st[3];
    let i = 0;
    if (this.spare !== null && n > 0) {
      a[i++] = mean + this.spare;
      this.spare = null;
    }
    while (i < n) {
      let u = 0;
      let v = 0;
      let q = 0;
      do {
        // two xoshiro128** steps, inlined
        let r = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
        let t = (s1 << 9) >>> 0;
        s2 = (s2 ^ s0) >>> 0; s3 = (s3 ^ s1) >>> 0; s1 = (s1 ^ s2) >>> 0; s0 = (s0 ^ s3) >>> 0;
        s2 = (s2 ^ t) >>> 0; s3 = rotl(s3, 11);
        u = (r / 4294967296) * 2 - 1;
        r = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
        t = (s1 << 9) >>> 0;
        s2 = (s2 ^ s0) >>> 0; s3 = (s3 ^ s1) >>> 0; s1 = (s1 ^ s2) >>> 0; s0 = (s0 ^ s3) >>> 0;
        s2 = (s2 ^ t) >>> 0; s3 = rotl(s3, 11);
        v = (r / 4294967296) * 2 - 1;
        q = u * u + v * v;
      } while (q === 0 || q >= 1);
      const m = Math.sqrt((-2 * Math.log(q)) / q);
      a[i++] = mean + u * m;
      if (i < n) a[i++] = mean + v * m;
    }
    st[0] = s0; st[1] = s1; st[2] = s2; st[3] = s3;
    return a;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
