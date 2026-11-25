import {
  TILE_SIZE,
  TileType,
  type AreaCode,
  type BiomeId,
  type BossId,
  type CrownId,
  type EnemyDef,
  type EnemyEntity,
  type MutantId,
  type PropEntity,
  type PropKind,
  type SimState,
  type WorldMap,
} from '@/contracts';
import { ENEMIES, getAreaDef, getEnemiesForBiome } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  emitEvent,
  findNearestFloor,
  getTile,
  hasLineOfSight,
  isCircleOverlappingSolid,
  isWalkableTile,
  isWorldSolid,
  moveCircleWithSlide,
  tileToWorldCenter,
  worldToTile,
} from '@/sim/core';
import { createInitialSimState, spawnLevelChests } from '@/sim/progression';
import { getAreaRuntime, getEnemyMemory, registerTrackedEnemy, resetAreaRuntime } from './runtime';

export interface BossMeta {
  id: BossId;
  name: string;
  subtitle: string;
  musicTrack: string;
  introSound: string;
}

export const BOSS_META: Record<BossId, BossMeta> = {
  big_bandit: {
    id: 'big_bandit',
    name: 'BIG BANDIT',
    subtitle: 'KING OF THE WASTELAND',
    musicTrack: 'mus/Boss1',
    introSound: 'sndBigBanditIntro',
  },
  big_dog: {
    id: 'big_dog',
    name: 'BIG DOG',
    subtitle: 'GUARDIAN OF THE SCRAPYARD',
    musicTrack: 'mus/Boss2',
    introSound: 'sndBigDogIntro',
  },
  lil_hunter: {
    id: 'lil_hunter',
    name: "LIL' HUNTER",
    subtitle: 'ROGUE I.D.P.D. CAPTAIN',
    musicTrack: 'mus/Boss3',
    introSound: 'sndLilHunterAppear',
  },
  nuclear_throne: {
    id: 'nuclear_throne',
    name: 'THE KRUNKED THRONE',
    subtitle: 'THE END OF THE ROAD',
    musicTrack: 'mus/Boss4A',
    introSound: 'sndNothingStart',
  },
  throne_ii: {
    id: 'throne_ii',
    name: 'THRONE II',
    subtitle: 'REBORN IN RADIATION',
    musicTrack: 'mus/Boss5',
    introSound: 'sndNothing2Appear',
  },
};

export interface CreateEnemyOptions {
  initialAiState?: string;
  friendly?: boolean;
  bossId?: BossId;
  isBossSummon?: boolean;
  hpScale?: number;
  elevated?: boolean;
  elevZ?: number;
  invulnerable?: boolean;
  carveIfTight?: boolean;
}

const MIN_SPAWN_NO_LOS_DIST = 118;
const MIN_SPAWN_WITH_LOS_DIST = 236;

function clampToMapInterior(state: SimState, x: number, y: number): { x: number; y: number } {
  const ts = state.map.tileSize || TILE_SIZE;
  const minX = ts * 2.5;
  const maxX = Math.max(minX, (state.map.width - 2.5) * ts);
  const minY = ts * 2.5;
  const maxY = Math.max(minY, (state.map.height - 2.5) * ts);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

function isSpotSafeFromSpawn(
  state: SimState,
  x: number,
  y: number,
  minDistNoLos: number = MIN_SPAWN_NO_LOS_DIST,
  minDistWithLos: number = MIN_SPAWN_WITH_LOS_DIST,
): boolean {
  const px = state.player.x;
  const py = state.player.y;
  const dx = x - px;
  const dy = y - py;
  const distSq = dx * dx + dy * dy;
  if (distSq < minDistNoLos * minDistNoLos) return false;
  if (distSq < minDistWithLos * minDistWithLos) {
    if (hasLineOfSight(state.map, px, py, x, y)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes 4-connected BFS tile distances from the map spawn tile for encounter zoning.
 */
function computeSpawnBfs(map: WorldMap): Int32Array {
  const { width, height, tiles } = map;
  const total = width * height;
  const dist = new Int32Array(total);
  dist.fill(-1);

  const { tx: stx, ty: sty } = worldToTile(map.spawnX, map.spawnY, map.tileSize || TILE_SIZE);
  if (stx < 0 || sty < 0 || stx >= width || sty >= height) return dist;

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const startIdx = sty * width + stx;
  dist[startIdx] = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++]!;
    const d = dist[idx]! + 1;
    const cx = idx % width;
    const cy = (idx - cx) / width;

    if (cx > 0) {
      const n = idx - 1;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cx + 1 < width) {
      const n = idx + 1;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cy > 0) {
      const n = idx - width;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cy + 1 < height) {
      const n = idx + width;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
  }

  return dist;
}

/**
 * Finds a guaranteed walkable floor tile coordinate at least `minDistFromPlayer` px away
 * from the player, avoiding existing props/enemies and never inside solid walls.
 * When `requireNoSpawnLos` is true, also rejects direct line-of-sight tiles within screen range.
 */
export function findSafeFloorSpot(
  state: SimState,
  rng: SeededRng,
  minDistFromPlayer: number = 116,
  entityRadius: number = 7,
  avoidExistingMinDist: number = 14,
  requireNoSpawnLos: boolean = false,
): { x: number; y: number } {
  const map = state.map;
  const ts = map.tileSize || TILE_SIZE;
  const px = state.player.x;
  const py = state.player.y;
  const paddedDist = minDistFromPlayer + 4;
  const minDistSq = paddedDist * paddedDist;
  const strictMinDistSq = minDistFromPlayer * minDistFromPlayer;
  const existSq = avoidExistingMinDist * avoidExistingMinDist;

  // First pass: randomized rejection sampling on strictly walkable tiles with clearance
  for (let attempt = 0; attempt < 180; attempt++) {
    const tx = rng.int(2, map.width - 3);
    const ty = rng.int(2, map.height - 3);
    if (!isWalkableTile(getTile(map, tx, ty))) continue;

    const pos = tileToWorldCenter(tx, ty, ts);
    const dx = pos.x - px;
    const dy = pos.y - py;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) continue;

    if (
      requireNoSpawnLos &&
      dSq < MIN_SPAWN_WITH_LOS_DIST * MIN_SPAWN_WITH_LOS_DIST &&
      hasLineOfSight(map, px, py, pos.x, pos.y)
    ) {
      continue;
    }

    // Prefer tiles where circle doesn't clip solid corners (relaxed after 100 tries)
    if (attempt < 100 && isCircleOverlappingSolid(map, pos.x, pos.y, Math.min(entityRadius, 12))) {
      continue;
    }

    let tooClose = false;
    if (attempt < 130 && avoidExistingMinDist > 0) {
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i]!;
        const edx = pos.x - e.x;
        const edy = pos.y - e.y;
        if (edx * edx + edy * edy < existSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (let i = 0; i < state.props.length; i++) {
          const p = state.props[i]!;
          const pdx = pos.x - p.x;
          const pdy = pos.y - p.y;
          if (pdx * pdx + pdy * pdy < existSq) {
            tooClose = true;
            break;
          }
        }
      }
    }
    if (tooClose) continue;

    const dep = moveCircleWithSlide(map, pos.x, pos.y, 0, 0, Math.min(entityRadius, 6));
    const depDx = dep.x - px;
    const depDy = dep.y - py;
    if (!isWorldSolid(map, dep.x, dep.y) && depDx * depDx + depDy * depDy >= strictMinDistSq) {
      if (
        !requireNoSpawnLos ||
        depDx * depDx + depDy * depDy >= MIN_SPAWN_WITH_LOS_DIST * MIN_SPAWN_WITH_LOS_DIST ||
        !hasLineOfSight(map, px, py, dep.x, dep.y)
      ) {
        return { x: dep.x, y: dep.y };
      }
    }
    return pos;
  }

  // Deterministic scan fallback: prefer no-LOS safe tiles first, then any >= minDist, then farthest
  let bestFar: { x: number; y: number } | null = null;
  let bestFarDistSq = -1;
  const noLosCandidates: Array<{ x: number; y: number }> = [];
  const candidates: Array<{ x: number; y: number }> = [];

  for (let ty = 2; ty < map.height - 2; ty++) {
    for (let tx = 2; tx < map.width - 2; tx++) {
      if (!isWalkableTile(getTile(map, tx, ty))) continue;
      const pos = tileToWorldCenter(tx, ty, ts);
      const dx = pos.x - px;
      const dy = pos.y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq > bestFarDistSq) {
        bestFarDistSq = dSq;
        bestFar = pos;
      }
      if (dSq >= minDistSq) {
        candidates.push(pos);
        if (
          requireNoSpawnLos &&
          (dSq >= MIN_SPAWN_WITH_LOS_DIST * MIN_SPAWN_WITH_LOS_DIST ||
            !hasLineOfSight(map, px, py, pos.x, pos.y))
        ) {
          noLosCandidates.push(pos);
        }
      }
    }
  }

  const chosenList = noLosCandidates.length > 0 ? noLosCandidates : candidates;
  if (chosenList.length > 0) {
    const picked = rng.pick(chosenList);
    const dep = moveCircleWithSlide(map, picked.x, picked.y, 0, 0, Math.min(entityRadius, 6));
    return isWorldSolid(map, dep.x, dep.y) ? picked : { x: dep.x, y: dep.y };
  }

  if (bestFar) {
    return bestFar;
  }

  return findNearestFloor(map, px + minDistFromPlayer, py, 24);
}

