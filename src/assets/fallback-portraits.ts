import type { DrawCtx } from './fallback-fonts';
import { PxCanvas } from './pixel-art';

// ============================================================================
// CRISP NATIVE 1x COMIC-STYLE NUCLEAR THRONE PORTRAITS (96x80),
// ROSTER FACE CARDS (16x24), AND 5 BOSS INTRO PORTRAITS (80x70).
// Bold #0d0a10 comic ink outlines, vibrant cel-shaded color blocks, transparent
// bust silhouettes so Pause (21_paused.png) & Campfire look badass!
// ============================================================================

const INK = '#0d0a10';
const WHITE = '#ffffff';
const CREAM = '#f6eedc';

interface BustPalette {
  bgDeep: string;
  bgMid: string;
  skin: string;
  skinHi: string;
  skinDark: string;
  gear: string;
  gearHi: string;
  gearDark: string;
  eye: string;
  accent: string;
  isB: boolean;
}

const BUST_PALETTES_24: readonly BustPalette[] = [
  // 0: Fish A, 1: Fish B
  { bgDeep: '#122820', bgMid: '#245440', skin: '#4eb870', skinHi: '#84e8a0', skinDark: '#2a7846', gear: '#8c5834', gearHi: '#ba8254', gearDark: '#54321a', eye: '#fff266', accent: '#f5cc38', isB: false },
  { bgDeep: '#240c14', bgMid: '#541c2c', skin: '#34945a', skinHi: '#68c88a', skinDark: '#1c5a34', gear: '#dc2838', gearHi: '#ff6874', gearDark: '#881420', eye: '#ffe852', accent: '#f5cc38', isB: true },
  // 2: Crystal A, 3: Crystal B
  { bgDeep: '#1c0c2c', bgMid: '#481e6c', skin: '#e058c8', skinHi: '#ffa4f0', skinDark: '#922482', gear: '#f484e4', gearHi: '#ffe0fc', gearDark: '#6c1860', eye: '#ffffff', accent: '#78f0ff', isB: false },
  { bgDeep: '#261808', bgMid: '#5e3c12', skin: '#f0b028', skinHi: '#ffe878', skinDark: '#a66e10', gear: '#ffdc58', gearHi: '#fff8c8', gearDark: '#7c4c08', eye: '#70f4ff', accent: '#ffffff', isB: true },
  // 4: Eyes A, 5: Eyes B
  { bgDeep: '#101a34', bgMid: '#263e78', skin: '#7888a8', skinHi: '#aab8d8', skinDark: '#485674', gear: '#3c4868', gearHi: '#64769c', gearDark: '#22283c', eye: '#ffffff', accent: '#80e8ff', isB: false },
  { bgDeep: '#200a24', bgMid: '#501c58', skin: '#7c4494', skinHi: '#b078cc', skinDark: '#4a205c', gear: '#b82854', gearHi: '#ec608a', gearDark: '#6c1430', eye: '#ffe848', accent: '#ff5c9c', isB: true },
  // 6: Melting A, 7: Melting B
  { bgDeep: '#1e1216', bgMid: '#482830', skin: '#dcc8b4', skinHi: '#f8f0e4', skinDark: '#9c8672', gear: '#c0303a', gearHi: '#ec646e', gearDark: '#741620', eye: '#140e16', accent: '#e03c48', isB: false },
  { bgDeep: '#220a0a', bgMid: '#5a1e16', skin: '#5a5064', skinHi: '#8a7e98', skinDark: '#302838', gear: '#dc3824', gearHi: '#ff7c48', gearDark: '#7c1810', eye: '#ff781c', accent: '#fff488', isB: true },
  // 8: Plant A, 9: Plant B
  { bgDeep: '#0c2410', bgMid: '#205828', skin: '#58c838', skinHi: '#94f46c', skinDark: '#2e801e', gear: '#dc2c3a', gearHi: '#ff6c78', gearDark: '#861420', eye: '#ffe848', accent: '#ffffff', isB: false },
  { bgDeep: '#140c28', bgMid: '#3a1c64', skin: '#2e9c8c', skinHi: '#64d4c2', skinDark: '#186256', gear: '#d830c0', gearHi: '#ff80ec', gearDark: '#801672', eye: '#7cffec', accent: '#ffffff', isB: true },
  // 10: Y.V. A, 11: Y.V. B
  { bgDeep: '#1c1430', bgMid: '#443070', skin: '#f4f2f8', skinHi: '#ffffff', skinDark: '#b6bac8', gear: '#f5c838', gearHi: '#fff494', gearDark: '#a87c14', eye: '#ffffff', accent: '#58f068', isB: false },
  { bgDeep: '#281020', bgMid: '#602248', skin: '#f5c838', skinHi: '#fff494', skinDark: '#b08014', gear: '#dc283c', gearHi: '#ff6c7c', gearDark: '#801420', eye: '#ff3c50', accent: '#58f068', isB: true },
  // 12: Steroids A (bald muscular + glasses + raised revolver), 13: Steroids B (cowboy hat + flexing + revolver like 21_paused.png!)
  { bgDeep: '#182434', bgMid: '#2c4460', skin: '#e0a470', skinHi: '#f8d2a4', skinDark: '#b27044', gear: '#3a4c6e', gearHi: '#647ca8', gearDark: '#202c44', eye: '#ffffff', accent: '#f5c838', isB: false },
  { bgDeep: '#18202c', bgMid: '#2a3c54', skin: '#e0a470', skinHi: '#f8d2a4', skinDark: '#b27044', gear: '#7c5234', gearHi: '#aa7850', gearDark: '#4a2e1a', eye: '#18141c', accent: '#f5c838', isB: true },
  // 14: Robot A, 15: Robot B
  { bgDeep: '#102028', bgMid: '#244c5e', skin: '#7c8894', skinHi: '#b4c2ce', skinDark: '#4a5460', gear: '#424c58', gearHi: '#6c7a88', gearDark: '#242a32', eye: '#48e8ff', accent: '#e83c34', isB: false },
  { bgDeep: '#101830', bgMid: '#243c70', skin: '#3c72cc', skinHi: '#74a8f8', skinDark: '#204486', gear: '#ebb834', gearHi: '#ffe878', gearDark: '#9e7414', eye: '#68f4ff', accent: '#ff4858', isB: true },
  // 16: Chicken A, 17: Chicken B
  { bgDeep: '#281012', bgMid: '#642024', skin: '#f2f0ea', skinHi: '#ffffff', skinDark: '#b8b4ac', gear: '#e42c28', gearHi: '#ff6864', gearDark: '#8c1414', eye: INK, accent: '#f8bc28', isB: false },
  { bgDeep: '#121224', bgMid: '#2c2c54', skin: '#363246', skinHi: '#5c5674', skinDark: '#1c1828', gear: '#e42838', gearHi: '#ff6874', gearDark: '#84121e', eye: '#ff3848', accent: '#f8c028', isB: true },
  // 18: Rebel A, 19: Rebel B
  { bgDeep: '#141c2c', bgMid: '#2c3e5e', skin: '#4a5a7a', skinHi: '#7488ae', skinDark: '#2a364e', gear: '#d6b682', gearHi: '#f6e2c0', gearDark: '#947448', eye: '#ffffff', accent: '#58b0ff', isB: false },
  { bgDeep: '#281018', bgMid: '#602032', skin: '#b02c3e', skinHi: '#e05e70', skinDark: '#701624', gear: '#d8e0ec', gearHi: '#ffffff', gearDark: '#8a94a6', eye: '#ffe848', accent: '#ffe848', isB: true },
  // 20: Horror A, 21: Horror B
  { bgDeep: '#08200c', bgMid: '#185c24', skin: '#58f050', skinHi: '#b4ff90', skinDark: '#249820', gear: '#98ff68', gearHi: '#f0ffe0', gearDark: '#166816', eye: '#ffffff', accent: '#e0ff58', isB: false },
  { bgDeep: '#0a182c', bgMid: '#1c4874', skin: '#38ccf4', skinHi: '#94f2ff', skinDark: '#1a7ca8', gear: '#7c94ff', gearHi: '#dce6ff', gearDark: '#244c92', eye: '#ffffff', accent: '#80f4ff', isB: true },
  // 22: Rogue A, 23: Rogue B
  { bgDeep: '#0c1834', bgMid: '#1e3e80', skin: '#e0ac88', skinHi: '#f8d2b4', skinDark: '#a67454', gear: '#3c74c8', gearHi: '#70a6f4', gearDark: '#204488', eye: '#68ecff', accent: '#f5d038', isB: false },
  { bgDeep: '#181422', bgMid: '#3a3052', skin: '#e0ac88', skinHi: '#f8d2b4', skinDark: '#a67454', gear: '#44485c', gearHi: '#727894', gearDark: '#242634', eye: '#ffc438', accent: '#dc2c3c', isB: true },
];

