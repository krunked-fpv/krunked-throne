import type { EnemyEntity, ProjectileEntity, PropKind, SimState } from '@/contracts';
import { getWeaponDef } from '@/data';
import {
  SeededRng,
  allocEntityId,
  circleOverlap,
  emitEvent,
  segmentCircleHit,
  sweptRayTile,
} from '@/sim/core';
import { getAreaRuntime } from '@/sim/entities/runtime';
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  damageProp,
  hasMutation,
  hasUltra,
  spawnExplosion,
  spawnPickup,
} from './helpers';

const ENEMY_COVER_PROP_KINDS: ReadonlySet<PropKind> = new Set([
  'car',
  'pillar',
  'barrel',
  'toxic_barrel',
  'proto_statue',
  'throne_generator',
  'cactus',
]);

function computeProjectileKnockback(proj: ProjectileEntity): number {
  switch (proj.kind) {
    case 'slug':
      return 9.2;
    case 'heavy_bullet':
      return 6.8;
    case 'bolt':
    case 'seeking_bolt':
    case 'toxic_bolt':
      return 7.8;
    case 'splinter':
      return 4.8;
    case 'shell':
      return 4.2;
    case 'disc':
      return 6.4;
    case 'plasma':
    case 'rocket':
    case 'nuke':
      return 8.5;
    case 'laser':
    case 'lightning':
      return 5.2;
    default:
      return Math.max(3.6, Math.min(8.5, 2.8 + proj.damage * 0.25));
  }
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function findNearestHostile(
  state: SimState,
  x: number,
  y: number,
  maxRange: number,
  excludeIds?: readonly number[],
): EnemyEntity | null {
  let best: EnemyEntity | null = null;
  let bestDistSq = maxRange * maxRange;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.friendly || e.hp <= 0 || e.invulnerable) continue;
    if (excludeIds && excludeIds.includes(e.id)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = e;
    }
  }
  return best;
}