/**
 * Ensures any desired coordinate is safely on walkable floor and not overlapping solid tiles.
 */
function ensureSafeEntityPosition(
  state: SimState,
  x: number,
  y: number,
  radius: number,
  carveIfTight: boolean,
): { x: number; y: number } {
  const clamped = clampToMapInterior(state, x, y);
  let safe = findNearestFloor(state.map, clamped.x, clamped.y, 24);

  if (carveIfTight && isCircleOverlappingSolid(state.map, safe.x, safe.y, radius)) {
    carveCircle(state.map, safe.x, safe.y, radius + 4, true);
  }

  const dep = moveCircleWithSlide(state.map, safe.x, safe.y, 0, 0, Math.min(radius, 7.5));
  if (!isWorldSolid(state.map, dep.x, dep.y)) {
    safe = { x: dep.x, y: dep.y };
  }

  if (isWorldSolid(state.map, safe.x, safe.y)) {
    safe = findNearestFloor(state.map, safe.x, safe.y, 24);
  }
  return safe;
}

export function createEnemyEntity(
  state: SimState,
  defId: string,
  x: number,
  y: number,
  rng: SeededRng,
  opts: CreateEnemyOptions = {},
): EnemyEntity {
  const def = ENEMIES[defId] ?? ENEMIES.bandit!;
  const safe = ensureSafeEntityPosition(
    state,
    x,
    y,
    def.radius,
    opts.carveIfTight ?? Boolean(def.isBoss),
  );

  const rt = getAreaRuntime(state);
  const loopHpMult = def.isBoss ? 1 + state.loop * 0.45 : 1 + state.loop * 0.3;
  const scarierMult =
    !rt.populatingArea && !opts.friendly && state.player.mutations.includes('scarier_face')
      ? 0.8
      : 1.0;
  const scaledHp = Math.max(
    1,
    Math.round(def.maxHp * (opts.hpScale ?? loopHpMult) * scarierMult),
  );

  let defaultState = 'idle';
  if (def.aiArchetype === 'assassin') defaultState = 'feign';
  else if (def.aiArchetype === 'mimic') defaultState = 'disguised';
  else if (def.aiArchetype === 'idpd_van') defaultState = 'drive';
  else if (opts.bossId === 'big_dog' || opts.bossId === 'nuclear_throne') defaultState = 'sleep';

  const enemy: EnemyEntity = {
    id: allocEntityId(state),
    defId: def.id,
    bossId: opts.bossId,
    x: safe.x,
    y: safe.y,
    prevX: safe.x,
    prevY: safe.y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    hp: scaledHp,
    maxHp: scaledHp,
    facing: safe.x >= state.player.x ? -1 : 1,
    aimAngle: Math.atan2(state.player.y - safe.y, state.player.x - safe.x),
    hurtFlashTicks: 0,
    snaredTicks: 0,
    aiState: opts.initialAiState ?? defaultState,
    aiTimer: rng.int(12, 34),
    aiPhase: 0,
    attackCooldown: rng.int(22, 48),
    targetX: safe.x,
    targetY: safe.y,
    animFrame: rng.range(0, 4),
    contactDamage: def.contactDamage,
    radDrop: def.radDrop,
    friendly: opts.friendly ?? false,
    isBoss: Boolean(opts.bossId ?? def.isBoss),
    invulnerable: opts.invulnerable ?? false,
    elevated: opts.elevated ?? false,
    elevZ: opts.elevZ ?? 0,
  };

  state.enemies.push(enemy);
  registerTrackedEnemy(state, enemy, opts.isBossSummon ?? false);
  const mem = getEnemyMemory(state, enemy);
  mem.homeX = safe.x;
  mem.homeY = safe.y;
  mem.pauseTicks = rng.int(10, 32);
  return enemy;
}

/**
 * Spawns one of the 5 canonical bosses on safe walkable floor, initializes `state.boss`,
 * and emits `'boss_intro'`, boss `'music'`, and boss intro `'sfx'`.
 */
