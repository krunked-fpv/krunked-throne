import {
  type DrawCtx,
  type FallbackAtlasBuilder,
  INK,
  drawPixelGrid,
  drawPixelLine,
  fillDiamond,
  fillPixelEllipse,
  fillTrapezoid,
  outlinedBox,
  outlinedDiamond,
  outlinedEllipse,
  outlinedTrapezoid,
  px,
  rect,
} from './fallback-fonts';

// ============================================================================
// 1. KRUNKED THRONE TITLE EMBLEM (sprLogo 258x96x8 + sprLogoGlow 261x93x1)
// ============================================================================

/** Bold 5x7 display glyph masks for chunky pixel-art title emblem letters. */
const LOGO_GLYPHS: Record<string, readonly string[]> = {
  K: ['11011', '11011', '11110', '11100', '11110', '11011', '11011'],
  R: ['11110', '11011', '11011', '11110', '11100', '11011', '11011'],
  U: ['11011', '11011', '11011', '11011', '11011', '11111', '01110'],
  N: ['11001', '11101', '11101', '10111', '10111', '10011', '10011'],
  E: ['11111', '11111', '11000', '11110', '11000', '11111', '11111'],
  D: ['11110', '11111', '11011', '11011', '11011', '11111', '11110'],
  T: ['11111', '11111', '01110', '01110', '01110', '01110', '01110'],
  H: ['11011', '11011', '11011', '11111', '11011', '11011', '11011'],
  O: ['01110', '11111', '11011', '11011', '11011', '11111', '01110'],
};

/** Bottom-row anchored drip columns for each letter of "KRUNKED" so drips hang seamlessly from letter strokes. */
const KRUNKED_DRIPS: ReadonlyArray<{ col: number; len: number; subCol?: number; subLen?: number }> = [
  { col: 0, len: 10, subCol: 4, subLen: 5 }, // K
  { col: 3, len: 6, subCol: 0, subLen: 4 }, // R
  { col: 2, len: 12 }, // U
  { col: 4, len: 7, subCol: 0, subLen: 5 }, // N
  { col: 1, len: 9, subCol: 3, subLen: 4 }, // K
  { col: 3, len: 11, subCol: 0, subLen: 5 }, // E
  { col: 2, len: 8 }, // D
];

function drawSlimeTendril(ctx: DrawCtx, dx: number, dy: number, dLen: number, withDroplet: boolean): void {
  // Heavy 2px ink outline around dripping tendril
  rect(ctx, dx - 2, dy - 1, 8, dLen + 2, '#0c0812');
  rect(ctx, dx - 1, dy + dLen, 6, 2, '#0c0812');
  // 3-tone radioactive slime fill
  rect(ctx, dx, dy - 1, 4, dLen, '#22b830');
  rect(ctx, dx, dy - 1, 3, Math.max(2, dLen - 1), '#46e842');
  rect(ctx, dx + 1, dy, 2, Math.max(2, dLen - 3), '#9aff5e');
  px(ctx, dx + 1, dy + Math.max(1, dLen - 2), '#e8ffd4');
  // Detached glowing droplet hanging below longer tendrils
  if (withDroplet) {
    outlinedBox(ctx, dx - 1, dy + dLen + 3, 6, 5, '#46e842', '#0c0812', true);
    rect(ctx, dx + 1, dy + dLen + 4, 2, 2, '#b8ff80');
    px(ctx, dx + 1, dy + dLen + 4, '#ffffff');
  }
}

function drawLogoWord(
  ctx: DrawCtx,
  word: string,
  startX: number,
  startY: number,
  cellW: number,
  cellH: number,
  letterGap: number,
  style: 'krunked' | 'throne',
  revealChars = word.length,
): void {
  const stepX = 5 * cellW + letterGap;
  const count = Math.min(word.length, revealChars);

  // Pass 1: Heavy chunky 2px black ink outline + bold drop shadow behind entire word
  ctx.fillStyle = '#0c0812';
  for (let i = 0; i < count; i++) {
    const glyph = LOGO_GLYPHS[word[i]!]!;
    const lx = startX + i * stepX;
    for (let r = 0; r < 7; r++) {
      const rowStr = glyph[r]!;
      for (let c = 0; c < 5; c++) {
        if (rowStr[c] === '1') {
          ctx.fillRect(lx + c * cellW - 2, startY + r * cellH - 2, cellW + 4, cellH + 5);
        }
      }
    }
  }

  // Pass 2: Shaded toxic-green radioactive slime ("KRUNKED") or riveted brushed steel ("THRONE")
  for (let i = 0; i < count; i++) {
    const glyph = LOGO_GLYPHS[word[i]!]!;
    const lx = startX + i * stepX;
    for (let r = 0; r < 7; r++) {
      const rowStr = glyph[r]!;
      for (let c = 0; c < 5; c++) {
        if (rowStr[c] !== '1') continue;
        const bx = lx + c * cellW;
        const by = startY + r * cellH;
        if (style === 'krunked') {
          // Rich 3-tone (+ deep rim) radioactive toxic-green gradient
          const fill = r <= 1 ? '#94ff59' : r <= 3 ? '#46e842' : r <= 5 ? '#22b830' : '#148224';
          rect(ctx, bx, by, cellW, cellH, fill);
          // Glossy wet top rim highlight
          if (r === 0 || glyph[r - 1]![c] !== '1') {
            rect(ctx, bx, by, cellW, 2, '#dcffa8');
            if (c === 0 || rowStr[c - 1] !== '1') {
              rect(ctx, bx, by, 2, 1, '#ffffff');
            }
          }
          // Deep toxic slime bottom bevel
          if (r === 6 || glyph[r + 1]?.[c] !== '1') {
            rect(ctx, bx, by + cellH - 1, cellW, 1, '#0e5c1a');
          }
          // Glowing white/lime specular slime bubbles inside letters
          if ((i * 3 + r * 2 + c) % 5 === 0 && r >= 1 && r <= 4) {
            rect(ctx, bx + 1, by + 1, 2, 2, '#d9ffba');
            px(ctx, bx + 1, by + 1, '#ffffff');
          } else if ((i + r + c * 2) % 7 === 0 && r >= 2 && r <= 5) {
            px(ctx, bx + 3, by + 2, '#b8ff80');
          }
        } else {
          // Riveted brushed wasteland steel
          const fill = r <= 1 ? '#c0ccdc' : r <= 3 ? '#7f8c9e' : r <= 5 ? '#545f70' : '#38404d';
          rect(ctx, bx, by, cellW, cellH, fill);
          // Brushed steel horizontal sheen line
          if (r === 2) {
            rect(ctx, bx, by + 1, cellW, 1, '#9aa8ba');
          }
          if (r === 0 || glyph[r - 1]![c] !== '1') {
            rect(ctx, bx, by, cellW, 2, '#eef5fc');
          }
          if (r === 6 || glyph[r + 1]?.[c] !== '1') {
            rect(ctx, bx, by + cellH - 2, cellW, 2, '#222730');
          }
          // Corner bolt rivets on outer structural cells
          if ((r === 0 || r === 6) && (c === 0 || c === 4)) {
            rect(ctx, bx + 2, by + 2, 2, 2, '#1c212b');
            px(ctx, bx + 2, by + 2, '#f4f8fc');
          }
        }
      }
    }

    // Dripping neon-green radioactive slime tendrils hanging below "KRUNKED" over the metallic console
    if (style === 'krunked') {
      const spec = KRUNKED_DRIPS[i % KRUNKED_DRIPS.length]!;
      const dy = startY + 7 * cellH;
      const dx = lx + spec.col * cellW + 1;
      drawSlimeTendril(ctx, dx, dy, spec.len, spec.len >= 10);
      if (spec.subCol !== undefined && spec.subLen !== undefined) {
        drawSlimeTendril(ctx, lx + spec.subCol * cellW + 1, dy, spec.subLen, false);
      }
    }
  }
}

function drawLogoGlowWord(
  ctx: DrawCtx,
  word: string,
  startX: number,
  startY: number,
  cellW: number,
  cellH: number,
  letterGap: number,
  outerColor: string,
  innerColor: string,
): void {
  const stepX = 5 * cellW + letterGap;
  for (let i = 0; i < word.length; i++) {
    const glyph = LOGO_GLYPHS[word[i]!]!;
    const lx = startX + i * stepX;
    for (let r = 0; r < 7; r++) {
      const rowStr = glyph[r]!;
      for (let c = 0; c < 5; c++) {
        if (rowStr[c] !== '1') continue;
        const bx = lx + c * cellW;
        const by = startY + r * cellH;
        ctx.fillStyle = outerColor;
        ctx.fillRect(bx - 5, by - 4, cellW + 10, cellH + 8);
      }
    }
  }
  for (let i = 0; i < word.length; i++) {
    const glyph = LOGO_GLYPHS[word[i]!]!;
    const lx = startX + i * stepX;
    for (let r = 0; r < 7; r++) {
      const rowStr = glyph[r]!;
      for (let c = 0; c < 5; c++) {
        if (rowStr[c] !== '1') continue;
        const bx = lx + c * cellW;
        const by = startY + r * cellH;
        ctx.fillStyle = innerColor;
        ctx.fillRect(bx - 2, by - 2, cellW + 4, cellH + 4);
      }
    }
  }
}

function registerLogoSprites(b: FallbackAtlasBuilder): void {
  // sprLogoGlow: 261x93, orig=(130, 45), 1 frame contoured toxic aura tightly matching KRUNKED THRONE
  b.addSprite('sprLogoGlow', 261, 93, 130, 45, 1, (ctx, x, y) => {
    // Broad soft atmospheric halo around the two-row silhouette
    fillPixelEllipse(ctx, x + 130, y + 24, 125, 22, 'rgba(50, 225, 70, 0.22)');
    fillPixelEllipse(ctx, x + 130, y + 66, 112, 21, 'rgba(70, 200, 120, 0.16)');
    // Letter-contoured radioactive glow matching "KRUNKED" (top) & "THRONE" (bottom)
    drawLogoGlowWord(
      ctx,
      'KRUNKED',
      x + 13,
      y + 5,
      6,
      5,
      4,
      'rgba(78, 255, 92, 0.24)',
      'rgba(176, 255, 130, 0.34)',
    );
    drawLogoGlowWord(
      ctx,
      'THRONE',
      x + 27,
      y + 50,
      6,
      5,
      5,
      'rgba(96, 220, 145, 0.16)',
      'rgba(170, 245, 200, 0.22)',
    );
  });

  // sprLogo: 258x96, orig=(129, 48), 8 frames (0..6 progressive steel THRONE reveal, 7 = COMPLETE emblem!)
  b.addSprite('sprLogo', 258, 96, 129, 48, 8, (ctx, x, y, _w, _h, f) => {
    // Riveted wasteland brushed-steel console plate behind emblem seam
    outlinedBox(ctx, x + 18, y + 39, 222, 16, '#262330', '#0c0812', true);
    rect(ctx, x + 20, y + 40, 218, 2, '#5a6475');
    rect(ctx, x + 20, y + 42, 218, 2, '#d99838');
    rect(ctx, x + 20, y + 51, 218, 2, '#4a3d2e');
    // Subtle corner rivets on console
    px(ctx, x + 21, y + 44, '#c0ccdc');
    px(ctx, x + 235, y + 44, '#c0ccdc');
    // Hazard chevrons on left & right wings
    for (let h = 0; h < 3; h++) {
      rect(ctx, x + 26 + h * 7, y + 45, 4, 5, '#e8b835');
      rect(ctx, x + 214 + h * 7, y + 45, 4, 5, '#e8b835');
    }

    // Top word: chunky dripping toxic-green "KRUNKED" (7 letters -> 234px wide, centered at x + 12)
    drawLogoWord(ctx, 'KRUNKED', x + 12, y + 6, 6, 5, 4, 'krunked', 7);

    // Bottom word: riveted brushed-steel "THRONE" progressively revealed on frames 0..6, complete on frame 7
    const revealedLetters = f >= 6 ? 6 : Math.min(6, f);
    if (revealedLetters > 0) {
      drawLogoWord(ctx, 'THRONE', x + 26, y + 52, 6, 5, 5, 'throne', revealedLetters);
    }

    // Frame 7 finishing sheen, reactor jewel & gleaming specular glints
    if (f === 7) {
      outlinedBox(ctx, x + 123, y + 43, 12, 7, '#2ad446', '#0c0812', true);
      rect(ctx, x + 125, y + 44, 8, 5, '#6eff80');
      rect(ctx, x + 127, y + 45, 4, 3, '#f0ffe6');
      // Crisp 4-point sparkle glints on KRUNKED & THRONE
      const sparks: ReadonlyArray<[number, number]> = [
        [24, 9], [102, 8], [206, 10], [58, 55], [192, 55],
      ];
      for (const [sx, sy] of sparks) {
        rect(ctx, x + sx - 1, y + sy, 3, 1, '#ffffff');
        rect(ctx, x + sx, y + sy - 1, 1, 3, '#ffffff');
      }
    }
  });
}

// ============================================================================
// 2. ALL 12 MUTANTS LARGE BUST PORTRAITS (sprBigPortrait 96x80x24 + sprCharSelect)
// ============================================================================

interface BustStyle {
  bgTop: string;
  bgMid: string;
  bgBot: string;
  rim: string;
  skin: string;
  skinHi: string;
  skinDark: string;
  gear: string;
  gearHi: string;
  gearDark: string;
  eye: string;
  accent: string;
}

