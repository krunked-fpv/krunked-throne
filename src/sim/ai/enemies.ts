import {
  TILE_SIZE,
  type AmmoType,
  type BossId,
  type EnemyDef,
  type EnemyEntity,
  type ProjectileEntity,
  type PropEntity,
  type SimState,
} from '@/contracts';
import { AMMO_PICKUP_AMOUNT, ENEMIES, getWeaponDef } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  circleOverlap,
  emitEvent,
  findNearestFloor,
  hasLineOfSight,
  isCircleOverlappingSolid,
  isWorldSolid,
  moveCircleWithSlide,
  segmentCircleHit,
  tileToWorldCenter,
} from '@/sim/core';
import {
  NON_MELEE_AMMO_TYPES,
  applyDamageToEnemy,
  applyDamageToPlayer,
  hasMutation,
  spawnEnemyProjectile,
  spawnExplosion,
  spawnPickup,
  type SpawnEnemyProjectileOptions,
} from '@/sim/combat';
import { pickTierWeaponId } from '@/sim/progression';
import {
  createEnemyEntity,
  findSafeFloorSpot,
  getAreaRuntime,
  getEffectiveLoop,
  getEnemyMemory,
  getExtendedAreaRuntime,
  getRunRuntime,
  snapshotTrackedProps,
  spawnBossEntity,
  spawnIdpdWave,
  type EnemyAiMemory,
} from '@/sim/entities';
import {
  addToxicGasCloud,
  handleBossDeath,
  openBossPortal,
  stepBossAi,
  stepBossProjectiles,
  triggerThroneVictory,
  wakeCaptain,
} from './bosses';

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function fireEnemyProjectile(
  state: SimState,
  def: EnemyDef,
  opts: SpawnEnemyProjectileOptions,
): ProjectileEntity {
  const proj = spawnEnemyProjectile(state, opts);
  proj.sourceCause = def.name.toUpperCase();
  proj.sourceSprite = def.sprites.idle;
  return proj;
}

export interface StepEntitiesOptions {
  stepFriendlies?: boolean;
}

const CORPSE_SPRITE_TO_SPECIAL_DEF: Record<string, string> = {
  sprMSpawnDead: 'maggot_nest',
  sprBigMaggotDead: 'big_maggot',
  sprRatkingDead: 'big_rat',
  sprSuperFrogDead: 'ballguy',
  sprExploderDead: 'toxic_ballguy',
  sprSniperDead: 'sniper',
  sprGoldScorpionDead: 'gold_scorpion',
  sprGuardianDead: 'guardian',
  sprInvSpiderDead: 'cursed_spider',
  sprJungleFlyDead: 'jungle_fly',
  sprPopoFreakDead: 'idpd_freak',
  sprSuperMimicDead: 'health_mimic',
  sprEnemyHorrorDead: 'enemy_horror',
  sprBoneFish1Dead: 'bonefish',
  sprBoneFishDead: 'bonefish',
  sprAssassinDead: 'assassin',
  sprJungleAssassinDead: 'jungle_assassin',
  sprSnowTankDead: 'snow_tank',
  sprGoldTankDead: 'gold_snow_tank',
  sprExploFreakDead: 'explo_freak',
  sprExploGuardianDead: 'explo_guardian',
  sprVanDead: 'idpd_van',
  sprMimicDead: 'mimic',
  sprWepMimicDead: 'weapon_mimic',
  sprBanditBossDead: 'big_bandit',
  sprScrapBossDead: 'big_dog',
  sprLilHunterDead: 'lil_hunter',
  sprNothingDeath: 'nuclear_throne',
  sprNothing2Death: 'throne_ii',
  sprFrogQueenDead: 'mom',
  sprHyperCrystalDead: 'hyper_crystal',
  sprTechnoMancerDead: 'technomancer',
  sprLastDeath: 'captain',
};

const BOSS_CORPSE_SPRITES: ReadonlySet<string> = new Set([
  'sprBanditBossDead',
  'sprScrapBossDead',
  'sprLilHunterDead',
  'sprNothingDeath',
  'sprNothing2Death',
  'sprFrogQueenDead',
  'sprHyperCrystalDead',
  'sprTechnoMancerDead',
  'sprLastDeath',
]);

const BOSS_DEF_IDS: ReadonlySet<string> = new Set([
  'big_bandit',
  'big_dog',
  'lil_hunter',
  'nuclear_throne',
  'throne_ii',
  'mom',
  'hyper_crystal',
  'technomancer',
  'captain',
]);

const assassinFeigningByState = new WeakMap<SimState, Set<number>>();

function getAssassinFeigningSet(state: SimState): Set<number> {
  let set = assassinFeigningByState.get(state);
  if (!set) {
    set = new Set<number>();
    assassinFeigningByState.set(state, set);
  }
  return set;
}

/**
 * Wakes all dormant `vault_statue` props in the Crown Vault into hostile Crown Guardians!
 */
export function wakeVaultStatues(state: SimState, rng: SeededRng): number {
  const ext = getExtendedAreaRuntime(state);
  let woken = 0;
  for (let i = state.props.length - 1; i >= 0; i--) {
    const p = state.props[i]!;
    if (p.kind !== 'vault_statue') continue;
    const gx = p.x;
    const gy = p.y;
    state.props.splice(i, 1);
    const cg = createEnemyEntity(state, 'crown_guardian', gx, gy, rng);
    const mem = getEnemyMemory(state, cg);
    mem.alerted = true;
    mem.aggroTicks = 240;
    mem.lastSeenX = state.player.x;
    mem.lastSeenY = state.player.y;
    emitEvent(state, { type: 'sfx', sound: 'sndCrownGuardianAppear', x: gx, y: gy });
    woken += 1;
  }
  if (woken > 0) {
    ext.vaultStatuesAwakened = true;
    ext.vaultStatueIds = [];
    state.levelStartEnemyCount = Math.max(state.levelStartEnemyCount, woken);
    snapshotTrackedProps(state);
  }
  return woken;
}

function clampInsideMap(state: SimState, x: number, y: number): { x: number; y: number } {
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

function computeSoftSeparation(state: SimState, e: EnemyEntity): { sx: number; sy: number } {
  if (e.isBoss || e.elevated || e.defId === 'maggot_nest' || e.defId === 'turret') {
    return { sx: 0, sy: 0 };
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const o = state.enemies[i]!;
    if (o === e || o.friendly || o.hp <= 0 || o.elevated) continue;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const minDist = e.radius + o.radius + 2;
    const dSq = dx * dx + dy * dy;
    if (dSq > 1e-4 && dSq < minDist * minDist) {
      const d = Math.sqrt(dSq);
      const push = ((minDist - d) / minDist) * 0.42;
      sx += (dx / d) * push;
      sy += (dy / d) * push;
    }
  }
  const len = Math.hypot(sx, sy);
  if (len > 0.55) {
    sx = (sx / len) * 0.55;
    sy = (sy / len) * 0.55;
  }
  return { sx, sy };
}

function moveEnemy(
  state: SimState,
  e: EnemyEntity,
  dx: number,
  dy: number,
  opts: { ignoreWalls?: boolean; carveWalls?: boolean; noSep?: boolean } = {},
): { hitWall: boolean; hitX: boolean; hitY: boolean } {
  // Plant Snare fully roots standard enemies in place (1:1 NT parity)
  const snareMult = e.snaredTicks > 0 ? 0 : 1.0;
  const sep = opts.noSep ? { sx: 0, sy: 0 } : computeSoftSeparation(state, e);
  const totalDx = (dx + sep.sx + e.vx) * snareMult;
  const totalDy = (dy + sep.sy + e.vy) * snareMult;

  e.vx *= 0.72;
  e.vy *= 0.72;
  if (Math.abs(e.vx) < 0.02) e.vx = 0;
  if (Math.abs(e.vy) < 0.02) e.vy = 0;

  if (opts.ignoreWalls || e.elevated) {
    const clamped = clampInsideMap(state, e.x + totalDx, e.y + totalDy);
    const hitX = clamped.x !== e.x + totalDx;
    const hitY = clamped.y !== e.y + totalDy;
    e.x = clamped.x;
    e.y = clamped.y;
    return { hitWall: hitX || hitY, hitX, hitY };
  }

  if (opts.carveWalls && (Math.abs(totalDx) > 0.1 || Math.abs(totalDy) > 0.1)) {
    const carved = carveCircle(state.map, e.x + totalDx, e.y + totalDy, e.radius + 4, true);
    if (carved > 0) {
      emitEvent(state, { type: 'shake', trauma: 0.16 });
    }
  }

  const mv = moveCircleWithSlide(state.map, e.x, e.y, totalDx, totalDy, e.radius);
  e.x = mv.x;
  e.y = mv.y;
  return { hitWall: mv.hitWall, hitX: mv.hitX, hitY: mv.hitY };
}

function pickLocalPatrolTarget(e: EnemyEntity, mem: EnemyAiMemory, rng: SeededRng, maxRadius: number = 36): void {
  const ang = rng.range(0, Math.PI * 2);
  const r = rng.range(14, maxRadius);
  e.targetX = mem.homeX + Math.cos(ang) * r;
  e.targetY = mem.homeY + Math.sin(ang) * r;
}

/**
 * Alerts an enemy and propagates a staggered squad wake to nearby allies in the same pocket.
 */
function wakeEnemyAndSquad(
  state: SimState,
  e: EnemyEntity,
  mem: EnemyAiMemory,
  rng: SeededRng,
  squadWakeRange: number = 88,
): void {
  const player = state.player;
  mem.alerted = true;
  mem.aggroTicks = 135;
  mem.lastSeenX = player.x;
  mem.lastSeenY = player.y;

  // Brief startled beat so enemies NEVER robotically fire on tick 0 of spotting the player
  e.aiState = 'alert';
  e.aiTimer = rng.int(8, 13);
  e.attackCooldown = Math.max(e.attackCooldown, rng.int(12, 22));
  emitEvent(state, {
    type: 'enemy_alert',
    entityId: e.id,
    x: e.x,
    y: e.y,
    defId: e.defId,
  });

  // Propagate alert to nearby unalerted squadmates in the same pocket (with staggered reaction)
  const wakeSq = squadWakeRange * squadWakeRange;
  for (let i = 0; i < state.enemies.length; i++) {
    const ally = state.enemies[i]!;
    if (
      ally === e ||
      ally.friendly ||
      ally.isBoss ||
      ally.defId === 'idpd_van' ||
      ally.hp <= 0 ||
      ally.aiState === 'sleep' ||
      ally.aiState === 'feign' ||
      ally.aiState === 'disguised'
    ) {
      continue;
    }
    const dx = ally.x - e.x;
    const dy = ally.y - e.y;
    if (dx * dx + dy * dy > wakeSq) continue;
    const allyMem = getEnemyMemory(state, ally);
    if (allyMem.alerted) continue;
    if (!hasLineOfSight(state.map, e.x, e.y, ally.x, ally.y)) continue;

    allyMem.alerted = true;
    allyMem.aggroTicks = 115;
    allyMem.lastSeenX = player.x;
    allyMem.lastSeenY = player.y;
    ally.aiState = 'alert';
    ally.aiTimer = rng.int(10, 18);
    ally.attackCooldown = Math.max(ally.attackCooldown, rng.int(16, 28));
    emitEvent(state, {
      type: 'enemy_alert',
      entityId: ally.id,
      x: ally.x,
      y: ally.y,
      defId: ally.defId,
    });
  }
}

interface AwarenessResult {
  dist: number;
  toPlayer: number;
  hasLos: boolean;
  alerted: boolean;
  justAlerted: boolean;
  mem: EnemyAiMemory;
}

/**
 * Evaluates LOS, proximity hearing, damage provocation, and aggro memory for an enemy.
 */
function evaluateAwareness(
  state: SimState,
  e: EnemyEntity,
  rng: SeededRng,
  alertRange: number,
  hearRange: number = 64,
): AwarenessResult {
  const player = state.player;
  const mem = getEnemyMemory(state, e);
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const hasLos = dist <= alertRange && hasLineOfSight(state.map, e.x, e.y, player.x, player.y);

  let justAlerted = false;
  if (!mem.alerted) {
    const provoked = e.hp < e.maxHp || e.hurtFlashTicks > 0;
    if (hasLos || dist <= hearRange || provoked) {
      wakeEnemyAndSquad(state, e, mem, rng);
      justAlerted = true;
    }
  } else if (hasLos || e.hurtFlashTicks > 0) {
    mem.aggroTicks = 135;
    mem.lastSeenX = player.x;
    mem.lastSeenY = player.y;
  } else if (mem.aggroTicks > 0) {
    mem.aggroTicks -= 1;
  } else {
    mem.alerted = false;
    mem.pauseTicks = rng.int(16, 36);
  }

  return { dist, toPlayer, hasLos, alerted: mem.alerted, justAlerted, mem };
}

/**
 * Relaxed territory idle/wander behavior while unalerted (stays inside its encounter pocket).
 */
function stepIdlePatrol(
  state: SimState,
  e: EnemyEntity,
  mem: EnemyAiMemory,
  speed: number,
  rng: SeededRng,
): void {
  if (mem.pauseTicks > 0) {
    mem.pauseTicks -= 1;
    moveEnemy(state, e, 0, 0);
    return;
  }
  if (mem.moveTicks <= 0) {
    pickLocalPatrolTarget(e, mem, rng, 34);
    mem.moveTicks = rng.int(14, 28);
  }
  mem.moveTicks -= 1;
  const tdx = e.targetX - e.x;
  const tdy = e.targetY - e.y;
  const tDist = Math.hypot(tdx, tdy);
  if (tDist < 6 || mem.moveTicks <= 0) {
    mem.moveTicks = 0;
    mem.pauseTicks = rng.int(22, 54);
    moveEnemy(state, e, 0, 0);
    return;
  }
  e.facing = tdx >= 0 ? 1 : -1;
  e.aimAngle = Math.atan2(tdy, tdx);
  const mv = moveEnemy(state, e, (tdx / tDist) * speed * 0.52, (tdy / tDist) * speed * 0.52);
  if (mv.hitWall) {
    mem.moveTicks = 0;
    mem.pauseTicks = rng.int(16, 36);
  }
}

/**
 * Authentic Nuclear Throne stop-move-pause tactical movement for alerted enemies.
 */
function stepTacticalSkirmish(
  state: SimState,
  e: EnemyEntity,
  speed: number,
  rng: SeededRng,
  alertRange: number,
  keepDist: number = 0,
  opts: { burstMove?: boolean; kiteDist?: number } = {},
): AwarenessResult {
  const aw = evaluateAwareness(state, e, rng, alertRange);
  const { dist, toPlayer, hasLos, alerted, mem } = aw;

  if (e.aiState === 'alert') {
    e.aimAngle = toPlayer;
    e.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;
    e.aiTimer -= 1;
    moveEnemy(state, e, 0, 0);
    if (e.aiTimer <= 0) {
      e.aiState = 'idle';
      mem.moveTicks = rng.int(10, 20);
      mem.pauseTicks = 0;
    }
    return aw;
  }

  if (!alerted) {
    stepIdlePatrol(state, e, mem, speed, rng);
    return aw;
  }

  e.aimAngle = toPlayer;
  e.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;

  if (hasLos) {
    // Active stop-and-go skirmish cadence (distinct from robotic continuous orbiting!)
    if (opts.burstMove) {
      if (mem.pauseTicks > 0) {
        mem.pauseTicks -= 1;
        moveEnemy(state, e, 0, 0);
        return aw;
      }
      if (mem.moveTicks <= 0) {
        mem.moveTicks = rng.int(14, 26);
        if (rng.chance(0.4)) {
          mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
        }
      }
      mem.moveTicks -= 1;
      if (mem.moveTicks <= 0) {
        mem.pauseTicks = rng.int(10, 20);
      }
    }

    const kiteFloor = opts.kiteDist ?? keepDist * 0.68;
    let moveAng = toPlayer;
    let spdMult = 1.0;

    if (keepDist > 0 && dist < kiteFloor) {
      moveAng = toPlayer + Math.PI + mem.strafeDir * 0.35;
      spdMult = 0.9;
    } else if (dist > keepDist + 18) {
      moveAng = toPlayer + mem.strafeDir * 0.25;
      spdMult = 1.0;
    } else {
      moveAng = toPlayer + mem.strafeDir * Math.PI * 0.5;
      spdMult = 0.78;
    }

    const mv = moveEnemy(state, e, Math.cos(moveAng) * speed * spdMult, Math.sin(moveAng) * speed * spdMult);
    if (mv.hitWall) {
      mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
    }
  } else {
    // Push toward player's last known position around cover instead of forgetting them!
    const ldx = mem.lastSeenX - e.x;
    const ldy = mem.lastSeenY - e.y;
    const lDist = Math.hypot(ldx, ldy);
    if (lDist > 12) {
      const mv = moveEnemy(state, e, (ldx / lDist) * speed * 0.92, (ldy / lDist) * speed * 0.92);
      if (mv.hitWall) {
        // Side-step around corner toward last seen point
        const flankAng = Math.atan2(ldy, ldx) + mem.strafeDir * 1.1;
        moveEnemy(state, e, Math.cos(flankAng) * speed * 0.85, Math.sin(flankAng) * speed * 0.85);
        mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
      }
    } else {
      stepIdlePatrol(state, e, mem, speed, rng);
    }
  }

  return aw;
}

function countByDefId(state: SimState, defId: string): number {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hp > 0 && e.defId === defId) n += 1;
  }
  return n;
}

/**
 * Executes special death effects when tracked special enemies or bosses die.
 */
