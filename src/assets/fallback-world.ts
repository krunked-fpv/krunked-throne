import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  drawPixelGrid,
  drawPixelLine,
  fillDiamond,
  fillPixelEllipse,
  fillTrapezoid,
  hash2d,
  outlinedBox,
  outlinedDiamond,
  outlinedEllipse,
  outlinedTrapezoid,
  px,
  rect,
} from './fallback-fonts';

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
    floorBase: '#47392e', floorHi: '#59483b', floorMid: '#3c3027', floorDark: '#2e241d', floorCrack: '#211914',
    accent: '#b85c2e',
    wallTop: '#382c24', wallTopHi: '#4f3f34', wallTopDark: '#261d18',
    wallBot: '#291f1b', wallBotHi: '#47372f', wallBotDark: '#17110f', wallOut: '#120d10',
  },
  {
    code: 1, pattern: 'desert',
    floorBase: '#c8985f', floorHi: '#d6aa72', floorMid: '#ba8950', floorDark: '#9e6f3d', floorCrack: '#784e29',
    accent: '#e3c48f',
    wallTop: '#945234', wallTopHi: '#b36b47', wallTopDark: '#703a23',
    wallBot: '#693622', wallBotHi: '#945236', wallBotDark: '#421e14', wallOut: '#21100c',
  },
  {
    code: 2, pattern: 'sewers',
    floorBase: '#455e44', floorHi: '#567554', floorMid: '#394f38', floorDark: '#2b3d2b', floorCrack: '#1d2b1e',
    accent: '#6aa64c',
    wallTop: '#314a37', wallTopHi: '#4a6b50', wallTopDark: '#203325',
    wallBot: '#1f3025', wallBotHi: '#38543f', wallBotDark: '#121d17', wallOut: '#0c140e',
  },
  {
    code: 3, pattern: 'scrapyard',
    floorBase: '#4d4642', floorHi: '#5e5651', floorMid: '#403a37', floorDark: '#2f2a28', floorCrack: '#211d1c',
    accent: '#784834',
    wallTop: '#6b4335', wallTopHi: '#875745', wallTopDark: '#4d2d22',
    wallBot: '#4a2c21', wallBotHi: '#704434', wallBotDark: '#2c1913', wallOut: '#1a100d',
  },
  {
    code: 4, pattern: 'caves',
    floorBase: '#38254a', floorHi: '#49325e', floorMid: '#2e1e3d', floorDark: '#22152e', floorCrack: '#160c21',
    accent: '#b668de',
    wallTop: '#5e3180', wallTopHi: '#7f47ab', wallTopDark: '#42205e',
    wallBot: '#462063', wallBotHi: '#733ca1', wallBotDark: '#29113d', wallOut: '#150821',
  },
  {
    code: 5, pattern: 'frozen',
    floorBase: '#9cb9d1', floorHi: '#bad4ea', floorMid: '#86a4bf', floorDark: '#64839e', floorCrack: '#486680',
    accent: '#ebf6ff',
    wallTop: '#bdd9f0', wallTopHi: '#d9ecfc', wallTopDark: '#8aa9c4',
    wallBot: '#304359', wallBotHi: '#526f8f', wallBotDark: '#1c2938', wallOut: '#101824',
  },
  {
    code: 6, pattern: 'labs',
    floorBase: '#3d5e5e', floorHi: '#4e7575', floorMid: '#314f4f', floorDark: '#233b3b', floorCrack: '#172929',
    accent: '#4ed978',
    wallTop: '#2b4447', wallTopHi: '#43686e', wallTopDark: '#1c2f33',
    wallBot: '#1c2d30', wallBotHi: '#345054', wallBotDark: '#101c1f', wallOut: '#091214',
  },
  {
    code: 7, pattern: 'palace',
    floorBase: '#2d3452', floorHi: '#3c466b', floorMid: '#252b45', floorDark: '#1c2136', floorCrack: '#131726',
    accent: '#c7a44a',
    wallTop: '#242c4a', wallTopHi: '#3d4975', wallTopDark: '#171d33',
    wallBot: '#181e36', wallBotHi: '#313d66', wallBotDark: '#0d1121', wallOut: '#080a14',
  },
  {
    code: 100, pattern: 'vault',
    floorBase: '#4c5461', floorHi: '#5f6978', floorMid: '#404752', floorDark: '#2f353f', floorCrack: '#20242b',
    accent: '#49ad86',
    wallTop: '#3e4859', wallTopHi: '#5b6880', wallTopDark: '#2b3240',
    wallBot: '#293140', wallBotHi: '#46536b', wallBotDark: '#171d26', wallOut: '#0f131a',
  },
  {
    code: 101, pattern: 'oasis',
    floorBase: '#387a72', floorHi: '#4d998f', floorMid: '#2d665f', floorDark: '#204d48', floorCrack: '#143633',
    accent: '#8de6d4',
    wallTop: '#285663', wallTopHi: '#437f91', wallTopDark: '#1a3a45',
    wallBot: '#193942', wallBotHi: '#31606e', wallBotDark: '#0e2329', wallOut: '#09171c',
  },
  {
    code: 102, pattern: 'pizza',
    floorBase: '#5e4b3c', floorHi: '#735c49', floorMid: '#4d3d30', floorDark: '#382c22', floorCrack: '#261d16',
    accent: '#c47b3f',
    wallTop: '#6e3d30', wallTopHi: '#8f5241', wallTopDark: '#4d271d',
    wallBot: '#4a251d', wallBotHi: '#733e32', wallBotDark: '#2b140f', wallOut: '#1a0c0a',
  },
  {
    code: 103, pattern: 'mansion',
    floorBase: '#663441', floorHi: '#7d4352', floorMid: '#542834', floorDark: '#3d1c25', floorCrack: '#2b1219',
    accent: '#cfa953',
    wallTop: '#9c7c38', wallTopHi: '#c4a252', wallTopDark: '#6e5522',
    wallBot: '#6e551f', wallBotHi: '#9e7c33', wallBotDark: '#453411', wallOut: '#241a08',
  },
  {
    code: 104, pattern: 'cursed',
    floorBase: '#301a3d', floorHi: '#422554', floorMid: '#261330', floorDark: '#1b0d24', floorCrack: '#110717',
    accent: '#cc54a0',
    wallTop: '#752257', wallTopHi: '#a63c7f', wallTopDark: '#4f143a',
    wallBot: '#54163e', wallBotHi: '#852863', wallBotDark: '#330b24', wallOut: '#1c0515',
  },
  {
    code: 105, pattern: 'jungle',
    floorBase: '#355433', floorHi: '#476e44', floorMid: '#2a4528', floorDark: '#1e331c', floorCrack: '#132412',
    accent: '#6dc44f',
    wallTop: '#294524', wallTopHi: '#426b3b', wallTopDark: '#1a2e17',
    wallBot: '#192e16', wallBotHi: '#31542b', wallBotDark: '#0e1c0c', wallOut: '#091208',
  },
  {
    code: 106, pattern: 'hq',
    floorBase: '#334463', floorHi: '#435880', floorMid: '#283650', floorDark: '#1c263a', floorCrack: '#131a29',
    accent: '#5ec8e8',
    wallTop: '#233350', wallTopHi: '#3e5987', wallTopDark: '#162136',
    wallBot: '#141f33', wallBotHi: '#2b4066', wallBotDark: '#0b1221', wallOut: '#070c17',
  },
  {
    code: 107, pattern: 'crib',
    floorBase: '#4d325c', floorHi: '#614273', floorMid: '#3e274a', floorDark: '#2c1b36', floorCrack: '#1f1226',
    accent: '#cfa953',
    wallTop: '#3e244a', wallTopHi: '#623c75', wallTopDark: '#281633',
    wallBot: '#291733', wallBotHi: '#4a2b59', wallBotDark: '#170c1f', wallOut: '#0f0714',
  },
];

/**
 * Draws calm, organic 32x32 multi-variant biome floor slabs.
 * FloorBuffer automatically samples aligned 16x16 quadrants from 32x32 slabs so
 * adjacent tiles fuse into cohesive, non-grid 16-bit wasteland ground where
 * enemies, shadows, casings & projectiles pop with crystal figure-ground clarity.
 * Variant distribution in worldgen: frame 0 = 72%, frame 1 = 14%, frame 2 = 8%, frame 3 = 6%.
 */
