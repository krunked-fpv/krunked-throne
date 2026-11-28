import type { EnemyDef } from '@/contracts';
import { ENEMIES } from '@/data/enemies';
import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas, makeRamp } from './pixel-art';

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
  accent: string;
  eye: string;
}

function getEnemyVisual(def: EnemyDef): EnemyVisualSpec {
  switch (def.id) {
    case 'bandit': return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#bd8842', accent: '#cf2f27', eye: '#ff3b3b' };
    case 'jungle_bandit': return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#4a7a42', accent: '#e09d38', eye: '#ffe647' };
    case 'rebel_ally': return { shape: 'bandit', sizeW: 16, sizeH: 16, body: '#699968', accent: '#e0cc9f', eye: '#78ff9e' };
    case 'maggot': return { shape: 'maggot', sizeW: 14, sizeH: 12, body: '#ded49c', accent: '#b8ab72', eye: '#261d17' };
    case 'big_maggot': return { shape: 'maggot', sizeW: 22, sizeH: 18, body: '#d1c68a', accent: '#a89a5e', eye: '#ff4738' };
    case 'maggot_nest': return { shape: 'nest', sizeW: 22, sizeH: 20, body: '#8f6544', accent: '#e8df9e', eye: '#ffe666' };
    case 'scorpion': return { shape: 'scorpion', sizeW: 22, sizeH: 20, body: '#d96230', accent: '#52f04a', eye: '#ffe647' };
    case 'gold_scorpion': return { shape: 'scorpion', sizeW: 24, sizeH: 22, body: '#f2c135', accent: '#ff5238', eye: '#ff2b2b' };
    case 'rat': return { shape: 'rat', sizeW: 18, sizeH: 14, body: '#8f7c6d', accent: '#e0949f', eye: '#ff3b3b' };
    case 'green_rat': return { shape: 'rat', sizeW: 16, sizeH: 12, body: '#59a84c', accent: '#d9ff66', eye: '#ffea47' };
    case 'big_rat': return { shape: 'ratking', sizeW: 26, sizeH: 24, body: '#528746', accent: '#bdff47', eye: '#ff3b3b' };
    case 'gator': return { shape: 'gator', sizeW: 20, sizeH: 20, body: '#458c48', accent: '#d1bf80', eye: '#ffe647' };
    case 'buff_gator': return { shape: 'gator', sizeW: 26, sizeH: 24, body: '#34753e', accent: '#e05538', eye: '#ff4242' };
    case 'ballguy': return { shape: 'ballguy', sizeW: 18, sizeH: 18, body: '#72bd46', accent: '#dcff52', eye: '#18141a' };
    case 'fireballer': return { shape: 'ballguy', sizeW: 20, sizeH: 20, body: '#e65826', accent: '#fff266', eye: '#ffffff' };
    case 'raven': return { shape: 'raven', sizeW: 20, sizeH: 20, body: '#2e3347', accent: '#f5be38', eye: '#ff3b3b' };
    case 'sniper': return { shape: 'sniper', sizeW: 18, sizeH: 20, body: '#63705f', accent: '#26232e', eye: '#ff2138' };
    case 'salamander': return { shape: 'salamander', sizeW: 22, sizeH: 18, body: '#de4c28', accent: '#ffe347', eye: '#fff27d' };
    case 'assassin': return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#4a4254', accent: '#e0e4eb', eye: '#ffffff' };
    case 'jungle_assassin': return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#2f5e35', accent: '#b0ed7d', eye: '#ffe647' };
    case 'spider': return { shape: 'spider', sizeW: 20, sizeH: 18, body: '#d470ff', accent: '#ff94f0', eye: '#ffffff' };
    case 'laser_crystal': return { shape: 'crystal', sizeW: 26, sizeH: 26, body: '#cc52e0', accent: '#ff3878', eye: '#ffffff' };
    case 'lightning_crystal': return { shape: 'crystal', sizeW: 26, sizeH: 26, body: '#4aa8ed', accent: '#fff259', eye: '#ffffff' };
    case 'snowbot': return { shape: 'snowbot', sizeW: 20, sizeH: 22, body: '#8fa9bf', accent: '#e63e35', eye: '#ff3838' };
    case 'wolf': return { shape: 'wolf', sizeW: 22, sizeH: 18, body: '#aebfcf', accent: '#768899', eye: '#ffe847' };
    case 'snow_tank': return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#627c94', accent: '#de3838', eye: '#ff3838' };
    case 'gold_snow_tank': return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#ebbc34', accent: '#ff4238', eye: '#ff2b2b' };
    case 'freak': return { shape: 'freak', sizeW: 16, sizeH: 18, body: '#759e74', accent: '#cf3842', eye: '#e8ff78' };
    case 'rhino_freak': return { shape: 'rhino', sizeW: 26, sizeH: 24, body: '#5f8560', accent: '#f0e7d8', eye: '#ff4242' };
    case 'explo_freak': return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#abc44b', accent: '#ff5238', eye: '#fff266' };
    case 'necromancer': return { shape: 'necro', sizeW: 18, sizeH: 20, body: '#5e467a', accent: '#59ff7a', eye: '#80ff96' };
    case 'turret': return { shape: 'turret', sizeW: 18, sizeH: 18, body: '#b3c4d6', accent: '#f5c742', eye: '#ff3344' };
    case 'guardian': return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#4b8263', accent: '#5eff87', eye: '#b2ffc2' };
    case 'explo_guardian': return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#6ca84c', accent: '#ebff59', eye: '#ffffff' };
    case 'crown_guardian': return { shape: 'guardian', sizeW: 24, sizeH: 26, body: '#52678f', accent: '#f7c942', eye: '#80ffec' };
    case 'guardian_dog': return { shape: 'dog_guardian', sizeW: 28, sizeH: 24, body: '#45755e', accent: '#73ffa3', eye: '#ccffdc' };
    case 'molefish': return { shape: 'molefish', sizeW: 18, sizeH: 18, body: '#3b8f85', accent: '#edc07d', eye: '#ffe647' };
    case 'turtle': return { shape: 'turtle', sizeW: 20, sizeH: 18, body: '#488c42', accent: '#916438', eye: '#ff4242' };
    case 'idpd_grunt': return { shape: 'idpd', sizeW: 18, sizeH: 18, body: '#386dcc', accent: '#ebf4fc', eye: '#7df2ff' };
    case 'idpd_inspector': return { shape: 'idpd', sizeW: 18, sizeH: 20, body: '#4780e6', accent: '#ffdc4d', eye: '#b2f8ff' };
    case 'idpd_shielder': return { shape: 'idpd', sizeW: 22, sizeH: 22, body: '#2c59ad', accent: '#80ecff', eye: '#c4f9ff' };
    case 'idpd_van': return { shape: 'van', sizeW: 36, sizeH: 24, body: '#2c5ebd', accent: '#edf6ff', eye: '#ff3b4a' };
    case 'mimic': return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#cc9526', accent: '#eb2e3d', eye: '#ff3b3b' };
    case 'weapon_mimic': return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#c23035', accent: '#f5c444', eye: '#ffe647' };
    case 'plant_sapling': return { shape: 'sapling', sizeW: 14, sizeH: 14, body: '#47cc4c', accent: '#eb3946', eye: '#ffe647' };
    default: return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#bd8842', accent: '#cf2f27', eye: '#ff3b3b' };
  }
}

/**
 * Draws every regular enemy archetype at crisp 2x Hi-Bit resolution (28x24 to 72x48)
 * with volumetric shading, menacing anatomy, and ONE unified outer outline!
 */
