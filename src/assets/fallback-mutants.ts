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
  // 1B. Fish B ("Big Bass"): weathered olive-green fish with black eyepatch, stubble & toothpick (NO red pirate bandana!)
  { body: '#3e985a', bodyHi: '#70cc88', bodyDark: '#24643a', accent: '#2c5c3e', accentHi: '#569c68', eye: '#fff060', pupil: INK, detail: '#8c6844', shorts: '#2c303a' },
  // 2B. Crystal B ("Cheddar"): chunkier warm yellow/orange-amber crystal + bright cyan eyes
  { body: '#f0a420', bodyHi: '#ffe468', bodyDark: '#aa6410', accent: '#ffd440', accentHi: '#fff8c4', eye: '#68f4ff', pupil: '#1c5874', detail: '#d48214', shorts: '#844e0c' },
  // 3B. Eyes B: pale blue-slate Eyes wearing classic red/blue 3D glasses!
  { body: '#7c8ca8', bodyHi: '#aebee0', bodyDark: '#4c5a78', accent: '#f2f4f8', accentHi: '#ffffff', eye: '#ffffff', pupil: INK, detail: '#ff2838', shorts: '#2c344a' },
  // 4B. Melting B ("Melted"): slouched pale exposed bone/skull & dripping flesh (NO obsidian/fire!)
  { body: '#ece4d6', bodyHi: '#ffffff', bodyDark: '#b2a290', accent: '#b82834', accentHi: '#e45864', eye: '#140e16', pupil: '#140e16', detail: '#8a7a6a', shorts: '#48383a' },
  // 5B. Plant B (Sonic homage): cobalt-blue spiky bloomed head, peach face/belly, red accents/stem
  { body: '#2868e0', bodyHi: '#64a4ff', bodyDark: '#183c98', accent: '#e42834', accentHi: '#ff646e', eye: '#ffffff', pupil: INK, detail: '#f2c090', shorts: '#c8202c' },
  // 6B. Y.V. B: meditating levitating pure-white pyramid with closed eye & golden aura
  { body: '#f6f6fa', bodyHi: '#ffffff', bodyDark: '#bcc0ce', accent: '#f5c838', accentHi: '#fff494', eye: INK, pupil: INK, detail: '#d8a220', shorts: '#282430' },
  // 7B. Steroids B: deeply tanned buff Steroids wearing white muscle tank top & sweatband (NO cowboy hat!)
  { body: '#c87c48', bodyHi: '#e8a872', bodyDark: '#8c4c24', accent: '#f2f4f8', accentHi: '#ffffff', eye: '#ffffff', pupil: INK, detail: '#dc2c38', shorts: '#385898' },
  // 8B. Robot B: cobalt-blue I.D.P.D. armor chassis with white trim & cyan IDPD visor
  { body: '#3068c8', bodyHi: '#6ca4f8', bodyDark: '#1c3e84', accent: '#eef4fc', accentHi: '#ffffff', eye: '#68f4ff', pupil: '#ffffff', detail: '#38a8ff', shorts: '#1c3468' },
  // 9B. Chicken B: black-feathered martial chicken with visible yellow beak & red comb/band
  { body: '#2a2836', bodyHi: '#4e4a62', bodyDark: '#14121c', accent: '#e42834', accentHi: '#ff6470', eye: '#ffffff', pupil: INK, detail: '#f8c428', shorts: '#8c1824' },
  // 10B. Rebel B: fluffy tan/brown winter coat with thick cream fur trim & warm scarf
  { body: '#a87a4e', bodyHi: '#d4a878', bodyDark: '#6c4a2c', accent: '#f0e6d2', accentHi: '#ffffff', eye: '#fff498', pupil: '#ffffff', detail: '#7a482a', shorts: '#4e3422' },
  // 11B. Horror B: dark purple/magenta crackling portal-energy beast!
  { body: '#8a2cd0', bodyHi: '#e074ff', bodyDark: '#441278', accent: '#c848ff', accentHi: '#ffc8ff', eye: '#ffffff', pupil: '#ffffff', detail: '#300c58', shorts: '#3c1068' },
  // 12B. Rogue B: light/tactical white & tan ex-IDPD operative + dark sunglasses
  { body: '#dce4ec', bodyHi: '#ffffff', bodyDark: '#96a4b4', accent: '#c8a474', accentHi: '#ebd0a4', eye: '#68ecff', pupil: '#ffffff', detail: '#3c74c8', shorts: '#525c6c' },
];

type MutantVariant =
  | 'idle'
  | 'walk'
  | 'hurt'
  | 'dead'
  | 'sit'
  | 'gosit'
  | 'revive'
  | 'headless_idle'
  | 'headless_walk'
  | 'headless_hurt';

