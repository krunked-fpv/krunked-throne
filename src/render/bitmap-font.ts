import type { FontDef, FontGlyph } from '@/contracts';
import type { AssetBundle, TextureImageSource } from '@/assets';

export type TextAlign = 'left' | 'center' | 'right';
export type TextBaseline = 'top' | 'middle' | 'bottom';

export interface ColoredRun {
  text: string;
  color: string;
}

export interface ParsedTextLine {
  runs: ColoredRun[];
  plain: string;
}

export interface DrawTextOptions {
  align?: TextAlign;
  baseline?: TextBaseline;
  color?: string;
  shadow?: boolean;
  outline?: boolean;
  outlineWidth?: 1 | 2;
  shadowColor?: string;
  scale?: number;
  lineSpacing?: number;
  alpha?: number;
  maxWidth?: number;
}

export const NT_COLOR_TOKENS: Record<string, string> = {
  w: '#ffffff', // white
  r: '#ff4242', // red
  g: '#52e864', // green
  y: '#ffe047', // yellow
  b: '#52a8ff', // blue
  p: '#c96bff', // purple
  d: '#787882', // dark gray
};

export const DEFAULT_NT_TEXT_COLOR = '#e6e6eb';

/**
 * Strips Nuclear Throne markup tokens (@w, @r, @g, @y, @b, @p, @d, @s)
 * and normalizes '#' line breaks to '\n'.
 */
export function stripMarkup(text: string): string {
  return parseMarkupLines(text)
    .map((l) => l.plain)
    .join('\n');
}

/**
 * Parses Nuclear Throne color & newline markup into structured colored lines.
 * Tokens:
 *   @w white, @r red, @g green, @y yellow, @b blue, @p purple, @d dark gray, @s reset
 *   @@ literal '@'
 *   # or \n newline
 *   \# literal '#'
 */
export function parseMarkupLines(
  text: string,
  baseColor: string = DEFAULT_NT_TEXT_COLOR,
): ParsedTextLine[] {
  const lines: ParsedTextLine[] = [];
  let currentRuns: ColoredRun[] = [];
  let currentPlain = '';
  let currentColor = baseColor;
  let buf = '';

  const flushBuf = (): void => {
    if (buf.length > 0) {
      currentRuns.push({ text: buf, color: currentColor });
      currentPlain += buf;
      buf = '';
    }
  };

  const pushLine = (): void => {
    flushBuf();
    lines.push({ runs: currentRuns, plain: currentPlain });
    currentRuns = [];
    currentPlain = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (ch === '\\' && i + 1 < text.length && text[i + 1] === '#') {
      buf += '#';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        i += 1;
      }
      pushLine();
      continue;
    }

    if (ch === '\n' || ch === '#') {
      pushLine();
      continue;
    }

    if (ch === '@' && i + 1 < text.length) {
      const code = text[i + 1]!;
      if (code === '@') {
        buf += '@';
        i += 1;
        continue;
      }
      const lower = code.toLowerCase();
      if (lower === 's') {
        flushBuf();
        currentColor = baseColor;
        i += 1;
        continue;
      }
      const mapped = NT_COLOR_TOKENS[lower];
      if (mapped) {
        flushBuf();
        currentColor = mapped;
        i += 1;
        continue;
      }
    }

    buf += ch;
  }

  pushLine();
  return lines;
}

/**
 * Resolves a glyph from FontDef with case-insensitive fallback before returning undefined.
 */
export function resolveFontGlyph(font: FontDef, charCode: number): FontGlyph | undefined {
  const direct = font.glyphs[charCode];
  if (direct) return direct;
  // Many Nuclear Throne arcade fonts (e.g. fntM1/fntSmall) prefer uppercase glyphs; try swapping case.
  if (charCode >= 97 && charCode <= 122) {
    const upper = font.glyphs[charCode - 32];
    if (upper) return upper;
  } else if (charCode >= 65 && charCode <= 90) {
    const lower = font.glyphs[charCode + 32];
    if (lower) return lower;
  }
  return font.glyphs[63]; // '?' fallback if present in font
}

const FALLBACK_CHAR_ADVANCE = 6;
const FALLBACK_LINE_HEIGHT = 8;

/**
 * Measures the pixel width of a single plain (already-stripped) string line for a given FontDef.
 */
