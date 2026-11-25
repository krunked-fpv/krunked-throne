import {
  TILE_SIZE,
  TileType,
  type AreaCode,
  type BossId,
  type EnemyEntity,
  type ProjectileEntity,
  type PropEntity,
  type SimState,
} from '@/contracts';
import { AMMO_PICKUP_AMOUNT, ENEMIES, getAreaDef, getNextAreaTransition } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  circleOverlap,
  emitEvent,
  findNearestFloor,
  getTile,
  hasLineOfSight,
  moveCircleWithSlide,
  segmentCircleHit,
  worldToTile,
} from '@/sim/core';
import {
  NON_MELEE_AMMO_TYPES,
  applyDamageToEnemy,
  damageProp,
  spawnCorpse,
  spawnEnemyProjectile,
  spawnExplosion,
  spawnPickup,
  type SpawnEnemyProjectileOptions,
} from '@/sim/combat';
import {
  BOSS_META,
  createEnemyEntity,
  getAreaRuntime,
  spawnIdpdWave,
} from '@/sim/entities';

function fireBossProjectile(
  state: SimState,
  bossId: BossId,
  opts: SpawnEnemyProjectileOptions,
): ProjectileEntity {
  const def = ENEMIES[bossId]!;
  const proj = spawnEnemyProjectile(state, opts);
  proj.sourceCause = def.name.toUpperCase();
  proj.sourceSprite = def.sprites.idle;
  return proj;
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function clampInsideBorder(
  state: SimState,
  x: number,
  y: number,
  padTiles: number = 2.5,
): { x: number; y: number } {
  const ts = state.map.tileSize || TILE_SIZE;
  const minX = ts * padTiles;
  const maxX = Math.max(minX, (state.map.width - padTiles) * ts);
  const minY = ts * padTiles;
  const maxY = Math.max(minY, (state.map.height - padTiles) * ts);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

function moveBossBody(
  state: SimState,
  boss: EnemyEntity,
  dx: number,
  dy: number,
  opts: { carveWalls?: boolean; flying?: boolean } = {},
): { hitWall: boolean } {
  const snareScale = boss.snaredTicks > 0 ? 0.35 : 1.0;
  const stepX = (dx + boss.vx) * snareScale;
  const stepY = (dy + boss.vy) * snareScale;

  boss.vx *= 0.72;
  boss.vy *= 0.72;
  if (Math.abs(boss.vx) < 0.02) boss.vx = 0;
  if (Math.abs(boss.vy) < 0.02) boss.vy = 0;

  if (opts.flying) {
    const clamped = clampInsideBorder(state, boss.x + stepX, boss.y + stepY, 2.5);
    const hitWall = clamped.x !== boss.x + stepX || clamped.y !== boss.y + stepY;
    boss.x = clamped.x;
    boss.y = clamped.y;
    return { hitWall };
  }

  if (opts.carveWalls && (Math.abs(stepX) > 0.1 || Math.abs(stepY) > 0.1)) {
    const carved = carveCircle(
      state.map,
      boss.x + stepX,
      boss.y + stepY,
      boss.radius + 4,
      true,
    );
    if (carved > 0) {
      emitEvent(state, { type: 'shake', trauma: 0.14 });
    }
  }

  const mv = moveCircleWithSlide(state.map, boss.x, boss.y, stepX, stepY, boss.radius);
  boss.x = mv.x;
  boss.y = mv.y;
  return { hitWall: mv.hitWall };
}

function countBossSummonsAlive(state: SimState): number {
  const rt = getAreaRuntime(state);
  let count = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hp > 0 && rt.bossSummonIds.has(e.id)) {
      count += 1;
    }
  }
  return count;
}

function clearBossSummonsAndEnemyBullets(state: SimState, clearAllBullets: boolean): void {
  const rt = getAreaRuntime(state);
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i]!;
    if (!e.friendly && rt.bossSummonIds.has(e.id)) {
      state.enemies.splice(i, 1);
    }
  }
  rt.bossSummonIds.clear();

  if (clearAllBullets) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      if (state.projectiles[i]!.team === 'enemy') {
        state.projectiles.splice(i, 1);
      }
    }
  }
}

export function openBossPortal(
  state: SimState,
  anchorX: number,
  anchorY: number,
  targetArea: AreaCode,
  nextLoop: number,
  bannerText: string,
  forceOverride: boolean = false,
): void {
  if (state.portal.entered) return;
  if (state.portal.active && !forceOverride) return;
  const safe = findNearestFloor(state.map, anchorX, anchorY, 12);
  state.portal.active = true;
  state.portal.x = safe.x;
  state.portal.y = safe.y;
  state.portal.timer = 0;
  state.portal.entered = false;
  state.portal.enterTicks = 0;
  state.portal.carved = false;
  state.portal.targetArea = targetArea;
  state.portal.nextLoop = nextLoop;

  emitEvent(state, {
    type: 'portal_open',
    x: safe.x,
    y: safe.y,
    targetArea,
  });
  emitEvent(state, {
    type: 'sfx',
    sound: 'sndPortalOpen',
    x: safe.x,
    y: safe.y,
  });
  emitEvent(state, {
    type: 'pickup_text',
    x: safe.x,
    y: safe.y - 16,
    text: bannerText,
    color: '#d988ff',
  });
}

function stepLilHunterDeathSpiral(state: SimState, rng: SeededRng, boss?: EnemyEntity): void {
  const rt = getAreaRuntime(state);
  const spiral = rt.lilHunterSpiral;
  if (!spiral || !spiral.active) return;

  spiral.ticksLeft -= 1;
  const mv = moveCircleWithSlide(state.map, spiral.x, spiral.y, spiral.vx, spiral.vy, 9);
  spiral.x = mv.x;
  spiral.y = mv.y;

  if (boss) {
    boss.x = mv.x;
    boss.y = mv.y;
    boss.invulnerable = true;
    boss.contactDamage = 0;
    boss.elevated = false;
    boss.elevZ = 0;
    boss.facing = state.tick % 4 < 2 ? 1 : -1;
    boss.aimAngle = normalizeAngle(boss.aimAngle + 0.65);
    boss.animFrame = (boss.animFrame + 0.6) % 8;
    boss.aiTimer = spiral.ticksLeft;
  }

  if (mv.hitX) {
    spiral.vx = -spiral.vx;
    spiral.bounces += 1;
  }
  if (mv.hitY) {
    spiral.vy = -spiral.vy;
    spiral.bounces += 1;
  }
  if (mv.hitWall) {
    carveCircle(state.map, spiral.x, spiral.y, 20, true);
    emitEvent(state, { type: 'sfx', sound: 'sndLilHunterFly', x: spiral.x, y: spiral.y, pitchJitter: 0.2 });
    emitEvent(state, { type: 'shake', trauma: 0.25 });
    spawnExplosion(state, spiral.x, spiral.y, 28, 16, 'neutral', rng, {
      carveWalls: true,
      clearsProjectiles: true,
      isFire: true,
      selfDamage: true,
      sound: 'sndExplosionS',
      cause: "LIL' HUNTER",
      killerSprite: 'sprLilHunter',
    });
  }

  emitEvent(state, {
    type: 'particle',
    kind: 'flame',
    x: spiral.x,
    y: spiral.y,
    vx: -spiral.vx * 0.25 + rng.range(-0.6, 0.6),
    vy: -spiral.vy * 0.25 + rng.range(-0.6, 0.6),
    color: '#ff7b29',
    size: 5,
    life: 8,
  });

  if (spiral.ticksLeft <= 0) {
    spiral.active = false;
    rt.lilHunterSpiral = null;
    if (boss) {
      rt.trackedSpecials.delete(boss.id);
      const idx = state.enemies.indexOf(boss);
      if (idx !== -1) state.enemies.splice(idx, 1);
    } else {
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const cand = state.enemies[i]!;
        if (cand.bossId === 'lil_hunter' && cand.aiState === 'death_spiral') {
          rt.trackedSpecials.delete(cand.id);
          state.enemies.splice(i, 1);
        }
      }
    }
    const corpse = spawnCorpse(
      state,
      spiral.x,
      spiral.y,
      spiral.vx * 0.35,
      spiral.vy * 0.35,
      boss?.facing ?? 1,
      'sprLilHunterDead',
      16,
      true,
    );
    rt.processedCorpseIds.add(corpse.id);
    spawnExplosion(state, spiral.x, spiral.y, 48, 28, 'neutral', rng, {
      carveWalls: true,
      clearsProjectiles: true,
      isFire: true,
      selfDamage: true,
      sound: 'sndExplosionL',
      cause: "LIL' HUNTER",
      killerSprite: 'sprLilHunter',
    });
  }
}

