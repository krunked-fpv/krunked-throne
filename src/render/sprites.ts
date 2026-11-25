import type { SpriteDef, TpagRect } from '@/contracts';
import type { AssetBundle, TextureImageSource } from '@/assets';

export interface DrawSpriteOptions {
  frame?: number;
  flipX?: boolean;
  flipY?: boolean;
  scaleX?: number;
  scaleY?: number;
  rotation?: number; // radians
  alpha?: number;
  flashWhite?: boolean;
  tintColor?: string;
  pixelSnap?: boolean;
}

type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;

function createScratchCanvas(w: number, h: number): ScratchCanvas | null {
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

export function normalizeFrameIndex(frame: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const idx = Math.floor(frame) % frameCount;
  return idx < 0 ? idx + frameCount : idx;
}

/**
 * Exact GameMaker sprite renderer handling SpriteDef originX/originY and
 * TPAG trimmed rectangles (srcX/Y/W/H -> targetX/Y/W/H) with flip, rotation,
 * cached white hurt-flash / color tint silhouettes, alpha, and pixel snapping.
 */
export class SpriteRenderer {
  private bundle: AssetBundle;
  private tintCache = new Map<string, ScratchCanvas>();
  private readonly maxTintCache = 256;

  constructor(bundle: AssetBundle) {
    this.bundle = bundle;
  }

  setBundle(bundle: AssetBundle): void {
    this.bundle = bundle;
    this.tintCache.clear();
  }

  getSprite(name: string): SpriteDef | undefined {
    return this.bundle.getSprite(name);
  }

  hasSprite(name: string): boolean {
    const sp = this.bundle.getSprite(name);
    if (!sp || sp.frames.length === 0) return false;
    return this.bundle.getTexture(sp.frames[0]!.textureId) !== undefined;
  }

  private getTintedFrame(
    cacheKey: string,
    tex: TextureImageSource,
    rect: TpagRect,
    color: string,
  ): ScratchCanvas | null {
    const existing = this.tintCache.get(cacheKey);
    if (existing) return existing;

    const w = Math.max(1, rect.srcW);
    const h = Math.max(1, rect.srcH);
    const canvas = createScratchCanvas(w, h);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tex, rect.srcX, rect.srcY, rect.srcW, rect.srcH, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    if (this.tintCache.size >= this.maxTintCache) {
      const oldest = this.tintCache.keys().next().value;
      if (oldest !== undefined) {
        this.tintCache.delete(oldest);
      }
    }
    this.tintCache.set(cacheKey, canvas);
    return canvas;
  }

  draw(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    spriteName: string,
    x: number,
    y: number,
    options: DrawSpriteOptions = {},
  ): boolean {
    const sprite = this.bundle.getSprite(spriteName);
    if (!sprite || sprite.frames.length === 0) return false;

    const frameIdx = normalizeFrameIndex(options.frame ?? 0, sprite.frames.length);
    const rect = sprite.frames[frameIdx];
    if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;

    const tex = this.bundle.getTexture(rect.textureId);
    if (!tex) return false;

    const pixelSnap = options.pixelSnap !== false;
    const drawX = pixelSnap ? Math.round(x) : x;
    const drawY = pixelSnap ? Math.round(y) : y;
    const sx = (options.scaleX ?? 1) * (options.flipX ? -1 : 1);
    const sy = (options.scaleY ?? 1) * (options.flipY ? -1 : 1);
    const rot = options.rotation ?? 0;
    const alpha = options.alpha ?? 1;
    const tintColor = options.flashWhite ? '#ffffff' : options.tintColor;

    const localX = rect.targetX - sprite.originX;
    const localY = rect.targetY - sprite.originY;
    const drawW = rect.targetW;
    const drawH = rect.targetH;

    let srcImage: TextureImageSource = tex;
    let srcX = rect.srcX;
    let srcY = rect.srcY;

    if (tintColor) {
      const key = `${sprite.name}:${frameIdx}:${tintColor}`;
      const tinted = this.getTintedFrame(key, tex, rect, tintColor);
      if (tinted) {
        srcImage = tinted;
        srcX = 0;
        srcY = 0;
      }
    }

    const needsTransform = sx !== 1 || sy !== 1 || rot !== 0;

    if (!needsTransform && alpha === 1) {
      ctx.drawImage(
        srcImage,
        srcX,
        srcY,
        rect.srcW,
        rect.srcH,
        drawX + localX,
        drawY + localY,
        drawW,
        drawH,
      );
      return true;
    }

    ctx.save();
    if (alpha !== 1) {
      ctx.globalAlpha *= alpha;
    }
    if (needsTransform) {
      ctx.translate(drawX, drawY);
      if (rot !== 0) {
        ctx.rotate(rot);
      }
      if (sx !== 1 || sy !== 1) {
        ctx.scale(sx, sy);
      }
      ctx.drawImage(srcImage, srcX, srcY, rect.srcW, rect.srcH, localX, localY, drawW, drawH);
    } else {
      ctx.drawImage(
        srcImage,
        srcX,
        srcY,
        rect.srcW,
        rect.srcH,
        drawX + localX,
        drawY + localY,
        drawW,
        drawH,
      );
    }
    ctx.restore();
    return true;
  }

  /**
   * Draws a sprite frame stretched or fitted cleanly into a destination box (e.g. portraits, UI cards).
   * Respects the TPAG target offset inside the sprite bounding box when fitMode === 'contain'.
   */
  drawInBox(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    spriteName: string,
    frame: number,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
    options: {
      alpha?: number;
      flipX?: boolean;
      tintColor?: string;
      maxScale?: number;
      refWidth?: number;
      refHeight?: number;
    } = {},
  ): boolean {
    const sprite = this.bundle.getSprite(spriteName);
    if (!sprite || sprite.frames.length === 0) return false;
    const frameIdx = normalizeFrameIndex(frame, sprite.frames.length);
    const rect = sprite.frames[frameIdx];
    if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;
    const tex = this.bundle.getTexture(rect.textureId);
    if (!tex) return false;

    const denomW = Math.max(1, rect.targetW, options.refWidth ?? 0);
    const denomH = Math.max(1, rect.targetH, options.refHeight ?? 0);
    let scale = Math.min(destW / denomW, destH / denomH);
    if (options.maxScale !== undefined) {
      scale = Math.min(options.maxScale, scale);
    }
    const drawW = Math.max(1, Math.round(rect.targetW * scale));
    const drawH = Math.max(1, Math.round(rect.targetH * scale));
    const dx = Math.round(destX + (destW - drawW) / 2);
    const dy = Math.round(destY + (destH - drawH) / 2);

    let srcImage: TextureImageSource = tex;
    let srcX = rect.srcX;
    let srcY = rect.srcY;
    if (options.tintColor) {
      const tinted = this.getTintedFrame(
        `${sprite.name}:${frameIdx}:${options.tintColor}`,
        tex,
        rect,
        options.tintColor,
      );
      if (tinted) {
        srcImage = tinted;
        srcX = 0;
        srcY = 0;
      }
    }

    ctx.save();
    if (options.alpha !== undefined && options.alpha !== 1) {
      ctx.globalAlpha *= options.alpha;
    }
    if (options.flipX) {
      ctx.translate(dx + drawW, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(srcImage, srcX, srcY, rect.srcW, rect.srcH, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(srcImage, srcX, srcY, rect.srcW, rect.srcH, dx, dy, drawW, drawH);
    }
    ctx.restore();
    return true;
  }

  /**
   * Draws a sub-region of a sprite frame (e.g. 16x16 quadrant of a 32x32 Nuclear Throne floor tile).
   */
  drawSubRect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    spriteName: string,
    frame: number,
    subX: number,
    subY: number,
    subW: number,
    subH: number,
    destX: number,
    destY: number,
    destW: number = subW,
    destH: number = subH,
  ): boolean {
    const sprite = this.bundle.getSprite(spriteName);
    if (!sprite || sprite.frames.length === 0) return false;
    const frameIdx = normalizeFrameIndex(frame, sprite.frames.length);
    const rect = sprite.frames[frameIdx];
    if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;
    const tex = this.bundle.getTexture(rect.textureId);
    if (!tex) return false;

    const sx = rect.srcX + (subX % Math.max(1, rect.srcW));
    const sy = rect.srcY + (subY % Math.max(1, rect.srcH));
    const sw = Math.min(subW, rect.srcX + rect.srcW - sx);
    const sh = Math.min(subH, rect.srcY + rect.srcH - sy);
    if (sw <= 0 || sh <= 0) return false;

    ctx.drawImage(tex, sx, sy, sw, sh, Math.round(destX), Math.round(destY), destW, destH);
    return true;
  }
}