const BUST_STYLES_24: readonly BustStyle[] = [
  // 0: Fish A, 1: Fish B
  { bgTop: '#163a2d', bgMid: '#112c22', bgBot: '#0a1a14', rim: '#82f2a4', skin: '#44ab6d', skinHi: '#85ed9f', skinDark: '#1f5c3a', gear: '#8c542e', gearHi: '#cc8950', gearDark: '#522e16', eye: '#fff066', accent: '#257852' },
  { bgTop: '#3b1620', bgMid: '#290f17', bgBot: '#17090e', rim: '#ff707a', skin: '#2d8553', skinHi: '#5ec486', skinDark: '#14472b', gear: '#d92638', gearHi: '#ff6e7b', gearDark: '#7d121d', eye: '#ffe859', accent: '#f5c742' },
  // 2: Crystal A, 3: Crystal B
  { bgTop: '#2e124a', bgMid: '#210d36', bgBot: '#130721', rim: '#f2b0ff', skin: '#ab46e0', skinHi: '#e8a8ff', skinDark: '#581787', gear: '#d678ff', gearHi: '#ffffff', gearDark: '#3e0e61', eye: '#ffffff', accent: '#8024bd' },
  { bgTop: '#402a0b', bgMid: '#2e1e08', bgBot: '#1a1004', rim: '#fff494', skin: '#eba828', skinHi: '#fff396', skinDark: '#87500b', gear: '#ffd852', gearHi: '#ffffff', gearDark: '#5e3406', eye: '#80f7ff', accent: '#c97812' },
  // 4: Eyes A, 5: Eyes B
  { bgTop: '#12224f', bgMid: '#0d193b', bgBot: '#080e24', rim: '#87bfff', skin: '#3b6bc9', skinHi: '#78abfa', skinDark: '#1d387a', gear: '#284794', gearHi: '#a6ccff', gearDark: '#132452', eye: '#ffffff', accent: '#120e16' },
  { bgTop: '#36122e', bgMid: '#260c21', bgBot: '#140612', rim: '#ff78ad', skin: '#592975', skinHi: '#9654bf', skinDark: '#29103b', gear: '#a32148', gearHi: '#f05e8a', gearDark: '#5c1028', eye: '#ffe84d', accent: '#1a0c14' },
  // 6: Melting A, 7: Melting B
  { bgTop: '#2e2226', bgMid: '#21181b', bgBot: '#120d10', rim: '#f5ecd8', skin: '#dbd0ba', skinHi: '#fcf6e8', skinDark: '#877965', gear: '#9e2932', gearHi: '#db555e', gearDark: '#571319', eye: '#140f17', accent: '#695c4d' },
  { bgTop: '#3a1412', bgMid: '#290d0c', bgBot: '#170707', rim: '#ff8038', skin: '#4f4657', skinHi: '#80758c', skinDark: '#221d26', gear: '#cc2921', gearHi: '#ff733b', gearDark: '#69120e', eye: '#ff731c', accent: '#fff285' },
  // 8: Plant A, 9: Plant B
  { bgTop: '#113618', bgMid: '#0c2611', bgBot: '#07170a', rim: '#8fff7d', skin: '#3bba46', skinHi: '#7ef073', skinDark: '#1a6626', gear: '#de2b38', gearHi: '#ff707a', gearDark: '#7d141d', eye: '#ffe647', accent: '#ffffff' },
  { bgTop: '#26113b', bgMid: '#1b0c2b', bgBot: '#0f061a', rim: '#ff87ed', skin: '#298f81', skinHi: '#5cd1be', skinDark: '#124a44', gear: '#cc29b8', gearHi: '#ff7eed', gearDark: '#6e1263', eye: '#7dffec', accent: '#ffffff' },
  // 10: Y.V. A, 11: Y.V. B
  { bgTop: '#2b233b', bgMid: '#1f192b', bgBot: '#110d1a', rim: '#ffe34d', skin: '#f0edf5', skinHi: '#ffffff', skinDark: '#9d97ab', gear: '#f7c636', gearHi: '#fff69e', gearDark: '#9e6c11', eye: '#ffffff', accent: '#141118' },
  { bgTop: '#3d2a0b', bgMid: '#2b1d07', bgBot: '#170f04', rim: '#61ff82', skin: '#f5c436', skinHi: '#fff69e', skinDark: '#9c6812', gear: '#d12435', gearHi: '#ff5e6f', gearDark: '#6e0e18', eye: '#ff3847', accent: '#3be066' },
  // 12: Steroids A, 13: Steroids B
  { bgTop: '#262336', bgMid: '#1b1926', bgBot: '#100e17', rim: '#bdeaff', skin: '#d98f64', skinHi: '#f7ba92', skinDark: '#8c4e2c', gear: '#edeaf2', gearHi: '#ffffff', gearDark: '#9b96a8', eye: '#91e8ff', accent: '#525b69' },
  { bgTop: '#36161b', bgMid: '#260f13', bgBot: '#14080b', rim: '#ff6b6b', skin: '#cc7e52', skinHi: '#eba77e', skinDark: '#783e22', gear: '#34303d', gearHi: '#e0313d', gearDark: '#191721', eye: '#18141c', accent: '#ffe047' },
  // 14: Robot A, 15: Robot B
  { bgTop: '#142b30', bgMid: '#0e1f24', bgBot: '#081214', rim: '#73ff8d', skin: '#8ca1ae', skinHi: '#cbdce6', skinDark: '#475763', gear: '#36434f', gearHi: '#788ea1', gearDark: '#1e262e', eye: '#59ff7a', accent: '#eb3d34' },
  { bgTop: '#11244a', bgMid: '#0c1936', bgBot: '#070f21', rim: '#7df4ff', skin: '#3b6ec9', skinHi: '#7aadfa', skinDark: '#1b3873', gear: '#ebba34', gearHi: '#fff48f', gearDark: '#8a6011', eye: '#70f4ff', accent: '#ff4a63' },
  // 16: Chicken A, 17: Chicken B
  { bgTop: '#3b191c', bgMid: '#291113', bgBot: '#17090b', rim: '#ff756b', skin: '#f5f0e6', skinHi: '#ffffff', skinDark: '#b0a799', gear: '#e62e26', gearHi: '#ff705c', gearDark: '#821411', eye: '#18141a', accent: '#f7a923' },
  { bgTop: '#1c182b', bgMid: '#13101f', bgBot: '#0a0812', rim: '#ff4d5e', skin: '#2e2a3b', skinHi: '#59536e', skinDark: '#15121f', gear: '#de2437', gearHi: '#ff6173', gearDark: '#730f1a', eye: '#ff3847', accent: '#f5c438' },
  // 18: Rebel A, 19: Rebel B
  { bgTop: '#243022', bgMid: '#1a2418', bgBot: '#0f140e', rim: '#ffe36b', skin: '#7d9479', skinHi: '#b0c9ab', skinDark: '#425440', gear: '#c2a87e', gearHi: '#ebd5ad', gearDark: '#735e3e', eye: '#ffe659', accent: '#334031' },
  { bgTop: '#3b131c', bgMid: '#290d14', bgBot: '#17070c', rim: '#ffe36b', skin: '#a8293a', skinHi: '#de4e61', skinDark: '#57121e', gear: '#d4dde8', gearHi: '#ffffff', gearDark: '#768291', eye: '#ffe347', accent: '#403645' },
  // 20: Horror A, 21: Horror B
  { bgTop: '#0c3815', bgMid: '#092910', bgBot: '#051709', rim: '#a3ff96', skin: '#42ed53', skinHi: '#b8ffba', skinDark: '#168228', gear: '#7dff66', gearHi: '#ebffe8', gearDark: '#0e4d18', eye: '#102414', accent: '#dcffbd' },
  { bgTop: '#0c2740', bgMid: '#091c2e', bgBot: '#05101c', rim: '#a8f7ff', skin: '#36c9f2', skinHi: '#abf5ff', skinDark: '#14658f', gear: '#7885ff', gearHi: '#e6fcff', gearDark: '#0f3661', eye: '#101836', accent: '#ffffff' },
  // 22: Rogue A, 23: Rogue B
  { bgTop: '#112247', bgMid: '#0c1833', bgBot: '#070e1f', rim: '#7df4ff', skin: '#3c73cc', skinHi: '#75abfa', skinDark: '#1b3a78', gear: '#ebf2fa', gearHi: '#ffffff', gearDark: '#7a8ea6', eye: '#7df4ff', accent: '#234a94' },
  { bgTop: '#30131b', bgMid: '#210d13', bgBot: '#12070b', rim: '#ffc84d', skin: '#3c3f4f', skinHi: '#6a7087', skinDark: '#1c1d29', gear: '#d12938', gearHi: '#ff6170', gearDark: '#6b121c', eye: '#ffc138', accent: '#8c1b26' },
];

/** Draws a contoured, tapered shoulder + neck silhouette with directional top-left lighting & rim sheen. */
function drawContouredShoulders(
  ctx: DrawCtx,
  cx: number,
  y: number,
  neckW: number,
  shoulderW: number,
  topY: number,
  botY: number,
  fill: string,
  hi: string,
  dark: string,
  rim: string,
): void {
  const h = botY - topY;
  // Soft tapered trapezoid shoulders instead of a square block
  outlinedTrapezoid(ctx, cx, topY, neckW, shoulderW, h, fill, INK);
  // Top-left directional highlight plane
  fillTrapezoid(ctx, cx - Math.floor(shoulderW * 0.14), topY + 1, Math.max(4, Math.floor(neckW * 0.45)), Math.floor(shoulderW * 0.48), Math.max(4, h - 3), hi);
  // Bottom-right directional shadow plane
  fillTrapezoid(ctx, cx + Math.floor(shoulderW * 0.19), topY + 2, Math.max(4, Math.floor(neckW * 0.35)), Math.floor(shoulderW * 0.42), Math.max(4, h - 3), dark);
  // Crisp top-left rim light streak along left shoulder slope
  drawPixelLine(
    ctx,
    cx - Math.floor(neckW / 2),
    topY + 1,
    cx - Math.floor(shoulderW / 2) + 2,
    botY - 2,
    rim,
    1,
  );
  // Grounded bottom shadow fade
  rect(ctx, cx - Math.floor(shoulderW / 2) + 1, botY - 2, shoulderW - 2, 2, dark);
  // Guard unused y
  void y;
}

