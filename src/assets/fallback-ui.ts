import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  px,
  rect,
} from './fallback-fonts';
import {
  drawBossIntroPortraitHiBit,
  drawCharSelectCardHiBit,
  drawMutantBigPortraitHiBit,
} from './fallback-portraits';
import { PxCanvas, bayer4, makeRamp } from './pixel-art';

const INK = '#0d0a10';

// ============================================================================
// 1. KRUNKED THRONE HI-BIT TITLE EMBLEM (sprLogo 516x192 -> 258x96x8, sprLogoGlow)
//    Rendered on the main Title/Entry screen in BOTH Built-In Art & Steam Pack modes!
// ============================================================================

export const KRUNKED_LOGO_WIDTH = 258;
export const KRUNKED_LOGO_HEIGHT = 96;
export const KRUNKED_LOGO_ORIGIN_X = 129;
export const KRUNKED_LOGO_ORIGIN_Y = 48;
export const KRUNKED_LOGO_FRAMES = 8;

export const KRUNKED_LOGO_GLOW_WIDTH = 261;
export const KRUNKED_LOGO_GLOW_HEIGHT = 93;
export const KRUNKED_LOGO_GLOW_ORIGIN_X = 130;
export const KRUNKED_LOGO_GLOW_ORIGIN_Y = 45;

/**
 * Custom bold heavy-metal / wasteland comic sculptural letterforms rendered into
 * a 2x Hi-Bit PxCanvas with genuine angled diagonals, beveled bowls & serifs.
 * Coordinates are normalized within a 54x62 cell box (letter width ~50, height 60).
 */
function paintSculptedLetter(
  p: PxCanvas,
  ch: string,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
): void {
  const s = Math.max(9, Math.round(w * 0.27)); // Heavy stroke thickness
  const midY = y + Math.round(h * 0.48);
  const rX = x + w;
  const bY = y + h;

  switch (ch) {
    case 'K':
      p.poly([[x, y], [x + s + 2, y], [x + s, bY], [x, bY]], col);
      p.poly([[x + s - 2, midY - 2], [rX - s, y], [rX + 2, y], [x + s + 8, midY + 4]], col);
      p.poly([[x + s + 2, midY - 6], [x + s + 13, midY - 2], [rX + 2, bY], [rX - s - 2, bY]], col);
      break;
    case 'R':
      p.poly([[x, y], [x + s + 1, y], [x + s, bY], [x, bY]], col);
      p.poly([[x + s - 2, y], [rX - 8, y], [rX, y + 8], [rX, midY - 2], [rX - 9, midY + 6], [x + s - 2, midY + 6]], col);
      p.poly([[x + s + 4, midY + 1], [x + s + 16, midY + 1], [rX + 1, bY], [rX - s - 2, bY]], col);
      // Hollow bowl cutout
      p.poly([[x + s + 1, y + s - 2], [rX - s - 1, y + s - 2], [rX - s + 1, midY - 4], [x + s + 1, midY - 4]], '');
      break;
    case 'U':
      p.poly([[x, y], [x + s, y], [x + s, bY - 12], [x + s + 5, bY - s + 1], [rX - s - 5, bY - s + 1], [rX - s, bY - 12], [rX - s, y], [rX, y], [rX, bY - 8], [rX - 9, bY], [x + 9, bY], [x, bY - 8]], col);
      break;
    case 'N':
      p.poly([[x, y], [x + s, y], [x + s, bY], [x, bY]], col);
      p.poly([[rX - s, y], [rX, y], [rX, bY], [rX - s, bY]], col);
      p.poly([[x + 4, y], [x + s + 4, y], [rX - 4, bY], [rX - s - 4, bY]], col);
      break;
    case 'E':
      p.rect(x, y, s + 1, h, col);
      p.poly([[x + s - 2, y], [rX, y], [rX - 3, y + s - 1], [x + s - 2, y + s - 1]], col);
      p.poly([[x + s - 2, midY - Math.floor(s * 0.45)], [rX - 7, midY - Math.floor(s * 0.45)], [rX - 10, midY + Math.ceil(s * 0.45)], [x + s - 2, midY + Math.ceil(s * 0.45)]], col);
      p.poly([[x + s - 2, bY - s + 1], [rX, bY - s + 1], [rX - 2, bY], [x + s - 2, bY]], col);
      break;
    case 'D':
      p.poly([[x, y], [rX - 10, y], [rX, y + 10], [rX, bY - 10], [rX - 10, bY], [x, bY]], col);
      // Hollow D cutout
      p.poly([[x + s + 1, y + s - 1], [rX - s - 3, y + s - 1], [rX - s + 1, y + s + 4], [rX - s + 1, bY - s - 4], [rX - s - 3, bY - s + 1], [x + s + 1, bY - s + 1]], '');
      break;
    case 'T':
      p.poly([[x - 2, y], [rX + 2, y], [rX, y + s], [x, y + s]], col);
      p.poly([[x + Math.round((w - s - 2) * 0.5), y + s - 2], [x + Math.round((w + s + 2) * 0.5), y + s - 2], [x + Math.round((w + s) * 0.5), bY], [x + Math.round((w - s) * 0.5), bY]], col);
      break;
    case 'H':
      p.rect(x, y, s, h, col);
      p.rect(rX - s, y, s, h, col);
      p.rect(x + s - 2, midY - Math.floor(s * 0.48), w - s * 2 + 4, s, col);
      break;
    case 'O':
      p.poly([[x + 9, y], [rX - 9, y], [rX, y + 9], [rX, bY - 9], [rX - 9, bY], [x + 9, bY], [x, bY - 9], [x, y + 9]], col);
      p.poly([[x + s + 2, y + s - 1], [rX - s - 2, y + s - 1], [rX - s, y + s + 3], [rX - s, bY - s - 3], [rX - s - 2, bY - s + 1], [x + s + 2, bY - s + 1], [x + s, bY - s - 3], [x + s, y + s + 3]], '');
      break;
  }
}

/**
 * Shades an opaque word silhouette mask in `mask` into either:
 * - 'krunked': rich 6-step hue-shifted radioactive neon slime + Bayer dither + glossy highlights + organic slime drips
 * - 'throne': heavy riveted brushed wasteland chrome-steel with sky/horizon/desert reflection split & corner bolts
 */
function shadeWordFromMask(
  dst: PxCanvas,
  mask: PxCanvas,
  topY: number,
  wordH: number,
  style: 'krunked' | 'throne',
): void {
  const w = dst.w;
  const h = dst.h;

  // 1. Deep 3D extruded dark drop block (+0..+7px down, +0..+1px right) + thick outer ink outline
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask.isOpaque(x, y)) continue;
      // Extruded 3D bottom drop shadow
      for (let ey = 1; ey <= 7; ey++) {
        dst.set(x + (ey > 4 ? 1 : 0), y + ey, style === 'krunked' ? '#0a2410' : '#181c26');
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask.isOpaque(x, y)) continue;
      // 3px bold comic ink halo around every letter edge
      for (let oy = -3; oy <= 3; oy++) {
        for (let ox = -3; ox <= 3; ox++) {
          if (ox * ox + oy * oy <= 10 && !mask.isOpaque(x + ox, y + oy)) {
            dst.set(x + ox, y + oy, '#090610');
          }
        }
      }
      dst.set(x, y + 8, '#090610');
      dst.set(x, y + 9, '#090610');
    }
  }

  // 2. Interior pixel shading with distance-to-top-edge specular bevel & Bayer dithering!
  for (let y = 0; y < h; y++) {
    const t = Math.max(0, Math.min(1, (y - topY) / Math.max(1, wordH)));
    for (let x = 0; x < w; x++) {
      if (!mask.isOpaque(x, y)) continue;
      const topEmpty1 = !mask.isOpaque(x, y - 1);
      const topEmpty2 = !mask.isOpaque(x, y - 2);
      const topEmpty3 = !mask.isOpaque(x, y - 3);
      const leftEmpty1 = !mask.isOpaque(x - 1, y);
      const leftEmpty2 = !mask.isOpaque(x - 2, y);
      const botEmpty1 = !mask.isOpaque(x, y + 1);
      const botEmpty2 = !mask.isOpaque(x, y + 2);
      const rightEmpty1 = !mask.isOpaque(x + 1, y);
      // Sample Bayer on 2px grid so 1x nearest-neighbor blits preserve full ordered dither pattern!
      const b = bayer4(x >> 1, y >> 1) / 16;

      if (style === 'krunked') {
        // 6-tone glossy radioactive slime gradient
        let col = '#116120';
        const g = t + (b - 0.5) * 0.14;
        if (g < 0.22) col = '#a6ff5e';
        else if (g < 0.44) col = '#5cf043';
        else if (g < 0.68) col = '#27c235';
        else if (g < 0.86) col = '#158a27';
        else col = '#0d571c';

        // Glossy jelly bevels along exposed upper & left edges
        if (topEmpty1 || topEmpty2) col = '#e8ffbd';
        else if (topEmpty3 && leftEmpty2) col = '#ffffff';
        else if ((leftEmpty1 || leftEmpty2) && t < 0.65) col = '#c2ff85';
        else if (botEmpty1 || botEmpty2) col = '#0b4217';
        else if (rightEmpty1 && t > 0.25) col = '#106620';

        // Subtle organic radioactive internal slime sheen bubbles
        const sheen = Math.sin(x * 0.08 + y * 0.05) + Math.cos(x * 0.17 - y * 0.11);
        if (!topEmpty2 && !botEmpty2 && t > 0.2 && t < 0.55 && sheen > 1.55) {
          col = '#d6ffa1';
        }
        dst.set(x, y, col);
      } else {
        // Riveted brushed wasteland chrome-steel with classic heavy-metal horizon split!
        const split = 0.52 + Math.sin(x * 0.035) * 0.04;
        let col: string;
        if (t < split) {
          const u = t / split + (b - 0.5) * 0.14;
          if (u < 0.28) col = '#dce8f7';
          else if (u < 0.58) col = '#9eb0c7';
          else col = '#67788f';
        } else {
          const u = (t - split) / (1 - split) + (b - 0.5) * 0.14;
          if (u < 0.18) col = '#2c3342';
          else if (u < 0.52) col = '#4a5569';
          else if (u < 0.80) col = '#7a6f66'; // Warm wasteland desert bounce light!
          else col = '#453c3d';
        }
        // Subtle brushed horizontal grain
        if ((y & 3) === 0 && !topEmpty2 && !botEmpty2 && b > 0.5) {
          col = t < split ? '#b4c4d9' : '#586278';
        }
        // Razor metallic bevels
        if (topEmpty1 || topEmpty2) col = '#f5fbff';
        else if ((leftEmpty1 || leftEmpty2) && t < split) col = '#d4e2f2';
        else if (botEmpty1 || botEmpty2) col = '#1b202b';
        else if (rightEmpty1) col = '#2a3140';

        dst.set(x, y, col);
      }
    }
  }
}

function paintSlimeDripHiBit(p: PxCanvas, x: number, y: number, len: number, width = 8): void {
  const hw = Math.floor(width / 2);
  // Thick dark ink outline
  p.shadedCapsule(x, y, x, y + len, hw + 2.5, makeRamp('#090610', '#090610'));
  p.ellipse(x, y + len + 1, hw + 3, hw + 3, '#090610');
  // Glossy radioactive slime fill
  const slimeRamp = makeRamp('#38d942', '#0b4217');
  p.shadedCapsule(x, y, x, y + len, hw, slimeRamp);
  p.ellipse(x, y + len + 1, hw + 1, hw + 1, '#4df046');
  p.rect(x - hw + 1, y, Math.max(2, hw - 1), len, '#9cff63');
  p.ellipse(x - 1, y + len, Math.max(1, hw - 2), Math.max(1, hw - 2), '#e8ffbd');
}

const LOGO_KRUNKED_WORD = 'KRUNKED';
const LOGO_THRONE_WORD = 'THRONE';
const LOGO_SLIME_DRIPS: ReadonlyArray<[number, number, number]> = [
  [40, 14, 8], [108, 10, 7], [186, 15, 9], [268, 11, 7], [344, 14, 8], [412, 10, 7], [472, 13, 8],
];

export function drawKrunkedLogoGlowHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  _h: number,
): void {
  const cx = Math.floor(w * 0.5);
  const drawEllipGlow = (gy: number, rx: number, ry: number, col: string): void => {
    ctx.fillStyle = col;
    for (let dy = -ry; dy <= ry; dy += 2) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      if (span > 0) ctx.fillRect(ox + cx - span, oy + gy + dy, span * 2, 2);
    }
  };
  ctx.save();
  drawEllipGlow(52, 248, 46, 'rgba(46, 232, 72, 0.14)');
  drawEllipGlow(52, 220, 34, 'rgba(110, 255, 102, 0.16)');
  drawEllipGlow(134, 210, 42, 'rgba(92, 190, 155, 0.10)');
  drawEllipGlow(92, 92, 26, 'rgba(165, 255, 130, 0.14)');
  ctx.restore();
}