function drawRegularEnemyHiBit(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  spec: EnemyVisualSpec,
  state: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell',
  frame: number,
): void {
  const buf = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const hurt = state === 'hurt';
  const body = makeRamp(hurt ? '#ffffff' : spec.body, '#120b17');
  const acc = makeRamp(hurt ? '#ff7070' : spec.accent, '#120b17');
  const boot = makeRamp(hurt ? '#ffcccc' : '#2a2230', '#0e0914');
  const eye = hurt ? '#140f1a' : spec.eye;

  if (state === 'dead') {
    const ry = Math.max(4, Math.floor(h * 0.14));
    const dy = Math.min(h - ry - 4, cy + Math.floor(h * 0.18));
    buf.organicBlob(cx, dy + 2, Math.floor(w * 0.34), ry + 1, w + h, 0.25, makeRamp('#6e1520', '#26060a'));
    buf.shadedEllipse(cx, dy, Math.floor(w * 0.28), Math.max(3, ry - 1), body);
    buf.rect(cx - 4, dy - 1, 8, 3, body.dark2);
    buf.outline('#120a14');
    buf.flush(ctx, x, y);
    return;
  }

  const bob = state === 'walk' ? (frame % 2 === 0 ? -2 : 0) : state === 'fire' ? -2 : (frame % 2 === 1 ? 1 : 0);
  const ty = cy + bob;
  const stride = state === 'walk' ? (frame % 2 === 0 ? 3 : -3) : 0;

  switch (spec.shape) {
    case 'maggot': {
      // Glossy segmented wriggling desert grub
      const rx = w * 0.22;
      const ry = Math.max(4, h * 0.2);
      for (let seg = -2; seg <= 2; seg++) {
        const sx = cx + seg * (rx * 0.72);
        const sy = ty + Math.sin(seg * 1.1 + frame * 1.5) * 2;
        const rMul = seg === 2 ? 0.92 : 1 - Math.abs(seg) * 0.08;
        buf.shadedEllipse(sx, sy, rx * 0.72 * rMul, ry * rMul, seg % 2 === 0 ? body : makeRamp(body.dark, body.out));
      }
      buf.rect(cx + rx * 1.5, ty - 2, 2, 2, eye);
      break;
    }

    case 'nest': {
      // Grotesque organic cratered hive mound with dark burrows & wriggling maggots (NO MORE BROWN POTATO!)
      buf.organicBlob(cx, ty + 4, 17, 12, 19, 0.22, makeRamp(body.dark, body.out));
      buf.organicBlob(cx - 2, ty - 2, 13, 9, 23, 0.25, body);
      buf.organicBlob(cx + 6, ty + 1, 9, 7, 29, 0.25, body);
      // Dark oozing hive burrows
      const holes: Array<[number, number, number]> = [[-7, -1, 3.8], [5, -3, 3.6], [1, 6, 3.5], [-10, 6, 2.6]];
      for (const [hx, hy, hr] of holes) {
        buf.ellipse(cx + hx, ty + hy, hr, hr * 0.8, '#170d0a');
        if (state === 'tell' || (frame & 1) === 1) {
          buf.shadedEllipse(cx + hx, ty + hy, hr * 0.65, hr * 0.5, acc);
          buf.set(cx + hx - 1, ty + hy - 1, '#ffffff');
        }
      }
      break;
    }

    case 'scorpion': {
      // Ferocious glossy armored scorpion: curved stinger tail + glowing venom sac + pincer claws + 6 jointed legs!
      for (let i = -1; i <= 1; i++) {
        const lx = cx - 4 + i * 7;
        const off = i % 2 === 0 ? stride : -stride;
        buf.shadedCapsule(lx, ty + 6, lx - 3 + off, ty + 15, 1.5, makeRamp(body.dark, body.out));
        buf.shadedCapsule(lx + 4, ty + 6, lx + 7 - off, ty + 15, 1.5, makeRamp(body.dark, body.out));
      }
      // Curved overarching segmented stinger tail
      buf.shadedCapsule(cx - 12, ty + 2, cx - 15, ty - 11, 3.2, body);
      buf.shadedCapsule(cx - 15, ty - 11, cx - 4, ty - 15, 2.8, body);
      buf.shadedCapsule(cx - 4, ty - 15, cx + 4, ty - 13, 2.4, body);
      // Glowing bulbous toxic stinger sac
      buf.shadedEllipse(cx + 6, ty - 12, 4.5, 4.2, makeRamp(state === 'fire' ? '#ffffff' : spec.accent, '#0a290d'));
      buf.poly([[cx + 9, ty - 12], [cx + 14, ty - 9], [cx + 8, ty - 9]], '#ffffff');
      // Segmented chitinous carapace
      buf.shadedEllipse(cx - 2, ty + 3, 12, 7.5, body);
      buf.line(cx - 5, ty - 3, cx - 5, ty + 9, body.dark2, 2);
      buf.line(cx + 1, ty - 3, cx + 1, ty + 9, body.dark2, 2);
      // Twin massive snapping pincers
      buf.shadedCapsule(cx + 7, ty - 1, cx + 15, ty - 5, 3, body);
      buf.shadedCapsule(cx + 7, ty + 5, cx + 15, ty + 9, 3, makeRamp(body.dark, body.out));
      buf.rect(cx + 5, ty + 1, 3, 3, eye);
      buf.set(cx + 5, ty + 1, '#ffffff');
      break;
    }

    case 'rat': {
      // Shaggy hunched sewer rat with curving scaly tail, pointed snout, whiskers & glowing red eye
      const tailY = ty + 4 + (frame & 1) * 2;
      buf.bezier(cx - 14, tailY, cx - 10, ty + 8, cx - 6, ty + 3, acc.base, 2);
      buf.shadedEllipse(cx - 1, ty + 1, 9.5, 6.2, body);
      buf.poly([[cx + 4, ty - 4], [cx + 14, ty], [cx + 5, ty + 5]], body);
      buf.shadedEllipse(cx - 4, ty - 6, 3.5, 3.5, acc);
      buf.ellipse(cx + 13, ty, 1.8, 1.5, acc.hi);
      buf.rect(cx + 6, ty - 2, 2, 2, eye);
      buf.set(cx + 6, ty - 2, '#ffffff');
      buf.shadedEllipse(cx - 5 + stride, ty + 7, 2.5, 1.8, boot);
      buf.shadedEllipse(cx + 5 - stride, ty + 7, 2.5, 1.8, boot);
      break;
    }

    case 'ratking': {
      // Hulking bloated mutant Ratking oozing glowing radioactive bile!
      buf.shadedEllipse(cx - 12, ty - 13, 5.5, 5.5, makeRamp(body.dark, body.out));
      buf.shadedEllipse(cx + 12, ty - 13, 5.5, 5.5, makeRamp(body.dark, body.out));
      buf.organicBlob(cx, ty + 2, 20, 16, 17 + frame, 0.16, body);
      // Pustules & dripping radioactive slime maw
      buf.shadedEllipse(cx - 10, ty - 5, 3.5, 3, acc);
      buf.shadedEllipse(cx + 11, ty - 2, 3, 2.5, acc);
      buf.rect(cx - 8, ty - 6, 5, 5, eye);
      buf.rect(cx + 4, ty - 6, 5, 5, eye);
      buf.set(cx - 7, ty - 5, '#ffffff');
      buf.set(cx + 5, ty - 5, '#ffffff');
      buf.bevelBox(cx - 10, ty + 4, 20, 9, makeRamp(state === 'fire' ? '#eeff80' : spec.accent, '#102e0c'), true);
      buf.rect(cx - 6, ty + 6, 12, 3, '#ffffff');
      buf.shadedCapsule(cx - 3, ty + 12, cx - 3, ty + 17 + (frame & 1) * 2, 2, acc);
      break;
    }

    case 'gator': {
      // Broad scaly bipedal crocodile bruiser with ridged spine, pale ribbed belly & toothy jaws!
      const bw = w * 0.28;
      const bh = h * 0.34;
      buf.shadedEllipse(cx - bw * 0.65 + stride, ty + bh, 4, 3.2, boot);
      buf.shadedEllipse(cx + bw * 0.65 - stride, ty + bh, 4, 3.2, boot);
      // Dorsal crocodile osteoderm spikes
      for (let sy = -8; sy <= 6; sy += 6) {
        buf.poly([[cx - bw - 3, ty + sy], [cx - bw + 2, ty + sy - 2], [cx - bw + 2, ty + sy + 3]], makeRamp(body.dark, body.out));
      }
      buf.poly([[cx - bw, ty - bh], [cx + bw, ty - bh], [cx + bw * 1.15, ty + bh], [cx - bw * 1.15, ty + bh]], body);
      buf.bevelBox(cx - bw * 0.35, ty - 1, bw * 0.9, bh * 0.95, acc, true);
      // Long jutting gator snout + jagged ivory teeth
      buf.bevelBox(cx + 1, ty - bh * 0.6, bw * 1.25, 8, body, true);
      for (let tx = 3; tx <= bw * 1.1; tx += 4) {
        buf.rect(cx + tx, ty - bh * 0.6 + 7, 2, 2, '#ffffff');
      }
      buf.rect(cx - 3, ty - bh * 0.9, 4, 4, eye);
      buf.rect(cx + 3, ty - bh * 0.9, 4, 4, eye);
      buf.set(cx - 2, ty - bh * 0.9, '#ffffff');
      break;
    }

    case 'ballguy': {
      // Translucent pulsing volatile chemical / magma sac creature
      const pulse = (state === 'fire' ? 2 : (frame & 1) * 1.5);
      buf.organicBlob(cx, ty, 11 + pulse, 11 + pulse, 31 + frame, 0.16, body);
      buf.shadedEllipse(cx - 2, ty - 3, 6, 5, makeRamp(body.light, body.out));
      buf.ellipse(cx - 4, ty - 5, 2.5, 2, '#ffffff');
      buf.rect(cx - 6, ty - 3, 4, 4, eye);
      buf.rect(cx + 2, ty - 3, 4, 4, eye);
      buf.bevelBox(cx - 5, ty + 4, 10, 4, acc, true);
      break;
    }

    case 'raven': {
      // Menacing feathered corvid raider with splayed wings, hooked golden beak & glowing red eye
      const flying = state === 'fire';
      const flap = flying ? (frame % 2 === 0 ? -6 : 4) : 0;
      buf.poly([[cx - 14, ty + 6], [cx - 6, ty + 4], [cx - 8, ty + 14]], makeRamp(body.dark, body.out));
      if (flying) {
        buf.poly([[cx - 4, ty - 2], [cx - 18, ty - 12 + flap], [cx - 15, ty + 2 + flap]], body);
        buf.poly([[cx + 4, ty - 2], [cx + 18, ty - 12 - flap], [cx + 15, ty + 2 - flap]], body);
      } else {
        buf.shadedEllipse(cx - 8, ty + 2, 5.5, 8.5, makeRamp(body.dark, body.out));
      }
      buf.shadedEllipse(cx, ty + 2, 8.5, 9.5, body);
      buf.shadedEllipse(cx + 2, ty - 8, 7.2, 6, body);
      // Hooked golden crow beak + piercing crimson eye
      buf.poly([[cx + 7, ty - 10], [cx + 17, ty - 6], [cx + 12, ty - 3], [cx + 7, ty - 5]], acc);
      buf.rect(cx + 3, ty - 10, 3, 3, eye);
      buf.set(cx + 3, ty - 10, '#ffffff');
      buf.shadedCapsule(cx - 4 + stride, ty + 11, cx - 5 + stride, ty + 16, 1.5, acc);
      buf.shadedCapsule(cx + 3 - stride, ty + 11, cx + 4 - stride, ty + 16, 1.5, acc);
      break;
    }

    case 'sniper': {
      // Hooded ghillie wasteland sniper with gas mask & blazing red laser optic
      buf.shadedEllipse(cx - 5 + stride, ty + 14, 3.2, 2.5, boot);
      buf.shadedEllipse(cx + 5 - stride, ty + 14, 3.2, 2.5, boot);
      buf.poly([[cx - 6, ty - 14], [cx + 6, ty - 14], [cx + 12, ty + 12], [cx - 12, ty + 12]], body);
      // Ghillie leaf scraps on hood
      buf.leafTuft(cx - 6, ty - 9, 4, 7, makeRamp(body.light, body.out));
      buf.bevelBox(cx - 7, ty - 9, 14, 8, acc, true);
      buf.ellipse(cx + 1, ty - 5, 4, 3, eye);
      buf.rect(cx, ty - 6, 2, 2, '#ffffff');
      break;
    }

    case 'salamander': {
      // Armored volcanic fiery salamander with magma spots, curling tail & flame breath!
      buf.bezier(cx - 19, ty + 4, cx - 14, ty + 8, cx - 9, ty + 2, body.dark, 4);
      buf.shadedEllipse(cx, ty + 1, 13.5, 7.5, body);
      buf.shadedEllipse(cx - 6, ty, 3.2, 2.5, acc);
      buf.shadedEllipse(cx + 2, ty - 1, 3.2, 2.5, acc);
      buf.rect(cx + 8, ty - 4, 4, 4, eye);
      buf.set(cx + 9, ty - 3, '#ffffff');
      if (state === 'fire') {
        buf.organicBlob(cx + 14, ty, 6, 4.5, 11 + frame, 0.25, makeRamp('#ff781c', '#8c1a0a'));
        buf.ellipse(cx + 14, ty, 3, 2, '#fff5a6');
      }
      break;
    }

    case 'assassin': {
      // Shadow-cloaked stealth assassin clutching a gleaming steel weapon
      buf.shadedEllipse(cx - 4 + stride, ty + 13, 3, 2.4, boot);
      buf.shadedEllipse(cx + 4 - stride, ty + 13, 3, 2.4, boot);
      buf.poly([[cx - 6, ty - 13], [cx + 6, ty - 13], [cx + 11, ty + 11], [cx - 11, ty + 11]], body);
      buf.ellipse(cx, ty - 5, 6.5, 3.5, '#110c16');
      buf.rect(cx - 4, ty - 6, 3, 2, eye);
      buf.rect(cx + 2, ty - 6, 3, 2, eye);
      // Gleaming lead pipe / blade held vertical
      buf.bevelBox(cx + 8, ty - 12, 4, 21, acc, false);
      buf.rect(cx + 9, ty - 11, 1, 16, '#ffffff');
      if (state === 'tell') {
        buf.bevelBox(cx - 2, ty - 17, 4, 6, makeRamp('#ff3847', '#3b080d'), false);
      }
      break;
    }

    case 'spider': {
      // Spiky 8-legged crystal cavern spider with luminous faceted abdomen
      for (let leg = -1; leg <= 1; leg++) {
        const off = leg * 6 + (leg % 2 === 0 ? stride : -stride);
        buf.shadedCapsule(cx - 6, ty + leg * 3, cx - 16, ty + off - 4, 1.8, body);
        buf.shadedCapsule(cx + 6, ty + leg * 3, cx + 16, ty + off - 4, 1.8, body);
      }
      buf.shadedEllipse(cx, ty, 11, 9, body);
      buf.poly([[cx, ty - 8], [cx - 7, ty - 2], [cx, ty + 2]], body.hi);
      buf.rect(cx - 4, ty + 2, 2, 2, eye);
      buf.rect(cx - 1, ty + 2, 2, 2, eye);
      buf.rect(cx + 2, ty + 2, 2, 2, eye);
      break;
    }

    case 'crystal': {
      // Towering floating faceted Laser / Lightning Crystal monolith!
      buf.poly([[cx, ty - 20], [cx + 17, ty], [cx, ty + 20], [cx - 17, ty]], body);
      buf.poly([[cx, ty - 19], [cx - 15, ty], [cx, ty + 18]], body.light);
      buf.poly([[cx, ty - 19], [cx - 8, ty - 4], [cx, ty - 2]], body.hi);
      buf.poly([[cx, ty - 19], [cx + 15, ty], [cx, ty + 18]], body.dark);
      buf.line(cx, ty - 18, cx, ty + 18, '#ffffff', 2);
      buf.poly([[cx, ty - 8], [cx + 8, ty], [cx, ty + 8], [cx - 8, ty]], makeRamp(state === 'fire' ? '#ffffff' : spec.accent, '#140821'));
      buf.ellipse(cx, ty, 3, 3, eye);
      break;
    }

    case 'snowbot': {
      // Menacing frosted industrial combat mech with hydraulic claw arms & crimson cyclops visor!
      buf.bevelBox(cx - 10 + stride, ty + 12, 8, 6, makeRamp('#2b3647', '#0c1017'), true);
      buf.bevelBox(cx + 2 - stride, ty + 12, 8, 6, makeRamp('#2b3647', '#0c1017'), true);
      // Articulated side piston arms + steel claws
      buf.bevelBox(cx - 17, ty - 4 + stride, 7, 12, makeRamp(body.dark, body.out), true);
      buf.bevelBox(cx + 10, ty - 4 - stride, 7, 12, makeRamp(body.dark, body.out), true);
      // Sloped frosted armored torso + shoulder chassis
      buf.poly([[cx - 9, ty - 15], [cx + 9, ty - 15], [cx + 14, ty - 1], [cx + 10, ty + 12], [cx - 10, ty + 12], [cx - 14, ty - 1]], body);
      buf.organicBlob(cx, ty - 14, 9, 3, 5, 0.2, makeRamp('#edf8ff', '#8fb4d4'));
      // Crimson hazard stripes & glowing cyclops optic visor
      buf.rect(cx - 12, ty - 4, 4, 4, acc.base);
      buf.rect(cx + 8, ty - 4, 4, 4, acc.base);
      buf.bevelBox(cx - 8, ty - 9, 16, 7, makeRamp('#14101c', '#07050a'), true);
      buf.rect(cx - 6, ty - 7, 12, 3, state === 'fire' ? '#ffe047' : eye);
      buf.rect(cx - 2, ty - 7, 4, 2, '#ffffff');
      // Radiator grille
      buf.rect(cx - 6, ty + 4, 12, 2, body.dark2);
      buf.rect(cx - 5, ty + 8, 10, 2, body.dark2);
      break;
    }

    case 'wolf': {
      // Lean fierce arctic predatory Snow Wolf (swept tail, pointed ears, jagged fanged snout!)
      buf.shadedCapsule(cx - 18, ty - 4 + (frame & 1) * 2, cx - 9, ty + 2, 2.8, makeRamp(body.dark, body.out));
      buf.shadedCapsule(cx - 11 + stride, ty + 6, cx - 12 + stride, ty + 14, 2.2, boot);
      buf.shadedCapsule(cx - 4 - stride, ty + 6, cx - 4 - stride, ty + 13, 2.0, boot);
      buf.shadedCapsule(cx + 5 - stride, ty + 6, cx + 6 - stride, ty + 14, 2.2, boot);
      buf.shadedCapsule(cx + 11 + stride, ty + 6, cx + 12 + stride, ty + 13, 2.0, boot);
      buf.poly([[cx - 12, ty - 5], [cx + 10, ty - 5], [cx + 12, ty + 7], [cx - 12, ty + 6]], body);
      buf.shadedEllipse(cx + 8, ty - 6, 7.5, 6.2, body);
      buf.bevelBox(cx + 11, ty - 6, 9, 6, body, true);
      buf.poly([[cx + 3, ty - 10], [cx + 6, ty - 17], [cx + 9, ty - 10]], makeRamp(body.dark, body.out));
      buf.poly([[cx + 9, ty - 10], [cx + 12, ty - 17], [cx + 14, ty - 10]], makeRamp(body.dark, body.out));
      buf.rect(cx + 18, ty - 5, 2, 2, '#140f17'); // nose
      buf.rect(cx + 14, ty - 1, 2, 2, '#ffffff'); // fang
      buf.rect(cx + 8, ty - 8, 4, 3, eye);
      buf.set(cx + 8, ty - 8, '#ffffff');
      break;
    }

    case 'tank': {
      // Heavy tracked riveted Snow Tank / Golden Snow Tank!
      const tread = makeRamp('#262c38', '#0a0c12');
      buf.bevelBox(cx - 24, ty - 18, 48, 10, tread, true);
      buf.bevelBox(cx - 24, ty + 8, 48, 10, tread, true);
      for (let tx = -20; tx <= 18; tx += 7) {
        buf.rect(cx + tx + (frame & 1) * 2, ty - 16, 3, 6, '#5c6678');
        buf.rect(cx + tx + (frame & 1) * 2, ty + 10, 3, 6, '#5c6678');
      }
      buf.bevelBox(cx - 18, ty - 12, 36, 24, body, true);
      buf.bevelBox(cx - 10, ty - 8, 20, 16, makeRamp(body.dark, body.out), true);
      buf.bevelBox(cx + 6, ty - 4, 20, 8, body, false);
      buf.bevelBox(cx + 22, ty - 5, 4, 10, makeRamp(body.dark, body.out), false);
      buf.shadedEllipse(cx - 2, ty, 5, 4, acc);
      buf.rect(cx - 3, ty - 2, 3, 2, '#ffffff');
      break;
    }

    case 'freak': {
      // Hunched crazed lab mutant freak with manic glowing eyes & bloody ribs
      buf.shadedEllipse(cx - 5 + stride, ty + 12, 3.2, 2.5, boot);
      buf.shadedEllipse(cx + 5 - stride, ty + 12, 3.2, 2.5, boot);
      buf.organicBlob(cx, ty - 1, 10.5, 11, 13 + frame, 0.16, body);
      buf.rect(cx - 6, ty - 6, 4, 4, eye);
      buf.rect(cx + 2, ty - 6, 4, 4, eye);
      buf.bevelBox(cx - 6, ty + 1, 12, 5, acc, true);
      buf.rect(cx - 4, ty + 2, 2, 2, '#ffffff');
      buf.rect(cx + 2, ty + 2, 2, 2, '#ffffff');
      break;
    }

    case 'rhino': {
      // Hulking Rhino Freak with massive hunched shoulders & curved sweeping ivory gore-horn!
      buf.bevelBox(cx - 13 + stride, ty + 13, 8, 7, boot, true);
      buf.bevelBox(cx + 5 - stride, ty + 13, 8, 7, boot, true);
      buf.poly([[cx - 14, ty - 15], [cx + 14, ty - 15], [cx + 19, ty + 14], [cx - 19, ty + 14]], body);
      buf.poly([[cx + 12, ty - 4], [cx + 23, ty - 18], [cx + 18, ty - 1], [cx + 11, ty + 2]], acc);
      buf.rect(cx + 2, ty - 8, 6, 4, eye);
      buf.set(cx + 3, ty - 8, '#ffffff');
      break;
    }

    case 'necro': {
      // Gothic hooded Necromancer clutching a gnarled glowing emerald revival staff!
      buf.poly([[cx - 5, ty - 16], [cx + 5, ty - 16], [cx + 13, ty + 14], [cx - 13, ty + 14]], body);
      buf.rect(cx - 10, ty + 11, 20, 3, acc.base);
      buf.ellipse(cx, ty - 6, 6.5, 5, '#120a1c');
      buf.rect(cx - 4, ty - 8, 3, 4, eye);
      buf.rect(cx + 2, ty - 8, 3, 4, eye);
      buf.set(cx - 4, ty - 8, '#ffffff');
      // Revival staff + pulsing emerald soul-crystal
      buf.shadedCapsule(cx + 10, ty - 10, cx + 10, ty + 14, 1.8, makeRamp('#5e4675', '#140b1f'));
      buf.poly([[cx + 10, ty - 17], [cx + 14, ty - 12], [cx + 10, ty - 7], [cx + 6, ty - 12]], acc);
      buf.rect(cx + 9, ty - 13, 2, 2, '#ffffff');
      break;
    }

    case 'turret': {
      // Heavy titanium tripod Labs Turret with hazard collar & blazing crimson targeting optic
      buf.poly([[cx - 10, ty + 2], [cx + 10, ty + 2], [cx + 14, ty + 14], [cx - 14, ty + 14]], makeRamp(body.dark, body.out));
      buf.rect(cx - 10, ty + 6, 20, 4, '#161820');
      for (let hx = -8; hx <= 6; hx += 6) buf.rect(cx + hx, ty + 6, 3, 4, acc.base);
      buf.bevelBox(cx - 10, ty - 10, 20, 14, body, true);
      buf.bevelBox(cx + 6, ty - 6, 12, 7, body, false);
      buf.shadedEllipse(cx - 2, ty - 3, 4.5, 3.8, makeRamp(state === 'fire' ? '#ffffff' : eye, '#2b060d'));
      buf.set(cx - 3, ty - 4, '#ffffff');
      break;
    }

    case 'guardian': {
      // Floating gilded royal Palace / Crown Guardian with levitating crown & luminous rune core!
      buf.poly([[cx - 9, ty - 18], [cx + 9, ty - 18], [cx + 15, ty + 12], [cx - 15, ty + 12]], body);
      buf.bevelBox(cx - 9, ty - 21, 18, 5, makeRamp('#f5c742', '#382408'), true);
      buf.poly([[cx - 3, ty - 21], [cx, ty - 25], [cx + 3, ty - 21]], '#fff5a6');
      // Ethereal hovering bottom energy wisps
      const wShift = (frame & 1) * 3;
      buf.shadedCapsule(cx - 9, ty + 12, cx - 10, ty + 19 + wShift, 2.5, makeRamp(body.dark, body.out));
      buf.shadedCapsule(cx, ty + 12, cx, ty + 22 - wShift, 3, acc);
      buf.shadedCapsule(cx + 9, ty + 12, cx + 10, ty + 19 + wShift, 2.5, makeRamp(body.dark, body.out));
      buf.rect(cx - 6, ty - 11, 4, 5, eye);
      buf.rect(cx + 2, ty - 11, 4, 5, eye);
      buf.poly([[cx, ty - 3], [cx + 6, ty + 3], [cx, ty + 9], [cx - 6, ty + 3]], makeRamp(state === 'fire' ? '#ffffff' : spec.accent, '#0a2914'));
      buf.rect(cx - 1, ty + 2, 2, 2, '#ffffff');
      break;
    }

    case 'dog_guardian': {
      // Massive Palace Guardian Dog beast with emerald rune crest & fanged gaping jaws
      buf.bevelBox(cx - 15 + stride, ty + 13, 8, 7, makeRamp(body.dark, body.out), true);
      buf.bevelBox(cx + 7 - stride, ty + 13, 8, 7, makeRamp(body.dark, body.out), true);
      buf.organicBlob(cx, ty, 21, 15, 29, 0.14, body);
      buf.poly([[cx, ty - 14], [cx + 5, ty - 9], [cx, ty - 4], [cx - 5, ty - 9]], acc);
      buf.rect(cx - 10, ty - 7, 6, 5, eye);
      buf.rect(cx + 4, ty - 7, 6, 5, eye);
      buf.bevelBox(cx - 11, ty + 2, 22, 8, makeRamp('#0e1c14', '#060d09'), true);
      for (let fx = -8; fx <= 6; fx += 5) buf.rect(cx + fx, ty + 2, 3, 4, '#ffffff');
      break;
    }

    case 'van': {
      // Massive armored IDPD dimensional APC Van (`72x48` Hi-Bit!)
      buf.bevelBox(cx - 31, ty - 18, 62, 36, body, true);
      buf.rect(cx - 29, ty - 3, 58, 6, acc.base);
      buf.rect(cx - 29, ty - 2, 58, 2, '#ffffff');
      // Panoramic armored windshield with bright reflection
      buf.bevelBox(cx + 10, ty - 12, 16, 24, makeRamp('#78e8ff', '#0e2847'), true);
      buf.line(cx + 13, ty - 9, cx + 22, ty + 2, '#ffffff', 2);
      // Flashing red/blue tactical siren lightbar
      buf.bevelBox(cx - 6, ty - 14, 10, 10, makeRamp(frame % 2 === 0 ? '#ff3847' : '#38a6ff', '#100c18'), true);
      buf.bevelBox(cx - 6, ty + 4, 10, 10, makeRamp(frame % 2 === 0 ? '#38a6ff' : '#ff3847', '#100c18'), true);
      if (state === 'fire') {
        buf.rect(cx - 34, ty - 12, 8, 24, '#0c1121');
      }
      break;
    }

    case 'mimic': {
      // Deceptive armored chest bursting open with razor white fangs & wicked eyes!
      buf.bevelBox(cx - 14, ty - 12, 28, 24, body, true);
      if (state === 'fire' || state === 'tell' || (frame & 1) === 1) {
        buf.rect(cx - 12, ty - 4, 24, 10, '#180a12');
        for (let fx = -10; fx <= 8; fx += 5) {
          buf.poly([[cx + fx, ty - 4], [cx + fx + 4, ty - 4], [cx + fx + 2, ty + 1]], '#ffffff');
        }
        buf.shadedEllipse(cx, ty + 4, 6, 3, acc);
        buf.rect(cx - 7, ty - 9, 4, 3, eye);
        buf.rect(cx + 3, ty - 9, 4, 3, eye);
      } else {
        buf.rect(cx - 12, ty, 24, 4, '#ffe066');
        buf.bevelBox(cx - 4, ty - 2, 8, 7, makeRamp('#fff5a6', '#4a3208'), true);
      }
      break;
    }

    case 'turtle': {
      buf.shadedEllipse(cx - 2, ty + 2, 13, 10, acc);
      buf.bevelBox(cx + 8, ty - 6, 10, 10, body, true);
      buf.rect(cx + 10, ty - 4, 6, 3, eye);
      break;
    }

    case 'molefish': {
      buf.shadedEllipse(cx, ty, 10, 12, body);
      buf.rect(cx - 6, ty - 6, 4, 4, eye);
      buf.rect(cx + 2, ty - 6, 4, 4, eye);
      buf.bevelBox(cx - 5, ty + 2, 10, 6, acc, true);
      break;
    }

    case 'sapling': {
      buf.shadedEllipse(cx, ty + 2, 8, 8, body);
      buf.shadedEllipse(cx, ty - 7, 7, 5, acc);
      buf.rect(cx - 3, ty - 2, 2, 2, eye);
      buf.rect(cx + 1, ty - 2, 2, 2, eye);
      break;
    }

    case 'idpd': {
      // Tactical cobalt IDPD Squad: sloped helmet, white/gold pauldrons, curved cyan visor!
      const hw = Math.floor(w * 0.28);
      const hh = Math.floor(h * 0.34);
      buf.shadedEllipse(cx - 5 + stride, ty + hh, 3.5, 2.8, boot);
      buf.shadedEllipse(cx + 5 - stride, ty + hh, 3.5, 2.8, boot);
      buf.poly([[cx - hw + 3, ty - hh], [cx + hw - 3, ty - hh], [cx + hw, ty + hh], [cx - hw, ty + hh]], body);
      buf.bevelBox(cx - hw - 3, ty - 1, 6, 7, acc, true);
      buf.bevelBox(cx + hw - 3, ty - 1, 6, 7, acc, true);
      buf.bevelBox(cx - 6, ty - hh + 5, 12, 5, makeRamp('#0d1526', '#060a14'), true);
      buf.rect(cx - 5, ty - hh + 7, 10, 2, eye);
      buf.rect(cx - 3, ty - hh + 7, 4, 1, '#ffffff');
      if (state === 'fire' && w >= 40) {
        buf.ellipse(cx, ty, hw + 5, hh + 4, 'rgba(90, 225, 255, 0.35)');
      }
      break;
    }

    default: {
      // Masked Desert / Jungle Bandit / Rebel Ally: peaked cowl, outlaw mask, glowing goggles, fluttering scarf!
      buf.shadedEllipse(cx - 5 + stride, ty + 11, 3.2, 2.8, boot);
      buf.shadedEllipse(cx + 5 - stride, ty + 11, 3.2, 2.8, boot);
      buf.poly([[cx - 6, ty - 13], [cx + 6, ty - 13], [cx + 11, ty + 10], [cx - 11, ty + 10]], body);
      buf.bevelBox(cx - 8, ty - 8, 16, 7, makeRamp('#211715', '#0d090a'), true);
      buf.rect(cx - 6, ty - 6, 4, 4, eye);
      buf.rect(cx + 2, ty - 6, 4, 4, eye);
      buf.set(cx - 5, ty - 6, '#ffffff');
      buf.set(cx + 3, ty - 6, '#ffffff');
      buf.bevelBox(cx - 9, ty, 18, 4, acc, false);
      buf.poly([[cx - 8, ty + 1], [cx - 14, ty + 3 + (frame & 1) * 2], [cx - 13, ty + 7 + (frame & 1) * 2], [cx - 8, ty + 4]], acc);
      buf.rect(cx - 2, ty + 4, 4, 3, '#f5c742');
      break;
    }
  }

  buf.outline('#110b16', body.out);
  buf.flush(ctx, x, y);
}