function drawMutantBigPortrait(ctx: DrawCtx, x: number, y: number, w: number, h: number, frame: number): void {
  const raceIndex = Math.floor(frame / 2) + 1;
  const isB = frame % 2 === 1;
  const s = BUST_STYLES_24[frame % 24]!;
  const cx = x + Math.floor(w / 2);

  // Atmospheric 3-band wasteland portrait backdrop + subtle radial spotlight
  rect(ctx, x, y, w, h, s.bgBot);
  rect(ctx, x, y, w, Math.floor(h * 0.62), s.bgMid);
  rect(ctx, x, y, w, Math.floor(h * 0.34), s.bgTop);
  fillPixelEllipse(ctx, cx, y + 36, 39, 32, s.bgTop);
  fillPixelEllipse(ctx, cx - 8, y + 26, 22, 18, s.bgMid);
  // Subtle diagonal rim rays for depth
  for (let d = 0; d < 3; d++) {
    drawPixelLine(ctx, x + 6 + d * 18, y + 2, x + 2 + d * 12, y + 18, s.bgTop, 1);
  }
  // Crisp inner portrait corner brackets (top & bottom)
  rect(ctx, x + 2, y + 2, 8, 2, s.rim);
  rect(ctx, x + 2, y + 2, 2, 8, s.rim);
  rect(ctx, x + w - 10, y + 2, 8, 2, s.rim);
  rect(ctx, x + w - 4, y + 2, 2, 8, s.rim);
  rect(ctx, x + 2, y + h - 4, 6, 2, s.bgTop);
  rect(ctx, x + w - 8, y + h - 4, 6, 2, s.bgTop);

  // Character-specific bespoke contoured shoulders, sculpted silhouette, directional lighting & accessories!
  switch (raceIndex) {
    case 1: {
      // FISH: curved 3-spine dorsal crest, contoured amphibian shoulders, guitar/pirate strap, expressive mouth, B-skin bandana + eyepatch
      drawContouredShoulders(ctx, cx, y, 22, 60, y + 57, y + h - 1, s.skin, s.skinHi, s.skinDark, s.rim);
      // Diagonal worn guitar/ammo strap across chest (strictly inside y..y+79)
      drawPixelLine(ctx, cx - 18, y + 58, cx + 11, y + 74, INK, 7);
      drawPixelLine(ctx, cx - 18, y + 58, cx + 11, y + 74, s.gear, 5);
      drawPixelLine(ctx, cx - 18, y + 57, cx + 11, y + 73, s.gearHi, 2);
      // Brass strap buckle
      outlinedBox(ctx, cx - 6, y + 62, 7, 6, '#f5c742', INK);
      px(ctx, cx - 4, y + 64, '#ffffff');

      // Curved 3-spine dorsal fin crest sweeping over crown
      outlinedTrapezoid(ctx, cx - 2, y + 5, 4, 16, 13, s.accent, INK);
      fillTrapezoid(ctx, cx - 4, y + 7, 2, 8, 9, s.rim);
      outlinedBox(ctx, cx - 13, y + 10, 7, 10, s.accent, INK, true);
      outlinedBox(ctx, cx + 6, y + 11, 7, 9, s.skinDark, INK, true);
      // Specular fin spines
      drawPixelLine(ctx, cx - 2, y + 6, cx - 1, y + 16, '#c7ffd6', 1);
      drawPixelLine(ctx, cx - 10, y + 11, cx - 8, y + 18, s.rim, 1);

      // Sculpted amphibian head with contoured jaw & directional 3-tone shading
      outlinedEllipse(ctx, cx, y + 38, 22, 22, s.skin, INK);
      fillPixelEllipse(ctx, cx - 6, y + 30, 14, 12, s.skinHi);
      fillPixelEllipse(ctx, cx + 7, y + 46, 13, 11, s.skinDark);
      // Rim highlight along left cheek
      drawPixelLine(ctx, cx - 19, y + 29, cx - 20, y + 43, s.rim, 1);
      // Curved cheek gill slits
      for (let g = 0; g < 3; g++) {
        rect(ctx, cx - 19 + g, y + 40 + g * 3, 5, 2, s.skinDark);
        rect(ctx, cx + 14 - g, y + 40 + g * 3, 5, 2, s.skinDark);
      }

      if (isB) {
        // Pirate crimson bandana wrapping forehead + fluttering tied tails!
        outlinedTrapezoid(ctx, cx, y + 16, 36, 46, 10, s.gear, INK);
        rect(ctx, cx - 18, y + 18, 26, 3, s.gearHi);
        rect(ctx, cx + 8, y + 21, 14, 4, s.gearDark);
        // Fluttering bandana knot & tails on right
        outlinedEllipse(ctx, cx + 23, y + 22, 4, 4, s.gearHi, INK);
        outlinedTrapezoid(ctx, cx + 29, y + 23, 5, 9, 9, s.gear, INK);
        // Diagonal eyepatch strap + sculpted eyepatch over left eye
        drawPixelLine(ctx, cx - 22, y + 25, cx + 21, y + 35, '#120e16', 2);
        outlinedEllipse(ctx, cx - 9, y + 33, 6, 6, '#1c1824', INK);
        px(ctx, cx - 11, y + 30, '#5a5269');
        // Gleaming right golden eye
        outlinedEllipse(ctx, cx + 9, y + 33, 6, 5, s.eye, INK);
        rect(ctx, cx + 8, y + 31, 4, 4, INK);
        px(ctx, cx + 7, y + 31, '#ffffff');
        // Gold pirate hoop earring glint
        outlinedEllipse(ctx, cx - 22, y + 44, 3, 3, s.accent, INK);
      } else {
        // Expressive furrowed amphibian brows + twin bright yellow eyes
        outlinedEllipse(ctx, cx - 9, y + 33, 6, 5, s.eye, INK);
        outlinedEllipse(ctx, cx + 9, y + 33, 6, 5, s.eye, INK);
        rect(ctx, cx - 10, y + 31, 4, 4, INK);
        rect(ctx, cx + 8, y + 31, 4, 4, INK);
        px(ctx, cx - 11, y + 31, '#ffffff');
        px(ctx, cx + 7, y + 31, '#ffffff');
        // Brow ridges
        rect(ctx, cx - 15, y + 26, 11, 2, s.skinDark);
        rect(ctx, cx + 4, y + 26, 11, 2, s.skinDark);
      }
      // Expressive wide amphibian grin with curved lips & crisp teeth highlight
      outlinedEllipse(ctx, cx, y + 48, 12, 4, '#24141c', INK);
      rect(ctx, cx - 9, y + 46, 18, 2, '#f5efe6');
      px(ctx, cx - 9, y + 48, '#ffffff');
      px(ctx, cx + 8, y + 48, '#ffffff');
      rect(ctx, cx - 11, y + 52, 22, 2, s.skinDark);
      break;
    }

    case 2: {
      // CRYSTAL: ZERO square base! Faceted beveled amethyst/gold crystal body + integrated shoulder shards + prism highlights!
      // Swept jagged crystal shoulder clusters
      outlinedTrapezoid(ctx, cx, y + 55, 28, 66, 24, s.skinDark, INK);
      fillTrapezoid(ctx, cx - 9, y + 56, 14, 32, 22, s.skin);
      fillTrapezoid(ctx, cx - 15, y + 58, 6, 15, 19, s.skinHi);
      // Left & right jutting beveled crystal shoulder spires anchored directly into torso
      outlinedTrapezoid(ctx, cx - 23, y + 44, 4, 18, 28, s.skin, INK);
      fillTrapezoid(ctx, cx - 25, y + 46, 2, 8, 24, s.skinHi);
      outlinedTrapezoid(ctx, cx + 23, y + 46, 4, 18, 26, s.skinDark, INK);
      fillTrapezoid(ctx, cx + 21, y + 48, 2, 7, 22, s.skin);

      // Crown crystal spikes framing sculpted faceted head
      outlinedTrapezoid(ctx, cx - 17, y + 16, 3, 14, 34, s.skin, INK);
      fillTrapezoid(ctx, cx - 19, y + 18, 2, 6, 30, s.skinHi);
      outlinedTrapezoid(ctx, cx + 17, y + 18, 3, 14, 32, s.skinDark, INK);
      fillTrapezoid(ctx, cx + 15, y + 20, 2, 6, 28, s.skin);

      // Main sculpted beveled hexagonal crystal head (tapered crown -> broad cheeks -> tapered crystal chin!)
      outlinedTrapezoid(ctx, cx, y + 6, 8, 34, 18, s.skin, INK);
      outlinedTrapezoid(ctx, cx, y + 24, 34, 24, 32, s.skin, INK);
      // Crisp 3-tone planar gem facets
      fillTrapezoid(ctx, cx - 7, y + 8, 4, 16, 16, s.skinHi);
      fillTrapezoid(ctx, cx - 8, y + 24, 16, 11, 30, s.skinHi);
      fillTrapezoid(ctx, cx + 8, y + 10, 4, 14, 14, s.skinDark);
      fillTrapezoid(ctx, cx + 8, y + 24, 15, 11, 30, s.skinDark);
      // Center vertical crystal ridge & sharp diagonal prism reflection
      drawPixelLine(ctx, cx, y + 7, cx, y + 54, s.rim, 1);
      drawPixelLine(ctx, cx - 13, y + 24, cx + 13, y + 24, s.accent, 1);
      fillTrapezoid(ctx, cx - 10, y + 12, 3, 7, 16, s.gearHi);
      // Gleaming prismatic sparkle star
      rect(ctx, cx - 12, y + 16, 7, 1, '#ffffff');
      rect(ctx, cx - 9, y + 13, 1, 7, '#ffffff');
      px(ctx, cx + 12, y + 48, s.rim);

      // Luminous faceted eyes
      outlinedDiamond(ctx, cx - 8, y + 34, 5, 4, s.eye, INK);
      outlinedDiamond(ctx, cx + 8, y + 34, 5, 4, s.eye, INK);
      rect(ctx, cx - 9, y + 33, 2, 2, s.rim);
      rect(ctx, cx + 7, y + 33, 2, 2, s.rim);
      break;
    }

    case 3: {
      // EYES: luminous multi-iris psychic glow + floating furrowed brow + contoured mystic shoulders
      // Faint pulsing psychic halo behind cranium
      fillPixelEllipse(ctx, cx, y + 35, 31, 29, isB ? 'rgba(255, 110, 175, 0.20)' : 'rgba(110, 180, 255, 0.22)');
      drawContouredShoulders(ctx, cx, y, 22, 56, y + 58, y + h - 1, s.skin, s.skinHi, s.skinDark, s.rim);
      // Psychic collar lines
      drawPixelLine(ctx, cx - 12, y + 60, cx, y + 70, s.rim, 1);
      drawPixelLine(ctx, cx + 12, y + 60, cx, y + 70, s.rim, 1);

      // Sculpted bulbous psychic cranium
      outlinedEllipse(ctx, cx, y + 36, 24, 24, s.skin, INK);
      fillPixelEllipse(ctx, cx - 7, y + 26, 15, 13, s.skinHi);
      fillPixelEllipse(ctx, cx + 8, y + 46, 14, 12, s.skinDark);
      // Floating luminous telekinetic brow ridge above crown
      outlinedEllipse(ctx, cx, y + 11, 15, 4, s.gear, INK);
      fillPixelEllipse(ctx, cx - 3, y + 10, 10, 2, s.gearHi);

      // Multi-iris expressive staring eyes (sclera + colored psychic iris + dark pupil + specular highlight!)
      const eyeSpecs: ReadonlyArray<[number, number, number, number]> = [
        [-11, 31, 6, 5], [11, 31, 6, 5],
        [0, 21, 5, 4], [-15, 43, 5, 4], [15, 43, 5, 4],
        [0, 44, 6, 5], [-9, 54, 4, 3], [9, 54, 4, 3],
      ];
      for (const [ex, ey, rx, ry] of eyeSpecs) {
        outlinedEllipse(ctx, cx + ex, y + ey, rx, ry, s.eye, INK);
        fillPixelEllipse(ctx, cx + ex, y + ey, Math.max(2, rx - 2), Math.max(2, ry - 2), s.rim);
        rect(ctx, cx + ex - 1, y + ey - 1, 3, 3, s.accent);
        px(ctx, cx + ex - 2, y + ey - 2, '#ffffff');
      }
      break;
    }

    case 4: {
      // MELTING: cracked skeletal cranium, gaunt jaw, curved collarbones & exposed ribcage over shadowed chest
      // Gaunt tapered dark chest shadow + sculpted clavicles & curved ribs
      outlinedTrapezoid(ctx, cx, y + 58, 18, 52, 21, '#26141a', INK);
      fillTrapezoid(ctx, cx, y + 59, 10, 24, 19, s.gearDark);
      // Curved white collarbones (clavicles)
      drawPixelLine(ctx, cx - 22, y + 63, cx - 4, y + 59, s.skin, 3);
      drawPixelLine(ctx, cx + 22, y + 63, cx + 4, y + 59, s.skinDark, 3);
      drawPixelLine(ctx, cx - 21, y + 62, cx - 4, y + 58, s.skinHi, 1);
      // Spine & exposed ribcage arches
      rect(ctx, cx - 3, y + 58, 6, 20, s.gear);
      rect(ctx, cx - 1, y + 59, 2, 18, s.gearHi);
      for (let r = 0; r < 3; r++) {
        const ry = y + 65 + r * 5;
        rect(ctx, cx - 16 + r * 2, ry, 12 - r, 2, s.skinHi);
        rect(ctx, cx + 5, ry, 11 - r, 2, s.skin);
      }

      // Sculpted cranium dome + narrow articulated cheekbone & jaw
      outlinedEllipse(ctx, cx, y + 30, 21, 19, s.skin, INK);
      fillPixelEllipse(ctx, cx - 6, y + 22, 13, 11, s.skinHi);
      fillPixelEllipse(ctx, cx + 8, y + 36, 11, 11, s.skinDark);
      // Articulated narrow jawline
      outlinedTrapezoid(ctx, cx, y + 44, 28, 20, 14, s.skin, INK);
      fillTrapezoid(ctx, cx - 5, y + 45, 12, 8, 11, s.skinHi);
      fillTrapezoid(ctx, cx + 6, y + 46, 10, 7, 10, s.skinDark);
      // Jagged forehead fracture crack
      drawPixelLine(ctx, cx + 5, y + 13, cx + 2, y + 20, INK, 1);
      drawPixelLine(ctx, cx + 2, y + 20, cx + 7, y + 24, INK, 1);
      drawPixelLine(ctx, cx + 7, y + 24, cx + 5, y + 29, INK, 1);
      // Melting flesh drip on left cheek
      rect(ctx, cx - 18, y + 42, 4, 8, s.skinDark);
      rect(ctx, cx - 17, y + 42, 2, 6, s.skin);
      // Hollow sunken eye sockets (with roaring ember flames on B-skin!)
      outlinedEllipse(ctx, cx - 8, y + 32, 6, 6, s.eye, INK);
      outlinedEllipse(ctx, cx + 8, y + 32, 6, 6, s.eye, INK);
      if (isB) {
        fillPixelEllipse(ctx, cx - 8, y + 32, 4, 4, '#ff781c');
        fillPixelEllipse(ctx, cx + 8, y + 32, 4, 4, '#ff781c');
        rect(ctx, cx - 9, y + 30, 2, 3, s.accent);
        rect(ctx, cx + 7, y + 30, 2, 3, s.accent);
      } else {
        px(ctx, cx - 10, y + 30, '#4a3d4f');
        px(ctx, cx + 6, y + 30, '#4a3d4f');
      }
      // Dark triangular nasal cavity + separated skeletal teeth
      outlinedTrapezoid(ctx, cx, y + 39, 2, 6, 5, INK, INK);
      rect(ctx, cx - 9, y + 47, 18, 7, INK);
      for (let t = -8; t <= 6; t += 4) {
        rect(ctx, cx + t, y + 48, 3, 5, s.skinHi);
        px(ctx, cx + t + 2, y + 52, s.skinDark);
      }
      break;
    }

    case 5: {
      // PLANT: tapered thorny vine stalk, layered splayed collar leaves, curved serrated crimson flytrap petals & razor fangs!
      // Organic tapered leafy stem neck & broad splayed leaves
      outlinedTrapezoid(ctx, cx, y + 54, 14, 24, 25, s.skin, INK);
      fillTrapezoid(ctx, cx - 3, y + 55, 6, 10, 23, s.skinHi);
      // Left & right sweeping curved collar leaves
      outlinedTrapezoid(ctx, cx - 22, y + 57, 22, 8, 12, s.skin, INK);
      drawPixelLine(ctx, cx - 30, y + 60, cx - 10, y + 64, s.skinHi, 2);
      outlinedTrapezoid(ctx, cx + 22, y + 57, 22, 8, 12, s.skinDark, INK);
      drawPixelLine(ctx, cx + 30, y + 60, cx + 10, y + 64, s.skin, 2);
      // Lower sweeping leaves
      outlinedEllipse(ctx, cx - 16, y + 72, 14, 6, s.skinDark, INK);
      outlinedEllipse(ctx, cx + 16, y + 72, 14, 6, s.skinDark, INK);

      // Serrated outer petal spikes radiating around carnivorous head
      for (let ang = -3; ang <= 3; ang++) {
        const pxX = cx + ang * 7;
        const pxY = y + 12 + Math.abs(ang) * 3;
        outlinedDiamond(ctx, pxX, pxY, 4, 5, ang <= 0 ? s.gearHi : s.gear, INK);
      }
      // Sculpted curved flytrap head dome
      outlinedEllipse(ctx, cx, y + 35, 24, 21, s.gear, INK);
      fillPixelEllipse(ctx, cx - 6, y + 25, 15, 11, s.gearHi);
      fillPixelEllipse(ctx, cx + 8, y + 43, 13, 11, s.gearDark);
      // Glowing yellow/cyan bio-spots on petals
      outlinedEllipse(ctx, cx - 14, y + 23, 3, 2, s.eye, s.gearDark);
      outlinedEllipse(ctx, cx + 12, y + 24, 3, 2, s.eye, s.gearDark);
      outlinedEllipse(ctx, cx - 2, y + 18, 3, 2, s.eye, s.gearDark);
      px(ctx, cx - 15, y + 22, '#ffffff');
      px(ctx, cx - 3, y + 17, '#ffffff');

      // Deep dark snapping maw with interlocking pointed fangs!
      outlinedEllipse(ctx, cx, y + 40, 19, 11, '#1a0710', INK);
      fillPixelEllipse(ctx, cx, y + 42, 13, 6, '#4a1024'); // inner throat glow
      for (let fX = -14; fX <= 14; fX += 7) {
        // Upper downward-pointing triangular fangs
        outlinedTrapezoid(ctx, cx + fX, y + 31, 5, 1, 7, s.accent, INK);
        // Lower upward-pointing fangs offset between uppers
        if (fX < 14) {
          outlinedTrapezoid(ctx, cx + fX + 3, y + 42, 1, 5, 7, s.accent, INK);
        }
      }
      break;
    }

    case 6: {
      // Y.V.: shaded 3D pyramid with crisp sunlit/shadowed faces + sloped shoulders + gleaming curved gold medallion chain!
      drawContouredShoulders(ctx, cx, y, 24, 62, y + 58, y + h - 1, s.skinDark, s.skin, '#302a3d', s.rim);
      // Sleek open jacket lapels
      outlinedTrapezoid(ctx, cx, y + 59, 14, 24, 20, '#181421', INK);

      // True 3D shaded geometric pyramid (sharp apex at y+7 -> base at y+57)
      for (let row = 0; row < 50; row++) {
        const half = Math.floor((row + 1) * 0.6);
        const py = y + 7 + row;
        rect(ctx, cx - half - 2, py, (half + 2) * 2, 1, INK);
        if (row >= 2 && row <= 47) {
          // Left sunlit 3D face
          const leftW = Math.max(1, Math.floor(half * 0.92));
          rect(ctx, cx - half, py, leftW, 1, row < 20 ? s.skinHi : s.skin);
          // Crisp bright left specular rim edge
          rect(ctx, cx - half, py, Math.min(3, leftW), 1, '#ffffff');
          // Right shadowed 3D face
          const rightX = cx - half + leftW;
          const rightW = half * 2 - leftW;
          if (rightW > 0) {
            rect(ctx, rightX, py, rightW, 1, row > 36 ? s.skinDark : (isB ? '#d49a1e' : '#c7c2d6'));
          }
        }
      }
      // Subtle bottom bevel shadow along pyramid base
      rect(ctx, cx - 28, y + 53, 56, 2, s.skinDark);

      // Iconic giant sharp cyclops eye (A) or tilted crimson VIP shades (B)
      if (isB) {
        outlinedTrapezoid(ctx, cx, y + 29, 34, 30, 12, '#120a0e', INK);
        rect(ctx, cx - 14, y + 31, 12, 8, s.gear);
        rect(ctx, cx + 2, y + 31, 12, 8, s.gear);
        // Diagonal glossy white specular reflection bars
        drawPixelLine(ctx, cx - 12, y + 37, cx - 6, y + 31, '#ffffff', 2);
        drawPixelLine(ctx, cx + 4, y + 37, cx + 10, y + 31, '#ffffff', 2);
      } else {
        outlinedEllipse(ctx, cx, y + 36, 13, 8, s.eye, INK);
        // Subtle eyelid shadow arc
        rect(ctx, cx - 11, y + 29, 22, 2, '#d6d1e3');
        fillPixelEllipse(ctx, cx, y + 36, 5, 7, s.accent);
        rect(ctx, cx - 4, y + 32, 3, 3, '#ffffff');
        px(ctx, cx + 3, y + 38, '#a8e6ff');
      }

      // Gleaming chunky curved gold chain + $ medallion
      for (let link = -18; link <= 18; link += 4) {
        const ly = Math.round(y + 57 + (18 - Math.abs(link)) * 0.42);
        outlinedBox(ctx, cx + link - 2, ly, 5, 4, s.gear, INK);
        px(ctx, cx + link - 1, ly + 1, s.gearHi);
      }
      outlinedEllipse(ctx, cx, y + 70, 7, 7, s.gear, INK);
      fillPixelEllipse(ctx, cx - 1, y + 69, 5, 5, s.gearHi);
      // Crisp '$' emblem inside medallion
      rect(ctx, cx - 1, y + 66, 2, 8, s.gearDark);
      rect(ctx, cx - 3, y + 67, 6, 2, s.gearDark);
      rect(ctx, cx - 3, y + 71, 6, 2, s.gearDark);
      px(ctx, cx - 3, y + 66, '#ffffff');
      break;
    }

    case 7: {
      // STEROIDS: massive muscular trapezius & deltoids + shredded coat lapels + twin gun barrels + gleaming round glasses
      // Twin angled heavy steel gun barrels rising behind shoulders
      outlinedBox(ctx, x + 7, y + 24, 10, 34, '#545f6e', INK, true);
      rect(ctx, x + 9, y + 26, 3, 30, '#a3b5c9');
      rect(ctx, x + 8, y + 23, 8, 3, '#2b313b');
      outlinedBox(ctx, x + w - 17, y + 24, 10, 34, '#545f6e', INK, true);
      rect(ctx, x + w - 15, y + 26, 3, 30, '#a3b5c9');
      rect(ctx, x + w - 16, y + 23, 8, 3, '#2b313b');

      // Massive sloping muscular trapezius shoulders (contoured trapezoid!)
      outlinedTrapezoid(ctx, cx, y + 48, 30, 74, 31, s.skin, INK);
      fillTrapezoid(ctx, cx - 12, y + 50, 12, 30, 27, s.skinHi);
      fillTrapezoid(ctx, cx + 14, y + 52, 12, 28, 25, s.skinDark);
      // Shredded lab coat (A) or tactical vest (B) V-cut lapels!
      outlinedTrapezoid(ctx, cx - 22, y + 54, 10, 24, 25, s.gear, INK);
      fillTrapezoid(ctx, cx - 24, y + 56, 5, 12, 22, s.gearHi);
      outlinedTrapezoid(ctx, cx + 22, y + 54, 10, 24, 25, s.gear, INK);
      fillTrapezoid(ctx, cx + 24, y + 56, 5, 12, 22, s.gearDark);
      // Muscular chest pectoral line in center V opening
      rect(ctx, cx - 1, y + 60, 2, 16, s.skinDark);
      rect(ctx, cx - 9, y + 66, 8, 2, s.skinDark);
      rect(ctx, cx + 2, y + 66, 8, 2, s.skinDark);

      // Chiseled muscular head with contoured brow dome & thick jaw
      outlinedEllipse(ctx, cx, y + 24, 17, 11, s.skin, INK);
      outlinedTrapezoid(ctx, cx, y + 24, 36, 38, 14, s.skin, INK);
      outlinedTrapezoid(ctx, cx, y + 38, 38, 30, 16, s.skin, INK);
      fillPixelEllipse(ctx, cx - 4, y + 20, 12, 6, s.skinHi);
      rect(ctx, cx + 7, y + 21, 9, 29, s.skinDark);
      // Thick round scientist spectacles (or dark commando shades on B)
      outlinedEllipse(ctx, cx - 9, y + 32, 9, 8, s.eye, INK);
      outlinedEllipse(ctx, cx + 9, y + 32, 9, 8, s.eye, INK);
      rect(ctx, cx - 2, y + 31, 4, 3, INK);
      drawPixelLine(ctx, cx - 14, y + 30, cx - 8, y + 26, '#ffffff', 2);
      drawPixelLine(ctx, cx + 4, y + 30, cx + 10, y + 26, '#ffffff', 2);
      // Fierce gritted teeth determination
      outlinedBox(ctx, cx - 10, y + 44, 20, 7, '#f7f4ed', INK, true);
      rect(ctx, cx - 9, y + 47, 18, 1, INK);
      for (let tx = -6; tx <= 6; tx += 4) {
        rect(ctx, cx + tx, y + 45, 1, 5, '#b8b0a4');
      }
      break;
    }

    case 8: {
      // ROBOT: beveled brushed-steel CRT head + hydraulic neck + glowing optic scanline + tapered armored chassis!
      // Tapered armored torso with angled steel shoulder bevels
      outlinedTrapezoid(ctx, cx, y + 57, 30, 66, 22, s.skin, INK);
      fillTrapezoid(ctx, cx - 10, y + 58, 12, 26, 20, s.skinHi);
      fillTrapezoid(ctx, cx + 12, y + 59, 12, 26, 19, s.skinDark);
      // Hydraulic neck pistons
      outlinedBox(ctx, cx - 10, y + 52, 6, 8, s.gear, INK);
      outlinedBox(ctx, cx + 4, y + 52, 6, 8, s.gear, INK);
      rect(ctx, cx - 8, y + 53, 2, 6, s.gearHi);
      rect(ctx, cx + 6, y + 53, 2, 6, s.gearHi);
      // Chest speaker grille + status LED
      outlinedBox(ctx, cx - 14, y + 62, 28, 13, s.gearDark, INK);
      for (let gx = -10; gx <= 8; gx += 4) {
        rect(ctx, cx + gx, y + 64, 2, 9, s.gearHi);
      }
      outlinedBox(ctx, cx + 17, y + 64, 5, 5, s.accent, INK);
      px(ctx, cx + 18, y + 65, '#ffffff');

      // Spring-coil antenna + glowing beacon orb
      outlinedBox(ctx, cx - 2, y + 6, 4, 10, s.gear, INK);
      rect(ctx, cx - 4, y + 9, 8, 1, s.gearHi);
      outlinedEllipse(ctx, cx, y + 5, 4, 4, s.accent, INK);
      px(ctx, cx - 1, y + 4, '#ffffff');

      // Beveled brushed-steel CRT monitor head (chamfered top & tapered chin!)
      outlinedTrapezoid(ctx, cx, y + 14, 38, 46, 8, s.skinHi, INK);
      outlinedBox(ctx, cx - 23, y + 20, 46, 30, s.skin, INK, true);
      outlinedTrapezoid(ctx, cx, y + 49, 44, 36, 7, s.skinDark, INK);
      // Directional brushed-steel vertical sheen
      rect(ctx, cx - 20, y + 18, 6, 32, s.skinHi);
      rect(ctx, cx + 16, y + 20, 5, 29, s.skinDark);
      // Recessed corner rivets
      for (const [rx, ry] of [[-19, 19], [16, 19], [-19, 46], [16, 46]] as const) {
        rect(ctx, cx + rx, y + ry, 3, 3, s.gearDark);
        px(ctx, cx + rx, y + ry, '#e6f2fa');
      }
      // Deep recessed CRT monitor screen + glowing optic & live scanlines!
      outlinedBox(ctx, cx - 16, y + 23, 32, 22, '#0c1417', INK, true);
      rect(ctx, cx - 14, y + 25, 28, 18, '#143326');
      rect(ctx, cx - 13, y + 26, 26, 16, s.eye);
      // Glowing horizontal CRT scanlines & optic waveform bar
      for (let sl = 27; sl <= 41; sl += 3) {
        rect(ctx, cx - 13, y + sl, 26, 1, 'rgba(0, 0, 0, 0.26)');
      }
      rect(ctx, cx - 13, y + 33, 26, 3, '#ffffff');
      fillPixelEllipse(ctx, cx + 2, y + 34, 5, 5, '#ffffff');
      fillPixelEllipse(ctx, cx + 2, y + 34, 2, 2, s.eye);
      // Diagonal glass CRT glare
      drawPixelLine(ctx, cx - 11, y + 27, cx - 5, y + 33, '#ffffff', 2);
      break;
    }

    case 9: {
      // CHICKEN: layered feathered shoulders + flowing crimson bandana (A) or dark shinobi ninja hood (B) + curved beak!
      // Contoured feathered shoulders + martial arts gi wrap
      drawContouredShoulders(ctx, cx, y, 22, 60, y + 57, y + h - 1, s.skin, s.skinHi, s.skinDark, s.rim);
      // Diagonal martial wrap collar
      drawPixelLine(ctx, cx - 14, y + 58, cx + 4, y + 76, INK, 6);
      drawPixelLine(ctx, cx - 14, y + 58, cx + 4, y + 76, s.gear, 4);
      drawPixelLine(ctx, cx + 14, y + 58, cx - 2, y + 76, INK, 6);
      drawPixelLine(ctx, cx + 14, y + 58, cx - 2, y + 76, s.gearDark, 4);
      // Layered scalloped chest feathers
      for (let fX = -12; fX <= 12; fX += 6) {
        outlinedEllipse(ctx, cx + fX, y + 58, 4, 3, fX <= 0 ? s.skinHi : s.skin, INK);
      }

      if (isB) {
        // B-Skin: Sleek dark shinobi ninja hood with glowing crimson ninja mask & intense red eyes!
        outlinedTrapezoid(ctx, cx, y + 10, 18, 44, 16, s.skin, INK);
        outlinedEllipse(ctx, cx, y + 37, 22, 21, s.skin, INK);
        fillPixelEllipse(ctx, cx - 6, y + 26, 13, 10, s.skinHi);
        // Crimson ninja forehead band + fluttering tail
        outlinedBox(ctx, cx - 22, y + 21, 44, 7, s.gear, INK);
        rect(ctx, cx - 20, y + 23, 36, 2, s.gearHi);
        outlinedTrapezoid(ctx, cx - 29, y + 23, 6, 14, 10, s.gear, INK);
        // Dark eye slit + blazing crimson eyes
        outlinedBox(ctx, cx - 16, y + 28, 32, 10, '#0d0b14', INK, true);
        rect(ctx, cx - 12, y + 31, 8, 4, s.eye);
        rect(ctx, cx + 4, y + 31, 8, 4, s.eye);
        rect(ctx, cx - 10, y + 32, 3, 2, '#ffe880');
        rect(ctx, cx + 6, y + 32, 3, 2, '#ffe880');
        // Ninja cloth face-mask wrap over beak
        outlinedTrapezoid(ctx, cx, y + 39, 36, 28, 16, s.skinDark, INK);
        drawPixelLine(ctx, cx - 14, y + 44, cx + 14, y + 48, s.skinHi, 1);
      } else {
        // A-Skin: Layered scarlet comb crest + white layered feathers + flowing crimson bandana + sharp golden beak!
        outlinedEllipse(ctx, cx - 8, y + 13, 5, 7, s.gear, INK);
        outlinedEllipse(ctx, cx, y + 11, 6, 8, s.gearHi, INK);
        outlinedEllipse(ctx, cx + 8, y + 14, 5, 6, s.gear, INK);
        // Feathered head with scalloped cheek tufts
        outlinedEllipse(ctx, cx, y + 37, 21, 21, s.skin, INK);
        fillPixelEllipse(ctx, cx - 6, y + 28, 13, 11, s.skinHi);
        fillPixelEllipse(ctx, cx + 7, y + 45, 12, 10, s.skinDark);
        // Cheek feather tufts
        outlinedDiamond(ctx, cx - 21, y + 41, 4, 3, s.skinHi, INK);
        outlinedDiamond(ctx, cx + 21, y + 41, 4, 3, s.skinDark, INK);
        // Flowing crimson martial bandana + streaming ribbon tails
        outlinedBox(ctx, cx - 23, y + 21, 46, 7, s.gear, INK);
        rect(ctx, cx - 21, y + 23, 42, 2, s.gearHi);
        outlinedTrapezoid(ctx, cx - 30, y + 24, 6, 13, 12, s.gear, INK);
        drawPixelLine(ctx, cx - 28, y + 26, cx - 32, y + 34, s.gearHi, 2);
        // Fierce focused eyes
        outlinedBox(ctx, cx - 13, y + 30, 8, 7, s.eye, INK, true);
        outlinedBox(ctx, cx + 5, y + 30, 8, 7, s.eye, INK, true);
        px(ctx, cx - 11, y + 32, '#ffffff');
        px(ctx, cx + 7, y + 32, '#ffffff');
        // Curved tapered golden beak
        outlinedTrapezoid(ctx, cx, y + 38, 12, 4, 10, s.accent, INK);
        fillTrapezoid(ctx, cx - 1, y + 39, 8, 2, 4, '#fff28c');
        rect(ctx, cx - 5, y + 43, 10, 1, INK);
      }
      break;
    }

    case 10: {
      // REBEL: layered desert cloth hood + draped multi-fold scarf + glowing amber nomad eyes!
      // Draped desert poncho/cloak shoulders
      outlinedTrapezoid(ctx, cx, y + 54, 34, 70, 25, s.skin, INK);
      fillTrapezoid(ctx, cx - 12, y + 56, 14, 28, 22, s.skinHi);
      fillTrapezoid(ctx, cx + 14, y + 56, 14, 28, 22, s.skinDark);
      // Cloth cloak vertical fold shadows
      drawPixelLine(ctx, cx - 16, y + 57, cx - 22, y + 78, s.skinDark, 2);
      drawPixelLine(ctx, cx + 15, y + 57, cx + 22, y + 78, s.accent, 2);

      // Sculpted peaked desert cloth hood!
      outlinedTrapezoid(ctx, cx, y + 7, 10, 44, 18, s.skin, INK);
      outlinedTrapezoid(ctx, cx, y + 25, 44, 52, 28, s.skin, INK);
      // Multi-tone hood cloth highlights & inner rim fold
      fillTrapezoid(ctx, cx - 9, y + 10, 5, 18, 16, s.skinHi);
      fillTrapezoid(ctx, cx + 11, y + 12, 4, 16, 38, s.skinDark);
      drawPixelLine(ctx, cx - 5, y + 9, cx - 22, y + 38, s.rim, 1);

      // Deep shadowed hood interior
      outlinedTrapezoid(ctx, cx, y + 22, 22, 32, 22, '#100c14', INK);
      // Blazing nomad eyes gleaming in the shadow
      rect(ctx, cx - 12, y + 30, 8, 5, s.eye);
      rect(ctx, cx + 4, y + 30, 8, 5, s.eye);
      rect(ctx, cx - 10, y + 31, 4, 2, '#ffffff');
      rect(ctx, cx + 6, y + 31, 4, 2, '#ffffff');

      // Layered wrapped desert cloth scarf covering mouth & draping down chest
      outlinedTrapezoid(ctx, cx, y + 41, 38, 48, 14, s.gear, INK);
      rect(ctx, cx - 18, y + 43, 32, 3, s.gearHi);
      drawPixelLine(ctx, cx - 20, y + 48, cx + 19, y + 46, s.gearDark, 2);
      drawPixelLine(ctx, cx - 21, y + 52, cx + 21, y + 50, s.gearHi, 1);
      // Trailing scarf tail draped across left shoulder
      outlinedTrapezoid(ctx, cx - 17, y + 54, 12, 16, 20, s.gear, INK);
      rect(ctx, cx - 21, y + 56, 4, 16, s.gearHi);
      break;
    }

    case 11: {
      // HORROR: translucent bubbling neon-slime core, undulating amorphous torso, orbiting rad-globules, luminous maw!
      // Soft radioactive outer glow aura
      fillPixelEllipse(ctx, cx, y + 44, 34, 30, isB ? 'rgba(60, 210, 255, 0.22)' : 'rgba(70, 255, 95, 0.22)');
      // Amorphous tapered bubbling slime body (ZERO boxy base!)
      outlinedTrapezoid(ctx, cx, y + 54, 32, 54, 25, s.skinDark, INK);
      fillTrapezoid(ctx, cx, y + 55, 26, 44, 23, s.skin);
      fillPixelEllipse(ctx, cx, y + 66, 16, 10, s.gear);
      fillPixelEllipse(ctx, cx - 2, y + 64, 9, 6, s.skinHi);

      // Undulating translucent slime head with 4-layer glowing core!
      outlinedEllipse(ctx, cx, y + 36, 25, 23, s.skinDark, INK);
      fillPixelEllipse(ctx, cx, y + 35, 22, 20, s.skin);
      fillPixelEllipse(ctx, cx - 4, y + 31, 15, 13, s.gear);
      fillPixelEllipse(ctx, cx - 6, y + 27, 9, 8, s.skinHi);
      fillPixelEllipse(ctx, cx - 7, y + 25, 4, 3, s.gearHi);

      // Orbiting translucent bubbling slime globules
      outlinedEllipse(ctx, cx - 29, y + 25, 6, 6, s.skin, INK);
      fillPixelEllipse(ctx, cx - 30, y + 23, 3, 3, s.gearHi);
      outlinedEllipse(ctx, cx + 28, y + 31, 5, 5, s.skin, INK);
      fillPixelEllipse(ctx, cx + 27, y + 29, 2, 2, s.gearHi);
      outlinedEllipse(ctx, cx + 22, y + 13, 4, 4, s.skinHi, INK);
      px(ctx, cx + 21, y + 12, '#ffffff');
      outlinedEllipse(ctx, cx - 23, y + 56, 4, 4, s.gear, INK);

      // Internal rising translucent specular bubbles
      outlinedEllipse(ctx, cx + 11, y + 22, 3, 3, s.gearHi, s.skinDark);
      px(ctx, cx - 14, y + 48, '#ffffff');
      px(ctx, cx + 13, y + 50, '#ffffff');

      // Sunken dark core eyes + glowing inner pinpoint + jagged luminous rad-maw
      outlinedEllipse(ctx, cx - 9, y + 32, 6, 6, s.eye, INK);
      outlinedEllipse(ctx, cx + 9, y + 32, 6, 6, s.eye, INK);
      rect(ctx, cx - 10, y + 31, 3, 3, s.accent);
      rect(ctx, cx + 8, y + 31, 3, 3, s.accent);
      px(ctx, cx - 9, y + 31, '#ffffff');
      px(ctx, cx + 9, y + 31, '#ffffff');
      outlinedTrapezoid(ctx, cx, y + 43, 28, 22, 10, s.eye, INK);
      for (let t = -10; t <= 8; t += 6) {
        rect(ctx, cx + t, y + 44, 4, 4, s.gearHi);
        px(ctx, cx + t + 1, y + 44, '#ffffff');
      }
      break;
    }

    default: {
      // ROGUE: sloped aerodynamic armored helmet + glowing visor + beveled shoulder pauldrons + tactical collar scarf!
      // Contoured armored torso
      drawContouredShoulders(ctx, cx, y, 24, 58, y + 57, y + h - 1, s.skinDark, s.skin, '#121a33', s.rim);
      // Chest armor plate
      outlinedTrapezoid(ctx, cx, y + 61, 24, 30, 17, s.skin, INK);
      rect(ctx, cx - 9, y + 63, 18, 3, s.skinHi);
      rect(ctx, cx - 3, y + 67, 6, 6, s.eye);
      px(ctx, cx - 1, y + 68, '#ffffff');

      // Sloped beveled armored shoulder pauldrons!
      outlinedTrapezoid(ctx, cx - 25, y + 53, 12, 22, 18, s.gear, INK);
      fillTrapezoid(ctx, cx - 27, y + 55, 6, 12, 14, s.gearHi);
      rect(ctx, cx - 30, y + 66, 14, 3, s.gearDark);
      outlinedTrapezoid(ctx, cx + 25, y + 53, 12, 22, 18, s.gear, INK);
      fillTrapezoid(ctx, cx + 23, y + 55, 6, 10, 14, s.gearHi);
      rect(ctx, cx + 18, y + 66, 14, 3, s.gearDark);

      // Tactical comms antenna on left ear
      outlinedBox(ctx, cx - 24, y + 15, 3, 20, s.gearDark, INK);
      px(ctx, cx - 23, y + 15, s.eye);

      // Sloped aerodynamic ex-IDPD helmet (domed crown -> angled cheek plates -> tapered armored chin!)
      outlinedTrapezoid(ctx, cx, y + 12, 24, 44, 18, s.skin, INK);
      outlinedTrapezoid(ctx, cx, y + 30, 44, 32, 23, s.skin, INK);
      fillTrapezoid(ctx, cx - 8, y + 14, 12, 20, 16, s.skinHi);
      fillTrapezoid(ctx, cx + 10, y + 16, 8, 16, 34, s.skinDark);
      // Raised white/crimson center helmet crest ridge
      outlinedTrapezoid(ctx, cx, y + 10, 6, 10, 16, s.gear, INK);
      rect(ctx, cx - 2, y + 12, 3, 12, s.gearHi);
      // Sleek curved glowing cyan/amber tactical visor!
      outlinedTrapezoid(ctx, cx, y + 27, 36, 30, 14, '#0c1324', INK);
      fillTrapezoid(ctx, cx, y + 30, 30, 26, 7, s.eye);
      rect(ctx, cx - 12, y + 31, 14, 2, '#ffffff');
      rect(ctx, cx - 10, y + 36, 20, 2, s.accent);
      // Layered tactical scarf wrapping neck
      outlinedTrapezoid(ctx, cx, y + 51, 34, 42, 10, s.accent, INK);
      rect(ctx, cx - 16, y + 53, 28, 3, s.skinHi);
      drawPixelLine(ctx, cx - 17, y + 57, cx + 17, y + 55, INK, 1);
      break;
    }
  }
}

