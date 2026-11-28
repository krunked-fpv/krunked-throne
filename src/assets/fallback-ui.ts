import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  px,
  rect,
} from './fallback-fonts';
import {
  drawBossIntroPortraitHiBit,
  drawCharSelectCardHiBit,
  drawMutantBigPortraitHiBit,
} from './fallback-portraits';
import { PxCanvas } from './pixel-art';

const INK = '#0d0a10';

// ============================================================================
// 1. CRISP NATIVE 1x KRUNKED THRONE TITLE LOGO (sprLogo 258x96x8, sprLogoGlow)
// ============================================================================

function paintSculptedLetter1x(
  p: PxCanvas,
  ch: string,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
): void {
  const s = Math.max(5, Math.round(w * 0.28));
  const midY = y + Math.round(h * 0.48);
  const rX = x + w;
  const bY = y + h;

  switch (ch) {
    case 'K':
      p.poly([[x, y], [x + s, y], [x + s, bY], [x, bY]], col);
      p.poly([[x + s - 1, midY - 1], [rX - s, y], [rX + 1, y], [x + s + 4, midY + 2]], col);
      p.poly([[x + s + 1, midY - 3], [x + s + 6, midY - 1], [rX + 1, bY], [rX - s - 1, bY]], col);
      break;
    case 'R':
      p.poly([[x, y], [x + s, y], [x + s, bY], [x, bY]], col);
      p.poly([[x + s - 1, y], [rX - 4, y], [rX, y + 4], [rX, midY - 1], [rX - 4, midY + 3], [x + s - 1, midY + 3]], col);
      p.poly([[x + s + 2, midY], [x + s + 8, midY], [rX, bY], [rX - s - 1, bY]], col);
      p.rect(x + s, y + s - 1, Math.max(2, w - s * 2), Math.max(2, midY - y - s), '');
      break;
    case 'U':
      p.poly([[x, y], [x + s, y], [x + s, bY - 6], [x + s + 2, bY - s], [rX - s - 2, bY - s], [rX - s, bY - 6], [rX - s, y], [rX, y], [rX, bY - 4], [rX - 4, bY], [x + 4, bY], [x, bY - 4]], col);
      break;
    case 'N':
      p.rect(x, y, s, h, col);
      p.rect(rX - s, y, s, h, col);
      p.poly([[x + 2, y], [x + s + 2, y], [rX - 2, bY], [rX - s - 2, bY]], col);
      break;
    case 'E':
      p.rect(x, y, s, h, col);
      p.rect(x + s - 1, y, w - s + 1, s, col);
      p.rect(x + s - 1, midY - Math.floor(s * 0.45), w - s - 2, s, col);
      p.rect(x + s - 1, bY - s, w - s + 1, s, col);
      break;
    case 'D':
      p.poly([[x, y], [rX - 5, y], [rX, y + 5], [rX, bY - 5], [rX - 5, bY], [x, bY]], col);
      p.rect(x + s, y + s, Math.max(2, w - s * 2), Math.max(2, h - s * 2), '');
      break;
    case 'T':
      p.rect(x - 1, y, w + 2, s, col);
      p.rect(x + Math.round((w - s) * 0.5), y + s - 1, s, h - s + 1, col);
      break;
    case 'H':
      p.rect(x, y, s, h, col);
      p.rect(rX - s, y, s, h, col);
      p.rect(x + s - 1, midY - Math.floor(s * 0.48), w - s * 2 + 2, s, col);
      break;
    case 'O':
      p.poly([[x + 4, y], [rX - 4, y], [rX, y + 4], [rX, bY - 4], [rX - 4, bY], [x + 4, bY], [x, bY - 4], [x, y + 4]], col);
      p.rect(x + s, y + s, Math.max(2, w - s * 2), Math.max(2, h - s * 2), '');
      break;
  }
}

function shadeWord1x(
  dst: PxCanvas,
  mask: PxCanvas,
  topY: number,
  wordH: number,
  style: 'krunked' | 'throne',
): void {
  const w = dst.w;
  const h = dst.h;
  // 3D drop extrusion + 2px bold ink outline
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask.isOpaque(x, y)) continue;
      for (let ey = 1; ey <= 4; ey++) {
        dst.set(x, y + ey, style === 'krunked' ? '#0e2c12' : '#181c26');
      }
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          if (ox * ox + oy * oy <= 5 && !mask.isOpaque(x + ox, y + oy)) {
            dst.set(x + ox, y + oy, INK);
          }
        }
      }
      dst.set(x, y + 5, INK);
    }
  }
  for (let y = 0; y < h; y++) {
    const t = Math.max(0, Math.min(1, (y - topY) / Math.max(1, wordH)));
    for (let x = 0; x < w; x++) {
      if (!mask.isOpaque(x, y)) continue;
      const topEmpty = !mask.isOpaque(x, y - 1);
      const botEmpty = !mask.isOpaque(x, y + 1);
      if (style === 'krunked') {
        let col = t < 0.28 ? '#a8ff58' : t < 0.58 ? '#52e838' : t < 0.82 ? '#24a828' : '#12681c';
        if (topEmpty) col = '#ecffc0';
        else if (botEmpty) col = '#0c4416';
        dst.set(x, y, col);
      } else {
        let col = t < 0.25 ? '#dce8f6' : t < 0.50 ? '#98a8bc' : t < 0.65 ? '#3c4454' : t < 0.85 ? '#6c6866' : '#423c40';
        if (topEmpty) col = '#ffffff';
        else if (botEmpty) col = '#1c202a';
        dst.set(x, y, col);
      }
    }
  }
}

function registerLogoSprites(b: FallbackAtlasBuilder): void {
  b.addSprite('sprLogoGlow', 261, 93, 130, 45, 1, (ctx, ox, oy, w, h) => {
    const cx = Math.floor(w * 0.5);
    ctx.save();
    ctx.fillStyle = 'rgba(64, 232, 72, 0.14)';
    ctx.fillRect(ox + cx - 110, oy + 12, 220, 32);
    ctx.fillStyle = 'rgba(120, 255, 100, 0.10)';
    ctx.fillRect(ox + cx - 92, oy + 46, 184, 30);
    ctx.restore();
  });

  const krunkedWord = 'KRUNKED';
  const throneWord = 'THRONE';
  const drips: ReadonlyArray<[number, number]> = [
    [22, 7], [56, 5], [96, 8], [134, 6], [172, 7], [208, 5], [236, 6],
  ];

  b.addSprite('sprLogo', 258, 96, 129, 48, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    // Backplate bar
    p.rect(24, 38, w - 48, 20, INK);
    p.rect(26, 40, w - 52, 16, '#363c4a');
    p.rect(28, 41, w - 56, 2, '#f5c838');
    // Top word: KRUNKED
    const kMask = new PxCanvas(w, h);
    const kW = 27;
    const kH = 33;
    const kGap = 5;
    const kTotal = krunkedWord.length * kW + (krunkedWord.length - 1) * kGap;
    const kStartX = Math.floor((w - kTotal) * 0.5);
    for (let i = 0; i < krunkedWord.length; i++) {
      paintSculptedLetter1x(kMask, krunkedWord[i]!, kStartX + i * (kW + kGap), 6, kW, kH, '#ffffff');
    }
    shadeWord1x(p, kMask, 6, kH, 'krunked');
    for (const [dx, dLen] of drips) {
      p.rect(dx - 2, 39, 5, dLen + 2, INK);
      p.rect(dx - 1, 39, 3, dLen, '#48e838');
      p.set(dx - 1, 39 + dLen - 1, '#d8ffb0');
    }
    // Bottom word: THRONE (reveals progressively frames 0..6, full at 7)
    const revealed = f >= 6 ? 6 : Math.min(6, f);
    if (revealed > 0) {
      const tMask = new PxCanvas(w, h);
      const tW = 29;
      const tH = 34;
      const tGap = 6;
      const tTotal = throneWord.length * tW + (throneWord.length - 1) * tGap;
      const tStartX = Math.floor((w - tTotal) * 0.5);
      for (let i = 0; i < revealed; i++) {
        paintSculptedLetter1x(tMask, throneWord[i]!, tStartX + i * (tW + tGap), 54, tW, tH, '#ffffff');
      }
      shadeWord1x(p, tMask, 54, tH, 'throne');
    }
    if (f === 7) {
      const cx = Math.floor(w * 0.5);
      p.rect(cx - 8, 43, 16, 10, INK);
      p.rect(cx - 6, 45, 12, 6, '#48e838');
      p.rect(cx - 3, 46, 6, 4, '#e8ffd0');
    }
    p.flush(ctx, ox, oy);
  });
}

