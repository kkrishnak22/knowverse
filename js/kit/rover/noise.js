// Small deterministic noise library for procedural worlds: seeded 2D simplex noise,
// 3D value noise, fractal sums, and tileable noise for repeating textures.

/** A seeded random number generator (mulberry32). Returns floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function createNoise(seed = 1) {
  const random = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  /** 2D simplex noise in about [-1, 1]. */
  function simplex2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    const corner = (gi, cx, cy) => {
      let tt = 0.5 - cx * cx - cy * cy;
      if (tt <= 0) return 0;
      tt *= tt;
      const g = GRAD2[gi & 7];
      return tt * tt * (g[0] * cx + g[1] * cy);
    };
    n += corner(p[ii + p[jj]], x0, y0);
    n += corner(p[ii + i1 + p[jj + j1]], x1, y1);
    n += corner(p[ii + 1 + p[jj + 1]], x2, y2);
    return 70 * n;
  }

  const hash3 = (i, j, k) => p[(p[(p[i & 255] + j) & 255] + k) & 255] / 255;

  /** 3D value noise in [0, 1]. Smooth, cheap; good for displacing rocks. */
  function value3(x, y, z) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const k = Math.floor(z);
    const u = fade(x - i);
    const v = fade(y - j);
    const w = fade(z - k);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c = (a, b, c2) => hash3(i + a, j + b, k + c2);
    return lerp(
      lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
      w,
    );
  }

  /** Fractal sum of simplex noise, about [-1, 1]. */
  function fbm2(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * simplex2(x, y);
      norm += amp;
      amp *= gain;
      x *= lacunarity;
      y *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged fractal noise in [0, 1]: sharp crests, like mountain ridges. */
  function ridged2(x, y, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(simplex2(x * freq, y * freq));
      n *= n;
      sum += n * amp * prev;
      prev = n;
      freq *= 2;
      amp *= 0.5;
    }
    return sum;
  }

  function fbm3(x, y, z, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * value3(x * freq, y * freq, z * freq);
      freq *= 2;
      amp *= 0.5;
    }
    return sum;
  }

  /** Value noise that repeats every `period` units in x and y, for seamless textures. */
  function tile2(x, y, period) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = fade(x - i);
    const v = fade(y - j);
    const h = (a, b) => hash3(((i + a) % period + period) % period, ((j + b) % period + period) % period, 17);
    const top = h(0, 0) + (h(1, 0) - h(0, 0)) * u;
    const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * u;
    return top + (bottom - top) * v;
  }

  function tileFbm(x, y, period, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * tile2(x * f, y * f, period * f);
      f *= 2;
      amp *= 0.5;
    }
    return sum;
  }

  return { simplex2, value3, fbm2, ridged2, fbm3, tile2, tileFbm };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
