import { TILE_SIZE, TileType, type WorldMap } from '@/contracts';

export interface SolidBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
  hitWall: boolean;
}

export interface RayHit {
  hit: boolean;
  hitX: number;
  hitY: number;
  normalX: number;
  normalY: number;
  tileX: number;
  tileY: number;
  t: number;
}

export interface SegmentCircleHitResult {
  hit: boolean;
  t: number;
  hitX: number;
  hitY: number;
}

const PUSH_EPS = 1e-4;

export function worldToTile(
  worldX: number,
  worldY: number,
  tileSize: number = TILE_SIZE,
): { tx: number; ty: number } {
  return {
    tx: Math.floor(worldX / tileSize),
    ty: Math.floor(worldY / tileSize),
  };
}

export function tileToWorldCenter(
  tx: number,
  ty: number,
  tileSize: number = TILE_SIZE,
): { x: number; y: number } {
  return {
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize,
  };
}

export function isWalkableTile(tile: TileType): boolean {
  return (
    tile === TileType.Floor ||
    tile === TileType.FloorCracked ||
    tile === TileType.Carpet
  );
}

export function isSolidTile(tile: TileType): boolean {
  return !isWalkableTile(tile);
}

export function getTile(map: WorldMap, tx: number, ty: number): TileType {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
    return TileType.Wall;
  }
  return map.tiles[ty * map.width + tx] as TileType;
}

export function setTile(
  map: WorldMap,
  tx: number,
  ty: number,
  tile: TileType,
): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
    return false;
  }
  const idx = ty * map.width + tx;
  const prev = map.tiles[idx] as TileType;
  if (prev === tile) {
    return false;
  }
  const wasWalkable = isWalkableTile(prev);
  const nowWalkable = isWalkableTile(tile);
  map.tiles[idx] = tile;
  if (wasWalkable !== nowWalkable) {
    map.walkableCount += nowWalkable ? 1 : -1;
  }
  return true;
}

export function isWorldSolid(
  map: WorldMap,
  worldX: number,
  worldY: number,
): boolean {
  const ts = map.tileSize || TILE_SIZE;
  const tx = Math.floor(worldX / ts);
  const ty = Math.floor(worldY / ts);
  return isSolidTile(getTile(map, tx, ty));
}

/**
 * Recomputes map.wallMask for the given tile rectangle (inclusive).
 * Bit layout (matches WorldMap contract):
 *   bit0 (1)  = North solid neighbor
 *   bit1 (2)  = East solid neighbor
 *   bit2 (4)  = South solid neighbor
 *   bit3 (8)  = West solid neighbor
 *   bit4 (16) = hasFloorBelow (south tile is walkable -> 2.5D front face)
 */
export function computeWallAutotile(
  map: WorldMap,
  minTx: number = 0,
  minTy: number = 0,
  maxTx: number = map.width - 1,
  maxTy: number = map.height - 1,
): void {
  const x0 = Math.max(0, minTx);
  const y0 = Math.max(0, minTy);
  const x1 = Math.min(map.width - 1, maxTx);
  const y1 = Math.min(map.height - 1, maxTy);

  for (let ty = y0; ty <= y1; ty++) {
    const rowOff = ty * map.width;
    for (let tx = x0; tx <= x1; tx++) {
      const tile = map.tiles[rowOff + tx] as TileType;
      if (!isSolidTile(tile)) {
        map.wallMask[rowOff + tx] = 0;
        continue;
      }
      let mask = 0;
      if (isSolidTile(getTile(map, tx, ty - 1))) mask |= 1;
      if (isSolidTile(getTile(map, tx + 1, ty))) mask |= 2;
      const southTile = getTile(map, tx, ty + 1);
      if (isSolidTile(southTile)) {
        mask |= 4;
      } else if (ty + 1 < map.height && isWalkableTile(southTile)) {
        mask |= 16;
      }
      if (isSolidTile(getTile(map, tx - 1, ty))) mask |= 8;
      map.wallMask[rowOff + tx] = mask;
    }
  }
}