/**
 * Draws bold crisp 1x cel-shaded Nuclear Throne Mutant Bust Portrait (96x80, orig 48,40).
 * Uses a TRANSPARENT background with thick 2px comic ink outline so it works seamlessly
 * on BOTH the Campfire box AND the Pause screen (21_paused.png)!
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
  const cx = Math.floor(w * 0.44);

  switch (mutantIdx) {
    case 0: {
      // FISH — gritty ex-cop amphibian bust with spiky dorsal fin, brass badge & crooked smirk!
      // Guitar neck peeking behind right shoulder
      p.line(cx + 14, 58, cx + 34, 12, '#643c22', 5);
      p.line(cx + 15, 57, cx + 33, 13, '#98623c', 2);
      p.rect(cx + 28, 7, 9, 10, '#58341c');
      // Broad jacket shoulders & collar
      p.poly([[cx - 34, h - 1], [cx - 28, 54], [cx + 16, 52], [cx + 34, 60], [cx + 38, h - 1]], pal.gear);
      p.poly([[cx - 32, h - 1], [cx - 26, 55], [cx - 8, 53], [cx - 4, h - 1]], pal.gearHi);
      p.poly([[cx + 10, 56], [cx + 32, 62], [cx + 36, h - 1], [cx + 12, h - 1]], pal.gearDark);
      // Sheriff badge
      p.rect(cx - 18, 63, 7, 7, pal.accent);
      p.rect(cx - 16, 65, 3, 3, WHITE);
      // Spiky dorsal fin crest
      for (const [fx, fy, fh] of [[-12, 12, 13], [-2, 6, 16], [10, 10, 14], [19, 17, 10]] as const) {
        p.poly([[cx + fx - 5, fy + fh], [cx + fx - 3, fy], [cx + fx + 5, fy + fh]], pal.skinDark);
        p.poly([[cx + fx - 3, fy + fh], [cx + fx - 2, fy + 2], [cx + fx + 1, fy + fh]], pal.skinHi);
      }
      // Sculpted amphibian head & gill fins
      p.ellipse(cx, 35, 20, 17, pal.skin);
      p.ellipse(cx - 4, 30, 13, 10, pal.skinHi);
      p.ellipse(cx + 8, 42, 13, 10, pal.skinDark);
      p.poly([[cx - 19, 34], [cx - 29, 30], [cx - 26, 45], [cx - 17, 46]], pal.skin);
      p.poly([[cx - 18, 35], [cx - 26, 32], [cx - 24, 41], [cx - 17, 43]], pal.skinHi);
      if (pal.isB) {
        p.rect(cx - 20, 22, 40, 7, pal.gear);
        p.rect(cx - 18, 23, 34, 2, pal.gearHi);
        p.rect(cx - 12, 30, 9, 8, INK);
      } else {
        p.ellipse(cx - 6, 34, 6, 5, INK);
        p.ellipse(cx - 6, 34, 4.5, 3.5, pal.eye);
        p.rect(cx - 5, 33, 2, 2, INK);
        p.set(cx - 8, 32, WHITE);
      }
      p.ellipse(cx + 10, 34, 5, 4.5, INK);
      p.ellipse(cx + 10, 34, 3.5, 3, pal.eye);
      p.rect(cx + 10, 33, 2, 2, INK);
      p.set(cx + 8, 32, WHITE);
      // Badass crooked smirk + fangs
      p.line(cx - 10, 46, cx + 15, 43, INK, 3);
      p.rect(cx - 5, 43, 3, 3, CREAM);
      p.rect(cx + 8, 42, 3, 3, pal.isB ? pal.accent : CREAM);
      break;
    }

    case 1: {
      // CRYSTAL — jagged faceted prismatic monolith bust!
      p.poly([[cx - 34, h - 1], [cx - 28, 50], [cx + 28, 52], [cx + 36, h - 1]], pal.skinDark);
      p.poly([[cx - 32, h - 1], [cx - 26, 52], [cx - 4, 52], [cx - 10, h - 1]], pal.skinHi);
      // Shoulder spires
      p.poly([[cx - 26, 56], [cx - 34, 22], [cx - 16, 36], [cx - 14, 56]], pal.skin);
      p.poly([[cx + 26, 56], [cx + 35, 26], [cx + 18, 38], [cx + 16, 56]], pal.skinDark);
      // Faceted diamond monolith head
      p.poly([[cx, 6], [cx + 18, 24], [cx + 14, 54], [cx - 14, 54], [cx - 18, 24]], pal.skin);
      p.poly([[cx, 7], [cx - 17, 24], [cx - 12, 53], [cx, 53]], pal.skinHi);
      p.poly([[cx, 7], [cx - 10, 24], [cx, 28]], WHITE);
      p.poly([[cx, 7], [cx + 17, 24], [cx + 12, 53], [cx, 53]], pal.skinDark);
      p.line(cx, 7, cx, 53, WHITE, 1);
      // Glowing eyes
      p.poly([[cx - 11, 32], [cx - 2, 35], [cx - 3, 40], [cx - 10, 38]], INK);
      p.poly([[cx + 11, 32], [cx + 2, 35], [cx + 3, 40], [cx + 10, 38]], INK);
      p.rect(cx - 9, 34, 5, 3, pal.eye);
      p.rect(cx + 4, 34, 5, 3, pal.eye);
      break;
    }

    case 2: {
      // EYES — haunting pale blue-slate psychic covered in bold glaring eyes!
      p.ellipse(cx, 72, 28, 16, pal.gear);
      p.ellipse(cx, 66, 20, 11, pal.gearDark);
      p.ellipse(cx, 35, 21, 24, pal.skin);
      p.ellipse(cx - 5, 28, 13, 14, pal.skinHi);
      p.ellipse(cx + 8, 40, 12, 14, pal.skinDark);
      for (const [ex, ey, er] of [[-9, 32, 6], [10, 30, 5.5], [1, 18, 4.5], [-7, 46, 4], [8, 44, 3.5], [-13, 21, 3]] as const) {
        p.ellipse(cx + ex, ey, er + 1, er + 1, INK);
        p.ellipse(cx + ex, ey, er, er, pal.eye);
        p.rect(cx + ex, ey - 1, Math.max(2, Math.floor(er * 0.45)), Math.max(2, Math.floor(er * 0.45)), INK);
        p.set(cx + ex - Math.floor(er * 0.4), ey - Math.floor(er * 0.4), WHITE);
      }
      break;
    }

    case 3: {
      // MELTING — gaunt dripping skull + exposed crimson ribs!
      p.poly([[cx - 32, h - 1], [cx - 24, 56], [cx + 24, 56], [cx + 32, h - 1]], pal.gearDark);
      p.rect(cx - 12, 56, 24, 24, INK);
      p.rect(cx - 1, 58, 3, 20, pal.skin);
      for (const ry of [61, 67, 73]) {
        p.rect(cx - 11, ry, 9, 3, pal.skinHi);
        p.rect(cx + 2, ry, 9, 3, pal.skin);
      }
      // Dripping cranium
      p.ellipse(cx, 28, 17, 15, pal.skin);
      p.ellipse(cx - 4, 22, 10, 8, pal.skinHi);
      p.rect(cx - 17, 34, 6, 20, pal.skin); // dripping cheek
      p.rect(cx + 12, 34, 5, 16, pal.skinDark);
      p.rect(cx - 10, 38, 20, 14, pal.skin);
      // Hollow sockets
      p.ellipse(cx - 7, 30, 6, 6.5, INK);
      p.ellipse(cx + 8, 29, 5, 5.5, INK);
      if (pal.isB) {
        p.ellipse(cx - 7, 30, 3, 3, pal.eye);
        p.ellipse(cx + 8, 29, 2.5, 2.5, pal.eye);
        p.set(cx - 7, 30, pal.accent);
        p.set(cx + 8, 29, pal.accent);
      }
      // Clenched skull teeth
      p.rect(cx - 8, 42, 16, 6, INK);
      for (let t = -7; t <= 5; t += 3) {
        p.rect(cx + t, 43, 2, 4, WHITE);
      }
      break;
    }

    case 4: {
      // PLANT — snapping lime-green & crimson flytrap jaws with gleaming fangs!
      p.rect(cx - 9, 48, 18, 32, pal.skin);
      p.poly([[cx - 8, 60], [cx - 32, 50], [cx - 26, 68], [cx - 8, 72]], pal.skin);
      p.poly([[cx + 8, 60], [cx + 32, 50], [cx + 26, 68], [cx + 8, 72]], pal.skinDark);
      // Upper crimson flytrap dome & gaping fanged maw
      p.ellipse(cx + 2, 26, 24, 16, pal.gear);
      p.ellipse(cx - 4, 20, 14, 8, pal.gearHi);
      p.ellipse(cx + 2, 41, 22, 12, INK);
      p.ellipse(cx + 2, 51, 20, 8, pal.gearDark);
      p.line(cx - 6, 46, cx + 12, 43, pal.gearHi, 4);
      for (let t = -14; t <= 16; t += 6) {
        p.poly([[cx + t - 2, 33], [cx + t + 2, 33], [cx + t, 42]], CREAM);
        p.poly([[cx + t - 1, 50], [cx + t + 3, 50], [cx + t + 1, 43]], CREAM);
      }
      p.ellipse(cx - 9, 25, 4.5, 3.5, pal.eye);
      p.ellipse(cx + 12, 25, 4.5, 3.5, pal.eye);
      p.set(cx - 8, 25, INK);
      p.set(cx + 12, 25, INK);
      break;
    }

    case 5: {
      // Y.V. — cocky giant pure-white 3D pyramid with huge cool cyclops eye & gold chain!
      p.poly([[cx - 32, h - 1], [cx - 24, 58], [cx + 26, 58], [cx + 34, h - 1]], '#2a2438');
      p.line(cx - 18, 58, cx, 72, pal.gear, 4);
      p.line(cx + 18, 58, cx, 72, pal.gear, 4);
      p.ellipse(cx, 70, 6, 6, pal.gearHi);
      // Giant sharp pyramid head
      p.poly([[cx + 2, 6], [cx - 28, 58], [cx + 30, 58]], pal.skin);
      p.poly([[cx + 2, 7], [cx - 27, 57], [cx + 4, 57]], pal.skinHi);
      p.poly([[cx + 2, 7], [cx + 4, 57], [cx + 29, 57]], pal.skinDark);
      p.poly([[cx + 2, 6], [cx - 5, 18], [cx + 9, 18]], pal.gearHi);
      if (pal.isB) {
        p.rect(cx - 14, 32, 30, 10, INK);
        p.rect(cx - 12, 34, 26, 6, pal.eye);
        p.line(cx - 9, 34, cx - 3, 40, WHITE, 2);
      } else {
        p.ellipse(cx + 2, 37, 13, 8, INK);
        p.ellipse(cx + 2, 37, 11, 6, WHITE);
        p.ellipse(cx + 4, 37, 5, 5, INK);
        p.rect(cx, 34, 2, 2, WHITE);
        p.rect(cx - 11, 29, 26, 5, pal.skin);
        p.line(cx - 11, 34, cx + 15, 35, INK, 2);
      }
      break;
    }

    case 6: {
      // STEROIDS — GRITTY NUCLEAR THRONE COMIC PORTRAIT MATCHING 21_paused.png!!
      // Massive sloped traps/deltoids rising behind head, 4-tone warm ochre cel-shading,
      // heavy internal comic ink contour lines, gold crown belt buckle, blue denim jeans,
      // compact spectacles (A) or tilted battered cowboy hat (B), and chunky dark-iron REVOLVER!
      const skinHi = '#f6c896';
      const skinMid = '#e09a62';
      const skinShade = '#ac6234';
      const skinDeep = '#6e3a1c';
      const scx = cx - 4; // shift bust slightly left so the raised revolver gets generous comic framing!

      // 1. Blue denim jeans + dark leather belt along bottom edge
      p.poly([[scx - 24, 65], [scx + 19, 64], [scx + 21, h - 2], [scx - 28, h - 2]], '#2c509e');
      p.poly([[scx - 22, 66], [scx - 4, 66], [scx - 8, h - 2], [scx - 25, h - 2]], '#4a76cc');
      p.poly([[scx + 6, 66], [scx + 19, 65], [scx + 20, h - 2], [scx + 6, h - 2]], '#1c3266');
      p.line(scx - 10, 68, scx - 23, 76, INK, 2); // denim crease ink
      p.line(scx + 8, 69, scx + 16, 76, INK, 2);

      // 2. Massive towering sloped trapezius & shoulder mass rising BEHIND head/neck!
      p.poly([[scx - 33, 56], [scx - 32, 30], [scx - 14, 18], [scx + 16, 20], [scx + 26, 34], [scx + 20, 62], [scx - 24, 62]], skinMid);
      p.ellipse(scx - 16, 26, 13, 8, skinHi); // sunlit left trap ridge
      p.ellipse(scx + 14, 29, 10, 7, skinShade); // shadowed right trap ridge

      // 3. Sculpted 4-tone rounded pectoral muscles & abdominal blocks with comic ink seams!
      // Deep ribcage / under-torso warm shadow
      p.ellipse(scx - 1, 51, 21, 13, skinShade);
      p.ellipse(scx + 11, 51, 11, 11, skinDeep);
      // Huge bulging left & right pecs (matching 21_paused.png proportions!)
      p.ellipse(scx - 11, 41, 13, 10, skinMid);
      p.ellipse(scx - 14, 37, 9, 5.5, skinHi);
      p.ellipse(scx - 8, 47, 10, 4, skinShade);
      p.ellipse(scx + 9, 41, 12, 10, skinMid);
      p.ellipse(scx + 6, 37, 8, 5, skinHi);
      p.ellipse(scx + 11, 47, 9, 4, skinShade);
      // Heavy comic ink under-pec contour & central sternum cleft!
      p.bezier(scx - 23, 47, scx - 12, 53, scx - 1, 49, INK, 2);
      p.bezier(scx - 1, 49, scx + 10, 53, scx + 20, 46, INK, 2);
      p.line(scx - 1, 35, scx - 1, 50, INK, 2);
      // Sculpted 4-pack abs tucked neatly above belt buckle
      p.ellipse(scx - 8, 55, 6, 3.8, skinMid);
      p.ellipse(scx - 9, 54, 3.5, 2, skinHi);
      p.ellipse(scx + 6, 55, 6, 3.8, skinMid);
      p.ellipse(scx + 5, 54, 3.5, 2, skinHi);
      p.ellipse(scx - 7, 60, 5, 3, skinShade);
      p.ellipse(scx + 5, 60, 5, 3, skinShade);
      p.line(scx - 1, 51, scx - 1, 61, INK, 1);
      p.line(scx - 14, 58, scx + 12, 58, skinDeep, 1);

      // Leather belt & iconic 3-point GOLD CROWN BELT BUCKLE drawn OVER abs so spikes pop cleanly!
      p.rect(scx - 23, 62, 42, 5, '#4c2e1c');
      p.line(scx - 23, 62, scx + 19, 62, INK, 1);
      p.line(scx - 23, 67, scx + 19, 67, INK, 1);
      p.poly([[scx - 8, 67], [scx - 9, 58], [scx - 4, 62], [scx, 56], [scx + 4, 62], [scx + 9, 58], [scx + 8, 67]], INK);
      p.poly([[scx - 7, 66], [scx - 7, 60], [scx - 3, 63], [scx, 58], [scx + 3, 63], [scx + 7, 60], [scx + 7, 66]], '#f0bc2c');
      p.poly([[scx - 6, 63], [scx - 6, 60], [scx - 2, 63], [scx, 58], [scx + 2, 63]], '#fff498');

      // 4. Huge bulging left shoulder/bicep + flexed right arm holding REVOLVER!
      p.ellipse(scx - 28, 43, 12, 15, skinMid);
      p.ellipse(scx - 31, 37, 7, 8, skinHi);
      p.ellipse(scx - 25, 52, 9, 7, skinShade);
      p.bezier(scx - 24, 32, scx - 19, 42, scx - 22, 54, INK, 2); // left deltoid comic crease
      // Right flexing shoulder, thick bent forearm & clenched fist!
      p.ellipse(scx + 23, 39, 10, 11, skinMid);
      p.ellipse(scx + 22, 35, 5.5, 5, skinHi);
      p.ellipse(scx + 26, 44, 8, 6, skinShade);
      p.line(scx + 25, 45, scx + 35, 34, skinDeep, 13);
      p.line(scx + 24, 44, scx + 34, 34, skinMid, 10);
      p.line(scx + 23, 42, scx + 32, 34, skinHi, 4);
      p.bezier(scx + 19, 43, scx + 25, 48, scx + 33, 42, INK, 2); // bicep/forearm comic ink crease

      // 5. CHUNKY HEAVY-INKED STEEL REVOLVER HELD HIGH (exact silhouette from 21_paused.png!)
      // Angled wood grip + trigger guard
      p.poly([[scx + 34, 30], [scx + 41, 30], [scx + 43, 42], [scx + 36, 42]], '#5c3218');
      p.poly([[scx + 35, 31], [scx + 38, 31], [scx + 39, 40], [scx + 36, 40]], '#8c522c');
      p.line(scx + 34, 30, scx + 36, 42, INK, 1);
      // Heavy steel receiver + hammer spur + fluted cylinder
      p.poly([[scx + 26, 25], [scx + 52, 15], [scx + 55, 22], [scx + 31, 32]], '#4e5866');
      p.poly([[scx + 28, 24], [scx + 51, 16], [scx + 52, 18], [scx + 29, 26]], '#9aa6b8');
      p.poly([[scx + 31, 29], [scx + 54, 20], [scx + 55, 22], [scx + 32, 32]], '#2c323c');
      p.line(scx + 26, 25, scx + 52, 15, INK, 2);
      p.line(scx + 31, 32, scx + 55, 22, INK, 2);
      // Open dark barrel bore on muzzle tip
      p.ellipse(scx + 53, 18, 2.5, 3.5, '#2a303a');
      p.ellipse(scx + 53, 18, 1.4, 2.2, INK);
      // Fluted dark iron cylinder with metallic highlights
      p.rect(scx + 32, 23, 9, 8, '#2c323c');
      p.rect(scx + 33, 24, 2, 6, '#7c8898');
      p.rect(scx + 37, 24, 2, 6, '#626c7a');
      p.rect(scx + 32, 23, 9, 1, INK);
      p.rect(scx + 32, 30, 9, 1, INK);
      // Big clenched tan fist & thumb wrapping the grip!
      p.ellipse(scx + 37, 35, 6, 6, skinMid);
      p.ellipse(scx + 35, 33, 3.5, 3, skinHi);
      p.ellipse(scx + 39, 38, 4, 3, skinShade);
      p.line(scx + 33, 33, scx + 41, 33, INK, 1);
      p.line(scx + 34, 36, scx + 42, 36, INK, 1);

      // 6. Strong square jaw, rugged cheekbones & fierce gritting teeth!
      p.ellipse(scx - 1, 24, 15, 12, skinMid);
      p.ellipse(scx - 6, 19, 9, 6, skinHi);
      p.ellipse(scx + 7, 27, 8, 6, skinShade);
      p.bezier(scx - 14, 28, scx - 1, 36, scx + 12, 28, INK, 2); // strong jaw comic line
      // Tight fierce clenched teeth smirk (NO giant blocky rectangle!)
      p.bezier(scx - 10, 28, scx - 1, 31, scx + 8, 28, INK, 4);
      p.bezier(scx - 9, 28, scx - 1, 30, scx + 7, 28, CREAM, 2);
      p.set(scx - 5, 29, INK);
      p.set(scx - 1, 29, INK);
      p.set(scx + 3, 29, INK);

      if (pal.isB) {
        // B-SKIN: Iconic wide-brimmed worn brown cowboy hat pulled low over squinting fierce eyes (21_paused.png!)
        p.line(scx - 10, 22, scx - 3, 25, INK, 2);
        p.line(scx + 9, 22, scx + 2, 25, INK, 2);
        p.poly([[scx - 28, 18], [scx - 14, 11], [scx + 14, 12], [scx + 24, 19], [scx + 11, 25], [scx - 21, 24]], '#7a5234');
        p.poly([[scx - 18, 17], [scx - 12, 4], [scx + 1, 7], [scx + 12, 5], [scx + 15, 18]], '#7a5234');
        p.poly([[scx - 16, 15], [scx - 10, 6], [scx, 8], [scx - 1, 16]], '#a6764c');
        p.poly([[scx + 4, 7], [scx + 12, 6], [scx + 14, 17], [scx + 4, 17]], '#4e301c');
        p.bezier(scx - 25, 20, scx - 4, 25, scx + 19, 21, INK, 2);
        p.bezier(scx - 16, 16, scx, 19, scx + 14, 16, INK, 2);
      } else {
        // A-SKIN: Bald sunlit dome + furrowed angry brow + COMPACT dark-rimmed scientist spectacles!
        p.ellipse(scx - 2, 16, 13, 8, skinMid);
        p.ellipse(scx - 6, 13, 8, 4, skinHi);
        p.set(scx - 8, 12, WHITE);
        // Heavy stern comic brow ridge overhanging compact spectacles!
        p.bezier(scx - 12, 18, scx - 1, 21, scx + 10, 18, skinDeep, 3);
        p.bezier(scx - 12, 18, scx - 1, 21, scx + 10, 18, INK, 2);
        // Compact dark-rimmed round glasses (radius 4.5 — NOT giant cartoon white saucers!)
        p.ellipse(scx - 6, 22, 4.8, 4.2, INK);
        p.ellipse(scx + 5, 22, 4.8, 4.2, INK);
        p.rect(scx - 2, 21, 3, 2, INK); // sturdy glasses bridge
        p.ellipse(scx - 6, 22, 3.2, 2.8, '#cdeaf6');
        p.ellipse(scx + 5, 22, 3.2, 2.8, '#cdeaf6');
        p.rect(scx - 6, 22, 2, 2, INK); // intense focused eyes behind glass
        p.rect(scx + 5, 22, 2, 2, INK);
        p.set(scx - 8, 20, WHITE); // subtle specular glint
        p.set(scx + 3, 20, WHITE);
      }
      break;
    }

    case 7: {
      // ROBOT — chunky rounded steel CRT bot + bolts + antenna + glowing cyan visor!
      p.poly([[cx - 32, h - 1], [cx - 28, 54], [cx + 28, 54], [cx + 32, h - 1]], pal.gear);
      p.poly([[cx - 26, h - 1], [cx - 24, 57], [cx + 24, 57], [cx + 26, h - 1]], pal.skin);
      p.rect(cx - 24, 57, 48, 3, pal.skinHi);
      p.rect(cx - 14, 62, 28, 12, INK);
      for (let g = 0; g < 4; g++) p.rect(cx - 11 + g * 6, 64, 4, 8, pal.accent);
      p.line(cx - 16, 58, cx - 16, 76, INK, 1);
      p.line(cx + 16, 58, cx + 16, 76, INK, 1);
      p.line(cx + 12, 18, cx + 18, 5, pal.skinHi, 2);
      p.ellipse(cx + 18, 5, 3.5, 3.5, pal.accent);
      // Chunky beveled CRT head + side ear-bolts
      p.rect(cx - 26, 28, 5, 12, pal.gear);
      p.rect(cx + 21, 28, 5, 12, pal.gearDark);
      p.rect(cx - 22, 16, 44, 38, pal.skin);
      p.rect(cx - 22, 16, 44, 5, pal.skinHi);
      p.rect(cx - 22, 49, 44, 5, pal.skinDark);
      p.rect(cx - 17, 22, 34, 23, INK);
      p.rect(cx - 15, 24, 30, 19, '#12222c');
      p.rect(cx - 12, 28, 9, 8, pal.eye);
      p.rect(cx + 3, 28, 9, 8, pal.eye);
      p.rect(cx - 11, 29, 5, 3, WHITE);
      p.rect(cx + 4, 29, 5, 3, WHITE);
      break;
    }

    case 8: {
      // CHICKEN — fierce martial rooster with crimson comb, yellow beak, headband & katana!
      p.line(cx + 10, 50, cx + 34, 12, '#4a5260', 5);
      p.line(cx + 11, 49, cx + 33, 13, pal.gear, 3);
      // Solid connected feathered neck & martial tunic shoulders (zero neck gap!)
      p.rect(cx - 11, 44, 22, 16, pal.skin);
      p.ellipse(cx, 69, 29, 17, pal.skin);
      p.ellipse(cx - 6, 65, 16, 9, pal.skinHi);
      p.poly([[cx - 22, 58], [cx, 72], [cx + 22, 58], [cx + 18, h - 1], [cx - 18, h - 1]], pal.gearDark);
      p.line(cx - 21, 58, cx, 71, INK, 2);
      p.line(cx + 21, 58, cx, 71, INK, 2);
      // Towering crimson comb
      p.poly([[cx - 10, 22], [cx - 12, 7], [cx - 4, 15], [cx, 5], [cx + 6, 14], [cx + 12, 8], [cx + 10, 22]], pal.gear);
      p.ellipse(cx, 35, 17, 16, pal.skin);
      p.ellipse(cx - 4, 30, 10, 9, pal.skinHi);
      p.ellipse(cx + 6, 42, 10, 7, pal.skinDark);
      // Crimson headband & trailing tails
      p.rect(cx - 18, 24, 36, 7, pal.gear);
      p.rect(cx - 16, 25, 32, 2, pal.gearHi);
      p.line(cx - 18, 31, cx + 18, 31, INK, 1);
      p.poly([[cx + 16, 25], [cx + 36, 18], [cx + 38, 25], [cx + 16, 30]], pal.gear);
      // Hooked golden beak & wattle
      p.ellipse(cx - 10, 44, 4, 4, pal.gear);
      p.poly([[cx - 6, 34], [cx - 25, 39], [cx - 14, 44], [cx - 5, 42]], pal.accent);
      p.poly([[cx - 6, 34], [cx - 23, 39], [cx - 6, 38]], '#fff498');
      p.line(cx - 22, 40, cx - 6, 40, INK, 1);
      p.rect(cx - 7, 32, 5, 4, INK);
      p.set(cx - 5, 33, pal.isB ? pal.accent : WHITE);
      break;
    }

    case 9: {
      // REBEL — shadowed slate-blue hood, layered draped scarf folds & piercing bright eyes!
      p.poly([[cx - 34, h - 1], [cx - 26, 52], [cx + 26, 52], [cx + 34, h - 1]], pal.skin);
      p.poly([[cx - 32, h - 1], [cx - 24, 54], [cx - 4, 54], [cx - 8, h - 1]], pal.skinHi);
      p.poly([[cx + 6, 54], [cx + 25, 54], [cx + 32, h - 1], [cx + 10, h - 1]], pal.skinDark);
      p.poly([[cx, 6], [cx + 21, 16], [cx + 25, 52], [cx - 25, 52], [cx - 21, 16]], pal.skin);
      p.poly([[cx, 7], [cx - 19, 17], [cx - 22, 44], [cx - 8, 36]], pal.skinHi);
      p.ellipse(cx, 33, 15, 16, INK);
      // Draped layered scarf with hanging tail & comic fold ink lines
      p.poly([[cx - 21, 41], [cx + 21, 39], [cx + 23, 56], [cx - 19, 58]], pal.gear);
      p.poly([[cx - 20, 42], [cx + 18, 40], [cx + 16, 46], [cx - 18, 47]], pal.gearHi);
      p.poly([[cx - 12, 54], [cx - 2, 54], [cx - 6, 74], [cx - 18, 71]], pal.gear);
      p.bezier(cx - 19, 48, cx, 52, cx + 20, 46, INK, 2);
      p.line(cx - 19, 57, cx + 22, 55, INK, 2);
      // Piercing glowing eyes
      p.rect(cx - 10, 30, 7, 4, pal.eye);
      p.rect(cx + 3, 30, 7, 4, pal.eye);
      break;
    }

    case 10: {
      // HORROR — snarling neon-green radioactive beast with energy spikes & rad orbs!
      p.ellipse(cx, 62, 26, 20, pal.skinDark);
      p.ellipse(cx, 60, 20, 16, pal.skin);
      for (const [sx, sy, tx, ty] of [[-20, 44, -32, 26], [-12, 26, -20, 8], [0, 22, -2, 5], [12, 26, 22, 8], [20, 44, 34, 28]] as const) {
        p.poly([[cx + sx - 5, sy], [cx + tx, ty], [cx + sx + 5, sy]], pal.skinHi);
      }
      p.ellipse(cx, 36, 21, 17, pal.skin);
      p.ellipse(cx - 4, 30, 12, 9, pal.skinHi);
      // Gaping glowing mouth + teeth
      p.rect(cx - 15, 38, 30, 13, INK);
      p.rect(cx - 11, 41, 22, 7, pal.accent);
      p.rect(cx - 6, 43, 12, 3, WHITE);
      for (let t = -10; t <= 10; t += 5) {
        p.rect(cx + t, 37, 3, 4, WHITE);
      }
      p.rect(cx - 12, 28, 7, 5, WHITE);
      p.rect(cx + 5, 28, 7, 5, WHITE);
      p.ellipse(cx - 32, 16, 4, 4, pal.skinHi);
      p.ellipse(cx + 32, 18, 3.5, 3.5, pal.skinHi);
      break;
    }

    default: {
      // ROGUE — cobalt-blue IDPD armor pauldrons, yellow stripe, wind-swept hair & fierce shaded eyes!
      const hair = pal.isB ? '#d8e0ec' : '#3a2224';
      const hairHi = pal.isB ? WHITE : '#643c40';
      p.poly([[cx - 34, h - 1], [cx - 27, 52], [cx + 27, 52], [cx + 34, h - 1]], pal.gear);
      p.poly([[cx - 32, h - 1], [cx - 25, 54], [cx - 8, 54], [cx - 10, h - 1]], pal.gearHi);
      p.poly([[cx + 10, 54], [cx + 26, 54], [cx + 32, h - 1], [cx + 12, h - 1]], pal.gearDark);
      p.line(cx - 16, 54, cx - 18, 76, INK, 2);
      p.line(cx + 16, 54, cx + 18, 76, INK, 2);
      p.rect(cx - 14, 61, 28, 5, pal.accent);
      p.rect(cx - 12, 67, 24, 3, pal.eye);
      // Neck collar & head + windswept bangs
      p.rect(cx - 8, 46, 16, 10, pal.gearDark);
      p.ellipse(cx, 32, 19, 18, hair);
      p.ellipse(cx, 35, 14, 15, pal.skin);
      p.ellipse(cx - 3, 33, 9, 9, pal.skinHi);
      p.ellipse(cx + 6, 40, 7, 7, pal.skinDark);
      p.poly([[cx - 18, 28], [cx - 9, 11], [cx + 13, 11], [cx + 19, 26], [cx + 6, 22], [cx - 6, 27]], hair);
      p.rect(cx - 10, 14, 14, 5, hairHi);
      // Fierce brows, dark-rimmed expressive eyes & glowing IDPD ear-comms!
      p.rect(cx + 12, 31, 5, 9, '#7a8898');
      p.rect(cx + 14, 33, 2, 5, pal.eye);
      p.line(cx - 10, 30, cx - 2, 32, INK, 2);
      p.line(cx + 10, 30, cx + 2, 32, INK, 2);
      p.rect(cx - 9, 32, 6, 4, INK);
      p.rect(cx + 3, 32, 6, 4, INK);
      p.rect(cx - 8, 33, 4, 2, WHITE);
      p.rect(cx + 4, 33, 4, 2, WHITE);
      p.rect(cx - 6, 33, 2, 2, pal.eye);
      p.rect(cx + 5, 33, 2, 2, pal.eye);
      p.line(cx - 4, 44, cx + 5, 42, INK, 2);
      break;
    }
  }

  // Bold 2px comic ink outer outline around the transparent bust!
  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}

/**
 * Crisp 1x Char Select Roster Face Cards (16x24, orig 0,0, 18 frames).
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
  const cx = Math.floor(w * 0.5);

  // Rich crisp card background
  p.rect(1, 1, w - 2, h - 2, pal.bgDeep);
  p.rect(2, 2, w - 4, h - 8, pal.bgMid);

  const fg = new PxCanvas(w, h);
  if (frame === 0 || frame > 12) {
    fg.rect(5, 6, 6, 2, WHITE);
    fg.rect(9, 8, 2, 4, WHITE);
    fg.rect(7, 11, 3, 2, WHITE);
    fg.rect(7, 13, 2, 2, WHITE);
    fg.rect(7, 17, 2, 2, WHITE);
  } else {
    switch (mutantIdx) {
      case 0: // Fish
        fg.rect(cx - 3, 3, 2, 3, pal.skinHi);
        fg.rect(cx + 1, 4, 2, 2, pal.skinHi);
        fg.ellipse(cx, 13, 6, 6, pal.skin);
        fg.rect(cx - 4, 18, 8, 5, pal.gear);
        fg.rect(cx - 5, 10, 4, 3, pal.eye);
        fg.rect(cx + 1, 10, 4, 3, pal.eye);
        fg.set(cx - 3, 11, INK);
        fg.set(cx + 3, 11, INK);
        fg.rect(cx - 3, 15, 7, 1, INK);
        break;
      case 1: // Crystal
        fg.poly([[cx, 3], [cx + 6, 12], [cx + 4, 22], [cx - 4, 22], [cx - 6, 12]], pal.skin);
        fg.poly([[cx, 3], [cx - 6, 12], [cx, 15]], pal.skinHi);
        fg.rect(cx - 4, 11, 3, 2, WHITE);
        fg.rect(cx + 1, 11, 3, 2, WHITE);
        break;
      case 2: // Eyes
        fg.ellipse(cx, 13, 6, 8, pal.skin);
        for (const [ex, ey] of [[-3, 12], [3, 11], [0, 7], [-2, 17], [3, 16]] as const) {
          fg.rect(cx + ex - 1, ey - 1, 3, 3, WHITE);
          fg.set(cx + ex, ey, INK);
        }
        break;
      case 3: // Melting
        fg.rect(2, 18, 12, 5, pal.gearDark);
        fg.ellipse(cx, 11, 6, 6, pal.skin);
        fg.rect(cx - 5, 14, 2, 6, pal.skin);
        fg.rect(cx - 4, 9, 3, 3, INK);
        fg.rect(cx + 1, 9, 3, 3, INK);
        fg.rect(cx - 3, 15, 6, 3, INK);
        fg.set(cx - 2, 16, WHITE);
        fg.set(cx + 1, 16, WHITE);
        break;
      case 4: // Plant
        fg.rect(cx - 3, 17, 6, 6, pal.skin);
        fg.ellipse(cx, 11, 6, 6, pal.gear);
        fg.rect(cx - 5, 11, 10, 4, INK);
        fg.set(cx - 4, 11, WHITE);
        fg.set(cx - 1, 11, WHITE);
        fg.set(cx + 2, 11, WHITE);
        fg.rect(cx - 4, 7, 2, 2, pal.eye);
        fg.rect(cx + 2, 7, 2, 2, pal.eye);
        break;
      case 5: // Y.V.
        fg.poly([[cx, 3], [cx - 7, 20], [cx + 7, 20]], pal.skin);
        fg.poly([[cx, 3], [cx - 7, 20], [cx, 20]], pal.skinHi);
        fg.rect(cx - 4, 11, 8, 4, INK);
        fg.rect(cx - 3, 12, 6, 2, WHITE);
        fg.rect(cx, 12, 2, 2, INK);
        fg.rect(cx - 5, 20, 10, 3, pal.gear);
        break;
      case 6: // Steroids (muscular tan bust + compact dark-rimmed glasses — NO white owl blobs!)
        fg.rect(1, 16, 14, 7, '#e09a62');
        fg.rect(2, 17, 5, 3, '#f6c896');
        fg.rect(9, 17, 5, 3, '#f6c896');
        fg.rect(2, 20, 12, 3, pal.gear);
        fg.rect(cx - 1, 20, 2, 2, pal.accent);
        fg.ellipse(cx, 11, 5.5, 5.5, '#e09a62');
        fg.rect(cx - 4, 7, 7, 2, '#f6c896');
        fg.rect(cx - 4, 9, 3, 3, INK);
        fg.rect(cx + 1, 9, 3, 3, INK);
        fg.set(cx - 3, 10, '#cdeaf6');
        fg.set(cx + 2, 10, '#cdeaf6');
        fg.rect(cx - 2, 14, 4, 1, INK);
        break;
      case 7: // Robot
        fg.rect(cx + 2, 2, 2, 4, pal.accent);
        fg.rect(2, 6, 12, 12, pal.skin);
        fg.rect(4, 8, 8, 7, INK);
        fg.rect(5, 10, 3, 3, pal.eye);
        fg.rect(9, 10, 3, 3, pal.eye);
        fg.rect(3, 18, 10, 5, pal.gear);
        break;
      case 8: // Chicken
        fg.rect(cx - 3, 3, 6, 4, pal.gear);
        fg.ellipse(cx + 1, 13, 5, 6, pal.skin);
        fg.rect(cx - 4, 9, 10, 2, pal.gear);
        fg.poly([[cx - 1, 11], [cx - 7, 14], [cx - 1, 16]], pal.accent);
        fg.rect(cx - 1, 11, 2, 2, INK);
        fg.rect(3, 18, 10, 5, pal.gearDark);
        break;
      case 9: // Rebel
        fg.poly([[cx, 3], [cx + 7, 10], [cx + 6, 22], [cx - 6, 22], [cx - 7, 10]], pal.skin);
        fg.ellipse(cx, 12, 5, 5, INK);
        fg.rect(cx - 5, 15, 10, 5, pal.gear);
        fg.rect(cx - 4, 11, 3, 2, pal.eye);
        fg.rect(cx + 1, 11, 3, 2, pal.eye);
        break;
      case 10: // Horror
        fg.rect(cx - 6, 3, 3, 4, pal.skinHi);
        fg.rect(cx + 3, 3, 3, 4, pal.skinHi);
        fg.ellipse(cx, 13, 6, 7, pal.skin);
        fg.rect(cx - 4, 10, 3, 2, WHITE);
        fg.rect(cx + 1, 10, 3, 2, WHITE);
        fg.rect(cx - 4, 14, 8, 4, INK);
        fg.rect(cx - 3, 15, 6, 2, pal.accent);
        break;
      default: // Rogue
        fg.rect(2, 17, 12, 6, pal.gear);
        fg.rect(cx - 4, 19, 8, 2, pal.accent);
        fg.ellipse(cx, 12, 5, 6, pal.skin);
        fg.rect(cx - 6, 5, 12, 6, '#3a2224');
        fg.rect(cx - 4, 11, 3, 2, WHITE);
        fg.rect(cx + 1, 11, 3, 2, WHITE);
        fg.set(cx - 3, 12, pal.eye);
        fg.set(cx + 2, 12, pal.eye);
        break;
    }
  }

  fg.outline(INK);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fg.get(x, y);
      if (c) p.set(x, y, c);
    }
  }
  // Crisp 1px black outer card frame
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
 * 5 CRISP 1x CLOSE-UP BOSS INTRO PORTRAITS (80x70, orig 40,35, transparent background).
 * Frame 0 = Big Bandit, 1 = Big Dog, 2 = Lil' Hunter, 3 = The Nuclear Throne, 4 = Throne II.
 */
