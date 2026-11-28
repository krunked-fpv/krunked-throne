import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas } from './pixel-art';

export interface MutantPalette {
  body: string;
  bodyHi: string;
  bodyDark: string;
  accent: string;
  accentHi: string;
  eye: string;
  pupil: string;
  detail: string;
  shorts: string;
}

const INK = '#0d0a10';

export const MUTANT_A_PALETTES: readonly MutantPalette[] = [
  // 1. Fish: bright sea-green amphibian, yellow eyes, brown belt, dark shorts
  { body: '#4eb870', bodyHi: '#80e29c', bodyDark: '#2c7e4a', accent: '#2a6e46', accentHi: '#62cf84', eye: '#fff266', pupil: INK, detail: '#a86a38', shorts: '#363a48' },
  // 2. Crystal: faceted vibrant magenta/pink crystal
  { body: '#e058c8', bodyHi: '#ff98ec', bodyDark: '#9a2888', accent: '#f484e4', accentHi: '#ffd6fa', eye: '#ffffff', pupil: '#541264', detail: '#c03ca8', shorts: '#6c2068' },
  // 3. Eyes: pale blue-slate head covered in blinking white/black eyes
  { body: '#7888a8', bodyHi: '#a6b6d4', bodyDark: '#4c5a78', accent: '#445070', accentHi: '#94a6c8', eye: '#ffffff', pupil: INK, detail: '#343c54', shorts: '#2e344a' },
  // 4. Melting: pale gaunt bone/flesh dripping mutant with dark hollow eyes & crimson ribs
  { body: '#d8c4b0', bodyHi: '#f4eadc', bodyDark: '#9c8672', accent: '#c8343c', accentHi: '#f0646c', eye: '#140e16', pupil: '#140e16', detail: '#7a6658', shorts: '#4e3c3c' },
  // 5. Plant: bright lime-green snapping flytrap head with crimson maw & teeth
  { body: '#58c838', bodyHi: '#8ef064', bodyDark: '#328620', accent: '#dc2c3a', accentHi: '#ff6470', eye: '#ffe848', pupil: INK, detail: '#ffffff', shorts: '#2a6220' },
  // 6. Y.V.: crisp pure-white triangle with huge central eye & gold chain
  { body: '#f4f4f8', bodyHi: '#ffffff', bodyDark: '#b8bcc8', accent: '#f5c838', accentHi: '#fff494', eye: '#ffffff', pupil: INK, detail: '#d49a1e', shorts: '#282430' },
  // 7. Steroids: buff warm-tan shirtless bodybuilder, bald head + round glasses, blue-gray shorts!
  { body: '#e0a470', bodyHi: '#f8cfa2', bodyDark: '#b87648', accent: '#ffffff', accentHi: '#c8f0ff', eye: '#ffffff', pupil: INK, detail: '#8a4e2c', shorts: '#3a4c6e' },
  // 8. Robot: boxy gunmetal steel robot with bright glowing cyan visor
  { body: '#7c8894', bodyHi: '#b4c2ce', bodyDark: '#4c5662', accent: '#424c58', accentHi: '#98a6b4', eye: '#48e8ff', pupil: '#e8feff', detail: '#e83c34', shorts: '#323a44' },
  // 9. Chicken: bright white feathered chicken with crimson comb, yellow beak, red headband
  { body: '#f2f2f2', bodyHi: '#ffffff', bodyDark: '#bcbcc4', accent: '#e42c28', accentHi: '#ff645c', eye: INK, pupil: '#ffffff', detail: '#f8bc28', shorts: '#c42424' },
  // 10. Rebel: hooded slate-blue wasteland nomad with warm scarf & glowing white eyes
  { body: '#4a5a7a', bodyHi: '#7286aa', bodyDark: '#2e3a54', accent: '#d6b682', accentHi: '#f4dec0', eye: '#ffffff', pupil: '#fff4a8', detail: '#8c6e48', shorts: '#2a3244' },
  // 11. Horror: glowing radioactive lime-green hound/blob beast
  { body: '#58f050', bodyHi: '#a8ff88', bodyDark: '#26a024', accent: '#98ff68', accentHi: '#ecffe0', eye: '#102412', pupil: '#ffffff', detail: '#1c7a1c', shorts: '#249424' },
  // 12. Rogue: cobalt-blue IDPD armor with dark visor & yellow stripe
  { body: '#3c74c8', bodyHi: '#6ca2f2', bodyDark: '#22488c', accent: '#f5d038', accentHi: '#fff498', eye: '#68ecff', pupil: '#ffffff', detail: '#e6eef8', shorts: '#1e386c' },
];