export function measurePlainLineWidth(
  font: FontDef | undefined,
  plain: string,
  scale: number = 1,
): number {
  if (!plain) return 0;
  if (!font) {
    return Math.round(plain.length * FALLBACK_CHAR_ADVANCE * scale);
  }
  const sx = (font.scaleX || 1) * scale;
  let width = 0;
  for (let i = 0; i < plain.length; i++) {
    const code = plain.charCodeAt(i);
    const glyph = resolveFontGlyph(font, code);
    if (glyph) {
      width += glyph.shift * sx;
    } else {
      width += FALLBACK_CHAR_ADVANCE * sx;
    }
  }
  return Math.round(width);
}

/**
 * Measures markup-aware text block width and height (taking # / \n line breaks into account).
 */
export function measureText(
  font: FontDef | undefined,
  text: string,
  scale: number = 1,
  lineSpacing: number = 1,
): { width: number; height: number; lineWidths: number[]; lineHeight: number } {
  const lines = parseMarkupLines(text);
  const sy = (font?.scaleY || 1) * scale;
  const baseLineHeight = font ? Math.max(1, font.lineHeight) : FALLBACK_LINE_HEIGHT;
  const lineHeight = Math.round(baseLineHeight * sy);
  const stepY = lineHeight + Math.round(lineSpacing * scale);
  const lineWidths: number[] = [];
  let maxWidth = 0;

  for (let i = 0; i < lines.length; i++) {
    const w = measurePlainLineWidth(font, lines[i]!.plain, scale);
    lineWidths.push(w);
    if (w > maxWidth) maxWidth = w;
  }

  const totalHeight =
    lines.length === 0 ? 0 : lineHeight + Math.max(0, lines.length - 1) * stepY;

  return { width: maxWidth, height: totalHeight, lineWidths, lineHeight };
}

/**
 * Wraps markup text so each rendered line fits within maxWidth (preserving color state across wraps).
 */
