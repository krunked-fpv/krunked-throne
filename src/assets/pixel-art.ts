import type { DrawCtx } from './fallback-fonts';

// ============================================================================
// COLOR MATH & HUE-SHIFTED PIXEL-ART RAMPS
// ============================================================================

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ColorRamp {
  out: string;   // Deep chromatic outline (shifted cool)
  dark2: string; // Deepest crevice shadow
  dark: string;  // Primary shadow tone
  base: string;  // Local midtone
  light: string; // Warm sunlit highlight
  hi: string;    // Crisp rim highlight
  spec: string;  // Brightest specular pixel
}

const HEX_CACHE = new Map<string, Rgb>();

export function parseHex(hex: string): Rgb {
  const cached = HEX_CACHE.get(hex);
  if (cached) return cached;
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const num = parseInt(clean.length === 3
    ? clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!
    : clean.slice(0, 6), 16);
  const rgb: Rgb = {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
  HEX_CACHE.set(hex, rgb);
  return rgb;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return '#' + ((1 << 24) | (cr << 16) | (cg << 8) | cb).toString(16).slice(1);
}

export function mixHex(hexA: string, hexB: string, t: number): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
  );
}

/**
 * Hue-shifted pixel-art shading:
 * - Negative delta darkens while shifting slightly toward deep cool indigo (#140c24)
 * - Positive delta brightens while shifting slightly toward sunlit warm cream (#fff2c2)
 */
export function shadeHex(hex: string, delta: number, coolTint = '#140c24', warmTint = '#fff0c4'): string {
  if (delta === 0) return hex;
  const c = parseHex(hex);
  if (delta < 0) {
    const k = Math.min(1, -delta);
    const cool = parseHex(coolTint);
    const r = c.r * (1 - k) + cool.r * k * 0.42;
    const g = c.g * (1 - k) + cool.g * k * 0.36;
    const b = c.b * (1 - k) + cool.b * k * 0.52;
    return rgbToHex(r, g, b);
  }
  const k = Math.min(1, delta);
  const warm = parseHex(warmTint);
  const r = c.r + (warm.r - c.r) * k;
  const g = c.g + (warm.g - c.g) * k;
  const b = c.b + (warm.b - c.b) * k * 0.88;
  return rgbToHex(r, g, b);
}

const RAMP_CACHE = new Map<string, ColorRamp>();

export function makeRamp(baseHex: string, outlineHex?: string): ColorRamp {
  const key = outlineHex ? `${baseHex}|${outlineHex}` : baseHex;
  const cached = RAMP_CACHE.get(key);
  if (cached) return cached;
  const ramp: ColorRamp = {
    out: outlineHex ?? shadeHex(baseHex, -0.78),
    dark2: shadeHex(baseHex, -0.56),
    dark: shadeHex(baseHex, -0.32),
    base: baseHex,
    light: shadeHex(baseHex, 0.28),
    hi: shadeHex(baseHex, 0.55),
    spec: shadeHex(baseHex, 0.80),
  };
  RAMP_CACHE.set(key, ramp);
  return ramp;
}

// ============================================================================
// DETERMINISTIC NOISE, BAYER 4x4 DITHERING & CELLULAR VORONOI
// ============================================================================

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Returns 0..15 Bayer ordered dither threshold for crisp retro pixel transitions. */
export function bayer4(x: number, y: number): number {
  return BAYER4[((y & 3) << 2) | (x & 3)]!;
}

/** Deterministic integer hash returning 0..1 float. */
export function hashF(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return (((n ^ (n >>> 16)) >>> 0) & 0xffff) / 65536;
}

