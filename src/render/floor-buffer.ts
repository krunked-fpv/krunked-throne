import {
  TILE_SIZE,
  TileType,
  type AreaDef,
  type BiomeId,
  type FloorDecal,
  type WorldMap,
} from '@/contracts';
import type { AssetBundle } from '@/assets';
import {
  BIOME_FALLBACK_PALETTES,
  BIOME_SPRITE_NUMBER,
  type UiDataProvider,
  DEFAULT_UI_DATA_PROVIDER,
} from '@/ui/data-provider';
import { fillPixelOval } from './glow-cache';
import { SpriteRenderer } from './sprites';

type FloorCanvas = HTMLCanvasElement | OffscreenCanvas;
type FloorCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Exact video-matched solid continuous wall-top roof fill colors for Built-In Art mode.
 * Caves (#7a4eb4) & Labs (#12333b) match raw unshadowed wall colors and dim cleanly to
 * #44315e / #0d1919 under the 42% 2-tier darkness veil.
 */
export const BIOME_ROOF_COLORS: Readonly<Record<BiomeId, string>> = {
  desert: '#9b8568',
  oasis: '#58afa9',
  sewers: '#344030',
  pizza_sewers: '#384434',
  scrapyard: '#828890',
  mansion: '#8a7e6e',
  caves: '#7a4eb4',
  cursed_caves: '#6a3ca8',
  frozen_city: '#9da4a6',
  jungle: '#438428',
  labs: '#12333b',
  palace: '#64282c',
  campfire: '#8c7a5c',
  vault: '#3d4d58',
  hq: '#b8c2cc',
};

/**
 * Exact pixel-sampled Steam Pack `sprWall*Top` roof fill colors so Steam perimeter walls
 * melt into the continuous outer roof mass with ZERO rectangular halo seams!
 */
export const STEAM_BIOME_ROOF_COLORS: Readonly<Record<BiomeId, string>> = {
  desert: '#af8f6a',
  oasis: '#51d1c8',
  sewers: '#4c5946',
  pizza_sewers: '#4c5946',
  scrapyard: '#8a969e',
  mansion: '#8a7e6e',
  caves: '#8152bc',
  cursed_caves: '#6a3ca8',
  frozen_city: '#b4bdc5',
  jungle: '#2a900c',
  labs: '#12333b',
  palace: '#703232',
  campfire: '#9a8262',
  vault: '#485864',
  hq: '#b8c2cc',
};

export function getBiomeRoofColor(biome: BiomeId, isSteam: boolean = false): string {
  const table = isSteam ? STEAM_BIOME_ROOF_COLORS : BIOME_ROOF_COLORS;
  return table[biome] ?? table.desert;
}

function posMod(v: number, m: number): number {
  const r = v % m;
  return r < 0 ? r + m : r;
}

/**
 * Paints a seamless, world-aligned solid biome wall-top roof rectangle on the 1x pixel grid.
 * - Oasis: subtle diagonal lighter water-sheen stripes across roof mass matching 05_oasis.png.
 * - Labs: crisp subtle 16px faint teal grid lines (`#1d464f`, dimming to `#142829` in 2-tier dark) matching 14_labs_6_1.png.
 * - All other biomes: pure exact solid roof color extending seamlessly to screen edges.
 */
export function fillBiomeRoofRect(
  ctx: FloorCtx,
  biome: BiomeId,
  worldX: number,
  worldY: number,
  w: number,
  h: number,
  dstX: number = worldX,
  dstY: number = worldY,
  isSteam: boolean = false,
): void {
  const ix = Math.round(dstX);
  const iy = Math.round(dstY);
  const iw = Math.round(w);
  const ih = Math.round(h);
  if (iw <= 0 || ih <= 0) return;

  ctx.fillStyle = getBiomeRoofColor(biome, isSteam);
  ctx.fillRect(ix, iy, iw, ih);

  if (biome === 'oasis') {
    // Subtle diagonal lighter turquoise water-sheen bands (world-aligned 45deg, zero tile seams!)
    const wx0 = Math.round(worldX);
    const wy0 = Math.round(worldY);
    const period = 56;
    const bandW = 14;
    ctx.fillStyle = isSteam ? '#5fdcd4' : '#65bcb6';
    for (let dy = 0; dy < ih; dy++) {
      const wy = wy0 + dy;
      const startPhase = posMod(wx0 + wy, period);
      let dx = startPhase < bandW ? 0 : period - startPhase;
      while (dx < iw) {
        const phase = posMod(wx0 + dx + wy, period);
        const run = Math.min(bandW - phase, iw - dx);
        if (run > 0) {
          ctx.fillRect(ix + dx, iy + dy, run, 1);
        }
        dx += period - phase;
      }
    }
  } else if (biome === 'labs') {
    // Crisp subtle 16px faint teal grid lines aligned to wall-top boundaries (wx % 16 === 0, wy % 16 === 8)
    const wx0 = Math.round(worldX);
    const wy0 = Math.round(worldY);
    ctx.fillStyle = '#1d464f';
    const firstVx = posMod(-wx0, 16);
    for (let dx = firstVx; dx < iw; dx += 16) {
      ctx.fillRect(ix + dx, iy, 1, ih);
    }
    const firstHy = posMod(8 - wy0, 16);
    for (let dy = firstHy; dy < ih; dy += 16) {
      ctx.fillRect(ix, iy + dy, iw, 1);
    }
  }
}

function createOffscreenCanvas(w: number, h: number): FloorCanvas | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  return null;
}

