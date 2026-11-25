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

export interface HudRenderContext {
  state: SimState;
  camera: CameraController;
  renderSettings: RenderSettings;
  fps: number;
  width: number;
  height: number;
}

/**
 * Pixel-verified sprHealthFill frame polarity:
 * frame 0 = WHITE (255,255,255) hurt flash; frame 1 = CRIMSON RED (252,56,0) normal fill.
 */
export function resolveHealthFillFrame(hurtFlashTicks: number): number {
  return hurtFlashTicks > 0 ? 0 : 1;
}

/**
 * Pixel-exact Krunked Throne Canvas HUD renderer:
 * - HP bar (sprHealthBar / sprHealthFill + white damage trail + Strong Spirit halo)
 * - Rad canister (sprExpBar + sprExpBarLevel + LV ring + rad counter)
 * - Active & Secondary weapon cards with real weapon sprites, reload bar, and 5-ammo-pool strip
 * - Area / Loop / Kills / Crown badge + optional FPS counter
 * - Acquired Mutation & Ultra HUD icons
 * - Boss HP bar & dramatic Boss Intro banner
 * - Off-screen Portal directional indicator arrow
 */
export class HudRenderer {
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;
  private displayedHpFrac = 1;

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
    ctx.imageSmoothingEnabled = false;

    this.renderTopLeftVitals(ctx, state);
    this.renderWeaponsAndAmmo(ctx, state, width);
    this.renderTopRightStats(ctx, state, renderSettings, fps, width);
    this.renderMutationIcons(ctx, state);
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

    // 1. Rad Canister (left edge)
    const radX = 4;
    const radY = 4;
    const radFrac =
      player.radsToNextLevel > 0 ? Math.max(0, Math.min(1, player.rads / player.radsToNextLevel)) : 1;
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

    // LV badge underneath rad canister
    const lvLabel = player.level >= 10 ? '@gULTRA' : `@wLV${player.level}`;
    this.fonts.draw(ctx, lvLabel, radX + 7, radY + 25, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    // 2. HP Bar (beside rad canister)
    const barX = 22;
    const barY = 5;
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

    // HP numeric text centered in bar
    const hpColor = hp <= 2 && Math.floor(state.tick / 5) % 2 === 0 ? '@r' : '@w';
    this.fonts.draw(
      ctx,
      `${hpColor}${Math.ceil(hp)}/${maxHp}`,
      barX + Math.floor(barW / 2),
      barY + 3,
      'fntM1',
      { align: 'center', outline: true },
    );

    // Strong Spirit halo badge right of HP bar
    if (player.mutations.includes('strong_spirit')) {
      const ssX = barX + barW + 7;
      const ssY = barY + 7;
      ctx.save();
      ctx.strokeStyle = player.strongSpiritReady ? '#78ebff' : '#4a5566';
      ctx.lineWidth = player.strongSpiritReady ? 2 : 1;
      ctx.beginPath();
      ctx.arc(ssX, ssY, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      if (player.strongSpiritReady) {
        ctx.fillStyle = 'rgba(120, 235, 255, 0.35)';
        ctx.fill();
      }
      ctx.restore();
    }

    // Chicken Headless countdown bar
    if (player.headlessTicks > 0 && player.alive) {
      const secs = (player.headlessTicks / 30).toFixed(1);
      this.fonts.draw(ctx, `@rHEADLESS ${secs}S!`, barX, barY + 16, 'fntSmall', {
        outline: true,
      });
    } else if (player.gunWarrantTicks > 0) {
      const secs = (player.gunWarrantTicks / 30).toFixed(1);
      this.fonts.draw(ctx, `@yGUN WARRANT ${secs}S`, barX, barY + 16, 'fntSmall', {
        outline: true,
      });
    }

    // Rad numeric readout under HP bar
    const radTextY = player.headlessTicks > 0 || player.gunWarrantTicks > 0 ? barY + 24 : barY + 16;
    this.fonts.draw(
      ctx,
      `@g${player.rads}@d/${player.radsToNextLevel}`,
      barX + 2,
      radTextY,
      'fntSmall',
      { outline: true },
    );
  }

  private renderWeaponsAndAmmo(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    width: number,
  ): void {
    const player = state.player;
    const activeSlot = player.weapons[player.activeSlot];
    const secondarySlot = player.weapons[player.activeSlot === 0 ? 1 : 0];
    const activeDef = activeSlot ? this.data.getWeapon(activeSlot.weaponId) : undefined;

    // Center-top weapon cards
    const activeCardW = 70;
    const secCardW = 46;
    const cardH = 22;
    const totalCardsW = activeCardW + (secondarySlot ? secCardW + 4 : 0);
    const startX = Math.max(118, Math.round((width - totalCardsW) * 0.5) - 10);
    const cardY = 4;

    // Active Weapon Card
    if (activeSlot) {
      const boxX = startX;
      const boxY = cardY;
      const boxW = activeCardW;
      const boxH = cardH;
      ctx.fillStyle = 'rgba(14, 12, 20, 0.78)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = activeSlot.cursed
        ? '#c852ff'
        : activeDef?.golden
          ? '#ffd84d'
          : '#d6d6e0';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

      const wepSpr = resolveWeaponSpriteName(activeSlot.weaponId, this.data);
      const activeSprDef = this.sprites.getSprite(wepSpr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);
      ctx.clip();
      const drew = this.sprites.drawInBox(
        ctx,
        wepSpr,
        0,
        boxX + 4,
        boxY + 2,
        boxW - 8,
        12,
        { maxScale: 1, refWidth: activeSprDef?.width },
      );
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(activeSlot.weaponId, this.data).slice(0, 12),
          boxX + Math.floor(boxW / 2),
          boxY + 4,
          'fntSmall',
          { align: 'center', color: '#ffffff' },
        );
      }
      ctx.restore();

      // Weapon name label (tiny)
      const shortName = resolveWeaponLabel(activeSlot.weaponId, this.data);
      const clipped = shortName.length > 14 ? `${shortName.slice(0, 13)}.` : shortName;
      this.fonts.draw(ctx, clipped, boxX + Math.floor(boxW / 2), boxY + 14, 'fntSmall', {
        align: 'center',
        color: activeDef?.golden ? '#ffe047' : activeSlot.cursed ? '#d47aff' : '#cfd4de',
        shadow: false,
      });

      // Reload bar along bottom of active weapon card
      if (activeSlot.reloadTicks > 0 && activeSlot.maxReloadTicks > 0) {
        const frac = 1 - Math.max(0, Math.min(1, activeSlot.reloadTicks / activeSlot.maxReloadTicks));
        ctx.fillStyle = '#0c0910';
        ctx.fillRect(boxX, boxY + boxH + 1, boxW, 3);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(boxX + 1, boxY + boxH + 2, Math.round((boxW - 2) * frac), 1);
      }
    }