/**
 * Converts Wall tiles whose centers fall within radiusPx of (worldX, worldY)
 * into TileType.FloorCracked, updates walkableCount and neighborhood wallMask,
 * and returns the number of carved tiles.
 */
export function carveCircle(
  map: WorldMap,
  worldX: number,
  worldY: number,
  radiusPx: number,
  preserveOuterBorder: boolean = true,
): number {
  if (radiusPx <= 0) return 0;

  const ts = map.tileSize || TILE_SIZE;
  const margin = preserveOuterBorder
    ? Math.min(2, Math.floor((Math.min(map.width, map.height) - 1) / 2))
    : 0;
  const minBoundX = margin;
  const maxBoundX = map.width - 1 - margin;
  const minBoundY = margin;
  const maxBoundY = map.height - 1 - margin;

  const minTx = Math.max(minBoundX, Math.floor((worldX - radiusPx) / ts));
  const maxTx = Math.min(maxBoundX, Math.floor((worldX + radiusPx) / ts));
  const minTy = Math.max(minBoundY, Math.floor((worldY - radiusPx) / ts));
  const maxTy = Math.min(maxBoundY, Math.floor((worldY + radiusPx) / ts));

  const rSq = radiusPx * radiusPx;
  let carved = 0;
  let changedMinX = map.width;
  let changedMinY = map.height;
  let changedMaxX = -1;
  let changedMaxY = -1;

  for (let ty = minTy; ty <= maxTy; ty++) {
    const cy = (ty + 0.5) * ts;
    const dy = cy - worldY;
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cx = (tx + 0.5) * ts;
      const dx = cx - worldX;
      if (dx * dx + dy * dy > rSq) continue;
      if (getTile(map, tx, ty) === TileType.Wall) {
        if (setTile(map, tx, ty, TileType.FloorCracked)) {
          carved += 1;
          if (tx < changedMinX) changedMinX = tx;
          if (ty < changedMinY) changedMinY = ty;
          if (tx > changedMaxX) changedMaxX = tx;
          if (ty > changedMaxY) changedMaxY = ty;
        }
      }
    }
  }

  if (carved > 0) {
    computeWallAutotile(
      map,
      changedMinX - 1,
      changedMinY - 1,
      changedMaxX + 1,
      changedMaxY + 1,
    );
  }

  return carved;
}

function circleOverlapsBox(
  cx: number,
  cy: number,
  r: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const nearX = cx < x0 ? x0 : cx > x1 ? x1 : cx;
  const nearY = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  const vx = cx - nearX;
  const vy = cy - nearY;
  return vx * vx + vy * vy < r * r;
}

/**
 * Checks whether a circle at (x, y) with given radius overlaps any solid tile
 * or optional extra solid AABB.
 */
export function isCircleOverlappingSolid(
  map: WorldMap,
  x: number,
  y: number,
  radius: number,
  extraSolidBoxes?: readonly SolidBox[],
): boolean {
  const r = Math.max(0, radius);
  const ts = map.tileSize || TILE_SIZE;
  const minTx = Math.floor((x - r) / ts);
  const maxTx = Math.floor((x + r) / ts);
  const minTy = Math.floor((y - r) / ts);
  const maxTy = Math.floor((y + r) / ts);

  for (let ty = minTy; ty <= maxTy; ty++) {
    const y0 = ty * ts;
    const y1 = y0 + ts;
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(getTile(map, tx, ty))) continue;
      const x0 = tx * ts;
      const x1 = x0 + ts;
      if (circleOverlapsBox(x, y, r, x0, y0, x1, y1)) {
        return true;
      }
    }
  }

  if (extraSolidBoxes) {
    for (let i = 0; i < extraSolidBoxes.length; i++) {
      const b = extraSolidBoxes[i]!;
      if (circleOverlapsBox(x, y, r, b.x, b.y, b.x + b.w, b.y + b.h)) {
        return true;
      }
    }
  }

  return false;
}