/**
 * Draws a crisp native 1x Nuclear Throne mutant sprite (24x24 standard, 32x32 for Plant B / Rebel B /
 * Horror B / Skeleton Dead & Revive / Frog Revive, 24x32 for meditating levitating Y.V. B)
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
  const pal =
    raceIndex <= 12
      ? (isB ? MUTANT_B_PALETTES : MUTANT_A_PALETTES)[raceIndex - 1]!
      : raceIndex === 14
        ? // Skeleton (race 14)
          isB
          ? { body: '#dce8f0', bodyHi: '#ffffff', bodyDark: '#96aab8', accent: '#58f0ff', accentHi: '#d4fcff', eye: INK, pupil: '#58f0ff', detail: '#7c94a4', shorts: '#2c3a48' }
          : { body: '#ece6d8', bodyHi: '#ffffff', bodyDark: '#a89e8c', accent: '#58ff68', accentHi: '#d8ffc0', eye: INK, pupil: INK, detail: '#8c8070', shorts: '#342e28' }
        : // Frog (race 15)
          { body: '#5cd038', bodyHi: '#9cf864', bodyDark: '#2e8020', accent: '#b8ff48', accentHi: '#e8ffb0', eye: '#ffe838', pupil: INK, detail: '#44a828', shorts: '#24681a' };

  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // REVIVE (Skeleton 14 & Frog 15 — 32x32, 6 frames)
  if (variant === 'revive') {
    const prog = Math.min(1, frame / 5);
    const ringR = Math.round(12 - prog * 4);
    // Glowing green necro/toxic assembly aura on floor
    p.ellipse(cx, cy + 7, ringR, Math.max(3, Math.round(ringR * 0.45)), '#248c28');
    p.ellipse(cx, cy + 7, Math.max(3, ringR - 2), Math.max(2, Math.round((ringR - 2) * 0.4)), '#68ff58');
    // Rising vertical energy streaks
    for (let i = -2; i <= 2; i++) {
      const sy = cy + 6 - Math.round(prog * 14) + ((i + frame) & 1) * 2;
      p.rect(cx + i * 3, sy, 1, 5, '#c8ffb0');
    }
    if (raceIndex === 14) {
      // Assembling ivory skeleton bones!
      const rise = Math.round((1 - prog) * 7);
      p.rect(cx - 4, cy + 2 + rise, 8, 5, pal.bodyDark); // pelvis/ribs
      p.rect(cx - 3, cy + 2 + rise, 6, 1, pal.bodyHi);
      p.rect(cx - 3, cy + 4 + rise, 6, 1, pal.body);
      p.rect(cx - 4, cy - 6 + rise, 8, 6, pal.body); // skull rising into place
      p.rect(cx - 3, cy - 7 + rise, 6, 2, pal.bodyHi);
      p.rect(cx - 3, cy - 4 + rise, 2, 2, INK);
      p.rect(cx + 1, cy - 4 + rise, 2, 2, INK);
      p.set(cx - 2, cy - 4 + rise, '#78ff68');
      p.set(cx + 2, cy - 4 + rise, '#78ff68');
    } else {
      // Frog bursting up from green toxic cloud
      const rise = Math.round((1 - prog) * 6);
      p.ellipse(cx, cy + rise, 6, 5, pal.body);
      p.ellipse(cx - 1, cy - 2 + rise, 4, 3, pal.bodyHi);
      p.rect(cx - 4, cy - 5 + rise, 3, 3, pal.eye);
      p.rect(cx + 1, cy - 5 + rise, 3, 3, pal.eye);
      p.set(cx - 3, cy - 4 + rise, INK);
      p.set(cx + 2, cy - 4 + rise, INK);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  // DEAD: collapse -> dark muted desaturated flattened resting corpse!
  if (variant === 'dead') {
    if (raceIndex === 14) {
      // Skeleton 32x32 10-frame bone-scatter collapse!
      if (frame <= 2) {
        p.rect(cx - 5, cy - 3 + frame * 2, 10, 6, frame === 0 ? '#ffffff' : pal.body);
        p.rect(cx - 3, cy - 1 + frame * 2, 2, 2, INK);
        p.rect(cx + 1, cy - 1 + frame * 2, 2, 2, INK);
        p.rect(cx - 4, cy + 3 + frame, 8, 4, pal.bodyDark);
      } else {
        const sp = Math.min(4, frame - 2);
        // Scattered muted bone pile on floor
        p.ellipse(cx, cy + 6, 9 + sp, 4, '#2a2626');
        p.rect(cx - 6 - sp, cy + 5, 5, 2, '#9e9688');
        p.rect(cx + 2 + sp, cy + 6, 5, 2, '#8a8274');
        p.rect(cx - 2, cy + 4, 4, 3, '#b8b0a0'); // rib fragments
        // Resting skull
        p.rect(cx - 3, cy + 2, 6, 5, '#b6aea0');
        p.rect(cx - 2, cy + 2, 4, 2, '#d4ccc0');
        p.set(cx - 2, cy + 4, INK);
        p.set(cx + 1, cy + 4, INK);
      }
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }

    if (frame <= 1) {
      const fill = frame === 0 ? '#d4b8b8' : pal.bodyDark;
      p.rect(cx - 5, cy, 10, 6, fill);
      p.rect(cx - 4, cy - 1, 8, 2, pal.body);
      p.rect(cx - 3, cy + 2, 2, 2, raceIndex === 15 ? '#58e038' : '#9a1c28');
      p.rect(cx + 2, cy + 1, 2, 2, INK);
    } else if (frame === 2) {
      p.rect(cx - 6, cy + 2, 12, 5, pal.bodyDark);
      p.rect(cx - 4, cy + 1, 8, 2, pal.shorts);
      p.rect(cx + 2, cy + 3, 3, 2, raceIndex === 15 ? '#48c830' : '#6c1620');
    } else {
      // Final resting corpses (frames 3..5): dark muted flattened silhouettes
      p.rect(cx - 7, cy + 4, 14, 4, '#2a2228');
      p.rect(cx - 6, cy + 3, 11, 3, '#3c323a');
      p.rect(cx - 4, cy + 2 + (raceIndex % 2), 6, 2, '#50444c');
      if (raceIndex === 2) p.poly([[cx - 3, cy + 2], [cx + 1, cy + 1], [cx + 3, cy + 4]], pal.bodyDark);
      else if (raceIndex === 6) p.poly([[cx - 4, cy + 6], [cx, cy + 2], [cx + 4, cy + 6]], '#585662');
      else if (raceIndex === 15) p.rect(cx - 4, cy + 3, 7, 2, '#2c5424');
      else p.rect(cx - 3, cy + 4, 4, 1, pal.bodyDark);
      p.rect(cx + 2, cy + 4, 3, 2, raceIndex === 15 ? '#36682c' : '#4a1820');
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
    ? (frame % 2 === 1 ? -1 : 0)
    : variant === 'idle' || variant === 'headless_idle'
      ? (frame % 4 === 2 ? 1 : 0)
      : isSit
        ? 2 + (frame & 1)
        : isGoSit
          ? 1 + (frame & 1)
          : 0;
  const ty = cy + bob;

  // Compact chunky feet / seated legs (skip for levitating Y.V. B!)
  const skipFeet = raceIndex === 6 && isB;
  if (!skipFeet) {
    if (isSit) {
      p.rect(cx - 5, cy + 6, 3, 2, raceIndex === 5 && isB ? acc : boot);
      p.rect(cx + 2, cy + 6, 3, 2, raceIndex === 5 && isB ? acc : boot);
    } else {
      const stepL = isWalk ? (frame % 4 === 0 ? -1 : frame % 4 === 2 ? 1 : 0) : 0;
      const stepR = -stepL;
      const footCol = raceIndex === 5 && isB ? acc : raceIndex === 15 ? bodyDark : boot;
      p.rect(cx - 4 + stepL, cy + 6 - (frame % 4 === 0 && isWalk ? 1 : 0), 3, 2, footCol);
      p.rect(cx + 1 + stepR, cy + 6 - (frame % 4 === 2 && isWalk ? 1 : 0), 3, 2, footCol);
    }
  }

  switch (raceIndex) {
    case 1: {
      // FISH A & FISH B ("Big Bass": eyepatch + stubble + toothpick, NO red pirate bandana!)
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
        // Grizzled Big Bass: diagonal tactical eyepatch strap + black eyepatch
        p.line(cx - 5, ty - 5, cx + 4, ty - 2, '#1e1c24', 1);
        p.rect(cx - 4, ty - 4, 3, 3, INK);
        p.set(cx - 3, ty - 3, '#2c2a34');
        // Narrowed yellow right eye
        p.rect(cx + 1, ty - 4, 3, 3, eye);
        p.set(cx + 3, ty - 3, pupil);
        p.set(cx + 1, ty - 4, '#ffffff');
        // Rugged chin stubble dots
        p.set(cx - 3, ty + 1, '#1a3822');
        p.set(cx - 1, ty + 1, '#1a3822');
        p.set(cx + 1, ty + 1, '#1a3822');
        p.set(cx + 3, ty + 1, '#1a3822');
        // Wide grin + toothpick sticking out!
        p.rect(cx - 2, ty, 5, 1, '#183824');
        p.line(cx + 3, ty, cx + 6, ty - 1, '#f4e6b8', 1);
      } else {
        // Wide expressive yellow amphibian eyes
        p.rect(cx - 4, ty - 4, 3, 3, eye);
        p.rect(cx + 1, ty - 4, 3, 3, eye);
        p.set(cx - 2, ty - 3, pupil);
        p.set(cx + 3, ty - 3, pupil);
        p.set(cx - 4, ty - 4, '#ffffff');
        p.set(cx + 1, ty - 4, '#ffffff');
        p.rect(cx - 2, ty, 5, 1, '#183824');
      }
      break;
    }

    case 2: {
      // CRYSTAL A & CRYSTAL B ("Cheddar": chunkier, blockier warm amber crystal!)
      if (isB) {
        // Chunkier blocky amber shoulder crystals & wider armored silhouette
        p.rect(cx - 7, ty - 3, 3, 7, bodyDark);
        p.rect(cx - 7, ty - 3, 2, 3, bodyHi);
        p.rect(cx + 4, ty - 3, 3, 7, bodyDark);
        p.rect(cx + 4, ty - 3, 2, 2, body);
        p.rect(cx - 5, ty - 6, 10, 11, body);
        p.rect(cx - 4, ty - 8, 8, 3, bodyHi);
        p.rect(cx - 2, ty - 9, 4, 2, '#fff8c8');
        // Crisp blocky amber left bevel / deep right facet
        p.rect(cx - 5, ty - 6, 4, 9, bodyHi);
        p.rect(cx - 4, ty - 7, 2, 3, '#ffffff');
        p.rect(cx + 2, ty - 5, 3, 10, bodyDark);
        p.rect(cx - 5, ty + 4, 10, 2, shorts);
        // Radiant cyan eyes
        p.rect(cx - 3, ty - 2, 2, 2, eye);
        p.rect(cx + 1, ty - 2, 2, 2, eye);
      } else {
        p.rect(cx - 6, ty - 2, 2, 6, bodyDark);
        p.rect(cx + 4, ty - 2, 2, 6, bodyDark);
        p.rect(cx - 4, ty - 5, 8, 10, body);
        p.rect(cx - 3, ty - 7, 6, 3, bodyHi);
        p.rect(cx - 1, ty - 8, 2, 2, '#ffffff');
        p.rect(cx - 4, ty - 5, 3, 8, bodyHi);
        p.rect(cx - 3, ty - 6, 2, 2, '#ffffff');
        p.rect(cx + 2, ty - 4, 3, 9, bodyDark);
        p.rect(cx - 4, ty + 4, 8, 2, shorts);
        p.rect(cx - 3, ty - 2, 2, 2, eye);
        p.rect(cx + 1, ty - 2, 2, 2, eye);
      }
      break;
    }

    case 3: {
      // EYES A & EYES B (blue-slate psychic wearing classic red/blue 3D glasses!)
      p.rect(cx - 5, ty - 6, 10, 10, body);
      p.rect(cx - 4, ty - 7, 8, 2, bodyHi);
      p.rect(cx - 5, ty + 1, 10, 3, bodyDark);
      p.rect(cx - 4, ty + 3, 8, 3, shorts);
      const blink = variant === 'idle' && frame === 3;
      if (isB && !hurtPureWhite) {
        // Smaller extra eyes peeking above/below the 3D glasses
        p.rect(cx - 1, ty - 6, 2, 2, eye);
        p.set(cx, ty - 6, pupil);
        p.rect(cx - 2, ty + 1, 2, 2, eye);
        p.set(cx - 1, ty + 2, pupil);
        p.rect(cx + 2, ty + 1, 2, 2, eye);
        p.set(cx + 3, ty + 2, pupil);
        // Classic white cardboard 3D glasses with bright RED left lens & CYAN-BLUE right lens!
        p.rect(cx - 5, ty - 4, 10, 4, acc);
        p.rect(cx - 4, ty - 3, 3, 2, '#ff2838'); // Red lens
        p.set(cx - 4, ty - 3, '#ff98a0');
        p.rect(cx + 1, ty - 3, 3, 2, '#28a8ff'); // Blue lens
        p.set(cx + 1, ty - 3, '#a8ecff');
        p.rect(cx - 1, ty - 3, 2, 1, accHi); // bridge
      } else if (blink) {
        p.rect(cx - 4, ty - 3, 3, 1, INK);
        p.rect(cx + 1, ty - 3, 3, 1, INK);
        p.rect(cx - 1, ty - 6, 2, 1, INK);
      } else {
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
      // MELTING A & MELTING B ("Melted": slouched hunched paler exposed bone/skull & dripping flesh!)
      if (isB) {
        // Slouched, hunched skeletal/dripping pale flesh posture (shifted slightly lower/hunched!)
        const hy = ty + 1;
        // Exposed pale ribs & crimson dripping flesh
        p.rect(cx - 5, hy, 10, 5, bodyDark);
        p.rect(cx - 3, hy + 1, 6, 4, acc);
        p.rect(cx - 5, hy + 1, 3, 1, bodyHi);
        p.rect(cx + 2, hy + 1, 3, 1, bodyHi);
        p.rect(cx - 4, hy + 3, 2, 1, body);
        p.rect(cx + 2, hy + 3, 2, 1, body);
        // Pale slouched melting skull tilted slightly forward
        p.rect(cx - 5, hy - 5, 10, 6, body);
        p.rect(cx - 4, hy - 6, 8, 2, bodyHi);
        // Heavy dripping melted cheeks & pale ooze drops
        p.rect(cx - 6, hy - 1, 2, 4, body);
        p.rect(cx + 4, hy, 2, 3, bodyDark);
        p.set(cx - 5, hy + 3 + (frame & 1), acc);
        // Deep hollow sunken black sockets (authentic Melted — NOT lava orange!)
        p.rect(cx - 3, hy - 4, 2, 3, INK);
        p.rect(cx + 1, hy - 4, 2, 3, INK);
        // Exposed pale grimacing skull teeth
        p.rect(cx - 2, hy - 1, 5, 2, INK);
        p.set(cx - 2, hy - 1, bodyHi);
        p.set(cx, hy - 1, bodyHi);
        p.set(cx + 2, hy - 1, bodyHi);
      } else {
        p.rect(cx - 4, ty, 8, 6, bodyDark);
        p.rect(cx - 2, ty + 1, 4, 4, acc);
        p.rect(cx - 4, ty + 1, 2, 1, bodyHi);
        p.rect(cx + 2, ty + 1, 2, 1, bodyHi);
        p.rect(cx - 4, ty + 3, 2, 1, body);
        p.rect(cx + 2, ty + 3, 2, 1, body);
        p.rect(cx - 5, ty - 6, 10, 6, body);
        p.rect(cx - 4, ty - 7, 8, 2, bodyHi);
        p.rect(cx - 5, ty, 2, 2, body);
        p.rect(cx + 3, ty, 2, 2, bodyDark);
        p.rect(cx - 3, ty - 4, 2, 3, eye);
        p.rect(cx + 1, ty - 4, 2, 3, eye);
        p.rect(cx - 2, ty - 1, 4, 1, INK);
        p.set(cx - 1, ty - 1, bodyHi);
        p.set(cx + 1, ty - 1, bodyHi);
      }
      break;
    }

    case 5: {
      // PLANT A (24x24) & PLANT B (32x32 Sonic homage: cobalt-blue spikes, peach face/belly, red stem/shoes!)
      if (isB) {
        // Red stalk & collar leaves + peach belly!
        p.rect(cx - 4, ty + 1, 8, 6, body);
        p.rect(cx - 3, ty + 2, 6, 4, det); // peach Sonic belly
        p.rect(cx - 6, ty + 2, 3, 2, acc); // red collar leaves
        p.rect(cx + 3, ty + 2, 3, 2, acc);
        // Swept-back iconic Sonic cobalt-blue spiky bloomed quills!
        p.poly([[cx - 2, ty - 8], [cx - 11, ty - 10], [cx - 6, ty - 4]], body);
        p.poly([[cx - 4, ty - 5], [cx - 12, ty - 5], [cx - 5, ty - 1]], bodyDark);
        p.poly([[cx - 3, ty - 2], [cx - 10, ty], [cx - 4, ty + 1]], bodyDark);
        // Round cobalt-blue head + peach snout/face
        p.ellipse(cx + 1, ty - 5, 6, 5.5, body);
        p.ellipse(cx, ty - 7, 4, 2.5, bodyHi);
        p.rect(cx - 1, ty - 3, 7, 4, det); // peach muzzle/snout
        p.rect(cx + 5, ty - 3, 2, 1, INK); // little black nose tip
        // Sharp white Sonic eyes + fierce grin
        p.rect(cx, ty - 7, 2, 3, eye);
        p.rect(cx + 3, ty - 7, 2, 3, eye);
        p.set(cx + 1, ty - 6, pupil);
        p.set(cx + 4, ty - 6, pupil);
        // Red sneaker stripes on feet
        p.rect(cx - 5, cy + 5, 4, 2, acc);
        p.rect(cx - 4, cy + 5, 2, 1, '#ffffff');
        p.rect(cx + 1, cy + 5, 4, 2, acc);
        p.rect(cx + 2, cy + 5, 2, 1, '#ffffff');
      } else {
        p.rect(cx - 4, ty + 1, 8, 5, bodyDark);
        p.rect(cx - 3, ty + 1, 6, 4, body);
        p.rect(cx - 6, ty + 2, 2, 2, bodyHi);
        p.rect(cx + 4, ty + 2, 2, 2, bodyHi);
        p.rect(cx - 5, ty - 7, 10, 8, body);
        p.rect(cx - 4, ty - 8, 8, 2, bodyHi);
        p.rect(cx - 4, ty - 4, 8, 4, acc);
        p.rect(cx - 3, ty - 3, 6, 2, '#18060a');
        p.set(cx - 3, ty - 3, det);
        p.set(cx - 1, ty - 3, det);
        p.set(cx + 1, ty - 3, det);
        p.set(cx + 3, ty - 3, det);
        p.set(cx - 2, ty - 2, det);
        p.set(cx + 2, ty - 2, det);
        p.rect(cx - 3, ty - 6, 2, 2, eye);
        p.rect(cx + 1, ty - 6, 2, 2, eye);
      }
      break;
    }

    case 6: {
      // Y.V. A (24x24) & Y.V. B (24x32, 14f meditating levitating pure-white pyramid with closed eye!)
      if (isB) {
        const hover = isSit ? 3 : Math.round(Math.sin((frame / 14) * Math.PI * 2) * 3) - 2;
        const py = cy + hover;
        // Subtle floating shadow / zen energy flecks below levitating pyramid
        if (!isSit) {
          p.rect(cx - 4, cy + 11, 9, 1, '#343040');
          p.set(cx - 7, py + 2 + (frame & 1), accHi);
          p.set(cx + 7, py - 1 - (frame & 1), accHi);
        }
        // Pure-white sharp meditating pyramid
        for (let row = 0; row < 14; row++) {
          const halfW = Math.min(7, Math.floor((row + 1) * 0.54));
          const ry = py - 9 + row;
          p.rect(cx - halfW, ry, halfW * 2 + 1, 1, body);
          if (halfW >= 2) {
            p.rect(cx - halfW, ry, Math.max(1, Math.floor(halfW * 0.65)), 1, bodyHi);
            p.rect(cx + Math.max(1, Math.floor(halfW * 0.45)), ry, Math.max(1, halfW - Math.floor(halfW * 0.45) + 1), 1, bodyDark);
          }
        }
        // Peaceful closed meditating eye (serene curved eyelid — NO red shades!)
        p.rect(cx - 3, py - 2, 7, 1, INK);
        p.set(cx - 4, py - 3, INK);
        p.set(cx + 4, py - 3, INK);
        p.set(cx, py - 1, bodyDark);
        // Subtle crossed meditating legs tucked cleanly + gold chain
        p.rect(cx - 3, py + 4, 7, 1, acc);
        p.rect(cx - 1, py + 5, 3, 1, accHi);
        p.rect(cx - 4, py + 6, 3, 2, shorts);
        p.rect(cx + 2, py + 6, 3, 2, shorts);
      } else {
        for (let row = 0; row < 12; row++) {
          const halfW = Math.min(6, Math.floor((row + 1) * 0.55));
          const ry = ty - 7 + row;
          p.rect(cx - halfW, ry, halfW * 2 + 1, 1, body);
          if (halfW >= 2) {
            p.rect(cx - halfW, ry, Math.max(1, Math.floor(halfW * 0.7)), 1, bodyHi);
            p.rect(cx + Math.max(1, Math.floor(halfW * 0.4)), ry, Math.max(1, halfW - Math.floor(halfW * 0.4) + 1), 1, bodyDark);
          }
        }
        p.rect(cx - 3, ty - 3, 7, 4, INK);
        p.rect(cx - 2, ty - 2, 5, 2, eye);
        p.rect(cx, ty - 2, 2, 2, pupil);
        p.set(cx - 1, ty - 2, '#ffffff');
        p.rect(cx - 3, ty + 3, 7, 1, acc);
        p.rect(cx - 1, ty + 4, 3, 1, accHi);
      }
      break;
    }

    case 7: {
      // STEROIDS A (shirtless + glasses) & STEROIDS B (deeply tanned + white muscle tank top + sweatband!)
      const skinMid = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffd4d4' : isB ? '#c87c48' : '#e49f68';
      const skinHi = hurtPureWhite ? '#ffffff' : hurtPink ? '#ffffff' : isB ? '#e8a872' : '#fad0a0';
      const skinShade = hurtPureWhite ? '#e8e8e8' : hurtPink ? '#e08088' : isB ? '#8c4c24' : '#b86c3c';
      const muscleLine = hurtPureWhite ? '#d8d8d8' : hurtPink ? '#c86870' : isB ? '#683416' : '#8c4c28';
      // Broad flexed bare muscular arms on both sides
      p.rect(cx - 7, ty - 2, 3, 6, skinMid);
      p.rect(cx - 7, ty - 2, 2, 2, skinHi);
      p.rect(cx - 7, ty + 2, 3, 2, skinShade);
      p.rect(cx + 4, ty - 2, 3, 6, skinMid);
      p.rect(cx + 5, ty - 2, 2, 2, skinHi);
      p.rect(cx + 4, ty + 2, 3, 2, skinShade);
      if (isB) {
        // White athletic muscle tank top covering torso with deep neck scoop & straps!
        p.rect(cx - 5, ty - 3, 10, 7, acc);
        p.rect(cx - 4, ty - 2, 8, 2, accHi);
        p.rect(cx - 5, ty + 2, 10, 2, hurtPureWhite ? '#e0e0e0' : '#bcc4d0');
        p.rect(cx - 2, ty - 3, 4, 2, skinMid); // muscular tank top collar scoop
      } else {
        // Huge muscular shirtless torso
        p.rect(cx - 5, ty - 3, 10, 7, skinMid);
        p.rect(cx - 4, ty - 2, 3, 2, skinHi);
        p.rect(cx + 1, ty - 2, 3, 2, skinHi);
        p.rect(cx - 4, ty, 3, 1, muscleLine);
        p.rect(cx + 1, ty, 3, 1, muscleLine);
        p.rect(cx, ty - 2, 1, 5, muscleLine);
        p.rect(cx - 3, ty + 2, 2, 1, skinShade);
        p.rect(cx + 1, ty + 2, 2, 1, skinShade);
      }
      // Blue shorts + belt buckle
      p.rect(cx - 5, ty + 3, 10, 3, shorts);
      p.rect(cx - 4, ty + 3, 3, 1, hurtPureWhite ? '#ffffff' : '#5878b4');
      p.rect(cx - 1, ty + 3, 2, 2, '#e8c448');
      // Muscular cranium
      p.rect(cx - 4, ty - 7, 8, 5, skinMid);
      p.rect(cx - 3, ty - 8, 6, 2, skinHi);
      p.rect(cx - 4, ty - 3, 8, 1, skinShade);
      if (isB && !hurtPureWhite) {
        // Athletic red-and-white sweatband across forehead (NO cowboy hat!)
        p.rect(cx - 5, ty - 7, 10, 2, acc);
        p.rect(cx - 4, ty - 7, 8, 1, det);
        // Compact fierce eyes + dark spectacles
        p.rect(cx - 3, ty - 5, 2, 2, INK);
        p.rect(cx + 1, ty - 5, 2, 2, INK);
        p.set(cx - 3, ty - 5, '#d8f4ff');
        p.set(cx + 1, ty - 5, '#d8f4ff');
        p.rect(cx - 1, ty - 3, 2, 1, muscleLine);
      } else {
        p.rect(cx - 3, ty - 6, 2, 2, INK);
        p.rect(cx + 1, ty - 6, 2, 2, INK);
        p.set(cx - 1, ty - 6, INK);
        p.set(cx, ty - 6, INK);
        if (!hurtPureWhite) {
          p.set(cx - 3, ty - 6, '#d8f4ff');
          p.set(cx + 1, ty - 6, '#d8f4ff');
          p.set(cx - 2, ty - 5, '#465a70');
          p.set(cx + 2, ty - 5, '#465a70');
        }
        p.rect(cx - 3, ty - 7, 6, 1, skinShade);
        p.rect(cx - 1, ty - 4, 2, 1, muscleLine);
      }
      break;
    }

    case 8: {
      // ROBOT A & ROBOT B (Blue I.D.P.D. Armor chassis + white shoulder pauldrons & crest + cyan visor!)
      p.rect(cx, ty - 9, 1, 3, bodyDark);
      p.rect(cx - 1, ty - 9, 2, 1, isB ? acc : det);
      // Side mechanical arms (white IDPD pauldrons on B!)
      p.rect(cx - 6, ty - 1, 2, 5, isB ? acc : acc);
      p.rect(cx + 4, ty - 1, 2, 5, isB ? acc : acc);
      // Boxy steel / cobalt IDPD CRT chassis
      p.rect(cx - 5, ty - 6, 10, 11, body);
      p.rect(cx - 5, ty - 6, 10, 2, bodyHi);
      p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
      if (isB) {
        // White IDPD helmet crest & chest stripe
        p.rect(cx - 1, ty - 7, 2, 2, accHi);
        p.rect(cx - 4, ty + 1, 8, 2, acc);
      }
      // Dark CRT bezel + bright glowing cyan visor
      p.rect(cx - 4, ty - 4, 8, 5, INK);
      p.rect(cx - 3, ty - 3, 6, 3, eye);
      p.rect(cx - 2, ty - 3 + (frame & 1), 4, 1, pupil);
      // Chest grille & LEDs
      if (!isB) {
        p.rect(cx - 3, ty + 2, 6, 2, acc);
        p.set(cx - 2, ty + 2, det);
        p.set(cx + 1, ty + 2, '#ffe048');
      } else {
        p.rect(cx - 2, ty + 3, 4, 1, det);
      }
      break;
    }

    case 9: {
      // CHICKEN A (white) & CHICKEN B (black feathers WITH visible yellow beak & red comb!)
      p.rect(cx - 5, ty - 1, 10, 6, body);
      p.rect(cx - 4, ty - 1, 7, 2, bodyHi);
      p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
      p.rect(cx - 4, ty + 3, 8, 2, shorts);
      if (isHeadless) {
        p.rect(cx - 2, ty - 3, 4, 2, '#cc2028');
        p.set(cx - 1 + (frame & 1), ty - 5, '#ff3844');
        p.set(cx + 1, ty - 4 - (frame & 1), '#ff3844');
      } else {
        // Head
        p.rect(cx - 4, ty - 6, 8, 6, body);
        p.rect(cx - 3, ty - 6, 6, 2, bodyHi);
        // Vivid crimson comb on top (BOTH A and B!)
        p.rect(cx - 2, ty - 8, 2, 2, acc);
        p.rect(cx + 1, ty - 8, 2, 2, acc);
        p.set(cx - 1, ty - 9, accHi);
        // Crimson martial headband + fluttering tail
        p.rect(cx - 4, ty - 5, 8, 2, acc);
        p.rect(cx - 7, ty - 4 + (frame & 1), 3, 2, acc);
        // Fierce visible eyes
        p.set(cx - 2, ty - 3, eye);
        p.set(cx + 2, ty - 3, eye);
        // Crisp visible yellow beak (BOTH A and B!)
        p.rect(cx + 2, ty - 2, 4, 2, det);
        p.set(cx + 3, ty - 2, '#fff498');
      }
      break;
    }

    case 10: {
      // REBEL A (24x24 blue hood) & REBEL B (32x32 fluffy tan/brown winter coat w/ cream fur trim!)
      if (isB) {
        // Fluffy thick tan/brown winter parka & shoulders
        p.rect(cx - 7, ty - 4, 14, 11, body);
        p.rect(cx - 6, ty - 5, 12, 3, bodyHi);
        p.rect(cx + 3, ty - 4, 4, 10, bodyDark);
        // Fluffy cream fur hood collar & bottom coat hem!
        p.rect(cx - 7, ty + 5, 14, 2, acc);
        p.rect(cx - 6, ty - 8, 12, 5, body);
        p.rect(cx - 5, ty - 9, 10, 2, bodyHi);
        // Thick fluffy cream fur framing the dark hood face opening!
        p.rect(cx - 5, ty - 7, 10, 6, acc);
        p.rect(cx - 4, ty - 7, 8, 1, accHi);
        p.rect(cx - 3, ty - 6, 6, 4, INK);
        p.rect(cx - 2, ty - 5, 2, 2, eye);
        p.rect(cx + 1, ty - 5, 2, 2, eye);
        // Cozy brown winter scarf draped across chest
        p.rect(cx - 6, ty - 1, 12, 3, det);
        p.rect(cx + 2, ty + 1, 3, 4, det);
      } else {
        p.rect(cx - 5, ty - 5, 10, 10, body);
        p.rect(cx - 4, ty - 7, 8, 3, body);
        p.rect(cx - 3, ty - 7, 5, 2, bodyHi);
        p.rect(cx + 2, ty - 5, 3, 9, bodyDark);
        p.rect(cx - 3, ty - 5, 6, 4, INK);
        p.rect(cx - 2, ty - 4, 2, 2, eye);
        p.rect(cx + 1, ty - 4, 2, 2, eye);
        p.rect(cx - 5, ty - 1, 10, 3, acc);
        p.rect(cx - 4, ty - 1, 7, 1, accHi);
        p.rect(cx + 2, ty + 1, 3, 4, acc);
      }
      break;
    }

    case 11: {
      // HORROR A (24x24 green rad beast) & HORROR B (32x32 dark purple/magenta crackling portal beast!)
      const shift = frame & 1;
      if (isB) {
        // Crackling dorsal portal energy spikes!
        p.poly([[cx - 6, ty - 4], [cx - 10, ty - 9 + shift], [cx - 3, ty - 6]], bodyHi);
        p.poly([[cx - 1, ty - 6], [cx, ty - 11 - shift], [cx + 2, ty - 6]], accHi);
        p.poly([[cx + 3, ty - 6], [cx + 10, ty - 9 - shift], [cx + 6, ty - 4]], bodyHi);
        // Dark violet/magenta portal body
        p.ellipse(cx, ty, 8, 7, bodyDark);
        p.ellipse(cx, ty - 1, 6.5, 5.5, body);
        p.ellipse(cx - 1, ty - 2, 4, 3, bodyHi);
        // Crackling lightning tendrils & orbiting magenta portal sparks
        p.line(cx - 8, ty + 1, cx - 12, ty - 2 + shift * 2, acc, 1);
        p.line(cx + 8, ty + 1, cx + 12, ty - 2 - shift * 2, acc, 1);
        p.rect(cx - 11, ty - 5 + shift, 2, 2, accHi);
        p.rect(cx + 9, ty - 3 - shift, 2, 2, accHi);
        // Glaring white/magenta eyes & crackling portal maw
        p.rect(cx - 4, ty - 3, 3, 2, eye);
        p.rect(cx + 1, ty - 3, 3, 2, eye);
        p.rect(cx - 4, ty + 1, 8, 3, INK);
        p.rect(cx - 3, ty + 2, 6, 1, accHi);
      } else {
        p.rect(cx - 5, ty - 5, 10, 10, body);
        p.rect(cx - 4, ty - 6, 8, 2, bodyHi);
        p.rect(cx - 6, ty - 3, 12, 6, body);
        p.rect(cx - 3, ty - 4, 6, 4, bodyHi);
        p.rect(cx - 2, ty - 3, 3, 2, accHi);
        p.rect(cx - 5, ty + 3, 10, 2, bodyDark);
        p.rect(cx - 8, ty - 3 + shift, 2, 2, acc);
        p.rect(cx + 6, ty - 1 - shift, 2, 2, acc);
        p.rect(cx - 3, ty - 3, 2, 2, eye);
        p.rect(cx + 1, ty - 3, 2, 2, eye);
        p.rect(cx - 3, ty + 1, 6, 2, eye);
        p.set(cx - 1, ty + 1, accHi);
        p.set(cx + 1, ty + 1, accHi);
      }
      break;
    }

    case 12: {
      // ROGUE A (cobalt IDPD armor) & ROGUE B (light white/tan tactical ex-IDPD operative + sunglasses!)
      if (isB) {
        // Blue ex-IDPD shoulder trim + crisp white/tan tactical vest
        p.rect(cx - 6, ty - 1, 2, 4, det);
        p.rect(cx + 4, ty - 1, 2, 4, det);
        p.rect(cx - 4, ty - 1, 8, 6, body);
        p.rect(cx - 4, ty + 1, 8, 2, acc);
        p.rect(cx - 3, ty + 1, 4, 1, accHi);
        p.rect(cx - 4, ty + 3, 8, 2, shorts);
        // Unhelmeted/light tactical head + swept dark hair + cool sunglasses!
        p.rect(cx - 4, ty - 7, 8, 6, hurtPureWhite ? '#ffffff' : '#e4b08c');
        p.rect(cx - 5, ty - 8, 10, 3, hurtPureWhite ? '#e8e8e8' : '#3a2428'); // dark swept hair
        p.rect(cx - 4, ty - 8, 6, 1, hurtPureWhite ? '#ffffff' : '#644044');
        // Dark shades with bright cyan reflection!
        p.rect(cx - 4, ty - 5, 8, 2, INK);
        p.set(cx - 3, ty - 5, eye);
        p.set(cx + 1, ty - 5, eye);
      } else {
        p.rect(cx - 6, ty - 1, 2, 4, det);
        p.rect(cx + 4, ty - 1, 2, 4, det);
        p.rect(cx - 4, ty - 1, 8, 6, body);
        p.rect(cx - 4, ty + 1, 8, 2, acc);
        p.rect(cx - 3, ty + 1, 4, 1, accHi);
        p.rect(cx - 4, ty + 3, 8, 2, shorts);
        p.rect(cx - 4, ty - 7, 8, 6, body);
        p.rect(cx - 3, ty - 7, 6, 2, bodyHi);
        p.rect(cx - 1, ty - 8, 2, 2, det);
        p.rect(cx - 3, ty - 5, 6, 3, INK);
        p.rect(cx - 2, ty - 4, 5, 1, eye);
        p.set(cx - 1, ty - 4, pupil);
      }
      break;
    }

    case 14: {
      // SKELETON (Race 14): Crisp ivory skull, hollow black eye sockets, exposed ribcage & pelvis!
      const rattle = isWalk ? ((frame & 1) === 0 ? -1 : 1) : 0;
      // Pelvis & spine
      p.rect(cx - 3, ty + 3, 6, 2, bodyDark);
      p.rect(cx - 1, ty - 1, 2, 5, body);
      // Exposed ivory ribcage bars
      p.rect(cx - 4, ty, 8, 1, bodyHi);
      p.rect(cx - 4, ty + 2, 8, 1, body);
      p.set(cx - 2, ty + 1, INK);
      p.set(cx + 1, ty + 1, INK);
      // Bony arms rattling
      p.rect(cx - 6, ty + rattle, 2, 4, bodyDark);
      p.rect(cx + 4, ty - rattle, 2, 4, bodyDark);
      // Crisp round ivory skull
      p.rect(cx - 4, ty - 7, 8, 6, body);
      p.rect(cx - 3, ty - 8, 6, 2, bodyHi);
      p.rect(cx - 3, ty - 2, 6, 2, bodyDark);
      // Hollow black eye sockets + tiny nose cavity
      p.rect(cx - 3, ty - 5, 2, 3, INK);
      p.rect(cx + 1, ty - 5, 2, 3, INK);
      if (isB && !hurtPureWhite) {
        p.set(cx - 2, ty - 4, acc);
        p.set(cx + 2, ty - 4, acc);
      }
      // Skull grin teeth
      p.rect(cx - 2, ty - 2, 4, 1, INK);
      p.set(cx - 2, ty - 2, bodyHi);
      p.set(cx, ty - 2, bodyHi);
      p.set(cx + 2, ty - 2, bodyHi);
      break;
    }

    default: {
      // FROG (Race 15): Plump bouncy lime-green mutant frog, huge golden eyes, wide round belly!
      const hop = isWalk && (frame === 1 || frame === 2 || frame === 4) ? -1 : 0;
      const fy = ty + hop;
      // Plump wide round lime-green frog torso & pale belly
      p.ellipse(cx, fy, 6, 5, body);
      p.ellipse(cx - 1, fy - 2, 4, 2.5, bodyHi);
      p.ellipse(cx, fy + 2, 4, 2.5, acc); // bright lime belly patch
      p.rect(cx - 5, fy + 3, 10, 2, bodyDark);
      // Huge bulging golden-yellow eyes perched on top of head!
      p.rect(cx - 5, fy - 7, 4, 4, bodyHi);
      p.rect(cx + 1, fy - 7, 4, 4, bodyHi);
      p.rect(cx - 4, fy - 6, 3, 3, eye);
      p.rect(cx + 1, fy - 6, 3, 3, eye);
      p.set(cx - 3, fy - 5, pupil);
      p.set(cx + 2, fy - 5, pupil);
      p.set(cx - 4, fy - 6, '#ffffff');
      p.set(cx + 1, fy - 6, '#ffffff');
      // Wide cheeky frog grin
      p.rect(cx - 4, fy - 1, 8, 1, '#1a4a12');
      // Subtle toxic bubble on idle/sit
      if ((variant === 'idle' || variant === 'sit') && (frame === 2 || frame === 3) && !hurtPureWhite) {
        p.rect(cx + 5, fy - 3, 2, 2, accHi);
      }
      break;
    }
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

/**
 * Draws Chicken's detached flying head (A = white feathers, B = black feathers w/ yellow beak & red comb).
 */