export function spawnBossEntity(
  state: SimState,
  bossId: BossId,
  rng: SeededRng,
): EnemyEntity {
  const meta = BOSS_META[bossId];
  const map = state.map;
  const ts = map.tileSize || TILE_SIZE;

  let spawnPos: { x: number; y: number };
  let initialAiState = 'idle';
  let elevated = false;
  let elevZ = 0;
  let invulnerable = false;

  if (bossId === 'nuclear_throne') {
    const cx = Math.floor(map.width / 2);
    const daisTy = state.areaCode === '7-3' ? 12 : Math.max(4, Math.floor(map.height * 0.22));
    const desired = tileToWorldCenter(cx, daisTy, ts);
    spawnPos = ensureSafeEntityPosition(state, desired.x, desired.y, 34, true);
    initialAiState = 'sleep';
  } else if (bossId === 'throne_ii') {
    const cx = Math.floor(map.width / 2);
    const cy = Math.max(5, Math.floor(map.height * 0.22));
    const desired = tileToWorldCenter(cx, cy, ts);
    const dx = desired.x - state.player.x;
    const dy = desired.y - state.player.y;
    if (dx * dx + dy * dy < 120 * 120) {
      spawnPos = findSafeFloorSpot(state, rng, 128, 26, 20, false);
    } else {
      spawnPos = ensureSafeEntityPosition(state, desired.x, desired.y, 26, true);
    }
    initialAiState = 'intro';
    elevated = true;
    elevZ = 18;
  } else if (bossId === 'big_dog') {
    spawnPos = findSafeFloorSpot(state, rng, 152, 22, 22, true);
    spawnPos = ensureSafeEntityPosition(state, spawnPos.x, spawnPos.y, 22, true);
    initialAiState = 'sleep';
  } else if (bossId === 'lil_hunter') {
    spawnPos = findSafeFloorSpot(state, rng, 144, 11, 18, true);
    initialAiState = 'arrive_slam';
    elevated = true;
    elevZ = 72;
    invulnerable = true;
  } else {
    // Big Bandit (1-3): spawns safely around a bend with dramatic intro beat
    spawnPos = findSafeFloorSpot(state, rng, 156, 14, 18, true);
    initialAiState = 'intro';
  }

  const boss = createEnemyEntity(state, bossId, spawnPos.x, spawnPos.y, rng, {
    bossId,
    initialAiState,
    elevated,
    elevZ,
    invulnerable,
    carveIfTight: bossId === 'big_dog' || bossId === 'nuclear_throne' || bossId === 'throne_ii',
  });

  if (bossId === 'lil_hunter') {
    boss.aiTimer = 54;
    boss.targetX = spawnPos.x;
    boss.targetY = spawnPos.y;
  } else if (bossId === 'big_bandit') {
    boss.aiTimer = 26;
    boss.attackCooldown = 28;
  } else if (bossId === 'throne_ii') {
    boss.aiTimer = 22;
    boss.attackCooldown = 28;
  } else if (bossId === 'nuclear_throne') {
    boss.aimAngle = Math.PI * 0.5;
    boss.aiTimer = 18;
    boss.attackCooldown = 36;
  } else if (bossId === 'big_dog') {
    // Give Big Dog's scrapyard arena 2 tactical explosive barrels nearby
    for (let b = 0; b < 2; b++) {
      const ang = b * Math.PI + rng.range(-0.5, 0.5);
      const bx = boss.x + Math.cos(ang) * 44;
      const by = boss.y + Math.sin(ang) * 44;
      if (!isWorldSolid(state.map, bx, by) && isSpotSafeFromSpawn(state, bx, by, 72, 90)) {
        addProp(state, 'barrel', bx, by, 'sprBarrel', 10, 8, true);
      }
    }
  }

  const rt = getAreaRuntime(state);
  rt.bossDeathHandled = false;
  rt.throneWoken = false;
  rt.throneLastGenCount = state.generatorsRemaining;

  const startsAsleep = initialAiState === 'sleep';
  state.boss = {
    bossId,
    entityId: boss.id,
    name: meta.name,
    subtitle: meta.subtitle,
    hp: boss.hp,
    maxHp: boss.maxHp,
    introTicks: startsAsleep ? 0 : 60,
    defeated: false,
  };

  // Sleeping bosses (Big Dog 3-3, Krunked Throne 7-3) hold their intro banner & boss music until woken!
  if (!startsAsleep) {
    emitEvent(state, {
      type: 'boss_intro',
      bossId,
      name: meta.name,
      subtitle: meta.subtitle,
    });
    emitEvent(state, {
      type: 'music',
      track: meta.musicTrack,
      ambience: getAreaDef(state.areaCode).ambienceTrack,
      boss: true,
    });
    emitEvent(state, {
      type: 'sfx',
      sound: meta.introSound,
      x: boss.x,
      y: boss.y,
    });
  }

  return boss;
}

export interface SpawnIdpdWaveOptions {
  includeVan?: boolean;
  anchorX?: number;
  anchorY?: number;
  count?: number;
  isBossSummon?: boolean;
}

/**
 * Spawns an IDPD Portal or IDPD Van reinforcement wave (Grunts, Inspectors, Shielders, Vans).
 */