function depenetrateCircleOnce(
  map: WorldMap,
  cx: number,
  cy: number,
  r: number,
  extraSolidBoxes?: readonly SolidBox[],
): { x: number; y: number; pushedX: boolean; pushedY: boolean } {
  const ts = map.tileSize || TILE_SIZE;
  const minTx = Math.floor((cx - r) / ts);
  const maxTx = Math.floor((cx + r) / ts);
  const minTy = Math.floor((cy - r) / ts);
  const maxTy = Math.floor((cy + r) / ts);

  let x = cx;
  let y = cy;
  let pushedX = false;
  let pushedY = false;

  const pushBox = (x0: number, y0: number, x1: number, y1: number): void => {
    const nearX = x < x0 ? x0 : x > x1 ? x1 : x;
    const nearY = y < y0 ? y0 : y > y1 ? y1 : y;
    const vx = x - nearX;
    const vy = y - nearY;
    const distSq = vx * vx + vy * vy;
    if (distSq >= r * r) return;

    if (distSq > 1e-12) {
      const dist = Math.sqrt(distSq);
      const pen = r - dist + PUSH_EPS;
      const nx = vx / dist;
      const ny = vy / dist;
      x += nx * pen;
      y += ny * pen;
      if (Math.abs(nx) > 1e-5) pushedX = true;
      if (Math.abs(ny) > 1e-5) pushedY = true;
    } else {
      // Circle center is inside the box; push out along shallowest axis
      const dLeft = x - x0;
      const dRight = x1 - x;
      const dTop = y - y0;
      const dBottom = y1 - y;
      const minD = Math.min(dLeft, dRight, dTop, dBottom);
      if (minD === dLeft) {
        x = x0 - r - PUSH_EPS;
        pushedX = true;
      } else if (minD === dRight) {
        x = x1 + r + PUSH_EPS;
        pushedX = true;
      } else if (minD === dTop) {
        y = y0 - r - PUSH_EPS;
        pushedY = true;
      } else {
        y = y1 + r + PUSH_EPS;
        pushedY = true;
      }
    }
  };

  for (let ty = minTy; ty <= maxTy; ty++) {
    const y0 = ty * ts;
    const y1 = y0 + ts;
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(getTile(map, tx, ty))) continue;
      const x0 = tx * ts;
      pushBox(x0, y0, x0 + ts, y1);
    }
  }

  if (extraSolidBoxes) {
    for (let i = 0; i < extraSolidBoxes.length; i++) {
      const b = extraSolidBoxes[i]!;
      pushBox(b.x, b.y, b.x + b.w, b.y + b.h);
    }
  }

  return { x, y, pushedX, pushedY };
}

function resolveAxisX(
  map: WorldMap,
  prevX: number,
  cx: number,
  cy: number,
  r: number,
  stepDx: number,
  extraSolidBoxes?: readonly SolidBox[],
): { x: number; hit: boolean } {
  const ts = map.tileSize || TILE_SIZE;
  const minTx = Math.floor((cx - r) / ts);
  const maxTx = Math.floor((cx + r) / ts);
  const minTy = Math.floor((cy - r) / ts);
  const maxTy = Math.floor((cy + r) / ts);

  let x = cx;
  let hit = false;

  const resolveBox = (x0: number, y0: number, x1: number, y1: number): void => {
    const nearY = cy < y0 ? y0 : cy > y1 ? y1 : cy;
    const vy = cy - nearY;
    const vySq = vy * vy;
    if (vySq >= r * r) return;
    if (!circleOverlapsBox(x, cy, r, x0, y0, x1, y1)) return;

    const horizReach = Math.sqrt(Math.max(0, r * r - vySq));
    if (stepDx > 0) {
      const target = x0 - horizReach - PUSH_EPS;
      if (x > target && prevX <= x0 + PUSH_EPS) {
        x = target;
        hit = true;
      } else if (x < (x0 + x1) * 0.5) {
        x = Math.min(x, target);
        hit = true;
      } else {
        x = Math.max(x, x1 + horizReach + PUSH_EPS);
        hit = true;
      }
    } else if (stepDx < 0) {
      const target = x1 + horizReach + PUSH_EPS;
      if (x < target && prevX >= x1 - PUSH_EPS) {
        x = target;
        hit = true;
      } else if (x >= (x0 + x1) * 0.5) {
        x = Math.max(x, target);
        hit = true;
      } else {
        x = Math.min(x, x0 - horizReach - PUSH_EPS);
        hit = true;
      }
    }
  };

  for (let ty = minTy; ty <= maxTy; ty++) {
    const y0 = ty * ts;
    const y1 = y0 + ts;
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(getTile(map, tx, ty))) continue;
      const x0 = tx * ts;
      resolveBox(x0, y0, x0 + ts, y1);
    }
  }

  if (extraSolidBoxes) {
    for (let i = 0; i < extraSolidBoxes.length; i++) {
      const b = extraSolidBoxes[i]!;
      resolveBox(b.x, b.y, b.x + b.w, b.y + b.h);
    }
  }

  return { x, hit };
}

