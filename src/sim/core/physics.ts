import type {
  CasingEntity,
  FloorDecal,
  PropKind,
  SimEvent,
  SimState,
} from '@/contracts';
import { carveCircle, moveCircleWithSlide } from '@/sim/collision/grid';

const MAX_DECALS = 512;
const MAX_BAKED_CORPSES = 120;
const CASING_GRAVITY = 0.42;

const VACUUMABLE_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  'weapon_chest',
  'big_weapon_chest',
  'ammo_chest',
  'rad_canister',
  'idpd_canister',
]);

export function emitEvent(state: SimState, event: SimEvent): void {
  state.events.push(event);
}

export function drainEvents(state: SimState): SimEvent[] {
  if (state.events.length === 0) return [];
  const drained = state.events;
  state.events = [];
  return drained;
}

export function allocEntityId(state: SimState): number {
  if (state.nextEntityId < 1) {
    state.nextEntityId = 1;
  }
  const id = state.nextEntityId;
  state.nextEntityId = id + 1;
  return id;
}

function radsRequiredForNextLevel(level: number): number {
  if (level >= 10) return 9999;
  return Math.max(1, level) * 60;
}

/**
 * Rolls over accumulated player rads across level-up thresholds (`radsToNextLevel`),
 * matching `@/sim/progression` (`addRads`) so Portal-vacuumed rads and canisters
 * immediately update `level`, `radsToNextLevel`, `pendingLevelUps`, and emit `'level_up'`
 * + level-up SFX events before area transition.
 */
export function rolloverPlayerRads(state: SimState): number {
  const player = state.player;
  let levelsGained = 0;
  while (
    player.level < 10 &&
    player.radsToNextLevel > 0 &&
    player.rads >= player.radsToNextLevel
  ) {
    player.rads -= player.radsToNextLevel;
    player.level += 1;
    player.radsToNextLevel = radsRequiredForNextLevel(player.level);
    state.pendingLevelUps += 1;
    levelsGained += 1;
    const isUltra = player.level === 10;
    emitEvent(state, { type: 'level_up', level: player.level, isUltra });
    emitEvent(state, {
      type: 'sfx',
      sound: isUltra ? 'sndLevelUltra' : 'sndLevelUp',
      x: player.x,
      y: player.y,
    });
  }
  return levelsGained;
}

function pushDecal(state: SimState, decal: FloorDecal): void {
  if (state.decals.length >= MAX_DECALS) {
    state.decals.shift();
  }
  state.decals.push(decal);
  emitEvent(state, { type: 'decal', decal });
}

function casingColor(kind: CasingEntity['kind']): string {
  switch (kind) {
    case 'bullet':
      return '#e6c35c';
    case 'shell':
      return '#c83e37';
    case 'bolt':
      return '#8a7356';
    case 'energy':
      return '#55e5ff';
    case 'debris':
      return '#8c8478';
  }
}

/**
 * Advances sliding corpses with deceleration and wall bounce, baking settled
 * corpses into persistent FloorDecals (while retaining explodable corpses
 * for Melting's active ability up to a bounded cap).
 */