/**
 * Steps boss-specific projectiles every tick:
 * 1. Big Dog homing destructible missiles (`boss_missile`) steer toward player and can be shot down!
 * 2. Giant Krunked Throne / Throne II green rad orbs (`boss_orb` with radius >= 9) can be shot down
 *    to drop clutch HP & ammo pickups mid-bossfight (classic Nuclear Throne sustain loop!), and
 *    burst into smaller orbs if left unshot at expiration.
 * 3. Fallback step for Lil' Hunter death spiral if no visible spiral entity is present.
 */
export function stepBossProjectiles(state: SimState, rng: SeededRng): void {
  const hasVisibleSpiral = state.enemies.some(
    (e) => e.bossId === 'lil_hunter' && e.aiState === 'death_spiral' && e.hp > 0,
  );
  if (!hasVisibleSpiral) {
    stepLilHunterDeathSpiral(state, rng);
  }

  const player = state.player;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i]!;
    if (proj.team !== 'enemy') continue;

    const isMissile = proj.kind === 'boss_missile';
    const isDestructibleGiantOrb = proj.kind === 'boss_orb' && proj.radius >= 9;
    if (!isMissile && !isDestructibleGiantOrb) continue;

    if (isMissile) {
      if (player.alive) {
        const desired = Math.atan2(player.y - proj.y, player.x - proj.x);
        const diff = normalizeAngle(desired - proj.angle);
        const turn = Math.max(-0.085, Math.min(0.085, diff));
        proj.angle = normalizeAngle(proj.angle + turn);
        const spd = Math.max(2.6, Math.hypot(proj.vx, proj.vy));
        proj.vx = Math.cos(proj.angle) * spd;
        proj.vy = Math.sin(proj.angle) * spd;
      }

      if (state.tick % 3 === 0) {
        emitEvent(state, {
          type: 'particle',
          kind: 'missile_trail',
          x: proj.x,
          y: proj.y,
          vx: -proj.vx * 0.15,
          vy: -proj.vy * 0.15,
          color: '#ffaa44',
          size: 3,
          life: 6,
        });
      }
    }

    // Destructible by player projectiles using swept segment hit (zero tunneling for fast rifles/bolts/lasers!)
    let shotDown = false;
    for (let j = state.projectiles.length - 1; j >= 0; j--) {
      if (j === i) continue;
      const other = state.projectiles[j]!;
      if (other.team !== 'player') continue;
      const hit =
        other.kind === 'melee_slash'
          ? { hit: circleOverlap(proj.x, proj.y, proj.radius + 4, other.x, other.y, other.radius + 2) }
          : segmentCircleHit(
              other.prevX,
              other.prevY,
              other.x,
              other.y,
              proj.x,
              proj.y,
              proj.radius + other.radius + 4,
            );
      if (hit.hit) {
        shotDown = true;
        if (other.pierce <= 0 && other.kind !== 'melee_slash') {
          state.projectiles.splice(j, 1);
          if (j < i) i -= 1;
        }
        break;
      }
    }

    if (shotDown) {
      state.projectiles.splice(i, 1);
      if (isDestructibleGiantOrb) {
        // Classic Nuclear Throne Throne-orb drop: shooting giant rad balls yields ammo or HP!
        emitEvent(state, {
          type: 'particle',
          kind: 'explosion',
          x: proj.x,
          y: proj.y,
          vx: 0,
          vy: 0,
          color: '#55ff66',
          size: 18,
          life: 8,
          sprite: 'sprGreenExplosion',
        });
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndExplosionS',
          x: proj.x,
          y: proj.y,
          pitchJitter: 0.15,
        });
        if (state.crown !== 'life' && player.hp < player.maxHp && rng.chance(0.45)) {
          spawnPickup(state, 'hp', proj.x, proj.y, { value: 2 }, rng);
        } else {
          const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
          spawnPickup(
            state,
            'ammo',
            proj.x,
            proj.y,
            { ammoType, value: AMMO_PICKUP_AMOUNT[ammoType] },
            rng,
          );
        }
      } else {
        emitEvent(state, {
          type: 'particle',
          kind: 'explosion',
          x: proj.x,
          y: proj.y,
          vx: 0,
          vy: 0,
          color: '#ffcc55',
          size: 16,
          life: 8,
          sprite: 'sprSmallExplosion',
        });
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndExplosionS',
          x: proj.x,
          y: proj.y,
          pitchJitter: 0.12,
        });
      }
    } else if (isDestructibleGiantOrb && proj.lifeTicks <= 1) {
      // Unshot giant Throne / Throne II orbs split into a radial burst of smaller green orbs!
      state.projectiles.splice(i, 1);
      const fallbackBoss: BossId = state.areaCode === '0-1' ? 'throne_ii' : 'nuclear_throne';
      const fallbackDef = ENEMIES[fallbackBoss]!;
      for (let k = 0; k < 6; k++) {
        const ang = proj.angle + (k / 6) * Math.PI * 2;
        const mini = spawnEnemyProjectile(state, {
          kind: 'boss_orb',
          x: proj.x + Math.cos(ang) * 6,
          y: proj.y + Math.sin(ang) * 6,
          angle: ang,
          speed: 3.3,
          damage: 2,
          radius: 5,
          lifeTicks: 70,
          sprite: 'sprGuardianBullet',
        });
        mini.sourceCause = proj.sourceCause ?? fallbackDef.name.toUpperCase();
        mini.sourceSprite = proj.sourceSprite ?? fallbackDef.sprites.idle;
      }
      emitEvent(state, { type: 'sfx', sound: 'sndNothingSmallball', x: proj.x, y: proj.y, pitchJitter: 0.12 });
    }
  }
}