function isWalkable(tile: number): boolean {
  return tile === TileType.Floor || tile === TileType.FloorCracked || tile === TileType.Carpet;
}

function tileHash(tx: number, ty: number, salt: number = 0): number {
  let h = Math.imul(tx + 37, 374761393) ^ Math.imul(ty + 91, 668265263) ^ Math.imul(salt + 17, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function isIntactSlab2x2(map: WorldMap, slabTx: number, slabTy: number): boolean {
  if (slabTx < 0 || slabTy < 0 || slabTx + 1 >= map.width || slabTy + 1 >= map.height) {
    return false;
  }
  const w = map.width;
  return (
    map.tiles[slabTy * w + slabTx] === TileType.Floor &&
    map.tiles[slabTy * w + slabTx + 1] === TileType.Floor &&
    map.tiles[(slabTy + 1) * w + slabTx] === TileType.Floor &&
    map.tiles[(slabTy + 1) * w + slabTx + 1] === TileType.Floor
  );
}

/**
 * Smooth deterministic 2D value noise (4-tile macro cell) so Frozen City ice tiles (`sprFloor5B`)
 * form large cohesive multi-tile frozen lakes matching 13_frozen_5_3.png (~50% on 5-3, ~22% on 5-1/5-2).
 */
function frozenIceNoise(tx: number, ty: number, salt: number): number {
  const cell = 4;
  const gx = Math.floor(tx / cell);
  const gy = Math.floor(ty / cell);
  const fx = (tx - gx * cell) / cell;
  const fy = (ty - gy * cell) / cell;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const v00 = (tileHash(gx, gy, salt) & 1023) / 1023;
  const v10 = (tileHash(gx + 1, gy, salt) & 1023) / 1023;
  const v01 = (tileHash(gx, gy + 1, salt) & 1023) / 1023;
  const v11 = (tileHash(gx + 1, gy + 1, salt) & 1023) / 1023;

  const top = v00 + (v10 - v00) * sx;
  const bot = v01 + (v11 - v01) * sx;
  return top + (bot - top) * sy;
}

/**
 * Persistent 1x native-pixel offscreen level floor canvas (map.width * 16 x map.height * 16).
 * - Fills non-walkable regions with exact continuous biome wall-top roof colors (zero black voids)
 * - Renders biome floor tiles (sprFloor*, sprFloor*B cohesive ice lakes / floor variety, sprDetail*,
 *   sprFloor*Explo strictly for wall blasts, crisp Palace royal crimson carpet)
 * - Permanently bakes all FloorDecals (blood, scorch, rubble, acid, settled corpses, brass casings)
 * - Incrementally refreshes newly carved floor tiles when walls are destroyed mid-level
 */
export class FloorBuffer {
  private sprites: SpriteRenderer;
  private data: UiDataProvider;
  private canvas: FloorCanvas | null = null;
  private ctx: FloorCtx | null = null;

  private mapWidth = 0;
  private mapHeight = 0;
  private tileSize = TILE_SIZE;
  private pixelScale = 1;
  private isSteam = false;
  private lastTiles: Uint8Array | null = null;
  private bakedDecalCount = 0;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.sprites = new SpriteRenderer(bundle);
    this.data = data;
    this.isSteam = bundle.sourceMode === 'steam';
  }

  setBundle(bundle: AssetBundle): void {
    this.sprites.setBundle(bundle);
    this.isSteam = bundle.sourceMode === 'steam';
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
  }

  getCanvas(): FloorCanvas | null {
    return this.canvas;
  }

  getPixelScale(): number {
    return this.pixelScale;
  }

  getDimensions(): { width: number; height: number } {
    return {
      width: this.mapWidth * this.tileSize,
      height: this.mapHeight * this.tileSize,
    };
  }

  getBakedDecalCount(): number {
    return this.bakedDecalCount;
  }

  private resolveBiomeSprites(map: WorldMap, areaDef?: AreaDef): {
    floorSprite: string;
    floorAltSprite: string;
    floorExploSprite: string;
    detailSprite: string;
  } {
    const num = BIOME_SPRITE_NUMBER[map.biome] ?? 1;
    const area = areaDef ?? this.data.getArea(map.areaCode) ?? this.data.getAreaByBiome(map.biome);
    const floorSprite = area?.floorSprite ?? `sprFloor${num}`;
    const floorExploSprite = area?.floorExploSprite ?? `sprFloor${num}Explo`;
    return {
      floorSprite,
      floorAltSprite: `${floorSprite}B`,
      floorExploSprite,
      detailSprite: `sprDetail${num}`,
    };
  }

  /**
   * Rebuilds the entire persistent 1x floor buffer for a newly entered level.
   */
  rebuild(map: WorldMap, areaDef?: AreaDef): void {
    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.tileSize = map.tileSize || TILE_SIZE;
    this.bakedDecalCount = 0;
    this.lastTiles = new Uint8Array(map.tiles);

    const logicalW = Math.max(1, this.mapWidth * this.tileSize);
    const logicalH = Math.max(1, this.mapHeight * this.tileSize);
    const desiredScale = 1;
    const pixelW = logicalW * desiredScale;
    const pixelH = logicalH * desiredScale;

    if (!this.canvas || this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas = createOffscreenCanvas(pixelW, pixelH);
      this.ctx = this.canvas
        ? (this.canvas.getContext('2d') as FloorCtx | null)
        : null;
    }

    this.pixelScale = 1;
    if (!this.ctx) {
      return;
    }
    if (typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, logicalW, logicalH);

    fillBiomeRoofRect(this.ctx, map.biome, 0, 0, logicalW, logicalH, 0, 0, this.isSteam);

    this.renderTileRange(map, 0, 0, map.width - 1, map.height - 1, areaDef);
  }

  /**
   * Incrementally scans map.tiles against the last snapshot and refreshes ONLY
   * tiles that changed (e.g. walls carved by explosions, Hammerhead, Portal, or Throne)
   * without erasing existing battle decals elsewhere on the floor.
   */
  syncMapChanges(map: WorldMap, areaDef?: AreaDef): number {
    if (
      !this.lastTiles ||
      this.mapWidth !== map.width ||
      this.mapHeight !== map.height ||
      this.tileSize !== (map.tileSize || TILE_SIZE)
    ) {
      this.rebuild(map, areaDef);
      return map.width * map.height;
    }

    let changed = 0;
    for (let ty = 0; ty < map.height; ty++) {
      const row = ty * map.width;
      for (let tx = 0; tx < map.width; tx++) {
        const idx = row + tx;
        const cur = map.tiles[idx]!;
        if (cur !== this.lastTiles[idx]) {
          this.lastTiles[idx] = cur;
          this.renderTile(map, tx, ty, areaDef);
          changed += 1;
        }
      }
    }
    return changed;
  }

  /**
   * Explicitly refreshes a rectangular tile range (inclusive) on the floor buffer.
   */
  refreshTiles(
    map: WorldMap,
    minTx: number,
    minTy: number,
    maxTx: number,
    maxTy: number,
    areaDef?: AreaDef,
  ): void {
    const x0 = Math.max(0, minTx);
    const y0 = Math.max(0, minTy);
    const x1 = Math.min(map.width - 1, maxTx);
    const y1 = Math.min(map.height - 1, maxTy);
    this.renderTileRange(map, x0, y0, x1, y1, areaDef);
    if (this.lastTiles) {
      for (let ty = y0; ty <= y1; ty++) {
        const row = ty * map.width;
        for (let tx = x0; tx <= x1; tx++) {
          this.lastTiles[row + tx] = map.tiles[row + tx]!;
        }
      }
    }
  }

  private renderTileRange(
    map: WorldMap,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    areaDef?: AreaDef,
  ): void {
    if (!this.ctx) return;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        this.renderTile(map, tx, ty, areaDef);
      }
    }
  }

  private drawFallbackIceTile(ctx: FloorCtx, px: number, py: number, ts: number): void {
    ctx.fillStyle = '#789eb7';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = '#9ac0d8';
    for (let dy = 0; dy < ts; dy++) {
      for (let dx = 0; dx < ts; dx++) {
        const band = posMod(px + dx + py + dy, 16);
        if (band < 4 || (band >= 7 && band < 9)) {
          ctx.fillRect(px + dx, py + dy, 1, 1);
        }
      }
    }
  }

  private renderTile(map: WorldMap, tx: number, ty: number, areaDef?: AreaDef): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const idx = ty * map.width + tx;
    const tile = map.tiles[idx] as TileType;
    const ts = this.tileSize;
    const px = tx * ts;
    const py = ty * ts;
    const pal = BIOME_FALLBACK_PALETTES[map.biome] ?? BIOME_FALLBACK_PALETTES.desert;

    if (!isWalkable(tile)) {
      fillBiomeRoofRect(ctx, map.biome, px, py, ts, ts, px, py, this.isSteam);
      return;
    }

    const variant = map.floorVariants[idx] ?? ((tx * 7 + ty * 13) & 3);
    const { floorSprite, floorAltSprite, floorExploSprite, detailSprite } = this.resolveBiomeSprites(map, areaDef);

    // Frozen City cohesive multi-tile ice lakes (`sprFloor5B`): ~50% of 5-3, ~22% of 5-1/5-2!
    let drewIceLake = false;
    if (map.biome === 'frozen_city' && tile === TileType.Floor) {
      const salt = map.areaCode === '5-3' ? 53 : map.areaCode === '5-2' ? 52 : 51;
      const iceVal = frozenIceNoise(tx, ty, salt);
      const iceThreshold = map.areaCode === '5-3' ? 0.52 : 0.24;
      if (iceVal < iceThreshold) {
        const altDef = this.sprites.getSprite(floorAltSprite);
        if (altDef && altDef.frames.length > 0) {
          const af0 = altDef.frames[0]!;
          if (af0.targetW >= ts * 2 && af0.targetH >= ts * 2) {
            const subX = (tx & 1) * ts;
            const subY = (ty & 1) * ts;
            drewIceLake = this.sprites.drawSubRect(ctx, floorAltSprite, 0, subX, subY, ts, ts, px, py, ts, ts);
          } else {
            drewIceLake = this.sprites.draw(ctx, floorAltSprite, px, py, { frame: 0, pixelSnap: true });
          }
        }
        if (!drewIceLake) {
          this.drawFallbackIceTile(ctx, px, py, ts);
          drewIceLake = true;
        }
      }
    }

    // Draw base biome floor tile (handles both 32x32 slabs and 16x16 tiles seamlessly)
    let drewBase = drewIceLake;
    if (!drewBase) {
      const floorDef = this.sprites.getSprite(floorSprite);
      if (floorDef && floorDef.frames.length > 0) {
        const f0 = floorDef.frames[0]!;
        if (f0.targetW >= ts * 2 && f0.targetH >= ts * 2) {
          // 32x32 floor slab: sample aligned 16x16 quadrant so adjacent tiles form cohesive slabs
          const slabTx = tx & ~1;
          const slabTy = ty & ~1;
          const slabVariant = map.floorVariants[slabTy * map.width + slabTx] ?? variant;
          const subX = (tx & 1) * ts;
          const subY = (ty & 1) * ts;
          drewBase = this.sprites.drawSubRect(ctx, floorSprite, slabVariant, subX, subY, ts, ts, px, py, ts, ts);

          // Subtle intact-floor variety using sprFloor*B slabs (~14% of intact 2x2 floor blocks).
          // Skip on 7-3 Throne Hall so the Palace floor stays 100% uniform dark charcoal diamond tiles (17_throne_hall.png)!
          if (
            drewBase &&
            map.biome !== 'frozen_city' &&
            map.areaCode !== '7-3' &&
            tile === TileType.Floor &&
            this.sprites.hasSprite(floorAltSprite) &&
            isIntactSlab2x2(map, slabTx, slabTy)
          ) {
            const sh = tileHash(slabTx >> 1, slabTy >> 1, 7);
            if (sh % 7 === 0) {
              const altDef = this.sprites.getSprite(floorAltSprite);
              if (altDef && altDef.frames.length > 0 && altDef.frames[0]!.targetW >= ts * 2 && altDef.frames[0]!.targetH >= ts * 2) {
                const altFrame = (sh >>> 4) % Math.max(1, altDef.frames.length);
                this.sprites.drawSubRect(ctx, floorAltSprite, altFrame, subX, subY, ts, ts, px, py, ts, ts);
              }
            }
          }
        } else {
          drewBase = this.sprites.draw(ctx, floorSprite, px, py, { frame: variant, pixelSnap: true });
        }
      }
    }

    if (!drewBase) {
      ctx.fillStyle = ((tx + ty) & 1) === 0 ? pal.floor : pal.floorAlt;
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = pal.floorCracked;
      const sx = (variant * 5 + tx * 3) % (ts - 3);
      const sy = (variant * 7 + ty * 5) % (ts - 3);
      ctx.fillRect(px + sx + 1, py + sy + 1, 2, 1);
    }

    // Sparse authentic floor micro-details (sprDetail*) strictly on non-carpet, non-7-3 intact floor tiles
    if (
      tile === TileType.Floor &&
      map.areaCode !== '7-3' &&
      !drewIceLake &&
      this.sprites.hasSprite(detailSprite)
    ) {
      const dh = tileHash(tx, ty, 31);
      if (dh % 11 === 0) {
        const ox = 4 + ((dh >>> 4) % 9);
        const oy = 4 + ((dh >>> 8) % 9);
        const dFrame = (dh >>> 12) & 15;
        this.sprites.draw(ctx, detailSprite, px + ox, py + oy, {
          frame: dFrame,
          pixelSnap: true,
        });
      }
    }

    // Cracked / blasted floor overlay (strictly for FloorCracked tiles from wall blasts)
    if (tile === TileType.FloorCracked) {
      const drewExplo = this.sprites.draw(ctx, floorExploSprite, px, py, {
        frame: variant,
        pixelSnap: true,
      });
      if (!drewExplo) {
        ctx.fillStyle = pal.floorCracked;
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.fillStyle = '#141016';
        ctx.fillRect(px + 5, py + 4, 2, 6);
        ctx.fillRect(px + 7, py + 8, 4, 2);
      }
    }

    // Palace / Vault Red Carpet: skip procedural carpet on 7-3 ONLY when full-length Steam sprCarpet is loaded
    if (tile === TileType.Carpet) {
      const carpetDef = this.sprites.getSprite('sprCarpet');
      const useSteamThroneCarpet =
        map.areaCode === '7-3' &&
        this.sprites.hasSprite('sprCarpet') &&
        carpetDef !== undefined &&
        carpetDef.height >= 200;
      if (!useSteamThroneCarpet) {
        this.drawCarpetTile(ctx, map, tx, ty, px, py, ts);
      }
    }
  }

  private drawCarpetTile(
    ctx: FloorCtx,
    map: WorldMap,
    tx: number,
    ty: number,
    px: number,
    py: number,
    ts: number,
  ): void {
    const leftCarpet = tx > 0 && map.tiles[ty * map.width + (tx - 1)] === TileType.Carpet;
    const rightCarpet = tx + 1 < map.width && map.tiles[ty * map.width + (tx + 1)] === TileType.Carpet;
    const topCarpet = ty > 0 && map.tiles[(ty - 1) * map.width + tx] === TileType.Carpet;
    const botCarpet = ty + 1 < map.height && map.tiles[(ty + 1) * map.width + tx] === TileType.Carpet;

    // Authentic 1x Nuclear Throne Palace royal crimson carpet (#a01f31) + crisp 1px #d8b85c gold side trim
    ctx.fillStyle = '#a01f31';
    ctx.fillRect(px, py, ts, ts);

    if (!leftCarpet) {
      ctx.fillStyle = '#d8b85c';
      ctx.fillRect(px, py, 1, ts);
      ctx.fillStyle = '#7a1524';
      ctx.fillRect(px + 1, py, 1, ts);
    }
    if (!rightCarpet) {
      ctx.fillStyle = '#d8b85c';
      ctx.fillRect(px + ts - 1, py, 1, ts);
      ctx.fillStyle = '#7a1524';
      ctx.fillRect(px + ts - 2, py, 1, ts);
    }
    if (!topCarpet) {
      ctx.fillStyle = '#d8b85c';
      ctx.fillRect(px, py, ts, 1);
      ctx.fillStyle = '#7a1524';
      ctx.fillRect(px, py + 1, ts, 1);
    }
    if (!botCarpet) {
      ctx.fillStyle = '#d8b85c';
      ctx.fillRect(px, py + ts - 1, ts, 1);
      ctx.fillStyle = '#7a1524';
      ctx.fillRect(px, py + ts - 2, ts, 1);
    }
  }

  /**
   * Permanently bakes a battle decal (blood, scorch, rubble, acid, settled corpse, casing)
   * into the level's persistent 1x offscreen floor canvas on integer pixel coordinates.
   */
  bakeDecal(decal: FloorDecal): void {
    this.bakedDecalCount += 1;
    const ctx = this.ctx;
    if (!ctx) return;

    const x = Math.round(decal.x);
    const y = Math.round(decal.y);
    const scale = decal.scale > 0 ? decal.scale : 1;

    switch (decal.kind) {
      case 'corpse': {
        if (decal.sprite) {
          const drew = this.sprites.draw(ctx, decal.sprite, x, y, {
            frame: decal.frame ?? 0,
            flipX: decal.facing === -1,
            scaleX: scale,
            scaleY: scale,
            pixelSnap: true,
          });
          if (drew) return;
        }
        ctx.fillStyle = '#24171a';
        ctx.fillRect(x - 6, y - 3, 12, 6);
        ctx.fillStyle = decal.color || '#8c2828';
        ctx.fillRect(x - 5, y - 2, 10, 4);
        break;
      }

      case 'scorch': {
        const scorchSprite = decal.sprite ?? (scale >= 1.2 ? 'sprScorch' : 'sprScorchmark');
        const drew = this.sprites.draw(ctx, scorchSprite, x, y, {
          frame: decal.frame ?? 0,
          scaleX: 1,
          scaleY: 1,
          alpha: 0.85,
          pixelSnap: true,
        });
        if (!drew) {
          const r = Math.max(4, Math.round(9 * scale));
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#241d22';
          fillPixelOval(ctx, x, y, r + 1, Math.max(3, Math.round(r * 0.72)));
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = decal.color || '#141016';
          fillPixelOval(ctx, x, y, r, Math.max(2, Math.round(r * 0.62)));
          ctx.restore();
        }
        break;
      }

      case 'blood': {
        ctx.save();
        const baseColor = decal.color || '#9e1924';
        const r = Math.max(2, Math.round(3.2 * scale));
        const ry = Math.max(1, Math.round(r * 0.68));
        const ang = decal.angle || 0;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const seed = tileHash(x, y, Math.round(ang * 31));

        // Crisp 1x integer-pixel dried rim + multi-lobe blood pool (zero 0.5px subpixels!)
        ctx.fillStyle = '#38070d';
        ctx.globalAlpha = 0.72;
        fillPixelOval(ctx, x, y + 1, r + 1, ry + 1);

        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.92;
        fillPixelOval(ctx, x, y, r, ry);
        fillPixelOval(
          ctx,
          x + Math.round(cosA * r * 0.75),
          y + Math.round(sinA * ry * 0.8),
          Math.max(1, Math.round(r * 0.7)),
          Math.max(1, Math.round(ry * 0.7)),
        );
        fillPixelOval(
          ctx,
          x + ((seed & 3) - 1),
          y + (((seed >>> 3) & 3) - 1),
          Math.max(1, Math.round(r * 0.6)),
          Math.max(1, Math.round(ry * 0.6)),
        );

        // Crisp 1x integer directional splatter droplets
        for (let k = 1; k <= 5; k++) {
          const h = tileHash(x + k * 7, y - k * 5, seed);
          const spread = ((h % 100) / 100 - 0.5) * 1.1;
          const dist = r + k * 2;
          const dx = Math.round(Math.cos(ang + spread) * dist);
          const dy = Math.round(Math.sin(ang + spread) * dist);
          const sz = k <= 2 ? 2 : 1;
          ctx.fillRect(x + dx, y + dy, sz, sz);
        }
        // Crisp 1px wet crimson highlight speck
        ctx.fillStyle = '#d92b3d';
        ctx.globalAlpha = 0.65;
        ctx.fillRect(x - 1, y - 1, Math.max(1, Math.floor(r * 0.5)), 1);
        ctx.restore();
        break;
      }

      case 'acid': {
        ctx.save();
        const rx = Math.max(3, Math.round(5 * scale));
        const ry = Math.max(2, Math.round(3.2 * scale));
        ctx.fillStyle = '#205918';
        ctx.globalAlpha = 0.75;
        fillPixelOval(ctx, x, y + 1, rx + 1, ry + 1);
        ctx.fillStyle = decal.color || '#57c936';
        ctx.globalAlpha = 0.82;
        fillPixelOval(ctx, x, y, rx, ry);
        ctx.fillStyle = '#b4ff66';
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x - Math.max(1, Math.floor(rx * 0.4)), y - 1, Math.max(2, Math.floor(rx * 0.5)), 1);
        ctx.fillRect(x + 1, y + 1, 1, 1);
        ctx.restore();
        break;
      }

      case 'rubble': {
        ctx.save();
        ctx.fillStyle = decal.color || '#5e5046';
        const s = Math.max(2, Math.round(3 * scale));
        ctx.fillRect(x - s, y - 1, s, s);
        ctx.fillStyle = '#29211d';
        ctx.fillRect(x - s, y + s - 1, s, 1);
        ctx.fillStyle = decal.color || '#78695e';
        ctx.fillRect(x + 1, y - s + 1, Math.max(1, s - 1), Math.max(1, s - 1));
        ctx.restore();
        break;
      }

      case 'casing': {
        if (decal.sprite) {
          const drew = this.sprites.draw(ctx, decal.sprite, x, y, {
            rotation: decal.angle,
            pixelSnap: true,
          });
          if (drew) return;
        }
        const col = (decal.color || '#e3b842').toLowerCase();
        const isShotgunShell = col === '#c83e37' || col === '#d94538';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(decal.angle || 0);
        if (isShotgunShell) {
          ctx.fillStyle = '#120d10';
          ctx.fillRect(-3, -2, 6, 4);
          ctx.fillStyle = '#d9382e';
          ctx.fillRect(-2, -1, 3, 2);
          ctx.fillStyle = '#f2c744';
          ctx.fillRect(1, -1, 1, 2);
        } else {
          ctx.fillStyle = '#16110e';
          ctx.fillRect(-2, -1, 5, 3);
          ctx.fillStyle = decal.color || '#e6c04c';
          ctx.fillRect(-1, 0, 3, 1);
          ctx.fillStyle = '#fff5b8';
          ctx.fillRect(-1, 0, 1, 1);
        }
        ctx.restore();
        break;
      }

      case 'footstep': {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = decal.color || '#1c1512';
        ctx.fillRect(x - 1, y - 1, 3, 2);
        ctx.restore();
        break;
      }
    }
  }

  /**
   * Stamps a compact directional skid smear onto the persistent floor buffer
   * (used for high-velocity flying corpses skidding across the arena).
   */
  bakeSkidMark(x: number, y: number, vx: number, vy: number, color: string = '#6e141c'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const spd = Math.hypot(vx, vy);
    if (spd < 0.2) return;
    const nx = vx / spd;
    const ny = vy / spd;
    const ix = Math.round(x);
    const iy = Math.round(y);
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = color;
    ctx.fillRect(ix - 1, iy, 3, 2);
    ctx.fillRect(Math.round(ix - nx * 2), Math.round(iy - ny * 2), 2, 1);
    ctx.restore();
  }
}