function resolveMeleeSlash(
  state: SimState,
  proj: ProjectileEntity,
  rng: SeededRng,
): void {
  const reach = proj.meleeReach ?? 32;
  const halfArc = (((proj.meleeArcDeg ?? 140) * Math.PI) / 180) * 0.5;
  const originX = proj.team === 'player' ? state.player.x : proj.prevX;
  const originY = proj.team === 'player' ? state.player.y : proj.prevY;
  proj.x = originX + Math.cos(proj.angle) * (reach * 0.45);
  proj.y = originY + Math.sin(proj.angle) * (reach * 0.45);

  // 1. Deflect or destroy opposing projectiles along swept segment inside melee arc!
  if (proj.deflectsProjectiles || proj.destroysProjectiles) {
    let deflectedAny = false;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const other = state.projectiles[i]!;
      if (other.id === proj.id || other.team === proj.team) continue;
      if (other.kind === 'melee_slash' || other.kind === 'laser' || other.kind === 'enemy_laser') {
        continue;
      }

      // Check both current position AND swept path so fast shots (Sniper/Boss) never slip past!
      const segHit = segmentCircleHit(
        other.prevX,
        other.prevY,
        other.x,
        other.y,
        originX,
        originY,
        reach + other.radius + 5,
      );
      if (!segHit.hit) continue;

      const hitX = segHit.hitX;
      const hitY = segHit.hitY;
      const dx = hitX - originX;
      const dy = hitY - originY;
      const dist = Math.hypot(dx, dy);
      const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - proj.angle));
      if (dist > 11 && angDiff > halfArc + 0.25) continue;

      if (proj.deflectsProjectiles) {
        other.team = proj.team;
        const speed = Math.max(11, Math.hypot(other.vx, other.vy) * 1.55);
        other.vx = Math.cos(proj.angle) * speed;
        other.vy = Math.sin(proj.angle) * speed;
        other.angle = proj.angle;
        other.damage = Math.max(other.damage * 2, 10);
        other.lifeTicks = Math.max(other.lifeTicks, 48);
        other.hitIds = [];
        deflectedAny = true;
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndMeleeFlip',
          x: other.x,
          y: other.y,
          pitchJitter: 0.1,
        });
        if (proj.team === 'player') {
          emitEvent(state, {
            type: 'melee_deflect',
            x: other.x,
            y: other.y,
            angle: proj.angle,
          });
        }
      } else if (proj.destroysProjectiles) {
        emitEvent(state, {
          type: 'particle',
          kind: 'spark',
          x: other.x,
          y: other.y,
          vx: 0,
          vy: 0,
          color: '#ffffff',
          size: 3,
          life: 6,
        });
        state.projectiles.splice(i, 1);
      }
    }
    if (deflectedAny && proj.team === 'player') {
      if (state.hitstopTicks < 1) {
        state.hitstopTicks = 1;
        emitEvent(state, { type: 'hitstop', ticks: 1 });
      }
      emitEvent(state, { type: 'shake', trauma: 0.12 });
    }
  }

  // 2. Hit enemies inside arc (slices through walls!)
  if (proj.team === 'player') {
    const meleeKnock = proj.damage >= 20 ? 10.5 : proj.damage >= 12 ? 8.5 : 7.2;
    const enemiesSnap = [...state.enemies];
    for (let i = 0; i < enemiesSnap.length; i++) {
      const e = enemiesSnap[i]!;
      if (e.friendly || e.hp <= 0 || proj.hitIds.includes(e.id)) continue;
      const dx = e.x - originX;
      const dy = e.y - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + e.radius) continue;
      const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - proj.angle));
      if (dist > e.radius + 6 && angDiff > halfArc) continue;

      proj.hitIds.push(e.id);
      const nx = dist > 1e-4 ? dx / dist : Math.cos(proj.angle);
      const ny = dist > 1e-4 ? dy / dist : Math.sin(proj.angle);
      applyDamageToEnemy(state, e, proj.damage, nx * meleeKnock, ny * meleeKnock, rng, {
        isMelee: true,
        isHeavy: proj.damage >= 18,
      });
    }

    // 3. Hit breakable props inside arc
    for (let i = state.props.length - 1; i >= 0; i--) {
      const prop = state.props[i]!;
      if (prop.hp <= 0 || prop.opened || proj.hitIds.includes(prop.id)) continue;
      if (
        prop.kind === 'weapon_chest' ||
        prop.kind === 'big_weapon_chest' ||
        prop.kind === 'ammo_chest' ||
        prop.kind === 'snare_trap'
      ) {
        continue;
      }
      const dx = prop.x - originX;
      const dy = prop.y - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + prop.radius) continue;
      const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - proj.angle));
      if (dist > prop.radius + 6 && angDiff > halfArc) continue;
      proj.hitIds.push(prop.id);
      damageProp(state, prop, proj.damage, rng);
    }
  } else if (state.player.alive && !proj.hitIds.includes(state.player.id)) {
    // Enemy melee slash (e.g. Assassin pipe/blade swing!)
    const p = state.player;
    const dx = p.x - originX;
    const dy = p.y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist <= reach + p.radius) {
      const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - proj.angle));
      if (dist <= p.radius + 6 || angDiff <= halfArc) {
        proj.hitIds.push(p.id);
        applyDamageToPlayer(state, proj.damage, 'ASSASSIN', 'sprMeleeIdle', rng);
      }
    }
  }
}

function splitFlakProjectile(
  state: SimState,
  proj: ProjectileEntity,
  rng: SeededRng,
): void {
  const isSuper = proj.weaponId === 'super_flak_cannon' || proj.weaponId === 'cursed_super_flak_cannon';
  const pellets = isSuper ? 12 : 7;
  for (let k = 0; k < pellets; k++) {
    const ang = (k / pellets) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const spd = rng.range(9, 14);
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'shell',
      team: proj.team,
      x: proj.x,
      y: proj.y,
      prevX: proj.x,
      prevY: proj.y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      angle: ang,
      radius: 3,
      damage: 3,
      lifeTicks: 20,
      maxLifeTicks: 20,
      pierce: 0,
      bounce: hasMutation(state.player, 'shotgun_shoulders') ? 3 : 1,
      explosionRadius: 0,
      sprite: 'sprBullet2',
      hitIds: [],
    });
  }
  emitEvent(state, {
    type: 'sfx',
    sound: isSuper ? 'sndSuperFlakExplode' : 'sndFlakExplode',
    x: proj.x,
    y: proj.y,
    pitchJitter: 0.1,
  });
}

