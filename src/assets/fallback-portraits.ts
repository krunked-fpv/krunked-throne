import type { DrawCtx } from './fallback-fonts';
import { PxCanvas } from './pixel-art';

// ============================================================================
// CRISP NATIVE 1x COMIC-STYLE NUCLEAR THRONE PORTRAITS (96x80, 28 frames),
// SPECIAL BUSTS (Rebel B Hooded, Headless Chicken), ROSTER CARDS (16x24, 18f
// + Locked), AND ALL 9 BOSS INTRO PORTRAITS (80x70).
// Bold #0d0a10 comic ink outlines, vibrant cel-shaded color blocks, transparent
// bust silhouettes so Pause, Campfire & Boss Intros look crisp!
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

const BUST_PALETTES_28: readonly BustPalette[] = [
  // 0: Fish A, 1: Fish B ("Big Bass": weathered green, tactical eyepatch, stubble, toothpick)
  { bgDeep: '#122820', bgMid: '#245440', skin: '#4eb870', skinHi: '#84e8a0', skinDark: '#2a7846', gear: '#8c5834', gearHi: '#ba8254', gearDark: '#54321a', eye: '#fff266', accent: '#f5cc38', isB: false },
  { bgDeep: '#102418', bgMid: '#204a30', skin: '#3e985a', skinHi: '#70cc88', skinDark: '#225e36', gear: '#4c5448', gearHi: '#76806e', gearDark: '#2c322a', eye: '#ffe852', accent: '#f4e6b8', isB: true },
  // 2: Crystal A, 3: Crystal B ("Cheddar": chunkier warm orange-amber crystal)
  { bgDeep: '#1c0c2c', bgMid: '#481e6c', skin: '#e058c8', skinHi: '#ffa4f0', skinDark: '#922482', gear: '#f484e4', gearHi: '#ffe0fc', gearDark: '#6c1860', eye: '#ffffff', accent: '#78f0ff', isB: false },
  { bgDeep: '#261808', bgMid: '#5e3c12', skin: '#f0a420', skinHi: '#ffe468', skinDark: '#a66010', gear: '#ffd440', gearHi: '#fff8c8', gearDark: '#7c4808', eye: '#70f4ff', accent: '#ffffff', isB: true },
  // 4: Eyes A, 5: Eyes B (blue-slate Eyes wearing classic red/blue 3D glasses!)
  { bgDeep: '#101a34', bgMid: '#263e78', skin: '#7888a8', skinHi: '#aab8d8', skinDark: '#485674', gear: '#3c4868', gearHi: '#64769c', gearDark: '#22283c', eye: '#ffffff', accent: '#80e8ff', isB: false },
  { bgDeep: '#121830', bgMid: '#283668', skin: '#7c8ca8', skinHi: '#aebee0', skinDark: '#4a5876', gear: '#3c4868', gearHi: '#64769c', gearDark: '#22283c', eye: '#ffffff', accent: '#ff2838', isB: true },
  // 6: Melting A, 7: Melting B ("Melted": slouched pale bone/skull & dripping flesh, NO obsidian!)
  { bgDeep: '#1e1216', bgMid: '#482830', skin: '#dcc8b4', skinHi: '#f8f0e4', skinDark: '#9c8672', gear: '#c0303a', gearHi: '#ec646e', gearDark: '#741620', eye: '#140e16', accent: '#e03c48', isB: false },
  { bgDeep: '#1c1416', bgMid: '#3e2c2e', skin: '#eee6da', skinHi: '#ffffff', skinDark: '#b2a290', gear: '#b82834', gearHi: '#e45c68', gearDark: '#6e1620', eye: '#140e16', accent: '#c8343c', isB: true },
  // 8: Plant A, 9: Plant B (Sonic homage: cobalt-blue spiky head, peach face/belly, red accents!)
  { bgDeep: '#0c2410', bgMid: '#205828', skin: '#58c838', skinHi: '#94f46c', skinDark: '#2e801e', gear: '#dc2c3a', gearHi: '#ff6c78', gearDark: '#861420', eye: '#ffe848', accent: '#ffffff', isB: false },
  { bgDeep: '#0c183c', bgMid: '#1c3a88', skin: '#2868e0', skinHi: '#64a4ff', skinDark: '#163890', gear: '#e42834', gearHi: '#ff6872', gearDark: '#8c141c', eye: '#ffffff', accent: '#f2c090', isB: true },
  // 10: Y.V. A, 11: Y.V. B (meditating levitating pure-white pyramid with closed eye!)
  { bgDeep: '#1c1430', bgMid: '#443070', skin: '#f4f2f8', skinHi: '#ffffff', skinDark: '#b6bac8', gear: '#f5c838', gearHi: '#fff494', gearDark: '#a87c14', eye: '#ffffff', accent: '#58f068', isB: false },
  { bgDeep: '#181834', bgMid: '#3a346e', skin: '#f6f6fa', skinHi: '#ffffff', skinDark: '#bcc0ce', gear: '#f5c838', gearHi: '#fff494', gearDark: '#a87c14', eye: INK, accent: '#fff494', isB: true },
  // 12: Steroids A (bald muscular + glasses), 13: Steroids B (tanned buff white muscle tank top + sweatband!)
  { bgDeep: '#182434', bgMid: '#2c4460', skin: '#e0a470', skinHi: '#f8d2a4', skinDark: '#b27044', gear: '#3a4c6e', gearHi: '#647ca8', gearDark: '#202c44', eye: '#ffffff', accent: '#f5c838', isB: false },
  { bgDeep: '#1c2432', bgMid: '#324460', skin: '#c87c48', skinHi: '#e8a872', skinDark: '#8c4c24', gear: '#f2f4f8', gearHi: '#ffffff', gearDark: '#bcc4d0', eye: '#ffffff', accent: '#dc2c38', isB: true },
  // 14: Robot A, 15: Robot B (Blue IDPD armor + white trim + cyan IDPD visor!)
  { bgDeep: '#102028', bgMid: '#244c5e', skin: '#7c8894', skinHi: '#b4c2ce', skinDark: '#4a5460', gear: '#424c58', gearHi: '#6c7a88', gearDark: '#242a32', eye: '#48e8ff', accent: '#e83c34', isB: false },
  { bgDeep: '#0c1836', bgMid: '#1e3c82', skin: '#3068c8', skinHi: '#6ca4f8', skinDark: '#1c3e84', gear: '#eef4fc', gearHi: '#ffffff', gearDark: '#9cb0c8', eye: '#68f4ff', accent: '#38a8ff', isB: true },
  // 16: Chicken A, 17: Chicken B (black feathers w/ visible yellow beak & red comb!)
  { bgDeep: '#281012', bgMid: '#642024', skin: '#f2f0ea', skinHi: '#ffffff', skinDark: '#b8b4ac', gear: '#e42c28', gearHi: '#ff6864', gearDark: '#8c1414', eye: INK, accent: '#f8bc28', isB: false },
  { bgDeep: '#121224', bgMid: '#2c2c50', skin: '#2a2836', skinHi: '#524c68', skinDark: '#14121c', gear: '#e42834', gearHi: '#ff6874', gearDark: '#84121e', eye: '#ffffff', accent: '#f8c428', isB: true },
  // 18: Rebel A, 19: Rebel B (fluffy tan/brown winter coat w/ cream fur trim!)
  { bgDeep: '#141c2c', bgMid: '#2c3e5e', skin: '#4a5a7a', skinHi: '#7488ae', skinDark: '#2a364e', gear: '#d6b682', gearHi: '#f6e2c0', gearDark: '#947448', eye: '#ffffff', accent: '#58b0ff', isB: false },
  { bgDeep: '#241a14', bgMid: '#503828', skin: '#a87a4e', skinHi: '#d4a878', skinDark: '#6c4a2c', gear: '#f0e6d2', gearHi: '#ffffff', gearDark: '#b8a890', eye: '#fff498', accent: '#7a482a', isB: true },
  // 20: Horror A, 21: Horror B (dark purple/magenta crackling portal-energy beast!)
  { bgDeep: '#08200c', bgMid: '#185c24', skin: '#58f050', skinHi: '#b4ff90', skinDark: '#249820', gear: '#98ff68', gearHi: '#f0ffe0', gearDark: '#166816', eye: '#ffffff', accent: '#e0ff58', isB: false },
  { bgDeep: '#1c082c', bgMid: '#481470', skin: '#8a2cd0', skinHi: '#e074ff', skinDark: '#441278', gear: '#c848ff', gearHi: '#ffc8ff', gearDark: '#2c0a4e', eye: '#ffffff', accent: '#ffa8ff', isB: true },
  // 22: Rogue A, 23: Rogue B (light/tactical white & tan ex-IDPD operative + sunglasses!)
  { bgDeep: '#0c1834', bgMid: '#1e3e80', skin: '#e0ac88', skinHi: '#f8d2b4', skinDark: '#a67454', gear: '#3c74c8', gearHi: '#70a6f4', gearDark: '#204488', eye: '#68ecff', accent: '#f5d038', isB: false },
  { bgDeep: '#182230', bgMid: '#364864', skin: '#e0ac88', skinHi: '#f8d2b4', skinDark: '#a67454', gear: '#dce4ec', gearHi: '#ffffff', gearDark: '#96a4b4', eye: '#68ecff', accent: '#c8a474', isB: true },
  // 24: Skeleton A, 25: Skeleton B
  { bgDeep: '#102216', bgMid: '#20482a', skin: '#ece6d8', skinHi: '#ffffff', skinDark: '#a89e8c', gear: '#58ff68', gearHi: '#d8ffc0', gearDark: '#267c30', eye: INK, accent: '#78ff78', isB: false },
  { bgDeep: '#10202c', bgMid: '#204258', skin: '#dce8f0', skinHi: '#ffffff', skinDark: '#96aab8', gear: '#58f0ff', gearHi: '#d4fcff', gearDark: '#247488', eye: '#58f0ff', accent: '#78f8ff', isB: true },
  // 26: Frog A, 27: Frog B
  { bgDeep: '#0e2810', bgMid: '#245c22', skin: '#5cd038', skinHi: '#9cf864', skinDark: '#2e8020', gear: '#b8ff48', gearHi: '#ecffb8', gearDark: '#24681a', eye: '#ffe838', accent: '#78ff58', isB: false },
  { bgDeep: '#142a0e', bgMid: '#2e641e', skin: '#74dc3c', skinHi: '#b4ff6c', skinDark: '#388820', gear: '#d4ff58', gearHi: '#f4ffc4', gearDark: '#2c7218', eye: '#ffe838', accent: '#a8ff60', isB: true },
];