export function spawnIdpdWave(
  state: SimState,
  rng: SeededRng,
  opts: SpawnIdpdWaveOptions = {},
): EnemyEntity[] {
  const spawned: EnemyEntity[] = [];
  const baseSpot =
    opts.anchorX !== undefined && opts.anchorY !== undefined
      ? ensureSafeEntityPosition(state, opts.anchorX, opts.anchorY, 10, false)
      : findSafeFloorSpot(state, rng, 132, 10, 16, true);

  if (opts.includeVan) {
    const vanSpot = ensureSafeEntityPosition(state, baseSpot.x, baseSpot.y, 18, true);
    const van = createEnemyEntity(state, 'idpd_van', vanSpot.x, vanSpot.y, rng, {
      initialAiState: 'drive',
      isBossSummon: opts.isBossSummon,
      carveIfTight: true,
    });
    const toPlayer = Math.atan2(state.player.y - van.y, state.player.x - van.x);
    van.aimAngle = toPlayer;
    van.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;
    van.aiTimer = 34;
    van.aiPhase = 0;
    spawned.push(van);

    emitEvent(state, {
      type: 'particle',
      kind: 'idpd_portal',
      x: van.x,
      y: van.y,
      vx: 0,
      vy: 0,
      color: '#4aa3ff',
      size: 22,
      life: 16,
      sprite: 'sprVanPortalStart',
    });
    emitEvent(state, { type: 'sfx', sound: 'sndVanPortal', x: van.x, y: van.y });
    emitEvent(state, { type: 'sfx', sound: 'sndVanWarning', x: van.x, y: van.y });
    emitEvent(state, { type: 'shake', trauma: 0.35 });
    return spawned;
  }

  const count = opts.count ?? (state.loop > 0 ? rng.int(3, 4) : rng.int(2, 3));
  const pool: readonly string[] =
    state.loop > 0
      ? ['idpd_grunt', 'idpd_grunt', 'idpd_inspector', 'idpd_shielder']
      : ['idpd_grunt', 'idpd_grunt', 'idpd_inspector'];

  emitEvent(state, {
    type: 'particle',
    kind: 'idpd_portal',
    x: baseSpot.x,
    y: baseSpot.y,
    vx: 0,
    vy: 0,
    color: '#4aa3ff',
    size: 18,
    life: 14,
    sprite: 'sprIDPDPortalStart',
  });
  emitEvent(state, { type: 'sfx', sound: 'sndIDPDPortalSpawn', x: baseSpot.x, y: baseSpot.y });

  for (let i = 0; i < count; i++) {
    const defId = rng.pick(pool);
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const ox = baseSpot.x + Math.cos(angle) * 14;
    const oy = baseSpot.y + Math.sin(angle) * 14;
    const unit = createEnemyEntity(state, defId, ox, oy, rng, {
      isBossSummon: opts.isBossSummon,
    });
    spawned.push(unit);
  }

  return spawned;
}

function addProp(
  state: SimState,
  kind: PropKind,
  x: number,
  y: number,
  sprite: string,
  hp: number,
  radius: number,
  solid: boolean,
  extra?: Partial<PropEntity>,
): PropEntity {
  const prop: PropEntity = {
    id: allocEntityId(state),
    kind,
    x,
    y,
    radius,
    hp,
    maxHp: hp,
    solid,
    opened: false,
    hurtFlashTicks: 0,
    sprite,
    ...extra,
  };
  state.props.push(prop);
  return prop;
}

function isExplosivePropKind(kind: PropKind): boolean {
  return kind === 'barrel' || kind === 'toxic_barrel' || kind === 'car';
}

function isPropSpotClear(
  state: SimState,
  x: number,
  y: number,
  minDist: number,
  kind?: PropKind,
): boolean {
  if (isWorldSolid(state.map, x, y)) return false;
  const spDx = x - state.map.spawnX;
  const spDy = y - state.map.spawnY;
  if (spDx * spDx + spDy * spDy < 42 * 42) return false;
  const selfExplosive = kind !== undefined && isExplosivePropKind(kind);
  for (let i = 0; i < state.props.length; i++) {
    const p = state.props[i]!;
    const req = selfExplosive || isExplosivePropKind(p.kind) ? Math.max(minDist, 64) : minDist;
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < req * req) return false;
  }
  return true;
}

function tryPlacePropNear(
  state: SimState,
  anchorX: number,
  anchorY: number,
  minRad: number,
  maxRad: number,
  rng: SeededRng,
  kind: PropKind,
  sprite: string,
  hp: number,
  radius: number,
  solid: boolean,
): boolean {
  for (let attempt = 0; attempt < 14; attempt++) {
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(minRad, maxRad);
    const px = anchorX + Math.cos(ang) * r;
    const py = anchorY + Math.sin(ang) * r;
    if (isCircleOverlappingSolid(state.map, px, py, Math.min(radius, 7))) continue;
    if (!isPropSpotClear(state, px, py, 20, kind)) continue;
    addProp(state, kind, px, py, sprite, hp, radius, solid);
    return true;
  }
  return false;
}

