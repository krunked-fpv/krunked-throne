import type { EnemyDef, WeaponDef } from '@/contracts';
import { ENEMIES } from '@/data/enemies';
import { WEAPONS } from '@/data/weapons';
import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  drawPixelLine,
  fillDiamond,
  fillPixelEllipse,
  fillTrapezoid,
  outlinedBox,
  outlinedDiamond,
  outlinedEllipse,
  outlinedTrapezoid,
  px,
  rect,
} from './fallback-fonts';

// ============================================================================
// 1. ALL 12 MUTANTS (A-SKIN + DISTINCT B-SKIN, IDLE/WALK/HURT/DEAD/SIT/GOSIT)
// ============================================================================

interface MutantPalette {
  body: string;
  hi: string;
  dark: string;
  accent: string;
  accentHi: string;
  eye: string;
  pupil: string;
  detail: string;
}

const MUTANT_A_PALETTES: readonly MutantPalette[] = [
  // 1. Fish: teal-green amphibian, dorsal fin, yellow goggle eyes
  { body: '#45ab6d', hi: '#85ed9f', dark: '#1f5e3b', accent: '#257852', accentHi: '#63d998', eye: '#fff066', pupil: '#141118', detail: '#9c6238' },
  // 2. Crystal: faceted purple/magenta crystal titan
  { body: '#b04ce0', hi: '#ebb0ff', dark: '#5e188c', accent: '#d978ff', accentHi: '#ffffff', eye: '#fff5ff', pupil: '#4a1273', detail: '#8e32bd' },
  // 3. Eyes: deep cobalt multi-eyed psychic
  { body: '#3e6bc9', hi: '#7aadfa', dark: '#1d387a', accent: '#2c4f9e', accentHi: '#a6ccff', eye: '#ffffff', pupil: '#120e16', detail: '#734fd9' },
  // 4. Melting: bone-ivory skeletal skull & exposed ribs
  { body: '#dbd0ba', hi: '#fcf6e8', dark: '#877965', accent: '#9e2e36', accentHi: '#db555e', eye: '#18121a', pupil: '#18121a', detail: '#6b5e4f' },
  // 5. Plant: emerald stalk + crimson carnivorous flytrap maw
  { body: '#3cba46', hi: '#7ef073', dark: '#1b6626', accent: '#de2b38', accentHi: '#ff707a', eye: '#ffe647', pupil: '#ffffff', detail: '#fff2cc' },
  // 6. Y.V.: crisp ivory pyramid + gold chain + sharp cyclops eye
  { body: '#f0edf5', hi: '#ffffff', dark: '#9d97ab', accent: '#f7c636', accentHi: '#fff69e', eye: '#ffffff', pupil: '#120e16', detail: '#d49a1e' },
  // 7. Steroids: buff tan scientist in shredded white lab coat + glasses
  { body: '#d98f64', hi: '#f7ba92', dark: '#8c4e2c', accent: '#edeaf2', accentHi: '#ffffff', eye: '#9ce6ff', pupil: '#18141a', detail: '#6b3b24' },
  // 8. Robot: brushed steel CRT automaton + glowing green visor
  { body: '#8ca1ae', hi: '#cbdce6', dark: '#475763', accent: '#36434f', accentHi: '#788ea1', eye: '#59ff7a', pupil: '#d9ffde', detail: '#eb3d34' },
  // 9. Chicken: feathered white martial artist + red comb & headband
  { body: '#f5f0e6', hi: '#ffffff', dark: '#b0a799', accent: '#e62e26', accentHi: '#ff705c', eye: '#18141a', pupil: '#ffffff', detail: '#f7a923' },
  // 10. Rebel: bandaged desert nomad in olive hood & scarf
  { body: '#7d9479', hi: '#b0c9ab', dark: '#425440', accent: '#c2a87e', accentHi: '#ebd5ad', eye: '#ffe659', pupil: '#1a1410', detail: '#334031' },
  // 11. Horror: bubbling translucent neon-green radiation slime
  { body: '#42ed53', hi: '#b8ffba', dark: '#168228', accent: '#80ff6b', accentHi: '#ebffe8', eye: '#122616', pupil: '#dcffbd', detail: '#24b83d' },
  // 12. Rogue: armored cobalt trooper with white pauldrons & cyan visor
  { body: '#3c73cc', hi: '#75abfa', dark: '#1b3a78', accent: '#ebf2fa', accentHi: '#ffffff', eye: '#7df4ff', pupil: '#ffffff', detail: '#234a94' },
];

const MUTANT_B_PALETTES: readonly MutantPalette[] = [
  // 1B. Fish B: darker swamp-green + crimson bandana & eyepatch + gold strap
  { body: '#2d8553', hi: '#5ec486', dark: '#14472b', accent: '#d92638', accentHi: '#ff6e7b', eye: '#ffe859', pupil: '#141118', detail: '#f5c742' },
  // 2B. Crystal B: gleaming imperial gold/amber faceted crystal golem
  { body: '#eba828', hi: '#fff396', dark: '#87500b', accent: '#ffd852', accentHi: '#ffffff', eye: '#80f7ff', pupil: '#266b85', detail: '#c97812' },
  // 3B. Eyes B: dark plum/crimson mystic with glowing golden eyes
  { body: '#592975', hi: '#9654bf', dark: '#29103b', accent: '#a32148', accentHi: '#f05e8a', eye: '#ffe84d', pupil: '#1a0c14', detail: '#bd335a' },
  // 4B. Melting B: charred obsidian skull with blazing orange ember sockets
  { body: '#4f4657', hi: '#80758c', dark: '#221d26', accent: '#d93829', accentHi: '#ff7b33', eye: '#ff6a1a', pupil: '#fff285', detail: '#8f221b' },
  // 5B. Plant B: violet-teal exotic flytrap with neon magenta petals
  { body: '#298f81', hi: '#5cd1be', dark: '#124a44', accent: '#cc29b8', accentHi: '#ff7eed', eye: '#7dffec', pupil: '#ffffff', detail: '#ffe6ff' },
  // 6B. Y.V. B: solid VIP gold pyramid with crimson shades
  { body: '#f5c436', hi: '#fff69e', dark: '#9c6812', accent: '#d12435', accentHi: '#ff5e6f', eye: '#ff4252', pupil: '#140c10', detail: '#38d968' },
  // 7B. Steroids B: commando crimson-black vest & dark shades
  { body: '#cc7e52', hi: '#eba77e', dark: '#783e22', accent: '#34303d', accentHi: '#e0313d', eye: '#18141c', pupil: '#ffe047', detail: '#b8252c' },
  // 8B. Robot B: retro cobalt & gold arcade mecha with cyan CRT visor
  { body: '#3b6ec9', hi: '#7aadfa', dark: '#1b3873', accent: '#ebba34', accentHi: '#fff48f', eye: '#70f4ff', pupil: '#ffffff', detail: '#ff4a63' },
  // 9B. Chicken B: midnight-black shinobi ninja with glowing red eyes
  { body: '#2e2a3b', hi: '#59536e', dark: '#15121f', accent: '#de2437', accentHi: '#ff6173', eye: '#ff3847', pupil: '#ffe880', detail: '#f5c438' },
  // 10B. Rebel B: royal crimson desert cloak & silver visor scarf
  { body: '#a8293a', hi: '#de4e61', dark: '#57121e', accent: '#d4dde8', accentHi: '#ffffff', eye: '#ffe347', pupil: '#1a1214', detail: '#403645' },
  // 11B. Horror B: volatile electric-cyan plasma anomaly
  { body: '#36c9f2', hi: '#abf5ff', dark: '#14658f', accent: '#7885ff', accentHi: '#e6fcff', eye: '#121a38', pupil: '#ffffff', detail: '#4d98ff' },
  // 12B. Rogue B: covert charcoal & crimson blast armor with amber visor
  { body: '#3c3f4f', hi: '#6a7087', dark: '#1c1d29', accent: '#d12938', accentHi: '#ff6170', eye: '#ffc138', pupil: '#fff7cc', detail: '#8c1b26' },
];

function drawMutantFrame(
  ctx: DrawCtx,
  x: number,
  y: number,
  raceIndex: number,
  isB: boolean,
  variant: 'idle' | 'walk' | 'hurt' | 'dead' | 'sit' | 'gosit',
  frame: number,
): void {
  const pal = (isB ? MUTANT_B_PALETTES : MUTANT_A_PALETTES)[raceIndex - 1]!;
  const cx = x + 9;
  const cy = y + 9;

  if (variant === 'dead') {
    if (frame === 0) {
      outlinedEllipse(ctx, cx, cy + 2, 6, 4, pal.body, INK);
      rect(ctx, cx - 4, cy + 1, 8, 2, pal.dark);
      rect(ctx, cx - 2, cy, 2, 2, '#d92638');
      px(ctx, cx + 1, cy + 1, pal.eye);
    } else {
      fillPixelEllipse(ctx, cx, cy + 5, 7, 3, '#6e141c');
      outlinedEllipse(ctx, cx - 1, cy + 4, 6, 3, pal.dark, INK);
      rect(ctx, cx - 5, cy + 2, 9, 3, pal.body);
      rect(ctx, cx - 4, cy + 2, 5, 1, pal.hi);
      rect(ctx, cx + 2, cy + 3, 3, 2, pal.accent);
      px(ctx, cx - 3, cy + 3, INK);
      px(ctx, cx - 1, cy + 3, INK);
    }
    return;
  }

  const hurt = variant === 'hurt';
  const body = hurt ? '#ffffff' : pal.body;
  const hi = hurt ? '#ffffff' : pal.hi;
  const dark = hurt ? '#ffcccc' : pal.dark;
  const accent = hurt ? '#ff6666' : pal.accent;
  const accentHi = hurt ? '#ffffff' : pal.accentHi;
  const eye = hurt ? '#141118' : pal.eye;
  const pupil = hurt ? '#ffffff' : pal.pupil;

  const bob =
    variant === 'walk'
      ? (frame === 1 || frame === 3 ? -1 : 0)
      : variant === 'idle'
        ? (frame === 2 ? 1 : 0)
        : variant === 'sit'
          ? 1 + (frame % 2 === 1 ? 1 : 0)
          : variant === 'gosit'
            ? (frame & 1)
            : 0;

  const ty = cy + bob;
  const safeTy = Math.min(cy + 1, ty);

  // Grounded feet (tucked when sitting, brisk alternating stride when walking)
  if (variant !== 'sit') {
    const stride = variant === 'walk' ? (frame === 0 ? -1 : frame === 2 ? 1 : 0) : 0;
    rect(ctx, cx - 4 + stride, cy + 5, 3, 3, INK);
    rect(ctx, cx + 1 - stride, cy + 5, 3, 3, INK);
    px(ctx, cx - 3 + stride, cy + 6, dark);
    px(ctx, cx + 2 - stride, cy + 6, dark);
  } else {
    rect(ctx, cx - 5, cy + 5, 4, 3, INK);
    rect(ctx, cx + 1, cy + 5, 4, 3, INK);
    rect(ctx, cx - 4, cy + 6, 2, 1, dark);
    rect(ctx, cx + 2, cy + 6, 2, 1, dark);
  }

  switch (raceIndex) {
    case 1: {
      // FISH: curved dorsal fin crest + plump 3-tone amphibian body + gill ticks + yellow goggle eyes + bandana/eyepatch B
      const finY = Math.max(y + 1, safeTy - 7);
      outlinedTrapezoid(ctx, cx, finY, 2, 6, 3, accent, INK);
      px(ctx, cx - 1, finY + 1, accentHi);
      outlinedEllipse(ctx, cx, safeTy, 5, 5, body, INK);
      fillPixelEllipse(ctx, cx - 1, safeTy - 2, 3, 2, hi);
      rect(ctx, cx - 4, safeTy + 2, 8, 3, dark);
      // Utility strap + gleaming buckle
      rect(ctx, cx - 4, safeTy + 2, 8, 1, pal.detail);
      px(ctx, cx, safeTy + 2, '#ffe880');
      if (isB && !hurt) {
        rect(ctx, cx - 5, safeTy - 5, 10, 2, accent);
        rect(ctx, cx - 4, safeTy - 5, 6, 1, accentHi);
        rect(ctx, cx + 5, safeTy - 4 + (frame & 1), 2, 2, accent);
        rect(ctx, cx - 3, safeTy - 3, 3, 3, INK);
        rect(ctx, cx + 1, safeTy - 3, 2, 2, eye);
        px(ctx, cx + 2, safeTy - 2, pupil);
        px(ctx, cx + 1, safeTy - 3, '#ffffff');
      } else {
        rect(ctx, cx - 3, safeTy - 3, 2, 2, eye);
        rect(ctx, cx + 1, safeTy - 3, 2, 2, eye);
        px(ctx, cx - 2, safeTy - 2, pupil);
        px(ctx, cx + 2, safeTy - 2, pupil);
        px(ctx, cx - 3, safeTy - 3, '#ffffff');
        px(ctx, cx + 1, safeTy - 3, '#ffffff');
      }
      rect(ctx, cx - 2, safeTy, 4, 1, INK);
      break;
    }

    case 2: {
      // CRYSTAL: sharp faceted diamond monolith with 3-tone planar shading + bright specular prism glint!
      outlinedDiamond(ctx, cx, safeTy - 1, 6, 6, body, INK);
      // Left lit crystal facet & right shadowed crystal facet
      fillTrapezoid(ctx, cx - 2, safeTy - 5, 2, 4, 7, hi);
      fillTrapezoid(ctx, cx + 2, safeTy - 3, 2, 4, 7, dark);
      px(ctx, cx - 2, safeTy - 4, '#ffffff');
      px(ctx, cx - 3, safeTy - 3, accentHi);
      rect(ctx, cx - 3, safeTy - 2, 2, 2, eye);
      rect(ctx, cx + 1, safeTy - 2, 2, 2, eye);
      px(ctx, cx - 2, safeTy - 2, '#ffffff');
      px(ctx, cx + 2, safeTy - 2, '#ffffff');
      break;
    }

    case 3: {
      // EYES: rounded psychic body teeming with gleaming multi-iris eyes!
      outlinedEllipse(ctx, cx, safeTy, 5, 5, body, INK);
      fillPixelEllipse(ctx, cx - 1, safeTy - 2, 3, 2, hi);
      rect(ctx, cx - 4, safeTy + 2, 8, 2, dark);
      // Expressive staring eyes with white specular glints
      rect(ctx, cx - 4, safeTy - 4, 3, 3, eye);
      rect(ctx, cx + 1, safeTy - 4, 3, 3, eye);
      px(ctx, cx - 3, safeTy - 3, pupil);
      px(ctx, cx + 2, safeTy - 3, pupil);
      px(ctx, cx - 4, safeTy - 4, accentHi);
      rect(ctx, cx - 2, safeTy - 1, 2, 2, eye);
      px(ctx, cx - 1, safeTy, pupil);
      rect(ctx, cx + 1, safeTy, 2, 2, eye);
      px(ctx, cx + 2, safeTy + 1, pupil);
      rect(ctx, cx - 4, safeTy + 1, 2, 2, eye);
      break;
    }

    case 4: {
      // MELTING: gaunt cracked skull dome + narrow jaw + exposed glowing ribcage!
      outlinedEllipse(ctx, cx, safeTy - 3, 4, 3, body, INK);
      rect(ctx, cx - 3, safeTy - 5, 5, 2, hi);
      px(ctx, cx + 2, safeTy - 5, INK);
      rect(ctx, cx - 3, safeTy - 3, 2, 2, eye);
      rect(ctx, cx + 1, safeTy - 3, 2, 2, eye);
      if (isB && !hurt) {
        px(ctx, cx - 2, safeTy - 2, pupil);
        px(ctx, cx + 2, safeTy - 2, pupil);
      }
      outlinedTrapezoid(ctx, cx, safeTy, 6, 8, 5, dark, INK);
      rect(ctx, cx - 3, safeTy + 1, 6, 1, hi);
      rect(ctx, cx - 3, safeTy + 3, 6, 1, body);
      rect(ctx, cx - 1, safeTy + 1, 2, 4, accent);
      break;
    }

    case 5: {
      // PLANT: tapered leafy stem + wide snapping serrated crimson flytrap head with gleaming fangs!
      outlinedTrapezoid(ctx, cx, safeTy + 1, 5, 8, 4, body, INK);
      rect(ctx, cx - 6, safeTy + 2, 3, 2, hi);
      rect(ctx, cx + 3, safeTy + 2, 3, 2, hi);
      outlinedEllipse(ctx, cx, safeTy - 3, 5, 4, accent, INK);
      fillPixelEllipse(ctx, cx - 1, safeTy - 4, 3, 2, accentHi);
      px(ctx, cx - 3, safeTy - 4, eye);
      px(ctx, cx + 2, safeTy - 4, eye);
      rect(ctx, cx - 4, safeTy - 2, 8, 2, INK);
      px(ctx, cx - 3, safeTy - 2, '#ffffff');
      px(ctx, cx - 1, safeTy - 2, '#ffffff');
      px(ctx, cx + 1, safeTy - 2, '#ffffff');
      px(ctx, cx + 3, safeTy - 2, '#ffffff');
      break;
    }

    case 6: {
      // Y.V.: crisp 3D lit-left / shadowed-right pyramid + huge sharp cyclops eye + gold dollar chain!
      for (let row = 0; row < 12; row++) {
        const half = Math.floor((row + 1) * 0.55);
        rect(ctx, cx - half - 1, safeTy - 6 + row, (half + 1) * 2 + 1, 1, INK);
        if (half >= 1 && row > 0 && row < 11) {
          const leftW = Math.max(1, half);
          rect(ctx, cx - half, safeTy - 6 + row, leftW, 1, row < 5 ? hi : body);
          rect(ctx, cx - half + leftW, safeTy - 6 + row, half * 2 + 1 - leftW, 1, row > 7 ? dark : body);
        }
      }
      px(ctx, cx, safeTy - 5, '#ffffff');
      if (isB && !hurt) {
        rect(ctx, cx - 3, safeTy - 2, 7, 3, INK);
        rect(ctx, cx - 2, safeTy - 1, 5, 1, accent);
        px(ctx, cx - 2, safeTy - 1, '#ffffff');
      } else {
        rect(ctx, cx - 2, safeTy - 2, 5, 3, INK);
        rect(ctx, cx - 1, safeTy - 1, 3, 1, eye);
        px(ctx, cx, safeTy - 1, pupil);
        px(ctx, cx - 1, safeTy - 1, '#ffffff');
      }
      rect(ctx, cx - 3, safeTy + 2, 7, 1, accent);
      rect(ctx, cx - 1, safeTy + 3, 3, 2, accentHi);
      break;
    }

    case 7: {
      // STEROIDS: broad muscular traps + V-cut shredded lab coat + gleaming round spectacles!
      outlinedTrapezoid(ctx, cx, safeTy - 3, 10, 13, 8, body, INK);
      rect(ctx, cx - 5, safeTy - 2, 7, 2, hi);
      rect(ctx, cx - 5, safeTy, 3, 5, accent);
      rect(ctx, cx + 2, safeTy, 3, 5, accent);
      rect(ctx, cx - 2, safeTy + 1, 4, 4, dark);
      outlinedBox(ctx, cx - 4, safeTy - 6, 8, 5, body, INK, true);
      rect(ctx, cx - 3, safeTy - 4, 3, 2, eye);
      rect(ctx, cx + 1, safeTy - 4, 3, 2, eye);
      px(ctx, cx - 3, safeTy - 4, '#ffffff');
      px(ctx, cx + 1, safeTy - 4, '#ffffff');
      px(ctx, cx - 2, safeTy - 3, pupil);
      px(ctx, cx + 2, safeTy - 3, pupil);
      break;
    }

    case 8: {
      // ROBOT: beveled brushed-steel CRT head + glowing phosphor scanline + antenna beacon!
      rect(ctx, cx - 1, safeTy - 8, 2, 3, INK);
      px(ctx, cx, safeTy - 8, pal.detail);
      outlinedBox(ctx, cx - 5, safeTy - 6, 10, 12, body, INK, true);
      rect(ctx, cx - 4, safeTy - 5, 8, 2, hi);
      rect(ctx, cx - 4, safeTy + 3, 8, 2, dark);
      outlinedBox(ctx, cx - 4, safeTy - 4, 8, 5, '#10181c', INK);
      rect(ctx, cx - 3, safeTy - 3, 6, 3, eye);
      rect(ctx, cx - 3, safeTy - 2, 6, 1, pupil);
      px(ctx, cx - 2, safeTy - 3, '#ffffff');
      rect(ctx, cx - 3, safeTy + 2, 6, 2, accent);
      px(ctx, cx - 2, safeTy + 2, accentHi);
      px(ctx, cx, safeTy + 2, accentHi);
      px(ctx, cx + 2, safeTy + 2, accentHi);
      break;
    }

    case 9: {
      // CHICKEN: feathered rounded martial artist + scarlet comb (A) or dark ninja hood (B) + flowing headband!
      if (!isB) {
        rect(ctx, cx - 2, Math.max(y, safeTy - 8), 5, 3, INK);
        rect(ctx, cx - 1, Math.max(y + 1, safeTy - 7), 3, 2, accent);
        px(ctx, cx, Math.max(y + 1, safeTy - 7), accentHi);
      }
      outlinedEllipse(ctx, cx, safeTy, 5, 5, body, INK);
      fillPixelEllipse(ctx, cx - 1, safeTy - 2, 3, 2, hi);
      rect(ctx, cx - 4, safeTy + 2, 8, 3, dark);
      rect(ctx, cx - 5, safeTy - 4, 10, 2, accent);
      rect(ctx, cx - 4, safeTy - 4, 5, 1, accentHi);
      rect(ctx, cx - 7, safeTy - 3 + (frame & 1), 3, 2, accent);
      if (isB) {
        rect(ctx, cx - 3, safeTy - 2, 6, 2, '#0d0b14');
      }
      rect(ctx, cx - 2, safeTy - 2, 2, 2, eye);
      rect(ctx, cx + 2, safeTy - 2, 2, 2, eye);
      px(ctx, cx - 2, safeTy - 2, pupil);
      px(ctx, cx + 2, safeTy - 2, pupil);
      if (!isB) {
        rect(ctx, cx, safeTy, 3, 2, pal.detail);
        px(ctx, cx + 1, safeTy, '#fff080');
      }
      break;
    }

    case 10: {
      // REBEL: peaked desert cloth hood + deep shadowed face + blazing amber eyes + layered desert scarf!
      outlinedTrapezoid(ctx, cx, Math.max(y + 1, safeTy - 7), 4, 10, 4, body, INK);
      outlinedBox(ctx, cx - 5, safeTy - 4, 10, 10, body, INK, true);
      rect(ctx, cx - 4, safeTy - 5, 5, 2, hi);
      rect(ctx, cx - 3, safeTy - 4, 6, 4, '#141018');
      rect(ctx, cx - 2, safeTy - 3, 2, 2, eye);
      rect(ctx, cx + 1, safeTy - 3, 2, 2, eye);
      px(ctx, cx - 2, safeTy - 3, '#ffffff');
      px(ctx, cx + 1, safeTy - 3, '#ffffff');
      rect(ctx, cx - 5, safeTy, 10, 3, accent);
      rect(ctx, cx - 4, safeTy, 8, 1, accentHi);
      rect(ctx, cx - 4, safeTy + 3, 8, 2, dark);
      break;
    }

    case 11: {
      // HORROR: 3-layer translucent bubbling neon slime beast with floating rad droplets!
      const hcy = safeTy;
      outlinedEllipse(ctx, cx, hcy, 5, 5, dark, INK);
      fillPixelEllipse(ctx, cx, hcy, 4, 4, body);
      fillPixelEllipse(ctx, cx - 1, hcy - 1, 2, 2, hi);
      px(ctx, cx - 2, hcy - 2, '#ffffff');
      const bShift = frame % 2;
      outlinedBox(ctx, cx - 6, hcy - 3 + bShift, 3, 3, hi, INK);
      outlinedBox(ctx, cx + 4, hcy - 2 - bShift, 3, 3, accent, INK);
      rect(ctx, cx - 3, hcy - 2, 2, 2, eye);
      rect(ctx, cx + 1, hcy - 2, 2, 2, eye);
      px(ctx, cx - 2, hcy - 1, pupil);
      px(ctx, cx + 2, hcy - 1, pupil);
      rect(ctx, cx - 2, hcy + 1, 4, 2, eye);
      px(ctx, cx - 1, hcy + 1, accentHi);
      px(ctx, cx + 1, hcy + 1, accentHi);
      break;
    }

    default: {
      // ROGUE: sloped armored ex-IDPD helmet + crest ridge + glowing visor + beveled pauldrons!
      outlinedTrapezoid(ctx, cx, safeTy - 6, 6, 10, 6, body, INK);
      rect(ctx, cx - 1, safeTy - 6, 2, 2, accent);
      rect(ctx, cx - 3, safeTy - 4, 6, 3, '#0e1626');
      rect(ctx, cx - 2, safeTy - 3, 5, 1, eye);
      px(ctx, cx - 1, safeTy - 3, pupil);
      outlinedTrapezoid(ctx, cx, safeTy, 10, 11, 5, dark, INK);
      rect(ctx, cx - 6, safeTy, 3, 3, accent);
      rect(ctx, cx + 3, safeTy, 3, 3, accent);
      px(ctx, cx - 6, safeTy, accentHi);
      px(ctx, cx + 3, safeTy, accentHi);
      rect(ctx, cx - 2, safeTy + 1, 4, 3, body);
      rect(ctx, cx - 4, safeTy + 4, 8, 1, pal.detail);
      break;
    }
  }
}