export function stepCorpses(state: SimState): void {
  let bakedCount = 0;

  for (let i = state.corpses.length - 1; i >= 0; i--) {
    const c = state.corpses[i]!;
    if (c.baked) {
      if (!c.explodable) {
        state.corpses.splice(i, 1);
      } else {
        bakedCount += 1;
      }
      continue;
    }

    const radius = Math.max(3, Math.min(8, c.size * 0.4));
    const speedSq = c.vx * c.vx + c.vy * c.vy;

    if (speedSq > 0.0001) {
      const res = moveCircleWithSlide(state.map, c.x, c.y, c.vx, c.vy, radius);
      c.x = res.x;
      c.y = res.y;

      if (res.hitX) {
        c.vx = -c.vx * 0.55;
      }
      if (res.hitY) {
        c.vy = -c.vy * 0.55;
      }
      if (res.hitWall && speedSq > 4) {
        pushDecal(state, {
          kind: 'blood',
          x: c.x,
          y: c.y,
          angle: 0,
          scale: 0.9,
          color: '#7a1212',
        });
      }
    }

    c.vx *= 0.8;
    c.vy *= 0.8;

    if (c.vx * c.vx + c.vy * c.vy < 0.04) {
      c.vx = 0;
      c.vy = 0;
      c.baked = true;
      pushDecal(state, {
        kind: 'corpse',
        x: c.x,
        y: c.y,
        angle: 0,
        scale: 1,
        color: '#6b1d1d',
        sprite: c.sprite,
        frame: c.frame,
        facing: c.facing,
      });
      if (!c.explodable) {
        state.corpses.splice(i, 1);
      } else {
        bakedCount += 1;
      }
    }
  }

  // Cap oldest baked corpses so Melting's list stays bounded in long Loop runs
  if (bakedCount > MAX_BAKED_CORPSES) {
    let toDrop = bakedCount - MAX_BAKED_CORPSES;
    for (let i = 0; i < state.corpses.length && toDrop > 0; i++) {
      if (state.corpses[i]!.baked) {
        state.corpses.splice(i, 1);
        i -= 1;
        toDrop -= 1;
      }
    }
  }
}

/**
 * Advances ejected brass/shell casings in a 3D arc with gravity, wall bounce,
 * floor bounce, and permanent FloorDecal baking once settled.
 */
export function stepCasings(state: SimState): void {
  for (let i = state.casings.length - 1; i >= 0; i--) {
    const c = state.casings[i]!;
    if (c.baked) {
      state.casings.splice(i, 1);
      continue;
    }

    if (c.vx !== 0 || c.vy !== 0) {
      const res = moveCircleWithSlide(state.map, c.x, c.y, c.vx, c.vy, 2);
      c.x = res.x;
      c.y = res.y;
      if (res.hitX) c.vx = -c.vx * 0.5;
      if (res.hitY) c.vy = -c.vy * 0.5;
    }

    c.vz -= CASING_GRAVITY;
    c.z += c.vz;
    c.angle += c.vAngle;

    if (c.z <= 0) {
      c.z = 0;
      if (Math.abs(c.vz) > 0.65) {
        c.vz = -c.vz * 0.48;
        c.vx *= 0.68;
        c.vy *= 0.68;
        c.vAngle *= 0.65;
      } else {
        c.vz = 0;
        c.vx *= 0.72;
        c.vy *= 0.72;
        c.vAngle *= 0.5;
      }
    }

    if (
      c.z === 0 &&
      Math.abs(c.vz) < 0.05 &&
      c.vx * c.vx + c.vy * c.vy < 0.04
    ) {
      c.vx = 0;
      c.vy = 0;
      c.vz = 0;
      c.vAngle = 0;
      c.baked = true;
      pushDecal(state, {
        kind: 'casing',
        x: c.x,
        y: c.y,
        angle: c.angle,
        scale: 1,
        color: casingColor(c.kind),
      });
      state.casings.splice(i, 1);
    }
  }
}

/**
 * Advances and expires transient visual particles.
 */
export function stepParticles(state: SimState): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i]!;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.lifeTicks -= 1;

    if (p.lifeTicks <= 0) {
      state.particles.splice(i, 1);
      continue;
    }

    const denom = p.maxLifeTicks > 0 ? p.maxLifeTicks : 1;
    p.alpha = Math.max(0, Math.min(1, p.lifeTicks / denom));
  }
}

/**
 * Advances dropped pickups (rads, ammo, HP, weapons, portal strikes):
 * - Velocity damping and wall-safe movement
 * - Magnetic attraction from close proximity, Plutonium Hunger, and Eyes Telekinesis
 * - Lifetime countdown (non-weapon pickups expire at 0)
 */