export function drawBossIntroPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.5);
  const cy = Math.floor(h * 0.52);

  switch (frame % 5) {
    case 0: {
      // BIG BANDIT
      p.poly([[cx - 36, h - 1], [cx - 30, 40], [cx + 30, 40], [cx + 36, h - 1]], '#b88246');
      p.line(cx - 26, 42, cx + 18, h - 1, '#4c2c1c', 7);
      for (let i = 0; i < 5; i++) p.rect(cx - 20 + i * 7, 45 + i * 4, 4, 5, '#f5cc40');
      p.poly([[cx - 22, 32], [cx + 22, 32], [cx + 20, 46], [cx, 50], [cx - 20, 46]], '#dc2832');
      p.ellipse(cx, 26, 17, 12, '#1e161a');
      p.rect(cx - 13, 22, 10, 6, '#ff2834');
      p.rect(cx + 3, 22, 10, 6, '#ff2834');
      p.rect(cx - 11, 23, 4, 2, WHITE);
      p.rect(cx + 5, 23, 4, 2, WHITE);
      p.poly([[cx - 36, 20], [cx - 20, 14], [cx + 20, 14], [cx + 36, 20], [cx + 30, 24], [cx - 30, 24]], '#6c4220');
      p.poly([[cx - 20, 16], [cx - 14, 4], [cx, 7], [cx + 14, 4], [cx + 20, 16]], '#6c4220');
      p.rect(cx - 19, 14, 38, 3, '#dc2832');
      break;
    }
    case 1: {
      // BIG DOG
      p.rect(cx - 28, 10, 8, 22, '#64707e');
      p.rect(cx + 20, 10, 8, 22, '#64707e');
      p.ellipse(cx, cy + 4, 30, 23, '#9aa2aa');
      p.ellipse(cx - 4, cy - 4, 20, 12, '#ccd4dc');
      p.rect(cx - 26, cy - 12, 52, 16, '#9c582e');
      for (let i = -2; i <= 2; i++) p.rect(cx + i * 9 - 2, cy - 10, 4, 6, '#f5c838');
      p.ellipse(cx, cy + 5, 11, 9, INK);
      p.ellipse(cx, cy + 5, 8, 6, '#ff3428');
      p.rect(cx - 3, cy + 3, 4, 3, '#fff4a0');
      p.rect(cx - 35, cy + 8, 14, 14, '#5c6674');
      p.rect(cx + 21, cy + 8, 14, 14, '#5c6674');
      break;
    }
    case 2: {
      // LIL' HUNTER
      p.rect(cx - 32, 18, 12, 28, '#6c7888');
      p.rect(cx + 20, 18, 12, 28, '#6c7888');
      p.poly([[cx - 31, 46], [cx - 21, 46], [cx - 26, 66]], '#ff6c1c');
      p.poly([[cx + 21, 46], [cx + 31, 46], [cx + 26, 66]], '#ff6c1c');
      p.poly([[cx - 24, h - 1], [cx - 20, 40], [cx + 20, 40], [cx + 24, h - 1]], '#3c74d8');
      p.rect(cx - 21, 40, 42, 6, '#f5cc40');
      p.poly([[cx - 16, 8], [cx + 16, 8], [cx + 22, 38], [cx - 22, 38]], '#3c74d8');
      p.rect(cx - 3, 6, 6, 12, WHITE);
      p.rect(cx - 16, 20, 32, 13, INK);
      p.rect(cx - 14, 22, 28, 9, '#54ecff');
      p.line(cx - 10, 23, cx - 2, 30, WHITE, 2);
      break;
    }
    case 3: {
      // THE NUCLEAR THRONE (terracotta chassis + twin giant neon-green tanks + central mega-cannon!)
      for (const side of [-1, 1]) {
        const tx = side < 0 ? cx - 36 : cx + 18;
        p.rect(tx, 14, 18, 48, '#68707a');
        p.rect(tx + 3, 20, 12, 36, '#84f418');
        p.rect(tx + 6, 20, 5, 34, '#d8ff80');
        p.rect(tx + 1, 28, 16, 4, '#3a404a');
        p.rect(tx + 1, 44, 16, 4, '#3a404a');
      }
      p.rect(cx - 20, 12, 40, 54, '#743836');
      p.rect(cx - 18, 12, 36, 4, '#98504c');
      p.rect(cx - 10, 16, 20, 16, '#a01f31');
      p.ellipse(cx, 44, 16, 15, '#3a404a');
      p.ellipse(cx, 44, 13, 12, '#6c747e');
      p.ellipse(cx, 44, 9, 8, '#58f028');
      p.ellipse(cx, 44, 5, 5, WHITE);
      break;
    }
    default: {
      // THRONE II
      for (const s of [-1, 1]) {
        p.poly([[cx + s * 8, 24], [cx + s * 38, 6], [cx + s * 34, 28], [cx + s * 8, 34]], '#3a4654');
        p.line(cx + s * 10, 26, cx + s * 34, 14, '#68f438', 3);
      }
      p.poly([[cx, 8], [cx + 16, 26], [cx + 12, 58], [cx, 66], [cx - 12, 58], [cx - 16, 26]], '#3a4654');
      p.ellipse(cx, 36, 11, 13, '#68f438');
      p.ellipse(cx, 36, 6, 8, WHITE);
      break;
    }
  }

  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}