// ============================================================================
// 2. ALL 29 BESPOKE CRISP 1x MUTATION ICONS + 24 ULTRA ICONS + 13 CROWNS
// Study 13_frozen_5_3.png & 15_palace_7_1.png top-right:
// HUD icons (16x16) are SHAPED transparent-background wasteland icons with
// bold 1px #0d0a10 outlines in iconic green / gray / bone / crimson / gold!
// ============================================================================

interface IconPalette {
  d: string; // dark shade ('1')
  m: string; // main color ('2')
  h: string; // bright highlight ('3')
  a: string; // accent ('4')
  b: string; // accent bright ('5')
  cardBg: string; // card fill for 24x32 level-up card
  cardTrim: string;
}

const MUTATION_PALETTES: readonly IconPalette[] = [
  // 0: Fallback Rad
  { d: '#247824', m: '#58e848', h: '#b8ff88', a: '#f5cc38', b: '#ffffff', cardBg: '#1c2c20', cardTrim: '#58e848' },
  // 1: Rhino Skin (gray-green rhino head + ivory horn)
  { d: '#525a64', m: '#8e96a0', h: '#c8d0da', a: '#ede6d4', b: '#ffffff', cardBg: '#22262c', cardTrim: '#98a4b0' },
  // 2: Extra Feet (mutated green-gray foot + bright speed lines)
  { d: '#287a2c', m: '#58d854', h: '#a8ff8c', a: '#f5cc38', b: '#ffffff', cardBg: '#1c2c22', cardTrim: '#58d854' },
  // 3: Plutonium Hunger (glowing neon-green rad orb + magnetic arcs)
  { d: '#1e7820', m: '#58f048', h: '#c4ff88', a: '#94a4b4', b: '#ffffff', cardBg: '#162c1c', cardTrim: '#58f048' },
  // 4: Rabbit Paw (fuzzy bone-white paw + gold charm ring)
  { d: '#8c8070', m: '#e8e0d0', h: '#ffffff', a: '#f5c838', b: '#fff498', cardBg: '#2c261e', cardTrim: '#e8d8b8' },
  // 5: Throne Butt (glowing green throne crest & dark iron)
  { d: '#384050', m: '#6e7888', h: '#a8b4c4', a: '#58f048', b: '#d0ff98', cardBg: '#1e2624', cardTrim: '#58f048' },
  // 6: Lucky Shot (green clover + gleaming gold bullet)
  { d: '#24802c', m: '#52dc4c', h: '#a8ff88', a: '#f5c838', b: '#fff6a0', cardBg: '#1c2c1e', cardTrim: '#f5c838' },
  // 7: Bloodlust (crimson blood-heart with white gleam)
  { d: '#841622', m: '#dc2838', h: '#ff7480', a: '#f5e8ec', b: '#ffffff', cardBg: '#30141c', cardTrim: '#e83444' },
  // 8: Gamma Guts (glowing green coiled radioactive stomach)
  { d: '#207c20', m: '#68f444', h: '#ccff88', a: '#ffe448', b: '#ffffff', cardBg: '#162c18', cardTrim: '#68f444' },
  // 9: Second Stomach (green belly pouch + red/white medkit cross)
  { d: '#287a30', m: '#58c854', h: '#a4f490', a: '#e42c38', b: '#ffffff', cardBg: '#1c2c20', cardTrim: '#e83c48' },
  // 10: Back Muscle (muscular tan/green shoulders + gold ammo belt)
  { d: '#7c4c2e', m: '#d49464', h: '#f8cc9c', a: '#f5c838', b: '#fff498', cardBg: '#2c221a', cardTrim: '#d49464' },
  // 11: Scarier Face (fierce horned bone-white/green monster skull)
  { d: '#5c665c', m: '#c8d0c4', h: '#ffffff', a: '#58f048', b: '#ff3c44', cardBg: '#202624', cardTrim: '#c8d4c4' },
  // 12: Euphoria (hypnotic swirling green-and-white spiral eye)
  { d: '#287838', m: '#64e86c', h: '#d4ffbe', a: '#a470e8', b: '#ffffff', cardBg: '#1e1c30', cardTrim: '#64e86c' },
  // 13: Long Arms (mutated green arm wielding silver sword)
  { d: '#2a7c30', m: '#5cd458', h: '#a8ff98', a: '#a4b4c4', b: '#ffffff', cardBg: '#1c2a24', cardTrim: '#98b4c8' },
  // 14: Boiling Veins (blazing red-orange fire over pulsing veins)
  { d: '#921c14', m: '#ec3c24', h: '#ff8c2c', a: '#ffe448', b: '#ffffff', cardBg: '#321814', cardTrim: '#ff7c24' },
  // 15: Shotgun Shoulders (twin red-and-brass shotgun shells on gray shoulders)
  { d: '#525c68', m: '#8c96a4', h: '#c4ced8', a: '#e43428', b: '#f5cc38', cardBg: '#262022', cardTrim: '#e43428' },
  // 16: Recycle Gland (bright green recycle arrows + gold bullet)
  { d: '#20822e', m: '#52e858', h: '#b8ff98', a: '#f5c838', b: '#ffffff', cardBg: '#182c1e', cardTrim: '#52e858' },
  // 17: Laser Brain (glowing neon-green brain + white-green beam!)
  { d: '#248c24', m: '#64f448', h: '#ccff90', a: '#98ff68', b: '#ffffff', cardBg: '#162e1a', cardTrim: '#64f448' },
  // 18: Last Wish (radiant golden star/flower + white sparkles)
  { d: '#a67414', m: '#f5cc38', h: '#fff698', a: '#ff4858', b: '#ffffff', cardBg: '#2c2618', cardTrim: '#f5cc38' },
  // 19: Eagle Eyes (sharp golden-white eagle eye + crosshair)
  { d: '#8a621c', m: '#e8b838', h: '#fff498', a: '#e4343c', b: '#ffffff', cardBg: '#222630', cardTrim: '#e8b838' },
  // 20: Impact Wrists (slamming muscular fist + white impact burst)
  { d: '#845034', m: '#dc9c6e', h: '#f8d4ac', a: '#ff7028', b: '#ffffff', cardBg: '#2c201a', cardTrim: '#ff7c30' },
  // 21: Bolt Marrow (homing glowing neon-green crossbow bolt)
  { d: '#20822a', m: '#58f054', h: '#c4ffa8', a: '#ede6d4', b: '#ffffff', cardBg: '#182c20', cardTrim: '#58f054' },
  // 22: Stress (sweating wide-eyed tense green-gray face + red vein!)
  { d: '#48604c', m: '#8ca88c', h: '#c8e4c4', a: '#e82c38', b: '#ffffff', cardBg: '#281c20', cardTrim: '#e83844' },
  // 23: Trigger Fingers (mutated hand on gun trigger + yellow spark!)
  { d: '#525c68', m: '#94a0ae', h: '#dce4ee', a: '#ff9024', b: '#fff488', cardBg: '#242228', cardTrim: '#ffa034' },
  // 24: Sharp Teeth (snarling crimson jaws lined with razor white fangs!)
  { d: '#841624', m: '#dc2838', h: '#ff707c', a: '#f0ece4', b: '#ffffff', cardBg: '#30161c', cardTrim: '#f0ece4' },
  // 25: Patience (glowing neon-green wasteland clock dial — exact video icon!)
  { d: '#207c24', m: '#68f040', h: '#c8ff88', a: '#3a4248', b: '#ffffff', cardBg: '#182c1c', cardTrim: '#68f040' },
  // 26: Hammerhead (armored gray-green hammerhead skull cracking rock)
  { d: '#4a5650', m: '#84968c', h: '#c4d4cc', a: '#ff8c28', b: '#fff088', cardBg: '#222624', cardTrim: '#98aca0' },
  // 27: Strong Spirit (iconic bright pure-white halo over dark-outlined mutant head!)
  { d: '#4a5664', m: '#8898a8', h: '#c8d8e8', a: '#c4f4ff', b: '#ffffff', cardBg: '#182430', cardTrim: '#ffffff' },
  // 28: Open Mind (cracked skull glowing with golden treasure light)
  { d: '#645c56', m: '#c8c0b4', h: '#ffffff', a: '#f5c838', b: '#fff698', cardBg: '#24222c', cardTrim: '#f5c838' },
  // 29: Heavy Heart (armored iron crimson heart with gold bullets)
  { d: '#7c1420', m: '#dc2838', h: '#ff7884', a: '#f5c838', b: '#b4c0cc', cardBg: '#2c161e', cardTrim: '#dc2838' },
];