function registerAllMutants(b: FallbackAtlasBuilder): void {
  for (let race = 1; race <= 12; race++) {
    const p = `sprMutant${race}`;
    b.addSprite(`${p}Idle`, 18, 18, 9, 9, 4, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'idle', f));
    b.addSprite(`${p}Walk`, 18, 18, 9, 9, 4, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'walk', f));
    b.addSprite(`${p}Hurt`, 18, 18, 9, 9, 1, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'hurt', f));
    b.addSprite(`${p}Dead`, 18, 18, 9, 9, 2, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'dead', f));
    b.addSprite(`${p}Sit`, 18, 18, 9, 9, 2, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'sit', f));
    b.addSprite(`${p}GoSit`, 18, 18, 9, 9, 2, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, false, 'gosit', f));

    b.addSprite(`${p}BIdle`, 18, 18, 9, 9, 4, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, true, 'idle', f));
    b.addSprite(`${p}BWalk`, 18, 18, 9, 9, 4, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, true, 'walk', f));
    b.addSprite(`${p}BHurt`, 18, 18, 9, 9, 1, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, true, 'hurt', f));
    b.addSprite(`${p}BDead`, 18, 18, 9, 9, 2, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, true, 'dead', f));
    b.addSprite(`${p}BSit`, 18, 18, 9, 9, 2, (ctx, x, y, _w, _h, f) => drawMutantFrame(ctx, x, y, race, true, 'sit', f));
  }

  // Faceted Crystal Shield domes (A-skin amethyst & B-skin imperial gold) + Strong Spirit halo
  const drawCrystalShield = (ctx: DrawCtx, x: number, y: number, f: number, outer: string, mid: string, hi: string): void => {
    const cx = x + 13;
    const cy = y + 13;
    const r = 10 + (f % 2);
    outlinedDiamond(ctx, cx, cy, r, r, outer, INK);
    fillDiamond(ctx, cx, cy, r - 2, r - 2, mid);
    fillDiamond(ctx, cx - 2, cy - 2, r - 5, r - 5, hi);
    rect(ctx, cx - 5, cy - 5, 4, 1, '#ffffff');
    rect(ctx, cx - 5, cy - 5, 1, 4, '#ffffff');
    px(ctx, cx + 4, cy + 4, hi);
  };
  b.addSprite('sprShield', 26, 26, 13, 13, 4, (ctx, x, y, _w, _h, f) =>
    drawCrystalShield(ctx, x, y, f, '#7d26bd', '#b959f2', '#f7d6ff'),
  );
  b.addSprite('sprShieldB', 26, 26, 13, 13, 4, (ctx, x, y, _w, _h, f) =>
    drawCrystalShield(ctx, x, y, f, '#a66b14', '#f2bd38', '#fff7ba'),
  );
  b.addSprite('sprShieldDisappear', 26, 26, 13, 13, 4, (ctx, x, y, _w, _h, f) => {
    // Faceted Crystal Shield shattering outward into gleaming amethyst shards
    const cx = x + 13;
    const cy = y + 13;
    const spread = 3 + f * 2;
    const sz = Math.max(1, 4 - f);
    const dirs: ReadonlyArray<[number, number]> = [
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const [dx, dy] = dirs[i]!;
      const sx = Math.round(cx + dx * spread);
      const sy = Math.round(cy + dy * spread);
      if (f < 3) {
        outlinedDiamond(ctx, sx, sy, sz, sz, i % 2 === 0 ? '#c96eff' : '#8e2ed4', INK);
        px(ctx, sx, sy, '#ffffff');
      } else {
        rect(ctx, sx, sy, 2, 2, '#f0c4ff');
        px(ctx, sx, sy, '#ffffff');
      }
    }
  });
  b.addSprite('sprStrongSpirit', 20, 20, 10, 10, 4, (ctx, x, y, _w, _h, f) => {
    // Sleek hollow glowing spirit halo ring hovering cleanly above mutant (NOT a filled blue beanie!)
    const cx = x + 10;
    const hy = y + 2 + (f === 1 || f === 2 ? -1 : 0);
    // Subtle dark-cyan outer rim pixels on top/bottom ring edges
    rect(ctx, cx - 5, hy, 10, 1, '#2ca8db');
    rect(ctx, cx - 6, hy + 1, 2, 2, '#4fd6ff');
    rect(ctx, cx + 4, hy + 1, 2, 2, '#4fd6ff');
    rect(ctx, cx - 5, hy + 3, 10, 1, '#4fd6ff');
    // Bright luminous inner ring contour (center stays hollow/transparent!)
    rect(ctx, cx - 4, hy, 8, 1, '#c4f8ff');
    rect(ctx, cx - 5, hy + 1, 2, 1, '#ffffff');
    rect(ctx, cx + 3, hy + 1, 2, 1, '#ffffff');
    rect(ctx, cx - 4, hy + 2, 8, 1, '#9cf5ff');
    // Animated twinkling white light glint gliding around the halo
    const glintX = [-4, -1, 2, 4][f % 4]!;
    rect(ctx, cx + glintX, hy, 2, 1, '#ffffff');
    px(ctx, cx + glintX, hy + 2, '#ffffff');
  });
}

// ============================================================================
// 2. ALL 50 ENEMIES + ALL 5 BESPOKE TOWERING BOSSES
// ============================================================================

type EnemySilhouette =
  | 'bandit'
  | 'maggot'
  | 'nest'
  | 'scorpion'
  | 'rat'
  | 'ratking'
  | 'gator'
  | 'ballguy'
  | 'raven'
  | 'sniper'
  | 'salamander'
  | 'assassin'
  | 'spider'
  | 'crystal'
  | 'snowbot'
  | 'wolf'
  | 'tank'
  | 'freak'
  | 'rhino'
  | 'necro'
  | 'turret'
  | 'guardian'
  | 'dog_guardian'
  | 'molefish'
  | 'turtle'
  | 'idpd'
  | 'van'
  | 'mimic'
  | 'sapling';

interface EnemyVisualSpec {
  shape: EnemySilhouette;
  sizeW: number;
  sizeH: number;
  body: string;
  hi: string;
  dark: string;
  accent: string;
  eye: string;
}

function getEnemyVisual(def: EnemyDef): EnemyVisualSpec {
  switch (def.id) {
    case 'bandit': return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#bd8842', hi: '#ebba6e', dark: '#6e451a', accent: '#cf2f27', eye: '#ff3b3b' };
    case 'jungle_bandit': return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#4a7a42', hi: '#7db86c', dark: '#244521', accent: '#e09d38', eye: '#ffe647' };
    case 'rebel_ally': return { shape: 'bandit', sizeW: 16, sizeH: 16, body: '#699968', hi: '#a3d9a0', dark: '#345736', accent: '#e0cc9f', eye: '#78ff9e' };
    case 'maggot': return { shape: 'maggot', sizeW: 14, sizeH: 12, body: '#ded49c', hi: '#fff9d1', dark: '#948754', accent: '#b8ab72', eye: '#261d17' };
    case 'big_maggot': return { shape: 'maggot', sizeW: 22, sizeH: 18, body: '#d1c68a', hi: '#faefba', dark: '#827542', accent: '#a89a5e', eye: '#ff4738' };
    case 'maggot_nest': return { shape: 'nest', sizeW: 22, sizeH: 20, body: '#8f6544', hi: '#c29167', dark: '#4a2e1a', accent: '#e8df9e', eye: '#ffe666' };
    case 'scorpion': return { shape: 'scorpion', sizeW: 22, sizeH: 20, body: '#d96230', hi: '#ff9d61', dark: '#7a2a12', accent: '#52f04a', eye: '#ffe647' };
    case 'gold_scorpion': return { shape: 'scorpion', sizeW: 24, sizeH: 22, body: '#f2c135', hi: '#fff694', dark: '#99680e', accent: '#ff5238', eye: '#ff2b2b' };
    case 'rat': return { shape: 'rat', sizeW: 18, sizeH: 14, body: '#8f7c6d', hi: '#c2ad9b', dark: '#4c3f36', accent: '#e0949f', eye: '#ff3b3b' };
    case 'green_rat': return { shape: 'rat', sizeW: 16, sizeH: 12, body: '#59a84c', hi: '#91e67c', dark: '#295924', accent: '#d9ff66', eye: '#ffea47' };
    case 'big_rat': return { shape: 'ratking', sizeW: 26, sizeH: 24, body: '#528746', hi: '#85c472', dark: '#264722', accent: '#bdff47', eye: '#ff3b3b' };
    case 'gator': return { shape: 'gator', sizeW: 20, sizeH: 20, body: '#458c48', hi: '#7ac778', dark: '#214a25', accent: '#d1bf80', eye: '#ffe647' };
    case 'buff_gator': return { shape: 'gator', sizeW: 26, sizeH: 24, body: '#34753e', hi: '#68ba70', dark: '#183f20', accent: '#e05538', eye: '#ff4242' };
    case 'ballguy': return { shape: 'ballguy', sizeW: 18, sizeH: 18, body: '#72bd46', hi: '#b8ff73', dark: '#33631d', accent: '#dcff52', eye: '#18141a' };
    case 'fireballer': return { shape: 'ballguy', sizeW: 20, sizeH: 20, body: '#e65826', hi: '#ffb84d', dark: '#87210e', accent: '#fff266', eye: '#ffffff' };
    case 'raven': return { shape: 'raven', sizeW: 20, sizeH: 20, body: '#2c3042', hi: '#5a6382', dark: '#13151f', accent: '#f5be38', eye: '#ff3b3b' };
    case 'sniper': return { shape: 'sniper', sizeW: 18, sizeH: 20, body: '#63705f', hi: '#96a690', dark: '#333b31', accent: '#26232e', eye: '#ff2138' };
    case 'salamander': return { shape: 'salamander', sizeW: 22, sizeH: 18, body: '#de4c28', hi: '#ff9157', dark: '#7d200f', accent: '#ffe347', eye: '#fff27d' };
    case 'assassin': return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#4a4254', hi: '#7d718c', dark: '#221d29', accent: '#e0e4eb', eye: '#ffffff' };
    case 'jungle_assassin': return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#2f5e35', hi: '#5e9c63', dark: '#15301a', accent: '#b0ed7d', eye: '#ffe647' };
    case 'spider': return { shape: 'spider', sizeW: 20, sizeH: 18, body: '#d470ff', hi: '#fae0ff', dark: '#6d1fa3', accent: '#ff94f0', eye: '#ffffff' };
    case 'laser_crystal': return { shape: 'crystal', sizeW: 26, sizeH: 26, body: '#cc52e0', hi: '#fbb0ff', dark: '#6b1982', accent: '#ff3878', eye: '#ffffff' };
    case 'lightning_crystal': return { shape: 'crystal', sizeW: 26, sizeH: 26, body: '#4aa8ed', hi: '#b0f0ff', dark: '#1a528a', accent: '#fff259', eye: '#ffffff' };
    case 'snowbot': return { shape: 'snowbot', sizeW: 20, sizeH: 22, body: '#8fa9bf', hi: '#dceeff', dark: '#3d5166', accent: '#e63e35', eye: '#ff3838' };
    case 'wolf': return { shape: 'wolf', sizeW: 22, sizeH: 18, body: '#aebfcf', hi: '#e6f2fc', dark: '#4d5d6e', accent: '#768899', eye: '#ffe847' };
    case 'snow_tank': return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#627c94', hi: '#a1bed6', dark: '#2f4050', accent: '#de3838', eye: '#ff3838' };
    case 'gold_snow_tank': return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#ebbc34', hi: '#fff491', dark: '#8c610e', accent: '#ff4238', eye: '#ff2b2b' };
    case 'freak': return { shape: 'freak', sizeW: 16, sizeH: 18, body: '#759e74', hi: '#a8d4a3', dark: '#3c593c', accent: '#cf3842', eye: '#e8ff78' };
    case 'rhino_freak': return { shape: 'rhino', sizeW: 26, sizeH: 24, body: '#5f8560', hi: '#91bd8f', dark: '#2f4731', accent: '#f0e7d8', eye: '#ff4242' };
    case 'explo_freak': return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#abc44b', hi: '#e6ff7d', dark: '#5c6b20', accent: '#ff5238', eye: '#fff266' };
    case 'necromancer': return { shape: 'necro', sizeW: 18, sizeH: 20, body: '#5e467a', hi: '#9c7ebf', dark: '#291b3d', accent: '#59ff7a', eye: '#80ff96' };
    case 'turret': return { shape: 'turret', sizeW: 18, sizeH: 18, body: '#b3c4d6', hi: '#f0f7ff', dark: '#465466', accent: '#f5c742', eye: '#ff3344' };
    case 'guardian': return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#4b8263', hi: '#85c79e', dark: '#214532', accent: '#5eff87', eye: '#b2ffc2' };
    case 'explo_guardian': return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#6ca84c', hi: '#b0f07d', dark: '#325920', accent: '#ebff59', eye: '#ffffff' };
    case 'crown_guardian': return { shape: 'guardian', sizeW: 24, sizeH: 26, body: '#52678f', hi: '#8fa8d9', dark: '#26324a', accent: '#f7c942', eye: '#80ffec' };
    case 'guardian_dog': return { shape: 'dog_guardian', sizeW: 28, sizeH: 24, body: '#45755e', hi: '#7cb899', dark: '#1e3d2f', accent: '#73ffa3', eye: '#ccffdc' };
    case 'molefish': return { shape: 'molefish', sizeW: 18, sizeH: 18, body: '#3b8f85', hi: '#73cfc2', dark: '#1b4f4a', accent: '#edc07d', eye: '#ffe647' };
    case 'turtle': return { shape: 'turtle', sizeW: 20, sizeH: 18, body: '#488c42', hi: '#7cc472', dark: '#224a20', accent: '#916438', eye: '#ff4242' };
    case 'idpd_grunt': return { shape: 'idpd', sizeW: 18, sizeH: 18, body: '#386dcc', hi: '#70a8fa', dark: '#193875', accent: '#ebf4fc', eye: '#7df2ff' };
    case 'idpd_inspector': return { shape: 'idpd', sizeW: 18, sizeH: 20, body: '#4780e6', hi: '#85baff', dark: '#1f4082', accent: '#ffdc4d', eye: '#b2f8ff' };
    case 'idpd_shielder': return { shape: 'idpd', sizeW: 22, sizeH: 22, body: '#2c59ad', hi: '#6196f0', dark: '#142b5e', accent: '#80ecff', eye: '#c4f9ff' };
    case 'idpd_van': return { shape: 'van', sizeW: 36, sizeH: 24, body: '#2c5ebd', hi: '#6ba5ff', dark: '#142e66', accent: '#edf6ff', eye: '#ff3b4a' };
    case 'mimic': return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#cc9526', hi: '#f7ce4f', dark: '#7a5310', accent: '#eb2e3d', eye: '#ff3b3b' };
    case 'weapon_mimic': return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#c23035', hi: '#f0595e', dark: '#73171b', accent: '#f5c444', eye: '#ffe647' };
    case 'plant_sapling': return { shape: 'sapling', sizeW: 14, sizeH: 14, body: '#47cc4c', hi: '#91ff7d', dark: '#1d6b26', accent: '#eb3946', eye: '#ffe647' };
    default: return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#bd8842', hi: '#ebba6e', dark: '#6e451a', accent: '#cf2f27', eye: '#ff3b3b' };
  }
}