function resolveAxisY(
  map: WorldMap,
  cx: number,
  prevY: number,
  cy: number,
  r: number,
  stepDy: number,
  extraSolidBoxes?: readonly SolidBox[],
): { y: number; hit: boolean } {
  const ts = map.tileSize || TILE_SIZE;
  const minTx = Math.floor((cx - r) / ts);
  const maxTx = Math.floor((cx + r) / ts);
  const minTy = Math.floor((cy - r) / ts);
  const maxTy = Math.floor((cy + r) / ts);

  let y = cy;
  let hit = false;

  const resolveBox = (x0: number, y0: number, x1: number, y1: number): void => {
    const nearX = cx < x0 ? x0 : cx > x1 ? x1 : cx;
    const vx = cx - nearX;
    const vxSq = vx * vx;
    if (vxSq >= r * r) return;
    if (!circleOverlapsBox(cx, y, r, x0, y0, x1, y1)) return;

    const vertReach = Math.sqrt(Math.max(0, r * r - vxSq));
    if (stepDy > 0) {
      const target = y0 - vertReach - PUSH_EPS;
      if (y > target && prevY <= y0 + PUSH_EPS) {
        y = target;
        hit = true;
      } else if (y < (y0 + y1) * 0.5) {
        y = Math.min(y, target);
        hit = true;
      } else {
        y = Math.max(y, y1 + vertReach + PUSH_EPS);
        hit = true;
      }
    } else if (stepDy < 0) {
      const target = y1 + vertReach + PUSH_EPS;
      if (y < target && prevY >= y1 - PUSH_EPS) {
        y = target;
        hit = true;
      } else if (y >= (y0 + y1) * 0.5) {
        y = Math.max(y, target);
        hit = true;
      } else {
        y = Math.min(y, y0 - vertReach - PUSH_EPS);
        hit = true;
      }
    }
  };

  for (let ty = minTy; ty <= maxTy; ty++) {
    const y0 = ty * ts;
    const y1 = y0 + ts;
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(getTile(map, tx, ty))) continue;
      const x0 = tx * ts;
      resolveBox(x0, y0, x0 + ts, y1);
    }
  }

  if (extraSolidBoxes) {
    for (let i = 0; i < extraSolidBoxes.length; i++) {
      const b = extraSolidBoxes[i]!;
      resolveBox(b.x, b.y, b.x + b.w, b.y + b.h);
    }
  }

  return { y, hit };
}

/**
 * Axis-separated circle-vs-tile-AABB collision resolution with clean wall sliding
 * and automatic substepping. Guarantees the circle never embeds in a solid wall.
 */