export const MUTANT_B_PALETTES: readonly MutantPalette[] = [
  // 1B. Fish B: dark swamp-green pirate with crimson bandana & eyepatch
  { body: '#34945a', bodyHi: '#62c484', bodyDark: '#1e6038', accent: '#dc2838', accentHi: '#ff606e', eye: '#fff060', pupil: INK, detail: '#f5c838', shorts: '#2a2634' },
  // 2B. Crystal B: radiant golden-amber crystal
  { body: '#f0b028', bodyHi: '#ffe470', bodyDark: '#b27410', accent: '#ffd848', accentHi: '#fff8c4', eye: '#68f4ff', pupil: '#1c5874', detail: '#d48c18', shorts: '#8c540c' },
  // 3B. Eyes B: plum/magenta psychic with glowing gold eyes
  { body: '#78408e', bodyHi: '#aa6ec4', bodyDark: '#4a205c', accent: '#b82856', accentHi: '#eb5884', eye: '#ffe848', pupil: INK, detail: '#5c1836', shorts: '#321440' },
  // 4B. Melting B: charred obsidian skull with blazing volcanic orange sockets
  { body: '#564c62', bodyHi: '#827690', bodyDark: '#302838', accent: '#e84424', accentHi: '#ff9648', eye: '#ff7018', pupil: '#fff488', detail: '#a42618', shorts: '#241e2a' },
  // 5B. Plant B: exotic teal stalk with neon magenta flytrap jaws
  { body: '#2e9c8c', bodyHi: '#5cd0be', bodyDark: '#1a685c', accent: '#d830c0', accentHi: '#ff78ec', eye: '#78ffec', pupil: INK, detail: '#ffffff', shorts: '#18544c' },
  // 6B. Y.V. B: solid gold pyramid with red shades
  { body: '#f5c838', bodyHi: '#fff088', bodyDark: '#b88412', accent: '#e0283c', accentHi: '#ff6c7c', eye: '#ff3c50', pupil: INK, detail: '#44d864', shorts: '#2c1e28' },
  // 7B. Steroids B: cowboy-hat buff tan shirtless Steroids matching reference video!
  { body: '#e0a470', bodyHi: '#f8cfa2', bodyDark: '#b87648', accent: '#7c5234', accentHi: '#a6744c', eye: '#18141c', pupil: '#ffe048', detail: '#f5c838', shorts: '#385898' },
  // 8B. Robot B: cobalt & gold retro mech with glowing cyan CRT
  { body: '#3c72cc', bodyHi: '#72a4f4', bodyDark: '#22468a', accent: '#ebb834', accentHi: '#ffe678', eye: '#68f4ff', pupil: '#ffffff', detail: '#ff4858', shorts: '#203258' },
  // 9B. Chicken B: midnight-black shinobi ninja with glowing red eyes
  { body: '#343044', bodyHi: '#5a5470', bodyDark: '#1c1828', accent: '#e42838', accentHi: '#ff6472', eye: '#ff3848', pupil: '#ffe878', detail: '#f5c838', shorts: '#1a1624' },
  // 10B. Rebel B: crimson desert cloak & silver scarf
  { body: '#b02c3e', bodyHi: '#de5a6c', bodyDark: '#741826', accent: '#d8e0ec', accentHi: '#ffffff', eye: '#ffe848', pupil: '#ffffff', detail: '#6a586e', shorts: '#3a1c28' },
  // 11B. Horror B: electric-cyan volatile rad anomaly
  { body: '#38ccf4', bodyHi: '#8cf0ff', bodyDark: '#1c82b4', accent: '#7c94ff', accentHi: '#d6e4ff', eye: '#101838', pupil: '#ffffff', detail: '#2466a8', shorts: '#1c70a4' },
  // 12B. Rogue B: covert charcoal & crimson armor with amber visor
  { body: '#44485c', bodyHi: '#6e7490', bodyDark: '#262836', accent: '#dc2c3c', accentHi: '#ff6876', eye: '#ffc438', pupil: '#fff8c8', detail: '#b82230', shorts: '#1e202c' },
];

type MutantVariant = 'idle' | 'walk' | 'hurt' | 'dead' | 'sit' | 'gosit' | 'headless_idle' | 'headless_walk' | 'headless_hurt';

