import {
  TILE_SIZE,
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
} from '@/contracts';
import { ENEMIES, getAreaDef, getEnemiesForBiome } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  emitEvent,
  findNearestFloor,
  getTile,
  isCircleOverlappingSolid,
  isWalkableTile,
  isWorldSolid,
  moveCircleWithSlide,
  tileToWorldCenter,
} from '@/sim/core';
import { createInitialSimState, spawnLevelChests } from '@/sim/progression';
import { getAreaRuntime, registerTrackedEnemy, resetAreaRuntime } from './runtime';

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

/**
 * Finds a guaranteed walkable floor tile coordinate at least `minDistFromPlayer` px away
 * from the player, avoiding existing props/enemies and never inside solid walls.
 */
export function findSafeFloorSpot(
  state: SimState,
  rng: SeededRng,
  minDistFromPlayer: number = 96,
  entityRadius: number = 7,
  avoidExistingMinDist: number = 14,
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
  for (let attempt = 0; attempt < 160; attempt++) {
    const tx = rng.int(2, map.width - 3);
    const ty = rng.int(2, map.height - 3);
    if (!isWalkableTile(getTile(map, tx, ty))) continue;

    const pos = tileToWorldCenter(tx, ty, ts);
    const dx = pos.x - px;
    const dy = pos.y - py;
    if (dx * dx + dy * dy < minDistSq) continue;

    // Prefer tiles where circle doesn't clip solid corners (relaxed after 90 tries)
    if (attempt < 90 && isCircleOverlappingSolid(map, pos.x, pos.y, Math.min(entityRadius, 7))) {
      continue;
    }

    let tooClose = false;
    if (attempt < 120 && avoidExistingMinDist > 0) {
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
      return { x: dep.x, y: dep.y };
    }
    return pos;
  }

  // Deterministic scan fallback: collect all walkable tiles >= minDistFromPlayer (or farthest)
  let bestFar: { x: number; y: number } | null = null;
  let bestFarDistSq = -1;
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
      }
    }
  }

  if (candidates.length > 0) {
    const picked = rng.pick(candidates);
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

  const loopHpMult = def.isBoss ? 1 + state.loop * 0.45 : 1 + state.loop * 0.3;
  const scaledHp = Math.max(
    1,
    Math.round(def.maxHp * (opts.hpScale ?? loopHpMult)),
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
    aiTimer: rng.int(8, 28),
    aiPhase: 0,
    attackCooldown: rng.int(16, 42),
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
    // Dais carpet platform sits at rows 9..15 in 7-3; place Throne proudly on north dais
    const daisTy = state.areaCode === '7-3' ? 12 : Math.max(4, Math.floor(map.height * 0.22));
    const desired = tileToWorldCenter(cx, daisTy, ts);
    spawnPos = ensureSafeEntityPosition(state, desired.x, desired.y, 34, true);
    initialAiState = 'sleep';
  } else if (bossId === 'throne_ii') {
    const cx = Math.floor(map.width / 2);
    const cy = Math.max(5, Math.floor(map.height * 0.25));
    const desired = tileToWorldCenter(cx, cy, ts);
    const dx = desired.x - state.player.x;
    const dy = desired.y - state.player.y;
    if (dx * dx + dy * dy < 104 * 104) {
      spawnPos = findSafeFloorSpot(state, rng, 112, 26, 20);
    } else {
      spawnPos = ensureSafeEntityPosition(state, desired.x, desired.y, 26, true);
    }
    initialAiState = 'chase';
    elevated = true;
    elevZ = 14;
  } else if (bossId === 'big_dog') {
    spawnPos = findSafeFloorSpot(state, rng, 128, 22, 20);
    spawnPos = ensureSafeEntityPosition(state, spawnPos.x, spawnPos.y, 22, true);
    initialAiState = 'sleep';
  } else if (bossId === 'lil_hunter') {
    spawnPos = findSafeFloorSpot(state, rng, 112, 11, 16);
    initialAiState = 'arrive_slam';
    elevated = true;
    elevZ = 64;
    invulnerable = true;
  } else {
    // Big Bandit (1-3)
    spawnPos = findSafeFloorSpot(state, rng, 128, 14, 16);
    initialAiState = 'reposition';
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
    boss.aiTimer = 22;
    boss.targetX = spawnPos.x;
    boss.targetY = spawnPos.y;
  } else if (bossId === 'big_bandit') {
    boss.aiTimer = 20;
    boss.attackCooldown = 22;
  } else if (bossId === 'throne_ii') {
    boss.aiTimer = 24;
    boss.attackCooldown = 28;
  } else if (bossId === 'nuclear_throne') {
    boss.aimAngle = Math.PI * 0.5; // Facing straight down the red carpet
    boss.aiTimer = 18;
    boss.attackCooldown = 36;
  }

  const rt = getAreaRuntime(state);
  rt.bossDeathHandled = false;
  rt.throneWoken = false;
  rt.throneLastGenCount = state.generatorsRemaining;

  state.boss = {
    bossId,
    entityId: boss.id,
    name: meta.name,
    subtitle: meta.subtitle,
    hp: boss.hp,
    maxHp: boss.maxHp,
    introTicks: 75,
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
    x: boss.x,
    y: boss.y,
  });

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
      : findSafeFloorSpot(state, rng, 120, 10, 16);

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