// ============================================================================
// 1. BIG BANDIT (1-3)
// ============================================================================
function stepBigBandit(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  const player = state.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const enraged = boss.hp <= boss.maxHp * 0.5;
  const hasLos = hasLineOfSight(state.map, boss.x, boss.y, player.x, player.y);

  boss.facing = dx >= 0 ? 1 : -1;
  if (boss.aiState !== 'tell' && boss.aiState !== 'dash') {
    boss.aimAngle = toPlayer;
  }

  boss.aiTimer -= 1;

  // Dramatic brief intro stance so Big Bandit never blindsides player while boss banner appears
  if (boss.aiState === 'intro') {
    moveBossBody(state, boss, 0, 0);
    if (boss.aiTimer <= 0 || boss.hp < boss.maxHp) {
      boss.aiState = 'reposition';
      boss.aiTimer = 16;
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditShootLaugh', x: boss.x, y: boss.y });
    }
    return;
  }

  if (boss.aiState === 'fire') {
    const interval = enraged ? 2 : 3;
    const volleyStart = enraged ? 29 : 38;
    if (boss.aiTimer % interval === 0) {
      const sweep = Math.sin(boss.aiTimer * 0.35) * (enraged ? 0.3 : 0.2);
      const jitter = rng.range(-0.07, 0.07);
      const isFirstShot = boss.aiTimer >= volleyStart - interval;
      fireBossProjectile(state, 'big_bandit', {
        kind: 'enemy_bullet',
        x: boss.x + Math.cos(boss.aimAngle) * 14,
        y: boss.y + Math.sin(boss.aimAngle) * 14,
        angle: boss.aimAngle + sweep + jitter,
        speed: enraged ? 5.6 : 4.9,
        damage: 2,
        radius: 4,
        lifeTicks: 90,
        sprite: 'sprEnemyBullet1',
        sound: isFirstShot ? 'sndBigBanditStartShoot' : 'sndPistol',
      });
    }
    moveBossBody(state, boss, Math.cos(toPlayer) * 0.45, Math.sin(toPlayer) * 0.45);
    if (boss.aiTimer <= 0) {
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditStopShoot', x: boss.x, y: boss.y });
      boss.aiState = 'tell';
      boss.aiTimer = enraged ? 14 : 18;
      boss.aimAngle = toPlayer;
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditMeleeStart', x: boss.x, y: boss.y });
    }
    return;
  }

  if (boss.aiState === 'tell') {
    // Lock dash direction clearly before wall-smashing dash!
    moveBossBody(state, boss, 0, 0);
    if (boss.aiTimer <= 0) {
      boss.aiState = 'dash';
      boss.aiTimer = enraged ? 23 : 20;
      boss.targetX = Math.cos(boss.aimAngle);
      boss.targetY = Math.sin(boss.aimAngle);
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditMelee', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.28 });
    }
    return;
  }

  if (boss.aiState === 'dash') {
    const dashSpeed = enraged ? 7.6 : 6.6;
    const res = moveBossBody(
      state,
      boss,
      boss.targetX * dashSpeed,
      boss.targetY * dashSpeed,
      { carveWalls: true },
    );
    // Smash breakable desert props (cacti, barrels, bone piles, pillars) in Big Bandit's path!
    // Snapshot state.props so recursive chain explosions splicing multiple props never corrupt iteration.
    const propsSnap = [...state.props];
    for (let p = 0; p < propsSnap.length; p++) {
      const prop = propsSnap[p]!;
      if (!state.props.includes(prop) || prop.hp <= 0 || prop.opened) continue;
      if (
        prop.kind === 'barrel' ||
        prop.kind === 'toxic_barrel' ||
        prop.kind === 'cactus' ||
        prop.kind === 'bone_pile' ||
        prop.kind === 'pillar' ||
        prop.kind === 'car'
      ) {
        if (circleOverlap(boss.x, boss.y, boss.radius + 2, prop.x, prop.y, prop.radius)) {
          damageProp(state, prop, 50, rng);
        }
      }
    }
    if (state.tick % 2 === 0) {
      emitEvent(state, {
        type: 'particle',
        kind: 'dust',
        x: boss.x,
        y: boss.y + 6,
        vx: -boss.targetX * 1.2,
        vy: -boss.targetY * 1.2,
        color: '#d9b584',
        size: 4,
        life: 8,
      });
    }
    if (boss.aiTimer <= 0 || res.hitWall) {
      boss.aiState = 'reposition';
      boss.aiTimer = enraged ? 16 : 22;
      boss.aiPhase = (boss.aiPhase + 1) % 3;
    }
    return;
  }

  // Default: reposition — if blocked by walls on phase 0, smash straight through with a dash!
  const strafeSign = boss.aiPhase % 2 === 0 ? 1 : -1;
  const moveAng = dist > 115 || !hasLos ? toPlayer : toPlayer + strafeSign * 1.1;
  const spd = enraged ? 2.8 : 2.3;
  moveBossBody(state, boss, Math.cos(moveAng) * spd, Math.sin(moveAng) * spd);

  if (boss.aiTimer <= 0) {
    if (!hasLos && dist > 100 && boss.aiPhase === 0) {
      // Iconic Big Bandit wall-smash approach when player hides behind canyon walls!
      boss.aiState = 'tell';
      boss.aiTimer = 14;
      boss.aimAngle = toPlayer;
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditMeleeStart', x: boss.x, y: boss.y });
    } else {
      boss.aiState = 'fire';
      boss.aiTimer = enraged ? 30 : 39;
      emitEvent(state, { type: 'sfx', sound: 'sndBigBanditShootLaugh', x: boss.x, y: boss.y });
    }
  }
}

