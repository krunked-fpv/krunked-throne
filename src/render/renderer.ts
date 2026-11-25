import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  TILE_SIZE,
  TileType,
  type AmmoType,
  type BiomeId,
  type CasingEntity,
  type CorpseEntity,
  type EnemyEntity,
  type PickupEntity,
  type PlayerState,
  type ProjectileEntity,
  type PropEntity,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type WorldMap,
} from '@/contracts';
import type { AssetBundle } from '@/assets';
import {
  BIOME_FALLBACK_PALETTES,
  BIOME_SPRITE_NUMBER,
  DEFAULT_UI_DATA_PROVIDER,
  resolveEnemySpritePrefix,
  resolveWeaponLabel,
  resolveWeaponSpriteName,
  type UiDataProvider,
} from '@/ui/data-provider';
import { BitmapFontRenderer } from './bitmap-font';
import { CameraController } from './camera';
import { FloorBuffer } from './floor-buffer';
import { SHARED_GLOW_CACHE, type GlowCanvas, type GlowStampCache } from './glow-cache';
import { LightingPass, type DynamicLight } from './lighting';
import { SpriteRenderer } from './sprites';

export type RenderInputDeviceMode = 'kbm' | 'gamepad' | 'touch';

type ExtendedSimEvent =
  | SimEvent
  | { type: 'enemy_alert'; entityId: number; x: number; y: number; defId: string }
  | { type: 'hit_confirm'; x: number; y: number; damage: number; killed: boolean; crit?: boolean; melee?: boolean }
  | { type: 'corpse_impact'; x: number; y: number; speed: number; targetId?: number; killed?: boolean }
  | { type: 'melee_deflect'; x: number; y: number; angle: number }
  | { type: 'ammo_empty'; x: number; y: number; ammoType: AmmoType };

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  font: string;
}

interface TransientParticle {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  sprite?: string;
}

interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  startR: number;
  endR: number;
  color: string;
  life: number;
  maxLife: number;
}

interface TransientFlashLight {
  x: number;
  y: number;
  radius: number;
  glowColor: string;
  life: number;
  maxLife: number;
}

interface EnemyFxState {
  lastAiState: string;
  alertTicks: number;
  alertMaxTicks: number;
  lastHurtTicks: number;
  joltTicks: number;
  seenTick: number;
}

interface MuzzleFlash {
  x: number;
  y: number;
  angle: number;
  radius: number;
  color: string;
  coreColor: string;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  startR: number;
  endR: number;
  color: string;
  glowColor: string;
  life: number;
  maxLife: number;
}

interface DrawableEntity {
  sortY: number;
  draw: () => void;
}

const PASSIVE_AI_STATES = new Set(['idle', 'wander', 'sleep', 'feign', 'disguised']);
const ACTIVE_AI_STATES = new Set([
  'alert',
  'chase',
  'strafe',
  'tell',
  'aim',
  'charge',
  'windup',
  'fire',
  'dash',
  'spin_fire',
  'swoop',
  'ambush',
  'lunge',
]);
const TELEGRAPH_AI_STATES = new Set(['tell', 'aim', 'charge', 'windup']);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapMod(val: number, period: number): number {
  const m = val % period;
  return m < 0 ? m + period : m;
}

function isWalkable(tile: number): boolean {
  return tile === TileType.Floor || tile === TileType.FloorCracked || tile === TileType.Carpet;
}

function raycastWallDistance(
  map: WorldMap,
  startX: number,
  startY: number,
  angle: number,
  maxDist: number,
): number {
  const ts = map.tileSize || TILE_SIZE;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = 4;
  for (let d = 8; d <= maxDist; d += step) {
    const wx = startX + dx * d;
    const wy = startY + dy * d;
    const tx = Math.floor(wx / ts);
    const ty = Math.floor(wy / ts);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
      return d;
    }
    const tile = map.tiles[ty * map.width + tx]!;
    if (!isWalkable(tile)) {
      return d;
    }
  }
  return maxDist;
}

function hasNearbyFloor(map: WorldMap, tx: number, ty: number): boolean {
  const minY = Math.max(0, ty - 1);
  const maxY = Math.min(map.height - 1, ty + 1);
  const minX = Math.max(0, tx - 1);
  const maxX = Math.min(map.width - 1, tx + 1);
  for (let y = minY; y <= maxY; y++) {
    const row = y * map.width;
    for (let x = minX; x <= maxX; x++) {
      if (isWalkable(map.tiles[row + x]!)) return true;
    }
  }
  return false;
}

/**
 * Main Krunked Throne Canvas 2D pixel renderer.
 * Supports 320x240 (4:3) and 426x240 (16:9 widescreen), pixel-crisp rendering,
 * 30 / 60 / 120 FPS interpolation, cached offscreen radial glow stamps,
 * persistent FloorBuffer, 2.5D autotiled walls, strict Y-sorting, weapon aim-order
 * layering, combat juice FX, biome ambient particles, darkness/glow pass, and crosshair.
 */
export class GameRenderer {
  private bundle: AssetBundle;
  private data: UiDataProvider;
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private floorBuffer: FloorBuffer;
  private camera: CameraController;
  private lighting: LightingPass;
  private glowCache: GlowStampCache;

  private lastMapRef: WorldMap | null = null;
  private lastAreaKey = '';
  private floatingTexts: FloatingText[] = [];
  private transientParticles: TransientParticle[] = [];
  private smokePuffs: SmokePuff[] = [];
  private flashLights: TransientFlashLight[] = [];
  private extraLightScratch: DynamicLight[] = [];
  private enemyFx = new Map<number, EnemyFxState>();
  private muzzleFlashes: MuzzleFlash[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private lastShotsFired = 0;
  private lastHurtFlashTicks = 0;
  private screenHurtFlashTicks = 0;
  private screenBlastFlashTicks = 0;
  private crosshairHitTicks = 0;
  private crosshairHitCrit = false;
  private crosshairRecoil = 0;
  private lastEmptyTextSec = -10;
  private lastSkidTick = -1;
  private lowAmmoWarnedPools = new Set<AmmoType>();
  private fxSeq = 1;
  private logicalWidth = LOGICAL_WIDTH_4_3;
  private logicalHeight = LOGICAL_HEIGHT;
  private renderTimeSec = 0;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.bundle = bundle;
    this.data = data;
    this.glowCache = SHARED_GLOW_CACHE;
    this.sprites = new SpriteRenderer(bundle);
    this.fonts = new BitmapFontRenderer(bundle);
    this.floorBuffer = new FloorBuffer(bundle, data);
    this.camera = new CameraController();
    this.lighting = new LightingPass(this.glowCache);
  }

  getGlowStamp(color: string, radius: number): GlowCanvas | null {
    return this.glowCache.getGlowStamp(color, radius);
  }

  setBundle(bundle: AssetBundle): void {
    this.bundle = bundle;
    this.sprites.setBundle(bundle);
    this.fonts.setBundle(bundle);
    this.floorBuffer.setBundle(bundle);
    this.lastMapRef = null;
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
    this.floorBuffer.setDataProvider(data);
  }

  getBundle(): AssetBundle {
    return this.bundle;
  }

  getCamera(): CameraController {
    return this.camera;
  }

  getFloorBuffer(): FloorBuffer {
    return this.floorBuffer;
  }

  getSpriteRenderer(): SpriteRenderer {
    return this.sprites;
  }

  getFontRenderer(): BitmapFontRenderer {
    return this.fonts;
  }

  getLogicalSize(): { width: number; height: number } {
    return { width: this.logicalWidth, height: this.logicalHeight };
  }