function drawRegularEnemy(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  spec: EnemyVisualSpec,
  state: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell',
  frame: number,
): void {
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);

  if (state === 'dead') {
    const deadRy = Math.max(2, Math.floor(h * 0.14));
    const deadCy = Math.min(y + h - deadRy - 2, cy + Math.floor(h * 0.2));
    fillPixelEllipse(ctx, cx, deadCy + 1, Math.floor(w * 0.34), deadRy, '#5e141c');
    outlinedEllipse(ctx, cx, deadCy, Math.floor(w * 0.3), Math.max(1, deadRy - 1), spec.dark, INK);
    rect(ctx, cx - Math.floor(w * 0.2), deadCy - 1, Math.floor(w * 0.35), 2, spec.body);
    px(ctx, cx - Math.floor(w * 0.14), deadCy - 1, spec.hi);
    px(ctx, cx - 2, deadCy, INK);
    return;
  }

  const hurt = state === 'hurt';
  const body = hurt ? '#ffffff' : spec.body;
  const hi = hurt ? '#ffffff' : spec.hi;
  const dark = hurt ? '#ffcccc' : spec.dark;
  const accent = hurt ? '#ff6666' : spec.accent;
  const eye = hurt ? '#141118' : spec.eye;
  const bob = state === 'walk' ? (frame % 2 === 0 ? -1 : 0) : state === 'fire' ? -1 : (frame % 2 === 1 ? 1 : 0);
  const ty = cy + bob;
  const stride = state === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;

  switch (spec.shape) {
    case 'maggot': {
      // Segmented glossy wriggling grub
      const rx = Math.floor(w * 0.32);
      const ry = Math.max(2, Math.floor(h * 0.22));
      const my = Math.min(y + h - ry - 2, ty);
      outlinedEllipse(ctx, cx - 2, my, rx - 1, ry, dark, INK);
      outlinedEllipse(ctx, cx + 1, my, rx, ry, body, INK);
      rect(ctx, cx - 2, my - ry + 1, rx, 1, hi);
      px(ctx, cx - 1, my - ry + 1, '#ffffff');
      rect(ctx, cx - 1, my - ry + 2, 1, Math.max(2, ry * 2 - 2), dark);
      rect(ctx, cx + 2, my - ry + 2, 1, Math.max(2, ry * 2 - 2), dark);
      px(ctx, cx + rx - 2, my - 1, eye);
      break;
    }

    case 'nest': {
      // Organic mound hive with shaded ridges & wriggling maggot openings
      const ny = Math.min(y + h - 8, ty + 1);
      outlinedEllipse(ctx, cx, ny, 8, 6, dark, INK);
      fillPixelEllipse(ctx, cx, ny - 1, 7, 5, body);
      fillPixelEllipse(ctx, cx - 2, ny - 2, 4, 2, hi);
      rect(ctx, cx - 5, ny - 1, 3, 3, '#1f120c');
      rect(ctx, cx + 2, ny - 2, 3, 3, '#1f120c');
      rect(ctx, cx - 1, ny + 2, 3, 2, '#1f120c');
      if (state === 'tell' || frame % 2 === 1) {
        rect(ctx, cx - 4, ny, 2, 2, accent);
        rect(ctx, cx + 2, ny - 1, 2, 2, accent);
        px(ctx, cx - 4, ny, '#ffffff');
      }
      break;
    }

    case 'scorpion': {
      // Gleaming armored carapace + segmented curved stinger tail + pincer claws + scuttling legs!
      outlinedEllipse(ctx, cx - 1, ty + 2, Math.floor(w * 0.33), Math.floor(h * 0.23), dark, INK);
      fillPixelEllipse(ctx, cx - 1, ty + 1, Math.floor(w * 0.29), Math.floor(h * 0.18), body);
      // Glossy segmented armor plates & specular shell shine
      rect(ctx, cx - 5, ty, 8, 2, hi);
      px(ctx, cx - 3, ty, '#ffffff');
      rect(ctx, cx - 2, ty + 1, 1, 4, dark);
      rect(ctx, cx + 1, ty + 1, 1, 4, dark);
      // Curved segmented tail rising overhead
      outlinedBox(ctx, cx - 7, ty - 6, 4, 7, dark, INK);
      rect(ctx, cx - 6, ty - 5, 2, 5, body);
      outlinedBox(ctx, cx - 5, ty - 8, 7, 3, body, INK);
      rect(ctx, cx - 4, ty - 7, 4, 1, hi);
      // Glowing toxic/crimson venom stinger bulb
      outlinedBox(ctx, cx + 1, ty - 8, 4, 4, state === 'fire' ? '#ffffff' : accent, INK, true);
      px(ctx, cx + 2, ty - 7, '#ffffff');
      // Twin armored pincer claws + fierce eyes
      outlinedBox(ctx, cx + 4, ty - 2, 5, 3, body, INK);
      px(ctx, cx + 5, ty - 1, hi);
      outlinedBox(ctx, cx + 4, ty + 2, 5, 3, dark, INK);
      rect(ctx, cx + 2, ty + 1, 2, 2, eye);
      px(ctx, cx + 2, ty + 1, '#ffffff');
      // Animated scuttling legs
      rect(ctx, cx - 5 + stride, ty + 6, 2, 2, INK);
      rect(ctx, cx - 1 - stride, ty + 6, 2, 2, INK);
      rect(ctx, cx + 3 + stride, ty + 6, 2, 2, INK);
      break;
    }

    case 'rat': {
      // Hunched scurrying sewer rat with curved pink tail, furry back sheen, pointed snout & ear!
      const ry = Math.max(2, Math.min(4, Math.floor(h * 0.27)));
      const my = Math.min(y + h - ry - 2, ty);
      const tailX0 = Math.max(x + 1, cx - 7);
      // Curving pink rat tail
      drawPixelLine(ctx, tailX0, my + 2 + (frame & 1), cx - 4, my + 1, INK, 2);
      drawPixelLine(ctx, tailX0, my + 2 + (frame & 1), cx - 4, my + 1, accent, 1);
      // Hunched rodent body with 3-tone fur shading
      outlinedEllipse(ctx, cx, my, 5, ry, dark, INK);
      fillPixelEllipse(ctx, cx, my - 1, 4, Math.max(2, ry - 1), body);
      rect(ctx, cx - 3, my - ry + 1, 5, 1, hi);
      // Pointed snout + glossy red eye + rounded ear
      outlinedBox(ctx, cx + 2, my - 2, 5, 3, body, INK);
      px(ctx, cx + 6, my - 1, accent);
      px(ctx, cx + 3, my - 1, eye);
      outlinedBox(ctx, cx - 3, my - ry - 1, 3, 3, accent, INK);
      // Scurrying little paws
      px(ctx, cx - 2 + stride, my + ry, INK);
      px(ctx, cx + 2 - stride, my + ry, INK);
      break;
    }

    case 'ratking': {
      // Hulking bloated sewer Ratking dripping glowing green radiation slime!
      outlinedEllipse(ctx, cx, ty + 1, 10, 8, dark, INK);
      fillPixelEllipse(ctx, cx, ty, 9, 7, body);
      fillPixelEllipse(ctx, cx - 2, ty - 3, 6, 4, hi);
      outlinedEllipse(ctx, cx - 6, ty - 7, 3, 3, dark, INK);
      outlinedEllipse(ctx, cx + 6, ty - 7, 3, 3, dark, INK);
      rect(ctx, cx - 4, ty - 3, 3, 3, eye);
      rect(ctx, cx + 2, ty - 3, 3, 3, eye);
      px(ctx, cx - 3, ty - 3, '#ffffff');
      px(ctx, cx + 3, ty - 3, '#ffffff');
      // Dripping glowing radioactive vomit maw
      outlinedBox(ctx, cx - 5, ty + 2, 10, 5, state === 'fire' ? '#e8ff80' : accent, INK, true);
      rect(ctx, cx - 3, ty + 3, 6, 2, '#ffffff');
      rect(ctx, cx - 2, ty + 7, 2, 2 + (frame & 1), accent);
      break;
    }

    case 'gator': {
      // Hulking scaly bipedal sewer gator with tapered armor back, ribbed belly & jagged toothy snout!
      const bw = Math.floor(w * 0.56);
      const bh = Math.floor(h * 0.64);
      outlinedTrapezoid(ctx, cx, ty - Math.floor(bh / 2), bw - 2, bw + 2, bh, body, INK);
      rect(ctx, cx - Math.floor(bw / 2) + 1, ty - Math.floor(bh / 2) + 1, Math.floor(bw * 0.65), 3, hi);
      rect(ctx, cx + 1, ty - 2, Math.floor(bw * 0.35), Math.floor(bh * 0.5), dark);
      // Dorsal ridge bumps on back
      rect(ctx, cx - Math.floor(bw / 2) - 1, ty - 3, 2, 2, dark);
      rect(ctx, cx - Math.floor(bw / 2) - 1, ty + 1, 2, 2, dark);
      // Ribbed pale belly scales
      rect(ctx, cx - 2, ty, 5, Math.floor(bh * 0.42), accent);
      rect(ctx, cx - 2, ty + 2, 5, 1, dark);
      // Long jutting gator snout + sharp white teeth
      outlinedBox(ctx, cx + 1, ty - 4, Math.floor(bw * 0.62), 4, body, INK);
      rect(ctx, cx + 2, ty - 3, Math.floor(bw * 0.45), 1, hi);
      px(ctx, cx + 2, ty - 1, '#ffffff');
      px(ctx, cx + 4, ty - 1, '#ffffff');
      px(ctx, cx + 6, ty - 1, '#ffffff');
      rect(ctx, cx - 2, ty - 6, 2, 2, eye);
      rect(ctx, cx + 1, ty - 6, 2, 2, eye);
      rect(ctx, cx - 4 + stride, ty + Math.floor(bh / 2), 3, 2, INK);
      rect(ctx, cx + 1 - stride, ty + Math.floor(bh / 2), 3, 2, INK);
      break;
    }

    case 'ballguy': {
      // Translucent pulsing toxic/fire sac creature with specular sheen
      const pulse = state === 'fire' ? 1 : (frame & 1);
      const by = Math.min(cy, ty);
      outlinedEllipse(ctx, cx, by, 5 + pulse, 5 + pulse, dark, INK);
      fillPixelEllipse(ctx, cx, by, 4 + pulse, 4 + pulse, body);
      fillPixelEllipse(ctx, cx - 1, by - 2, 3, 2, hi);
      px(ctx, cx - 2, by - 3, '#ffffff');
      rect(ctx, cx - 3, by - 2, 2, 2, eye);
      rect(ctx, cx + 1, by - 2, 2, 2, eye);
      rect(ctx, cx - 2, by + 2, 4, 2, accent);
      break;
    }

    case 'raven': {
      // Unmistakable dark corvid/crow silhouette with tapered tail, feathered wings & hooked golden beak
      const flying = state === 'fire';
      const flap = flying ? (frame % 2 === 0 ? -3 : 2) : 0;
      // Splayed dark tail feathers behind torso
      outlinedTrapezoid(ctx, cx - 5, ty + 2, 4, 2, 4, dark, INK);
      // Folded or flapping dark corvid wings with cool slate feather sheen
      if (flying) {
        outlinedTrapezoid(ctx, cx - 6, ty - 5 + flap, 7, 3, 6, dark, INK);
        outlinedTrapezoid(ctx, cx + 6, ty - 5 - flap, 7, 3, 6, dark, INK);
        rect(ctx, cx - 8, ty - 4 + flap, 4, 1, hi);
        rect(ctx, cx + 4, ty - 4 - flap, 4, 1, hi);
      } else {
        outlinedEllipse(ctx, cx - 4, ty + 1, 3, 4, dark, INK);
        rect(ctx, cx - 5, ty - 1, 2, 3, hi);
      }
      // Hunched dark feathered crow torso & sculpted head
      outlinedEllipse(ctx, cx, ty + 1, 4, 5, body, INK);
      outlinedEllipse(ctx, cx + 1, ty - 4, 4, 3, body, INK);
      rect(ctx, cx - 1, ty - 6, 4, 1, hi);
      rect(ctx, cx - 2, ty + 3, 5, 2, dark);
      // Hooked golden crow beak + sharp gleaming crimson eye
      outlinedTrapezoid(ctx, cx + 5, ty - 4, 5, 2, 3, accent, INK);
      px(ctx, cx + 4, ty - 4, '#fff5a6');
      rect(ctx, cx + 1, ty - 5, 2, 2, eye);
      px(ctx, cx + 1, ty - 5, '#ffffff');
      // Bird talons
      rect(ctx, cx - 2 + stride, ty + 6, 2, 2, accent);
      rect(ctx, cx + 1 - stride, ty + 6, 2, 2, accent);
      break;
    }

    case 'sniper': {
      // Hooded scrapyard sniper with stealth ghillie cloak, gas mask & blazing red laser optic!
      outlinedTrapezoid(ctx, cx, ty - 7, 5, 11, 13, body, INK);
      rect(ctx, cx - 3, ty - 6, 5, 3, hi);
      rect(ctx, cx + 1, ty - 2, 4, 7, dark);
      // Gas mask faceplate + glowing red sniper optic + white glare
      outlinedBox(ctx, cx - 4, ty - 4, 8, 4, accent, INK);
      rect(ctx, cx - 1, ty - 3, 4, 2, eye);
      px(ctx, cx + 1, ty - 3, '#ffffff');
      // Rifle sling across cloak
      drawPixelLine(ctx, cx - 3, ty + 1, cx + 3, ty + 5, '#3b322c', 1);
      rect(ctx, cx - 3 + stride, ty + 6, 2, 2, INK);
      rect(ctx, cx + 1 - stride, ty + 6, 2, 2, INK);
      break;
    }

    case 'salamander': {
      // Fiery spotted armored lizard with curving tail & flame breath!
      drawPixelLine(ctx, cx - 9, ty + 2, cx - 5, ty + 1, INK, 3);
      drawPixelLine(ctx, cx - 9, ty + 2, cx - 5, ty + 1, dark, 1);
      outlinedEllipse(ctx, cx, ty + 1, 7, 4, dark, INK);
      fillPixelEllipse(ctx, cx, ty, 6, 3, body);
      rect(ctx, cx - 5, ty - 2, 8, 2, hi);
      rect(ctx, cx - 3, ty, 2, 2, accent);
      rect(ctx, cx + 1, ty, 2, 2, accent);
      px(ctx, cx - 3, ty, '#ffffff');
      rect(ctx, cx + 4, ty - 2, 2, 2, eye);
      if (state === 'fire') {
        outlinedEllipse(ctx, cx + 6, ty, 3, 2, '#ff7b1c', '#ffe047');
        px(ctx, cx + 6, ty, '#ffffff');
      }
      break;
    }

    case 'assassin': {
      // Hooded stealth stalker clutching gleaming steel pipe/blade
      outlinedTrapezoid(ctx, cx, ty - 6, 5, 10, 12, body, INK);
      rect(ctx, cx - 3, ty - 5, 5, 2, hi);
      rect(ctx, cx - 3, ty - 3, 6, 3, '#120e16');
      rect(ctx, cx - 2, ty - 2, 2, 1, eye);
      rect(ctx, cx + 1, ty - 2, 2, 1, eye);
      // Gleaming vertical steel weapon held ready
      rect(ctx, cx + 4, ty - 6, 3, 11, INK);
      rect(ctx, cx + 5, ty - 5, 1, 9, accent);
      px(ctx, cx + 5, ty - 5, '#ffffff');
      if (state === 'tell') {
        outlinedBox(ctx, cx - 1, ty - 9, 3, 4, '#ff3847', INK);
      }
      break;
    }

    case 'spider': {
      // High-contrast glowing amethyst Caves Spider with crisp dark outline, rim-lit carapace & bright jointed legs!
      for (let leg = -1; leg <= 1; leg++) {
        const lOff = leg * 3 + (leg % 2 === 0 ? stride : -stride);
        drawPixelLine(ctx, cx - 4, ty + leg * 2, cx - 9, ty + lOff - 1, INK, 3);
        drawPixelLine(ctx, cx - 4, ty + leg * 2, cx - 8, ty + lOff - 1, body, 1);
        px(ctx, cx - 8, ty + lOff - 1, hi);
        drawPixelLine(ctx, cx + 4, ty + leg * 2, cx + 9, ty + lOff - 1, INK, 3);
        drawPixelLine(ctx, cx + 4, ty + leg * 2, cx + 8, ty + lOff - 1, body, 1);
        px(ctx, cx + 8, ty + lOff - 1, hi);
      }
      // Glossy rim-lit crystal spider abdomen & cephalothorax (pops sharply on dark cavern stone!)
      outlinedEllipse(ctx, cx, ty, 6, 5, dark, INK);
      fillPixelEllipse(ctx, cx, ty, 5, 4, body);
      // Bright specular top rim arc so silhouette reads unmistakably
      rect(ctx, cx - 3, ty - 3, 6, 1, hi);
      rect(ctx, cx - 2, ty - 2, 4, 1, '#ffffff');
      // Clustered glowing eyes + luminous fang tips
      px(ctx, cx - 2, ty + 1, eye);
      px(ctx, cx, ty + 1, eye);
      px(ctx, cx + 2, ty + 1, eye);
      px(ctx, cx - 1, ty + 2, accent);
      px(ctx, cx + 1, ty + 2, accent);
      break;
    }

    case 'crystal': {
      // Towering floating faceted Laser / Lightning Crystal with sharp 3-tone prism planes!
      outlinedDiamond(ctx, cx, ty, 9, 10, body, INK);
      fillTrapezoid(ctx, cx - 3, ty - 7, 2, 7, 13, hi);
      fillTrapezoid(ctx, cx + 3, ty - 6, 2, 6, 13, dark);
      drawPixelLine(ctx, cx, ty - 9, cx, ty + 9, '#ffffff', 1);
      // Blazing energy core eye
      outlinedDiamond(ctx, cx, ty, 4, 4, state === 'fire' ? '#ffffff' : accent, INK);
      rect(ctx, cx - 1, ty - 1, 2, 2, eye);
      break;
    }

    case 'snowbot': {
      // Armored bipedal arctic Snowbot with sloped pauldrons, tapered waist & glowing crimson visor (NOT a toaster!)
      // Hydraulic articulated side arms with heavy industrial claws
      outlinedBox(ctx, cx - 9, ty - 2 + stride, 4, 6, dark, INK);
      rect(ctx, cx - 8, ty - 1 + stride, 2, 3, body);
      outlinedBox(ctx, cx + 5, ty - 2 - stride, 4, 6, dark, INK);
      rect(ctx, cx + 6, ty - 1 - stride, 2, 3, body);
      // Armored tapered chest torso & sloped frost-dusted shoulder dome
      outlinedTrapezoid(ctx, cx, ty - 7, 8, 14, 7, body, INK);
      outlinedTrapezoid(ctx, cx, ty, 12, 8, 6, dark, INK);
      // Sunlit arctic armor sheen + frost trim on top shoulders
      rect(ctx, cx - 4, ty - 6, 8, 2, hi);
      rect(ctx, cx - 3, ty - 7, 6, 1, '#ffffff');
      // Armored crimson shoulder stripe & recessed cyclops optic visor
      rect(ctx, cx - 6, ty - 2, 2, 2, accent);
      rect(ctx, cx + 4, ty - 2, 2, 2, accent);
      outlinedBox(ctx, cx - 4, ty - 4, 8, 4, '#14111c', INK);
      rect(ctx, cx - 3, ty - 3, 6, 2, state === 'fire' ? '#ffe047' : eye);
      rect(ctx, cx - 1, ty - 3, 2, 1, '#ffffff');
      // Chest radiator grille
      rect(ctx, cx - 3, ty + 2, 6, 1, hi);
      rect(ctx, cx - 2, ty + 4, 4, 1, body);
      // Heavy stomping arctic tread boots
      outlinedBox(ctx, cx - 5 + stride, ty + 6, 4, 3, '#263140', INK);
      outlinedBox(ctx, cx + 1 - stride, ty + 6, 4, 3, '#263140', INK);
      break;
    }

    case 'wolf': {
      // Lean aggressive grey-white predatory Snow Wolf (angular snout, swept tail, pointed ears — NOT a fluffy sheep!)
      // Swept bushy predator tail behind hindquarters
      drawPixelLine(ctx, cx - 9, ty - 2 + (frame & 1), cx - 5, ty + 1, INK, 3);
      drawPixelLine(ctx, cx - 9, ty - 2 + (frame & 1), cx - 5, ty + 1, dark, 2);
      px(ctx, cx - 9, ty - 2 + (frame & 1), hi);
      // Lean crouching lupine torso with dark slate dorsal fur & pale grey belly
      outlinedTrapezoid(ctx, cx - 1, ty - 2, 11, 13, 6, body, INK);
      rect(ctx, cx - 6, ty - 2, 10, 2, dark);
      rect(ctx, cx - 5, ty, 8, 2, hi);
      // Sharp angled wolf head, swept predator ears & jutting snout with white fangs!
      outlinedTrapezoid(ctx, cx + 4, ty - 5, 5, 7, 5, body, INK);
      outlinedBox(ctx, cx + 5, ty - 3, 5, 3, body, INK);
      rect(ctx, cx + 6, ty - 3, 3, 1, hi);
      px(ctx, cx + 9, ty - 2, INK); // black wolf nose
      px(ctx, cx + 7, ty - 1, '#ffffff'); // bared fang
      // Swept pointed wolf ears
      outlinedTrapezoid(ctx, cx + 2, ty - 8, 1, 3, 4, dark, INK);
      outlinedTrapezoid(ctx, cx + 5, ty - 8, 1, 3, 4, dark, INK);
      // Piercing amber predator eye
      rect(ctx, cx + 4, ty - 4, 2, 2, eye);
      px(ctx, cx + 4, ty - 4, '#ffffff');
      // Lean striding lupine legs
      rect(ctx, cx - 6 + stride, ty + 4, 2, 4, INK);
      px(ctx, cx - 6 + stride, ty + 5, dark);
      rect(ctx, cx - 3 - stride, ty + 4, 2, 3, INK);
      rect(ctx, cx + 2 - stride, ty + 4, 2, 4, INK);
      px(ctx, cx + 2 - stride, ty + 5, body);
      rect(ctx, cx + 5 + stride, ty + 4, 2, 3, INK);
      break;
    }

    case 'tank': {
      // Heavy tracked riveted Snow Tank / Golden Snow Tank
      outlinedBox(ctx, cx - 12, ty - 9, 24, 5, '#222730', INK);
      outlinedBox(ctx, cx - 12, ty + 4, 24, 5, '#222730', INK);
      for (let t = -10; t <= 8; t += 4) {
        rect(ctx, cx + t + (frame & 1), ty - 8, 2, 3, '#5c6675');
        rect(ctx, cx + t + (frame & 1), ty + 5, 2, 3, '#5c6675');
      }
      outlinedBox(ctx, cx - 9, ty - 6, 18, 12, body, INK, true);
      rect(ctx, cx - 8, ty - 5, 16, 2, hi);
      rect(ctx, cx - 8, ty + 3, 16, 2, dark);
      outlinedBox(ctx, cx - 5, ty - 4, 10, 8, dark, INK, true);
      rect(ctx, cx - 3, ty - 2, 5, 4, accent);
      px(ctx, cx - 2, ty - 2, '#ffffff');
      outlinedBox(ctx, cx + 3, ty - 2, 10, 4, body, INK);
      rect(ctx, cx + 4, ty - 1, 8, 1, hi);
      px(ctx, cx - 1, ty - 1, eye);
      break;
    }

    case 'freak': {
      // Hunched crazed lab mutant freak with exposed ribs & manic eyes
      outlinedEllipse(ctx, cx, ty - 1, 5, 5, body, INK);
      rect(ctx, cx - 3, ty - 5, 6, 2, hi);
      rect(ctx, cx - 4, ty + 2, 8, 2, dark);
      rect(ctx, cx - 3, ty - 3, 2, 2, eye);
      rect(ctx, cx + 1, ty - 3, 2, 2, eye);
      rect(ctx, cx - 3, ty, 6, 2, accent);
      px(ctx, cx - 2, ty, '#ffffff');
      px(ctx, cx + 1, ty, '#ffffff');
      rect(ctx, cx - 4 + stride, ty + 5, 3, 2, INK);
      rect(ctx, cx + 1 - stride, ty + 5, 3, 2, INK);
      break;
    }

    case 'rhino': {
      // Hulking armored Rhino Freak with sweeping curved ivory horn!
      outlinedTrapezoid(ctx, cx, ty - 8, 14, 19, 15, body, INK);
      rect(ctx, cx - 7, ty - 7, 13, 3, hi);
      rect(ctx, cx - 8, ty + 2, 16, 4, dark);
      // Curved massive ivory horn
      outlinedTrapezoid(ctx, cx + 8, ty - 9, 2, 6, 7, accent, INK);
      px(ctx, cx + 8, ty - 8, '#ffffff');
      rect(ctx, cx + 1, ty - 4, 3, 2, eye);
      px(ctx, cx + 1, ty - 4, '#ffffff');
      rect(ctx, cx - 6 + stride, ty + 7, 4, 3, INK);
      rect(ctx, cx + 2 - stride, ty + 7, 4, 3, INK);
      break;
    }

    case 'necro': {
      // Hooded Necromancer in pointed purple robe with blazing green eyes & glowing revival staff!
      const hoodY = Math.max(y + 1, ty - 7);
      outlinedTrapezoid(ctx, cx, hoodY, 4, 11, 14, body, INK);
      fillTrapezoid(ctx, cx - 2, hoodY + 2, 2, 4, 11, hi);
      rect(ctx, cx - 4, ty + 5, 8, 1, accent);
      rect(ctx, cx - 3, ty - 4, 6, 4, '#120b1c');
      rect(ctx, cx - 2, ty - 3, 2, 2, eye);
      rect(ctx, cx + 1, ty - 3, 2, 2, eye);
      px(ctx, cx - 2, ty - 3, '#ffffff');
      // Gnarled revival staff + pulsing emerald soul-orb (strictly within 18x20 bounds)
      rect(ctx, cx + 4, ty - 5, 2, 12, INK);
      rect(ctx, cx + 4, ty - 4, 1, 10, '#5e4675');
      const orbY = Math.max(y + 3, ty - 6);
      outlinedDiamond(ctx, cx + 5, orbY, 2, 2, accent, INK);
      px(ctx, cx + 5, orbY, '#ffffff');
      break;
    }

    case 'turret': {
      // High-contrast titanium-silver Labs Turret with hazard stripe base, bright rim highlight & blazing crimson lens!
      outlinedTrapezoid(ctx, cx, ty + 1, 10, 14, 6, dark, INK);
      // High-visibility yellow/black lab hazard collar so turret pops sharply on dark teal floor!
      rect(ctx, cx - 5, ty + 3, 10, 2, '#181a21');
      rect(ctx, cx - 4, ty + 3, 2, 2, accent);
      rect(ctx, cx, ty + 3, 2, 2, accent);
      rect(ctx, cx + 4, ty + 3, 1, 2, accent);
      // Bright brushed silver armored turret dome with crisp specular top edge
      outlinedBox(ctx, cx - 5, ty - 5, 10, 7, body, INK, true);
      rect(ctx, cx - 4, ty - 4, 8, 2, hi);
      rect(ctx, cx - 3, ty - 4, 5, 1, '#ffffff');
      // Heavy twin-braced gun barrel
      outlinedBox(ctx, cx + 3, ty - 3, 6, 4, body, INK);
      rect(ctx, cx + 4, ty - 2, 4, 1, hi);
      px(ctx, cx + 7, ty - 2, '#ffffff');
      // Glowing crimson targeting sensor optic
      outlinedBox(ctx, cx - 3, ty - 2, 4, 3, state === 'fire' ? '#ffffff' : eye, INK);
      px(ctx, cx - 2, ty - 1, '#ffffff');
      break;
    }

    case 'guardian': {
      // Royal floating Palace / Crown Guardian with gilded crown trim & pulsing rad core!
      outlinedTrapezoid(ctx, cx, ty - 10, 8, 14, 16, body, INK);
      fillTrapezoid(ctx, cx - 2, ty - 9, 4, 6, 14, hi);
      // Royal gold palace crown trim
      rect(ctx, cx - 4, ty - 10, 8, 2, '#f5c742');
      px(ctx, cx - 1, ty - 11, '#fff499');
      // Floating glowing energy tendrils underneath
      rect(ctx, cx - 5, ty + 6, 3, 3 + (frame & 1), dark);
      rect(ctx, cx - 1, ty + 6, 3, 4 - (frame & 1), accent);
      rect(ctx, cx + 3, ty + 6, 3, 3 + (frame & 1), dark);
      // Blazing royal eyes & luminous rune reactor core
      rect(ctx, cx - 3, ty - 6, 2, 3, eye);
      rect(ctx, cx + 1, ty - 6, 2, 3, eye);
      px(ctx, cx - 3, ty - 6, '#ffffff');
      px(ctx, cx + 1, ty - 6, '#ffffff');
      outlinedDiamond(ctx, cx, ty + 1, 3, 3, state === 'fire' ? '#ffffff' : accent, INK);
      px(ctx, cx, ty + 1, '#ffffff');
      break;
    }

    case 'dog_guardian': {
      // Massive muscular Palace Guardian Dog beast with royal rune crest & gleaming fangs!
      outlinedEllipse(ctx, cx, ty, 11, 8, dark, INK);
      fillPixelEllipse(ctx, cx, ty - 1, 10, 7, body);
      fillPixelEllipse(ctx, cx - 2, ty - 3, 7, 4, hi);
      // Royal glowing forehead rune
      outlinedDiamond(ctx, cx, ty - 6, 2, 2, accent, INK);
      rect(ctx, cx - 5, ty - 4, 3, 3, eye);
      rect(ctx, cx + 2, ty - 4, 3, 3, eye);
      px(ctx, cx - 4, ty - 4, '#ffffff');
      px(ctx, cx + 3, ty - 4, '#ffffff');
      rect(ctx, cx - 5, ty + 1, 10, 4, '#101c16');
      rect(ctx, cx - 4, ty + 1, 2, 2, '#ffffff');
      rect(ctx, cx + 2, ty + 1, 2, 2, '#ffffff');
      rect(ctx, cx - 7 + stride, ty + 7, 4, 3, dark);
      rect(ctx, cx + 3 - stride, ty + 7, 4, 3, dark);
      break;
    }

    case 'van': {
      // Massive armored IDPD dimensional transport van with glossy windshield & flashing sirens!
      outlinedBox(ctx, cx - 16, ty - 9, 32, 18, body, INK, true);
      rect(ctx, cx - 15, ty - 8, 30, 3, hi);
      rect(ctx, cx - 15, ty + 5, 30, 3, dark);
      rect(ctx, cx - 15, ty - 1, 30, 3, accent);
      outlinedBox(ctx, cx + 5, ty - 6, 8, 12, '#78e8ff', INK);
      drawPixelLine(ctx, cx + 6, ty - 4, cx + 10, ty + 1, '#ffffff', 1);
      // Flashing red/blue siren bar on roof
      outlinedBox(ctx, cx - 3, ty - 7, 5, 5, frame % 2 === 0 ? '#ff3847' : '#38a6ff', INK);
      outlinedBox(ctx, cx - 3, ty + 2, 5, 5, frame % 2 === 0 ? '#38a6ff' : '#ff3847', INK);
      px(ctx, cx - 1, ty - 5, '#ffffff');
      px(ctx, cx - 1, ty + 4, '#ffffff');
      if (state === 'fire') {
        rect(ctx, cx - 17, ty - 6, 4, 12, '#101424');
      }
      break;
    }

    case 'mimic': {
      // Toothy monster chest with glossy bevels & snapping fangs
      outlinedBox(ctx, cx - 7, ty - 6, 14, 12, body, INK, true);
      rect(ctx, cx - 6, ty - 5, 12, 2, hi);
      rect(ctx, cx - 6, ty + 3, 12, 2, dark);
      if (state === 'fire' || state === 'tell' || frame % 2 === 1) {
        rect(ctx, cx - 6, ty - 2, 12, 5, '#180c12');
        rect(ctx, cx - 5, ty - 2, 2, 2, '#ffffff');
        rect(ctx, cx - 1, ty - 2, 2, 2, '#ffffff');
        rect(ctx, cx + 3, ty - 2, 2, 2, '#ffffff');
        rect(ctx, cx - 3, ty + 1, 6, 2, accent);
        px(ctx, cx - 3, ty - 4, eye);
        px(ctx, cx + 2, ty - 4, eye);
      } else {
        rect(ctx, cx - 6, ty, 12, 2, '#ffe066');
        outlinedBox(ctx, cx - 2, ty - 1, 4, 3, '#fff5a6', INK);
      }
      break;
    }

    case 'turtle': {
      outlinedEllipse(ctx, cx, ty + 1, 7, 5, accent, INK);
      fillPixelEllipse(ctx, cx - 1, ty, 5, 3, '#bf8c58');
      px(ctx, cx - 2, ty - 1, '#e8c499');
      outlinedBox(ctx, cx + 4, ty - 3, 5, 5, body, INK, true);
      rect(ctx, cx + 5, ty - 2, 3, 1, eye);
      break;
    }

    case 'molefish': {
      outlinedEllipse(ctx, cx, ty, 5, 6, body, INK);
      rect(ctx, cx - 3, ty - 5, 6, 2, hi);
      rect(ctx, cx - 3, ty - 3, 2, 2, eye);
      rect(ctx, cx + 1, ty - 3, 2, 2, eye);
      outlinedBox(ctx, cx - 2, ty + 1, 4, 3, accent, INK);
      break;
    }

    case 'sapling': {
      outlinedEllipse(ctx, cx, ty, 4, 4, body, INK);
      rect(ctx, cx - 2, ty - 5, 4, 3, accent);
      px(ctx, cx - 1, ty - 4, '#ff8590');
      px(ctx, cx - 1, ty - 1, eye);
      px(ctx, cx + 1, ty - 1, eye);
      break;
    }

    case 'idpd': {
      // Visor IDPD Squad: sloped cobalt tactical armor, beveled shoulder pauldrons, curved glowing cyan visor!
      const halfW = Math.floor(w * 0.32);
      const halfH = Math.floor(h * 0.35);
      outlinedTrapezoid(ctx, cx, ty - halfH, halfW * 2 - 4, halfW * 2, halfH * 2, body, INK);
      rect(ctx, cx - halfW + 2, ty - halfH + 1, halfW * 2 - 4, 2, hi);
      rect(ctx, cx - halfW + 1, ty + 1, halfW * 2 - 2, halfH - 2, dark);
      // Helmet crest & curved glowing cyan visor with specular reflection
      rect(ctx, cx - 1, ty - halfH, 2, 2, accent);
      rect(ctx, cx - 3, ty - halfH + 3, 6, 3, '#0e1626');
      rect(ctx, cx - 2, ty - halfH + 4, 5, 1, eye);
      px(ctx, cx - 1, ty - halfH + 4, '#ffffff');
      // Beveled armored shoulder pauldrons
      rect(ctx, cx - halfW - 1, ty, 3, 3, accent);
      rect(ctx, cx + halfW - 2, ty, 3, 3, accent);
      px(ctx, cx - halfW - 1, ty, '#ffffff');
      if (state === 'fire' && w >= 22) {
        fillPixelEllipse(ctx, cx, ty, halfW + 3, halfH + 3, 'rgba(90, 225, 255, 0.35)');
      }
      rect(ctx, cx - 3 + stride, ty + halfH, 2, 2, INK);
      rect(ctx, cx + 1 - stride, ty + halfH, 2, 2, INK);
      break;
    }

    default: {
      // Masked Desert Bandit / Jungle Bandit / Ally: peaked hood, dark mask, glowing eyes, fluttering scarf!
      outlinedTrapezoid(ctx, cx, ty - 6, 6, 10, 11, body, INK);
      rect(ctx, cx - 3, ty - 5, 6, 2, hi);
      rect(ctx, cx - 4, ty + 2, 8, 2, dark);
      // Dark bandit mask & glowing hostile eyes with white pinpoint
      rect(ctx, cx - 4, ty - 4, 8, 4, '#211715');
      rect(ctx, cx - 3, ty - 3, 2, 2, eye);
      rect(ctx, cx + 1, ty - 3, 2, 2, eye);
      px(ctx, cx - 3, ty - 3, '#ffffff');
      px(ctx, cx + 1, ty - 3, '#ffffff');
      // Outlaw bandana scarf + fluttering tail
      rect(ctx, cx - 4, ty, 8, 2, accent);
      rect(ctx, cx - 6, ty + 1 + (frame & 1), 3, 2, accent);
      px(ctx, cx, ty + 2, '#f5c742'); // belt buckle
      rect(ctx, cx - 3 + stride, ty + 5, 2, 2, INK);
      rect(ctx, cx + 1 - stride, ty + 5, 2, 2, INK);
      break;
    }
  }
}

