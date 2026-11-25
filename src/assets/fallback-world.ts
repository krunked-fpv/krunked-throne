import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  drawPixelGrid,
  fillPixelEllipse,
  hash2d,
  outlinedBox,
  outlinedEllipse,
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
    floorBase: '#4f3f33', floorHi: '#665244', floorMid: '#423429', floorDark: '#30241c', floorCrack: '#241a15',
    accent: '#d96c32',
    wallTop: '#3d2f28', wallTopHi: '#5e4a3f', wallTopDark: '#261c18',
    wallBot: '#291f1b', wallBotHi: '#4a3930', wallBotDark: '#17110f', wallOut: '#120d10',
  },
  {
    code: 1, pattern: 'desert',
    floorBase: '#c9975c', floorHi: '#d9ac71', floorMid: '#ba884e', floorDark: '#996a38', floorCrack: '#6e4523',
    accent: '#ebd09a',
    wallTop: '#9c5636', wallTopHi: '#cf8258', wallTopDark: '#6b351f',
    wallBot: '#693622', wallBotHi: '#965236', wallBotDark: '#421e14', wallOut: '#21100c',
  },
  {
    code: 2, pattern: 'sewers',
    floorBase: '#486346', floorHi: '#63855e', floorMid: '#3a5239', floorDark: '#293b29', floorCrack: '#1b291c',
    accent: '#7ec454',
    wallTop: '#334d39', wallTopHi: '#567a5c', wallTopDark: '#213326',
    wallBot: '#1f3025', wallBotHi: '#38543f', wallBotDark: '#121d17', wallOut: '#0c140e',
  },
  {
    code: 3, pattern: 'scrapyard',
    floorBase: '#665a52', floorHi: '#85776c', floorMid: '#544943', floorDark: '#3d3430', floorCrack: '#2b2421',
    accent: '#c46a38',
    wallTop: '#7a4b38', wallTopHi: '#ad7257', wallTopDark: '#522e21',
    wallBot: '#4c2d22', wallBotHi: '#754736', wallBotDark: '#2e1a14', wallOut: '#1a100d',
  },
  {
    code: 4, pattern: 'caves',
    floorBase: '#432c59', floorHi: '#61417d', floorMid: '#342047', floorDark: '#241433', floorCrack: '#170b24',
    accent: '#e078ff',
    wallTop: '#783ea6', wallTopHi: '#bc78f2', wallTopDark: '#4d2270',
    wallBot: '#4a216b', wallBotHi: '#8042b0', wallBotDark: '#2b1142', wallOut: '#150821',
  },
  {
    code: 5, pattern: 'frozen',
    floorBase: '#9ec0db', floorHi: '#d4eafc', floorMid: '#84a7c4', floorDark: '#5e819e', floorCrack: '#3d5d78',
    accent: '#ffffff',
    wallTop: '#4c6785', wallTopHi: '#85aad0', wallTopDark: '#31465e',
    wallBot: '#2e4157', wallBotHi: '#4e6a8a', wallBotDark: '#1b2838', wallOut: '#101824',
  },
  {
    code: 6, pattern: 'labs',
    floorBase: '#436968', floorHi: '#5f8f8d', floorMid: '#355757', floorDark: '#233d3d', floorCrack: '#172929',
    accent: '#5eff87',
    wallTop: '#2e494d', wallTopHi: '#548287', wallTopDark: '#1c2f33',
    wallBot: '#1c2d30', wallBotHi: '#355257', wallBotDark: '#101c1f', wallOut: '#091214',
  },
  {
    code: 7, pattern: 'palace',
    floorBase: '#323a5e', floorHi: '#4f5e91', floorMid: '#262d4a', floorDark: '#191e33', floorCrack: '#111526',
    accent: '#f0c452',
    wallTop: '#262f52', wallTopHi: '#526399', wallTopDark: '#161b33',
    wallBot: '#181e36', wallBotHi: '#333f6b', wallBotDark: '#0d1121', wallOut: '#080a14',
  },
  {
    code: 100, pattern: 'vault',
    floorBase: '#57606e', floorHi: '#788496', floorMid: '#464e5c', floorDark: '#323842', floorCrack: '#22262e',
    accent: '#5ef0b5',
    wallTop: '#455166', wallTopHi: '#788bad', wallTopDark: '#2d3647',
    wallBot: '#2b3342', wallBotHi: '#4a5770', wallBotDark: '#181e29', wallOut: '#0f131a',
  },
  {
    code: 101, pattern: 'oasis',
    floorBase: '#387d75', floorHi: '#57ad9f', floorMid: '#2b6660', floorDark: '#1d4a45', floorCrack: '#123330',
    accent: '#a6fae3',
    wallTop: '#2a5a69', wallTopHi: '#5298ab', wallTopDark: '#1b3c47',
    wallBot: '#193942', wallBotHi: '#326370', wallBotDark: '#0e2329', wallOut: '#09171c',
  },
  {
    code: 102, pattern: 'pizza',
    floorBase: '#635341', floorHi: '#826e58', floorMid: '#4f4132', floorDark: '#382e23', floorCrack: '#261e17',
    accent: '#eb9147',
    wallTop: '#753f32', wallTopHi: '#ad6350', wallTopDark: '#4f281f',
    wallBot: '#4a251d', wallBotHi: '#753e32', wallBotDark: '#2b140f', wallOut: '#1a0c0a',
  },
  {
    code: 103, pattern: 'mansion',
    floorBase: '#753e4c', floorHi: '#9c5668', floorMid: '#5e2f3c', floorDark: '#421f29', floorCrack: '#2e141c',
    accent: '#ffdc6b',
    wallTop: '#b5903a', wallTopHi: '#f5d478', wallTopDark: '#806222',
    wallBot: '#755b20', wallBotHi: '#ad8836', wallBotDark: '#473611', wallOut: '#241a08',
  },
  {
    code: 104, pattern: 'cursed',
    floorBase: '#381d47', floorHi: '#572f6b', floorMid: '#2b1538', floorDark: '#1d0d26', floorCrack: '#13071a',
    accent: '#ff59c7',
    wallTop: '#96286e', wallTopHi: '#e667b7', wallTopDark: '#631647',
    wallBot: '#5c1743', wallBotHi: '#962c70', wallBotDark: '#360b27', wallOut: '#1c0515',
  },
  {
    code: 105, pattern: 'jungle',
    floorBase: '#385c35', floorHi: '#54854f', floorMid: '#2a4728', floorDark: '#1d331c', floorCrack: '#132412',
    accent: '#7ee858',
    wallTop: '#2b4a26', wallTopHi: '#528748', wallTopDark: '#1b3018',
    wallBot: '#192e16', wallBotHi: '#32572c', wallBotDark: '#0e1c0c', wallOut: '#091208',
  },
  {
    code: 106, pattern: 'hq',
    floorBase: '#35486b', floorHi: '#4f6a9c', floorMid: '#293854', floorDark: '#1c273d', floorCrack: '#131b2b',
    accent: '#73e8ff',
    wallTop: '#243554', wallTopHi: '#4e6fa8', wallTopDark: '#162238',
    wallBot: '#141f33', wallBotHi: '#2c426b', wallBotDark: '#0b1221', wallOut: '#070c17',
  },
  {
    code: 107, pattern: 'crib',
    floorBase: '#5c3c6b', floorHi: '#7e5491', floorMid: '#482d54', floorDark: '#331e3d', floorCrack: '#23132b',
    accent: '#ffdc6b',
    wallTop: '#42274f', wallTopHi: '#784b8c', wallTopDark: '#2b1736',
    wallBot: '#291733', wallBotHi: '#4d2d5e', wallBotDark: '#170c1f', wallOut: '#0f0714',
  },
];