function drawBiomeFloor32(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  rect(ctx, x, y, w, h, t.floorBase);

  switch (t.pattern) {
    case 'desert': {
      // Calm sun-baked mesa sand with organic diagonal wind ripples & sparse dry desert cracks
      rect(ctx, x + 2, y + 4, 11, 2, t.floorHi);
      rect(ctx, x + 17, y + 12, 12, 2, t.floorHi);
      rect(ctx, x + 5, y + 21, 13, 2, t.floorMid);
      rect(ctx, x + 20, y + 27, 9, 2, t.floorHi);
      rect(ctx, x + 1, y + 14, 9, 2, t.floorMid);
      rect(ctx, x + 14, y + 3, 8, 1, t.floorMid);
      // Subtle sun-baked sand grain flecks
      for (let i = 0; i < 6; i++) {
        const gx = hash2d(i, frame, 17) % 29;
        const gy = hash2d(frame, i, 43) % 29;
        rect(ctx, x + 1 + gx, y + 1 + gy, 2, 1, i % 2 === 0 ? t.floorMid : t.floorHi);
      }
      if (frame === 1) {
        // Soft dune crest drift + tiny shaded sand pebble
        rect(ctx, x + 8, y + 8, 14, 2, t.floorHi);
        rect(ctx, x + 10, y + 10, 11, 1, t.floorMid);
        rect(ctx, x + 23, y + 20, 3, 2, t.floorDark);
        rect(ctx, x + 23, y + 19, 2, 1, t.accent);
      } else if (frame === 2) {
        // Delicate branching dry-earth crack tucked into one corner of the 32x32 slab
        rect(ctx, x + 6, y + 11, 4, 1, t.floorCrack);
        rect(ctx, x + 10, y + 12, 4, 1, t.floorCrack);
        rect(ctx, x + 13, y + 13, 3, 1, t.floorCrack);
        rect(ctx, x + 11, y + 10, 2, 1, t.floorCrack);
        rect(ctx, x + 7, y + 10, 3, 1, t.floorHi);
      } else if (frame === 3) {
        // Sparse bleached sandstone pebble cluster
        rect(ctx, x + 19, y + 18, 4, 2, t.floorDark);
        rect(ctx, x + 19, y + 17, 3, 1, t.accent);
        rect(ctx, x + 14, y + 21, 2, 2, t.floorDark);
        px(ctx, x + 14, y + 20, t.floorHi);
        rect(ctx, x + 7, y + 6, 3, 1, t.floorMid);
      }
      break;
    }

    case 'palace': {
      // Calm, stately desaturated indigo royal marble slabs with subtle mortar seams & veining
      // ZERO yellow-dot checkerboard, ZERO random red squares!
      // Staggered large architectural marble blocks (seamless across 32x32)
      rect(ctx, x, y + 15, w, 1, t.floorDark);
      rect(ctx, x, y + 31, w, 1, t.floorDark);
      rect(ctx, x + 15, y, 1, 15, t.floorDark);
      rect(ctx, x + 7, y + 16, 1, 15, t.floorDark);
      rect(ctx, x + 23, y + 16, 1, 15, t.floorDark);
      // Soft architectural tonal variation across slabs (low contrast!)
      rect(ctx, x + 16, y, 16, 15, t.floorMid);
      rect(ctx, x + 8, y + 16, 15, 15, t.floorMid);
      // Subtle top-left bevel sheen on marble slabs
      rect(ctx, x + 1, y + 1, 13, 1, t.floorHi);
      rect(ctx, x + 1, y + 1, 1, 11, t.floorHi);
      rect(ctx, x + 25, y + 17, 6, 1, t.floorHi);
      // Faint diagonal marble mineral veins
      rect(ctx, x + 4, y + 6, 5, 1, t.floorMid);
      rect(ctx, x + 8, y + 7, 4, 1, t.floorMid);
      rect(ctx, x + 19, y + 5, 6, 1, t.floorBase);
      rect(ctx, x + 12, y + 23, 5, 1, t.floorBase);
      if (frame === 1) {
        // Subtle weathered marble corner chip & faint stone vein
        rect(ctx, x + 12, y + 11, 3, 3, t.floorMid);
        rect(ctx, x + 20, y + 21, 5, 1, t.floorHi);
      } else if (frame === 2) {
        // Fine hairline fracture in one marble slab
        rect(ctx, x + 18, y + 8, 3, 1, t.floorCrack);
        rect(ctx, x + 21, y + 9, 3, 1, t.floorCrack);
        px(ctx, x + 24, y + 10, t.floorCrack);
      } else if (frame === 3) {
        // Rare subtle antique brass corner inlay notch (muted, calm — ZERO red squares or yellow polka-dots!)
        rect(ctx, x + 12, y + 12, 2, 1, t.accent);
        px(ctx, x + 13, y + 13, t.accent);
        rect(ctx, x + 2, y + 26, 4, 1, t.floorHi);
      }
      break;
    }

    case 'mansion':
    case 'crib': {
      // Plush low-contrast royal carpet / inlaid hardwood floor slabs (ZERO yellow-dot checkerboard!)
      rect(ctx, x, y + 15, w, 1, t.floorMid);
      rect(ctx, x, y + 31, w, 1, t.floorMid);
      rect(ctx, x + 15, y, 1, 15, t.floorMid);
      rect(ctx, x + 31, y + 16, 1, 15, t.floorMid);
      // Subtle woven velvet/parquet sheen
      rect(ctx, x + 3, y + 3, 9, 9, t.floorMid);
      rect(ctx, x + 19, y + 19, 9, 9, t.floorMid);
      rect(ctx, x + 4, y + 4, 7, 1, t.floorHi);
      rect(ctx, x + 20, y + 20, 7, 1, t.floorHi);
      if (frame === 1) {
        rect(ctx, x + 18, y + 5, 8, 2, t.floorHi);
        rect(ctx, x + 5, y + 22, 7, 2, t.floorDark);
      } else if (frame === 2) {
        rect(ctx, x + 7, y + 19, 4, 4, t.floorDark);
        rect(ctx, x + 8, y + 20, 2, 2, t.floorMid);
      } else if (frame === 3) {
        // Subtle muted antique gold woven filigree accent
        rect(ctx, x + 14, y + 14, 3, 1, t.accent);
        rect(ctx, x + 15, y + 13, 1, 3, t.accent);
      }
      break;
    }

    case 'scrapyard': {
      // Dark oily weathered asphalt & beaten scrapyard tarmac — ZERO bright orange Post-it squares!
      // Broad irregular asphalt patches
      rect(ctx, x + 2, y + 2, 13, 10, t.floorMid);
      rect(ctx, x + 18, y + 15, 12, 12, t.floorMid);
      rect(ctx, x + 4, y + 20, 10, 8, t.floorHi);
      // Subtle tar expansion seam
      rect(ctx, x, y + 16, w, 1, t.floorDark);
      rect(ctx, x + 16, y, 1, h, t.floorDark);
      // Fine weathered tarmac aggregate speckles
      for (let i = 0; i < 8; i++) {
        const gx = hash2d(i, frame, 53) % 30;
        const gy = hash2d(frame, i, 89) % 30;
        px(ctx, x + 1 + gx, y + 1 + gy, i % 2 === 0 ? t.floorDark : t.floorHi);
      }
      if (frame === 1) {
        // Subtle dark oil sheen smudge on asphalt
        fillPixelEllipse(ctx, x + 11, y + 10, 5, 3, t.floorDark);
        rect(ctx, x + 9, y + 9, 4, 1, '#3d454a');
      } else if (frame === 2) {
        // Cracked tarmac fissure + muted oxidized iron speck
        rect(ctx, x + 19, y + 6, 4, 1, t.floorCrack);
        rect(ctx, x + 22, y + 7, 3, 1, t.floorCrack);
        rect(ctx, x + 24, y + 8, 2, 2, t.floorCrack);
        rect(ctx, x + 7, y + 23, 3, 2, t.accent);
      } else if (frame === 3) {
        // Flush bolted dark scrap steel access plate (subdued charcoal-slate, zero orange!)
        rect(ctx, x + 18, y + 18, 12, 12, t.floorDark);
        rect(ctx, x + 19, y + 19, 10, 10, t.floorMid);
        rect(ctx, x + 19, y + 19, 10, 1, t.floorHi);
        px(ctx, x + 20, y + 20, t.floorCrack);
        px(ctx, x + 27, y + 20, t.floorCrack);
        px(ctx, x + 20, y + 27, t.floorCrack);
        px(ctx, x + 27, y + 27, t.floorCrack);
      }
      break;
    }

    case 'caves':
    case 'cursed': {
      // Deep atmospheric stone cavern slabs with gentle organic undulations —
      // ZERO dark circular pit grid, ZERO Venetian-blind bars, ZERO repeating magenta dots!
      rect(ctx, x + 2, y + 4, 13, 3, t.floorMid);
      rect(ctx, x + 16, y + 18, 13, 3, t.floorMid);
      rect(ctx, x + 5, y + 23, 11, 2, t.floorHi);
      rect(ctx, x + 17, y + 6, 10, 2, t.floorHi);
      // Soft scattered cavern slate grain
      for (let i = 0; i < 6; i++) {
        const gx = hash2d(i, frame, 31) % 28;
        const gy = hash2d(frame, i, 67) % 28;
        rect(ctx, x + 2 + gx, y + 2 + gy, 2, 1, i % 2 === 0 ? t.floorMid : t.floorHi);
      }
      if (frame === 1) {
        // Gentle layered cavern rock shelf
        rect(ctx, x + 5, y + 14, 12, 2, t.floorMid);
        rect(ctx, x + 6, y + 13, 10, 1, t.floorHi);
      } else if (frame === 2) {
        // Hairline stone crevice + whisper-subtle embedded mineral glint
        rect(ctx, x + 14, y + 18, 4, 1, t.floorDark);
        rect(ctx, x + 18, y + 19, 3, 1, t.floorDark);
        rect(ctx, x + 8, y + 7, 3, 1, t.accent);
        px(ctx, x + 9, y + 7, t.floorHi);
      } else if (frame === 3) {
        // Rare small crystal mineral vein nestled in cavern rock
        rect(ctx, x + 20, y + 10, 3, 2, t.floorDark);
        rect(ctx, x + 21, y + 10, 2, 1, t.accent);
        px(ctx, x + 21, y + 10, '#f0d4ff');
        rect(ctx, x + 6, y + 25, 5, 1, t.floorDark);
      }
      break;
    }

    case 'frozen': {
      // Natural wind-drifted snow over cracked winter city pavement
      rect(ctx, x + 1, y + 3, 15, 4, t.floorHi);
      rect(ctx, x + 14, y + 15, 16, 4, t.floorHi);
      rect(ctx, x + 3, y + 24, 14, 4, t.floorMid);
      rect(ctx, x + 19, y + 6, 10, 3, t.floorMid);
      rect(ctx, x + 8, y + 11, 10, 2, t.floorMid);
      if (frame === 1) {
        // Wind-sculpted snow ridge + tiny icy highlight
        rect(ctx, x + 4, y + 14, 12, 2, t.floorHi);
        rect(ctx, x + 6, y + 16, 9, 1, t.floorMid);
        px(ctx, x + 9, y + 14, t.accent);
      } else if (frame === 2) {
        // Cracked cold pavement peeking gently beneath drifted snow
        rect(ctx, x + 17, y + 18, 9, 6, t.floorDark);
        rect(ctx, x + 18, y + 19, 7, 4, '#55718a');
        rect(ctx, x + 19, y + 20, 3, 1, t.floorCrack);
        rect(ctx, x + 22, y + 21, 2, 1, t.floorCrack);
        rect(ctx, x + 18, y + 18, 5, 1, t.floorHi);
      } else if (frame === 3) {
        // Subtle frost hairline crack & sparkling snow crystals
        rect(ctx, x + 7, y + 8, 4, 1, t.floorDark);
        rect(ctx, x + 11, y + 9, 3, 1, t.floorDark);
        rect(ctx, x + 8, y + 7, 3, 1, t.accent);
        px(ctx, x + 24, y + 24, t.accent);
        px(ctx, x + 12, y + 26, t.accent);
      }
      break;
    }

    case 'sewers': {
      // Damp mossy subterranean stone flagstones (calm 32x32 masonry, no loud puddles!)
      rect(ctx, x, y + 15, w, 1, t.floorDark);
      rect(ctx, x, y + 31, w, 1, t.floorDark);
      rect(ctx, x + 11, y, 1, 15, t.floorDark);
      rect(ctx, x + 27, y, 1, 15, t.floorDark);
      rect(ctx, x + 5, y + 16, 1, 15, t.floorDark);
      rect(ctx, x + 21, y + 16, 1, 15, t.floorDark);
      // Soft moss-stained flagstone variation
      rect(ctx, x + 12, y + 1, 15, 14, t.floorMid);
      rect(ctx, x + 6, y + 17, 15, 14, t.floorMid);
      rect(ctx, x + 1, y + 1, 9, 1, t.floorHi);
      rect(ctx, x + 22, y + 17, 8, 1, t.floorHi);
      if (frame === 1) {
        // Creeping dark moss tucked into flagstone mortar seam
        rect(ctx, x + 10, y + 14, 4, 2, t.accent);
        rect(ctx, x + 11, y + 13, 2, 1, t.floorHi);
      } else if (frame === 2) {
        // Damp dark sheen + hairline stone crack
        fillPixelEllipse(ctx, x + 20, y + 9, 4, 2, t.floorDark);
        rect(ctx, x + 19, y + 8, 2, 1, '#587d69');
        rect(ctx, x + 7, y + 23, 4, 1, t.floorCrack);
      } else if (frame === 3) {
        // Recessed weathered iron floor grate (tucked subtly inside one flagstone)
        rect(ctx, x + 10, y + 19, 8, 8, t.floorCrack);
        for (let gx = 11; gx <= 16; gx += 2) {
          rect(ctx, x + gx, y + 20, 1, 6, t.floorMid);
        }
        rect(ctx, x + 10, y + 19, 8, 1, t.floorHi);
      }
      break;
    }

    case 'pizza': {
      // Warm subterranean pizza-sewer brick & terracotta tile — ZERO cyan sewer water puddles!
      rect(ctx, x, y + 10, w, 1, t.floorDark);
      rect(ctx, x, y + 21, w, 1, t.floorDark);
      rect(ctx, x, y + 31, w, 1, t.floorDark);
      rect(ctx, x + 15, y, 1, 10, t.floorDark);
      rect(ctx, x + 7, y + 11, 1, 10, t.floorDark);
      rect(ctx, x + 23, y + 11, 1, 10, t.floorDark);
      rect(ctx, x + 15, y + 22, 1, 9, t.floorDark);
      // Warm varied terracotta brick shading
      rect(ctx, x + 16, y, 16, 10, t.floorMid);
      rect(ctx, x + 8, y + 11, 15, 10, t.floorMid);
      rect(ctx, x + 1, y + 1, 12, 1, t.floorHi);
      rect(ctx, x + 24, y + 12, 7, 1, t.floorHi);
      rect(ctx, x + 1, y + 23, 12, 1, t.floorHi);
      if (frame === 1) {
        // Warm oven-baked terracotta brick variation
        rect(ctx, x + 9, y + 12, 13, 8, t.floorBase);
        rect(ctx, x + 10, y + 12, 10, 1, t.floorHi);
      } else if (frame === 2) {
        // Subtle aged brick crack + warm terracotta crumb
        rect(ctx, x + 4, y + 14, 3, 1, t.floorCrack);
        px(ctx, x + 7, y + 15, t.floorCrack);
        rect(ctx, x + 21, y + 25, 3, 1, t.accent);
      } else if (frame === 3) {
        // Weathered dark bronze-iron floor drain (warm subterranean tones, zero cyan!)
        rect(ctx, x + 19, y + 13, 8, 6, t.floorCrack);
        for (let gx = 20; gx <= 25; gx += 2) {
          rect(ctx, x + gx, y + 14, 1, 4, t.floorMid);
        }
        rect(ctx, x + 19, y + 13, 8, 1, t.floorHi);
      }
      break;
    }

    case 'vault': {
      // Solemn ancient carved Crown Vault temple slate slabs — ZERO neon-green capital 'T's!
      rect(ctx, x, y + 15, w, 1, t.floorDark);
      rect(ctx, x, y + 31, w, 1, t.floorDark);
      rect(ctx, x + 15, y, 1, 15, t.floorDark);
      rect(ctx, x + 23, y + 16, 1, 15, t.floorDark);
      rect(ctx, x + 7, y + 16, 1, 15, t.floorDark);
      // Quiet monumental stone slab tone shifts
      rect(ctx, x + 16, y, 16, 15, t.floorMid);
      rect(ctx, x + 8, y + 16, 15, 15, t.floorMid);
      rect(ctx, x + 1, y + 1, 13, 1, t.floorHi);
      rect(ctx, x + 1, y + 1, 1, 12, t.floorHi);
      rect(ctx, x + 24, y + 17, 7, 1, t.floorHi);
      if (frame === 1) {
        // Subtle recessed chiseled stone bevel border inside one large slab
        rect(ctx, x + 3, y + 3, 10, 10, t.floorMid);
        rect(ctx, x + 4, y + 4, 8, 8, t.floorBase);
        rect(ctx, x + 4, y + 4, 8, 1, t.floorHi);
      } else if (frame === 2) {
        // Weathered ancient temple crack
        rect(ctx, x + 19, y + 7, 4, 1, t.floorCrack);
        rect(ctx, x + 23, y + 8, 3, 1, t.floorCrack);
        px(ctx, x + 25, y + 9, t.floorCrack);
      } else if (frame === 3) {
        // Subtle carved ancient geometric ring (muted stone verdigris, NOT a neon green 'T'!)
        rect(ctx, x + 13, y + 21, 5, 1, t.floorDark);
        rect(ctx, x + 13, y + 25, 5, 1, t.floorDark);
        rect(ctx, x + 13, y + 22, 1, 3, t.floorDark);
        rect(ctx, x + 17, y + 22, 1, 3, t.floorDark);
        px(ctx, x + 15, y + 23, t.accent);
      }
      break;
    }

    case 'labs':
    case 'hq': {
      // Clean large-format 32x32 laboratory / tactical deck panels (low-contrast cohesive floor)
      rect(ctx, x, y + 15, w, 1, t.floorDark);
      rect(ctx, x + 15, y, 1, h, t.floorDark);
      rect(ctx, x + 1, y + 1, 13, 1, t.floorHi);
      rect(ctx, x + 17, y + 17, 13, 1, t.floorHi);
      rect(ctx, x + 16, y, 16, 15, t.floorMid);
      rect(ctx, x, y + 16, 15, 16, t.floorMid);
      // Tiny recessed corner fastener dots
      px(ctx, x + 2, y + 2, t.floorDark);
      px(ctx, x + 13, y + 13, t.floorDark);
      px(ctx, x + 18, y + 18, t.floorDark);
      px(ctx, x + 29, y + 29, t.floorDark);
      if (frame === 1) {
        rect(ctx, x + 4, y + 5, 7, 5, t.floorMid);
        rect(ctx, x + 5, y + 6, 5, 1, t.floorHi);
      } else if (frame === 2) {
        // Recessed ventilation louver strip
        rect(ctx, x + 19, y + 6, 8, 4, t.floorDark);
        rect(ctx, x + 20, y + 7, 6, 1, t.floorCrack);
        rect(ctx, x + 20, y + 9, 6, 1, t.floorCrack);
      } else if (frame === 3) {
        // Subtle recessed conduit indicator strip (restrained!)
        rect(ctx, x + 5, y + 23, 6, 2, t.floorDark);
        rect(ctx, x + 6, y + 23, 4, 1, t.accent);
      }
      break;
    }

    case 'oasis':
    case 'jungle': {
      // Calm shimmering shallow oasis seabed OR lush loamy mossy jungle floor (32x32)
      rect(ctx, x + 2, y + 5, 12, 3, t.floorHi);
      rect(ctx, x + 17, y + 18, 12, 3, t.floorHi);
      rect(ctx, x + 5, y + 23, 11, 3, t.floorMid);
      rect(ctx, x + 18, y + 7, 10, 3, t.floorMid);
      for (let i = 0; i < 6; i++) {
        const gx = hash2d(i, frame, 23) % 28;
        const gy = hash2d(frame, i, 79) % 28;
        rect(ctx, x + 2 + gx, y + 2 + gy, 2, 1, i % 2 === 0 ? t.floorMid : t.floorDark);
      }
      if (frame === 1) {
        fillPixelEllipse(ctx, x + 10, y + 12, 5, 3, t.floorMid);
        rect(ctx, x + 8, y + 11, 4, 1, t.floorHi);
      } else if (frame === 2) {
        // Gentle water caustic shimmer (oasis) or mossy leaf cluster (jungle)
        rect(ctx, x + 14, y + 14, 5, 1, t.accent);
        rect(ctx, x + 17, y + 15, 3, 1, t.floorHi);
      } else if (frame === 3) {
        // Tiny sunken seabed pebble / ancient jungle moss stone
        rect(ctx, x + 21, y + 10, 4, 3, t.floorDark);
        rect(ctx, x + 21, y + 10, 3, 1, t.floorHi);
        if (t.pattern === 'oasis') px(ctx, x + 22, y + 10, t.accent);
      }
      break;
    }

    default: {
      // Campfire (0-1) calm organic wasteland dirt & ash arena — ZERO circular dark pit grid!
      rect(ctx, x + 2, y + 5, 13, 3, t.floorMid);
      rect(ctx, x + 16, y + 19, 13, 3, t.floorMid);
      rect(ctx, x + 15, y + 4, 10, 2, t.floorHi);
      rect(ctx, x + 3, y + 23, 11, 2, t.floorHi);
      for (let i = 0; i < 9; i++) {
        const sx = hash2d(i, frame, 71) % 29;
        const sy = hash2d(frame, i, 97) % 29;
        rect(ctx, x + 1 + sx, y + 1 + sy, 2, 1, i % 3 === 0 ? t.floorMid : t.floorHi);
      }
      if (frame === 1) {
        // Soft weathered ash sweep
        rect(ctx, x + 16, y + 12, 9, 3, t.floorMid);
        rect(ctx, x + 18, y + 11, 5, 1, t.floorHi);
      } else if (frame === 2) {
        rect(ctx, x + 7, y + 15, 5, 1, t.floorDark);
        rect(ctx, x + 12, y + 16, 3, 1, t.floorDark);
        px(ctx, x + 22, y + 9, t.accent);
      } else if (frame === 3) {
        rect(ctx, x + 12, y + 22, 3, 2, t.floorDark);
        rect(ctx, x + 12, y + 21, 2, 1, t.floorHi);
        rect(ctx, x + 24, y + 11, 2, 2, t.floorMid);
      }
      break;
    }
  }
}