/**
 * Draws bold crisp 1x cel-shaded Nuclear Throne Mutant Bust Portrait (96x80, orig 48,40, 28 frames).
 * Uses a TRANSPARENT background with thick 2px comic ink outline so it works seamlessly
 * on BOTH the Campfire box AND the Pause screen!
 */
export function drawMutantBigPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const idx = ((frame % BUST_PALETTES_28.length) + BUST_PALETTES_28.length) % BUST_PALETTES_28.length;
  const pal = BUST_PALETTES_28[idx]!;
  const mutantIdx = Math.floor(idx / 2);
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.44);

  switch (mutantIdx) {
    case 0: {
      // FISH A & FISH B ("Big Bass": eyepatch + stubble + toothpick, NO red pirate bandana!)
      p.line(cx + 14, 58, cx + 34, 12, '#643c22', 5);
      p.line(cx + 15, 57, cx + 33, 13, '#98623c', 2);
      p.rect(cx + 28, 7, 9, 10, '#58341c');
      // Broad jacket shoulders & collar
      p.poly([[cx - 34, h - 1], [cx - 28, 54], [cx + 16, 52], [cx + 34, 60], [cx + 38, h - 1]], pal.gear);
      p.poly([[cx - 32, h - 1], [cx - 26, 55], [cx - 8, 53], [cx - 4, h - 1]], pal.gearHi);
      p.poly([[cx + 10, 56], [cx + 32, 62], [cx + 36, h - 1], [cx + 12, h - 1]], pal.gearDark);
      p.rect(cx - 18, 63, 7, 7, '#f5cc38');
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
        // Grizzled Big Bass: diagonal tactical eyepatch strap + black eyepatch
        p.line(cx - 18, 25, cx + 16, 38, '#1e1c24', 3);
        p.ellipse(cx - 6, 34, 6.5, 5.5, INK);
        p.ellipse(cx - 7, 33, 3.5, 2.5, '#2b2834');
        // Grizzled jawline stubble
        for (const [sx, sy] of [[-10, 48], [-6, 50], [-1, 50], [4, 49], [9, 48], [-8, 45], [12, 46]] as const) {
          p.rect(cx + sx, sy, 2, 1, '#1a3a24');
        }
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
      // Badass crooked smirk + fangs (and toothpick on B!)
      p.line(cx - 10, 46, cx + 15, 43, INK, 3);
      p.rect(cx - 5, 43, 3, 3, CREAM);
      p.rect(cx + 8, 42, 3, 3, CREAM);
      if (pal.isB) {
        p.line(cx + 11, 44, cx + 26, 38, '#f4e6b8', 2);
        p.line(cx + 12, 43, cx + 25, 38, WHITE, 1);
      }
      break;
    }

    case 1: {
      // CRYSTAL A & CRYSTAL B ("Cheddar": chunkier, blockier warm amber crystal monolith!)
      const extraW = pal.isB ? 4 : 0;
      p.poly([[cx - 34 - extraW, h - 1], [cx - 28 - extraW, 48], [cx + 28 + extraW, 50], [cx + 36 + extraW, h - 1]], pal.skinDark);
      p.poly([[cx - 32 - extraW, h - 1], [cx - 26 - extraW, 50], [cx - 4, 50], [cx - 10, h - 1]], pal.skinHi);
      // Shoulder spires
      p.poly([[cx - 26, 56], [cx - 36, 20], [cx - 16, 34], [cx - 14, 56]], pal.skin);
      p.poly([[cx + 26, 56], [cx + 37, 24], [cx + 18, 36], [cx + 16, 56]], pal.skinDark);
      // Faceted monolith head (blockier/chunkier crown on B!)
      if (pal.isB) {
        p.poly([[cx - 8, 6], [cx + 8, 6], [cx + 22, 24], [cx + 18, 54], [cx - 18, 54], [cx - 22, 24]], pal.skin);
        p.poly([[cx - 8, 7], [cx, 7], [cx - 1, 53], [cx - 16, 53], [cx - 20, 24]], pal.skinHi);
        p.poly([[cx - 7, 8], [cx - 1, 8], [cx - 1, 24], [cx - 14, 24]], WHITE);
        p.poly([[cx, 7], [cx + 8, 7], [cx + 21, 24], [cx + 17, 53], [cx, 53]], pal.skinDark);
        p.line(cx, 7, cx, 53, WHITE, 1);
      } else {
        p.poly([[cx, 6], [cx + 18, 24], [cx + 14, 54], [cx - 14, 54], [cx - 18, 24]], pal.skin);
        p.poly([[cx, 7], [cx - 17, 24], [cx - 12, 53], [cx, 53]], pal.skinHi);
        p.poly([[cx, 7], [cx - 10, 24], [cx, 28]], WHITE);
        p.poly([[cx, 7], [cx + 17, 24], [cx + 12, 53], [cx, 53]], pal.skinDark);
        p.line(cx, 7, cx, 53, WHITE, 1);
      }
      // Glowing eyes
      p.poly([[cx - 11, 32], [cx - 2, 35], [cx - 3, 40], [cx - 10, 38]], INK);
      p.poly([[cx + 11, 32], [cx + 2, 35], [cx + 3, 40], [cx + 10, 38]], INK);
      p.rect(cx - 9, 34, 5, 3, pal.eye);
      p.rect(cx + 4, 34, 5, 3, pal.eye);
      break;
    }

    case 2: {
      // EYES A & EYES B (blue-slate Eyes wearing classic red/blue 3D glasses!)
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
      if (pal.isB) {
        // Classic white cardboard red/blue 3D glasses over Eyes's main eyes!
        p.rect(cx - 22, 24, 44, 15, INK);
        p.rect(cx - 20, 25, 40, 13, '#f2f4f8');
        p.rect(cx - 19, 25, 38, 2, WHITE);
        // Red left lens & cyan-blue right lens with comic sheen!
        p.rect(cx - 17, 27, 14, 9, '#ff2838');
        p.line(cx - 15, 28, cx - 10, 34, '#ff9ca4', 2);
        p.rect(cx + 3, 27, 14, 9, '#28a8ff');
        p.line(cx + 5, 28, cx + 10, 34, '#a8ecff', 2);
        // Nose bridge notch
        p.poly([[cx - 3, 38], [cx, 33], [cx + 3, 38]], pal.skin);
      }
      break;
    }

    case 3: {
      // MELTING A & MELTING B ("Melted": slouched hunched paler exposed bone/skull & dripping flesh!)
      const slumpY = pal.isB ? 4 : 0;
      p.poly([[cx - 32, h - 1], [cx - 24, 56], [cx + 24, 56], [cx + 32, h - 1]], pal.gearDark);
      p.rect(cx - 12, 56, 24, 24, INK);
      p.rect(cx - 1, 58, 3, 20, pal.skin);
      for (const ry of [61, 67, 73]) {
        p.rect(cx - 11, ry, 9, 3, pal.skinHi);
        p.rect(cx + 2, ry, 9, 3, pal.skin);
      }
      // Dripping pale cranium (slouched + extra melted pale ooze & exposed bone on B!)
      p.ellipse(cx, 28 + slumpY, 17 + (pal.isB ? 2 : 0), 15, pal.skin);
      p.ellipse(cx - 4, 22 + slumpY, 10, 8, pal.skinHi);
      p.rect(cx - 18, 34 + slumpY, 7, 22, pal.skin);
      p.rect(cx + 12, 34 + slumpY, 6, 18, pal.skinDark);
      p.rect(cx - 10, 38 + slumpY, 20, 14, pal.skin);
      if (pal.isB) {
        // Extra dripping melted flesh tendrils hanging down toward ribs
        p.rect(cx - 14, 50, 4, 10, pal.skinDark);
        p.rect(cx + 9, 48, 4, 9, pal.gear);
        p.ellipse(cx - 12, 60, 2.5, 2.5, pal.skinHi);
      }
      // Deep hollow dark sockets (NO lava fire on B!)
      p.ellipse(cx - 7, 30 + slumpY, 6, 6.5, INK);
      p.ellipse(cx + 8, 29 + slumpY, 5, 5.5, INK);
      // Clenched skull teeth
      p.rect(cx - 8, 42 + slumpY, 16, 6, INK);
      for (let t = -7; t <= 5; t += 3) {
        p.rect(cx + t, 43 + slumpY, 2, 4, WHITE);
      }
      break;
    }

    case 4: {
      // PLANT A (green/crimson flytrap) & PLANT B (Sonic homage: cobalt-blue spiky head, peach snout/belly, red accents!)
      if (pal.isB) {
        // Blue torso + peach belly + red collar leaves
        p.rect(cx - 12, 50, 24, 30, pal.skin);
        p.ellipse(cx, 66, 10, 12, pal.accent); // peach Sonic belly
        p.poly([[cx - 10, 56], [cx - 32, 48], [cx - 26, 64], [cx - 10, 66]], pal.gear);
        p.poly([[cx + 10, 56], [cx + 32, 48], [cx + 26, 64], [cx + 10, 66]], pal.gearDark);
        // Swept-back cobalt-blue spiky Sonic head quills!
        p.poly([[cx - 6, 12], [cx - 38, 12], [cx - 18, 28]], pal.skin);
        p.poly([[cx - 8, 13], [cx - 34, 14], [cx - 16, 22]], pal.skinHi);
        p.poly([[cx - 10, 24], [cx - 40, 30], [cx - 18, 40]], pal.skinDark);
        p.poly([[cx - 8, 36], [cx - 34, 46], [cx - 14, 50]], pal.skinDark);
        // Round cobalt-blue head + peach snout/muzzle + sharp white Sonic eyes!
        p.ellipse(cx + 4, 32, 20, 19, pal.skin);
        p.ellipse(cx, 24, 13, 10, pal.skinHi);
        p.ellipse(cx + 8, 42, 16, 10, pal.accent); // peach muzzle
        p.ellipse(cx + 22, 38, 4, 3, INK); // nose
        // Fierce Sonic eyes
        p.ellipse(cx + 2, 28, 6, 8, WHITE);
        p.ellipse(cx + 13, 28, 5, 7, WHITE);
        p.rect(cx + 4, 27, 3, 5, INK);
        p.rect(cx + 14, 27, 3, 5, INK);
        p.set(cx + 4, 27, WHITE);
        p.set(cx + 14, 27, WHITE);
        p.line(cx - 5, 20, cx + 19, 21, pal.skinDark, 3); // fierce brow
        // Cocky grin
        p.bezier(cx - 2, 45, cx + 8, 49, cx + 17, 44, INK, 2);
      } else {
        p.rect(cx - 9, 48, 18, 32, pal.skin);
        p.poly([[cx - 8, 60], [cx - 32, 50], [cx - 26, 68], [cx - 8, 72]], pal.skin);
        p.poly([[cx + 8, 60], [cx + 32, 50], [cx + 26, 68], [cx + 8, 72]], pal.skinDark);
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
      }
      break;
    }

    case 5: {
      // Y.V. A (white pyramid + open eye) & Y.V. B (meditating floating pure-white pyramid + closed eye!)
      p.poly([[cx - 32, h - 1], [cx - 24, 58], [cx + 26, 58], [cx + 34, h - 1]], '#2a2438');
      p.line(cx - 18, 58, cx, 72, pal.gear, 4);
      p.line(cx + 18, 58, cx, 72, pal.gear, 4);
      p.ellipse(cx, 70, 6, 6, pal.gearHi);
      // Giant sharp pure-white pyramid head
      p.poly([[cx + 2, 6], [cx - 28, 58], [cx + 30, 58]], pal.skin);
      p.poly([[cx + 2, 7], [cx - 27, 57], [cx + 4, 57]], pal.skinHi);
      p.poly([[cx + 2, 7], [cx + 4, 57], [cx + 29, 57]], pal.skinDark);
      p.poly([[cx + 2, 6], [cx - 5, 18], [cx + 9, 18]], pal.gearHi);
      if (pal.isB) {
        // Serene closed meditating curved eye + radiant golden zen aura sparkles!
        p.bezier(cx - 12, 35, cx + 2, 43, cx + 16, 35, INK, 3);
        p.bezier(cx - 11, 34, cx + 2, 40, cx + 15, 34, pal.skinDark, 1);
        for (const [gx, gy] of [[-24, 18], [28, 20], [-28, 42], [32, 40]] as const) {
          p.rect(cx + gx - 2, gy, 5, 1, pal.gearHi);
          p.rect(cx + gx, gy - 2, 1, 5, pal.gearHi);
        }
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
      // STEROIDS A (shirtless + glasses) & STEROIDS B (deeply tanned buff white muscle tank top + sweatband!)
      const skinHi = pal.isB ? '#e8a872' : '#f6c896';
      const skinMid = pal.isB ? '#c87c48' : '#e09a62';
      const skinShade = pal.isB ? '#8c4c24' : '#ac6234';
      const skinDeep = pal.isB ? '#5a2c12' : '#6e3a1c';
      const scx = cx - 4;

      // 1. Blue denim jeans
      p.poly([[scx - 24, 65], [scx + 19, 64], [scx + 21, h - 2], [scx - 28, h - 2]], '#2c509e');
      p.poly([[scx - 22, 66], [scx - 4, 66], [scx - 8, h - 2], [scx - 25, h - 2]], '#4a76cc');
      p.poly([[scx + 6, 66], [scx + 19, 65], [scx + 20, h - 2], [scx + 6, h - 2]], '#1c3266');
      p.line(scx - 10, 68, scx - 23, 76, INK, 2);
      p.line(scx + 8, 69, scx + 16, 76, INK, 2);

      // 2. Massive towering sloped trapezius & shoulder mass
      p.poly([[scx - 33, 56], [scx - 32, 30], [scx - 14, 18], [scx + 16, 20], [scx + 26, 34], [scx + 20, 62], [scx - 24, 62]], skinMid);
      p.ellipse(scx - 16, 26, 13, 8, skinHi);
      p.ellipse(scx + 14, 29, 10, 7, skinShade);

      if (pal.isB) {
        // B-SKIN: Crisp white athletic muscle tank top stretching over huge muscular torso!
        p.poly([[scx - 22, 34], [scx - 14, 22], [scx - 7, 22], [scx - 7, 36], [scx + 5, 36], [scx + 5, 22], [scx + 12, 22], [scx + 20, 34], [scx + 19, 63], [scx - 23, 63]], '#eef2f8');
        p.poly([[scx - 21, 35], [scx - 12, 24], [scx - 8, 36], [scx - 2, 61], [scx - 22, 61]], WHITE);
        p.poly([[scx + 7, 36], [scx + 19, 35], [scx + 18, 62], [scx + 6, 62]], '#bcc4d4');
        // Comic muscle fabric fold lines under pecs
        p.bezier(scx - 20, 47, scx - 10, 52, scx - 1, 48, '#8a94a8', 2);
        p.bezier(scx - 1, 48, scx + 9, 52, scx + 18, 46, '#8a94a8', 2);
        p.line(scx - 14, 22, scx - 7, 36, INK, 1);
        p.line(scx + 12, 22, scx + 5, 36, INK, 1);
      } else {
        // A-SKIN: Sculpted shirtless pecs & abs
        p.ellipse(scx - 1, 51, 21, 13, skinShade);
        p.ellipse(scx + 11, 51, 11, 11, skinDeep);
        p.ellipse(scx - 11, 41, 13, 10, skinMid);
        p.ellipse(scx - 14, 37, 9, 5.5, skinHi);
        p.ellipse(scx - 8, 47, 10, 4, skinShade);
        p.ellipse(scx + 9, 41, 12, 10, skinMid);
        p.ellipse(scx + 6, 37, 8, 5, skinHi);
        p.ellipse(scx + 11, 47, 9, 4, skinShade);
        p.bezier(scx - 23, 47, scx - 12, 53, scx - 1, 49, INK, 2);
        p.bezier(scx - 1, 49, scx + 10, 53, scx + 20, 46, INK, 2);
        p.line(scx - 1, 35, scx - 1, 50, INK, 2);
        p.ellipse(scx - 8, 55, 6, 3.8, skinMid);
        p.ellipse(scx - 9, 54, 3.5, 2, skinHi);
        p.ellipse(scx + 6, 55, 6, 3.8, skinMid);
        p.ellipse(scx + 5, 54, 3.5, 2, skinHi);
        p.ellipse(scx - 7, 60, 5, 3, skinShade);
        p.ellipse(scx + 5, 60, 5, 3, skinShade);
        p.line(scx - 1, 51, scx - 1, 61, INK, 1);
        p.line(scx - 14, 58, scx + 12, 58, skinDeep, 1);
      }

      // Leather belt & 3-point GOLD CROWN BELT BUCKLE
      p.rect(scx - 23, 62, 42, 5, '#4c2e1c');
      p.line(scx - 23, 62, scx + 19, 62, INK, 1);
      p.line(scx - 23, 67, scx + 19, 67, INK, 1);
      p.poly([[scx - 8, 67], [scx - 9, 58], [scx - 4, 62], [scx, 56], [scx + 4, 62], [scx + 9, 58], [scx + 8, 67]], INK);
      p.poly([[scx - 7, 66], [scx - 7, 60], [scx - 3, 63], [scx, 58], [scx + 3, 63], [scx + 7, 60], [scx + 7, 66]], '#f0bc2c');
      p.poly([[scx - 6, 63], [scx - 6, 60], [scx - 2, 63], [scx, 58], [scx + 2, 63]], '#fff498');

      // 4. Huge bulging bare muscular arms + flexed right arm holding REVOLVER!
      p.ellipse(scx - 28, 43, 12, 15, skinMid);
      p.ellipse(scx - 31, 37, 7, 8, skinHi);
      p.ellipse(scx - 25, 52, 9, 7, skinShade);
      p.bezier(scx - 24, 32, scx - 19, 42, scx - 22, 54, INK, 2);
      p.ellipse(scx + 23, 39, 10, 11, skinMid);
      p.ellipse(scx + 22, 35, 5.5, 5, skinHi);
      p.ellipse(scx + 26, 44, 8, 6, skinShade);
      p.line(scx + 25, 45, scx + 35, 34, skinDeep, 13);
      p.line(scx + 24, 44, scx + 34, 34, skinMid, 10);
      p.line(scx + 23, 42, scx + 32, 34, skinHi, 4);
      p.bezier(scx + 19, 43, scx + 25, 48, scx + 33, 42, INK, 2);

      // 5. CHUNKY HEAVY-INKED STEEL REVOLVER HELD HIGH
      p.poly([[scx + 34, 30], [scx + 41, 30], [scx + 43, 42], [scx + 36, 42]], '#5c3218');
      p.poly([[scx + 35, 31], [scx + 38, 31], [scx + 39, 40], [scx + 36, 40]], '#8c522c');
      p.line(scx + 34, 30, scx + 36, 42, INK, 1);
      p.poly([[scx + 26, 25], [scx + 52, 15], [scx + 55, 22], [scx + 31, 32]], '#4e5866');
      p.poly([[scx + 28, 24], [scx + 51, 16], [scx + 52, 18], [scx + 29, 26]], '#9aa6b8');
      p.poly([[scx + 31, 29], [scx + 54, 20], [scx + 55, 22], [scx + 32, 32]], '#2c323c');
      p.line(scx + 26, 25, scx + 52, 15, INK, 2);
      p.line(scx + 31, 32, scx + 55, 22, INK, 2);
      p.ellipse(scx + 53, 18, 2.5, 3.5, '#2a303a');
      p.ellipse(scx + 53, 18, 1.4, 2.2, INK);
      p.rect(scx + 32, 23, 9, 8, '#2c323c');
      p.rect(scx + 33, 24, 2, 6, '#7c8898');
      p.rect(scx + 37, 24, 2, 6, '#626c7a');
      p.rect(scx + 32, 23, 9, 1, INK);
      p.rect(scx + 32, 30, 9, 1, INK);
      p.ellipse(scx + 37, 35, 6, 6, skinMid);
      p.ellipse(scx + 35, 33, 3.5, 3, skinHi);
      p.ellipse(scx + 39, 38, 4, 3, skinShade);
      p.line(scx + 33, 33, scx + 41, 33, INK, 1);
      p.line(scx + 34, 36, scx + 42, 36, INK, 1);

      // 6. Strong square jaw, bald dome & clenched grin
      p.ellipse(scx - 1, 24, 15, 12, skinMid);
      p.ellipse(scx - 6, 19, 9, 6, skinHi);
      p.ellipse(scx + 7, 27, 8, 6, skinShade);
      p.ellipse(scx - 2, 16, 13, 8, skinMid);
      p.ellipse(scx - 6, 13, 8, 4, skinHi);
      p.set(scx - 8, 12, WHITE);
      p.bezier(scx - 14, 28, scx - 1, 36, scx + 12, 28, INK, 2);
      p.bezier(scx - 10, 28, scx - 1, 31, scx + 8, 28, INK, 4);
      p.bezier(scx - 9, 28, scx - 1, 30, scx + 7, 28, CREAM, 2);
      p.set(scx - 5, 29, INK);
      p.set(scx - 1, 29, INK);
      p.set(scx + 3, 29, INK);

      if (pal.isB) {
        // B-SKIN: Crisp athletic white/crimson sweatband across forehead (NO cowboy hat!)
        p.rect(scx - 16, 12, 30, 6, INK);
        p.rect(scx - 15, 13, 28, 4, WHITE);
        p.rect(scx - 15, 14, 28, 2, '#dc2c38');
        // Fierce furrowed brows + compact spectacles
        p.ellipse(scx - 6, 22, 4.2, 3.6, INK);
        p.ellipse(scx + 5, 22, 4.2, 3.6, INK);
        p.rect(scx - 2, 21, 3, 2, INK);
        p.ellipse(scx - 6, 22, 2.7, 2.2, '#9ab8cc');
        p.ellipse(scx + 5, 22, 2.7, 2.2, '#9ab8cc');
        p.rect(scx - 6, 22, 2, 2, INK);
        p.rect(scx + 5, 22, 2, 2, INK);
        p.set(scx - 8, 21, '#e8f8ff');
        p.set(scx + 3, 21, '#e8f8ff');
      } else {
        // A-SKIN: Heavy stern comic brow + compact spectacles
        p.bezier(scx - 12, 18, scx - 1, 21, scx + 10, 18, skinDeep, 3);
        p.bezier(scx - 12, 18, scx - 1, 21, scx + 10, 18, INK, 2);
        p.ellipse(scx - 6, 22, 4.2, 3.6, INK);
        p.ellipse(scx + 5, 22, 4.2, 3.6, INK);
        p.rect(scx - 2, 21, 3, 2, INK);
        p.ellipse(scx - 6, 22, 2.7, 2.2, '#9ab8cc');
        p.ellipse(scx + 5, 22, 2.7, 2.2, '#9ab8cc');
        p.rect(scx - 6, 22, 2, 2, INK);
        p.rect(scx + 5, 22, 2, 2, INK);
        p.set(scx - 8, 21, '#e8f8ff');
        p.set(scx + 3, 21, '#e8f8ff');
      }
      break;
    }

    case 7: {
      // ROBOT A (gunmetal) & ROBOT B (Cobalt-blue I.D.P.D. armor + white pauldrons & crest + cyan visor!)
      p.poly([[cx - 32, h - 1], [cx - 28, 54], [cx + 28, 54], [cx + 32, h - 1]], pal.gear);
      p.poly([[cx - 26, h - 1], [cx - 24, 57], [cx + 24, 57], [cx + 26, h - 1]], pal.skin);
      p.rect(cx - 24, 57, 48, 3, pal.isB ? WHITE : pal.skinHi);
      p.rect(cx - 14, 62, 28, 12, INK);
      for (let g = 0; g < 4; g++) p.rect(cx - 11 + g * 6, 64, 4, 8, pal.accent);
      p.line(cx - 16, 58, cx - 16, 76, INK, 1);
      p.line(cx + 16, 58, cx + 16, 76, INK, 1);
      p.line(cx + 12, 18, cx + 18, 5, pal.skinHi, 2);
      p.ellipse(cx + 18, 5, 3.5, 3.5, pal.isB ? WHITE : pal.accent);
      // Chunky beveled CRT head + side ear-bolts (white IDPD crest on B!)
      p.rect(cx - 26, 28, 5, 12, pal.gear);
      p.rect(cx + 21, 28, 5, 12, pal.gearDark);
      p.rect(cx - 22, 16, 44, 38, pal.skin);
      p.rect(cx - 22, 16, 44, 5, pal.skinHi);
      p.rect(cx - 22, 49, 44, 5, pal.skinDark);
      if (pal.isB) {
        p.rect(cx - 4, 12, 8, 6, WHITE);
      }
      p.rect(cx - 17, 22, 34, 23, INK);
      p.rect(cx - 15, 24, 30, 19, '#12222c');
      p.rect(cx - 12, 28, 9, 8, pal.eye);
      p.rect(cx + 3, 28, 9, 8, pal.eye);
      p.rect(cx - 11, 29, 5, 3, WHITE);
      p.rect(cx + 4, 29, 5, 3, WHITE);
      break;
    }

    case 8: {
      // CHICKEN A (white) & CHICKEN B (black feathers WITH visible golden beak & crimson comb!)
      p.line(cx + 10, 50, cx + 34, 12, '#4a5260', 5);
      p.line(cx + 11, 49, cx + 33, 13, pal.gear, 3);
      p.rect(cx - 11, 44, 22, 16, pal.skin);
      p.ellipse(cx, 69, 29, 17, pal.skin);
      p.ellipse(cx - 6, 65, 16, 9, pal.skinHi);
      p.poly([[cx - 22, 58], [cx, 72], [cx + 22, 58], [cx + 18, h - 1], [cx - 18, h - 1]], pal.gearDark);
      p.line(cx - 21, 58, cx, 71, INK, 2);
      p.line(cx + 21, 58, cx, 71, INK, 2);
      // Towering crimson comb (visible on BOTH A & B!)
      p.poly([[cx - 10, 22], [cx - 12, 7], [cx - 4, 15], [cx, 5], [cx + 6, 14], [cx + 12, 8], [cx + 10, 22]], pal.gear);
      p.ellipse(cx, 35, 17, 16, pal.skin);
      p.ellipse(cx - 4, 30, 10, 9, pal.skinHi);
      p.ellipse(cx + 6, 42, 10, 7, pal.skinDark);
      // Crimson headband & trailing tails
      p.rect(cx - 18, 24, 36, 7, pal.gear);
      p.rect(cx - 16, 25, 32, 2, pal.gearHi);
      p.line(cx - 18, 31, cx + 18, 31, INK, 1);
      p.poly([[cx + 16, 25], [cx + 36, 18], [cx + 38, 25], [cx + 16, 30]], pal.gear);
      // Hooked golden beak & crimson wattle (clearly visible on BOTH A & B!)
      p.ellipse(cx - 10, 44, 4, 4, pal.gear);
      p.poly([[cx - 6, 34], [cx - 25, 39], [cx - 14, 44], [cx - 5, 42]], pal.accent);
      p.poly([[cx - 6, 34], [cx - 23, 39], [cx - 6, 38]], '#fff498');
      p.line(cx - 22, 40, cx - 6, 40, INK, 1);
      p.rect(cx - 7, 32, 5, 4, INK);
      p.set(cx - 5, 33, pal.isB ? '#ffe878' : WHITE);
      break;
    }

    case 9: {
      // REBEL A (slate-blue hood) & REBEL B (fluffy tan/brown winter coat w/ thick cream fur collar!)
      p.poly([[cx - 34, h - 1], [cx - 26, 52], [cx + 26, 52], [cx + 34, h - 1]], pal.skin);
      p.poly([[cx - 32, h - 1], [cx - 24, 54], [cx - 4, 54], [cx - 8, h - 1]], pal.skinHi);
      p.poly([[cx + 6, 54], [cx + 25, 54], [cx + 32, h - 1], [cx + 10, h - 1]], pal.skinDark);
      p.poly([[cx, 6], [cx + 21, 16], [cx + 25, 52], [cx - 25, 52], [cx - 21, 16]], pal.skin);
      p.poly([[cx, 7], [cx - 19, 17], [cx - 22, 44], [cx - 8, 36]], pal.skinHi);
      if (pal.isB) {
        // Thick fluffy cream-white winter fur trim around hood opening & plush collar!
        for (const [fx, fy] of [[-18, 22], [-19, 32], [-17, 42], [-10, 14], [0, 11], [10, 14], [18, 22], [19, 32], [17, 42]] as const) {
          p.ellipse(cx + fx, fy, 6, 6, pal.gear);
          p.ellipse(cx + fx - 1, fy - 1, 3, 3, pal.gearHi);
        }
        p.ellipse(cx, 33, 14, 15, INK);
        // Cozy brown winter scarf over cream fur collar
        p.poly([[cx - 22, 44], [cx + 22, 42], [cx + 24, 58], [cx - 20, 60]], pal.accent);
        p.poly([[cx - 14, 56], [cx - 3, 56], [cx - 7, 74], [cx - 19, 71]], pal.accent);
        p.bezier(cx - 20, 50, cx, 54, cx + 21, 48, INK, 2);
      } else {
        p.ellipse(cx, 33, 15, 16, INK);
        p.poly([[cx - 21, 41], [cx + 21, 39], [cx + 23, 56], [cx - 19, 58]], pal.gear);
        p.poly([[cx - 20, 42], [cx + 18, 40], [cx + 16, 46], [cx - 18, 47]], pal.gearHi);
        p.poly([[cx - 12, 54], [cx - 2, 54], [cx - 6, 74], [cx - 18, 71]], pal.gear);
        p.bezier(cx - 19, 48, cx, 52, cx + 20, 46, INK, 2);
        p.line(cx - 19, 57, cx + 22, 55, INK, 2);
      }
      p.rect(cx - 10, 30, 7, 4, pal.eye);
      p.rect(cx + 3, 30, 7, 4, pal.eye);
      break;
    }

    case 10: {
      // HORROR A (neon-green rad beast) & HORROR B (dark purple/magenta crackling portal-energy beast!)
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
      if (pal.isB) {
        // Extra crackling violet portal arcs!
        p.line(cx - 28, 22, cx - 20, 32, WHITE, 1);
        p.line(cx + 28, 24, cx + 19, 34, WHITE, 1);
      }
      break;
    }

    case 11: {
      // ROGUE A (cobalt IDPD) & ROGUE B (light white/tan tactical ex-IDPD operative + sunglasses!)
      const hair = '#3a2224';
      const hairHi = '#643c40';
      p.poly([[cx - 34, h - 1], [cx - 27, 52], [cx + 27, 52], [cx + 34, h - 1]], pal.gear);
      p.poly([[cx - 32, h - 1], [cx - 25, 54], [cx - 8, 54], [cx - 10, h - 1]], pal.gearHi);
      p.poly([[cx + 10, 54], [cx + 26, 54], [cx + 32, h - 1], [cx + 12, h - 1]], pal.gearDark);
      if (pal.isB) {
        // Blue ex-IDPD shoulder patches & tan tactical webbing
        p.rect(cx - 27, 54, 10, 12, '#3c74c8');
        p.rect(cx + 17, 54, 10, 12, '#3c74c8');
      }
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
      p.rect(cx + 12, 31, 5, 9, '#7a8898');
      p.rect(cx + 14, 33, 2, 5, pal.eye);
      if (pal.isB) {
        // Cool dark tactical sunglasses with sharp cyan lens glints!
        p.rect(cx - 13, 30, 26, 7, INK);
        p.rect(cx - 11, 31, 9, 5, '#1c2638');
        p.rect(cx + 2, 31, 9, 5, '#1c2638');
        p.line(cx - 10, 32, cx - 6, 35, '#68ecff', 2);
        p.line(cx + 3, 32, cx + 7, 35, '#68ecff', 2);
      } else {
        p.line(cx - 10, 30, cx - 2, 32, INK, 2);
        p.line(cx + 10, 30, cx + 2, 32, INK, 2);
        p.rect(cx - 9, 32, 6, 4, INK);
        p.rect(cx + 3, 32, 6, 4, INK);
        p.rect(cx - 8, 33, 4, 2, WHITE);
        p.rect(cx + 4, 33, 4, 2, WHITE);
        p.rect(cx - 6, 33, 2, 2, pal.eye);
        p.rect(cx + 5, 33, 2, 2, pal.eye);
      }
      p.line(cx - 4, 44, cx + 5, 42, INK, 2);
      break;
    }

    case 12: {
      // SKELETON (Frames 24-25) — Grinning hollow-eyed ivory skull + exposed ribcage & faint necro glow!
      // Glowing emerald/cyan necro wisps behind shoulders
      p.ellipse(cx - 26, 56, 7, 9, pal.gearDark);
      p.ellipse(cx + 26, 54, 7, 9, pal.gearDark);
      p.ellipse(cx - 26, 55, 4, 6, pal.gear);
      p.ellipse(cx + 26, 53, 4, 6, pal.gear);
      // Exposed bone clavicles, spine & curved ribcage!
      p.rect(cx - 4, 48, 8, 31, pal.skinDark);
      p.rect(cx - 2, 48, 4, 31, pal.skin);
      p.line(cx - 26, 56, cx + 26, 56, pal.skin, 4);
      p.line(cx - 24, 55, cx + 24, 55, pal.skinHi, 2);
      for (const ry of [62, 69, 75]) {
        p.rect(cx - 20, ry, 15, 4, pal.skin);
        p.rect(cx - 19, ry, 13, 1, pal.skinHi);
        p.rect(cx + 5, ry, 15, 4, pal.skin);
        p.rect(cx + 6, ry, 13, 1, pal.skinHi);
      }
      // Crisp sculpted ivory cranium & cheekbones
      p.ellipse(cx, 28, 19, 17, pal.skin);
      p.ellipse(cx - 5, 20, 11, 9, pal.skinHi);
      p.ellipse(cx + 8, 34, 11, 9, pal.skinDark);
      p.rect(cx - 13, 38, 26, 13, pal.skin);
      p.rect(cx - 11, 39, 22, 4, pal.skinHi);
      // Deep hollow black eye sockets + inverted heart nasal cavity
      p.ellipse(cx - 8, 29, 6, 6.5, INK);
      p.ellipse(cx + 8, 29, 6, 6.5, INK);
      if (pal.isB) {
        p.ellipse(cx - 8, 29, 2.5, 2.5, pal.gear);
        p.ellipse(cx + 8, 29, 2.5, 2.5, pal.gear);
      }
      p.poly([[cx, 33], [cx - 3, 39], [cx + 3, 39]], INK);
      // Grinning skeletal teeth
      p.rect(cx - 11, 43, 22, 6, INK);
      for (let t = -9; t <= 8; t += 4) {
        p.rect(cx + t, 44, 3, 4, WHITE);
      }
      break;
    }

    default: {
      // FROG (Frames 26-27) — Plump lime-green mutant toad bust w/ huge yellow eyes & toxic bubbles!
      // Floating glowing green toxic bubbles around Frog
      p.ellipse(cx - 31, 22, 6, 6, pal.gearDark);
      p.ellipse(cx - 32, 21, 4, 4, pal.gear);
      p.set(cx - 33, 20, WHITE);
      p.ellipse(cx + 34, 30, 5, 5, pal.gearDark);
      p.ellipse(cx + 33, 29, 3, 3, pal.gear);
      p.set(cx + 32, 28, WHITE);
      // Broad plump frog shoulders & pale-lime belly
      p.ellipse(cx, 66, 33, 20, pal.skin);
      p.ellipse(cx - 8, 60, 18, 10, pal.skinHi);
      p.ellipse(cx, 70, 20, 13, pal.gear);
      p.ellipse(cx - 3, 67, 13, 7, pal.gearHi);
      // Big round toad head & cheek pouches
      p.ellipse(cx, 38, 24, 17, pal.skin);
      p.ellipse(cx - 5, 32, 15, 9, pal.skinHi);
      p.ellipse(cx + 9, 44, 14, 9, pal.skinDark);
      // Huge bulging golden-yellow eyes perched high on head!
      for (const side of [-1, 1]) {
        const ex = cx + side * 12;
        p.ellipse(ex, 22, 10, 10, pal.skin);
        p.ellipse(ex - 2, 19, 6, 5, pal.skinHi);
        p.ellipse(ex, 22, 7.5, 7.5, INK);
        p.ellipse(ex, 22, 6, 6, pal.eye);
        p.rect(ex + (side < 0 ? -1 : 0), 20, 3, 4, INK);
        p.rect(ex - 3, 18, 2, 2, WHITE);
      }
      // Wide cheeky frog grin + dripping green bubble!
      p.bezier(cx - 17, 42, cx, 49, cx + 17, 42, INK, 3);
      p.ellipse(cx + 14, 46, 4, 4, pal.gear);
      p.set(cx + 13, 45, WHITE);
      break;
    }
  }

  // Bold 2px comic ink outer outline around the transparent bust!
  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}