export function moveCircleWithSlide(
  map: WorldMap,
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  extraSolidBoxes?: readonly SolidBox[],
): MoveResult {
  const r = Math.max(0.5, radius);
  const ts = map.tileSize || TILE_SIZE;
  let cx = x;
  let cy = y;
  let hitX = false;
  let hitY = false;

  // Escape any pre-existing overlap before moving
  if (isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) {
    for (let iter = 0; iter < 6; iter++) {
      const dep = depenetrateCircleOnce(map, cx, cy, r, extraSolidBoxes);
      cx = dep.x;
      cy = dep.y;
      if (dep.pushedX) hitX = true;
      if (dep.pushedY) hitY = true;
      if (!isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) break;
    }
  }

  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy, hitX, hitY, hitWall: hitX || hitY };
  }

  const maxStep = Math.max(2, Math.min(r * 0.5, ts * 0.45));
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep),
  );
  const stepDx = dx / steps;
  const stepDy = dy / steps;

  for (let s = 0; s < steps; s++) {
    // 1. Resolve X axis
    if (stepDx !== 0) {
      const prevX = cx;
      const resX = resolveAxisX(map, prevX, cx + stepDx, cy, r, stepDx, extraSolidBoxes);
      cx = resX.x;
      if (resX.hit) hitX = true;

      if (isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) {
        // Second pass in case clamping touched a neighboring corner
        const resX2 = resolveAxisX(map, prevX, cx, cy, r, stepDx, extraSolidBoxes);
        cx = resX2.x;
        if (resX2.hit) hitX = true;
        if (isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) {
          cx = prevX;
          hitX = true;
        }
      }
    }

    // 2. Resolve Y axis
    if (stepDy !== 0) {
      const prevY = cy;
      const resY = resolveAxisY(map, cx, prevY, cy + stepDy, r, stepDy, extraSolidBoxes);
      cy = resY.y;
      if (resY.hit) hitY = true;

      if (isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) {
        const resY2 = resolveAxisY(map, cx, prevY, cy, r, stepDy, extraSolidBoxes);
        cy = resY2.y;
        if (resY2.hit) hitY = true;
        if (isCircleOverlappingSolid(map, cx, cy, r, extraSolidBoxes)) {
          cy = prevY;
          hitY = true;
        }
      }
    }
  }

  return {
    x: cx,
    y: cy,
    hitX,
    hitY,
    hitWall: hitX || hitY,
  };
}