function drawBiomeFloorExplo(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  // Cracked / blast-carved 16x16 rubble floor (reserved for wall destruction craters)
  rect(ctx, x, y, w, h, t.floorBase);
  rect(ctx, x + 1, y + 1, 14, 14, t.floorMid);
  fillPixelEllipse(ctx, x + 8, y + 8, 6, 5, t.floorDark);
  fillPixelEllipse(ctx, x + 8, y + 8, 4, 3, t.floorCrack);
  rect(ctx, x + 2, y + 7 + (frame & 1), 3, 1, t.floorCrack);
  rect(ctx, x + 11, y + 6, 4, 1, t.floorCrack);
  rect(ctx, x + 7, y + 2, 1, 3, t.floorCrack);
  rect(ctx, x + 9, y + 12, 1, 3, t.floorCrack);
  rect(ctx, x + 3 + frame, y + 3, 3, 2, t.wallTopDark);
  px(ctx, x + 3 + frame, y + 3, t.floorHi);
  rect(ctx, x + 10, y + 10 + (frame & 1), 3, 2, t.wallBot);
  px(ctx, x + 10, y + 10 + (frame & 1), t.floorMid);
}

function drawBiomeWallTop(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  // Seamless fused wall-top surface!
  // ZERO per-tile waffle borders, ZERO corner Lego studs, ZERO yellow center dots, ZERO subway-tile outlines!
  // Outer 2.5D perimeter bevels are drawn dynamically by GameRenderer so adjacent walls fuse into cohesive masses.
  rect(ctx, x, y, w, h, t.wallTop);

  if (t.pattern === 'frozen') {
    // Seamless wind-drifted snowbank parapet (edge-to-edge fused snow — ZERO dark blue subway-tile grid!)
    rect(ctx, x, y, w, h, t.wallTop);
    rect(ctx, x + 1, y + 2, 11, 3, t.wallTopHi);
    rect(ctx, x + 4, y + 9, 10, 3, t.wallTopHi);
    rect(ctx, x + 2, y + 13, 9, 2, t.wallTopDark);
    if (frame === 1) {
      rect(ctx, x + 5, y + 5, 9, 2, '#eef8ff');
      rect(ctx, x + 2, y + 11, 6, 2, t.wallTopDark);
    } else if (frame === 2) {
      // Subtle drifted snow shadow hollow
      rect(ctx, x + 3, y + 7, 8, 3, t.wallTopDark);
      rect(ctx, x + 4, y + 6, 7, 1, '#eef8ff');
    } else if (frame === 3) {
      px(ctx, x + 5, y + 4, '#ffffff');
      px(ctx, x + 11, y + 10, '#ffffff');
    }
  } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
    // Seamless unified grand royal stone parapet — ZERO repeating 16px horizontal dash/box rhythm!
    if (frame === 0) {
      // Calm cohesive royal stonework (72% of walls — merges smoothly across large islands!)
      rect(ctx, x + 1, y + 5, 6, 1, t.wallTopHi);
      rect(ctx, x + 9, y + 12, 5, 1, t.wallTopDark);
    } else if (frame === 1) {
      // Subtle staggered masonry joint & soft marble bevel
      rect(ctx, x + 2, y + 8, 10, 1, t.wallTopDark);
      rect(ctx, x + 3, y + 7, 8, 1, t.wallTopHi);
    } else if (frame === 2) {
      // Delicate carved stone fracture
      rect(ctx, x + 4, y + 5, 4, 1, t.wallTopDark);
      rect(ctx, x + 8, y + 6, 3, 1, t.wallTopDark);
    } else {
      // Sparse subtle antique gold royal molding trim
      rect(ctx, x + 4, y + 10, 7, 1, t.accent);
      rect(ctx, x + 5, y + 11, 5, 1, t.wallTopDark);
    }
  } else if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
    // Seamless fused sheet-metal / composite roof mass — ZERO repeating 16px box/dash rhythm!
    if (frame === 0) {
      // Calm unified riveted roof plating (72% of walls — smooth industrial mass!)
      rect(ctx, x + 2, y + 4, 6, 1, t.wallTopHi);
      rect(ctx, x + 8, y + 11, 6, 1, t.wallTopDark);
    } else if (frame === 1) {
      // Subtle welded sheet seam & two micro-rivets
      rect(ctx, x + 1, y + 8, 12, 1, t.wallTopDark);
      rect(ctx, x + 2, y + 7, 10, 1, t.wallTopHi);
      px(ctx, x + 3, y + 11, t.wallTopDark);
      px(ctx, x + 12, y + 4, t.wallTopHi);
    } else if (frame === 2) {
      // Small recessed roof vent / structural seam
      rect(ctx, x + 4, y + 6, 7, 2, t.wallTopDark);
      px(ctx, x + 5, y + 5, t.wallTopHi);
      px(ctx, x + 10, y + 5, t.wallTopHi);
    } else {
      // Rare sparse weathered patch / conduit mark
      rect(ctx, x + 4, y + 7, 6, 2, t.wallTopDark);
      rect(ctx, x + 5, y + 7, 4, 1, t.accent);
    }
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // Seamless rough basalt cavern stone cap — NO repeating glowing boxes!
    rect(ctx, x + 1, y + 2, 7, 5, t.wallTopDark);
    rect(ctx, x + 8, y + 9, 6, 5, t.wallTopDark);
    rect(ctx, x + 3, y + 4, 5, 2, t.wallTopHi);
    if (frame === 1) {
      rect(ctx, x + 9, y + 3, 5, 3, t.wallTopHi);
      rect(ctx, x + 2, y + 10, 5, 2, t.wallTopDark);
    } else if (frame === 2) {
      // Hairline rock facet ridge
      rect(ctx, x + 3, y + 7, 9, 1, t.wallTopDark);
      rect(ctx, x + 4, y + 6, 7, 1, t.wallTopHi);
    } else if (frame === 3) {
      // Sparse emerging crystal shard cluster on cavern roof (rare 6%!)
      outlinedDiamond(ctx, x + 8, y + 7, 2, 3, t.accent, t.wallTopDark);
      px(ctx, x + 8, y + 5, '#f4d9ff');
    }
  } else {
    // Desert / Campfire / Sewers / Vault / Oasis / Pizza / Jungle:
    // Organic weathered canyon rock strata — ZERO cream/maroon corner Lego studs!
    if (frame === 0) {
      // Calm cohesive mesa strata (72% of walls — blends smoothly across neighboring tiles!)
      rect(ctx, x + 2, y + 4, 9, 2, t.wallTopHi);
      rect(ctx, x + 5, y + 10, 8, 2, t.wallTopDark);
      rect(ctx, x + 1, y + 12, 5, 1, t.wallTopDark);
    } else if (frame === 1) {
      // Soft eroded sandstone terrace & rock grain
      rect(ctx, x + 3, y + 3, 10, 2, t.wallTopDark);
      rect(ctx, x + 4, y + 5, 8, 2, t.wallTopHi);
      rect(ctx, x + 2, y + 11, 7, 2, t.wallTopHi);
    } else if (frame === 2) {
      // Delicate jagged weathered mesa fissure
      rect(ctx, x + 3, y + 5, 4, 1, t.wallTopDark);
      rect(ctx, x + 7, y + 6, 4, 1, t.wallTopDark);
      rect(ctx, x + 10, y + 7, 2, 2, t.wallTopDark);
      rect(ctx, x + 4, y + 4, 5, 1, t.wallTopHi);
    } else {
      // Subtle weathered rock ledge & scattered shale shadow
      rect(ctx, x + 2, y + 8, 10, 2, t.wallTopDark);
      rect(ctx, x + 3, y + 7, 8, 1, t.wallTopHi);
      rect(ctx, x + 9, y + 2, 4, 2, t.wallTopDark);
    }
  }
}