/**
 * Rebel B-Skin Hooded Bust Portrait (96x80, orig 48,40, 1f — shown in Frozen City 5-1..5-3).
 */
export function drawRebelBHoodedPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
): void {
  const pal = BUST_PALETTES_28[19]!; // Rebel B tan winter coat
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.46);

  // Heavy insulated tan winter coat shoulders
  p.poly([[cx - 36, h - 1], [cx - 28, 50], [cx + 28, 50], [cx + 36, h - 1]], pal.skin);
  p.poly([[cx - 34, h - 1], [cx - 26, 52], [cx - 6, 52], [cx - 10, h - 1]], pal.skinHi);
  p.poly([[cx + 8, 52], [cx + 26, 52], [cx + 34, h - 1], [cx + 10, h - 1]], pal.skinDark);
  // Deep snug winter parka hood pulled high over head
  p.poly([[cx, 4], [cx + 24, 14], [cx + 27, 54], [cx - 27, 54], [cx - 24, 14]], pal.skin);
  p.poly([[cx, 5], [cx - 22, 15], [cx - 24, 46], [cx - 8, 36]], pal.skinHi);
  // Thick fluffy snow-dusted cream fur hood ruff framing the entire face!
  for (const [fx, fy] of [
    [-19, 20], [-21, 30], [-20, 40], [-14, 12], [-5, 9], [5, 9], [14, 12], [19, 20], [21, 30], [20, 40], [-12, 47], [0, 49], [12, 47],
  ] as const) {
    p.ellipse(cx + fx, fy, 7, 7, pal.gear);
    p.ellipse(cx + fx - 1, fy - 2, 4, 3.5, pal.gearHi);
  }
  // Deep shadowed hood cavity + warm glowing eyes peeking out!
  p.ellipse(cx, 31, 13, 14, INK);
  p.rect(cx - 9, 28, 6, 4, pal.eye);
  p.rect(cx + 3, 28, 6, 4, pal.eye);
  p.set(cx - 8, 28, WHITE);
  p.set(cx + 4, 28, WHITE);
  // Thick buttoned parka flap & warm winter scarf tucked high over chin
  p.poly([[cx - 20, 46], [cx + 20, 45], [cx + 22, 62], [cx - 22, 62]], pal.accent);
  p.line(cx - 18, 52, cx + 18, 51, INK, 2);
  p.rect(cx - 2, 64, 4, 4, pal.gear);
  p.rect(cx - 2, 72, 4, 4, pal.gear);
  // Subtle frost snowflakes on hood shoulders
  p.set(cx - 22, 18, '#c8f0ff');
  p.set(cx + 18, 16, '#c8f0ff');
  p.set(cx - 28, 58, '#c8f0ff');

  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}

