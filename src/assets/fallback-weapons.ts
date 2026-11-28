import type { WeaponDef } from '@/contracts';
import { WEAPONS } from '@/data/weapons';
import type { DrawCtx, FallbackAtlasBuilder } from './fallback-fonts';
import { PxCanvas, makeRamp } from './pixel-art';

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
  grip: string;
  glow: string;
  isGold: boolean;
  isUltra: boolean;
}

function getWeaponPalette(w: WeaponDef): WeaponPalette {
  const id = w.id.toLowerCase();
  if (w.golden || id.includes('gold')) {
    return { metal: '#f5c436', grip: '#754020', glow: '#ffffff', isGold: true, isUltra: false };
  }
  if (w.ultra || id.includes('ultra')) {
    return { metal: '#35d956', grip: '#242c36', glow: '#ebffed', isGold: false, isUltra: true };
  }
  if (w.cursed) {
    return { metal: '#913be0', grip: '#291538', glow: '#ff70e8', isGold: false, isUltra: false };
  }
  if (id.includes('blood')) {
    return { metal: '#cf2938', grip: '#3d1c24', glow: '#ff96a0', isGold: false, isUltra: false };
  }
  if (id.includes('rogue') || id.includes('ion') || w.sprite.includes('Popo')) {
    return { metal: '#3c73cc', grip: '#243047', glow: '#96f5ff', isGold: false, isUltra: false };
  }
  if (id.includes('rusty')) {
    return { metal: '#a65e3b', grip: '#4d2b18', glow: '#eda878', isGold: false, isUltra: false };
  }
  if (id.includes('toxic') || id.includes('frog')) {
    return { metal: '#4bad49', grip: '#38472e', glow: '#ccff5c', isGold: false, isUltra: false };
  }
  if (id.includes('flame') || id.includes('dragon') || id.includes('incinerator') || id.includes('flare')) {
    return { metal: '#bd4c32', grip: '#3b2520', glow: '#ffe347', isGold: false, isUltra: false };
  }
  if (id.includes('black')) {
    return { metal: '#302b3d', grip: '#d9323a', glow: '#b096ff', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'energy') {
    const isPlasmaBlade =
      id.includes('energy_sword') ||
      id.includes('energy_hammer') ||
      id.includes('energy_screwdriver') ||
      id.includes('plasma');
    return {
      metal: '#6a7d96',
      grip: '#262d3d',
      glow: isPlasmaBlade ? '#3dff94' : id.includes('lightning') ? '#6ef2ff' : '#ff385c',
      isGold: false,
      isUltra: false,
    };
  }
  if (w.ammoType === 'bolt') {
    return { metal: '#996f42', grip: '#402a18', glow: '#6eff78', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'explosive') {
    return { metal: '#5a7354', grip: '#453528', glow: '#ff9633', isGold: false, isUltra: false };
  }
  if (w.ammoType === 'shell') {
    return { metal: '#8290a0', grip: '#94552d', glow: '#ff6a33', isGold: false, isUltra: false };
  }
  return { metal: '#9ba8b8', grip: '#7d4d2c', glow: '#ffe047', isGold: false, isUltra: false };
}

/**
 * Draws chunky, Odinfall-style 48x24 Hi-Bit (logical 24x12) detailed pixel-art firearms & melee weapons!
 */
function drawWeaponHiBit(ctx: DrawCtx, x: number, y: number, w: number, h: number, def: WeaponDef): void {
  const buf = new PxCanvas(w, h);
  const shape = classifyWeaponShape(def);
  const pal = getWeaponPalette(def);
  const metal = makeRamp(pal.metal, '#100c16');
  const darkM = makeRamp(metal.dark, '#0d0912');
  const grip = makeRamp(pal.grip, '#100c16');
  const glow = makeRamp(pal.glow, '#100c16');
  const my = Math.floor(h / 2);

  switch (shape) {
    case 'eggplant': {
      buf.shadedEllipse(27, my, 13, 7.5, makeRamp('#7a32ba', '#1d092e'));
      buf.bevelBox(8, my - 4, 8, 8, makeRamp('#46b84b', '#102e12'), true);
      break;
    }
    case 'guitar': {
      buf.shadedEllipse(14, my, 9, 8, metal);
      buf.ellipse(14, my, 3, 3, '#140f17');
      buf.bevelBox(22, my - 3, 20, 6, grip, false);
      buf.line(22, my - 1, 41, my - 1, '#fff5cc', 1);
      buf.line(22, my + 1, 41, my + 1, '#e6d499', 1);
      buf.bevelBox(40, my - 5, 6, 10, metal, true);
      break;
    }
    case 'wrench': {
      buf.bevelBox(4, my - 3, 28, 6, metal, true);
      buf.shadedEllipse(36, my, 8.5, 8.5, metal);
      buf.rect(37, my - 3, 9, 6, ''); // open C-jaw cutout
      buf.erase(38, my - 2);
      for (let cy = my - 3; cy <= my + 2; cy++) {
        for (let cx2 = 38; cx2 < 46; cx2++) buf.erase(cx2, cy);
      }
      break;
    }
    case 'screwdriver': {
      const handle = makeRamp(def.id.includes('energy') ? pal.glow : '#de3838', '#26080d');
      buf.bevelBox(4, my - 4, 14, 8, handle, true);
      buf.bevelBox(18, my - 2, 24, 4, metal, false);
      buf.rect(39, my - 1, 4, 2, '#ffffff');
      break;
    }
    case 'shovel': {
      buf.bevelBox(4, my - 2, 24, 4, grip, false);
      buf.poly([[27, my - 7], [40, my - 6], [45, my], [40, my + 6], [27, my + 7]], metal);
      buf.line(30, my - 4, 42, my, '#ffffff', 1);
      break;
    }
    case 'sword': {
      const isEnergy = def.id.includes('energy');
      if (isEnergy) {
        buf.bevelBox(3, my - 2, 11, 5, makeRamp('#3c475c', '#0e111a'), true);
        buf.bevelBox(13, my - 7, 6, 14, makeRamp('#526482', '#0e111a'), true);
        buf.rect(15, my - 5, 2, 10, '#42ff98');
        buf.poly([[19, my - 4], [43, my - 2], [46, my], [43, my + 2], [19, my + 4]], makeRamp('#3dff94', '#0b4526'));
        buf.rect(20, my - 2, 22, 4, '#b8ffe0');
        buf.rect(20, my - 1, 24, 2, '#ffffff');
      } else {
        buf.bevelBox(4, my - 2, 10, 5, grip, true);
        buf.bevelBox(13, my - 7, 5, 14, glow, true);
        buf.poly([[18, my - 4], [42, my - 3], [46, my], [42, my + 3], [18, my + 4]], metal);
        buf.line(19, my - 2, 43, my - 1, '#ffffff', 1);
      }
      break;
    }
    case 'hammer': {
      buf.bevelBox(4, my - 2, 24, 4, grip, false);
      buf.bevelBox(26, my - 9, 17, 18, metal, true);
      if (def.ammoType === 'energy') {
        buf.rect(30, my - 5, 9, 10, glow.base);
        buf.rect(32, my - 3, 5, 6, '#ffffff');
      }
      break;
    }
    case 'crossbow': {
      // Curved bow limbs + central stock & glowing loaded bolt!
      buf.shadedCapsule(32, my - 9, 26, my, 2.2, darkM);
      buf.shadedCapsule(32, my + 9, 26, my, 2.2, darkM);
      buf.line(31, my - 8, 20, my, '#d9cdb8', 1);
      buf.line(31, my + 8, 20, my, '#d9cdb8', 1);
      buf.bevelBox(4, my - 3, 30, 6, metal, true);
      buf.rect(22, my - 1, 23, 2, glow.base);
      buf.rect(41, my - 2, 4, 4, '#ffffff');
      break;
    }
    case 'disc': {
      buf.bevelBox(6, my - 5, 26, 10, metal, true);
      buf.shadedEllipse(34, my, 7.5, 7.5, glow);
      buf.ellipse(34, my, 2.5, 2.5, '#ffffff');
      buf.bevelBox(10, my + 4, 7, 6, grip, false);
      break;
    }
    case 'bazooka': {
      buf.bevelBox(4, my - 6, 38, 12, metal, true);
      buf.bevelBox(36, my - 8, 9, 16, glow, true);
      buf.rect(38, my - 5, 3, 4, '#ffffff');
      buf.bevelBox(12, my + 5, 7, 6, grip, false);
      buf.bevelBox(24, my + 5, 6, 5, grip, false);
      break;
    }
    case 'nader': {
      buf.bevelBox(4, my - 3, 10, 8, grip, true);
      buf.bevelBox(12, my - 6, 30, 10, metal, true);
      buf.shadedEllipse(24, my + 2, 7.5, 6.5, darkM);
      buf.rect(22, my + 1, 5, 3, glow.base);
      buf.bevelBox(40, my - 5, 5, 8, darkM, false);
      break;
    }
    case 'minigun': {
      buf.bevelBox(4, my - 7, 18, 14, darkM, true);
      buf.bevelBox(8, my - 10, 10, 4, metal, false); // top carry handle
      for (const by of [-6, -2, 2]) {
        buf.bevelBox(22, my + by, 23, 4, metal, false);
      }
      buf.bevelBox(32, my - 7, 4, 14, glow, false);
      buf.bevelBox(41, my - 7, 3, 14, darkM, false);
      break;
    }
    case 'multi_mg': {
      buf.bevelBox(3, my - 2, 9, 8, grip, true);
      buf.bevelBox(10, my - 7, 17, 12, metal, true);
      buf.shadedEllipse(20, my + 6, 5.5, 4.5, darkM);
      buf.bevelBox(26, my - 7, 19, 14, darkM, false);
      buf.rect(27, my - 5, 17, 2, metal.hi);
      buf.rect(27, my - 1, 18, 3, metal.base);
      buf.rect(27, my + 4, 17, 2, metal.hi);
      buf.bevelBox(36, my - 7, 4, 14, metal, false);
      break;
    }
    case 'double_shotgun':
    case 'flak': {
      buf.poly([[4, my + 1], [15, my - 2], [16, my + 6], [5, my + 8]], grip);
      buf.bevelBox(14, my - 7, 31, 6, metal, false);
      buf.bevelBox(14, my - 1, 31, 6, darkM, false);
      buf.rect(16, my - 6, 26, 2, '#ffffff');
      buf.bevelBox(20, my + 4, 12, 4, grip, true);
      break;
    }
    case 'shotgun': {
      buf.poly([[4, my + 1], [15, my - 2], [16, my + 6], [5, my + 8]], grip);
      buf.bevelBox(14, my - 5, 30, 7, metal, false);
      buf.bevelBox(22, my + 2, 13, 5, grip, true);
      buf.rect(41, my - 6, 3, 2, metal.hi); // front bead sight
      break;
    }
    case 'flamer': {
      buf.bevelBox(6, my - 5, 31, 9, metal, true);
      buf.bevelBox(14, my + 3, 16, 7, makeRamp('#de3829', '#2b090b'), true);
      buf.bevelBox(37, my - 5, 8, 7, glow, true);
      buf.rect(40, my - 3, 3, 3, '#ffffff');
      break;
    }
    case 'plasma':
    case 'lightning': {
      buf.bevelBox(5, my - 7, 36, 12, metal, true);
      buf.bevelBox(16, my - 5, 6, 8, glow, false);
      buf.bevelBox(25, my - 5, 6, 8, glow, false);
      buf.rect(18, my - 4, 2, 6, '#ffffff');
      buf.rect(27, my - 4, 2, 6, '#ffffff');
      buf.bevelBox(40, my - 4, 5, 6, glow, true);
      buf.bevelBox(9, my + 4, 7, 7, grip, false);
      break;
    }
    case 'laser_rifle': {
      buf.bevelBox(3, my - 3, 11, 8, grip, true);
      buf.bevelBox(11, my - 7, 22, 12, metal, true);
      buf.rect(16, my - 4, 11, 6, '#140f1f');
      buf.rect(17, my - 3, 9, 4, glow.base);
      buf.rect(19, my - 2, 5, 2, '#ffffff');
      buf.bevelBox(32, my - 5, 11, 8, darkM, false);
      buf.rect(42, my - 4, 4, 6, glow.hi);
      buf.bevelBox(14, my + 4, 7, 7, grip, false);
      break;
    }
    case 'laser_pistol': {
      buf.bevelBox(10, my - 7, 25, 10, metal, true);
      buf.rect(16, my - 4, 9, 4, glow.base);
      buf.rect(18, my - 3, 4, 2, '#ffffff');
      buf.rect(34, my - 4, 4, 4, glow.hi);
      buf.bevelBox(11, my + 3, 7, 8, grip, false);
      break;
    }
    case 'rifle': {
      buf.poly([[3, my - 2], [14, my - 3], [14, my + 5], [3, my + 6]], grip);
      buf.bevelBox(12, my - 5, 31, 8, metal, true);
      buf.poly([[22, my + 3], [28, my + 3], [30, my + 10], [24, my + 10]], darkM); // curved banana magazine!
      buf.bevelBox(19, my - 8, 9, 3, darkM, false); // iron sight / optic rail
      buf.rect(41, my - 6, 3, 2, glow.hi);
      break;
    }
    case 'smg': {
      buf.bevelBox(9, my - 5, 27, 9, metal, true);
      buf.bevelBox(10, my + 3, 6, 8, grip, false);
      buf.bevelBox(22, my + 3, 5, 8, darkM, false);
      buf.rect(36, my - 3, 5, 4, darkM.base);
      break;
    }
    default: {
      // Crisp detailed Revolver / Heavy Sidearm with fluted cylinder, hammer & ergonomic grip!
      buf.bevelBox(11, my - 6, 28, 8, metal, true);
      buf.bevelBox(17, my - 4, 8, 7, darkM, true); // fluted revolver cylinder
      buf.rect(19, my - 3, 4, 2, metal.hi);
      buf.poly([[10, my + 2], [17, my + 2], [14, my + 10], [8, my + 9]], grip);
      buf.rect(36, my - 7, 3, 2, glow.hi); // front sight
      break;
    }
  }

  if (pal.isGold) {
    buf.rect(28, my - 6, 5, 1, '#ffffff');
    buf.rect(30, my - 8, 1, 5, '#ffffff');
  } else if (pal.isUltra) {
    buf.rect(18, my - 3, 8, 3, '#5cff78');
    buf.rect(20, my - 2, 4, 1, '#ffffff');
  }

  buf.outline('#110b16', metal.out);
  buf.flush(ctx, x, y);
}

export function registerWeaponsAndProjectiles(b: FallbackAtlasBuilder): void {
  // 1. ALL 142 WEAPONS AT 48x24 HI-BIT (logical 24x12)
  for (const def of Object.values(WEAPONS)) {
    if (!b.hasSprite(def.sprite)) {
      b.addSpriteHiBit(def.sprite, 24, 12, 6, 6, 1, (ctx, x, y, w, h) => drawWeaponHiBit(ctx, x, y, w, h, def));
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

  // 2. ODINFALL-GRADE HI-BIT PROJECTILES, SWEEPING SLASHES & BILLOWING EXPLOSIONS
  const drawBulletHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, outer: string, core: string): void => {
    const buf = new PxCanvas(w, h);
    const cy = h * 0.5;
    // Tapered glowing high-velocity tracer slug!
    buf.poly([[2, cy], [w * 0.35, 2], [w - 4, 2], [w - 1, cy], [w - 4, h - 2], [w * 0.35, h - 2]], outer);
    buf.poly([[w * 0.25, cy], [w * 0.45, Math.max(3, cy - h * 0.28)], [w - 4, Math.max(3, cy - h * 0.25)], [w - 2, cy], [w - 4, Math.min(h - 3, cy + h * 0.25)], [w * 0.45, Math.min(h - 3, cy + h * 0.28)]], core);
    buf.ellipse(w - 5, cy, Math.max(1.5, h * 0.18), Math.max(1.2, h * 0.16), '#ffffff');
    buf.outline('#120a14');
    buf.flush(ctx, x, y);
  };

  const drawOrbHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const buf = new PxCanvas(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.max(4, Math.min(w, h) * 0.44);
    buf.organicBlob(cx, cy, r, r, 7 + f * 5, 0.1, makeRamp(outer, '#0a060e'));
    buf.ellipse(cx, cy, r * 0.78, r * 0.78, mid);
    buf.ellipse(cx - r * 0.1, cy - r * 0.1, r * (f % 2 === 0 ? 0.48 : 0.58), r * (f % 2 === 0 ? 0.48 : 0.58), core);
    buf.ellipse(cx - r * 0.22, cy - r * 0.22, Math.max(1.5, r * 0.22), Math.max(1.5, r * 0.22), '#ffffff');
    buf.outline('#0a060f');
    buf.flush(ctx, x, y);
  };

  const drawEnemyOrbHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, outer: string, mid: string, core: string): void => {
    const buf = new PxCanvas(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.max(6, Math.min(w, h) * 0.44);
    buf.ellipse(cx, cy, r, r, outer);
    buf.ellipse(cx, cy, r * 0.78, r * 0.78, mid);
    const cr = r * (f % 2 === 0 ? 0.46 : 0.56);
    buf.ellipse(cx, cy, cr, cr, core);
    buf.ellipse(cx - r * 0.18, cy - r * 0.18, Math.max(1.8, r * 0.24), Math.max(1.8, r * 0.24), '#ffffff');
    buf.outline('#08040d');
    buf.flush(ctx, x, y);
  };

  const drawSlashHi = (
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
    const buf = new PxCanvas(w, h);
    const cy = Math.floor(h / 2);
    const halfSpan = Math.floor(h * 0.46);
    const maxThick = f === 0 ? Math.max(11, Math.floor(w * 0.34)) : f === 1 ? Math.max(7, Math.floor(w * 0.24)) : 4;

    for (let dy = -halfSpan; dy <= halfSpan; dy++) {
      const ny = dy / (halfSpan + 0.5);
      const curve = 1 - ny * ny;
      const taper = Math.pow(Math.max(0, curve), 0.55);
      const thick = Math.max(3, Math.round(maxThick * taper));
      const leadX = Math.floor(w * 0.24) + Math.round(curve * w * 0.60);
      const trailX = leadX - thick;
      if (f < 2) buf.rect(trailX - 2, cy + dy, 2, 1, trailRim);
      buf.rect(trailX, cy + dy, thick, 1, outer);
      const whiteW = Math.max(3, Math.ceil(thick * 0.52));
      buf.rect(leadX - whiteW + 1, cy + dy, whiteW, 1, core);
      if (taper > 0.22) buf.rect(leadX, cy + dy, f === 0 ? 3 : 2, 1, '#ffffff');
    }
    // Crisp slashing energy sparks flying off crescent edge
    for (let s = 0; s < 6 - f; s++) {
      const fx = 0.65 + ((s * 7 + f * 3) % 28) * 0.01;
      const fy = ((s % 2 === 0 ? 1 : -1) * (0.12 + s * 0.065));
      buf.rect(w * fx, cy + h * fy, s % 2 === 0 ? 3 : 2, s % 2 === 0 ? 2 : 1, s % 2 === 0 ? '#ffffff' : outer);
    }
    buf.flush(ctx, x, y);
  };

  /**
   * Odinfall-style irregular multi-lobe billowing pixel-art explosions (ZERO flat concentric circles!).
   */
  const drawExplosionHi = (
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
    const buf = new PxCanvas(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const baseR = Math.min(w, h) * (0.28 + f * 0.062);

    if (f === 0) {
      // Blazing jagged white-hot star flash!
      buf.organicBlob(cx, cy, baseR * 1.15, baseR * 1.15, 3, 0.26, makeRamp(outer, '#1c0b0e'));
      buf.organicBlob(cx, cy, baseR * 0.85, baseR * 0.85, 9, 0.22, makeRamp('#ffffff', outer));
      buf.outline('#1c0d12');
      buf.flush(ctx, x, y);
      return;
    }

    // Irregular billowing multi-lobe fire & smoke plumes
    const lobes = 7;
    const smokeRamp = makeRamp('#332930', '#120c12');
    const fireOuter = makeRamp(outer, '#1a0c10');
    const fireMid = makeRamp(mid, outer);

    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + f * 0.45;
      const dist = baseR * (0.42 + (i % 3) * 0.14);
      const lr = baseR * (0.48 - f * 0.04 + (i % 2) * 0.1);
      const lx = cx + Math.cos(ang) * dist;
      const ly = cy + Math.sin(ang) * dist;
      buf.organicBlob(lx, ly, lr, lr * 0.92, i * 11 + f, 0.2, f >= 3 ? smokeRamp : fireOuter);
    }
    if (f < 3) {
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + f * 0.7;
        const dist = baseR * 0.3;
        buf.organicBlob(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, baseR * 0.44, baseR * 0.42, i * 17 + f, 0.18, fireMid);
      }
      buf.organicBlob(cx, cy, baseR * (f === 1 ? 0.55 : 0.38), baseR * (f === 1 ? 0.52 : 0.35), 29 + f, 0.2, makeRamp(core, mid));
      if (f === 1) buf.ellipse(cx - 2, cy - 2, baseR * 0.25, baseR * 0.22, '#ffffff');
    } else {
      // Dissipating charred billow with hot ember pocket inside
      buf.organicBlob(cx - 3, cy - 2, baseR * 0.48, baseR * 0.42, 41, 0.22, fireOuter);
      buf.organicBlob(cx + 2, cy + 1, baseR * 0.28, baseR * 0.25, 47, 0.2, fireMid);
    }
    buf.outline('#140c14');
    buf.flush(ctx, x, y);
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
    b.addSpriteHiBit(name, w, h, Math.floor(w / 2), Math.floor(h / 2), 1, (ctx, x, y, sw, sh) =>
      drawBulletHi(ctx, x, y, sw, sh, outer, core),
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
    b.addSpriteHiBit(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawOrbHi(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

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
    b.addSpriteHiBit(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 2, (ctx, x, y, sw, sh, f) =>
      drawEnemyOrbHi(ctx, x, y, sw, sh, f, outer, mid, core),
    );
  }

  b.addSpriteHiBit('sprHorrorBullet', 12, 12, 6, 6, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.organicBlob(12, 12, 9, 9, 5 + f * 7, 0.18, makeRamp('#28d450', '#082910'));
    buf.ellipse(12, 12, 5.5, 5.5, f === 1 ? '#c4ffcc' : '#7aff91');
    buf.ellipse(11, 11, 2.5, 2.5, '#ffffff');
    buf.outline('#07210c');
    buf.rect(4 + f * 6, 4, 2, 2, '#d9ffe0');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprNuke', 18, 10, 9, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.poly([[1, 10], [8, 5], [8, 15]], f === 0 ? '#ff6b1c' : '#ffe047');
    buf.poly([[4, 10], [9, 7], [9, 13]], '#ffffff');
    buf.bevelBox(8, 3, 7, 14, makeRamp('#ebb836', '#2b1e08'), false);
    buf.bevelBox(13, 4, 17, 12, makeRamp('#556e4d', '#141f14'), true);
    buf.rect(22, 5, 4, 10, '#4dff70');
    buf.poly([[29, 5], [35, 10], [29, 15]], makeRamp('#cc382b', '#2b0b09'));
    buf.outline('#110d14');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprToxicGas', 22, 22, 11, 11, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const acid = makeRamp('#44c940', '#0c2b12');
    const dx = f === 1 ? 2 : f === 3 ? -2 : 0;
    const dy = f === 2 ? 2 : 0;
    buf.organicBlob(16 + dx, 20, 11, 9, 3 + f, 0.22, makeRamp('#2a8a32', '#0c2b12'));
    buf.organicBlob(28 - dx, 24, 11, 9, 7 + f, 0.22, makeRamp('#22752a', '#0c2b12'));
    buf.organicBlob(22, 18 + dy, 12, 10, 11 + f, 0.22, acid);
    buf.ellipse(18, 15 + dy, 5, 3.5, '#b8ff6e');
    buf.ellipse(27, 23 - dy, 4, 3, '#78ff61');
    buf.outline('#0c2410');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprRogueStrike', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 28;
    const cy = 28;
    const r = 12 + f * 4;
    buf.organicBlob(cx, cy, Math.min(25, r + 3), Math.min(25, r + 3), 5 + f, 0.2, makeRamp('#2e88ff', '#0a1942'));
    buf.ellipse(cx, cy, Math.max(6, r - 6), Math.max(6, r - 6), f < 2 ? '#b8f6ff' : '#5cc4ff');
    if (f < 3) buf.ellipse(cx, cy, Math.max(4, 10 - f * 2), Math.max(4, 10 - f * 2), '#ffffff');
    buf.line(cx - r, cy, cx + r, cy, '#e0faff', 2);
    buf.line(cx, cy - r, cx, cy + r, '#e0faff', 2);
    buf.outline('#091436');
    buf.flush(ctx, x, y);
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
    b.addSpriteHiBit(name, s, s, Math.floor(s / 2), Math.floor(s / 2), 3, (ctx, x, y, sw, sh, f) =>
      drawSlashHi(ctx, x, y, sw, sh, f, outer, core, trailRim),
    );
  }

  b.addSpriteHiBit('sprExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosionHi(ctx, x, y, w, h, f, '#ad2314', '#ff701c', '#fff7a8'),
  );
  b.addSpriteHiBit('sprSmallExplosion', 18, 18, 9, 9, 4, (ctx, x, y, w, h, f) =>
    drawExplosionHi(ctx, x, y, w, h, f, '#ad2314', '#ff7824', '#fff7b2'),
  );
  b.addSpriteHiBit('sprGreenExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosionHi(ctx, x, y, w, h, f, '#156e28', '#4df068', '#e6ffe8'),
  );
  b.addSpriteHiBit('sprMeatExplosion', 26, 26, 13, 13, 4, (ctx, x, y, w, h, f) =>
    drawExplosionHi(ctx, x, y, w, h, f, '#660e18', '#d92438', '#ff9ea8'),
  );
  b.addSpriteHiBit('sprRogueExplosion', 28, 28, 14, 14, 4, (ctx, x, y, w, h, f) =>
    drawExplosionHi(ctx, x, y, w, h, f, '#143885', '#42a3ff', '#e0faff'),
  );

  for (const def of Object.values(WEAPONS)) {
    if (def.projectileSprite && !b.hasSprite(def.projectileSprite)) {
      b.addAlias(def.projectileSprite, 'sprBullet1');
    }
  }
}
