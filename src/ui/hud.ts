import type { AmmoType, GamepadFamily, RenderSettings, SimState } from '@/contracts';
import type { AssetBundle } from '@/assets';
import { getGamepadGlyphs } from '@/input';
import { BitmapFontRenderer } from '@/render/bitmap-font';
import type { CameraController } from '@/render/camera';
import { SpriteRenderer } from '@/render/sprites';
import {
  DEFAULT_UI_DATA_PROVIDER,
  resolveWeaponLabel,
  resolveWeaponSpriteName,
  selectLoadingTip,
  type UiDataProvider,
} from './data-provider';
import {
  drawInkSplatBanner,
  drawPortalVortex,
  drawRunRoadMap,
  formatRunTimer,
} from './menus';

interface AmmoPoolHudSpec {
  type: AmmoType;
  iconSprites: readonly string[];
  ammoIconsFrame: number;
  color: string;
  lowLabel: string;
}

const AMMO_POOL_SPECS: readonly AmmoPoolHudSpec[] = [
  { type: 'bullet', iconSprites: ['sprBulletIcon'], ammoIconsFrame: 0, color: '#f5cc47', lowLabel: 'LOW BULLETS' },
  { type: 'shell', iconSprites: ['sprShotIcon', 'sprShellIcon'], ammoIconsFrame: 1, color: '#e65c38', lowLabel: 'LOW SHELLS' },
  { type: 'bolt', iconSprites: ['sprBoltIcon'], ammoIconsFrame: 2, color: '#59e06e', lowLabel: 'LOW BOLTS' },
  { type: 'explosive', iconSprites: ['sprExploIcon'], ammoIconsFrame: 3, color: '#ff8a2b', lowLabel: 'LOW EXPLOSIVES' },
  { type: 'energy', iconSprites: ['sprEnergyIcon'], ammoIconsFrame: 4, color: '#59c7ff', lowLabel: 'LOW ENERGY' },
];

export type HudInputDeviceMode = 'kbm' | 'gamepad' | 'touch';

export interface HudRenderContext {
  state: SimState;
  camera: CameraController;
  renderSettings: RenderSettings;
  fps: number;
  width: number;
  height: number;
  inputMode?: HudInputDeviceMode;
  gamepadFamily?: GamepadFamily;
}

/**
 * Pixel-verified sprHealthFill frame polarity:
 * frame 0 = WHITE (255,255,255) hurt flash; frame 1 = CRIMSON RED (252,56,0) normal fill.
 */
export function resolveHealthFillFrame(hurtFlashTicks: number): number {
  return hurtFlashTicks > 0 ? 0 : 1;
}

/**
 * Pixel-verified Ultra icon frame resolver across both Steam NT and Built-In Art packs:
 * - Steam `sprEGIconHUD` (52 frames) has a 3-frame race-0 dummy prefix (`0..2`), so
 *   mutant races 1..12 sit at `raceIndex * 3 + offset` (Fish = 3,4 .. Rogue = 36,37).
 * - Steam `sprEGSkillIcon` (48 frames = 16 races x 3) has NO race-0 prefix, so
 *   mutant races 1..12 sit at `(raceIndex - 1) * 3 + offset` (Fish = 0,1 .. Rogue = 33,34).
 * - Built-In Art stores compact 24 frames (`(raceIndex - 1) * 2 + offset`).
 */
export function computeUltraIconFrame(
  raceIndex: number,
  slot: 'a' | 'b' | 'c', // Wave 2B
  totalFrames: number = 24,
): number {
  const offset = slot === 'c' ? 2 : slot === 'b' ? 1 : 0;
  if (totalFrames >= 51) {
    return Math.max(0, raceIndex) * 3 + offset;
  }
  if (totalFrames >= 36) {
    return Math.max(0, raceIndex - 1) * 3 + offset;
  }
  // Built-In Art compact sheet: 0..23 = races 1..12 A/B, 24 = Horror C, 25..26 = Skeleton A/B, 27..28 = Frog A/B (Wave 2B)
  if (raceIndex === 11 && slot === 'c') {
    return Math.min(Math.max(0, totalFrames - 1), 24);
  }
  if (raceIndex === 14) {
    return Math.min(Math.max(0, totalFrames - 1), 25 + (slot === 'b' ? 1 : 0));
  }
  if (raceIndex === 15) {
    return Math.min(Math.max(0, totalFrames - 1), 27 + (slot === 'b' ? 1 : 0));
  }
  return Math.max(0, raceIndex - 1) * 2 + (slot === 'b' ? 1 : 0);
}

/**
 * Pixel-verified ammo HUD icon draining frame polarity:
 * frame 0 = FULL ammo icon .. frame (N-1) = EMPTY ammo icon (matching Steam data.win 8-frame sheets).
 * Gun Warrant forces frame 0 (full bright icon).
 */
export function computeAmmoIconFrame(
  count: number,
  max: number,
  frameCount: number,
  gunWarrantTicks: number = 0,
): number {
  if (frameCount <= 1 || gunWarrantTicks > 0) return 0;
  const frac = max > 0 ? Math.max(0, Math.min(1, count / max)) : 0;
  return Math.max(0, Math.min(frameCount - 1, Math.round((1 - frac) * (frameCount - 1))));
}

/**
 * Resolves destination-colored portal indicator palette:
 * Oasis -> ocean blue, Vault -> emerald green, IDPD HQ -> cobalt blue, standard -> portal violet.
 */
export function resolvePortalIndicatorStyle(targetArea: string): {
  fill: string;
  highlight: string;
  outline: string;
} {
  if (targetArea === '1-?') {
    return { fill: '#38c8ff', highlight: '#b8f2ff', outline: '#092036' };
  }
  if (targetArea === 'vault') {
    return { fill: '#52ff7a', highlight: '#c9ffd4', outline: '#0b2614' };
  }
  if (targetArea === 'hq-1') {
    return { fill: '#52a8ff', highlight: '#c4e4ff', outline: '#0c1c3a' };
  }
  return { fill: '#d16bff', highlight: '#f2ccff', outline: '#180c24' };
}

/**
 * Unifies Boss Intro splash naming across Steam Pack & Built-In Art modes:
 * Steam `sprBossName` frame 3 reads "THE THRONE", so Steam mode matches it cleanly;
 * Built-In mode consistently uses "THE KRUNKED THRONE".
 */
export function resolveBossDisplayName(
  bossId: string,
  fallbackName: string,
  isSteamMode: boolean,
): string {
  if (bossId === 'nuclear_throne') {
    return isSteamMode ? 'THE THRONE' : 'THE KRUNKED THRONE';
  }
  return fallbackName.toUpperCase();
}

export const PORTAL_INDICATOR_PAD_TOP = 44;

const BOSS_INTRO_FRAME_MAP: Readonly<Record<string, number>> = {
  big_bandit: 0,
  big_dog: 1,
  lil_hunter: 2,
  nuclear_throne: 3,
  throne_ii: 4,
  mom: 5, // Wave 2B
  hyper_crystal: 6, // Wave 2B
  technomancer: 7, // Wave 2B
  captain: 8, // Wave 2B
};

interface BuiltinBossBannerTheme {
  sprite: string;
  scale: number;
  bandA: string;
  bandB: string;
  accent: string;
  silhouette: string;
}

