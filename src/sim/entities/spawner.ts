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

export interface ExtendedAreaRuntime {
  mapRef: WorldMap | null;
  venuzTvPropId: number | null;
  yungCuzPropId: number | null;
  captainDeskPropId: number | null;
  captainMessengerPropId: number | null;
  captainAwakened: boolean;
  bigTvPropId: number | null;
  momDamagedWithGoldenWeapon: boolean;
  hyperCrystalOrbIds: number[];
  hyperCrystalExpandTicks: number;
  technoStationIds: number[];
  technoActiveStationId: number | null;
  technoTeleportTimer: number;
  technoPhaseToggle: number;
  technoLastBurstHp: number;
  frogEggTimers: Map<number, number>;
  necroReviveTimers: Map<number, number>;
  horrorRadPools: Map<number, number>;
  vaultStatueIds: number[];
  vaultStatuesAwakened: boolean;
  throneStatueIds: number[];
  fireTrapTimers: Map<number, number>;
  fireTrapFiringTicks: Map<number, number>;
  fireTrapDirs: Map<number, number>;
  propHpSnapshot: Map<number, number>;
  propMetaSnapshot: Map<
    number,
    { kind: PropKind; sprite: string; x: number; y: number; radsStored?: number }
  >;
  toxicGasClouds: Array<{
    x: number;
    y: number;
    radius: number;
    lifeTicks: number;
    owner: 'enemy' | 'player';
  }>;
  idpdFreakRevives: Array<{
    x: number;
    y: number;
    timer: number;
    propId: number | null;
  }>;
  pendingHorrorUnlock: boolean;
}

const extendedAreaMap = new WeakMap<SimState, ExtendedAreaRuntime>();

function createEmptyExtendedAreaRuntime(mapRef: WorldMap | null): ExtendedAreaRuntime {
  return {
    mapRef,
    venuzTvPropId: null,
    yungCuzPropId: null,
    captainDeskPropId: null,
    captainMessengerPropId: null,
    captainAwakened: false,
    bigTvPropId: null,
    momDamagedWithGoldenWeapon: false,
    hyperCrystalOrbIds: [],
    hyperCrystalExpandTicks: 0,
    technoStationIds: [],
    technoActiveStationId: null,
    technoTeleportTimer: 0,
    technoPhaseToggle: 0,
    technoLastBurstHp: 0,
    frogEggTimers: new Map(),
    necroReviveTimers: new Map(),
    horrorRadPools: new Map(),
    vaultStatueIds: [],
    vaultStatuesAwakened: false,
    throneStatueIds: [],
    fireTrapTimers: new Map(),
    fireTrapFiringTicks: new Map(),
    fireTrapDirs: new Map(),
    propHpSnapshot: new Map(),
    propMetaSnapshot: new Map(),
    toxicGasClouds: [],
    idpdFreakRevives: [],
    pendingHorrorUnlock: false,
  };
}

export function getExtendedAreaRuntime(state: SimState): ExtendedAreaRuntime {
  let ext = extendedAreaMap.get(state);
  if (!ext || ext.mapRef !== state.map) {
    ext = createEmptyExtendedAreaRuntime(state.map);
    extendedAreaMap.set(state, ext);
  }
  return ext;
}

export function resetExtendedAreaRuntime(state: SimState): ExtendedAreaRuntime {
  const ext = createEmptyExtendedAreaRuntime(state.map);
  extendedAreaMap.set(state, ext);
  return ext;
}

export function snapshotTrackedProps(state: SimState): void {
  const ext = getExtendedAreaRuntime(state);
  ext.propHpSnapshot.clear();
  ext.propMetaSnapshot.clear();
  for (let i = 0; i < state.props.length; i++) {
    const p = state.props[i]!;
    ext.propHpSnapshot.set(p.id, p.hp);
    ext.propMetaSnapshot.set(p.id, {
      kind: p.kind,
      sprite: p.sprite,
      x: p.x,
      y: p.y,
      radsStored: p.radsStored,
    });
  }
}

export function getEffectiveLoop(state: SimState): number {
  return Math.max(0, Math.floor(state.loop)) + (state.hardMode ? 1 : 0);
}

/**
 * Exact Nuclear Throne Loop HP Scaling:
 * - Normal enemies: Math.round(base * (1 + 0.05 * effLoop))
 * - Big Dog: Math.round(base * (1 + 0.8 * effLoop))
 * - Captain: Math.round(base * (1 + 0.05 * effLoop))
 * - Other bosses: Math.round(base * (1 + 0.05 * effLoop) * (1 + effLoop / 3))
 */
export function computeLoopScaledHp(
  def: EnemyDef,
  effLoop: number,
  bossId?: BossId,
): number {
  const loopSafe = Math.max(0, effLoop);
  if (def.isBoss || bossId) {
    const id = bossId ?? (def.id as BossId);
    if (id === 'big_dog') {
      return Math.max(1, Math.round(def.maxHp * (1 + 0.8 * loopSafe)));
    }
    if (id === 'captain') {
      return Math.max(1, Math.round(def.maxHp * (1 + 0.05 * loopSafe)));
    }
    return Math.max(
      1,
      Math.round(def.maxHp * (1 + 0.05 * loopSafe) * (1 + loopSafe / 3)),
    );
  }
  return Math.max(1, Math.round(def.maxHp * (1 + 0.05 * loopSafe)));
}

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
    musicTrack: 'mus/Boss4B',
    introSound: 'sndNothing2Appear',
  },
  mom: {
    id: 'mom',
    name: 'MOM',
    subtitle: 'MATRIARCH OF THE SEWERS',
    musicTrack: 'mus/Boss5',
    introSound: 'sndBallMamaFire',
  },
  hyper_crystal: {
    id: 'hyper_crystal',
    name: 'HYPER CRYSTAL',
    subtitle: 'PRISM OF THE CAVES',
    musicTrack: 'mus/Boss6',
    introSound: 'sndHyperCrystalRelease',
  },
  technomancer: {
    id: 'technomancer',
    name: 'TECHNOMANCER',
    subtitle: 'MACHINE GOD',
    musicTrack: 'mus/Boss7',
    introSound: 'sndTechnomancerSpawnTurret',
  },
  captain: {
    id: 'captain',
    name: 'CAPTAIN',
    subtitle: 'I.D.P.D. COMMANDER',
    musicTrack: 'mus/Boss8',
    introSound: 'sndLastPattern1',
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
  const effLoop = getEffectiveLoop(state);
  const baseLoopHp =
    opts.hpScale !== undefined
      ? Math.round(def.maxHp * opts.hpScale)
      : computeLoopScaledHp(def, effLoop, opts.bossId);
  const scarierMult =
    !rt.populatingArea && !opts.friendly && state.player.mutations.includes('scarier_face')
      ? 0.8
      : 1.0;
  const scaledHp = Math.max(1, Math.round(baseLoopHp * scarierMult));

  let defaultState = 'idle';
  if (def.aiArchetype === 'assassin') defaultState = 'feign';
  else if (def.aiArchetype === 'mimic') defaultState = 'disguised';
  else if (def.aiArchetype === 'idpd_van') defaultState = 'drive';
  else if (opts.bossId === 'big_dog' || opts.bossId === 'nuclear_throne') defaultState = 'sleep';
  else if (opts.bossId === 'captain' || def.id === 'captain') defaultState = 'idle_desk';

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
    contactDamage:
      (opts.initialAiState ?? defaultState) === 'idle_desk' ? 0 : def.contactDamage,
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

  if (def.id === 'enemy_horror') {
    const ext = getExtendedAreaRuntime(state);
    ext.horrorRadPools.set(enemy.id, 90);
  }
  return enemy;
}