function drawBiomeWallBot(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  // 2.5D front-facing weathered canyon cliff / riveted steel / gilded obsidian facade
  rect(ctx, x, y, w, h, t.wallBot);
  // Deep shadow overhang lip directly beneath roof cap
  rect(ctx, x, y, w, 2, t.wallBotDark);
  rect(ctx, x, y + 2, w, 1, t.wallBotHi);

  if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
    // Ribbed steel bulkhead panels with crisp bevels & recessed rivets
    rect(ctx, x + 1, y + 3, 6, 10, t.wallBotHi);
    rect(ctx, x + 9, y + 3, 6, 10, t.wallBotHi);
    rect(ctx, x + 2, y + 4, 4, 8, t.wallBot);
    rect(ctx, x + 10, y + 4, 4, 8, t.wallBot);
    px(ctx, x + 2, y + 4, t.wallTopHi);
    px(ctx, x + 10, y + 4, t.wallTopHi);
    px(ctx, x + 5, y + 10, t.wallBotDark);
    px(ctx, x + 13, y + 10, t.wallBotDark);
    if (t.pattern === 'labs' && frame === 3) {
      rect(ctx, x + 1, y + 11, 14, 2, '#171a1f');
      rect(ctx, x + 2, y + 11, 2, 2, '#c9a632');
      rect(ctx, x + 6, y + 11, 2, 2, '#c9a632');
      rect(ctx, x + 10, y + 11, 2, 2, '#c9a632');
    } else if (t.pattern === 'scrapyard' && frame === 2) {
      rect(ctx, x + 3, y + 5, 2, 6, t.accent);
      px(ctx, x + 4, y + 10, t.wallBotDark);
    } else if (t.pattern === 'hq' && frame === 2) {
      rect(ctx, x + 3, y + 7, 3, 1, t.accent);
    }
  } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
    // Regal carved obsidian-indigo wall with refined antique gold frieze & stone pilasters
    rect(ctx, x, y + 3, w, 1, t.accent);
    rect(ctx, x + 1, y + 5, 6, 8, t.wallBotHi);
    rect(ctx, x + 9, y + 5, 6, 8, t.wallBotHi);
    rect(ctx, x + 2, y + 6, 4, 6, t.wallBot);
    rect(ctx, x + 10, y + 6, 4, 6, t.wallBot);
    if (frame === 3 && t.pattern === 'palace') {
      // Subtle inlaid antique gold keystone emblem (never a bright red square!)
      rect(ctx, x + 7, y + 6, 2, 4, t.accent);
      px(ctx, x + 7, y + 6, '#e8d080');
    }
  } else if (t.pattern === 'desert' || t.pattern === 'campfire' || t.pattern === 'oasis') {
    // Sculpted layered sandstone canyon cliff strata with varied rock fissures
    const splitA = 5 + (frame % 3);
    const splitB = 10 + ((frame + 1) % 3);
    rect(ctx, x, y + 3, w, 4, t.wallBotHi);
    rect(ctx, x, y + 5, w, 2, t.wallBot);
    rect(ctx, x + splitA, y + 3, 1, 5, t.wallBotDark);
    rect(ctx, x, y + 7, w, 1, t.wallBotDark);
    rect(ctx, x + 1, y + 8, w - 2, 2, t.wallBotHi);
    rect(ctx, x, y + 10, w, 4, t.wallBot);
    rect(ctx, x + splitB, y + 8, 1, 6, t.wallBotDark);
    rect(ctx, x + ((frame * 4 + 1) % 10), y + 3, 4, 1, t.wallTopHi);
    rect(ctx, x + ((frame * 5 + 3) % 9), y + 8, 4, 1, t.wallTopHi);
    if (frame === 2) {
      px(ctx, x + 4, y + 5, t.wallBotDark);
      px(ctx, x + 5, y + 6, t.wallBotDark);
      rect(ctx, x + 6, y + 7, 1, 3, t.wallBotDark);
      px(ctx, x + 7, y + 10, t.wallBotDark);
    } else if (frame === 3) {
      rect(ctx, x + 3, y + 10, 6, 2, t.wallBotDark);
      rect(ctx, x + 3, y + 9, 5, 1, t.wallTopHi);
    }
  } else {
    // Staggered weathered stone/brick courses with crisp top bevels & hairline cracks
    rect(ctx, x + 1, y + 3, 6, 4, t.wallBotHi);
    rect(ctx, x + 9, y + 3, 6, 4, t.wallBotHi);
    rect(ctx, x + 2, y + 4, 5, 3, t.wallBot);
    rect(ctx, x + 10, y + 4, 5, 3, t.wallBot);
    px(ctx, x + 1, y + 3, t.wallTopHi);
    px(ctx, x + 9, y + 3, t.wallTopHi);
    rect(ctx, x, y + 7, w, 1, t.wallBotDark);

    rect(ctx, x, y + 8, 3, 5, t.wallBotHi);
    rect(ctx, x + 5, y + 8, 7, 5, t.wallBotHi);
    rect(ctx, x + 13, y + 8, 3, 5, t.wallBotHi);
    rect(ctx, x + 6, y + 9, 6, 4, t.wallBot);
    px(ctx, x + 5, y + 8, t.wallTopHi);

    if (frame === 2) {
      rect(ctx, x + 7, y + 9, 1, 2, t.wallBotDark);
      px(ctx, x + 8, y + 11, t.wallBotDark);
    }

    if (t.pattern === 'sewers' && frame === 2) {
      rect(ctx, x + 4, y + 2, 2, 5, t.accent);
      rect(ctx, x + 11, y + 2, 2, 4, t.accent);
    } else if (t.pattern === 'jungle' && frame === 2) {
      rect(ctx, x + 3, y + 2, 2, 7, t.accent);
      rect(ctx, x + 11, y + 2, 2, 5, t.accent);
    } else if (t.pattern === 'frozen') {
      // Frosted snow overhang cornice & icicles
      rect(ctx, x, y + 1, w, 2, '#d4eafc');
      rect(ctx, x + 3, y + 3, 2, 3, '#c4e3fa');
      px(ctx, x + 3, y + 2, '#ffffff');
      rect(ctx, x + 10, y + 3, 2, 4, '#c4e3fa');
      px(ctx, x + 10, y + 2, '#ffffff');
    } else if ((t.pattern === 'caves' || t.pattern === 'cursed') && frame === 3) {
      rect(ctx, x + 6, y + 5, 3, 5, t.accent);
      px(ctx, x + 6, y + 5, '#f0d4ff');
    }
  }

  // Grounded dark contact shadow along bottom edge
  rect(ctx, x, y + h - 2, w, 2, INK);
}

/**
 * Registers ALL 16 biome floor/wall tilesets (32x32 calm slabs + fused 16x16 walls) +
 * Campfire + All Portals + All Chests + Authentic Biome Props + Pickups + Casings + Decals.
 */
