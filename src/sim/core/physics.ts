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

const PORTAL_EXPLOSIVE_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  'car',
  'barrel',
  'toxic_barrel',
  'gold_barrel',
]);

export const ULTRA_RAD_CAP = 600;
export const MELTDOWN_RAD_CAP = 1200;

export function getPlayerRadCap(player: SimState['player']): number {
  return player.ultra === 'horror_c' ? MELTDOWN_RAD_CAP : ULTRA_RAD_CAP;
}

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

function radsRequiredForNextLevel(level: number, ultra?: SimState['player']['ultra']): number {
  if (level >= 10) return ultra === 'horror_c' ? MELTDOWN_RAD_CAP : ULTRA_RAD_CAP;
  return Math.max(1, level) * 60;
}

/**
 * Rolls over accumulated player rads across level-up thresholds (`radsToNextLevel`),
 * matching `@/sim/progression` (`addRads`) so Portal-vacuumed rads immediately update
 * `level`, `radsToNextLevel`, `pendingLevelUps`, and enforce the canonical 600 / 1,200
 * Level Ultra rad capacity cap (`horror_c` Meltdown doubles cap to 1,200).
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
    player.radsToNextLevel = radsRequiredForNextLevel(player.level, player.ultra);
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
  if (player.level >= 10) {
    const cap = getPlayerRadCap(player);
    player.radsToNextLevel = cap;
    if (player.rads > cap) {
      player.rads = cap;
    }
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
    c.prevX = c.x;
    c.prevY = c.y;

    if (c.baked) {
      if (!c.explodable) {
        state.corpses.splice(i, 1);
      } else {
        bakedCount += 1;
      }
      continue;
    }

    // Advance death animation smoothly from white-flash frame 0 to resting corpse frame 5
    if (c.frame < 5) {
      c.frame = Math.min(5, c.frame + 0.4);
    }

    const radius = Math.max(3, Math.min(8, c.size * 0.4));
    const speedSq = c.vx * c.vx + c.vy * c.vy;

    if (speedSq > 0.0001) {
      const res = moveCircleWithSlide(state.map, c.x, c.y, c.vx, c.vy, radius);
      c.x = res.x;
      c.y = res.y;

      // Blood skid trail while flying fast across the wasteland floor
      if (speedSq > 14 && (state.tick + c.id) % 2 === 0) {
        pushDecal(state, {
          kind: 'blood',
          x: c.x,
          y: c.y,
          angle: Math.atan2(c.vy, c.vx),
          scale: 0.5,
          color: '#7a1212',
        });
      }

      if (res.hitX) {
        c.vx = -c.vx * 0.52;
      }
      if (res.hitY) {
        c.vy = -c.vy * 0.52;
      }
      if (res.hitWall && speedSq > 4) {
        const speed = Math.sqrt(speedSq);
        pushDecal(state, {
          kind: 'blood',
          x: c.x,
          y: c.y,
          angle: 0,
          scale: speed > 7 ? 1.25 : 0.9,
          color: '#7a1212',
        });
        if (speedSq > 9) {
          emitEvent(state, {
            type: 'corpse_impact',
            x: c.x,
            y: c.y,
            speed,
          });
          emitEvent(state, {
            type: 'shake',
            trauma: Math.min(0.14, speed * 0.012),
          });
        }
      }
    }

    c.vx *= 0.85;
    c.vy *= 0.85;

    if (c.vx * c.vx + c.vy * c.vy < 0.04) {
      c.vx = 0;
      c.vy = 0;
      // Wait until the death animation reaches resting frame 5 before baking into FloorDecal
      if (c.frame >= 5) {
        c.frame = 5;
        c.baked = true;
        pushDecal(state, {
          kind: 'corpse',
          x: c.x,
          y: c.y,
          angle: 0,
          scale: 1,
          color: '#6b1d1d',
          sprite: c.sprite,
          frame: 5,
          facing: c.facing,
        });
        if (!c.explodable) {
          state.corpses.splice(i, 1);
        } else {
          bakedCount += 1;
        }
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
    pk.prevX = pk.x;
    pk.prevY = pk.y;
    pk.animFrame = (pk.animFrame + 0.25) % 8;

    // Non-weapon drops expire if they carry a positive finite lifeTicks timer
    if (pk.kind !== 'weapon' && pk.lifeTicks > 0) {
      pk.lifeTicks -= 1;
      if (pk.lifeTicks <= 0) {
        if (pk.kind === 'cursed_ammo') {
          // Cursed Ammo explodes on expiry dealing 4-5 dmg (respecting Boiling Veins & Strong Spirit)
          const blastDmg = 4 + ((state.tick + pk.id) & 1);
          const blastRad = 32;
          pushDecal(state, {
            kind: 'scorch',
            x: pk.x,
            y: pk.y,
            angle: 0,
            scale: 0.9,
            color: '#4c1866',
          });
          emitEvent(state, {
            type: 'particle',
            kind: 'explosion',
            x: pk.x,
            y: pk.y,
            vx: 0,
            vy: 0,
            color: '#c44dff',
            size: blastRad,
            life: 10,
            sprite: 'sprSmallExplosion',
          });
          emitEvent(state, { type: 'sfx', sound: 'sndExplosion', x: pk.x, y: pk.y, pitchJitter: 0.1 });
          emitEvent(state, { type: 'shake', trauma: 0.3 });

          for (let eIdx = state.enemies.length - 1; eIdx >= 0; eIdx--) {
            const e = state.enemies[eIdx]!;
            if (e.hp <= 0 || e.invulnerable) continue;
            const r = blastRad + e.radius;
            const edx = e.x - pk.x;
            const edy = e.y - pk.y;
            if (edx * edx + edy * edy <= r * r) {
              e.hp -= blastDmg;
              e.hurtFlashTicks = 4;
              if (e.hp <= 0) {
                state.enemies.splice(eIdx, 1);
                if (!e.friendly) {
                  state.stats.kills += 1;
                  state.levelKills += 1;
                }
              }
            }
          }

          if (player.alive && !player.godMode && !player.shielding && player.iframes <= 0) {
            const pr = blastRad + player.radius;
            const pdx = player.x - pk.x;
            const pdy = player.y - pk.y;
            if (pdx * pdx + pdy * pdy <= pr * pr) {
              let dmg = blastDmg;
              const hasBV = player.mutations.includes('boiling_veins');
              if (hasBV) {
                if (player.hp <= 4) {
                  dmg = 0;
                } else if (player.hp - dmg < 4) {
                  dmg = player.hp - 4;
                }
              }
              if (dmg > 0) {
                player.hp -= dmg;
                player.iframes = 5;
                player.hurtFlashTicks = 6;
                player.lastDamageCause = 'CURSED AMMO';
                player.lastKillerSprite = 'sprCursedAmmo';
                state.stats.damageTaken += dmg;
                if (player.hp <= 0) {
                  if (player.strongSpiritReady) {
                    player.hp = 1;
                    player.strongSpiritReady = false;
                    player.strongSpiritRecharging = false;
                    player.iframes = 24;
                  } else {
                    player.hp = 0;
                    player.alive = false;
                    state.phase = 'game_over';
                    emitEvent(state, {
                      type: 'player_died',
                      cause: 'CURSED AMMO',
                      killerSprite: 'sprCursedAmmo',
                      areaCode: state.areaCode,
                      loop: state.loop,
                      kills: state.stats.kills,
                    });
                  }
                }
              }
            }
          }
        }
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
        const horrorBeaming = isRad && player.mutant === 'horror' && Boolean(player.radBeamActive);
        const hpFull = pk.kind === 'hp' && player.hp >= player.maxHp && player.headlessTicks === 0;
        const strikeCap = player.ultra === 'rogue_a' ? 6 : 3;
        const strikesFull = pk.kind === 'portal_strike' && player.portalStrikes >= strikeCap;

        if (!horrorBeaming) {
          if (!hpFull && !strikesFull) {
            attractRadius = hasPlutoniumHunger ? 150 : isRad ? 44 : 26;
            pullAccel = hasPlutoniumHunger ? 1.25 : isRad ? 0.85 : 0.65;
          }

          if (telekinesis && teleRadius > attractRadius) {
            attractRadius = teleRadius;
            pullAccel = Math.max(pullAccel, hasThroneButt ? 1.45 : 1.05);
          }
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
 * 1. On activation, emits `sprPortalClear` blast carving surrounding walls AND
 *    detonating nearby cars/barrels (`PORTALS CAN DETONATE CARS`).
 * 2. Smoothly ramps ~20-tick suction pulling loose rads into player XP (respecting
 *    the 600/1200 Ultra rad cap) and gently pulling nearby loose pickups/weapons
 *    toward the portal WITHOUT ever breaking or auto-vacuuming intact chests or
 *    unopened Rad Canisters.
 * 3. Pulls the player in and captures them on contact, transitioning
 *    `state.phase -> 'portal_transition'`.
 */