function sweptCircleVsAabb(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  r: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): { hit: boolean; t: number; normalX: number; normalY: number } {
  // Check immediate overlap at t = 0
  const nearX = x0 < bx0 ? bx0 : x0 > bx1 ? bx1 : x0;
  const nearY = y0 < by0 ? by0 : y0 > by1 ? by1 : y0;
  const vx0 = x0 - nearX;
  const vy0 = y0 - nearY;
  const distSq0 = vx0 * vx0 + vy0 * vy0;
  const rSq = r * r;

  if (distSq0 < rSq - 1e-7) {
    if (distSq0 > 1e-12) {
      const d = Math.sqrt(distSq0);
      return { hit: true, t: 0, normalX: vx0 / d, normalY: vy0 / d };
    }
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      return { hit: true, t: 0, normalX: -dx / len, normalY: -dy / len };
    }
    return { hit: true, t: 0, normalX: 0, normalY: -1 };
  }

  const a = dx * dx + dy * dy;
  if (a === 0) {
    return { hit: false, t: 1, normalX: 0, normalY: 0 };
  }

  let bestT = Infinity;
  let bestNx = 0;
  let bestNy = 0;

  // 4 Minkowski-expanded axis faces
  if (dx > 0) {
    const t = (bx0 - r - x0) / dx;
    if (t >= -1e-7 && t <= 1) {
      const tc = t < 0 ? 0 : t;
      if (tc < bestT) {
        const hy = y0 + dy * tc;
        if (hy >= by0 && hy <= by1) {
          bestT = tc;
          bestNx = -1;
          bestNy = 0;
        }
      }
    }
  } else if (dx < 0) {
    const t = (bx1 + r - x0) / dx;
    if (t >= -1e-7 && t <= 1) {
      const tc = t < 0 ? 0 : t;
      if (tc < bestT) {
        const hy = y0 + dy * tc;
        if (hy >= by0 && hy <= by1) {
          bestT = tc;
          bestNx = 1;
          bestNy = 0;
        }
      }
    }
  }

  if (dy > 0) {
    const t = (by0 - r - y0) / dy;
    if (t >= -1e-7 && t <= 1) {
      const tc = t < 0 ? 0 : t;
      if (tc < bestT) {
        const hx = x0 + dx * tc;
        if (hx >= bx0 && hx <= bx1) {
          bestT = tc;
          bestNx = 0;
          bestNy = -1;
        }
      }
    }
  } else if (dy < 0) {
    const t = (by1 + r - y0) / dy;
    if (t >= -1e-7 && t <= 1) {
      const tc = t < 0 ? 0 : t;
      if (tc < bestT) {
        const hx = x0 + dx * tc;
        if (hx >= bx0 && hx <= bx1) {
          bestT = tc;
          bestNx = 0;
          bestNy = 1;
        }
      }
    }
  }

  // 4 Minkowski-expanded corner circles
  const cornersX = [bx0, bx1, bx0, bx1];
  const cornersY = [by0, by0, by1, by1];
  for (let i = 0; i < 4; i++) {
    const kx = cornersX[i]!;
    const ky = cornersY[i]!;
    const fx = x0 - kx;
    const fy = y0 - ky;
    const b = 2 * (fx * dx + fy * dy);
    if (b >= 0) continue; // Moving away from corner
    const c = fx * fx + fy * fy - rSq;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    let t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 && c <= 1e-7) t = 0;
    if (t >= 0 && t <= 1 && t < bestT) {
      const hx = x0 + dx * t;
      const hy = y0 + dy * t;
      const nx = hx - kx;
      const ny = hy - ky;
      const nLen = Math.hypot(nx, ny);
      bestT = t;
      if (nLen > 1e-9) {
        bestNx = nx / nLen;
        bestNy = ny / nLen;
      } else {
        const vLen = Math.sqrt(a);
        bestNx = -dx / vLen;
        bestNy = -dy / vLen;
      }
    }
  }

  if (bestT <= 1) {
    return { hit: true, t: bestT, normalX: bestNx, normalY: bestNy };
  }
  return { hit: false, t: 1, normalX: 0, normalY: 0 };
}

/**
 * Exact swept segment (radius = 0, Amanatides-Woo DDA) or swept circle (radius > 0,
 * exact Minkowski rounded-AABB intersection) against solid map tiles.
 * Guaranteed zero tunneling at arbitrary speeds (40–1000+ px/tick).
 */
