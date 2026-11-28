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
    // Warm dusty taupe cobblestones (#776b64) + cool battleship slate-gray rock walls (#828890)
    floorBase: '#776b64', floorHi: '#837770', floorMid: '#6b6059', floorDark: '#615650', floorCrack: '#4e443f',
    accent: '#9c5838', accent2: '#68e830',
    wallTop: '#828890', wallTopHi: '#949aa2', wallTopDark: '#6d737b',
    wallBot: '#646a72', wallBotHi: '#787f87', wallBotDark: '#4e535a', wallOut: '#393d42',
  },
  {
    code: 4, pattern: 'caves',
    // Muted plum-violet cave stone (#3c2f4d) + royal purple walls (#44315e) + glowing amber embers
    floorBase: '#3c2f4d', floorHi: '#46365a', floorMid: '#352944', floorDark: '#2c213a', floorCrack: '#20172c',
    accent: '#ff8c28', accent2: '#ffd45c',
    wallTop: '#44315e', wallTopHi: '#543e73', wallTopDark: '#36264c',
    wallBot: '#312247', wallBotHi: '#402d5c', wallBotDark: '#251838', wallOut: '#1a1028',
  },
  {
    code: 5, pattern: 'frozen',
    // Calm cool light-gray snow (#b9b9b9) + diagonal sky-blue ice (#789eb7/#9ac0d8) + silver snow roof (#9da4a6)
    floorBase: '#b9b9b9', floorHi: '#c6cacd', floorMid: '#aeb2b6', floorDark: '#9da3a9', floorCrack: '#7a838c',
    accent: '#789eb7', accent2: '#9ac0d8',
    wallTop: '#9da4a6', wallTopHi: '#b0b7b9', wallTopDark: '#899194',
    wallBot: '#78828a', wallBotHi: '#939ea6', wallBotDark: '#5d6872', wallOut: '#49525c',
  },
  {
    code: 6, pattern: 'labs',
    // Clean dark charcoal-slate metal floor (#1d2328) + deep dark lab teal roof (#0d1919) + lime pipe strip (#5ce040)
    floorBase: '#1d2328', floorHi: '#242b31', floorMid: '#1a2025', floorDark: '#151a1e', floorCrack: '#0f1317',
    accent: '#5ce040', accent2: '#42d4e8',
    wallTop: '#0d1919', wallTopHi: '#142829', wallTopDark: '#091212',
    wallBot: '#15282c', wallBotHi: '#1f3a40', wallBotDark: '#101e22', wallOut: '#081113',
  },
  {
    code: 7, pattern: 'palace',
    // Charcoal/navy 16x16 diagonal diamond floor (#26262c/#1a1c22) + dusty crimson-terracotta walls (#64282c)
    floorBase: '#26262c', floorHi: '#2d2e36', floorMid: '#1a1c22', floorDark: '#15171c', floorCrack: '#0f1015',
    accent: '#58f048', accent2: '#d8b85c',
    wallTop: '#64282c', wallTopHi: '#74383b', wallTopDark: '#501e22',
    wallBot: '#5c2528', wallBotHi: '#703a3b', wallBotDark: '#42181c', wallOut: '#2e1014',
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
    // Bright pale mint-seafoam shallow water (#9dc1b9) + bright turquoise roof (#58afa9) + dark kelp cliff (#1f6454)
    floorBase: '#9dc1b9', floorHi: '#aed1c9', floorMid: '#8cb2aa', floorDark: '#7aa29a', floorCrack: '#4c7c74',
    accent: '#349c46', accent2: '#e8526a',
    wallTop: '#58afa9', wallTopHi: '#68bfb9', wallTopDark: '#479c96',
    wallBot: '#1f6454', wallBotHi: '#2c7e66', wallBotDark: '#15483d', wallOut: '#103830',
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
    floorBase: '#302048', floorHi: '#3b2857', floorMid: '#28193d', floorDark: '#201332', floorCrack: '#150b24',
    accent: '#f054cc', accent2: '#ffa0f0',
    wallTop: '#3c265a', wallTopHi: '#4d3272', wallTopDark: '#2e1c47',
    wallBot: '#2a1842', wallBotHi: '#3a2259', wallBotDark: '#1d0f30', wallOut: '#140922',
  },
  {
    code: 105, pattern: 'jungle',
    // Warm earthy olive-brown dirt (#5e542a) + bright lush leaf-green canopy (#438428)
    floorBase: '#5e542a', floorHi: '#6a5f31', floorMid: '#534a24', floorDark: '#473f1e', floorCrack: '#342e15',
    accent: '#4e9630', accent2: '#e03c4c',
    wallTop: '#438428', wallTopHi: '#529834', wallTopDark: '#346c1e',
    wallBot: '#2b5c18', wallBotHi: '#397822', wallBotDark: '#1e4210', wallOut: '#16300c',
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
    // ICONIC DIAGONAL SKY-BLUE STRIPED FROZEN ICE TILES matching 13_frozen_5_3.png!!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const diag = (px + py) & 15;
        let col = '#789eb7';
        if (diag === 1) col = '#b2d2e6';
        else if (diag >= 0 && diag <= 3) col = '#9ac0d8';
        else if (diag === 15) col = '#6a90aa';
        buf.set(px, py, col);
      }
    }
    if (frame === 1) {
      // Crisp light-gray snow patch creeping onto one ice edge
      buf.ellipse(6, 5, 6, 4, '#b9b9b9');
      buf.ellipse(10, 4, 4, 3, '#c4c8cb');
      buf.line(18, 20, 23, 22, '#648aa4');
      buf.line(23, 22, 26, 20, '#b2d2e6');
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
    // BRIGHT pale mint-seafoam shallow water (#9dc1b9) matching 05_oasis.png!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Very subtle wide diagonal water shimmer
        const band = (px + py) & 31;
        if (band >= 0 && band <= 4 && hash2d(px, py, seed + 3) > 195) {
          buf.set(px, py, t.floorHi);
        }
      }
    }
    // Sparse soft 2-3px horizontal ripples
    buf.rect(6 + frame * 3, 9, 3, 1, t.floorMid);
    buf.rect(19 - frame * 2, 22, 3, 1, t.floorMid);
    if (isAltB) {
      if (frame === 0) {
        // Dark emerald underwater kelp/moss patch matching 05_oasis.png
        buf.ellipse(16, 16, 9, 7, '#2d7a50');
        buf.ellipse(15, 15, 6, 5, '#3a905c');
        for (let py = 10; py <= 22; py++) {
          for (let px = 8; px <= 24; px++) {
            if (buf.get(px, py) === '#3a905c' && hash2d(px, py, seed) > 180) {
              buf.set(px, py, '#246642');
            }
          }
        }
      } else {
        // Tiny water bubbles & sea pebble
        buf.pixelRing(12, 14, 2, '#d8f0ea');
        buf.set(11, 13, '#ffffff');
        buf.pixelRing(22, 20, 1, '#d8f0ea');
        buf.rect(18, 11, 2, 1, '#7a9e96');
      }
    } else if (frame === 2) {
      buf.pixelRing(15, 16, 1, '#d2ece6');
    } else if (frame === 3) {
      buf.rect(11, 20, 2, 1, '#7da49c');
      buf.set(12, 19, '#d2ece6');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'scrapyard') {
    // Warm dusty taupe-gray rounded cobblestone/rubble floor (#776b64 / #645952) matching 06_scrapyard_3_3.png!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 8, 107, 4, 0.58);
        let col = t.floorBase;
        if (v.edge < 0.115) {
          col = '#635852';
        } else if (v.edge < 0.19 && v.dy < -0.18) {
          col = '#82766f';
        } else if ((v.cellId & 7) === 0) {
          col = '#6f645d';
        } else if ((v.cellId & 7) === 1 && hash2d(px, py, seed) > 200) {
          col = '#80746d';
        }
        buf.set(px, py, col);
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Iconic Scrapyard rectangular rusty floor drain grate matching 06_scrapyard_3_3 / 07_bigdog_3_3!
        buf.rect(6, 10, 20, 12, '#423534');
        buf.rect(7, 11, 18, 10, '#6c5a58');
        for (let gx = 8; gx <= 22; gx += 2) {
          buf.rect(gx, 12, 1, 8, '#2d2324');
        }
        buf.rect(7, 11, 18, 1, '#8a7470');
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
      buf.set(20, 10, '#9a5838');
      buf.set(21, 10, '#6e3c24');
    } else if (frame === 3) {
      // Tiny white scrap pebble ring
      buf.rect(13, 14, 3, 2, '#b8b0aa');
      buf.set(14, 14, '#776b64');
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // Calm muted plum-violet bumpy cave stone (#3c2f4d) — ZERO noisy black polka dots!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const v = voronoi2d(px, py, 10.667, t.code * 13 + 5, 3, 0.65);
        if (v.edge < 0.08) {
          buf.set(px, py, t.floorMid);
        } else if (v.dy < -0.25 && v.d1 < 0.42 && hash2d(px, py, seed) > 150) {
          buf.set(px, py, t.floorHi);
        }
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // CRISP WHITE PIXEL COBWEB matching 08_caves_4_1.png & 09_caves_lights.png!
        const webCol = '#9692a8';
        const webHi = '#c8c4d8';
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
    // Calm cool light-gray snow (#b9b9b9) — NOT blinding white, ZERO grid lines!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 11);
        if (hsh > 248) buf.set(px, py, t.floorMid);
        else if (hsh < 6) buf.set(px, py, t.floorHi);
      }
    }
    if (frame === 1) {
      buf.line(9, 13, 14, 13, t.floorMid);
      buf.line(10, 12, 13, 12, t.floorHi);
    } else if (frame === 2) {
      buf.rect(19, 20, 3, 1, t.floorDark);
      buf.rect(20, 19, 2, 1, t.floorHi);
    } else if (frame === 3) {
      buf.rect(11, 22, 2, 2, t.floorMid);
      buf.set(11, 22, t.floorHi);
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'jungle') {
    // Warm earthy olive-brown dirt (#5e542a) matching 12_jungle.png!
    buf.rect(0, 0, w, h, t.floorBase);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 19);
        if (hsh > 224) buf.set(px, py, t.floorHi);
        else if (hsh < 28) buf.set(px, py, t.floorMid);
        else if (hsh < 6) buf.set(px, py, t.floorDark);
      }
    }
    // Sparse tiny grass blade flecks
    if (frame === 1 || frame === 3) {
      buf.set(10, 13, '#448228');
      buf.set(11, 12, '#5aa236');
      buf.set(12, 13, '#448228');
    }
    if (frame === 2) {
      buf.line(18, 20, 21, 21, '#3d3018');
      buf.set(20, 19, '#448228');
    }
    if (isAltB) {
      if (frame === 0) {
        // Lush grass tuft cluster + twig
        buf.rect(12, 14, 5, 3, '#387020');
        buf.set(12, 13, '#529834');
        buf.set(14, 12, '#5ea83c');
        buf.set(16, 13, '#529834');
        buf.line(20, 21, 24, 22, '#3d2e16');
      } else {
        // Tiny red jungle flower on dirt
        buf.rect(14, 15, 3, 2, '#3c7a22');
        buf.set(15, 14, '#e03848');
        buf.set(14, 15, '#e03848');
        buf.set(16, 15, '#e03848');
        buf.set(15, 15, '#ffe048');
      }
    }
    buf.flush(ctx, x, y);
    return;
  }

  if (t.pattern === 'labs') {
    // Clean dark charcoal-slate lab metal floor (#1d2328) matching 14_labs_6_1.png!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const q = ((px >> 4) + (py >> 4)) & 1;
        const seam = (px & 15) === 0 || (py & 15) === 0;
        buf.set(px, py, seam ? t.floorDark : q === 0 ? t.floorBase : '#21282e');
      }
    }
    if (isAltB) {
      if (frame === 0) {
        // Subtle recessed metal floor vent
        buf.rect(8, 10, 16, 12, '#12161a');
        for (let gy = 11; gy <= 20; gy += 2) {
          buf.rect(9, gy, 14, 1, '#262f37');
        }
      } else {
        // Tiny glowing green bio-drop on clean dark tile
        buf.rect(14, 15, 3, 2, '#2a6e30');
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
    // Calm solid warm sandstone-taupe roof (#9b8568) seamlessly melting into outer roof mass (ZERO horizontal tiling bars!)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 244) buf.set(px, py, t.wallTopHi);
        else if (hsh < 12) buf.set(px, py, t.wallTopDark);
      }
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
    // Cool battleship slate-gray (#828890) seamlessly tiling with subtle rubble pebbles & tiny rust flecks!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 234) buf.set(px, py, t.wallTopHi);
        else if (hsh < 24) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 2 || frame === 3) {
      const rx = (frame * 5 + 2) % 12;
      const ry = 4 + ((frame * 3) % 8);
      buf.rect(rx, ry, 2, 1, '#9c5a3a');
      buf.set(rx, ry + 1, '#683822');
    }
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // Solid muted royal purple (#44315e) with bumpy cave-rock facets & tiny glowing orange/magenta ember!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px >> 1, py >> 1, seed + 3);
        const sub = (px & 1) + (py & 1);
        if (hsh > 195 && sub === 0) buf.set(px, py, t.wallTopHi);
        else if (hsh < 55 && sub === 2) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 2 || frame === 3) {
      const ex = frame === 2 ? 5 : 10;
      const ey = frame === 2 ? 7 : 10;
      buf.rect(ex, ey, 2, 2, t.accent);
      buf.set(ex, ey, t.accent2);
    }
  } else if (t.pattern === 'frozen') {
    // Solid cool silver-gray snow roof (#9da4a6) seamlessly tiling with minimal soft drift hints (ZERO horizontal stripes!)
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed);
        if (hsh > 246) buf.set(px, py, t.wallTopHi);
        else if (hsh < 10) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 2) {
      buf.line(4, 7, 8, 8, t.wallTopDark);
      buf.set(6, 7, t.wallTopHi);
    }
  } else if (t.pattern === 'jungle') {
    // Vibrant lush leaf-green canopy (#438428) with crisp pixel leaf clusters (#529834 / #346c1e) matching 12_jungle.png!
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const hsh = hash2d(px, py, seed + 17);
        const clump = ((px + (py >> 1) * 3) & 3);
        if (clump === 0 && hsh > 110) buf.set(px, py, t.wallTopHi);
        else if (clump === 2 && hsh < 130) buf.set(px, py, t.wallTopDark);
      }
    }
    if (frame === 3) {
      // Tiny sunlit leaf highlight cluster
      buf.rect(5, 5, 2, 2, '#62ad3e');
      buf.rect(10, 10, 2, 2, '#62ad3e');
    }
  } else if (t.pattern === 'labs') {
    // Deep dark lab teal (#0d1919) with crisp subtle 1px #142829 panel seam matching 14_labs_6_1.png!
    for (let px = 0; px < w; px++) buf.set(px, 0, t.wallTopHi);
    for (let py = 0; py < h; py++) buf.set(0, py, t.wallTopHi);
    if (frame === 2 || frame === 3) {
      // Dark recessed ceiling panel / tiny lab telemetry wires
      buf.rect(3, 3, 10, 9, '#102022');
      buf.rect(4, 5, 8, 1, '#183033');
      buf.rect(4, 8, 8, 1, '#183033');
      if (frame === 3) {
        buf.set(11, 5, '#d83838');
        buf.set(11, 8, '#42d4e8');
      }
    }
  } else if (t.pattern === 'palace') {
    // Solid dusty crimson-terracotta (#64282c) with whisper-subtle weathered brick seams (ZERO blue bricks!)
    for (let py = 0; py < h; py++) {
      const isMortarRow = py === 7 || py === 15;
      const ox = py >= 8 ? 4 : 0;
      for (let px = 0; px < w; px++) {
        const isJoint = ((px + ox) & 7) === 0;
        if (isMortarRow || isJoint) {
          if (hash2d(px, py, seed) > 105) buf.set(px, py, '#562024');
        } else if (py === 0 || py === 8) {
          if (hash2d(px, py, seed + 5) > 175) buf.set(px, py, '#6e3034');
        }
      }
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
    // Stratified dusty sandstone-tan cliff face (#847058, #6d5b47, #584838) with organic strata & bottom crevice!
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, t.wallBot);
    buf.rect(0, 13, w, 2, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Vertical eroded sandstone rock striations in visible band y=8..14
    for (let px = 0; px < w; px++) {
      const hsh = hash2d(px, frame, seed);
      if (hsh > 190) {
        buf.rect(px, 8, 1, 5, t.wallBotDark);
      } else if (hsh < 64) {
        buf.rect(px, 8, 1, 3, t.wallTop);
      }
      if (hsh % 5 === 0) {
        buf.set(px, 11 + (hsh & 1), t.wallBotHi);
      }
    }
  } else if (t.pattern === 'oasis') {
    // Rich dark kelp/seaweed cliff edge (#1f6454, #15483d) hanging cleanly over the bright water!
    buf.rect(0, 0, w, 8, t.wallTopDark);
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Serrated hanging kelp fronds dipping down over the cliff face
    for (let px = 0; px < w; px++) {
      const drop = 2 + (hash2d(px, frame, seed) % 5);
      const frondCol = (px + frame) % 3 === 0 ? '#369c46' : '#26784c';
      buf.rect(px, 8, 1, Math.min(6, drop), frondCol);
      if (drop >= 5) buf.set(px, 8 + drop, '#144438');
    }
  } else if (t.pattern === 'sewers' || t.pattern === 'pizza') {
    // Mossy damp sewer bricks (#263022, #1d261a) with vibrant green slime drips!
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 11, w, 1, t.wallOut); // horizontal mortar course
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let bx = 0; bx < w; bx += 8) {
      buf.rect(bx, 8, 1, 3, t.wallOut);
      buf.rect((bx + 4) & 15, 12, 1, 3, t.wallOut);
      buf.rect(bx + 1, 8, 6, 1, t.wallBotHi);
    }
    // Dripping green sewer slime on variants 1..3
    if (frame >= 1) {
      const sx = (frame * 5 + 2) % 12;
      buf.rect(sx, 8, 2, 4 + (frame & 1), t.accent);
      buf.set(sx, 8, t.accent2);
      buf.set(sx + 1, 13, '#3b7a2a');
    }
  } else if (t.pattern === 'scrapyard') {
    // Craggy cool slate-gray concrete rubble cliff face (#646a72, #4e535a) matching 06_scrapyard_3_3.png!
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, t.wallBot);
    buf.rect(0, 13, w, 2, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Chunky staggered concrete/rubble stones in visible band y=8..14
    const blocks: Array<[number, number, number, number]> = [
      [0, 8, 5, 3], [6, 8, 6, 4], [13, 8, 3, 3],
      [2, 11, 5, 3], [9, 12, 6, 3],
    ];
    for (const [bx, by, bw, bh] of blocks) {
      const ox = (bx + frame * 3) & 15;
      buf.rect(ox, by, Math.min(bw, w - ox), bh, t.wallBotHi);
      buf.rect(ox, by + bh - 1, Math.min(bw, w - ox), 1, t.wallBotDark);
      buf.set(ox, by, t.wallTopHi);
    }
    if (frame === 1 || frame === 3) {
      buf.rect(4 + frame * 2, 10, 2, 1, '#9a5436'); // subtle rust chip
    }
  } else if (t.pattern === 'caves' || t.pattern === 'cursed') {
    // Deep amethyst vertical rock cliff (#312247, #251838) dotted with TINY GLOWING ORANGE EMBERS (#ff8c28)!
    buf.rect(0, 0, w, 8, t.wallTopDark);
    buf.rect(0, 8, w, 4, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Vertical crystalline rock ribs
    for (let px = 0; px < w; px += 4) {
      buf.rect(px, 8, 1, 7, t.wallBotDark);
      buf.rect(px + 1, 8, 1, 4, t.wallBotHi);
    }
    // Iconic tiny glowing orange/amber embers on cliff face matching 08_caves_4_1.png!
    if (frame === 1 || frame === 3) {
      const ex = frame === 1 ? 4 : 11;
      buf.rect(ex, 10, 2, 2, t.accent);
      buf.set(ex, 10, t.accent2);
    }
    if (frame === 2) {
      buf.set(8, 12, t.accent);
      buf.set(8, 11, t.accent2);
    }
  } else if (t.pattern === 'frozen') {
    // Fractured icy-slate cliff face (#78828a, #5d6872) with crisp snow cornice & icicles!
    buf.rect(0, 0, w, 9, '#b8c0c6');
    buf.rect(0, 9, w, 3, t.wallBot);
    buf.rect(0, 12, w, 3, t.wallBotDark);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Crisp white snow overhang + vertical ice fractures matching 10_frozen_5_1 / 13_frozen_5_3
    for (let px = 0; px < w; px++) {
      const icicle = (px * 5 + frame * 3) % 4;
      buf.rect(px, 8, 1, icicle === 0 ? 3 : icicle === 1 ? 2 : 1, icicle === 0 ? '#dce4e8' : '#b8c4cc');
      if ((px & 3) === 2) buf.rect(px, 10, 1, 5, t.wallOut);
    }
  } else if (t.pattern === 'jungle') {
    // Serrated dark-green foliage overhang (#2b5c18, #1e4210) over earthy roots!
    buf.rect(0, 0, w, 9, t.wallBotHi);
    buf.rect(0, 9, w, 4, '#3d301a');
    buf.rect(0, 13, w, 2, '#2a2010');
    buf.rect(0, 15, w, 1, '#1a140a');
    for (let px = 0; px < w; px++) {
      const leafDrop = 2 + (hash2d(px, frame, seed + 7) % 4);
      buf.rect(px, 8, 1, leafDrop, (px + frame) % 2 === 0 ? t.wallBot : t.wallBotDark);
      if (leafDrop >= 4) buf.set(px, 8, t.wallBotHi);
    }
  } else if (t.pattern === 'labs') {
    // Iconic dark lab bulkhead (#15282c, #101e22) + BRIGHT GLOWING LIME-GREEN HORIZONTAL PIPE STRIP (#5ce040) matching 14_labs_6_1.png!!
    buf.rect(0, 0, w, 8, t.wallTop);
    buf.rect(0, 8, w, 7, t.wallBot);
    buf.rect(0, 15, w, 1, t.wallOut);
    // Vertical panel seam
    buf.rect(0, 8, 1, 7, t.wallBotDark);
    buf.rect(1, 8, 1, 7, t.wallBotHi);
    // BRIGHT GLOWING LIME-GREEN HORIZONTAL PIPE STRIP across y=9..10!
    buf.rect(0, 9, w, 1, '#9cff6e');
    buf.rect(0, 10, w, 1, '#5ce040');
    buf.rect(0, 11, w, 1, '#1a4a24');
    // Lower dark metal vent + tiny cyan/red wall monitor indicator dots!
    buf.rect(2, 12, 12, 2, t.wallBotDark);
    if (frame === 1 || frame === 3) {
      buf.set(5, 13, '#42d4e8');
      buf.set(10, 13, '#e83838');
    } else if (frame === 2) {
      buf.set(8, 13, '#5ce040');
    }
  } else if (t.pattern === 'palace') {
    // Warm weathered terracotta brick courses (#703a3b / #5c2528 / #42181c) matching 15_palace_7_1.png!
    buf.rect(0, 0, w, 8, t.wallTop);
    buf.rect(0, 8, w, 7, t.wallBot);
    buf.rect(0, 11, w, 1, t.wallBotDark); // mortar line between upper & lower visible brick courses
    buf.rect(0, 15, w, 1, t.wallOut);
    for (let bx = 0; bx < w; bx += 8) {
      // Upper course (y=8..10)
      buf.rect(bx, 8, 1, 3, t.wallBotDark);
      buf.rect(bx + 1, 8, 7, 1, t.wallBotHi);
      // Lower staggered course (y=12..14)
      const lx = (bx + 4) & 15;
      buf.rect(lx, 12, 1, 3, t.wallBotDark);
      buf.rect((lx + 1) & 15, 12, 3, 1, t.wallBotHi);
    }
    if (frame === 3) {
      // Subtle glowing rad moss fleck between palace bricks (visible in 15_palace_7_1.png!)
      buf.rect(6, 11, 2, 1, '#58e048');
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

  // CRISP 1x PALACE PILLAR (`sprPalacePillar` terracotta + neon-green rad rings matching 17_throne_hall.png!)
  // & standard stone `sprPillar`
  const drawPillar1x = (ctx: DrawCtx, x: number, y: number, w: number, h: number, palace: boolean): void => {
    const buf = new PxCanvas(w, h);
    if (palace) {
      // Exact 17_throne_hall.png terracotta brick pillar with glowing neon-green rad rings & top emblem!
      buf.rect(4, 3, 10, 22, '#64282c');
      buf.rect(5, 3, 4, 22, '#78383c');
      buf.rect(11, 3, 3, 22, '#481a1e');
      // Top circular cap with glowing green rad rune
      buf.rect(5, 2, 8, 5, '#7c3c40');
      buf.rect(7, 3, 4, 3, '#48e840');
      buf.rect(8, 4, 2, 1, '#c8ff98');
      // 3 glowing neon-green horizontal rings down the terracotta shaft
      buf.rect(4, 9, 10, 2, '#48e840');
      buf.rect(5, 9, 5, 1, '#b8ff88');
      buf.rect(4, 15, 10, 2, '#48e840');
      buf.rect(5, 15, 5, 1, '#b8ff88');
      buf.rect(4, 21, 10, 2, '#3cc438');
      // Ground base lip
      buf.rect(3, 24, 12, 2, '#4a1b1f');
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
      '......rr......',
      '..pp..rR..cc..',
      '.pPp..rR..cCc.',
      '.pPpr.rR..cC..',
      '..pPrrRRrcCc..',
      '...rRRRRRRc...',
      '..prRRrRRrcp..',
      '..pPrrRRrPPp..',
      '...rrRRRRrr...',
      '....rRRRRr....',
      '....ddRRdd....',
      '.....dddd.....',
    ], {
      r: '#d8324c',
      R: '#ff5c74',
      p: '#e85098',
      P: '#ff90c4',
      c: '#28a8b8',
      C: '#64eef4',
      d: '#7c1a30',
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

  // 10. MASSIVE STEEL & GLOWING-GREEN THRONE HALL GENERATOR (56x56, matching 17_throne_hall.png!!)
  // Centered origin (28, 28) so East generators with flipX:true cleanly mirror their 3 green pipes inward!
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
      buf.rect(6, 6, 38, 44, '#ffffff');
      buf.rect(42, 12, 10, 32, '#ffffff');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }
    if (state === 'dead') {
      // Shattered smoking terracotta & steel generator base
      buf.rect(6, 12, 36, 36, '#4c2226');
      buf.rect(10, 16, 28, 26, '#262a30');
      buf.rect(14, 20, 20, 16, '#14161a');
      buf.ellipse(24, 28, 6, 4, '#24662c');
      buf.rect(42, 16, 6, 4, '#363c44');
      buf.rect(42, 26, 5, 4, '#363c44');
      buf.rect(42, 36, 6, 4, '#363c44');
      buf.outline(INK);
      buf.flush(ctx, x, y);
      return;
    }

    const pulse = (f & 1) === 0;
    const radBright = pulse ? '#66ff54' : '#44dc3a';
    const radCore = pulse ? '#d4ffaa' : '#9cff78';

    // Heavy terracotta-brick mounting plinth matching Palace architecture (17_throne_hall.png!)
    buf.rect(5, 6, 38, 44, '#6c2e32');
    buf.rect(6, 6, 36, 2, '#8a4448');
    buf.rect(5, 46, 38, 4, '#481a1e');

    // 3 thick glowing green conduit pipes jutting out right side (mirrors left when flipX=true!)
    for (const py of [11, 24, 37]) {
      buf.rect(41, py, 10, 8, '#3a8c38');
      buf.rect(42, py + 1, 8, 2, radBright);
      buf.rect(42, py + 5, 8, 2, '#225824');
      // Metallic elbow collar cap
      buf.rect(48, py - 1, 4, 10, '#88949e');
      buf.rect(49, py, 2, 8, '#b4c0ca');
    }

    // Massive arched ribbed steel reactor turbine cylinder matching 17_throne_hall.png!
    buf.ellipse(24, 24, 15, 17, '#646e78');
    buf.ellipse(24, 24, 13, 15, '#8c98a2');
    buf.ellipse(24, 24, 10, 12, '#a6b2bc');
    buf.ellipse(24, 25, 7, 9, '#7a8690');
    // Concentric curved metallic turbine grooves & weathering rust streaks
    buf.pixelRing(24, 24, 13, '#525c66');
    buf.pixelRing(24, 24, 9, '#58626c');
    buf.rect(14, 16, 2, 16, '#cfd8e0'); // crisp top-left metallic sheen
    buf.rect(20, 14, 5, 2, '#9a4c36'); // rust streak
    buf.rect(28, 22, 4, 3, '#8e4430'); // rust streak
    buf.rect(14, 29, 4, 2, '#8e4430');

    // Front glowing neon-green hexagonal rad core window & emblem plate
    buf.rect(17, 36, 14, 12, '#68747e');
    buf.rect(18, 37, 12, 10, '#96a4ae');
    buf.rect(20, 39, 8, 6, '#1f4e22');
    buf.rect(21, 40, 6, 4, radBright);
    buf.rect(23, 41, 2, 2, radCore);

    // Top glowing green power cell vent
    buf.rect(18, 10, 12, 5, '#1e4a22');
    buf.rect(19, 11, 10, 3, radBright);
    buf.rect(21, 11, 6, 1, radCore);

    buf.outline(INK);
    buf.flush(ctx, x, y);
  };
  b.addSprite('sprBigGenerator', 56, 56, 28, 28, 2, (ctx, x, y, w, h, f) =>
    drawGenerator1x(ctx, x, y, w, h, f, 'idle'),
  );
  b.addSprite('sprBigGeneratorHurt', 56, 56, 28, 28, 1, (ctx, x, y, w, h) =>
    drawGenerator1x(ctx, x, y, w, h, 0, 'hurt'),
  );
  b.addSprite('sprBigGeneratorDead', 56, 56, 28, 28, 1, (ctx, x, y, w, h) =>
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