/**
 * Spawns any of the 9 canonical bosses on safe walkable floor, initializes `state.boss`,
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
  const effLoop = getEffectiveLoop(state);
  const ext = getExtendedAreaRuntime(state);

  // Special multi-station boss: Technomancer spawns `3 + max(0, effLoop - 1)` Battle Stations!
  if (bossId === 'technomancer') {
    const stationCount = 3 + Math.max(0, effLoop - 1);
    const stations: EnemyEntity[] = [];
    ext.technoStationIds = [];

    for (let i = 0; i < stationCount; i++) {
      let spot = findSafeFloorSpot(state, rng, 112, 24, 58, false);
      spot = ensureSafeEntityPosition(state, spot.x, spot.y, 24, true);
      const st = createEnemyEntity(state, 'technomancer', spot.x, spot.y, rng, {
        bossId: 'technomancer',
        initialAiState: i === 0 ? 'active' : 'empty',
        carveIfTight: true,
      });
      st.aiTimer = i === 0 ? 45 : 0;
      st.attackCooldown = i === 0 ? 36 : 999;
      stations.push(st);
      ext.technoStationIds.push(st.id);
    }

    const primary = stations[0]!;
    ext.technoActiveStationId = primary.id;
    ext.technoTeleportTimer = rng.int(180, 240);
    ext.technoPhaseToggle = 0;
    ext.technoLastBurstHp = primary.hp;

    const rt = getAreaRuntime(state);
    rt.bossDeathHandled = false;
    const totalHpRaw = stations.reduce((acc, s) => acc + s.maxHp, 0);
    const bossBarHp =
      rt.populatingArea && state.player.mutations.includes('scarier_face')
        ? stations.reduce((acc, s) => acc + Math.max(1, Math.round(s.maxHp * 0.8)), 0)
        : totalHpRaw;

    state.boss = {
      bossId,
      entityId: primary.id,
      name: meta.name,
      subtitle: meta.subtitle,
      hp: bossBarHp,
      maxHp: bossBarHp,
      introTicks: 45,
      defeated: false,
    };

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
      x: primary.x,
      y: primary.y,
    });

    return primary;
  }

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
    initialAiState = 'await_drop';
    elevated = true;
    elevZ = 260;
    invulnerable = true;
  } else if (bossId === 'mom') {
    spawnPos = findSafeFloorSpot(state, rng, 144, 22, 22, true);
    spawnPos = ensureSafeEntityPosition(state, spawnPos.x, spawnPos.y, 22, true);
    initialAiState = 'walk';
  } else if (bossId === 'hyper_crystal') {
    spawnPos = findSafeFloorSpot(state, rng, 152, 28, 24, true);
    spawnPos = ensureSafeEntityPosition(state, spawnPos.x, spawnPos.y, 28, true);
    initialAiState = 'orbit';
  } else if (bossId === 'captain') {
    if (state.areaCode === 'hq-3') {
      const cx = Math.floor(map.width / 2);
      const seat = tileToWorldCenter(cx, 8, ts);
      spawnPos = ensureSafeEntityPosition(state, seat.x, seat.y, 16, false);
    } else {
      spawnPos = findSafeFloorSpot(state, rng, 144, 16, 20, false);
    }
    initialAiState = 'idle_desk';
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
    carveIfTight:
      bossId === 'big_dog' ||
      bossId === 'nuclear_throne' ||
      bossId === 'throne_ii' ||
      bossId === 'mom' ||
      bossId === 'hyper_crystal',
  });

  if (bossId === 'lil_hunter') {
    boss.aiTimer = 130;
    boss.contactDamage = 0;
    boss.targetX = spawnPos.x;
    boss.targetY = spawnPos.y;
  } else if (bossId === 'big_bandit') {
    boss.aiTimer = 10;
    boss.attackCooldown = 20;
  } else if (bossId === 'throne_ii') {
    boss.aiTimer = 10;
    boss.attackCooldown = 20;
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
  } else if (bossId === 'mom') {
    const diagAng = (rng.int(0, 3) * Math.PI) / 2 + Math.PI / 4;
    boss.targetX = Math.cos(diagAng);
    boss.targetY = Math.sin(diagAng);
    boss.aiTimer = 50;
    boss.attackCooldown = 36;
    ext.momDamagedWithGoldenWeapon = false;
  } else if (bossId === 'hyper_crystal') {
    boss.aiTimer = 50;
    boss.attackCooldown = 42;
    ext.hyperCrystalOrbIds = [];
    ext.hyperCrystalExpandTicks = 0;
    const isCursed = state.areaCode === '4-?';
    const orbDefId = isCursed ? 'cursed_laser_crystal' : 'laser_crystal';
    const orbCount = Math.min(11, 5 + Math.max(0, effLoop - 1) * 2);
    for (let k = 0; k < orbCount; k++) {
      const ang = (k / orbCount) * Math.PI * 2;
      const ox = boss.x + Math.cos(ang) * 44;
      const oy = boss.y + Math.sin(ang) * 44;
      const orb = createEnemyEntity(state, orbDefId, ox, oy, rng, {
        isBossSummon: true,
        carveIfTight: true,
      });
      orb.aiPhase = k;
      ext.hyperCrystalOrbIds.push(orb.id);
    }
  } else if (bossId === 'captain') {
    boss.aimAngle = Math.PI * 0.5;
    boss.contactDamage = 0;
    boss.aiTimer = 0;
    boss.attackCooldown = 28;
    ext.captainAwakened = false;
  }

  const rt = getAreaRuntime(state);
  rt.bossDeathHandled = false;
  rt.throneWoken = false;
  rt.throneLastGenCount = state.generatorsRemaining;
  rt.brokenThronePropId = null;
  rt.brokenThroneSitDelay = 0;

  const startsDelayed =
    initialAiState === 'sleep' ||
    initialAiState === 'await_drop' ||
    initialAiState === 'idle_desk';
  // Mirror loadAreaIntoState's post-populate Scarier Face -20% HP scaling so state.boss.maxHp never desyncs!
  const bossBarHp =
    rt.populatingArea && state.player.mutations.includes('scarier_face')
      ? Math.max(1, Math.round(boss.maxHp * 0.8))
      : boss.maxHp;
  state.boss = {
    bossId,
    entityId: boss.id,
    name: meta.name,
    subtitle: meta.subtitle,
    hp: bossBarHp,
    maxHp: bossBarHp,
    introTicks: startsDelayed ? 0 : 45,
    defeated: false,
  };

  // Sleeping / sky-delayed / passive-desk bosses hold intro & boss music until arrival/wake!
  if (!startsDelayed) {
    const musicTrack =
      bossId === 'hyper_crystal' && state.areaCode === '4-?' ? 'mus/Boss6B' : meta.musicTrack;
    emitEvent(state, {
      type: 'boss_intro',
      bossId,
      name: meta.name,
      subtitle: meta.subtitle,
    });
    emitEvent(state, {
      type: 'music',
      track: musicTrack,
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
 * Spawns an IDPD Portal or IDPD Van reinforcement wave (Grunts, Inspectors, Shielders, Elites, Vans, or IDPD Freaks on L3+).
 */