export function sweptRayTile(
  map: WorldMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number = 0,
): RayHit {
  const ts = map.tileSize || TILE_SIZE;
  const dx = x1 - x0;
  const dy = y1 - y0;

  if (radius <= 0) {
    let tx = Math.floor(x0 / ts);
    let ty = Math.floor(y0 / ts);

    if (isSolidTile(getTile(map, tx, ty))) {
      const len = Math.hypot(dx, dy);
      return {
        hit: true,
        hitX: x0,
        hitY: y0,
        normalX: len > 1e-9 ? -dx / len : 0,
        normalY: len > 1e-9 ? -dy / len : -1,
        tileX: tx,
        tileY: ty,
        t: 0,
      };
    }

    if (dx === 0 && dy === 0) {
      return {
        hit: false,
        hitX: x1,
        hitY: y1,
        normalX: 0,
        normalY: 0,
        tileX: tx,
        tileY: ty,
        t: 1,
      };
    }

    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? Math.abs(ts / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(ts / dy) : Infinity;

    let tMaxX =
      dx > 0
        ? ((tx + 1) * ts - x0) / dx
        : dx < 0
          ? (tx * ts - x0) / dx
          : Infinity;
    let tMaxY =
      dy > 0
        ? ((ty + 1) * ts - y0) / dy
        : dy < 0
          ? (ty * ts - y0) / dy
          : Infinity;

    const maxSteps =
      Math.abs(Math.floor(x1 / ts) - tx) +
      Math.abs(Math.floor(y1 / ts) - ty) +
      4;

    for (let i = 0; i < maxSteps; i++) {
      const nextT = Math.min(tMaxX, tMaxY);
      if (nextT > 1) break;

      if (tMaxX < tMaxY) {
        const t = tMaxX;
        tx += stepX;
        tMaxX += tDeltaX;
        if (isSolidTile(getTile(map, tx, ty))) {
          return {
            hit: true,
            hitX: x0 + dx * t,
            hitY: y0 + dy * t,
            normalX: -stepX,
            normalY: 0,
            tileX: tx,
            tileY: ty,
            t,
          };
        }
      } else if (tMaxY < tMaxX) {
        const t = tMaxY;
        ty += stepY;
        tMaxY += tDeltaY;
        if (isSolidTile(getTile(map, tx, ty))) {
          return {
            hit: true,
            hitX: x0 + dx * t,
            hitY: y0 + dy * t,
            normalX: 0,
            normalY: -stepY,
            tileX: tx,
            tileY: ty,
            t,
          };
        }
      } else {
        // Exact grid corner crossing: prevent diagonal tunneling through touching corners
        const t = tMaxX;
        if (isSolidTile(getTile(map, tx + stepX, ty))) {
          return {
            hit: true,
            hitX: x0 + dx * t,
            hitY: y0 + dy * t,
            normalX: -stepX,
            normalY: 0,
            tileX: tx + stepX,
            tileY: ty,
            t,
          };
        }
        if (isSolidTile(getTile(map, tx, ty + stepY))) {
          return {
            hit: true,
            hitX: x0 + dx * t,
            hitY: y0 + dy * t,
            normalX: 0,
            normalY: -stepY,
            tileX: tx,
            tileY: ty + stepY,
            t,
          };
        }
        tx += stepX;
        ty += stepY;
        tMaxX += tDeltaX;
        tMaxY += tDeltaY;
        if (isSolidTile(getTile(map, tx, ty))) {
          const inv = Math.SQRT1_2;
          return {
            hit: true,
            hitX: x0 + dx * t,
            hitY: y0 + dy * t,
            normalX: -stepX * inv,
            normalY: -stepY * inv,
            tileX: tx,
            tileY: ty,
            t,
          };
        }
      }
    }

    return {
      hit: false,
      hitX: x1,
      hitY: y1,
      normalX: 0,
      normalY: 0,
      tileX: Math.floor(x1 / ts),
      tileY: Math.floor(y1 / ts),
      t: 1,
    };
  }

  // Swept circle (radius > 0): row-clipped exact scan along the swept corridor
  const r = radius;
  const globalMinTx = Math.floor((Math.min(x0, x1) - r) / ts);
  const globalMaxTx = Math.floor((Math.max(x0, x1) + r) / ts);
  const globalMinTy = Math.floor((Math.min(y0, y1) - r) / ts);
  const globalMaxTy = Math.floor((Math.max(y0, y1) + r) / ts);

  let bestHit = false;
  let bestT = Infinity;
  let bestNx = 0;
  let bestNy = 0;
  let bestTx = Math.floor(x1 / ts);
  let bestTy = Math.floor(y1 / ts);

  for (let ty = globalMinTy; ty <= globalMaxTy; ty++) {
    const by0 = ty * ts;
    const by1 = by0 + ts;

    let rowMinTx = globalMinTx;
    let rowMaxTx = globalMaxTx;
    if (dy !== 0) {
      const tA = (by0 - r - y0) / dy;
      const tB = (by1 + r - y0) / dy;
      const tLo = Math.max(0, Math.min(tA, tB));
      const tHi = Math.min(1, Math.max(tA, tB));
      if (tHi < tLo) continue;
      const xA = x0 + dx * tLo;
      const xB = x0 + dx * tHi;
      rowMinTx = Math.max(globalMinTx, Math.floor((Math.min(xA, xB) - r) / ts));
      rowMaxTx = Math.min(globalMaxTx, Math.floor((Math.max(xA, xB) + r) / ts));
    }

    for (let tx = rowMinTx; tx <= rowMaxTx; tx++) {
      if (!isSolidTile(getTile(map, tx, ty))) continue;
      const bx0 = tx * ts;
      const bx1 = bx0 + ts;
      const res = sweptCircleVsAabb(x0, y0, dx, dy, r, bx0, by0, bx1, by1);
      if (res.hit && res.t < bestT) {
        bestHit = true;
        bestT = res.t;
        bestNx = res.normalX;
        bestNy = res.normalY;
        bestTx = tx;
        bestTy = ty;
        if (bestT === 0) break;
      }
    }
    if (bestT === 0) break;
  }

  if (bestHit) {
    return {
      hit: true,
      hitX: x0 + dx * bestT,
      hitY: y0 + dy * bestT,
      normalX: bestNx,
      normalY: bestNy,
      tileX: bestTx,
      tileY: bestTy,
      t: bestT,
    };
  }

  return {
    hit: false,
    hitX: x1,
    hitY: y1,
    normalX: 0,
    normalY: 0,
    tileX: Math.floor(x1 / ts),
    tileY: Math.floor(y1 / ts),
    t: 1,
  };
}

export function hasLineOfSight(
  map: WorldMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return !sweptRayTile(map, x0, y0, x1, y1, 0).hit;
}

/**
 * Finds the nearest walkable floor position to (x, y) within maxRadiusTiles.
 * Returns (x, y) immediately if it is already on a walkable tile; otherwise
 * returns the center of the closest walkable tile, falling back to map spawn.
 */
export function findNearestFloor(
  map: WorldMap,
  x: number,
  y: number,
  maxRadiusTiles: number = 16,
): { x: number; y: number } {
  const ts = map.tileSize || TILE_SIZE;
  const startTx = Math.floor(x / ts);
  const startTy = Math.floor(y / ts);

  if (isWalkableTile(getTile(map, startTx, startTy))) {
    return { x, y };
  }

  let bestDistSq = Infinity;
  let bestTx = -1;
  let bestTy = -1;

  for (let rad = 1; rad <= maxRadiusTiles; rad++) {
    const minTx = Math.max(0, startTx - rad);
    const maxTx = Math.min(map.width - 1, startTx + rad);
    const minTy = Math.max(0, startTy - rad);
    const maxTy = Math.min(map.height - 1, startTy + rad);

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        // Inspect ring perimeter only
        if (
          tx !== startTx - rad &&
          tx !== startTx + rad &&
          ty !== startTy - rad &&
          ty !== startTy + rad
        ) {
          continue;
        }
        if (!isWalkableTile(getTile(map, tx, ty))) continue;
        const cx = (tx + 0.5) * ts;
        const cy = (ty + 0.5) * ts;
        const dSq = (cx - x) * (cx - x) + (cy - y) * (cy - y);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestTx = tx;
          bestTy = ty;
        }
      }
    }

    if (bestTx !== -1) {
      return tileToWorldCenter(bestTx, bestTy, ts);
    }
  }

  return { x: map.spawnX, y: map.spawnY };
}

export function circleOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const rr = r1 + r2;
  return dx * dx + dy * dy <= rr * rr;
}

/**
 * Exact earliest intersection between segment (x0, y0) -> (x1, y1) and circle (cx, cy, radius).
 */
export function segmentCircleHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  radius: number,
): SegmentCircleHitResult {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const rSq = radius * radius;
  if (fx * fx + fy * fy <= rSq) {
    return { hit: true, t: 0, hitX: x0, hitY: y0 };
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx * dx + dy * dy;
  if (a === 0) {
    return { hit: false, t: 1, hitX: x1, hitY: y1 };
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - rSq;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return { hit: false, t: 1, hitX: x1, hitY: y1 };
  }

  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t >= 0 && t <= 1) {
    return { hit: true, t, hitX: x0 + dx * t, hitY: y0 + dy * t };
  }

  return { hit: false, t: 1, hitX: x1, hitY: y1 };
}
