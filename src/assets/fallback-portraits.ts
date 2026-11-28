import { type DrawCtx, INK } from './fallback-fonts';
import { type ColorRamp, PxCanvas, bayer4, makeRamp } from './pixel-art';

// ============================================================================
// NUCLEAR THRONE-GRADE HI-BIT PORTRAITS (192x160), ROSTER CARDS (32x48)
// AND 5 CUSTOM CLOSE-UP BOSS INTRO SPLASH ILLUSTRATIONS (160x140)
// Gritty asymmetrical 3/4 wasteland character art with dramatic half-face ink
// shadows, comic hatching/dithering, expressive silhouettes & vivid rim lights.
// ============================================================================

interface BustPalette {
  bgDeep: string;
  bgMid: string;
  bgGlow: string;
  rim: string;
  skin: string;
  gear: string;
  eye: string;
  accent: string;
  isB: boolean;
}

const BUST_PALETTES_24: readonly BustPalette[] = [
  // 0: Fish A, 1: Fish B
  { bgDeep: '#091712', bgMid: '#183d2e', bgGlow: '#2e7858', rim: '#9cffba', skin: '#44b570', gear: '#965c32', eye: '#fff266', accent: '#f5c742', isB: false },
  { bgDeep: '#18070c', bgMid: '#3d1320', bgGlow: '#782238', rim: '#ff8590', skin: '#2a8552', gear: '#d62638', eye: '#ffe852', accent: '#f5c742', isB: true },
  // 2: Crystal A, 3: Crystal B
  { bgDeep: '#110620', bgMid: '#2f1252', bgGlow: '#6727ab', rim: '#f5c2ff', skin: '#b347eb', gear: '#de8cff', eye: '#ffffff', accent: '#75ebff', isB: false },
  { bgDeep: '#1a1004', bgMid: '#422909', bgGlow: '#875714', rim: '#fff7a6', skin: '#f0aa26', gear: '#ffde59', eye: '#78f5ff', accent: '#ffffff', isB: true },
  // 4: Eyes A, 5: Eyes B
  { bgDeep: '#070e24', bgMid: '#152a5e', bgGlow: '#2c58b3', rim: '#99d1ff', skin: '#4075d9', gear: '#244594', eye: '#ffffff', accent: '#78ebff', isB: false },
  { bgDeep: '#140514', bgMid: '#381233', bgGlow: '#752063', rim: '#ff8ec0', skin: '#632e82', gear: '#ad244d', eye: '#ffe84d', accent: '#ff5299', isB: true },
  // 6: Melting A, 7: Melting B
  { bgDeep: '#140b0e', bgMid: '#331e24', bgGlow: '#66343d', rim: '#faf2de', skin: '#ded2ba', gear: '#a62b36', eye: '#140f17', accent: '#d63b47', isB: false },
  { bgDeep: '#170606', bgMid: '#401410', bgGlow: '#8f2c16', rim: '#ff9142', skin: '#524859', gear: '#d62e22', eye: '#ff8c26', accent: '#fff48c', isB: true },
  // 8: Plant A, 9: Plant B
  { bgDeep: '#061709', bgMid: '#143d1b', bgGlow: '#2a7834', rim: '#a6ff91', skin: '#3dc249', gear: '#e02b3a', eye: '#ffe847', accent: '#fff8e8', isB: false },
  { bgDeep: '#0e061c', bgMid: '#281342', bgGlow: '#562285', rim: '#ff96f2', skin: '#2a9485', gear: '#cf28bc', eye: '#7dffec', accent: '#fff5ff', isB: true },
  // 10: Y.V. A, 11: Y.V. B
  { bgDeep: '#140d24', bgMid: '#302052', bgGlow: '#634499', rim: '#ffeb7a', skin: '#f2ebdc', gear: '#f2bf30', eye: '#ffffff', accent: '#54f068', isB: false },
  { bgDeep: '#1c0a18', bgMid: '#401832', bgGlow: '#822a56', rim: '#ff9ed6', skin: '#eddcc7', gear: '#ffd438', eye: '#ff3b5c', accent: '#59ff7a', isB: true },
  // 12: Steroids A, 13: Steroids B
  { bgDeep: '#1c120b', bgMid: '#402718', bgGlow: '#7a4a28', rim: '#ffe0a3', skin: '#cc8a58', gear: '#dce2eb', eye: '#70ebff', accent: '#ed5e3b', isB: false },
  { bgDeep: '#0c1622', bgMid: '#1d334c', bgGlow: '#37628c', rim: '#99dcff', skin: '#bd7e50', gear: '#334357', eye: '#ff6347', accent: '#ffe047', isB: true },
  // 14: Robot A, 15: Robot B
  { bgDeep: '#08161c', bgMid: '#143442', bgGlow: '#26687f', rim: '#82ffa3', skin: '#839cb0', gear: '#42596b', eye: '#5eff7d', accent: '#ffe047', isB: false },
  { bgDeep: '#1c0f08', bgMid: '#402314', bgGlow: '#82441e', rim: '#ffb559', skin: '#b8693b', gear: '#633720', eye: '#ff9933', accent: '#6ef2ff', isB: true },
  // 16: Chicken A, 17: Chicken B
  { bgDeep: '#1f080a', bgMid: '#47161a', bgGlow: '#8f272d', rim: '#ffa67d', skin: '#f2ece0', gear: '#e62b38', eye: '#141016', accent: '#f7b92a', isB: false },
  { bgDeep: '#0b0c1a', bgMid: '#1f223b', bgGlow: '#3e4478', rim: '#ff6e82', skin: '#303545', gear: '#ff2e47', eye: '#ffe047', accent: '#f7b92a', isB: true },
  // 18: Rebel A, 19: Rebel B
  { bgDeep: '#10170d', bgMid: '#283622', bgGlow: '#506942', rim: '#c2f5b5', skin: '#94b38f', gear: '#cfa978', eye: '#fff28f', accent: '#54adff', isB: false },
  { bgDeep: '#1f090f', bgMid: '#421723', bgGlow: '#822a40', rim: '#ffb0a6', skin: '#546578', gear: '#d63645', eye: '#70f2ff', accent: '#ffe047', isB: true },
  // 20: Horror A, 21: Horror B
  { bgDeep: '#041609', bgMid: '#0d3b17', bgGlow: '#1f8532', rim: '#b0ff94', skin: '#3de057', gear: '#1c9636', eye: '#ffffff', accent: '#deff54', isB: false },
  { bgDeep: '#120722', bgMid: '#2b144f', bgGlow: '#5d28a3', rim: '#f0a3ff', skin: '#ab47f0', gear: '#5b1ca1', eye: '#7dff9a', accent: '#ff6be0', isB: true },
  // 22: Rogue A, 23: Rogue B
  { bgDeep: '#060e22', bgMid: '#142957', bgGlow: '#2955b3', rim: '#8cdcff', skin: '#e0aa85', gear: '#3063cf', eye: '#75f0ff', accent: '#f0c74d', isB: false },
  { bgDeep: '#130b1d', bgMid: '#2d1c42', bgGlow: '#593882', rim: '#ccebff', skin: '#e0aa85', gear: '#4b5b7d', eye: '#ff547a', accent: '#75f0ff', isB: true },
];

const DARK_INK = '#140e1c';
const WHITE = '#ffffff';
const CREAM = '#f7f0e0';

/** Gritty Nuclear Throne comic portrait backdrop: radial spotlight + diagonal action ink slashes. */
function paintPortraitBackdrop(
  p: PxCanvas,
  w: number,
  h: number,
  bgDeep: string,
  bgMid: string,
  bgGlow: string,
  rim: string,
  cx: number,
  cy: number,
  seed: number,
): void {
  const maxR = Math.hypot(w * 0.62, h * 0.62);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.hypot((x - cx) * 0.88, (y - cy) * 1.05) / maxR;
      const b = bayer4(x, y) / 16;
      const slash = ((x * 2 - y * 3 + seed * 19) & 31) < 3 ? -0.10 : 0;
      const v = dist + slash;
      let col = bgDeep;
      if (v < 0.36 + b * 0.14) col = bgGlow;
      else if (v < 0.70 + b * 0.16) col = bgMid;
      p.set(x, y, col);
    }
  }
  // Gritty jagged ink splatter streaks in upper corners (authentic NT portrait vibe!)
  for (let i = 0; i < 4; i++) {
    const sy = 10 + i * 11 + (seed % 5);
    const len = 14 + ((seed * 7 + i * 13) % 24);
    p.rect(4, sy, len, 2, INK);
    p.rect(w - 4 - Math.floor(len * 0.7), sy + 6, Math.floor(len * 0.7), 2, INK);
  }
  void rim;
}