// Crisp 14x14 hand-crafted pixel-art silhouettes for all 30 mutation indices!
// Characters: '1'=dark, '2'=main, '3'=hi, '4'=accent, '5'=bright, 'w'=white, 'k'=dark ink interior
const MUTATION_GRIDS_14: readonly (readonly string[])[] = [
  // 0: Fallback Rad symbol
  ['....22..22....', '...232..232...', '...222..222...', '.....4444.....', '....45554.....', '.....4444.....', '...122..221...', '..1232..2321..', '...122..221...'],
  // 1: Rhino Skin (fierce rhino head + big curved ivory horn!)
  ['..........44..', '.........454..', '........444...', '..33....44....', '.332222.444...', '33222222444...', '32212w22224...', '22112k22222...', '12112222211...', '.111122111....'],
  // 2: Extra Feet (mutated fast running foot + golden speed arcs)
  ['54....332.....', '.54..3322.....', '..54.3222.....', '...4.2221.....', '.....2221.....', '....232211....', '....23222233..', '....222222322.', '....111111111.'],
  // 3: Plutonium Hunger (glowing green rad orb pulling magnetic arcs)
  ['.44........44.', '45..........54', '4...33333....4', '4..33ww322...4', '4..3wwwww21..4', '4..32333221..4', '4...222211...4', '45..11111...54', '.44........44.'],
  // 4: Rabbit Paw (lucky white paw + gold charm ring)
  ['.....454......', '....4...4.....', '.....444......', '....33322.....', '...33www21....', '...3wwwww21...', '..3wwkwwkw21..', '..32wkwwkw21..', '..222wwww21...', '...1111111....'],
  // 5: Throne Butt (glowing green nuclear crown/throne crest)
  ['.5..5555..5...', '.44.4554.44...', '..333443332...', '.3222222221...', '.3214554121...', '.3214ww4121...', '.2214444121...', '..22111121....', '...111111.....'],
  // 6: Lucky Shot (bright green 4-leaf clover + gleaming gold bullet)
  ['..332....45...', '.33222..454...', '..22221.444...', '....21..454...', '..33221.444...', '.332221.454...', '..2211..444...', '....1...444...'],
  // 7: Bloodlust (vivid crimson blood-heart with white gleam)
  ['..332...332...', '.33w22.22221..', '.3ww22222221..', '.32222222221..', '..222222221...', '...2222221....', '....22221.....', '.....221......', '......1.......'],
  // 8: Gamma Guts (glowing green radioactive coiled gut)
  ['...3333333....', '..332222221...', '.32245554221..', '.32222222221..', '.32455555421..', '.22223332211..', '..245555421...', '...1222211....', '.....1111.....'],
  // 9: Second Stomach (green pouch + bold white/red medkit cross)
  ['...3333333....', '..332222221...', '.32225445221..', '.32255445521..', '.32544444451..', '.32544444451..', '.22255445511..', '..222544511...', '...1111111....'],
  // 10: Back Muscle (buff shoulders + diagonal gold bullet belt)
  ['...455554.....', '..333222211...', '.33222452211..', '.32224542211..', '.32245422211..', '.22454222211..', '..222211221...', '...1111111....'],
  // 11: Scarier Face (snarling horned skull with glowing green/red eyes!)
  ['.33........33.', '..3333333333..', '.33wwwwwww221.', '.32kk4w4kk221.', '.32k5kwk5k221.', '..222wkww211..', '..22.w.w.w.1..', '..22.k.k.k.1..', '...11111111...'],
  // 12: Euphoria (hypnotic glowing green spiral eye)
  ['...3333332....', '.33222222211..', '.322..44..21..', '32..45554..21.', '32.454k454.21.', '32..45554..21.', '.221..44..11..', '..112222111...'],
  // 13: Long Arms (mutated green arm brandishing bright silver sword!)
  ['.........555..', '........554...', '.......554....', '......554.....', '.....544......', '..33444.......', '.3322232......', '33222221......', '1222211.......'],
  // 14: Boiling Veins (roaring orange/yellow flame over pulsing veins)
  ['.....54.......', '....5544..4...', '...45444.44...', '..3245422332..', '.32224222221..', '.22454224421..', '..2442245411..', '...22244211...', '....111111....'],
  // 15: Shotgun Shoulders (twin red-and-gold shotgun shells!)
  ['..444...444...', '..4w4...4w4...', '..444...444...', '..444...444...', '..444...444...', '..555...555...', '..555...555...', '.33222222211..', '.22111111111..'],
  // 16: Recycle Gland (bright green recycle loop around gold bullet!)
  ['...3333332....', '..332222221...', '.32...45...21.', '.32..4544..21.', '.32..4444..21.', '.221.4444.121.', '..221....122..', '...12222221...'],
  // 17: Laser Brain (glowing neon-green wrinkly brain + blazing laser!)
  ['..333322......', '.33w33322.....', '.32k232221....', '33222k22444444', '32k22224555555', '3222k222444444', '.22122221.....', '..111111......'],
  // 18: Last Wish (radiant golden star + glowing core)
  ['......3.......', '.....332......', '.....322......', '333332w522221.', '.22224554221..', '....245421....', '.....2421.....', '......11......'],
  // 19: Eagle Eyes (sharp golden-white eagle eye + red crosshair!)
  ['......4.......', '...3334333....', '.33224554221..', '444245k542444.', '.22224554221..', '...1114111....', '......4.......'],
  // 20: Impact Wrists (slamming muscular fist + white shockwaves!)
  ['.........54...', '..33332...54..', '.332k2k2...54.', '33222221..554.', '32222221.5554.', '32222221..554.', '.2211111...54.', '.........54...'],
  // 21: Bolt Marrow (curving green homing crossbow bolt + bone tip!)
  ['.........33...', '.........332..', '...4555553322.', '.4555555533222', '455......3322.', '4........332..', '.........33...'],
  // 22: Stress (sweating wide-eyed tense green-gray face + red vein!)
  ['...3333333....', '..332222221...', '.322ww2ww224..', '.322wk2wk2444.', '.32222222224..', '.322kkkkk221..', '.222wkwkw211..', '..222222211...', '...1111111....'],
  // 23: Trigger Fingers (gun trigger + mutated finger + bright muzzle flash!)
  ['.222222222.54.', '23333333215544', '2222222221.54.', '221..333..1...', '221..3321.....', '221...321.....', '221..221......', '1111111.......'],
  // 24: Sharp Teeth (snarling red jaws lined with jagged white fangs!)
  ['..3333333333..', '.322222222221.', '.25w5.5w5.5w1.', '.24w4.4w4.4w1.', '.2.4...4...41.', '.2...4...4..1.', '.2..4w4.4w4.1.', '.222222222221.', '..1111111111..'],
  // 25: Patience (glowing neon-green circular wasteland clock dial — exact video icon!)
  ['....333333....', '..3322222233..', '.322224422221.', '.322224422221.', '.322224444221.', '.322222222221.', '.222222222211.', '..2222222211..', '....111111....'],
  // 26: Hammerhead (armored gray-green hammerhead skull smashing stone!)
  ['.33333333332..', '3332222222211.', '3222222222211.', '2211111111111.', '....45..54....', '...45422454...', '..45.2321.54..', '.....2221.....', '.....1111.....'],
  // 27: Strong Spirit (ICONIC pure-white glowing halo hovering above mutant head!)
  ['...55555555...', '.554444444455.', '...55555555...', '..............', '....333333....', '...33222221...', '...32k22k21...', '...22222211...', '....111111....'],
  // 28: Open Mind (cracked skull glowing with golden treasure light!)
  ['.....5555.....', '....455554....', '...33455433...', '..3222442221..', '..32kk22kk21..', '..2222222211..', '...22k22k11...', '....111111....'],
  // 29: Heavy Heart (armored iron crimson heart studded with gold bullets!)
  ['..332...332...', '.33222.22221..', '55544444444555', '44422455422444', '.322245542221.', '..2224444221..', '...22222221...', '....222221....', '.....1111.....'],
];