export function drawKrunkedLogoHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  f: number,
): void {
  const p = new PxCanvas(w, h);
  const steel = makeRamp('#5a6578');
  const gold = makeRamp('#e0a832');

  // 1. Heavy armored industrial wasteland backplate behind emblem seam
  p.poly(
    [[34, 82], [56, 70], [w - 56, 70], [w - 34, 82], [w - 34, 108], [w - 54, 118], [54, 118], [34, 108]],
    '#090610',
  );
  p.poly(
    [[40, 84], [58, 74], [w - 58, 74], [w - 40, 84], [w - 40, 106], [w - 56, 114], [56, 114], [40, 106]],
    steel.dark2,
  );
  p.rect(54, 78, w - 108, 4, steel.hi);
  p.rect(54, 82, w - 108, 4, gold.base);
  p.rect(54, 108, w - 108, 4, '#241c24');

  // Angled hazard caution stripes on left & right wings
  for (let s = 0; s < 4; s++) {
    const lx = 58 + s * 16;
    const rx = w - 122 + s * 16;
    p.poly([[lx, 106], [lx + 8, 88], [lx + 15, 88], [lx + 7, 106]], gold.light);
    p.poly([[rx, 88], [rx + 8, 106], [rx + 15, 106], [rx + 7, 88]], gold.light);
  }
  // Corner rivets on chassis plate
  for (const [rx, ry] of [[46, 86], [w - 50, 86], [46, 100], [w - 50, 100]] as const) {
    p.rect(rx, ry, 5, 5, '#090610');
    p.rect(rx + 1, ry + 1, 3, 3, steel.spec);
  }

  // 2. Top Word: sculpted dripping radioactive neon-green "KRUNKED"
  const kMask = new PxCanvas(w, h);
  const kW = 54;
  const kH = 66;
  const kGap = 10;
  const kTotal = LOGO_KRUNKED_WORD.length * kW + (LOGO_KRUNKED_WORD.length - 1) * kGap;
  const kStartX = Math.floor((w - kTotal) * 0.5);
  const kStartY = 12;
  for (let i = 0; i < LOGO_KRUNKED_WORD.length; i++) {
    paintSculptedLetter(kMask, LOGO_KRUNKED_WORD[i]!, kStartX + i * (kW + kGap), kStartY, kW, kH, '#ffffff');
  }
  shadeWordFromMask(p, kMask, kStartY, kH, 'krunked');

  // Rounded radioactive slime drips hanging cleanly above THRONE (zero bleed!)
  for (const [dx, dLen, dW] of LOGO_SLIME_DRIPS) {
    paintSlimeDripHiBit(p, dx, kStartY + kH + 1, dLen, dW);
  }

  // 3. Bottom Word: riveted heavy-metal brushed steel "THRONE" (progressively forged 0..6, complete at 7!)
  const revealed = f >= 6 ? 6 : Math.min(6, f);
  if (revealed > 0) {
    const tMask = new PxCanvas(w, h);
    const tW = 58;
    const tH = 68;
    const tGap = 12;
    const tTotal = LOGO_THRONE_WORD.length * tW + (LOGO_THRONE_WORD.length - 1) * tGap;
    const tStartX = Math.floor((w - tTotal) * 0.5);
    const tStartY = 108;
    for (let i = 0; i < revealed; i++) {
      paintSculptedLetter(tMask, LOGO_THRONE_WORD[i]!, tStartX + i * (tW + tGap), tStartY, tW, tH, '#ffffff');
    }
    shadeWordFromMask(p, tMask, tStartY, tH, 'throne');

    // Riveted industrial bolt heads along upper & lower corners of THRONE letters
    for (let i = 0; i < revealed; i++) {
      const lx = tStartX + i * (tW + tGap);
      for (const [bx, by] of [[lx + 6, tStartY + 6], [lx + tW - 9, tStartY + 6], [lx + 6, tStartY + tH - 9], [lx + tW - 9, tStartY + tH - 9]] as const) {
        if (tMask.isOpaque(bx, by) && tMask.isOpaque(bx + 3, by + 3)) {
          p.rect(bx, by, 4, 4, '#181c26');
          p.rect(bx, by, 2, 2, '#eef6ff');
        }
      }
    }
  }

  // 4. Central radioactive nuclear reactor jewel + crisp 4-point metallic glints on final frame 7!
  if (f === 7) {
    const cx = Math.floor(w * 0.5);
    p.bevelBox(cx - 18, 84, 36, 20, steel, true);
    p.rect(cx - 14, 88, 28, 12, '#090610');
    p.rect(cx - 12, 90, 24, 8, '#28d444');
    p.rect(cx - 9, 91, 18, 6, '#7dff75');
    p.rect(cx - 5, 92, 10, 4, '#f4ffe8');
    for (const [gx, gy] of [[kStartX + 10, kStartY + 5], [kStartX + kTotal - 16, kStartY + 5], [90, 114], [w - 92, 114]] as const) {
      p.rect(gx - 5, gy, 11, 2, '#ffffff');
      p.rect(gx, gy - 5, 2, 11, '#ffffff');
      p.rect(gx - 2, gy - 2, 5, 5, '#e8ffbd');
    }
  }

  p.flush(ctx, ox, oy);
}

type LogoSurface = HTMLCanvasElement | OffscreenCanvas;

let cachedKrunkedLogoGlow: LogoSurface | null | undefined;
const cachedKrunkedLogoFrames = new Map<number, LogoSurface>();

function createLogoSurface(w: number, h: number): { canvas: LogoSurface; ctx: DrawCtx } | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) return { canvas: c, ctx };
  } else if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    if (ctx) return { canvas: c, ctx };
  }
  return null;
}

/**
 * Lazily renders and caches the 2x Hi-Bit KRUNKED THRONE glow aura (522x186) so the main
 * Title screen renders our emblem identically in both Built-In Art mode and Steam Pack mode.
 */
export function getKrunkedLogoGlowSurface(): LogoSurface | null {
  if (cachedKrunkedLogoGlow !== undefined) return cachedKrunkedLogoGlow;
  const w = KRUNKED_LOGO_GLOW_WIDTH * 2;
  const h = KRUNKED_LOGO_GLOW_HEIGHT * 2;
  const surf = createLogoSurface(w, h);
  if (!surf) {
    cachedKrunkedLogoGlow = null;
    return null;
  }
  surf.ctx.imageSmoothingEnabled = false;
  drawKrunkedLogoGlowHiBit(surf.ctx, 0, 0, w, h);
  cachedKrunkedLogoGlow = surf.canvas;
  return cachedKrunkedLogoGlow;
}

/**
 * Lazily renders and caches a 2x Hi-Bit KRUNKED THRONE emblem frame (516x192, frames 0..7)
 * so Steam Pack mode displays KRUNKED THRONE instead of Steam's "NUCLEAR THRONE" sprLogo.
 */
export function getKrunkedLogoFrameSurface(frame: number): LogoSurface | null {
  const f = Math.max(0, Math.min(KRUNKED_LOGO_FRAMES - 1, Math.floor(frame)));
  const existing = cachedKrunkedLogoFrames.get(f);
  if (existing) return existing;
  const w = KRUNKED_LOGO_WIDTH * 2;
  const h = KRUNKED_LOGO_HEIGHT * 2;
  const surf = createLogoSurface(w, h);
  if (!surf) return null;
  surf.ctx.imageSmoothingEnabled = false;
  drawKrunkedLogoHiBit(surf.ctx, 0, 0, w, h, f);
  cachedKrunkedLogoFrames.set(f, surf.canvas);
  return surf.canvas;
}

function registerLogoSprites(b: FallbackAtlasBuilder): void {
  // sprLogoGlow: 522x186 Hi-Bit -> logical 261x93, orig=(130, 45), 1 frame smooth elliptical radioactive aura
  b.addSpriteHiBit(
    'sprLogoGlow',
    KRUNKED_LOGO_GLOW_WIDTH,
    KRUNKED_LOGO_GLOW_HEIGHT,
    KRUNKED_LOGO_GLOW_ORIGIN_X,
    KRUNKED_LOGO_GLOW_ORIGIN_Y,
    1,
    drawKrunkedLogoGlowHiBit,
  );

  // sprLogo: 516x192 Hi-Bit -> logical 258x96, orig=(129, 48), 8 frames
  b.addSpriteHiBit(
    'sprLogo',
    KRUNKED_LOGO_WIDTH,
    KRUNKED_LOGO_HEIGHT,
    KRUNKED_LOGO_ORIGIN_X,
    KRUNKED_LOGO_ORIGIN_Y,
    KRUNKED_LOGO_FRAMES,
    drawKrunkedLogoHiBit,
  );

  // Dedicated aliases sharing exact TPAG rects (0 extra atlas pixels)
  b.addAlias('sprKrunkedLogo', 'sprLogo');
  b.addAlias('sprKrunkedLogoGlow', 'sprLogoGlow');
}

// ============================================================================
// 2. ALL 29 BESPOKE CRISP 1x FULL-BLEED MUTATION CARDS (24x32),
//    VIBRANT LIME-GREEN SHAPED HUD ICONS (16x16), 24 ULTRA CARDS & 13 CROWNS
// Study 11a_levelup.png (full-bleed edge-to-edge 24x32 cards) &
// 15_palace_7_1.png / 21_paused.png (vivid lime-green & black-outlined HUD icons)!
// ============================================================================

const HUD_INK = '#000000';

interface IconPalette {
  d: string; // dark shade ('1')
  m: string; // main color ('2')
  h: string; // bright highlight ('3')
  a: string; // accent ('4')
  b: string; // accent bright ('5')
  cardBg: string; // deep full-bleed backdrop
  cardMid: string; // lit full-bleed backdrop
  cardTrim: string; // energetic atmospheric glow / streaks
}