export function spawnIdpdWave(
  state: SimState,
  rng: SeededRng,
  opts: SpawnIdpdWaveOptions = {},
): EnemyEntity[] {
  const spawned: EnemyEntity[] = [];
  const effLoop = getEffectiveLoop(state);
  const baseSpot =
    opts.anchorX !== undefined && opts.anchorY !== undefined
      ? ensureSafeEntityPosition(state, opts.anchorX, opts.anchorY, 10, false)
      : findSafeFloorSpot(state, rng, 132, 10, 16, true);

  // On Loop 3+, IDPD Vans and squads are replaced by IDPD Freaks!
  if (opts.includeVan && effLoop < 3) {
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

  const count = opts.count ?? (effLoop > 0 ? rng.int(3, 4) : rng.int(2, 3));
  const pool: readonly string[] =
    effLoop >= 3
      ? ['idpd_freak']
      : effLoop > 0
        ? [
            'idpd_grunt',
            'idpd_inspector',
            'idpd_shielder',
            'elite_grunt',
            'elite_inspector',
            'elite_shielder',
          ]
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

  const requireNoTick0Los =
    (opts.anchorX === undefined && opts.anchorY === undefined) || getAreaRuntime(state).populatingArea;

  for (let i = 0; i < count; i++) {
    const defId = rng.pick(pool);
    const defRadius = ENEMIES[defId]?.radius ?? 8;
    const baseAngle = (i / Math.max(1, count)) * Math.PI * 2 + rng.range(-0.2, 0.2);
    let chosenSpot = ensureSafeEntityPosition(
      state,
      baseSpot.x + Math.cos(baseAngle) * 14,
      baseSpot.y + Math.sin(baseAngle) * 14,
      defRadius,
      false,
    );
    if (requireNoTick0Los && !isSpotSafeFromSpawn(state, chosenSpot.x, chosenSpot.y)) {
      let foundSafe: { x: number; y: number } | null = null;
      for (let k = 1; k <= 8; k++) {
        const tryAng = baseAngle + (k / 8) * Math.PI * 2;
        const cand = ensureSafeEntityPosition(
          state,
          baseSpot.x + Math.cos(tryAng) * 14,
          baseSpot.y + Math.sin(tryAng) * 14,
          defRadius,
          false,
        );
        if (isSpotSafeFromSpawn(state, cand.x, cand.y)) {
          foundSafe = cand;
          break;
        }
      }
      if (!foundSafe && isSpotSafeFromSpawn(state, baseSpot.x, baseSpot.y)) {
        foundSafe = baseSpot;
      }
      chosenSpot = foundSafe ?? findSafeFloorSpot(state, rng, MIN_SPAWN_NO_LOS_DIST, defRadius, 14, true);
    }
    const unit = createEnemyEntity(state, defId, chosenSpot.x, chosenSpot.y, rng, {
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
  return (
    kind === 'barrel' ||
    kind === 'toxic_barrel' ||
    kind === 'car' ||
    kind === 'gold_barrel' ||
    kind === 'water_mine' ||
    kind === 'small_generator'
  );
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

function findWallAdjacentFireTrapSpot(
  state: SimState,
  rng: SeededRng,
): { x: number; y: number; angle: number } | null {
  const map = state.map;
  const ts = map.tileSize || TILE_SIZE;
  const dirs: ReadonlyArray<{ dx: number; dy: number; ang: number }> = [
    { dx: 1, dy: 0, ang: 0 },
    { dx: -1, dy: 0, ang: Math.PI },
    { dx: 0, dy: 1, ang: Math.PI * 0.5 },
    { dx: 0, dy: -1, ang: -Math.PI * 0.5 },
  ];

  for (let attempt = 0; attempt < 90; attempt++) {
    const tx = rng.int(3, map.width - 4);
    const ty = rng.int(3, map.height - 4);
    if (!isWalkableTile(getTile(map, tx, ty))) continue;
    const pos = tileToWorldCenter(tx, ty, ts);
    if (!isPropSpotClear(state, pos.x, pos.y, 44, 'fire_trap')) continue;
    if (Math.hypot(pos.x - state.player.x, pos.y - state.player.y) < 96) continue;

    // Require an adjacent solid wall behind the trap and >= 3 open tiles in the firing direction
    for (let d = 0; d < dirs.length; d++) {
      const dir = dirs[d]!;
      const backSolid = !isWalkableTile(getTile(map, tx - dir.dx, ty - dir.dy));
      const front1 = isWalkableTile(getTile(map, tx + dir.dx, ty + dir.dy));
      const front2 = isWalkableTile(getTile(map, tx + dir.dx * 2, ty + dir.dy * 2));
      if (backSolid && front1 && front2) {
        return { x: pos.x, y: pos.y, angle: dir.ang };
      }
    }
  }
  return null;
}

function addFloorWeaponPickup(
  state: SimState,
  weaponId: string,
  x: number,
  y: number,
  cursed?: boolean,
): void {
  const safe = findNearestFloor(state.map, x, y, 8);
  state.pickups.push({
    id: allocEntityId(state),
    kind: 'weapon',
    x: safe.x,
    y: safe.y,
    vx: 0,
    vy: 0,
    value: 1,
    weaponId,
    cursed,
    lifeTicks: 999999,
    animFrame: 0,
  });
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
  const effLoop = getEffectiveLoop(state);
  const ext = getExtendedAreaRuntime(state);

  // Special setpiece: Y.V.'s Crib (`$$$`) — Living Room + North Garage (ZERO enemies!)
  if (areaCode === '$$$') {
    const cx = Math.floor(map.width / 2);

    // Royal rug floor decal in the South Living Room
    const rugPos = tileToWorldCenter(cx, 22, ts);
    state.decals.push({
      kind: 'rubble',
      x: rugPos.x,
      y: rugPos.y,
      angle: 0,
      scale: 1,
      color: '#ffffff',
      sprite: 'sprVenuzCarpet',
    });

    // Destructible giant TV, plush couch, and non-hostile Yung Cuz
    const tvPos = tileToWorldCenter(cx, 19, ts);
    const tv = addProp(state, 'venuz_tv', tvPos.x, tvPos.y, 'sprVenuzTV', 60, 16, true);
    ext.venuzTvPropId = tv.id;

    const couchPos = tileToWorldCenter(cx, 24, ts);
    addProp(state, 'venuz_couch', couchPos.x, couchPos.y, 'sprVenuzCouch', 40, 14, true);

    const cuzPos = tileToWorldCenter(cx + 2, 24, ts);
    const cuz = addProp(state, 'yung_cuz', cuzPos.x, cuzPos.y, 'sprCuzIdle', 999999, 10, false);
    ext.yungCuzPropId = cuz.id;

    // 2 Giant Weapon Chests (+1 with Open Mind); replaced by Giant Ammo Chests with Crown of Love!
    const chestCount = 2 + (state.player.mutations.includes('open_mind') ? 1 : 0);
    const loveMode = state.crown === 'love';
    const chestCoords: Array<{ tx: number; ty: number }> = [
      { tx: cx - 6, ty: 22 },
      { tx: cx + 6, ty: 22 },
      { tx: cx - 6, ty: 26 },
    ];
    for (let i = 0; i < chestCount; i++) {
      const cc = chestCoords[i]!;
      const cpos = tileToWorldCenter(cc.tx, cc.ty, ts);
      addProp(
        state,
        loveMode ? 'giant_ammo_chest' : 'giant_weapon_chest',
        cpos.x,
        cpos.y,
        loveMode ? 'sprGiantAmmoChest' : 'sprGiantWepChest',
        999999,
        16,
        false,
        {
          openSprite: loveMode ? 'sprGiantAmmoChestOpen' : 'sprGiantWepChestOpen',
          interactPrompt: loveMode ? '[E] GIANT AMMO CHEST' : '[E] GIANT WEAPON CHEST',
        },
      );
    }

    // 5 Parked Golden Cars in North Garage (`venuz_car_exit`)
    const carCoords: Array<{ tx: number; ty: number }> = [
      { tx: cx - 5, ty: 7 },
      { tx: cx, ty: 7 },
      { tx: cx + 5, ty: 7 },
      { tx: cx - 4, ty: 11 },
      { tx: cx + 4, ty: 11 },
    ];
    for (let i = 0; i < carCoords.length; i++) {
      const cc = carCoords[i]!;
      const cpos = tileToWorldCenter(cc.tx, cc.ty, ts);
      addProp(state, 'venuz_car_exit', cpos.x, cpos.y, 'sprVenuzCar2', 999999, 12, true, {
        interactPrompt: '[E] LEAVE CRIB',
      });
    }
    return;
  }

  // Special setpiece: I.D.P.D. HQ-3 (`hq-3`) — Captain's Office Chamber
  if (areaCode === 'hq-3') {
    const cx = Math.floor(map.width / 2);

    // West & East South Antechamber Alcoves: HQ props + 1 weapon chest + 1 ammo chest
    const westWep = tileToWorldCenter(cx - 9, 29, ts);
    addProp(
      state,
      state.crown === 'love' ? 'ammo_chest' : 'weapon_chest',
      westWep.x,
      westWep.y,
      state.crown === 'love' ? 'sprIDPDChest' : 'sprWeaponChest',
      999,
      8,
      false,
      {
        openSprite: state.crown === 'love' ? 'sprIDPDChestOpen' : 'sprWeaponChestOpen',
      },
    );
    const wServ = tileToWorldCenter(cx - 10, 27, ts);
    addProp(state, 'server', wServ.x, wServ.y, 'sprServer', 20, 9, true);
    const wTerm = tileToWorldCenter(cx - 8, 31, ts);
    addProp(state, 'terminal', wTerm.x, wTerm.y, 'sprTerminal', 16, 8, true);

    const eastAmmo = tileToWorldCenter(cx + 8, 29, ts);
    addProp(state, 'ammo_chest', eastAmmo.x, eastAmmo.y, 'sprIDPDChest', 999, 8, false, {
      openSprite: 'sprIDPDChestOpen',
    });
    const eServ = tileToWorldCenter(cx + 9, 27, ts);
    addProp(state, 'server', eServ.x, eServ.y, 'sprServer', 20, 9, true);
    const eTerm = tileToWorldCenter(cx + 7, 31, ts);
    addProp(state, 'terminal', eTerm.x, eTerm.y, 'sprTerminal', 16, 8, true);

    // Central Open Arena flanking smashable cover (pillars + office tables)
    const arenaYs = [16, 21];
    for (let i = 0; i < arenaYs.length; i++) {
      const ay = arenaYs[i]!;
      for (const side of [-1, 1]) {
        const pPos = tileToWorldCenter(cx + side * 8, ay, ts);
        addProp(state, 'pillar', pPos.x, pPos.y, 'sprPillar', 36, 9, true);
        const tPos = tileToWorldCenter(cx + side * 5, ay + 1, ts);
        addProp(
          state,
          'office_table',
          tPos.x,
          tPos.y,
          i % 2 === 0 ? 'sprTable1' : 'sprTable2',
          16,
          10,
          true,
        );
      }
    }

    // North Executive Dais: Big TV, Last Chair, Captain's Desk, fleeing Messenger
    const bigTvPos = tileToWorldCenter(cx, 6, ts);
    const bigTv = addProp(state, 'big_tv', bigTvPos.x, bigTvPos.y, 'sprBigTVOn', 45, 16, true);
    ext.bigTvPropId = bigTv.id;

    const chairPos = tileToWorldCenter(cx, 8, ts);
    addProp(state, 'last_chair', chairPos.x, chairPos.y, 'sprLastChair', 20, 8, false);

    const deskPos = tileToWorldCenter(cx, 10, ts);
    const desk = addProp(state, 'captain_desk', deskPos.x, deskPos.y, 'sprDeskEmpty', 40, 20, true);
    ext.captainDeskPropId = desk.id;

    const msgPos = tileToWorldCenter(cx + 4, 10, ts);
    const messenger = addProp(
      state,
      'messenger',
      msgPos.x,
      msgPos.y,
      'sprMessengerIdle',
      999999,
      8,
      false,
    );
    ext.captainMessengerPropId = messenger.id;
    return;
  }

  // Special canonical placement for 7-3 Krunked Throne Hall: 4 Generators flush inside the main hall flanks!
  if (areaCode === '7-3') {
    const cx = Math.floor(map.width / 2);
    const daisTop = 7;
    const daisBottom = 21;
    const genYs = [daisTop + 12, daisBottom + 10];
    // 4 Generators symmetrically flush along main-hall bays (zero brick wall clipping; East generators flipX inward!)
    const alcoveCoords: Array<{ tx: number; ty: number; flipX: boolean }> = [
      { tx: cx - 6, ty: genYs[0]!, flipX: false },
      { tx: cx + 6, ty: genYs[0]!, flipX: true },
      { tx: cx - 6, ty: genYs[1]!, flipX: false },
      { tx: cx + 6, ty: genYs[1]!, flipX: true },
    ];

    let placedGenerators = 0;
    for (let i = 0; i < alcoveCoords.length; i++) {
      const c = alcoveCoords[i]!;
      const raw = tileToWorldCenter(c.tx, c.ty, ts);
      const safe = findNearestFloor(map, raw.x, raw.y, 8);
      addProp(state, 'throne_generator', safe.x, safe.y, 'sprBigGenerator', 75, 22, true, {
        flipX: c.flipX,
      });
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

    // Dormant Throne Statues lining the red carpet flanks (wake into Palace Guardians if damaged!)
    const statueYs = [daisBottom + 8, daisBottom + 20, daisBottom + 30];
    for (let i = 0; i < statueYs.length; i++) {
      const sy = statueYs[i]!;
      if (sy >= map.height - 10) continue;
      for (const side of [-1, 1]) {
        const raw = tileToWorldCenter(cx + side * 3, sy, ts);
        if (!isWorldSolid(map, raw.x, raw.y)) {
          const st = addProp(state, 'throne_statue', raw.x, raw.y, 'sprThroneStatue', 30, 10, true);
          ext.throneStatueIds.push(st.id);
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

  // Reskin special-biome chests to authentic NT chest sprites
  if (areaCode === 'vault') {
    const cx = Math.floor(map.width / 2);
    const pedPos = tileToWorldCenter(cx, 17, ts);
    let protoCount = 0;
    let hasEastChest = false;
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'weapon_chest' || p.kind === 'big_weapon_chest' || p.kind === 'ammo_chest') {
        p.sprite = 'sprProtoChest';
        p.openSprite = 'sprProtoChestOpen';
        protoCount += 1;
      }
      if (
        (p.kind === 'weapon_chest' ||
          p.kind === 'big_weapon_chest' ||
          p.kind === 'ammo_chest' ||
          p.kind === 'rad_canister') &&
        Math.hypot(p.x - pedPos.x, p.y - pedPos.y) < 48
      ) {
        const target = tileToWorldCenter(cx + 6, 20, ts);
        const reloc = findNearestFloor(map, target.x, target.y, 6);
        p.x = reloc.x;
        p.y = reloc.y;
        hasEastChest = true;
      }
    }
    // Persistent cross-run Proto Chest on west wing (swaps held weapon with stored Proto Chest weapon!)
    const protoWest = findNearestFloor(map, tileToWorldCenter(cx - 6, 20, ts).x, tileToWorldCenter(cx - 6, 20, ts).y, 6);
    addProp(state, 'proto_chest', protoWest.x, protoWest.y, 'sprProtoChest', 999999, 10, false, {
      openSprite: 'sprProtoChestOpen',
      interactPrompt: '[E] PROTO CHEST',
    });

    // East wing Vault supply chest (uses sprProtoChest)
    if (!hasEastChest && protoCount < 1) {
      const wantWeapon = state.crown !== 'love';
      const kind: PropKind = wantWeapon ? 'weapon_chest' : 'ammo_chest';
      const eastTarget = tileToWorldCenter(cx + 6, 20, ts);
      const pos = findNearestFloor(map, eastTarget.x, eastTarget.y, 6);
      addProp(state, kind, pos.x, pos.y, 'sprProtoChest', 10, 8, false, {
        openSprite: 'sprProtoChestOpen',
      });
    }

    // Two dormant Vault Statues flanking the Crown Chamber (wake into Crown Guardians on damage or Crown pick!)
    const westAlcove = findNearestFloor(map, tileToWorldCenter(cx - 11, 17, ts).x, tileToWorldCenter(cx - 11, 17, ts).y, 6);
    const eastAlcove = findNearestFloor(map, tileToWorldCenter(cx + 11, 17, ts).x, tileToWorldCenter(cx + 11, 17, ts).y, 6);
    const vsW = addProp(state, 'vault_statue', westAlcove.x, westAlcove.y, 'sprVaultStatue', 30, 10, true);
    const vsE = addProp(state, 'vault_statue', eastAlcove.x, eastAlcove.y, 'sprVaultStatue', 30, 10, true);
    ext.vaultStatueIds = [vsW.id, vsE.id];
    ext.vaultStatuesAwakened = false;
  } else if (areaCode === '3-?') {
    let goldCount = 0;
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'weapon_chest' || p.kind === 'big_weapon_chest') {
        p.sprite = 'sprGoldChest';
        p.openSprite = 'sprGoldChestOpen';
        goldCount += 1;
      }
    }
    if (goldCount === 0) {
      const pos = findSafeFloorSpot(state, rng, 72, 8, 20, false);
      addProp(state, 'weapon_chest', pos.x, pos.y, 'sprGoldChest', 999, 8, false, {
        openSprite: 'sprGoldChestOpen',
      });
    }
    // Royal rug decal in Mansion
    const rugSpot = findSafeFloorSpot(state, rng, 64, 12, 24, false);
    state.decals.push({
      kind: 'rubble',
      x: rugSpot.x,
      y: rugSpot.y,
      angle: 0,
      scale: 1,
      color: '#ffffff',
      sprite: 'sprVenuzCarpet',
    });
  } else if (areaCode === '4-?') {
    let cursedSmallCount = 0;
    let hasBigCursed = false;
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'big_weapon_chest') {
        p.sprite = 'sprCursedChestBig';
        p.openSprite = 'sprCursedChestBigOpen';
        p.cursed = true;
        hasBigCursed = true;
      } else if (p.kind === 'weapon_chest') {
        p.sprite = 'sprCursedChest';
        p.openSprite = 'sprCursedChestOpen';
        p.cursed = true;
        cursedSmallCount += 1;
      }
    }
    // Authentic NT Cursed Crystal Caves: guarantee Large Cursed Weapon Chest (3 cursed weapons at diff+5) + Cursed Chest!
    if (!hasBigCursed) {
      const pos = findSafeFloorSpot(state, rng, 76, 10, 22, false);
      addProp(state, 'big_weapon_chest', pos.x, pos.y, 'sprCursedChestBig', 999, 10, false, {
        openSprite: 'sprCursedChestBigOpen',
        cursed: true,
      });
    }
    if (cursedSmallCount === 0) {
      const pos = findSafeFloorSpot(state, rng, 72, 8, 20, false);
      addProp(state, 'weapon_chest', pos.x, pos.y, 'sprCursedChest', 999, 8, false, {
        openSprite: 'sprCursedChestOpen',
        cursed: true,
      });
    }
  } else if (areaCode === '2-?') {
    // Authentic Pizza Sewers floor decal + 2 Pizza Chests!
    state.decals.push({
      kind: 'rubble',
      x: map.spawnX,
      y: map.spawnY - 40,
      angle: 0,
      scale: 1,
      color: '#ffffff',
      sprite: 'sprPizzaSewerDecal',
    });
    for (let i = 0; i < 2; i++) {
      const pos = findSafeFloorSpot(state, rng, 64, 8, 24, false);
      addProp(
        state,
        'pizza_chest',
        pos.x,
        pos.y,
        i % 2 === 0 ? 'sprPizzaChest1' : 'sprPizzaChest2',
        999,
        8,
        false,
        { openSprite: 'sprPizzaChestOpen' },
      );
    }
  } else if (areaCode === 'hq-1' || areaCode === 'hq-2') {
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (p.kind === 'ammo_chest' || p.kind === 'weapon_chest') {
        p.sprite = 'sprIDPDChest';
        p.openSprite = 'sprIDPDChestOpen';
      }
    }
  }

  // Crown Vault Pedestal OR Proto Statue in mid-world areas (1-2 L1+, 3-2, 5-2, 7-2)
  const rt = getAreaRuntime(state);
  if (areaCode === 'vault') {
    const pedCenter = tileToWorldCenter(Math.floor(map.width / 2), 17, ts);
    const pos = findNearestFloor(map, pedCenter.x, pedCenter.y, 6);
    addProp(state, 'proto_statue', pos.x, pos.y, 'sprCrownPedIdle', 999999, 16, true, {
      radsStored: 0,
      interactPrompt: '[E] SWITCH CROWN',
    });
    return;
  }

  if (
    (areaCode === '1-2' && effLoop > 0) ||
    areaCode === '3-2' ||
    areaCode === '5-2' ||
    areaCode === '7-2'
  ) {
    // Place Proto Statue near an active encounter anchor (not isolated empty corners on 7-2!)
    let statuePos: { x: number; y: number } | null = null;
    if (encounterAnchors.length > 0) {
      const preferredOrder = rng.shuffle([...encounterAnchors]);
      for (let aIdx = 0; aIdx < preferredOrder.length && !statuePos; aIdx++) {
        const anchor = preferredOrder[aIdx]!;
        for (let attempt = 0; attempt < 16; attempt++) {
          const ang = rng.range(0, Math.PI * 2);
          const r = rng.range(24, 58);
          const cx = anchor.x + Math.cos(ang) * r;
          const cy = anchor.y + Math.sin(ang) * r;
          if (isCircleOverlappingSolid(map, cx, cy, 10)) continue;
          if (!isPropSpotClear(state, cx, cy, 22, 'proto_statue')) continue;
          if (Math.hypot(cx - state.player.x, cy - state.player.y) < 96) continue;
          statuePos = { x: cx, y: cy };
          break;
        }
      }
    }
    const pos = statuePos ?? findSafeFloorSpot(state, rng, 104, 12, 24, false);
    const statue = addProp(state, 'proto_statue', pos.x, pos.y, 'sprProtoStatueIdle', 60, 12, true, {
      radsStored: 0,
    });
    rt.protoStatuePropId = statue.id;
    rt.protoStatueX = statue.x;
    rt.protoStatueY = statue.y;
    rt.protoStatueCharged = false;
  }

  // Secret exit triggers:
  // - 2-1 Sewers: Sewer Manhole grate -> hit with explosion to open Pizza Sewers (2-?)
  if (areaCode === '2-1') {
    const manholePos = findSafeFloorSpot(state, rng, 96, 10, 32, false);
    const manhole = addProp(state, 'bone_pile', manholePos.x, manholePos.y, 'sprPizzaEntrance', 999, 10, false);
    rt.pizzaManholePropId = manhole.id;
  }

  // - 3-1 Scrapyard: Golden Car -> repair with Screwdriver family, then press E to enter Y.V.'s Mansion (3-?)
  if (areaCode === '3-1') {
    const carPos = findSafeFloorSpot(state, rng, 96, 11, 32, false);
    const venusCar = addProp(state, 'car', carPos.x, carPos.y, 'sprVenusCar', 30, 11, true);
    rt.venusCarPropId = venusCar.id;
    rt.venusCarFixed = false;
  }

  // - 5-1 Frozen City: Ice Flower ALWAYS spawns (indestructible; interactable with Last Wish to enter Jungle 5-?)
  if (areaCode === '5-1') {
    const flowerPos = findSafeFloorSpot(state, rng, 92, 10, 28, false);
    const hasLastWish = state.player.mutations.includes('last_wish');
    const flower = addProp(state, 'cactus', flowerPos.x, flowerPos.y, 'sprIceFlowerIdle', 999999, 10, false, {
      interactPrompt: hasLastWish ? '[E] FEED FLOWER' : undefined,
    });
    rt.jungleFlowerPropId = flower.id;
    rt.jungleFlowerFeeds = 0;
  }

  // Place strategic explosive barrels / authentic biome cover right beside enemy encounter pockets!
  for (let i = 0; i < encounterAnchors.length; i++) {
    const anchor = encounterAnchors[i]!;
    if (biome === 'desert') {
      if (i % 2 === 0 && rng.chance(0.7)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 38, rng, 'barrel', 'sprBarrel', 8, 8, true);
      } else {
        const cacti = ['sprCactus', 'sprCactus2', 'sprCactus3'] as const;
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 42, rng, 'cactus', rng.pick(cacti), 6, 7, false);
      }
    } else if (biome === 'oasis') {
      if (i % 3 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'water_mine', 'sprWaterMine', 14, 9, true);
      } else if (i % 3 === 1) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 38, rng, 'barrel', 'sprOasisBarrel', 10, 8, true);
      } else {
        const spr = rng.chance(0.55) ? 'sprCoral' : 'sprAnchor';
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 42, rng, 'pillar', spr, spr === 'sprAnchor' ? 24 : 12, 9, spr === 'sprAnchor');
      }
    } else if (biome === 'sewers') {
      if (rng.chance(0.75)) {
        const roll = rng.next();
        if (roll < 0.5) {
          tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'toxic_barrel', 'sprToxicBarrel', 10, 8, true);
        } else if (roll < 0.78) {
          tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'sewer_pipe', 'sprSewerPipe', 14, 9, true);
        } else {
          tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'barrel', 'sprBarrel', 10, 8, true);
        }
      }
    } else if (biome === 'pizza_sewers') {
      if (i % 2 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'bone_pile', 'sprPizzaBox', 8, 8, false);
      } else if (rng.chance(0.55)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'toxic_barrel', 'sprToxicBarrel', 10, 8, true);
      }
    } else if (biome === 'scrapyard') {
      if (i % 3 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 22, 42, rng, 'car', 'sprCarIdle', 22, 11, true);
      } else if (i % 3 === 1) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'barrel', 'sprBarrel', 10, 8, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'tires', 'sprTires', 12, 8, true);
      }
    } else if (biome === 'mansion') {
      if (i % 3 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'pillar', 'sprYVStatue', 28, 9, true);
      } else if (i % 3 === 1) {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 38, rng, 'gold_barrel', 'sprGoldBarrel', 12, 8, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 18, 38, rng, 'bone_pile', 'sprMoneyPile', 10, 8, false);
      }
    } else if (biome === 'frozen_city') {
      if (i % 3 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'car', 'sprFrozenCar', 24, 11, true);
      } else if (i % 3 === 1 && Math.hypot(anchor.x - state.player.x, anchor.y - state.player.y) >= 165) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'snowman', 'sprSnowMan', 10, 9, true);
      } else {
        const cityProps = ['sprStreetLight', 'sprHydrant', 'sprSodaMachine'] as const;
        const spr = rng.pick(cityProps);
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'pillar', spr, spr === 'sprSodaMachine' ? 24 : 16, 8, spr !== 'sprHydrant');
      }
    } else if (biome === 'labs') {
      if (rng.chance(0.75)) {
        if (rng.chance(0.6)) {
          const tubeSpr = i === 0 || rng.chance(0.65) ? 'sprMutantTube' : 'sprTube';
          tryPlacePropNear(state, anchor.x, anchor.y, 20, 38, rng, 'pillar', tubeSpr, 18, 9, true);
        } else {
          tryPlacePropNear(state, anchor.x, anchor.y, 18, 36, rng, 'toxic_barrel', 'sprToxicBarrel', 12, 8, true);
        }
      }
    } else if (biome === 'caves' || biome === 'cursed_caves') {
      if (rng.chance(0.6)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 22, 42, rng, 'pillar', 'sprCrystalProp', 24, 9, true);
      }
    } else if (biome === 'jungle') {
      if (i % 2 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'cocoon', 'sprCocoon', 14, 9, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'jungle_bush', 'sprBushIdle', 8, 8, false);
      }
    } else if (biome === 'hq') {
      const hqRoll = i % 4;
      if (hqRoll === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'server', 'sprServer', 20, 9, true);
      } else if (hqRoll === 1) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'terminal', 'sprTerminal', 16, 8, true);
      } else if (hqRoll === 2) {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'office_table', rng.chance(0.5) ? 'sprTable1' : 'sprTable2', 16, 10, true);
      } else {
        tryPlacePropNear(state, anchor.x, anchor.y, 20, 40, rng, 'small_generator', 'sprSmallGenerator', 20, 9, true);
      }
    } else if (biome === 'palace') {
      if (i % 3 === 0) {
        tryPlacePropNear(state, anchor.x, anchor.y, 24, 44, rng, 'small_generator', 'sprSmallGenerator', 20, 9, true);
      } else if (rng.chance(0.65)) {
        tryPlacePropNear(state, anchor.x, anchor.y, 24, 44, rng, 'pillar', 'sprPillar', 36, 9, true);
      }
    }
  }

  // Secondary ambient destructible cover across corridors & clearings (strictly biome-authentic NT props!)
  switch (biome) {
    case 'desert': {
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
    case 'oasis': {
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 52, false);
        if (isPropSpotClear(state, pos.x, pos.y, 48, 'water_mine')) {
          addProp(state, 'water_mine', pos.x, pos.y, 'sprWaterMine', 14, 9, true);
        }
      }
      const plantCount = rng.int(2, 4);
      for (let i = 0; i < plantCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 56, 8, 22, false);
        addProp(state, 'water_plant', pos.x, pos.y, i % 2 === 0 ? 'sprWaterPlant' : 'sprWaterPlant2', 8, 8, false);
      }
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 60, 9, 26, false);
        const roll = rng.next();
        if (roll < 0.45) {
          addProp(state, 'pillar', pos.x, pos.y, 'sprCoral', 12, 9, false);
        } else if (roll < 0.78) {
          addProp(state, 'pillar', pos.x, pos.y, 'sprAnchor', 24, 10, true);
        } else {
          addProp(state, 'barrel', pos.x, pos.y, 'sprOasisBarrel', 10, 8, true);
        }
      }
      break;
    }
    case 'sewers': {
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 9, 26, false);
        addProp(state, 'sewer_pipe', pos.x, pos.y, 'sprSewerPipe', 14, 9, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 60, 8, 24, false);
        addProp(state, 'torch', pos.x, pos.y, 'sprTorch', 8, 7, false);
      }
      const count = rng.int(2, 4);
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
    case 'pizza_sewers': {
      const count = rng.int(4, 6);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 58, 8, 24, false);
        addProp(state, 'bone_pile', pos.x, pos.y, 'sprPizzaBox', 8, 8, false);
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
      const barrelCount = rng.int(2, 3);
      for (let i = 0; i < barrelCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 64, false);
        if (isPropSpotClear(state, pos.x, pos.y, 64, 'barrel')) {
          addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 10, 8, true);
        }
      }
      const tireCount = rng.int(2, 3);
      for (let i = 0; i < tireCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 24, false);
        addProp(state, 'tires', pos.x, pos.y, 'sprTires', 12, 8, true);
      }
      // 1-3 Wall-adjacent Scrapyard Fire Traps!
      const trapCount = rng.int(1, 3);
      for (let i = 0; i < trapCount; i++) {
        const spot = findWallAdjacentFireTrapSpot(state, rng);
        if (spot) {
          const trap = addProp(state, 'fire_trap', spot.x, spot.y, 'sprTrap', 30, 9, true);
          ext.fireTrapTimers.set(trap.id, rng.int(45, 75));
          ext.fireTrapFiringTicks.set(trap.id, 0);
          ext.fireTrapDirs.set(trap.id, spot.angle);
        }
      }
      break;
    }
    case 'caves':
    case 'cursed_caves': {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 28, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprCrystalProp', 24, 9, true);
      }
      break;
    }
    case 'frozen_city': {
      const carCount = rng.int(2, 3);
      for (let i = 0; i < carCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 11, 32, false);
        addProp(state, 'car', pos.x, pos.y, 'sprFrozenCar', 24, 11, true);
      }
      // Snowmen concealing Snow Bandits (always safely >= 132px away from player spawn!)
      const snowmenCount = rng.int(2, 3);
      for (let i = 0; i < snowmenCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 132, 9, 28, false);
        addProp(state, 'snowman', pos.x, pos.y, 'sprSnowMan', 10, 9, true);
      }
      const citySprites = ['sprStreetLight', 'sprHydrant', 'sprSodaMachine'] as const;
      const propCount = rng.int(3, 5);
      for (let i = 0; i < propCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 26, false);
        const spr = rng.pick(citySprites);
        addProp(state, 'pillar', pos.x, pos.y, spr, spr === 'sprSodaMachine' ? 24 : 16, 8, spr !== 'sprHydrant');
      }
      break;
    }
    case 'labs': {
      const count = rng.int(4, 6);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 9, 26, false);
        if (i === 0 || rng.chance(0.55)) {
          const tubeSpr = i === 0 || rng.chance(0.6) ? 'sprMutantTube' : 'sprTube';
          addProp(state, 'pillar', pos.x, pos.y, tubeSpr, 18, 9, true);
        } else {
          addProp(state, 'toxic_barrel', pos.x, pos.y, 'sprToxicBarrel', 12, 8, true);
        }
      }
      break;
    }
    case 'palace': {
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 76, 9, 32, false);
        addProp(state, 'small_generator', pos.x, pos.y, 'sprSmallGenerator', 20, 9, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24, false);
        addProp(state, 'torch', pos.x, pos.y, 'sprTorch', 10, 7, false);
      }
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
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 8, 48, false);
        addProp(state, 'gold_barrel', pos.x, pos.y, 'sprGoldBarrel', 12, 8, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24, false);
        addProp(state, 'chandelier', pos.x, pos.y, 'sprChandelier', 12, 8, false);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 9, 24, false);
        addProp(state, 'pillar', pos.x, pos.y, 'sprYVStatue', 28, 9, true);
      }
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 60, 8, 22, false);
        addProp(state, 'bone_pile', pos.x, pos.y, 'sprMoneyPile', 10, 8, false);
      }
      break;
    }
    case 'jungle': {
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 26, false);
        addProp(state, 'cocoon', pos.x, pos.y, 'sprCocoon', 14, 9, true);
      }
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 22, false);
        addProp(state, 'jungle_bush', pos.x, pos.y, 'sprBushIdle', 8, 8, false);
      }
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 9, 24, false);
        addProp(state, 'cactus', pos.x, pos.y, 'sprBigFlowerIdle', 14, 9, false);
      }
      break;
    }
    case 'hq': {
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 26, false);
        addProp(state, 'server', pos.x, pos.y, 'sprServer', 20, 9, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24, false);
        addProp(state, 'terminal', pos.x, pos.y, 'sprTerminal', 16, 8, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 10, 26, false);
        addProp(state, 'office_table', pos.x, pos.y, i % 2 === 0 ? 'sprTable1' : 'sprTable2', 16, 10, true);
      }
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 76, 9, 36, false);
        addProp(state, 'small_generator', pos.x, pos.y, 'sprSmallGenerator', 20, 9, true);
      }
      break;
    }
    default:
      break;
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
  const effLoop = getEffectiveLoop(state);
  if (state.biome === 'crib' || state.biome === 'campfire' || state.areaCode === 'hq-3') {
    return [];
  }
  // On Loop 3+, IDPD HQ is completely overrun by IDPD Freaks!
  if (state.biome === 'hq' && effLoop >= 3 && ENEMIES.idpd_freak) {
    return [{ def: ENEMIES.idpd_freak, weight: 10 }];
  }

  let candidates = getEnemiesForBiome(state.biome, effLoop);
  // Ensure hq-2 always includes Elite IDPD even if entered on Loop 0!
  if (state.areaCode === 'hq-2') {
    for (const eliteId of ['elite_grunt', 'elite_inspector', 'elite_shielder'] as const) {
      const ed = ENEMIES[eliteId];
      if (ed && !candidates.some((c) => c.id === eliteId)) {
        candidates = [...candidates, ed];
      }
    }
  }
  if (candidates.length === 0) {
    candidates = [ENEMIES.bandit!];
  }

  return candidates
    .filter((def) => {
      if (effLoop === 0 && state.areaCode === '1-1') {
        if (def.id === 'gold_scorpion' || def.id === 'big_maggot') return false;
      }
      // Special-trigger enemies are spawned via dedicated hooks rather than generic room budget
      if (
        def.id === 'idpd_van' ||
        def.id === 'fire_trap' ||
        def.id === 'enemy_horror' ||
        def.id === 'health_mimic' ||
        def.id === 'snow_bandit' ||
        def.id === 'rad_maggot'
      ) {
        return false;
      }
      // On Loop < 3, IDPD Freaks don't spawn in normal HQ rooms
      if (def.id === 'idpd_freak' && effLoop < 3) return false;
      return true;
    })
    .map((def) => {
      let weight = Math.max(1, Math.round(45 / Math.max(4, def.maxHp)));
      if (def.id === 'bandit' || def.id === 'rat' || def.id === 'freak') weight += 5;
      if (def.id === 'maggot') weight += 3;
      if (def.id === 'maggot_nest') weight = 2;
      if (def.id === 'necromancer') weight = 3;
      if (def.id === 'gold_scorpion' && effLoop === 0) weight = 1;
      if (def.loopOnly && effLoop > 0) weight += 2;
      return { def, weight };
    });
}