function spawnBiomeProps(
  state: SimState,
  rng: SeededRng,
  encounterAnchors: ReadonlyArray<{ x: number; y: number }>,
): void {
  const biome: BiomeId = state.biome;
  const areaCode: AreaCode = state.areaCode;
  const map = state.map;
  const ts = map.tileSize || TILE_SIZE;

  // Special canonical placement for 7-3 Krunked Throne Hall: 4 Generators symmetrically in alcoves!
  if (areaCode === '7-3') {
    const cx = Math.floor(map.width / 2);
    const daisTop = 7;
    const daisBottom = 21;
    const westOuter = cx - 13;
    const eastOuter = cx + 13;
    const genYs = [daisTop + 12, daisBottom + 10];
    // 4 Generators symmetrically positioned along the visible upper/mid side corridor flanks
    const alcoveCoords: Array<{ tx: number; ty: number }> = [
      { tx: cx - 10, ty: genYs[0]! },
      { tx: cx + 10, ty: genYs[0]! },
      { tx: cx - 10, ty: genYs[1]! },
      { tx: cx + 10, ty: genYs[1]! },
    ];

    let placedGenerators = 0;
    for (let i = 0; i < alcoveCoords.length; i++) {
      const c = alcoveCoords[i]!;
      const raw = tileToWorldCenter(c.tx, c.ty, ts);
      const safe = findNearestFloor(map, raw.x, raw.y, 8);
      addProp(state, 'throne_generator', safe.x, safe.y, 'sprBigGenerator', 75, 12, true);
      placedGenerators += 1;
    }
    state.generatorsRemaining = placedGenerators;

    // Ornate palace pillars lining outer flanks of the grand hall (kept well off the carpet; uses canonical sprPillar)
    const pillarYs = [daisBottom + 4, daisBottom + 14, daisBottom + 24, daisBottom + 34];
    for (let i = 0; i < pillarYs.length; i++) {
      const py = pillarYs[i]!;
      if (py >= map.height - 10) continue;
      for (const side of [-1, 1]) {
        const raw = tileToWorldCenter(cx + side * 4, py, ts);
        if (!isWorldSolid(map, raw.x, raw.y)) {
          addProp(state, 'pillar', raw.x, raw.y, 'sprPillar', 36, 9, true);
        }
      }
    }
    return;
  }

  if (areaCode === '0-1') {
    for (let i = 0; i < 4; i++) {
      const pos = findSafeFloorSpot(state, rng, 84, 8, 28, false);
      addProp(state, 'bone_pile', pos.x, pos.y, 'sprBonePileIdle', 8, 7, false);
    }
    return;
  }

  // Proto Statue in Crown Vault & mid-world areas (3-2, 5-2, 7-2)
  const rt = getAreaRuntime(state);
  if (areaCode === 'vault' || areaCode === '3-2' || areaCode === '5-2' || areaCode === '7-2') {
    const pos =
      areaCode === 'vault'
        ? findNearestFloor(
            map,
            tileToWorldCenter(Math.floor(map.width / 2), 17, ts).x,
            tileToWorldCenter(Math.floor(map.width / 2), 17, ts).y,
            6,
          )
        : findSafeFloorSpot(state, rng, 104, 12, 24, false);
    const statue = addProp(
      state,
      'proto_statue',
      pos.x,
      pos.y,
      'sprProtoStatueIdle',
      areaCode === 'vault' ? 999999 : 60,
      12,
      true,
      {
        radsStored: 0,
      },
    );
    if (areaCode !== 'vault') {
      rt.protoStatuePropId = statue.id;
      rt.protoStatueX = statue.x;
      rt.protoStatueY = statue.y;
      rt.protoStatueCharged = false;
    }
  }

  // Secret exit triggers:
  // - 2-1 Sewers: Sewer Manhole grate -> hit with explosion to open Pizza Sewers (2-?)
  if (areaCode === '2-1') {
    const manholePos = findSafeFloorSpot(state, rng, 96, 10, 32, false);
    const manhole = addProp(state, 'bone_pile', manholePos.x, manholePos.y, 'sprPizzaEntrance', 999, 10, false);
    rt.pizzaManholePropId = manhole.id;
  }

  // - 3-1 Scrapyard: Golden Car -> repair with Screwdriver, then press E to enter Y.V.'s Mansion (3-?)
  if (areaCode === '3-1') {
    const carPos = findSafeFloorSpot(state, rng, 96, 11, 32, false);
    const venusCar = addProp(state, 'car', carPos.x, carPos.y, 'sprVenusCar', 30, 11, true);
    rt.venusCarPropId = venusCar.id;
    rt.venusCarFixed = false;
  }

  // - 5-1 Frozen City: Jungle Flower (when player took Last Wish) -> feed 4 HP via E to open Jungle (5-?)
  if (areaCode === '5-1' && state.player.mutations.includes('last_wish')) {
    const flowerPos = findSafeFloorSpot(state, rng, 92, 9, 28, false);
    const flower = addProp(state, 'cactus', flowerPos.x, flowerPos.y, 'sprCactus3', 999, 9, false);
    rt.jungleFlowerPropId = flower.id;
    rt.jungleFlowerFeeds = 0;
  }

  // Place strategic explosive barrels / cars right beside enemy encounter pockets for chain-kill payoffs!
  for (let i = 0; i < encounterAnchors.length; i++) {
    const anchor = encounterAnchors[i]!;
    if (biome === 'desert' || biome === 'oasis') {
      if (i % 2 === 0 && rng.chance(0.7)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 38, rng, 'barrel', 'sprBarrel', 8, 8, true);
      } else {
        const cacti = ['sprCactus', 'sprCactus2', 'sprCactus3'] as const;
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 42, rng, 'cactus', rng.pick(cacti), 6, 7, false);
      }
    } else if (biome === 'sewers' || biome === 'pizza_sewers') {
      if (rng.chance(0.75)) {
        const toxic = rng.chance(0.65);
        tryPlacePropNear(
          state,
          anchor.x,
          anchor.y,
          18,
          36,
          rng,
          toxic ? 'toxic_barrel' : 'barrel',
          toxic ? 'sprToxicBarrel' : 'sprBarrel',
          10,
          8,
          true,
        );
      }
    } else if (biome === 'scrapyard') {
      if (i % 2 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 22, 42, rng, 'car', 'sprCarIdle', 22, 11, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'barrel', 'sprBarrel', 10, 8, true);
      }
    } else if (biome === 'frozen_city') {
      if (i % 2 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'car', 'sprFrozenCar', 24, 11, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'pillar', 'sprPillar', 26, 9, true);
      }
    } else if (biome === 'labs') {
      if (rng.chance(0.72)) {
        const toxic = rng.chance(0.55);
        tryPlacePropNear(
          state,
          anchor.x,
          anchor.y,
          18,
          36,
          rng,
          toxic ? 'toxic_barrel' : 'barrel',
          toxic ? 'sprToxicBarrel' : 'sprBarrel',
          12,
          8,
          true,
        );
      }
    } else if (biome === 'caves' || biome === 'cursed_caves') {
      if (rng.chance(0.6)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 22, 42, rng, 'pillar', 'sprPillar', 24, 9, true);
      }
    } else if (biome === 'palace' || biome === 'vault') {
      if (rng.chance(0.65)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 24, 44, rng, 'pillar', 'sprPillar', 36, 9, true);
      }
    }
  }

  // Secondary ambient destructible cover across corridors & clearings
  switch (biome) {
    case 'desert':
    case 'oasis': {
      const cacti = ['sprCactus', 'sprCactus2', 'sprCactus3'] as const;
      const count = rng.int(4, 7);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 56, 8, 24, false);
        if (rng.chance(0.65)) {
          addProp(state, 'cactus', pos.x, pos.y, rng.pick(cacti), 6, 7, false);
        } else {
          addProp(state, 'bone_pile', pos.x, pos.y, 'sprBonePileIdle', 6, 7, false);
        }
      }
      break;
    }
    case 'sewers':
    case 'pizza_sewers': {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 26, false);
        if (rng.chance(0.6)) {
          addProp(state, 'toxic_barrel', pos.x, pos.y, 'sprToxicBarrel', 10, 8, true);
        } else {
          addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 10, 8, true);
        }
      }
      break;
    }
    case 'scrapyard': {
      const carCount = rng.int(2, 3);
      for (let i = 0; i < carCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 11, 64, false);
        if (isPropSpotClear(state, pos.x, pos.y, 64, 'car')) {
          addProp(state, 'car', pos.x, pos.y, 'sprCarIdle', 22, 11, true);
        }
      }
      const barrelCount = rng.int(2, 4);
      for (let i = 0; i < barrelCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 64, false);
        if (isPropSpotClear(state, pos.x, pos.y, 64, 'barrel')) {
          addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 10, 8, true);
        }
      }
      break;
    }
    case 'caves':
    case 'cursed_caves': {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 28, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 24, 9, true);
      }
      break;
    }
    case 'frozen_city': {
      const carCount = rng.int(2, 3);
      for (let i = 0; i < carCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 11, 32, false);
        addProp(state, 'car', pos.x, pos.y, 'sprFrozenCar', 24, 11, true);
      }
      const pillarCount = rng.int(2, 3);
      for (let i = 0; i < pillarCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 26, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 26, 9, true);
      }
      break;
    }
    case 'labs': {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 26, false);
        if (rng.chance(0.55)) {
          addProp(state, 'toxic_barrel', pos.x, pos.y, 'sprToxicBarrel', 12, 8, true);
        } else {
          addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 12, 8, true);
        }
      }
      break;
    }
    case 'palace':
    case 'vault': {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 76, 9, 28, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 36, 9, true);
      }
      break;
    }
    case 'mansion': {
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 11, 32, false);
        addProp(state, 'car', pos.x, pos.y, 'sprVenusCar', 28, 11, true);
      }
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 9, 24, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 28, 9, true);
      }
      break;
    }
    default: {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24, false);
        addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 12, 8, true);
      }
      break;
    }
  }
}