const MUTATION_PALETTES: readonly IconPalette[] = [
  // 0: Fallback Rad
  { d: '#22841e', m: '#62ec48', h: '#c4ff88', a: '#ffe448', b: '#ffffff', cardBg: '#122c14', cardMid: '#1e4a20', cardTrim: '#62ec48' },
  // 1: Rhino Skin (armored olive-lime rhino hide + bright ivory horn!)
  { d: '#2c6830', m: '#66c458', h: '#b8f498', a: '#f4eedc', b: '#ffffff', cardBg: '#1c2824', cardMid: '#304438', cardTrim: '#7ce868' },
  // 2: Extra Feet (vibrant neon-green mutated sprinting foot + gold speed arcs)
  { d: '#208824', m: '#5ef04a', h: '#bcff90', a: '#ffe048', b: '#ffffff', cardBg: '#122e18', cardMid: '#204e26', cardTrim: '#62ec48' },
  // 3: Plutonium Hunger (blazing neon-green rad core pulling glowing arcs)
  { d: '#1c801c', m: '#62f448', h: '#d0ff94', a: '#b8ff68', b: '#ffffff', cardBg: '#0c2612', cardMid: '#184a20', cardTrim: '#78ff58' },
  // 4: Rabbit Paw (crisp bone-white lucky paw + radiant lime & gold charm)
  { d: '#2c7e2c', m: '#f0ece2', h: '#ffffff', a: '#62ec48', b: '#ffe048', cardBg: '#1c2a1e', cardMid: '#30482e', cardTrim: '#f5cc38' },
  // 5: Throne Butt (glowing radioactive lime-green nuclear throne crest!)
  { d: '#227a24', m: '#62ec48', h: '#c8ff8c', a: '#8c98a6', b: '#ffffff', cardBg: '#18241e', cardMid: '#284030', cardTrim: '#62ec48' },
  // 6: Lucky Shot (vivid emerald clover + gleaming gold bullet)
  { d: '#1e8824', m: '#5cf048', h: '#bcff8c', a: '#ffd438', b: '#fff8b0', cardBg: '#122c18', cardMid: '#204e28', cardTrim: '#ffd438' },
  // 7: Bloodlust (vivid crimson blood-heart with fierce white highlight)
  { d: '#881422', m: '#ee283a', h: '#ff7c88', a: '#ffccd0', b: '#ffffff', cardBg: '#320e16', cardMid: '#5a1a26', cardTrim: '#ff4454' },
  // 8: Gamma Guts (blazing radioactive lime-green coiled mutant stomach)
  { d: '#1e841c', m: '#6cf844', h: '#d8ff90', a: '#ffe848', b: '#ffffff', cardBg: '#0e2c12', cardMid: '#1e5420', cardTrim: '#84ff54' },
  // 9: Second Stomach (bright lime belly pouch + vivid red/white medkit cross)
  { d: '#208626', m: '#5ef04c', h: '#b8ff90', a: '#f02e3a', b: '#ffffff', cardBg: '#142e1a', cardMid: '#244e2a', cardTrim: '#ff4450' },
  // 10: Back Muscle (muscular tan/lime flexed shoulders + bright gold ammo belt)
  { d: '#7e4a28', m: '#e2a06c', h: '#fad2a0', a: '#ffd438', b: '#62ec48', cardBg: '#2e1e14', cardMid: '#4e3422', cardTrim: '#ffd438' },
  // 11: Scarier Face (iconic radioactive green & bone-white snarling monster skull!)
  { d: '#228222', m: '#68f04c', h: '#d8ffaa', a: '#f4f8ee', b: '#ff3c44', cardBg: '#142818', cardMid: '#264a28', cardTrim: '#68f04c' },
  // 12: Euphoria (hypnotic glowing neon-green spiral psychic eye)
  { d: '#20822c', m: '#62f058', h: '#d4ffb8', a: '#b878ff', b: '#ffffff', cardBg: '#1c1434', cardMid: '#32245a', cardTrim: '#62f058' },
  // 13: Long Arms (vivid lime-green mutated arm swinging gleaming steel blade!)
  { d: '#208426', m: '#5ef04e', h: '#b8ff90', a: '#dce8f4', b: '#ffffff', cardBg: '#142a22', cardMid: '#24483a', cardTrim: '#a8e8ff' },
  // 14: Boiling Veins (blazing orange-crimson flame erupting over veins)
  { d: '#981a12', m: '#f44022', h: '#ff9628', a: '#fff048', b: '#ffffff', cardBg: '#361410', cardMid: '#642418', cardTrim: '#ffa828' },
  // 15: Shotgun Shoulders (bright crimson-and-gold shells mounted on lime shoulders)
  { d: '#247e28', m: '#60e64e', h: '#b8ff90', a: '#f03428', b: '#ffd838', cardBg: '#281a1c', cardMid: '#462a2c', cardTrim: '#f03428' },
  // 16: Recycle Gland (bright neon-green recycle loop + gleaming gold bullet)
  { d: '#1c8824', m: '#58f24e', h: '#c4ff98', a: '#ffd438', b: '#ffffff', cardBg: '#102c18', cardMid: '#1e5028', cardTrim: '#58f24e' },
  // 17: Laser Brain (iconic blazing neon-green wrinkly brain + beam!)
  { d: '#208c20', m: '#68f848', h: '#d8ff98', a: '#9cff68', b: '#ffffff', cardBg: '#0e2e14', cardMid: '#1e5824', cardTrim: '#78ff58' },
  // 18: Last Wish (radiant golden star/flower + vibrant green leaves)
  { d: '#a87212', m: '#ffd438', h: '#fff8a0', a: '#58ec48', b: '#ffffff', cardBg: '#2c2412', cardMid: '#52421c', cardTrim: '#ffe858' },
  // 19: Eagle Eyes (sharp golden-lime eagle eye + vivid crimson crosshair)
  { d: '#247c28', m: '#62e84c', h: '#c8ff90', a: '#f4343c', b: '#fff058', cardBg: '#1a242c', cardMid: '#2c3e48', cardTrim: '#ffd838' },
  // 20: Impact Wrists (slamming lime/tan fist + fiery shockwave burst)
  { d: '#227e24', m: '#64ec4c', h: '#c4ff94', a: '#ff7c24', b: '#ffffff', cardBg: '#2c1c14', cardMid: '#503220', cardTrim: '#ff8c28' },
  // 21: Bolt Marrow (blazing neon-green homing bolt + crisp bone fletch)
  { d: '#1c8624', m: '#5ef44c', h: '#ceffa4', a: '#f4eedc', b: '#ffffff', cardBg: '#122c1a', cardMid: '#20502c', cardTrim: '#5ef44c' },
  // 22: Stress (sweating hyper-tense neon-green face + bright red vein!)
  { d: '#267c28', m: '#64e650', h: '#c4ff98', a: '#f42c38', b: '#ffffff', cardBg: '#2a161c', cardMid: '#4c242c', cardTrim: '#f43844' },
  // 23: Trigger Fingers (vivid lime mutated finger squeezing gun + yellow spark!)
  { d: '#247c28', m: '#62e84c', h: '#c4ff94', a: '#ffa028', b: '#fff898', cardBg: '#222026', cardMid: '#3a3440', cardTrim: '#ffa830' },
  // 24: Sharp Teeth (snarling vivid crimson jaws + gleaming white fangs!)
  { d: '#8c1424', m: '#ec283a', h: '#ff7480', a: '#f6f2ea', b: '#ffffff', cardBg: '#341018', cardMid: '#5c1c28', cardTrim: '#ff5c68' },
  // 25: Patience (iconic glowing neon-green wasteland clock dial — exact 15_palace_7_1.png!)
  { d: '#1c8420', m: '#68f440', h: '#d4ff90', a: '#242c28', b: '#ffffff', cardBg: '#102c16', cardMid: '#205224', cardTrim: '#78ff50' },
  // 26: Hammerhead (armored olive-lime skull smashing stone + orange sparks)
  { d: '#287a2c', m: '#66e054', h: '#c4ff98', a: '#ff9028', b: '#fff490', cardBg: '#20261e', cardMid: '#384434', cardTrim: '#ff9028' },
  // 27: Strong Spirit (glowing pure-white/cyan halo over vivid lime mutant head!)
  { d: '#227c2a', m: '#5ce654', h: '#b8ff98', a: '#b8f4ff', b: '#ffffff', cardBg: '#122230', cardMid: '#203c54', cardTrim: '#ffffff' },
  // 28: Open Mind (cracked lime/bone skull glowing with radiant golden light!)
  { d: '#247c28', m: '#d4e8c8', h: '#ffffff', a: '#ffd438', b: '#64f048', cardBg: '#201e2c', cardMid: '#38344e', cardTrim: '#ffd438' },
  // 29: Heavy Heart (riveted crimson heart studded with gold bullets)
  { d: '#841422', m: '#ea283a', h: '#ff7c88', a: '#ffd438', b: '#d0dce8', cardBg: '#2e141c', cardMid: '#52222e', cardTrim: '#ea283a' },
];

// Crisp 14x14 hand-crafted pixel-art silhouettes for HUD mutation icons (16x16)!
// Characters: '1'=dark, '2'=main, '3'=hi, '4'=accent, '5'=bright, 'w'=white, 'k'=dark ink interior
const MUTATION_GRIDS_14: readonly (readonly string[])[] = [
  // 0: Fallback Rad symbol
  ['....22..22....', '...232..232...', '...222..222...', '.....4444.....', '....45554.....', '.....4444.....', '...122..221...', '..1232..2321..', '...122..221...'],
  // 1: Rhino Skin (fierce rhino head + big curved ivory horn!)
  ['..........44..', '.........454..', '........444...', '..33....44....', '.332222.444...', '33222222444...', '32212w22224...', '22112k22222...', '12112222211...', '.111122111....'],
  // 2: Extra Feet (mutated fast running foot + golden speed arcs)
  ['54....332.....', '.54..3322.....', '..54.3222.....', '...4.2221.....', '.....2221.....', '....232211....', '....23222233..', '....222222322.', '....111111111.'],
  // 3: Plutonium Hunger (glowing green rad orb pulling magnetic arcs)
  ['.44........44.', '45..........54', '4...33333....4', '4..33ww322...4', '4..3wwwww21..4', '4..32333221..4', '4...222211...4', '45..11111...54', '.44........44.'],
  // 4: Rabbit Paw (lucky bone-white paw + lime & gold charm ring)
  ['.....545......', '....5...5.....', '.....444......', '....33322.....', '...33www21....', '...3wwwww21...', '..3wwkwwkw21..', '..32wkwwkw21..', '..222wwww21...', '...1111111....'],
  // 5: Throne Butt (glowing green nuclear crown/throne crest)
  ['.5..3333..5...', '.33.3553.33...', '..333223332...', '.3222222221...', '.3213553121...', '.3213ww3121...', '.2212222121...', '..22111121....', '...111111.....'],
  // 6: Lucky Shot (bright green 4-leaf clover + gleaming gold bullet)
  ['..332....45...', '.33222..454...', '..22221.444...', '....21..454...', '..33221.444...', '.332221.454...', '..2211..444...', '....1...444...'],
  // 7: Bloodlust (vivid crimson blood-heart with white gleam)
  ['..332...332...', '.33w22.22221..', '.3ww22222221..', '.32222222221..', '..222222221...', '...2222221....', '....22221.....', '.....221......', '......1.......'],
  // 8: Gamma Guts (glowing green radioactive coiled gut)
  ['...3333333....', '..332222221...', '.32245554221..', '.32222222221..', '.32455555421..', '.22223332211..', '..245555421...', '...1222211....', '.....1111.....'],
  // 9: Second Stomach (green pouch + bold white/red medkit cross)
  ['...3333333....', '..332222221...', '.32225445221..', '.32255445521..', '.32544444451..', '.32544444451..', '.22255445511..', '..222544511...', '...1111111....'],
  // 10: Back Muscle (buff shoulders + diagonal gold bullet belt)
  ['...455554.....', '..333222211...', '.33222452211..', '.32224542211..', '.32245422211..', '.22454222211..', '..222211221...', '...1111111....'],
  // 11: Scarier Face (snarling horned lime-green skull with glowing eyes!)
  ['.33........33.', '..3333333333..', '.332222222221.', '.32kk2w2kk221.', '.32k5kwk5k221.', '..222wkww211..', '..22.4.4.4.1..', '..22.k.k.k.1..', '...11111111...'],
  // 12: Euphoria (hypnotic glowing green spiral eye)
  ['...3333332....', '.33222222211..', '.322..44..21..', '32..45554..21.', '32.454k454.21.', '32..45554..21.', '.221..44..11..', '..112222111...'],
  // 13: Long Arms (mutated green arm brandishing bright silver sword!)
  ['.........555..', '........554...', '.......554....', '......554.....', '.....544......', '..33444.......', '.3322232......', '33222221......', '1222211.......'],
  // 14: Boiling Veins (roaring orange/yellow flame over pulsing veins)
  ['.....54.......', '....5544..4...', '...45444.44...', '..3245422332..', '.32224222221..', '.22454224421..', '..2442245411..', '...22244211...', '....111111....'],
  // 15: Shotgun Shoulders (twin red-and-gold shotgun shells on lime shoulders!)
  ['..444...444...', '..4w4...4w4...', '..444...444...', '..444...444...', '..444...444...', '..555...555...', '..555...555...', '.33222222211..', '.22111111111..'],
  // 16: Recycle Gland (bright green recycle loop around gold bullet!)
  ['...3333332....', '..332222221...', '.32...45...21.', '.32..4544..21.', '.32..4444..21.', '.221.4444.121.', '..221....122..', '...12222221...'],
  // 17: Laser Brain (glowing neon-green wrinkly brain + blazing laser!)
  ['..333322......', '.33w33322.....', '.32k232221....', '33222k22444444', '32k22224555555', '3222k222444444', '.22122221.....', '..111111......'],
  // 18: Last Wish (radiant golden star + green stem)
  ['......3.......', '.....332......', '.....322......', '333332w522221.', '.22224554221..', '....245421....', '.....2421.....', '......44......'],
  // 19: Eagle Eyes (sharp lime-gold eagle eye + red crosshair!)
  ['......4.......', '...3334333....', '.33224554221..', '444245k542444.', '.22224554221..', '...1114111....', '......4.......'],
  // 20: Impact Wrists (slamming muscular fist + orange shockwaves!)
  ['.........54...', '..33332...54..', '.332k2k2...54.', '33222221..554.', '32222221.5554.', '32222221..554.', '.2211111...54.', '.........54...'],
  // 21: Bolt Marrow (curving green homing crossbow bolt + bone tip!)
  ['.........33...', '.........332..', '...4555553322.', '.4555555533222', '455......3322.', '4........332..', '.........33...'],
  // 22: Stress (sweating wide-eyed tense lime-green face + red vein!)
  ['...3333333....', '..332222221...', '.322ww2ww224..', '.322wk2wk2444.', '.32222222224..', '.322kkkkk221..', '.222wkwkw211..', '..222222211...', '...1111111....'],
  // 23: Trigger Fingers (gun trigger + bright lime finger + muzzle flash!)
  ['.222222222.54.', '23333333215544', '2222222221.54.', '221..333..1...', '221..3321.....', '221...321.....', '221..221......', '1111111.......'],
  // 24: Sharp Teeth (snarling red jaws lined with jagged white fangs!)
  ['..3333333333..', '.322222222221.', '.25w5.5w5.5w1.', '.24w4.4w4.4w1.', '.2.4...4...41.', '.2...4...4..1.', '.2..4w4.4w4.1.', '.222222222221.', '..1111111111..'],
  // 25: Patience (glowing neon-green circular wasteland clock dial — exact video icon!)
  ['....333333....', '..3322222233..', '.322224422221.', '.322224422221.', '.322224444221.', '.322222222221.', '.222222222211.', '..2222222211..', '....111111....'],
  // 26: Hammerhead (armored lime-green hammerhead skull smashing stone!)
  ['.33333333332..', '3332222222211.', '3222222222211.', '2211111111111.', '....45..54....', '...45422454...', '..45.2321.54..', '.....2221.....', '.....1111.....'],
  // 27: Strong Spirit (ICONIC pure-white glowing halo hovering above lime mutant head!)
  ['...55555555...', '.554444444455.', '...55555555...', '..............', '....333333....', '...33222221...', '...32k22k21...', '...22222211...', '....111111....'],
  // 28: Open Mind (cracked lime/bone skull glowing with golden treasure light!)
  ['.....5555.....', '....455554....', '...33455433...', '..3222442221..', '..32kk22kk21..', '..2222222211..', '...22k22k11...', '....111111....'],
  // 29: Heavy Heart (armored iron crimson heart studded with gold bullets!)
  ['..332...332...', '.33222.22221..', '55544444444555', '44422455422444', '.322245542221.', '..2224444221..', '...22222221...', '....222221....', '.....1111.....'],
];