export function stepPortal(state: SimState): void {
  const portal = state.portal;
  if (!portal.active) return;

  portal.timer += 1;

  // Periodic open portal hum loop (authentic NT sndPortalLoop)
  if (!portal.entered && portal.timer % 24 === 1) {
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndPortalLoop',
      x: portal.x,
      y: portal.y,
      volume: 0.5,
    });
  }

  // 1. Carve safe radius + emit sprPortalClear shockwave + detonate nearby cars/barrels ONCE on activation
  if (!portal.carved) {
    const carveRadius = Math.max(portal.radius + 16, 36);
    const carvedCount = carveCircle(state.map, portal.x, portal.y, carveRadius, true);
    portal.carved = true;

    emitEvent(state, {
      type: 'particle',
      kind: 'portal_clear',
      x: portal.x,
      y: portal.y,
      vx: 0,
      vy: 0,
      color: '#c87cff',
      size: 64,
      life: 12,
      sprite: 'sprPortalClear',
    });

    if (carvedCount > 0) {
      emitEvent(state, { type: 'shake', trauma: 0.35 });
    }

    // Authentic NT tip: "PORTALS CAN DETONATE CARS" (detonates nearby cars & explosive barrels, NEVER chests/canisters!)
    const detonateReachBase = carveRadius + 14;
    for (let i = state.props.length - 1; i >= 0; i--) {
      const prop = state.props[i]!;
      if (prop.opened || prop.hp <= 0 || !PORTAL_EXPLOSIVE_PROP_KINDS.has(prop.kind)) {
        continue;
      }
      if (prop.sprite === 'sprVenusCarFixed') continue;
      const reach = detonateReachBase + prop.radius;
      const dx = prop.x - portal.x;
      const dy = prop.y - portal.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      state.props.splice(i, 1);
      const isCar = prop.kind === 'car';
      const isToxic = prop.kind === 'toxic_barrel';
      const blastRad = isCar ? 44 : isToxic ? 38 : 34;
      const blastDmg = isCar ? 34 : isToxic ? 16 : 24;
      carveCircle(state.map, prop.x, prop.y, blastRad * 0.85, true);
      pushDecal(state, {
        kind: isToxic ? 'acid' : 'scorch',
        x: prop.x,
        y: prop.y,
        angle: 0,
        scale: blastRad / 28,
        color: isToxic ? '#33cc44' : '#221c18',
      });
      emitEvent(state, {
        type: 'particle',
        kind: 'explosion',
        x: prop.x,
        y: prop.y,
        vx: 0,
        vy: 0,
        color: isToxic ? '#55ff66' : '#ffaa33',
        size: blastRad,
        life: 10,
        sprite: isToxic ? 'sprGreenExplosion' : 'sprExplosion',
      });
      emitEvent(state, {
        type: 'sfx',
        sound: isCar ? 'sndExplosionCar' : isToxic ? 'sndToxicBarrelGas' : 'sndExplosion',
        x: prop.x,
        y: prop.y,
        pitchJitter: 0.1,
      });
      emitEvent(state, { type: 'shake', trauma: 0.48 });

      // Damage player if caught in portal-detonated car/barrel blast outside portal warp capture
      // (respecting Boiling Veins, Frog toxic immunity, and portal-warp invulnerability!)
      const pl = state.player;
      const portalCaptureDist = Math.max(8, portal.radius * 0.65 + pl.radius * 0.5);
      const alreadyInPortalCore =
        portal.entered ||
        Math.hypot(portal.x - pl.x, portal.y - pl.y) <= portalCaptureDist;
      if (pl.alive && !alreadyInPortalCore && !pl.godMode && !pl.shielding && pl.iframes <= 0) {
        if (!(isToxic && pl.mutant === 'frog')) {
          const pdx = pl.x - prop.x;
          const pdy = pl.y - prop.y;
          const pr = blastRad + pl.radius;
          if (pdx * pdx + pdy * pdy <= pr * pr) {
            let dmg = Math.min(6, Math.max(2, Math.round(blastDmg * 0.25)));
            if (pl.mutations.includes('boiling_veins')) {
              if (pl.hp <= 4) {
                dmg = 0;
              } else if (pl.hp - dmg < 4) {
                dmg = pl.hp - 4;
              }
            }
            if (dmg > 0) {
              pl.hp -= dmg;
              pl.iframes = 5;
              pl.hurtFlashTicks = 6;
              pl.lastDamageCause = isCar ? 'CAR EXPLOSION' : isToxic ? 'TOXIC BARREL' : 'BARREL EXPLOSION';
              pl.lastKillerSprite = isCar ? 'sprCarIdle' : isToxic ? 'sprToxicBarrel' : 'sprBarrel';
              state.stats.damageTaken += dmg;
              if (pl.hp <= 0) {
                if (pl.strongSpiritReady) {
                  pl.hp = 1;
                  pl.strongSpiritReady = false;
                  pl.strongSpiritRecharging = false;
                  pl.iframes = 24;
                } else {
                  pl.hp = 0;
                  pl.alive = false;
                  state.phase = 'game_over';
                  emitEvent(state, {
                    type: 'player_died',
                    cause: pl.lastDamageCause,
                    killerSprite: pl.lastKillerSprite,
                    areaCode: state.areaCode,
                    loop: state.loop,
                    kills: state.stats.kills,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Smooth ~20-tick suction ramp
  const suctionRamp = 0.25 + 0.75 * Math.min(1, portal.timer / 20);
  const captureDist = Math.max(10, portal.radius * 0.55);
  const captureDistSq = captureDist * captureDist;
  const loosePullRadius = 80;
  const loosePullRadiusSq = loosePullRadius * loosePullRadius;
  let vacuumedRads = 0;

  // 2. Smoothly vacuum loose rads into player XP, and gently pull nearby loose pickups/weapons
  // toward the portal core (without ever deleting ammo/HP/weapons or breaking intact chests/canisters!)
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i]!;
    const dx = portal.x - pk.x;
    const dy = portal.y - pk.y;
    const distSq = dx * dx + dy * dy;

    if (pk.kind === 'rad' || pk.kind === 'big_rad') {
      if (distSq <= captureDistSq) {
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
        state.pickups.splice(i, 1);
        continue;
      }

      const dist = Math.sqrt(distSq);
      const pullSpeed = (4.2 + (1 - Math.min(1, dist / 260)) * 5.8) * suctionRamp;
      const step = Math.min(dist, pullSpeed);
      const nx = dx / dist;
      const ny = dy / dist;
      pk.x += nx * step;
      pk.y += ny * step;
      pk.vx = nx * step;
      pk.vy = ny * step;
      continue;
    }

    // Gently draw loose ammo/HP/weapons/portal strikes within ~80px toward portal without erasing them
    if (distSq > 100 && distSq <= loosePullRadiusSq) {
      const dist = Math.sqrt(distSq);
      const pullSpeed = (1.2 + (1 - dist / loosePullRadius) * 2.4) * suctionRamp;
      const step = Math.min(dist - 10, pullSpeed);
      if (step > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const res = moveCircleWithSlide(state.map, pk.x, pk.y, nx * step, ny * step, 4);
        pk.x = res.x;
        pk.y = res.y;
      }
    }
  }

  if (vacuumedRads > 0) {
    rolloverPlayerRads(state);
  }

  // 3. Pull and capture player on contact (never auto-vacuum unopened chests/rad canisters!)
  const player = state.player;
  if (!player.alive) return;

  if (!portal.entered) {
    const dx = portal.x - player.x;
    const dy = portal.y - player.y;
    const dist = Math.hypot(dx, dy);
    const pullRadius = Math.max(portal.radius * 3.5, 80);
    const playerCaptureDist = Math.max(8, portal.radius * 0.65 + player.radius * 0.5);

    if (dist > 1e-6 && dist <= pullRadius) {
      const strength = (0.85 + (1 - dist / pullRadius) * 2.25) * suctionRamp;
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
        sound: 'sndPortalClose',
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