function getEnemyCost(def: EnemyDef): number {
  if (def.maxHp <= 6) return 2;
  if (def.maxHp <= 14) return 3;
  if (def.maxHp <= 24) return 4;
  if (def.maxHp <= 38) return 6;
  if (def.maxHp <= 56) return 8;
  return 11;
}

function getBiomePool(state: SimState): Array<{ def: EnemyDef; weight: number }> {
  let candidates = getEnemiesForBiome(state.biome, state.loop);
  if (state.biome === 'cursed_caves' && state.loop === 0 && ENEMIES.lightning_crystal) {
    if (!candidates.some((d) => d.id === 'lightning_crystal')) {
      candidates = [...candidates, ENEMIES.lightning_crystal];
    }
  }
  if (candidates.length === 0) {
    if (state.biome === 'campfire') return [];
    candidates = [ENEMIES.bandit!];
  }

  return candidates
    .filter((def) => {
      if (state.loop === 0 && state.areaCode === '1-1') {
        if (def.id === 'gold_scorpion' || def.id === 'big_maggot') return false;
      }
      if (def.id === 'idpd_van') return false;
      return true;
    })
    .map((def) => {
      let weight = Math.max(1, Math.round(45 / Math.max(4, def.maxHp)));
      if (def.id === 'bandit' || def.id === 'rat' || def.id === 'freak') weight += 5;
      if (def.id === 'maggot') weight += 3;
      if (def.id === 'maggot_nest') weight = 2;
      if (def.id === 'necromancer') weight = 3;
      if (def.id === 'gold_scorpion' && state.loop === 0) weight = 1;
      if (def.loopOnly && state.loop > 0) weight += 2;
      return { def, weight };
    });
}

function pickBiomeSquadTemplates(state: SimState): string[][] {
  const loop = state.loop;
  const code = state.areaCode;

  switch (state.biome) {
    case 'desert': {
      const templates: string[][] = [
        ['bandit', 'bandit', 'bandit'],
        ['bandit', 'bandit'],
        ['maggot_nest', 'maggot', 'maggot', 'maggot'],
        ['scorpion', 'bandit', 'bandit'],
        ['bandit', 'maggot', 'maggot'],
      ];
      if (code !== '1-1' || loop > 0) {
        templates.push(['big_maggot', 'maggot', 'maggot']);
        templates.push(['scorpion', 'bandit']);
      }
      if (code === '1-3' || loop > 0) {
        templates.push(['gold_scorpion', 'bandit', 'bandit']);
      }
      return templates;
    }
    case 'sewers':
      return [
        ['rat', 'rat', 'rat', 'rat'],
        ['gator', 'gator'],
        ['gator', 'rat', 'rat'],
        ['big_rat', 'rat', 'ballguy'],
        ['buff_gator', 'rat', 'rat'],
        ['ballguy', 'ballguy', 'rat'],
      ];
    case 'scrapyard':
      return [
        ['raven', 'raven', 'sniper'],
        ['salamander', 'raven', 'assassin'],
        ['sniper', 'fireballer', 'assassin'],
        ['assassin', 'assassin', 'raven'],
        ['raven', 'raven', 'fireballer'],
      ];
    case 'caves':
    case 'cursed_caves': {
      const templates: string[][] = [
        ['spider', 'spider', 'spider'],
        ['laser_crystal', 'spider', 'spider'],
        ['laser_crystal', 'spider'],
      ];
      if (loop > 0 || state.biome === 'cursed_caves') {
        templates.push(['lightning_crystal', 'spider', 'spider']);
      }
      return templates;
    }
    case 'frozen_city': {
      const templates: string[][] = [
        ['snowbot', 'snowbot', 'wolf'],
        ['snow_tank', 'wolf', 'wolf'],
        ['wolf', 'wolf', 'snowbot'],
        ['snowbot', 'snowbot', 'snowbot'],
      ];
      if (loop > 0) {
        templates.push(['gold_snow_tank', 'wolf', 'snowbot']);
      }
      return templates;
    }
    case 'labs':
      return [
        ['necromancer', 'freak', 'freak', 'freak', 'explo_freak'],
        ['turret', 'rhino_freak', 'freak', 'freak'],
        ['freak', 'freak', 'freak', 'explo_freak'],
        ['turret', 'turret', 'freak', 'freak'],
      ];
    case 'palace':
      return [
        ['guardian', 'guardian', 'explo_guardian'],
        ['guardian_dog', 'guardian'],
        ['explo_guardian', 'explo_guardian', 'guardian'],
      ];
    case 'oasis':
      return [
        ['molefish', 'molefish', 'molefish'],
        ['molefish', 'molefish'],
      ];
    case 'pizza_sewers':
      return [
        ['turtle', 'rat', 'rat'],
        ['turtle', 'turtle'],
      ];
    case 'mansion':
      return [
        ['bandit', 'bandit', 'sniper'],
        ['fireballer', 'bandit', 'bandit'],
      ];
    case 'jungle':
      return [
        ['jungle_bandit', 'jungle_bandit', 'jungle_assassin'],
        ['jungle_assassin', 'jungle_assassin', 'jungle_bandit'],
      ];
    case 'vault':
      return [['crown_guardian', 'crown_guardian']];
    case 'hq':
      return [
        ['idpd_grunt', 'idpd_grunt', 'idpd_inspector'],
        ['idpd_shielder', 'idpd_grunt', 'idpd_grunt'],
        ['idpd_inspector', 'idpd_shielder', 'idpd_grunt'],
      ];
    default:
      return [['bandit', 'bandit']];
  }
}

/**
 * Selects spatially distinct encounter anchor pockets across near-mid and deep zones,
 * strictly respecting tick-0 safe spawn clearance and anchoring guards near chests/canisters.
 */