function spawnClusterSubmunitions(
  state: SimState,
  proj: ProjectileEntity,
  rng: SeededRng,
): void {
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const spd = rng.range(4, 7);
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'grenade',
      team: proj.team,
      x: proj.x,
      y: proj.y,
      prevX: proj.x,
      prevY: proj.y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      angle: ang,
      radius: 3,
      damage: 18,
      lifeTicks: 16,
      maxLifeTicks: 16,
      pierce: 0,
      bounce: 1,
      explosionRadius: 24,
      sprite: 'sprGrenade',
      hitIds: [],
    });
  }
}

function finishThrownWeapon(state: SimState, proj: ProjectileEntity, rng: SeededRng): void {
  if (!proj.weaponId) return;
  const player = state.player;
  // Chicken Ultra B (Determination): weapon teleports right back to hand!
  if (player.mutant === 'chicken' && hasUltra(player, 'chicken_b')) {
    const wepDef = getWeaponDef(proj.weaponId);
    const slotObj = {
      weaponId: wepDef.id,
      reloadTicks: 0,
      maxReloadTicks: wepDef.reloadTicks,
      burstRemaining: 0,
      burstTimer: 0,
      kickOffset: 0,
      cursed: wepDef.cursed,
    };
    if (!player.weapons[1]) {
      player.weapons[1] = slotObj;
    } else if (player.weapons[player.activeSlot]?.weaponId === 'chicken_sword' || !player.weapons[player.activeSlot]) {
      player.weapons[player.activeSlot] = slotObj;
    } else {
      spawnPickup(state, 'weapon', player.x, player.y, { weaponId: proj.weaponId }, rng);
    }
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndChickenReturn',
      x: player.x,
      y: player.y,
    });
    return;
  }

  // Otherwise drop weapon on floor where it stopped
  spawnPickup(state, 'weapon', proj.x, proj.y, { weaponId: proj.weaponId }, rng);
}

function bloomPlantSnare(state: SimState, x: number, y: number): void {
  // Replace any existing snare_trap prop
  for (let i = state.props.length - 1; i >= 0; i--) {
    if (state.props[i]!.kind === 'snare_trap') {
      state.props.splice(i, 1);
    }
  }
  const trapper = hasUltra(state.player, 'plant_a');
  state.props.push({
    id: allocEntityId(state),
    kind: 'snare_trap',
    x,
    y,
    radius: trapper ? 76 : 42,
    hp: 999,
    maxHp: 999,
    solid: false,
    opened: false,
    hurtFlashTicks: 0,
    sprite: 'sprTangle',
    lifeTicks: 300,
  });
  emitEvent(state, {
    type: 'sfx',
    sound: trapper ? 'sndPlantSnareTrapper' : 'sndPlantSnare',
    x,
    y,
  });
}

function detonateProjectile(
  state: SimState,
  proj: ProjectileEntity,
  rng: SeededRng,
): void {
  if (proj.kind === 'snare') {
    bloomPlantSnare(state, proj.x, proj.y);
    return;
  }
  if (proj.kind === 'thrown_weapon') {
    finishThrownWeapon(state, proj, rng);
    return;
  }
  if (proj.kind === 'flak') {
    splitFlakProjectile(state, proj, rng);
    if (proj.explosionRadius > 0) {
      spawnExplosion(state, proj.x, proj.y, proj.explosionRadius, proj.damage, proj.team, rng, {
        isFire: true,
        carveWalls: false,
      });
    }
    return;
  }
  if (proj.kind === 'cluster_grenade') {
    spawnExplosion(state, proj.x, proj.y, proj.explosionRadius || 34, proj.damage, proj.team, rng);
    spawnClusterSubmunitions(state, proj, rng);
    return;
  }
  if (proj.explosionRadius > 0) {
    const isBlood = proj.kind === 'blood_grenade';
    const isNuke = proj.kind === 'nuke';
    const isToxic = proj.kind === 'toxic_bolt';
    spawnExplosion(
      state,
      proj.x,
      proj.y,
      proj.explosionRadius,
      proj.damage,
      proj.team,
      rng,
      {
        isBlood,
        isRad: isToxic,
        sound: isNuke
          ? 'sndNukeExplosion'
          : isBlood
            ? 'sndBloodLauncherExplo'
            : proj.kind === 'plasma'
              ? 'sndPlasmaBigExplode'
              : undefined,
      },
    );
  }
}