// ============================================================================
// ALL 5 SHOWSTOPPER 2x HI-BIT TOWERING BOSSES
// ============================================================================

function drawBigBanditHi(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell'): void {
  const buf = new PxCanvas(w, h);
  const cx = 36;
  const cy = 36;
  const hurt = mode === 'hurt';
  const coat = makeRamp(hurt ? '#ffffff' : '#b87634', '#170c08');
  const leather = makeRamp(hurt ? '#ffdddd' : '#573420', '#120908');
  const scarf = makeRamp(hurt ? '#ff6666' : '#d6242c', '#2b060a');
  const hat = makeRamp(hurt ? '#ffcccc' : '#6b3e1b', '#170c08');
  const steel = makeRamp(hurt ? '#ffffff' : '#6e7c8f', '#10141c');
  const gold = makeRamp('#f5cc47', '#3b2408');

  if (mode === 'dead') {
    buf.organicBlob(cx, cy + 18, 28, 10, 11, 0.22, makeRamp('#6e141c', '#240509'));
    buf.shadedEllipse(cx, cy + 14, 24, 10, coat);
    buf.rect(cx - 12, cy + 10, 22, 5, scarf.base);
    buf.outline('#140a0e');
    buf.flush(ctx, x, y);
    return;
  }

  const bob = mode === 'walk' ? (f % 2 === 0 ? -2 : 2) : (f & 1) * 2;
  const stride = mode === 'walk' ? (f % 2 === 0 ? 4 : -4) : 0;
  const ty = cy + bob;

  // Heavy iron-toed dusty outlaw warlord boots
  buf.bevelBox(cx - 17 + stride, cy + 20, 13, 10, leather, true);
  buf.rect(cx - 16 + stride, cy + 26, 11, 3, steel.dark);
  buf.bevelBox(cx + 4 - stride, cy + 20, 13, 10, leather, true);
  buf.rect(cx + 5 - stride, cy + 26, 11, 3, steel.dark);

  // Flowing tattered desert outlaw poncho/duster coat with dramatic cloth folds & jagged hem!
  buf.poly(
    [
      [cx - 21, ty - 11], [cx + 21, ty - 11],
      [cx + 27, ty + 18], [cx + 21, ty + 24], [cx + 12, ty + 20],
      [cx + 4, ty + 25], [cx - 4, ty + 21], [cx - 13, ty + 25],
      [cx - 22, ty + 21], [cx - 27, ty + 17],
    ],
    coat,
  );
  // Cloth fold shadow valleys & warm sunlit poncho pleats
  buf.line(cx - 10, ty - 4, cx - 15, ty + 21, coat.dark2, 2);
  buf.line(cx - 8, ty - 4, cx - 13, ty + 20, coat.hi, 1);
  buf.line(cx + 10, ty - 4, cx + 15, ty + 20, coat.dark2, 2);
  buf.line(cx, ty - 2, cx, ty + 22, leather.dark2, 3); // Open duster front split

  // Armored iron wasteland shoulder pauldrons with bolts
  buf.shadedEllipse(cx - 20, ty - 6, 8, 6, steel, -0.4, -0.5);
  buf.shadedEllipse(cx + 20, ty - 6, 8, 6, steel, -0.4, -0.5);
  buf.rect(cx - 22, ty - 7, 2, 2, steel.spec);
  buf.rect(cx + 19, ty - 7, 2, 2, steel.spec);

  // Heavy leather gunbelt + gleaming brass skull buckle + crossing bullet bandolier!
  buf.bevelBox(cx - 20, ty + 11, 40, 6, leather, false);
  buf.bevelBox(cx - 6, ty + 10, 12, 8, gold, true);
  buf.rect(cx - 3, ty + 12, 2, 2, '#241406');
  buf.rect(cx + 1, ty + 12, 2, 2, '#241406');
  buf.line(cx - 16, ty - 6, cx + 17, ty + 12, leather.dark2, 6);
  for (let i = 0; i < 5; i++) {
    const bx = cx - 13 + i * 7;
    const by = ty - 4 + i * 4;
    buf.rect(bx, by, 4, 6, gold.light);
    buf.rect(bx, by, 2, 3, gold.spec);
    buf.rect(bx, by + 4, 4, 2, '#a85a14');
  }

  // Dramatic wind-swept crimson bandit scarf + ragged fluttering cape tail
  buf.poly([[cx - 20, ty - 11], [cx - 34, ty - 5 + (f & 1) * 3], [cx - 31, ty + 7 + (f & 1) * 3], [cx - 17, ty - 2]], scarf);
  buf.poly([[cx - 21, ty - 13], [cx + 21, ty - 13], [cx + 19, ty - 4], [cx, ty - 1], [cx - 19, ty - 4]], scarf);
  buf.line(cx - 16, ty - 10, cx + 16, ty - 10, scarf.hi, 2);
  buf.line(cx - 14, ty - 5, cx + 14, ty - 5, scarf.dark2, 1);

  // Shadowed masked outlaw head + menacing glowing angular bandit visor goggles!
  buf.shadedEllipse(cx, ty - 19, 14, 10, makeRamp('#221818', '#0a0709'), -0.3, -0.4);
  const eyeCol = mode === 'tell' ? '#ffe047' : '#ff2e36';
  const eyeHi = mode === 'tell' ? '#ffffff' : '#ffa6aa';
  buf.poly([[cx - 11, ty - 22], [cx - 2, ty - 20], [cx - 3, ty - 15], [cx - 10, ty - 16]], eyeCol);
  buf.poly([[cx + 11, ty - 22], [cx + 2, ty - 20], [cx + 3, ty - 15], [cx + 10, ty - 16]], eyeCol);
  buf.rect(cx - 9, ty - 21, 3, 2, eyeHi);
  buf.rect(cx + 6, ty - 21, 3, 2, eyeHi);

  // Iconic battered wide-brimmed wasteland outlaw ranger hat with curled rim & crimson hatband!
  buf.poly([[cx - 30, ty - 22], [cx - 18, ty - 27], [cx + 18, ty - 27], [cx + 30, ty - 22], [cx + 25, ty - 19], [cx - 25, ty - 19]], hat);
  buf.poly([[cx - 16, ty - 25], [cx - 12, ty - 34], [cx, ty - 32], [cx + 12, ty - 34], [cx + 16, ty - 25]], hat);
  buf.rect(cx - 15, ty - 27, 30, 3, scarf.base); // Crimson hatband
  buf.line(cx - 26, ty - 22, cx + 26, ty - 22, hat.hi, 2);

  // Heavy industrial wasteland assault rifle slung ready at hip (blazing flash when firing!)
  buf.bevelBox(cx + 6, ty + 1, 24, 8, steel, true);
  buf.rect(cx + 10, ty + 3, 18, 2, steel.spec);
  buf.bevelBox(cx + 12, ty + 8, 6, 5, leather, false);
  if (mode === 'fire') {
    buf.poly([[cx + 29, ty - 5], [cx + 35, ty + 5], [cx + 29, ty + 15]], '#ff8826');
    buf.poly([[cx + 29, ty - 1], [cx + 34, ty + 5], [cx + 29, ty + 11]], '#fff599');
  }
  buf.outline('#140b0e');
  buf.flush(ctx, x, y);
}

