import {
  TILE_SIZE,
  TileType,
  type AreaDef,
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
import { SpriteRenderer } from './sprites';

type FloorCanvas = HTMLCanvasElement | OffscreenCanvas;
type FloorCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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

/**
 * Persistent offscreen level floor canvas (map.width * 16 x map.height * 16).
 * - Renders biome floor tiles (sprFloor*, sprFloor*Explo, Carpet red rug for 7-3/Vault)
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
  private lastTiles: Uint8Array | null = null;
  private bakedDecalCount = 0;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.sprites = new SpriteRenderer(bundle);
    this.data = data;
  }

  setBundle(bundle: AssetBundle): void {
    this.sprites.setBundle(bundle);
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
  }

  getCanvas(): FloorCanvas | null {
    return this.canvas;
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
    floorExploSprite: string;
  } {
    const area = areaDef ?? this.data.getArea(map.areaCode) ?? this.data.getAreaByBiome(map.biome);
    if (area) {
      return {
        floorSprite: area.floorSprite,
        floorExploSprite: area.floorExploSprite,
      };
    }
    const num = BIOME_SPRITE_NUMBER[map.biome] ?? 1;
    return {
      floorSprite: `sprFloor${num}`,
      floorExploSprite: `sprFloor${num}Explo`,
    };
  }

  /**
   * Rebuilds the entire persistent floor buffer for a newly entered level.
   */
  rebuild(map: WorldMap, areaDef?: AreaDef): void {
    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.tileSize = map.tileSize || TILE_SIZE;
    this.bakedDecalCount = 0;
    this.lastTiles = new Uint8Array(map.tiles);

    const pixelW = Math.max(1, this.mapWidth * this.tileSize);
    const pixelH = Math.max(1, this.mapHeight * this.tileSize);

    if (!this.canvas || this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas = createOffscreenCanvas(pixelW, pixelH);
      this.ctx = this.canvas
        ? (this.canvas.getContext('2d') as FloorCtx | null)
        : null;
    }

    if (!this.ctx) return;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, pixelW, pixelH);

    const pal = BIOME_FALLBACK_PALETTES[map.biome] ?? BIOME_FALLBACK_PALETTES.desert;
    this.ctx.fillStyle = pal.voidBg;
    this.ctx.fillRect(0, 0, pixelW, pixelH);

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
      ctx.fillStyle = pal.voidBg;
      ctx.fillRect(px, py, ts, ts);
      return;
    }

    const variant = map.floorVariants[idx] ?? ((tx * 7 + ty * 13) & 3);
    const { floorSprite, floorExploSprite } = this.resolveBiomeSprites(map, areaDef);

    // Draw base biome floor tile first (handles both 32x32 Steam tiles and 16x16 fallback tiles seamlessly)
    const floorDef = this.sprites.getSprite(floorSprite);
    let drewBase = false;
    if (floorDef && floorDef.frames.length > 0) {
      const f0 = floorDef.frames[0]!;
      if (f0.srcW >= ts * 2 && f0.srcH >= ts * 2) {
        // 32x32 Steam floor slab: sample aligned 16x16 quadrant so adjacent tiles form cohesive slabs
        const slabVariant =
          map.floorVariants[Math.floor(ty / 2) * 2 * map.width + Math.floor(tx / 2) * 2] ?? variant;
        const subX = (tx & 1) * ts;
        const subY = (ty & 1) * ts;
        drewBase = this.sprites.drawSubRect(ctx, floorSprite, slabVariant, subX, subY, ts, ts, px, py, ts, ts);
      } else {
        drewBase = this.sprites.draw(ctx, floorSprite, px, py, { frame: variant, pixelSnap: true });
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

    // Cracked / carved floor overlay
    if (tile === TileType.FloorCracked) {
      const drewExplo = this.sprites.draw(ctx, floorExploSprite, px, py, {
        frame: variant,
        pixelSnap: true,
      });
      if (!drewExplo) {
        ctx.fillStyle = pal.floorCracked;
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.fillStyle = pal.voidBg;
        ctx.fillRect(px + 5, py + 4, 2, 6);
        ctx.fillRect(px + 7, py + 8, 4, 2);
      }
    }

    // Palace / Vault Red Carpet
    if (tile === TileType.Carpet) {
      this.drawCarpetTile(ctx, map, tx, ty, px, py, ts);
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

    // Rich Nuclear Throne Palace crimson carpet with golden trim on outer edges
    ctx.fillStyle = '#7d1924';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = '#99202e';
    ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);

    // Subtle woven pattern
    ctx.fillStyle = '#871c28';
    ctx.fillRect(px + 3, py + 3, 2, 2);
    ctx.fillRect(px + 11, py + 11, 2, 2);

    // Golden Palace border along exposed edges
    ctx.fillStyle = '#d4a843';
    if (!leftCarpet) ctx.fillRect(px, py, 2, ts);
    if (!rightCarpet) ctx.fillRect(px + ts - 2, py, 2, ts);
    if (!topCarpet) ctx.fillRect(px, py, ts, 2);
    if (!botCarpet) ctx.fillRect(px, py + ts - 2, ts, 2);

    ctx.fillStyle = '#521018';
    if (!leftCarpet) ctx.fillRect(px + 2, py, 1, ts);
    if (!rightCarpet) ctx.fillRect(px + ts - 3, py, 1, ts);
    if (!topCarpet) ctx.fillRect(px, py + 2, ts, 1);
    if (!botCarpet) ctx.fillRect(px, py + ts - 3, ts, 1);
  }

  /**
   * Permanently bakes a battle decal (blood, scorch, rubble, acid, settled corpse, casing)
   * into the level's persistent offscreen floor canvas.
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
          scaleX: scale,
          scaleY: scale,
          alpha: 0.82,
          pixelSnap: true,
        });
        if (!drew) {
          const r = Math.max(4, Math.round(10 * scale));
          ctx.save();
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#2d2326';
          ctx.fillRect(x - r - 1, y - Math.round(r * 0.75), r * 2 + 2, Math.round(r * 1.5));
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = decal.color || '#181316';
          ctx.fillRect(x - r, y - Math.round(r * 0.65), r * 2, Math.round(r * 1.3));
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = '#0c080b';
          ctx.fillRect(x - Math.round(r * 0.55), y - Math.round(r * 0.35), Math.round(r * 1.1), Math.round(r * 0.7));
          ctx.restore();
        }
        break;
      }

      case 'blood': {
        ctx.save();
        const baseColor = decal.color || '#961a24';
        const r = Math.max(2, Math.round(3.2 * scale));
        const ang = decal.angle || 0;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        // Dark grounded rim stain
        ctx.fillStyle = '#3b090f';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(
          x - r - 1,
          y - Math.max(1, Math.floor(r * 0.75)),
          r * 2 + 2,
          Math.max(3, Math.round(r * 1.5)),
        );

        // Core splatter pool
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.88;
        ctx.fillRect(
          x - r,
          y - Math.max(1, Math.floor(r * 0.65)),
          r * 2,
          Math.max(2, Math.round(r * 1.3)),
        );

        // Directional spray streak & deterministic satellite droplets along impact vector
        for (let k = 1; k <= 4; k++) {
          const spread = (k % 2 === 0 ? 1 : -1) * (0.28 * k);
          const dist = r + k * 2.1 * Math.max(0.8, scale * 0.75);
          const dx = Math.round(Math.cos(ang + spread) * dist);
          const dy = Math.round(Math.sin(ang + spread) * dist);
          const sz = k <= 2 ? 2 : 1;
          ctx.fillRect(x + dx, y + dy, sz, sz);
        }
        // Forward smear blotch along primary spray direction
        const sx = Math.round(cosA * (r + 1));
        const sy = Math.round(sinA * (r + 1));
        ctx.fillRect(x + sx - 1, y + sy - 1, Math.max(2, Math.round(r * 0.8)), 2);
        // Subtle glossy crimson wet highlight
        ctx.fillStyle = '#cf2938';
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x - Math.max(1, Math.floor(r * 0.4)), y - Math.max(1, Math.floor(r * 0.3)), Math.max(1, Math.floor(r * 0.8)), 1);
        ctx.restore();
        break;
      }

      case 'acid': {
        ctx.save();
        ctx.fillStyle = decal.color || '#57c936';
        ctx.globalAlpha = 0.6;
        const r = Math.max(3, Math.round(5 * scale));
        ctx.fillRect(x - r, y - Math.round(r * 0.65), r * 2, Math.round(r * 1.3));
        ctx.fillStyle = '#a8ff5e';
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x - Math.floor(r * 0.5), y - Math.floor(r * 0.3), r, Math.max(1, Math.floor(r * 0.6)));
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
    ctx.fillRect(Math.round(ix - nx * 2.5), Math.round(iy - ny * 2.5), 2, 1);
    ctx.restore();
  }
}