function removeProjectile(state: SimState, proj: ProjectileEntity): void {
  const idx = state.projectiles.indexOf(proj);
  if (idx !== -1) {
    state.projectiles.splice(idx, 1);
  }
}

/**
 * Steps all active projectiles using swept collision against walls (zero tunneling!),
 * hitboxes, props, melee deflection arcs, Crystal Shield reflection, Bolt Marrow homing,
 * Laser/Lightning beams, Flak splits, Disc self-hits, and explosive blasts.
 */
export function stepProjectiles(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const hasBoltMarrow = hasMutation(player, 'bolt_marrow');
  const hasShotgunShoulders = hasMutation(player, 'shotgun_shoulders');
  const eyesProjectileHold =
    player.alive &&
    player.mutant === 'eyes' &&
    player.telekinesisActive &&
    hasUltra(player, 'eyes_a');

  // Iterate over a stable snapshot so explosions, melee deflection/destruction,
  // and rad beams that splice state.projectiles mid-tick can never corrupt indices.
  const snapshot = [...state.projectiles];
  for (let sIdx = snapshot.length - 1; sIdx >= 0; sIdx--) {
    const proj = snapshot[sIdx]!;
    if (!state.projectiles.includes(proj)) continue;

    proj.prevX = proj.x;
    proj.prevY = proj.y;
    proj.lifeTicks -= 1;

    // 1. Melee slash arc (runs over its short active duration, slices through walls)
    if (proj.kind === 'melee_slash') {
      resolveMeleeSlash(state, proj, rng);
      if (proj.lifeTicks <= 0) {
        removeProjectile(state, proj);
      }
      continue;
    }

    // 2. Eyes Ultra A (Projectile Style): suspend own projectiles while telekinesis is held
    if (eyesProjectileHold && proj.team === 'player' && proj.kind !== 'snare') {
      proj.lifeTicks += 1; // don't expire while suspended
      continue;
    }

    // 3. Disc gun becomes hazardous to the player after initial clearance
    if (proj.kind === 'disc' && proj.maxLifeTicks - proj.lifeTicks >= 6) {
      proj.canHitPlayer = true;
    }

    // 4. Homing for Bolt Marrow / Seeking Bolts / Smart Gun
    if (
      proj.team === 'player' &&
      (proj.kind === 'seeking_bolt' ||
        (hasBoltMarrow &&
          (proj.kind === 'bolt' || proj.kind === 'splinter' || proj.kind === 'toxic_bolt')))
    ) {
      const target = findNearestHostile(state, proj.x, proj.y, 130, proj.hitIds);
      if (target) {
        const desiredAngle = Math.atan2(target.y - proj.y, target.x - proj.x);
        const diff = normalizeAngle(desiredAngle - proj.angle);
        const maxTurn = proj.kind === 'seeking_bolt' ? 0.24 : 0.34;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        proj.angle = normalizeAngle(proj.angle + turn);
        const speed = Math.hypot(proj.vx, proj.vy) || 14;
        proj.vx = Math.cos(proj.angle) * speed;
        proj.vy = Math.sin(proj.angle) * speed;
      }
    }

    // 5. Velocity damping for flames / grenades
    if (proj.kind === 'flame' || proj.kind === 'enemy_flame') {
      proj.vx *= 0.92;
      proj.vy *= 0.92;
    } else if (
      proj.kind === 'grenade' ||
      proj.kind === 'cluster_grenade' ||
      proj.kind === 'blood_grenade'
    ) {
      proj.vx *= 0.95;
      proj.vy *= 0.95;
    }

    // 6. Horror Rad Beam clears opposing enemy projectiles in flight
    if (proj.kind === 'rad_beam' && proj.team === 'player') {
      for (let j = state.projectiles.length - 1; j >= 0; j--) {
        const other = state.projectiles[j]!;
        if (other === proj) continue;
        if (other.team === 'enemy' && circleOverlap(proj.x, proj.y, proj.radius + 6, other.x, other.y, other.radius)) {
          state.projectiles.splice(j, 1);
        }
      }
    }

    // 7. Swept wall collision (ZERO tunneling at any speed!)
    const nextX = proj.x + proj.vx;
    const nextY = proj.y + proj.vy;
    const rayRadius =
      proj.kind === 'laser' || proj.kind === 'enemy_laser' || proj.kind === 'lightning'
        ? 0
        : Math.min(3, proj.radius * 0.5);
    const wallHit = sweptRayTile(state.map, proj.x, proj.y, nextX, nextY, rayRadius);

    const endX = wallHit.hit ? wallHit.hitX : nextX;
    const endY = wallHit.hit ? wallHit.hitY : nextY;

    let destroyed = false;

    // 8. Swept entity hits along (proj.x, proj.y) -> (endX, endY)
    if (proj.team === 'player') {
      // Check enemies sorted by earliest swept hit t
      const hits: Array<{ enemy: EnemyEntity; t: number; hx: number; hy: number }> = [];
      for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
        const enemy = state.enemies[eIdx]!;
        if (enemy.friendly || enemy.hp <= 0 || enemy.invulnerable || proj.hitIds.includes(enemy.id)) {
          continue;
        }
        const hit = segmentCircleHit(
          proj.x,
          proj.y,
          endX,
          endY,
          enemy.x,
          enemy.y,
          enemy.radius + proj.radius,
        );
        if (hit.hit) {
          hits.push({ enemy, t: hit.t, hx: hit.hitX, hy: hit.hitY });
        }
      }
      hits.sort((a, b) => a.t - b.t);

      for (let h = 0; h < hits.length; h++) {
        const rec = hits[h]!;
        if (rec.enemy.hp <= 0) continue;
        proj.hitIds.push(rec.enemy.id);

        const spd = Math.hypot(proj.vx, proj.vy) || 1;
        const nx = proj.vx / spd;
        const ny = proj.vy / spd;
        const knockMag = computeProjectileKnockback(proj);

        const killed = applyDamageToEnemy(state, rec.enemy, proj.damage, nx * knockMag, ny * knockMag, rng, {
          fromBullet: proj.kind === 'bullet' || proj.kind === 'heavy_bullet',
          isHeavy: proj.damage >= 18,
        });

        // Lightning chains to a nearby second enemy!
        if (proj.kind === 'lightning') {
          const chain = findNearestHostile(state, rec.enemy.x, rec.enemy.y, 76, proj.hitIds);
          if (chain) {
            proj.hitIds.push(chain.id);
            applyDamageToEnemy(state, chain, Math.ceil(proj.damage * 0.75), 0, 0, rng);
            emitEvent(state, {
              type: 'sfx',
              sound: 'sndLightningHit',
              x: chain.x,
              y: chain.y,
              pitchJitter: 0.15,
            });
          }
        }

        if (proj.kind === 'snare') {
          proj.x = rec.hx;
          proj.y = rec.hy;
          bloomPlantSnare(state, rec.hx, rec.hy);
          destroyed = true;
          break;
        }

        // Authentic Nuclear Throne bolt overkill pierce: bolts killing an enemy skewer through!
        const boltOverkillPierce =
          killed &&
          (proj.kind === 'bolt' ||
            proj.kind === 'splinter' ||
            proj.kind === 'toxic_bolt' ||
            proj.kind === 'seeking_bolt');

        if (boltOverkillPierce) {
          // Carry straight through the killed enemy without burning pierce!
        } else if (proj.pierce > 0) {
          proj.pierce -= 1;
        } else {
          proj.x = rec.hx;
          proj.y = rec.hy;
          detonateProjectile(state, proj, rng);
          destroyed = true;
          break;
        }
      }
    }

    // 8b. Check breakable cover props along segment for BOTH player AND enemy projectiles!
    // (Cars, pillars, barrels, cacti, generators act as genuine destructible tactical cover!)
    if (!destroyed) {
      for (let pIdx = state.props.length - 1; pIdx >= 0; pIdx--) {
        const prop = state.props[pIdx]!;
        if (prop.hp <= 0 || prop.opened || proj.hitIds.includes(prop.id)) continue;
        if (proj.team === 'player') {
          if (
            prop.kind === 'weapon_chest' ||
            prop.kind === 'big_weapon_chest' ||
            prop.kind === 'ammo_chest' ||
            prop.kind === 'snare_trap'
          ) {
            continue;
          }
        } else {
          // Enemy projectiles collide with solid/cover props (cars, barrels, pillars, cacti), not chests
          if (!ENEMY_COVER_PROP_KINDS.has(prop.kind)) continue;
        }

        const hit = segmentCircleHit(
          proj.x,
          proj.y,
          endX,
          endY,
          prop.x,
          prop.y,
          prop.radius + proj.radius,
        );
        if (hit.hit) {
          proj.hitIds.push(prop.id);
          damageProp(state, prop, proj.team === 'player' ? proj.damage : Math.max(1, Math.min(3, proj.damage)), rng);
          if (proj.pierce > 0) {
            proj.pierce -= 1;
          } else {
            proj.x = hit.hitX;
            proj.y = hit.hitY;
            detonateProjectile(state, proj, rng);
            destroyed = true;
            break;
          }
        }
      }
    }

    // 9. Enemy projectiles (or player Disc self-hit) vs Player + Crystal Shield reflection!
    if (!destroyed && (proj.team === 'enemy' || proj.canHitPlayer) && player.alive) {
      const hitP = segmentCircleHit(
        proj.x,
        proj.y,
        endX,
        endY,
        player.x,
        player.y,
        player.radius + proj.radius,
      );
      if (hitP.hit) {
        if (player.shielding && proj.team === 'enemy') {
          // Crystal Shield reflects enemy projectiles back!
          proj.team = 'player';
          proj.vx = -proj.vx * 1.4;
          proj.vy = -proj.vy * 1.4;
          proj.angle = Math.atan2(proj.vy, proj.vx);
          proj.damage = Math.max(proj.damage * 2, 8);
          proj.lifeTicks = Math.max(proj.lifeTicks, 45);
          proj.hitIds = [];
          emitEvent(state, {
            type: 'sfx',
            sound: 'sndCrystalRicochet',
            x: player.x,
            y: player.y,
            pitchJitter: 0.12,
          });
        } else {
          proj.x = hitP.hitX;
          proj.y = hitP.hitY;
          const isFire = proj.kind === 'enemy_flame' || proj.kind === 'flame';
          if (proj.explosionRadius > 0) {
            detonateProjectile(state, proj, rng);
          } else {
            applyDamageToPlayer(
              state,
              proj.damage,
              proj.kind === 'disc' ? 'DISC GUN' : 'PROJECTILE',
              proj.sprite,
              rng,
              { isFire },
            );
          }
          destroyed = true;
        }
      }
    }

    // Enemy projectiles vs friendly allies/saplings
    if (!destroyed && proj.team === 'enemy') {
      for (let eIdx = state.enemies.length - 1; eIdx >= 0; eIdx--) {
        const ally = state.enemies[eIdx]!;
        if (!ally.friendly || ally.hp <= 0) continue;
        const hitA = segmentCircleHit(
          proj.x,
          proj.y,
          endX,
          endY,
          ally.x,
          ally.y,
          ally.radius + proj.radius,
        );
        if (hitA.hit) {
          applyDamageToEnemy(state, ally, proj.damage, proj.vx * 0.2, proj.vy * 0.2, rng);
          destroyed = true;
          break;
        }
      }
    }

    if (destroyed) {
      removeProjectile(state, proj);
      continue;
    }

    // 10. Resolve wall impact: bounce or terminate
    if (wallHit.hit) {
      // Step slightly back from wall normal so projectile stays strictly inside walkable space
      const backoffX = wallHit.hitX + wallHit.normalX * 1.5;
      const backoffY = wallHit.hitY + wallHit.normalY * 1.5;

      if (proj.bounce > 0) {
        proj.bounce -= 1;
        proj.x = backoffX;
        proj.y = backoffY;
        const dot = proj.vx * wallHit.normalX + proj.vy * wallHit.normalY;
        const bounceDamp =
          proj.kind === 'shell' && hasShotgunShoulders
            ? 0.96
            : proj.kind === 'disc'
              ? 1.0
              : 0.82;
        proj.vx = (proj.vx - 2 * dot * wallHit.normalX) * bounceDamp;
        proj.vy = (proj.vy - 2 * dot * wallHit.normalY) * bounceDamp;
        proj.angle = Math.atan2(proj.vy, proj.vx);
        if (proj.kind === 'shell' && hasShotgunShoulders) {
          proj.lifeTicks = Math.min(proj.maxLifeTicks + 12, proj.lifeTicks + 8);
        }
        if (proj.kind === 'disc') {
          proj.canHitPlayer = true;
          emitEvent(state, { type: 'sfx', sound: 'sndDiscBounce', x: proj.x, y: proj.y, pitchJitter: 0.1 });
        } else if (proj.kind === 'shell') {
          emitEvent(state, { type: 'sfx', sound: 'sndShotgunHitWall', x: proj.x, y: proj.y, pitchJitter: 0.12 });
        }
      } else {
        proj.x = backoffX;
        proj.y = backoffY;
        detonateProjectile(state, proj, rng);
        emitEvent(state, {
          type: 'particle',
          kind: 'wall_spark',
          x: wallHit.hitX,
          y: wallHit.hitY,
          vx: wallHit.normalX * 2,
          vy: wallHit.normalY * 2,
          color: '#e8d8b0',
          size: 2,
          life: 5,
        });
        removeProjectile(state, proj);
        continue;
      }
    } else {
      proj.x = endX;
      proj.y = endY;
    }

    // 11. Lifetime expiration
    if (proj.lifeTicks <= 0) {
      detonateProjectile(state, proj, rng);
      removeProjectile(state, proj);
    }
  }

  // Corpse bowling physics: high-velocity flying corpses slam into, knock back, and chain-kill enemies!
  const hasImpactWrists = hasMutation(player, 'impact_wrists');
  const minCorpseSpeedSq = hasImpactWrists ? 3.2 : 7.5;
  const rt = getAreaRuntime(state);

  for (let cIdx = 0; cIdx < state.corpses.length; cIdx++) {
    const c = state.corpses[cIdx]!;
    if (c.baked) continue;
    const spdSq = c.vx * c.vx + c.vy * c.vy;
    if (spdSq < minCorpseSpeedSq) continue;

    let hitSet = rt.corpseHitTargets.get(c.id);
    const spd = Math.sqrt(spdSq);
    const hitRadius = Math.max(6, Math.min(10, c.size * 0.55));

    for (let eIdx = state.enemies.length - 1; eIdx >= 0; eIdx--) {
      const e = state.enemies[eIdx]!;
      if (e.friendly || e.hp <= 0 || e.invulnerable) continue;
      if (hitSet?.has(e.id)) continue;

      if (circleOverlap(c.x, c.y, hitRadius, e.x, e.y, e.radius)) {
        if (!hitSet) {
          hitSet = new Set<number>();
          rt.corpseHitTargets.set(c.id, hitSet);
        }
        hitSet.add(e.id);

        const dmg = hasImpactWrists
          ? Math.max(6, Math.round(spd * 1.75))
          : Math.max(3, Math.round(spd * 0.85));
        const killed = applyDamageToEnemy(
          state,
          e,
          dmg,
          c.vx * (hasImpactWrists ? 0.95 : 0.65),
          c.vy * (hasImpactWrists ? 0.95 : 0.65),
          rng,
          { isHeavy: hasImpactWrists && spd >= 6 },
        );

        c.vx *= hasImpactWrists ? 0.72 : 0.55;
        c.vy *= hasImpactWrists ? 0.72 : 0.55;

        emitEvent(state, {
          type: 'corpse_impact',
          x: e.x,
          y: e.y,
          speed: spd,
          targetId: e.id,
          killed,
        });
        emitEvent(state, {
          type: 'sfx',
          sound: hasImpactWrists ? 'sndImpWristHit' : 'sndHitFlesh',
          x: c.x,
          y: c.y,
          pitchJitter: 0.12,
        });
        if (hasImpactWrists && killed && state.hitstopTicks < 2) {
          state.hitstopTicks = 2;
          emitEvent(state, { type: 'hitstop', ticks: 2 });
        }
      }
    }
  }
}