// ============================================================================
// 2. BIG DOG (3-3)
// ============================================================================
function stepBigDog(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  const player = state.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const enraged = boss.hp <= boss.maxHp * 0.5;

  boss.facing = dx >= 0 ? 1 : -1;

  // Sleeping until provoked by damage, close proximity, or clear line-of-sight approach!
  if (boss.aiState === 'sleep') {
    const spotted =
      boss.hp < boss.maxHp ||
      dist <= 110 ||
      (dist <= 175 && hasLineOfSight(state.map, boss.x, boss.y, player.x, player.y));
    if (spotted) {
      boss.aiState = 'wake';
      boss.aiTimer = 18;
      boss.aiPhase = 0;
      const meta = BOSS_META.big_dog;
      if (state.boss && state.boss.entityId === boss.id) {
        state.boss.introTicks = 45;
      }
      emitEvent(state, {
        type: 'boss_intro',
        bossId: 'big_dog',
        name: meta.name,
        subtitle: meta.subtitle,
      });
      emitEvent(state, {
        type: 'music',
        track: meta.musicTrack,
        ambience: getAreaDef(state.areaCode).ambienceTrack,
        boss: true,
      });
      emitEvent(state, { type: 'sfx', sound: meta.introSound, x: boss.x, y: boss.y });
      emitEvent(state, { type: 'sfx', sound: 'sndBigDogTaunt', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.48 });
      emitEvent(state, {
        type: 'enemy_alert',
        entityId: boss.id,
        x: boss.x,
        y: boss.y,
        defId: boss.defId,
      });
    }
    return;
  }

  boss.aiTimer -= 1;

  if (boss.aiState === 'wake') {
    moveBossBody(state, boss, 0, 0);
    if (boss.aiTimer <= 0) {
      boss.aiState = 'spin_fire';
      boss.aiTimer = 54;
    }
    return;
  }

  if (boss.aiState === 'spin_fire') {
    boss.aimAngle = normalizeAngle(boss.aimAngle + (enraged ? 0.2 : 0.15));
    moveBossBody(state, boss, Math.cos(toPlayer) * 0.65, Math.sin(toPlayer) * 0.65, {
      carveWalls: true,
    });

    const interval = enraged ? 4 : 5;
    if (boss.aiTimer % interval === 0) {
      const arms = enraged ? 6 : 4;
      for (let a = 0; a < arms; a++) {
        const ang = boss.aimAngle + (a / arms) * Math.PI * 2;
        fireBossProjectile(state, 'big_dog', {
          kind: 'enemy_bullet',
          x: boss.x + Math.cos(ang) * (boss.radius * 0.7),
          y: boss.y + Math.sin(ang) * (boss.radius * 0.7),
          angle: ang,
          speed: enraged ? 4.3 : 3.7,
          damage: 2,
          radius: 4,
          lifeTicks: 105,
          sprite: 'sprEnemyBullet1',
        });
      }
      if (boss.aiTimer % (interval * 2) === 0) {
        emitEvent(state, { type: 'sfx', sound: 'sndBigDogSpin', x: boss.x, y: boss.y });
      }
    }

    if (boss.aiTimer <= 0) {
      boss.aiState = 'missiles';
      boss.aiTimer = enraged ? 36 : 32;
      emitEvent(state, { type: 'sfx', sound: 'sndBigDogTaunt', x: boss.x, y: boss.y });
    }
    return;
  }

  if (boss.aiState === 'missiles') {
    boss.aimAngle = toPlayer;
    moveBossBody(state, boss, Math.cos(toPlayer) * 0.5, Math.sin(toPlayer) * 0.5, {
      carveWalls: true,
    });
    if (boss.aiTimer % 9 === 0) {
      const spread = rng.range(-0.65, 0.65);
      fireBossProjectile(state, 'big_dog', {
        kind: 'boss_missile',
        x: boss.x + Math.cos(toPlayer + spread) * 18,
        y: boss.y + Math.sin(toPlayer + spread) * 18,
        angle: toPlayer + spread,
        speed: enraged ? 3.5 : 3.0,
        damage: 3,
        radius: 6,
        lifeTicks: 115,
        explosionRadius: 22,
        sprite: 'sprScrapBossMissileIdle',
        sound: 'sndBigDogMissile',
      });
    }
    if (boss.aiTimer <= 0) {
      boss.aiState = 'crush_spin';
      boss.aiTimer = 34;
      boss.targetX = Math.cos(toPlayer);
      boss.targetY = Math.sin(toPlayer);
      emitEvent(state, { type: 'sfx', sound: 'sndBigDogSpin', x: boss.x, y: boss.y });
    }
    return;
  }

  // crush_spin: wall-crushing spin rush toward player
  boss.aimAngle = normalizeAngle(boss.aimAngle + 0.35);
  const crushSpd = enraged ? 2.9 : 2.3;
  const blendX = boss.targetX * 0.85 + Math.cos(toPlayer) * 0.15;
  const blendY = boss.targetY * 0.85 + Math.sin(toPlayer) * 0.15;
  const len = Math.hypot(blendX, blendY) || 1;
  boss.targetX = blendX / len;
  boss.targetY = blendY / len;

  moveBossBody(state, boss, boss.targetX * crushSpd, boss.targetY * crushSpd, {
    carveWalls: true,
  });

  if (boss.aiTimer % 8 === 0) {
    for (let k = 0; k < 6; k++) {
      const ang = boss.aimAngle + (k / 6) * Math.PI * 2;
      fireBossProjectile(state, 'big_dog', {
        kind: 'enemy_bullet',
        x: boss.x + Math.cos(ang) * 14,
        y: boss.y + Math.sin(ang) * 14,
        angle: ang,
        speed: 3.6,
        damage: 2,
        radius: 4,
        lifeTicks: 85,
        sprite: 'sprEnemyBullet1',
      });
    }
  }

  if (boss.aiTimer <= 0) {
    boss.aiState = 'spin_fire';
    boss.aiTimer = enraged ? 48 : 54;
    boss.aiPhase += 1;
  }
}

// ============================================================================
// 3. LIL' HUNTER (5-3)
// ============================================================================
function performLilHunterSlam(state: SimState, boss: EnemyEntity): void {
  const safe = findNearestFloor(state.map, boss.x, boss.y, 12);
  boss.x = safe.x;
  boss.y = safe.y;
  boss.elevated = false;
  boss.elevZ = 0;
  boss.invulnerable = false;
  boss.contactDamage = ENEMIES.lil_hunter!.contactDamage;

  carveCircle(state.map, boss.x, boss.y, 26, true);
  emitEvent(state, { type: 'sfx', sound: 'sndLilHunterLand', x: boss.x, y: boss.y });
  emitEvent(state, { type: 'shake', trauma: 0.55 });

  // 12-way fire ring on landing!
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    fireBossProjectile(state, 'lil_hunter', {
      kind: 'enemy_flame',
      x: boss.x + Math.cos(ang) * 10,
      y: boss.y + Math.sin(ang) * 10,
      angle: ang,
      speed: 4.6,
      damage: 2,
      radius: 5,
      lifeTicks: 34,
      sprite: 'sprFireLilHunter',
    });
  }
}

