import {
  TILE_SIZE,
  TileType,
  type AreaCode,
  type BiomeId,
  type WorldMap,
} from '@/contracts';
import type { SeededRng } from '@/sim/core/rng';
import {
  computeWallAutotile,
  getTile,
  isWalkableTile,
  setTile,
  tileToWorldCenter,
  worldToTile,
} from '@/sim/collision/grid';

export interface WorldGenOptions {
  targetFloors?: number;
  walkerCount?: number;
  darkness?: number;
}

export interface ConnectivityResult {
  connected: boolean;
  reachable: number;
  totalWalkable: number;
}

interface BiomeWalkerProfile {
  width: number;
  height: number;
  targetFloors: number;
  walkerCount: number;
  darkness: number;
  turnChance: number;
  reverseChance: number;
  stamp2Chance: number;
  stamp3Chance: number;
  stamp4Chance: number;
  spawnChance: number;
  despawnChance: number;
  carpetChance: number;
  rectilinear?: boolean;
}

const OUTER_MARGIN = 2;

const DIR_X = [0, 1, 0, -1] as const;
const DIR_Y = [-1, 0, 1, 0] as const;

export function getDefaultAreaGenParams(
  areaCode: AreaCode,
  biome: BiomeId,
  loop: number,
): BiomeWalkerProfile {
  const loopSafe = Math.max(0, Math.floor(loop));
  const loopScale = Math.min(1.6, 1 + loopSafe * 0.18);
  const loopWalkers = Math.min(3, loopSafe);

  let base: BiomeWalkerProfile;

  switch (areaCode) {
    case '1-1':
      base = {
        width: 52,
        height: 52,
        targetFloors: 205,
        walkerCount: 2,
        darkness: 0,
        turnChance: 0.36,
        reverseChance: 0.08,
        stamp2Chance: 0.44,
        stamp3Chance: 0.18,
        stamp4Chance: 0.02,
        spawnChance: 0.06,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '1-2':
      base = {
        width: 56,
        height: 56,
        targetFloors: 245,
        walkerCount: 3,
        darkness: 0,
        turnChance: 0.35,
        reverseChance: 0.08,
        stamp2Chance: 0.45,
        stamp3Chance: 0.2,
        stamp4Chance: 0.03,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '1-3':
      base = {
        width: 58,
        height: 58,
        targetFloors: 280,
        walkerCount: 3,
        darkness: 0,
        turnChance: 0.34,
        reverseChance: 0.07,
        stamp2Chance: 0.42,
        stamp3Chance: 0.26,
        stamp4Chance: 0.05,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '2-1':
      base = {
        width: 58,
        height: 58,
        targetFloors: 255,
        walkerCount: 3,
        darkness: 0.52,
        turnChance: 0.24,
        reverseChance: 0.05,
        stamp2Chance: 0.36,
        stamp3Chance: 0.08,
        stamp4Chance: 0,
        spawnChance: 0.05,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '3-1':
      base = {
        width: 60,
        height: 60,
        targetFloors: 285,
        walkerCount: 3,
        darkness: 0,
        turnChance: 0.32,
        reverseChance: 0.06,
        stamp2Chance: 0.4,
        stamp3Chance: 0.3,
        stamp4Chance: 0.08,
        spawnChance: 0.08,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case '3-2':
      base = {
        width: 62,
        height: 62,
        targetFloors: 315,
        walkerCount: 4,
        darkness: 0,
        turnChance: 0.32,
        reverseChance: 0.06,
        stamp2Chance: 0.4,
        stamp3Chance: 0.32,
        stamp4Chance: 0.09,
        spawnChance: 0.08,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case '3-3':
      base = {
        width: 64,
        height: 64,
        targetFloors: 350,
        walkerCount: 4,
        darkness: 0,
        turnChance: 0.3,
        reverseChance: 0.05,
        stamp2Chance: 0.38,
        stamp3Chance: 0.34,
        stamp4Chance: 0.12,
        spawnChance: 0.08,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '4-1':
      base = {
        width: 62,
        height: 62,
        targetFloors: 305,
        walkerCount: 3,
        darkness: 0.46,
        turnChance: 0.28,
        reverseChance: 0.06,
        stamp2Chance: 0.32,
        stamp3Chance: 0.34,
        stamp4Chance: 0.1,
        spawnChance: 0.07,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case '5-1':
      base = {
        width: 64,
        height: 64,
        targetFloors: 315,
        walkerCount: 3,
        darkness: 0,
        turnChance: 0.18,
        reverseChance: 0.03,
        stamp2Chance: 0.5,
        stamp3Chance: 0.26,
        stamp4Chance: 0.05,
        spawnChance: 0.06,
        despawnChance: 0.04,
        carpetChance: 0,
        rectilinear: true,
      };
      break;
    case '5-2':
      base = {
        width: 66,
        height: 66,
        targetFloors: 345,
        walkerCount: 4,
        darkness: 0,
        turnChance: 0.18,
        reverseChance: 0.03,
        stamp2Chance: 0.48,
        stamp3Chance: 0.28,
        stamp4Chance: 0.06,
        spawnChance: 0.06,
        despawnChance: 0.04,
        carpetChance: 0,
        rectilinear: true,
      };
      break;
    case '5-3':
      base = {
        width: 68,
        height: 68,
        targetFloors: 375,
        walkerCount: 4,
        darkness: 0,
        turnChance: 0.19,
        reverseChance: 0.03,
        stamp2Chance: 0.46,
        stamp3Chance: 0.32,
        stamp4Chance: 0.08,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0,
        rectilinear: true,
      };
      break;
    case '6-1':
      base = {
        width: 60,
        height: 60,
        targetFloors: 310,
        walkerCount: 4,
        darkness: 0.6,
        turnChance: 0.4,
        reverseChance: 0.05,
        stamp2Chance: 0.36,
        stamp3Chance: 0.38,
        stamp4Chance: 0.04,
        spawnChance: 0.08,
        despawnChance: 0.05,
        carpetChance: 0,
        rectilinear: true,
      };
      break;
    case '7-1':
      base = {
        width: 66,
        height: 66,
        targetFloors: 350,
        walkerCount: 4,
        darkness: 0.12,
        turnChance: 0.22,
        reverseChance: 0.04,
        stamp2Chance: 0.42,
        stamp3Chance: 0.36,
        stamp4Chance: 0.1,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0.16,
        rectilinear: true,
      };
      break;
    case '7-2':
      base = {
        width: 68,
        height: 68,
        targetFloors: 380,
        walkerCount: 4,
        darkness: 0.15,
        turnChance: 0.22,
        reverseChance: 0.04,
        stamp2Chance: 0.4,
        stamp3Chance: 0.38,
        stamp4Chance: 0.12,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0.18,
        rectilinear: true,
      };
      break;
    case '7-3':
      base = {
        width: 44,
        height: 76,
        targetFloors: 680,
        walkerCount: 1,
        darkness: 0.15,
        turnChance: 0,
        reverseChance: 0,
        stamp2Chance: 0,
        stamp3Chance: 0,
        stamp4Chance: 0,
        spawnChance: 0,
        despawnChance: 0,
        carpetChance: 0,
      };
      break;
    case '0-1':
      base = {
        width: 44,
        height: 44,
        targetFloors: 420,
        walkerCount: 3,
        darkness: 0.08,
        turnChance: 0.35,
        reverseChance: 0.1,
        stamp2Chance: 0.4,
        stamp3Chance: 0.35,
        stamp4Chance: 0.1,
        spawnChance: 0.05,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case 'vault':
      base = {
        width: 38,
        height: 46,
        targetFloors: 320,
        walkerCount: 1,
        darkness: 0.25,
        turnChance: 0,
        reverseChance: 0,
        stamp2Chance: 0,
        stamp3Chance: 0,
        stamp4Chance: 0,
        spawnChance: 0,
        despawnChance: 0,
        carpetChance: 0,
      };
      break;
    case '1-?': // Oasis
      base = {
        width: 58,
        height: 58,
        targetFloors: 340,
        walkerCount: 3,
        darkness: 0,
        turnChance: 0.3,
        reverseChance: 0.08,
        stamp2Chance: 0.35,
        stamp3Chance: 0.4,
        stamp4Chance: 0.15,
        spawnChance: 0.07,
        despawnChance: 0.04,
        carpetChance: 0,
      };
      break;
    case '2-?': // Pizza Sewers
      base = {
        width: 38,
        height: 38,
        targetFloors: 260,
        walkerCount: 2,
        darkness: 0.45,
        turnChance: 0.3,
        reverseChance: 0.05,
        stamp2Chance: 0.4,
        stamp3Chance: 0.25,
        stamp4Chance: 0.05,
        spawnChance: 0.05,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case '3-?': // Y.V.'s Mansion
      base = {
        width: 58,
        height: 58,
        targetFloors: 320,
        walkerCount: 4,
        darkness: 0.05,
        turnChance: 0.24,
        reverseChance: 0.04,
        stamp2Chance: 0.44,
        stamp3Chance: 0.34,
        stamp4Chance: 0.08,
        spawnChance: 0.06,
        despawnChance: 0.04,
        carpetChance: 0.25,
        rectilinear: true,
      };
      break;
    case '4-?': // Cursed Crystal Caves
      base = {
        width: 64,
        height: 64,
        targetFloors: 360,
        walkerCount: 4,
        darkness: 0.58,
        turnChance: 0.3,
        reverseChance: 0.06,
        stamp2Chance: 0.32,
        stamp3Chance: 0.36,
        stamp4Chance: 0.12,
        spawnChance: 0.08,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case '5-?': // Jungle
      base = {
        width: 68,
        height: 68,
        targetFloors: 400,
        walkerCount: 5,
        darkness: 0.22,
        turnChance: 0.44,
        reverseChance: 0.1,
        stamp2Chance: 0.46,
        stamp3Chance: 0.22,
        stamp4Chance: 0.04,
        spawnChance: 0.09,
        despawnChance: 0.05,
        carpetChance: 0,
      };
      break;
    case 'hq-1': // IDPD HQ
      base = {
        width: 64,
        height: 64,
        targetFloors: 340,
        walkerCount: 4,
        darkness: 0.1,
        turnChance: 0.2,
        reverseChance: 0.03,
        stamp2Chance: 0.45,
        stamp3Chance: 0.32,
        stamp4Chance: 0.08,
        spawnChance: 0.06,
        despawnChance: 0.04,
        carpetChance: 0.22,
        rectilinear: true,
      };
      break;
  }

  // Fallback darkness hints by biome if mismatched area/biome combo is requested
  if (
    biome === 'sewers' ||
    biome === 'caves' ||
    biome === 'cursed_caves' ||
    biome === 'labs'
  ) {
    base.darkness = Math.max(base.darkness, 0.45);
  }

  if (areaCode !== '7-3' && areaCode !== 'vault' && areaCode !== '0-1') {
    const scaledFloors = Math.round(base.targetFloors * loopScale);
    const maxPlayableArea = (base.width - OUTER_MARGIN * 2) * (base.height - OUTER_MARGIN * 2);
    if (scaledFloors > maxPlayableArea * 0.55) {
      const grow = Math.min(16, Math.ceil((scaledFloors / 0.55) ** 0.5) - base.width + 6);
      if (grow > 0) {
        base.width += grow;
        base.height += grow;
      }
    }
    base.targetFloors = scaledFloors;
    base.walkerCount = Math.min(8, base.walkerCount + loopWalkers);
  }

  return base;
}

function createBlankMap(
  width: number,
  height: number,
  areaCode: AreaCode,
  biome: BiomeId,
  loop: number,
  darkness: number,
): WorldMap {
  const total = width * height;
  const tiles = new Uint8Array(total);
  tiles.fill(TileType.Wall);
  const floorVariants = new Uint8Array(total);
  const wallMask = new Uint8Array(total);
  return {
    width,
    height,
    tileSize: TILE_SIZE,
    tiles,
    floorVariants,
    wallMask,
    spawnX: (Math.floor(width / 2) + 0.5) * TILE_SIZE,
    spawnY: (Math.floor(height / 2) + 0.5) * TILE_SIZE,
    biome,
    areaCode,
    loop,
    darkness,
    walkableCount: 0,
  };
}

function carveRectSafe(
  map: WorldMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tile: TileType = TileType.Floor,
): void {
  const minX = Math.max(OUTER_MARGIN, Math.min(x0, x1));
  const maxX = Math.min(map.width - 1 - OUTER_MARGIN, Math.max(x0, x1));
  const minY = Math.max(OUTER_MARGIN, Math.min(y0, y1));
  const maxY = Math.min(map.height - 1 - OUTER_MARGIN, Math.max(y0, y1));
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      setTile(map, tx, ty, tile);
    }
  }
}

function carveStampSafe(
  map: WorldMap,
  cx: number,
  cy: number,
  size: number,
  tile: TileType = TileType.Floor,
): void {
  const halfLo = Math.floor((size - 1) / 2);
  const halfHi = Math.ceil((size - 1) / 2);
  carveRectSafe(map, cx - halfLo, cy - halfHi, cx + halfHi, cy + halfLo, tile);
}

function carveSpawnPlaza(map: WorldMap, spawnTx: number, spawnTy: number): void {
  const clampedX = Math.max(OUTER_MARGIN + 1, Math.min(map.width - OUTER_MARGIN - 2, spawnTx));
  const clampedY = Math.max(OUTER_MARGIN + 1, Math.min(map.height - OUTER_MARGIN - 2, spawnTy));

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = clampedX + dx;
      const ty = clampedY + dy;
      const cur = getTile(map, tx, ty);
      if (!isWalkableTile(cur)) {
        setTile(map, tx, ty, TileType.Floor);
      }
    }
  }

  const center = tileToWorldCenter(clampedX, clampedY, map.tileSize);
  map.spawnX = center.x;
  map.spawnY = center.y;
}

/**
 * Generates the canonical 7-3 Nuclear Throne Hall:
 * Long straight red-carpet hall leading north to the Throne dais,
 * flanked by parallel side corridors and 4 generator alcoves.
 */
function buildNuclearThroneHall(map: WorldMap, rng: SeededRng): { spawnTx: number; spawnTy: number } {
  const cx = Math.floor(map.width / 2);
  const southEnd = map.height - 7;
  const daisTop = 7;
  const daisBottom = 21;

  // 1. Central grand hall (9 tiles wide: cx - 4 .. cx + 4)
  carveRectSafe(map, cx - 4, daisTop, cx + 4, southEnd, TileType.Floor);

  // 2. Throne Dais chamber at north end (19 tiles wide)
  carveRectSafe(map, cx - 9, daisTop, cx + 9, daisBottom, TileType.Floor);
  // Throne carpet platform on the dais
  carveRectSafe(map, cx - 3, daisTop + 2, cx + 3, daisTop + 8, TileType.Carpet);

  // 3. Long straight red carpet running from south spawn plaza up to the Throne dais
  carveRectSafe(map, cx - 1, daisTop + 8, cx + 1, southEnd - 1, TileType.Carpet);

  // 4. South entrance vestibule (spawn plaza)
  const spawnTy = southEnd - 3;
  carveRectSafe(map, cx - 5, southEnd - 5, cx + 5, southEnd, TileType.Floor);
  carveRectSafe(map, cx - 1, southEnd - 5, cx + 1, southEnd - 1, TileType.Carpet);

  // 5. Parallel West & East side corridors for dodging the Throne's central beam
  const westOuter = cx - 13;
  const westInner = cx - 10;
  const eastInner = cx + 10;
  const eastOuter = cx + 13;

  carveRectSafe(map, westOuter, daisTop + 4, westInner, southEnd - 6, TileType.Floor);
  carveRectSafe(map, eastInner, daisTop + 4, eastOuter, southEnd - 6, TileType.Floor);

  // 6. Cross-passages linking main hall and side corridors
  const passageYs = [daisBottom + 6, daisBottom + 16, daisBottom + 26, southEnd - 10];
  for (let i = 0; i < passageYs.length; i++) {
    const py = passageYs[i]!;
    if (py < southEnd - 6 && py > daisBottom) {
      carveRectSafe(map, westInner, py - 1, cx - 4, py + 1, TileType.Floor);
      carveRectSafe(map, cx + 4, py - 1, eastInner, py + 1, TileType.Floor);
    }
  }
  // Connect top of side corridors directly into the Throne dais chamber
  carveRectSafe(map, westInner, daisTop + 6, cx - 9, daisTop + 9, TileType.Floor);
  carveRectSafe(map, cx + 9, daisTop + 6, eastInner, daisTop + 9, TileType.Floor);

  // 7. Four Generator Alcoves (2 West, 2 East) along the upper-mid flanks
  const genYs = [daisTop + 12, daisBottom + 10];
  for (let i = 0; i < genYs.length; i++) {
    const gy = genYs[i]!;
    // West generator alcove (recessed pocket opening into west corridor & main hall)
    carveRectSafe(map, westOuter - 4, gy - 2, westOuter, gy + 2, TileType.Floor);
    carveRectSafe(map, westInner, gy - 1, cx - 4, gy + 1, TileType.Floor);
    // East generator alcove
    carveRectSafe(map, eastOuter, gy - 2, eastOuter + 4, gy + 2, TileType.Floor);
    carveRectSafe(map, cx + 4, gy - 1, eastInner, gy + 1, TileType.Floor);
  }

  // 8. Ornate pillars along the grand hall sides (kept strictly off the carpet)
  const pillarRows = [daisBottom + 3, daisBottom + 12, daisBottom + 22, daisBottom + 32, southEnd - 14];
  for (let i = 0; i < pillarRows.length; i++) {
    const py = pillarRows[i]!;
    if (py > daisBottom + 1 && py < southEnd - 8) {
      // Small deterministic alcove pockets on outer hall edge
      if (rng.chance(0.5)) {
        carveRectSafe(map, cx - 6, py - 1, cx - 5, py + 1, TileType.Floor);
        carveRectSafe(map, cx + 5, py - 1, cx + 6, py + 1, TileType.Floor);
      }
    }
  }

  // Subtle floor wear near outer edges while keeping red carpet pristine
  for (let ty = OUTER_MARGIN; ty < map.height - OUTER_MARGIN; ty++) {
    for (let tx = OUTER_MARGIN; tx < map.width - OUTER_MARGIN; tx++) {
      if (getTile(map, tx, ty) === TileType.Floor && rng.chance(0.03)) {
        setTile(map, tx, ty, TileType.FloorCracked);
      }
    }
  }

  return { spawnTx: cx, spawnTy };
}

/**
 * Generates the 0-1 Campfire / Throne II circular wasteland arena.
 */
function buildCampfireArena(map: WorldMap, rng: SeededRng): { spawnTx: number; spawnTy: number } {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  const baseRad = Math.min(map.width, map.height) * 0.34;

  // Rugged circular clearing
  for (let ty = OUTER_MARGIN; ty < map.height - OUTER_MARGIN; ty++) {
    for (let tx = OUTER_MARGIN; tx < map.width - OUTER_MARGIN; tx++) {
      const dx = tx - cx;
      const dy = ty - cy;
      const angle = Math.atan2(dy, dx);
      const wobble = Math.sin(angle * 5 + 0.7) * 1.4 + Math.cos(angle * 3 - 0.4) * 1.2;
      const r = baseRad + wobble;
      if (dx * dx + dy * dy <= r * r) {
        setTile(map, tx, ty, TileType.Floor);
      }
    }
  }

  // A few short outward walkers to create organic rocky coves around the perimeter
  for (let w = 0; w < 6; w++) {
    const ang = (w / 6) * Math.PI * 2 + rng.range(-0.25, 0.25);
    let wx = Math.round(cx + Math.cos(ang) * (baseRad - 2));
    let wy = Math.round(cy + Math.sin(ang) * (baseRad - 2));
    for (let s = 0; s < 10; s++) {
      const dir = rng.int(0, 3);
      wx = Math.max(OUTER_MARGIN + 1, Math.min(map.width - OUTER_MARGIN - 2, wx + DIR_X[dir]!));
      wy = Math.max(OUTER_MARGIN + 1, Math.min(map.height - OUTER_MARGIN - 2, wy + DIR_Y[dir]!));
      carveStampSafe(map, wx, wy, rng.chance(0.5) ? 3 : 2, TileType.Floor);
    }
  }

  return { spawnTx: cx, spawnTy: cy };
}

/**
 * Generates the Crown Vault symmetrical temple layout.
 */
function buildCrownVault(map: WorldMap, rng: SeededRng): { spawnTx: number; spawnTy: number } {
  const cx = Math.floor(map.width / 2);
  const southY = map.height - 6;
  const chamberCenterY = 17;

  // South entrance room
  carveRectSafe(map, cx - 4, southY - 4, cx + 4, southY, TileType.Floor);
  // Central carpeted approach corridor
  carveRectSafe(map, cx - 2, chamberCenterY + 6, cx + 2, southY - 4, TileType.Floor);
  carveRectSafe(map, cx - 1, chamberCenterY + 5, cx + 1, southY - 1, TileType.Carpet);

  // Grand octagonal Crown Chamber
  for (let ty = chamberCenterY - 8; ty <= chamberCenterY + 8; ty++) {
    for (let tx = cx - 9; tx <= cx + 9; tx++) {
      const manhattan = Math.abs(tx - cx) + Math.abs(ty - chamberCenterY);
      if (manhattan <= 13) {
        setTile(map, tx, ty, TileType.Floor);
      }
    }
  }
  // Red carpet cross on the Crown pedestal
  carveRectSafe(map, cx - 2, chamberCenterY - 2, cx + 2, chamberCenterY + 2, TileType.Carpet);
  carveRectSafe(map, cx - 1, chamberCenterY - 5, cx + 1, chamberCenterY + 5, TileType.Carpet);

  // Two side guardian alcoves
  carveRectSafe(map, cx - 13, chamberCenterY - 3, cx - 9, chamberCenterY + 3, TileType.Floor);
  carveRectSafe(map, cx + 9, chamberCenterY - 3, cx + 13, chamberCenterY + 3, TileType.Floor);

  // Minor weathered detail
  if (rng.chance(0.8)) {
    for (let i = 0; i < 6; i++) {
      const tx = cx + rng.int(-7, 7);
      const ty = chamberCenterY + rng.int(-6, 6);
      if (getTile(map, tx, ty) === TileType.Floor) {
        setTile(map, tx, ty, TileType.FloorCracked);
      }
    }
  }

  return { spawnTx: cx, spawnTy: southY - 2 };
}

/**
 * Generates Pizza Sewers (2-?) compact square chamber with 4 corner tunnels.
 */
function buildPizzaSewers(map: WorldMap, rng: SeededRng): { spawnTx: number; spawnTy: number } {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // Central arena
  carveRectSafe(map, cx - 7, cy - 7, cx + 7, cy + 7, TileType.Floor);

  // 4 symmetric sewer tunnels + corner alcoves
  const offsets = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;
  for (let i = 0; i < offsets.length; i++) {
    const ox = offsets[i]![0];
    const oy = offsets[i]![1];
    carveRectSafe(map, cx + ox * 5, cy + oy * 5, cx + ox * 12, cy + oy * 7, TileType.Floor);
    carveRectSafe(map, cx + ox * 5, cy + oy * 5, cx + ox * 7, cy + oy * 12, TileType.Floor);
    carveRectSafe(map, cx + ox * 9, cy + oy * 9, cx + ox * 13, cy + oy * 13, TileType.Floor);
  }

  // Slight organic sewer roughing
  for (let w = 0; w < 2; w++) {
    let wx = cx;
    let wy = cy;
    let dir = rng.int(0, 3);
    for (let step = 0; step < 30; step++) {
      if (rng.chance(0.35)) dir = rng.int(0, 3);
      wx = Math.max(OUTER_MARGIN + 1, Math.min(map.width - OUTER_MARGIN - 2, wx + DIR_X[dir]!));
      wy = Math.max(OUTER_MARGIN + 1, Math.min(map.height - OUTER_MARGIN - 2, wy + DIR_Y[dir]!));
      carveStampSafe(map, wx, wy, 2, TileType.Floor);
    }
  }

  return { spawnTx: cx, spawnTy: cy };
}

/**
 * Drunken-walker procedural dungeon generator tuned per biome.
 */
function runDrunkenWalkers(
  map: WorldMap,
  profile: BiomeWalkerProfile,
  rng: SeededRng,
): { spawnTx: number; spawnTy: number } {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // Guarantee initial 3x3 spawn plaza at center
  carveRectSafe(map, cx - 1, cy - 1, cx + 1, cy + 1, TileType.Floor);

  interface Walker {
    x: number;
    y: number;
    dir: number;
  }

  const walkers: Walker[] = [];
  const initCount = Math.max(1, profile.walkerCount);
  for (let i = 0; i < initCount; i++) {
    walkers.push({
      x: cx,
      y: cy,
      dir: (i + rng.int(0, 3)) & 3,
    });
  }

  const minBound = OUTER_MARGIN + 1;
  const maxBoundX = map.width - OUTER_MARGIN - 2;
  const maxBoundY = map.height - OUTER_MARGIN - 2;
  const maxWalkers = Math.max(initCount + 3, 8);
  const maxIterations = Math.max(profile.targetFloors * 14, 1800);

  for (let iter = 0; iter < maxIterations && map.walkableCount < profile.targetFloors; iter++) {
    for (let wi = 0; wi < walkers.length && map.walkableCount < profile.targetFloors; wi++) {
      const w = walkers[wi]!;

      // Choose direction
      const rollDir = rng.next();
      if (rollDir < profile.reverseChance) {
        w.dir = (w.dir + 2) & 3;
      } else if (rollDir < profile.reverseChance + profile.turnChance) {
        w.dir = (w.dir + (rng.chance(0.5) ? 1 : 3)) & 3;
      }

      const stride = profile.rectilinear && rng.chance(0.45) ? 2 : 1;
      for (let st = 0; st < stride; st++) {
        let nx = w.x + DIR_X[w.dir]!;
        let ny = w.y + DIR_Y[w.dir]!;

        // Bounce cleanly off playable boundary (preserving 2-tile outer margin)
        if (nx < minBound || nx > maxBoundX || ny < minBound || ny > maxBoundY) {
          w.dir = (w.dir + (rng.chance(0.5) ? 1 : 3)) & 3;
          nx = Math.max(minBound, Math.min(maxBoundX, w.x + DIR_X[w.dir]!));
          ny = Math.max(minBound, Math.min(maxBoundY, w.y + DIR_Y[w.dir]!));
        }
        w.x = nx;
        w.y = ny;

        // Stamp size selection
        const stampRoll = rng.next();
        let stampSize = 1;
        if (stampRoll < profile.stamp4Chance) {
          stampSize = 4;
        } else if (stampRoll < profile.stamp4Chance + profile.stamp3Chance) {
          stampSize = 3;
        } else if (stampRoll < profile.stamp4Chance + profile.stamp3Chance + profile.stamp2Chance) {
          stampSize = 2;
        }

        const tileType =
          profile.carpetChance > 0 && stampSize <= 2 && rng.chance(profile.carpetChance)
            ? TileType.Carpet
            : TileType.Floor;

        carveStampSafe(map, w.x, w.y, stampSize, tileType);
      }

      // Dynamic walker branching & pruning (Vlambeer style)
      if (walkers.length < maxWalkers && rng.chance(profile.spawnChance)) {
        walkers.push({
          x: w.x,
          y: w.y,
          dir: (w.dir + (rng.chance(0.5) ? 1 : 3)) & 3,
        });
      } else if (walkers.length > 1 && rng.chance(profile.despawnChance)) {
        walkers.splice(wi, 1);
        wi -= 1;
      }
    }
  }

  return { spawnTx: cx, spawnTy: cy };
}

/**
 * Checks 4-connected BFS flood-fill connectivity of all walkable tiles
 * starting from the map's spawn position.
 */
export function checkMapConnectivity(map: WorldMap): ConnectivityResult {
  const { width, height, tiles } = map;
  const totalCells = width * height;

  let totalWalkable = 0;
  for (let i = 0; i < totalCells; i++) {
    if (isWalkableTile(tiles[i] as TileType)) {
      totalWalkable += 1;
    }
  }

  const { tx: spawnTx, ty: spawnTy } = worldToTile(map.spawnX, map.spawnY, map.tileSize);
  if (
    spawnTx < 0 ||
    spawnTy < 0 ||
    spawnTx >= width ||
    spawnTy >= height ||
    !isWalkableTile(getTile(map, spawnTx, spawnTy))
  ) {
    return { connected: false, reachable: 0, totalWalkable };
  }

  const visited = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);
  let head = 0;
  let tail = 0;

  const startIdx = spawnTy * width + spawnTx;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++]!;
    const cx = idx % width;
    const cy = (idx - cx) / width;

    // 4-connected neighbors
    if (cx > 0) {
      const n = idx - 1;
      if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cx + 1 < width) {
      const n = idx + 1;
      if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy > 0) {
      const n = idx - width;
      if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy + 1 < height) {
      const n = idx + width;
      if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  const reachable = tail;
  return {
    connected: totalWalkable > 0 && reachable === totalWalkable,
    reachable,
    totalWalkable,
  };
}

/**
 * Connects any disconnected walkable pockets to the spawn-reachable component
 * by carving L-shaped corridors strictly within the playable interior.
 */
function ensureFullConnectivity(map: WorldMap): void {
  const { width, height, tiles } = map;
  const totalCells = width * height;
  const visited = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);

  const { tx: spawnTx, ty: spawnTy } = worldToTile(map.spawnX, map.spawnY, map.tileSize);
  const startIdx = spawnTy * width + spawnTx;

  for (let attempt = 0; attempt < 128; attempt++) {
    visited.fill(0);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    while (head < tail) {
      const idx = queue[head++]!;
      const cx = idx % width;
      const cy = (idx - cx) / width;

      if (cx > 0) {
        const n = idx - 1;
        if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cx + 1 < width) {
        const n = idx + 1;
        if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy > 0) {
        const n = idx - width;
        if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy + 1 < height) {
        const n = idx + width;
        if (!visited[n] && isWalkableTile(tiles[n] as TileType)) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    // Find first unreachable walkable tile
    let unreachedIdx = -1;
    for (let i = 0; i < totalCells; i++) {
      if (!visited[i] && isWalkableTile(tiles[i] as TileType)) {
        unreachedIdx = i;
        break;
      }
    }
    if (unreachedIdx === -1) {
      return; // 100% connected
    }

    const ux = unreachedIdx % width;
    const uy = (unreachedIdx - ux) / width;

    // Find closest reachable tile by Manhattan distance
    let bestIdx = startIdx;
    let bestDist = Infinity;
    for (let q = 0; q < tail; q++) {
      const rIdx = queue[q]!;
      const rx = rIdx % width;
      const ry = (rIdx - rx) / width;
      const d = Math.abs(rx - ux) + Math.abs(ry - uy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = rIdx;
      }
    }

    const rx = bestIdx % width;
    const ry = (bestIdx - rx) / width;

    // Carve L-corridor (horizontal then vertical) strictly inside outer margin
    const stepX = rx >= ux ? 1 : -1;
    let cx = ux;
    while (cx !== rx) {
      carveRectSafe(map, cx, uy, cx, uy, TileType.Floor);
      cx += stepX;
    }
    const stepY = ry >= uy ? 1 : -1;
    let cy = uy;
    while (cy !== ry) {
      carveRectSafe(map, rx, cy, rx, cy, TileType.Floor);
      cy += stepY;
    }
    carveRectSafe(map, rx, ry, rx, ry, TileType.Floor);
  }
}

function enforceOuterWallMargin(map: WorldMap): void {
  const { width, height } = map;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (
        tx < OUTER_MARGIN ||
        ty < OUTER_MARGIN ||
        tx >= width - OUTER_MARGIN ||
        ty >= height - OUTER_MARGIN
      ) {
        setTile(map, tx, ty, TileType.Wall);
      }
    }
  }
}

function populateFloorVariants(map: WorldMap, rng: SeededRng): void {
  const total = map.width * map.height;
  for (let i = 0; i < total; i++) {
    const r = rng.next();
    if (r < 0.72) {
      map.floorVariants[i] = 0;
    } else if (r < 0.86) {
      map.floorVariants[i] = 1;
    } else if (r < 0.94) {
      map.floorVariants[i] = 2;
    } else {
      map.floorVariants[i] = 3;
    }
  }
}

function recountWalkable(map: WorldMap): void {
  let count = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (isWalkableTile(map.tiles[i] as TileType)) {
      count += 1;
    }
  }
  map.walkableCount = count;
}

/**
 * Generates a deterministic WorldMap for any Nuclear Throne AreaCode, BiomeId, and Loop count.
 * Guarantees:
 * - 2-tile solid outer wall margin
 * - 3x3 clear walkable spawn plaza around (spawnX, spawnY)
 * - 100% 4-connected BFS flood-fill connectivity
 * - Accurate walkableCount and wallMask autotiling
 */
export function generateWorldMap(
  areaCode: AreaCode,
  biome: BiomeId,
  loop: number,
  rng: SeededRng,
  opts?: WorldGenOptions,
): WorldMap {
  const profile = getDefaultAreaGenParams(areaCode, biome, loop);
  if (opts?.targetFloors !== undefined) {
    profile.targetFloors = Math.max(16, Math.floor(opts.targetFloors));
  }
  if (opts?.walkerCount !== undefined) {
    profile.walkerCount = Math.max(1, Math.floor(opts.walkerCount));
  }
  if (opts?.darkness !== undefined) {
    profile.darkness = Math.max(0, Math.min(1, opts.darkness));
  }

  const map = createBlankMap(
    profile.width,
    profile.height,
    areaCode,
    biome,
    loop,
    profile.darkness,
  );

  let spawn: { spawnTx: number; spawnTy: number };
  if (areaCode === '7-3') {
    spawn = buildNuclearThroneHall(map, rng);
  } else if (areaCode === '0-1') {
    spawn = buildCampfireArena(map, rng);
  } else if (areaCode === 'vault') {
    spawn = buildCrownVault(map, rng);
  } else if (areaCode === '2-?') {
    spawn = buildPizzaSewers(map, rng);
  } else {
    spawn = runDrunkenWalkers(map, profile, rng);
  }

  // Enforce invariants in strict order
  enforceOuterWallMargin(map);
  carveSpawnPlaza(map, spawn.spawnTx, spawn.spawnTy);
  ensureFullConnectivity(map);
  enforceOuterWallMargin(map);
  recountWalkable(map);
  populateFloorVariants(map, rng);
  computeWallAutotile(map);

  return map;
}