function drawBigDogHi(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'charge' | 'sleep'): void {
  const buf = new PxCanvas(w, h);
  const cx = 56;
  const cy = 56;
  const hurt = mode === 'hurt';
  const sleep = mode === 'sleep';
  const hull = makeRamp(hurt ? '#ffffff' : sleep ? '#6e5243' : '#8a6853', '#140c0a');
  const rust = makeRamp(hurt ? '#ffcccc' : '#a34c29', '#260e08');
  const steel = makeRamp(hurt ? '#ffdddd' : '#586473', '#10141c');
  const gold = makeRamp('#ebb93b', '#382408');

  if (mode === 'dead') {
    buf.shadedEllipse(cx, cy + 16, 44, 21, makeRamp('#3b2e29', '#100a0a'));
    buf.ellipse(cx, cy + 12, 32, 14, '#211917');
    buf.bevelBox(cx - 20, cy + 4, 40, 12, makeRamp('#5c463b', '#140c0a'), true);
    buf.ellipse(cx, cy + 10, 9, 6, '#701c1c');
    buf.outline('#100a0c');
    buf.flush(ctx, x, y);
    return;
  }

  const bob = sleep ? 4 : mode === 'walk' ? (f % 2 === 0 ? -2 : 2) : (f & 1) * 2;
  const legOff = sleep ? 0 : mode === 'walk' ? (f % 2 === 0 ? 4 : -4) : 0;
  const ty = cy + bob;

  // 4 Articulated rusted hydraulic iron spider-tank legs with pistons & clawed feet!
  const legs: Array<{ side: -1 | 1; oy: number; shift: number }> = [
    { side: -1, oy: -18, shift: legOff },
    { side: 1, oy: -18, shift: -legOff },
    { side: -1, oy: 12, shift: -legOff },
    { side: 1, oy: 12, shift: legOff },
  ];
  for (const leg of legs) {
    const s = leg.side;
    const hipX = cx + s * 25;
    const hipY = ty + leg.oy + 4;
    const kneeX = cx + s * (sleep ? 34 : 40);
    const kneeY = ty + leg.oy + leg.shift;
    const footX = cx + s * (sleep ? 38 : 46);
    const footY = kneeY + (sleep ? 10 : 16);
    buf.shadedCapsule(hipX, hipY, kneeX, kneeY, 5.2, steel);
    buf.line(hipX, hipY - 2, kneeX, kneeY - 2, rust.base, 2);
    buf.shadedCapsule(kneeX, kneeY, footX, footY, 4.8, makeRamp('#424a57', '#0e1117'));
    buf.shadedEllipse(kneeX, kneeY, 6.2, 6.2, steel);
    buf.bevelBox(footX - 6, footY - 4, 13, 8, makeRamp('#2b313b', '#0a0d12'), true);
  }

  // Colossal riveted weathered iron dome hull with rust streaks & welded seams!
  buf.shadedEllipse(cx, ty, 37, 31, hull);
  if (!hurt) {
    buf.ditherRect(cx - 28, ty - 14, 12, 8, hull.light, rust.base, 0.6);
    buf.ditherRect(cx + 15, ty + 8, 14, 8, hull.dark, rust.base, 0.6);
    buf.ditherRect(cx - 18, ty + 14, 10, 6, hull.dark, rust.dark, 0.5);
  }
  buf.rect(cx - 32, ty, 64, 3, '#170f0e');
  buf.rect(cx - 1, ty - 28, 3, 56, '#170f0e');
  for (const [rx, ry] of [[-20, -18], [18, -18], [-24, 8], [22, 8], [-10, -22], [10, -22]] as const) {
    buf.rect(cx + rx, ty + ry, 3, 3, '#2b1e1a');
    buf.set(cx + rx, ty + ry, '#f5dec6');
  }

  // Twin side gatling turrets & missile pods with hazard trim
  buf.bevelBox(cx - 48, ty - 10, 20, 22, steel, true);
  buf.rect(cx - 46, ty - 6, 16, 4, gold.base);
  buf.bevelBox(cx + 28, ty - 10, 20, 22, steel, true);
  buf.rect(cx + 30, ty - 6, 16, 4, gold.base);
  if (mode === 'fire') {
    buf.poly([[cx - 55, ty], [cx - 47, ty - 8], [cx - 47, ty + 8]], '#ffe047');
    buf.poly([[cx + 55, ty], [cx + 47, ty - 8], [cx + 47, ty + 8]], '#ffe047');
  }

  // Giant central cyclops laser optic (armored shuttered eye when sleeping!)
  buf.shadedEllipse(cx, ty + 2, 16, 14, makeRamp('#221821', '#0a070d'));
  if (sleep) {
    buf.ellipse(cx, ty + 2, 12, 10, '#3d242b');
    buf.rect(cx - 11, ty, 22, 4, '#1b141c');
    buf.rect(cx - 6, ty + 4, 12, 2, '#7d2024');
  } else {
    const lens = makeRamp(mode === 'charge' ? '#ffe047' : '#ff3024', '#38080a');
    buf.shadedEllipse(cx, ty + 2, 12, 10, lens);
    buf.ellipse(cx - 3, ty - 2, 4.5, 3, '#ffffff');
  }

  buf.outline('#110a0e');
  buf.flush(ctx, x, y);
}