const ULTRA_PALETTES_24: readonly IconPalette[] = [
  { d: '#754614', m: '#d9982b', h: '#ffe073', a: '#4de878', b: '#ffffff', cardBg: '#162820', cardTrim: '#f5c838' },
  { d: '#946511', m: '#f2c138', h: '#fff59e', a: '#6ef2ff', b: '#ffffff', cardBg: '#162632', cardTrim: '#ffe048' },
  { d: '#641a8e', m: '#c458ec', h: '#f4bcff', a: '#ff3c5c', b: '#ffc4cc', cardBg: '#261436', cardTrim: '#f5c838' },
  { d: '#78228e', m: '#dc68ff', h: '#ffffff', a: '#ffe048', b: '#fff8c0', cardBg: '#2a1432', cardTrim: '#ffe048' },
  { d: '#284a9e', m: '#5898ff', h: '#c0e0ff', a: '#f5cc48', b: '#ffffff', cardBg: '#14203c', cardTrim: '#f5c838' },
  { d: '#542a9e', m: '#9268ff', h: '#e0d4ff', a: '#ff5488', b: '#ffffff', cardBg: '#22143a', cardTrim: '#ffe048' },
  { d: '#8c7e6c', m: '#ece2d0', h: '#ffffff', a: '#ff5c28', b: '#ffe868', cardBg: '#30161a', cardTrim: '#f5c838' },
  { d: '#847868', m: '#e4dac6', h: '#ffffff', a: '#58ff70', b: '#dcffe0', cardBg: '#1c2820', cardTrim: '#ffe048' },
  { d: '#1e782c', m: '#4ce05c', h: '#bcffc0', a: '#ec3044', b: '#ffffff', cardBg: '#142a1a', cardTrim: '#f5c838' },
  { d: '#227a2e', m: '#58e864', h: '#c8ffca', a: '#ff385c', b: '#ffe868', cardBg: '#261422', cardTrim: '#ffe048' },
  { d: '#9e6c12', m: '#f5c838', h: '#fff8b0', a: '#ffffff', b: '#ffec78', cardBg: '#261e32', cardTrim: '#f5c838' },
  { d: '#207a32', m: '#4ce064', h: '#c8ffd0', a: '#f5c838', b: '#ffffff', cardBg: '#182a1c', cardTrim: '#ffe048' },
  { d: '#546274', m: '#9cb0c8', h: '#e8f2fc', a: '#ff9834', b: '#fff698', cardBg: '#242030', cardTrim: '#f5c838' },
  { d: '#8a581a', m: '#e8b438', h: '#fff298', a: '#58ff70', b: '#ff4454', cardBg: '#2a2016', cardTrim: '#ffe048' },
  { d: '#4e6070', m: '#9ab4c8', h: '#e4f2fc', a: '#f5c838', b: '#58ff78', cardBg: '#162630', cardTrim: '#f5c838' },
  { d: '#485a68', m: '#8ea4b4', h: '#d8e8f4', a: '#58ff78', b: '#ffe048', cardBg: '#182826', cardTrim: '#ffe048' },
  { d: '#9e1c26', m: '#f03440', h: '#ff969e', a: '#ffb028', b: '#fff8a8', cardBg: '#321618', cardTrim: '#f5c838' },
  { d: '#546880', m: '#b8cee8', h: '#ffffff', a: '#5ce8ff', b: '#ff4858', cardBg: '#182232', cardTrim: '#ffe048' },
  { d: '#4c6448', m: '#90ae8a', h: '#d8ecd4', a: '#f5c838', b: '#ffffff', cardBg: '#1e2a1e', cardTrim: '#f5c838' },
  { d: '#785e42', m: '#caaa7e', h: '#faecd4', a: '#ff5448', b: '#ffe868', cardBg: '#2e1a1e', cardTrim: '#ffe048' },
  { d: '#18822c', m: '#4eff68', h: '#d8ffdc', a: '#d8ff48', b: '#ffffff', cardBg: '#102a16', cardTrim: '#f5c838' },
  { d: '#5e24a8', m: '#ba60ff', h: '#f0ccff', a: '#4eff78', b: '#ffffff', cardBg: '#201432', cardTrim: '#ffe048' },
  { d: '#1e54be', m: '#4ea6ff', h: '#c8f4ff', a: '#ffe048', b: '#ffffff', cardBg: '#12203c', cardTrim: '#f5c838' },
  { d: '#2c5ea8', m: '#6cb8ff', h: '#e8f8ff', a: '#6ef6ff', b: '#ffffff', cardBg: '#142638', cardTrim: '#ffe048' },
];

