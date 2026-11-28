import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  px,
  rect,
} from './fallback-fonts';
import {
  drawBossIntroPortraitHiBit,
  drawCharSelectCardHiBit,
  drawMutantBigPortraitHiBit,
} from './fallback-portraits';
import { PxCanvas, bayer4, makeRamp } from './pixel-art';

// ============================================================================
// 1. KRUNKED THRONE HI-BIT TITLE EMBLEM (sprLogo 516x192 -> 258x96x8, sprLogoGlow)
// ============================================================================

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

  // 1. Deep 3D extruded dark drop block (+0..+5px down, +0..+2px right) + thick outer ink outline
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
      const b = bayer4(x, y) / 16;

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
        else if (leftEmpty1 && t < 0.65) col = '#c2ff85';
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
        else if (leftEmpty1 && t < split) col = '#d4e2f2';
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

function registerLogoSprites(b: FallbackAtlasBuilder): void {
  // sprLogoGlow: 522x186 Hi-Bit -> logical 261x93, orig=(130, 45), 1 frame smooth elliptical radioactive aura (ZERO blocky box!)
  b.addSpriteHiBit('sprLogoGlow', 261, 93, 130, 45, 1, (ctx, ox, oy, w, h) => {
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
  });

  // sprLogo: 516x192 Hi-Bit -> logical 258x96, orig=(129, 48), 8 frames
  const krunkedWord = 'KRUNKED';
  const throneWord = 'THRONE';
  const drips: ReadonlyArray<[number, number, number]> = [
    [40, 14, 8], [108, 10, 7], [186, 15, 9], [268, 11, 7], [344, 14, 8], [412, 10, 7], [472, 13, 8],
  ];

  b.addSpriteHiBit('sprLogo', 258, 96, 129, 48, 8, (ctx, ox, oy, w, h, f) => {
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
    const kTotal = krunkedWord.length * kW + (krunkedWord.length - 1) * kGap;
    const kStartX = Math.floor((w - kTotal) * 0.5);
    const kStartY = 12;
    for (let i = 0; i < krunkedWord.length; i++) {
      paintSculptedLetter(kMask, krunkedWord[i]!, kStartX + i * (kW + kGap), kStartY, kW, kH, '#ffffff');
    }
    shadeWordFromMask(p, kMask, kStartY, kH, 'krunked');

    // Rounded radioactive slime drips hanging cleanly above THRONE (zero bleed!)
    for (const [dx, dLen, dW] of drips) {
      paintSlimeDripHiBit(p, dx, kStartY + kH + 1, dLen, dW);
    }

    // 3. Bottom Word: riveted heavy-metal brushed steel "THRONE" (progressively forged 0..6, complete at 7!)
    const revealed = f >= 6 ? 6 : Math.min(6, f);
    if (revealed > 0) {
      const tMask = new PxCanvas(w, h);
      const tW = 58;
      const tH = 68;
      const tGap = 12;
      const tTotal = throneWord.length * tW + (throneWord.length - 1) * tGap;
      const tStartX = Math.floor((w - tTotal) * 0.5);
      const tStartY = 108;
      for (let i = 0; i < revealed; i++) {
        paintSculptedLetter(tMask, throneWord[i]!, tStartX + i * (tW + tGap), tStartY, tW, tH, '#ffffff');
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
  });
}

// ============================================================================
// 2. ALL 29 BESPOKE MUTATION CARDS + 24 ULTRA CARDS + 13 CROWNS (2x HI-BIT)
// ============================================================================

interface MutCardTheme {
  bg: string;
  bgHi: string;
  dark: string;
  fg: string;
  fgHi: string;
  accent: string;
  accentHi: string;
}

const MUTATION_THEMES: readonly MutCardTheme[] = [
  { bg: '#1b3320', bgHi: '#2f5737', dark: '#1e8530', fg: '#59ff73', fgHi: '#d4ffd9', accent: '#ffe047', accentHi: '#ffffff' },
  { bg: '#381820', bgHi: '#5c2633', dark: '#5e5669', fg: '#9e95ab', fgHi: '#e3dae8', accent: '#fff4d6', accentHi: '#ff3b4a' },
  { bg: '#182c3d', bgHi: '#2b4d69', dark: '#238236', fg: '#59e06e', fgHi: '#bfffc7', accent: '#f5c742', accentHi: '#ffffff' },
  { bg: '#12331a', bgHi: '#22592f', dark: '#941c24', fg: '#e6323e', fgHi: '#cfd8e3', accent: '#59ff70', accentHi: '#e8ffdc' },
  { bg: '#332617', bgHi: '#543f26', dark: '#b3a99c', fg: '#f0e9de', fgHi: '#ffffff', accent: '#f5c742', accentHi: '#ff94b2' },
  { bg: '#193020', bgHi: '#2c5438', dark: '#293347', fg: '#4f5d7a', fgHi: '#8a9bb8', accent: '#59ff73', accentHi: '#ffe047' },
  { bg: '#1c3318', bgHi: '#32592b', dark: '#1f8530', fg: '#4de862', fgHi: '#baffc2', accent: '#f5c742', accentHi: '#fff8c4' },
  { bg: '#401018', bgHi: '#6b1b28', dark: '#8c1422', fg: '#e6293d', fgHi: '#ff8a96', accent: '#ffffff', accentHi: '#ffd6da' },
  { bg: '#113616', bgHi: '#1f5e27', dark: '#249930', fg: '#6eff59', fgHi: '#deffd6', accent: '#ffe647', accentHi: '#ffffff' },
  { bg: '#3b1520', bgHi: '#632334', dark: '#a31c2c', fg: '#f2edf2', fgHi: '#ffffff', accent: '#ff384c', accentHi: '#ff9ea8' },
  { bg: '#362717', bgHi: '#573e24', dark: '#874c2c', fg: '#d99364', fgHi: '#ffd2b0', accent: '#f5cc47', accentHi: '#fff4ad' },
  { bg: '#26142b', bgHi: '#42224c', dark: '#968e82', fg: '#ebe5d8', fgHi: '#ffffff', accent: '#ff2b3d', accentHi: '#ffe047' },
  { bg: '#211640', bgHi: '#39266b', dark: '#6d36b5', fg: '#b878ff', fgHi: '#f0dbff', accent: '#78f2ff', accentHi: '#ffffff' },
  { bg: '#1b2738', bgHi: '#2f4461', dark: '#8c5230', fg: '#d99668', fgHi: '#ffd1ad', accent: '#9cc7eb', accentHi: '#ffffff' },
  { bg: '#421710', bgHi: '#70281b', dark: '#8c1814', fg: '#e62e26', fgHi: '#ff7826', accent: '#ffe047', accentHi: '#ffffff' },
  { bg: '#381b17', bgHi: '#5e2e27', dark: '#8c1f19', fg: '#e64232', fgHi: '#ff9685', accent: '#f5cc47', accentHi: '#ffffff' },
  { bg: '#193320', bgHi: '#2b5737', dark: '#1e8a38', fg: '#59e870', fgHi: '#c9ffd1', accent: '#f5cc47', accentHi: '#ffffff' },
  { bg: '#2b1330', bgHi: '#4c2154', dark: '#a83668', fg: '#ff73ab', fgHi: '#ffc9df', accent: '#ff244f', accentHi: '#ffffff' },
  { bg: '#332814', bgHi: '#574422', dark: '#b37e14', fg: '#ffe047', fgHi: '#ffffff', accent: '#ff384c', accentHi: '#ff9ea8' },
  { bg: '#1a283b', bgHi: '#2e4666', dark: '#9e6c14', fg: '#f5c742', fgHi: '#fff6a6', accent: '#ff2e3d', accentHi: '#ffffff' },
  { bg: '#381b14', bgHi: '#5e2e22', dark: '#945a38', fg: '#e6b58c', fgHi: '#fff0de', accent: '#ff5c26', accentHi: '#ffe647' },
  { bg: '#143320', bgHi: '#245737', dark: '#1d8a3a', fg: '#59ff7a', fgHi: '#d9ffe0', accent: '#e8e0cf', accentHi: '#ffffff' },
  { bg: '#42121a', bgHi: '#701f2c', dark: '#941924', fg: '#ff3b47', fgHi: '#ffa8b0', accent: '#ffe047', accentHi: '#ffffff' },
  { bg: '#2e2118', bgHi: '#4f3829', dark: '#545f6e', fg: '#9aa8ba', fgHi: '#e8c492', accent: '#ff7b24', accentHi: '#fff280' },
  { bg: '#38141d', bgHi: '#5e2131', dark: '#8c1424', fg: '#f2f0eb', fgHi: '#ffffff', accent: '#ff3347', accentHi: '#ff949e' },
  { bg: '#191736', bgHi: '#2d295e', dark: '#7338a8', fg: '#c978ff', fgHi: '#f0d6ff', accent: '#59ff7a', accentHi: '#e6ffea' },
  { bg: '#2e2420', bgHi: '#4f3e37', dark: '#5e4f47', fg: '#b59d8a', fgHi: '#ede0d4', accent: '#ff8026', accentHi: '#ffe047' },
  { bg: '#102838', bgHi: '#1d4561', dark: '#2a85b8', fg: '#78f2ff', fgHi: '#ffffff', accent: '#ff3d52', accentHi: '#ffa6b0' },
  { bg: '#261a3b', bgHi: '#432e66', dark: '#6d30a6', fg: '#cf7dff', fgHi: '#f5deff', accent: '#f5c742', accentHi: '#ffffff' },
  { bg: '#38141d', bgHi: '#5e2230', dark: '#75131f', fg: '#e62e42', fgHi: '#ff8f9a', accent: '#a8b5c4', accentHi: '#ffffff' },
];

const MUTATION_GRIDS_16: Readonly<Record<number, readonly string[]>> = {
  0: ['....222..222....', '...2332..2332...', '...2222..2222...', '....22....22....', '......4444......', '.....45554......', '......4444......', '....11....11....', '...1221..1221...', '..12332..23321..', '...1222..2221...'],
  1: ['...........44...', '..........44w...', '.........444....', '..23.....444....', '.2332222..44....', '233322222444....', '2322233222444...', '2221225522224...', '2211222222222...', '1211122222211...', '.11111222111....', '..11111111......'],
  2: ['544....332......', '.544..3322......', '..544.3222......', '...5442221......', '....442221......', '......2221......', '.....232211.....', '.....23222233...', '.....222222332..', '.....111111111..'],
  3: ['.333........333.', '.333...54...333.', '.222..5444..222.', '.222..4444..222.', '.222...44...222.', '.221........122.', '.221........122.', '..221......122..', '...2221111222...', '....12222221....', '......1111......'],
  4: ['......444.......', '.....45.44......', '......444.......', '.....33322......', '....33www22.....', '...33wwwww21....', '...33ww55w21....', '..33ww5555w21...', '..32w55ww5521...', '..322wwwwww21...', '...21.2221.11...', '...1...11.......'],
  5: ['..5...555...5...', '..55..545..55...', '..33335553333...', '..32222222221...', '.3321444441211..', '.32214www41221..', '.32214w4w41221..', '.3221444441221..', '.3222111112221..', '..22224442221...', '..11111111111...'],
  6: ['...332....332...', '..33222..22221..', '..322224422211..', '...2224554211...', '.....245421.....', '...3324542221...', '..332244422211..', '..32224442211...', '...221444111....', '......141.......', '......11........'],
  7: ['..3322....3322..', '.333222..222221.', '.33222222222211.', '.32444222244411.', '.224w422224w411.', '..224422224411..', '...2242222411...', '....22222211....', '.....222211.....', '......2211......', '.......11.......'],
  8: ['.....4....4.....', '...333222233....', '..33322222221...', '..32255555221...', '.3322222222211..', '.3225555552211..', '.3222233322211..', '..22555555211...', '..22223322211...', '...122222211....', '.....11111......'],
  9: ['....33333333....', '...3w33333321...', '..3ww334433221..', '..3w3334433221..', '..333444544321..', '..333444544321..', '..333334433221..', '..223334433221..', '...2222222221...', '....11111111....'],
  10: ['....45555544....', '....44544544....', '....44444444....', '..333222222111..', '.33322222222111.', '.33221222212211.', '.32221222212211.', '..222221122221..', '...2222112221...', '....11111111....'],
  11: ['....33333333....', '...33wwwww221...', '..33wwwwwww221..', '..32444w444221..', '..32454w454221..', '..2222w.w22211..', '...222www2211...', '..22.3.3.3.3.1..', '..22.........1..', '...2.3.3.3.31...', '....11111111....'],
  12: ['....33333322....', '..333222222211..', '.3322..444..211.', '.322.455554..21.', '.32.45544544.21.', '.32.45433454.21.', '.32..445554..21.', '.221...44...211.', '..2211....1221..', '....11222211....'],
  13: ['..........555...', '.........5544...', '........5544....', '.......5544.....', '......5544......', '.....5544.......', '....5444........', '..33344.........', '.33222232.......', '332222221.......', '12222111........'],
  14: ['......54........', '.....5544..4....', '....45444.44....', '..33245422332...', '.3322242222221..', '.3224542244221..', '.2244224542211..', '..22224422211...', '...224422211....', '....2222211.....', '.....11111......'],
  15: ['..3322....3322..', '..3221....3221..', '..3221....3221..', '..3221....3221..', '..3221....3221..', '..3221....3221..', '..5444....5444..', '..5444....5444..', '.....5....5.....', '....555..555....'],
  16: ['....33333322....', '...3322222221...', '..332..54..221..', '..32..5444..21..', '..32..5444..21..', '..32..4444..21..', '..221.4444.121..', '...221....122...', '...3322222221...', '....11111111....'],
  17: ['..333322........', '.33233322.......', '.321232221......', '3322212244444444', '3212222455555555', '3222122244444444', '.22122221.......', '.21221221.......', '..111111........'],
  18: ['.......3........', '......332.......', '......322.......', '.....33222......', '333332454222211.', '.2222444442211..', '.....244421.....', '......2421......', '......221.......', '.......1........'],
  19: ['.......4........', '....3334333.....', '..33322422211...', '.3322455542211..', '4444245w5424444.', '.2222455542211..', '..22222422211...', '....1114111.....', '.......4........'],
  20: ['..........54....', '...33332...544..', '..3323232...544.', '.332222221..544.', '.322222221.5544.', '.322222221..544.', '.222111111..544.', '..2211111...54..', '..........54....'],
  21: ['..........33....', '..........332...', '....5444443322..', '..5444444433222.', '.544......3322..', '44........332...', '4.........33....', '4...............'],
  22: ['..3322..543322..', '.33322255422221.', '.33222554222211.', '.32225544422211.', '.2222225542211..', '..22225542211...', '...225542211....', '....2542211.....', '.....42211......', '......111.......'],
  23: ['..2222222222.54.', '.233333333215544', '.22222222221.54.', '.221..333..1....', '.221..33221.....', '.221...321......', '.221..221.......', '.2211111........', '.11111..........'],
  24: ['..444444444444..', '.45544444444441.', '.43w3.3w3.3w3.1.', '.42w2.2w2.2w2.1.', '.4.2...2...2..1.', '.4...2...2....1.', '.4..2w2.2w2.2.1.', '.4..3w3.3w3.3.1.', '.44444444444441.', '..111111111111..'],
  25: ['..333333333322..', '..222222222211..', '...3244444421...', '....32455421....', '.....324421.....', '......3451......', '.....324421.....', '....32455421....', '...3244444421...', '..333333333322..', '..111111111111..'],
  26: ['..333333333322..', '.33322222222211.', '.32222222222211.', '.22211111111111.', '.....45..54.....', '....45422454....', '...45.2321.54...', '......2321......', '......2221......', '......1111......'],
  27: ['....33333333....', '..332222222222..', '....22222222....', '.33..........33.', '332.544..444.233', '3224544444444223', '.22444444444422.', '...4444444444...', '....44444444....', '.....444444.....', '......4444......'],
  28: ['.....333333.....', '...3322ww2233...', '..322w2442w221..', '...3322ww2221...', '.....111111.....', '..444444444444..', '..455555555544..', '..444445544444..', '..444444444444..', '..111111111111..'],
  29: ['..3322....3322..', '.333222..222221.', '5444444444444445', '4444224554224444', '.32222455422211.', '..222244442211..', '...2222222211...', '....22222211....', '.....222211.....', '......1111......'],
};

const ULTRA_THEMES_24: readonly MutCardTheme[] = [
  { bg: '#133024', bgHi: '#215440', dark: '#754614', fg: '#d9982b', fgHi: '#ffe073', accent: '#4de878', accentHi: '#ffffff' },
  { bg: '#152b3b', bgHi: '#244963', dark: '#946511', fg: '#f2c138', fgHi: '#fff59e', accent: '#6ef2ff', accentHi: '#ffffff' },
  { bg: '#2b1245', bgHi: '#4a2075', dark: '#5e1a8f', fg: '#b852eb', fgHi: '#f0b8ff', accent: '#ff3b5c', accentHi: '#ffc2cc' },
  { bg: '#33123d', bgHi: '#59206b', dark: '#75208c', fg: '#d966ff', fgHi: '#ffffff', accent: '#ffe047', accentHi: '#fff8bd' },
  { bg: '#12224d', bgHi: '#1f3b82', dark: '#24479e', fg: '#5496ff', fgHi: '#bddeff', accent: '#f5cc47', accentHi: '#ffffff' },
  { bg: '#261447', bgHi: '#43247a', dark: '#52299e', fg: '#8f66ff', fgHi: '#dcd1ff', accent: '#ff5288', accentHi: '#ffffff' },
  { bg: '#3b1418', bgHi: '#662229', dark: '#8c7e6b', fg: '#ebe2d1', fgHi: '#ffffff', accent: '#ff5c26', accentHi: '#ffe866' },
  { bg: '#1c2b21', bgHi: '#2f4d39', dark: '#857766', fg: '#e3d9c6', fgHi: '#ffffff', accent: '#59ff73', accentHi: '#d9ffe0' },
  { bg: '#113318', bgHi: '#1f592b', dark: '#1c752b', fg: '#4be05c', fgHi: '#b8ffc0', accent: '#eb2f42', accentHi: '#ffffff' },
  { bg: '#2b1224', bgHi: '#4d2040', dark: '#21782e', fg: '#59e864', fgHi: '#c4ffca', accent: '#ff385c', accentHi: '#ffe866' },
  { bg: '#2b203b', bgHi: '#4a3766', dark: '#9e6b11', fg: '#f5c736', fgHi: '#fff7ad', accent: '#ffffff', accentHi: '#ffeb78' },
  { bg: '#1a301d', bgHi: '#2d5432', dark: '#1f7a32', fg: '#4ce065', fgHi: '#c4ffd0', accent: '#f5c736', accentHi: '#ffffff' },
  { bg: '#292238', bgHi: '#473b61', dark: '#546173', fg: '#9cb0c7', fgHi: '#e6f0fa', accent: '#ff9633', accentHi: '#fff599' },
  { bg: '#332414', bgHi: '#593e22', dark: '#8a5819', fg: '#e6b235', fgHi: '#fff299', accent: '#59ff73', accentHi: '#ff4252' },
  { bg: '#132a36', bgHi: '#21495e', dark: '#4d6070', fg: '#9ab4c7', fgHi: '#e3f2fc', accent: '#f5c736', accentHi: '#59ff7a' },
  { bg: '#182b29', bgHi: '#2b4d49', dark: '#475966', fg: '#8da3b3', fgHi: '#d6e6f2', accent: '#59ff7a', accentHi: '#ffe047' },
  { bg: '#3d1518', bgHi: '#6b2429', dark: '#9e1c26', fg: '#f03240', fgHi: '#ff949c', accent: '#ffae26', accentHi: '#fff7a6' },
  { bg: '#16243b', bgHi: '#263e66', dark: '#546880', fg: '#b5cde6', fgHi: '#ffffff', accent: '#5ce8ff', accentHi: '#ff4757' },
  { bg: '#21301f', bgHi: '#395436', dark: '#4c6348', fg: '#8fad8a', fgHi: '#d4ebd0', accent: '#f5c736', accentHi: '#ffffff' },
  { bg: '#361a1f', bgHi: '#5e2d36', dark: '#785e42', fg: '#c9a97c', fgHi: '#faebd2', accent: '#ff5247', accentHi: '#ffe866' },
  { bg: '#0c3315', bgHi: '#175926', dark: '#17822c', fg: '#4dff6a', fgHi: '#d4ffd9', accent: '#d6ff47', accentHi: '#ffffff' },
  { bg: '#21123b', bgHi: '#3b2069', dark: '#5d24a8', fg: '#b85eff', fgHi: '#f0ccff', accent: '#4dff78', accentHi: '#ffffff' },
  { bg: '#102047', bgHi: '#1c387a', dark: '#1e54bd', fg: '#4da6ff', fgHi: '#c4f4ff', accent: '#ffe047', accentHi: '#ffffff' },
  { bg: '#122940', bgHi: '#1f476e', dark: '#2b5ea8', fg: '#6bb8ff', fgHi: '#e6f7ff', accent: '#6ef5ff', accentHi: '#ffffff' },
];

const ULTRA_GRIDS_16: Readonly<Record<number, readonly string[]>> = {
  0: ['....4..5..4.....', '.....4.5.4......', '..333333333322..', '.33222222222211.', '.22111455411111.', '.33333355333321.', '.32222155122221.', '.32222144122211.', '.22222222222211.', '..111111111111..'],
  1: ['.......3........', '......332.......', '.....33222......', '.33333w5w22221..', '..22235452221...', '....2322221.....', '...3322.2221....', '..322.....221...', '..4444.5.4444...', '..45545554554...'],
  2: ['.32...332...32..', '.321..321..321..', '.3322233222321..', '.3222222222211..', '.322454.442211..', '.2245444444211..', '.2224444442211..', '..22244442211...', '..22224422211...', '...111111111....'],
  3: ['.....33322...4..', '...33322221.45..', '..33w222221..4..', '.33ww2222221454.', '.33222222221.54.', '.32222222211454.', '..222222211..4..', '...2222211..45..', '.....1111....4..'],
  4: ['.....45...45....', '....444...444...', '....33333322....', '..3322wwww2211..', '.322ww1111ww211.', '.322ww1w11ww211.', '..2222wwww2211..', '....11111111....', '..45.........45.', '..444.......444.'],
  5: ['.4.....33.....4.', '45...332222...54', '4...32wwww21...4', '45.32ww11ww21.54', '4..32ww11ww21..4', '45..22wwww21..54', '.4...111111...4.', '..4..........4..'],
  6: ['.5..4..5..4..5..', '..54454544545...', '...455555554....', '...333333322....', '..33wwwwwww21...', '..32..w.w..21...', '..2222w.w2211...', '...222222211....', '....2.2.2.1.....', '....1111111.....'],
  7: ['..54...54...54..', '.5444.5444.5444.', '..44...44...44..', '..3332....3322..', '.33www....ww221.', '.32..w....w..21.', '.22221....12211.', '..2221....1221..', '...1.1....1.1...'],
  8: ['.32..........23.', '3321..4444..1223', '321.44555544.122', '221.4w4444w4.121', '221.4.w..w.4.121', '221.4..ww..4.121', '221.4w4444w4.121', '.221.444444.121.', '..2211....1121..', '....11111111....'],
  9: ['..444......444..', '.45544....45544.', '.4w4w4....4w4w4.', '..444..44..444..', '...32.4554.32...', '..332.4ww4.321..', '.32221.44.32221.', '..1221.32.1221..', '...1113321111...', '......1111......'],
  10: ['...5555555555...', '.......3........', '......332.......', '.....33222......', '....3322222.....', '.w.332444221.w..', 'www3224w4221www.', '.w.222222221.w..', '..22222222211...', '.1111111111111..'],
  11: ['....45555554....', '...4544554454...', '..333333333322..', '.33222455422211.', '.32224522222211.', '.32222455422211.', '.22222222542211.', '.22224554222211.', '..111111111111..'],
  12: ['54............45', '5443333223333445', '54.3222112222.45', '...2221..1222...', '....221..122....', '....111..111....', '..54........45..', '.544332..233445.', '..54221..12245..'],
  13: ['..55..44..ww..33', '..55..44..ww..33', '.33333333333322.', '.32222222222211.', '.322554433ww211.', '.322554433ww211.', '.22222222222211.', '.22111111111111.', '..111111111111..'],
  14: ['...4...44...4...', '...44.4444.44...', '...4444444444...', '...1111111111...', '..333333333322..', '.33225555552211.', '.22222222222211.', '..221......111..', '..111...........'],
  15: ['..333333333322..', '.33222222222211.', '.32244222244211.', '.22222222222211.', '..11........11..', '....55555555....', '...5444w44445...', '...5444444445...', '..111111111111..', '..333333333322..'],
  16: ['.......5........', '......554.......', '.....45544......', '....4544444.....', '...445433444....', '..333333333322..', '.33222222222211.', '332211111111221.', '21..............'],
  17: ['.....444444.....', '...44w....w44...', '..44........44..', '.44......333.44.', '.44.....33w2.44.', '..44...33w2.....', '...44.33w2......', '.....5522.......', '....551.........'],
  18: ['..32........32..', '.3221..44..1223.', '.3441.4554.1443.', '.2221.45w4.1222.', '.2221.4444.1222.', '.2221..44..1222.', '.1221..44..1221.', '.1111......1111.'],
  19: ['.5..4......4..5.', '..54.33333.45...', '....3323232.....', '....3222221.....', '....3222221.....', '.....22221......', '..32.22221.32...', '.3221.111.1223..', '.1111.....1111..'],
  20: ['....44....44....', '..334433334422..', '.33322222222211.', '.32211222211211.', '.32211222211211.', '..222221122211..', '.44222222222244.', '454.22122122.454', '.44..111111..44.'],
  21: ['....4444444.....', '..44333333224...', '.43322....2214..', '.432..3332..14..', '.432.33ww21.14..', '.432.32ww21.14..', '.422..2221..14..', '..4221....124...', '...411222214....', '.....444444.....'],
  22: ['..3w...3w...3w..', '..3w...3w...3w..', '..2w...2w...2w..', '..2w...2w...2w..', '..2w...2w...2w..', '.42w4.42w4.42w4.', '4555545555455554', '.44444444444444.', '..111111111111..'],
  23: ['....44444444....', '..44w......w44..', '.44..333333..44.', '.4..33222221..4.', '.4..322ww221..4.', '.4..322ww221..4.', '.4..22222211..4.', '.44..111111..44.', '..44w......w44..', '....44444444....'],
};

/**
 * Renders a 16xN pixel-art emblem grid into a 2x Hi-Bit PxCanvas with crisp beveled
 * 2x2 sub-pixel shading (top-left brightening, bottom-right depth) + unified ink outline!
 */
function paintHiBitCardEmblem(
  dst: PxCanvas,
  grid: readonly string[],
  t: MutCardTheme,
  scale: number,
  isUltra: boolean,
): void {
  const palette: Record<string, string> = {
    '1': t.dark,
    '2': t.fg,
    '3': t.fgHi,
    '4': t.accent,
    '5': t.accentHi,
    w: '#ffffff',
  };
  const gh = grid.length;
  const gw = grid[0]!.length;
  const emb = new PxCanvas(dst.w, dst.h);
  const startX = Math.floor((dst.w - gw * scale) * 0.5);
  const startY = Math.floor((dst.h - gh * scale) * 0.5);

  const isFilled = (gx: number, gy: number): boolean => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false;
    const ch = grid[gy]![gx];
    return Boolean(ch && ch !== '.' && ch !== ' ');
  };

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const ch = grid[gy]![gx];
      if (!ch || ch === '.' || ch === ' ') continue;
      const baseCol = palette[ch];
      if (!baseCol) continue;
      const sx = startX + gx * scale;
      const sy = startY + gy * scale;
      if (scale === 2) {
        // 2x Hi-Bit sub-pixel bevel: crisp top specular and deep underside crease!
        const ramp = makeRamp(baseCol);
        const topExposed = !isFilled(gx, gy - 1);
        const botExposed = !isFilled(gx, gy + 1);
        const leftExposed = !isFilled(gx - 1, gy);
        const rightExposed = !isFilled(gx + 1, gy);
        emb.set(sx, sy, topExposed || leftExposed ? (ch === 'w' ? '#ffffff' : ramp.light) : baseCol);
        emb.set(sx + 1, sy, topExposed ? (ch === 'w' ? '#ffffff' : ramp.light) : baseCol);
        emb.set(sx, sy + 1, botExposed ? ramp.dark : baseCol);
        emb.set(sx + 1, sy + 1, botExposed || rightExposed ? ramp.dark : baseCol);
      } else {
        emb.rect(sx, sy, scale, scale, baseCol);
      }
    }
  }

  emb.outline(INK);
  if (isUltra) emb.rimLight('#fff7b8', true);

  for (let y = 0; y < dst.h; y++) {
    for (let x = 0; x < dst.w; x++) {
      const col = emb.get(x, y);
      if (col) dst.set(x, y, col);
    }
  }
}

