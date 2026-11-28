import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  hash2d,
} from './fallback-fonts';
import {
  type ColorRamp,
  PxCanvas,
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

/**
 * Exact Nuclear Throne biome color families matching the reference video keyframes.
 * `wallTop` matches the continuous solid outer wall-top roof mass 1:1 for zero seams.
 */
const BIOME_THEMES: readonly BiomeTheme[] = [
  {
    code: 0, pattern: 'campfire',
    floorBase: '#6b5842', floorHi: '#7a664e', floorMid: '#5e4d3a', floorDark: '#4f4030', floorCrack: '#3a2e22',
    accent: '#e87828', accent2: '#7a9244',
    wallTop: '#8c7a5c', wallTopHi: '#9e8b6c', wallTopDark: '#78674c',
    wallBot: '#66553e', wallBotHi: '#7c694e', wallBotDark: '#4d3f2d', wallOut: '#362c1f',
  },
  {
    code: 1, pattern: 'desert',
    // Calm flat warm ochre sand (#c0a453) + warm sandstone-taupe roof (#9b8568)
    floorBase: '#c0a453', floorHi: '#ceb364', floorMid: '#b09344', floorDark: '#9e823a', floorCrack: '#78602c',
    accent: '#6c8c3e', accent2: '#dfd4b8',
    wallTop: '#9b8568', wallTopHi: '#ad9778', wallTopDark: '#867156',
    wallBot: '#6d5b47', wallBotHi: '#847058', wallBotDark: '#584838', wallOut: '#423528',
  },
  {
    code: 2, pattern: 'sewers',
    // Muted mossy dark olive stone floor (#424d3b) + mossy roof (#344030) + slime drips
    floorBase: '#424d3b', floorHi: '#4e5b46', floorMid: '#3a4434', floorDark: '#2f382a', floorCrack: '#20271d',
    accent: '#5ec440', accent2: '#7ee058',
    wallTop: '#344030', wallTopHi: '#41503c', wallTopDark: '#283225',
    wallBot: '#263022', wallBotHi: '#32402d', wallBotDark: '#1d261a', wallOut: '#131a11',
  },
  {
    code: 3, pattern: 'scrapyard',
    // Dense organic rounded rocky cobblestones (#7a6e66/#857870, crevices #544a44) + craggy slate walls (#828890)
    floorBase: '#7a6e66', floorHi: '#857870', floorMid: '#6f645c', floorDark: '#544a44', floorCrack: '#423934',
    accent: '#a25c3a', accent2: '#68e830',
    wallTop: '#828890', wallTopHi: '#989ea6', wallTopDark: '#666c74',
    wallBot: '#646a72', wallBotHi: '#7e858e', wallBotDark: '#4a4f57', wallOut: '#353940',
  },
  {
    code: 4, pattern: 'caves',
    // True 2-tier darkness raw brightness: wallTop #7a4eb4 -> dims to #44315e in 42% ring, pops vibrant inside!
    floorBase: '#644a82', floorHi: '#725692', floorMid: '#563e72', floorDark: '#473161', floorCrack: '#34224a',
    accent: '#ff8c28', accent2: '#ffe066',
    wallTop: '#7a4eb4', wallTopHi: '#8f66c4', wallTopDark: '#5e3892',
    wallBot: '#563286', wallBotHi: '#6d45a0', wallBotDark: '#3d2066', wallOut: '#2b154a',
  },
  {
    code: 5, pattern: 'frozen',
    // Bright crisp cool snow (#d2d6da) popping over silver-gray roof (#9da4a6) + striped sky-blue ice (#7da8c4/#a6d2ec)
    floorBase: '#d2d6da', floorHi: '#dfe3e6', floorMid: '#c6cbd0', floorDark: '#b2b9c0', floorCrack: '#848e98',
    accent: '#7da8c4', accent2: '#a6d2ec',
    wallTop: '#9da4a6', wallTopHi: '#b4bcc0', wallTopDark: '#858e92',
    wallBot: '#747f88', wallBotHi: '#94a0a9', wallBotDark: '#56626c', wallOut: '#424c56',
  },
  {
    code: 6, pattern: 'labs',
    // True 2-tier darkness raw brightness: wallTop #12333b -> dims to #0d1919 in 42% ring, pops crisp inside!
    floorBase: '#263036', floorHi: '#2f3c44', floorMid: '#212a30', floorDark: '#192126', floorCrack: '#11171b',
    accent: '#5ce040', accent2: '#42e0f0',
    wallTop: '#12333b', wallTopHi: '#1d464f', wallTopDark: '#0b2228',
    wallBot: '#18343a', wallBotHi: '#244a52', wallBotDark: '#102428', wallOut: '#091518',
  },
  {
    code: 7, pattern: 'palace',
    // Charcoal/navy 16x16 diagonal diamond floor (#26262c/#1a1c22) + dusty crimson-terracotta walls (#64282c)
    floorBase: '#26262c', floorHi: '#2d2e36', floorMid: '#1a1c22', floorDark: '#15171c', floorCrack: '#0f1015',
    accent: '#58f048', accent2: '#d8b85c',
    wallTop: '#64282c', wallTopHi: '#783a3e', wallTopDark: '#4f1d21',
    wallBot: '#5c2528', wallBotHi: '#7a3e40', wallBotDark: '#40161a', wallOut: '#2b0e12',
  },
  {
    code: 100, pattern: 'vault',
    floorBase: '#475461', floorHi: '#546270', floorMid: '#3e4a56', floorDark: '#333e48', floorCrack: '#242d36',
    accent: '#48e078', accent2: '#d8b658',
    wallTop: '#3d4d58', wallTopHi: '#4c5f6c', wallTopDark: '#2f3c45',
    wallBot: '#2c3942', wallBotHi: '#3c4c58', wallBotDark: '#1f2930', wallOut: '#151c22',
  },
  {
    code: 101, pattern: 'oasis',
    // Bright luminous seafoam-mint shallow water (#b6ddd4/#c0e5dc) + vibrant turquoise roof (#58afa9) + thick dark kelp cliff
    floorBase: '#b6ddd4', floorHi: '#c0e5dc', floorMid: '#a2ccc2', floorDark: '#8cbab0', floorCrack: '#548c82',
    accent: '#34a048', accent2: '#ff4e74',
    wallTop: '#58afa9', wallTopHi: '#68bfb9', wallTopDark: '#479c96',
    wallBot: '#1a5c4a', wallBotHi: '#287a5e', wallBotDark: '#103e32', wallOut: '#0c2e25',
  },
  {
    code: 102, pattern: 'pizza',
    floorBase: '#544a3c', floorHi: '#625747', floorMid: '#4a4134', floorDark: '#3d352a', floorCrack: '#2b251d',
    accent: '#d87e34', accent2: '#5cb844',
    wallTop: '#384434', wallTopHi: '#465441', wallTopDark: '#2b3528',
    wallBot: '#2c3628', wallBotHi: '#3a4735', wallBotDark: '#1f271c', wallOut: '#151b13',
  },
  {
    code: 103, pattern: 'mansion',
    floorBase: '#5e2838', floorHi: '#6e3244', floorMid: '#522130', floorDark: '#421926', floorCrack: '#2e101a',
    accent: '#e4be4a', accent2: '#56d468',
    wallTop: '#8a7e6e', wallTopHi: '#9e9180', wallTopDark: '#74695b',
    wallBot: '#6c6052', wallBotHi: '#827564', wallBotDark: '#52483c', wallOut: '#3a3228',
  },
  {
    code: 104, pattern: 'cursed',
    floorBase: '#4c326e', floorHi: '#5c3e82', floorMid: '#40285e', floorDark: '#311d4a', floorCrack: '#221236',
    accent: '#f054cc', accent2: '#ffa8f2',
    wallTop: '#643a98', wallTopHi: '#7c50b2', wallTopDark: '#4c2878',
    wallBot: '#462272', wallBotHi: '#5e3492', wallBotDark: '#301452', wallOut: '#200c38',
  },
  {
    code: 105, pattern: 'jungle',
    // Warm earthy olive-brown dirt (#5e542a) + dense bumpy leafy green canopy (#438428/#5eb228/#286416)
    floorBase: '#5e542a', floorHi: '#6b6032', floorMid: '#534924', floorDark: '#453d1c', floorCrack: '#312b13',
    accent: '#5eb228', accent2: '#e43c4c',
    wallTop: '#438428', wallTopHi: '#5eb228', wallTopDark: '#286416',
    wallBot: '#286416', wallBotHi: '#3d8822', wallBotDark: '#1b480e', wallOut: '#123209',
  },
  {
    code: 106, pattern: 'hq',
    floorBase: '#3a4962', floorHi: '#455774', floorMid: '#324056', floorDark: '#283447', floorCrack: '#1d2636',
    accent: '#4698f0', accent2: '#88e4ff',
    wallTop: '#b8c2cc', wallTopHi: '#cad4de', wallTopDark: '#9faab6',
    wallBot: '#7a8898', wallBotHi: '#93a2b2', wallBotDark: '#5a6676', wallOut: '#3f4956',
  },
  {
    code: 107, pattern: 'crib',
    floorBase: '#492e5e', floorHi: '#57386e', floorMid: '#3e2650', floorDark: '#321e42', floorCrack: '#22132e',
    accent: '#f0c446', accent2: '#c868ff',
    wallTop: '#64406e', wallTopHi: '#784e84', wallTopDark: '#4f3158',
    wallBot: '#4a2d54', wallBotHi: '#5e3b6a', wallBotDark: '#341e3c', wallOut: '#24132a',
  },
];

// ============================================================================
// NATIVE 1x 32x32 CALM BIOME FLOOR SLABS (CRISP INTEGER PIXELS — ZERO MIXELS!)
// ============================================================================

function drawBiomeFloor32(
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

  if (t.pattern === 'palace') {
    // Crisp 16x16 diagonal diamond checkerboard (#26262c and #1a1c22) matching 15_palace_7_1 / 17_throne_hall!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const s = Math.floor((px + py) / 16);
        const d = Math.floor((px - py + 64) / 16);
        const lightDiamond = ((s + d) & 1) === 0;
        buf.set(px, py, lightDiamond ? t.floorBase : t.floorMid);
      }
    }
    if (isAltB) {
      // Subtle weathered terracotta-dusted diamond matching 16_palace_7_2
      for (let py = 8; py < 24; py++) {
        for (let px = 8; px < 24; px++) {
          if (Math.abs(px - 16) + Math.abs(py - 16) < 8) {
            const hsh = hash2d(px, py, seed);
            buf.set(px, py, hsh > 160 ? '#382226' : '#2d1c20');
          }
        }
      }
      if (frame === 1) {
        buf.set(14, 15, '#121318');
        buf.set(15, 16, '#121318');
        buf.set(16, 17, '#121318');
      }
    } else if (frame === 2) {
      // Whisper-subtle hairline diagonal floor crack
      buf.line(10, 12, 14, 16, t.floorCrack);
      buf.set(14, 17, t.floorCrack);
    } else if (frame === 3) {
      buf.line(19, 11, 22, 14, t.floorCrack);
      buf.set(9, 22, t.floorHi);
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'frozen' && isAltB) {
    // ICONIC DIAGONAL SKY-BLUE STRIPED FROZEN ICE TILES (#7da8c4 / #a6d2ec) matching 13_frozen_5_3.png!!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const diag = (px + py) & 15;
        let col = '#7da8c4';
        if (diag === 1) col = '#c2e4f6';
        else if (diag >= 0 && diag <= 3) col = '#a6d2ec';
        else if (diag === 15) col = '#6b96b2';
        buf.set(px, py, col);
      }
    }
    if (frame === 1) {
      // Crisp bright snow patch creeping onto one ice edge
      buf.ellipse(6, 5, 6, 4, '#d2d6da');
      buf.ellipse(10, 4, 4, 3, '#dfe3e6');
      buf.line(18, 20, 23, 22, '#628ca8');
      buf.line(23, 22, 26, 20, '#c2e4f6');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'desert') {
    // Calm flat warm ochre sand (#c0a453) — ZERO stripes, ZERO waves, ZERO grid lines!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 7);
        if (hsh > 248) buf.set(px, py, t.floorMid);
        else if (hsh < 5) buf.set(px, py, t.floorHi);
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Calm warm dusty sandstone gravel patch (subtle, low contrast)
        buf.ellipse(16, 16, 10, 8, '#b4974a');
        buf.ellipse(14, 15, 6, 5, '#ac8f44');
        buf.set(12, 14, '#9a7e3a');
        buf.set(19, 17, '#9a7e3a');
        buf.set(15, 19, '#ceb364');
      } else {
        // Small sun-baked pebbles + tiny desert scrub tuft
        buf.rect(10, 12, 3, 2, '#9e823a');
        buf.set(10, 12, '#ceb364');
        buf.rect(20, 19, 2, 2, '#9e823a');
        buf.set(15, 22, t.accent);
        buf.set(16, 21, '#7ea048');
        buf.set(17, 22, t.accent);
      }
    } else if (frame === 1) {
      buf.rect(9, 14, 2, 1, t.floorMid);
      buf.set(22, 21, t.floorDark);
      buf.set(22, 20, t.floorHi);
    } else if (frame === 2) {
      // Tiny desert grass sprig
      buf.set(14, 18, t.accent);
      buf.set(15, 17, '#7da048');
      buf.set(16, 18, t.accent);
      buf.set(15, 18, '#557230');
    } else if (frame === 3) {
      buf.rect(20, 10, 2, 1, t.floorDark);
      buf.rect(8, 23, 2, 1, t.floorMid);
      buf.set(9, 22, t.floorHi);
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'oasis') {
    // BRIGHT luminous pale seafoam-mint shallow water (#b6ddd4 / #c0e5dc) matching 05_oasis.png Left!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const band = (px + py) & 31;
        if (band >= 0 && band <= 7) {
          buf.set(px, py, t.floorHi);
        }
      }
    }
    // Delicate sparse water ripples
    buf.rect(6 + frame * 3, 9, 3, 1, t.floorMid);
    buf.rect(19 - frame * 2, 22, 3, 1, t.floorMid);
    if (isAltB) {
      if (frame === 0) {
        // Dark emerald underwater kelp/moss patch matching 05_oasis.png
        buf.ellipse(16, 16, 9, 7, '#287a4e');
        buf.ellipse(15, 15, 6, 5, '#38965c');
        for (let py = 10; py <= 22; py++) {
          for (let px = 8; px <= 24; px++) {
            if (buf.get(px, py) === '#38965c' && hash2d(px, py, seed) > 175) {
              buf.set(px, py, '#1d623e');
            }
          }
        }
      } else {
        // Delicate water bubbles & sea pebble
        buf.pixelRing(12, 14, 2, '#e4f7f2');
        buf.set(11, 13, '#ffffff');
        buf.pixelRing(22, 20, 1, '#e4f7f2');
        buf.rect(18, 11, 2, 1, '#82aea4');
      }
    } else if (frame === 2) {
      buf.pixelRing(15, 16, 1, '#e2f6f0');
    } else if (frame === 3) {
      buf.rect(11, 20, 2, 1, '#8ab4aa');
      buf.set(12, 19, '#e2f6f0');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'scrapyard') {
    // DENSE ORGANIC ROUNDED ROCKY COBBLESTONES (#7a6e66/#857870, crisp dark #544a44 crevices) matching 06_scrapyard_3_3.png!
    // Constant tileable Voronoi seed across all 4 frames -> ZERO straight rectangular grid seams!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 6.4, 211, 5, 0.76);
        let col = t.floorBase;
        // Rounded dark crevices all around every organic cobblestone (corners round smoothly via v.d1!)
        if (v.edge < 0.19 || v.d1 > 0.62) {
          col = t.floorDark; // #544a44 crisp crevice
        } else if (v.dy < -0.10 && v.edge < 0.31) {
          col = '#8c7f76'; // subtle sunlit upper rock rim
        } else {
          const tone = v.cellId & 3;
          col = tone === 0 ? '#857870' : tone === 1 ? '#7a6e66' : tone === 2 ? '#72665f' : '#80746b';
        }
        buf.set(px, py, col);
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Iconic Scrapyard rectangular rusty floor drain grate matching 06_scrapyard_3_3 / 07_bigdog_3_3!
        buf.rect(6, 10, 20, 12, '#3d3130');
        buf.rect(7, 11, 18, 10, '#6e5c5a');
        for (let gx = 8; gx <= 22; gx += 2) {
          buf.rect(gx, 12, 1, 8, '#281f20');
        }
        buf.rect(7, 11, 18, 1, '#8e7874');
      } else {
        // Iconic glowing green radioactive crack in cobbles (07_bigdog_3_3.png!)
        buf.line(10, 14, 16, 16, '#62e030');
        buf.line(16, 16, 22, 13, '#62e030');
        buf.line(16, 16, 18, 22, '#48b824');
        buf.line(13, 15, 11, 20, '#48b824');
        buf.set(16, 16, '#b8ff78');
      }
    } else if (frame === 1) {
      buf.rect(10, 19, 2, 1, t.floorCrack);
    } else if (frame === 2) {
      buf.set(20, 10, '#9e5a38');
      buf.set(21, 10, '#6c3a22');
    } else if (frame === 3) {
      // Tiny pale scrap bone/trash ring
      buf.rect(13, 14, 3, 2, '#beb6b0');
      buf.set(14, 14, '#7a6e66');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // True 2-tier darkness raw textured amethyst cave rock (#644a82) — dims to calm #3c2f4d in 42% ring!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 8, t.code * 13 + 5, 4, 0.68);
        if (v.edge < 0.11) {
          buf.set(px, py, t.floorMid);
        } else if (v.dy < -0.18 && v.d1 < 0.45 && hash2d(px, py, seed) > 130) {
          buf.set(px, py, t.floorHi);
        } else if ((v.cellId & 7) === 0 && hash2d(px, py, seed + 11) > 190) {
          buf.set(px, py, t.floorDark);
        }
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // CRISP WHITE PIXEL COBWEB matching 08_caves_4_1.png & 09_caves_lights.png!
        const webCol = '#b8b2ce';
        const webHi = '#ece8f8';
        buf.line(5, 5, 26, 26, webCol);
        buf.line(26, 6, 6, 26, webCol);
        buf.line(16, 4, 16, 27, webCol);
        buf.line(4, 16, 27, 16, webCol);
        buf.pixelRing(16, 16, 5, webHi);
        buf.pixelRing(16, 16, 9, webCol);
        buf.set(16, 16, webHi);
      } else {
        // Small embedded amber/cursed crystal glint
        buf.rect(15, 14, 2, 3, t.accent);
        buf.set(15, 14, t.accent2);
        buf.set(17, 16, t.floorCrack);
      }
    } else if (frame === 2) {
      buf.rect(11, 18, 2, 1, t.floorDark);
      buf.set(11, 17, t.floorHi);
    } else if (frame === 3) {
      buf.set(20, 12, t.accent);
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'frozen') {
    // Bright crisp cool snow (#d2d6da) with soft snow drifts (#c6cbd0 / #dfe3e6) popping over #9da4a6 roof!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Gentle wide diagonal wind-sculpted snow drift wave (tileable period 32)
        const drift = ((px + py * 2) & 31);
        const hsh = hash2d(px, py, seed + 11);
        if (drift >= 0 && drift <= 6 && hsh > 135) buf.set(px, py, t.floorHi);
        else if (drift >= 16 && drift <= 19 && hsh > 165) buf.set(px, py, t.floorMid);
        else if (hsh > 250) buf.set(px, py, '#eef2f5');
      }
    }
    if (frame === 1) {
      buf.line(9, 13, 14, 13, t.floorMid);
      buf.line(10, 12, 13, 12, '#eef2f5');
    } else if (frame === 2) {
      buf.rect(19, 20, 3, 1, t.floorDark);
      buf.rect(20, 19, 2, 1, t.floorHi);
    } else if (frame === 3) {
      buf.rect(11, 22, 2, 2, t.floorMid);
      buf.set(11, 22, '#eef2f5');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'jungle') {
    // Warm earthy olive-brown dirt (#5e542a) with subtle grass blades & organic earth speckles (11b_levelup.png!)
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 19);
        if (hsh > 214) buf.set(px, py, t.floorHi);
        else if (hsh < 38) buf.set(px, py, t.floorMid);
        else if (hsh < 10) buf.set(px, py, t.floorDark);
      }
    }
    // Subtle organic grass blades & earth pebbles matching 11b_levelup.png
    if (frame === 0) {
      buf.set(7, 22, '#4a8e28');
      buf.set(8, 21, '#62b432');
      buf.set(23, 9, '#463d1c');
    } else if (frame === 1 || frame === 3) {
      buf.set(10, 13, '#448426');
      buf.set(11, 12, '#62b432');
      buf.set(12, 13, '#448426');
      buf.set(22, 23, '#3c3216');
      buf.set(23, 23, '#726636');
    } else if (frame === 2) {
      buf.line(17, 20, 21, 21, '#3b2e16');
      buf.set(19, 19, '#529c2c');
      buf.set(20, 18, '#68bc36');
    }
    if (isAltB) {
      if (frame === 0) {
        // Lush grass tuft cluster + fallen twig
        buf.rect(12, 14, 5, 3, '#2d6818');
        buf.set(12, 13, '#52a42c');
        buf.set(14, 12, '#66be34');
        buf.set(16, 13, '#52a42c');
        buf.line(20, 21, 24, 22, '#3d2e16');
      } else {
        // Tiny red jungle flower on dirt
        buf.rect(14, 15, 3, 2, '#387a20');
        buf.set(15, 14, '#e43848');
        buf.set(14, 15, '#e43848');
        buf.set(16, 15, '#e43848');
        buf.set(15, 15, '#ffe048');
      }
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'labs') {
    // True 2-tier darkness raw dark metal lab panels (#263036) — dims cleanly to #161c20 in 42% ring!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const q = ((px >> 4) + (py >> 4)) & 1;
        const seam = (px & 15) === 0 || (py & 15) === 0;
        buf.set(px, py, seam ? t.floorDark : q === 0 ? t.floorBase : '#2b363d');
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Clean recessed metal floor vent
        buf.rect(8, 10, 16, 12, '#151c20');
        for (let gy = 11; gy <= 20; gy += 2) {
          buf.rect(9, gy, 14, 1, '#323f48');
        }
      } else {
        // Subtle cracked lab panel with tiny glowing green drop
        buf.rect(14, 15, 3, 2, '#2d7a34');
        buf.set(15, 15, '#5ce040');
      }
    } else if (frame === 2) {
      buf.set(5, 5, t.floorHi);
      buf.set(22, 22, t.floorCrack);
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'sewers' || t.pattern === 'pizza') {
    // Muted mossy dark olive stone floor (#424d3b / #3a4434) with soft staggered organic stone joints (zero loud grid!)
    for (let py = 0; py < h; py++) {
      const rowBand = (py >> 4) & 1;
      const ox = rowBand * 8;
      for (let px = 0; px < w; px++) {
        const lx = (px + ox) & 15;
        const ly = py & 15;
        const hsh = hash2d(px, py, seed);
        const softSeam = (lx === 0 || ly === 0) && hsh > 90;
        let col = ((px + ox) >> 4) % 2 === rowBand ? t.floorBase : t.floorMid;
        if (softSeam) col = '#353f2f';
        else if (hsh > 236) col = t.floorHi;
        else if (hsh < 14) col = t.floorDark;
        buf.set(px, py, col);
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Dark iron drain grate
        buf.rect(8, 8, 16, 16, t.floorCrack);
        buf.rect(9, 9, 14, 14, '#293226');
        for (let gx = 10; gx <= 20; gx += 2) {
          buf.rect(gx, 10, 1, 12, '#131811');
        }
        buf.set(11, 21, t.accent);
        buf.set(12, 22, '#3d7a2c');
      } else {
        // Damp mossy stone patch
        buf.ellipse(16, 16, 6, 4, '#2d3a27');
        buf.set(14, 15, t.accent);
        buf.set(18, 16, '#488432');
      }
    } else if (frame === 1) {
      buf.set(12, 12, '#4f6a3c');
      buf.set(13, 12, '#394f2c');
    } else if (frame === 2) {
      buf.line(18, 10, 22, 13, t.floorCrack);
    }
    buf.flush(ctx, x, y);
    return;
  }

  // Remaining biomes: Campfire (0), Vault (100), Mansion (103), HQ (106), Crib (107)
  if (t.pattern === 'campfire') {
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 3);
        if (hsh > 235) buf.set(px, py, t.floorHi);
        else if (hsh < 20) buf.set(px, py, t.floorMid);
      }
    }
    if (isAltB || frame === 2) {
      buf.rect(12, 15, 3, 2, t.floorDark);
      buf.set(12, 15, t.floorHi);
    }
  } else {
    // Vault, Mansion, HQ, Crib: clean low-contrast architectural floor tiles
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const seam = (px & 15) === 0 || (py & 15) === 0;
        const q = ((px >> 4) + (py >> 4)) & 1;
        let col = q === 0 ? t.floorBase : t.floorMid;
        if (seam) col = t.floorDark;
        else if ((px & 15) === 1 && (py & 15) === 1 && t.pattern === 'mansion') col = t.floorHi;
        buf.set(px, py, col);
      }
    }
    if (isAltB) {
      buf.rect(10, 10, 12, 12, t.floorDark);
      buf.rect(11, 11, 10, 10, t.floorMid);
      buf.rect(14, 14, 4, 4, mixHex(t.accent, t.floorBase, 0.5));
    } else if (frame === 2) {
      buf.line(10, 18, 15, 21, t.floorCrack);
    }
  }

  buf.flush(ctx, x, y);
}