const ULTRA_PALETTES_24: readonly IconPalette[] = [
  { d: '#754614', m: '#d9982b', h: '#ffe073', a: '#4de878', b: '#ffffff', cardBg: '#10241a', cardMid: '#1f4430', cardTrim: '#f5c838' },
  { d: '#946511', m: '#f2c138', h: '#fff59e', a: '#6ef2ff', b: '#ffffff', cardBg: '#102030', cardMid: '#1e3c56', cardTrim: '#ffe048' },
  { d: '#641a8e', m: '#c458ec', h: '#f4bcff', a: '#ff3c5c', b: '#ffc4cc', cardBg: '#221034', cardMid: '#401e60', cardTrim: '#f5c838' },
  { d: '#78228e', m: '#dc68ff', h: '#ffffff', a: '#ffe048', b: '#fff8c0', cardBg: '#261030', cardMid: '#481e58', cardTrim: '#ffe048' },
  { d: '#284a9e', m: '#5898ff', h: '#c0e0ff', a: '#f5cc48', b: '#ffffff', cardBg: '#101c3a', cardMid: '#20366c', cardTrim: '#f5c838' },
  { d: '#542a9e', m: '#9268ff', h: '#e0d4ff', a: '#ff5488', b: '#ffffff', cardBg: '#1e1038', cardMid: '#3a2068', cardTrim: '#ffe048' },
  { d: '#8c7e6c', m: '#ece2d0', h: '#ffffff', a: '#ff5c28', b: '#ffe868', cardBg: '#2c1216', cardMid: '#542228', cardTrim: '#f5c838' },
  { d: '#847868', m: '#e4dac6', h: '#ffffff', a: '#58ff70', b: '#dcffe0', cardBg: '#16241c', cardMid: '#2c4634', cardTrim: '#ffe048' },
  { d: '#1e782c', m: '#4ce05c', h: '#bcffc0', a: '#ec3044', b: '#ffffff', cardBg: '#102616', cardMid: '#204a2a', cardTrim: '#f5c838' },
  { d: '#227a2e', m: '#58e864', h: '#c8ffca', a: '#ff385c', b: '#ffe868', cardBg: '#241020', cardMid: '#441e3c', cardTrim: '#ffe048' },
  { d: '#9e6c12', m: '#f5c838', h: '#fff8b0', a: '#ffffff', b: '#ffec78', cardBg: '#221830', cardMid: '#422e5a', cardTrim: '#f5c838' },
  { d: '#207a32', m: '#4ce064', h: '#c8ffd0', a: '#f5c838', b: '#ffffff', cardBg: '#122618', cardMid: '#244a2e', cardTrim: '#ffe048' },
  { d: '#546274', m: '#9cb0c8', h: '#e8f2fc', a: '#ff9834', b: '#fff698', cardBg: '#201c2c', cardMid: '#3c3452', cardTrim: '#f5c838' },
  { d: '#8a581a', m: '#e8b438', h: '#fff298', a: '#58ff70', b: '#ff4454', cardBg: '#281c12', cardMid: '#4c3420', cardTrim: '#ffe048' },
  { d: '#4e6070', m: '#9ab4c8', h: '#e4f2fc', a: '#f5c838', b: '#58ff78', cardBg: '#12222c', cardMid: '#224052', cardTrim: '#f5c838' },
  { d: '#485a68', m: '#8ea4b4', h: '#d8e8f4', a: '#58ff78', b: '#ffe048', cardBg: '#142422', cardMid: '#264440', cardTrim: '#ffe048' },
  { d: '#9e1c26', m: '#f03440', h: '#ff969e', a: '#ffb028', b: '#fff8a8', cardBg: '#301214', cardMid: '#5a2024', cardTrim: '#f5c838' },
  { d: '#546880', m: '#b8cee8', h: '#ffffff', a: '#5ce8ff', b: '#ff4858', cardBg: '#141e2e', cardMid: '#263a58', cardTrim: '#ffe048' },
  { d: '#4c6448', m: '#90ae8a', h: '#d8ecd4', a: '#f5c838', b: '#ffffff', cardBg: '#1a261a', cardMid: '#324832', cardTrim: '#f5c838' },
  { d: '#785e42', m: '#caaa7e', h: '#faecd4', a: '#ff5448', b: '#ffe868', cardBg: '#2c161a', cardMid: '#522830', cardTrim: '#ffe048' },
  { d: '#18822c', m: '#4eff68', h: '#d8ffdc', a: '#d8ff48', b: '#ffffff', cardBg: '#0c2612', cardMid: '#184c22', cardTrim: '#f5c838' },
  { d: '#5e24a8', m: '#ba60ff', h: '#f0ccff', a: '#4eff78', b: '#ffffff', cardBg: '#1c1030', cardMid: '#361e5c', cardTrim: '#ffe048' },
  { d: '#1e54be', m: '#4ea6ff', h: '#c8f4ff', a: '#ffe048', b: '#ffffff', cardBg: '#0e1c3a', cardMid: '#1c366e', cardTrim: '#f5c838' },
  { d: '#2c5ea8', m: '#6cb8ff', h: '#e8f8ff', a: '#6ef6ff', b: '#ffffff', cardBg: '#102234', cardMid: '#204264', cardTrim: '#ffe048' },
];

const ULTRA_GRIDS_14: readonly (readonly string[])[] = [
  ['...4.5.4......', '.33333333322..', '322145541111..', '333335533321..', '322214412211..', '.22222222211..', '..111111111...'],
  ['.....3........', '....332.......', '.333w5w2221...', '..22545221....', '...32.221.....', '.444454444....', '.4554554554...'],
  ['.32..332..32..', '.33223322321..', '.32245444211..', '.22454444211..', '..224444211...', '...1111111....'],
  ['....33322..4..', '..33w2222145..', '.33ww22221.4..', '.322222221454.', '..22222211.4..', '....1111...4..'],
  ['...45...45....', '...3333322....', '.322wwww211...', '32ww1111ww11..', '.222wwww211...', '...1111111....', '.45.......45..'],
  ['4...333...4...', '45.3wwww2.54..', '4..3w11w2..4..', '45.2wwww2.54..', '4...1111...4..'],
  ['.5.4.5.4.5....', '..4555554.....', '..3333322.....', '.33wwwww21....', '.32.w.w.21....', '..2222211.....', '...11111......'],
  ['.54..54..54...', '.44..44..44...', '.332....322...', '33ww....ww21..', '32.w....w.21..', '.221....121...'],
  ['32........23..', '321.4444.122..', '221455554121..', '2214w44w4121..', '22144ww44121..', '.2214444121...', '...111111.....'],
  ['.444....444...', '45544..45544..', '.444.44.444...', '..32455432....', '.3221443221...', '..11132111....'],
  ['..55555555....', '.....3........', '....332.......', '.w.324421.w...', 'www224w42www..', '.w.222221.w...', '..11111111....'],
  ['...455554.....', '..33333322....', '.3224554211...', '.3245222211...', '.2224554211...', '..11111111....'],
  ['54........45..', '543332233445..', '..22211222....', '...221122.....', '.54......45...', '.5433223345...'],
  ['.55.44.ww.33..', '333333333322..', '322554433w11..', '322554433w11..', '.2222222211...', '..11111111....'],
  ['..4..44..4....', '..44444444....', '.3333333322...', '322555552211..', '.2222222211...', '..11....11....'],
  ['.3333333322...', '322442244211..', '.11......11...', '...555555.....', '..544w4445....', '..11111111....'],
  ['.....5........', '....554.......', '...45444......', '.3333333322...', '322222222211..', '21............'],
  ['...444444.....', '.44w....w44...', '44....333.44..', '44...33w2.44..', '..44.33w2.....', '....5522......'],
  ['.32......32...', '3221.44.1223..', '344145541443..', '222145w41222..', '2221.44.1222..', '.111....1111..'],
  ['5.4....4.5....', '.54333345.....', '...32221......', '...22221......', '.32.111.32....', '.111...111....'],
  ['...44..44.....', '.3344334422...', '322112211211..', '.2222112211...', '454221222454..', '.44.1111.44...'],
  ['...444444.....', '.443333224....', '432..332.14...', '432.3ww2114...', '.422.22114....', '...444444.....'],
  ['.3w..3w..3w...', '.2w..2w..2w...', '.2w..2w..2w...', '42w442w442w4..', '455545554554..', '.1111111111...'],
  ['...444444.....', '.44w....w44...', '4..333333..4..', '4..32ww21..4..', '.44.1111.44...', '...444444.....'],
];

function paintEmblem1x(
  dst: PxCanvas,
  grid: readonly string[],
  pal: IconPalette,
): void {
  const map: Record<string, string> = {
    '1': pal.d,
    '2': pal.m,
    '3': pal.h,
    '4': pal.a,
    '5': pal.b,
    w: '#ffffff',
    k: HUD_INK,
  };
  const gh = grid.length;
  const gw = grid[0]!.length;
  const emb = new PxCanvas(dst.w, dst.h);
  const startX = Math.floor((dst.w - gw) * 0.5);
  const startY = Math.floor((dst.h - gh) * 0.5);

  for (let gy = 0; gy < gh; gy++) {
    const row = grid[gy]!;
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx]!;
      if (ch === '.' || ch === ' ') continue;
      const col = map[ch];
      if (col) emb.set(startX + gx, startY + gy, col);
    }
  }
  emb.outline(HUD_INK);
  for (let y = 0; y < dst.h; y++) {
    for (let x = 0; x < dst.w; x++) {
      const c = emb.get(x, y);
      if (c) dst.set(x, y, c);
    }
  }
}

function compositeLayer(dst: PxCanvas, fg: PxCanvas): void {
  for (let y = 0; y < dst.h; y++) {
    for (let x = 0; x < dst.w; x++) {
      const c = fg.get(x, y);
      if (c) dst.set(x, y, c);
    }
  }
}

/**
 * Full-bleed edge-to-edge 24x32 comic illustration backdrop (ZERO empty inner box!).
 * Matches the rich full-bleed Nuclear Throne Level Up portrait cards in 11a_levelup.png!
 */
function paintFullBleedBackdrop(p: PxCanvas, pal: IconPalette, mode: 'radial' | 'diag' | 'vertical' | 'burst'): void {
  const w = p.w;
  const h = p.h;
  p.rect(0, 0, w, h, pal.cardBg);
  if (mode === 'radial') {
    p.ellipse(12, 15, 13, 15, pal.cardMid);
    p.ellipse(11, 13, 7, 8, pal.d);
  } else if (mode === 'diag') {
    p.poly([[0, 0], [w, 0], [w, 16], [0, 24]], pal.cardMid);
    p.line(-2, 22, 25, 4, pal.cardTrim, 2);
  } else if (mode === 'burst') {
    p.ellipse(12, 16, 12, 14, pal.cardMid);
    p.line(12, 16, 0, 0, pal.cardTrim, 1);
    p.line(12, 16, 23, 0, pal.cardTrim, 1);
    p.line(12, 16, 0, 31, pal.cardTrim, 1);
    p.line(12, 16, 23, 31, pal.cardTrim, 1);
    p.line(12, 16, 12, 0, pal.cardTrim, 1);
  } else {
    p.rect(0, 0, w, 18, pal.cardMid);
    p.rect(0, 0, w, 6, pal.d);
  }
}

/**
 * Draws a FULL-BLEED 24x32 bespoke comic pixel-art mutation card (NO small icon in dark box!).
 * Every single mutation 0..29 fills the 24x32 canvas edge-to-edge with bold #0d0a10 ink & cel shading!
 */