function triggerSpecialDeathEffect(
  state: SimState,
  defId: string,
  x: number,
  y: number,
  bossId: BossId | undefined,
  rng: SeededRng,
  entityId?: number,
): void {
  if (bossId) {
    handleBossDeath(state, bossId, x, y, rng);
    return;
  }

  const def = ENEMIES[defId] ?? ENEMIES.bandit!;
  const ext = getExtendedAreaRuntime(state);

  switch (defId) {
    case 'maggot_nest':
    case 'big_maggot': {
      // Authentic Nuclear Throne Wiki parity: BOTH Maggot Nest and Big Maggot burst into 6 Maggots!
      const want = 6;
      const spawnCount = Math.min(want, Math.max(0, 16 - countByDefId(state, 'maggot')));
      for (let i = 0; i < spawnCount; i++) {
        const ang = (i / Math.max(1, spawnCount)) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const child = createEnemyEntity(state, 'maggot', x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, rng);
        const cm = getEnemyMemory(state, child);
        cm.alerted = true;
        cm.aggroTicks = 120;
        cm.lastSeenX = state.player.x;
        cm.lastSeenY = state.player.y;
      }
      break;
    }

    case 'jungle_fly': {
      // Jungle Fly bursts into 6 Maggots on death!
      const spawnCount = Math.min(6, Math.max(0, 16 - countByDefId(state, 'maggot')));
      for (let i = 0; i < spawnCount; i++) {
        const ang = (i / Math.max(1, spawnCount)) * Math.PI * 2 + rng.range(-0.15, 0.15);
        const child = createEnemyEntity(state, 'maggot', x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, rng);
        const cm = getEnemyMemory(state, child);
        cm.alerted = true;
        cm.aggroTicks = 120;
        cm.lastSeenX = state.player.x;
        cm.lastSeenY = state.player.y;
      }
      break;
    }

    case 'big_rat': {
      const spawnCount = Math.min(3, Math.max(0, 14 - countByDefId(state, 'green_rat')));
      for (let i = 0; i < spawnCount; i++) {
        const ang = (i / Math.max(1, spawnCount)) * Math.PI * 2;
        const child = createEnemyEntity(state, 'green_rat', x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, rng);
        const cm = getEnemyMemory(state, child);
        cm.alerted = true;
        cm.aggroTicks = 120;
        cm.lastSeenX = state.player.x;
        cm.lastSeenY = state.player.y;
      }
      break;
    }

    case 'ballguy': {
      // Regular Ballguy explodes into 8 green venom bullets + close blast (honors Boiling Veins)!
      spawnExplosion(state, x, y, 26, 10, 'enemy', rng, {
        carveWalls: false,
        isRad: true,
        selfDamage: true,
        sound: 'sndFrogExplode',
        cause: 'BALLGUY',
        killerSprite: 'sprSuperFrogIdle',
      });
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + rng.range(-0.1, 0.1);
        fireEnemyProjectile(state, def, {
          x: x + Math.cos(ang) * 7,
          y: y + Math.sin(ang) * 7,
          angle: ang,
          speed: 3.2,
          damage: 2,
          radius: 4,
          lifeTicks: 54,
          sprite: 'sprScorpionBullet',
        });
      }
      break;
    }

    case 'toxic_ballguy': {
      // Toxic Ballguy carves walls, leaves healing Toxic Gas cloud, and bursts 8 green pellets!
      spawnExplosion(state, x, y, 30, 10, 'enemy', rng, {
        carveWalls: true,
        isRad: true,
        selfDamage: true,
        sound: 'sndFrogExplode',
        cause: 'TOXIC BALLGUY',
        killerSprite: 'sprExploderIdle',
      });
      addToxicGasCloud(state, x, y, 34, 180, 'enemy');
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + rng.range(-0.1, 0.1);
        fireEnemyProjectile(state, def, {
          x: x + Math.cos(ang) * 7,
          y: y + Math.sin(ang) * 7,
          angle: ang,
          speed: 3.3,
          damage: 2,
          radius: 4,
          lifeTicks: 58,
          sprite: 'sprScorpionBullet',
        });
      }
      break;
    }

    case 'sniper': {
      // Sniper explodes on death!
      spawnExplosion(state, x, y, 26, 12, 'enemy', rng, {
        carveWalls: false,
        selfDamage: true,
        sound: 'sndExplosionS',
        cause: 'SNIPER',
        killerSprite: 'sprSniperIdle',
      });
      break;
    }

    case 'gold_scorpion': {
      // Gold Scorpion bursts into a 12-projectile venom ring on death!
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        fireEnemyProjectile(state, def, {
          x: x + Math.cos(ang) * 9,
          y: y + Math.sin(ang) * 9,
          angle: ang,
          speed: 3.8,
          damage: 2,
          radius: 4,
          lifeTicks: 72,
          sprite: 'sprScorpionBullet',
          sound: k === 0 ? 'sndScorpionFire' : undefined,
        });
      }
      break;
    }

    case 'guardian': {
      // Palace Guardian destroys nearby walls on death!
      const carved = carveCircle(state.map, x, y, 28, true);
      if (carved > 0) {
        emitEvent(state, { type: 'shake', trauma: 0.2 });
      }
      break;
    }

    case 'cursed_spider': {
      // Cursed Crystal Spider: 25% chance to split into 2 Cursed Spiders on death!
      if (countByDefId(state, 'cursed_spider') < 14 && rng.chance(0.25)) {
        for (let k = 0; k < 2; k++) {
          const ang = k * Math.PI + rng.range(-0.4, 0.4);
          const child = createEnemyEntity(
            state,
            'cursed_spider',
            x + Math.cos(ang) * 10,
            y + Math.sin(ang) * 10,
            rng,
          );
          const cm = getEnemyMemory(state, child);
          cm.alerted = true;
          cm.aggroTicks = 140;
          cm.lastSeenX = state.player.x;
          cm.lastSeenY = state.player.y;
        }
      }
      break;
    }

    case 'assassin':
    case 'jungle_assassin': {
      // Killing a feigning-dead Assassin before it wakes drops DOUBLE rads (+8 bonus)!
      const feignSet = getAssassinFeigningSet(state);
      if (entityId !== undefined && feignSet.has(entityId)) {
        feignSet.delete(entityId);
        spawnPickup(state, 'rad', x, y, { value: 8 }, rng);
      }
      break;
    }

    case 'bonefish': {
      // Bonefish drops ZERO HP/ammo pickups!
      for (let i = state.pickups.length - 1; i >= 0; i--) {
        const pk = state.pickups[i]!;
        if ((pk.kind === 'hp' || pk.kind === 'ammo') && Math.hypot(pk.x - x, pk.y - y) <= 22) {
          state.pickups.splice(i, 1);
        }
      }
      break;
    }

    case 'idpd_freak': {
      // IDPD Freak: 50% chance to drop 3 blue grenades on death + endlessly resurrects while any enemy lives!
      if (rng.chance(0.5)) {
        for (let g = 0; g < 3; g++) {
          const ang = (g / 3) * Math.PI * 2 + rng.range(-0.3, 0.3);
          fireEnemyProjectile(state, def, {
            kind: 'grenade',
            x: x + Math.cos(ang) * 6,
            y: y + Math.sin(ang) * 6,
            angle: ang,
            speed: 3.2,
            damage: 4,
            radius: 4,
            bounce: 1,
            explosionRadius: 26,
            lifeTicks: 32,
            sprite: 'sprPopoNade',
            sound: g === 0 ? 'sndGruntThrowNadeM' : undefined,
          });
        }
      }
      const anyHostileAlive = state.enemies.some(
        (o) => !o.friendly && o.hp > 0 && o.aiState !== 'disguised',
      );
      if (anyHostileAlive && ext.idpdFreakRevives.length < 4) {
        const zone: PropEntity = {
          id: allocEntityId(state),
          kind: 'necro_revive_area',
          x,
          y,
          radius: 26,
          hp: 999999,
          maxHp: 999999,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: 'sprPopoReviveArea',
          lifeTicks: 65,
        };
        state.props.push(zone);
        ext.idpdFreakRevives.push({ x, y, timer: 65, propId: zone.id });
      }
      break;
    }

    case 'health_mimic': {
      // Health Mimic drops 2 mini pickups (HP + ammo)!
      if (state.crown !== 'life') {
        spawnPickup(state, 'hp', x - 4, y, { value: 2 }, rng);
      }
      const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
      spawnPickup(
        state,
        'ammo',
        x + 4,
        y,
        { ammoType, value: AMMO_PICKUP_AMOUNT[ammoType] },
        rng,
      );
      break;
    }

    case 'enemy_horror': {
      // Hostile Horror defeated: drop remaining rad pool + record Horror unlock event!
      const remRads = entityId !== undefined ? (ext.horrorRadPools.get(entityId) ?? 0) : 0;
      if (entityId !== undefined) ext.horrorRadPools.delete(entityId);
      if (remRads > 0) {
        spawnPickup(state, 'big_rad', x, y, { value: remRads }, rng);
      }
      ext.pendingHorrorUnlock = true;
      emitEvent(state, { type: 'sfx', sound: 'sndLevelUltra', x, y });
      emitEvent(state, {
        type: 'pickup_text',
        x,
        y: y - 18,
        text: 'HORROR UNLOCKED!',
        color: '#66ff88',
      });
      break;
    }

    case 'mimic': {
      // Ammo Mimic drops generous ammo + optional HP medkit (respecting Crown of Life)
      const heldAmmoTypes: Exclude<AmmoType, 'melee'>[] = [];
      for (const slot of state.player.weapons) {
        if (!slot) continue;
        const wDef = getWeaponDef(slot.weaponId);
        if (wDef.ammoType !== 'melee') heldAmmoTypes.push(wDef.ammoType);
      }
      const ammoPool = heldAmmoTypes.length > 0 ? heldAmmoTypes : NON_MELEE_AMMO_TYPES;
      for (let i = 0; i < 2; i++) {
        const ammoType = rng.pick(ammoPool);
        spawnPickup(
          state,
          'ammo',
          x,
          y,
          { ammoType, value: AMMO_PICKUP_AMOUNT[ammoType] },
          rng,
        );
      }
      if (state.crown !== 'life' && state.player.hp < state.player.maxHp) {
        spawnPickup(state, 'hp', x, y, { value: 2 }, rng);
      }
      break;
    }

    case 'weapon_mimic': {
      // Weapon Mimic drops 2 tier-appropriate weapons on death!
      for (let i = 0; i < 2; i++) {
        const weaponId = pickTierWeaponId(state, rng);
        spawnPickup(state, 'weapon', x, y, { weaponId }, rng);
      }
      break;
    }

    case 'snow_tank':
    case 'gold_snow_tank': {
      const count = defId === 'gold_snow_tank' ? 16 : 12;
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2;
        fireEnemyProjectile(state, def, {
          kind: 'enemy_bullet',
          x: x + Math.cos(ang) * 8,
          y: y + Math.sin(ang) * 8,
          angle: ang,
          speed: defId === 'gold_snow_tank' ? 4.4 : 3.9,
          damage: 2,
          radius: 4,
          lifeTicks: 80,
          sprite: 'sprEnemyBullet1',
        });
      }
      spawnExplosion(state, x, y, 30, 16, 'enemy', rng, {
        carveWalls: true,
        selfDamage: true,
        sound: 'sndExplosion',
        cause: defId === 'gold_snow_tank' ? 'GOLDEN SNOW TANK' : 'SNOW TANK',
        killerSprite: defId === 'gold_snow_tank' ? 'sprGoldTankIdle' : 'sprSnowTankIdle',
      });
      break;
    }

    case 'explo_freak': {
      spawnExplosion(state, x, y, 34, 18, 'enemy', rng, {
        carveWalls: true,
        selfDamage: true,
        sound: 'sndExplosion',
        cause: 'EXPLO FREAK',
        killerSprite: 'sprExploFreakIdle',
      });
      break;
    }

    case 'explo_guardian': {
      spawnExplosion(state, x, y, 42, 22, 'enemy', rng, {
        carveWalls: true,
        isRad: false,
        selfDamage: true,
        sound: 'sndExplosionL',
        cause: 'EXPLO GUARDIAN',
        killerSprite: 'sprExploGuardianIdle',
      });
      break;
    }

    case 'idpd_van': {
      spawnExplosion(state, x, y, 46, 26, 'neutral', rng, {
        carveWalls: true,
        selfDamage: true,
        sound: 'sndExplosionCar',
        cause: 'I.D.P.D. VAN',
        killerSprite: 'sprVanDrive',
      });
      break;
    }
  }
}

function processSpecialDeaths(state: SimState, rng: SeededRng): void {
  const rt = getAreaRuntime(state);
  const feignSet = getAssassinFeigningSet(state);
  const aliveIds = new Set<number>();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hp > 0 && e.aiState !== 'death_spiral') {
      aliveIds.add(e.id);
      if (e.defId === 'assassin' || e.defId === 'jungle_assassin') {
        if (e.aiState === 'feign') feignSet.add(e.id);
        else feignSet.delete(e.id);
      }
      const tracked = rt.trackedSpecials.get(e.id);
      if (tracked) {
        tracked.x = e.x;
        tracked.y = e.y;
        tracked.facing = e.facing;
        tracked.defId = e.defId;
      } else if (e.isBoss || CORPSE_SPRITE_TO_SPECIAL_DEF[ENEMIES[e.defId]?.sprites.dead ?? '']) {
        rt.trackedSpecials.set(e.id, {
          id: e.id,
          defId: e.defId,
          bossId: e.bossId,
          x: e.x,
          y: e.y,
          facing: e.facing,
        });
      }
    }
  }

  const killsIncreased = state.levelKills > rt.lastLevelKills;
  const died: Array<{ id?: number; defId: string; bossId?: BossId; x: number; y: number }> = [];
  for (const [id, rec] of rt.trackedSpecials.entries()) {
    if (!aliveIds.has(id)) {
      if (killsIncreased) {
        died.push({ id, defId: rec.defId, bossId: rec.bossId, x: rec.x, y: rec.y });
      }
      rt.trackedSpecials.delete(id);
    }
  }
  rt.lastLevelKills = state.levelKills;

  for (let i = 0; i < state.corpses.length; i++) {
    const c = state.corpses[i]!;
    if (rt.processedCorpseIds.has(c.id)) continue;
    const mappedDef = CORPSE_SPRITE_TO_SPECIAL_DEF[c.sprite];
    if (!mappedDef) continue;
    rt.processedCorpseIds.add(c.id);
    const alreadyInDied = died.some(
      (d) => d.defId === mappedDef && Math.hypot(d.x - c.x, d.y - c.y) < 40,
    );
    if (!alreadyInDied) {
      const bossId = BOSS_DEF_IDS.has(mappedDef) ? (mappedDef as BossId) : undefined;
      died.push({ defId: mappedDef, bossId, x: c.x, y: c.y });
    }
  }

  for (let i = 0; i < died.length; i++) {
    const d = died[i]!;
    triggerSpecialDeathEffect(state, d.defId, d.x, d.y, d.bossId, rng, d.id);
  }
}

/**
 * Resolves enemy contact damage against the player, respecting Gamma Guts!
 */
function resolveEnemyContactDamage(
  state: SimState,
  e: EnemyEntity,
  def: EnemyDef,
  rng: SeededRng,
): void {
  const player = state.player;
  if (!player.alive || e.friendly || e.hp <= 0 || e.elevated || e.contactDamage <= 0) return;
  if (
    e.aiState === 'sleep' ||
    e.aiState === 'feign' ||
    e.aiState === 'disguised' ||
    e.aiState === 'intro' ||
    e.aiState === 'vanish' ||
    e.aiState === 'await_drop' ||
    e.aiState === 'death_spiral' ||
    e.aiState === 'idle_desk'
  ) {
    return;
  }

  if (!circleOverlap(player.x, player.y, player.radius, e.x, e.y, e.radius)) return;

  if (hasMutation(player, 'gamma_guts') && !e.invulnerable) {
    const mem = getEnemyMemory(state, e);
    const lethalGamma = e.hp <= 6;
    if (lethalGamma || (e.hurtFlashTicks <= 0 && state.tick - mem.lastGammaTick >= 4)) {
      mem.lastGammaTick = state.tick;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const dist = Math.hypot(dx, dy) || 1;
      const killed = applyDamageToEnemy(
        state,
        e,
        6,
        (dx / dist) * 4.5,
        (dy / dist) * 4.5,
        rng,
      );
      if (killed || e.hp <= 0) {
        return;
      }
    }
  }

  applyDamageToPlayer(
    state,
    e.contactDamage,
    def.name.toUpperCase(),
    def.sprites.idle,
    rng,
  );

  // Rad Maggot bursts & dies immediately on player contact!
  if (e.defId === 'rad_maggot' && e.hp > 0) {
    applyDamageToEnemy(state, e, e.hp + 10, 0, 0, rng);
  }
}

/**
 * Handles IDPD Shielder reflective energy shield against incoming player projectiles.
 */
function reflectShielderProjectiles(state: SimState, shielder: EnemyEntity): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i]!;
    if (pr.team !== 'player') continue;
    if (pr.kind === 'melee_slash' || pr.kind === 'snare' || pr.kind === 'rad_beam') continue;

    const hit = segmentCircleHit(
      pr.prevX,
      pr.prevY,
      pr.x,
      pr.y,
      shielder.x,
      shielder.y,
      shielder.radius + pr.radius + 6,
    );
    if (hit.hit) {
      pr.x = hit.hitX;
      pr.y = hit.hitY;
      pr.prevX = hit.hitX;
      pr.prevY = hit.hitY;
      pr.team = 'enemy';
      pr.sourceCause = 'I.D.P.D. SHIELDER';
      pr.sourceSprite = 'sprShielderIdle';
      pr.vx = -pr.vx;
      pr.vy = -pr.vy;
      pr.angle = Math.atan2(pr.vy, pr.vx);
      pr.damage = Math.max(2, Math.min(4, pr.damage));
      pr.lifeTicks = Math.max(pr.lifeTicks, 45);
      pr.hitIds = [];
      emitEvent(state, {
        type: 'sfx',
        sound: 'sndShielderDeflect',
        x: shielder.x,
        y: shielder.y,
        pitchJitter: 0.1,
      });
    }
  }
}

/**
 * Steps a single hostile non-boss enemy across all 30 archetypes (covering all 45 non-boss defs)
 * with authentic Nuclear Throne idle -> alert -> telegraphed attack rhythms.
 */