/**
 * Headless Chicken Bust Portrait (96x80, orig 48,40, 3 frames — animated crimson neck spurt!).
 */
export function drawChickenHeadlessPortraitHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const pal = BUST_PALETTES_28[16]!; // Chicken A white feathers
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.44);

  // Katana strapped behind shoulder
  p.line(cx + 10, 50, cx + 34, 12, '#4a5260', 5);
  p.line(cx + 11, 49, cx + 33, 13, pal.gear, 3);
  // Feathered shoulders & martial tunic
  p.ellipse(cx, 69, 29, 17, pal.skin);
  p.ellipse(cx - 6, 65, 16, 9, pal.skinHi);
  p.poly([[cx - 22, 58], [cx, 72], [cx + 22, 58], [cx + 18, h - 1], [cx - 18, h - 1]], pal.gearDark);
  p.line(cx - 21, 58, cx, 71, INK, 2);
  p.line(cx + 21, 58, cx, 71, INK, 2);
  // Severed feathered neck stump!
  p.rect(cx - 11, 45, 22, 15, pal.skin);
  p.rect(cx - 9, 45, 12, 12, pal.skinHi);
  p.ellipse(cx, 45, 11, 4.5, '#8c121a');
  p.ellipse(cx, 45, 8, 3, '#e42834');
  // Animated fountain of crimson cartoon neck droplets across 3 frames!
  const lift = frame === 1 ? -4 : frame === 2 ? -2 : 0;
  p.poly([[cx - 5, 44], [cx - 12 - frame * 2, 22 + lift], [cx - 2, 28 + lift]], '#dc2430');
  p.poly([[cx, 44], [cx + (frame - 1) * 3, 14 + lift], [cx + 6, 26 + lift]], '#ff3844');
  p.poly([[cx + 5, 44], [cx + 14 + frame * 2, 24 + lift], [cx + 4, 30 + lift]], '#dc2430');
  p.ellipse(cx - 14 - frame * 2, 16 + lift, 3.5, 3.5, '#ff4854');
  p.ellipse(cx + (frame - 1) * 3, 10 + lift, 4, 4, '#ff5c66');
  p.ellipse(cx + 16 + frame * 2, 18 + lift, 3, 3, '#e42834');

  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}

