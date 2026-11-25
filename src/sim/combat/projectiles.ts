import type { EnemyEntity, ProjectileEntity, ProjectileKind, PropKind, SimState } from '@/contracts';
import { getWeaponDef } from '@/data';
import {
  SeededRng,
  allocEntityId,
  circleOverlap,
  emitEvent,
  findNearestFloor,
  hasLineOfSight,
  moveCircleWithSlide,
  segmentCircleHit,
  sweptRayTile,
} from '@/sim/core';
import { getAreaRuntime } from '@/sim/entities/runtime';
import {
  addHorrorAbsorbedRads,
  applyDamageToEnemy,
  applyDamageToPlayer,
  damageProp,
  hasMutation,
  hasUltra,
  healPlayer,
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

// Projectiles that Crystal Shield can authentically reflect (excludes beams, flames, missiles, melee)
const CRYSTAL_REFLECTABLE_KINDS: ReadonlySet<ProjectileKind> = new Set([
  'enemy_bullet',
  'idpd_bullet',
  'boss_orb',
  'enemy_plasma',
  'bullet',
  'heavy_bullet',
  'shell',
  'slug',
  'bolt',
  'splinter',
  'seeking_bolt',
  'toxic_bolt',
]);

// Tracks Sticky Launcher grenades latched onto an enemy or wall until their fuse pops
const stickyTargets = new WeakMap<
  ProjectileEntity,
  { enemy: EnemyEntity | null; offsetX: number; offsetY: number }
>();

// Tracks player grenades already batted by a specific melee slash so multi-tick arcs bat once
const meleeBattedIds = new WeakMap<ProjectileEntity, Set<number>>();

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
  requireLos: boolean = false,
): EnemyEntity | null {
  let best: EnemyEntity | null = null;
  let bestDistSq = maxRange * maxRange;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.friendly || e.hp <= 0 || e.invulnerable || e.aiState === 'disguised') continue;
    if (requireLos && e.elevated) continue;
    if (excludeIds && excludeIds.includes(e.id)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDistSq) {
      if (requireLos && !hasLineOfSight(state.map, x, y, e.x, e.y)) continue;
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

  // 1. Deflect/destroy opposing projectiles & bat player's own grenades inside melee arc!
  if (proj.deflectsProjectiles || proj.destroysProjectiles) {
    let deflectedAny = false;
    let battedSet = meleeBattedIds.get(proj);

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const other = state.projectiles[i]!;
      if (other.id === proj.id) continue;
      if (other.kind === 'melee_slash' || other.kind === 'laser' || other.kind === 'enemy_laser') {
        continue;
      }

      // Player melee swings can bat their own grenades forward at high speed!
      if (other.team === proj.team) {
        if (
          proj.team === 'player' &&
          proj.deflectsProjectiles &&
          (other.kind === 'grenade' || other.kind === 'cluster_grenade' || other.kind === 'blood_grenade') &&
          !stickyTargets.has(other) &&
          !battedSet?.has(other.id)
        ) {
          const segHit = segmentCircleHit(
            other.prevX,
            other.prevY,
            other.x,
            other.y,
            originX,
            originY,
            reach + other.radius + 5,
          );
          if (segHit.hit) {
            const dx = segHit.hitX - originX;
            const dy = segHit.hitY - originY;
            const dist = Math.hypot(dx, dy);
            const angDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - proj.angle));
            if (dist <= 11 || angDiff <= halfArc + 0.25) {
              if (!battedSet) {
                battedSet = new Set<number>();
                meleeBattedIds.set(proj, battedSet);
              }
              battedSet.add(other.id);
              other.vx = Math.cos(proj.angle) * 14;
              other.vy = Math.sin(proj.angle) * 14;
              other.angle = proj.angle;
              other.lifeTicks = Math.max(other.lifeTicks, 24);
              deflectedAny = true;
              emitEvent(state, {
                type: 'sfx',
                sound: 'sndMeleeFlip',
                x: other.x,
                y: other.y,
                pitchJitter: 0.1,
              });
            }
          }
        }
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

      // Enemy flames are snuffed/destroyed rather than reflected into player fireballs!
      if (proj.deflectsProjectiles && other.kind !== 'enemy_flame') {
        other.team = proj.team;
        const speed = Math.max(11, Math.hypot(other.vx, other.vy) * 1.55);
        other.vx = Math.cos(proj.angle) * speed;
        other.vy = Math.sin(proj.angle) * speed;
        other.angle = proj.angle;
        if (proj.team === 'enemy') {
          // Cap enemy-reflected player shots so Assassins never 1-shot the player with a reflected Slug/Bolt!
          other.damage = Math.max(2, Math.min(4, Math.ceil(other.damage * 0.2)));
          other.explosionRadius = 0;
        } else {
          other.damage = Math.max(other.damage * 2, 10);
        }
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
      } else if (proj.destroysProjectiles || other.kind === 'enemy_flame') {
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
    const isBloodHammer = proj.weaponId === 'blood_hammer';
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
      const killed = applyDamageToEnemy(state, e, proj.damage, nx * meleeKnock, ny * meleeKnock, rng, {
        isMelee: true,
        isHeavy: proj.damage >= 18,
      });

      // Blood Hammer: triggers blood blast on hit and heals +1 HP on kill!
      if (isBloodHammer) {
        spawnExplosion(state, e.x, e.y, 26, 18, 'player', rng, {
          carveWalls: false,
          clearsProjectiles: true,
          isBlood: true,
          selfDamage: false,
          sound: 'sndCorpseExplo',
        });
        if (killed) {
          healPlayer(state, 1);
        }
      }
    }

    // 3. Hit breakable props inside arc (snapshot array for chain-explosion safety)
    const propsSnap = [...state.props];
    for (let i = 0; i < propsSnap.length; i++) {
      const prop = propsSnap[i]!;
      if (!state.props.includes(prop) || prop.hp <= 0 || prop.opened || proj.hitIds.includes(prop.id)) continue;
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
  // Flare Gun & Flame Cannon split into radial FLAME puffs, not shotgun pellets!
  if (proj.weaponId === 'flare_gun' || proj.weaponId === 'flame_cannon') {
    const flameCount = proj.weaponId === 'flame_cannon' ? 12 : 8;
    for (let k = 0; k < flameCount; k++) {
      const ang = (k / flameCount) * Math.PI * 2 + rng.range(-0.22, 0.22);
      const spd = rng.range(5, 9.5);
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'flame',
        team: proj.team,
        x: proj.x,
        y: proj.y,
        prevX: proj.x,
        prevY: proj.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        angle: ang,
        radius: 4,
        damage: 3,
        lifeTicks: 24,
        maxLifeTicks: 24,
        pierce: 2,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprFlameBall',
        weaponId: proj.weaponId,
        hitIds: [],
      });
    }
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndFlare',
      x: proj.x,
      y: proj.y,
      pitchJitter: 0.12,
    });
    return;
  }

  const isSuper = proj.weaponId === 'super_flak_cannon' || proj.weaponId === 'cursed_super_flak_cannon';
  const hasShoulders = hasMutation(state.player, 'shotgun_shoulders');
  const pellets = isSuper ? 12 : 7;
  const subLife = hasShoulders ? 28 : 20;
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
      lifeTicks: subLife,
      maxLifeTicks: subLife,
      pierce: 0,
      bounce: hasShoulders ? 3 : 1,
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