function drawCharSelectCard(ctx: DrawCtx, x: number, y: number, f: number): void {
  // Frame 0 = Random ?, Frames 1..12 = Mutants 1..12, 13..17 = bonus
  if (f === 0 || f > 12) {
    outlinedBox(ctx, x + 1, y + 1, 14, 22, '#241e30', INK);
    rect(ctx, x + 2, y + 2, 12, 2, '#4a3f61');
    rect(ctx, x + 5, y + 6, 6, 2, '#ffe047');
    rect(ctx, x + 9, y + 8, 2, 3, '#ffe047');
    rect(ctx, x + 7, y + 11, 3, 2, '#ffe047');
    rect(ctx, x + 7, y + 15, 2, 2, '#ffe047');
    return;
  }

  const s = BUST_STYLES_24[(f - 1) * 2]!;
  outlinedBox(ctx, x + 1, y + 1, 14, 22, s.bgBot, INK);
  rect(ctx, x + 2, y + 2, 12, 9, s.bgTop);
  // Tapered mini shoulders
  outlinedTrapezoid(ctx, x + 8, y + 15, 6, 12, 7, s.skin, INK);
  rect(ctx, x + 6, y + 16, 4, 4, s.skinHi);
  if (f === 6) {
    // Y.V. 3D triangle
    for (let r = 0; r < 10; r++) {
      const hw = Math.floor((r + 2) * 0.55);
      rect(ctx, x + 8 - hw, y + 5 + r, hw * 2, 1, r < 4 ? s.skinHi : s.skin);
    }
    rect(ctx, x + 6, y + 10, 4, 2, INK);
    rect(ctx, x + 7, y + 10, 2, 1, '#ffffff');
    rect(ctx, x + 5, y + 16, 6, 2, s.gear);
  } else if (f === 2) {
    // Crystal faceted diamond head
    outlinedDiamond(ctx, x + 8, y + 9, 4, 5, s.skin, INK);
    rect(ctx, x + 6, y + 6, 2, 4, s.skinHi);
    px(ctx, x + 6, y + 9, s.eye);
    px(ctx, x + 9, y + 9, s.eye);
  } else {
    outlinedBox(ctx, x + 3, y + 5, 10, 10, s.skin, INK, true);
    rect(ctx, x + 4, y + 6, 8, 2, s.skinHi);
    if (f === 5) {
      rect(ctx, x + 4, y + 6, 8, 7, s.gear);
      rect(ctx, x + 5, y + 10, 6, 2, '#ffffff');
    } else if (f === 8 || f === 12) {
      rect(ctx, x + 4, y + 8, 8, 4, '#101824');
      rect(ctx, x + 5, y + 9, 6, 2, s.eye);
    } else {
      rect(ctx, x + 5, y + 9, 2, 2, s.eye);
      rect(ctx, x + 9, y + 9, 2, 2, s.eye);
      if (f === 1) rect(ctx, x + 6, y + 3, 4, 2, s.accent);
      if (f === 9) {
        rect(ctx, x + 6, y + 3, 4, 2, s.gear);
        rect(ctx, x + 4, y + 7, 8, 2, s.gear);
      }
      if (f === 10) {
        rect(ctx, x + 4, y + 12, 8, 3, s.gear);
      }
    }
  }
}

