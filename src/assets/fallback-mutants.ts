import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas, makeRamp } from './pixel-art';

export interface MutantPalette {
  body: string;
  accent: string;
  eye: string;
  pupil: string;
  detail: string;
}

export const MUTANT_A_PALETTES: readonly MutantPalette[] = [
  // 1. Fish: teal-green amphibian, dorsal fin, golden eyes, leather belt
  { body: '#42ab6b', accent: '#247852', eye: '#fff066', pupil: '#14101a', detail: '#9c6238' },
  // 2. Crystal: faceted violet/magenta prismatic crystal titan
  { body: '#ad4ce0', accent: '#de80ff', eye: '#ffffff', pupil: '#4a1273', detail: '#8a2ebd' },
  // 3. Eyes: deep cobalt multi-eyed psychic
  { body: '#3c6bcc', accent: '#284a99', eye: '#ffffff', pupil: '#120e16', detail: '#7c52e0' },
  // 4. Melting: bone-ivory cracked skull & exposed crimson ribcage
  { body: '#dfd4be', accent: '#b82c38', eye: '#18111c', pupil: '#18111c', detail: '#736555' },
  // 5. Plant: emerald stalk + snapping crimson flytrap maw
  { body: '#3aba45', accent: '#e02b3a', eye: '#ffe847', pupil: '#ffffff', detail: '#fff4cf' },
  // 6. Y.V.: sharp ivory 3D pyramid + gold chain + cyclops eye
  { body: '#f0edf5', accent: '#f7c636', eye: '#ffffff', pupil: '#120e16', detail: '#d49a1e' },
  // 7. Steroids: hulking tan scientist in shredded white lab coat + glasses
  { body: '#d98e62', accent: '#eeeaf5', eye: '#9ce8ff', pupil: '#18141a', detail: '#6b3b24' },
  // 8. Robot: brushed steel CRT automaton + glowing green visor
  { body: '#8aa0ad', accent: '#364350', eye: '#59ff7a', pupil: '#e6ffe8', detail: '#eb3d34' },
  // 9. Chicken: feathered white martial artist + red comb & fluttering headband
  { body: '#f5f0e6', accent: '#e62e26', eye: '#18141a', pupil: '#ffffff', detail: '#f7a923' },
  // 10. Rebel: desert nomad in weathered olive hood & layered tan scarf
  { body: '#799175', accent: '#c9af83', eye: '#ffe859', pupil: '#1a1410', detail: '#344232' },
  // 11. Horror: translucent bubbling neon-green radioactive slime beast
  { body: '#40ed52', accent: '#85ff70', eye: '#122616', pupil: '#e0ffc4', detail: '#24b83d' },
  // 12. Rogue: armored cobalt ex-IDPD trooper with white pauldrons & cyan visor
  { body: '#3b73cf', accent: '#edf3fc', eye: '#7df4ff', pupil: '#ffffff', detail: '#224994' },
];