function splitPlasmaProjectile(
  state: SimState,
  proj: ProjectileEntity,
  rng: SeededRng,
): void {
  const hasLaserBrain = hasMutation(state.player, 'laser_brain');
  const wId = proj.weaponId;
  if (!wId || wId === 'plasma_mini') return;

  if (wId === 'lightning_cannon') {
    const bolts = hasLaserBrain ? 6 : 4;
    const dmg = Math.round(14 * (hasLaserBrain ? 1.35 : 1.0));
    for (let k = 0; k < bolts; k++) {
      const ang = (k / bolts) * Math.PI * 2 + rng.range(-0.2, 0.2);
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'lightning',
        team: proj.team,
        x: proj.x,
        y: proj.y,
        prevX: proj.x,
        prevY: proj.y,
        vx: Math.cos(ang) * 24,
        vy: Math.sin(ang) * 24,
        angle: ang,
        radius: 3.5,
        damage: dmg,
        lifeTicks: hasLaserBrain ? 11 : 8,
        maxLifeTicks: hasLaserBrain ? 11 : 8,
        pierce: hasLaserBrain ? 2 : 1,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprLightning',
        weaponId: 'lightning_cannon_arc',
        hitIds: [],
      });
    }
    return;
  }

  if (wId === 'super_plasma_cannon') {
    const count = hasLaserBrain ? 7 : 5;
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const spd = rng.range(6.5, 10.5);
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'plasma',
        team: proj.team,
        x: proj.x,
        y: proj.y,
        prevX: proj.x,
        prevY: proj.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        angle: ang,
        radius: 5,
        damage: Math.round(24 * (hasLaserBrain ? 1.25 : 1.0)),
        lifeTicks: 20,
        maxLifeTicks: 20,
        pierce: 0,
        bounce: 0,
        explosionRadius: 34,
        sprite: 'sprPlasmaBallBig',
        weaponId: 'plasma_cannon_sub',
        hitIds: [],
      });
    }
    return;
  }

  if (
    wId === 'plasma_cannon' ||
    wId === 'cursed_plasma_cannon' ||
    wId === 'devastator' ||
    wId === 'plasma_cannon_sub'
  ) {
    const count = hasLaserBrain ? 6 : 4;
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const spd = rng.range(6, 9.5);
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'plasma',
        team: proj.team,
        x: proj.x,
        y: proj.y,
        prevX: proj.x,
        prevY: proj.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        angle: ang,
        radius: 4,
        damage: Math.round(10 * (hasLaserBrain ? 1.25 : 1.0)),
        lifeTicks: 14,
        maxLifeTicks: 14,
        pierce: 0,
        bounce: 0,
        explosionRadius: 16,
        sprite: 'sprPlasmaBall',
        weaponId: 'plasma_mini',
        hitIds: [],
      });
    }
    return;
  }

  // Standard Plasma Gun / Rifle / Minigun / Golden / IDPD split into fast mini plasma orbs
  const count = hasLaserBrain ? 3 : 2;
  for (let k = 0; k < count; k++) {
    const ang = (k / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const spd = rng.range(6, 9.5);
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'plasma',
      team: proj.team,
      x: proj.x,
      y: proj.y,
      prevX: proj.x,
      prevY: proj.y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      angle: ang,
      radius: 3.5,
      damage: Math.round(7 * (hasLaserBrain ? 1.25 : 1.0)),
      lifeTicks: 12,
      maxLifeTicks: 12,
      pierce: 0,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprPlasmaBall',
      weaponId: 'plasma_mini',
      hitIds: [],
    });
  }
}