/** Paints an ornate 2x Hi-Bit wasteland card frame with radial Bayer glow & beveled rivets. */
function paintHiBitCardBackdrop(
  p: PxCanvas,
  t: MutCardTheme,
  frameCol: string,
  frameHi: string,
  frameDark: string,
  isHud: boolean,
): void {
  const w = p.w;
  const h = p.h;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const maxR = Math.hypot(cx, cy);

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR;
      const b = bayer4(x, y) / 16;
      p.set(x, y, d < 0.52 + b * 0.16 ? t.bgHi : t.bg);
    }
  }

  // Outer crisp dark ink outline + metallic inner frame bevel
  for (let x = 0; x < w; x++) {
    p.set(x, 0, INK);
    p.set(x, h - 1, INK);
    if (x >= 1 && x < w - 1) {
      p.set(x, 1, INK);
      p.set(x, h - 2, INK);
    }
  }
  for (let y = 0; y < h; y++) {
    p.set(0, y, INK);
    p.set(w - 1, y, INK);
    if (y >= 1 && y < h - 1) {
      p.set(1, y, INK);
      p.set(w - 2, y, INK);
    }
  }

  // Beveled top/bottom metallic header & footer bars
  p.rect(2, 2, w - 4, 2, frameHi);
  p.rect(2, 4, w - 4, isHud ? 1 : 2, frameCol);
  p.rect(2, h - (isHud ? 4 : 6), w - 4, isHud ? 2 : 4, frameDark);
  p.rect(2, 2, 2, h - 4, frameCol);
  p.rect(w - 4, 2, 2, h - 4, frameDark);

  // Corner specular rivets
  p.rect(3, 3, 2, 2, '#ffffff');
  p.rect(w - 5, 3, 2, 2, '#ffffff');
  if (!isHud) {
    p.rect(3, h - 5, 2, 2, frameHi);
    p.rect(w - 5, h - 5, 2, 2, frameHi);
  }
}

