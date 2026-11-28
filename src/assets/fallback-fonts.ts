import type { FontDef, FontGlyph, SpriteDef, TpagRect } from '@/contracts';

export const ATLAS_PAGE_WIDTH = 4096;
export const ATLAS_PAGE_HEIGHT = 4096;

export type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type DrawFn = (ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number) => void;

export interface PlacedDrawOp {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: number;
  draw: DrawFn;
}

interface AtlasShelf {
  y: number;
  height: number;
  cursorX: number;
}

interface AtlasPageState {
  id: number;
  shelves: AtlasShelf[];
  nextY: number;
}

const PAD = 2;

/**
 * Multi-page 2048x2048 shelf-packing procedural texture atlas builder.
 * Automatically spawns new texture pages (textureId 0, 1, 2, ...) whenever a page fills,
 * guaranteeing zero overflow while tightly packing same-height shelves for fast GPU upload.
 */
export class FallbackAtlasBuilder {
  private pages: AtlasPageState[] = [{ id: 0, shelves: [], nextY: PAD }];
  private nextSpriteId = 0;

  readonly sprites: Record<string, SpriteDef> = {};
  readonly spritesById: string[] = [];
  readonly drawOps: PlacedDrawOp[] = [];
  tpagCount = 0;

  getPageCount(): number {
    return this.pages.length;
  }