// ============================================================================
// NATIVE 1x 12x12 SUBTLE FLOOR MICRO-DETAILS (`sprDetail*`)
// ============================================================================

function drawBiomeDetail12(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  t: BiomeTheme,
): void {
  const buf = new PxCanvas(w, h);
  switch (frame % 6) {
    case 0: {
      // 2 tiny grounded biome pebbles
      buf.rect(4, 6, 3, 2, t.floorDark);
      buf.set(4, 6, t.floorHi);
      buf.set(8, 7, t.floorCrack);
      break;
    }
    case 1: {
      // Biome-specific minimal micro-accent
      if (t.pattern === 'desert' || t.pattern === 'jungle' || t.pattern === 'campfire') {
        buf.set(5, 6, t.accent);
        buf.set(6, 5, '#72a040');
        buf.set(7, 6, t.accent);
        buf.set(6, 6, t.floorDark);
      } else if (t.pattern === 'oasis') {
        buf.pixelRing(6, 6, 1, '#d8f2ec');
      } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
        buf.set(6, 5, t.accent2);
        buf.set(6, 6, t.accent);
        buf.set(5, 7, t.floorCrack);
      } else if (t.pattern === 'frozen') {
        buf.rect(4, 6, 4, 1, '#cfd4d8');
        buf.rect(5, 7, 3, 1, '#9ca4ac');
      } else if (t.pattern === 'labs' || t.pattern === 'hq') {
        buf.rect(4, 6, 4, 1, t.floorCrack);
        buf.set(6, 6, t.accent);
      } else {
        buf.rect(5, 5, 2, 2, t.floorDark);
        buf.set(5, 5, t.floorHi);
      }
      break;
    }
    case 2: {
      // Small subtle floor crack
      buf.line(3, 6, 7, 7, t.floorCrack);
      buf.set(7, 6, t.floorCrack);
      break;
    }
    case 3: {
      if (t.pattern === 'desert' || t.pattern === 'scrapyard') {
        // Tiny sun-bleached pebble / bone chip
        buf.rect(5, 5, 2, 2, '#d4cbb4');
        buf.set(6, 6, '#9e947e');
      } else if (t.pattern === 'sewers') {
        buf.rect(5, 6, 2, 1, t.accent);
        buf.set(6, 7, '#346e24');
      } else {
        buf.set(5, 6, t.floorDark);
        buf.set(6, 5, t.floorHi);
      }
      break;
    }
    case 4: {
      // Tiny speck cluster
      buf.set(4, 5, t.floorDark);
      buf.set(7, 7, t.floorMid);
      buf.set(6, 6, t.floorHi);
      break;
    }
    default: {
      buf.rect(5, 6, 2, 1, t.floorCrack);
      buf.set(5, 5, t.floorHi);
      break;
    }
  }
  buf.flush(ctx, x, y);
}