function pickEncounterAnchors(
  state: SimState,
  desiredCount: number,
  rng: SeededRng,
): Array<{ x: number; y: number; bfsDist: number }> {
  const map = state.map;
  const ts = map.tileSize || TILE_SIZE;
  const bfs = computeSpawnBfs(map);
  const anchors: Array<{ x: number; y: number; bfsDist: number }> = [];
  const minAnchorSepSq = 68 * 68;

  const tryAddAnchor = (x: number, y: number, bfsDist: number): boolean => {
    if (!isSpotSafeFromSpawn(state, x, y, MIN_SPAWN_NO_LOS_DIST, MIN_SPAWN_WITH_LOS_DIST)) {
      return false;
    }
    if (isCircleOverlappingSolid(map, x, y, 7)) return false;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]!;
      const dx = x - a.x;
      const dy = y - a.y;
      if (dx * dx + dy * dy < minAnchorSepSq) return false;
    }
    anchors.push({ x, y, bfsDist });
    return true;
  };

  // 1. Seed up to 2 risk-reward encounter pockets guarding chests & rad canisters
  for (let i = 0; i < state.props.length && anchors.length < Math.min(2, desiredCount); i++) {
    const prop = state.props[i]!;
    if (
      prop.kind !== 'weapon_chest' &&
      prop.kind !== 'big_weapon_chest' &&
      prop.kind !== 'rad_canister' &&
      prop.kind !== 'ammo_chest'
    ) {
      continue;
    }
    const { tx, ty } = worldToTile(prop.x, prop.y, ts);
    const d = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? bfs[ty * map.width + tx]! : -1;
    if (d >= 8) {
      tryAddAnchor(prop.x, prop.y, d);
    }
  }

  // 2. Collect safe walkable tiles partitioned into near-mid (first bend skirmish) and deep pockets
  const nearMid: Array<{ x: number; y: number; d: number }> = [];
  const deep: Array<{ x: number; y: number; d: number }> = [];

  for (let ty = 3; ty < map.height - 3; ty++) {
    for (let tx = 3; tx < map.width - 3; tx++) {
      const d = bfs[ty * map.width + tx]!;
      if (d < 8) continue;
      if (!isWalkableTile(getTile(map, tx, ty))) continue;
      const pos = tileToWorldCenter(tx, ty, ts);
      if (!isSpotSafeFromSpawn(state, pos.x, pos.y, MIN_SPAWN_NO_LOS_DIST, MIN_SPAWN_WITH_LOS_DIST)) {
        continue;
      }
      if (isCircleOverlappingSolid(map, pos.x, pos.y, 7)) continue;
      if (d <= 17) {
        nearMid.push({ x: pos.x, y: pos.y, d });
      } else {
        deep.push({ x: pos.x, y: pos.y, d });
      }
    }
  }

  // Pick 1..2 near-mid anchors so action ignites cleanly right past the first canyon bend
  if (nearMid.length > 0 && anchors.length < desiredCount) {
    const nearTarget = Math.min(desiredCount, anchors.length + 2);
    for (let tries = 0; tries < 40 && anchors.length < nearTarget; tries++) {
      const c = rng.pick(nearMid);
      tryAddAnchor(c.x, c.y, c.d);
    }
  }

  // Fill remaining anchors across deep pockets (then nearMid if map is compact)
  const combined = deep.length > 0 ? deep : nearMid;
  for (let tries = 0; tries < 100 && anchors.length < desiredCount && combined.length > 0; tries++) {
    const c = rng.pick(combined);
    tryAddAnchor(c.x, c.y, c.d);
  }
  for (let tries = 0; tries < 60 && anchors.length < desiredCount && nearMid.length > 0; tries++) {
    const c = rng.pick(nearMid);
    tryAddAnchor(c.x, c.y, c.d);
  }

  // Fallback if map is tiny (e.g., Vault / Pizza Sewers)
  while (anchors.length < Math.max(1, Math.min(2, desiredCount))) {
    const spot = findSafeFloorSpot(state, rng, 108, 8, 16, true);
    anchors.push({ x: spot.x, y: spot.y, bfsDist: 12 });
  }

  return anchors;
}

function findSquadMemberSpot(
  state: SimState,
  anchorX: number,
  anchorY: number,
  radius: number,
  rng: SeededRng,
): { x: number; y: number } {
  for (let attempt = 0; attempt < 28; attempt++) {
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(16, 38);
    const cx = anchorX + Math.cos(ang) * r;
    const cy = anchorY + Math.sin(ang) * r;
    const safe = ensureSafeEntityPosition(state, cx, cy, radius, false);
    if (!isSpotSafeFromSpawn(state, safe.x, safe.y, MIN_SPAWN_NO_LOS_DIST, MIN_SPAWN_WITH_LOS_DIST)) {
      continue;
    }
    let overlap = false;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const dx = safe.x - e.x;
      const dy = safe.y - e.y;
      const minSep = e.radius + radius + 4;
      if (dx * dx + dy * dy < minSep * minSep) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      for (let i = 0; i < state.props.length; i++) {
        const p = state.props[i]!;
        const dx = safe.x - p.x;
        const dy = safe.y - p.y;
        const minSep = p.radius + radius + 5;
        if (dx * dx + dy * dy < minSep * minSep) {
          overlap = true;
          break;
        }
      }
    }
    if (!overlap) return safe;
  }
  return findSafeFloorSpot(state, rng, MIN_SPAWN_NO_LOS_DIST, radius, 16, true);
}

function pickWeightedEnemy(
  pool: ReadonlyArray<{ def: EnemyDef; weight: number }>,
  rng: SeededRng,
): EnemyDef {
  let total = 0;
  for (let i = 0; i < pool.length; i++) {
    total += pool[i]!.weight;
  }
  let roll = rng.range(0, total);
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i]!;
    roll -= entry.weight;
    if (roll <= 0) return entry.def;
  }
  return pool[pool.length - 1]!.def;
}

function countHostiles(state: SimState): number {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (!e.friendly && e.hp > 0) n += 1;
  }
  return n;
}

/**
 * Canonical area entity populator matching `PopulateAreaFn`.
 * Spawns biome-authentic encounter squads in safe pockets (zero tick-0 spawn LOS snipes),
 * strategic explosive barrels/cover near packs, chests, mimics, bosses, and IDPD waves.
 */
