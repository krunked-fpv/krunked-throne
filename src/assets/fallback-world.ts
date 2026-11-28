import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  hash2d,
} from './fallback-fonts';
import {
  type ColorRamp,
  PxCanvas,
  bayer4,
  fbm2d,
  hashF,
  makeRamp,
  mixHex,
  shadeHex,
  voronoi2d,
} from './pixel-art';

type BiomePattern =
  | 'campfire'
  | 'desert'
  | 'sewers'
  | 'scrapyard'
  | 'caves'
  | 'frozen'
  | 'labs'
  | 'palace'
  | 'vault'
  | 'oasis'
  | 'pizza'
  | 'mansion'
  | 'cursed'
  | 'jungle'
  | 'hq'
  | 'crib';

interface BiomeTheme {
  code: number;
  pattern: BiomePattern;
  floorBase: string;
  floorHi: string;
  floorMid: string;
  floorDark: string;
  floorCrack: string;
  accent: string;
  accent2: string;
  wallTop: string;
  wallTopHi: string;
  wallTopDark: string;
  wallBot: string;
  wallBotHi: string;
  wallBotDark: string;
  wallOut: string;
}

const BIOME_THEMES: readonly BiomeTheme[] = [
  {
    code: 0, pattern: 'campfire',
    floorBase: '#634c38', floorHi: '#80644a', floorMid: '#4f3b2b', floorDark: '#38291e', floorCrack: '#241913',
    accent: '#e87c2e', accent2: '#9c8369',
    wallTop: '#4a382b', wallTopHi: '#6b523e', wallTopDark: '#2e221a',
    wallBot: '#33261e', wallBotHi: '#523e30', wallBotDark: '#1c1410', wallOut: '#120c0e',
  },
  {
    code: 1, pattern: 'desert',
    // Iconic Nuclear Throne sun-baked golden ochre sand + dusty warm sandstone walls!
    floorBase: '#e2bc5b', floorHi: '#f5d97e', floorMid: '#cfa244', floorDark: '#b38230', floorCrack: '#7d5620',
    accent: '#fff0b3', accent2: '#7a9e48',
    wallTop: '#bda074', wallTopHi: '#dec397', wallTopDark: '#94774e',
    wallBot: '#876641', wallBotHi: '#ad885c', wallBotDark: '#573c22', wallOut: '#1a110d',
  },
  {
    code: 2, pattern: 'sewers',
    // High-contrast olive-moss wet sewer stone + bright lime toxic accents
    floorBase: '#4c664a', floorHi: '#688763', floorMid: '#3a5239', floorDark: '#263827', floorCrack: '#162418',
    accent: '#74e052', accent2: '#549685',
    wallTop: '#3a543c', wallTopHi: '#587a58', wallTopDark: '#243827',
    wallBot: '#25382a', wallBotHi: '#426348', wallBotDark: '#121f17', wallOut: '#0a120d',
  },
  {
    code: 3, pattern: 'scrapyard',
    // Sunlit dusty gray concrete asphalt + warm rust-ochre scrap steel walls!
    floorBase: '#696863', floorHi: '#82807a', floorMid: '#555450', floorDark: '#3d3c3a', floorCrack: '#242324',
    accent: '#c46839', accent2: '#e3b84b',
    wallTop: '#8c5538', wallTopHi: '#b8764f', wallTopDark: '#5e3420',
    wallBot: '#5c3420', wallBotHi: '#8c5436', wallBotDark: '#331b11', wallOut: '#170c09',
  },
  {
    code: 4, pattern: 'caves',
    // Saturated royal-violet crystal cavern floors + vivid electric amethyst crystal walls!
    floorBase: '#462c63', floorHi: '#623f87', floorMid: '#341e4d', floorDark: '#211133', floorCrack: '#12081f',
    accent: '#df85ff', accent2: '#ff94ef',
    wallTop: '#7a3ba8', wallTopHi: '#b366e8', wallTopDark: '#4f2173',
    wallBot: '#522278', wallBotHi: '#8c44c4', wallBotDark: '#2b0f45', wallOut: '#140621',
  },
  {
    code: 5, pattern: 'frozen',
    // Crisp sunlit alpine snowfield + icy sky shadows + deep winter steel city blocks
    floorBase: '#d4e4f0', floorHi: '#edf5fc', floorMid: '#afc7db', floorDark: '#7f9eb8', floorCrack: '#4c6b87',
    accent: '#ffffff', accent2: '#758a9c',
    wallTop: '#e0effa', wallTopHi: '#ffffff', wallTopDark: '#9cb8d1',
    wallBot: '#394c66', wallBotHi: '#5e7ba1', wallBotDark: '#1f2b3d', wallOut: '#0e1521',
  },
  {
    code: 6, pattern: 'labs',
    // Clean clinical slate-teal lab decking + bright emerald cloning glow
    floorBase: '#496e70', floorHi: '#648f91', floorMid: '#375759', floorDark: '#253d40', floorCrack: '#152729',
    accent: '#5eff8c', accent2: '#e8c44d',
    wallTop: '#3e5e63', wallTopHi: '#60898f', wallTopDark: '#263d42',
    wallBot: '#253b40', wallBotHi: '#456a73', wallBotDark: '#132126', wallOut: '#081014',
  },
  {
    code: 7, pattern: 'palace',
    // Iconic Nuclear Throne luminous royal steel-blue masonry + gleaming gold & emerald!
    floorBase: '#475778', floorHi: '#63769e', floorMid: '#364361', floorDark: '#242d45', floorCrack: '#141a2b',
    accent: '#f0c754', accent2: '#54ff84',
    wallTop: '#3c4a6b', wallTopHi: '#5c6f9c', wallTopDark: '#242e47',
    wallBot: '#25304a', wallBotHi: '#465882', wallBotDark: '#121829', wallOut: '#070a14',
  },
  {
    code: 100, pattern: 'vault',
    floorBase: '#485161', floorHi: '#626e82', floorMid: '#3a424f', floorDark: '#29303b', floorCrack: '#191e26',
    accent: '#54db9e', accent2: '#d4b357',
    wallTop: '#394457', wallTopHi: '#5b6c87', wallTopDark: '#252c3b',
    wallBot: '#242c3b', wallBotHi: '#45546e', wallBotDark: '#131821', wallOut: '#0b0e14',
  },
  {
    code: 101, pattern: 'oasis',
    floorBase: '#32756e', floorHi: '#4da197', floorMid: '#265e59', floorDark: '#1a4542', floorCrack: '#0f2e2c',
    accent: '#91f5e2', accent2: '#f08675',
    wallTop: '#245261', wallTopHi: '#418196', wallTopDark: '#163540',
    wallBot: '#16343d', wallBotHi: '#2e6070', wallBotDark: '#0b1e24', wallOut: '#071317',
  },
  {
    code: 102, pattern: 'pizza',
    floorBase: '#5e4838', floorHi: '#7d614b', floorMid: '#4c392c', floorDark: '#36271e', floorCrack: '#211712',
    accent: '#d9843b', accent2: '#5cb34d',
    wallTop: '#703a2d', wallTopHi: '#995340', wallTopDark: '#4a231a',
    wallBot: '#47221a', wallBotHi: '#753c2f', wallBotDark: '#26100c', wallOut: '#170907',
  },
  {
    code: 103, pattern: 'mansion',
    floorBase: '#66303f', floorHi: '#854254', floorMid: '#522431', floorDark: '#381620', floorCrack: '#240c14',
    accent: '#e8bd4f', accent2: '#57d46c',
    wallTop: '#9c7a33', wallTopHi: '#cfa94e', wallTopDark: '#694f1c',
    wallBot: '#694e1c', wallBotHi: '#a37e31', wallBotDark: '#3d2c0d', wallOut: '#211706',
  },
  {
    code: 104, pattern: 'cursed',
    floorBase: '#2d163b', floorHi: '#46245c', floorMid: '#220f2e', floorDark: '#170921', floorCrack: '#0d0414',
    accent: '#eb54b8', accent2: '#a84aff',
    wallTop: '#731e54', wallTopHi: '#b03c84', wallTopDark: '#4a1036',
    wallBot: '#4f1239', wallBotHi: '#872463', wallBotDark: '#2b081f', wallOut: '#170311',
  },
  {
    code: 105, pattern: 'jungle',
    floorBase: '#325230', floorHi: '#4a7545', floorMid: '#264225', floorDark: '#1a3019', floorCrack: '#0f1f0f',
    accent: '#7de053', accent2: '#d94862',
    wallTop: '#264222', wallTopHi: '#44703c', wallTopDark: '#162913',
    wallBot: '#162913', wallBotHi: '#2f5429', wallBotDark: '#0b170a', wallOut: '#070f06',
  },
  {
    code: 106, pattern: 'hq',
    floorBase: '#2f4161', floorHi: '#455d87', floorMid: '#24334d', floorDark: '#182236', floorCrack: '#0e1524',
    accent: '#66dcff', accent2: '#3878e0',
    wallTop: '#20304d', wallTopHi: '#3d5b8c', wallTopDark: '#131d30',
    wallBot: '#121c30', wallBotHi: '#294069', wallBotDark: '#090f1c', wallOut: '#050912',
  },
  {
    code: 107, pattern: 'crib',
    floorBase: '#4a2e5c', floorHi: '#67447d', floorMid: '#3b234a', floorDark: '#291636', floorCrack: '#190c21',
    accent: '#f0c44d', accent2: '#c966ff',
    wallTop: '#3c214a', wallTopHi: '#683c7d', wallTopDark: '#251230',
    wallBot: '#261430', wallBotHi: '#4d2a5e', wallBotDark: '#14091c', wallOut: '#0c0512',
  },
];

// ============================================================================
// 64x64 HI-BIT BIOME FLOOR SLABS (ODINFALL-GRADE TEXTURAL CRAFT)
// ============================================================================

/**
 * Generates seamless 64x64 Hi-Bit (32x32 logical) biome floor slabs using
 * tileable Voronoi stonework, fBm wind-rippled sand/snow/moss, Bayer dithering,
 * weathered cracks, and subtle environmental storytelling details.
 */