export const MUTANT_B_PALETTES: readonly MutantPalette[] = [
  // 1B. Fish B: swamp-green pirate + crimson bandana & eyepatch + gold strap
  { body: '#2c8552', accent: '#d92638', eye: '#ffe859', pupil: '#141118', detail: '#f5c742' },
  // 2B. Crystal B: imperial golden-amber crystal golem + icy cyan eyes
  { body: '#eba828', accent: '#ffe066', eye: '#80f7ff', pupil: '#266b85', detail: '#c97812' },
  // 3B. Eyes B: dark plum/crimson mystic with glowing golden eyes
  { body: '#5c2a78', accent: '#a8214a', eye: '#ffe84d', pupil: '#1a0c14', detail: '#bd335a' },
  // 4B. Melting B: charred obsidian skull with blazing volcanic orange sockets
  { body: '#4d4457', accent: '#e03b28', eye: '#ff6e1a', pupil: '#fff48f', detail: '#8f221b' },
  // 5B. Plant B: exotic teal stalk with neon magenta flytrap jaws
  { body: '#288f81', accent: '#d429bf', eye: '#7dffec', pupil: '#ffffff', detail: '#ffe8ff' },
  // 6B. Y.V. B: VIP solid gold pyramid with crimson shades
  { body: '#f5c436', accent: '#d62438', eye: '#ff4252', pupil: '#140c10', detail: '#38d968' },
  // 7B. Steroids B: commando crimson-black vest & dark tactical shades
  { body: '#cc7d52', accent: '#353140', eye: '#18141c', pupil: '#ffe047', detail: '#c42730' },
  // 8B. Robot B: cobalt & gold retro arcade mech with cyan CRT
  { body: '#3b6ec9', accent: '#ebba34', eye: '#70f4ff', pupil: '#ffffff', detail: '#ff4a63' },
  // 9B. Chicken B: midnight-black shinobi ninja with glowing red eyes
  { body: '#2e2a3d', accent: '#de2437', eye: '#ff3847', pupil: '#ffe880', detail: '#f5c438' },
  // 10B. Rebel B: royal crimson desert cloak & silver scarf
  { body: '#ad293a', accent: '#d8e0eb', eye: '#ffe347', pupil: '#1a1214', detail: '#403645' },
  // 11B. Horror B: volatile electric-cyan plasma anomaly
  { body: '#36c9f2', accent: '#808cff', eye: '#121a38', pupil: '#ffffff', detail: '#4d98ff' },
  // 12B. Rogue B: covert charcoal & crimson armor with amber visor
  { body: '#3c3f52', accent: '#d42938', eye: '#ffc138', pupil: '#fff7cc', detail: '#8c1b26' },
];

/**
 * Draws a rich 36x36 Hi-Bit (logical 18x18) expressive pixel-art mutant frame
 * using PxCanvas volumetric forms + ONE unified outer silhouette outline!
 */