export function wrapMarkupText(
  font: FontDef | undefined,
  text: string,
  maxWidth: number,
  scale: number = 1,
  baseColor: string = DEFAULT_NT_TEXT_COLOR,
): ParsedTextLine[] {
  const rawLines = parseMarkupLines(text, baseColor);
  if (maxWidth <= 0) return rawLines;

  const out: ParsedTextLine[] = [];

  for (const line of rawLines) {
    if (measurePlainLineWidth(font, line.plain, scale) <= maxWidth) {
      out.push(line);
      continue;
    }

    // Break runs into space-separated colored word tokens
    interface Token {
      runs: ColoredRun[];
      plain: string;
      isSpace: boolean;
    }
    const tokens: Token[] = [];
    let curWordRuns: ColoredRun[] = [];
    let curWordPlain = '';

    const pushWord = (): void => {
      if (curWordPlain.length > 0) {
        tokens.push({ runs: curWordRuns, plain: curWordPlain, isSpace: false });
        curWordRuns = [];
        curWordPlain = '';
      }
    };

    for (const run of line.runs) {
      let chunk = '';
      for (let i = 0; i < run.text.length; i++) {
        const ch = run.text[i]!;
        if (ch === ' ') {
          if (chunk.length > 0) {
            curWordRuns.push({ text: chunk, color: run.color });
            curWordPlain += chunk;
            chunk = '';
          }
          pushWord();
          tokens.push({ runs: [{ text: ' ', color: run.color }], plain: ' ', isSpace: true });
        } else {
          chunk += ch;
        }
      }
      if (chunk.length > 0) {
        curWordRuns.push({ text: chunk, color: run.color });
        curWordPlain += chunk;
      }
    }
    pushWord();

    let curRuns: ColoredRun[] = [];
    let curPlain = '';
    for (const tok of tokens) {
      if (tok.isSpace && curPlain.length === 0) continue;
      const candidatePlain = curPlain + tok.plain;
      if (curPlain.length > 0 && measurePlainLineWidth(font, candidatePlain, scale) > maxWidth) {
        out.push({ runs: curRuns, plain: curPlain.trimEnd() });
        curRuns = [];
        curPlain = '';
        if (tok.isSpace) continue;
      }
      for (const r of tok.runs) {
        const last = curRuns[curRuns.length - 1];
        if (last && last.color === r.color) {
          last.text += r.text;
        } else {
          curRuns.push({ text: r.text, color: r.color });
        }
      }
      curPlain += tok.plain;
    }
    if (curPlain.length > 0 || curRuns.length === 0) {
      out.push({ runs: curRuns, plain: curPlain.trimEnd() });
    }
  }

  return out;
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

/**
 * Computes per-pass shadow/outline alpha so multi-pass outlines (e.g. 5 passes)
 * never compound darker than the foreground text when ctx.globalAlpha < 1.
 * At full opacity (alpha >= 0.999), returns full opaque outline alpha (1).
 */
export function computeShadowPassAlpha(effectiveAlpha: number, passCount: number): number {
  const a = Math.max(0, Math.min(1, effectiveAlpha));
  if (a >= 0.999 || passCount <= 1) return a;
  const targetCompounded = a * 0.7;
  return 1 - Math.pow(1 - targetCompounded, 1 / passCount);
}

/**
 * Pixel-crisp bitmap font renderer using FontDef records from AssetBundle
 * (fntM1, fntSmall, fntL, fntM0, fntChat, fntM1x), with tinted font-sheet caching,
 * 1px black shadow/outline support, Nuclear Throne markup, and monospace fallback.
 */
export class BitmapFontRenderer {
  private bundle: AssetBundle;
  private tintedSheets = new Map<string, ScratchCanvas>();
  private readonly maxCacheEntries = 96;

  constructor(bundle: AssetBundle) {
    this.bundle = bundle;
  }

  setBundle(bundle: AssetBundle): void {
    this.bundle = bundle;
    this.tintedSheets.clear();
  }

  getFont(name: string): FontDef | undefined {
    return (
      this.bundle.getFont(name) ??
      this.bundle.getFont('fntM1') ??
      this.bundle.getFont('fntSmall') ??
      Object.values(this.bundle.manifest.fonts)[0]
    );
  }

  measure(
    text: string,
    fontName: string = 'fntM1',
    scale: number = 1,
    lineSpacing: number = 1,
  ): { width: number; height: number; lineWidths: number[]; lineHeight: number } {
    return measureText(this.getFont(fontName), text, scale, lineSpacing);
  }

  private getTintedFontSheet(
    font: FontDef,
    tex: TextureImageSource,
    color: string,
  ): ScratchCanvas | null {
    const key = `${font.name}:${color}`;
    const cached = this.tintedSheets.get(key);
    if (cached) return cached;

    const w = Math.max(1, font.tpag.srcW);
    const h = Math.max(1, font.tpag.srcH);
    const canvas = createScratchCanvas(w, h);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tex, font.tpag.srcX, font.tpag.srcY, w, h, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    if (this.tintedSheets.size >= this.maxCacheEntries) {
      const firstKey = this.tintedSheets.keys().next().value;
      if (firstKey !== undefined) {
        this.tintedSheets.delete(firstKey);
      }
    }
    this.tintedSheets.set(key, canvas);
    return canvas;
  }

  draw(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontName: string = 'fntM1',
    options: DrawTextOptions = {},
  ): { width: number; height: number } {
    if (!text) return { width: 0, height: 0 };

    const font = this.getFont(fontName);
    const align = options.align ?? 'left';
    const baseline = options.baseline ?? 'top';
    const baseColor = options.color ?? DEFAULT_NT_TEXT_COLOR;
    const shadow = options.shadow !== false;
    const outline = options.outline ?? false;
    const outlineWidth = options.outlineWidth ?? 1;
    const shadowColor = options.shadowColor ?? '#000000';
    const scale = options.scale ?? 1;
    const lineSpacing = options.lineSpacing ?? 1;
    const alpha = options.alpha ?? 1;

    const lines =
      options.maxWidth && options.maxWidth > 0
        ? wrapMarkupText(font, text, options.maxWidth, scale, baseColor)
        : parseMarkupLines(text, baseColor);

    const sx = (font?.scaleX || 1) * scale;
    const sy = (font?.scaleY || 1) * scale;
    const lineHeight = Math.round((font ? Math.max(1, font.lineHeight) : FALLBACK_LINE_HEIGHT) * sy);
    const stepY = lineHeight + Math.round(lineSpacing * scale);
    const totalHeight =
      lines.length === 0 ? 0 : lineHeight + Math.max(0, lines.length - 1) * stepY;

    let startY = Math.round(y);
    if (baseline === 'middle') {
      startY = Math.round(y - totalHeight / 2);
    } else if (baseline === 'bottom') {
      startY = Math.round(y - totalHeight);
    }

    const prevAlpha = ctx.globalAlpha;
    const effectiveAlpha = Math.max(0, Math.min(1, prevAlpha * alpha));
    ctx.globalAlpha = effectiveAlpha;

    const tex = font ? this.bundle.getTexture(font.tpag.textureId) : undefined;
    let maxW = 0;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const lineW = measurePlainLineWidth(font, line.plain, scale);
      if (lineW > maxW) maxW = lineW;

      let lineX = Math.round(x);
      if (align === 'center') {
        lineX = Math.round(x - lineW / 2);
      } else if (align === 'right') {
        lineX = Math.round(x - lineW);
      }
      const lineY = startY + li * stepY;

      if (outline) {
        if (outlineWidth >= 2) {
          ctx.globalAlpha = computeShadowPassAlpha(effectiveAlpha, 12);
          for (const [ox, oy] of [
            [-2, -1], [-2, 0], [-2, 1],
            [2, -1], [2, 0], [2, 1],
            [-1, -2], [0, -2], [1, -2],
            [-1, 2], [0, 2], [1, 2],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [-1, 0], [1, 0], [0, -1], [0, 1],
          ] as const) {
            this.drawLinePass(ctx, font, tex, line.runs, lineX + ox, lineY + oy, sx, sy, shadowColor);
          }
        } else {
          // Authentic Nuclear Throne crisp 8-way 1px pure-black pixel outline
          ctx.globalAlpha = computeShadowPassAlpha(effectiveAlpha, 8);
          this.drawLinePass(ctx, font, tex, line.runs, lineX - 1, lineY - 1, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX, lineY - 1, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX + 1, lineY - 1, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX - 1, lineY, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX + 1, lineY, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX - 1, lineY + 1, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX, lineY + 1, sx, sy, shadowColor);
          this.drawLinePass(ctx, font, tex, line.runs, lineX + 1, lineY + 1, sx, sy, shadowColor);
        }
        ctx.globalAlpha = effectiveAlpha;
      } else if (shadow) {
        ctx.globalAlpha = computeShadowPassAlpha(effectiveAlpha, 2);
        this.drawLinePass(ctx, font, tex, line.runs, lineX + 1, lineY + 1, sx, sy, shadowColor);
        this.drawLinePass(ctx, font, tex, line.runs, lineX, lineY + 1, sx, sy, shadowColor);
        ctx.globalAlpha = effectiveAlpha;
      }

      this.drawLinePass(ctx, font, tex, line.runs, lineX, lineY, sx, sy, null);
    }

    ctx.globalAlpha = prevAlpha;

    return { width: maxW, height: totalHeight };
  }

  private drawLinePass(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    font: FontDef | undefined,
    tex: TextureImageSource | undefined,
    runs: readonly ColoredRun[],
    startX: number,
    y: number,
    sx: number,
    sy: number,
    overrideColor: string | null,
  ): void {
    let cursorX = startX;

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r]!;
      const color = overrideColor ?? run.color;

      if (!font || !tex) {
        this.drawMonospaceFallback(ctx, run.text, cursorX, y, sx, sy, color);
        cursorX += run.text.length * FALLBACK_CHAR_ADVANCE * sx;
        continue;
      }

      const sheet =
        color === '#ffffff' || color === '#FFFFFF'
          ? null
          : this.getTintedFontSheet(font, tex, color);

      for (let i = 0; i < run.text.length; i++) {
        const code = run.text.charCodeAt(i);
        const glyph = resolveFontGlyph(font, code);
        if (!glyph) {
          this.drawMonospaceFallback(ctx, run.text[i]!, cursorX, y, sx, sy, color);
          cursorX += FALLBACK_CHAR_ADVANCE * sx;
          continue;
        }

        if (glyph.w > 0 && glyph.h > 0 && code !== 32) {
          const dx = Math.round(cursorX + glyph.offset * sx);
          const dy = Math.round(y);
          const dw = Math.max(1, Math.round(glyph.w * sx));
          const dh = Math.max(1, Math.round(glyph.h * sy));

          if (sheet) {
            ctx.drawImage(sheet, glyph.x, glyph.y, glyph.w, glyph.h, dx, dy, dw, dh);
          } else {
            ctx.drawImage(
              tex,
              font.tpag.srcX + glyph.x,
              font.tpag.srcY + glyph.y,
              glyph.w,
              glyph.h,
              dx,
              dy,
              dw,
              dh,
            );
          }
        }
        cursorX += glyph.shift * sx;
      }
    }
  }

  private drawMonospaceFallback(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    sx: number,
    sy: number,
    color: string,
  ): void {
    const px = Math.max(6, Math.round(8 * sy));
    ctx.save();
    ctx.font = `bold ${px}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
    ctx.restore();
    void sx;
  }
}