// ============================================================================
// 3. ALL 29 BESPOKE MUTATION CARDS + 24 ULTRA CARDS + 13 CROWNS
// ============================================================================

interface MutCardTheme {
  bg: string;
  bgHi: string;
  dark: string;
  fg: string;
  fgHi: string;
  accent: string;
  accentHi: string;
}

const MUTATION_THEMES: readonly MutCardTheme[] = [
  { bg: '#1b3320', bgHi: '#2f5737', dark: '#1e8530', fg: '#59ff73', fgHi: '#d4ffd9', accent: '#ffe047', accentHi: '#ffffff' }, // 0: Default Rad
  { bg: '#381820', bgHi: '#5c2633', dark: '#5e5669', fg: '#9e95ab', fgHi: '#e3dae8', accent: '#fff4d6', accentHi: '#ff3b4a' }, // 1: Rhino Skin
  { bg: '#182c3d', bgHi: '#2b4d69', dark: '#238236', fg: '#59e06e', fgHi: '#bfffc7', accent: '#f5c742', accentHi: '#ffffff' }, // 2: Extra Feet
  { bg: '#12331a', bgHi: '#22592f', dark: '#941c24', fg: '#e6323e', fgHi: '#cfd8e3', accent: '#59ff70', accentHi: '#e8ffdc' }, // 3: Plutonium Hunger
  { bg: '#332617', bgHi: '#543f26', dark: '#b3a99c', fg: '#f0e9de', fgHi: '#ffffff', accent: '#f5c742', accentHi: '#ff94b2' }, // 4: Rabbit Paw
  { bg: '#193020', bgHi: '#2c5438', dark: '#293347', fg: '#4f5d7a', fgHi: '#8a9bb8', accent: '#59ff73', accentHi: '#ffe047' }, // 5: Throne Butt
  { bg: '#1c3318', bgHi: '#32592b', dark: '#1f8530', fg: '#4de862', fgHi: '#baffc2', accent: '#f5c742', accentHi: '#fff8c4' }, // 6: Lucky Shot
  { bg: '#401018', bgHi: '#6b1b28', dark: '#8c1422', fg: '#e6293d', fgHi: '#ff8a96', accent: '#ffffff', accentHi: '#ffd6da' }, // 7: Bloodlust
  { bg: '#113616', bgHi: '#1f5e27', dark: '#249930', fg: '#6eff59', fgHi: '#deffd6', accent: '#ffe647', accentHi: '#ffffff' }, // 8: Gamma Guts
  { bg: '#3b1520', bgHi: '#632334', dark: '#a31c2c', fg: '#f2edf2', fgHi: '#ffffff', accent: '#ff384c', accentHi: '#ff9ea8' }, // 9: Second Stomach
  { bg: '#362717', bgHi: '#573e24', dark: '#874c2c', fg: '#d99364', fgHi: '#ffd2b0', accent: '#f5cc47', accentHi: '#fff4ad' }, // 10: Back Muscle
  { bg: '#26142b', bgHi: '#42224c', dark: '#968e82', fg: '#ebe5d8', fgHi: '#ffffff', accent: '#ff2b3d', accentHi: '#ffe047' }, // 11: Scarier Face
  { bg: '#211640', bgHi: '#39266b', dark: '#6d36b5', fg: '#b878ff', fgHi: '#f0dbff', accent: '#78f2ff', accentHi: '#ffffff' }, // 12: Euphoria
  { bg: '#1b2738', bgHi: '#2f4461', dark: '#8c5230', fg: '#d99668', fgHi: '#ffd1ad', accent: '#9cc7eb', accentHi: '#ffffff' }, // 13: Long Arms
  { bg: '#421710', bgHi: '#70281b', dark: '#8c1814', fg: '#e62e26', fgHi: '#ff7826', accent: '#ffe047', accentHi: '#ffffff' }, // 14: Boiling Veins
  { bg: '#381b17', bgHi: '#5e2e27', dark: '#8c1f19', fg: '#e64232', fgHi: '#ff9685', accent: '#f5cc47', accentHi: '#ffffff' }, // 15: Shotgun Shoulders
  { bg: '#193320', bgHi: '#2b5737', dark: '#1e8a38', fg: '#59e870', fgHi: '#c9ffd1', accent: '#f5cc47', accentHi: '#ffffff' }, // 16: Recycle Gland
  { bg: '#2b1330', bgHi: '#4c2154', dark: '#a83668', fg: '#ff73ab', fgHi: '#ffc9df', accent: '#ff244f', accentHi: '#ffffff' }, // 17: Laser Brain
  { bg: '#332814', bgHi: '#574422', dark: '#b37e14', fg: '#ffe047', fgHi: '#ffffff', accent: '#ff384c', accentHi: '#ff9ea8' }, // 18: Last Wish
  { bg: '#1a283b', bgHi: '#2e4666', dark: '#9e6c14', fg: '#f5c742', fgHi: '#fff6a6', accent: '#ff2e3d', accentHi: '#ffffff' }, // 19: Eagle Eyes
  { bg: '#381b14', bgHi: '#5e2e22', dark: '#945a38', fg: '#e6b58c', fgHi: '#fff0de', accent: '#ff5c26', accentHi: '#ffe647' }, // 20: Impact Wrists
  { bg: '#143320', bgHi: '#245737', dark: '#1d8a3a', fg: '#59ff7a', fgHi: '#d9ffe0', accent: '#e8e0cf', accentHi: '#ffffff' }, // 21: Bolt Marrow
  { bg: '#42121a', bgHi: '#701f2c', dark: '#941924', fg: '#ff3b47', fgHi: '#ffa8b0', accent: '#ffe047', accentHi: '#ffffff' }, // 22: Stress
  { bg: '#2e2118', bgHi: '#4f3829', dark: '#545f6e', fg: '#9aa8ba', fgHi: '#e8c492', accent: '#ff7b24', accentHi: '#fff280' }, // 23: Trigger Fingers
  { bg: '#38141d', bgHi: '#5e2131', dark: '#8c1424', fg: '#f2f0eb', fgHi: '#ffffff', accent: '#ff3347', accentHi: '#ff949e' }, // 24: Sharp Teeth
  { bg: '#191736', bgHi: '#2d295e', dark: '#7338a8', fg: '#c978ff', fgHi: '#f0d6ff', accent: '#59ff7a', accentHi: '#e6ffea' }, // 25: Patience
  { bg: '#2e2420', bgHi: '#4f3e37', dark: '#5e4f47', fg: '#b59d8a', fgHi: '#ede0d4', accent: '#ff8026', accentHi: '#ffe047' }, // 26: Hammerhead
  { bg: '#102838', bgHi: '#1d4561', dark: '#2a85b8', fg: '#78f2ff', fgHi: '#ffffff', accent: '#ff3d52', accentHi: '#ffa6b0' }, // 27: Strong Spirit
  { bg: '#261a3b', bgHi: '#432e66', dark: '#6d30a6', fg: '#cf7dff', fgHi: '#f5deff', accent: '#f5c742', accentHi: '#ffffff' }, // 28: Open Mind
  { bg: '#38141d', bgHi: '#5e2230', dark: '#75131f', fg: '#e62e42', fgHi: '#ff8f9a', accent: '#a8b5c4', accentHi: '#ffffff' }, // 29: Heavy Heart
];