  hasSprite(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.sprites, name);
  }

  allocRect(w: number, h: number): TpagRect {
    if (w <= 0 || h <= 0 || w + PAD * 2 > ATLAS_PAGE_WIDTH || h + PAD * 2 > ATLAS_PAGE_HEIGHT) {
      throw new Error(`Sprite dimensions ${w}x${h} exceed atlas page size ${ATLAS_PAGE_WIDTH}x${ATLAS_PAGE_HEIGHT}`);
    }

    // Try placing on an existing shelf with closely matching height on any existing page
    for (let pIdx = 0; pIdx < this.pages.length; pIdx++) {
      const page = this.pages[pIdx]!;
      let bestShelf: AtlasShelf | null = null;
      let bestWaste = Infinity;

      for (let sIdx = 0; sIdx < page.shelves.length; sIdx++) {
        const shelf = page.shelves[sIdx]!;
        if (shelf.height >= h && shelf.cursorX + w + PAD <= ATLAS_PAGE_WIDTH) {
          const waste = shelf.height - h;
          if (waste <= Math.max(8, Math.floor(h * 0.45)) && waste < bestWaste) {
            bestWaste = waste;
            bestShelf = shelf;
          }
        }
      }

      if (bestShelf) {
        const rect = this.makeRect(bestShelf.cursorX, bestShelf.y, w, h, page.id);
        bestShelf.cursorX += w + PAD;
        this.tpagCount++;
        return rect;
      }

      // Open a new shelf on this page if vertical space remains
      if (page.nextY + h + PAD <= ATLAS_PAGE_HEIGHT) {
        const newShelf: AtlasShelf = {
          y: page.nextY,
          height: h,
          cursorX: PAD + w + PAD,
        };
        page.shelves.push(newShelf);
        page.nextY += h + PAD;
        this.tpagCount++;
        return this.makeRect(PAD, newShelf.y, w, h, page.id);
      }
    }

    // All existing pages are full: automatically allocate a brand-new 2048x2048 texture page
    const newPageId = this.pages.length;
    const firstShelf: AtlasShelf = {
      y: PAD,
      height: h,
      cursorX: PAD + w + PAD,
    };
    this.pages.push({
      id: newPageId,
      shelves: [firstShelf],
      nextY: PAD + h + PAD,
    });
    this.tpagCount++;
    return this.makeRect(PAD, PAD, w, h, newPageId);
  }

  private makeRect(srcX: number, srcY: number, w: number, h: number, textureId: number): TpagRect {
    return {
      srcX,
      srcY,
      srcW: w,
      srcH: h,
      targetX: 0,
      targetY: 0,
      targetW: w,
      targetH: h,
      boundW: w,
      boundH: h,
      textureId,
    };
  }

  addSprite(
    name: string,
    w: number,
    h: number,
    originX: number,
    originY: number,
    frameCount: number,
    draw: DrawFn,
    playbackSpeed = 12,
  ): SpriteDef {
    if (this.hasSprite(name)) {
      return this.sprites[name]!;
    }
    const frames: TpagRect[] = [];
    for (let f = 0; f < frameCount; f++) {
      const rect = this.allocRect(w, h);
      frames.push(rect);
      this.drawOps.push({
        page: rect.textureId,
        x: rect.srcX,
        y: rect.srcY,
        w,
        h,
        frame: f,
        draw,
      });
    }
    const id = this.nextSpriteId++;
    const def: SpriteDef = {
      id,
      name,
      width: w,
      height: h,
      originX,
      originY,
      bboxLeft: 1,
      bboxRight: Math.max(1, w - 2),
      bboxTop: 1,
      bboxBottom: Math.max(1, h - 2),
      bboxMode: 0,
      sepMasks: 0,
      playbackSpeed,
      playbackSpeedType: 0,
      frames,
    };
    this.sprites[name] = def;
    this.spritesById.push(name);
    return def;
  }

  /**
   * Registers a 2x Hi-Bit crisp pixel-art sprite:
   * - Logical world dimensions remain (logicalW, logicalH) with (originX, originY)
   *   so hitboxes, anchors, camera, and tests stay 100% intact.
   * - Atlas pixels are authored at (logicalW * hiScale) x (logicalH * hiScale)
   *   (default 2x = 640x480 / 852x480 Odinfall-grade pixel density!).
   */
  addSpriteHiBit(
    name: string,
    logicalW: number,
    logicalH: number,
    originX: number,
    originY: number,
    frameCount: number,
    drawAtHiRes: DrawFn,
    playbackSpeed = 12,
    hiScale = 2,
  ): SpriteDef {
    if (this.hasSprite(name)) {
      return this.sprites[name]!;
    }
    const srcW = Math.max(1, Math.round(logicalW * hiScale));
    const srcH = Math.max(1, Math.round(logicalH * hiScale));
    const frames: TpagRect[] = [];
    for (let f = 0; f < frameCount; f++) {
      const alloc = this.allocRect(srcW, srcH);
      const rect: TpagRect = {
        ...alloc,
        srcW,
        srcH,
        targetX: 0,
        targetY: 0,
        targetW: logicalW,
        targetH: logicalH,
        boundW: logicalW,
        boundH: logicalH,
      };
      frames.push(rect);
      this.drawOps.push({
        page: rect.textureId,
        x: rect.srcX,
        y: rect.srcY,
        w: srcW,
        h: srcH,
        frame: f,
        draw: drawAtHiRes,
      });
    }
    const id = this.nextSpriteId++;
    const def: SpriteDef = {
      id,
      name,
      width: logicalW,
      height: logicalH,
      originX,
      originY,
      bboxLeft: 1,
      bboxRight: Math.max(1, logicalW - 2),
      bboxTop: 1,
      bboxBottom: Math.max(1, logicalH - 2),
      bboxMode: 0,
      sepMasks: 0,
      playbackSpeed,
      playbackSpeedType: 0,
      frames,
    };
    this.sprites[name] = def;
    this.spritesById.push(name);
    return def;
  }

  /**
   * Registers an alias sprite sharing the exact same TPAG rectangles (zero extra atlas area).
   */
  addAlias(name: string, targetName: string): SpriteDef | undefined {
    if (this.hasSprite(name)) return this.sprites[name];
    const target = this.sprites[targetName];
    if (!target) return undefined;
    const id = this.nextSpriteId++;
    const def: SpriteDef = { ...target, id, name };
    this.sprites[name] = def;
    this.spritesById.push(name);
    return def;
  }
}

// ============================================================================
// PIXEL-ART DRAWING PRIMITIVES (FAST, CRISP, DETERMINISTIC)
// ============================================================================

export const INK = '#120e16';
export const INK_SOFT = '#1f1826';

/** Deterministic integer hash returning 0..255 for pixel textures. */
export function hash2d(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) & 255;
}