function spawnBiomeProps(state: SimState, rng: SeededRng): void {
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
    const alcoveCoords: Array<{ tx: number; ty: number }> = [
      { tx: westOuter - 2, ty: genYs[0]! },
      { tx: eastOuter + 2, ty: genYs[0]! },
      { tx: westOuter - 2, ty: genYs[1]! },
      { tx: eastOuter + 2, ty: genYs[1]! },
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

    // Ornate palace pillars lining outer flanks of the grand hall (kept well off the carpet)
    const pillarYs = [daisBottom + 4, daisBottom + 14, daisBottom + 24, daisBottom + 34];
    for (let i = 0; i < pillarYs.length; i++) {
      const py = pillarYs[i]!;
      if (py >= map.height - 10) continue;
      for (const side of [-1, 1]) {
        const raw = tileToWorldCenter(cx + side * 4, py, ts);
        if (!isWorldSolid(map, raw.x, raw.y)) {
          addProp(state, 'pillar', raw.x, raw.y, 'sprNuclearPillar', 36, 9, true);
        }
      }
    }
    return;
  }

  if (areaCode === '0-1') {
    // Campfire arena: scatter a few weathered desert bones / rocks around perimeter
    for (let i = 0; i < 4; i++) {
      const pos = findSafeFloorSpot(state, rng, 84, 8, 28);
      addProp(state, 'bone_pile', pos.x, pos.y, 'sprBonePileIdle', 8, 7, false);
    }
    return;
  }

  // Proto Statue in Crown Vault & mid-world areas (3-2, 5-2, 7-2)
  if (areaCode === 'vault' || areaCode === '3-2' || areaCode === '5-2' || areaCode === '7-2') {
    const pos =
      areaCode === 'vault'
        ? findNearestFloor(map, tileToWorldCenter(Math.floor(map.width / 2), 17, ts).x, tileToWorldCenter(Math.floor(map.width / 2), 17, ts).y, 6)
        : findSafeFloorSpot(state, rng, 96, 12, 24);
    addProp(state, 'proto_statue', pos.x, pos.y, 'sprProtoStatueIdle', 60, 12, true, {
      radsStored: 0,
    });
  }

  // Biome-authentic destructible cover & hazards
  switch (biome) {
    case 'desert':
    case 'oasis': {
      const cacti = ['sprCactus', 'sprCactus2', 'sprCactus3'] as const;
      const count = rng.int(5, 8);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 22);
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
      const count = rng.int(5, 8);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 24);
        if (rng.chance(0.6)) {
          addProp(state, 'toxic_barrel', pos.x, pos.y, 'sprToxicBarrel', 10, 8, true);
        } else {
          addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 10, 8, true);
        }
      }
      break;
    }
    case 'scrapyard': {
      const carCount = rng.int(3, 5);
      for (let i = 0; i < carCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 12, 32);
        addProp(state, 'car', pos.x, pos.y, 'sprCarIdle', 24, 12, true);
      }
      const barrelCount = rng.int(3, 5);
      for (let i = 0; i < barrelCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 64, 8, 22);
        addProp(state, 'barrel', pos.x, pos.y, 'sprBarrel', 10, 8, true);
      }
      break;
    }
    case 'caves':
    case 'cursed_caves': {
      const count = rng.int(4, 6);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 28);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 24, 9, true);
      }
      break;
    }
    case 'frozen_city': {
      const carCount = rng.int(2, 4);
      for (let i = 0; i < carCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 12, 32);
        addProp(state, 'car', pos.x, pos.y, 'sprFrozenCar', 26, 12, true);
      }
      const pillarCount = rng.int(2, 4);
      for (let i = 0; i < pillarCount; i++) {
        const pos = findSafeFloorSpot(state, rng, 72, 9, 26);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 26, 9, true);
      }
      break;
    }
    case 'labs': {
      const count = rng.int(5, 8);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24);
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
      const count = rng.int(4, 6);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 76, 9, 28);
        addProp(state, 'pillar', pos.x, pos.y, 'sprNuclearPillar', 36, 9, true);
      }
      break;
    }
    case 'mansion': {
      for (let i = 0; i < 2; i++) {
        const pos = findSafeFloorSpot(state, rng, 80, 12, 32);
        addProp(state, 'car', pos.x, pos.y, 'sprVenusCar', 28, 12, true);
      }
      for (let i = 0; i < 3; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 9, 24);
        addProp(state, 'pillar', pos.x, pos.y, 'sprPillar', 28, 9, true);
      }
      break;
    }
    default: {
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        const pos = findSafeFloorSpot(state, rng, 68, 8, 24);
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
  if (candidates.length === 0) {
    // Fallback for any biome without direct non-boss defs
    if (state.biome === 'campfire') return [];
    candidates = [ENEMIES.bandit!];
  }

  return candidates
    .filter((def) => {
      // Keep 1-1 authentic: introduce big_maggot/gold_scorpion starting 1-2/1-3 unless Loop 1+
      if (state.loop === 0 && state.areaCode === '1-1') {
        if (def.id === 'gold_scorpion' || def.id === 'big_maggot') return false;
      }
      // IDPD vans arrive via wave spawner, not static floor clutter
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
 * Spawns biome-authentic enemies, props, chests (if not already present), mimics,
 * bosses on boss levels, and schedules IDPD waves on Loop 1+ or Rogue/high idpdHeat.
 */
export function populateAreaEntities(state: SimState, rng: SeededRng): void {
  const rt = resetAreaRuntime(state);
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

  // 1. Biome props & 7-3 symmetrical Throne Generators
  spawnBiomeProps(state, rng);
  rt.throneLastGenCount = state.generatorsRemaining;

  // 2. Biome enemy roster scaled by areaDef.enemyBudgetBase, loop count, and Crown of Blood/Luck
  const pool = getBiomePool(state);
  let budget = areaDef.enemyBudgetBase;
  if (budget > 0 && pool.length > 0) {
    budget = Math.round(budget * (1 + state.loop * 0.55));
    if (state.crown === 'blood') budget = Math.round(budget * 1.45);
    if (state.crown === 'luck') budget = Math.round(budget * 0.85);

    const maxEnemiesCap = Math.min(72, 22 + state.loop * 14 + (state.crown === 'blood' ? 12 : 0));
    let remaining = budget;
    let guard = 0;

    while (remaining >= 2 && state.enemies.length < maxEnemiesCap && guard < 120) {
      guard += 1;
      const chosen = pickWeightedEnemy(pool, rng);
      const cost = getEnemyCost(chosen);
      if (cost > remaining && remaining >= 2 && guard < 40) {
        continue;
      }

      const spot = findSafeFloorSpot(state, rng, 96, chosen.radius, 16);
      createEnemyEntity(state, chosen.id, spot.x, spot.y, rng);
      remaining -= cost;

      // Spawn small packs for swarm enemies (maggots, rats, freaks)
      if (
        (chosen.id === 'maggot' || chosen.id === 'rat' || chosen.id === 'freak') &&
        remaining >= 2 &&
        rng.chance(0.45) &&
        state.enemies.length < maxEnemiesCap
      ) {
        const packExtra = rng.int(1, 2);
        for (let k = 0; k < packExtra && remaining >= 2 && state.enemies.length < maxEnemiesCap; k++) {
          const nearX = spot.x + rng.range(-18, 18);
          const nearY = spot.y + rng.range(-18, 18);
          const candidate = ensureSafeEntityPosition(state, nearX, nearY, chosen.radius, false);
          const dPx = candidate.x - state.player.x;
          const dPy = candidate.y - state.player.y;
          const packSpot =
            dPx * dPx + dPy * dPy >= 96 * 96
              ? candidate
              : findSafeFloorSpot(state, rng, 96, chosen.radius, 12);
          createEnemyEntity(state, chosen.id, packSpot.x, packSpot.y, rng);
          remaining -= Math.max(1, cost - 1);
        }
      }
    }
  }

  // 3. Mimics on 2-1+ or Loop 1+ (never on 1-1..1-3 Loop 0 or 7-3/0-1 boss arenas)
  const isEarlyDesert =
    state.loop === 0 &&
    (state.areaCode === '1-1' || state.areaCode === '1-2' || state.areaCode === '1-3');
  if (!isEarlyDesert && state.areaCode !== '7-3' && state.areaCode !== '0-1' && state.areaCode !== 'vault') {
    const mimicChance = state.loop > 0 ? 0.35 : 0.18;
    if (rng.chance(mimicChance)) {
      const mimicDef = rng.chance(0.35) ? 'weapon_mimic' : 'mimic';
      const spot = findSafeFloorSpot(state, rng, 104, 8, 20);
      createEnemyEntity(state, mimicDef, spot.x, spot.y, rng, {
        initialAiState: 'disguised',
      });
    }
  }

  // 4. Bosses on boss areas: 1-3, 3-3, 5-3, 7-3, 0-1
  if (areaDef.bossId) {
    spawnBossEntity(state, areaDef.bossId, rng);
  }

  // 5. Loop 1+ / Rogue / high idpdHeat IDPD Portal & Van reinforcements
  const allowIdpdWaves =
    state.areaCode !== '7-3' &&
    state.areaCode !== '0-1' &&
    state.areaCode !== 'vault';
  if (allowIdpdWaves && (state.loop > 0 || state.player.mutant === 'rogue' || state.idpdHeat > 0)) {
    const waves = Math.min(3, 1 + state.loop + (state.idpdHeat >= 3 ? 1 : 0));
    rt.idpdWavesRemaining = waves;
    rt.idpdWaveTimer = state.loop > 0 ? rng.int(75, 135) : rng.int(120, 210);

    // On Loop 1+, also seed an initial IDPD squad on floor start for immediate Loop intensity
    if (state.loop > 0 && state.areaCode !== 'hq-1') {
      spawnIdpdWave(state, rng, { includeVan: false, count: 2 });
    }
  }

  // 6. Accurate level start enemy count (hostiles only)
  state.levelStartEnemyCount = countHostiles(state);
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