function drawMutantHiBit(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  raceIndex: number,
  isB: boolean,
  variant: 'idle' | 'walk' | 'hurt' | 'dead' | 'sit' | 'gosit',
  frame: number,
): void {
  const pal = (isB ? MUTANT_B_PALETTES : MUTANT_A_PALETTES)[raceIndex - 1]!;
  const buf = new PxCanvas(w, h);
  const cx = 18;
  const cy = 18;

  if (variant === 'dead') {
    const bodyR = makeRamp(pal.body, '#120c17');
    const accR = makeRamp(pal.accent, '#120c17');
    if (frame === 0) {
      // Mid-collapse tumble
      buf.shadedEllipse(cx, cy + 4, 11, 7, bodyR);
      buf.rect(cx - 5, cy + 1, 5, 4, '#cc2233');
      buf.rect(cx + 2, cy + 2, 3, 3, pal.eye);
    } else {
      // Resting fallen body in dark crimson blood stain
      buf.organicBlob(cx, cy + 10, 14, 5, raceIndex * 7, 0.2, makeRamp('#751520', '#2b060b'));
      buf.shadedEllipse(cx - 1, cy + 8, 11, 5.5, bodyR);
      buf.bevelBox(cx + 4, cy + 6, 6, 4, accR, true);
      // X-eyes
      buf.line(cx - 7, cy + 6, cx - 5, cy + 8, '#140e16', 1);
      buf.line(cx - 5, cy + 6, cx - 7, cy + 8, '#140e16', 1);
      buf.line(cx - 2, cy + 6, cx, cy + 8, '#140e16', 1);
      buf.line(cx, cy + 6, cx - 2, cy + 8, '#140e16', 1);
    }
    buf.outline('#110b16', bodyR.out);
    buf.flush(ctx, x, y);
    return;
  }

  const hurt = variant === 'hurt';
  const body = makeRamp(hurt ? '#ffffff' : pal.body, '#120c17');
  const acc = makeRamp(hurt ? '#ff7070' : pal.accent, '#120c17');
  const det = makeRamp(hurt ? '#ffffff' : pal.detail, '#120c17');
  const boot = makeRamp(hurt ? '#ffcccc' : '#302736', '#100a14');
  const eye = hurt ? '#14101a' : pal.eye;
  const pupil = hurt ? '#ffffff' : pal.pupil;

  const bob =
    variant === 'walk'
      ? (frame === 1 || frame === 3 ? -2 : 0)
      : variant === 'idle'
        ? (frame === 2 ? 1 : 0)
        : variant === 'sit'
          ? 2 + ((frame & 1) === 1 ? 1 : 0)
          : variant === 'gosit'
            ? (frame & 1) * 2
            : 0;
  const stride = variant === 'walk' ? (frame === 0 ? -3 : frame === 2 ? 3 : 0) : 0;
  const ty = Math.min(cy + 2, cy + bob);

  // Expressive striding boots / tucked seated feet (drawn first so torso overlaps naturally!)
  if (variant === 'sit') {
    buf.shadedEllipse(cx - 6, cy + 12, 4.2, 2.8, boot);
    buf.shadedEllipse(cx + 6, cy + 12, 4.2, 2.8, boot);
  } else {
    buf.shadedEllipse(cx - 5 + stride, cy + 12 - Math.abs(stride) * 0.35, 3.6, 3.2, boot);
    buf.shadedEllipse(cx + 5 - stride, cy + 12 - Math.abs(stride) * 0.35, 3.6, 3.2, boot);
  }

  switch (raceIndex) {
    case 1: {
      // FISH: Swept spiky dorsal fin crest, muscular amphibian torso, leather belt & golden goggle eyes!
      buf.poly([[cx - 4, ty - 10], [cx - 1, ty - 16], [cx + 3, ty - 14], [cx + 6, ty - 9]], acc);
      buf.line(cx - 1, ty - 15, cx + 2, ty - 13, acc.hi, 1);
      // Plump shaded amphibious torso + head
      buf.shadedEllipse(cx, ty + 3, 9.5, 8.5, body);
      buf.shadedEllipse(cx, ty - 4, 8.5, 6.8, body);
      // Gill slits on cheek
      buf.line(cx - 7, ty - 2, cx - 5, ty - 1, body.dark2, 1);
      buf.line(cx - 7, ty, cx - 5, ty + 1, body.dark2, 1);
      // Tactical wasteland belt & gleaming brass buckle
      buf.bevelBox(cx - 9, ty + 4, 18, 4, det, false);
      buf.bevelBox(cx - 2, ty + 4, 5, 4, makeRamp('#f5cc42', '#382208'), false);
      if (isB && !hurt) {
        // Pirate bandana + fluttering tail + black eyepatch!
        buf.bevelBox(cx - 9, ty - 10, 18, 4, acc, false);
        buf.poly([[cx + 8, ty - 9], [cx + 15, ty - 7 + (frame & 1) * 2], [cx + 13, ty - 4 + (frame & 1) * 2], [cx + 8, ty - 6]], acc);
        buf.bevelBox(cx - 6, ty - 7, 5, 5, makeRamp('#1b1621', '#09060d'), true);
        buf.line(cx - 8, ty - 8, cx + 2, ty - 5, '#140f1a', 1);
        buf.rect(cx + 2, ty - 6, 4, 4, eye);
        buf.rect(cx + 4, ty - 5, 2, 2, pupil);
        buf.set(cx + 2, ty - 6, '#ffffff');
      } else {
        // Expressive twin golden amphibian eyes + specular glint
        buf.rect(cx - 6, ty - 6, 4, 4, eye);
        buf.rect(cx + 2, ty - 6, 4, 4, eye);
        buf.rect(cx - 4, ty - 5, 2, 2, pupil);
        buf.rect(cx + 4, ty - 5, 2, 2, pupil);
        buf.set(cx - 6, ty - 6, '#ffffff');
        buf.set(cx + 2, ty - 6, '#ffffff');
      }
      // Confident wide amphibian smirk
      buf.line(cx - 4, ty, cx + 4, ty, '#12291c', 1);
      buf.set(cx + 4, ty - 1, '#12291c');
      break;
    }

    case 2: {
      // CRYSTAL: Jagged asymmetric faceted prismatic golem with gleaming specular crystal planes!
      buf.poly([[cx - 12, ty + 3], [cx - 10, ty - 7], [cx - 4, ty - 10], [cx - 3, ty + 6]], makeRamp(body.dark, body.out));
      buf.poly([[cx + 12, ty + 3], [cx + 10, ty - 8], [cx + 4, ty - 10], [cx + 3, ty + 6]], makeRamp(body.dark, body.out));
      buf.poly([[cx, ty - 15], [cx + 9, ty - 4], [cx + 7, ty + 11], [cx - 7, ty + 11], [cx - 9, ty - 4]], body);
      // Crisp lit-left / shadowed-right crystal planar bevels
      buf.poly([[cx, ty - 14], [cx - 8, ty - 4], [cx - 5, ty + 9], [cx, ty + 9]], body.light);
      buf.poly([[cx, ty - 14], [cx - 5, ty - 5], [cx, ty - 2]], body.hi);
      buf.poly([[cx, ty - 14], [cx + 8, ty - 4], [cx + 5, ty + 9], [cx, ty + 9]], body.dark);
      buf.line(cx - 3, ty - 10, cx - 6, ty - 3, '#ffffff', 1);
      buf.set(cx, ty - 13, '#ffffff');
      // Glowing crystalline eyes
      buf.rect(cx - 5, ty - 4, 3, 4, eye);
      buf.rect(cx + 2, ty - 4, 3, 4, eye);
      buf.set(cx - 4, ty - 3, '#ffffff');
      buf.set(cx + 3, ty - 3, '#ffffff');
      break;
    }

    case 3: {
      // EYES: Mysterious domed cobalt psychic teeming with 6 glistening staring eyes!
      buf.shadedEllipse(cx, ty + 3, 9.5, 8.5, body);
      buf.shadedEllipse(cx, ty - 4, 8.8, 7.5, body);
      buf.bevelBox(cx - 9, ty + 6, 18, 4, acc, true);
      const eyeSpecs: Array<[number, number, number, number]> = [
        [-6, -6, 5, 5], [2, -6, 5, 5],
        [-3, -1, 4, 4], [3, 1, 4, 3],
        [-7, 1, 3, 3], [0, -10, 3, 3],
      ];
      for (const [ox, oy, ew, eh] of eyeSpecs) {
        buf.rect(cx + ox, ty + oy, ew, eh, eye);
        buf.rect(cx + ox + Math.floor(ew * 0.45), ty + oy + Math.floor(eh * 0.45), Math.max(1, ew - 3), Math.max(1, eh - 3), pupil);
        buf.set(cx + ox, ty + oy, '#ffffff');
      }
      break;
    }

    case 4: {
      // MELTING: Dramatic cracked ivory skull, hollow sockets, clenched teeth & exposed crimson ribcage!
      // Gaunt ribcage torso
      buf.poly([[cx - 7, ty + 1], [cx + 7, ty + 1], [cx + 9, ty + 11], [cx - 9, ty + 11]], makeRamp(body.dark, body.out));
      buf.rect(cx - 3, ty + 2, 6, 8, acc.base);
      buf.rect(cx - 2, ty + 3, 4, 6, acc.hi);
      for (const ry of [2, 5, 8]) {
        buf.rect(cx - 7, ty + ry, 5, 2, body.hi);
        buf.rect(cx + 2, ty + ry, 5, 2, body.base);
      }
      // Sculpted cranium & cheekbone skull
      buf.shadedEllipse(cx, ty - 7, 8.2, 6.8, body);
      buf.bevelBox(cx - 5, ty - 2, 10, 4, body, false);
      // Cranial fracture crack
      buf.crack(cx + 3, ty - 13, 5, 1.8, 3, '#1a121f');
      // Deep hollow eye sockets (volcanic glow in B-skin!)
      buf.ellipse(cx - 3.5, ty - 6, 2.4, 2.6, eye);
      buf.ellipse(cx + 3.5, ty - 6, 2.4, 2.6, eye);
      if (isB && !hurt) {
        buf.rect(cx - 4, ty - 7, 2, 2, pupil);
        buf.rect(cx + 3, ty - 7, 2, 2, pupil);
      }
      buf.rect(cx - 1, ty - 4, 2, 2, '#18111c');
      // Clenched skull teeth
      for (let tx = cx - 4; tx <= cx + 3; tx += 2) {
        buf.set(tx, ty, '#18111c');
      }
      break;
    }

    case 5: {
      // PLANT: Leafy stalk warrior with snapping wide crimson flytrap jaws & gleaming fangs!
      buf.poly([[cx - 6, ty + 2], [cx + 6, ty + 2], [cx + 9, ty + 11], [cx - 9, ty + 11]], body);
      // Splayed collar leaves
      buf.shadedEllipse(cx - 9, ty + 4, 4.5, 2.4, body);
      buf.shadedEllipse(cx + 9, ty + 4, 4.5, 2.4, body);
      // Giant carnivorous flytrap head
      buf.shadedEllipse(cx, ty - 6, 9.5, 7.5, acc);
      // Gaping dark jagged maw with razor white fangs
      buf.poly([[cx - 8, ty - 5], [cx + 8, ty - 5], [cx + 6, ty - 1], [cx - 6, ty - 1]], '#1a070d');
      for (let fx = cx - 6; fx <= cx + 5; fx += 3) {
        buf.rect(fx, ty - 5, 2, 2, '#ffffff');
        buf.set(fx + 1, ty - 2, '#fff0d6');
      }
      // Fierce glowing predator eyes
      buf.rect(cx - 6, ty - 10, 3, 3, eye);
      buf.rect(cx + 3, ty - 10, 3, 3, eye);
      buf.set(cx - 5, ty - 10, '#ffffff');
      buf.set(cx + 4, ty - 10, '#ffffff');
      break;
    }

    case 6: {
      // Y.V.: Razor-sharp sunlit 3D pyramid + expressive cyclops eye + chunky bling gold chain!
      buf.poly([[cx, ty - 15], [cx + 12, ty + 10], [cx - 12, ty + 10]], body);
      buf.poly([[cx, ty - 14], [cx, ty + 9], [cx - 11, ty + 9]], body.light);
      buf.poly([[cx, ty - 14], [cx + 11, ty + 9], [cx, ty + 9]], body.dark);
      buf.line(cx, ty - 14, cx - 10, ty + 8, '#ffffff', 1);
      if (isB && !hurt) {
        // Slick VIP shades
        buf.bevelBox(cx - 7, ty - 5, 14, 5, makeRamp('#1d1421', '#09060d'), true);
        buf.rect(cx - 5, ty - 4, 10, 3, acc.base);
        buf.line(cx - 4, ty - 4, cx - 1, ty - 2, '#ffffff', 1);
      } else {
        // Iconic bold angled cyclops eye
        buf.ellipse(cx, ty - 3, 5.5, 3.2, '#140f1a');
        buf.ellipse(cx, ty - 3, 4.2, 2.0, eye);
        buf.rect(cx - 1, ty - 4, 2, 3, pupil);
        buf.set(cx - 2, ty - 4, '#ffffff');
      }
      // Chunky gleaming gold chain & dollar pendant
      buf.line(cx - 7, ty + 3, cx, ty + 6, acc.hi, 2);
      buf.line(cx + 7, ty + 3, cx, ty + 6, acc.base, 2);
      buf.bevelBox(cx - 3, ty + 5, 6, 5, acc, true);
      buf.set(cx, ty + 7, '#ffffff');
      break;
    }

    case 7: {
      // STEROIDS: Huge muscular traps/shoulders, shredded lab coat, bare chest & gleaming round glasses!
      // Giant muscular arms & broad shoulders
      buf.shadedEllipse(cx - 10, ty + 2, 4.5, 6.5, body);
      buf.shadedEllipse(cx + 10, ty + 2, 4.5, 6.5, body);
      buf.poly([[cx - 10, ty - 5], [cx + 10, ty - 5], [cx + 11, ty + 11], [cx - 11, ty + 11]], body);
      // Open shredded white lab coat (or black commando vest in B-skin!)
      buf.bevelBox(cx - 10, ty - 3, 6, 13, acc, false);
      buf.bevelBox(cx + 4, ty - 3, 6, 13, acc, false);
      // Muscular chest pectoral line
      buf.line(cx - 3, ty + 1, cx + 3, ty + 1, body.dark2, 1);
      buf.line(cx, ty + 1, cx, ty + 7, body.dark, 1);
      // Square heroic scientist head + round gleaming spectacles
      buf.bevelBox(cx - 7, ty - 14, 14, 10, body, true);
      buf.rect(cx - 6, ty - 10, 5, 4, eye);
      buf.rect(cx + 1, ty - 10, 5, 4, eye);
      buf.rect(cx - 1, ty - 9, 2, 1, '#1a141c');
      buf.set(cx - 5, ty - 10, '#ffffff');
      buf.set(cx + 2, ty - 10, '#ffffff');
      buf.rect(cx - 4, ty - 8, 2, 2, pupil);
      buf.rect(cx + 3, ty - 8, 2, 2, pupil);
      break;
    }

    case 8: {
      // ROBOT: Chunky brushed-steel CRT automaton, glowing phosphor visor, chest gauges & antenna!
      // Antenna & glowing beacon tip
      buf.rect(cx - 1, ty - 16, 2, 5, '#2b3440');
      buf.shadedEllipse(cx, ty - 15, 2.2, 2.2, det);
      // Mechanical clamped side arms
      buf.bevelBox(cx - 12, ty + 1, 4, 8, acc, true);
      buf.bevelBox(cx + 8, ty + 1, 4, 8, acc, true);
      // Brushed-steel armored CRT chassis
      buf.bevelBox(cx - 9, ty - 12, 18, 22, body, true);
      // Curved dark glass CRT bezel + glowing phosphor face + animated scanline
      buf.bevelBox(cx - 7, ty - 9, 14, 10, makeRamp('#141c24', '#080c10'), true);
      buf.rect(cx - 6, ty - 8, 12, 8, eye);
      buf.rect(cx - 6, ty - 6 + (frame & 1) * 2, 12, 2, pupil);
      buf.rect(cx - 5, ty - 7, 3, 2, '#ffffff');
      // Chest grille & glowing status LEDs
      buf.bevelBox(cx - 6, ty + 3, 12, 5, acc, false);
      buf.rect(cx - 4, ty + 5, 2, 2, det.hi);
      buf.rect(cx, ty + 5, 2, 2, eye);
      buf.rect(cx + 3, ty + 5, 2, 2, '#ffe047');
      break;
    }

    case 9: {
      // CHICKEN: Feathered martial warrior + scarlet comb (A) or dark ninja hood (B) + fluttering headband!
      if (!isB) {
        // Spiky scarlet rooster comb
        buf.poly([[cx - 4, ty - 11], [cx - 2, ty - 16], [cx + 1, ty - 13], [cx + 4, ty - 16], [cx + 5, ty - 11]], acc);
      }
      buf.shadedEllipse(cx, ty + 3, 9.5, 8.5, body);
      buf.shadedEllipse(cx, ty - 4, 8.5, 7.2, body);
      // Fluttering crimson martial headband & billowing tail
      buf.bevelBox(cx - 9, ty - 9, 18, 4, acc, false);
      buf.poly([[cx - 8, ty - 8], [cx - 15, ty - 6 + (frame & 1) * 2], [cx - 14, ty - 2 + (frame & 1) * 2], [cx - 8, ty - 5]], acc);
      if (isB) {
        buf.rect(cx - 6, ty - 5, 12, 4, '#0d0a14');
      }
      buf.rect(cx - 4, ty - 5, 3, 3, eye);
      buf.rect(cx + 3, ty - 5, 3, 3, eye);
      buf.set(cx - 3, ty - 5, pupil);
      buf.set(cx + 4, ty - 5, pupil);
      if (!isB) {
        // Sharp hooked golden martial beak
        buf.poly([[cx + 1, ty - 2], [cx + 8, ty], [cx + 1, ty + 3]], det);
        buf.set(cx + 3, ty - 1, '#fff5a6');
      }
      // Sash belt
      buf.rect(cx - 8, ty + 5, 16, 3, acc.dark);
      break;
    }

    case 10: {
      // REBEL: Peaked desert nomad cloth hood, deep shadowed cowl, blazing amber eyes & draped scarf!
      buf.poly([[cx - 5, ty - 14], [cx + 5, ty - 14], [cx + 11, ty - 4], [cx + 10, ty + 11], [cx - 10, ty + 11], [cx - 11, ty - 4]], body);
      // Deep shadowed hood interior + glowing piercing amber eyes
      buf.ellipse(cx, ty - 5, 6.5, 4.5, '#120d17');
      buf.rect(cx - 4, ty - 6, 3, 3, eye);
      buf.rect(cx + 2, ty - 6, 3, 3, eye);
      buf.set(cx - 4, ty - 6, '#ffffff');
      buf.set(cx + 2, ty - 6, '#ffffff');
      // Layered desert nomad scarf & asymmetric draped sash
      buf.bevelBox(cx - 9, ty, 18, 5, acc, true);
      buf.poly([[cx + 3, ty + 4], [cx + 9, ty + 4], [cx + 11, ty + 11], [cx + 5, ty + 11]], acc);
      break;
    }

    case 11: {
      // HORROR: Translucent bubbling neon radioactive slime beast with orbiting rad droplets!
      const shift = (frame & 1) * 2;
      buf.organicBlob(cx, ty + 1, 10.5, 10.5, 13 + frame, 0.22, body);
      buf.shadedEllipse(cx - 1, ty - 1, 7.5, 7, makeRamp(body.light, body.out));
      buf.ellipse(cx - 3, ty - 4, 3, 2.2, '#ffffff');
      // Orbiting floating rad globules
      buf.shadedEllipse(cx - 12, ty - 5 + shift, 3, 3, acc);
      buf.shadedEllipse(cx + 12, ty - 2 - shift, 2.8, 2.8, acc);
      // Haunting dark sunken eyes + gaping glowing radioactive grin
      buf.ellipse(cx - 4, ty - 3, 2.4, 2.6, eye);
      buf.ellipse(cx + 4, ty - 3, 2.4, 2.6, eye);
      buf.set(cx - 3, ty - 2, pupil);
      buf.set(cx + 5, ty - 2, pupil);
      buf.bevelBox(cx - 4, ty + 3, 8, 4, makeRamp(eye, '#0a140c'), true);
      buf.rect(cx - 2, ty + 4, 1, 2, acc.hi);
      buf.rect(cx + 1, ty + 4, 1, 2, acc.hi);
      break;
    }

    default: {
      // ROGUE: Ex-IDPD armored shock trooper with sloped helmet, curved cyan visor & white pauldrons!
      // Armored chestplate
      buf.poly([[cx - 9, ty], [cx + 9, ty], [cx + 10, ty + 11], [cx - 10, ty + 11]], makeRamp(body.dark, body.out));
      buf.bevelBox(cx - 5, ty + 2, 10, 7, body, true);
      // Beveled armored white shoulder pauldrons
      buf.bevelBox(cx - 13, ty - 1, 6, 7, acc, true);
      buf.bevelBox(cx + 7, ty - 1, 6, 7, acc, true);
      // Sloped tactical helmet + crest ridge + glowing visor
      buf.poly([[cx - 6, ty - 14], [cx + 6, ty - 14], [cx + 10, ty - 2], [cx - 10, ty - 2]], body);
      buf.rect(cx - 2, ty - 14, 4, 5, acc.hi);
      buf.bevelBox(cx - 7, ty - 9, 14, 5, makeRamp('#0d1526', '#060a12'), true);
      buf.rect(cx - 5, ty - 7, 10, 2, eye);
      buf.rect(cx - 4, ty - 7, 4, 1, '#ffffff');
      break;
    }
  }

  buf.outline('#110b16', body.out);
  buf.flush(ctx, x, y);
}