// ----------------- ALL 5 BESPOKE TOWERING BOSSES -----------------

function drawBigBandit(ctx: DrawCtx, x: number, y: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell'): void {
  const cx = x + 18;
  const cy = y + 18;
  if (mode === 'dead') {
    fillPixelEllipse(ctx, cx, cy + 9, 14, 5, '#66141c');
    outlinedEllipse(ctx, cx, cy + 7, 13, 5, '#633c18', INK);
    rect(ctx, cx - 9, cy + 4, 16, 4, '#b87d34');
    rect(ctx, cx - 6, cy + 5, 10, 2, '#cc2b2b');
    return;
  }
  const hurt = mode === 'hurt';
  const coat = hurt ? '#ffffff' : '#b87d34';
  const coatHi = hurt ? '#ffffff' : '#ebb663';
  const coatDark = hurt ? '#ffcccc' : '#6b4218';
  const scarf = hurt ? '#ff6666' : '#d12828';
  const bob = mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f & 1);
  const stride = mode === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
  const ty = cy + bob;

  // Heavy outlaw boots
  outlinedBox(ctx, cx - 9 + stride, cy + 10, 6, 5, '#2b1e1a', INK);
  outlinedBox(ctx, cx + 3 - stride, cy + 10, 6, 5, '#2b1e1a', INK);
  px(ctx, cx - 8 + stride, cy + 11, '#5e4942');
  // Broad tattered duster coat with contoured shoulders & 3-tone shading
  outlinedTrapezoid(ctx, cx, ty - 6, 20, 26, 18, coat, INK);
  fillTrapezoid(ctx, cx - 5, ty - 5, 9, 12, 14, coatHi);
  rect(ctx, cx - 11, ty + 7, 22, 4, coatDark);
  // Diagonal gleaming brass bullet bandolier + belt buckle
  for (let b = 0; b < 5; b++) {
    outlinedBox(ctx, cx - 8 + b * 3, ty - 2 + b * 2, 4, 3, '#f5cc47', INK);
    px(ctx, cx - 7 + b * 3, ty - 1 + b * 2, '#ffffff');
  }
  outlinedBox(ctx, cx - 2, ty + 6, 5, 4, '#f5cc47', INK);
  // Crimson outlaw scarf + billowing desert tail
  outlinedBox(ctx, cx - 10, ty - 6, 20, 4, scarf, INK);
  rect(ctx, cx - 9, ty - 5, 14, 1, '#ff6b6b');
  outlinedTrapezoid(ctx, cx - 13, ty - 5 + (f & 1), 5, 7, 5, scarf, INK);
  // Masked outlaw king head + wide-brimmed wasteland hat (strictly in bounds)
  outlinedBox(ctx, cx - 8, ty - 14, 16, 9, '#241b18', INK, true);
  outlinedTrapezoid(ctx, cx, Math.max(y + 1, ty - 16), 14, 24, 4, coatDark, INK);
  rect(ctx, cx - 9, Math.max(y + 2, ty - 15), 18, 2, coatHi);
  // Menacing glowing goggle-eyes
  rect(ctx, cx - 5, ty - 10, 4, 3, mode === 'tell' ? '#ffe047' : '#ff2e2e');
  rect(ctx, cx + 1, ty - 10, 4, 3, mode === 'tell' ? '#ffe047' : '#ff2e2e');
  px(ctx, cx - 4, ty - 9, '#ffffff');
  px(ctx, cx + 2, ty - 9, '#ffffff');
  if (mode === 'fire') {
    outlinedBox(ctx, cx + 8, ty - 2, 9, 6, '#697585', INK);
    rect(ctx, cx + 9, ty - 1, 7, 1, '#b8c8db');
    rect(ctx, cx + 15, ty - 3, 3, 8, '#ffe047');
    rect(ctx, cx + 16, ty - 1, 2, 4, '#ffffff');
  }
}