/**
 * Hand-crafted 16x16 pixel-art mutation card illustrations (rendered with automatic 1px INK outline!).
 * Palette symbols: '1'=dark, '2'=fg, '3'=fgHi, '4'=accent, '5'=accentHi, 'w'=white.
 */
const MUTATION_GRIDS_16: Readonly<Record<number, readonly string[]>> = {
  0: [
    '....222..222....',
    '...2332..2332...',
    '...2222..2222...',
    '....22....22....',
    '......4444......',
    '.....45554......',
    '......4444......',
    '....11....11....',
    '...1221..1221...',
    '..12332..23321..',
    '...1222..2221...',
  ],
  1: [
    // RHINO SKIN: unmistakable armored charging rhino head with sweeping curved ivory horn!
    '...........44...',
    '..........44w...',
    '.........444....',
    '..23.....444....',
    '.2332222..44....',
    '233322222444....',
    '2322233222444...',
    '2221225522224...',
    '2211222222222...',
    '1211122222211...',
    '.11111222111....',
    '..11111111......',
  ],
  2: [
    // EXTRA FEET: winged sprint boot with sweeping golden wings!
    '544....332......',
    '.544..3322......',
    '..544.3222......',
    '...5442221......',
    '....442221......',
    '......2221......',
    '.....232211.....',
    '.....23222233...',
    '.....222222332..',
    '.....111111111..',
  ],
  3: [
    // PLUTONIUM HUNGER: crimson U-magnet pulling glowing green rad orb!
    '.333........333.',
    '.333...54...333.',
    '.222..5444..222.',
    '.222..4444..222.',
    '.222...44...222.',
    '.221........122.',
    '.221........122.',
    '..221......122..',
    '...2221111222...',
    '....12222221....',
    '......1111......',
  ],
  4: [
    // RABBIT PAW: golden clasp + fluffy white lucky rabbit foot charm with pink paw pads!
    '......444.......',
    '.....45.44......',
    '......444.......',
    '.....33322......',
    '....33www22.....',
    '...33wwwww21....',
    '...33ww55w21....',
    '..33ww5555w21...',
    '..32w55ww5521...',
    '..322wwwwww21...',
    '...21.2221.11...',
    '...1...11.......',
  ],
  5: [
    // THRONE BUTT: obsidian crowned throne monolith + golden spire + glowing emerald rad core!
    '..5...555...5...',
    '..55..545..55...',
    '..33335553333...',
    '..32222222221...',
    '.3321444441211..',
    '.32214www41221..',
    '.32214w4w41221..',
    '.3221444441221..',
    '.3222111112221..',
    '..22224442221...',
    '..11111111111...',
  ],
  6: [
    // LUCKY SHOT: 4-leaf clover + gleaming brass bullet across center!
    '...332....332...',
    '..33222..22221..',
    '..322224422211..',
    '...2224554211...',
    '.....245421.....',
    '...3324542221...',
    '..332244422211..',
    '..32224442211...',
    '...221444111....',
    '......141.......',
    '......11........',
  ],
  7: [
    // BLOODLUST: sculpted crimson heart + sharp dripping white vampire fangs!
    '..3322....3322..',
    '.333222..222221.',
    '.33222222222211.',
    '.32444222244411.',
    '.224w422224w411.',
    '..224422224411..',
    '...2242222411...',
    '....22222211....',
    '.....222211.....',
    '......2211......',
    '.......11.......',
  ],
  8: [
    // GAMMA GUTS: glowing lime radiation stomach & ribs!
    '.....4....4.....',
    '...333222233....',
    '..33322222221...',
    '..32255555221...',
    '.3322222222211..',
    '.3225555552211..',
    '.3222233322211..',
    '..22555555211...',
    '..22223322211...',
    '...122222211....',
    '.....11111......',
  ],
  9: [
    // SECOND STOMACH: crisp white medkit pouch with bold crimson cross!
    '....33333333....',
    '...3w33333321...',
    '..3ww334433221..',
    '..3w3334433221..',
    '..333444544321..',
    '..333444544321..',
    '..333334433221..',
    '..223334433221..',
    '...2222222221...',
    '....11111111....',
  ],
  10: [
    // BACK MUSCLE: flexing muscular shoulders + golden ammo crate!
    '....45555544....',
    '....44544544....',
    '....44444444....',
    '..333222222111..',
    '.33322222222111.',
    '.33221222212211.',
    '.32221222212211.',
    '..222221122221..',
    '...2222112221...',
    '....11111111....',
  ],
  11: [
    // SCARIER FACE: furious screaming skull mask with red eyes & wide jagged fangs!
    '....33333333....',
    '...33wwwww221...',
    '..33wwwwwww221..',
    '..32444w444221..',
    '..32454w454221..',
    '..2222w.w22211..',
    '...222www2211...',
    '..22.3.3.3.3.1..',
    '..22.........1..',
    '...2.3.3.3.31...',
    '....11111111....',
  ],
  12: [
    // EUPHORIA: cosmic swirling slow-motion bullet vortex!
    '....33333322....',
    '..333222222211..',
    '.3322..444..211.',
    '.322.455554..21.',
    '.32.45544544.21.',
    '.32.45433454.21.',
    '.32..445554..21.',
    '.221...44...211.',
    '..2211....1221..',
    '....11222211....',
  ],
  13: [
    // LONG ARMS: reaching muscular arm swinging gleaming long katana slash!
    '..........555...',
    '.........5544...',
    '........5544....',
    '.......5544.....',
    '......5544......',
    '.....5544.......',
    '....5444........',
    '..33344.........',
    '.33222232.......',
    '332222221.......',
    '12222111........',
  ],
  14: [
    // BOILING VEINS: blazing volcanic heart with molten veins & flames!
    '......54........',
    '.....5544..4....',
    '....45444.44....',
    '..33245422332...',
    '.3322242222221..',
    '.3224542244221..',
    '.2244224542211..',
    '..22224422211...',
    '...224422211....',
    '....2222211.....',
    '.....11111......',
  ],
  15: [
    // SHOTGUN SHOULDERS: twin red shotgun shells with brass bases + ricochet glints!
    '..3322....3322..',
    '..3221....3221..',
    '..3221....3221..',
    '..3221....3221..',
    '..3221....3221..',
    '..3221....3221..',
    '..5444....5444..',
    '..5444....5444..',
    '.....5....5.....',
    '....555..555....',
  ],
  16: [
    // RECYCLE GLAND: emerald 3-arrow recycling ring + gleaming golden bullet!
    '....33333322....',
    '...3322222221...',
    '..332..54..221..',
    '..32..5444..21..',
    '..32..5444..21..',
    '..32..4444..21..',
    '..221.4444.121..',
    '...221....122...',
    '...3322222221...',
    '....11111111....',
  ],
  17: [
    // LASER BRAIN: sculpted folded pink brain firing blazing crimson/white laser beam!
    '..333322........',
    '.33233322.......',
    '.321232221......',
    '3322212244444444',
    '3212222455555555',
    '3222122244444444',
    '.22122221.......',
    '.21221221.......',
    '..111111........',
  ],
  18: [
    // LAST WISH: radiant 4-point golden star cradling a crimson full-heal heart!
    '.......3........',
    '......332.......',
    '......322.......',
    '.....33222......',
    '333332454222211.',
    '.2222444442211..',
    '.....244421.....',
    '......2421......',
    '......221.......',
    '.......1........',
  ],
  19: [
    // EAGLE EYES: fierce golden hawk eye + red sniper crosshair!
    '.......4........',
    '....3334333.....',
    '..33322422211...',
    '.3322455542211..',
    '4444245w5424444.',
    '.2222455542211..',
    '..22222422211...',
    '....1114111.....',
    '.......4........',
  ],
  20: [
    // IMPACT WRISTS: clenched gauntlet fist slamming into blazing kinetic shockwave!
    '..........54....',
    '...33332...544..',
    '..3323232...544.',
    '.332222221..544.',
    '.322222221.5544.',
    '.322222221..544.',
    '.222111111..544.',
    '..2211111...54..',
    '..........54....',
  ],
  21: [
    // BOLT MARROW: curving homing green crossbow bolt with gleaming arrowhead!
    '..........33....',
    '..........332...',
    '....5444443322..',
    '..5444444433222.',
    '.544......3322..',
    '44........332...',
    '4.........33....',
    '4...............',
  ],
  22: [
    // STRESS: crimson pulsing heart split by jagged electric yellow lightning!
    '..3322..543322..',
    '.33322255422221.',
    '.33222554222211.',
    '.32225544422211.',
    '.2222225542211..',
    '..22225542211...',
    '...225542211....',
    '....2542211.....',
    '.....42211......',
    '......111.......',
  ],
  23: [
    // TRIGGER FINGERS: gloved finger pulling steel trigger + muzzle spark burst!
    '..2222222222.54.',
    '.233333333215544',
    '.22222222221.54.',
    '.221..333..1....',
    '.221..33221.....',
    '.221...321......',
    '.221..221.......',
    '.2211111........',
    '.11111..........',
  ],
  24: [
    // SHARP TEETH: snarling jagged white fangs over furious crimson shockwave!
    '..444444444444..',
    '.45544444444441.',
    '.43w3.3w3.3w3.1.',
    '.42w2.2w2.2w2.1.',
    '.4.2...2...2..1.',
    '.4...2...2....1.',
    '.4..2w2.2w2.2.1.',
    '.4..3w3.3w3.3.1.',
    '.44444444444441.',
    '..111111111111..',
  ],
  25: [
    // PATIENCE: ornate amethyst hourglass with luminous emerald sand!
    '..333333333322..',
    '..222222222211..',
    '...3244444421...',
    '....32455421....',
    '.....324421.....',
    '......3451......',
    '.....324421.....',
    '....32455421....',
    '...3244444421...',
    '..333333333322..',
    '..111111111111..',
  ],
  26: [
    // HAMMERHEAD: heavy iron ram smashing through cracked brick sparks!
    '..333333333322..',
    '.33322222222211.',
    '.32222222222211.',
    '.22211111111111.',
    '.....45..54.....',
    '....45422454....',
    '...45.2321.54...',
    '......2321......',
    '......2221......',
    '......1111......',
  ],
  27: [
    // STRONG SPIRIT: radiant cyan guardian halo + spirit wings over crimson heart!
    '....33333333....',
    '..332222222222..',
    '....22222222....',
    '.33..........33.',
    '332.544..444.233',
    '3224544444444223',
    '.22444444444422.',
    '...4444444444...',
    '....44444444....',
    '.....444444.....',
    '......4444......',
  ],
  28: [
    // OPEN MIND: mystical radiant violet third eye hovering over golden treasure chest!
    '.....333333.....',
    '...3322ww2233...',
    '..322w2442w221..',
    '...3322ww2221...',
    '.....111111.....',
    '..444444444444..',
    '..455555555544..',
    '..444445544444..',
    '..444444444444..',
    '..111111111111..',
  ],
  29: [
    // HEAVY HEART: armored steel-banded crimson heart + twin gun barrels!
    '..3322....3322..',
    '.333222..222221.',
    '5444444444444445',
    '4444224554224444',
    '.32222455422211.',
    '..222244442211..',
    '...2222222211...',
    '....22222211....',
    '.....222211.....',
    '......1111......',
  ],
};