function drawBiomeFloor(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  rect(ctx, x, y, w, h, t.floorBase);

  switch (t.pattern) {
    case 'desert': {
      // Calm warm wasteland sand with organic wind-swept patches, tiny pebbles & dry cracks
      // (restrained contrast so enemies, shadows, casings & bullets pop sharply!)
      const driftY = (frame * 4 + 2) % 12;
      rect(ctx, x + ((frame * 3) % 5), y + driftY, 9, 2, t.floorHi);
      rect(ctx, x + ((frame * 5 + 6) % 8), y + ((driftY + 7) % 14), 7, 2, t.floorMid);
      if (frame === 0) {
        rect(ctx, x + 3, y + 4, 4, 1, t.floorHi);
        rect(ctx, x + 10, y + 11, 2, 1, t.floorDark);
        px(ctx, x + 10, y + 10, t.accent);
      } else if (frame === 1) {
        rect(ctx, x + 9, y + 3, 5, 1, t.floorMid);
        rect(ctx, x + 2, y + 12, 3, 1, t.floorDark);
        px(ctx, x + 3, y + 11, t.floorHi);
      } else if (frame === 2) {
        // Subtle branching sun-baked desert crack
        rect(ctx, x + 3, y + 6, 3, 1, t.floorCrack);
        rect(ctx, x + 6, y + 7, 3, 1, t.floorCrack);
        rect(ctx, x + 9, y + 8, 2, 1, t.floorCrack);
        px(ctx, x + 7, y + 6, t.floorCrack);
        rect(ctx, x + 4, y + 5, 2, 1, t.floorHi);
      } else {
        // Bleached sandstone pebble cluster
        rect(ctx, x + 10, y + 10, 3, 2, t.floorDark);
        rect(ctx, x + 10, y + 9, 2, 1, t.accent);
        px(ctx, x + 4, y + 3, t.floorMid);
        px(ctx, x + 5, y + 4, t.floorDark);
      }
      break;
    }

    case 'sewers':
    case 'pizza': {
      // Damp mossy flagstones with beveled mortar seams, creeping moss & glistening water sheen!
      rect(ctx, x, y, w, 1, t.floorDark);
      rect(ctx, x, y + 8, w, 1, t.floorDark);
      rect(ctx, x + 7, y, 1, 8, t.floorDark);
      rect(ctx, x + 15, y, 1, 8, t.floorDark);
      rect(ctx, x + 3, y + 8, 1, 8, t.floorDark);
      rect(ctx, x + 11, y + 8, 1, 8, t.floorDark);
      // Flagstone bevel highlights & subtle cracks
      rect(ctx, x + 1, y + 1, 5, 1, t.floorHi);
      rect(ctx, x + 9, y + 1, 5, 1, t.floorHi);
      rect(ctx, x + 5, y + 9, 5, 1, t.floorHi);
      rect(ctx, x + 1, y + 7, 5, 1, t.floorMid);
      if (frame === 0) {
        // Creeping moss in mortar corners
        rect(ctx, x + 6, y + 7, 3, 2, t.accent);
        px(ctx, x + 7, y + 7, '#a8e678');
      } else if (frame === 1) {
        // Reflective sewer water puddle with bright specular sheen!
        rect(ctx, x + 3, y + 3, 8, 4, '#24473d');
        rect(ctx, x + 4, y + 4, 6, 2, '#3d7a69');
        rect(ctx, x + 5, y + 4, 3, 1, '#a6f0db');
        px(ctx, x + 6, y + 4, '#ffffff');
      } else if (frame === 2) {
        // Moss patch + hairline stone crack
        rect(ctx, x + 2, y + 11, 4, 2, t.accent);
        rect(ctx, x + 10, y + 3, 2, 1, t.floorCrack);
        px(ctx, x + 12, y + 4, t.floorCrack);
      } else {
        // Riveted iron sewer drainage grate
        rect(ctx, x + 3, y + 3, 10, 10, t.floorCrack);
        for (let gx = 4; gx <= 11; gx += 2) {
          rect(ctx, x + gx, y + 4, 1, 8, t.floorMid);
        }
        rect(ctx, x + 3, y + 3, 10, 1, t.floorHi);
        px(ctx, x + 4, y + 3, '#c4d4cc');
      }
      break;
    }

    case 'scrapyard': {
      // Bolted industrial steel deck plates with bright metallic bevel, recessed bolts & rust streaks!
      rect(ctx, x, y, w, 1, t.floorDark);
      rect(ctx, x, y, 1, h, t.floorDark);
      rect(ctx, x + 1, y + 1, w - 2, 1, t.floorHi);
      rect(ctx, x + 1, y + 1, 1, h - 2, t.floorHi);
      rect(ctx, x + 1, y + 15, w - 1, 1, t.floorCrack);
      // Corner hex bolts (dark socket + bright steel glint)
      for (const [bx, by] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) {
        px(ctx, x + bx, y + by, t.floorCrack);
        px(ctx, x + bx + 1, y + by, t.floorHi);
      }
      if (frame === 1 || frame === 3) {
        // Weathered orange-brown rust streaks bleeding across plate
        rect(ctx, x + 4, y + 4, 7, 3, t.accent);
        rect(ctx, x + 5, y + 7, 4, 3, '#964724');
        rect(ctx, x + 6, y + 5, 3, 2, t.floorDark);
        px(ctx, x + 11, y + 10, t.accent);
      } else {
        // Industrial diamond-plate tread ticks
        rect(ctx, x + 4, y + 4, 3, 1, t.floorHi);
        rect(ctx, x + 4, y + 5, 3, 1, t.floorMid);
        rect(ctx, x + 9, y + 7, 3, 1, t.floorHi);
        rect(ctx, x + 9, y + 8, 3, 1, t.floorMid);
        rect(ctx, x + 5, y + 11, 4, 1, t.floorMid);
      }
      break;
    }

    case 'caves':
    case 'cursed': {
      // Cavern stone slabs with recessed cracks & shimmering faceted crystal veins!
      rect(ctx, x + 1, y + 2, 6, 4, t.floorMid);
      rect(ctx, x + 8, y + 9, 6, 5, t.floorMid);
      rect(ctx, x, y + 14, w, 2, t.floorDark);
      rect(ctx, x + 2, y + 2, 4, 1, t.floorHi);
      if (frame === 1 || frame === 2) {
        // Faceted crystal vein with specular sparkle
        rect(ctx, x + 3, y + 6 + frame, 4, 2, t.accent);
        rect(ctx, x + 6, y + 7 + frame, 3, 2, t.accent);
        rect(ctx, x + 4, y + 6 + frame, 2, 1, '#f7d4ff');
        px(ctx, x + 5, y + 6 + frame, '#ffffff');
      } else {
        rect(ctx, x + 10, y + 3, 3, 2, t.accent);
        px(ctx, x + 11, y + 3, '#ffffff');
        rect(ctx, x + 3, y + 11, 3, 1, t.floorCrack);
      }
      break;
    }

    case 'frozen': {
      // Wind-swept snowdrifts, frosted ice veins & sparkling crystalline snow glints!
      rect(ctx, x, y + (frame * 3) % 12, w, 3, t.floorHi);
      rect(ctx, x + 2, y + ((frame * 5 + 6) % 13), 9, 2, t.floorMid);
      if (frame === 0 || frame === 1) {
        // Twinkling white snow sparkles
        px(ctx, x + 3 + frame * 5, y + 4, t.accent);
        px(ctx, x + 11 - frame * 3, y + 10, t.accent);
        rect(ctx, x + 6, y + 12, 5, 1, t.floorHi);
      } else if (frame === 2) {
        // Jagged blue-white ice fracture crack
        rect(ctx, x + 3, y + 3, 2, 1, t.floorDark);
        rect(ctx, x + 5, y + 4, 3, 1, t.floorDark);
        rect(ctx, x + 8, y + 5, 2, 2, t.floorDark);
        rect(ctx, x + 4, y + 3, 4, 1, t.accent);
      } else {
        // Sparkling frost glint cross + snowdrift shadow
        rect(ctx, x + 5, y + 5, 3, 1, t.accent);
        rect(ctx, x + 6, y + 4, 1, 3, t.accent);
        px(ctx, x + 12, y + 11, t.accent);
        rect(ctx, x + 1, y + 12, 12, 2, t.floorMid);
      }
      break;
    }

    case 'labs':
    case 'hq': {
      // Sterile metallic lab/HQ tile plating with beveled seams, bio-conduit & bold caution stripes!
      rect(ctx, x, y, w, 1, t.floorDark);
      rect(ctx, x, y, 1, h, t.floorDark);
      rect(ctx, x + 8, y, 1, h, t.floorMid);
      rect(ctx, x, y + 8, w, 1, t.floorMid);
      rect(ctx, x + 1, y + 1, 6, 1, t.floorHi);
      rect(ctx, x + 9, y + 9, 6, 1, t.floorHi);
      px(ctx, x + 2, y + 2, t.floorDark);
      px(ctx, x + 10, y + 10, t.floorDark);
      if (frame === 2) {
        // Glowing conduit strip / bio-sample seam
        rect(ctx, x + 2, y + 3, 5, 2, t.accent);
        rect(ctx, x + 3, y + 3, 3, 1, '#ffffff');
      } else if (frame === 3) {
        // High-visibility yellow/dark diagonal lab caution stripes along bottom edge!
        const stripeCol = t.pattern === 'labs' ? '#f2c738' : t.accent;
        rect(ctx, x + 1, y + 11, 14, 4, '#1b1d24');
        for (let sx = 2; sx <= 12; sx += 4) {
          rect(ctx, x + sx, y + 12, 2, 2, stripeCol);
          px(ctx, x + sx + 1, y + 11, stripeCol);
        }
      }
      break;
    }

    case 'palace':
    case 'mansion':
    case 'crib': {
      // Gold-inlaid obsidian checkerboard tiles + specular sheen + ornate crimson/gold carpet trim on palace variant 3!
      rect(ctx, x, y, 8, 8, t.floorBase);
      rect(ctx, x + 8, y + 8, 8, 8, t.floorBase);
      rect(ctx, x + 8, y, 8, 8, t.floorMid);
      rect(ctx, x, y + 8, 8, 8, t.floorMid);
      // Polished stone bevel highlights & deep obsidian grout
      rect(ctx, x + 1, y + 1, 6, 1, t.floorHi);
      rect(ctx, x + 9, y + 9, 6, 1, t.floorHi);
      rect(ctx, x, y + 7, 16, 1, t.floorDark);
      rect(ctx, x + 7, y, 1, 16, t.floorDark);
      if (frame === 3 && t.pattern === 'palace') {
        // Ornate royal crimson carpet trim medallion framed in gleaming gold inlay!
        rect(ctx, x + 2, y + 2, 12, 12, t.accent);
        rect(ctx, x + 3, y + 3, 10, 10, '#8f1928');
        rect(ctx, x + 4, y + 4, 8, 8, '#b82236');
        rect(ctx, x + 6, y + 6, 4, 4, t.accent);
        px(ctx, x + 7, y + 7, '#fff6b0');
      } else if (frame % 2 === 0) {
        // Center gold filigree diamond inlay with white glint
        px(ctx, x + 7, y + 5, t.accent);
        rect(ctx, x + 6, y + 6, 3, 3, t.accent);
        px(ctx, x + 7, y + 9, t.accent);
        px(ctx, x + 7, y + 6, '#fff6b0');
      } else {
        // Subtle gold corner studs & obsidian glint
        rect(ctx, x + 2, y + 2, 2, 1, t.floorHi);
        px(ctx, x + 13, y + 13, t.accent);
        rect(ctx, x + 10, y + 10, 2, 2, t.floorDark);
      }
      break;
    }

    case 'vault': {
      // Carved ancient slate stones with beveled rims, cracks & glowing emerald proto-runes
      rect(ctx, x, y, w, 1, t.floorDark);
      rect(ctx, x, y, 1, h, t.floorDark);
      rect(ctx, x + 1, y + 1, w - 2, 1, t.floorHi);
      rect(ctx, x + 2, y + 2, 12, 12, t.floorMid);
      if (frame === 1) {
        rect(ctx, x + 5, y + 5, 6, 1, t.accent);
        rect(ctx, x + 7, y + 6, 2, 5, t.accent);
        px(ctx, x + 7, y + 5, '#ffffff');
      } else if (frame === 2) {
        rect(ctx, x + 4, y + 4, 8, 8, t.floorBase);
        rect(ctx, x + 5, y + 9, 4, 1, t.floorCrack);
        px(ctx, x + 9, y + 10, t.floorCrack);
      } else {
        rect(ctx, x + 4, y + 4, 8, 8, t.floorBase);
        rect(ctx, x + 4, y + 4, 8, 1, t.floorHi);
      }
      break;
    }

    case 'oasis':
    case 'jungle': {
      // Shimmering water-rippled oasis or lush mossy jungle tiles
      rect(ctx, x + 1, y + 2 + (frame & 1), 6, 2, t.floorHi);
      rect(ctx, x + 8, y + 9 - (frame & 1), 6, 2, t.floorMid);
      rect(ctx, x + 3, y + 12, 5, 2, t.floorDark);
      if (frame === 1 || frame === 3) {
        rect(ctx, x + 5, y + 6, 3, 1, t.accent);
        px(ctx, x + 6, y + 6, t.pattern === 'oasis' ? '#ffffff' : t.floorHi);
      }
      break;
    }

    default: {
      // Campfire wasteland earth with grit, pebbles, hairline cracks & glowing ash flecks
      for (let i = 0; i < 6; i++) {
        const sx = hash2d(i, frame, 71) % 13;
        const sy = hash2d(frame, i, 97) % 13;
        rect(ctx, x + sx + 1, y + sy + 1, 2, 1, i % 2 === 0 ? t.floorMid : t.floorDark);
      }
      if (frame === 2) {
        rect(ctx, x + 4, y + 7, 4, 1, t.floorCrack);
        px(ctx, x + 8, y + 8, t.floorCrack);
        px(ctx, x + 11, y + 4, t.accent);
      } else {
        rect(ctx, x + 3, y + 3, 3, 2, t.floorHi);
        px(ctx, x + 3, y + 3, '#7d6857');
      }
      break;
    }
  }
}