export function populateAreaEntities(state: SimState, rng: SeededRng): void {
  const rt = resetAreaRuntime(state);
  rt.populatingArea = true;
  try {
  const areaDef = getAreaDef(state.areaCode);

  // If called standalone without loadAreaIntoState having spawned chests yet, spawn them now
  const hasChest = state.props.some(
    (p) =>
      p.kind === 'weapon_chest' ||
      p.kind === 'big_weapon_chest' ||
      p.kind === 'ammo_chest' ||
      p.kind === 'rad_canister' ||
      p.kind === 'idpd_canister',
  );
  if (!hasChest && state.areaCode !== '0-1' && state.areaCode !== '7-3') {
    spawnLevelChests(state, rng);
  }

  // 1. Compute spatial encounter pockets before placing props so barrels/cover sit beside enemy packs!
  const pool = getBiomePool(state);
  let budget = areaDef.enemyBudgetBase;
  if (budget > 0) {
    budget = Math.round(budget * (1 + state.loop * 0.55));
    if (state.crown === 'blood') budget = Math.round(budget * 1.45);
    if (state.crown === 'luck') budget = Math.round(budget * 0.85);
  }

  const desiredAnchors =
    budget > 0 && pool.length > 0
      ? Math.max(3, Math.min(8, Math.round(budget / 8)))
      : 0;
  const anchors =
    desiredAnchors > 0 ? pickEncounterAnchors(state, desiredAnchors, rng) : [];

  // 2. Biome props, explosive barrels/cars near encounter pockets & 7-3 symmetrical Throne Generators
  spawnBiomeProps(state, rng, anchors);
  rt.throneLastGenCount = state.generatorsRemaining;

  // 3. Purposeful Biome Enemy Squads across encounter pockets
  if (state.areaCode === 'vault') {
    // Authentic symmetrical Crown Guardians flanking the Crown Chamber alcoves
    const cx = Math.floor(state.map.width / 2);
    const ts = state.map.tileSize || TILE_SIZE;
    const westAlcove = tileToWorldCenter(cx - 11, 17, ts);
    const eastAlcove = tileToWorldCenter(cx + 11, 17, ts);
    createEnemyEntity(state, 'crown_guardian', westAlcove.x, westAlcove.y, rng);
    createEnemyEntity(state, 'crown_guardian', eastAlcove.x, eastAlcove.y, rng);
  } else if (budget > 0 && pool.length > 0) {
    const maxEnemiesCap = Math.min(76, 26 + state.loop * 14 + (state.crown === 'blood' ? 12 : 0));
    const templates = pickBiomeSquadTemplates(state);
    const allowedIds = new Set(pool.map((p) => p.def.id));
    let remaining = budget;

    // First pass: stamp 1 cohesive biome squad at each encounter anchor
    for (let aIdx = 0; aIdx < anchors.length && remaining >= 2 && state.enemies.length < maxEnemiesCap; aIdx++) {
      const anchor = anchors[aIdx]!;
      const rawTemplate = rng.pick(templates);
      const squadIds = rawTemplate.filter((id) => allowedIds.has(id) && Boolean(ENEMIES[id]));
      if (squadIds.length === 0) continue;

      for (let m = 0; m < squadIds.length && remaining >= 1 && state.enemies.length < maxEnemiesCap; m++) {
        const def = ENEMIES[squadIds[m]!]!;
        const cost = getEnemyCost(def);
        if (m > 0 && cost > remaining + 1) continue;
        const spot = findSquadMemberSpot(state, anchor.x, anchor.y, def.radius, rng);
        createEnemyEntity(state, def.id, spot.x, spot.y, rng);
        remaining -= cost;
      }
    }

    // Second pass: spend any leftover budget reinforcing existing encounter anchors (keeping pack cohesion)
    let guard = 0;
    while (remaining >= 2 && state.enemies.length < maxEnemiesCap && guard < 80) {
      guard += 1;
      const chosen = pickWeightedEnemy(pool, rng);
      const cost = getEnemyCost(chosen);
      if (cost > remaining && remaining >= 2 && guard < 30) continue;

      const anchor = anchors.length > 0 ? rng.pick(anchors) : null;
      const spot = anchor
        ? findSquadMemberSpot(state, anchor.x, anchor.y, chosen.radius, rng)
        : findSafeFloorSpot(state, rng, MIN_SPAWN_NO_LOS_DIST, chosen.radius, 16, true);
      createEnemyEntity(state, chosen.id, spot.x, spot.y, rng);
      remaining -= cost;
    }
  }

  // 4. Mimics on 2-1+ or Loop 1+ (replaces an existing chest when safely away from spawn!)
  const isEarlyDesert =
    state.loop === 0 &&
    (state.areaCode === '1-1' || state.areaCode === '1-2' || state.areaCode === '1-3');
  if (!isEarlyDesert && state.areaCode !== '7-3' && state.areaCode !== '0-1' && state.areaCode !== 'vault') {
    const mimicChance = state.loop > 0 ? 0.35 : 0.18;
    if (rng.chance(mimicChance)) {
      const isWeaponMimic = rng.chance(0.35);
      const mimicDef = isWeaponMimic ? 'weapon_mimic' : 'mimic';
      const targetChestKind = isWeaponMimic ? 'weapon_chest' : 'ammo_chest';
      let spot: { x: number; y: number } | null = null;
      for (let pIdx = state.props.length - 1; pIdx >= 0; pIdx--) {
        const prop = state.props[pIdx]!;
        if (prop.kind !== targetChestKind || prop.opened) continue;
        if (isSpotSafeFromSpawn(state, prop.x, prop.y, MIN_SPAWN_NO_LOS_DIST, MIN_SPAWN_WITH_LOS_DIST)) {
          spot = { x: prop.x, y: prop.y };
          state.props.splice(pIdx, 1);
          break;
        }
      }
      if (!spot) {
        spot = findSafeFloorSpot(state, rng, 118, 8, 22, true);
      }
      createEnemyEntity(state, mimicDef, spot.x, spot.y, rng, {
        initialAiState: 'disguised',
      });
    }
  }

  // 5. Bosses on boss areas: 1-3, 3-3, 5-3, 7-3, 0-1
  if (areaDef.bossId) {
    spawnBossEntity(state, areaDef.bossId, rng);
  }

  // 6. Loop 1+ / Rogue / high idpdHeat IDPD Portal & Van reinforcements
  const allowIdpdWaves =
    state.areaCode !== '7-3' &&
    state.areaCode !== '0-1' &&
    state.areaCode !== 'vault';
  if (allowIdpdWaves && (state.loop > 0 || state.player.mutant === 'rogue' || state.idpdHeat > 0)) {
    const waves = Math.min(3, 1 + state.loop + (state.idpdHeat >= 3 ? 1 : 0));
    rt.idpdWavesRemaining = waves;
    rt.idpdWaveTimer = state.loop > 0 ? rng.int(85, 145) : rng.int(130, 215);

    if (state.loop > 0 && state.areaCode !== 'hq-1') {
      spawnIdpdWave(state, rng, { includeVan: false, count: 2 });
    }
  }

  // 7. Accurate level start enemy count (hostiles only)
  state.levelStartEnemyCount = countHostiles(state);
  } finally {
    rt.populatingArea = false;
  }
}

/**
 * Convenience wrapper creating a complete, populated run `SimState` via `createInitialSimState`.
 */
export function createRunState(opts: {
  mutant: MutantId;
  seed?: number;
  crown?: CrownId;
  skin?: 'a' | 'b';
  goldenWeapon?: string | null;
}): SimState {
  return createInitialSimState({
    ...opts,
    populateFn: populateAreaEntities,
  });
}
