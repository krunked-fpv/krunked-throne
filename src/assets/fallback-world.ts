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

  // 3. HEROIC 1x ANIMATED CAMPFIRE & CAMPFIRE OFF (44x44, orig 22,28 — warm stone ring & crackling flames!)
  b.addSprite('sprCampfire', 44, 44, 22, 28, 6, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 22;
    const cy = 31;
    // Deep ash pit & warm ember ground halo
    buf.ellipse(cx, cy + 1, 15, 7, '#221a1c');
    buf.ellipse(cx, cy, 12, 5, '#342624');
    // Rugged warm stone ring (back stones behind logs)
    const backStones: Array<[number, number, number, number]> = [
      [8, 25, 6, 4], [14, 23, 6, 4], [24, 23, 6, 4], [30, 25, 6, 4],
    ];
    for (const [sx, sy, sw, sh] of backStones) {
      buf.rect(sx, sy, sw, sh, '#6a626c');
      buf.rect(sx + 1, sy, sw - 2, 1, '#9c929c');
      buf.rect(sx, sy + sh - 1, sw, 1, '#443e48');
    }
    // Crossed charred firewood logs radiating inside the ring
    buf.line(11, 33, 33, 27, '#58321c', 3);
    buf.line(12, 32, 32, 27, '#824c28', 1);
    buf.line(12, 27, 32, 33, '#5c341e', 3);
    buf.line(13, 27, 31, 32, '#8c542e', 1);
    buf.line(14, 30, 30, 30, '#462616', 2);
    // Glowing hot coal bed in center
    const coalPulse = (f & 1) === 0;
    buf.ellipse(cx, cy - 1, 8, 3, '#b82814');
    buf.ellipse(cx, cy - 1, 6, 2, coalPulse ? '#ff641c' : '#e85018');
    buf.rect(cx - 4, cy - 2, 8, 2, coalPulse ? '#ffd844' : '#ffba32');
    // Front stone ring stones overlapping ash bed
    const frontStones: Array<[number, number, number, number]> = [
      [6, 29, 6, 4], [10, 33, 6, 4], [17, 35, 7, 4], [25, 34, 6, 4], [31, 31, 6, 4], [33, 27, 5, 4],
    ];
    for (const [sx, sy, sw, sh] of frontStones) {
      buf.rect(sx, sy, sw, sh, '#746c76');
      buf.rect(sx + 1, sy, sw - 2, 1, '#afa6ae');
      buf.rect(sx, sy + sh - 1, sw, 1, '#48404a');
      buf.set(sx + 1, sy + 1, '#c8bebc');
    }
    // Multi-layered crackling 6-frame flames (3 dancing tongues!)
    const swayA = [0, -2, -1, 1, 2, 1][f % 6]!;
    const swayB = [1, 2, 0, -2, -1, 0][f % 6]!;
    const tall = [0, 2, 1, 3, 1, 2][f % 6]!;
    // Outer deep crimson/red flame envelope
    buf.poly([
      [13, 29], [11, 22], [14 + swayB, 14], [17 + swayA, 18],
      [22 + swayA, 6 - tall], [27 + swayB, 16], [31 + swayA, 13], [33, 22], [31, 29],
    ], '#c82418');
    // Mid bright roaring orange flame
    buf.poly([
      [15, 29], [14, 22], [16 + swayB, 16], [19, 20],
      [22 + swayA, 9 - tall], [26 + swayB, 19], [29 + swayA, 16], [30, 23], [29, 29],
    ], '#ff721e');
    // Inner golden yellow flame heart
    buf.poly([
      [17, 29], [16, 23], [19 + swayA, 18],
      [22 + swayA, 13 - Math.floor(tall / 2)], [26 + swayB, 20], [27, 29],
    ], '#ffda3c');
    // Incandescent white-cream core
    buf.poly([
      [19, 29], [19, 24], [22 + Math.round(swayA * 0.5), 18], [25, 24], [25, 29],
    ], '#fff9d0');
    buf.rect(21, 24, 2, 4, '#ffffff');
    buf.outline(INK);
    // Dancing hot embers & rising sparks above flames
    const sparkPositions: Array<[number, number, string]> = [
      [15 + ((f * 3) % 13), 4 + (f % 3), '#ffe868'],
      [27 - ((f * 2) % 11), 2 + ((f + 1) % 4), '#ff8828'],
      [19 + ((f * 5) % 8), 8 - (f % 3), '#fff8c8'],
    ];
    for (const [ex, ey, col] of sparkPositions) {
      buf.set(ex, ey, col);
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprCampfireOff', 44, 44, 22, 28, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const cx = 22;
    const cy = 31;
    buf.ellipse(cx, cy + 1, 15, 7, '#1d181c');
    buf.ellipse(cx, cy, 12, 5, '#342e32');
    buf.ellipse(cx, cy, 8, 3, '#4c464c');
    const stones: Array<[number, number, number, number]> = [
      [8, 25, 6, 4], [14, 23, 6, 4], [24, 23, 6, 4], [30, 25, 6, 4],
      [6, 29, 6, 4], [10, 33, 6, 4], [17, 35, 7, 4], [25, 34, 6, 4], [31, 31, 6, 4], [33, 27, 5, 4],
    ];
    for (const [sx, sy, sw, sh] of stones) {
      buf.rect(sx, sy, sw, sh, '#5a5460');
      buf.rect(sx + 1, sy, sw - 2, 1, '#847e8c');
      buf.rect(sx, sy + sh - 1, sw, 1, '#3a3440');
    }
    // Charred burnt logs
    buf.line(12, 32, 32, 27, '#342826', 3);
    buf.line(13, 27, 31, 32, '#2a2020', 3);
    buf.line(15, 30, 29, 30, '#443836', 1);
    // Faint dying embers
    buf.rect(20, 29, 2, 1, '#cc3418');
    buf.set(21, 29, '#ff7828');
    buf.set(24, 31, '#a82814');
    buf.outline(INK);
    // Delicate curling cold smoke wisp
    buf.set(21, 23, '#6e6876');
    buf.set(22, 21, '#827c8c');
    buf.set(21, 19, '#6e6876');
    buf.set(23, 17, '#585260');
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
  // Portal wall-clearing shockwave FX (64x64, orig 32,32, 6f)
  b.addSprite('sprPortalClear', 64, 64, 32, 32, 6, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const cx = 32;
    const cy = 32;
    const outerR = Math.min(30, 12 + f * 3.6);
    const midR = Math.max(4, outerR - 4);
    const innerR = Math.max(0, f >= 2 ? (f - 1) * 5.2 : 0);

    // Expanding cosmic blast ring
    for (let py = 1; py < h - 1; py++) {
      for (let px = 1; px < w - 1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const wobble = Math.sin(ang * 6 + f * 1.1) * 1.6 + Math.cos(ang * 10 - f * 0.7) * 0.8;
        const r = dist + wobble;
        if (r > outerR || r < innerR) continue;
        if (f === 5 && hash2d(px, py, 913) > 165) continue;
        if (r > outerR - 2.2) buf.set(px, py, '#2b094a');
        else if (r > midR) buf.set(px, py, '#7620cc');
        else if (r > innerR + 3.5) buf.set(px, py, '#d468ff');
        else buf.set(px, py, f <= 2 ? '#ffffff' : '#f8d0ff');
      }
    }
    // 6 swirling energy tendrils & radiant debris sparks
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.45;
      const sx = Math.round(cx + Math.cos(a) * Math.max(4, outerR - 5));
      const sy = Math.round(cy + Math.sin(a) * Math.max(4, outerR - 5));
      const ex = Math.round(cx + Math.cos(a + 0.35) * Math.min(30, outerR + 1));
      const ey = Math.round(cy + Math.sin(a + 0.35) * Math.min(30, outerR + 1));
      buf.line(sx, sy, ex, ey, f < 4 ? '#f4ccff' : '#c050ff');
      buf.set(ex, ey, '#ffffff');
    }
    if (f <= 2) {
      buf.ellipse(cx, cy, Math.max(2, 7 - f * 2), Math.max(2, 7 - f * 2), '#ffffff');
    }
    buf.flush(ctx, x, y);
  });
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

  // HEROIC 1x PROTO STATUE (40x48, orig 20,32 — imposing emerald-runed Vault monolith!)
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
      const flashCol = f === 0 ? '#ffffff' : f === 1 ? '#dcfff0' : '#f4fff8';
      buf.rect(4, 36, 32, 9, flashCol);
      buf.rect(7, 30, 26, 7, flashCol);
      buf.poly([[8, 32], [11, 10], [20, 3], [29, 10], [32, 32]], flashCol);
      if (f === 2) {
        buf.rect(18, 12, 4, 20, '#30885a');
      }
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const pulse = (f & 1) === 0;
    const runeDark = state === 'charge' ? '#1c8848' : '#184e34';
    const runeMid = state === 'charge' ? (pulse ? '#58ff92' : '#38e074') : (pulse ? '#38b472' : '#288656');
    const runeHi = state === 'charge' ? '#ffffff' : (pulse ? '#a4ffd0' : '#58d492');

    // Wide stepped octagonal stone plinth & ground pedestal
    buf.rect(4, 39, 32, 6, '#384454');
    buf.rect(5, 39, 30, 2, '#5c6c82');
    buf.rect(7, 33, 26, 7, '#4c5c70');
    buf.rect(8, 33, 24, 2, '#788ca4');
    buf.rect(7, 44, 26, 1, '#26303c');
    // Flanking carved stone wing buttresses
    buf.poly([[7, 34], [9, 19], [13, 17], [13, 34]], '#465468');
    buf.poly([[8, 33], [10, 20], [12, 19], [12, 33]], '#6a7e96');
    buf.poly([[33, 34], [31, 19], [27, 17], [27, 34]], '#364252');
    buf.poly([[31, 33], [29, 20], [28, 19], [28, 33]], '#4d5d72');
    // Towering tapered main monolith body
    buf.poly([[10, 34], [12, 10], [20, 3], [28, 10], [30, 34]], '#586880');
    // Left sunlit chiseled bevel face
    buf.poly([[11, 33], [13, 10], [20, 4], [20, 33]], '#768aa4');
    buf.line(13, 10, 20, 4, '#a2b6d0');
    // Right shadowed chisel face
    buf.poly([[23, 33], [23, 8], [28, 10], [29, 33]], '#3f4e62');
    // Carved geometric collar & forehead arch bands
    buf.rect(12, 22, 16, 2, '#323e4e');
    buf.rect(12, 21, 16, 1, '#94a8c0');
    buf.rect(11, 30, 18, 2, '#323e4e');
    // Central recessed ancient proto-eye vault
    buf.rect(15, 10, 10, 8, '#161e2c');
    buf.poly([[20, 11], [23, 14], [20, 17], [17, 14]], runeDark);
    buf.rect(19, 12, 2, 4, runeMid);
    buf.rect(18, 13, 4, 2, runeMid);
    buf.set(19, 13, runeHi);
    // Vertical emerald rune power conduit & twin branch glyphs
    buf.rect(18, 19, 4, 15, '#182230');
    buf.rect(19, 19, 2, 15, runeMid);
    buf.rect(19, 20 + (f % 3) * 4, 2, 2, runeHi);
    buf.rect(14, 25, 3, 2, runeMid);
    buf.rect(23, 25, 3, 2, runeMid);
    buf.rect(13, 36, 14, 2, runeDark);
    buf.rect(15, 36, 10, 1, runeMid);

    if (state === 'charge') {
      // Crackling emerald energy veins & orbiting charge sparks
      buf.line(13, 14, 16, 14, runeHi);
      buf.line(24, 14, 27, 14, runeHi);
      buf.rect(19, 6, 2, 4, runeHi);
      buf.set(20, 5, '#ffffff');
    }
    buf.outline(INK);
    if (state === 'charge') {
      const ang = f * (Math.PI * 0.5);
      buf.set(Math.round(20 + Math.cos(ang) * 15), Math.round(16 + Math.sin(ang) * 8), '#9cffbc');
      buf.set(Math.round(20 - Math.cos(ang) * 14), Math.round(24 - Math.sin(ang) * 7), '#ffffff');
      buf.set(11 + (f * 5) % 18, 2 + (f & 1), '#58ff92');
    }
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprProtoStatueIdle', 40, 48, 20, 32, 4, (ctx, x, y, w, h, f) => drawProtoStatue1x(ctx, x, y, w, h, f, 'idle'));
  b.addAlias('sprProtoStatue', 'sprProtoStatueIdle');
  b.addSprite('sprProtoStatueCharge', 40, 48, 20, 32, 4, (ctx, x, y, w, h, f) => drawProtoStatue1x(ctx, x, y, w, h, f, 'charge'));
  b.addSprite('sprProtoStatueHurt', 40, 48, 20, 32, 3, (ctx, x, y, w, h, f) => drawProtoStatue1x(ctx, x, y, w, h, f, 'hurt'));

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

  // HEROIC 1x VAULT CROWN PEDESTAL (48x48, orig 24,30 — grand Vault centerpiece altar!)
  b.addSprite('sprCrownPedIdle', 48, 48, 24, 30, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const pulse = (f & 1) === 0;
    const rune = pulse ? '#58f898' : '#30c46c';
    const runeHi = pulse ? '#d8ffe8' : '#8cffb8';

    // Grand stepped octagonal stone dais
    buf.poly([[6, 44], [3, 39], [6, 34], [42, 34], [45, 39], [42, 44]], '#364454');
    buf.poly([[8, 42], [6, 38], [8, 34], [40, 34], [42, 38], [40, 42]], '#526478');
    buf.rect(9, 34, 30, 2, '#7c90a8');
    // Glowing emerald floor rune strip across dais
    buf.rect(12, 39, 24, 2, '#1a2432');
    buf.rect(14, 39, 20, 1, rune);
    buf.set(23, 39, runeHi);
    buf.set(24, 39, runeHi);

    // Sculpted central Vault pedestal column with gold corner pilasters
    buf.rect(11, 21, 26, 14, '#5a6a80');
    buf.rect(12, 21, 10, 14, '#70849c');
    buf.rect(28, 21, 8, 14, '#425064');
    // Gold vertical corner inlays
    buf.rect(12, 22, 2, 12, '#c89220');
    buf.rect(12, 22, 1, 12, '#f5cc48');
    buf.rect(34, 22, 2, 12, '#b07c18');
    buf.rect(34, 22, 1, 12, '#e8bc3c');
    // Central glowing emerald vault emblem
    buf.rect(18, 24, 12, 8, '#16202e');
    buf.poly([[24, 25], [28, 28], [24, 31], [20, 28]], rune);
    buf.rect(23, 27, 2, 2, runeHi);

    // Wide ornate altar slab & royal crimson velvet cushion draped with gold tassels
    buf.rect(8, 16, 32, 6, '#6e8098');
    buf.rect(9, 16, 30, 2, '#9cb0c8');
    buf.rect(11, 14, 26, 6, '#961c2e');
    buf.rect(12, 14, 24, 2, '#c83044');
    buf.rect(11, 19, 26, 2, '#6c1220');
    buf.rect(11, 18, 26, 1, '#f0c440'); // gold velvet piping
    // Gold dangling altar corner tassels
    buf.rect(12, 20, 2, 3, '#e8b834');
    buf.rect(34, 20, 2, 3, '#e8b834');

    // Hovering regal golden Crown bobbing above velvet cushion
    const bob = f === 1 || f === 2 ? -1 : 0;
    buf.grid(16, 3 + bob, [
      'g......gg......g',
      'gG....gGGg....Gg',
      'gGG..gGGGGg..GGg',
      'gGGGgGGGGGGgGGGg',
      'gGGRGGGGGGGGGGgG',
      'gGGGGGGEEGGGGGGg',
      'dGGGGGGGGGGGGGGd',
      '.ddddyyyyyydddd.',
    ], {
      g: '#c88c14',
      G: '#f5c838',
      y: '#fff49c',
      d: '#8a5a0c',
      R: '#e82838',
      E: '#48f080',
    });
    buf.outline(INK);
    // Floating magic sparkles around the Crown
    const sx = f === 0 ? 11 : f === 1 ? 35 : f === 2 ? 13 : 33;
    const sy = f === 0 ? 5 : f === 1 ? 6 : f === 2 ? 11 : 10;
    buf.rect(sx - 1, sy, 3, 1, '#fff6b0');
    buf.rect(sx, sy - 1, 1, 3, '#ffffff');
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

  // HEROIC 1x OASIS REEF CORAL (32x28, orig 16,20) & SUNKEN IRON ANCHOR (36x38, orig 18,26)
  b.addSprite('sprCoral', 32, 28, 16, 20, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Mossy turquoise reef rock base
    buf.ellipse(16, 23, 10, 3, '#1c4c3c');
    buf.ellipse(15, 22, 8, 2, '#2d7258');
    // Left magenta fan coral cluster
    buf.line(11, 21, 5, 11, '#c82874', 3);
    buf.line(9, 17, 4, 15, '#ef4498', 2);
    buf.line(10, 15, 8, 8, '#ef4498', 2);
    buf.ellipse(5, 10, 2, 2, '#ff8ac8');
    buf.ellipse(8, 8, 2, 2, '#ffa4d8');
    buf.ellipse(4, 15, 2, 1, '#ff8ac8');
    // Right turquoise-cyan tube coral branches
    buf.line(21, 21, 27, 11, '#18889c', 3);
    buf.line(23, 18, 28, 16, '#2ec4d8', 2);
    buf.line(22, 16, 24, 9, '#2ec4d8', 2);
    buf.ellipse(27, 10, 2, 2, '#84f6ff');
    buf.ellipse(24, 8, 2, 2, '#aefaff');
    buf.set(27, 10, '#ffe860');
    buf.set(24, 8, '#ffe860');
    // Tall central crimson-coral staghorn antlers
    buf.line(16, 22, 16, 5, '#b81c36', 4);
    buf.line(15, 21, 15, 5, '#e83250', 2);
    buf.line(16, 15, 11, 8, '#e83250', 3);
    buf.line(16, 13, 21, 6, '#e83250', 3);
    buf.line(12, 11, 13, 5, '#ff647e', 2);
    buf.line(20, 10, 19, 4, '#ff647e', 2);
    // Sunlit coral tips & warm anemone accents
    buf.ellipse(16, 4, 2, 2, '#ff7890');
    buf.set(15, 3, '#ffc8d2');
    buf.ellipse(11, 7, 2, 2, '#ff7890');
    buf.set(11, 6, '#ffc8d2');
    buf.ellipse(21, 6, 2, 2, '#ff7890');
    buf.set(21, 5, '#ffc8d2');
    buf.ellipse(16, 19, 4, 2, '#e83250');
    buf.set(14, 19, '#ffe058');
    buf.set(18, 20, '#ffe058');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprAnchor', 36, 38, 18, 26, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Dangling broken iron chain links off top mooring ring
    buf.ellipse(24, 6, 3, 2, '#3a4854');
    buf.ellipse(24, 6, 1, 1, '#0e0a12');
    buf.ellipse(28, 9, 2, 3, '#4c5c6a');
    buf.set(28, 8, '#7c8e9c');
    buf.ellipse(30, 14, 2, 2, '#3a4854');
    // Top forged iron mooring ring
    buf.ellipse(18, 6, 4, 4, '#445462');
    buf.ellipse(17, 5, 3, 3, '#728696');
    buf.ellipse(18, 6, 2, 2, '#0e0a12');
    buf.erase(18, 6);
    buf.erase(17, 6);
    buf.erase(18, 5);
    // Heavy weathered wooden & iron-banded crossbar stock
    buf.rect(7, 10, 22, 4, '#6c4c34');
    buf.rect(8, 10, 20, 1, '#926a48');
    buf.rect(7, 13, 22, 1, '#463020');
    buf.rect(10, 10, 2, 4, '#465664');
    buf.rect(24, 10, 2, 4, '#465664');
    buf.rect(15, 9, 6, 6, '#506270');
    buf.rect(16, 9, 3, 5, '#7c90a0');
    // Massive central forged iron shank
    buf.rect(16, 14, 4, 18, '#425260');
    buf.rect(16, 14, 2, 17, '#6e8292');
    buf.rect(16, 15, 1, 14, '#9ab0be');
    buf.rect(19, 14, 1, 17, '#263038');
    // Sweeping thick curved iron lower arms & crown
    buf.bezier(6, 23, 10, 36, 18, 34, '#384652', 4);
    buf.bezier(30, 23, 26, 36, 18, 34, '#384652', 4);
    buf.bezier(7, 23, 11, 34, 18, 32, '#627686', 2);
    buf.bezier(29, 23, 25, 34, 18, 32, '#526474', 2);
    // Heavy bottom anchor crown knob
    buf.ellipse(18, 34, 4, 2, '#34404c');
    buf.rect(16, 32, 4, 2, '#6c8090');
    // Twin sharp triangular barbed flukes on left & right tips
    buf.poly([[3, 24], [7, 18], [10, 24], [6, 25]], '#4a5a68');
    buf.poly([[5, 23], [7, 19], [8, 23]], '#889eae');
    buf.poly([[33, 24], [29, 18], [26, 24], [30, 25]], '#3c4c58');
    buf.poly([[30, 23], [29, 19], [28, 23]], '#6e8292');
    // Oxidized rust weathering patches
    buf.rect(17, 22, 2, 3, '#984a2a');
    buf.set(17, 22, '#c0663a');
    buf.rect(11, 30, 3, 2, '#8c4224');
    buf.rect(23, 29, 2, 2, '#8c4224');
    // Clinging Oasis emerald seaweed frond & pink barnacles
    buf.line(18, 17, 13, 22, '#2a8c44', 2);
    buf.line(13, 22, 14, 27, '#46be62', 1);
    buf.set(22, 32, '#f06480');
    buf.set(23, 32, '#ffa4b8');
    buf.set(9, 26, '#f06480');
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

  // 13. Y.V.'S CRIB ($$$) SETPIECE SPRITES
  registerYvCribSetpieces(b);

  // 14. IDPD HQ-3 CAPTAIN'S OFFICE & HQ-1/2 PROPS
  registerIdpdHqProps(b);

  // 15. MISSING BIOME HAZARDS, CHESTS, STATUES, PICKUPS & ROOF DECALS
  registerBiomeHazardsAndProps(b);
  registerRoofTopDecals(b);

  // Reference clean imports for strict lint/noUnusedLocals
  void hashF;
  void makeRamp;
  void (null as unknown as ColorRamp);
}

// ============================================================================
// SECTION 1: Y.V.'S CRIB ($$$) SETPIECE SPRITES
// ============================================================================

function registerYvCribSetpieces(b: FallbackAtlasBuilder): void {
  // 1. Colossal Wall-Mounted Flatscreen TV (`sprVenuzTV` / `Hurt` / `Dead`, 240x96, orig 129,96, 1/3/7f)
  const drawVenuzTV = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    mode: 'idle' | 'hurt' | 'dead',
  ): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(10, 6, 220, 78, '#ffffff');
      buf.rect(62, 84, 116, 10, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    // Heavy luxury brushed-gold console stand & soundbar base
    buf.rect(58, 82, 124, 12, '#3a243c');
    buf.rect(60, 84, 120, 8, '#1e1626');
    buf.rect(58, 82, 124, 2, '#e8b628');
    buf.rect(58, 92, 124, 2, '#a67414');
    // Soundbar gold speaker vents
    for (let sx = 68; sx <= 166; sx += 4) {
      buf.rect(sx, 86, 2, 4, '#564462');
    }
    buf.rect(116, 86, 8, 4, mode === 'dead' ? '#362834' : '#f5c838');

    // Massive obsidian flatscreen bezel with ornate gold corner brackets
    const bezelBody = mode === 'hurt' && f === 1 ? '#584c68' : '#241c2c';
    const bezelHi = mode === 'hurt' && f === 1 ? '#a89cb8' : '#3e324a';
    buf.rect(10, 6, 220, 78, bezelBody);
    buf.rect(12, 6, 216, 2, bezelHi);
    buf.rect(12, 82, 216, 2, '#140e1a');
    // Ornate solid-gold luxury corner brackets & side speaker trims
    const goldA = '#f5c838';
    const goldHi = '#fff498';
    const goldDark = '#a87414';
    // Top-left, top-right, bottom-left, bottom-right L-brackets
    buf.rect(10, 6, 16, 4, goldA);
    buf.rect(10, 6, 4, 16, goldA);
    buf.rect(11, 7, 12, 1, goldHi);
    buf.rect(214, 6, 16, 4, goldA);
    buf.rect(226, 6, 4, 16, goldA);
    buf.rect(216, 7, 12, 1, goldHi);
    buf.rect(10, 80, 16, 4, goldDark);
    buf.rect(10, 68, 4, 16, goldA);
    buf.rect(214, 80, 16, 4, goldDark);
    buf.rect(226, 68, 4, 16, goldA);
    // Flanking side vertical gold speaker strips
    for (let sy = 26; sy <= 62; sy += 4) {
      buf.rect(13, sy, 4, 2, '#624c28');
      buf.rect(223, sy, 4, 2, '#624c28');
    }

    // Widescreen display cavity (x=21..219, y=13..77)
    if (mode === 'dead') {
      buf.rect(21, 13, 198, 64, '#100c14');
      buf.rect(24, 16, 192, 58, '#1a1522');
      // Jagged shattered glass spiderweb cracks
      const cx1 = 104;
      const cy1 = 44;
      buf.ellipse(cx1, cy1, 14, 10, '#09070c');
      const cracks: Array<[number, number, number, number]> = [
        [cx1, cy1, 36, 18], [cx1, cy1, 28, 56], [cx1, cy1, 76, 72],
        [cx1, cy1, 152, 16], [cx1, cy1, 198, 34], [cx1, cy1, 184, 70],
        [cx1, cy1, 122, 15], [cx1, cy1, 134, 74],
      ];
      for (const [x0, y0, x1, y1] of cracks) {
        buf.line(x0, y0, x1, y1, '#586274');
        buf.line(x0 + 1, y0, x1 + 1, y1, '#0c0a10');
      }
      // Dangling broken copper/red wires
      buf.bezier(94, 48, 90, 62, 98, 76, '#d83838', 1);
      buf.bezier(112, 46, 118, 60, 108, 78, '#48b8f0', 1);
      // Animated rising grey smoke puffs & crackling blue/gold sparks across 7 frames
      const smokeY1 = 42 - ((f * 5) % 28);
      const smokeY2 = 52 - (((f + 3) * 5) % 30);
      buf.ellipse(98 + (f & 1) * 2, smokeY1, 7, 5, '#4c4656');
      buf.ellipse(97 + (f & 1) * 2, smokeY1 - 1, 4, 3, '#6e687a');
      buf.ellipse(118 - (f % 3), smokeY2, 6, 4, '#3c3644');
      if (f % 2 === 0) {
        const spx = 96 + (f * 9) % 28;
        const spy = 40 + (f * 7) % 18;
        buf.line(spx - 4, spy, spx + 4, spy, '#ffe868');
        buf.line(spx, spy - 4, spx, spy + 4, '#68f4ff');
        buf.rect(spx - 1, spy - 1, 2, 2, '#ffffff');
      }
      buf.set(212, 80, '#441818'); // dead power LED
    } else {
      // Active video-game scene on the giant TV screen
      buf.rect(21, 13, 198, 64, '#1b1430');
      buf.rect(21, 13, 198, 22, '#2d1c4c');
      buf.rect(21, 53, 198, 24, '#244830');
      buf.rect(21, 53, 198, 3, '#449848');
      // Pixel night stars & retro green hills
      for (let i = 0; i < 16; i++) {
        const sx = 26 + ((i * 29) % 186);
        const sy = 16 + ((i * 11) % 24);
        buf.set(sx, sy, i % 3 === 0 ? '#ffe878' : '#b898e8');
      }
      buf.poly([[24, 53], [52, 34], [84, 53]], '#2e6838');
      buf.poly([[140, 53], [176, 30], [214, 53]], '#2e6838');
      // Tiny pixel Y.V. hero blasting golden lasers on the TV screen!
      buf.poly([[64, 58], [72, 42], [80, 58]], '#f4f2f8');
      buf.rect(70, 49, 4, 3, '#140c18');
      buf.set(71, 50, '#ffffff');
      buf.rect(82, 49, 28, 2, '#ffe848');
      buf.rect(84, 50, 22, 1, '#ffffff');
      // Tiny pixel purple boss/enemy exploding on right side of TV!
      buf.ellipse(158, 49, 10, 9, '#9a34c8');
      buf.ellipse(156, 47, 6, 5, '#d468ff');
      buf.rect(152, 46, 3, 3, '#ffe848');
      buf.rect(159, 46, 3, 3, '#ffe848');
      // Pixel burst & "$$$" retro HUD score at top of screen
      buf.ellipse(122, 49, 6, 5, '#ff7820');
      buf.ellipse(122, 49, 3, 2, '#fff498');
      buf.rect(28, 17, 16, 4, '#58f048');
      buf.rect(192, 17, 18, 4, '#f5c838');
      // Subtle diagonal glass screen reflection glint
      for (let d = 0; d < 28; d++) {
        buf.set(34 + d, 16 + Math.floor(d * 0.6), '#6a5898');
        buf.set(38 + d, 16 + Math.floor(d * 0.6), '#8c7ab8');
      }
      buf.rect(210, 79, 4, 2, '#58ff68'); // live power LED

      if (mode === 'hurt') {
        // Glitch static scanline bars & white impact sparks
        for (let gy = 15; gy < 75; gy += 5) {
          buf.rect(22, gy + (f & 1), 196, 2, gy % 10 === 0 ? '#ffffff' : '#68f4ff');
        }
        buf.line(110, 22, 134, 58, '#ffffff', 2);
      }
    }

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  b.addSprite('sprVenuzTV', 240, 96, 129, 96, 1, (ctx, x, y, w, h, f) => drawVenuzTV(ctx, x, y, w, h, f, 'idle'));
  b.addSprite('sprVenuzTVHurt', 240, 96, 129, 96, 3, (ctx, x, y, w, h, f) => drawVenuzTV(ctx, x, y, w, h, f, 'hurt'));
  b.addSprite('sprVenuzTVDead', 240, 96, 129, 96, 7, (ctx, x, y, w, h, f) => drawVenuzTV(ctx, x, y, w, h, f, 'dead'));

  // 2. Plush Royal-Crimson Luxury Couch (`sprVenuzCouch` / `Dead`, 98x48, orig 49,24, 1/3f)
  b.addSprite('sprVenuzCouch', 98, 48, 49, 24, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Gold lion-paw legs
    buf.rect(8, 39, 7, 5, '#c89220');
    buf.rect(9, 39, 5, 2, '#ffe878');
    buf.rect(83, 39, 7, 5, '#c89220');
    buf.rect(84, 39, 5, 2, '#ffe878');
    // Wide tufted leather backrest
    buf.rect(8, 6, 82, 22, '#7a1c38');
    buf.rect(10, 5, 78, 4, '#b83c60');
    buf.rect(12, 6, 74, 2, '#d86284');
    // Tufted diamond leather buttons across backrest
    for (let tx = 20; tx <= 78; tx += 12) {
      buf.rect(tx - 1, 13, 3, 2, '#4a0e22');
      buf.set(tx, 13, '#f5c838');
      buf.rect(tx + 5, 19, 3, 2, '#4a0e22');
      buf.set(tx + 6, 19, '#e8bc38');
    }
    // 3 plump velvet/leather seat cushions
    for (let c = 0; c < 3; c++) {
      const cx = 14 + c * 24;
      buf.rect(cx, 24, 22, 12, '#9a284c');
      buf.rect(cx + 1, 24, 20, 3, '#c84870');
      buf.rect(cx + 2, 25, 16, 1, '#e47294');
      buf.rect(cx, 34, 22, 2, '#62142c');
      if (c > 0) buf.rect(cx - 1, 24, 1, 12, '#480e20');
    }
    // Lower front wood/gold trim skirt
    buf.rect(8, 36, 82, 5, '#5a1428');
    buf.rect(10, 37, 78, 1, '#e8b628');
    // Rolled plush left & right armrests with gold studs
    for (const ax of [4, 84]) {
      buf.rect(ax, 12, 10, 26, '#8a2242');
      buf.rect(ax + 1, 11, 8, 5, '#c44468');
      buf.rect(ax + 2, 12, 6, 2, '#e26c8e');
      buf.rect(ax, 34, 10, 4, '#561226');
      for (let sy = 18; sy <= 32; sy += 4) {
        buf.set(ax + 4, sy, '#f5c838');
      }
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprVenuzCouchDead', 98, 48, 49, 24, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Splintered crimson sofa halves & exposed wooden frame
    buf.rect(7, 16, 36, 24, '#5e142a');
    buf.rect(9, 18, 30, 6, '#842240');
    buf.rect(55, 14, 36, 26, '#5e142a');
    buf.rect(57, 16, 30, 6, '#842240');
    // Snapped timber crossbeams
    buf.line(20, 34, 54, 26, '#6e4628', 3);
    buf.line(44, 30, 76, 36, '#58361e', 3);
    // Bursting fluffy cream cotton stuffing
    buf.ellipse(46, 25, 11, 8, '#dfd8c8');
    buf.ellipse(45, 23, 8, 5, '#f8f4ea');
    buf.ellipse(32, 22, 6, 4, '#dfd8c8');
    buf.ellipse(62, 27, 6, 4, '#c8bfa8');
    // Coiled popped bronze sofa springs
    for (const [sx, sy] of [[38, 17], [51, 15], [60, 20]]) {
      buf.pixelRing(sx!, sy! - (f === 0 ? 1 : 0), 2, '#e0a838');
      buf.set(sx!, sy! - 2, '#fff098');
    }
    // Scorched tear marks & settling dust puffs across 3 frames
    buf.ellipse(49, 32, 10, 4, '#1c141c');
    if (f < 2) {
      buf.ellipse(26 - f * 3, 14 - f * 2, 4, 3, '#b8aeb8');
      buf.ellipse(72 + f * 3, 12 - f * 2, 4, 3, '#b8aeb8');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 3. Royal Purple/Crimson Luxury Rug (`sprVenuzCarpet`, 164x68, orig 82,0, 1f — flat floor decal)
  b.addSprite('sprVenuzCarpet', 164, 68, 82, 0, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Gold fringe tassels on left & right ends
    for (let fy = 3; fy < h - 3; fy += 2) {
      buf.rect(0, fy, 4, 1, '#e8bc38');
      buf.rect(w - 4, fy, 4, 1, '#e8bc38');
    }
    // Deep wine outer border & plush crimson-plum body
    buf.rect(4, 2, w - 8, h - 4, '#4c1228');
    buf.rect(6, 4, w - 12, h - 8, '#6e1e38');
    // Double ornate golden geometric border
    buf.rect(7, 5, w - 14, 2, '#e8bc38');
    buf.rect(7, h - 7, w - 14, 2, '#e8bc38');
    buf.rect(7, 5, 2, h - 10, '#e8bc38');
    buf.rect(w - 9, 5, 2, h - 10, '#e8bc38');
    buf.rect(8, 6, w - 16, 1, '#fff098');
    // Inner Greek-key gold dots & woven diamond carpet sheen
    for (let gx = 12; gx < w - 12; gx += 6) {
      buf.rect(gx, 9, 3, 1, '#c89220');
      buf.rect(gx, h - 10, 3, 1, '#c89220');
    }
    for (let py = 12; py < h - 12; py++) {
      for (let px = 12; px < w - 12; px++) {
        if (((px + py) & 15) === 0 || ((px - py + 128) & 15) === 0) {
          buf.set(px, py, '#7c2442');
        }
      }
    }
    // Centered royal gold medallion & Y.V. Triangle + "$" emblem!
    const cx = 82;
    const cy = 34;
    buf.ellipse(cx, cy, 26, 20, '#54142c');
    buf.ellipse(cx, cy, 23, 17, '#c89220');
    buf.ellipse(cx, cy, 20, 14, '#6e1e38');
    buf.poly([[cx, cy - 11], [cx + 13, cy + 10], [cx - 13, cy + 10]], '#e8bc38');
    buf.poly([[cx, cy - 8], [cx + 9, cy + 8], [cx - 9, cy + 8]], '#fff098');
    // Stylized Y.V. eye inside gold triangle
    buf.rect(cx - 4, cy + 1, 8, 3, '#4c1228');
    buf.rect(cx - 2, cy + 2, 4, 1, '#f4f2f8');
    buf.set(cx, cy + 2, '#4c1228');
    // Flanking miniature gold "$" emblems on left & right wings
    for (const dx of [-48, 48]) {
      const mx = cx + dx;
      buf.grid(mx - 2, cy - 4, [
        '..g..',
        '.ggg.',
        'g.g..',
        '.ggg.',
        '..g.g',
        '.ggg.',
        '..g..',
      ], { g: '#f0c440' });
    }
    buf.flush(ctx, x, y);
  });

  // 4. Yung Cuz NPC (`sprCuzIdle` 40f / `sprCuzCry` 15f / `sprCuzHorn` 22f, 32x32, orig 16,16)
  const drawCuzBody = (buf: PxCanvas, cx: number, cy: number, tiltX: number, squashY: number): void => {
    // Ground shadow
    buf.ellipse(cx, cy + 10, 8, 3, '#261a30');
    // Tiny cute stubby feet
    buf.rect(cx - 5, cy + 8, 3, 3, '#c8c2d8');
    buf.rect(cx + 2, cy + 8, 3, 3, '#c8c2d8');
    // Plump pale-white teardrop-pyramid body
    buf.poly([
      [cx + tiltX, cy - 10 + squashY],
      [cx + 8, cy + 3],
      [cx + 7, cy + 8],
      [cx - 7, cy + 8],
      [cx - 8, cy + 3],
    ], '#f4f2f8');
    buf.ellipse(cx, cy + 3, 8, 6 - Math.floor(squashY * 0.5), '#f4f2f8');
    // Soft lavender-grey shading along right/bottom curve & bright top-left highlight
    buf.rect(cx - 6, cy + 6, 12, 2, '#c8c2d8');
    buf.line(cx + tiltX + 1, cy - 8 + squashY, cx + 6, cy + 2, '#ded9ec');
    buf.line(cx + tiltX - 1, cy - 8 + squashY, cx - 5, cy + 2, '#ffffff');
    // Chunky gold bling chain necklace
    buf.line(cx - 5, cy + 4, cx, cy + 6, '#e8b420');
    buf.line(cx, cy + 6, cx + 5, cy + 4, '#e8b420');
    buf.rect(cx - 1, cy + 5, 3, 3, '#ffe868');
    buf.set(cx, cy + 6, '#a87414');
  };

  b.addSprite('sprCuzIdle', 32, 32, 16, 16, 40, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const bounce = f >= 12 && f <= 16 ? -2 : (f % 8 < 4 ? 0 : 1);
    const tilt = f >= 34 ? ((f & 1) === 0 ? -1 : 1) : 0;
    const cy = 16 + bounce;
    drawCuzBody(buf, 16, cy, tilt, bounce > 0 ? 1 : 0);

    // Big glossy adorable cyclops eye (blinks gently on frames 28..31!)
    const blinking = f >= 28 && f <= 31;
    if (blinking) {
      buf.rect(12, cy - 1, 8, 2, '#1c1424');
    } else {
      buf.ellipse(16, cy - 2, 4, 4, '#181220');
      buf.ellipse(16, cy - 2, 3, 3, '#2c2238');
      buf.set(14, cy - 4, '#ffffff');
      buf.set(15, cy - 4, '#ffffff');
      buf.set(18, cy - 1, '#b8a8d8');
    }
    // Handheld game controller held in front, mashing buttons!
    const mash = (f & 1);
    buf.rect(11, cy + 4 + mash, 10, 4, '#363242');
    buf.rect(12, cy + 4 + mash, 8, 1, '#585268');
    buf.set(13, cy + 6 + mash, '#d8d4e0'); // d-pad
    buf.set(18, cy + 5 + mash, f % 4 < 2 ? '#ff4458' : '#ffe858'); // buttons
    buf.set(19, cy + 6 + mash, '#48c8ff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprCuzCry', 32, 32, 16, 16, 15, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const shiver = (f & 1) === 0 ? -1 : 1;
    const cy = 17 + (f % 3 === 0 ? 1 : 0);
    drawCuzBody(buf, 16 + shiver, cy, 0, 1);
    // Scrunched crying eye & open wailing mouth
    buf.line(12 + shiver, cy - 3, 15 + shiver, cy - 1, '#181220');
    buf.line(20 + shiver, cy - 3, 17 + shiver, cy - 1, '#181220');
    buf.ellipse(16 + shiver, cy + 2, 2, 2, '#3a1428');
    buf.set(16 + shiver, cy + 2, '#d84468');
    // Streaming cyan tears pouring down both cheeks!
    const flow = f % 3;
    for (let ty = cy - 1; ty <= 27; ty++) {
      const col = (ty + flow) % 3 === 0 ? '#b8f6ff' : '#48c8ff';
      buf.set(12 + shiver, ty, col);
      buf.set(11 + shiver, ty + 1, '#2898e0');
      buf.set(20 + shiver, ty, col);
      buf.set(21 + shiver, ty + 1, '#2898e0');
    }
    // Tear splash puddles
    buf.ellipse(11, 27, 3 + (f & 1), 1, '#58d8ff');
    buf.ellipse(21, 27, 3 + ((f + 1) & 1), 1, '#58d8ff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprCuzHorn', 32, 32, 16, 16, 22, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const blast = f >= 4 && f <= 18;
    const pump = blast && (f % 4 < 2) ? -2 : 0;
    const cy = 16 + pump;
    drawCuzBody(buf, 15, cy, -1, 0);
    // Excited wide glossy eye
    buf.ellipse(15, cy - 2, 4, 4, '#181220');
    buf.set(13, cy - 4, '#ffffff');
    buf.set(14, cy - 4, '#ffffff');
    // Red & brass airhorn raised up to the right!
    const hx = 21;
    const hy = cy - 3;
    buf.rect(hx - 2, hy + 2, 3, 5, '#d82c28'); // canister
    buf.rect(hx - 1, hy + 2, 1, 4, '#ff6858');
    buf.poly([[hx, hy + 1], [hx + 6, hy - 3], [hx + 6, hy + 3]], '#f5c838'); // trumpet cone
    buf.line(hx + 1, hy, hx + 5, hy - 2, '#fff498');
    buf.outline(INK);
    // Pulsing golden/white airhorn soundwave arcs!
    if (blast) {
      const r1 = 2 + (f % 4);
      buf.line(hx + 7 + r1, hy - 3, hx + 8 + r1, hy, '#ffe858');
      buf.line(hx + 8 + r1, hy, hx + 7 + r1, hy + 3, '#ffe858');
      if (f % 2 === 0) {
        buf.set(hx + 9 + r1, hy - 4, '#ffffff');
        buf.set(hx + 9 + r1, hy + 4, '#ffffff');
      }
    }
    buf.flush(ctx, x, y);
  });

  // 5. Giant Y.V.'s Crib Chests (`sprGiantWepChest` / `Open`, `sprGiantAmmoChest` / `Open`, 64x64, orig 32,32, 7/1f)
  const drawGiantChest = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    isAmmo: boolean,
    open: boolean,
  ): void => {
    const buf = new PxCanvas(w, h);
    const lidMain = isAmmo ? '#e8b428' : '#c82c34';
    const lidHi = isAmmo ? '#fff088' : '#ff6654';
    const lidDark = isAmmo ? '#9e6810' : '#7c1822';
    const bodyMain = isAmmo ? '#b87414' : '#881c28';
    const bodyDark = isAmmo ? '#744408' : '#4e1018';
    const trim = isAmmo ? '#dfe8f2' : '#f5c838';
    const trimHi = '#ffffff';
    const trimDark = isAmmo ? '#8896a8' : '#a87614';

    if (!open && f === 1) {
      // Authentic pure-white hurt flash frame (f1 in 7-frame glint cadence)
      buf.rect(6, 12, 52, 42, '#ffffff');
      buf.rect(9, 9, 46, 5, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    if (open) {
      // Wide open vaulted lid flipped back + hollow dark vault interior
      buf.rect(8, 6, 48, 16, lidDark);
      buf.rect(10, 7, 44, 12, lidMain);
      buf.rect(10, 7, 44, 3, lidHi);
      // Trim bands on raised lid
      buf.rect(14, 6, 5, 16, trimDark);
      buf.rect(45, 6, 5, 16, trimDark);
      // Lower massive chest box
      buf.rect(6, 22, 52, 34, bodyMain);
      buf.rect(8, 22, 48, 14, '#140c18'); // deep dark empty vault interior
      buf.rect(10, 24, 44, 8, '#22162c');
      buf.rect(6, 36, 52, 3, trim);
      buf.rect(6, 52, 52, 4, bodyDark);
      buf.rect(14, 36, 5, 20, trim);
      buf.rect(45, 36, 5, 20, trim);
      buf.rect(28, 35, 8, 7, trimDark);
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    // Ornate corner feet
    buf.rect(8, 52, 8, 5, trimDark);
    buf.rect(48, 52, 8, 5, trimDark);
    // Domed colossal chest lid (y=10..31)
    buf.rect(8, 10, 48, 22, lidMain);
    buf.rect(6, 14, 52, 18, lidMain);
    buf.rect(10, 10, 44, 4, lidHi);
    buf.rect(8, 14, 48, 2, lidHi);
    buf.rect(6, 29, 52, 3, lidDark);
    // Heavy dark seam
    buf.rect(6, 32, 52, 2, INK);
    // Massive lower vault body (y=34..54)
    buf.rect(6, 34, 52, 20, bodyMain);
    buf.rect(6, 50, 52, 4, bodyDark);
    // Twin forged vertical reinforcement straps with rivets
    for (const sx of [13, 45]) {
      buf.rect(sx, 10, 6, 44, trimDark);
      buf.rect(sx + 1, 10, 4, 43, trim);
      buf.rect(sx + 1, 11, 2, 18, trimHi);
      for (const ry of [13, 25, 39, 49]) {
        buf.set(sx + 2, ry, trimDark);
        buf.set(sx + 3, ry, trimHi);
      }
    }
    // Ornate gold/platinum edge corner plates
    buf.rect(6, 14, 4, 6, trim);
    buf.rect(54, 14, 4, 6, trim);
    buf.rect(6, 48, 5, 6, trim);
    buf.rect(53, 48, 5, 6, trim);
    // Colossal central lock medallion & emblem
    buf.rect(25, 26, 14, 14, trimDark);
    buf.rect(26, 27, 12, 12, trim);
    buf.rect(27, 27, 10, 2, trimHi);
    buf.rect(29, 30, 6, 6, isAmmo ? '#744408' : '#4e1018');
    if (isAmmo) {
      // Embossed twin bullet shells emblem
      buf.rect(30, 31, 1, 4, '#ffe868');
      buf.rect(33, 31, 1, 4, '#ffe868');
    } else {
      // Embossed "$" crown crest
      buf.rect(31, 31, 2, 4, '#fff498');
      buf.set(30, 32, '#fff498');
      buf.set(33, 34, '#fff498');
    }

    // Diagonal gleaming metallic glint sweep on frames 2..6
    if (f >= 2 && f <= 6) {
      const gx = 10 + (f - 2) * 10;
      for (let d = 0; d < 20; d++) {
        const px = gx + d - 6;
        const py = 11 + d;
        if (px >= 8 && px <= 54 && py >= 11 && py <= 52) {
          buf.set(px, py, '#ffffff');
          if (px + 1 <= 54) buf.set(px + 1, py, '#fff8c8');
        }
      }
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  b.addSprite('sprGiantWepChest', 64, 64, 32, 32, 7, (ctx, x, y, w, h, f) => drawGiantChest(ctx, x, y, w, h, f, false, false));
  b.addSprite('sprGiantWepChestOpen', 64, 64, 32, 32, 1, (ctx, x, y, w, h, f) => drawGiantChest(ctx, x, y, w, h, f, false, true));
  b.addSprite('sprGiantAmmoChest', 64, 64, 32, 32, 7, (ctx, x, y, w, h, f) => drawGiantChest(ctx, x, y, w, h, f, true, false));
  b.addSprite('sprGiantAmmoChestOpen', 64, 64, 32, 32, 1, (ctx, x, y, w, h, f) => drawGiantChest(ctx, x, y, w, h, f, true, true));

  // 6. Sleek Sparkling Solid-Gold Crib Sports Coupe (`sprVenuzCar2` / `Hurt`, 32x32, orig 16,16, 1/3f)
  const drawVenuzCar2 = (ctx: DrawCtx, x: number, y: number, w: number, h: number, f: number, hurt: boolean): void => {
    const buf = new PxCanvas(w, h);
    if (hurt && f === 0) {
      buf.rect(3, 8, 26, 16, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // Sport tires with gold rims
    buf.rect(6, 6, 6, 3, '#1e1a24');
    buf.rect(20, 6, 6, 3, '#1e1a24');
    buf.rect(6, 23, 6, 3, '#1e1a24');
    buf.rect(20, 23, 6, 3, '#1e1a24');
    // Sleek sculpted solid-gold coupe body
    const body = hurt && f === 1 ? '#fff6c0' : '#e8b624';
    const hi = hurt && f === 1 ? '#ffffff' : '#fff498';
    const mid = '#f5c838';
    const dark = '#a67010';
    buf.rect(3, 9, 26, 14, body);
    buf.rect(4, 8, 24, 16, body);
    buf.rect(5, 9, 22, 3, mid);
    buf.rect(6, 9, 20, 1, hi);
    buf.rect(4, 21, 24, 3, dark);
    // Racing hood scoop & rear spoiler
    buf.rect(22, 13, 5, 6, dark);
    buf.rect(23, 14, 3, 4, hi);
    buf.rect(3, 9, 2, 14, dark);
    buf.rect(3, 10, 1, 12, hi);
    // Sleek tinted royal-purple cabin windshield & rear window
    buf.rect(8, 10, 14, 12, '#301e44');
    buf.rect(11, 11, 7, 10, mid); // gold roof
    buf.rect(12, 11, 5, 2, hi);
    buf.line(19, 11, 21, 15, '#b894e8'); // glass specular glint
    // Bright headlights & crimson sports taillights
    buf.rect(28, 10, 1, 3, '#ffffff');
    buf.rect(28, 19, 1, 3, '#ffffff');
    buf.rect(3, 10, 1, 3, '#ff3444');
    buf.rect(3, 19, 1, 3, '#ff3444');
    // Sparkle glint on hood
    buf.set(24, 10, '#ffffff');
    buf.set(23, 10, '#fff498');
    buf.set(25, 10, '#fff498');
    buf.set(24, 9, '#fff498');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprVenuzCar2', 32, 32, 16, 16, 1, (ctx, x, y, w, h, f) => drawVenuzCar2(ctx, x, y, w, h, f, false));
  b.addSprite('sprVenuzCar2Hurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawVenuzCar2(ctx, x, y, w, h, f, true));
}

// ============================================================================
// SECTION 2: IDPD HQ-3 CAPTAIN'S OFFICE & HQ-1/2 PROPS
// ============================================================================

function registerIdpdHqProps(b: FallbackAtlasBuilder): void {
  // 1. Captain's Executive Desk (`sprDeskEmpty` 128x85, `sprDeskDead` 128x64 3f, `sprDeskDebris` 24x24 4f)
  b.addSprite('sprDeskEmpty', 128, 85, 64, 52, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Ground contact shadow
    buf.rect(8, 74, 112, 6, '#141a28');
    // Heavy executive curved brushed-steel & navy command desk
    buf.poly([[10, 22], [118, 22], [122, 38], [116, 75], [12, 75], [6, 38]], '#3c485a');
    // Desktop surface (top plane y=22..46)
    buf.poly([[12, 22], [116, 22], [120, 44], [8, 44]], '#687688');
    buf.rect(14, 23, 100, 3, '#98a8bc');
    buf.rect(10, 43, 108, 2, '#2a3444');
    // Glowing cobalt-blue holographic desk rim trim
    buf.rect(10, 45, 108, 2, '#3278e8');
    buf.rect(14, 45, 100, 1, '#78e4ff');
    // Front modesty steel panels & central IDPD shield crest
    buf.rect(12, 47, 104, 27, '#4a586c');
    buf.rect(14, 49, 28, 22, '#344052');
    buf.rect(86, 49, 28, 22, '#344052');
    // Central recessed IDPD emblem plaque
    buf.rect(46, 49, 36, 22, '#1e3464');
    buf.rect(47, 50, 34, 20, '#2a4a8e');
    buf.poly([[64, 52], [72, 56], [70, 66], [64, 69], [58, 66], [56, 56]], '#e8f2fc');
    buf.poly([[64, 54], [69, 57], [68, 64], [64, 66], [60, 64], [59, 57]], '#3278e8');
    buf.rect(62, 57, 4, 5, '#78f0ff');
    // Dark leather executive desk blotter pad & dossier stacks
    buf.rect(44, 27, 40, 14, '#242c3c');
    buf.rect(46, 28, 36, 12, '#2e384c');
    // Left angled dual holographic monitor console
    buf.rect(16, 25, 22, 13, '#222a38');
    buf.rect(18, 27, 18, 9, '#163868');
    buf.line(19, 32, 24, 29, '#68e8ff');
    buf.line(24, 29, 29, 34, '#68e8ff');
    buf.line(29, 34, 34, 28, '#68e8ff');
    // Right dossiers, blue IDPD folder & coffee mug
    buf.rect(90, 27, 14, 10, '#dce6f2');
    buf.rect(92, 29, 10, 1, '#3278e8');
    buf.rect(92, 32, 8, 1, '#687888');
    buf.rect(107, 30, 5, 6, '#e8eef4');
    buf.rect(108, 30, 3, 2, '#5a3420');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprDeskDead', 128, 64, 64, 32, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Scorched crater & shattered left/right steel desk halves
    buf.ellipse(64, 36, 36, 16, '#1a1e28');
    buf.poly([[10, 16], [52, 20], [46, 52], [14, 54], [6, 34]], '#3e4a5c');
    buf.poly([[12, 18], [48, 22], [44, 34], [10, 32]], '#647284');
    buf.poly([[76, 18], [118, 14], [122, 36], [112, 54], [80, 50]], '#3e4a5c');
    buf.poly([[78, 20], [116, 16], [118, 32], [82, 34]], '#647284');
    // Jagged broken metallic shards & scattered white dossier papers
    buf.rect(52, 28, 10, 6, '#283444');
    buf.rect(64, 40, 12, 5, '#4c5c70');
    buf.rect(40, 46, 8, 6, '#dce6f2');
    buf.rect(74, 22, 7, 5, '#dce6f2');
    // Crackling blue/yellow holographic wiring sparks across 3 frames
    const spx = 56 + f * 8;
    const spy = 28 + (f & 1) * 6;
    buf.line(spx - 5, spy, spx + 5, spy, '#68f0ff');
    buf.line(spx, spy - 4, spx, spy + 4, '#ffffff');
    buf.rect(spx - 1, spy - 1, 2, 2, '#ffe868');
    // Rising smoke puff
    buf.ellipse(62 - f * 2, 18 - f * 3, 7, 5, '#545e6e');
    buf.ellipse(61 - f * 2, 17 - f * 3, 4, 3, '#7c8898');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprDeskDebris', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Bent steel armor desk panel w/ blue trim
      buf.poly([[4, 8], [18, 5], [20, 15], [6, 18]], '#5c6c80');
      buf.line(5, 9, 17, 6, '#96a8bc');
      buf.line(6, 16, 19, 13, '#3884f0');
    } else if (f === 1) {
      // Cracked desk monitor piece
      buf.rect(5, 6, 14, 11, '#2c3442');
      buf.rect(7, 8, 10, 7, '#183c70');
      buf.line(8, 9, 15, 14, '#78f0ff');
    } else if (f === 2) {
      // Scattered IDPD dossier sheets
      buf.poly([[4, 10], [16, 6], [20, 14], [8, 18]], '#e4eef8');
      buf.line(8, 11, 15, 9, '#3278e8');
      buf.line(9, 14, 16, 12, '#788898');
    } else {
      // Broken steel table leg
      buf.line(5, 18, 19, 6, '#4c5a6c', 4);
      buf.line(6, 17, 18, 6, '#8c9eb0', 1);
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 2. Seated Captain Behind Desk (`sprDeskIdle`/`Trans`/`Turn`/`Wait`, 36x48, orig 18,48, 18/5/6/9f)
  const drawCaptainAtDesk = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    pose: 'idle' | 'trans' | 'turn' | 'wait',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    const breath = pose === 'idle' ? (f % 18 >= 9 ? 1 : 0) : pose === 'wait' ? (f % 9 >= 5 ? 1 : 0) : 0;
    const facingFront = pose === 'wait' || (pose === 'turn' && f >= 3);
    const turnOffset = pose === 'turn' ? (f - 3) : pose === 'trans' ? Math.min(2, f) - 1 : 0;
    const cx = 18;
    const cy = 22 + breath;

    // Tall executive command chair headrest behind Captain
    buf.rect(9, 14, 18, 30, '#222d40');
    buf.rect(10, 14, 16, 2, '#4a5c78');
    buf.rect(9, 16, 2, 26, '#364660');
    buf.rect(25, 16, 2, 26, '#364660');

    // Captain's imposing cobalt-blue & white armored mantle & cape shoulders
    buf.poly([[6, 44], [8, cy + 2], [28, cy + 2], [30, 44]], '#2650a8');
    buf.rect(9, cy + 2, 18, 10, '#1e3e86');
    // White armored shoulder pauldrons & high collar cape
    buf.rect(6, cy + 1, 7, 9, '#dce8f6');
    buf.rect(7, cy + 1, 5, 2, '#ffffff');
    buf.rect(23, cy + 1, 7, 9, '#dce8f6');
    buf.rect(24, cy + 1, 5, 2, '#ffffff');
    // Gold officer trim & insignia
    buf.rect(13, cy + 3, 10, 2, '#f5d038');
    buf.rect(16, cy + 5, 4, 6, '#e8f2fc');
    buf.rect(17, cy + 6, 2, 4, '#3480e8');

    // Captain's iconic helmeted head
    const hx = cx + (pose === 'turn' ? Math.round(turnOffset * 0.5) : 0);
    const hy = cy - 6;
    buf.ellipse(hx, hy, 6, 6, '#2650a8');
    buf.ellipse(hx, hy - 1, 5, 4, '#e8f2fc'); // white helmet dome
    buf.rect(hx - 4, hy - 5, 8, 2, '#ffffff');
    buf.rect(hx - 1, hy - 6, 2, 4, '#f5d038'); // central gold crest

    if (facingFront) {
      // Glowing cyan commander visor watching the player!
      buf.rect(hx - 4, hy, 8, 3, '#101c34');
      const glow = pose === 'wait' && (f % 4 === 0) ? '#ffffff' : '#68f4ff';
      buf.rect(hx - 3, hy + 1, 6, 1, glow);
      buf.set(hx - 1, hy + 1, '#ffffff');
      // Resting glowing cyan energy gauntlet raised near desk edge
      if (pose === 'wait') {
        const gPulse = (f & 1) === 0 ? '#68f4ff' : '#3298ff';
        buf.rect(22, 34 + breath, 6, 6, '#224898');
        buf.rect(23, 35 + breath, 4, 4, gPulse);
        buf.set(24, 36 + breath, '#ffffff');
      }
    } else if (pose === 'trans' || (pose === 'turn' && f < 3)) {
      // Profile swivel view — visor emerging from side!
      const vx = hx + (turnOffset >= 0 ? 1 : -4);
      buf.rect(vx, hy, 4, 3, '#101c34');
      buf.rect(vx + 1, hy + 1, 3, 1, '#68f4ff');
    } else {
      // Seated calmly with visor dimmed/turned slightly away
      buf.rect(hx - 3, hy + 1, 6, 2, '#1a3266');
      if (f % 6 < 2) buf.set(hx + 2, hy + 1, '#48a8e8');
    }

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprDeskIdle', 36, 48, 18, 48, 18, (ctx, x, y, w, h, f) => drawCaptainAtDesk(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprDeskTrans', 36, 48, 18, 48, 5, (ctx, x, y, w, h, f) => drawCaptainAtDesk(ctx, x, y, w, h, 'trans', f));
  b.addSprite('sprDeskTurn', 36, 48, 18, 48, 6, (ctx, x, y, w, h, f) => drawCaptainAtDesk(ctx, x, y, w, h, 'turn', f));
  b.addSprite('sprDeskWait', 36, 48, 18, 48, 9, (ctx, x, y, w, h, f) => drawCaptainAtDesk(ctx, x, y, w, h, 'wait', f));

  // 3. Giant Wall-Mounted HQ Surveillance Monitor (`sprBigTVOff`/`TurnOn`/`On`/`Lines`/`Dead`, 113x96, orig 56,48)
  const drawBigTVFrame = (buf: PxCanvas): void => {
    // Heavy steel mounting brackets & chamfered industrial frame
    buf.rect(4, 6, 105, 84, '#3c4858');
    buf.rect(6, 4, 101, 88, '#3c4858');
    buf.rect(7, 5, 99, 3, '#64768c');
    buf.rect(7, 88, 99, 3, '#222a36');
    // Corner bolts
    for (const [bx, by] of [[9, 9], [102, 9], [9, 85], [102, 85]]) {
      buf.rect(bx!, by!, 2, 2, '#8c9eb4');
    }
    // Top camera sensor bar & bottom indicator bezel
    buf.rect(44, 6, 25, 4, '#242c3a');
    buf.rect(54, 7, 5, 2, '#3488e8');
  };

  b.addSprite('sprBigTVOff', 113, 96, 56, 48, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    drawBigTVFrame(buf);
    buf.rect(11, 13, 91, 68, '#101622');
    buf.rect(13, 15, 87, 64, '#162030');
    // Subtle off-screen glass sheen
    buf.line(18, 22, 34, 16, '#26344a', 2);
    buf.line(22, 32, 46, 20, '#202c40', 1);
    buf.rect(94, 84, 4, 2, '#b82c34'); // standby red LED
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprBigTVTurnOn', 113, 96, 56, 48, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    drawBigTVFrame(buf);
    buf.rect(11, 13, 91, 68, '#101622');
    if (f === 0) {
      buf.rect(14, 45, 85, 4, '#68e8ff');
      buf.rect(24, 46, 65, 2, '#ffffff');
    } else if (f === 1) {
      buf.rect(13, 28, 87, 38, '#1c4c8c');
      buf.rect(15, 32, 83, 30, '#48b4ff');
      for (let sy = 30; sy < 64; sy += 4) buf.rect(14, sy, 85, 1, '#c8f8ff');
    } else {
      buf.rect(13, 15, 87, 64, '#2874cc');
      buf.rect(16, 18, 81, 58, '#68d4ff');
      buf.rect(24, 26, 65, 42, '#c8f8ff');
    }
    buf.rect(94, 84, 4, 2, '#58ff74');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprBigTVOn', 113, 96, 56, 48, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    drawBigTVFrame(buf);
    buf.rect(11, 13, 91, 68, '#101828');
    buf.rect(13, 15, 87, 64, '#142844');
    // Tactical blue surveillance grid
    for (let gx = 21; gx < 98; gx += 12) buf.rect(gx, 15, 1, 64, '#1d3c66');
    for (let gy = 23; gy < 78; gy += 12) buf.rect(13, gy, 87, 1, '#1d3c66');
    // Glowing pixelated wasteland radar continent & portal rings
    buf.poly([[22, 46], [36, 28], [58, 30], [72, 44], [64, 62], [38, 66], [24, 58]], '#245898');
    buf.poly([[28, 46], [38, 34], [55, 36], [64, 45], [58, 56], [40, 58]], '#3884d8');
    buf.pixelRing(48, 46, 10, '#68d8ff');
    buf.pixelRing(48, 46, 5, '#b8f4ff');
    // Red target anomaly blips
    buf.rect(47, 45, 3, 3, '#ff4054');
    buf.rect(34, 38, 2, 2, '#ffe858');
    buf.rect(60, 52, 2, 2, '#ff4054');
    // Right-hand telemetry readout bars
    for (let ry = 20; ry <= 70; ry += 6) {
      const len = 8 + ((ry * 7) % 12);
      buf.rect(78, ry, len, 3, ry % 12 === 0 ? '#68f4ff' : '#3284d8');
    }
    buf.rect(94, 84, 4, 2, '#58ff74');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Translucent-style CRT holographic scanline overlay (`sprBigTVLines`, 113x96, orig 56,48, 1f)
  b.addSprite('sprBigTVLines', 113, 96, 56, 48, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    for (let sy = 15; sy < 79; sy += 3) {
      buf.rect(13, sy, 87, 1, sy % 9 === 0 ? '#8ceeff' : '#48b4ff');
    }
    // Bright horizontal refresh sweep bar
    buf.rect(13, 34, 87, 2, '#c8f8ff');
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprBigTVDead', 113, 96, 56, 48, 4, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    drawBigTVFrame(buf);
    buf.rect(11, 13, 91, 68, '#0c1018');
    buf.ellipse(54, 46, 16, 13, '#07090e');
    // Spiderweb screen cracks
    buf.line(54, 46, 14, 16, '#566478');
    buf.line(54, 46, 98, 20, '#566478');
    buf.line(54, 46, 20, 76, '#566478');
    buf.line(54, 46, 94, 74, '#566478');
    buf.line(54, 46, 54, 14, '#3e4a5a');
    // Animated sparks & smoke wisps across 4 frames
    const sx = 46 + (f * 7) % 20;
    const sy = 40 + (f * 5) % 14;
    if ((f & 1) === 0) {
      buf.line(sx - 4, sy, sx + 4, sy, '#68f4ff');
      buf.line(sx, sy - 4, sx, sy + 4, '#ffe868');
      buf.set(sx, sy, '#ffffff');
    }
    buf.ellipse(58, 36 - f * 4, 6, 4, '#4c5464');
    buf.ellipse(57, 35 - f * 4, 3, 2, '#747e90');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 4. Captain's Swivel Chair (`sprLastChair`, 24x24, orig 12,12, 1f)
  b.addSprite('sprLastChair', 24, 24, 12, 12, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Chrome swivel legs
    buf.line(6, 20, 18, 20, '#788a9c', 2);
    buf.rect(11, 16, 2, 5, '#9ab0c4');
    // High navy leather backrest & padded seat cushion
    buf.rect(6, 3, 12, 11, '#222e44');
    buf.rect(7, 4, 10, 8, '#364866');
    buf.rect(8, 4, 8, 2, '#526a8e');
    buf.rect(5, 12, 14, 5, '#2b3a54');
    buf.rect(6, 12, 12, 2, '#486084');
    // Chrome armrests & blue IDPD accent
    buf.rect(4, 10, 2, 6, '#90a4b8');
    buf.rect(18, 10, 2, 6, '#90a4b8');
    buf.rect(9, 7, 6, 1, '#48a4f8');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 5. IDPD Messenger NPC (`sprMessengerIdle` 14f, `sprMessengerWalk` 6f, `sprMessengerSigh` 20f, 24x24, orig 12,12)
  const drawMessenger = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    mode: 'idle' | 'walk' | 'sigh',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    const bob = mode === 'walk' ? (f % 2 === 0 ? -1 : 0) : mode === 'sigh' && f >= 6 && f <= 15 ? 1 : 0;
    const legL = mode === 'walk' ? [0, 2, 1, -1, -2, -1][f % 6]! : 0;
    const legR = -legL;

    buf.ellipse(12, 20, 5, 2, '#182032');
    // Boots
    buf.rect(8 + legL, 17, 3, 3, '#1a2c5a');
    buf.rect(13 + legR, 17, 3, 3, '#1a2c5a');
    // Cobalt-blue IDPD tunic
    buf.rect(7, 10 + bob, 10, 8, '#2b5ec4');
    buf.rect(8, 10 + bob, 4, 7, '#4c84e8');
    buf.rect(7, 15 + bob, 10, 2, '#1a387a');
    buf.rect(11, 15 + bob, 2, 2, '#e8eef8'); // silver belt buckle
    // White IDPD dome helmet & cyan visor
    const headDrop = mode === 'sigh' && f >= 6 && f <= 15 ? 1 : 0;
    buf.ellipse(12, 7 + bob + headDrop, 5, 4, '#e6f0fa');
    buf.rect(9, 3 + bob + headDrop, 6, 2, '#ffffff');
    buf.rect(8, 7 + bob + headDrop, 8, 2, '#162850');
    buf.rect(9, 7 + bob + headDrop, 6, 1, '#68f0ff');
    // Tan wooden clipboard with white paper held in right hand
    const clipY = 11 + bob + (mode === 'idle' && f >= 7 && f <= 10 ? -1 : 0);
    buf.rect(15, clipY, 5, 6, '#b8864c');
    buf.rect(16, clipY + 1, 3, 4, '#f4f6fa');
    buf.set(17, clipY + 2, '#3478e0');
    buf.set(17, clipY + 4, '#7a8a9c');
    buf.outline(INK);
    // Visible sigh puff during `sprMessengerSigh`
    if (mode === 'sigh' && f >= 8 && f <= 16) {
      const py = 7 - Math.floor((f - 8) * 0.6);
      const px = 16 + Math.floor((f - 8) * 0.4);
      buf.ellipse(px, py, 2, 1, '#dceaf6');
      buf.set(px, py, '#ffffff');
    }
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprMessengerIdle', 24, 24, 12, 12, 14, (ctx, x, y, w, h, f) => drawMessenger(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprMessengerWalk', 24, 24, 12, 12, 6, (ctx, x, y, w, h, f) => drawMessenger(ctx, x, y, w, h, 'walk', f));
  b.addSprite('sprMessengerSigh', 24, 24, 12, 12, 20, (ctx, x, y, w, h, f) => drawMessenger(ctx, x, y, w, h, 'sigh', f));

  // 6. HQ Office Tables (`sprTable1`/`2` + `Hurt`/`Dead`, 32x32, orig 16,16, 1/3/3f)
  const drawHqTable = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    variant: 1 | 2,
    mode: 'idle' | 'hurt' | 'dead',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(4, 8, 24, 16, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.poly([[4, 16], [15, 13], [14, 24], [5, 25]], '#4a5868');
      buf.poly([[17, 14], [28, 17], [26, 26], [18, 23]], '#5e6e80');
      buf.line(8, 24, 22, 18, '#343e4c', 2);
      // Scattered white/blue office papers & tiny dust puff
      buf.rect(12, 10, 5, 4, '#e6eef8');
      buf.rect(20, 22, 4, 3, '#c8d8ec');
      if (f < 2) buf.ellipse(16, 14 - f * 2, 4, 3, '#8c98a8');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const topCol = mode === 'hurt' ? '#d8ecff' : '#7e8c9e';
    const topHi = mode === 'hurt' ? '#ffffff' : '#aebcc8';
    // Steel table legs
    buf.rect(5, 20, 3, 7, '#445262');
    buf.rect(24, 20, 3, 7, '#445262');
    // Steel tabletop & front apron with blue IDPD trim
    buf.rect(4, 9, 24, 11, topCol);
    buf.rect(5, 9, 22, 2, topHi);
    buf.rect(4, 19, 24, 3, '#4e5c6e');
    buf.rect(5, 20, 22, 1, '#3884e8');
    if (variant === 1) {
      // Dossier stack, mug & datapad
      buf.rect(7, 11, 7, 6, '#e6eef8');
      buf.rect(8, 12, 5, 1, '#3884e8');
      buf.rect(8, 14, 4, 1, '#7a8a9c');
      buf.rect(17, 12, 6, 4, '#24344c');
      buf.rect(18, 13, 4, 2, '#58d8ff');
      buf.rect(24, 13, 2, 3, '#eef4fa');
    } else {
      // Twin-monitor HQ workstation desk
      buf.rect(7, 8, 8, 7, '#2a3444');
      buf.rect(8, 9, 6, 5, '#38b8ff');
      buf.set(9, 10, '#c8f8ff');
      buf.rect(17, 8, 8, 7, '#2a3444');
      buf.rect(18, 9, 6, 5, '#2878d8');
      buf.rect(19, 11, 4, 1, '#88f4ff');
      buf.rect(10, 16, 12, 2, '#c8d4e0'); // keyboard
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprTable1', 32, 32, 16, 16, 1, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 1, 'idle', f));
  b.addSprite('sprTable1Hurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 1, 'hurt', f));
  b.addSprite('sprTable1Dead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 1, 'dead', f));
  b.addSprite('sprTable2', 32, 32, 16, 16, 1, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 2, 'idle', f));
  b.addSprite('sprTable2Hurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 2, 'hurt', f));
  b.addSprite('sprTable2Dead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawHqTable(ctx, x, y, w, h, 2, 'dead', f));

  // 7. IDPD Computer Terminal (`sprTerminal` + `Hurt`/`Dead`, 24x24, orig 12,12, 4/3/3f)
  const drawTerminal = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(5, 3, 14, 18, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.rect(5, 11, 14, 10, '#3a4452');
      buf.rect(7, 13, 10, 6, '#141a24');
      buf.line(8, 14, 15, 18, '#68f0ff');
      if ((f & 1) === 0) {
        buf.set(12, 10, '#ffe868');
        buf.set(14, 9, '#68f4ff');
      }
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // Sleek steel terminal housing & pedestal
    buf.rect(5, 3, 14, 18, mode === 'hurt' ? '#d8ecff' : '#6c7c90');
    buf.rect(6, 3, 12, 2, '#9eb0c4');
    buf.rect(5, 18, 14, 3, '#3c4858');
    // Glowing blue CRT screen with scrolling telemetry lines
    buf.rect(7, 5, 10, 8, '#163668');
    buf.rect(8, 6, 8, 6, '#2e88e8');
    buf.rect(8, 6 + (f % 4), 6, 1, '#b8f8ff');
    buf.rect(8, 8 + ((f + 2) % 3), 4, 1, '#68dcff');
    buf.set(14, 10, (f & 1) === 0 ? '#ffffff' : '#68dcff');
    // Illuminated keyboard & status LED
    buf.rect(6, 14, 12, 3, '#2a3444');
    buf.rect(7, 15, 8, 1, '#8ca0b4');
    buf.set(16, 15, '#58ff74');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprTerminal', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawTerminal(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprTerminalHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawTerminal(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprTerminalDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawTerminal(ctx, x, y, w, h, 'dead', f));

  // 8. Compact Plasma Generator Pod (`sprSmallGenerator` + `Hurt`/`Dead`, 32x32, orig 16,16, 11/3/3f)
  const drawSmallGen = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(7, 4, 18, 24, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.rect(6, 16, 20, 12, '#3a424e');
      buf.rect(8, 12, 16, 8, '#1a2028');
      buf.rect(9, 10, 4, 6, '#5a6676');
      buf.rect(19, 11, 4, 5, '#5a6676');
      if (f < 2) {
        buf.line(14, 14, 18, 10, '#68f4ff');
        buf.set(16, 12, '#ffffff');
      }
      buf.ellipse(16, 19, 5, 3, '#1e5e54');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const phase = Math.sin((f / 11) * Math.PI * 2);
    const coreA = phase > 0.3 ? '#68ffe8' : phase > -0.3 ? '#38d8c8' : '#24a89e';
    const coreHi = phase > 0.2 ? '#ffffff' : '#b8fff4';
    // Heavy steel octagonal base & top cap
    buf.rect(6, 22, 20, 6, '#485464');
    buf.rect(7, 22, 18, 2, '#7c8ca0');
    buf.rect(7, 4, 18, 5, '#5a687a');
    buf.rect(8, 4, 16, 2, '#96a6b8');
    // Glowing cylindrical energy tube
    buf.rect(9, 9, 14, 13, '#1c6c68');
    buf.rect(10, 9, 12, 13, coreA);
    buf.rect(11, 10, 4, 11, coreHi);
    // Rising plasma bubble inside tube
    const by = 20 - ((f * 2) % 10);
    buf.rect(16, by, 2, 2, '#ffffff');
    // Reinforced dark steel protective ribs
    buf.rect(8, 13, 16, 1, '#2c3440');
    buf.rect(8, 18, 16, 1, '#2c3440');
    buf.rect(7, 9, 2, 13, '#4c5868');
    buf.rect(23, 9, 2, 13, '#4c5868');
    // Alternating top indicator LEDs
    buf.set(11, 6, f % 2 === 0 ? '#58ff88' : '#246838');
    buf.set(20, 6, f % 2 === 1 ? '#48c8ff' : '#1c4878');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprSmallGenerator', 32, 32, 16, 16, 11, (ctx, x, y, w, h, f) => drawSmallGen(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprSmallGeneratorHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSmallGen(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprSmallGeneratorDead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSmallGen(ctx, x, y, w, h, 'dead', f));

  // 9. Open IDPD Supply Chest (`sprIDPDChestOpen`, 16x16, orig 8,8, 1f)
  b.addSprite('sprIDPDChestOpen', 16, 16, 8, 8, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(2, 2, 12, 4, '#183062');
    buf.rect(3, 2, 10, 1, '#4888e0');
    buf.rect(2, 6, 12, 8, '#2650a0');
    buf.rect(3, 6, 10, 4, '#101424');
    buf.rect(2, 13, 12, 1, '#162d5c');
    buf.rect(7, 10, 2, 2, '#78ecff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // 10. Server Rack Hurt & Dead (`sprServerHurt` / `sprServerDead`, 32x32, orig 16,16, 3/3f)
  b.addSprite('sprServerHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      buf.rect(8, 3, 16, 26, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const ox = f === 1 ? -1 : 1;
    buf.rect(8 + ox, 3, 16, 26, f === 1 ? '#dceeff' : '#4a5264');
    for (let bay = 0; bay < 5; bay++) {
      const by = 6 + bay * 4;
      buf.rect(10 + ox, by, 12, 2, '#181c26');
      buf.set(20 + ox, by, '#ff5858');
      buf.set(21 + ox, by + 1, '#68f4ff');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprServerDead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    // Toppled smashed dark charcoal server rack
    buf.rect(5, 13, 22, 14, '#242832');
    buf.rect(6, 14, 20, 2, '#444c5c');
    buf.rect(8, 17, 16, 8, '#12151c');
    // Busted drive bays & hanging wires
    buf.rect(9, 18, 6, 3, '#384050');
    buf.rect(17, 20, 6, 4, '#2e3644');
    buf.bezier(14, 21, 16, 26, 20, 27, '#e83838', 1);
    buf.bezier(12, 22, 10, 26, 7, 27, '#48d4ff', 1);
    // Crackling sparks & smoke across 3 frames
    if ((f & 1) === 0) {
      buf.set(16, 15, '#ffe868');
      buf.set(17, 14, '#68f4ff');
      buf.set(15, 14, '#ffffff');
    }
    buf.ellipse(15, 10 - f * 2, 4, 3, '#525866');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });
}

// ============================================================================
// SECTION 3A: MISSING BIOME HAZARDS, CHESTS, STATUES & PROPS
// ============================================================================

function registerBiomeHazardsAndProps(b: FallbackAtlasBuilder): void {
  // 1. SCRAPYARD FIRE TRAP (`sprTrap` 32x24 orig 8,8 1f, `sprTrapFire` 16x16 7f, `sprTrapScorchMark` 80x80 1f)
  b.addSprite('sprTrap', 32, 24, 8, 8, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Heavy riveted rusty iron wall-mounted flamethrower grate
    buf.rect(3, 3, 25, 17, '#584c48');
    buf.rect(4, 3, 23, 2, '#867872');
    buf.rect(3, 18, 25, 2, '#342c2a');
    // Yellow/black industrial hazard stripe along left wall plate
    for (let sy = 5; sy <= 15; sy += 4) {
      buf.rect(4, sy, 4, 2, '#d89828');
      buf.rect(4, sy + 2, 4, 2, '#241e20');
    }
    // Recessed scorched flamethrower exhaust vent & iron grill bars
    buf.rect(10, 5, 16, 12, '#1c1518');
    for (let gy = 7; gy <= 14; gy += 3) {
      buf.rect(10, gy, 16, 1, '#4c4240');
    }
    // Red-hot inner nozzle & glowing pilot flame ember
    buf.rect(11, 8, 6, 6, '#9c281c');
    buf.rect(12, 9, 4, 4, '#e84820');
    buf.rect(14, 10, 3, 2, '#ffd040');
    buf.set(16, 11, '#fff6a8');
    // Rusty protruding nozzle flange on right edge
    buf.rect(25, 6, 4, 10, '#6e5e58');
    buf.rect(26, 7, 2, 8, '#302424');
    // Corner bolts
    buf.set(5, 4, '#a49892');
    buf.set(25, 4, '#a49892');
    buf.set(5, 18, '#a49892');
    buf.set(25, 18, '#a49892');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTrapFire', 16, 16, 8, 8, 7, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const r = f === 0 ? 5 : f <= 4 ? 7 : Math.max(2, 9 - f);
    const sway = (f & 1) === 0 ? -1 : 1;
    // Roaring multi-tone orange/yellow flame jet tile
    buf.ellipse(8 + sway, 8, r, Math.max(2, r - 1), '#c82814');
    buf.ellipse(8, 8 + (f % 2 === 0 ? 0 : -1), Math.max(2, r - 1), Math.max(2, r - 2), '#ff6818');
    if (f <= 5) {
      buf.ellipse(8 - sway, 8, Math.max(1, r - 3), Math.max(1, r - 3), '#ffd83c');
      buf.rect(7, 7, 2, 2, '#fff8c0');
    }
    // Flickering flame tongues & hot spark pixels
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + f * 0.7;
      const sx = Math.round(8 + Math.cos(a) * r);
      const sy = Math.round(8 + Math.sin(a) * (r - 1));
      buf.set(sx, sy, i % 2 === 0 ? '#ff8424' : '#ffe868');
    }
    buf.flush(ctx, x, y);
  });

  // Flat charred soot scorch decal on Scrapyard cobblestones (`sprTrapScorchMark`, 80x80, orig 40,40, 1f)
  b.addSprite('sprTrapScorchMark', 80, 80, 40, 40, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    const cx = 40;
    const cy = 40;
    for (let py = 4; py < h - 4; py++) {
      for (let px = 4; px < w - 4; px++) {
        const dx = (px - cx) / 34;
        const dy = (py - cy) / 28;
        const ang = Math.atan2(dy, dx);
        const streak = 1 + Math.sin(ang * 7) * 0.14 + Math.cos(ang * 13) * 0.08;
        const d = Math.hypot(dx, dy) / streak;
        const n = hash2d(px, py, 709);
        if (d < 0.42) {
          buf.set(px, py, n > 200 ? '#1e171c' : '#100c10');
        } else if (d < 0.72) {
          if (n > 75) buf.set(px, py, n > 190 ? '#2b2226' : '#1a1418');
        } else if (d < 0.96) {
          if (n > 175) buf.set(px, py, '#261e22');
        }
      }
    }
    // Subtle glowing warm ash specks near blast heart
    buf.set(37, 39, '#5a2c1c');
    buf.set(44, 42, '#4c2618');
    buf.flush(ctx, x, y);
  });

  // 2. OASIS WATER MINE (`sprWaterMine` / `Hurt` / `Dead`, 24x48, orig 12,36, 1/3/12f)
  const drawWaterMine = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(12, 16, 9, 9, '#ffffff');
      buf.rect(11, 25, 2, 12, '#ffffff');
      buf.rect(7, 36, 10, 6, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      // Seabed anchor block always remains grounded at y=36..43
      buf.rect(7, 37, 10, 6, '#36424c');
      buf.rect(8, 37, 8, 2, '#5a6c78');
      buf.rect(11, 33, 2, 4, '#2a343c');
      if (f <= 4) {
        // Dramatic underwater fiery/aqua blast burst!
        const r = Math.min(11, 4 + f * 2);
        buf.ellipse(12, 16, r, r, f <= 1 ? '#ffffff' : f === 2 ? '#ffe868' : '#ff6824');
        buf.ellipse(12, 16, Math.max(2, r - 3), Math.max(2, r - 3), f <= 2 ? '#ffffff' : '#ffe868');
        buf.pixelRing(12, 16, Math.min(11, r + 1), '#88f4ec');
      } else if (f <= 8) {
        // Rising sea foam, bubbles & tumbling iron mine shrapnel
        const rise = (f - 4) * 3;
        buf.pixelRing(8, Math.max(3, 22 - rise), 2, '#d8f8f4');
        buf.pixelRing(16, Math.max(4, 25 - rise), 2, '#96eae2');
        buf.pixelRing(12, Math.max(2, 18 - rise), 3, '#c4f6f0');
        buf.rect(5 + (f - 5), 14 + (f - 5) * 2, 3, 2, '#3c4854');
        buf.rect(17 - (f - 5), 16 + (f - 5) * 2, 3, 2, '#4e5e6c');
      } else {
        // Snapped seabed chain link drifting calmly
        buf.set(12, 31, '#4c5c68');
        buf.set(13, 30, '#6a7e8c');
        buf.pixelRing(11, 24 - (f - 9) * 3, 1, '#d8f8f4');
      }
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    // Heavy iron seabed tether block at origin y=36
    buf.rect(6, 36, 12, 7, '#34404a');
    buf.rect(7, 36, 10, 2, '#5a6c7a');
    buf.rect(8, 41, 8, 2, '#222a32');
    // Iron mooring chain rising from anchor to mine
    for (let cy = 24; cy <= 35; cy += 3) {
      buf.rect(11, cy, 2, 2, '#4a5a66');
      buf.set(11, cy, '#7c909e');
    }
    // 8 protruding contact horns/spikes around spherical naval mine
    const spikes: Array<[number, number, number, number]> = [
      [12, 5, 12, 9], [12, 24, 12, 27], [2, 16, 6, 16], [18, 16, 22, 16],
      [4, 8, 8, 12], [20, 8, 16, 12], [4, 24, 8, 20], [20, 24, 16, 20],
    ];
    for (const [x0, y0, x1, y1] of spikes) {
      buf.line(x0, y0, x1, y1, '#2c3640', 2);
      buf.set(x0, y0, '#6c7e8e');
    }
    // Spherical dark-steel naval mine hull
    const hull = mode === 'hurt' ? '#e8f6ff' : '#3c4854';
    const hi = mode === 'hurt' ? '#ffffff' : '#6a7e8e';
    buf.ellipse(12, 16, 7, 7, '#222a32');
    buf.ellipse(12, 15, 7, 6, hull);
    buf.ellipse(10, 13, 3, 3, hi);
    buf.set(9, 12, '#9eb2c0');
    // Riveted equatorial metal seam & green algae patch
    buf.rect(6, 16, 12, 1, '#263038');
    buf.set(15, 19, '#2e8848');
    buf.set(16, 18, '#4cc468');
    // Blinking warning red sensor dome on top
    buf.rect(11, 9, 2, 2, '#e82834');
    buf.set(11, 9, '#ff9098');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprWaterMine', 24, 48, 12, 36, 1, (ctx, x, y, w, h, f) => drawWaterMine(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprWaterMineHurt', 24, 48, 12, 36, 3, (ctx, x, y, w, h, f) => drawWaterMine(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprWaterMineDead', 24, 48, 12, 36, 12, (ctx, x, y, w, h, f) => drawWaterMine(ctx, x, y, w, h, 'dead', f));

  // 3. OASIS WATER PLANTS (`sprWaterPlant` & `sprWaterPlant2` + `Hurt`/`Dead`, 24x24, orig 12,12, 10/3/3f)
  const drawWaterPlant = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    variant: 1 | 2,
    mode: 'idle' | 'hurt' | 'dead',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(12, 13, 8, 8, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(12, 19, 6, 2, '#1d563c');
      buf.rect(8, 16, 2, 3, '#2c7a48');
      buf.rect(13, 17, 2, 2, '#3a9c5c');
      if (f < 2) {
        buf.rect(6 + f, 10 - f * 2, 3, 2, variant === 2 ? '#ff6890' : '#58d078');
        buf.pixelRing(16, 12 - f * 3, 1, '#d8f8f2');
      }
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const sway = Math.round(Math.sin((f / 10) * Math.PI * 2) * 2);
    const sway2 = Math.round(Math.cos((f / 10) * Math.PI * 2) * 2);
    const baseCol = mode === 'hurt' ? '#c8ffe8' : variant === 1 ? '#247c44' : '#1e7864';
    const hiCol = mode === 'hurt' ? '#ffffff' : variant === 1 ? '#58d078' : '#44c8a2';
    const tipCol = variant === 1 ? '#9ef8b0' : '#ff6490';
    // Grounded seabed stone base
    buf.ellipse(12, 20, 6, 2, '#184c36');
    // 3 swaying aquatic kelp/anemone fronds
    buf.bezier(9, 20, 6 + sway, 12, 5 + sway2, 5, baseCol, 2);
    buf.bezier(12, 20, 12 + sway2, 11, 12 + sway, 3, hiCol, 2);
    buf.bezier(15, 20, 18 + sway, 13, 19 + sway2, 6, baseCol, 2);
    buf.ellipse(5 + sway2, 5, 2, 2, tipCol);
    buf.ellipse(12 + sway, 4, 2, 2, tipCol);
    buf.ellipse(19 + sway2, 6, 2, 2, tipCol);
    if (variant === 2) {
      buf.set(12 + sway, 3, '#ffc0d4');
      buf.set(5 + sway2, 4, '#ffc0d4');
    }
    buf.outline(INK);
    // Tiny rising bubble on alternating frames
    if (f % 3 === 0) {
      buf.set(16, 4 + ((10 - f) % 8), '#e2faf6');
    }
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprWaterPlant', 24, 24, 12, 12, 10, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 1, 'idle', f));
  b.addSprite('sprWaterPlantHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 1, 'hurt', f));
  b.addSprite('sprWaterPlantDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 1, 'dead', f));
  b.addSprite('sprWaterPlant2', 24, 24, 12, 12, 10, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 2, 'idle', f));
  b.addSprite('sprWaterPlant2Hurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 2, 'hurt', f));
  b.addSprite('sprWaterPlant2Dead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawWaterPlant(ctx, x, y, w, h, 2, 'dead', f));

  // 4. MANSION PROPS: GOLD BARREL (24x24) & CHANDELIER (16x32)
  const drawGoldBarrel = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(6, 4, 12, 16, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(12, 18, 8, 4, '#24141c');
      buf.poly([[5, 17], [9, 12], [16, 13], [19, 19], [10, 20]], '#a87212');
      buf.rect(8, 14, 6, 3, '#f5c838');
      if (f === 0) buf.set(12, 11, '#ff7820');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const body = mode === 'hurt' ? '#fff4b0' : '#e0a820';
    const hi = mode === 'hurt' ? '#ffffff' : '#fff498';
    const dark = '#8c5a0c';
    buf.rect(6, 4, 12, 16, body);
    buf.rect(7, 4, 4, 16, '#f5c838');
    buf.rect(8, 4, 2, 16, hi);
    buf.rect(16, 4, 2, 16, dark);
    // Oval gold lid rim
    buf.rect(7, 3, 10, 3, hi);
    buf.rect(8, 4, 8, 1, dark);
    // Crimson Mansion hazard band & "$" mark
    buf.rect(6, 9, 12, 6, '#c82438');
    buf.rect(6, 8, 12, 1, dark);
    buf.rect(6, 15, 12, 1, dark);
    buf.rect(11, 10, 2, 4, '#fff498');
    buf.set(10, 11, '#fff498');
    buf.set(13, 13, '#fff498');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprGoldBarrel', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawGoldBarrel(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprGoldBarrelHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawGoldBarrel(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprGoldBarrelDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawGoldBarrel(ctx, x, y, w, h, 'dead', f));

  const drawChandelier = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(7, 2, 2, 14, '#ffffff');
      buf.rect(2, 14, 12, 14, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      // Snapped chain & shattered golden chandelier wreckage on floor
      buf.rect(7, 2, 2, 5, '#b07e18');
      buf.rect(3, 23, 10, 5, '#c89220');
      buf.rect(5, 22, 6, 2, '#f5c838');
      buf.set(4, 26, '#c8f4ff');
      buf.set(11, 26, '#f8f4e8');
      if (f === 0) buf.set(8, 20, '#ffe878');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const gold = mode === 'hurt' ? '#fff4b0' : '#e8b628';
    const goldHi = '#fff498';
    const goldDark = '#986610';
    // Hanging brass chain
    for (let cy = 2; cy <= 14; cy += 3) {
      buf.rect(7, cy, 2, 2, goldDark);
      buf.set(7, cy, goldHi);
    }
    // Ornate central gold stem & sweeping double candle arms
    buf.rect(7, 14, 2, 12, gold);
    buf.rect(2, 21, 12, 2, gold);
    buf.rect(3, 22, 10, 1, goldDark);
    buf.rect(2, 18, 2, 4, gold);
    buf.rect(12, 18, 2, 4, gold);
    // Hanging crystal teardrop prisms underneath
    buf.set(4, 24, '#c4f4ff');
    buf.set(8, 27, '#ffffff');
    buf.set(11, 24, '#c4f4ff');
    // 3 white wax candles + animated flickering golden candle flames!
    const fl = (f & 1) === 0 ? 0 : -1;
    for (const [cx, cy] of [[3, 15], [8, 12], [13, 15]]) {
      buf.rect(cx! - 1, cy!, 2, 4, '#f4efe6');
      buf.rect(cx! - 1, cy! - 3 + fl, 2, 3, '#ff8c20');
      buf.set(cx!, cy! - 2 + fl, '#fff6a0');
      buf.set(cx! - 1, cy! - 1, '#ffffff');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprChandelier', 16, 32, 8, 16, 4, (ctx, x, y, w, h, f) => drawChandelier(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprChandelierHurt', 16, 32, 8, 16, 3, (ctx, x, y, w, h, f) => drawChandelier(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprChandelierDead', 16, 32, 8, 16, 3, (ctx, x, y, w, h, f) => drawChandelier(ctx, x, y, w, h, 'dead', f));

  // 5. FROZEN CITY SNOWMAN (32x32), JUNGLE COCOON (24x24, 8f) & JUNGLE BUSH (24x24)
  const drawSnowMan = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(16, 23, 8, 6, '#ffffff');
      buf.ellipse(16, 15, 6, 5, '#ffffff');
      buf.ellipse(16, 9, 5, 4, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(16, 24, 10, 4, '#c4d2de');
      buf.ellipse(15, 22, 7, 3, '#edf4fa');
      buf.rect(19, 23, 4, 2, '#ff7420'); // dropped carrot nose
      buf.rect(8, 22, 5, 2, '#d82838'); // crumpled red scarf
      buf.line(10, 20, 6, 17, '#6e482c');
      if (f < 2) {
        buf.set(12 - f * 2, 16 - f * 2, '#ffffff');
        buf.set(20 + f * 2, 15 - f * 2, '#dce8f4');
      }
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // Stick arms
    buf.line(9, 17, 4, 13, '#6e482c', 2);
    buf.line(23, 17, 28, 13, '#6e482c', 2);
    // 3 stacked frosty snowballs
    buf.ellipse(16, 23, 8, 6, '#9cb2c6');
    buf.ellipse(15, 22, 7, 5, '#dce8f2');
    buf.ellipse(14, 21, 4, 3, '#ffffff');
    buf.ellipse(16, 15, 6, 5, '#a8bdd0');
    buf.ellipse(15, 14, 5, 4, '#e6f0f8');
    buf.ellipse(14, 13, 3, 2, '#ffffff');
    buf.ellipse(16, 9, 4, 4, '#b8cadc');
    buf.ellipse(15, 8, 4, 3, '#eef6fc');
    buf.set(14, 7, '#ffffff');
    // Red winter scarf draped between head & torso
    buf.rect(11, 12, 10, 2, '#d82838');
    buf.rect(12, 12, 8, 1, '#ff5464');
    buf.rect(18, 14, 2, 4, '#b81e2c');
    // Coal eyes, smile buttons & bright orange carrot nose!
    buf.set(14, 8, '#1a1820');
    buf.set(18, 8, '#1a1820');
    buf.rect(16, 9, 4, 2, '#ff7420');
    buf.set(17, 9, '#ffac48');
    buf.set(16, 16, '#1a1820');
    buf.set(16, 19, '#1a1820');
    buf.set(16, 22, '#1a1820');
    // Jaunty dark winter hat
    buf.rect(11, 4, 10, 2, '#2a2c38');
    buf.rect(13, 1, 6, 4, '#3a3e4e');
    buf.rect(13, 3, 6, 1, '#d82838');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprSnowMan', 32, 32, 16, 16, 1, (ctx, x, y, w, h, f) => drawSnowMan(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprSnowManHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSnowMan(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprSnowManDead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawSnowMan(ctx, x, y, w, h, 'dead', f));

  const drawCocoon = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(12, 12, 7, 9, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(12, 17, 8, 4, '#3e6e24');
      buf.ellipse(12, 17, 5, 2, '#7ce048');
      buf.poly([[6, 16], [8, 10], [11, 14], [15, 10], [18, 16]], '#9cb868');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const swell = (f === 2 || f === 3 || f === 6) ? 1 : 0;
    // Anchoring silk strands
    buf.line(12, 2, 12, 5, '#d4d8b8');
    buf.line(4, 15, 7, 14, '#c4c8a8');
    buf.line(20, 15, 17, 14, '#c4c8a8');
    // Pulsing olive-green bug cocoon sac
    const outer = mode === 'hurt' ? '#eaffd8' : '#5a7a34';
    const mid = mode === 'hurt' ? '#ffffff' : '#8cb850';
    buf.ellipse(12, 12, 6 + swell, 8, outer);
    buf.ellipse(11, 11, 5 + swell, 7, mid);
    buf.ellipse(10, 9, 2, 4, '#c8ec88');
    // Silk cross-wrapping bands & wriggling internal maggot shadow
    buf.line(7, 9, 17, 11, '#b8cc88');
    buf.line(7, 14, 17, 16, '#a4b878');
    const wriggle = (f % 4) - 1;
    buf.ellipse(12 + Math.round(wriggle * 0.5), 12, 2, 3, '#3c5822');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprCocoon', 24, 24, 12, 12, 8, (ctx, x, y, w, h, f) => drawCocoon(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprCocoonHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawCocoon(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprCocoonDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawCocoon(ctx, x, y, w, h, 'dead', f));

  const drawJungleBush = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(12, 13, 9, 8, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      // Chopped woody bush stems & scattered cut Jungle leaves
      buf.line(10, 19, 8, 14, '#5a3e22', 2);
      buf.line(13, 19, 16, 15, '#5a3e22', 2);
      buf.ellipse(7, 18, 3, 2, '#347a20');
      buf.ellipse(17, 17, 3, 2, '#4ea02c');
      if (f < 2) buf.rect(11 + f, 10 - f * 2, 2, 2, '#68bc36');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const rustle = f === 1 ? -1 : f === 3 ? 1 : 0;
    const dark = '#205212';
    const mid = mode === 'hurt' ? '#c8ffba' : '#367c20';
    const light = mode === 'hurt' ? '#ffffff' : '#56ae2c';
    const hi = '#78cc40';
    // Dense layered leafy bush lobes (conceals Jungle Assassins!)
    buf.ellipse(12, 15, 9, 6, dark);
    buf.ellipse(7 + rustle, 12, 5, 5, mid);
    buf.ellipse(17 + rustle, 12, 5, 5, mid);
    buf.ellipse(12, 9, 6, 5, mid);
    buf.ellipse(9 + rustle, 10, 4, 3, light);
    buf.ellipse(15 + rustle, 10, 4, 3, light);
    buf.ellipse(12, 7, 4, 2, hi);
    // Tiny crimson Jungle berries tucked among leaves
    buf.set(8 + rustle, 13, '#e83448');
    buf.set(16 + rustle, 11, '#e83448');
    buf.set(12, 15, '#e83448');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprBushIdle', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawJungleBush(ctx, x, y, w, h, 'idle', f));
  b.addAlias('sprBush', 'sprBushIdle');
  b.addSprite('sprBushHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawJungleBush(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprBushDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawJungleBush(ctx, x, y, w, h, 'dead', f));

  // 6. SEWERS & SCRAPYARD: SEWER PIPE (24x24), TORCH (32x32, 5f), TIRES (24x24)
  const drawSewerPipe = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(4, 5, 16, 14, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(12, 18, 8, 4, '#3ea832');
      buf.ellipse(12, 18, 5, 2, '#7cf054');
      buf.rect(5, 11, 6, 7, '#46524a');
      buf.rect(14, 12, 5, 6, '#38443c');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const iron = mode === 'hurt' ? '#dcffe2' : '#4a564e';
    const ironHi = mode === 'hurt' ? '#ffffff' : '#6c7c72';
    // Curved mossy cast-iron sewer drain pipe
    buf.rect(4, 6, 12, 10, iron);
    buf.rect(5, 6, 10, 2, ironHi);
    buf.rect(13, 5, 6, 12, '#3c4840');
    buf.rect(15, 7, 4, 8, '#161c18'); // dark pipe bore
    // Mossy green crust & dripping toxic slime droplet!
    buf.rect(5, 5, 6, 2, '#488c34');
    buf.rect(15, 14, 3, 2, '#5ec840');
    const dripY = 16 + (f % 4) * 2;
    if (dripY < 22) {
      buf.rect(16, dripY, 2, 2, '#78f050');
      buf.set(16, dripY, '#c8ffa8');
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprSewerPipe', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawSewerPipe(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprSewerPipeHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawSewerPipe(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprSewerPipeDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawSewerPipe(ctx, x, y, w, h, 'dead', f));

  const drawTorch = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.rect(12, 13, 8, 15, '#ffffff');
      buf.ellipse(16, 11, 6, 7, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      // Toppled extinguished iron torch sconce & curling grey smoke
      buf.rect(8, 22, 16, 4, '#3c444e');
      buf.rect(10, 21, 12, 2, '#626e7c');
      buf.ellipse(22, 23, 3, 3, '#262a30');
      buf.set(22, 18 - f * 2, '#6a707c');
      buf.set(23, 15 - f * 2, '#868e9c');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    // Forged iron brazier stand & fire bowl
    buf.rect(11, 26, 10, 3, '#3c444e');
    buf.rect(14, 16, 4, 11, '#4c5662');
    buf.rect(15, 16, 1, 10, '#788694');
    buf.poly([[10, 14], [22, 14], [20, 19], [12, 19]], '#46505c');
    buf.rect(10, 14, 12, 2, '#7c8a98');
    // Flickering 5-frame dancing orange-gold pixel flame
    const sway = [0, -1, 1, -1, 1][f % 5]!;
    const lift = [0, 1, 2, 1, 0][f % 5]!;
    buf.poly([[11, 14], [10, 9], [16 + sway, 3 - lift], [22, 9], [21, 14]], '#d83018');
    buf.poly([[12, 14], [12, 10], [16 + sway, 6 - lift], [20, 10], [20, 14]], '#ff7c20');
    buf.poly([[14, 14], [14, 11], [16 + sway, 9], [18, 11], [18, 14]], '#ffe048');
    buf.rect(15, 12, 2, 2, '#fffbd0');
    buf.outline(INK);
    // Rising spark pixel
    buf.set(14 + ((f * 3) % 5), 2 + (f & 1), '#ffe868');
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprTorch', 32, 32, 16, 16, 5, (ctx, x, y, w, h, f) => drawTorch(ctx, x, y, w, h, 'idle', f));
  b.addAlias('sprWallTorch', 'sprTorch');
  b.addSprite('sprTorchHurt', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawTorch(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprTorchDead', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => drawTorch(ctx, x, y, w, h, 'dead', f));

  const drawTires = (ctx: DrawCtx, x: number, y: number, w: number, h: number, mode: 'idle' | 'hurt' | 'dead', f: number): void => {
    const buf = new PxCanvas(w, h);
    if (mode === 'hurt' && f === 0) {
      buf.ellipse(12, 14, 9, 7, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.rect(4, 15, 7, 4, '#2c2a30');
      buf.rect(13, 14, 7, 5, '#3c3a44');
      buf.rect(9, 18, 6, 3, '#201e24');
      if (f === 0) buf.set(12, 12, '#78727c');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const rub = mode === 'hurt' ? '#e8e8f0' : '#2c2a30';
    const hi = mode === 'hurt' ? '#ffffff' : '#4a4854';
    // Bottom tire + slightly offset upper stacked rubber tire
    buf.ellipse(12, 16, 9, 5, '#1e1c22');
    buf.ellipse(12, 15, 9, 5, rub);
    buf.ellipse(12, 14, 4, 2, '#141218');
    buf.ellipse(11, 10, 8, 5, rub);
    buf.ellipse(11, 9, 8, 4, hi);
    buf.ellipse(11, 9, 4, 2, '#141218');
    // Tread marks & Scrapyard mud specks
    buf.set(5, 10, '#62606e');
    buf.set(17, 10, '#62606e');
    buf.set(15, 16, '#7c5640');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprTires', 24, 24, 12, 12, 1, (ctx, x, y, w, h, f) => drawTires(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprTiresHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawTires(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprTiresDead', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawTires(ctx, x, y, w, h, 'dead', f));

  // 7. PALACE & VAULT GUARDIAN STATUES
  // `sprThroneStatue` (24x48, orig 12,26, 14f) / `Dead` (64x64, orig 32,34, 13f)
  // `sprVaultStatue` (24x48, orig 12,26, 10f) / `Hurt` (24x48, 3f) / `Dead` (64x64, orig 32,34, 13f)
  const drawGuardianStatue = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: 'throne' | 'vault',
    f: number,
    totalFrames: number,
    hurt: boolean,
  ): void => {
    const buf = new PxCanvas(w, h);
    if (hurt && f === 0) {
      buf.rect(4, 38, 16, 7, '#ffffff');
      buf.poly([[6, 39], [6, 12], [12, 3], [18, 12], [18, 39]], '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const isVault = kind === 'vault';
    const stone = hurt ? '#d8f4ff' : isVault ? '#465868' : '#6e3034';
    const stoneHi = hurt ? '#ffffff' : isVault ? '#70889c' : '#9a5052';
    const stoneDark = isVault ? '#2a3642' : '#441a1e';
    const rune = isVault ? '#48f0a4' : '#58f048';
    const runeHi = isVault ? '#d8fff0' : '#ccff9c';

    // Stepped stone pedestal base
    buf.rect(3, 40, 18, 5, stoneDark);
    buf.rect(4, 37, 16, 4, stone);
    buf.rect(5, 37, 14, 1, stoneHi);
    // Tall robed Guardian statue silhouette
    buf.poly([[5, 37], [6, 14], [12, 4], [18, 14], [19, 37]], stone);
    buf.poly([[6, 36], [7, 14], [12, 5], [12, 36]], stoneHi);
    buf.rect(15, 14, 3, 22, stoneDark);
    // Stoic hooded crest & crowned brow (Vault statue carries subtle gold crown band!)
    buf.rect(8, 10, 8, 5, stoneDark);
    if (isVault) {
      buf.rect(8, 7, 8, 2, '#d8b448');
      buf.set(11, 6, '#fff098');
      buf.set(12, 6, '#fff098');
    }
    // Folded stone arms across chest
    buf.rect(6, 20, 12, 4, stoneHi);
    buf.rect(6, 24, 12, 1, stoneDark);
    // Shimmering emerald/aqua rune wave ascending torso across idle frames!
    const waveY = 35 - Math.floor((f / totalFrames) * 24);
    buf.rect(11, 16, 2, 19, stoneDark);
    buf.rect(11, 17, 2, 17, rune);
    buf.rect(10, Math.max(12, waveY), 4, 2, runeHi);
    // Glowing stoic Guardian eyes
    const eyeGlow = f % 4 === 0 ? runeHi : rune;
    buf.set(10, 12, eyeGlow);
    buf.set(13, 12, eyeGlow);
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  const drawGuardianStatueDead = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: 'throne' | 'vault',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    const isVault = kind === 'vault';
    const stone = isVault ? '#465868' : '#6e3034';
    const stoneHi = isVault ? '#728aa0' : '#9a5052';
    const stoneDark = isVault ? '#283440' : '#441a1e';
    const energy = isVault ? '#48f0a4' : '#58f048';
    const cx = 32;
    const baseY = 44;

    // Grounded broken plinth remains at center
    buf.rect(cx - 10, baseY, 20, 6, stoneDark);
    buf.rect(cx - 9, baseY - 2, 18, 4, stone);
    buf.rect(cx - 8, baseY - 2, 16, 1, stoneHi);

    if (f <= 3) {
      // Cracking statue blazing with emerald/aqua energy before shattering!
      buf.poly([[cx - 7, baseY - 2], [cx - 6, 18], [cx, 10], [cx + 6, 18], [cx + 7, baseY - 2]], stone);
      buf.line(cx - 5, 22, cx + 5, 34, energy, 1 + Math.floor(f / 2));
      buf.line(cx + 4, 20, cx - 4, 36, '#ffffff', 1);
      buf.ellipse(cx, 28, 3 + f * 2, 3 + f * 2, energy);
      buf.ellipse(cx, 28, 1 + f, 1 + f, '#ffffff');
    } else if (f <= 8) {
      // Exploding stone fragments & radiant energy shockwave!
      const t = f - 3;
      const spread = t * 4.5;
      buf.pixelRing(cx, 30, Math.min(26, 6 + t * 4), energy);
      if (f <= 6) buf.pixelRing(cx, 30, Math.min(20, 3 + t * 3), '#ffffff');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const fx = Math.round(cx + Math.cos(a) * spread);
        const fy = Math.round(28 + Math.sin(a) * spread * 0.8 + t * 1.5);
        buf.rect(fx - 2, fy - 2, 5, 4, i % 2 === 0 ? stone : stoneHi);
        buf.set(fx - 1, fy - 1, stoneDark);
      }
    } else {
      // Settled stone rubble pile scattered around empty fractured pedestal
      const rubble: Array<[number, number, number, number]> = [
        [cx - 18, baseY + 1, 6, 4], [cx - 12, baseY + 4, 5, 3],
        [cx + 12, baseY + 2, 6, 4], [cx + 16, baseY - 1, 4, 3],
        [cx - 4, baseY - 3, 5, 3], [cx + 4, baseY + 5, 5, 3],
      ];
      for (const [rx, ry, rw, rh] of rubble) {
        buf.rect(rx, ry, rw, rh, stone);
        buf.rect(rx, ry, rw - 1, 1, stoneHi);
      }
      if (f <= 10) {
        buf.set(cx - 2, baseY - 5, energy);
        buf.set(cx + 3, baseY - 4, '#ffffff');
      }
    }
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };

  b.addSprite('sprThroneStatue', 24, 48, 12, 26, 14, (ctx, x, y, w, h, f) =>
    drawGuardianStatue(ctx, x, y, w, h, 'throne', f, 14, false),
  );
  b.addSprite('sprThroneStatueDead', 64, 64, 32, 34, 13, (ctx, x, y, w, h, f) =>
    drawGuardianStatueDead(ctx, x, y, w, h, 'throne', f),
  );
  b.addSprite('sprVaultStatue', 24, 48, 12, 26, 10, (ctx, x, y, w, h, f) =>
    drawGuardianStatue(ctx, x, y, w, h, 'vault', f, 10, false),
  );
  b.addSprite('sprVaultStatueHurt', 24, 48, 12, 26, 3, (ctx, x, y, w, h, f) =>
    drawGuardianStatue(ctx, x, y, w, h, 'vault', f, 3, true),
  );
  b.addSprite('sprVaultStatueDead', 64, 64, 32, 34, 13, (ctx, x, y, w, h, f) =>
    drawGuardianStatueDead(ctx, x, y, w, h, 'vault', f),
  );

  // 8. CHESTS, PICKUPS & PIZZA SEWERS PROPS
  // Bloated Rad Maggot Canister (`sprRadChestMaggot` 15f / `Hurt` 3f / `Dead` 4f, 24x24, orig 12,12)
  const drawRadMaggotChest = (
    ctx: DrawCtx,
    x: number,
    y: number,
    w: number,
    h: number,
    mode: 'idle' | 'hurt' | 'dead',
    f: number,
  ): void => {
    const buf = new PxCanvas(w, h);
    // Reserve f===1 on idle for renderer's 7+ frame Chest hurt-flash convention too!
    if ((mode === 'idle' && f === 1) || (mode === 'hurt' && f === 0)) {
      buf.ellipse(12, 13, 8, 9, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (mode === 'dead') {
      buf.ellipse(12, 17, 9, 4, '#2ca83c');
      buf.ellipse(12, 17, 6, 3, '#72ff68');
      buf.rect(6, 14, 12, 5, '#54606e');
      buf.rect(7, 13, 10, 1, '#8492a2');
      // Squished/wriggling tiny maggot bits around burst rim
      buf.rect(5 + (f & 1), 16, 3, 2, '#b4ff78');
      buf.rect(16 - (f & 1), 15, 3, 2, '#b4ff78');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    const pulse = (f % 6 < 3) ? 1 : 0;
    // Heavy bolted steel top & bottom canister caps
    buf.rect(6, 3, 12, 3, '#6c7888');
    buf.rect(7, 3, 10, 1, '#9aa8b8');
    buf.rect(9, 1, 6, 2, '#54606e');
    buf.rect(6, 18, 12, 3, '#54606e');
    // Swollen bulging neon-green radioactive canister belly
    buf.ellipse(12, 12, 7 + pulse, 7, '#2cc440');
    buf.ellipse(12, 11, 6 + pulse, 6, '#58f858');
    buf.ellipse(10, 10, 3, 4, '#c8ffb4');
    // Cracked glass containment frame & 3 animated crawling Rad Maggots!
    buf.line(8, 8, 16, 15, '#184e20');
    const mx1 = 6 + ((f * 2) % 10);
    const my1 = 9 + Math.round(Math.sin(f * 0.8) * 2);
    buf.rect(mx1, my1, 4, 2, '#a8ff68');
    buf.set(mx1, my1, '#ffffff');
    const mx2 = 16 - ((f * 2) % 9);
    const my2 = 14 + (f & 1);
    buf.rect(mx2, my2, 4, 2, '#96f858');
    buf.set(mx2 + 3, my2, '#ffffff');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprRadChestMaggot', 24, 24, 12, 12, 15, (ctx, x, y, w, h, f) => drawRadMaggotChest(ctx, x, y, w, h, 'idle', f));
  b.addSprite('sprRadChestMaggotHurt', 24, 24, 12, 12, 3, (ctx, x, y, w, h, f) => drawRadMaggotChest(ctx, x, y, w, h, 'hurt', f));
  b.addSprite('sprRadChestMaggotDead', 24, 24, 12, 12, 4, (ctx, x, y, w, h, f) => drawRadMaggotChest(ctx, x, y, w, h, 'dead', f));

  // Empty Vault Proto Chest (`sprProtoChestEmpty`, 24x24, orig 12,12, 1f)
  b.addSprite('sprProtoChestEmpty', 24, 24, 12, 12, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Open flipped metallic Vault chest lid
    buf.rect(4, 3, 16, 5, '#3c485a');
    buf.rect(5, 3, 14, 2, '#687a94');
    buf.rect(6, 4, 12, 1, '#2c8a56');
    // Hollow dark empty Proto Chest cavity
    buf.rect(3, 8, 18, 12, '#4a586e');
    buf.rect(5, 9, 14, 6, '#141a24');
    buf.rect(6, 10, 12, 3, '#1e2836');
    // Dimmed emerald trim & metallic corner brackets
    buf.rect(3, 18, 18, 2, '#2a3444');
    buf.rect(5, 15, 2, 5, '#2e3848');
    buf.rect(17, 15, 2, 5, '#2e3848');
    buf.rect(10, 15, 4, 3, '#38b870');
    buf.rect(11, 16, 2, 1, '#78ffa8');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Glowing Purple Cursed Ammo Pack (`sprCursedAmmo`, 10x10, orig 5,5, 7f)
  b.addSprite('sprCursedAmmo', 10, 10, 5, 5, 7, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    const bright = f === 0 || f === 3 || f === 6;
    buf.grid(1, 2, [
      '.pppppp.',
      'pPPPPPPp',
      'pPWWWWPp',
      'pPWdPWPp',
      'pddddmdp',
      '.dddddd.',
    ], {
      p: '#6c20a8',
      P: bright ? '#c458ff' : '#9c36e0',
      W: f === 6 ? '#ffffff' : '#ffa8ff',
      d: '#3e1064',
      m: '#ff64e0',
    });
    buf.outline(INK);
    // Flickering purple curse sparkle pixel orbiting pack
    const spX = [1, 8, 2, 7, 1, 8, 4][f % 7]!;
    const spY = [1, 1, 8, 8, 4, 5, 0][f % 7]!;
    buf.set(spX, spY, f % 2 === 0 ? '#ff88ff' : '#c048ff');
    buf.flush(ctx, x, y);
  });

  // Pizza Sewers Chests (`sprPizzaChest1` / `sprPizzaChest2` / `sprPizzaChestOpen`, 16x15, orig 8,7, 1f)
  b.addSprite('sprPizzaChest1', 16, 15, 8, 7, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    buf.rect(2, 3, 12, 9, '#d8b070');
    buf.rect(3, 3, 10, 2, '#f2d49c');
    buf.rect(2, 10, 12, 2, '#a47c42');
    // Classic red Italian checker border & pizza emblem on box lid
    for (let px = 3; px <= 11; px += 2) {
      buf.set(px, 4, '#d83028');
      buf.set(px + 1, 4, '#ffffff');
    }
    buf.rect(6, 6, 4, 3, '#d83028');
    buf.rect(7, 7, 2, 1, '#ffe048');
    buf.set(7, 8, '#48b848');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprPizzaChest2', 16, 15, 8, 7, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Double-stacked deluxe pizza chest
    buf.rect(2, 7, 12, 6, '#b88c50');
    buf.rect(2, 2, 12, 6, '#dfc082');
    buf.rect(3, 2, 10, 2, '#f5dcb0');
    buf.rect(2, 6, 12, 1, '#8c6632');
    // Bold yellow slice icon w/ pepperoni
    buf.poly([[8, 3], [11, 7], [5, 7]], '#ffe048');
    buf.set(8, 5, '#d83028');
    buf.set(9, 6, '#d83028');
    buf.rect(3, 9, 10, 2, '#d83028');
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprPizzaChestOpen', 16, 15, 8, 7, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Open flipped cardboard pizza box lid
    buf.rect(2, 1, 12, 5, '#c49c60');
    buf.rect(3, 2, 10, 3, '#e8ca94');
    buf.rect(6, 2, 4, 2, '#d83028');
    // Open lower grease-stained box interior w/ leftover crust crumbs
    buf.rect(2, 6, 12, 7, '#b0864a');
    buf.rect(3, 7, 10, 4, '#7c5c34');
    buf.ellipse(8, 9, 3, 2, '#967240'); // grease ring
    buf.set(6, 9, '#f0c448'); // crumb
    buf.set(10, 8, '#d83028'); // stray pepperoni bit
    buf.outline(INK);
    buf.flush(ctx, x, y);
  });

  // Pizza Sewers Floor/Wall Graffiti Decal (`sprPizzaSewerDecal`, 36x32, orig 18,16, 1f)
  b.addSprite('sprPizzaSewerDecal', 36, 32, 18, 16, 1, (ctx, x, y, w, h) => {
    const buf = new PxCanvas(w, h);
    // Neon-green sewer slime splatter backdrop
    buf.ellipse(18, 18, 14, 10, '#2d6824');
    buf.ellipse(17, 17, 11, 8, '#4cb838');
    buf.rect(10, 24, 3, 5, '#4cb838');
    buf.rect(22, 23, 2, 6, '#5ed844');
    // Bold graffiti pixel-art Pizza Slice!
    buf.poly([[18, 5], [29, 23], [7, 23]], '#d49a48'); // golden crust outer
    buf.poly([[18, 7], [27, 21], [9, 21]], '#f5c838'); // melted cheese
    buf.poly([[18, 8], [23, 18], [13, 18]], '#ffe868');
    // Crust rim along bottom of slice
    buf.rect(7, 21, 22, 3, '#c88838');
    buf.rect(8, 21, 20, 1, '#e8b460');
    // Juicy crimson pepperoni circles & green herb flecks
    buf.ellipse(18, 13, 2, 2, '#d82c28');
    buf.ellipse(14, 18, 2, 2, '#d82c28');
    buf.ellipse(22, 18, 2, 2, '#d82c28');
    buf.set(17, 17, '#42a834');
    buf.set(20, 15, '#42a834');
    buf.flush(ctx, x, y);
  });
}

// ============================================================================
// SECTION 3B: BIOME ROOF-EDGE DECALS (`sprTopDecal*`, 32x32, orig 16,16, 3f each)
// ============================================================================

function registerRoofTopDecals(b: FallbackAtlasBuilder): void {
  // Subtle roof-matched ceiling decals (no harsh INK outline so they blend cleanly into solid roof masses!)
  b.addSprite('sprTopDecalCave', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Faceted amethyst crystal outcrop & amber ember glow
      buf.poly([[10, 22], [14, 8], [19, 10], [22, 22]], '#5e3892');
      buf.poly([[11, 21], [14, 9], [16, 12], [15, 21]], '#9c74d4');
      buf.poly([[18, 22], [23, 12], [26, 21]], '#4a2878');
      buf.rect(14, 16, 3, 3, '#ff8c28');
      buf.set(15, 16, '#ffe066');
    } else if (f === 1) {
      // Jagged cave ceiling rock fissure & hanging stalactite rim
      buf.line(6, 12, 16, 17, '#42246a', 2);
      buf.line(16, 17, 25, 14, '#42246a', 2);
      buf.line(7, 11, 16, 15, '#8f66c4');
      buf.rect(20, 18, 2, 2, '#ff8c28');
      buf.set(20, 18, '#ffe066');
    } else {
      // Clustered amethyst mineral pebbles
      buf.ellipse(12, 15, 5, 3, '#5e3892');
      buf.ellipse(11, 14, 3, 2, '#966ecc');
      buf.ellipse(21, 18, 4, 3, '#4e2c7c');
      buf.set(20, 17, '#ff9838');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalInvCave', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Cursed magenta crystal spire vent
      buf.poly([[9, 23], [15, 6], [21, 23]], '#482274');
      buf.poly([[11, 22], [15, 8], [16, 22]], '#8a58c4');
      buf.rect(14, 15, 3, 4, '#f054cc');
      buf.set(15, 15, '#ffa8f2');
    } else if (f === 1) {
      // Glowing magenta curse fracture lines
      buf.line(6, 16, 15, 13, '#3a1a5e', 2);
      buf.line(15, 13, 26, 19, '#3a1a5e', 2);
      buf.line(10, 15, 22, 16, '#f054cc');
      buf.set(15, 14, '#ffa8f2');
    } else {
      buf.ellipse(16, 16, 7, 5, '#462070');
      buf.ellipse(16, 16, 4, 3, '#b838c8');
      buf.set(15, 15, '#ffa8f2');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalCity', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Snow-dusted rooftop HVAC exhaust vent
      buf.rect(8, 10, 16, 12, '#6c767e');
      buf.rect(9, 11, 14, 10, '#858e96');
      for (let vy = 13; vy <= 19; vy += 2) buf.rect(10, vy, 12, 1, '#525c64');
      buf.rect(8, 9, 14, 3, '#dce6ee'); // snow drift on top rim
    } else if (f === 1) {
      // Wind-sculpted snowbank & icy blue fracture
      buf.ellipse(16, 17, 10, 5, '#b8c4cc');
      buf.ellipse(15, 15, 8, 4, '#e2ecf4');
      buf.line(9, 22, 22, 20, '#7da8c4');
    } else {
      // Rusty broken rooftop pipe/antenna stub in snow
      buf.ellipse(16, 18, 6, 4, '#dce6ee');
      buf.rect(14, 10, 4, 9, '#5e6872');
      buf.rect(15, 10, 1, 8, '#96a2ac');
      buf.rect(12, 12, 8, 1, '#7c523c');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalJungle', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Radiating lush tropical palm fronds
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.2;
        buf.line(16, 16, Math.round(16 + Math.cos(a) * 11), Math.round(16 + Math.sin(a) * 9), '#286416', 3);
        buf.line(16, 16, Math.round(16 + Math.cos(a) * 10), Math.round(16 + Math.sin(a) * 8), '#5eb228', 1);
      }
      buf.ellipse(16, 16, 3, 3, '#72c836');
    } else if (f === 1) {
      // Bright crimson Jungle canopy blossom cluster
      buf.ellipse(16, 16, 8, 6, '#286416');
      buf.ellipse(15, 15, 6, 4, '#438428');
      for (const [fx, fy] of [[12, 14], [19, 13], [16, 18]]) {
        buf.rect(fx! - 1, fy! - 1, 3, 3, '#e43c4c');
        buf.set(fx!, fy!, '#ffe048');
      }
    } else {
      // Tangled canopy vines & mossy leaf mound
      buf.bezier(6, 11, 16, 22, 26, 12, '#245812', 2);
      buf.bezier(8, 22, 16, 10, 24, 21, '#58ac28', 1);
      buf.ellipse(16, 16, 4, 3, '#6cc234');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalPizzaSewers', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Mossy pizza-sewer roof grate & grease stain
      buf.rect(9, 10, 14, 12, '#232c20');
      for (let gx = 11; gx <= 20; gx += 3) buf.rect(gx, 11, 1, 10, '#4a5a44');
      buf.rect(18, 18, 4, 3, '#d87e34');
    } else if (f === 1) {
      // Weathered pipe junction & neon slime drip
      buf.rect(6, 14, 20, 5, '#424e3e');
      buf.rect(6, 14, 20, 1, '#5e6e58');
      buf.rect(14, 13, 4, 7, '#2d382a');
      buf.rect(15, 20, 2, 4, '#5cb844');
    } else {
      // Mini discarded cardboard pizza box flap on roof
      buf.rect(10, 11, 12, 10, '#8c6e44');
      buf.rect(11, 12, 10, 8, '#b8945c');
      buf.rect(14, 14, 4, 3, '#c83a2c');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalScrapyard', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Twisted rusted steel I-beam girder
      buf.line(6, 22, 25, 10, '#5a3422', 4);
      buf.line(7, 21, 24, 10, '#a25c3a', 2);
      buf.line(8, 20, 23, 10, '#c87c54', 1);
    } else if (f === 1) {
      // Corrugated scrap metal sheet w/ rivets
      buf.rect(7, 9, 18, 14, '#626870');
      for (let ry = 11; ry <= 21; ry += 3) {
        buf.rect(8, ry, 16, 1, '#8c949e');
        buf.rect(8, ry + 1, 16, 1, '#4a5058');
      }
      buf.rect(18, 15, 5, 5, '#965032'); // rust blotch
    } else {
      // Bolted concrete roof grate & rebar
      buf.rect(9, 11, 14, 10, '#4c525a');
      buf.rect(11, 13, 10, 6, '#32363e');
      buf.line(12, 12, 22, 22, '#a25c3a');
    }
    buf.flush(ctx, x, y);
  });

  b.addSprite('sprTopDecalSewers', 32, 32, 16, 16, 3, (ctx, x, y, w, h, f) => {
    const buf = new PxCanvas(w, h);
    if (f === 0) {
      // Damp iron sewer ceiling grate with glowing green slime seepage
      buf.rect(9, 10, 14, 12, '#1c2419');
      buf.rect(10, 11, 12, 10, '#2c3828');
      for (let gx = 12; gx <= 19; gx += 3) buf.rect(gx, 11, 1, 10, '#141a12');
      buf.rect(12, 19, 5, 3, '#5ec440');
      buf.set(14, 20, '#8cf064');
    } else if (f === 1) {
      // Mossy fractured sewer roof crack & slime puddle
      buf.line(7, 15, 16, 13, '#1e261b', 2);
      buf.line(16, 13, 25, 18, '#1e261b', 2);
      buf.ellipse(16, 15, 5, 3, '#3c682c');
      buf.set(15, 14, '#5ec440');
    } else {
      // Thick mossy ceiling pipe elbow
      buf.rect(8, 13, 16, 6, '#2b3628');
      buf.rect(8, 13, 16, 2, '#485a42');
      buf.rect(13, 12, 6, 8, '#364432');
      buf.rect(14, 18, 3, 3, '#5ec440');
    }
    buf.flush(ctx, x, y);
  });
}