function drawMutationEmblem(ctx: DrawCtx, cx: number, cy: number, idx: number, t: MutCardTheme, compact: boolean): void {
  const palette: Record<string, string> = {
    '1': t.dark,
    '2': t.fg,
    '3': t.fgHi,
    '4': t.accent,
    '5': t.accentHi,
    w: '#ffffff',
  };

  if (!compact) {
    const grid = MUTATION_GRIDS_16[idx] ?? MUTATION_GRIDS_16[0]!;
    const gh = grid.length;
    const gw = grid[0]!.length;
    drawPixelGrid(ctx, cx - Math.floor(gw / 2), cy - Math.floor(gh / 2), grid, palette, 1, INK);
    return;
  }

  // Compact 16x16 HUD icons: ultra-crisp 10x10..11x11 centered pixel silhouettes with 1px dark outline
  switch (idx) {
    case 1: // Rhino Skin: mini armored rhino head + curved horn
      outlinedBox(ctx, cx - 5, cy - 1, 8, 5, t.fg, INK, true);
      rect(ctx, cx - 4, cy, 5, 1, t.fgHi);
      outlinedTrapezoid(ctx, cx + 3, cy - 5, 2, 4, 5, t.accent, INK);
      px(ctx, cx, cy, t.accentHi);
      break;
    case 2: // Extra Feet: winged boot
      outlinedBox(ctx, cx - 2, cy - 4, 4, 7, t.fg, INK);
      outlinedBox(ctx, cx - 2, cy + 1, 7, 3, t.fgHi, INK);
      rect(ctx, cx - 5, cy - 3, 3, 2, t.accent);
      break;
    case 3: // Plutonium Hunger: U-magnet + rad
      outlinedBox(ctx, cx - 4, cy - 4, 9, 8, t.fg, INK, true);
      rect(ctx, cx - 2, cy - 4, 5, 5, t.bg);
      rect(ctx, cx - 4, cy - 4, 2, 2, t.fgHi);
      rect(ctx, cx + 3, cy - 4, 2, 2, t.fgHi);
      fillPixelEllipse(ctx, cx, cy - 2, 2, 2, t.accent);
      break;
    case 4: // Rabbit Paw: fluffy paw + gold clasp
      outlinedEllipse(ctx, cx, cy + 1, 4, 4, t.fg, INK);
      rect(ctx, cx - 1, cy - 5, 3, 3, t.accent);
      px(ctx, cx - 2, cy + 1, t.accentHi);
      px(ctx, cx + 1, cy + 1, t.accentHi);
      px(ctx, cx, cy - 1, '#ffffff');
      break;
    case 5: // Throne Butt: crowned obsidian throne + green core
      outlinedBox(ctx, cx - 4, cy - 4, 9, 9, t.fg, INK, true);
      rect(ctx, cx - 3, cy - 5, 7, 2, t.accentHi);
      rect(ctx, cx - 2, cy - 1, 5, 4, t.accent);
      px(ctx, cx, cy, '#ffffff');
      break;
    case 11: // Scarier Face: fierce red-eyed skull
      outlinedEllipse(ctx, cx, cy - 1, 4, 4, t.fg, INK);
      rect(ctx, cx - 3, cy - 2, 2, 2, t.accent);
      rect(ctx, cx + 1, cy - 2, 2, 2, t.accent);
      rect(ctx, cx - 3, cy + 2, 6, 2, INK);
      px(ctx, cx - 2, cy + 2, '#ffffff');
      px(ctx, cx + 1, cy + 2, '#ffffff');
      break;
    case 13: // Long Arms: extended arm + gleaming sword
      outlinedBox(ctx, cx - 5, cy + 1, 6, 3, t.fg, INK);
      drawPixelLine(ctx, cx - 1, cy + 1, cx + 4, cy - 4, INK, 3);
      drawPixelLine(ctx, cx - 1, cy + 1, cx + 4, cy - 4, '#ffffff', 1);
      break;
    case 17: // Laser Brain: pink brain + red laser beam
      outlinedEllipse(ctx, cx - 2, cy, 4, 3, t.fg, INK);
      rect(ctx, cx - 1, cy - 1, 7, 3, t.accent);
      rect(ctx, cx, cy, 5, 1, '#ffffff');
      break;
    case 23: // Trigger Fingers: steel trigger + muzzle spark
      outlinedBox(ctx, cx - 5, cy - 4, 8, 3, t.fg, INK);
      outlinedBox(ctx, cx - 2, cy - 1, 4, 5, t.fgHi, INK);
      rect(ctx, cx + 3, cy - 4, 3, 3, t.accent);
      px(ctx, cx + 4, cy - 3, t.accentHi);
      break;
    case 27: // Strong Spirit: cyan halo + crimson heart
      outlinedEllipse(ctx, cx, cy - 3, 4, 2, t.fg, INK);
      rect(ctx, cx - 2, cy - 3, 4, 1, t.bg);
      outlinedEllipse(ctx, cx, cy + 2, 3, 3, t.accent, INK);
      px(ctx, cx - 1, cy + 1, t.accentHi);
      break;
    default: {
      // Crisp 3-tone scaled fallback for remaining HUD icons
      const grid = MUTATION_GRIDS_16[idx] ?? MUTATION_GRIDS_16[0]!;
      const gh = grid.length;
      const gw = grid[0]!.length;
      // Downsample 16x12 cleanly into 10x10 centered box with priority on accent/highlight pixels
      const dstW = 10;
      const dstH = 10;
      const ox = cx - 5;
      const oy = cy - 5;
      for (let dy = 0; dy < dstH; dy++) {
        const sy = Math.min(gh - 1, Math.floor((dy * gh) / dstH));
        for (let dx = 0; dx < dstW; dx++) {
          const sx = Math.min(gw - 1, Math.floor((dx * gw) / dstW));
          const ch = grid[sy]![sx];
          if (ch && ch !== '.' && ch !== ' ') {
            const col = palette[ch];
            if (col) px(ctx, ox + dx, oy + dy, col);
          }
        }
      }
      break;
    }
  }
}

function registerSkillAndCrownSprites(b: FallbackAtlasBuilder): void {
  // 29 Bespoke Mutation Cards: sprSkillIcon (24x32, 30 frames) & sprSkillIconHUD (16x16, 30 frames)
  b.addSprite('sprSkillIcon', 24, 32, 12, 16, 30, (ctx, x, y, w, h, f) => {
    const t = MUTATION_THEMES[f % MUTATION_THEMES.length]!;
    outlinedBox(ctx, x + 1, y + 1, w - 2, h - 2, t.bg, INK, true);
    // Atmospheric card spotlight & metallic top/bottom trim
    fillPixelEllipse(ctx, x + 12, y + 16, 9, 10, t.bgHi);
    rect(ctx, x + 2, y + 2, w - 4, 2, t.bgHi);
    rect(ctx, x + 2, y + h - 4, w - 4, 2, '#100c14');
    // Ornate corner frame accents
    rect(ctx, x + 2, y + 2, w - 4, 1, t.fg);
    rect(ctx, x + 2, y + h - 3, w - 4, 1, t.dark);
    px(ctx, x + 2, y + 2, t.fgHi);
    px(ctx, x + w - 3, y + 2, t.fgHi);
    drawMutationEmblem(ctx, x + 12, y + 16, f, t, false);
  });

  b.addSprite('sprSkillIconHUD', 16, 16, 8, 8, 30, (ctx, x, y, w, h, f) => {
    const t = MUTATION_THEMES[f % MUTATION_THEMES.length]!;
    outlinedBox(ctx, x + 1, y + 1, w - 2, h - 2, t.bg, INK);
    rect(ctx, x + 2, y + 2, w - 4, 1, t.fg);
    drawMutationEmblem(ctx, x + 8, y + 8, f, t, true);
  });

  // 24 Bespoke Ultra Mutation Cards (sprEGSkillIcon 24x32x24 & sprEGIconHUD 16x16x24)
  b.addSprite('sprEGSkillIcon', 24, 32, 12, 16, 24, (ctx, x, y, w, h, f) => {
    const mutantIdx = Math.floor(f / 2);
    const isSlotB = f % 2 === 1;
    const bust = BUST_STYLES_24[mutantIdx * 2 + (isSlotB ? 1 : 0)]!;
    outlinedBox(ctx, x + 1, y + 1, w - 2, h - 2, '#2e2214', '#ffe047', true);
    rect(ctx, x + 2, y + 2, w - 4, h - 4, bust.bgBot);
    fillPixelEllipse(ctx, x + 12, y + 15, 9, 11, bust.bgTop);
    rect(ctx, x + 2, y + 2, w - 4, 2, '#ffe047');
    rect(ctx, x + 2, y + h - 4, w - 4, 2, '#c98e1c');
    // Glowing golden Ultra gem star + mutant-colored faceted crystal core
    outlinedDiamond(ctx, x + 12, y + 15, 7, 8, bust.skin, INK);
    fillDiamond(ctx, x + 11, y + 14, 4, 5, bust.skinHi);
    rect(ctx, x + 11, y + 6, 2, 18, isSlotB ? '#ff78d4' : '#ffe047');
    rect(ctx, x + 4, y + 14, 16, 2, isSlotB ? '#ff78d4' : '#ffe047');
    rect(ctx, x + 10, y + 13, 4, 4, '#ffffff');
  });

  b.addSprite('sprEGIconHUD', 16, 16, 8, 8, 24, (ctx, x, y, w, h, f) => {
    const mutantIdx = Math.floor(f / 2);
    const isSlotB = f % 2 === 1;
    const bust = BUST_STYLES_24[mutantIdx * 2 + (isSlotB ? 1 : 0)]!;
    outlinedBox(ctx, x + 1, y + 1, w - 2, h - 2, bust.bgTop, '#ffe047');
    fillDiamond(ctx, x + 8, y + 8, 4, 4, bust.skin);
    rect(ctx, x + 7, y + 3, 2, 10, isSlotB ? '#ff78d4' : '#ffe047');
    rect(ctx, x + 3, y + 7, 10, 2, isSlotB ? '#ff78d4' : '#ffe047');
    rect(ctx, x + 7, y + 7, 2, 2, '#ffffff');
  });
  b.addAlias('sprUltraIcon', 'sprEGSkillIcon');

  // 13 Distinct Floating Crowns (sprCrown1Idle/Walk .. sprCrown13Idle/Walk)
  const crownSpecs: ReadonlyArray<{ metal: string; hi: string; dark: string; gem: string; tall?: boolean }> = [
    { metal: '#8c7a66', hi: '#bfae99', dark: '#4d4136', gem: '#c9c2b8' }, // 1: None
    { metal: '#595261', hi: '#8c8396', dark: '#2c2733', gem: '#ff3838', tall: true }, // 2: Death
    { metal: '#e8b835', hi: '#fff28a', dark: '#946612', gem: '#ff385c' }, // 3: Life
    { metal: '#cfd8e3', hi: '#ffffff', dark: '#738294', gem: '#ffe047' }, // 4: Haste
    { metal: '#d9a432', hi: '#ffe378', dark: '#7d5211', gem: '#ff8826' }, // 5: Guns
    { metal: '#3d3347', hi: '#705e82', dark: '#1c1524', gem: '#59ff73', tall: true }, // 6: Hatred
    { metal: '#b82532', hi: '#ff596a', dark: '#5e0e18', gem: '#ffffff', tall: true }, // 7: Blood
    { metal: '#d4ab42', hi: '#fff08a', dark: '#7a5916', gem: '#b866ff', tall: true }, // 8: Destiny
    { metal: '#eb88a8', hi: '#ffd4e3', dark: '#943c5c', gem: '#ffe047' }, // 9: Love
    { metal: '#e6b835', hi: '#fff28a', dark: '#8c6111', gem: '#4df068' }, // 10: Luck
    { metal: '#7c32b8', hi: '#cf78ff', dark: '#3b1261', gem: '#ff52c2', tall: true }, // 11: Curses
    { metal: '#c94032', hi: '#ff8570', dark: '#6e1914', gem: '#ffe047' }, // 12: Risk
    { metal: '#8a99ad', hi: '#d6e3f2', dark: '#455161', gem: '#6ef2ff' }, // 13: Protection
  ];
  for (let c = 1; c <= 13; c++) {
    const cs = crownSpecs[c - 1]!;
    const drawCrown = (ctx: DrawCtx, x: number, y: number, f: number, walk: boolean): void => {
      const bob = (walk ? (f & 1) : 0) + (f === 1 ? -1 : 0);
      const cy = y + 3 + bob;
      // Tapered gleaming metallic crown band
      outlinedTrapezoid(ctx, x + 8, cy + 4, 13, 11, 5, cs.metal, INK);
      rect(ctx, x + 3, cy + 5, 10, 2, cs.hi);
      rect(ctx, x + 3, cy + 7, 10, 1, cs.dark);
      // 3 distinct sculpted crown spires
      const spireH = cs.tall ? 5 : 4;
      outlinedTrapezoid(ctx, x + 3, cy + 5 - spireH, 1, 4, spireH, cs.metal, INK);
      outlinedTrapezoid(ctx, x + 8, cy + 4 - spireH, 2, 4, spireH + 1, cs.hi, INK);
      outlinedTrapezoid(ctx, x + 13, cy + 5 - spireH, 1, 4, spireH, cs.dark, INK);
      // Center glowing jewel + specular pixel
      rect(ctx, x + 7, cy + 5, 2, 3, cs.gem);
      px(ctx, x + 7, cy + 5, '#ffffff');
    };
    b.addSprite(`sprCrown${c}Idle`, 16, 14, 8, 7, 2, (ctx, x, y, _w, _h, f) => drawCrown(ctx, x, y, f, false));
    b.addSprite(`sprCrown${c}Walk`, 16, 14, 8, 7, 2, (ctx, x, y, _w, _h, f) => drawCrown(ctx, x, y, f, true));
  }
}