function drawBiomeFloor64(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
  isAltB = false,
): void {
  const buf = new PxCanvas(w, h);
  const seed = t.code * 31 + frame * 17 + (isAltB ? 503 : 0);

  // Tileable pixel-by-pixel surface synthesis (strictly exact 64px periodic coordinates — ZERO tile seams!)
  const TAU64 = (Math.PI * 2) / 64;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dith = (bayer4(px, py) / 16 - 0.5) * 0.14;
      let col = t.floorBase;

      if (t.pattern === 'desert' || t.pattern === 'campfire') {
        // Exact-period seamless wind-sculpted desert sand dunes + fine mineral grain
        const warp = fbm2d(px, py, 16, seed + 5, 64) * 2.4;
        const wave = Math.sin(px * TAU64 * 2 + py * TAU64 * 3 + warp) * 0.5 + 0.5;
        const n = fbm2d(px, py, 16, seed, 64);
        const grain = (hashF(px, py, seed + 13) - 0.5) * 0.10;
        const val = wave * 0.36 + n * 0.64 + dith + grain;
        if (val > 0.68) col = t.floorHi;
        else if (val > 0.44) col = t.floorBase;
        else if (val > 0.28) col = t.floorMid;
        else col = t.floorDark;

        // Subtle dry cracked hardpan clay pockets in desert frame 2 / alt B
        if (t.pattern === 'desert' && (frame === 2 || isAltB)) {
          const v = voronoi2d(px, py, 16, seed + 41, 4, 0.78);
          const mask = fbm2d(px, py, 16, seed + 77, 64);
          if (mask > 0.58 && v.edge < 0.08) col = t.floorCrack;
          else if (mask > 0.58 && v.edge < 0.14 && v.dy < 0) col = t.floorHi;
        }
      } else if (t.pattern === 'sewers' || t.pattern === 'vault' || t.pattern === 'palace' || t.pattern === 'pizza') {
        // Hand-carved masonry & irregular flagstones with organic chipped bevels & recessed mortar
        const isBrick = t.pattern === 'pizza';
        const isStately = t.pattern === 'palace' || t.pattern === 'vault';
        if (isStately) {
          // Monumental staggered ashlar stone slabs with beveled top-left catch lights & veined marble
          const rowH = 32;
          const rowIdx = Math.floor(py / rowH);
          const ox = (rowIdx & 1) * 16;
          const lx = (px + ox) & 31;
          const ly = py & 31;
          const slabHash = hashF(((px + ox) >> 5) & 1, rowIdx, seed + 7);
          const vein = fbm2d(px + py, py, 16, seed + 29, 64);
          const isMortar = lx === 0 || ly === 0 || (lx === 31 && hashF(px, py, seed) > 0.7) || (ly === 31 && hashF(px, py, seed + 3) > 0.7);
          // Subtle chipped corner breaks so slabs feel hand-carved, never sterile grid!
          const chip = (lx <= 2 || lx >= 29) && (ly <= 2 || ly >= 29) && hashF(px >> 1, py >> 1, seed + 19) > 0.55;
          if (isMortar || chip) {
            col = t.floorCrack;
          } else if (ly === 1 || (lx === 1 && ly < 28)) {
            col = vein > 0.35 ? t.floorHi : t.floorBase;
          } else if (ly === 30 || lx === 30) {
            col = t.floorDark;
          } else {
            const tone = slabHash * 0.32 + vein * 0.68 + dith;
            if (tone > 0.72) col = t.floorHi;
            else if (tone > 0.44) col = t.floorBase;
            else if (tone > 0.22) col = t.floorMid;
            else col = t.floorDark;
          }
        } else if (isBrick) {
          // Warm staggered subterranean terracotta brickwork
          const rowH = 16;
          const rowIdx = Math.floor(py / rowH);
          const ox = (rowIdx & 1) * 16;
          const lx = (px + ox) & 31;
          const ly = py & 15;
          const bHash = hashF(((px + ox) >> 5) & 1, rowIdx, seed + 11);
          const n = fbm2d(px, py, 8, seed + 23, 64);
          if (lx === 0 || ly === 0) col = t.floorCrack;
          else if (ly === 1 || lx === 1) col = t.floorHi;
          else if (ly === 14 || lx === 30) col = t.floorDark;
          else {
            const v = bHash * 0.45 + n * 0.55 + dith;
            col = v > 0.68 ? t.floorHi : v > 0.42 ? t.floorBase : v > 0.24 ? t.floorMid : t.floorDark;
          }
        } else {
          // Sewers: organic irregular Voronoi mossy cobblestones & flagstones!
          const v = voronoi2d(px, py, 16, seed + 3, 4, 0.62);
          const n = fbm2d(px, py, 16, seed + 17, 64);
          if (v.edge < 0.085) {
            col = n > 0.64 ? t.accent : t.floorCrack;
          } else {
            const bevel = (-v.dx * 0.45 - v.dy * 0.65) * 0.45;
            const tone = (v.cellId / 255) * 0.28 + n * 0.55 + bevel + dith;
            if (v.edge < 0.16 && v.dy < -0.1) col = t.floorHi;
            else if (v.edge < 0.16 && v.dy > 0.15) col = t.floorDark;
            else if (tone > 0.66) col = t.floorHi;
            else if (tone > 0.40) col = t.floorBase;
            else if (tone > 0.22) col = t.floorMid;
            else col = t.floorDark;
          }
        }
      } else if (t.pattern === 'scrapyard') {
        // Weathered cracked asphalt + oil stains + recessed expansion seams + gravel aggregate
        const n = fbm2d(px, py, 16, seed, 64);
        const agg = hashF(px, py, seed + 37);
        const isSeam = (px === 31 && agg > 0.18) || (py === 31 && agg > 0.18);
        if (isSeam) {
          col = t.floorCrack;
        } else if (px === 32 || py === 32) {
          col = t.floorHi;
        } else {
          const val = n * 0.8 + agg * 0.2 + dith;
          col = val > 0.68 ? t.floorHi : val > 0.44 ? t.floorBase : val > 0.26 ? t.floorMid : t.floorDark;
        }
      } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
        // Volcanic obsidian & crystal cavern bedrock strata (Voronoi faceted rock shelves!)
        const v = voronoi2d(px, py, 16, seed + 9, 4, 0.74);
        const n = fbm2d(px, py, 16, seed + 31, 64);
        if (v.edge < 0.065) {
          col = t.floorCrack;
        } else {
          const facet = (-v.dx * 0.4 - v.dy * 0.65) * 0.45 + n * 0.55 + dith;
          if (v.edge < 0.13 && v.dy < -0.08) col = t.floorHi;
          else if (facet > 0.62) col = t.floorHi;
          else if (facet > 0.36) col = t.floorBase;
          else if (facet > 0.18) col = t.floorMid;
          else col = t.floorDark;
        }
      } else if (t.pattern === 'frozen') {
        // Seamless soft alpine snowfield drifts + crisp frost highlights + subtle winter cobble peeks (ZERO grid seams!)
        const macro = fbm2d(px, py, 32, seed + 3, 64);
        const detail = fbm2d(px, py, 16, seed + 17, 64);
        const gentleRipple = Math.sin(px * TAU64 + py * TAU64 * 2 + macro * 2.2) * 0.5 + 0.5;
        const sparkle = hashF(px, py, seed + 61);
        const val = macro * 0.52 + detail * 0.30 + gentleRipple * 0.18 + dith * 0.85;
        if (val > 0.78 || (sparkle > 0.992 && val > 0.56)) col = t.accent;
        else if (val > 0.54) col = t.floorHi;
        else if (val > 0.36) col = t.floorBase;
        else if (val > 0.22) col = t.floorMid;
        else col = t.floorDark;
      } else if (t.pattern === 'labs' || t.pattern === 'hq') {
        // Industrial sci-fi beveled alloy decking with recessed conduit channels & bolt heads
        const lx = px & 31;
        const ly = py & 31;
        const panelHash = hashF(px >> 5, py >> 5, seed + 5);
        const brush = fbm2d(px, py, 16, seed + 19, 64);
        if (lx === 0 || ly === 0) col = t.floorCrack;
        else if (lx === 1 || ly === 1) col = t.floorHi;
        else if (lx === 31 || ly === 31) col = t.floorDark;
        else if ((lx === 4 || lx === 27) && (ly === 4 || ly === 27)) col = t.floorCrack;
        else if ((lx === 4 || lx === 27) && (ly === 3 || ly === 26)) col = t.floorHi;
        else {
          const val = panelHash * 0.26 + brush * 0.74 + dith;
          col = val > 0.68 ? t.floorHi : val > 0.42 ? t.floorBase : val > 0.22 ? t.floorMid : t.floorDark;
        }
      } else if (t.pattern === 'jungle' || t.pattern === 'oasis') {
        // Odinfall-style lush mossy undergrowth / shimmering sunlit oasis seabed!
        const n = fbm2d(px, py, 16, seed, 64);
        const n2 = fbm2d(px, py, 8, seed + 41, 64);
        const val = n * 0.65 + n2 * 0.35 + dith;
        if (val > 0.72) col = t.floorHi;
        else if (val > 0.46) col = t.floorBase;
        else if (val > 0.28) col = t.floorMid;
        else col = t.floorDark;
        if (t.pattern === 'oasis') {
          // Subtle sunlit water caustic web
          const caust = voronoi2d(px, py, 16, seed + 13, 4, 0.85);
          if (caust.edge < 0.06 && n > 0.48) col = t.floorHi;
          if (caust.edge < 0.03 && n > 0.62) col = t.accent;
        }
      } else {
        // Mansion / Crib: inlaid luxury herringbone / velvet parquet floor slabs
        const lx = px & 31;
        const ly = py & 31;
        const n = fbm2d(px, py, 16, seed, 64);
        const border = lx === 0 || ly === 0 || lx === 31 || ly === 31;
        const inset = (lx === 4 || lx === 27) && ly >= 4 && ly <= 27 || (ly === 4 || ly === 27) && lx >= 4 && lx <= 27;
        if (border) col = t.floorDark;
        else if (inset) col = t.floorMid;
        else if (lx === 1 || ly === 1) col = t.floorHi;
        else {
          const val = n + dith;
          col = val > 0.64 ? t.floorHi : val > 0.38 ? t.floorBase : t.floorMid;
        }
      }

      buf.set(px, py, col);
    }
  }

  // Hand-crafted surface storytelling overlays per variant & Alt-B showcase slabs!
  const stoneRamp = makeRamp(t.floorMid, t.floorCrack);
  const accentRamp = makeRamp(t.accent, t.floorCrack);

  if (isAltB) {
    // Rich architectural / environmental showcase 64x64 slabs (~14% of intact 2x2 floor blocks)
    if (t.pattern === 'desert') {
      if (frame === 0) {
        // Partially buried sun-bleached sandstone flagstones + dry tuft
        buf.bevelBox(12, 14, 18, 12, makeRamp(t.floorMid, t.floorCrack), true);
        buf.bevelBox(33, 28, 16, 14, makeRamp(t.floorDark, t.floorCrack), true);
        buf.crack(16, 18, 10, 0.4, seed, t.floorCrack, t.floorHi);
        buf.leafTuft(44, 18, 4.5, seed + 3, makeRamp(t.accent2, t.floorCrack));
      } else {
        // Half-buried bleached desert ribcage / stone circle
        buf.organicBlob(32, 34, 12, 7, seed + 9, 0.2, makeRamp(t.floorDark, t.floorCrack));
        const bone = makeRamp('#dfd2b6', '#5e442c');
        buf.shadedCapsule(22, 30, 36, 26, 2, bone);
        buf.shadedCapsule(26, 36, 40, 32, 1.8, bone);
        buf.shadedCapsule(28, 41, 38, 38, 1.5, bone);
      }
    } else if (t.pattern === 'sewers') {
      // Recessed cast-iron sewer floor drain grate with subtle mossy drip
      buf.rect(18, 18, 28, 28, t.floorCrack);
      buf.bevelBox(19, 19, 26, 26, makeRamp('#2f3b38', '#0d1412'), false);
      buf.rect(22, 22, 20, 20, '#0c1411');
      for (let gx = 24; gx <= 38; gx += 4) {
        buf.rect(gx, 22, 2, 20, '#3a4a44');
        buf.rect(gx, 22, 1, 20, '#5a6e66');
      }
      buf.leafTuft(18, 44, 4, seed + 5, accentRamp);
    } else if (t.pattern === 'scrapyard') {
      if (frame === 0) {
        // Bolted diamond-plate scrap access hatch + faded highway paint stripe
        buf.bevelBox(14, 16, 36, 30, makeRamp('#3d3a3d', '#141214'), true);
        for (let gy = 20; gy <= 40; gy += 6) {
          for (let gx = 18; gx <= 44; gx += 8) {
            buf.set(gx, gy, '#666066');
            buf.set(gx + 1, gy + 1, '#262326');
          }
        }
        buf.rect(17, 19, 2, 2, t.floorCrack);
        buf.rect(45, 19, 2, 2, t.floorCrack);
        buf.rect(17, 41, 2, 2, t.floorCrack);
        buf.rect(45, 41, 2, 2, t.floorCrack);
      } else {
        // Faded cracked wasteland yellow road lane stripe + oil smudge
        buf.ditherRect(8, 28, 48, 6, t.floorBase, '#8c7432', 0.65);
        buf.crack(14, 24, 16, 0.45, seed + 2, t.floorCrack, t.floorHi);
        buf.organicBlob(42, 44, 9, 6, seed + 8, 0.25, makeRamp('#22262b', '#111317'));
      }
    } else if (t.pattern === 'palace' || t.pattern === 'vault') {
      // Odinfall-style carved royal temple medallion & antique gold inlaid floor seal!
      buf.rect(14, 14, 36, 36, t.floorCrack);
      buf.bevelBox(15, 15, 34, 34, makeRamp(t.floorMid, t.floorCrack), true);
      buf.rect(19, 19, 26, 26, t.floorDark);
      buf.rect(20, 20, 24, 24, t.floorBase);
      // Muted inlaid antique filigree diamond
      buf.poly([[32, 21], [43, 32], [32, 43], [21, 32]], t.floorDark);
      buf.poly([[32, 23], [41, 32], [32, 41], [23, 32]], t.floorMid);
      buf.line(32, 24, 40, 32, t.accent, 1);
      buf.line(32, 24, 24, 32, t.accent, 1);
      buf.line(32, 40, 40, 32, mixHex(t.accent, t.floorDark, 0.45), 1);
      buf.line(32, 40, 24, 32, mixHex(t.accent, t.floorDark, 0.45), 1);
      buf.rect(31, 31, 2, 2, t.accent);
    } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
      // Embedded glowing amethyst/magenta crystal seam fracturing the cave floor
      buf.crack(14, 26, 24, 0.25, seed + 5, t.floorCrack, t.floorHi);
      buf.poly([[26, 30], [32, 20], [36, 30], [31, 34]], accentRamp);
      buf.poly([[36, 34], [43, 27], [44, 36], [38, 39]], makeRamp(t.accent2, t.floorCrack));
      buf.set(32, 22, '#ffffff');
    } else if (t.pattern === 'frozen') {
      // Cracked urban winter sidewalk & snow-dusted street grate peeking through snowdrift
      buf.bevelBox(16, 18, 32, 26, makeRamp('#5a6f82', '#263545'), true);
      buf.crack(20, 22, 16, 0.42, seed + 3, '#223140', '#8fa8bf');
      buf.organicBlob(22, 20, 10, 6, seed + 11, 0.25, makeRamp(t.floorHi, t.floorMid));
      buf.organicBlob(44, 40, 9, 5, seed + 17, 0.25, makeRamp(t.accent, t.floorHi));
    } else if (t.pattern === 'labs' || t.pattern === 'hq') {
      // Recessed illuminated sub-floor bio-coolant / telemetry glass conduit strip!
      buf.rect(12, 24, 40, 14, t.floorCrack);
      buf.bevelBox(13, 25, 38, 12, makeRamp(t.floorDark, t.floorCrack), false);
      buf.rect(16, 28, 32, 6, mixHex(t.accent, t.floorCrack, 0.65));
      buf.rect(17, 29, 30, 3, mixHex(t.accent, t.floorDark, 0.35));
      for (let bx = 20; bx <= 44; bx += 6) {
        buf.rect(bx, 26, 2, 10, t.floorDark);
        buf.rect(bx, 26, 1, 10, t.floorHi);
      }
    } else if (t.pattern === 'jungle') {
      // Ancient moss-blanketed jungle stepping stone + lush pixel fern fronds
      buf.organicBlob(32, 32, 15, 11, seed + 5, 0.18, makeRamp('#546352', '#172416'));
      buf.crack(24, 30, 12, 0.35, seed + 7, '#1d2b1c', '#7a8c76');
      buf.leafTuft(18, 22, 6, seed + 11, accentRamp);
      buf.leafTuft(45, 40, 5.5, seed + 19, accentRamp);
    } else {
      buf.bevelBox(18, 18, 28, 28, stoneRamp, true);
      buf.crack(22, 24, 14, 0.45, seed, t.floorCrack, t.floorHi);
    }
  } else {
    // Subtle per-frame craft details on standard floor variants 1, 2, 3 (frame 0 stays calm!)
    if (frame === 1) {
      buf.crack(14, 20, 12, 0.35, seed + 1, t.floorCrack, t.floorHi);
      buf.organicBlob(44, 42, 4.5, 3, seed + 7, 0.22, stoneRamp);
    } else if (frame === 2) {
      buf.crack(28, 14, 16, 0.62, seed + 2, t.floorCrack, t.floorHi);
      buf.crack(36, 22, 9, -0.45, seed + 5, t.floorCrack);
      if (t.pattern === 'sewers' || t.pattern === 'jungle') {
        buf.leafTuft(18, 44, 4.5, seed + 9, accentRamp);
      } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
        buf.poly([[18, 44], [21, 38], [24, 44]], accentRamp);
      }
    } else if (frame === 3) {
      buf.organicBlob(22, 38, 5, 3.2, seed + 3, 0.25, stoneRamp);
      buf.organicBlob(30, 42, 3, 2, seed + 8, 0.2, stoneRamp);
      if (t.pattern === 'desert') {
        buf.leafTuft(46, 20, 3.5, seed + 12, makeRamp(t.accent2, t.floorCrack));
      } else if (t.pattern === 'frozen') {
        buf.set(18, 18, '#ffffff');
        buf.set(44, 46, '#ffffff');
        buf.set(45, 45, t.accent);
      }
    }
  }

  buf.flush(ctx, x, y);
}