function drawLilHunterHi(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'lift' | 'land'): void {
  const buf = new PxCanvas(w, h);
  const cx = 28;
  const cy = 32;
  const hurt = mode === 'hurt';
  const armor = makeRamp(hurt ? '#ffffff' : '#3d70d4', '#0e1b3d');
  const trim = makeRamp(hurt ? '#ffffff' : '#edf4fc', '#1c2942');
  const jet = makeRamp('#57667a', '#101621');

  if (mode === 'dead') {
    buf.shadedEllipse(cx, cy + 14, 20, 8, armor);
    buf.organicBlob(cx + 8, cy + 8, 6, 4, 7, 0.25, makeRamp('#ff6b26', '#4d1409'));
    buf.outline('#0c1224');
    buf.flush(ctx, x, y);
    return;
  }

  const bob = mode === 'lift' ? -4 : (f & 1) * 2;
  const ty = cy + bob;
  const stride = mode === 'walk' ? (f % 2 === 0 ? 3 : -3) : 0;

  // Twin dorsal brushed-steel jetpack cylinders + roaring plasma exhaust plumes!
  buf.bevelBox(cx - 20, ty - 12, 10, 22, jet, true);
  buf.bevelBox(cx + 10, ty - 12, 10, 22, jet, true);
  const fH = mode === 'lift' || mode === 'land' ? 14 + (f & 1) * 4 : 8 + (f & 1) * 4;
  buf.poly([[cx - 19, ty + 10], [cx - 11, ty + 10], [cx - 15, ty + 10 + fH]], '#ff681c');
  buf.poly([[cx - 17, ty + 10], [cx - 13, ty + 10], [cx - 15, ty + 10 + fH * 0.65]], '#fff599');
  buf.poly([[cx + 11, ty + 10], [cx + 19, ty + 10], [cx + 15, ty + 10 + fH]], '#ff681c');
  buf.poly([[cx + 13, ty + 10], [cx + 17, ty + 10], [cx + 15, ty + 10 + fH * 0.65]], '#fff599');

  // Boots, armored captain torso, sloped helmet & blazing cyan visor!
  buf.bevelBox(cx - 10 + stride, ty + 15, 8, 10, makeRamp(armor.dark, armor.out), true);
  buf.bevelBox(cx + 2 - stride, ty + 15, 8, 10, makeRamp(armor.dark, armor.out), true);
  buf.poly([[cx - 12, ty - 6], [cx + 12, ty - 6], [cx + 14, ty + 16], [cx - 14, ty + 16]], armor);
  buf.bevelBox(cx - 11, ty - 4, 22, 5, trim, true);
  buf.poly([[cx - 8, ty - 24], [cx + 8, ty - 24], [cx + 12, ty - 6], [cx - 12, ty - 6]], armor);
  buf.bevelBox(cx - 8, ty - 18, 16, 8, makeRamp('#0d1526', '#060a14'), true);
  buf.rect(cx - 6, ty - 16, 12, 4, '#6ef2ff');
  buf.rect(cx - 4, ty - 16, 6, 2, '#ffffff');
  buf.outline('#0c1224');
  buf.flush(ctx, x, y);
}