// ============================================================================
// NATIVE 1x 16x16 BLASTED WALL RUBBLE CRATERS (`sprFloor*Explo`)
// ============================================================================

function drawBiomeFloorExplo16(
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
  // Dark charred blasted rubble pit matching 15_palace_7_1 / 14_labs_6_1 / 07_bigdog_3_3
  const pitDeep = shadeHex(t.floorCrack, -0.45);
  const pitMid = shadeHex(t.floorDark, -0.35);
  buf.rect(0, 0, w, h, pitMid);
  buf.ellipse(8, 8, 6, 5, pitDeep);
  // Scattered biome wall-material rubble chunks!
  for (let i = 0; i < 8; i++) {
    const rx = 2 + ((hash2d(i, frame, seed) % 11) | 0);
    const ry = 2 + ((hash2d(i + 17, frame, seed + 5) % 11) | 0);
    const rw = (i & 1) === 0 ? 3 : 2;
    const rh = (i % 3) === 0 ? 2 : 1;
    buf.rect(rx, ry, rw, rh, i % 2 === 0 ? t.wallBot : t.wallTop);
    buf.set(rx, ry, t.wallTopHi);
  }
  if (t.pattern === 'labs') {
    // Exposed tiny red/cyan lab wires matching 14_labs_6_1.png
    buf.set(4, 6, '#d83838');
    buf.set(5, 7, '#d83838');
    buf.set(11, 10, '#42c8d8');
    buf.set(10, 11, '#42c8d8');
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    buf.set(6, 9, t.accent);
    buf.set(11, 5, t.accent);
  }
  buf.flush(ctx, x, y);
}

// ============================================================================
// NATIVE 1x 16x16 WALL TOPS (`sprWall*Top`) & SOUTH FRONT FACES (`sprWall*Bot`)
// ============================================================================

function drawBiomeWallTop16(
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

  // Fill with EXACT biome roof color so wall tops seamlessly blend into the continuous outer roof mass!
  buf.rect(0, 0, w, h, t.wallTop);

  if (t.pattern === 'desert' || t.pattern === 'campfire') {
    // Warm sandstone-taupe roof (#9b8568) with organic weathered sandstone pebble nodules & micro-notches
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 234) buf.set(px, py, t.wallTopHi);
        else if (hsh < 20) buf.set(px, py, t.wallTopDark);
      }
    }
    // Hand-pixelled weathered sandstone surface chips along roof
    if (frame >= 1) {
      const cx = (frame * 5 + 1) % 12;
      const cy = 2 + ((frame * 3) % 9);
      buf.rect(cx, cy, 3, 1, t.wallTopDark);
      buf.rect(cx, cy - 1, 2, 1, t.wallTopHi);
    }
  } else if (t.pattern === 'oasis') {
    // Bright vibrant turquoise (#58afa9) with gentle wide diagonal sheen matching 05_oasis.png!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const diag = (px + py) & 15;
        if (diag >= 0 && diag <= 3) buf.set(px, py, '#60b8b2');
      }
    }
    if (frame === 3) {
      // Organic asymmetric bright green kelp sprig matching 05_oasis.png
      buf.grid(5, 6, [
        '..l..',
        '.gLg.',
        'ggLgg',
        '.dgd.',
      ], { l: '#50c444', L: '#3ca838', g: '#2d8c30', d: '#1d6624' });
    }
  } else if (t.pattern === 'scrapyard') {
    // Craggy battleship slate-gray (#828890) with jagged rocky rubble facets & cracked concrete texture (06_scrapyard_3_3.png!)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 5.333, seed + 17, 3, 0.72);
        if (v.edge < 0.14 && hash2d(px, py, seed + 3) > 105) {
          buf.set(px, py, t.wallTopDark);
        } else if (v.dy < -0.18 && v.edge < 0.28 && hash2d(px, py, seed + 9) > 130) {
          buf.set(px, py, t.wallTopHi);
        }
      }
    }
    // Chipped concrete crack & rust scrap flecks matching 06_scrapyard_3_3.png
    const rx = (frame * 5 + 2) % 11;
    const ry = 3 + ((frame * 4) % 9);
    buf.rect(rx, ry, 2, 2, '#9e5a3a');
    buf.set(rx + 1, ry + 1, '#683620');
    if (frame === 1 || frame === 3) {
      buf.line(2, 10, 6, 12, '#585e66');
      buf.set(3, 9, '#9da4ac');
    }
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // True 2-tier raw amethyst rock (#7a4eb4) with crisp bumpy crystal facets (#8f66c4 / #5e3892) + glowing orange embers!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 5.333, seed + 7, 3, 0.7);
        if (v.edge < 0.15) buf.set(px, py, t.wallTopDark);
        else if (v.dy < -0.15 && v.d1 < 0.45) buf.set(px, py, t.wallTopHi);
      }
    }
    if (frame === 1 || frame === 3) {
      const ex = frame === 1 ? 4 : 10;
      const ey = frame === 1 ? 5 : 9;
      buf.rect(ex, ey, 2, 2, t.accent);
      buf.set(ex, ey, t.accent2);
    }
  } else if (t.pattern === 'frozen') {
    // Cool silver-gray snow roof (#9da4a6) with fractured snow crevices & drifted ice chunks (10_frozen_5_1.png!)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 236) buf.set(px, py, t.wallTopHi);
        else if (hsh < 18) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 1 || frame === 3) {
      // Crisp small fractured snow/ice crevasse V-notch
      const fx = frame === 1 ? 4 : 9;
      const fy = frame === 1 ? 5 : 10;
      buf.line(fx, fy, fx + 3, fy + 1, '#7c868e');
      buf.line(fx + 3, fy + 1, fx + 5, fy, '#7c868e');
      buf.line(fx + 1, fy - 1, fx + 4, fy - 1, '#bcc4c8');
    }
  } else if (t.pattern === 'jungle') {
    // DENSE BUMPY SERRATED LEAFY CANOPY PIXEL CLUSTERS (#5eb228 / #438428 / #286416) matching 11b_levelup.png!!
    // Layered organic 5x4 staggered leaf crowns so Jungle walls look genuinely leafy, never flat boxes!
    const tufts: Array<[number, number]> = [
      [2, 2], [9, 1], [14, 3],
      [5, 6], [12, 7], [0, 8],
      [3, 12], [10, 11], [15, 13],
    ];
    for (let i = 0; i < tufts.length; i++) {
      const [bx, by] = tufts[i]!;
      const tx = (bx + frame * 3) & 15;
      const ty = (by + (frame & 1) * 2) & 15;
      const wrapSet = (px: number, py: number, col: string): void => {
        buf.set((px + 16) & 15, (py + 16) & 15, col);
      };
      // Shaded dark leaf underside
      wrapSet(tx - 1, ty + 2, t.wallTopDark);
      wrapSet(tx, ty + 2, t.wallTopDark);
      wrapSet(tx + 1, ty + 2, t.wallTopDark);
      wrapSet(tx + 2, ty + 1, t.wallTopDark);
      // Mid-canopy green leaf body
      wrapSet(tx - 1, ty + 1, '#3a7a22');
      wrapSet(tx, ty + 1, t.wallTop);
      wrapSet(tx + 1, ty + 1, t.wallTop);
      wrapSet(tx - 1, ty, t.wallTop);
      wrapSet(tx + 2, ty, '#3a7a22');
      // Vibrant sunlit lime-green leaf crown pixels
      wrapSet(tx, ty, t.wallTopHi);
      wrapSet(tx + 1, ty, t.wallTopHi);
      wrapSet(tx, ty - 1, (i + frame) % 3 === 0 ? '#72c632' : t.wallTopHi);
    }
  } else if (t.pattern === 'labs') {
    // True 2-tier raw dark lab teal (#12333b) with crisp subtle #1d464f 16px panel grid seam matching 14_labs_6_1.png!
    for (let px = 0; px < w; px++) buf.set(px, 0, t.wallTopHi);
    for (let py = 0; py < h; py++) buf.set(0, py, t.wallTopHi);
    if (frame === 2 || frame === 3) {
      // Recessed lab equipment ceiling vent + tiny red/cyan monitor pixels
      buf.rect(3, 3, 10, 9, '#0e282e');
      buf.rect(4, 5, 8, 1, '#1d464f');
      buf.rect(4, 8, 8, 1, '#1d464f');
      if (frame === 3) {
        buf.set(11, 5, '#e83838');
        buf.set(11, 8, '#42e0f0');
      }
    }
  } else if (t.pattern === 'palace') {
    // Dusty crimson-terracotta (#64282c) with weathered brick-course relief & chipped stone rim pixels (15_palace_7_1.png!)
    for (let py = 0; py < h; py++) {
      const isMortarRow = py === 7 || py === 15;
      const ox = py >= 8 ? 4 : 0;
      for (let px = 0; px < w; px++) {
        const isJoint = ((px + ox) & 7) === 0;
        const hsh = hash2d(px, py, seed);
        if (isMortarRow || isJoint) {
          if (hsh > 75) buf.set(px, py, t.wallTopDark);
        } else if (py === 0 || py === 8) {
          if (hsh > 120) buf.set(px, py, t.wallTopHi);
        } else if (hsh > 235) {
          buf.set(px, py, '#723337');
        } else if (hsh < 14) {
          buf.set(px, py, '#521e22');
        }
      }
    }
    if (frame >= 2) {
      // Subtle chipped brick corner relief
      buf.rect(4 + frame * 2, 4, 2, 1, '#48181c');
      buf.set(4 + frame * 2, 3, t.wallTopHi);
    }
  } else if (t.pattern === 'sewers' || t.pattern === 'pizza') {
    // Solid mossy dark olive (#344030 / #384434) with subtle damp stone speckling
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 236) buf.set(px, py, t.wallTopHi);
        else if (hsh < 18) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 2) {
      buf.set(5, 11, '#4c7c32');
      buf.set(6, 12, '#3d6628');
    }
  } else {
    // Vault, Mansion, HQ, Crib: clean subtle roof stone/metal panels
    for (let px = 0; px < w; px++) {
      if (hash2d(px, frame, seed) > 180) buf.set(px, 0, t.wallTopHi);
      if (hash2d(px, frame + 7, seed) < 90) buf.set(px, 15, t.wallTopDark);
    }
    if (frame === 2) {
      buf.line(3, 8, 12, 8, t.wallTopDark);
    }
  }

  buf.flush(ctx, x, y);
}

/**
 * Native 1x 16x16 wall south cliff/brick front face (`sprWall*Bot`).
 * Note: In 2.5D rendering, `sprWall*Top` overlaps `y = 0..7` from above (`py - 8`),
 * so `y = 8..15` is the visible 8px-tall front wall cliff/facade directly above the floor!
 */