function drawBiomeFloorExplo(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number, t: BiomeTheme): void {
  drawBiomeFloor(ctx, x, y, w, h, frame, t);
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
  // Cohesive seamless roof cap surface — outer 2.5D perimeter bevels & sunlit highlights
  // are applied dynamically by GameRenderer.renderWalls() using wallMask so adjacent walls
  // fuse into organic canyon/fortress silhouettes instead of a repeating 16x16 brick grid!
  rect(ctx, x, y, w, h, t.wallTop);

  if (t.pattern === 'scrapyard' || t.pattern === 'labs' || t.pattern === 'hq') {
    // Clean industrial deck roof plating with subtle recessed seams & rivets
    rect(ctx, x, y, w, 1, t.wallTopDark);
    rect(ctx, x, y, 1, h, t.wallTopDark);
    rect(ctx, x + 2, y + 2, 12, 12, t.wallTop);
    px(ctx, x + 2, y + 2, t.wallTopHi);
    px(ctx, x + 13, y + 2, t.wallTopHi);
    px(ctx, x + 2, y + 13, t.wallTopDark);
    px(ctx, x + 13, y + 13, t.wallTopDark);
    if (frame === 1) {
      rect(ctx, x + 4, y + 7, 7, 2, t.wallTopDark);
      rect(ctx, x + 5, y + 7, 5, 1, t.accent);
      px(ctx, x + 6, y + 7, '#ffffff');
    } else if (frame === 2) {
      rect(ctx, x + 3, y + 4, 10, 1, t.wallTopHi);
      rect(ctx, x + 3, y + 11, 10, 1, t.wallTopDark);
    } else if (frame === 3 && t.pattern === 'scrapyard') {
      rect(ctx, x + 4, y + 5, 6, 3, t.accent);
      rect(ctx, x + 6, y + 6, 3, 2, t.wallTopDark);
    }
  } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
    // Gilded obsidian palace roof cap with subtle inlay & recessed stone center
    rect(ctx, x + 2, y + 2, 12, 12, t.wallTopDark);
    rect(ctx, x + 3, y + 3, 10, 10, t.wallTop);
    rect(ctx, x + 3, y + 3, 10, 1, t.wallTopHi);
    if (frame % 2 === 0) {
      rect(ctx, x + 7, y + 7, 2, 2, t.accent);
      px(ctx, x + 7, y + 7, '#fff6b0');
    } else {
      rect(ctx, x + 4, y + 12, 8, 1, t.accent);
    }
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // Rough dark cavern rock with protruding faceted crystal clusters
    rect(ctx, x + 2, y + 2, 6, 5, t.wallTopDark);
    rect(ctx, x + 9, y + 8, 5, 5, t.wallTopDark);
    if (frame === 1 || frame === 3) {
      rect(ctx, x + 4 + (frame & 1), y + 4, 4, 5, t.wallTopHi);
      rect(ctx, x + 5 + (frame & 1), y + 5, 3, 3, t.accent);
      px(ctx, x + 5 + (frame & 1), y + 5, '#ffffff');
    } else {
      rect(ctx, x + 3, y + 3, 5, 2, t.wallTopHi);
      px(ctx, x + 11, y + 5, t.accent);
    }
  } else if (t.pattern === 'frozen') {
    // Wind-drifted snow-covered urban parapet with sparkling frost glints
    rect(ctx, x + 1, y + 1, 14, 7, '#cde6fa');
    rect(ctx, x + 2, y + 2, 10, 3, '#eef8ff');
    rect(ctx, x + 3, y + 10, 9, 3, t.wallTopDark);
    if (frame % 2 === 0) {
      px(ctx, x + 10, y + 3, '#ffffff');
      px(ctx, x + 4, y + 12, t.wallTopHi);
    }
  } else {
    // Organic weathered wasteland canyon/mesa rock cap (varied across 4 frames, zero waffle grid!)
    if (frame === 0) {
      rect(ctx, x + 2, y + 3, 7, 3, t.wallTopHi);
      rect(ctx, x + 3, y + 6, 6, 2, t.wallTopDark);
      rect(ctx, x + 10, y + 10, 4, 3, t.wallTopDark);
      px(ctx, x + 4, y + 3, t.accent);
    } else if (frame === 1) {
      // Sun-baked rock fracture & mesa ridge
      rect(ctx, x + 4, y + 4, 5, 1, t.wallTopDark);
      rect(ctx, x + 8, y + 5, 3, 1, t.wallTopDark);
      rect(ctx, x + 10, y + 6, 2, 2, t.wallTopDark);
      rect(ctx, x + 3, y + 10, 8, 2, t.wallTopHi);
      px(ctx, x + 5, y + 10, t.accent);
    } else if (frame === 2) {
      // Weathered strata ledge + dry crevice
      rect(ctx, x + 1, y + 7, 11, 2, t.wallTopDark);
      rect(ctx, x + 2, y + 5, 9, 2, t.wallTopHi);
      rect(ctx, x + 11, y + 3, 3, 2, t.wallTopDark);
      px(ctx, x + 12, y + 12, t.wallTopDark);
    } else {
      // Scattered canyon rubble flecks & shaded plateau pockets
      rect(ctx, x + 3, y + 2, 5, 2, t.wallTopDark);
      rect(ctx, x + 8, y + 8, 6, 3, t.wallTopHi);
      rect(ctx, x + 9, y + 11, 5, 2, t.wallTopDark);
      px(ctx, x + 10, y + 8, t.accent);
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
    // Ribbed steel bulkhead panels with bright bevels, corner bolts & rust/caution trim
    rect(ctx, x + 1, y + 3, 6, 10, t.wallBotHi);
    rect(ctx, x + 9, y + 3, 6, 10, t.wallBotHi);
    rect(ctx, x + 2, y + 4, 4, 8, t.wallBot);
    rect(ctx, x + 10, y + 4, 4, 8, t.wallBot);
    px(ctx, x + 2, y + 4, t.wallTopHi);
    px(ctx, x + 10, y + 4, t.wallTopHi);
    px(ctx, x + 5, y + 10, t.wallBotDark);
    px(ctx, x + 13, y + 10, t.wallBotDark);
    if (t.pattern === 'labs' && frame % 2 === 1) {
      rect(ctx, x + 1, y + 11, 14, 2, '#171a1f');
      rect(ctx, x + 2, y + 11, 2, 2, '#f2c738');
      rect(ctx, x + 6, y + 11, 2, 2, '#f2c738');
      rect(ctx, x + 10, y + 11, 2, 2, '#f2c738');
    } else if (t.pattern === 'scrapyard' && frame % 2 === 1) {
      rect(ctx, x + 3, y + 5, 2, 6, t.accent);
      px(ctx, x + 4, y + 10, '#8c3b1a');
    } else if (frame % 2 === 1) {
      rect(ctx, x + 3, y + 7, 3, 2, t.accent);
      px(ctx, x + 4, y + 7, '#ffffff');
    }
  } else if (t.pattern === 'palace' || t.pattern === 'mansion' || t.pattern === 'crib') {
    // Ornate carved obsidian wall with gold molding stripe + royal crimson tapestry trim on frame 2
    rect(ctx, x, y + 3, w, 2, t.accent);
    rect(ctx, x + 2, y + 3, 6, 1, '#fff6b0');
    rect(ctx, x + 1, y + 6, 6, 7, t.wallBotHi);
    rect(ctx, x + 9, y + 6, 6, 7, t.wallBotHi);
    rect(ctx, x + 2, y + 7, 4, 5, t.wallBot);
    rect(ctx, x + 10, y + 7, 4, 5, t.wallBot);
    if (frame === 2 && t.pattern === 'palace') {
      rect(ctx, x + 5, y + 5, 6, 8, t.accent);
      rect(ctx, x + 6, y + 6, 4, 6, '#b82236');
      px(ctx, x + 7, y + 8, '#ffe36b');
    }
  } else if (t.pattern === 'desert' || t.pattern === 'campfire' || t.pattern === 'oasis') {
    // Sculpted layered sandstone canyon cliff strata with varied rock fissures (no boxy slots!)
    const splitA = 5 + (frame % 3);
    const splitB = 10 + ((frame + 1) % 3);
    rect(ctx, x, y + 3, w, 4, t.wallBotHi);
    rect(ctx, x, y + 5, w, 2, t.wallBot);
    rect(ctx, x + splitA, y + 3, 1, 5, t.wallBotDark);
    rect(ctx, x, y + 7, w, 1, t.wallBotDark);
    rect(ctx, x + 1, y + 8, w - 2, 2, t.wallBotHi);
    rect(ctx, x, y + 10, w, 4, t.wallBot);
    rect(ctx, x + splitB, y + 8, 1, 6, t.wallBotDark);
    // Sunlit eroded rock edge flecks
    rect(ctx, x + ((frame * 4 + 1) % 10), y + 3, 4, 1, t.wallTopHi);
    rect(ctx, x + ((frame * 5 + 3) % 9), y + 8, 4, 1, t.wallTopHi);
    if (frame === 2) {
      // Diagonal canyon fracture fissure
      px(ctx, x + 4, y + 5, t.wallBotDark);
      px(ctx, x + 5, y + 6, t.wallBotDark);
      rect(ctx, x + 6, y + 7, 1, 3, t.wallBotDark);
      px(ctx, x + 7, y + 10, t.wallBotDark);
    } else if (frame === 3) {
      // Protruding desert shale ledge
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

    if (t.pattern === 'sewers' && frame % 2 === 1) {
      rect(ctx, x + 4, y + 2, 2, 6, t.accent);
      rect(ctx, x + 11, y + 2, 2, 4, t.accent);
      px(ctx, x + 4, y + 7, '#a6f0db');
    } else if (t.pattern === 'jungle' && frame % 2 === 1) {
      rect(ctx, x + 3, y + 2, 2, 7, t.accent);
      rect(ctx, x + 11, y + 2, 2, 5, t.accent);
    } else if (t.pattern === 'frozen') {
      rect(ctx, x + 3, y + 2, 2, 4, '#d4eafc');
      px(ctx, x + 3, y + 2, '#ffffff');
      rect(ctx, x + 10, y + 2, 2, 5, '#d4eafc');
      px(ctx, x + 10, y + 2, '#ffffff');
    } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
      rect(ctx, x + 6 + (frame & 1), y + 5, 3, 5, t.accent);
      px(ctx, x + 6 + (frame & 1), y + 5, '#ffffff');
    }
  }

  // Grounded dark contact shadow along bottom edge
  rect(ctx, x, y + h - 2, w, 2, INK);
}