function stepLilHunter(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  // Visible spinning jetpack death spiral — bounces off walls with lethal blasts until final detonation!
  if (boss.aiState === 'death_spiral') {
    stepLilHunterDeathSpiral(state, rng, boss);
    return;
  }

  const player = state.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const hurt = boss.hp < boss.maxHp * 0.75;

  boss.facing = dx >= 0 ? 1 : -1;
  boss.aimAngle = toPlayer;
  boss.aiTimer -= 1;
  if (boss.attackCooldown > 0) boss.attackCooldown -= 1;

  // Delayed ~4-5s drop-in before triggering boss_intro and slamming into Frozen City 5-3!
  if (boss.aiState === 'await_drop') {
    boss.elevated = true;
    boss.invulnerable = true;
    boss.contactDamage = 0;
    boss.elevZ = 260;

    // If all regular enemies are already cleared, accelerate drop-in so the player isn't waiting in an empty room
    const hasOtherHostiles = state.enemies.some(
      (e) => !e.friendly && e.hp > 0 && !e.isBoss && e.aiState !== 'disguised',
    );
    if (!hasOtherHostiles && boss.aiTimer > 12) {
      boss.aiTimer = 12;
    }

    if (boss.aiTimer <= 0) {
      // Pick dramatic drop point near active player (safe offset ~80-115px so it never telefrags player)
      const dropAng = rng.range(0, Math.PI * 2);
      const dropRad = rng.range(80, 112);
      const cand = findNearestFloor(
        state.map,
        player.x + Math.cos(dropAng) * dropRad,
        player.y + Math.sin(dropAng) * dropRad,
        14,
      );
      boss.x = cand.x;
      boss.y = cand.y;
      boss.prevX = cand.x;
      boss.prevY = cand.y;
      boss.targetX = cand.x;
      boss.targetY = cand.y;
      boss.aiState = 'arrive_slam';
      boss.aiTimer = 20;
      boss.elevZ = 96;

      const meta = BOSS_META.lil_hunter;
      if (state.boss && state.boss.entityId === boss.id) {
        state.boss.introTicks = 45;
      }
      emitEvent(state, {
        type: 'boss_intro',
        bossId: 'lil_hunter',
        name: meta.name,
        subtitle: meta.subtitle,
      });
      emitEvent(state, {
        type: 'music',
        track: meta.musicTrack,
        ambience: getAreaDef(state.areaCode).ambienceTrack,
        boss: true,
      });
      emitEvent(state, { type: 'sfx', sound: meta.introSound, x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.4 });
    }
    return;
  }

  // Initial dramatic sky-drop slam arrival
  if (boss.aiState === 'arrive_slam') {
    boss.elevated = true;
    boss.invulnerable = true;
    boss.elevZ = Math.max(0, (boss.aiTimer / 20) * 96);
    if (boss.aiTimer <= 0) {
      performLilHunterSlam(state, boss);
      boss.aiState = 'grounded';
      boss.aiTimer = 56;
      boss.attackCooldown = 14;
    }
    return;
  }

  // Jetpack liftoff flight (elevated = true, invulnerable mid-air!)
  if (boss.aiState === 'fly') {
    boss.elevated = true;
    boss.invulnerable = true;
    boss.elevZ = Math.min(58, (boss.elevZ ?? 0) + 5);

    const flySpeed = 4.6;
    moveBossBody(state, boss, (dx / dist) * flySpeed, (dy / dist) * flySpeed, {
      flying: true,
    });
    if (state.tick % 2 === 0) {
      emitEvent(state, {
        type: 'particle',
        kind: 'flame',
        x: boss.x,
        y: boss.y - (boss.elevZ ?? 20) + 8,
        vx: rng.range(-0.8, 0.8),
        vy: 1.5,
        color: '#ff8833',
        size: 4,
        life: 7,
      });
    }
    if (boss.aiTimer <= 0) {
      boss.aiState = 'slam';
      boss.aiTimer = 16;
      boss.targetX = player.x;
      boss.targetY = player.y;
      emitEvent(state, { type: 'sfx', sound: 'sndLilHunterFly', x: boss.x, y: boss.y });
    }
    return;
  }

  // Diving slam landing
  if (boss.aiState === 'slam') {
    boss.elevated = true;
    boss.invulnerable = true;
    boss.elevZ = Math.max(0, (boss.aiTimer / 16) * 58);
    const tdx = boss.targetX - boss.x;
    const tdy = boss.targetY - boss.y;
    moveBossBody(state, boss, tdx * 0.25, tdy * 0.25, { flying: true });
    if (boss.aiTimer <= 0) {
      performLilHunterSlam(state, boss);
      boss.aiState = 'grounded';
      boss.aiTimer = hurt ? 46 : 58;
      boss.attackCooldown = 16;
    }
    return;
  }

  // Grounded combat: fast strafe + bouncer bursts + flame spreads + IDPD backup when hurt
  boss.elevated = false;
  boss.elevZ = 0;
  boss.invulnerable = false;

  const strafeDir = boss.aiPhase % 2 === 0 ? 1 : -1;
  const desiredAng = dist > 120 ? toPlayer : toPlayer + strafeDir * 1.35;
  const spd = hurt ? 2.9 : 2.4;
  moveBossBody(state, boss, Math.cos(desiredAng) * spd, Math.sin(desiredAng) * spd);

  const hasLos = hasLineOfSight(state.map, boss.x, boss.y, player.x, player.y);
  if (boss.attackCooldown <= 0) {
    const shouldCallIdpd =
      countBossSummonsAlive(state) < 3 &&
      ((!hasLos && rng.chance(0.45)) || (hurt && rng.chance(0.32)));
    if (shouldCallIdpd) {
      emitEvent(state, { type: 'sfx', sound: 'sndLilHunterSummon', x: boss.x, y: boss.y });
      spawnIdpdWave(state, rng, {
        anchorX: boss.x + rng.range(-48, 48),
        anchorY: boss.y + rng.range(-48, 48),
        count: 2,
        isBossSummon: true,
      });
      boss.attackCooldown = 36;
    } else if (boss.aiPhase % 2 === 0) {
      for (let b = -1; b <= 1; b++) {
        fireBossProjectile(state, 'lil_hunter', {
          kind: 'enemy_bullet',
          x: boss.x + Math.cos(toPlayer) * 10,
          y: boss.y + Math.sin(toPlayer) * 10,
          angle: toPlayer + b * 0.16 + rng.range(-0.04, 0.04),
          speed: 5.4,
          damage: 2,
          radius: 4,
          bounce: 2,
          lifeTicks: 95,
          sprite: 'sprLHBouncer',
          sound: b === 0 ? 'sndLilHunterBouncer' : undefined,
        });
      }
      boss.attackCooldown = hurt ? 18 : 24;
      boss.aiPhase += 1;
    } else {
      for (let f = -2; f <= 2; f++) {
        fireBossProjectile(state, 'lil_hunter', {
          kind: 'enemy_flame',
          x: boss.x + Math.cos(toPlayer) * 10,
          y: boss.y + Math.sin(toPlayer) * 10,
          angle: toPlayer + f * 0.14,
          speed: 5.0,
          damage: 2,
          radius: 5,
          lifeTicks: 38,
          sprite: 'sprFireLilHunter',
          sound: f === 0 ? 'sndLilHunterSniper' : undefined,
        });
      }
      boss.attackCooldown = hurt ? 20 : 26;
      boss.aiPhase += 1;
    }
  }

  if (boss.aiTimer <= 0) {
    boss.aiState = 'fly';
    boss.aiTimer = 30;
    boss.elevated = true;
    boss.invulnerable = true;
    boss.elevZ = 10;
    emitEvent(state, { type: 'sfx', sound: 'sndLilHunterLaunch', x: boss.x, y: boss.y });
  }
}