function drawFullBleedMutationCard1x(p: PxCanvas, idx: number, pal: IconPalette): void {
  const fg = new PxCanvas(p.w, p.h);

  switch (idx) {
    case 1: {
      // RHINO SKIN: Rich saturated dark-emerald backdrop + huge armored slate-blue rhino head & golden ivory horn!
      p.rect(0, 0, p.w, p.h, '#1a2c24');
      p.poly([[0, 0], [p.w, 0], [p.w, 18], [0, 26]], '#2d4c3b');
      p.line(0, 24, 23, 6, '#58c848', 2);
      fg.poly([[0, 10], [17, 7], [22, 21], [16, 31], [0, 31]], '#586c74');
      fg.poly([[0, 11], [15, 8], [17, 16], [0, 19]], '#96acb6');
      fg.poly([[0, 20], [16, 19], [15, 31], [0, 31]], '#324046');
      // Armored neck plates & fierce glowing eye
      fg.line(5, 10, 5, 30, INK, 1);
      fg.rect(7, 15, 4, 3, INK);
      fg.rect(8, 16, 2, 1, '#ffe848');
      // Towering curved ivory rhino horn!
      fg.poly([[12, 18], [22, 2], [23, 16], [16, 25]], '#f2dca0');
      fg.poly([[14, 16], [21, 4], [21, 12], [16, 20]], '#fff8d8');
      fg.poly([[16, 22], [23, 14], [21, 25]], '#b89a64');
      break;
    }
    case 2: {
      // EXTRA FEET: Dynamic sprinting buff mutated green feet & legs tearing across speed streaks!
      paintFullBleedBackdrop(p, pal, 'diag');
      p.line(0, 8, 20, 4, '#ffe048', 1);
      p.line(0, 16, 18, 12, '#ffe048', 1);
      p.line(0, 25, 16, 22, '#62ec48', 1);
      // Back sprinting leg + front huge mutated green foot!
      fg.poly([[6, 0], [14, 0], [11, 16], [4, 15]], pal.d);
      fg.poly([[12, 2], [21, 4], [16, 22], [8, 20]], pal.m);
      fg.poly([[13, 3], [18, 4], [14, 17], [10, 16]], pal.h);
      // Chunky front foot & toes slamming forward
      fg.ellipse(14, 24, 9, 5, pal.m);
      fg.rect(9, 21, 11, 3, pal.h);
      fg.rect(19, 23, 4, 4, pal.h);
      fg.rect(5, 26, 15, 3, pal.d);
      break;
    }
    case 3: {
      // PLUTONIUM HUNGER: Blazing radioactive rad core pulling swirling green energy orbs inward!
      paintFullBleedBackdrop(p, pal, 'burst');
      fg.ellipse(12, 16, 9, 9, pal.d);
      fg.ellipse(12, 16, 7, 7, pal.m);
      fg.ellipse(11, 15, 4.5, 4.5, pal.h);
      fg.ellipse(10, 14, 2.5, 2.5, '#ffffff');
      // Orbiting attracted rad chunks flying in from corners!
      for (const [rx, ry] of [[3, 5], [20, 6], [4, 26], [19, 25], [12, 3], [12, 29]] as const) {
        fg.ellipse(rx, ry, 2.2, 2.2, pal.m);
        fg.set(rx - 1, ry - 1, '#ffffff');
      }
      break;
    }
    case 4: {
      // RABBIT PAW: Big fluffy bone-white lucky paw hanging from golden keyring filling the card!
      paintFullBleedBackdrop(p, pal, 'radial');
      // Golden key ring at top
      fg.ellipse(12, 5, 5, 4, '#ffd438');
      fg.ellipse(12, 5, 2.5, 2, pal.cardBg);
      fg.rect(10, 8, 4, 3, '#b88218');
      // Big chunky white rabbit paw + soft pads & green glow flecks
      fg.ellipse(12, 19, 8, 10, '#f4f0e6');
      fg.ellipse(10, 15, 5, 6, '#ffffff');
      fg.ellipse(14, 23, 6, 5, '#cfc6b6');
      fg.ellipse(7, 25, 3, 4, '#f4f0e6');
      fg.ellipse(12, 27, 3, 4, '#ffffff');
      fg.ellipse(17, 25, 3, 4, '#dfd8c8');
      fg.rect(9, 17, 6, 5, '#e8909c'); // pink paw pad
      break;
    }
    case 5: {
      // THRONE BUTT: Iconic monumental dark-iron & glowing neon-green Nuclear Throne crest!
      paintFullBleedBackdrop(p, pal, 'vertical');
      // Twin glowing green rad canisters flanking crimson/iron seat!
      fg.rect(1, 3, 6, 26, '#5c6674');
      fg.rect(2, 6, 4, 20, pal.m);
      fg.rect(3, 7, 2, 18, pal.h);
      fg.rect(17, 3, 6, 26, '#5c6674');
      fg.rect(18, 6, 4, 20, pal.m);
      fg.rect(19, 7, 2, 18, pal.h);
      // Central iron throne spire & blazing core
      fg.rect(7, 8, 10, 22, '#6c3430');
      fg.rect(9, 12, 6, 14, '#a82232');
      fg.ellipse(12, 24, 4, 4, '#2c3038');
      fg.ellipse(12, 24, 2, 2, pal.h);
      break;
    }
    case 6: {
      // LUCKY SHOT: Huge vivid emerald 4-leaf clover pierced diagonally by a giant gleaming gold bullet!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(8, 11, 6, 6, pal.m);
      fg.ellipse(16, 11, 6, 6, pal.m);
      fg.ellipse(8, 21, 6, 6, pal.d);
      fg.ellipse(16, 21, 6, 6, pal.m);
      fg.ellipse(7, 10, 3, 3, pal.h);
      fg.ellipse(15, 10, 3, 3, pal.h);
      fg.line(12, 21, 10, 31, pal.d, 2);
      // Giant gleaming gold bullet blasting diagonally across clover!
      fg.line(3, 27, 20, 6, '#b87c14', 6);
      fg.line(3, 26, 19, 6, '#ffd438', 4);
      fg.line(5, 24, 18, 8, '#fff8b0', 2);
      break;
    }
    case 7: {
      // BLOODLUST: Huge pulsing glossy crimson heart dripping vivid blood drops edge-to-edge!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(8, 12, 7, 7, pal.m);
      fg.ellipse(16, 12, 7, 7, pal.m);
      fg.poly([[1, 14], [23, 14], [12, 29]], pal.m);
      fg.ellipse(6, 10, 3.5, 3, pal.h);
      fg.rect(5, 9, 2, 2, '#ffffff');
      fg.poly([[14, 14], [22, 14], [12, 28]], pal.d);
      // Blood drips falling below
      fg.rect(5, 26, 2, 5, pal.m);
      fg.rect(18, 24, 2, 6, pal.d);
      break;
    }
    case 8: {
      // GAMMA GUTS: Glowing neon-green coiled radioactive mutant belly filling the frame!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(12, 16, 11, 13, pal.d);
      fg.ellipse(12, 16, 9, 11, pal.m);
      // Thick glowing coiled radioactive intestinal folds!
      for (const gy of [9, 15, 21]) {
        fg.ellipse(12, gy, 8, 3.2, pal.h);
        fg.line(5, gy + 2, 19, gy + 2, pal.d, 1);
      }
      fg.ellipse(12, 15, 4, 4, '#ffe848');
      fg.ellipse(11, 14, 2, 2, '#ffffff');
      break;
    }
    case 9: {
      // SECOND STOMACH: Chunky mutated green torso cradling a glowing crimson-and-white medkit!
      paintFullBleedBackdrop(p, pal, 'vertical');
      fg.ellipse(12, 18, 11, 13, pal.m);
      fg.ellipse(9, 13, 7, 7, pal.h);
      fg.ellipse(14, 23, 8, 8, pal.d);
      // Bold glossy white & crimson medkit cross centerpiece
      fg.rect(4, 11, 16, 12, '#ffffff');
      fg.rect(10, 12, 4, 10, '#f02e3a');
      fg.rect(6, 15, 12, 4, '#f02e3a');
      break;
    }
    case 10: {
      // BACK MUSCLE: Hulking flexed tan shoulders & lat muscles strapped with gleaming gold ammo bandolier!
      paintFullBleedBackdrop(p, pal, 'vertical');
      fg.ellipse(12, 20, 12, 12, pal.m);
      fg.ellipse(5, 13, 7, 7, pal.h);
      fg.ellipse(19, 13, 7, 7, pal.m);
      fg.ellipse(12, 7, 6, 5, pal.m); // head/neck crest
      fg.line(12, 12, 12, 31, pal.d, 2); // spine crease
      // Diagonal heavy leather & gold bullet bandolier!
      fg.line(2, 6, 22, 28, '#4a2c18', 5);
      for (let i = 0; i < 6; i++) {
        fg.rect(3 + i * 3, 7 + i * 3, 3, 3, '#ffd438');
        fg.set(3 + i * 3, 7 + i * 3, '#ffffff');
      }
      break;
    }
    case 11: {
      // SCARIER FACE: Massive terrifying fanged horned neon-green/bone monster face filling 24x32!
      paintFullBleedBackdrop(p, pal, 'radial');
      // Jagged curved horns
      fg.poly([[1, 2], [9, 8], [4, 14]], '#f4f8ee');
      fg.poly([[23, 2], [15, 8], [20, 14]], '#f4f8ee');
      // Huge menacing skull face
      fg.ellipse(12, 16, 10, 12, pal.m);
      fg.ellipse(10, 11, 7, 6, pal.h);
      fg.ellipse(12, 22, 8, 7, pal.d);
      // Deep fierce dark eye sockets with blazing crimson pupils!
      fg.poly([[3, 11], [10, 14], [9, 19], [4, 17]], INK);
      fg.poly([[21, 11], [14, 14], [15, 19], [20, 17]], INK);
      fg.rect(6, 14, 2, 2, '#ff3c44');
      fg.rect(16, 14, 2, 2, '#ff3c44');
      // Snarling jagged white teeth grin across bottom!
      fg.rect(4, 21, 16, 7, INK);
      for (let t = 5; t <= 17; t += 3) {
        fg.rect(t, 21, 2, 3, '#ffffff');
        fg.rect(t + 1, 25, 2, 3, '#e4e8dc');
      }
      break;
    }
    case 12: {
      // EUPHORIA: Giant hypnotic swirling psychic eye radiating green/violet rings!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(12, 16, 11, 10, '#ffffff');
      fg.ellipse(12, 16, 8, 8, pal.m);
      fg.ellipse(12, 16, 6, 6, '#b878ff');
      fg.ellipse(12, 16, 4, 4, pal.h);
      fg.ellipse(12, 16, 2, 2, INK);
      fg.set(10, 13, '#ffffff');
      // Floating psychic eyelids top & bottom
      fg.poly([[0, 6], [12, 1], [23, 6], [23, 0], [0, 0]], pal.d);
      fg.poly([[0, 26], [12, 31], [23, 26], [23, 31], [0, 31]], pal.d);
      break;
    }
    case 13: {
      // LONG ARMS: Giant muscular green mutated arm sweeping a massive steel broadsword corner-to-corner!
      paintFullBleedBackdrop(p, pal, 'diag');
      // Massive diagonal gleaming sword blade!
      fg.poly([[9, 18], [22, 1], [23, 6], [13, 21]], '#dce8f4');
      fg.line(11, 17, 22, 2, '#ffffff', 1);
      fg.line(8, 15, 15, 22, '#ffd438', 2); // crossguard
      // Huge outstretched mutated lime-green arm & clenched fist!
      fg.line(0, 30, 10, 20, pal.d, 8);
      fg.line(0, 28, 9, 19, pal.m, 6);
      fg.line(1, 26, 8, 19, pal.h, 2);
      fg.ellipse(10, 20, 4, 4, pal.h);
      break;
    }
    case 14: {
      // BOILING VEINS: Roaring volcanic orange-yellow flames erupting off a pulsing crimson forearm!
      paintFullBleedBackdrop(p, pal, 'vertical');
      // Towering roaring tongues of fire filling top 2/3!
      fg.poly([[1, 20], [5, 4], [10, 14], [13, 1], [18, 13], [22, 5], [23, 22]], '#f44022');
      fg.poly([[4, 22], [8, 9], [12, 15], [14, 6], [19, 18]], '#ff9628');
      fg.poly([[7, 23], [12, 12], [16, 22]], '#fff048');
      // Pulsing arm & glowing white-hot veins at base
      fg.rect(2, 20, 20, 12, '#881818');
      fg.line(4, 28, 12, 22, '#fff048', 2);
      fg.line(12, 22, 20, 27, '#ff9628', 2);
      break;
    }
    case 15: {
      // SHOTGUN SHOULDERS: Twin huge glossy red-and-brass shotgun shells mounted on armored mutant shoulders!
      paintFullBleedBackdrop(p, pal, 'vertical');
      // Broad mutant shoulders across bottom
      fg.ellipse(12, 28, 13, 8, pal.m);
      fg.ellipse(12, 26, 9, 5, pal.h);
      // Twin massive vertical crimson shells with bright brass rims!
      for (const sx of [3, 13]) {
        fg.rect(sx, 3, 8, 16, '#f03428');
        fg.rect(sx + 1, 4, 2, 14, '#ff9488');
        fg.rect(sx + 6, 4, 2, 14, '#9a1814');
        fg.rect(sx, 19, 8, 6, '#ffd838');
        fg.rect(sx + 1, 20, 2, 4, '#ffffff');
      }
      break;
    }
    case 16: {
      // RECYCLE GLAND: Giant glowing neon-green mutant recycle loop circling a huge golden cartridge!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(12, 16, 10, 12, pal.m);
      fg.ellipse(12, 16, 6, 8, pal.cardBg);
      // Bold recycle arrowheads
      fg.poly([[12, 1], [19, 6], [12, 10]], pal.h);
      fg.poly([[12, 31], [5, 26], [12, 22]], pal.h);
      // Gleaming central golden bullet
      fg.rect(9, 10, 6, 12, '#ffd438');
      fg.ellipse(12, 10, 3, 3, '#fff8a0');
      fg.rect(10, 11, 2, 10, '#ffffff');
      break;
    }
    case 17: {
      // LASER BRAIN: Huge exposed glowing neon-green wrinkled brain blasting a diagonal white-lime laser!
      paintFullBleedBackdrop(p, pal, 'burst');
      // Blazing diagonal laser beam slicing across bottom-right!
      fg.line(10, 16, 24, 28, '#68f848', 7);
      fg.line(10, 16, 24, 28, '#ffffff', 3);
      // Huge bulging neon-green wrinkled brain filling top-left!
      fg.ellipse(10, 13, 9, 9, pal.m);
      fg.ellipse(8, 10, 6, 5, pal.h);
      fg.line(5, 11, 13, 9, pal.d, 1);
      fg.line(4, 15, 14, 14, pal.d, 1);
      fg.line(8, 6, 9, 18, pal.d, 1);
      fg.ellipse(12, 16, 3, 3, '#ffffff');
      break;
    }
    case 18: {
      // LAST WISH: Radiant blooming golden wasteland flower bathed in sunlit rays!
      paintFullBleedBackdrop(p, pal, 'burst');
      fg.line(12, 18, 12, 31, '#58ec48', 3);
      fg.ellipse(7, 25, 4, 2, '#58ec48');
      fg.ellipse(17, 24, 4, 2, '#34a828');
      // Radiant golden star petals filling upper card!
      for (const [px, py] of [[12, 5], [19, 10], [17, 18], [7, 18], [5, 10]] as const) {
        fg.ellipse(px, py, 5, 5, '#ffd438');
        fg.ellipse(px, py - 1, 2.5, 2.5, '#fff8a0');
      }
      fg.ellipse(12, 12, 4.5, 4.5, '#ff6838');
      fg.ellipse(11, 11, 2, 2, '#ffffff');
      break;
    }
    case 19: {
      // EAGLE EYES: Intense fierce golden-feathered eagle eye locked inside a bright crimson sniper reticle!
      paintFullBleedBackdrop(p, pal, 'radial');
      // Fierce brow & curved golden-green beak/feathers
      fg.poly([[0, 2], [23, 2], [23, 14], [12, 11], [0, 14]], pal.m);
      fg.poly([[0, 2], [18, 2], [12, 8], [0, 9]], pal.h);
      // Giant piercing golden eagle eye
      fg.ellipse(12, 17, 9, 7, '#ffd838');
      fg.ellipse(12, 17, 5, 5, '#fff8a8');
      fg.ellipse(12, 17, 3, 3, INK);
      fg.set(10, 15, '#ffffff');
      // Crisp bright crimson crosshair overlaid
      fg.line(12, 6, 12, 28, '#f4343c', 1);
      fg.line(1, 17, 22, 17, '#f4343c', 1);
      break;
    }
    case 20: {
      // IMPACT WRISTS: Massive clenched mutated fist punching forward with fiery white-orange shockwaves!
      paintFullBleedBackdrop(p, pal, 'burst');
      // Fiery impact starburst on right
      fg.poly([[16, 16], [23, 3], [21, 14], [23, 28], [15, 20]], '#ff7c24');
      fg.poly([[15, 16], [21, 9], [19, 16], [21, 23]], '#ffffff');
      // Huge muscular fist & forearm slamming from left!
      fg.rect(0, 11, 14, 11, pal.m);
      fg.rect(0, 11, 12, 4, pal.h);
      fg.ellipse(13, 16, 6, 7, pal.m);
      fg.rect(11, 10, 6, 4, pal.h);
      // Knuckle ink ridges
      for (const ky of [12, 15, 18]) {
        fg.rect(15, ky, 3, 1, INK);
      }
      break;
    }
    case 21: {
      // BOLT MARROW: Giant blazing neon-green bone-tipped crossbow bolt streaking across homing arcs!
      paintFullBleedBackdrop(p, pal, 'diag');
      p.ellipse(12, 16, 10, 10, pal.cardMid);
      // Sweeping glowing homing arc trail
      fg.bezier(2, 29, 4, 12, 20, 6, pal.m, 4);
      fg.bezier(2, 28, 5, 12, 19, 6, pal.h, 2);
      // Huge razor bone/emerald arrowhead at top-right!
      fg.poly([[13, 4], [23, 2], [20, 13]], '#f4eedc');
      fg.poly([[15, 5], [22, 3], [19, 10]], '#ffffff');
      break;
    }
    case 22: {
      // STRESS: Hyper-tense close-up sweating neon-green face with bloodshot wide eyes & pulsing red vein!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(12, 17, 11, 13, pal.m);
      fg.ellipse(9, 11, 7, 6, pal.h);
      // Wide manic white eyes with tiny pinned pupils!
      fg.ellipse(7, 14, 4, 4.5, '#ffffff');
      fg.ellipse(17, 14, 4, 4.5, '#ffffff');
      fg.rect(7, 14, 2, 2, INK);
      fg.rect(16, 14, 2, 2, INK);
      // Pulsing crimson forehead anger vein + cyan sweat drop!
      fg.line(15, 5, 19, 9, '#f42c38', 2);
      fg.line(19, 5, 15, 9, '#f42c38', 2);
      fg.poly([[3, 6], [5, 10], [2, 10]], '#68ecff');
      // Gritting clenched teeth!
      fg.rect(5, 22, 14, 5, '#ffffff');
      fg.line(5, 24, 19, 24, INK, 1);
      for (const tx of [8, 12, 16]) fg.line(tx, 22, tx, 26, INK, 1);
      break;
    }
    case 23: {
      // TRIGGER FINGERS: Close-up heavy dark-iron gun receiver, glowing lime finger squeezing trigger + orange muzzle blast!
      paintFullBleedBackdrop(p, pal, 'diag');
      // Bright yellow-orange muzzle spark burst on right!
      fg.poly([[17, 10], [23, 3], [22, 11], [23, 17], [17, 13]], '#ffa028');
      fg.rect(18, 9, 4, 4, '#ffffff');
      // Heavy gun frame & trigger guard
      fg.rect(0, 4, 19, 9, '#6c7684');
      fg.rect(0, 5, 18, 3, '#b0bcc8');
      fg.rect(0, 13, 8, 18, '#464e5a');
      fg.rect(8, 18, 10, 3, '#6c7684'); // trigger guard bottom
      fg.rect(16, 13, 3, 8, '#6c7684');
      // Curved mutated neon-green finger squeezing the trigger!
      fg.ellipse(11, 16, 5, 3, pal.m);
      fg.rect(9, 14, 4, 2, pal.h);
      break;
    }
    case 24: {
      // SHARP TEETH: Terrifying gaping crimson monster jaws lined with giant razor-sharp white fangs!
      paintFullBleedBackdrop(p, pal, 'vertical');
      p.rect(0, 0, 24, 32, '#14060a');
      // Upper & lower crimson gums filling top and bottom edges!
      fg.rect(0, 0, 24, 9, pal.m);
      fg.rect(0, 0, 24, 4, pal.h);
      fg.rect(0, 23, 24, 9, pal.m);
      fg.rect(0, 27, 24, 5, pal.d);
      // Giant interlocking razor white fangs!
      for (const fx of [1, 7, 13, 19]) {
        fg.poly([[fx, 8], [fx + 4, 8], [fx + 2, 18]], '#ffffff');
        fg.poly([[fx + 1, 24], [fx + 5, 24], [fx + 3, 14]], '#f0eae0');
      }
      break;
    }
    case 25: {
      // PATIENCE: Iconic glowing neon-green wasteland clock dial filling the entire 24x32 portrait!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(12, 16, 11, 11, pal.d);
      fg.ellipse(12, 16, 9.5, 9.5, pal.m);
      fg.ellipse(12, 16, 7.5, 7.5, pal.h);
      // Bold clock rim ticks & crisp dark hands (12 & 3 o'clock!)
      fg.rect(11, 7, 2, 2, INK);
      fg.rect(11, 23, 2, 2, INK);
      fg.rect(4, 15, 2, 2, INK);
      fg.rect(18, 15, 2, 2, INK);
      fg.rect(11, 9, 2, 8, INK);
      fg.rect(11, 15, 7, 2, INK);
      fg.set(11, 15, '#ffffff');
      break;
    }
    case 26: {
      // HAMMERHEAD: Armored green-gray hammerhead brow smashing cleanly through brick wall rubble!
      paintFullBleedBackdrop(p, pal, 'burst');
      // Shattering brick chunks flying out at bottom!
      fg.rect(1, 22, 6, 5, '#9c4e38');
      fg.rect(17, 21, 6, 6, '#9c4e38');
      fg.rect(8, 25, 7, 5, '#c46c4c');
      fg.poly([[12, 19], [6, 25], [18, 25]], '#ff9028');
      // Massive T-shaped armored lime-green hammerhead skull driving downward!
      fg.rect(1, 4, 22, 11, pal.m);
      fg.rect(2, 4, 20, 4, pal.h);
      fg.rect(6, 14, 12, 7, pal.d);
      fg.rect(3, 9, 3, 3, '#fff490');
      fg.rect(18, 9, 3, 3, '#fff490');
      break;
    }
    case 27: {
      // STRONG SPIRIT: Silhouetted mutant head bathed in a blazing glowing white-cyan halo & heaven rays!
      paintFullBleedBackdrop(p, pal, 'burst');
      // Radiant pure-white glowing halo floating at top!
      fg.ellipse(12, 7, 10, 4, '#ffffff');
      fg.ellipse(12, 7, 6, 2, pal.cardMid);
      // Glowing lime-green uplifted mutant bust below!
      fg.ellipse(12, 20, 8, 8, pal.m);
      fg.ellipse(10, 17, 5, 4, pal.h);
      fg.ellipse(12, 30, 11, 6, pal.d);
      fg.rect(8, 18, 3, 3, '#ffffff');
      fg.rect(14, 18, 3, 3, '#ffffff');
      break;
    }
    case 28: {
      // OPEN MIND: Cracked skull bursting wide open with brilliant golden treasure sunbeams!
      paintFullBleedBackdrop(p, pal, 'burst');
      // Radiant golden beam erupting out top of cracked cranium!
      fg.poly([[12, 14], [2, 0], [22, 0]], '#ffd438');
      fg.poly([[12, 14], [7, 0], [17, 0]], '#ffffff');
      // Cracked bone-lime skull halves below!
      fg.ellipse(12, 20, 10, 10, '#dcecd2');
      fg.poly([[12, 15], [7, 8], [17, 8]], '#ffd438');
      fg.rect(6, 19, 4, 4, INK);
      fg.rect(14, 19, 4, 4, INK);
      fg.rect(8, 26, 8, 3, INK);
      break;
    }
    case 29: {
      // HEAVY HEART: Massive riveted dark-iron & crimson armored heart studded with gleaming gold bullets!
      paintFullBleedBackdrop(p, pal, 'radial');
      fg.ellipse(8, 12, 7, 7, pal.m);
      fg.ellipse(16, 12, 7, 7, pal.m);
      fg.poly([[1, 14], [23, 14], [12, 29]], pal.m);
      fg.ellipse(7, 10, 3, 3, pal.h);
      // Heavy steel armor belt + 3 gleaming golden bullets strapped across center!
      fg.rect(2, 13, 20, 7, '#586472');
      fg.rect(2, 13, 20, 2, '#9ca8b8');
      for (const bx of [5, 11, 17]) {
        fg.rect(bx, 11, 3, 10, '#ffd438');
        fg.set(bx + 1, 11, '#ffffff');
      }
      break;
    }
    default: {
      // 0: Fallback Rad — huge glowing nuclear rad trefoil filling 24x32!
      paintFullBleedBackdrop(p, pal, 'burst');
      fg.ellipse(12, 16, 10, 10, pal.m);
      fg.ellipse(12, 16, 6, 6, pal.h);
      fg.ellipse(12, 16, 3, 3, '#ffffff');
      break;
    }
  }

  fg.outline(INK);
  compositeLayer(p, fg);
  // Crisp 1px outer card edge frame so cards separate cleanly on Level Up without ANY empty padding!
  for (let x = 0; x < p.w; x++) {
    p.set(x, 0, INK);
    p.set(x, p.h - 1, INK);
  }
  for (let y = 0; y < p.h; y++) {
    p.set(0, y, INK);
    p.set(p.w - 1, y, INK);
  }
}

