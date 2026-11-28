export type GlowCanvas = HTMLCanvasElement | OffscreenCanvas;
type GlowCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const GLOW_BUCKETS = [8, 16, 24, 32, 48, 64, 96, 128] as const;

function createGlowSurface(w: number, h: number): GlowCanvas | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  return null;
}

/**
 * Crisp 1x integer-pixel filled disc (scanline spans) — zero anti-aliased blur or radial gradients.
 */
export function fillPixelDisc(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const r = Math.max(1, Math.round(radius));
  const rSq = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const span = Math.floor(Math.sqrt(Math.max(0, rSq - dy * dy)) + 0.35);
    ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
  }
}

/**
 * Crisp 1x integer-pixel filled oval (scanline spans) — zero subpixel anti-aliased ellipses.
 */
export function fillPixelOval(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const irx = Math.max(1, Math.round(rx));
  const iry = Math.max(1, Math.round(ry));
  for (let dy = -iry; dy <= iry; dy++) {
    const ny = dy / (iry + 0.35);
    const span = Math.floor(Math.sqrt(Math.max(0, 1 - ny * ny)) * irx + 0.35);
    if (span >= 0) {
      ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
    }
  }
}

/**
 * Snaps an arbitrary radius into a compact set of cacheable power/tier buckets
 * so offscreen pixel-hard highlight stamps achieve near-100% cache hit rates.
 */
export function snapGlowRadius(radius: number): number {
  const clamped = Math.max(4, Math.min(128, Math.ceil(radius)));
  for (let i = 0; i < GLOW_BUCKETS.length; i++) {
    if (clamped <= GLOW_BUCKETS[i]!) {
      return GLOW_BUCKETS[i]!;
    }
  }
  return 128;
}

/**
 * Offscreen pixel-hard disc stamp cache for crisp Nuclear Throne flat circular highlights
 * and hard-edged darkness visibility carving (ZERO blurry radial gradient feathering).
 */
export class GlowStampCache {
  private stamps = new Map<string, GlowCanvas>();
  private maskStamp: GlowCanvas | null = null;
  private readonly maxEntries: number;

  constructor(maxEntries: number = 128) {
    this.maxEntries = Math.max(16, maxEntries);
  }

  /**
   * Returns a cached offscreen crisp pixel-hard flat disc stamp for `(color, radius)`.
   */
  getGlowStamp(color: string, radius: number): GlowCanvas | null {
    const bucket = snapGlowRadius(radius);
    const key = `${color}|${bucket}`;
    const existing = this.stamps.get(key);
    if (existing) return existing;

    const size = bucket * 2;
    const canvas = createGlowSurface(size, size);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as GlowCtx | null;
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    fillPixelDisc(ctx, bucket, bucket, bucket - 1);

    if (this.stamps.size >= this.maxEntries) {
      const oldest = this.stamps.keys().next().value;
      if (oldest !== undefined) {
        this.stamps.delete(oldest);
      }
    }
    this.stamps.set(key, canvas);
    return canvas;
  }

  /**
   * Returns a single reusable 128x128 hard-edged opaque pixel-stepped disc stamp
   * for crisp `destination-out` darkness carving (zero soft gradient falloff).
   */
  getDarknessMaskStamp(): GlowCanvas | null {
    if (this.maskStamp) return this.maskStamp;

    const r = 64;
    const size = r * 2;
    const canvas = createGlowSurface(size, size);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as GlowCtx | null;
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    fillPixelDisc(ctx, r, r, r - 1);
    this.maskStamp = canvas;
    return canvas;
  }

  getStats(): { cachedStamps: number; hasMaskStamp: boolean } {
    return {
      cachedStamps: this.stamps.size,
      hasMaskStamp: this.maskStamp !== null,
    };
  }

  clear(): void {
    this.stamps.clear();
    this.maskStamp = null;
  }
}

export const SHARED_GLOW_CACHE = new GlowStampCache(128);

export function getGlowStamp(color: string, radius: number): GlowCanvas | null {
  return SHARED_GLOW_CACHE.getGlowStamp(color, radius);
}