/** Paints expressive comic-style wasteland eye with heavy brow shadow & crisp specular glint. */
function paintExpressiveEye(
  p: PxCanvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sclera: string,
  iris: string,
  lidColor: string,
  pupilShiftX = 0,
  tilt = 0, // -1 angry inward tilt, +1 wide/wild
): void {
  p.ellipse(cx, cy, rx + 2, ry + 2, INK);
  p.ellipse(cx, cy, rx, ry, sclera);
  if (rx >= 4) {
    p.ellipse(cx + pupilShiftX, cy + 1, Math.max(2, Math.round(rx * 0.50)), Math.max(2, Math.round(ry * 0.58)), iris);
    p.ellipse(cx + pupilShiftX, cy + 1, Math.max(1, Math.round(rx * 0.28)), Math.max(1, Math.round(ry * 0.32)), INK);
  } else {
    p.ellipse(cx + pupilShiftX, cy, Math.max(1, rx - 1), Math.max(1, ry - 1), INK);
  }
  const lidH = Math.max(2, Math.round(ry * 0.50));
  p.poly(
    [
      [cx - rx - 2, cy - ry - 2],
      [cx + rx + 2, cy - ry - 2],
      [cx + rx + 2, cy - ry + lidH + tilt * 3],
      [cx - rx - 2, cy - ry + lidH - tilt * 3],
    ],
    lidColor,
  );
  p.line(cx - rx - 2, cy - ry + lidH - tilt * 3, cx + rx + 2, cy - ry + lidH + tilt * 3, INK, 2);
  p.rect(
    cx - Math.max(1, Math.floor(rx * 0.42)),
    cy - Math.max(0, Math.floor(ry * 0.15)),
    Math.max(2, Math.floor(rx * 0.36)),
    Math.max(2, Math.floor(ry * 0.36)),
    WHITE,
  );
}

/** Applies dramatic gritty comic half-face right-side shadow hatching across an already-drawn foreground layer. */
function applyComicShadowHatching(fg: PxCanvas, splitX: number, shadowColor: string): void {
  for (let y = 0; y < fg.h; y++) {
    for (let x = splitX; x < fg.w; x++) {
      if (!fg.isOpaque(x, y)) continue;
      const dist = x - splitX;
      if (dist > 18 && bayer4(x, y) < 6) {
        fg.set(x, y, shadowColor);
      } else if (dist > 8 && ((x + y) & 3) === 0 && bayer4(x, y) < 4) {
        fg.set(x, y, shadowColor);
      }
    }
  }
}

function compositeLayer(dst: PxCanvas, src: PxCanvas): void {
  const w = Math.min(dst.w, src.w);
  const h = Math.min(dst.h, src.h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = src.get(x, y);
      if (col) dst.set(x, y, col);
    }
  }
}

/**
 * Renders 2x Hi-Bit Nuclear Throne Mutant Bust Portrait (192x160 -> logical 96x80).
 * Frames 0..23 = (raceIndex - 1) * 2 + (skin === 'b' ? 1 : 0).
 */