function spawnToxicCloud(
  state: SimState,
  x: number,
  y: number,
  team: 'player' | 'enemy',
  rng: SeededRng,
): void {
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2 + rng.range(-0.35, 0.35);
    const spd = rng.range(0.7, 1.9);
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'flame',
      team,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      angle: ang,
      radius: 7,
      damage: 2,
      lifeTicks: 42,
      maxLifeTicks: 42,
      pierce: 5,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprToxicBolt',
      weaponId: 'toxic_cloud',
      hitIds: [],
    });
    emitEvent(state, {
      type: 'particle',
      kind: 'toxic',
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      color: '#4de054',
      size: 5,
      life: 16,
    });
  }
  emitEvent(state, {
    type: 'sfx',
    sound: 'sndToxicBoltGas',
    x,
    y,
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
  const alreadyHoldingSword =
    proj.weaponId === 'chicken_sword' &&
    (player.weapons[0]?.weaponId === 'chicken_sword' || player.weapons[1]?.weaponId === 'chicken_sword');

  // Chicken Ultra B (Determination): weapon teleports right back to hand!
  if (player.mutant === 'chicken' && hasUltra(player, 'chicken_b')) {
    if (alreadyHoldingSword) {
      emitEvent(state, { type: 'sfx', sound: 'sndChickenReturn', x: player.x, y: player.y });
      return;
    }
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
      spawnPickup(state, 'weapon', player.x, player.y, { weaponId: proj.weaponId, value: 0 }, rng);
    }
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndChickenReturn',
      x: player.x,
      y: player.y,
    });
    return;
  }

  // Never duplicate chicken_sword on the floor if Chicken already holds one
  if (alreadyHoldingSword) return;

  // Drop thrown weapon on floor with value: 0 (no pickup ammo/HP exploit!)
  spawnPickup(state, 'weapon', proj.x, proj.y, { weaponId: proj.weaponId, value: 0 }, rng);
}