function drawBiomeWallBot16(
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

  // Base fill across all 16 rows
  buf.rect(0, 0, w, h, t.wallBot);

  if (t.pattern === 'desert' || t.pattern === 'campfire') {
    // Stratified dusty sandstone cliff with crisp weathered rocky overhang notches & vertical fissures (04_desert_1_1.png!)
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, t.wallBot);
    buf.rect(0, 13, w, 2, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Weathered sandstone rim overhang notches at y=8..9 + organic vertical rock fissures
    for (let px = 0; px < w; px++) {
      const hsh = hash2d(px, frame, seed);
      const notch = (px * 3 + frame * 5) % 5;
      if (notch === 0 || notch === 2) {
        buf.set(px, 8, t.wallTopHi);
        buf.set(px, 9, t.wallTop);
      } else if (notch === 1) {
        buf.rect(px, 8, 1, 5, t.wallBotDark);
        buf.set(px, 13, t.wallOut);
      } else {
        buf.set(px, 8, t.wallBotHi);
      }
      if (hsh > 205) {
        buf.rect(px, 10, 1, 4, t.wallBotDark);
      } else if (hsh < 55) {
        buf.set(px, 11, t.wallBotHi);
        buf.set(px, 12, t.wallBot);
      }
    }
  } else if (t.pattern === 'oasis') {
    // Thick lush dark sea-green kelp cliff overhang (#1a5c4a / #103e32) hanging over luminous mint water!
    buf.rect(0, 0, w, 8, t.wallTopDark);
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Dense layered dark-emerald hanging seaweed curtains across y=8..14
    for (let px = 0; px < w; px++) {
      const drop = 3 + (hash2d(px, frame, seed) % 4);
      const frondCol = (px + frame) % 3 === 0 ? '#329848' : (px & 1) === 0 ? '#1e6b4c' : '#16523e';
      buf.rect(px, 8, 1, Math.min(6, drop), frondCol);
      buf.set(px, 8, (px + frame) % 2 === 0 ? '#3eb054' : '#267c52');
      if (drop >= 5) buf.set(px, 8 + drop, '#0e362a');
    }
  } else if (t.pattern === 'sewers' || t.pattern === 'pizza') {
    // Mossy damp sewer bricks (#263022, #1d261a) with vibrant green slime drips!
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 11, w, 1, t.wallOut);
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let bx = 0; bx < w; bx += 8) {
      buf.rect(bx, 8, 1, 3, t.wallOut);
      buf.rect((bx + 4) & 15, 12, 1, 3, t.wallOut);
      buf.rect(bx + 1, 8, 6, 1, t.wallBotHi);
    }
    if (frame >= 1) {
      const sx = (frame * 5 + 2) % 12;
      buf.rect(sx, 8, 2, 4 + (frame & 1), t.accent);
      buf.set(sx, 8, t.accent2);
      buf.set(sx + 1, 13, '#3b7a2a');
    }
  } else if (t.pattern === 'scrapyard') {
    // Jagged craggy concrete rubble & carved boulder cliff face (#646a72, #4a4f57) matching 06_scrapyard_3_3.png!
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, t.wallBot);
    buf.rect(0, 13, w, 2, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Jagged rocky overhang boulders & deep irregular fissures in y=8..14
    const boulders: Array<[number, number, number, number]> = [
      [0, 8, 4, 4], [5, 8, 5, 3], [11, 8, 5, 4],
      [2, 11, 5, 3], [8, 11, 6, 4],
    ];
    for (let i = 0; i < boulders.length; i++) {
      const [bx, by, bw, bh] = boulders[i]!;
      const ox = (bx + frame * 3) & 15;
      const cw = Math.min(bw, w - ox);
      buf.rect(ox, by, cw, bh, i % 2 === 0 ? '#787f88' : '#646a72');
      buf.rect(ox, by, Math.max(1, cw - 1), 1, '#989ea6');
      buf.rect(ox, by + bh - 1, cw, 1, '#3e434a');
      if (ox > 0) buf.rect(ox - 1, by, 1, bh, '#42474f');
    }
    // Warm rust scrap flecks
    buf.rect((4 + frame * 3) % 13, 10, 2, 2, '#9e5636');
    buf.set((5 + frame * 3) % 13, 11, '#683620');
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // True 2-tier raw faceted amethyst rock cliff (#563286) dotted with CRISP GLOWING ORANGE EMBERS (#ff8c28)!
    buf.rect(0, 0, w, 8, t.wallTopDark);
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Chiseled vertical amethyst facets + jagged rim
    for (let px = 0; px < w; px += 4) {
      buf.rect(px, 8, 1, 7, t.wallBotDark);
      buf.rect(px + 1, 8, 2, 3, t.wallBotHi);
      buf.set(px + 1, 8, t.wallTopHi);
    }
    if (frame === 1 || frame === 3) {
      const ex = frame === 1 ? 4 : 11;
      buf.rect(ex, 10, 2, 2, t.accent);
      buf.set(ex, 10, t.accent2);
    }
    if (frame === 2) {
      buf.rect(7, 11, 2, 2, t.accent);
      buf.set(7, 11, t.accent2);
    }
  } else if (t.pattern === 'frozen') {
    // Crisp jagged fractured icicle & overhanging snow cornice cliff face (10_frozen_5_1 / 13_frozen_5_3!)
    buf.rect(0, 0, w, 9, '#c4ccd2');
    buf.rect(0, 9, w, 3, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let px = 0; px < w; px++) {
      const tooth = (px * 5 + frame * 3) % 5;
      const icicleH = tooth === 0 ? 4 : tooth === 1 ? 3 : tooth === 2 ? 2 : 1;
      buf.rect(px, 8, 1, icicleH, tooth === 0 ? '#eef4f8' : tooth === 1 ? '#d4dee6' : '#b8c4cc');
      if (tooth === 0) buf.set(px, 8 + icicleH, '#88b4d0'); // icy crystal tip
      if ((px & 3) === 2) buf.rect(px, 10, 1, 5, t.wallOut);
    }
  } else if (t.pattern === 'jungle') {
    // Dense bumpy serrated overhanging foliage border (#5eb228/#438428/#286416) over dark jungle roots (11b_levelup.png!)
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, '#3a2d18');
    buf.rect(0, 13, w, 2, '#281e10');
    buf.rect(0, 15, w, 1, '#181209');
    for (let px = 0; px < w; px++) {
      const leafDrop = 3 + (hash2d(px, frame, seed + 7) % 4);
      buf.rect(px, 8, 1, leafDrop, (px + frame) % 2 === 0 ? t.wallBot : t.wallBotDark);
      buf.set(px, 8, (px + frame) % 3 === 0 ? '#5eb228' : '#438428');
      if (leafDrop >= 5) buf.set(px, 8 + leafDrop - 1, '#1a440d');
    }
  } else if (t.pattern === 'labs') {
    // True 2-tier raw dark lab bulkhead (#18343a) + BRIGHT GLOWING #5ce040 LIME PIPE STRIP + cyan/red monitor LEDs!
    buf.rect(0, 0, w, 8, t.wallTop);
    buf.rect(0, 8, w, 7, t.wallBot);
    buf.rect(0, 15, w, 1, t.wallOut);
    buf.rect(0, 8, 1, 7, t.wallBotDark);
    buf.rect(1, 8, 1, 7, t.wallBotHi);
    // BRIGHT GLOWING LIME-GREEN HORIZONTAL PIPE STRIP across y=9..10!
    buf.rect(0, 9, w, 1, '#b2ff80');
    buf.rect(0, 10, w, 1, '#5ce040');
    buf.rect(0, 11, w, 1, '#1c5628');
    // Lower dark metal vent + vivid cyan/red monitor LEDs!
    buf.rect(2, 12, 12, 2, t.wallBotDark);
    if (frame === 1 || frame === 3) {
      buf.set(5, 13, '#42e0f0');
      buf.set(10, 13, '#f03838');
    } else if (frame === 2) {
      buf.set(8, 13, '#5ce040');
    }
  } else if (t.pattern === 'palace') {
    // Weathered terracotta brick courses with chipped stone rim relief (#7a3e40 / #5c2528 / #40161a) matching 15_palace_7_1.png!
    buf.rect(0, 0, w, 8, t.wallTop);
    buf.rect(0, 8, w, 7, t.wallBot);
    buf.rect(0, 11, w, 1, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let bx = 0; bx < w; bx += 8) {
      buf.rect(bx, 8, 1, 3, t.wallBotDark);
      buf.rect(bx + 1, 8, 6, 1, t.wallBotHi);
      if ((bx + frame * 4) % 16 === 0) buf.set(bx + 3, 8, '#40161a'); // chipped stone notch
      const lx = (bx + 4) & 15;
      buf.rect(lx, 12, 1, 3, t.wallBotDark);
      buf.rect((lx + 1) & 15, 12, 3, 1, t.wallBotHi);
    }
    if (frame === 3) {
      buf.rect(6, 11, 2, 1, '#58f048');
      buf.set(7, 12, '#2d7a24');
    }
  } else {
    // Vault, Mansion, HQ, Crib: clean 2-course masonry / metal facade in y=8..15
    buf.rect(0, 8, w, 7, t.wallBot);
    buf.rect(0, 8, w, 1, t.wallBotHi);
    buf.rect(0, 11, w, 1, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let bx = 0; bx < w; bx += 8) {
      buf.rect(bx, 8, 1, 3, t.wallBotDark);
      buf.rect((bx + 4) & 15, 12, 1, 3, t.wallBotDark);
    }
    if (t.pattern === 'mansion' || t.pattern === 'crib') {
      buf.rect(0, 9, w, 1, t.accent);
    } else if (t.pattern === 'hq') {
      buf.rect(0, 10, w, 1, t.accent);
    } else if (t.pattern === 'vault' && frame === 2) {
      buf.rect(6, 10, 4, 1, t.accent);
    }
  }

  buf.flush(ctx, x, y);
}

// ============================================================================
// REGISTER ALL CRISP 1x WORLD TILESETS, CARPET, CHESTS, PICKUPS, PORTALS & PROPS
// ============================================================================