export function drawMutantBigPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const pal = BUST_PALETTES_24[frame % BUST_PALETTES_24.length]!;
  const mutantIdx = Math.floor((frame % 24) / 2);

  const p = new PxCanvas(w, h);
  const metal: ColorRamp = makeRamp('#7d8b9e');
  const sk: ColorRamp = makeRamp(pal.skin);
  const gr: ColorRamp = makeRamp(pal.gear);
  const ac: ColorRamp = makeRamp(pal.accent);
  const leather: ColorRamp = makeRamp('#5e3b24');

  // Dynamic asymmetrical 3/4 portrait center shifted slightly left so character looks into the campfire!
  const cx = Math.floor(w * 0.48);
  const cy = Math.floor(h * 0.52);

  paintPortraitBackdrop(p, w, h, pal.bgDeep, pal.bgMid, pal.bgGlow, pal.rim, cx, cy - 8, frame + 3);

  const fg = new PxCanvas(w, h);

  switch (mutantIdx) {
    case 0: {
      // FISH — gritty 3/4 ex-cop fishman: jagged swept dorsal crest, crooked badass grin, battered tactical vest, guitar neck peeking behind shoulder!
      // Acoustic guitar neck peeking over back right shoulder (iconic Fish lore!)
      fg.line(cx + 28, 118, cx + 66, 22, leather.dark, 11);
      fg.line(cx + 30, 116, cx + 65, 24, leather.light, 5);
      fg.bevelBox(cx + 56, 12, 18, 22, leather, true);
      fg.rect(cx + 52, 16, 4, 3, ac.hi);
      fg.rect(cx + 52, 24, 4, 3, ac.hi);
      // Broad hunched wasteland cop jacket shoulders
      fg.poly([[cx - 66, h], [cx - 56, 112], [cx - 20, 98], [cx + 28, 102], [cx + 62, 118], [cx + 72, h]], gr);
      fg.poly([[cx - 64, h], [cx - 54, 114], [cx - 22, 100], [cx - 4, h]], gr.light);
      fg.poly([[cx + 16, 108], [cx + 58, 120], [cx + 68, h], [cx + 18, h]], gr.dark2);
      // Open upturned jacket collar framing muscular amphibious neck
      fg.poly([[cx - 26, 98], [cx - 12, 136], [cx - 40, 128], [cx - 42, 104]], gr.hi);
      fg.poly([[cx + 24, 100], [cx + 14, 134], [cx + 38, 126], [cx + 42, 106]], gr.dark);
      fg.poly([[cx - 18, 98], [cx + 20, 98], [cx + 14, 138], [cx - 2, 148], [cx - 16, 134]], sk.dark);
      fg.poly([[cx - 14, 100], [cx + 6, 100], [cx + 2, 134], [cx - 10, 126]], sk.base);
      // Gleaming crooked brass sheriff badge pinned to left chest (not a diagonal stick!)
      fg.poly([[cx - 32, 130], [cx - 22, 124], [cx - 12, 130], [cx - 16, 144], [cx - 28, 144]], ac.light);
      fg.poly([[cx - 28, 131], [cx - 22, 127], [cx - 16, 131], [cx - 18, 139], [cx - 26, 139]], ac.spec);
      // Swept-back jagged punk dorsal fin crest (asymmetrical 3/4!)
      for (const [fx, fy, fh, fw] of [[cx - 26, 22, 26, 16], [cx - 6, 10, 32, 18], [cx + 16, 18, 28, 16], [cx + 34, 32, 22, 14]] as const) {
        fg.poly([[fx - fw / 2, fy + fh], [fx - 8, fy], [fx + fw / 2 + 2, fy + fh]], sk.dark2);
        fg.poly([[fx - fw / 2 + 2, fy + fh], [fx - 6, fy + 4], [fx + 2, fy + fh]], sk.hi);
      }
      // Sculpted 3/4 amphibian head + strong jaw
      fg.shadedEllipse(cx, 66, 40, 35, sk, -0.48, -0.52);
      fg.shadedEllipse(cx + 4, 88, 36, 19, sk, -0.42, -0.35);
      // Flared gill-fins on cheeks (larger on near-left cheek)
      fg.poly([[cx - 38, 66], [cx - 58, 58], [cx - 54, 88], [cx - 34, 92]], sk.base);
      fg.poly([[cx - 36, 68], [cx - 53, 62], [cx - 48, 82], [cx - 34, 86]], sk.hi);
      fg.poly([[cx + 38, 68], [cx + 52, 64], [cx + 50, 86], [cx + 34, 90]], sk.dark2);
      for (let g = 0; g < 3; g++) {
        fg.line(cx - 32 + g * 2, 74 + g * 5, cx - 20 + g * 2, 78 + g * 5, INK, 2);
      }
      if (pal.isB) {
        fg.poly([[cx - 42, 46], [cx + 42, 44], [cx + 40, 58], [cx - 40, 60]], gr.base);
        fg.rect(cx - 38, 48, 76, 4, gr.hi);
        fg.poly([[cx - 38, 50], [cx - 66, 42], [cx - 68, 56], [cx - 40, 58]], gr.dark);
      }
      // Intense lowered brow + asymmetrical confident yellow eyes looking right!
      fg.shadedEllipse(cx - 12, 62, 14, 10, sk, -0.45, -0.5);
      fg.shadedEllipse(cx + 21, 63, 12, 9, sk, -0.45, -0.5);
      paintExpressiveEye(fg, cx - 11, 66, 10, 8, pal.eye, ac.base, sk.dark2, 3, 1);
      paintExpressiveEye(fg, cx + 21, 66, 8, 7, pal.eye, ac.base, sk.dark2, 2, -1);
      // Crooked badass wasteland smirk with chipped fangs!
      fg.bezier(cx - 18, 90, cx + 6, 94, cx + 30, 84, INK, 6);
      fg.poly([[cx - 10, 90], [cx - 6, 81], [cx - 2, 90]], CREAM);
      fg.poly([[cx + 14, 88], [cx + 18, 79], [cx + 22, 87]], pal.isB ? ac.hi : CREAM);
      applyComicShadowHatching(fg, cx + 22, sk.out);
      break;
    }

    case 1: {
      // CRYSTAL — jagged asymmetric crystalline war-golem with glowing cracked core & dramatic angular spires!
      fg.poly([[cx - 68, h], [cx - 58, 100], [cx - 24, 90], [cx + 28, 94], [cx + 66, 106], [cx + 76, h]], sk.dark);
      fg.poly([[cx - 66, h], [cx - 56, 102], [cx - 24, 92], [cx - 12, 128], [cx - 24, h]], sk.light);
      fg.poly([[cx - 54, 104], [cx - 26, 94], [cx - 20, 118], [cx - 44, 124]], sk.spec);
      fg.poly([[cx + 18, 124], [cx + 30, 96], [cx + 64, 108], [cx + 74, h], [cx + 24, h]], sk.dark2);
      // Towering asymmetric crystal spires
      fg.poly([[cx - 54, 114], [cx - 68, 44], [cx - 38, 70], [cx - 30, 106]], sk.base);
      fg.poly([[cx - 65, 48], [cx - 52, 76], [cx - 40, 72]], sk.spec);
      fg.poly([[cx + 54, 112], [cx + 70, 52], [cx + 42, 74], [cx + 34, 106]], sk.dark2);
      fg.poly([[cx + 66, 56], [cx + 52, 78], [cx + 44, 74]], sk.light);
      // Glowing faceted chest heart crystal
      fg.poly([[cx + 2, 106], [cx + 20, 128], [cx + 2, 154], [cx - 16, 128]], gr.light);
      fg.poly([[cx + 2, 108], [cx - 12, 128], [cx + 2, 144]], WHITE);
      // Tilted sharp crystalline monolith head
      fg.poly([[cx - 4, 12], [cx + 24, 38], [cx + 38, 72], [cx + 24, 102], [cx + 2, 112], [cx - 24, 102], [cx - 38, 72], [cx - 26, 40]], sk.base);
      fg.poly([[cx - 4, 14], [cx - 24, 42], [cx - 36, 72], [cx - 6, 68], [cx, 42]], sk.hi);
      fg.poly([[cx - 4, 14], [cx - 16, 42], [cx - 2, 52], [cx + 10, 36]], sk.spec);
      fg.poly([[cx - 4, 14], [cx - 8, 36], [cx - 2, 44]], WHITE);
      fg.poly([[cx, 42], [cx + 22, 40], [cx + 36, 72], [cx + 22, 100], [cx + 8, 84]], sk.dark2);
      fg.line(cx - 4, 14, cx - 6, 68, WHITE, 2);
      fg.line(cx - 6, 68, cx - 36, 72, sk.spec, 2);
      fg.line(cx - 6, 68, cx + 2, 110, sk.light, 2);
      // Piercing slanted glowing eyes
      fg.poly([[cx - 22, 64], [cx - 4, 70], [cx - 7, 79], [cx - 20, 74]], INK);
      fg.poly([[cx + 26, 65], [cx + 10, 70], [cx + 12, 79], [cx + 24, 74]], INK);
      fg.poly([[cx - 20, 67], [cx - 6, 71], [cx - 8, 77], [cx - 18, 73]], pal.eye);
      fg.poly([[cx + 24, 67], [cx + 12, 71], [cx + 13, 77], [cx + 22, 73]], pal.eye);
      for (const [sx, sy, sr] of [[cx - 68, 30, 6], [cx + 68, 28, 7], [cx + 76, 82, 5]] as const) {
        fg.poly([[sx, sy - sr * 2], [sx + sr, sy], [sx, sy + sr * 2], [sx - sr, sy]], gr.hi);
        fg.poly([[sx, sy - sr * 2], [sx - sr, sy], [sx, sy]], WHITE);
      }
      break;
    }

    case 2: {
      // EYES — haunting asymmetric psychic mutant with eerie staring eyes of varying sizes & psychic ripples!
      fg.shadedEllipse(cx, 146, 56, 36, sk, -0.45, -0.5);
      fg.shadedEllipse(cx, 128, 38, 22, gr, -0.35, -0.45);
      for (let r = 0; r < 2; r++) {
        const off = r * 11;
        fg.bezier(cx - 62 - off, 46, cx - 50 - off, 24, cx - 32 - off, 20, ac.hi, 3);
        fg.bezier(cx + 62 + off, 46, cx + 50 + off, 24, cx + 32 + off, 20, ac.hi, 3);
      }
      fg.shadedEllipse(cx, 66, 40, 46, sk, -0.45, -0.5);
      fg.shadedEllipse(cx - 2, 42, 34, 24, sk, -0.45, -0.55);
      fg.bezier(cx - 26, 30, cx - 6, 20, cx + 16, 26, ac.base, 2);
      // Asymmetric cluster of 6 haunting glossy eyes!
      paintExpressiveEye(fg, cx - 18, 64, 14, 13, pal.eye, ac.base, sk.dark2, 2, 0);
      paintExpressiveEye(fg, cx + 19, 60, 12, 11, pal.eye, ac.base, sk.dark2, 1, 0);
      paintExpressiveEye(fg, cx + 3, 36, 9, 8, pal.eye, ac.light, sk.dark2, 1, 0);
      paintExpressiveEye(fg, cx - 14, 90, 8, 7, pal.eye, ac.base, sk.dark2, 1, 0);
      paintExpressiveEye(fg, cx + 16, 86, 7, 6, pal.eye, ac.base, sk.dark2, 0, 0);
      paintExpressiveEye(fg, cx - 26, 44, 5, 5, pal.eye, ac.light, sk.dark2, 1, 0);
      applyComicShadowHatching(fg, cx + 22, sk.out);
      break;
    }

    case 3: {
      // MELTING — agonizingly expressive melting wasteland skull with lopsided dripping cheek wax & exposed ribs!
      fg.poly([[cx - 66, h], [cx - 52, 112], [cx - 20, 102], [cx + 22, 102], [cx + 54, 112], [cx + 68, h]], gr.dark);
      fg.poly([[cx - 64, h], [cx - 50, 114], [cx - 22, 104], [cx - 18, h]], gr.light);
      fg.poly([[cx - 22, 104], [cx + 22, 104], [cx + 28, h], [cx - 28, h]], DARK_INK);
      fg.rect(cx - 3, 108, 6, 48, sk.base);
      for (let r = 0; r < 3; r++) {
        const ry = 116 + r * 12;
        fg.bezier(cx - 22, ry + 3, cx - 10, ry - 4, cx - 2, ry, sk.hi, 4);
        fg.bezier(cx + 22, ry + 3, cx + 10, ry - 4, cx + 2, ry, sk.light, 4);
      }
      fg.rect(cx - 12, 92, 24, 22, sk.dark2);
      // Asymmetrically slumped melting cranium
      fg.shadedEllipse(cx - 2, 54, 34, 30, sk, -0.45, -0.55);
      fg.shadedEllipse(cx - 24, 74, 15, 18, sk, -0.4, -0.3);
      fg.shadedEllipse(cx + 20, 72, 14, 15, sk, -0.4, -0.3);
      for (const [dx, dy, dh, dw] of [[cx - 34, 78, 42, 10], [cx - 22, 88, 28, 8], [cx + 26, 78, 32, 8], [cx + 14, 88, 22, 6]] as const) {
        fg.shadedCapsule(dx, dy, dx, dy + dh, dw * 0.5, sk);
        fg.ellipse(dx, dy + dh, Math.round(dw * 0.58), Math.round(dw * 0.58), sk.light);
      }
      fg.shadedEllipse(cx, 89, 19, 14, sk, -0.35, -0.3);
      fg.crack(cx - 18, 28, 20, 0.78, 11, INK, sk.hi);
      fg.crack(cx + 14, 26, 16, 2.25, 29, INK, sk.hi);
      // Lopsided tragic hollow skull sockets
      fg.ellipse(cx - 15, 62, 12, 13, INK);
      fg.ellipse(cx + 15, 58, 10, 11, INK);
      if (pal.isB) {
        fg.ellipse(cx - 15, 63, 6, 7, ac.base);
        fg.ellipse(cx + 15, 59, 5, 6, ac.base);
        fg.ellipse(cx - 15, 62, 3, 4, ac.spec);
        fg.ellipse(cx + 15, 58, 3, 3, ac.spec);
      } else {
        fg.ellipse(cx - 15, 64, 3, 3, gr.light);
        fg.ellipse(cx + 15, 60, 3, 3, gr.light);
      }
      fg.poly([[cx, 66], [cx - 5, 76], [cx + 5, 76]], INK);
      fg.rect(cx - 14, 82, 28, 11, INK);
      for (let t = 0; t < 5; t++) {
        const tx = cx - 12 + t * 5;
        fg.rect(tx, 83, 4, 8 + (t & 1), sk.hi);
        fg.rect(tx, 83, 2, 4, WHITE);
      }
      applyComicShadowHatching(fg, cx + 18, sk.out);
      break;
    }

    case 4: {
      // PLANT — ferocious lunging 3/4 flytrap jaws gaping wide with dripping saliva & thorny collar!
      fg.shadedCapsule(cx - 6, 98, cx - 2, h, 20, sk);
      for (const [lx, ly, dir] of [[cx - 58, 120, -1], [cx + 56, 118, 1], [cx - 44, 144, -1], [cx + 46, 144, 1]] as const) {
        fg.poly([[cx + dir * 10, ly + 8], [lx, ly - 16], [lx + dir * 8, ly + 8], [cx + dir * 14, ly + 22]], sk.base);
        fg.poly([[cx + dir * 12, ly + 8], [lx, ly - 16], [lx + dir * 2, ly]], sk.hi);
        fg.line(cx + dir * 12, ly + 12, lx, ly - 12, sk.dark2, 2);
      }
      // Tilted snarling upper dome & lower hinged jaw
      fg.shadedEllipse(cx + 2, 50, 48, 32, gr, -0.42, -0.52);
      for (const [sx, sy, sr] of [[cx - 26, 34, 6], [cx - 6, 26, 7], [cx + 20, 32, 6], [cx + 32, 46, 5]] as const) {
        fg.ellipse(sx, sy, sr, sr - 1, gr.spec);
        fg.ellipse(sx - 1, sy - 1, Math.max(1, sr - 2), Math.max(1, sr - 3), WHITE);
      }
      fg.ellipse(cx + 4, 80, 44, 25, INK);
      fg.ellipse(cx + 4, 82, 35, 18, gr.out);
      fg.shadedEllipse(cx + 2, 102, 40, 16, gr, -0.3, 0.25);
      // Coiled predatory tongue + white saliva strands
      fg.bezier(cx - 10, 96, cx + 6, 80, cx + 24, 92, gr.light, 9);
      fg.bezier(cx - 8, 94, cx + 6, 80, cx + 22, 90, gr.hi, 3);
      fg.line(cx - 14, 70, cx - 12, 96, WHITE, 1);
      fg.line(cx + 22, 70, cx + 20, 94, WHITE, 1);
      for (let f = 0; f < 6; f++) {
        const fx = cx - 30 + f * 13;
        fg.poly([[fx - 4, 66], [fx + 4, 66], [fx, 84 + (f % 2) * 5]], CREAM);
        fg.line(fx - 2, 68, fx, 82, WHITE, 2);
      }
      for (let f = 0; f < 5; f++) {
        const fx = cx - 24 + f * 13;
        fg.poly([[fx - 4, 98], [fx + 4, 98], [fx, 83 - (f % 2) * 4]], CREAM);
      }
      paintExpressiveEye(fg, cx - 18, 50, 9, 7, pal.eye, ac.base, gr.dark2, 2, 1);
      paintExpressiveEye(fg, cx + 22, 50, 9, 7, pal.eye, ac.base, gr.dark2, -1, -1);
      break;
    }

    case 5: {
      // Y.V. — cocky angled 3D ivory/gold pyramid gun-god with half-lidded cool cyclops eye & Cuban chain!
      const coat = makeRamp(pal.isB ? '#241830' : '#2d263d');
      fg.poly([[cx - 66, h], [cx - 52, 114], [cx - 24, 104], [cx + 26, 104], [cx + 54, 114], [cx + 68, h]], coat.base);
      fg.poly([[cx - 64, h], [cx - 50, 116], [cx - 26, 106], [cx - 12, h]], coat.light);
      fg.poly([[cx - 20, 108], [cx, 146], [cx + 20, 108]], coat.dark2);
      fg.bezier(cx - 34, 110, cx, 148, cx + 34, 110, gr.dark, 9);
      fg.bezier(cx - 34, 110, cx, 148, cx + 34, 110, gr.hi, 5);
      for (let i = -3; i <= 3; i++) {
        fg.ellipse(cx + i * 9, 118 + Math.round(14 - i * i * 1.1), 4, 3, gr.spec);
      }
      fg.ellipse(cx, 138, 12, 12, gr.light);
      fg.ellipse(cx, 138, 9, 9, gr.spec);
      fg.rect(cx - 2, 132, 4, 12, gr.dark2);
      // Dynamic slightly tilted 3D marble pyramid
      fg.poly([[cx + 4, 14], [cx - 52, 112], [cx + 56, 112]], sk.base);
      fg.poly([[cx + 4, 14], [cx - 52, 112], [cx + 8, 112]], sk.hi);
      fg.poly([[cx + 4, 14], [cx - 36, 90], [cx + 4, 84]], sk.spec);
      fg.poly([[cx + 4, 14], [cx + 8, 112], [cx + 56, 112]], sk.dark);
      fg.poly([[cx + 16, 44], [cx + 28, 112], [cx + 56, 112]], sk.dark2);
      fg.poly([[cx + 4, 14], [cx - 8, 36], [cx + 16, 36]], gr.hi);
      fg.poly([[cx + 4, 14], [cx - 8, 36], [cx + 4, 36]], gr.spec);
      fg.rect(cx - 50, 108, 104, 5, gr.light);
      if (pal.isB) {
        fg.poly([[cx - 32, 62], [cx + 38, 62], [cx + 32, 84], [cx - 26, 84]], INK);
        fg.poly([[cx - 28, 65], [cx + 34, 65], [cx + 29, 81], [cx - 23, 81]], pal.eye);
        fg.line(cx - 18, 66, cx - 6, 80, WHITE, 4);
      } else {
        fg.ellipse(cx + 4, 72, 24, 15, INK);
        fg.ellipse(cx + 4, 72, 21, 12, WHITE);
        fg.ellipse(cx + 6, 72, 10, 10, INK);
        fg.ellipse(cx - 2, 68, 4, 3, WHITE);
        fg.poly([[cx - 20, 56], [cx + 28, 59], [cx + 26, 68], [cx - 18, 67]], sk.light);
        fg.line(cx - 20, 67, cx + 27, 68, INK, 3);
      }
      for (const [bx, by] of [[cx - 60, 36], [cx + 62, 28]] as const) {
        fg.rect(bx - 10, by - 5, 20, 10, ac.base);
        fg.rect(bx - 8, by - 3, 16, 6, ac.hi);
        fg.rect(bx - 2, by - 2, 4, 4, ac.dark2);
      }
      break;
    }

    case 6: {
      // STEROIDS — hulking maniacally grinning dual-wielding scientist with crooked taped goggles!
      fg.shadedEllipse(cx, 138, 78, 46, gr, -0.4, -0.5);
      fg.shadedEllipse(cx - 46, 126, 26, 24, sk, -0.45, -0.45);
      fg.shadedEllipse(cx + 48, 126, 26, 24, sk, -0.45, -0.45);
      fg.poly([[cx - 26, 108], [cx + 26, 108], [cx + 18, h], [cx - 18, h]], sk.base);
      fg.shadedEllipse(cx - 12, 136, 14, 12, sk, -0.4, -0.5);
      fg.shadedEllipse(cx + 12, 136, 14, 12, sk, -0.4, -0.5);
      fg.line(cx - 44, 106, cx + 36, h, leather.dark2, 14);
      for (let b = 0; b < 5; b++) {
        const bx = cx - 34 + b * 14;
        const by = 114 + b * 9;
        fg.rect(bx - 3, by - 5, 6, 10, ac.light);
        fg.rect(bx - 2, by - 5, 2, 8, ac.spec);
      }
      fg.rect(cx - 24, 88, 48, 28, sk.dark);
      fg.shadedEllipse(cx, 62, 34, 34, sk, -0.45, -0.5);
      fg.bevelBox(cx - 28, 68, 56, 32, sk, true);
      fg.line(cx - 24, 48, cx - 2, 54, INK, 3);
      fg.line(cx + 24, 50, cx + 4, 54, INK, 3);
      fg.rect(cx - 38, 58, 76, 10, leather.dark2);
      for (const [gx, gy] of [[cx - 16, 64], [cx + 17, 63]] as const) {
        fg.ellipse(gx, gy, 15, 14, metal.dark);
        fg.ellipse(gx, gy, 12, 11, metal.hi);
        fg.ellipse(gx, gy, 10, 9, pal.eye);
        fg.ellipse(gx - 3, gy - 3, 4, 3, WHITE);
      }
      fg.rect(cx - 4, 58, 8, 10, CREAM);
      fg.rect(cx - 16, 84, 34, 11, INK);
      fg.rect(cx - 14, 86, 30, 7, CREAM);
      for (let t = -2; t <= 2; t++) {
        fg.line(cx + t * 5, 86, cx + t * 5, 93, INK, 1);
      }
      applyComicShadowHatching(fg, cx + 22, sk.out);
      break;
    }

    case 7: {
      // ROBOT — battered angled industrial CRT automaton with crooked antenna & glowing phosphor face!
      fg.poly([[cx - 68, h], [cx - 56, 112], [cx + 58, 112], [cx + 70, h]], gr.base);
      fg.bevelBox(cx - 54, 114, 108, 46, sk, true);
      fg.rect(cx - 28, 124, 56, 28, DARK_INK);
      for (let g = 0; g < 5; g++) {
        fg.rect(cx - 22 + g * 10, 128, 6, 20, ac.light);
        fg.rect(cx - 22 + g * 10, 128, 2, 14, WHITE);
      }
      fg.rect(cx - 16, 98, 10, 18, metal.base);
      fg.rect(cx + 6, 98, 10, 18, metal.dark);
      fg.line(cx + 22, 34, cx + 32, 10, metal.light, 4);
      fg.ellipse(cx + 33, 10, 6, 6, ac.light);
      fg.ellipse(cx + 31, 8, 2, 2, WHITE);
      fg.bevelBox(cx - 44, 32, 88, 70, sk, true);
      fg.crack(cx - 34, 34, 12, 0.8, 7, INK, sk.spec);
      fg.bevelBox(cx - 52, 54, 10, 26, metal, true);
      fg.bevelBox(cx + 42, 54, 10, 26, makeRamp(metal.dark), true);
      fg.rect(cx - 34, 44, 68, 42, INK);
      fg.rect(cx - 30, 48, 60, 34, DARK_INK);
      fg.rect(cx - 22, 56, 16, 13, pal.eye);
      fg.rect(cx + 8, 56, 16, 13, pal.eye);
      fg.rect(cx - 20, 58, 10, 4, WHITE);
      fg.rect(cx + 10, 58, 10, 4, WHITE);
      for (let sy = 49; sy < 81; sy += 3) {
        fg.rect(cx - 30, sy, 60, 1, INK);
      }
      break;
    }

    case 8: {
      // CHICKEN — fierce kung-fu rooster in dramatic 3/4 profile with blazing comb, trailing crimson headband & katana!
      fg.line(cx + 18, 96, cx + 68, 22, metal.dark2, 12);
      fg.line(cx + 20, 94, cx + 66, 24, gr.base, 8);
      for (let d = 0; d < 5; d++) {
        fg.ellipse(cx + 28 + d * 8, 82 - d * 12, 3, 2, WHITE);
      }
      fg.line(cx + 14, 92, cx + 32, 104, ac.hi, 5);
      fg.shadedEllipse(cx, 140, 56, 40, sk, -0.4, -0.45);
      fg.poly([[cx - 46, 122], [cx, 146], [cx + 46, 122], [cx + 38, h], [cx - 38, h]], gr.dark);
      fg.poly([[cx - 42, 124], [cx, 144], [cx - 10, h], [cx - 36, h]], gr.light);
      for (let f = -3; f <= 3; f++) {
        const fx = cx + f * 11;
        fg.poly([[fx - 8, 96], [fx + 8, 96], [fx, 124 + (f & 1) * 5]], f < 1 ? sk.hi : sk.dark);
      }
      fg.poly([[cx - 20, 42], [cx - 24, 14], [cx - 8, 28], [cx, 10], [cx + 10, 26], [cx + 24, 14], [cx + 22, 44]], gr.base);
      fg.poly([[cx - 18, 40], [cx - 22, 16], [cx - 8, 30], [cx, 12], [cx + 6, 36]], gr.hi);
      fg.shadedEllipse(cx - 2, 66, 34, 32, sk, -0.45, -0.5);
      fg.poly([[cx - 36, 48], [cx + 34, 46], [cx + 34, 60], [cx - 36, 62]], gr.base);
      fg.rect(cx - 34, 50, 66, 4, gr.hi);
      fg.poly([[cx + 30, 50], [cx + 72, 36], [cx + 78, 48], [cx + 32, 58]], gr.base);
      fg.poly([[cx + 30, 54], [cx + 70, 66], [cx + 62, 76], [cx + 28, 60]], gr.dark);
      fg.poly([[cx - 14, 66], [cx - 50, 76], [cx - 32, 86], [cx - 12, 84]], ac.light);
      fg.poly([[cx - 14, 66], [cx - 48, 76], [cx - 14, 75]], ac.spec);
      fg.poly([[cx - 30, 84], [cx - 14, 82], [cx - 14, 92], [cx - 26, 90]], ac.dark);
      fg.shadedEllipse(cx - 18, 96, 8, 10, gr, -0.4, -0.3);
      paintExpressiveEye(fg, cx - 10, 64, 9, 7, pal.isB ? ac.hi : WHITE, gr.light, gr.dark, -2, -1);
      break;
    }

    case 9: {
      // REBEL — shadowed desert guerrilla beneath ragged peaked hood with piercing glowing eyes!
      fg.poly([[cx - 72, h], [cx - 58, 106], [cx - 22, 92], [cx + 22, 92], [cx + 58, 106], [cx + 72, h]], gr.base);
      fg.poly([[cx - 70, h], [cx - 56, 108], [cx - 22, 94], [cx - 10, h]], gr.light);
      fg.poly([[cx + 14, 98], [cx + 56, 108], [cx + 70, h], [cx + 20, h]], gr.dark2);
      fg.line(cx - 50, 114, cx + 50, 114, ac.base, 6);
      fg.line(cx - 48, 112, cx + 48, 112, ac.hi, 2);
      fg.poly([[cx - 2, 12], [cx + 38, 28], [cx + 48, 72], [cx + 42, 106], [cx - 42, 106], [cx - 48, 72], [cx - 38, 28]], gr.base);
      fg.poly([[cx - 2, 14], [cx - 36, 30], [cx - 46, 72], [cx - 26, 62], [cx - 10, 26]], gr.hi);
      fg.poly([[cx + 12, 24], [cx + 38, 30], [cx + 46, 72], [cx + 38, 104], [cx + 22, 94]], gr.dark2);
      fg.ellipse(cx, 66, 32, 34, INK);
      fg.ellipse(cx, 68, 26, 28, DARK_INK);
      fg.poly([[cx - 34, 78], [cx + 34, 78], [cx + 38, 112], [cx - 38, 112]], sk.base);
      fg.poly([[cx - 32, 80], [cx + 26, 78], [cx + 18, 94], [cx - 34, 96]], sk.hi);
      fg.line(cx - 32, 88, cx + 32, 84, sk.dark2, 3);
      fg.line(cx - 34, 98, cx + 34, 94, sk.dark2, 3);
      fg.poly([[cx - 22, 60], [cx - 5, 64], [cx - 7, 71], [cx - 20, 68]], pal.eye);
      fg.poly([[cx + 22, 60], [cx + 7, 64], [cx + 9, 71], [cx + 20, 68]], pal.eye);
      fg.rect(cx - 18, 63, 6, 3, WHITE);
      fg.rect(cx + 12, 63, 6, 3, WHITE);
      break;
    }

    case 10: {
      // HORROR — snarling radioactive rad-beast erupting with emerald flame spikes & orbiting rad orbs!
      fg.shadedEllipse(cx, 128, 56, 46, gr, -0.35, -0.45);
      fg.shadedEllipse(cx, 124, 44, 34, sk, -0.35, -0.45);
      for (const [sx, sy, tx, ty] of [[cx - 42, 92, cx - 64, 58], [cx - 28, 56, cx - 44, 22], [cx, 44, cx - 4, 10], [cx + 26, 54, cx + 48, 22], [cx + 42, 90, cx + 68, 62]] as const) {
        fg.poly([[sx - 10, sy], [tx, ty], [sx + 10, sy]], sk.light);
        fg.poly([[sx - 6, sy], [tx, ty], [sx + 2, sy]], sk.spec);
      }
      fg.shadedEllipse(cx, 72, 42, 34, sk, -0.4, -0.45);
      fg.ellipse(cx, 122, 22, 18, ac.hi);
      fg.ellipse(cx, 122, 13, 10, WHITE);
      fg.poly([[cx - 32, 76], [cx + 34, 76], [cx + 24, 102], [cx - 24, 102]], INK);
      fg.poly([[cx - 24, 82], [cx + 26, 82], [cx + 16, 96], [cx - 16, 96]], ac.light);
      fg.ellipse(cx, 88, 12, 6, WHITE);
      for (let f = 0; f < 5; f++) {
        const fx = cx - 22 + f * 11;
        fg.poly([[fx - 4, 74], [fx + 4, 74], [fx, 86]], sk.spec);
        fg.poly([[fx - 3, 102], [fx + 3, 102], [fx, 92]], sk.hi);
      }
      fg.poly([[cx - 26, 56], [cx - 7, 62], [cx - 11, 70], [cx - 24, 65]], WHITE);
      fg.poly([[cx + 28, 56], [cx + 9, 62], [cx + 13, 70], [cx + 26, 65]], WHITE);
      for (const [ox2, oy2, r] of [[cx - 64, 34, 7], [cx + 66, 38, 6], [cx - 68, 108, 6], [cx + 70, 104, 7]] as const) {
        fg.ellipse(ox2, oy2, r, r, sk.hi);
        fg.ellipse(ox2 - 2, oy2 - 2, Math.max(2, r - 3), Math.max(2, r - 3), WHITE);
      }
      break;
    }

    default: {
      // ROGUE — defiant ex-IDPD tactical fugitive with wind-swept bangs, cyan blast-plate & comms visor!
      const hair = makeRamp(pal.isB ? '#d8e0ec' : '#3a2224');
      fg.poly([[cx - 68, h], [cx - 56, 108], [cx - 24, 96], [cx + 24, 96], [cx + 56, 108], [cx + 68, h]], gr.base);
      fg.poly([[cx - 66, h], [cx - 54, 110], [cx - 24, 98], [cx - 16, h]], gr.hi);
      fg.poly([[cx + 18, 100], [cx + 54, 110], [cx + 66, h], [cx + 20, h]], gr.dark2);
      fg.bevelBox(cx - 26, 118, 52, 24, metal, true);
      fg.rect(cx - 18, 124, 36, 5, pal.eye);
      fg.rect(cx - 16, 124, 24, 2, WHITE);
      fg.rect(cx - 14, 133, 28, 4, ac.light);
      fg.poly([[cx - 32, 92], [cx + 32, 92], [cx + 26, 114], [cx - 26, 114]], gr.dark);
      fg.rect(cx - 14, 90, 28, 20, sk.dark);
      fg.shadedEllipse(cx, 62, 40, 38, hair, -0.4, -0.4);
      fg.shadedEllipse(cx, 68, 28, 30, sk, -0.45, -0.45);
      fg.poly([[cx - 24, 74], [cx + 24, 74], [cx + 14, 96], [cx, 100], [cx - 14, 96]], sk.base);
      fg.poly([[cx - 22, 74], [cx, 74], [cx, 98], [cx - 12, 94]], sk.light);
      fg.poly([[cx - 34, 54], [cx - 18, 24], [cx + 24, 24], [cx + 38, 52], [cx + 26, 62], [cx + 8, 44], [cx - 14, 52], [cx - 26, 68]], hair.base);
      fg.poly([[cx - 28, 48], [cx - 14, 28], [cx + 12, 28], [cx + 4, 42], [cx - 18, 48]], hair.hi);
      fg.bevelBox(cx + 24, 62, 10, 18, metal, true);
      fg.rect(cx + 27, 66, 4, 10, pal.eye);
      paintExpressiveEye(fg, cx - 12, 68, 7, 5, WHITE, pal.eye, hair.dark2, 1, 1);
      paintExpressiveEye(fg, cx + 11, 68, 7, 5, WHITE, pal.eye, hair.dark2, 0, -1);
      fg.line(cx - 8, 86, cx + 10, 83, INK, 2);
      break;
    }
  }

  fg.rimLight(pal.rim, false);
  fg.outline(INK, DARK_INK);
  compositeLayer(p, fg);

  // Gritty stark black ink frame edge (classic Nuclear Throne — ZERO sci-fi corner rivets!)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) p.set(x, y, INK);
    }
  }

  p.flush(ctx, ox, oy);
}