function stepHostileEnemy(
  state: SimState,
  e: EnemyEntity,
  def: EnemyDef,
  rng: SeededRng,
): void {
  const player = state.player;
  const mem = getEnemyMemory(state, e);
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);

  if (e.attackCooldown > 0) e.attackCooldown -= 1;

  switch (def.aiArchetype) {
    // ------------------------------------------------------------------------
    // DESERT: bandit, molefish, jungle_bandit (stop-aim-tell-fire-reposition!)
    // ------------------------------------------------------------------------
    case 'bandit': {
      if (e.aiState === 'tell') {
        // Hold steady, aim locked briefly before firing
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 3) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 8;
          if (e.defId === 'jungle_bandit') {
            for (let s = -1; s <= 1; s++) {
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(e.aimAngle) * 8,
                y: e.y + Math.sin(e.aimAngle) * 8,
                angle: e.aimAngle + s * 0.18 + rng.range(-0.04, 0.04),
                speed: 4.3,
                damage: 2,
                sprite: 'sprEnemyBullet1',
                sound: s === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = rng.int(44, 62);
          } else if (e.defId === 'molefish') {
            mem.burstLeft = 2;
            mem.burstGap = 0;
            e.attackCooldown = rng.int(40, 58);
          } else if (e.defId === 'snow_bandit') {
            mem.burstLeft = state.loop > 0 ? 3 : 2;
            mem.burstGap = 0;
            e.attackCooldown = rng.int(38, 54);
          } else {
            mem.burstLeft = state.loop > 0 ? 2 : 1;
            mem.burstGap = 0;
            e.attackCooldown = rng.int(46, 70);
          }
        }
        return;
      }

      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (mem.burstLeft > 0) {
          if (mem.burstGap <= 0) {
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(e.aimAngle) * 8,
              y: e.y + Math.sin(e.aimAngle) * 8,
              angle: e.aimAngle + rng.range(-0.08, 0.08),
              speed: e.defId === 'snow_bandit' ? 4.5 : e.defId === 'molefish' ? 4.2 : 3.9,
              damage: e.defId === 'snow_bandit' ? 3 : 2,
              sprite: 'sprEnemyBullet1',
              sound: def.sounds.fire,
            });
            mem.burstLeft -= 1;
            mem.burstGap = 4;
          } else {
            mem.burstGap -= 1;
          }
        }
        if (e.aiTimer <= 0 && mem.burstLeft <= 0) {
          e.aiState = 'idle';
          mem.moveTicks = rng.int(16, 26);
          mem.pauseTicks = 0;
        }
        return;
      }

      const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 205, 72, {
        burstMove: true,
      });
      if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
        e.aiState = 'tell';
        e.aiTimer = 8;
        e.aimAngle = toPlayer;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: maggot & big_maggot (territory squirm -> pack rush / burrow!)
    // ------------------------------------------------------------------------
    case 'maggot': {
      if (e.defId === 'big_maggot') {
        if (e.aiState === 'tell') {
          // Burrowed underground: invulnerable briefly, dust trail, surges toward player!
          e.invulnerable = true;
          e.facing = dx >= 0 ? 1 : -1;
          e.aimAngle = toPlayer;
          e.aiTimer -= 1;
          moveEnemy(state, e, Math.cos(toPlayer) * (def.moveSpeed * 1.4), Math.sin(toPlayer) * (def.moveSpeed * 1.4));
          if (state.tick % 3 === 0) {
            emitEvent(state, {
              type: 'particle',
              kind: 'dust',
              x: e.x,
              y: e.y + 4,
              vx: rng.range(-0.5, 0.5),
              vy: rng.range(-0.5, 0.5),
              color: '#cfa974',
              size: 4,
              life: 8,
            });
          }
          if (e.aiTimer <= 0 || dist < 34) {
            e.invulnerable = false;
            e.aiState = 'charge';
            e.aiTimer = 24;
          }
        } else if (e.aiState === 'charge') {
          e.invulnerable = false;
          e.facing = dx >= 0 ? 1 : -1;
          e.aimAngle = toPlayer;
          e.aiTimer -= 1;
          moveEnemy(state, e, Math.cos(toPlayer) * (def.moveSpeed * 1.2), Math.sin(toPlayer) * (def.moveSpeed * 1.2));
          if (e.aiTimer <= 0) {
            e.aiState = 'idle';
            e.attackCooldown = 52;
          }
        } else {
          e.invulnerable = false;
          const { alerted, hasLos } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 190, 0);
          if (alerted && e.aiState !== 'alert' && (hasLos || dist < 130) && dist < 170 && e.attackCooldown <= 0) {
            e.aiState = 'tell';
            e.aiTimer = 24;
          }
        }
      } else {
        const aw = evaluateAwareness(state, e, rng, 175, 72);
        if (e.aiState === 'alert') {
          e.aiTimer -= 1;
          e.facing = dx >= 0 ? 1 : -1;
          moveEnemy(state, e, 0, 0);
          if (e.aiTimer <= 0) e.aiState = 'idle';
        } else if (!aw.alerted) {
          stepIdlePatrol(state, e, mem, def.moveSpeed * 0.65, rng);
        } else {
          // Energetic Maggot / fast glowing Rad Maggot wiggle toward player (or last seen corner!)
          const isRadMaggot = e.defId === 'rad_maggot';
          const targetAng = aw.hasLos
            ? toPlayer
            : Math.atan2(mem.lastSeenY - e.y, mem.lastSeenX - e.x);
          const wiggle = Math.sin(state.tick * 0.42 + e.id * 1.7) * (isRadMaggot ? 0.34 : 0.58);
          const ang = targetAng + wiggle;
          e.facing = Math.cos(ang) >= 0 ? 1 : -1;
          e.aimAngle = ang;
          moveEnemy(state, e, Math.cos(ang) * def.moveSpeed, Math.sin(ang) * def.moveSpeed);
          if (isRadMaggot && state.tick % 4 === 0) {
            emitEvent(state, {
              type: 'particle',
              kind: 'rad_glow',
              x: e.x,
              y: e.y,
              vx: rng.range(-0.3, 0.3),
              vy: -0.4,
              color: '#55ff66',
              size: 3,
              life: 8,
            });
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: maggot_nest (stationary, pulses tell before spawning, bursts on death!)
    // ------------------------------------------------------------------------
    case 'maggot_nest': {
      moveEnemy(state, e, 0, 0, { noSep: true });
      const aw = evaluateAwareness(state, e, rng, 210, 96);
      if (e.aiState === 'alert') {
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) e.aiState = 'idle';
        break;
      }
      if (!aw.alerted) {
        e.aiState = 'idle';
        break;
      }
      e.aiState = e.attackCooldown <= 14 ? 'tell' : 'idle';
      if (e.attackCooldown <= 0 && dist < 235 && countByDefId(state, 'maggot') < 12) {
        const ang = rng.range(0, Math.PI * 2);
        const m = createEnemyEntity(state, 'maggot', e.x + Math.cos(ang) * 12, e.y + Math.sin(ang) * 12, rng);
        const mm = getEnemyMemory(state, m);
        mm.alerted = true;
        mm.aggroTicks = 120;
        mm.lastSeenX = player.x;
        mm.lastSeenY = player.y;
        e.attackCooldown = rng.int(75, 110);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: scorpion & gold_scorpion (coil tell -> erratic wavy venom stream!)
    // ------------------------------------------------------------------------
    case 'scorpion': {
      const isGold = e.defId === 'gold_scorpion';
      if (e.aiState === 'tell') {
        // Distinct pre-shot tail coil windup!
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          mem.burstLeft = isGold ? 10 : 6;
          mem.burstGap = 0;
          e.aiTimer = isGold ? 24 : 18;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (mem.burstLeft > 0) {
          if (mem.burstGap <= 0) {
            const wave = Math.sin(mem.burstLeft * 1.15) * (isGold ? 0.34 : 0.24);
            const jitter = rng.range(-0.14, 0.14);
            const ang = e.aimAngle + wave + jitter;
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(ang) * 10,
              y: e.y + Math.sin(ang) * 10,
              angle: ang,
              speed: isGold ? rng.range(4.1, 4.9) : rng.range(3.5, 4.2),
              damage: 2,
              radius: 4,
              lifeTicks: 90,
              sprite: 'sprScorpionBullet',
              sound: mem.burstLeft % 3 === 0 ? def.sounds.fire : undefined,
            });
            mem.burstLeft -= 1;
            mem.burstGap = isGold ? 1 : 2;
          } else {
            mem.burstGap -= 1;
          }
        }
        if (e.aiTimer <= 0 && mem.burstLeft <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isGold ? 46 : 64;
          mem.moveTicks = rng.int(16, 28);
          mem.pauseTicks = 0;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 210, 78, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = isGold ? 11 : 14;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / PIZZA SEWERS: rat, green_rat, turtle (turtle has shell-spin wall-bounce AI!)
    // ------------------------------------------------------------------------
    case 'rat': {
      // Pizza Sewers Sewer Turtle: dedicated shell-spin wall-bounce AI!
      if (e.defId === 'turtle') {
        const aw = evaluateAwareness(state, e, rng, 220, 90);
        if (e.aiState === 'spin') {
          e.aiTimer -= 1;
          const spinSpd = 3.6;
          const mv = moveEnemy(state, e, e.targetX * spinSpd, e.targetY * spinSpd);
          if (mv.hitX) e.targetX = -e.targetX;
          if (mv.hitY) e.targetY = -e.targetY;
          if (mv.hitWall) {
            emitEvent(state, { type: 'sfx', sound: 'sndHitWall', x: e.x, y: e.y, volume: 0.5 });
          }
          e.facing = e.targetX >= 0 ? 1 : -1;
          e.aimAngle = Math.atan2(e.targetY, e.targetX);
          if (e.aiTimer <= 0) {
            e.aiState = 'idle';
            e.attackCooldown = rng.int(26, 42);
          }
        } else if (e.aiState === 'tell') {
          e.aiTimer -= 1;
          e.facing = dx >= 0 ? 1 : -1;
          e.aimAngle = toPlayer;
          moveEnemy(state, e, 0, 0);
          if (e.aiTimer <= 0) {
            const ang = toPlayer + rng.range(-0.18, 0.18);
            e.targetX = Math.cos(ang);
            e.targetY = Math.sin(ang);
            e.aiState = 'spin';
            e.aiTimer = 38;
          }
        } else if (!aw.alerted) {
          stepIdlePatrol(state, e, mem, def.moveSpeed * 0.65, rng);
        } else {
          const aimTo = aw.hasLos ? toPlayer : Math.atan2(mem.lastSeenY - e.y, mem.lastSeenX - e.x);
          e.aimAngle = aimTo;
          e.facing = Math.cos(aimTo) >= 0 ? 1 : -1;
          moveEnemy(state, e, Math.cos(aimTo) * def.moveSpeed, Math.sin(aimTo) * def.moveSpeed);
          if (e.attackCooldown <= 0 && (aw.hasLos || dist < 120)) {
            e.aiState = 'tell';
            e.aiTimer = 10;
          }
        }
        break;
      }

      const aw = evaluateAwareness(state, e, rng, 200, 72);
      if (e.aiState === 'alert') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          mem.moveTicks = rng.int(14, 22);
          mem.pauseTicks = 0;
        }
        break;
      }
      if (!aw.alerted) {
        stepIdlePatrol(state, e, mem, def.moveSpeed * 0.6, rng);
        break;
      }
      if (mem.pauseTicks > 0) {
        mem.pauseTicks -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        break;
      }
      if (mem.moveTicks <= 0) {
        mem.moveTicks = rng.int(14, 22);
      }
      mem.moveTicks -= 1;
      const aimTo = aw.hasLos ? toPlayer : Math.atan2(mem.lastSeenY - e.y, mem.lastSeenX - e.x);
      const jitter = Math.sin(state.tick * 0.35 + e.id) * 0.25;
      e.aimAngle = aimTo + jitter;
      e.facing = Math.cos(e.aimAngle) >= 0 ? 1 : -1;
      moveEnemy(state, e, Math.cos(e.aimAngle) * def.moveSpeed * 1.12, Math.sin(e.aimAngle) * def.moveSpeed * 1.12);
      if (mem.moveTicks <= 0) {
        mem.pauseTicks = rng.int(5, 10);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS: big_rat (bloat tell -> vomits live green_rat pack + RAGE CHARGE 5 dmg!)
    // ------------------------------------------------------------------------
    case 'big_rat': {
      if (e.aiState === 'rage_wait') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.contactDamage = 1;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'rage_charge';
          e.aiTimer = 28;
          e.targetX = Math.cos(toPlayer);
          e.targetY = Math.sin(toPlayer);
          e.contactDamage = 5;
          emitEvent(state, { type: 'sfx', sound: 'sndRatKingVomit', x: e.x, y: e.y });
        }
      } else if (e.aiState === 'rage_charge') {
        e.aiTimer -= 1;
        e.contactDamage = 5;
        const chargeSpd = def.moveSpeed * 2.25;
        const mv = moveEnemy(state, e, e.targetX * chargeSpd, e.targetY * chargeSpd);
        if (state.tick % 3 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'dust',
            x: e.x,
            y: e.y + 4,
            vx: -e.targetX * 0.9,
            vy: -e.targetY * 0.9,
            color: '#99dd66',
            size: 4,
            life: 8,
          });
        }
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.contactDamage = 1;
          e.aiState = 'idle';
          e.attackCooldown = rng.int(44, 62);
          e.aiPhase += 1;
        }
      } else if (e.aiState === 'tell') {
        e.contactDamage = 1;
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 12;
          const liveFastRats = countByDefId(state, 'green_rat');
          if (liveFastRats < 10) {
            const count = state.loop > 0 && liveFastRats < 9 ? 2 : 1;
            for (let k = 0; k < count; k++) {
              const ang = e.aimAngle + (k === 0 ? 0 : rng.range(-0.35, 0.35));
              const spawned = createEnemyEntity(
                state,
                'green_rat',
                e.x + Math.cos(ang) * 12,
                e.y + Math.sin(ang) * 12,
                rng,
              );
              spawned.vx = Math.cos(ang) * 2.8;
              spawned.vy = Math.sin(ang) * 2.8;
              const sm = getEnemyMemory(state, spawned);
              sm.alerted = true;
              sm.aggroTicks = 135;
              sm.lastSeenX = player.x;
              sm.lastSeenY = player.y;
            }
            emitEvent(state, {
              type: 'sfx',
              sound: def.sounds.fire ?? 'sndRatKingVomit',
              x: e.x,
              y: e.y,
            });
            emitEvent(state, {
              type: 'particle',
              kind: 'dust',
              x: e.x + Math.cos(e.aimAngle) * 10,
              y: e.y + Math.sin(e.aimAngle) * 10,
              vx: Math.cos(e.aimAngle) * 1.4,
              vy: Math.sin(e.aimAngle) * 1.4,
              color: '#76e055',
              size: 5,
              life: 10,
            });
          } else {
            // Fallback toxic spit when Green Rat population cap is reached
            for (let k = -1; k <= 1; k++) {
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(e.aimAngle) * 11,
                y: e.y + Math.sin(e.aimAngle) * 11,
                angle: e.aimAngle + k * 0.24 + rng.range(-0.06, 0.06),
                speed: rng.range(3.2, 4.1),
                damage: 2,
                radius: 4,
                lifeTicks: 75,
                sprite: 'sprScorpionBullet',
                sound: k === 0 ? def.sounds.fire : undefined,
              });
            }
          }
        }
      } else if (e.aiState === 'fire') {
        e.contactDamage = 1;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = rng.int(58, 82);
          e.aiPhase += 1;
        }
      } else {
        e.contactDamage = 1;
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 200, 54);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          if (e.hp <= e.maxHp * 0.65 || e.aiPhase % 2 === 1) {
            e.aiState = 'rage_wait';
            e.aiTimer = 14;
            e.aimAngle = toPlayer;
          } else {
            e.aiState = 'tell';
            e.aiTimer = 15;
            e.aimAngle = toPlayer;
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / MANSION: gator, buff_gator & molesarge (5-pellet shotgun / Flak!)
    // ------------------------------------------------------------------------
    case 'gator': {
      const isBuff = e.defId === 'buff_gator';
      const isMolesarge = e.defId === 'molesarge';
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 12;
          if (isBuff) {
            // Genuine splitting Flak Cannon ball -> bursts at mid-range into 7 bouncing shell pellets!
            fireEnemyProjectile(state, def, {
              kind: 'flak',
              x: e.x + Math.cos(e.aimAngle) * 10,
              y: e.y + Math.sin(e.aimAngle) * 10,
              angle: e.aimAngle + rng.range(-0.04, 0.04),
              speed: 6.0,
              damage: 3,
              radius: 6,
              explosionRadius: 0,
              lifeTicks: 16,
              sprite: 'sprFlakBullet',
              sound: def.sounds.fire,
            });
            e.attackCooldown = rng.int(58, 76);
          } else {
            const pellets = 5;
            for (let k = 0; k < pellets; k++) {
              const offset =
                (k / (pellets - 1) - 0.5) * (isMolesarge ? 0.52 : 0.44) + rng.range(-0.04, 0.04);
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(e.aimAngle) * 9,
                y: e.y + Math.sin(e.aimAngle) * 9,
                angle: e.aimAngle + offset,
                speed: isMolesarge ? rng.range(4.2, 5.0) : rng.range(3.7, 4.6),
                damage: 1,
                radius: 3.5,
                lifeTicks: isMolesarge ? 34 : 72,
                sprite: 'sprEnemyBullet1',
                sound: k === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = isMolesarge ? rng.int(44, 62) : rng.int(50, 70);
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 210, 74, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / SCRAPYARD / MANSION: ballguy, toxic_ballguy, fireballer, super_fireballer
    // ------------------------------------------------------------------------
    case 'ballguy': {
      const isSuperFire = e.defId === 'super_fireballer';
      const isFire = e.defId === 'fireballer' || isSuperFire;
      const isToxic = e.defId === 'toxic_ballguy';

      // Super Fireballer: rapid 3-fireball aimed bursts (3 dmg each)!
      if (isSuperFire) {
        if (e.aiState === 'tell') {
          e.facing = dx >= 0 ? 1 : -1;
          e.aimAngle = toPlayer;
          e.aiTimer -= 1;
          moveEnemy(state, e, 0, 0);
          if (e.aiTimer <= 0) {
            e.aiState = 'fire';
            mem.burstLeft = 3;
            mem.burstGap = 0;
            e.aiTimer = 20;
          }
        } else if (e.aiState === 'fire') {
          e.aiTimer -= 1;
          moveEnemy(state, e, 0, 0);
          if (mem.burstLeft > 0) {
            if (mem.burstGap <= 0) {
              const ang = e.aimAngle + rng.range(-0.14, 0.14);
              fireEnemyProjectile(state, def, {
                kind: 'enemy_flame',
                x: e.x + Math.cos(ang) * 10,
                y: e.y + Math.sin(ang) * 10,
                angle: ang,
                speed: 4.8,
                damage: 3,
                radius: 6,
                explosionRadius: 18,
                lifeTicks: 56,
                sprite: 'sprFireBall',
                sound: def.sounds.fire ?? 'sndSuperFireballerFire',
              });
              mem.burstLeft -= 1;
              mem.burstGap = 5;
            } else {
              mem.burstGap -= 1;
            }
          }
          if (e.aiTimer <= 0 && mem.burstLeft <= 0) {
            e.aiState = 'idle';
            e.attackCooldown = 52;
          }
        } else {
          const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 215, 76);
          if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
            e.aiState = 'tell';
            e.aiTimer = 11;
            e.aimAngle = toPlayer;
          }
        }
        break;
      }

      // Regular Ballguy (sprSuperFrog): hops erratically toward player (transforms to toxic_ballguy in Toxic Gas!)
      if (!isFire && !isToxic) {
        const aw = evaluateAwareness(state, e, rng, 195, 70);
        if (!aw.alerted) {
          stepIdlePatrol(state, e, mem, def.moveSpeed * 0.7, rng);
        } else {
          e.aimAngle = toPlayer + Math.sin(state.tick * 0.22 + e.id) * 0.35;
          e.facing = Math.cos(e.aimAngle) >= 0 ? 1 : -1;
          moveEnemy(state, e, Math.cos(e.aimAngle) * def.moveSpeed, Math.sin(e.aimAngle) * def.moveSpeed);
        }
        break;
      }

      // Fireballer & Toxic Ballguy: radial burst / spiraling venom stream!
      if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 14;
          const ring = isFire ? 6 : 8;
          for (let k = 0; k < ring; k++) {
            const ang = (k / ring) * Math.PI * 2 + (isFire ? toPlayer : e.aiPhase * 0.35);
            fireEnemyProjectile(state, def, {
              kind: isFire ? 'enemy_flame' : 'enemy_bullet',
              x: e.x + Math.cos(ang) * 8,
              y: e.y + Math.sin(ang) * 8,
              angle: ang,
              speed: isFire ? 4.2 : 3.3,
              damage: 2,
              radius: isFire ? 5 : 4,
              lifeTicks: isFire ? 54 : 85,
              sprite: isFire ? 'sprFireBall' : 'sprScorpionBullet',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
          e.aiPhase += 1;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isFire ? 58 : 62;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 195, 58);
        if (alerted && e.aiState !== 'alert' && (hasLos || dist < 115) && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 13;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD: raven (perch -> tell -> 3-shot burst -> swoop over walls!)
    // ------------------------------------------------------------------------
    case 'raven': {
      if (e.aiState === 'fly') {
        e.elevated = true;
        e.elevZ = Math.min(24, (e.elevZ ?? 6) + 2);
        e.aiTimer -= 1;
        const tdx = e.targetX - e.x;
        const tdy = e.targetY - e.y;
        const tDist = Math.hypot(tdx, tdy) || 1;
        e.facing = tdx >= 0 ? 1 : -1;
        moveEnemy(state, e, (tdx / tDist) * 3.5, (tdy / tDist) * 3.5, { ignoreWalls: true, noSep: true });
        if (e.aiTimer <= 0 || tDist < 12) {
          const safe = findNearestFloor(state.map, e.x, e.y, 12);
          e.x = safe.x;
          e.y = safe.y;
          e.elevated = false;
          e.elevZ = 0;
          e.aiState = 'idle';
          e.attackCooldown = 18;
          emitEvent(state, { type: 'sfx', sound: 'sndRavenLand', x: e.x, y: e.y });
        }
      } else if (e.aiState === 'tell') {
        e.elevated = false;
        e.elevZ = 0;
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 3) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          for (let b = -1; b <= 1; b++) {
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(e.aimAngle) * 8,
              y: e.y + Math.sin(e.aimAngle) * 8,
              angle: e.aimAngle + b * 0.14,
              speed: 4.3,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: b === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = 52;
          if (rng.chance(0.6)) {
            const flankAng = toPlayer + rng.range(-1.4, 1.4);
            const dest = findNearestFloor(
              state.map,
              player.x - Math.cos(flankAng) * 78,
              player.y - Math.sin(flankAng) * 78,
              10,
            );
            e.targetX = dest.x;
            e.targetY = dest.y;
            e.aiState = 'fly';
            e.aiTimer = 32;
            e.elevated = true;
            e.elevZ = 8;
            emitEvent(state, { type: 'sfx', sound: 'sndRavenLift', x: e.x, y: e.y });
          } else {
            e.aiState = 'idle';
          }
        }
      } else {
        e.elevated = false;
        e.elevZ = 0;
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 210, 74, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 9;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD / MANSION: sniper (kites close threats + crimson laser lock tell -> 3-SHOT BURST!)
    // ------------------------------------------------------------------------
    case 'sniper': {
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 10) {
          e.aimAngle = toPlayer;
        }
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          mem.burstLeft = 3;
          mem.burstGap = 0;
          e.aiTimer = 14;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (mem.burstLeft > 0) {
          if (mem.burstGap <= 0) {
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(e.aimAngle) * 10,
              y: e.y + Math.sin(e.aimAngle) * 10,
              angle: e.aimAngle + rng.range(-0.025, 0.025),
              speed: 12.0,
              damage: 3,
              radius: 3.5,
              lifeTicks: 90,
              sprite: 'sprEnemyBullet4',
              sound: def.sounds.fire,
            });
            mem.burstLeft -= 1;
            mem.burstGap = 4;
          } else {
            mem.burstGap -= 1;
          }
        }
        if (e.aiTimer <= 0 && mem.burstLeft <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 68;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 270, 138, {
          kiteDist: 112,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 26;
          e.aimAngle = toPlayer;
          emitEvent(state, { type: 'sfx', sound: 'sndSniperTarget', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD: salamander (inhale tell -> blazing flame stream!)
    // ------------------------------------------------------------------------
    case 'salamander': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 18;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        e.aimAngle = toPlayer;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer % 2 === 0) {
          fireEnemyProjectile(state, def, {
            kind: 'enemy_flame',
            x: e.x + Math.cos(e.aimAngle) * 10,
            y: e.y + Math.sin(e.aimAngle) * 10,
            angle: e.aimAngle + rng.range(-0.24, 0.24),
            speed: rng.range(4.1, 5.2),
            damage: 1,
            radius: 5,
            lifeTicks: 32,
            sprite: 'sprSalamanderBullet',
            sound: e.aiTimer === 16 ? def.sounds.fire : undefined,
          });
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 60;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 185, 62);
        if (alerted && e.aiState !== 'alert' && hasLos && dist < 135 && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD / JUNGLE: assassin (feigns corpse -> springs up -> melee pipe slash!)
    // ------------------------------------------------------------------------
    case 'assassin': {
      if (e.aiState === 'feign') {
        moveEnemy(state, e, 0, 0, { noSep: true });
        const spotted =
          (dist <= 108 && hasLineOfSight(state.map, e.x, e.y, player.x, player.y)) ||
          dist <= 56 ||
          e.hp < e.maxHp ||
          e.hurtFlashTicks > 0;
        if (spotted) {
          mem.alerted = true;
          mem.aggroTicks = 180;
          mem.lastSeenX = player.x;
          mem.lastSeenY = player.y;
          e.aiState = 'tell';
          e.aiTimer = 11;
          emitEvent(state, { type: 'sfx', sound: 'sndAssassinGetUp', x: e.x, y: e.y });
          emitEvent(state, {
            type: 'enemy_alert',
            entityId: e.id,
            x: e.x,
            y: e.y,
            defId: e.defId,
          });
        }
      } else if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'rush';
        }
      } else {
        const hasLos = hasLineOfSight(state.map, e.x, e.y, player.x, player.y);
        if (hasLos) {
          mem.lastSeenX = player.x;
          mem.lastSeenY = player.y;
          e.facing = dx >= 0 ? 1 : -1;
          e.aimAngle = toPlayer;
          moveEnemy(state, e, Math.cos(toPlayer) * def.moveSpeed, Math.sin(toPlayer) * def.moveSpeed);
        } else {
          // Navigate around cover toward last known player coordinates instead of rubbing walls
          const ldx = mem.lastSeenX - e.x;
          const ldy = mem.lastSeenY - e.y;
          const lDist = Math.hypot(ldx, ldy);
          const chaseAng = lDist > 12 ? Math.atan2(ldy, ldx) : toPlayer;
          e.facing = Math.cos(chaseAng) >= 0 ? 1 : -1;
          e.aimAngle = chaseAng;
          const mv = moveEnemy(state, e, Math.cos(chaseAng) * def.moveSpeed, Math.sin(chaseAng) * def.moveSpeed);
          if (mv.hitWall) {
            const flankAng = chaseAng + mem.strafeDir * 1.15;
            moveEnemy(state, e, Math.cos(flankAng) * def.moveSpeed * 0.9, Math.sin(flankAng) * def.moveSpeed * 0.9);
            mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
          }
        }
        if (dist < 32 && e.attackCooldown <= 0) {
          // Authentic Nuclear Throne Wiki parity: Assassin pipe/blade slash REFLECTS bullets!
          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'melee_slash',
            team: 'enemy',
            x: e.x + Math.cos(toPlayer) * 12,
            y: e.y + Math.sin(toPlayer) * 12,
            prevX: e.x,
            prevY: e.y,
            vx: 0,
            vy: 0,
            angle: toPlayer,
            radius: 15,
            damage: Math.max(3, def.contactDamage),
            lifeTicks: 4,
            maxLifeTicks: 4,
            pierce: 99,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprSlash',
            sourceCause: def.name.toUpperCase(),
            sourceSprite: def.sprites.idle,
            hitIds: [],
            deflectsProjectiles: true,
            destroysProjectiles: false,
            meleeReach: 26,
            meleeArcDeg: 130,
          });
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndAssassinAttack', x: e.x, y: e.y });
          e.attackCooldown = 30;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // CAVES / CURSED CAVES: spider & cursed_spider (purple smoke + 25% split on death!)
    // ------------------------------------------------------------------------
    case 'spider': {
      if (e.defId === 'cursed_spider' && state.tick % 6 === 0) {
        emitEvent(state, {
          type: 'particle',
          kind: 'curse_smoke',
          x: e.x + rng.range(-4, 4),
          y: e.y + rng.range(-4, 4),
          vx: rng.range(-0.2, 0.2),
          vy: -0.45,
          color: '#b844ff',
          size: 4,
          life: 10,
        });
      }
      const aw = evaluateAwareness(state, e, rng, 200, 72);
      if (e.aiState === 'alert') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = 6;
        }
        break;
      }
      if (!aw.alerted) {
        stepIdlePatrol(state, e, mem, def.moveSpeed * 0.45, rng);
        break;
      }

      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      e.aiTimer -= 1;
      if (e.aiState === 'dash') {
        const dashSpd = def.moveSpeed * 1.5;
        const mv = moveEnemy(state, e, e.targetX * dashSpd, e.targetY * dashSpd);
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.aiState = 'idle';
          e.aiTimer = rng.int(8, 14);
        }
      } else {
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          const baseAng = aw.hasLos ? toPlayer : Math.atan2(mem.lastSeenY - e.y, mem.lastSeenX - e.x);
          const juke = (e.aiPhase % 2 === 0 ? 1 : -1) * rng.range(0.18, 0.48);
          const ang = baseAng + juke;
          e.targetX = Math.cos(ang);
          e.targetY = Math.sin(ang);
          e.aiState = 'dash';
          e.aiTimer = rng.int(10, 15);
          e.aiPhase += 1;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // CAVES / CURSED CAVES: laser_crystal, lightning_crystal & cursed_laser_crystal (teleports + 4-laser!)
    // ------------------------------------------------------------------------
    case 'laser_crystal': {
      const isLightning = e.defId === 'lightning_crystal';
      const isCursed = e.defId === 'cursed_laser_crystal';
      if (isCursed && state.tick % 5 === 0) {
        emitEvent(state, {
          type: 'particle',
          kind: 'curse_smoke',
          x: e.x + rng.range(-6, 6),
          y: e.y + rng.range(-6, 6),
          vx: rng.range(-0.2, 0.2),
          vy: -0.5,
          color: '#b844ff',
          size: 5,
          life: 12,
        });
      }
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 10) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          const bolts = isCursed ? 4 : 5;
          for (let b = 0; b < bolts; b++) {
            const spread = (b - (bolts - 1) * 0.5) * (isLightning ? 0.24 : 0.14);
            fireEnemyProjectile(state, def, {
              kind: isLightning ? 'lightning' : 'enemy_laser',
              x: e.x + Math.cos(e.aimAngle + spread) * 12,
              y: e.y + Math.sin(e.aimAngle + spread) * 12,
              angle: e.aimAngle + spread,
              speed: isLightning ? 14 : 22,
              damage: isLightning ? 3 : 4,
              radius: 4,
              lifeTicks: isLightning ? 34 : 28,
              sprite: isLightning ? 'sprLightningBall' : 'sprLaser',
              sound: b === 0 ? def.sounds.fire : undefined,
            });
          }
          e.aiState = 'idle';
          e.attackCooldown = isLightning ? 56 : isCursed ? 54 : 68;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 92);
        // Cursed Laser Crystal: short teleports every ~60-90 ticks when alerted!
        if (isCursed && alerted && e.aiState !== 'alert') {
          e.aiTimer -= 1;
          if (e.aiTimer <= 0) {
            const blinkAng = toPlayer + rng.range(-1.4, 1.4);
            const blinkDist = rng.range(48, 86);
            const cand = findNearestFloor(
              state.map,
              e.x + Math.cos(blinkAng) * blinkDist,
              e.y + Math.sin(blinkAng) * blinkDist,
              8,
            );
            if (Math.hypot(cand.x - player.x, cand.y - player.y) >= 48) {
              e.x = cand.x;
              e.y = cand.y;
              e.prevX = cand.x;
              e.prevY = cand.y;
              emitEvent(state, {
                type: 'particle',
                kind: 'curse_smoke',
                x: e.x,
                y: e.y,
                vx: 0,
                vy: -0.4,
                color: '#d966ff',
                size: 12,
                life: 12,
              });
            }
            e.aiTimer = rng.int(60, 90);
          }
        }
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 26;
          e.aimAngle = toPlayer;
          emitEvent(state, { type: 'sfx', sound: 'sndLaserCrystalCharge', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: snowbot (hurls LOS Cars, ice slide charge, headless low-HP berserk!)
    // ------------------------------------------------------------------------
    case 'snowbot': {
      const headlessBerserk = e.hp <= e.maxHp * 0.4;
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          if (mem.carryingCar) {
            // Hurl grabbed car as an explosive high-impact missile!
            mem.carryingCar = false;
            fireEnemyProjectile(state, def, {
              kind: 'grenade',
              x: e.x + Math.cos(e.aimAngle) * 12,
              y: e.y + Math.sin(e.aimAngle) * 12,
              angle: e.aimAngle,
              speed: 7.2,
              damage: 4,
              radius: 8,
              explosionRadius: 38,
              lifeTicks: 42,
              sprite: 'sprFrozenCar',
              sound: 'sndSnowBotThrow',
            });
            e.aiState = 'idle';
            e.attackCooldown = 52;
          } else {
            e.aiState = 'fire';
            e.aiTimer = headlessBerserk ? 28 : 22;
            e.targetX = Math.cos(e.aimAngle);
            e.targetY = Math.sin(e.aimAngle);
            emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndSnowBotSlideStart', x: e.x, y: e.y });
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        const chargeMult = headlessBerserk ? 1.85 : 1.6;
        const mv = moveEnemy(state, e, e.targetX * (def.moveSpeed * chargeMult), e.targetY * (def.moveSpeed * chargeMult));
        if (state.tick % 2 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: headlessBerserk ? 'spark' : 'dust',
            x: e.x,
            y: e.y + 4,
            vx: -e.targetX * 0.8,
            vy: -e.targetY * 0.8,
            color: headlessBerserk ? '#ff6644' : '#d9ecff',
            size: 3,
            life: 7,
          });
        }
        if (e.aiTimer <= 0 || mv.hitWall) {
          if (mv.hitWall) {
            emitEvent(state, { type: 'shake', trauma: 0.14 });
            e.aiState = 'stagger';
            e.aiTimer = headlessBerserk ? 8 : 14;
          } else {
            e.aiState = 'idle';
          }
          e.attackCooldown = headlessBerserk ? 16 : 38;
        }
      } else if (e.aiState === 'stagger') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(
          state,
          e,
          def.moveSpeed * (headlessBerserk ? 1.05 : 0.72),
          rng,
          215,
          0,
        );
        if (alerted && e.aiState !== 'alert' && hasLos && dist < 185 && e.attackCooldown <= 0) {
          // Check if an intact Car prop with clear LOS is within grab range (never through walls!)
          const rt = getAreaRuntime(state);
          let carIdx = -1;
          if (!headlessBerserk) {
            for (let p = 0; p < state.props.length; p++) {
              const prop = state.props[p]!;
              if (prop.kind !== 'car' || prop.hp <= 0 || prop.id === rt.venusCarPropId) continue;
              if (
                Math.hypot(prop.x - e.x, prop.y - e.y) <= 44 &&
                hasLineOfSight(state.map, e.x, e.y, prop.x, prop.y)
              ) {
                carIdx = p;
                break;
              }
            }
          }
          if (carIdx !== -1) {
            state.props.splice(carIdx, 1);
            mem.carryingCar = true;
          }
          e.aiState = 'tell';
          e.aiTimer = headlessBerserk ? 7 : 13;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: wolf (tell -> 3-round burst -> lateral combat dodge-roll!)
    // ------------------------------------------------------------------------
    case 'wolf': {
      if (e.aiState === 'roll') {
        e.aiTimer -= 1;
        const mv = moveEnemy(state, e, e.targetX * (def.moveSpeed * 1.8), e.targetY * (def.moveSpeed * 1.8));
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.aiState = 'idle';
        }
      } else if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 3) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          for (let s = -1; s <= 1; s++) {
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(e.aimAngle) * 8,
              y: e.y + Math.sin(e.aimAngle) * 8,
              angle: e.aimAngle + s * 0.16,
              speed: 4.8,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: s === 0 ? 'sndPistol' : undefined,
            });
          }
          e.attackCooldown = rng.int(38, 52);
          // Signature Snow Wolf dodge-roll sideways after shooting!
          const rollAng = e.aimAngle + (rng.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5);
          e.targetX = Math.cos(rollAng);
          e.targetY = Math.sin(rollAng);
          e.aiState = 'roll';
          e.aiTimer = 12;
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndWolfRoll', x: e.x, y: e.y });
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 215, 76, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 9;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: snow_tank & gold_snow_tank (turret rev tell -> minigun bursts!)
    // ------------------------------------------------------------------------
    case 'snow_tank': {
      const isGold = e.defId === 'gold_snow_tank';
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = isGold ? 24 : 18;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        e.aimAngle = toPlayer;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer % 2 === 0) {
          fireEnemyProjectile(state, def, {
            x: e.x + Math.cos(e.aimAngle) * 13,
            y: e.y + Math.sin(e.aimAngle) * 13,
            angle: e.aimAngle + rng.range(-0.18, 0.18),
            speed: isGold ? 5.3 : 4.7,
            damage: 2,
            radius: 4,
            sprite: 'sprEnemyBullet1',
            sound: e.aiTimer % 4 === 0 ? def.sounds.fire : undefined,
          });
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isGold ? 48 : 64;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 90);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 16;
          emitEvent(state, { type: 'sfx', sound: 'sndSnowTankPreShoot', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: freak (twitchy pack swarm pursuer when alerted)
    // ------------------------------------------------------------------------
    case 'freak': {
      stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 0);
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: rhino_freak (snort tell -> wall-smashing juggernaut charge!)
    // ------------------------------------------------------------------------
    case 'rhino_freak': {
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'charge';
          e.aiTimer = 26;
          e.targetX = Math.cos(e.aimAngle);
          e.targetY = Math.sin(e.aimAngle);
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndRhinoFreakMelee', x: e.x, y: e.y });
        }
      } else if (e.aiState === 'charge') {
        e.aiTimer -= 1;
        moveEnemy(
          state,
          e,
          e.targetX * (def.moveSpeed * 1.48),
          e.targetY * (def.moveSpeed * 1.48),
          { carveWalls: true },
        );
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 48;
        }
      } else {
        const { alerted, hasLos } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 230, 0);
        if (alerted && e.aiState !== 'alert' && (hasLos || dist < 130) && dist < 175 && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 14;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: explo_freak (sprints at player when alerted + explodes on death!)
    // ------------------------------------------------------------------------
    case 'explo_freak': {
      stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 0);
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: necromancer (keeps distance behind pack + telegraphed corpse revive!)
    // ------------------------------------------------------------------------
    case 'necromancer': {
      const rt = getAreaRuntime(state);
      const { alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 114, { kiteDist: 92 });

      if (mem.necroReviveTicks > 0) {
        mem.necroReviveTicks -= 1;
        e.aiState = 'tell';
        if (mem.necroReviveTicks % 3 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'revive',
            x: mem.necroTargetX,
            y: mem.necroTargetY,
            vx: rng.range(-0.4, 0.4),
            vy: -0.9,
            color: '#c44dff',
            size: 10,
            life: 8,
          });
        }
        if (mem.necroReviveTicks <= 0) {
          // Only complete revive if corpse still exists (Melting can counterplay by exploding it!)
          let targetIdx = -1;
          let bestSq = 28 * 28;
          for (let c = 0; c < state.corpses.length; c++) {
            const corpse = state.corpses[c]!;
            if (BOSS_CORPSE_SPRITES.has(corpse.sprite)) continue;
            const dSq =
              (corpse.x - mem.necroTargetX) * (corpse.x - mem.necroTargetX) +
              (corpse.y - mem.necroTargetY) * (corpse.y - mem.necroTargetY);
            if (dSq < bestSq) {
              bestSq = dSq;
              targetIdx = c;
            }
          }
          if (targetIdx !== -1 && rt.revivedFreakCount < 16) {
            const corpse = state.corpses[targetIdx]!;
            state.corpses.splice(targetIdx, 1);
            const revived = createEnemyEntity(state, 'freak', corpse.x, corpse.y, rng);
            const rm = getEnemyMemory(state, revived);
            rm.alerted = true;
            rm.aggroTicks = 135;
            rm.lastSeenX = player.x;
            rm.lastSeenY = player.y;
            rt.revivedFreakCount += 1;
            e.aiState = 'fire';
            emitEvent(state, {
              type: 'particle',
              kind: 'revive',
              x: corpse.x,
              y: corpse.y,
              vx: 0,
              vy: -0.8,
              color: '#e088ff',
              size: 14,
              life: 12,
            });
          } else {
            e.aiState = 'idle';
          }
          e.attackCooldown = 68;
        }
        break;
      }

      if (alerted && e.aiState !== 'alert' && e.attackCooldown <= 0 && rt.revivedFreakCount < 16 && state.corpses.length > 0) {
        let bestIdx = -1;
        let bestSq = 155 * 155;
        for (let c = 0; c < state.corpses.length; c++) {
          const corpse = state.corpses[c]!;
          if (BOSS_CORPSE_SPRITES.has(corpse.sprite)) continue;
          const cdx = corpse.x - e.x;
          const cdy = corpse.y - e.y;
          const dSq = cdx * cdx + cdy * cdy;
          if (dSq < bestSq) {
            bestSq = dSq;
            bestIdx = c;
          }
        }
        if (bestIdx !== -1) {
          const corpse = state.corpses[bestIdx]!;
          mem.necroTargetX = corpse.x;
          mem.necroTargetY = corpse.y;
          mem.necroReviveTicks = 10;
          e.aiState = 'tell';
          // Spawn persistent 35px floor Necro Revive Area (used by Melting -> Skeleton transformation on 6-1!)
          const ext = getExtendedAreaRuntime(state);
          const alreadyNear = state.props.some(
            (p) => p.kind === 'necro_revive_area' && Math.hypot(p.x - corpse.x, p.y - corpse.y) < 18,
          );
          if (!alreadyNear) {
            const zone: PropEntity = {
              id: allocEntityId(state),
              kind: 'necro_revive_area',
              x: corpse.x,
              y: corpse.y,
              radius: 35,
              hp: 999999,
              maxHp: 999999,
              solid: false,
              opened: false,
              hurtFlashTicks: 0,
              sprite: 'sprReviveArea',
              lifeTicks: 90,
            };
            state.props.push(zone);
            ext.necroReviveTimers.set(zone.id, 90);
          }
          emitEvent(state, {
            type: 'sfx',
            sound: def.sounds.fire ?? 'sndNecromancerRevive',
            x: corpse.x,
            y: corpse.y,
          });
          emitEvent(state, {
            type: 'particle',
            kind: 'revive',
            x: corpse.x,
            y: corpse.y,
            vx: 0,
            vy: -0.6,
            color: '#c44dff',
            size: 12,
            life: 10,
          });
        }
      } else if (e.aiState !== 'alert') {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: turret (pop-up tell -> crisp 3-round burst)
    // ------------------------------------------------------------------------
    case 'turret': {
      moveEnemy(state, e, 0, 0, { noSep: true });
      const aw = evaluateAwareness(state, e, rng, 225, 70);
      e.aimAngle = toPlayer;
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'alert') {
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 8;
          for (let s = -1; s <= 1; s++) {
            fireEnemyProjectile(state, def, {
              x: e.x + Math.cos(toPlayer) * 9,
              y: e.y + Math.sin(toPlayer) * 9,
              angle: toPlayer + s * 0.14,
              speed: 5.0,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: s === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = 50;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else if (aw.alerted && aw.hasLos && e.attackCooldown <= 0) {
        e.aiState = 'tell';
        e.aiTimer = 10;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE & VAULT: guardian & crown_guardian (vanish -> safe teleport -> appear tell -> orb fan!)
    // ------------------------------------------------------------------------
    case 'guardian': {
      const aw = evaluateAwareness(state, e, rng, 235, 80);
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      moveEnemy(state, e, 0, 0);

      if (e.aiState === 'alert') {
        e.invulnerable = false;
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = rng.int(45, 75);
        }
        break;
      }
      if (!aw.alerted) {
        e.invulnerable = false;
        break;
      }

      if (e.aiState === 'vanish') {
        e.invulnerable = true;
        e.aiTimer -= 1;
        if (e.aiTimer % 4 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'dust',
            x: e.x,
            y: e.y,
            vx: rng.range(-0.6, 0.6),
            vy: rng.range(-0.6, 0.6),
            color: '#b8ff7a',
            size: 4,
            life: 7,
          });
        }
        if (e.aiTimer <= 0) {
          let dest: { x: number; y: number } | null = null;
          for (let attempt = 0; attempt < 16; attempt++) {
            const ang = rng.range(0, Math.PI * 2);
            const rad = rng.range(82, 138);
            const cand = findNearestFloor(
              state.map,
              player.x + Math.cos(ang) * rad,
              player.y + Math.sin(ang) * rad,
              10,
            );
            const dFromPlayer = Math.hypot(cand.x - player.x, cand.y - player.y);
            if (dFromPlayer >= 68 && !isCircleOverlappingSolid(state.map, cand.x, cand.y, e.radius)) {
              dest = cand;
              break;
            }
          }
          if (!dest) {
            const fallbackAng = toPlayer + Math.PI;
            dest = findNearestFloor(
              state.map,
              player.x + Math.cos(fallbackAng) * 96,
              player.y + Math.sin(fallbackAng) * 96,
              12,
            );
          }
          e.x = dest.x;
          e.y = dest.y;
          e.prevX = dest.x;
          e.prevY = dest.y;
          e.invulnerable = false;
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.attackCooldown = 12;
          emitEvent(state, {
            type: 'sfx',
            sound: e.defId === 'crown_guardian' ? 'sndCrownGuardianAppear' : 'sndGuardianAppear',
            x: e.x,
            y: e.y,
          });
        }
        break;
      }

      if (e.aiState === 'tell') {
        e.invulnerable = false;
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = rng.int(72, 108);
        }
        break;
      }

      e.invulnerable = false;
      e.aiTimer -= 1;
      if (e.aiTimer <= 0) {
        emitEvent(state, {
          type: 'sfx',
          sound: e.defId === 'crown_guardian' ? 'sndCrownGuardianDisappear' : 'sndGuardianDisappear',
          x: e.x,
          y: e.y,
        });
        e.aiState = 'vanish';
        e.aiTimer = 14;
        e.invulnerable = true;
      } else if (e.attackCooldown <= 0 && dist < 240) {
        e.aiState = 'fire';
        const orbs = e.defId === 'crown_guardian' ? 7 : 5;
        for (let k = 0; k < orbs; k++) {
          const offset = (k / (orbs - 1) - 0.5) * 0.72;
          fireEnemyProjectile(state, def, {
            kind: 'boss_orb',
            x: e.x + Math.cos(toPlayer + offset) * 10,
            y: e.y + Math.sin(toPlayer + offset) * 10,
            angle: toPlayer + offset,
            speed: 3.4,
            damage: 5,
            radius: 5,
            lifeTicks: 105,
            sprite: 'sprGuardianBullet',
            sound: k === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = rng.int(54, 76);
      } else if (e.attackCooldown > 12) {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE: explo_guardian (charge tell -> explosive orb burst / close radial blast!)
    // ------------------------------------------------------------------------
    case 'explo_guardian': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 10;
          if (e.aiPhase === 1) {
            // Close-range radial explosive charge release
            for (let k = 0; k < 6; k++) {
              const ang = (k / 6) * Math.PI * 2 + e.aimAngle;
              fireEnemyProjectile(state, def, {
                kind: 'boss_orb',
                x: e.x + Math.cos(ang) * 10,
                y: e.y + Math.sin(ang) * 10,
                angle: ang,
                speed: 3.5,
                damage: 3,
                radius: 5,
                explosionRadius: 20,
                lifeTicks: 75,
                sprite: 'sprExploGuardianBullet',
                sound: k === 0 ? def.sounds.fire : undefined,
              });
            }
          } else {
            for (let k = -1; k <= 1; k++) {
              fireEnemyProjectile(state, def, {
                kind: 'boss_orb',
                x: e.x + Math.cos(e.aimAngle) * 10,
                y: e.y + Math.sin(e.aimAngle) * 10,
                angle: e.aimAngle + k * 0.24,
                speed: 3.7,
                damage: 3,
                radius: 5,
                explosionRadius: 20,
                lifeTicks: 90,
                sprite: 'sprExploGuardianBullet',
                sound: k === 0 ? def.sounds.fire : undefined,
              });
            }
          }
          e.attackCooldown = 64;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 220, 68);
        if (alerted && e.aiState !== 'alert' && (hasLos || dist < 72) && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.aiPhase = dist < 72 ? 1 : 0;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE: guardian_dog (crouch tell -> heavy melee leap over walls, NO orb ring!)
    // ------------------------------------------------------------------------
    case 'guardian_dog': {
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'leap';
          e.aiTimer = 22;
          e.targetX = Math.cos(e.aimAngle);
          e.targetY = Math.sin(e.aimAngle);
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndDogGuardianJump', x: e.x, y: e.y });
        }
      } else if (e.aiState === 'leap') {
        e.aiTimer -= 1;
        e.elevated = true;
        const frac = Math.max(0, Math.min(1, e.aiTimer / 22));
        e.elevZ = Math.sin(frac * Math.PI) * 28;
        moveEnemy(state, e, e.targetX * 4.4, e.targetY * 4.4, { ignoreWalls: true, noSep: true });
        if (e.aiTimer <= 0) {
          const safe = findNearestFloor(state.map, e.x, e.y, 10);
          e.x = safe.x;
          e.y = safe.y;
          e.elevated = false;
          e.elevZ = 0;
          e.aiState = 'idle';
          e.attackCooldown = 46;
          emitEvent(state, { type: 'shake', trauma: 0.24 });
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            emitEvent(state, {
              type: 'particle',
              kind: 'dust',
              x: e.x + Math.cos(ang) * 8,
              y: e.y + Math.sin(ang) * 8,
              vx: Math.cos(ang) * 1.9,
              vy: Math.sin(ang) * 1.9,
              color: '#9ce67a',
              size: 4,
              life: 10,
            });
          }
        }
      } else {
        e.elevated = false;
        e.elevZ = 0;
        const { alerted, hasLos } = stepTacticalSkirmish(state, e, def.moveSpeed * 0.85, rng, 235, 34);
        if (alerted && e.aiState !== 'alert' && (hasLos || dist < 140) && dist < 185 && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 13;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: grunt & elite_grunt (3-round burst, PopoRocket out of LOS, thruster roll!)
    // ------------------------------------------------------------------------
    case 'idpd_grunt': {
      const isElite = e.defId === 'elite_grunt';
      if (e.aiState === 'roll') {
        e.aiTimer -= 1;
        const rollMult = isElite ? 2.25 : 1.75;
        const mv = moveEnemy(
          state,
          e,
          e.targetX * (def.moveSpeed * rollMult),
          e.targetY * (def.moveSpeed * rollMult),
        );
        if (isElite && state.tick % 2 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'flame',
            x: e.x - e.targetX * 6,
            y: e.y - e.targetY * 6,
            vx: -e.targetX * 0.6,
            vy: -e.targetY * 0.6,
            color: '#4aa3ff',
            size: 5,
            life: 7,
            sprite: 'sprEliteGruntFlame',
          });
        }
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.aiState = 'idle';
        }
      } else if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 3) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          const hasLosNow = hasLineOfSight(state.map, e.x, e.y, player.x, player.y);
          if (isElite && (!hasLosNow || e.aiPhase % 3 === 2)) {
            // Elite Grunt fires explosive PopoRocket out of LOS or on rocket cycle!
            fireEnemyProjectile(state, def, {
              kind: 'rocket',
              x: e.x + Math.cos(e.aimAngle) * 10,
              y: e.y + Math.sin(e.aimAngle) * 10,
              angle: e.aimAngle,
              speed: 5.8,
              damage: 4,
              radius: 5,
              explosionRadius: 34,
              lifeTicks: 64,
              sprite: 'sprPopoRocket',
              sound: 'sndEliteGruntRocketFire',
            });
            e.attackCooldown = 62;
          } else if (!isElite && e.aiPhase % 3 === 2) {
            fireEnemyProjectile(state, def, {
              kind: 'grenade',
              x: e.x + Math.cos(e.aimAngle) * 8,
              y: e.y + Math.sin(e.aimAngle) * 8,
              angle: e.aimAngle,
              speed: 5.4,
              damage: 4,
              radius: 4,
              bounce: 1,
              explosionRadius: 28,
              lifeTicks: 34,
              sprite: 'sprPopoNade',
              sound: 'sndGruntThrowNadeM',
            });
            e.attackCooldown = 66;
          } else {
            for (let s = -1; s <= 1; s++) {
              fireEnemyProjectile(state, def, {
                kind: 'idpd_bullet',
                x: e.x + Math.cos(e.aimAngle) * 8,
                y: e.y + Math.sin(e.aimAngle) * 8,
                angle: e.aimAngle + s * 0.11,
                speed: isElite ? 5.6 : 5.0,
                damage: isElite ? 3 : 2,
                radius: 4,
                sprite: 'sprIDPDBullet',
                sound: s === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = isElite ? 38 : 46;
          }
          e.aiPhase += 1;
          if (rng.chance(isElite ? 0.62 : 0.48)) {
            const rollAng = e.aimAngle + (rng.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5);
            e.targetX = Math.cos(rollAng);
            e.targetY = Math.sin(rollAng);
            e.aiState = 'roll';
            e.aiTimer = isElite ? 16 : 11;
            emitEvent(state, { type: 'sfx', sound: 'sndRoll', x: e.x, y: e.y, pitchJitter: 0.12 });
          } else {
            e.aiState = 'idle';
          }
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 78, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && e.hurtFlashTicks >= 3 && rng.chance(0.5)) {
          const rollAng = toPlayer + (rng.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5);
          e.targetX = Math.cos(rollAng);
          e.targetY = Math.sin(rollAng);
          e.aiState = 'roll';
          e.aiTimer = isElite ? 16 : 11;
          emitEvent(state, { type: 'sfx', sound: 'sndRoll', x: e.x, y: e.y, pitchJitter: 0.12 });
        } else if (alerted && e.aiState !== 'alert' && (hasLos || isElite) && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 8;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: inspector & elite_inspector (Blue Energy Sword deflect, stronger telekinesis, grenades!)
    // ------------------------------------------------------------------------
    case 'idpd_inspector': {
      const isElite = e.defId === 'elite_inspector';
      if (e.aiState === 'fire') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        const pullStrength = isElite ? 1.8 : 1.15;
        if (player.alive && dist < (isElite ? 210 : 175) && dist > 18) {
          const mvP = moveCircleWithSlide(
            state.map,
            player.x,
            player.y,
            (-dx / dist) * pullStrength,
            (-dy / dist) * pullStrength,
            player.radius,
          );
          player.x = mvP.x;
          player.y = mvP.y;
          if (e.aiTimer % 3 === 0) {
            emitEvent(state, {
              type: 'particle',
              kind: 'dust',
              x: player.x,
              y: player.y,
              vx: (-dx / dist) * 2.2,
              vy: (-dy / dist) * 2.2,
              color: '#5ecbff',
              size: isElite ? 5 : 3,
              life: 7,
              sprite: isElite ? 'sprEliteInspectorControl' : undefined,
            });
          }
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          if (isElite && dist <= 46) {
            // Elite Inspector Blue Energy Sword melee slash (8 dmg + deflects bullets!)
            state.projectiles.push({
              id: allocEntityId(state),
              kind: 'melee_slash',
              team: 'enemy',
              x: e.x + Math.cos(toPlayer) * 14,
              y: e.y + Math.sin(toPlayer) * 14,
              prevX: e.x,
              prevY: e.y,
              vx: 0,
              vy: 0,
              angle: toPlayer,
              radius: 18,
              damage: 8,
              lifeTicks: 5,
              maxLifeTicks: 5,
              pierce: 99,
              bounce: 0,
              explosionRadius: 0,
              sprite: 'sprEnergySlash',
              sourceCause: def.name.toUpperCase(),
              sourceSprite: def.sprites.idle,
              hitIds: [],
              deflectsProjectiles: true,
              destroysProjectiles: false,
              meleeReach: 32,
              meleeArcDeg: 145,
            });
            emitEvent(state, { type: 'sfx', sound: 'sndEliteInspectorFire', x: e.x, y: e.y });
            e.attackCooldown = 36;
          } else if (isElite && e.aiPhase % 2 === 1) {
            fireEnemyProjectile(state, def, {
              kind: 'grenade',
              x: e.x + Math.cos(toPlayer) * 9,
              y: e.y + Math.sin(toPlayer) * 9,
              angle: toPlayer,
              speed: 5.6,
              damage: 4,
              radius: 4,
              bounce: 1,
              explosionRadius: 28,
              lifeTicks: 34,
              sprite: 'sprPopoNade',
              sound: 'sndGruntThrowNadeM',
            });
            e.attackCooldown = 50;
          } else {
            fireEnemyProjectile(state, def, {
              kind: 'idpd_bullet',
              x: e.x + Math.cos(toPlayer) * 9,
              y: e.y + Math.sin(toPlayer) * 9,
              angle: toPlayer,
              speed: 7.2,
              damage: 3,
              radius: 5,
              lifeTicks: 85,
              sprite: 'sprPopoSlug',
              sound: def.sounds.fire,
            });
            e.attackCooldown = isElite ? 44 : 56;
          }
          e.aiPhase += 1;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(
          state,
          e,
          def.moveSpeed,
          rng,
          225,
          isElite ? 42 : 86,
          { burstMove: true },
        );
        // Immediate Blue Energy Sword counter-slash if player gets close to Elite Inspector!
        if (isElite && alerted && dist <= 42 && e.attackCooldown <= 0) {
          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'melee_slash',
            team: 'enemy',
            x: e.x + Math.cos(toPlayer) * 14,
            y: e.y + Math.sin(toPlayer) * 14,
            prevX: e.x,
            prevY: e.y,
            vx: 0,
            vy: 0,
            angle: toPlayer,
            radius: 18,
            damage: 8,
            lifeTicks: 5,
            maxLifeTicks: 5,
            pierce: 99,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprEnergySlash',
            sourceCause: def.name.toUpperCase(),
            sourceSprite: def.sprites.idle,
            hitIds: [],
            deflectsProjectiles: true,
            destroysProjectiles: false,
            meleeReach: 32,
            meleeArcDeg: 145,
          });
          emitEvent(state, { type: 'sfx', sound: 'sndEliteInspectorFire', x: e.x, y: e.y });
          e.attackCooldown = 34;
        } else if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          e.aiTimer = isElite ? 26 : 22;
          emitEvent(state, { type: 'sfx', sound: 'sndInspectorStartM', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: shielder & elite_shielder (Plasma Minigun, reflective shield + TELEPORT on end!)
    // ------------------------------------------------------------------------
    case 'idpd_shielder': {
      const isElite = e.defId === 'elite_shielder';
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'shield') {
        e.invulnerable = true;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        reflectShielderProjectiles(state, e);
        if (e.aiTimer % 5 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'spark',
            x: e.x + rng.range(-8, 8),
            y: e.y + rng.range(-8, 8),
            vx: 0,
            vy: -0.4,
            color: '#4eb8ff',
            size: isElite ? 8 : 3,
            life: 6,
            sprite: isElite ? 'sprEliteShielderShieldAppear' : undefined,
          });
        }
        if (e.aiTimer <= 0) {
          e.invulnerable = false;
          e.aiState = 'idle';
          e.attackCooldown = 18;
          // Elite Shielder teleports to a nearby tactical position when shield drops!
          if (isElite) {
            const tpAng = toPlayer + rng.range(-1.6, 1.6);
            const tpRad = rng.range(64, 118);
            const dest = findNearestFloor(
              state.map,
              player.x + Math.cos(tpAng) * tpRad,
              player.y + Math.sin(tpAng) * tpRad,
              10,
            );
            if (Math.hypot(dest.x - player.x, dest.y - player.y) >= 48) {
              e.x = dest.x;
              e.y = dest.y;
              e.prevX = dest.x;
              e.prevY = dest.y;
              emitEvent(state, {
                type: 'particle',
                kind: 'idpd_portal',
                x: e.x,
                y: e.y,
                vx: 0,
                vy: 0,
                color: '#4eb8ff',
                size: 18,
                life: 10,
                sprite: 'sprEliteShielderShieldDisappear',
              });
              emitEvent(state, { type: 'sfx', sound: 'sndPortalOpen', x: e.x, y: e.y, volume: 0.7 });
            }
          }
        }
      } else if (e.aiState === 'tell') {
        e.invulnerable = false;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          if (isElite) {
            // Elite Shielder Plasma Minigun volley (5 blue plasma orbs, 4 dmg each!)
            for (let b = -2; b <= 2; b++) {
              fireEnemyProjectile(state, def, {
                kind: 'enemy_plasma',
                x: e.x + Math.cos(e.aimAngle) * 10,
                y: e.y + Math.sin(e.aimAngle) * 10,
                angle: e.aimAngle + b * 0.16,
                speed: 5.0,
                damage: 4,
                radius: 6,
                lifeTicks: 85,
                sprite: 'sprPopoPlasma',
                sound: b === 0 ? 'sndEliteShielderFire' : undefined,
              });
            }
          } else {
            for (let b = -2; b <= 2; b++) {
              fireEnemyProjectile(state, def, {
                kind: 'idpd_bullet',
                x: e.x + Math.cos(e.aimAngle) * 10,
                y: e.y + Math.sin(e.aimAngle) * 10,
                angle: e.aimAngle + b * 0.14,
                speed: 5.2,
                damage: 2,
                radius: 4,
                sprite: 'sprIDPDBullet',
                sound: b === 0 ? def.sounds.fire : undefined,
              });
            }
          }
          e.aiState = 'idle';
          e.attackCooldown = isElite ? 34 : 40;
        }
      } else {
        e.invulnerable = false;
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 82);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          if (e.aiPhase % 2 === 1 || e.hurtFlashTicks > 0) {
            e.aiState = 'shield';
            e.aiTimer = 42;
            e.invulnerable = true;
            emitEvent(state, { type: 'sfx', sound: 'sndShielderShieldM', x: e.x, y: e.y });
          } else {
            e.aiState = 'tell';
            e.aiTimer = 10;
          }
          e.aiPhase += 1;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: idpd_van (drives carving walls -> deploys squad & opens HQ hijack boarding -> departs via blue portal!)
    // ------------------------------------------------------------------------
    case 'idpd_van': {
      const rt = getAreaRuntime(state);
      const removeVanBoardProp = (): void => {
        const bpId = rt.vanBoardPropIds.get(e.id);
        if (bpId !== undefined) {
          const pIdx = state.props.findIndex((p) => p.id === bpId);
          if (pIdx !== -1) state.props.splice(pIdx, 1);
          rt.vanBoardPropIds.delete(e.id);
        }
      };

      if (e.aiState === 'drive') {
        e.aiTimer -= 1;
        moveEnemy(
          state,
          e,
          Math.cos(e.aimAngle) * def.moveSpeed,
          Math.sin(e.aimAngle) * def.moveSpeed,
          { carveWalls: true, noSep: true },
        );
        if (e.aiTimer <= 0 || dist < 44) {
          e.aiState = 'open';
          e.aiTimer = state.loop > 0 ? 150 : 50;
          e.contactDamage = 0;
          emitEvent(state, { type: 'sfx', sound: 'sndVanOpen', x: e.x, y: e.y });
          emitEvent(state, { type: 'shake', trauma: 0.3 });
          if (state.loop > 0) {
            emitEvent(state, {
              type: 'pickup_text',
              x: e.x,
              y: e.y - 16,
              text: 'VAN OPEN [E]',
              color: '#5ecbff',
            });
            // Expose persistent [E] BOARD VAN interactPrompt via invisible prompt-only anchor synced to the open Van!
            if (!rt.vanBoardPropIds.has(e.id)) {
              const safePos = isWorldSolid(state.map, e.x, e.y)
                ? findNearestFloor(state.map, e.x, e.y, 8)
                : { x: e.x, y: e.y };
              const boardAnchor: PropEntity = {
                id: allocEntityId(state),
                kind: 'bone_pile',
                x: safePos.x,
                y: safePos.y,
                radius: 16,
                hp: 999999,
                maxHp: 999999,
                solid: false,
                opened: false,
                hurtFlashTicks: 0,
                sprite: '',
                flipX: e.facing === -1,
                interactPrompt: '[E] BOARD VAN',
              };
              state.props.push(boardAnchor);
              rt.vanBoardPropIds.set(e.id, boardAnchor.id);
            }
          }
          if (e.aiPhase === 0) {
            e.aiPhase = 1;
            const squad = ['idpd_grunt', 'idpd_inspector', 'idpd_shielder'] as const;
            for (let k = 0; k < squad.length; k++) {
              const ang = e.aimAngle + Math.PI + (k - 1) * 0.65;
              createEnemyEntity(
                state,
                squad[k]!,
                e.x + Math.cos(ang) * 20,
                e.y + Math.sin(ang) * 20,
                rng,
              );
            }
          }
        }
      } else if (e.aiState === 'open') {
        e.contactDamage = 0;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0, { noSep: true });
        const bpId = rt.vanBoardPropIds.get(e.id);
        if (bpId !== undefined) {
          const anchor = state.props.find((p) => p.id === bpId);
          if (anchor) {
            anchor.x = e.x;
            anchor.y = e.y;
            anchor.hp = anchor.maxHp;
            anchor.interactPrompt = '[E] BOARD VAN';
          }
        }
        if (e.aiTimer <= 0) {
          removeVanBoardProp();
          e.aiState = 'parked';
          e.aiTimer = 45;
        }
      } else {
        // Parked empty van departs cleanly via blue IDPD portal so it NEVER softlocks level exit!
        removeVanBoardProp();
        e.contactDamage = 0;
        moveEnemy(state, e, 0, 0, { noSep: true });
        const hasOtherHostiles = state.enemies.some(
          (o) => !o.friendly && o.hp > 0 && o.defId !== 'idpd_van' && o.aiState !== 'disguised',
        );
        if (!hasOtherHostiles && e.aiTimer > 8) {
          e.aiTimer = 8;
        }
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) {
          // Remove from trackedSpecials BEFORE splicing so portal departure does not explode!
          rt.trackedSpecials.delete(e.id);
          const idx = state.enemies.indexOf(e);
          if (idx !== -1) state.enemies.splice(idx, 1);
          emitEvent(state, { type: 'sfx', sound: 'sndVanPortal', x: e.x, y: e.y });
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            emitEvent(state, {
              type: 'particle',
              kind: 'spark',
              x: e.x + Math.cos(ang) * 10,
              y: e.y + Math.sin(ang) * 10,
              vx: Math.cos(ang) * 1.8,
              vy: Math.sin(ang) * 1.8,
              color: '#4eb8ff',
              size: 4,
              life: 12,
            });
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // MIMICS: mimic (breath tell -> melee lunge/bite!) & weapon_mimic (weapon bursts!)
    // ------------------------------------------------------------------------
    case 'mimic': {
      if (e.aiState === 'disguised') {
        moveEnemy(state, e, 0, 0, { noSep: true });
        // Subtle authentic NT chest-breath / lid-chatter tell while disguised
        if ((state.tick + e.id * 17) % 90 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'dust',
            x: e.x,
            y: e.y - 6,
            vx: rng.range(-0.3, 0.3),
            vy: -0.6,
            color: e.defId === 'weapon_mimic' ? '#ff6b6b' : '#ffe680',
            size: 2,
            life: 7,
          });
        }
        if (dist <= 64 || e.hp < e.maxHp || e.hurtFlashTicks > 0) {
          mem.alerted = true;
          mem.aggroTicks = 180;
          mem.lastSeenX = player.x;
          mem.lastSeenY = player.y;
          e.aiState = 'tell';
          e.aiTimer = 10;
          e.attackCooldown = 14;
          emitEvent(state, { type: 'sfx', sound: 'sndMimicSlurp', x: e.x, y: e.y });
          emitEvent(state, {
            type: 'enemy_alert',
            entityId: e.id,
            x: e.x,
            y: e.y,
            defId: e.defId,
          });
        }
      } else if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'awake';
      } else {
        const isWeaponMimic = e.defId === 'weapon_mimic';
        const isHealthMimic = e.defId === 'health_mimic';
        const { hasLos } = stepTacticalSkirmish(
          state,
          e,
          isWeaponMimic ? def.moveSpeed : def.moveSpeed * 1.15,
          rng,
          215,
          isWeaponMimic ? 58 : 0,
        );
        if (isWeaponMimic || isHealthMimic) {
          if (isHealthMimic && dist < 30 && e.attackCooldown <= 0) {
            e.aiState = 'fire';
            state.projectiles.push({
              id: allocEntityId(state),
              kind: 'melee_slash',
              team: 'enemy',
              x: e.x + Math.cos(toPlayer) * 10,
              y: e.y + Math.sin(toPlayer) * 10,
              prevX: e.x,
              prevY: e.y,
              vx: 0,
              vy: 0,
              angle: toPlayer,
              radius: 14,
              damage: Math.max(4, def.contactDamage),
              lifeTicks: 3,
              maxLifeTicks: 3,
              pierce: 1,
              bounce: 0,
              explosionRadius: 0,
              sprite: 'sprSlash',
              sourceCause: def.name.toUpperCase(),
              sourceSprite: def.sprites.idle,
              hitIds: [],
              deflectsProjectiles: false,
              destroysProjectiles: false,
              meleeReach: 24,
              meleeArcDeg: 110,
            });
            emitEvent(state, { type: 'sfx', sound: 'sndMimicMelee', x: e.x, y: e.y });
            e.attackCooldown = 26;
          } else if (hasLos && e.attackCooldown <= 0) {
            e.aiState = 'fire';
            const count = isHealthMimic ? 5 : 4;
            for (let k = 0; k < count; k++) {
              const offset = (k / (count - 1) - 0.5) * 0.46;
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(toPlayer) * 8,
                y: e.y + Math.sin(toPlayer) * 8,
                angle: toPlayer + offset,
                speed: 5.0,
                damage: 2,
                radius: 4,
                sprite: 'sprEnemyBullet1',
                sound: k === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = 38;
          } else {
            e.aiState = 'awake';
          }
        } else {
          // Ammo Mimic: aggressive melee chaser + snapping bite lunge (NO ranged spread!)
          if (dist < 30 && e.attackCooldown <= 0) {
            e.aiState = 'fire';
            e.vx += Math.cos(toPlayer) * 3.4;
            e.vy += Math.sin(toPlayer) * 3.4;
            state.projectiles.push({
              id: allocEntityId(state),
              kind: 'melee_slash',
              team: 'enemy',
              x: e.x + Math.cos(toPlayer) * 10,
              y: e.y + Math.sin(toPlayer) * 10,
              prevX: e.x,
              prevY: e.y,
              vx: 0,
              vy: 0,
              angle: toPlayer,
              radius: 13,
              damage: Math.max(3, def.contactDamage),
              lifeTicks: 3,
              maxLifeTicks: 3,
              pierce: 1,
              bounce: 0,
              explosionRadius: 0,
              sprite: 'sprSlash',
              sourceCause: def.name.toUpperCase(),
              sourceSprite: def.sprites.idle,
              hitIds: [],
              deflectsProjectiles: false,
              destroysProjectiles: false,
              meleeReach: 22,
              meleeArcDeg: 110,
            });
            emitEvent(state, { type: 'sfx', sound: 'sndMimicMelee', x: e.x, y: e.y });
            e.attackCooldown = 26;
          } else {
            e.aiState = 'awake';
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD LOOP 3+: idpd_freak (15-bullet blue spread + death grenades + endless revive!)
    // ------------------------------------------------------------------------
    case 'idpd_freak': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 10;
          const count = 15;
          for (let k = 0; k < count; k++) {
            const spread = (k / (count - 1) - 0.5) * 1.15;
            fireEnemyProjectile(state, def, {
              kind: 'idpd_bullet',
              x: e.x + Math.cos(e.aimAngle + spread) * 9,
              y: e.y + Math.sin(e.aimAngle + spread) * 9,
              angle: e.aimAngle + spread,
              speed: rng.range(4.2, 5.4),
              damage: 2,
              radius: 4,
              lifeTicks: 76,
              sprite: 'sprIDPDBullet',
              sound: k === 0 ? 'sndGruntFire' : undefined,
            });
          }
          e.attackCooldown = 58;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 68);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // OASIS: bonefish (wall-bounce pack swim, circles player, 0 pickups!)
    // ------------------------------------------------------------------------
    case 'bonefish': {
      const aw = evaluateAwareness(state, e, rng, 220, 90);
      if (Math.hypot(e.targetX, e.targetY) < 0.2) {
        const ang = rng.range(0, Math.PI * 2);
        e.targetX = Math.cos(ang);
        e.targetY = Math.sin(ang);
      }
      e.aiTimer -= 1;
      if (aw.alerted && e.aiTimer <= 0) {
        const steer = toPlayer + (e.aiPhase % 2 === 0 ? 0.45 : -0.45);
        e.targetX = Math.cos(steer);
        e.targetY = Math.sin(steer);
        e.aiTimer = rng.int(16, 28);
        e.aiPhase += 1;
      }
      const swimSpd = aw.alerted ? def.moveSpeed : def.moveSpeed * 0.55;
      const mv = moveEnemy(state, e, e.targetX * swimSpd, e.targetY * swimSpd);
      if (mv.hitX) e.targetX = -e.targetX;
      if (mv.hitY) e.targetY = -e.targetY;
      e.facing = e.targetX >= 0 ? 1 : -1;
      e.aimAngle = Math.atan2(e.targetY, e.targetX);
      break;
    }

    // ------------------------------------------------------------------------
    // OASIS: crab (V-pattern spread of green projectiles!)
    // ------------------------------------------------------------------------
    case 'crab': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 10;
          // Crisp V-spread: 2 diverging arms of 4 projectiles each!
          for (const arm of [-1, 1] as const) {
            for (let step = 0; step < 4; step++) {
              const ang = e.aimAngle + arm * (0.12 + step * 0.12);
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(ang) * 10,
                y: e.y + Math.sin(ang) * 10,
                angle: ang,
                speed: 4.4 - step * 0.35,
                damage: 2,
                radius: 4,
                lifeTicks: 82,
                sprite: 'sprScorpionBullet',
                sound: arm === -1 && step === 0 ? def.sounds.fire : undefined,
              });
            }
          }
          e.attackCooldown = 62;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 215, 84);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 14;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // JUNGLE: jungle_fly (aggressive chase + 3x6 FiredMaggot bursts + 6 maggots on death!)
    // ------------------------------------------------------------------------
    case 'jungle_fly': {
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        moveEnemy(state, e, Math.cos(toPlayer) * (def.moveSpeed * 0.55), Math.sin(toPlayer) * (def.moveSpeed * 0.55));
        if (mem.burstLeft > 0) {
          if (mem.burstGap <= 0) {
            for (let m = 0; m < 6; m++) {
              const spread = (m / 5 - 0.5) * 0.72 + rng.range(-0.06, 0.06);
              fireEnemyProjectile(state, def, {
                x: e.x + Math.cos(toPlayer + spread) * 9,
                y: e.y + Math.sin(toPlayer + spread) * 9,
                angle: toPlayer + spread,
                speed: rng.range(3.6, 4.6),
                damage: 2,
                radius: 4,
                lifeTicks: 70,
                sprite: 'sprFiredMaggot',
                sound: m === 0 ? def.sounds.fire : undefined,
              });
            }
            mem.burstLeft -= 1;
            mem.burstGap = 10;
          } else {
            mem.burstGap -= 1;
          }
        }
        if (e.aiTimer <= 0 && mem.burstLeft <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 66;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 58);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          mem.burstLeft = 3;
          mem.burstGap = 0;
          e.aiTimer = 32;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // MANSION: jock (heavy bruiser firing explosive JockRocket!)
    // ------------------------------------------------------------------------
    case 'jock': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          fireEnemyProjectile(state, def, {
            kind: 'rocket',
            x: e.x + Math.cos(e.aimAngle) * 12,
            y: e.y + Math.sin(e.aimAngle) * 12,
            angle: e.aimAngle,
            speed: 5.4,
            damage: 4,
            radius: 5,
            explosionRadius: 36,
            lifeTicks: 72,
            sprite: 'sprJockRocket',
            sound: def.sounds.fire ?? 'sndJockFire',
          });
          e.aiState = 'idle';
          e.attackCooldown = 64;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 92);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 14;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SPECIAL ENCOUNTER: enemy_horror (Hostile Horror — 90-rad projectile-destroying beam -> melee charge!)
    // ------------------------------------------------------------------------
    case 'enemy_horror': {
      const ext = getExtendedAreaRuntime(state);
      let radPool = ext.horrorRadPools.get(e.id);
      if (radPool === undefined) {
        radPool = 90;
        ext.horrorRadPools.set(e.id, radPool);
      }
      const aw = evaluateAwareness(state, e, rng, 250, 96);
      e.facing = dx >= 0 ? 1 : -1;

      if (!aw.alerted) {
        stepIdlePatrol(state, e, mem, def.moveSpeed * 0.65, rng);
        break;
      }

      if (radPool > 0) {
        if (e.aiState === 'beam') {
          e.aiTimer -= 1;
          // Sweep beam smoothly toward player while moving slowly
          const sweepDiff = normalizeAngle(toPlayer - e.aimAngle);
          e.aimAngle = normalizeAngle(e.aimAngle + Math.max(-0.08, Math.min(0.08, sweepDiff)));
          moveEnemy(state, e, Math.cos(toPlayer) * 0.7, Math.sin(toPlayer) * 0.7);

          const beamProj = fireEnemyProjectile(state, def, {
            kind: 'enemy_bullet',
            x: e.x + Math.cos(e.aimAngle) * 12,
            y: e.y + Math.sin(e.aimAngle) * 12,
            angle: e.aimAngle + rng.range(-0.05, 0.05),
            speed: 7.4,
            damage: 1,
            radius: 6,
            lifeTicks: 34,
            sprite: 'sprHorrorBullet',
            sound: state.tick % 6 === 0 ? 'sndHorrorBeam' : undefined,
          });
          beamProj.destroysProjectiles = true;

          // Destroy player projectiles caught in Hostile Horror's sweeping green rad beam!
          for (let j = state.projectiles.length - 1; j >= 0; j--) {
            const other = state.projectiles[j]!;
            if (other.team !== 'player' || other.kind === 'melee_slash' || other.kind === 'laser') {
              continue;
            }
            const seg = segmentCircleHit(
              e.x,
              e.y,
              e.x + Math.cos(e.aimAngle) * 130,
              e.y + Math.sin(e.aimAngle) * 130,
              other.x,
              other.y,
              other.radius + 10,
            );
            if (seg.hit) {
              state.projectiles.splice(j, 1);
            }
          }

          radPool = Math.max(0, radPool - 3);
          ext.horrorRadPools.set(e.id, radPool);
          if (e.aiTimer <= 0 || radPool <= 0) {
            e.aiState = radPool <= 0 ? 'charge' : 'idle';
            e.attackCooldown = 28;
          }
        } else {
          stepTacticalSkirmish(state, e, def.moveSpeed, rng, 250, 88);
          if (aw.hasLos && e.attackCooldown <= 0) {
            e.aiState = 'beam';
            e.aiTimer = 18;
            e.aimAngle = toPlayer;
          }
        }
      } else {
        // Out of rads -> relentless melee charge!
        e.aiState = 'charge';
        e.aimAngle = toPlayer;
        const chargeSpd = def.moveSpeed * 1.48;
        moveEnemy(state, e, Math.cos(toPlayer) * chargeSpd, Math.sin(toPlayer) * chargeSpd);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD HAZARD: fire_trap (wall flame jet every ~75 ticks, disables on portal open!)
    // ------------------------------------------------------------------------
    case 'fire_trap': {
      moveEnemy(state, e, 0, 0, { noSep: true });
      if (state.portal.active) {
        e.aiState = 'disabled';
        break;
      }
      e.aiTimer -= 1;
      if (e.aiState === 'fire') {
        if (e.aiTimer % 2 === 0) {
          fireEnemyProjectile(state, def, {
            kind: 'enemy_flame',
            x: e.x + Math.cos(e.aimAngle) * 10,
            y: e.y + Math.sin(e.aimAngle) * 10,
            angle: e.aimAngle + rng.range(-0.04, 0.04),
            speed: 8.5,
            damage: 1,
            radius: 6,
            lifeTicks: 24,
            sprite: 'sprTrapFire',
          });
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = 75;
        }
      } else if (e.aiTimer <= 0) {
        e.aiState = 'fire';
        e.aiTimer = 16;
      }
      break;
    }

    default: {
      stepTacticalSkirmish(state, e, def.moveSpeed, rng, 200, 0);
      break;
    }
  }
}

function stepStandaloneFriendlies(state: SimState, rng: SeededRng): void {
  const player = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const u = state.enemies[i]!;
    if (!u.friendly || u.hp <= 0) continue;
    u.prevX = u.x;
    u.prevY = u.y;
    u.animFrame = (u.animFrame + 0.25) % 8;
    if (u.hurtFlashTicks > 0) u.hurtFlashTicks -= 1;
    if (u.attackCooldown > 0) u.attackCooldown -= 1;

    let target: EnemyEntity | null = null;
    let bestSq = 220 * 220;
    for (let j = 0; j < state.enemies.length; j++) {
      const e = state.enemies[j]!;
      if (e.friendly || e.hp <= 0) continue;
      const dSq = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y);
      if (dSq < bestSq) {
        bestSq = dSq;
        target = e;
      }
    }

    if (u.defId === 'plant_sapling' && target) {
      const dx = target.x - u.x;
      const dy = target.y - u.y;
      const d = Math.hypot(dx, dy) || 1;
      const mv = moveCircleWithSlide(state.map, u.x, u.y, (dx / d) * 2.8, (dy / d) * 2.8, u.radius);
      u.x = mv.x;
      u.y = mv.y;
      u.facing = dx >= 0 ? 1 : -1;
      if (d <= u.radius + target.radius + 4 && u.attackCooldown <= 0) {
        applyDamageToEnemy(state, target, 4, (dx / d) * 2, (dy / d) * 2, rng);
        u.attackCooldown = 10;
      }
    } else if (u.defId === 'rebel_ally') {
      const pdx = player.x - u.x;
      const pdy = player.y - u.y;
      const pDist = Math.hypot(pdx, pdy);
      if (pDist > 42) {
        const mv = moveCircleWithSlide(state.map, u.x, u.y, (pdx / pDist) * 2.0, (pdy / pDist) * 2.0, u.radius);
        u.x = mv.x;
        u.y = mv.y;
      }
      if (target) {
        const dx = target.x - u.x;
        const dy = target.y - u.y;
        u.aimAngle = Math.atan2(dy, dx);
        u.facing = dx >= 0 ? 1 : -1;
        if (u.attackCooldown <= 0 && hasLineOfSight(state.map, u.x, u.y, target.x, target.y)) {
          const ang = u.aimAngle + rng.range(-0.08, 0.08);
          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'bullet',
            team: 'player',
            x: u.x + Math.cos(ang) * 8,
            y: u.y + Math.sin(ang) * 8,
            prevX: u.x,
            prevY: u.y,
            vx: Math.cos(ang) * 14,
            vy: Math.sin(ang) * 14,
            angle: ang,
            radius: 3,
            damage: 3,
            lifeTicks: 50,
            maxLifeTicks: 50,
            pierce: 0,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprAllyBullet',
            hitIds: [],
          });
          u.attackCooldown = 12;
          emitEvent(state, { type: 'sfx', sound: 'sndPistol', x: u.x, y: u.y, pitchJitter: 0.12, volume: 0.6 });
        }
      }
    }
  }
}

function stepProps(state: SimState, rng: SeededRng, startEventIdx: number): void {
  const ext = getExtendedAreaRuntime(state);
  const player = state.player;
  const currentIds = new Set<number>();

  for (let i = state.props.length - 1; i >= 0; i--) {
    const prop = state.props[i]!;
    currentIds.add(prop.id);

    if (prop.hurtFlashTicks > 0) {
      prop.hurtFlashTicks -= 1;
    }

    const prevHp = ext.propHpSnapshot.get(prop.id);
    const tookDamage = prevHp !== undefined && prop.hp < prevHp;

    // 1. Scrapyard Fire Trap prop: fires 13-tile flame jet every ~75 ticks, disables on portal open,
    //    immune to regular bullets (only explosions / Hammerhead break it!)
    if (prop.kind === 'fire_trap') {
      if (tookDamage) {
        let hitByExplosion = false;
        for (let eIdx = startEventIdx; eIdx < state.events.length; eIdx++) {
          const ev = state.events[eIdx]!;
          if (ev.type === 'particle' && ev.kind === 'explosion') {
            if (Math.hypot(ev.x - prop.x, ev.y - prop.y) <= Math.max(40, (ev.size ?? 24) + 12)) {
              hitByExplosion = true;
              break;
            }
          }
        }
        if (!hitByExplosion) {
          prop.hp = prevHp;
        }
      }

      if (!state.portal.active) {
        const firing = ext.fireTrapFiringTicks.get(prop.id) ?? 0;
        const dir = ext.fireTrapDirs.get(prop.id) ?? 0;
        if (firing > 0) {
          ext.fireTrapFiringTicks.set(prop.id, firing - 1);
          if (firing % 2 === 0) {
            const ftDef = ENEMIES.fire_trap ?? ENEMIES.bandit!;
            fireEnemyProjectile(state, ftDef, {
              kind: 'enemy_flame',
              x: prop.x + Math.cos(dir) * 10,
              y: prop.y + Math.sin(dir) * 10,
              angle: dir + rng.range(-0.04, 0.04),
              speed: 8.5,
              damage: 1,
              radius: 6,
              lifeTicks: 24,
              sprite: 'sprTrapFire',
            });
          }
        } else {
          const timer = (ext.fireTrapTimers.get(prop.id) ?? 75) - 1;
          if (timer <= 0) {
            ext.fireTrapTimers.set(prop.id, 75);
            ext.fireTrapFiringTicks.set(prop.id, 16);
          } else {
            ext.fireTrapTimers.set(prop.id, timer);
          }
        }
      }
      continue;
    }

    // 2. Mom's Frog Egg (`frog_egg`, 35 HP): hatches into 2-3 Ballguys after ~120 ticks if unbroken!
    if (prop.kind === 'frog_egg') {
      const rem = (ext.frogEggTimers.get(prop.id) ?? prop.lifeTicks ?? 120) - 1;
      prop.lifeTicks = rem;
      ext.frogEggTimers.set(prop.id, rem);
      if (rem <= 0) {
        const ex = prop.x;
        const ey = prop.y;
        state.props.splice(i, 1);
        ext.frogEggTimers.delete(prop.id);
        const inGas = ext.toxicGasClouds.some(
          (c) => Math.hypot(c.x - ex, c.y - ey) <= c.radius + 10,
        );
        const spawnId = inGas ? 'toxic_ballguy' : 'ballguy';
        const hatchCount = rng.int(2, 3);
        for (let k = 0; k < hatchCount; k++) {
          const ang = (k / hatchCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const child = createEnemyEntity(
            state,
            spawnId,
            ex + Math.cos(ang) * 10,
            ey + Math.sin(ang) * 10,
            rng,
          );
          const cm = getEnemyMemory(state, child);
          cm.alerted = true;
          cm.aggroTicks = 180;
          cm.lastSeenX = player.x;
          cm.lastSeenY = player.y;
        }
        emitEvent(state, { type: 'sfx', sound: 'sndFrogExplode', x: ex, y: ey });
      }
      continue;
    }

    // 3. Persistent Necro Revive Area (`necro_revive_area`): ticks down & resurrects for Technomancer!
    if (prop.kind === 'necro_revive_area') {
      const rem = (ext.necroReviveTimers.get(prop.id) ?? prop.lifeTicks ?? 90) - 1;
      prop.lifeTicks = rem;
      ext.necroReviveTimers.set(prop.id, rem);
      if (rem <= 0) {
        if (prop.sprite === 'sprNecroReviveArea') {
          // Technomancer Necro Revive Beam resurrects a corpse inside the circle into Necromancer or Freak!
          const cIdx = state.corpses.findIndex(
            (c) => !BOSS_CORPSE_SPRITES.has(c.sprite) && Math.hypot(c.x - prop.x, c.y - prop.y) <= 38,
          );
          if (cIdx !== -1 && state.enemies.length < 48) {
            const corpse = state.corpses[cIdx]!;
            state.corpses.splice(cIdx, 1);
            const revId = rng.chance(0.3) ? 'necromancer' : 'freak';
            const revived = createEnemyEntity(state, revId, corpse.x, corpse.y, rng, {
              isBossSummon: true,
            });
            const rm = getEnemyMemory(state, revived);
            rm.alerted = true;
            rm.aggroTicks = 160;
            rm.lastSeenX = player.x;
            rm.lastSeenY = player.y;
          }
        }
        state.props.splice(i, 1);
        ext.necroReviveTimers.delete(prop.id);
      }
      continue;
    }

    // 4. Frozen City Snowman: pops out a hidden Snow Bandit when approached (<= 72px) or shot (NOT boss/explosion blasts!)
    if (prop.kind === 'snowman') {
      const nearPlayer = player.alive && Math.hypot(player.x - prop.x, player.y - prop.y) <= 72;
      let hitByExplosion = false;
      if (tookDamage) {
        for (let eIdx = startEventIdx; eIdx < state.events.length; eIdx++) {
          const ev = state.events[eIdx]!;
          if (ev.type === 'particle' && ev.kind === 'explosion') {
            if (Math.hypot(ev.x - prop.x, ev.y - prop.y) <= 84) {
              hitByExplosion = true;
              break;
            }
          }
        }
      }
      if (nearPlayer || (tookDamage && !hitByExplosion)) {
        const sx = prop.x;
        const sy = prop.y;
        state.props.splice(i, 1);
        const sb = createEnemyEntity(state, 'snow_bandit', sx, sy, rng);
        const sm = getEnemyMemory(state, sb);
        sm.alerted = true;
        sm.aggroTicks = 180;
        sm.lastSeenX = player.x;
        sm.lastSeenY = player.y;
        emitEvent(state, {
          type: 'particle',
          kind: 'dust',
          x: sx,
          y: sy,
          vx: 0,
          vy: -0.6,
          color: '#e6f4ff',
          size: 12,
          life: 12,
          sprite: 'sprSnowManDead',
        });
      }
      continue;
    }

    // 5. Oasis Water Mine: explodes carving walls when bumped by player!
    if (prop.kind === 'water_mine') {
      if (
        player.alive &&
        circleOverlap(player.x, player.y, player.radius + 4, prop.x, prop.y, prop.radius)
      ) {
        const mx = prop.x;
        const my = prop.y;
        state.props.splice(i, 1);
        spawnExplosion(state, mx, my, 40, 18, 'neutral', rng, {
          carveWalls: true,
          clearsProjectiles: true,
          selfDamage: true,
          sound: 'sndExplosionL',
          cause: 'WATER MINE',
          killerSprite: 'sprWaterMine',
        });
      }
      continue;
    }

    // 6. 7-3 Throne Statue: wakes into a Palace Guardian if damaged!
    if (prop.kind === 'throne_statue' && tookDamage) {
      const sx = prop.x;
      const sy = prop.y;
      state.props.splice(i, 1);
      const g = createEnemyEntity(state, 'guardian', sx, sy, rng, { isBossSummon: true });
      const gm = getEnemyMemory(state, g);
      gm.alerted = true;
      gm.aggroTicks = 240;
      gm.lastSeenX = player.x;
      gm.lastSeenY = player.y;
      emitEvent(state, { type: 'sfx', sound: 'sndGuardianAppear', x: sx, y: sy });
      continue;
    }

    // 7. Crown Vault dormant Vault Statue: wakes ALL vault statues into Crown Guardians if damaged!
    if (prop.kind === 'vault_statue' && tookDamage) {
      wakeVaultStatues(state, rng);
      break;
    }

    // 8. HQ-3 Captain's Desk damaged -> wakes Captain immediately!
    if (prop.kind === 'captain_desk' && tookDamage && !ext.captainAwakened) {
      const cap = state.enemies.find((e) => e.bossId === 'captain' && e.hp > 0);
      if (cap) wakeCaptain(state, cap, rng);
      continue;
    }
  }

  // Detect any tracked props that were DESTROYED (spliced out of state.props by damageProp!)
  for (const [id, meta] of ext.propMetaSnapshot.entries()) {
    if (currentIds.has(id)) continue;

    if (meta.kind === 'venuz_tv') {
      // Y.V.'s Crib TV destroyed -> Yung Cuz flips to sprCuzCry!
      const cuz =
        ext.yungCuzPropId !== null
          ? state.props.find((p) => p.id === ext.yungCuzPropId)
          : state.props.find((p) => p.kind === 'yung_cuz');
      if (cuz) {
        cuz.sprite = 'sprCuzCry';
      }
    } else if (meta.kind === 'captain_desk' && !ext.captainAwakened) {
      const cap = state.enemies.find((e) => e.bossId === 'captain' && e.hp > 0);
      if (cap) wakeCaptain(state, cap, rng);
    } else if (meta.kind === 'snowman') {
      // If blown up by an explosion (e.g. Lil' Hunter death blast), the hidden Snow Bandit is killed too!
      let blownUp = false;
      for (let eIdx = startEventIdx; eIdx < state.events.length; eIdx++) {
        const ev = state.events[eIdx]!;
        if (ev.type === 'particle' && ev.kind === 'explosion') {
          if (Math.hypot(ev.x - meta.x, ev.y - meta.y) <= 84) {
            blownUp = true;
            break;
          }
        }
      }
      if (!blownUp) {
        const sb = createEnemyEntity(state, 'snow_bandit', meta.x, meta.y, rng);
        const sm = getEnemyMemory(state, sb);
        sm.alerted = true;
        sm.aggroTicks = 180;
        sm.lastSeenX = player.x;
        sm.lastSeenY = player.y;
      }
    } else if (meta.kind === 'water_mine') {
      spawnExplosion(state, meta.x, meta.y, 40, 18, 'neutral', rng, {
        carveWalls: true,
        clearsProjectiles: true,
        selfDamage: true,
        sound: 'sndExplosionL',
        cause: 'WATER MINE',
        killerSprite: 'sprWaterMine',
      });
    } else if (meta.kind === 'gold_barrel' || meta.kind === 'small_generator') {
      spawnExplosion(state, meta.x, meta.y, 34, 16, 'neutral', rng, {
        carveWalls: true,
        selfDamage: true,
        sound: 'sndExplosion',
        cause: meta.kind === 'gold_barrel' ? 'GOLD BARREL' : 'GENERATOR',
        killerSprite: meta.sprite,
      });
    } else if (meta.kind === 'cocoon') {
      if (rng.chance(0.3)) {
        createEnemyEntity(state, 'jungle_fly', meta.x, meta.y, rng);
      } else {
        for (let m = 0; m < 3; m++) {
          const ang = (m / 3) * Math.PI * 2;
          createEnemyEntity(state, 'maggot', meta.x + Math.cos(ang) * 8, meta.y + Math.sin(ang) * 8, rng);
        }
      }
    } else if (meta.sprite === 'sprMutantTube') {
      const f = createEnemyEntity(state, 'freak', meta.x, meta.y, rng);
      const fm = getEnemyMemory(state, f);
      fm.alerted = true;
      fm.aggroTicks = 180;
      fm.lastSeenX = player.x;
      fm.lastSeenY = player.y;
    } else if (meta.kind === 'rad_maggot_canister') {
      const radTotal = Math.max(12, meta.radsStored ?? 18);
      spawnPickup(state, 'big_rad', meta.x, meta.y, { value: radTotal }, rng);
      for (let m = 0; m < 3; m++) {
        const ang = (m / 3) * Math.PI * 2;
        const rm = createEnemyEntity(
          state,
          'rad_maggot',
          meta.x + Math.cos(ang) * 10,
          meta.y + Math.sin(ang) * 10,
          rng,
        );
        const rmm = getEnemyMemory(state, rm);
        rmm.alerted = true;
        rmm.aggroTicks = 180;
        rmm.lastSeenX = player.x;
        rmm.lastSeenY = player.y;
      }
    } else if (meta.kind === 'throne_statue') {
      const g = createEnemyEntity(state, 'guardian', meta.x, meta.y, rng, { isBossSummon: true });
      const gm = getEnemyMemory(state, g);
      gm.alerted = true;
      gm.aggroTicks = 240;
      gm.lastSeenX = player.x;
      gm.lastSeenY = player.y;
      emitEvent(state, { type: 'sfx', sound: 'sndGuardianAppear', x: meta.x, y: meta.y });
    } else if (meta.kind === 'vault_statue') {
      const cg = createEnemyEntity(state, 'crown_guardian', meta.x, meta.y, rng);
      const cm = getEnemyMemory(state, cg);
      cm.alerted = true;
      cm.aggroTicks = 240;
      cm.lastSeenX = player.x;
      cm.lastSeenY = player.y;
      ext.vaultStatuesAwakened = true;
      wakeVaultStatues(state, rng);
    } else if (meta.kind === 'fire_trap') {
      state.decals.push({
        kind: 'scorch',
        x: meta.x,
        y: meta.y,
        angle: 0,
        scale: 1,
        color: '#222222',
        sprite: 'sprTrapScorchMark',
      });
    }
  }

  // Step pending IDPD Freak endless resurrections (cancel cleanly if zero other hostiles remain!)
  if (ext.idpdFreakRevives.length > 0) {
    const anyHostileAlive = state.enemies.some(
      (o) => !o.friendly && o.hp > 0 && o.aiState !== 'disguised',
    );
    for (let i = ext.idpdFreakRevives.length - 1; i >= 0; i--) {
      const rev = ext.idpdFreakRevives[i]!;
      if (!anyHostileAlive) {
        if (rev.propId !== null) {
          const zIdx = state.props.findIndex((p) => p.id === rev.propId);
          if (zIdx !== -1) state.props.splice(zIdx, 1);
        }
        ext.idpdFreakRevives.splice(i, 1);
        continue;
      }
      rev.timer -= 1;
      if (rev.timer <= 0) {
        if (rev.propId !== null) {
          const zIdx = state.props.findIndex((p) => p.id === rev.propId);
          if (zIdx !== -1) state.props.splice(zIdx, 1);
        }
        const respawned = createEnemyEntity(state, 'idpd_freak', rev.x, rev.y, rng);
        const rm = getEnemyMemory(state, respawned);
        rm.alerted = true;
        rm.aggroTicks = 180;
        rm.lastSeenX = player.x;
        rm.lastSeenY = player.y;
        emitEvent(state, {
          type: 'particle',
          kind: 'revive',
          x: rev.x,
          y: rev.y,
          vx: 0,
          vy: -0.5,
          color: '#5ecbff',
          size: 16,
          life: 14,
          sprite: 'sprPopoRevive',
        });
        ext.idpdFreakRevives.splice(i, 1);
      }
    }
  }

  snapshotTrackedProps(state);
}

function stepScheduledIdpdWaves(state: SimState, rng: SeededRng): void {
  if (state.portal.active || state.phase !== 'playing') return;
  const rt = getAreaRuntime(state);
  if (rt.idpdWavesRemaining <= 0) return;

  rt.idpdWaveTimer -= 1;
  if (rt.idpdWaveTimer > 0) return;

  rt.idpdWavesRemaining -= 1;
  rt.idpdWaveTimer = rng.int(160, 250);
  const effLoop = getEffectiveLoop(state);
  const includeVan = effLoop > 0 && effLoop < 3 && (rt.idpdWavesRemaining === 0 || rng.chance(0.5));
  spawnIdpdWave(state, rng, { includeVan });
}

/**
 * Evaluates all authentic Nuclear Throne secret-level & Crown Vault triggers:
 * - 1-1 Early Big Bandit (chests opened + rad canister broken with <= 50% kills -> Oasis 1-?)
 * - 2-1 Sewer Manhole explosion -> Pizza Sewers (2-?)
 * - 3-1 Golden Car repair via Screwdriver family -> Y.V.'s Mansion (3-?, entered via E)
 * - 3-3 Cursed weapon portal redirect -> Cursed Crystal Caves (4-?)
 * - 1-2 (L1+) / 3-2 / 5-2 / 7-2 Proto Statue rad absorption + shatter -> Crown Vault (vault)
 * - Vault exit return-area restoration + Vault IDPD ambush trigger
 */
function stepSecretAndWorldMechanics(state: SimState, rng: SeededRng): void {
  const rt = getAreaRuntime(state);
  const ext = getExtendedAreaRuntime(state);
  const stillPresent =
    rt.lastScannedEventIdx > 0 &&
    state.events[rt.lastScannedEventIdx - 1] === rt.lastScannedEventRef;
  const startEventIdx = stillPresent ? rt.lastScannedEventIdx : 0;

  // 1. 1-1 Early Big Bandit spawn (Oasis 1-? setup: <= 50% enemies killed + all chests & canister opened!)
  const maxOasisKills = Math.max(1, Math.floor(state.levelStartEnemyCount * 0.5));
  if (
    state.areaCode === '1-1' &&
    !state.boss &&
    !rt.earlyBigBanditSpawned &&
    !state.portal.active &&
    state.levelKills <= maxOasisKills
  ) {
    let chestCount = 0;
    let allChestsOpened = true;
    let intactCanister = false;
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      if (
        p.kind === 'weapon_chest' ||
        p.kind === 'big_weapon_chest' ||
        p.kind === 'ammo_chest' ||
        p.kind === 'health_chest'
      ) {
        chestCount += 1;
        if (!p.opened) allChestsOpened = false;
      } else if (
        (p.kind === 'rad_canister' ||
          p.kind === 'rad_maggot_canister' ||
          p.kind === 'idpd_canister') &&
        p.hp > 0 &&
        !p.opened
      ) {
        intactCanister = true;
      }
    }
    if (chestCount > 0 && allChestsOpened && !intactCanister) {
      rt.earlyBigBanditSpawned = true;
      rt.earlyBigBanditSpawnTick = state.tick;
      spawnBossEntity(state, 'big_bandit', rng);
      emitEvent(state, {
        type: 'pickup_text',
        x: state.player.x,
        y: state.player.y - 18,
        text: 'EARLY BIG BANDIT!',
        color: '#ffcc55',
      });
    }
  }

  // 2. 2-1 Pizza Sewers manhole grate (opened ONLY by explosion, even if normal portal opened!)
  if (state.areaCode === '2-1' && rt.pizzaManholePropId !== null && !state.portal.entered) {
    const mIdx = state.props.findIndex((p) => p.id === rt.pizzaManholePropId);
    if (mIdx !== -1) {
      const manhole = state.props[mIdx]!;
      // Bullets cannot destroy the grate; keep HP capped high and detect nearby explosion events
      manhole.hp = manhole.maxHp;
      let hitByExplosion = false;
      // Only genuine fiery/concussive explosions (grenades/rockets/nukes/barrels), NOT Toxic Ballguy rad gas!
      for (let i = startEventIdx; i < state.events.length; i++) {
        const ev = state.events[i]!;
        if (
          ev.type === 'particle' &&
          ev.kind === 'explosion' &&
          ev.sprite !== 'sprGreenExplosion' &&
          ev.color !== '#55ff66'
        ) {
          if (Math.hypot(ev.x - manhole.x, ev.y - manhole.y) <= Math.max(36, (ev.size ?? 24) + 8)) {
            hitByExplosion = true;
            break;
          }
        }
      }
      if (hitByExplosion) {
        state.props.splice(mIdx, 1);
        rt.pizzaManholePropId = null;
        openBossPortal(state, manhole.x, manhole.y, '2-?', state.loop, 'PIZZA SEWERS!', true);
      }
    }
  }

  // 3. 3-1 Golden Car repair via aimed Screwdriver swing (Y.V.'s Mansion 3-? setup)
  if (state.areaCode === '3-1' && rt.venusCarPropId !== null) {
    const car = state.props.find((p) => p.id === rt.venusCarPropId);
    if (car) {
      if (!rt.venusCarFixed) {
        if (car.sprite === 'sprVenusCarFixed') {
          // Already repaired externally (e.g. screwdriver melee hook) — sync cleanly without double-triggering!
          rt.venusCarFixed = true;
          car.hp = 999;
          car.maxHp = 999;
          car.interactPrompt = '[E] Y.V. MANSION';
        } else {
          for (let i = 0; i < state.projectiles.length; i++) {
            const pr = state.projectiles[i]!;
            if (
              pr.team !== 'player' ||
              pr.kind !== 'melee_slash' ||
              (pr.weaponId !== 'screwdriver' &&
                pr.weaponId !== 'golden_screwdriver' &&
                pr.weaponId !== 'energy_screwdriver')
            ) {
              continue;
            }
            const cdx = car.x - state.player.x;
            const cdy = car.y - state.player.y;
            const dist = Math.hypot(cdx, cdy);
            const reach = (pr.meleeReach ?? 26) + car.radius + 8;
            if (dist > reach) continue;
            const halfArc = (((pr.meleeArcDeg ?? 70) * Math.PI) / 180) * 0.5 + 0.25;
            const angToCar = Math.atan2(cdy, cdx);
            const inArc =
              dist <= car.radius + 6 ||
              Math.abs(normalizeAngle(angToCar - pr.angle)) <= halfArc;
            if (!inArc) continue;

            rt.venusCarFixed = true;
            car.hp = 999;
            car.maxHp = 999;
            car.sprite = 'sprVenusCarFixed';
            car.interactPrompt = '[E] Y.V. MANSION';
            emitEvent(state, { type: 'sfx', sound: 'sndWeaponPickup', x: car.x, y: car.y });
            emitEvent(state, {
              type: 'pickup_text',
              x: car.x,
              y: car.y - 16,
              text: 'CAR FIXED! [E]',
              color: '#ffd700',
            });
            for (let k = 0; k < 6; k++) {
              const ang = (k / 6) * Math.PI * 2;
              emitEvent(state, {
                type: 'particle',
                kind: 'spark',
                x: car.x,
                y: car.y,
                vx: Math.cos(ang) * 1.8,
                vy: Math.sin(ang) * 1.8,
                color: '#ffd700',
                size: 3,
                life: 10,
              });
            }
            break;
          }
        }
      } else {
        car.hp = car.maxHp;
        car.interactPrompt = '[E] Y.V. MANSION';
        if (state.tick % 24 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'spark',
            x: car.x + rng.range(-8, 8),
            y: car.y + rng.range(-6, 6),
            vx: 0,
            vy: -0.5,
            color: '#ffd700',
            size: 2,
            life: 8,
          });
        }
      }
    }
  }

  // 3B. 5-1 Ice Flower: always indestructible, dynamically prompts [E] FEED FLOWER when holding Last Wish!
  if (state.areaCode === '5-1' && rt.jungleFlowerPropId !== null) {
    const flower = state.props.find((p) => p.id === rt.jungleFlowerPropId);
    if (flower) {
      flower.hp = flower.maxHp;
      flower.interactPrompt = state.player.mutations.includes('last_wish')
        ? '[E] FEED FLOWER'
        : undefined;
    }
  }

  // 4. 3-3 Cursed weapon portal redirect -> Cursed Crystal Caves (4-?)
  if (state.areaCode === '3-3' && state.portal.active && state.portal.targetArea === '4-1') {
    const holdingCursed = Boolean(state.player.weapons[0]?.cursed || state.player.weapons[1]?.cursed);
    if (holdingCursed) {
      state.portal.targetArea = '4-?';
      emitEvent(state, {
        type: 'pickup_text',
        x: state.portal.x,
        y: state.portal.y - 18,
        text: 'CURSED CAVES!',
        color: '#d966ff',
      });
    }
  }

  // 5. 3-2 / 5-2 / 7-2 Proto Statue wide rad suction & shattering -> Crown Vault (vault)
  if (rt.protoStatuePropId !== null && !state.portal.entered) {
    const statue = state.props.find((p) => p.id === rt.protoStatuePropId);
    if (statue) {
      rt.protoStatueX = statue.x;
      rt.protoStatueY = statue.y;
      const stored = statue.radsStored ?? 0;
      if (stored < 30) {
        // Once damaged/activated (hp < maxHp or radsStored > 0), pull strongly across 210px faster than
        // player magnetism / Plutonium Hunger so the player never starves the statue!
        const activated = statue.hp < statue.maxHp || stored > 0;
        const pullRadius = activated ? 210 : 72;
        const pullStep = activated ? 10.5 : 3.2;
        const absorbDist = activated ? 22 : 16;
        for (let i = state.pickups.length - 1; i >= 0; i--) {
          const pk = state.pickups[i]!;
          if (pk.kind !== 'rad' && pk.kind !== 'big_rad') continue;
          const pdx = statue.x - pk.x;
          const pdy = statue.y - pk.y;
          const pd = Math.hypot(pdx, pdy);
          if (pd <= absorbDist) {
            statue.radsStored = (statue.radsStored ?? 0) + pk.value;
            state.pickups.splice(i, 1);
            emitEvent(state, { type: 'sfx', sound: 'sndStatueXP', x: statue.x, y: statue.y, pitchJitter: 0.1 });
          } else if (pd <= pullRadius) {
            const nx = pdx / pd;
            const ny = pdy / pd;
            pk.x += nx * pullStep;
            pk.y += ny * pullStep;
            if (activated) {
              // Override outward/player-magnetism velocity so stepPickups keeps streaming into the statue
              pk.vx = nx * 5.0;
              pk.vy = ny * 5.0;
              if (state.tick % 4 === 0) {
                emitEvent(state, {
                  type: 'particle',
                  kind: 'spark',
                  x: pk.x,
                  y: pk.y,
                  vx: nx * 1.4,
                  vy: ny * 1.4,
                  color: '#66ff88',
                  size: 2,
                  life: 6,
                });
              }
            }
            if (Math.hypot(statue.x - pk.x, statue.y - pk.y) <= absorbDist) {
              statue.radsStored = (statue.radsStored ?? 0) + pk.value;
              state.pickups.splice(i, 1);
              emitEvent(state, { type: 'sfx', sound: 'sndStatueXP', x: statue.x, y: statue.y, pitchJitter: 0.1 });
            }
          }
        }
      }
      if ((statue.radsStored ?? 0) >= 30 && !rt.protoStatueCharged) {
        rt.protoStatueCharged = true;
        statue.sprite = 'sprProtoStatueCharge';
        emitEvent(state, { type: 'sfx', sound: 'sndStatueCharge', x: statue.x, y: statue.y });
        emitEvent(state, {
          type: 'pickup_text',
          x: statue.x,
          y: statue.y - 16,
          text: 'STATUE CHARGED!',
          color: '#7dff8b',
        });
      }
    } else {
      // Proto Statue was destroyed!
      rt.protoStatuePropId = null;
      if (rt.protoStatueCharged) {
        const returnArea =
          state.areaCode === '1-2'
            ? '1-3'
            : state.areaCode === '3-2'
              ? '3-3'
              : state.areaCode === '5-2'
                ? '5-3'
                : '7-3';
        getRunRuntime(state).vaultReturnArea = returnArea;
        emitEvent(state, { type: 'sfx', sound: 'sndStatueDead', x: rt.protoStatueX, y: rt.protoStatueY });
        openBossPortal(state, rt.protoStatueX, rt.protoStatueY, 'vault', state.loop, 'CROWN VAULT!', true);
      }
    }
  }

  // 6. Crown Vault indestructible pedestal + dormant vault statues + alcove exit portal + Vault Ambush!
  if (state.areaCode === 'vault') {
    const hostilesLeft = state.enemies.some(
      (e) => !e.friendly && e.hp > 0 && e.aiState !== 'disguised',
    );
    const pedestal = state.props.find((p) => p.kind === 'proto_statue');
    if (pedestal) {
      pedestal.hp = pedestal.maxHp;
      pedestal.interactPrompt = !hostilesLeft ? '[E] SWITCH CROWN' : undefined;
    }
    const runRt = getRunRuntime(state);
    // Anchor Vault exit portal in the North Exit Alcove (>= 110px away from pedestal, outside 96px portal suction!)
    // Opens once Vault Guardians have woken and been defeated (or if already cleared)!
    if (
      !state.portal.active &&
      state.phase === 'playing' &&
      (ext.vaultStatuesAwakened || state.levelStartEnemyCount > 0 || state.levelKills > 0) &&
      !hostilesLeft
    ) {
      const ts = state.map.tileSize || TILE_SIZE;
      const cx = Math.floor(state.map.width / 2);
      let portalPos = tileToWorldCenter(cx, 6, ts);
      if (Math.hypot(state.player.x - portalPos.x, state.player.y - portalPos.y) < 52) {
        portalPos = tileToWorldCenter(cx, Math.min(state.map.height - 5, 28), ts);
      }
      const targetArea = runRt.vaultReturnArea ?? '4-1';
      openBossPortal(
        state,
        portalPos.x,
        portalPos.y,
        targetArea,
        state.loop,
        `VAULT EXIT (${targetArea})!`,
      );
    }
    if (state.portal.active && runRt.vaultReturnArea && state.portal.targetArea === '4-1') {
      state.portal.targetArea = runRt.vaultReturnArea;
    }
    if (state.portal.entered) {
      if (!state.vaultAmbushPending) {
        state.vaultAmbushPending = true;
        state.difficulty = (state.difficulty ?? 1) + 1;
      }
      if (runRt.vaultReturnArea) {
        runRt.vaultReturnArea = null;
      }
    }
  }

  // 7. 7-3 Broken Throne (intact-generator kill): indestructible & triggers victory_throne when walked onto or [E]!
  if (state.areaCode === '7-3' && rt.brokenThronePropId !== null && state.phase === 'playing') {
    const broken = state.props.find((p) => p.id === rt.brokenThronePropId);
    if (broken) {
      broken.hp = broken.maxHp;
      broken.interactPrompt = '[E] SIT ON THRONE';
      if (rt.brokenThroneSitDelay > 0) {
        rt.brokenThroneSitDelay -= 1;
      } else if (
        state.player.alive &&
        Math.hypot(state.player.x - broken.x, state.player.y - broken.y) <= 24
      ) {
        triggerThroneVictory(state, broken.x, broken.y, rng);
      }
    }
  }

  // 8. Sweep stale Loop 1+ Van boarding prompt anchors if their van died or closed
  if (rt.vanBoardPropIds.size > 0) {
    for (const [vanId, propId] of rt.vanBoardPropIds.entries()) {
      const van = state.enemies.find((e) => e.id === vanId && e.hp > 0 && e.aiState === 'open');
      if (!van) {
        const pIdx = state.props.findIndex((p) => p.id === propId);
        if (pIdx !== -1) state.props.splice(pIdx, 1);
        rt.vanBoardPropIds.delete(vanId);
      }
    }
  }

  rt.lastScannedEventIdx = state.events.length;
  rt.lastScannedEventRef =
    state.events.length > 0 ? state.events[state.events.length - 1]! : null;
}

/**
 * Steps all hostile enemies, all 5 Bosses, special death payoffs, boss missiles/orbs,
 * destructible prop timers, scheduled IDPD reinforcement waves, secret-world triggers,
 * and enemy contact damage.
 */
export function stepEntitiesAndAi(
  state: SimState,
  rng: SeededRng,
  opts: StepEntitiesOptions = {},
): void {
  const rt = getAreaRuntime(state);
  const stillPresent =
    rt.lastScannedEventIdx > 0 &&
    state.events[rt.lastScannedEventIdx - 1] === rt.lastScannedEventRef;
  const startEventIdx = stillPresent ? rt.lastScannedEventIdx : 0;

  processSpecialDeaths(state, rng);
  stepBossProjectiles(state, rng);

  if (opts.stepFriendlies) {
    stepStandaloneFriendlies(state, rng);
  }

  const snapshot = [...state.enemies];
  for (let i = 0; i < snapshot.length; i++) {
    const e = snapshot[i]!;
    if (e.friendly || e.hp <= 0) continue;

    e.prevX = e.x;
    e.prevY = e.y;
    e.animFrame = (e.animFrame + 0.25) % 8;
    if (e.hurtFlashTicks > 0) e.hurtFlashTicks -= 1;
    if (e.snaredTicks > 0) e.snaredTicks -= 1;

    const def = ENEMIES[e.defId] ?? ENEMIES.bandit!;
    if (e.isBoss && e.bossId) {
      stepBossAi(state, e, rng);
    } else {
      stepHostileEnemy(state, e, def, rng);
    }

    if (e.hp > 0) {
      resolveEnemyContactDamage(state, e, def, rng);
    }
  }

  processSpecialDeaths(state, rng);
  stepProps(state, rng, startEventIdx);
  stepScheduledIdpdWaves(state, rng);
  stepSecretAndWorldMechanics(state, rng);
}