export function stepPickups(state: SimState): void {
  const player = state.player;
  const hasPlutoniumHunger = player.mutations.includes('plutonium_hunger');
  const hasThroneButt = player.mutations.includes('throne_butt');
  const telekinesis = player.alive && player.telekinesisActive;
  const teleRadius = hasThroneButt ? 210 : 155;
  const canAttract = player.alive && !state.portal.entered;

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i]!;
    pk.animFrame = (pk.animFrame + 0.25) % 8;

    // Non-weapon drops expire if they carry a positive finite lifeTicks timer
    if (pk.kind !== 'weapon' && pk.lifeTicks > 0) {
      pk.lifeTicks -= 1;
      if (pk.lifeTicks <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
    }

    if (canAttract) {
      const dx = player.x - pk.x;
      const dy = player.y - pk.y;
      const distSq = dx * dx + dy * dy;

      let attractRadius = 0;
      let pullAccel = 0;

      if (pk.kind === 'weapon') {
        if (telekinesis) {
          attractRadius = teleRadius;
          pullAccel = hasThroneButt ? 1.05 : 0.7;
        }
      } else {
        const isRad = pk.kind === 'rad' || pk.kind === 'big_rad';
        attractRadius = hasPlutoniumHunger ? 150 : isRad ? 44 : 26;
        pullAccel = hasPlutoniumHunger ? 1.25 : isRad ? 0.85 : 0.65;

        if (telekinesis && teleRadius > attractRadius) {
          attractRadius = teleRadius;
          pullAccel = Math.max(pullAccel, hasThroneButt ? 1.45 : 1.05);
        }
      }

      if (attractRadius > 0 && distSq > 1e-6 && distSq <= attractRadius * attractRadius) {
        const dist = Math.sqrt(distSq);
        const closeness = 1 - dist / attractRadius;
        const accel = pullAccel * (0.65 + closeness * 1.15);
        pk.vx += (dx / dist) * accel;
        pk.vy += (dy / dist) * accel;
      }
    }

    // Clamp max pickup speed & apply damping
    const spdSq = pk.vx * pk.vx + pk.vy * pk.vy;
    const maxSpeed = 8.5;
    if (spdSq > maxSpeed * maxSpeed) {
      const s = maxSpeed / Math.sqrt(spdSq);
      pk.vx *= s;
      pk.vy *= s;
    }

    if (pk.vx !== 0 || pk.vy !== 0) {
      const res = moveCircleWithSlide(state.map, pk.x, pk.y, pk.vx, pk.vy, 4);
      pk.x = res.x;
      pk.y = res.y;
      if (res.hitX) pk.vx = -pk.vx * 0.4;
      if (res.hitY) pk.vy = -pk.vy * 0.4;
    }

    pk.vx *= 0.84;
    pk.vy *= 0.84;
    if (Math.abs(pk.vx) < 0.02) pk.vx = 0;
    if (Math.abs(pk.vy) < 0.02) pk.vy = 0;
  }
}

/**
 * Advances an active level-exit Portal vortex:
 * 1. Carves a safe circular clearing around the portal once.
 * 2. Vacuums loose rads, pickups, weapons, and unopened chests/canisters
 *    (incrementing state.chestSkipStreak for skipped weapon chests).
 * 3. Pulls the player in and captures them on contact, transitioning
 *    state.phase -> 'portal_transition'.
 */