/**
 * Crisp 1x Char Select Roster Face Cards (16x24, orig 0,0, 18 frames).
 * Frame 0 = Random (?), 1..12 = Fish..Rogue, 14 = Skeleton, 15 = Frog!
 */
export function drawCharSelectCardHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  frame: number,
): void {
  const palIdx =
    frame >= 1 && frame <= 12
      ? (frame - 1) * 2
      : frame === 14
        ? 24
        : frame === 15
          ? 26
          : 0;
  const pal = BUST_PALETTES_28[palIdx]!;
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.5);

  // Rich crisp card background
  p.rect(1, 1, w - 2, h - 2, pal.bgDeep);
  p.rect(2, 2, w - 4, h - 8, pal.bgMid);

  const fg = new PxCanvas(w, h);
  if (frame === 14) {
    // Frame 14: SKELETON face card (ivory skull + hollow black eye sockets + ribcage!)
    fg.rect(3, 18, 10, 5, pal.skinDark);
    fg.rect(4, 19, 8, 1, pal.skinHi);
    fg.rect(4, 21, 8, 1, pal.skin);
    fg.ellipse(cx, 11, 6, 6, pal.skin);
    fg.rect(cx - 4, 6, 8, 2, pal.skinHi);
    fg.rect(cx - 4, 9, 3, 3, INK);
    fg.rect(cx + 1, 9, 3, 3, INK);
    fg.rect(cx - 3, 15, 6, 3, INK);
    fg.set(cx - 2, 16, WHITE);
    fg.set(cx, 16, WHITE);
    fg.set(cx + 2, 16, WHITE);
  } else if (frame === 15) {
    // Frame 15: FROG face card (lime-green toad + huge golden eyes + toxic bubbles!)
    fg.rect(2, 18, 12, 5, pal.gear);
    fg.ellipse(cx, 14, 6.5, 5.5, pal.skin);
    fg.rect(cx - 5, 6, 4, 4, pal.skinHi);
    fg.rect(cx + 1, 6, 4, 4, pal.skinHi);
    fg.rect(cx - 4, 7, 3, 3, pal.eye);
    fg.rect(cx + 1, 7, 3, 3, pal.eye);
    fg.set(cx - 3, 8, INK);
    fg.set(cx + 2, 8, INK);
    fg.rect(cx - 4, 15, 8, 1, '#1a4a12');
    fg.rect(cx + 4, 12, 2, 2, pal.gearHi);
  } else if (frame === 0 || frame > 12) {
    fg.rect(5, 6, 6, 2, WHITE);
    fg.rect(9, 8, 2, 4, WHITE);
    fg.rect(7, 11, 3, 2, WHITE);
    fg.rect(7, 13, 2, 2, WHITE);
    fg.rect(7, 17, 2, 2, WHITE);
  } else {
    const mutantIdx = frame - 1;
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
      case 6: // Steroids
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
 * Locked Char Select Roster Cards (16x24, orig 0,0, 18 frames):
 * Dark silhouetted mutant bust behind a crisp gleaming gold padlock!
 */
export function drawCharSelectLockedCardHiBit(
  ctx: DrawCtx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  _frame: number,
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w * 0.5);

  p.rect(1, 1, w - 2, h - 2, '#14121a');
  p.rect(2, 2, w - 4, h - 8, '#201c28');
  // Subtle dark silhouetted bust
  p.ellipse(cx, 11, 5, 5, '#100e16');
  p.rect(cx - 5, 16, 10, 6, '#100e16');

  // Crisp gold padlock centered on locked card!
  const lock = new PxCanvas(w, h);
  // Steel shackle arch
  lock.rect(cx - 2, 8, 4, 1, '#bcc6d4');
  lock.rect(cx - 3, 9, 1, 3, '#98a4b4');
  lock.rect(cx + 2, 9, 1, 3, '#7c8898');
  // Golden padlock body
  lock.rect(cx - 4, 12, 8, 6, '#e8b428');
  lock.rect(cx - 3, 12, 6, 2, '#fff088');
  lock.rect(cx - 4, 16, 8, 2, '#9e6c12');
  lock.rect(cx - 1, 14, 2, 2, INK); // keyhole
  lock.outline(INK);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = lock.get(x, y);
      if (c) p.set(x, y, c);
    }
  }
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
 * ALL 9 CRISP 1x CLOSE-UP BOSS INTRO PORTRAITS (80x70, orig 40,35, transparent background).
 * 0 = Big Bandit, 1 = Big Dog, 2 = Lil' Hunter, 3 = Nuclear Throne, 4 = Throne II,
 * 5 = Mom, 6 = Hyper Crystal, 7 = Technomancer, 8 = I.D.P.D. Captain!
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

  switch (((frame % 9) + 9) % 9) {
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
      // THE NUCLEAR THRONE
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
    case 4: {
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
    case 5: {
      // 5: MOM (FrogQueen) — bloated toxic green toad matriarch w/ glowing blisters, yellow eyes & gaping fanged maw!
      p.ellipse(cx, cy + 8, 34, 24, '#28641e');
      p.ellipse(cx, cy + 4, 31, 21, '#4ca838');
      p.ellipse(cx - 6, cy - 4, 20, 12, '#88e060');
      // Pulsing glowing lime toxic blisters across toad cheeks & brow
      for (const [bx, by, br] of [[-24, 34, 5], [24, 36, 5], [-18, 52, 4.5], [20, 50, 4], [0, 14, 4.5]] as const) {
        p.ellipse(cx + bx, by, br, br, '#88e048');
        p.ellipse(cx + bx - 1, by - 1, br * 0.55, br * 0.55, '#d8ff78');
      }
      // Huge menacing yellow frog eyes perched high
      for (const s of [-1, 1]) {
        p.ellipse(cx + s * 16, 20, 10, 9, '#4ca838');
        p.ellipse(cx + s * 16, 20, 7.5, 6.5, INK);
        p.ellipse(cx + s * 16, 20, 6, 5, '#ffe838');
        p.rect(cx + s * 16 - 1, 18, 2, 4, INK);
        p.set(cx + s * 16 - 3, 18, WHITE);
      }
      // Enormous gaping fanged toxic maw + slime drool!
      p.ellipse(cx, 44, 22, 12, INK);
      p.ellipse(cx, 46, 18, 7, '#64c828');
      p.ellipse(cx, 48, 12, 4, '#c4ff68');
      for (let t = -15; t <= 15; t += 6) {
        p.poly([[cx + t - 2, 34], [cx + t + 2, 34], [cx + t, 43]], CREAM);
      }
      p.rect(cx - 10, 54, 4, 10, '#84f438');
      p.rect(cx + 8, 53, 3, 9, '#b8ff58');
      break;
    }
    case 6: {
      // 6: HYPER CRYSTAL — towering prismatic magenta/purple/cyan crystal monolith spires!
      // Orbiting flanking crystal shards
      p.poly([[cx - 32, 26], [cx - 37, 40], [cx - 29, 50], [cx - 24, 38]], '#b838e8');
      p.poly([[cx - 32, 28], [cx - 35, 40], [cx - 30, 46]], '#ff88ff');
      p.poly([[cx + 32, 24], [cx + 37, 38], [cx + 29, 48], [cx + 24, 36]], '#7c24b8');
      p.poly([[cx + 32, 26], [cx + 35, 38], [cx + 30, 44]], '#e068ff');
      // Flanking secondary spires
      p.poly([[cx - 18, 14], [cx - 6, 36], [cx - 14, 62], [cx - 26, 44]], '#8c28c8');
      p.poly([[cx - 18, 15], [cx - 25, 43], [cx - 15, 58]], '#e468ff');
      p.poly([[cx + 18, 14], [cx + 26, 44], [cx + 14, 62], [cx + 6, 36]], '#5a1888');
      // Towering central crystal monolith
      p.poly([[cx, 4], [cx + 17, 26], [cx + 13, 64], [cx - 13, 64], [cx - 17, 26]], '#b838e8');
      p.poly([[cx, 5], [cx - 16, 26], [cx - 11, 63], [cx, 63]], '#ff88ff');
      p.poly([[cx, 5], [cx - 9, 24], [cx, 30]], WHITE);
      p.poly([[cx, 5], [cx + 16, 26], [cx + 11, 63], [cx, 63]], '#5a1888');
      // Blazing white-cyan inner energy core!
      p.poly([[cx, 24], [cx + 9, 38], [cx, 52], [cx - 9, 38]], '#58f4ff');
      p.poly([[cx, 30], [cx + 5, 38], [cx, 46], [cx - 5, 38]], WHITE);
      break;
    }
    case 7: {
      // 7: TECHNOMANCER — industrial steel battle pod + glowing emerald glass dome + cybernetic brain w/ red optic!
      // Heavy steel base & flanking generator pipes
      p.rect(cx - 34, 42, 68, 24, '#323a44');
      p.rect(cx - 32, 42, 64, 5, '#586470');
      p.rect(cx - 36, 20, 10, 38, '#586470');
      p.rect(cx - 34, 22, 4, 34, '#8c98a6');
      p.rect(cx + 26, 20, 10, 38, '#3a4450');
      // Glowing emerald containment glass dome
      p.ellipse(cx, 30, 24, 24, '#247850');
      p.ellipse(cx, 30, 21, 21, '#48f098');
      p.ellipse(cx - 5, 22, 12, 10, '#b8ffd8');
      // Floating cybernetic mutant brain inside glass pod!
      p.ellipse(cx, 29, 14, 11, '#b87890');
      p.ellipse(cx - 3, 25, 9, 6, '#e8a8be');
      p.line(cx - 8, 28, cx + 8, 26, '#6e3a50', 2);
      p.line(cx - 7, 32, cx + 6, 33, '#6e3a50', 2);
      // Piercing crimson cybernetic optic + iron jaw brace
      p.rect(cx - 10, 34, 20, 8, '#4a5460');
      p.ellipse(cx, 31, 6, 6, INK);
      p.ellipse(cx, 31, 4, 4, '#ff2838');
      p.set(cx - 1, 30, WHITE);
      // Riveted lower console panel + warning lights
      p.rect(cx - 22, 48, 44, 12, '#242a32');
      p.rect(cx - 18, 51, 10, 6, '#48f098');
      p.rect(cx + 8, 51, 10, 6, '#48f098');
      p.rect(cx - 3, 51, 6, 6, '#ff3c48');
      break;
    }
    default: {
      // 8: I.D.P.D. CAPTAIN (Last) — imposing cobalt-blue & white armored commander + cyan visor + raised plasma fist!
      // High white & cobalt armored captain cape shoulders
      p.poly([[cx - 36, h - 1], [cx - 30, 34], [cx + 24, 34], [cx + 30, h - 1]], '#2a58b8');
      p.poly([[cx - 34, h - 1], [cx - 28, 36], [cx - 10, 36], [cx - 12, h - 1]], '#e8f2fc');
      p.poly([[cx + 12, 36], [cx + 24, 36], [cx + 28, h - 1], [cx + 12, h - 1]], '#18367a');
      // Gold commander aiguillette & chest chevron
      p.rect(cx - 18, 44, 30, 5, '#f5d038');
      p.rect(cx - 14, 45, 22, 2, '#fff498');
      // Imposing sloped white-crested cobalt commander helmet
      p.poly([[cx - 18, 12], [cx + 14, 12], [cx + 18, 40], [cx - 22, 40]], '#2a58b8');
      p.poly([[cx - 16, 13], [cx - 2, 13], [cx - 4, 38], [cx - 20, 38]], '#548cf0');
      p.poly([[cx - 6, 4], [cx + 2, 4], [cx + 4, 18], [cx - 8, 18]], '#e8f2fc'); // white captain crest
      p.rect(cx - 4, 5, 4, 11, '#f5d038'); // gold centerline trim
      // Piercing glowing cyan commander visor!
      p.rect(cx - 17, 23, 30, 10, INK);
      p.rect(cx - 15, 25, 26, 6, '#2898ff');
      p.rect(cx - 13, 26, 22, 4, '#68f4ff');
      p.line(cx - 10, 26, cx - 2, 30, WHITE, 2);
      // Raised blazing blue energy gauntlet on right!
      p.ellipse(cx + 24, 44, 12, 13, '#2878ff');
      p.ellipse(cx + 24, 44, 8, 9, '#78ecff');
      p.ellipse(cx + 23, 42, 4, 5, WHITE);
      p.line(cx + 14, 34, cx + 32, 28, '#a8f8ff', 2);
      p.line(cx + 32, 54, cx + 38, 40, '#a8f8ff', 1);
      break;
    }
  }

  p.outline(INK);
  p.outline(INK);
  p.flush(ctx, ox, oy);
}