/**
 * SHOWSTOPPER FINAL BOSS: THE KRUNKED THRONE (192x176 Hi-Bit -> logical 96x88)
 */
function drawKrunkedThroneHi(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'off' | 'on' | 'activate' | 'beam' | 'death'): void {
  const buf = new PxCanvas(w, h);
  const cx = 96;
  const cy = 88;
  const off = mode === 'off';
  const pulse = (f & 1) === 0 ? 1 : 0;

  if (mode === 'death') {
    buf.organicBlob(cx, cy + 30, 74, 30, 13, 0.18, makeRamp('#228034', '#08240e'));
    buf.organicBlob(cx, cy + 30, 50, 18, 19, 0.2, makeRamp('#52f06a', '#145922'));
    buf.bevelBox(cx - 66, cy - 20, 132, 70, makeRamp('#2a3040', '#0a0c14'), true);
    buf.rect(cx - 50, cy - 8, 100, 42, '#141721');
    buf.bevelBox(cx - 28, cy, 56, 24, makeRamp('#3b455c', '#0a0c14'), true);
    buf.ellipse(cx, cy + 12, 14, 7, '#6eff82');
    buf.outline('#090b12');
    buf.flush(ctx, x, y);
    return;
  }

  const obs = makeRamp(off ? '#252c40' : '#2e3852', '#080a14');
  const obsHi = makeRamp(off ? '#3a445e' : '#4a5a82', '#080a14');
  const gold = makeRamp(off ? '#9e7f34' : '#e3b849', '#2b1c07');
  const rad = makeRamp(off ? '#1c4a2d' : mode === 'beam' ? '#d4ffdb' : pulse ? '#59ff73' : '#35db54', '#082610');
  const radCore = off ? '#306e44' : '#ffffff';

  // Flanking power conduits + stepped obsidian temple dais
  buf.bevelBox(cx - 93, cy + 36, 16, 14, obs, true);
  buf.bevelBox(cx + 77, cy + 36, 16, 14, obs, true);
  buf.rect(cx - 91, cy + 40, 12, 6, rad.base);
  buf.rect(cx + 79, cy + 40, 12, 6, rad.base);

  buf.bevelBox(cx - 88, cy + 40, 176, 34, makeRamp('#181d2b', '#070910'), true);
  buf.bevelBox(cx - 80, cy + 28, 160, 24, obs, true);
  buf.rect(cx - 72, cy + 52, 144, 4, gold.base);
  buf.rect(cx - 68, cy + 52, 50, 2, gold.hi);

  // Twin giant pressurized nuclear coolant tanks with brass clamps & rising bubbles!
  for (const side of [-1, 1]) {
    const tx = side < 0 ? cx - 86 : cx + 60;
    buf.bevelBox(tx, cy - 28, 26, 68, makeRamp('#384359', '#0a0d17'), true);
    buf.rect(tx + 6, cy - 20, 14, 52, rad.dark2);
    buf.rect(tx + 8, cy - 20, 10, 52, rad.base);
    buf.rect(tx + 9, cy - 20, 3, 48, radCore);
    for (const bandY of [-10, 10, 28]) {
      buf.bevelBox(tx + 2, cy + bandY, 22, 6, gold, false);
    }
    if (!off) {
      buf.ellipse(tx + 13, cy - 10 + pulse * 6 * side, 2.5, 2.5, '#ffffff');
    }
  }

  // Towering gothic carved obsidian monolith backrest with carved ribs & cracks!
  buf.poly([[cx - 50, cy - 76], [cx + 50, cy - 76], [cx + 58, cy + 32], [cx - 58, cy + 32]], obs);
  buf.poly([[cx - 46, cy - 72], [cx - 2, cy - 72], [cx - 4, cy + 28], [cx - 52, cy + 28]], obs.light);
  buf.rect(cx - 48, cy - 52, 96, 2, obs.out);
  buf.rect(cx - 52, cy - 20, 104, 2, obs.out);
  buf.crack(cx - 38, cy - 62, 14, 0.9, 5, obs.out, obs.hi);
  buf.crack(cx + 34, cy - 58, 12, 2.2, 9, obs.out, obs.hi);
  // Vertical glowing emerald reactor veins embedded inside obsidian stone
  buf.rect(cx - 38, cy - 48, 4, 36, rad.dark2);
  buf.rect(cx - 37, cy - 44, 2, 28, rad.base);
  buf.rect(cx + 34, cy - 48, 4, 36, rad.dark2);
  buf.rect(cx + 35, cy - 44, 2, 28, rad.base);

  // Towering gilded gothic crown spires at apex
  buf.poly([[cx - 44, cy - 74], [cx - 38, cy - 86], [cx - 28, cy - 74]], obsHi);
  buf.poly([[cx + 28, cy - 74], [cx + 38, cy - 86], [cx + 44, cy - 74]], obsHi);
  buf.poly([[cx - 16, cy - 72], [cx, cy - 87], [cx + 16, cy - 72]], gold);
  buf.poly([[cx, cy - 79], [cx + 6, cy - 73], [cx, cy - 67], [cx - 6, cy - 73]], rad);
  if (!off) buf.rect(cx - 1, cy - 75, 2, 2, '#ffffff');

  // Heavy sculpted obsidian armrests with gilded edge armor
  buf.bevelBox(cx - 68, cy - 8, 28, 48, obsHi, true);
  buf.bevelBox(cx + 40, cy - 8, 28, 48, obsHi, true);
  buf.bevelBox(cx - 64, cy, 20, 32, makeRamp('#181d2b', '#070910'), true);
  buf.bevelBox(cx + 44, cy, 20, 32, makeRamp('#181d2b', '#070910'), true);
  buf.bevelBox(cx - 64, cy - 6, 20, 5, gold, false);
  buf.bevelBox(cx + 44, cy - 6, 20, 5, gold, false);

  // Central multi-ring blazing emerald Nuclear Reactor Eye Chamber!
  buf.bevelBox(cx - 32, cy - 48, 64, 68, makeRamp('#121622', '#070910'), true);
  buf.rect(cx - 28, cy - 36, 56, 6, rad.base);
  buf.rect(cx - 28, cy - 12, 56, 6, rad.base);
  const eyeR = 22 + (mode === 'beam' ? 4 : 0);
  buf.shadedEllipse(cx, cy - 20, eyeR, eyeR, makeRamp(rad.dark2, '#061a0a'));
  buf.shadedEllipse(cx, cy - 20, 16, 16, rad);
  buf.ellipse(cx, cy - 20, 8 + (off ? 0 : pulse * 2), 8 + (off ? 0 : pulse * 2), radCore);
  if (!off) buf.ellipse(cx - 4, cy - 24, 3, 3, '#ffffff');

  // Lower royal seat & forward mega-beam cannon emitter
  buf.bevelBox(cx - 28, cy + 12, 56, 24, obsHi, true);
  buf.bevelBox(cx - 16, cy + 24, 32, 32, makeRamp('#1c2233', '#080a12'), true);
  buf.rect(cx - 10, cy + 28, 20, 24, mode === 'beam' ? '#ffffff' : rad.base);
  buf.rect(cx - 6, cy + 30, 12, 20, radCore);
  if (mode === 'beam') {
    buf.rect(cx - 20, cy + 48, 40, 28, '#59ff80');
    buf.rect(cx - 12, cy + 48, 24, 28, '#d9ffe3');
    buf.rect(cx - 6, cy + 48, 12, 28, '#ffffff');
  } else if (mode === 'activate') {
    buf.rect(cx - 44, cy - 60, 88, 4, '#b8ffc9');
  }
  buf.outline('#070910');
  buf.flush(ctx, x, y);
}