// ============================================================================
// 4. HUD, HEALTH BAR/FILL (EXACT POLARITY), RAD VIAL, CROSSHAIRS, AMMO ICONS
// ============================================================================

function registerHudSprites(b: FallbackAtlasBuilder): void {
  // sprHealthBar: 88x14, orig=(0,0) ornate dark steel beveled frame with recessed crimson inner well (3,3,82,8)
  b.addSprite('sprHealthBar', 88, 14, 0, 0, 1, (ctx, x, y, w, h) => {
    outlinedBox(ctx, x, y, w, h, '#383445', INK);
    rect(ctx, x + 1, y + 1, w - 2, 2, '#6d6682');
    rect(ctx, x + 1, y + h - 3, w - 2, 2, '#1f1b29');
    px(ctx, x + 2, y + 2, '#c4bed6');
    px(ctx, x + w - 3, y + 2, '#c4bed6');
    px(ctx, x + 2, y + h - 3, '#100d14');
    px(ctx, x + w - 3, y + h - 3, '#100d14');
    rect(ctx, x + 2, y + 2, w - 4, h - 4, INK);
    rect(ctx, x + 3, y + 3, w - 6, h - 6, '#291219');
    rect(ctx, x + 3, y + 3, w - 6, 1, '#1a0a0f');
  });

  // sprHealthFill: 1x8, orig=(0,0), 11 frames — EXACT verified polarity!
  // frame 0 = PURE WHITE (255,255,255) hurt flash
  // frame 1 = CRIMSON-ORANGE rgb(252, 56, 0) normal fill!
  // frame 2 = dark crimson, frames 3..10 = progressive shaded health states
  b.addSprite('sprHealthFill', 1, 8, 0, 0, 11, (ctx, x, y, _w, h, f) => {
    if (f === 0) {
      rect(ctx, x, y, 1, h, '#ffffff');
      return;
    }
    if (f === 1) {
      rect(ctx, x, y, 1, 1, '#ff7744');
      rect(ctx, x, y + 1, 1, 5, 'rgb(252, 56, 0)');
      rect(ctx, x, y + 6, 1, 2, '#b82000');
      return;
    }
    if (f === 2) {
      rect(ctx, x, y, 1, 2, '#bf2618');
      rect(ctx, x, y + 2, 1, 4, '#8c140e');
      rect(ctx, x, y + 6, 1, 2, '#590a08');
      return;
    }
    const tones = ['#e02c10', '#cc2018', '#b81c22', '#ff4d1a', '#ff7026', '#59ff73', '#6ef2ff', '#ffe047'];
    const c = tones[(f - 3) % tones.length]!;
    rect(ctx, x, y, 1, h, c);
    px(ctx, x, y, '#ffffff');
  });

  // sprExpBar: 14x24, orig=(0,0), 16 frames glass rad vial filling bottom -> top
  b.addSprite('sprExpBar', 14, 24, 0, 0, 16, (ctx, x, y, w, h, f) => {
    outlinedBox(ctx, x, y, w, h, '#2c333d', INK, true);
    rect(ctx, x + 2, y + 1, w - 4, 2, '#697585');
    rect(ctx, x + 2, y + h - 3, w - 4, 2, '#4a5461');
    rect(ctx, x + 2, y + 3, 10, 18, '#121c17');
    const fillH = Math.round((f / 15) * 18);
    if (fillH > 0) {
      const fy = y + 21 - fillH;
      rect(ctx, x + 2, fy, 10, fillH, '#26ba43');
      rect(ctx, x + 4, fy, 6, fillH, '#5eff70');
      rect(ctx, x + 2, fy, 10, 1, '#c4ffc9');
      if (fillH >= 5) {
        px(ctx, x + 6, fy + 3, '#ffffff');
      }
    }
    rect(ctx, x + 3, y + 4, 1, 16, 'rgba(255, 255, 255, 0.35)');
  });

  // sprExpBarLevel: 14x24, orig=(0,0), 1 frame pulsing golden/lime ready frame
  b.addSprite('sprExpBarLevel', 14, 24, 0, 0, 1, (ctx, x, y, w, h) => {
    rect(ctx, x, y, w, 2, '#ffe047');
    rect(ctx, x, y + h - 2, w, 2, '#ffe047');
    rect(ctx, x, y, 2, h, '#ffe047');
    rect(ctx, x + w - 2, y, 2, h, '#ffe047');
    rect(ctx, x + 2, y + 3, 10, 18, 'rgba(168, 255, 110, 0.45)');
  });

  // sprCrosshair: 16x16, orig=(8,8), 9 crisp dark-outlined white reticle styles (matching NT 0..8)
  b.addSprite('sprCrosshair', 16, 16, 8, 8, 9, (ctx, x, y, _w, _h, f) => {
    const cx = x + 8;
    const cy = y + 8;
    const drawArm = (ax: number, ay: number, aw: number, ah: number): void => {
      rect(ctx, ax - 1, ay - 1, aw + 2, ah + 2, INK);
      rect(ctx, ax, ay, aw, ah, '#ffffff');
    };
    switch (f) {
      case 0:
        drawArm(cx - 6, cy, 4, 1);
        drawArm(cx + 3, cy, 4, 1);
        drawArm(cx, cy - 6, 1, 4);
        drawArm(cx, cy + 3, 1, 4);
        drawArm(cx, cy, 1, 1);
        break;
      case 1:
        outlinedEllipse(ctx, cx, cy, 5, 5, '#ffffff', INK);
        ctx.clearRect(cx - 3, cy - 3, 7, 7);
        drawArm(cx, cy, 1, 1);
        break;
      case 2:
        drawArm(cx - 6, cy - 6, 4, 1); drawArm(cx - 6, cy - 6, 1, 4);
        drawArm(cx + 3, cy - 6, 4, 1); drawArm(cx + 6, cy - 6, 1, 4);
        drawArm(cx - 6, cy + 6, 4, 1); drawArm(cx - 6, cy + 3, 1, 4);
        drawArm(cx + 3, cy + 6, 4, 1); drawArm(cx + 6, cy + 3, 1, 4);
        drawArm(cx, cy, 1, 1);
        break;
      case 3:
        for (let d = 2; d <= 5; d++) {
          drawArm(cx - d, cy - d, 1, 1);
          drawArm(cx + d, cy - d, 1, 1);
          drawArm(cx - d, cy + d, 1, 1);
          drawArm(cx + d, cy + d, 1, 1);
        }
        break;
      case 4:
        drawArm(cx - 6, cy, 5, 1);
        drawArm(cx + 2, cy, 5, 1);
        drawArm(cx, cy - 6, 1, 5);
        drawArm(cx, cy + 2, 1, 5);
        break;
      case 5:
        for (let d = 0; d <= 4; d++) {
          drawArm(cx - 4 + d, cy - d, 1, 1);
          drawArm(cx + 4 - d, cy - d, 1, 1);
          drawArm(cx - 4 + d, cy + d, 1, 1);
          drawArm(cx + 4 - d, cy + d, 1, 1);
        }
        drawArm(cx, cy, 1, 1);
        break;
      case 6:
        drawArm(cx - 5, cy - 5, 11, 1);
        drawArm(cx - 5, cy + 5, 11, 1);
        drawArm(cx - 5, cy - 4, 1, 9);
        drawArm(cx + 5, cy - 4, 1, 9);
        drawArm(cx, cy, 1, 1);
        break;
      case 7:
        // Compact precision center pip (classic NT minimal dot)
        drawArm(cx - 1, cy - 1, 3, 3);
        break;
      default:
        // Tactical twin-chevron side brackets with center dot
        drawArm(cx - 6, cy - 3, 1, 7);
        drawArm(cx - 5, cy - 3, 2, 1);
        drawArm(cx - 5, cy + 3, 2, 1);
        drawArm(cx + 6, cy - 3, 1, 7);
        drawArm(cx + 4, cy - 3, 2, 1);
        drawArm(cx + 4, cy + 3, 2, 1);
        drawArm(cx, cy, 1, 1);
        break;
    }
  });

  // Crisp outlined 8-frame draining Ammo Icons (10x10; frame 0 = FULL -> frame 7 = EMPTY, matching NT polarity!)
  const drawDrainingOverlay = (ctx: DrawCtx, x: number, y: number, f: number): void => {
    if (f <= 0) return;
    // Progressively darken top rows as ammo depletes (f=1..7)
    const emptyRows = Math.min(8, Math.ceil((f / 7) * 8));
    ctx.save();
    ctx.fillStyle = f >= 7 ? 'rgba(10, 8, 16, 0.82)' : 'rgba(12, 9, 18, 0.68)';
    ctx.fillRect(x + 1, y + 1, 8, emptyRows);
    ctx.restore();
  };

  b.addSprite('sprBulletIcon', 10, 10, 5, 5, 8, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 3, y + 1, 4, 8, '#f2c138', INK, true);
    rect(ctx, x + 4, y + 2, 2, 2, '#fff7b2');
    rect(ctx, x + 4, y + 6, 2, 2, '#9e6b14');
    drawDrainingOverlay(ctx, x, y, f);
  });
  b.addSprite('sprShotIcon', 10, 10, 5, 5, 8, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 2, y + 1, 6, 8, '#e0342b', INK);
    rect(ctx, x + 3, y + 2, 2, 4, '#ff786e');
    rect(ctx, x + 3, y + 6, 4, 2, '#f5c742');
    drawDrainingOverlay(ctx, x, y, f);
  });
  b.addAlias('sprShellIcon', 'sprShotIcon');
  b.addSprite('sprBoltIcon', 10, 10, 5, 5, 8, (ctx, x, y, _w, _h, f) => {
    rect(ctx, x + 1, y + 4, 8, 3, INK);
    rect(ctx, x + 2, y + 5, 6, 1, '#59ff70');
    outlinedBox(ctx, x + 5, y + 2, 4, 6, '#3be057', INK, true);
    px(ctx, x + 7, y + 4, '#ffffff');
    drawDrainingOverlay(ctx, x, y, f);
  });
  b.addSprite('sprExploIcon', 10, 10, 5, 5, 8, (ctx, x, y, _w, _h, f) => {
    outlinedEllipse(ctx, x + 5, y + 5, 3, 3, '#ff7824', INK);
    rect(ctx, x + 4, y + 1, 2, 3, '#788594');
    px(ctx, x + 6, y + 1, '#ffe047');
    drawDrainingOverlay(ctx, x, y, f);
  });
  b.addSprite('sprEnergyIcon', 10, 10, 5, 5, 8, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 2, y + 1, 6, 8, '#3ba6ff', INK, true);
    rect(ctx, x + 4, y + 2, 3, 3, '#ffffff');
    rect(ctx, x + 3, y + 5, 3, 3, '#9cf5ff');
    drawDrainingOverlay(ctx, x, y, f);
  });
  // sprRogueAmmoHUD: 11x16, 4 frames (0 = empty, 1..3 = lit portal strike canisters, matching NT!)
  b.addSprite('sprRogueAmmoHUD', 11, 16, 1, 1, 4, (ctx, x, y, _w, _h, f) => {
    outlinedBox(ctx, x + 1, y + 1, 9, 14, '#1b2436', INK, true);
    rect(ctx, x + 2, y + 2, 7, 1, '#5a6e8c');
    for (let slot = 0; slot < 3; slot++) {
      const sy = y + 11 - slot * 3;
      const lit = slot < f;
      rect(ctx, x + 3, sy, 5, 2, lit ? '#3da6ff' : '#263042');
      if (lit) {
        rect(ctx, x + 4, sy, 3, 1, '#b8f7ff');
      }
    }
  });
  b.addSprite('sprAmmoIcons', 10, 10, 5, 5, 6, (ctx, x, y, _w, _h, f) => {
    const cols = ['#f2c138', '#e0342b', '#4df068', '#ff7824', '#4dc8ff', '#d6dde6'];
    outlinedBox(ctx, x + 2, y + 2, 6, 6, cols[f % cols.length]!, INK, true);
    px(ctx, x + 3, y + 3, '#ffffff');
  });
  b.addSprite('sprKillsIcon', 10, 10, 5, 5, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 1, y + 1, 8, 6, '#f0ece4', INK, true);
    outlinedBox(ctx, x + 2, y + 6, 6, 3, '#d6cfc2', INK);
    rect(ctx, x + 3, y + 3, 2, 2, INK);
    rect(ctx, x + 6, y + 3, 2, 2, INK);
    px(ctx, x + 4, y + 7, INK);
    px(ctx, x + 6, y + 7, INK);
  });
  b.addSprite('sprGameOverSkull', 8, 6, 4, 3, 1, (ctx, x, y) => {
    outlinedBox(ctx, x, y, 8, 5, '#f0ece4', INK, true);
    rect(ctx, x + 2, y + 4, 4, 2, '#d6cfc2');
    px(ctx, x + 2, y + 2, INK);
    px(ctx, x + 5, y + 2, INK);
  });
  b.addSprite('sprGameOverThrone', 9, 8, 4, 4, 1, (ctx, x, y) => {
    outlinedBox(ctx, x + 1, y, 7, 8, '#38466e', INK);
    rect(ctx, x + 2, y + 1, 5, 2, '#f0c452');
    rect(ctx, x + 3, y + 3, 3, 3, '#4dff75');
    px(ctx, x + 4, y + 4, '#ffffff');
  });
  b.addSprite('sprMapDot', 3, 3, 1, 1, 1, (ctx, x, y) => {
    rect(ctx, x, y, 3, 3, '#e6e6eb');
    px(ctx, x + 1, y + 1, '#ffffff');
  });
}

export function registerFallbackUi(b: FallbackAtlasBuilder): void {
  // 1. Krunked Throne Title Emblem & Contoured Glow
  registerLogoSprites(b);

  // 2. Large Bust Portraits (96x80, orig=(48,40), 24 frames: (raceIndex-1)*2 + (skin==='b'?1:0))
  b.addSprite('sprBigPortrait', 96, 80, 48, 40, 24, (ctx, x, y, w, h, f) =>
    drawMutantBigPortrait(ctx, x, y, w, h, f),
  );

  // 3. Mini Char Select Portraits (16x24, orig=(0,0), 18 frames; 1..12 match raceIndex!)
  b.addSprite('sprCharSelect', 16, 24, 0, 0, 18, (ctx, x, y, _w, _h, f) =>
    drawCharSelectCard(ctx, x, y, f),
  );

  // 4. 29 Bespoke Mutation Cards + 24 Ultra Cards + 13 Distinct Crowns
  registerSkillAndCrownSprites(b);

  // 5. HUD, Health Bar/Fill, Rad Vial, Crosshairs & Ammo Icons
  registerHudSprites(b);
}