function drawBigDog(ctx: DrawCtx, x: number, y: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'charge' | 'sleep'): void {
  const cx = x + 28;
  const cy = y + 28;
  if (mode === 'dead') {
    fillPixelEllipse(ctx, cx, cy + 12, 24, 9, 'rgba(10, 8, 12, 0.5)');
    outlinedEllipse(ctx, cx, cy + 8, 22, 11, '#3b2e29', INK);
    fillPixelEllipse(ctx, cx, cy + 6, 16, 7, '#241c1a');
    rect(ctx, cx - 10, cy + 2, 20, 6, '#5c463b');
    rect(ctx, cx - 3, cy + 3, 6, 4, '#6e1d1d');
    return;
  }
  const hurt = mode === 'hurt';
  const sleep = mode === 'sleep';
  const hull = hurt ? '#ffffff' : sleep ? '#6e5243' : '#856552';
  const hullHi = hurt ? '#ffffff' : sleep ? '#9e7a64' : '#c29a7f';
  const hullDark = hurt ? '#ffcccc' : '#452f24';
  const rust = hurt ? '#ffcccc' : '#9e4c2b';
  const steel = hurt ? '#ffdddd' : '#57616e';
  const bob = sleep ? 2 : mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f & 1);
  const legOff = sleep ? 0 : mode === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
  const ty = cy + bob;

  // Heavy grounded hull shadow beneath Big Dog
  fillPixelEllipse(ctx, cx, cy + 16, 23, 8, 'rgba(10, 8, 12, 0.52)');

  // 4 Rusted articulated hydraulic spider-tank legs (upper iron femur + piston rod + armored knee + clawed foot!)
  const legSpecs: ReadonlyArray<{ side: -1 | 1; oy: number; shift: number }> = [
    { side: -1, oy: -9, shift: legOff },
    { side: 1, oy: -9, shift: -legOff },
    { side: -1, oy: 6, shift: -legOff },
    { side: 1, oy: 6, shift: legOff },
  ];
  for (const leg of legSpecs) {
    const s = leg.side;
    const kneeX = cx + s * (sleep ? 17 : 20);
    const kneeY = ty + leg.oy + leg.shift;
    const hipX = cx + s * 13;
    const hipY = ty + leg.oy + 2;
    const footX = cx + s * (sleep ? 19 : 23);
    const footY = kneeY + (sleep ? 5 : 8);
    // Upper rusted steel strut + gleaming hydraulic piston rod
    drawPixelLine(ctx, hipX, hipY, kneeX, kneeY, INK, 6);
    drawPixelLine(ctx, hipX, hipY, kneeX, kneeY, steel, 4);
    drawPixelLine(ctx, hipX, hipY - 1, kneeX, kneeY - 1, rust, 2);
    drawPixelLine(ctx, hipX, hipY + 1, kneeX, kneeY + 1, '#b5c4d4', 1);
    // Lower articulated piston shin + oxidized iron plating
    drawPixelLine(ctx, kneeX, kneeY, footX, footY, INK, 6);
    drawPixelLine(ctx, kneeX, kneeY, footX, footY, '#424954', 4);
    drawPixelLine(ctx, kneeX - s, kneeY + 1, footX - s, footY - 1, rust, 2);
    // Riveted knee joint cap
    outlinedEllipse(ctx, kneeX, kneeY, 3, 3, steel, INK);
    px(ctx, kneeX - 1, kneeY - 1, '#c4d2e0');
    // Heavy clawed scrap-steel foot pad
    outlinedBox(ctx, footX - 3, footY - 2, 7, 4, '#2b3038', INK);
    rect(ctx, footX - 2, footY - 1, 5, 1, '#6d7887');
  }

  // Colossal riveted weathered dome hull with 3-tone shading & rust weathering
  outlinedEllipse(ctx, cx, ty, 19, 16, hull, INK);
  fillPixelEllipse(ctx, cx - 2, ty - 4, 15, 9, hullHi);
  fillPixelEllipse(ctx, cx + 2, ty + 6, 16, 7, hullDark);
  // Weathered rust blotches on armor plates
  if (!hurt) {
    rect(ctx, cx - 14, ty - 7, 5, 3, rust);
    rect(ctx, cx + 8, ty + 4, 6, 3, rust);
    rect(ctx, cx - 8, ty + 7, 4, 2, '#73341d');
  }
  // Armor plate weld seams & bright specular rivets
  rect(ctx, cx - 16, ty, 32, 2, INK);
  rect(ctx, cx - 1, ty - 14, 2, 28, INK);
  for (const [rx, ry] of [[-10, -9], [9, -9], [-12, 4], [11, 4], [-5, -11], [5, -11]] as const) {
    rect(ctx, cx + rx, ty + ry, 2, 2, '#2e221d');
    px(ctx, cx + rx, ty + ry, '#ebd2ba');
  }

  // Twin side gatling turrets & missile pods with hazard trim
  outlinedBox(ctx, cx - 24, ty - 5, 10, 11, steel, INK, true);
  rect(ctx, cx - 23, ty - 3, 8, 2, '#e6b83c');
  rect(ctx, cx - 23, ty + 1, 8, 2, '#3a424d');
  outlinedBox(ctx, cx + 14, ty - 5, 10, 11, steel, INK, true);
  rect(ctx, cx + 15, ty - 3, 8, 2, '#e6b83c');
  rect(ctx, cx + 15, ty + 1, 8, 2, '#3a424d');
  if (mode === 'fire') {
    rect(ctx, cx - 27, ty - 3, 4, 7, '#ffe047');
    rect(ctx, cx + 23, ty - 3, 4, 7, '#ffe047');
    rect(ctx, cx - 26, ty - 1, 2, 3, '#ffffff');
    rect(ctx, cx + 24, ty - 1, 2, 3, '#ffffff');
  }

  // Central cyclops laser optic (dimmed armored shutter when sleeping!)
  outlinedEllipse(ctx, cx, ty + 1, 8, 7, '#21181f', INK);
  if (sleep) {
    fillPixelEllipse(ctx, cx, ty + 1, 6, 5, '#3b242a');
    rect(ctx, cx - 5, ty, 10, 2, '#1c151c');
    rect(ctx, cx - 3, ty + 2, 6, 1, '#7a2024');
    // Subtle idle vent steam puff while dormant
    const steamY = ty - 16 - (f & 1) * 2;
    fillPixelEllipse(ctx, cx + 5, steamY, 3, 2, 'rgba(200, 215, 225, 0.55)');
  } else {
    fillPixelEllipse(ctx, cx, ty + 1, 6, 5, mode === 'charge' ? '#ffe047' : '#ff3024');
    fillPixelEllipse(ctx, cx, ty + 1, 4, 3, '#ff9e59');
    rect(ctx, cx - 2, ty - 1, 3, 2, '#ffffff');
  }
}

function drawLilHunter(ctx: DrawCtx, x: number, y: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'lift' | 'land'): void {
  const cx = x + 14;
  const cy = y + 16;
  if (mode === 'dead') {
    outlinedEllipse(ctx, cx, cy + 7, 10, 4, '#243c70', INK);
    rect(ctx, cx - 6, cy + 5, 10, 3, '#4c80e0');
    rect(ctx, cx + 3, cy + 4, 4, 3, '#ff6a26');
    px(ctx, cx + 4, cy + 4, '#fff280');
    return;
  }
  const hurt = mode === 'hurt';
  const armor = hurt ? '#ffffff' : '#3d70d4';
  const armorHi = hurt ? '#ffffff' : '#80b8ff';
  const armorDark = hurt ? '#ffcccc' : '#1b3878';
  const trim = hurt ? '#ffffff' : '#ebf2fc';
  const bob = mode === 'lift' ? -2 : (f & 1);
  const ty = cy + bob;

  // Twin brushed-steel dorsal jetpack cylinders + blazing layered plasma plumes!
  outlinedBox(ctx, cx - 10, ty - 6, 5, 11, '#546275', INK, true);
  outlinedBox(ctx, cx + 5, ty - 6, 5, 11, '#546275', INK, true);
  rect(ctx, cx - 9, ty - 5, 2, 9, '#a6b9cf');
  rect(ctx, cx + 6, ty - 5, 2, 9, '#a6b9cf');
  const flameH = mode === 'lift' || mode === 'land' ? 7 + (f & 1) * 2 : 4 + (f & 1) * 2;
  rect(ctx, cx - 9, ty + 5, 3, flameH, '#ff681c');
  rect(ctx, cx - 8, ty + 5, 1, Math.max(2, flameH - 2), '#fff599');
  rect(ctx, cx + 6, ty + 5, 3, flameH, '#ff681c');
  rect(ctx, cx + 7, ty + 5, 1, Math.max(2, flameH - 2), '#fff599');

  // Sleek sloped armored IDPD captain torso + shoulder pauldrons
  outlinedTrapezoid(ctx, cx, ty - 3, 12, 14, 11, armor, INK);
  rect(ctx, cx - 5, ty - 2, 10, 2, trim);
  rect(ctx, cx - 5, ty + 4, 10, 3, armorDark);
  // Sloped helmet + glowing cyan visor with specular spark
  outlinedTrapezoid(ctx, cx, ty - 12, 8, 12, 9, armor, INK);
  rect(ctx, cx - 4, ty - 11, 7, 2, armorHi);
  outlinedBox(ctx, cx - 4, ty - 9, 8, 4, '#0d1526', INK);
  rect(ctx, cx - 3, ty - 8, 6, 2, '#6ef2ff');
  rect(ctx, cx - 2, ty - 8, 3, 1, '#ffffff');
  // Armored boots
  const stride = mode === 'walk' ? (f % 2 === 0 ? 1 : -1) : 0;
  outlinedBox(ctx, cx - 5 + stride, ty + 8, 4, 5, armorDark, INK);
  outlinedBox(ctx, cx + 1 - stride, ty + 8, 4, 5, armorDark, INK);
}

function drawKrunkedThrone(ctx: DrawCtx, x: number, y: number, f: number, mode: 'off' | 'on' | 'activate' | 'beam' | 'death'): void {
  const cx = x + 48;
  const cy = y + 44;
  if (mode === 'death') {
    // Cracked ruined Krunked Throne rubble + bubbling radioactive pool
    fillPixelEllipse(ctx, cx, cy + 16, 38, 16, '#1c6e2c');
    fillPixelEllipse(ctx, cx, cy + 16, 26, 10, '#49e862');
    outlinedBox(ctx, cx - 34, cy - 10, 68, 36, '#262b38', INK, true);
    rect(ctx, cx - 26, cy - 4, 52, 22, '#141721');
    rect(ctx, cx - 14, cy, 28, 12, '#353e52');
    rect(ctx, cx - 6, cy + 2, 12, 6, '#6eff82');
    px(ctx, cx - 2, cy + 3, '#ffffff');
    return;
  }

  const off = mode === 'off';
  const pulse = f % 2 === 0 ? 1 : 0;
  const stone = off ? '#23293b' : '#2a334a';
  const stoneMid = off ? '#333c54' : '#3d4969';
  const stoneHi = off ? '#465270' : '#5c6d96';
  const stoneDark = '#131724';
  const gold = off ? '#9e7f34' : '#deb447';
  const goldHi = off ? '#c9ad59' : '#fff099';
  const radDeep = off ? '#10291b' : '#16632a';
  const radBright = off ? '#1d4a2d' : mode === 'beam' ? '#dcffe0' : pulse ? '#59ff73' : '#36db54';
  const radCore = off ? '#2d6b42' : mode === 'beam' ? '#ffffff' : '#d4ffd9';

  // Heavy grounded dais drop shadow + floor power conduits feeding into flanks
  fillPixelEllipse(ctx, cx, cy + 33, 45, 10, 'rgba(6, 7, 14, 0.62)');
  outlinedBox(ctx, cx - 47, cy + 18, 8, 7, '#2b3242', INK);
  outlinedBox(ctx, cx + 39, cy + 18, 8, 7, '#2b3242', INK);
  rect(ctx, cx - 46, cy + 20, 6, 3, radBright);
  rect(ctx, cx + 40, cy + 20, 6, 3, radBright);

  // Tiered stepped obsidian dais base with carved stone joints & riveted gilded trim
  outlinedBox(ctx, cx - 44, cy + 20, 88, 18, stoneDark, INK);
  rect(ctx, cx - 42, cy + 21, 84, 3, stone);
  outlinedBox(ctx, cx - 40, cy + 14, 80, 12, stone, INK);
  rect(ctx, cx - 38, cy + 15, 76, 2, stoneHi);
  rect(ctx, cx - 36, cy + 26, 72, 2, gold);
  rect(ctx, cx - 34, cy + 26, 24, 1, goldHi);
  // Recessed stone stair seams & rivets on dais
  for (const sx of [-28, -14, 14, 28]) {
    rect(ctx, cx + sx, cy + 15, 1, 10, stoneDark);
    px(ctx, cx + sx + 2, cy + 29, stoneHi);
  }

  // Flank pressurized rad coolant tanks + metallic containment clamps + rivets + rising bubbles
  outlinedBox(ctx, cx - 43, cy - 14, 13, 34, '#363f54', INK, true);
  outlinedBox(ctx, cx + 30, cy - 14, 13, 34, '#363f54', INK, true);
  rect(ctx, cx - 42, cy - 13, 2, 32, '#5a6885');
  rect(ctx, cx + 40, cy - 13, 2, 32, '#1d2230');
  rect(ctx, cx - 40, cy - 10, 7, 26, radDeep);
  rect(ctx, cx - 39, cy - 10, 5, 26, radBright);
  rect(ctx, cx - 39, cy - 10, 2, 24, radCore);
  rect(ctx, cx + 33, cy - 10, 7, 26, radDeep);
  rect(ctx, cx + 34, cy - 10, 5, 26, radBright);
  rect(ctx, cx + 34, cy - 10, 2, 24, radCore);
  for (const bandY of [-5, 5, 14]) {
    rect(ctx, cx - 42, cy + bandY, 11, 3, gold);
    rect(ctx, cx + 31, cy + bandY, 11, 3, gold);
    px(ctx, cx - 41, cy + bandY, goldHi);
    px(ctx, cx + 32, cy + bandY, goldHi);
    px(ctx, cx - 33, cy + bandY + 1, INK);
    px(ctx, cx + 40, cy + bandY + 1, INK);
  }
  if (!off) {
    px(ctx, cx - 36, cy - 6 + pulse * 3, '#ffffff');
    px(ctx, cx + 36, cy + 2 - pulse * 3, '#ffffff');
  }

  // Towering beveled carved obsidian monolith backrest with deep masonry shading & weathered cracks
  outlinedTrapezoid(ctx, cx, cy - 38, 50, 58, 54, stone, INK);
  fillTrapezoid(ctx, cx - 12, cy - 36, 20, 24, 50, stoneMid);
  rect(ctx, cx - 24, cy - 36, 48, 3, stoneHi);
  rect(ctx, cx - 25, cy - 34, 4, 46, stoneHi);
  rect(ctx, cx + 21, cy - 34, 5, 46, stoneDark);
  // Carved architectural masonry block seams & metallic corner rivets
  rect(ctx, cx - 24, cy - 26, 48, 1, stoneDark);
  rect(ctx, cx - 26, cy - 10, 52, 1, stoneDark);
  for (const [rx, ry] of [[-21, -33], [19, -33], [-23, -22], [21, -22], [-25, -4], [23, -4]] as const) {
    rect(ctx, cx + rx, cy + ry, 2, 2, stoneDark);
    px(ctx, cx + rx, cy + ry, '#8d9ec4');
  }
  // Weathered carved stone fissure cracks
  drawPixelLine(ctx, cx - 19, cy - 31, cx - 15, cy - 25, stoneDark, 1);
  drawPixelLine(ctx, cx + 17, cy - 29, cx + 13, cy - 23, stoneDark, 1);
  drawPixelLine(ctx, cx - 21, cy - 16, cx - 17, cy - 12, stoneDark, 1);
  // Embedded vertical glowing emerald power conduits inside backrest stone
  rect(ctx, cx - 19, cy - 24, 2, 18, radDeep);
  rect(ctx, cx - 19, cy - 22, 1, 14, radBright);
  rect(ctx, cx + 17, cy - 24, 2, 18, radDeep);
  rect(ctx, cx + 18, cy - 22, 1, 14, radBright);

  // Sculpted gothic gilded crown spires towering at apex (strictly within 96x88)
  outlinedTrapezoid(ctx, cx - 19, cy - 42, 4, 10, 7, stoneHi, INK);
  outlinedTrapezoid(ctx, cx + 19, cy - 42, 4, 10, 7, stoneHi, INK);
  outlinedTrapezoid(ctx, cx, cy - 43, 6, 16, 10, gold, INK);
  fillTrapezoid(ctx, cx - 1, cy - 42, 3, 7, 7, goldHi);
  outlinedDiamond(ctx, cx, cy - 37, 3, 3, radBright, INK);
  if (!off) px(ctx, cx, cy - 38, '#ffffff');

  // Heavy sculpted obsidian armrests with gilded edge plates & iron bolts
  outlinedBox(ctx, cx - 34, cy - 4, 14, 24, stoneHi, INK, true);
  outlinedBox(ctx, cx + 20, cy - 4, 14, 24, stoneHi, INK, true);
  rect(ctx, cx - 32, cy, 10, 16, stoneDark);
  rect(ctx, cx + 22, cy, 10, 16, stoneDark);
  rect(ctx, cx - 30, cy + 2, 6, 12, stone);
  rect(ctx, cx + 24, cy + 2, 6, 12, stone);
  rect(ctx, cx - 32, cy - 3, 10, 2, gold);
  rect(ctx, cx + 22, cy - 3, 10, 2, gold);
  px(ctx, cx - 31, cy - 3, goldHi);
  px(ctx, cx + 23, cy - 3, goldHi);
  px(ctx, cx - 29, cy + 16, '#8d9ec4');
  px(ctx, cx + 29, cy + 16, '#8d9ec4');

  // Ornate glowing emerald reactor core chamber in center of the Throne!
  outlinedBox(ctx, cx - 16, cy - 24, 32, 34, stoneDark, INK, true);
  rect(ctx, cx - 14, cy - 18, 28, 3, radBright);
  rect(ctx, cx - 14, cy - 6, 28, 3, radBright);
  if (!off) rect(ctx, cx - 13, cy - 18, 26, 1, radCore);
  // Colossal multi-ring reactor jewel
  outlinedEllipse(ctx, cx, cy - 10, 11 + (mode === 'beam' ? 2 : 0), 11 + (mode === 'beam' ? 2 : 0), radDeep, INK);
  fillPixelEllipse(ctx, cx, cy - 10, 8, 8, radBright);
  fillPixelEllipse(ctx, cx, cy - 10, 4 + (off ? 0 : pulse), 4 + (off ? 0 : pulse), radCore);
  if (!off) px(ctx, cx - 2, cy - 12, '#ffffff');

  // Lower royal seat & forward mega-beam cannon emitter
  outlinedBox(ctx, cx - 14, cy + 6, 28, 12, stoneMid, INK);
  rect(ctx, cx - 12, cy + 7, 24, 2, stoneHi);
  outlinedBox(ctx, cx - 8, cy + 12, 16, 16, '#1f2536', INK);
  rect(ctx, cx - 5, cy + 14, 10, 12, mode === 'beam' ? '#ffffff' : radBright);
  rect(ctx, cx - 3, cy + 15, 6, 10, radCore);
  if (mode === 'beam') {
    rect(ctx, cx - 10, cy + 24, 20, 14, '#59ff80');
    rect(ctx, cx - 6, cy + 24, 12, 14, '#d9ffe3');
    rect(ctx, cx - 3, cy + 24, 6, 14, '#ffffff');
  } else if (mode === 'activate') {
    rect(ctx, cx - 22, cy - 30, 44, 2, '#b8ffc9');
  }
}

