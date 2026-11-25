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
  spawnIdpdWave,
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

function moveEnemy(
  state: SimState,
  e: EnemyEntity,
  dx: number,
  dy: number,
  opts: { ignoreWalls?: boolean; carveWalls?: boolean } = {},
): { hitWall: boolean } {
  const snareMult = e.snaredTicks > 0 ? 0.12 : 1.0;
  const totalDx = (dx + e.vx) * snareMult;
  const totalDy = (dy + e.vy) * snareMult;

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

function pickWanderTarget(e: EnemyEntity, rng: SeededRng, dist: number = 40): void {
  const ang = rng.range(0, Math.PI * 2);
  e.targetX = e.x + Math.cos(ang) * dist;
  e.targetY = e.y + Math.sin(ang) * dist;
}

function stepWanderOrChase(
  state: SimState,
  e: EnemyEntity,
  speed: number,
  rng: SeededRng,
  aggroRange: number,
  keepDist: number = 0,
): { dist: number; toPlayer: number; hasLos: boolean } {
  const player = state.player;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const hasLos = dist <= aggroRange && hasLineOfSight(state.map, e.x, e.y, player.x, player.y);

  e.aimAngle = toPlayer;
  e.facing = dx >= 0 ? 1 : -1;

  if (hasLos) {
    if (keepDist > 0 && dist < keepDist * 0.72) {
      moveEnemy(state, e, -Math.cos(toPlayer) * speed * 0.85, -Math.sin(toPlayer) * speed * 0.85);
    } else if (dist > keepDist) {
      moveEnemy(state, e, Math.cos(toPlayer) * speed, Math.sin(toPlayer) * speed);
    } else {
      // Strafe around player
      const strafeAng = toPlayer + (e.aiPhase % 2 === 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
      moveEnemy(state, e, Math.cos(strafeAng) * speed * 0.65, Math.sin(strafeAng) * speed * 0.65);
    }
  } else {
    e.aiTimer -= 1;
    const tdx = e.targetX - e.x;
    const tdy = e.targetY - e.y;
    const tDist = Math.hypot(tdx, tdy);
    if (e.aiTimer <= 0 || tDist < 8) {
      pickWanderTarget(e, rng, 56);
      e.aiTimer = rng.int(24, 52);
      e.aiPhase += 1;
    } else {
      const mv = moveEnemy(state, e, (tdx / tDist) * speed * 0.75, (tdy / tDist) * speed * 0.75);
      if (mv.hitWall) {
        pickWanderTarget(e, rng, 48);
      }
    }
  }

  return { dist, toPlayer, hasLos };
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
 * Executes special death effects when tracked special enemies or bosses die
 * (maggot_nest burst, big_rat split, snow_tank ring, explo_freak/explo_guardian blast,
 * idpd_van car explosion, and all 5 bosses).
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
        createEnemyEntity(state, 'maggot', x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, rng);
      }
      break;
    }

    case 'big_rat': {
      const spawnCount = Math.min(3, Math.max(0, 14 - countByDefId(state, 'green_rat')));
      for (let i = 0; i < spawnCount; i++) {
        const ang = (i / Math.max(1, spawnCount)) * Math.PI * 2;
        createEnemyEntity(state, 'green_rat', x + Math.cos(ang) * 10, y + Math.sin(ang) * 10, rng);
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
          speed: defId === 'gold_snow_tank' ? 4.8 : 4.2,
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

  // 1. Check tracked specials that died since last tick
  const died: Array<{ defId: string; bossId?: BossId; x: number; y: number }> = [];
  for (const [id, rec] of rt.trackedSpecials.entries()) {
    if (!aliveIds.has(id)) {
      died.push({ defId: rec.defId, bossId: rec.bossId, x: rec.x, y: rec.y });
      rt.trackedSpecials.delete(id);
    }
  }

  // Mark matching freshly spawned corpses as processed so the backup net doesn't double-fire
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
  if (e.aiState === 'sleep' || e.aiState === 'feign' || e.aiState === 'disguised') return;

  if (!circleOverlap(player.x, player.y, player.radius, e.x, e.y, e.radius)) return;

  // Gamma Guts: damages touching enemies first; if Gamma Guts kills them, player takes ZERO contact damage!
  if (hasMutation(player, 'gamma_guts')) {
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const killed = applyDamageToEnemy(
      state,
      e,
      6,
      (dx / dist) * 4,
      (dy / dist) * 4,
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
 * Steps a single hostile non-boss enemy across all 30 archetypes (covering all 45 non-boss defs).
 */
function stepHostileEnemy(
  state: SimState,
  e: EnemyEntity,
  def: EnemyDef,
  rng: SeededRng,
): void {
  const player = state.player;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);

  if (e.attackCooldown > 0) e.attackCooldown -= 1;

  switch (def.aiArchetype) {
    // ------------------------------------------------------------------------
    // DESERT: bandit, molefish, jungle_bandit
    // ------------------------------------------------------------------------
    case 'bandit': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 220, 68);
      if (hasLos && e.attackCooldown <= 0) {
        if (e.defId === 'jungle_bandit') {
          for (let s = -1; s <= 1; s++) {
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + s * 0.18 + rng.range(-0.04, 0.04),
              speed: 4.6,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: s === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = rng.int(42, 60);
        } else if (e.defId === 'molefish') {
          for (let s = 0; s < 2; s++) {
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + (s - 0.5) * 0.14,
              speed: 4.4,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: s === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = rng.int(38, 56);
        } else {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 8,
            y: e.y + Math.sin(toPlayer) * 8,
            angle: toPlayer + rng.range(-0.1, 0.1),
            speed: 4.1,
            damage: 2,
            sprite: 'sprEnemyBullet1',
            sound: def.sounds.fire,
          });
          e.attackCooldown = rng.int(44, 68);
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: maggot & big_maggot (burrow + charge!)
    // ------------------------------------------------------------------------
    case 'maggot': {
      if (e.defId === 'big_maggot') {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        if (e.aiState === 'tell') {
          // Burrowed underground: invulnerable briefly, surges rapidly toward player!
          e.invulnerable = true;
          e.aiTimer -= 1;
          moveEnemy(state, e, Math.cos(toPlayer) * (def.moveSpeed * 1.45), Math.sin(toPlayer) * (def.moveSpeed * 1.45));
          if (e.aiTimer <= 0 || dist < 32) {
            e.invulnerable = false;
            e.aiState = 'charge';
            e.aiTimer = 26;
          }
        } else if (e.aiState === 'charge') {
          e.invulnerable = false;
          e.aiTimer -= 1;
          moveEnemy(state, e, Math.cos(toPlayer) * (def.moveSpeed * 1.25), Math.sin(toPlayer) * (def.moveSpeed * 1.25));
          if (e.aiTimer <= 0) {
            e.aiState = 'idle';
            e.attackCooldown = 48;
          }
        } else {
          e.invulnerable = false;
          stepWanderOrChase(state, e, def.moveSpeed, rng, 190, 0);
          if (dist < 170 && e.attackCooldown <= 0) {
            e.aiState = 'tell';
            e.aiTimer = 24;
          }
        }
      } else {
        // Classic chaotic Desert Maggot wiggle toward player
        const wiggle = Math.sin(state.tick * 0.4 + e.id) * 0.6;
        const ang = dist < 170 ? toPlayer + wiggle : toPlayer + rng.range(-1.1, 1.1);
        e.facing = Math.cos(ang) >= 0 ? 1 : -1;
        e.aimAngle = ang;
        moveEnemy(state, e, Math.cos(ang) * def.moveSpeed, Math.sin(ang) * def.moveSpeed);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: maggot_nest (stationary, spawns maggots, bursts on death!)
    // ------------------------------------------------------------------------
    case 'maggot_nest': {
      moveEnemy(state, e, 0, 0);
      e.aiState = e.attackCooldown <= 12 ? 'tell' : 'idle';
      if (e.attackCooldown <= 0 && dist < 240 && countByDefId(state, 'maggot') < 12) {
        const ang = rng.range(0, Math.PI * 2);
        createEnemyEntity(state, 'maggot', e.x + Math.cos(ang) * 12, e.y + Math.sin(ang) * 12, rng);
        e.attackCooldown = rng.int(70, 105);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // DESERT: scorpion & gold_scorpion (bullet fan)
    // ------------------------------------------------------------------------
    case 'scorpion': {
      const isGold = e.defId === 'gold_scorpion';
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isGold ? 46 : 62;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 220, 74);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 14;
          const count = isGold ? 11 : 7;
          const arc = isGold ? 1.15 : 0.85;
          for (let k = 0; k < count; k++) {
            const frac = count > 1 ? k / (count - 1) - 0.5 : 0;
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 10,
              y: e.y + Math.sin(toPlayer) * 10,
              angle: toPlayer + frac * arc,
              speed: isGold ? 4.8 : 4.0,
              damage: 2,
              radius: 4,
              lifeTicks: 90,
              sprite: 'sprScorpionBullet',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / PIZZA SEWERS: rat, green_rat, turtle
    // ------------------------------------------------------------------------
    case 'rat': {
      stepWanderOrChase(state, e, def.moveSpeed, rng, 210, 0);
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS: big_rat (vomit burst + splits on death!)
    // ------------------------------------------------------------------------
    case 'big_rat': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 210, 48);
      if (hasLos && e.attackCooldown <= 0) {
        e.aiState = 'fire';
        for (let k = -2; k <= 2; k++) {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 11,
            y: e.y + Math.sin(toPlayer) * 11,
            angle: toPlayer + k * 0.2 + rng.range(-0.05, 0.05),
            speed: 3.6,
            damage: 2,
            radius: 4,
            lifeTicks: 75,
            sprite: 'sprEnemyBullet1',
            sound: k === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = rng.int(58, 82);
      } else {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS: gator & buff_gator (shotgun / flak volley)
    // ------------------------------------------------------------------------
    case 'gator': {
      const isBuff = e.defId === 'buff_gator';
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 220, 72);
      if (hasLos && e.attackCooldown <= 0) {
        const pellets = isBuff ? 7 : 5;
        for (let k = 0; k < pellets; k++) {
          const offset = (k / (pellets - 1) - 0.5) * (isBuff ? 0.52 : 0.42) + rng.range(-0.04, 0.04);
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 9,
            y: e.y + Math.sin(toPlayer) * 9,
            angle: toPlayer + offset,
            speed: isBuff ? rng.range(4.4, 5.8) : rng.range(3.9, 4.8),
            damage: isBuff ? 2 : 1,
            radius: isBuff ? 5 : 3.5,
            lifeTicks: 75,
            sprite: isBuff ? 'sprEnemyBullet4' : 'sprEnemyBullet1',
            sound: k === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = isBuff ? rng.int(54, 72) : rng.int(48, 68);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SEWERS / SCRAPYARD: ballguy (pop-up 360 burst) & fireballer
    // ------------------------------------------------------------------------
    case 'ballguy': {
      const isFire = e.defId === 'fireballer';
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isFire ? 56 : 64;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 200, 56);
        if ((hasLos || dist < 120) && e.attackCooldown <= 0) {
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
              speed: isFire ? 4.4 : 3.4,
              damage: 2,
              radius: isFire ? 5 : 4,
              lifeTicks: isFire ? 54 : 85,
              sprite: isFire ? 'sprFireBall' : 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD: raven (flies over walls elevated=true then lands & fires!)
    // ------------------------------------------------------------------------
    case 'raven': {
      if (e.aiState === 'fly') {
        e.elevated = true;
        e.elevZ = Math.min(22, (e.elevZ ?? 6) + 2);
        e.aiTimer -= 1;
        const tdx = e.targetX - e.x;
        const tdy = e.targetY - e.y;
        const tDist = Math.hypot(tdx, tdy) || 1;
        e.facing = tdx >= 0 ? 1 : -1;
        moveEnemy(state, e, (tdx / tDist) * 3.4, (tdy / tDist) * 3.4, { ignoreWalls: true });
        if (e.aiTimer <= 0 || tDist < 12) {
          const safe = findNearestFloor(state.map, e.x, e.y, 12);
          e.x = safe.x;
          e.y = safe.y;
          e.elevated = false;
          e.elevZ = 0;
          e.aiState = 'idle';
          e.attackCooldown = 14;
          emitEvent(state, { type: 'sfx', sound: 'sndRavenLand', x: e.x, y: e.y });
        }
      } else {
        e.elevated = false;
        e.elevZ = 0;
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 210, 72);
        if (hasLos && e.attackCooldown <= 0) {
          for (let b = -1; b <= 1; b++) {
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + b * 0.14,
              speed: 4.5,
              damage: 2,
              sprite: 'sprEnemyBullet1',
              sound: b === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = 50;
          // Take flight over walls after shooting!
          if (rng.chance(0.55)) {
            const flankAng = toPlayer + rng.range(-1.4, 1.4);
            const dest = findNearestFloor(
              state.map,
              player.x - Math.cos(flankAng) * 76,
              player.y - Math.sin(flankAng) * 76,
              10,
            );
            e.targetX = dest.x;
            e.targetY = dest.y;
            e.aiState = 'fly';
            e.aiTimer = 32;
            e.elevated = true;
            e.elevZ = 8;
            emitEvent(state, { type: 'sfx', sound: 'sndRavenLift', x: e.x, y: e.y });
          }
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD / MANSION: sniper (aim tell + high-speed shot!)
    // ------------------------------------------------------------------------
    case 'sniper': {
      e.facing = dx >= 0 ? 1 : -1;
      if (e.aiState === 'tell') {
        // Track early, lock final 8 ticks so player can dodge!
        if (e.aiTimer > 8) {
          e.aimAngle = toPlayer;
        }
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(e.aimAngle) * 10,
            y: e.y + Math.sin(e.aimAngle) * 10,
            angle: e.aimAngle,
            speed: 11.5,
            damage: 3,
            radius: 3.5,
            lifeTicks: 90,
            sprite: 'sprEnemyBullet4',
            sound: def.sounds.fire,
          });
          e.aiState = 'idle';
          e.attackCooldown = 66;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 280, 125);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 24;
          e.aimAngle = toPlayer;
          emitEvent(state, { type: 'sfx', sound: 'sndSniperTarget', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD: salamander (flame stream!)
    // ------------------------------------------------------------------------
    case 'salamander': {
      if (e.aiState === 'fire') {
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
            speed: rng.range(4.2, 5.4),
            damage: 1,
            radius: 5,
            lifeTicks: 32,
            sprite: 'sprSalamanderBullet',
            sound: e.aiTimer === 16 ? def.sounds.fire : undefined,
          });
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 58;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 180, 62);
        if (hasLos && dist < 135 && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 18;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // SCRAPYARD / JUNGLE: assassin & jungle_assassin (feigns corpse then rushes!)
    // ------------------------------------------------------------------------
    case 'assassin': {
      if (e.aiState === 'feign') {
        moveEnemy(state, e, 0, 0);
        if (dist <= 96 || e.hp < e.maxHp || e.hurtFlashTicks > 0) {
          e.aiState = 'tell';
          e.aiTimer = 10;
          emitEvent(state, { type: 'sfx', sound: 'sndAssassinGetUp', x: e.x, y: e.y });
        }
      } else if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        e.facing = dx >= 0 ? 1 : -1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'rush';
        }
      } else {
        e.facing = dx >= 0 ? 1 : -1;
        e.aimAngle = toPlayer;
        moveEnemy(state, e, Math.cos(toPlayer) * def.moveSpeed, Math.sin(toPlayer) * def.moveSpeed);
        if (dist < 28 && e.attackCooldown <= 0) {
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndAssassinAttack', x: e.x, y: e.y });
          e.attackCooldown = 26;
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // CAVES: crystal spider (burst dash!)
    // ------------------------------------------------------------------------
    case 'spider': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      e.aiTimer -= 1;
      if (e.aiState === 'dash') {
        const dashSpd = def.moveSpeed * 1.45;
        const mv = moveEnemy(state, e, e.targetX * dashSpd, e.targetY * dashSpd);
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.aiState = 'idle';
          e.aiTimer = rng.int(12, 22);
        }
      } else {
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          const ang = dist < 210 ? toPlayer + rng.range(-0.35, 0.35) : rng.range(0, Math.PI * 2);
          e.targetX = Math.cos(ang);
          e.targetY = Math.sin(ang);
          e.aiState = 'dash';
          e.aiTimer = rng.int(10, 16);
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // CAVES: laser_crystal & lightning_crystal (telegraphed laser / lightning!)
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
          e.attackCooldown = isLightning ? 56 : 68;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 240, 88);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 24;
          e.aimAngle = toPlayer;
          emitEvent(state, { type: 'sfx', sound: 'sndLaserCrystalCharge', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: snowbot (aggressive charge!)
    // ------------------------------------------------------------------------
    case 'snowbot': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        const mv = moveEnemy(state, e, e.targetX * (def.moveSpeed * 1.5), e.targetY * (def.moveSpeed * 1.5));
        if (e.aiTimer <= 0 || mv.hitWall) {
          e.aiState = 'idle';
          e.attackCooldown = 34;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed * 0.7, rng, 220, 0);
        if (hasLos && dist < 170 && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          e.aiTimer = 24;
          e.targetX = Math.cos(toPlayer);
          e.targetY = Math.sin(toPlayer);
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndSnowBotSlideStart', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: wolf (rapid spread + roll!)
    // ------------------------------------------------------------------------
    case 'wolf': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 220, 74);
      if (hasLos && e.attackCooldown <= 0) {
        for (let s = -1; s <= 1; s++) {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 8,
            y: e.y + Math.sin(toPlayer) * 8,
            angle: toPlayer + s * 0.16,
            speed: 5.0,
            damage: 2,
            sprite: 'sprEnemyBullet1',
            sound: s === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = rng.int(34, 48);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // FROZEN CITY: snow_tank & gold_snow_tank (minigun bursts + death spread!)
    // ------------------------------------------------------------------------
    case 'snow_tank': {
      const isGold = e.defId === 'gold_snow_tank';
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'tell') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0) {
          e.aiState = 'fire';
          e.aiTimer = isGold ? 24 : 18;
        }
      } else if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer % 2 === 0) {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 13,
            y: e.y + Math.sin(toPlayer) * 13,
            angle: toPlayer + rng.range(-0.18, 0.18),
            speed: isGold ? 5.6 : 4.9,
            damage: 2,
            radius: 4,
            sprite: 'sprEnemyBullet1',
            sound: e.aiTimer % 4 === 0 ? def.sounds.fire : undefined,
          });
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = isGold ? 46 : 62;
        }
      } else {
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 230, 88);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'tell';
          e.aiTimer = 14;
          emitEvent(state, { type: 'sfx', sound: 'sndSnowTankPreShoot', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: freak (relentless swarm pursuer)
    // ------------------------------------------------------------------------
    case 'freak': {
      stepWanderOrChase(state, e, def.moveSpeed, rng, 250, 0);
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: rhino_freak (wall-smashing charge!)
    // ------------------------------------------------------------------------
    case 'rhino_freak': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'charge') {
        e.aiTimer -= 1;
        moveEnemy(
          state,
          e,
          e.targetX * (def.moveSpeed * 1.45),
          e.targetY * (def.moveSpeed * 1.45),
          { carveWalls: true },
        );
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.attackCooldown = 44;
        }
      } else {
        stepWanderOrChase(state, e, def.moveSpeed, rng, 240, 0);
        if (dist < 170 && e.attackCooldown <= 0) {
          e.aiState = 'charge';
          e.aiTimer = 26;
          e.targetX = Math.cos(toPlayer);
          e.targetY = Math.sin(toPlayer);
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndRhinoFreakMelee', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: explo_freak (sprints at player + explodes on death!)
    // ------------------------------------------------------------------------
    case 'explo_freak': {
      stepWanderOrChase(state, e, def.moveSpeed, rng, 240, 0);
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: necromancer (revives nearby corpses into Freaks!)
    // ------------------------------------------------------------------------
    case 'necromancer': {
      const rt = getAreaRuntime(state);
      stepWanderOrChase(state, e, def.moveSpeed, rng, 230, 108);
      if (e.attackCooldown <= 0 && rt.revivedFreakCount < 16 && state.corpses.length > 0) {
        // Find nearest corpse within 150px
        let bestIdx = -1;
        let bestSq = 150 * 150;
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
          createEnemyEntity(state, 'freak', corpse.x, corpse.y, rng);
          rt.revivedFreakCount += 1;
          e.aiState = 'fire';
          e.attackCooldown = 68;
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
      } else {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // LABS: turret (stationary burst shooter)
    // ------------------------------------------------------------------------
    case 'turret': {
      moveEnemy(state, e, 0, 0);
      e.aimAngle = toPlayer;
      e.facing = dx >= 0 ? 1 : -1;
      const hasLos = dist <= 230 && hasLineOfSight(state.map, e.x, e.y, player.x, player.y);
      if (hasLos && e.attackCooldown <= 0) {
        e.aiState = 'fire';
        for (let s = -1; s <= 1; s++) {
          spawnEnemyProjectile(state, {
            x: e.x + Math.cos(toPlayer) * 9,
            y: e.y + Math.sin(toPlayer) * 9,
            angle: toPlayer + s * 0.14,
            speed: 5.2,
            damage: 2,
            sprite: 'sprEnemyBullet1',
            sound: s === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = 48;
      } else {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE & VAULT: guardian & crown_guardian (teleport + orb bursts!)
    // ------------------------------------------------------------------------
    case 'guardian': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      e.aiTimer -= 1;
      moveEnemy(state, e, 0, 0);

      if (e.aiTimer <= 0) {
        // Teleport to flanking walkable floor around player
        emitEvent(state, { type: 'sfx', sound: 'sndGuardianDisappear', x: e.x, y: e.y });
        const ang = rng.range(0, Math.PI * 2);
        const rad = rng.range(72, 130);
        const dest = findNearestFloor(state.map, player.x + Math.cos(ang) * rad, player.y + Math.sin(ang) * rad, 10);
        e.x = dest.x;
        e.y = dest.y;
        e.prevX = dest.x;
        e.prevY = dest.y;
        e.aiState = 'tell';
        e.aiTimer = rng.int(75, 110);
        e.attackCooldown = 14;
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
        e.attackCooldown = rng.int(52, 74);
      } else if (e.attackCooldown > 10) {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE: explo_guardian (orb bursts + death explosion!)
    // ------------------------------------------------------------------------
    case 'explo_guardian': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 220, 64);
      if (hasLos && e.attackCooldown <= 0) {
        e.aiState = 'fire';
        for (let k = -1; k <= 1; k++) {
          spawnEnemyProjectile(state, {
            kind: 'boss_orb',
            x: e.x + Math.cos(toPlayer) * 10,
            y: e.y + Math.sin(toPlayer) * 10,
            angle: toPlayer + k * 0.24,
            speed: 3.8,
            damage: 3,
            radius: 5,
            explosionRadius: 20,
            lifeTicks: 90,
            sprite: 'sprExploGuardianBullet',
            sound: k === 0 ? def.sounds.fire : undefined,
          });
        }
        e.attackCooldown = 62;
      } else {
        e.aiState = 'idle';
      }
      break;
    }

    // ------------------------------------------------------------------------
    // PALACE: guardian_dog (long leaps + orb bursts!)
    // ------------------------------------------------------------------------
    case 'guardian_dog': {
      e.facing = dx >= 0 ? 1 : -1;
      e.aimAngle = toPlayer;
      if (e.aiState === 'leap') {
        e.aiTimer -= 1;
        e.elevated = true;
        const frac = Math.max(0, Math.min(1, e.aiTimer / 22));
        e.elevZ = Math.sin(frac * Math.PI) * 28;
        moveEnemy(state, e, e.targetX * 4.4, e.targetY * 4.4, { ignoreWalls: true });
        if (e.aiTimer <= 0) {
          const safe = findNearestFloor(state.map, e.x, e.y, 10);
          e.x = safe.x;
          e.y = safe.y;
          e.elevated = false;
          e.elevZ = 0;
          e.aiState = 'idle';
          e.attackCooldown = 50;
          emitEvent(state, { type: 'shake', trauma: 0.22 });
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            spawnEnemyProjectile(state, {
              kind: 'boss_orb',
              x: e.x + Math.cos(ang) * 10,
              y: e.y + Math.sin(ang) * 10,
              angle: ang,
              speed: 3.6,
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
        stepWanderOrChase(state, e, def.moveSpeed * 0.8, rng, 240, 40);
        if (dist < 185 && e.attackCooldown <= 0) {
          e.aiState = 'leap';
          e.aiTimer = 22;
          e.targetX = Math.cos(toPlayer);
          e.targetY = Math.sin(toPlayer);
          emitEvent(state, { type: 'sfx', sound: def.sounds.fire ?? 'sndDogGuardianJump', x: e.x, y: e.y });
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: grunt (IDPD burst + grenade!)
    // ------------------------------------------------------------------------
    case 'idpd_grunt': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 230, 76);
      if (hasLos && e.attackCooldown <= 0) {
        if (e.aiPhase % 3 === 2) {
          // Throw IDPD grenade!
          spawnEnemyProjectile(state, {
            kind: 'grenade',
            x: e.x + Math.cos(toPlayer) * 8,
            y: e.y + Math.sin(toPlayer) * 8,
            angle: toPlayer,
            speed: 5.5,
            damage: 4,
            radius: 4,
            bounce: 1,
            explosionRadius: 28,
            lifeTicks: 34,
            sprite: 'sprPopoNade',
            sound: 'sndGruntThrowNadeM',
          });
          e.attackCooldown = 64;
        } else {
          for (let s = -1; s <= 1; s++) {
            spawnEnemyProjectile(state, {
              kind: 'idpd_bullet',
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + s * 0.12,
              speed: 5.2,
              damage: 2,
              radius: 4,
              sprite: 'sprIDPDBullet',
              sound: s === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = 44;
        }
        e.aiPhase += 1;
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: inspector (telekinesis pull + slugger!)
    // ------------------------------------------------------------------------
    case 'idpd_inspector': {
      const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 230, 84);
      if (e.aiState === 'fire') {
        e.aiTimer -= 1;
        // Pull player gently with blue IDPD telekinesis!
        if (player.alive && dist < 175 && dist > 18) {
          const mvP = moveCircleWithSlide(
            state.map,
            player.x,
            player.y,
            (-dx / dist) * 1.15,
            (-dy / dist) * 1.15,
            player.radius,
          );
          player.x = mvP.x;
          player.y = mvP.y;
        }
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          // Blast heavy blue IDPD slugger!
          spawnEnemyProjectile(state, {
            kind: 'idpd_bullet',
            x: e.x + Math.cos(toPlayer) * 9,
            y: e.y + Math.sin(toPlayer) * 9,
            angle: toPlayer,
            speed: 7.4,
            damage: 3,
            radius: 5,
            lifeTicks: 85,
            sprite: 'sprPopoSlug',
            sound: def.sounds.fire,
          });
          e.attackCooldown = 54;
        }
      } else if (hasLos && e.attackCooldown <= 0) {
        e.aiState = 'fire';
        e.aiTimer = 22;
        emitEvent(state, { type: 'sfx', sound: 'sndInspectorStartM', x: e.x, y: e.y });
      }
      break;
    }

    // ------------------------------------------------------------------------
    // IDPD: shielder (periodic reflective shield + rapid fire!)
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
          e.attackCooldown = 20;
        }
      } else {
        e.invulnerable = false;
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 230, 80);
        if (hasLos && e.attackCooldown <= 0) {
          if (e.aiPhase % 2 === 1) {
            e.aiState = 'shield';
            e.aiTimer = 42;
            e.invulnerable = true;
            emitEvent(state, { type: 'sfx', sound: 'sndShielderShieldM', x: e.x, y: e.y });
          } else {
            for (let b = -2; b <= 2; b++) {
              spawnEnemyProjectile(state, {
                kind: 'idpd_bullet',
                x: e.x + Math.cos(toPlayer) * 10,
                y: e.y + Math.sin(toPlayer) * 10,
                angle: toPlayer + b * 0.14,
                speed: 5.4,
                damage: 2,
                radius: 4,
                sprite: 'sprIDPDBullet',
                sound: b === 0 ? def.sounds.fire : undefined,
              });
            }
            e.attackCooldown = 38;
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
          { carveWalls: true },
        );
        if (e.aiTimer <= 0 || dist < 44) {
          e.aiState = 'open';
          e.aiTimer = 18;
          emitEvent(state, { type: 'sfx', sound: 'sndVanOpen', x: e.x, y: e.y });
          emitEvent(state, { type: 'shake', trauma: 0.3 });
        }
      } else if (e.aiState === 'open') {
        e.aiTimer -= 1;
        moveEnemy(state, e, 0, 0);
        if (e.aiTimer <= 0 && e.aiPhase === 0) {
          e.aiPhase = 1;
          e.aiState = 'parked';
          // Deploy 3-unit IDPD squad!
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
        // Parked van: destructible chassis (no contact crush when parked!)
        e.contactDamage = 0;
        moveEnemy(state, e, 0, 0);
      }
      break;
    }

    // ------------------------------------------------------------------------
    // MIMICS: mimic & weapon_mimic (wakes on proximity/damage and bites/fires!)
    // ------------------------------------------------------------------------
    case 'mimic': {
      if (e.aiState === 'disguised') {
        moveEnemy(state, e, 0, 0);
        if (dist <= 64 || e.hp < e.maxHp || e.hurtFlashTicks > 0) {
          e.aiState = 'awake';
          e.attackCooldown = 14;
          emitEvent(state, { type: 'sfx', sound: 'sndMimicSlurp', x: e.x, y: e.y });
        }
      } else {
        const isWeaponMimic = e.defId === 'weapon_mimic';
        const { hasLos } = stepWanderOrChase(state, e, def.moveSpeed, rng, 210, isWeaponMimic ? 58 : 0);
        if (hasLos && e.attackCooldown <= 0) {
          e.aiState = 'fire';
          const count = isWeaponMimic ? 4 : 3;
          for (let k = 0; k < count; k++) {
            const offset = (k / (count - 1) - 0.5) * 0.42;
            spawnEnemyProjectile(state, {
              x: e.x + Math.cos(toPlayer) * 8,
              y: e.y + Math.sin(toPlayer) * 8,
              angle: toPlayer + offset,
              speed: isWeaponMimic ? 5.2 : 4.2,
              damage: 2,
              radius: 4,
              sprite: 'sprEnemyBullet1',
              sound: k === 0 ? def.sounds.fire : undefined,
            });
          }
          e.attackCooldown = isWeaponMimic ? 36 : 48;
        } else {
          e.aiState = 'awake';
        }
      }
      break;
    }

    default: {
      stepWanderOrChase(state, e, def.moveSpeed, rng, 200, 0);
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
 * Steps all hostile enemies, all 5 Bosses, special death payoffs, boss missiles,
 * destructible prop timers, scheduled IDPD reinforcement waves, and enemy contact damage.
 */
export function stepEntitiesAndAi(
  state: SimState,
  rng: SeededRng,
  opts: StepEntitiesOptions = {},
): void {
  // 1. Detect & resolve deaths of special enemies / bosses that occurred since last tick
  processSpecialDeaths(state, rng);

  // 2. Step boss-specific projectiles (homing destructible Big Dog missiles)
  stepBossProjectiles(state, rng);

  // 3. Step destructible props (hurtFlash decay)
  stepProps(state);

  // 4. Optional standalone stepping of friendly allies (skipped when stepPlayerAndCombat already ran)
  if (opts.stepFriendlies) {
    stepStandaloneFriendlies(state, rng);
  }

  // 5. Step every living hostile enemy & boss (iterate over snapshot since spawns/deaths mutate list)
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

    // Contact damage against player (with Gamma Guts priority!)
    if (e.hp > 0) {
      resolveEnemyContactDamage(state, e, def, rng);
    }
  }

  // 6. Catch any deaths caused during this AI pass (e.g. Gamma Guts or Throne generator shock)
  processSpecialDeaths(state, rng);

  // 7. Scheduled Loop / Rogue / high-heat IDPD Portal & Van waves
  stepScheduledIdpdWaves(state, rng);
}