export function registerFallbackWorld(b: FallbackAtlasBuilder): void {
  // 1. ALL 16 BIOME NATIVE 1x TILESETS (ZERO 2x MIXELS!)
  for (const theme of BIOME_THEMES) {
    // 32x32 calm 2x2 floor slabs
    b.addSprite(`sprFloor${theme.code}`, 32, 32, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeFloor32(ctx, x, y, w, h, f, theme, false),
    );
    // 32x32 Alt-B variety floor slabs (Frozen striped ice, Scrapyard grates, Caves cobwebs, Oasis kelp!)
    b.addSprite(`sprFloor${theme.code}B`, 32, 32, 0, 0, 2, (ctx, x, y, w, h, f) =>
      drawBiomeFloor32(ctx, x, y, w, h, f, theme, true),
    );
    // 12x12 sparse subtle floor micro-details
    b.addSprite(`sprDetail${theme.code}`, 12, 12, 6, 6, 6, (ctx, x, y, w, h, f) =>
      drawBiomeDetail12(ctx, x, y, w, h, f, theme),
    );
    // 16x16 blasted wall rubble craters
    b.addSprite(`sprFloor${theme.code}Explo`, 16, 16, 0, 0, 3, (ctx, x, y, w, h, f) =>
      drawBiomeFloorExplo16(ctx, x, y, w, h, f, theme),
    );
    // 16x16 seamless roof-matched wall tops
    b.addSprite(`sprWall${theme.code}Top`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallTop16(ctx, x, y, w, h, f, theme),
    );
    // 16x16 crisp 2.5D wall south front faces (visible band y=8..15)
    b.addSprite(`sprWall${theme.code}Bot`, 16, 16, 0, 0, 4, (ctx, x, y, w, h, f) =>
      drawBiomeWallBot16(ctx, x, y, w, h, f, theme),
    );
    // 18x18 subtle biome-matched wall base contour (ZERO harsh cartoon black frames!)
    b.addSprite(`sprWall${theme.code}Out`, 18, 18, 1, 1, 1, (ctx, x, y, w, h) => {
      const buf = new PxCanvas(w, h);
      buf.rect(0, 0, w, h, theme.wallOut);
      buf.rect(1, 1, w - 2, h - 2, theme.wallBotDark);
      buf.flush(ctx, x, y);
    });
    b.addAlias(`sprWall${theme.code}Trans`, `sprWall${theme.code}Bot`);
  }

  // 2. PALACE 7-3 ROYAL CRIMSON CARPET (`sprCarpet`, 48x960, ox=24, oy=0)
  // Vibrant royal crimson #a01f31 with crisp 1px light-gold side trim #d8b85c matching 17_throne_hall.png!
  b.addSprite('sprCarpet', 48, 960, 24, 0, 1, (ctx, x, y, w, h) => {
    const bx = x | 0;
    const by = y | 0;
    // Outer dark crimson fringe edge
    ctx.fillStyle = '#5a0e1a';
    ctx.fillRect(bx, by, w, h);
    // Crisp 1px gold outer piping trim
    ctx.fillStyle = '#d8b85c';
    ctx.fillRect(bx + 1, by, 1, h);
    ctx.fillRect(bx + w - 2, by, 1, h);
    // Dark crimson inner groove beside gold trim
    ctx.fillStyle = '#731422';
    ctx.fillRect(bx + 2, by, 2, h);
    ctx.fillRect(bx + w - 4, by, 2, h);
    // Vibrant royal crimson main runner body
    ctx.fillStyle = '#a01f31';
    ctx.fillRect(bx + 4, by, w - 8, h);
    // Subtle sunlit inner highlight strip & woven carpet bands every 16px
    ctx.fillStyle = '#b4293d';
    ctx.fillRect(bx + 5, by, 2, h);
    ctx.fillStyle = '#8e192a';
    ctx.fillRect(bx + w - 7, by, 2, h);
    ctx.fillStyle = '#921a2b';
    for (let ry = 0; ry < h; ry += 16) {
      ctx.fillRect(bx + 6, by + ry, w - 12, 1);
    }
    // Ornate golden Throne emblem woven near the top dais steps
    ctx.fillStyle = '#d8b85c';
    ctx.fillRect(bx + 1, by, w - 2, 1);
    ctx.fillRect(bx + 1, by + h - 1, w - 2, 1);
    const cy = by + 24;
    const cx = bx + 24;
    for (let dy = -6; dy <= 6; dy++) {
      const span = 6 - Math.abs(dy);
      ctx.fillRect(cx - span, cy + dy, 1, 1);
      ctx.fillRect(cx + span, cy + dy, 1, 1);
    }
    ctx.fillStyle = '#f0d884';
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    ctx.fillStyle = '#731422';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
  });

  // 3. CRISP 1x ANIMATED CAMPFIRE & CAMPFIRE OFF (24x24)
  b.addSprite('sprCampfire', 24, 24, 12, 14, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Ash bed & stone ring
    buf.ellipse(12, 17, 8, 4, '#2a2220');
    buf.rect(6, 15, 12, 3, '#6e4226');
    buf.rect(7, 16, 10, 2, '#4a2b18');
    // Ring stones around base
    const stones: Array<[number, number]> = [[4, 16], [8, 19], [13, 19], [17, 17], [19, 15]];
    for (const [sx, sy] of stones) {
      buf.rect(sx!, sy!, 3, 2, '#7c747e');
      buf.set(sx!, sy!, '#a8a0aa');
    }
    // Glowing coal bed
    buf.rect(9, 16, 6, 2, '#ff6a1c');
    buf.rect(10, 16, 4, 1, '#ffd440');
    // Crisp 1x dancing pixel flames
    const sway = f === 1 ? -1 : f === 3 ? 1 : 0;
    const tall = (f & 1) === 0 ? 1 : 0;
    buf.poly([[7, 16], [6, 11], [11 + sway, 3 - tall], [16, 9], [17, 16]], '#d42c1a');
    buf.poly([[8, 16], [8 + sway, 10], [12 + sway, 5 - tall], [15, 11], [15, 16]], '#ff7420');
    buf.poly([[10, 16], [10, 11], [12 + sway, 8], [14, 12], [14, 16]], '#ffda42');
    buf.rect(11, 13, 2, 3, '#fff9d0');
    buf.outline(INK);
    // Rising spark pixel
    buf.set(9 + ((f * 3) % 7), 2 + (f & 1), '#ffe866');
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprCampfireOff', 24, 24, 12, 14, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(12, 17, 8, 4, '#241e20');
    buf.rect(6, 15, 12, 3, '#3c302c');
    const stones: Array<[number, number]> = [[4, 16], [8, 19], [13, 19], [17, 17], [19, 15]];
    for (const [sx, sy] of stones) {
      buf.rect(sx!, sy!, 3, 2, '#625c68');
      buf.set(sx!, sy!, '#847e8c');
    }
    buf.set(11, 16, '#cc3c1c');
    buf.set(12, 16, '#ff7830');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 4. CRISP 1x SWIRLING GALAXY PORTALS (32x32)
  const drawSwirlPortal1x = (
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
    const pulse = (f & 1) === 0 ? 1 : 0;
    buf.ellipse(cx, cy, 13 + pulse, 13 + pulse, rim);
    buf.ellipse(cx, cy, 11, 11, outer);
    buf.ellipse(cx, cy, 8, 8, mid);

    const baseAng = (f / 6) * Math.PI * 2;
    for (let arm = 0; arm < 4; arm++) {
      for (let step = 2; step <= 11; step++) {
        const ang = baseAng + (arm * Math.PI * 2) / 4 + step * 0.32;
        const px = Math.round(cx + Math.cos(ang) * step);
        const py = Math.round(cy + Math.sin(ang) * step);
        buf.set(px, py, step < 6 ? armInner : armOuter);
      }
    }
    buf.ellipse(cx, cy, 4, 4, coreRing);
    buf.ellipse(cx, cy, 2, 2, '#ffffff');
    // Orbiting energy sparkles
    for (let s = 0; s < 4; s++) {
      const a = baseAng * 1.5 + s * (Math.PI * 0.5);
      buf.set(Math.round(cx + Math.cos(a) * 13), Math.round(cy + Math.sin(a) * 13), armInner);
    }
    buf.flush(ctx, x, y);
  };

  b.addSprite('sprPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal1x(ctx, x, y, w, h, f, '#1e0834', '#56158c', '#9838e6', '#d87cff', '#fce2ff', '#e8a8ff'),
  );
  b.addAlias('sprPortalClear', 'sprPortal');
  b.addSprite('sprProtoPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal1x(ctx, x, y, w, h, f, '#082618', '#146e40', '#28c46c', '#76ffa8', '#e2ffed', '#a8ffc8'),
  );
  b.addSprite('sprPopoPortal', 32, 32, 16, 16, 6, (ctx, x, y, w, h, f) =>
    drawSwirlPortal1x(ctx, x, y, w, h, f, '#08183a', '#1646a0', '#2e88f0', '#78daff', '#e4faff', '#aceeff'),
  );

  b.addSprite('sprPortalIndicator', 12, 12, 6, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(6, 6, 4, 4, '#9a38e6');
    buf.ellipse(6, 6, 2, 2, f === 0 ? '#f4ccff' : '#ffffff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprIDPDPortalStart', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = 3 + f * 2;
    buf.ellipse(12, 12, r + 2, r + 2, '#10244d');
    buf.ellipse(12, 12, r, r, '#2e84f0');
    buf.ellipse(12, 12, Math.max(1, r - 3), Math.max(1, r - 3), '#b4f4ff');
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprVanPortalStart', 32, 32, 16, 16, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = 6 + f * 2;
    buf.ellipse(16, 16, r + 3, r + 2, '#0c1a40');
    buf.ellipse(16, 16, r, r, '#338cff');
    buf.ellipse(16, 16, Math.max(2, r - 3), Math.max(2, r - 3), '#d4faff');
    buf.flush(ctx, x, y);
  });

  // 5. CRISP 1x PICKUPS & SHELL CASINGS (BLACK-OUTLINED ICONIC NUCLEAR THRONE SILHOUETTES!)
  b.addSprite('sprRad', 10, 10, 5, 5, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.grid(3, 3, [
      '.gg.',
      'gLLg',
      'gWWg',
      '.gg.',
    ], {
      g: '#2cc842',
      L: f % 2 === 0 ? '#68ff58' : '#a8ff80',
      W: f % 2 === 0 ? '#d8ffd0' : '#ffffff',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprRadBig', 14, 14, 7, 7, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.grid(3, 3, [
      '..gggg..',
      '.gLLLLg.',
      'gLLWWLLg',
      'gLWWWWLg',
      'gLLWWLLg',
      'gLLLLLLg',
      '.gddddg.',
      '..dddd..',
    ], {
      d: '#1fa032',
      g: '#36e04c',
      L: f % 2 === 0 ? '#74ff64' : '#aeff8c',
      W: '#ffffff',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprBigRad', 'sprRadBig');

  b.addSprite('sprAmmo', 12, 10, 6, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.grid(2, 2, [
      'yyyyyyyy',
      'yYYYYYYy',
      'yYYWWYYy',
      'yYbbbbYy',
      'ybbbbbbY',
      'dddddddd',
    ], {
      Y: '#ffe052',
      y: '#e6a828',
      b: '#b87618',
      d: '#7c4c10',
      W: f === 1 ? '#ffffff' : '#fff6b8',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprHP', 12, 10, 6, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Crisp white medkit pack with unmistakable crimson red heart/cross (matching 12_jungle.png!)
    buf.grid(2, 2, [
      'WWWWWWWW',
      'WWWRRWWW',
      'WWRRRRWW',
      'WWWRRWWW',
      'WggggggW',
      'gggggggg',
    ], {
      W: f === 1 ? '#ffffff' : '#eeeef4',
      g: '#b8bac8',
      R: '#e82430',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprMedkit', 'sprHP');

  b.addSprite('sprRogueAmmo', 10, 12, 5, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.grid(2, 2, [
      '.bbbb.',
      'bBBBBb',
      'bCCCCb',
      'bCWCCb',
      'bCCCCb',
      'bddddb',
      'bCCCCb',
      '.bbbb.',
    ], {
      b: '#2d5ec4',
      B: '#588ce8',
      d: '#1c3b82',
      C: f === 0 ? '#4ec8ff' : '#9cf4ff',
      W: '#ffffff',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprBulletShell', 4, 3, 2, 1, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(0, 0, 4, 3, INK);
    buf.rect(1, 1, 2, 1, '#f0c438');
    buf.set(1, 1, '#fff5a6');
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprShotShell', 5, 3, 2, 1, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(0, 0, 5, 3, INK);
    buf.rect(1, 1, 2, 1, '#e03028');
    buf.set(3, 1, '#f0c438');
    buf.flush(ctx, x, y);
  });

  // 6. CRISP 1x BLACK-OUTLINED CHESTS WITH AUTHENTIC 7-FRAME GLINT CADENCE!
  // f0 = idle, f1 = pure white hurt flash, f2..f6 = periodic diagonal glint sheen
  const drawChest1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    lidHex: string,
    lidHi: string,
    bodyHex: string,
    bodyDark: string,
    trimHex: string,
    open: boolean,
  ): void => {
    const buf = new PxCanvas(w, h);
    const ix = 2;
    const iw = w - 4;
    if (open) {
      // Open hinged lid back + hollow dark chest interior
      buf.rect(ix, 2, iw, 4, bodyDark);
      buf.rect(ix + 1, 2, iw - 2, 1, lidHex);
      buf.rect(ix, 6, iw, h - 8, bodyHex);
      buf.rect(ix + 1, 6, iw - 2, 4, '#140e18');
      buf.rect(ix, h - 3, iw, 1, bodyDark);
      buf.rect(Math.floor(w / 2) - 1, 10, 2, 2, trimHex);
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    if (f === 1) {
      // Authentic pure-white hurt flash frame
      buf.rect(ix, 3, iw, h - 5, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    const midY = Math.floor(h * 0.5);
    // Bright top lid
    buf.rect(ix, 3, iw, midY - 3, lidHex);
    buf.rect(ix + 1, 3, iw - 2, 1, lidHi);
    buf.rect(ix + 1, 4, iw - 2, 1, lidHi);
    // Dark seam band
    buf.rect(ix, midY, iw, 1, INK);
    // Lower chest body
    buf.rect(ix, midY + 1, iw, h - midY - 3, bodyHex);
    buf.rect(ix, h - 3, iw, 1, bodyDark);
    // Vertical metallic side straps
    buf.rect(ix + 2, 3, 2, h - 5, bodyDark);
    buf.rect(ix + iw - 4, 3, 2, h - 5, bodyDark);
    buf.set(ix + 2, 4, trimHex);
    buf.set(ix + iw - 4, 4, trimHex);
    // Central clasp latch
    const cx = Math.floor(w / 2) - 2;
    buf.rect(cx, midY - 1, 4, 3, trimHex);
    buf.rect(cx + 1, midY, 2, 1, '#ffffff');

    // Periodic diagonal glint sweep on frames 2..6
    if (f >= 2 && f <= 6) {
      const gx = ix + (f - 2) * 3;
      for (let dy = 0; dy < 5; dy++) {
        const px = gx + dy - 1;
        const py = 3 + dy;
        if (px >= ix && px < ix + iw && py < h - 2) {
          buf.set(px, py, '#ffffff');
        }
      }
    }

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  // Bright red/gold Weapon Chest matching 04_desert_1_1 & 12_jungle!
  b.addSprite('sprWeaponChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#eb3b2c', '#ff6e54', '#82222c', '#4c141c', '#f0cc58', false),
  );
  b.addSprite('sprWeaponChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#9a2420', '#c43a30', '#681c24', '#401016', '#a88a38', true),
  );
  b.addSprite('sprWeaponChestBig', 24, 18, 12, 9, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#e8342a', '#ff7050', '#942430', '#5a161e', '#ffe058', false),
  );
  b.addSprite('sprWeaponChestBigOpen', 24, 18, 12, 9, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#9c2220', '#c43a30', '#6c1c24', '#421016', '#b89438', true),
  );
  // Iconic gold/amber Ammo Chest matching 04_desert_1_1 & 12_jungle!
  b.addSprite('sprAmmoChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#f0b828', '#ffe468', '#b86c1c', '#7c4410', '#d8dee6', false),
  );
  b.addSprite('sprAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#a87c1a', '#cfa030', '#7e4812', '#522c0a', '#9aa0a8', true),
  );
  b.addSprite('sprIDPDChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#3474d8', '#68b0ff', '#22468a', '#162d5c', '#88f0ff', false),
  );
  b.addAlias('sprRogueAmmoChest', 'sprIDPDChest');
  b.addSprite('sprRogueAmmoChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#244e94', '#4078c4', '#183062', '#101f40', '#58b4d0', true),
  );
  b.addSprite('sprGoldChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#f5c838', '#fff49c', '#c88c1a', '#8a5c0c', '#ff4058', false),
  );
  b.addSprite('sprGoldChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#b88c1e', '#d8b038', '#8a5c0e', '#5c3c08', '#a82838', true),
  );
  b.addSprite('sprCursedChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#68249c', '#a84ce8', '#3e1662', '#260c3d', '#ff64e0', false),
  );
  b.addSprite('sprCursedChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#441668', '#6e289c', '#2b0e44', '#1a082b', '#a83c94', true),
  );
  b.addSprite('sprCursedChestBig', 24, 18, 12, 9, 7, (ctx, x, y, w, h, f) =>
    drawChest1x(ctx, x, y, w, h, f, '#7026a8', '#b654f5', '#421668', '#280c42', '#ff70e8', false),
  );
  b.addSprite('sprCursedChestBigOpen', 24, 18, 12, 9, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#48186e', '#722aa4', '#2e1048', '#1c082e', '#a83c94', true),
  );
  // Bright Medkit Health Chest
  b.addSprite('sprHealthChest', 18, 16, 9, 8, 7, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 1) {
      buf.rect(2, 3, w - 4, h - 5, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    buf.rect(2, 3, 14, 11, '#eceaf2');
    buf.rect(3, 3, 12, 2, '#ffffff');
    buf.rect(2, 12, 14, 2, '#b8b6c6');
    buf.rect(8, 5, 2, 6, '#e62430');
    buf.rect(6, 7, 6, 2, '#e62430');
    if (f >= 2 && f <= 6) {
      const gx = 2 + (f - 2) * 3;
      buf.set(gx, 4, '#ffffff');
      buf.set(gx + 1, 5, '#ffffff');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addSprite('sprHealthChestOpen', 18, 16, 9, 8, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#c8c6d4', '#e8e6f0', '#9694a4', '#686674', '#e62430', true),
  );
  b.addSprite('sprProtoChest', 20, 18, 10, 9, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#5a6880', '#7c8ca8', '#3c4658', '#252c38', '#4ef080', false),
  );
  b.addSprite('sprProtoChestOpen', 20, 18, 10, 9, 1, (ctx, x, y, w, h) =>
    drawChest1x(ctx, x, y, w, h, 0, '#3e485a', '#5a6880', '#2b3240', '#1c202a', '#2ea854', true),
  );

  // CRISP 1x GLOWING NEON-GREEN RAD CANISTER (18x20)
  const drawRadCanister1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    state: 'idle' | 'hurt' | 'dead',
  ): void => {
    const buf = new PxCanvas(w, h);
    if (state === 'dead') {
      buf.ellipse(9, 15, 6, 3, '#2da842');
      buf.ellipse(9, 15, 4, 2, '#6eff78');
      buf.rect(4, 12, 10, 5, '#54606e');
      buf.rect(5, 11, 8, 1, '#808e9c');
      buf.set(6, 10, '#a8ffaa');
      buf.set(11, 10, '#a8ffaa');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (state === 'hurt' || f === 1) {
      buf.rect(4, 2, 10, 16, '#ffffff');
      buf.rect(7, 1, 4, 2, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // Glowing neon-green cylinder body
    buf.rect(5, 5, 8, 11, '#36d948');
    buf.rect(6, 5, 5, 11, '#68ff68');
    buf.rect(6, 6, 2, 9, '#d8ffd4');
    // Rising bubble animation across glint frames
    const by = 13 - ((f * 2) % 7);
    buf.set(9, by, '#ffffff');
    // Center containment band
    buf.rect(4, 10, 10, 1, '#3c4654');
    // Top & bottom bolted steel caps + valve
    buf.rect(4, 3, 10, 3, '#6c7888');
    buf.rect(5, 3, 8, 1, '#9aa8b8');
    buf.rect(7, 1, 4, 2, '#54606e');
    buf.rect(4, 15, 10, 3, '#54606e');
    buf.rect(5, 17, 8, 1, '#363e4a');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprRadChest', 18, 20, 9, 10, 7, (ctx, x, y, w, h, f) => drawRadCanister1x(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprRadChestHurt', 18, 20, 9, 10, 1, (ctx, x, y, w, h) => drawRadCanister1x(ctx, x, y, w, h, 0, 'hurt'));
  b.addSprite('sprRadChestDead', 18, 20, 9, 10, 1, (ctx, x, y, w, h) => drawRadCanister1x(ctx, x, y, w, h, 0, 'dead'));

  // 7. CRISP 1x WRECKED CARS (28x18, matching 07_bigdog_3_3.png top-left junk car!)
  const drawCar1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    bodyHex: string,
    bodyHi: string,
    bodyDark: string,
    glassHex: string,
    mode: 'idle' | 'hurt' | 'dead' | 'frozen' | 'venus' | 'venusFixed',
    f = 0,
  ): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'dead') {
      buf.rect(3, 5, 22, 9, '#342c30');
      buf.rect(5, 6, 16, 6, '#18141a');
      buf.rect(8, 8, 6, 3, '#5a342a');
      buf.rect(18, 7, 2, 2, '#ff6a28');
      buf.set(18, 7, '#ffe060');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'hurt') {
      buf.rect(2, 4, 24, 11, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // 4 subtle wheel wells
    buf.rect(5, 2, 4, 2, '#242028');
    buf.rect(19, 2, 4, 2, '#242028');
    buf.rect(5, 14, 4, 2, '#242028');
    buf.rect(19, 14, 4, 2, '#242028');
    // Main car body chassis
    buf.rect(2, 4, 24, 10, bodyHex);
    buf.rect(3, 4, 22, 2, bodyHi);
    buf.rect(3, 12, 22, 2, bodyDark);
    // Front & rear windshields
    buf.rect(7, 5, 13, 8, glassHex);
    buf.set(17, 6, '#b8d8e8');
    buf.set(18, 7, '#ffffff');
    // Roof panel
    buf.rect(10, 5, 6, 8, bodyHex);
    buf.rect(11, 5, 4, 2, bodyHi);
    // Headlights & taillights
    buf.rect(25, 5, 1, 2, mode === 'venusFixed' ? '#ffffff' : '#ffe878');
    buf.rect(25, 11, 1, 2, mode === 'venusFixed' ? '#ffffff' : '#ffe878');
    buf.rect(2, 5, 1, 2, '#e03028');
    buf.rect(2, 11, 1, 2, '#e03028');

    if (mode === 'idle') {
      // Rust dent specks
      buf.rect(4, 9, 2, 2, '#6e2c1e');
      buf.set(21, 7, '#6e2c1e');
    } else if (mode === 'frozen') {
      // Crisp white snowdrift on roof & hood
      buf.rect(9, 6, 8, 5, '#dce8f0');
      buf.rect(20, 6, 4, 4, '#eef6fc');
    } else if (mode === 'venusFixed') {
      const sx = f === 0 ? 12 : 21;
      const sy = f === 0 ? 6 : 10;
      buf.rect(sx - 1, sy, 3, 1, '#ffffff');
      buf.rect(sx, sy - 1, 1, 3, '#ffffff');
    }

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  b.addSprite('sprCarIdle', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCar1x(ctx, x, y, w, h, '#a84438', '#c85c4c', '#6e2822', '#26222c', 'idle'),
  );
  b.addAlias('sprCar', 'sprCarIdle');
  b.addSprite('sprCarHurt', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCar1x(ctx, x, y, w, h, '#ffffff', '#ffffff', '#ffffff', '#ffffff', 'hurt'),
  );
  b.addSprite('sprCarDead', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCar1x(ctx, x, y, w, h, '#342c30', '#484044', '#1c161a', '#141016', 'dead'),
  );
  b.addSprite('sprFrozenCar', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCar1x(ctx, x, y, w, h, '#6a8ba8', '#8ab0cc', '#46627c', '#2a3c50', 'frozen'),
  );
  b.addSprite('sprVenusCar', 28, 18, 14, 9, 1, (ctx, x, y, w, h) =>
    drawCar1x(ctx, x, y, w, h, '#e8b628', '#ffe468', '#a67414', '#2e1e3c', 'venus'),
  );
  b.addAlias('sprGoldCar', 'sprVenusCar');
  b.addSprite('sprVenusCarFixed', 28, 18, 14, 9, 2, (ctx, x, y, w, h, f) =>
    drawCar1x(ctx, x, y, w, h, '#f5c834', '#fff498', '#b88218', '#3c2452', 'venusFixed', f),
  );

  // 8. CRISP 1x BARRELS, CACTI, BONES, COBWEB, CRYSTALS & ALL BIOME PROPS
  const drawBarrel1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    bodyHex: string,
    hiHex: string,
    darkHex: string,
    bandHex: string,
    toxic = false,
    oasis = false,
  ): void => {
    const buf = new PxCanvas(w, h);
    buf.rect(3, 2, 8, 12, bodyHex);
    buf.rect(4, 2, 2, 12, hiHex);
    buf.rect(9, 2, 2, 12, darkHex);
    // Top rim oval
    buf.rect(4, 2, 6, 2, hiHex);
    buf.rect(5, 3, 4, 1, darkHex);
    // Center hazard band & metal ribs
    buf.rect(3, 6, 8, 4, bandHex);
    buf.rect(3, 5, 8, 1, darkHex);
    buf.rect(3, 10, 8, 1, darkHex);
    if (toxic) {
      buf.rect(7, 2, 3, 4, '#7aff40');
      buf.rect(8, 3, 1, 5, '#c8ff90');
    }
    if (oasis) {
      buf.set(9, 4, '#e85268');
      buf.set(4, 11, '#44b054');
      buf.set(5, 12, '#2d7a3c');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) =>
    drawBarrel1x(ctx, x, y, w, h, '#d83028', '#ff5848', '#8c1c18', '#f0c840'),
  );
  b.addSprite('sprToxicBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) =>
    drawBarrel1x(ctx, x, y, w, h, '#2c8834', '#4cb84e', '#1a5820', '#96ff48', true),
  );
  b.addSprite('sprOasisBarrel', 14, 16, 7, 8, 1, (ctx, x, y, w, h) =>
    drawBarrel1x(ctx, x, y, w, h, '#6e523c', '#8c6c52', '#483426', '#4a7a74', false, true),
  );

  // Crisp 1x black-outlined green Desert Cacti matching 04_desert_1_1.png!
  const drawCactus1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, variant: number): void => {
    const buf = new PxCanvas(w, h);
    const pal = {
      g: '#527e34',
      h: '#72a446',
      d: '#365822',
      f: '#ff5c98',
      y: '#ffe860',
    };
    if (variant === 2) {
      // Round ribbed barrel cactus (matches bottom-left cactus in 04_desert_1_1.png!)
      buf.grid(3, 5, [
        '...ff...',
        '..gddg..',
        '.ghdgdh.',
        'ghgdgdgh',
        'ghgdgdgh',
        'ghgdgdgh',
        '.ghdgdh.',
        '..dddd..',
      ], pal);
      buf.set(6, 5, pal.y);
    } else if (variant === 0) {
      // Iconic saguaro cactus with twin arms
      buf.grid(2, 2, [
        '.....ff.....',
        '....ghdg....',
        '....ghdg....',
        '.gg.ghdg....',
        '.hg.ghdg.gg.',
        '.hg.ghdg.hg.',
        '.hggghdg.hg.',
        '..ddghdgghg.',
        '....ghdgdd..',
        '....ghdg....',
        '....ghdg....',
        '....ghdg....',
        '....dddd....',
      ], pal);
    } else {
      buf.grid(2, 3, [
        '....ghdg....',
        '....ghdg.gg.',
        '....ghdg.hg.',
        '.gg.ghdg.hg.',
        '.hg.ghdgghg.',
        '.hggghdgdd..',
        '..ddghdg....',
        '....ghdg....',
        '....ghdg....',
        '....ghdg....',
        '....dddd....',
      ], pal);
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprCactus', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactus1x(ctx, x, y, w, h, 0));
  b.addSprite('sprCactus2', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactus1x(ctx, x, y, w, h, 1));
  b.addSprite('sprCactus3', 16, 18, 8, 10, 1, (ctx, x, y, w, h) => drawCactus1x(ctx, x, y, w, h, 2));

  // Bleached desert skull & ribcage (`sprBonePileIdle`, `sprBones`, `sprBonePile1`, `sprBonePile2`)
  const drawBonePile1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, variant: number): void => {
    const buf = new PxCanvas(w, h);
    const pal = {
      W: '#f4eedc',
      b: '#dfd4ba',
      d: '#a89c82',
      k: '#1c1518',
    };
    if (variant === 0) {
      buf.grid(2, 2, [
        '...WWWW...',
        '..WbbbbW..',
        '..bkbkbk..',
        '..bbkbbb..',
        '...bdbd...',
        '.bbddddbb.',
        'Wbb....bbW',
        '.dd....dd.',
      ], pal);
    } else {
      // Bleached ribcage + skull
      buf.grid(2, 3, [
        '.WW..WW..',
        'WbbWWbbW.',
        'bd.bb.db.',
        'WbbWWbbW.',
        '.ddbbdd..',
        '..bkkb...',
        '..dddd...',
      ], pal);
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprBonePileIdle', 16, 14, 8, 7, 1, (ctx, x, y, w, h) => drawBonePile1x(ctx, x, y, w, h, 0));
  b.addAlias('sprBones', 'sprBonePileIdle');
  b.addAlias('sprBonePile1', 'sprBonePileIdle');
  b.addSprite('sprBonePile2', 16, 14, 8, 7, 1, (ctx, x, y, w, h) => drawBonePile1x(ctx, x, y, w, h, 1));

  // Crisp 1x Crystal Caves white cobweb (`sprWeb`) matching 08_caves_4_1.png!
  b.addSprite('sprWeb', 24, 24, 12, 12, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const c1 = '#a4a0b8';
    const c2 = '#dcd8ec';
    buf.line(2, 2, 21, 21, c1);
    buf.line(21, 2, 2, 21, c1);
    buf.line(12, 1, 12, 22, c1);
    buf.line(1, 12, 22, 12, c1);
    buf.pixelRing(12, 12, 4, c2);
    buf.pixelRing(12, 12, 8, c1);
    buf.set(12, 12, '#ffffff');
    buf.flush(ctx, x, y);
  });

  // CRISP 1x FLUTED CLASSICAL PALACE COLUMN (`sprPalacePillar` terracotta-brick & weathered bronze matching steam_gens.png!)
  // ZERO neon-green stripes!
  const drawPillar1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, palace: boolean): void => {
    const buf = new PxCanvas(w, h);
    if (palace) {
      // Stepped classical terracotta-bronze base plinth
      buf.ellipse(9, 24, 6, 2, '#4a1c20');
      buf.ellipse(9, 23, 6, 2, '#7c3c3c');
      buf.rect(4, 22, 10, 1, '#a86050');
      // Fluted classical cylindrical shaft (#7e3c3c / #5c2628 / #a05848 rim)
      buf.rect(4, 8, 10, 15, '#7e3c3c');
      buf.rect(5, 8, 2, 15, '#a05848'); // sunlit left flute
      buf.rect(7, 8, 1, 15, '#5c2628'); // flute groove
      buf.rect(8, 8, 2, 15, '#8c4844'); // center flute
      buf.rect(10, 8, 1, 15, '#522024'); // flute groove
      buf.rect(11, 8, 2, 15, '#682e30'); // right flute
      buf.rect(13, 8, 1, 15, '#441a1e'); // deep right shadow
      // Rounded overhanging classical column capital + subtle top masonry crack
      buf.ellipse(9, 6, 6, 3, '#5c2628');
      buf.ellipse(9, 5, 6, 3, '#8a4642');
      buf.rect(5, 3, 7, 1, '#b26c5a');
      buf.line(7, 4, 11, 6, '#4c1c20'); // weathered top stone crack
    } else {
      // Weathered stone column
      buf.rect(3, 21, 12, 5, '#686274');
      buf.rect(5, 7, 8, 15, '#7a7488');
      buf.rect(6, 7, 2, 15, '#9892a8');
      buf.rect(11, 7, 2, 15, '#524c5c');
      buf.rect(3, 2, 12, 5, '#8a8498');
      buf.rect(4, 2, 10, 1, '#b0aac0');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprPillar', 18, 28, 9, 18, 1, (ctx, x, y, w, h) => drawPillar1x(ctx, x, y, w, h, false));
  b.addSprite('sprPalacePillar', 18, 28, 9, 18, 1, (ctx, x, y, w, h) => drawPillar1x(ctx, x, y, w, h, true));
  b.addAlias('sprNuclearPillar', 'sprPalacePillar');

  // CRISP 1x PROTO STATUE (24x32)
  const drawProtoStatue1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    state: 'idle' | 'charge' | 'hurt',
  ): void => {
    const buf = new PxCanvas(w, h);
    if (state === 'hurt') {
      buf.poly([[4, 28], [7, 6], [12, 2], [17, 6], [20, 28]], '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const pulse = (f & 1) === 0;
    const rune = state === 'charge' ? (pulse ? '#88ffaa' : '#44f074') : (pulse ? '#3ca670' : '#2d7c54');
    // Stepped dais + tapered monolith
    buf.rect(3, 24, 18, 5, '#566278');
    buf.rect(4, 24, 16, 1, '#7c8ca8');
    buf.poly([[6, 24], [8, 6], [12, 2], [16, 6], [18, 24]], '#64728a');
    buf.poly([[7, 24], [9, 6], [12, 3], [12, 24]], '#7c8ca8');
    // Glowing emerald rune channel
    buf.rect(10, 8, 4, 4, '#182030');
    buf.rect(11, 9, 2, 2, rune);
    buf.rect(11, 13, 2, 10, rune);
    if (state === 'charge') {
      buf.set(11, 9, '#ffffff');
      buf.set(6 + (f & 1), 6, '#9cffbc');
      buf.set(17 - (f & 1), 9, '#ffffff');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprProtoStatueIdle', 24, 32, 12, 20, 4, (ctx, x, y, w, h, f) => drawProtoStatue1x(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprProtoStatue', 'sprProtoStatueIdle');
  b.addSprite('sprProtoStatueCharge', 24, 32, 12, 20, 4, (ctx, x, y, w, h, f) => drawProtoStatue1x(ctx, x, y, w, h, f, 'charge'));
  b.addSprite('sprProtoStatueHurt', 24, 32, 12, 20, 1, (ctx, x, y, w, h) => drawProtoStatue1x(ctx, x, y, w, h, 0, 'hurt'));

  // CRISP 1x BIOME & SECRET PROPS
  b.addSprite('sprPizzaEntrance', 24, 24, 12, 12, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(12, 12, 9, 8, '#54606e');
    if (f === 0) {
      buf.ellipse(12, 12, 7, 6, '#3e4854');
      for (let ry = 8; ry <= 16; ry += 3) buf.rect(7, ry, 10, 1, '#7c8a98');
      buf.rect(8, 11, 2, 2, '#e6843c');
      buf.rect(14, 11, 2, 2, '#e6843c');
    } else {
      buf.ellipse(12, 12, 7, 6, '#180e0a');
      buf.ellipse(12, 12, 5, 4, '#682e1c');
      buf.ellipse(12, 12, 3, 2, '#e07a30');
      buf.set(12, 12, '#ffe085');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Iconic Frozen City Ice Flower matching 10_frozen_5_1.png top-right!!
  b.addSprite('sprIceFlowerIdle', 20, 22, 10, 14, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // 6 wide pale cyan-blue Rafflesia ice petals with dark speckles + warm center cup
    const petals: Array<[number, number]> = [[10, 5], [15, 8], [15, 14], [10, 17], [5, 14], [5, 8]];
    for (const [px, py] of petals) {
      buf.ellipse(px!, py!, 3, 3, '#72bcd8');
      buf.set(px! - 1, py! - 1, '#aee4f6');
      buf.set(px! + 1, py!, '#488ca8');
    }
    buf.ellipse(10, 11, 3, 3, '#d88270');
    buf.ellipse(10, 11, 1, 1, f % 2 === 0 ? '#5c2c28' : '#7a3c34');
    buf.set(9, 10, '#f4b09e');
    buf.outline(INK);
    buf.set(4 + f * 3, 3 + (f & 1), '#ffffff');
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprIceFlower', 'sprIceFlowerIdle');

  b.addSprite('sprCrownPedIdle', 22, 26, 11, 16, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.rect(4, 18, 14, 5, '#586478');
    buf.rect(6, 11, 10, 8, '#6c7890');
    buf.rect(8, 13, 6, 3, '#1c2230');
    buf.rect(9, 14, 4, 1, f % 2 === 0 ? '#5ef598' : '#c8ffe0');
    buf.rect(5, 8, 12, 3, '#9e2234');
    buf.rect(6, 9, 10, 1, '#e8bc40');
    const bob = (f & 1) === 0 ? 0 : -1;
    buf.grid(7, 2 + bob, [
      'g..g..g',
      'gg.g.gg',
      'ggggggg',
      'yyyyyyy',
    ], { g: '#f5c63d', y: '#fff08c' });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprCrownPed', 'sprCrownPedIdle');

  // Glowing tall diamond Crystal Cave crystal pillars (matching 09_caves_lights.png orange & cyan crystals!)
  const drawCrystalCluster1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    baseHex: string,
    hiHex: string,
    darkHex: string,
  ): void => {
    const buf = new PxCanvas(w, h);
    const cx = Math.floor(w / 2);
    // Side faceted shards
    buf.poly([[cx - 6, h - 4], [cx - 7, h - 11], [cx - 3, h - 12], [cx - 2, h - 4]], darkHex);
    buf.poly([[cx + 2, h - 4], [cx + 4, h - 12], [cx + 7, h - 9], [cx + 5, h - 4]], darkHex);
    // Tall central faceted diamond crystal spire (sharp angled tip matching 09_caves_lights.png)
    buf.poly([[cx - 3, h - 4], [cx - 4, h - 10], [cx, 2], [cx + 4, h - 10], [cx + 3, h - 4]], baseHex);
    buf.poly([[cx - 2, h - 5], [cx - 3, h - 10], [cx, 3], [cx, h - 5]], hiHex);
    buf.line(cx, 3, cx - 1, h - 7, '#ffffff');
    // Dark stone crystal socket
    buf.ellipse(cx, h - 3, 6, 2, '#34224a');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprCrystalProp', 18, 22, 9, 14, 1, (ctx, x, y, w, h) =>
    drawCrystalCluster1x(ctx, x, y, w, h, '#e87c24', '#ffc454', '#9e4414'),
  );
  b.addAlias('sprCrystalProp1', 'sprCrystalProp');
  b.addSprite('sprCrystalProp2', 16, 20, 8, 13, 1, (ctx, x, y, w, h) =>
    drawCrystalCluster1x(ctx, x, y, w, h, '#38c0e8', '#9cf2ff', '#1c749e'),
  );
  b.addSprite('sprCrystalProp3', 18, 22, 9, 14, 1, (ctx, x, y, w, h) =>
    drawCrystalCluster1x(ctx, x, y, w, h, '#b84ce8', '#eb9cff', '#6c2294'),
  );
  b.addSprite('sprCrystalPropBlue', 18, 22, 9, 14, 1, (ctx, x, y, w, h) =>
    drawCrystalCluster1x(ctx, x, y, w, h, '#38c0e8', '#9cf2ff', '#1c749e'),
  );
  b.addSprite('sprCrystalPropGreen', 18, 22, 9, 14, 1, (ctx, x, y, w, h) =>
    drawCrystalCluster1x(ctx, x, y, w, h, '#38d864', '#a0ffb8', '#1c7c34'),
  );

  // Frozen City Street Lamp, Hydrant & Soda Machine
  b.addSprite('sprStreetLight', 16, 34, 8, 28, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.rect(5, 27, 6, 5, '#4c5868');
    buf.rect(7, 8, 2, 20, '#5a6878');
    buf.rect(4, 3, 8, 6, '#384452');
    buf.rect(5, 5, 6, 3, f === 0 ? '#ffe068' : '#fff4a8');
    buf.rect(6, 6, 4, 1, '#ffffff');
    // Snow cap on street lamp hood
    buf.rect(4, 2, 8, 2, '#e2eef4');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprHydrant', 14, 18, 7, 13, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(3, 13, 8, 3, '#b82430');
    buf.rect(4, 5, 6, 9, '#d8303c');
    buf.rect(5, 5, 2, 9, '#f25860');
    buf.rect(2, 7, 2, 3, '#b82430');
    buf.rect(10, 7, 2, 3, '#b82430');
    buf.rect(5, 3, 4, 2, '#e6f2f8'); // snow cap
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprSodaMachine', 20, 26, 10, 18, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.rect(3, 3, 14, 20, '#3268b0');
    buf.rect(4, 2, 12, 2, '#e4f2f8'); // snow drift cap
    buf.rect(5, 6, 7, 9, f === 0 ? '#78e6ff' : '#aef6ff');
    buf.rect(6, 7, 5, 3, '#e83c4c');
    buf.rect(6, 11, 5, 3, '#ffe048');
    buf.rect(13, 7, 3, 6, '#1a2434');
    buf.set(14, 8, '#ff4858');
    buf.set(14, 10, '#58ff74');
    buf.rect(5, 17, 10, 4, '#18202e');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Mansion Props
  b.addSprite('sprMoneyPile', 20, 16, 10, 10, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const stack = (sx: number, sy: number): void => {
      buf.rect(sx, sy, 8, 5, '#3fa350');
      buf.rect(sx, sy, 8, 1, '#68c876');
      buf.rect(sx + 3, sy, 2, 5, '#f2e098');
    };
    stack(3, 8);
    stack(9, 7);
    stack(6, 4);
    buf.rect(4, 12, 3, 2, '#f5c83d');
    buf.rect(13, 12, 3, 2, '#f5c83d');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprYVStatue', 22, 30, 11, 20, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(4, 21, 14, 6, '#7a7488');
    buf.rect(5, 21, 12, 1, '#9e98ae');
    buf.poly([[11, 3], [18, 21], [4, 21]], '#ecc038');
    buf.poly([[11, 4], [11, 20], [5, 20]], '#ffe066');
    // Iconic Y.V. cyclops eye
    buf.rect(8, 12, 6, 3, '#1c1208');
    buf.rect(9, 13, 4, 1, '#fff8d8');
    buf.set(11, 13, '#140c0a');
    buf.rect(7, 18, 8, 1, '#fff498');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Labs Mutant Tube & Server Rack (matching 14_labs_6_1.png!)
  b.addSprite('sprMutantTube', 18, 28, 9, 19, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Glowing green glass containment tank
    buf.rect(4, 6, 10, 16, '#38dc58');
    buf.rect(5, 7, 2, 14, '#c8ffd4');
    // Suspended mutant silhouette inside
    const bob = (f & 1);
    buf.rect(7, 10 + bob, 4, 7, '#186630');
    buf.set(8, 12 + bob, '#c8ff80');
    buf.set(10, 12 + bob, '#c8ff80');
    buf.set(6, 18 - f * 2, '#ffffff');
    // Heavy metallic top & bottom caps
    buf.rect(3, 2, 12, 5, '#4a5a64');
    buf.rect(4, 2, 10, 1, '#768a96');
    buf.rect(3, 21, 12, 5, '#3c4a52');
    buf.rect(4, 25, 10, 1, '#263038');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprTube', 'sprMutantTube');

  b.addSprite('sprServer', 18, 28, 9, 19, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Dark charcoal lab/HQ server rack matching 14_labs_6_1.png!
    buf.rect(3, 2, 12, 24, '#2a2e38');
    buf.rect(4, 2, 10, 1, '#485060');
    for (let bay = 0; bay < 5; bay++) {
      const by = 5 + bay * 4;
      buf.rect(5, by, 8, 2, '#12151c');
      buf.rect(6, by, 4, 1, '#3a4252');
      buf.set(11, by, ((bay + f) & 1) === 0 ? '#e83838' : '#7a2024');
      buf.set(12, by + 1, bay === 0 ? '#5ce040' : '#42c8e8');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Oasis Vibrant Pink/Red/Cyan Coral Cluster & Dark Iron Anchor (matching board_1 Oasis!)
  b.addSprite('sprCoral', 18, 18, 9, 12, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.grid(2, 2, [
      '......RR......',
      '..PP..rR..CC..',
      '.pPP..rR..cCC.',
      '.pPPr.rR..cC..',
      '..pPrrRRrcCC..',
      '..prRRRRRRcc..',
      '.pPrRRrRRrcPp.',
      '.pPprrRRrPPpp.',
      '..rrrRRRRrrr..',
      '...rrRRRRrr...',
      '....ddRRdd....',
      '.....dddd.....',
    ], {
      r: '#e62e4c',
      R: '#ff5e78',
      p: '#f04498',
      P: '#ff96cc',
      c: '#20b8ca',
      C: '#6cf6ff',
      d: '#861830',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprAnchor', 20, 22, 10, 14, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.grid(3, 2, [
      '.....iiii.....',
      '....iI..Ii....',
      '.....iiii.....',
      '..iiiiiIiiii..',
      '..ddddiiiddd..',
      '......iIi.....',
      '......iIi.....',
      '......iIi.....',
      '.i....iIi....i',
      'iIi...iIi...iIi',
      '.ii...iIi...ii',
      '..ii..iIi..ii.',
      '...iiiIIIiii..',
      '....iiiiiii...',
      '......ddd.....',
    ], {
      i: '#46545e',
      I: '#728492',
      d: '#28323a',
    });
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprPizzaBox', 18, 14, 9, 8, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(3, 6, 12, 5, '#b88e56');
    buf.rect(2, 3, 12, 5, '#d8b276');
    buf.rect(3, 3, 10, 1, '#eed09c');
    buf.rect(6, 4, 4, 3, '#dc3228');
    buf.rect(7, 5, 2, 1, '#48b848');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Vibrant crimson Jungle Giant Flower (matching 12_jungle / board_2 Jungle!)
  b.addSprite('sprBigFlowerIdle', 22, 24, 11, 16, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Lush dark green leaves underneath
    buf.ellipse(6, 17, 4, 2, '#347a24');
    buf.ellipse(16, 17, 4, 2, '#347a24');
    buf.rect(10, 12, 2, 9, '#3e8e2c');
    // 6 bold crimson-red petals
    const petals: Array<[number, number]> = [[11, 5], [16, 8], [16, 13], [11, 16], [6, 13], [6, 8]];
    for (const [px, py] of petals) {
      buf.ellipse(px!, py!, 3, 3, '#d82840');
      buf.set(px! - 1, py! - 1, '#ff6474');
      buf.set(px! + 1, py! + 1, '#98182a');
    }
    buf.ellipse(11, 10, 3, 3, '#ffd840');
    buf.set(10 + (f & 1), 9, '#ffffff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 9. MASSIVE TERRACOTTA + NEON-GREEN THRONE CORPSE (96x88, matching 18_throne_idle.png!)
  b.addSprite('sprThroneCorpseIdle', 96, 88, 48, 44, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 48;
    const cy = 44;
    const spark = (f & 1) === 0;

    // Monumental weathered terracotta-bronze chassis matching 18_throne_idle.png!
    buf.rect(cx - 42, cy - 26, 84, 52, '#6c3034');
    buf.rect(cx - 40, cy - 26, 80, 3, '#884448');
    buf.rect(cx - 42, cy + 20, 84, 6, '#481d20');

    // Twin colossal glowing green rad tanks on left & right (cracked/dimmed in corpse)
    for (const side of [-1, 1]) {
      const tx = side < 0 ? cx - 34 : cx + 16;
      buf.rect(tx, cy - 36, 18, 30, '#36a838');
      buf.rect(tx + 3, cy - 35, 6, 28, '#66f050');
      buf.rect(tx + 5, cy - 34, 2, 24, '#c4ff98');
      // Steel ribbed tank caps
      buf.rect(tx - 1, cy - 38, 20, 4, '#7c8690');
      buf.rect(tx - 1, cy - 8, 20, 6, '#7c8690');
      buf.rect(tx + 1, cy - 7, 16, 2, '#a2acb6');
      // Battle crack across glass tank
      buf.line(tx + 3, cy - 26, tx + 13, cy - 16, '#1c1218');
    }

    // 6 front cylindrical rad battery cells along base (3 left, 3 right)
    for (const bx of [cx - 38, cx - 28, cx - 18, cx + 12, cx + 22, cx + 32]) {
      buf.rect(bx, cy + 20, 6, 10, '#7c8690');
      buf.rect(bx + 1, cy + 21, 4, 7, spark ? '#58f048' : '#32b830');
      buf.rect(bx + 2, cy + 22, 1, 5, '#c4ff98');
    }

    // Central crimson velvet stairs & inviting Throne seat!
    buf.rect(cx - 12, cy - 28, 24, 24, '#4c1e22');
    buf.rect(cx - 10, cy - 24, 20, 14, '#7a1826');
    buf.rect(cx - 9, cy - 22, 18, 10, '#a01f31');
    // Plush stepped crimson carpet leading up into the Throne seat
    buf.rect(cx - 11, cy - 8, 22, 34, '#a01f31');
    buf.rect(cx - 12, cy - 8, 1, 34, '#d8b85c');
    buf.rect(cx + 11, cy - 8, 1, 34, '#d8b85c');
    for (let sy = cy + 6; sy <= cy + 22; sy += 4) {
      buf.rect(cx - 11, sy, 22, 1, '#6e1220');
      buf.rect(cx - 11, sy + 1, 22, 1, '#c42e42');
    }
    // Neon-green circuit trim accent bar
    buf.rect(cx - 34, cy + 6, 20, 2, spark ? '#58f048' : '#34a830');
    buf.rect(cx + 14, cy + 6, 20, 2, spark ? '#58f048' : '#34a830');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprThroneCorpse', 'sprThroneCorpseIdle');

  // 10. MONUMENTAL 3D CYLINDRICAL BOILER TURBINE GENERATOR (80x88, centered origin 40,44, matching steam_gens.png!!)
  // 3 thick curved glowing neon-green intake pipes sit on the right side (East generators with flipX:true mirror them left!)
  const drawGenerator1x = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    state: 'idle' | 'hurt' | 'dead',
  ): void => {
    const buf = new PxCanvas(w, h);
    if (state === 'hurt') {
      buf.ellipse(36, 16, 23, 12, '#ffffff');
      buf.rect(10, 12, 52, 70, '#ffffff');
      buf.rect(62, 24, 14, 48, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (state === 'dead') {
      // Shattered smoking terracotta & charred steel turbine husk
      buf.rect(10, 20, 52, 60, '#4a1b1f');
      buf.rect(14, 24, 44, 50, '#2a2e34');
      buf.ellipse(36, 54, 18, 16, '#181b20');
      buf.ellipse(36, 54, 9, 7, '#225e28');
      buf.rect(62, 28, 8, 6, '#3a4048');
      buf.rect(62, 44, 7, 6, '#3a4048');
      buf.rect(62, 60, 8, 6, '#3a4048');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    const pulse = (f & 1) === 0;
    const radBright = pulse ? '#58f040' : '#40d630';
    const radCore = pulse ? '#c8ff98' : '#96ff70';
    const radDark = '#207222';

    // 1. Dark weathered terracotta-red structural chassis & mounting base (#6a282c / #4a181c)
    buf.rect(9, 12, 54, 68, '#6a282c');
    buf.rect(10, 12, 52, 3, '#883e42');
    buf.rect(9, 74, 54, 7, '#4a181c');
    buf.rect(7, 77, 58, 5, '#5a2024');
    buf.rect(7, 81, 58, 2, '#3a1216');
    // Glowing neon-green circuit trim along lower chassis apron (left & right of center diamond!)
    buf.rect(10, 77, 17, 2, radBright);
    buf.rect(45, 77, 17, 2, radBright);
    buf.set(14, 76, radCore);
    buf.set(22, 76, radCore);
    buf.set(50, 76, radCore);
    buf.set(58, 76, radCore);

    // 2. 3 THICK CURVED GLOWING NEON-GREEN SIDE INTAKE PIPES (x=62..76, mirror cleanly when flipX=true!)
    for (const py of [25, 42, 59]) {
      // Pipe elbow curving right and down into a bolted metallic steel flange
      buf.rect(62, py, 10, 8, radDark);
      buf.rect(62, py + 1, 11, 5, radBright);
      buf.rect(63, py + 1, 9, 2, radCore);
      buf.rect(69, py + 2, 6, 9, radBright);
      buf.rect(70, py + 3, 2, 7, radCore);
      buf.rect(73, py + 3, 2, 8, radDark);
      // Bolted metallic steel pipe collar cap at bottom of elbow
      buf.rect(67, py + 10, 10, 4, '#646c74');
      buf.rect(68, py + 10, 8, 2, '#9aa4ae');
      buf.rect(69, py + 10, 4, 1, '#c8d2da');
    }

    // 3. Towering upper cylindrical steel boiler drum (y=4..42, x=15..57)
    buf.ellipse(36, 15, 21, 10, '#646c74');
    buf.ellipse(36, 14, 20, 9, '#8a929a');
    buf.ellipse(36, 12, 16, 6, '#aeb6be');
    buf.rect(15, 14, 42, 30, '#8a929a');
    buf.rect(17, 14, 10, 28, '#a4acb4'); // sunlit left cylindrical curve
    buf.rect(49, 14, 8, 28, '#646c74');  // right cylindrical curve shadow
    buf.rect(20, 15, 3, 26, '#c8d0d8');  // crisp metallic highlight streak
    // Rust patina weathering streaks across boiler steel
    buf.rect(28, 12, 6, 3, '#8e4836');
    buf.rect(42, 17, 7, 3, '#9a523c');
    buf.rect(19, 34, 6, 3, '#864232');
    buf.rect(46, 33, 6, 4, '#864232');

    // 4. Glowing neon-green horizontal rad tubes across upper boiler casing + 6 flanking condenser bulbs!
    for (const ty of [17, 27]) {
      buf.rect(17, ty, 38, 4, radDark);
      buf.rect(18, ty + 1, 36, 2, radBright);
      buf.rect(20, ty + 1, 28, 1, radCore);
    }
    // 3 left + 3 right glowing green condenser bulbs mounted on terracotta stanchions
    for (const bx of [11, 56]) {
      for (const by of [9, 19, 29]) {
        buf.rect(bx, by, 5, 6, '#3c444c');
        buf.rect(bx + 1, by + 1, 3, 4, radBright);
        buf.set(bx + 1, by + 1, radCore);
      }
    }

    // 5. Lower front-facing concentric 3D ribbed steel turbine drum (y=36..74, x=12..60)
    buf.ellipse(36, 56, 24, 20, '#505860');
    buf.ellipse(36, 55, 22, 18, '#8a929a');
    buf.ellipse(36, 55, 18, 15, '#646c74');
    buf.ellipse(36, 56, 15, 12, '#9ca4ac');
    buf.ellipse(36, 57, 11, 9, '#646c74');
    buf.ellipse(36, 58, 7, 6, '#8a929a');
    // Vertical steel arch ribs & dark recessed turbine channels
    for (let rx = 18; rx <= 54; rx += 6) {
      buf.rect(rx, 43, 1, 24, '#444c54');
      buf.rect(rx + 1, 44, 1, 22, '#b8c0c8');
    }
    // Weathered rust patina along turbine curve
    buf.rect(21, 44, 5, 4, '#924a38');
    buf.rect(44, 46, 6, 5, '#8c4434');
    buf.rect(48, 58, 4, 4, '#843e30');

    // 6. Glowing emerald rune diamond housing at bottom center (x=28..44, y=58..77)
    buf.rect(28, 59, 16, 18, '#586068');
    buf.rect(29, 60, 14, 16, '#8a949e');
    buf.rect(30, 60, 12, 2, '#bcc6ce');
    // Emerald diamond core
    buf.poly([[36, 62], [42, 68], [36, 74], [30, 68]], radDark);
    buf.poly([[36, 63], [41, 68], [36, 73], [31, 68]], radBright);
    buf.poly([[36, 65], [39, 68], [36, 71], [33, 68]], radCore);
    buf.rect(35, 67, 2, 2, '#227224');

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprBigGenerator', 80, 88, 40, 44, 2, (ctx, x, y, w, h, f) =>
    drawGenerator1x(ctx, x, y, w, h, f, 'idle'),
  );
  b.addSprite('sprBigGeneratorHurt', 80, 88, 40, 44, 1, (ctx, x, y, w, h) =>
    drawGenerator1x(ctx, x, y, w, h, 0, 'hurt'),
  );
  b.addSprite('sprBigGeneratorDead', 80, 88, 40, 44, 1, (ctx, x, y, w, h) =>
    drawGenerator1x(ctx, x, y, w, h, 0, 'dead'),
  );
  b.addAlias('sprThroneGenerator', 'sprBigGenerator');

  // 11. CRISP 1x PLANT SNARE & TANGLE SEED
  b.addSprite('sprPlantSnare', 20, 20, 10, 10, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(10, 10, 7, 5, '#2e8e38');
    buf.ellipse(10, 10, 4, 3, '#18441c');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.25;
      buf.line(10, 10, Math.round(10 + Math.cos(a) * 8), Math.round(10 + Math.sin(a) * 6), '#40b848');
    }
    buf.rect(9, 4, 2, 2, '#e83444');
    buf.rect(9, 14, 2, 2, '#e83444');
    buf.set(9, 4, '#ffe860');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
  b.addAlias('sprTangle', 'sprPlantSnare');

  b.addSprite('sprTangleSeed', 10, 10, 5, 5, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(5, 5, 3, 3, '#3ec44e');
    buf.set(4 + (f & 1), 4, '#e0ffad');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 12. CRISP 1x CHARRED BLAST SCORCH CRATERS (24x20 & 14x12)
  b.addSprite('sprScorch', 24, 20, 12, 10, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const seed = 91 + f * 17;
    buf.ellipse(12, 10, 9, 7, '#261f24');
    buf.ellipse(12, 10, 6, 5, '#161116');
    buf.ellipse(12, 10, 3, 2, '#0c090d');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + f * 0.4;
      const sx = Math.round(12 + Math.cos(a) * 10);
      const sy = Math.round(10 + Math.sin(a) * 8);
      buf.set(sx, sy, '#181218');
      if (hash2d(i, f, seed) > 128) buf.set(sx + 1, sy, '#2c242a');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprScorchmark', 14, 12, 7, 6, 2, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    buf.ellipse(7, 6, 5, 4, '#241c21');
    buf.ellipse(7, 6, 3, 2, '#100c10');
    buf.set(3 + f, 3, '#241c21');
    buf.set(10 - f, 9, '#241c21');
    buf.flush(ctx, x, y);
  });

  // Reference clean imports for strict lint/noUnusedLocals
  void hashF;
  void makeRamp;
  void (null as unknown as ColorRamp);
}
