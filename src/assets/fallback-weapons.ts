import type { WeaponDef } from '@/contracts';
import { WEAPONS } from '@/data/weapons';
import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas } from './pixel-art';

const INK = '#0d0a10';

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
  metalHi: string;
  metalDark: string;
  grip: string;
  gripDark: string;
  glow: string;
  glowHi: string;
  isGold: boolean;
  isUltra: boolean;
}

function getWeaponPalette(w: WeaponDef): WeaponPalette {
  const id = w.id.toLowerCase();
  if (w.golden || id.includes('gold')) {
    return { metal: '#f5c838', metalHi: '#fff498', metalDark: '#b27e16', grip: '#824c28', gripDark: '#522c14', glow: '#fff498', glowHi: '#ffffff', isGold: true, isUltra: false };
  }
  if (w.ultra || id.includes('ultra')) {
    return { metal: '#586874', metalHi: '#8ca0ae', metalDark: '#303a44', grip: '#28303a', gripDark: '#161c24', glow: '#48f048', glowHi: '#d4ffb8', isGold: false, isUltra: true };
  }
  if (w.cursed) {
    return { metal: '#7c48b8', metalHi: '#b47cf0', metalDark: '#482470', grip: '#341e44', gripDark: '#1e102a', glow: '#e058ff', glowHi: '#ffc8ff', isGold: false, isUltra: false };
  }
  if (id.includes('blood')) {
    return { metal: '#c8343c', metalHi: '#f06870', metalDark: '#7c1a24', grip: '#48222a', gripDark: '#2a1016', glow: '#ff5260', glowHi: '#ffc0c8', isGold: false, isUltra: false };
  }
  if (id.includes('rogue') || id.includes('ion') || w.sprite.includes('Popo')) {
    return { metal: '#3c74c8', metalHi: '#78b0f8', metalDark: '#204484', grip: '#26344c', gripDark: '#141e30', glow: '#58e8ff', glowHi: '#e0fcff', isGold: false, isUltra: false };
  }
  if (id.includes('rusty')) {
    return { metal: '#a8643c', metalHi: '#d49064', metalDark: '#6c3a1e', grip: '#5a341c', gripDark: '#381e0e', glow: '#f0b070', glowHi: '#ffe4b8', isGold: false, isUltra: false };
  }
  if (id.includes('toxic') || id.includes('frog')) {
    return { metal: '#52a848', metalHi: '#8ce078', metalDark: '#2c6824', grip: '#3e4c34', gripDark: '#242e1e', glow: '#98ff48', glowHi: '#e8ffb8', isGold: false, isUltra: false };
  }
  if (id.includes('flame') || id.includes('dragon') || id.includes('incinerator') || id.includes('flare')) {
    return { metal: '#c04c30', metalHi: '#ec7c58', metalDark: '#7c2818', grip: '#462a20', gripDark: '#2a1610', glow: '#ffa828', glowHi: '#fff498', isGold: false, isUltra: false };
  }
  if (id.includes('black')) {
    return { metal: '#3c384a', metalHi: '#68627c', metalDark: '#201e2a', grip: '#c83038', gripDark: '#7c1820', glow: '#b498ff', glowHi: '#e8dcff', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'energy') {
    // Sleek gunmetal steel + vibrant NEON-GREEN laser/plasma coils (matching reference video!)
    const isLightning = id.includes('lightning');
    return {
      metal: '#7c8896',
      metalHi: '#b8c4d0',
      metalDark: '#48525e',
      grip: '#343c48',
      gripDark: '#1e242e',
      glow: isLightning ? '#48d8ff' : '#48f048',
      glowHi: isLightning ? '#e0fcff' : '#d8ffc0',
      isGold: false,
      isUltra: false,
    };
  }
  if (w.ammoType === 'bolt') {
    return { metal: '#987248', metalHi: '#c89e6c', metalDark: '#5e4224', grip: '#583820', gripDark: '#362010', glow: '#58e858', glowHi: '#d4ffd4', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'explosive') {
    return { metal: '#5c7852', metalHi: '#8aa87e', metalDark: '#384c32', grip: '#5c422c', gripDark: '#382618', glow: '#ff8c28', glowHi: '#fff088', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'shell') {
    return { metal: '#6c7684', metalHi: '#9ea8b6', metalDark: '#404852', grip: '#9a5a30', gripDark: '#643618', glow: '#ff6c30', glowHi: '#ffd888', isGold: false, isUltra: false };
  }
  return { metal: '#8a94a2', metalHi: '#c4ceda', metalDark: '#505864', grip: '#885230', gripDark: '#543018', glow: '#ffe048', glowHi: '#ffffff', isGold: false, isUltra: false };
}

/**
 * Draws crisp compact native 1x black-outlined horizontal weapons (22x12, orig 6,6).
 * Compact lengths (~11-19px) so guns sit naturally in mutant hands AND cleanly in the HUD!
 */
function drawWeapon1x(ctx: DrawCtx, x: number, y: number, w: number, h: number, def: WeaponDef): void {
  const p = new PxCanvas(w, h);
  const shape = classifyWeaponShape(def);
  const pal = getWeaponPalette(def);
  const my = Math.floor(h / 2); // 6

  switch (shape) {
    case 'eggplant': {
      p.rect(4, my - 2, 3, 4, '#48b848');
      p.rect(7, my - 3, 9, 6, '#7a32b8');
      p.rect(8, my - 2, 6, 2, '#a85ce4');
      p.rect(16, my - 2, 2, 4, '#581e88');
      break;
    }
    case 'guitar': {
      p.rect(3, my - 3, 6, 6, pal.metal);
      p.rect(4, my - 2, 4, 2, pal.metalHi);
      p.rect(5, my - 1, 2, 2, INK);
      p.rect(9, my - 1, 9, 2, pal.grip);
      p.rect(18, my - 2, 2, 4, pal.metalDark);
      break;
    }
    case 'wrench': {
      p.rect(3, my - 1, 11, 2, pal.metal);
      p.rect(4, my - 1, 9, 1, pal.metalHi);
      p.rect(14, my - 3, 5, 6, pal.metal);
      p.rect(15, my - 3, 3, 1, pal.metalHi);
      p.rect(16, my - 1, 3, 2, ''); // C-jaw cutout
      break;
    }
    case 'screwdriver': {
      const handleCol = def.id.includes('energy') ? pal.glow : '#e03434';
      p.rect(3, my - 2, 6, 4, handleCol);
      p.rect(4, my - 2, 4, 1, '#ffffff');
      p.rect(9, my - 1, 9, 2, pal.metal);
      p.rect(10, my - 1, 7, 1, pal.metalHi);
      break;
    }
    case 'shovel': {
      p.rect(3, my - 1, 10, 2, pal.grip);
      p.rect(13, my - 3, 6, 6, pal.metal);
      p.rect(14, my - 2, 4, 2, pal.metalHi);
      p.rect(19, my - 2, 1, 4, pal.metalHi);
      break;
    }
    case 'sword': {
      const isEnergy = def.id.includes('energy');
      if (isEnergy) {
        p.rect(3, my - 1, 4, 2, '#4a5464');
        p.rect(7, my - 3, 2, 6, '#7a8898');
        p.rect(9, my - 2, 10, 4, '#42f058');
        p.rect(10, my - 1, 10, 2, '#e4ffe8');
      } else {
        p.rect(3, my - 1, 4, 2, pal.grip);
        p.rect(7, my - 3, 2, 6, pal.glow);
        p.rect(9, my - 2, 10, 3, pal.metal);
        p.rect(9, my - 2, 11, 1, '#ffffff');
      }
      break;
    }
    case 'hammer': {
      p.rect(3, my - 1, 10, 2, pal.grip);
      p.rect(12, my - 4, 7, 8, pal.metal);
      p.rect(13, my - 4, 5, 2, pal.metalHi);
      if (def.ammoType === 'energy') {
        p.rect(14, my - 2, 3, 4, pal.glow);
        p.set(15, my - 1, '#ffffff');
      }
      break;
    }
    case 'crossbow': {
      // Compact bow arms + stock + bright bolt tip
      p.rect(13, my - 4, 2, 9, pal.metalDark);
      p.set(12, my - 4, pal.metal);
      p.set(12, my + 4, pal.metal);
      p.rect(3, my - 1, 13, 2, pal.metal);
      p.rect(5, my + 1, 3, 2, pal.grip);
      p.rect(10, my, 9, 1, pal.glow);
      p.set(18, my, pal.glowHi);
      break;
    }
    case 'disc': {
      p.rect(4, my - 2, 10, 4, pal.metal);
      p.rect(5, my - 2, 8, 1, pal.metalHi);
      p.rect(13, my - 3, 5, 6, pal.glow);
      p.rect(15, my - 1, 2, 2, '#ffffff');
      p.rect(6, my + 2, 3, 2, pal.grip);
      break;
    }
    case 'bazooka': {
      p.rect(2, my - 2, 16, 4, pal.metal);
      p.rect(3, my - 2, 14, 1, pal.metalHi);
      p.rect(16, my - 3, 4, 6, pal.glow);
      p.rect(17, my - 2, 2, 2, pal.glowHi);
      p.rect(6, my + 2, 3, 2, pal.grip);
      p.rect(12, my + 2, 2, 2, pal.gripDark);
      break;
    }
    case 'nader': {
      p.rect(3, my - 1, 4, 3, pal.grip);
      p.rect(6, my - 2, 12, 4, pal.metal);
      p.rect(7, my - 2, 10, 1, pal.metalHi);
      p.rect(9, my + 1, 5, 3, pal.metalDark); // drum cylinder
      p.rect(10, my + 1, 2, 1, pal.glow);
      break;
    }
    case 'minigun': {
      p.rect(3, my - 3, 7, 6, pal.metalDark);
      p.rect(5, my - 4, 4, 1, pal.metalHi);
      p.rect(10, my - 3, 10, 2, pal.metalHi);
      p.rect(10, my - 1, 10, 2, pal.metal);
      p.rect(10, my + 1, 10, 2, pal.metalDark);
      p.rect(15, my - 3, 2, 6, pal.glow);
      break;
    }
    case 'multi_mg': {
      p.rect(3, my - 1, 4, 3, pal.grip);
      p.rect(6, my - 3, 7, 5, pal.metal);
      p.rect(13, my - 3, 7, 2, pal.metalHi);
      p.rect(13, my - 1, 7, 2, pal.metal);
      p.rect(13, my + 1, 7, 2, pal.metalDark);
      p.rect(9, my + 2, 3, 2, pal.metalDark);
      break;
    }
    case 'double_shotgun':
    case 'flak': {
      p.rect(3, my, 4, 3, pal.grip);
      p.rect(6, my - 3, 12, 2, pal.metalHi);
      p.rect(6, my - 1, 12, 2, pal.metalDark);
      p.rect(9, my + 1, 5, 2, pal.grip);
      break;
    }
    case 'shotgun': {
      p.rect(3, my, 4, 3, pal.grip);
      p.rect(6, my - 2, 12, 3, pal.metal);
      p.rect(7, my - 2, 10, 1, pal.metalHi);
      p.rect(10, my + 1, 5, 2, pal.grip);
      break;
    }
    case 'flamer': {
      p.rect(3, my - 2, 13, 4, pal.metal);
      p.rect(7, my + 1, 6, 3, '#dc3428');
      p.rect(16, my - 2, 3, 3, pal.glow);
      p.set(17, my - 1, pal.glowHi);
      break;
    }
    case 'plasma':
    case 'lightning': {
      p.rect(4, my - 3, 14, 5, pal.metal);
      p.rect(5, my - 3, 12, 1, pal.metalHi);
      p.rect(8, my - 2, 3, 3, pal.glow);
      p.rect(12, my - 2, 3, 3, pal.glow);
      p.set(9, my - 1, pal.glowHi);
      p.set(13, my - 1, pal.glowHi);
      p.rect(17, my - 2, 2, 3, pal.glow);
      p.rect(5, my + 2, 3, 2, pal.grip);
      break;
    }
    case 'laser_rifle': {
      p.rect(3, my - 1, 4, 3, pal.grip);
      p.rect(6, my - 3, 11, 5, pal.metal);
      p.rect(7, my - 3, 9, 1, pal.metalHi);
      p.rect(9, my - 2, 5, 2, pal.glow);
      p.rect(10, my - 2, 3, 1, pal.glowHi);
      p.rect(17, my - 2, 3, 3, pal.metalDark);
      p.set(19, my - 1, pal.glow);
      break;
    }
    case 'laser_pistol': {
      // Compact sleek steel + neon-green Laser Pistol (NOT an oversized purple blaster!)
      p.rect(5, my - 3, 10, 4, pal.metal);
      p.rect(6, my - 3, 8, 1, pal.metalHi);
      p.rect(8, my - 2, 4, 2, pal.glow);
      p.rect(9, my - 2, 2, 1, pal.glowHi);
      p.rect(14, my - 2, 2, 2, pal.glow);
      p.rect(5, my + 1, 3, 3, pal.grip);
      break;
    }
    case 'rifle': {
      p.rect(3, my - 1, 4, 3, pal.grip);
      p.rect(6, my - 2, 13, 3, pal.metal);
      p.rect(7, my - 2, 11, 1, pal.metalHi);
      p.rect(11, my + 1, 3, 3, pal.metalDark); // magazine
      p.rect(9, my - 3, 4, 1, pal.metalDark); // sight
      break;
    }
    case 'smg': {
      p.rect(5, my - 2, 10, 4, pal.metal);
      p.rect(6, my - 2, 8, 1, pal.metalHi);
      p.rect(5, my + 2, 3, 3, pal.grip);
      p.rect(10, my + 2, 2, 3, pal.metalDark);
      p.rect(15, my - 1, 2, 2, pal.metalDark);
      break;
    }
    default: {
      // Compact classic Revolver / Pistol (~11px long!)
      p.rect(5, my - 2, 11, 3, pal.metal);
      p.rect(6, my - 2, 9, 1, pal.metalHi);
      p.rect(8, my - 1, 3, 3, pal.metalDark); // cylinder
      p.rect(5, my + 1, 3, 3, pal.grip);
      p.set(5, my + 3, pal.gripDark);
      break;
    }
  }

  if (pal.isGold) {
    p.set(12, my - 3, '#ffffff');
  } else if (pal.isUltra) {
    p.rect(9, my - 1, 3, 1, '#58ff70');
  }

  p.outline(INK);
  p.flush(ctx, x, y);
}

export function registerWeaponsAndProjectiles(b: FallbackAtlasBuilder): void {
  // 1. ALL 142 WEAPONS AT CRISP NATIVE 1x (22x12, orig 6,6)
  for (const def of Object.values(WEAPONS)) {
    if (!b.hasSprite(def.sprite)) {
      b.addSprite(def.sprite, 22, 12, 6, 6, 1, (ctx, x, y, w, h) => drawWeapon1x(ctx, x, y, w, h, def));
    }
  }

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

  // 2. CRISP NATIVE 1x PROJECTILES, SLASHES & EXPLOSIONS
  const drawBullet1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, outer: string, core: string): void => {
    const p = new PxCanvas(w, h);
    const cy = Math.floor(h / 2);
    const bh = Math.max(2, h - 2);
    const top = Math.max(1, cy - Math.floor(bh / 2));
    p.rect(1, top, Math.max(2, w - 2), bh, outer);
    if (w >= 6 && bh >= 3) {
      p.rect(2, top + 1, Math.max(2, w - 4), Math.max(1, bh - 2), core);
    } else {
      p.rect(Math.floor(w * 0.35), cy, Math.max(2, Math.floor(w * 0.45)), 1, core);
    }
    p.set(Math.max(1, w - 3), cy, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  const drawOrb1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.max(2.5, Math.min(w, h) * 0.42);
    p.ellipse(cx, cy, r, r, outer);
    p.ellipse(cx, cy, Math.max(1.5, r * 0.72), Math.max(1.5, r * 0.72), mid);
    const cr = Math.max(1, r * (f % 2 === 0 ? 0.44 : 0.56));
    p.ellipse(cx, cy, cr, cr, core);
    p.set(cx - 1, cy - 1, '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  // Iconic Nuclear Throne enemy orbs: bold bright colored ring + pure white center + 1px dark outline!
  const drawEnemyOrb1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const p = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.max(3.5, Math.min(w, h) * 0.41);
    p.ellipse(cx, cy, r, r, outer);
    p.ellipse(cx, cy, Math.max(2.4, r * 0.78), Math.max(2.4, r * 0.78), mid);
    const cr = Math.max(1.6, r * (f % 2 === 0 ? 0.52 : 0.62));
    p.ellipse(cx, cy, cr, cr, core);
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  const drawSlash1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    outer: string,
    core: string,
    trailRim: string,
  ): void => {
    const p = new PxCanvas(w, h);
    const cy = Math.floor(h / 2);
    const halfSpan = Math.floor(h * 0.44);
    const maxThick = f === 0 ? Math.max(5, Math.floor(w * 0.34)) : f === 1 ? Math.max(3, Math.floor(w * 0.22)) : 2;

    for (let dy = -halfSpan; dy <= halfSpan; dy++) {
      const ny = dy / (halfSpan + 0.5);
      const curve = 1 - ny * ny;
      const taper = Math.pow(Math.max(0, curve), 0.55);
      const thick = Math.max(1, Math.round(maxThick * taper));
      const leadX = Math.floor(w * 0.22) + Math.round(curve * w * 0.58);
      const trailX = leadX - thick;
      if (f < 2) p.set(trailX - 1, cy + dy, trailRim);
      p.rect(trailX, cy + dy, thick, 1, outer);
      const coreW = Math.max(1, Math.ceil(thick * 0.55));
      p.rect(leadX - coreW + 1, cy + dy, coreW, 1, core);
      if (taper > 0.25) p.set(leadX, cy + dy, '#ffffff');
    }
    p.flush(ctx, x, y);
  };

  const drawExplosion1x = (
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
    const baseR = Math.min(w, h) * (0.28 + f * 0.055);

    if (f === 0) {
      // Pure bright white-hot pixel flash cloud
      p.ellipse(cx, cy, baseR * 1.1, baseR * 1.1, '#ffffff');
      p.ellipse(cx - 3, cy - 2, baseR * 0.65, baseR * 0.65, '#ffffff');
      p.ellipse(cx + 3, cy + 2, baseR * 0.6, baseR * 0.6, '#ffffff');
      p.outline(INK);
      p.flush(ctx, x, y);
      return;
    }

    const lobes = 6;
    const smokeCol = '#363038';
    const smokeHi = '#524854';
    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + f * 0.5;
      const dist = baseR * (0.45 + (i % 2) * 0.14);
      const lr = Math.max(2, baseR * (0.48 - f * 0.04));
      const lx = cx + Math.cos(ang) * dist;
      const ly = cy + Math.sin(ang) * dist;
      p.ellipse(lx, ly, lr, lr, f >= 3 ? (i % 2 === 0 ? smokeCol : smokeHi) : outer);
    }
    if (f < 3) {
      p.ellipse(cx, cy, baseR * 0.72, baseR * 0.72, mid);
      p.ellipse(cx, cy, baseR * (f === 1 ? 0.48 : 0.30), baseR * (f === 1 ? 0.48 : 0.30), core);
    } else {
      p.ellipse(cx - 1, cy - 1, baseR * 0.38, baseR * 0.38, outer);
      p.ellipse(cx, cy, baseR * 0.2, baseR * 0.2, mid);
    }
    p.outline(INK);
    p.flush(ctx, x, y);
  };

  const bulletList: Array<[string, number, number, string, string]> = [
    ['sprBullet1', 10, 5, '#f5c028', '#ffffff'],
    ['sprBullet2', 8, 6, '#f07824', '#fff498'],
    ['sprHeavyBullet', 12, 7, '#ff781c', '#ffffff'],
    ['sprUltraBullet', 12, 6, '#48f048', '#e8ffe8'],
    ['sprBouncerBullet', 8, 6, '#ffe038', '#ffffff'],
    ['sprRogueBullet', 10, 5, '#3c9eff', '#e0faff'],
    ['sprAllyBullet', 8, 4, '#58f058', '#ffffff'],
    ['sprShell', 7, 5, '#f06824', '#fff298'],
    ['sprUltraShell', 9, 6, '#48f050', '#e0ffe0'],
    ['sprSlug', 12, 6, '#ff5028', '#ffffff'],
    ['sprSlugBullet', 12, 6, '#ff5028', '#ffffff'],
    ['sprHeavySlug', 14, 8, '#e83420', '#fff498'],
    ['sprHyperSlug', 16, 6, '#ff8c28', '#ffffff'],
    ['sprPopoSlug', 12, 6, '#3c9eff', '#e0faff'],
    ['sprBolt', 14, 5, '#48e858', '#ffffff'],
    ['sprHeavyBolt', 16, 6, '#30c444', '#e8ffe8'],
    ['sprBoltGold', 14, 5, '#f5c838', '#fffad0'],
    ['sprToxicBolt', 14, 5, '#8eff38', '#ecffb4'],
    ['sprUltraBolt', 16, 6, '#48f868', '#ffffff'],
    ['sprSplinter', 10, 4, '#c08c4a', '#fff2c8'],
    ['sprSeeker', 10, 6, '#ff5cb8', '#ffffff'],
    ['sprLaser', 16, 5, '#48f048', '#ffffff'],
    ['sprLightning', 16, 6, '#48d4ff', '#ffffff'],
    ['sprRocket', 14, 7, '#dc402c', '#ffe448'],
    ['sprGoldRocket', 14, 7, '#f5c838', '#ffffff'],
    ['sprGoldNuke', 16, 9, '#f5c838', '#78ff8c'],
    ['sprFlare', 10, 6, '#ff701c', '#fff698'],
  ];
  for (const [name, w, h, outer, core] of bulletList) {
    b.addSprite(name, w, h, Math.floor(w / 2), Math.floor(h / 2), 1, (ctx, x, y, sw, sh) =>
      drawBullet1x(ctx, x, y, sw, sh, outer, core),
    );
  }

  const orbList: Array<[string, number, string, string, string]> = [
    ['sprDisc', 12, '#6c7a8c', '#c8d6e4', '#ffffff'],
    ['sprGoldDisc', 12, '#a87616', '#f5c838', '#fffacc'],
    ['sprGrenade', 10, '#2e5420', '#6ec048', '#dcff88'],
    ['sprHeavyNade', 12, '#244018', '#5ca438', '#ffe448'],
    ['sprClusterNade', 11, '#583820', '#dc7c28', '#fff084'],
    ['sprStickyGrenade', 10, '#602050', '#dc4cb8', '#ffc0f0'],
    ['sprToxicGrenade', 10, '#1e6024', '#70ff4c', '#e4ffb0'],
    ['sprBloodGrenade', 11, '#68121c', '#e8283c', '#ffa0a8'],
    ['sprGoldGrenade', 10, '#926212', '#f5c838', '#fffacc'],
    ['sprUltraGrenade', 12, '#18702a', '#4eff70', '#ffffff'],
    ['sprPopoNade', 10, '#1c428a', '#44a0ff', '#daf8ff'],
    ['sprFlakBullet', 10, '#6e2e1a', '#e87034', '#ffe27c'],
    ['sprSuperFlakBullet', 14, '#6e2414', '#ff7e2c', '#fff28c'],
    ['sprFlameBall', 10, '#ca3018', '#ff7e1c', '#fff498'],
    ['sprFireBall', 12, '#ca3018', '#ff6c1c', '#fff498'],
    ['sprFireLilHunter', 10, '#dc3a18', '#ff8e28', '#fffacc'],
    ['sprConfettiBall', 8, '#ff48a4', '#ffe448', '#70f4ff'],
    ['sprPlasmaBall', 12, '#28a820', '#68f438', '#eeffe4'],
    ['sprPlasmaBallBig', 18, '#28a820', '#68f438', '#f6fff0'],
    ['sprPlasmaBallHuge', 24, '#249c1c', '#6ef83c', '#ffffff'],
    ['sprPopoPlasma', 14, '#1c48a0', '#4ca8ff', '#e4fbff'],
    ['sprLightningBall', 12, '#1e68a0', '#5cdaff', '#ffffff'],
    ['sprBloodBall', 12, '#62101a', '#e4283c', '#ff949c'],
    ['sprBulletHit', 10, '#ec7c24', '#ffe448', '#ffffff'],
  ];
  for (const [name, s, outer, mid, core] of orbList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawOrb1x(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

  // Iconic bright red-ring white-core enemy orbs (04_desert_1_1.png & 07_bigdog_3_3.png)
  // & glowing neon-green Palace orbs (15_palace_7_1.png)!
  const enemyOrbList: Array<[string, number, string, string, string]> = [
    ['sprEnemyBullet', 11, '#d82818', '#ff5428', '#ffffff'],
    ['sprEnemyBullet1', 11, '#d82818', '#ff5428', '#ffffff'],
    ['sprEnemyBullet4', 12, '#9a1878', '#ff4ce0', '#ffffff'],
    ['sprIDPDBullet', 11, '#1848b8', '#42b8ff', '#ffffff'],
    ['sprScorpionBullet', 11, '#208818', '#70ff38', '#ffffff'],
    ['sprSalamanderBullet', 12, '#c82c10', '#ff8824', '#ffffff'],
    ['sprGuardianBullet', 13, '#249818', '#78ff38', '#f0ffe8'],
    ['sprBigGuardianBullet', 17, '#208c14', '#80ff3c', '#f4ffec'],
    ['sprExploGuardianBullet', 14, '#648810', '#d8ff38', '#ffffff'],
    ['sprLHBouncer', 11, '#1a48a8', '#5ce4ff', '#ffffff'],
    ['sprThrone2Bullet', 16, '#209418', '#78ff38', '#ffffff'],
  ];
  for (const [name, s, outer, mid, core] of enemyOrbList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawEnemyOrb1x(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

  b.addSprite('sprHorrorBullet', 12, 12, 6, 6, 3, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.ellipse(6, 6, 4.5, 4.5, '#34d848');
    p.ellipse(6, 6, 2.8, 2.8, f === 1 ? '#d8ffd8' : '#8cff78');
    p.set(5, 5, '#ffffff');
    p.outline(INK);
    p.set(2 + f * 3, 2, '#d8ffe0');
    p.flush(ctx, x, y);
  });

  b.addSprite('sprNuke', 18, 10, 9, 5, 2, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 3, 3, 4, f === 0 ? '#ff6c1c' : '#ffe448');
    p.rect(4, 2, 3, 6, '#ebb834');
    p.rect(6, 2, 8, 6, '#58744e');
    p.rect(10, 3, 2, 4, '#58ff68');
    p.rect(14, 3, 3, 4, '#d8382c');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  b.addSprite('sprToxicGas', 22, 22, 11, 11, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const dx = f === 1 ? 1 : f === 3 ? -1 : 0;
    const dy = f === 2 ? 1 : 0;
    p.ellipse(8 + dx, 11, 5.5, 4.5, '#2c8c30');
    p.ellipse(14 - dx, 12, 5.5, 4.5, '#247428');
    p.ellipse(11, 9 + dy, 6, 5, '#48cc44');
    p.ellipse(9, 8 + dy, 2.5, 2, '#b8ff70');
    p.outline('#0c2410');
    p.flush(ctx, x, y);
  });

  b.addSprite('sprRogueStrike', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 14;
    const cy = 14;
    const r = 6 + f * 2;
    p.ellipse(cx, cy, Math.min(12, r + 1), Math.min(12, r + 1), '#2c88ff');
    p.ellipse(cx, cy, Math.max(3, r - 3), Math.max(3, r - 3), f < 2 ? '#c0f6ff' : '#64c8ff');
    if (f < 3) p.ellipse(cx, cy, Math.max(2, 5 - f), Math.max(2, 5 - f), '#ffffff');
    p.outline(INK);
    p.flush(ctx, x, y);
  });

  const slashList: Array<[string, number, string, string, string]> = [
    ['sprSlash', 24, '#7ce0ff', '#ffffff', '#182b47'],
    ['sprHeavySlash', 28, '#ffc038', '#ffffff', '#48260e'],
    ['sprMegaSlash', 32, '#ff6e28', '#ffffff', '#4a180d'],
    ['sprEnergySlash', 26, '#48ff80', '#ffffff', '#0c4222'],
    ['sprHeavyEnergySlash', 30, '#48ff80', '#ffffff', '#0c4222'],
    ['sprLightningSlash', 26, '#4ce8ff', '#ffffff', '#0d2e4a'],
    ['sprBloodSlash', 26, '#ff2848', '#ffe8ec', '#4a0b18'],
    ['sprUltraSlash', 30, '#48ff80', '#ffffff', '#0c4222'],
  ];
  for (const [name, s, outer, core, trailRim] of slashList) {
    b.addSprite(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 3, (ctx, x, y, sw, sh, f) =>
      drawSlash1x(ctx, x, y, sw, sh, f, outer, core, trailRim),
    );
  }

  b.addSprite('sprExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion1x(ctx, x, y, w, h, f, '#c02818', '#ff7c20', '#fff8b0'),
  );
  b.addSprite('sprSmallExplosion', 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) =>
    drawExplosion1x(ctx, x, y, w, h, f, '#c02818', '#ff8024', '#fff8b4'),
  );
  b.addSprite('sprGreenExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion1x(ctx, x, y, w, h, f, '#1c7828', '#58f058', '#ecffe8'),
  );
  b.addSprite('sprMeatExplosion', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) =>
    drawExplosion1x(ctx, x, y, w, h, f, '#6c101a', '#dc283c', '#ffa0a8'),
  );
  b.addSprite('sprRogueExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosion1x(ctx, x, y, w, h, f, '#183c8c', '#48a8ff', '#e4fbff'),
  );

  for (const def of Object.values(WEAPONS)) {
    if (def.projectileSprite && !b.hasSprite(def.projectileSprite)) {
      b.addAlias(def.projectileSprite, 'sprBullet1');
    }
  }
}