function bloomPlantSnare(state: SimState, x: number, y: number): void {
  // Replace any existing snare_trap prop
  for (let i = state.props.length - 1; i >= 0; i--) {
    if (state.props[i]!.kind === 'snare_trap') {
      state.props.splice(i, 1);
    }
  }
  const safe = findNearestFloor(state.map, x, y, 6);
  const trapper = hasUltra(state.player, 'plant_a');
  const hasTB = hasMutation(state.player, 'throne_butt');
  // Plant Snare persists indefinitely until recast (NT parity — omit lifeTicks!)
  state.props.push({
    id: allocEntityId(state),
    kind: 'snare_trap',
    x: safe.x,
    y: safe.y,
    radius: trapper ? 76 : 42,
    hp: 999,
    maxHp: 999,
    solid: false,
    opened: false,
    hurtFlashTicks: 0,
    sprite: 'sprTangle',
  });
  emitEvent(state, {
    type: 'sfx',
    sound: trapper
      ? hasTB
        ? 'sndPlantSnareTrapperTB'
        : 'sndPlantSnareTrapper'
      : hasTB
        ? 'sndPlantSnareTB'
        : 'sndPlantSnare',
    x: safe.x,
    y: safe.y,
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
  if (proj.kind === 'plasma') {
    const hasLaserBrain = hasMutation(state.player, 'laser_brain');
    if (proj.explosionRadius > 0) {
      spawnExplosion(state, proj.x, proj.y, proj.explosionRadius, proj.damage, proj.team, rng, {
        isRad: true,
        selfDamage: false,
        sound:
          proj.explosionRadius >= 40
            ? hasLaserBrain
              ? 'sndPlasmaBigExplodeUpg'
              : 'sndPlasmaBigExplode'
            : 'sndPlasmaHit',
      });
    }
    splitPlasmaProjectile(state, proj, rng);
    return;
  }
  if (proj.kind === 'toxic_bolt' || proj.weaponId === 'toxic_launcher') {
    if (proj.explosionRadius > 0) {
      spawnExplosion(state, proj.x, proj.y, proj.explosionRadius, proj.damage, proj.team, rng, {
        isRad: true,
        selfDamage: false,
        carveWalls: proj.weaponId === 'toxic_launcher',
        sound: 'sndToxicBoltGas',
      });
    }
    spawnToxicCloud(state, proj.x, proj.y, proj.team, rng);
    return;
  }
  if (proj.explosionRadius > 0) {
    const isBlood = proj.kind === 'blood_grenade';
    const isNuke = proj.kind === 'nuke';
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
        // Blood Launcher & Blood Cannon CAN hurt the player and detonate nearby corpses!
        selfDamage: isBlood ? true : undefined,
        detonateCorpses: isBlood,
        sound: isNuke
          ? 'sndNukeExplosion'
          : isBlood
            ? 'sndBloodLauncherExplo'
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
        // Blood Hammer self-damage on missed swing!
        if (proj.team === 'player' && proj.weaponId === 'blood_hammer' && proj.hitIds.length === 0) {
          applyDamageToPlayer(state, 1, 'BLOOD HAMMER', 'sprBloodHammer', rng, {
            ignoreIframes: true,
            bypassShield: true,
          });
          emitEvent(state, {
            type: 'sfx',
            sound: 'sndBloodHurt',
            x: player.x,
            y: player.y,
          });
        }
        removeProjectile(state, proj);
      }
      continue;
    }

    // 1b. Static visual laser beam segment (already resolved hitscan; fades out cleanly)
    if (proj.kind === 'laser' && proj.damage === 0 && proj.vx === 0 && proj.vy === 0) {
      if (proj.lifeTicks <= 0) {
        removeProjectile(state, proj);
      }
      continue;
    }

    // 1c. Player hitscan Laser beam: resolves full-corridor instant piercing ray on tick 1!
    if (proj.kind === 'laser' && proj.team === 'player' && proj.damage > 0) {
      const hasLaserBrain = hasMutation(player, 'laser_brain');
      const maxRange = hasLaserBrain ? 420 : 320;
      const cosA = Math.cos(proj.angle);
      const sinA = Math.sin(proj.angle);
      const rayEnd = sweptRayTile(
        state.map,
        proj.x,
        proj.y,
        proj.x + cosA * maxRange,
        proj.y + sinA * maxRange,
        0,
      );
      const endX = rayEnd.hit ? rayEnd.hitX : proj.x + cosA * maxRange;
      const endY = rayEnd.hit ? rayEnd.hitY : proj.y + sinA * maxRange;

      // Hit every hostile enemy along the laser beam
      const laserHits: Array<{ enemy: EnemyEntity; t: number }> = [];
      for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
        const enemy = state.enemies[eIdx]!;
        if (enemy.friendly || enemy.hp <= 0 || enemy.invulnerable || proj.hitIds.includes(enemy.id)) {
          continue;
        }
        const hit = segmentCircleHit(proj.x, proj.y, endX, endY, enemy.x, enemy.y, enemy.radius + 3.5);
        if (hit.hit) {
          laserHits.push({ enemy, t: hit.t });
        }
      }
      laserHits.sort((a, b) => a.t - b.t);
      for (let h = 0; h < laserHits.length; h++) {
        const enemy = laserHits[h]!.enemy;
        if (enemy.hp <= 0) continue;
        proj.hitIds.push(enemy.id);
        applyDamageToEnemy(state, enemy, proj.damage, cosA * 5.2, sinA * 5.2, rng, {
          isHeavy: proj.damage >= 18,
        });
      }

      // Hit breakable props along the beam (snapshot for chain-explosion safety)
      const laserPropsSnap = [...state.props];
      for (let pIdx = 0; pIdx < laserPropsSnap.length; pIdx++) {
        const prop = laserPropsSnap[pIdx]!;
        if (!state.props.includes(prop) || prop.hp <= 0 || prop.opened) continue;
        if (
          prop.kind === 'weapon_chest' ||
          prop.kind === 'big_weapon_chest' ||
          prop.kind === 'ammo_chest' ||
          prop.kind === 'snare_trap'
        ) {
          continue;
        }
        const hit = segmentCircleHit(proj.x, proj.y, endX, endY, prop.x, prop.y, prop.radius + 3);
        if (hit.hit) {
          damageProp(state, prop, proj.damage, rng);
        }
      }

      // Ion Cannon impact detonation at beam endpoint (zero self-damage)
      if (proj.explosionRadius > 0) {
        spawnExplosion(state, endX, endY, proj.explosionRadius, Math.round(proj.damage * 0.75), 'player', rng, {
          isRad: false,
          selfDamage: false,
          sound: hasLaserBrain ? 'sndPlasmaBigExplodeUpg' : 'sndPlasmaBigExplode',
        });
      }

      // Spawn continuous visual beam segments for the renderer (30px segment draw length)
      const beamLen = Math.hypot(endX - proj.x, endY - proj.y);
      const segLife = hasLaserBrain ? 6 : 4;
      const stepDist = 26;
      const segCount = Math.max(1, Math.ceil(beamLen / stepDist));
      for (let seg = 1; seg <= segCount; seg++) {
        const dist = Math.min(beamLen, seg * stepDist);
        const sx = proj.x + cosA * dist;
        const sy = proj.y + sinA * dist;
        state.projectiles.push({
          id: allocEntityId(state),
          kind: 'laser',
          team: 'player',
          x: sx,
          y: sy,
          prevX: sx,
          prevY: sy,
          vx: 0,
          vy: 0,
          angle: proj.angle,
          radius: 3,
          damage: 0,
          lifeTicks: segLife,
          maxLifeTicks: segLife,
          pierce: 0,
          bounce: 0,
          explosionRadius: 0,
          sprite: proj.sprite,
          weaponId: proj.weaponId,
          hitIds: [],
          isUltra: proj.isUltra,
        });
      }
      if (rayEnd.hit) {
        emitEvent(state, {
          type: 'particle',
          kind: 'wall_spark',
          x: endX,
          y: endY,
          vx: rayEnd.normalX * 2,
          vy: rayEnd.normalY * 2,
          color: '#ff6666',
          size: 3,
          life: 6,
        });
      }
      removeProjectile(state, proj);
      continue;
    }

    // 1d. Sticky Launcher latched grenade: rides stuck enemy/wall until fuse expires
    const stuck = stickyTargets.get(proj);
    if (stuck) {
      if (stuck.enemy && stuck.enemy.hp > 0) {
        proj.x = stuck.enemy.x + stuck.offsetX;
        proj.y = stuck.enemy.y + stuck.offsetY;
      }
      if (proj.lifeTicks <= 0) {
        stickyTargets.delete(proj);
        detonateProjectile(state, proj, rng);
        removeProjectile(state, proj);
      }
      continue;
    }

    // 2. Eyes Ultra A (Projectile Style): suspend own projectiles in place while still allowing pulled enemies to collide!
    const suspendedByEyes = eyesProjectileHold && proj.team === 'player' && proj.kind !== 'snare';
    if (suspendedByEyes) {
      proj.lifeTicks += 1; // preserve lifetime while suspended
    }

    // 3. Disc gun becomes hazardous to the player after initial clearance
    if (proj.kind === 'disc' && proj.maxLifeTicks - proj.lifeTicks >= 6) {
      proj.canHitPlayer = true;
    }

    // 4. Homing for Bolt Marrow / Seeking Bolts / Smart Gun (LOS-gated so shots don't curve into walls!)
    if (
      !suspendedByEyes &&
      proj.team === 'player' &&
      (proj.kind === 'seeking_bolt' ||
        proj.weaponId === 'smart_gun' ||
        (hasBoltMarrow &&
          (proj.kind === 'bolt' || proj.kind === 'splinter' || proj.kind === 'toxic_bolt')))
    ) {
      const target = findNearestHostile(state, proj.x, proj.y, 145, proj.hitIds, true);
      if (target) {
        const desiredAngle = Math.atan2(target.y - proj.y, target.x - proj.x);
        const diff = normalizeAngle(desiredAngle - proj.angle);
        const maxTurn = proj.kind === 'seeking_bolt' ? 0.26 : proj.weaponId === 'smart_gun' ? 0.22 : 0.34;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        proj.angle = normalizeAngle(proj.angle + turn);
        const speed = Math.hypot(proj.vx, proj.vy) || 14;
        proj.vx = Math.cos(proj.angle) * speed;
        proj.vy = Math.sin(proj.angle) * speed;
      }
    }

    // 4b. Ultra Grenade Launcher pulls nearby enemies & rads toward the grenade in flight!
    if (!suspendedByEyes && proj.weaponId === 'ultra_grenade_launcher' && proj.team === 'player') {
      const pullRad = 96;
      const pullRadSq = pullRad * pullRad;
      for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
        const e = state.enemies[eIdx]!;
        if (e.friendly || e.hp <= 0 || e.elevated || e.aiState === 'sleep' || e.aiState === 'disguised') continue;
        const dx = proj.x - e.x;
        const dy = proj.y - e.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > 16 && dSq <= pullRadSq) {
          const d = Math.sqrt(dSq);
          const pull = e.isBoss ? 0.6 : 1.9;
          const mv = moveCircleWithSlide(state.map, e.x, e.y, (dx / d) * pull, (dy / d) * pull, e.radius);
          e.x = mv.x;
          e.y = mv.y;
        }
      }
      for (let pkIdx = 0; pkIdx < state.pickups.length; pkIdx++) {
        const pk = state.pickups[pkIdx]!;
        if (pk.kind !== 'rad' && pk.kind !== 'big_rad') continue;
        const dx = proj.x - pk.x;
        const dy = proj.y - pk.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > 9 && dSq <= pullRadSq) {
          const d = Math.sqrt(dSq);
          pk.vx += (dx / d) * 1.4;
          pk.vy += (dy / d) * 1.4;
        }
      }
      if (state.tick % 8 === 0) {
        emitEvent(state, { type: 'sfx', sound: 'sndUltraGrenadeSuck', x: proj.x, y: proj.y, pitchJitter: 0.1 });
      }
    }

    // 4c. Lightning Cannon orb zaps nearby enemies as it travels!
    if (!suspendedByEyes && proj.weaponId === 'lightning_cannon' && proj.team === 'player' && state.tick % 4 === 0) {
      const zapTarget = findNearestHostile(state, proj.x, proj.y, 76, undefined, true);
      if (zapTarget) {
        const zapDmg = hasMutation(player, 'laser_brain') ? 13 : 10;
        applyDamageToEnemy(state, zapTarget, zapDmg, 0, 0, rng);
        emitEvent(state, { type: 'sfx', sound: 'sndLightningHit', x: zapTarget.x, y: zapTarget.y, pitchJitter: 0.15 });
        emitEvent(state, {
          type: 'particle',
          kind: 'spark',
          x: zapTarget.x,
          y: zapTarget.y,
          vx: 0,
          vy: 0,
          color: '#7ceeff',
          size: 4,
          life: 6,
        });
      }
    }

    // 5. Velocity damping for flames / grenades
    if (!suspendedByEyes) {
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
    }

    // 6. Horror Rad Beam clears opposing reflectable enemy projectiles in flight (not beams/melee)
    if (proj.kind === 'rad_beam' && proj.team === 'player') {
      for (let j = state.projectiles.length - 1; j >= 0; j--) {
        const other = state.projectiles[j]!;
        if (other === proj) continue;
        if (
          other.team === 'enemy' &&
          other.kind !== 'melee_slash' &&
          other.kind !== 'enemy_laser' &&
          circleOverlap(proj.x, proj.y, proj.radius + 6, other.x, other.y, other.radius)
        ) {
          state.projectiles.splice(j, 1);
        }
      }
    }

    // 7. Swept wall collision (ZERO tunneling at any speed; bypassed while suspended by Eyes!)
    const nextX = suspendedByEyes ? proj.x : proj.x + proj.vx;
    const nextY = suspendedByEyes ? proj.y : proj.y + proj.vy;
    const rayRadius =
      proj.kind === 'laser' || proj.kind === 'enemy_laser' || proj.kind === 'lightning'
        ? 0
        : Math.min(3, proj.radius * 0.5);
    const wallHit = suspendedByEyes
      ? { hit: false, t: 1, hitX: proj.x, hitY: proj.y, normalX: 0, normalY: 0, tileX: 0, tileY: 0 }
      : sweptRayTile(state.map, proj.x, proj.y, nextX, nextY, rayRadius);

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

        // Sticky Launcher latches onto the hit enemy and detonates after a short fuse!
        if (proj.weaponId === 'sticky_launcher' && !stickyTargets.has(proj)) {
          proj.x = rec.hx;
          proj.y = rec.hy;
          proj.vx = 0;
          proj.vy = 0;
          proj.lifeTicks = Math.min(proj.lifeTicks, 18);
          stickyTargets.set(proj, {
            enemy: rec.enemy,
            offsetX: rec.hx - rec.enemy.x,
            offsetY: rec.hy - rec.enemy.y,
          });
          emitEvent(state, { type: 'sfx', sound: 'sndHitFlesh', x: rec.hx, y: rec.hy, pitchJitter: 0.1 });
          break;
        }

        proj.hitIds.push(rec.enemy.id);

        const spd = Math.hypot(proj.vx, proj.vy) || 1;
        const nx = proj.vx / spd;
        const ny = proj.vy / spd;
        const knockMag = computeProjectileKnockback(proj);

        // Horror Rad Beam infuses target with absorbed rads refunded on kill!
        if (proj.kind === 'rad_beam') {
          addHorrorAbsorbedRads(rec.enemy, 1);
        }

        const isPlayerBullet = proj.kind === 'bullet' && proj.weaponId !== 'rebel_ally_bullet';
        const isHeavyBullet = proj.kind === 'heavy_bullet';
        const killed = applyDamageToEnemy(state, rec.enemy, proj.damage, nx * knockMag, ny * knockMag, rng, {
          fromBullet: isPlayerBullet,
          fromHeavyBullet: isHeavyBullet,
          isHeavy: proj.damage >= 18,
        });

        // Lightning multi-chain jumps (2 jumps base, 4 jumps with Laser Brain!)
        if (proj.kind === 'lightning') {
          const maxChains = hasMutation(player, 'laser_brain') ? 4 : 2;
          let chainOriginX = rec.enemy.x;
          let chainOriginY = rec.enemy.y;
          let chainDmg = Math.ceil(proj.damage * 0.75);
          for (let c = 0; c < maxChains; c++) {
            const chain = findNearestHostile(state, chainOriginX, chainOriginY, 84, proj.hitIds, true);
            if (!chain) break;
            proj.hitIds.push(chain.id);
            applyDamageToEnemy(state, chain, chainDmg, 0, 0, rng);
            emitEvent(state, {
              type: 'sfx',
              sound: 'sndLightningHit',
              x: chain.x,
              y: chain.y,
              pitchJitter: 0.15,
            });
            emitEvent(state, {
              type: 'particle',
              kind: 'spark',
              x: (chainOriginX + chain.x) * 0.5,
              y: (chainOriginY + chain.y) * 0.5,
              vx: 0,
              vy: 0,
              color: '#7ceeff',
              size: 3.5,
              life: 6,
            });
            chainOriginX = chain.x;
            chainOriginY = chain.y;
            chainDmg = Math.max(3, Math.ceil(chainDmg * 0.8));
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
      const coverPropsSnap = [...state.props];
      for (let pIdx = 0; pIdx < coverPropsSnap.length; pIdx++) {
        const prop = coverPropsSnap[pIdx]!;
        if (!state.props.includes(prop) || prop.hp <= 0 || prop.opened || proj.hitIds.includes(prop.id)) continue;
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
          // Crystal Shield reflects bullets/orbs outward, and absorbs/blocks flames, missiles, and beams!
          const canReflect =
            CRYSTAL_REFLECTABLE_KINDS.has(proj.kind) && proj.sprite !== 'sprNothingBeam';
          if (canReflect) {
            proj.team = 'player';
            const outAng = Math.atan2(proj.y - player.y, proj.x - player.x);
            const speed = Math.max(10, Math.hypot(proj.vx, proj.vy) * 1.4);
            proj.vx = Math.cos(outAng) * speed;
            proj.vy = Math.sin(outAng) * speed;
            proj.angle = outAng;
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
            // Absorb laser beam / flame / missile safely without reflecting it!
            destroyed = true;
          }
        } else {
          proj.x = hitP.hitX;
          proj.y = hitP.hitY;
          const isFire = proj.kind === 'enemy_flame' || proj.kind === 'flame';
          if (proj.explosionRadius > 0) {
            detonateProjectile(state, proj, rng);
          } else {
            // Disc self-damage capped authentically (4 HP standard, 5 HP golden) instead of 24-28 instakill!
            const selfDamage =
              proj.kind === 'disc'
                ? proj.weaponId === 'golden_disc_gun'
                  ? 5
                  : 4
                : proj.damage;
            applyDamageToPlayer(
              state,
              selfDamage,
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

    // 10. Resolve wall impact: stick, bounce, or terminate
    if (wallHit.hit && !stickyTargets.has(proj)) {
      // Step slightly back from wall normal so projectile stays strictly inside walkable space
      const backoffX = wallHit.hitX + wallHit.normalX * 1.5;
      const backoffY = wallHit.hitY + wallHit.normalY * 1.5;

      // Sticky Launcher sticks to walls and detonates after short fuse!
      if (proj.weaponId === 'sticky_launcher') {
        proj.x = backoffX;
        proj.y = backoffY;
        proj.vx = 0;
        proj.vy = 0;
        proj.lifeTicks = Math.min(proj.lifeTicks, 18);
        stickyTargets.set(proj, { enemy: null, offsetX: 0, offsetY: 0 });
        emitEvent(state, {
          type: 'particle',
          kind: 'wall_spark',
          x: wallHit.hitX,
          y: wallHit.hitY,
          vx: wallHit.normalX * 1.5,
          vy: wallHit.normalY * 1.5,
          color: '#ffaa44',
          size: 2.5,
          life: 6,
        });
      } else if (proj.bounce > 0) {
        proj.bounce -= 1;
        proj.x = backoffX;
        proj.y = backoffY;
        const dot = proj.vx * wallHit.normalX + proj.vy * wallHit.normalY;
        const isShotgunBounce = (proj.kind === 'shell' || proj.kind === 'slug') && hasShotgunShoulders;
        const bounceDamp = isShotgunBounce
          ? 0.96
          : proj.kind === 'disc'
            ? 1.0
            : 0.82;
        proj.vx = (proj.vx - 2 * dot * wallHit.normalX) * bounceDamp;
        proj.vy = (proj.vy - 2 * dot * wallHit.normalY) * bounceDamp;
        proj.angle = Math.atan2(proj.vy, proj.vx);

        // Bouncer SMG & Bouncer Shotgun actively ricochet toward the nearest visible enemy!
        if (proj.team === 'player' && (proj.weaponId === 'bouncer_smg' || proj.weaponId === 'bouncer_shotgun')) {
          const ricochetTarget = findNearestHostile(state, proj.x, proj.y, 150, proj.hitIds, true);
          if (ricochetTarget) {
            const toEnemyX = ricochetTarget.x - proj.x;
            const toEnemyY = ricochetTarget.y - proj.y;
            const awayDot = toEnemyX * wallHit.normalX + toEnemyY * wallHit.normalY;
            if (awayDot >= -0.2) {
              const spd = Math.hypot(proj.vx, proj.vy) || 12;
              const aim = Math.atan2(toEnemyY, toEnemyX);
              proj.angle = aim;
              proj.vx = Math.cos(aim) * spd;
              proj.vy = Math.sin(aim) * spd;
            }
          }
        }

        if (isShotgunBounce) {
          proj.lifeTicks = Math.min(proj.maxLifeTicks + 12, proj.lifeTicks + 8);
        }
        if (proj.kind === 'disc') {
          proj.canHitPlayer = true;
          // Rebounding discs can slice enemies again!
          proj.hitIds = [];
          emitEvent(state, { type: 'sfx', sound: 'sndDiscBounce', x: proj.x, y: proj.y, pitchJitter: 0.1 });
        } else if (proj.kind === 'shell' || proj.kind === 'slug') {
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
    } else if (!stickyTargets.has(proj)) {
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