  /**
   * Configures logical canvas pixel dimensions (320x240 or 426x240) and
   * fits its CSS presentation crisply to the viewport without scrollbars.
   */
  applyCanvasSize(canvas: HTMLCanvasElement, settings: RenderSettings): void {
    const targetW = settings.widescreen ? LOGICAL_WIDTH_16_9 : LOGICAL_WIDTH_4_3;
    const targetH = LOGICAL_HEIGHT;
    this.logicalWidth = targetW;
    this.logicalHeight = targetH;

    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    this.camera.setViewport(targetW, targetH);
    this.camera.pixelSnap = settings.pixelSnap;

    if (typeof window !== 'undefined') {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const scale = Math.min(vw / targetW, vh / targetH);
      // Use exact integer scale when filling >=80% of screen, else crisp aspect-fit
      const intScale = Math.floor(scale);
      const finalScale = intScale >= 1 && (intScale * targetW >= vw * 0.8 || intScale * targetH >= vh * 0.8)
        ? intScale
        : scale;
      const cssW = Math.max(targetW, Math.floor(targetW * finalScale));
      const cssH = Math.max(targetH, Math.floor(targetH * finalScale));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
  }

  /**
   * Forces a complete rebuild of the persistent floor buffer on next render.
   */
  invalidateFloor(): void {
    this.lastMapRef = null;
  }

  private pushFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    life: number,
    font: string,
    vy: number = -0.5,
  ): void {
    // Stagger vertically when another active callout is nearby so labels never stack into mush
    let spawnY = y;
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const other = this.floatingTexts[i]!;
      if (Math.abs(other.x - x) < 28 && Math.abs(other.y - spawnY) < 9) {
        spawnY = Math.min(spawnY, other.y - 9);
      }
    }
    this.floatingTexts.push({
      x,
      y: spawnY,
      vy,
      text,
      color,
      life,
      maxLife: life,
      font,
    });
    if (this.floatingTexts.length > 24) {
      this.floatingTexts.shift();
    }
  }

  private nextFxHash(): number {
    this.fxSeq = (Math.imul(this.fxSeq, 1664525) + 1013904223) >>> 0;
    return this.fxSeq / 4294967296;
  }

  private spawnSparkBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin: number,
    speedMax: number,
    life: number,
    baseAngle?: number,
    spreadArc: number = Math.PI * 2,
    size: number = 2,
  ): void {
    if (this.transientParticles.length > 220) return;
    for (let i = 0; i < count; i++) {
      const ang =
        baseAngle !== undefined
          ? baseAngle + (this.nextFxHash() - 0.5) * spreadArc
          : (i / Math.max(1, count)) * Math.PI * 2 + (this.nextFxHash() - 0.5) * 0.5;
      const spd = speedMin + this.nextFxHash() * (speedMax - speedMin);
      this.transientParticles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: i === 0 ? size : Math.max(1, size - 0.5),
        life,
        maxLife: life,
      });
    }
  }

  private spawnSmokeBurst(
    x: number,
    y: number,
    count: number,
    baseRadius: number,
    tintColor: string = '#3a3238',
  ): void {
    if (this.smokePuffs.length > 96) return;
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + (this.nextFxHash() - 0.5) * 0.6;
      const spd = 0.65 + this.nextFxHash() * 1.9;
      const r0 = Math.max(2.5, baseRadius * (0.14 + this.nextFxHash() * 0.1));
      const r1 = r0 + 3 + this.nextFxHash() * 4.5;
      const life = 11 + Math.floor(this.nextFxHash() * 8);
      this.smokePuffs.push({
        x: x + Math.cos(ang) * 3,
        y: y + Math.sin(ang) * 3,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.25,
        startR: r0,
        endR: r1,
        color: i % 3 === 0 ? '#574c52' : tintColor,
        life,
        maxLife: life,
      });
    }
  }

  private spawnFlashLight(x: number, y: number, radius: number, glowColor: string, life: number): void {
    if (this.flashLights.length > 24) {
      this.flashLights.shift();
    }
    this.flashLights.push({ x, y, radius, glowColor, life, maxLife: life });
  }

  private triggerEmptyCallout(x: number, y: number): void {
    if (this.renderTimeSec - this.lastEmptyTextSec < 0.45) return;
    this.lastEmptyTextSec = this.renderTimeSec;
    this.pushFloatingText(x, y - 14, 'EMPTY!', '#ff4d57', 22, 'fntSmall', -0.42);
  }

  /**
   * Consumes simulation events emitted during the latest 30 Hz step.
   */
  consumeEvents(events: readonly SimEvent[], state?: SimState): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as ExtendedSimEvent;
      switch (ev.type) {
        case 'decal':
          this.floorBuffer.bakeDecal(ev.decal);
          break;

        case 'shake':
          this.camera.addShake(ev.trauma, ev.dirX, ev.dirY, ev.kick);
          break;

        case 'damage_number':
          this.pushFloatingText(
            ev.x,
            ev.y - 6,
            ev.heal ? `+${Math.round(ev.amount)}` : `${Math.round(ev.amount)}`,
            ev.heal ? '#52e864' : ev.crit ? '#ffe047' : '#ffffff',
            ev.crit ? 26 : 20,
            ev.crit ? 'fntM1' : 'fntSmall',
            ev.crit ? -0.68 : -0.55,
          );
          if (!ev.heal) {
            this.crosshairHitTicks = Math.max(this.crosshairHitTicks, ev.crit ? 5.5 : 3.5);
            if (ev.crit) this.crosshairHitCrit = true;
            this.spawnSparkBurst(
              ev.x,
              ev.y + 2,
              ev.crit ? 5 : 3,
              ev.crit ? '#ffe866' : '#fff5e0',
              1.4,
              3.4,
              6,
            );
          }
          break;

        case 'pickup_text':
          this.pushFloatingText(
            ev.x,
            ev.y - 10,
            ev.text,
            ev.color || '#ffe047',
            26,
            'fntSmall',
            -0.44,
          );
          break;

        case 'level_up': {
          const px = state?.player.x ?? this.camera.x;
          const py = state?.player.y ?? this.camera.y;
          this.pushFloatingText(
            px,
            py - 16,
            ev.isUltra ? 'ULTRA MUTATION!' : 'LEVEL UP!',
            ev.isUltra ? '#ffe047' : '#6bff7c',
            36,
            'fntM1',
            -0.45,
          );
          this.shockwaves.push({
            x: px,
            y: py,
            startR: 4,
            endR: ev.isUltra ? 48 : 34,
            color: ev.isUltra ? '#ffe047' : '#5eff78',
            glowColor: ev.isUltra ? 'rgba(255, 224, 71, 0.7)' : 'rgba(90, 255, 130, 0.65)',
            life: 14,
            maxLife: 14,
          });
          this.spawnSparkBurst(px, py, 8, ev.isUltra ? '#fff080' : '#96ff9e', 1.6, 3.8, 12);
          break;
        }

        case 'enemy_alert': {
          const existing = this.enemyFx.get(ev.entityId);
          if (existing) {
            existing.alertTicks = 18;
            existing.alertMaxTicks = 18;
          } else {
            this.enemyFx.set(ev.entityId, {
              lastAiState: 'alert',
              alertTicks: 18,
              alertMaxTicks: 18,
              lastHurtTicks: 0,
              joltTicks: 0,
              seenTick: state?.tick ?? 0,
            });
          }
          break;
        }

        case 'hit_confirm': {
          this.crosshairHitTicks = Math.max(this.crosshairHitTicks, ev.killed ? 6 : 4);
          if (ev.crit || ev.killed) this.crosshairHitCrit = true;
          const sparkCol = ev.crit || ev.killed ? '#ffe866' : ev.melee ? '#a6f4ff' : '#ffffff';
          this.spawnSparkBurst(ev.x, ev.y, ev.killed ? 6 : 3, sparkCol, 1.8, 4.2, ev.killed ? 8 : 5);
          if (ev.killed) {
            this.spawnSparkBurst(ev.x, ev.y, 4, '#c91c2b', 1.2, 3.2, 9);
          }
          break;
        }

        case 'corpse_impact': {
          this.shockwaves.push({
            x: ev.x,
            y: ev.y,
            startR: 3,
            endR: ev.killed ? 20 : 14,
            color: ev.killed ? '#ff6b52' : '#e8c4a0',
            glowColor: 'rgba(255, 110, 75, 0.45)',
            life: 7,
            maxLife: 7,
          });
          this.spawnSparkBurst(ev.x, ev.y, ev.killed ? 7 : 4, '#b81d2b', 1.5, 4.0, 9);
          this.spawnSmokeBurst(ev.x, ev.y, 3, 12, '#6e5c52');
          break;
        }

        case 'melee_deflect': {
          this.shockwaves.push({
            x: ev.x,
            y: ev.y,
            startR: 3,
            endR: 16,
            color: '#9cf5ff',
            glowColor: 'rgba(130, 240, 255, 0.72)',
            life: 7,
            maxLife: 7,
          });
          this.spawnSparkBurst(ev.x, ev.y, 6, '#e0fbff', 2.2, 4.8, 7, ev.angle, 1.3);
          this.spawnFlashLight(ev.x, ev.y, 36, 'rgba(135, 240, 255, 0.6)', 4);
          break;
        }

        case 'ammo_empty': {
          this.triggerEmptyCallout(ev.x, ev.y);
          break;
        }

        case 'sfx': {
          const lower = ev.sound.toLowerCase();
          if (lower === 'sndempty' || lower === 'sndultraempty' || lower === 'sndhorrorempty') {
            this.triggerEmptyCallout(ev.x, ev.y);
          } else if (lower === 'sndmeleeflip' || lower === 'sndcrystalricochet') {
            this.shockwaves.push({
              x: ev.x,
              y: ev.y,
              startR: 2,
              endR: 14,
              color: '#9cf5ff',
              glowColor: 'rgba(130, 240, 255, 0.65)',
              life: 6,
              maxLife: 6,
            });
            this.spawnSparkBurst(ev.x, ev.y, 5, '#ffffff', 2.0, 4.2, 6);
          }
          break;
        }

        case 'particle':
          this.transientParticles.push({
            kind: ev.kind,
            x: ev.x,
            y: ev.y,
            vx: ev.vx,
            vy: ev.vy,
            color: ev.color,
            size: ev.size ?? 2,
            life: Math.max(1, ev.life),
            maxLife: Math.max(1, ev.life),
            sprite: ev.sprite,
          });
          if (ev.kind === 'explosion') {
            const baseRadius = Math.max(22, (ev.size ?? 24) * 1.38);
            const ringColor = ev.color || '#ffba4d';
            const lowerCol = ringColor.toLowerCase();
            const glowColor =
              lowerCol === '#cc2222'
                ? 'rgba(255, 72, 82, 0.62)'
                : lowerCol === '#4ca6ff'
                  ? 'rgba(85, 185, 255, 0.65)'
                  : lowerCol === '#55ff66'
                    ? 'rgba(85, 255, 115, 0.65)'
                    : 'rgba(255, 175, 65, 0.72)';
            this.shockwaves.push({
              x: ev.x,
              y: ev.y,
              startR: 4,
              endR: baseRadius,
              color: ringColor,
              glowColor,
              life: 11,
              maxLife: 11,
            });
            const smokeTint =
              lowerCol === '#cc2222'
                ? '#4d1a21'
                : lowerCol === '#55ff66'
                  ? '#1f4a28'
                  : lowerCol === '#4ca6ff'
                    ? '#1f3659'
                    : '#3b3338';
            this.spawnSmokeBurst(ev.x, ev.y, 7, baseRadius, smokeTint);
            this.spawnFlashLight(ev.x, ev.y, Math.min(120, baseRadius * 2.1), glowColor, 7);
            this.screenBlastFlashTicks = Math.max(this.screenBlastFlashTicks, baseRadius >= 46 ? 3 : 1.8);
          } else if (ev.kind === 'wall_spark') {
            // Wall-chip masonry dust + bright spark fan bouncing off the impact normal
            const normAng = Math.atan2(ev.vy, ev.vx);
            this.spawnSparkBurst(ev.x, ev.y, 4, '#fff2c2', 1.4, 3.6, 6, normAng, 1.5, 2);
            this.spawnSmokeBurst(ev.x, ev.y, 2, 8, '#7a6d62');
          } else if (ev.kind === 'muzzle') {
            this.muzzleFlashes.push({
              x: ev.x,
              y: ev.y,
              angle: Math.atan2(ev.vy, ev.vx),
              radius: Math.max(14, (ev.size ?? 6) * 2.5),
              color: 'rgba(255, 195, 75, 0.85)',
              coreColor: '#fff7d6',
              life: 3.2,
              maxLife: 3.2,
            });
            this.spawnFlashLight(ev.x, ev.y, 44, 'rgba(255, 195, 75, 0.45)', 3);
          }
          break;

        case 'area_change':
          this.floatingTexts = [];
          this.transientParticles = [];
          this.smokePuffs = [];
          this.flashLights = [];
          this.enemyFx.clear();
          this.muzzleFlashes = [];
          this.shockwaves = [];
          this.lowAmmoWarnedPools.clear();
          this.screenHurtFlashTicks = 0;
          this.screenBlastFlashTicks = 0;
          this.crosshairHitTicks = 0;
          this.crosshairRecoil = 0;
          this.lastSkidTick = -1;
          this.lastMapRef = null;
          this.camera.clearFocusBias();
          if (state) {
            this.lastShotsFired = state.stats.shotsFired;
            this.lastHurtFlashTicks = state.player.hurtFlashTicks;
            this.camera.snapTo(state.player.x, state.player.y);
          }
          break;

        default:
          break;
      }
    }

    // Trigger bright radial muzzle flash glow, crosshair recoil & low-ammo alert on player shot
    if (state) {
      if (state.stats.shotsFired < this.lastShotsFired) {
        this.lastShotsFired = state.stats.shotsFired;
      } else if (state.stats.shotsFired > this.lastShotsFired) {
        this.lastShotsFired = state.stats.shotsFired;
        this.spawnPlayerMuzzleFlash(state);
        this.crosshairRecoil = Math.min(4.5, this.crosshairRecoil + 2.2);
        this.checkLowAmmoCallout(state);
      }
    }
  }

  private checkLowAmmoCallout(state: SimState): void {
    const player = state.player;
    if (!player.alive || player.gunWarrantTicks > 0) return;
    const slot = player.weapons[player.activeSlot];
    if (!slot) return;
    const wep = this.data.getWeapon(slot.weaponId);
    if (!wep || wep.ammoType === 'melee') return;
    const pool = wep.ammoType;
    const count = player.ammo[pool] ?? 0;
    const max = Math.max(1, player.ammoMax[pool] ?? 1);
    const frac = count / max;
    if (count > 0 && frac <= 0.15) {
      if (!this.lowAmmoWarnedPools.has(pool)) {
        this.lowAmmoWarnedPools.add(pool);
        this.pushFloatingText(player.x, player.y - 14, 'LOW AMMO', '#ffb838', 28, 'fntSmall', -0.45);
      }
    } else if (frac > 0.25) {
      this.lowAmmoWarnedPools.delete(pool);
    }
  }

  private spawnPlayerMuzzleFlash(state: SimState): void {
    const player = state.player;
    if (!player.alive) return;
    const slot = player.weapons[player.activeSlot];
    if (!slot) return;
    const wep = this.data.getWeapon(slot.weaponId);
    if (wep?.ammoType === 'melee' || wep?.projectileKind === 'melee_slash') return;

    const ang = player.aimAngle;
    const dist = 11;
    const mx = player.x + Math.cos(ang) * dist;
    const my = player.y + Math.sin(ang) * dist;

    let color = 'rgba(255, 200, 75, 0.88)';
    let coreColor = '#fff7d4';
    let radius = 18;

    const kind = wep?.projectileKind;
    if (kind === 'plasma' || kind === 'rad_beam') {
      color = 'rgba(90, 255, 130, 0.9)';
      coreColor = '#e2ffe8';
      radius = 24;
    } else if (kind === 'laser') {
      color = 'rgba(255, 65, 105, 0.9)';
      coreColor = '#ffe0e8';
      radius = 22;
    } else if (kind === 'lightning') {
      color = 'rgba(110, 225, 255, 0.9)';
      coreColor = '#e8fbff';
      radius = 22;
    } else if (kind === 'idpd_bullet') {
      color = 'rgba(85, 185, 255, 0.88)';
      coreColor = '#dff4ff';
      radius = 19;
    } else if (kind === 'bolt' || kind === 'seeking_bolt' || kind === 'toxic_bolt' || kind === 'splinter') {
      color = 'rgba(130, 255, 145, 0.78)';
      coreColor = '#eaffea';
      radius = 15;
    } else if (kind === 'shell' || kind === 'slug' || kind === 'flak') {
      color = 'rgba(255, 175, 55, 0.92)';
      coreColor = '#fff6cf';
      radius = 24;
    } else if (kind === 'rocket' || kind === 'nuke' || kind === 'grenade' || kind === 'cluster_grenade') {
      color = 'rgba(255, 140, 45, 0.92)';
      coreColor = '#fff0cc';
      radius = 26;
    }

    this.muzzleFlashes.push({
      x: mx,
      y: my,
      angle: ang,
      radius,
      color,
      coreColor,
      life: 3.2,
      maxLife: 3.2,
    });
    // Cast a brief dynamic muzzle flash light in dark biomes (Sewers, Caves, Labs, Palace)
    this.spawnFlashLight(mx, my, Math.max(46, radius * 2.3), color, 3.2);
  }

  /**
   * Advances render-side FX (floating numbers, transient particles, smoke puffs,
   * flash lights, enemy alert/jolt states, muzzle flashes, shockwaves) and camera tracking.
   */
  updatePresentation(
    state: SimState,
    aimWorldX: number,
    aimWorldY: number,
    dtSeconds: number,
    settings: RenderSettings,
    interpAlpha: number = 1,
  ): void {
    this.renderTimeSec += dtSeconds;
    const ticks = Math.max(0, dtSeconds * 30);
    const isClassic30 = settings.targetFps === 30 || settings.classic30Fps;
    const alpha = isClassic30 ? 1 : Math.max(0, Math.min(1, interpAlpha));

    // Subtle Boss Intro camera focus beat (pans gently ~30% toward boss, then glides back)
    if (state.boss && !state.boss.defeated && state.boss.introTicks > 10) {
      let bossEnt: EnemyEntity | undefined;
      for (let i = 0; i < state.enemies.length; i++) {
        if (state.enemies[i]!.id === state.boss.entityId) {
          bossEnt = state.enemies[i]!;
          break;
        }
      }
      if (bossEnt) {
        const bx = lerp(bossEnt.prevX, bossEnt.x, alpha);
        const by = lerp(bossEnt.prevY, bossEnt.y, alpha);
        const focusFrac = Math.min(1, (state.boss.introTicks - 10) / 28);
        this.camera.setFocusBias(bx, by, 0.3 * focusFrac);
      } else {
        this.camera.clearFocusBias();
      }
    } else {
      this.camera.clearFocusBias();
    }

    // Smooth camera tracking using interpolated player position at 60/120 FPS
    const camPlayerX = lerp(state.player.prevX, state.player.x, alpha);
    const camPlayerY = lerp(state.player.prevY, state.player.y, alpha);
    this.camera.update(camPlayerX, camPlayerY, aimWorldX, aimWorldY, dtSeconds, settings);

    // Detect fresh player hurt onset for brief screen-edge damage border flash
    if (state.player.hurtFlashTicks > this.lastHurtFlashTicks) {
      this.screenHurtFlashTicks = 3.2;
    }
    this.lastHurtFlashTicks = state.player.hurtFlashTicks;

    // Decay screen & crosshair juice timers
    if (this.screenHurtFlashTicks > 0) this.screenHurtFlashTicks = Math.max(0, this.screenHurtFlashTicks - ticks);
    if (this.screenBlastFlashTicks > 0) this.screenBlastFlashTicks = Math.max(0, this.screenBlastFlashTicks - ticks);
    if (this.crosshairHitTicks > 0) {
      this.crosshairHitTicks = Math.max(0, this.crosshairHitTicks - ticks);
      if (this.crosshairHitTicks <= 0) this.crosshairHitCrit = false;
    }
    if (this.crosshairRecoil > 0) {
      this.crosshairRecoil *= Math.pow(0.74, ticks);
      if (this.crosshairRecoil < 0.08) this.crosshairRecoil = 0;
    }

    // Sync per-enemy alert (!) and impact jolt FX states
    const curTick = state.tick;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      let fx = this.enemyFx.get(e.id);
      if (!fx) {
        const startsAlert = e.aiState === 'alert';
        fx = {
          lastAiState: e.aiState,
          alertTicks: startsAlert ? 18 : 0,
          alertMaxTicks: 18,
          lastHurtTicks: e.hurtFlashTicks,
          joltTicks: 0,
          seenTick: curTick,
        };
        this.enemyFx.set(e.id, fx);
      } else {
        if (
          !e.friendly &&
          PASSIVE_AI_STATES.has(fx.lastAiState) &&
          ACTIVE_AI_STATES.has(e.aiState)
        ) {
          fx.alertTicks = 18;
          fx.alertMaxTicks = 18;
        }
        if (e.hurtFlashTicks > fx.lastHurtTicks) {
          fx.joltTicks = 5;
        }
        fx.lastAiState = e.aiState;
        fx.lastHurtTicks = e.hurtFlashTicks;
        fx.seenTick = curTick;
      }
      if (fx.alertTicks > 0) fx.alertTicks = Math.max(0, fx.alertTicks - ticks);
      if (fx.joltTicks > 0) fx.joltTicks = Math.max(0, fx.joltTicks - ticks);
    }
    // Prune dead/despawned enemy FX entries periodically
    if (this.enemyFx.size > state.enemies.length + 12) {
      for (const [id, fx] of this.enemyFx) {
        if (fx.seenTick !== curTick) {
          this.enemyFx.delete(id);
        }
      }
    }

    // Stamp directional floor skid marks & dust specks under fast-flying corpses (once per sim tick)
    if (curTick !== this.lastSkidTick) {
      this.lastSkidTick = curTick;
      for (let i = 0; i < state.corpses.length; i++) {
        const c = state.corpses[i]!;
        if (c.baked) continue;
        const spdSq = c.vx * c.vx + c.vy * c.vy;
        if (spdSq > 3.2) {
          this.floorBuffer.bakeSkidMark(c.x, c.y + 2, c.vx, c.vy);
          if ((curTick + c.id) % 2 === 0 && this.transientParticles.length < 200) {
            this.transientParticles.push({
              kind: 'blood_drop',
              x: c.x,
              y: c.y + 1,
              vx: -c.vx * 0.2 + (this.nextFxHash() - 0.5) * 1.1,
              vy: -c.vy * 0.2 + (this.nextFxHash() - 0.5) * 1.1,
              color: '#a81c28',
              size: 2,
              life: 7,
              maxLife: 7,
            });
          }
        }
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      ft.y += ft.vy * ticks;
      ft.life -= ticks;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Update transient event-spawned particles
    for (let i = this.transientParticles.length - 1; i >= 0; i--) {
      const pt = this.transientParticles[i]!;
      pt.x += pt.vx * ticks;
      pt.y += pt.vy * ticks;
      pt.vx *= Math.pow(0.88, ticks);
      pt.vy *= Math.pow(0.88, ticks);
      pt.life -= ticks;
      if (pt.life <= 0) {
        this.transientParticles.splice(i, 1);
      }
    }

    // Update billowing explosion smoke puffs
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const sp = this.smokePuffs[i]!;
      sp.x += sp.vx * ticks;
      sp.y += sp.vy * ticks;
      sp.vx *= Math.pow(0.86, ticks);
      sp.vy *= Math.pow(0.86, ticks);
      sp.life -= ticks;
      if (sp.life <= 0) {
        this.smokePuffs.splice(i, 1);
      }
    }

    // Update transient dynamic flash lights
    for (let i = this.flashLights.length - 1; i >= 0; i--) {
      const fl = this.flashLights[i]!;
      fl.life -= ticks;
      if (fl.life <= 0) {
        this.flashLights.splice(i, 1);
      }
    }

    // Update muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i]!;
      mf.life -= ticks;
      if (mf.life <= 0) {
        this.muzzleFlashes.splice(i, 1);
      }
    }

    // Update explosion shockwave rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i]!;
      sw.life -= ticks;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  /**
   * Renders the full 7-layer Krunked Throne gameplay world onto ctx.
   */
  renderWorld(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    settings: RenderSettings,
    interpAlpha: number = 1,
    cursorScreen?: { x: number; y: number },
    inputMode: RenderInputDeviceMode = 'kbm',
  ): void {
    const w = settings.widescreen ? LOGICAL_WIDTH_16_9 : LOGICAL_WIDTH_4_3;
    const h = LOGICAL_HEIGHT;
    this.logicalWidth = w;
    this.logicalHeight = h;
    this.camera.setViewport(w, h);
    this.camera.pixelSnap = settings.pixelSnap;

    ctx.imageSmoothingEnabled = false;

    const isClassic30 = settings.targetFps === 30 || settings.classic30Fps;
    const alpha = isClassic30 ? 1 : Math.max(0, Math.min(1, interpAlpha));
    const map = state.map;
    const areaDef = this.data.getArea(state.areaCode) ?? this.data.getAreaByBiome(state.biome);
    const pal = BIOME_FALLBACK_PALETTES[state.biome] ?? BIOME_FALLBACK_PALETTES.desert;

    // Ensure persistent FloorBuffer matches current level & sync any carved walls
    const areaKey = `${state.areaCode}:${state.loop}:${map.width}x${map.height}`;
    if (this.lastMapRef !== map || this.lastAreaKey !== areaKey || state.floorClearTrigger) {
      this.floorBuffer.rebuild(map, areaDef);
      // Bake any pre-existing decals already stored on state.decals
      for (let i = 0; i < state.decals.length; i++) {
        this.floorBuffer.bakeDecal(state.decals[i]!);
      }
      this.lastMapRef = map;
      this.lastAreaKey = areaKey;
    } else {
      this.floorBuffer.syncMapChanges(map, areaDef);
    }

    // Background clear
    ctx.fillStyle = pal.voidBg;
    ctx.fillRect(0, 0, w, h);

    const view = this.camera.getViewOrigin();
    const viewLeft = view.left;
    const viewTop = view.top;

    // Interpolated player coords
    const playerX = lerp(state.player.prevX, state.player.x, alpha);
    const playerY = lerp(state.player.prevY, state.player.y, alpha);

    // ------------------------------------------------------------------------
    // LAYER 1: Persistent FloorBuffer
    // ------------------------------------------------------------------------
    const floorCanvas = this.floorBuffer.getCanvas();
    if (floorCanvas) {
      const srcX = Math.max(0, Math.floor(viewLeft));
      const srcY = Math.max(0, Math.floor(viewTop));
      const srcRight = Math.min(floorCanvas.width, Math.ceil(viewLeft + w));
      const srcBot = Math.min(floorCanvas.height, Math.ceil(viewTop + h));
      const srcW = srcRight - srcX;
      const srcH = srcBot - srcY;
      if (srcW > 0 && srcH > 0) {
        const dstX = Math.round(srcX - viewLeft);
        const dstY = Math.round(srcY - viewTop);
        ctx.drawImage(floorCanvas, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
      }
    }

    // World-space transform for layers 2-5
    ctx.save();
    ctx.translate(-viewLeft, -viewTop);

    // ------------------------------------------------------------------------
    // LAYER 2: 2.5D Walls (drop shadows, sprWall*Bot front faces, sprWall*Out, sprWall*Top)
    // ------------------------------------------------------------------------
    this.renderWalls(ctx, map, viewLeft, viewTop, w, h, areaDef);

    // ------------------------------------------------------------------------
    // LAYER 3: Ground Shadows, Throne Beam Warning Column, Pickups, Portal
    // ------------------------------------------------------------------------
    this.renderThroneBeamTelegraph(ctx, state, alpha);
    this.renderGroundShadows(ctx, state, playerX, playerY, alpha);
    this.renderPickups(ctx, state.pickups, state.tick, settings.pixelSnap);
    if (state.portal.active) {
      this.renderPortal(ctx, state, settings.pixelSnap);
    }

    // ------------------------------------------------------------------------
    // LAYER 4: Strict Y-Sorted Entities (Props, Corpses, Casings, Player, Enemies, Bosses)
    // ------------------------------------------------------------------------
    const drawList: DrawableEntity[] = [];

    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (this.isOutsideView(prop.x, prop.y, 40, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: prop.y,
        draw: () => this.renderProp(ctx, prop, state.tick, settings.pixelSnap),
      });
    }

    for (let i = 0; i < state.corpses.length; i++) {
      const corpse = state.corpses[i]!;
      if (corpse.baked) continue;
      if (this.isOutsideView(corpse.x, corpse.y, 32, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: corpse.y - 2,
        draw: () => this.renderCorpse(ctx, corpse, settings.pixelSnap),
      });
    }

    for (let i = 0; i < state.casings.length; i++) {
      const casing = state.casings[i]!;
      if (casing.baked) continue;
      if (this.isOutsideView(casing.x, casing.y, 16, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: casing.y - 1,
        draw: () => this.renderCasing(ctx, casing, settings.pixelSnap),
      });
    }

    // Player
    drawList.push({
      sortY: playerY,
      draw: () => this.renderPlayer(ctx, state, playerX, playerY, settings.pixelSnap),
    });

    // Enemies & Bosses
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i]!;
      const ex = lerp(enemy.prevX, enemy.x, alpha);
      const ey = lerp(enemy.prevY, enemy.y, alpha);
      if (this.isOutsideView(ex, ey, enemy.isBoss ? 80 : 36, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: ey,
        draw: () => this.renderEnemy(ctx, enemy, ex, ey, state.tick, settings.pixelSnap, map),
      });
    }

    drawList.sort((a, b) => a.sortY - b.sortY);
    for (let i = 0; i < drawList.length; i++) {
      drawList[i]!.draw();
    }

    // ------------------------------------------------------------------------
    // LAYER 5: Projectiles + Trails, Muzzle Flashes, Shockwaves, Particles, Text
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.projectiles.length; i++) {
      const proj = state.projectiles[i]!;
      const px = lerp(proj.prevX, proj.x, alpha);
      const py = lerp(proj.prevY, proj.y, alpha);
      if (this.isOutsideView(px, py, 64, viewLeft, viewTop, w, h)) continue;
      this.renderProjectile(ctx, proj, px, py, state.tick, settings.pixelSnap, alpha);
    }

    this.renderSmokePuffs(ctx);
    this.renderMuzzleFlashes(ctx);
    this.renderShockwaves(ctx);
    this.renderParticles(ctx, state, settings.pixelSnap);
    this.renderFloatingTexts(ctx);

    // Nearby weapon pickup callout in world space (neatly below weapon, adaptive prompt)
    this.renderNearbyWeaponPrompt(ctx, state, playerX, playerY, inputMode);

    ctx.restore();

    // ------------------------------------------------------------------------
    // LAYER 6: Darkness & Dynamic Glow Lighting Pass + Biome Ambient + Screen FX
    // ------------------------------------------------------------------------
    this.extraLightScratch.length = 0;
    for (let i = 0; i < this.flashLights.length; i++) {
      const fl = this.flashLights[i]!;
      const frac = Math.max(0, Math.min(1, fl.life / Math.max(0.1, fl.maxLife)));
      this.extraLightScratch.push({
        x: fl.x,
        y: fl.y,
        radius: fl.radius * (0.55 + 0.45 * frac),
        intensity: frac,
        glowColor: fl.glowColor,
      });
    }
    this.lighting.render(ctx, state, this.camera, playerX, playerY, alpha, this.extraLightScratch);
    this.renderBiomeAmbientParticles(ctx, state.biome, viewLeft, viewTop, w, h);
    this.renderScreenEffects(ctx, state, w, h);

    // ------------------------------------------------------------------------
    // LAYER 7: Crosshair (sprCrosshair + dynamic hit-confirm & recoil bloom)
    // ------------------------------------------------------------------------
    if (cursorScreen && inputMode !== 'touch') {
      this.renderCrosshair(ctx, cursorScreen.x, cursorScreen.y, settings.crosshairStyle);
    }
  }

  private isOutsideView(
    x: number,
    y: number,
    margin: number,
    viewLeft: number,
    viewTop: number,
    w: number,
    h: number,
  ): boolean {
    return (
      x + margin < viewLeft ||
      x - margin > viewLeft + w ||
      y + margin < viewTop ||
      y - margin > viewTop + h
    );
  }

  private renderWalls(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    map: WorldMap,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    areaDef?: { wallTopSprite: string; wallBotSprite: string; wallOutSprite: string },
  ): void {
    const ts = map.tileSize || TILE_SIZE;
    const minTx = Math.max(0, Math.floor(viewLeft / ts) - 1);
    const maxTx = Math.min(map.width - 1, Math.ceil((viewLeft + viewW) / ts) + 1);
    const minTy = Math.max(0, Math.floor(viewTop / ts) - 1);
    const maxTy = Math.min(map.height - 1, Math.ceil((viewTop + viewH) / ts) + 2);

    const num = BIOME_SPRITE_NUMBER[map.biome] ?? 1;
    const wallTopSpr = areaDef?.wallTopSprite ?? `sprWall${num}Top`;
    const wallBotSpr = areaDef?.wallBotSprite ?? `sprWall${num}Bot`;
    const wallOutSpr = areaDef?.wallOutSprite ?? `sprWall${num}Out`;
    const pal = BIOME_FALLBACK_PALETTES[map.biome] ?? BIOME_FALLBACK_PALETTES.desert;

    const overhang = 8; // 2.5D roof cap elevation

    // Pass 2a: Layered 2-step soft ambient occlusion along south-facing & side wall bases
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = ty * map.width;
      for (let tx = minTx; tx <= maxTx; tx++) {
        if ((map.wallMask[row + tx]! & 16) !== 0) {
          ctx.fillRect(tx * ts, (ty + 1) * ts, ts, 2);
        }
      }
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = ty * map.width;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const mask = map.wallMask[row + tx]!;
        const px = tx * ts;
        const py = ty * ts;
        if ((mask & 16) !== 0) {
          ctx.fillRect(px, py + ts + 2, ts, 3);
        }
        // Subtle 2px ambient occlusion hug along exposed east/west wall-floor seams
        if (!isWalkable(map.tiles[row + tx]!)) {
          if (tx + 1 < map.width && isWalkable(map.tiles[row + tx + 1]!)) {
            ctx.fillRect(px + ts, py, 2, ts);
          }
          if (tx > 0 && isWalkable(map.tiles[row + tx - 1]!)) {
            ctx.fillRect(px - 2, py, 2, ts);
          }
        }
      }
    }

    // Pass 2b: Wall outer outlines (sprWall*Out) on exposed perimeter walls
    if (this.sprites.hasSprite(wallOutSpr)) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        const row = ty * map.width;
        for (let tx = minTx; tx <= maxTx; tx++) {
          const tile = map.tiles[row + tx]!;
          if (isWalkable(tile)) continue;
          if (!hasNearbyFloor(map, tx, ty)) continue;
          this.sprites.draw(ctx, wallOutSpr, tx * ts, ty * ts, { frame: 0, pixelSnap: true });
        }
      }
    }

    // Pass 2c: 2.5D front-faces (sprWall*Bot) when wallMask bit4 (16) is set
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = ty * map.width;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const mask = map.wallMask[row + tx]!;
        if ((mask & 16) === 0) continue;
        const px = tx * ts;
        const py = ty * ts;
        const variant = map.floorVariants[row + tx] ?? ((tx * 3 + ty * 7) & 3);
        const drew = this.sprites.draw(ctx, wallBotSpr, px, py, { frame: variant, pixelSnap: true });
        if (!drew) {
          ctx.fillStyle = pal.wallBot;
          ctx.fillRect(px, py, ts, ts);
          ctx.fillStyle = pal.wallTop;
          ctx.fillRect(px + 1, py + 5, 6, 4);
          ctx.fillRect(px + 9, py + 10, 6, 4);
          ctx.fillStyle = '#0e0a12';
          ctx.fillRect(px, py + ts - 2, ts, 2);
        }
      }
    }

    // Pass 2d: Wall top roof caps (sprWall*Top)
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = ty * map.width;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tile = map.tiles[row + tx]!;
        if (isWalkable(tile)) continue;
        const mask = map.wallMask[row + tx]!;
        const px = tx * ts;
        const py = ty * ts;
        const nearFloor = hasNearbyFloor(map, tx, ty);

        if (!nearFloor) {
          // Deep interior solid rock block
          ctx.fillStyle = pal.voidBg;
          ctx.fillRect(px, py - overhang, ts, ts + overhang);
          continue;
        }

        const variant = map.floorVariants[row + tx] ?? ((tx * 5 + ty * 11) & 7);
        const topY = py - overhang;
        const drewTop = this.sprites.draw(ctx, wallTopSpr, px, topY, {
          frame: variant,
          pixelSnap: true,
        });
        if (!drewTop) {
          ctx.fillStyle = pal.wallTop;
          ctx.fillRect(px, topY, ts, ts);
          ctx.fillStyle = pal.wallEdge;
          if ((mask & 1) === 0) ctx.fillRect(px, topY, ts, 2);
          if ((mask & 8) === 0) ctx.fillRect(px, topY, 2, ts);
          ctx.fillStyle = pal.wallBot;
          if ((mask & 4) === 0) ctx.fillRect(px, topY + ts - 2, ts, 2);
        }

        // If this wall does NOT expose a south front-face, fill the lower 8px seam cleanly
        if ((mask & 16) === 0) {
          const drewLower = this.sprites.draw(ctx, wallTopSpr, px, py, {
            frame: variant,
            pixelSnap: true,
          });
          if (!drewLower) {
            ctx.fillStyle = pal.wallTop;
            ctx.fillRect(px, py + ts - overhang, ts, overhang);
          }
        }

        // Autotiled 2.5D perimeter roof bevels & crisp outer contour (strictly on exposed edges
        // so contiguous wall blocks read as sculpted cohesive canyon mesas, never a repeating grid!)
        const northOpen = (mask & 1) === 0;
        const eastOpen = (mask & 2) === 0;
        const southOpen = (mask & 4) === 0 || (mask & 16) !== 0;
        const westOpen = (mask & 8) === 0;
        const capH = (mask & 16) !== 0 ? ts : ts + overhang;

        if (northOpen) {
          ctx.fillStyle = 'rgba(12, 8, 16, 0.72)';
          ctx.fillRect(px, topY - 1, ts, 1);
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY, ts, 2);
        }
        if (westOpen) {
          ctx.fillStyle = 'rgba(12, 8, 16, 0.62)';
          ctx.fillRect(px - 1, topY, 1, capH);
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY, 1, capH);
        }
        if (eastOpen) {
          ctx.fillStyle = 'rgba(12, 8, 16, 0.56)';
          ctx.fillRect(px + ts - 1, topY, 1, capH);
        }
        if (southOpen && (mask & 16) !== 0) {
          // Crisp sunlit cliff-edge highlight above the shaded 2.5D south overhang lip
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY + ts - 2, ts, 1);
          ctx.fillStyle = 'rgba(10, 6, 14, 0.85)';
          ctx.fillRect(px, topY + ts - 1, ts, 1);
        }
      }
    }
  }

  private renderGroundShadows(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    playerX: number,
    playerY: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';

    // Player shadow
    if (state.player.alive) {
      ctx.beginPath();
      ctx.ellipse(Math.round(playerX), Math.round(playerY + 5), 6.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemy shadows (shrunk dynamically when airborne + landing ring under Lil' Hunter!)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const ex = lerp(e.prevX, e.x, alpha);
      const ey = lerp(e.prevY, e.y, alpha);
      const elev = e.elevated ? Math.max(0, e.elevZ ?? 14) : 0;
      const elevScale = Math.max(0.45, 1 - elev * 0.015);
      const rx = Math.max(4, Math.round(e.radius * 0.98 * elevScale));
      const ry = Math.max(2, Math.round(e.radius * 0.46 * elevScale));
      ctx.beginPath();
      ctx.ellipse(Math.round(ex), Math.round(ey + Math.min(8, e.radius * 0.65)), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      if (e.bossId === 'lil_hunter' && e.elevated) {
        ctx.save();
        const ringPulse = 10 + Math.sin(this.renderTimeSec * 22) * 3;
        ctx.strokeStyle = 'rgba(255, 72, 82, 0.82)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(Math.round(ex), Math.round(ey + 4), ringPulse, ringPulse * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Prop shadows
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'snare_trap') continue;
      const rx = Math.max(5, Math.round(p.radius));
      const ry = Math.max(3, Math.round(p.radius * 0.46));
      ctx.beginPath();
      ctx.ellipse(Math.round(p.x), Math.round(p.y + 4), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pickup contact shadows (anchor bobbing rads/medkits/ammo/weapons cleanly to the floor!)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      const rx = pk.kind === 'weapon' ? 6 : pk.kind === 'big_rad' ? 4.5 : 3.5;
      const ry = pk.kind === 'weapon' ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.ellipse(Math.round(pk.x), Math.round(pk.y + 4), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Airborne bouncing brass casing shadows (gives crisp 3D arc depth)
    for (let i = 0; i < state.casings.length; i++) {
      const c = state.casings[i]!;
      if (c.baked || c.z <= 0.35) continue;
      ctx.fillRect(Math.round(c.x - 1), Math.round(c.y + 1), 2, 1);
    }

    ctx.restore();
  }

  private renderPickups(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    pickups: readonly PickupEntity[],
    tick: number,
    pixelSnap: boolean,
  ): void {
    for (let i = 0; i < pickups.length; i++) {
      const pk = pickups[i]!;
      // Blink slightly when close to expiring
      if (pk.lifeTicks > 0 && pk.lifeTicks < 60 && Math.floor(pk.lifeTicks / 4) % 2 === 0) {
        continue;
      }
      const bob = Math.sin((tick + pk.id * 7) * 0.22) * 1.4;
      const py = pk.y + bob;
      let spr = 'sprRad';
      if (pk.kind === 'big_rad') spr = this.sprites.hasSprite('sprBigRad') ? 'sprBigRad' : 'sprRadBig';
      else if (pk.kind === 'ammo') spr = 'sprAmmo';
      else if (pk.kind === 'hp') spr = 'sprHP';
      else if (pk.kind === 'portal_strike') spr = this.sprites.hasSprite('sprRogueAmmoHUD') ? 'sprRogueAmmoHUD' : 'sprAmmo';
      else if (pk.kind === 'weapon' && pk.weaponId) {
        spr = resolveWeaponSpriteName(pk.weaponId, this.data);
      }

      const drew = this.sprites.draw(ctx, spr, pk.x, py, {
        frame: Math.floor(pk.animFrame || tick * 0.2),
        pixelSnap,
      });

      if (!drew) {
        const x = Math.round(pk.x);
        const y = Math.round(py);
        ctx.fillStyle = '#120e16';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle =
          pk.kind === 'hp'
            ? '#ff3b4a'
            : pk.kind === 'ammo'
              ? '#f5c742'
              : pk.kind === 'weapon'
                ? '#c7d2e0'
                : pk.kind === 'portal_strike'
                  ? '#52a8ff'
                  : '#59ff66';
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }

      // Cursed weapon purple aura sparkle
      if (pk.cursed) {
        ctx.save();
        ctx.fillStyle = '#c94aff';
        ctx.globalAlpha = 0.65;
        const ox = Math.round(Math.cos(tick * 0.3 + pk.id) * 6);
        const oy = Math.round(Math.sin(tick * 0.3 + pk.id) * 4);
        ctx.fillRect(Math.round(pk.x + ox), Math.round(py + oy), 2, 2);
        ctx.restore();
      }
    }
  }

  private renderPortal(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    pixelSnap: boolean,
  ): void {
    const portal = state.portal;
    const px = Math.round(portal.x);
    const py = Math.round(portal.y);

    // Outer swirling vortex aura via cached radial glow stamps (zero per-frame gradients)
    ctx.save();
    const outerR = Math.max(18, portal.radius + Math.sin(state.tick * 0.3) * 3);
    const outerStamp = this.getGlowStamp('rgba(170, 75, 245, 0.72)', outerR);
    if (outerStamp) {
      ctx.drawImage(
        outerStamp,
        Math.floor(px - outerR),
        Math.floor(py - outerR),
        Math.ceil(outerR * 2),
        Math.ceil(outerR * 2),
      );
    }
    const coreR = outerR * 0.45;
    const coreStamp = this.getGlowStamp('rgba(245, 220, 255, 0.85)', coreR);
    if (coreStamp) {
      ctx.drawImage(
        coreStamp,
        Math.floor(px - coreR),
        Math.floor(py - coreR),
        Math.ceil(coreR * 2),
        Math.ceil(coreR * 2),
      );
    }

    // Animated suction rings + subtle chromatic radial distortion pulses
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) {
      const phase = (this.renderTimeSec * 1.45 + r / 3) % 1;
      const ringR = outerR * 1.45 * (1 - phase);
      ctx.strokeStyle =
        r === 0
          ? `rgba(235, 195, 255, ${(0.55 * phase).toFixed(3)})`
          : r === 1
            ? `rgba(120, 225, 255, ${(0.38 * phase).toFixed(3)})`
            : `rgba(195, 115, 255, ${(0.48 * phase).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2, ringR), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Deterministic zero-GC spiraling suction debris & violet energy shards
    const t = this.renderTimeSec;
    for (let d = 0; d < 12; d++) {
      const prog = (t * (0.95 + (d % 3) * 0.25) + d * 0.21) % 1;
      const dist = (1 - prog * prog) * (outerR * 2.55);
      const ang = d * 1.618 * Math.PI + prog * 4.4;
      const dx = Math.round(px + Math.cos(ang) * dist);
      const dy = Math.round(py + Math.sin(ang) * dist);
      const sz = d % 3 === 0 ? 2 : 1;
      ctx.fillStyle = d % 2 === 0 ? '#e8b5ff' : d % 3 === 0 ? '#78d8ff' : '#4a3d47';
      ctx.globalAlpha = Math.min(1, prog * 1.6) * (1 - prog * 0.3);
      ctx.fillRect(dx, dy, sz, sz);
    }
    ctx.restore();

    const frame = Math.floor(state.tick * 0.35);
    const drew = this.sprites.draw(ctx, 'sprPortal', px, py, {
      frame,
      rotation: state.tick * 0.08,
      pixelSnap,
    });
    if (!drew) {
      ctx.fillStyle = '#5a1e8c';
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c46bff';
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderProp(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    prop: PropEntity,
    tick: number,
    pixelSnap: boolean,
  ): void {
    const sprName = prop.opened && prop.openSprite ? prop.openSprite : prop.sprite;
    const whiteFlash = prop.hurtFlashTicks >= 2;
    const joltX = prop.hurtFlashTicks > 0 ? ((prop.hurtFlashTicks & 1) === 0 ? 1 : -1) : 0;
    const scaleX = whiteFlash ? 1.12 : prop.hurtFlashTicks > 0 ? 0.95 : 1;
    const scaleY = whiteFlash ? 0.89 : prop.hurtFlashTicks > 0 ? 1.05 : 1;
    const drew = this.sprites.draw(ctx, sprName, prop.x + joltX, prop.y, {
      frame: Math.floor(tick * 0.15),
      flashWhite: whiteFlash,
      scaleX,
      scaleY,
      pixelSnap,
    });

    if (!drew) {
      const x = Math.round(prop.x);
      const y = Math.round(prop.y);
      const r = Math.max(5, Math.round(prop.radius));
      if (prop.kind === 'snare_trap') {
        ctx.strokeStyle = '#4de85a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#141018';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle =
        prop.hurtFlashTicks > 0
          ? '#ffffff'
          : prop.kind === 'rad_canister'
            ? '#52e864'
            : prop.kind === 'weapon_chest' || prop.kind === 'big_weapon_chest'
              ? '#c43b3b'
              : prop.kind === 'ammo_chest'
                ? '#d9a432'
                : prop.kind === 'throne_generator'
                  ? '#47d970'
                  : prop.kind === 'toxic_barrel'
                    ? '#4ab347'
                    : '#7d6e65';
      ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
    }

    // Throne generator HP bar when damaged
    if (prop.kind === 'throne_generator' && prop.hp > 0 && prop.hp < prop.maxHp) {
      const bw = 20;
      const frac = Math.max(0, Math.min(1, prop.hp / prop.maxHp));
      const bx = Math.round(prop.x - bw / 2);
      const by = Math.round(prop.y - 16);
      ctx.fillStyle = '#141018';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#52e864';
      ctx.fillRect(bx, by, Math.round(bw * frac), 2);
    }
  }

  private renderCorpse(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    corpse: CorpseEntity,
    pixelSnap: boolean,
  ): void {
    const drew = this.sprites.draw(ctx, corpse.sprite, corpse.x, corpse.y, {
      frame: corpse.frame,
      flipX: corpse.facing === -1,
      pixelSnap,
    });
    if (!drew) {
      const x = Math.round(corpse.x);
      const y = Math.round(corpse.y);
      ctx.fillStyle = '#241418';
      ctx.fillRect(x - 6, y - 3, 12, 6);
      ctx.fillStyle = '#8f292e';
      ctx.fillRect(x - 5, y - 2, 10, 4);
    }
  }

  private renderCasing(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    casing: CasingEntity,
    pixelSnap: boolean,
  ): void {
    const drawY = casing.y - Math.max(0, casing.z);
    const spr =
      casing.kind === 'shell'
        ? 'sprShotShell'
        : casing.kind === 'bullet'
          ? 'sprBulletShell'
          : '';
    if (spr && this.sprites.draw(ctx, spr, casing.x, drawY, { rotation: casing.angle, pixelSnap })) {
      return;
    }
    ctx.save();
    ctx.translate(Math.round(casing.x), Math.round(drawY));
    ctx.rotate(casing.angle);
    ctx.fillStyle =
      casing.kind === 'shell'
        ? '#d94538'
        : casing.kind === 'energy'
          ? '#52c8ff'
          : casing.kind === 'bolt'
            ? '#70e075'
            : '#e8c44a';
    ctx.fillRect(-1, -1, 3, 2);
    ctx.restore();
  }

  private renderPlayer(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    px: number,
    py: number,
    pixelSnap: boolean,
  ): void {
    const player = state.player;
    const mutantDef = this.data.getMutant(player.mutant);
    const useB = player.skin === 'b';
    const moving = Math.hypot(player.vx, player.vy) > 0.3;

    // Pick character sprite (respecting B-skin with safe fallback to A-skin)
    let charSprite = mutantDef.sprites.idle;
    if (!player.alive) {
      charSprite = (useB && mutantDef.sprites.bDead) || mutantDef.sprites.dead;
    } else if (player.hurtFlashTicks > 0) {
      charSprite = (useB && mutantDef.sprites.bHurt) || mutantDef.sprites.hurt;
    } else if (moving) {
      charSprite = (useB && mutantDef.sprites.bWalk) || mutantDef.sprites.walk;
    } else {
      charSprite = (useB && mutantDef.sprites.bIdle) || mutantDef.sprites.idle;
    }
    if (!this.sprites.hasSprite(charSprite)) {
      charSprite = !player.alive
        ? mutantDef.sprites.dead
        : moving
          ? mutantDef.sprites.walk
          : mutantDef.sprites.idle;
    }

    // Active Eyes Telekinesis ripple ring (drawn beneath player)
    if (player.telekinesisActive && player.alive) {
      ctx.save();
      const pulseR = 16 + ((state.tick * 2) % 24);
      ctx.strokeStyle = 'rgba(105, 195, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(px), Math.round(py), pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Strong Spirit halo aura behind player
    if (player.strongSpiritReady && player.alive) {
      const drewHalo = this.sprites.draw(ctx, 'sprStrongSpirit', px, py - 2, {
        frame: Math.floor(state.tick * 0.25),
        alpha: 0.72,
        pixelSnap,
      });
      if (!drewHalo) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120, 235, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(Math.round(px), Math.round(py - 8), 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Aiming direction: behind player when aiming UP (sin(aimAngle) < 0), in front when aiming DOWN
    const aimingUp = Math.sin(player.aimAngle) < 0;
    const activeWeaponSlot = player.weapons[player.activeSlot];
    const offhandSlot = player.mutant === 'steroids' ? player.weapons[player.activeSlot === 0 ? 1 : 0] : null;

    const drawHeldWeapon = (slot: PlayerState['weapons'][0] | null, isOffhand: boolean): void => {
      if (!slot || !player.alive) return;
      const wepSpr = resolveWeaponSpriteName(slot.weaponId, this.data);
      const kick = slot.kickOffset || 0;
      const handSide = isOffhand ? -player.facing : player.facing;
      const anchorX = px + handSide * 3 - Math.cos(player.aimAngle) * kick;
      const anchorY = py + 1 - Math.sin(player.aimAngle) * kick;
      const flipY = Math.cos(player.aimAngle) < 0;
      // Snappy upward recoil flip on firing (classic Vlambeer gun feel!)
      const recoilTilt = kick > 0 ? (flipY ? 1 : -1) * Math.min(0.28, kick * 0.032) : 0;

      const drewWep = this.sprites.draw(ctx, wepSpr, anchorX, anchorY, {
        frame: 0,
        rotation: player.aimAngle + recoilTilt,
        flipY,
        pixelSnap,
      });
      if (!drewWep) {
        ctx.save();
        ctx.translate(Math.round(anchorX), Math.round(anchorY));
        ctx.rotate(player.aimAngle + recoilTilt);
        ctx.fillStyle = '#141018';
        ctx.fillRect(0, -2, 11, 5);
        ctx.fillStyle = '#c8d0db';
        ctx.fillRect(1, -1, 9, 3);
        ctx.restore();
      }
    };

    if (aimingUp) {
      drawHeldWeapon(offhandSlot, true);
      drawHeldWeapon(activeWeaponSlot, false);
    }

    // Floating Crown behind player
    if (state.crown !== 'none' && player.alive) {
      const crownDef = this.data.getCrown(state.crown);
      const cx = px - player.facing * 7;
      const cy = py - 8 + Math.sin(state.tick * 0.2) * 1.5;
      this.sprites.draw(ctx, moving ? crownDef.spriteWalk : crownDef.spriteIdle, cx, cy, {
        frame: Math.floor(state.tick * 0.2),
        pixelSnap,
      });
    }

    // Player body (with crisp 2-tick pure-white hurt flash, subtle impact squash, iframe blink & roll spin)
    const blinkAlpha =
      player.iframes > 0 && player.hurtFlashTicks === 0 && Math.floor(player.iframes / 2) % 2 === 0
        ? 0.55
        : 1;
    const rollRotation = player.rolling ? (state.tick * 0.65 * player.facing) : 0;
    const playerWhiteFlash = player.hurtFlashTicks >= 3;
    const playerScaleX = playerWhiteFlash ? 1.14 : player.hurtFlashTicks > 0 ? 0.94 : 1;
    const playerScaleY = playerWhiteFlash ? 0.88 : player.hurtFlashTicks > 0 ? 1.06 : 1;

    const drewPlayer = this.sprites.draw(ctx, charSprite, px, py, {
      frame: Math.floor(player.animFrame),
      flipX: player.facing === -1,
      scaleX: playerScaleX,
      scaleY: playerScaleY,
      rotation: rollRotation,
      flashWhite: playerWhiteFlash,
      alpha: blinkAlpha,
      pixelSnap,
    });

    if (!drewPlayer) {
      const x = Math.round(px);
      const y = Math.round(py);
      ctx.fillStyle = '#141018';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = player.hurtFlashTicks > 0 ? '#ffffff' : '#52d67a';
      ctx.fillRect(x - 5, y - 5, 10, 10);
    }

    if (!aimingUp) {
      drawHeldWeapon(offhandSlot, true);
      drawHeldWeapon(activeWeaponSlot, false);
    }

    // Crystal Shield dome overlay
    if (player.shielding && player.alive) {
      const shieldSpr = player.skin === 'b' && this.sprites.hasSprite('sprShieldB') ? 'sprShieldB' : 'sprShield';
      const drewShield = this.sprites.draw(ctx, shieldSpr, px, py, {
        frame: Math.floor(state.tick * 0.25),
        alpha: 0.85,
        pixelSnap,
      });
      if (!drewShield) {
        ctx.save();
        ctx.fillStyle = 'rgba(190, 90, 255, 0.35)';
        ctx.strokeStyle = '#f0b8ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(Math.round(px), Math.round(py), 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Chicken Headless pulsing blood spurts indicator
    if (player.headlessTicks > 0 && player.alive) {
      ctx.save();
      ctx.fillStyle = '#ff3847';
      ctx.fillRect(Math.round(px - 2), Math.round(py - 9), 4, 2);
      ctx.restore();
    }
  }

  private renderEnemy(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    enemy: EnemyEntity,
    ex: number,
    ey: number,
    tick: number,
    pixelSnap: boolean,
    map: WorldMap,
  ): void {
    const def = this.data.getEnemy(enemy.defId);
    const moving = Math.hypot(enemy.vx, enemy.vy) > 0.25;
    const prefix = resolveEnemySpritePrefix(enemy.defId, enemy.bossId);

    let sprName: string;
    if (def) {
      if (enemy.hurtFlashTicks > 0) sprName = def.sprites.hurt;
      else if (enemy.aiState === 'fire' && def.sprites.fire) sprName = def.sprites.fire;
      else if (enemy.aiState === 'tell' && def.sprites.tell) sprName = def.sprites.tell;
      else sprName = moving ? def.sprites.walk : def.sprites.idle;
    } else {
      sprName =
        enemy.hurtFlashTicks > 0
          ? `${prefix}Hurt`
          : moving
            ? `${prefix}Walk`
            : `${prefix}Idle`;
    }
    if (!this.sprites.hasSprite(sprName)) {
      sprName = `${prefix}Idle`;
    }

    const elevOffset = enemy.elevated ? Math.max(0, enemy.elevZ ?? 14) : 0;
    const drawY = ey - elevOffset;
    const fx = this.enemyFx.get(enemy.id);

    // Crisp 1-2 tick pure-white hit flash + Vlambeer impact squash/stretch jolt!
    const pureWhiteFlash = enemy.hurtFlashTicks >= 3;
    const joltAmt = fx && fx.joltTicks > 0 ? fx.joltTicks / 5 : 0;
    const impactScaleX = pureWhiteFlash
      ? 1.16
      : enemy.hurtFlashTicks > 0
        ? 0.93
        : 1 + joltAmt * 0.08;
    const impactScaleY = pureWhiteFlash
      ? 0.85
      : enemy.hurtFlashTicks > 0
        ? 1.07
        : 1 - joltAmt * 0.07;
    const tremorX =
      pureWhiteFlash
        ? ((tick + enemy.id) % 2 === 0 ? 1 : -1)
        : TELEGRAPH_AI_STATES.has(enemy.aiState) && enemy.aiTimer <= 8
          ? ((tick + enemy.id) % 2 === 0 ? 0.7 : -0.7)
          : 0;

    const drew = this.sprites.draw(ctx, sprName, ex + tremorX, drawY, {
      frame: Math.floor(enemy.animFrame || tick * 0.2),
      flipX: enemy.facing === -1,
      scaleX: impactScaleX,
      scaleY: impactScaleY,
      flashWhite: pureWhiteFlash,
      pixelSnap,
    });

    if (!drew) {
      const x = Math.round(ex + tremorX);
      const y = Math.round(drawY);
      const r = Math.max(6, Math.round(enemy.radius));
      ctx.fillStyle = '#141018';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = pureWhiteFlash ? '#ffffff' : enemy.friendly ? '#52e864' : enemy.isBoss ? '#d9483b' : '#c97538';
      ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
      ctx.fillStyle = '#ffe659';
      ctx.fillRect(x - 3, y - 3, 2, 2);
      ctx.fillRect(x + 1, y - 3, 2, 2);
    }

    // Enemy held weapon if defined
    if (def?.sprites.gun && this.sprites.hasSprite(def.sprites.gun)) {
      this.sprites.draw(ctx, def.sprites.gun, ex + tremorX + enemy.facing * 4, drawY + 1, {
        rotation: enemy.aimAngle,
        flipY: Math.cos(enemy.aimAngle) < 0,
        flashWhite: pureWhiteFlash,
        pixelSnap,
      });
    }

    // Crisp bouncing enemy alert '!' indicator when spotting player or waking up!
    if (fx && fx.alertTicks > 0 && !enemy.friendly) {
      const frac = fx.alertTicks / Math.max(1, fx.alertMaxTicks);
      const pop = frac > 0.75 ? 1 + (1 - frac) * 1.4 : 1;
      const bounceY = Math.sin(frac * Math.PI) * 3.5;
      const ax = Math.round(ex);
      const ay = Math.round(drawY - Math.max(10, enemy.radius + 5) - bounceY);
      ctx.save();
      ctx.globalAlpha = Math.min(1, frac * 2.2);
      ctx.translate(ax, ay);
      ctx.scale(pop, pop);
      // Dark 1px ink halo
      ctx.fillStyle = '#0c0812';
      ctx.fillRect(-2, -7, 5, 7);
      ctx.fillRect(-2, 1, 5, 4);
      // Vivid gold/crimson exclamation mark
      ctx.fillStyle = frac > 0.55 ? '#ffe852' : '#ff5947';
      ctx.fillRect(-1, -6, 3, 5);
      ctx.fillRect(-1, 2, 3, 2);
      // Hot white top specular pixel
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -6, 1, 2);
      ctx.restore();
    }

    // Plant Snare vine overlay when rooted
    if (enemy.snaredTicks > 0) {
      ctx.save();
      ctx.strokeStyle = '#52e864';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(Math.round(ex), Math.round(ey + 2), Math.max(7, enemy.radius + 1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Telegraphs: Crimson/cyan laser sightlines + crisp pre-attack flash stars for all telegraphed attackers!
    const isSniperOrCrystal =
      enemy.defId === 'sniper' ||
      enemy.defId === 'laser_crystal' ||
      enemy.defId === 'lightning_crystal';
    if (TELEGRAPH_AI_STATES.has(enemy.aiState)) {
      if (isSniperOrCrystal) {
        const rayDist = raycastWallDistance(map, ex, drawY, enemy.aimAngle, 230);
        const endX = ex + Math.cos(enemy.aimAngle) * rayDist;
        const endY = drawY + Math.sin(enemy.aimAngle) * rayDist;
        const pulse = 0.62 + 0.38 * Math.sin(this.renderTimeSec * 28 + enemy.id);
        const urgent = enemy.aiTimer <= 10;
        const outerColor =
          enemy.defId === 'lightning_crystal'
            ? `rgba(110, 215, 255, ${(0.34 * pulse).toFixed(3)})`
            : `rgba(255, 28, 62, ${(0.38 * pulse).toFixed(3)})`;
        const coreColor =
          enemy.defId === 'lightning_crystal'
            ? `rgba(180, 245, 255, ${(0.92 * pulse).toFixed(3)})`
            : urgent
              ? '#ff7a8f'
              : `rgba(255, 48, 78, ${(0.92 * pulse).toFixed(3)})`;

        ctx.save();
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = urgent ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(ex), Math.round(drawY));
        ctx.lineTo(Math.round(endX), Math.round(endY));
        ctx.stroke();

        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(ex), Math.round(drawY));
        ctx.lineTo(Math.round(endX), Math.round(endY));
        ctx.stroke();

        // Sightline muzzle & wall impact glint dots
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(endX) - 1, Math.round(endY) - 1, 2, 2);
        const glint = this.getGlowStamp('rgba(255, 42, 76, 0.72)', 8);
        if (glint) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glint, Math.floor(ex - 8), Math.floor(drawY - 8), 16, 16);
        }
        ctx.restore();
      } else if (enemy.bossId !== 'nuclear_throne') {
        const pulse = 0.5 + 0.5 * Math.sin(this.renderTimeSec * 32 + enemy.id);
        const isCharge = enemy.aiState === 'charge' || enemy.bossId === 'big_bandit' || enemy.defId === 'snowbot';
        if (isCharge) {
          const rayDist = raycastWallDistance(map, ex, drawY, enemy.aimAngle, 96);
          ctx.save();
          ctx.strokeStyle = `rgba(255, 92, 68, ${(0.42 + 0.32 * pulse).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(Math.round(ex), Math.round(drawY));
          ctx.lineTo(
            Math.round(ex + Math.cos(enemy.aimAngle) * rayDist),
            Math.round(drawY + Math.sin(enemy.aimAngle) * rayDist),
          );
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        // Crisp pre-attack telegraph glint star at weapon/muzzle tip (Bandit, Scorpion, Gator, Snow Tank, etc.)
        const muzzleDist = Math.max(6, enemy.radius * 0.85);
        const gx = Math.round(ex + Math.cos(enemy.aimAngle) * muzzleDist);
        const gy = Math.round(drawY + Math.sin(enemy.aimAngle) * muzzleDist);
        const isVenom = enemy.defId === 'scorpion' || enemy.defId === 'gold_scorpion';
        const glintCol = isVenom ? '#8cff52' : '#ffe047';
        const glowCol = isVenom ? 'rgba(105, 255, 80, 0.65)' : 'rgba(255, 195, 65, 0.65)';
        const armLen = Math.round(3 + pulse * 3);
        ctx.save();
        const stamp = this.getGlowStamp(glowCol, 8);
        if (stamp) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(stamp, gx - 8, gy - 8, 16, 16);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#0c0812';
        ctx.fillRect(gx - armLen - 1, gy - 1, armLen * 2 + 3, 3);
        ctx.fillRect(gx - 1, gy - armLen - 1, 3, armLen * 2 + 3);
        ctx.fillStyle = glintCol;
        ctx.fillRect(gx - armLen, gy, armLen * 2 + 1, 1);
        ctx.fillRect(gx, gy - armLen, 1, armLen * 2 + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
        ctx.restore();
      }
    }
  }

  /**
   * Renders the pulsing emerald warning column down the 7-3 Palace carpet during
   * the Krunked Throne's Mega-Beam telegraph ('tell') and blazing beam wash ('fire').
   */
  private renderThroneBeamTelegraph(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    alpha: number,
  ): void {
    for (let i = 0; i < state.enemies.length; i++) {
      const boss = state.enemies[i]!;
      if (boss.bossId !== 'nuclear_throne' || boss.hp <= 0) continue;
      if (boss.aiState !== 'tell' && boss.aiState !== 'fire') continue;

      const bx = lerp(boss.prevX, boss.x, alpha);
      const by = lerp(boss.prevY, boss.y, alpha);
      const halfW = 22;
      const startY = by + 20;
      const maxH = Math.min(340, Math.max(120, state.map.height * (state.map.tileSize || TILE_SIZE) - startY - 16));
      const pulse = 0.5 + 0.5 * Math.sin(this.renderTimeSec * 24);

      ctx.save();
      if (boss.aiState === 'tell') {
        // Pulsing emerald danger corridor across the 7-3 carpet
        ctx.fillStyle = `rgba(56, 255, 118, ${(0.12 + 0.14 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - halfW), Math.round(startY), halfW * 2, Math.round(maxH));

        // Inner center lane warning band
        ctx.fillStyle = `rgba(140, 255, 175, ${(0.10 + 0.12 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - 10), Math.round(startY), 20, Math.round(maxH));

        // Twin glowing boundary rails
        ctx.fillStyle = `rgba(92, 255, 145, ${(0.55 + 0.38 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - halfW), Math.round(startY), 2, Math.round(maxH));
        ctx.fillRect(Math.round(bx + halfW - 2), Math.round(startY), 2, Math.round(maxH));

        // Animated scrolling emerald danger chevrons marching down the carpet
        const scrollOffset = wrapMod(this.renderTimeSec * 120, 24);
        ctx.strokeStyle = `rgba(175, 255, 195, ${(0.45 + 0.35 * pulse).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let dy = scrollOffset; dy < maxH - 10; dy += 24) {
          const cy = startY + dy;
          ctx.moveTo(Math.round(bx - halfW + 5), Math.round(cy));
          ctx.lineTo(Math.round(bx), Math.round(cy + 8));
          ctx.lineTo(Math.round(bx + halfW - 5), Math.round(cy));
        }
        ctx.stroke();

        // Charging emerald emitter core stamp
        const chargeR = 26 + 10 * pulse;
        const chargeStamp = this.getGlowStamp('rgba(85, 255, 130, 0.85)', chargeR);
        if (chargeStamp) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(
            chargeStamp,
            Math.floor(bx - chargeR),
            Math.floor(startY - chargeR * 0.5),
            Math.ceil(chargeR * 2),
            Math.ceil(chargeR * 2),
          );
        }
      } else {
        // Firing phase: blazing emerald mega-beam carpet wash
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(72, 255, 125, ${(0.24 + 0.1 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - halfW), Math.round(startY), halfW * 2, Math.round(maxH));
        ctx.fillStyle = `rgba(215, 255, 225, ${(0.34 + 0.12 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - 10), Math.round(startY), 20, Math.round(maxH));

        const fireStamp = this.getGlowStamp('rgba(110, 255, 145, 0.9)', 36);
        if (fireStamp) {
          ctx.drawImage(fireStamp, Math.floor(bx - 36), Math.floor(startY - 24), 72, 72);
        }
      }
      ctx.restore();
    }
  }

  private renderProjectile(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    proj: ProjectileEntity,
    px: number,
    py: number,
    tick: number,
    pixelSnap: boolean,
    alpha: number,
  ): void {
    // Special crisp rendering for Melee Slash arcs
    if (proj.kind === 'melee_slash') {
      const lifeFrac = proj.maxLifeTicks > 0 ? proj.lifeTicks / proj.maxLifeTicks : 1;
      const reach = proj.meleeReach ?? 22;
      const arcRad = ((proj.meleeArcDeg ?? 110) * Math.PI) / 180;
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, lifeFrac);
      const drewSlash = this.sprites.draw(ctx, proj.sprite || 'sprSlash', px, py, {
        frame: Math.floor((1 - lifeFrac) * 3),
        rotation: proj.angle,
        scaleX: reach / 18,
        scaleY: reach / 18,
        pixelSnap,
      });
      if (!drewSlash) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, 4 * lifeFrac);
        ctx.beginPath();
        ctx.arc(
          Math.round(px - Math.cos(proj.angle) * (reach * 0.35)),
          Math.round(py - Math.sin(proj.angle) * (reach * 0.35)),
          reach * 0.75,
          proj.angle - arcRad * 0.5,
          proj.angle + arcRad * 0.5,
        );
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Lasers, Rad Beams & Lightning: glowing beam segment + cached tip glow stamp
    if (proj.kind === 'laser' || proj.kind === 'enemy_laser' || proj.kind === 'rad_beam' || proj.kind === 'lightning') {
      const tailLen = proj.kind === 'rad_beam' ? 24 : 30;
      const tx = px - Math.cos(proj.angle) * tailLen;
      const ty = py - Math.sin(proj.angle) * tailLen;
      const outerColor =
        proj.kind === 'rad_beam'
          ? '#47ff66'
          : proj.kind === 'lightning'
            ? '#70e2ff'
            : proj.team === 'enemy'
              ? '#ff40e6'
              : '#ff2b55';

      ctx.save();
      ctx.lineCap = 'round';
      if (proj.kind === 'lightning') {
        const perpX = -Math.sin(proj.angle);
        const perpY = Math.cos(proj.angle);
        const j1 = Math.sin(tick * 1.7 + proj.id * 3.1) * 3.5;
        const j2 = Math.cos(tick * 2.1 + proj.id * 1.9) * 3.5;
        const m1x = lerp(tx, px, 0.35) + perpX * j1;
        const m1y = lerp(ty, py, 0.35) + perpY * j1;
        const m2x = lerp(tx, px, 0.7) + perpX * j2;
        const m2y = lerp(ty, py, 0.7) + perpY * j2;
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(m1x, m1y);
        ctx.lineTo(m2x, m2y);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Crisp dark outer casing so lasers pop cleanly over bright Snow & Desert sand
        ctx.strokeStyle = 'rgba(14, 8, 20, 0.72)';
        ctx.lineWidth = proj.kind === 'rad_beam' ? 8 : 6;
        ctx.beginPath();
        ctx.moveTo(Math.round(tx), Math.round(ty));
        ctx.lineTo(Math.round(px), Math.round(py));
        ctx.stroke();
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = proj.kind === 'rad_beam' ? 6 : 4;
        ctx.beginPath();
        ctx.moveTo(Math.round(tx), Math.round(ty));
        ctx.lineTo(Math.round(px), Math.round(py));
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = proj.kind === 'rad_beam' ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(tx), Math.round(ty));
        ctx.lineTo(Math.round(px), Math.round(py));
        ctx.stroke();
      }

      const tipGlowColor =
        proj.kind === 'rad_beam'
          ? 'rgba(85, 255, 115, 0.65)'
          : proj.kind === 'lightning'
            ? 'rgba(115, 225, 255, 0.65)'
            : 'rgba(255, 55, 95, 0.6)';
      const tipStamp = this.getGlowStamp(tipGlowColor, 14);
      if (tipStamp) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(tipStamp, Math.floor(px - 14), Math.floor(py - 14), 28, 28);
      }
      ctx.restore();
      return;
    }

    // Sleek projectile motion trails & cached plasma halos (zero per-frame gradients!)
    const spd = Math.hypot(proj.vx, proj.vy);
    if (spd > 1.2) {
      const ageTicks = Math.max(0.35, proj.maxLifeTicks - proj.lifeTicks + alpha);
      const dirX = proj.vx / spd;
      const dirY = proj.vy / spd;

      let desiredLen = 0;
      let trailColor = '';
      let coreColor = '';
      let trailWidth = 1.5;
      let haloColor = '';
      let haloR = 0;

      switch (proj.kind) {
        case 'bullet':
        case 'heavy_bullet':
        case 'shell':
        case 'slug':
        case 'flak':
          desiredLen = Math.min(20, Math.max(7, spd * 1.05));
          trailColor = 'rgba(255, 214, 96, 0.52)';
          coreColor = 'rgba(255, 252, 225, 0.78)';
          trailWidth = proj.kind === 'heavy_bullet' || proj.kind === 'slug' ? 2.4 : 1.5;
          break;
        case 'bolt':
        case 'splinter':
        case 'toxic_bolt':
        case 'seeking_bolt':
          desiredLen = Math.min(26, Math.max(10, spd * 1.25));
          trailColor = proj.kind === 'toxic_bolt' ? 'rgba(90, 255, 110, 0.58)' : 'rgba(130, 255, 155, 0.56)';
          coreColor = 'rgba(235, 255, 238, 0.8)';
          trailWidth = 1.8;
          break;
        case 'idpd_bullet':
          desiredLen = Math.min(20, Math.max(8, spd * 1.1));
          trailColor = 'rgba(82, 185, 255, 0.6)';
          coreColor = 'rgba(220, 245, 255, 0.85)';
          trailWidth = 1.8;
          break;
        case 'plasma':
        case 'enemy_plasma':
        case 'boss_orb':
          desiredLen = Math.min(18, Math.max(7, spd * 1.4));
          trailColor = 'rgba(72, 255, 118, 0.48)';
          coreColor = 'rgba(215, 255, 222, 0.72)';
          trailWidth = Math.max(2.5, proj.radius * 0.65);
          haloColor = proj.kind === 'boss_orb' ? 'rgba(105, 255, 130, 0.46)' : 'rgba(75, 255, 120, 0.52)';
          haloR = Math.max(10, proj.radius * 2.4);
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          desiredLen = Math.min(16, Math.max(7, spd * 1.3));
          trailColor = 'rgba(255, 145, 48, 0.62)';
          coreColor = 'rgba(255, 238, 175, 0.82)';
          trailWidth = 2.4;
          haloColor = 'rgba(255, 140, 48, 0.4)';
          haloR = 12;
          break;
        case 'enemy_bullet':
        case 'enemy_flame': {
          // Match enemy projectile trail & cached radial glow halo to its ACTUAL visual type
          // (fixes Scorpion venom green orbs, Salamander fire, Crystal magenta, IDPD blue, etc.)
          const spr = proj.sprite || '';
          desiredLen = Math.min(14, Math.max(5, spd * 1.05));
          trailWidth = 1.8;
          if (spr === 'sprScorpionBullet') {
            trailColor = 'rgba(105, 255, 78, 0.58)';
            coreColor = 'rgba(232, 255, 200, 0.85)';
            haloColor = 'rgba(92, 255, 72, 0.42)';
            haloR = 10;
          } else if (spr === 'sprSalamanderBullet' || proj.kind === 'enemy_flame') {
            trailColor = 'rgba(255, 138, 36, 0.62)';
            coreColor = 'rgba(255, 245, 180, 0.86)';
            haloColor = 'rgba(255, 130, 35, 0.46)';
            haloR = 11;
          } else if (spr === 'sprEnemyBullet4') {
            trailColor = 'rgba(255, 72, 215, 0.58)';
            coreColor = 'rgba(255, 232, 255, 0.85)';
            haloColor = 'rgba(255, 75, 210, 0.46)';
            haloR = 11;
          } else if (spr === 'sprIDPDBullet' || spr === 'sprLHBouncer') {
            trailColor = 'rgba(72, 195, 255, 0.6)';
            coreColor = 'rgba(225, 248, 255, 0.86)';
            haloColor = 'rgba(72, 195, 255, 0.45)';
            haloR = 10;
          } else if (
            spr === 'sprGuardianBullet' ||
            spr === 'sprBigGuardianBullet' ||
            spr === 'sprExploGuardianBullet' ||
            spr === 'sprThrone2Bullet'
          ) {
            trailColor = 'rgba(82, 255, 128, 0.55)';
            coreColor = 'rgba(235, 255, 240, 0.85)';
            haloColor = 'rgba(82, 255, 130, 0.48)';
            haloR = Math.max(12, proj.radius * 2.3);
          } else {
            trailColor = 'rgba(255, 62, 72, 0.58)';
            coreColor = 'rgba(255, 235, 195, 0.85)';
            haloColor = 'rgba(255, 68, 62, 0.42)';
            haloR = 10;
          }
          break;
        }
        default:
          break;
      }

      if (haloColor && haloR > 0) {
        const haloStamp = this.getGlowStamp(haloColor, haloR);
        if (haloStamp) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(
            haloStamp,
            Math.floor(px - haloR),
            Math.floor(py - haloR),
            Math.ceil(haloR * 2),
            Math.ceil(haloR * 2),
          );
          ctx.restore();
        }
      }

      if (desiredLen > 0 && trailColor) {
        const len = Math.min(desiredLen, spd * ageTicks);
        const tailX = px - dirX * len;
        const tailY = py - dirY * len;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = trailWidth;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(px, py);
        ctx.stroke();
        if (coreColor) {
          ctx.strokeStyle = coreColor;
          ctx.lineWidth = Math.max(1, trailWidth * 0.42);
          ctx.beginPath();
          ctx.moveTo(lerp(tailX, px, 0.45), lerp(tailY, py, 0.45));
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    const drew = proj.sprite
      ? this.sprites.draw(ctx, proj.sprite, px, py, {
          frame: Math.floor(tick * 0.4),
          rotation: proj.angle,
          pixelSnap,
        })
      : false;

    if (!drew) {
      const x = Math.round(px);
      const y = Math.round(py);
      const r = Math.max(2, Math.round(proj.radius));
      // Crisp 1px dark outer contour so every projectile pops on bright & dark floors alike
      ctx.fillStyle = '#0c0712';
      ctx.beginPath();
      ctx.arc(x, y, r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle =
        proj.team === 'enemy'
          ? '#ff3847'
          : proj.kind === 'plasma'
            ? '#47ff66'
            : proj.kind === 'idpd_bullet'
              ? '#4aa3ff'
              : proj.kind === 'bolt' || proj.kind === 'seeking_bolt'
                ? '#78ff84'
                : '#ffcf4d';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  private renderSmokePuffs(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.smokePuffs.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const sp = this.smokePuffs[i]!;
      const t = 1 - Math.max(0, Math.min(1, sp.life / Math.max(1, sp.maxLife)));
      const r = sp.startR + (sp.endR - sp.startR) * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.52);
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(Math.round(sp.x), Math.round(sp.y), Math.max(1.5, r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Screen-space visceral juice:
   * - Low-HP crimson heartbeat vignette (double-beat lub-dub pulse, zero gradients!)
   * - Crisp damage impact border flash
   * - Brief explosion blast bloom & portal warp edge pull
   */
  private renderScreenEffects(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    w: number,
    h: number,
  ): void {
    const player = state.player;

    // 1. Low-HP crimson heartbeat vignette pulse
    const lowHp =
      player.alive &&
      player.hp > 0 &&
      (player.hp <= 2 || player.hp / Math.max(1, player.maxHp) <= 0.28);
    if (lowHp) {
      // Double-beat "lub-dub" cardiac waveform (~1.35 Hz)
      const cycle = wrapMod(this.renderTimeSec * 1.35, 1);
      const beat1 = Math.exp(-Math.pow((cycle - 0.12) * 11, 2));
      const beat2 = 0.72 * Math.exp(-Math.pow((cycle - 0.28) * 12, 2));
      const pulse = 0.28 + 0.72 * Math.max(beat1, beat2);
      const severity = player.hp <= 1 ? 1.0 : 0.72;
      const edgeAlpha = 0.26 * pulse * severity;

      ctx.save();
      // Layered translucent crimson perimeter strips (zero per-frame gradients!)
      const layers = [
        { thick: 12, a: edgeAlpha * 0.35 },
        { thick: 6, a: edgeAlpha * 0.55 },
        { thick: 2, a: edgeAlpha * 0.95 },
      ];
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i]!;
        ctx.fillStyle = `rgba(215, 20, 38, ${l.a.toFixed(3)})`;
        ctx.fillRect(0, 0, w, l.thick);
        ctx.fillRect(0, h - l.thick, w, l.thick);
        ctx.fillRect(0, l.thick, l.thick, h - l.thick * 2);
        ctx.fillRect(w - l.thick, l.thick, l.thick, h - l.thick * 2);
      }
      // Subtle crimson corner glow stamps
      const cornerStamp = this.getGlowStamp('rgba(220, 24, 42, 0.45)', 48);
      if (cornerStamp) {
        ctx.globalAlpha = pulse * severity * 0.6;
        ctx.drawImage(cornerStamp, -36, -36, 96, 96);
        ctx.drawImage(cornerStamp, w - 60, -36, 96, 96);
        ctx.drawImage(cornerStamp, -36, h - 60, 96, 96);
        ctx.drawImage(cornerStamp, w - 60, h - 60, 96, 96);
      }
      ctx.restore();
    }

    // 2. Crisp 2-frame player damage border flash
    if (this.screenHurtFlashTicks > 0) {
      const frac = Math.min(1, this.screenHurtFlashTicks / 3.2);
      ctx.save();
      ctx.fillStyle =
        frac > 0.65
          ? `rgba(255, 225, 225, ${(0.34 * frac).toFixed(3)})`
          : `rgba(255, 36, 52, ${(0.42 * frac).toFixed(3)})`;
      const t = 4;
      ctx.fillRect(0, 0, w, t);
      ctx.fillRect(0, h - t, w, t);
      ctx.fillRect(0, t, t, h - t * 2);
      ctx.fillRect(w - t, t, t, h - t * 2);
      ctx.restore();
    }

    // 3. Subtle blast flash sheen on huge explosions
    if (this.screenBlastFlashTicks > 0) {
      const frac = Math.min(1, this.screenBlastFlashTicks / 3);
      ctx.save();
      ctx.fillStyle = `rgba(255, 232, 175, ${(0.1 * frac).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 4. Portal suction warp pull vignette during portal transition
    if (state.portal.active && state.portal.entered) {
      const warp = Math.min(1, (state.portal.enterTicks || 1) / 24);
      const border = Math.round(6 + warp * 18);
      ctx.save();
      ctx.fillStyle = `rgba(110, 32, 185, ${(0.22 + warp * 0.38).toFixed(3)})`;
      ctx.fillRect(0, 0, w, border);
      ctx.fillRect(0, h - border, w, border);
      ctx.fillRect(0, border, border, h - border * 2);
      ctx.fillRect(w - border, border, border, h - border * 2);
      ctx.restore();
    }
  }

  private renderMuzzleFlashes(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.muzzleFlashes.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      const mf = this.muzzleFlashes[i]!;
      const frac = Math.max(0, Math.min(1, mf.life / Math.max(0.1, mf.maxLife)));
      const r = mf.radius * (0.45 + 0.55 * frac);
      const stamp = this.getGlowStamp(mf.color, r);
      if (stamp) {
        ctx.globalAlpha = frac;
        ctx.drawImage(
          stamp,
          Math.floor(mf.x - r),
          Math.floor(mf.y - r),
          Math.ceil(r * 2),
          Math.ceil(r * 2),
        );
      }

      // Crisp directional bright muzzle star core
      ctx.globalAlpha = Math.min(1, frac * 1.2);
      ctx.fillStyle = mf.coreColor;
      const tipX = mf.x + Math.cos(mf.angle) * (4 * frac);
      const tipY = mf.y + Math.sin(mf.angle) * (4 * frac);
      const coreR = Math.max(1.5, 3.5 * frac);
      ctx.beginPath();
      ctx.arc(Math.round(tipX), Math.round(tipY), coreR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderShockwaves(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.shockwaves.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i]!;
      const t = 1 - Math.max(0, Math.min(1, sw.life / Math.max(0.1, sw.maxLife)));
      const ease = 1 - (1 - t) * (1 - t);
      const r = sw.startR + (sw.endR - sw.startR) * ease;
      const alpha = Math.max(0, (1 - t) * 0.85);

      // Initial bright blast glow stamp during first 35% of expansion
      if (t < 0.35) {
        const flashR = sw.endR * 0.65;
        const stamp = this.getGlowStamp(sw.glowColor, flashR);
        if (stamp) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - t / 0.35) * 0.75;
          ctx.drawImage(
            stamp,
            Math.floor(sw.x - flashR),
            Math.floor(sw.y - flashR),
            Math.ceil(flashR * 2),
            Math.ceil(flashR * 2),
          );
          ctx.restore();
        }
      }

      // Expanding colored shockwave ring
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = Math.max(1, 2.6 * (1 - t));
      ctx.beginPath();
      ctx.arc(Math.round(sw.x), Math.round(sw.y), Math.max(2, r), 0, Math.PI * 2);
      ctx.stroke();

      // Inner white heat-wave shimmer ring
      if (r > 6) {
        ctx.globalAlpha = alpha * 0.65;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(Math.round(sw.x), Math.round(sw.y), Math.max(2, r * 0.86), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Subtle deterministic screen-space biome ambient particles with zero per-frame allocations:
   * desert dust motes, sewer drips, cave sparkles, frozen snowflakes, lab sparks, palace rad embers.
   */
  private renderBiomeAmbientParticles(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    biome: BiomeId,
    viewLeft: number,
    viewTop: number,
    w: number,
    h: number,
  ): void {
    const t = this.renderTimeSec;
    ctx.save();

    switch (biome) {
      case 'desert':
      case 'oasis': {
        // Warm drifting desert dust motes
        ctx.fillStyle = biome === 'oasis' ? 'rgba(170, 245, 225, 0.28)' : 'rgba(248, 215, 148, 0.28)';
        for (let i = 0; i < 20; i++) {
          const speedX = 14 + (i % 5) * 4;
          const speedY = 3 + (i % 3) * 1.5;
          const sx = wrapMod(i * 53 + t * speedX - viewLeft * 0.35, w);
          const sy = wrapMod(i * 31 + t * speedY + Math.sin(t * 1.4 + i) * 6 - viewTop * 0.35, h);
          const sz = i % 4 === 0 ? 2 : 1;
          ctx.fillRect(Math.floor(sx), Math.floor(sy), sz, 1);
        }
        break;
      }

      case 'sewers':
      case 'pizza_sewers': {
        // Falling sewer drips
        ctx.fillStyle = 'rgba(118, 224, 152, 0.30)';
        for (let i = 0; i < 16; i++) {
          const cycle = wrapMod(t * (0.9 + (i % 4) * 0.22) + i * 0.37, 1.8);
          if (cycle > 1.0) continue;
          const sx = wrapMod(i * 67 + 19 - viewLeft * 0.45, w);
          const sy = wrapMod(i * 41 + cycle * 95 - viewTop * 0.45, h);
          ctx.fillRect(Math.floor(sx), Math.floor(sy), 1, 3);
        }
        break;
      }

      case 'caves':
      case 'cursed_caves': {
        // Twinkling crystal cave sparkles
        const baseColor = biome === 'cursed_caves' ? '235, 120, 220' : '212, 150, 255';
        for (let i = 0; i < 20; i++) {
          const twinkle = Math.sin(t * (2.6 + (i % 4) * 0.8) + i * 1.7);
          if (twinkle <= 0.25) continue;
          const sx = wrapMod(i * 71 + 11 - viewLeft * 0.5, w);
          const sy = wrapMod(i * 43 + 7 - viewTop * 0.5, h);
          ctx.fillStyle = `rgba(${baseColor}, ${((twinkle - 0.25) * 0.72).toFixed(3)})`;
          const ix = Math.floor(sx);
          const iy = Math.floor(sy);
          ctx.fillRect(ix, iy, 1, 1);
          if (twinkle > 0.72) {
            ctx.fillRect(ix - 1, iy, 3, 1);
            ctx.fillRect(ix, iy - 1, 1, 3);
          }
        }
        break;
      }

      case 'frozen_city': {
        // Gently drifting frozen snowflakes
        ctx.fillStyle = 'rgba(235, 248, 255, 0.46)';
        for (let i = 0; i < 26; i++) {
          const fallSpd = 14 + (i % 5) * 5;
          const driftX = -8 - (i % 3) * 3;
          const sx = wrapMod(i * 47 + t * driftX + Math.sin(t * 2.0 + i) * 7 - viewLeft * 0.3, w);
          const sy = wrapMod(i * 29 + t * fallSpd - viewTop * 0.3, h);
          const sz = i % 5 === 0 ? 2 : 1;
          ctx.fillRect(Math.floor(sx), Math.floor(sy), sz, sz);
        }
        break;
      }

      case 'labs': {
        // Intermittent crackling lab electrical sparks
        for (let i = 0; i < 16; i++) {
          const phase = wrapMod(t * (1.8 + (i % 3) * 0.6) + i * 0.73, 2.2);
          if (phase > 0.45) continue;
          const norm = phase / 0.45;
          const sx = wrapMod(i * 79 + 23 + (i % 2 === 0 ? 1 : -1) * norm * 10 - viewLeft * 0.45, w);
          const sy = wrapMod(i * 53 + 17 + norm * norm * 16 - viewTop * 0.45, h);
          ctx.fillStyle =
            i % 3 === 0
              ? `rgba(110, 240, 255, ${(0.75 * (1 - norm)).toFixed(3)})`
              : `rgba(255, 224, 96, ${(0.72 * (1 - norm)).toFixed(3)})`;
          ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, 1);
        }
        break;
      }

      case 'palace':
      case 'vault': {
        // Slowly rising glowing palace rad embers
        for (let i = 0; i < 22; i++) {
          const riseSpd = 9 + (i % 4) * 3.5;
          const sx = wrapMod(i * 59 + Math.sin(t * 1.6 + i * 1.3) * 8 - viewLeft * 0.35, w);
          const sy = wrapMod(i * 37 - t * riseSpd - viewTop * 0.35, h);
          const pulse = 0.45 + 0.55 * Math.sin(t * 4.0 + i);
          ctx.fillStyle =
            i % 4 === 0
              ? `rgba(255, 218, 92, ${(0.36 * pulse).toFixed(3)})`
              : `rgba(88, 255, 132, ${(0.42 * pulse).toFixed(3)})`;
          ctx.fillRect(Math.floor(sx), Math.floor(sy), i % 3 === 0 ? 2 : 1, 1);
        }
        break;
      }

      default: {
        // Scrapyard / Campfire / Mansion / Jungle / HQ subtle drifting embers/flecks
        ctx.fillStyle =
          biome === 'jungle'
            ? 'rgba(150, 255, 120, 0.34)'
            : biome === 'hq'
              ? 'rgba(110, 190, 255, 0.28)'
              : 'rgba(255, 178, 92, 0.30)';
        for (let i = 0; i < 16; i++) {
          const sx = wrapMod(i * 61 + t * (8 + (i % 4) * 3) - viewLeft * 0.35, w);
          const sy = wrapMod(i * 43 - t * (6 + (i % 3) * 2) - viewTop * 0.35, h);
          ctx.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
        }
        break;
      }
    }

    ctx.restore();
  }

  private renderParticles(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    pixelSnap: boolean,
  ): void {
    // Sim-owned particles
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i]!;
      const lifeFrac = p.maxLifeTicks > 0 ? Math.max(0, p.lifeTicks / p.maxLifeTicks) : 1;
      const alpha = Math.max(0, Math.min(1, p.alpha * lifeFrac));
      if (p.sprite && this.sprites.hasSprite(p.sprite)) {
        const sp = this.sprites.getSprite(p.sprite)!;
        const frame = Math.floor((1 - lifeFrac) * sp.frames.length);
        this.sprites.draw(ctx, p.sprite, p.x, p.y, { frame, alpha, pixelSnap });
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color || '#ffffff';
        const s = Math.max(1, Math.round(p.size * (0.5 + 0.5 * lifeFrac)));
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        ctx.restore();
      }
    }

    // Event-spawned transient particles
    for (let i = 0; i < this.transientParticles.length; i++) {
      const p = this.transientParticles[i]!;
      const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 1;
      if (p.sprite && this.sprites.hasSprite(p.sprite)) {
        const sp = this.sprites.getSprite(p.sprite)!;
        const frame = Math.floor((1 - lifeFrac) * sp.frames.length);
        this.sprites.draw(ctx, p.sprite, p.x, p.y, { frame, alpha: lifeFrac, pixelSnap });
      } else {
        ctx.save();
        ctx.globalAlpha = lifeFrac;
        ctx.fillStyle = p.color || '#ffffff';
        const s = Math.max(1, Math.round(p.size));
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        ctx.restore();
      }
    }
  }

  private renderFloatingTexts(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i]!;
      const alpha = Math.min(1, (ft.life / Math.max(1, ft.maxLife)) * 1.4);
      this.fonts.draw(ctx, ft.text, ft.x, ft.y, ft.font, {
        align: 'center',
        baseline: 'bottom',
        color: ft.color,
        outline: true,
        alpha,
      });
    }
  }

  private renderNearbyWeaponPrompt(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    playerX: number,
    playerY: number,
    inputMode: RenderInputDeviceMode = 'kbm',
  ): void {
    if (!state.player.alive) return;
    let nearest: PickupEntity | null = null;
    let bestDistSq = 28 * 28;
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind !== 'weapon' || !pk.weaponId) continue;
      const dx = pk.x - playerX;
      const dy = pk.y - playerY;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        nearest = pk;
      }
    }
    if (!nearest || !nearest.weaponId) return;
    const label = resolveWeaponLabel(nearest.weaponId, this.data);
    const promptPrefix =
      inputMode === 'gamepad'
        ? '@b[X]@w '
        : inputMode === 'touch'
          ? '@yUSE@w '
          : '@y[E]@w ';
    const fullText = `${promptPrefix}${label}`;
    const measured = this.fonts.measure(fullText, 'fntSmall');
    const pillW = measured.width + 6;
    const pillH = 9;
    // Positioned neatly BELOW the dropped weapon so it never stacks over player head / floating callouts
    const px = Math.round(nearest.x - pillW * 0.5);
    const py = Math.round(nearest.y + 8);
    ctx.save();
    ctx.fillStyle = 'rgba(10, 8, 16, 0.76)';
    ctx.fillRect(px, py, pillW, pillH);
    ctx.strokeStyle = nearest.cursed ? 'rgba(201, 74, 255, 0.7)' : 'rgba(180, 172, 200, 0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pillW - 1, pillH - 1);
    ctx.restore();
    this.fonts.draw(ctx, fullText, nearest.x, py + 2, 'fntSmall', {
      align: 'center',
      baseline: 'top',
      outline: false,
      shadow: true,
    });
  }

  renderCrosshair(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    crosshairStyle: number,
  ): void {
    const sx = Math.round(screenX);
    const sy = Math.round(screenY);
    const recoilScale = this.crosshairRecoil > 0.15 ? 1 + this.crosshairRecoil * 0.08 : 1;
    const drew = this.sprites.draw(ctx, 'sprCrosshair', sx, sy, {
      frame: Math.max(0, Math.floor(crosshairStyle)),
      scaleX: recoilScale,
      scaleY: recoilScale,
      pixelSnap: true,
    });
    if (!drew) {
      const gap = Math.round(2 + this.crosshairRecoil * 0.6);
      ctx.fillStyle = '#08060c';
      ctx.fillRect(sx - 4 - gap, sy - 1, 5, 3);
      ctx.fillRect(sx + gap, sy - 1, 5, 3);
      ctx.fillRect(sx - 1, sy - 4 - gap, 3, 5);
      ctx.fillRect(sx - 1, sy + gap, 3, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - 3 - gap, sy, 3, 1);
      ctx.fillRect(sx + 1 + gap, sy, 3, 1);
      ctx.fillRect(sx, sy - 3 - gap, 1, 3);
      ctx.fillRect(sx, sy + 1 + gap, 1, 3);
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Crisp diagonal hit-confirm ticks around crosshair when shots land!
    if (this.crosshairHitTicks > 0) {
      const frac = Math.min(1, this.crosshairHitTicks / 4.5);
      const dist = Math.round(4 + (1 - frac) * 2.5);
      const col = this.crosshairHitCrit ? '#ffe047' : '#ffffff';
      ctx.save();
      ctx.globalAlpha = Math.min(1, frac * 1.3);
      ctx.strokeStyle = '#0c0812';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.moveTo(sx + dx * dist, sy + dy * dist);
        ctx.lineTo(sx + dx * (dist + 3), sy + dy * (dist + 3));
      }
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}