function registerSkillAndCrownSprites(b: FallbackAtlasBuilder): void {
  // 29 Bespoke Mutation Cards: sprSkillIcon (48x64 Hi-Bit -> 24x32) & sprSkillIconHUD (32x32 Hi-Bit -> 16x16)
  b.addSpriteHiBit('sprSkillIcon', 24, 32, 12, 16, 30, (ctx, ox, oy, w, h, f) => {
    const t = MUTATION_THEMES[f % MUTATION_THEMES.length]!;
    const p = new PxCanvas(w, h);
    paintHiBitCardBackdrop(p, t, t.fg, t.fgHi, t.dark, false);
    const grid = MUTATION_GRIDS_16[f % 30] ?? MUTATION_GRIDS_16[0]!;
    paintHiBitCardEmblem(p, grid, t, 2, false);
    p.flush(ctx, ox, oy);
  });

  b.addSpriteHiBit('sprSkillIconHUD', 16, 16, 8, 8, 30, (ctx, ox, oy, w, h, f) => {
    const t = MUTATION_THEMES[f % MUTATION_THEMES.length]!;
    const p = new PxCanvas(w, h);
    paintHiBitCardBackdrop(p, t, t.fg, t.fgHi, t.dark, true);
    const grid = MUTATION_GRIDS_16[f % 30] ?? MUTATION_GRIDS_16[0]!;
    // Scale 1.4x fit into 24x24 interior cleanly at 1:1 Hi-Bit (or crisp 1x centered with outline)
    paintHiBitCardEmblem(p, grid, t, 1, false);
    p.flush(ctx, ox, oy);
  });

  // 24 Bespoke Ultra Mutation Cards: sprEGSkillIcon (48x64 Hi-Bit -> 24x32) & sprEGIconHUD (32x32 Hi-Bit -> 16x16)
  b.addSpriteHiBit('sprEGSkillIcon', 24, 32, 12, 16, 24, (ctx, ox, oy, w, h, f) => {
    const isSlotB = f % 2 === 1;
    const t = ULTRA_THEMES_24[f % ULTRA_THEMES_24.length]!;
    const p = new PxCanvas(w, h);
    paintHiBitCardBackdrop(p, t, isSlotB ? '#f5b836' : '#ffe047', '#fff8bd', '#8f5d10', false);
    const grid = ULTRA_GRIDS_16[f % 24] ?? ULTRA_GRIDS_16[0]!;
    paintHiBitCardEmblem(p, grid, t, 2, true);
    p.flush(ctx, ox, oy);
  });

  b.addSpriteHiBit('sprEGIconHUD', 16, 16, 8, 8, 24, (ctx, ox, oy, w, h, f) => {
    const t = ULTRA_THEMES_24[f % ULTRA_THEMES_24.length]!;
    const p = new PxCanvas(w, h);
    paintHiBitCardBackdrop(p, t, '#ffe047', '#ffffff', '#8f5d10', true);
    const grid = ULTRA_GRIDS_16[f % 24] ?? ULTRA_GRIDS_16[0]!;
    paintHiBitCardEmblem(p, grid, t, 1, true);
    p.flush(ctx, ox, oy);
  });
  b.addAlias('sprUltraIcon', 'sprEGSkillIcon');

  // 13 Sculpted Hi-Bit Floating Crowns (32x28 Hi-Bit -> logical 16x14)
  const crownSpecs: ReadonlyArray<{ metal: string; gem: string; tall?: boolean; horned?: boolean }> = [
    { metal: '#8c7a66', gem: '#c9c2b8' },
    { metal: '#595261', gem: '#ff3838', tall: true },
    { metal: '#e8b835', gem: '#ff385c' },
    { metal: '#cfd8e3', gem: '#ffe047', horned: true },
    { metal: '#d9a432', gem: '#ff8826' },
    { metal: '#3d3347', gem: '#59ff73', tall: true, horned: true },
    { metal: '#b82532', gem: '#ffffff', tall: true },
    { metal: '#d4ab42', gem: '#b866ff', tall: true },
    { metal: '#eb88a8', gem: '#ffe047' },
    { metal: '#e6b835', gem: '#4df068' },
    { metal: '#7c32b8', gem: '#ff52c2', tall: true, horned: true },
    { metal: '#c94032', gem: '#ffe047' },
    { metal: '#8a99ad', gem: '#6ef2ff' },
  ];
  for (let c = 1; c <= 13; c++) {
    const cs = crownSpecs[c - 1]!;
    const mRamp = makeRamp(cs.metal);
    const gRamp = makeRamp(cs.gem);
    const drawCrown = (ctx: DrawCtx, ox: number, oy: number, w: number, h: number, f: number, walk: boolean): void => {
      const p = new PxCanvas(w, h);
      const bob = (walk ? (f & 1) * 2 : 0) + (f === 1 ? -1 : 0);
      const cy = 12 + bob;
      const cx = Math.floor(w * 0.5);
      const spireH = cs.tall ? 10 : 7;

      // Sculpted crown band with curved base & bevel rim
      p.poly([[cx - 11, cy], [cx + 11, cy], [cx + 10, cy + 10], [cx - 10, cy + 10]], mRamp);
      p.rect(cx - 10, cy + 2, 20, 3, mRamp.hi);
      p.rect(cx - 9, cy + 8, 18, 2, mRamp.dark2);
      // 3 distinct sculpted spires (or curved horns on horned crowns!)
      if (cs.horned) {
        p.poly([[cx - 11, cy + 1], [cx - 14, cy - spireH], [cx - 5, cy + 1]], mRamp.light);
        p.poly([[cx + 11, cy + 1], [cx + 14, cy - spireH], [cx + 5, cy + 1]], mRamp.dark);
      } else {
        p.poly([[cx - 11, cy + 1], [cx - 10, cy - spireH + 1], [cx - 4, cy + 1]], mRamp.light);
        p.poly([[cx + 11, cy + 1], [cx + 10, cy - spireH + 1], [cx + 4, cy + 1]], mRamp.dark);
      }
      p.poly([[cx - 5, cy + 1], [cx, cy - spireH - 2], [cx + 5, cy + 1]], mRamp.hi);
      p.poly([[cx - 3, cy + 1], [cx, cy - spireH - 2], [cx, cy + 1]], mRamp.spec);
      // Faceted glowing centerpiece gem
      p.poly([[cx, cy + 1], [cx + 4, cy + 5], [cx, cy + 9], [cx - 4, cy + 5]], gRamp.base);
      p.poly([[cx, cy + 1], [cx - 3, cy + 5], [cx, cy + 6]], gRamp.hi);
      p.rect(cx - 1, cy + 3, 2, 2, '#ffffff');
      p.outline(INK);
      p.flush(ctx, ox, oy);
    };
    b.addSpriteHiBit(`sprCrown${c}Idle`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown(ctx, x, y, w, h, f, false));
    b.addSpriteHiBit(`sprCrown${c}Walk`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown(ctx, x, y, w, h, f, true));
  }
}