/**
 * Generates crisp 24x24 Hi-Bit (12x12 logical) biome ground micro-details (`sprDetail*`)
 * automatically sprinkled across floors by FloorBuffer for Odinfall-level living surfaces!
 */
function drawBiomeDetail24(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
): void {
  const buf = new PxCanvas(w, h);
  const seed = t.code * 47 + frame * 19;
  const rockRamp = makeRamp(t.floorDark, t.floorCrack);
  const accRamp = makeRamp(t.accent, t.floorCrack);

  switch (frame % 6) {
    case 0: {
      // Cluster of 3 chiseled biome pebbles with micro cast shadow
      buf.ellipse(11, 15, 5, 2.5, t.floorCrack);
      buf.organicBlob(10, 12, 4.2, 2.8, seed + 1, 0.22, rockRamp);
      buf.organicBlob(16, 14, 2.6, 1.8, seed + 2, 0.2, makeRamp(t.floorMid, t.floorCrack));
      buf.organicBlob(6, 15, 2.0, 1.4, seed + 3, 0.15, rockRamp);
      break;
    }
    case 1: {
      // Biome-specific organic flourish (grass tuft / moss / crystal shard / bolt / frost / coral)
      if (t.pattern === 'desert' || t.pattern === 'campfire') {
        buf.leafTuft(12, 13, 4.5, seed + 5, makeRamp(t.accent2, t.floorCrack));
      } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
        buf.poly([[8, 16], [12, 7], [15, 16]], accRamp);
        buf.poly([[14, 17], [17, 11], [19, 17]], makeRamp(t.accent2, t.floorCrack));
        buf.set(12, 8, '#ffffff');
      } else if (t.pattern === 'sewers' || t.pattern === 'jungle') {
        buf.leafTuft(12, 13, 5.2, seed + 7, accRamp);
      } else if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
        // Discarded gear / bolted scrap fragment
        buf.shadedEllipse(12, 12, 4.5, 3.5, makeRamp(t.accent, t.floorCrack));
        buf.ellipse(12, 12, 1.8, 1.5, t.floorCrack);
      } else if (t.pattern === 'frozen') {
        // Drifted snow mound + tiny icy glint
        buf.organicBlob(12, 14, 6, 3.2, seed + 9, 0.2, makeRamp(t.accent, t.floorMid));
        buf.set(11, 11, '#ffffff');
      } else {
        // Palace / Vault / Mansion: chipped gilded stone tile shard
        buf.bevelBox(8, 9, 8, 6, accRamp, true);
      }
      break;
    }
    case 2: {
      // Branching organic floor fracture with sunlit catch edge
      buf.crack(5, 11, 12, 0.2, seed + 11, t.floorCrack, t.floorHi);
      buf.crack(11, 12, 7, -0.65, seed + 13, t.floorCrack, t.floorHi);
      break;
    }
    case 3: {
      // Tiny sun-bleached wasteland skull / fossil / bone fragment!
      if (t.pattern === 'labs' || t.pattern === 'hq') {
        // Fallen glowing circuit strip
        buf.rect(6, 11, 12, 3, t.floorCrack);
        buf.rect(7, 12, 10, 1, t.accent);
      } else {
        const bone = makeRamp('#dbd0b8', t.floorCrack);
        buf.shadedEllipse(12, 11, 3.8, 3.2, bone);
        buf.rect(10, 14, 4, 2, bone.dark);
        buf.set(10, 11, t.floorCrack);
        buf.set(13, 11, t.floorCrack);
        buf.set(11, 9, '#fffdf0');
      }
      break;
    }
    case 4: {
      // Small damp puddle / oil slick / ash ring
      buf.organicBlob(12, 13, 6.5, 3.8, seed + 17, 0.28, makeRamp(t.floorDark, t.floorCrack));
      buf.line(9, 11, 13, 11, t.floorHi, 1);
      break;
    }
    default: {
      // Scattered micro-rubble & chipped masonry
      buf.bevelBox(7, 11, 5, 4, rockRamp, true);
      buf.bevelBox(13, 13, 4, 3, makeRamp(t.floorMid, t.floorCrack), false);
      buf.set(10, 16, t.floorCrack);
      buf.set(16, 10, t.floorHi);
      break;
    }
  }

  buf.flush(ctx, x, y);
}

/**
 * 32x32 Hi-Bit (16x16 logical) jagged blast-carved floor crater (`sprFloor*Explo`).
 */
function drawBiomeFloorExplo32(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
): void {
  const buf = new PxCanvas(w, h);
  const seed = t.code * 23 + frame * 31;
  // Base earth with scorched jagged crater rim
  buf.rect(0, 0, w, h, t.floorBase);
  buf.organicBlob(16, 16, 13, 11, seed + 1, 0.24, makeRamp(t.floorDark, t.floorCrack));
  buf.organicBlob(16, 16, 9, 7.5, seed + 3, 0.28, makeRamp(t.floorCrack, '#0a070c'));
  // Radiating blast fractures
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2 + frame * 0.45;
    buf.crack(16 + Math.cos(ang) * 7, 16 + Math.sin(ang) * 6, 8, ang, seed + a * 7, '#0d090f', t.floorHi);
  }
  // Scattered shattered masonry chunks
  const wallChunk = makeRamp(t.wallTop, t.wallOut);
  buf.organicBlob(7 + frame * 2, 8, 3.5, 2.5, seed + 11, 0.25, wallChunk);
  buf.organicBlob(23 - frame, 22, 4, 2.8, seed + 17, 0.25, makeRamp(t.wallBot, t.wallOut));
  buf.organicBlob(22, 9, 2.5, 2, seed + 23, 0.2, wallChunk);
  buf.flush(ctx, x, y);
}

// ============================================================================
// 32x32 HI-BIT SCULPTED 2.5D WALL TOPS & CLIFF/ARCHITECTURE FACADES
// ============================================================================

function drawBiomeWallTop32(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
): void {
  const buf = new PxCanvas(w, h);
  const seed = t.code * 59 + frame * 13;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dith = (bayer4(px, py) / 16 - 0.5) * 0.14;
      let col = t.wallTop;

      if (t.pattern === 'frozen') {
        // Seamless sculpted snowbank drifts
        const n = fbm2d(px, py, 10, seed, 32);
        const drift = Math.sin(px * 0.25 + py * 0.18 + n * 2.5) * 0.5 + 0.5;
        const val = drift * 0.5 + n * 0.5 + dith;
        col = val > 0.72 ? '#eef8ff' : val > 0.48 ? t.wallTopHi : val > 0.25 ? t.wallTop : t.wallTopDark;
      } else if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
        // Seamless industrial welded hull plating with brushed metal grain
        const n = fbm2d(px * 1.5, py * 0.7, 9, seed, 32);
        const val = n + dith;
        col = val > 0.65 ? t.wallTopHi : val > 0.32 ? t.wallTop : t.wallTopDark;
        if (frame === 1 && py === 16) col = t.wallTopDark;
        if (frame === 1 && py === 17) col = t.wallTopHi;
      } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
        // Jagged Voronoi volcanic basalt cavern cap
        const v = voronoi2d(px, py, 10.667, seed + 7, 3, 0.75);
        const facet = (-v.dx * 0.4 - v.dy * 0.65) * 0.5 + fbm2d(px, py, 8, seed, 32) * 0.5 + dith;
        if (v.edge < 0.08) col = t.wallTopDark;
        else col = facet > 0.62 ? t.wallTopHi : facet > 0.30 ? t.wallTop : t.wallTopDark;
      } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib' || t.pattern === 'vault') {
        // Grand carved parapet stonework with mineral marbling
        const n = fbm2d(px + py * 0.4, py, 9, seed, 32);
        const val = n + dith;
        col = val > 0.66 ? t.wallTopHi : val > 0.34 ? t.wallTop : t.wallTopDark;
        if (frame === 1 && py === 15) col = t.wallTopDark;
        if (frame === 1 && py === 16) col = t.wallTopHi;
      } else {
        // Desert / Sewers / Jungle / Oasis / Pizza / Campfire: layered organic mesa & stone strata!
        const n = fbm2d(px, py * 1.4, 9, seed, 32);
        const v = voronoi2d(px, py, 16, seed + 5, 2, 0.7);
        const val = n * 0.65 + (1 - v.d1) * 0.35 + dith;
        if (v.edge < 0.075 && frame >= 1) col = t.wallTopDark;
        else col = val > 0.64 ? t.wallTopHi : val > 0.34 ? t.wallTop : t.wallTopDark;
      }
      buf.set(px, py, col);
    }
  }

  // Sparse rich surface accents on variants 2 & 3 (keeps frame 0 cohesive across big islands!)
  if (frame === 2) {
    buf.crack(6, 12, 14, 0.32, seed + 5, t.wallTopDark, t.wallTopHi);
    if (t.pattern === 'jungle' || t.pattern === 'sewers') {
      buf.leafTuft(22, 20, 5, seed + 13, makeRamp(t.accent, t.wallOut));
    }
  } else if (frame === 3) {
    if (t.pattern === 'caves' || t.pattern === 'cursed') {
      const cr = makeRamp(t.accent, t.wallOut);
      buf.poly([[12, 20], [16, 8], [21, 20], [16, 23]], cr);
      buf.set(16, 10, '#ffffff');
    } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
      buf.rect(7, 19, 18, 2, t.accent);
      buf.rect(7, 21, 18, 1, t.wallTopDark);
    } else if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
      buf.bevelBox(8, 10, 14, 10, makeRamp(t.wallTopDark, t.wallOut), false);
      buf.rect(10, 13, 10, 2, t.accent);
    } else {
      buf.organicBlob(18, 16, 6, 3.5, seed + 19, 0.25, makeRamp(t.wallTopDark, t.wallOut));
    }
  }

  buf.flush(ctx, x, y);
}