function pickBiomeSquadTemplates(state: SimState): string[][] {
  const effLoop = getEffectiveLoop(state);
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
      if (code !== '1-1' || effLoop > 0) {
        templates.push(['big_maggot', 'maggot', 'maggot']);
        templates.push(['scorpion', 'bandit']);
      }
      if (code === '1-3' || effLoop > 0) {
        templates.push(['gold_scorpion', 'bandit', 'bandit']);
      }
      return templates;
    }
    case 'sewers':
      return [
        ['rat', 'rat', 'rat', 'rat'],
        ['gator', 'gator'],
        ['gator', 'rat', 'rat'],
        ['big_rat', 'rat', 'toxic_ballguy'],
        ['buff_gator', 'rat', 'rat'],
        ['ballguy', 'ballguy', 'rat'],
        ['toxic_ballguy', 'ballguy', 'rat'],
      ];
    case 'scrapyard':
      return [
        ['raven', 'raven', 'sniper'],
        ['salamander', 'raven', 'assassin'],
        ['sniper', 'fireballer', 'assassin'],
        ['assassin', 'assassin', 'raven'],
        ['raven', 'raven', 'fireballer'],
      ];
    case 'caves': {
      const templates: string[][] = [
        ['spider', 'spider', 'spider'],
        ['laser_crystal', 'spider', 'spider'],
        ['laser_crystal', 'spider'],
      ];
      if (effLoop > 0) {
        templates.push(['lightning_crystal', 'spider', 'spider']);
      }
      return templates;
    }
    case 'cursed_caves':
      return [
        ['cursed_spider', 'cursed_spider', 'cursed_spider'],
        ['cursed_laser_crystal', 'cursed_spider', 'cursed_spider'],
        ['cursed_laser_crystal', 'cursed_spider'],
      ];
    case 'frozen_city': {
      const templates: string[][] = [
        ['snowbot', 'snowbot', 'wolf'],
        ['snow_tank', 'wolf', 'wolf'],
        ['wolf', 'wolf', 'snowbot'],
        ['snowbot', 'snowbot', 'snowbot'],
      ];
      if (effLoop > 0) {
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
        ['bonefish', 'bonefish', 'bonefish'],
        ['crab', 'bonefish', 'bonefish'],
        ['crab', 'crab'],
      ];
    case 'pizza_sewers':
      return [['turtle', 'turtle', 'turtle', 'turtle', 'big_rat']];
    case 'mansion':
      return [
        ['molefish', 'molefish', 'molesarge'],
        ['molesarge', 'fireballer', 'molefish'],
        ['jock', 'molefish', 'molefish'],
        ['super_fireballer', 'fireballer', 'molesarge'],
        ['jock', 'molesarge', 'fireballer'],
      ];
    case 'jungle':
      return [
        ['jungle_bandit', 'jungle_bandit', 'jungle_assassin'],
        ['jungle_assassin', 'jungle_assassin', 'jungle_bandit'],
        ['jungle_fly', 'jungle_bandit', 'jungle_bandit'],
        ['jungle_fly', 'jungle_assassin', 'jungle_bandit'],
      ];
    case 'vault':
      return [['crown_guardian', 'crown_guardian']];
    case 'hq': {
      if (effLoop >= 3) {
        return [
          ['idpd_freak', 'idpd_freak', 'idpd_freak'],
          ['idpd_freak', 'idpd_freak'],
        ];
      }
      const templates: string[][] = [
        ['idpd_grunt', 'idpd_grunt', 'idpd_inspector'],
        ['idpd_shielder', 'idpd_grunt', 'idpd_grunt'],
        ['idpd_inspector', 'idpd_shielder', 'idpd_grunt'],
      ];
      if (code === 'hq-2' || effLoop >= 1) {
        templates.push(['elite_grunt', 'idpd_grunt', 'elite_inspector']);
        templates.push(['elite_shielder', 'elite_grunt', 'idpd_inspector']);
        templates.push(['elite_inspector', 'elite_shielder', 'idpd_grunt']);
      }
      return templates;
    }
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
    if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') n += 1;
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
  resetExtendedAreaRuntime(state);
  rt.populatingArea = true;
  try {
    const areaDef = getAreaDef(state.areaCode);
    const effLoop = getEffectiveLoop(state);
    const isFixedNoGenericChestArea =
      state.areaCode === '0-1' ||
      state.areaCode === '7-3' ||
      state.areaCode === 'vault' ||
      state.areaCode === '$$$' ||
      state.areaCode === 'hq-3';

    // Remove stray generic chests/canisters on bespoke setpiece rooms ($$$, hq-3)
    if (state.areaCode === '$$$' || state.areaCode === 'hq-3') {
      state.props = state.props.filter(
        (p) =>
          p.kind !== 'weapon_chest' &&
          p.kind !== 'big_weapon_chest' &&
          p.kind !== 'ammo_chest' &&
          p.kind !== 'rad_canister' &&
          p.kind !== 'rad_maggot_canister' &&
          p.kind !== 'idpd_canister',
      );
    }

    // If called standalone without loadAreaIntoState having spawned chests yet, spawn them now
    const hasChest = state.props.some(
      (p) =>
        p.kind === 'weapon_chest' ||
        p.kind === 'big_weapon_chest' ||
        p.kind === 'ammo_chest' ||
        p.kind === 'rad_canister' ||
        p.kind === 'rad_maggot_canister' ||
        p.kind === 'idpd_canister',
    );
    if (!hasChest && !isFixedNoGenericChestArea) {
      spawnLevelChests(state, rng);
    }

    // IDPD HQ (hq-1, hq-2, hq-3) has ZERO rad canisters!
    if (state.biome === 'hq') {
      state.props = state.props.filter(
        (p) => p.kind !== 'rad_canister' && p.kind !== 'rad_maggot_canister',
      );
    }

    // Post-chest Wiki parity transformations on standard combat levels:
    if (!isFixedNoGenericChestArea && state.biome !== 'hq') {
      // A. Cumulative weaponChestSkipStreak * 0.25 upgrade to Big Weapon Chest
      const wepSkip = state.weaponChestSkipStreak ?? 0;
      if (wepSkip > 0 && state.areaCode !== '3-?' && state.areaCode !== '4-?') {
        const upgradeChance = Math.min(1, wepSkip * 0.25);
        if (rng.chance(upgradeChance)) {
          const wepChest = state.props.find((p) => p.kind === 'weapon_chest' && !p.opened);
          if (wepChest) {
            wepChest.kind = 'big_weapon_chest';
            wepChest.sprite = 'sprWeaponChestBig';
            wepChest.openSprite = 'sprWeaponChestBigOpen';
            state.weaponChestSkipStreak = 0;
          }
        }
      }

      // B. Rad Canister skip streak: 1 -> Rad Maggot Canister (1.5x rads), 2+ -> Hostile Horror!
      const radSkip = state.radCanisterSkipStreak ?? 0;
      if (radSkip >= 2) {
        const radIdx = state.props.findIndex((p) => p.kind === 'rad_canister');
        let horrorPos: { x: number; y: number } | null = null;
        if (radIdx !== -1) {
          const rc = state.props[radIdx]!;
          state.props.splice(radIdx, 1);
          if (isSpotSafeFromSpawn(state, rc.x, rc.y, 110, 180)) {
            horrorPos = { x: rc.x, y: rc.y };
          }
        }
        horrorPos = horrorPos ?? findSafeFloorSpot(state, rng, 124, 12, 20, true);
        createEnemyEntity(state, 'enemy_horror', horrorPos.x, horrorPos.y, rng);
        state.radCanisterSkipStreak = 0;
      } else if (radSkip === 1) {
        const rc = state.props.find((p) => p.kind === 'rad_canister');
        if (rc) {
          rc.kind = 'rad_maggot_canister';
          rc.sprite = 'sprRadChestMaggot';
          rc.radsStored = Math.round((rc.radsStored ?? 12) * 1.5);
        }
      }

      // C. Crown of Life: 2/3 of remaining Rad Canisters -> Health Chest (2% Health Mimic!)
      if (state.crown === 'life') {
        for (let pIdx = state.props.length - 1; pIdx >= 0; pIdx--) {
          const p = state.props[pIdx]!;
          if (p.kind !== 'rad_canister') continue;
          if (!rng.chance(2 / 3)) continue;
          if (rng.chance(0.02)) {
            const mSpot = isSpotSafeFromSpawn(state, p.x, p.y, 96, 160)
              ? { x: p.x, y: p.y }
              : findSafeFloorSpot(state, rng, 108, 10, 20, true);
            state.props.splice(pIdx, 1);
            createEnemyEntity(state, 'health_mimic', mSpot.x, mSpot.y, rng, {
              initialAiState: 'disguised',
            });
          } else {
            p.kind = 'health_chest';
            p.sprite = 'sprHealthChest';
            p.openSprite = 'sprHealthChestOpen';
            p.radsStored = 0;
            p.hp = 999;
            p.maxHp = 999;
            p.solid = false;
          }
        }
      }

      // D. Crown of Curses (66.7%) or any other Crown (14.3%) -> Cursed Weapon Chests
      if (state.areaCode !== '3-?' && state.areaCode !== '4-?' && state.crown !== 'none') {
        const curseChance = state.crown === 'curses' ? 2 / 3 : 1 / 7;
        for (let pIdx = 0; pIdx < state.props.length; pIdx++) {
          const p = state.props[pIdx]!;
          if (p.kind !== 'weapon_chest' && p.kind !== 'big_weapon_chest') continue;
          if (p.cursed) continue;
          if (rng.chance(curseChance)) {
            p.cursed = true;
            if (p.kind === 'big_weapon_chest') {
              p.sprite = 'sprCursedChestBig';
              p.openSprite = 'sprCursedChestBigOpen';
            } else {
              p.sprite = 'sprCursedChest';
              p.openSprite = 'sprCursedChestOpen';
            }
          }
        }
      }
    }

    // 1. Compute spatial encounter pockets before placing props so barrels/cover sit beside enemy packs!
    const pool = getBiomePool(state);
    let budget = areaDef.enemyBudgetBase;
    if (budget > 0) {
      budget = Math.round(budget * (1 + effLoop * 0.55));
      if (state.crown === 'blood') budget = Math.round(budget * 1.45);
      if (state.crown === 'luck') budget = Math.round(budget * 0.85);
    }

    const desiredAnchors =
      budget > 0 && pool.length > 0 && state.areaCode !== '2-?'
        ? Math.max(3, Math.min(8, Math.round(budget / 8)))
        : 0;
    const anchors =
      desiredAnchors > 0 ? pickEncounterAnchors(state, desiredAnchors, rng) : [];

    // 2. Biome props, explosive barrels/cars near encounter pockets & fixed setpieces
    spawnBiomeProps(state, rng, anchors);
    rt.throneLastGenCount = state.generatorsRemaining;

    // 3. Purposeful Biome Enemy Squads across encounter pockets
    if (state.areaCode === '$$$' || state.areaCode === 'hq-3' || state.areaCode === 'vault') {
      // Y.V.'s Crib has zero enemies; HQ-3 has only Captain; Vault starts with dormant vault_statue props!
    } else if (state.areaCode === '2-?') {
      // Pizza Sewers (2-?): EXACTLY 4 Turtles + 1 Rat King (big_rat)!
      const pizzaAnchor = findSafeFloorSpot(state, rng, 112, 12, 24, false);
      createEnemyEntity(state, 'big_rat', pizzaAnchor.x, pizzaAnchor.y, rng);
      for (let t = 0; t < 4; t++) {
        const spot = findSquadMemberSpot(state, pizzaAnchor.x, pizzaAnchor.y, 9, rng);
        createEnemyEntity(state, 'turtle', spot.x, spot.y, rng);
      }
    } else if (budget > 0 && pool.length > 0) {
      const maxEnemiesCap = Math.min(76, 26 + effLoop * 14 + (state.crown === 'blood' ? 12 : 0));
      const templates = pickBiomeSquadTemplates(state);
      const allowedIds = new Set<string>(pool.map((p) => p.def.id));
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

      // HQ-2: spawn 1-2 IDPD Vans (replaced by IDPD Freaks on Loop 3+)!
      if (state.areaCode === 'hq-2') {
        const vanCount = rng.int(1, 2);
        for (let v = 0; v < vanCount; v++) {
          spawnIdpdWave(state, rng, { includeVan: true, count: 2 });
        }
      }
    }

    // 4. Mimics on 2-1+ or Loop 1+ (replaces an existing chest when safely away from spawn!)
    const isEarlyDesert =
      effLoop === 0 &&
      (state.areaCode === '1-1' || state.areaCode === '1-2' || state.areaCode === '1-3');
    if (
      !isEarlyDesert &&
      !isFixedNoGenericChestArea &&
      state.areaCode !== '2-?'
    ) {
      const mimicChance = effLoop > 0 ? 0.35 : 0.18;
      if (rng.chance(mimicChance)) {
        // Crown of Love converts weapon chests to ammo chests; 3-? Golden & 4-? Cursed weapon chests stay intact!
        const allowWeaponMimic =
          state.crown !== 'love' && state.areaCode !== '3-?' && state.areaCode !== '4-?';
        const isWeaponMimic = allowWeaponMimic && rng.chance(0.35);
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

    // 4b. Special Character Weapon Floor Drops
    if (state.areaCode === '0-1' && state.player.mutant === 'fish') {
      addFloorWeaponPickup(state, 'guitar', state.player.x + 28, state.player.y + 8);
    }
    if (state.areaCode === '1-1' && state.loop >= 1 && state.chickenDroppedSwordOn1_1) {
      addFloorWeaponPickup(state, 'black_sword', state.player.x + 28, state.player.y - 8);
    }

    // 5. Bosses on boss areas (1-3, 3-3, 5-3, 7-3, 0-1, hq-3) + Loop 1+ bosses (2-1 Mom, 4-1/4-? Hyper Crystal, 6-1 Technomancer)!
    let areaBossId: BossId | undefined = areaDef.bossId;
    if (!areaBossId && effLoop > 0) {
      if (state.areaCode === '2-1') areaBossId = 'mom';
      else if (state.areaCode === '4-1' || state.areaCode === '4-?') areaBossId = 'hyper_crystal';
      else if (state.areaCode === '6-1') areaBossId = 'technomancer';
    }
    if (areaBossId) {
      spawnBossEntity(state, areaBossId, rng);
    }

    // 6. Loop 1+ / Rogue / high idpdHeat / Vault Ambush IDPD Portal & Van reinforcements
    const allowIdpdWaves =
      state.areaCode !== '7-3' &&
      state.areaCode !== '0-1' &&
      state.areaCode !== 'vault' &&
      state.areaCode !== '$$$' &&
      state.areaCode !== 'hq-3';

    if (allowIdpdWaves && state.vaultAmbushPending) {
      state.vaultAmbushPending = false;
      spawnIdpdWave(state, rng, { includeVan: false, count: effLoop >= 1 ? 3 : 2 });
    }

    if (allowIdpdWaves && (effLoop > 0 || state.player.mutant === 'rogue' || state.idpdHeat > 0)) {
      const waves = Math.min(3, 1 + effLoop + (state.idpdHeat >= 3 ? 1 : 0));
      rt.idpdWavesRemaining = waves;
      rt.idpdWaveTimer = effLoop > 0 ? rng.int(85, 145) : rng.int(130, 215);

      if (effLoop > 0 && state.biome !== 'hq') {
        spawnIdpdWave(state, rng, { includeVan: false, count: 2 });
      }
    }

    // 7. Accurate level start enemy count (hostiles only) + prop HP/meta snapshot for damage hooks
    state.levelStartEnemyCount = countHostiles(state);
    snapshotTrackedProps(state);
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
  hardMode?: boolean;
}): SimState {
  return createInitialSimState({
    ...opts,
    populateFn: (s, rng) => {
      if (opts.hardMode) {
        s.hardMode = true;
      }
      populateAreaEntities(s, rng);
    },
  });
}