// ============================================================================
// 4. THE KRUNKED THRONE (7-3)
// ============================================================================
function stepNuclearThrone(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  const player = state.player;
  const rt = getAreaRuntime(state);
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);

  // Track Throne Generators destruction!
  if (state.generatorsRemaining < rt.throneLastGenCount) {
    rt.throneLastGenCount = state.generatorsRemaining;
    emitEvent(state, { type: 'sfx', sound: 'sndNothingGenerators', x: boss.x, y: boss.y });
    emitEvent(state, { type: 'shake', trauma: 0.45 });
    if (state.generatorsRemaining === 0 && boss.hp > 1) {
      // Authentic Nuclear Throne: destroying all 4 generators chunks 50% of the Throne's max HP!
      const shockDmg = Math.max(50, Math.round(boss.maxHp * 0.5));
      applyDamageToEnemy(state, boss, shockDmg, 0, 0, rng, { isHeavy: true });
      emitEvent(state, {
        type: 'pickup_text',
        x: boss.x,
        y: boss.y - 28,
        text: 'GENERATORS DESTROYED!',
        color: '#66ff88',
      });
      if (boss.hp <= 0) return;
    }
  }

  // Sleep until player advances up red carpet, damages Throne, or destroys a generator
  if (boss.aiState === 'sleep') {
    const approachedCarpet = player.y < boss.y + 340 || dist < 340;
    if (approachedCarpet || boss.hp < boss.maxHp || state.generatorsRemaining < 4) {
      rt.throneWoken = true;
      boss.aiState = 'orb_volley';
      boss.aiTimer = 46;
      boss.aiPhase = 0;
      const meta = BOSS_META.nuclear_throne;
      if (state.boss && state.boss.entityId === boss.id) {
        state.boss.introTicks = 45;
      }
      emitEvent(state, {
        type: 'boss_intro',
        bossId: 'nuclear_throne',
        name: meta.name,
        subtitle: meta.subtitle,
      });
      emitEvent(state, {
        type: 'music',
        track: meta.musicTrack,
        ambience: getAreaDef(state.areaCode).ambienceTrack,
        boss: true,
      });
      emitEvent(state, { type: 'sfx', sound: meta.introSound, x: boss.x, y: boss.y });
      emitEvent(state, { type: 'sfx', sound: 'sndNothingRise', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.55 });
    }
    return;
  }

  boss.aiTimer -= 1;

  // Relentlessly advance south down the carpet crushing walls in path (stops above south edge)
  const ts = state.map.tileSize || TILE_SIZE;
  const maxSouthY = (state.map.height - 10) * ts;
  if (
    boss.y < maxSouthY &&
    boss.y < player.y - 36 &&
    boss.aiState !== 'fire' &&
    boss.aiState !== 'tell'
  ) {
    const advanceSpeed = boss.hp < boss.maxHp * 0.5 ? 0.65 : 0.45;
    moveBossBody(state, boss, 0, advanceSpeed, { carveWalls: true });
    if (state.tick % 24 === 0) {
      emitEvent(state, { type: 'sfx', sound: 'sndNothingFootstep', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.16 });
    }
  } else {
    moveBossBody(state, boss, 0, 0);
  }

  // Phase A: Telegraphed Center Mega-Beam down the red carpet (safe in West/East side alcoves!)
  if (boss.aiState === 'tell') {
    boss.aimAngle = Math.PI * 0.5;
    if (boss.aiTimer % 4 === 0) {
      for (let d = 36; d <= 220; d += 36) {
        emitEvent(state, {
          type: 'particle',
          kind: 'beam_warn',
          x: boss.x + rng.range(-10, 10),
          y: boss.y + d,
          vx: 0,
          vy: 1.5,
          color: '#66ff66',
          size: 5,
          life: 6,
        });
      }
    }
    if (boss.aiTimer <= 0) {
      boss.aiState = 'fire';
      boss.aiTimer = 34;
      emitEvent(state, { type: 'sfx', sound: 'sndNothingBeamStart', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.5 });
    }
    return;
  }

  if (boss.aiState === 'fire') {
    boss.aimAngle = Math.PI * 0.5;
    // Tightened per-tick Mega-Beam emission (11.5px spacing < 24px beam sprite) for a seamless continuous beam column!
    const lanes = [-10, 0, 10] as const;
    for (let l = 0; l < lanes.length; l++) {
      fireBossProjectile(state, 'nuclear_throne', {
        kind: 'enemy_plasma',
        x: boss.x + lanes[l]!,
        y: boss.y + 24,
        angle: Math.PI * 0.5,
        speed: 11.5,
        damage: 4,
        radius: 8,
        pierce: 2,
        lifeTicks: 50,
        sprite: 'sprNothingBeam',
      });
    }
    if (boss.aiTimer % 8 === 0) {
      // Side-cannon plasma orbs sweep the flanks during the Center Mega-Beam!
      for (const side of [-1, 1] as const) {
        const ang = Math.PI * 0.5 + side * (0.48 + ((boss.aiTimer / 8) % 3) * 0.14);
        fireBossProjectile(state, 'nuclear_throne', {
          kind: 'boss_orb',
          x: boss.x + side * 26,
          y: boss.y + 18,
          angle: ang,
          speed: 3.6,
          damage: 2,
          radius: 5,
          lifeTicks: 95,
          sprite: 'sprGuardianBullet',
        });
      }
      emitEvent(state, { type: 'sfx', sound: 'sndNothingBeamLoop', x: boss.x, y: boss.y });
      emitEvent(state, { type: 'shake', trauma: 0.25 });
    }
    if (boss.aiTimer <= 0) {
      emitEvent(state, { type: 'sfx', sound: 'sndNothingBeamEnd', x: boss.x, y: boss.y });
      boss.aiState = 'orb_volley';
      boss.aiTimer = 48;
      boss.aiPhase += 1;
    }
    return;
  }

  // Phase B: Radial orb volleys + Giant Destructible Rad Orbs (independent timers — zero modulo shadowing!)
  boss.aimAngle = toPlayer;
  if (boss.aiTimer % 12 === 0) {
    const ringCount = boss.hp < boss.maxHp * 0.5 ? 12 : 9;
    const baseAngle = toPlayer + (boss.aiPhase % 2) * 0.18;
    for (let k = 0; k < ringCount; k++) {
      const ang = baseAngle + (k / ringCount) * Math.PI * 2;
      fireBossProjectile(state, 'nuclear_throne', {
        kind: 'boss_orb',
        x: boss.x + Math.cos(ang) * 26,
        y: boss.y + Math.sin(ang) * 26,
        angle: ang,
        speed: 3.4,
        damage: 3,
        radius: 6,
        lifeTicks: 115,
        sprite: 'sprGuardianBullet',
        sound: k === 0 ? 'sndNothingFire' : undefined,
      });
    }
  }
  if (boss.aiTimer % 16 === 8) {
    // Launch giant destructible Throne Rad Orb toward player (classic NT ammo/HP farm!)
    fireBossProjectile(state, 'nuclear_throne', {
      kind: 'boss_orb',
      x: boss.x + Math.cos(toPlayer) * 28,
      y: boss.y + Math.sin(toPlayer) * 28,
      angle: toPlayer + rng.range(-0.14, 0.14),
      speed: 2.8,
      damage: 4,
      radius: 10,
      lifeTicks: 130,
      sprite: 'sprBigGuardianBullet',
      sound: 'sndNothingSmallball',
    });
  }

  if (boss.aiTimer <= 0) {
    if (boss.aiPhase % 2 === 1 && countBossSummonsAlive(state) < 3) {
      const side = rng.chance(0.5) ? -1 : 1;
      createEnemyEntity(state, 'guardian', boss.x + side * 64, boss.y + 40, rng, {
        isBossSummon: true,
      });
      emitEvent(state, { type: 'sfx', sound: 'sndGuardianAppear', x: boss.x + side * 64, y: boss.y + 40 });
    }
    const pTile = worldToTile(player.x, player.y, ts);
    const onCarpet =
      getTile(state.map, pTile.tx, pTile.ty) === TileType.Carpet ||
      Math.abs(player.x - boss.x) <= 44;
    if (onCarpet || boss.aiPhase % 2 === 0) {
      boss.aiState = 'tell';
      boss.aiTimer = 34;
      emitEvent(state, { type: 'sfx', sound: 'sndNothingBeamWarn', x: boss.x, y: boss.y });
    } else {
      boss.aiTimer = 42;
      boss.aiPhase += 1;
    }
  }
}

