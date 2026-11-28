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
  type GamepadFamily,
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
import { getGamepadGlyphs } from '@/input';
import {
  BIOME_FALLBACK_PALETTES,
  BIOME_SPRITE_NUMBER,
  DEFAULT_UI_DATA_PROVIDER,
  resolveEnemySpritePrefix,
  resolveWeaponLabel,
  resolveWeaponSpriteName,
  selectLoadingTip,
  type UiDataProvider,
} from '@/ui/data-provider';
import { BitmapFontRenderer } from './bitmap-font';
import { CameraController } from './camera';
import { FloorBuffer, fillBiomeRoofRect, getBiomeRoofColor } from './floor-buffer';
import {
  SHARED_GLOW_CACHE,
  fillPixelDisc,
  fillPixelOval,
  type GlowCanvas,
  type GlowStampCache,
} from './glow-cache';
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
  isExplosion?: boolean;
}

interface ImpactStar {
  x: number;
  y: number;
  radius: number;
  angle: number;
  color: string;
  life: number;
  maxLife: number;
}

interface DashGhost {
  x: number;
  y: number;
  sprite: string;
  frame: number;
  flipX: boolean;
  tint: string;
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

/**
 * Teleport-safe 2D interpolation: prevents 1-frame streak artifacts when an entity
 * teleports (e.g., Crystal Throne Butt, Guardian blink, area warp, or portal snap).
 */
export function lerpPosSafe(
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  t: number,
  maxJump: number = 56,
): { x: number; y: number } {
  if (Math.hypot(x - prevX, y - prevY) > maxJump) {
    return { x, y };
  }
  return {
    x: prevX + (x - prevX) * t,
    y: prevY + (y - prevY) * t,
  };
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
 * Classifies every non-walkable tile in the map into:
 *   0 = outer map background void (connected to map border, away from floor)
 *   1 = perimeter wall adjacent to walkable floor (8-neighborhood)
 *   2 = enclosed interior wall island or thin wall mass between rooms (gets solid wall-top fill!)
 */
function buildWallRenderMask(map: WorldMap): Uint8Array {
  const w = map.width;
  const h = map.height;
  const total = w * h;
  const mask = new Uint8Array(total);
  const outer = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  // Pass 1: mark perimeter walls adjacent to floor FIRST so outer-void BFS cannot leak through
  // perimeter wall bridges into enclosed 1x2 pockets inside connected sewer/cave islands!
  for (let ty = 0; ty < h; ty++) {
    const row = ty * w;
    for (let tx = 0; tx < w; tx++) {
      const idx = row + tx;
      if (isWalkable(map.tiles[idx]!)) continue;
      if (hasNearbyFloor(map, tx, ty)) {
        mask[idx] = 1;
      }
    }
  }

  // Seed border non-walkable, non-perimeter tiles for outer-void BFS
  for (let tx = 0; tx < w; tx++) {
    const topIdx = tx;
    if (!isWalkable(map.tiles[topIdx]!) && mask[topIdx] === 0) {
      outer[topIdx] = 1;
      queue[tail++] = topIdx;
    }
    const botIdx = (h - 1) * w + tx;
    if (h > 1 && !isWalkable(map.tiles[botIdx]!) && mask[botIdx] === 0) {
      outer[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }
  for (let ty = 1; ty < h - 1; ty++) {
    const leftIdx = ty * w;
    if (!isWalkable(map.tiles[leftIdx]!) && mask[leftIdx] === 0) {
      outer[leftIdx] = 1;
      queue[tail++] = leftIdx;
    }
    const rightIdx = ty * w + (w - 1);
    if (w > 1 && !isWalkable(map.tiles[rightIdx]!) && mask[rightIdx] === 0) {
      outer[rightIdx] = 1;
      queue[tail++] = rightIdx;
    }
  }

  // Flood-fill outer background strictly through non-perimeter non-walkable tiles (mask === 0)
  while (head < tail) {
    const idx = queue[head++]!;
    const cx = idx % w;
    const cy = (idx - cx) / w;
    if (cx > 0) {
      const n = idx - 1;
      if (!outer[n] && !isWalkable(map.tiles[n]!) && mask[n] === 0) {
        outer[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cx + 1 < w) {
      const n = idx + 1;
      if (!outer[n] && !isWalkable(map.tiles[n]!) && mask[n] === 0) {
        outer[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy > 0) {
      const n = idx - w;
      if (!outer[n] && !isWalkable(map.tiles[n]!) && mask[n] === 0) {
        outer[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy + 1 < h) {
      const n = idx + w;
      if (!outer[n] && !isWalkable(map.tiles[n]!) && mask[n] === 0) {
        outer[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // Pass 2: mark enclosed interior wall islands & thin dividing walls between rooms as solid fill (2)
  const hasFloorAt = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && isWalkable(map.tiles[y * w + x]!);

  for (let ty = 1; ty < h - 1; ty++) {
    const row = ty * w;
    for (let tx = 1; tx < w - 1; tx++) {
      const idx = row + tx;
      if (isWalkable(map.tiles[idx]!) || mask[idx] === 1) continue;
      if (!outer[idx]) {
        // Completely enclosed inside a wall island -> NEVER punch a black void hole!
        mask[idx] = 2;
        continue;
      }
      // Also fill thin 3-tile dividing walls & peninsulas separating two walkable areas
      const floorWest = hasFloorAt(tx - 2, ty) || hasFloorAt(tx - 2, ty - 1) || hasFloorAt(tx - 2, ty + 1);
      const floorEast = hasFloorAt(tx + 2, ty) || hasFloorAt(tx + 2, ty - 1) || hasFloorAt(tx + 2, ty + 1);
      const floorNorth = hasFloorAt(tx, ty - 2) || hasFloorAt(tx - 1, ty - 2) || hasFloorAt(tx + 1, ty - 2);
      const floorSouth = hasFloorAt(tx, ty + 2) || hasFloorAt(tx - 1, ty + 2) || hasFloorAt(tx + 1, ty + 2);
      if ((floorWest && floorEast) || (floorNorth && floorSouth)) {
        mask[idx] = 2;
        continue;
      }
      let perimNeighbors = 0;
      if (mask[idx - 1] === 1) perimNeighbors += 1;
      if (mask[idx + 1] === 1) perimNeighbors += 1;
      if (mask[idx - w] === 1) perimNeighbors += 1;
      if (mask[idx + w] === 1) perimNeighbors += 1;
      if (perimNeighbors >= 3) {
        mask[idx] = 2;
      }
    }
  }

  return mask;
}

/**
 * Crisp integer-pixel circle outline (midpoint algorithm) — replaces smooth anti-aliased ctx.arc rings.
 */
function drawPixelRing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  thick: number = 1,
  dashedPeriod: number = 0,
  dashPhase: number = 0,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const r = Math.max(1, Math.round(radius));
  const s = thick >= 2 ? 2 : 1;
  let x = r;
  let y = 0;
  let err = 1 - r;
  let step = 0;
  while (x >= y) {
    if (dashedPeriod <= 0 || ((step + dashPhase) % dashedPeriod) < Math.ceil(dashedPeriod * 0.55)) {
      ctx.fillRect(icx + x, icy + y, s, s);
      ctx.fillRect(icx + y, icy + x, s, s);
      ctx.fillRect(icx - y, icy + x, s, s);
      ctx.fillRect(icx - x, icy + y, s, s);
      ctx.fillRect(icx - x, icy - y, s, s);
      ctx.fillRect(icx - y, icy - x, s, s);
      ctx.fillRect(icx + y, icy - x, s, s);
      ctx.fillRect(icx + x, icy - y, s, s);
    }
    step += 1;
    y += 1;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x -= 1;
      err += 2 * (y - x + 1);
    }
  }
}

/**
 * Crisp integer-pixel filled disc (scanline spans) for pixel-art smoke puffs and blast cores.
 */
function drawPixelDisc(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const r = Math.max(1, Math.round(radius));
  for (let dy = -r; dy <= r; dy++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
    ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
  }
}

/**
 * Draws a crisp pixel-stepped straight line (Bresenham) with optional pixel width.
 */
function drawPixelLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number = 1,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  const isize = Math.max(1, Math.round(size));
  const half = isize > 1 ? Math.floor(isize / 2) : 0;
  let guard = 0;
  while (guard++ < 1024) {
    ctx.fillRect(ix0 - half, iy0 - half, isize, isize);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
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
  private wallRenderMask: Uint8Array | null = null;
  private floatingTexts: FloatingText[] = [];
  private transientParticles: TransientParticle[] = [];
  private smokePuffs: SmokePuff[] = [];
  private flashLights: TransientFlashLight[] = [];
  private extraLightScratch: DynamicLight[] = [];
  private enemyFx = new Map<number, EnemyFxState>();
  private muzzleFlashes: MuzzleFlash[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private impactStars: ImpactStar[] = [];
  private dashGhosts: DashGhost[] = [];
  private lastDashGhostTick = -10;
  private lastShotsFired = 0;
  private lastSlotFiredTick: [number, number] = [-1, -1];
  private lastHurtFlashTicks = 0;
  private screenHurtFlashTicks = 0;
  private screenBlastFlashTicks = 0;
  private crosshairHitTicks = 0;
  private crosshairHitCrit = false;
  private crosshairRecoil = 0;
  private lastEmptyTextSec = -10;
  private lastSkidTick = -1;
  private lastBeamScorchTick = -10;
  private lowAmmoWarnedPools = new Set<AmmoType>();
  private fxSeq = 1;
  private meleeSwingSide: 1 | -1 = 1;
  private meleeSwingSides: [1 | -1, 1 | -1] = [1, -1];
  private meleeSwingAnim = 0;
  private meleeSwingAnims: [number, number] = [0, 0];
  private wasShielding = false;
  private shieldDisappearTicks = 0;
  private logicalWidth = LOGICAL_WIDTH_4_3;
  private logicalHeight = LOGICAL_HEIGHT;
  private readonly renderScale = 1;
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

  getRenderScale(): number {
    return this.renderScale;
  }

  /**
   * Configures native 1x backing canvas pixel dimensions (320x240 or 426x240)
   * and fits its CSS presentation crisply with nearest-neighbor scaling without scrollbars.
   */
  applyCanvasSize(canvas: HTMLCanvasElement, settings: RenderSettings): void {
    const targetW = settings.widescreen ? LOGICAL_WIDTH_16_9 : LOGICAL_WIDTH_4_3;
    const targetH = LOGICAL_HEIGHT;
    this.logicalWidth = targetW;
    this.logicalHeight = targetH;

    const backingW = targetW * this.renderScale;
    const backingH = targetH * this.renderScale;
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    if (canvas.style) {
      canvas.style.imageRendering = 'pixelated';
    }

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
      const cssW = Math.max(1, Math.floor(targetW * finalScale));
      const cssH = Math.max(1, Math.floor(targetH * finalScale));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
  }

  /**
   * Resets transient level-scoped FX and snaps camera cleanly on area change / warp / restart.
   */
  private resetLevelFx(state?: SimState): void {
    this.floatingTexts = [];
    this.transientParticles = [];
    this.smokePuffs = [];
    this.flashLights = [];
    this.enemyFx.clear();
    this.muzzleFlashes = [];
    this.shockwaves = [];
    this.impactStars = [];
    this.dashGhosts = [];
    this.lastDashGhostTick = -10;
    this.lowAmmoWarnedPools.clear();
    this.screenHurtFlashTicks = 0;
    this.screenBlastFlashTicks = 0;
    this.crosshairHitTicks = 0;
    this.crosshairRecoil = 0;
    this.meleeSwingAnim = 0;
    this.meleeSwingAnims = [0, 0];
    this.lastSlotFiredTick = [-1, -1];
    this.wasShielding = false;
    this.shieldDisappearTicks = 0;
    this.lastSkidTick = -1;
    this.lastBeamScorchTick = -10;
    this.wallRenderMask = null;
    this.camera.clearFocusBias();
    if (state) {
      this.lastShotsFired = state.stats.shotsFired;
      this.lastHurtFlashTicks = state.player.hurtFlashTicks;
      this.camera.snapTo(state.player.x, state.player.y);
    }
  }

  /**
   * Forces a complete rebuild of the persistent floor buffer on next render.
   */
  invalidateFloor(): void {
    this.lastMapRef = null;
    this.wallRenderMask = null;
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
    // Collapse identical rapid callouts nearby (e.g., repeated LOW AMMO / EMPTY! / pickup labels)
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const existing = this.floatingTexts[i]!;
      if (existing.text === text && Math.abs(existing.x - x) < 36 && Math.abs(existing.y - y) < 28) {
        existing.life = Math.max(existing.life, life);
        existing.maxLife = Math.max(existing.maxLife, life);
        existing.x = x;
        existing.y = Math.min(existing.y, y);
        return;
      }
    }

    // Measure approximate horizontal footprint so labels never collide horizontally OR vertically
    const charW = font === 'fntM1' ? 6 : 4.5;
    const halfW = Math.max(12, text.length * charW * 0.5);
    let spawnX = x;
    let spawnY = y;
    let stackAttempts = 0;
    let shifted = true;
    while (shifted && stackAttempts < 8) {
      shifted = false;
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const other = this.floatingTexts[i]!;
        const otherHalfW = Math.max(12, other.text.length * (other.font === 'fntM1' ? 6 : 4.5) * 0.5);
        const minHorizGap = halfW + otherHalfW + 4;
        if (Math.abs(other.x - spawnX) < minHorizGap && Math.abs(other.y - spawnY) < 10) {
          spawnY = Math.min(spawnY, other.y - 10);
          if (stackAttempts >= 4) {
            spawnX += (stackAttempts % 2 === 0 ? 1 : -1) * 16;
          }
          shifted = true;
        }
      }
      stackAttempts += 1;
    }

    this.floatingTexts.push({
      x: spawnX,
      y: spawnY,
      vy,
      text,
      color,
      life,
      maxLife: life,
      font,
    });
    if (this.floatingTexts.length > 20) {
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

  private spawnImpactStar(x: number, y: number, radius: number, color: string): void {
    if (this.impactStars.length > 24) this.impactStars.shift();
    this.impactStars.push({
      x,
      y,
      radius,
      angle: this.nextFxHash() * Math.PI * 2,
      color,
      life: 3.4,
      maxLife: 3.4,
    });
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
          // Corpses remain live-rendered from state.corpses so Melting explosions and
          // Necromancer revives never leave permanent ghost corpses baked onto the floor!
          if (ev.decal.kind !== 'corpse') {
            this.floorBuffer.bakeDecal(ev.decal);
          }
          break;

        case 'shake':
          this.camera.addShake(ev.trauma, ev.dirX, ev.dirY, ev.kick);
          break;

        case 'damage_number': {
          // Suppress absurd overkill / debug clearEnemies() numbers (> 999)
          const roundedAmt = Math.round(ev.amount);
          if (!ev.heal && (roundedAmt <= 0 || roundedAmt > 999)) {
            break;
          }
          this.pushFloatingText(
            ev.x,
            ev.y - 6,
            ev.heal ? `+${roundedAmt}` : `${roundedAmt}`,
            ev.heal ? '#52e864' : ev.crit ? '#ffe047' : '#ffffff',
            ev.crit ? 24 : 18,
            ev.crit ? 'fntM1' : 'fntSmall',
            ev.crit ? -0.62 : -0.5,
          );
          if (!ev.heal) {
            this.crosshairHitTicks = Math.max(this.crosshairHitTicks, ev.crit ? 5.5 : 3.5);
            if (ev.crit) this.crosshairHitCrit = true;
            this.spawnSparkBurst(
              ev.x,
              ev.y + 2,
              ev.crit ? 6 : 3,
              ev.crit ? '#ffe866' : '#fff5e0',
              1.4,
              3.4,
              6,
            );
            this.spawnImpactStar(ev.x, ev.y + 2, ev.crit ? 9 : 6, ev.crit ? '#ffe866' : '#ffffff');
          }
          break;
        }

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
          const label = ev.isUltra ? 'ULTRA MUTATION!' : 'LEVEL UP!';
          const col = ev.isUltra ? '#ffe047' : '#6bff7c';
          // Collapse rapid multi-level rad bursts into ONE clean callout instead of 7 stacked lines
          const existingLevel = this.floatingTexts.find(
            (ft) => ft.text === 'LEVEL UP!' || ft.text === 'ULTRA MUTATION!',
          );
          if (existingLevel) {
            existingLevel.x = px;
            existingLevel.y = py - 16;
            existingLevel.life = 36;
            existingLevel.maxLife = 36;
            if (ev.isUltra) {
              existingLevel.text = 'ULTRA MUTATION!';
              existingLevel.color = '#ffe047';
            }
          } else {
            this.pushFloatingText(px, py - 16, label, col, 36, 'fntM1', -0.45);
          }
          this.shockwaves.push({
            x: px,
            y: py,
            startR: 4,
            endR: ev.isUltra ? 42 : 30,
            color: ev.isUltra ? '#ffe047' : '#5eff78',
            glowColor: ev.isUltra ? 'rgba(255, 224, 71, 0.9)' : 'rgba(90, 255, 130, 0.9)',
            life: 13,
            maxLife: 13,
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
          this.spawnSparkBurst(ev.x, ev.y, ev.killed ? 7 : 3, sparkCol, 1.8, 4.2, ev.killed ? 8 : 5);
          this.spawnImpactStar(ev.x, ev.y, ev.killed ? 11 : ev.crit ? 9 : 6.5, sparkCol);
          if (ev.killed) {
            this.spawnSparkBurst(ev.x, ev.y, 5, '#d61e2e', 1.2, 3.6, 10);
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
              isExplosion: true,
            });
            const smokeTint =
              lowerCol === '#cc2222'
                ? '#3d2228'
                : lowerCol === '#55ff66'
                  ? '#2c3d30'
                  : lowerCol === '#4ca6ff'
                    ? '#293242'
                    : '#3a363c';
            this.spawnSmokeBurst(ev.x, ev.y, 6, Math.min(36, baseRadius * 0.85), smokeTint);
            this.spawnFlashLight(ev.x, ev.y, Math.min(68, baseRadius * 1.25), 'rgba(255, 200, 120, 0.18)', 6);
            this.screenBlastFlashTicks = Math.max(this.screenBlastFlashTicks, baseRadius >= 46 ? 2.5 : 1.4);
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
              radius: Math.max(8, Math.min(13, (ev.size ?? 5) * 1.45)),
              color: 'rgba(255, 195, 75, 0.9)',
              coreColor: '#fff7d6',
              life: 2.6,
              maxLife: 2.6,
            });
            this.spawnFlashLight(ev.x, ev.y, 26, 'rgba(255, 195, 75, 0.9)', 2.6);
          }
          break;

        case 'area_change':
          this.lastMapRef = null;
          this.resetLevelFx(state);
          break;

        default:
          break;
      }
    }

    // Trigger crisp muzzle flash, melee swing flip, crosshair recoil & low-ammo alert for BOTH slots
    // (supports Steroids simultaneous offhand firing via slot.lastFiredTick!)
    if (state) {
      let triggeredBySlotTick = false;
      for (let s = 0; s < 2; s++) {
        const slotIndex = s as 0 | 1;
        if (state.tick < this.lastSlotFiredTick[slotIndex]) {
          this.lastSlotFiredTick[slotIndex] = -1;
        }
        const slot = state.player.weapons[slotIndex];
        if (
          slot &&
          slot.lastFiredTick !== undefined &&
          slot.lastFiredTick === state.tick &&
          this.lastSlotFiredTick[slotIndex] !== state.tick
        ) {
          this.lastSlotFiredTick[slotIndex] = state.tick;
          triggeredBySlotTick = true;
          this.spawnPlayerMuzzleFlashForSlot(state, slotIndex);
          this.crosshairRecoil = Math.min(4.2, this.crosshairRecoil + 1.8);
          this.checkLowAmmoCalloutForSlot(state, slotIndex);
        }
      }

      if (state.stats.shotsFired < this.lastShotsFired) {
        this.lastShotsFired = state.stats.shotsFired;
      } else if (state.stats.shotsFired > this.lastShotsFired) {
        this.lastShotsFired = state.stats.shotsFired;
        if (!triggeredBySlotTick) {
          this.spawnPlayerMuzzleFlashForSlot(state, state.player.activeSlot);
          this.crosshairRecoil = Math.min(4.2, this.crosshairRecoil + 2.0);
          this.checkLowAmmoCalloutForSlot(state, state.player.activeSlot);
        }
      }
    }
  }

  private checkLowAmmoCalloutForSlot(state: SimState, slotIndex: 0 | 1): void {
    const player = state.player;
    if (!player.alive || player.gunWarrantTicks > 0) return;
    const slot = player.weapons[slotIndex];
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

  private computeHeldWeaponAnchor(
    player: PlayerState,
    px: number,
    py: number,
    isOffhand: boolean,
    kick: number,
  ): { x: number; y: number } {
    const handSide = isOffhand ? -player.facing : player.facing;
    const isDualWielding =
      player.mutant === 'steroids' && player.weapons[0] !== null && player.weapons[1] !== null;
    if (isDualWielding) {
      const perpX = -Math.sin(player.aimAngle);
      const perpY = Math.cos(player.aimAngle);
      const dualSign = isOffhand ? -1 : 1;
      return {
        x: px + handSide * 4 + perpX * dualSign * 4.5 - Math.cos(player.aimAngle) * kick,
        y: py + 1 + perpY * dualSign * 3.5 + (isOffhand ? -1.5 : 1.5) - Math.sin(player.aimAngle) * kick,
      };
    }
    return {
      x: px + handSide * 3 - Math.cos(player.aimAngle) * kick,
      y: py + 1 - Math.sin(player.aimAngle) * kick,
    };
  }

  private spawnPlayerMuzzleFlashForSlot(state: SimState, slotIndex: 0 | 1): void {
    const player = state.player;
    if (!player.alive) return;
    const slot = player.weapons[slotIndex];
    if (!slot) return;
    const wep = this.data.getWeapon(slot.weaponId);
    if (wep?.ammoType === 'melee' || wep?.projectileKind === 'melee_slash') {
      // Authentic Nuclear Throne melee swing alternation (independent per hand for Steroids!)
      const nextSide: 1 | -1 = slot.meleeSwingSide ?? (this.meleeSwingSides[slotIndex] === 1 ? -1 : 1);
      this.meleeSwingSides[slotIndex] = nextSide;
      this.meleeSwingAnims[slotIndex] = 1;
      if (slotIndex === player.activeSlot) {
        this.meleeSwingSide = nextSide;
        this.meleeSwingAnim = 1;
      }
      return;
    }

    const isOffhand = player.mutant === 'steroids' && slotIndex !== player.activeSlot;
    const anchor = this.computeHeldWeaponAnchor(player, player.x, player.y, isOffhand, 0);
    const ang = player.aimAngle;
    const dist = 10;
    const mx = anchor.x + Math.cos(ang) * dist;
    const my = anchor.y + Math.sin(ang) * dist;

    let color = 'rgba(255, 200, 75, 0.9)';
    let coreColor = '#fff7d4';
    let radius = 10;

    const kind = wep?.projectileKind;
    if (kind === 'plasma' || kind === 'rad_beam') {
      color = 'rgba(90, 255, 130, 0.9)';
      coreColor = '#e2ffe8';
      radius = 12;
    } else if (kind === 'laser') {
      color = '#38d848';
      coreColor = '#ffffff';
      radius = 10;
    } else if (kind === 'lightning') {
      color = 'rgba(110, 225, 255, 0.9)';
      coreColor = '#e8fbff';
      radius = 11;
    } else if (kind === 'idpd_bullet') {
      color = 'rgba(85, 185, 255, 0.9)';
      coreColor = '#dff4ff';
      radius = 10;
    } else if (kind === 'bolt' || kind === 'seeking_bolt' || kind === 'toxic_bolt' || kind === 'splinter') {
      color = 'rgba(130, 255, 145, 0.85)';
      coreColor = '#eaffea';
      radius = 9;
    } else if (kind === 'shell' || kind === 'slug' || kind === 'flak') {
      color = 'rgba(255, 175, 55, 0.92)';
      coreColor = '#fff6cf';
      radius = 13;
    } else if (kind === 'rocket' || kind === 'nuke' || kind === 'grenade' || kind === 'cluster_grenade') {
      color = 'rgba(255, 140, 45, 0.92)';
      coreColor = '#fff0cc';
      radius = 14;
    }

    this.muzzleFlashes.push({
      x: mx,
      y: my,
      angle: ang,
      radius,
      color,
      coreColor,
      life: 2.6,
      maxLife: 2.6,
    });
    // Cast a compact dynamic muzzle light in dark biomes without washing out pixel art
    this.spawnFlashLight(mx, my, Math.max(28, radius * 2.4), color, 2.6);
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
        const bPos = lerpPosSafe(bossEnt.prevX, bossEnt.prevY, bossEnt.x, bossEnt.y, alpha, 56);
        const focusFrac = Math.min(1, (state.boss.introTicks - 10) / 28);
        this.camera.setFocusBias(bPos.x, bPos.y, 0.3 * focusFrac);
      } else {
        this.camera.clearFocusBias();
      }
    } else {
      this.camera.clearFocusBias();
    }

    // Smooth camera tracking using teleport-safe interpolated player position at 60/120 FPS
    const camPlayerPos = lerpPosSafe(state.player.prevX, state.player.prevY, state.player.x, state.player.y, alpha, 56);
    this.camera.update(camPlayerPos.x, camPlayerPos.y, aimWorldX, aimWorldY, dtSeconds, settings);

    // Decay melee swing snap interpolation (per hand for Steroids!)
    if (this.meleeSwingAnim > 0) {
      this.meleeSwingAnim = Math.max(0, this.meleeSwingAnim - ticks * 0.24);
    }
    if (this.meleeSwingAnims[0] > 0) {
      this.meleeSwingAnims[0] = Math.max(0, this.meleeSwingAnims[0] - ticks * 0.24);
    }
    if (this.meleeSwingAnims[1] > 0) {
      this.meleeSwingAnims[1] = Math.max(0, this.meleeSwingAnims[1] - ticks * 0.24);
    }

    // Track Crystal Shield release transition for sprShieldDisappear animation
    const nowShielding = state.player.shielding && state.player.alive;
    if (this.wasShielding && !nowShielding && state.player.alive) {
      this.shieldDisappearTicks = 8;
    }
    this.wasShielding = nowShielding;
    if (this.shieldDisappearTicks > 0) {
      this.shieldDisappearTicks = Math.max(0, this.shieldDisappearTicks - ticks);
    }

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

    // Update Odinfall-style comic hit impact stars
    for (let i = this.impactStars.length - 1; i >= 0; i--) {
      const st = this.impactStars[i]!;
      st.life -= ticks;
      if (st.life <= 0) {
        this.impactStars.splice(i, 1);
      }
    }

    // Update dash / roll pixel-art afterimage ghosts
    for (let i = this.dashGhosts.length - 1; i >= 0; i--) {
      const dg = this.dashGhosts[i]!;
      dg.life -= ticks;
      if (dg.life <= 0) {
        this.dashGhosts.splice(i, 1);
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
    gamepadFamily: GamepadFamily = 'generic',
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
    const mapChanged = this.lastMapRef !== map || this.lastAreaKey !== areaKey;
    let wallMaskNeedsRebuild = this.wallRenderMask === null || this.wallRenderMask.length !== map.width * map.height;
    if (mapChanged || state.floorClearTrigger) {
      if (mapChanged && this.lastMapRef !== null) {
        // Clear stale particles/floating texts & snap camera if level swapped outside consumeEvents
        this.resetLevelFx(state);
      }
      this.floorBuffer.rebuild(map, areaDef);
      // Bake any pre-existing non-corpse decals already stored on state.decals
      for (let i = 0; i < state.decals.length; i++) {
        const decal = state.decals[i]!;
        if (decal.kind !== 'corpse') {
          this.floorBuffer.bakeDecal(decal);
        }
      }
      this.lastMapRef = map;
      this.lastAreaKey = areaKey;
      wallMaskNeedsRebuild = true;
    } else {
      const changed = this.floorBuffer.syncMapChanges(map, areaDef);
      if (changed > 0) wallMaskNeedsRebuild = true;
    }
    if (wallMaskNeedsRebuild) {
      this.wallRenderMask = buildWallRenderMask(map);
    }

    const view = this.camera.getViewOrigin();
    const viewLeft = settings.pixelSnap ? Math.round(view.left) : view.left;
    const viewTop = settings.pixelSnap ? Math.round(view.top) : view.top;
    const isSteam = this.bundle.sourceMode === 'steam';

    // Continuous solid biome wall-top roof background clear (ZERO black void, ZERO Steam halo seams!)
    fillBiomeRoofRect(ctx, state.biome, viewLeft, viewTop, w, h, 0, 0, isSteam);

    // Teleport-safe interpolated player coords
    const playerPos = lerpPosSafe(state.player.prevX, state.player.prevY, state.player.x, state.player.y, alpha, 56);
    const playerX = playerPos.x;
    const playerY = playerPos.y;

    // ------------------------------------------------------------------------
    // LAYER 1: Persistent 1x Native FloorBuffer (exact 1:1 logical pixel grid)
    // ------------------------------------------------------------------------
    const floorCanvas = this.floorBuffer.getCanvas();
    if (floorCanvas) {
      const floorScale = this.floorBuffer.getPixelScale();
      const logicalFloorW = Math.floor(floorCanvas.width / floorScale);
      const logicalFloorH = Math.floor(floorCanvas.height / floorScale);
      const srcX = Math.max(0, Math.floor(viewLeft));
      const srcY = Math.max(0, Math.floor(viewTop));
      const srcRight = Math.min(logicalFloorW, Math.ceil(viewLeft + w));
      const srcBot = Math.min(logicalFloorH, Math.ceil(viewTop + h));
      const srcW = srcRight - srcX;
      const srcH = srcBot - srcY;
      if (srcW > 0 && srcH > 0) {
        const dstX = settings.pixelSnap ? Math.round(srcX - viewLeft) : srcX - viewLeft;
        const dstY = settings.pixelSnap ? Math.round(srcY - viewTop) : srcY - viewTop;
        ctx.drawImage(
          floorCanvas,
          srcX * floorScale,
          srcY * floorScale,
          srcW * floorScale,
          srcH * floorScale,
          dstX,
          dstY,
          srcW,
          srcH,
        );
      }
    }

    // World-space transform for layers 2-5
    ctx.save();
    ctx.translate(-viewLeft, -viewTop);

    // ------------------------------------------------------------------------
    // LAYER 2: 7-3 Throne Hall Carpet (clipped BEFORE walls!) + Wall Base AO & Outer Outlines
    // ------------------------------------------------------------------------
    this.renderThroneHallCarpet(ctx, state, settings.pixelSnap);
    const wallRange = this.renderWallBases(ctx, map, viewLeft, viewTop, w, h, areaDef);

    // ------------------------------------------------------------------------
    // LAYER 3: Settled Live Corpses, Throne Beam Telegraph, Plant Snares, Rogue Aim, Shadows, Pickups, Portal
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.corpses.length; i++) {
      const corpse = state.corpses[i]!;
      if (!corpse.baked) continue;
      if (this.isOutsideView(corpse.x, corpse.y, 32, viewLeft, viewTop, w, h)) continue;
      this.renderCorpse(ctx, corpse, settings.pixelSnap, alpha);
    }
    this.renderThroneBeamTelegraph(ctx, state, alpha);
    this.renderSnareTraps(ctx, state, viewLeft, viewTop, w, h, settings.pixelSnap, alpha);
    this.renderPortalStrikeAim(ctx, state, settings.pixelSnap);
    this.renderGroundShadows(ctx, state, playerX, playerY, alpha);
    this.renderPickups(ctx, state.pickups, state.tick, settings.pixelSnap, alpha);
    if (state.portal.active) {
      this.renderPortal(ctx, state, settings.pixelSnap);
    }

    // ------------------------------------------------------------------------
    // LAYER 4: True 2.5D Y-Sorted Entities & Interleaved Wall Overhang Caps (row ty * ts)
    // ------------------------------------------------------------------------
    const drawList: DrawableEntity[] = [];

    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind === 'snare_trap') continue; // Rendered flat on floor in Layer 3
      if (this.isOutsideView(prop.x, prop.y, 64, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: prop.y,
        draw: () => this.renderProp(ctx, prop, state.tick, settings.pixelSnap, map),
      });
    }

    for (let i = 0; i < state.corpses.length; i++) {
      const corpse = state.corpses[i]!;
      if (corpse.baked) continue;
      const cPos = lerpPosSafe(corpse.prevX ?? corpse.x, corpse.prevY ?? corpse.y, corpse.x, corpse.y, alpha, 56);
      if (this.isOutsideView(cPos.x, cPos.y, 32, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: cPos.y - 2,
        draw: () => this.renderCorpse(ctx, corpse, settings.pixelSnap, alpha),
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
      const ePos = lerpPosSafe(enemy.prevX, enemy.prevY, enemy.x, enemy.y, alpha, 56);
      const ex = ePos.x;
      const ey = ePos.y;
      if (this.isOutsideView(ex, ey, enemy.isBoss ? 140 : 36, viewLeft, viewTop, w, h)) continue;
      drawList.push({
        sortY: ey,
        draw: () => this.renderEnemy(ctx, enemy, ex, ey, state.tick, settings.pixelSnap, map, alpha),
      });
    }

    // Interleave visible 2.5D wall rows (front face + single roof cap at py - 8) at world Y = ty * ts!
    // Entities north of wall row ty (y < ty * ts) draw behind the 8px roof overhang;
    // entities in or south of row ty (y >= ty * ts) draw cleanly in front!
    const ts = map.tileSize || TILE_SIZE;
    const wMask = this.wallRenderMask;
    for (let ty = wallRange.minTy; ty <= wallRange.maxTy; ty++) {
      const rowOffset = ty * map.width;
      let hasRowWall = false;
      for (let tx = wallRange.minTx; tx <= wallRange.maxTx; tx++) {
        if (wMask && wMask[rowOffset + tx]! > 0) {
          hasRowWall = true;
          break;
        }
      }
      if (!hasRowWall) continue;
      const rowY = ty;
      drawList.push({
        sortY: rowY * ts + 0.01,
        draw: () =>
          this.renderWallRow(
            ctx,
            map,
            rowY,
            wallRange.minTx,
            wallRange.maxTx,
            wallRange.wallTopSpr,
            wallRange.wallBotSpr,
            pal,
          ),
      });
    }

    drawList.sort((a, b) => a.sortY - b.sortY);
    for (let i = 0; i < drawList.length; i++) {
      drawList[i]!.draw();
    }

    // ------------------------------------------------------------------------
    // LAYER 5: Cohesive Throne Mega-Beam, Projectiles + Trails, Smoke, Muzzles, Shockwaves, Particles, Text
    // ------------------------------------------------------------------------
    this.renderThroneMegaBeamColumn(ctx, state, settings.pixelSnap, alpha);

    for (let i = 0; i < state.projectiles.length; i++) {
      const proj = state.projectiles[i]!;
      // Throne Mega-Beam segments are rendered together as ONE cohesive multi-layer column above
      if (proj.sprite === 'sprNothingBeam') continue;
      const pPos =
        proj.kind === 'melee_slash'
          ? { x: proj.x, y: proj.y }
          : lerpPosSafe(proj.prevX, proj.prevY, proj.x, proj.y, alpha, 110);
      const px = pPos.x;
      const py = pPos.y;
      const isUnifiedBeam =
        (proj.kind === 'laser' || proj.kind === 'enemy_laser') &&
        proj.beamOriginX !== undefined &&
        proj.beamOriginY !== undefined;
      if (isUnifiedBeam) {
        const minBx = Math.min(proj.beamOriginX!, px);
        const maxBx = Math.max(proj.beamOriginX!, px);
        const minBy = Math.min(proj.beamOriginY!, py);
        const maxBy = Math.max(proj.beamOriginY!, py);
        if (
          maxBx + 16 < viewLeft ||
          minBx - 16 > viewLeft + w ||
          maxBy + 16 < viewTop ||
          minBy - 16 > viewTop + h
        ) {
          continue;
        }
      } else if (this.isOutsideView(px, py, 64, viewLeft, viewTop, w, h)) {
        continue;
      }
      this.renderProjectile(ctx, state, proj, px, py, state.tick, settings.pixelSnap, alpha);
    }

    this.renderSmokePuffs(ctx);
    this.renderMuzzleFlashes(ctx);
    this.renderShockwaves(ctx);
    this.renderImpactStars(ctx);
    this.renderParticles(ctx, state, settings.pixelSnap);
    this.renderFloatingTexts(ctx, state, viewLeft, viewTop, w);

    // Nearby weapon & interactable prop prompts in world space (adaptive KBM/gamepad/touch)
    this.renderNearbyWeaponPrompt(ctx, state, playerX, playerY, inputMode, viewTop, gamepadFamily);
    this.renderNearbyPropPrompt(ctx, state, playerX, playerY, inputMode, viewTop, gamepadFamily);

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
        radius: Math.round(Math.min(62, fl.radius * (0.55 + 0.45 * frac))),
        innerRadius: Math.round(Math.min(36, fl.radius * 0.55 * (0.55 + 0.45 * frac))),
        intensity: 1,
      });
    }
    this.lighting.render(ctx, state, this.camera, playerX, playerY, alpha, this.extraLightScratch);
    this.renderBiomeAmbientParticles(ctx, state.biome, viewLeft, viewTop, w, h);
    this.renderScreenEffects(ctx, state, w, h);

    // ------------------------------------------------------------------------
    // LAYER 7: Crosshair (sprCrosshair for KBM/Gamepad, subtle translucent aim reticle for Touch)
    // ------------------------------------------------------------------------
    if (cursorScreen) {
      if (inputMode === 'touch') {
        this.renderTouchAimReticle(ctx, cursorScreen.x, cursorScreen.y);
      } else {
        this.renderCrosshair(ctx, cursorScreen.x, cursorScreen.y, settings.crosshairStyle);
      }
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

  private renderWallBases(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    map: WorldMap,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    areaDef?: { wallTopSprite: string; wallBotSprite: string; wallOutSprite: string },
  ): {
    minTx: number;
    maxTx: number;
    minTy: number;
    maxTy: number;
    wallTopSpr: string;
    wallBotSpr: string;
  } {
    const ts = map.tileSize || TILE_SIZE;
    const minTx = Math.max(0, Math.floor(viewLeft / ts) - 1);
    const maxTx = Math.min(map.width - 1, Math.ceil((viewLeft + viewW) / ts) + 1);
    const minTy = Math.max(0, Math.floor(viewTop / ts) - 1);
    const maxTy = Math.min(map.height - 1, Math.ceil((viewTop + viewH) / ts) + 2);

    const num = BIOME_SPRITE_NUMBER[map.biome] ?? 1;
    const wallTopSpr = areaDef?.wallTopSprite ?? `sprWall${num}Top`;
    const wallBotSpr = areaDef?.wallBotSprite ?? `sprWall${num}Bot`;
    const wallOutSpr = areaDef?.wallOutSprite ?? `sprWall${num}Out`;
    const wMask = this.wallRenderMask;

    // Pass 2a: Crisp Nuclear Throne flat dark drop shadow strip (~5px tall) cast onto walkable floor below south faces
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = ty * map.width;
      for (let tx = minTx; tx <= maxTx; tx++) {
        if ((map.wallMask[row + tx]! & 16) !== 0) {
          ctx.fillRect(tx * ts, (ty + 1) * ts, ts, 5);
        }
      }
    }

    // Pass 2b: Authentic Steam organic jagged wall edges (`sprWall*Out`, 24x32, orig=(4,12)) on ALL exposed perimeter
    // wall tiles, then cleanly mask adjacent outer roof tiles (`wMask === 0`) at `topY = py - 8` so organic fringe ONLY
    // overhangs walkable floor edges with ZERO seam on the solid outer roof mass (matches 11b_levelup.png)!
    if (this.bundle.sourceMode === 'steam' && this.sprites.hasSprite(wallOutSpr)) {
      const outDef = this.sprites.getSprite(wallOutSpr);
      // Steam sprWall*Out has originY=12 (already baked with -8 roof overhang); fallback to -8 if originY < 8
      const outOffsetY = outDef && outDef.originY >= 8 ? 0 : -8;
      for (let ty = minTy; ty <= maxTy; ty++) {
        const row = ty * map.width;
        for (let tx = minTx; tx <= maxTx; tx++) {
          const idx = row + tx;
          if (wMask ? wMask[idx] !== 1 : isWalkable(map.tiles[idx]!) || !hasNearbyFloor(map, tx, ty)) {
            continue;
          }
          const variant = map.floorVariants[idx] ?? ((tx * 5 + ty * 11) & 7);
          this.sprites.draw(ctx, wallOutSpr, tx * ts, ty * ts + outOffsetY, { frame: variant, pixelSnap: true });
        }
      }
      // Repaint outer roof tiles (`wMask === 0`) bordering perimeter walls at `topY = ty * ts - 8` so outer edges are 100% seamless
      if (wMask) {
        const rMinTy = Math.max(0, minTy - 1);
        const rMaxTy = Math.min(map.height - 1, maxTy + 1);
        const rMinTx = Math.max(0, minTx - 1);
        const rMaxTx = Math.min(map.width - 1, maxTx + 1);
        const mw = map.width;
        const mh = map.height;
        for (let ty = rMinTy; ty <= rMaxTy; ty++) {
          const row = ty * mw;
          const topY = ty * ts - 8;
          for (let tx = rMinTx; tx <= rMaxTx; tx++) {
            const idx = row + tx;
            if (wMask[idx] !== 0 || isWalkable(map.tiles[idx]!)) continue;
            let nearPerim = false;
            for (let oy = -1; oy <= 1 && !nearPerim; oy++) {
              const ny = ty + oy;
              if (ny < 0 || ny >= mh) continue;
              const nRow = ny * mw;
              for (let ox = -1; ox <= 1; ox++) {
                const nx = tx + ox;
                if (nx >= 0 && nx < mw && wMask[nRow + nx] === 1) {
                  nearPerim = true;
                  break;
                }
              }
            }
            if (nearPerim) {
              fillBiomeRoofRect(ctx, map.biome, tx * ts, topY, ts, ts, tx * ts, topY, true);
            }
          }
        }
      }
    }

    return { minTx, maxTx, minTy, maxTy, wallTopSpr, wallBotSpr };
  }

  /**
   * Renders a single horizontal row of 2.5D walls (front faces + ONE roof cap at py - 8 per wall tile,
   * backed by the biome's exact solid roof color so transparent Steam edge pixels melt seamlessly
   * into the continuous outer roof mass with ZERO dark seams and ZERO black void holes).
   * Called interleaved with Layer 4 entities at sortY = ty * ts for true 2.5D overhang occlusion!
   */
  private renderWallRow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    map: WorldMap,
    ty: number,
    minTx: number,
    maxTx: number,
    wallTopSpr: string,
    wallBotSpr: string,
    pal: { wallTop: string; wallBot: string; wallEdge: string; voidBg: string },
  ): void {
    const ts = map.tileSize || TILE_SIZE;
    const overhang = 8;
    const row = ty * map.width;
    const py = ty * ts;
    const topY = py - overhang;
    const wMask = this.wallRenderMask;
    const isSteam = this.bundle.sourceMode === 'steam';
    const roofColor = getBiomeRoofColor(map.biome, isSteam);

    // 1. 2.5D south front faces (sprWall*Bot) for south-facing tiles in this row
    for (let tx = minTx; tx <= maxTx; tx++) {
      const idx = row + tx;
      const mask = map.wallMask[idx]!;
      if ((mask & 16) === 0) continue;
      const px = tx * ts;
      const variant = map.floorVariants[idx] ?? ((tx * 3 + ty * 7) & 3);
      const drew = this.sprites.draw(ctx, wallBotSpr, px, py, { frame: variant, pixelSnap: true });
      if (!drew) {
        ctx.fillStyle = pal.wallBot;
        ctx.fillRect(px, py, ts, ts);
        ctx.fillStyle = roofColor;
        ctx.fillRect(px + 1, py + 5, 6, 4);
        ctx.fillRect(px + 9, py + 10, 6, 4);
        ctx.fillStyle = '#0e0a12';
        ctx.fillRect(px, py + ts - 2, ts, 2);
      }
    }

    // 2. Single 2.5D wall roof cap (solid biome roof fill + sprWall*Top at py - 8) for both perimeter walls (1)
    //    AND enclosed interior wall islands (2) — ZERO dark seams, ZERO black holes!
    for (let tx = minTx; tx <= maxTx; tx++) {
      const idx = row + tx;
      const wallKind = wMask ? wMask[idx]! : !isWalkable(map.tiles[idx]!) && hasNearbyFloor(map, tx, ty) ? 1 : 0;
      if (wallKind === 0) continue;

      const px = tx * ts;
      const mask = map.wallMask[idx]!;
      const variant = map.floorVariants[idx] ?? ((tx * 5 + ty * 11) & 7);

      // Paint exact solid biome roof color directly underneath sprWall*Top so transparent Steam/Built-In
      // edge pixels melt seamlessly into the continuous roof mass with ZERO seams!
      fillBiomeRoofRect(ctx, map.biome, px, topY, ts, ts, px, topY, isSteam);

      const drewTop = this.sprites.draw(ctx, wallTopSpr, px, topY, {
        frame: variant,
        pixelSnap: true,
      });

      // Built-In mode clean 1px sunlit edge highlights & crisp south cliff overhangs (NO heavy fake black frames!)
      if (wallKind === 1 && (!isSteam || !drewTop)) {
        const northOpen = (mask & 1) === 0;
        const eastOpen = (mask & 2) === 0;
        const southOpen = (mask & 4) === 0 || (mask & 16) !== 0;
        const westOpen = (mask & 8) === 0;
        const notch = (tx * 7 + ty * 13) & 3;

        if (northOpen) {
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY, ts, 1);
          ctx.fillStyle = 'rgba(255, 250, 230, 0.16)';
          ctx.fillRect(px + 2 + notch * 2, topY, 5, 1);
        }
        if (westOpen) {
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY, 1, ts);
        }
        if (eastOpen) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
          ctx.fillRect(px + ts - 1, topY, 1, ts);
        }
        if (southOpen && (mask & 16) !== 0) {
          // Crisp 1px sunlit cliff crest + clean cliff overhang lip above the 2.5D south face
          ctx.fillStyle = pal.wallEdge;
          ctx.fillRect(px, topY + ts - 2, ts, 1);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
          ctx.fillRect(px, topY + ts - 1, ts, 1);
          ctx.fillStyle = roofColor;
          ctx.fillRect(px + 3 + notch * 3, topY + ts - 1, 3, 1);
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
    // Authentic Nuclear Throne crisp flat centered integer-pixel oval contact shadows directly beneath entities
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';

    // Player shadow
    if (state.player.alive) {
      fillPixelOval(ctx, Math.round(playerX), Math.round(playerY + 5), 6, 3);
    }

    // Enemy & Boss centered contact shadows
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (e.bossId === 'nuclear_throne') continue;
      const ePos = lerpPosSafe(e.prevX, e.prevY, e.x, e.y, alpha, 56);
      const ex = Math.round(ePos.x);
      const ey = Math.round(ePos.y);
      const elev = e.elevated ? Math.max(0, e.elevZ ?? 14) : 0;
      const elevScale = Math.max(0.45, 1 - elev * 0.015);
      const rx = Math.max(4, Math.round(e.radius * 0.92 * elevScale));
      const ry = Math.max(2, Math.round(e.radius * 0.44 * elevScale));
      fillPixelOval(ctx, ex, ey + Math.min(9, Math.round(e.radius * 0.6)), rx, ry);

      if (e.bossId === 'lil_hunter' && e.elevated) {
        ctx.save();
        const ringPulse = Math.round(10 + Math.sin(this.renderTimeSec * 22) * 3);
        ctx.fillStyle = 'rgba(255, 72, 82, 0.85)';
        drawPixelRing(ctx, ex, ey + 4, ringPulse, 1, 4, Math.floor(this.renderTimeSec * 12));
        ctx.restore();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      }
    }

    // Prop centered contact shadows
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'snare_trap' || !p.sprite) continue;
      const rx = Math.max(5, Math.round(p.radius * 0.92));
      const ry = Math.max(2, Math.round(p.radius * 0.42));
      fillPixelOval(ctx, Math.round(p.x), Math.round(p.y + 4), rx, ry);
    }

    // Pickup centered contact shadows
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      const pkPos = lerpPosSafe(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
      const rx = pk.kind === 'weapon' ? 5 : pk.kind === 'big_rad' ? 4 : 3;
      const ry = 2;
      fillPixelOval(ctx, Math.round(pkPos.x), Math.round(pkPos.y + 4), rx, ry);
    }

    // Airborne bouncing brass casing shadows
    for (let i = 0; i < state.casings.length; i++) {
      const c = state.casings[i]!;
      if (c.baked || c.z <= 0.35) continue;
      ctx.fillRect(Math.round(c.x - 1), Math.round(c.y + 1), 2, 1);
    }

    ctx.restore();
  }

  /**
   * Renders Plant Snare traps scaled accurately for Trapper (plant_a) with thorny perimeter rings
   * and animated vine tethers pulling toward every snared enemy!
   */
  private renderSnareTraps(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    viewLeft: number,
    viewTop: number,
    w: number,
    h: number,
    pixelSnap: boolean,
    alpha: number,
  ): void {
    const tangleSpr =
      state.player.skin === 'b' && this.sprites.hasSprite('sprTangleB') ? 'sprTangleB' : 'sprTangle';
    const hasTangle = this.sprites.hasSprite(tangleSpr);

    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind !== 'snare_trap') continue;
      const r = Math.max(16, Math.round(prop.radius));
      if (this.isOutsideView(prop.x, prop.y, r + 24, viewLeft, viewTop, w, h)) continue;

      const cx = Math.round(prop.x);
      const cy = Math.round(prop.y);
      const frame = Math.min(5, Math.floor((state.tick + prop.id) * 0.2) % 6);

      ctx.save();
      // Subtle grounded bramble floor shadow + crisp pixel-stepped thorny perimeter matching exact radius (including Trapper r=76!)
      ctx.fillStyle = 'rgba(18, 46, 22, 0.34)';
      drawPixelDisc(ctx, cx, cy, Math.max(8, r - 2));
      ctx.fillStyle = '#143318';
      drawPixelRing(ctx, cx, cy, r + 1, 1);
      ctx.fillStyle = '#4ee85e';
      drawPixelRing(ctx, cx, cy, r, 1, 5, Math.floor(state.tick * 0.25) & 7);

      // Thorny bramble spoke roots radiating from center across the snare radius
      const spokes = r >= 54 ? 8 : 5;
      for (let s = 0; s < spokes; s++) {
        const ang = (s / spokes) * Math.PI * 2 + (prop.id % 7) * 0.4;
        const ex = cx + Math.cos(ang) * (r - 2);
        const ey = cy + Math.sin(ang) * (r - 2);
        ctx.fillStyle = '#1b4720';
        drawPixelLine(ctx, cx, cy, ex, ey, 2);
        ctx.fillStyle = '#3dc74f';
        drawPixelLine(ctx, cx, cy, ex, ey, 1);
      }

      // Draw central sprTangle (and satellite integer-scale sprTangle clusters when Trapper widens radius!)
      if (hasTangle) {
        this.sprites.draw(ctx, tangleSpr, cx, cy, { frame, pixelSnap });
        if (r > 44) {
          const satCount = 5;
          const satDist = r * 0.54;
          for (let k = 0; k < satCount; k++) {
            const ang = (k / satCount) * Math.PI * 2 + 0.35;
            this.sprites.draw(
              ctx,
              tangleSpr,
              cx + Math.cos(ang) * satDist,
              cy + Math.sin(ang) * satDist,
              { frame: (frame + k) % 6, alpha: 0.85, pixelSnap },
            );
          }
        }
      }

      // Animated thorny vine tethers binding every snared enemy inside/near this trap
      const tetherRangeSq = (r + 22) * (r + 22);
      for (let j = 0; j < state.enemies.length; j++) {
        const e = state.enemies[j]!;
        if (e.friendly || e.hp <= 0 || e.snaredTicks <= 0) continue;
        const ePos = lerpPosSafe(e.prevX, e.prevY, e.x, e.y, alpha, 56);
        const dx = ePos.x - cx;
        const dy = ePos.y - cy;
        if (dx * dx + dy * dy > tetherRangeSq) continue;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) continue;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const wave = Math.sin(this.renderTimeSec * 14 + e.id) * 4;
        const midX = (cx + ePos.x) * 0.5 + perpX * wave;
        const midY = (cy + ePos.y) * 0.5 + perpY * wave;
        ctx.fillStyle = '#143818';
        drawPixelLine(ctx, cx, cy, midX, midY, 3);
        drawPixelLine(ctx, midX, midY, ePos.x, ePos.y + 2, 3);
        ctx.fillStyle = '#5eff72';
        drawPixelLine(ctx, cx, cy, midX, midY, 1);
        drawPixelLine(ctx, midX, midY, ePos.x, ePos.y + 2, 1);
      }
      ctx.restore();
    }
  }