const BUILTIN_BOSS_THEMES: Readonly<Record<string, BuiltinBossBannerTheme>> = {
  big_bandit: {
    sprite: 'sprBanditBossIdle',
    scale: 2,
    bandA: '#542018',
    bandB: '#8c3422',
    accent: '#ffe047',
    silhouette: '#290c0a',
  },
  big_dog: {
    sprite: 'sprScrapBossIdle',
    scale: 2,
    bandA: '#4a2614',
    bandB: '#80411e',
    accent: '#ff8a2b',
    silhouette: '#21100a',
  },
  lil_hunter: {
    sprite: 'sprLilHunter',
    scale: 3,
    bandA: '#132842',
    bandB: '#1f446e',
    accent: '#63d8ff',
    silhouette: '#091526',
  },
  nuclear_throne: {
    sprite: 'sprNothingOn',
    scale: 1,
    bandA: '#162922',
    bandB: '#224a36',
    accent: '#52ff7a',
    silhouette: '#091711',
  },
  throne_ii: {
    sprite: 'sprNothing2Idle',
    scale: 2,
    bandA: '#2a1438',
    bandB: '#48225e',
    accent: '#d16bff',
    silhouette: '#150821',
  },
  mom: { // Wave 2B
    sprite: 'sprFrogQueenIdle',
    scale: 2,
    bandA: '#1d3618',
    bandB: '#335c28',
    accent: '#7cff52',
    silhouette: '#0d1a0b',
  },
  hyper_crystal: { // Wave 2B
    sprite: 'sprHyperCrystalIdle',
    scale: 2,
    bandA: '#2b1342',
    bandB: '#4f2275',
    accent: '#e085ff',
    silhouette: '#150821',
  },
  technomancer: { // Wave 2B
    sprite: 'sprTechnoMancer',
    scale: 2,
    bandA: '#0f2b33',
    bandB: '#1c4d59',
    accent: '#54e8ff',
    silhouette: '#07161a',
  },
  captain: { // Wave 2B
    sprite: 'sprLastIdle',
    scale: 2,
    bandA: '#122245',
    bandB: '#223d7a',
    accent: '#7ab8ff',
    silhouette: '#091224',
  },
};

function drawPixelBorder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  thickness = 1,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy, iw, thickness);
  ctx.fillRect(ix, iy + ih - thickness, iw, thickness);
  ctx.fillRect(ix, iy, thickness, ih);
  ctx.fillRect(ix + iw - thickness, iy, thickness, ih);
}

/**
 * Authentic Nuclear Throne jagged black ink brush-splat banner (100% integer fillRect, zero ctx.arc).
 */
function drawInkBrushSplat(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color = '#000000',
  accent?: string,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(ix - 6, iy + 4, iw + 14, Math.max(4, ih - 8));
    ctx.fillRect(ix + 4, iy - 2, iw - 4, ih + 4);
  }
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillRect(ix + 6, iy - 3, Math.max(4, iw - 14), 3);
  ctx.fillRect(ix + 10, iy + ih, Math.max(4, iw - 22), 3);
  const strips: ReadonlyArray<[number, number, number, number]> = [
    [-14, 0.14, 18, 3],
    [-22, 0.34, 26, 4],
    [-10, 0.56, 16, 3],
    [-18, 0.76, 22, 2],
    [iw - 4, 0.12, 22, 3],
    [iw - 6, 0.30, 32, 4],
    [iw - 2, 0.54, 18, 3],
    [iw - 4, 0.74, 26, 2],
  ];
  for (const [dx, yFrac, sw, sh] of strips) {
    ctx.fillRect(ix + dx, iy + Math.round(ih * yFrac), sw, sh);
  }
  ctx.fillRect(ix - 26, iy + Math.round(ih * 0.35), 2, 2);
  ctx.fillRect(ix - 17, iy + Math.round(ih * 0.85), 2, 1);
  ctx.fillRect(ix + iw + 29, iy + Math.round(ih * 0.31), 3, 2);
  ctx.fillRect(ix + iw + 24, iy + Math.round(ih * 0.75), 2, 2);
}

/**
 * Shared top-left Nuclear Throne gameplay HUD helper (Rad canister + level digit,
 * HP bar + LOW HP, borderless active/secondary weapons + reload bar, 5 draining ammo icons).
 * Used identically by gameplay HUD, Pause overlay (21_paused.png), and Level Up (11a_levelup.png)!
 */
export interface TopLeftHudRenderParams {
  sprites: SpriteRenderer;
  fonts: BitmapFontRenderer;
  data: UiDataProvider;
  isSteamMode: boolean;
  state: SimState;
  displayedHpFrac?: number;
  inputMode?: HudInputDeviceMode;
  gamepadFamily?: GamepadFamily;
}

function drawSpriteIntegerOrFitShared(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprites: SpriteRenderer,
  spriteName: string,
  frame: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  opts: { alpha?: number; tintColor?: string } = {},
): boolean {
  const spr = sprites.getSprite(spriteName);
  if (!spr || spr.frames.length === 0 || !sprites.hasSprite(spriteName)) return false;
  const fIdx = Math.max(0, Math.min(spr.frames.length - 1, Math.floor(frame)));
  const rect = spr.frames[fIdx];
  if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;

  if (rect.targetW <= boxW && rect.targetH <= boxH) {
    const targetLeft = Math.round(boxX + (boxW - rect.targetW) * 0.5);
    const targetTop = Math.round(boxY + (boxH - rect.targetH) * 0.5);
    const drawX = targetLeft - (rect.targetX - spr.originX);
    const drawY = targetTop - (rect.targetY - spr.originY);
    return sprites.draw(ctx, spriteName, drawX, drawY, {
      frame: fIdx,
      alpha: opts.alpha,
      tintColor: opts.tintColor,
      pixelSnap: true,
    });
  }

  return sprites.drawInBox(ctx, spriteName, fIdx, boxX, boxY, boxW, boxH, {
    alpha: opts.alpha,
    tintColor: opts.tintColor,
    maxScale: 1,
  });
}

function drawHudWeaponSpriteShared(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprites: SpriteRenderer,
  spriteName: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  bright: boolean,
): { drew: boolean; visualW: number } {
  const spr = sprites.getSprite(spriteName);
  if (!spr || spr.frames.length === 0 || !sprites.hasSprite(spriteName)) {
    return { drew: false, visualW: 12 };
  }
  const rect = spr.frames[0];
  if (!rect || rect.srcW <= 0 || rect.srcH <= 0) {
    return { drew: false, visualW: 12 };
  }

  const fitScale = Math.min(1, boxW / Math.max(1, rect.targetW), boxH / Math.max(1, rect.targetH));
  const visualW = Math.max(10, Math.min(boxW, Math.round(rect.targetW * fitScale)));

  if (bright) {
    const outlineAlpha = 0.96;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      drawSpriteIntegerOrFitShared(ctx, sprites, spriteName, 0, boxX + ox, boxY + oy, visualW, boxH, {
        alpha: outlineAlpha,
        tintColor: '#ffffff',
      });
    }
    drawSpriteIntegerOrFitShared(ctx, sprites, spriteName, 0, boxX, boxY, visualW, boxH, {
      alpha: 1,
      tintColor: '#0e0a12',
    });
  } else {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      drawSpriteIntegerOrFitShared(ctx, sprites, spriteName, 0, boxX + ox, boxY + oy, visualW, boxH, {
        alpha: 0.65,
        tintColor: '#b8b8c4',
      });
    }
    drawSpriteIntegerOrFitShared(ctx, sprites, spriteName, 0, boxX, boxY, visualW, boxH, {
      alpha: 0.9,
      tintColor: '#14101a',
    });
  }

  return { drew: true, visualW };
}