function drawThroneIIHi(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'idle' | 'hurt' | 'death' | 'appear'): void {
  const buf = new PxCanvas(w, h);
  const cx = 84;
  const cy = 84;
  const hurt = mode === 'hurt';
  const hull = makeRamp(hurt ? '#ffffff' : '#2d3d4a', '#090e14');
  const rad = makeRamp(hurt ? '#d9ffe0' : (f % 2 === 0 ? '#52ff6e' : '#a8ffb8'), '#0a2e12');

  if (mode === 'death') {
    buf.organicBlob(cx, cy + 12, 58, 26, 7, 0.2, makeRamp('#1b6629', '#08240e'));
    buf.organicBlob(cx, cy + 12, 34, 15, 11, 0.2, rad);
    buf.shadedEllipse(cx, cy + 8, 30, 16, hull);
    buf.outline('#080c12');
    buf.flush(ctx, x, y);
    return;
  }

  const wingSpread = (f & 1) === 0 ? 0 : 6;
  // Sweeping jagged obsidian & emerald plasma wings
  for (const side of [-1, 1]) {
    const s = side;
    buf.poly([
      [cx + s * 16, cy - 26], [cx + s * (72 + wingSpread), cy - 48],
      [cx + s * (64 + wingSpread), cy - 16], [cx + s * 18, cy - 6],
    ], hull);
    buf.line(cx + s * 22, cy - 20, cx + s * (66 + wingSpread), cy - 36, rad.base, 5);
    buf.line(cx + s * 24, cy - 20, cx + s * (64 + wingSpread), cy - 36, '#ffffff', 2);
    buf.poly([
      [cx + s * 16, cy - 6], [cx + s * (62 + wingSpread), cy - 12],
      [cx + s * (52 + wingSpread), cy + 12], [cx + s * 16, cy + 8],
    ], makeRamp(hull.dark, hull.out));
    buf.line(cx + s * 20, cy + 2, cx + s * (52 + wingSpread), cy + 4, rad.base, 4);
  }

  // Crowned dorsal reactor spires + central biomechanical hull
  buf.poly([[cx - 22, cy - 36], [cx - 16, cy - 64], [cx - 8, cy - 36]], hull);
  buf.poly([[cx + 8, cy - 36], [cx + 16, cy - 64], [cx + 22, cy - 36]], hull);
  buf.poly([[cx - 10, cy - 38], [cx, cy - 72], [cx + 10, cy - 38]], rad);
  buf.rect(cx - 2, cy - 64, 4, 22, '#ffffff');
  buf.shadedEllipse(cx, cy, 34, 42, hull);

  // Blazing multi-ring nuclear cyclops core + satellite eyes
  buf.shadedEllipse(cx, cy - 4, 24, 24, makeRamp('#124a1e', '#061c0b'));
  buf.shadedEllipse(cx, cy - 4, 18, 18, rad);
  buf.ellipse(cx, cy - 4, 10, 10, '#ffffff');
  for (const [ex, ey] of [[-22, -20], [16, -20], [-16, 24], [10, 24]] as const) {
    buf.bevelBox(cx + ex, cy + ey, 9, 7, rad, true);
    buf.rect(cx + ex + 2, cy + ey + 2, 3, 2, '#ffffff');
  }
  // Trailing crackling rad plasma tendrils
  buf.shadedCapsule(cx - 12, cy + 38, cx - 14, cy + 64 + (f & 1) * 6, 4, rad);
  buf.shadedCapsule(cx, cy + 40, cx, cy + 70 - (f & 1) * 4, 3.5, makeRamp('#ffffff', rad.base));
  buf.shadedCapsule(cx + 12, cy + 38, cx + 14, cy + 64 + (f & 1) * 6, 4, rad);

  buf.outline('#080c14');
  buf.flush(ctx, x, y);
}