function drawChickenHead1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  isB: boolean,
  hurt: boolean,
  frame: number,
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const white = hurt && frame === 0;
  const body = white ? '#ffffff' : isB ? '#2a2836' : '#f2f2f2';
  const bodyHi = white ? '#ffffff' : isB ? '#4e4a62' : '#ffffff';
  const acc = white ? '#ffffff' : '#e42834';
  const beak = white ? '#ffffff' : '#f8c428';
  // Comb
  p.rect(cx - 2, cy - 5, 2, 2, acc);
  p.rect(cx + 1, cy - 5, 2, 2, acc);
  // Head + headband
  p.rect(cx - 4, cy - 3, 8, 6, body);
  p.rect(cx - 3, cy - 3, 6, 2, bodyHi);
  p.rect(cx - 4, cy - 2, 8, 2, acc);
  // Eyes & visible yellow beak
  p.set(cx - 2, cy, isB && !white ? '#ffffff' : INK);
  p.set(cx + 1, cy, isB && !white ? '#ffffff' : INK);
  p.rect(cx + 2, cy, 4, 2, beak);
  p.set(cx + 3, cy, '#fff498');
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

    // Per-race authentic B-skin dimensions:
    // Plant B = 32x32 (Sonic spikes), Y.V. B = 24x32 (14f levitating meditation),
    // Rebel B = 32x32 (fluffy winter coat), Horror B = 32x32 (crackling portal beast)!
    const bw = race === 5 || race === 10 || race === 11 ? 32 : 24;
    const bh = race === 5 || race === 6 || race === 10 || race === 11 ? 32 : 24;
    const box = Math.floor(bw / 2);
    const boy = Math.floor(bh / 2);
    const idleFrames = race === 6 ? 14 : 4;
    const walkFrames = race === 6 ? 14 : 4;

    b.addSprite(`${p}BIdle`, bw, bh, box, boy, idleFrames, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'idle', f));
    b.addSprite(`${p}BWalk`, bw, bh, box, boy, walkFrames, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'walk', f));
    b.addSprite(`${p}BHurt`, bw, bh, box, boy, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'hurt', f));
    b.addSprite(`${p}BDead`, bw, bh, box, boy, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'dead', f));
    b.addSprite(`${p}BSit`, bw, bh, box, boy, 2, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'sit', f));
    b.addSprite(`${p}BGoSit`, bw, bh, box, boy, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, race, true, 'gosit', f));
  }

  // SKELETON (Race 14 — Blueprint Section 5.1 #3)
  b.addSprite('sprMutant14Idle', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'idle', f));
  b.addSprite('sprMutant14Walk', 24, 24, 12, 12, 7, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'walk', f));
  b.addSprite('sprMutant14Hurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'hurt', f));
  b.addSprite('sprMutant14Sit', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'sit', f));
  b.addSprite('sprMutant14GoSit', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'gosit', f));
  b.addSprite('sprMutant14Dead', 32, 32, 16, 16, 10, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'dead', f));
  b.addSprite('sprMutant14Revive', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, false, 'revive', f));
  // Skeleton B-skin optional parity sprites
  b.addSprite('sprMutant14BIdle', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'idle', f));
  b.addSprite('sprMutant14BWalk', 24, 24, 12, 12, 7, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'walk', f));
  b.addSprite('sprMutant14BHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'hurt', f));
  b.addSprite('sprMutant14BDead', 32, 32, 16, 16, 10, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'dead', f));
  b.addSprite('sprMutant14BSit', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'sit', f));
  b.addSprite('sprMutant14BGoSit', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 14, true, 'gosit', f));

  // FROG (Race 15 — Blueprint Section 5.1 #3)
  b.addSprite('sprMutant15Idle', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'idle', f));
  b.addSprite('sprMutant15Walk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'walk', f));
  b.addSprite('sprMutant15Hurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'hurt', f));
  b.addSprite('sprMutant15Dead', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'dead', f));
  b.addSprite('sprMutant15Sit', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'sit', f));
  b.addSprite('sprMutant15GoSit', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'gosit', f));
  b.addSprite('sprMutant15Revive', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 15, false, 'revive', f));

  // Headless Chicken A & B + Detached Flying Head sprites
  b.addSprite('sprMutant9HeadlessIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_idle', f));
  b.addSprite('sprMutant9HeadlessWalk', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_walk', f));
  b.addSprite('sprMutant9HeadlessHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, false, 'headless_hurt', f));
  b.addSprite('sprMutant9BHeadlessIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, true, 'headless_idle', f));
  b.addSprite('sprMutant9BHeadlessWalk', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, true, 'headless_walk', f));
  b.addSprite('sprMutant9BHeadlessHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMutant1x(ctx, x, y, w, h, 9, true, 'headless_hurt', f));
  b.addSprite('sprMutant9HeadIdle', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawChickenHead1x(ctx, x, y, w, h, false, false, f));
  b.addSprite('sprMutant9HeadHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawChickenHead1x(ctx, x, y, w, h, false, true, f));
  b.addSprite('sprMutant9BHeadIdle', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawChickenHead1x(ctx, x, y, w, h, true, false, f));
  b.addSprite('sprMutant9BHeadHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawChickenHead1x(ctx, x, y, w, h, true, true, f));

  // HORROR B PURPLE PORTAL BEAM & IMPACT SPLASHES (Blueprint Section 5.1 #3)
  b.addSprite('sprHorrorBBullet', 20, 16, 10, 8, 2, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 10;
    const cy = 8;
    p.ellipse(cx, cy, 7.5, 5.5, '#7c1cc8');
    p.ellipse(cx, cy, 5.5, 4.2, '#b838ff');
    p.ellipse(cx, cy, 3.5, 2.6, f === 0 ? '#ffa8ff' : '#ffffff');
    p.set(cx - 1, cy - 1, '#ffffff');
    p.line(cx - 8, cy + (f === 0 ? -2 : 2), cx - 5, cy, '#ffa8ff', 1);
    p.line(cx + 8, cy + (f === 0 ? 2 : -2), cx + 5, cy, '#ffa8ff', 1);
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  const drawHorrorHit = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    outer: string,
    mid: string,
    core: string,
  ): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = 4 + f * 2.5;
    if (f < 2) {
      p.ellipse(cx, cy, r, r, outer);
      p.ellipse(cx, cy, Math.max(2, r - 2), Math.max(2, r - 2), mid);
      p.ellipse(cx, cy, Math.max(1, r - 4), Math.max(1, r - 4), core);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + f * 0.45;
      const dist = 4 + f * 3;
      const sx = Math.round(cx + Math.cos(ang) * dist);
      const sy = Math.round(cy + Math.sin(ang) * dist);
      p.rect(sx - 1, sy - 1, 2, 2, i % 2 === 0 ? mid : core);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  b.addSprite('sprHorrorBulletHit', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) =>
    drawHorrorHit(ctx, x, y, w, h, f, '#28a830', '#78ff58', '#ffffff'),
  );
  b.addSprite('sprHorrorBulletHitB', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) =>
    drawHorrorHit(ctx, x, y, w, h, f, '#7c1cc8', '#d458ff', '#ffffff'),
  );

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
    drawCrystalShield1x(ctx, x, y, w, h, f, '#f0a420', '#ffe878', '#a66010'),
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

  // ICONIC CRISP 1x WHITE STRONG SPIRIT HALO
  b.addSprite('sprStrongSpirit', 20, 20, 10, 10, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 10;
    const hy = 3 + (f === 1 || f === 2 ? -1 : 0);
    p.rect(cx - 4, hy - 1, 9, 1, '#ffffff');
    p.rect(cx - 4, hy + 2, 9, 1, '#d8f4ff');
    p.rect(cx - 5, hy, 2, 2, '#ffffff');
    p.rect(cx + 4, hy, 2, 2, '#d8f4ff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
}