export function px(ctx: DrawCtx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

export function rect(ctx: DrawCtx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

/** Draws a 1px dark-outlined filled box (corners chamfered when chamfer=true). */
export function outlinedBox(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  outline: string = INK,
  chamfer = false,
): void {
  const ix = x | 0;
  const iy = y | 0;
  const iw = w | 0;
  const ih = h | 0;
  if (iw <= 0 || ih <= 0) return;
  ctx.fillStyle = outline;
  if (chamfer && iw >= 4 && ih >= 4) {
    ctx.fillRect(ix + 1, iy, iw - 2, ih);
    ctx.fillRect(ix, iy + 1, iw, ih - 2);
  } else {
    ctx.fillRect(ix, iy, iw, ih);
  }
  if (iw > 2 && ih > 2) {
    ctx.fillStyle = fill;
    ctx.fillRect(ix + 1, iy + 1, iw - 2, ih - 2);
  }
}

/** Draws a crisp integer pixel ellipse via horizontal scanline spans (fast, zero anti-aliasing). */
export function fillPixelEllipse(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = color;
  const iry = Math.floor(ry);
  for (let dy = -iry; dy <= iry; dy++) {
    const ny = dy / ry;
    const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - ny * ny)) + 0.35);
    if (span >= 0) {
      ctx.fillRect(Math.round(cx - span), Math.round(cy + dy), span * 2 + 1, 1);
    }
  }
}

/** Draws an outlined pixel ellipse (1px dark border + filled interior). */
export function outlinedEllipse(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  outline: string = INK,
): void {
  fillPixelEllipse(ctx, cx, cy, rx + 1, ry + 1, outline);
  fillPixelEllipse(ctx, cx, cy, rx, ry, fill);
}

/** Draws a crisp integer pixel trapezoid via horizontal scanlines (zero anti-aliasing). */
export function fillTrapezoid(
  ctx: DrawCtx,
  cx: number,
  y: number,
  topW: number,
  botW: number,
  h: number,
  color: string,
): void {
  const ih = h | 0;
  if (ih <= 0) return;
  ctx.fillStyle = color;
  const denom = Math.max(1, ih - 1);
  for (let r = 0; r < ih; r++) {
    const t = r / denom;
    const w = Math.max(1, Math.round(topW + (botW - topW) * t));
    const lx = Math.round(cx - w / 2);
    ctx.fillRect(lx, (y + r) | 0, w, 1);
  }
}

/** Draws a 1px dark-outlined integer pixel trapezoid. */
export function outlinedTrapezoid(
  ctx: DrawCtx,
  cx: number,
  y: number,
  topW: number,
  botW: number,
  h: number,
  fill: string,
  outline: string = INK,
): void {
  const ih = h | 0;
  if (ih <= 0) return;
  fillTrapezoid(ctx, cx, y - 1, topW + 2, botW + 2, ih + 2, outline);
  fillTrapezoid(ctx, cx, y, topW, botW, ih, fill);
}

/** Draws a crisp faceted pixel diamond (useful for crystals, gems, highlights). */
export function fillDiamond(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  const iry = Math.floor(ry);
  if (rx <= 0 || iry <= 0) return;
  ctx.fillStyle = color;
  for (let dy = -iry; dy <= iry; dy++) {
    const span = Math.round(rx * (1 - Math.abs(dy) / (ry + 0.25)));
    if (span >= 0) {
      ctx.fillRect(Math.round(cx - span), Math.round(cy + dy), span * 2 + 1, 1);
    }
  }
}

/** Draws a 1px dark-outlined faceted pixel diamond. */
export function outlinedDiamond(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  outline: string = INK,
): void {
  fillDiamond(ctx, cx, cy, rx + 1, ry + 1, outline);
  fillDiamond(ctx, cx, cy, rx, ry, fill);
}