/** Smooth periodic 2D value noise (tiles seamlessly at period `period` when period > 0). */
export function valueNoise2d(x: number, y: number, seed: number, period = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const wrap = (n: number): number => (period > 0 ? ((n % period) + period) % period : n);
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);
  const a = hashF(x0, y0, seed);
  const b = hashF(x1, y0, seed);
  const c = hashF(x0, y1, seed);
  const d = hashF(x1, y1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/** 3-octave tileable fractal Brownian motion returning 0..1. */
export function fbm2d(x: number, y: number, scale: number, seed: number, tileSize = 0): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1 / Math.max(1, scale);
  let norm = 0;
  for (let oct = 0; oct < 3; oct++) {
    const period = tileSize > 0 ? Math.max(1, Math.round(tileSize * freq)) : 0;
    const effFreq = tileSize > 0 ? period / tileSize : freq;
    sum += valueNoise2d(x * effFreq, y * effFreq, seed + oct * 97, period) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export interface VoronoiSample {
  /** Nearest cell feature distance */
  d1: number;
  /** Distance to nearest cell edge (d2 - d1): small near mortar seams / cracks! */
  edge: number;
  /** Deterministic cell ID 0..255 */
  cellId: number;
  /** Offset from pixel to cell center (for directional stone bevel lighting!) */
  dx: number;
  dy: number;
}

/**
 * Tileable 2D Cellular Voronoi sampler for carved flagstones, cracked mud,
 * basalt walls, and faceted crystals.
 */
export function voronoi2d(
  x: number,
  y: number,
  cellSize: number,
  seed: number,
  tileSpanCells = 0,
  jitter = 0.72,
): VoronoiSample {
  const gx = x / cellSize;
  const gy = y / cellSize;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let d1 = 999;
  let d2 = 999;
  let bestId = 0;
  let bestDx = 0;
  let bestDy = 0;

  const wrap = (n: number): number =>
    tileSpanCells > 0 ? ((n % tileSpanCells) + tileSpanCells) % tileSpanCells : n;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const wx = wrap(cx);
      const wy = wrap(cy);
      const px = cx + 0.5 + (hashF(wx, wy, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (hashF(wx, wy, seed + 53) - 0.5) * jitter;
      const dx = gx - px;
      const dy = gy - py;
      const dist = Math.hypot(dx, dy);
      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        bestId = Math.floor(hashF(wx, wy, seed + 131) * 255);
        bestDx = dx;
        bestDy = dy;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  return { d1, edge: d2 - d1, cellId: bestId, dx: bestDx, dy: bestDy };
}

// ============================================================================
// PXCANVAS: FAST INDEXED PIXEL-ART CANVAS WITH PRO POST-PROCESS SHADERS
// ============================================================================

export class PxCanvas {
  readonly w: number;
  readonly h: number;
  readonly pixels: Int16Array;
  private palette: string[] = ['']; // index 0 = transparent
  private colorToIdx = new Map<string, number>();

  constructor(w: number, h: number) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.pixels = new Int16Array(this.w * this.h);
  }

  clear(): void {
    this.pixels.fill(0);
  }

  private idx(color: string): number {
    if (!color) return 0;
    const existing = this.colorToIdx.get(color);
    if (existing !== undefined) return existing;
    const next = this.palette.length;
    this.palette.push(color);
    this.colorToIdx.set(color, next);
    return next;
  }

  set(x: number, y: number, color: string): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.pixels[iy * this.w + ix] = this.idx(color);
  }

  erase(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.pixels[iy * this.w + ix] = 0;
  }

  get(x: number, y: number): string {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return '';
    return this.palette[this.pixels[iy * this.w + ix]!] ?? '';
  }

  isOpaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.pixels[y * this.w + x]! > 0;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const c = this.idx(color);
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      const row = py * this.w;
      for (let px = x0; px < x1; px++) {
        this.pixels[row + px] = c;
      }
    }
  }

  ditherRect(x: number, y: number, w: number, h: number, colA: string, colB: string, ratio = 0.5): void {
    const cA = this.idx(colA);
    const cB = this.idx(colB);
    const thresh = Math.round(Math.max(0, Math.min(1, ratio)) * 16);
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      const row = py * this.w;
      for (let px = x0; px < x1; px++) {
        this.pixels[row + px] = bayer4(px, py) < thresh ? cB : cA;
      }
    }
  }

  /** Draws a beveled 3D pixel block with top/left highlight, bottom/right shadow & optional chamfer. */
  bevelBox(x: number, y: number, w: number, h: number, ramp: ColorRamp, chamfer = true): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(w);
    const ih = Math.round(h);
    if (iw <= 0 || ih <= 0) return;
    for (let dy = 0; dy < ih; dy++) {
      for (let dx = 0; dx < iw; dx++) {
        if (chamfer && iw >= 5 && ih >= 5) {
          const isCorner = (dx === 0 || dx === iw - 1) && (dy === 0 || dy === ih - 1);
          if (isCorner) continue;
        }
        let col = ramp.base;
        if (dy === 0) col = ramp.hi;
        else if (dy === 1 && dx < iw - 1) col = ramp.light;
        else if (dx === 0 && dy < ih - 1) col = ramp.light;
        else if (dy === ih - 1) col = ramp.dark2;
        else if (dx === iw - 1) col = ramp.dark;
        else if (dy === ih - 2) col = bayer4(ix + dx, iy + dy) < 8 ? ramp.dark : ramp.base;
        this.set(ix + dx, iy + dy, col);
      }
    }
  }

  /** Draws a crisp integer pixel ellipse filled with one color. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    if (rx <= 0 || ry <= 0) return;
    const c = this.idx(color);
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const invRx2 = 1 / (rx * rx);
    const invRy2 = 1 / (ry * ry);
    for (let py = y0; py <= y1; py++) {
      const dy = py - cy;
      const dyTerm = dy * dy * invRy2;
      if (dyTerm > 1.05) continue;
      const row = py * this.w;
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        if (dx * dx * invRx2 + dyTerm <= 1.0) {
          this.pixels[row + px] = c;
        }
      }
    }
  }

  /**
   * Draws a 3D top-left-lit volumetric pixel ellipsoid with Bayer-dithered terminator,
   * hue-shifted shadow crescent, warm midtone, and bright specular glint!
   */
  shadedEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ramp: ColorRamp,
    lightX = -0.52,
    lightY = -0.62,
  ): void {
    if (rx <= 0 || ry <= 0) return;
    const cDark2 = this.idx(ramp.dark2);
    const cDark = this.idx(ramp.dark);
    const cBase = this.idx(ramp.base);
    const cLight = this.idx(ramp.light);
    const cHi = this.idx(ramp.hi);
    const cSpec = this.idx(ramp.spec);

    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const invRx = 1 / rx;
    const invRy = 1 / ry;
    const lLen = Math.hypot(lightX, lightY, 0.58) || 1;
    const lx = lightX / lLen;
    const ly = lightY / lLen;
    const lz = 0.58 / lLen;

    for (let py = y0; py <= y1; py++) {
      const ny = (py - cy) * invRy;
      const ny2 = ny * ny;
      if (ny2 > 1.02) continue;
      const row = py * this.w;
      for (let px = x0; px <= x1; px++) {
        const nx = (px - cx) * invRx;
        const r2 = nx * nx + ny2;
        if (r2 > 1.0) continue;
        const nz = Math.sqrt(Math.max(0, 1 - r2));
        const ndl = nx * lx + ny * ly + nz * lz;
        const dither = (bayer4(px, py) / 16 - 0.5) * 0.14;
        const lum = ndl + dither;
        let ci: number;
        if (lum > 0.90 && rx >= 4 && ry >= 4) ci = cSpec;
        else if (lum > 0.72) ci = cHi;
        else if (lum > 0.44) ci = cLight;
        else if (lum > 0.12) ci = cBase;
        else if (lum > -0.22) ci = cDark;
        else ci = cDark2;
        this.pixels[row + px] = ci;
      }
    }
  }

  /**
   * Draws a 3D cylindrical capsule (limbs, horns, barrels, pipes, tails, logs)
   * with directional lighting across its cross-section.
   */
  shadedCapsule(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    ramp: ColorRamp,
  ): void {
    const rad = Math.max(0.75, r);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - rad - 1));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + rad + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - rad - 1));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + rad + 1));
    const abx = x1 - x0;
    const aby = y1 - y0;
    const abLenSq = abx * abx + aby * aby;

    const cDark2 = this.idx(ramp.dark2);
    const cDark = this.idx(ramp.dark);
    const cBase = this.idx(ramp.base);
    const cLight = this.idx(ramp.light);
    const cHi = this.idx(ramp.hi);

    for (let py = minY; py <= maxY; py++) {
      const row = py * this.w;
      for (let px = minX; px <= maxX; px++) {
        let t = 0;
        if (abLenSq > 0.0001) {
          t = Math.max(0, Math.min(1, ((px - x0) * abx + (py - y0) * aby) / abLenSq));
        }
        const nearX = x0 + abx * t;
        const nearY = y0 + aby * t;
        const dx = px - nearX;
        const dy = py - nearY;
        const dist = Math.hypot(dx, dy);
        if (dist > rad) continue;
        const nx = dx / rad;
        const ny = dy / rad;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, (dist / rad) ** 2)));
        const lum = nx * -0.45 + ny * -0.68 + nz * 0.56 + (bayer4(px, py) / 16 - 0.5) * 0.12;
        this.pixels[row + px] =
          lum > 0.74 ? cHi : lum > 0.42 ? cLight : lum > 0.10 ? cBase : lum > -0.22 ? cDark : cDark2;
      }
    }
  }

  /**
   * Draws an irregular organic shaded shape (rocks, moss tufts, bushes, slime, clouds, crags)
   * using angular harmonic perturbation — ZERO boxy ellipses!
   */
  organicBlob(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    seed: number,
    jagAmp: number,
    ramp: ColorRamp,
  ): void {
    const maxR = Math.max(rx, ry) * (1 + jagAmp) + 2;
    const x0 = Math.max(0, Math.floor(cx - maxR));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + maxR));
    const y0 = Math.max(0, Math.floor(cy - maxR));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + maxR));
    const p1 = hashF(seed, 1, 17) * Math.PI * 2;
    const p2 = hashF(seed, 2, 31) * Math.PI * 2;
    const p3 = hashF(seed, 3, 67) * Math.PI * 2;

    const cDark2 = this.idx(ramp.dark2);
    const cDark = this.idx(ramp.dark);
    const cBase = this.idx(ramp.base);
    const cLight = this.idx(ramp.light);
    const cHi = this.idx(ramp.hi);

    for (let py = y0; py <= y1; py++) {
      const ny = (py - cy) / Math.max(1, ry);
      const row = py * this.w;
      for (let px = x0; px <= x1; px++) {
        const nx = (px - cx) / Math.max(1, rx);
        const ang = Math.atan2(ny, nx);
        const deform =
          1 +
          jagAmp *
            (Math.sin(ang * 3 + p1) * 0.45 +
              Math.cos(ang * 5 + p2) * 0.35 +
              Math.sin(ang * 7 + p3) * 0.2);
        const d = Math.hypot(nx, ny) / deform;
        if (d > 1.0) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d * d));
        const grain = (hashF(px, py, seed + 19) - 0.5) * 0.16;
        const lum = nx * -0.45 + ny * -0.65 + nz * 0.55 + grain;
        this.pixels[row + px] =
          lum > 0.72 ? cHi : lum > 0.40 ? cLight : lum > 0.08 ? cBase : lum > -0.22 ? cDark : cDark2;
      }
    }
  }

  /**
   * Scanline-fills an arbitrary polygon with optional directional volumetric shading!
   */
  poly(pts: ReadonlyArray<readonly [number, number]>, colorOrRamp: string | ColorRamp): void {
    const n = pts.length;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[i]!;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.h - 1, Math.ceil(maxY));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const isRamp = typeof colorOrRamp !== 'string';
    const flatIdx = isRamp ? 0 : this.idx(colorOrRamp);
    const r = isRamp ? colorOrRamp : null;
    const cDark2 = r ? this.idx(r.dark2) : 0;
    const cDark = r ? this.idx(r.dark) : 0;
    const cBase = r ? this.idx(r.base) : 0;
    const cLight = r ? this.idx(r.light) : 0;
    const cHi = r ? this.idx(r.hi) : 0;

    const nodes: number[] = [];
    for (let py = yStart; py <= yEnd; py++) {
      nodes.length = 0;
      const sy = py + 0.5;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if ((yi <= sy && yj > sy) || (yj <= sy && yi > sy)) {
          nodes.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
        }
      }
      nodes.sort((a, b) => a - b);
      const row = py * this.w;
      const ty = (py - minY) / spanY;
      for (let k = 0; k + 1 < nodes.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(nodes[k]! - 0.5));
        const x1 = Math.min(this.w - 1, Math.floor(nodes[k + 1]! + 0.5));
        for (let px = x0; px <= x1; px++) {
          if (!isRamp) {
            this.pixels[row + px] = flatIdx;
          } else {
            const tx = (px - minX) / spanX;
            const lum = (1 - ty) * 0.65 + (1 - tx) * 0.35 + (bayer4(px, py) / 16 - 0.5) * 0.14;
            this.pixels[row + px] =
              lum > 0.84 ? cHi : lum > 0.62 ? cLight : lum > 0.36 ? cBase : lum > 0.18 ? cDark : cDark2;
          }
        }
      }
    }
  }

  /** Draws a crisp Bresenham pixel line of thickness `t`. */
  line(x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    const off = thickness > 1 ? Math.floor(thickness / 2) : 0;
    const c = this.idx(color);
    for (let step = 0; step <= dx + dy + 2; step++) {
      for (let ty = 0; ty < thickness; ty++) {
        const py = iy0 - off + ty;
        if (py < 0 || py >= this.h) continue;
        const row = py * this.w;
        for (let tx = 0; tx < thickness; tx++) {
          const px = ix0 - off + tx;
          if (px >= 0 && px < this.w) this.pixels[row + px] = c;
        }
      }
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        ix0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  /** Draws a quadratic Bezier curve with pixel crispness (horns, capes, scythes, vines, cracks). */
  bezier(
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
    color: string,
    thickness = 1,
  ): void {
    const steps = Math.max(8, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    let prevX = x0;
    let prevY = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const nx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const ny = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      this.line(prevX, prevY, nx, ny, color, thickness);
      prevX = nx;
      prevY = ny;
    }
  }

  /** Draws a jagged organic crack with optional sunlit lip edge. */
  crack(
    x: number,
    y: number,
    len: number,
    angle: number,
    seed: number,
    darkCol: string,
    hiCol?: string,
  ): void {
    let cx = x;
    let cy = y;
    let a = angle;
    for (let i = 0; i < len; i++) {
      if (hiCol) this.set(cx, cy - 1, hiCol);
      this.set(cx, cy, darkCol);
      a += (hashF(i, seed, 91) - 0.5) * 0.72;
      cx += Math.cos(a);
      cy += Math.sin(a);
    }
  }

  /** Draws an Odinfall-style layered pixel foliage/moss/scrub cluster. */
  leafTuft(cx: number, cy: number, r: number, seed: number, ramp: ColorRamp): void {
    const lobes = Math.max(3, Math.round(r * 1.1));
    // Dark base shadow cluster first
    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + hashF(i, seed, 11) * 0.6;
      const dist = r * (0.35 + hashF(i, seed, 23) * 0.45);
      this.ellipse(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist + 1, Math.max(1.5, r * 0.48), Math.max(1.2, r * 0.38), ramp.dark2);
    }
    // Mid-leaf volume
    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + hashF(i, seed, 37) * 0.5;
      const dist = r * (0.2 + hashF(i, seed, 41) * 0.42);
      this.ellipse(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, Math.max(1.3, r * 0.44), Math.max(1.1, r * 0.35), i % 2 === 0 ? ramp.base : ramp.dark);
    }
    // Top sunlit leaf crown highlights
    for (let i = 0; i < Math.max(2, Math.floor(lobes * 0.6)); i++) {
      const ox = (hashF(i, seed, 73) - 0.55) * r * 0.9;
      const oy = -r * (0.2 + hashF(i, seed, 83) * 0.45);
      this.ellipse(cx + ox, cy + oy, Math.max(1.1, r * 0.32), Math.max(0.9, r * 0.24), i === 0 ? ramp.hi : ramp.light);
    }
  }

  /**
   * POST-PROCESS: Wraps the ENTIRE assembled opaque silhouette in ONE clean 1px
   * pixel-art outline (with selective lighter outline on top-lit edges when `topOutlineColor` is provided!).
   * Eliminates internal overlapping-oval outlines forever!
   */
  outline(bottomOutlineColor = '#100b16', topOutlineColor?: string): void {
    const w = this.w;
    const h = this.h;
    const src = new Int16Array(this.pixels);
    const botIdx = this.idx(bottomOutlineColor);
    const topIdx = topOutlineColor ? this.idx(topOutlineColor) : botIdx;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (src[row + x]! > 0) continue;
        const n = y > 0 && src[row - w + x]! > 0;
        const s = y + 1 < h && src[row + w + x]! > 0;
        const l = x > 0 && src[row + x - 1]! > 0;
        const r = x + 1 < w && src[row + x + 1]! > 0;
        if (n || s || l || r) {
          // If touching only below/right (i.e. pixel is on top/left sunlit silhouette edge), use topOutlineColor
          const isTopLitEdge = (s || r) && !n;
          this.pixels[row + x] = isTopLitEdge ? topIdx : botIdx;
        }
      }
    }
  }

  /**
   * POST-PROCESS: Adds crisp 1px directional rim highlights along exposed top-left interior edges.
   */
  rimLight(color: string, onlyTop = true): void {
    const w = this.w;
    const h = this.h;
    const src = new Int16Array(this.pixels);
    const rimIdx = this.idx(color);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        if (src[row + x]! === 0) continue;
        const topEmpty = src[row - w + x]! === 0;
        const leftEmpty = src[row + x - 1]! === 0;
        if (topEmpty || (!onlyTop && leftEmpty)) {
          this.pixels[row + x] = rimIdx;
        }
      }
    }
  }

  /**
   * POST-PROCESS: Subtly darkens the bottommost pixels of a character/prop silhouette for grounding AO.
   */
  groundAO(color: string, rowsFromBottom = 2): void {
    const w = this.w;
    const h = this.h;
    const aoIdx = this.idx(color);
    let maxOpaqueY = -1;
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (this.pixels[row + x]! > 0) {
          maxOpaqueY = y;
          break;
        }
      }
      if (maxOpaqueY >= 0) break;
    }
    if (maxOpaqueY < 0) return;
    const startY = Math.max(0, maxOpaqueY - rowsFromBottom + 1);
    for (let y = startY; y <= maxOpaqueY; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (this.pixels[row + x]! > 0 && bayer4(x, y) < 9) {
          this.pixels[row + x] = aoIdx;
        }
      }
    }
  }

  /**
   * Flushes this pixel buffer onto a Canvas2D context using fast horizontal run-length batching.
   */
  flush(ctx: DrawCtx, dstX: number, dstY: number): void {
    const w = this.w;
    const h = this.h;
    const bx = dstX | 0;
    const by = dstY | 0;
    let lastColor = '';
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let x = 0;
      while (x < w) {
        const ci = this.pixels[row + x]!;
        if (ci === 0) {
          x++;
          continue;
        }
        let end = x + 1;
        while (end < w && this.pixels[row + end] === ci) {
          end++;
        }
        const col = this.palette[ci]!;
        if (col !== lastColor) {
          ctx.fillStyle = col;
          lastColor = col;
        }
        ctx.fillRect(bx + x, by + y, end - x, 1);
        x = end;
      }
    }
  }
}