function drawBiomeWallBot32(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
): void {
  const buf = new PxCanvas(w, h);
  const seed = t.code * 73 + frame * 29;
  const botRamp = makeRamp(t.wallBot, t.wallOut);

  // Fill deep base cliff / masonry facade
  buf.rect(0, 0, w, h, t.wallBot);

  if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
    // Heavy 3D ribbed steel bulkheads with beveled armor plates, rivets & hazard/conduit details
    buf.bevelBox(2, 5, 13, 21, makeRamp(t.wallBotHi, t.wallOut), false);
    buf.bevelBox(17, 5, 13, 21, makeRamp(t.wallBotHi, t.wallOut), false);
    buf.rect(4, 7, 9, 17, t.wallBot);
    buf.rect(19, 7, 9, 17, t.wallBot);
    // Crisp corner rivets
    for (const [rx, ry] of [[4, 7], [11, 7], [4, 22], [11, 22], [19, 7], [26, 7], [19, 22], [26, 22]]) {
      buf.set(rx!, ry!, t.wallTopHi);
      buf.set(rx! + 1, ry! + 1, t.wallBotDark);
    }
    if (t.pattern === 'labs' && frame === 3) {
      // Weathered yellow/black caution stripe along base
      buf.rect(2, 22, 28, 4, '#14171c');
      for (let sx = 3; sx < 28; sx += 6) {
        buf.poly([[sx, 26], [sx + 3, 26], [sx + 5, 22], [sx + 2, 22]], '#d4ad33');
      }
    } else if (t.pattern === 'scrapyard' && frame >= 2) {
      // Oxidized rust streaks bleeding downward
      buf.ditherRect(6, 8, 5, 14, t.wallBot, t.accent, 0.55);
      buf.ditherRect(21, 11, 4, 11, t.wallBot, t.accent, 0.45);
    } else if (t.pattern === 'hq' && frame === 2) {
      buf.rect(5, 13, 7, 2, t.accent);
      buf.rect(20, 13, 7, 2, t.accent);
    }
  } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
    // Regal carved obsidian/royal stone colonnade with gilded frieze & recessed gothic arches
    buf.rect(0, 4, w, 2, t.accent);
    buf.rect(0, 6, w, 1, t.wallBotDark);
    // Pilasters
    buf.bevelBox(1, 8, 13, 19, makeRamp(t.wallBotHi, t.wallOut), false);
    buf.bevelBox(18, 8, 13, 19, makeRamp(t.wallBotHi, t.wallOut), false);
    buf.rect(4, 10, 7, 15, t.wallBot);
    buf.rect(21, 10, 7, 15, t.wallBot);
    // Carved keystone crest
    if (frame === 3) {
      buf.poly([[16, 11], [19, 15], [16, 20], [13, 15]], makeRamp(t.accent, t.wallOut));
      buf.set(16, 13, '#fff5b8');
    }
  } else if (t.pattern === 'desert' || t.pattern === 'campfire' || t.pattern === 'oasis') {
    // Sculpted layered sedimentary canyon cliff strata with rugged horizontal rock shelves & erosion cracks!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const band = Math.sin(py * 0.52 + fbm2d(px, py, 10, seed, 32) * 2.2);
        const n = fbm2d(px, py, 7, seed + 17, 32);
        const v = band * 0.45 + n * 0.55 + (bayer4(px, py) / 16 - 0.5) * 0.14;
        const col =
          v > 0.62 ? t.wallTopHi : v > 0.38 ? t.wallBotHi : v > 0.14 ? t.wallBot : t.wallBotDark;
        buf.set(px, py, col);
      }
    }
    // Deep horizontal sedimentary ledges & vertical sandstone joints
    const ledgeY = 13 + (frame & 1) * 2;
    buf.rect(0, ledgeY, w, 2, t.wallBotDark);
    buf.rect(0, ledgeY + 2, w, 1, t.wallTopHi);
    buf.crack(9 + frame * 3, 5, 16, 1.5, seed + 7, t.wallBotDark, t.wallTopHi);
    buf.crack(22 - frame * 2, 14, 12, 1.65, seed + 19, t.wallBotDark, t.wallTopHi);
  } else {
    // Sewers / Caves / Cursed / Frozen / Vault / Pizza / Jungle:
    // Organic staggered carved stone courses with chipped bevels & biome overhangs!
    const rows = [
      { y0: 4, rh: 8, ox: 0 },
      { y0: 12, rh: 8, ox: 8 },
      { y0: 20, rh: 8, ox: 4 },
    ];
    for (const r of rows) {
      for (let bx = -16; bx < w + 16; bx += 16) {
        const sx = bx + r.ox;
        if (sx + 15 < 0 || sx >= w) continue;
        const bh = hashF(sx, r.y0, seed);
        const stoneCol = bh > 0.62 ? t.wallBotHi : bh > 0.28 ? t.wallBot : t.wallBotDark;
        buf.bevelBox(sx + 1, r.y0, 14, r.rh - 1, makeRamp(stoneCol, t.wallOut), true);
      }
    }
    if (frame === 2) {
      buf.crack(14, 7, 16, 1.3, seed + 9, t.wallOut, t.wallTopHi);
    }
    if (t.pattern === 'sewers' || t.pattern === 'jungle') {
      // Draped organic mossy vines hanging from parapet overhang!
      const vineRamp = makeRamp(t.accent, t.wallOut);
      if (frame === 1 || frame === 2) {
        buf.leafTuft(8, 6, 4.2, seed + 3, vineRamp);
        buf.shadedCapsule(8, 7, 7, 17, 1.5, vineRamp);
        buf.leafTuft(23, 5, 3.8, seed + 11, vineRamp);
        buf.shadedCapsule(23, 6, 24, 14, 1.3, vineRamp);
      }
    } else if (t.pattern === 'frozen') {
      // Thick snow cornice overhang + glistening sculpted icicles!
      const snow = makeRamp('#dff2ff', '#5d83a6');
      buf.rect(0, 2, w, 4, '#eef8ff');
      buf.ditherRect(0, 6, w, 2, '#b8dcf5', t.wallBotHi, 0.5);
      for (const [ix, ilen] of [[5, 9], [13, 6], [21, 11], [27, 7]]) {
        buf.poly([[ix! - 2, 5], [ix! + 2, 5], [ix!, 5 + ilen!]], snow);
        buf.set(ix! - 1, 6, '#ffffff');
      }
    } else if ((t.pattern === 'caves' || t.pattern === 'cursed') && frame === 3) {
      // Protruding glowing amethyst/magenta crystal shard on cliff wall
      const cr = makeRamp(t.accent, t.wallOut);
      buf.poly([[11, 22], [15, 9], [20, 22]], cr);
      buf.poly([[18, 23], [22, 15], [24, 23]], makeRamp(t.accent2, t.wallOut));
      buf.set(15, 11, '#ffffff');
    }
  }

  // Deep shadow overhang lip directly beneath roof cap + grounding contact shadow & rubble pebbles at foot
  buf.rect(0, 0, w, 3, t.wallBotDark);
  buf.ditherRect(0, 3, w, 2, t.wallBotDark, t.wallBotHi, 0.5);
  buf.rect(0, h - 3, w, 3, t.wallOut);
  buf.organicBlob(6 + frame * 4, h - 2, 3.2, 1.8, seed + 41, 0.25, botRamp);
  buf.organicBlob(25 - frame * 3, h - 2, 2.8, 1.6, seed + 53, 0.25, botRamp);

  buf.flush(ctx, x, y);
}

// ============================================================================
// REGISTER ALL HI-BIT WORLD TILESETS, PROPS, CHESTS, PORTALS, PICKUPS & DECALS
// ============================================================================

/**
 * Registers ALL 16 biome Hi-Bit floor/wall tilesets (64x64 slabs + 64x64 Alt-B showcase slabs +
 * 24x24 micro-details + 32x32 sculpted walls) + Hi-Bit Campfire + Portals + Chests +
 * Odinfall-grade Wrecked Cars, Pillars, Statues, Biome Props, Pickups, Casings & Blast Craters.
 */
