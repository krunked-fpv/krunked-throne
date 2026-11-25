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
 * Snaps an arbitrary radius into a compact set of cacheable power/tier buckets
 * so offscreen radial glow stamps achieve near-100% cache hit rates while staying crisp.
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
 * Parses a CSS hex/rgb/rgba color into RGB + alpha components so radial stamps
 * can build crisp exponential falloff stops without dark edge fringing or bloated washout.
 */
function parseRgbaColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const trimmed = color.trim();
  const rgbaMatch =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i.exec(trimmed);
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    const a = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && Number.isFinite(a)) {
      return { r, g, b, a: Math.max(0, Math.min(1, a)) };
    }
  }
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b, a: 1 };
      }
    } else if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b, a: 1 };
      }
    }
  }
  return null;
}

function toScaledAlphaColor(color: string, factor: number): string {
  const parsed = parseRgbaColor(color);
  if (!parsed) return factor <= 0 ? 'rgba(0, 0, 0, 0)' : color;
  const scaled = Math.max(0, Math.min(1, parsed.a * factor));
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${scaled.toFixed(4)})`;
}

/**
 * High-performance offscreen radial glow sprite stamp cache.
 * Replaces expensive per-frame `ctx.createRadialGradient()` calls during intense
 * 7-3 plasma barrages and lighting passes with fast cached `ctx.drawImage()` blits.
 */
export class GlowStampCache {
  private stamps = new Map<string, GlowCanvas>();
  private maskStamp: GlowCanvas | null = null;
  private readonly maxEntries: number;

  constructor(maxEntries: number = 128) {
    this.maxEntries = Math.max(16, maxEntries);
  }

  /**
   * Returns a cached offscreen radial glow stamp canvas for `(color, radius)`,
   * lazily pre-rendering it once on first request with crisp quadratic falloff
   * so glows stay tight and never wash out pixel art.
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

    const grad = ctx.createRadialGradient(bucket, bucket, 0.5, bucket, bucket, bucket);
    grad.addColorStop(0, color);
    grad.addColorStop(0.36, toScaledAlphaColor(color, 0.42));
    grad.addColorStop(0.72, toScaledAlphaColor(color, 0.11));
    grad.addColorStop(1, toScaledAlphaColor(color, 0));

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

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
   * Returns a single reusable 128x128 smooth radial alpha-falloff stamp used for
   * `destination-out` darkness carving (modulated per-light via `ctx.globalAlpha`).
   */
  getDarknessMaskStamp(): GlowCanvas | null {
    if (this.maskStamp) return this.maskStamp;

    const r = 64;
    const size = r * 2;
    const canvas = createGlowSurface(size, size);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as GlowCtx | null;
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(r, r, Math.max(2, r * 0.16), r, r, r);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.48)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
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
