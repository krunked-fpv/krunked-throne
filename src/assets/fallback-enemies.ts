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
      return { shape: 'scorpion', sizeW: 32, sizeH: 28, body: '#d88838', bodyHi: '#f6b864', bodyDark: '#94521c', accent: '#58f048', eye: '#ffe848' };
    case 'gold_scorpion':
      return { shape: 'scorpion', sizeW: 34, sizeH: 30, body: '#f2c434', bodyHi: '#fff088', bodyDark: '#a87c14', accent: '#ff4830', eye: '#ff2828' };

    // Sewers
    case 'rat':
      return { shape: 'rat', sizeW: 18, sizeH: 14, body: '#948274', bodyHi: '#beb0a2', bodyDark: '#5e5046', accent: '#e0949c', eye: '#ff3c3c' };
    case 'green_rat':
      return { shape: 'rat', sizeW: 16, sizeH: 12, body: '#58b048', bodyHi: '#8ee078', bodyDark: '#327228', accent: '#dcff68', eye: '#ffea48' };
    case 'big_rat':
      return { shape: 'ratking', sizeW: 36, sizeH: 34, body: '#5a8e4c', bodyHi: '#88c074', bodyDark: '#34582a', accent: '#b8ff48', eye: '#ff3c3c' };
    case 'gator':
      return { shape: 'gator', sizeW: 22, sizeH: 22, body: '#4c9448', bodyHi: '#7cc874', bodyDark: '#2c6028', accent: '#d8c688', eye: '#ffe848' };
    case 'buff_gator':
      return { shape: 'gator', sizeW: 28, sizeH: 26, body: '#3a7c40', bodyHi: '#64b068', bodyDark: '#204e24', accent: '#e05838', eye: '#ff4242' };
    case 'ballguy':
      return { shape: 'ballguy', sizeW: 20, sizeH: 20, body: '#74c444', bodyHi: '#b0f074', bodyDark: '#427e22', accent: '#e0ff58', eye: INK };
    case 'fireballer':
      return { shape: 'ballguy', sizeW: 22, sizeH: 22, body: '#e85824', bodyHi: '#ffa048', bodyDark: '#9a2810', accent: '#fff468', eye: '#ffffff' };

    // Scrapyard: dark hooded Snipers, jet-black Ravens, olive/fiery Salamanders
    case 'raven':
      return { shape: 'raven', sizeW: 22, sizeH: 20, body: '#282832', bodyHi: '#4c4e5e', bodyDark: '#14141a', accent: '#d4cec0', eye: '#ff3c38' };
    case 'sniper':
      return { shape: 'sniper', sizeW: 20, sizeH: 20, body: '#82868e', bodyHi: '#aeb2ba', bodyDark: '#52565e', accent: '#805a3e', eye: '#ff2834' };
    case 'salamander':
      return { shape: 'salamander', sizeW: 34, sizeH: 28, body: '#7c8a44', bodyHi: '#a8b868', bodyDark: '#4c5626', accent: '#e85824', eye: '#ffe848' };
    case 'assassin':
      return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#4a4658', bodyHi: '#747088', bodyDark: '#282434', accent: '#e0e6ee', eye: '#ffffff' };
    case 'jungle_assassin':
      return { shape: 'assassin', sizeW: 18, sizeH: 18, body: '#2e6434', bodyHi: '#58985c', bodyDark: '#1a3e1e', accent: '#b8f078', eye: '#ffe848' };

    // Crystal Caves: brown/orange Spiders (#9a5a2c), tall glowing cyan/orange Laser Crystals (36x40!)
    case 'spider':
      return { shape: 'spider', sizeW: 22, sizeH: 20, body: '#9a5a2c', bodyHi: '#cc824a', bodyDark: '#5e3214', accent: '#e88a38', eye: '#ff8828' };
    case 'laser_crystal':
      return { shape: 'crystal', sizeW: 36, sizeH: 40, body: '#48c8e8', bodyHi: '#a4f4ff', bodyDark: '#20789c', accent: '#ff8c28', eye: '#ffffff' };
    case 'lightning_crystal':
      return { shape: 'crystal', sizeW: 36, sizeH: 40, body: '#48a0f0', bodyHi: '#9cd8ff', bodyDark: '#2058a0', accent: '#fff048', eye: '#ffffff' };

    // Frozen City: hulking Snowbots (34x34), Wolves (34x28), wide Snow Tanks (38x34)!
    case 'snowbot':
      return { shape: 'snowbot', sizeW: 34, sizeH: 34, body: '#8c623a', bodyHi: '#ba8856', bodyDark: '#583a1e', accent: '#949ea8', eye: '#ff2e28' };
    case 'wolf':
      return { shape: 'wolf', sizeW: 34, sizeH: 28, body: '#9a948c', bodyHi: '#c8c2ba', bodyDark: '#686058', accent: '#7c5c40', eye: '#ff3838' };
    case 'snow_tank':
      return { shape: 'tank', sizeW: 38, sizeH: 34, body: '#a4aeb8', bodyHi: '#d4dce4', bodyDark: '#68727c', accent: '#9a5a32', eye: '#ff3c28' };
    case 'gold_snow_tank':
      return { shape: 'tank', sizeW: 38, sizeH: 34, body: '#f0c034', bodyHi: '#fff088', bodyDark: '#a67c14', accent: '#c86024', eye: '#ff2828' };

    // Labs: hunched olive/yellow Freaks, towering Rhino Freaks (36x34), purple Necromancers
    case 'freak':
      return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#94a068', bodyHi: '#c2ce94', bodyDark: '#5e683e', accent: '#cc3840', eye: '#f4ff88' };
    case 'rhino_freak':
      return { shape: 'rhino', sizeW: 36, sizeH: 34, body: '#6c8260', bodyHi: '#98b28a', bodyDark: '#405238', accent: '#f0e8d8', eye: '#ff3c3c' };
    case 'explo_freak':
      return { shape: 'freak', sizeW: 18, sizeH: 18, body: '#b8d048', bodyHi: '#e4f884', bodyDark: '#748a24', accent: '#ff5828', eye: '#fff470' };
    case 'necromancer':
      return { shape: 'necro', sizeW: 18, sizeH: 20, body: '#70449c', bodyHi: '#a470d4', bodyDark: '#422264', accent: '#58ff68', eye: '#98ff88' };
    case 'turret':
      return { shape: 'turret', sizeW: 18, sizeH: 18, body: '#a8b8c8', bodyHi: '#d8e4f0', bodyDark: '#647484', accent: '#f5c838', eye: '#ff3444' };

    // Palace: tall glowing spectral Guardians (36x44) & hulking Guardian Dogs (48x44)!
    case 'guardian':
      return { shape: 'guardian', sizeW: 36, sizeH: 44, body: '#58f048', bodyHi: '#c0ff90', bodyDark: '#249820', accent: '#98ff60', eye: '#ffffff' };
    case 'explo_guardian':
      return { shape: 'guardian', sizeW: 36, sizeH: 44, body: '#b8ff38', bodyHi: '#f4ff98', bodyDark: '#64a818', accent: '#ffff88', eye: '#ffffff' };
    case 'crown_guardian':
      return { shape: 'guardian', sizeW: 36, sizeH: 44, body: '#48b898', bodyHi: '#8cf0d4', bodyDark: '#246e5a', accent: '#f8cc40', eye: '#ffffff' };
    case 'guardian_dog':
      return { shape: 'dog_guardian', sizeW: 48, sizeH: 44, body: '#3ca844', bodyHi: '#80ee78', bodyDark: '#1e6426', accent: '#a8ff78', eye: '#ffffff' };

    // Oasis & Secret Biomes: vibrant purple-blue Oasis Fish (#6854a8) & green-shelled Barrel Crab/Turtle!
    case 'molefish':
      return { shape: 'molefish', sizeW: 22, sizeH: 18, body: '#6854a8', bodyHi: '#9884dc', bodyDark: '#3e2e74', accent: '#c8c4dc', eye: '#ff4838' };
    case 'turtle':
      return { shape: 'turtle', sizeW: 22, sizeH: 20, body: '#489840', bodyHi: '#7cd06c', bodyDark: '#286024', accent: '#7c4c3c', eye: '#ffe848' };

    // IDPD: cobalt-blue armor (#3b70c4) & massive armored ram IDPD Van (76x48)!
    case 'idpd_grunt':
      return { shape: 'idpd', sizeW: 18, sizeH: 18, body: '#3b70c4', bodyHi: '#6ca0f0', bodyDark: '#204484', accent: '#f5d038', eye: '#78f0ff' };
    case 'idpd_inspector':
      return { shape: 'idpd', sizeW: 18, sizeH: 20, body: '#4882e0', bodyHi: '#84b8ff', bodyDark: '#244e98', accent: '#ffe048', eye: '#b4f8ff' };
    case 'idpd_shielder':
      return { shape: 'idpd', sizeW: 22, sizeH: 22, body: '#3060b4', bodyHi: '#6294e8', bodyDark: '#1a3874', accent: '#80ecff', eye: '#d4faff' };
    case 'idpd_van':
      return { shape: 'van', sizeW: 76, sizeH: 48, body: '#3064c4', bodyHi: '#6498f0', bodyDark: '#1c3c80', accent: '#edf6ff', eye: '#ff3c4c' };

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
      // Upscaled 32x28 / 34x30 Desert & Gold Scorpion with arched stinger tail, venom sac & heavy pincers!
      for (let i = -2; i <= 2; i++) {
        const lx = cx - 2 + i * 3;
        const off = i % 2 === 0 ? stride : -stride;
        p.line(lx, ty + 5, lx + off - 1, ty + 10, bodyDark, 2);
        p.set(lx + off - 1, ty + 11, boot);
      }
      // Tall curved segmented stinger tail arching overhead!
      p.rect(cx - 12, ty - 7, 4, 10, bodyDark);
      p.rect(cx - 11, ty - 11, 11, 4, body);
      p.rect(cx - 9, ty - 11, 8, 2, bodyHi);
      p.rect(cx - 8, ty - 11, 1, 4, bodyDark);
      p.rect(cx - 4, ty - 11, 1, 4, bodyDark);
      // Glowing bulbous venom sac + needle stinger!
      p.ellipse(cx + 2, ty - 9, 4, 3.5, state === 'fire' ? '#ffffff' : acc);
      p.set(cx + 1, ty - 10, '#ffffff');
      p.poly([[cx + 5, ty - 9], [cx + 10, ty - 7], [cx + 5, ty - 6]], '#ffffff');
      // Broad armored segmented carapace
      p.ellipse(cx - 1, ty + 3, 9, 5.5, body);
      p.ellipse(cx - 3, ty + 1, 6, 2.5, bodyHi);
      p.rect(cx - 5, ty, 1, 6, bodyDark);
      p.rect(cx - 1, ty, 1, 6, bodyDark);
      p.rect(cx + 3, ty, 1, 6, bodyDark);
      // Huge snapping front pincers!
      p.rect(cx + 6, ty - 2, 7, 3, body);
      p.rect(cx + 8, ty - 2, 5, 1, bodyHi);
      p.rect(cx + 6, ty + 4, 7, 3, bodyDark);
      p.rect(cx + 5, ty + 1, 2, 2, eye);
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
      // Upscaled 36x34 bloated Sewer Rat King with ragged ears, scarred hide & glowing lime drool!
      p.rect(cx - 9 + stride, ty + 9, 4, 4, boot);
      p.rect(cx + 5 - stride, ty + 9, 4, 4, boot);
      p.ellipse(cx - 10, ty - 9, 4.5, 4.5, bodyDark);
      p.ellipse(cx - 10, ty - 9, 2.5, 2.5, '#a8646e');
      p.ellipse(cx + 10, ty - 9, 4.5, 4.5, bodyDark);
      p.ellipse(cx + 10, ty - 9, 2.5, 2.5, '#a8646e');
      p.ellipse(cx, ty + 1, 14, 11, body);
      p.ellipse(cx - 3, ty - 3, 9, 5.5, bodyHi);
      p.ellipse(cx + 4, ty + 6, 9, 5, bodyDark);
      // Glaring crimson eyes & wrinkled snout
      p.rect(cx - 8, ty - 5, 4, 4, INK);
      p.rect(cx + 4, ty - 5, 4, 4, INK);
      p.rect(cx - 7, ty - 4, 3, 3, eye);
      p.rect(cx + 5, ty - 4, 3, 3, eye);
      p.set(cx - 7, ty - 4, '#ffffff');
      p.set(cx + 5, ty - 4, '#ffffff');
      // Wide toxic foaming jaw & crooked fangs!
      p.rect(cx - 8, ty + 2, 16, 6, INK);
      p.rect(cx - 7, ty + 3, 14, 4, state === 'fire' ? '#eeff80' : acc);
      p.rect(cx - 4, ty + 4, 8, 2, '#ffffff');
      p.rect(cx - 6, ty + 2, 2, 2, '#ffffff');
      p.rect(cx + 4, ty + 2, 2, 2, '#ffffff');
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
      // Upscaled 34x28 fiery Scrapyard Salamander with curled tail, magma back spots & flame maw!
      p.line(cx - 14, ty + 4 + (frame & 1), cx - 8, ty + 2, bodyDark, 3);
      p.rect(cx - 8 + stride, ty + 6, 3, 4, bodyDark);
      p.rect(cx + 3 - stride, ty + 6, 3, 4, bodyDark);
      p.ellipse(cx, ty + 1, 11, 6.5, body);
      p.ellipse(cx - 2, ty - 2, 8, 3, bodyHi);
      // Glowing magma back spots & fiery throat sac
      p.ellipse(cx - 5, ty - 1, 2.5, 2, acc);
      p.ellipse(cx + 1, ty - 2, 2.5, 2, acc);
      p.ellipse(cx + 6, ty + 3, 4, 2.5, acc);
      // Wide blunt lizard head & glowing eye
      p.ellipse(cx + 9, ty - 1, 5, 4.5, body);
      p.rect(cx + 7, ty - 4, 3, 3, eye);
      p.set(cx + 8, ty - 3, INK);
      if (state === 'fire') {
        p.ellipse(cx + 13, ty, 4, 3.5, '#ff781c');
        p.ellipse(cx + 13, ty, 2, 2, '#fff498');
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
      // Upscaled 36x40 towering faceted Laser/Lightning Crystal monolith!
      // Flanking crystal shards
      p.poly([[cx - 10, ty + 10], [cx - 15, ty - 2], [cx - 8, ty - 6], [cx - 6, ty + 12]], bodyDark);
      p.poly([[cx + 10, ty + 10], [cx + 15, ty - 2], [cx + 8, ty - 6], [cx + 6, ty + 12]], bodyDark);
      // Towering main faceted crystal spire
      p.poly([[cx, ty - 17], [cx + 12, ty - 2], [cx + 9, ty + 16], [cx - 9, ty + 16], [cx - 12, ty - 2]], body);
      p.poly([[cx, ty - 16], [cx - 11, ty - 2], [cx - 8, ty + 15], [cx, ty + 15]], bodyHi);
      p.poly([[cx, ty - 16], [cx - 6, ty - 4], [cx, ty]], '#ffffff');
      p.poly([[cx, ty - 16], [cx + 11, ty - 2], [cx + 8, ty + 15], [cx, ty + 15]], bodyDark);
      p.line(cx, ty - 15, cx, ty + 15, '#ffffff', 1);
      // Blazing inner diamond core!
      p.poly([[cx, ty - 7], [cx + 6, ty], [cx, ty + 7], [cx - 6, ty]], state === 'fire' ? '#ffffff' : acc);
      p.poly([[cx, ty - 3], [cx + 3, ty], [cx, ty + 3], [cx - 3, ty]], eye);
      break;
    }

    case 'snowbot': {
      // Upscaled 34x34 hulking Frozen City Snowbot yeti-mech!
      p.rect(cx - 8 + stride, ty + 9, 5, 5, '#525a64');
      p.rect(cx + 3 - stride, ty + 9, 5, 5, '#525a64');
      // Huge steel arms & shaggy brown fists
      p.rect(cx - 14, ty - 3 + stride, 6, 9, acc);
      p.rect(cx - 14, ty + 4 + stride, 6, 5, body);
      p.rect(cx + 8, ty - 3 - stride, 6, 9, acc);
      p.rect(cx + 8, ty + 4 - stride, 6, 5, body);
      // Heavy riveted steel chestplate torso
      p.rect(cx - 9, ty - 4, 18, 13, acc);
      p.rect(cx - 8, ty - 3, 16, 3, '#c8d2dc');
      p.rect(cx - 7, ty + 5, 14, 3, '#5c6672');
      p.set(cx - 7, ty - 1, '#323842');
      p.set(cx + 6, ty - 1, '#323842');
      // Thick shaggy brown fur mantle around shoulders & neck!
      p.ellipse(cx, ty - 6, 12, 7, body);
      p.rect(cx - 10, ty - 10, 20, 4, bodyHi);
      p.poly([[cx - 11, ty - 8], [cx - 10, ty - 14], [cx - 6, ty - 9]], body);
      p.poly([[cx + 11, ty - 8], [cx + 10, ty - 14], [cx + 6, ty - 9]], body);
      // Steel cyclops head nested in fur + blazing crimson cyclops eye!
      p.rect(cx - 5, ty - 12, 10, 9, acc);
      p.rect(cx - 4, ty - 12, 8, 3, '#d8e0e8');
      p.rect(cx - 3, ty - 9, 6, 4, INK);
      p.rect(cx - 2, ty - 8, 4, 2, state === 'fire' ? '#ffe448' : eye);
      p.set(cx - 1, ty - 8, '#ffffff');
      break;
    }

    case 'wolf': {
      // Upscaled 34x28 Arctic Wolf with dorsal mounted sniper rifle!
      p.line(cx - 14, ty - 1 + (frame & 1), cx - 8, ty + 2, bodyDark, 3);
      // 4 muscular running legs
      p.rect(cx - 10 + stride, ty + 4, 3, 7, bodyDark);
      p.rect(cx - 4 - stride, ty + 4, 3, 7, boot);
      p.rect(cx + 3 - stride, ty + 4, 3, 7, bodyDark);
      p.rect(cx + 8 + stride, ty + 4, 3, 7, boot);
      // Lean wolf torso with warm brown fur saddle patch
      p.ellipse(cx - 1, ty + 1, 10, 5, body);
      p.rect(cx - 8, ty - 3, 10, 5, acc);
      p.rect(cx - 7, ty - 4, 13, 2, bodyHi);
      // Mounted dark steel dorsal sniper cannon + scope!
      p.rect(cx - 5, ty - 10, 14, 3, '#282c34');
      p.rect(cx - 4, ty - 10, 12, 1, '#687484');
      p.rect(cx - 2, ty - 7, 3, 3, '#444c58');
      p.set(cx + 3, ty - 11, '#ff3838');
      // Sharp wolf head, pointed ears & snarling snout
      p.rect(cx + 6, ty - 6, 7, 7, body);
      p.rect(cx + 10, ty - 3, 5, 4, bodyHi);
      p.poly([[cx + 6, ty - 6], [cx + 7, ty - 10], [cx + 9, ty - 6]], bodyDark);
      p.poly([[cx + 9, ty - 6], [cx + 11, ty - 10], [cx + 12, ty - 6]], bodyDark);
      p.rect(cx + 9, ty - 5, 2, 2, eye);
      break;
    }

    case 'tank': {
      // Upscaled 38x34 wide domed silver/gold Snow Tank saucer walker!
      // 4 heavy articulated armored walker legs
      p.line(cx - 11, ty + 2, cx - 16, ty + 12 + stride, '#282c34', 3);
      p.line(cx - 6, ty + 3, cx - 9, ty + 13 - stride, '#3c424c', 3);
      p.line(cx + 6, ty + 3, cx + 9, ty + 13 + stride, '#3c424c', 3);
      p.line(cx + 11, ty + 2, cx + 16, ty + 12 - stride, '#282c34', 3);
      // Dark armored undercarriage + glowing red cannon eye
      p.rect(cx - 12, ty + 1, 24, 6, '#24262e');
      p.ellipse(cx, ty + 5, 4, 3.5, eye);
      p.rect(cx - 2, ty + 3, 2, 2, '#fff088');
      // Wide domed steel/gold saucer top + rust/armor streaks!
      p.ellipse(cx, ty - 4, 16, 9, body);
      p.ellipse(cx - 3, ty - 7, 11, 4.5, bodyHi);
      p.rect(cx - 15, ty - 2, 30, 3, bodyDark);
      p.rect(cx - 10, ty - 5, 6, 4, acc);
      p.rect(cx + 5, ty - 6, 6, 3, acc);
      p.rect(cx - 14, ty - 4, 28, 1, bodyDark);
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
      // Upscaled 36x34 colossal hulking Lab Rhino Freak with giant curved ivory horn!
      p.rect(cx - 10 + stride, ty + 8, 6, 6, boot);
      p.rect(cx + 4 - stride, ty + 8, 6, 6, boot);
      p.ellipse(cx - 1, ty, 13, 11, body);
      p.ellipse(cx - 4, ty - 4, 9, 5, bodyHi);
      p.rect(cx - 12, ty + 4, 24, 5, bodyDark);
      // Huge curved ivory horn erupting forward!
      p.poly([[cx + 6, ty - 3], [cx + 16, ty - 13], [cx + 14, ty + 1], [cx + 6, ty + 2]], acc);
      p.poly([[cx + 8, ty - 3], [cx + 15, ty - 11], [cx + 12, ty - 2]], '#ffffff');
      // Fierce sunken red eye & scarred brow
      p.rect(cx + 2, ty - 6, 4, 3, INK);
      p.rect(cx + 3, ty - 5, 2, 2, eye);
      p.rect(cx - 8, ty - 2, 6, 2, bodyDark);
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
      // Upscaled 36x44 towering luminous Palace / Crown / Explo Guardian wraith with sweeping ethereal robes!
      const sway = frame % 2 === 0 ? -2 : 2;
      const fire = state === 'fire' || state === 'tell';
      // Towering curved twin flame-horns curling upward from crown!
      p.poly([[cx - 8, ty - 8], [cx - 12 + sway, ty - 19], [cx - 4, ty - 13]], bodyHi);
      p.poly([[cx + 8, ty - 8], [cx + 12 - sway, ty - 19], [cx + 4, ty - 13]], bodyHi);
      p.rect(cx - 12 + sway, ty - 20, 2, 2, acc);
      p.rect(cx + 11 - sway, ty - 20, 2, 2, acc);
      // Cowl & hood
      p.ellipse(cx, ty - 9, 9, 7, body);
      p.ellipse(cx, ty - 11, 6, 4, bodyHi);
      // Tall flowing ethereal tattered spectral robe!
      p.poly([
        [cx - 10, ty - 6],
        [cx + 10, ty - 6],
        [cx + 12, ty + 6],
        [cx + 9 + sway, ty + 17],
        [cx + 4, ty + 11],
        [cx, ty + 18],
        [cx - 4, ty + 12],
        [cx - 9 - sway, ty + 17],
        [cx - 12, ty + 6],
      ], body);
      p.poly([[cx - 10, ty], [cx - 6, ty + 14], [cx - 10, ty + 16]], bodyDark);
      p.poly([[cx + 10, ty], [cx + 6, ty + 14], [cx + 10, ty + 16]], bodyDark);
      p.rect(cx - 5, ty - 5, 10, 14, bodyHi);
      p.rect(cx - 2, ty - 3, 4, 12, fire ? '#ffffff' : acc);
      // Flowing spectral sleeves / wisps
      p.line(cx - 10, ty - 2, cx - 15, ty + 4 + sway, body, 2);
      p.line(cx + 10, ty - 2, cx + 15, ty + 4 - sway, body, 2);
      // Deep sunken dark eye cavities + glowing inner slits
      p.rect(cx - 6, ty - 11, 5, 4, '#0e2810');
      p.rect(cx + 1, ty - 11, 5, 4, '#0e2810');
      p.rect(cx - 5, ty - 10, 3, 2, fire ? '#ffffff' : bodyHi);
      p.rect(cx + 2, ty - 10, 3, 2, fire ? '#ffffff' : bodyHi);
      // Radiant chest orb
      if (fire) {
        p.ellipse(cx, ty + 2, 5, 5, '#ffffff');
      } else {
        p.ellipse(cx, ty + 2, 3, 4, '#e8ffc0');
      }
      // Orbiting crackling rad flecks
      p.rect(cx - 15, ty - 10 - sway, 2, 2, acc);
      p.rect(cx + 13, ty - 7 + sway, 2, 2, acc);
      break;
    }

    case 'dog_guardian': {
      // Upscaled 48x44 colossal hunched emerald Palace Guardian Dog with blazing rad mane & jagged fangs!
      // Massive clawed limbs
      p.rect(cx - 15 + stride * 2, ty + 8, 7, 9, bodyDark);
      p.rect(cx - 15 + stride * 2, ty + 14, 7, 3, INK);
      p.rect(cx + 8 - stride * 2, ty + 8, 7, 9, bodyDark);
      p.rect(cx + 8 - stride * 2, ty + 14, 7, 3, INK);
      // Towering spiked neon-green dorsal rad mane crest!
      p.poly([[cx - 15, ty - 4], [cx - 19, ty - 15], [cx - 8, ty - 9]], bodyHi);
      p.poly([[cx - 7, ty - 9], [cx - 5, ty - 19], [cx + 2, ty - 10]], acc);
      p.poly([[cx + 2, ty - 9], [cx + 7, ty - 18], [cx + 11, ty - 7]], bodyHi);
      p.poly([[cx + 10, ty - 5], [cx + 18, ty - 13], [cx + 15, ty - 2]], bodyHi);
      // Massive hunched muscular beast torso
      p.ellipse(cx, ty, 18, 12, body);
      p.ellipse(cx - 4, ty - 4, 12, 6, bodyHi);
      p.ellipse(cx + 5, ty + 5, 11, 6, bodyDark);
      // Fierce brow & glaring radiant eyes
      p.rect(cx - 10, ty - 7, 7, 5, '#0b220e');
      p.rect(cx + 3, ty - 7, 7, 5, '#0b220e');
      p.rect(cx - 8, ty - 6, 4, 3, state === 'fire' ? '#ffffff' : acc);
      p.rect(cx + 5, ty - 6, 4, 3, state === 'fire' ? '#ffffff' : acc);
      // Enormous snarling jaw with gleaming razor fangs!
      p.rect(cx - 11, ty + 2, 22, 7, '#0c1e0e');
      p.rect(cx - 8, ty + 4, 16, 3, '#1f6420');
      for (let fx = -9; fx <= 7; fx += 4) {
        p.poly([[cx + fx, ty + 2], [cx + fx + 3, ty + 2], [cx + fx + 1, ty + 6]], '#ffffff');
      }
      p.rect(cx - 6, ty + 7, 2, 2, '#ffffff');
      p.rect(cx + 4, ty + 7, 2, 2, '#ffffff');
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
      // Upscaled 76x48 terrifying armored I.D.P.D. battering-ram Van!
      if (state === 'tell') {
        // Van emerging from dimensional blue portal rift!
        p.ellipse(cx, ty, 28, 20, '#1c4498');
        p.ellipse(cx, ty, 22, 15, '#3898ff');
        p.ellipse(cx, ty, 13, 9, '#b4f4ff');
        p.ellipse(cx, ty, 6, 4, '#ffffff');
        break;
      }
      // Heavy armored tires / wheel wells peeking at top & bottom
      p.rect(cx - 26, ty - 18, 12, 4, '#1a1c24');
      p.rect(cx + 14, ty - 18, 12, 4, '#1a1c24');
      p.rect(cx - 26, ty + 14, 12, 4, '#1a1c24');
      p.rect(cx + 14, ty + 14, 12, 4, '#1a1c24');
      // Heavy armored cobalt van hull + beveled roof + dark steel lower chassis
      p.rect(cx - 32, ty - 15, 62, 30, body);
      p.rect(cx - 30, ty - 15, 58, 5, bodyHi);
      p.rect(cx - 32, ty + 10, 62, 5, bodyDark);
      // Heavy reinforced front steel battering-ram bumper & grille on right!
      p.rect(cx + 28, ty - 14, 6, 28, '#5a6674');
      p.rect(cx + 30, ty - 13, 3, 26, '#9ca8b8');
      p.rect(cx + 32, ty - 11, 2, 5, '#ffe848'); // bright headlights
      p.rect(cx + 32, ty + 6, 2, 5, '#ffe848');
      // Bold white I.D.P.D. stripe & roof insignia
      p.rect(cx - 30, ty - 2, 44, 5, acc);
      p.rect(cx - 26, ty - 1, 36, 2, '#ffffff');
      p.rect(cx - 20, ty - 9, 14, 4, bodyDark); // roof vents
      p.rect(cx - 20, ty + 5, 14, 4, bodyDark);
      // Wide slanted armored cyan windshield
      p.poly([[cx + 12, ty - 11], [cx + 25, ty - 9], [cx + 25, ty + 9], [cx + 12, ty + 11]], '#285c94');
      p.poly([[cx + 14, ty - 9], [cx + 23, ty - 7], [cx + 23, ty + 7], [cx + 14, ty + 9]], '#78e8ff');
      p.line(cx + 15, ty - 6, cx + 21, ty + 4, '#ffffff', 2);
      // Flashing red/blue police siren lightbar across roof!
      p.rect(cx + 1, ty - 12, 7, 24, '#242a36');
      p.rect(cx + 2, ty - 11, 5, 9, frame % 2 === 0 ? '#ff3848' : '#38a8ff');
      p.rect(cx + 3, ty - 9, 3, 5, '#ffffff');
      p.rect(cx + 2, ty + 2, 5, 9, frame % 2 === 0 ? '#38a8ff' : '#ff3848');
      p.rect(cx + 3, ty + 4, 3, 5, '#ffffff');
      // Open rear deployment doors when state === 'fire' (sprVanOpen)!
      if (state === 'fire') {
        p.rect(cx - 34, ty - 10, 10, 20, '#101420');
        p.rect(cx - 32, ty - 8, 6, 16, '#2868c8');
        p.poly([[cx - 32, ty - 15], [cx - 36, ty - 22], [cx - 26, ty - 15]], bodyHi);
        p.poly([[cx - 32, ty + 15], [cx - 36, ty + 22], [cx - 26, ty + 15]], bodyDark);
      }
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
 * BIG DOG (72x68, orig 36,34 — Tier 2 Scale Upgrade!)
 * Massive wide boxy/domed weathered steel & tan spider-walker tank with serrated waist rim,
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
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const hurt = mode === 'hurt';
  const sleep = mode === 'sleep';

  if (mode === 'dead') {
    p.ellipse(cx, cy + 10, 29, 13, '#2a2224');
    p.ellipse(cx, cy + 7, 23, 9, '#443a3a');
    p.rect(cx - 14, cy + 3, 28, 7, '#5a4a42');
    p.ellipse(cx, cy + 8, 6, 4, '#6c1c1e');
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
  const bob = sleep ? 3 : mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f & 1);
  const legOff = sleep ? 0 : mode === 'walk' ? (f % 2 === 0 ? 3 : -3) : 0;
  const ty = cy + bob;

  // 4 Massive articulated armored iron spider-walker legs!
  for (const [sx, oy, sh] of [[-1, -10, legOff], [1, -10, -legOff], [-1, 8, -legOff], [1, 8, legOff]] as const) {
    const hx = cx + sx * 18;
    const hy = ty + oy;
    const kx = cx + sx * (sleep ? 23 : 27);
    const ky = ty + oy + sh;
    const fx = cx + sx * (sleep ? 25 : 30);
    const fy = ky + (sleep ? 6 : 11);
    p.line(hx, hy, kx, ky, domeDark, 4);
    p.line(hx, hy - 1, kx, ky - 1, domeHi, 1);
    p.line(kx, ky, fx, fy, '#3a404a', 4);
    p.rect(fx - 4, fy - 2, 8, 5, '#242830');
    p.rect(fx - 3, fy - 1, 6, 2, '#5a6270');
  }

  // Lower tank hull & central armored skirt
  p.ellipse(cx, ty + 6, 27, 16, hullDark);
  p.ellipse(cx, ty + 3, 26, 15, hull);

  // Twin side boxy missile launchers / gatling pods!
  p.rect(cx - 33, ty - 7, 12, 14, domeDark);
  p.rect(cx - 32, ty - 6, 10, 4, gold);
  p.rect(cx - 31, ty, 8, 5, '#282c34');
  p.rect(cx + 21, ty - 7, 12, 14, domeDark);
  p.rect(cx + 22, ty - 6, 10, 4, gold);
  p.rect(cx + 23, ty, 8, 5, '#282c34');

  // Iconic colossal rounded saucer-dome roof with weathered rust streaks!
  p.ellipse(cx, ty - 5, 27, 15, dome);
  p.ellipse(cx - 4, ty - 9, 18, 8, domeHi);
  if (!hurt) {
    p.rect(cx - 18, ty - 9, 9, 5, rust);
    p.rect(cx + 8, ty - 8, 10, 4, rust);
    p.rect(cx - 5, ty - 3, 11, 4, rust);
    p.rect(cx - 24, ty - 4, 48, 1, domeDark);
    p.rect(cx, ty - 18, 1, 15, domeDark);
    for (const rx of [-20, -10, 10, 20]) p.set(cx + rx, ty - 6, domeDark);
  }

  // Serrated saw-tooth waist rim (blazes bright yellow/gold when spinning & firing!)
  if (mode === 'fire') {
    p.rect(cx - 27, ty + 1, 54, 8, '#e8a824');
    p.rect(cx - 25, ty + 2, 50, 4, '#fff078');
    p.rect(cx - 21, ty + 3, 42, 2, '#ffffff');
  }
  for (let tx = -24; tx <= 24; tx += 6) {
    const shift = mode === 'fire' ? (f % 2 === 0 ? 2 : -2) : 0;
    p.poly([[cx + tx + shift - 2, ty + 2], [cx + tx + shift, ty - 2], [cx + tx + shift + 2, ty + 2]], domeHi);
  }

  // Central cyclops targeting cannon eye (shuttered asleep when sleep!)
  p.ellipse(cx, ty + 7, 9, 7.5, '#1c1820');
  if (sleep) {
    p.rect(cx - 7, ty + 4, 14, 5, '#3c2e34');
    p.rect(cx - 7, ty + 7, 14, 1, INK);
  } else {
    const eyeCol = mode === 'charge' ? '#ffe048' : '#ff3428';
    p.ellipse(cx, ty + 7, 6.5, 5, eyeCol);
    p.rect(cx - 3, ty + 4, 4, 3, '#ffffff');
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

/**
 * THRONE II (112x112, orig 56,56 — Bug #17 & Tier 2 Scale Upgrade!)
 * Iconic towering winged & tentacled biomechanical nuclear portal-core silhouette:
 * massive sweeping multi-tiered energy wings, dark crowned armored chassis,
 * blazing swirling emerald-white portal heart, and writhing lower energy tentacles!
 */
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
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const hurt = mode === 'hurt';
  const hull = hurt ? '#ffffff' : '#3a4452';
  const hullHi = hurt ? '#ffffff' : '#708094';
  const hullDark = hurt ? '#d8d8d8' : '#1d222c';
  const terra = hurt ? '#ffe8e8' : '#6e3438';
  const rad = hurt ? '#e0ffe0' : (f % 2 === 0 ? '#68f438' : '#b8ff78');
  const radDark = hurt ? '#b8ffb8' : '#24881c';

  if (mode === 'death') {
    p.ellipse(cx, cy + 12, 38, 16, '#1a5c22');
    p.ellipse(cx, cy + 12, 24, 10, rad);
    p.ellipse(cx, cy + 8, 19, 11, hullDark);
    p.rect(cx - 26, cy + 6, 12, 5, terra);
    p.rect(cx + 14, cy + 8, 12, 5, terra);
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const flap = (f & 1) === 0 ? 0 : 4;
  const sway = (f & 1) === 0 ? -3 : 3;

  // 1. Writhing gnarled biomechanical & plasma tentacles hanging below core!
  for (const [tx, len, dir] of [[-24, 34, -1], [-14, 44, -1], [-4, 48, 1], [6, 46, -1], [16, 42, 1], [25, 32, 1]] as const) {
    const startX = cx + tx;
    const startY = cy + 16;
    const midX = startX + dir * 7 + sway;
    const midY = startY + Math.floor(len * 0.55);
    const endX = startX - dir * 5 - sway;
    const endY = Math.min(h - 4, startY + len);
    p.bezier(startX, startY, midX, midY, endX, endY, hullDark, 5);
    p.bezier(startX, startY, midX, midY, endX, endY, hull, 3);
    p.bezier(startX, startY + 2, midX, midY, endX, endY, rad, 1);
    p.ellipse(endX, endY, 2.5, 2.5, rad);
  }

  // 2. Massive sweeping 3-tiered biomechanical portal wings spanning ~104px!
  for (const s of [-1, 1]) {
    // Upper sweeping razor wing blade
    p.poly([
      [cx + s * 10, cy - 16],
      [cx + s * (51 - flap), cy - 36 + flap],
      [cx + s * (46 - flap), cy - 10 + flap],
      [cx + s * 12, cy - 2],
    ], hull);
    p.poly([
      [cx + s * 12, cy - 15],
      [cx + s * (47 - flap), cy - 32 + flap],
      [cx + s * (38 - flap), cy - 22 + flap],
      [cx + s * 12, cy - 10],
    ], hullHi);
    p.line(cx + s * 14, cy - 12, cx + s * (46 - flap), cy - 27 + flap, rad, 3);
    p.line(cx + s * 15, cy - 12, cx + s * (42 - flap), cy - 25 + flap, '#ffffff', 1);
    // Mid serrated wing pinion
    p.poly([
      [cx + s * 12, cy - 3],
      [cx + s * (48 - flap), cy - 8 - flap],
      [cx + s * (40 - flap), cy + 12 - flap],
      [cx + s * 12, cy + 9],
    ], hullDark);
    p.line(cx + s * 14, cy + 2, cx + s * (42 - flap), cy + 1 - flap, rad, 3);
    // Lower tattered wing spur
    p.poly([
      [cx + s * 11, cy + 8],
      [cx + s * (35 - flap), cy + 14 + flap],
      [cx + s * (26 - flap), cy + 27 + flap],
      [cx + s * 10, cy + 19],
    ], terra);
    p.line(cx + s * 13, cy + 13, cx + s * (29 - flap), cy + 20 + flap, rad, 2);
  }

  // 3. Towering crowned dorsal spires & terracotta/iron Throne wreckage collar
  p.poly([[cx - 18, cy - 22], [cx - 14, cy - 45], [cx - 6, cy - 22]], hullHi);
  p.poly([[cx + 6, cy - 22], [cx + 14, cy - 45], [cx + 18, cy - 22]], hullHi);
  p.poly([[cx - 7, cy - 22], [cx, cy - 50], [cx + 7, cy - 22]], rad);
  p.poly([[cx - 3, cy - 22], [cx, cy - 45], [cx + 3, cy - 22]], '#ffffff');

  // 4. Heavy central armored portal-core shell
  p.ellipse(cx, cy, 24, 28, hullDark);
  p.ellipse(cx, cy - 1, 21, 25, hull);
  p.ellipse(cx - 4, cy - 9, 13, 13, hullHi);
  // Cracked terracotta Throne armor plates clinging to flanks
  p.rect(cx - 22, cy - 10, 6, 18, terra);
  p.rect(cx + 16, cy - 10, 6, 18, terra);

  // 5. Swirling multi-ring nuclear portal vortex core!
  p.ellipse(cx, cy - 2, 16, 17, '#103c16');
  p.ellipse(cx, cy - 2, 13, 14, radDark);
  p.ellipse(cx, cy - 2, 10, 11, rad);
  p.ellipse(cx, cy - 2, 6, 7, '#e8ffc8');
  p.ellipse(cx, cy - 2, 3.5, 4, '#ffffff');
  // Orbiting glowing portal vortex rings & satellite eyes
  p.pixelRing(cx, cy - 2, 14 + (f & 1), rad);
  for (const [ex, ey] of [[-15, -14], [11, -14], [-13, 14], [9, 14]] as const) {
    p.rect(cx + ex, cy + ey, 5, 4, '#103c16');
    p.rect(cx + ex + 1, cy + ey + 1, 3, 2, rad);
    p.set(cx + ex + 1, cy + ey + 1, '#ffffff');
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

// ============================================================================
// 4 MISSING BOSSES (MOM, HYPER CRYSTAL, TECHNOMANCER, CAPTAIN) + HOSTILE HORROR
// ============================================================================

function drawMom1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'walk' | 'fire' | 'hurt' | 'dying' | 'dead',
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  if (mode === 'dying') {
    // 128x96 swelling -> pulsing -> violently bursting toxic green toad matriarch!
    const prog = Math.min(1, f / 11);
    if (prog < 0.72) {
      const swell = 1 + prog * 0.55;
      const rx = Math.round(20 * swell);
      const ry = Math.round(17 * swell);
      const pulse = f % 2 === 0;
      p.ellipse(cx, cy, rx, ry, pulse ? '#4ca838' : '#88e060');
      p.ellipse(cx - 4, cy - 4, Math.round(rx * 0.65), Math.round(ry * 0.55), pulse ? '#b8ff48' : '#ffffff');
      // Blisters swelling to bursting!
      for (const [bx, by] of [[-14, -6], [14, -5], [-10, 8], [12, 7], [0, -10]] as const) {
        const br = 3 + Math.round(prog * 5);
        p.ellipse(cx + Math.round(bx * swell), cy + Math.round(by * swell), br, br, '#b8ff48');
        p.ellipse(cx + Math.round(bx * swell) - 1, cy + Math.round(by * swell) - 1, Math.max(1, br - 2), Math.max(1, br - 2), '#ffffff');
      }
      // Bulging panicked yellow eyes
      p.ellipse(cx - 10, cy - 10, 5, 5, '#ffe838');
      p.ellipse(cx + 10, cy - 10, 5, 5, '#ffe838');
      p.rect(cx - 11, cy - 11, 2, 2, INK);
      p.rect(cx + 9, cy - 11, 2, 2, INK);
    } else {
      // Violent 360° green venom burst!
      const blast = (prog - 0.72) / 0.28;
      p.ellipse(cx, cy + 4, Math.round(34 + blast * 22), Math.round(22 + blast * 14), '#3c7a2c');
      p.ellipse(cx, cy + 2, Math.round(24 + blast * 14), Math.round(15 + blast * 8), '#78e838');
      p.ellipse(cx, cy, Math.round(14 * (1 - blast * 0.5)), Math.round(10 * (1 - blast * 0.5)), '#e8ffb0');
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + f * 0.2;
        const d = 18 + blast * 36;
        p.ellipse(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.72, 4, 3, i % 2 === 0 ? '#78e838' : '#b8ff48');
      }
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  if (mode === 'dead') {
    // 128x96 deflated dark-muted frog carcass puddle w/ toxic slime splatter!
    const spread = Math.min(4, f);
    p.ellipse(cx, cy + 8, 44 + spread * 2, 22 + spread, '#242e22');
    p.ellipse(cx - 2, cy + 6, 36 + spread, 17, '#344232');
    p.ellipse(cx - 12, cy + 10, 14, 7, '#4e9c30');
    p.ellipse(cx + 18, cy + 4, 12, 6, '#62c838');
    p.ellipse(cx + 4, cy + 12, 10, 5, '#78e838');
    p.ellipse(cx - 8, cy + 2, 6, 4, '#283226');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = mode === 'hurt';
  const hurtWhite = hurt && f === 0;
  const body = hurtWhite ? '#ffffff' : hurt ? '#d8ffd8' : '#4ca838';
  const hi = hurtWhite ? '#ffffff' : '#88e060';
  const dark = hurtWhite ? '#d8d8d8' : '#28641e';
  const blister = hurtWhite ? '#ffffff' : (f % 2 === 0 ? '#b8ff48' : '#88e048');
  const bob = mode === 'walk' ? (f % 2 === 0 ? -2 : 1) : (f % 4 === 2 ? 1 : 0);
  const ty = cy + bob;
  const stride = mode === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;

  // Stubby heavy frog hind & front legs
  p.ellipse(cx - 15, ty + 12 + stride, 6, 5, dark);
  p.ellipse(cx + 15, ty + 12 - stride, 6, 5, dark);
  p.rect(cx - 19, ty + 15 + stride, 7, 3, body);
  p.rect(cx + 12, ty + 15 - stride, 7, 3, body);

  // Giant bloated toxic-green toad body
  p.ellipse(cx, ty + 2, 19, 15, body);
  p.ellipse(cx - 4, ty - 3, 13, 8, hi);
  p.ellipse(cx + 3, ty + 9, 15, 7, dark);

  // Pulsing lime belly blisters & warts
  for (const [bx, by, br] of [[-12, 2, 3.5], [13, 3, 3.5], [-7, 10, 3], [8, 9, 3], [0, -7, 3]] as const) {
    p.ellipse(cx + bx, ty + by, br, br, blister);
    p.set(cx + bx - 1, ty + by - 1, '#ffffff');
  }

  // Bulging bright yellow eyes on top of head
  p.ellipse(cx - 9, ty - 11, 5.5, 5, body);
  p.ellipse(cx + 9, ty - 11, 5.5, 5, body);
  p.ellipse(cx - 9, ty - 11, 4, 3.5, '#ffe838');
  p.ellipse(cx + 9, ty - 11, 4, 3.5, '#ffe838');
  p.rect(cx - 10, ty - 12, 2, 3, INK);
  p.rect(cx + 8, ty - 12, 2, 3, INK);
  p.set(cx - 11, ty - 13, '#ffffff');
  p.set(cx + 7, ty - 13, '#ffffff');

  // Huge gaping fanged mouth (spitting glowing toxic ball on Fire!)
  if (mode === 'fire') {
    p.ellipse(cx, ty + 2, 13, 8, INK);
    p.ellipse(cx, ty + 3, 9, 5, '#44c830');
    p.ellipse(cx, ty + 3, 5, 3, '#d8ff78');
    p.rect(cx - 2, ty + 2, 4, 2, '#ffffff');
  } else {
    p.rect(cx - 11, ty + 1, 22, 5, INK);
    p.rect(cx - 9, ty + 3, 18, 2, '#2c7822');
  }
  for (let t = -9; t <= 8; t += 4) {
    p.rect(cx + t, ty + 1, 2, 2, '#f4eedc');
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawHyperCrystal1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'fire' | 'hurt' | 'dead',
): void {
  const p = new PxCanvas(w, h);
  const cx = 48;
  const cy = 54;

  if (mode === 'dead') {
    // 96x96 shattering outward into tumbling magenta/cyan crystal shards!
    const prog = Math.min(1, f / 9);
    if (prog < 0.35) {
      p.poly([[cx, cy - 34], [cx + 22, cy - 4], [cx + 16, cy + 28], [cx - 16, cy + 28], [cx - 22, cy - 4]], f % 2 === 0 ? '#ffffff' : '#ff88ff');
    }
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + f * 0.15;
      const dist = 6 + prog * 36;
      const sx = Math.round(cx + Math.cos(ang) * dist);
      const sy = Math.round(cy + Math.sin(ang) * dist * 0.8);
      const sz = Math.max(2, Math.round(7 * (1 - prog * 0.55)));
      p.poly([[sx, sy - sz], [sx + sz, sy], [sx, sy + sz], [sx - sz, sy]], i % 2 === 0 ? '#b838e8' : '#58f4ff');
      p.set(sx - 1, sy - 1, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = mode === 'hurt';
  const hurtWhite = hurt && f === 0;
  const body = hurtWhite ? '#ffffff' : '#b838e8';
  const hi = hurtWhite ? '#ffffff' : '#ff88ff';
  const dark = hurtWhite ? '#e0d0f0' : '#5a1888';
  const core = mode === 'fire' || hurtWhite ? '#ffffff' : (f % 2 === 0 ? '#58f4ff' : '#a8ffff');
  const hover = Math.round(Math.sin((f / 6) * Math.PI * 2) * 2);
  const ty = cy + hover;

  // Flanking secondary jagged crystal spires
  p.poly([[cx - 14, ty + 24], [cx - 34, ty - 8], [cx - 22, ty - 28], [cx - 8, ty - 6]], dark);
  p.poly([[cx - 22, ty - 26], [cx - 33, ty - 8], [cx - 18, ty + 18]], hi);
  p.poly([[cx + 14, ty + 24], [cx + 34, ty - 8], [cx + 22, ty - 28], [cx + 8, ty - 6]], dark);
  p.poly([[cx + 22, ty - 26], [cx + 14, ty - 6], [cx + 20, ty + 18]], body);

  // Towering central jagged crystal monolith (orig 48,64 -> spans y=6..88!)
  p.poly([[cx, ty - 46], [cx + 23, ty - 8], [cx + 18, ty + 32], [cx, ty + 38], [cx - 18, ty + 32], [cx - 23, ty - 8]], body);
  p.poly([[cx, ty - 45], [cx - 22, ty - 8], [cx - 17, ty + 31], [cx, ty + 37]], hi);
  p.poly([[cx, ty - 44], [cx - 13, ty - 14], [cx, ty - 4]], '#ffffff');
  p.poly([[cx, ty - 45], [cx + 22, ty - 8], [cx + 17, ty + 31], [cx, ty + 37]], dark);
  p.line(cx, ty - 44, cx, ty + 36, '#ffffff', 1);

  // Blazing white-cyan crystalline inner reactor core!
  p.poly([[cx, ty - 20], [cx + 12, ty - 2], [cx, ty + 16], [cx - 12, ty - 2]], '#58f4ff');
  p.poly([[cx, ty - 13], [cx + 7, ty - 2], [cx, ty + 9], [cx - 7, ty - 2]], core);
  if (mode === 'fire') {
    p.line(cx - 28, ty - 2, cx + 28, ty - 2, '#ffffff', 2);
    p.line(cx, ty - 34, cx, ty + 28, '#58f4ff', 2);
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawTechnomancer1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'active' | 'inactive' | 'activate' | 'empty' | 'hurt' | 'dead' | 'last_dead',
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  if (mode === 'dead' || mode === 'last_dead') {
    // 118x120 charred smoking battle station ruin (extra emerald explosion flash on early frames!)
    const isBlast = f <= 2;
    p.rect(cx - 42, cy + 8, 84, 34, '#262c34');
    p.rect(cx - 36, cy - 4, 72, 24, '#363e48');
    p.rect(cx - 26, cy - 16, 52, 22, '#1c222a');
    // Jagged broken dome glass shards
    p.poly([[cx - 24, cy - 8], [cx - 18, cy - 22], [cx - 10, cy - 8]], '#3c6854');
    p.poly([[cx + 12, cy - 8], [cx + 22, cy - 20], [cx + 26, cy - 8]], '#2a4c3e');
    if (isBlast) {
      const r = 24 + f * 9;
      p.ellipse(cx, cy - 6, r, Math.round(r * 0.8), mode === 'last_dead' ? '#58ff68' : '#ff7824');
      p.ellipse(cx, cy - 6, Math.round(r * 0.6), Math.round(r * 0.5), '#ffffff');
    } else {
      // Dark smoking debris clouds
      const lift = (f - 3) * 3;
      p.ellipse(cx - 10, cy - 18 - lift, 10, 7, '#34303a');
      p.ellipse(cx + 12, cy - 14 - lift, 8, 6, '#484250');
      p.ellipse(cx, cy + 2, 8, 5, mode === 'last_dead' ? '#389844' : '#4c2620');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = mode === 'hurt';
  const hurtWhite = hurt && f === 0;
  const steel = hurtWhite ? '#ffffff' : '#586470';
  const steelHi = hurtWhite ? '#ffffff' : '#8e9ca8';
  const steelDark = hurtWhite ? '#d8d8d8' : '#323a44';
  const isEmpty = mode === 'empty' || mode === 'inactive';
  const glass = hurtWhite ? '#ffffff' : isEmpty ? '#26343a' : '#48f098';
  const glassHi = hurtWhite ? '#ffffff' : isEmpty ? '#485a64' : '#c0ffe0';

  // Massive industrial octagonal steel battle-station base (spans ~92x96 inside 118x120)
  p.poly([
    [cx - 46, cy + 44], [cx - 52, cy + 16], [cx - 44, cy - 16], [cx - 24, cy - 42],
    [cx + 24, cy - 42], [cx + 44, cy - 16], [cx + 52, cy + 16], [cx + 46, cy + 44],
  ], steelDark);
  p.rect(cx - 42, cy - 12, 84, 52, steel);
  p.rect(cx - 40, cy - 12, 80, 6, steelHi);
  // Flanking hydraulic generator pillars & green/cyan plasma conduits!
  for (const s of [-1, 1]) {
    const px = s < 0 ? cx - 50 : cx + 36;
    p.rect(px, cy - 28, 14, 62, steel);
    p.rect(px + 2, cy - 26, 4, 58, steelHi);
    p.rect(px + 3, cy - 16, 8, 36, isEmpty ? '#1c242a' : '#248858');
    if (!isEmpty) {
      p.rect(px + 5, cy - 14 + (f & 1) * 2, 4, 32, '#58ff98');
    }
  }
  // Top overhead emitter spires
  p.rect(cx - 22, cy - 52, 8, 16, steelHi);
  p.rect(cx + 14, cy - 52, 8, 16, steelHi);
  p.rect(cx - 20, cy - 54, 4, 4, isEmpty ? '#48525c' : '#58f0ff');
  p.rect(cx + 16, cy - 54, 4, 4, isEmpty ? '#48525c' : '#58f0ff');

  // Colossal central containment glass dome!
  p.ellipse(cx, cy - 10, 30, 32, '#1e4e3a');
  p.ellipse(cx, cy - 10, 27, 29, glass);
  p.ellipse(cx - 8, cy - 22, 13, 10, glassHi);

  if (!isEmpty) {
    // Floating cybernetic mutant brain/head inside glowing dome!
    const bob = mode === 'activate' ? Math.max(0, 10 - f * 2) : (f % 2 === 0 ? -1 : 1);
    const by = cy - 12 + bob;
    p.ellipse(cx, by, 17, 13, '#b87890');
    p.ellipse(cx - 4, by - 4, 11, 7, '#e8a8be');
    p.line(cx - 10, by, cx + 10, by - 2, '#6e3a50', 2);
    p.line(cx - 9, by + 5, cx + 8, by + 6, '#6e3a50', 2);
    // Cybernetic metallic brainstem & piercing crimson optic!
    p.rect(cx - 11, by + 8, 22, 9, steelDark);
    p.rect(cx - 9, by + 9, 18, 3, steelHi);
    p.ellipse(cx, by + 3, 7, 7, INK);
    p.ellipse(cx, by + 3, 5, 5, mode === 'activate' && f < 3 ? '#ffe848' : '#ff2838');
    p.rect(cx - 2, by + 1, 2, 2, '#ffffff');
  } else if (mode === 'empty') {
    // Cracked dark hollow empty pod
    p.line(cx - 12, cy - 24, cx + 8, cy + 4, INK, 2);
    p.line(cx + 10, cy - 18, cx - 6, cy + 8, INK, 1);
  }

  // Heavy lower control console + glowing indicator bars
  p.rect(cx - 32, cy + 20, 64, 18, '#1e242c');
  p.rect(cx - 28, cy + 24, 14, 8, isEmpty ? '#303842' : '#48f098');
  p.rect(cx + 14, cy + 24, 14, 8, isEmpty ? '#303842' : '#48f098');
  p.rect(cx - 6, cy + 24, 12, 8, isEmpty ? '#303842' : (f % 2 === 0 ? '#ff3c48' : '#ff9838'));

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawCaptain1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode:
    | 'idle'
    | 'sit'
    | 'hurt'
    | 'dash_start'
    | 'dash'
    | 'dash_end'
    | 'spin'
    | 'warp_in'
    | 'warp_out'
    | 'death_collapse'
    | 'death_wait'
    | 'death_shot'
    | 'death',
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // Warp-in / Warp-out vertical blue portal dissolve!
  if (mode === 'warp_in' || mode === 'warp_out') {
    const t = mode === 'warp_in' ? f / 5 : 1 - f / 5;
    const beamW = Math.max(4, Math.round(24 * (1 - t * 0.45)));
    p.rect(cx - Math.floor(beamW / 2), 4, beamW, h - 8, '#2868e0');
    p.rect(cx - Math.max(2, Math.floor(beamW / 4)), 4, Math.max(4, Math.floor(beamW / 2)), h - 8, '#78ecff');
    p.rect(cx - 2, 6, 4, h - 12, '#ffffff');
    if (t > 0.35) {
      p.ellipse(cx, cy, Math.round(12 * t), Math.round(18 * t), '#2a58b8');
      p.rect(cx - 6, cy - 10, 12, 4, '#68f4ff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  // Execution / Death sprites (96x96)
  if (mode === 'death_collapse' || mode === 'death_wait' || mode === 'death_shot' || mode === 'death') {
    if (mode === 'death') {
      // Slumped defeated blue/white cloak wreckage on floor
      const slump = Math.min(3, f);
      p.ellipse(cx, cy + 12, 26 + slump, 11, '#1a2848');
      p.ellipse(cx - 3, cy + 9, 20, 8, '#2a58b8');
      p.rect(cx - 14, cy + 6, 16, 6, '#e8f2fc');
      p.rect(cx + 6, cy + 7, 10, 6, '#2a58b8');
      p.rect(cx + 8, cy + 9, 6, 2, '#142038'); // dim visor
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const recoil = mode === 'death_shot' ? (f % 2 === 0 ? -4 : 2) : 0;
    const flash = mode === 'death_shot' && f === 0;
    const cape = flash ? '#ffffff' : '#e8f2fc';
    const armor = flash ? '#ffffff' : '#2a58b8';
    const kneelY = cy + 6 + (mode === 'death_collapse' ? Math.min(6, f * 2) : 0);
    // Kneeling defeated Captain silhouette
    p.poly([[cx - 18, kneelY + 14], [cx - 14, kneelY - 4], [cx + 14, kneelY - 4], [cx + 18, kneelY + 14]], armor);
    p.poly([[cx - 16, kneelY + 12], [cx - 12, kneelY - 2], [cx + 4, kneelY - 2], [cx, kneelY + 12]], cape);
    p.rect(cx - 10 + recoil, kneelY - 14, 20, 12, armor);
    p.rect(cx - 8 + recoil, kneelY - 9, 16, 4, INK);
    p.rect(cx - 6 + recoil, kneelY - 8, 12, 2, mode === 'death_wait' && f % 4 === 0 ? '#68f4ff' : '#2868a8');
    if (mode === 'death_shot') {
      p.ellipse(cx + 4, kneelY - 6, 6, 6, '#ff5828');
      p.ellipse(cx + 4, kneelY - 6, 3, 3, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = mode === 'hurt';
  const hurtWhite = hurt && f === 0;
  const armor = hurtWhite ? '#ffffff' : '#2a58b8';
  const armorHi = hurtWhite ? '#ffffff' : '#588cf4';
  const armorDark = hurtWhite ? '#d8d8d8' : '#183474';
  const cape = hurtWhite ? '#ffffff' : '#e8f2fc';
  const gold = hurtWhite ? '#ffffff' : '#f5d038';
  const visor = hurtWhite ? INK : '#68f4ff';

  const bob = mode === 'sit' ? 4 : mode === 'spin' ? ((f & 1) === 0 ? -1 : 1) : (f % 2 === 0 ? 0 : 1);
  const ty = cy + bob;

  // Dash comet aura!
  if (mode === 'dash' || mode === 'dash_start' || mode === 'dash_end') {
    const flameLen = mode === 'dash' ? 28 : 16;
    p.poly([[cx + 16, ty - 14], [cx - flameLen, ty], [cx + 16, ty + 14]], '#2878ff');
    p.poly([[cx + 14, ty - 9], [cx - Math.floor(flameLen * 0.65), ty], [cx + 14, ty + 9]], '#78ecff');
    p.ellipse(cx + 16, ty, 12, 12, '#78ecff');
    p.ellipse(cx + 18, ty, 7, 7, '#ffffff');
  }

  // Spin swirling blue aura ring!
  if (mode === 'spin') {
    p.pixelRing(cx, ty, 24 + (f % 3), '#2878ff');
    p.pixelRing(cx, ty, 20 + (f % 2), '#78ecff');
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + f * 0.6;
      p.ellipse(cx + Math.cos(ang) * 24, ty + Math.sin(ang) * 20, 3, 3, '#ffffff');
    }
  }

  // Tall armored boots (tucked when seated)
  if (mode !== 'sit') {
    p.rect(cx - 9, ty + 14, 7, 10, armorDark);
    p.rect(cx + 2, ty + 14, 7, 10, armorDark);
    p.rect(cx - 8, ty + 15, 3, 7, armorHi);
    p.rect(cx + 3, ty + 15, 3, 7, armorHi);
  }

  // Flowing white shoulder cape & cobalt armored coat!
  p.poly([[cx - 18, ty + 16], [cx - 15, ty - 8], [cx + 15, ty - 8], [cx + 18, ty + 16]], armor);
  p.poly([[cx - 16, ty + 14], [cx - 14, ty - 7], [cx - 4, ty - 7], [cx - 6, ty + 14]], cape);
  p.poly([[cx + 4, ty - 7], [cx + 14, ty - 7], [cx + 16, ty + 14], [cx + 6, ty + 14]], cape);
  // White flared pauldrons + gold captain trim & chest crest
  p.rect(cx - 19, ty - 9, 8, 8, cape);
  p.rect(cx + 11, ty - 9, 8, 8, cape);
  p.rect(cx - 18, ty - 9, 6, 2, gold);
  p.rect(cx + 12, ty - 9, 6, 2, gold);
  p.rect(cx - 10, ty + 1, 20, 4, gold);
  p.rect(cx - 4, ty - 4, 8, 6, '#68f4ff');

  // Massive blazing blue energy gauntlet!
  const gx = mode === 'spin' ? cx + (f % 2 === 0 ? 22 : -22) : cx + 16;
  const gy = mode === 'dash' ? ty : ty + 2;
  p.ellipse(gx, gy, 8, 8, '#2878ff');
  p.ellipse(gx, gy, 5, 5, '#78ecff');
  p.ellipse(gx - 1, gy - 1, 2.5, 2.5, '#ffffff');

  // Imposing cobalt commander helmet + tall white/gold crest + cyan visor!
  p.rect(cx - 10, ty - 23, 20, 15, armor);
  p.rect(cx - 8, ty - 23, 16, 4, armorHi);
  p.rect(cx - 3, ty - 28, 6, 10, cape);
  p.rect(cx - 1, ty - 27, 2, 8, gold);
  p.rect(cx - 9, ty - 17, 18, 6, INK);
  p.rect(cx - 7, ty - 16, 14, 4, visor);
  p.rect(cx - 5, ty - 16, 6, 2, '#ffffff');

  p.outline(INK);
  p.flush(ctx, x, y);
}

function drawEnemyHorror1x(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  f: number,
  mode: 'idle' | 'walk' | 'hurt' | 'dead',
): void {
  const p = new PxCanvas(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  if (mode === 'dead') {
    const spread = Math.min(4, f);
    p.ellipse(cx, cy + 8, 15 + spread, 7, '#18381c');
    p.ellipse(cx, cy + 6, 11 + spread, 5, '#2c682c');
    p.ellipse(cx - 3, cy + 5, 5, 3, '#58c848');
    p.outline(INK);
    p.flush(ctx, x, y);
    return;
  }

  const hurt = mode === 'hurt';
  const white = hurt && f === 0;
  const body = white ? '#ffffff' : '#48f048';
  const hi = white ? '#ffffff' : '#a8ff88';
  const dark = white ? '#d8d8d8' : '#1c7a1c';
  const stride = mode === 'walk' ? (f % 2 === 0 ? 3 : -3) : 0;
  const bob = mode === 'walk' ? (f % 2 === 0 ? -1 : 1) : (f % 3 === 1 ? 1 : 0);
  const ty = cy + bob;

  // Quadrupedal feral beast legs
  p.rect(cx - 14 + stride, ty + 8, 5, 8, dark);
  p.rect(cx - 6 - stride, ty + 9, 4, 7, body);
  p.rect(cx + 4 - stride, ty + 9, 4, 7, body);
  p.rect(cx + 10 + stride, ty + 8, 5, 8, dark);

  // Jagged dorsal radioactive energy spikes!
  p.poly([[cx - 14, ty - 5], [cx - 19, ty - 16], [cx - 7, ty - 9]], hi);
  p.poly([[cx - 5, ty - 9], [cx - 2, ty - 20], [cx + 4, ty - 10]], hi);
  p.poly([[cx + 4, ty - 9], [cx + 12, ty - 18], [cx + 14, ty - 6]], hi);

  // Bulky glowing radioactive green beast body
  p.ellipse(cx, ty, 16, 12, body);
  p.ellipse(cx - 3, ty - 4, 10, 6, hi);
  p.ellipse(cx + 4, ty + 6, 11, 5, dark);

  // Huge glowing fanged maw & blazing eyes!
  p.rect(cx - 9, ty - 5, 5, 4, '#0c2410');
  p.rect(cx + 4, ty - 5, 5, 4, '#0c2410');
  p.rect(cx - 8, ty - 4, 3, 2, '#ffffff');
  p.rect(cx + 5, ty - 4, 3, 2, '#ffffff');
  p.rect(cx - 10, ty + 2, 20, 6, '#0c2410');
  p.rect(cx - 8, ty + 4, 16, 3, '#c8ff68');
  for (let t = -8; t <= 7; t += 4) p.rect(cx + t, ty + 2, 2, 2, '#ffffff');

  // Orbiting glowing rad droplets
  p.rect(cx - 20, ty - 6 + (f % 3), 3, 3, hi);
  p.rect(cx + 18, ty - 4 - (f % 3), 3, 3, hi);

  p.outline(INK);
  p.flush(ctx, x, y);
}

// ============================================================================
// ALL 17 MISSING ENEMIES + EXTRAS (Blueprint Section 5.1 #1)
// ============================================================================

function registerMissingBossesAndEnemies(b: FallbackAtlasBuilder): void {
  // ---- BOSS 6: MOM (FrogQueen) ----
  b.addSprite('sprFrogQueenIdle', 48, 48, 24, 24, 8, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprFrogQueenWalk', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprFrogQueenFire', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprFrogQueenHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprFrogQueenDying', 128, 96, 64, 48, 12, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'dying'));
  b.addSprite('sprFrogQueenDead', 128, 96, 64, 48, 6, (ctx, x, y, w, h, f) => drawMom1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprFrogQueenBall', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const pulse = (f & 1) === 0 ? 0 : 1;
    p.ellipse(12, 12, 8 + pulse, 8 + pulse, '#44c830');
    p.ellipse(11, 11, 5.5, 5.5, '#b8ff50');
    p.ellipse(9, 9, 2.5, 2, '#ffffff');
    p.set(17, 7 + (f % 3), '#b8ff50');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  const drawFrogEgg = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, mode: 'idle' | 'spawn' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24;
    if (mode === 'dead') {
      const r = 10 + f * 3;
      p.pixelRing(cx, cy + 4, Math.min(18, r), '#4ca838');
      p.ellipse(cx, cy + 5, 11, 5, '#305428');
      p.ellipse(cx - 5, cy + 6, 4, 2, '#84e848');
      p.ellipse(cx + 6, cy + 3, 4, 2, '#b8ff58');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const scale = mode === 'spawn' ? 0.45 + (f / 4) * 0.55 : 1;
    const white = mode === 'hurt' && f === 0;
    const rx = Math.round(13 * scale);
    const ry = Math.round(15 * scale);
    p.ellipse(cx, cy + 2, rx, ry, white ? '#ffffff' : '#38782c');
    p.ellipse(cx - 2, cy, Math.max(3, rx - 3), Math.max(4, ry - 4), white ? '#ffffff' : '#58b842');
    // Glowing frog embryo pulsing inside!
    const er = Math.max(2, Math.round((6 + (f & 1)) * scale));
    p.ellipse(cx, cy + 3, er, er, white ? '#ffffff' : '#84e848');
    p.ellipse(cx - 1, cy + 2, Math.max(1, er - 3), Math.max(1, er - 3), '#d8ff88');
    p.set(cx - 4, cy - 6, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprFrogEgg', 48, 48, 24, 24, 4, (ctx, x, y, w, h, f) => drawFrogEgg(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprFrogEggSpawn', 48, 48, 24, 24, 5, (ctx, x, y, w, h, f) => drawFrogEgg(ctx, x, y, w, h, f, 'spawn'));
  b.addSprite('sprFrogEggHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawFrogEgg(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprFrogEggDead', 48, 48, 24, 24, 5, (ctx, x, y, w, h, f) => drawFrogEgg(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprFrogGas', 24, 24, 12, 12, 5, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const dx = (f % 3) - 1;
    p.ellipse(9 + dx, 13, 6.5, 5.5, '#349c24');
    p.ellipse(15 - dx, 14, 6, 5, '#42b82c');
    p.ellipse(12, 10, 7, 6, '#58e038');
    p.ellipse(10, 9, 3.5, 2.5, '#a8ff60');
    p.outline('#0c2810');
    p.flush(ctx, x, y);
  });
  b.addSprite('sprFrogHeal', 16, 16, 8, 8, 7, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const ry = 11 - f;
    // Crisp rising green + healing sparkle!
    p.rect(7, ry - 2, 2, 6, '#80ff80');
    p.rect(5, ry, 6, 2, '#80ff80');
    p.rect(7, ry, 2, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- BOSS 7: HYPER CRYSTAL ----
  b.addSprite('sprHyperCrystalIdle', 96, 96, 48, 64, 6, (ctx, x, y, w, h, f) => drawHyperCrystal1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprHyperCrystalFire', 96, 96, 48, 64, 3, (ctx, x, y, w, h, f) => drawHyperCrystal1x(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprHyperCrystalHurt', 96, 96, 48, 64, 3, (ctx, x, y, w, h, f) => drawHyperCrystal1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprHyperCrystalDead', 96, 96, 48, 64, 10, (ctx, x, y, w, h, f) => drawHyperCrystal1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprHyperCrystalShard', 16, 16, 8, 8, 6, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const rot = f % 2 === 0;
    p.poly(rot ? [[8, 2], [13, 8], [8, 14], [3, 8]] : [[4, 3], [13, 5], [11, 13], [3, 11]], '#e058f0');
    p.rect(6, 5, 3, 3, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- BOSS 8: TECHNOMANCER & NECRO REVIVE CIRCLES ----
  b.addSprite('sprTechnoMancer', 118, 120, 59, 60, 6, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'active'));
  b.addAlias('sprTechnoMancerIdle', 'sprTechnoMancer');
  b.addSprite('sprTechnoMancerInactive', 118, 120, 59, 60, 1, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'inactive'));
  b.addSprite('sprTechnoMancerActivate', 118, 120, 59, 60, 6, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'activate'));
  b.addSprite('sprTechnoMancerEmpty', 118, 120, 59, 60, 1, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'empty'));
  b.addSprite('sprTechnoMancerHurt', 118, 120, 59, 60, 3, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprTechnoMancerDead', 118, 120, 59, 60, 8, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprTechnoMancerLastDead', 118, 120, 59, 60, 8, (ctx, x, y, w, h, f) => drawTechnomancer1x(ctx, x, y, w, h, f, 'last_dead'));
  b.addSprite('sprTechnoMancerAppear', 20, 60, 10, 60, 7, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const bw = Math.max(2, Math.round(14 * (1 - f / 7)));
    p.rect(10 - Math.floor(bw / 2), 2, bw, h - 4, '#58f0ff');
    p.rect(10 - Math.max(1, Math.floor(bw / 4)), 2, Math.max(2, Math.floor(bw / 2)), h - 4, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprTechnoMancerDisappear', 36, 60, 18, 60, 7, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const bw = Math.max(2, Math.round(24 * (1 - f / 7)));
    p.rect(18 - Math.floor(bw / 2), 2, bw, h - 4, '#98ff70');
    p.rect(18 - Math.max(1, Math.floor(bw / 4)), 2, Math.max(2, Math.floor(bw / 2)), h - 4, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprTechnoMancerFire1', 64, 120, 32, 60, 8, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 32;
    const pulse = (f & 1) === 0 ? 4 : 0;
    // Overhead turret-spawning plasma spire
    p.rect(cx - 12, 8, 24, 104, '#247858');
    p.rect(cx - 8 + (f & 1), 8, 16, 104, '#58f0ff');
    p.rect(cx - 4, 8, 8, 104, '#ffffff');
    p.ellipse(cx, 60, 18 + pulse, 18 + pulse, '#48f098');
    p.ellipse(cx, 60, 10, 10, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprTechnoMancerFire2', 56, 72, 28, 60, 8, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 28;
    // Crackling green necro-revive beam emitter
    p.ellipse(cx, 48, 18 + (f & 1) * 3, 14, '#248838');
    p.ellipse(cx, 48, 12, 9, '#78ff68');
    p.ellipse(cx, 48, 6, 5, '#ffffff');
    for (let i = -2; i <= 2; i++) {
      p.line(cx + i * 5, 48, cx + i * 8, 10 + (f % 3) * 4, '#98ff70', 2);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // Pulsing hollow neon-green/purple Necro Revive summoning circles (CRITICAL for Skeleton unlock visibility!)
  const drawReviveCircle = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, colOuter: string, colHi: string, colInner: string): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const rx = Math.floor(w * 0.44);
    const ry = Math.floor(h * 0.42);
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      if ((i + f) % 3 === 0) continue; // animated dashed arcane ring!
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 0.85) / segs) * Math.PI * 2;
      p.line(
        cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry,
        cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry,
        i % 2 === 0 ? colOuter : colHi,
        2,
      );
      p.line(
        cx + Math.cos(a0) * (rx - 4), cy + Math.sin(a0) * (ry - 4),
        cx + Math.cos(a1) * (rx - 4), cy + Math.sin(a1) * (ry - 4),
        colInner,
        1,
      );
    }
    // 4 pulsing arcane corner runes
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const gx = cx + dx * (rx - 2);
      const gy = cy + dy * (ry - 2);
      p.rect(gx - 2, gy - 2, 4, 4, colHi);
      p.set(gx, gy, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprNecroReviveArea', 35, 40, 17, 20, 4, (ctx, x, y, w, h, f) =>
    drawReviveCircle(ctx, x, y, w, h, f, '#58ff68', '#c8ffb0', '#9848e8'),
  );
  b.addSprite('sprReviveArea', 70, 80, 35, 45, 4, (ctx, x, y, w, h, f) =>
    drawReviveCircle(ctx, x, y, w, h, f, '#58ff68', '#c8ffb0', '#9848e8'),
  );

  // ---- BOSS 9: I.D.P.D. CAPTAIN (Last) ----
  b.addSprite('sprLastIdle', 72, 72, 36, 36, 6, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprLastSit', 72, 72, 36, 36, 1, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'sit'));
  b.addSprite('sprLastHurt', 72, 72, 36, 36, 3, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprLastDashStart', 72, 72, 36, 36, 2, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'dash_start'));
  b.addSprite('sprLastDash', 72, 72, 36, 36, 2, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'dash'));
  b.addSprite('sprLastDashEnd', 72, 72, 36, 36, 5, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'dash_end'));
  b.addSprite('sprLastSpin', 72, 72, 36, 36, 10, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'spin'));
  b.addSprite('sprLastWarpIn', 72, 72, 36, 36, 6, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'warp_in'));
  b.addSprite('sprLastWarpOut', 72, 72, 36, 36, 6, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'warp_out'));
  b.addSprite('sprLastDeathCollapse', 96, 96, 48, 48, 4, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'death_collapse'));
  b.addSprite('sprLastDeathWait', 96, 96, 48, 48, 8, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'death_wait'));
  b.addSprite('sprLastDeathShot', 96, 96, 48, 48, 6, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'death_shot'));
  b.addSprite('sprLastDeath', 96, 96, 48, 48, 8, (ctx, x, y, w, h, f) => drawCaptain1x(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprLastDead', 'sprLastDeath');
  b.addSprite('sprLastBall', 32, 32, 16, 16, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 16;
    const cy = 16;
    p.ellipse(cx, cy, 12, 12, '#2878ff');
    p.ellipse(cx, cy, 9, 9, '#78ecff');
    p.ellipse(cx, cy, 5 + (f & 1), 5 + (f & 1), '#ffffff');
    // Crackling lightning arcs
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + f * 0.7;
      p.line(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7, cx + Math.cos(ang + 0.3) * 14, cy + Math.sin(ang + 0.3) * 14, '#d8f8ff', 1);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- HOSTILE HORROR ----
  b.addSprite('sprEnemyHorrorIdle', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawEnemyHorror1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprEnemyHorrorWalk', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawEnemyHorror1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprEnemyHorrorHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawEnemyHorror1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprEnemyHorrorDead', 48, 48, 24, 24, 7, (ctx, x, y, w, h, f) => drawEnemyHorror1x(ctx, x, y, w, h, f, 'dead'));

  // ---- 1-3: ELITE IDPD GRUNT / INSPECTOR / SHIELDER ----
  const drawEliteIdpd = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    role: 'grunt' | 'inspector' | 'shielder',
    state: 'idle' | 'walk' | 'hurt' | 'dead',
  ): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    if (state === 'dead') {
      p.ellipse(cx, cy + 5, 7, 3, '#1a2034');
      p.rect(cx - 4, cy + 3, 8, 3, '#263864');
      p.rect(cx - 1, cy + 3, 3, 1, '#dce8f8');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const navy = white ? '#ffffff' : '#1e3878';
    const navyHi = white ? '#ffffff' : '#426cc8';
    const trim = white ? '#ffffff' : '#eef4fc';
    const visor = white ? INK : '#68f4ff';
    const stride = state === 'walk' ? (f % 2 === 0 ? 1 : -1) : 0;
    const bob = state === 'walk' ? (f % 2 === 0 ? -1 : 0) : (f % 4 === 2 ? 1 : 0);
    const ty = cy + bob;

    p.rect(cx - 4 + stride, ty + 6, 3, 3, '#141e38');
    p.rect(cx + 1 - stride, ty + 6, 3, 3, '#141e38');
    const hw = role === 'shielder' ? 7 : 5;
    // Dorsal thruster pack for Elite Grunt
    if (role === 'grunt') {
      p.rect(cx - 7, ty - 4, 3, 7, '#4c5a74');
      p.set(cx - 6, ty + 3, '#68f4ff');
    }
    // Navy elite armor torso + broad white shoulder skull/stripes!
    p.rect(cx - hw, ty - 2, hw * 2, 9, navy);
    p.rect(cx - hw - 1, ty - 2, 3, 4, trim);
    p.rect(cx + hw - 2, ty - 2, 3, 4, trim);
    p.rect(cx - hw + 2, ty + 2, hw * 2 - 4, 2, trim);
    // Elite helmet + white stripe + bright cyan visor!
    p.rect(cx - 4, ty - 8, 8, 7, navy);
    p.rect(cx - 3, ty - 9, 6, 2, navyHi);
    p.rect(cx - 1, ty - 9, 2, 3, trim);
    p.rect(cx - 4, ty - 6, 8, 3, INK);
    p.rect(cx - 3, ty - 5, 6, 1, visor);
    // Glowing blue energy blade for Elite Inspector!
    if (role === 'inspector') {
      p.line(cx + 6, ty + 3, cx + 10, ty - 7, '#58ecff', 2);
      p.line(cx + 6, ty + 2, cx + 10, ty - 6, '#ffffff', 1);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  for (const [prefix, role] of [
    ['sprEliteGrunt', 'grunt'],
    ['sprEliteInspector', 'inspector'],
    ['sprEliteShielder', 'shielder'],
  ] as const) {
    b.addSprite(`${prefix}Idle`, 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawEliteIdpd(ctx, x, y, w, h, f, role, 'idle'));
    b.addSprite(`${prefix}Walk`, 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawEliteIdpd(ctx, x, y, w, h, f, role, 'walk'));
    b.addSprite(`${prefix}Hurt`, 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawEliteIdpd(ctx, x, y, w, h, f, role, 'hurt'));
    b.addSprite(`${prefix}Dead`, 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawEliteIdpd(ctx, x, y, w, h, f, role, 'dead'));
  }

  b.addSprite('sprElitePopoGun', 22, 12, 6, 6, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 16, 4, '#1e3878');
    p.rect(3, 3, 14, 1, '#eef4fc');
    p.rect(10, 4, 8, 2, '#68f4ff');
    p.rect(17, 2, 3, 6, '#3878e0');
    p.rect(4, 7, 4, 3, '#142040');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprEliteGruntFlame', 9, 6, 9, 3, 3, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.poly([[8, 1], [1 + f, 3], [8, 5]], '#2888ff');
    p.rect(4 + Math.min(2, f), 2, 4, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprEliteGruntFlameStop', 14, 8, 7, 4, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const r = Math.max(1, 3 - Math.floor(f * 0.7));
    p.ellipse(7 - f, 4, r, r, '#68d8ff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprPopoRocket', 16, 8, 8, 4, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 3, 3, 2, '#78ecff');
    p.rect(4, 2, 8, 4, '#eef4fc');
    p.rect(6, 2, 3, 4, '#2868e0');
    p.rect(12, 2, 3, 4, '#2898ff');
    p.set(14, 3, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprEliteInspectorControl', 32, 32, 16, 23, 3, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.pixelRing(16, 16, 7 + f * 3, '#58ecff');
    p.pixelRing(16, 16, 4 + f * 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  const drawEliteShieldDome = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, appear: boolean): void => {
    const p = new PxCanvas(w, h);
    const cx = 32;
    const cy = 36;
    const t = appear ? Math.min(1, (f + 1) / 8) : Math.max(0.15, 1 - f / 5);
    const r = Math.round(24 * t);
    p.poly([
      [cx, cy - r], [cx + Math.round(r * 0.86), cy - Math.round(r * 0.5)],
      [cx + Math.round(r * 0.86), cy + Math.round(r * 0.5)], [cx, cy + r],
      [cx - Math.round(r * 0.86), cy + Math.round(r * 0.5)], [cx - Math.round(r * 0.86), cy - Math.round(r * 0.5)],
    ], '#2888ff');
    p.pixelRing(cx, cy, Math.max(3, r - 2), '#88f4ff');
    p.pixelRing(cx, cy, Math.max(2, r - 5), '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprEliteShielderShieldAppear', 64, 64, 32, 40, 8, (ctx, x, y, w, h, f) => drawEliteShieldDome(ctx, x, y, w, h, f, true));
  b.addSprite('sprEliteShielderShieldDisappear', 64, 64, 32, 40, 5, (ctx, x, y, w, h, f) => drawEliteShieldDome(ctx, x, y, w, h, f, false));

  // ---- 4: IDPD FREAK (PopoFreak) ----
  const drawPopoFreak = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead' | 'revive'): void => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24;
    if (state === 'dead') {
      p.ellipse(cx, cy + 8, 12, 5, '#1e283c');
      p.ellipse(cx, cy + 6, 8, 3, '#3c5884');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const body = white ? '#ffffff' : '#4878b8';
    const flesh = white ? '#ffffff' : '#88b8d8';
    const dark = white ? '#d8d8d8' : '#243c64';
    const rise = state === 'revive' ? Math.max(0, 10 - f * 2) : 0;
    const stride = state === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
    const ty = cy + rise;

    if (state === 'revive') {
      p.ellipse(cx, cy + 10, 14, 5, '#3898ff');
      p.ellipse(cx, cy + 10, 8, 3, '#b8f4ff');
    }
    p.rect(cx - 7 + stride, ty + 8, 4, 6, dark);
    p.rect(cx + 3 - stride, ty + 8, 4, 6, dark);
    // Twisted hunched mutated IDPD armor + grotesque blue fleshy growths
    p.ellipse(cx, ty, 11, 10, body);
    p.ellipse(cx - 6, ty - 5, 6, 5, flesh);
    p.ellipse(cx + 6, ty - 2, 5, 6, flesh);
    p.rect(cx - 6, ty + 4, 12, 4, dark);
    // Cracked helmet + glowing cyan eyes & jagged grin
    p.rect(cx - 6, ty - 11, 12, 8, body);
    p.rect(cx - 5, ty - 8, 4, 3, '#68f4ff');
    p.rect(cx + 1, ty - 8, 4, 3, '#68f4ff');
    p.rect(cx - 5, ty - 3, 10, 3, INK);
    p.set(cx - 3, ty - 2, '#ffffff');
    p.set(cx + 2, ty - 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprPopoFreakIdle', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawPopoFreak(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprPopoFreakWalk', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawPopoFreak(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprPopoFreakHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawPopoFreak(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprPopoFreakDead', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawPopoFreak(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprPopoRevive', 48, 48, 24, 24, 8, (ctx, x, y, w, h, f) => drawPopoFreak(ctx, x, y, w, h, f, 'revive'));
  b.addSprite('sprPopoFreakGun', 19, 12, 5, 6, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 14, 4, '#3c68a8');
    p.rect(5, 4, 10, 2, '#78ecff');
    p.rect(4, 7, 3, 3, '#203860');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprPopoReviveArea', 35, 40, 17, 20, 6, (ctx, x, y, w, h, f) =>
    drawReviveCircle(ctx, x, y, w, h, f, '#3898ff', '#b8f4ff', '#1c4498'),
  );
  b.addSprite('sprPopoExplo', 96, 96, 48, 48, 8, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 48;
    const cy = 48;
    const r = 14 + f * 4.5;
    if (f === 0) {
      p.ellipse(cx, cy, 24, 24, '#ffffff');
    } else if (f < 5) {
      p.ellipse(cx, cy, Math.min(44, r), Math.min(44, r), '#1e54c8');
      p.ellipse(cx, cy, Math.min(36, r * 0.78), Math.min(36, r * 0.78), '#58c8ff');
      p.ellipse(cx, cy, Math.max(4, 24 - f * 4), Math.max(4, 24 - f * 4), '#ffffff');
    } else {
      p.pixelRing(cx, cy, Math.min(44, r), '#3888e8');
      p.pixelRing(cx, cy, Math.min(38, r - 5), '#88e8ff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- 5: BONEFISH (1-? Oasis) ----
  const drawBoneFish = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 12;
    const cy = 12;
    if (state === 'dead') {
      p.ellipse(cx, cy + 4, 7, 3, '#383430');
      p.rect(cx - 4, cy + 3, 7, 2, '#9e9888');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const bone = white ? '#ffffff' : '#e8e2cc';
    const boneDark = white ? '#d8d8d8' : '#a8a088';
    const fin = white ? '#ffffff' : '#4ca8a0';
    const wag = (f % 2 === 0 ? -1 : 1);
    // Translucent turquoise tail fin + dorsal spikes
    p.poly([[cx + 4, cy], [cx + 10, cy - 4 + wag], [cx + 10, cy + 4 + wag]], fin);
    p.rect(cx - 2, cy - 7, 2, 3, fin);
    p.rect(cx + 1, cy - 6, 2, 3, fin);
    // Ivory skeletal skull & ribcage fish body!
    p.ellipse(cx - 2, cy, 6, 4.5, bone);
    p.rect(cx + 1, cy - 3, 4, 6, boneDark);
    p.rect(cx + 1, cy - 2, 1, 4, bone);
    p.rect(cx + 3, cy - 2, 1, 4, bone);
    p.rect(cx - 6, cy - 2, 3, 3, INK);
    p.rect(cx - 7, cy + 2, 4, 1, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprBoneFish1Idle', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawBoneFish(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprBoneFish1Walk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawBoneFish(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprBoneFish1Hurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawBoneFish(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprBoneFish1Dead', 24, 24, 12, 12, 7, (ctx, x, y, w, h, f) => drawBoneFish(ctx, x, y, w, h, f, 'dead'));
  b.addAlias('sprBoneFishIdle', 'sprBoneFish1Idle');
  b.addAlias('sprBoneFishWalk', 'sprBoneFish1Walk');
  b.addAlias('sprBoneFishHurt', 'sprBoneFish1Hurt');
  b.addAlias('sprBoneFishDead', 'sprBoneFish1Dead');

  // ---- 6: HERMIT CRAB (1-? Oasis, 48x48) ----
  const drawCrab = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'fire' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24;
    if (state === 'dead') {
      p.ellipse(cx, cy + 8, 15, 7, '#342e28');
      p.ellipse(cx - 2, cy + 5, 11, 6, '#5c5040');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const shell = white ? '#ffffff' : '#8c7a5c';
    const shellHi = white ? '#ffffff' : '#baa888';
    const crab = white ? '#ffffff' : '#d86838';
    const crabHi = white ? '#ffffff' : '#ff9860';
    const stride = state === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
    // Bulky spiral mossy beige shell on back
    p.ellipse(cx, cy - 4, 14, 11, shell);
    p.ellipse(cx - 3, cy - 8, 9, 5, shellHi);
    p.line(cx - 10, cy - 4, cx + 10, cy - 6, '#5a4c38', 2);
    p.rect(cx - 8, cy - 11, 5, 3, '#3c8844'); // oasis moss patch
    // Red-orange crab body, legs & huge snapping claws!
    p.ellipse(cx, cy + 7, 13, 6, crab);
    p.rect(cx - 17, cy + 4 + stride, 7, 7, crab);
    p.rect(cx - 16, cy + 4 + stride, 5, 2, crabHi);
    p.rect(cx + 10, cy + 4 - stride, 7, 7, crab);
    p.rect(cx + 11, cy + 4 - stride, 5, 2, crabHi);
    p.rect(cx - 10 + stride, cy + 12, 3, 5, '#984020');
    p.rect(cx + 7 - stride, cy + 12, 3, 5, '#984020');
    // Stalked crab eyes + spitting green mouth on Fire!
    p.rect(cx - 5, cy + 1, 2, 4, crab);
    p.rect(cx + 3, cy + 1, 2, 4, crab);
    p.rect(cx - 6, cy - 1, 3, 3, '#ffffff');
    p.rect(cx + 3, cy - 1, 3, 3, '#ffffff');
    p.set(cx - 5, cy, INK);
    p.set(cx + 4, cy, INK);
    if (state === 'fire') {
      p.ellipse(cx, cy + 9, 5, 4, '#58e858');
      p.ellipse(cx, cy + 9, 2, 2, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprCrabIdle', 48, 48, 24, 24, 5, (ctx, x, y, w, h, f) => drawCrab(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprCrabWalk', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawCrab(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprCrabFire', 48, 48, 24, 24, 2, (ctx, x, y, w, h, f) => drawCrab(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprCrabHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawCrab(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprCrabDead', 48, 48, 24, 24, 7, (ctx, x, y, w, h, f) => drawCrab(ctx, x, y, w, h, f, 'dead'));

  // ---- 7: JUNGLE FLY (5-? Jungle) & FIRED MAGGOT ----
  const drawJungleFly = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    if (state === 'dead') {
      p.ellipse(cx, cy + 6, 13, 6, '#283020');
      p.ellipse(cx - 3, cy + 4, 8, 4, '#4c6428');
      p.ellipse(cx + 6, cy + 5, 5, 3, '#dfd49c');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const flap = f % 2 === 0 ? -3 : 2;
    // Translucent vibrating wings
    p.ellipse(cx - 9, cy - 4 + flap, 6, 4, '#d8e8c8');
    p.ellipse(cx + 9, cy - 4 - flap, 6, 4, '#d8e8c8');
    // Plump pale maggot abdomen + olive thorax
    p.ellipse(cx, cy + 4, 8, 6, white ? '#ffffff' : '#dfd49c');
    p.ellipse(cx, cy - 3, 7, 6, white ? '#ffffff' : '#4c6428');
    p.ellipse(cx - 2, cy - 5, 4, 3, white ? '#ffffff' : '#749440');
    // Giant red compound eyes!
    p.rect(cx - 5, cy - 7, 4, 4, white ? INK : '#ff4838');
    p.rect(cx + 1, cy - 7, 4, 4, white ? INK : '#ff4838');
    p.set(cx - 4, cy - 6, '#ffffff');
    p.set(cx + 2, cy - 6, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprJungleFlyIdle', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawJungleFly(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprJungleFlyWalk', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawJungleFly(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprJungleFlyHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawJungleFly(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprJungleFlyDead', 48, 48, 24, 24, 8, (ctx, x, y, w, h, f) => drawJungleFly(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprFiredMaggot', 16, 16, 8, 8, 2, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.ellipse(8, 8, 5, 3.5, '#dfd49c');
    p.ellipse(7, 7 + (f & 1), 3, 2, '#fff8d4');
    p.set(11, 7, '#ff3838');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- 8: SNOW BANDIT (5-1..5-3 Frozen City, 32x32) ----
  const drawSnowBandit = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 16;
    const cy = 16;
    if (state === 'dead') {
      p.ellipse(cx, cy + 6, 9, 4, '#445060');
      p.rect(cx - 5, cy + 4, 8, 3, '#98a8b8');
      p.rect(cx - 2, cy + 5, 4, 2, '#e85824');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const parka = white ? '#ffffff' : '#dce6f0';
    const shade = white ? '#e0e0e0' : '#7c98b4';
    const scarf = white ? '#ffffff' : '#e85824';
    const stride = state === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
    const ty = cy + (state === 'walk' && f % 2 === 0 ? -1 : 0);
    p.rect(cx - 5 + stride, ty + 7, 3, 4, '#2c3442');
    p.rect(cx + 2 - stride, ty + 7, 3, 4, '#2c3442');
    // Frosty white snow parka & puffy hood
    p.rect(cx - 7, ty - 7, 14, 14, parka);
    p.rect(cx - 6, ty - 8, 12, 3, '#ffffff');
    p.rect(cx - 7, ty + 3, 14, 4, shade);
    // Bright carrot-orange scarf & dark mask + glowing eyes
    p.rect(cx - 7, ty - 1, 14, 3, scarf);
    p.rect(cx - 5, ty - 5, 10, 4, '#1c202c');
    p.rect(cx - 4, ty - 4, 2, 2, '#ff5c28');
    p.rect(cx + 2, ty - 4, 2, 2, '#ff5c28');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprSnowBanditIdle', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawSnowBandit(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprSnowBanditWalk', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawSnowBandit(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprSnowBanditHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSnowBandit(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprSnowBanditDead', 32, 32, 16, 16, 7, (ctx, x, y, w, h, f) => drawSnowBandit(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprSnowBanditGun', 24, 8, 8, 2, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 5, 3, '#744c2c');
    p.rect(6, 2, 15, 3, '#8c9eb4');
    p.rect(7, 2, 13, 1, '#dce8f4');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- 9: JOCK (3-? Mansion, 48x48) & JOCK ROCKET ----
  const drawJock = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'fire' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24;
    if (state === 'dead') {
      p.ellipse(cx, cy + 8, 14, 6, '#2c1c24');
      p.rect(cx - 8, cy + 5, 16, 4, '#5e2236');
      p.rect(cx - 4, cy + 5, 8, 2, '#b89428');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const body = white ? '#ffffff' : '#7c2c48';
    const hi = white ? '#ffffff' : '#b2486c';
    const gold = white ? '#ffffff' : '#f5c838';
    const stride = state === 'walk' ? (f % 2 === 0 ? 2 : -2) : 0;
    const ty = cy + (state === 'walk' && f % 2 === 0 ? -1 : 0);
    p.rect(cx - 8 + stride, ty + 10, 5, 6, '#281822');
    p.rect(cx + 3 - stride, ty + 10, 5, 6, '#281822');
    // Massive varsity-jacket brute torso + gold shoulder pads!
    p.rect(cx - 12, ty - 8, 24, 18, body);
    p.rect(cx - 10, ty - 7, 10, 14, hi);
    p.rect(cx - 15, ty - 8, 6, 8, gold);
    p.rect(cx + 9, ty - 8, 6, 8, gold);
    p.rect(cx - 2, ty - 7, 4, 16, '#f4eedc'); // varsity cream center stripe
    // Head & shades
    p.rect(cx - 6, ty - 15, 12, 8, '#a46484');
    p.rect(cx - 5, ty - 13, 10, 3, INK);
    p.rect(cx - 4, ty - 12, 8, 1, gold);
    // Shoulder rocket launcher!
    p.rect(cx + 4, ty - 13, 16, 6, '#485442');
    p.rect(cx + 5, ty - 13, 14, 2, '#78886e');
    if (state === 'fire') {
      p.ellipse(cx + 20, ty - 10, 4, 4, '#ff7820');
      p.rect(cx + 19, ty - 11, 2, 2, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprJockIdle', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawJock(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprJockWalk', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawJock(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprJockFire', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawJock(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprJockHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawJock(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprJockDead', 48, 48, 24, 24, 6, (ctx, x, y, w, h, f) => drawJock(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprJockRocket', 16, 8, 4, 4, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 3, 3, 2, '#ff781c');
    p.rect(4, 2, 8, 4, '#f5c838');
    p.rect(12, 2, 3, 4, '#d82834');
    p.set(14, 3, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- 10: MOLESARGE (3-? Mansion, 24x24) ----
  const drawMolesarge = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 12;
    const cy = 12;
    if (state === 'dead') {
      p.ellipse(cx, cy + 5, 7, 3, '#2c2238');
      p.rect(cx - 4, cy + 3, 8, 2, '#5e4a8c');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const stride = state === 'walk' ? (f % 2 === 0 ? 1 : -1) : 0;
    p.rect(cx - 4 + stride, cy + 5, 3, 3, '#261e30');
    p.rect(cx + 1 - stride, cy + 5, 3, 3, '#261e30');
    p.ellipse(cx, cy, 6.5, 6, white ? '#ffffff' : '#5e4a8c');
    p.rect(cx - 4, cy - 3, 8, 2, white ? '#ffffff' : '#9480c4');
    // Iconic crimson sergeant beret & fierce yellow eyes!
    p.rect(cx - 6, cy - 8, 12, 4, white ? '#ffffff' : '#d82838');
    p.rect(cx - 5, cy - 8, 8, 1, '#ff6874');
    p.rect(cx - 4, cy - 3, 3, 2, '#ffe848');
    p.rect(cx + 1, cy - 3, 3, 2, '#ffe848');
    p.rect(cx - 3, cy + 1, 6, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprMolesargeIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawMolesarge(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprMolesargeWalk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMolesarge(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprMolesargeHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawMolesarge(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprMolesargeDead', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMolesarge(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprMolesargeGun', 21, 8, 4, 3, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 3, 5, 3, '#88522c');
    p.rect(6, 2, 13, 3, '#d8a834');
    p.rect(7, 2, 11, 1, '#fff088');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  // ---- 11: SUPER FIREBALLER (3-? Mansion, 36x36, orig 18,24) ----
  const drawSuperFireBaller = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'fire' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 18;
    const cy = 20;
    if (state === 'dead') {
      p.ellipse(cx, cy + 6, 11, 5, '#341e18');
      p.ellipse(cx, cy + 4, 7, 3, '#782818');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const flare = (f & 1) === 0 ? 0 : 2;
    // Blazing crown of flames on top!
    p.poly([[cx - 10, cy - 6], [cx - 8, cy - 17 - flare], [cx - 3, cy - 9]], white ? '#ffffff' : '#ffd838');
    p.poly([[cx - 4, cy - 9], [cx, cy - 19 + flare], [cx + 4, cy - 9]], white ? '#ffffff' : '#fff8a0');
    p.poly([[cx + 3, cy - 9], [cx + 8, cy - 17 - flare], [cx + 10, cy - 6]], white ? '#ffffff' : '#ffd838');
    // Giant floating blazing crimson/orange fireball body
    p.ellipse(cx, cy, 12 + (state === 'fire' ? 1 : 0), 11, white ? '#ffffff' : '#f04818');
    p.ellipse(cx - 2, cy - 2, 8, 7, white ? '#ffffff' : '#ff9828');
    p.ellipse(cx - 3, cy - 4, 4, 3, '#fff498');
    // Fierce blazing white eyes & fiery grin
    p.rect(cx - 6, cy - 2, 4, 3, '#ffffff');
    p.rect(cx + 2, cy - 2, 4, 3, '#ffffff');
    p.rect(cx - 6, cy + 4, 12, 3, state === 'fire' ? '#ffffff' : '#ffd838');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprSuperFireBallerIdle', 36, 36, 18, 24, 6, (ctx, x, y, w, h, f) => drawSuperFireBaller(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprSuperFireBallerFire', 36, 36, 18, 24, 3, (ctx, x, y, w, h, f) => drawSuperFireBaller(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprSuperFireBallerHurt', 36, 36, 18, 24, 3, (ctx, x, y, w, h, f) => drawSuperFireBaller(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprSuperFireBallerDead', 36, 36, 18, 24, 6, (ctx, x, y, w, h, f) => drawSuperFireBaller(ctx, x, y, w, h, f, 'dead'));

  // ---- 12: HEALTH MIMIC (SuperMimic, 32x32) ----
  const drawSuperMimic = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'tell' | 'fire' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 16;
    const cy = 16;
    if (state === 'dead') {
      p.ellipse(cx, cy + 6, 10, 4, '#382226');
      p.rect(cx - 7, cy + 3, 14, 4, '#8c2832');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const open = state === 'fire' || (state === 'tell' && f >= 2);
    // White & crimson Health Chest casing!
    p.rect(cx - 9, cy - 7, 18, 14, white ? '#ffffff' : '#eef2f6');
    p.rect(cx - 8, cy - 7, 16, 2, '#ffffff');
    p.rect(cx - 9, cy + 4, 18, 3, '#b8c0cc');
    if (open) {
      // Splits wide open revealing crimson fanged maw & lashing tongue!
      p.rect(cx - 8, cy - 3, 16, 7, '#18080c');
      for (let t = -6; t <= 6; t += 3) {
        p.rect(cx + t, cy - 3, 2, 2, '#ffffff');
        p.rect(cx + t, cy + 2, 2, 2, '#ffffff');
      }
      p.rect(cx - 4, cy, 8, 3, '#e42838');
      p.rect(cx - 6, cy - 6, 3, 2, '#ff3844');
      p.rect(cx + 3, cy - 6, 3, 2, '#ff3844');
    } else {
      // Disguised as crisp red medkit cross!
      p.rect(cx - 2, cy - 4, 4, 8, '#e42838');
      p.rect(cx - 4, cy - 2, 8, 4, '#e42838');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprSuperMimicIdle', 32, 32, 16, 16, 1, (ctx, x, y, w, h, f) => drawSuperMimic(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprSuperMimicTell', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawSuperMimic(ctx, x, y, w, h, f, 'tell'));
  b.addSprite('sprSuperMimicFire', 32, 32, 16, 16, 4, (ctx, x, y, w, h, f) => drawSuperMimic(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprSuperMimicHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSuperMimic(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprSuperMimicDead', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) => drawSuperMimic(ctx, x, y, w, h, f, 'dead'));

  // ---- 13: CURSED SPIDER (InvSpider, 24x24) ----
  const drawInvSpider = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 12;
    const cy = 12;
    if (state === 'dead') {
      p.ellipse(cx, cy + 4, 7, 3, '#261436');
      p.rect(cx - 4, cy + 3, 8, 2, '#5a2284');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const stride = state === 'walk' ? (f % 2 === 0 ? 1 : -1) : 0;
    for (let leg = -1; leg <= 1; leg++) {
      const ly = cy + leg * 3 + (leg % 2 === 0 ? stride : -stride);
      p.line(cx - 4, cy + leg, cx - 10, ly - 2, white ? '#ffffff' : '#e858ff', 1);
      p.line(cx + 4, cy + leg, cx + 10, ly - 2, white ? '#ffffff' : '#e858ff', 1);
    }
    p.ellipse(cx, cy, 6, 5, white ? '#ffffff' : '#6c2898');
    p.ellipse(cx - 1, cy - 1, 3.5, 2.5, white ? '#ffffff' : '#a848e0');
    p.set(cx - 2, cy + 1, '#ff78ff');
    p.set(cx, cy + 2, '#ffffff');
    p.set(cx + 2, cy + 1, '#ff78ff');
    // Cursed purple smoke pixel
    p.set(cx - 6 + (f % 3) * 5, cy - 7, '#a848e0');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprInvSpiderIdle', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawInvSpider(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprInvSpiderWalk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawInvSpider(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprInvSpiderHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawInvSpider(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprInvSpiderDead', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawInvSpider(ctx, x, y, w, h, f, 'dead'));

  // ---- 14: CURSED LASER CRYSTAL (InvLaserCrystal, 48x48) ----
  const drawInvCrystal = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'fire' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24;
    if (state === 'dead') {
      p.ellipse(cx, cy + 8, 12, 5, '#261238');
      p.poly([[cx - 8, cy + 8], [cx - 4, cy + 1], [cx + 2, cy + 8]], '#6c24a8');
      p.poly([[cx + 2, cy + 8], [cx + 8, cy + 3], [cx + 12, cy + 8]], '#a848e0');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    p.poly([[cx - 11, cy + 10], [cx - 17, cy - 2], [cx - 9, cy - 8], [cx - 6, cy + 12]], white ? '#ffffff' : '#4a1474');
    p.poly([[cx + 11, cy + 10], [cx + 17, cy - 2], [cx + 9, cy - 8], [cx + 6, cy + 12]], white ? '#ffffff' : '#4a1474');
    p.poly([[cx, cy - 20], [cx + 13, cy - 2], [cx + 10, cy + 18], [cx - 10, cy + 18], [cx - 13, cy - 2]], white ? '#ffffff' : '#7c24b8');
    p.poly([[cx, cy - 19], [cx - 12, cy - 2], [cx - 9, cy + 17], [cx, cy + 17]], white ? '#ffffff' : '#ff78f8');
    p.poly([[cx, cy - 18], [cx - 6, cy - 5], [cx, cy - 1]], '#ffffff');
    p.poly([[cx, cy - 7], [cx + 6, cy], [cx, cy + 7], [cx - 6, cy]], state === 'fire' ? '#ffffff' : '#e848ff');
    p.rect(cx - 2, cy - 2, 4, 4, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprInvLaserCrystalIdle', 48, 48, 24, 24, 5, (ctx, x, y, w, h, f) => drawInvCrystal(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprInvLaserCrystalFire', 48, 48, 24, 24, 2, (ctx, x, y, w, h, f) => drawInvCrystal(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprInvLaserCrystalHurt', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => drawInvCrystal(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprInvLaserCrystalDead', 48, 48, 24, 24, 7, (ctx, x, y, w, h, f) => drawInvCrystal(ctx, x, y, w, h, f, 'dead'));

  // ---- 15: RAD MAGGOT (16x16) ----
  const drawRadMaggot = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    if (state === 'dead') {
      p.ellipse(8, 10, 5, 2, '#205224');
      p.rect(6, 9, 4, 1, '#58c848');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    for (let seg = -2; seg <= 2; seg++) {
      const sx = 8 + seg * 2;
      const sy = 8 + ((seg + f) % 2 === 0 ? 0 : 1);
      p.ellipse(sx, sy, 2, 2.5, white ? '#ffffff' : seg % 2 === 0 ? '#68ff48' : '#34b828');
      p.set(sx, sy - 1, '#d8ff98');
    }
    p.set(12, 7, INK);
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprRadMaggot', 16, 16, 8, 8, 4, (ctx, x, y, w, h, f) => drawRadMaggot(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprRadMaggotIdle', 'sprRadMaggot');
  b.addSprite('sprRadMaggotHurt', 16, 16, 8, 8, 3, (ctx, x, y, w, h, f) => drawRadMaggot(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprRadMaggotDead', 16, 16, 8, 8, 6, (ctx, x, y, w, h, f) => drawRadMaggot(ctx, x, y, w, h, f, 'dead'));

  // ---- 16: BALLGUY (SuperFrog, 24x24 — distinct from dark bubbly toxic Exploder!) ----
  const drawSuperFrog = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'hurt' | 'dead'): void => {
    const p = new PxCanvas(w, h);
    const cx = 12;
    const cy = 12;
    if (state === 'dead') {
      p.ellipse(cx, cy + 5, 7, 3, '#263822');
      p.ellipse(cx, cy + 4, 5, 2, '#4a7a38');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }
    const white = state === 'hurt' && f === 0;
    const hop = state === 'walk' && f % 2 === 0 ? -1 : 0;
    p.ellipse(cx, cy + 1 + hop, 7, 6.5, white ? '#ffffff' : '#68b848');
    p.ellipse(cx, cy + 3 + hop, 5, 3.5, white ? '#ffffff' : '#a8e878');
    // Wide derpy eyes
    p.rect(cx - 5, cy - 4 + hop, 3, 3, '#ffffff');
    p.rect(cx + 2, cy - 4 + hop, 3, 3, '#ffffff');
    p.set(cx - 4, cy - 3 + hop, INK);
    p.set(cx + 3, cy - 3 + hop, INK);
    p.rect(cx - 4, cy + 1 + hop, 8, 1, '#204a18');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprSuperFrogIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawSuperFrog(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprSuperFrogWalk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawSuperFrog(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprSuperFrogHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawSuperFrog(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprSuperFrogDead', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawSuperFrog(ctx, x, y, w, h, f, 'dead'));

  // ---- 17: SNOWBOT CAR (64x64) ----
  const drawSnowBotCar = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'walk' | 'lift' | 'throw' | 'hurt'): void => {
    const p = new PxCanvas(w, h);
    const cx = 32;
    const cy = 36;
    const white = state === 'hurt' && f === 0;
    const stride = state === 'walk' ? (f % 2 === 0 ? 3 : -3) : 0;
    const carY = state === 'lift' ? cy - 6 - f * 4 : state === 'throw' ? cy - 20 + f * 3 : cy - 18 + (f & 1);
    const carX = state === 'throw' ? cx + f * 4 : cx;

    // Fur-collared Snowbot standing underneath
    p.rect(cx - 8 + stride, cy + 10, 5, 7, '#525a64');
    p.rect(cx + 3 - stride, cy + 10, 5, 7, '#525a64');
    p.rect(cx - 10, cy - 3, 20, 14, white ? '#ffffff' : '#949ea8');
    p.ellipse(cx, cy - 5, 12, 6, white ? '#ffffff' : '#8c623a');
    p.rect(cx - 5, cy - 10, 10, 8, white ? '#ffffff' : '#949ea8');
    p.rect(cx - 2, cy - 7, 4, 2, '#ff2e28');
    // Raised steel arms gripping frosted sedan overhead!
    p.rect(cx - 15, carY + 6, 5, Math.max(4, cy - carY - 6), '#949ea8');
    p.rect(cx + 10, carY + 6, 5, Math.max(4, cy - carY - 6), '#949ea8');
    // Frosted blue-gray sedan hoisted overhead!
    p.rect(carX - 18, carY - 5, 36, 12, white ? '#ffffff' : '#6a8ba8');
    p.rect(carX - 16, carY - 5, 32, 3, '#a8c8e0');
    p.rect(carX - 11, carY - 10, 22, 6, '#506c86');
    p.rect(carX - 8, carY - 9, 16, 4, '#bce8ff');
    p.ellipse(carX - 11, carY + 7, 4, 4, '#20242c');
    p.ellipse(carX + 11, carY + 7, 4, 4, '#20242c');
    p.outline(INK);
    p.flush(ctx, x, y);
  };
  b.addSprite('sprSnowBotCarIdle', 64, 64, 32, 32, 6, (ctx, x, y, w, h, f) => drawSnowBotCar(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprSnowBotCarWalk', 64, 64, 32, 32, 6, (ctx, x, y, w, h, f) => drawSnowBotCar(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprSnowBotCarLift', 64, 64, 32, 32, 4, (ctx, x, y, w, h, f) => drawSnowBotCar(ctx, x, y, w, h, f, 'lift'));
  b.addSprite('sprSnowBotCarThrow', 64, 64, 32, 32, 5, (ctx, x, y, w, h, f) => drawSnowBotCar(ctx, x, y, w, h, f, 'throw'));
  b.addSprite('sprSnowBotCarHurt', 64, 64, 32, 32, 3, (ctx, x, y, w, h, f) => drawSnowBotCar(ctx, x, y, w, h, f, 'hurt'));

  // ---- EXISTING ENEMY STATE EXTRAS ----
  // Feigning dead Assassin (sprMeleeFake, 24x24, 6f)
  b.addSprite('sprMeleeFake', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.ellipse(12, 16, 7, 3.5, '#2e2a38');
    p.rect(8, 13, 8, 4, '#4a4658');
    // Subtle peeking eye glint on later frames!
    if (f >= 4) p.set(14, 14, '#ffffff');
    p.rect(6, 17, 10, 2, '#d8e0e8'); // concealed pipe
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  // Roaring charging Rat King (sprRatkingRageWait 48x48, sprRatkingRageAttack 64x48)
  b.addSprite('sprRatkingRageWait', 48, 48, 24, 24, 3, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 24;
    const cy = 24 + (f & 1);
    p.ellipse(cx - 12, cy - 11, 5, 5, '#34582a');
    p.ellipse(cx + 12, cy - 11, 5, 5, '#34582a');
    p.ellipse(cx, cy, 16, 13, '#5a8e4c');
    p.ellipse(cx - 3, cy - 4, 10, 6, '#88c074');
    p.rect(cx - 8, cy - 5, 5, 4, '#ff2828');
    p.rect(cx + 3, cy - 5, 5, 4, '#ff2828');
    p.ellipse(cx, cy + 5, 11, 6, '#141c12');
    p.ellipse(cx, cy + 6, 8, 4, '#b8ff48');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  b.addSprite('sprRatkingRageAttack', 64, 48, 32, 24, 2, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 32;
    const cy = 24;
    // Motion lines behind lunging Rat King!
    p.line(4, cy - 8, 16, cy - 8, '#b8ff48', 2);
    p.line(2, cy, 14, cy, '#ffffff', 2);
    p.line(6, cy + 8, 18, cy + 8, '#b8ff48', 2);
    p.ellipse(cx + 4, cy, 18, 13, '#5a8e4c');
    p.ellipse(cx + 1, cy - 4, 12, 6, '#88c074');
    p.rect(cx + 6, cy - 6, 5, 4, '#ff2828');
    p.ellipse(cx + 14, cy + 3, 9, 6, '#141c12');
    p.ellipse(cx + 14, cy + 3, 6, 4, f === 0 ? '#eeff80' : '#b8ff48');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  // Mossy Jungle Assassin Pipe (27x4)
  b.addSprite('sprJunglePipe', 27, 4, 13, 2, 1, (ctx, x, y, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 1, 25, 2, '#5c6654');
    p.rect(2, 1, 22, 1, '#98aa88');
    p.rect(7, 1, 5, 2, '#3a8c34');
    p.rect(17, 1, 4, 2, '#4cb83c');
    p.outline(INK);
    p.flush(ctx, x, y);
  });
  // Gamma Guts 96x96 green kill shockwave ring (sprGammaBlast, 96x96, 3f)
  b.addSprite('sprGammaBlast', 96, 96, 48, 48, 3, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 48;
    const cy = 48;
    const r = 18 + f * 13;
    p.pixelRing(cx, cy, Math.min(45, r + 2), '#248c20');
    p.pixelRing(cx, cy, Math.min(44, r), '#6cf844');
    p.pixelRing(cx, cy, Math.max(4, Math.min(42, r - 2)), '#e4ff98');
    if (f === 0) {
      p.ellipse(cx, cy, 12, 12, '#6cf844');
      p.ellipse(cx, cy, 6, 6, '#ffffff');
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  });
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

  b.addSprite('sprScrapBossIdle', 72, 68, 36, 34, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprScrapBossSleep', 72, 68, 36, 34, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'sleep'));
  b.addSprite('sprScrapBossWalk', 72, 68, 36, 34, 4, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'walk'));
  b.addSprite('sprScrapBossHurt', 72, 68, 36, 34, 1, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprScrapBossDead', 72, 68, 36, 34, 6, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'dead'));
  b.addSprite('sprScrapBossFire', 72, 68, 36, 34, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'fire'));
  b.addSprite('sprScrapBossCharge', 72, 68, 36, 34, 2, (ctx, x, y, w, h, f) => drawBigDog1x(ctx, x, y, w, h, f, 'charge'));
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

  b.addSprite('sprNothing2Idle', 112, 112, 56, 56, 2, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprNothing2Walk', 'sprNothing2Idle');
  b.addSprite('sprNothing2Hurt', 112, 112, 56, 56, 1, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprNothing2Death', 112, 112, 56, 56, 1, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'death'));
  b.addAlias('sprNothing2Dead', 'sprNothing2Death');
  b.addSprite('sprNothing2Appear', 112, 112, 56, 56, 2, (ctx, x, y, w, h, f) => drawThroneII1x(ctx, x, y, w, h, f, 'appear'));
  b.addAlias('sprNothing2Fire', 'sprNothing2Appear');
  b.addAlias('sprNothing2Dash', 'sprNothing2Idle');

  // 1b. ALL 4 NEW BOSSES (MOM, HYPER CRYSTAL, TECHNOMANCER, CAPTAIN) + HOSTILE HORROR + 17 MISSING ENEMIES + EXTRAS
  registerMissingBossesAndEnemies(b);

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