function drawThroneII(ctx: DrawCtx, x: number, y: number, f: number, mode: 'idle' | 'hurt' | 'death' | 'appear'): void {
  const cx = x + 42;
  const cy = y + 42;
  if (mode === 'death') {
    fillPixelEllipse(ctx, cx, cy + 6, 30, 14, '#1b6629');
    fillPixelEllipse(ctx, cx, cy + 6, 18, 8, '#59ff73');
    outlinedEllipse(ctx, cx, cy + 4, 16, 9, '#2a3347', INK);
    return;
  }
  const hurt = mode === 'hurt';
  const wingSpread = f % 2 === 0 ? 0 : 3;
  const hull = hurt ? '#ffffff' : '#2a3842';
  const hullHi = hurt ? '#ffffff' : '#536e7d';
  const hullDark = hurt ? '#ffcccc' : '#172026';
  const rad = hurt ? '#d9ffe0' : (f % 2 === 0 ? '#52ff6e' : '#a3ffb3');
  const core = '#ffffff';

  // Swept biomechanical obsidian & emerald plasma wings with glowing energy veins!
  for (const side of [-1, 1]) {
    const wx = side < 0 ? cx - 36 - wingSpread : cx + 8 + wingSpread;
    outlinedBox(ctx, wx, cy - 23, 28, 12, hull, INK, true);
    rect(ctx, wx + 2, cy - 21, 24, 3, hullHi);
    rect(ctx, wx + 2, cy - 14, 24, 3, rad);
    rect(ctx, wx + 4, cy - 13, 20, 1, core);
    // Secondary lower wing feather blades
    const lx = side < 0 ? cx - 32 - wingSpread : cx + 8 + wingSpread;
    outlinedBox(ctx, lx, cy - 9, 24, 10, hullDark, INK, true);
    rect(ctx, lx + 2, cy - 7, 20, 3, hull);
    rect(ctx, lx + 2, cy - 4, 20, 3, rad);
    // Crackling rad plasma wingtip arcs
    rect(ctx, side < 0 ? wx - 2 : wx + 26, cy - 19, 4, 9, rad);
    rect(ctx, side < 0 ? wx - 1 : wx + 27, cy - 17, 2, 5, core);
  }

  // Central armored Leviathan reactor chassis with beveled highlights
  outlinedEllipse(ctx, cx, cy, 18, 22, hullDark, INK);
  fillPixelEllipse(ctx, cx, cy, 16, 20, hull);
  fillPixelEllipse(ctx, cx - 2, cy - 6, 13, 9, hullHi);
  // Sculpted crowned dorsal reactor spires
  outlinedTrapezoid(ctx, cx - 8, cy - 31, 3, 7, 11, hullHi, INK);
  outlinedTrapezoid(ctx, cx, cy - 35, 3, 8, 15, rad, INK);
  rect(ctx, cx - 1, cy - 32, 2, 10, core);
  outlinedTrapezoid(ctx, cx + 8, cy - 31, 3, 7, 11, hullHi, INK);

  // Blazing multi-ring radiation reactor eye core!
  outlinedEllipse(ctx, cx, cy - 2, 12, 12, '#124a1e', INK);
  fillPixelEllipse(ctx, cx, cy - 2, 9, 9, rad);
  fillPixelEllipse(ctx, cx, cy - 2, 5, 5, core);
  // Satellite glowing energy eyes
  for (const [ex, ey] of [[-12, -10], [8, -10], [-8, 12], [4, 12]] as const) {
    outlinedBox(ctx, cx + ex, cy + ey, 5, 4, rad, INK);
    px(ctx, cx + ex + 1, cy + ey + 1, core);
  }
  // Trailing plasma energy tendrils beneath
  rect(ctx, cx - 6, cy + 20, 4, 12 + (f & 1) * 3, rad);
  rect(ctx, cx - 1, cy + 22, 3, 14 - (f & 1) * 2, core);
  rect(ctx, cx + 3, cy + 20, 4, 12 + (f & 1) * 3, rad);
}

function registerAllEnemiesAndBosses(b: FallbackAtlasBuilder): void {
  // 1. ALL 5 BESPOKE TOWERING BOSSES
  // Big Bandit (36x36)
  b.addSprite('sprBanditBossIdle', 36, 36, 18, 18, 2, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'idle'));
  b.addSprite('sprBanditBossWalk', 36, 36, 18, 18, 4, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'walk'));
  b.addSprite('sprBanditBossHurt', 36, 36, 18, 18, 1, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'hurt'));
  b.addSprite('sprBanditBossDead', 36, 36, 18, 18, 1, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'dead'));
  b.addSprite('sprBanditBossFire', 36, 36, 18, 18, 2, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'fire'));
  b.addSprite('sprBanditBossTell', 36, 36, 18, 18, 2, (ctx, x, y, _w, _h, f) => drawBigBandit(ctx, x, y, f, 'tell'));
  b.addAlias('sprBanditBossDash', 'sprBanditBossWalk');
  b.addSprite('sprBanditBossGun', 28, 12, 6, 6, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 2, 24, 7, '#5c6673', INK);
    rect(ctx, x + 3, y + 3, 22, 2, '#adc0d4');
    rect(ctx, x + 12, y + 4, 13, 1, INK);
    rect(ctx, x + 12, y + 6, 13, 1, INK);
    rect(ctx, x + 18, y + 2, 2, 7, '#f5c742');
    outlinedBox(ctx, x + 4, y + 7, 5, 4, '#854e28', INK);
  });

  // Big Dog (56x56)
  b.addSprite('sprScrapBossIdle', 56, 56, 28, 28, 2, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'idle'));
  b.addSprite('sprScrapBossSleep', 56, 56, 28, 28, 2, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'sleep'));
  b.addSprite('sprScrapBossWalk', 56, 56, 28, 28, 4, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'walk'));
  b.addSprite('sprScrapBossHurt', 56, 56, 28, 28, 1, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'hurt'));
  b.addSprite('sprScrapBossDead', 56, 56, 28, 28, 1, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'dead'));
  b.addSprite('sprScrapBossFire', 56, 56, 28, 28, 2, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'fire'));
  b.addSprite('sprScrapBossCharge', 56, 56, 28, 28, 2, (ctx, x, y, _w, _h, f) => drawBigDog(ctx, x, y, f, 'charge'));
  b.addSprite('sprScrapBossMissileIdle', 14, 8, 7, 4, 2, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 3, y + 1, 10, 6, '#c94032', INK, true);
    rect(ctx, x + 5, y + 2, 6, 2, '#ff8a70');
    px(ctx, x + 11, y + 3, '#ffffff');
    rect(ctx, x + 1, y + 2, 3, 4, f === 0 ? '#ffe047' : '#ff681c');
  });

  // Lil' Hunter (28x32)
  b.addSprite('sprLilHunter', 28, 32, 14, 16, 2, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'idle'));
  b.addAlias('sprLilHunterIdle', 'sprLilHunter');
  b.addSprite('sprLilHunterWalk', 28, 32, 14, 16, 4, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'walk'));
  b.addSprite('sprLilHunterHurt', 28, 32, 14, 16, 1, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'hurt'));
  b.addSprite('sprLilHunterDead', 28, 32, 14, 16, 1, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'dead'));
  b.addSprite('sprLilHunterLift', 28, 32, 14, 16, 2, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'lift'));
  b.addSprite('sprLilHunterLand', 28, 32, 14, 16, 2, (ctx, x, y, _w, _h, f) => drawLilHunter(ctx, x, y, f, 'land'));
  b.addAlias('sprLilHunterFire', 'sprLilHunterLift');
  b.addAlias('sprLilHunterDash', 'sprLilHunterLift');
  b.addSprite('sprLilHunterGun', 22, 10, 5, 5, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 2, 18, 5, '#3b73d6', INK);
    rect(ctx, x + 3, y + 3, 15, 2, '#80e5ff');
    px(ctx, x + 16, y + 3, '#ffffff');
    outlinedBox(ctx, x + 3, y + 6, 4, 3, '#1e3c78', INK);
  });

  // The Krunked Throne (96x88) + seamless continuous emerald-white 36x24 vertical mega-beam
  b.addSprite('sprNothingOff', 96, 88, 48, 44, 1, (ctx, x, y, _w, _h, f) => drawKrunkedThrone(ctx, x, y, f, 'off'));
  b.addSprite('sprNothingOn', 96, 88, 48, 44, 2, (ctx, x, y, _w, _h, f) => drawKrunkedThrone(ctx, x, y, f, 'on'));
  b.addAlias('sprNothingIdle', 'sprNothingOn');
  b.addAlias('sprNothingWalk', 'sprNothingOn');
  b.addAlias('sprNothingHurt', 'sprNothingOn');
  b.addSprite('sprNothingActivate', 96, 88, 48, 44, 2, (ctx, x, y, _w, _h, f) => drawKrunkedThrone(ctx, x, y, f, 'activate'));
  b.addSprite('sprNothingFire', 96, 88, 48, 44, 2, (ctx, x, y, _w, _h, f) => drawKrunkedThrone(ctx, x, y, f, 'beam'));
  b.addSprite('sprNothingBeam', 36, 24, 18, 12, 3, (ctx, x, y, w, h, f) => {
    // Seamless glowing emerald-white continuous vertical energy column (ZERO horizontal ladder rungs!)
    const shift = f === 1 ? 1 : f === 2 ? -1 : 0;
    // Soft deep emerald outer plasma containment
    rect(ctx, x + 2, y, w - 4, h, '#0e5222');
    // Vivid electric emerald plasma sheath
    rect(ctx, x + 4, y, w - 8, h, '#28d458');
    // High-energy neon mint inner stream
    rect(ctx, x + 8 + shift, y, w - 16, h, '#7aff9c');
    // Continuous blazing pure-white hot beam core
    rect(ctx, x + 12, y, w - 24, h, '#e8ffed');
    rect(ctx, x + 14 - shift, y, 8, h, '#ffffff');
    // Subtle vertical streaming plasma filaments along edges (purely longitudinal, never horizontal bars!)
    const segY = (f * 7) % h;
    rect(ctx, x + 3, y + segY, 2, Math.min(7, h - segY), '#80ff9e');
    rect(ctx, x + w - 5, y + ((segY + 11) % h), 2, Math.min(7, h - ((segY + 11) % h)), '#80ff9e');
    rect(ctx, x + 10, y + ((segY + 5) % h), 1, Math.min(8, h - ((segY + 5) % h)), '#ffffff');
    rect(ctx, x + w - 11, y + ((segY + 15) % h), 1, Math.min(8, h - ((segY + 15) % h)), '#ffffff');
  });
  b.addSprite('sprNothingDeath', 96, 88, 48, 44, 1, (ctx, x, y, _w, _h, f) => drawKrunkedThrone(ctx, x, y, f, 'death'));
  b.addAlias('sprNothingDead', 'sprNothingDeath');
  b.addAlias('sprNothingDash', 'sprNothingOn');

  // Throne II (84x84)
  b.addSprite('sprNothing2Idle', 84, 84, 42, 42, 2, (ctx, x, y, _w, _h, f) => drawThroneII(ctx, x, y, f, 'idle'));
  b.addAlias('sprNothing2Walk', 'sprNothing2Idle');
  b.addSprite('sprNothing2Hurt', 84, 84, 42, 42, 1, (ctx, x, y, _w, _h, f) => drawThroneII(ctx, x, y, f, 'hurt'));
  b.addSprite('sprNothing2Death', 84, 84, 42, 42, 1, (ctx, x, y, _w, _h, f) => drawThroneII(ctx, x, y, f, 'death'));
  b.addAlias('sprNothing2Dead', 'sprNothing2Death');
  b.addSprite('sprNothing2Appear', 84, 84, 42, 42, 2, (ctx, x, y, _w, _h, f) => drawThroneII(ctx, x, y, f, 'appear'));
  b.addAlias('sprNothing2Fire', 'sprNothing2Appear');
  b.addAlias('sprNothing2Dash', 'sprNothing2Idle');

  // 2. ALL 45 REGULAR / SECRET / IDPD / MIMIC / ALLY ENEMIES FROM src/data/enemies.ts
  for (const def of Object.values(ENEMIES)) {
    if (def.isBoss) continue;
    const vis = getEnemyVisual(def);
    const ox = Math.floor(vis.sizeW / 2);
    const oy = Math.floor(vis.sizeH / 2);

    b.addSprite(def.sprites.idle, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
      drawRegularEnemy(ctx, x, y, w, h, vis, 'idle', f),
    );
    if (def.sprites.walk !== def.sprites.idle) {
      b.addSprite(def.sprites.walk, vis.sizeW, vis.sizeH, ox, oy, 4, (ctx, x, y, w, h, f) =>
        drawRegularEnemy(ctx, x, y, w, h, vis, 'walk', f),
      );
    }
    b.addSprite(def.sprites.hurt, vis.sizeW, vis.sizeH, ox, oy, 1, (ctx, x, y, w, h, f) =>
      drawRegularEnemy(ctx, x, y, w, h, vis, 'hurt', f),
    );
    b.addSprite(def.sprites.dead, vis.sizeW, vis.sizeH, ox, oy, 1, (ctx, x, y, w, h, f) =>
      drawRegularEnemy(ctx, x, y, w, h, vis, 'dead', f),
    );
    if (def.sprites.fire) {
      b.addSprite(def.sprites.fire, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemy(ctx, x, y, w, h, vis, 'fire', f),
      );
    }
    if (def.sprites.tell) {
      b.addSprite(def.sprites.tell, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemy(ctx, x, y, w, h, vis, 'tell', f),
      );
    }
    if (def.sprites.gun && !b.hasSprite(def.sprites.gun)) {
      if (def.id === 'raven') {
        // Proportional compact dark gunmetal scrapyard carbine (NOT a giant bright white stick!)
        b.addSprite(def.sprites.gun, 13, 6, 4, 3, 1, (ctx, x, y) => {
          outlinedBox(ctx, x + 1, y + 1, 4, 4, '#6e4528', INK);
          outlinedBox(ctx, x + 4, y + 1, 8, 3, '#4c5563', INK);
          rect(ctx, x + 5, y + 2, 6, 1, '#8492a6');
          rect(ctx, x + 6, y + 3, 2, 2, '#2d333d');
        });
      } else if (def.id === 'sniper') {
        b.addSprite(def.sprites.gun, 17, 7, 5, 4, 1, (ctx, x, y) => {
          outlinedBox(ctx, x + 1, y + 2, 5, 4, '#475243', INK);
          outlinedBox(ctx, x + 5, y + 2, 11, 3, '#3b4240', INK);
          rect(ctx, x + 6, y + 3, 9, 1, '#75827c');
          outlinedBox(ctx, x + 7, y, 5, 3, '#22262b', INK);
          px(ctx, x + 10, y + 1, '#ff3344');
        });
      } else if (def.isIdpd) {
        b.addSprite(def.sprites.gun, 15, 7, 4, 4, 1, (ctx, x, y) => {
          outlinedBox(ctx, x + 2, y + 1, 11, 4, '#366cc7', INK);
          rect(ctx, x + 3, y + 2, 9, 1, '#7de6ff');
          outlinedBox(ctx, x + 3, y + 4, 4, 3, '#1e3361', INK);
        });
      } else {
        b.addSprite(def.sprites.gun, 14, 7, 4, 4, 1, (ctx, x, y) => {
          outlinedBox(ctx, x + 1, y + 2, 4, 4, '#7d4d2a', INK);
          outlinedBox(ctx, x + 4, y + 1, 9, 4, '#636d7a', INK);
          rect(ctx, x + 5, y + 2, 7, 1, '#a8b6c7');
        });
      }
    }
  }

  // Legacy/renderer prefix aliases so every direct lookup resolves seamlessly
  const enemyAliases: ReadonlyArray<[string, string]> = [
    ['sprMaggotSpawnIdle', 'sprMSpawnIdle'],
    ['sprMaggotSpawnWalk', 'sprMSpawnIdle'],
    ['sprMaggotSpawnHurt', 'sprMSpawnHurt'],
    ['sprMaggotSpawnDead', 'sprMSpawnDead'],
    ['sprBallguyIdle', 'sprExploderIdle'],
    ['sprBallguyWalk', 'sprExploderWalk'],
    ['sprBallguyHurt', 'sprExploderHurt'],
    ['sprBallguyDead', 'sprExploderDead'],
    ['sprAssassinIdle', 'sprMeleeIdle'],
    ['sprAssassinWalk', 'sprMeleeWalk'],
    ['sprAssassinHurt', 'sprMeleeHurt'],
    ['sprAssassinDead', 'sprMeleeDead'],
    ['sprGuardianDogIdle', 'sprDogGuardianWalk'],
    ['sprGuardianDogWalk', 'sprDogGuardianWalk'],
    ['sprGuardianDogHurt', 'sprDogGuardianHurt'],
    ['sprGuardianDogDead', 'sprDogGuardianDead'],
    ['sprGoldSnowTankIdle', 'sprGoldTankIdle'],
  ];
  for (const [alias, target] of enemyAliases) {
    b.addAlias(alias, target);
  }
}

// ============================================================================
// 3. COMPLETE 142-WEAPON ARSENAL & ALL 70+ PROJECTILES / FX
// ============================================================================

type WeaponShape =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'minigun'
  | 'multi_mg'
  | 'shotgun'
  | 'double_shotgun'
  | 'flak'
  | 'flamer'
  | 'crossbow'
  | 'disc'
  | 'nader'
  | 'bazooka'
  | 'laser_pistol'
  | 'laser_rifle'
  | 'plasma'
  | 'lightning'
  | 'wrench'
  | 'screwdriver'
  | 'shovel'
  | 'sword'
  | 'hammer'
  | 'guitar'
  | 'eggplant';

function classifyWeaponShape(w: WeaponDef): WeaponShape {
  const id = w.id.toLowerCase();
  if (id.includes('eggplant')) return 'eggplant';
  if (id.includes('guitar')) return 'guitar';
  if (id.includes('wrench')) return 'wrench';
  if (id.includes('screwdriver')) return 'screwdriver';
  if (id.includes('shovel')) return 'shovel';
  if (id.includes('sword')) return 'sword';
  if (id.includes('hammer') || id.includes('jackhammer')) return 'hammer';
  if (id.includes('disc')) return 'disc';
  if (id.includes('crossbow') || id.includes('bow') || id.includes('splinter') || id.includes('seeker')) return 'crossbow';
  if (id.includes('bazooka') || id.includes('nuke') || id.includes('devastator') || id.includes('hyper_launcher')) return 'bazooka';
  if (id.includes('grenade') || id.includes('nader') || id.includes('blood_cannon') || id.includes('blood_launcher')) return 'nader';
  if (id.includes('flamethrower') || id.includes('dragon') || id.includes('incinerator') || id.includes('flame_cannon')) return 'flamer';
  if (id.includes('flak')) return 'flak';
  if (id.includes('double_shotgun') || id.includes('double_flame') || id.includes('super_slugger') || id.includes('eraser')) return 'double_shotgun';
  if (id.includes('shotgun') || id.includes('slugger') || id.includes('wave_gun') || id.includes('flare')) return 'shotgun';
  if (id.includes('minigun') || id.includes('gatling')) return 'minigun';
  if (id.includes('triple') || id.includes('quadruple') || id.includes('gun_gun')) return 'multi_mg';
  if (id.includes('plasma') || id.includes('ion')) return 'plasma';
  if (id.includes('lightning')) return 'lightning';
  if (id.includes('laser')) return id.includes('pistol') ? 'laser_pistol' : 'laser_rifle';
  if (id.includes('smg') || id.includes('pop_gun') || id.includes('frog') || id.includes('party')) return 'smg';
  if (id.includes('rifle') || id.includes('machinegun') || id.includes('smart_gun') || id.includes('sentry')) return 'rifle';
  return 'pistol';
}