// ============================================================================
// 5. THRONE II (0-1)
// ============================================================================
function stepThroneII(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  const player = state.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const enraged = boss.hp <= boss.maxHp * 0.5;

  boss.elevated = true;
  boss.elevZ = 14 + Math.sin(state.tick * 0.16) * 3;
  boss.invulnerable = false;
  boss.facing = dx >= 0 ? 1 : -1;

  boss.aiTimer -= 1;

  if (boss.aiState === 'intro') {
    moveBossBody(state, boss, 0, 0, { flying: true });
    if (boss.aiTimer <= 0 || boss.hp < boss.maxHp) {
      boss.aiState = 'plasma_balls';
      boss.aiTimer = 42;
    }
    return;
  }

  // Smooth flying chase around the Campfire arena
  const orbitSign = boss.aiPhase % 2 === 0 ? 1 : -1;
  const desiredAng = dist > 115 ? toPlayer : dist < 68 ? toPlayer + Math.PI : toPlayer + orbitSign * 1.1;
  const flySpd = enraged ? 2.6 : 2.1;
  moveBossBody(state, boss, Math.cos(desiredAng) * flySpd, Math.sin(desiredAng) * flySpd, {
    flying: true,
  });

  if (boss.aiState === 'spiral_volley') {
    boss.aimAngle = normalizeAngle(boss.aimAngle + (enraged ? 0.24 : 0.18));
    if (boss.aiTimer % 4 === 0) {
      const arms = enraged ? 5 : 4;
      for (let a = 0; a < arms; a++) {
        const ang = boss.aimAngle + (a / arms) * Math.PI * 2;
        fireBossProjectile(state, 'throne_ii', {
          kind: 'boss_orb',
          x: boss.x + Math.cos(ang) * 20,
          y: boss.y + Math.sin(ang) * 20,
          angle: ang,
          speed: 4.1,
          damage: 2,
          radius: 5,
          lifeTicks: 95,
          sprite: 'sprThrone2Bullet',
          sound: a === 0 && boss.aiTimer % 8 === 0 ? 'sndNothing2Beam' : undefined,
        });
      }
    }
    if (boss.aiTimer <= 0) {
      boss.aiState = 'sweep_burst';
      boss.aiTimer = enraged ? 38 : 34;
      boss.aiPhase += 1;
    }
    return;
  }

  if (boss.aiState === 'sweep_burst') {
    boss.aimAngle = toPlayer;
    if (boss.aiTimer % 10 === 0) {
      const count = enraged ? 7 : 5;
      for (let k = 0; k < count; k++) {
        const frac = k / (count - 1) - 0.5;
        fireBossProjectile(state, 'throne_ii', {
          kind: 'boss_orb',
          x: boss.x + Math.cos(toPlayer + frac * 0.7) * 22,
          y: boss.y + Math.sin(toPlayer + frac * 0.7) * 22,
          angle: toPlayer + frac * 0.7,
          speed: enraged ? 4.4 : 3.8,
          damage: 2,
          radius: 5,
          lifeTicks: 90,
          sprite: 'sprThrone2Bullet',
          sound: k === 0 ? 'sndNothing2Beam' : undefined,
        });
      }
    }
    if (boss.aiTimer <= 0) {
      boss.aiState = 'plasma_balls';
      boss.aiTimer = 42;
      boss.aiPhase += 1;
    }
    return;
  }

  // Default / plasma_balls: fires huge destructible glowing plasma balls (split into orb rings if unshot!)
  boss.aimAngle = toPlayer;
  if (boss.aiTimer % 14 === 0) {
    const spreadCount = enraged ? 3 : 1;
    for (let s = 0; s < spreadCount; s++) {
      const offset = spreadCount > 1 ? (s - 1) * 0.28 : 0;
      fireBossProjectile(state, 'throne_ii', {
        kind: 'boss_orb',
        x: boss.x + Math.cos(toPlayer + offset) * 22,
        y: boss.y + Math.sin(toPlayer + offset) * 22,
        angle: toPlayer + offset,
        speed: 3.5,
        damage: 4,
        radius: 9,
        explosionRadius: 26,
        lifeTicks: 90,
        sprite: 'sprPlasmaBallHuge',
        sound: s === 0 ? 'sndNothing2Ball' : undefined,
      });
    }
  }

  if (boss.aiTimer <= 0) {
    boss.aiState = 'spiral_volley';
    boss.aiTimer = enraged ? 48 : 42;
    boss.aiPhase += 1;
  }
}

/**
 * Steps the active Boss entity's bespoke multi-phase AI and updates `state.boss`.
 */
export function stepBossAi(state: SimState, boss: EnemyEntity, rng: SeededRng): void {
  if (state.boss && state.boss.entityId === boss.id) {
    state.boss.hp = Math.max(0, boss.hp);
    state.boss.maxHp = Math.max(1, boss.maxHp);
    if (state.boss.introTicks > 0) {
      state.boss.introTicks -= 1;
    }
  }

  switch (boss.bossId) {
    case 'big_bandit':
      stepBigBandit(state, boss, rng);
      break;
    case 'big_dog':
      stepBigDog(state, boss, rng);
      break;
    case 'lil_hunter':
      stepLilHunter(state, boss, rng);
      break;
    case 'nuclear_throne':
      stepNuclearThrone(state, boss, rng);
      break;
    case 'throne_ii':
      stepThroneII(state, boss, rng);
      break;
    default:
      stepBigBandit(state, boss, rng);
      break;
  }
}

/**
 * Completes the 7-3 intact-generator victory sequence when the player sits on the broken Throne
 * (either by pressing [E] or walking onto `sprThroneCorpseIdle`).
 */
export function triggerThroneVictory(
  state: SimState,
  throneX: number,
  throneY: number,
  rng: SeededRng,
): void {
  const rt = getAreaRuntime(state);
  if (rt.brokenThronePropId !== null) {
    const idx = state.props.findIndex((p) => p.id === rt.brokenThronePropId);
    if (idx !== -1) state.props.splice(idx, 1);
    rt.brokenThronePropId = null;
  }
  if (state.boss) {
    state.boss.hp = 0;
    state.boss.defeated = true;
  }
  state.phase = 'victory_throne';
  emitEvent(state, {
    type: 'sfx',
    sound: 'sndLevelUltra',
    x: throneX,
    y: throneY,
  });
  emitEvent(state, { type: 'shake', trauma: 0.6 });
  emitEvent(state, {
    type: 'pickup_text',
    x: throneX,
    y: throneY - 24,
    text: 'YOU REACHED THE KRUNKED THRONE!',
    color: '#ffe066',
  });
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const spd = rng.range(1.6, 4.4);
    emitEvent(state, {
      type: 'particle',
      kind: 'throne_victory',
      x: throneX,
      y: throneY,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      color: i % 2 === 0 ? '#ffe066' : '#66ff88',
      size: rng.range(3, 5),
      life: rng.int(16, 28),
    });
  }
}

/**
 * Handles bespoke boss defeat payoffs (lethal explosions, clearing boss summons, visible Lil' Hunter
 * death spiral, sit-able 7-3 broken Throne, and canonical progression portals — including 7-3 -> 0-1 -> Loop 1-1!).
 */