/**
 * Registers ALL 16 biome floor/wall tilesets + Campfire + Portals + Chests +
 * Destructible Props + Pickups + Casings + Decals.
 */
export function registerFallbackWorld(b: FallbackAtlasBuilder): void {
  // 1. ALL 16 BIOME TILESETS
  for (const theme of BIOME_THEMES) {
    b.addSprite(`sprFloor${theme.code}`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeFloor(ctx, x, y, w, h, f, theme),
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

  // 3. SWIRLING PORTALS & IDPD RIFTS
  b.addSprite('sprPortal', 32, 32, 16, 16, 6, (ctx, x, y, _w, _h, f) => {
    const cx = x + 16;
    const cy = y + 16;
    const pulse = f % 2 === 0 ? 1 : 0;
    fillPixelEllipse(ctx, cx, cy, 14 - pulse, 14 - pulse, '#240b3b');
    fillPixelEllipse(ctx, cx, cy, 12, 12, '#5c1894');
    fillPixelEllipse(ctx, cx, cy, 9, 9, '#9f3be8');
    const baseAng = (f / 6) * Math.PI * 2;
    for (let arm = 0; arm < 4; arm++) {
      for (let step = 2; step <= 11; step++) {
        const ang = baseAng + (arm * Math.PI) / 2 + step * 0.24;
        const pxX = Math.round(cx + Math.cos(ang) * step);
        const pxY = Math.round(cy + Math.sin(ang) * step);
        rect(ctx, pxX, pxY, step > 7 ? 2 : 1, step > 7 ? 2 : 1, step < 6 ? '#f8d6ff' : '#d678ff');
      }
    }
    fillPixelEllipse(ctx, cx, cy, 5, 5, '#e89eff');
    fillPixelEllipse(ctx, cx, cy, 3 - (pulse & 1), 3 - (pulse & 1), '#ffffff');
  });
  b.addAlias('sprPortalClear', 'sprPortal');

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

  // 5. DETAILED CHESTS (WEAPON, BIG WEAPON, AMMO, RAD, IDPD/ROGUE)
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
    rect(ctx, x + 4, y + 2, 2, h - 3, '#3b3742');
    rect(ctx, x + w - 6, y + 2, 2, h - 3, '#3b3742');
    rect(ctx, x + 2, y + Math.floor(h / 2), w - 4, 2, trim);
    outlinedBox(ctx, x + Math.floor(w / 2) - 2, y + Math.floor(h / 2) - 1, 5, 4, '#ffe880', INK);
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

  // 6. CARS (SCRAPYARD, FROZEN, VENUS GOLDEN, HURT, DEAD)
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
    drawCar(ctx, x, y, '#e8b835', '#fff291', '#9c6e14', '#2d1e38'),
  );

  // 7. BARRELS, CACTI, BONES, PILLARS, PROTO STATUE, THRONE GENERATOR, PLANT SNARE
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

  b.addSprite('sprPillar', 16, 24, 8, 14, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 2, 12, 4, '#8a8294', INK);
    rect(ctx, x + 3, y + 3, 10, 1, '#c4bdd1');
    outlinedBox(ctx, x + 3, y + 5, 10, 14, '#6b6375', INK);
    rect(ctx, x + 5, y + 6, 2, 12, '#9e95ab');
    rect(ctx, x + 9, y + 6, 2, 12, '#4d4657');
    outlinedBox(ctx, x + 2, y + 18, 12, 4, '#595163', INK);
  });

  b.addSprite('sprPalacePillar', 18, 26, 9, 15, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 2, y + 2, 14, 5, '#3b4875', INK);
    rect(ctx, x + 3, y + 3, 12, 2, '#f0c452');
    px(ctx, x + 4, y + 3, '#fff6b0');
    outlinedBox(ctx, x + 3, y + 6, 12, 15, '#2a3354', INK);
    rect(ctx, x + 5, y + 7, 2, 13, '#526399');
    rect(ctx, x + 8, y + 8, 2, 11, '#52f56e');
    px(ctx, x + 8, y + 9, '#ffffff');
    rect(ctx, x + 11, y + 7, 2, 13, '#1a2038');
    outlinedBox(ctx, x + 2, y + 20, 14, 4, '#3b4875', INK);
    rect(ctx, x + 3, y + 21, 12, 1, '#f0c452');
  });
  b.addAlias('sprNuclearPillar', 'sprPalacePillar');

  const drawProtoStatue = (ctx: DrawCtx, x: number, y: number, f: number, charged: boolean): void => {
    outlinedBox(ctx, x + 4, y + 2, 14, 7, '#757f91', INK, true);
    rect(ctx, x + 5, y + 3, 12, 2, '#b0bacd');
    rect(ctx, x + 7, y + 5, 3, 2, charged ? '#78ff8c' : '#2e3340');
    rect(ctx, x + 12, y + 5, 3, 2, charged ? '#78ff8c' : '#2e3340');
    outlinedBox(ctx, x + 3, y + 8, 16, 14, '#5e6678', INK);
    rect(ctx, x + 5, y + 9, 3, 12, '#8b96ab');
    outlinedBox(ctx, x + 8, y + 11, 6, 7, charged && f % 2 === 0 ? '#b2ffc0' : '#40db5c', INK);
    rect(ctx, x + 10, y + 13, 2, 3, '#ffffff');
    outlinedBox(ctx, x + 2, y + 21, 18, 5, '#464d5c', INK);
  };
  b.addSprite('sprProtoStatueIdle', 22, 28, 11, 16, 2, (ctx, x, y, _w, _h, f) => drawProtoStatue(ctx, x, y, f, false));
  b.addAlias('sprProtoStatue', 'sprProtoStatueIdle');
  b.addSprite('sprProtoStatueCharge', 22, 28, 11, 16, 2, (ctx, x, y, _w, _h, f) => drawProtoStatue(ctx, x, y, f, true));

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
    // Radial blast fissures
    rect(ctx, x + 1 + f, y + 9, 4, 1, '#140f12');
    rect(ctx, x + 19 - f, y + 9, 4, 1, '#140f12');
    rect(ctx, x + 11, y + 2 + f, 2, 3, '#140f12');
    rect(ctx, x + 11, y + 15 - f, 2, 3, '#140f12');
    // Subtle crater rim dust highlights
    px(ctx, x + 7 + f, y + 5, '#473c3f');
    px(ctx, x + 16 - f, y + 14, '#473c3f');
  });
  b.addSprite('sprScorchmark', 14, 12, 7, 6, 2, (ctx, x, y, _w, _h, f) => {
    fillPixelEllipse(ctx, x + 7, y + 6, 6, 4, '#292024');
    fillPixelEllipse(ctx, x + 7, y + 6, 4, 3, '#171115');
    fillPixelEllipse(ctx, x + 7 + (f & 1), y + 6, 2, 1, '#0a0709');
  });
}