const ULTRA_GRIDS_14: readonly (readonly string[])[] = [
  ['...4.5.4......', '.33333333322..', '322145541111..', '333335533321..', '322214412211..', '.22222222211..', '..111111111...'],
  ['.....3........', '....332.......', '.333w5w2221...', '..22545221....', '...32.221.....', '.444454444....', '.4554554554...'],
  ['.32..332..32..', '.33223322321..', '.32245444211..', '.22454444211..', '..224444211...', '...1111111....'],
  ['....33322..4..', '..33w2222145..', '.33ww22221.4..', '.322222221454.', '..22222211.4..', '....1111...4..'],
  ['...45...45....', '...3333322....', '.322wwww211...', '32ww1111ww11..', '.222wwww211...', '...1111111....', '.45.......45..'],
  ['4...333...4...', '45.3wwww2.54..', '4..3w11w2..4..', '45.2wwww2.54..', '4...1111...4..'],
  ['.5.4.5.4.5....', '..4555554.....', '..3333322.....', '.33wwwww21....', '.32.w.w.21....', '..2222211.....', '...11111......'],
  ['.54..54..54...', '.44..44..44...', '.332....322...', '33ww....ww21..', '32.w....w.21..', '.221....121...'],
  ['32........23..', '321.4444.122..', '221455554121..', '2214w44w4121..', '22144ww44121..', '.2214444121...', '...111111.....'],
  ['.444....444...', '45544..45544..', '.444.44.444...', '..32455432....', '.3221443221...', '..11132111....'],
  ['..55555555....', '.....3........', '....332.......', '.w.324421.w...', 'www224w42www..', '.w.222221.w...', '..11111111....'],
  ['...455554.....', '..33333322....', '.3224554211...', '.3245222211...', '.2224554211...', '..11111111....'],
  ['54........45..', '543332233445..', '..22211222....', '...221122.....', '.54......45...', '.5433223345...'],
  ['.55.44.ww.33..', '333333333322..', '322554433w11..', '322554433w11..', '.2222222211...', '..11111111....'],
  ['..4..44..4....', '..44444444....', '.3333333322...', '322555552211..', '.2222222211...', '..11....11....'],
  ['.3333333322...', '322442244211..', '.11......11...', '...555555.....', '..544w4445....', '..11111111....'],
  ['.....5........', '....554.......', '...45444......', '.3333333322...', '322222222211..', '21............'],
  ['...444444.....', '.44w....w44...', '44....333.44..', '44...33w2.44..', '..44.33w2.....', '....5522......'],
  ['.32......32...', '3221.44.1223..', '344145541443..', '222145w41222..', '2221.44.1222..', '.111....1111..'],
  ['5.4....4.5....', '.54333345.....', '...32221......', '...22221......', '.32.111.32....', '.111...111....'],
  ['...44..44.....', '.3344334422...', '322112211211..', '.2222112211...', '454221222454..', '.44.1111.44...'],
  ['...444444.....', '.443333224....', '432..332.14...', '432.3ww2114...', '.422.22114....', '...444444.....'],
  ['.3w..3w..3w...', '.2w..2w..2w...', '.2w..2w..2w...', '42w442w442w4..', '455545554554..', '.1111111111...'],
  ['...444444.....', '.44w....w44...', '4..333333..4..', '4..32ww21..4..', '.44.1111.44...', '...444444.....'],
];

function paintEmblem1x(
  dst: PxCanvas,
  grid: readonly string[],
  pal: IconPalette,
): void {
  const map: Record<string, string> = {
    '1': pal.d,
    '2': pal.m,
    '3': pal.h,
    '4': pal.a,
    '5': pal.b,
    w: '#ffffff',
    k: INK,
  };
  const gh = grid.length;
  const gw = grid[0]!.length;
  const emb = new PxCanvas(dst.w, dst.h);
  const startX = Math.floor((dst.w - gw) * 0.5);
  const startY = Math.floor((dst.h - gh) * 0.5);

  for (let gy = 0; gy < gh; gy++) {
    const row = grid[gy]!;
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx]!;
      if (ch === '.' || ch === ' ') continue;
      const col = map[ch];
      if (col) emb.set(startX + gx, startY + gy, col);
    }
  }
  emb.outline(INK);
  for (let y = 0; y < dst.h; y++) {
    for (let x = 0; x < dst.w; x++) {
      const c = emb.get(x, y);
      if (c) dst.set(x, y, c);
    }
  }
}

function paintCardFrame1x(p: PxCanvas, bg: string, trim: string, isUltra: boolean): void {
  const w = p.w;
  const h = p.h;
  p.rect(1, 1, w - 2, h - 2, bg);
  p.rect(2, 2, w - 4, 2, trim);
  p.rect(2, h - 4, w - 4, 2, isUltra ? '#8a5c10' : '#121614');
  p.rect(1, 1, 1, h - 2, trim);
  p.rect(w - 2, 1, 1, h - 2, isUltra ? '#8a5c10' : '#121614');
  // Outer 1px crisp black ink border
  for (let x = 0; x < w; x++) {
    p.set(x, 0, INK);
    p.set(x, h - 1, INK);
  }
  for (let y = 0; y < h; y++) {
    p.set(0, y, INK);
    p.set(w - 1, y, INK);
  }
}