    // Secondary Weapon Card
    if (secondarySlot) {
      const boxX = startX + activeCardW + 4;
      const boxY = cardY + 2;
      const boxW = secCardW;
      const boxH = cardH - 4;
      ctx.fillStyle = 'rgba(12, 10, 18, 0.58)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = secondarySlot.cursed ? '#8a35b8' : '#575766';
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
        boxX + 4,
        boxY + 2,
        boxW - 8,
        boxH - 4,
        { alpha: 0.78, maxScale: 1, refWidth: secSprDef?.width },
      );
      if (!drew) {
        this.fonts.draw(
          ctx,
          resolveWeaponLabel(secondarySlot.weaponId, this.data).slice(0, 8),
          boxX + Math.floor(boxW / 2),
          boxY + 5,
          'fntSmall',
          { align: 'center', color: '#9ca0ad' },
        );
      }
      ctx.restore();
    }

    // 5-Ammo-Pool Strip beneath weapon cards (+3px breathing room below active weapon box)
    const ammoY = cardY + cardH + 9;
    const poolStep = 26;
    const stripW = AMMO_POOL_SPECS.length * poolStep;
    const stripX = Math.max(20, Math.round(startX + activeCardW * 0.5 - stripW * 0.5 + 16));

    // Crisp translucent dark pill backing behind ammo strip for sharp contrast over Desert & Snow
    const rogueExtraW = player.mutant === 'rogue' ? 20 : 0;
    const pillX = stripX - 4;
    const pillY = ammoY - 3;
    const pillW = stripW + rogueExtraW + 6;
    const pillH = 13;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.72)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = 'rgba(130, 122, 156, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1);

    for (let i = 0; i < AMMO_POOL_SPECS.length; i++) {
      const spec = AMMO_POOL_SPECS[i]!;
      const ax = stripX + i * poolStep;
      const count = player.ammo[spec.type] ?? 0;
      const max = Math.max(1, player.ammoMax[spec.type] ?? 1);
      const isCurrent = activeDef?.ammoType === spec.type;
      const low = count === 0 || count / max <= 0.15;

      // Subtle highlight pill behind active weapon's ammo pool
      if (isCurrent) {
        ctx.fillStyle = 'rgba(255, 224, 71, 0.18)';
        ctx.fillRect(ax - 2, ammoY - 2, poolStep - 2, 11);
      }

      // Draw ammo icon sprite
      let drewIcon = false;
      for (const candidate of spec.iconSprites) {
        if (this.sprites.hasSprite(candidate)) {
          drewIcon = this.sprites.drawInBox(ctx, candidate, 0, ax, ammoY - 1, 8, 8);
          if (drewIcon) break;
        }
      }
      if (!drewIcon && this.sprites.hasSprite('sprAmmoIcons')) {
        drewIcon = this.sprites.drawInBox(ctx, 'sprAmmoIcons', spec.ammoIconsFrame, ax, ammoY - 1, 8, 8);
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
            ? '#ff4545'
            : isCurrent
              ? '#ffffff'
              : '#a8adb8';
      const label = player.gunWarrantTicks > 0 ? 'INF' : String(count);
      this.fonts.draw(ctx, label, ax + 9, ammoY, 'fntSmall', {
        color: countColor,
        outline: true,
      });
    }

    // Rogue Portal Strike canisters
    if (player.mutant === 'rogue') {
      const rx = stripX + stripW + 2;
      ctx.fillStyle = '#52a8ff';
      ctx.fillRect(rx, ammoY + 1, 5, 5);
      this.fonts.draw(ctx, String(player.portalStrikes), rx + 7, ammoY, 'fntSmall', {
        color: '#8ce6ff',
        outline: true,
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
    const rightX = width - 6;

    // Area + Loop badge (e.g. "1-1" or "L1 1-1")
    const areaText = state.loop > 0 ? `@yL${state.loop} @w${state.areaCode}` : `@w${state.areaCode}`;
    this.fonts.draw(ctx, areaText, rightX, 5, 'fntM1', {
      align: 'right',
      outline: true,
    });

    // Kills count + icon
    const killsText = String(state.stats.kills);
    const killsM = this.fonts.measure(killsText, 'fntSmall');
    this.fonts.draw(ctx, killsText, rightX, 16, 'fntSmall', {
      align: 'right',
      color: '#e8e8ee',
      outline: true,
    });
    const iconX = rightX - killsM.width - 10;
    const drewSkull = this.sprites.drawInBox(ctx, 'sprKillsIcon', 0, iconX, 15, 8, 8);
    if (!drewSkull) {
      ctx.fillStyle = '#e03646';
      ctx.fillRect(iconX + 2, 16, 5, 5);
    }

    // Active Crown icon
    if (state.crown !== 'none') {
      const crownDef = this.data.getCrown(state.crown);
      this.sprites.drawInBox(ctx, crownDef.spriteIdle, 0, rightX - 14, 25, 12, 10);
    }

    // Optional FPS counter showing measured / target FPS
    if (renderSettings.showFps) {
      const targetFps = renderSettings.targetFps ?? (renderSettings.classic30Fps ? 30 : 120);
      const fpsY = state.crown !== 'none' ? 37 : 26;
      const fpsColor = fps >= Math.min(55, targetFps * 0.85) ? '@g' : fps >= 28 ? '@y' : '@r';
      this.fonts.draw(ctx, `${fpsColor}${Math.round(fps)}/${targetFps} FPS`, rightX, fpsY, 'fntSmall', {
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

    const startX = 6;
    const startY = 39;
    const step = 12;
    const perRow = 8;

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
      const idx = mutations.length;
      const x = startX + (idx % perRow) * step;
      const y = startY + Math.floor(idx / perRow) * step;
      const drew = uDef
        ? this.sprites.drawInBox(ctx, 'sprEGIconHUD', uDef.iconIndex, x - 1, y - 1, 12, 12)
        : false;
      if (!drew) {
        ctx.fillStyle = '#181322';
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 1, y + 1, 8, 8);
      }
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

    const bossDisplayName =
      boss.bossId === 'nuclear_throne'
        ? (this.data.getEnemy('nuclear_throne')?.name ?? 'THE KRUNKED THRONE')
        : (this.data.getEnemy(boss.bossId)?.name ?? boss.name);
    const bossSubtitle =
      boss.bossId === 'nuclear_throne'
        ? (boss.subtitle || 'THE END OF THE ROAD')
        : boss.subtitle;

    // 1. Boss HP Bar across bottom-center
    if (boss.hp > 0 && boss.maxHp > 0) {
      const barW = Math.min(220, width - 64);
      const barH = 10;
      const bx = Math.round((width - barW) / 2);
      const by = height - 18;
      const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));

      ctx.fillStyle = 'rgba(12, 8, 16, 0.88)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#33121b';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#e02438';
      ctx.fillRect(bx, by, Math.round(barW * frac), barH);
      ctx.fillStyle = '#ff6675';
      ctx.fillRect(bx, by, Math.round(barW * frac), 2);
      ctx.strokeStyle = '#c4a6b0';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1.5, by - 1.5, barW + 3, barH + 3);

      this.fonts.draw(ctx, bossDisplayName.toUpperCase(), width * 0.5, by - 9, 'fntSmall', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
    }

    // 2. Dramatic Boss Intro Banner when introTicks > 0
    if (boss.introTicks > 0) {
      const slideAlpha = boss.introTicks > 15 ? 1 : Math.min(1, boss.introTicks / 15);
      ctx.save();
      ctx.globalAlpha = slideAlpha;

      // High-contrast dark crimson banner band across mid-screen
      const bandY = Math.round(height * 0.32);
      const bandH = 54;
      ctx.fillStyle = 'rgba(10, 8, 16, 0.90)';
      ctx.fillRect(0, bandY, width, bandH);
      ctx.fillStyle = '#d92638';
      ctx.fillRect(0, bandY, width, 2);
      ctx.fillRect(0, bandY + bandH - 2, width, 2);

      this.fonts.draw(ctx, bossDisplayName.toUpperCase(), width * 0.5, bandY + 10, 'fntL', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });
      if (bossSubtitle) {
        this.fonts.draw(ctx, bossSubtitle.toUpperCase(), width * 0.5, bandY + 34, 'fntM1', {
          align: 'center',
          color: '#ffe047',
          outline: true,
        });
      }
      ctx.restore();
    }
  }
}
