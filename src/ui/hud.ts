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
  type UiDataProvider,
} from './data-provider';

interface AmmoPoolHudSpec {
  type: AmmoType;
  iconSprites: readonly string[];
  ammoIconsFrame: number;
  color: string;
  shortLabel: string;
}

const AMMO_POOL_SPECS: readonly AmmoPoolHudSpec[] = [
  { type: 'bullet', iconSprites: ['sprBulletIcon'], ammoIconsFrame: 0, color: '#f5cc47', shortLabel: 'B' },
  { type: 'shell', iconSprites: ['sprShotIcon', 'sprShellIcon'], ammoIconsFrame: 1, color: '#e65c38', shortLabel: 'S' },
  { type: 'bolt', iconSprites: ['sprBoltIcon'], ammoIconsFrame: 2, color: '#59e06e', shortLabel: 'X' },
  { type: 'explosive', iconSprites: ['sprExploIcon'], ammoIconsFrame: 3, color: '#ff8a2b', shortLabel: 'E' },
  { type: 'energy', iconSprites: ['sprEnergyIcon'], ammoIconsFrame: 4, color: '#59c7ff', shortLabel: 'N' },
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

const AMMO_TYPE_ACCENT: Record<AmmoType, string> = {
  melee: '#c4d0e0',
  bullet: '#f5cc47',
  shell: '#e65c38',
  bolt: '#59e06e',
  explosive: '#ff8a2b',
  energy: '#59c7ff',
};

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
  slot: 'a' | 'b',
  totalFrames: number = 24,
): number {
  const offset = slot === 'b' ? 1 : 0;
  if (totalFrames >= 51) {
    return Math.max(0, raceIndex) * 3 + offset;
  }
  if (totalFrames >= 36) {
    return Math.max(0, raceIndex - 1) * 3 + offset;
  }
  return Math.max(0, raceIndex - 1) * 2 + offset;
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
 * Unifies Boss Intro splash and Boss HP bar naming across Steam Pack & Built-In Art modes:
 * Steam `sprBossName` frame 3 reads "THE THRONE", so Steam mode matches it cleanly;
 * Built-In mode consistently uses "THE KRUNKED THRONE" on both splash and boss bar.
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
 * Pixel-exact Krunked Throne Canvas HUD renderer:
 * - Slim top bar staying tight to upper edge so bosses/statues stay unobstructed
 * - HP bar (sprHealthBar / sprHealthFill + white damage trail + pixel/Steam Strong Spirit halo)
 * - Rad canister (sprExpBarLevel cleanly BEHIND sprExpBar so white rim never wipes green fill)
 * - Crisp integer-scaled Active & Secondary weapon cards with dual reload bars & clean swap badge
 * - Crisp 1x integer 5-ammo-pool strip with readable dimmed 0-ammo icons
 * - Destination-colored off-screen Portal indicator clamped cleanly below ammo strip (padTop >= 42)
 * - Full-screen opaque NT Boss Intro splash (hiding HUD during introTicks > 0) + beveled Boss HP bar
 */
export class HudRenderer {
  private bundle: AssetBundle;
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;
  private displayedHpFrac = 1;
  private displayedBossHpFrac = 1;
  private lastBossEntityId = -1;

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

    // Match authentic Nuclear Throne: hide normal HUD during active Boss Intro splash
    if (this.isBossIntroActive(state)) {
      this.renderBossHud(ctx, state, width, height);
      return;
    }

    this.renderTopLeftVitals(ctx, state);
    this.renderWeaponsAndAmmo(ctx, state, width, inputMode, gamepadFamily);
    this.renderTopRightStats(ctx, state, renderSettings, fps, width);
    this.renderMutationIcons(ctx, state);
    this.renderOffscreenChestIndicators(ctx, state, camera, width, height);
    this.renderOffscreenPortalIndicator(ctx, state, camera, width, height);
    this.renderBossHud(ctx, state, width, height);
  }

  private renderTopLeftVitals(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
  ): void {
    const player = state.player;
    const hp = Math.max(0, player.hp);
    const maxHp = Math.max(1, player.maxHp);
    const hpFrac = Math.min(1, hp / maxHp);

    // Smoothly decay white damage trail behind current HP
    if (hpFrac > this.displayedHpFrac) {
      this.displayedHpFrac = hpFrac;
    } else {
      this.displayedHpFrac += (hpFrac - this.displayedHpFrac) * 0.14;
      if (Math.abs(this.displayedHpFrac - hpFrac) < 0.005) {
        this.displayedHpFrac = hpFrac;
      }
    }

    // 1. Rad Canister (far top-left; stays full at Level 10 Ultra with clean rad count)
    const radX = 4;
    const radY = 3;
    const isUltraLevel = player.level >= 10 || player.radsToNextLevel >= 9999;
    const radFrac = isUltraLevel
      ? 1
      : player.radsToNextLevel > 0
        ? Math.max(0, Math.min(1, player.rads / player.radsToNextLevel))
        : 1;
    const expBarSpr = this.sprites.getSprite('sprExpBar');
    if (expBarSpr && expBarSpr.frames.length > 0 && this.sprites.hasSprite('sprExpBar')) {
      const fillFrame = Math.min(
        expBarSpr.frames.length - 1,
        Math.round(radFrac * (expBarSpr.frames.length - 1)),
      );
      const levelGlowOn = state.pendingLevelUps > 0 && Math.floor(state.tick / 6) % 2 === 0;
      if (levelGlowOn) {
        // CRITICAL: Draw sprExpBarLevel BEFORE sprExpBar (behind it!) so Steam's 16x26
        // black-interior glow sprite frames the green canister with its 1px white rim
        // instead of wiping the canister fill to solid black.
        const lvlSpr = this.sprites.getSprite('sprExpBarLevel');
        if (lvlSpr && lvlSpr.width <= expBarSpr.width) {
          // Built-In fallback sprExpBarLevel is 14x24 (no 1px outer lip): add crisp 1px outer rim behind
          drawPixelBorder(ctx, radX - 1, radY - 1, expBarSpr.width + 2, expBarSpr.height + 2, '#ffe047', 1);
        }
        this.sprites.draw(ctx, 'sprExpBarLevel', radX, radY, { frame: 0, pixelSnap: true });
      }
      this.sprites.draw(ctx, 'sprExpBar', radX, radY, { frame: fillFrame, pixelSnap: true });
    } else {
      ctx.fillStyle = '#0e0c14';
      ctx.fillRect(radX, radY, 14, 24);
      ctx.fillStyle = '#1f2b22';
      ctx.fillRect(radX + 2, radY + 2, 10, 20);
      const fillH = Math.round(20 * radFrac);
      ctx.fillStyle = state.pendingLevelUps > 0 ? '#a8ff6e' : '#4de862';
      ctx.fillRect(radX + 2, radY + 22 - fillH, 10, fillH);
      drawPixelBorder(ctx, radX, radY, 14, 24, state.pendingLevelUps > 0 ? '#ffe047' : '#738578', 1);
    }

    // Compact LV badge underneath rad canister with dark backing for desert/snow contrast
    const lvLabel = player.level >= 10 ? '@gULT' : `@wLV${player.level}`;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.72)';
    ctx.fillRect(radX - 1, radY + 24, 16, 8);
    this.fonts.draw(ctx, lvLabel, radX + 7, radY + 26, 'fntSmall', {
      align: 'center',
      outline: false,
      shadow: true,
    });

    // 2. HP Bar (beside rad canister)
    const barX = 20;
    const barY = 3;
    const barW = 88;
    const barH = 14;
    const innerX = barX + 3;
    const innerY = barY + 3;
    const innerW = 82;
    const innerH = 8;

    const hasHealthBar = this.sprites.hasSprite('sprHealthBar');
    if (hasHealthBar) {
      this.sprites.draw(ctx, 'sprHealthBar', barX, barY, { frame: 0, pixelSnap: true });
    } else {
      ctx.fillStyle = '#0c0910';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#2e161d';
      ctx.fillRect(innerX, innerY, innerW, innerH);
      drawPixelBorder(ctx, barX, barY, barW, barH, '#5c4b52', 1);
    }

    const fillW = Math.round(innerW * hpFrac);
    const trailW = Math.round(innerW * this.displayedHpFrac);

    // White damage trail (drawn strictly in the lost-HP delta when trailW > fillW)
    if (trailW > fillW) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(innerX + fillW, innerY, trailW - fillW, innerH);
    }

    // Actual red HP fill (frame 0 = WHITE hurt flash, frame 1 = CRIMSON RED normal fill)
    if (fillW > 0) {
      const frame = resolveHealthFillFrame(player.hurtFlashTicks);
      const drewFill = this.sprites.draw(ctx, 'sprHealthFill', innerX, innerY, {
        frame,
        scaleX: fillW,
        scaleY: 1,
        pixelSnap: true,
      });
      if (!drewFill) {
        ctx.fillStyle = player.hurtFlashTicks > 0 ? '#ffffff' : '#fc3800';
        ctx.fillRect(innerX, innerY, fillW, innerH);
        if (player.hurtFlashTicks <= 0) {
          ctx.fillStyle = '#ff6a3d';
          ctx.fillRect(innerX, innerY, fillW, 2);
          ctx.fillStyle = '#a81c00';
          ctx.fillRect(innerX, innerY + innerH - 2, fillW, 2);
        }
      }
    }

    // Boiling Veins active protection glow on HP bar when <= 4 HP (fire & explosion immunity active!)
    const boilingActive =
      player.alive && hp <= 4 && player.mutations.includes('boiling_veins');
    if (boilingActive) {
      const bvPulse = 0.55 + 0.45 * Math.sin(state.tick * 0.4);
      drawPixelBorder(ctx, barX - 1, barY - 1, barW + 2, barH + 2, bvPulse > 0.78 ? '#ffe047' : '#ff7b24', 1);
      ctx.fillStyle = `rgba(255, 130, 35, ${(0.20 * bvPulse).toFixed(3)})`;
      ctx.fillRect(innerX, innerY, innerW, innerH);
    }

    // HP numeric text centered in bar — never blink for full 2/2 HP Melting!
    const lowHpBlink = hp < maxHp && hp <= 2 && Math.floor(state.tick / 5) % 2 === 0;
    const hpColor = lowHpBlink ? '@y' : '@w';
    this.fonts.draw(
      ctx,
      `${hpColor}${Math.ceil(hp)}/${maxHp}`,
      barX + Math.floor(barW / 2),
      barY + 3,
      'fntM1',
      { align: 'center', outline: true },
    );

    // Strong Spirit crisp pixel/Steam halo tucked right of HP bar (zero smooth anti-aliased ctx.arc!)
    if (player.mutations.includes('strong_spirit')) {
      const ssBoxX = barX + barW + 2;
      const ssBoxY = barY + 2;
      const ready = player.strongSpiritReady;
      const drewSteamHalo =
        this.isSteamMode &&
        this.sprites.hasSprite('sprStrongSpirit') &&
        this.drawSpriteIntegerOrFit(ctx, 'sprStrongSpirit', 0, ssBoxX, ssBoxY, 12, 10, {
          alpha: ready ? 1 : 0.36,
          tintColor: ready ? undefined : '#5b677d',
        });

      if (!drewSteamHalo) {
        // Crisp 10x7 pixel-art halo ring (100% integer fillRect pixels, zero ctx.arc)
        const hx = ssBoxX + 1;
        const hy = barY + 4;
        const outlineCol = '#0c0914';
        const ringCol = ready ? '#78ebff' : '#4f5b6e';
        const hiCol = ready ? '#e4fcff' : '#738299';
        const pulseLit = ready && Math.floor(state.tick / 8) % 2 === 0;

        // 1px dark outer backing
        ctx.fillStyle = outlineCol;
        ctx.fillRect(hx + 1, hy - 1, 8, 1);
        ctx.fillRect(hx + 1, hy + 6, 8, 1);
        ctx.fillRect(hx - 1, hy + 1, 1, 4);
        ctx.fillRect(hx + 10, hy + 1, 1, 4);
        ctx.fillRect(hx, hy, 1, 1);
        ctx.fillRect(hx + 9, hy, 1, 1);
        ctx.fillRect(hx, hy + 5, 1, 1);
        ctx.fillRect(hx + 9, hy + 5, 1, 1);

        // Crisp 10x6 stepped pixel halo ellipse
        ctx.fillStyle = ringCol;
        ctx.fillRect(hx + 2, hy, 6, 1);
        ctx.fillRect(hx + 2, hy + 5, 6, 1);
        ctx.fillRect(hx + 1, hy + 1, 2, 1);
        ctx.fillRect(hx + 7, hy + 1, 2, 1);
        ctx.fillRect(hx, hy + 2, 2, 2);
        ctx.fillRect(hx + 8, hy + 2, 2, 2);
        ctx.fillRect(hx + 1, hy + 4, 2, 1);
        ctx.fillRect(hx + 7, hy + 4, 2, 1);

        // Bright top specular rim
        ctx.fillStyle = pulseLit ? '#ffffff' : hiCol;
        ctx.fillRect(hx + 3, hy, 4, 1);
        ctx.fillRect(hx + 1, hy + 1, 1, 1);
        if (ready) {
          ctx.fillStyle = 'rgba(120, 235, 255, 0.28)';
          ctx.fillRect(hx + 2, hy + 2, 6, 2);
        }
      }
    }

    // High-contrast compact dark pill behind Rad numeric readout
    // At Level 10 Ultra, NT displays only the raw rad count (never "X/9999").
    const radLabel = isUltraLevel
      ? `@g${player.rads}`
      : `@g${player.rads}@w/${player.radsToNextLevel}`;
    const radM = this.fonts.measure(radLabel, 'fntSmall');
    const radPillW = radM.width + 6;
    const radPillY = barY + barH + 1;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.72)';
    ctx.fillRect(barX, radPillY, radPillW, 9);
    drawPixelBorder(ctx, barX, radPillY, radPillW, 9, 'rgba(77, 232, 98, 0.42)', 1);
    this.fonts.draw(ctx, radLabel, barX + 3, radPillY + 2, 'fntSmall', {
      outline: false,
      shadow: true,
    });

    // Timed status chip beside rad readout (Chicken Headless / Fish Gun Warrant)
    if (player.headlessTicks > 0 && player.alive) {
      const secs = (player.headlessTicks / 30).toFixed(1);
      const tx = barX + radPillW + 3;
      const lbl = `@rHEAD ${secs}S`;
      const lm = this.fonts.measure(lbl, 'fntSmall');
      ctx.fillStyle = 'rgba(32, 8, 12, 0.85)';
      ctx.fillRect(tx, radPillY, lm.width + 4, 9);
      this.fonts.draw(ctx, lbl, tx + 2, radPillY + 2, 'fntSmall', { shadow: true });
    } else if (player.gunWarrantTicks > 0) {
      const secs = (player.gunWarrantTicks / 30).toFixed(1);
      const tx = barX + radPillW + 3;
      const lbl = `@yINF ${secs}S`;
      const lm = this.fonts.measure(lbl, 'fntSmall');
      ctx.fillStyle = 'rgba(26, 20, 8, 0.85)';
      ctx.fillRect(tx, radPillY, lm.width + 4, 9);
      this.fonts.draw(ctx, lbl, tx + 2, radPillY + 2, 'fntSmall', { shadow: true });
    }
  }

  private renderWeaponsAndAmmo(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
    inputMode: HudInputDeviceMode,
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    const player = state.player;
    const activeSlot = player.weapons[player.activeSlot];
    const secondarySlot = player.weapons[player.activeSlot === 0 ? 1 : 0];
    const activeDef = activeSlot ? this.data.getWeapon(activeSlot.weaponId) : undefined;

    const isWide = width >= 380;
    const activeCardW = isWide ? 82 : 68;
    const secCardW = isWide ? 48 : 42;
    const cardH = 18;
    const cardGap = 2;
    const totalCardsW = activeCardW + (secondarySlot ? secCardW + cardGap : 0);

    // Anchor cluster consistently between top-left vitals and top-right stats
    const clusterCenterX = isWide ? Math.round(width * 0.5) : 186;
    const startX = Math.max(114, Math.min(width - totalCardsW - 44, Math.round(clusterCenterX - totalCardsW * 0.5)));
    const cardY = 2;

    // 1. Active Weapon Card (slim translucent NT backdrop + left ammo stripe + crisp 1x sprite + reload bar)
    if (activeSlot) {
      const boxX = startX;
      const boxY = cardY;
      const boxW = activeCardW;
      const boxH = cardH;
      const ammoType = activeDef?.ammoType ?? 'melee';
      const accentCol = AMMO_TYPE_ACCENT[ammoType] ?? '#c4d0e0';
      const isEmpty =
        ammoType !== 'melee' &&
        player.gunWarrantTicks <= 0 &&
        (player.ammo[ammoType] ?? 0) < (activeDef?.ammoCost ?? 1);
      const emptyPulse = isEmpty && Math.floor(state.tick / 6) % 2 === 0;

      ctx.fillStyle = 'rgba(10, 8, 16, 0.70)';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Left ammo-class accent bar
      ctx.fillStyle = emptyPulse ? '#ff3b47' : accentCol;
      ctx.fillRect(boxX + 1, boxY + 1, 2, boxH - 2);

      // Crisp 1px pixel frame border
      const borderCol = emptyPulse
        ? '#ff454f'
        : activeSlot.cursed
          ? '#c852ff'
          : activeDef?.golden
            ? '#ffd84d'
            : 'rgba(176, 178, 196, 0.68)';
      drawPixelBorder(ctx, boxX, boxY, boxW, boxH, borderCol, 1);

      const wepSpr = resolveWeaponSpriteName(activeSlot.weaponId, this.data);
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX + 4, boxY + 1, boxW - 6, 10);
      ctx.clip();
      const drew = this.drawSpriteIntegerOrFit(ctx, wepSpr, 0, boxX + 5, boxY + 1, boxW - 8, 10);
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(activeSlot.weaponId, this.data).slice(0, 12),
          boxX + Math.floor(boxW / 2) + 1,
          boxY + 2,
          'fntSmall',
          { align: 'center', color: '#ffffff' },
        );
      }
      ctx.restore();

      // Compact weapon label tucked cleanly under barrel
      const shortName = resolveWeaponLabel(activeSlot.weaponId, this.data);
      const maxChars = isWide ? 16 : 13;
      const clipped =
        shortName.length > maxChars
          ? `${shortName.slice(0, maxChars - 1).trimEnd()}.`
          : shortName;
      this.fonts.draw(ctx, clipped, boxX + Math.floor(boxW / 2) + 1, boxY + 11, 'fntSmall', {
        align: 'center',
        color: isEmpty ? '#ff7078' : activeDef?.golden ? '#ffe047' : activeSlot.cursed ? '#d47aff' : '#e4e8f2',
        shadow: true,
      });

      // Integrated reload progress bar along the bottom 1px inside the card
      if (activeSlot.reloadTicks > 0 && activeSlot.maxReloadTicks > 0) {
        const frac = 1 - Math.max(0, Math.min(1, activeSlot.reloadTicks / activeSlot.maxReloadTicks));
        ctx.fillStyle = 'rgba(255, 224, 71, 0.25)';
        ctx.fillRect(boxX + 3, boxY + boxH - 2, boxW - 4, 1);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(boxX + 3, boxY + boxH - 2, Math.max(1, Math.round((boxW - 4) * frac)), 1);
      }
    }

    // 2. Secondary Weapon Card (dimmed sleek card + dedicated corner swap badge outside barrel + reload bar!)
    if (secondarySlot) {
      const boxX = startX + activeCardW + cardGap;
      const boxY = cardY + 1;
      const boxW = secCardW;
      const boxH = cardH - 2;
      const secDef = this.data.getWeapon(secondarySlot.weaponId);
      const secAccent = AMMO_TYPE_ACCENT[secDef?.ammoType ?? 'melee'] ?? '#8a8e9e';
      const showSwapBadge = inputMode !== 'touch';
      const swapKey =
        inputMode === 'gamepad' ? getGamepadGlyphs(gamepadFamily).swap : 'Q';
      const measuredSwap = showSwapBadge
        ? this.fonts.measure(swapKey, 'fntSmall')
        : { width: 0, height: 0 };
      const swapTagW = showSwapBadge ? Math.max(9, measuredSwap.width + 4) : 0;
      const badgeReserveW = showSwapBadge ? swapTagW + 1 : 0;

      ctx.fillStyle = 'rgba(10, 8, 16, 0.58)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = secAccent;
      ctx.fillRect(boxX + 1, boxY + 1, 1, boxH - 2);
      drawPixelBorder(
        ctx,
        boxX,
        boxY,
        boxW,
        boxH,
        secondarySlot.cursed ? '#9a40cc' : 'rgba(110, 112, 132, 0.58)',
        1,
      );

      // Weapon sprite sits strictly inside the left region so barrel NEVER overlaps Q/Y badge!
      const spriteRegionW = boxW - 4 - badgeReserveW;
      const secSpr = resolveWeaponSpriteName(secondarySlot.weaponId, this.data);
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX + 2, boxY + 1, spriteRegionW, boxH - 3);
      ctx.clip();
      const drew = this.drawSpriteIntegerOrFit(
        ctx,
        secSpr,
        0,
        boxX + 3,
        boxY + 1,
        Math.max(8, spriteRegionW - 2),
        boxH - 3,
        { alpha: 0.80 },
      );
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(secondarySlot.weaponId, this.data).slice(0, 6),
          boxX + 2 + Math.floor(spriteRegionW / 2),
          boxY + 5,
          'fntSmall',
          { align: 'center', color: '#9ca0ad' },
        );
      }
      ctx.restore();

      // Secondary weapon reload bar (critical for Steroids dual-wielding!)
      if (secondarySlot.reloadTicks > 0 && secondarySlot.maxReloadTicks > 0) {
        const sFrac =
          1 - Math.max(0, Math.min(1, secondarySlot.reloadTicks / secondarySlot.maxReloadTicks));
        ctx.fillStyle = 'rgba(255, 224, 71, 0.25)';
        ctx.fillRect(boxX + 2, boxY + boxH - 2, boxW - 4, 1);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(boxX + 2, boxY + boxH - 2, Math.max(1, Math.round((boxW - 4) * sFrac)), 1);
      }

      // Dedicated swap key badge tucked cleanly in top-right corner outside barrel clip region
      if (showSwapBadge) {
        const tagW = swapTagW;
        const tagH = 8;
        const tagX = boxX + boxW - tagW - 1;
        const tagY = boxY + 1;
        ctx.fillStyle = 'rgba(20, 16, 30, 0.90)';
        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.fillStyle = 'rgba(130, 126, 152, 0.45)';
        ctx.fillRect(tagX, tagY, 1, tagH);
        ctx.fillRect(tagX, tagY + tagH - 1, tagW, 1);
        this.fonts.draw(ctx, swapKey, tagX + Math.ceil(tagW / 2), tagY + 1, 'fntSmall', {
          align: 'center',
          color: inputMode === 'gamepad' ? '#ffe047' : '#c8cde0',
          shadow: true,
        });
      }
    }

    // 3. Slim 5-Ammo-Pool Strip tucked tightly under weapon cards (y = 21..33) with crisp 1x integer icons
    const poolStep = isWide ? 29 : 27;
    const stripW = AMMO_POOL_SPECS.length * poolStep;
    const rogueExtraW = player.mutant === 'rogue' ? 21 : 0;
    const pillW = stripW + rogueExtraW + 6;
    const pillH = 12;
    const pillY = cardY + cardH + 1;
    const rightLimit = width - (isWide ? 56 : 48);
    const pillX = Math.max(98, Math.min(rightLimit - pillW, Math.round(clusterCenterX - pillW * 0.5)));
    const stripX = pillX + 3;

    ctx.fillStyle = 'rgba(10, 8, 16, 0.68)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    drawPixelBorder(ctx, pillX, pillY, pillW, pillH, 'rgba(136, 130, 164, 0.36)', 1);

    for (let i = 0; i < AMMO_POOL_SPECS.length; i++) {
      const spec = AMMO_POOL_SPECS[i]!;
      const ax = stripX + i * poolStep;
      const count = player.ammo[spec.type] ?? 0;
      const max = Math.max(1, player.ammoMax[spec.type] ?? 1);
      const frac = Math.max(0, Math.min(1, count / max));
      const isCurrent = activeDef?.ammoType === spec.type;
      const low = count === 0 || frac <= 0.15;

      // Active pool subtle highlight
      if (isCurrent) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
        ctx.fillRect(ax - 1, pillY + 1, poolStep - 1, pillH - 2);
      }

      // Micro reserve fill bar along bottom pixel of each pool slot
      const meterW = poolStep - 3;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fillRect(ax, pillY + pillH - 2, meterW, 1);
      ctx.fillStyle = low ? '#ff424c' : spec.color;
      ctx.fillRect(ax, pillY + pillH - 2, Math.round(meterW * frac), 1);

      // Draw ammo icon sprite at CRISP INTEGER 1x scale (zero 0.7x mixels!)
      // In Built-In mode, frame 7 has an 82% opaque black smudge baked in — render crisp frame 0
      // with readable dimmed alpha + clipped fill level so 0-ammo icons stay clearly recognizable!
      let drewIcon = false;
      const iconBoxW = 10;
      const iconBoxH = 10;
      const iconY = pillY + 1;

      for (const candidate of spec.iconSprites) {
        const iconDef = this.sprites.getSprite(candidate);
        if (iconDef && this.sprites.hasSprite(candidate)) {
          if (this.isSteamMode) {
            const iconFrame = computeAmmoIconFrame(
              count,
              max,
              iconDef.frames.length,
              player.gunWarrantTicks,
            );
            drewIcon = this.drawSpriteIntegerOrFit(ctx, candidate, iconFrame, ax, iconY, iconBoxW, iconBoxH, {
              alpha: count === 0 && player.gunWarrantTicks <= 0 ? 0.78 : 1,
            });
          } else {
            // Built-In art: crisp 1x dimmed silhouette + bottom-up lit reserve fill (zero black-smudge frame 7!)
            const effFrac = player.gunWarrantTicks > 0 ? 1 : frac;
            drewIcon = this.drawSpriteIntegerOrFit(ctx, candidate, 0, ax, iconY, iconBoxW, iconBoxH, {
              alpha: effFrac <= 0 ? 0.42 : 0.32,
            });
            if (drewIcon && effFrac > 0) {
              const fillH = Math.max(1, Math.round(iconBoxH * effFrac));
              ctx.save();
              ctx.beginPath();
              ctx.rect(ax, iconY + iconBoxH - fillH, iconBoxW, fillH);
              ctx.clip();
              this.drawSpriteIntegerOrFit(ctx, candidate, 0, ax, iconY, iconBoxW, iconBoxH, {
                alpha: 1,
              });
              ctx.restore();
            }
          }
          if (drewIcon) break;
        }
      }
      if (!drewIcon && this.sprites.hasSprite('sprAmmoIcons')) {
        drewIcon = this.drawSpriteIntegerOrFit(
          ctx,
          'sprAmmoIcons',
          spec.ammoIconsFrame,
          ax,
          iconY,
          iconBoxW,
          iconBoxH,
          { alpha: count === 0 && player.gunWarrantTicks <= 0 ? 0.42 : 1 },
        );
      }
      if (!drewIcon) {
        ctx.fillStyle = '#0c0910';
        ctx.fillRect(ax + 1, iconY + 2, 6, 6);
        ctx.fillStyle = count === 0 ? '#5e6270' : spec.color;
        ctx.fillRect(ax + 2, iconY + 3, 4, 4);
      }

      const countColor =
        player.gunWarrantTicks > 0
          ? '#ffe047'
          : low
            ? '#ff525c'
            : isCurrent
              ? '#ffffff'
              : '#b4b9c9';
      const label = player.gunWarrantTicks > 0 ? 'INF' : String(count);
      this.fonts.draw(ctx, label, ax + 10, pillY + 3, 'fntSmall', {
        color: countColor,
        outline: false,
        shadow: true,
      });
    }

    // Rogue Portal Strike canisters at crisp 1x integer scale
    if (player.mutant === 'rogue') {
      const rx = stripX + stripW + 2;
      const rogueDef = this.sprites.getSprite('sprRogueAmmoHUD');
      let drewRogue = false;
      if (rogueDef && this.sprites.hasSprite('sprRogueAmmoHUD')) {
        const rf = Math.max(0, Math.min(rogueDef.frames.length - 1, player.portalStrikes));
        drewRogue = this.drawSpriteIntegerOrFit(ctx, 'sprRogueAmmoHUD', rf, rx, pillY - 1, 11, 14);
      }
      if (!drewRogue) {
        ctx.fillStyle = player.portalStrikes > 0 ? '#52a8ff' : '#3a4659';
        ctx.fillRect(rx + 2, pillY + 3, 5, 6);
      }
      this.fonts.draw(ctx, String(player.portalStrikes), rx + 11, pillY + 3, 'fntSmall', {
        color: player.portalStrikes > 0 ? '#8ce6ff' : '#6f7e94',
        shadow: true,
      });
    }
  }

  private renderTopRightStats(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    renderSettings: RenderSettings,
    fps: number,
    width: number,
  ): void {
    const rightX = width - 4;

    // Area + Loop badge & Kills inside a crisp compact corner pill
    const areaText = state.loop > 0 ? `@yL${state.loop} @w${state.areaCode}` : `@w${state.areaCode}`;
    const killsText = String(state.stats.kills);
    const areaM = this.fonts.measure(areaText, 'fntM1');
    const killsM = this.fonts.measure(killsText, 'fntSmall');
    const skullSpr = this.sprites.getSprite('sprKillsIcon');
    const skullW = skullSpr ? Math.min(13, skullSpr.width) : 10;
    const boxW = Math.max(38, Math.max(areaM.width, killsM.width + skullW + 4) + 8);
    const boxX = rightX - boxW;
    const boxY = 2;
    const boxH = 24;

    ctx.fillStyle = 'rgba(10, 8, 16, 0.68)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    drawPixelBorder(ctx, boxX, boxY, boxW, boxH, 'rgba(136, 130, 164, 0.36)', 1);

    this.fonts.draw(ctx, areaText, rightX - 3, boxY + 2, 'fntM1', {
      align: 'right',
      outline: true,
    });

    this.fonts.draw(ctx, killsText, rightX - 3, boxY + 14, 'fntSmall', {
      align: 'right',
      color: '#e8eaf2',
      shadow: true,
    });
    const iconX = rightX - 3 - killsM.width - skullW - 2;
    const drewSkull = this.drawSpriteIntegerOrFit(ctx, 'sprKillsIcon', 0, iconX, boxY + 11, skullW, 13);
    if (!drewSkull) {
      ctx.fillStyle = '#e03646';
      ctx.fillRect(iconX + 2, boxY + 14, 5, 5);
    }

    // Active Crown icon tucked neatly beneath stats pill at crisp 1x integer scale
    let nextRightY = boxY + boxH + 2;
    if (state.crown !== 'none') {
      const crownDef = this.data.getCrown(state.crown);
      this.drawSpriteIntegerOrFit(ctx, crownDef.spriteIdle, 0, rightX - 16, nextRightY, 16, 14);
      nextRightY += 15;
    }

    // Optional FPS counter cleanly below Crown
    if (renderSettings.showFps) {
      const targetFps = renderSettings.targetFps ?? (renderSettings.classic30Fps ? 30 : 120);
      const fpsColor = fps >= Math.min(55, targetFps * 0.85) ? '@g' : fps >= 28 ? '@y' : '@r';
      this.fonts.draw(ctx, `${fpsColor}${Math.round(fps)}/${targetFps}`, rightX - 1, nextRightY + 1, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }
  }

  private renderMutationIcons(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
  ): void {
    const mutations = state.player.mutations;
    const ultra = state.player.ultra;
    if (mutations.length === 0 && !ultra) return;

    // Crisp 1x integer 16x16 HUD mutation icons strictly clear of ammo strip (y >= 36) and touch corners
    const startX = 4;
    const startY = 36;
    const step = 17;
    const perRow = 5;

    for (let i = 0; i < mutations.length; i++) {
      const mutId = mutations[i]!;
      const def = this.data.getMutation(mutId);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * step;
      const y = startY + row * step;

      const drew = def
        ? this.drawSpriteIntegerOrFit(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, x, y, 16, 16)
        : false;
      if (!drew) {
        ctx.fillStyle = '#181322';
        ctx.fillRect(x, y, 14, 14);
        ctx.fillStyle = '#4de862';
        ctx.fillRect(x + 2, y + 2, 10, 10);
      }
    }

    if (ultra) {
      const uDef = this.data.getUltra(ultra);
      const mutantDef = this.data.getMutant(state.player.mutant);
      const egHudSpr = this.sprites.getSprite('sprEGIconHUD');
      const idx = mutations.length;
      const x = startX + (idx % perRow) * step;
      const y = startY + Math.floor(idx / perRow) * step;
      const ultraFrame = uDef
        ? computeUltraIconFrame(mutantDef.raceIndex, uDef.slot, egHudSpr?.frames.length ?? 24)
        : 0;
      const drew = uDef
        ? this.drawSpriteIntegerOrFit(ctx, 'sprEGIconHUD', ultraFrame, x - 1, y - 1, 18, 18)
        : false;
      if (!drew) {
        ctx.fillStyle = '#181322';
        ctx.fillRect(x, y, 14, 14);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 2, y + 2, 10, 10);
      }
    }
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
    const padBot = 14;
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
      return; // Portal is already visible on screen
    }

    const cx = width * 0.5;
    const cy = height * 0.5;
    const dx = scr.x - cx;
    const dy = scr.y - cy;
    const angle = Math.atan2(dy, dx);

    const padX = 16;
    const padTop = PORTAL_INDICATOR_PAD_TOP; // >= 42px so it NEVER overlaps top ammo strip (y=21..33)
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

    // Crisp integer 1x sprPortalIndicator behind the chevron tip
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

  private renderBossHud(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
    height: number,
  ): void {
    const boss = state.boss;
    if (!boss || boss.defeated) return;

    // Hide Boss HP bar & intro banner while boss entity is still asleep (e.g. 3-3 Big Dog / 7-3 Throne)
    const bossEntity = state.enemies.find((e) => e.id === boss.entityId);
    if (bossEntity && bossEntity.aiState === 'sleep') return;

    const rawName = this.data.getEnemy(boss.bossId)?.name ?? boss.name;
    const bossDisplayName = resolveBossDisplayName(boss.bossId, rawName, this.isSteamMode);
    const bossSubtitle =
      boss.bossId === 'nuclear_throne'
        ? (boss.subtitle || 'THE END OF THE ROAD')
        : boss.subtitle;

    // 1. Full-screen Dramatic Boss Intro Splash (opaque cinematic letterbox; hides HUD & Boss HP bar!)
    if (boss.introTicks > 0) {
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

        // Clean opaque dark cinematic backdrop so ZERO ghosted HUD/world bleeds through!
        ctx.fillStyle = '#09060d';
        ctx.fillRect(0, 0, width, height);

        // Opaque Steam back layer & foreground boss illustration (alpha = 1 during hold!)
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

        // Cinematic dark letterbox bars top & bottom
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, width, 14);
        ctx.fillRect(0, height - 14, width, 14);

        // Exact origin-aligned sprBossNameSplat directly behind sprBossName:
        // sprBossName visual center sits at (+50, +2) from origin=(40,37)
        // sprBossNameSplat frame 3 visual center sits at (+66, -13) from origin=(30,60)
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

      // Built-In Mode: Punchy Vlambeer-style cinematic poster splash + boss emblem silhouette!
      const theme = BUILTIN_BOSS_THEMES[boss.bossId] ?? {
        sprite: 'sprBanditBossIdle',
        scale: 2,
        bandA: '#3d1520',
        bandB: '#6e2234',
        accent: '#ffe047',
        silhouette: '#1a0810',
      };

      // Opaque dark cinematic stage
      ctx.fillStyle = '#09060e';
      ctx.fillRect(0, 0, width, height);

      // Dramatic diagonal stepped wasteland poster ribbons behind boss
      const midY = Math.round(height * 0.5);
      ctx.fillStyle = theme.bandA;
      ctx.fillRect(0, midY - 62, width, 124);
      ctx.fillStyle = theme.bandB;
      ctx.fillRect(0, midY - 46, width, 92);

      // Stepped pixel diagonal halftone/speed lines across the poster field
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      for (let sy = midY - 60; sy < midY + 60; sy += 6) {
        ctx.fillRect(0, sy, width, 2);
      }
      ctx.fillStyle = theme.accent;
      for (let l = 0; l < 10; l++) {
        const ly = midY - 48 + l * 10;
        const lw = 34 + ((l * 29) % 72);
        const lx = ((l * 83 + Math.round(state.tick * 9)) % (width + lw)) - lw;
        ctx.fillRect(lx, ly, lw, 2);
      }

      // Boss silhouette + crisp integer-scaled boss emblem on the right/center stage
      const bossSprX = Math.round(width * 0.68) - Math.round(slideOffsetX * 0.6);
      const bossSprY = midY + 6;
      if (this.sprites.hasSprite(theme.sprite)) {
        // Oversized dark crimson/ink backlit silhouette offset
        this.sprites.draw(ctx, theme.sprite, bossSprX + 5, bossSprY + 4, {
          frame: 0,
          scaleX: theme.scale,
          scaleY: theme.scale,
          tintColor: theme.silhouette,
          pixelSnap: true,
        });
        this.sprites.draw(ctx, theme.sprite, bossSprX - 2, bossSprY - 1, {
          frame: 0,
          scaleX: theme.scale,
          scaleY: theme.scale,
          tintColor: theme.accent,
          alpha: 0.45,
          pixelSnap: true,
        });
        this.sprites.draw(ctx, theme.sprite, bossSprX, bossSprY, {
          frame: 0,
          scaleX: theme.scale,
          scaleY: theme.scale,
          pixelSnap: true,
        });
      }

      // Bold Vlambeer jagged pixel-art black splat banner behind boss title
      const bandW = Math.min(width - 24, 246);
      const bandH = bossSubtitle ? 44 : 30;
      const bandX = Math.round(width * 0.08) - slideOffsetX;
      const bandY = midY - Math.floor(bandH * 0.5);

      // Jagged pixel splat silhouette layers (pure integer fillRect — zero soft blurry shapes!)
      ctx.fillStyle = theme.accent;
      ctx.fillRect(bandX - 6, bandY + 3, bandW + 12, bandH - 6);
      ctx.fillRect(bandX - 3, bandY - 2, bandW + 6, bandH + 4);
      ctx.fillStyle = '#07050c';
      ctx.fillRect(bandX - 10, bandY + 6, bandW + 20, bandH - 12);
      ctx.fillRect(bandX - 4, bandY, bandW + 8, bandH);
      ctx.fillRect(bandX + 4, bandY - 4, bandW - 16, bandH + 8);
      // Hazard accent corner blocks
      ctx.fillStyle = theme.accent;
      ctx.fillRect(bandX - 4, bandY, 5, bandH);
      ctx.fillRect(bandX + bandW - 1, bandY, 5, bandH);
      ctx.fillStyle = '#07050c';
      ctx.fillRect(bandX - 2, bandY + 5, 1, bandH - 10);
      ctx.fillRect(bandX + bandW + 1, bandY + 5, 1, bandH - 10);

      const textCenterX = bandX + Math.floor(bandW * 0.5);
      this.fonts.draw(ctx, bossDisplayName, textCenterX, bandY + 6, 'fntL', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });
      if (bossSubtitle) {
        this.fonts.draw(ctx, bossSubtitle.toUpperCase(), textCenterX, bandY + 26, 'fntM1', {
          align: 'center',
          color: theme.accent,
          outline: true,
        });
      }

      // Heavy cinematic top & bottom letterbox bars with crisp accent edge trim
      ctx.fillStyle = '#050308';
      ctx.fillRect(0, 0, width, 20);
      ctx.fillRect(0, height - 20, width, 20);
      ctx.fillStyle = theme.accent;
      ctx.fillRect(0, 20, width, 2);
      ctx.fillRect(0, height - 22, width, 2);
      ctx.fillStyle = '#0c0814';
      ctx.fillRect(0, 22, width, 1);
      ctx.fillRect(0, height - 23, width, 1);

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 240, 205, ${flash})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      return;
    }

    // 2. Boss HP Bar across bottom-center with crisp pixel bevel housing & riveted end-caps
    if (boss.hp > 0 && boss.maxHp > 0) {
      const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      if (this.lastBossEntityId !== boss.entityId || frac > this.displayedBossHpFrac) {
        this.lastBossEntityId = boss.entityId;
        this.displayedBossHpFrac = frac;
      } else {
        this.displayedBossHpFrac += (frac - this.displayedBossHpFrac) * 0.12;
        if (Math.abs(this.displayedBossHpFrac - frac) < 0.004) {
          this.displayedBossHpFrac = frac;
        }
      }

      const barW = Math.min(200, width - 84);
      const barH = 9;
      const bx = Math.round((width - barW) / 2);
      const by = height - 16;

      // Outer dark ink housing + beveled steel frame
      ctx.fillStyle = '#08050d';
      ctx.fillRect(bx - 5, by - 3, barW + 10, barH + 6);
      ctx.fillStyle = '#383044';
      ctx.fillRect(bx - 3, by - 2, barW + 6, barH + 4);
      // Top steel highlight & bottom shadow bevel
      ctx.fillStyle = '#7c728c';
      ctx.fillRect(bx - 3, by - 2, barW + 6, 1);
      ctx.fillStyle = '#1b1524';
      ctx.fillRect(bx - 3, by + barH + 1, barW + 6, 1);

      // Ornamental pixel end-caps with gold corner rivets
      ctx.fillStyle = '#5e536e';
      ctx.fillRect(bx - 4, by - 2, 3, barH + 4);
      ctx.fillRect(bx + barW + 1, by - 2, 3, barH + 4);
      ctx.fillStyle = '#ffe047';
      ctx.fillRect(bx - 3, by, 1, 2);
      ctx.fillRect(bx - 3, by + barH - 2, 1, 2);
      ctx.fillRect(bx + barW + 2, by, 1, 2);
      ctx.fillRect(bx + barW + 2, by + barH - 2, 1, 2);

      // Recessed crimson track
      ctx.fillStyle = '#120810';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#2e1019';
      ctx.fillRect(bx, by, barW, barH);

      // White damage trail
      const trailW = Math.round(barW * this.displayedBossHpFrac);
      const fillW = Math.round(barW * frac);
      if (trailW > fillW) {
        ctx.fillStyle = '#fff2d6';
        ctx.fillRect(bx + fillW, by, trailW - fillW, barH);
      }

      // 3-tone crimson boss health fill
      if (fillW > 0) {
        ctx.fillStyle = '#e02438';
        ctx.fillRect(bx, by, fillW, barH);
        ctx.fillStyle = '#ff7282';
        ctx.fillRect(bx, by, fillW, 2);
        ctx.fillStyle = '#991224';
        ctx.fillRect(bx, by + barH - 2, fillW, 2);
      }

      // Subtle quarter-HP notch ticks along the upper frame bevel
      ctx.fillStyle = '#08050d';
      for (const q of [0.25, 0.5, 0.75]) {
        const tx = bx + Math.round(barW * q);
        ctx.fillRect(tx, by - 2, 1, 2);
        ctx.fillRect(tx, by + barH, 1, 2);
      }

      this.fonts.draw(ctx, bossDisplayName, Math.round(width * 0.5), by - 10, 'fntSmall', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
    }
  }
}