function registerSkillAndCrownSprites(b: FallbackAtlasBuilder): void {
  // 29 Bespoke Mutation Cards (24x32, 30 frames) + SHAPED Transparent-Background HUD Icons (16x16, 30 frames)!
  b.addSprite('sprSkillIcon', 24, 32, 12, 16, 30, (ctx, ox, oy, w, h, f) => {
    const pal = MUTATION_PALETTES[f % MUTATION_PALETTES.length]!;
    const p = new PxCanvas(w, h);
    paintCardFrame1x(p, pal.cardBg, pal.cardTrim, false);
    const grid = MUTATION_GRIDS_14[f % MUTATION_GRIDS_14.length] ?? MUTATION_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });

  // SHAPED transparent-background crisp 16x16 HUD mutation icons (exact match to 13_frozen_5_3.png & 15_palace_7_1.png!)
  b.addSprite('sprSkillIconHUD', 16, 16, 8, 8, 30, (ctx, ox, oy, w, h, f) => {
    const pal = MUTATION_PALETTES[f % MUTATION_PALETTES.length]!;
    const p = new PxCanvas(w, h);
    const grid = MUTATION_GRIDS_14[f % MUTATION_GRIDS_14.length] ?? MUTATION_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });

  // 24 Bespoke Ultra Cards (24x32, 24 frames) + SHAPED Transparent-Background HUD Icons (16x16, 24 frames)!
  b.addSprite('sprEGSkillIcon', 24, 32, 12, 16, 24, (ctx, ox, oy, w, h, f) => {
    const pal = ULTRA_PALETTES_24[f % ULTRA_PALETTES_24.length]!;
    const p = new PxCanvas(w, h);
    paintCardFrame1x(p, pal.cardBg, f % 2 === 1 ? '#f5b836' : '#ffe048', true);
    const grid = ULTRA_GRIDS_14[f % ULTRA_GRIDS_14.length] ?? ULTRA_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprEGIconHUD', 16, 16, 8, 8, 24, (ctx, ox, oy, w, h, f) => {
    const pal = ULTRA_PALETTES_24[f % ULTRA_PALETTES_24.length]!;
    const p = new PxCanvas(w, h);
    const grid = ULTRA_GRIDS_14[f % ULTRA_GRIDS_14.length] ?? ULTRA_GRIDS_14[0]!;
    paintEmblem1x(p, grid, pal);
    p.flush(ctx, ox, oy);
  });
  b.addAlias('sprUltraIcon', 'sprEGSkillIcon');

  // 13 Crisp 1x Floating Crowns (16x14, orig 8,7, 2 frames)
  const crownSpecs: ReadonlyArray<{ metal: string; hi: string; dark: string; gem: string; tall?: boolean; horned?: boolean }> = [
    { metal: '#988672', hi: '#ccc0ae', dark: '#5e5042', gem: '#e4ded4' },
    { metal: '#625c6c', hi: '#9890a4', dark: '#36323e', gem: '#ff3838', tall: true },
    { metal: '#ecc038', hi: '#fff498', dark: '#a27414', gem: '#ff385c' },
    { metal: '#cfd8e4', hi: '#ffffff', dark: '#7c8898', gem: '#ffe048', horned: true },
    { metal: '#dca834', hi: '#ffe484', dark: '#946612', gem: '#ff8828' },
    { metal: '#463c52', hi: '#786c88', dark: '#241e2c', gem: '#58ff70', tall: true, horned: true },
    { metal: '#c42c38', hi: '#f46c78', dark: '#74141e', gem: '#ffffff', tall: true },
    { metal: '#d8b044', hi: '#fff098', dark: '#8c6818', gem: '#c068ff', tall: true },
    { metal: '#ec8ca8', hi: '#ffc8da', dark: '#9c4c68', gem: '#ffe048' },
    { metal: '#ecc038', hi: '#fff498', dark: '#a27414', gem: '#4cf068' },
    { metal: '#8438c0', hi: '#be78f8', dark: '#4c1a78', gem: '#ff58c4', tall: true, horned: true },
    { metal: '#cc4434', hi: '#f88070', dark: '#7c2018', gem: '#ffe048' },
    { metal: '#8c9cb0', hi: '#c8d6e8', dark: '#505e70', gem: '#6ef4ff' },
  ];
  for (let c = 1; c <= 13; c++) {
    const cs = crownSpecs[c - 1]!;
    const drawCrown1x = (ctx: DrawCtx, ox: number, oy: number, w: number, h: number, f: number, walk: boolean): void => {
      const p = new PxCanvas(w, h);
      const bob = (walk ? (f & 1) : 0) + (f === 1 ? -1 : 0);
      const cy = 6 + bob;
      const cx = 8;
      const sp = cs.tall ? 5 : 3;
      // Base crown band
      p.rect(cx - 5, cy, 10, 5, cs.metal);
      p.rect(cx - 5, cy + 1, 10, 1, cs.hi);
      p.rect(cx - 5, cy + 4, 10, 1, cs.dark);
      // 3 spires (or curved horns)
      if (cs.horned) {
        p.poly([[cx - 5, cy], [cx - 7, cy - sp], [cx - 2, cy]], cs.hi);
        p.poly([[cx + 5, cy], [cx + 7, cy - sp], [cx + 2, cy]], cs.dark);
      } else {
        p.poly([[cx - 5, cy], [cx - 5, cy - sp], [cx - 2, cy]], cs.hi);
        p.poly([[cx + 5, cy], [cx + 5, cy - sp], [cx + 2, cy]], cs.dark);
      }
      p.poly([[cx - 2, cy], [cx, cy - sp - 1], [cx + 2, cy]], cs.hi);
      // Center jewel
      p.rect(cx - 1, cy + 1, 2, 3, cs.gem);
      p.set(cx - 1, cy + 1, '#ffffff');
      p.outline(INK);
      p.flush(ctx, ox, oy);
    };
    b.addSprite(`sprCrown${c}Idle`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown1x(ctx, x, y, w, h, f, false));
    b.addSprite(`sprCrown${c}Walk`, 16, 14, 8, 7, 2, (ctx, x, y, w, h, f) => drawCrown1x(ctx, x, y, w, h, f, true));
  }
}

// ============================================================================
// 3. CRISP 1x HUD SPRITES (EXACT MATCH TO 04_desert_1_1.png & 21_paused.png!)
// ============================================================================