/**
 * Full-bleed 24x32 Ultra Mutation card: radiant cosmic/golden backlit illustration (ZERO dark empty box!).
 */
function drawFullBleedUltraCard1x(p: PxCanvas, grid: readonly string[], pal: IconPalette, isAlt: boolean): void {
  paintFullBleedBackdrop(p, pal, 'radial');
  // Radiant golden/cosmic vertical glow bands & top/bottom metallic sheen (NO harsh corner X!)
  p.ellipse(12, 16, 10, 13, pal.cardMid);
  p.ellipse(12, 15, 6, 8, pal.d);
  p.rect(1, 1, p.w - 2, 2, isAlt ? '#ffe048' : '#ffd438');
  p.rect(1, p.h - 3, p.w - 2, 2, '#9a6412');
  p.set(3, 4, '#fff498');
  p.set(p.w - 4, 4, '#fff498');
  p.set(3, p.h - 5, '#ffd438');
  p.set(p.w - 4, p.h - 5, '#ffd438');

  // Scale the 14x14 bespoke Ultra emblem boldly into full 24x32 portrait canvas (1.5x crisp pixel fill)!
  const map: Record<string, string> = {
    '1': pal.d,
    '2': pal.m,
    '3': pal.h,
    '4': pal.a,
    '5': pal.b,
    w: '#ffffff',
    k: INK,
  };
  const gh = grid.length;
  const gw = grid[0]!.length;
  const emb = new PxCanvas(p.w, p.h);
  const scaleX = 1.5;
  const scaleY = 2.0;
  const drawW = Math.round(gw * scaleX);
  const drawH = Math.round(gh * scaleY);
  const ox = Math.floor((p.w - drawW) * 0.5);
  const oy = Math.floor((p.h - drawH) * 0.5);

  for (let y = 0; y < drawH; y++) {
    const gy = Math.min(gh - 1, Math.floor(y / scaleY));
    const row = grid[gy]!;
    for (let x = 0; x < drawW; x++) {
      const gx = Math.min(gw - 1, Math.floor(x / scaleX));
      const ch = row[gx]!;
      if (ch === '.' || ch === ' ') continue;
      const col = map[ch];
      if (col) emb.set(ox + x, oy + y, col);
    }
  }
  emb.outline(INK);
  compositeLayer(p, emb);
  for (let x = 0; x < p.w; x++) {
    p.set(x, 0, INK);
    p.set(x, p.h - 1, INK);
  }
  for (let y = 0; y < p.h; y++) {
    p.set(0, y, INK);
    p.set(p.w - 1, y, INK);
  }
}