export function renderTopLeftGameplayHud(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  params: TopLeftHudRenderParams,
): void {
  const { sprites, fonts, data, isSteamMode, state } = params;
  const inputMode: HudInputDeviceMode = params.inputMode ?? 'kbm';
  const gamepadFamily: GamepadFamily = params.gamepadFamily ?? 'generic';
  const player = state.player;
  const hp = Math.max(0, player.hp);
  const maxHp = Math.max(1, player.maxHp);
  const hpFrac = Math.min(1, hp / maxHp);
  const displayedHpFrac = params.displayedHpFrac ?? hpFrac;

  // ------------------------------------------------------------------------
  // 1. RAD CANISTER (x=4, y=4, ~14x24px) with Level digit centered ON tube!
  // ------------------------------------------------------------------------
  const radX = 4;
  const radY = 4;
  const isUltraLevel = player.level >= 10 || player.radsToNextLevel >= 9999;
  const radFrac = isUltraLevel
    ? 1
    : player.radsToNextLevel > 0
      ? Math.max(0, Math.min(1, player.rads / player.radsToNextLevel))
      : 1;

  const expBarSpr = sprites.getSprite('sprExpBar');
  let canisterW = 14;
  let canisterH = 22;
  if (expBarSpr && expBarSpr.frames.length > 0 && sprites.hasSprite('sprExpBar')) {
    canisterW = expBarSpr.width;
    canisterH = expBarSpr.height;
    const fillFrame = Math.min(
      expBarSpr.frames.length - 1,
      Math.round(radFrac * (expBarSpr.frames.length - 1)),
    );
    const levelGlowOn = state.pendingLevelUps > 0 && Math.floor(state.tick / 6) % 2 === 0;
    if (levelGlowOn) {
      // CRITICAL: Draw sprExpBarLevel BEFORE sprExpBar so Steam's 16x26 glow frames the green canister
      const lvlSpr = sprites.getSprite('sprExpBarLevel');
      if (lvlSpr && lvlSpr.width <= expBarSpr.width) {
        drawPixelBorder(ctx, radX - 1, radY - 1, expBarSpr.width + 2, expBarSpr.height + 2, '#ffe047', 1);
      }
      sprites.draw(ctx, 'sprExpBarLevel', radX, radY, { frame: 0, pixelSnap: true });
    }
    sprites.draw(ctx, 'sprExpBar', radX, radY, { frame: fillFrame, pixelSnap: true });
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(radX, radY, 15, 22);
    ctx.fillStyle = '#686b70';
    ctx.fillRect(radX + 1, radY + 1, 13, 3);
    ctx.fillRect(radX + 1, radY + 18, 13, 3);
    ctx.fillStyle = '#141816';
    ctx.fillRect(radX + 2, radY + 4, 11, 14);
    const fillH = Math.round(14 * radFrac);
    if (fillH > 0) {
      ctx.fillStyle = state.pendingLevelUps > 0 ? '#a8ff6e' : '#48e048';
      ctx.fillRect(radX + 2, radY + 18 - fillH, 11, fillH);
    }
    canisterW = 15;
    canisterH = 22;
  }

  // Bold white-outlined Level number (1..9 or U) centered RIGHT ON THE CANISTER!
  const levelDigit = player.level >= 10 ? 'U' : String(Math.max(1, player.level));
  fonts.draw(
    ctx,
    levelDigit,
    radX + Math.floor(canisterW * 0.5),
    radY + Math.floor(canisterH * 0.5) - 4,
    'fntM1',
    {
      align: 'center',
      color: player.level >= 10 ? '#8cff66' : '#ffffff',
      outline: true,
    },
  );

  // ------------------------------------------------------------------------
  // 2. HP BAR (x=22, y=5, w=84, h=11) + LOW HP blinking red warning
  // ------------------------------------------------------------------------
  const barX = 22;
  const barY = 5;
  const barW = 84;
  const barH = 11;
  const innerX = barX + 2;
  const innerY = barY + 2;
  const innerW = barW - 4;
  const innerH = barH - 4;

  if (isSteamMode && sprites.hasSprite('sprHealthBar')) {
    sprites.draw(ctx, 'sprHealthBar', barX - 2, barY - 1, { frame: 0, pixelSnap: true });
    const sInnerX = barX + 1;
    const sInnerY = barY + 2;
    const sInnerW = 82;
    const sInnerH = 8;
    const fillW = Math.round(sInnerW * hpFrac);
    const trailW = Math.round(sInnerW * displayedHpFrac);
    if (trailW > fillW) {
      ctx.fillStyle = '#8e1b18';
      ctx.fillRect(sInnerX + fillW, sInnerY, trailW - fillW, sInnerH);
    }
    if (fillW > 0) {
      const frame = resolveHealthFillFrame(player.hurtFlashTicks);
      const drewFill = sprites.draw(ctx, 'sprHealthFill', sInnerX, sInnerY, {
        frame,
        scaleX: fillW,
        scaleY: 1,
        pixelSnap: true,
      });
      if (!drewFill) {
        ctx.fillStyle = player.hurtFlashTicks > 0 ? '#ffffff' : '#fc3800';
        ctx.fillRect(sInnerX, sInnerY, fillW, sInnerH);
        if (player.hurtFlashTicks <= 0) {
          ctx.fillStyle = '#ff7c40';
          ctx.fillRect(sInnerX, sInnerY, fillW, 1);
        }
      }
    }
  } else {
    // Exact crisp 1x Nuclear Throne black + white bordered HP bar (matches 04_desert_1_1.png!)
    ctx.fillStyle = '#000000';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(barX + 1, barY + 1, barW - 2, barH - 2);
    ctx.fillStyle = '#1d171c';
    ctx.fillRect(innerX, innerY, innerW, innerH);

    const fillW = Math.round(innerW * hpFrac);
    const trailW = Math.round(innerW * displayedHpFrac);
    if (trailW > fillW) {
      ctx.fillStyle = '#8e1b18';
      ctx.fillRect(innerX + fillW, innerY, trailW - fillW, innerH);
    }
    if (fillW > 0) {
      if (player.hurtFlashTicks > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(innerX, innerY, fillW, innerH);
      } else {
        ctx.fillStyle = '#fc3800';
        ctx.fillRect(innerX, innerY, fillW, innerH);
        ctx.fillStyle = '#ff7c40';
        ctx.fillRect(innerX, innerY, fillW, 1);
      }
    }
  }

  // Boiling Veins subtle warm border pulse when <= 4 HP
  if (player.alive && hp <= 4 && player.mutations.includes('boiling_veins')) {
    const bvPulse = Math.floor(state.tick / 6) % 2 === 0;
    drawPixelBorder(ctx, barX - 1, barY - 1, barW + 2, barH + 2, bvPulse ? '#ffe047' : '#ff7b24', 1);
  }

  // Bold white-outlined HP numbers centered inside bar (8/8)
  fonts.draw(
    ctx,
    `${Math.ceil(hp)}/${maxHp}`,
    barX + Math.floor(barW * 0.5),
    barY + 2,
    'fntM1',
    { align: 'center', color: '#ffffff', outline: true },
  );

  // Strong Spirit pixel-crisp halo right of HP bar (zero ctx.arc!)
  let rightOfHpX = barX + barW + 4;
  if (player.mutations.includes('strong_spirit')) {
    const ssBoxX = barX + barW + 2;
    const ssBoxY = barY + 1;
    const ready = player.strongSpiritReady;
    const drewSteamHalo =
      isSteamMode &&
      sprites.hasSprite('sprStrongSpirit') &&
      drawSpriteIntegerOrFitShared(ctx, sprites, 'sprStrongSpirit', 0, ssBoxX, ssBoxY, 12, 10, {
        alpha: ready ? 1 : 0.36,
        tintColor: ready ? undefined : '#5b677d',
      });

    if (!drewSteamHalo) {
      const hx = ssBoxX + 1;
      const hy = barY + 2;
      const ringCol = ready ? '#e6fcff' : '#4f5b6e';
      ctx.fillStyle = '#000000';
      ctx.fillRect(hx + 1, hy - 1, 8, 1);
      ctx.fillRect(hx + 1, hy + 6, 8, 1);
      ctx.fillRect(hx - 1, hy + 1, 1, 4);
      ctx.fillRect(hx + 10, hy + 1, 1, 4);
      ctx.fillStyle = ringCol;
      ctx.fillRect(hx + 2, hy, 6, 1);
      ctx.fillRect(hx + 2, hy + 5, 6, 1);
      ctx.fillRect(hx + 1, hy + 1, 2, 1);
      ctx.fillRect(hx + 7, hy + 1, 2, 1);
      ctx.fillRect(hx, hy + 2, 2, 2);
      ctx.fillRect(hx + 8, hy + 2, 2, 2);
      ctx.fillRect(hx + 1, hy + 4, 2, 1);
      ctx.fillRect(hx + 7, hy + 4, 2, 1);
    }
    rightOfHpX = ssBoxX + 15;
  }

  // Blinking bright red black-outlined `LOW HP` warning directly right of HP bar!
  const isLowHp =
    player.alive &&
    ((maxHp > 4 && hp <= 4) || (maxHp <= 4 && hp < maxHp && hp <= 1));
  if (isLowHp && Math.floor(state.tick / 10) % 2 === 0) {
    fonts.draw(ctx, 'LOW HP', Math.max(110, rightOfHpX), barY + 2, 'fntM1', {
      color: '#ff3020',
      outline: true,
    });
  }

  // ------------------------------------------------------------------------
  // 3. WEAPONS ROW (x=22, y=18) — ZERO DARK BOXES, ZERO WEAPON NAMES!
  // ------------------------------------------------------------------------
  const activeSlot = player.weapons[player.activeSlot];
  const secondarySlot = player.weapons[player.activeSlot === 0 ? 1 : 0];
  const activeDef = activeSlot ? data.getWeapon(activeSlot.weaponId) : undefined;
  const secDef = secondarySlot ? data.getWeapon(secondarySlot.weaponId) : undefined;
  const isSteroids = player.mutant === 'steroids';

  let cursorX = 22;
  const wepRowY = 18;

  if (activeSlot) {
    const wepSpr = resolveWeaponSpriteName(activeSlot.weaponId, data);
    const { visualW } = drawHudWeaponSpriteShared(ctx, sprites, wepSpr, cursorX, wepRowY, 22, 10, true);

    if (activeSlot.reloadTicks > 0 && activeSlot.maxReloadTicks > 0) {
      const frac = 1 - Math.max(0, Math.min(1, activeSlot.reloadTicks / activeSlot.maxReloadTicks));
      const rBarW = Math.max(14, visualW);
      ctx.fillStyle = '#000000';
      ctx.fillRect(cursorX - 1, wepRowY + 10, rBarW + 2, 3);
      ctx.fillStyle = '#36323e';
      ctx.fillRect(cursorX, wepRowY + 11, rBarW, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cursorX, wepRowY + 11, Math.max(1, Math.round(rBarW * frac)), 1);
    }

    cursorX += visualW + 3;

    const ammoType = activeDef?.ammoType ?? 'melee';
    if (ammoType !== 'melee') {
      const count = player.ammo[ammoType] ?? 0;
      const max = Math.max(1, player.ammoMax[ammoType] ?? 1);
      const low = player.gunWarrantTicks <= 0 && (count === 0 || count / max <= 0.2);
      const countStr = player.gunWarrantTicks > 0 ? 'INF' : String(count);
      const drawn = fonts.draw(ctx, countStr, cursorX, wepRowY + 1, 'fntM1', {
        color: player.gunWarrantTicks > 0 ? '#ffe047' : low ? '#ff3828' : '#ffffff',
        outline: true,
      });
      cursorX += Math.max(14, drawn.width) + 6;
    } else {
      cursorX += 5;
    }
  }

  if (secondarySlot) {
    const secSpr = resolveWeaponSpriteName(secondarySlot.weaponId, data);
    const { visualW } = drawHudWeaponSpriteShared(
      ctx,
      sprites,
      secSpr,
      cursorX,
      wepRowY,
      20,
      10,
      isSteroids,
    );

    if (secondarySlot.reloadTicks > 0 && secondarySlot.maxReloadTicks > 0) {
      const sFrac =
        1 - Math.max(0, Math.min(1, secondarySlot.reloadTicks / secondarySlot.maxReloadTicks));
      const rBarW = Math.max(14, visualW);
      ctx.fillStyle = '#000000';
      ctx.fillRect(cursorX - 1, wepRowY + 10, rBarW + 2, 3);
      ctx.fillStyle = '#36323e';
      ctx.fillRect(cursorX, wepRowY + 11, rBarW, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cursorX, wepRowY + 11, Math.max(1, Math.round(rBarW * sFrac)), 1);
    }

    cursorX += visualW + 3;

    const secAmmoType = secDef?.ammoType ?? 'melee';
    if (secAmmoType !== 'melee') {
      const secCount = player.ammo[secAmmoType] ?? 0;
      const secMax = Math.max(1, player.ammoMax[secAmmoType] ?? 1);
      const secLow = player.gunWarrantTicks <= 0 && (secCount === 0 || secCount / secMax <= 0.2);
      const secStr = player.gunWarrantTicks > 0 ? 'INF' : String(secCount);
      const drawn = fonts.draw(ctx, secStr, cursorX, wepRowY + 1, 'fntM1', {
        color: player.gunWarrantTicks > 0 ? '#ffe047' : secLow ? '#ff3828' : isSteroids ? '#ffffff' : '#c8c8d2',
        outline: true,
      });
      cursorX += drawn.width + 4;
    }

    // Gamepad-only compact swap glyph (invisible in KBM/Touch for 100% pure video HUD!)
    if (inputMode === 'gamepad') {
      const swapKey = getGamepadGlyphs(gamepadFamily).swap;
      fonts.draw(ctx, swapKey, cursorX, wepRowY + 2, 'fntSmall', {
        color: '#ffe047',
        outline: true,
      });
    }
  }

  // ------------------------------------------------------------------------
  // 4. 5 TINY AMMO POOL ICONS (x=4, y=30, 9px stride) — ZERO NUMBERS!
  // ------------------------------------------------------------------------
  const ammoStartX = 4;
  const ammoY = 30;
  const ammoStride = 9;
  const equippedTypes = new Set<AmmoType>();
  if (activeDef?.ammoType && activeDef.ammoType !== 'melee') equippedTypes.add(activeDef.ammoType);
  if (secDef?.ammoType && secDef.ammoType !== 'melee') equippedTypes.add(secDef.ammoType);

  let lowAmmoWarningText = '';

  for (let i = 0; i < AMMO_POOL_SPECS.length; i++) {
    const spec = AMMO_POOL_SPECS[i]!;
    const ax = ammoStartX + i * ammoStride;
    const count = player.ammo[spec.type] ?? 0;
    const max = Math.max(1, player.ammoMax[spec.type] ?? 1);
    const frac = Math.max(0, Math.min(1, count / max));
    const isEquipped = equippedTypes.has(spec.type);
    const isLow = player.gunWarrantTicks <= 0 && (count === 0 || frac <= 0.2);

    if (isEquipped && isLow && !lowAmmoWarningText) {
      lowAmmoWarningText = spec.lowLabel;
    }

    let drewIcon = false;
    const iconBoxW = 8;
    const iconBoxH = 9;

    for (const candidate of spec.iconSprites) {
      const iconDef = sprites.getSprite(candidate);
      if (iconDef && sprites.hasSprite(candidate)) {
        const iconFrame = computeAmmoIconFrame(
          count,
          max,
          iconDef.frames.length,
          player.gunWarrantTicks,
        );
        if (isEquipped) {
          // Crisp white highlight outline on the equipped weapon's ammo pool icon (matches video!)
          for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            drawSpriteIntegerOrFitShared(ctx, sprites, candidate, 0, ax + ox, ammoY + oy, iconBoxW, iconBoxH, {
              alpha: 0.9,
              tintColor: '#ffffff',
            });
          }
        }
        // Both Steam AND Built-In Wave 2 pack full 8-frame draining sheets (f0=FULL .. f7=EMPTY)!
        if (isSteamMode || iconDef.frames.length >= 8) {
          drewIcon = drawSpriteIntegerOrFitShared(ctx, sprites, candidate, iconFrame, ax, ammoY, iconBoxW, iconBoxH, {
            alpha: count === 0 && player.gunWarrantTicks <= 0 ? 0.78 : 1,
          });
        } else {
          const effFrac = player.gunWarrantTicks > 0 ? 1 : frac;
          drewIcon = drawSpriteIntegerOrFitShared(ctx, sprites, candidate, 0, ax, ammoY, iconBoxW, iconBoxH, {
            alpha: effFrac <= 0 ? 0.36 : 0.30,
          });
          if (drewIcon && effFrac > 0) {
            const fillH = Math.max(1, Math.round(iconBoxH * effFrac));
            ctx.save();
            ctx.beginPath();
            ctx.rect(ax, ammoY + iconBoxH - fillH, iconBoxW, fillH);
            ctx.clip();
            drawSpriteIntegerOrFitShared(ctx, sprites, candidate, 0, ax, ammoY, iconBoxW, iconBoxH, {
              alpha: 1,
            });
            ctx.restore();
          }
        }
        if (drewIcon) break;
      }
    }

    if (!drewIcon) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(ax, ammoY + 1, 6, 7);
      ctx.fillStyle = count === 0 ? '#4e525c' : spec.color;
      ctx.fillRect(ax + 1, ammoY + 2, 4, 5);
    }
  }

  let warnX = ammoStartX + AMMO_POOL_SPECS.length * ammoStride + 4;

  // Rogue Portal Strike compact canister icon right beside the 5 ammo icons
  if (player.mutant === 'rogue') {
    const rx = ammoStartX + AMMO_POOL_SPECS.length * ammoStride + 2;
    const rogueDef = sprites.getSprite('sprRogueAmmoHUD');
    let drewRogue = false;
    if (rogueDef && sprites.hasSprite('sprRogueAmmoHUD')) {
      const rf = Math.max(0, Math.min(rogueDef.frames.length - 1, player.portalStrikes));
      drewRogue = drawSpriteIntegerOrFitShared(ctx, sprites, 'sprRogueAmmoHUD', rf, rx, ammoY - 2, 10, 13);
    }
    if (!drewRogue) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(rx, ammoY, 6, 8);
      ctx.fillStyle = player.portalStrikes > 0 ? '#52a8ff' : '#3a4659';
      ctx.fillRect(rx + 1, ammoY + 1, 4, 6);
    }
    warnX = rx + 12;
  }

  // Blinking bright red `LOW ENERGY` / `LOW BULLETS` / `LOW SHELLS` right beside ammo icons!
  if (lowAmmoWarningText && Math.floor(state.tick / 10) % 2 === 0) {
    fonts.draw(ctx, lowAmmoWarningText, warnX, ammoY + 1, 'fntM1', {
      color: '#ff3020',
      outline: true,
    });
  }

  // Timed status indicator (Chicken Headless / Fish Gun Warrant) tucked cleanly below ammo row
  if (player.headlessTicks > 0 && player.alive) {
    const secs = (player.headlessTicks / 30).toFixed(1);
    fonts.draw(ctx, `@rHEAD ${secs}S`, ammoStartX, ammoY + 12, 'fntSmall', {
      outline: true,
    });
  } else if (player.gunWarrantTicks > 0) {
    const secs = (player.gunWarrantTicks / 30).toFixed(1);
    fonts.draw(ctx, `@yINF AMMO ${secs}S`, ammoStartX, ammoY + 12, 'fntSmall', {
      outline: true,
    });
  }
}