/**
 * Renders expressive, tight, asymmetric Nuclear Throne Roster Face Cards (32x48 -> logical 16x24).
 * ZERO generic chess-pawn trapezoids — every mutant fills the frame with an unmistakable close-up face!
 */
export function drawCharSelectCardHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const mutantIdx = frame >= 1 && frame <= 12 ? frame - 1 : 0;
  const pal = BUST_PALETTES_24[mutantIdx * 2]!;
  const p = new PxCanvas(w, h);
  const sk = makeRamp(pal.skin);
  const gr = makeRamp(pal.gear);
  const ac = makeRamp(pal.accent);

  const cx = Math.floor(w * 0.5);
  paintPortraitBackdrop(p, w, h, pal.bgDeep, pal.bgMid, pal.bgGlow, pal.rim, cx, 22, frame + 11);

  const fg = new PxCanvas(w, h);

  if (frame === 0 || frame > 12) {
    fg.bevelBox(6, 8, 20, 32, gr, true);
    fg.rect(12, 14, 8, 3, WHITE);
    fg.rect(17, 17, 3, 6, WHITE);
    fg.rect(14, 22, 5, 3, WHITE);
    fg.rect(14, 25, 3, 4, WHITE);
    fg.rect(14, 32, 3, 3, WHITE);
  } else {
    switch (mutantIdx) {
      case 0: // Fish — bold tight close-up grinning fish face with spiky crest & collar!
        fg.poly([[cx - 9, 14], [cx - 4, 4], [cx + 2, 13], [cx + 7, 6], [cx + 10, 15]], sk.hi);
        fg.shadedEllipse(cx, 25, 13, 13, sk, -0.45, -0.5);
        fg.poly([[2, 46], [5, 34], [27, 34], [30, 46]], gr.base);
        fg.poly([[6, 36], [14, 46], [2, 46]], gr.hi);
        fg.rect(cx - 10, 20, 7, 6, INK);
        fg.rect(cx + 3, 20, 7, 6, INK);
        fg.rect(cx - 9, 21, 5, 4, pal.eye);
        fg.rect(cx + 4, 21, 5, 4, pal.eye);
        fg.rect(cx - 6, 22, 2, 2, INK);
        fg.rect(cx + 6, 22, 2, 2, INK);
        fg.line(cx - 8, 31, cx + 9, 29, INK, 3);
        fg.rect(cx - 5, 29, 2, 2, WHITE);
        fg.rect(cx + 5, 28, 2, 2, WHITE);
        break;
      case 1: // Crystal — towering jagged amethyst prism filling entire card!
        fg.poly([[cx - 13, 46], [cx - 15, 20], [cx - 10, 12], [cx - 6, 24]], sk.light);
        fg.poly([[cx + 13, 46], [cx + 15, 18], [cx + 10, 12], [cx + 6, 24]], sk.dark2);
        fg.poly([[cx, 4], [cx + 12, 22], [cx + 9, 46], [cx - 9, 46], [cx - 12, 22]], sk.base);
        fg.poly([[cx, 4], [cx - 12, 22], [cx, 28]], sk.spec);
        fg.poly([[cx - 9, 22], [cx - 2, 24], [cx - 3, 28], [cx - 8, 26]], WHITE);
        fg.poly([[cx + 9, 22], [cx + 2, 24], [cx + 3, 28], [cx + 8, 26]], WHITE);
        break;
      case 2: // Eyes — giant haunting psychic face covered in staring bright eyes!
        fg.shadedEllipse(cx, 24, 13, 17, sk, -0.45, -0.5);
        fg.rect(cx - 10, 38, 20, 10, gr.dark);
        for (const [ex, ey, er] of [[cx - 6, 23, 5], [cx + 6, 22, 5], [cx, 13, 4], [cx - 4, 33, 3], [cx + 5, 32, 3]] as const) {
          fg.ellipse(ex, ey, er, er, WHITE);
          fg.rect(ex - 1, ey - 1, 2, 2, INK);
        }
        break;
      case 3: // Melting — gaunt cracked melting skull close-up with dark hollow sockets & drips!
        fg.poly([[2, 46], [6, 36], [26, 36], [30, 46]], gr.dark);
        fg.shadedEllipse(cx, 20, 12, 12, sk, -0.45, -0.5);
        fg.rect(cx - 12, 24, 5, 15, sk.dark);
        fg.rect(cx + 8, 25, 4, 12, sk.dark2);
        fg.rect(cx - 8, 28, 16, 11, sk.base);
        fg.rect(cx - 9, 17, 6, 7, INK);
        fg.rect(cx + 3, 17, 6, 7, INK);
        fg.rect(cx - 6, 32, 12, 5, INK);
        for (let t = -5; t <= 4; t += 3) fg.rect(cx + t, 33, 2, 3, WHITE);
        break;
      case 4: // Plant — massive ferocious fanged crimson flytrap head filling card!
        fg.poly([[4, 46], [10, 34], [22, 34], [28, 46]], sk.base);
        fg.poly([[2, 38], [10, 34], [8, 44]], sk.hi);
        fg.poly([[30, 38], [22, 34], [24, 44]], sk.hi);
        fg.shadedEllipse(cx, 22, 14, 14, gr, -0.45, -0.5);
        fg.rect(cx - 11, 20, 22, 11, INK);
        for (let t = -9; t <= 8; t += 4) {
          fg.poly([[cx + t, 20], [cx + t + 3, 20], [cx + t + 1, 26]], WHITE);
          fg.poly([[cx + t + 1, 31], [cx + t + 4, 31], [cx + t + 2, 26]], WHITE);
        }
        fg.rect(cx - 8, 13, 4, 4, pal.eye);
        fg.rect(cx + 4, 13, 4, 4, pal.eye);
        break;
      case 5: // Y.V. — razor-sharp giant 3D ivory pyramid + giant cyclops eye & gold chain!
        fg.poly([[cx, 4], [cx - 15, 38], [cx + 15, 38]], sk.light);
        fg.poly([[cx, 4], [cx - 15, 38], [cx + 2, 38]], sk.spec);
        fg.poly([[cx, 4], [cx + 2, 38], [cx + 15, 38]], sk.dark);
        fg.poly([[cx, 4], [cx - 4, 12], [cx + 4, 12]], gr.hi);
        fg.ellipse(cx, 25, 8, 5, INK);
        fg.ellipse(cx, 25, 6, 4, WHITE);
        fg.rect(cx - 2, 23, 4, 4, INK);
        fg.rect(cx - 12, 39, 24, 7, gr.hi);
        break;
      case 6: // Steroids — massive grinning scientist head + huge bright round goggles!
        fg.poly([[1, 46], [4, 34], [28, 34], [31, 46]], gr.hi);
        fg.shadedEllipse(cx, 23, 12, 14, sk, -0.45, -0.5);
        fg.ellipse(cx - 6, 21, 6, 6, pal.eye);
        fg.ellipse(cx + 6, 21, 6, 6, pal.eye);
        fg.rect(cx - 8, 19, 2, 2, WHITE);
        fg.rect(cx + 4, 19, 2, 2, WHITE);
        fg.rect(cx - 1, 18, 2, 5, WHITE);
        fg.rect(cx - 8, 29, 16, 5, WHITE);
        break;
      case 7: // Robot — bold chunky steel CRT monitor head + antenna + blazing green screen!
        fg.line(cx + 6, 12, cx + 10, 3, ac.hi, 2);
        fg.bevelBox(3, 11, 26, 26, sk, true);
        fg.rect(6, 15, 20, 15, INK);
        fg.rect(8, 18, 6, 7, pal.eye);
        fg.rect(18, 18, 6, 7, pal.eye);
        fg.rect(9, 19, 3, 2, WHITE);
        fg.rect(19, 19, 3, 2, WHITE);
        fg.bevelBox(6, 37, 20, 9, gr, false);
        break;
      case 8: // Chicken — fierce side-profile martial arts rooster + towering comb & hooked beak!
        fg.poly([[cx - 6, 14], [cx - 8, 4], [cx, 10], [cx + 5, 4], [cx + 8, 14]], gr.hi);
        fg.shadedEllipse(cx + 1, 25, 11, 13, sk, -0.45, -0.5);
        fg.rect(cx - 10, 16, 22, 5, gr.base);
        fg.poly([[cx - 2, 22], [cx - 15, 27], [cx - 2, 31]], ac.hi);
        fg.rect(cx - 3, 21, 4, 4, INK);
        fg.set(cx - 2, 22, WHITE);
        fg.poly([[4, 46], [8, 36], [24, 36], [28, 46]], gr.dark);
        break;
      case 9: // Rebel — deep peaked desert hood + pitch-black face + piercing golden eyes!
        fg.poly([[cx, 4], [cx + 14, 18], [cx + 13, 46], [cx - 13, 46], [cx - 14, 18]], gr.base);
        fg.poly([[cx, 4], [cx - 14, 18], [cx - 4, 34]], gr.hi);
        fg.ellipse(cx, 23, 10, 11, INK);
        fg.rect(cx - 11, 29, 22, 10, sk.light);
        fg.rect(cx - 7, 21, 5, 4, pal.eye);
        fg.rect(cx + 2, 21, 5, 4, pal.eye);
        break;
      case 10: // Horror — wild spiked radioactive beast head roaring wide!
        fg.poly([[cx - 10, 15], [cx - 14, 4], [cx - 3, 13]], sk.hi);
        fg.poly([[cx + 10, 15], [cx + 14, 4], [cx + 3, 13]], sk.hi);
        fg.shadedEllipse(cx, 25, 13, 14, sk, -0.45, -0.5);
        fg.rect(cx - 9, 19, 6, 4, WHITE);
        fg.rect(cx + 3, 19, 6, 4, WHITE);
        fg.rect(cx - 8, 27, 16, 8, INK);
        fg.rect(cx - 6, 29, 12, 4, ac.hi);
        break;
      default: // Rogue — bold tactical blue armored collar + wind-swept bangs + fierce cyan gaze!
        fg.poly([[2, 46], [5, 34], [27, 34], [30, 46]], gr.base);
        fg.rect(cx - 8, 39, 16, 4, pal.eye);
        fg.shadedEllipse(cx, 23, 11, 13, sk, -0.45, -0.5);
        fg.poly([[cx - 12, 20], [cx - 8, 6], [cx + 9, 6], [cx + 13, 20], [cx + 4, 14], [cx - 6, 16]], makeRamp('#3a2224').base);
        fg.rect(cx - 7, 21, 5, 4, WHITE);
        fg.rect(cx + 2, 21, 5, 4, WHITE);
        fg.rect(cx - 5, 22, 2, 2, pal.eye);
        fg.rect(cx + 4, 22, 2, 2, pal.eye);
        break;
    }
  }

  fg.rimLight(pal.rim, true);
  fg.outline(INK);
  compositeLayer(p, fg);

  for (let x = 0; x < w; x++) {
    p.set(x, 0, INK);
    p.set(x, h - 1, INK);
  }
  for (let y = 0; y < h; y++) {
    p.set(0, y, INK);
    p.set(w - 1, y, INK);
  }

  p.flush(ctx, ox, oy);
}