export function registerFallbackWorld(b: FallbackAtlasBuilder): void {
  // 1. ALL 16 BIOME HI-BIT TILESETS
  for (const theme of BIOME_THEMES) {
    // 64x64 Hi-Bit (32x32 logical) cohesive 2x2 floor slabs
    b.addSpriteHiBit(`sprFloor${theme.code}`, 32, 32, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeFloor64(ctx, x, y, w, h, f, theme, false),
    );
    // 64x64 Hi-Bit (32x32 logical) Alt-B showcase slabs (automatically sampled ~14% by FloorBuffer!)
    b.addSpriteHiBit(`sprFloor${theme.code}B`, 32, 32, 0, 0, 2, (ctx, x, y, w, h, f) =>
      drawBiomeFloor64(ctx, x, y, w, h, f, theme, true),
    );
    // 24x24 Hi-Bit (12x12 logical) floor micro-details (automatically sampled by FloorBuffer!)
    b.addSpriteHiBit(`sprDetail${theme.code}`, 12, 12, 6, 6, 6, (ctx, x, y, w, h, f) =>
      drawBiomeDetail24(ctx, x, y, w, h, f, theme),
    );
    b.addSpriteHiBit(`sprFloor${theme.code}Explo`, 16, 16, 0, 0, 3, (ctx, x, y, w, h, f) =>
      drawBiomeFloorExplo32(ctx, x, y, w, h, f, theme),
    );
    b.addSpriteHiBit(`sprWall${theme.code}Top`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallTop32(ctx, x, y, w, h, f, theme),
    );
    b.addSpriteHiBit(`sprWall${theme.code}Bot`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallBot32(ctx, x, y, w, h, f, theme),
    );
    b.addSpriteHiBit(`sprWall${theme.code}Out`, 18, 18, 1, 1, 1, (ctx, x, y, w, h) => {
      const buf = new PxCanvas(w, h);
      buf.rect(0, 0, w, h, theme.wallOut);
      buf.rect(2, 2, w - 4, h - 4, theme.wallBotDark);
      buf.flush(ctx, x, y);
    });
    b.addAlias(`sprWall${theme.code}Trans`, `sprWall${theme.code}Bot`);
  }

  // 2. HI-BIT ANIMATED CAMPFIRE & CAMPFIRE OFF (48x48 -> logical 24x24)
  b.addSpriteHiBit('sprCampfire', 24, 24, 12, 14, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const stoneRamp = makeRamp('#7a707d', '#140f17');
    const woodRamp = makeRamp('#6e4226', '#1c0f0a');
    const emberRamp = makeRamp('#ff5514', '#401106');

    // Dark ash pit bed
    buf.organicBlob(24, 34, 17, 8, 11, 0.16, makeRamp('#261d1c', '#0e0a0c'));
    // Back ring stones
    buf.organicBlob(12, 28, 4.5, 3.2, 2, 0.22, stoneRamp);
    buf.organicBlob(36, 28, 4.5, 3.2, 3, 0.22, stoneRamp);
    // Crossed gnarled firelogs
    buf.shadedCapsule(11, 35, 35, 29, 3.2, woodRamp);
    buf.shadedCapsule(13, 29, 36, 36, 3.0, woodRamp);
    // Glowing molten coal bed in center
    buf.organicBlob(24, 33, 9.5, 4.2, 7 + f, 0.22, emberRamp);
    buf.organicBlob(24, 32, 6, 2.5, 19 + f, 0.2, makeRamp('#ffc83b', '#8c2808'));
    // Front ring stones (warm fire-lit top rim!)
    const frontStones: Array<[number, number, number]> = [
      [9, 34, 4.6], [17, 38, 4.8], [26, 39, 5.0], [35, 36, 4.6], [40, 32, 3.8],
    ];
    for (let i = 0; i < frontStones.length; i++) {
      const [sx, sy, sr] = frontStones[i]!;
      buf.organicBlob(sx, sy, sr, sr * 0.68, 30 + i, 0.2, stoneRamp);
      buf.line(sx - 2, sy - 2, sx + 2, sy - 2, '#d69c65', 1);
    }

    // Sinuous multi-layered animated pixel flames
    const sway = f === 1 ? -3 : f === 3 ? 3 : 0;
    const stretch = (f & 1) === 0 ? 2 : 0;
    // Outer deep crimson-orange flame silhouette
    buf.poly([
      [14, 32], [11 + sway * 0.4, 22], [16 + sway * 0.6, 15],
      [22 + sway, 4 - stretch], [28 + sway * 0.8, 12],
      [34 + sway * 0.4, 17], [36, 26], [33, 33],
    ], '#c92616');
    // Vibrant orange body + side flame tongues
    buf.poly([
      [16, 32], [14 + sway * 0.4, 22], [23 + sway, 7 - stretch],
      [31 + sway * 0.5, 18], [32, 31],
    ], '#ff6d1c');
    buf.poly([[14, 24], [10 - sway * 0.4, 16], [17, 19]], '#ff7c24');
    buf.poly([[33, 25], [38 + sway * 0.4, 16], [30, 19]], '#ff7c24');
    // Golden-yellow radiant inner flame
    buf.poly([
      [19, 31], [18 + sway * 0.3, 22], [24 + sway * 0.7, 12 - stretch],
      [29 + sway * 0.3, 22], [28, 31],
    ], '#ffd53d');
    // White-hot core heart
    buf.ellipse(24 + sway * 0.25, 26, 3.5, 5.5, '#fff8cc');
    buf.ellipse(24, 27, 1.8, 3, '#ffffff');
    buf.outline('#120c14', '#3d1712');
    // Floating golden ember sparks above flame
    buf.rect(14 + ((f * 7) % 18), 3 + ((f * 3) % 6), 2, 2, '#ffe866');
    buf.rect(31 - ((f * 5) % 14), 6 + ((f * 4) % 7), 2, 1, '#ff8e33');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprCampfireOff', 24, 24, 12, 14, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const stoneRamp = makeRamp('#5e5866', '#120e16');
    const charWood = makeRamp('#332826', '#100b0c');
    buf.organicBlob(24, 34, 17, 8, 11, 0.16, makeRamp('#1c171a', '#0c090d'));
    buf.shadedCapsule(12, 34, 34, 29, 3, charWood);
    buf.shadedCapsule(14, 29, 35, 35, 2.8, charWood);
    for (const [sx, sy, sr] of [[9, 34, 4.5], [17, 38, 4.8], [26, 39, 5], [35, 36, 4.5]]) {
      buf.organicBlob(sx!, sy!, sr!, sr! * 0.68, sx!, 0.2, stoneRamp);
    }
    buf.rect(21, 32, 3, 2, '#8a2b19');
    buf.set(22, 32, '#e65825');
    buf.outline('#100b14');
    buf.flush(ctx, x, y);
  });

  // 3. HI-BIT SWIRLING GALAXY VORTEX PORTALS (64x64 -> logical 32x32)
  const drawSwirlPortal = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    rim: string,
    outer: string,
    mid: string,
    armOuter: string,
    armInner: string,
    coreRing: string,
  ): void => {
    const buf = new PxCanvas(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const pulse = (f & 1) === 0 ? 1 : -1;
    buf.ellipse(cx, cy, 28 + pulse, 27 + pulse, rim);
    buf.ellipse(cx, cy, 24, 23, outer);
    buf.ellipse(cx, cy, 18, 17, mid);

    const baseAng = (f / 6) * Math.PI * 2;
    for (let arm = 0; arm < 5; arm++) {
      for (let step = 3; step <= 23; step++) {
        const ang = baseAng + (arm * Math.PI * 2) / 5 + step * 0.17;
        const px = cx + Math.cos(ang) * step;
        const py = cy + Math.sin(ang) * step * 0.94;
        const sz = step > 14 ? 3 : 2;
        buf.rect(px - 1, py - 1, sz, sz, step < 11 ? armInner : armOuter);
      }
    }
    buf.ellipse(cx, cy, 10, 10, coreRing);
    buf.ellipse(cx, cy, 6 - (f & 1), 6 - (f & 1), '#ffffff');
    // Orbiting energy sparkles
    for (let s = 0; s < 6; s++) {
      const a = baseAng * 1.5 + s * 1.05;
      buf.rect(cx + Math.cos(a) * 26, cy + Math.sin(a) * 24, 2, 2, armInner);
    }
    buf.flush(ctx, x, y);
  };

  b.addSpriteHiBit('sprPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal(ctx, x, y, w, h, f, '#200836', '#56158c', '#9936e6', '#d67aff', '#fae0ff', '#e8a8ff'),
  );
  b.addAlias('sprPortalClear', 'sprPortal');
  b.addSpriteHiBit('sprProtoPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal(ctx, x, y, w, h, f, '#082618', '#11693d', '#24bd68', '#73ffa6', '#e0ffec', '#a6ffc8'),
  );
  b.addSpriteHiBit('sprPopoPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal(ctx, x, y, w, h, f, '#081638', '#144199', '#2b82ed', '#70d6ff', '#e0f9ff', '#a8eeff'),
  );

  b.addSpriteHiBit('sprPortalIndicator', 12, 12, 6, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = 7 + (f & 1);
    buf.shadedEllipse(12, 12, r, r, makeRamp('#a83ef0', '#180726'));
    buf.ellipse(12, 12, 4, 4, f === 0 ? '#f7d6ff' : '#ffffff');
    buf.outline('#160624');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprIDPDPortalStart', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = 6 + f * 4;
    buf.ellipse(24, 24, r + 4, r + 4, '#10244d');
    buf.ellipse(24, 24, r, r, '#2d7ef0');
    buf.ellipse(24, 24, Math.max(3, r - 6), Math.max(3, r - 6), '#a8f4ff');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprVanPortalStart', 32, 32, 16, 16, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = 12 + f * 4;
    buf.ellipse(32, 32, r + 5, r + 4, '#0c1a40');
    buf.ellipse(32, 32, r + 1, r, '#338cff');
    buf.ellipse(32, 32, Math.max(5, r - 6), Math.max(4, r - 6), '#d1faff');
    buf.flush(ctx, x, y);
  });

  // 4. HI-BIT PICKUPS (FACETED GLOWING RADS, AMMO CRATE, MEDKIT, ROGUE CELL, CASINGS)
  b.addSpriteHiBit('sprRad', 10, 10, 5, 5, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const rad = makeRamp('#3be358', '#082b10');
    const shift = f % 2;
    buf.poly([[10, 2], [17, 8], [14, 17], [6, 17], [3, 8]], rad);
    buf.poly([[10, 4], [14, 9], [10, 14], [6, 9]], f % 2 === 0 ? '#7aff88' : '#b8ffc0');
    buf.rect(8 + shift, 6, 2, 2, '#ffffff');
    buf.outline('#07260d', '#145922');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprRadBig', 14, 14, 7, 7, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const rad = makeRamp('#33d951', '#07240d');
    buf.poly([[14, 2], [25, 10], [21, 24], [7, 24], [3, 10]], rad);
    buf.poly([[14, 5], [21, 12], [14, 21], [7, 12]], f % 2 === 0 ? '#80ff8c' : '#c4ffc9');
    buf.poly([[14, 8], [17, 12], [14, 16], [11, 12]], '#ffffff');
    buf.rect(9 + (f & 1), 8, 2, 3, '#ffffff');
    buf.outline('#061f0b', '#176627');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprBigRad', 'sprRadBig');

  b.addSpriteHiBit('sprAmmo', 12, 10, 6, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const brass = makeRamp('#d49a2a', '#241506');
    buf.bevelBox(3, 3, 18, 14, brass, true);
    buf.rect(5, 8, 14, 2, brass.dark2);
    // Bullet icon stripe on front
    buf.rect(10, 5, 4, 9, '#fff2ad');
    buf.rect(11, 4, 2, 2, '#ffffff');
    if (f === 1) buf.rect(6, 5, 3, 2, '#ffffff');
    buf.outline('#140d09');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprHP', 12, 10, 6, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const white = makeRamp('#e6e2ed', '#221c2e');
    buf.bevelBox(3, 3, 18, 14, white, true);
    buf.rect(10, 5, 4, 10, '#e62238');
    buf.rect(7, 8, 10, 4, '#e62238');
    buf.rect(10, 6, 2, 2, f === 1 ? '#ffffff' : '#ff8a96');
    buf.outline('#16101c');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprMedkit', 'sprHP');

  b.addSpriteHiBit('sprRogueAmmo', 10, 12, 5, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const metal = makeRamp('#3b6bd1', '#0d1938');
    buf.bevelBox(4, 2, 12, 20, metal, true);
    buf.rect(6, 6, 8, 11, f === 0 ? '#4fc8ff' : '#9cf5ff');
    buf.rect(7, 7, 2, 9, '#ffffff');
    buf.rect(5, 11, 10, 2, metal.dark2);
    buf.outline('#0c1324');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprBulletShell', 4, 3, 2, 1, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(1, 1, 6, 4, '#d9a42e');
    buf.rect(2, 1, 4, 1, '#fff299');
    buf.rect(5, 2, 2, 2, '#8c5e14');
    buf.outline('#140e0a');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprShotShell', 5, 3, 2, 1, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(1, 1, 5, 4, '#de2c26');
    buf.rect(2, 1, 3, 1, '#ff7870');
    buf.rect(6, 1, 3, 4, '#f2c846');
    buf.rect(6, 1, 2, 1, '#fff5a6');
    buf.outline('#140e0a');
    buf.flush(ctx, x, y);
  });

  // 5. HI-BIT BEVELED 3D CHESTS (36x32 & 48x36)
  const drawCrateChestHi = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    bodyHex: string,
    trimHex: string,
    open: boolean,
    strapHex = '#3c3947',
    lockHex = '#ffe878',
    extraGlow?: string,
  ): void => {
    const buf = new PxCanvas(w, h);
    const body = makeRamp(bodyHex, INK);
    const trim = makeRamp(trimHex, INK);
    const strap = makeRamp(strapHex, INK);
    const lock = makeRamp(lockHex, INK);

    if (open) {
      // Hinged open lid tilted back + shadowed hollow chest interior
      buf.bevelBox(3, 2, w - 6, 10, makeRamp(body.dark, INK), true);
      buf.rect(5, 4, w - 10, 2, trim.dark);
      buf.bevelBox(3, 11, w - 6, h - 13, body, false);
      buf.rect(7, 13, w - 14, 9, '#0d0912');
      buf.rect(8, 14, w - 16, 2, '#21182b');
      buf.rect(8, 11, 4, h - 13, strap.dark);
      buf.rect(w - 12, 11, 4, h - 13, strap.dark);
      buf.bevelBox(Math.floor(w / 2) - 3, 19, 6, 5, trim, false);
    } else {
      // Heavy arched-lid iron-banded supply chest with specular sheen
      buf.bevelBox(3, 4, w - 6, h - 6, body, true);
      // Top lid bevel & seam
      buf.rect(5, 6, w - 10, 5, body.light);
      buf.rect(6, 6, w - 12, 2, body.hi);
      buf.rect(4, Math.floor(h * 0.46), w - 8, 3, body.dark2);
      // Heavy iron straps with rivets
      buf.bevelBox(8, 4, 4, h - 6, strap, false);
      buf.bevelBox(w - 12, 4, 4, h - 6, strap, false);
      buf.set(9, 7, strap.hi);
      buf.set(w - 11, 7, strap.hi);
      buf.set(9, h - 6, strap.hi);
      buf.set(w - 11, h - 6, strap.hi);
      // Metallic trim band & heavy padlock clasp
      buf.rect(4, Math.floor(h * 0.48), w - 8, 3, trim.base);
      buf.rect(5, Math.floor(h * 0.48), w - 10, 1, trim.hi);
      const lx = Math.floor(w / 2) - 4;
      const ly = Math.floor(h * 0.48) - 2;
      buf.bevelBox(lx, ly, 8, 7, lock, true);
      buf.rect(lx + 3, ly + 3, 2, 2, '#1c1208');
      buf.set(lx + 2, ly + 1, '#ffffff');
      if (extraGlow) {
        buf.rect(lx + 3, ly + 2, 2, 3, extraGlow);
      }
    }
    buf.outline('#110c17', body.out);
    buf.flush(ctx, x, y);
  };

  b.addSpriteHiBit('sprWeaponChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#c43238', '#f5c644', false),
  );
  b.addSpriteHiBit('sprWeaponChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#8c2227', '#a8842a', true),
  );
  b.addSpriteHiBit('sprWeaponChestBig', 24, 18, 12, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#d12c36', '#ffe059', false, '#423d4f', '#fff3a1', '#ffffff'),
  );
  b.addSpriteHiBit('sprWeaponChestBigOpen', 24, 18, 12, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#8a1e25', '#b59030', true),
  );
  b.addSpriteHiBit('sprAmmoChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#cf9727', '#fff0a6', false),
  );
  b.addSpriteHiBit('sprAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#876017', '#b59d4a', true),
  );
  b.addSpriteHiBit('sprIDPDChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#2d5ec2', '#8cf0ff', false),
  );
  b.addAlias('sprRogueAmmoChest', 'sprIDPDChest');
  b.addSpriteHiBit('sprRogueAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#1d3d7d', '#529cc4', true),
  );
  b.addSpriteHiBit('sprGoldChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#edb92e', '#fff9c4', false, '#ad7818', '#ff3d61', '#ffffff'),
  );
  b.addSpriteHiBit('sprGoldChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#b8881e', '#d9b54a', true, '#7d5611', '#bf2640'),
  );
  b.addSpriteHiBit('sprCursedChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#5d228a', '#ff5cd9', false, '#1f1429', '#ff80ed', '#ffffff'),
  );
  b.addSpriteHiBit('sprCursedChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#3d1659', '#a8388d', true, '#190f21', '#a8388d'),
  );
  b.addSpriteHiBit('sprHealthChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const white = makeRamp('#ebe7f2', '#201a2b');
    buf.bevelBox(3, 4, w - 6, h - 6, white, true);
    buf.rect(7, 4, 3, h - 6, '#5c6678');
    buf.rect(w - 10, 4, 3, h - 6, '#5c6678');
    buf.rect(16, 10, 4, 12, '#e62438');
    buf.rect(12, 14, 12, 4, '#e62438');
    buf.rect(16, 11, 2, 3, '#ff8f9b');
    buf.outline('#140f1c');
    buf.flush(ctx, x, y);
  });
  b.addSpriteHiBit('sprHealthChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#b5b0bf', '#e62438', true),
  );
  b.addSpriteHiBit('sprProtoChest', 20, 18, 10, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#4f5c73', '#dbb448', false, '#242b38', '#4df585', '#ffffff'),
  );
  b.addSpriteHiBit('sprProtoChestOpen', 20, 18, 10, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChestHi(ctx, x, y, w, h, '#38404f', '#997a2d', true, '#1a2029', '#2ea855'),
  );

  // HI-BIT PRESSURIZED GLOWING RAD CANISTER (36x40 -> logical 18x20)
  const drawRadCanisterHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'hurt' | 'dead'): void => {
    const buf = new PxCanvas(w, h);
    const steel = makeRamp(state === 'hurt' ? '#ffffff' : '#6b7787', '#110d17');
    const glow = makeRamp(state === 'hurt' ? '#ffffff' : '#35d953', '#0a3314');
    if (state === 'dead') {
      buf.organicBlob(18, 30, 13, 6, 7, 0.22, glow);
      buf.organicBlob(18, 30, 8, 3.5, 11, 0.18, makeRamp('#7aff8c', '#186628'));
      buf.bevelBox(7, 22, 22, 11, makeRamp('#4e5866', '#100d14'), true);
      buf.poly([[11, 22], [14, 15], [17, 22]], '#96e6ad');
      buf.poly([[21, 22], [24, 17], [26, 22]], '#96e6ad');
      buf.outline('#110d17');
      buf.flush(ctx, x, y);
      return;
    }
    // Pressurized glass cylinder body
    buf.bevelBox(9, 10, 18, 21, glow, false);
    if (state !== 'hurt') {
      buf.rect(12, 11, 10, 19, '#5eff72');
      buf.rect(11, 11, 3, 18, '#d4ffd9');
      buf.rect(12, 13, 1, 14, '#ffffff');
      // Rising radioactive bubbles
      buf.ellipse(17, 18 - (f & 1) * 3, 2, 2, '#ffffff');
      buf.ellipse(22, 23 + (f & 1) * 2, 1.5, 1.5, '#d9ffde');
      // Center steel containment rib
      buf.bevelBox(8, 18, 20, 4, steel, false);
    }
    // Top & bottom bolted heavy steel endcaps + pressure valve
    buf.bevelBox(7, 4, 22, 7, steel, true);
    buf.bevelBox(14, 1, 8, 4, steel, false);
    buf.bevelBox(7, 29, 22, 8, steel, true);
    buf.outline('#100c17');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprRadChest', 18, 20, 9, 10, 2, (ctx, x, y, w, h, f) => drawRadCanisterHi(ctx, x, y, w, h, f, 'idle'));
  b.addSpriteHiBit('sprRadChestHurt', 18, 20, 9, 10, 1, (ctx, x, y, w, h) => drawRadCanisterHi(ctx, x, y, w, h, 0, 'hurt'));
  b.addSpriteHiBit('sprRadChestDead', 18, 20, 9, 10, 1, (ctx, x, y, w, h) => drawRadCanisterHi(ctx, x, y, w, h, 0, 'dead'));

  // 6. HI-BIT WRECKED CARS (ODINFALL_4 STYLE! 56x36 -> logical 28x18)
  const drawCarHi = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    bodyHex: string,
    glassHex: string,
    mode: 'idle' | 'hurt' | 'dead' | 'frozen' | 'venus' | 'venusFixed',
    f = 0,
  ): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'dead') {
      // Charred twisted car chassis wreck with jagged blown hood & glowing ember
      buf.bevelBox(5, 10, 46, 18, makeRamp('#332c2f', '#0d090f'), true);
      buf.rect(10, 13, 30, 11, '#141016');
      buf.organicBlob(20, 18, 7, 4, 5, 0.25, makeRamp('#5e372c', '#1c0f0c'));
      buf.rect(36, 14, 4, 3, '#ff6a26');
      buf.set(37, 15, '#ffe066');
      buf.outline('#0d090e');
      buf.flush(ctx, x, y);
      return;
    }
    const isHurt = mode === 'hurt';
    const body = makeRamp(isHurt ? '#ffffff' : bodyHex, '#120d14');
    const glass = makeRamp(isHurt ? '#ffffff' : glassHex, '#120d14');
    const tire = makeRamp('#2b2730', '#0c090e');

    // 4 treaded rubber wheels protruding from wheel arches
    for (const [wx, wy] of [[9, 3], [37, 3], [9, 28], [37, 28]]) {
      buf.bevelBox(wx!, wy!, 10, 5, tire, true);
    }
    // Sculpted tapered muscle-car chassis (curved front fenders + trunk)
    buf.poly([
      [4, 9], [10, 6], [46, 6], [52, 10],
      [52, 26], [46, 30], [10, 30], [4, 27],
    ], body);
    // Sunlit top hood ridge & shaded lower sill
    buf.rect(8, 8, 40, 4, body.light);
    buf.rect(10, 8, 36, 2, body.hi);
    buf.rect(8, 25, 40, 4, body.dark2);
    // Hood intake louvers & racing crease
    if (!isHurt) {
      buf.rect(36, 12, 11, 2, body.dark);
      buf.rect(36, 22, 11, 2, body.dark);
      buf.rect(38, 15, 8, 6, body.light);
      buf.rect(39, 16, 6, 1, body.hi);
    }
    // Angled panoramic front & rear windshields with crisp diagonal glass reflection
    buf.poly([[14, 9], [36, 9], [38, 12], [38, 24], [36, 27], [14, 27], [12, 24], [12, 12]], glass);
    if (!isHurt) {
      buf.line(31, 10, 36, 15, '#ffffff', 2);
      buf.line(15, 11, 19, 15, glass.hi, 1);
    }
    // Roof panel with subtle dent/highlight
    buf.bevelBox(18, 11, 14, 14, body, true);
    // Chrome bumpers, headlights & ruby taillights
    buf.rect(50, 10, 3, 5, mode === 'venusFixed' ? '#ffffff' : '#ffe985');
    buf.rect(50, 21, 3, 5, mode === 'venusFixed' ? '#ffffff' : '#ffe985');
    buf.rect(3, 10, 3, 5, '#e03131');
    buf.rect(3, 21, 3, 5, '#e03131');
    // Rust patches (scrapyard) or drifted snow patches (frozen) or golden gleam (venus)
    if (mode === 'idle') {
      buf.ditherRect(8, 19, 6, 6, body.base, '#692a17', 0.6);
      buf.ditherRect(40, 10, 6, 5, body.light, '#78341d', 0.5);
    } else if (mode === 'frozen') {
      const snow = makeRamp('#e6f5ff', '#7aa2c4');
      buf.organicBlob(12, 13, 6, 4.5, 3, 0.25, snow);
      buf.organicBlob(25, 18, 8, 6, 7, 0.2, snow);
      buf.organicBlob(43, 14, 5, 4, 11, 0.2, snow);
    } else if (mode === 'venusFixed') {
      const sx = f === 0 ? 24 : 42;
      const sy = f === 0 ? 12 : 20;
      buf.rect(sx - 3, sy, 7, 1, '#ffffff');
      buf.rect(sx, sy - 3, 1, 7, '#ffffff');
    }

    buf.outline('#110b14', body.out);
    buf.flush(ctx, x, y);
  };

  b.addSpriteHiBit('sprCarIdle', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCarHi(ctx, x, y, w, h, '#ba5534', '#72b6d9', 'idle'),
  );
  b.addAlias('sprCar', 'sprCarIdle');
  b.addSpriteHiBit('sprCarHurt', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCarHi(ctx, x, y, w, h, '#ffffff', '#ffffff', 'hurt'),
  );
  b.addSpriteHiBit('sprCarDead', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCarHi(ctx, x, y, w, h, '#332c2b', '#222222', 'dead'),
  );
  b.addSpriteHiBit('sprFrozenCar', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCarHi(ctx, x, y, w, h, '#5a83a8', '#cceeff', 'frozen'),
  );
  b.addSpriteHiBit('sprVenusCar', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCarHi(ctx, x, y, w, h, '#dba42c', '#332042', 'venus'),
  );
  b.addSpriteHiBit('sprVenusCarFixed', 28, 18, 14, 9, 2, (ctx, x, y, w, h, f) =>
    drawCarHi(ctx, x, y, w, h, '#f7c936', '#4f2c6b', 'venusFixed', f),
  );

  // 7. HI-BIT BARRELS, CACTI, BONES, CARVED PILLARS, PROTO STATUE, GENERATORS
  const drawBarrelHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, bodyHex: string, bandHex: string, toxic = false, barnacle = false): void => {
    const buf = new PxCanvas(w, h);
    const body = makeRamp(bodyHex, '#120b14');
    const band = makeRamp(bandHex, '#120b14');
    buf.bevelBox(4, 3, 20, 26, body, true);
    // Cylindrical vertical shading gradient
    buf.rect(6, 5, 4, 22, body.light);
    buf.rect(7, 5, 2, 22, body.hi);
    buf.rect(19, 5, 4, 22, body.dark2);
    // Top rim ellipse
    buf.shadedEllipse(14, 5, 9, 2.5, body);
    // Central hazard band & steel rolling ribs
    buf.rect(4, 12, 20, 8, band.base);
    buf.rect(6, 12, 4, 8, band.hi);
    buf.rect(19, 12, 4, 8, band.dark);
    buf.rect(4, 10, 20, 2, body.dark2);
    buf.rect(4, 20, 20, 2, body.dark2);
    if (toxic) {
      // Glowing green toxic sludge oozing over rim
      buf.poly([[15, 4], [21, 4], [20, 12], [17, 15], [16, 10]], '#88ff4d');
      buf.rect(17, 5, 2, 5, '#e8ffd1');
    }
    if (barnacle) {
      buf.organicBlob(19, 8, 3, 2.5, 5, 0.25, makeRamp('#f0786c', '#3d1514'));
      buf.organicBlob(8, 22, 2.5, 2, 9, 0.2, makeRamp('#d4dec7', '#263830'));
    }
    buf.outline('#120c14');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) => drawBarrelHi(ctx, x, y, w, h, '#c4352d', '#f5c742'));
  b.addSpriteHiBit('sprToxicBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) => drawBarrelHi(ctx, x, y, w, h, '#2c7d36', '#c4ff4d', true));
  b.addSpriteHiBit('sprOasisBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) => drawBarrelHi(ctx, x, y, w, h, '#2f787a', '#b39150', false, true));

  // Sculpted Hi-Bit Cacti (32x36 -> logical 16x18)
  const drawCactusHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, variant: number): void => {
    const buf = new PxCanvas(w, h);
    const green = makeRamp('#3b9947', '#0e2912');
    const flower = makeRamp('#ff5ca0', '#4d0e2b');
    if (variant === 2) {
      // Barrel cactus with crown blossom
      buf.shadedEllipse(16, 22, 9, 10, green);
      for (let rx = 10; rx <= 22; rx += 4) {
        buf.line(rx, 14, rx, 30, green.dark2, 1);
        buf.line(rx + 1, 14, rx + 1, 30, green.light, 1);
      }
      buf.shadedEllipse(16, 11, 4, 2.5, flower);
      buf.rect(15, 10, 2, 2, '#ffe866');
    } else {
      // Saguaro ribbed desert cactus with arms & spines
      buf.shadedCapsule(16, 8, 16, 32, 4.2, green);
      buf.line(15, 9, 15, 31, green.hi, 1);
      buf.line(18, 9, 18, 31, green.dark2, 1);
      // Left arm
      buf.shadedCapsule(7, 13 + variant * 3, 7, 21 + variant * 2, 3, green);
      buf.shadedCapsule(7, 21 + variant * 2, 15, 22 + variant * 2, 2.8, green);
      // Right arm
      buf.shadedCapsule(25, 16 - variant * 2, 25, 24 - variant, 2.8, green);
      buf.shadedCapsule(17, 24 - variant, 25, 24 - variant, 2.6, green);
      if (variant === 0) {
        buf.shadedEllipse(16, 5, 3.2, 2.2, flower);
        buf.set(16, 4, '#fff280');
      }
    }
    buf.outline('#0f2112');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprCactus', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactusHi(ctx, x, y, w, h, 0));
  b.addSpriteHiBit('sprCactus2', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactusHi(ctx, x, y, w, h, 1));
  b.addSpriteHiBit('sprCactus3', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactusHi(ctx, x, y, w, h, 2));

  b.addSpriteHiBit('sprBonePileIdle', 16, 14, 8, 7, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const bone = makeRamp('#dfd4be', '#2b221a');
    buf.shadedCapsule(6, 22, 26, 17, 2.4, bone);
    buf.shadedCapsule(7, 16, 25, 23, 2.2, bone);
    buf.shadedEllipse(16, 12, 6, 5.5, bone);
    buf.bevelBox(12, 16, 8, 4, bone, false);
    // Hollow eye sockets & nasal cavity
    buf.ellipse(13, 12, 1.8, 1.8, '#1a1312');
    buf.ellipse(19, 12, 1.8, 1.8, '#1a1312');
    buf.rect(15, 14, 2, 2, '#1a1312');
    buf.rect(14, 18, 1, 2, '#1a1312');
    buf.rect(17, 18, 1, 2, '#1a1312');
    buf.outline('#1c1410');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprBones', 'sprBonePileIdle');

  // HI-BIT FLUTED CARVED COLUMNS & PALACE PILLARS (36x56 -> logical 18x28)
  const drawPillarHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, palace: boolean): void => {
    const buf = new PxCanvas(w, h);
    const stone = makeRamp(palace ? '#2b365e' : '#736b82', '#0d0914');
    const gold = makeRamp('#deb448', '#261a08');
    // Stepped carved stone plinth
    buf.bevelBox(4, 42, 28, 10, stone, true);
    if (palace) buf.rect(6, 43, 24, 2, gold.light);
    // Fluted cylindrical shaft
    buf.bevelBox(7, 14, 22, 29, stone, false);
    buf.rect(9, 16, 4, 25, stone.light);
    buf.rect(10, 16, 2, 25, stone.hi);
    buf.rect(14, 16, 2, 25, stone.dark2);
    buf.rect(20, 16, 2, 25, stone.dark2);
    buf.rect(24, 16, 3, 25, stone.dark);
    if (palace) {
      // Glowing recessed emerald palace conduit
      buf.rect(15, 18, 6, 21, '#0e1629');
      buf.rect(16, 19, 4, 19, '#3ee66a');
      buf.rect(17, 20, 2, 17, '#c7ffd4');
      buf.rect(17, 22, 1, 6, '#ffffff');
    } else {
      buf.crack(14, 28, 9, 0.35, 19, stone.out, stone.hi);
    }
    // Overhanging beveled capital + frieze
    buf.bevelBox(3, 3, 30, 13, stone, true);
    if (palace) {
      buf.rect(5, 9, 26, 3, gold.base);
      buf.rect(6, 9, 12, 1, gold.hi);
    }
    buf.rect(7, 15, 22, 3, stone.dark2);
    buf.outline('#0c0814');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprPillar', 18, 28, 9, 18, 1, (ctx, x, y, w, h) => drawPillarHi(ctx, x, y, w, h, false));
  b.addSpriteHiBit('sprPalacePillar', 18, 28, 9, 18, 1, (ctx, x, y, w, h) => drawPillarHi(ctx, x, y, w, h, true));
  b.addAlias('sprNuclearPillar', 'sprPalacePillar');

  // HI-BIT CARVED RUNE MONOLITH PROTO STATUE (48x64 -> logical 24x32)
  const drawProtoStatueHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, charged: boolean): void => {
    const buf = new PxCanvas(w, h);
    const stone = makeRamp('#5a647a', '#101421');
    const pulse = (f & 1) === 0;
    const rune = charged ? (pulse ? '#85ffa8' : '#40ed72') : (pulse ? '#3da370' : '#2d7d56');
    const core = charged ? '#ffffff' : '#a8ffd1';

    // Stepped ancient temple dais
    buf.poly([[4, 58], [8, 46], [40, 46], [44, 58]], stone);
    buf.rect(9, 47, 30, 3, stone.hi);
    // Flanking carved buttress wings
    buf.poly([[7, 46], [10, 22], [15, 22], [15, 46]], makeRamp('#495266', '#101421'));
    buf.poly([[41, 46], [38, 22], [33, 22], [33, 46]], makeRamp('#3b4354', '#101421'));
    // Tall tapered rune obelisk monolith
    buf.poly([[11, 48], [16, 11], [24, 3], [32, 11], [37, 48]], stone);
    buf.poly([[13, 46], [17, 12], [24, 5], [24, 46]], stone.light);
    buf.poly([[24, 5], [31, 12], [35, 46], [24, 46]], stone.dark);
    buf.crack(14, 31, 7, 0.35, 5, stone.out, stone.hi);
    // Deep glowing carved emerald rune channels
    buf.poly([[24, 12], [30, 19], [24, 26], [18, 19]], '#141a26');
    buf.poly([[24, 14], [28, 19], [24, 24], [20, 19]], rune);
    buf.rect(23, 18, 2, 2, core);
    buf.rect(22, 27, 4, 18, '#141a26');
    buf.rect(23, 28, 2, 16, rune);
    buf.line(16, 31, 22, 34, rune, 2);
    buf.line(32, 31, 26, 34, rune, 2);
    buf.line(18, 39, 22, 41, rune, 2);
    buf.line(30, 39, 26, 41, rune, 2);
    if (charged) {
      buf.rect(23, 29, 2, 12, '#d4ffe0');
      buf.rect(11 + (f * 3) % 6, 10 + (f & 1) * 3, 2, 2, '#9effbc');
      buf.rect(35 - (f * 3) % 6, 15 - (f & 1) * 3, 2, 2, '#ffffff');
    }
    buf.outline('#0e111c');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprProtoStatueIdle', 24, 32, 12, 20, 4, (ctx, x, y, w, h, f) => drawProtoStatueHi(ctx, x, y, w, h, f, false));
  b.addAlias('sprProtoStatue', 'sprProtoStatueIdle');
  b.addSpriteHiBit('sprProtoStatueCharge', 24, 32, 12, 20, 4, (ctx, x, y, w, h, f) => drawProtoStatueHi(ctx, x, y, w, h, f, true));

  // 8. ALL BIOME & SECRET PROPS AT 2x HI-BIT
  b.addSpriteHiBit('sprPizzaEntrance', 24, 24, 12, 12, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const iron = makeRamp('#4f5966', '#10131a');
    buf.shadedEllipse(24, 24, 20, 18, iron);
    if (f === 0) {
      buf.shadedEllipse(24, 24, 16, 14, makeRamp('#3b434d', '#10131a'));
      for (let ry = 16; ry <= 32; ry += 6) buf.rect(13, ry, 22, 3, iron.light);
      buf.rect(17, 22, 4, 4, '#e6843c');
      buf.rect(27, 22, 4, 4, '#e6843c');
    } else {
      buf.ellipse(24, 24, 15, 13, '#170d0a');
      buf.ellipse(24, 25, 11, 9, '#5e2b1b');
      buf.ellipse(24, 26, 7, 5, '#d66e2c');
      buf.ellipse(24, 26, 3, 2, '#ffe085');
    }
    buf.outline('#0f1117');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprIceFlowerIdle', 20, 22, 10, 14, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const stem = makeRamp('#369476', '#0d2b22');
    const ice = makeRamp('#7ad4fa', '#163f66');
    buf.shadedCapsule(20, 22, 20, 38, 2.5, stem);
    buf.shadedEllipse(11, 33, 7, 3.5, stem);
    buf.shadedEllipse(29, 33, 7, 3.5, stem);
    buf.poly([[20, 20], [5, 14], [12, 24]], ice);
    buf.poly([[20, 20], [35, 14], [28, 24]], ice);
    buf.poly([[20, 4], [29, 16], [20, 26], [11, 16]], makeRamp('#a8e8ff', '#1c4f80'));
    buf.shadedEllipse(20, 16, 4.5, 4.5, makeRamp(f % 2 === 0 ? '#ffe873' : '#ffffff', '#6b4d14'));
    buf.outline('#11263b');
    buf.set(9 + f * 5, 7 + (f & 1) * 2, '#ffffff');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprIceFlower', 'sprIceFlowerIdle');

  b.addSpriteHiBit('sprCrownPedIdle', 22, 26, 11, 16, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const stone = makeRamp('#5e687d', '#11141f');
    const gold = makeRamp('#f5c63d', '#402a08');
    buf.poly([[6, 46], [10, 34], [34, 34], [38, 46]], stone);
    buf.bevelBox(10, 20, 24, 16, stone, false);
    buf.rect(16, 25, 12, 6, '#1b202e');
    buf.rect(18, 27, 8, 2, f % 2 === 0 ? '#5ef59b' : '#c7ffe0');
    buf.bevelBox(8, 15, 28, 7, makeRamp('#9e2234', '#26080d'), true);
    buf.rect(10, 17, 24, 2, gold.base);
    const bob = (f & 1) === 0 ? 0 : -2;
    buf.poly([[14, 14 + bob], [12, 6 + bob], [18, 10 + bob], [22, 3 + bob], [26, 10 + bob], [32, 6 + bob], [30, 14 + bob]], gold);
    buf.outline('#0f111c');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprCrownPed', 'sprCrownPedIdle');

  const drawCrystalClusterHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, baseHex: string): void => {
    const buf = new PxCanvas(w, h);
    const cr = makeRamp(baseHex, '#140821');
    const rock = makeRamp('#332045', '#10081a');
    // Angled side crystalline shards
    buf.poly([[6, 36], [4, 21], [11, 18], [14, 36]], makeRamp(cr.dark, cr.out));
    buf.poly([[23, 36], [26, 20], [32, 24], [29, 36]], makeRamp(cr.dark, cr.out));
    // Tall central faceted crystal spire with crisp bright spine
    buf.poly([[11, 36], [14, 8], [18, 3], [23, 9], [25, 36]], cr);
    buf.poly([[13, 35], [15, 9], [18, 4], [18, 35]], cr.light);
    buf.line(18, 4, 18, 34, cr.spec, 2);
    buf.rect(16, 10, 2, 4, '#ffffff');
    // Rocky mineral socket base
    buf.organicBlob(18, 36, 12, 5, 13, 0.25, rock);
    buf.outline('#11061c');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprCrystalProp', 18, 22, 9, 14, 1, (ctx, x, y, w, h) => drawCrystalClusterHi(ctx, x, y, w, h, '#b84ce8'));
  b.addAlias('sprCrystalProp1', 'sprCrystalProp');
  b.addSpriteHiBit('sprCrystalProp2', 16, 20, 8, 13, 1, (ctx, x, y, w, h) => drawCrystalClusterHi(ctx, x, y, w, h, '#d147cf'));
  b.addSpriteHiBit('sprCrystalProp3', 18, 22, 9, 14, 1, (ctx, x, y, w, h) => drawCrystalClusterHi(ctx, x, y, w, h, '#9942de'));
  b.addSpriteHiBit('sprCrystalPropBlue', 18, 22, 9, 14, 1, (ctx, x, y, w, h) => drawCrystalClusterHi(ctx, x, y, w, h, '#3d9ee8'));
  b.addSpriteHiBit('sprCrystalPropGreen', 18, 22, 9, 14, 1, (ctx, x, y, w, h) => drawCrystalClusterHi(ctx, x, y, w, h, '#36cf64'));

  b.addSpriteHiBit('sprStreetLight', 16, 34, 8, 28, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const iron = makeRamp('#415063', '#0e141f');
    buf.bevelBox(10, 52, 12, 10, iron, true);
    buf.bevelBox(13, 14, 6, 40, iron, false);
    buf.bevelBox(6, 5, 20, 12, makeRamp('#2d3947', '#0e141f'), true);
    buf.rect(10, 9, 12, 7, f === 0 ? '#ffe073' : '#fff4b3');
    buf.rect(12, 10, 8, 4, '#ffffff');
    // Drifted snow cap on hood
    buf.organicBlob(16, 5, 9, 3, 7, 0.2, makeRamp('#e8f6ff', '#7ea4c7'));
    buf.outline('#0c121c');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprHydrant', 14, 18, 7, 13, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const red = makeRamp('#d42b38', '#2b090e');
    buf.bevelBox(6, 26, 16, 6, red, true);
    buf.bevelBox(8, 10, 12, 17, red, false);
    buf.bevelBox(4, 14, 5, 6, red, true);
    buf.bevelBox(19, 14, 5, 6, red, true);
    buf.shadedEllipse(14, 9, 6, 4.5, red);
    buf.organicBlob(14, 6, 5, 2.5, 9, 0.2, makeRamp('#edf8ff', '#8eb4d4'));
    buf.outline('#1a080d');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprSodaMachine', 20, 26, 10, 18, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const body = makeRamp('#2d63ab', '#0d1c36');
    buf.bevelBox(4, 5, 32, 42, body, true);
    buf.organicBlob(18, 4, 13, 3, 5, 0.2, makeRamp('#ebf7ff', '#8fb5d4'));
    buf.bevelBox(8, 10, 16, 20, makeRamp(f === 0 ? '#78e6ff' : '#aef5ff', '#163854'), false);
    buf.rect(10, 12, 12, 6, '#ff4757');
    buf.rect(10, 20, 12, 6, '#ffe047');
    buf.rect(11, 13, 4, 2, '#ffffff');
    buf.rect(26, 12, 6, 12, '#182436');
    buf.rect(28, 14, 2, 2, '#ff4757');
    buf.rect(28, 18, 2, 2, '#59ff73');
    buf.bevelBox(8, 33, 24, 9, makeRamp('#182130', '#0a0f17'), false);
    buf.outline('#0c1321');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprMoneyPile', 20, 16, 10, 10, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const cash = makeRamp('#3fa350', '#0f2e15');
    const band = makeRamp('#f2e0a2', '#5c4b1e');
    const drawStack = (sx: number, sy: number): void => {
      buf.bevelBox(sx, sy, 18, 10, cash, false);
      buf.rect(sx + 7, sy, 4, 10, band.base);
      buf.rect(sx + 8, sy, 2, 2, '#ffffff');
    };
    drawStack(4, 16);
    drawStack(18, 14);
    drawStack(10, 8);
    buf.shadedEllipse(8, 25, 4, 2.5, makeRamp('#f5c83d', '#4a310a'));
    buf.shadedEllipse(32, 25, 4, 2.5, makeRamp('#f5c83d', '#4a310a'));
    buf.outline('#111f14');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprYVStatue', 22, 30, 11, 20, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const marble = makeRamp('#827a91', '#1a1624');
    const gold = makeRamp('#f2c238', '#422908');
    buf.bevelBox(6, 42, 32, 12, marble, true);
    buf.poly([[22, 5], [38, 41], [6, 41]], gold);
    buf.poly([[22, 6], [22, 40], [8, 40]], gold.light);
    buf.poly([[22, 6], [36, 40], [22, 40]], gold.dark);
    buf.line(22, 7, 11, 38, gold.spec, 1);
    // Cyclops eye & dollar bling chain
    buf.ellipse(22, 25, 7, 3.5, '#1c1208');
    buf.ellipse(22, 25, 5, 2, '#fff9db');
    buf.ellipse(22, 25, 1.8, 1.8, '#140c0a');
    buf.rect(12, 35, 20, 3, '#fff7a8');
    buf.outline('#1a120a');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprMutantTube', 18, 28, 9, 19, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const steel = makeRamp('#4a5b63', '#0c1317');
    const glass = makeRamp('#34d966', '#0a3319');
    buf.bevelBox(6, 12, 24, 30, glass, false);
    buf.rect(9, 13, 4, 28, '#c7ffd8');
    // Silhouetted suspended lab freak inside tank
    const bob = (f & 1) * 2;
    buf.organicBlob(18, 26 + bob, 6, 8, 5, 0.2, makeRamp('#14592c', '#072411'));
    buf.rect(15, 22 + bob, 2, 2, '#d4ff80');
    buf.rect(20, 22 + bob, 2, 2, '#d4ff80');
    buf.ellipse(12, 35 - f * 4, 2, 2, '#ffffff');
    buf.ellipse(24, 20 + (f & 1) * 5, 1.5, 1.5, '#e6ffed');
    buf.bevelBox(4, 4, 28, 10, steel, true);
    buf.bevelBox(4, 40, 28, 11, steel, true);
    buf.outline('#0a1217');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprTube', 'sprMutantTube');

  b.addSpriteHiBit('sprCoral', 18, 18, 9, 12, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const coral = makeRamp('#eb5959', '#380f18');
    buf.shadedCapsule(18, 30, 10, 12, 3.2, coral);
    buf.shadedCapsule(18, 30, 18, 7, 3.5, coral);
    buf.shadedCapsule(18, 30, 27, 13, 3.0, coral);
    buf.shadedCapsule(12, 18, 6, 18, 2.2, coral);
    buf.shadedCapsule(24, 19, 30, 21, 2.2, coral);
    buf.outline('#240a11');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprAnchor', 20, 22, 10, 14, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const iron = makeRamp('#556c78', '#101c24');
    buf.shadedEllipse(20, 8, 5.5, 5.5, iron);
    buf.ellipse(20, 8, 2.5, 2.5, '#00000000');
    buf.bevelBox(9, 13, 22, 5, iron, true);
    buf.bevelBox(17, 12, 6, 24, iron, false);
    buf.shadedCapsule(8, 29, 20, 36, 3.5, iron);
    buf.shadedCapsule(32, 29, 20, 36, 3.5, iron);
    buf.poly([[5, 28], [9, 21], [12, 29]], iron);
    buf.poly([[35, 28], [31, 21], [28, 29]], iron);
    buf.outline('#0d161c');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprPizzaBox', 18, 14, 9, 8, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const card = makeRamp('#d4ad72', '#382614');
    buf.bevelBox(5, 13, 27, 11, makeRamp('#b58d55', '#382614'), false);
    buf.bevelBox(3, 5, 27, 11, card, false);
    buf.rect(11, 7, 11, 6, '#db322b');
    buf.rect(13, 9, 7, 2, '#47b849');
    buf.rect(16, 9, 2, 2, '#ffffff');
    buf.outline('#21150c');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprBigFlowerIdle', 22, 24, 11, 16, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const stem = makeRamp('#338a3b', '#0d2610');
    const petal = makeRamp('#db2c52', '#380917');
    buf.shadedCapsule(22, 24, 22, 42, 4, stem);
    buf.shadedEllipse(11, 36, 8, 4, stem);
    buf.shadedEllipse(33, 36, 8, 4, stem);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.1;
      buf.shadedEllipse(22 + Math.cos(a) * 9, 18 + Math.sin(a) * 6, 7, 5, petal);
    }
    buf.shadedEllipse(22, 18, 7, 5, makeRamp('#ffe047', '#66480d'));
    buf.rect(20 + (f & 1) * 2, 16, 2, 2, '#ffffff');
    buf.outline('#1a0810');
    buf.flush(ctx, x, y);
  });

  b.addSpriteHiBit('sprServer', 18, 28, 9, 19, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const chassis = makeRamp('#2f4063', '#0b1021');
    buf.bevelBox(4, 4, 28, 46, chassis, true);
    for (let bay = 0; bay < 4; bay++) {
      const by = 11 + bay * 9;
      buf.rect(8, by, 20, 6, '#121929');
      buf.rect(10, by + 2, 10, 2, '#3d5480');
      const led = ((bay + f) & 1) === 0;
      buf.rect(22, by + 2, 2, 2, led ? '#73f5ff' : '#2a5a8a');
      buf.rect(25, by + 2, 2, 2, bay === 0 ? '#ff4757' : '#59ff88');
    }
    buf.outline('#0a0f1c');
    buf.flush(ctx, x, y);
  });

  // HI-BIT DEFEATED SIT-ABLE KRUNKED THRONE CORPSE (192x176 -> logical 96x88)
  b.addSpriteHiBit('sprThroneCorpseIdle', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 96;
    const cy = 88;
    const obs = makeRamp('#2b334a', '#0a0d17');
    const gold = makeRamp('#c79f3e', '#2e2009');
    const cushion = makeRamp('#8f2031', '#21060c');
    const spark = (f & 1) === 0;

    // Stepped cracked royal obsidian dais
    buf.bevelBox(cx - 86, cy + 40, 172, 32, makeRamp('#1b2030', '#070910'), true);
    buf.bevelBox(cx - 78, cy + 28, 156, 22, obs, true);
    buf.rect(cx - 72, cy + 52, 144, 4, gold.base);
    // Ruined side reactor coolant cylinders
    buf.bevelBox(cx - 82, cy - 10, 24, 50, obs, true);
    buf.bevelBox(cx + 58, cy - 4, 24, 44, obs, true);
    buf.rect(cx - 76, cy + 8, 12, 28, '#1d6e35');
    buf.rect(cx + 64, cy + 12, 12, 24, '#1d6e35');
    buf.rect(cx - 72, cy - 12, 4, 4, spark ? '#8cffad' : '#3be066');
    // Massive gothic backrest with shattered crown spires
    buf.poly([[cx - 48, cy - 68], [cx + 48, cy - 68], [cx + 58, cy + 32], [cx - 58, cy + 32]], obs);
    buf.poly([[cx - 38, cy - 66], [cx - 34, cy - 82], [cx - 24, cy - 66]], obs);
    buf.poly([[cx + 24, cy - 66], [cx + 34, cy - 78], [cx + 38, cy - 66]], obs);
    buf.poly([[cx - 14, cy - 66], [cx, cy - 84], [cx + 14, cy - 66]], gold);
    // Deep diagonal battle fissures
    buf.crack(cx - 30, cy - 58, 34, 0.9, 7, '#090b12', obs.hi);
    buf.crack(cx + 28, cy - 50, 32, 2.2, 13, '#090b12', '#2fa853');
    // Massive armrests
    buf.bevelBox(cx - 66, cy - 4, 28, 44, makeRamp('#3b4666', '#0a0d17'), true);
    buf.bevelBox(cx + 38, cy - 4, 28, 44, makeRamp('#3b4666', '#0a0d17'), true);
    buf.rect(cx - 62, cy - 2, 20, 4, gold.base);
    buf.rect(cx + 42, cy - 2, 20, 4, gold.base);
    // Inviting central seat alcove & smoldering core ember
    buf.bevelBox(cx - 32, cy - 32, 64, 48, makeRamp('#161b29', '#070910'), true);
    buf.shadedEllipse(cx, cy - 14, 14, 14, makeRamp('#194f28', '#081f0e'));
    buf.ellipse(cx, cy - 14, 6, 6, spark ? '#66ff91' : '#2db854');
    // Plush royal crimson velvet seat ready to sit upon!
    buf.bevelBox(cx - 30, cy + 8, 60, 26, obs, true);
    buf.bevelBox(cx - 24, cy + 12, 48, 16, cushion, true);
    buf.rect(cx - 24, cy + 28, 48, 4, gold.light);
    buf.outline('#080a12');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprThroneCorpse', 'sprThroneCorpseIdle');

  // HI-BIT THRONE GENERATORS (48x56 -> logical 24x28)
  const drawGeneratorHi = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, state: 'idle' | 'hurt' | 'dead'): void => {
    const buf = new PxCanvas(w, h);
    const hurt = state === 'hurt';
    const steel = makeRamp(hurt ? '#ffffff' : '#354266', '#0b0e1a');
    const gold = makeRamp(hurt ? '#ffffff' : '#e3b84b', '#332208');
    if (state === 'dead') {
      buf.bevelBox(6, 24, 36, 24, makeRamp('#2d333d', '#0b0d12'), true);
      buf.rect(12, 28, 24, 12, '#12151c');
      buf.organicBlob(24, 34, 8, 5, 5, 0.25, makeRamp('#1f5e2c', '#0b2410'));
      buf.outline('#0a0c12');
      buf.flush(ctx, x, y);
      return;
    }
    buf.bevelBox(6, 12, 36, 32, steel, true);
    // Glowing emerald nuclear core chamber
    buf.bevelBox(14, 16, 20, 24, makeRamp(hurt ? '#ffffff' : (f % 2 === 0 ? '#3ee660' : '#85ff99'), '#0b2e14'), false);
    if (!hurt) {
      buf.rect(17, 18, 6, 20, '#d6ffdb');
      buf.rect(19, 20, 2, 14, '#ffffff');
      buf.rect(14, 26, 20, 4, steel.dark2);
      // Gilded exterior power coils
      buf.bevelBox(2, 18, 6, 20, gold, true);
      buf.bevelBox(40, 18, 6, 20, gold, true);
    }
    buf.bevelBox(8, 4, 32, 10, steel, true);
    buf.rect(10, 6, 28, 4, gold.base);
    buf.bevelBox(4, 42, 40, 10, steel, true);
    buf.outline('#0a0d17');
    buf.flush(ctx, x, y);
  };
  b.addSpriteHiBit('sprBigGenerator', 24, 28, 12, 14, 2, (ctx, x, y, w, h, f) => drawGeneratorHi(ctx, x, y, w, h, f, 'idle'));
  b.addSpriteHiBit('sprBigGeneratorHurt', 24, 28, 12, 14, 1, (ctx, x, y, w, h) => drawGeneratorHi(ctx, x, y, w, h, 0, 'hurt'));
  b.addSpriteHiBit('sprBigGeneratorDead', 24, 28, 12, 14, 1, (ctx, x, y, w, h) => drawGeneratorHi(ctx, x, y, w, h, 0, 'dead'));
  b.addAlias('sprThroneGenerator', 'sprBigGenerator');

  // HI-BIT PLANT SNARE & TANGLE SEED
  b.addSpriteHiBit('sprPlantSnare', 20, 20, 10, 10, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const vine = makeRamp('#2d9139', '#0b260e');
    const thorn = makeRamp('#e63244', '#380911');
    buf.organicBlob(20, 20, 15, 11, 5 + f, 0.28, vine);
    buf.ellipse(20, 20, 8, 6, '#143317');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.2;
      buf.shadedCapsule(20 + Math.cos(a) * 7, 20 + Math.sin(a) * 5, 20 + Math.cos(a) * 16, 20 + Math.sin(a) * 12, 2, vine);
    }
    buf.shadedEllipse(20, 9, 4.5, 3, thorn);
    buf.shadedEllipse(20, 31, 4.5, 3, thorn);
    buf.rect(19, 8, 2, 2, '#ffe866');
    buf.rect(19, 30, 2, 2, '#ffe866');
    buf.outline('#0c210e');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprTangle', 'sprPlantSnare');
  b.addSpriteHiBit('sprTangleSeed', 10, 10, 5, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.shadedEllipse(10, 10, 6, 6, makeRamp('#3ec44e', '#0d2e11'));
    buf.rect(8 + (f & 1) * 2, 7, 2, 2, '#e0ffad');
    buf.outline('#0c240f');
    buf.flush(ctx, x, y);
  });

  // HI-BIT SHATTERED ORGANIC BLAST SCORCH CRATERS (48x40 & 28x24)
  b.addSpriteHiBit('sprScorch', 24, 20, 12, 10, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const seed = 91 + f * 17;
    buf.organicBlob(24, 20, 21, 16, seed, 0.28, makeRamp('#292126', '#0d090d'));
    buf.organicBlob(24, 20, 15, 11, seed + 3, 0.30, makeRamp('#171116', '#080508'));
    buf.organicBlob(24, 20, 8, 6, seed + 7, 0.25, makeRamp('#09060a', '#050305'));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + f * 0.4;
      buf.crack(24 + Math.cos(a) * 10, 20 + Math.sin(a) * 8, 10, a, seed + i * 5, '#0e0a0f', '#4d4147');
    }
    buf.flush(ctx, x, y);
  });
  b.addSpriteHiBit('sprScorchmark', 14, 12, 7, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const seed = 43 + f * 13;
    buf.organicBlob(14, 12, 11, 8, seed, 0.28, makeRamp('#241c21', '#0c080c'));
    buf.organicBlob(14, 12, 6, 4.5, seed + 5, 0.25, makeRamp('#0d090d', '#060406'));
    buf.flush(ctx, x, y);
  });

  // Keep hash2d reference cleanly used for lint safety
  void hash2d(0, 0, 0);
  void shadeHex;
  void mixHex;
  void (null as unknown as ColorRamp);
}