// ============================================================================
// 3. HI-BIT HUD, HEALTH BAR/FILL (EXACT POLARITY), RAD VIAL, CROSSHAIRS & AMMO
// ============================================================================

function registerHudSprites(b: FallbackAtlasBuilder): void {
  // sprHealthBar: 176x28 Hi-Bit -> logical 88x14, orig=(0,0) riveted beveled wasteland gunmetal housing
  b.addSpriteHiBit('sprHealthBar', 88, 14, 0, 0, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    const steel = makeRamp('#464257');
    p.bevelBox(1, 1, w - 2, h - 2, steel, true);
    p.outline(INK);
    // Corner rivets
    for (const [rx, ry] of [[4, 4], [w - 7, 4], [4, h - 7], [w - 7, h - 7]] as const) {
      p.rect(rx, ry, 3, 3, INK);
      p.rect(rx, ry, 2, 2, steel.spec);
    }
    // Deep recessed crimson inner well (logical 3,3,82,8 -> Hi-Bit 6,6,164,16)
    p.rect(4, 4, w - 8, h - 8, INK);
    p.rect(6, 6, w - 12, h - 12, '#291018');
    p.rect(6, 6, w - 12, 2, '#17080d');
    p.rect(6, h - 8, w - 12, 2, '#3d1924');
    // Subtle tick grooves along top bevel
    for (let q = 1; q <= 3; q++) {
      const tx = 6 + Math.round(((w - 12) * q) / 4);
      p.rect(tx, 2, 2, 3, INK);
    }
    p.flush(ctx, ox, oy);
  });

  // sprHealthFill: 2x16 Hi-Bit -> logical 1x8, orig=(0,0), 11 frames — EXACT verified polarity!
  // frame 0 = PURE WHITE hurt flash; frame 1 = CRIMSON-ORANGE rgb(252, 56, 0) glossy fill!
  b.addSpriteHiBit('sprHealthFill', 1, 8, 0, 0, 11, (ctx, ox, oy, w, h, f) => {
    if (f === 0) {
      rect(ctx, ox, oy, w, h, '#ffffff');
      return;
    }
    if (f === 1) {
      rect(ctx, ox, oy, w, 2, '#ff9c6e');
      rect(ctx, ox, oy + 2, w, 2, '#ff5c26');
      rect(ctx, ox, oy + 4, w, 7, 'rgb(252, 56, 0)');
      rect(ctx, ox, oy + 11, w, 3, '#c42400');
      rect(ctx, ox, oy + 14, w, 2, '#7d1200');
      return;
    }
    if (f === 2) {
      rect(ctx, ox, oy, w, 4, '#bf2618');
      rect(ctx, ox, oy + 4, w, 8, '#8c140e');
      rect(ctx, ox, oy + 12, w, 4, '#590a08');
      return;
    }
    const tones = ['#e02c10', '#cc2018', '#b81c22', '#ff4d1a', '#ff7026', '#59ff73', '#6ef2ff', '#ffe047'];
    const c = tones[(f - 3) % tones.length]!;
    rect(ctx, ox, oy, w, h, c);
    rect(ctx, ox, oy, w, 2, '#ffffff');
  });

  // sprExpBar: 28x48 Hi-Bit -> logical 14x24, orig=(0,0), 16 frames beveled glass radioactive rad canister!
  b.addSpriteHiBit('sprExpBar', 14, 24, 0, 0, 16, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cap = makeRamp('#5e6b7d');
    // Armored metal top & bottom caps + glass tube housing
    p.bevelBox(2, 1, w - 4, 8, cap, true);
    p.bevelBox(2, h - 9, w - 4, 8, cap, true);
    p.rect(3, 8, w - 6, h - 16, '#101c16');
    p.rect(4, 8, 2, h - 16, '#1a2e23');
    p.rect(w - 6, 8, 2, h - 16, '#0a120e');
    // Bubbling radioactive emerald fill
    const innerH = h - 16;
    const fillH = Math.round((f / 15) * innerH);
    if (fillH > 0) {
      const fy = h - 8 - fillH;
      p.rect(4, fy, w - 8, fillH, '#1fa63a');
      p.rect(6, fy, w - 12, fillH, '#4df060');
      p.rect(8, fy, w - 16, fillH, '#8cff85');
      // Bright glowing meniscus crest
      p.rect(4, fy, w - 8, 2, '#e4ffe0');
      if (fillH >= 8) {
        p.ellipse(11, fy + 6, 2, 2, '#ffffff');
        if (fillH >= 16) p.ellipse(16, fy + 13, 2, 2, '#d6ffd9');
      }
    }
    // Curved vertical glass reflection streak + graduation marks
    p.rect(6, 10, 2, innerH - 4, '#ffffff');
    for (let gy = 14; gy < h - 10; gy += 6) {
      p.rect(w - 9, gy, 4, 1, '#708578');
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // sprExpBarLevel: 28x48 Hi-Bit -> logical 14x24, 1 frame pulsing golden ready glow
  b.addSpriteHiBit('sprExpBarLevel', 14, 24, 0, 0, 1, (ctx, ox, oy, w, h) => {
    rect(ctx, ox, oy, w, 4, '#ffe047');
    rect(ctx, ox, oy + h - 4, w, 4, '#ffe047');
    rect(ctx, ox, oy, 4, h, '#ffe047');
    rect(ctx, ox + w - 4, oy, 4, h, '#ffe047');
    rect(ctx, ox + 4, oy + 6, w - 8, h - 12, 'rgba(168, 255, 110, 0.45)');
  });

  // sprCrosshair: 32x32 Hi-Bit -> logical 16x16, orig=(8,8), 9 ultra-crisp dark-outlined tactical reticles
  b.addSpriteHiBit('sprCrosshair', 16, 16, 8, 8, 9, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.5);
    switch (f) {
      case 0:
        p.rect(cx - 12, cy - 1, 8, 2, '#ffffff');
        p.rect(cx + 5, cy - 1, 8, 2, '#ffffff');
        p.rect(cx - 1, cy - 12, 2, 8, '#ffffff');
        p.rect(cx - 1, cy + 5, 2, 8, '#ffffff');
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 1:
        for (let a = 0; a < 36; a++) {
          const rad = (a / 36) * Math.PI * 2;
          p.rect(Math.round(cx + Math.cos(rad) * 9) - 1, Math.round(cy + Math.sin(rad) * 9) - 1, 2, 2, '#ffffff');
        }
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 2:
        p.rect(cx - 12, cy - 12, 7, 2, '#ffffff'); p.rect(cx - 12, cy - 12, 2, 7, '#ffffff');
        p.rect(cx + 5, cy - 12, 7, 2, '#ffffff'); p.rect(cx + 10, cy - 12, 2, 7, '#ffffff');
        p.rect(cx - 12, cy + 10, 7, 2, '#ffffff'); p.rect(cx - 12, cy + 5, 2, 7, '#ffffff');
        p.rect(cx + 5, cy + 10, 7, 2, '#ffffff'); p.rect(cx + 10, cy + 5, 2, 7, '#ffffff');
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 3:
        p.line(cx - 10, cy - 10, cx - 4, cy - 4, '#ffffff', 2);
        p.line(cx + 10, cy - 10, cx + 4, cy - 4, '#ffffff', 2);
        p.line(cx - 10, cy + 10, cx - 4, cy + 4, '#ffffff', 2);
        p.line(cx + 10, cy + 10, cx + 4, cy + 4, '#ffffff', 2);
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 4:
        p.rect(cx - 12, cy - 1, 9, 2, '#ffffff');
        p.rect(cx + 4, cy - 1, 9, 2, '#ffffff');
        p.rect(cx - 1, cy - 12, 2, 9, '#ffffff');
        p.rect(cx - 1, cy + 4, 2, 9, '#ffffff');
        break;
      case 5:
        p.line(cx, cy - 9, cx + 9, cy, '#ffffff', 2);
        p.line(cx + 9, cy, cx, cy + 9, '#ffffff', 2);
        p.line(cx, cy + 9, cx - 9, cy, '#ffffff', 2);
        p.line(cx - 9, cy, cx, cy - 9, '#ffffff', 2);
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 6:
        p.rect(cx - 10, cy - 10, 20, 2, '#ffffff');
        p.rect(cx - 10, cy + 8, 20, 2, '#ffffff');
        p.rect(cx - 10, cy - 10, 2, 20, '#ffffff');
        p.rect(cx + 8, cy - 10, 2, 20, '#ffffff');
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
      case 7:
        p.ellipse(cx, cy, 3, 3, '#ffffff');
        break;
      default:
        p.rect(cx - 11, cy - 6, 2, 13, '#ffffff');
        p.rect(cx - 11, cy - 6, 5, 2, '#ffffff');
        p.rect(cx - 11, cy + 5, 5, 2, '#ffffff');
        p.rect(cx + 9, cy - 6, 2, 13, '#ffffff');
        p.rect(cx + 6, cy - 6, 5, 2, '#ffffff');
        p.rect(cx + 6, cy + 5, 5, 2, '#ffffff');
        p.rect(cx - 1, cy - 1, 2, 2, '#ffe047');
        break;
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Sculpted 2x Hi-Bit Draining 8-Frame Ammo Icons (20x20 Hi-Bit -> logical 10x10)
  const applyDrainHiBit = (ctx: DrawCtx, ox: number, oy: number, w: number, h: number, f: number): void => {
    if (f <= 0) return;
    const emptyRows = Math.min(h - 4, Math.ceil((f / 7) * (h - 4)));
    ctx.save();
    ctx.fillStyle = f >= 7 ? 'rgba(10, 8, 16, 0.80)' : 'rgba(12, 9, 18, 0.65)';
    ctx.fillRect(ox + 2, oy + 2, w - 4, emptyRows);
    ctx.restore();
  };

  b.addSpriteHiBit('sprBulletIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const brass = makeRamp('#ebb832');
    const copper = makeRamp('#cf7b2e');
    p.poly([[10, 2], [14, 7], [14, 17], [6, 17], [6, 7]], brass);
    p.poly([[10, 2], [13, 7], [7, 7]], copper.light);
    p.rect(7, 8, 2, 8, brass.spec);
    p.rect(6, 15, 8, 2, brass.dark2);
    p.outline(INK);
    p.flush(ctx, ox, oy);
    applyDrainHiBit(ctx, ox, oy, w, h, f);
  });

  b.addSpriteHiBit('sprShotIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const red = makeRamp('#df342b');
    const brass = makeRamp('#f0c23a');
    p.bevelBox(5, 3, 10, 10, red, false);
    p.rect(7, 4, 2, 8, red.hi);
    p.bevelBox(4, 12, 12, 6, brass, false);
    p.rect(6, 13, 3, 4, brass.spec);
    p.outline(INK);
    p.flush(ctx, ox, oy);
    applyDrainHiBit(ctx, ox, oy, w, h, f);
  });
  b.addAlias('sprShellIcon', 'sprShotIcon');

  b.addSpriteHiBit('sprBoltIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const bolt = makeRamp('#42e864');
    p.line(3, 10, 14, 10, bolt.base, 3);
    p.line(3, 9, 13, 9, bolt.hi, 1);
    p.poly([[10, 4], [18, 10], [10, 16], [12, 10]], bolt.hi);
    p.poly([[12, 6], [17, 10], [12, 10]], '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
    applyDrainHiBit(ctx, ox, oy, w, h, f);
  });

  b.addSpriteHiBit('sprExploIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const bomb = makeRamp('#ff7424');
    const steel = makeRamp('#788594');
    p.shadedEllipse(10, 12, 6, 6, bomb, -0.4, -0.5);
    p.bevelBox(7, 3, 6, 4, steel, false);
    p.line(13, 4, 16, 2, '#ffe047', 2);
    p.rect(15, 2, 2, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
    applyDrainHiBit(ctx, ox, oy, w, h, f);
  });

  b.addSpriteHiBit('sprEnergyIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const plasma = makeRamp('#3ba6ff');
    p.bevelBox(5, 3, 10, 14, plasma, true);
    p.poly([[11, 4], [7, 11], [10, 11], [9, 16], [14, 9], [10, 9]], '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
    applyDrainHiBit(ctx, ox, oy, w, h, f);
  });

  // sprRogueAmmoHUD: 22x32 Hi-Bit -> logical 11x16, orig=(1,1), 4 frames
  b.addSpriteHiBit('sprRogueAmmoHUD', 11, 16, 1, 1, 4, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const metal = makeRamp('#394866');
    p.bevelBox(2, 2, w - 4, h - 4, metal, true);
    for (let slot = 0; slot < 3; slot++) {
      const sy = 21 - slot * 6;
      const lit = slot < f;
      p.rect(5, sy, w - 10, 4, lit ? '#3da6ff' : '#1b2333');
      if (lit) p.rect(6, sy, w - 12, 2, '#d4fbff');
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSpriteHiBit('sprAmmoIcons', 10, 10, 5, 5, 6, (ctx, ox, oy, w, h, f) => {
    const cols = ['#f2c138', '#e0342b', '#4df068', '#ff7824', '#4dc8ff', '#d6dde6'];
    const p = new PxCanvas(w, h);
    p.bevelBox(4, 4, 12, 12, makeRamp(cols[f % cols.length]!), true);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Sculpted Hi-Bit HUD Kills Skull (16x16 Hi-Bit -> logical 8x8, orig=(4,4))
  b.addSpriteHiBit('sprKillsIcon', 8, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    const bone = makeRamp('#e8e0cf');
    p.shadedEllipse(8, 6, 6, 5, bone, -0.4, -0.5);
    p.rect(4, 9, 8, 4, bone.base);
    p.rect(5, 11, 6, 2, bone.dark);
    p.rect(4, 5, 3, 3, INK);
    p.rect(9, 5, 3, 3, INK);
    p.rect(7, 8, 2, 2, INK);
    p.rect(5, 11, 1, 2, INK);
    p.rect(8, 11, 1, 2, INK);
    p.rect(10, 11, 1, 2, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSpriteHiBit('sprGameOverSkull', 8, 6, 4, 3, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    const bone = makeRamp('#ebe4d6');
    p.shadedEllipse(8, 5, 6, 4, bone, -0.4, -0.5);
    p.rect(5, 8, 6, 3, bone.base);
    p.rect(4, 4, 3, 3, INK);
    p.rect(9, 4, 3, 3, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSpriteHiBit('sprGameOverThrone', 9, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    const throne = makeRamp('#44527a');
    p.bevelBox(3, 2, 12, 12, throne, true);
    p.rect(5, 3, 8, 3, '#f5c742');
    p.rect(6, 7, 6, 5, '#4dff75');
    p.rect(8, 8, 2, 3, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprMapDot', 3, 3, 1, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 3, 3, '#e6e6eb');
    px(ctx, x + 1, y + 1, '#ffffff');
  });
}

export function registerFallbackUi(b: FallbackAtlasBuilder): void {
  // 1. Krunked Throne Hi-Bit Title Emblem & Contoured Glow
  registerLogoSprites(b);

  // 2. Large Hi-Bit Bust Portraits (192x160 -> logical 96x80, orig=(48,40), 24 frames)
  b.addSpriteHiBit('sprBigPortrait', 96, 80, 48, 40, 24, (ctx, x, y, w, h, f) =>
    drawMutantBigPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 3. Mini Hi-Bit Char Select Roster Cards (32x48 -> logical 16x24, orig=(0,0), 18 frames)
  b.addSpriteHiBit('sprCharSelect', 16, 24, 0, 0, 18, (ctx, x, y, w, h, f) =>
    drawCharSelectCardHiBit(ctx, x, y, w, h, f),
  );

  // 3b. 5 Custom Close-Up Hi-Bit Boss Intro Splash Portraits (160x140 -> logical 80x70, orig=(40,35))
  b.addSpriteHiBit('sprBuiltinBossPortrait', 80, 70, 40, 35, 5, (ctx, x, y, w, h, f) =>
    drawBossIntroPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 4. 29 Bespoke Mutation Cards + 24 Ultra Cards + 13 Distinct Crowns
  registerSkillAndCrownSprites(b);

  // 5. HUD, Health Bar/Fill, Rad Vial, Crosshairs & Ammo Icons
  registerHudSprites(b);
}