/**
 * 1:1 Authentic Nuclear Throne Canvas HUD Renderer (426x240 / 320x240 native 1x grid):
 * - Top-Left: Vertical rad canister with centered level digit (1..9 / U), crisp red-orange HP bar
 *   with blinking LOW HP warning, borderless active + secondary weapon silhouettes & ammo counts
 *   with active reload bar only when reloading, and 5 tiny draining ammo icons + blinking LOW AMMO.
 * - Top-Right: Mutation icons + Ultra + Crown anchored right-to-left at y=4.
 * - Bottom-Right: Crisp white-outlined MM:SS.cc run timer.
 * - Boss Intro Splash (no bottom Boss HP bar during gameplay, matching real Nuclear Throne).
 * - Full-screen animated Portal Generating transition screen with swirling purple vortex & road map.
 */
export class HudRenderer {
  private bundle: AssetBundle;
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;
  private displayedHpFrac = 1;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.bundle = bundle;
    this.sprites = new SpriteRenderer(bundle);
    this.fonts = new BitmapFontRenderer(bundle);
    this.data = data;
  }

  setBundle(bundle: AssetBundle): void {
    this.bundle = bundle;
    this.sprites.setBundle(bundle);
    this.fonts.setBundle(bundle);
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
  }

  private get isSteamMode(): boolean {
    return this.bundle.sourceMode === 'steam';
  }

  private isBossIntroActive(state: SimState): boolean {
    const boss = state.boss;
    if (!boss || boss.defeated || boss.introTicks <= 0) return false;
    const bossEntity = state.enemies.find((e) => e.id === boss.entityId);
    if (bossEntity && bossEntity.aiState === 'sleep') return false;
    return true;
  }

  /**
   * Draws a sprite frame at crisp integer 1x scale centered inside a target box
   * whenever the trimmed frame fits; falls back to drawInBox only for oversized sprites.
   */
  private drawSpriteIntegerOrFit(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    spriteName: string,
    frame: number,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
    opts: { alpha?: number; tintColor?: string } = {},
  ): boolean {
    const spr = this.sprites.getSprite(spriteName);
    if (!spr || spr.frames.length === 0 || !this.sprites.hasSprite(spriteName)) return false;
    const fIdx = Math.max(0, Math.min(spr.frames.length - 1, Math.floor(frame)));
    const rect = spr.frames[fIdx];
    if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;

    if (rect.targetW <= boxW && rect.targetH <= boxH) {
      const targetLeft = Math.round(boxX + (boxW - rect.targetW) * 0.5);
      const targetTop = Math.round(boxY + (boxH - rect.targetH) * 0.5);
      const drawX = targetLeft - (rect.targetX - spr.originX);
      const drawY = targetTop - (rect.targetY - spr.originY);
      return this.sprites.draw(ctx, spriteName, drawX, drawY, {
        frame: fIdx,
        alpha: opts.alpha,
        tintColor: opts.tintColor,
        pixelSnap: true,
      });
    }

    return this.sprites.drawInBox(ctx, spriteName, fIdx, boxX, boxY, boxW, boxH, {
      alpha: opts.alpha,
      tintColor: opts.tintColor,
      maxScale: 1,
    });
  }

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    hud: HudRenderContext,
  ): void {
    const { state, camera, renderSettings, fps, width, height } = hud;
    const inputMode: HudInputDeviceMode = hud.inputMode ?? 'kbm';
    const gamepadFamily: GamepadFamily = hud.gamepadFamily ?? 'generic';
    ctx.imageSmoothingEnabled = false;

    // Portal Transition / Generating Screen (matches video 00:04, 00:17, 00:33)
    if (state.portal.active && state.portal.entered) {
      const ticksIn = Math.max(state.portal.enterTicks || 0, state.portalTransitionTicks || 0);
      if (ticksIn >= 4) {
        this.renderPortalTransition(ctx, state, width, height, inputMode, gamepadFamily);
        return;
      }
    }

    // Match authentic Nuclear Throne: hide normal HUD during active Boss Intro splash
    if (this.isBossIntroActive(state)) {
      this.renderBossIntroSplash(ctx, state, width, height);
      return;
    }

    this.renderTopLeftHud(ctx, state, inputMode, gamepadFamily);
    this.renderTopRightMutations(ctx, state, renderSettings, fps, width);
    this.renderBottomRightTimer(ctx, state, width, height);
    this.renderOffscreenChestIndicators(ctx, state, camera, width, height);
    this.renderOffscreenPortalIndicator(ctx, state, camera, width, height);
  }

  /**
   * Authentic Nuclear Throne Portal Generating transition screen:
   * - Full-screen animated swirling purple vortex + white pixel lightning + 28px black letterbox bars
   * - Top-left vitals/weapons/ammo + Top-right mutations cleanly visible on top black bar
   * - Centered `GENERATING... 064%`
   * - Two jagged black ink-splat strokes: destination area code (left) + `[skull] kills` (right)
   * - Horizontal red/white run progression road map with mutant head icon & tiny Throne icon
   * - Bold white wasteland tip text underneath
   */
  renderPortalTransition(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
    height: number,
    inputMode: HudInputDeviceMode = 'kbm',
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    const ticksIn = Math.max(state.portal.enterTicks || 0, state.portalTransitionTicks || 0);
    const pct = Math.max(0, Math.min(100, Math.floor(((ticksIn - 6) / 18) * 100)));
    const pctStr = String(pct).padStart(3, '0');
    const timeSec = (state.tick + ticksIn) / 30;
    const cx = Math.round(width * 0.5);

    // 1. Swirling purple portal vortex + white pixel lightning + 28px pure black letterbox bars
    drawPortalVortex(ctx, width, height, timeSec, true);

    // 2. Keep HUD visible cleanly in top-left & top-right (just like the video!)
    this.renderTopLeftHud(ctx, state, inputMode, gamepadFamily);
    this.renderTopRightMutations(ctx, state, {
      widescreen: width >= 380,
      targetFps: 60,
      classic30Fps: false,
      screenShakeScale: 1,
      crosshairStyle: 0,
      showFps: false,
      pixelSnap: true,
    }, 60, width);

    // 3. Centered `GENERATING... 064%`
    this.fonts.draw(ctx, `GENERATING... ${pctStr}%`, cx, 78, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // 4. Two jagged black ink-splat strokes holding area code (left) & [skull] kills (right)
    const targetCode =
      state.portal.nextLoop > 0
        ? `L${state.portal.nextLoop} ${state.portal.targetArea}`
        : state.portal.targetArea;
    const badgeY = 95;
    const leftSplatX = cx - 76;
    const rightSplatX = cx + 14;
    drawInkSplatBanner(ctx, leftSplatX, badgeY, 54, 12, 11);
    drawInkSplatBanner(ctx, rightSplatX, badgeY, 60, 12, 29);

    this.fonts.draw(ctx, targetCode, leftSplatX + 27, badgeY + 2, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    const killsStr = String(state.stats.kills);
    const drewSkull = this.drawSpriteIntegerOrFit(ctx, 'sprKillsIcon', 0, rightSplatX + 8, badgeY + 1, 10, 10);
    if (!drewSkull) {
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(rightSplatX + 10, badgeY + 3, 6, 6);
    }
    this.fonts.draw(ctx, killsStr, rightSplatX + 24, badgeY + 2, 'fntM1', {
      color: '#ffffff',
      outline: true,
    });

    // 5. Horizontal red/white run progression road map with mutant head & tiny Throne icon
    drawRunRoadMap(ctx, this.sprites, this.data, {
      areaCode: state.portal.targetArea,
      mutant: state.player.mutant,
      skin: state.player.skin,
      loop: state.portal.nextLoop,
      victory: false,
    }, cx, 123);

    // 6. Bold white wasteland tip text underneath
    const targetArea = this.data.getArea(state.portal.targetArea);
    const targetBiome = targetArea?.biome ?? state.biome;
    const tip = selectLoadingTip(targetBiome, state.portal.targetArea, state.portal.nextLoop, state.seed);
    this.fonts.draw(ctx, tip, cx, 142, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      maxWidth: width - 36,
      outline: true,
    });

    // 7. Bottom black bar brand & run timer
    this.fonts.draw(ctx, 'KRUNKED THRONE', 6, height - 10, 'fntSmall', {
      color: '#9a9aa4',
      shadow: false,
    });
    this.fonts.draw(ctx, formatRunTimer(state.stats.timeTicks), width - 4, height - 11, 'fntM1', {
      align: 'right',
      color: '#ffffff',
      outline: true,
    });
  }

  private renderTopLeftHud(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    inputMode: HudInputDeviceMode,
    gamepadFamily: GamepadFamily,
  ): void {
    const player = state.player;
    const hp = Math.max(0, player.hp);
    const maxHp = Math.max(1, player.maxHp);
    const hpFrac = Math.min(1, hp / maxHp);

    // Smoothly decay damage trail behind current HP
    if (hpFrac > this.displayedHpFrac) {
      this.displayedHpFrac = hpFrac;
    } else {
      this.displayedHpFrac += (hpFrac - this.displayedHpFrac) * 0.14;
      if (Math.abs(this.displayedHpFrac - hpFrac) < 0.005) {
        this.displayedHpFrac = hpFrac;
      }
    }

    renderTopLeftGameplayHud(ctx, {
      sprites: this.sprites,
      fonts: this.fonts,
      data: this.data,
      isSteamMode: this.isSteamMode,
      state,
      displayedHpFrac: this.displayedHpFrac,
      inputMode,
      gamepadFamily,
    });
  }

  /**
   * Top-Right Mutation Icons + Ultra + Crown Icon anchored from (width - 4) leftward at y = 4
   * (16x16 icons with 2px spacing — exact match to 08_caves_4_1.png, 13_frozen_5_3.png, 15_palace_7_1.png!).
   */
  private renderTopRightMutations(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    renderSettings: RenderSettings,
    fps: number,
    width: number,
  ): void {
    const iconSize = 16;
    const stride = 18; // 16px icon + 2px spacing
    let cursorRight = width - 4;
    const topY = 4;

    // Active Crown icon at rightmost slot if equipped
    if (state.crown !== 'none') {
      const crownDef = this.data.getCrown(state.crown);
      const x = cursorRight - iconSize;
      this.drawSpriteIntegerOrFit(ctx, crownDef.spriteIdle, 0, x, topY, iconSize, iconSize);
      cursorRight -= stride;
    }

    // Ultra Mutation icon if unlocked
    if (state.player.ultra) {
      const uDef = this.data.getUltra(state.player.ultra);
      const mutantDef = this.data.getMutant(state.player.mutant);
      const egHudSpr = this.sprites.getSprite('sprEGIconHUD');
      const ultraFrame = uDef
        ? computeUltraIconFrame(mutantDef.raceIndex, uDef.slot, egHudSpr?.frames.length ?? 24)
        : 0;
      const x = cursorRight - iconSize;
      const drew = uDef
        ? this.drawSpriteIntegerOrFit(ctx, 'sprEGIconHUD', ultraFrame, x, topY, iconSize, iconSize)
        : false;
      if (!drew) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, topY, iconSize, iconSize);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 2, topY + 2, iconSize - 4, iconSize - 4);
      }
      cursorRight -= stride;
    }

    // Owned Mutations anchored right-to-left (most recent on left, matching video!)
    const mutations = state.player.mutations;
    for (let i = 0; i < mutations.length; i++) {
      const mutId = mutations[i]!;
      const def = this.data.getMutation(mutId);
      const x = cursorRight - iconSize;
      if (x < 120) break; // Never collide with top-left HP bar
      const drew = def
        ? this.drawSpriteIntegerOrFit(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, x, topY, iconSize, iconSize)
        : false;
      if (!drew) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, topY, iconSize, iconSize);
        ctx.fillStyle = '#48e048';
        ctx.fillRect(x + 2, topY + 2, iconSize - 4, iconSize - 4);
      }
      cursorRight -= stride;
    }

    // Optional FPS counter ONLY when explicitly enabled in Options
    if (renderSettings.showFps) {
      const targetFps = renderSettings.targetFps ?? (renderSettings.classic30Fps ? 30 : 120);
      const fpsColor = fps >= Math.min(55, targetFps * 0.85) ? '@g' : fps >= 28 ? '@y' : '@r';
      this.fonts.draw(ctx, `${fpsColor}${Math.round(fps)}/${targetFps}`, width - 4, topY + 19, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }
  }

  /**
   * Bottom-Right crisp white-outlined MM:SS.cc run timer (00:26.35), matching the reference video!
   */
  private renderBottomRightTimer(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
    height: number,
  ): void {
    const timeStr = formatRunTimer(state.stats.timeTicks);
    this.fonts.draw(ctx, timeStr, width - 4, height - 10, 'fntM1', {
      align: 'right',
      color: '#ffffff',
      outline: true,
    });
  }

  /**
   * Subtle color-coded screen-edge indicators for off-screen unopened Weapon / Ammo / Rad chests
   * once the portal opens or all hostile enemies are cleared.
   */
  private renderOffscreenChestIndicators(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    camera: CameraController,
    width: number,
    height: number,
  ): void {
    let hostileAlive = false;
    if (!state.portal.active) {
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i]!;
        if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') {
          hostileAlive = true;
          break;
        }
      }
    }
    if (hostileAlive) return;

    const margin = 10;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const padX = 14;
    const padTop = PORTAL_INDICATOR_PAD_TOP;
    const padBot = 16;
    const halfW = cx - padX;
    const halfH = cy - Math.max(padTop, padBot);

    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.opened || prop.hp <= 0) continue;
      let col: string | null = null;
      if (prop.kind === 'big_weapon_chest') col = '#ffe047';
      else if (prop.kind === 'weapon_chest') col = '#ff4d57';
      else if (prop.kind === 'ammo_chest') col = '#f5c742';
      else if (prop.kind === 'rad_canister') col = '#52e864';
      if (!col) continue;

      const scr = camera.worldToScreen(prop.x, prop.y);
      if (
        scr.x >= margin &&
        scr.x <= width - margin &&
        scr.y >= margin &&
        scr.y <= height - margin
      ) {
        continue;
      }

      const dx = scr.x - cx;
      const dy = scr.y - cy;
      const angle = Math.atan2(dy, dx);
      const scaleX = Math.abs(dx) > 1e-4 ? halfW / Math.abs(dx) : Infinity;
      const scaleY = Math.abs(dy) > 1e-4 ? halfH / Math.abs(dy) : Infinity;
      const t = Math.min(scaleX, scaleY);
      const ix = Math.round(cx + dx * t);
      const iy = Math.max(padTop, Math.min(height - padBot, Math.round(cy + dy * t)));

      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(angle);
      ctx.fillStyle = '#0e0a14';
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(3.5, 0);
      ctx.lineTo(-2, -2.5);
      ctx.lineTo(-2, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderOffscreenPortalIndicator(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    camera: CameraController,
    width: number,
    height: number,
  ): void {
    if (!state.portal.active) return;

    const scr = camera.worldToScreen(state.portal.x, state.portal.y);
    const margin = 10;
    if (
      scr.x >= margin &&
      scr.x <= width - margin &&
      scr.y >= margin &&
      scr.y <= height - margin
    ) {
      return;
    }

    const cx = width * 0.5;
    const cy = height * 0.5;
    const dx = scr.x - cx;
    const dy = scr.y - cy;
    const angle = Math.atan2(dy, dx);

    const padX = 16;
    const padTop = PORTAL_INDICATOR_PAD_TOP;
    const padBot = 16;
    const halfW = cx - padX;
    const halfH = cy - Math.max(padTop, padBot);

    const scaleX = Math.abs(dx) > 1e-4 ? halfW / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 1e-4 ? halfH / Math.abs(dy) : Infinity;
    const t = Math.min(scaleX, scaleY);

    const ix = Math.round(cx + dx * t);
    const iy = Math.max(padTop, Math.min(height - padBot, Math.round(cy + dy * t)));

    const style = resolvePortalIndicatorStyle(state.portal.targetArea);
    const pulse = 1 + Math.sin(state.tick * 0.35) * 0.12;
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = style.outline;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = style.fill;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4.5);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = style.highlight;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-1, -1.8);
    ctx.lineTo(-0.5, 0);
    ctx.lineTo(-1, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (this.sprites.hasSprite('sprPortalIndicator')) {
      this.sprites.draw(ctx, 'sprPortalIndicator', Math.round(ix - Math.cos(angle) * 10), Math.round(iy - Math.sin(angle) * 10), {
        frame: 0,
        scaleX: 1,
        scaleY: 1,
        tintColor: state.portal.targetArea === '1-?' || state.portal.targetArea === 'vault' || state.portal.targetArea === 'hq-1' ? style.fill : undefined,
        pixelSnap: true,
      });
    }
  }

  /**
   * Full-screen Dramatic Boss Intro Splash ONLY (real Nuclear Throne never draws a bottom Boss HP bar).
   */
  private renderBossIntroSplash(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
    height: number,
  ): void {
    const boss = state.boss;
    if (!boss || boss.defeated || boss.introTicks <= 0) return;

    const bossEntity = state.enemies.find((e) => e.id === boss.entityId);
    if (bossEntity && bossEntity.aiState === 'sleep') return;

    const rawName = this.data.getEnemy(boss.bossId)?.name ?? boss.name;
    const bossDisplayName = resolveBossDisplayName(boss.bossId, rawName, this.isSteamMode);
    const bossSubtitle =
      boss.bossId === 'nuclear_throne'
        ? (boss.subtitle || 'THE END OF THE ROAD')
        : boss.subtitle;

    const fadeOut = boss.introTicks > 12 ? 1 : Math.min(1, boss.introTicks / 12);
    const slideIn = boss.introTicks > 50 ? Math.max(0, (boss.introTicks - 50) / 10) : 0;
    const slideOffsetX = Math.round(slideIn * 68);
    const flash = boss.introTicks >= 56 ? 0.38 : 0;

    ctx.save();
    ctx.globalAlpha = fadeOut;

    const steamBossFrame = BOSS_INTRO_FRAME_MAP[boss.bossId];
    const hasSteamBossSplash =
      steamBossFrame !== undefined &&
      this.sprites.hasSprite('sprBossIntro') &&
      this.sprites.hasSprite('sprBossName');

    if (hasSteamBossSplash) {
      const cx = Math.round(width * 0.5);

      ctx.fillStyle = '#09060d';
      ctx.fillRect(0, 0, width, height);

      if (this.sprites.hasSprite('sprBossIntroBackLayer')) {
        this.sprites.draw(ctx, 'sprBossIntroBackLayer', cx + Math.round(slideOffsetX * 0.4), 0, {
          frame: steamBossFrame,
          alpha: 1,
          pixelSnap: true,
        });
      }
      this.sprites.draw(ctx, 'sprBossIntro', cx - slideOffsetX, 0, {
        frame: steamBossFrame,
        alpha: 1,
        pixelSnap: true,
      });

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, 16);
      ctx.fillRect(0, height - 16, width, 16);

      const nameCenterX = cx - slideOffsetX;
      const nameCenterY = Math.round(height * 0.44);
      if (this.sprites.hasSprite('sprBossNameSplat')) {
        const splatFrame = Math.min(3, 1 + Math.floor((60 - Math.min(60, boss.introTicks)) * 0.25));
        this.sprites.draw(ctx, 'sprBossNameSplat', nameCenterX - 66, nameCenterY + 13, {
          frame: splatFrame,
          alpha: 1,
          pixelSnap: true,
        });
      }
      this.sprites.draw(ctx, 'sprBossName', nameCenterX - 50, nameCenterY - 2, {
        frame: steamBossFrame,
        alpha: 1,
        pixelSnap: true,
      });

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 240, 210, ${flash})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      return;
    }

    // Built-In Mode: Punchy Vlambeer-style cinematic poster splash
    const theme = BUILTIN_BOSS_THEMES[boss.bossId] ?? {
      sprite: 'sprBanditBossIdle',
      scale: 2,
      bandA: '#3d1520',
      bandB: '#6e2234',
      accent: '#ffe047',
      silhouette: '#1a0810',
    };

    ctx.fillStyle = '#09060e';
    ctx.fillRect(0, 0, width, height);

    const midY = Math.round(height * 0.5);
    ctx.fillStyle = theme.bandA;
    ctx.fillRect(0, midY - 64, width, 128);
    ctx.fillStyle = theme.bandB;
    ctx.fillRect(0, midY - 46, width, 92);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let sy = midY - 62; sy < midY + 62; sy += 6) {
      ctx.fillRect(0, sy, width, 2);
    }
    ctx.fillStyle = theme.accent;
    for (let l = 0; l < 12; l++) {
      const ly = midY - 52 + l * 9;
      const lw = 30 + ((l * 29) % 68);
      const lx = ((l * 83 + Math.round(state.tick * 9)) % (width + lw)) - lw;
      ctx.fillRect(lx, ly, lw, 2);
    }

    const bossSprX = Math.round(width * 0.78) - Math.round(slideOffsetX * 0.35);
    const bossSprY = midY + 2;
    const dRad = 52;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    for (let dy = -dRad; dy <= dRad; dy += 2) {
      const span = Math.max(0, dRad - Math.abs(dy));
      ctx.fillRect(bossSprX - span, midY + dy, span * 2, 2);
    }
    ctx.fillStyle = theme.accent;
    for (let dy = -dRad - 3; dy <= dRad + 3; dy += 2) {
      const outer = Math.max(0, dRad + 3 - Math.abs(dy));
      const inner = Math.max(0, dRad - 1 - Math.abs(dy));
      if (outer > inner) {
        ctx.fillRect(bossSprX - outer, midY + dy, outer - inner, 2);
        ctx.fillRect(bossSprX + inner, midY + dy, outer - inner, 2);
      }
    }

    // Draw nameplate brush-splat BEFORE the boss portrait so right brush tails tuck cleanly behind the boss
    const bandW = Math.min(Math.round(width * 0.44), 174);
    const bandH = bossSubtitle ? 48 : 32;
    const bandX = Math.round(width * 0.05) - slideOffsetX;
    const bandY = midY - Math.floor(bandH * 0.5);

    drawInkBrushSplat(ctx, bandX, bandY, bandW, bandH, '#000000', theme.accent);

    const portraitFrame = BOSS_INTRO_FRAME_MAP[boss.bossId] ?? 0;
    if (this.sprites.hasSprite('sprBuiltinBossPortrait')) {
      this.sprites.draw(ctx, 'sprBuiltinBossPortrait', bossSprX + 6, bossSprY + 4, {
        frame: portraitFrame,
        scaleX: 2,
        scaleY: 2,
        tintColor: theme.silhouette,
        pixelSnap: true,
      });
      this.sprites.draw(ctx, 'sprBuiltinBossPortrait', bossSprX, bossSprY, {
        frame: portraitFrame,
        scaleX: 2,
        scaleY: 2,
        pixelSnap: true,
      });
    } else if (this.sprites.hasSprite(theme.sprite)) {
      this.sprites.draw(ctx, theme.sprite, bossSprX + 5, bossSprY + 4, {
        frame: 0,
        scaleX: theme.scale,
        scaleY: theme.scale,
        tintColor: theme.silhouette,
        pixelSnap: true,
      });
      this.sprites.draw(ctx, theme.sprite, bossSprX, bossSprY, {
        frame: 0,
        scaleX: theme.scale,
        scaleY: theme.scale,
        pixelSnap: true,
      });
    }

    const textCenterX = bandX + Math.floor(bandW * 0.5);
    const nameFitsLarge = this.fonts.measure(bossDisplayName, 'fntL').width <= bandW - 14;
    this.fonts.draw(ctx, bossDisplayName, textCenterX, nameFitsLarge ? bandY + 6 : bandY + 10, nameFitsLarge ? 'fntL' : 'fntM1', {
      align: 'center',
      maxWidth: bandW - 12,
      color: '#ffffff',
      outline: true,
    });
    if (bossSubtitle) {
      this.fonts.draw(ctx, bossSubtitle.toUpperCase(), textCenterX, bandY + 29, 'fntSmall', {
        align: 'center',
        maxWidth: bandW - 14,
        color: theme.accent,
        outline: true,
      });
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 20);
    ctx.fillRect(0, height - 20, width, 20);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(0, 20, width, 2);
    ctx.fillRect(0, height - 22, width, 2);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 240, 205, ${flash})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}