export function registerAllMutants(b: FallbackAtlasBuilder): void {
  for (let race = 1; race <= 12; race++) {
    const p = `sprMutant${race}`;
    b.addSpriteHiBit(`${p}Idle`, 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'idle', f));
    b.addSpriteHiBit(`${p}Walk`, 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'walk', f));
    b.addSpriteHiBit(`${p}Hurt`, 18, 18, 9, 9, 1, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'hurt', f));
    b.addSpriteHiBit(`${p}Dead`, 18, 18, 9, 9, 2, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'dead', f));
    b.addSpriteHiBit(`${p}Sit`, 18, 18, 9, 9, 2, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'sit', f));
    b.addSpriteHiBit(`${p}GoSit`, 18, 18, 9, 9, 2, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, false, 'gosit', f));

    b.addSpriteHiBit(`${p}BIdle`, 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, true, 'idle', f));
    b.addSpriteHiBit(`${p}BWalk`, 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, true, 'walk', f));
    b.addSpriteHiBit(`${p}BHurt`, 18, 18, 9, 9, 1, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, true, 'hurt', f));
    b.addSpriteHiBit(`${p}BDead`, 18, 18, 9, 9, 2, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, true, 'dead', f));
    b.addSpriteHiBit(`${p}BSit`, 18, 18, 9, 9, 2, (ctx, x, y, w, h, f) => drawMutantHiBit(ctx, x, y, w, h, race, true, 'sit', f));
  }

  // HI-BIT FACETED CRYSTAL SHIELD DOMES (52x52 -> logical 26x26) + STRONG SPIRIT HALO
  const drawCrystalShieldHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, baseHex: string): void => {
    const buf = new PxCanvas(w, h);
    const r = 20 + (f & 1) * 2;
    const cx = 26;
    const cy = 26;
    const cr = makeRamp(baseHex, '#180826');
    buf.poly([
      [cx, cy - r], [cx + r * 0.72, cy - r * 0.45], [cx + r, cy + r * 0.25],
      [cx + r * 0.55, cy + r * 0.9], [cx - r * 0.55, cy + r * 0.9],
      [cx - r, cy + r * 0.25], [cx - r * 0.72, cy - r * 0.45],
    ], cr);
    buf.poly([[cx, cy - r + 2], [cx - r * 0.65, cy - r * 0.35], [cx - r * 0.4, cy + r * 0.4], [cx, cy]], cr.hi);
    buf.line(cx - 10, cy - 11, cx - 2, cy - 17, '#ffffff', 2);
    buf.line(cx - 12, cy - 9, cx - 15, cy + 2, '#ffffff', 1);
    buf.outline('#140821');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprShield', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) => drawCrystalShieldHi(ctx, x, y, w, h, f, '#b959f2'));
  b.addSpriteHiBit('sprShieldB', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) => drawCrystalShieldHi(ctx, x, y, w, h, f, '#f2bd38'));

  b.addSpriteHiBit('sprShieldDisappear', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 26;
    const cy = 26;
    const spread = 6 + f * 4;
    const sz = Math.max(2, 7 - f * 2);
    const cr = makeRamp('#c96eff', '#180826');
    const dirs: ReadonlyArray<[number, number]> = [
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0],
    ];
    for (const [dx, dy] of dirs) {
      const sx = cx + dx * spread;
      const sy = cy + dy * spread;
      buf.poly([[sx, sy - sz], [sx + sz, sy], [sx, sy + sz], [sx - sz, sy]], cr);
      buf.set(sx, sy - 1, '#ffffff');
    }
    buf.outline('#140821');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprStrongSpirit', 20, 20, 10, 10, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 20;
    const hy = 5 + (f === 1 || f === 2 ? -2 : 0);
    // Crisp hollow glowing angelic cyan spirit halo hovering over head
    for (let a = 0; a < 36; a++) {
      const ang = (a / 36) * Math.PI * 2;
      const hx = cx + Math.cos(ang) * 11;
      const py = hy + Math.sin(ang) * 3.2;
      buf.rect(hx - 1, py - 1, 2, 2, '#4fd6ff');
      buf.set(hx, py, '#d4fcff');
    }
    const gx = cx + [-8, -2, 4, 8][f % 4]!;
    buf.rect(gx - 1, hy - 3, 3, 2, '#ffffff');
    buf.flush(ctx, x, y);
  });
}
