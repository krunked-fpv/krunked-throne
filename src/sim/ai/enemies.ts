import {
  TILE_SIZE,
  type BossId,
  type EnemyDef,
  type EnemyEntity,
  type SimState,
} from '@/contracts';
import { ENEMIES } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  circleOverlap,
  emitEvent,
  findNearestFloor,
  hasLineOfSight,
  moveCircleWithSlide,
  segmentCircleHit,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  hasMutation,
  spawnEnemyProjectile,
  spawnExplosion,
} from '@/sim/combat';
import {
  createEnemyEntity,
  getAreaRuntime,
  getEnemyMemory,
  spawnIdpdWave,
  type EnemyAiMemory,
} from '@/sim/entities';
import {
  handleBossDeath,
  stepBossAi,
  stepBossProjectiles,
} from './bosses';

export interface StepEntitiesOptions {
  stepFriendlies?: boolean;
}

const CORPSE_SPRITE_TO_SPECIAL_DEF: Record<string, string> = {
  sprMSpawnDead: 'maggot_nest',
  sprRatkingDead: 'big_rat',
  sprSnowTankDead: 'snow_tank',
  sprGoldTankDead: 'gold_snow_tank',
  sprExploFreakDead: 'explo_freak',
  sprExploGuardianDead: 'explo_guardian',
  sprVanDead: 'idpd_van',
  sprBanditBossDead: 'big_bandit',
  sprScrapBossDead: 'big_dog',
  sprLilHunterDead: 'lil_hunter',
  sprNothingDeath: 'nuclear_throne',
  sprNothing2Death: 'throne_ii',
};

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
): { hitWall: boolean } {
  const snareMult = e.snaredTicks > 0 ? 0.12 : 1.0;
  const sep = opts.noSep ? { sx: 0, sy: 0 } : computeSoftSeparation(state, e);
  const totalDx = (dx + sep.sx + e.vx) * snareMult;
  const totalDy = (dy + sep.sy + e.vy) * snareMult;

  e.vx *= 0.72;
  e.vy *= 0.72;
  if (Math.abs(e.vx) < 0.02) e.vx = 0;
  if (Math.abs(e.vy) < 0.02) e.vy = 0;

  if (opts.ignoreWalls || e.elevated) {
    const clamped = clampInsideMap(state, e.x + totalDx, e.y + totalDy);
    const hitWall = clamped.x !== e.x + totalDx || clamped.y !== e.y + totalDy;
    e.x = clamped.x;
    e.y = clamped.y;
    return { hitWall };
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
  return { hitWall: mv.hitWall };
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
      ally.hp <= 0 ||
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
): void {
  if (bossId) {
    handleBossDeath(state, bossId, x, y, rng);
    return;
  }

  switch (defId) {
    case 'maggot_nest': {
      const spawnCount = Math.min(4, Math.max(0, 14 - countByDefId(state, 'maggot')));
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

    case 'snow_tank':
    case 'gold_snow_tank': {
      const count = defId === 'gold_snow_tank' ? 16 : 12;
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2;
        spawnEnemyProjectile(state, {
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
        sound: 'sndExplosion',
        cause: 'SNOW TANK',
        killerSprite: defId === 'gold_snow_tank' ? 'sprGoldTankIdle' : 'sprSnowTankIdle',
      });
      break;
    }

    case 'explo_freak': {
      spawnExplosion(state, x, y, 34, 18, 'enemy', rng, {
        carveWalls: true,
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
        sound: 'sndExplosionL',
        cause: 'EXPLO GUARDIAN',
        killerSprite: 'sprExploGuardianIdle',
      });
      break;
    }

    case 'idpd_van': {
      spawnExplosion(state, x, y, 46, 26, 'neutral', rng, {
        carveWalls: true,
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
  const aliveIds = new Set<number>();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hp > 0) {
      aliveIds.add(e.id);
      const tracked = rt.trackedSpecials.get(e.id);
      if (tracked) {
        tracked.x = e.x;
        tracked.y = e.y;
        tracked.facing = e.facing;
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

  const died: Array<{ defId: string; bossId?: BossId; x: number; y: number }> = [];
  for (const [id, rec] of rt.trackedSpecials.entries()) {
    if (!aliveIds.has(id)) {
      died.push({ defId: rec.defId, bossId: rec.bossId, x: rec.x, y: rec.y });
      rt.trackedSpecials.delete(id);
    }
  }

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
      const bossId =
        mappedDef === 'big_bandit' ||
        mappedDef === 'big_dog' ||
        mappedDef === 'lil_hunter' ||
        mappedDef === 'nuclear_throne' ||
        mappedDef === 'throne_ii'
          ? (mappedDef as BossId)
          : undefined;
      died.push({ defId: mappedDef, bossId, x: c.x, y: c.y });
    }
  }

  for (let i = 0; i < died.length; i++) {
    const d = died[i]!;
    triggerSpecialDeathEffect(state, d.defId, d.x, d.y, d.bossId, rng);
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
  if (e.aiState === 'sleep' || e.aiState === 'feign' || e.aiState === 'disguised' || e.aiState === 'intro') {
    return;
  }

  if (!circleOverlap(player.x, player.y, player.radius, e.x, e.y, e.radius)) return;

  if (hasMutation(player, 'gamma_guts')) {
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

  applyDamageToPlayer(
    state,
    e.contactDamage,
    def.name.toUpperCase(),
    def.sprites.idle,
    rng,
  );
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
      pr.team = 'enemy';
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
              spawnEnemyProjectile(state, {
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
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(e.aimAngle) * 8,
              y: e.y + Math.sin(e.aimAngle) * 8,
              angle: e.aimAngle + rng.range(-0.08, 0.08),
              speed: e.defId === 'molefish' ? 4.2 : 3.9,
              damage: 2,
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
          // Energetic Desert Maggot wiggle toward player (or last seen corner!)
          const targetAng = aw.hasLos
            ? toPlayer
            : Math.atan2(mem.lastSeenY - e.y, mem.lastSeenX - e.x);
          const wiggle = Math.sin(state.tick * 0.42 + e.id * 1.7) * 0.58;
          const ang = targetAng + wiggle;
          e.facing = Math.cos(ang) >= 0 ? 1 : -1;
          e.aimAngle = ang;
          moveEnemy(state, e, Math.cos(ang) * def.moveSpeed, Math.sin(ang) * def.moveSpeed);
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
    // DESERT: scorpion & gold_scorpion (coil tell -> tight readable venom fan!)
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
          e.aiTimer = 14;
          const count = isGold ? 11 : 7;
          const arc = isGold ? 1.18 : 0.9;
          for (let k = 0; k < count; k++) {
            const frac = count > 1 ? k / (count - 1) - 0.5 : 0;
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(e.aimAngle) * 10,
              y: e.y + Math.sin(e.aimAngle) * 10,
              angle: e.aimAngle + frac * arc,
              speed: isGold ? 4.4 : 3.7,
              damage: 2,
              radius: 4,
              lifeTicks: 90,
              sprite: 'sprScorpionBullet',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isGold ? 48 : 66;
          mem.moveTicks = rng.int(16, 28);
          mem.pauseTicks = 0;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 210, 78, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = isGold ? 12 : 15;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / PIZZA SEWERS: rat, green_rat, turtle (skitter-burst pack rush!)
    // ------------------------------------------------------------------------
    case 'rat': {
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
    // SEWERS: big_rat (bloat tell -> bubbling vomit cluster + splits on death!)
    // ------------------------------------------------------------------------
    case 'big_rat': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 12;
          for (let k = -2; k <= 2; k++) {
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(e.aimAngle) * 11,
              y: e.y + Math.sin(e.aimAngle) * 11,
              angle: e.aimAngle + k * 0.22 + rng.range(-0.06, 0.06),
              speed: rng.range(3.0, 4.1),
              damage: 2,
              radius: 4,
              lifeTicks: 75,
              sprite: 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = rng.int(60, 84);
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 200, 54);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 15;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS: gator & buff_gator (aim tell -> shotgun / flak blast!)
    // ------------------------------------------------------------------------
    case 'gator': {
      const isBuff = e.defId === 'buff_gator';
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 12;
          const pellets = isBuff ? 7 : 5;
          for (let k = 0; k < pellets; k++) {
            const offset = (k / (pellets - 1) - 0.5) * (isBuff ? 0.54 : 0.44) + rng.range(-0.04, 0.04);
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(e.aimAngle) * 9,
              y: e.y + Math.sin(e.aimAngle) * 9,
              angle: e.aimAngle + offset,
              speed: isBuff ? rng.range(4.2, 5.4) : rng.range(3.7, 4.6),
              damage: isBuff ? 2 : 1,
              radius: isBuff ? 5 : 3.5,
              lifeTicks: 72,
              sprite: isBuff ? 'sprEnemyBullet4' : 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = isBuff ? rng.int(56, 74) : rng.int(50, 70);
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
    // SEWERS / SCRAPYARD: ballguy & fireballer (puff tell -> 360 radial burst!)
    // ------------------------------------------------------------------------
    case 'ballguy': {
      const isFire = e.defId === 'fireballer';
      if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 14;
          const ring = isFire ? 6 : 8;
          for (let k = 0; k < ring; k++) {
            const ang = (k / ring) * Math.PI * 2 + (isFire ? toPlayer : 0);
            spawnEnemyProjectile(state, {
              kind: isFire ? 'enemy_flame' : 'enemy_bullet',
              x: e.x + Math.cos(ang) * 8,
              y: e.y + Math.sin(ang) * 8,
              angle: ang,
              speed: isFire ? 4.2 : 3.3,
              damage: 2,
              radius: isFire ? 5 : 4,
              lifeTicks: isFire ? 54 : 85,
              sprite: isFire ? 'sprFireBall' : 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isFire ? 58 : 66;
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
            spawnEnemyProjectile(state, {
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
    // SCRAPYARD / MANSION: sniper (kites close threats + crimson laser lock tell!)
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
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(e.aimAngle) * 10,
            y: e.y + Math.sin(e.aimAngle) * 10,
            angle: e.aimAngle,
            speed: 12.0,
            damage: 3,
            radius: 3.5,
            lifeTicks: 90,
            sprite: 'sprEnemyBullet4',
            sound: def.sounds.fire,
          });
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
          spawnEnemyProjectile(state, {
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
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        moveEnemy(state, e, Math.cos(toPlayer) * def.moveSpeed, Math.sin(toPlayer) * def.moveSpeed);
        if (dist < 32 && e.attackCooldown <= 0) {
          // Real Nuclear Throne Assassin pipe/blade slash (damages player & swats bullets!)
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
    // CAVES: crystal spider (alerted zigzag skitter-dash lunges!)
    // ------------------------------------------------------------------------
    case 'spider': {
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
    // CAVES: laser_crystal & lightning_crystal (sightline laser lock tell!)
    // ------------------------------------------------------------------------
    case 'laser_crystal': {
      const isLightning = e.defId === 'lightning_crystal';
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 10) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          const bolts = isLightning ? 5 : 3;
          for (let b = 0; b < bolts; b++) {
            const spread = (b - (bolts - 1) * 0.5) * (isLightning ? 0.22 : 0.08);
            spawnEnemyProjectile(state, {
              kind: 'enemy_laser',
              x: e.x + Math.cos(e.aimAngle + spread) * 12,
              y: e.y + Math.sin(e.aimAngle + spread) * 12,
              angle: e.aimAngle + spread,
              speed: isLightning ? 13 : 16,
              damage: isLightning ? 3 : 4,
              radius: 4,
              lifeTicks: 38,
              sprite: isLightning ? 'sprLightningBall' : 'sprLaser',
              sound: b === 0 ? def.sounds.fire : undefined,
            });
          }
          e.aiState = 'idle';
          e.attackCooldown = isLightning ? 58 : 70;
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 235, 92);
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
    // FROZEN CITY: snowbot (hurls nearby Cars OR wind-up tell -> ice slide charge!)
    // ------------------------------------------------------------------------
    case 'snowbot': {
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        if (e.aiTimer > 4) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          if (mem.carryingCar) {
            // Hurl grabbed car as an explosive high-impact missile!
            mem.carryingCar = false;
            spawnEnemyProjectile(state, {
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
            e.aiTimer = 22;
            e.targetX = Math.cos(e.aimAngle);
            e.targetY = Math.sin(e.aimAngle);
            emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndSnowBotSlideStart', x: e.x, y: e.y });
          }
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        const mv = moveEnemy(state, e, e.targetX * (def.moveSpeed * 1.6), e.targetY * (def.moveSpeed * 1.6));
        if (state.tick % 2 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'dust',
            x: e.x,
            y: e.y + 4,
            vx: -e.targetX * 0.8,
            vy: -e.targetY * 0.8,
            color: '#d9ecff',
            size: 3,
            life: 7,
          });
        }
        if (e.aiTimer <= 0 || mv.hitWall) {
          if (mv.hitWall) {
            emitEvent(state, { type: 'shake', trauma: 0.14 });
            e.aiState = 'stagger';
            e.aiTimer = 14;
          } else {
            e.aiState = 'idle';
          }
          e.attackCooldown = 38;
        }
      } else if (e.aiState === 'stagger') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed * 0.72, rng, 215, 0);
        if (alerted && e.aiState !== 'alert' && hasLos && dist < 175 && e.attackCooldown <= 0) {
          // Check if an intact Car prop is within grab range!
          let carIdx = -1;
          for (let p = 0; p < state.props.length; p++) {
            const prop = state.props[p]!;
            if (prop.kind !== 'car' || prop.hp <= 0) continue;
            if (Math.hypot(prop.x - e.x, prop.y - e.y) <= 44) {
              carIdx = p;
              break;
            }
          }
          if (carIdx !== -1) {
            state.props.splice(carIdx, 1);
            mem.carryingCar = true;
          }
          e.aiState = 'tell';
          e.aiTimer = 13;
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
            spawnEnemyProjectile(state, {
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
          spawnEnemyProjectile(state, {
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
    // LABS: necromancer (keeps distance behind pack + channels corpse revive!)
    // ------------------------------------------------------------------------
    case 'necromancer': {
      const rt = getAreaRuntime(state);
      const { alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 114, { kiteDist: 92 });
      if (alerted && e.aiState !== 'alert' && e.attackCooldown <= 0 && rt.revivedFreakCount < 16 && state.corpses.length > 0) {
        let bestIdx = -1;
        let bestSq = 155 * 155;
        for (let c = 0; c < state.corpses.length; c++) {
          const corpse = state.corpses[c]!;
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
          state.corpses.splice(bestIdx, 1);
          const revived = createEnemyEntity(state, 'freak', corpse.x, corpse.y, rng);
          const rm = getEnemyMemory(state, revived);
          rm.alerted = true;
          rm.aggroTicks = 135;
          rm.lastSeenX = player.x;
          rm.lastSeenY = player.y;
          rt.revivedFreakCount += 1;
          e.aiState = 'fire';
          e.attackCooldown = 70;
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
            vy: -0.8,
            color: '#c44dff',
            size: 12,
            life: 12,
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
            spawnEnemyProjectile(state, {
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
    // PALACE & VAULT: guardian & crown_guardian (alert -> appear tell -> orb fan!)
    // ------------------------------------------------------------------------
    case 'guardian': {
      const aw = evaluateAwareness(state, e, rng, 235, 80);
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      moveEnemy(state, e, 0, 0);

      if (e.aiState === 'alert') {
        e.aiTimer -= 1;
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = rng.int(45, 75);
        }
        break;
      }
      if (!aw.alerted) break;

      e.aiTimer -= 1;
      if (e.aiTimer <= 0) {
        emitEvent(state, { type: 'sfx', sound: 'sndGuardianDisappear', x: e.x, y: e.y });
        const ang = rng.range(0, Math.PI * 2);
        const rad = rng.range(78, 134);
        const dest = findNearestFloor(state.map, player.x + Math.cos(ang) * rad, player.y + Math.sin(ang) * rad, 10);
        e.x = dest.x;
        e.y = dest.y;
        e.prevX = dest.x;
        e.prevY = dest.y;
        e.aiState = 'tell';
        e.aiTimer = rng.int(75, 110);
        e.attackCooldown = 16;
        emitEvent(state, { type: 'sfx', sound: 'sndGuardianAppear', x: e.x, y: e.y });
      } else if (e.attackCooldown <= 0 && dist < 240) {
        e.aiState = 'fire';
        const orbs = e.defId === 'crown_guardian' ? 7 : 5;
        for (let k = 0; k < orbs; k++) {
          const offset = (k / (orbs - 1) - 0.5) * 0.72;
          spawnEnemyProjectile(state, {
            kind: 'boss_orb',
            x: e.x + Math.cos(toPlayer + offset) * 10,
            y: e.y + Math.sin(toPlayer + offset) * 10,
            angle: toPlayer + offset,
            speed: 3.4,
            damage: 2,
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
    // PALACE: explo_guardian (charge tell -> explosive orb bursts!)
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
          for (let k = -1; k <= 1; k++) {
            spawnEnemyProjectile(state, {
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
          e.attackCooldown = 64;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) e.aiState = 'idle';
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 220, 68);
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 12;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE: guardian_dog (crouch tell -> long leap over walls + orb ring!)
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
          e.attackCooldown = 52;
          emitEvent(state, { type: 'shake', trauma: 0.22 });
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            spawnEnemyProjectile(state, {
              kind: 'boss_orb',
              x: e.x + Math.cos(ang) * 10,
              y: e.y + Math.sin(ang) * 10,
              angle: ang,
              speed: 3.5,
              damage: 2,
              radius: 5,
              lifeTicks: 95,
              sprite: 'sprGuardianBullet',
            });
          }
        }
      } else {
        e.elevated = false;
        e.elevZ = 0;
        const { alerted, hasLos } = stepTacticalSkirmish(state, e, def.moveSpeed * 0.8, rng, 235, 42);
        if (alerted && e.aiState !== 'alert' && (hasLos || dist < 140) && dist < 185 && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 13;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: grunt (tell -> IDPD burst + grenade + combat roll!)
    // ------------------------------------------------------------------------
    case 'idpd_grunt': {
      if (e.aiState === 'tell') {
        e.facing = dx >= 0 ? 1 : -1;
        if (e.aiTimer > 3) e.aimAngle = toPlayer;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          if (e.aiPhase % 3 === 2) {
            spawnEnemyProjectile(state, {
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
              spawnEnemyProjectile(state, {
                kind: 'idpd_bullet',
                x: e.x + Math.cos(e.aimAngle) * 8,
                y: e.y + Math.sin(e.aimAngle) * 8,
                angle: e.aimAngle + s * 0.12,
                speed: 5.0,
                damage: 2,
                radius: 4,
                sprite: 'sprIDPDBullet',
                sound: s === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = 46;
          }
          e.aiPhase += 1;
          e.aiState = 'idle';
        }
      } else {
        const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 78, {
          burstMove: true,
        });
        if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 8;
          e.aimAngle = toPlayer;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: inspector (telekinesis pull -> heavy Popo slug!)
    // ------------------------------------------------------------------------
    case 'idpd_inspector': {
      const { hasLos, alerted } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 225, 86, {
        burstMove: true,
      });
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        if (player.alive && dist < 175 && dist > 18) {
          const mvP = moveCircleWithSlide(
            state.map,
            player.x,
            player.y,
            (-dx / dist) * 1.1,
            (-dy / dist) * 1.1,
            player.radius,
          );
          player.x = mvP.x;
          player.y = mvP.y;
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          spawnEnemyProjectile(state, {
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
          e.attackCooldown = 56;
        }
      } else if (alerted && e.aiState !== 'alert' && hasLos && e.attackCooldown <= 0) {
        e.aiState = 'fire';
        e.aiTimer = 22;
        emitEvent(state, { type: 'sfx', sound: 'sndInspectorStartM', x: e.x, y: e.y });
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: shielder (reflective shield + telegraphed suppression burst!)
    // ------------------------------------------------------------------------
    case 'idpd_shielder': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'shield') {
        e.invulnerable = true;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        reflectShielderProjectiles(state, e);
        if (e.aiTimer <= 0) {
          e.invulnerable = false;
          e.aiState = 'idle';
          e.attackCooldown = 18;
        }
      } else if (e.aiState === 'tell') {
        e.invulnerable = false;
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          for (let b = -2; b <= 2; b++) {
            spawnEnemyProjectile(state, {
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
          e.aiState = 'idle';
          e.attackCooldown = 40;
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
    // IDPD: idpd_van (drives carving walls, stops & deploys IDPD squad!)
    // ------------------------------------------------------------------------
    case 'idpd_van': {
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
          e.aiTimer = 18;
          emitEvent(state, { type: 'sfx', sound: 'sndVanOpen', x: e.x, y: e.y });
          emitEvent(state, { type: 'shake', trauma: 0.3 });
        }
      } else if (e.aiState === 'open') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0, { noSep: true });
        if (e.aiTimer <= 0 && e.aiPhase === 0) {
          e.aiPhase = 1;
          e.aiState = 'parked';
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
      } else {
        e.contactDamage = 0;
        moveEnemy(state, e, 0, 0, { noSep: true });
      }
      break;
    }

    // ------------------------------------------------------------------------
    // MIMICS: mimic & weapon_mimic (wakes on proximity/damage and bites/fires!)
    // ------------------------------------------------------------------------
    case 'mimic': {
      if (e.aiState === 'disguised') {
        moveEnemy(state, e, 0, 0, { noSep: true });
        if (dist <= 64 || e.hp < e.maxHp || e.hurtFlashTicks > 0) {
          mem.alerted = true;
          mem.aggroTicks = 180;
          mem.lastSeenX = player.x;
          mem.lastSeenY = player.y;
          e.aiState = 'tell';
          e.aiTimer = 10;
          e.attackCooldown = 16;
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
        const { hasLos } = stepTacticalSkirmish(state, e, def.moveSpeed, rng, 210, isWeaponMimic ? 58 : 0);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          const count = isWeaponMimic ? 4 : 3;
          for (let k = 0; k < count; k++) {
            const offset = (k / (count - 1) - 0.5) * 0.42;
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + offset,
              speed: isWeaponMimic ? 5.0 : 4.0,
              damage: 2,
              radius: 4,
              sprite: 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = isWeaponMimic ? 38 : 50;
        } else {
          e.aiState = 'awake';
        }
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

function stepProps(state: SimState): void {
  for (let i = 0; i < state.props.length; i++) {
    const prop = state.props[i]!;
    if (prop.hurtFlashTicks > 0) {
      prop.hurtFlashTicks -= 1;
    }
  }
}

function stepScheduledIdpdWaves(state: SimState, rng: SeededRng): void {
  if (state.portal.active || state.phase !== 'playing') return;
  const rt = getAreaRuntime(state);
  if (rt.idpdWavesRemaining <= 0) return;

  rt.idpdWaveTimer -= 1;
  if (rt.idpdWaveTimer > 0) return;

  rt.idpdWavesRemaining -= 1;
  rt.idpdWaveTimer = rng.int(160, 250);
  const includeVan = state.loop > 0 && (rt.idpdWavesRemaining === 0 || rng.chance(0.5));
  spawnIdpdWave(state, rng, { includeVan });
}

/**
 * Steps all hostile enemies, all 5 Bosses, special death payoffs, boss missiles/orbs,
 * destructible prop timers, scheduled IDPD reinforcement waves, and enemy contact damage.
 */
export function stepEntitiesAndAi(
  state: SimState,
  rng: SeededRng,
  opts: StepEntitiesOptions = {},
): void {
  processSpecialDeaths(state, rng);
  stepBossProjectiles(state, rng);
  stepProps(state);

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
  stepScheduledIdpdWaves(state, rng);
}