  /**
   * Renders Rogue's hold-to-drag Portal Strike targeting reticle (sprRogueStrike / pixel bombing strip).
   */
  private renderPortalStrikeAim(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    pixelSnap: boolean,
  ): void {
    const aim = state.player.portalStrikeAim;
    if (!aim || !aim.active || !state.player.alive) return;

    const hasTB = state.player.mutations.includes('throne_butt');
    const superStrike = state.player.ultra === 'rogue_a';
    const strikeSpr =
      (hasTB || superStrike) && this.sprites.hasSprite('sprRogueStrikeTB')
        ? 'sprRogueStrikeTB'
        : 'sprRogueStrike';

    ctx.save();
    const blastCount = superStrike ? 6 : hasTB ? 5 : 4;
    const blastR = superStrike ? 38 : hasTB ? 32 : 26;
    const cosA = Math.cos(aim.angle);
    const sinA = Math.sin(aim.angle);
    const dashPhase = Math.floor(this.renderTimeSec * 16) & 7;

    // Crisp blue-cyan portal strike impact preview rings along the drag vector
    const ringR = Math.round(blastR * 0.72);
    for (let b = 0; b < blastCount; b++) {
      const bx = aim.x + cosA * (b * 24);
      const by = aim.y + sinA * (b * 24);
      ctx.fillStyle = 'rgba(42, 140, 255, 0.16)';
      drawPixelDisc(ctx, bx, by, Math.round(blastR * 0.65));
      ctx.fillStyle = b === 0 ? '#a8e6ff' : '#4fb4ff';
      drawPixelRing(ctx, bx, by, ringR, 1, 5, dashPhase + b);
    }

    // Centerline & Steam sprRogueStrike scaled 1:1 to exact Portal Strike blast span (zero overhang behind Rogue!)
    const midX = aim.x + cosA * ((blastCount - 1) * 12);
    const midY = aim.y + sinA * ((blastCount - 1) * 12);
    const strikeDef = this.sprites.getSprite(strikeSpr);
    const actualSpan = (blastCount - 1) * 24 + ringR * 2;
    const strikeScaleX = strikeDef && strikeDef.width > 0 ? Math.max(0.4, Math.min(1, actualSpan / strikeDef.width)) : 1;
    const strikeScaleY = strikeDef && strikeDef.height > 0 ? Math.max(0.5, Math.min(1, (ringR * 2) / strikeDef.height)) : 1;
    const drewStrike = this.sprites.draw(ctx, strikeSpr, midX, midY, {
      frame: Math.floor(state.tick * 0.35),
      rotation: aim.angle,
      scaleX: strikeScaleX,
      scaleY: strikeScaleY,
      alpha: 0.9,
      pixelSnap,
    });
    if (!drewStrike) {
      const endX = aim.x + cosA * ((blastCount - 1) * 24);
      const endY = aim.y + sinA * ((blastCount - 1) * 24);
      ctx.fillStyle = '#0c1c36';
      drawPixelLine(ctx, aim.x, aim.y, endX, endY, 3);
      ctx.fillStyle = '#70d4ff';
      drawPixelLine(ctx, aim.x, aim.y, endX, endY, 1);
      // Origin crosshair pin
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(aim.x) - 3, Math.round(aim.y), 7, 1);
      ctx.fillRect(Math.round(aim.x), Math.round(aim.y) - 3, 1, 7);
    }
    ctx.restore();
  }

  private renderPickups(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    pickups: readonly PickupEntity[],
    tick: number,
    pixelSnap: boolean,
    alpha: number = 1,
  ): void {
    for (let i = 0; i < pickups.length; i++) {
      const pk = pickups[i]!;
      // Blink slightly when close to expiring
      if (pk.lifeTicks > 0 && pk.lifeTicks < 60 && Math.floor(pk.lifeTicks / 4) % 2 === 0) {
        continue;
      }
      const pkPos = lerpPosSafe(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
      const bob = Math.sin((tick + pk.id * 7) * 0.22) * 1.4;
      const py = pkPos.y + bob;
      let spr = 'sprRad';
      if (pk.kind === 'big_rad') spr = this.sprites.hasSprite('sprBigRad') ? 'sprBigRad' : 'sprRadBig';
      else if (pk.kind === 'ammo') spr = 'sprAmmo';
      else if (pk.kind === 'hp') spr = 'sprHP';
      else if (pk.kind === 'portal_strike') {
        spr = this.sprites.hasSprite('sprRogueAmmo')
          ? 'sprRogueAmmo'
          : this.sprites.hasSprite('sprRogueAmmoHUD')
            ? 'sprRogueAmmoHUD'
            : 'sprAmmo';
      }
      else if (pk.kind === 'weapon' && pk.weaponId) {
        spr = resolveWeaponSpriteName(pk.weaponId, this.data);
      }

      const drew = this.sprites.draw(ctx, spr, pkPos.x, py, {
        frame: Math.floor(pk.animFrame || tick * 0.2),
        pixelSnap,
      });

      if (!drew) {
        const x = Math.round(pkPos.x);
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
        ctx.fillRect(Math.round(pkPos.x + ox), Math.round(py + oy), 2, 2);
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
    const target = portal.targetArea;

    // Distinct secret portal visual identity:
    // - '1-?' Oasis: Ocean Blue tint
    // - 'vault' Crown Vault: Emerald Green (sprProtoPortal)
    // - 'hq-1' IDPD HQ: Police Blue (sprPopoPortal / sprIDPDPortalStart)
    // - Default: Classic Wasteland Purple (sprPortal)
    const isVault = target === 'vault';
    const isOasis = target === '1-?';
    const isHq = target === 'hq-1';

    const outerGlowCol = isVault
      ? 'rgba(60, 235, 118, 0.48)'
      : isOasis
        ? 'rgba(46, 175, 255, 0.48)'
        : isHq
          ? 'rgba(65, 145, 255, 0.50)'
          : 'rgba(170, 75, 245, 0.48)';
    const coreGlowCol = isVault
      ? 'rgba(210, 255, 225, 0.62)'
      : isOasis || isHq
        ? 'rgba(205, 242, 255, 0.62)'
        : 'rgba(245, 220, 255, 0.62)';
    const ringColA = isVault ? '#b8ffd0' : isOasis || isHq ? '#bae8ff' : '#ebd0ff';
    const ringColB = isVault ? '#47f084' : isOasis ? '#38c8ff' : isHq ? '#4f9eff' : '#b86bff';
    const shardColA = isVault ? '#9effbc' : isOasis || isHq ? '#9ee2ff' : '#e8b5ff';
    const shardColB = isVault ? '#38d974' : isOasis ? '#30b8ff' : isHq ? '#4a88ff' : '#78d8ff';

    // Outer swirling crisp pixel-hard vortex aura discs (zero blurry radial gradients!)
    ctx.save();
    const outerR = Math.round(Math.max(16, Math.min(24, portal.radius + Math.sin(state.tick * 0.3) * 2)));
    ctx.fillStyle = outerGlowCol;
    ctx.globalAlpha = 0.45;
    fillPixelDisc(ctx, px, py, outerR);
    ctx.fillStyle = coreGlowCol;
    ctx.globalAlpha = 0.55;
    fillPixelDisc(ctx, px, py, Math.max(6, Math.round(outerR * 0.45)));
    ctx.globalAlpha = 1;

    // Crisp pixel-stepped animated suction rings (zero smooth anti-aliased ctx.arc!)
    for (let r = 0; r < 3; r++) {
      const phase = (this.renderTimeSec * 1.45 + r / 3) % 1;
      const ringR = Math.max(3, Math.round(outerR * 1.4 * (1 - phase)));
      ctx.globalAlpha = Math.min(0.65, 0.55 * phase);
      ctx.fillStyle = r === 0 ? ringColA : ringColB;
      drawPixelRing(ctx, px, py, ringR, 1, 4, (state.tick + r * 3) & 7);
    }

    // Deterministic zero-GC spiraling suction debris & energy shards
    const t = this.renderTimeSec;
    for (let d = 0; d < 12; d++) {
      const prog = (t * (0.95 + (d % 3) * 0.25) + d * 0.21) % 1;
      const dist = (1 - prog * prog) * (outerR * 2.3);
      const ang = d * 1.618 * Math.PI + prog * 4.4;
      const dx = Math.round(px + Math.cos(ang) * dist);
      const dy = Math.round(py + Math.sin(ang) * dist);
      const sz = d % 3 === 0 ? 2 : 1;
      ctx.fillStyle = d % 2 === 0 ? shardColA : d % 3 === 0 ? shardColB : '#4a3d47';
      ctx.globalAlpha = Math.min(1, prog * 1.6) * (1 - prog * 0.3);
      ctx.fillRect(dx, dy, sz, sz);
    }
    ctx.restore();

    const frame = Math.floor(state.tick * 0.35);
    let portalSpr = 'sprPortal';
    let tintColor: string | undefined;
    if (isVault) {
      if (this.sprites.hasSprite('sprProtoPortal')) {
        portalSpr = 'sprProtoPortal';
      } else {
        tintColor = '#48f085';
      }
    } else if (isHq) {
      if (this.sprites.hasSprite('sprPopoPortal')) {
        portalSpr = 'sprPopoPortal';
      } else if (this.sprites.hasSprite('sprIDPDPortalStart')) {
        portalSpr = 'sprIDPDPortalStart';
      } else {
        tintColor = '#52a8ff';
      }
    } else if (isOasis) {
      // Oasis portal uses blue-tinted portal vortex
      if (this.sprites.hasSprite('sprPopoPortal')) {
        portalSpr = 'sprPopoPortal';
      } else {
        tintColor = '#45c8ff';
      }
    }

    const drew = this.sprites.draw(ctx, portalSpr, px, py, {
      frame,
      rotation: state.tick * 0.08,
      tintColor,
      pixelSnap,
    });
    if (!drew) {
      const darkCore = isVault ? '#145e32' : isOasis ? '#12548a' : isHq ? '#16358c' : '#5a1e8c';
      const midCore = isVault ? '#48f085' : isOasis ? '#3ec4ff' : isHq ? '#4f9eff' : '#c46bff';
      ctx.fillStyle = darkCore;
      drawPixelDisc(ctx, px, py, 13);
      ctx.fillStyle = midCore;
      drawPixelDisc(ctx, px, py, 8);
      ctx.fillStyle = '#ffffff';
      drawPixelDisc(ctx, px, py, 4);
    }
  }

  private renderProp(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    prop: PropEntity,
    tick: number,
    pixelSnap: boolean,
    map?: WorldMap,
  ): void {
    let sprName = prop.opened && prop.openSprite ? prop.openSprite : prop.sprite;
    // Skip invisible prompt-only anchor props cleanly (e.g. open IDPD Van boardAnchor with sprite: '')
    if (!sprName) return;
    // Use regal Built-In Palace/Vault columns when sprPalacePillar exists (Steam pack keeps authentic sprPillar)
    if (
      (map?.biome === 'palace' || map?.biome === 'vault') &&
      sprName === 'sprPillar' &&
      this.sprites.hasSprite('sprPalacePillar')
    ) {
      sprName = 'sprPalacePillar';
    }
    // Render authentic Cursed Chest sprite when prop.cursed is true
    if (prop.cursed) {
      if (prop.opened) {
        if (prop.kind === 'big_weapon_chest' && this.sprites.hasSprite('sprCursedChestBigOpen')) {
          sprName = 'sprCursedChestBigOpen';
        } else if (this.sprites.hasSprite('sprCursedChestOpen')) {
          sprName = 'sprCursedChestOpen';
        }
      } else {
        if (prop.kind === 'big_weapon_chest' && this.sprites.hasSprite('sprCursedChestBig')) {
          sprName = 'sprCursedChestBig';
        } else if (this.sprites.hasSprite('sprCursedChest')) {
          sprName = 'sprCursedChest';
        }
      }
    }
    // Use dedicated Steam hurt/charge sprites when present on generators & proto statues
    // (Guard Vault Crown Pedestal so shooting sprCrownPedIdle never flashes sprProtoStatueHurt!)
    if (prop.kind === 'throne_generator' && prop.hurtFlashTicks > 0 && this.sprites.hasSprite('sprBigGeneratorHurt')) {
      sprName = 'sprBigGeneratorHurt';
    } else if (prop.kind === 'proto_statue' && prop.sprite !== 'sprCrownPedIdle') {
      if (prop.hurtFlashTicks > 0 && this.sprites.hasSprite('sprProtoStatueHurt')) {
        sprName = 'sprProtoStatueHurt';
      } else if ((prop.radsStored ?? 0) > 0 && this.sprites.hasSprite('sprProtoStatueCharge')) {
        sprName = 'sprProtoStatueCharge';
      }
    }
    if (!this.sprites.hasSprite(sprName) && sprName === 'sprPalacePillar' && this.sprites.hasSprite('sprPillar')) {
      sprName = 'sprPillar';
    }
    const sprDef = this.sprites.getSprite(sprName);
    const isSteam = this.bundle.sourceMode === 'steam';

    // Honor prop.flipX (and default East 7-3 Throne Generators to face inward toward the Throne)
    const flipX =
      prop.flipX !== undefined
        ? prop.flipX
        : prop.kind === 'throne_generator' && map !== undefined
          ? prop.x > (map.width * (map.tileSize || TILE_SIZE)) * 0.5
          : false;

    // NT sprBigGenerator is 96x96 with origin (32, 32) at top-left of its 32x32 base (not center 48, 48).
    // When flipped horizontally, base spans [-32, 0] instead of [0, +32], so mirror X offset to +16!
    const genAlignOffset =
      sprDef &&
      sprName.startsWith('sprBigGenerator') &&
      sprDef.width >= 64 &&
      sprDef.originX === 32 &&
      sprDef.originY === 32
        ? -16
        : 0;
    const genAlignX = flipX ? -genAlignOffset : genAlignOffset;
    const genAlignY = genAlignOffset;

    // Chest & canister frame cadence fix (P0):
    // Steam 7-frame chests use f0=idle, f1=100% PURE WHITE hurt flash, f2..f6=periodic diagonal glint.
    // Hold idle on f0, play brief glint f2..f6 once every ~5s, reserve f1 STRICTLY for hurtFlashTicks > 0!
    const isGlintChest =
      !prop.opened &&
      sprDef !== undefined &&
      sprDef.frames.length >= 7 &&
      sprName !== 'sprProtoChest' &&
      (prop.kind === 'weapon_chest' ||
        prop.kind === 'big_weapon_chest' ||
        prop.kind === 'ammo_chest' ||
        prop.kind === 'rad_canister' ||
        prop.kind === 'idpd_canister' ||
        sprName.includes('Chest'));

    let propFrame = 0;
    let useSyntheticFlash = prop.hurtFlashTicks >= 2;
    if (isGlintChest) {
      if (prop.hurtFlashTicks > 0) {
        propFrame = 1; // Authentic pure-white flash frame
        useSyntheticFlash = !isSteam;
      } else {
        const glintCycle = (tick + prop.id * 41) % 156; // 5.2s period at 30 Hz
        if (glintCycle < 10) {
          const maxGlintFrames = Math.max(1, sprDef.frames.length - 2);
          propFrame = 2 + Math.min(maxGlintFrames - 1, Math.floor(glintCycle / 2));
        } else {
          propFrame = 0;
        }
        useSyntheticFlash = false;
      }
    } else if (sprDef && sprDef.frames.length > 1) {
      if (sprName.endsWith('Hurt')) {
        propFrame = prop.hurtFlashTicks >= 3 ? 0 : 1;
        useSyntheticFlash = !isSteam;
      } else {
        propFrame = Math.floor(tick * 0.15);
      }
    }

    const joltX = prop.hurtFlashTicks > 0 ? ((prop.hurtFlashTicks & 1) === 0 ? 1 : -1) : 0;
    const drew = this.sprites.draw(ctx, sprName, prop.x + joltX + genAlignX, prop.y + genAlignY, {
      frame: propFrame,
      flipX,
      flashWhite: useSyntheticFlash,
      scaleX: 1,
      scaleY: 1,
      pixelSnap,
    });

    if (!drew) {
      const x = Math.round(prop.x);
      const y = Math.round(prop.y);
      const r = Math.max(5, Math.round(prop.radius));
      ctx.fillStyle = '#141018';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle =
        prop.hurtFlashTicks > 0
          ? '#ffffff'
          : prop.cursed
            ? '#a338e8'
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

    // Subtle purple cursed aura sparkles around unopened cursed chests
    if (prop.cursed && !prop.opened) {
      ctx.save();
      for (let s = 0; s < 3; s++) {
        const ang = this.renderTimeSec * 2.8 + prop.id + s * 2.09;
        const sx = Math.round(prop.x + Math.cos(ang) * 9);
        const sy = Math.round(prop.y - 2 + Math.sin(ang * 1.3) * 6);
        ctx.fillStyle = s === 0 ? '#f0a8ff' : '#b842ff';
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.restore();
    }

    // Proto Statue active charge ring when damaged or storing rads
    if (prop.kind === 'proto_statue' && (prop.hp < prop.maxHp || (prop.radsStored ?? 0) > 0) && prop.hp < 99999) {
      ctx.save();
      const pulseR = Math.round(14 + Math.sin(this.renderTimeSec * 10) * 3);
      ctx.fillStyle = 'rgba(85, 255, 130, 0.72)';
      drawPixelRing(ctx, prop.x, prop.y, pulseR, 1, 4, tick & 7);
      ctx.restore();
    }
  }

  private renderCorpse(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    corpse: CorpseEntity,
    pixelSnap: boolean,
    alpha: number = 1,
  ): void {
    const cPos = lerpPosSafe(corpse.prevX ?? corpse.x, corpse.prevY ?? corpse.y, corpse.x, corpse.y, alpha, 56);
    const drew = this.sprites.draw(ctx, corpse.sprite, cPos.x, cPos.y, {
      frame: corpse.frame,
      flipX: corpse.facing === -1,
      pixelSnap,
    });
    if (!drew) {
      const x = Math.round(cPos.x);
      const y = Math.round(cPos.y);
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

    // Pick character sprite (respecting Chicken headless sprites & B-skin with safe fallback)
    let charSprite = mutantDef.sprites.idle;
    let usingHeadlessSprite = false;
    if (!player.alive) {
      charSprite = (useB && mutantDef.sprites.bDead) || mutantDef.sprites.dead;
    } else if (player.mutant === 'chicken' && player.headlessTicks > 0) {
      const headlessCand =
        player.hurtFlashTicks > 0
          ? 'sprMutant9HeadlessHurt'
          : moving
            ? 'sprMutant9HeadlessWalk'
            : 'sprMutant9HeadlessIdle';
      if (this.sprites.hasSprite(headlessCand)) {
        charSprite = headlessCand;
        usingHeadlessSprite = true;
      } else {
        charSprite =
          player.hurtFlashTicks > 0
            ? (useB && mutantDef.sprites.bHurt) || mutantDef.sprites.hurt
            : moving
              ? (useB && mutantDef.sprites.bWalk) || mutantDef.sprites.walk
              : (useB && mutantDef.sprites.bIdle) || mutantDef.sprites.idle;
      }
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

    // Active Eyes Telekinesis full-radius inward psychic waves + Monster Style passive repel ring
    if (player.alive && player.mutant === 'eyes') {
      if (player.telekinesisActive) {
        ctx.save();
        const hasTB = player.mutations.includes('throne_butt');
        const tkRadius = hasTB ? 200 : 155;
        // Faint dashed perimeter marking true pull/push reach
        ctx.fillStyle = 'rgba(95, 185, 255, 0.24)';
        drawPixelRing(ctx, px, py, tkRadius, 1, 8, Math.floor(this.renderTimeSec * 12) & 7);
        // 3 concentric inward-pulling pixel-stepped waves spanning the full telekinesis radius
        for (let wIdx = 0; wIdx < 3; wIdx++) {
          const phase = wrapMod(this.renderTimeSec * 1.45 + wIdx / 3, 1);
          const waveR = Math.max(10, Math.round(tkRadius * (1 - phase)));
          ctx.fillStyle = wIdx === 0 ? 'rgba(155, 225, 255, 0.44)' : 'rgba(95, 185, 255, 0.34)';
          ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
          drawPixelRing(ctx, px, py, waveR, 1, 5, (state.tick + wIdx * 2) & 7);
        }
        // Inward-streaming psychic distortion flecks
        for (let f = 0; f < 10; f++) {
          const prog = wrapMod(this.renderTimeSec * (1.2 + (f % 3) * 0.3) + f * 0.19, 1);
          const dist = tkRadius * (1 - prog);
          const ang = f * 0.628 + prog * 1.1;
          ctx.globalAlpha = Math.sin(prog * Math.PI) * 0.7;
          ctx.fillStyle = f % 2 === 0 ? '#a8e4ff' : '#8598ff';
          ctx.fillRect(Math.round(px + Math.cos(ang) * dist), Math.round(py + Math.sin(ang) * dist), 2, 1);
        }
        // Projectile Style (Ultra A) hold aura
        if (player.ultra === 'eyes_a') {
          ctx.globalAlpha = 0.38;
          ctx.fillStyle = '#c496ff';
          drawPixelRing(ctx, px, py, 36, 1, 4, state.tick & 7);
        }
        ctx.restore();
      } else if (player.ultra === 'eyes_b') {
        // Monster Style (Ultra B): passive outward psychic enemy-repel rings
        ctx.save();
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const phase = wrapMod(this.renderTimeSec * 0.95 + rIdx * 0.5, 1);
          const repelR = Math.round(14 + phase * 62);
          ctx.globalAlpha = (1 - phase) * 0.36;
          ctx.fillStyle = rIdx === 0 ? '#b894ff' : '#7ac8ff';
          drawPixelRing(ctx, px, py, repelR, 1, 6, state.tick & 7);
        }
        ctx.restore();
      }
    }

    // Strong Spirit white halo floating cleanly ABOVE player's head (matching 17_throne_hall & 18_throne_idle!)
    if (player.strongSpiritReady && player.alive) {
      const haloDef = this.sprites.getSprite('sprStrongSpirit');
      // Steam sprStrongSpirit has oy=26 (ring at localY=-15..-10); Built-In has oy=10 (ring at localY=-8..-4).
      const haloOffsetY = haloDef && haloDef.originY >= 20 ? 3 : 10;
      const drewHalo = this.sprites.draw(ctx, 'sprStrongSpirit', px, py - haloOffsetY, {
        frame: Math.floor(state.tick * 0.25),
        alpha: 0.9,
        pixelSnap,
      });
      if (!drewHalo) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        drawPixelRing(ctx, px, py - 13, 5, 1);
        ctx.restore();
      }
    }

    // Aiming direction: behind player when aiming UP (sin(aimAngle) < 0), in front when aiming DOWN
    const aimingUp = Math.sin(player.aimAngle) < 0;
    const activeSlotIdx = player.activeSlot;
    const offhandSlotIdx: 0 | 1 = activeSlotIdx === 0 ? 1 : 0;
    const activeWeaponSlot = player.weapons[activeSlotIdx];
    const offhandSlot = player.mutant === 'steroids' ? player.weapons[offhandSlotIdx] : null;

    const drawHeldWeapon = (
      slot: PlayerState['weapons'][0] | null,
      slotIdx: 0 | 1,
      isOffhand: boolean,
    ): void => {
      if (!slot || !player.alive) return;
      const wepDef = this.data.getWeapon(slot.weaponId);
      const isMelee = wepDef?.ammoType === 'melee' || wepDef?.projectileKind === 'melee_slash';
      const wepSpr = resolveWeaponSpriteName(slot.weaponId, this.data);
      const kick = slot.kickOffset || 0;
      const flipY = Math.cos(player.aimAngle) < 0;

      // Authentic Nuclear Throne weapon holding with separated Steroids dual-wield anchors:
      // - Melee weapons rest cocked at ±1.48 rad and snap across independently per hand!
      // - Ranged weapons kick cleanly along recoil vector with upward barrel tilt.
      const baseAnchor = this.computeHeldWeaponAnchor(player, px, py, isOffhand, isMelee ? 0 : kick);
      let drawAngle = player.aimAngle;
      let anchorX = baseAnchor.x;
      let anchorY = baseAnchor.y;
      let wepFlipY = flipY;
      if (isMelee) {
        const side: 1 | -1 = slot.meleeSwingSide ?? this.meleeSwingSides[slotIdx];
        const swingAnim = this.meleeSwingAnims[slotIdx];
        const swingSweep = (1 - swingAnim * 1.15) * 1.48 * side;
        drawAngle = player.aimAngle + swingSweep;
        anchorX = baseAnchor.x + Math.cos(player.aimAngle) * (2 + swingAnim * 3);
        anchorY = baseAnchor.y + Math.sin(player.aimAngle) * (2 + swingAnim * 3);
        wepFlipY = side < 0;
      } else {
        // Snappy upward recoil flip on firing (classic Vlambeer gun feel!)
        const recoilTilt = kick > 0 ? (flipY ? 1 : -1) * Math.min(0.28, kick * 0.032) : 0;
        drawAngle = player.aimAngle + recoilTilt;
      }

      const drewWep = this.sprites.draw(ctx, wepSpr, anchorX, anchorY, {
        frame: 0,
        rotation: drawAngle,
        flipY: wepFlipY,
        pixelSnap,
      });
      if (!drewWep) {
        ctx.save();
        ctx.translate(Math.round(anchorX), Math.round(anchorY));
        ctx.rotate(drawAngle);
        ctx.fillStyle = '#141018';
        ctx.fillRect(0, -2, 11, 5);
        ctx.fillStyle = '#c8d0db';
        ctx.fillRect(1, -1, 9, 3);
        ctx.restore();
      }

      // Subtle cursed purple aura / golden weapon glint cues on equipped weapon
      if (slot.cursed) {
        ctx.save();
        ctx.fillStyle = '#c94aff';
        ctx.globalAlpha = 0.72;
        const cx = anchorX + Math.cos(drawAngle) * 5 + Math.sin(this.renderTimeSec * 9) * 2;
        const cy = anchorY + Math.sin(drawAngle) * 5 + Math.cos(this.renderTimeSec * 11) * 2;
        ctx.fillRect(Math.round(cx), Math.round(cy), 2, 2);
        ctx.restore();
      } else if (wepDef?.golden && Math.floor(this.renderTimeSec * 6) % 3 === 0) {
        ctx.save();
        ctx.fillStyle = '#fff5a8';
        ctx.globalAlpha = 0.85;
        const gx = Math.round(anchorX + Math.cos(drawAngle) * 7);
        const gy = Math.round(anchorY + Math.sin(drawAngle) * 7 - 2);
        ctx.fillRect(gx - 1, gy, 3, 1);
        ctx.fillRect(gx, gy - 1, 1, 3);
        ctx.restore();
      }
    };

    if (aimingUp) {
      drawHeldWeapon(offhandSlot, offhandSlotIdx, true);
      drawHeldWeapon(activeWeaponSlot, activeSlotIdx, false);
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

    // Player body: on Steam pack, let native *Hurt sprites drive hurt presentation at crisp 1.0x integer scale!
    const isSteam = this.bundle.sourceMode === 'steam';
    const hasNativeHurtSprite = charSprite.endsWith('Hurt');
    const blinkAlpha =
      player.iframes > 0 && player.hurtFlashTicks === 0 && Math.floor(player.iframes / 2) % 2 === 0
        ? 0.55
        : 1;
    const rollRotation = player.rolling ? (state.tick * 0.65 * player.facing) : 0;
    const playerWhiteFlash = player.hurtFlashTicks >= 3 && !(isSteam && hasNativeHurtSprite);
    const playerScaleX = 1;
    const playerScaleY = 1;
    const playerFrame =
      isSteam && hasNativeHurtSprite && player.hurtFlashTicks > 0
        ? player.hurtFlashTicks >= 4
          ? 0
          : player.hurtFlashTicks >= 2
            ? 1
            : 2
        : Math.floor(player.animFrame);

    // Odinfall-style translucent dash/roll pixel afterimages!
    if (player.alive && player.rolling && state.tick - this.lastDashGhostTick >= 2) {
      this.lastDashGhostTick = state.tick;
      if (this.dashGhosts.length > 8) this.dashGhosts.shift();
      this.dashGhosts.push({
        x: px,
        y: py,
        sprite: charSprite,
        frame: Math.floor(player.animFrame),
        flipX: player.facing === -1,
        tint: player.mutant === 'fish' ? '#52e88a' : '#70e0ff',
        life: 6,
        maxLife: 6,
      });
    }
    for (let i = 0; i < this.dashGhosts.length; i++) {
      const dg = this.dashGhosts[i]!;
      const gAlpha = Math.max(0, (dg.life / dg.maxLife) * 0.42);
      this.sprites.draw(ctx, dg.sprite, dg.x, dg.y, {
        frame: dg.frame,
        flipX: dg.flipX,
        tintColor: dg.tint,
        alpha: gAlpha,
        pixelSnap,
      });
    }

    const drewPlayer = this.sprites.draw(ctx, charSprite, px, py, {
      frame: playerFrame,
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
      drawHeldWeapon(offhandSlot, offhandSlotIdx, true);
      drawHeldWeapon(activeWeaponSlot, activeSlotIdx, false);
    }

    // Crystal Shield dome overlay & sprShieldDisappear shatter animation on release
    if (player.shielding && player.alive) {
      const shieldSpr = player.skin === 'b' && this.sprites.hasSprite('sprShieldB') ? 'sprShieldB' : 'sprShield';
      const drewShield = this.sprites.draw(ctx, shieldSpr, px, py, {
        frame: Math.floor(state.tick * 0.25),
        alpha: 0.85,
        pixelSnap,
      });
      if (!drewShield) {
        ctx.save();
        ctx.fillStyle = 'rgba(190, 90, 255, 0.34)';
        drawPixelDisc(ctx, px, py, 12);
        ctx.fillStyle = '#f0b8ff';
        drawPixelRing(ctx, px, py, 12, 1);
        ctx.restore();
      }
    } else if (this.shieldDisappearTicks > 0 && player.alive && player.mutant === 'crystal') {
      const disSpr =
        player.skin === 'b' && this.sprites.hasSprite('sprShieldBDisappear')
          ? 'sprShieldBDisappear'
          : 'sprShieldDisappear';
      const disFrac = 1 - Math.max(0, Math.min(1, this.shieldDisappearTicks / 8));
      const disFrame = Math.min(5, Math.floor(disFrac * 6));
      const drewDis = this.sprites.draw(ctx, disSpr, px, py, {
        frame: disFrame,
        alpha: Math.max(0.25, 1 - disFrac * 0.65),
        pixelSnap,
      });
      if (!drewDis) {
        ctx.save();
        ctx.globalAlpha = 1 - disFrac;
        ctx.fillStyle = '#f0b8ff';
        drawPixelRing(ctx, px, py, Math.max(4, Math.round(13 * (1 - disFrac * 0.5))), 1, 4, state.tick & 7);
        ctx.restore();
      }
    }

    // Boiling Veins active ember aura when hp <= 4 (explosion & fire immunity active!)
    if (player.alive && player.hp <= 4 && player.mutations.includes('boiling_veins')) {
      ctx.save();
      for (let e = 0; e < 4; e++) {
        const phase = wrapMod(this.renderTimeSec * 2.6 + e * 0.27, 1);
        const ex = Math.round(px + Math.sin(this.renderTimeSec * 5 + e * 1.9) * 6);
        const ey = Math.round(py + 4 - phase * 14);
        ctx.globalAlpha = (1 - phase) * 0.85;
        ctx.fillStyle = e % 2 === 0 ? '#ff8a2b' : '#ffe047';
        ctx.fillRect(ex, ey, 2, 2);
      }
      ctx.restore();
    }

    // Chicken Headless animated arterial blood spurt fountain (and collar mask if headless sprite absent)
    if (player.headlessTicks > 0 && player.alive) {
      ctx.save();
      if (!usingHeadlessSprite) {
        ctx.fillStyle = '#240b10';
        ctx.fillRect(Math.round(px - 3), Math.round(py - 9), 6, 4);
      }
      ctx.fillStyle = '#ff2a3c';
      for (let d = 0; d < 3; d++) {
        const phase = wrapMod(this.renderTimeSec * 6.5 + d * 0.33, 1);
        const dx = Math.round(px + (d - 1) * (1.8 + phase * 3.2));
        const dy = Math.round(py - 7 - Math.sin(phase * Math.PI) * 5 + phase * 3);
        ctx.globalAlpha = 1 - phase * 0.6;
        ctx.fillRect(dx, dy, 2, 2);
      }
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
    alpha: number = 1,
  ): void {
    const def = this.data.getEnemy(enemy.defId);
    const moving = Math.hypot(enemy.vx, enemy.vy) > 0.25;
    const prefix = resolveEnemySpritePrefix(enemy.defId, enemy.bossId);
    const isSteam = this.bundle.sourceMode === 'steam';
    const isLilHunterSpiral = enemy.bossId === 'lil_hunter' && enemy.aiState === 'death_spiral';

    let sprName: string;
    if (isLilHunterSpiral) {
      sprName = this.sprites.hasSprite('sprLilHunterHurt')
        ? 'sprLilHunterHurt'
        : this.sprites.hasSprite('sprLilHunterDead')
          ? 'sprLilHunterDead'
          : 'sprLilHunter';
    } else if (enemy.aiState === 'sleep' && enemy.bossId === 'nuclear_throne' && this.sprites.hasSprite('sprNothingOff')) {
      sprName = 'sprNothingOff';
    } else if (enemy.aiState === 'sleep' && enemy.bossId === 'big_dog' && this.sprites.hasSprite('sprScrapBossSleep')) {
      sprName =
        enemy.hurtFlashTicks > 0 && this.sprites.hasSprite('sprScrapBossSleepHurt')
          ? 'sprScrapBossSleepHurt'
          : 'sprScrapBossSleep';
    } else if (def) {
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
    if (enemy.bossId === 'nuclear_throne' && sprName === 'sprNothingBeam') {
      sprName = this.sprites.hasSprite('sprNothingFire') ? 'sprNothingFire' : 'sprNothingOn';
    }
    if (!this.sprites.hasSprite(sprName)) {
      sprName = `${prefix}Idle`;
    }

    const elevOffset = enemy.elevated ? Math.max(0, enemy.elevZ ?? 14) : 0;
    const drawY = ey - elevOffset;
    const fx = this.enemyFx.get(enemy.id);

    // On 7-3 Nuclear Throne hurt, flash the ENTIRE composite silhouette pure solid white (part_4.mp4 00:16-00:19)!
    // Keep 1x integer scale (zero mixel squash/stretch on 1x pixel grid).
    const hasNativeHurt = sprName.endsWith('Hurt') || sprName.endsWith('SleepHurt');
    const isThroneHurt = enemy.bossId === 'nuclear_throne' && enemy.hurtFlashTicks > 0;
    const pureWhiteFlash = isThroneHurt || (enemy.hurtFlashTicks >= 3 && !(isSteam && hasNativeHurt));
    const impactScaleX = 1;
    const impactScaleY = 1;
    const tremorX =
      enemy.hurtFlashTicks >= 2
        ? ((tick + enemy.id) % 2 === 0 ? 1 : -1)
        : TELEGRAPH_AI_STATES.has(enemy.aiState) && enemy.aiTimer <= 8
          ? ((tick + enemy.id) % 2 === 0 ? 1 : -1)
          : 0;

    // Composite Steam's sprNothingBack + animated sprNothingLeg + sprNothingPipes behind Nuclear Throne!
    if (enemy.bossId === 'nuclear_throne') {
      if (this.sprites.hasSprite('sprNothingBack')) {
        this.sprites.draw(ctx, 'sprNothingBack', ex + tremorX, drawY, {
          frame: 0,
          flashWhite: pureWhiteFlash,
          pixelSnap,
        });
      }
      if (this.sprites.hasSprite('sprNothingLeg') && enemy.aiState !== 'sleep') {
        const legSpeed = moving ? 0.35 : 0.12;
        const legFrameR = Math.floor(tick * legSpeed);
        const legFrameL = legFrameR + 5;
        this.sprites.draw(ctx, 'sprNothingLeg', ex - 60 + tremorX, drawY + 6, {
          frame: legFrameL,
          flipX: true,
          flashWhite: pureWhiteFlash,
          pixelSnap,
        });
        this.sprites.draw(ctx, 'sprNothingLeg', ex + 60 + tremorX, drawY + 6, {
          frame: legFrameR,
          flipX: false,
          flashWhite: pureWhiteFlash,
          pixelSnap,
        });
      }
      if (this.sprites.hasSprite('sprNothingPipes') && enemy.aiState !== 'sleep') {
        this.sprites.draw(ctx, 'sprNothingPipes', ex + tremorX, drawY, {
          frame: 0,
          flashWhite: pureWhiteFlash,
          pixelSnap,
        });
      }
    }

    // Lil' Hunter malfunctioning jetpack fiery exhaust plume behind spinning body during death_spiral!
    let bodyRotation = 0;
    if (isLilHunterSpiral) {
      bodyRotation = (tick + alpha) * 0.78;
      const spd = Math.hypot(enemy.vx, enemy.vy);
      const backX = spd > 0.1 ? -enemy.vx / spd : Math.cos(bodyRotation + Math.PI);
      const backY = spd > 0.1 ? -enemy.vy / spd : Math.sin(bodyRotation + Math.PI);
      const jetX = ex + backX * 8;
      const jetY = drawY + backY * 8;
      if (this.sprites.hasSprite('sprFireLilHunter')) {
        this.sprites.draw(ctx, 'sprFireLilHunter', jetX, jetY, {
          frame: Math.floor(tick * 0.6),
          rotation: Math.atan2(backY, backX),
          pixelSnap,
        });
      }
      ctx.save();
      // Multi-layered fiery jetpack plume & crackling ember sparks
      ctx.fillStyle = '#ff4d1a';
      drawPixelDisc(ctx, jetX + backX * 4, jetY + backY * 4, 5);
      ctx.fillStyle = '#ffae2b';
      drawPixelDisc(ctx, jetX + backX * 2, jetY + backY * 2, 3);
      ctx.fillStyle = '#fff5b8';
      ctx.fillRect(Math.round(jetX) - 1, Math.round(jetY) - 1, 3, 3);
      for (let s = 0; s < 4; s++) {
        const ang = bodyRotation * 1.4 + s * 1.57;
        const sd = 8 + ((tick + s * 3) % 6);
        ctx.fillStyle = s % 2 === 0 ? '#ffe047' : '#ff6426';
        ctx.fillRect(Math.round(ex + Math.cos(ang) * sd), Math.round(drawY + Math.sin(ang) * sd), 2, 2);
      }
      ctx.restore();
    }

    const enemyFrame =
      isSteam && hasNativeHurt && enemy.hurtFlashTicks > 0
        ? enemy.hurtFlashTicks >= 3
          ? 0
          : enemy.hurtFlashTicks >= 2
            ? 1
            : 2
        : Math.floor(enemy.animFrame || tick * 0.2);

    const drew = this.sprites.draw(ctx, sprName, ex + tremorX, drawY, {
      frame: enemyFrame,
      flipX: !isLilHunterSpiral && enemy.facing === -1,
      scaleX: impactScaleX,
      scaleY: impactScaleY,
      rotation: bodyRotation,
      flashWhite: pureWhiteFlash || (isLilHunterSpiral && (tick & 3) === 0),
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

    // Enemy held weapon if defined (hidden during Lil' Hunter out-of-control death spiral)
    if (!isLilHunterSpiral && def?.sprites.gun && this.sprites.hasSprite(def.sprites.gun)) {
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

    // Plant Snare crisp pixel-stepped vine wrap when rooted
    if (enemy.snaredTicks > 0) {
      ctx.save();
      const wrapR = Math.max(7, Math.round(enemy.radius + 1));
      ctx.fillStyle = '#143818';
      drawPixelRing(ctx, ex, ey + 2, wrapR + 1, 1);
      ctx.fillStyle = '#52e864';
      drawPixelRing(ctx, ex, ey + 2, wrapR, 1);
      // Small thorny pixel knots at left & right of rooted feet
      ctx.fillStyle = '#9dff9e';
      ctx.fillRect(Math.round(ex - wrapR), Math.round(ey + 1), 2, 2);
      ctx.fillRect(Math.round(ex + wrapR - 1), Math.round(ey + 2), 2, 2);
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
        const urgent = enemy.aiTimer <= 10;
        const lineColor =
          enemy.defId === 'lightning_crystal'
            ? (urgent ? '#c8f8ff' : '#68d8ff')
            : (urgent ? '#ff7840' : '#e83e18');

        // Razor-sharp 1px Nuclear Throne sniper sightline matching 06_scrapyard_3_3.png (zero blurry outer glow!)
        ctx.save();
        ctx.fillStyle = lineColor;
        drawPixelLine(ctx, ex, drawY, endX, endY, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(endX), Math.round(endY), 1, 1);
        ctx.restore();
      } else if (enemy.bossId !== 'nuclear_throne') {
        const pulse = 0.5 + 0.5 * Math.sin(this.renderTimeSec * 32 + enemy.id);
        const isCharge = enemy.aiState === 'charge' || enemy.bossId === 'big_bandit' || enemy.defId === 'snowbot';
        if (isCharge) {
          const rayDist = raycastWallDistance(map, ex, drawY, enemy.aimAngle, 96);
          ctx.save();
          ctx.fillStyle = '#ff5238';
          for (let d = 6; d < rayDist; d += 6) {
            const dx = Math.round(ex + Math.cos(enemy.aimAngle) * d);
            const dy = Math.round(drawY + Math.sin(enemy.aimAngle) * d);
            ctx.fillRect(dx, dy, 2, 1);
          }
          ctx.restore();
        }
        // Crisp 1x pre-attack telegraph glint star at weapon/muzzle tip (zero blurry glow blob!)
        const muzzleDist = Math.max(6, enemy.radius * 0.85);
        const gx = Math.round(ex + Math.cos(enemy.aimAngle) * muzzleDist);
        const gy = Math.round(drawY + Math.sin(enemy.aimAngle) * muzzleDist);
        const isVenom = enemy.defId === 'scorpion' || enemy.defId === 'gold_scorpion';
        const glintCol = isVenom ? '#8cff52' : '#ffe047';
        const armLen = Math.round(3 + pulse * 2);
        ctx.save();
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
   * Renders Steam pack's ornate `sprCarpet` (42x1000, ox=21, oy=-80) down the 7-3 Throne Hall
   * BEFORE walls, strictly clipped in Y to [minTy * ts, (maxTy + 1) * ts] so ZERO carpet bleeds
   * over the south Palace wall into the black void!
   */
  private renderThroneHallCarpet(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    pixelSnap: boolean,
  ): void {
    const sprDef = this.sprites.getSprite('sprCarpet');
    if (state.areaCode !== '7-3' || !this.sprites.hasSprite('sprCarpet') || !sprDef || sprDef.height < 200) return;
    const map = state.map;
    const ts = map.tileSize || TILE_SIZE;
    let minTx = map.width;
    let maxTx = -1;
    let minTy = map.height;
    let maxTy = -1;
    for (let ty = 0; ty < map.height; ty++) {
      const row = ty * map.width;
      for (let tx = 0; tx < map.width; tx++) {
        if (map.tiles[row + tx] === TileType.Carpet) {
          if (tx < minTx) minTx = tx;
          if (tx > maxTx) maxTx = tx;
          if (ty < minTy) minTy = ty;
          if (ty > maxTy) maxTy = ty;
        }
      }
    }
    if (maxTx < minTx || maxTy < minTy) return;
    const centerX = ((minTx + maxTx + 1) * 0.5) * ts;
    const clipTop = minTy * ts;
    const clipBottom = (maxTy + 1) * ts;
    const clipH = clipBottom - clipTop;
    if (clipH <= 0) return;

    // sprCarpet has oy = -80 in NT data.win, so drawing at minTy * ts + oy aligns its top edge onto minTy
    const topY = clipTop + (sprDef.originY < 0 ? sprDef.originY : 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.floor(centerX - 32), clipTop, 64, clipH);
    ctx.clip();
    this.sprites.draw(ctx, 'sprCarpet', centerX, topY, { frame: 0, pixelSnap });
    ctx.restore();
  }

  /**
   * Renders the pulsing emerald warning column down the 7-3 Palace carpet during
   * the Krunked Throne's Mega-Beam telegraph ('tell'). The active firing beam itself
   * is rendered as ONE cohesive multi-layer column in Layer 5 (`renderThroneMegaBeamColumn`).
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

      const bPos = lerpPosSafe(boss.prevX, boss.prevY, boss.x, boss.y, alpha, 56);
      const bx = bPos.x;
      const by = bPos.y;
      const halfW = 22;
      const startY = by + 20;
      const maxH = Math.min(340, Math.max(120, state.map.height * (state.map.tileSize || TILE_SIZE) - startY - 16));
      const pulse = 0.5 + 0.5 * Math.sin(this.renderTimeSec * 24);

      ctx.save();
      if (boss.aiState === 'tell') {
        // Pulsing emerald danger corridor across the 7-3 carpet
        ctx.fillStyle = `rgba(56, 255, 118, ${(0.10 + 0.12 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - halfW), Math.round(startY), halfW * 2, Math.round(maxH));

        // Inner center lane warning band
        ctx.fillStyle = `rgba(140, 255, 175, ${(0.08 + 0.10 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - 10), Math.round(startY), 20, Math.round(maxH));

        // Twin glowing boundary rails with crisp dark contrast edge
        ctx.fillStyle = 'rgba(8, 28, 16, 0.72)';
        ctx.fillRect(Math.round(bx - halfW - 1), Math.round(startY), 1, Math.round(maxH));
        ctx.fillRect(Math.round(bx + halfW), Math.round(startY), 1, Math.round(maxH));
        ctx.fillStyle = `rgba(92, 255, 145, ${(0.55 + 0.35 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - halfW), Math.round(startY), 2, Math.round(maxH));
        ctx.fillRect(Math.round(bx + halfW - 2), Math.round(startY), 2, Math.round(maxH));

        // Crisp pixel-stepped scrolling emerald danger chevrons marching down the carpet
        const scrollOffset = Math.floor(wrapMod(this.renderTimeSec * 120, 24));
        for (let dy = scrollOffset; dy < maxH - 12; dy += 24) {
          const cy = Math.round(startY + dy);
          ctx.fillStyle = 'rgba(8, 32, 16, 0.65)';
          drawPixelLine(ctx, bx - halfW + 5, cy + 1, bx, cy + 9, 2);
          drawPixelLine(ctx, bx, cy + 9, bx + halfW - 5, cy + 1, 2);
          ctx.fillStyle = `rgba(175, 255, 195, ${(0.55 + 0.35 * pulse).toFixed(3)})`;
          drawPixelLine(ctx, bx - halfW + 5, cy, bx, cy + 8, 1);
          drawPixelLine(ctx, bx, cy + 8, bx + halfW - 5, cy, 1);
        }

        // Crisp pixel-hard emerald charging emitter core at Throne cannon (zero blurry glow!)
        ctx.fillStyle = '#38d848';
        drawPixelDisc(ctx, bx, startY, Math.round(5 + pulse * 3));
        ctx.fillStyle = '#ffffff';
        drawPixelDisc(ctx, bx, startY, Math.round(2 + pulse * 2));
      } else {
        // Firing phase: tight subtle emerald wash strictly inside the red carpet beneath the 22px beam column
        ctx.fillStyle = `rgba(28, 195, 72, ${(0.16 + 0.06 * pulse).toFixed(3)})`;
        ctx.fillRect(Math.round(bx - 15), Math.round(startY), 30, Math.round(maxH));
      }
      ctx.restore();
    }
  }

  /**
   * Renders the Krunked Throne Mega-Beam as ONE cohesive continuous multi-layer energy column
   * from the Throne muzzle down through all active `sprNothingBeam` projectiles:
   * dark-emerald crackling sheath -> bright emerald -> pulsing white-hot core + animated energy rings
   * + Throne emitter flare + carpet scorch decals + outward pixel sparks (ZERO striped lanes/rungs!).
   */
  private renderThroneMegaBeamColumn(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    pixelSnap: boolean,
    alpha: number,
  ): void {
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let count = 0;
    let sampleAngle = Math.PI * 0.5;
    let sampleX = 0;
    let sampleY = 0;

    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i]!;
      if (p.sprite !== 'sprNothingBeam') continue;
      const pos = lerpPosSafe(p.prevX, p.prevY, p.x, p.y, alpha, 110);
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
      sumX += pos.x;
      sampleX = pos.x;
      sampleY = pos.y;
      sampleAngle = p.angle;
      count += 1;
    }

    let throneBoss: EnemyEntity | null = null;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (e.bossId === 'nuclear_throne' && e.hp > 0) {
        throneBoss = e;
        break;
      }
    }

    const throneFiring = throneBoss !== null && throneBoss.aiState === 'fire';
    if (count === 0 && !throneFiring) return;

    let beamX: number;
    let topY: number;
    let botY: number;
    if (throneBoss) {
      const bPos = lerpPosSafe(throneBoss.prevX, throneBoss.prevY, throneBoss.x, throneBoss.y, alpha, 56);
      beamX = bPos.x;
      topY = bPos.y + 22;
      botY = count > 0 ? Math.max(topY + 40, maxY + 14) : topY + 160;
    } else {
      beamX = count > 0 ? sumX / count : sampleX;
      topY = minY - 12;
      botY = maxY + 12;
    }

    const ix = Math.round(beamX);
    const iTop = Math.round(topY - 4);
    const iBot = Math.round(botY);
    const beamH = Math.max(24, iBot - iTop);
    const t = this.renderTimeSec;
    const outerHalfW = 11; // Crisp uniform 22px vertical column matching 19_throne_beam.png!
    const bandHalfW = 9;
    const coreHalfW = 7;

    ctx.save();
    // 1. Razor-clean, straight, uniform-width vertical column (~22px wide):
    //    crisp #38e838 outer green edges -> bright #e8ff90 lime-white band -> blazing #ffffff center core!
    ctx.fillStyle = '#38e838';
    ctx.fillRect(ix - outerHalfW, iTop, outerHalfW * 2, beamH);
    ctx.fillStyle = '#e8ff90';
    ctx.fillRect(ix - bandHalfW, iTop, bandHalfW * 2, beamH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ix - coreHalfW, iTop, coreHalfW * 2, beamH);

    // 2. Unrotated sprNothingBeam core texture clipped strictly to column width (preserves rot=0 contract!)
    const beamRot = sampleAngle - Math.PI * 0.5;
    if (this.sprites.hasSprite('sprNothingBeam')) {
      const beamFrame = Math.floor(state.tick * 0.5);
      const stampY = throneBoss ? iTop + Math.min(beamH - 12, 24) : Math.round(sampleY);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix - outerHalfW, iTop, outerHalfW * 2, beamH);
      ctx.clip();
      this.sprites.draw(ctx, 'sprNothingBeam', ix, stampY, {
        frame: beamFrame,
        rotation: beamRot,
        alpha: 0.22,
        pixelSnap,
      });
      ctx.restore();
    }

    // 3. Crisp vertical center pulse streaks & hollow neon-green energy capsules matching 19_throne_beam.png
    const pulseX = ix + (((state.tick & 1) === 0) ? -2 : 2);
    ctx.fillStyle = '#f2ffd8';
    ctx.fillRect(pulseX, iTop + 2, 1, Math.max(1, beamH - 4));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ix - 1, iTop + 2, 2, Math.max(1, beamH - 4));

    const capSpacing = 36;
    const capScroll = Math.floor(wrapMod(t * 240, capSpacing));
    for (let dy = capScroll; dy < beamH - 10; dy += capSpacing) {
      const cy = iTop + dy;
      const laneIdx = Math.floor(dy / capSpacing);
      const cxOff = ((laneIdx * 7 + (state.tick >> 2)) % 9) - 4;
      ctx.fillStyle = '#58f038';
      ctx.fillRect(ix + cxOff - 2, cy, 4, 8);
      ctx.fillStyle = '#e8ff90';
      ctx.fillRect(ix + cxOff - 1, cy + 1, 2, 6);
    }

    // 4. Clean flush semicircular emitter mouth cap at iTop (NEVER wider than the 22px column!)
    if (throneBoss) {
      for (let dy = -outerHalfW; dy <= 0; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, outerHalfW * outerHalfW - dy * dy)) + 0.35);
        ctx.fillStyle = '#38e838';
        ctx.fillRect(ix - span, iTop + dy, span * 2 + 1, 1);
      }
      for (let dy = -bandHalfW; dy <= 0; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, bandHalfW * bandHalfW - dy * dy)) + 0.35);
        ctx.fillStyle = '#e8ff90';
        ctx.fillRect(ix - span, iTop + dy + 1, span * 2 + 1, 1);
      }
      for (let dy = -coreHalfW; dy <= 0; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, coreHalfW * coreHalfW - dy * dy)) + 0.35);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ix - span, iTop + dy + 2, span * 2 + 1, 1);
      }
      // Small bright lime center core dot right inside the emitter mouth (matches 19_throne_beam.png!)
      ctx.fillStyle = '#b8f538';
      ctx.fillRect(ix - 2, iTop - 1, 4, 4);
    }

    // 5. Crisp compact tapered leading edge at iBot (no oversized round blob!)
    ctx.fillStyle = '#38e838';
    ctx.fillRect(ix - bandHalfW, iBot, bandHalfW * 2, 2);
    ctx.fillStyle = '#e8ff90';
    ctx.fillRect(ix - coreHalfW, iBot, coreHalfW * 2, 1);

    // 6. Small crisp floating green & white pixel sparks drifting off both beam edges
    for (let s = 0; s < 10; s++) {
      const side = (s & 1) === 0 ? -1 : 1;
      const prog = wrapMod(t * (2.2 + (s % 3) * 0.5) + s * 0.19, 1);
      const sy = iTop + ((s * 31 + state.tick * 9) % Math.max(16, beamH));
      const sx = ix + side * (outerHalfW + 1 + Math.round(prog * 8));
      ctx.fillStyle = s % 3 === 0 ? '#ffffff' : '#58f038';
      ctx.fillRect(sx, Math.round(sy), s % 2 === 0 ? 2 : 1, 2);
    }
    ctx.restore();
  }

  private renderProjectile(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    proj: ProjectileEntity,
    px: number,
    py: number,
    tick: number,
    pixelSnap: boolean,
    alpha: number,
  ): void {
    // 1. Melee Slash arcs (compensate negative originX on sprEnergySlash/sprLightningSlash + honor slot.meleeSwingSide!)
    if (proj.kind === 'melee_slash') {
      const lifeFrac = proj.maxLifeTicks > 0 ? proj.lifeTicks / proj.maxLifeTicks : 1;
      const reach = proj.meleeReach ?? 24;
      const arcRad = ((proj.meleeArcDeg ?? 110) * Math.PI) / 180;
      const slashName = proj.sprite || 'sprSlash';
      const slashDef = this.sprites.getSprite(slashName);
      // Clamp frame strictly to 0..2 so sprLightningSlash's 4th blank frame never flashes empty
      const slashFrame = Math.min(2, Math.max(0, Math.floor((1 - lifeFrac) * 3)));

      // Match swing flip side to the wielding slot's meleeSwingSide (NOT proj.id & 1!)
      let swingSide: 1 | -1 = this.meleeSwingSide;
      if (proj.team === 'player') {
        const w0 = state.player.weapons[0];
        const w1 = state.player.weapons[1];
        const activeSlot = state.player.weapons[state.player.activeSlot];
        const w0Match = Boolean(proj.weaponId && w0?.weaponId === proj.weaponId);
        const w1Match = Boolean(proj.weaponId && w1?.weaponId === proj.weaponId);
        if (w0Match && w1Match) {
          const picked = (w1?.lastFiredTick ?? -1) > (w0?.lastFiredTick ?? -1) ? w1 : w0;
          if (picked?.meleeSwingSide !== undefined) swingSide = picked.meleeSwingSide;
        } else if (w0Match && w0?.meleeSwingSide !== undefined) {
          swingSide = w0.meleeSwingSide;
        } else if (w1Match && w1?.meleeSwingSide !== undefined) {
          swingSide = w1.meleeSwingSide;
        } else if (activeSlot?.meleeSwingSide !== undefined) {
          swingSide = activeSlot.meleeSwingSide;
        } else {
          swingSide = this.meleeSwingSides[state.player.activeSlot];
        }
      } else {
        swingSide = (proj.id & 1) === 1 ? -1 : 1;
      }
      const flipSlashY = swingSide < 0;

      ctx.save();
      ctx.globalAlpha = Math.max(0.38, lifeFrac);
      let drawX = px;
      let drawY = py;
      let slashScale = reach / 18;
      if (slashDef && slashDef.originX <= 4 && slashDef.width >= 32) {
        // Nuclear Throne Steam slash sprites (48x48, ox=0 or -8, oy=24):
        // Compensate negative originX (e.g. sprEnergySlash/sprLightningSlash ox=-8) so arc hugs blade tip!
        slashScale = Math.max(0.9, Math.min(1.25, 0.94 + Math.max(0, reach - 24) * 0.014));
        const negOriginComp = slashDef.originX < 0 ? -slashDef.originX * slashScale : 0;
        const pullback = reach * 0.52 + negOriginComp;
        drawX = px - Math.cos(proj.angle) * pullback;
        drawY = py - Math.sin(proj.angle) * pullback;
      } else if (slashDef && slashDef.width > 0) {
        slashScale = Math.max(0.85, Math.min(1.5, reach / Math.max(18, slashDef.width * 0.85)));
      }

      const drewSlash = this.sprites.draw(ctx, slashName, drawX, drawY, {
        frame: slashFrame,
        rotation: proj.angle,
        flipY: flipSlashY,
        scaleX: slashScale,
        scaleY: slashScale,
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

    // 2. Horror Rad Beam: dynamically scaled by proj.radius (uses Steam sprHorrorBullet / stepped emerald-cyan stream!)
    if (proj.kind === 'rad_beam') {
      const radiusScale = Math.max(0.75, Math.min(1.55, proj.radius / 5.5));
      const beamSpr =
        state.player.skin === 'b' && this.sprites.hasSprite('sprHorrorBBullet')
          ? 'sprHorrorBBullet'
          : 'sprHorrorBullet';
      const tailLen = Math.round(12 + proj.radius * 2.2);
      const tx = px - Math.cos(proj.angle) * tailLen;
      const ty = py - Math.sin(proj.angle) * tailLen;

      ctx.save();
      // Crisp 1x integer-pixel stepped emerald-cyan wake behind the rad projectile (zero blurry strokes!)
      ctx.fillStyle = '#0e4d26';
      drawPixelLine(ctx, tx, ty, px, py, Math.max(3, Math.round(proj.radius * 1.3)));
      ctx.fillStyle = '#38d848';
      drawPixelLine(ctx, tx, ty, px, py, Math.max(2, Math.round(proj.radius * 0.9)));
      ctx.fillStyle = '#ffffff';
      drawPixelLine(ctx, lerp(tx, px, 0.35), lerp(ty, py, 0.35), px, py, Math.max(1, Math.round(proj.radius * 0.4)));

      const drewHorror = this.sprites.draw(ctx, beamSpr, px, py, {
        frame: Math.floor((tick + proj.id) * 0.5),
        rotation: proj.angle,
        scaleX: radiusScale,
        scaleY: radiusScale,
        pixelSnap,
      });
      if (!drewHorror) {
        const coreR = Math.max(3, Math.round(proj.radius * 0.85));
        ctx.fillStyle = '#0d361d';
        drawPixelDisc(ctx, px, py, coreR + 1);
        ctx.fillStyle = '#38d848';
        drawPixelDisc(ctx, px, py, coreR);
        ctx.fillStyle = '#ffffff';
        drawPixelDisc(ctx, px, py, Math.max(1, Math.round(coreR * 0.5)));
      }
      ctx.restore();
      return;
    }

    // 3. Hitscan Lasers & Lightning: Crisp 1x pixel-stepped bright neon-green beam (#38d848) + pure-white core
    //    + pure-white crisp circular/cloud pixel impact splash at terminus (matches 05_oasis, 12_jungle, 13_frozen_5_3, 14_labs_6_1!)
    if (proj.kind === 'laser' || proj.kind === 'enemy_laser' || proj.kind === 'lightning') {
      const lifeFrac = proj.maxLifeTicks > 0 ? Math.max(0.2, proj.lifeTicks / proj.maxLifeTicks) : 1;
      let ox: number;
      let oy: number;
      if (proj.beamOriginX !== undefined && proj.beamOriginY !== undefined) {
        ox = proj.beamOriginX;
        oy = proj.beamOriginY;
      } else {
        let tailLen = proj.kind === 'lightning' ? 24 : 26;
        if (proj.team === 'player') {
          const distFromPlayer = Math.hypot(px - state.player.x, py - state.player.y);
          tailLen = Math.max(4, Math.min(tailLen, distFromPlayer - 6));
        }
        ox = px - Math.cos(proj.angle) * tailLen;
        oy = py - Math.sin(proj.angle) * tailLen;
      }

      const isIonCannon = proj.weaponId === 'ion_cannon';
      const isHeavyLaser = proj.weaponId === 'laser_cannon' || isIonCannon;

      ctx.save();
      if (proj.kind === 'lightning') {
        const perpX = -Math.sin(proj.angle);
        const perpY = Math.cos(proj.angle);
        const j1 = Math.sin(tick * 1.7 + proj.id * 3.1) * 3.5;
        const j2 = Math.cos(tick * 2.1 + proj.id * 1.9) * 3.5;
        const m1x = lerp(ox, px, 0.35) + perpX * j1;
        const m1y = lerp(oy, py, 0.35) + perpY * j1;
        const m2x = lerp(ox, px, 0.7) + perpX * j2;
        const m2y = lerp(oy, py, 0.7) + perpY * j2;
        ctx.fillStyle = '#58d8ff';
        drawPixelLine(ctx, ox, oy, m1x, m1y, 3);
        drawPixelLine(ctx, m1x, m1y, m2x, m2y, 3);
        drawPixelLine(ctx, m2x, m2y, px, py, 3);
        ctx.fillStyle = '#ffffff';
        drawPixelLine(ctx, ox, oy, m1x, m1y, 1);
        drawPixelLine(ctx, m1x, m1y, m2x, m2y, 1);
        drawPixelLine(ctx, m2x, m2y, px, py, 1);
      } else {
        // Thick crisp bright neon-green outer beam (#38d848) + solid pure-white inner core (#ffffff)
        const outerColor = '#38d848';
        const baseOuter = isHeavyLaser ? 7 : 5;
        const outerW = Math.max(2, Math.round(baseOuter * (0.4 + 0.6 * lifeFrac)));
        const coreW = outerW >= 5 ? Math.max(2, outerW - 2) : Math.max(1, outerW - 2);

        ctx.fillStyle = outerColor;
        drawPixelLine(ctx, ox, oy, px, py, outerW);

        ctx.fillStyle = '#ffffff';
        drawPixelLine(ctx, ox, oy, px, py, coreW);

        // Crisp muzzle origin spark
        const ix = Math.round(px);
        const iy = Math.round(py);
        ctx.fillStyle = '#ffffff';
        drawPixelDisc(ctx, Math.round(ox), Math.round(oy), Math.max(1, Math.round(2.5 * lifeFrac)));

        // Iconic pure-white crisp circular/cloud pixel impact splash at the laser terminus!
        const splashR = Math.max(2, Math.round((isHeavyLaser ? 8 : 6) * (0.35 + 0.65 * lifeFrac)));
        const h1 = ((proj.id * 37) % 5) - 2;
        const h2 = ((proj.id * 73) % 5) - 2;
        ctx.fillStyle = '#ffffff';
        drawPixelDisc(ctx, ix, iy, splashR);
        if (splashR >= 3) {
          drawPixelDisc(ctx, ix - Math.round(splashR * 0.65) + h1, iy + h2, Math.max(2, Math.round(splashR * 0.68)));
          drawPixelDisc(ctx, ix + Math.round(splashR * 0.65) - h2, iy - h1, Math.max(2, Math.round(splashR * 0.62)));
          drawPixelDisc(ctx, ix + h2, iy - Math.round(splashR * 0.55), Math.max(2, Math.round(splashR * 0.58)));
        }
        // Tiny crisp white impact flecks flaking off the cloud
        if (lifeFrac > 0.35) {
          ctx.fillRect(ix - splashR - 2, iy + h1, 2, 1);
          ctx.fillRect(ix + splashR + 1, iy - h2, 2, 1);
          ctx.fillRect(ix + h1, iy - splashR - 2, 1, 2);
        }
      }
      ctx.restore();
      return;
    }

    // 4. Crisp 1x integer-pixel motion trails for fast player kinetic/bolt/rocket rounds (ZERO blurry glow blobs!)
    const spd = Math.hypot(proj.vx, proj.vy);
    if (spd > 1.2) {
      const ageTicks = Math.max(0.35, proj.maxLifeTicks - proj.lifeTicks + alpha);
      const dirX = proj.vx / spd;
      const dirY = proj.vy / spd;

      let desiredLen = 0;
      let trailColor = '';
      let trailWidth = 1;

      switch (proj.kind) {
        case 'bullet':
        case 'heavy_bullet':
        case 'shell':
        case 'slug':
        case 'flak':
          desiredLen = Math.min(14, Math.max(5, spd * 0.85));
          trailColor = '#ffe066';
          trailWidth = proj.kind === 'heavy_bullet' || proj.kind === 'slug' ? 2 : 1;
          break;
        case 'bolt':
        case 'splinter':
        case 'toxic_bolt':
        case 'seeking_bolt':
          desiredLen = Math.min(20, Math.max(8, spd * 1.0));
          trailColor = proj.kind === 'toxic_bolt' ? '#58e868' : '#a8ff9e';
          trailWidth = 1;
          break;
        case 'idpd_bullet':
          desiredLen = Math.min(14, Math.max(6, spd * 0.9));
          trailColor = '#60b8ff';
          trailWidth = 1;
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          desiredLen = Math.min(12, Math.max(5, spd * 1.0));
          trailColor = '#ff9838';
          trailWidth = 2;
          break;
        default:
          break;
      }

      if (desiredLen > 0 && trailColor) {
        const len = Math.min(desiredLen, spd * ageTicks);
        const tailX = px - dirX * len;
        const tailY = py - dirY * len;
        ctx.save();
        ctx.fillStyle = trailColor;
        drawPixelLine(ctx, tailX, tailY, px, py, trailWidth);
        ctx.restore();
      }
    }

    // 5. Spinning thrown Chicken weapons (fast tumbling rotation + crisp motion glint!)
    let spriteRotation = proj.angle;
    if (proj.kind === 'thrown_weapon') {
      const spinDir = proj.vx >= 0 ? 1 : -1;
      spriteRotation = proj.angle + (tick + alpha) * 0.72 * spinDir;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ffe896';
      drawPixelRing(ctx, px, py, Math.max(5, Math.round(proj.radius + 1)), 1, 5, (tick * 2) & 7);
      ctx.restore();
    }

    const drew = proj.sprite
      ? this.sprites.draw(ctx, proj.sprite, px, py, {
          frame: Math.floor(tick * 0.4),
          rotation: spriteRotation,
          pixelSnap,
        })
      : false;

    if (!drew) {
      const x = Math.round(px);
      const y = Math.round(py);
      const r = Math.max(2, Math.round(proj.radius));
      // Crisp 1px dark outer pixel disc contour so every projectile pops on bright & dark floors alike
      ctx.fillStyle = '#0c0712';
      drawPixelDisc(ctx, x, y, r + 1);
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
      drawPixelDisc(ctx, x, y, r);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  private renderSmokePuffs(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.smokePuffs.length === 0) return;
    ctx.save();
    // Authentic Nuclear Throne pure OPAQUE crisp pixel-stepped charcoal smoke circles that shrink cleanly!
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const sp = this.smokePuffs[i]!;
      const t = 1 - Math.max(0, Math.min(1, sp.life / Math.max(1, sp.maxLife)));
      const peakR = Math.max(2, Math.min(6, Math.round(sp.endR * 0.65)));
      const shrink = t < 0.14 ? 0.65 + (t / 0.14) * 0.35 : Math.max(0, 1 - (t - 0.14) / 0.86);
      const r = Math.round(peakR * shrink);
      if (r < 1) continue;
      const ix = Math.round(sp.x);
      const iy = Math.round(sp.y);

      // Opaque dark charcoal outer + mid-charcoal core (#28252c / #3a363c), zero blurry alpha fade!
      ctx.fillStyle = '#28252c';
      drawPixelDisc(ctx, ix, iy, r);
      if (r >= 2) {
        ctx.fillStyle = '#3a363c';
        drawPixelDisc(ctx, ix, iy, r - 1);
      }
      if (r >= 3) {
        // Subtle crisp 1px pixel swirl accent matching 06_scrapyard_3_3 / 10_frozen_5_1 smoke puffs
        ctx.fillStyle = '#524b58';
        ctx.fillRect(ix - 1, iy - 1, 2, 1);
      }
    }
    ctx.restore();
  }

  private renderImpactStars(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.impactStars.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.impactStars.length; i++) {
      const st = this.impactStars[i]!;
      const frac = Math.max(0, Math.min(1, st.life / Math.max(0.1, st.maxLife)));
      const r = Math.max(2, Math.round(st.radius * (0.45 + 0.55 * frac)));
      const ix = Math.round(st.x);
      const iy = Math.round(st.y);

      for (let k = 0; k < 4; k++) {
        const a = st.angle + (k * Math.PI) / 2;
        const ex = ix + Math.cos(a) * r;
        const ey = iy + Math.sin(a) * r;
        ctx.fillStyle = '#120b18';
        drawPixelLine(ctx, ix, iy, ex, ey, 3);
      }
      for (let k = 0; k < 4; k++) {
        const a = st.angle + (k * Math.PI) / 2;
        const ex = ix + Math.cos(a) * r;
        const ey = iy + Math.sin(a) * r;
        ctx.fillStyle = st.color;
        drawPixelLine(ctx, ix, iy, ex, ey, 1);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ix - 1, iy - 1, 3, 3);
    }
    ctx.restore();
  }

  /**
   * Screen-space visceral juice:
   * - Low-HP crimson heartbeat vignette (double-beat lub-dub pulse, crisp 1x strips!)
   * - Crisp damage impact border flash
   * - Brief explosion blast sheen & portal warp edge pull
   */
  private renderScreenEffects(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    w: number,
    h: number,
  ): void {
    const player = state.player;

    // 1. Low-HP crimson heartbeat vignette pulse (NEVER trigger for full 2/2 HP Melting!)
    const lowHp =
      player.alive &&
      player.hp > 0 &&
      player.hp < player.maxHp &&
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
      const layers = [
        { thick: 8, a: edgeAlpha * 0.35 },
        { thick: 4, a: edgeAlpha * 0.55 },
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
      ctx.fillStyle = `rgba(255, 232, 175, ${(0.08 * frac).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 4. Portal suction warp pull + NT-style Loading Tip card during portal transition
    // Suppress strictly during mutation/ultra select, game over, and victory so it NEVER ghosts behind menus!
    const suppressPortalCard =
      state.phase === 'mutation_select' ||
      state.phase === 'ultra_select' ||
      state.phase === 'game_over' ||
      state.phase === 'victory_throne';
    if (state.portal.active && state.portal.entered && !suppressPortalCard) {
      const ticksIn = Math.max(state.portal.enterTicks || 0, state.portalTransitionTicks || 0);
      const warp = Math.min(1, Math.max(1, ticksIn) / 24);
      const border = Math.round(6 + warp * 18);
      const target = state.portal.targetArea;
      const borderRgb =
        target === 'vault'
          ? '24, 150, 72'
          : target === '1-?' || target === 'hq-1'
            ? '30, 102, 195'
            : '110, 32, 185';
      ctx.save();
      ctx.fillStyle = `rgba(${borderRgb}, ${(0.22 + warp * 0.38).toFixed(3)})`;
      ctx.fillRect(0, 0, w, border);
      ctx.fillRect(0, h - border, w, border);
      ctx.fillRect(0, border, border, h - border * 2);
      ctx.fillRect(w - border, border, border, h - border * 2);

      // Once player is pulled into the vortex (ticks >= 7), present the classic wasteland loading card & tip!
      if (ticksIn >= 7) {
        const cardAlpha = Math.min(1, (ticksIn - 6) / 7);
        const targetArea = this.data.getArea(state.portal.targetArea);
        const targetBiome = targetArea?.biome ?? state.biome;
        const targetCode =
          state.portal.nextLoop > 0
            ? `L${state.portal.nextLoop} ${state.portal.targetArea}`
            : state.portal.targetArea;
        // Avoid duplicate area codes AND keep Vault title crisp ("CROWN VAULT" instead of "VAULT  CROWN"!)
        const rawName = (targetArea?.name ?? 'WASTELAND').toUpperCase().trim();
        const codeUpper = state.portal.targetArea.toUpperCase();
        let areaTitle: string;
        if (rawName.endsWith(` ${codeUpper}`)) {
          areaTitle = state.portal.nextLoop > 0 ? `L${state.portal.nextLoop} ${rawName}` : rawName;
        } else {
          const cleanName = rawName === codeUpper ? 'WASTELAND' : rawName;
          areaTitle = `${targetCode}  ${cleanName}`;
        }
        const tip = selectLoadingTip(targetBiome, state.portal.targetArea, state.portal.nextLoop, state.seed);

        ctx.globalAlpha = cardAlpha * 0.95;
        ctx.fillStyle = '#0a0712';
        ctx.fillRect(0, 0, w, h);

        ctx.globalAlpha = cardAlpha;
        const cx = Math.round(w * 0.5);
        const cy = Math.round(h * 0.5);

        // Crisp pixel-hard portal emblem disc behind mutant silhouette
        const emblemGlowColor =
          target === 'vault'
            ? 'rgba(72, 235, 130, 0.35)'
            : target === '1-?' || target === 'hq-1'
              ? 'rgba(72, 175, 255, 0.35)'
              : 'rgba(175, 78, 255, 0.35)';
        ctx.fillStyle = emblemGlowColor;
        fillPixelDisc(ctx, cx, cy - 8, 28);
        const mutantDef = this.data.getMutant(state.player.mutant);
        const walkSpr =
          state.player.skin === 'b' && mutantDef.sprites.bWalk && this.sprites.hasSprite(mutantDef.sprites.bWalk)
            ? mutantDef.sprites.bWalk
            : mutantDef.sprites.walk;
        const walkDef = this.sprites.getSprite(walkSpr);
        // Crisp integer scale ONLY (2x for 24x24 mutants, 1x for oversized 48x48 Horror — ZERO 1.5x mixels!)
        const intScale = walkDef && walkDef.height >= 40 ? 1 : 2;
        this.sprites.draw(ctx, walkSpr, cx, cy - 8, {
          frame: Math.floor(state.tick * 0.4),
          scaleX: intScale,
          scaleY: intScale,
          pixelSnap: true,
        });

        this.fonts.draw(ctx, `@pWARPING TO @w${areaTitle}`, cx, cy + 18, 'fntM1', {
          align: 'center',
          outline: true,
        });
        this.fonts.draw(ctx, `@d${tip}`, cx, cy + 34, 'fntSmall', {
          align: 'center',
          maxWidth: w - 36,
          outline: true,
        });
      }
      ctx.restore();
    }
  }

  private renderMuzzleFlashes(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.muzzleFlashes.length === 0) return;
    ctx.save();
    // Pure crisp opaque 1x pixel muzzle flash discs & spikes (ZERO blurry lighter blobs!)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      const mf = this.muzzleFlashes[i]!;
      const frac = Math.max(0, Math.min(1, mf.life / Math.max(0.1, mf.maxLife)));
      const cosA = Math.cos(mf.angle);
      const sinA = Math.sin(mf.angle);
      const tipX = Math.round(mf.x + cosA * Math.round(3 * frac));
      const tipY = Math.round(mf.y + sinA * Math.round(3 * frac));
      const discR = Math.max(2, Math.round(Math.min(5, mf.radius * 0.4) * frac));
      const tongueLen = Math.max(3, Math.round(6 * frac));

      ctx.fillStyle = frac > 0.55 ? '#ffffff' : mf.color;
      drawPixelDisc(ctx, tipX, tipY, discR);
      drawPixelLine(ctx, tipX, tipY, tipX + cosA * tongueLen, tipY + sinA * tongueLen, 2);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tipX - 1, tipY - 1, 3, 3);
    }
    ctx.restore();
  }

  private renderShockwaves(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ): void {
    if (this.shockwaves.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i]!;
      const t = 1 - Math.max(0, Math.min(1, sw.life / Math.max(0.1, sw.maxLife)));
      const ease = 1 - (1 - t) * (1 - t);
      const r = Math.max(2, Math.round(sw.startR + (sw.endR - sw.startR) * ease));
      const ix = Math.round(sw.x);
      const iy = Math.round(sw.y);

      if (sw.isExplosion) {
        // Authentic Nuclear Throne opaque pixel-stepped blast discs:
        // pure-white flash -> vibrant orange/yellow fireball -> opaque charcoal smoke shrinking cleanly!
        ctx.globalAlpha = 1;
        const lowerCol = sw.color.toLowerCase();
        const isPlasma = lowerCol === '#55ff66';
        const isIdpd = lowerCol === '#4ca6ff';
        const isBlood = lowerCol === '#cc2222';
        if (t < 0.22) {
          const flashR = Math.max(4, Math.round(sw.endR * (0.42 + t * 1.4)));
          ctx.fillStyle = '#ffffff';
          drawPixelDisc(ctx, ix, iy, flashR);
        } else if (t < 0.54) {
          const subT = (t - 0.22) / 0.32;
          const fireR = Math.max(3, Math.round(sw.endR * (0.78 - subT * 0.22)));
          ctx.fillStyle = isPlasma ? '#28b848' : isIdpd ? '#2c78e8' : isBlood ? '#a81c28' : '#ff6818';
          drawPixelDisc(ctx, ix, iy, fireR);
          ctx.fillStyle = isPlasma ? '#78ff68' : isIdpd ? '#80d8ff' : isBlood ? '#ff4248' : '#ffd838';
          drawPixelDisc(ctx, ix, iy, Math.max(2, Math.round(fireR * 0.68)));
          if (subT < 0.5) {
            ctx.fillStyle = '#ffffff';
            drawPixelDisc(ctx, ix, iy, Math.max(2, Math.round(fireR * 0.36)));
          }
        } else {
          const subT = (t - 0.54) / 0.46;
          const smokeR = Math.round(Math.max(0, sw.endR * 0.52 * (1 - subT)));
          if (smokeR >= 2) {
            ctx.fillStyle = '#28252c';
            drawPixelDisc(ctx, ix, iy, smokeR);
            ctx.fillStyle = '#3a363c';
            drawPixelDisc(ctx, ix, iy, Math.max(1, smokeR - 2));
          }
        }
        // Crisp 1px pixel-stepped blast perimeter ring
        if (t < 0.65) {
          ctx.fillStyle = t < 0.25 ? '#ffffff' : sw.color;
          drawPixelRing(ctx, ix, iy, r, 1, 6, Math.floor(t * 12));
        }
      } else {
        // Non-explosion utility shockwave (level-up, melee deflect, corpse impact): crisp 1px pixel ring!
        ctx.globalAlpha = 1;
        ctx.fillStyle = sw.color;
        drawPixelRing(ctx, ix, iy, r, 1, 5, Math.floor(t * 12));
        if (r > 6 && t < 0.45) {
          ctx.fillStyle = '#ffffff';
          drawPixelRing(ctx, ix, iy, Math.max(3, Math.round(r * 0.85)), 1, 8, Math.floor(t * 15));
        }
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
      case 'desert': {
        // Warm drifting desert dust motes
        ctx.fillStyle = 'rgba(248, 215, 148, 0.28)';
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

      case 'oasis': {
        // Crisp 1px hollow rising underwater bubbles matching 05_oasis.png
        ctx.fillStyle = 'rgba(232, 255, 250, 0.65)';
        for (let i = 0; i < 12; i++) {
          const riseSpd = 10 + (i % 4) * 4;
          const sx = wrapMod(i * 67 + Math.sin(t * 1.8 + i) * 4 - viewLeft * 0.4, w);
          const sy = wrapMod(i * 41 - t * riseSpd - viewTop * 0.4, h);
          const r = i % 3 === 0 ? 3 : 2;
          drawPixelRing(ctx, Math.floor(sx), Math.floor(sy), r, 1);
        }
        break;
      }

      case 'scrapyard': {
        // Iconic Scrapyard crisp 1px diagonal white rain streaks (#e8eef2) matching 06_scrapyard_3_3.png!
        ctx.fillStyle = '#e8eef2';
        for (let i = 0; i < 12; i++) {
          const spd = 160 + (i % 4) * 28;
          const len = 14 + (i % 4) * 3;
          const sx = wrapMod(i * 73 + 31 - t * spd - viewLeft * 0.6, w + 48) - 24;
          const sy = wrapMod(i * 47 + 19 + t * spd - viewTop * 0.6, h + 48) - 24;
          drawPixelLine(ctx, sx, sy, sx - len, sy + len, 1);
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

  private drawBeamWarnParticle(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    lifeFrac: number,
  ): void {
    // Subtle crisp 1x vertical emerald/white charge sparks along the carpet (never grassy V-clumps!)
    const ix = Math.round(x);
    const iy = Math.round(y);
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, lifeFrac * 0.85);
    ctx.fillStyle = '#48e858';
    ctx.fillRect(ix, iy - 2, 1, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ix, iy - 1, 1, 2);
    ctx.restore();
  }

  private drawCrispParticle(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    kind: string,
    x: number,
    y: number,
    size: number,
    color: string,
    lifeFrac: number,
    alpha: number,
  ): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    ctx.save();
    if (kind === 'explosion') {
      // Pure opaque crisp pixel-stepped explosion discs: white flash -> orange/yellow fireball -> charcoal smoke!
      ctx.globalAlpha = 1;
      const baseR = Math.max(2, Math.round(size * 0.55));
      if (lifeFrac > 0.72) {
        ctx.fillStyle = '#ffffff';
        drawPixelDisc(ctx, ix, iy, baseR);
      } else if (lifeFrac > 0.42) {
        const r = Math.max(2, Math.round(baseR * (0.75 + lifeFrac * 0.35)));
        ctx.fillStyle = '#ff6818';
        drawPixelDisc(ctx, ix, iy, r);
        ctx.fillStyle = '#ffd838';
        drawPixelDisc(ctx, ix, iy, Math.max(1, Math.round(r * 0.62)));
      } else {
        const r = Math.round(baseR * (lifeFrac / 0.42));
        if (r >= 1) {
          ctx.fillStyle = '#28252c';
          drawPixelDisc(ctx, ix, iy, r);
          if (r >= 2) {
            ctx.fillStyle = '#3a363c';
            drawPixelDisc(ctx, ix, iy, r - 1);
          }
        }
      }
    } else if (kind === 'smoke' || kind === 'dust') {
      // Pure opaque shrinking charcoal pixel-stepped smoke disc
      ctx.globalAlpha = 1;
      const r = Math.round(Math.max(1, size * 0.55) * lifeFrac);
      if (r >= 1) {
        ctx.fillStyle = '#28252c';
        drawPixelDisc(ctx, ix, iy, r);
        if (r >= 2) {
          ctx.fillStyle = '#3a363c';
          drawPixelDisc(ctx, ix, iy, r - 1);
        }
      }
    } else if (kind === 'laser_hit') {
      ctx.globalAlpha = 1;
      const r = Math.max(1, Math.round(Math.max(2, size * 0.6) * lifeFrac));
      ctx.fillStyle = '#ffffff';
      drawPixelDisc(ctx, ix, iy, r);
    } else if (kind === 'fire') {
      ctx.globalAlpha = 1;
      const r = Math.max(1, Math.round(Math.max(2, size * 0.55) * lifeFrac));
      ctx.fillStyle = lifeFrac > 0.7 ? '#ffffff' : lifeFrac > 0.4 ? '#ffd838' : '#ff6818';
      drawPixelDisc(ctx, ix, iy, r);
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color || '#ffffff';
      const s = Math.max(1, Math.round(size * (0.5 + 0.5 * lifeFrac)));
      ctx.fillRect(ix - Math.floor(s / 2), iy - Math.floor(s / 2), s, s);
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
      if (p.kind === 'beam_warn') {
        this.drawBeamWarnParticle(ctx, p.x, p.y, lifeFrac);
        continue;
      }
      if (p.sprite && this.sprites.hasSprite(p.sprite)) {
        const sp = this.sprites.getSprite(p.sprite)!;
        const frame = Math.floor((1 - lifeFrac) * sp.frames.length);
        this.sprites.draw(ctx, p.sprite, p.x, p.y, { frame, alpha: p.kind === 'explosion' || p.kind === 'smoke' ? 1 : alpha, pixelSnap });
      } else {
        this.drawCrispParticle(ctx, p.kind, p.x, p.y, p.size, p.color, lifeFrac, alpha);
      }
    }

    // Event-spawned transient particles
    for (let i = 0; i < this.transientParticles.length; i++) {
      const p = this.transientParticles[i]!;
      const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 1;
      if (p.kind === 'beam_warn') {
        this.drawBeamWarnParticle(ctx, p.x, p.y, lifeFrac);
        continue;
      }
      if (p.sprite && this.sprites.hasSprite(p.sprite)) {
        const sp = this.sprites.getSprite(p.sprite)!;
        const frame = Math.floor((1 - lifeFrac) * sp.frames.length);
        this.sprites.draw(ctx, p.sprite, p.x, p.y, { frame, alpha: p.kind === 'explosion' || p.kind === 'smoke' ? 1 : lifeFrac, pixelSnap });
      } else {
        this.drawCrispParticle(ctx, p.kind, p.x, p.y, p.size, p.color, lifeFrac, lifeFrac);
      }
    }
  }

  private renderFloatingTexts(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    viewLeft: number,
    viewTop: number,
    viewW: number,
  ): void {
    // Never bleed stale combat numbers onto menu/loading screens
    if (
      state.phase === 'mutation_select' ||
      state.phase === 'ultra_select' ||
      state.phase === 'game_over' ||
      state.phase === 'victory_throne' ||
      (state.portal.active && state.portal.entered && Math.max(state.portal.enterTicks || 0, state.portalTransitionTicks || 0) >= 7)
    ) {
      return;
    }

    // Strictly clamp below top HUD boxes (screen y >= 42) and separate colliding labels cleanly!
    const minWorldY = viewTop + 42;
    const minWorldX = viewLeft + 24;
    const maxWorldX = viewLeft + viewW - 24;
    const placed: Array<{ x: number; y: number; halfW: number }> = [];

    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i]!;
      const alpha = Math.min(1, (ft.life / Math.max(1, ft.maxLife)) * 1.4);
      const halfW = Math.max(10, ft.text.length * (ft.font === 'fntM1' ? 3 : 2.3));
      const drawX = Math.max(minWorldX, Math.min(maxWorldX, ft.x));
      let drawY = Math.max(minWorldY, ft.y);

      // Push downward if two rising labels both clamp onto the top HUD ceiling simultaneously
      for (let guard = 0; guard < 5; guard++) {
        let collided = false;
        for (let j = 0; j < placed.length; j++) {
          const prev = placed[j]!;
          if (Math.abs(prev.x - drawX) < prev.halfW + halfW + 4 && Math.abs(prev.y - drawY) < 9) {
            drawY = prev.y + 9;
            collided = true;
          }
        }
        if (!collided) break;
      }
      placed.push({ x: drawX, y: drawY, halfW });

      this.fonts.draw(ctx, ft.text, drawX, drawY, ft.font, {
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
    viewTop: number = 0,
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    if (!state.player.alive || state.phase !== 'playing') return;
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
    const pickupGlyph = getGamepadGlyphs(gamepadFamily).pickup;
    const promptPrefix =
      inputMode === 'gamepad'
        ? `@b[${pickupGlyph}]@w `
        : inputMode === 'touch'
          ? '@yUSE@w '
          : '@y[E]@w ';
    const fullText = `${promptPrefix}${label}`;
    const measured = this.fonts.measure(fullText, 'fntSmall');
    const pillW = measured.width + 6;
    const pillH = 9;
    // Positioned neatly BELOW the dropped weapon so it never stacks over player head / floating callouts
    const px = Math.round(nearest.x - pillW * 0.5);
    const py = Math.max(Math.round(viewTop + 42), Math.round(nearest.y + 8));
    ctx.save();
    ctx.fillStyle = 'rgba(10, 8, 16, 0.82)';
    ctx.fillRect(px, py, pillW, pillH);
    const borderCol = nearest.cursed ? '#c94aff' : '#78708a';
    ctx.fillStyle = borderCol;
    ctx.fillRect(px, py, pillW, 1);
    ctx.fillRect(px, py + pillH - 1, pillW, 1);
    ctx.fillRect(px, py, 1, pillH);
    ctx.fillRect(px + pillW - 1, py, 1, pillH);
    ctx.restore();
    this.fonts.draw(ctx, fullText, nearest.x, py + 2, 'fntSmall', {
      align: 'center',
      baseline: 'top',
      outline: false,
      shadow: true,
    });
  }

  /**
   * Renders a crisp persistent `[E]` world prompt pill above any nearby interactable prop
   * exposing `prop.interactPrompt` (Fixed Golden Car, Ice Flower, Crown Pedestal, Open IDPD Van, Broken Throne).
   */
  private renderNearbyPropPrompt(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    playerX: number,
    playerY: number,
    inputMode: RenderInputDeviceMode = 'kbm',
    viewTop: number = 0,
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    if (!state.player.alive || state.phase !== 'playing') return;
    let nearest: PropEntity | null = null;
    let bestDistSq = 48 * 48;
    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (!prop.interactPrompt || prop.hp <= 0) continue;
      const dx = prop.x - playerX;
      const dy = prop.y - playerY;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        nearest = prop;
      }
    }
    if (!nearest || !nearest.interactPrompt) return;

    const raw = nearest.interactPrompt.trim();
    const cleaned = raw.replace(/^\[E\]\s*/i, '');
    const pickupGlyph = getGamepadGlyphs(gamepadFamily).pickup;
    const prefix =
      inputMode === 'gamepad'
        ? `@b[${pickupGlyph}]@w `
        : inputMode === 'touch'
          ? '@yUSE@w '
          : '@y[E]@w ';
    const fullText = cleaned.length > 0 ? `${prefix}${cleaned}` : `${prefix}INTERACT`;
    const measured = this.fonts.measure(fullText, 'fntSmall');
    const pillW = measured.width + 8;
    const pillH = 10;
    const bob = Math.round(Math.sin(this.renderTimeSec * 5.5) * 1.2);
    const px = Math.round(nearest.x - pillW * 0.5);
    const py = Math.max(
      Math.round(viewTop + 42),
      Math.round(nearest.y - Math.max(16, nearest.radius + 8) - pillH + bob),
    );

    ctx.save();
    ctx.fillStyle = 'rgba(10, 8, 16, 0.86)';
    ctx.fillRect(px, py, pillW, pillH);
    ctx.fillStyle = '#ffe047';
    ctx.fillRect(px, py, pillW, 1);
    ctx.fillRect(px, py + pillH - 1, pillW, 1);
    ctx.fillRect(px, py, 1, pillH);
    ctx.fillRect(px + pillW - 1, py, 1, pillH);
    ctx.restore();

    this.fonts.draw(ctx, fullText, nearest.x, py + 2, 'fntSmall', {
      align: 'center',
      baseline: 'top',
      outline: false,
      shadow: true,
    });
  }

  /**
   * Sleek translucent aim reticle rendered during active touch twin-stick play so
   * mobile players see exact shot alignment without an opaque desktop cursor.
   */
  renderTouchAimReticle(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    screenX: number,
    screenY: number,
  ): void {
    const sx = Math.round(screenX);
    const sy = Math.round(screenY);
    const r = Math.round(5 + this.crosshairRecoil * 0.45);
    const hitBoost = this.crosshairHitTicks > 0 ? 0.24 : 0;
    const baseAlpha = Math.min(0.75, 0.48 + hitBoost);

    ctx.save();
    // Subtle dark outer halo for contrast on bright desert/snow floors
    ctx.globalAlpha = baseAlpha * 0.55;
    ctx.fillStyle = '#0c0814';
    drawPixelRing(ctx, sx, sy, r + 1, 1);

    // Thin 1px translucent gold-white pixel ring
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = this.crosshairHitTicks > 0 ? '#ffe047' : '#fff3cc';
    drawPixelRing(ctx, sx, sy, r, 1);

    // Subtle short directional ticks outside the ring (N/S/E/W)
    ctx.globalAlpha = baseAlpha * 0.92;
    ctx.fillStyle = '#ffe89c';
    ctx.fillRect(sx, sy - r - 3, 1, 2);
    ctx.fillRect(sx, sy + r + 2, 1, 2);
    ctx.fillRect(sx - r - 3, sy, 2, 1);
    ctx.fillRect(sx + r + 2, sy, 2, 1);

    // Tiny center dot
    ctx.globalAlpha = Math.min(0.85, baseAlpha + 0.14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy, 1, 1);

    ctx.restore();
  }

  renderCrosshair(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    crosshairStyle: number,
  ): void {
    const sx = Math.round(screenX);
    const sy = Math.round(screenY);
    const drew = this.sprites.draw(ctx, 'sprCrosshair', sx, sy, {
      frame: Math.max(0, Math.floor(crosshairStyle)),
      scaleX: 1,
      scaleY: 1,
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

    // Crisp 1x pixel-stepped diagonal hit-confirm ticks around crosshair when shots land!
    if (this.crosshairHitTicks > 0) {
      const frac = Math.min(1, this.crosshairHitTicks / 4.5);
      const dist = Math.round(4 + (1 - frac) * 2);
      const col = this.crosshairHitCrit ? '#ffe047' : '#ffffff';
      ctx.save();
      ctx.globalAlpha = 1;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.fillStyle = '#0c0812';
        drawPixelLine(ctx, sx + dx * dist, sy + dy * dist, sx + dx * (dist + 3), sy + dy * (dist + 3), 3);
        ctx.fillStyle = col;
        drawPixelLine(ctx, sx + dx * dist, sy + dy * dist, sx + dx * (dist + 3), sy + dy * (dist + 3), 1);
      }
      ctx.restore();
    }
  }
}