export function handleBossDeath(
  state: SimState,
  bossId: BossId,
  deathX: number,
  deathY: number,
  rng: SeededRng,
): void {
  const rt = getAreaRuntime(state);
  if (rt.bossDeathHandled) return;
  rt.bossDeathHandled = true;

  if (state.boss && state.boss.bossId === bossId) {
    state.boss.hp = 0;
    state.boss.defeated = true;
  }

  emitEvent(state, { type: 'sfx', sound: 'sndBossWin', x: deathX, y: deathY });

  switch (bossId) {
    case 'big_bandit': {
      spawnExplosion(state, deathX, deathY, 32, 16, 'player', rng, {
        carveWalls: true,
        clearsProjectiles: true,
        isRad: true,
        selfDamage: false,
        sound: 'sndBigBanditDie',
        cause: 'BIG BANDIT',
        killerSprite: 'sprBanditBossIdle',
      });
      // Classic Nuclear Throne 1-1 -> 1-? Oasis secret: kill early Big Bandit within 10s (300 ticks)!
      if (
        state.areaCode === '1-1' &&
        rt.earlyBigBanditSpawned &&
        rt.earlyBigBanditSpawnTick >= 0 &&
        state.tick - rt.earlyBigBanditSpawnTick <= 300
      ) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          if (!state.enemies[i]!.friendly) {
            state.enemies.splice(i, 1);
          }
        }
        openBossPortal(state, deathX, deathY, '1-?', state.loop, 'OASIS PORTAL!');
      }
      break;
    }

    case 'big_dog': {
      // Iconic Big Dog lethal multi-blast scrapyard detonation ring (honors Boiling Veins)!
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const rad = k === 0 ? 0 : 20;
        spawnExplosion(state, deathX + Math.cos(ang) * rad, deathY + Math.sin(ang) * rad, 34, 24, 'neutral', rng, {
          carveWalls: true,
          clearsProjectiles: true,
          isFire: true,
          selfDamage: true,
          sound: k === 0 ? 'sndBigDogDeath' : 'sndExplosion',
          cause: 'BIG DOG',
          killerSprite: 'sprScrapBossIdle',
        });
      }
      break;
    }

    case 'lil_hunter': {
      clearBossSummonsAndEnemyBullets(state, true);
      // Remove premature sprLilHunterDead corpse so the spinning body visibly spirals until final detonation!
      for (let c = state.corpses.length - 1; c >= 0; c--) {
        if (state.corpses[c]!.sprite === 'sprLilHunterDead') {
          state.corpses.splice(c, 1);
        }
      }
      const safe = findNearestFloor(state.map, deathX, deathY, 10);
      const spiralAng = rng.range(0, Math.PI * 2);
      const svx = Math.cos(spiralAng) * 7.5;
      const svy = Math.sin(spiralAng) * 7.5;
      const spiralTicks = 28;
      rt.lilHunterSpiral = {
        active: true,
        x: safe.x,
        y: safe.y,
        vx: svx,
        vy: svy,
        ticksLeft: spiralTicks,
        bounces: 0,
      };
      // Keep Lil' Hunter visibly alive in state.enemies during death_spiral (delays portal until final detonation!)
      const lhDef = ENEMIES.lil_hunter!;
      const spiralBody: EnemyEntity = {
        id: allocEntityId(state),
        defId: 'lil_hunter',
        bossId: 'lil_hunter',
        x: safe.x,
        y: safe.y,
        prevX: safe.x,
        prevY: safe.y,
        vx: svx,
        vy: svy,
        radius: lhDef.radius,
        hp: 1,
        maxHp: 1,
        facing: svx >= 0 ? 1 : -1,
        aimAngle: spiralAng,
        hurtFlashTicks: 0,
        snaredTicks: 0,
        aiState: 'death_spiral',
        aiTimer: spiralTicks,
        aiPhase: 0,
        attackCooldown: 0,
        targetX: safe.x,
        targetY: safe.y,
        animFrame: 0,
        contactDamage: 0,
        radDrop: 0,
        friendly: false,
        isBoss: true,
        invulnerable: true,
        elevated: false,
        elevZ: 0,
      };
      state.enemies.push(spiralBody);

      emitEvent(state, { type: 'sfx', sound: 'sndLilHunterDeath', x: safe.x, y: safe.y });
      emitEvent(state, { type: 'sfx', sound: 'sndLilHunterFly', x: safe.x, y: safe.y });
      spawnExplosion(state, safe.x, safe.y, 36, 20, 'neutral', rng, {
        carveWalls: true,
        clearsProjectiles: true,
        isFire: true,
        selfDamage: true,
        sound: 'sndExplosionL',
        cause: "LIL' HUNTER",
        killerSprite: 'sprLilHunter',
      });
      break;
    }

    case 'nuclear_throne': {
      const loopUnlocked = state.generatorsRemaining <= 0;
      clearBossSummonsAndEnemyBullets(state, true);
      for (let k = 0; k < 3; k++) {
        const bx = deathX + (k - 1) * 24;
        const by = deathY + (k % 2 === 0 ? -8 : 10);
        spawnExplosion(state, bx, by, 58, 30, 'neutral', rng, {
          carveWalls: true,
          clearsProjectiles: true,
          isRad: true,
          selfDamage: true,
          sound: k === 0 ? 'sndNothingDeath1' : 'sndNothingDeath2',
          cause: 'THE KRUNKED THRONE',
          killerSprite: 'sprNothingOn',
        });
      }
      if (loopUnlocked) {
        const next = getNextAreaTransition('7-3', state.loop);
        openBossPortal(
          state,
          deathX,
          deathY + 32,
          next.areaCode,
          next.loop,
          'LOOP PORTAL TO 0-1!',
        );
      } else {
        // Intact-generator kill: leave sit-able smoking broken Throne (sprThroneCorpseIdle) so player sees death blasts & sits!
        for (let c = state.corpses.length - 1; c >= 0; c--) {
          if (state.corpses[c]!.sprite === 'sprNothingDeath') {
            state.corpses.splice(c, 1);
          }
        }
        const seatPos = findNearestFloor(state.map, deathX, deathY, 10);
        const brokenThrone: PropEntity = {
          id: allocEntityId(state),
          kind: 'bone_pile',
          x: seatPos.x,
          y: seatPos.y,
          radius: 22,
          hp: 999999,
          maxHp: 999999,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: 'sprThroneCorpseIdle',
          interactPrompt: '[E] SIT ON THRONE',
        };
        state.props.push(brokenThrone);
        rt.brokenThronePropId = brokenThrone.id;
        rt.brokenThroneSitDelay = 15;
        emitEvent(state, { type: 'shake', trauma: 0.65 });
        emitEvent(state, {
          type: 'pickup_text',
          x: seatPos.x,
          y: seatPos.y - 24,
          text: 'CLAIM THE THRONE!',
          color: '#ffe066',
        });
      }
      break;
    }

    case 'throne_ii': {
      clearBossSummonsAndEnemyBullets(state, true);
      spawnExplosion(state, deathX, deathY, 64, 34, 'neutral', rng, {
        carveWalls: true,
        clearsProjectiles: true,
        isRad: true,
        selfDamage: true,
        sound: 'sndNothing2Dead',
        cause: 'THRONE II',
        killerSprite: 'sprNothing2Idle',
      });
      const next = getNextAreaTransition('0-1', state.loop);
      openBossPortal(
        state,
        deathX,
        deathY,
        next.areaCode,
        next.loop,
        `LOOP ${next.loop} PORTAL!`,
      );
      break;
    }
  }
}
