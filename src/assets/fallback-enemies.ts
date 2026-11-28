import type { EnemyDef } from '@/contracts';
import { ENEMIES } from '@/data/enemies';
import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas } from './pixel-art';

const INK = '#0d0a10';

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
  bodyHi: string;
  bodyDark: string;
  accent: string;
  eye: string;
}

function getEnemyVisual(def: EnemyDef): EnemyVisualSpec {
  switch (def.id) {
    // Desert: hooded tan Bandits (#a8987e hood, dark face wrap #584238), creamy Maggots, golden Scorpions
    case 'bandit':
      return { shape: 'bandit', sizeW: 20, sizeH: 20, body: '#a4947a', bodyHi: '#cfc0a6', bodyDark: '#74644e', accent: '#5a4036', eye: '#ff4228' };
    case 'jungle_bandit':
      return { shape: 'bandit', sizeW: 20, sizeH: 20, body: '#4c7e3a', bodyHi: '#74ad58', bodyDark: '#2c5220', accent: '#6c5234', eye: '#ffe648' };
    case 'rebel_ally':
      return { shape: 'bandit', sizeW: 18, sizeH: 18, body: '#5a7898', bodyHi: '#88a8c8', bodyDark: '#364c66', accent: '#d8b882', eye: '#80ff98' };
    case 'maggot':
      return { shape: 'maggot', sizeW: 14, sizeH: 12, body: '#dfd49c', bodyHi: '#f8f2cc', bodyDark: '#a89c66', accent: '#c4b87e', eye: '#261c16' };
    case 'big_maggot':
      return { shape: 'maggot', sizeW: 22, sizeH: 18, body: '#d8cc8e', bodyHi: '#f6ecc0', bodyDark: '#9a8e56', accent: '#b8aa6c', eye: '#ff4834' };
    case 'maggot_nest':
      return { shape: 'nest', sizeW: 22, sizeH: 20, body: '#8e6a4a', bodyHi: '#b8926e', bodyDark: '#5a3e28', accent: '#ece4a4', eye: '#ffe868' };
    case 'scorpion':
      return { shape: 'scorpion', sizeW: 22, sizeH: 20, body: '#d88838', bodyHi: '#f6b864', bodyDark: '#94521c', accent: '#58f048', eye: '#ffe848' };
    case 'gold_scorpion':
      return { shape: 'scorpion', sizeW: 24, sizeH: 22, body: '#f2c434', bodyHi: '#fff088', bodyDark: '#a87c14', accent: '#ff4830', eye: '#ff2828' };

    // Sewers
    case 'rat':
      return { shape: 'rat', sizeW: 18, sizeH: 14, body: '#948274', bodyHi: '#beb0a2', bodyDark: '#5e5046', accent: '#e0949c', eye: '#ff3c3c' };
    case 'green_rat':
      return { shape: 'rat', sizeW: 16, sizeH: 12, body: '#58b048', bodyHi: '#8ee078', bodyDark: '#327228', accent: '#dcff68', eye: '#ffea48' };
    case 'big_rat':
      return { shape: 'ratking', sizeW: 26, sizeH: 24, body: '#5a8e4c', bodyHi: '#88c074', bodyDark: '#34582a', accent: '#b8ff48', eye: '#ff3c3c' };
    case 'gator':
      return { shape: 'gator', sizeW: 20, sizeH: 20, body: '#4c9448', bodyHi: '#7cc874', bodyDark: '#2c6028', accent: '#d8c688', eye: '#ffe848' };
    case 'buff_gator':
      return { shape: 'gator', sizeW: 26, sizeH: 24, body: '#3a7c40', bodyHi: '#64b068', bodyDark: '#204e24', accent: '#e05838', eye: '#ff4242' };
    case 'ballguy':
      return { shape: 'ballguy', sizeW: 18, sizeH: 18, body: '#74c444', bodyHi: '#b0f074', bodyDark: '#427e22', accent: '#e0ff58', eye: INK };
    case 'fireballer':
      return { shape: 'ballguy', sizeW: 20, sizeH: 20, body: '#e85824', bodyHi: '#ffa048', bodyDark: '#9a2810', accent: '#fff468', eye: '#ffffff' };

    // Scrapyard: dark hooded Snipers, jet-black Ravens, olive/fiery Salamanders
    case 'raven':
      return { shape: 'raven', sizeW: 22, sizeH: 20, body: '#282832', bodyHi: '#4c4e5e', bodyDark: '#14141a', accent: '#d4cec0', eye: '#ff3c38' };
    case 'sniper':
      return { shape: 'sniper', sizeW: 20, sizeH: 20, body: '#82868e', bodyHi: '#aeb2ba', bodyDark: '#52565e', accent: '#805a3e', eye: '#ff2834' };
    case 'salamander':
      return { shape: 'salamander', sizeW: 22, sizeH: 18, body: '#7c8a44', bodyHi: '#a8b868', bodyDark: '#4c5626', accent: '#e85824', eye: '#ffe848' };
    case 'assassin':
      return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#4a4658', bodyHi: '#747088', bodyDark: '#282434', accent: '#e0e6ee', eye: '#ffffff' };
    case 'jungle_assassin':
      return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#2e6434', bodyHi: '#58985c', bodyDark: '#1a3e1e', accent: '#b8f078', eye: '#ffe848' };

    // Crystal Caves: brown/orange Spiders (#9a5a2c), tall glowing cyan/orange Laser Crystals
    case 'spider':
      return { shape: 'spider', sizeW: 20, sizeH: 18, body: '#9a5a2c', bodyHi: '#cc824a', bodyDark: '#5e3214', accent: '#e88a38', eye: '#ff8828' };
    case 'laser_crystal':
      return { shape: 'crystal', sizeW: 24, sizeH: 26, body: '#48c8e8', bodyHi: '#a4f4ff', bodyDark: '#20789c', accent: '#ff8c28', eye: '#ffffff' };
    case 'lightning_crystal':
      return { shape: 'crystal', sizeW: 24, sizeH: 26, body: '#48a0f0', bodyHi: '#9cd8ff', bodyDark: '#2058a0', accent: '#fff048', eye: '#ffffff' };

    // Frozen City: brown-furred Snowbots with steel chestplates, gray-brown Wolves, silver-steel Snow Tanks!
    case 'snowbot':
      return { shape: 'snowbot', sizeW: 22, sizeH: 22, body: '#8c623a', bodyHi: '#ba8856', bodyDark: '#583a1e', accent: '#949ea8', eye: '#ff2e28' };
    case 'wolf':
      return { shape: 'wolf', sizeW: 22, sizeH: 18, body: '#9a948c', bodyHi: '#c8c2ba', bodyDark: '#686058', accent: '#7c5c40', eye: '#ff3838' };
    case 'snow_tank':
      return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#a4aeb8', bodyHi: '#d4dce4', bodyDark: '#68727c', accent: '#9a5a32', eye: '#ff3c28' };
    case 'gold_snow_tank':
      return { shape: 'tank', sizeW: 28, sizeH: 24, body: '#f0c034', bodyHi: '#fff088', bodyDark: '#a67c14', accent: '#c86024', eye: '#ff2828' };

    // Labs: hunched olive/yellow Freaks, glowing purple Necromancers, Explo-Freaks
    case 'freak':
      return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#94a068', bodyHi: '#c2ce94', bodyDark: '#5e683e', accent: '#cc3840', eye: '#f4ff88' };
    case 'rhino_freak':
      return { shape: 'rhino', sizeW: 26, sizeH: 24, body: '#6c8260', bodyHi: '#98b28a', bodyDark: '#405238', accent: '#f0e8d8', eye: '#ff3c3c' };
    case 'explo_freak':
      return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#b8d048', bodyHi: '#e4f884', bodyDark: '#748a24', accent: '#ff5828', eye: '#fff470' };
    case 'necromancer':
      return { shape: 'necro', sizeW: 18, sizeH: 20, body: '#70449c', bodyHi: '#a470d4', bodyDark: '#422264', accent: '#58ff68', eye: '#98ff88' };
    case 'turret':
      return { shape: 'turret', sizeW: 18, sizeH: 18, body: '#a8b8c8', bodyHi: '#d8e4f0', bodyDark: '#647484', accent: '#f5c838', eye: '#ff3444' };

    // Palace: vibrant neon-green Palace Guardians, cobalt-blue IDPD!
    case 'guardian':
      return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#58f048', bodyHi: '#c0ff90', bodyDark: '#249820', accent: '#98ff60', eye: '#ffffff' };
    case 'explo_guardian':
      return { shape: 'guardian', sizeW: 22, sizeH: 26, body: '#b8ff38', bodyHi: '#f4ff98', bodyDark: '#64a818', accent: '#ffff88', eye: '#ffffff' };
    case 'crown_guardian':
      return { shape: 'guardian', sizeW: 24, sizeH: 26, body: '#48b898', bodyHi: '#8cf0d4', bodyDark: '#246e5a', accent: '#f8cc40', eye: '#ffffff' };
    case 'guardian_dog':
      return { shape: 'dog_guardian', sizeW: 28, sizeH: 24, body: '#3ca844', bodyHi: '#80ee78', bodyDark: '#1e6426', accent: '#a8ff78', eye: '#ffffff' };

    // Oasis & Secret Biomes: vibrant purple-blue Oasis Fish (#6854a8) & green-shelled Barrel Crab/Turtle!
    case 'molefish':
      return { shape: 'molefish', sizeW: 22, sizeH: 18, body: '#6854a8', bodyHi: '#9884dc', bodyDark: '#3e2e74', accent: '#c8c4dc', eye: '#ff4838' };
    case 'turtle':
      return { shape: 'turtle', sizeW: 22, sizeH: 20, body: '#489840', bodyHi: '#7cd06c', bodyDark: '#286024', accent: '#7c4c3c', eye: '#ffe848' };

    // IDPD: cobalt-blue armor (#3b70c4)
    case 'idpd_grunt':
      return { shape: 'idpd', sizeW: 18, sizeH: 18, body: '#3b70c4', bodyHi: '#6ca0f0', bodyDark: '#204484', accent: '#f5d038', eye: '#78f0ff' };
    case 'idpd_inspector':
      return { shape: 'idpd', sizeW: 18, sizeH: 20, body: '#4882e0', bodyHi: '#84b8ff', bodyDark: '#244e98', accent: '#ffe048', eye: '#b4f8ff' };
    case 'idpd_shielder':
      return { shape: 'idpd', sizeW: 22, sizeH: 22, body: '#3060b4', bodyHi: '#6294e8', bodyDark: '#1a3874', accent: '#80ecff', eye: '#d4faff' };
    case 'idpd_van':
      return { shape: 'van', sizeW: 36, sizeH: 24, body: '#3064c4', bodyHi: '#6498f0', bodyDark: '#1c3c80', accent: '#edf6ff', eye: '#ff3c4c' };

    case 'mimic':
      return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#cc9628', bodyHi: '#f8cc58', bodyDark: '#825812', accent: '#ec303c', eye: '#ff3c3c' };
    case 'weapon_mimic':
      return { shape: 'mimic', sizeW: 18, sizeH: 16, body: '#c43238', bodyHi: '#f0646c', bodyDark: '#7c1820', accent: '#f8cc48', eye: '#ffe848' };
    case 'plant_sapling':
      return { shape: 'sapling', sizeW: 16, sizeH: 16, body: '#48c83c', bodyHi: '#84f46e', bodyDark: '#287e22', accent: '#dc2c3a', eye: '#ffe848' };
    default:
      return { shape: 'bandit', sizeW: 20, sizeH: 20, body: '#a4947a', bodyHi: '#cfc0a6', bodyDark: '#74644e', accent: '#5a4036', eye: '#ff4228' };
  }
}