export function registerAllEnemiesAndBosses(b: FallbackAtlasBuilder): void {
  // 1. ALL 5 BESPOKE TOWERING HI-BIT BOSSES
  b.addSpriteHiBit('sprBanditBossIdle', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'idle'));
  b.addSpriteHiBit('sprBanditBossWalk', 36, 36, 18, 18, 4, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'walk'));
  b.addSpriteHiBit('sprBanditBossHurt', 36, 36, 18, 18, 1, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'hurt'));
  b.addSpriteHiBit('sprBanditBossDead', 36, 36, 18, 18, 1, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'dead'));
  b.addSpriteHiBit('sprBanditBossFire', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'fire'));
  b.addSpriteHiBit('sprBanditBossTell', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBanditHi(ctx, x, y, w, h, f, 'tell'));
  b.addAlias('sprBanditBossDash', 'sprBanditBossWalk');
  b.addSpriteHiBit('sprBanditBossGun', 28, 12, 6, 6, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.bevelBox(4, 4, 48, 14, makeRamp('#5e6978', '#10141c'), true);
    buf.rect(24, 8, 26, 2, '#141921');
    buf.rect(24, 12, 26, 2, '#141921');
    buf.rect(36, 4, 4, 14, '#f5c742');
    buf.bevelBox(8, 14, 10, 8, makeRamp('#854e28', '#21120a'), true);
    buf.outline('#100c14');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprScrapBossIdle', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'idle'));
  b.addSpriteHiBit('sprScrapBossSleep', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'sleep'));
  b.addSpriteHiBit('sprScrapBossWalk', 56, 56, 28, 28, 4, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'walk'));
  b.addSpriteHiBit('sprScrapBossHurt', 56, 56, 28, 28, 1, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'hurt'));
  b.addSpriteHiBit('sprScrapBossDead', 56, 56, 28, 28, 1, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'dead'));
  b.addSpriteHiBit('sprScrapBossFire', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'fire'));
  b.addSpriteHiBit('sprScrapBossCharge', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDogHi(ctx, x, y, w, h, f, 'charge'));
  b.addSpriteHiBit('sprScrapBossMissileIdle', 14, 8, 7, 4, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.poly([[1, 8], [7, 4], [7, 12]], f === 0 ? '#ffe047' : '#ff681c');
    buf.bevelBox(6, 3, 18, 10, makeRamp('#cf4234', '#2b0b09'), true);
    buf.poly([[23, 3], [27, 8], [23, 13]], '#ffffff');
    buf.outline('#140a0c');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprLilHunter', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprLilHunterIdle', 'sprLilHunter');
  b.addSpriteHiBit('sprLilHunterWalk', 28, 32, 14, 16, 4, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'walk'));
  b.addSpriteHiBit('sprLilHunterHurt', 28, 32, 14, 16, 1, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'hurt'));
  b.addSpriteHiBit('sprLilHunterDead', 28, 32, 14, 16, 1, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'dead'));
  b.addSpriteHiBit('sprLilHunterLift', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'lift'));
  b.addSpriteHiBit('sprLilHunterLand', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunterHi(ctx, x, y, w, h, f, 'land'));
  b.addAlias('sprLilHunterFire', 'sprLilHunterLift');
  b.addAlias('sprLilHunterDash', 'sprLilHunterLift');
  b.addSpriteHiBit('sprLilHunterGun', 22, 10, 5, 5, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.bevelBox(4, 4, 36, 10, makeRamp('#3b73d6', '#0e1d40'), true);
    buf.rect(8, 6, 28, 3, '#80e5ff');
    buf.bevelBox(6, 12, 8, 6, makeRamp('#1e3c78', '#0a142b'), false);
    buf.outline('#0c1426');
    buf.flush(ctx, x, y);
  });

  // The Krunked Throne (logical 96x88 -> atlas 192x176) + sprNothingBeam (logical 36x24 -> atlas 72x48!)
  b.addSpriteHiBit('sprNothingOff', 96, 88, 48, 44, 1, (ctx, x, y, w, h, f) => drawKrunkedThroneHi(ctx, x, y, w, h, f, 'off'));
  b.addSpriteHiBit('sprNothingOn', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThroneHi(ctx, x, y, w, h, f, 'on'));
  b.addAlias('sprNothingIdle', 'sprNothingOn');
  b.addAlias('sprNothingWalk', 'sprNothingOn');
  b.addAlias('sprNothingHurt', 'sprNothingOn');
  b.addSpriteHiBit('sprNothingActivate', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThroneHi(ctx, x, y, w, h, f, 'activate'));
  b.addSpriteHiBit('sprNothingFire', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThroneHi(ctx, x, y, w, h, f, 'beam'));
  b.addSpriteHiBit('sprNothingBeam', 36, 24, 18, 12, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const shift = f === 1 ? 2 : f === 2 ? -2 : 0;
    buf.rect(4, 0, w - 8, h, '#0e5222');
    buf.rect(8, 0, w - 16, h, '#28d458');
    buf.rect(16 + shift, 0, w - 32, h, '#7aff9c');
    buf.rect(24, 0, w - 48, h, '#e8ffed');
    buf.rect(28 - shift, 0, 16, h, '#ffffff');
    const segY = (f * 14) % h;
    buf.rect(6, segY, 4, Math.min(14, h - segY), '#80ff9e');
    buf.rect(w - 10, (segY + 22) % h, 4, Math.min(14, h - ((segY + 22) % h)), '#80ff9e');
    buf.rect(20, (segY + 10) % h, 2, Math.min(16, h - ((segY + 10) % h)), '#ffffff');
    buf.rect(w - 22, (segY + 30) % h, 2, Math.min(16, h - ((segY + 30) % h)), '#ffffff');
    buf.flush(ctx, x, y);
  });
  b.addSpriteHiBit('sprNothingDeath', 96, 88, 48, 44, 1, (ctx, x, y, w, h, f) => drawKrunkedThroneHi(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprNothingDead', 'sprNothingDeath');
  b.addAlias('sprNothingDash', 'sprNothingOn');

  b.addSpriteHiBit('sprNothing2Idle', 84, 84, 42, 42, 2, (ctx, x, y, w, h, f) => drawThroneIIHi(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprNothing2Walk', 'sprNothing2Idle');
  b.addSpriteHiBit('sprNothing2Hurt', 84, 84, 42, 42, 1, (ctx, x, y, w, h, f) => drawThroneIIHi(ctx, x, y, w, h, f, 'hurt'));
  b.addSpriteHiBit('sprNothing2Death', 84, 84, 42, 42, 1, (ctx, x, y, w, h, f) => drawThroneIIHi(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprNothing2Dead', 'sprNothing2Death');
  b.addSpriteHiBit('sprNothing2Appear', 84, 84, 42, 42, 2, (ctx, x, y, w, h, f) => drawThroneIIHi(ctx, x, y, w, h, f, 'appear'));
  b.addAlias('sprNothing2Fire', 'sprNothing2Appear');
  b.addAlias('sprNothing2Dash', 'sprNothing2Idle');

  // 2. ALL 45 REGULAR ENEMIES AT 2x HI-BIT
  for (const def of Object.values(ENEMIES)) {
    if (def.isBoss) continue;
    const vis = getEnemyVisual(def);
    const ox = Math.floor(vis.sizeW / 2);
    const oy = Math.floor(vis.sizeH / 2);

    b.addSpriteHiBit(def.sprites.idle, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
      drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'idle', f),
    );
    if (def.sprites.walk !== def.sprites.idle) {
      b.addSpriteHiBit(def.sprites.walk, vis.sizeW, vis.sizeH, ox, oy, 4, (ctx, x, y, w, h, f) =>
        drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'walk', f),
      );
    }
    b.addSpriteHiBit(def.sprites.hurt, vis.sizeW, vis.sizeH, ox, oy, 1, (ctx, x, y, w, h, f) =>
      drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'hurt', f),
    );
    b.addSpriteHiBit(def.sprites.dead, vis.sizeW, vis.sizeH, ox, oy, 1, (ctx, x, y, w, h, f) =>
      drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'dead', f),
    );
    if (def.sprites.fire) {
      b.addSpriteHiBit(def.sprites.fire, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'fire', f),
      );
    }
    if (def.sprites.tell) {
      b.addSpriteHiBit(def.sprites.tell, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemyHiBit(ctx, x, y, w, h, vis, 'tell', f),
      );
    }
    if (def.sprites.gun && !b.hasSprite(def.sprites.gun)) {
      if (def.id === 'raven') {
        b.addSpriteHiBit(def.sprites.gun, 13, 6, 4, 3, 1, (ctx, x, y, w, h) => {
          const buf = new PxCanvas(w, h);
          buf.bevelBox(2, 3, 8, 7, makeRamp('#6e4528', '#1a0e08'), true);
          buf.bevelBox(8, 3, 16, 5, makeRamp('#4f5968', '#0e1117'), false);
          buf.outline('#100c14');
          buf.flush(ctx, x, y);
        });
      } else if (def.id === 'sniper') {
        b.addSpriteHiBit(def.sprites.gun, 17, 7, 5, 4, 1, (ctx, x, y, w, h) => {
          const buf = new PxCanvas(w, h);
          buf.bevelBox(2, 5, 10, 7, makeRamp('#4a5746', '#101410'), true);
          buf.bevelBox(10, 5, 22, 5, makeRamp('#3c4542', '#0e1212'), false);
          buf.bevelBox(14, 1, 10, 4, makeRamp('#22272e', '#0a0c10'), false);
          buf.rect(20, 2, 3, 2, '#ff3344');
          buf.outline('#100c14');
          buf.flush(ctx, x, y);
        });
      } else if (def.isIdpd) {
        b.addSpriteHiBit(def.sprites.gun, 15, 7, 4, 4, 1, (ctx, x, y, w, h) => {
          const buf = new PxCanvas(w, h);
          buf.bevelBox(4, 3, 22, 7, makeRamp('#366cc7', '#0c1938'), true);
          buf.rect(6, 5, 18, 2, '#7de6ff');
          buf.bevelBox(6, 9, 7, 4, makeRamp('#1e3361', '#0a1224'), false);
          buf.outline('#0c1224');
          buf.flush(ctx, x, y);
        });
      } else {
        b.addSpriteHiBit(def.sprites.gun, 14, 7, 4, 4, 1, (ctx, x, y, w, h) => {
          const buf = new PxCanvas(w, h);
          buf.bevelBox(2, 4, 8, 8, makeRamp('#7d4d2a', '#1f1108'), true);
          buf.bevelBox(8, 3, 18, 7, makeRamp('#636f7d', '#10141c'), true);
          buf.outline('#100c14');
          buf.flush(ctx, x, y);
        });
      }
    }
  }

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