function registerSkillAndCrownSprites(b: FallbackAtlasBuilder): void {
  // 29 FULL-BLEED Bespoke Illustrated Mutation Cards (24x32, 30 frames) + Vibrant Lime HUD Icons (16x16, 30 frames)!
  b.addSprite('sprSkillIcon', 24, 32, 12, 16, 30, (ctx, ox, oy, w, h, f) => {
    const pal = MUTATION_PALETTES[f % MUTATION_PALETTES.length]!;
    const p = new PxCanvas(w, h);
    drawFullBleedMutationCard1x(p, f % MUTATION_PALETTES.length, pal);
    p.flush(ctx, ox, oy);
  });

  // SHAPED transparent-background crisp 16x16 HUD mutation icons (vibrant lime-green & pure black outline!)
  b.addSprite('sprSkillIconHUD', 16, 16, 8, 8, 30, (ctx, ox, oy, w, h, f) => {
    const pal = MUTATION_PALETTES[f % MUTATION_PALETTES.length]!;
    const p = new PxCanvas(w, h);
    const grid = MUTATION_GRIDS_14[f % MUTATION_GRIDS_14.length] ?? MUTATION_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });

  // 24 FULL-BLEED Ultra Cards (24x32, 24 frames) + SHAPED Transparent-Background HUD Icons (16x16, 24 frames)!
  b.addSprite('sprEGSkillIcon', 24, 32, 12, 16, 24, (ctx, ox, oy, w, h, f) => {
    const pal = ULTRA_PALETTES_24[f % ULTRA_PALETTES_24.length]!;
    const p = new PxCanvas(w, h);
    const grid = ULTRA_GRIDS_14[f % ULTRA_GRIDS_14.length] ?? ULTRA_GRIDS_14[0]!;
    drawFullBleedUltraCard1x(p, grid, pal, f % 2 === 1);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprEGIconHUD', 16, 16, 8, 8, 24, (ctx, ox, oy, w, h, f) => {
    const pal = ULTRA_PALETTES_24[f % ULTRA_PALETTES_24.length]!;
    const p = new PxCanvas(w, h);
    const grid = ULTRA_GRIDS_14[f % ULTRA_GRIDS_14.length] ?? ULTRA_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });
  b.addAlias('sprUltraIcon', 'sprEGSkillIcon');

  // 13 Crisp 1x Floating Crowns (16x14, orig 8,7, 2 frames)
  const crownSpecs: ReadonlyArray<{ metal: string; hi: string; dark: string; gem: string; tall?: boolean; horned?: boolean }> = [
    { metal: '#988672', hi: '#ccc0ae', dark: '#5e5042', gem: '#e4ded4' },
    { metal: '#625c6c', hi: '#9890a4', dark: '#36323e', gem: '#ff3838', tall: true },
    { metal: '#ecc038', hi: '#fff498', dark: '#a27414', gem: '#ff385c' },
    { metal: '#cfd8e4', hi: '#ffffff', dark: '#7c8898', gem: '#ffe048', horned: true },
    { metal: '#dca834', hi: '#ffe484', dark: '#946612', gem: '#ff8828' },
    { metal: '#463c52', hi: '#786c88', dark: '#241e2c', gem: '#58ff70', tall: true, horned: true },
    { metal: '#c42c38', hi: '#f46c78', dark: '#74141e', gem: '#ffffff', tall: true },
    { metal: '#d8b044', hi: '#fff098', dark: '#8c6818', gem: '#c068ff', tall: true },
    { metal: '#ec8ca8', hi: '#ffc8da', dark: '#9c4c68', gem: '#ffe048' },
    { metal: '#ecc038', hi: '#fff498', dark: '#a27414', gem: '#4cf068' },
    { metal: '#8438c0', hi: '#be78f8', dark: '#4c1a78', gem: '#ff58c4', tall: true, horned: true },
    { metal: '#cc4434', hi: '#f88070', dark: '#7c2018', gem: '#ffe048' },
    { metal: '#8c9cb0', hi: '#c8d6e8', dark: '#505e70', gem: '#6ef4ff' },
  ];
  for (let c = 1; c <= 13; c++) {
    const cs = crownSpecs[c - 1]!;
    const drawCrown1x = (ctx: DrawCtx, ox: number, oy: number, w: number, h: number, f: number, walk: boolean): void => {
      const p = new PxCanvas(w, h);
      const bob = (walk ? (f & 1) : 0) + (f === 1 ? -1 : 0);
      const cy = 6 + bob;
      const cx = 8;
      const sp = cs.tall ? 5 : 3;
      // Base crown band
      p.rect(cx - 5, cy, 10, 5, cs.metal);
      p.rect(cx - 5, cy + 1, 10, 1, cs.hi);
      p.rect(cx - 5, cy + 4, 10, 1, cs.dark);
      // 3 spires (or curved horns)
      if (cs.horned) {
        p.poly([[cx - 5, cy], [cx - 7, cy - sp], [cx - 2, cy]], cs.hi);
        p.poly([[cx + 5, cy], [cx + 7, cy - sp], [cx + 2, cy]], cs.dark);
      } else {
        p.poly([[cx - 5, cy], [cx - 5, cy - sp], [cx - 2, cy]], cs.hi);
        p.poly([[cx + 5, cy], [cx + 5, cy - sp], [cx + 2, cy]], cs.dark);
      }
      p.poly([[cx - 2, cy], [cx, cy - sp - 1], [cx + 2, cy]], cs.hi);
      // Center jewel
      p.rect(cx - 1, cy + 1, 2, 3, cs.gem);
      p.set(cx - 1, cy + 1, '#ffffff');
      p.outline(INK);
      p.flush(ctx, ox, oy);
    };
    b.addSprite(`sprCrown${c}Idle`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown1x(ctx, x, y, w, h, f, false));
    b.addSprite(`sprCrown${c}Walk`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown1x(ctx, x, y, w, h, f, true));
  }
}

// ============================================================================
// 3. CRISP 1x HUD SPRITES (EXACT MATCH TO 04_desert_1_1.png & 21_paused.png!)
// ============================================================================