/**
 * Draws a crisp native 1x (24x24, origin 12,12) Nuclear Throne mutant sprite
 * with bold 1px `#0d0a10` outline, chunky readable silhouette, and vibrant color blocks!
 */
function drawMutant1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  raceIndex: number,
  isB: boolean,
  variant: MutantVariant,
  frame: number,
): void {
  const pal = (isB ? MUTANT_B_PALETTES : MUTANT_A_PALETTES)[raceIndex - 1]!;
  const p = new PxCanvas(w, h);
  const cx = 12;
  const cy = 12;

  // DEAD: 6 frames (0..2 tumble -> 3..5 dark muted desaturated flattened resting corpse!)
  if (variant === 'dead') {
    if (frame <= 1) {
      // Mid-collapse knockback silhouette
      const fill = frame === 0 ? '#d4b8b8' : pal.bodyDark;
      p.rect(cx - 5, cy, 10, 6, fill);
      p.rect(cx - 4, cy - 1, 8, 2, pal.body);
      p.rect(cx - 3, cy + 2, 2, 2, '#9a1c28');
      p.rect(cx + 2, cy + 1, 2, 2, INK);
    } else if (frame === 2) {
      // Hitting ground
      p.rect(cx - 6, cy + 2, 12, 5, pal.bodyDark);
      p.rect(cx - 4, cy + 1, 8, 2, pal.shorts);
      p.rect(cx + 2, cy + 3, 3, 2, '#6c1620');
    } else {
      // Final resting corpses (frames 3..5): dark muted flattened silhouettes matching the video!
      p.rect(cx - 7, cy + 4, 14, 4, '#2a2228');
      p.rect(cx - 6, cy + 3, 11, 3, '#3c323a');
      p.rect(cx - 4, cy + 2 + (raceIndex % 2), 6, 2, '#50444c');
      // Subtle muted race-specific silhouette accent
      if (raceIndex === 2) p.poly([[cx - 3, cy + 2], [cx + 1, cy + 1], [cx + 3, cy + 4]], pal.bodyDark);
      else if (raceIndex === 6) p.poly([[cx - 4, cy + 6], [cx, cy + 2], [cx + 4, cy + 6]], '#585662');
      else p.rect(cx - 3, cy + 4, 4, 1, pal.bodyDark);
      p.rect(cx + 2, cy + 4, 3, 2, '#4a1820');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const isHurt = variant === 'hurt' || variant === 'headless_hurt';
  const hurtPureWhite = isHurt && frame === 0;
  const hurtPink = isHurt && frame === 1;
  const body = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffd4d4' : pal.body;
  const bodyHi = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffffff' : pal.bodyHi;
  const bodyDark = hurtPureWhite ? '#e8e8e8' : hurtPink ? '#e08088' : pal.bodyDark;
  const acc = hurtPureWhite ? '#ffffff' : hurtPink ? '#ff9898' : pal.accent;
  const accHi = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffffff' : pal.accentHi;
  const det = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffcccc' : pal.detail;
  const shorts = hurtPureWhite ? '#dcdcdc' : hurtPink ? '#b86878' : pal.shorts;
  const eye = hurtPureWhite ? INK : pal.eye;
  const pupil = hurtPureWhite ? '#ffffff' : pal.pupil;
  const boot = hurtPureWhite ? '#d0d0d0' : '#26202c';

  const isWalk = variant === 'walk' || variant === 'headless_walk';
  const isSit = variant === 'sit';
  const isGoSit = variant === 'gosit';
  const isHeadless = variant === 'headless_idle' || variant === 'headless_walk' || variant === 'headless_hurt';

  const bob = isWalk
    ? (frame === 1 || frame === 3 ? -1 : 0)
    : variant === 'idle' || variant === 'headless_idle'
      ? (frame === 2 ? 1 : 0)
      : isSit
        ? 2 + (frame & 1)
        : isGoSit
          ? 1 + (frame & 1)
          : 0;
  const ty = cy + bob;

  // Compact chunky feet / seated legs (drawn first)
  if (isSit) {
    p.rect(cx - 5, cy + 6, 3, 2, boot);
    p.rect(cx + 2, cy + 6, 3, 2, boot);
  } else {
    const stepL = isWalk ? (frame === 0 ? -1 : frame === 2 ? 1 : 0) : 0;
    const stepR = -stepL;
    p.rect(cx - 4 + stepL, cy + 6 - (frame === 0 && isWalk ? 1 : 0), 3, 2, boot);
    p.rect(cx + 1 + stepR, cy + 6 - (frame === 2 && isWalk ? 1 : 0), 3, 2, boot);
  }

  switch (raceIndex) {
    case 1: {
      // FISH: Bright sea-green amphibian, spiky dorsal fin, wide yellow eyes, brown belt & dark shorts
      p.rect(cx - 2, ty - 8, 3, 2, accHi);
      p.set(cx - 1, ty - 9, accHi);
      p.set(cx + 1, ty - 8, acc);
      // Chunky round amphibian body & head
      p.rect(cx - 5, ty - 6, 10, 10, body);
      p.rect(cx - 4, ty - 7, 8, 2, bodyHi);
      p.rect(cx - 5, ty + 1, 10, 3, bodyDark);
      // Shorts + leather belt + brass buckle
      p.rect(cx - 4, ty + 3, 8, 3, shorts);
      p.rect(cx - 5, ty + 2, 10, 2, det);
      p.rect(cx - 1, ty + 2, 2, 2, '#f5cc38');
      if (isB && !hurtPureWhite) {
        // Pirate crimson bandana + fluttering tail + black eyepatch
        p.rect(cx - 5, ty - 6, 10, 2, acc);
        p.rect(cx - 7, ty - 5 + (frame & 1), 2, 2, acc);
        p.rect(cx - 4, ty - 4, 3, 3, INK);
        p.rect(cx + 1, ty - 4, 3, 3, eye);
        p.set(cx + 3, ty - 3, pupil);
      } else {
        // Wide expressive yellow amphibian eyes
        p.rect(cx - 4, ty - 4, 3, 3, eye);
        p.rect(cx + 1, ty - 4, 3, 3, eye);
        p.set(cx - 2, ty - 3, pupil);
        p.set(cx + 3, ty - 3, pupil);
        p.set(cx - 4, ty - 4, '#ffffff');
        p.set(cx + 1, ty - 4, '#ffffff');
      }
      // Wide amphibian grin
      p.rect(cx - 2, ty, 5, 1, '#183824');
      break;
    }

    case 2: {
      // CRYSTAL: Faceted vibrant magenta/pink crystalline golem!
      // Jagged shoulder shards
      p.rect(cx - 6, ty - 2, 2, 6, bodyDark);
      p.rect(cx + 4, ty - 2, 2, 6, bodyDark);
      // Main diamond-topped faceted crystal torso
      p.rect(cx - 4, ty - 5, 8, 10, body);
      p.rect(cx - 3, ty - 7, 6, 3, bodyHi);
      p.rect(cx - 1, ty - 8, 2, 2, '#ffffff');
      // Left lit specular facet / right deep shadow facet
      p.rect(cx - 4, ty - 5, 3, 8, bodyHi);
      p.rect(cx - 3, ty - 6, 2, 2, '#ffffff');
      p.rect(cx + 2, ty - 4, 3, 9, bodyDark);
      // Faceted legs
      p.rect(cx - 4, ty + 4, 8, 2, shorts);
      // Glowing crystalline eyes
      p.rect(cx - 3, ty - 2, 2, 2, eye);
      p.rect(cx + 1, ty - 2, 2, 2, eye);
      break;
    }

    case 3: {
      // EYES: Pale blue-slate domed psychic covered with bold blinking white/black eyes!
      p.rect(cx - 5, ty - 6, 10, 10, body);
      p.rect(cx - 4, ty - 7, 8, 2, bodyHi);
      p.rect(cx - 5, ty + 1, 10, 3, bodyDark);
      p.rect(cx - 4, ty + 3, 8, 3, shorts);
      const blink = variant === 'idle' && frame === 3;
      if (blink) {
        p.rect(cx - 4, ty - 3, 3, 1, INK);
        p.rect(cx + 1, ty - 3, 3, 1, INK);
        p.rect(cx - 1, ty - 6, 2, 1, INK);
      } else {
        // Bold cluster of glaring eyes
        p.rect(cx - 4, ty - 4, 3, 3, eye);
        p.set(cx - 2, ty - 3, pupil);
        p.rect(cx + 1, ty - 4, 3, 3, eye);
        p.set(cx + 3, ty - 3, pupil);
        p.rect(cx - 1, ty - 6, 2, 2, eye);
        p.set(cx, ty - 6, pupil);
        p.rect(cx - 2, ty, 2, 2, eye);
        p.set(cx - 1, ty + 1, pupil);
        p.rect(cx + 2, ty, 2, 2, eye);
        p.set(cx + 3, ty + 1, pupil);
      }
      break;
    }

    case 4: {
      // MELTING: Pale gaunt skeletal/fleshy dripping mutant with dark hollow eyes & crimson ribcage
      // Gaunt torso + exposed crimson ribcage
      p.rect(cx - 4, ty, 8, 6, bodyDark);
      p.rect(cx - 2, ty + 1, 4, 4, acc);
      p.rect(cx - 4, ty + 1, 2, 1, bodyHi);
      p.rect(cx + 2, ty + 1, 2, 1, bodyHi);
      p.rect(cx - 4, ty + 3, 2, 1, body);
      p.rect(cx + 2, ty + 3, 2, 1, body);
      // Dripping cranium
      p.rect(cx - 5, ty - 6, 10, 6, body);
      p.rect(cx - 4, ty - 7, 8, 2, bodyHi);
      p.rect(cx - 5, ty, 2, 2, body); // melting cheek drip
      p.rect(cx + 3, ty, 2, 2, bodyDark);
      // Hollow dark eye sockets (glowing volcanic orange in B-skin)
      p.rect(cx - 3, ty - 4, 2, 3, eye);
      p.rect(cx + 1, ty - 4, 2, 3, eye);
      if (isB && !hurtPureWhite) {
        p.set(cx - 2, ty - 3, pupil);
        p.set(cx + 2, ty - 3, pupil);
      }
      // Clenched skull teeth
      p.rect(cx - 2, ty - 1, 4, 1, INK);
      p.set(cx - 1, ty - 1, bodyHi);
      p.set(cx + 1, ty - 1, bodyHi);
      break;
    }

    case 5: {
      // PLANT: Bright lime-green snapping flytrap head with crimson maw & white teeth!
      // Leafy stalk body + splayed collar leaves
      p.rect(cx - 4, ty + 1, 8, 5, bodyDark);
      p.rect(cx - 3, ty + 1, 6, 4, body);
      p.rect(cx - 6, ty + 2, 2, 2, bodyHi);
      p.rect(cx + 4, ty + 2, 2, 2, bodyHi);
      // Big snapping lime-green & crimson flytrap head
      p.rect(cx - 5, ty - 7, 10, 8, body);
      p.rect(cx - 4, ty - 8, 8, 2, bodyHi);
      // Crimson inner maw + crisp white fangs!
      p.rect(cx - 4, ty - 4, 8, 4, acc);
      p.rect(cx - 3, ty - 3, 6, 2, '#18060a');
      p.set(cx - 3, ty - 3, det);
      p.set(cx - 1, ty - 3, det);
      p.set(cx + 1, ty - 3, det);
      p.set(cx + 3, ty - 3, det);
      p.set(cx - 2, ty - 2, det);
      p.set(cx + 2, ty - 2, det);
      // Bright yellow eyes on top of head
      p.rect(cx - 3, ty - 6, 2, 2, eye);
      p.rect(cx + 1, ty - 6, 2, 2, eye);
      break;
    }

    case 6: {
      // Y.V.: Iconic crisp pure-white triangle with huge expressive central eye & tiny legs!
      // Exact stepped triangle pyramid
      for (let row = 0; row < 12; row++) {
        const halfW = Math.min(6, Math.floor((row + 1) * 0.55));
        const ry = ty - 7 + row;
        p.rect(cx - halfW, ry, halfW * 2 + 1, 1, body);
        if (halfW >= 2) {
          p.rect(cx - halfW, ry, Math.max(1, Math.floor(halfW * 0.7)), 1, bodyHi);
          p.rect(cx + Math.max(1, Math.floor(halfW * 0.4)), ry, Math.max(1, halfW - Math.floor(halfW * 0.4) + 1), 1, bodyDark);
        }
      }
      if (isB && !hurtPureWhite) {
        // Cool red shades
        p.rect(cx - 4, ty - 2, 9, 3, INK);
        p.rect(cx - 3, ty - 1, 7, 1, acc);
      } else {
        // Huge expressive central eye
        p.rect(cx - 3, ty - 3, 7, 4, INK);
        p.rect(cx - 2, ty - 2, 5, 2, eye);
        p.rect(cx, ty - 2, 2, 2, pupil);
        p.set(cx - 1, ty - 2, '#ffffff');
      }
      // Subtle bling gold chain at bottom
      p.rect(cx - 3, ty + 3, 7, 1, acc);
      p.rect(cx - 1, ty + 4, 3, 1, accHi);
      break;
    }

    case 7: {
      // STEROIDS: Iconic buff warm-tan shirtless bodybuilder!
      // Broad muscular shoulders, bare pecs & abs, bald head + round glasses (A) or brown cowboy hat (B), blue-gray shorts!
      // Chunky muscular bare arms on both sides
      p.rect(cx - 7, ty - 2, 3, 6, body);
      p.rect(cx - 7, ty - 2, 2, 3, bodyHi);
      p.rect(cx - 7, ty + 2, 3, 2, bodyDark);
      p.rect(cx + 4, ty - 2, 3, 6, body);
      p.rect(cx + 5, ty - 2, 2, 3, bodyHi);
      p.rect(cx + 4, ty + 2, 3, 2, bodyDark);
      // Huge muscular shirtless torso
      p.rect(cx - 5, ty - 3, 10, 7, body);
      // Sculpted sunlit pecs & dark muscle crease
      p.rect(cx - 4, ty - 2, 3, 2, bodyHi);
      p.rect(cx + 1, ty - 2, 3, 2, bodyHi);
      p.rect(cx - 4, ty, 8, 1, det); // pec under-line
      p.rect(cx, ty - 2, 1, 5, det); // sternum / ab center line
      p.rect(cx - 3, ty + 2, 2, 1, bodyDark);
      p.rect(cx + 1, ty + 2, 2, 1, bodyDark);
      // Blue-gray shorts + belt buckle
      p.rect(cx - 5, ty + 3, 10, 3, shorts);
      p.rect(cx - 1, ty + 3, 2, 2, isB ? det : '#98a6bc');
      // Bald muscular head
      p.rect(cx - 4, ty - 7, 8, 5, body);
      p.rect(cx - 3, ty - 8, 6, 2, bodyHi);
      if (isB && !hurtPureWhite) {
        // Iconic brown cowboy hat from the reference video!
        p.rect(cx - 6, ty - 7, 12, 2, acc);
        p.rect(cx - 4, ty - 9, 8, 3, acc);
        p.rect(cx - 3, ty - 9, 5, 1, accHi);
        p.rect(cx - 4, ty - 7, 8, 1, '#4c301c');
        // Squinting fierce shades/eyes under brim
        p.rect(cx - 3, ty - 5, 2, 2, INK);
        p.rect(cx + 1, ty - 5, 2, 2, INK);
      } else {
        // Classic Steroids round white/black glasses!
        p.rect(cx - 4, ty - 6, 3, 3, INK);
        p.rect(cx + 1, ty - 6, 3, 3, INK);
        p.rect(cx - 3, ty - 5, 2, 2, eye);
        p.rect(cx + 1, ty - 5, 2, 2, eye);
        p.set(cx - 2, ty - 4, pupil);
        p.set(cx + 2, ty - 4, pupil);
        p.set(cx - 3, ty - 5, accHi);
        p.set(cx + 1, ty - 5, accHi);
        p.rect(cx - 1, ty - 5, 2, 1, INK); // glasses bridge
      }
      // Gritty determined jaw grin
      p.rect(cx - 2, ty - 3, 4, 1, '#f4efe6');
      break;
    }

    case 8: {
      // ROBOT: Boxy gunmetal steel robot with antenna & bright glowing cyan visor!
      p.rect(cx, ty - 9, 1, 3, bodyDark);
      p.rect(cx - 1, ty - 9, 2, 1, det);
      // Side mechanical arms
      p.rect(cx - 6, ty - 1, 2, 5, acc);
      p.rect(cx + 4, ty - 1, 2, 5, acc);
      // Boxy steel CRT chassis
      p.rect(cx - 5, ty - 6, 10, 11, body);
      p.rect(cx - 5, ty - 6, 10, 2, bodyHi);
      p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
      // Dark CRT bezel + bright glowing cyan visor
      p.rect(cx - 4, ty - 4, 8, 5, INK);
      p.rect(cx - 3, ty - 3, 6, 3, eye);
      p.rect(cx - 2, ty - 3 + (frame & 1), 4, 1, pupil);
      // Chest grille & tiny red/yellow LEDs
      p.rect(cx - 3, ty + 2, 6, 2, acc);
      p.set(cx - 2, ty + 2, det);
      p.set(cx + 1, ty + 2, '#ffe048');
      break;
    }

    case 9: {
      // CHICKEN: Bright white feathered chicken with crimson comb, yellow beak, red headband (or headless!)
      // Plump feathered torso
      p.rect(cx - 5, ty - 1, 10, 6, body);
      p.rect(cx - 4, ty - 1, 7, 2, bodyHi);
      p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
      p.rect(cx - 4, ty + 3, 8, 2, shorts); // martial sash
      if (isHeadless) {
        // Headless chicken neck + bright crimson spurt
        p.rect(cx - 2, ty - 3, 4, 2, '#cc2028');
        p.set(cx - 1 + (frame & 1), ty - 5, '#ff3844');
        p.set(cx + 1, ty - 4 - (frame & 1), '#ff3844');
      } else {
        // Head
        p.rect(cx - 4, ty - 6, 8, 6, body);
        p.rect(cx - 3, ty - 6, 6, 2, bodyHi);
        if (!isB) {
          // Vivid crimson comb on top
          p.rect(cx - 2, ty - 8, 2, 2, acc);
          p.rect(cx + 1, ty - 8, 2, 2, acc);
          p.set(cx - 1, ty - 9, accHi);
        }
        // Crimson martial headband + fluttering tail
        p.rect(cx - 4, ty - 5, 8, 2, acc);
        p.rect(cx - 7, ty - 4 + (frame & 1), 3, 2, acc);
        if (isB) {
          p.rect(cx - 3, ty - 3, 6, 2, INK);
        }
        p.set(cx - 2, ty - 3, eye);
        p.set(cx + 2, ty - 3, eye);
        if (!isB) {
          // Sharp yellow beak
          p.rect(cx + 2, ty - 2, 4, 2, det);
          p.set(cx + 3, ty - 2, '#fff498');
        }
      }
      break;
    }

    case 10: {
      // REBEL: Hooded slate-blue wasteland nomad with warm tan scarf & glowing white eyes!
      p.rect(cx - 5, ty - 5, 10, 10, body);
      p.rect(cx - 4, ty - 7, 8, 3, body);
      p.rect(cx - 3, ty - 7, 5, 2, bodyHi);
      p.rect(cx + 2, ty - 5, 3, 9, bodyDark);
      // Deep shadowed hood opening + glowing eyes
      p.rect(cx - 3, ty - 5, 6, 4, INK);
      p.rect(cx - 2, ty - 4, 2, 2, eye);
      p.rect(cx + 1, ty - 4, 2, 2, eye);
      // Warm tan draped scarf across neck & shoulder
      p.rect(cx - 5, ty - 1, 10, 3, acc);
      p.rect(cx - 4, ty - 1, 7, 1, accHi);
      p.rect(cx + 2, ty + 1, 3, 4, acc);
      break;
    }

    case 11: {
      // HORROR: Glowing radioactive lime-green hound/blob beast with floating rad droplets!
      const shift = frame & 1;
      p.rect(cx - 5, ty - 5, 10, 10, body);
      p.rect(cx - 4, ty - 6, 8, 2, bodyHi);
      p.rect(cx - 6, ty - 3, 12, 6, body);
      p.rect(cx - 3, ty - 4, 6, 4, bodyHi);
      p.rect(cx - 2, ty - 3, 3, 2, accHi);
      p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
      // Orbiting bright rad pixels
      p.rect(cx - 8, ty - 3 + shift, 2, 2, acc);
      p.rect(cx + 6, ty - 1 - shift, 2, 2, acc);
      // Dark hollow eyes & glowing grin
      p.rect(cx - 3, ty - 3, 2, 2, eye);
      p.rect(cx + 1, ty - 3, 2, 2, eye);
      p.rect(cx - 3, ty + 1, 6, 2, eye);
      p.set(cx - 1, ty + 1, accHi);
      p.set(cx + 1, ty + 1, accHi);
      break;
    }

    default: {
      // ROGUE: Cobalt-blue IDPD armor with dark visor, cyan gleam & yellow chest stripe!
      // White/detail shoulder pauldrons
      p.rect(cx - 6, ty - 1, 2, 4, det);
      p.rect(cx + 4, ty - 1, 2, 4, det);
      // Armored cobalt torso + yellow tactical stripe
      p.rect(cx - 4, ty - 1, 8, 6, body);
      p.rect(cx - 4, ty + 1, 8, 2, acc);
      p.rect(cx - 3, ty + 1, 4, 1, accHi);
      p.rect(cx - 4, ty + 3, 8, 2, shorts);
      // Sloped cobalt IDPD helmet + dark visor + cyan gleam
      p.rect(cx - 4, ty - 7, 8, 6, body);
      p.rect(cx - 3, ty - 7, 6, 2, bodyHi);
      p.rect(cx - 1, ty - 8, 2, 2, det);
      p.rect(cx - 3, ty - 5, 6, 3, INK);
      p.rect(cx - 2, ty - 4, 5, 1, eye);
      p.set(cx - 1, ty - 4, pupil);
      break;
    }
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

export function registerAllMutants(b: FallbackAtlasBuilder): void {
  for (let race = 1; race <= 12; race++) {
    const p = `sprMutant${race}`;
    b.addSprite(`${p}Idle`, 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'idle', f));
    b.addSprite(`${p}Walk`, 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'walk', f));
    b.addSprite(`${p}Hurt`, 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'hurt', f));
    b.addSprite(`${p}Dead`, 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'dead', f));
    b.addSprite(`${p}Sit`, 24, 24, 12, 12, 2, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'sit', f));
    b.addSprite(`${p}GoSit`, 24, 24, 12, 12, 2, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, false, 'gosit', f));

    b.addSprite(`${p}BIdle`, 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'idle', f));
    b.addSprite(`${p}BWalk`, 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'walk', f));
    b.addSprite(`${p}BHurt`, 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'hurt', f));
    b.addSprite(`${p}BDead`, 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'dead', f));
    b.addSprite(`${p}BSit`, 24, 24, 12, 12, 2, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'sit', f));
  }

  // Headless Chicken sprites (used by renderer.ts when chicken headlessTicks > 0!)
  b.addSprite('sprMutant9HeadlessIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_idle', f));
  b.addSprite('sprMutant9HeadlessWalk', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_walk', f));
  b.addSprite('sprMutant9HeadlessHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_hurt', f));

  // CRISP 1x FACETED CRYSTAL SHIELD DOMES (26x26, orig 13,13)
  const drawCrystalShield1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    baseCol: string,
    hiCol: string,
    darkCol: string,
  ): void => {
    const p = new PxCanvas(w, h);
    const cx = 13;
    const cy = 13;
    const r = 10 + (f & 1);
    p.poly([
      [cx, cy - r], [cx + Math.round(r * 0.72), cy - Math.round(r * 0.45)],
      [cx + r, cy + 2], [cx + Math.round(r * 0.55), cy + Math.round(r * 0.85)],
      [cx - Math.round(r * 0.55), cy + Math.round(r * 0.85)],
      [cx - r, cy + 2], [cx - Math.round(r * 0.72), cy - Math.round(r * 0.45)],
    ], baseCol);
    p.poly([[cx, cy - r + 1], [cx - Math.round(r * 0.65), cy - Math.round(r * 0.35)], [cx - 3, cy + 4], [cx, cy + 1]], hiCol);
    p.poly([[cx + 2, cy - 2], [cx + r - 1, cy + 2], [cx + 5, cy + Math.round(r * 0.8)], [cx + 1, cy + Math.round(r * 0.8)]], darkCol);
    p.line(cx - 5, cy - 5, cx - 1, cy - 8, '#ffffff', 1);
    p.set(cx - 6, cy - 3, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprShield', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) =>
    drawCrystalShield1x(ctx, x, y, w, h, f, '#d458e8', '#ffa4ff', '#8a249c'),
  );
  b.addSprite('sprShieldB', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) =>
    drawCrystalShield1x(ctx, x, y, w, h, f, '#f2b830', '#fff088', '#a66e10'),
  );

  b.addSprite('sprShieldDisappear', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 13;
    const cy = 13;
    const spread = 3 + f * 2;
    const sz = Math.max(1, 3 - Math.floor(f * 0.7));
    const dirs: ReadonlyArray<[number, number]> = [
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0],
    ];
    for (const [dx, dy] of dirs) {
      const sx = cx + dx * spread;
      const sy = cy + dy * spread;
      p.rect(sx - sz, sy - sz, sz * 2 + 1, sz * 2 + 1, '#e068f4');
      p.set(sx, sy, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ICONIC CRISP 1x WHITE STRONG SPIRIT HALO (matching 13_frozen_5_3.png & 18_throne_idle.png!)
  b.addSprite('sprStrongSpirit', 20, 20, 10, 10, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 10;
    const hy = 3 + (f === 1 || f === 2 ? -1 : 0);
    // Crisp hollow white oval ring with dark outline
    p.rect(cx - 4, hy - 1, 9, 1, '#ffffff');
    p.rect(cx - 4, hy + 2, 9, 1, '#d8f4ff');
    p.rect(cx - 5, hy, 2, 2, '#ffffff');
    p.rect(cx + 4, hy, 2, 2, '#d8f4ff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
}