function registerHudSprites(b: FallbackAtlasBuilder): void {
  // sprHealthBar (88x14, orig 0,0, 1f): stark crisp NT black-outlined white-rimmed HP frame!
  b.addSprite('sprHealthBar', 88, 14, 0, 0, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(0, 0, w, h, INK);
    p.rect(1, 1, w - 2, h - 2, '#d8d4dc');
    p.rect(2, 2, w - 4, h - 4, INK);
    p.rect(3, 3, w - 6, h - 6, '#1a141c');
    p.flush(ctx, ox, oy);
  });

  // sprHealthFill (1x8, orig 0,0, 11f):
  // frame 0 = PURE WHITE hurt flash; frame 1 = vibrant red-orange #fc3800 + #ff844c top bevel!
  b.addSprite('sprHealthFill', 1, 8, 0, 0, 11, (ctx, ox, oy, w, h, f) => {
    if (f === 0) {
      rect(ctx, ox, oy, w, h, '#ffffff');
      return;
    }
    if (f === 1) {
      rect(ctx, ox, oy, w, 1, '#ff844c');
      rect(ctx, ox, oy + 1, w, 6, '#fc3800');
      rect(ctx, ox, oy + 7, w, 1, '#b82000');
      return;
    }
    if (f === 2) {
      rect(ctx, ox, oy, w, 2, '#c82818');
      rect(ctx, ox, oy + 2, w, 4, '#8c140e');
      rect(ctx, ox, oy + 6, w, 2, '#580a08');
      return;
    }
    const tones = ['#e02c10', '#cc2018', '#b81c22', '#ff4d1a', '#ff7026', '#58ff70', '#6ef2ff', '#ffe048'];
    rect(ctx, ox, oy, w, h, tones[(f - 3) % tones.length]!);
    rect(ctx, ox, oy, w, 1, '#ffffff');
  });

  // sprExpBar (14x24, orig 0,0, 16f): crisp 1x black-outlined vertical glass rad canister tube!
  b.addSprite('sprExpBar', 14, 24, 0, 0, 16, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    // Metallic top & bottom canister end caps with dark vent ribs
    p.rect(1, 1, w - 2, 4, '#7a828c');
    p.rect(2, 1, w - 4, 1, '#bcc4ce');
    p.rect(3, 2, 1, 2, '#2a2e36');
    p.rect(6, 2, 2, 2, '#2a2e36');
    p.rect(10, 2, 1, 2, '#2a2e36');

    p.rect(1, h - 5, w - 2, 4, '#7a828c');
    p.rect(2, h - 2, w - 4, 1, '#444c56');
    p.rect(3, h - 4, 1, 2, '#2a2e36');
    p.rect(6, h - 4, 2, 2, '#2a2e36');
    p.rect(10, h - 4, 1, 2, '#2a2e36');

    // Dark recessed glass chamber
    p.rect(2, 5, w - 4, h - 10, '#181e1a');
    p.rect(3, 5, 1, h - 10, '#26302a');
    // Bright neon rad green bottom-up fill!
    const innerH = h - 10;
    const fillH = Math.round((f / 15) * innerH);
    if (fillH > 0) {
      const fy = h - 5 - fillH;
      p.rect(2, fy, w - 4, fillH, '#2ca828');
      p.rect(3, fy, w - 6, fillH, '#48e048');
      p.rect(5, fy, w - 10, fillH, '#98ff68');
      p.rect(2, fy, w - 4, 1, '#e8ffc8');
    }
    // Crisp 1px vertical glass shine streak
    p.rect(3, 6, 1, innerH - 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // sprExpBarLevel (14x24, orig 0,0, 1f): bright level-up outer glow
  b.addSprite('sprExpBarLevel', 14, 24, 0, 0, 1, (ctx, ox, oy, w, h) => {
    rect(ctx, ox, oy, w, 2, '#ffe048');
    rect(ctx, ox, oy + h - 2, w, 2, '#ffe048');
    rect(ctx, ox, oy, 2, h, '#ffe048');
    rect(ctx, ox + w - 2, oy, 2, h, '#ffe048');
    rect(ctx, ox + 2, oy + 3, w - 4, h - 6, 'rgba(160, 255, 110, 0.45)');
  });

  // sprCrosshair (16x16, orig 8,8, 9f): crisp 1x white & #0d0a10 black-outlined reticles!
  // Frame 0 = iconic Nuclear Throne circular crosshair with 4 inward ticks (04_desert_1_1.png!)
  b.addSprite('sprCrosshair', 16, 16, 8, 8, 9, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    const cx = 8;
    const cy = 8;
    switch (f) {
      case 0: {
        // Iconic circular Nuclear Throne crosshair with 4 crisp cardinal ticks!
        const pts: ReadonlyArray<[number, number]> = [
          [-2, -5], [-1, -5], [0, -5], [1, -5], [2, -5],
          [-4, -4], [-3, -4], [3, -4], [4, -4],
          [-4, -3], [4, -3],
          [-5, -2], [-5, -1], [-5, 0], [-5, 1], [-5, 2],
          [5, -2], [5, -1], [5, 0], [5, 1], [5, 2],
          [-4, 3], [4, 3],
          [-4, 4], [-3, 4], [3, 4], [4, 4],
          [-2, 5], [-1, 5], [0, 5], [1, 5], [2, 5],
        ];
        for (const [dx, dy] of pts) p.set(cx + dx, cy + dy, '#ffffff');
        // 4 inward ticks
        p.rect(cx, cy - 4, 1, 2, '#ffffff');
        p.rect(cx, cy + 3, 1, 2, '#ffffff');
        p.rect(cx - 4, cy, 2, 1, '#ffffff');
        p.rect(cx + 3, cy, 2, 1, '#ffffff');
        break;
      }
      case 1:
        p.rect(cx - 6, cy, 4, 1, '#ffffff');
        p.rect(cx + 3, cy, 4, 1, '#ffffff');
        p.rect(cx, cy - 6, 1, 4, '#ffffff');
        p.rect(cx, cy + 3, 1, 4, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 2:
        p.rect(cx - 5, cy - 5, 3, 1, '#ffffff'); p.rect(cx - 5, cy - 5, 1, 3, '#ffffff');
        p.rect(cx + 3, cy - 5, 3, 1, '#ffffff'); p.rect(cx + 5, cy - 5, 1, 3, '#ffffff');
        p.rect(cx - 5, cy + 5, 3, 1, '#ffffff'); p.rect(cx - 5, cy + 3, 1, 3, '#ffffff');
        p.rect(cx + 3, cy + 5, 3, 1, '#ffffff'); p.rect(cx + 5, cy + 3, 1, 3, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 3:
        p.line(cx - 5, cy - 5, cx - 2, cy - 2, '#ffffff', 1);
        p.line(cx + 5, cy - 5, cx + 2, cy - 2, '#ffffff', 1);
        p.line(cx - 5, cy + 5, cx - 2, cy + 2, '#ffffff', 1);
        p.line(cx + 5, cy + 5, cx + 2, cy + 2, '#ffffff', 1);
        p.set(cx, cy, '#ffe048');
        break;
      case 4:
        p.rect(cx - 6, cy, 5, 1, '#ffffff');
        p.rect(cx + 2, cy, 5, 1, '#ffffff');
        p.rect(cx, cy - 6, 1, 5, '#ffffff');
        p.rect(cx, cy + 2, 1, 5, '#ffffff');
        break;
      case 5:
        p.line(cx, cy - 5, cx + 5, cy, '#ffffff', 1);
        p.line(cx + 5, cy, cx, cy + 5, '#ffffff', 1);
        p.line(cx, cy + 5, cx - 5, cy, '#ffffff', 1);
        p.line(cx - 5, cy, cx, cy - 5, '#ffffff', 1);
        p.set(cx, cy, '#ffe048');
        break;
      case 6:
        p.rect(cx - 5, cy - 5, 11, 1, '#ffffff');
        p.rect(cx - 5, cy + 5, 11, 1, '#ffffff');
        p.rect(cx - 5, cy - 5, 1, 11, '#ffffff');
        p.rect(cx + 5, cy - 5, 1, 11, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
      case 7:
        p.rect(cx - 1, cy - 1, 3, 3, '#ffffff');
        break;
      default:
        p.rect(cx - 5, cy - 3, 1, 7, '#ffffff');
        p.rect(cx - 5, cy - 3, 3, 1, '#ffffff');
        p.rect(cx - 5, cy + 3, 3, 1, '#ffffff');
        p.rect(cx + 5, cy - 3, 1, 7, '#ffffff');
        p.rect(cx + 3, cy - 3, 3, 1, '#ffffff');
        p.rect(cx + 3, cy + 3, 3, 1, '#ffffff');
        p.set(cx, cy, '#ffe048');
        break;
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // 5 Crisp 1x Draining 8-Frame Ammo Icons (10x10, orig 5,5):
  // frame 0 = FULL BRIGHT -> frame 7 = DARK EMPTY (top-to-bottom pixel drain!)
  const applyDrain1x = (p: PxCanvas, f: number): void => {
    if (f <= 0) return;
    const drainRows = Math.min(p.h - 2, Math.ceil((f / 7) * (p.h - 2)));
    for (let y = 1; y < 1 + drainRows; y++) {
      for (let x = 1; x < p.w - 1; x++) {
        const cur = p.get(x, y);
        if (cur && cur !== INK) {
          p.set(x, y, f >= 7 ? '#2c2832' : '#423c4a');
        }
      }
    }
  };

  // Bullet icon: twin vertical gold bullets (matching 04_desert_1_1.png!)
  b.addSprite('sprBulletIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 2, 2, 6, '#f5cc38');
    p.set(2, 2, '#fff6a8');
    p.rect(2, 7, 2, 1, '#b87c18');
    p.rect(6, 2, 2, 6, '#f5cc38');
    p.set(6, 2, '#fff6a8');
    p.rect(6, 7, 2, 1, '#b87c18');
    applyDrain1x(p, f);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Shot / Shell icon: red shotgun shell + gold brass base!
  b.addSprite('sprShotIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(3, 2, 4, 4, '#e83428');
    p.rect(4, 2, 1, 3, '#ff8070');
    p.rect(3, 6, 4, 2, '#f5cc38');
    p.set(4, 6, '#fff8a8');
    applyDrain1x(p, f);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });
  b.addAlias('sprShellIcon', 'sprShotIcon');

  // Bolt icon: crisp upward-pointing green/gold crossbow arrow bolt!
  b.addSprite('sprBoltIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.set(5, 1, '#ffffff');
    p.rect(4, 2, 3, 2, '#58e850');
    p.rect(3, 3, 5, 1, '#34a830');
    p.rect(5, 4, 1, 5, '#e0b048');
    p.rect(4, 7, 3, 1, '#a87c2c');
    applyDrain1x(p, f);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Explo icon: orange-gold round grenade/bomb with lit white fuse!
  b.addSprite('sprExploIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.ellipse(5, 6, 3, 2.8, '#f08c28');
    p.rect(3, 4, 2, 2, '#ffd068');
    p.rect(4, 2, 2, 2, '#7c8894');
    p.set(6, 1, '#ffe448');
    p.set(7, 1, '#ffffff');
    applyDrain1x(p, f);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Energy icon: crisp bright yellow/white lightning bolt cell!
  b.addSprite('sprEnergyIcon', 10, 10, 5, 5, 8, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(5, 1, 2, 2, '#ffe848');
    p.rect(4, 3, 2, 2, '#ffffff');
    p.rect(3, 4, 5, 2, '#ffe848');
    p.rect(5, 6, 2, 2, '#68ecff');
    p.set(4, 8, '#ffffff');
    applyDrain1x(p, f);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // sprRogueAmmoHUD (11x16, orig 1,1, 4 frames)
  b.addSprite('sprRogueAmmoHUD', 11, 16, 1, 1, 4, (ctx, ox, oy, w, h, f) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 1, w - 2, h - 2, '#3c4c6c');
    for (let slot = 0; slot < 3; slot++) {
      const sy = 10 - slot * 3;
      const lit = slot < f;
      p.rect(3, sy, w - 6, 2, lit ? '#44b4ff' : '#1c2434');
      if (lit) p.rect(3, sy, w - 6, 1, '#d8fbff');
    }
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprAmmoIcons', 10, 10, 5, 5, 6, (ctx, ox, oy, w, h, f) => {
    const cols = ['#f5cc38', '#e83428', '#58e850', '#f08c28', '#ffe848', '#d8e0e8'];
    const p = new PxCanvas(w, h);
    p.rect(2, 2, 6, 6, cols[f % cols.length]!);
    p.rect(3, 3, 3, 2, '#ffffff');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  // Crisp native 8x8 white Kills Skull with 1px #0d0a10 outline (exact match to 21_paused.png!)
  b.addSprite('sprKillsIcon', 8, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 1, 4, 4, '#ffffff');
    p.rect(1, 2, 6, 3, '#f2eee6');
    p.rect(2, 5, 4, 2, '#d8d2c8');
    p.set(2, 3, INK);
    p.set(5, 3, INK);
    p.set(3, 6, INK);
    p.set(5, 6, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprGameOverSkull', 8, 6, 4, 3, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(2, 1, 4, 3, '#ffffff');
    p.rect(1, 2, 6, 2, '#eeeae2');
    p.rect(2, 4, 4, 1, '#d4cec4');
    p.set(2, 2, INK);
    p.set(5, 2, INK);
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprGameOverThrone', 9, 8, 4, 4, 1, (ctx, ox, oy, w, h) => {
    const p = new PxCanvas(w, h);
    p.rect(1, 1, 7, 6, '#743836');
    p.rect(2, 2, 2, 4, '#84f418');
    p.rect(5, 2, 2, 4, '#84f418');
    p.rect(4, 3, 1, 4, '#a01f31');
    p.outline(INK);
    p.flush(ctx, ox, oy);
  });

  b.addSprite('sprMapDot', 3, 3, 1, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 3, 3, '#e6e6eb');
    px(ctx, x + 1, y + 1, '#ffffff');
  });
}

export function registerFallbackUi(b: FallbackAtlasBuilder): void {
  // 1. Crisp 1x Krunked Throne Title Emblem & Glow
  registerLogoSprites(b);

  // 2. Large Comic Bust Portraits (96x80, orig 48,40, 24 frames, transparent background!)
  b.addSprite('sprBigPortrait', 96, 80, 48, 40, 24, (ctx, x, y, w, h, f) =>
    drawMutantBigPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 3. Mini Char Select Roster Cards (16x24, orig 0,0, 18 frames)
  b.addSprite('sprCharSelect', 16, 24, 0, 0, 18, (ctx, x, y, w, h, f) =>
    drawCharSelectCardHiBit(ctx, x, y, w, h, f),
  );

  // 3b. 5 Custom Close-Up Boss Intro Portraits (80x70, orig 40,35, 5 frames)
  b.addSprite('sprBuiltinBossPortrait', 80, 70, 40, 35, 5, (ctx, x, y, w, h, f) =>
    drawBossIntroPortraitHiBit(ctx, x, y, w, h, f),
  );

  // 4. 29 Bespoke Mutation Cards/Shaped HUD Icons + 24 Ultra Cards/Icons + 13 Crowns
  registerSkillAndCrownSprites(b);

  // 5. Crisp 1x HUD, Health Bar/Fill, Rad Canister, Crosshairs & Draining Ammo Icons
  registerHudSprites(b);
}
