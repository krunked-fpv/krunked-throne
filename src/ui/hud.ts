import type { AmmoType, RenderSettings, SimState } from '@/contracts';
import type { AssetBundle } from '@/assets';
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
 * - Steam `sprEGSkillIcon` (48 frames) & `sprEGIconHUD` (52 frames) store 3 frames per race
 *   starting at race 0 (`0..2` random/placeholder), so mutant races 1..12 sit at `raceIndex * 3 + slot`.
 * - Built-In Art stores compact 24 frames (`(raceIndex - 1) * 2 + slot`).
 */
export function computeUltraIconFrame(
  raceIndex: number,
  slot: 'a' | 'b',
  totalFrames: number = 24,
): number {
  const offset = slot === 'b' ? 1 : 0;
  if (totalFrames >= 39) {
    return Math.max(0, raceIndex) * 3 + offset;
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

const BOSS_INTRO_FRAME_MAP: Readonly<Record<string, number>> = {
  big_bandit: 0,
  big_dog: 1,
  lil_hunter: 2,
  nuclear_throne: 3,
  throne_ii: 4,
};

/**
 * Pixel-exact Krunked Throne Canvas HUD renderer:
 * - Compact top bar staying tight to the upper edge (zero combat arena encroachment)
 * - HP bar (sprHealthBar / sprHealthFill + white damage trail + Strong Spirit halo)
 * - Rad canister (sprExpBar + sprExpBarLevel + LV badge + high-contrast rad pill)
 * - Clean centered Active & Secondary weapon cards with integrated reload bar & adaptive swap hints
 * - Compact 5-ammo-pool strip with micro reserve gauges & active pool underline
 * - High-contrast top-right Area / Loop / Kills / Crown / FPS corner cluster
 * - Acquired Mutation & Ultra HUD icons (top-left, clear of ammo strip & touch corners)
 * - Boss HP bar with white damage trail & non-blocking upper cinematic Boss Intro banner
 * - Off-screen Portal directional indicator arrow
 */
export class HudRenderer {
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;
  private displayedHpFrac = 1;
  private displayedBossHpFrac = 1;
  private lastBossEntityId = -1;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.sprites = new SpriteRenderer(bundle);
    this.fonts = new BitmapFontRenderer(bundle);
    this.data = data;
  }

  setBundle(bundle: AssetBundle): void {
    this.sprites.setBundle(bundle);
    this.fonts.setBundle(bundle);
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
  }

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    hud: HudRenderContext,
  ): void {
    const { state, camera, renderSettings, fps, width, height } = hud;
    const inputMode: HudInputDeviceMode = hud.inputMode ?? 'kbm';
    ctx.imageSmoothingEnabled = false;

    this.renderTopLeftVitals(ctx, state);
    this.renderWeaponsAndAmmo(ctx, state, width, inputMode);
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
      this.sprites.draw(ctx, 'sprExpBar', radX, radY, { frame: fillFrame, pixelSnap: true });
      if (state.pendingLevelUps > 0 && Math.floor(state.tick / 6) % 2 === 0) {
        this.sprites.draw(ctx, 'sprExpBarLevel', radX, radY, { frame: 0, pixelSnap: true });
      }
    } else {
      ctx.fillStyle = '#0e0c14';
      ctx.fillRect(radX, radY, 14, 24);
      ctx.fillStyle = '#1f2b22';
      ctx.fillRect(radX + 2, radY + 2, 10, 20);
      const fillH = Math.round(20 * radFrac);
      ctx.fillStyle = state.pendingLevelUps > 0 ? '#a8ff6e' : '#4de862';
      ctx.fillRect(radX + 2, radY + 22 - fillH, 10, fillH);
      ctx.strokeStyle = state.pendingLevelUps > 0 ? '#ffe047' : '#738578';
      ctx.lineWidth = 1;
      ctx.strokeRect(radX + 0.5, radY + 0.5, 13, 23);
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
    const barY = 4;
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
      ctx.strokeStyle = '#5c4b52';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
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
      ctx.save();
      ctx.strokeStyle = bvPulse > 0.78 ? '#ffe047' : '#ff7b24';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
      ctx.fillStyle = `rgba(255, 130, 35, ${(0.22 * bvPulse).toFixed(3)})`;
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.restore();
    }

    // HP numeric text centered in bar
    const lowHpBlink = hp <= 2 && Math.floor(state.tick / 5) % 2 === 0;
    const hpColor = lowHpBlink ? '@y' : '@w';
    this.fonts.draw(
      ctx,
      `${hpColor}${Math.ceil(hp)}/${maxHp}`,
      barX + Math.floor(barW / 2),
      barY + 3,
      'fntM1',
      { align: 'center', outline: true },
    );

    // Strong Spirit halo badge cleanly tucked right of HP bar
    if (player.mutations.includes('strong_spirit')) {
      const ssX = barX + barW + 6;
      const ssY = barY + 7;
      ctx.save();
      if (player.strongSpiritReady) {
        const haloPulse = 0.5 + 0.5 * Math.sin(state.tick * 0.3);
        ctx.strokeStyle = `rgba(140, 240, 255, ${(0.32 + 0.25 * haloPulse).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ssX, ssY, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = player.strongSpiritReady ? '#78ebff' : '#4a5566';
      ctx.lineWidth = player.strongSpiritReady ? 2 : 1;
      ctx.beginPath();
      ctx.arc(ssX, ssY, 3.8, 0, Math.PI * 2);
      ctx.stroke();
      if (player.strongSpiritReady) {
        ctx.fillStyle = 'rgba(120, 235, 255, 0.35)';
        ctx.fill();
      }
      ctx.restore();
    }

    // High-contrast dark pill behind Rad numeric readout so "0/60" pops crisply on Desert & Snow
    // At Level 10 Ultra, NT displays only the raw rad count (never "X/9999").
    const radLabel = isUltraLevel
      ? `@g${player.rads}`
      : `@g${player.rads}@w/${player.radsToNextLevel}`;
    const radM = this.fonts.measure(radLabel, 'fntSmall');
    const radPillW = radM.width + 6;
    const radPillY = barY + barH + 1;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.76)';
    ctx.fillRect(barX, radPillY, radPillW, 9);
    ctx.strokeStyle = 'rgba(77, 232, 98, 0.38)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, radPillY + 0.5, radPillW - 1, 8);
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
  ): void {
    const player = state.player;
    const activeSlot = player.weapons[player.activeSlot];
    const secondarySlot = player.weapons[player.activeSlot === 0 ? 1 : 0];
    const activeDef = activeSlot ? this.data.getWeapon(activeSlot.weaponId) : undefined;

    const isWide = width >= 380;
    const activeCardW = isWide ? 76 : 64;
    const secCardW = isWide ? 44 : 36;
    const cardH = 19;
    const cardGap = 3;
    const totalCardsW = activeCardW + (secondarySlot ? secCardW + cardGap : 0);

    // Anchor cluster consistently between top-left vitals and top-right stats (never drifts with 1 weapon!)
    const clusterCenterX = isWide ? Math.round(width * 0.5) : 188;
    const startX = Math.max(120, Math.round(clusterCenterX - totalCardsW * 0.5));
    const cardY = 3;

    // 1. Active Weapon Card (sleek beveled box + left ammo accent stripe + integrated inner reload bar)
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

      ctx.fillStyle = 'rgba(10, 8, 16, 0.84)';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Left ammo-class color bar
      ctx.fillStyle = emptyPulse ? '#ff3b47' : accentCol;
      ctx.fillRect(boxX + 1, boxY + 1, 2, boxH - 2);

      // Sleek frame border
      ctx.strokeStyle = emptyPulse
        ? '#ff454f'
        : activeSlot.cursed
          ? '#c852ff'
          : activeDef?.golden
            ? '#ffd84d'
            : '#a8aab8';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

      const wepSpr = resolveWeaponSpriteName(activeSlot.weaponId, this.data);
      const activeSprDef = this.sprites.getSprite(wepSpr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX + 4, boxY + 1, boxW - 6, 11);
      ctx.clip();
      const drew = this.sprites.drawInBox(
        ctx,
        wepSpr,
        0,
        boxX + 5,
        boxY + 1,
        boxW - 8,
        10,
        { maxScale: 1, refWidth: activeSprDef?.width },
      );
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(activeSlot.weaponId, this.data).slice(0, 11),
          boxX + Math.floor(boxW / 2) + 1,
          boxY + 3,
          'fntSmall',
          { align: 'center', color: '#ffffff' },
        );
      }
      ctx.restore();

      // Compact weapon label inside card (trimEnd prevents trailing space before ellipsis dot)
      const shortName = resolveWeaponLabel(activeSlot.weaponId, this.data);
      const maxChars = isWide ? 14 : 11;
      const clipped =
        shortName.length > maxChars
          ? `${shortName.slice(0, maxChars - 1).trimEnd()}.`
          : shortName;
      this.fonts.draw(ctx, clipped, boxX + Math.floor(boxW / 2) + 1, boxY + 12, 'fntSmall', {
        align: 'center',
        color: isEmpty ? '#ff7078' : activeDef?.golden ? '#ffe047' : activeSlot.cursed ? '#d47aff' : '#e0e4ee',
        shadow: false,
      });

      // Integrated sleek reload progress bar along the bottom 2px inside the card
      if (activeSlot.reloadTicks > 0 && activeSlot.maxReloadTicks > 0) {
        const frac = 1 - Math.max(0, Math.min(1, activeSlot.reloadTicks / activeSlot.maxReloadTicks));
        ctx.fillStyle = 'rgba(255, 224, 71, 0.22)';
        ctx.fillRect(boxX + 3, boxY + boxH - 2, boxW - 4, 1);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(boxX + 3, boxY + boxH - 2, Math.max(1, Math.round((boxW - 4) * frac)), 1);
      }
    }

    // 2. Secondary Weapon Card (dimmed, sleek, with adaptive swap badge for KBM/Gamepad)
    if (secondarySlot) {
      const boxX = startX + activeCardW + cardGap;
      const boxY = cardY + 2;
      const boxW = secCardW;
      const boxH = cardH - 3;
      const secDef = this.data.getWeapon(secondarySlot.weaponId);
      const secAccent = AMMO_TYPE_ACCENT[secDef?.ammoType ?? 'melee'] ?? '#8a8e9e';

      ctx.fillStyle = 'rgba(10, 8, 16, 0.66)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = secAccent;
      ctx.fillRect(boxX + 1, boxY + 1, 1, boxH - 2);
      ctx.strokeStyle = secondarySlot.cursed ? '#8a35b8' : '#575869';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

      const secSpr = resolveWeaponSpriteName(secondarySlot.weaponId, this.data);
      const secSprDef = this.sprites.getSprite(secSpr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);
      ctx.clip();
      const drew = this.sprites.drawInBox(
        ctx,
        secSpr,
        0,
        boxX + 3,
        boxY + 2,
        boxW - 6,
        boxH - 4,
        { alpha: 0.78, maxScale: 1, refWidth: secSprDef?.width },
      );
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(secondarySlot.weaponId, this.data).slice(0, 6),
          boxX + Math.floor(boxW / 2),
          boxY + 5,
          'fntSmall',
          { align: 'center', color: '#9ca0ad' },
        );
      }
      ctx.restore();

      // Tiny crisp swap badge on non-touch devices
      if (inputMode !== 'touch') {
        const swapKey = inputMode === 'gamepad' ? 'Y' : 'Q';
        this.fonts.draw(ctx, swapKey, boxX + boxW - 2, boxY + boxH - 7, 'fntSmall', {
          align: 'right',
          color: inputMode === 'gamepad' ? '#ffe047' : '#8d92a6',
          shadow: true,
        });
      }
    }

    // 3. Compact 5-Ammo-Pool Strip tucked tight under weapon cards (y = 24..35; zero 3-digit Back Muscle overlap!)
    const poolStep = isWide ? 28 : 26;
    const stripW = AMMO_POOL_SPECS.length * poolStep;
    const rogueExtraW = player.mutant === 'rogue' ? 20 : 0;
    const pillW = stripW + rogueExtraW + 6;
    const pillH = 11;
    const pillY = cardY + cardH + 2;
    const pillX = Math.max(98, Math.min(width - pillW - 44, Math.round(clusterCenterX - pillW * 0.5)));
    const stripX = pillX + 3;
    const ammoY = pillY + 2;

    ctx.fillStyle = 'rgba(10, 8, 16, 0.80)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = 'rgba(136, 130, 164, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1);

    for (let i = 0; i < AMMO_POOL_SPECS.length; i++) {
      const spec = AMMO_POOL_SPECS[i]!;
      const ax = stripX + i * poolStep;
      const count = player.ammo[spec.type] ?? 0;
      const max = Math.max(1, player.ammoMax[spec.type] ?? 1);
      const frac = Math.max(0, Math.min(1, count / max));
      const isCurrent = activeDef?.ammoType === spec.type;
      const low = count === 0 || frac <= 0.15;

      // Active pool tinted highlight + crisp bottom accent bar
      if (isCurrent) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(ax - 1, pillY + 1, poolStep - 1, pillH - 2);
      }

      // Subtle micro reserve fill bar along bottom pixel of each pool slot
      const meterW = poolStep - 3;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fillRect(ax, pillY + pillH - 2, meterW, 1);
      ctx.fillStyle = low ? '#ff424c' : spec.color;
      ctx.fillRect(ax, pillY + pillH - 2, Math.round(meterW * frac), 1);

      // Draw ammo icon sprite with authentic NT 8-frame draining level (0 = FULL .. 7 = EMPTY)
      let drewIcon = false;
      for (const candidate of spec.iconSprites) {
        const iconDef = this.sprites.getSprite(candidate);
        if (iconDef && this.sprites.hasSprite(candidate)) {
          const iconFrame = computeAmmoIconFrame(
            count,
            max,
            iconDef.frames.length,
            player.gunWarrantTicks,
          );
          drewIcon = this.sprites.drawInBox(ctx, candidate, iconFrame, ax, ammoY, 6, 7);
          if (drewIcon) break;
        }
      }
      if (!drewIcon && this.sprites.hasSprite('sprAmmoIcons')) {
        drewIcon = this.sprites.drawInBox(ctx, 'sprAmmoIcons', spec.ammoIconsFrame, ax, ammoY, 6, 7);
      }
      if (!drewIcon) {
        ctx.fillStyle = '#0c0910';
        ctx.fillRect(ax, ammoY, 6, 6);
        ctx.fillStyle = spec.color;
        ctx.fillRect(ax + 1, ammoY + 1, 4, 4);
      }

      const countColor =
        player.gunWarrantTicks > 0
          ? '#ffe047'
          : low
            ? '#ff4d57'
            : isCurrent
              ? '#ffffff'
              : '#a2a7b8';
      const label = player.gunWarrantTicks > 0 ? 'INF' : String(count);
      this.fonts.draw(ctx, label, ax + 7, ammoY + 1, 'fntSmall', {
        color: countColor,
        outline: false,
        shadow: true,
      });
    }

    // Rogue Portal Strike canisters (uses authentic 4-frame sprRogueAmmoHUD when present!)
    if (player.mutant === 'rogue') {
      const rx = stripX + stripW + 2;
      const rogueDef = this.sprites.getSprite('sprRogueAmmoHUD');
      let drewRogue = false;
      if (rogueDef && this.sprites.hasSprite('sprRogueAmmoHUD')) {
        const rf = Math.max(0, Math.min(rogueDef.frames.length - 1, player.portalStrikes));
        drewRogue = this.sprites.drawInBox(ctx, 'sprRogueAmmoHUD', rf, rx, pillY + 1, 7, 9);
      }
      if (!drewRogue) {
        ctx.fillStyle = '#52a8ff';
        ctx.fillRect(rx, ammoY + 1, 5, 5);
      }
      this.fonts.draw(ctx, String(player.portalStrikes), rx + 8, ammoY + 1, 'fntSmall', {
        color: player.portalStrikes > 0 ? '#8ce6ff' : '#667488',
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

    // Area + Loop badge & Kills inside a crisp compact corner pill (high legibility on Snow/Desert)
    const areaText = state.loop > 0 ? `@yL${state.loop} @w${state.areaCode}` : `@w${state.areaCode}`;
    const killsText = String(state.stats.kills);
    const areaM = this.fonts.measure(areaText, 'fntM1');
    const killsM = this.fonts.measure(killsText, 'fntSmall');
    const boxW = Math.max(36, Math.max(areaM.width, killsM.width + 11) + 8);
    const boxX = rightX - boxW;
    const boxY = 3;
    const boxH = 21;

    ctx.fillStyle = 'rgba(10, 8, 16, 0.72)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(136, 130, 164, 0.40)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    this.fonts.draw(ctx, areaText, rightX - 3, boxY + 2, 'fntM1', {
      align: 'right',
      outline: true,
    });

    this.fonts.draw(ctx, killsText, rightX - 3, boxY + 13, 'fntSmall', {
      align: 'right',
      color: '#e8eaf2',
      shadow: true,
    });
    const iconX = rightX - 3 - killsM.width - 10;
    const drewSkull = this.sprites.drawInBox(ctx, 'sprKillsIcon', 0, iconX, boxY + 12, 8, 8);
    if (!drewSkull) {
      ctx.fillStyle = '#e03646';
      ctx.fillRect(iconX + 2, boxY + 13, 5, 5);
    }

    // Active Crown icon tucked neatly beneath stats pill
    if (state.crown !== 'none') {
      const crownDef = this.data.getCrown(state.crown);
      this.sprites.drawInBox(ctx, crownDef.spriteIdle, 0, rightX - 14, boxY + boxH + 2, 12, 10);
    }

    // Optional FPS counter showing measured / target FPS (compact, stays above touch pause trigger)
    if (renderSettings.showFps) {
      const targetFps = renderSettings.targetFps ?? (renderSettings.classic30Fps ? 30 : 120);
      const fpsY = state.crown !== 'none' ? boxY + boxH + 13 : boxY + boxH + 3;
      const fpsColor = fps >= Math.min(55, targetFps * 0.85) ? '@g' : fps >= 28 ? '@y' : '@r';
      this.fonts.draw(ctx, `${fpsColor}${Math.round(fps)}/${targetFps}`, rightX - 1, fpsY, 'fntSmall', {
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

    // Compact top-left mutation row strictly left of ammo strip (x <= 70) and clear of bottom touch triggers
    const startX = 4;
    const startY = 37;
    const step = 11;
    const perRow = 6;

    for (let i = 0; i < mutations.length; i++) {
      const mutId = mutations[i]!;
      const def = this.data.getMutation(mutId);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * step;
      const y = startY + row * step;

      const drew = def
        ? this.sprites.drawInBox(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, x, y, 10, 10)
        : false;
      if (!drew) {
        ctx.fillStyle = '#181322';
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = '#4de862';
        ctx.fillRect(x + 1, y + 1, 8, 8);
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
        ? this.sprites.drawInBox(ctx, 'sprEGIconHUD', ultraFrame, x - 1, y - 1, 12, 12)
        : false;
      if (!drew) {
        ctx.fillStyle = '#181322';
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 1, y + 1, 8, 8);
      }
    }
  }

  /**
   * Subtle color-coded screen-edge indicators for off-screen unopened Weapon / Ammo / Rad chests
   * once the portal opens or all hostile enemies are cleared (prevents missing chests before warp!).
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
    const padTop = 38;
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
    const padTop = 30;
    const padBot = 16;
    const halfW = cx - padX;
    const halfH = cy - Math.max(padTop, padBot);

    const scaleX = Math.abs(dx) > 1e-4 ? halfW / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 1e-4 ? halfH / Math.abs(dy) : Infinity;
    const t = Math.min(scaleX, scaleY);

    const ix = Math.round(cx + dx * t);
    const iy = Math.max(padTop, Math.min(height - padBot, Math.round(cy + dy * t)));

    // Draw swirling purple chevron + optional sprPortalIndicator
    const pulse = 1 + Math.sin(state.tick * 0.35) * 0.15;
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = '#180c24';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d16bff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4.5);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (this.sprites.hasSprite('sprPortalIndicator')) {
      this.sprites.draw(ctx, 'sprPortalIndicator', ix - Math.cos(angle) * 9, iy - Math.sin(angle) * 9, {
        frame: 0,
        scaleX: 0.75,
        scaleY: 0.75,
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

    const bossDisplayName =
      boss.bossId === 'nuclear_throne'
        ? (this.data.getEnemy('nuclear_throne')?.name ?? 'THE KRUNKED THRONE')
        : (this.data.getEnemy(boss.bossId)?.name ?? boss.name);
    const bossSubtitle =
      boss.bossId === 'nuclear_throne'
        ? (boss.subtitle || 'THE END OF THE ROAD')
        : boss.subtitle;

    // 1. Boss HP Bar across bottom-center (strictly clear of outer touch corners x<=30 / x>=w-30!)
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
      const by = height - 15;

      ctx.fillStyle = 'rgba(10, 7, 16, 0.88)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#2e1019';
      ctx.fillRect(bx, by, barW, barH);
      const trailW = Math.round(barW * this.displayedBossHpFrac);
      const fillW = Math.round(barW * frac);
      if (trailW > fillW) {
        ctx.fillStyle = '#fff2d6';
        ctx.fillRect(bx + fillW, by, trailW - fillW, barH);
      }
      ctx.fillStyle = '#e02438';
      ctx.fillRect(bx, by, fillW, barH);
      ctx.fillStyle = '#ff6d7c';
      ctx.fillRect(bx, by, fillW, 2);
      ctx.fillStyle = '#991224';
      ctx.fillRect(bx, by + barH - 2, fillW, 2);
      ctx.strokeStyle = '#c4a6b0';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1.5, by - 1.5, barW + 3, barH + 3);

      this.fonts.draw(ctx, bossDisplayName.toUpperCase(), width * 0.5, by - 8, 'fntSmall', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
    }

    // 2. Dramatic Boss Intro Splash (uses Steam NT splash layers when loaded, or Vlambeer splat banner in Built-In Art!)
    if (boss.introTicks > 0) {
      const fadeOut = boss.introTicks > 15 ? 1 : Math.min(1, boss.introTicks / 15);
      const slideIn = boss.introTicks > 50 ? Math.max(0, (boss.introTicks - 50) / 10) : 0;
      const slideOffsetX = Math.round(slideIn * 64);
      const flash = boss.introTicks >= 56 ? 0.35 : 0;

      ctx.save();
      ctx.globalAlpha = fadeOut;

      const steamBossFrame = BOSS_INTRO_FRAME_MAP[boss.bossId];
      const hasSteamBossSplash =
        steamBossFrame !== undefined &&
        this.sprites.hasSprite('sprBossIntro') &&
        this.sprites.hasSprite('sprBossName');

      if (hasSteamBossSplash) {
        const cx = Math.round(width * 0.5);
        // Back layer silhouette + foreground boss art softly composited so arena stays readable
        if (this.sprites.hasSprite('sprBossIntroBackLayer')) {
          this.sprites.draw(ctx, 'sprBossIntroBackLayer', cx + Math.round(slideOffsetX * 0.5), 0, {
            frame: steamBossFrame,
            alpha: 0.55 * fadeOut,
            pixelSnap: true,
          });
        }
        this.sprites.draw(ctx, 'sprBossIntro', cx - slideOffsetX, 0, {
          frame: steamBossFrame,
          alpha: 0.78 * fadeOut,
          pixelSnap: true,
        });
        if (this.sprites.hasSprite('sprBossNameSplat')) {
          const splatFrame = Math.min(3, Math.floor((60 - Math.min(60, boss.introTicks)) * 0.25));
          this.sprites.draw(ctx, 'sprBossNameSplat', cx - 64 - slideOffsetX, 82, {
            frame: splatFrame,
            alpha: 0.92 * fadeOut,
            pixelSnap: true,
          });
        }
        this.sprites.draw(ctx, 'sprBossName', cx - 54 - slideOffsetX, 74, {
          frame: steamBossFrame,
          alpha: fadeOut,
          pixelSnap: true,
        });
        ctx.restore();
        return;
      }

      // Subtle 3px cinematic accent bars at extreme top/bottom edges
      ctx.fillStyle = 'rgba(12, 6, 16, 0.72)';
      ctx.fillRect(0, 0, width, 3);
      ctx.fillRect(0, height - 3, width, 3);

      // Compact upper-band title plaque tucked right below the HUD (y=38..74) with dynamic slash wedges
      const bandY = 38;
      const bandH = bossSubtitle ? 34 : 24;
      const bandW = Math.min(width - 28, 250);
      const bandX = Math.round((width - bandW) * 0.5) - slideOffsetX;

      // Vlambeer diagonal splat backdrop wedges
      ctx.fillStyle = 'rgba(224, 38, 56, 0.28)';
      ctx.beginPath();
      ctx.moveTo(bandX - 10, bandY + 4);
      ctx.lineTo(bandX + bandW + 14, bandY - 3);
      ctx.lineTo(bandX + bandW + 8, bandY + bandH + 3);
      ctx.lineTo(bandX - 14, bandY + bandH - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(12, 7, 18, 0.86)';
      ctx.fillRect(bandX, bandY, bandW, bandH);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 235, 190, ${flash})`;
        ctx.fillRect(bandX, bandY, bandW, bandH);
      }

      // Crimson & gold industrial trim rails + warning corner chevrons
      ctx.fillStyle = '#e02638';
      ctx.fillRect(bandX, bandY, bandW, 2);
      ctx.fillRect(bandX, bandY + bandH - 2, bandW, 2);
      ctx.fillStyle = '#ffe047';
      ctx.fillRect(bandX, bandY, 5, bandH);
      ctx.fillRect(bandX + bandW - 5, bandY, 5, bandH);
      ctx.fillStyle = '#120a18';
      ctx.fillRect(bandX + 2, bandY + 4, 1, bandH - 8);
      ctx.fillRect(bandX + bandW - 3, bandY + 4, 1, bandH - 8);

      const centerX = bandX + Math.floor(bandW * 0.5);
      this.fonts.draw(ctx, bossDisplayName.toUpperCase(), centerX, bandY + 4, 'fntL', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });
      if (bossSubtitle) {
        this.fonts.draw(ctx, bossSubtitle.toUpperCase(), centerX, bandY + 22, 'fntM1', {
          align: 'center',
          color: '#ffe047',
          outline: true,
        });
      }
      ctx.restore();
    }
  }
}