export function stepPortal(state: SimState): void {
  const portal = state.portal;
  if (!portal.active) return;

  portal.timer += 1;

  // 1. Carve safe radius around the portal once upon activation
  if (!portal.carved) {
    const carveRadius = Math.max(portal.radius + 16, 36);
    const carvedCount = carveCircle(state.map, portal.x, portal.y, carveRadius, true);
    portal.carved = true;
    if (carvedCount > 0) {
      emitEvent(state, { type: 'shake', trauma: 0.35 });
    }
  }

  const captureDist = Math.max(10, portal.radius * 0.55);
  const captureDistSq = captureDist * captureDist;
  let vacuumedRads = 0;

  // 2. Vacuum loose rads, pickups, and weapons toward portal center
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i]!;
    const dx = portal.x - pk.x;
    const dy = portal.y - pk.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= captureDistSq) {
      if (pk.kind === 'rad' || pk.kind === 'big_rad') {
        state.player.rads += pk.value;
        state.stats.radsCollected += pk.value;
        vacuumedRads += pk.value;
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndRadPickup',
          x: portal.x,
          y: portal.y,
          pitchJitter: 0.1,
        });
      }
      state.pickups.splice(i, 1);
      continue;
    }

    const dist = Math.sqrt(distSq);
    const pullSpeed = 5.0 + (1 - Math.min(1, dist / 260)) * 6.0;
    const step = Math.min(dist, pullSpeed);
    const nx = dx / dist;
    const ny = dy / dist;
    pk.x += nx * step;
    pk.y += ny * step;
    pk.vx = nx * step;
    pk.vy = ny * step;
  }

  // 3. Vacuum unopened chests & rad canisters
  const chestCaptureDist = Math.max(12, portal.radius * 0.6);
  const chestCaptureDistSq = chestCaptureDist * chestCaptureDist;

  for (let i = state.props.length - 1; i >= 0; i--) {
    const prop = state.props[i]!;
    if (prop.opened || prop.mimic || !VACUUMABLE_PROP_KINDS.has(prop.kind)) {
      continue;
    }

    const dx = portal.x - prop.x;
    const dy = portal.y - prop.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= chestCaptureDistSq) {
      prop.opened = true;
      if (prop.kind === 'weapon_chest' || prop.kind === 'big_weapon_chest') {
        state.chestSkipStreak += 1;
      } else if (prop.kind === 'rad_canister') {
        const stored = prop.radsStored ?? 10;
        if (stored > 0) {
          state.player.rads += stored;
          state.stats.radsCollected += stored;
          vacuumedRads += stored;
        }
      }
      emitEvent(state, {
        type: 'particle',
        kind: 'portal_swirl',
        x: portal.x,
        y: portal.y,
        vx: 0,
        vy: 0,
        color: '#b56bff',
        size: 4,
        life: 10,
      });
      state.props.splice(i, 1);
      continue;
    }

    const dist = Math.sqrt(distSq);
    const pullSpeed = 4.0 + (1 - Math.min(1, dist / 260)) * 5.0;
    const step = Math.min(dist, pullSpeed);
    prop.x += (dx / dist) * step;
    prop.y += (dy / dist) * step;
  }

  if (vacuumedRads > 0) {
    rolloverPlayerRads(state);
  }

  // 4. Pull and capture player on contact
  const player = state.player;
  if (!player.alive) return;

  if (!portal.entered) {
    const dx = portal.x - player.x;
    const dy = portal.y - player.y;
    const dist = Math.hypot(dx, dy);
    const pullRadius = Math.max(portal.radius * 3.5, 96);
    const playerCaptureDist = Math.max(8, portal.radius * 0.65 + player.radius * 0.5);

    if (dist > 1e-6 && dist <= pullRadius) {
      const strength = 0.85 + (1 - dist / pullRadius) * 2.25;
      const pullStep = Math.min(dist, strength);
      const res = moveCircleWithSlide(
        state.map,
        player.x,
        player.y,
        (dx / dist) * pullStep,
        (dy / dist) * pullStep,
        player.radius,
      );
      player.x = res.x;
      player.y = res.y;
    }

    const postDist = Math.hypot(portal.x - player.x, portal.y - player.y);
    if (postDist <= playerCaptureDist) {
      portal.entered = true;
      portal.enterTicks = 1;
      state.phase = 'portal_transition';
      state.portalTransitionTicks = 1;
      emitEvent(state, {
        type: 'sfx',
        sound: 'sndPortalEnter',
        x: portal.x,
        y: portal.y,
      });
      emitEvent(state, { type: 'shake', trauma: 0.4 });
    }
  } else {
    portal.enterTicks += 1;
    state.portalTransitionTicks += 1;
    player.x += (portal.x - player.x) * 0.35;
    player.y += (portal.y - player.y) * 0.35;
    if (state.phase === 'playing') {
      state.phase = 'portal_transition';
    }
  }
}