export function registerFallbackWorld(b: FallbackAtlasBuilder): void {
  // 1. ALL 16 BIOME TILESETS (32x32 multi-variant floor slabs!)
  for (const theme of BIOME_THEMES) {
    b.addSprite(`sprFloor${theme.code}`, 32, 32, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeFloor32(ctx, x, y, w, h, f, theme),
    );
    b.addSprite(`sprFloor${theme.code}Explo`, 16, 16, 0, 0, 3, (ctx, x, y, w, h, f) =>
      drawBiomeFloorExplo(ctx, x, y, w, h, f, theme),
    );
    b.addSprite(`sprWall${theme.code}Top`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallTop(ctx, x, y, w, h, f, theme),
    );
    b.addSprite(`sprWall${theme.code}Bot`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallBot(ctx, x, y, w, h, f, theme),
    );
    b.addSprite(`sprWall${theme.code}Out`, 18, 18, 1, 1, 1, (ctx, x, y, w, h) => {
      rect(ctx, x, y, w, h, theme.wallOut);
      rect(ctx, x + 1, y + 1, w - 2, h - 2, theme.wallBotDark);
    });
    b.addAlias(`sprWall${theme.code}Trans`, `sprWall${theme.code}Bot`);
  }

  // 2. ANIMATED CAMPFIRE & CAMPFIRE OFF
  b.addSprite('sprCampfire', 24, 24, 12, 14, 4, (ctx, x, y, _w, _h, f) => {
    const stones: Array<[number, number, number, number]> = [
      [3, 15, 4, 3], [8, 17, 4, 3], [13, 17, 4, 3], [17, 15, 4, 3],
      [4, 12, 3, 3], [17, 12, 3, 3],
    ];
    for (const [sx, sy, sw, sh] of stones) {
      outlinedBox(ctx, x + sx, y + sy, sw, sh, '#6b6470', INK);
      rect(ctx, x + sx + 1, y + sy + 1, Math.max(1, sw - 2), 1, '#a39bad');
    }
    rect(ctx, x + 5, y + 13, 14, 4, INK);
    rect(ctx, x + 6, y + 14, 12, 2, '#5c3822');
    rect(ctx, x + 7, y + 14, 5, 1, '#945d3b');
    rect(ctx, x + 8, y + 12, 8, 4, '#472a18');
    rect(ctx, x + 7, y + 14, 10, 2, '#ff4518');
    rect(ctx, x + 9, y + 14, 6, 1, '#ffc43b');

    const sway = f === 1 ? -1 : f === 3 ? 1 : 0;
    const tall = f % 2 === 0 ? 1 : 0;
    fillPixelEllipse(ctx, x + 12 + sway * 0.5, y + 10, 6, 6 + tall, '#bd2418');
    fillPixelEllipse(ctx, x + 12 + sway * 0.5, y + 10, 5, 5 + tall, '#ff681c');
    rect(ctx, x + 10 + sway, y + 2 - tall, 3, 4, '#ff681c');
    rect(ctx, x + 11 + sway, y + 1 - tall, 2, 2, '#ffb833');
    rect(ctx, x + 7 - sway, y + 6, 2, 3, '#ff8024');
    rect(ctx, x + 15 + sway, y + 5, 2, 3, '#ff8024');
    fillPixelEllipse(ctx, x + 12, y + 11, 3, 4, '#ffd83d');
    rect(ctx, x + 11, y + 10, 2, 3, '#fff9cc');
    px(ctx, x + 8 + ((f * 3) % 8), y + 1 + ((f * 2) % 3), '#ffe047');
    px(ctx, x + 15 - ((f * 2) % 7), y + 2 + ((f + 1) % 3), '#ff7b29');
  });

  b.addSprite('sprCampfireOff', 24, 24, 12, 14, 1, (ctx, x, y) => {
    const stones: Array<[number, number, number, number]> = [
      [3, 15, 4, 3], [8, 17, 4, 3], [13, 17, 4, 3], [17, 15, 4, 3],
      [4, 12, 3, 3], [17, 12, 3, 3],
    ];
    for (const [sx, sy, sw, sh] of stones) {
      outlinedBox(ctx, x + sx, y + sy, sw, sh, '#544e59', INK);
    }
    rect(ctx, x + 5, y + 13, 14, 4, INK);
    rect(ctx, x + 6, y + 14, 12, 2, '#302521');
    rect(ctx, x + 8, y + 12, 8, 3, '#241c1a');
    px(ctx, x + 11, y + 14, '#7d2618');
    px(ctx, x + 13, y + 15, '#591a12');
  });

  // 3. SWIRLING PORTALS (STANDARD PURPLE, PROTO EMERALD VAULT, POPO COBALT HQ, IDPD RIFTS)
  const drawSwirlPortal = (
    ctx: DrawCtx,
    x: number,
    y: number,
    f: number,
    rim: string,
    outer: string,
    mid: string,
    armOuter: string,
    armInner: string,
    coreRing: string,
  ): void => {
    const cx = x + 16;
    const cy = y + 16;
    const pulse = f % 2 === 0 ? 1 : 0;
    fillPixelEllipse(ctx, cx, cy, 14 - pulse, 14 - pulse, rim);
    fillPixelEllipse(ctx, cx, cy, 12, 12, outer);
    fillPixelEllipse(ctx, cx, cy, 9, 9, mid);
    const baseAng = (f / 6) * Math.PI * 2;
    for (let arm = 0; arm < 4; arm++) {
      for (let step = 2; step <= 11; step++) {
        const ang = baseAng + (arm * Math.PI) / 2 + step * 0.24;
        const pxX = Math.round(cx + Math.cos(ang) * step);
        const pxY = Math.round(cy + Math.sin(ang) * step);
        rect(ctx, pxX, pxY, step > 7 ? 2 : 1, step > 7 ? 2 : 1, step < 6 ? armInner : armOuter);
      }
    }
    fillPixelEllipse(ctx, cx, cy, 5, 5, coreRing);
    fillPixelEllipse(ctx, cx, cy, 3 - (pulse & 1), 3 - (pulse & 1), '#ffffff');
  };

  b.addSprite('sprPortal', 32, 32, 16, 16, 6, (ctx, x, y, _w, _h, f) =>
    drawSwirlPortal(ctx, x, y, f, '#240b3b', '#5c1894', '#9f3be8', '#d678ff', '#f8d6ff', '#e89eff'),
  );
  b.addAlias('sprPortalClear', 'sprPortal');

  b.addSprite('sprProtoPortal', 32, 32, 16, 16, 6, (ctx, x, y, _w, _h, f) =>
    drawSwirlPortal(ctx, x, y, f, '#0b2b1d', '#146e41', '#26bf69', '#6eff9f', '#d9ffe8', '#9effc0'),
  );

  b.addSprite('sprPopoPortal', 32, 32, 16, 16, 6, (ctx, x, y, _w, _h, f) =>
    drawSwirlPortal(ctx, x, y, f, '#0b193d', '#16459e', '#2e86f0', '#6ed4ff', '#dcf7ff', '#9ee8ff'),
  );

  b.addSprite('sprPortalIndicator', 12, 12, 6, 6, 2, (ctx, x, y, _w, _h, f) => {
    outlinedEllipse(ctx, x + 6, y + 6, 3 + (f & 1), 3 + (f & 1), '#9e38e8', '#1b092b');
    fillPixelEllipse(ctx, x + 6, y + 6, 2, 2, f === 0 ? '#f4ccff' : '#ffffff');
  });

  b.addSprite('sprIDPDPortalStart', 24, 24, 12, 12, 4, (ctx, x, y, _w, _h, f) => {
    const r = 3 + f * 2;
    fillPixelEllipse(ctx, x + 12, y + 12, r + 2, r + 2, '#132854');
    fillPixelEllipse(ctx, x + 12, y + 12, r, r, '#2c78eb');
    fillPixelEllipse(ctx, x + 12, y + 12, Math.max(2, r - 3), Math.max(2, r - 3), '#9cf0ff');
  });

  b.addSprite('sprVanPortalStart', 32, 32, 16, 16, 4, (ctx, x, y, _w, _h, f) => {
    const r = 6 + f * 2;
    fillPixelEllipse(ctx, x + 16, y + 16, r + 3, r + 2, '#0e1e47');
    fillPixelEllipse(ctx, x + 16, y + 16, r + 1, r, '#3388ff');
    fillPixelEllipse(ctx, x + 16, y + 16, Math.max(3, r - 3), Math.max(2, r - 3), '#c4f8ff');
  });

  // 4. PICKUPS (RAD, BIG RAD, AMMO, MEDKIT, CASINGS)
  b.addSprite('sprRad', 10, 10, 5, 5, 4, (ctx, x, y, _w, _h, f) => {
    const cx = x + 5;
    const cy = y + 5;
    fillPixelEllipse(ctx, cx, cy, 4, 4, '#0c3b16');
    fillPixelEllipse(ctx, cx, cy, 3, 3, '#25ba43');
    fillPixelEllipse(ctx, cx, cy, 2, 2, f % 2 === 0 ? '#6eff78' : '#a8ffad');
    px(ctx, cx - 1 + (f % 2), cy - 1, '#ffffff');
  });

  b.addSprite('sprRadBig', 14, 14, 7, 7, 4, (ctx, x, y, _w, _h, f) => {
    const cx = x + 7;
    const cy = y + 7;
    fillPixelEllipse(ctx, cx, cy, 6, 6, '#0c3b16');
    fillPixelEllipse(ctx, cx, cy, 5, 5, '#1ca638');
    fillPixelEllipse(ctx, cx, cy, 4, 4, '#59ff6a');
    fillPixelEllipse(ctx, cx, cy, 2, 2, f % 2 === 0 ? '#c4ffc9' : '#ffffff');
    px(ctx, cx - 2, cy - 2, '#ffffff');
    px(ctx, cx + 2, cy + 2, '#247a32');
  });
  b.addAlias('sprBigRad', 'sprRadBig');

  b.addSprite('sprAmmo', 12, 10, 6, 5, 2, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 1, y + 1, 10, 8, '#c99326', INK, true);
    rect(ctx, x + 2, y + 2, 8, 2, '#ffe066');
    rect(ctx, x + 2, y + 6, 8, 2, '#8c5e14');
    rect(ctx, x + 5, y + 3, 2, 4, '#fff7cc');
    px(ctx, x + 5 + f, y + 2, '#ffffff');
  });

  b.addSprite('sprHP', 12, 10, 6, 5, 2, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 1, y + 1, 10, 8, '#f0edf5', INK, true);
    rect(ctx, x + 2, y + 7, 8, 1, '#b8b2c4');
    rect(ctx, x + 5, y + 2, 2, 6, '#e62438');
    rect(ctx, x + 3, y + 4, 6, 2, '#e62438');
    if (f === 1) {
      px(ctx, x + 5, y + 3, '#ff808e');
    }
  });
  b.addAlias('sprMedkit', 'sprHP');

  b.addSprite('sprRogueAmmo', 10, 12, 5, 6, 2, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 2, y + 1, 6, 10, '#2c64c7', INK, true);
    rect(ctx, x + 3, y + 2, 4, 2, '#9cf5ff');
    rect(ctx, x + 3, y + 5, 4, 3, f === 0 ? '#4da6ff' : '#80ecff');
    px(ctx, x + 4, y + 3, '#ffffff');
  });

  b.addSprite('sprBulletShell', 4, 3, 2, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 4, 3, INK);
    rect(ctx, x + 1, y + 1, 2, 1, '#f5cc47');
  });

  b.addSprite('sprShotShell', 5, 3, 2, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 5, 3, INK);
    rect(ctx, x + 1, y + 1, 2, 1, '#e63229');
    px(ctx, x + 3, y + 1, '#f5cc47');
  });

  // 5. DETAILED CHESTS (WEAPON, BIG, AMMO, RAD, IDPD, GOLD, CURSED, HEALTH, PROTO)
  const drawCrateChest = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    body: string,
    hi: string,
    dark: string,
    trim: string,
    open: boolean,
    strapColor = '#3b3742',
    lockColor = '#ffe880',
  ): void => {
    if (open) {
      outlinedBox(ctx, x + 1, y + 1, w - 2, 5, dark, INK);
      rect(ctx, x + 2, y + 2, w - 4, 1, trim);
      outlinedBox(ctx, x + 1, y + 5, w - 2, h - 6, body, INK);
      rect(ctx, x + 3, y + 6, w - 6, 4, '#100c14');
      rect(ctx, x + 2, y + h - 4, w - 4, 2, dark);
      rect(ctx, x + Math.floor(w / 2) - 1, y + 9, 3, 2, trim);
      return;
    }
    outlinedBox(ctx, x + 1, y + 2, w - 2, h - 3, body, INK, true);
    rect(ctx, x + 2, y + 3, w - 4, 3, hi);
    rect(ctx, x + 2, y + h - 4, w - 4, 2, dark);
    rect(ctx, x + 4, y + 2, 2, h - 3, strapColor);
    rect(ctx, x + w - 6, y + 2, 2, h - 3, strapColor);
    rect(ctx, x + 2, y + Math.floor(h / 2), w - 4, 2, trim);
    outlinedBox(ctx, x + Math.floor(w / 2) - 2, y + Math.floor(h / 2) - 1, 5, 4, lockColor, INK);
    px(ctx, x + Math.floor(w / 2) - 1, y + Math.floor(h / 2), '#ffffff');
  };

  b.addSprite('sprWeaponChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#bf3035', '#f0595e', '#75191d', '#f5c444', false),
  );
  b.addSprite('sprWeaponChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#8c2226', '#bf3035', '#521114', '#a8842a', true),
  );
  b.addSprite('sprWeaponChestBig', 24, 18, 12, 9, 1, (ctx, x, y, w, h) => {
    drawCrateChest(ctx, x, y, w, h, '#cc2b33', '#ff5c64', '#7a151b', '#ffdc52', false);
    rect(ctx, x + 9, y + 4, 6, 2, '#fff099');
  });
  b.addSprite('sprWeaponChestBigOpen', 24, 18, 12, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#8c1e24', '#bd2d34', '#4f0f13', '#b39030', true),
  );
  b.addSprite('sprAmmoChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#c99326', '#f5cc4f', '#7d5612', '#fff0a6', false),
  );
  b.addSprite('sprAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#876017', '#b88521', '#4f3509', '#b59d4a', true),
  );
  b.addSprite('sprIDPDChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#2c5cb8', '#5491f5', '#183470', '#8cf0ff', false),
  );
  b.addAlias('sprRogueAmmoChest', 'sprIDPDChest');
  b.addSprite('sprRogueAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#1d3d7d', '#3364bd', '#11234a', '#529cc4', true),
  );

  // Authentic specialty chests: Gold (Y.V. Mansion), Cursed (Cursed Caves), Health, Proto (Vault)
  b.addSprite('sprGoldChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) => {
    drawCrateChest(ctx, x, y, w, h, '#e8b52c', '#fff08a', '#8f6011', '#fff8bd', false, '#ad7818', '#ff3b5c');
    rect(ctx, x + 3, y + 3, 3, 1, '#ffffff');
    px(ctx, x + 4, y + 2, '#ffffff');
  });
  b.addSprite('sprGoldChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#b8881e', '#e8b52c', '#6e470c', '#d9b54a', true, '#7d5611', '#bf2640'),
  );

  b.addSprite('sprCursedChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) => {
    drawCrateChest(ctx, x, y, w, h, '#5b2285', '#9c4fd6', '#2e0d47', '#ff59d6', false, '#1f1429', '#ff70e8');
    // Subtle dark curse wisps curling above lid
    px(ctx, x + 3, y + 1, '#cf52d6');
    px(ctx, x + 14, y + 1, '#cf52d6');
    px(ctx, x + 8, y + 4, '#ffffff');
  });
  b.addSprite('sprCursedChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#3d1659', '#6e2ea3', '#1e082e', '#a8388d', true, '#190f21', '#a8388d'),
  );

  b.addSprite('sprHealthChest', 18, 16, 9, 8, 1, (ctx, x, y, w, h) => {
    outlinedBox(ctx, x + 1, y + 2, w - 2, h - 3, '#e8e4ed', INK, true);
    rect(ctx, x + 2, y + 3, w - 4, 3, '#ffffff');
    rect(ctx, x + 2, y + h - 4, w - 4, 2, '#a39eb0');
    rect(ctx, x + 3, y + 2, 2, h - 3, '#5c6678');
    rect(ctx, x + w - 5, y + 2, 2, h - 3, '#5c6678');
    // Bold crimson medical cross emblem
    rect(ctx, x + 8, y + 5, 2, 6, '#e62438');
    rect(ctx, x + 6, y + 7, 6, 2, '#e62438');
    px(ctx, x + 8, y + 6, '#ff8592');
  });
  b.addSprite('sprHealthChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#b5b0bf', '#dbd7e3', '#706a7d', '#e62438', true),
  );

  b.addSprite('sprProtoChest', 20, 18, 10, 9, 1, (ctx, x, y, w, h) => {
    drawCrateChest(ctx, x, y, w, h, '#4f5a6e', '#7e8da8', '#2a3140', '#d4ad46', false, '#242b38', '#4df080');
    rect(ctx, x + 9, y + 8, 2, 2, '#c7ffd8');
    px(ctx, x + 9, y + 8, '#ffffff');
  });
  b.addSprite('sprProtoChestOpen', 20, 18, 10, 9, 1, (ctx, x, y, w, h) =>
    drawCrateChest(ctx, x, y, w, h, '#38404f', '#5a667d', '#1f242e', '#997a2d', true, '#1a2029', '#2ea855'),
  );

  // Pressurized glowing Rad Canister (Idle / Hurt / Dead)
  const drawRadCanister = (ctx: DrawCtx, x: number, y: number, f: number, state: 'idle' | 'hurt' | 'dead'): void => {
    if (state === 'dead') {
      fillPixelEllipse(ctx, x + 9, y + 15, 7, 3, '#228c35');
      fillPixelEllipse(ctx, x + 9, y + 15, 4, 2, '#6eff78');
      outlinedBox(ctx, x + 3, y + 10, 12, 7, '#4f5963', INK);
      rect(ctx, x + 5, y + 8, 3, 3, '#88d49c');
      rect(ctx, x + 11, y + 9, 2, 2, '#88d49c');
      return;
    }
    const isHurt = state === 'hurt';
    outlinedBox(ctx, x + 3, y + 2, 12, 4, isHurt ? '#ffffff' : '#6c7785', INK);
    if (!isHurt) rect(ctx, x + 4, y + 3, 10, 1, '#b5c2d1');
    outlinedBox(ctx, x + 3, y + 14, 12, 4, isHurt ? '#ffffff' : '#525c69', INK);
    outlinedBox(ctx, x + 4, y + 5, 10, 10, isHurt ? '#ffffff' : '#24b53e', INK);
    if (!isHurt) {
      rect(ctx, x + 6, y + 6, 6, 8, '#5eff70');
      rect(ctx, x + 5, y + 6, 2, 7, '#c4ffc9');
      px(ctx, x + 8, y + 8 - (f & 1), '#ffffff');
      px(ctx, x + 11, y + 11 + (f & 1), '#d6ffda');
      rect(ctx, x + 4, y + 9, 10, 1, '#3b434d');
    }
  };
  b.addSprite('sprRadChest', 18, 20, 9, 10, 2, (ctx, x, y, _w, _h, f) => drawRadCanister(ctx, x, y, f, 'idle'));
  b.addSprite('sprRadChestHurt', 18, 20, 9, 10, 1, (ctx, x, y) => drawRadCanister(ctx, x, y, 0, 'hurt'));
  b.addSprite('sprRadChestDead', 18, 20, 9, 10, 1, (ctx, x, y) => drawRadCanister(ctx, x, y, 0, 'dead'));

  // 6. CARS (SCRAPYARD, FROZEN, VENUS GOLDEN, VENUS FIXED, HURT, DEAD)
  const drawCar = (
    ctx: DrawCtx,
    x: number,
    y: number,
    body: string,
    hi: string,
    dark: string,
    glass: string,
    dead = false,
    hurt = false,
  ): void => {
    if (dead) {
      outlinedBox(ctx, x + 2, y + 5, 24, 10, '#2e292d', INK, true);
      rect(ctx, x + 5, y + 7, 16, 5, '#1a161a');
      rect(ctx, x + 8, y + 8, 5, 3, '#543228');
      px(ctx, x + 19, y + 7, '#ff6b26');
      return;
    }
    const cBody = hurt ? '#ffffff' : body;
    const cHi = hurt ? '#ffffff' : hi;
    const cDark = hurt ? '#ffcccc' : dark;
    const cGlass = hurt ? '#ffffff' : glass;
    rect(ctx, x + 4, y + 2, 5, 2, INK);
    rect(ctx, x + 19, y + 2, 5, 2, INK);
    rect(ctx, x + 4, y + 14, 5, 2, INK);
    rect(ctx, x + 19, y + 14, 5, 2, INK);
    outlinedBox(ctx, x + 1, y + 3, 26, 12, cBody, INK, true);
    rect(ctx, x + 2, y + 4, 24, 2, cHi);
    rect(ctx, x + 2, y + 12, 24, 2, cDark);
    outlinedBox(ctx, x + 7, y + 4, 13, 10, cGlass, INK);
    if (!hurt) px(ctx, x + 8, y + 5, '#ffffff');
    rect(ctx, x + 10, y + 5, 7, 8, cBody);
    rect(ctx, x + 11, y + 6, 5, 2, cHi);
    rect(ctx, x + 25, y + 5, 2, 2, '#ffe880');
    rect(ctx, x + 25, y + 11, 2, 2, '#ffe880');
    rect(ctx, x + 1, y + 5, 2, 2, '#d93838');
    rect(ctx, x + 1, y + 11, 2, 2, '#d93838');
  };

  b.addSprite('sprCarIdle', 28, 18, 14, 9, 1, (ctx, x, y) =>
    drawCar(ctx, x, y, '#b55635', '#e38057', '#75311c', '#80bddb'),
  );
  b.addAlias('sprCar', 'sprCarIdle');
  b.addSprite('sprCarHurt', 28, 18, 14, 9, 1, (ctx, x, y) =>
    drawCar(ctx, x, y, '#ffffff', '#ffffff', '#ffdddd', '#ffffff', false, true),
  );
  b.addSprite('sprCarDead', 28, 18, 14, 9, 1, (ctx, x, y) =>
    drawCar(ctx, x, y, '#332c2b', '#443d3b', '#1c1818', '#222222', true),
  );
  b.addSprite('sprFrozenCar', 28, 18, 14, 9, 1, (ctx, x, y) => {
    drawCar(ctx, x, y, '#5982a6', '#a8d6f5', '#345270', '#d6f2ff');
    rect(ctx, x + 3, y + 4, 5, 3, '#edf8ff');
    rect(ctx, x + 11, y + 5, 6, 4, '#edf8ff');
    px(ctx, x + 4, y + 4, '#ffffff');
  });
  b.addSprite('sprVenusCar', 28, 18, 14, 9, 1, (ctx, x, y) =>
    drawCar(ctx, x, y, '#d9a42e', '#fae278', '#8c5e12', '#2d1e38'),
  );
  b.addSprite('sprVenusCarFixed', 28, 18, 14, 9, 2, (ctx, x, y, _w, _h, f) => {
    drawCar(ctx, x, y, '#f5c736', '#fff8ad', '#a87214', '#4d2b66');
    // Polished golden sheen + gleaming headlights & sparkle star
    rect(ctx, x + 25, y + 4, 2, 3, '#ffffff');
    rect(ctx, x + 25, y + 11, 2, 3, '#ffffff');
    const sx = f === 0 ? 12 : 20;
    const sy = f === 0 ? 6 : 11;
    rect(ctx, x + sx - 1, y + sy, 3, 1, '#ffffff');
    rect(ctx, x + sx, y + sy - 1, 1, 3, '#ffffff');
  });

  // 7. BARRELS, CACTI, BONES, RICH 2.5D PILLARS, ANCIENT PROTO STATUE, GENERATORS
  b.addSprite('sprBarrel', 14, 16, 7, 8, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 1, 10, 14, '#bd332b', INK, true);
    rect(ctx, x + 3, y + 2, 8, 2, '#f06359');
    rect(ctx, x + 3, y + 6, 8, 4, '#f5c742');
    rect(ctx, x + 3, y + 5, 8, 1, '#5c1915');
    rect(ctx, x + 3, y + 10, 8, 1, '#5c1915');
    rect(ctx, x + 3, y + 12, 8, 2, '#7d1e19');
    rect(ctx, x + 4, y + 3, 1, 10, '#ffa8a1');
  });

  b.addSprite('sprToxicBarrel', 14, 16, 7, 8, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 1, 10, 14, '#2d7a36', INK, true);
    rect(ctx, x + 3, y + 2, 8, 2, '#63eb6d');
    rect(ctx, x + 3, y + 6, 8, 4, '#bfff4d');
    rect(ctx, x + 5, y + 7, 4, 2, '#1c4f22');
    rect(ctx, x + 3, y + 12, 8, 2, '#1c4d22');
    rect(ctx, x + 8, y + 2, 2, 4, '#8cff52');
    px(ctx, x + 8, y + 2, '#ffffff');
  });

  b.addSprite('sprOasisBarrel', 14, 16, 7, 8, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 1, 10, 14, '#2f7578', INK, true);
    rect(ctx, x + 3, y + 2, 8, 2, '#5cb5b8');
    rect(ctx, x + 3, y + 6, 8, 3, '#a6874b');
    rect(ctx, x + 3, y + 12, 8, 2, '#1c474a');
    // Barnacles & tiny coral tuft
    rect(ctx, x + 9, y + 3, 2, 2, '#f0786c');
    px(ctx, x + 4, y + 10, '#d9e3cc');
    px(ctx, x + 5, y + 11, '#a8b89e');
  });

  const cactusPalette: Record<string, string> = {
    '1': '#1f5929',
    '2': '#389444',
    '3': '#6ed169',
    '4': '#ff6ba8',
    '5': '#ffe666',
  };
  b.addSprite('sprCactus', 16, 18, 8, 10, 1, (ctx, x, y) => {
    drawPixelGrid(
      ctx, x + 2, y + 2,
      [
        '....45......',
        '....232.....',
        '....231.....',
        '.23.231..23.',
        '.23.231..23.',
        '.232231..21.',
        '..11231221..',
        '....23111...',
        '....231.....',
        '....231.....',
        '....231.....',
        '....231.....',
        '...12311....',
      ],
      cactusPalette, 1, INK,
    );
  });
  b.addSprite('sprCactus2', 16, 18, 8, 10, 1, (ctx, x, y) => {
    drawPixelGrid(
      ctx, x + 2, y + 3,
      [
        '.....23.....',
        '....2321....',
        '.23.2321....',
        '.2322321.23.',
        '..112321221.',
        '....232111..',
        '....2321....',
        '....2321....',
        '....2321....',
        '...123211...',
      ],
      cactusPalette, 1, INK,
    );
  });
  b.addSprite('sprCactus3', 16, 18, 8, 10, 1, (ctx, x, y) => {
    drawPixelGrid(
      ctx, x + 3, y + 5,
      [
        '...454....',
        '..23321...',
        '.2323221..',
        '.2323221..',
        '.2323221..',
        '..12321...',
        '..12321...',
        '..11111...',
      ],
      cactusPalette, 1, INK,
    );
  });

  b.addSprite('sprBonePileIdle', 16, 14, 8, 7, 1, (ctx, x, y) => {
    drawPixelGrid(
      ctx, x + 2, y + 2,
      [
        '....222.....',
        '...23332....',
        '...21212....',
        '....222.....',
        '.22.111.22..',
        '23222222232.',
        '.112121211..',
        '..2211122...',
      ],
      { '1': '#948675', '2': '#d9ceb8', '3': '#fff8e8' },
      1, INK,
    );
  });
  b.addAlias('sprBones', 'sprBonePileIdle');

  // Upgraded rich 2.5D shaded fluted columns with beveled top caps & cast drop shadows!
  b.addSprite('sprPillar', 18, 28, 9, 18, 1, (ctx, x, y) => {
    // Grounded cast drop shadow
    fillPixelEllipse(ctx, x + 9, y + 25, 8, 3, 'rgba(10, 8, 16, 0.52)');
    // Stepped beveled plinth base
    outlinedBox(ctx, x + 2, y + 21, 14, 5, '#554f61', INK);
    rect(ctx, x + 3, y + 22, 12, 1, '#9c94ad');
    rect(ctx, x + 3, y + 24, 12, 1, '#363140');
    // Cylindrical shaded fluted shaft (left highlight -> center mid -> recessed dark flutes -> right bounce)
    outlinedBox(ctx, x + 3, y + 7, 12, 15, '#686175', INK);
    rect(ctx, x + 4, y + 8, 3, 13, '#9d95ad');
    rect(ctx, x + 5, y + 8, 1, 13, '#c9c1d9');
    rect(ctx, x + 7, y + 8, 1, 13, '#474152');
    rect(ctx, x + 8, y + 8, 2, 13, '#7d758c');
    rect(ctx, x + 10, y + 8, 2, 13, '#433d4f');
    rect(ctx, x + 12, y + 8, 2, 13, '#575066');
    // Shadow cast by overhanging capital onto shaft top
    rect(ctx, x + 4, y + 8, 10, 2, '#342f3d');
    // Subtle weathered stone crack across shaft
    rect(ctx, x + 7, y + 14, 3, 1, '#2d2836');
    px(ctx, x + 10, y + 15, '#2d2836');
    // Overhanging 2.5D beveled top capital (top sunlit face + carved front frieze)
    outlinedBox(ctx, x + 1, y + 1, 16, 7, '#7c748a', INK, true);
    rect(ctx, x + 2, y + 2, 14, 3, '#b8b0c9');
    rect(ctx, x + 3, y + 2, 10, 1, '#dfd9eb');
    rect(ctx, x + 2, y + 5, 14, 2, '#4d4659');
    rect(ctx, x + 3, y + 5, 4, 1, '#9c94ad');
  });

  b.addSprite('sprPalacePillar', 18, 28, 9, 18, 1, (ctx, x, y) => {
    // Grounded cast drop shadow
    fillPixelEllipse(ctx, x + 9, y + 25, 8, 3, 'rgba(8, 6, 16, 0.56)');
    // Stepped gilded royal indigo plinth
    outlinedBox(ctx, x + 2, y + 21, 14, 5, '#2b3459', INK);
    rect(ctx, x + 3, y + 22, 12, 1, '#d9b24c');
    rect(ctx, x + 4, y + 22, 5, 1, '#fff099');
    rect(ctx, x + 3, y + 24, 12, 1, '#171c33');
    // Fluted royal indigo shaft with recessed glowing emerald energy vein
    outlinedBox(ctx, x + 3, y + 7, 12, 15, '#283154', INK);
    rect(ctx, x + 4, y + 8, 2, 13, '#4c5d91');
    rect(ctx, x + 6, y + 8, 1, 13, '#1a2038');
    rect(ctx, x + 7, y + 9, 4, 11, '#141a2e');
    rect(ctx, x + 8, y + 10, 2, 9, '#3be066');
    rect(ctx, x + 8, y + 11, 1, 7, '#b5ffc9');
    px(ctx, x + 8, y + 12, '#ffffff');
    rect(ctx, x + 11, y + 8, 1, 13, '#181e36');
    rect(ctx, x + 12, y + 8, 2, 13, '#384673');
    // Overhanging 2.5D beveled gilded capital
    outlinedBox(ctx, x + 1, y + 1, 16, 7, '#34416e', INK, true);
    rect(ctx, x + 2, y + 2, 14, 2, '#5b6fa8');
    rect(ctx, x + 3, y + 2, 9, 1, '#8ca2de');
    rect(ctx, x + 2, y + 4, 14, 2, '#d9b24c');
    rect(ctx, x + 3, y + 4, 6, 1, '#fff2a6');
    rect(ctx, x + 2, y + 6, 14, 1, '#1a2038');
  });
  b.addAlias('sprNuclearPillar', 'sprPalacePillar');

  // Ancient carved emerald-rune monolith Proto Statue (replaces retro Macintosh/ATM!)
  const drawProtoStatue = (ctx: DrawCtx, x: number, y: number, f: number, charged: boolean): void => {
    const cx = x + 12;
    const pulse = (f & 1) === 0;
    const runeMain = charged ? (pulse ? '#7dff9e' : '#40e86c') : (pulse ? '#389968' : '#2b7852');
    const runeCore = charged ? '#ffffff' : '#8cffc2';

    // Cast stone dais drop shadow
    fillPixelEllipse(ctx, cx, y + 29, 10, 3, 'rgba(8, 10, 16, 0.55)');
    // Stepped ancient carved stone dais base
    outlinedTrapezoid(ctx, cx, y + 23, 18, 22, 6, '#3c4352', INK);
    rect(ctx, x + 3, y + 24, 18, 2, '#6c778f');
    rect(ctx, x + 2, y + 27, 20, 2, '#272c38');
    // Subtle carved stone shoulder wings flanking monolith
    outlinedTrapezoid(ctx, cx - 7, y + 11, 3, 5, 13, '#485063', INK);
    outlinedTrapezoid(ctx, cx + 7, y + 11, 3, 5, 13, '#3b4252', INK);
    // Tall tapered weathered monolith body
    outlinedTrapezoid(ctx, cx, y + 5, 10, 16, 19, '#555e73', INK);
    fillTrapezoid(ctx, cx - 3, y + 6, 4, 6, 17, '#7c87a1');
    fillTrapezoid(ctx, cx + 4, y + 7, 3, 5, 16, '#394052');
    // Sculpted ancient crowned spire apex
    outlinedTrapezoid(ctx, cx, y + 1, 4, 10, 5, '#6d7891', INK);
    rect(ctx, cx - 2, y + 2, 3, 2, '#a3afc9');
    // Carved weathered stone fissures
    px(ctx, cx - 5, y + 14, '#252a36');
    px(ctx, cx - 4, y + 15, '#252a36');
    px(ctx, cx + 5, y + 18, '#252a36');
    // Deep carved ancient emerald proto-rune obelisk channels (diamond crown + vertical rune spine + side chevrons)
    outlinedDiamond(ctx, cx, y + 9, 3, 3, runeMain, '#1b212e');
    px(ctx, cx, y + 9, runeCore);
    rect(ctx, cx - 1, y + 13, 2, 9, '#1b212e');
    rect(ctx, cx, y + 13, 1, 8, runeMain);
    rect(ctx, cx - 4, y + 15, 3, 1, runeMain);
    rect(ctx, cx + 2, y + 15, 3, 1, runeMain);
    rect(ctx, cx - 3, y + 19, 2, 1, runeMain);
    rect(ctx, cx + 2, y + 19, 2, 1, runeMain);
    if (charged) {
      // Blazing emerald energy sparks rising off charged monolith
      rect(ctx, cx - 1, y + 14, 2, 6, '#b8ffd0');
      px(ctx, cx, y + 15, '#ffffff');
      px(ctx, cx - 6 + (f % 3), y + 5 + (f & 1), '#8cffb0');
      px(ctx, cx + 6 - (f % 3), y + 8 - (f & 1), '#ffffff');
    }
  };
  b.addSprite('sprProtoStatueIdle', 24, 32, 12, 20, 4, (ctx, x, y, _w, _h, f) => drawProtoStatue(ctx, x, y, f, false));
  b.addAlias('sprProtoStatue', 'sprProtoStatueIdle');
  b.addSprite('sprProtoStatueCharge', 24, 32, 12, 20, 4, (ctx, x, y, _w, _h, f) => drawProtoStatue(ctx, x, y, f, true));

  // 8. ALL AUTHENTIC BIOME & SECRET PROPS (100% STEAM PARITY!)
  // 2-1 -> 2-? Pizza Sewers Manhole Entrance
  b.addSprite('sprPizzaEntrance', 24, 24, 12, 12, 2, (ctx, x, y, _w, _h, f) => {
    const cx = x + 12;
    const cy = y + 12;
    outlinedEllipse(ctx, cx, cy, 10, 9, '#4c545e', INK);
    fillPixelEllipse(ctx, cx, cy, 8, 7, f === 1 ? '#1a110e' : '#383f47');
    if (f === 0) {
      // Heavy cast-iron bolted manhole lid with tread bars & subtle warm glow through vents
      rect(ctx, cx - 6, cy - 3, 12, 2, '#6e7885');
      rect(ctx, cx - 6, cy + 1, 12, 2, '#6e7885');
      rect(ctx, cx - 4, cy - 5, 8, 1, '#8b96a6');
      rect(ctx, cx - 3, cy - 1, 2, 2, '#d97b38');
      rect(ctx, cx + 1, cy - 1, 2, 2, '#d97b38');
      px(ctx, cx - 7, cy, '#23282e');
      px(ctx, cx + 7, cy, '#23282e');
    } else {
      // Blown-open steaming warm brick passage down to Pizza Sewers
      fillPixelEllipse(ctx, cx, cy, 6, 5, '#4f271a');
      fillPixelEllipse(ctx, cx, cy + 1, 4, 3, '#c7682c');
      rect(ctx, cx - 2, cy, 4, 2, '#ffd478');
    }
  });

  // 5-1 -> 5-? Enchanted Ice Flower
  b.addSprite('sprIceFlowerIdle', 20, 22, 10, 14, 4, (ctx, x, y, _w, _h, f) => {
    const cx = x + 10;
    fillPixelEllipse(ctx, cx, y + 19, 7, 2, 'rgba(18, 34, 56, 0.45)');
    // Frosted emerald stem & splayed snow-tipped leaves
    outlinedBox(ctx, cx - 1, y + 11, 3, 8, '#2c7d63', INK);
    outlinedEllipse(ctx, cx - 5, y + 16, 4, 2, '#3ba682', INK);
    outlinedEllipse(ctx, cx + 5, y + 16, 4, 2, '#2c7d63', INK);
    px(ctx, cx - 6, y + 15, '#c4f5ff');
    // Layered icy crystalline lotus petals
    outlinedDiamond(ctx, cx - 5, y + 9, 4, 3, '#6bc8f5', INK);
    outlinedDiamond(ctx, cx + 5, y + 9, 4, 3, '#4fa9e0', INK);
    outlinedDiamond(ctx, cx, y + 6, 5, 5, '#8ee0ff', INK);
    fillDiamond(ctx, cx - 1, y + 5, 3, 3, '#d9f7ff');
    // Glowing golden-white frost core & floating shimmer mote
    fillPixelEllipse(ctx, cx, y + 8, 2, 2, f % 2 === 0 ? '#fff6a6' : '#ffffff');
    px(ctx, cx - 6 + f * 3, y + 3 + (f & 1), '#ffffff');
  });
  b.addAlias('sprIceFlower', 'sprIceFlowerIdle');

  // Crown Vault Pedestal
  b.addSprite('sprCrownPedIdle', 22, 26, 11, 16, 4, (ctx, x, y, _w, _h, f) => {
    const cx = x + 11;
    fillPixelEllipse(ctx, cx, y + 23, 9, 3, 'rgba(8, 10, 18, 0.52)');
    outlinedTrapezoid(ctx, cx, y + 17, 14, 18, 6, '#485163', INK);
    rect(ctx, x + 4, y + 18, 14, 1, '#8491ad');
    outlinedBox(ctx, x + 5, y + 10, 12, 9, '#5e687d', INK);
    rect(ctx, x + 6, y + 11, 4, 7, '#8d99b3');
    rect(ctx, x + 8, y + 13, 6, 3, '#252b38');
    rect(ctx, x + 9, y + 14, 4, 1, f % 2 === 0 ? '#5ef299' : '#b8ffd6');
    // Royal crimson cushion + softly floating crown sparkle above pedestal
    outlinedBox(ctx, x + 4, y + 8, 14, 4, '#992233', INK, true);
    rect(ctx, x + 5, y + 9, 12, 1, '#e8b846');
    const bob = f % 2 === 0 ? 0 : -1;
    outlinedTrapezoid(ctx, cx, y + 3 + bob, 8, 6, 4, '#f2c43d', INK);
    rect(ctx, cx - 3, y + 2 + bob, 1, 2, '#fff5a6');
    rect(ctx, cx, y + 1 + bob, 2, 3, '#fff5a6');
    rect(ctx, cx + 3, y + 2 + bob, 1, 2, '#f2c43d');
  });
  b.addAlias('sprCrownPed', 'sprCrownPedIdle');

  // Crystal Caves / Cursed Caves Crystal Props (sprCrystalProp + aliases + blue/green variants!)
  const drawCrystalCluster = (
    ctx: DrawCtx,
    x: number,
    y: number,
    base: string,
    hi: string,
    dark: string,
    spec: string,
  ): void => {
    const cx = x + 9;
    fillPixelEllipse(ctx, cx, y + 19, 7, 3, 'rgba(12, 6, 20, 0.5)');
    // Side angled crystal shards
    outlinedTrapezoid(ctx, cx - 5, y + 10, 2, 6, 10, dark, INK);
    fillTrapezoid(ctx, cx - 6, y + 11, 1, 3, 8, base);
    outlinedTrapezoid(ctx, cx + 5, y + 11, 2, 6, 9, dark, INK);
    fillTrapezoid(ctx, cx + 4, y + 12, 1, 3, 7, base);
    // Tall central beveled crystal spire
    outlinedTrapezoid(ctx, cx, y + 2, 2, 8, 17, base, INK);
    fillTrapezoid(ctx, cx - 2, y + 4, 1, 4, 14, hi);
    fillTrapezoid(ctx, cx + 2, y + 5, 1, 3, 13, dark);
    drawPixelLine(ctx, cx, y + 3, cx, y + 17, spec, 1);
    px(ctx, cx - 1, y + 6, '#ffffff');
    // Rocky mineral base
    outlinedEllipse(ctx, cx, y + 18, 6, 3, '#2d1c3d', INK);
  };
  b.addSprite('sprCrystalProp', 18, 22, 9, 14, 1, (ctx, x, y) =>
    drawCrystalCluster(ctx, x, y, '#b54be6', '#e89cff', '#641c8c', '#fff0ff'),
  );
  b.addAlias('sprCrystalProp1', 'sprCrystalProp');
  b.addSprite('sprCrystalProp2', 16, 20, 8, 13, 1, (ctx, x, y) =>
    drawCrystalCluster(ctx, x - 1, y - 1, '#c947c7', '#ff99f5', '#6e1973', '#ffffff'),
  );
  b.addSprite('sprCrystalProp3', 18, 22, 9, 14, 1, (ctx, x, y) =>
    drawCrystalCluster(ctx, x, y, '#9642db', '#d699ff', '#4f1882', '#f7e6ff'),
  );
  b.addSprite('sprCrystalPropBlue', 18, 22, 9, 14, 1, (ctx, x, y) =>
    drawCrystalCluster(ctx, x, y, '#3d99e6', '#9ee6ff', '#1b4f8c', '#ffffff'),
  );
  b.addSprite('sprCrystalPropGreen', 18, 22, 9, 14, 1, (ctx, x, y) =>
    drawCrystalCluster(ctx, x, y, '#35cc63', '#9effb0', '#166e34', '#ffffff'),
  );

  // Frozen City Props: Street Light, Hydrant, Soda Machine
  b.addSprite('sprStreetLight', 16, 34, 8, 28, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 8, y + 31, 5, 2, 'rgba(12, 18, 30, 0.5)');
    // Cast iron base & tall pole
    outlinedBox(ctx, x + 5, y + 26, 6, 5, '#435263', INK);
    rect(ctx, x + 6, y + 27, 2, 3, '#7e93ab');
    outlinedBox(ctx, x + 6, y + 7, 4, 20, '#364352', INK);
    rect(ctx, x + 7, y + 8, 1, 18, '#6e839c');
    // Glowing frosted lantern head with snow cap
    outlinedBox(ctx, x + 3, y + 2, 10, 7, '#2c3745', INK, true);
    rect(ctx, x + 5, y + 4, 6, 4, f === 0 ? '#ffe073' : '#fff2a6');
    rect(ctx, x + 6, y + 5, 4, 2, '#ffffff');
    // Little drifted snow cap on top of lamp hood
    rect(ctx, x + 4, y + 1, 8, 2, '#e6f4ff');
    rect(ctx, x + 5, y + 1, 5, 1, '#ffffff');
  });

  b.addSprite('sprHydrant', 14, 18, 7, 13, 1, (ctx, x, y) => {
    fillPixelEllipse(ctx, x + 7, y + 15, 5, 2, 'rgba(12, 18, 30, 0.45)');
    outlinedBox(ctx, x + 3, y + 13, 8, 3, '#7d1b24', INK);
    outlinedBox(ctx, x + 4, y + 5, 6, 9, '#cf2935', INK);
    rect(ctx, x + 5, y + 6, 2, 7, '#ff6b73');
    // Side bolted nozzles
    outlinedBox(ctx, x + 2, y + 7, 3, 3, '#a31e28', INK);
    outlinedBox(ctx, x + 9, y + 7, 3, 3, '#a31e28', INK);
    px(ctx, x + 3, y + 8, '#cfd8e3');
    px(ctx, x + 10, y + 8, '#cfd8e3');
    // Rounded dome top with snow cap
    outlinedBox(ctx, x + 4, y + 2, 6, 4, '#e6323e', INK, true);
    rect(ctx, x + 5, y + 2, 4, 2, '#ebf7ff');
    px(ctx, x + 6, y + 2, '#ffffff');
  });

  b.addSprite('sprSodaMachine', 20, 26, 10, 18, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 10, y + 23, 8, 3, 'rgba(12, 18, 30, 0.5)');
    outlinedBox(ctx, x + 2, y + 2, 16, 21, '#2b61a6', INK, true);
    rect(ctx, x + 3, y + 3, 14, 2, '#66a5ed');
    rect(ctx, x + 3, y + 20, 14, 2, '#193966');
    // Snow dusted top edge
    rect(ctx, x + 3, y + 1, 12, 2, '#e6f4ff');
    // Glowing backlit soda display window
    outlinedBox(ctx, x + 4, y + 5, 8, 10, f === 0 ? '#78e6ff' : '#a8f2ff', INK);
    rect(ctx, x + 5, y + 6, 6, 3, '#ff4757');
    rect(ctx, x + 5, y + 10, 6, 3, '#ffe047');
    px(ctx, x + 6, y + 6, '#ffffff');
    // Coin buttons & dispensing slot
    rect(ctx, x + 13, y + 6, 3, 6, '#1c283b');
    px(ctx, x + 14, y + 7, '#ff4757');
    px(ctx, x + 14, y + 9, '#59ff73');
    outlinedBox(ctx, x + 4, y + 16, 12, 4, '#141c29', INK);
  });

  // Y.V.'s Mansion Props: Money Pile & Golden Y.V. Statue
  b.addSprite('sprMoneyPile', 20, 16, 10, 10, 1, (ctx, x, y) => {
    fillPixelEllipse(ctx, x + 10, y + 13, 8, 3, 'rgba(18, 8, 14, 0.45)');
    // Stacked cash bundles
    outlinedBox(ctx, x + 2, y + 8, 9, 5, '#3b994c', INK);
    rect(ctx, x + 3, y + 9, 7, 2, '#78e082');
    rect(ctx, x + 6, y + 8, 2, 5, '#e8d89c');
    outlinedBox(ctx, x + 9, y + 7, 9, 6, '#2d823e', INK);
    rect(ctx, x + 10, y + 8, 7, 2, '#64cc70');
    rect(ctx, x + 13, y + 7, 2, 6, '#e8d89c');
    outlinedBox(ctx, x + 5, y + 4, 9, 5, '#47b058', INK);
    rect(ctx, x + 6, y + 5, 7, 2, '#96f29e');
    rect(ctx, x + 9, y + 4, 2, 5, '#fff0ad');
    // Gleaming scattered gold coins
    outlinedEllipse(ctx, x + 4, y + 12, 2, 1, '#f5c73d', INK);
    outlinedEllipse(ctx, x + 16, y + 12, 2, 1, '#f5c73d', INK);
    px(ctx, x + 16, y + 12, '#ffffff');
  });

  b.addSprite('sprYVStatue', 22, 30, 11, 20, 1, (ctx, x, y) => {
    const cx = x + 11;
    fillPixelEllipse(ctx, cx, y + 27, 9, 3, 'rgba(16, 8, 12, 0.5)');
    // Marble pedestal plinth
    outlinedBox(ctx, x + 3, y + 21, 16, 6, '#7a7285', INK);
    rect(ctx, x + 4, y + 22, 14, 2, '#c4bdd1');
    rect(ctx, x + 5, y + 24, 12, 2, '#4a4354');
    // Gleaming solid-gold 3D Y.V. pyramid statue
    for (let r = 0; r < 18; r++) {
      const half = Math.floor((r + 2) * 0.48);
      const py = y + 3 + r;
      rect(ctx, cx - half - 1, py, (half + 1) * 2 + 1, 1, INK);
      if (r >= 1 && r <= 16) {
        rect(ctx, cx - half, py, Math.max(1, half), 1, r < 8 ? '#fff299' : '#f2c238');
        rect(ctx, cx, py, half + 1, 1, r > 12 ? '#9c6812' : '#d49d20');
      }
    }
    px(ctx, cx, y + 4, '#ffffff');
    // Sculpted cyclops eye & chain band
    rect(ctx, cx - 3, y + 12, 7, 3, INK);
    rect(ctx, cx - 2, y + 13, 5, 1, '#fff8d4');
    px(ctx, cx, y + 13, INK);
    rect(ctx, cx - 5, y + 18, 11, 2, '#fff5a6');
  });

  // Labs Mutant Containment Tube
  b.addSprite('sprMutantTube', 18, 28, 9, 19, 4, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 9, y + 25, 7, 3, 'rgba(6, 14, 16, 0.52)');
    // Heavy steel base & top cap
    outlinedBox(ctx, x + 2, y + 20, 14, 6, '#435259', INK);
    rect(ctx, x + 3, y + 21, 12, 2, '#7e949e');
    outlinedBox(ctx, x + 2, y + 2, 14, 5, '#435259', INK);
    rect(ctx, x + 3, y + 3, 12, 2, '#8fa7b3');
    // Glowing green glass vat cylinder + silhouetted mutant floating inside
    outlinedBox(ctx, x + 3, y + 6, 12, 15, '#1d8c46', INK);
    rect(ctx, x + 4, y + 7, 10, 13, '#3ee06c');
    rect(ctx, x + 5, y + 7, 2, 13, '#b8ffd0');
    // Silhouetted suspended lab freak specimen
    const bob = f % 2;
    fillPixelEllipse(ctx, x + 9, y + 13 + bob, 3, 4, '#14592c');
    px(ctx, x + 8, y + 11 + bob, '#c9ff80');
    px(ctx, x + 10, y + 11 + bob, '#c9ff80');
    // Rising glass bubbles
    px(ctx, x + 6, y + 17 - f * 2, '#ffffff');
    px(ctx, x + 12, y + 10 + (f & 1) * 3, '#e0ffe8');
  });
  b.addAlias('sprTube', 'sprMutantTube');

  // Oasis Props: Reef Coral & Sunken Anchor
  b.addSprite('sprCoral', 18, 18, 9, 12, 1, (ctx, x, y) => {
    fillPixelEllipse(ctx, x + 9, y + 15, 7, 2, 'rgba(10, 32, 34, 0.48)');
    drawPixelGrid(
      ctx, x + 2, y + 2,
      [
        '..32....32..',
        '.321...321..',
        '.221.32221..',
        '..2132121.32',
        '..2221.21321',
        '...12122211.',
        '....22211...',
        '...12221....',
        '..1111111...',
      ],
      { '1': '#9c2d3e', '2': '#e85858', '3': '#ffad78' },
      1, INK,
    );
  });

  b.addSprite('sprAnchor', 20, 22, 10, 14, 1, (ctx, x, y) => {
    fillPixelEllipse(ctx, x + 10, y + 19, 8, 2, 'rgba(10, 28, 32, 0.5)');
    // Top iron ring
    outlinedEllipse(ctx, x + 10, y + 4, 3, 3, '#4c626e', INK);
    px(ctx, x + 10, y + 4, '#1b3b42');
    // Crossbar stock & heavy shank
    outlinedBox(ctx, x + 4, y + 7, 12, 3, '#526875', INK);
    rect(ctx, x + 5, y + 8, 10, 1, '#8faab8');
    outlinedBox(ctx, x + 8, y + 6, 4, 13, '#475b66', INK);
    rect(ctx, x + 9, y + 7, 1, 11, '#859fab');
    // Curved heavy flukes
    outlinedBox(ctx, x + 3, y + 15, 14, 4, '#3d4f59', INK, true);
    outlinedTrapezoid(ctx, x + 4, y + 12, 3, 4, 5, '#59707d', INK);
    outlinedTrapezoid(ctx, x + 16, y + 12, 3, 4, 5, '#59707d', INK);
    // Rust & barnacle specks
    px(ctx, x + 9, y + 12, '#a35d3a');
    px(ctx, x + 13, y + 16, '#c7d4b8');
  });

  // Pizza Sewers Prop: Pizza Box Stack
  b.addSprite('sprPizzaBox', 18, 14, 9, 8, 1, (ctx, x, y) => {
    fillPixelEllipse(ctx, x + 9, y + 12, 7, 2, 'rgba(16, 10, 8, 0.45)');
    // Bottom cardboard box
    outlinedBox(ctx, x + 2, y + 6, 14, 6, '#b88e58', INK);
    rect(ctx, x + 3, y + 7, 12, 2, '#e0b97e');
    // Slightly askew top pizza box with classic pizzeria emblem
    outlinedBox(ctx, x + 1, y + 2, 14, 6, '#d9b277', INK);
    rect(ctx, x + 2, y + 3, 12, 3, '#f5d9a4');
    rect(ctx, x + 5, y + 3, 6, 3, '#d9322b');
    rect(ctx, x + 6, y + 4, 4, 1, '#47b849');
    px(ctx, x + 8, y + 4, '#ffffff');
  });

  // Jungle Giant Exotic Flower Prop (sprBigFlowerIdle)
  b.addSprite('sprBigFlowerIdle', 22, 24, 11, 16, 2, (ctx, x, y, _w, _h, f) => {
    const cx = x + 11;
    fillPixelEllipse(ctx, cx, y + 21, 8, 3, 'rgba(8, 22, 10, 0.48)');
    outlinedTrapezoid(ctx, cx, y + 13, 4, 7, 8, '#2d7a36', INK);
    outlinedEllipse(ctx, cx - 6, y + 18, 4, 2, '#44ab48', INK);
    outlinedEllipse(ctx, cx + 6, y + 18, 4, 2, '#2d7a36', INK);
    // Lush layered tropical crimson-magenta petals
    outlinedEllipse(ctx, cx, y + 9, 8, 6, '#cc294c', INK);
    fillPixelEllipse(ctx, cx - 2, y + 7, 5, 3, '#ff6685');
    outlinedEllipse(ctx, cx, y + 9, 4, 3, '#ffd942', INK);
    px(ctx, cx - 1 + (f & 1), y + 8, '#ffffff');
    px(ctx, cx + 4, y + 6, '#ffe073');
    px(ctx, cx - 5, y + 10, '#ffe073');
  });

  // IDPD HQ Server Rack Prop (sprServer)
  b.addSprite('sprServer', 18, 28, 9, 19, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 9, y + 25, 7, 3, 'rgba(6, 10, 22, 0.55)');
    outlinedBox(ctx, x + 2, y + 2, 14, 23, '#2b3b5c', INK, true);
    rect(ctx, x + 3, y + 3, 12, 2, '#5e7cb5');
    rect(ctx, x + 3, y + 22, 12, 2, '#172136');
    // Horizontal server rack blades with blinking cobalt/cyan telemetry LEDs
    for (let bay = 0; bay < 4; bay++) {
      const by = y + 6 + bay * 4;
      rect(ctx, x + 4, by, 10, 3, '#141c2e');
      rect(ctx, x + 5, by + 1, 5, 1, '#394f78');
      const ledOn = ((bay + f) & 1) === 0;
      px(ctx, x + 11, by + 1, ledOn ? '#6ef2ff' : '#2a5a8a');
      px(ctx, x + 13, by + 1, bay === 0 ? '#ff4757' : '#59ff88');
    }
  });

  // 7-3 Defeated Sit-able Broken Krunked Throne Corpse (sprThroneCorpseIdle)
  b.addSprite('sprThroneCorpseIdle', 96, 88, 48, 44, 2, (ctx, x, y, _w, _h, f) => {
    const cx = x + 48;
    const cy = y + 44;
    const spark = (f & 1) === 0;
    // Heavy cast dais shadow + cracked obsidian platform
    fillPixelEllipse(ctx, cx, cy + 31, 43, 10, 'rgba(6, 8, 14, 0.6)');
    outlinedBox(ctx, cx - 44, cy + 20, 88, 17, '#151924', INK);
    outlinedBox(ctx, cx - 40, cy + 14, 80, 12, '#242b3d', INK);
    rect(ctx, cx - 36, cy + 26, 72, 2, '#9e7d34');
    // Ruined fractured side coolant pipes dripping faint emerald glow
    outlinedBox(ctx, cx - 42, cy - 6, 12, 26, '#2b3242', INK, true);
    outlinedBox(ctx, cx + 30, cy - 2, 12, 22, '#2b3242', INK, true);
    rect(ctx, cx - 39, cy + 4, 6, 14, '#1d6e35');
    rect(ctx, cx + 33, cy + 6, 6, 12, '#1d6e35');
    px(ctx, cx - 36, cy - 5, spark ? '#8cffad' : '#3be066');
    // Cracked monolith backrest with broken crown spires
    outlinedTrapezoid(ctx, cx, cy - 34, 46, 56, 50, '#252c40', INK);
    rect(ctx, cx - 22, cy - 32, 42, 3, '#434f70');
    rect(ctx, cx + 19, cy - 30, 5, 42, '#141826');
    // Shattered gilded apex crest
    outlinedTrapezoid(ctx, cx - 18, cy - 39, 3, 9, 7, '#3c4763', INK);
    outlinedTrapezoid(ctx, cx + 18, cy - 37, 3, 8, 5, '#343d57', INK);
    outlinedTrapezoid(ctx, cx, cy - 40, 5, 14, 8, '#b58f38', INK);
    // Deep diagonal battle fractures across monolith
    drawPixelLine(ctx, cx - 14, cy - 28, cx - 4, cy - 12, INK, 2);
    drawPixelLine(ctx, cx + 12, cy - 24, cx + 4, cy - 6, INK, 2);
    drawPixelLine(ctx, cx - 4, cy - 12, cx + 2, cy - 10, '#2fa853', 1);
    // Cracked armrests
    outlinedBox(ctx, cx - 34, cy - 2, 14, 22, '#38425e', INK, true);
    outlinedBox(ctx, cx + 20, cy - 2, 14, 22, '#38425e', INK, true);
    rect(ctx, cx - 32, cy - 1, 10, 2, '#b58f38');
    rect(ctx, cx + 22, cy - 1, 10, 2, '#b58f38');
    // Open inviting shadowed regal Throne seat in center + smoldering core ember
    outlinedBox(ctx, cx - 16, cy - 16, 32, 24, '#141824', INK, true);
    fillPixelEllipse(ctx, cx, cy - 8, 7, 7, '#144221');
    fillPixelEllipse(ctx, cx, cy - 8, 3, 3, spark ? '#5eff8a' : '#2db854');
    // Royal seat cushion ready to sit upon
    outlinedBox(ctx, cx - 15, cy + 4, 30, 13, '#465273', INK);
    rect(ctx, cx - 12, cy + 6, 24, 8, '#7a1c2a');
    rect(ctx, cx - 11, cy + 7, 22, 2, '#b02e40');
    rect(ctx, cx - 12, cy + 14, 24, 2, '#d4ab46');
  });
  b.addAlias('sprThroneCorpse', 'sprThroneCorpseIdle');

  const drawGenerator = (ctx: DrawCtx, x: number, y: number, f: number, state: 'idle' | 'hurt' | 'dead'): void => {
    if (state === 'dead') {
      outlinedBox(ctx, x + 3, y + 12, 18, 12, '#2d333d', INK, true);
      rect(ctx, x + 6, y + 14, 12, 6, '#15181f');
      rect(ctx, x + 9, y + 15, 4, 3, '#1f5e2c');
      return;
    }
    const hurt = state === 'hurt';
    outlinedBox(ctx, x + 4, y + 2, 16, 5, hurt ? '#ffffff' : '#455378', INK);
    rect(ctx, x + 5, y + 3, 14, 2, hurt ? '#ffffff' : '#e3b84b');
    outlinedBox(ctx, x + 3, y + 6, 18, 16, hurt ? '#ffffff' : '#2c3654', INK);
    outlinedBox(ctx, x + 7, y + 8, 10, 12, hurt ? '#ffffff' : (f % 2 === 0 ? '#3de05b' : '#7aff90'), INK);
    if (!hurt) {
      rect(ctx, x + 9, y + 9, 4, 10, '#ccffd1');
      px(ctx, x + 10, y + 10, '#ffffff');
      rect(ctx, x + 7, y + 13, 10, 2, '#1f2842');
      rect(ctx, x + 1, y + 9, 3, 10, '#d4a63d');
      rect(ctx, x + 20, y + 9, 3, 10, '#d4a63d');
    }
    outlinedBox(ctx, x + 2, y + 21, 20, 5, hurt ? '#ffffff' : '#3a4669', INK);
  };
  b.addSprite('sprBigGenerator', 24, 28, 12, 14, 2, (ctx, x, y, _w, _h, f) => drawGenerator(ctx, x, y, f, 'idle'));
  b.addSprite('sprBigGeneratorHurt', 24, 28, 12, 14, 1, (ctx, x, y) => drawGenerator(ctx, x, y, 0, 'hurt'));
  b.addSprite('sprBigGeneratorDead', 24, 28, 12, 14, 1, (ctx, x, y) => drawGenerator(ctx, x, y, 0, 'dead'));
  b.addAlias('sprThroneGenerator', 'sprBigGenerator');

  // Plant Snare & Tangle Seed
  b.addSprite('sprPlantSnare', 20, 20, 10, 10, 2, (ctx, x, y, _w, _h, f) => {
    const cx = x + 10;
    const cy = y + 10;
    fillPixelEllipse(ctx, cx, cy, 8, 6, '#153b18');
    fillPixelEllipse(ctx, cx, cy, 7, 5, '#2b8a36');
    fillPixelEllipse(ctx, cx, cy, 4, 3, '#183d1c');
    const shift = f & 1;
    rect(ctx, cx - 7, cy - 2 + shift, 3, 2, '#5ce05c');
    rect(ctx, cx + 5, cy + 1 - shift, 3, 2, '#5ce05c');
    rect(ctx, cx - 2, cy - 6, 4, 2, '#e63244');
    rect(ctx, cx - 2, cy + 4, 4, 2, '#e63244');
    px(ctx, cx, cy - 5, '#ffe047');
    px(ctx, cx, cy + 5, '#ffe047');
  });
  b.addAlias('sprTangle', 'sprPlantSnare');
  b.addSprite('sprTangleSeed', 10, 10, 5, 5, 2, (ctx, x, y, _w, _h, f) => {
    outlinedEllipse(ctx, x + 5, y + 5, 3, 3, '#38b546', INK);
    px(ctx, x + 4 + (f & 1), y + 4, '#c7ff8c');
  });

  // Floor blast scorch craters (multi-ring ash + charred pit + radial fissures)
  b.addSprite('sprScorch', 24, 20, 12, 10, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 12, y + 10, 11, 8, '#2b2226');
    fillPixelEllipse(ctx, x + 12, y + 10, 9, 6, '#1a1418');
    fillPixelEllipse(ctx, x + 12, y + 10, 5, 3, '#0b080a');
    rect(ctx, x + 1 + f, y + 9, 4, 1, '#140f12');
    rect(ctx, x + 19 - f, y + 9, 4, 1, '#140f12');
    rect(ctx, x + 11, y + 2 + f, 2, 3, '#140f12');
    rect(ctx, x + 11, y + 15 - f, 2, 3, '#140f12');
    px(ctx, x + 7 + f, y + 5, '#473c3f');
    px(ctx, x + 16 - f, y + 14, '#473c3f');
  });
  b.addSprite('sprScorchmark', 14, 12, 7, 6, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 7, y + 6, 6, 4, '#292024');
    fillPixelEllipse(ctx, x + 7, y + 6, 4, 3, '#171115');
    fillPixelEllipse(ctx, x + 7 + (f & 1), y + 6, 2, 1, '#0a0709');
  });
}