/**
 * 5 CUSTOM CLOSE-UP BOSS INTRO BUST PORTRAITS (160x140 Hi-Bit -> logical 80x70, drawn at 2x = 160x140!).
 * Frame 0 = Big Bandit, 1 = Big Dog, 2 = Lil' Hunter, 3 = The Krunked Throne, 4 = Throne II.
 */
export function drawBossIntroPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const fg = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.5);
  const cy = Math.floor(h * 0.52);

  switch (frame % 5) {
    case 0: {
      // BIG BANDIT — Dramatic menacing outlaw warlord close-up under giant wide-brimmed ranger hat!
      const coat = makeRamp('#bd7a34', '#170c08');
      const leather = makeRamp('#5e3620', '#120808');
      const scarf = makeRamp('#de242e', '#260508');
      const hat = makeRamp('#73421c', '#170c08');
      const steel = makeRamp('#748396', '#10141c');
      const gold = makeRamp('#f7cf47', '#3b2408');

      // Massive broad outlaw poncho shoulders + tattered crimson cape
      fg.poly([[cx - 72, h], [cx - 60, 82], [cx + 58, 82], [cx + 72, h]], coat);
      fg.poly([[cx - 68, h], [cx - 56, 84], [cx - 10, 88], [cx - 16, h]], coat.light);
      // Heavy crossing brass bullet bandoliers across chest
      fg.line(cx - 54, 86, cx + 38, h, leather.dark2, 16);
      for (let b = 0; b < 6; b++) {
        const bx = cx - 44 + b * 14;
        const by = 92 + b * 8;
        fg.rect(bx, by, 7, 11, gold.light);
        fg.rect(bx, by, 3, 7, gold.spec);
        fg.rect(bx, by + 7, 7, 4, '#a85a14');
      }
      // Billowing crimson scarf wrapped tight across lower face + flying left tail!
      fg.poly([[cx - 42, 68], [cx - 76, 80], [cx - 72, 106], [cx - 34, 88]], scarf);
      fg.poly([[cx - 46, 62], [cx + 46, 62], [cx + 42, 92], [cx, 100], [cx - 42, 92]], scarf);
      fg.line(cx - 40, 72, cx + 40, 70, scarf.hi, 3);
      fg.line(cx - 36, 84, cx + 36, 82, scarf.dark2, 3);
      // Deep ink-shadowed masked outlaw face + blazing fierce crimson goggles!
      fg.shadedEllipse(cx, 52, 34, 24, makeRamp('#1e1518', '#080509'), -0.3, -0.4);
      fg.poly([[cx - 28, 44], [cx - 6, 49], [cx - 9, 60], [cx - 26, 56]], '#ff2430');
      fg.poly([[cx + 28, 44], [cx + 6, 49], [cx + 9, 60], [cx + 26, 56]], '#ff2430');
      fg.rect(cx - 23, 47, 8, 4, '#fff2b8');
      fg.rect(cx + 15, 47, 8, 4, '#fff2b8');
      // Towering battered wide-brimmed wasteland ranger Stetson casting fierce shadow!
      fg.poly([[cx - 74, 42], [cx - 44, 30], [cx + 44, 30], [cx + 74, 42], [cx + 62, 50], [cx - 62, 50]], hat);
      fg.poly([[cx - 40, 34], [cx - 30, 8], [cx, 14], [cx + 30, 8], [cx + 40, 34]], hat);
      fg.rect(cx - 38, 28, 76, 7, scarf.base);
      fg.line(cx - 64, 42, cx + 64, 42, hat.hi, 3);
      // Heavy rusted assault cannon barrel thrust forward on right!
      fg.bevelBox(cx + 16, 94, 56, 20, steel, true);
      fg.rect(cx + 24, 98, 44, 4, steel.spec);
      fg.ellipse(cx + 70, 104, 5, 9, INK);
      fg.rimLight('#ffe073', true);
      break;
    }

    case 1: {
      // BIG DOG — Towering armored scrapyard spider-tank mech head with blazing red optical sensor & twin miniguns!
      const hull = makeRamp('#8f6952', '#140c0a');
      const rust = makeRamp('#b34d26', '#240b06');
      const steel = makeRamp('#647282', '#10141c');
      const gold = makeRamp('#f2c038', '#362208');

      // Exhaust stacks billowing flames behind armored carapace
      fg.bevelBox(cx - 56, 16, 16, 44, steel, true);
      fg.bevelBox(cx + 40, 16, 16, 44, steel, true);
      fg.poly([[cx - 54, 16], [cx - 48, 4], [cx - 42, 16]], '#ff7824');
      fg.poly([[cx + 42, 16], [cx + 48, 4], [cx + 54, 16]], '#ff7824');
      // Heavy riveted spider-tank domed hull
      fg.shadedEllipse(cx, cy + 8, 62, 48, hull, -0.4, -0.5);
      fg.bevelBox(cx - 54, cy - 26, 108, 34, rust, true);
      // Hazard stripes across heavy front brow plate
      for (let i = -2; i <= 2; i++) {
        fg.poly([[cx + i * 18 - 6, cy - 22], [cx + i * 18 + 2, cy - 22], [cx + i * 18 - 4, cy - 10], [cx + i * 18 - 12, cy - 10]], gold.light);
      }
      // Massive blazing red cyclops targeting cannon eye!
      fg.ellipse(cx, cy + 8, 22, 18, INK);
      fg.ellipse(cx, cy + 8, 17, 14, '#8c121e');
      fg.ellipse(cx, cy + 8, 12, 10, '#ff2e38');
      fg.ellipse(cx - 3, cy + 5, 5, 4, '#fff4a6');
      // Twin flanking rotary minigun barrels + steel jaw teeth!
      fg.bevelBox(cx - 72, cy + 16, 28, 28, steel, true);
      fg.bevelBox(cx + 44, cy + 16, 28, 28, steel, true);
      for (const bx of [cx - 66, cx - 56, cx + 50, cx + 60]) {
        fg.ellipse(bx, cy + 30, 4, 4, INK);
      }
      fg.bevelBox(cx - 34, cy + 32, 68, 18, steel, true);
      for (let t = -3; t <= 3; t++) {
        fg.rect(cx + t * 9 - 2, cy + 36, 5, 10, INK);
      }
      fg.rimLight('#ffae52', true);
      break;
    }

    case 2: {
      // LIL' HUNTER — Maniacal close-up of the jetpack IDPD captain with cracked cobalt helmet & blazing cyan visor!
      const armor = makeRamp('#2d62c9', '#0a1530');
      const steel = makeRamp('#8d9eb5', '#111624');
      const trim = makeRamp('#f2c849', '#382508');

      // Roaring dorsal jetpack thrusters & blazing plasma exhaust plumes!
      fg.bevelBox(cx - 66, 36, 24, 56, steel, true);
      fg.bevelBox(cx + 42, 36, 24, 56, steel, true);
      fg.poly([[cx - 64, 92], [cx - 44, 92], [cx - 54, 134]], '#ff661a');
      fg.poly([[cx - 60, 92], [cx - 48, 92], [cx - 54, 118]], '#fff7a6');
      fg.poly([[cx + 44, 92], [cx + 64, 92], [cx + 54, 134]], '#ff661a');
      fg.poly([[cx + 48, 92], [cx + 60, 92], [cx + 54, 118]], '#fff7a6');
      // Armored captain torso + golden IDPD epaulettes
      fg.poly([[cx - 50, h], [cx - 42, 82], [cx + 42, 82], [cx + 50, h]], armor);
      fg.bevelBox(cx - 44, 82, 88, 12, trim, true);
      // Aerodynamic sloped IDPD tactical helmet + crest + antennae
      fg.line(cx - 34, 34, cx - 42, 8, steel.hi, 4);
      fg.poly([[cx - 32, 16], [cx + 32, 16], [cx + 44, 78], [cx - 44, 78]], armor);
      fg.poly([[cx - 28, 18], [cx, 18], [cx - 4, 74], [cx - 38, 74]], armor.light);
      fg.rect(cx - 6, 12, 12, 24, WHITE);
      // Huge menacing glowing cyan visor with fiery reflection & battle crack!
      fg.poly([[cx - 34, 40], [cx + 34, 40], [cx + 28, 66], [cx - 28, 66]], INK);
      fg.poly([[cx - 29, 44], [cx + 29, 44], [cx + 24, 62], [cx - 24, 62]], '#47e8ff');
      fg.line(cx - 22, 46, cx - 6, 60, WHITE, 5);
      fg.line(cx - 10, 46, cx + 6, 60, '#ffae38', 3);
      fg.crack(cx + 10, 42, 20, 1.3, 5, INK, WHITE);
      fg.rimLight('#85ebff', true);
      break;
    }

    case 3: {
      // THE KRUNKED THRONE — Towering gothic obsidian nuclear monolith with glowing emerald reactor eye & golden spires!
      const obs = makeRamp('#344061', '#080a14');
      const gold = makeRamp('#ebb942', '#2b1b06');
      const rad = makeRamp('#4ef56b', '#07240e');

      // Flanking glowing nuclear coolant cylinders
      for (const side of [-1, 1]) {
        const tx = side < 0 ? cx - 72 : cx + 44;
        fg.bevelBox(tx, 34, 28, 92, makeRamp('#445270', '#0a0d17'), true);
        fg.rect(tx + 6, 44, 16, 72, rad.base);
        fg.rect(tx + 9, 44, 6, 68, WHITE);
        fg.bevelBox(tx + 2, 58, 24, 7, gold, false);
        fg.bevelBox(tx + 2, 92, 24, 7, gold, false);
      }
      // Monumental gothic carved throne monolith & golden spires
      fg.poly([[cx - 48, 22], [cx + 48, 22], [cx + 56, h], [cx - 56, h]], obs);
      fg.poly([[cx - 42, 24], [cx - 32, 4], [cx - 22, 24]], obs.hi);
      fg.poly([[cx + 22, 24], [cx + 32, 4], [cx + 42, 24]], obs.hi);
      fg.poly([[cx - 18, 24], [cx, 2], [cx + 18, 24]], gold);
      fg.poly([[cx, 12], [cx + 8, 22], [cx, 32], [cx - 8, 22]], rad.hi);
      // Giant blazing emerald nuclear reactor eye core!
      fg.bevelBox(cx - 34, 42, 68, 68, makeRamp('#131724', '#060810'), true);
      fg.shadedEllipse(cx, 76, 26, 26, makeRamp(rad.dark2, '#061a0a'));
      fg.shadedEllipse(cx, 76, 19, 19, rad);
      fg.ellipse(cx, 76, 10, 10, WHITE);
      fg.crack(cx - 38, 36, 18, 0.9, 11, INK, obs.hi);
      fg.crack(cx + 36, 40, 16, 2.2, 17, INK, obs.hi);
      fg.rimLight('#78ff96', true);
      break;
    }

    default: {
      // THRONE II — Cosmic mutated winged nuclear leviathan erupting with emerald & violet portal fire!
      const hull = makeRamp('#324457', '#080c14');
      const rad = makeRamp('#54ff75', '#0a2e12');
      const portal = makeRamp('#b852ff', '#210a38');

      // Sweeping razor-jagged obsidian & plasma wings
      for (const side of [-1, 1]) {
        fg.poly([[cx + side * 14, 46], [cx + side * 76, 12], [cx + side * 68, 56], [cx + side * 16, 68]], hull);
        fg.line(cx + side * 20, 52, cx + side * 70, 26, rad.hi, 6);
        fg.line(cx + side * 22, 52, cx + side * 68, 26, WHITE, 2);
        fg.poly([[cx + side * 16, 70], [cx + side * 66, 64], [cx + side * 54, 102], [cx + side * 14, 92]], makeRamp(hull.dark, hull.out));
        fg.line(cx + side * 20, 80, cx + side * 56, 84, portal.hi, 5);
      }
      // Armored levitating reactor core chassis + tri-eye glowing nuclear core!
      fg.poly([[cx, 18], [cx + 32, 52], [cx + 24, 116], [cx, 132], [cx - 24, 116], [cx - 32, 52]], hull);
      fg.shadedEllipse(cx, 72, 22, 26, portal);
      fg.shadedEllipse(cx, 72, 15, 18, rad);
      fg.ellipse(cx, 72, 8, 10, WHITE);
      fg.ellipse(cx - 12, 46, 5, 5, rad.hi);
      fg.ellipse(cx + 12, 46, 5, 5, rad.hi);
      fg.rimLight('#e39cff', true);
      break;
    }
  }

  fg.outline(INK);
  fg.flush(ctx, ox, oy);
}