interface WeaponPalette {
  metal: string;
  hi: string;
  dark: string;
  grip: string;
  gripHi: string;
  glow: string;
  isGold: boolean;
  isUltra: boolean;
}

function getWeaponPalette(w: WeaponDef): WeaponPalette {
  const id = w.id.toLowerCase();
  if (w.golden || id.includes('gold')) {
    return { metal: '#f5c436', hi: '#fff69e', dark: '#996511', grip: '#6e3b1d', gripHi: '#a66238', glow: '#ffffff', isGold: true, isUltra: false };
  }
  if (w.ultra || id.includes('ultra')) {
    return { metal: '#35d956', hi: '#b5ffbd', dark: '#146926', grip: '#242b33', gripHi: '#526273', glow: '#ebffed', isGold: false, isUltra: true };
  }
  if (w.cursed) {
    return { metal: '#913be0', hi: '#e396ff', dark: '#451475', grip: '#291538', gripHi: '#593078', glow: '#ff70e8', isGold: false, isUltra: false };
  }
  if (id.includes('blood')) {
    return { metal: '#cf2938', hi: '#ff7380', dark: '#6b1119', grip: '#3d1c24', gripHi: '#753847', glow: '#ff96a0', isGold: false, isUltra: false };
  }
  if (id.includes('rogue') || id.includes('ion') || w.sprite.includes('Popo')) {
    return { metal: '#3c73cc', hi: '#7dbbff', dark: '#1a3873', grip: '#243047', gripHi: '#4a628c', glow: '#96f5ff', isGold: false, isUltra: false };
  }
  if (id.includes('rusty')) {
    return { metal: '#a65e3b', hi: '#d48d66', dark: '#5c2c18', grip: '#4d2b18', gripHi: '#804c2e', glow: '#eda878', isGold: false, isUltra: false };
  }
  if (id.includes('toxic') || id.includes('frog')) {
    return { metal: '#4bad49', hi: '#91eb7a', dark: '#225924', grip: '#38472e', gripHi: '#607852', glow: '#ccff5c', isGold: false, isUltra: false };
  }
  if (id.includes('flame') || id.includes('dragon') || id.includes('incinerator') || id.includes('flare')) {
    return { metal: '#bd4c32', hi: '#f0855e', dark: '#692014', grip: '#3b2520', gripHi: '#6b443b', glow: '#ffe347', isGold: false, isUltra: false };
  }
  if (id.includes('black')) {
    return { metal: '#302b3d', hi: '#6d6487', dark: '#14111c', grip: '#d9323a', gripHi: '#ff737a', glow: '#b096ff', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'energy') {
    const isPlasmaBlade =
      id.includes('energy_sword') ||
      id.includes('energy_hammer') ||
      id.includes('energy_screwdriver') ||
      id.includes('plasma');
    return {
      metal: '#6a7d96',
      hi: '#b5cbe3',
      dark: '#313d52',
      grip: '#262d3d',
      gripHi: '#4e5c78',
      glow: isPlasmaBlade ? '#3dff94' : id.includes('lightning') ? '#6ef2ff' : '#ff385c',
      isGold: false,
      isUltra: false,
    };
  }
  if (w.ammoType === 'bolt') {
    return { metal: '#996f42', hi: '#cfa26d', dark: '#52371d', grip: '#3d2817', gripHi: '#6e492c', glow: '#6eff78', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'explosive') {
    return { metal: '#5a7054', hi: '#91a889', dark: '#2d3b2a', grip: '#453528', gripHi: '#755c47', glow: '#ff9633', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'shell') {
    return { metal: '#828f9e', hi: '#c2cedb', dark: '#404954', grip: '#8f522b', gripHi: '#c77c4a', glow: '#ff6a33', isGold: false, isUltra: false };
  }
  return { metal: '#9ca8b8', hi: '#dce6f2', dark: '#4a5461', grip: '#784b2c', gripHi: '#b0744a', glow: '#ffe047', isGold: false, isUltra: false };
}

function drawWeaponArt(ctx: DrawCtx, x: number, y: number, _w: number, h: number, def: WeaponDef): void {
  const shape = classifyWeaponShape(def);
  const pal = getWeaponPalette(def);
  const my = y + Math.floor(h / 2);

  switch (shape) {
    case 'eggplant': {
      outlinedEllipse(ctx, x + 13, my, 7, 4, '#6e2ea8', INK);
      fillPixelEllipse(ctx, x + 12, my - 1, 5, 2, '#a356e6');
      rect(ctx, x + 10, my - 2, 3, 1, '#f0ccff');
      outlinedBox(ctx, x + 4, my - 2, 4, 4, '#46b54b', INK, true);
      px(ctx, x + 5, my - 1, '#9cff85');
      break;
    }

    case 'guitar': {
      outlinedEllipse(ctx, x + 7, my, 5, 4, pal.metal, INK);
      fillPixelEllipse(ctx, x + 6, my - 1, 3, 2, pal.hi);
      px(ctx, x + 7, my, INK);
      outlinedBox(ctx, x + 11, my - 2, 11, 3, pal.grip, INK);
      rect(ctx, x + 12, my - 1, 9, 1, pal.glow);
      outlinedBox(ctx, x + 20, my - 3, 3, 5, pal.metal, INK);
      break;
    }

    case 'wrench': {
      outlinedBox(ctx, x + 2, my - 2, 15, 4, pal.metal, INK);
      rect(ctx, x + 3, my - 1, 13, 1, pal.hi);
      rect(ctx, x + 3, my + 1, 13, 1, pal.dark);
      outlinedBox(ctx, x + 15, my - 4, 7, 8, pal.metal, INK, true);
      rect(ctx, x + 16, my - 3, 5, 2, pal.hi);
      ctx.clearRect(x + 19, my - 1, 4, 2);
      break;
    }

    case 'screwdriver': {
      outlinedBox(ctx, x + 2, my - 2, 7, 5, def.id.includes('energy') ? pal.glow : '#de3838', INK, true);
      rect(ctx, x + 3, my - 1, 5, 1, '#ffabab');
      outlinedBox(ctx, x + 9, my - 1, 12, 3, pal.metal, INK);
      rect(ctx, x + 10, my, 10, 1, pal.hi);
      px(ctx, x + 20, my, '#ffffff');
      break;
    }

    case 'shovel': {
      outlinedBox(ctx, x + 2, my - 1, 13, 3, pal.grip, INK);
      rect(ctx, x + 3, my - 1, 11, 1, pal.gripHi);
      outlinedBox(ctx, x + 14, my - 4, 8, 8, pal.metal, INK, true);
      rect(ctx, x + 15, my - 3, 6, 2, pal.hi);
      rect(ctx, x + 15, my + 2, 6, 1, pal.dark);
      px(ctx, x + 20, my - 2, '#ffffff');
      break;
    }

    case 'sword': {
      const isEnergyBlade = def.id.includes('energy');
      if (isEnergyBlade) {
        // Iconic neon-green / electric-cyan plasma Energy Sword!
        outlinedBox(ctx, x + 1, my - 1, 6, 3, '#333d4f', INK);
        rect(ctx, x + 2, my, 4, 1, '#6f82a3');
        px(ctx, x + 1, my, '#42ff98');
        // Sculpted plasma emitter crossguard
        outlinedBox(ctx, x + 6, my - 4, 4, 8, '#4a5a75', INK, true);
        rect(ctx, x + 7, my - 3, 2, 6, '#3dff94');
        // Crackling neon-green/cyan plasma blade tapering to sharp tip
        outlinedBox(ctx, x + 9, my - 2, 14, 5, '#19b868', '#0d4a2b', true);
        rect(ctx, x + 10, my - 2, 12, 4, '#3dff94');
        rect(ctx, x + 10, my - 1, 12, 2, '#9effdf');
        rect(ctx, x + 10, my, 10, 1, '#ffffff');
        px(ctx, x + 22, my, '#ffffff');
      } else {
        outlinedBox(ctx, x + 2, my - 1, 5, 3, pal.grip, INK);
        px(ctx, x + 2, my, pal.glow); // pommel gem
        outlinedBox(ctx, x + 6, my - 4, 3, 8, pal.glow, INK);
        outlinedBox(ctx, x + 8, my - 2, 15, 4, pal.metal, INK, true);
        rect(ctx, x + 9, my - 1, 12, 1, '#ffffff');
        rect(ctx, x + 9, my + 1, 11, 1, pal.dark);
      }
      break;
    }

    case 'hammer': {
      outlinedBox(ctx, x + 2, my - 1, 13, 3, pal.grip, INK);
      rect(ctx, x + 3, my - 1, 11, 1, pal.gripHi);
      outlinedBox(ctx, x + 13, my - 5, 9, 10, pal.metal, INK, true);
      rect(ctx, x + 14, my - 4, 7, 2, pal.hi);
      rect(ctx, x + 14, my + 3, 7, 1, pal.dark);
      if (def.ammoType === 'energy') {
        rect(ctx, x + 15, my - 2, 5, 4, pal.glow);
        px(ctx, x + 17, my - 1, '#ffffff');
      }
      break;
    }

    case 'crossbow': {
      outlinedBox(ctx, x + 14, my - 5, 4, 11, pal.dark, INK, true);
      rect(ctx, x + 15, my - 4, 2, 9, pal.metal);
      px(ctx, x + 15, my - 4, pal.hi);
      outlinedBox(ctx, x + 2, my - 2, 16, 4, pal.metal, INK);
      rect(ctx, x + 3, my - 1, 14, 1, pal.hi);
      rect(ctx, x + 12, my - 1, 11, 2, pal.glow);
      px(ctx, x + 21, my - 1, '#ffffff');
      break;
    }

    case 'disc': {
      outlinedBox(ctx, x + 3, my - 3, 14, 6, pal.metal, INK);
      rect(ctx, x + 4, my - 2, 12, 2, pal.hi);
      rect(ctx, x + 4, my + 1, 12, 1, pal.dark);
      outlinedEllipse(ctx, x + 17, my, 4, 4, pal.glow, INK);
      px(ctx, x + 17, my, '#ffffff');
      break;
    }

    case 'bazooka': {
      outlinedBox(ctx, x + 1, my - 4, 21, 7, pal.metal, INK);
      rect(ctx, x + 2, my - 3, 19, 2, pal.hi);
      rect(ctx, x + 2, my + 1, 19, 1, pal.dark);
      outlinedBox(ctx, x + 18, my - 5, 5, 9, pal.glow, INK, true);
      rect(ctx, x + 19, my - 4, 2, 3, '#ffffff');
      outlinedBox(ctx, x + 6, my + 2, 4, 4, pal.grip, INK);
      break;
    }

    case 'nader': {
      outlinedBox(ctx, x + 2, my - 2, 5, 5, pal.grip, INK);
      outlinedBox(ctx, x + 5, my - 3, 16, 6, pal.metal, INK);
      rect(ctx, x + 6, my - 2, 14, 2, pal.hi);
      outlinedBox(ctx, x + 9, my - 1, 6, 5, pal.dark, INK);
      rect(ctx, x + 10, my, 4, 2, pal.glow);
      px(ctx, x + 11, my, '#ffffff');
      break;
    }

    case 'minigun': {
      outlinedBox(ctx, x + 2, my - 4, 10, 8, pal.dark, INK, true);
      rect(ctx, x + 3, my - 3, 8, 2, pal.metal);
      outlinedBox(ctx, x + 11, my - 4, 12, 3, pal.metal, INK);
      outlinedBox(ctx, x + 11, my - 1, 12, 3, pal.hi, INK);
      outlinedBox(ctx, x + 11, my + 2, 12, 3, pal.dark, INK);
      rect(ctx, x + 16, my - 4, 2, 9, pal.glow);
      px(ctx, x + 16, my - 3, '#ffffff');
      break;
    }

    case 'multi_mg': {
      // Cohesive Triple/Quadruple Machinegun body with reinforced receiver, braced triple-barrel shroud & front clamp!
      outlinedBox(ctx, x + 1, my - 1, 5, 5, pal.grip, INK, true);
      rect(ctx, x + 2, my, 3, 1, pal.gripHi);
      // Heavy braced receiver + underslung ammo drum
      outlinedBox(ctx, x + 4, my - 4, 10, 7, pal.metal, INK, true);
      rect(ctx, x + 5, my - 3, 8, 2, pal.hi);
      rect(ctx, x + 5, my + 1, 8, 1, pal.dark);
      outlinedBox(ctx, x + 8, my + 2, 5, 4, pal.dark, INK);
      rect(ctx, x + 9, my + 3, 3, 1, pal.glow);
      // Unified triple-barrel assembly bound by heavy front shroud collar (NOT 3 floating bars!)
      outlinedBox(ctx, x + 13, my - 4, 10, 8, pal.dark, INK);
      rect(ctx, x + 14, my - 3, 8, 1, pal.hi);
      rect(ctx, x + 14, my - 1, 9, 2, pal.metal);
      rect(ctx, x + 14, my + 2, 8, 1, pal.hi);
      // Braced steel front barrel clamp
      rect(ctx, x + 18, my - 4, 2, 8, pal.hi);
      rect(ctx, x + 19, my - 4, 1, 8, pal.dark);
      break;
    }

    case 'double_shotgun':
    case 'flak': {
      outlinedBox(ctx, x + 2, my - 1, 6, 5, pal.grip, INK, true);
      rect(ctx, x + 3, my, 4, 1, pal.gripHi);
      outlinedBox(ctx, x + 7, my - 4, 16, 4, pal.hi, INK);
      outlinedBox(ctx, x + 7, my - 1, 16, 4, pal.metal, INK);
      rect(ctx, x + 8, my - 3, 14, 1, '#ffffff');
      rect(ctx, x + 10, my + 2, 6, 2, pal.grip);
      break;
    }

    case 'shotgun': {
      outlinedBox(ctx, x + 2, my - 1, 6, 5, pal.grip, INK, true);
      rect(ctx, x + 3, my, 4, 1, pal.gripHi);
      outlinedBox(ctx, x + 7, my - 3, 15, 4, pal.metal, INK);
      rect(ctx, x + 8, my - 2, 13, 1, pal.hi);
      px(ctx, x + 20, my - 2, '#ffffff');
      outlinedBox(ctx, x + 11, my + 1, 6, 3, pal.grip, INK);
      rect(ctx, x + 12, my + 2, 4, 1, pal.gripHi);
      break;
    }

    case 'flamer': {
      outlinedBox(ctx, x + 3, my - 3, 16, 5, pal.metal, INK);
      rect(ctx, x + 4, my - 2, 14, 2, pal.hi);
      outlinedBox(ctx, x + 7, my + 1, 8, 4, '#de3829', INK, true);
      rect(ctx, x + 8, my + 2, 5, 1, '#ff8578');
      outlinedBox(ctx, x + 19, my - 3, 4, 4, pal.glow, INK);
      px(ctx, x + 20, my - 2, '#ffffff');
      break;
    }

    case 'plasma':
    case 'lightning': {
      outlinedBox(ctx, x + 2, my - 4, 19, 7, pal.metal, INK, true);
      rect(ctx, x + 3, my - 3, 17, 2, pal.hi);
      rect(ctx, x + 3, my + 1, 17, 1, pal.dark);
      // Glowing dual energy coils with bright white specular core
      rect(ctx, x + 8, my - 3, 3, 5, pal.glow);
      rect(ctx, x + 13, my - 3, 3, 5, pal.glow);
      rect(ctx, x + 9, my - 2, 1, 3, '#ffffff');
      rect(ctx, x + 14, my - 2, 1, 3, '#ffffff');
      px(ctx, x + 19, my - 1, '#ffffff');
      outlinedBox(ctx, x + 4, my + 2, 4, 4, pal.grip, INK);
      break;
    }

    case 'laser_rifle': {
      // Sculpted chunky sci-fi Laser Rifle with receiver, recessed glowing capacitor cell & twin focusing rails (NO candy-cane stripes!)
      outlinedBox(ctx, x + 1, my - 2, 6, 5, pal.grip, INK, true);
      rect(ctx, x + 2, my - 1, 4, 1, pal.gripHi);
      outlinedBox(ctx, x + 5, my - 4, 12, 7, pal.metal, INK, true);
      rect(ctx, x + 6, my - 3, 10, 2, pal.hi);
      rect(ctx, x + 6, my + 1, 10, 1, pal.dark);
      // Recessed glowing energy capacitor core inside receiver
      outlinedBox(ctx, x + 8, my - 2, 6, 4, '#1b1424', INK);
      rect(ctx, x + 9, my - 1, 4, 2, pal.glow);
      px(ctx, x + 10, my - 1, '#ffffff');
      // Extended slate-steel focusing barrel & glowing emitter nozzle
      outlinedBox(ctx, x + 16, my - 3, 6, 5, pal.dark, INK);
      rect(ctx, x + 17, my - 2, 4, 1, pal.hi);
      rect(ctx, x + 21, my - 2, 2, 3, pal.glow);
      px(ctx, x + 21, my - 1, '#ffffff');
      outlinedBox(ctx, x + 7, my + 2, 4, 4, pal.grip, INK);
      break;
    }

    case 'laser_pistol': {
      outlinedBox(ctx, x + 5, my - 4, 13, 6, pal.metal, INK, true);
      rect(ctx, x + 6, my - 3, 11, 2, pal.hi);
      rect(ctx, x + 6, my, 11, 1, pal.dark);
      // Recessed energy cell window & glowing emitter tip
      rect(ctx, x + 9, my - 2, 4, 2, pal.glow);
      px(ctx, x + 10, my - 2, '#ffffff');
      rect(ctx, x + 17, my - 2, 2, 2, pal.glow);
      outlinedBox(ctx, x + 6, my + 2, 4, 4, pal.grip, INK);
      break;
    }

    case 'rifle': {
      outlinedBox(ctx, x + 1, my - 2, 6, 5, pal.grip, INK, true);
      rect(ctx, x + 2, my - 1, 4, 1, pal.gripHi);
      outlinedBox(ctx, x + 6, my - 3, 16, 5, pal.metal, INK);
      rect(ctx, x + 7, my - 2, 14, 2, pal.hi);
      rect(ctx, x + 7, my + 1, 14, 1, pal.dark);
      outlinedBox(ctx, x + 11, my + 2, 3, 4, pal.dark, INK);
      px(ctx, x + 20, my - 3, pal.glow);
      break;
    }

    case 'smg': {
      outlinedBox(ctx, x + 4, my - 3, 14, 5, pal.metal, INK);
      rect(ctx, x + 5, my - 2, 12, 2, pal.hi);
      rect(ctx, x + 5, my + 1, 12, 1, pal.dark);
      outlinedBox(ctx, x + 5, my + 2, 3, 4, pal.grip, INK);
      outlinedBox(ctx, x + 11, my + 2, 3, 4, pal.dark, INK);
      break;
    }

    default: {
      // Sharp Revolver / Pistol silhouette with cylinder, top specular rib & ergonomic grip
      outlinedBox(ctx, x + 5, my - 3, 14, 5, pal.metal, INK);
      rect(ctx, x + 6, my - 2, 12, 2, pal.hi);
      rect(ctx, x + 6, my + 1, 12, 1, pal.dark);
      outlinedBox(ctx, x + 8, my - 2, 4, 4, pal.dark, INK);
      px(ctx, x + 9, my - 1, pal.hi);
      outlinedBox(ctx, x + 5, my + 1, 4, 5, pal.grip, INK);
      px(ctx, x + 6, my + 2, pal.gripHi);
      px(ctx, x + 17, my - 3, pal.glow);
      break;
    }
  }

  // Signature gleaming sparkle for Golden weapons & glowing emerald ultra conduit pip for Ultra weapons!
  if (pal.isGold) {
    rect(ctx, x + 14, my - 3, 3, 1, '#ffffff');
    rect(ctx, x + 15, my - 4, 1, 3, '#ffffff');
  } else if (pal.isUltra) {
    rect(ctx, x + 9, my - 2, 5, 2, '#5cff78');
    rect(ctx, x + 10, my - 2, 3, 1, '#ffffff');
  }
}

function registerWeaponsAndProjectiles(b: FallbackAtlasBuilder): void {
  // 1. ALL 142 WEAPONS FROM src/data/weapons.ts (100% ZERO-MISS COVERAGE)
  for (const def of Object.values(WEAPONS)) {
    if (!b.hasSprite(def.sprite)) {
      b.addSprite(def.sprite, 24, 12, 6, 6, 1, (ctx, x, y, w, h) => drawWeaponArt(ctx, x, y, w, h, def));
    }
  }

  // Legacy / UiDataProvider weapon sprite aliases
  const weaponAliases: ReadonlyArray<[string, string]> = [
    ['sprGoldenRevolver', 'sprGoldRevolver'],
    ['sprAssaultRifle', 'sprARifle'],
    ['sprDoubleShotgun', 'sprSuperShotgun'],
    ['sprLaserPistol', 'sprLaserGun'],
    ['sprScrewdriver', 'sprScrewDriver'],
    ['sprChickenSword', 'sprSword'],
    ['sprGrenadeLauncher', 'sprNader'],
    ['sprUltraGrenadeLauncher', 'sprUltraNader'],
    ['sprUltraLaserPistol', 'sprUltraLaserGun'],
  ];
  for (const [alias, target] of weaponAliases) {
    b.addAlias(alias, target);
  }

  // 2. BESPOKE PROJECTILES, SLASHES, ENEMY BULLETS & EXPLOSIONS
  const drawBullet = (ctx: DrawCtx, x: number, y: number, w: number, h: number, outer: string, core: string): void => {
    outlinedBox(ctx, x + 1, y + 1, w - 2, h - 2, outer, INK, true);
    rect(ctx, x + 2, y + 2, Math.max(2, w - 4), Math.max(1, h - 4), core);
    px(ctx, x + Math.max(2, w - 3), y + Math.floor(h / 2), '#ffffff');
  };
  const drawOrb = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    const r = Math.max(2, Math.floor(Math.min(w, h) / 2) - 1);
    fillPixelEllipse(ctx, cx, cy, r, r, '#09060d');
    fillPixelEllipse(ctx, cx, cy, Math.max(1, r - 1), Math.max(1, r - 1), outer);
    fillPixelEllipse(ctx, cx, cy, Math.max(1, r - 2), Math.max(1, r - 2), f % 2 === 0 ? mid : core);
    px(ctx, cx - 1, cy - 1, core);
    if (r >= 4) {
      px(ctx, cx, cy, '#ffffff');
    }
  };
  const drawEnemyOrb = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    // Ultra-readable Nuclear Throne danger orb: crisp deep-black contour + bright saturated rim
    // + pulsing hot luminous core that pops cleanly on EVERY biome floor (Desert, Snow, Caves, Palace)
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    const r = Math.max(3, Math.floor(Math.min(w, h) / 2) - 1);
    fillPixelEllipse(ctx, cx, cy, r + 1, r + 1, '#09050e');
    fillPixelEllipse(ctx, cx, cy, r, r, outer);
    fillPixelEllipse(ctx, cx, cy, Math.max(2, r - 1), Math.max(2, r - 1), mid);
    const coreR = Math.max(1, r - (f % 2 === 0 ? 2 : 1) - (r >= 5 ? 1 : 0));
    fillPixelEllipse(ctx, cx, cy, coreR, coreR, core);
    px(ctx, cx - 1, cy - 1, '#ffffff');
    if (f % 2 === 1) {
      px(ctx, cx, cy, '#ffffff');
    }
  };
  const drawSlash = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    outer: string,
    core: string,
    trailRim = '#10141f',
  ): void => {
    // High-contrast Vlambeer-style swooping crescent arc: blazing pure-white outer leading rim +
    // vivid saturated mid-core + dark trailing contrast lip so melee swings pop sharply even on bright Desert sand!
    const cy = y + Math.floor(h / 2);
    const halfSpan = Math.floor(h * 0.46);
    const maxThick = f === 0 ? Math.max(6, Math.floor(w * 0.32)) : f === 1 ? Math.max(4, Math.floor(w * 0.23)) : 2;

    for (let dy = -halfSpan; dy <= halfSpan; dy++) {
      const ny = dy / (halfSpan + 0.5);
      const curve = 1 - ny * ny;
      const taper = Math.pow(Math.max(0, curve), 0.58);
      const thick = Math.max(2, Math.round(maxThick * taper));
      const leadX = x + Math.floor(w * 0.26) + Math.round(curve * w * 0.56);
      const trailX = leadX - thick;

      // Crisp dark contrast lip behind concave trailing edge so bright plasma pops on sunlit sand
      if (f < 2) {
        rect(ctx, trailX - 1, cy + dy, 1, 1, trailRim);
      }
      // Vivid saturated energy body (e.g. #48ff88 emerald / #7ce0ff cyan)
      rect(ctx, trailX, cy + dy, thick, 1, outer);
      // Blazing pure-white leading cutting rim (thick and luminous right along the outer arc!)
      const whiteW = f === 0 ? Math.max(2, Math.ceil(thick * 0.52)) : Math.max(2, Math.ceil(thick * 0.55));
      rect(ctx, leadX - whiteW + 1, cy + dy, whiteW, 1, core);
      if (taper > 0.25) {
        rect(ctx, leadX, cy + dy, f === 0 ? 2 : 1, 1, '#ffffff');
      }
    }

    // Dynamic blazing white & colored plasma sparks bursting off the leading crescent
    const sparkOffsets: ReadonlyArray<[number, number, boolean]> =
      f === 0
        ? [[0.86, -0.30, true], [0.90, 0.22, true], [0.68, -0.44, true], [0.70, 0.42, false], [0.93, -0.04, true]]
        : f === 1
          ? [[0.88, -0.26, true], [0.84, 0.32, true], [0.64, -0.42, true], [0.66, 0.44, false]]
          : [[0.86, -0.18, true], [0.80, 0.28, true], [0.60, -0.38, false]];
    for (const [fx, fy, isWhite] of sparkOffsets) {
      const sx = x + Math.round(w * fx);
      const sy = cy + Math.round(h * fy);
      if (sx >= x + 1 && sx < x + w - 2 && sy >= y + 1 && sy < y + h - 2) {
        rect(ctx, sx, sy, isWhite ? 2 : 1, isWhite ? 2 : 1, isWhite ? '#ffffff' : outer);
      }
    }
  };
  const drawExplosion = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    const r = Math.floor(Math.min(w, h) * (0.3 + f * 0.065));
    if (f === 0) {
      // Frame 0: blazing hot initial detonation flash
      fillPixelEllipse(ctx, cx, cy, r + 1, r + 1, outer);
      fillPixelEllipse(ctx, cx, cy, Math.max(2, r - 1), Math.max(2, r - 1), '#ffffff');
      return;
    }
    if (f >= 3) {
      // Frame 3: expanding charcoal smoke rim + fading ember heart
      fillPixelEllipse(ctx, cx, cy, r, r, '#241d22');
      fillPixelEllipse(ctx, cx - 2, cy - 1, Math.max(2, r - 2), Math.max(2, r - 2), outer);
      fillPixelEllipse(ctx, cx + 1, cy + 1, Math.max(1, r - 4), Math.max(1, r - 4), mid);
      return;
    }
    fillPixelEllipse(ctx, cx, cy, r + 1, r + 1, '#1c1216');
    fillPixelEllipse(ctx, cx, cy, r, r, outer);
    fillPixelEllipse(ctx, cx - 2, cy - 1, Math.max(2, r - 2), Math.max(2, r - 2), mid);
    fillPixelEllipse(ctx, cx + 1, cy + 1, Math.max(1, r - 4), Math.max(1, r - 4), core);
  };

  const bulletList: Array<[string, number, number, string, string]> = [
    ['sprBullet1', 10, 5, '#f2a629', '#fff7b2'],
    ['sprBullet2', 8, 6, '#e66326', '#fff099'],
    ['sprHeavyBullet', 12, 7, '#ff731c', '#fff7b2'],
    ['sprUltraBullet', 12, 6, '#3be859', '#e0ffe4'],
    ['sprBouncerBullet', 8, 6, '#ffcf38', '#ffffff'],
    ['sprRogueBullet', 10, 5, '#3b9eff', '#d6f7ff'],
    ['sprAllyBullet', 8, 4, '#59ff7a', '#ffffff'],
    ['sprShell', 7, 5, '#e65c29', '#fff099'],
    ['sprUltraShell', 9, 6, '#3be859', '#d4ffd9'],
    ['sprSlug', 12, 6, '#ff4d26', '#ffffff'],
    ['sprSlugBullet', 12, 6, '#ff4d26', '#ffffff'],
    ['sprHeavySlug', 14, 8, '#e6321c', '#fff099'],
    ['sprHyperSlug', 16, 6, '#ff8826', '#ffffff'],
    ['sprPopoSlug', 12, 6, '#3b9eff', '#e0faff'],
    ['sprBolt', 14, 5, '#3be057', '#ffffff'],
    ['sprHeavyBolt', 16, 6, '#26b843', '#e0ffe4'],
    ['sprBoltGold', 14, 5, '#f5c73d', '#fff9cc'],
    ['sprToxicBolt', 14, 5, '#8cff38', '#e8ffad'],
    ['sprUltraBolt', 16, 6, '#4dff70', '#ffffff'],
    ['sprSplinter', 10, 4, '#b88546', '#fff0c4'],
    ['sprSeeker', 10, 6, '#ff59b8', '#ffffff'],
    ['sprLaser', 16, 5, '#ff244f', '#ffffff'],
    ['sprLightning', 16, 6, '#4dc8ff', '#ffffff'],
    ['sprRocket', 14, 7, '#cc3d2e', '#ffe047'],
    ['sprGoldRocket', 14, 7, '#f5c73d', '#ffffff'],
    ['sprGoldNuke', 16, 9, '#f5c73d', '#78ff8c'],
    ['sprFlare', 10, 6, '#ff681c', '#fff499'],
  ];
  for (const [name, w, h, outer, core] of bulletList) {
    b.addSprite(name, w, h, Math.floor(w / 2), Math.floor(h / 2), 1, (ctx, x, y, sw, sh) =>
      drawBullet(ctx, x, y, sw, sh, outer, core),
    );
  }

  const orbList: Array<[string, number, string, string, string]> = [
    ['sprDisc', 12, '#738294', '#c9d6e3', '#ffffff'],
    ['sprGoldDisc', 12, '#a67414', '#f5c73d', '#fff9cc'],
    ['sprGrenade', 10, '#2c4d1f', '#6eb846', '#d6ff80'],
    ['sprHeavyNade', 12, '#243d18', '#5c9e38', '#ffe047'],
    ['sprClusterNade', 11, '#52341f', '#d97829', '#fff080'],
    ['sprStickyGrenade', 10, '#5c1f4d', '#d94cb8', '#ffb8f0'],
    ['sprToxicGrenade', 10, '#1e5c24', '#6eff4d', '#e0ffad'],
    ['sprBloodGrenade', 11, '#63101a', '#e62438', '#ff99a3'],
    ['sprGoldGrenade', 10, '#8f6111', '#f5c73d', '#fff9cc'],
    ['sprUltraGrenade', 12, '#176e29', '#4dff70', '#ffffff'],
    ['sprPopoNade', 10, '#1b3f85', '#429eff', '#d6f7ff'],
    ['sprFlakBullet', 10, '#6b2c1a', '#e66e32', '#ffe078'],
    ['sprSuperFlakBullet', 14, '#6b2414', '#ff7b29', '#fff08a'],
    ['sprFlameBall', 10, '#c72e18', '#ff7b1c', '#fff499'],
    ['sprFireBall', 12, '#c72e18', '#ff681c', '#fff499'],
    ['sprFireLilHunter', 10, '#d93818', '#ff8c26', '#fff9cc'],
    ['sprConfettiBall', 8, '#ff47a3', '#ffe047', '#6ef2ff'],
    ['sprPlasmaBall', 12, '#16752a', '#49f064', '#e8ffeb'],
    ['sprPlasmaBallBig', 18, '#146926', '#49f064', '#ffffff'],
    ['sprPlasmaBallHuge', 24, '#115920', '#59ff73', '#ffffff'],
    ['sprPopoPlasma', 14, '#1b479e', '#4da6ff', '#e0faff'],
    ['sprLightningBall', 12, '#1e669e', '#59d9ff', '#ffffff'],
    ['sprBloodBall', 12, '#5e0f18', '#e02438', '#ff8f99'],
    ['sprBulletHit', 10, '#e67824', '#ffe047', '#ffffff'],
  ];
  for (const [name, s, outer, mid, core] of orbList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawOrb(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

  // High-contrast enemy & boss orbs (black outer contour + saturated danger ring + pulsing hot core)
  const enemyOrbList: Array<[string, number, string, string, string]> = [
    ['sprEnemyBullet', 11, '#b81124', '#ff3b45', '#fff8d4'],
    ['sprEnemyBullet1', 11, '#b81124', '#ff3b45', '#fff8d4'],
    ['sprEnemyBullet4', 12, '#8c1275', '#ff47d6', '#fff0ff'],
    ['sprIDPDBullet', 11, '#123e9e', '#38b6ff', '#ebfbff'],
    ['sprScorpionBullet', 11, '#126e24', '#69ff47', '#f0ffd6'],
    ['sprSalamanderBullet', 12, '#b8250e', '#ff801f', '#fff7bd'],
    ['sprGuardianBullet', 13, '#106630', '#4dff80', '#f0fff4'],
    ['sprBigGuardianBullet', 17, '#0f5928', '#52ff88', '#ffffff'],
    ['sprExploGuardianBullet', 14, '#596e0e', '#e0ff38', '#ffffff'],
    ['sprLHBouncer', 11, '#15429e', '#5ce1ff', '#ffffff'],
    ['sprThrone2Bullet', 16, '#0f6624', '#4dff75', '#ffffff'],
  ];
  for (const [name, s, outer, mid, core] of enemyOrbList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawEnemyOrb(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

  // Dedicated high-contrast Horror Rad Beam globule, Nuke warhead, Toxic Gas cloud & Rogue Portal Strike VFX
  b.addSprite('sprHorrorBullet', 12, 12, 6, 6, 3, (ctx, x, y, _w, _h, f) => {
    const cx = x + 6;
    const cy = y + 6;
    fillPixelEllipse(ctx, cx, cy, 5, 5, '#092b12');
    fillPixelEllipse(ctx, cx, cy, 4, 4, '#24cf4c');
    fillPixelEllipse(ctx, cx, cy, 3, 3, f === 1 ? '#b8ffc4' : '#73ff8c');
    rect(ctx, cx - 1, cy - 1, 2, 2, '#ffffff');
    // Orbiting rad sparkles
    px(ctx, cx - 4 + f * 3, cy - 3, '#d9ffe0');
    px(ctx, cx + 3 - f * 2, cy + 3, '#73ff8c');
  });

  b.addSprite('sprNuke', 18, 10, 9, 5, 2, (ctx, x, y, _w, _h, f) => {
    // Chunky tactical mini-nuke warhead with yellow hazard tail fins, glowing rad nose & thruster plume
    rect(ctx, x, y + 3, 4, 4, f === 0 ? '#ff6b1c' : '#ffe047');
    rect(ctx, x + 2, y + 4, 2, 2, '#ffffff');
    outlinedBox(ctx, x + 3, y + 1, 4, 8, '#e8b835', INK);
    rect(ctx, x + 4, y + 4, 2, 2, INK);
    outlinedBox(ctx, x + 6, y + 2, 10, 6, '#546b4c', INK, true);
    rect(ctx, x + 7, y + 3, 8, 2, '#87a87c');
    rect(ctx, x + 11, y + 2, 2, 6, '#4dff70');
    px(ctx, x + 11, y + 3, '#ffffff');
    outlinedBox(ctx, x + 14, y + 3, 3, 4, '#c7382c', INK);
  });

  b.addSprite('sprToxicGas', 22, 22, 11, 11, 4, (ctx, x, y, _w, _h, f) => {
    // Billowing layered dark-outlined neon-acid toxic cloud
    const cx = x + 11;
    const cy = y + 11;
    const dx = f === 1 ? 1 : f === 3 ? -1 : 0;
    const dy = f === 2 ? 1 : 0;
    outlinedEllipse(ctx, cx - 3 + dx, cy - 1, 6, 5, '#2b8a32', '#0f2b14');
    outlinedEllipse(ctx, cx + 3 - dx, cy + 1, 6, 5, '#22752a', '#0f2b14');
    outlinedEllipse(ctx, cx, cy - 2 + dy, 6, 5, '#47c942', '#143d1a');
    fillPixelEllipse(ctx, cx - 2, cy - 3 + dy, 3, 2, '#a8ff5e');
    fillPixelEllipse(ctx, cx + 3, cy + 2 - dy, 3, 2, '#6eff59');
    px(ctx, cx - 2 + dx, cy - 3, '#e8ffbd');
    px(ctx, cx + 4, cy - 1 + dy, '#d4ff99');
  });

  b.addSprite('sprRogueStrike', 28, 28, 14, 14, 4, (ctx, x, y, _w, _h, f) => {
    // Electric cobalt-cyan IDPD Portal Strike dimensional blast
    const cx = x + 14;
    const cy = y + 14;
    const r = 6 + f * 2;
    fillPixelEllipse(ctx, cx, cy, Math.min(13, r + 2), Math.min(13, r + 2), '#0c1f52');
    fillPixelEllipse(ctx, cx, cy, Math.min(11, r), Math.min(11, r), '#2e88ff');
    fillPixelEllipse(ctx, cx, cy, Math.max(3, r - 3), Math.max(3, r - 3), f < 2 ? '#a8f4ff' : '#5cc4ff');
    if (f < 3) {
      fillPixelEllipse(ctx, cx, cy, Math.max(2, 5 - f), Math.max(2, 5 - f), '#ffffff');
    }
    // Crackling dimensional strike bolts
    drawPixelLine(ctx, cx - r, cy, cx + r, cy, '#d9f9ff', 1);
    drawPixelLine(ctx, cx, cy - r, cx, cy + r, '#d9f9ff', 1);
  });

  const slashList: Array<[string, number, string, string, string]> = [
    ['sprSlash', 24, '#7ce0ff', '#ffffff', '#182b47'],
    ['sprHeavySlash', 28, '#ffbe38', '#ffffff', '#47250e'],
    ['sprMegaSlash', 32, '#ff6d29', '#ffffff', '#4a180d'],
    ['sprEnergySlash', 26, '#48ff88', '#ffffff', '#0b4222'],
    ['sprHeavyEnergySlash', 30, '#48ff88', '#ffffff', '#0b4222'],
    ['sprLightningSlash', 26, '#4de8ff', '#ffffff', '#0d2d4a'],
    ['sprBloodSlash', 26, '#ff2647', '#ffe8ec', '#4a0b17'],
    ['sprUltraSlash', 30, '#48ff88', '#ffffff', '#0b4222'],
  ];
  for (const [name, s, outer, core, trailRim] of slashList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 3, (ctx, x, y, sw, sh, f) =>
      drawSlash(ctx, x, y, sw, sh, f, outer, core, trailRim),
    );
  }

  b.addSprite('sprExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion(ctx, x, y, w, h, f, '#a82214', '#ff6e1c', '#fff7a8'),
  );
  b.addSprite('sprSmallExplosion', 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) =>
    drawExplosion(ctx, x, y, w, h, f, '#a82214', '#ff7824', '#fff7b2'),
  );
  b.addSprite('sprGreenExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion(ctx, x, y, w, h, f, '#156e28', '#4df068', '#e6ffe8'),
  );
  b.addSprite('sprMeatExplosion', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) =>
    drawExplosion(ctx, x, y, w, h, f, '#660e18', '#d92438', '#ff9ea8'),
  );
  b.addSprite('sprRogueExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion(ctx, x, y, w, h, f, '#143885', '#42a3ff', '#e0faff'),
  );

  // Safety guarantee: ensure EVERY projectileSprite in WEAPONS is present
  for (const def of Object.values(WEAPONS)) {
    if (def.projectileSprite && !b.hasSprite(def.projectileSprite)) {
      b.addAlias(def.projectileSprite, 'sprBullet1');
    }
  }
}

export function registerFallbackEntities(b: FallbackAtlasBuilder): void {
  registerAllMutants(b);
  registerAllEnemiesAndBosses(b);
  registerWeaponsAndProjectiles(b);
}
