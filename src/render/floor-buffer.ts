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
 * Persistent offscreen level floor canvas (map.width * 16 x map.height * 16).
 * - Renders biome floor tiles (sprFloor*, sprFloor*B & sprDetail* intact variety,
 *   sprFloor*Explo strictly for wall blasts, Carpet red rug when Steam sprCarpet absent)
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
  private pixelScale = 2;
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
   * Rebuilds the entire persistent floor buffer for a newly entered level.
   */
  rebuild(map: WorldMap, areaDef?: AreaDef): void {
    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.tileSize = map.tileSize || TILE_SIZE;
    this.bakedDecalCount = 0;
    this.lastTiles = new Uint8Array(map.tiles);

    const logicalW = Math.max(1, this.mapWidth * this.tileSize);
    const logicalH = Math.max(1, this.mapHeight * this.tileSize);
    // Use crisp 2x Hi-Bit backing scale whenever the map fits comfortably within 4096px texture bounds
    const desiredScale = logicalW * 2 <= 4096 && logicalH * 2 <= 4096 ? 2 : 1;
    const pixelW = logicalW * desiredScale;
    const pixelH = logicalH * desiredScale;

    if (!this.canvas || this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas = createOffscreenCanvas(pixelW, pixelH);
      this.ctx = this.canvas
        ? (this.canvas.getContext('2d') as FloorCtx | null)
        : null;
    }

    if (!this.ctx) {
      this.pixelScale = 1;
      return;
    }
    if (typeof this.ctx.setTransform === 'function') {
      this.pixelScale = desiredScale;
      this.ctx.setTransform(desiredScale, 0, 0, desiredScale, 0, 0);
    } else {
      this.pixelScale = 1;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, logicalW, logicalH);

    const pal = BIOME_FALLBACK_PALETTES[map.biome] ?? BIOME_FALLBACK_PALETTES.desert;
    this.ctx.fillStyle = pal.voidBg;
    this.ctx.fillRect(0, 0, logicalW, logicalH);

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
      // Subtle atmospheric subterranean rock/bedrock strata instead of flat dead void!
      ctx.fillStyle = pal.voidBg;
      ctx.fillRect(px, py, ts, ts);
      const vh = tileHash(tx, ty, 59);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      if ((vh & 3) === 0) {
        ctx.fillRect(px + (vh % 5), py + 3 + ((vh >>> 3) % 6), 8 + (vh % 6), 2);
      } else if ((vh & 3) === 1) {
        ctx.fillRect(px + 1, py + 10 + ((vh >>> 4) % 4), 11, 1.5);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      if ((vh & 7) === 2) {
        ctx.fillRect(px + 2 + ((vh >>> 5) % 6), py + 5 + ((vh >>> 8) % 6), 6, 2);
      }
      return;
    }

    const variant = map.floorVariants[idx] ?? ((tx * 7 + ty * 13) & 3);
    const { floorSprite, floorAltSprite, floorExploSprite, detailSprite } = this.resolveBiomeSprites(map, areaDef);

    // Draw base biome floor tile first (handles both 32x32 Steam tiles and 16x16 fallback tiles seamlessly)
    const floorDef = this.sprites.getSprite(floorSprite);
    let drewBase = false;
    if (floorDef && floorDef.frames.length > 0) {
      const f0 = floorDef.frames[0]!;
      if (f0.targetW >= ts * 2 && f0.targetH >= ts * 2) {
        // 32x32 Steam floor slab: sample aligned 16x16 quadrant so adjacent tiles form cohesive slabs
        const slabTx = tx & ~1;
        const slabTy = ty & ~1;
        const slabVariant = map.floorVariants[slabTy * map.width + slabTx] ?? variant;
        const subX = (tx & 1) * ts;
        const subY = (ty & 1) * ts;
        drewBase = this.sprites.drawSubRect(ctx, floorSprite, slabVariant, subX, subY, ts, ts, px, py, ts, ts);

        // Subtle intact-floor variety using authentic Steam sprFloor*B slabs (~14% of intact 2x2 floor blocks)
        if (
          drewBase &&
          tile === TileType.Floor &&
          this.sprites.hasSprite(floorAltSprite) &&
          isIntactSlab2x2(map, slabTx, slabTy)
        ) {
          const sh = tileHash(slabTx >> 1, slabTy >> 1, 7);
          if (sh % 7 === 0) {
            const altDef = this.sprites.getSprite(floorAltSprite);
            if (altDef && altDef.width >= ts * 2 && altDef.height >= ts * 2) {
              const altFrame = (sh >>> 4) % Math.max(1, altDef.frames.length);
              ctx.save();
              ctx.beginPath();
              ctx.rect(px, py, ts, ts);
              ctx.clip();
              this.sprites.draw(ctx, floorAltSprite, slabTx * ts, slabTy * ts, {
                frame: altFrame,
                pixelSnap: true,
              });
              ctx.restore();
            }
          }
        }
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

    // Sparse authentic Steam floor micro-details (sprDetail*) on intact non-carpet tiles
    if (tile === TileType.Floor && this.sprites.hasSprite(detailSprite)) {
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
        ctx.fillStyle = pal.voidBg;
        ctx.fillRect(px + 5, py + 4, 2, 6);
        ctx.fillRect(px + 7, py + 8, 4, 2);
      }
    }

    // Palace / Vault Red Carpet: skip procedural carpet on 7-3 when Steam sprCarpet is available
    // so sprCarpet renders cleanly with zero mismatched double gold borders
    if (tile === TileType.Carpet) {
      const useSteamThroneCarpet = map.areaCode === '7-3' && this.sprites.hasSprite('sprCarpet');
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

    // Rich royal Palace crimson damask carpet with braided gold filigree trim & edge shadow
    ctx.fillStyle = '#6b1420';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = '#8f1b2b';
    ctx.fillRect(px + 0.5, py + 0.5, ts - 1, ts - 1);

    // Subtle woven damask diamond motif
    ctx.fillStyle = '#7a1624';
    ctx.fillRect(px + 3, py + 3, 3, 3);
    ctx.fillRect(px + 10, py + 10, 3, 3);
    ctx.fillStyle = '#a32334';
    ctx.fillRect(px + 4, py + 4, 1, 1);
    ctx.fillRect(px + 11, py + 11, 1, 1);

    // Braided antique gold border & dark inner piping along exposed edges
    const drawEdge = (ex: number, ey: number, ew: number, eh: number): void => {
      ctx.fillStyle = '#d9ad45';
      ctx.fillRect(ex, ey, ew, eh);
    };
    if (!leftCarpet) {
      drawEdge(px, py, 2, ts);
      ctx.fillStyle = '#fff0a6';
      ctx.fillRect(px + 0.5, py, 0.5, ts);
      ctx.fillStyle = '#470c14';
      ctx.fillRect(px + 2, py, 1, ts);
    }
    if (!rightCarpet) {
      drawEdge(px + ts - 2, py, 2, ts);
      ctx.fillStyle = '#9e7422';
      ctx.fillRect(px + ts - 1, py, 1, ts);
      ctx.fillStyle = '#470c14';
      ctx.fillRect(px + ts - 3, py, 1, ts);
    }
    if (!topCarpet) {
      drawEdge(px, py, ts, 2);
      ctx.fillStyle = '#fff0a6';
      ctx.fillRect(px, py + 0.5, ts, 0.5);
      ctx.fillStyle = '#470c14';
      ctx.fillRect(px, py + 2, ts, 1);
    }
    if (!botCarpet) {
      drawEdge(px, py + ts - 2, ts, 2);
      ctx.fillStyle = '#470c14';
      ctx.fillRect(px, py + ts - 3, ts, 1);
    }
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
        const baseColor = decal.color || '#9e1924';
        const r = Math.max(2, 3.4 * scale);
        const ang = decal.angle || 0;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const seed = tileHash(x, y, Math.round(ang * 31));

        // Helper for crisp organic pixel splatter blob (zero rectangular boxes!)
        const blob = (bx: number, by: number, rx: number, ry: number): void => {
          const iry = Math.max(1, Math.ceil(ry * 2));
          for (let dy2 = -iry; dy2 <= iry; dy2++) {
            const ny = dy2 / Math.max(1, iry);
            const span = Math.sqrt(Math.max(0, 1 - ny * ny)) * rx;
            if (span >= 0.25) {
              ctx.fillRect(bx - span, by + dy2 * 0.5, span * 2, 0.6);
            }
          }
        };

        // Dark grounded dried-edge rim
        ctx.fillStyle = '#33070d';
        ctx.globalAlpha = 0.62;
        blob(x, y + 0.5, r + 1.1, r * 0.72 + 0.8);

        // Multi-lobe organic splatter pool
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.90;
        blob(x, y, r, r * 0.68);
        blob(x + cosA * (r * 0.7), y + sinA * (r * 0.55), r * 0.72, r * 0.52);
        blob(
          x + (((seed & 7) - 3.5) * 0.55),
          y + ((((seed >>> 4) & 7) - 3.5) * 0.45),
          r * 0.65,
          r * 0.48,
        );

        // Directional spray fan & tapered droplets along impact vector (Odinfall gore juice!)
        for (let k = 1; k <= 6; k++) {
          const h = tileHash(x + k * 7, y - k * 5, seed);
          const spread = ((h % 100) / 100 - 0.5) * 1.15;
          const dist = r * 0.8 + k * 1.85 * Math.max(0.75, scale * 0.8);
          const dx = Math.cos(ang + spread) * dist;
          const dy = Math.sin(ang + spread) * dist;
          const sz = k <= 2 ? 1.5 : k <= 4 ? 1 : 0.5;
          ctx.fillRect(x + dx, y + dy, sz, sz);
        }
        // Subtle glossy wet crimson specular speck
        ctx.fillStyle = '#de2e3f';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x - r * 0.35, y - r * 0.25, Math.max(1, r * 0.55), 0.5);
        ctx.restore();
        break;
      }

      case 'acid': {
        ctx.save();
        const r = Math.max(3, 5 * scale);
        ctx.fillStyle = '#205918';
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.ellipse(x, y + 0.5, r + 1, r * 0.68 + 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = decal.color || '#57c936';
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b4ff66';
        ctx.globalAlpha = 0.58;
        ctx.fillRect(x - r * 0.4, y - r * 0.2, r * 0.6, 1);
        ctx.fillRect(x + r * 0.2, y + r * 0.15, 1, 1);
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