/**
 * Draws every regular enemy at crisp native 1x resolution with bold 1px `#0d0a10` outline,
 * exact reference-video silhouettes & color families, and dark muted resting corpses!
 */
function drawRegularEnemy1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  spec: EnemyVisualSpec,
  state: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell',
  frame: number,
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // 6-frame Dead animation: frames 0..2 collapse -> frames 3..5 DARK MUTED resting corpse (NEVER white!)
  if (state === 'dead') {
    const rw = Math.max(5, Math.floor(w * 0.34));
    const rh = Math.max(2, Math.floor(h * 0.16));
    const dy = Math.min(h - rh - 2, cy + Math.floor(h * 0.18));
    if (frame <= 1) {
      p.ellipse(cx, dy - 1, rw, rh + 1, frame === 0 ? '#a89698' : spec.bodyDark);
      p.rect(cx - 2, dy - 1, 4, 2, '#5a1a20');
    } else {
      // Dark muted desaturated resting silhouette matching the reference video corpses!
      p.ellipse(cx, dy + 1, rw + 1, rh, '#241e24');
      p.ellipse(cx - 1, dy, Math.max(3, rw - 1), Math.max(2, rh - 1), '#383038');
      p.rect(cx - Math.floor(rw * 0.5), dy, Math.max(3, Math.floor(rw * 0.8)), Math.max(1, rh - 1), '#4c424a');
      p.rect(cx - 1, dy, 2, 1, spec.bodyDark);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = state === 'hurt';
  const hurtWhite = hurt && frame === 0;
  const body = hurtWhite ? '#ffffff' : hurt ? '#ffd0d0' : spec.body;
  const bodyHi = hurtWhite ? '#ffffff' : hurt ? '#ffffff' : spec.bodyHi;
  const bodyDark = hurtWhite ? '#e0e0e0' : hurt ? '#d88890' : spec.bodyDark;
  const acc = hurtWhite ? '#ffffff' : hurt ? '#ff9494' : spec.accent;
  const eye = hurtWhite ? INK : spec.eye;
  const boot = hurtWhite ? '#d0d0d0' : '#26202a';

  const bob = state === 'walk' ? (frame % 2 === 0 ? -1 : 0) : state === 'fire' ? -1 : (frame % 2 === 1 ? 1 : 0);
  const ty = cy + bob;
  const stride = state === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;

  switch (spec.shape) {
    case 'maggot': {
      // Creamy segmented wriggling desert grub
      const rx = Math.max(2, Math.floor(w * 0.18));
      const ry = Math.max(2, Math.floor(h * 0.2));
      for (let seg = -2; seg <= 2; seg++) {
        const sx = cx + seg * Math.max(2, Math.floor(rx * 0.85));
        const sy = ty + ((seg + frame) % 2 === 0 ? 0 : 1);
        p.ellipse(sx, sy, Math.max(2, rx * 0.7), ry, seg % 2 === 0 ? body : bodyDark);
        p.set(sx, sy - 1, bodyHi);
      }
      p.set(cx + rx * 2, ty - 1, eye);
      break;
    }

    case 'nest': {
      p.ellipse(cx, ty + 2, 8, 6, bodyDark);
      p.ellipse(cx - 1, ty - 1, 6, 4, body);
      p.ellipse(cx + 3, ty, 4, 3, bodyHi);
      for (const [hx, hy] of [[-3, 0], [3, -1], [0, 3]] as const) {
        p.rect(cx + hx - 1, ty + hy - 1, 3, 3, '#1a100c');
        if (state === 'tell' || (frame & 1) === 1) {
          p.rect(cx + hx, ty + hy, 2, 1, acc);
        }
      }
      break;
    }

    case 'scorpion': {
      // Golden-tan Desert Scorpion with arched stinger tail, venom sac & pincers
      for (let i = -1; i <= 1; i++) {
        const lx = cx - 2 + i * 3;
        const off = i % 2 === 0 ? stride : -stride;
        p.rect(lx, ty + 4, 2, 3, bodyDark);
        p.set(lx + off, ty + 7, boot);
      }
      // Curved tail overhead
      p.rect(cx - 7, ty - 5, 3, 7, bodyDark);
      p.rect(cx - 7, ty - 7, 7, 3, body);
      p.rect(cx - 5, ty - 7, 5, 1, bodyHi);
      // Glowing venom bulb + tip
      p.rect(cx, ty - 7, 4, 4, state === 'fire' ? '#ffffff' : acc);
      p.set(cx + 4, ty - 5, '#ffffff');
      // Segmented body
      p.ellipse(cx - 1, ty + 2, 6, 4, body);
      p.rect(cx - 4, ty, 6, 1, bodyHi);
      p.rect(cx - 2, ty, 1, 4, bodyDark);
      p.rect(cx + 1, ty, 1, 4, bodyDark);
      // Snapping claws
      p.rect(cx + 4, ty - 1, 4, 2, body);
      p.rect(cx + 4, ty + 3, 4, 2, bodyDark);
      p.set(cx + 3, ty + 1, eye);
      break;
    }

    case 'rat': {
      p.line(cx - 7, ty + 2 + (frame & 1), cx - 3, ty + 2, acc, 1);
      p.ellipse(cx, ty + 1, 5, 3.5, body);
      p.rect(cx - 2, ty - 1, 4, 1, bodyHi);
      p.rect(cx + 3, ty, 4, 3, body);
      p.rect(cx - 2, ty - 3, 2, 2, acc);
      p.set(cx + 6, ty + 1, acc);
      p.set(cx + 3, ty, eye);
      p.rect(cx - 3 + stride, ty + 4, 2, 1, boot);
      p.rect(cx + 2 - stride, ty + 4, 2, 1, boot);
      break;
    }

    case 'ratking': {
      p.ellipse(cx - 6, ty - 6, 3, 3, bodyDark);
      p.ellipse(cx + 6, ty - 6, 3, 3, bodyDark);
      p.ellipse(cx, ty + 1, 10, 8, body);
      p.ellipse(cx - 2, ty - 2, 6, 4, bodyHi);
      p.rect(cx - 5, ty - 3, 3, 3, eye);
      p.rect(cx + 2, ty - 3, 3, 3, eye);
      p.rect(cx - 5, ty + 2, 10, 4, state === 'fire' ? '#eeff80' : acc);
      p.rect(cx - 3, ty + 3, 6, 2, '#ffffff');
      break;
    }

    case 'gator': {
      const bw = Math.floor(w * 0.28);
      const bh = Math.floor(h * 0.32);
      p.rect(cx - bw + stride, ty + bh, 3, 2, boot);
      p.rect(cx + bw - 3 - stride, ty + bh, 3, 2, boot);
      p.rect(cx - bw, ty - bh, bw * 2, bh * 2, body);
      p.rect(cx - bw, ty - bh, bw * 2, 2, bodyHi);
      p.rect(cx - 2, ty, bw + 1, bh, acc);
      p.rect(cx + 1, ty - bh + 2, bw + 3, 4, body);
      p.set(cx + bw + 1, ty - bh + 5, '#ffffff');
      p.set(cx + bw - 1, ty - bh + 5, '#ffffff');
      p.rect(cx - 1, ty - bh + 1, 2, 2, eye);
      p.rect(cx + 2, ty - bh + 1, 2, 2, eye);
      break;
    }

    case 'ballguy': {
      const r = 6 + (state === 'fire' ? 1 : 0);
      p.ellipse(cx, ty, r, r, body);
      p.ellipse(cx - 2, ty - 2, 3, 2.5, bodyHi);
      p.set(cx - 3, ty - 3, '#ffffff');
      p.rect(cx - 3, ty - 1, 2, 2, eye);
      p.rect(cx + 1, ty - 1, 2, 2, eye);
      p.rect(cx - 3, ty + 2, 6, 2, acc);
      break;
    }

    case 'raven': {
      // Iconic shaggy jet-black feathered Scrapyard Raven (06_scrapyard_3_3.png!)
      const flying = state === 'fire';
      const flap = flying ? (frame % 2 === 0 ? -3 : 2) : 0;
      if (flying) {
        p.poly([[cx - 2, ty], [cx - 9, ty - 5 + flap], [cx - 8, ty + 2 + flap]], body);
        p.poly([[cx + 2, ty], [cx + 9, ty - 5 - flap], [cx + 8, ty + 2 - flap]], body);
      } else {
        // Spiky shaggy wing feathers
        p.rect(cx - 6, ty - 3, 3, 7, bodyDark);
        p.set(cx - 7, ty - 2, body);
        p.set(cx - 7, ty + 1, body);
      }
      // Feathered black body + shaggy head crest
      p.ellipse(cx - 1, ty + 1, 5, 5.5, body);
      p.ellipse(cx, ty - 4, 4, 3.5, body);
      p.set(cx - 2, ty - 8, body);
      p.set(cx + 1, ty - 8, bodyHi);
      p.rect(cx - 2, ty - 5, 3, 2, bodyHi);
      // Crisp pale hooked raven beak + fierce red eye
      p.poly([[cx + 3, ty - 5], [cx + 9, ty - 3], [cx + 3, ty - 1]], acc);
      p.set(cx + 4, ty - 4, '#ffffff');
      p.rect(cx + 1, ty - 5, 2, 2, eye);
      // Yellow/tan feet
      p.rect(cx - 3 + stride, ty + 6, 2, 2, '#b89448');
      p.rect(cx + 1 - stride, ty + 6, 2, 2, '#b89448');
      break;
    }

    case 'sniper': {
      // Hooded Scrapyard Sniper (06_scrapyard_3_3.png: brown/tan hood, gray cloak, glowing red laser optic!)
      p.rect(cx - 3 + stride, ty + 6, 2, 2, boot);
      p.rect(cx + 1 - stride, ty + 6, 2, 2, boot);
      // Cloak body
      p.rect(cx - 5, ty - 2, 10, 8, body);
      p.rect(cx - 5, ty - 2, 3, 7, bodyHi);
      p.rect(cx + 2, ty - 2, 3, 7, bodyDark);
      // Hooded head (brownish-tan cap/hood + dark mask + glowing red optic!)
      p.rect(cx - 5, ty - 7, 10, 6, acc);
      p.rect(cx - 4, ty - 8, 8, 2, '#a47858');
      p.rect(cx - 4, ty - 5, 8, 3, '#1e1820');
      p.rect(cx, ty - 4, 3, 2, eye);
      p.set(cx + 1, ty - 4, '#ffffff');
      break;
    }

    case 'salamander': {
      p.line(cx - 9, ty + 2, cx - 5, ty + 1, bodyDark, 2);
      p.ellipse(cx, ty + 1, 7, 4, body);
      p.rect(cx - 4, ty - 1, 7, 1, bodyHi);
      p.rect(cx - 4, ty, 2, 2, acc);
      p.rect(cx, ty - 1, 2, 2, acc);
      p.rect(cx + 4, ty - 2, 2, 2, eye);
      if (state === 'fire') {
        p.ellipse(cx + 8, ty, 3, 2.5, '#ff781c');
        p.set(cx + 8, ty, '#fff498');
      }
      break;
    }

    case 'assassin': {
      p.rect(cx - 3 + stride, ty + 6, 2, 2, boot);
      p.rect(cx + 1 - stride, ty + 6, 2, 2, boot);
      p.rect(cx - 4, ty - 6, 8, 12, body);
      p.rect(cx - 3, ty - 7, 6, 2, bodyHi);
      p.rect(cx - 3, ty - 4, 6, 2, INK);
      p.set(cx - 2, ty - 4, eye);
      p.set(cx + 1, ty - 4, eye);
      // Gleaming pipe/blade
      p.rect(cx + 4, ty - 6, 2, 10, acc);
      p.rect(cx + 4, ty - 5, 1, 8, '#ffffff');
      if (state === 'tell') {
        p.rect(cx - 1, ty - 9, 2, 3, '#ff3848');
      }
      break;
    }

    case 'spider': {
      // Brown/orange Crystal Caves Spider (#9a5a2c + 8 legs + bright orange eyes!)
      for (let leg = -1; leg <= 1; leg++) {
        const ly = ty + leg * 3 + (leg % 2 === 0 ? stride : -stride);
        p.line(cx - 3, ty + leg, cx - 8, ly - 2, bodyDark, 1);
        p.line(cx + 3, ty + leg, cx + 8, ly - 2, bodyDark, 1);
      }
      p.ellipse(cx, ty, 5.5, 4.5, body);
      p.ellipse(cx - 1, ty - 1, 3, 2, bodyHi);
      p.set(cx - 2, ty + 1, eye);
      p.set(cx, ty + 2, eye);
      p.set(cx + 2, ty + 1, eye);
      break;
    }

    case 'crystal': {
      // Tall glowing faceted Cyan/Orange Laser Crystal!
      p.poly([[cx, ty - 11], [cx + 8, ty], [cx, ty + 11], [cx - 8, ty]], body);
      p.poly([[cx, ty - 10], [cx - 7, ty], [cx, ty + 10]], bodyHi);
      p.poly([[cx, ty - 10], [cx + 7, ty], [cx, ty + 10]], bodyDark);
      p.line(cx, ty - 9, cx, ty + 9, '#ffffff', 1);
      p.poly([[cx, ty - 4], [cx + 4, ty], [cx, ty + 4], [cx - 4, ty]], state === 'fire' ? '#ffffff' : acc);
      p.rect(cx - 1, ty - 1, 2, 2, eye);
      break;
    }

    case 'snowbot': {
      // Iconic Frozen City Snowbot (10_frozen_5_1.png & 13_frozen_5_3.png!):
      // Bulky shaggy brown fur collar/shoulders (#8c623a), silver-steel head & chestplate (#949ea8), single red cyclops eye!
      p.rect(cx - 5 + stride, ty + 6, 3, 3, '#525a64');
      p.rect(cx + 2 - stride, ty + 6, 3, 3, '#525a64');
      // Chunky steel arms + brown fists
      p.rect(cx - 9, ty - 1 + stride, 4, 6, acc);
      p.rect(cx - 9, ty + 3 + stride, 4, 3, body);
      p.rect(cx + 5, ty - 1 - stride, 4, 6, acc);
      p.rect(cx + 5, ty + 3 - stride, 4, 3, body);
      // Steel chestplate torso
      p.rect(cx - 6, ty - 2, 12, 8, acc);
      p.rect(cx - 5, ty - 1, 10, 2, '#c8d2dc');
      p.rect(cx - 4, ty + 3, 8, 2, '#5c6672');
      // Thick shaggy brown fur mantle around shoulders & head!
      p.ellipse(cx, ty - 4, 8, 5, body);
      p.rect(cx - 7, ty - 7, 14, 3, bodyHi);
      p.set(cx - 6, ty - 9, body);
      p.set(cx + 5, ty - 9, body);
      // Round steel cyclops head nested in the fur + bright glowing red eye!
      p.rect(cx - 3, ty - 8, 6, 6, acc);
      p.rect(cx - 2, ty - 8, 4, 2, '#d8e0e8');
      p.rect(cx - 1, ty - 6, 2, 2, state === 'fire' ? '#ffe448' : eye);
      break;
    }

    case 'wolf': {
      // Gray-brown Arctic Wolf with dark mounted back rifle (10_frozen_5_1.png & 13_frozen_5_3.png!)
      p.line(cx - 9, ty - 1 + (frame & 1), cx - 5, ty + 1, bodyDark, 2);
      // Legs
      p.rect(cx - 6 + stride, ty + 3, 2, 4, bodyDark);
      p.rect(cx - 2 - stride, ty + 3, 2, 4, boot);
      p.rect(cx + 3 - stride, ty + 3, 2, 4, bodyDark);
      p.rect(cx + 6 + stride, ty + 3, 2, 4, boot);
      // Lean wolf torso with brown fur patch
      p.rect(cx - 6, ty - 2, 12, 6, body);
      p.rect(cx - 5, ty - 2, 6, 4, acc);
      p.rect(cx - 5, ty - 2, 10, 1, bodyHi);
      // Mounted dark back sniper cannon!
      p.rect(cx - 3, ty - 6, 9, 2, '#282c34');
      p.rect(cx - 1, ty - 4, 2, 2, '#444c58');
      // Pointed wolf head, ears & red eye
      p.rect(cx + 4, ty - 4, 5, 5, body);
      p.rect(cx + 7, ty - 2, 3, 3, bodyHi);
      p.set(cx + 4, ty - 5, bodyDark);
      p.set(cx + 7, ty - 5, bodyDark);
      p.set(cx + 6, ty - 3, eye);
      break;
    }

    case 'tank': {
      // Wide rounded silver-steel Snow Tank saucer walker (10_frozen_5_1.png & 13_frozen_5_3.png!)
      // 4 dark spidery armored walker legs
      p.rect(cx - 11, ty + 1 + stride, 2, 8, '#282c34');
      p.rect(cx - 6, ty + 2 - stride, 2, 7, '#3c424c');
      p.rect(cx + 4, ty + 2 + stride, 2, 7, '#3c424c');
      p.rect(cx + 9, ty + 1 - stride, 2, 8, '#282c34');
      // Dark undercarriage + glowing red cannon eye
      p.rect(cx - 8, ty + 1, 16, 4, '#24262e');
      p.rect(cx - 2, ty + 2, 4, 3, eye);
      p.set(cx - 1, ty + 2, '#fff088');
      // Wide domed silver-steel saucer top + rust patches!
      p.ellipse(cx, ty - 3, 12, 6, body);
      p.ellipse(cx - 2, ty - 5, 8, 3, bodyHi);
      p.rect(cx - 11, ty - 2, 22, 2, bodyDark);
      // Rust patches matching reference video
      p.rect(cx - 7, ty - 3, 4, 3, acc);
      p.rect(cx + 4, ty - 4, 4, 2, acc);
      break;
    }

    case 'freak': {
      p.rect(cx - 3 + stride, ty + 5, 2, 2, boot);
      p.rect(cx + 1 - stride, ty + 5, 2, 2, boot);
      p.ellipse(cx, ty, 5.5, 5.5, body);
      p.rect(cx - 3, ty - 5, 6, 2, bodyHi);
      p.rect(cx - 3, ty - 3, 2, 2, eye);
      p.rect(cx + 1, ty - 3, 2, 2, eye);
      p.rect(cx - 3, ty + 1, 6, 3, acc);
      p.set(cx - 2, ty + 2, '#ffffff');
      p.set(cx + 1, ty + 2, '#ffffff');
      break;
    }

    case 'rhino': {
      p.rect(cx - 7 + stride, ty + 6, 4, 4, boot);
      p.rect(cx + 3 - stride, ty + 6, 4, 4, boot);
      p.rect(cx - 8, ty - 7, 16, 14, body);
      p.rect(cx - 7, ty - 7, 14, 3, bodyHi);
      p.rect(cx - 8, ty + 4, 16, 3, bodyDark);
      // Huge curved ivory horn!
      p.poly([[cx + 5, ty - 2], [cx + 12, ty - 9], [cx + 9, ty], [cx + 5, ty + 1]], acc);
      p.rect(cx + 2, ty - 4, 3, 2, eye);
      break;
    }

    case 'necro': {
      // Glowing purple-robed hooded Necromancer + glowing green staff!
      p.poly([[cx - 3, ty - 8], [cx + 3, ty - 8], [cx + 6, ty + 7], [cx - 6, ty + 7]], body);
      p.rect(cx - 3, ty - 7, 4, 2, bodyHi);
      p.rect(cx - 5, ty + 5, 10, 2, acc);
      p.rect(cx - 3, ty - 5, 6, 4, INK);
      p.rect(cx - 2, ty - 4, 2, 2, eye);
      p.rect(cx + 1, ty - 4, 2, 2, eye);
      // Glowing emerald revival staff
      p.rect(cx + 5, ty - 5, 2, 12, '#4c3464');
      p.rect(cx + 4, ty - 8, 4, 4, acc);
      p.rect(cx + 5, ty - 7, 2, 2, '#ffffff');
      break;
    }

    case 'turret': {
      p.rect(cx - 6, ty + 1, 12, 6, bodyDark);
      p.rect(cx - 5, ty + 3, 10, 2, '#1c1e26');
      p.rect(cx - 4, ty + 3, 2, 2, acc);
      p.rect(cx, ty + 3, 2, 2, acc);
      p.rect(cx + 3, ty + 3, 2, 2, acc);
      p.rect(cx - 5, ty - 5, 10, 7, body);
      p.rect(cx - 4, ty - 5, 8, 2, bodyHi);
      p.rect(cx + 4, ty - 3, 5, 3, bodyDark);
      p.rect(cx - 2, ty - 3, 3, 3, state === 'fire' ? '#ffffff' : eye);
      break;
    }

    case 'guardian': {
      // Menacing swirling luminous neon-green Palace Guardian (exact match to 15_palace_7_1.png!)
      // Tall flickering flame-crested spectral wraith with tattered floating wispy robes,
      // hollow sunken dark eyes, radiant energy veins, and crackling orbiting rad flecks!
      const sway = frame % 2 === 0 ? -1 : 1;
      const fire = state === 'fire' || state === 'tell';
      // Swirling asymmetric twin flame horns curling upward from head crest
      p.poly([[cx - 5, ty - 5], [cx - 7 + sway, ty - 11], [cx - 3, ty - 8]], bodyHi);
      p.poly([[cx + 5, ty - 5], [cx + 8 - sway, ty - 11], [cx + 3, ty - 8]], bodyHi);
      p.set(cx - 7 + sway, ty - 12, acc);
      p.set(cx + 8 - sway, ty - 12, acc);
      // Curved cowl / flame hood tapering smoothly into wide swirling shoulders
      p.ellipse(cx, ty - 5, 5.5, 4.5, body);
      p.ellipse(cx, ty - 6, 3.8, 2.8, bodyHi);
      // Tapered sinuous draped spectral robe body (NOT a blocky rectangle!)
      p.poly([
        [cx - 6, ty - 4],
        [cx + 6, ty - 4],
        [cx + 7, ty + 3],
        [cx + 5 + sway, ty + 9],
        [cx + 2, ty + 6],
        [cx, ty + 10],
        [cx - 2, ty + 7],
        [cx - 5 - sway, ty + 10],
        [cx - 7, ty + 3],
      ], body);
      // Deep emerald tattered inner-robe folds + bright glowing central rad column
      p.poly([[cx - 6, ty], [cx - 4, ty + 8], [cx - 6, ty + 9]], bodyDark);
      p.poly([[cx + 6, ty], [cx + 4, ty + 8], [cx + 6, ty + 9]], bodyDark);
      p.rect(cx - 3, ty - 3, 6, 8, bodyHi);
      p.rect(cx - 1, ty - 2, 2, 7, fire ? '#ffffff' : acc);
      // Swirling outstretched spectral energy wisps on sides
      p.line(cx - 6, ty - 1, cx - 9, ty + 2 + sway, body, 1);
      p.line(cx + 6, ty - 1, cx + 9, ty + 2 - sway, body, 1);
      // Fierce sunken dark spectral eye cavities + eerie glowing inner slits
      p.rect(cx - 4, ty - 6, 3, 3, '#0e2810');
      p.rect(cx + 1, ty - 6, 3, 3, '#0e2810');
      p.set(cx - 3, ty - 5, fire ? '#ffffff' : bodyHi);
      p.set(cx + 2, ty - 5, fire ? '#ffffff' : bodyHi);
      // Glowing hollow energy core in chest when firing/charging
      if (fire) {
        p.ellipse(cx, ty + 1, 3, 3, '#ffffff');
      } else {
        p.rect(cx - 1, ty, 2, 3, '#e8ffc0');
      }
      // Crackling floating rad flecks beside silhouette
      p.set(cx - 9, ty - 6 - sway, acc);
      p.set(cx + 9, ty - 4 + sway, acc);
      break;
    }

    case 'dog_guardian': {
      // Fierce hunched emerald/neon-green Palace Guardian Dog with blazing rad mane & jagged jaws!
      // Muscular clawed legs
      p.rect(cx - 9 + stride, ty + 5, 4, 5, bodyDark);
      p.rect(cx - 9 + stride, ty + 8, 4, 2, INK);
      p.rect(cx + 5 - stride, ty + 5, 4, 5, bodyDark);
      p.rect(cx + 5 - stride, ty + 8, 4, 2, INK);
      // Spiked neon-green dorsal rad mane crest!
      p.poly([[cx - 9, ty - 2], [cx - 11, ty - 8], [cx - 5, ty - 5]], bodyHi);
      p.poly([[cx - 4, ty - 5], [cx - 3, ty - 11], [cx + 1, ty - 6]], acc);
      p.poly([[cx + 1, ty - 5], [cx + 4, ty - 10], [cx + 6, ty - 4]], bodyHi);
      // Bulky hunched muscular torso
      p.ellipse(cx, ty, 11, 7, body);
      p.ellipse(cx - 2, ty - 2, 7, 3.5, bodyHi);
      p.ellipse(cx + 3, ty + 3, 7, 3.5, bodyDark);
      // Fierce brow & glaring radiant eyes
      p.rect(cx - 6, ty - 4, 4, 3, '#0b220e');
      p.rect(cx + 2, ty - 4, 4, 3, '#0b220e');
      p.rect(cx - 5, ty - 3, 2, 2, state === 'fire' ? '#ffffff' : acc);
      p.rect(cx + 3, ty - 3, 2, 2, state === 'fire' ? '#ffffff' : acc);
      // Wide snarling jaw with razor fangs
      p.rect(cx - 6, ty + 1, 12, 4, '#0c1e0e');
      p.rect(cx - 4, ty + 2, 8, 2, '#1f6420');
      p.rect(cx - 5, ty + 1, 2, 2, '#ffffff');
      p.rect(cx - 1, ty + 1, 2, 2, '#ffffff');
      p.rect(cx + 3, ty + 1, 2, 2, '#ffffff');
      p.set(cx - 3, ty + 4, '#ffffff');
      p.set(cx + 1, ty + 4, '#ffffff');
      break;
    }

    case 'molefish': {
      // Iconic Oasis vibrant purple-blue Bonefish/Fish (05_oasis.png!)
      // Tail fin on right
      p.poly([[cx + 5, ty], [cx + 10, ty - 4], [cx + 10, ty + 4]], body);
      p.rect(cx + 7, ty - 2, 2, 4, acc);
      // Spiky dorsal crest
      p.rect(cx - 3, ty - 7, 2, 3, bodyHi);
      p.rect(cx, ty - 8, 2, 4, bodyHi);
      p.rect(cx + 3, ty - 6, 2, 3, body);
      // Plump purple-blue fish body
      p.ellipse(cx - 1, ty, 7, 5, body);
      p.rect(cx - 5, ty - 4, 7, 2, bodyHi);
      p.rect(cx - 6, ty + 2, 9, 2, bodyDark);
      // Pale rib/gill stripes matching 05_oasis.png!
      p.rect(cx, ty - 2, 1, 4, acc);
      p.rect(cx + 2, ty - 2, 1, 4, acc);
      p.rect(cx + 4, ty - 1, 1, 3, acc);
      // Snarling teeth + fierce red/white eye
      p.rect(cx - 7, ty + 1, 4, 1, '#ffffff');
      p.rect(cx - 4, ty - 2, 2, 2, eye);
      p.set(cx - 4, ty - 2, '#ffffff');
      break;
    }

    case 'turtle': {
      // Green-shelled Barrel Hermit Crab / Sewer Turtle (05_oasis.png!)
      // Rusty brown barrel / dome shell on top
      p.rect(cx - 5, ty - 8, 10, 9, acc);
      p.rect(cx - 4, ty - 8, 4, 8, '#9a6452');
      p.rect(cx - 5, ty - 5, 10, 1, '#4c2c22');
      p.rect(cx - 5, ty - 2, 10, 1, '#4c2c22');
      // Vibrant green crab/turtle body & claws underneath
      p.rect(cx - 6, ty + 1, 12, 5, body);
      p.rect(cx - 5, ty + 1, 10, 2, bodyHi);
      p.rect(cx - 8, ty + 2, 3, 4, body);
      p.rect(cx + 5, ty + 2, 3, 4, bodyDark);
      p.rect(cx - 4 + stride, ty + 5, 2, 3, bodyDark);
      p.rect(cx + 2 - stride, ty + 5, 2, 3, bodyDark);
      p.rect(cx - 3, ty + 2, 2, 2, eye);
      p.rect(cx + 1, ty + 2, 2, 2, eye);
      break;
    }

    case 'van': {
      p.rect(cx - 15, ty - 9, 30, 18, body);
      p.rect(cx - 15, ty - 9, 30, 3, bodyHi);
      p.rect(cx - 15, ty + 6, 30, 3, bodyDark);
      p.rect(cx - 14, ty - 1, 28, 3, acc);
      // Windshield
      p.rect(cx + 5, ty - 6, 8, 12, '#78e8ff');
      p.line(cx + 7, ty - 4, cx + 11, ty + 2, '#ffffff', 1);
      // Flashing red/blue siren
      p.rect(cx - 3, ty - 7, 5, 5, frame % 2 === 0 ? '#ff3848' : '#38a8ff');
      p.rect(cx - 3, ty + 2, 5, 5, frame % 2 === 0 ? '#38a8ff' : '#ff3848');
      break;
    }

    case 'mimic': {
      p.rect(cx - 7, ty - 6, 14, 12, body);
      p.rect(cx - 7, ty - 6, 14, 2, bodyHi);
      if (state === 'fire' || state === 'tell' || (frame & 1) === 1) {
        p.rect(cx - 6, ty - 2, 12, 5, '#180a12');
        p.set(cx - 5, ty - 2, '#ffffff');
        p.set(cx - 2, ty - 2, '#ffffff');
        p.set(cx + 1, ty - 2, '#ffffff');
        p.set(cx + 4, ty - 2, '#ffffff');
        p.rect(cx - 3, ty + 1, 6, 2, acc);
        p.rect(cx - 4, ty - 5, 2, 2, eye);
        p.rect(cx + 2, ty - 5, 2, 2, eye);
      } else {
        p.rect(cx - 6, ty, 12, 2, '#ffe066');
        p.rect(cx - 2, ty - 1, 4, 4, '#fff5a6');
      }
      break;
    }

    case 'sapling': {
      // Vibrant crimson-and-green snapping jungle fly/flower!
      p.rect(cx - 3, ty + 1, 6, 4, body);
      p.rect(cx - 5, ty + 2, 2, 2, bodyHi);
      p.rect(cx + 3, ty + 2, 2, 2, bodyHi);
      p.ellipse(cx, ty - 2, 5, 4, acc);
      p.rect(cx - 3, ty - 2, 6, 2, '#18060a');
      p.set(cx - 2, ty - 2, '#ffffff');
      p.set(cx + 1, ty - 2, '#ffffff');
      p.set(cx - 2, ty - 4, eye);
      p.set(cx + 1, ty - 4, eye);
      break;
    }

    case 'idpd': {
      // Cobalt-blue IDPD Grunt / Inspector / Shielder (15_palace_7_1.png!)
      const hw = Math.floor(w * 0.28);
      const hh = Math.floor(h * 0.32);
      p.rect(cx - 3 + stride, ty + hh, 2, 2, boot);
      p.rect(cx + 1 - stride, ty + hh, 2, 2, boot);
      p.rect(cx - hw, ty - hh + 2, hw * 2, hh * 2 - 2, body);
      p.rect(cx - hw + 1, ty - hh, hw * 2 - 2, 3, bodyHi);
      // Yellow/white helmet badge & pauldrons
      p.rect(cx - 1, ty - hh, 2, 2, acc);
      p.rect(cx - hw - 1, ty, 2, 3, acc);
      p.rect(cx + hw - 1, ty, 2, 3, acc);
      // Dark tactical visor + glowing cyan slit
      p.rect(cx - 3, ty - hh + 3, 6, 3, '#101828');
      p.rect(cx - 2, ty - hh + 4, 4, 1, eye);
      if (state === 'fire' && w >= 20) {
        p.ellipse(cx, ty, hw + 3, hh + 2, '#64dcff');
        p.ellipse(cx, ty, hw + 1, hh, body);
      }
      break;
    }

    default: {
      // Hooded tan Desert Bandit / Jungle Bandit (exact match to 04_desert_1_1.png!)
      p.rect(cx - 3 + stride, ty + 5, 2, 2, boot);
      p.rect(cx + 1 - stride, ty + 5, 2, 2, boot);
      // Chunky round hooded cloak
      p.rect(cx - 5, ty - 5, 10, 10, body);
      p.rect(cx - 4, ty - 6, 8, 2, bodyHi);
      p.rect(cx - 5, ty + 2, 10, 3, bodyDark);
      // Dark face wrap / bandana + glowing eye slits!
      p.rect(cx - 5, ty - 2, 10, 4, acc);
      p.rect(cx - 4, ty - 3, 8, 2, '#1c1414');
      p.rect(cx - 3, ty - 3, 2, 1, eye);
      p.rect(cx + 1, ty - 3, 2, 1, eye);
      break;
    }
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

// ============================================================================
// ALL 5 SHOWSTOPPER CRISP NATIVE 1x BOSSES (INCLUDING THE NUCLEAR THRONE!)
// ============================================================================

function drawBigBandit1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'tell',
): void {
  const p = new PxCanvas(w, h);
  const cx = 18;
  const cy = 18;
  const hurt = mode === 'hurt';

  if (mode === 'dead') {
    p.ellipse(cx, cy + 8, 12, 5, '#2a2228');
    p.ellipse(cx - 1, cy + 7, 10, 4, '#44383a');
    p.rect(cx - 6, cy + 6, 10, 2, '#6c2428');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const coat = hurt ? '#ffffff' : '#b88246';
  const coatHi = hurt ? '#ffffff' : '#e0aa6a';
  const coatDark = hurt ? '#e0e0e0' : '#7a5024';
  const hat = hurt ? '#ffffff' : '#6c4220';
  const scarf = hurt ? '#ff9898' : '#d82c32';
  const steel = hurt ? '#ffffff' : '#748292';
  const gold = '#f5cc40';
  const bob = mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f & 1);
  const stride = mode === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
  const ty = cy + bob;

  // Heavy boots
  p.rect(cx - 8 + stride, cy + 10, 6, 4, '#3e2418');
  p.rect(cx + 2 - stride, cy + 10, 6, 4, '#3e2418');

  // Wide tattered desert warlord poncho/coat
  p.rect(cx - 11, ty - 5, 22, 15, coat);
  p.rect(cx - 10, ty - 5, 9, 13, coatHi);
  p.rect(cx + 4, ty - 4, 7, 14, coatDark);
  // Armored shoulder pauldrons
  p.rect(cx - 12, ty - 5, 5, 5, steel);
  p.rect(cx + 7, ty - 5, 5, 5, steel);
  // Belt + brass buckle + crossing bullet bandolier
  p.rect(cx - 10, ty + 5, 20, 3, '#4c2c1c');
  p.rect(cx - 3, ty + 5, 6, 3, gold);
  for (let i = 0; i < 4; i++) {
    p.rect(cx - 7 + i * 4, ty - 2 + i * 2, 2, 3, gold);
  }
  // Bold crimson bandit scarf + fluttering tail
  p.rect(cx - 15, ty - 4 + (f & 1), 6, 4, scarf);
  p.rect(cx - 10, ty - 6, 20, 4, scarf);
  p.rect(cx - 8, ty - 6, 14, 1, '#ff686e');
  // Shadowed masked head + glowing angular red visor goggles
  p.rect(cx - 7, ty - 11, 14, 6, '#1e161a');
  const eyeCol = mode === 'tell' ? '#ffe048' : '#ff3038';
  p.rect(cx - 5, ty - 9, 4, 2, eyeCol);
  p.rect(cx + 1, ty - 9, 4, 2, eyeCol);
  p.set(cx - 4, ty - 9, '#ffffff');
  p.set(cx + 2, ty - 9, '#ffffff');
  // Wide battered outlaw ranger hat + crimson band
  p.rect(cx - 14, ty - 12, 28, 3, hat);
  p.rect(cx - 8, ty - 16, 16, 5, hat);
  p.rect(cx - 7, ty - 16, 10, 2, '#966238');
  p.rect(cx - 8, ty - 13, 16, 2, scarf);

  if (mode === 'fire') {
    p.poly([[cx + 12, ty - 1], [cx + 17, ty + 2], [cx + 12, ty + 5]], '#ff8828');
    p.rect(cx + 12, ty + 1, 3, 2, '#fff8a0');
  }
  p.outline(INK);
  p.flush(ctx, x, y);
}

/**
 * BIG DOG (56x56, orig 28,28) — exact match to 07_bigdog_3_3.png!
 * Huge wide boxy/domed weathered steel & tan spider-walker tank with serrated waist rim,
 * twin missile launchers, rusted dome top, and golden spin glow when firing!
 */
function drawBigDog1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'fire' | 'charge' | 'sleep',
): void {
  const p = new PxCanvas(w, h);
  const cx = 28;
  const cy = 28;
  const hurt = mode === 'hurt';
  const sleep = mode === 'sleep';

  if (mode === 'dead') {
    p.ellipse(cx, cy + 8, 22, 10, '#2a2224');
    p.ellipse(cx, cy + 6, 17, 7, '#443a3a');
    p.rect(cx - 10, cy + 3, 20, 5, '#5a4a42');
    p.ellipse(cx, cy + 6, 4, 3, '#6c1c1e');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const dome = hurt ? '#ffffff' : sleep ? '#787c84' : '#9aa2aa';
  const domeHi = hurt ? '#ffffff' : sleep ? '#9ca0a8' : '#ccd4dc';
  const domeDark = hurt ? '#d8d8d8' : '#58606a';
  const rust = hurt ? '#ffcccc' : '#9c582e';
  const hull = hurt ? '#ffffff' : '#8c7258';
  const hullDark = hurt ? '#d0d0d0' : '#503e30';
  const gold = '#f5c838';
  const bob = sleep ? 2 : mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f & 1);
  const legOff = sleep ? 0 : mode === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
  const ty = cy + bob;

  // 4 Sturdy armored iron spider-walker legs!
  for (const [sx, oy, sh] of [[-1, -8, legOff], [1, -8, -legOff], [-1, 7, -legOff], [1, 7, legOff]] as const) {
    const hx = cx + sx * 14;
    const hy = ty + oy;
    const kx = cx + sx * (sleep ? 18 : 21);
    const ky = ty + oy + sh;
    const fx = cx + sx * (sleep ? 20 : 23);
    const fy = ky + (sleep ? 5 : 8);
    p.line(hx, hy, kx, ky, domeDark, 3);
    p.line(kx, ky, fx, fy, '#3a404a', 3);
    p.rect(fx - 3, fy - 2, 6, 4, '#242830');
  }

  // Lower tank hull & central armored skirt
  p.ellipse(cx, ty + 4, 21, 13, hullDark);
  p.ellipse(cx, ty + 2, 20, 12, hull);

  // Twin side boxy missile launchers / gatling pods!
  p.rect(cx - 25, ty - 5, 9, 11, domeDark);
  p.rect(cx - 24, ty - 4, 7, 3, gold);
  p.rect(cx + 16, ty - 5, 9, 11, domeDark);
  p.rect(cx + 17, ty - 4, 7, 3, gold);

  // Iconic wide rounded saucer-dome roof with weathered rust streaks (07_bigdog_3_3.png!)
  p.ellipse(cx, ty - 4, 21, 12, dome);
  p.ellipse(cx - 3, ty - 7, 14, 6, domeHi);
  // Rust streaks across dome
  if (!hurt) {
    p.rect(cx - 14, ty - 7, 7, 4, rust);
    p.rect(cx + 6, ty - 6, 8, 3, rust);
    p.rect(cx - 4, ty - 2, 9, 3, rust);
    // Panel seam lines
    p.rect(cx - 18, ty - 3, 36, 1, domeDark);
    p.rect(cx, ty - 14, 1, 12, domeDark);
  }

  // Serrated saw-tooth waist rim (blazes bright yellow/gold when spinning & firing like 07_bigdog_3_3.png!)
  if (mode === 'fire') {
    p.rect(cx - 21, ty + 1, 42, 6, '#e8a824');
    p.rect(cx - 19, ty + 2, 38, 3, '#fff078');
    p.rect(cx - 16, ty + 3, 32, 1, '#ffffff');
  }
  for (let tx = -18; tx <= 18; tx += 6) {
    const shift = mode === 'fire' ? (f % 2 === 0 ? 2 : -2) : 0;
    p.poly([[cx + tx + shift - 2, ty + 1], [cx + tx + shift, ty - 2], [cx + tx + shift + 2, ty + 1]], domeHi);
  }

  // Central cyclops targeting cannon eye (shuttered asleep when sleep!)
  p.ellipse(cx, ty + 5, 7, 6, '#1c1820');
  if (sleep) {
    p.rect(cx - 5, ty + 3, 10, 4, '#3c2e34');
    p.rect(cx - 5, ty + 5, 10, 1, INK);
  } else {
    const eyeCol = mode === 'charge' ? '#ffe048' : '#ff3428';
    p.ellipse(cx, ty + 5, 5, 4, eyeCol);
    p.rect(cx - 2, ty + 3, 3, 2, '#ffffff');
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawLilHunter1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'walk' | 'hurt' | 'dead' | 'lift' | 'land',
): void {
  const p = new PxCanvas(w, h);
  const cx = 14;
  const cy = 16;
  const hurt = mode === 'hurt';

  if (mode === 'dead') {
    p.ellipse(cx, cy + 7, 9, 4, '#242c3e');
    p.rect(cx - 5, cy + 5, 8, 3, '#384c78');
    p.rect(cx + 3, cy + 4, 3, 2, '#ff6c24');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const armor = hurt ? '#ffffff' : '#3c74d8';
  const armorHi = hurt ? '#ffffff' : '#78b0ff';
  const armorDark = hurt ? '#d8d8d8' : '#1e428c';
  const trim = hurt ? '#ffffff' : '#f2f6fc';
  const jet = hurt ? '#e0e0e0' : '#647284';
  const bob = mode === 'lift' ? -2 : (f & 1);
  const ty = cy + bob;
  const stride = mode === 'walk' ? (f % 2 === 0 ? 1 : -1) : 0;

  // Twin metallic dorsal jetpack cylinders + blazing orange/yellow thruster flames!
  p.rect(cx - 10, ty - 6, 5, 11, jet);
  p.rect(cx - 9, ty - 5, 2, 9, '#9aa8ba');
  p.rect(cx + 5, ty - 6, 5, 11, jet);
  p.rect(cx + 6, ty - 5, 2, 9, '#9aa8ba');
  const fH = mode === 'lift' || mode === 'land' ? 7 + (f & 1) * 2 : 4 + (f & 1) * 2;
  p.poly([[cx - 10, ty + 5], [cx - 5, ty + 5], [cx - 7, ty + 5 + fH]], '#ff6c1c');
  p.poly([[cx - 9, ty + 5], [cx - 6, ty + 5], [cx - 7, ty + 5 + Math.floor(fH * 0.6)]], '#fff8a0');
  p.poly([[cx + 5, ty + 5], [cx + 10, ty + 5], [cx + 7, ty + 5 + fH]], '#ff6c1c');
  p.poly([[cx + 6, ty + 5], [cx + 9, ty + 5], [cx + 7, ty + 5 + Math.floor(fH * 0.6)]], '#fff8a0');

  // Armored boots & cobalt IDPD captain torso + white trim
  p.rect(cx - 5 + stride, ty + 8, 4, 4, armorDark);
  p.rect(cx + 1 - stride, ty + 8, 4, 4, armorDark);
  p.rect(cx - 6, ty - 3, 12, 11, armor);
  p.rect(cx - 5, ty - 2, 10, 3, trim);
  // Sloped IDPD helmet + white crest + bright cyan visor!
  p.rect(cx - 5, ty - 11, 10, 8, armor);
  p.rect(cx - 4, ty - 12, 8, 2, armorHi);
  p.rect(cx - 1, ty - 13, 2, 4, trim);
  p.rect(cx - 4, ty - 9, 8, 4, '#0c1428');
  p.rect(cx - 3, ty - 8, 6, 2, '#5ceeff');
  p.rect(cx - 2, ty - 8, 3, 1, '#ffffff');
  p.outline(INK);
  p.flush(ctx, x, y);
}

// ============================================================================
// THE NUCLEAR THRONE (EXACT MATCH TO 18_throne_idle.png & 19_throne_beam.png!)
// Composited by renderer.ts: sprNothingBack -> sprNothingLeg -> sprNothingPipes -> sprNothingOff/On/Fire!
// ============================================================================

/**
 * sprNothingBack (168x104, orig 84,52):
 * Massive weathered dark-terracotta/iron machine chassis spanning the Palace hall,
 * twin colossal glowing neon-green cylindrical rad tanks on left & right,
 * twin angled steel side chimney vents, and 3+3 front glowing green rad pods!
 */
function drawThroneBack1x(ctx: DrawCtx, x: number, y: number, w: number, h: number): void {
  const p = new PxCanvas(w, h);
  const cx = 84;
  const cy = 52;

  const terra = '#743836';
  const terraHi = '#964e4a';
  const terraDark = '#4e2224';
  const iron = '#68707a';
  const ironHi = '#98a2ae';
  const ironDark = '#3a404a';
  const radOuter = '#3ca810';
  const radMid = '#84f418';
  const radHi = '#d0ff68';

  // Massive outer weathered terracotta machine platform deck spanning x = 16..152
  p.rect(cx - 68, cy - 34, 136, 70, terra);
  p.rect(cx - 66, cy - 34, 132, 3, terraHi);
  p.rect(cx - 68, cy + 28, 136, 8, terraDark);
  // Subtle deck battle dents & iron rivets
  for (const [dx, dy] of [[-54, 12], [-42, 18], [46, 14], [56, 8], [-58, -12], [54, -14]] as const) {
    p.rect(cx + dx, cy + dy, 3, 2, terraDark);
    p.set(cx + dx, cy + dy - 1, terraHi);
  }
  // Neon-green circuit trim strip across mid deck (matching 18_throne_idle.png!)
  p.rect(cx - 64, cy + 6, 42, 2, '#58e828');
  p.rect(cx + 22, cy + 6, 42, 2, '#58e828');
  p.rect(cx - 64, cy + 8, 42, 1, INK);
  p.rect(cx + 22, cy + 8, 42, 1, INK);

  // TWIN COLOSSAL GLOWING NEON-GREEN CYLINDRICAL RAD TANKS (exact world Y = -42..-6 matching core!)
  for (const side of [-1, 1]) {
    const tx = side < 0 ? cx - 44 : cx + 22;
    // Tank iron base cradle
    p.rect(tx - 2, cy - 44, 26, 48, terraDark);
    // Colossal glowing neon-green glass cylinder (22px wide x 34px tall!)
    p.rect(tx, cy - 42, 22, 34, radOuter);
    p.rect(tx + 3, cy - 42, 16, 34, radMid);
    p.rect(tx + 7, cy - 42, 7, 34, radHi);
    p.rect(tx + 9, cy - 41, 3, 30, '#f0ffb8');
    // Riveted weathered iron cylindrical end caps (top & bottom of each tank!)
    for (const capY of [cy - 48, cy - 10]) {
      p.rect(tx - 2, capY, 26, 10, iron);
      p.rect(tx, capY + 1, 22, 3, ironHi);
      p.rect(tx - 2, capY + 7, 26, 3, ironDark);
      // Rust patches + skull/vent ports on front cap
      p.rect(tx + 2, capY + 2, 4, 3, '#8e4c34');
      p.rect(tx + 16, capY + 3, 4, 3, '#8e4c34');
      p.rect(tx + 7, capY + 4, 8, 5, '#282c34');
      p.rect(tx + 9, capY + 5, 4, 3, '#101218');
    }
  }

  // Twin angled steel chimney vents / flaming side braziers on outer flanks!
  for (const side of [-1, 1]) {
    const bx = side < 0 ? cx - 68 : cx + 62;
    p.poly(
      side < 0
        ? [[bx - 2, cy - 14], [bx + 6, cy - 14], [bx + 9, cy + 12], [bx + 4, cy + 12]]
        : [[bx, cy - 14], [bx + 8, cy - 14], [bx + 2, cy + 12], [bx - 3, cy + 12]],
      iron,
    );
    p.rect(side < 0 ? bx - 1 : bx + 1, cy - 15, 6, 4, ironHi);
    p.rect(side < 0 ? bx : bx + 2, cy - 14, 4, 2, '#1c2028');
  }

  // 3 + 3 Front Glowing Neon-Green Rad Coolant Pods along the front edge (18_throne_idle.png!)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const px = side < 0 ? cx - 64 + i * 16 : cx + 22 + i * 16;
      const py = cy + 32;
      p.rect(px, py, 10, 14, iron);
      p.rect(px + 1, py + 1, 8, 10, radOuter);
      p.rect(px + 2, py + 1, 6, 9, radMid);
      p.rect(px + 3, py + 2, 3, 6, radHi);
      p.rect(px, py + 10, 10, 4, ironDark);
      p.rect(px + 1, py + 11, 8, 2, ironHi);
    }
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

/**
 * sprNothingPipes (168x104, orig 84,52):
 * Awakened pulsing neon-green power conduits & side exhaust flare!
 */
function drawThronePipes1x(ctx: DrawCtx, x: number, y: number, w: number, h: number): void {
  const p = new PxCanvas(w, h);
  const cx = 84;
  const cy = 52;
  for (const side of [-1, 1]) {
    const px = side < 0 ? cx - 64 : cx + 48;
    p.rect(px, cy - 26, 16, 4, '#44d820');
    p.rect(px + 2, cy - 25, 12, 2, '#c8ff70');
    // Glowing green brazier flame above each outer chimney
    const fx = side < 0 ? cx - 66 : cx + 63;
    p.rect(fx, cy - 20, 4, 6, '#58f030');
    p.rect(fx + 1, cy - 19, 2, 4, '#eeffb8');
  }
  p.outline(INK);
  p.flush(ctx, x, y);
}

/**
 * sprNothingLeg (44x56, orig 10,22, 10 frames):
 * Articulated heavy dark-iron skeletal spider-walker leg extending from Throne flanks!
 */
function drawThroneLeg1x(ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number): void {
  const p = new PxCanvas(w, h);
  const phase = (f / 10) * Math.PI * 2;
  const swingX = Math.round(Math.sin(phase) * 5);
  const liftY = Math.round(Math.max(0, -Math.cos(phase)) * 6);
  const hipX = 8;
  const hipY = 22;
  const kneeX = 24 + Math.round(swingX * 0.5);
  const kneeY = 12 - Math.round(liftY * 0.6);
  const footX = 34 + swingX;
  const footY = 44 - liftY;

  p.line(hipX, hipY, kneeX, kneeY, '#4c525e', 5);
  p.line(hipX, hipY - 1, kneeX, kneeY - 1, '#848e9c', 2);
  p.line(kneeX, kneeY, footX, footY, '#3a3e48', 4);
  p.line(kneeX - 1, kneeY, footX - 1, footY, '#6c7482', 1);
  // Hydraulic joint + glowing green piston rivet + clawed foot
  p.ellipse(kneeX, kneeY, 4, 4, '#68707c');
  p.rect(kneeX - 1, kneeY - 1, 2, 2, '#68f438');
  p.rect(footX - 4, footY - 2, 8, 5, '#2c303a');
  p.rect(footX - 3, footY - 1, 6, 2, '#5c6472');
  p.outline(INK);
  p.flush(ctx, x, y);
}

/**
 * Central Nuclear Throne body (EXACTLY 96x88, orig 48,44 — matches tests & renderer!):
 * - 'off': Royal crimson carpet & stepped stairs leading up to the empty throne seat (18_throne_idle.png!)
 * - 'on' / 'activate' / 'beam': Torn steps exposing massive circular dark-iron mega-cannon + twin tank cannons + blazing green/white beam core (19_throne_beam.png!)
 * - 'death': Shattered smoking iron wreckage leaking glowing rad coolant!
 */
function drawKrunkedThrone1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'off' | 'on' | 'activate' | 'beam' | 'death',
): void {
  const p = new PxCanvas(w, h);
  const cx = 48;
  const cy = 44;
  const pulse = (f & 1) === 0;

  if (mode === 'death') {
    p.ellipse(cx, cy + 16, 38, 16, '#1e6e24');
    p.ellipse(cx, cy + 16, 24, 10, '#58f048');
    p.rect(cx - 32, cy - 14, 64, 38, '#383034');
    p.rect(cx - 24, cy - 8, 48, 24, '#201a1e');
    p.rect(cx - 14, cy - 2, 28, 12, '#4a3838');
    p.ellipse(cx, cy + 4, 8, 5, '#68ff58');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const terra = '#743836';
  const terraHi = '#98504c';
  const terraDark = '#4a2022';
  const iron = '#6c747e';
  const ironHi = '#9ea8b4';
  const ironDark = '#3a404a';
  const carpet = '#a01f31';
  const carpetDark = '#721422';
  const gold = '#d8b85c';
  const rad = mode === 'beam' ? '#d4ffb8' : pulse ? '#84f418' : '#58d818';

  // Central terracotta throne superstructure & high throne armrests (top half)
  p.rect(cx - 24, cy - 42, 48, 38, terra);
  p.rect(cx - 22, cy - 42, 44, 3, terraHi);
  // Throne seat & armored dark-terracotta armrests with glowing green accents (18_throne_idle.png!)
  p.rect(cx - 18, cy - 38, 9, 24, terraDark);
  p.rect(cx + 9, cy - 38, 9, 24, terraDark);
  p.rect(cx - 16, cy - 26, 5, 6, '#58e828');
  p.rect(cx + 11, cy - 26, 5, 6, '#58e828');
  // Royal crimson seat cushion
  p.rect(cx - 9, cy - 36, 18, 22, '#5a1820');
  p.rect(cx - 7, cy - 34, 14, 16, carpet);
  p.rect(cx - 5, cy - 30, 10, 8, '#3a141a');

  // Twin massive green rad tanks aligned pixel-for-pixel with sprNothingBack (world X=-44/-22 & +22/+44, Y=-42..-8)!
  for (const side of [-1, 1]) {
    const tx = side < 0 ? cx - 44 : cx + 22;
    p.rect(tx, cy - 42, 22, 34, '#3ca810');
    p.rect(tx + 3, cy - 42, 16, 34, '#84f418');
    p.rect(tx + 7, cy - 42, 7, 34, '#d0ff68');
    p.rect(tx + 9, cy - 41, 3, 30, '#f0ffb8');
    // Front iron skull/cannon cap aligned cleanly at cy - 10!
    p.rect(tx - 1, cy - 10, 24, 10, iron);
    p.rect(tx + 1, cy - 9, 20, 3, ironHi);
    p.rect(tx - 1, cy - 3, 24, 3, ironDark);
    p.rect(tx + 2, cy - 8, 4, 3, '#8e4c34');
    p.rect(tx + 16, cy - 7, 4, 3, '#8e4c34');
    if (mode !== 'off') {
      // Heavy protruding dark-iron forward cannon barrel on awake (19_throne_beam.png!)
      p.rect(tx + 7, cy - 4, 8, 15, ironDark);
      p.rect(tx + 8, cy - 4, 5, 12, iron);
      p.rect(tx + 9, cy - 3, 2, 9, ironHi);
      p.rect(tx + 8, cy + 8, 6, 3, '#141820');
    } else {
      // Dormant skull vent
      p.rect(tx + 7, cy - 6, 8, 5, '#262a32');
      p.rect(tx + 8, cy - 5, 2, 2, '#101218');
      p.rect(tx + 12, cy - 5, 2, 2, '#101218');
    }
  }

  // Lower deck plates flanking center carpet/cannon (stop cleanly above front green pods at cy + 32!)
  p.rect(cx - 44, cy, 24, 32, terra);
  p.rect(cx + 20, cy, 24, 32, terra);
  p.rect(cx - 44, cy + 27, 24, 5, terraDark);
  p.rect(cx + 20, cy + 27, 24, 5, terraDark);
  p.rect(cx - 42, cy + 6, 20, 2, '#58e828');
  p.rect(cx + 22, cy + 6, 20, 2, '#58e828');

  if (mode === 'off') {
    // DORMANT (18_throne_idle.png): Intact royal crimson carpet & gold-trimmed stepped stairs!
    p.rect(cx - 19, cy - 14, 38, 56, carpet);
    p.rect(cx - 18, cy - 14, 1, 56, gold);
    p.rect(cx + 17, cy - 14, 1, 56, gold);
    p.rect(cx - 19, cy - 14, 38, 1, gold);
    // Subtle gold crest diamond at top of carpet
    p.poly([[cx, cy - 10], [cx + 5, cy - 5], [cx, cy], [cx - 5, cy - 5]], gold);
    p.poly([[cx, cy - 8], [cx + 3, cy - 5], [cx, cy - 2], [cx - 3, cy - 5]], carpet);
    // Stepped red stairs descending south
    for (let s = 0; s < 5; s++) {
      const sy = cy + 8 + s * 6;
      p.rect(cx - 19, sy, 38, 2, carpetDark);
      p.rect(cx - 18, sy + 2, 36, 1, '#c43648');
    }
  } else {
    // AWAKENED (19_throne_beam.png): Carpet torn open -> MASSIVE CIRCULAR IRON MEGA-CANNON!
    p.rect(cx - 20, cy - 14, 40, 52, '#241a1c');
    // Cracked dirt/rubble lip above barrel
    p.rect(cx - 18, cy - 14, 36, 6, '#5c3c28');
    p.rect(cx - 14, cy - 12, 8, 3, '#3c6e24');
    p.rect(cx + 6, cy - 12, 8, 3, '#3c6e24');
    // Colossal circular iron mega-cannon housing
    p.ellipse(cx, cy + 10, 18, 16, ironDark);
    p.ellipse(cx, cy + 8, 16, 14, iron);
    p.ellipse(cx - 2, cy + 4, 11, 8, ironHi);
    // Glowing inner barrel maw
    p.ellipse(cx, cy + 12, 12, 11, '#121814');
    p.ellipse(cx, cy + 12, 10, 9, '#289818');
    p.ellipse(cx, cy + 12, 7, 6, rad);
    if (mode === 'beam') {
      // Blazing nuclear mega-beam erupting straight down!
      p.rect(cx - 14, cy + 12, 28, 32, '#4ce818');
      p.rect(cx - 11, cy + 12, 22, 32, '#a4ff38');
      p.rect(cx - 8, cy + 12, 16, 32, '#ffffff');
      p.ellipse(cx, cy + 14, 10, 7, '#ffffff');
    } else if (mode === 'activate') {
      p.ellipse(cx, cy + 12, 9, 8, '#d8ffb8');
      p.rect(cx - 20, cy - 20, 40, 2, '#c8ff80');
    } else {
      p.ellipse(cx, cy + 12, 4, 3, '#ffffff');
    }
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawThroneII1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'hurt' | 'death' | 'appear',
): void {
  const p = new PxCanvas(w, h);
  const cx = 42;
  const cy = 42;
  const hurt = mode === 'hurt';
  const hull = hurt ? '#ffffff' : '#3a4654';
  const hullHi = hurt ? '#ffffff' : '#68788c';
  const hullDark = hurt ? '#d8d8d8' : '#1e242e';
  const rad = hurt ? '#e0ffe0' : (f % 2 === 0 ? '#68f438' : '#b8ff78');

  if (mode === 'death') {
    p.ellipse(cx, cy + 8, 28, 12, '#1c6824');
    p.ellipse(cx, cy + 8, 16, 7, rad);
    p.ellipse(cx, cy + 5, 14, 8, hullDark);
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const spread = (f & 1) === 0 ? 0 : 3;
  // Sweeping biomechanical wings with blazing neon-green energy veins
  for (const s of [-1, 1]) {
    p.poly([
      [cx + s * 8, cy - 12], [cx + s * (35 + spread), cy - 24],
      [cx + s * (31 + spread), cy - 6], [cx + s * 9, cy - 2],
    ], hull);
    p.line(cx + s * 11, cy - 10, cx + s * (32 + spread), cy - 18, rad, 2);
    p.line(cx + s * 12, cy - 10, cx + s * (30 + spread), cy - 18, '#ffffff', 1);
    p.poly([
      [cx + s * 8, cy - 2], [cx + s * (30 + spread), cy - 5],
      [cx + s * (25 + spread), cy + 7], [cx + s * 8, cy + 5],
    ], hullDark);
    p.line(cx + s * 10, cy + 2, cx + s * (25 + spread), cy + 3, rad, 2);
  }

  // Crowned dorsal spires + central armored core
  p.poly([[cx - 11, cy - 18], [cx - 8, cy - 32], [cx - 4, cy - 18]], hullHi);
  p.poly([[cx + 4, cy - 18], [cx + 8, cy - 32], [cx + 11, cy - 18]], hullHi);
  p.poly([[cx - 5, cy - 18], [cx, cy - 35], [cx + 5, cy - 18]], rad);
  p.ellipse(cx, cy, 17, 21, hull);
  p.ellipse(cx - 3, cy - 6, 11, 12, hullHi);

  // Blazing multi-ring nuclear cyclops core
  p.ellipse(cx, cy - 2, 12, 12, '#16581c');
  p.ellipse(cx, cy - 2, 9, 9, rad);
  p.ellipse(cx, cy - 2, 5, 5, '#ffffff');
  // Satellite eyes + trailing plasma tendrils
  for (const [ex, ey] of [[-11, -10], [8, -10], [-8, 12], [5, 12]] as const) {
    p.rect(cx + ex, cy + ey, 4, 3, rad);
    p.set(cx + ex + 1, cy + ey + 1, '#ffffff');
  }
  p.line(cx - 6, cy + 19, cx - 7, cy + 32 + (f & 1) * 3, rad, 2);
  p.line(cx, cy + 20, cx, cy + 35 - (f & 1) * 2, '#ffffff', 2);
  p.line(cx + 6, cy + 19, cx + 7, cy + 32 + (f & 1) * 3, rad, 2);

  p.outline(INK);
  p.flush(ctx, x, y);
}

export function registerAllEnemiesAndBosses(b: FallbackAtlasBuilder): void {
  // 1. ALL 5 CRISP NATIVE 1x BOSSES
  b.addSprite('sprBanditBossIdle', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprBanditBossWalk', 36, 36, 18, 18, 4, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprBanditBossHurt', 36, 36, 18, 18, 1, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprBanditBossDead', 36, 36, 18, 18, 6, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprBanditBossFire', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprBanditBossTell', 36, 36, 18, 18, 2, (ctx, x, y, w, h, f) => drawBigBandit1x(ctx, x, y, w, h, f, 'tell'));
  b.addAlias('sprBanditBossDash', 'sprBanditBossWalk');
  b.addSprite('sprBanditBossGun', 28, 12, 6, 6, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 22, 5, '#687482');
    p.rect(3, 3, 20, 1, '#a4b2c0');
    p.rect(12, 5, 11, 1, '#242a32');
    p.rect(17, 3, 2, 5, '#f5c838');
    p.rect(4, 7, 5, 4, '#88522c');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  b.addSprite('sprScrapBossIdle', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprScrapBossSleep', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'sleep'));
  b.addSprite('sprScrapBossWalk', 56, 56, 28, 28, 4, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprScrapBossHurt', 56, 56, 28, 28, 1, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprScrapBossDead', 56, 56, 28, 28, 6, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprScrapBossFire', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprScrapBossCharge', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'charge'));
  b.addSprite('sprScrapBossMissileIdle', 14, 8, 7, 4, 2, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 2, 3, 4, f === 0 ? '#ffe048' : '#ff6c1c');
    p.rect(3, 2, 8, 4, '#d84034');
    p.rect(4, 2, 6, 1, '#ff8878');
    p.rect(11, 3, 2, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  b.addSprite('sprLilHunter', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprLilHunterIdle', 'sprLilHunter');
  b.addSprite('sprLilHunterWalk', 28, 32, 14, 16, 4, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprLilHunterHurt', 28, 32, 14, 16, 1, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprLilHunterDead', 28, 32, 14, 16, 6, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprLilHunterLift', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'lift'));
  b.addSprite('sprLilHunterLand', 28, 32, 14, 16, 2, (ctx, x, y, w, h, f) => drawLilHunter1x(ctx, x, y, w, h, f, 'land'));
  b.addAlias('sprLilHunterFire', 'sprLilHunterLift');
  b.addAlias('sprLilHunterDash', 'sprLilHunterLift');
  b.addSprite('sprLilHunterGun', 22, 10, 5, 5, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 17, 4, '#3c74d8');
    p.rect(4, 4, 13, 1, '#84ecff');
    p.rect(3, 6, 4, 3, '#203c78');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // THE NUCLEAR THRONE: Full multi-layer composite + exact 96x88 core & 36x24x3 sprNothingBeam!
  b.addSprite('sprNothingBack', 168, 104, 84, 52, 1, (ctx, x, y, w, h) => drawThroneBack1x(ctx, x, y, w, h));
  b.addSprite('sprNothingPipes', 168, 104, 84, 52, 1, (ctx, x, y, w, h) => drawThronePipes1x(ctx, x, y, w, h));
  b.addSprite('sprNothingLeg', 44, 56, 10, 22, 10, (ctx, x, y, w, h, f) => drawThroneLeg1x(ctx, x, y, w, h, f));
  b.addSprite('sprNothingOff', 96, 88, 48, 44, 1, (ctx, x, y, w, h, f) => drawKrunkedThrone1x(ctx, x, y, w, h, f, 'off'));
  b.addSprite('sprNothingOn', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThrone1x(ctx, x, y, w, h, f, 'on'));
  b.addAlias('sprNothingIdle', 'sprNothingOn');
  b.addAlias('sprNothingWalk', 'sprNothingOn');
  b.addAlias('sprNothingHurt', 'sprNothingOn');
  b.addSprite('sprNothingActivate', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThrone1x(ctx, x, y, w, h, f, 'activate'));
  b.addSprite('sprNothingFire', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => drawKrunkedThrone1x(ctx, x, y, w, h, f, 'beam'));
  b.addSprite('sprNothingBeam', 36, 24, 18, 12, 3, (ctx, x, y, w, h, f) => {
    // Exact 36x24 vertical neon-green & white blazing beam segment (19_throne_beam.png!)
    const p = new PxCanvas(w, h);
    const shift = f === 1 ? 1 : f === 2 ? -1 : 0;
    p.rect(2, 0, w - 4, h, '#289c14');
    p.rect(4, 0, w - 8, h, '#58f028');
    p.rect(7 + shift, 0, w - 14, h, '#c4ff68');
    p.rect(10, 0, w - 20, h, '#f2fff0');
    p.rect(12 - shift, 0, w - 24, h, '#ffffff');
    // Streaming green plasma oval bubbles inside the white beam core
    const by = (f * 8) % h;
    p.rect(14 + shift, by, 4, Math.min(6, h - by), '#9cff38');
    p.rect(15 + shift, by + 1, 2, Math.min(4, Math.max(1, h - by - 2)), '#ffffff');
    p.flush(ctx, x, y);
  });
  b.addSprite('sprNothingDeath', 96, 88, 48, 44, 1, (ctx, x, y, w, h, f) => drawKrunkedThrone1x(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprNothingDead', 'sprNothingDeath');
  b.addAlias('sprNothingDash', 'sprNothingOn');

  b.addSprite('sprNothing2Idle', 84, 84, 42, 42, 2, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprNothing2Walk', 'sprNothing2Idle');
  b.addSprite('sprNothing2Hurt', 84, 84, 42, 42, 1, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprNothing2Death', 84, 84, 42, 42, 1, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprNothing2Dead', 'sprNothing2Death');
  b.addSprite('sprNothing2Appear', 84, 84, 42, 42, 2, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'appear'));
  b.addAlias('sprNothing2Fire', 'sprNothing2Appear');
  b.addAlias('sprNothing2Dash', 'sprNothing2Idle');

  // 2. ALL 45 REGULAR ENEMIES AT CRISP NATIVE 1x
  for (const def of Object.values(ENEMIES)) {
    if (def.isBoss) continue;
    const vis = getEnemyVisual(def);
    const ox = Math.floor(vis.sizeW / 2);
    const oy = Math.floor(vis.sizeH / 2);

    b.addSprite(def.sprites.idle, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
      drawRegularEnemy1x(ctx, x, y, w, h, vis, 'idle', f),
    );
    if (def.sprites.walk !== def.sprites.idle) {
      b.addSprite(def.sprites.walk, vis.sizeW, vis.sizeH, ox, oy, 4, (ctx, x, y, w, h, f) =>
        drawRegularEnemy1x(ctx, x, y, w, h, vis, 'walk', f),
      );
    }
    b.addSprite(def.sprites.hurt, vis.sizeW, vis.sizeH, ox, oy, 3, (ctx, x, y, w, h, f) =>
      drawRegularEnemy1x(ctx, x, y, w, h, vis, 'hurt', f),
    );
    b.addSprite(def.sprites.dead, vis.sizeW, vis.sizeH, ox, oy, 6, (ctx, x, y, w, h, f) =>
      drawRegularEnemy1x(ctx, x, y, w, h, vis, 'dead', f),
    );
    if (def.sprites.fire) {
      b.addSprite(def.sprites.fire, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemy1x(ctx, x, y, w, h, vis, 'fire', f),
      );
    }
    if (def.sprites.tell) {
      b.addSprite(def.sprites.tell, vis.sizeW, vis.sizeH, ox, oy, 2, (ctx, x, y, w, h, f) =>
        drawRegularEnemy1x(ctx, x, y, w, h, vis, 'tell', f),
      );
    }
    if (def.sprites.gun && !b.hasSprite(def.sprites.gun)) {
      if (def.id === 'raven') {
        b.addSprite(def.sprites.gun, 13, 6, 4, 3, 1, (ctx, x, y, w, h) => {
          const p = new PxCanvas(w, h);
          p.rect(1, 2, 4, 3, '#744c2c');
          p.rect(4, 2, 8, 2, '#5c6674');
          p.outline(INK);
          p.flush(ctx, x, y);
        });
      } else if (def.id === 'sniper') {
        b.addSprite(def.sprites.gun, 19, 7, 5, 4, 1, (ctx, x, y, w, h) => {
          const p = new PxCanvas(w, h);
          p.rect(1, 3, 5, 3, '#4c5450');
          p.rect(5, 3, 13, 2, '#5e6670');
          p.rect(7, 1, 5, 2, '#2a2e36');
          p.set(10, 1, '#ff3444');
          p.outline(INK);
          p.flush(ctx, x, y);
        });
      } else if (def.isIdpd) {
        b.addSprite(def.sprites.gun, 15, 7, 4, 4, 1, (ctx, x, y, w, h) => {
          const p = new PxCanvas(w, h);
          p.rect(2, 2, 11, 3, '#3c74c8');
          p.rect(3, 3, 9, 1, '#80ecff');
          p.rect(3, 4, 3, 2, '#203868');
          p.outline(INK);
          p.flush(ctx, x, y);
        });
      } else {
        b.addSprite(def.sprites.gun, 14, 7, 4, 4, 1, (ctx, x, y, w, h) => {
          const p = new PxCanvas(w, h);
          p.rect(1, 3, 4, 3, '#7c4c2a');
          p.rect(4, 2, 9, 3, '#7c8694');
          p.rect(5, 2, 7, 1, '#b4beca');
          p.outline(INK);
          p.flush(ctx, x, y);
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