function registerHudSprites(b: FallbackAtlasBuilder): void {
  // sprHealthBar (88x14, orig 0,0, 1f): stark crisp NT black-outlined white-rimmed HP frame!
  b.addSprite('sprHealthBar', 88, 14, 0, 0, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(0, 0, w, h, INK);
    p.rect(1, 1, w - 2, h - 2, '#d8d4dc');
    p.rect(2, 2, w - 4, h - 4, INK);
    p.rect(3, 3, w - 6, h - 6, '#1a141c');
    p.flush(ctx, ox, oy);
  });

  // sprHealthFill (1x8, orig 0,0, 11f):
  // frame 0 = PURE WHITE hurt flash; frame 1 = vibrant red-orange #fc3800 + #ff844c top bevel!
  b.addSprite('sprHealthFill', 1, 8, 0, 0, 11, (ctx, ox, oy, w, h, f) => {
    if (f === 0) {
      rect(ctx, ox, oy, w, h, '#ffffff');
      return;
    }
    if (f === 1) {
      rect(ctx, ox, oy, w, 1, '#ff844c');
      rect(ctx, ox, oy + 1, w, 6, '#fc3800');
      rect(ctx, ox, oy + 7, w, 1, '#b82000');
      return;
    }
    if (f === 2) {
      rect(ctx, ox, oy, w, 2, '#c82818');
      rect(ctx, ox, oy + 2, w, 4, '#8c140e');
      rect(ctx, ox, oy + 6, w, 2, '#580a08');
      return;
    }
    const tones = ['#e02c10', '#cc2018', '#b81c22', '#ff4d1a', '#ff7026', '#58ff70', '#6ef2ff', '#ffe048'];
    rect(ctx, ox, oy, w, h, tones[(f - 3) % tones.length]!);
    rect(ctx, ox, oy, w, 1, '#ffffff');
  });

  // sprExpBar (14x24, orig 0,0, 16f): crisp 1x black-outlined vertical glass rad canister tube!
  b.addSprite('sprExpBar', 14, 24, 0, 0, 16, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    // Metallic top & bottom canister end caps with dark vent ribs
    p.rect(1, 1, w - 2, 4, '#7a828c');
    p.rect(2, 1, w - 4, 1, '#bcc4ce');
    p.rect(3, 2, 1, 2, '#2a2e36');
    p.rect(6, 2, 2, 2, '#2a2e36');
    p.rect(10, 2, 1, 2, '#2a2e36');

    p.rect(1, h - 5, w - 2, 4, '#7a828c');
    p.rect(2, h - 2, w - 4, 1, '#444c56');
    p.rect(3, h - 4, 1, 2, '#2a2e36');
    p.rect(6, h - 4, 2, 2, '#2a2e36');
    p.rect(10, h - 4, 1, 2, '#2a2e36');

    // Dark recessed glass chamber
    p.rect(2, 5, w - 4, h - 10, '#181e1a');
    p.rect(3, 5, 1, h - 10, '#26302a');
    // Bright neon rad green bottom-up fill!
    const innerH = h - 10;
    const fillH = Math.round((f / 15) * innerH);
    if (fillH > 0) {
      const fy = h - 5 - fillH;
      p.rect(2, fy, w - 4, fillH, '#2ca828');
      p.rect(3, fy, w - 6, fillH, '#48e048');
      p.rect(5, fy, w - 10, fillH, '#98ff68');
      p.rect(2, fy, w - 4, 1, '#e8ffc8');
    }
    // Crisp 1px vertical glass shine streak
    p.rect(3, 6, 1, innerH - 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // sprExpBarLevel (14x24, orig 0,0, 1f): bright level-up outer glow
  b.addSprite('sprExpBarLevel', 14, 24, 0, 0, 1, (ctx, ox, oy, w, h) => {
    rect(ctx, ox, oy, w, 2, '#ffe048');
    rect(ctx, ox, oy + h - 2, w, 2, '#ffe048');
    rect(ctx, ox, oy, 2, h, '#ffe048');
    rect(ctx, ox + w - 2, oy, 2, h, '#ffe048');
    rect(ctx, ox + 2, oy + 3, w - 4, h - 6, 'rgba(160, 255, 110, 0.45)');
  });

  // sprCrosshair (16x16, orig 8,8, 9f): crisp 1x white & #0d0a10 black-outlined reticles!
  // Frame 0 = iconic Nuclear Throne circular crosshair with 4 inward ticks (04_desert_1_1.png!)
  b.addSprite('sprCrosshair', 16, 16, 8, 8, 9, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 8;
    const cy = 8;
    switch (f) {
      case 0: {
        // Iconic circular Nuclear Throne crosshair with 4 crisp cardinal ticks!
        const pts: ReadonlyArray<[number, number]> = [
          [-2, -5], [-1, -5], [0, -5], [1, -5], [2, -5],
          [-4, -4], [-3, -4], [3, -4], [4, -4],
          [-4, -3], [4, -3],
          [-5, -2], [-5, -1], [-5, 0], [-5, 1], [-5, 2],
          [5, -2], [5, -1], [5, 0], [5, 1], [5, 2],
          [-4, 3], [4, 3],
          [-4, 4], [-3, 4], [3, 4], [4, 4],
          [-2, 5], [-1, 5], [0, 5], [1, 5], [2, 5],
        ];
        for (const [dx, dy] of pts) p.set(cx + dx, cy + dy, '#ffffff');
        // 4 inward ticks
        p.rect(cx, cy - 4, 1, 2, '#ffffff');
        p.rect(cx, cy + 3, 1, 2, '#ffffff');
        p.rect(cx - 4, cy, 2, 1, '#ffffff');
        p.rect(cx + 3, cy, 2, 1, '#ffffff');
        break;
      }
      case 1:
        p.rect(cx - 6, cy, 4, 1, '#ffffff');
        p.rect(cx + 3, cy, 4, 1, '#ffffff');
        p.rect(cx, cy - 6, 1, 4, '#ffffff');
        p.rect(cx, cy + 3, 1, 4, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 2:
        p.rect(cx - 5, cy - 5, 3, 1, '#ffffff'); p.rect(cx - 5, cy - 5, 1, 3, '#ffffff');
        p.rect(cx + 3, cy - 5, 3, 1, '#ffffff'); p.rect(cx + 5, cy - 5, 1, 3, '#ffffff');
        p.rect(cx - 5, cy + 5, 3, 1, '#ffffff'); p.rect(cx - 5, cy + 3, 1, 3, '#ffffff');
        p.rect(cx + 3, cy + 5, 3, 1, '#ffffff'); p.rect(cx + 5, cy + 3, 1, 3, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 3:
        p.line(cx - 5, cy - 5, cx - 2, cy - 2, '#ffffff', 1);
        p.line(cx + 5, cy - 5, cx + 2, cy - 2, '#ffffff', 1);
        p.line(cx - 5, cy + 5, cx - 2, cy + 2, '#ffffff', 1);
        p.line(cx + 5, cy + 5, cx + 2, cy + 2, '#ffffff', 1);
        p.set(cx, cy, '#ffe048');
        break;
      case 4:
        p.rect(cx - 6, cy, 5, 1, '#ffffff');
        p.rect(cx + 2, cy, 5, 1, '#ffffff');
        p.rect(cx, cy - 6, 1, 5, '#ffffff');
        p.rect(cx, cy + 2, 1, 5, '#ffffff');
        break;
      case 5:
        p.line(cx, cy - 5, cx + 5, cy, '#ffffff', 1);
        p.line(cx + 5, cy, cx, cy + 5, '#ffffff', 1);
        p.line(cx, cy + 5, cx - 5, cy, '#ffffff', 1);
        p.line(cx - 5, cy, cx, cy - 5, '#ffffff', 1);
        p.set(cx, cy, '#ffe048');
        break;
      case 6:
        p.rect(cx - 5, cy - 5, 11, 1, '#ffffff');
        p.rect(cx - 5, cy + 5, 11, 1, '#ffffff');
        p.rect(cx - 5, cy - 5, 1, 11, '#ffffff');
        p.rect(cx + 5, cy - 5, 1, 11, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 7:
        p.rect(cx - 1, cy - 1, 3, 3, '#ffffff');
        break;
      default:
        p.rect(cx - 5, cy - 3, 1, 7, '#ffffff');
        p.rect(cx - 5, cy - 3, 3, 1, '#ffffff');
        p.rect(cx - 5, cy + 3, 3, 1, '#ffffff');
        p.rect(cx + 5, cy - 3, 1, 7, '#ffffff');
        p.rect(cx + 3, cy - 3, 3, 1, '#ffffff');
        p.rect(cx + 3, cy + 3, 3, 1, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // 5 Crisp 1x Draining 8-Frame Ammo Icons at EXACT 8x9 (orig 4,4) matching hud.ts 1:1!
  // ZERO fractional downscaling blur! Pure #000000 1px outer outline, vivid colors f0 -> dark empty f7!
  const applyDrain1x = (p: PxCanvas, f: number): void => {
    if (f <= 0) return;
    const drainRows = Math.min(p.h - 2, Math.ceil((f / 7) * (p.h - 2)));
    for (let y = 1; y < 1 + drainRows; y++) {
      for (let x = 1; x < p.w - 1; x++) {
        const cur = p.get(x, y);
        if (cur && cur !== HUD_INK) {
          p.set(x, y, f >= 7 ? '#24202a' : '#3a3442');
        }
      }
    }
  };

  // Bullet icon (8x9): twin vertical gold bullets with pure #000000 outline (exact match to 15_palace_7_1.png!)
  b.addSprite('sprBulletIcon', 8, 9, 4, 4, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    // Left gold bullet (x=1..2, y=1..7)
    p.rect(1, 1, 2, 7, '#f8d034');
    p.set(1, 1, '#fff8b0');
    p.rect(1, 2, 1, 4, '#ffe668');
    p.rect(1, 7, 2, 1, '#b87c18');
    // Right gold bullet (x=5..6, y=1..7)
    p.rect(5, 1, 2, 7, '#f8d034');
    p.set(5, 1, '#fff8b0');
    p.rect(5, 2, 1, 4, '#ffe668');
    p.rect(5, 7, 2, 1, '#b87c18');
    applyDrain1x(p, f);
    p.outline(HUD_INK);
    p.flush(ctx, ox, oy);
  });

  // Shot / Shell icon (8x9): bright red shotgun shell + gleaming gold brass rim!
  b.addSprite('sprShotIcon', 8, 9, 4, 4, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 1, 4, 5, '#f03428');
    p.rect(2, 1, 2, 4, '#ff7464');
    p.set(2, 1, '#ffd0c8');
    p.rect(2, 6, 4, 2, '#f8d438');
    p.rect(2, 6, 2, 1, '#fff8b0');
    applyDrain1x(p, f);
    p.outline(HUD_INK);
    p.flush(ctx, ox, oy);
  });
  b.addAlias('sprShellIcon', 'sprShotIcon');

  // Bolt icon (8x9): crisp upward-pointing golden-orange/lime crossbow arrow bolt!
  b.addSprite('sprBoltIcon', 8, 9, 4, 4, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(3, 1, 2, 1, '#ffffff');
    p.rect(2, 2, 4, 2, '#f8a828');
    p.rect(1, 3, 6, 1, '#e07c18');
    p.rect(3, 4, 2, 4, '#f8d048');
    p.rect(2, 7, 4, 1, '#c48024');
    applyDrain1x(p, f);
    p.outline(HUD_INK);
    p.flush(ctx, ox, oy);
  });

  // Explo icon (8x9): vivid round orange-gold bomb with metallic collar & bright lit fuse spark!
  b.addSprite('sprExploIcon', 8, 9, 4, 4, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 4, 5, '#f88c20');
    p.rect(1, 4, 6, 3, '#f88c20');
    p.rect(2, 4, 2, 2, '#ffe068');
    p.set(2, 4, '#ffffff');
    p.rect(3, 2, 2, 1, '#909ca8'); // metallic cap
    p.set(5, 1, '#ffe848'); // fuse spark
    p.set(6, 1, '#ffffff');
    applyDrain1x(p, f);
    p.outline(HUD_INK);
    p.flush(ctx, ox, oy);
  });

  // Energy icon (8x9): crisp jagged electric yellow/white lightning bolt (exact match to 15_palace_7_1.png!)
  b.addSprite('sprEnergyIcon', 8, 9, 4, 4, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(4, 1, 2, 2, '#ffe838');
    p.rect(3, 2, 2, 2, '#ffffff');
    p.rect(1, 4, 5, 2, '#ffe838');
    p.rect(2, 4, 3, 1, '#ffffff');
    p.rect(3, 6, 2, 2, '#ffd028');
    p.set(2, 7, '#ffffff');
    applyDrain1x(p, f);
    p.outline(HUD_INK);
    p.flush(ctx, ox, oy);
  });

  // sprRogueAmmoHUD (11x16, orig 1,1, 4 frames)
  b.addSprite('sprRogueAmmoHUD', 11, 16, 1, 1, 4, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 1, w - 2, h - 2, '#3c4c6c');
    for (let slot = 0; slot < 3; slot++) {
      const sy = 10 - slot * 3;
      const lit = slot < f;
      p.rect(3, sy, w - 6, 2, lit ? '#44b4ff' : '#1c2434');
      if (lit) p.rect(3, sy, w - 6, 1, '#d8fbff');
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprAmmoIcons', 10, 10, 5, 5, 6, (ctx, ox, oy, w, h, f) => {
    const cols = ['#f5cc38', '#e83428', '#58e850', '#f08c28', '#ffe848', '#d8e0e8'];
    const p = new PxCanvas(w, h);
    p.rect(2, 2, 6, 6, cols[f % cols.length]!);
    p.rect(3, 3, 3, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Crisp native 8x8 white Kills Skull with 1px #0d0a10 outline (exact match to 21_paused.png!)
  b.addSprite('sprKillsIcon', 8, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 1, 4, 4, '#ffffff');
    p.rect(1, 2, 6, 3, '#f2eee6');
    p.rect(2, 5, 4, 2, '#d8d2c8');
    p.set(2, 3, INK);
    p.set(5, 3, INK);
    p.set(3, 6, INK);
    p.set(5, 6, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprGameOverSkull', 8, 6, 4, 3, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 1, 4, 3, '#ffffff');
    p.rect(1, 2, 6, 2, '#eeeae2');
    p.rect(2, 4, 4, 1, '#d4cec4');
    p.set(2, 2, INK);
    p.set(5, 2, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprGameOverThrone', 9, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 1, 7, 6, '#743836');
    p.rect(2, 2, 2, 4, '#84f418');
    p.rect(5, 2, 2, 4, '#84f418');
    p.rect(4, 3, 1, 4, '#a01f31');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprMapDot', 3, 3, 1, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 3, 3, '#e6e6eb');
    px(ctx, x + 1, y + 1, '#ffffff');
  });
}

export function registerFallbackUi(b: FallbackAtlasBuilder): void {
  // 1. Crisp 1x Krunked Throne Title Emblem & Glow
  registerLogoSprites(b);

  // 2. Large Comic Bust Portraits (96x80, orig 48,40, 24 frames, transparent background!)
  b.addSprite('sprBigPortrait', 96, 80, 48, 40, 24, (ctx, x, y, w, h, f) =>
    drawMutantBigPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 3. Mini Char Select Roster Cards (16x24, orig 0,0, 18 frames)
  b.addSprite('sprCharSelect', 16, 24, 0, 0, 18, (ctx, x, y, w, h, f) =>
    drawCharSelectCardHiBit(ctx, x, y, w, h, f),
  );

  // 3b. 5 Custom Close-Up Boss Intro Portraits (80x70, orig 40,35, 5 frames)
  b.addSprite('sprBuiltinBossPortrait', 80, 70, 40, 35, 5, (ctx, x, y, w, h, f) =>
    drawBossIntroPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 4. 29 Bespoke Mutation Cards/Shaped HUD Icons + 24 Ultra Cards/Icons + 13 Crowns
  registerSkillAndCrownSprites(b);

  // 5. Crisp 1x HUD, Health Bar/Fill, Rad Canister, Crosshairs & Draining Ammo Icons
  registerHudSprites(b);
}