/** Draws a crisp integer Bresenham pixel line. */
export function drawPixelLine(
  ctx: DrawCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  ctx.fillStyle = color;
  const off = thickness > 1 ? Math.floor(thickness / 2) : 0;
  for (let step = 0; step <= dx + dy + 2; step++) {
    ctx.fillRect(ix0 - off, iy0 - off, thickness, thickness);
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

/**
 * Renders an ASCII pixel-art bitmap with horizontal run-length batching and optional
 * automatic 1px dark outer silhouette outline!
 * '.' or ' ' are transparent. Any character in `palette` draws that color.
 */
export function drawPixelGrid(
  ctx: DrawCtx,
  x: number,
  y: number,
  rows: readonly string[],
  palette: Record<string, string>,
  scale = 1,
  autoOutlineColor?: string,
): void {
  const h = rows.length;
  if (h === 0) return;
  let w = 0;
  for (let r = 0; r < h; r++) {
    if (rows[r]!.length > w) w = rows[r]!.length;
  }

  const isOpaque = (r: number, c: number): boolean => {
    if (r < 0 || r >= h || c < 0 || c >= w) return false;
    const ch = rows[r]![c];
    return ch !== undefined && ch !== '.' && ch !== ' ';
  };

  // Optional crisp 1-cell cardinal outline around the silhouette
  if (autoOutlineColor) {
    ctx.fillStyle = autoOutlineColor;
    for (let r = -1; r <= h; r++) {
      let runStart = -99;
      let runLen = 0;
      for (let c = -1; c <= w; c++) {
        const outlineHere =
          !isOpaque(r, c) &&
          (isOpaque(r - 1, c) || isOpaque(r + 1, c) || isOpaque(r, c - 1) || isOpaque(r, c + 1));
        if (outlineHere) {
          if (runLen === 0) runStart = c;
          runLen++;
        } else if (runLen > 0) {
          ctx.fillRect((x + runStart * scale) | 0, (y + r * scale) | 0, runLen * scale, scale);
          runLen = 0;
        }
      }
      if (runLen > 0) {
        ctx.fillRect((x + runStart * scale) | 0, (y + r * scale) | 0, runLen * scale, scale);
      }
    }
  }

  // Run-length batched interior pass
  for (let r = 0; r < h; r++) {
    const line = rows[r]!;
    let c = 0;
    while (c < line.length) {
      const ch = line[c]!;
      if (ch === '.' || ch === ' ') {
        c++;
        continue;
      }
      const color = palette[ch];
      let end = c + 1;
      while (end < line.length && line[end] === ch) {
        end++;
      }
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect((x + c * scale) | 0, (y + r * scale) | 0, (end - c) * scale, scale);
      }
      c = end;
    }
  }
}

// ============================================================================
// CRISP INTEGER-SCALED PIXEL BITMAP FONTS (4x5 NATIVE fntSmall + 5x7 fntM1/L)
// ============================================================================

/**
 * TRUE native 4x5 bold arcade pixel bitmap font for `fntSmall` (scaleX=1, scaleY=1,
 * advance=5px, lineHeight=6px — ZERO fractional scaling, zero clipped strokes!).
 * Packed as 5 rows of 4-bit masks (MSB = bit 3 = leftmost pixel).
 */
const PIXEL_FONT_4X5: Record<number, readonly number[]> = {
  32: [0, 0, 0, 0, 0], // ' '
  33: [4, 4, 4, 0, 4], // '!'
  34: [10, 10, 0, 0, 0], // '"'
  35: [10, 15, 10, 15, 10], // '#'
  36: [6, 12, 6, 3, 14], // '$'
  37: [9, 2, 4, 4, 9], // '%'
  38: [6, 9, 6, 9, 7], // '&'
  39: [4, 4, 0, 0, 0], // "'"
  40: [2, 4, 4, 4, 2], // '('
  41: [8, 4, 4, 4, 8], // ')'
  42: [0, 10, 4, 10, 0], // '*'
  43: [0, 4, 14, 4, 0], // '+'
  44: [0, 0, 0, 4, 8], // ','
  45: [0, 0, 14, 0, 0], // '-'
  46: [0, 0, 0, 0, 4], // '.'
  47: [1, 2, 2, 4, 8], // '/'
  48: [6, 9, 9, 9, 6], // '0'
  49: [4, 12, 4, 4, 14], // '1'
  50: [14, 1, 6, 8, 15], // '2'
  51: [14, 1, 6, 1, 14], // '3'
  52: [9, 9, 15, 1, 1], // '4'
  53: [15, 8, 14, 1, 14], // '5'
  54: [7, 8, 14, 9, 6], // '6'
  55: [15, 1, 2, 4, 4], // '7'
  56: [6, 9, 6, 9, 6], // '8'
  57: [6, 9, 7, 1, 14], // '9'
  58: [0, 4, 0, 4, 0], // ':'
  59: [0, 4, 0, 4, 8], // ';'
  60: [2, 4, 8, 4, 2], // '<'
  61: [0, 14, 0, 14, 0], // '='
  62: [8, 4, 2, 4, 8], // '>'
  63: [14, 1, 6, 0, 4], // '?'
  64: [6, 9, 11, 8, 7], // '@'
  65: [6, 9, 15, 9, 9], // 'A'
  66: [14, 9, 14, 9, 14], // 'B'
  67: [7, 8, 8, 8, 7], // 'C'
  68: [14, 9, 9, 9, 14], // 'D'
  69: [15, 8, 14, 8, 15], // 'E'
  70: [15, 8, 14, 8, 8], // 'F'
  71: [7, 8, 11, 9, 7], // 'G'
  72: [9, 9, 15, 9, 9], // 'H'
  73: [14, 4, 4, 4, 14], // 'I'
  74: [3, 1, 1, 9, 6], // 'J'
  75: [9, 10, 12, 10, 9], // 'K'
  76: [8, 8, 8, 8, 15], // 'L'
  77: [9, 15, 9, 9, 9], // 'M'
  78: [9, 13, 11, 9, 9], // 'N'
  79: [6, 9, 9, 9, 6], // 'O'
  80: [14, 9, 14, 8, 8], // 'P'
  81: [6, 9, 9, 13, 5], // 'Q' (5x5 crisp override below)
  82: [14, 9, 14, 10, 9], // 'R'
  83: [7, 8, 6, 1, 14], // 'S'
  84: [14, 4, 4, 4, 4], // 'T'
  85: [9, 9, 9, 9, 6], // 'U'
  86: [9, 9, 9, 5, 2], // 'V' (5x5 crisp override below)
  87: [9, 9, 9, 15, 9], // 'W' (5x5 crisp override below)
  88: [9, 9, 6, 9, 9], // 'X'
  89: [10, 10, 4, 4, 4], // 'Y'
  90: [15, 1, 6, 8, 15], // 'Z'
  91: [12, 8, 8, 8, 12], // '['
  92: [8, 4, 4, 2, 1], // '\'
  93: [6, 2, 2, 2, 6], // ']'
  94: [6, 9, 0, 0, 0], // '^'
  95: [0, 0, 0, 0, 15], // '_'
  96: [8, 4, 0, 0, 0], // '`'
  123: [3, 4, 12, 4, 3], // '{'
  124: [4, 4, 4, 4, 4], // '|'
  125: [12, 2, 3, 2, 12], // '}'
  126: [0, 5, 10, 0, 0], // '~'
};

/**
 * Clean-room 5x7 arcade pixel bitmap font (7 rows of 5-bit masks per ASCII char 32..126).
 * Drawn into 6x8 cells for `fntM1`, `fntM0`, `fntM1x`, `fntChat` (1x) and `fntL` (2x).
 */
const PIXEL_FONT_5X7: Record<number, readonly number[]> = {
  32: [0, 0, 0, 0, 0, 0, 0], // ' '
  33: [4, 4, 4, 4, 4, 0, 4], // '!'
  34: [10, 10, 0, 0, 0, 0, 0], // '"'
  35: [10, 31, 10, 10, 31, 10, 0], // '#'
  36: [4, 15, 20, 14, 5, 30, 4], // '$'
  37: [25, 26, 4, 4, 11, 19, 0], // '%'
  38: [12, 18, 20, 8, 21, 18, 13], // '&'
  39: [4, 4, 0, 0, 0, 0, 0], // "'"
  40: [2, 4, 8, 8, 8, 4, 2], // '('
  41: [8, 4, 2, 2, 2, 4, 8], // ')'
  42: [0, 4, 21, 14, 21, 4, 0], // '*'
  43: [0, 4, 4, 31, 4, 4, 0], // '+'
  44: [0, 0, 0, 0, 0, 4, 8], // ','
  45: [0, 0, 0, 31, 0, 0, 0], // '-'
  46: [0, 0, 0, 0, 0, 4, 4], // '.'
  47: [1, 2, 2, 4, 8, 8, 16], // '/'
  48: [14, 17, 19, 21, 25, 17, 14], // '0'
  49: [4, 12, 4, 4, 4, 4, 14], // '1'
  50: [14, 17, 1, 6, 8, 16, 31], // '2'
  51: [30, 1, 1, 14, 1, 1, 30], // '3'
  52: [2, 6, 10, 18, 31, 2, 2], // '4'
  53: [31, 16, 30, 1, 1, 17, 14], // '5'
  54: [14, 16, 30, 17, 17, 17, 14], // '6'
  55: [31, 1, 2, 4, 8, 8, 8], // '7'
  56: [14, 17, 17, 14, 17, 17, 14], // '8'
  57: [14, 17, 17, 15, 1, 2, 12], // '9'
  58: [0, 4, 0, 0, 0, 4, 0], // ':'
  59: [0, 4, 0, 0, 0, 4, 8], // ';'
  60: [2, 4, 8, 16, 8, 4, 2], // '<'
  61: [0, 0, 31, 0, 31, 0, 0], // '='
  62: [8, 4, 2, 1, 2, 4, 8], // '>'
  63: [14, 17, 1, 6, 4, 0, 4], // '?'
  64: [14, 17, 23, 21, 23, 16, 14], // '@'
  65: [14, 17, 17, 31, 17, 17, 17], // 'A'
  66: [30, 17, 17, 30, 17, 17, 30], // 'B'
  67: [14, 17, 16, 16, 16, 17, 14], // 'C'
  68: [30, 17, 17, 17, 17, 17, 30], // 'D'
  69: [31, 16, 16, 30, 16, 16, 31], // 'E'
  70: [31, 16, 16, 30, 16, 16, 16], // 'F'
  71: [14, 17, 16, 23, 17, 17, 14], // 'G'
  72: [17, 17, 17, 31, 17, 17, 17], // 'H'
  73: [14, 4, 4, 4, 4, 4, 14], // 'I'
  74: [7, 2, 2, 2, 18, 18, 12], // 'J'
  75: [17, 18, 20, 24, 20, 18, 17], // 'K'
  76: [16, 16, 16, 16, 16, 16, 31], // 'L'
  77: [17, 27, 21, 21, 17, 17, 17], // 'M'
  78: [17, 25, 21, 19, 17, 17, 17], // 'N'
  79: [14, 17, 17, 17, 17, 17, 14], // 'O'
  80: [30, 17, 17, 30, 16, 16, 16], // 'P'
  81: [14, 17, 17, 17, 21, 18, 13], // 'Q'
  82: [30, 17, 17, 30, 20, 18, 17], // 'R'
  83: [15, 16, 16, 14, 1, 1, 30], // 'S'
  84: [31, 4, 4, 4, 4, 4, 4], // 'T'
  85: [17, 17, 17, 17, 17, 17, 14], // 'U'
  86: [17, 17, 17, 17, 10, 10, 4], // 'V'
  87: [17, 17, 17, 21, 21, 27, 17], // 'W'
  88: [17, 17, 10, 4, 10, 17, 17], // 'X'
  89: [17, 17, 10, 4, 4, 4, 4], // 'Y'
  90: [31, 1, 2, 4, 8, 16, 31], // 'Z'
  91: [14, 8, 8, 8, 8, 8, 14], // '['
  92: [16, 8, 8, 4, 2, 2, 1], // '\'
  93: [14, 2, 2, 2, 2, 2, 14], // ']'
  94: [4, 10, 17, 0, 0, 0, 0], // '^'
  95: [0, 0, 0, 0, 0, 0, 31], // '_'
  96: [8, 4, 0, 0, 0, 0, 0], // '`'
  123: [6, 8, 8, 24, 8, 8, 6], // '{'
  124: [4, 4, 4, 4, 4, 4, 4], // '|'
  125: [12, 2, 2, 3, 2, 2, 12], // '}'
  126: [0, 10, 21, 0, 0, 0, 0], // '~'
};

/**
 * Wide 5x5 native overrides for `fntSmall` glyphs that need an odd center column
 * (`M`, `V`, `W`) or protruding diagonal tail (`Q`) so words like `STEAM`, `ACTIVE`,
 * `LV1`, `Q` swap badge, `PAW`, and `CLEAN-ROOM` read razor-sharp.
 * Packed as 5 rows of 5-bit masks (MSB = bit 4 = leftmost pixel).
 */
const PIXEL_FONT_SMALL_WIDE_5X5: Record<number, readonly number[]> = {
  77: [17, 27, 21, 17, 17], // 'M' (#...# / ##.## / #.#.# / #...# / #...#)
  81: [12, 18, 18, 22, 13], // 'Q' (.#.# -> .##.. / #..#. / #..#. / #.##. / .##.#)
  86: [17, 17, 10, 10, 4],  // 'V' (#...# / #...# / .#.#. / .#.#. / ..#..)
  87: [17, 17, 21, 27, 17], // 'W' (#...# / #...# / #.#.# / ##.## / #...#)
};

function getFontGlyphSmall(code: number): { rows: readonly number[]; width: number } {
  const effective = code >= 97 && code <= 122 ? code - 32 : code;
  const wide = PIXEL_FONT_SMALL_WIDE_5X5[effective];
  if (wide) {
    return { rows: wide, width: 5 };
  }
  return { rows: PIXEL_FONT_4X5[effective] ?? PIXEL_FONT_4X5[63]!, width: 4 };
}

function getFontRows5x7(code: number): readonly number[] {
  const effective = code >= 97 && code <= 122 ? code - 32 : code;
  return PIXEL_FONT_5X7[effective] ?? PIXEL_FONT_5X7[63]!;
}

/**
 * Allocates and draws two razor-sharp native bitmap font sheets on the atlas:
 * - Native 4x5 (with crisp 5x5 M/W) bold pixel font for `fntSmall` (scaleX: 1, scaleY: 1, lineHeight: 6px)
 * - Native 5x7 crisp pixel font for `fntM1`, `fntM0`, `fntM1x`, `fntChat` (1x) and `fntL` (2x)
 */
export function registerFallbackFonts(b: FallbackAtlasBuilder): Record<string, FontDef> {
  const cols = 16;
  const rows = 6;

  // 1. Native 4x5 (5x5 for M/W) pixel font sheet (cell 6x6 -> 96x36, 1px gutter guaranteed)
  const smallCellW = 6;
  const smallCellH = 6;
  const smallFontRect = b.allocRect(cols * smallCellW, rows * smallCellH);
  b.drawOps.push({
    page: smallFontRect.textureId,
    x: smallFontRect.srcX,
    y: smallFontRect.srcY,
    w: smallFontRect.srcW,
    h: smallFontRect.srcH,
    frame: 0,
    draw: (ctx, baseX, baseY) => {
      ctx.fillStyle = '#ffffff';
      for (let code = 32; code <= 126; code++) {
        const idx = code - 32;
        const cx = baseX + (idx % cols) * smallCellW;
        const cy = baseY + Math.floor(idx / cols) * smallCellH;
        const { rows: glyphRows, width } = getFontGlyphSmall(code);
        const topBit = width - 1;
        for (let r = 0; r < 5; r++) {
          const bits = glyphRows[r] ?? 0;
          if (bits === 0) continue;
          let bit = 0;
          while (bit < width) {
            if ((bits & (1 << (topBit - bit))) !== 0) {
              let end = bit + 1;
              while (end < width && (bits & (1 << (topBit - end))) !== 0) end++;
              ctx.fillRect(cx + bit, cy + r, end - bit, 1);
              bit = end;
            } else {
              bit++;
            }
          }
        }
      }
    },
  });

  const smallGlyphs: Record<number, FontGlyph> = {};
  for (let code = 32; code <= 126; code++) {
    const idx = code - 32;
    const { width } = getFontGlyphSmall(code);
    smallGlyphs[code] = {
      charCode: code,
      x: (idx % cols) * smallCellW,
      y: Math.floor(idx / cols) * smallCellH,
      w: width,
      h: 5,
      shift: width + 1,
      offset: 0,
    };
  }

  // 2. Native 5x7 pixel font sheet (cell 6x8 -> 96x48)
  const medCellW = 6;
  const medCellH = 8;
  const medFontRect = b.allocRect(cols * medCellW, rows * medCellH);
  b.drawOps.push({
    page: medFontRect.textureId,
    x: medFontRect.srcX,
    y: medFontRect.srcY,
    w: medFontRect.srcW,
    h: medFontRect.srcH,
    frame: 0,
    draw: (ctx, baseX, baseY) => {
      ctx.fillStyle = '#ffffff';
      for (let code = 32; code <= 126; code++) {
        const idx = code - 32;
        const cx = baseX + (idx % cols) * medCellW;
        const cy = baseY + Math.floor(idx / cols) * medCellH;
        const glyphRows = getFontRows5x7(code);
        for (let r = 0; r < 7; r++) {
          const bits = glyphRows[r] ?? 0;
          if (bits === 0) continue;
          let bit = 0;
          while (bit < 5) {
            if ((bits & (1 << (4 - bit))) !== 0) {
              let end = bit + 1;
              while (end < 5 && (bits & (1 << (4 - end))) !== 0) end++;
              ctx.fillRect(cx + bit, cy + r, end - bit, 1);
              bit = end;
            } else {
              bit++;
            }
          }
        }
      }
    },
  });

  const medGlyphs: Record<number, FontGlyph> = {};
  for (let code = 32; code <= 126; code++) {
    const idx = code - 32;
    medGlyphs[code] = {
      charCode: code,
      x: (idx % cols) * medCellW,
      y: Math.floor(idx / cols) * medCellH,
      w: 5,
      h: 7,
      shift: 6,
      offset: 0,
    };
  }

  return {
    fntChat: {
      id: 0,
      name: 'fntChat',
      displayName: 'Wasteland 5x7',
      tpag: medFontRect,
      scaleX: 1,
      scaleY: 1,
      lineHeight: 8,
      ascender: 7,
      glyphs: medGlyphs,
    },
    fntL: {
      id: 1,
      name: 'fntL',
      displayName: 'Wasteland Display 2x',
      tpag: medFontRect,
      scaleX: 2,
      scaleY: 2,
      lineHeight: 8,
      ascender: 7,
      glyphs: medGlyphs,
    },
    fntM0: {
      id: 2,
      name: 'fntM0',
      displayName: 'Wasteland Medium 5x7',
      tpag: medFontRect,
      scaleX: 1,
      scaleY: 1,
      lineHeight: 8,
      ascender: 7,
      glyphs: medGlyphs,
    },
    fntM1: {
      id: 3,
      name: 'fntM1',
      displayName: 'Wasteland HUD 5x7',
      tpag: medFontRect,
      scaleX: 1,
      scaleY: 1,
      lineHeight: 8,
      ascender: 7,
      glyphs: medGlyphs,
    },
    fntM1x: {
      id: 4,
      name: 'fntM1x',
      displayName: 'Wasteland HUD Extended',
      tpag: medFontRect,
      scaleX: 1,
      scaleY: 1,
      lineHeight: 8,
      ascender: 7,
      glyphs: medGlyphs,
    },
    fntSmall: {
      id: 5,
      name: 'fntSmall',
      displayName: 'Wasteland Crisp 4x5',
      tpag: smallFontRect,
      scaleX: 1,
      scaleY: 1,
      lineHeight: 6,
      ascender: 5,
      glyphs: smallGlyphs,
    },
  };
}
