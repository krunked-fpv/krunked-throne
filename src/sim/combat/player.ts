import type {
  BiomeId,
  CasingEntity,
  EnemyEntity,
  InputFrame,
  MutantId,
  PickupEntity,
  SimState,
  WeaponDef,
  WeaponSlotState,
  WorldMap,
} from '@/contracts';
import { AMMO_PICKUP_AMOUNT, MUTANTS, getWeaponDef } from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  circleOverlap,
  emitEvent,
  findNearestFloor,
  hasLineOfSight,
  moveCircleWithSlide,
  type SolidBox,
} from '@/sim/core';
import {
  addRads,
  createWeaponSlot,
  givePlayerWeapon,
  openChest,
  pickTierWeaponId,
} from '@/sim/progression/progression';
import {
  NON_MELEE_AMMO_TYPES,
  addAmmoToPool,
  applyDamageToEnemy,
  applyDamageToPlayer,
  getPlayerMoveSpeed,
  hasMutation,
  hasUltra,
  healPlayer,
  spawnCasing,
  spawnExplosion,
  spawnFriendlyUnit,
  spawnPickup,
} from './helpers';
import { stepProjectiles } from './projectiles';

// Tracks bonus free burst ticks per weapon slot (Y.V. Pop Pop/Brrrap stagger & Back 2 Bizniz)
const slotFreeBurstShots = new WeakMap<WeaponSlotState, number>();
const slotBurstInterval = new WeakMap<WeaponSlotState, number>();
const slotBurstJitter = new WeakMap<WeaponSlotState, number>();

// Per-enemy 4-tick Gamma Guts contact cooldown (never skipped due to bullet hurtFlashTicks!)
const gammaGutsLastTick = new WeakMap<EnemyEntity, number>();

interface PendingPortalBlast {
  x: number;
  y: number;
  radius: number;
  damage: number;
  delayTicks: number;
  hasTB: boolean;
  isFirst: boolean;
}

// Tracks Rogue's rolling delayed Portal Strike carpet per active map
const pendingPortalStrikes = new WeakMap<
  SimState,
  { mapRef: WorldMap; blasts: PendingPortalBlast[] }
>();

function getPendingPortalBlasts(state: SimState): PendingPortalBlast[] {
  let rec = pendingPortalStrikes.get(state);
  if (!rec || rec.mapRef !== state.map) {
    rec = { mapRef: state.map, blasts: [] };
    pendingPortalStrikes.set(state, rec);
  }
  return rec.blasts;
}

function queueRoguePortalStrike(
  state: SimState,
  startX: number,
  startY: number,
  angle: number,
  hasTB: boolean,
): void {
  const player = state.player;
  const superStrike = hasUltra(player, 'rogue_a');
  const blastCount = superStrike ? 6 : hasTB ? 5 : 4;
  const blastRadius = superStrike ? 46 : hasTB ? 38 : 30;
  const blastDamage = superStrike ? 54 : hasTB ? 42 : 34;

  const ts = state.map.tileSize || 16;
  const minX = ts * 2.5;
  const minY = ts * 2.5;
  const maxX = state.map.width * ts - ts * 2.5;
  const maxY = state.map.height * ts - ts * 2.5;

  const blasts = getPendingPortalBlasts(state);
  for (let b = 0; b < blastCount; b++) {
    const bx = Math.max(minX, Math.min(maxX, startX + Math.cos(angle) * (b * 24)));
    const by = Math.max(minY, Math.min(maxY, startY + Math.sin(angle) * (b * 24)));
    blasts.push({
      x: bx,
      y: by,
      radius: blastRadius,
      damage: blastDamage,
      delayTicks: 6 + b * 4,
      hasTB,
      isFirst: b === 0,
    });
  }

  emitEvent(state, {
    type: 'sfx',
    sound: 'sndPortalStrikeLoop',
    x: startX,
    y: startY,
  });
}

function stepPendingPortalStrikes(state: SimState, rng: SeededRng): void {
  const blasts = getPendingPortalBlasts(state);
  if (blasts.length === 0) return;

  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]!;
    b.delayTicks -= 1;
    if (b.delayTicks > 0) {
      if (b.delayTicks % 2 === 0) {
        emitEvent(state, {
          type: 'particle',
          kind: 'portal_swirl',
          x: b.x,
          y: b.y,
          vx: 0,
          vy: 0,
          color: '#4ca6ff',
          size: Math.max(4, Math.round(b.radius * 0.2)),
          life: 6,
        });
      }
      continue;
    }
    blasts.splice(i, 1);
    spawnExplosion(state, b.x, b.y, b.radius, b.damage, 'player', rng, {
      carveWalls: true,
      clearsProjectiles: true,
      isRogue: true,
      selfDamage: true,
      cause: 'PORTAL STRIKE',
      killerSprite: 'sprRogueExplosion',
      sound: b.isFirst ? (b.hasTB ? 'sndPortalStrikeFireButt' : 'sndPortalStrikeFire') : '',
    });
  }
}

function casingKindForWeapon(wep: WeaponDef): CasingEntity['kind'] | null {
  // Only ballistic/explosive firearms eject casings (never melee, bolts, discs, flames, or energy!)
  if (
    wep.projectileKind === 'melee_slash' ||
    wep.projectileKind === 'bolt' ||
    wep.projectileKind === 'splinter' ||
    wep.projectileKind === 'toxic_bolt' ||
    wep.projectileKind === 'seeking_bolt' ||
    wep.projectileKind === 'disc' ||
    wep.projectileKind === 'laser' ||
    wep.projectileKind === 'plasma' ||
    wep.projectileKind === 'lightning' ||
    wep.projectileKind === 'flame'
  ) {
    return null;
  }
  switch (wep.ammoType) {
    case 'bullet':
      return 'bullet';
    case 'shell':
      return 'shell';
    case 'explosive':
      return 'debris';
    default:
      return null;
  }
}

function swapSoundForWeapon(wep: WeaponDef, cursed?: boolean): string {
  if (cursed || wep.cursed) return 'sndSwapCursed';
  if (wep.golden) return 'sndSwapGold';
  const id = wep.id;
  if (id === 'electric_guitar') return 'sndSwapElectricGuitar';
  if (id === 'guitar') return 'sndSwapGuitar';
  if (id === 'dragon') return 'sndSwapDragon';
  if (id === 'jackhammer' || id.includes('minigun') || id.includes('gatling')) return 'sndSwapMotorized';
  if (wep.projectileKind === 'flame' || id.includes('flame') || id.includes('flare')) return 'sndSwapFlame';
  if (wep.ammoType === 'bolt') return 'sndSwapBow';
  if (wep.ammoType === 'explosive') return 'sndSwapExplosive';
  if (wep.ammoType === 'energy') return 'sndSwapEnergy';
  if (wep.ammoType === 'shell') return 'sndSwapShotgun';
  if (wep.ammoType === 'melee') {
    if (
      id.includes('hammer') ||
      id.includes('shovel') ||
      id.includes('wrench') ||
      id.includes('screwdriver')
    ) {
      return 'sndSwapHammer';
    }
    return 'sndSwapSword';
  }
  if (wep.auto || wep.burstCount > 1 || id.includes('rifle') || id.includes('machinegun') || id.includes('smg')) {
    return 'sndSwapMachinegun';
  }
  return 'sndSwapPistol';
}

function reloadCompleteSoundForWeapon(wep: WeaponDef, hasLaserBrain: boolean): string | null {
  if (wep.projectileKind === 'melee_slash') return null;
  if (wep.ammoType === 'shell') return 'sndShotReload';
  if (wep.ammoType === 'bolt') return 'sndCrossReload';
  if (wep.ammoType === 'explosive') return 'sndNadeReload';
  if (wep.projectileKind === 'plasma') return hasLaserBrain ? 'sndPlasmaReloadUpg' : 'sndPlasmaReload';
  if (wep.projectileKind === 'lightning') return 'sndLightningReload';
  return null;
}

function footstepSoundForBiome(biome: BiomeId, mutant: MutantId, tick: number): string {
  const variant = 1 + (Math.floor(tick / 9) % 6);
  if (biome === 'sewers' || biome === 'pizza_sewers' || biome === 'oasis' || biome === 'jungle') {
    return `sndFootSlime${variant}`;
  }
  const mat =
    mutant === 'robot' || mutant === 'crystal'
      ? 'Met'
      : mutant === 'plant'
        ? 'Pla'
        : mutant === 'yv' || mutant === 'steroids' || mutant === 'rebel' || mutant === 'rogue'
          ? 'Sho'
          : 'Org';
  const surface =
    biome === 'scrapyard' || biome === 'labs' || biome === 'hq'
      ? 'Metal'
      : biome === 'desert' || biome === 'campfire' || biome === 'frozen_city'
        ? 'Sand'
        : 'Rock';
  return `sndFoot${mat}${surface}${variant}`;
}

function computeEffectiveReload(state: SimState, baseReload: number): number {
  const player = state.player;
  let mult = 1.0;

  // Y.V. passive: +20% fire rate; Ima Gun God (yv_a): additional +40%
  if (player.mutant === 'yv') {
    mult *= 0.8;
    if (hasUltra(player, 'yv_a')) {
      mult *= 0.6;
    }
  }

  // Stress: up to 2x faster firing as HP drops toward 1
  if (hasMutation(player, 'stress') && player.maxHp > 1) {
    const missingFrac = Math.max(0, Math.min(1, (player.maxHp - Math.max(1, player.hp)) / (player.maxHp - 1)));
    mult *= 1 - missingFrac * 0.5;
  }

  return Math.max(1, Math.round(baseReload * mult));
}

function computeSpreadRad(state: SimState, spreadDeg: number): number {
  let deg = spreadDeg;
  if (state.player.mutant === 'steroids') deg *= 1.55;
  if (hasMutation(state.player, 'eagle_eyes')) deg *= 0.35;
  return (deg * Math.PI) / 180;
}

function spawnWeaponShot(
  state: SimState,
  slotState: WeaponSlotState,
  wep: WeaponDef,
  aimAngle: number,
  rng: SeededRng,
): void {
  const player = state.player;
  const spreadRad = computeSpreadRad(state, wep.spreadDeg);
  const hasLaserBrain = hasMutation(player, 'laser_brain');
  const hasLongArms = hasMutation(player, 'long_arms');
  const hasShotgunShoulders = hasMutation(player, 'shotgun_shoulders');

  const isEnergy =
    wep.ammoType === 'energy' ||
    wep.projectileKind === 'laser' ||
    wep.projectileKind === 'plasma' ||
    wep.projectileKind === 'lightning';
  const damageMult = isEnergy && hasLaserBrain ? 1.35 : 1.0;

  // Gun Gun: shoots a literal random floor weapon pickup!
  if (wep.id === 'gun_gun') {
    const rolledId = pickTierWeaponId(state, rng, 0);
    const rolledDef = getWeaponDef(rolledId);
    const dropPos = findNearestFloor(
      state.map,
      player.x + Math.cos(aimAngle) * 14,
      player.y + Math.sin(aimAngle) * 14,
      6,
    );
    spawnPickup(
      state,
      'weapon',
      dropPos.x,
      dropPos.y,
      {
        weaponId: rolledDef.id,
        cursed: Boolean(rolledDef.cursed),
        value: 1,
        vx: Math.cos(aimAngle) * 5.2,
        vy: Math.sin(aimAngle) * 5.2,
      },
      rng,
    );
    slotState.kickOffset = Math.min(8, wep.kick * 1.4);
    slotState.lastFiredTick = state.tick;
    state.stats.shotsFired += 1;
    emitEvent(state, { type: 'sfx', sound: wep.fireSound, x: player.x, y: player.y, pitchJitter: 0.08 });
    emitEvent(state, {
      type: 'shake',
      trauma: wep.shake,
      dirX: -Math.cos(aimAngle),
      dirY: -Math.sin(aimAngle),
      kick: wep.kick,
    });
    return;
  }

  const count = Math.max(1, wep.projectilesPerShot);

  for (let p = 0; p < count; p++) {
    const offset =
      count > 1 && spreadRad > 0
        ? (p / (count - 1) - 0.5) * spreadRad + rng.range(-spreadRad * 0.15, spreadRad * 0.15)
        : rng.range(-spreadRad * 0.5, spreadRad * 0.5);
    const angle = aimAngle + offset;

    if (wep.projectileKind === 'melee_slash') {
      // Alternate independent melee swing side per weapon slot (Steroids dual-melee parity!)
      slotState.meleeSwingSide = slotState.meleeSwingSide === -1 ? 1 : -1;
      const reach = Math.round(wep.meleeReach * (hasLongArms ? 1.45 : 1.0));
      // Shovel fans 3 arcs; Ultra Shovel fans 5 arcs + digs walls; Jackhammer digs walls
      const fanOffsets =
        wep.id === 'ultra_shovel'
          ? [-0.52, -0.26, 0, 0.26, 0.52]
          : wep.id === 'shovel'
            ? [-0.36, 0, 0.36]
            : [0];
      const arcPerSlash =
        wep.id === 'ultra_shovel' ? 80 : wep.id === 'shovel' ? 95 : wep.meleeArcDeg;
      // Share ONE hitIds array across all fan arcs so Shovel/Ultra Shovel hit each enemy 1x (never 3x/5x!)
      const sharedHitIds: number[] = [];

      for (let f = 0; f < fanOffsets.length; f++) {
        const slashAng = angle + fanOffsets[f]!;
        state.projectiles.push({
          id: allocEntityId(state),
          kind: 'melee_slash',
          team: 'player',
          x: player.x + Math.cos(slashAng) * (reach * 0.45),
          y: player.y + Math.sin(slashAng) * (reach * 0.45),
          prevX: player.x,
          prevY: player.y,
          vx: 0,
          vy: 0,
          angle: slashAng,
          radius: reach * 0.5,
          damage: Math.round(wep.damage * damageMult),
          lifeTicks: wep.projectileLifeTicks,
          maxLifeTicks: wep.projectileLifeTicks,
          pierce: 99,
          bounce: 0,
          explosionRadius: 0,
          sprite: wep.projectileSprite ?? 'sprSlash',
          weaponId: wep.id,
          hitIds: sharedHitIds,
          deflectsProjectiles: wep.deflectsProjectiles,
          destroysProjectiles: wep.destroysProjectiles,
          meleeReach: reach,
          meleeArcDeg: arcPerSlash,
          isUltra: wep.ultra,
        });
      }

      if (wep.id === 'ultra_shovel') {
        carveCircle(
          state.map,
          player.x + Math.cos(angle) * 24,
          player.y + Math.sin(angle) * 24,
          24,
          true,
        );
      } else if (wep.id === 'jackhammer') {
        carveCircle(
          state.map,
          player.x + Math.cos(angle) * 16,
          player.y + Math.sin(angle) * 16,
          12,
          true,
        );
      } else if (wep.id === 'lightning_hammer' || wep.id === 'electric_guitar') {
        const arcCount = hasLaserBrain ? 3 : 2;
        for (let a = 0; a < arcCount; a++) {
          const arcAng = angle + (a - (arcCount - 1) * 0.5) * 0.24 + rng.range(-0.08, 0.08);
          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'lightning',
            team: 'player',
            x: player.x + Math.cos(arcAng) * (player.radius + 6),
            y: player.y + Math.sin(arcAng) * (player.radius + 6),
            prevX: player.x,
            prevY: player.y,
            vx: Math.cos(arcAng) * 24,
            vy: Math.sin(arcAng) * 24,
            angle: arcAng,
            radius: 3.5,
            damage: Math.round(10 * damageMult),
            lifeTicks: hasLaserBrain ? 10 : 7,
            maxLifeTicks: hasLaserBrain ? 10 : 7,
            pierce: hasLaserBrain ? 2 : 1,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprLightning',
            weaponId: wep.id,
            hitIds: [],
            canHitPlayer: false,
          });
        }
      }
      continue;
    }

    const speedJitter = wep.projectileKind === 'shell' || wep.projectileKind === 'flame' ? rng.range(0.88, 1.12) : 1.0;
    const spd = wep.projectileSpeed * speedJitter;
    const spawnDist = player.radius + 3;
    const sx = player.x + Math.cos(angle) * spawnDist;
    const sy = player.y + Math.sin(angle) * spawnDist;

    const extraBounce = hasShotgunShoulders
      ? wep.projectileKind === 'shell'
        ? 2
        : wep.projectileKind === 'slug'
          ? 1
          : 0
      : 0;
    const extraLife = hasShotgunShoulders && (wep.projectileKind === 'shell' || wep.projectileKind === 'slug')
      ? wep.projectileKind === 'shell'
        ? 10
        : 8
      : isEnergy && hasLaserBrain
        ? 4
        : 0;
    const extraPierce = isEnergy && hasLaserBrain ? 1 : 0;

    state.projectiles.push({
      id: allocEntityId(state),
      kind: wep.projectileKind,
      team: 'player',
      x: sx,
      y: sy,
      prevX: player.x,
      prevY: player.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      angle,
      radius:
        wep.projectileKind === 'plasma' || wep.projectileKind === 'nuke'
          ? 6
          : wep.projectileKind === 'heavy_bullet' || wep.projectileKind === 'slug' || wep.projectileKind === 'disc'
            ? 4.5
            : 3,
      damage: Math.round(wep.damage * damageMult),
      lifeTicks: wep.projectileLifeTicks + extraLife,
      maxLifeTicks: wep.projectileLifeTicks + extraLife,
      pierce: wep.pierce + extraPierce,
      bounce: wep.bounce + extraBounce,
      explosionRadius: wep.explosionRadius,
      sprite: wep.projectileSprite ?? 'sprBullet1',
      weaponId: wep.id,
      hitIds: [],
      canHitPlayer: false,
      isUltra: wep.ultra,
    });
  }

  // Eject brass/shell casing (ballistic/explosive firearms only — never melee, bolts, discs, or energy!)
  const cKind = casingKindForWeapon(wep);
  if (cKind) {
    spawnCasing(state, player.x, player.y, aimAngle, cKind, rng);
  }

  slotState.kickOffset = Math.min(8, wep.kick * 1.4);
  slotState.lastFiredTick = state.tick;
  state.stats.shotsFired += 1;

  emitEvent(state, {
    type: 'sfx',
    sound: wep.fireSound,
    x: player.x,
    y: player.y,
    pitchJitter: 0.08,
  });
  emitEvent(state, {
    type: 'shake',
    trauma: wep.shake,
    dirX: -Math.cos(aimAngle),
    dirY: -Math.sin(aimAngle),
    kick: wep.kick,
  });
}

function tryFireWeaponSlot(
  state: SimState,
  slotIndex: 0 | 1,
  aimAngle: number,
  isTriggerEdge: boolean,
  rng: SeededRng,
  shotMultiplier: number = 1,
  reloadMultiplier: number = 1,
  paidShots: number = shotMultiplier,
): boolean {
  const player = state.player;
  const slotState = player.weapons[slotIndex];
  if (!slotState) return false;
  if (slotState.reloadTicks > 0 || slotState.burstRemaining > 0) return false;

  const wep = getWeaponDef(slotState.weaponId);
  const autoAllowed = wep.auto || player.mutant === 'steroids';
  if (!autoAllowed && !isTriggerEdge && shotMultiplier === 1) return false;

  const freeAmmo = player.gunWarrantTicks > 0;
  const perShotAmmoCost = freeAmmo ? 0 : wep.ammoCost;
  const perShotRadCost = freeAmmo ? 0 : (wep.radCost ?? 0);

  // Require at least 1 shot's worth of ammo/rads (allows Y.V. Pop Pop partial fire on low ammo!)
  if (wep.ammoType !== 'melee' && player.ammo[wep.ammoType] < perShotAmmoCost) {
    if (isTriggerEdge) {
      emitEvent(state, { type: 'sfx', sound: 'sndEmpty', x: player.x, y: player.y });
      emitEvent(state, { type: 'ammo_empty', x: player.x, y: player.y, ammoType: wep.ammoType });
    }
    return false;
  }
  if (perShotRadCost > 0 && player.rads < perShotRadCost) {
    if (isTriggerEdge) {
      emitEvent(state, { type: 'sfx', sound: 'sndUltraEmpty', x: player.x, y: player.y });
    }
    return false;
  }

  let actualShotsToFireNow: number;
  let ammoToDeduct: number;
  let radsToDeduct: number;

  if (wep.burstCount > 1) {
    // Burst weapons consume ammo per burst shot (shot 1 now, remainder during burst ticks)
    actualShotsToFireNow = 1;
    ammoToDeduct = wep.ammoType !== 'melee' ? perShotAmmoCost : 0;
    radsToDeduct = perShotRadCost;
  } else {
    const bonusFreeShots = Math.max(0, shotMultiplier - paidShots);
    if (freeAmmo || (wep.ammoType === 'melee' && perShotRadCost === 0)) {
      actualShotsToFireNow = shotMultiplier;
      ammoToDeduct = 0;
      radsToDeduct = 0;
    } else {
      const maxAmmoPaid =
        wep.ammoType !== 'melee' && perShotAmmoCost > 0
          ? Math.floor(player.ammo[wep.ammoType] / perShotAmmoCost)
          : paidShots;
      const maxRadPaid =
        perShotRadCost > 0 ? Math.floor(player.rads / perShotRadCost) : paidShots;
      const actualPaid = Math.min(paidShots, maxAmmoPaid, maxRadPaid);
      actualShotsToFireNow = Math.min(shotMultiplier, actualPaid + bonusFreeShots);
      ammoToDeduct = wep.ammoType !== 'melee' ? actualPaid * perShotAmmoCost : 0;
      radsToDeduct = actualPaid * perShotRadCost;
    }
  }

  if (wep.ammoType !== 'melee' && ammoToDeduct > 0) {
    player.ammo[wep.ammoType] = Math.max(0, player.ammo[wep.ammoType] - ammoToDeduct);
  }
  if (radsToDeduct > 0) {
    player.rads = Math.max(0, player.rads - radsToDeduct);
  }

  // Steroids Throne Butt: modest ammo conservation for the OTHER slot (never infinite net-positive ammo!)
  if (player.mutant === 'steroids' && hasMutation(player, 'throne_butt') && wep.ammoType !== 'melee') {
    const otherSlot = player.weapons[slotIndex === 0 ? 1 : 0];
    if (otherSlot) {
      const otherWep = getWeaponDef(otherSlot.weaponId);
      const dualActive = otherSlot.reloadTicks > 0 || otherSlot.burstRemaining > 0;
      const procChance = dualActive ? 0.22 : 0.12;
      if (otherWep.ammoType !== 'melee' && rng.chance(procChance)) {
        const refund = otherWep.ammoType === 'bullet' ? 2 : 1;
        addAmmoToPool(state, otherWep.ammoType, refund);
      }
    }
  }

  // Fire initial shot immediately; stagger Y.V. Pop Pop/Brrrap follow-up shots by 1 tick for authentic cadence!
  spawnWeaponShot(state, slotState, wep, aimAngle, rng);

  const effectiveReload = Math.max(1, Math.round(computeEffectiveReload(state, wep.reloadTicks) * reloadMultiplier));
  slotState.reloadTicks = effectiveReload;
  slotState.maxReloadTicks = effectiveReload;

  if (wep.burstCount > 1) {
    slotState.burstRemaining = wep.burstCount * shotMultiplier - 1;
    slotState.burstTimer = Math.max(1, wep.burstIntervalTicks);
    const freeBonusBursts = Math.max(0, shotMultiplier - paidShots) * wep.burstCount;
    slotFreeBurstShots.set(slotState, freeBonusBursts);
    slotBurstInterval.set(slotState, Math.max(1, wep.burstIntervalTicks));
    slotBurstJitter.set(slotState, 0);
  } else if (actualShotsToFireNow > 1) {
    const followUps = actualShotsToFireNow - 1;
    slotState.burstRemaining = followUps;
    slotState.burstTimer = 1;
    slotFreeBurstShots.set(slotState, followUps);
    slotBurstInterval.set(slotState, 1);
    slotBurstJitter.set(slotState, 0.06);
  } else {
    slotFreeBurstShots.set(slotState, 0);
    slotBurstInterval.delete(slotState);
    slotBurstJitter.delete(slotState);
  }

  return true;
}

function handleMutantActive(
  state: SimState,
  input: InputFrame,
  aimAngle: number,
  rng: SeededRng,
): void {
  const player = state.player;
  const hasTB = hasMutation(player, 'throne_butt');

  if (player.activeCooldown > 0) player.activeCooldown -= 1;

  // Reset continuous flags before re-evaluating
  player.telekinesisActive = false;

  switch (player.mutant) {
    case 'fish': {
      if (hasTB && input.activeHeld) {
        // Water Boost: continuous thrust along movement (or aim) direction with water spray
        const mvLen = Math.hypot(input.moveX, input.moveY);
        const dirX = mvLen > 0.05 ? input.moveX / mvLen : Math.cos(aimAngle);
        const dirY = mvLen > 0.05 ? input.moveY / mvLen : Math.sin(aimAngle);
        player.rolling = true;
        player.rollDirX = dirX;
        player.rollDirY = dirY;
        player.activeTimer = 2;
        if (state.tick % 2 === 0) {
          emitEvent(state, {
            type: 'particle',
            kind: 'water',
            x: player.x - dirX * 5,
            y: player.y - dirY * 5,
            vx: -dirX * 1.8 + rng.range(-0.8, 0.8),
            vy: -dirY * 1.8 + rng.range(-0.8, 0.8),
            color: '#66d4ff',
            size: 3,
            life: 8,
          });
        }
        if (state.tick % 4 === 0) {
          emitEvent(state, { type: 'sfx', sound: 'sndFishTB', x: player.x, y: player.y, pitchJitter: 0.12 });
        }
      } else if (input.activePressed && !player.rolling && player.activeCooldown <= 0) {
        // Classic Combat Roll (10 ticks)
        const mvLen = Math.hypot(input.moveX, input.moveY);
        player.rolling = true;
        player.rollDirX = mvLen > 0.05 ? input.moveX / mvLen : Math.cos(aimAngle);
        player.rollDirY = mvLen > 0.05 ? input.moveY / mvLen : Math.sin(aimAngle);
        player.activeTimer = 10;
        player.activeCooldown = 12;
        emitEvent(state, { type: 'sfx', sound: 'sndRoll', x: player.x, y: player.y });
      }
      break;
    }

    case 'crystal': {
      if (input.activePressed && !player.shielding && player.activeCooldown <= 0) {
        player.shielding = true;
        player.activeTimer = hasTB ? 20 : 32;
        emitEvent(state, { type: 'sfx', sound: 'sndCrystalShield', x: player.x, y: player.y });
      } else if (player.shielding && !input.activeHeld && player.activeTimer < (hasTB ? 14 : 24)) {
        // Allow early release
        player.activeTimer = 0;
      }

      if (player.shielding) {
        player.activeTimer -= 1;
        // Juggernaut (crystal_b): crush active grounded enemies on contact while moving slowly
        if (hasUltra(player, 'crystal_b') && state.tick % 5 === 0) {
          for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i]!;
            if (
              !e.friendly &&
              e.hp > 0 &&
              !e.elevated &&
              !e.invulnerable &&
              e.aiState !== 'disguised' &&
              circleOverlap(player.x, player.y, player.radius + 5, e.x, e.y, e.radius)
            ) {
              applyDamageToEnemy(state, e, 6, (e.x - player.x) * 0.4, (e.y - player.y) * 0.4, rng);
              emitEvent(state, { type: 'sfx', sound: 'sndCrystalJuggernaut', x: e.x, y: e.y, pitchJitter: 0.1 });
            }
          }
        }
        if (player.activeTimer <= 0) {
          player.shielding = false;
          // Apply cooldown AFTER shield finishes (prevents infinite shield spam!)
          player.activeCooldown = 10;
          // Crystal Throne Butt: Teleport toward cursor (clamped to max 220px) with exit iframes!
          if (hasTB) {
            const ox = player.x;
            const oy = player.y;
            const tdx = input.aimWorldX - ox;
            const tdy = input.aimWorldY - oy;
            const tDist = Math.hypot(tdx, tdy);
            const maxRange = 220;
            const targetX = tDist > maxRange ? ox + (tdx / tDist) * maxRange : input.aimWorldX;
            const targetY = tDist > maxRange ? oy + (tdy / tDist) * maxRange : input.aimWorldY;
            const nearest = findNearestFloor(state.map, targetX, targetY, 8);
            const safe = moveCircleWithSlide(state.map, nearest.x, nearest.y, 0, 0, player.radius);
            player.x = safe.x;
            player.y = safe.y;
            player.prevX = safe.x;
            player.prevY = safe.y;
            player.iframes = Math.max(player.iframes, 8);
            for (let k = 0; k < 6; k++) {
              const ang = (k / 6) * Math.PI * 2;
              emitEvent(state, {
                type: 'particle',
                kind: 'crystal',
                x: ox,
                y: oy,
                vx: Math.cos(ang) * 2.5,
                vy: Math.sin(ang) * 2.5,
                color: '#d966ff',
                size: 3,
                life: 10,
              });
              emitEvent(state, {
                type: 'particle',
                kind: 'crystal',
                x: safe.x,
                y: safe.y,
                vx: Math.cos(ang) * 2.5,
                vy: Math.sin(ang) * 2.5,
                color: '#e599ff',
                size: 3,
                life: 10,
              });
            }
            emitEvent(state, { type: 'sfx', sound: 'sndCrystalTB', x: safe.x, y: safe.y });
          }
        }
      }
      break;
    }

    case 'eyes': {
      if (input.activeHeld || input.activePressed) {
        player.telekinesisActive = true;
        const radius = hasTB ? 210 : 155;
        const radiusSq = radius * radius;
        const force = hasTB ? 1.7 : 1.1;

        // Telekinesis ALWAYS pulls enemies toward Eyes (skipping elevated/sleeping/disguised foes)
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i]!;
          if (e.friendly || e.hp <= 0 || e.elevated || e.aiState === 'sleep' || e.aiState === 'disguised') continue;
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1e-4 && dSq <= radiusSq) {
            const d = Math.sqrt(dSq);
            const bossScale = e.isBoss ? 0.35 : 1.0;
            const res = moveCircleWithSlide(
              state.map,
              e.x,
              e.y,
              (dx / d) * force * bossScale,
              (dy / d) * force * bossScale,
              e.radius,
            );
            e.x = res.x;
            e.y = res.y;
          }
        }

        // Push reflectable enemy projectiles away from Eyes (capped speed, skip beams/melee!)
        for (let i = 0; i < state.projectiles.length; i++) {
          const pr = state.projectiles[i]!;
          if (pr.team !== 'enemy' || pr.kind === 'melee_slash' || pr.kind === 'enemy_laser') continue;
          const dx = pr.x - player.x;
          const dy = pr.y - player.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1e-4 && dSq <= radiusSq) {
            const d = Math.sqrt(dSq);
            const push = hasTB ? 1.5 : 0.95;
            pr.vx += (dx / d) * push;
            pr.vy += (dy / d) * push;
            const spdSq = pr.vx * pr.vx + pr.vy * pr.vy;
            if (spdSq > 14 * 14) {
              const s = 14 / Math.sqrt(spdSq);
              pr.vx *= s;
              pr.vy *= s;
            }
            pr.angle = Math.atan2(pr.vy, pr.vx);
          }
        }

        if (state.tick % 10 === 0) {
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndEyesLoopUpg' : 'sndEyesLoop',
            x: player.x,
            y: player.y,
          });
        }
      } else if (hasUltra(player, 'eyes_b')) {
        // Eyes Ultra B (Monster Style): passively push nearby enemies AWAY when NOT using Telekinesis!
        const repelRadius = 96;
        const repelSq = repelRadius * repelRadius;
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i]!;
          if (e.friendly || e.hp <= 0 || e.elevated || e.aiState === 'sleep' || e.aiState === 'disguised') continue;
          const dx = e.x - player.x;
          const dy = e.y - player.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1e-4 && dSq <= repelSq) {
            const d = Math.sqrt(dSq);
            const push = 1.65 * (e.isBoss ? 0.4 : 1.0);
            const res = moveCircleWithSlide(
              state.map,
              e.x,
              e.y,
              (dx / d) * push,
              (dy / d) * push,
              e.radius,
            );
            e.x = res.x;
            e.y = res.y;
            if (res.hitWall && state.tick % 8 === 0) {
              applyDamageToEnemy(state, e, 2, (dx / d) * 2.5, (dy / d) * 2.5, rng);
            }
          }
        }
      }
      break;
    }

    case 'melting': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const range = hasTB ? 320 : 260;
        const rangeSq = range * range;
        const blastRad = hasTB ? 42 : 28;
        const blastDmg = hasTB ? 28 : 18;
        let detonated = 0;

        for (let i = state.corpses.length - 1; i >= 0; i--) {
          const c = state.corpses[i]!;
          if (!c.explodable) continue;
          const dx = c.x - player.x;
          const dy = c.y - player.y;
          if (dx * dx + dy * dy <= rangeSq) {
            state.corpses.splice(i, 1);
            detonated += 1;
            spawnExplosion(state, c.x, c.y, blastRad, blastDmg, 'player', rng, {
              carveWalls: false,
              clearsProjectiles: true,
              isBlood: true,
              selfDamage: false,
              sound: hasTB ? 'sndCorpseExploUpg' : 'sndCorpseExplo',
            });
            // Melting Throne Butt: massive multi-blast secondary blood explosions!
            if (hasTB) {
              for (let sub = 0; sub < 2; sub++) {
                const subAng = rng.range(0, Math.PI * 2);
                const subDist = rng.range(14, 26);
                spawnExplosion(
                  state,
                  c.x + Math.cos(subAng) * subDist,
                  c.y + Math.sin(subAng) * subDist,
                  28,
                  16,
                  'player',
                  rng,
                  {
                    carveWalls: false,
                    clearsProjectiles: true,
                    isBlood: true,
                    selfDamage: false,
                    sound: '',
                  },
                );
              }
            }
          }
        }

        // Melting Ultra A (Brain Capacity): detonate living enemies at or below 5 HP (no leftover corpse!)
        if (hasUltra(player, 'melting_a')) {
          const snap = [...state.enemies];
          for (let i = 0; i < snap.length; i++) {
            const e = snap[i]!;
            if (e.friendly || e.hp <= 0 || e.hp > 5 || e.isBoss || e.aiState === 'disguised') continue;
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            if (dx * dx + dy * dy <= rangeSq) {
              detonated += 1;
              applyDamageToEnemy(state, e, 99, 0, 0, rng, {
                isExplosion: true,
                isHeavy: true,
                suppressCorpse: true,
              });
              spawnExplosion(state, e.x, e.y, blastRad, blastDmg, 'player', rng, {
                carveWalls: false,
                clearsProjectiles: true,
                isBlood: true,
                selfDamage: false,
                sound: hasTB ? 'sndCorpseExploUpg' : 'sndCorpseExplo',
              });
            }
          }
        }

        player.activeCooldown = 6;
        if (detonated === 0) {
          emitEvent(state, { type: 'sfx', sound: 'sndCorpseExploDead', x: player.x, y: player.y });
        }
      }
      break;
    }

    case 'plant': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const spd = 16;
        state.projectiles.push({
          id: allocEntityId(state),
          kind: 'snare',
          team: 'player',
          x: player.x + Math.cos(aimAngle) * 8,
          y: player.y + Math.sin(aimAngle) * 8,
          prevX: player.x,
          prevY: player.y,
          vx: Math.cos(aimAngle) * spd,
          vy: Math.sin(aimAngle) * spd,
          angle: aimAngle,
          radius: 5,
          damage: 2,
          lifeTicks: 16,
          maxLifeTicks: 16,
          pierce: 0,
          bounce: 0,
          explosionRadius: 0,
          sprite: 'sprTangleSeed',
          hitIds: [],
        });
        player.activeCooldown = 12;
        emitEvent(state, {
          type: 'sfx',
          sound: hasTB ? 'sndPlantFireTB' : 'sndPlantFire',
          x: player.x,
          y: player.y,
        });
      }
      break;
    }

    case 'yv': {
      const activeSlotObj = player.weapons[player.activeSlot];
      const activeWepDef = activeSlotObj ? getWeaponDef(activeSlotObj.weaponId) : null;
      if (input.activePressed || (input.activeHeld && activeWepDef?.auto)) {
        const baseShots = hasTB ? 4 : 2;
        const hasB2B = hasUltra(player, 'yv_b');
        const totalShots = baseShots + (hasB2B ? 1 : 0);
        const reloadMult = hasTB ? 3.0 : 2.0;
        const fired = tryFireWeaponSlot(
          state,
          player.activeSlot,
          aimAngle,
          input.activePressed,
          rng,
          totalShots,
          reloadMult,
          baseShots,
        );
        if (fired) {
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndPopPopUpg' : 'sndPopPop',
            x: player.x,
            y: player.y,
          });
        }
      }
      break;
    }

    case 'steroids': {
      if (input.activeHeld || input.activePressed) {
        const secondarySlot: 0 | 1 = player.activeSlot === 0 ? 1 : 0;
        if (player.weapons[secondarySlot]) {
          tryFireWeaponSlot(state, secondarySlot, aimAngle, input.activePressed, rng);
        }
      }
      break;
    }

    case 'robot': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const activeSlot = player.activeSlot;
        const otherSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
        const curWep = player.weapons[activeSlot];
        const surviving = player.weapons[otherSlot];
        // Robot cannot eat his last remaining weapon (NT parity — prevents infinite HP/ammo/chest exploit!)
        if (!surviving) {
          emitEvent(state, { type: 'sfx', sound: 'sndEmpty', x: player.x, y: player.y });
          break;
        }
        if (curWep && curWep.cursed) {
          // Authentic NT: Robot CAN eat a cursed weapon, taking 7 HP CURSE damage & consuming it!
          player.weapons[0] = surviving;
          player.weapons[1] = null;
          player.activeSlot = 0;
          emitEvent(state, { type: 'sfx', sound: 'sndSwapCursed', x: player.x, y: player.y });
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndRobotEatUpg' : 'sndRobotEat',
            x: player.x,
            y: player.y,
          });
          emitEvent(state, {
            type: 'pickup_text',
            x: player.x,
            y: player.y - 12,
            text: 'CURSED!',
            color: '#cc55ff',
          });
          applyDamageToPlayer(state, 7, 'CURSE', 'sprCursedChest', rng, {
            ignoreIframes: true,
            bypassShield: true,
          });
          player.activeCooldown = 14;
        } else if (curWep) {
          player.weapons[0] = surviving;
          player.weapons[1] = null;
          player.activeSlot = 0;

          const hpGain = hasTB ? 4 : 2;
          if (player.hp < player.maxHp) {
            healPlayer(state, hpGain);
          } else {
            const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
            const gained = addAmmoToPool(state, ammoType, AMMO_PICKUP_AMOUNT[ammoType] * (hasTB ? 2 : 1));
            emitEvent(state, {
              type: 'pickup_text',
              x: player.x,
              y: player.y - 12,
              text: gained > 0 ? `+${gained} ${ammoType.toUpperCase()}` : `${ammoType.toUpperCase()} FULL`,
              color: '#ffe066',
            });
          }
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndRobotEatUpg' : 'sndRobotEat',
            x: player.x,
            y: player.y,
          });

          // Robot Ultra B (Regurgitate): 35% chance to drop a bonus chest on valid walkable floor
          if (hasUltra(player, 'robot_b') && rng.chance(0.35)) {
            const isWep = state.crown !== 'love' && rng.chance(0.45);
            const chestPos = findNearestFloor(
              state.map,
              player.x + Math.cos(aimAngle) * 14,
              player.y + Math.sin(aimAngle) * 14,
              8,
            );
            state.props.push({
              id: allocEntityId(state),
              kind: isWep ? 'weapon_chest' : 'ammo_chest',
              x: chestPos.x,
              y: chestPos.y,
              radius: 8,
              hp: 10,
              maxHp: 10,
              solid: false,
              opened: false,
              hurtFlashTicks: 0,
              sprite: isWep ? 'sprWeaponChest' : 'sprAmmoChest',
              openSprite: isWep ? 'sprWeaponChestOpen' : 'sprAmmoChestOpen',
            });
          }
          player.activeCooldown = 14;
        }
      }
      break;
    }

    case 'chicken': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const activeSlot = player.activeSlot;
        const otherSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
        const cur = player.weapons[activeSlot];
        if (cur && cur.cursed) {
          emitEvent(state, { type: 'sfx', sound: 'sndSwapCursed', x: player.x, y: player.y });
          emitEvent(state, {
            type: 'pickup_text',
            x: player.x,
            y: player.y - 12,
            text: 'CURSED!',
            color: '#cc55ff',
          });
          player.activeCooldown = 8;
          break;
        }
        if (cur && !cur.cursed) {
          const wepDef = getWeaponDef(cur.weaponId);
          const surviving = player.weapons[otherSlot];
          const throwingLastSword = !surviving && cur.weaponId === 'chicken_sword';
          // Prevent infinite solo chicken_sword dupe/spam while a thrown sword is already in flight!
          if (
            throwingLastSword &&
            state.projectiles.some((p) => p.kind === 'thrown_weapon' && p.weaponId === 'chicken_sword')
          ) {
            emitEvent(state, { type: 'sfx', sound: 'sndEmpty', x: player.x, y: player.y });
            break;
          }
          const levelScaledDmg = Math.max(20, 14 + player.level * 4 + wepDef.tier * 2);

          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'thrown_weapon',
            team: 'player',
            x: player.x + Math.cos(aimAngle) * 10,
            y: player.y + Math.sin(aimAngle) * 10,
            prevX: player.x,
            prevY: player.y,
            vx: Math.cos(aimAngle) * 16,
            vy: Math.sin(aimAngle) * 16,
            angle: aimAngle,
            radius: 7,
            damage: levelScaledDmg,
            lifeTicks: 28,
            maxLifeTicks: 28,
            pierce: hasTB ? 5 : 0,
            bounce: hasTB ? 2 : 0,
            explosionRadius: 0,
            sprite: wepDef.sprite,
            weaponId: wepDef.id,
            hitIds: [],
          });

          if (surviving) {
            player.weapons[0] = surviving;
            player.weapons[1] = null;
            player.activeSlot = 0;
          } else {
            const backup = createWeaponSlot('chicken_sword');
            if (throwingLastSword) {
              // Lock swing/re-throw while solo thrown sword is airborne
              backup.reloadTicks = 28;
              backup.maxReloadTicks = 28;
            }
            player.weapons[0] = backup;
            player.weapons[1] = null;
            player.activeSlot = 0;
          }
          player.activeCooldown = throwingLastSword ? 30 : 10;
          emitEvent(state, { type: 'sfx', sound: 'sndChickenThrow', x: player.x, y: player.y });
        }
      }
      break;
    }

    case 'rebel': {
      if (input.activePressed && player.activeCooldown <= 0) {
        let liveAllies = 0;
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i]!;
          if (e.friendly && e.defId === 'rebel_ally' && e.hp > 0) liveAllies += 1;
        }
        player.allyCount = liveAllies;

        const hpCost = liveAllies === 0 ? 1 : 2;
        if (player.hp > hpCost) {
          player.hp -= hpCost;
          const spawnCount = hasUltra(player, 'rebel_b') ? 2 : 1;
          for (let k = 0; k < spawnCount; k++) {
            const offsetAng = aimAngle + (k - (spawnCount - 1) * 0.5) * 0.6;
            spawnFriendlyUnit(
              state,
              'rebel_ally',
              player.x + Math.cos(offsetAng) * 14,
              player.y + Math.sin(offsetAng) * 14,
            );
            player.allyCount += 1;
          }
          // Heal all existing allies when spawning a new one
          for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i]!;
            if (e.friendly && e.defId === 'rebel_ally') {
              e.hp = e.maxHp;
            }
          }
          player.activeCooldown = 10;
          emitEvent(state, {
            type: 'sfx',
            sound: spawnCount > 1 ? 'sndSpawnSuperAlly' : 'sndSpawnAlly',
            x: player.x,
            y: player.y,
          });
        }
      }
      break;
    }

    case 'horror': {
      let firingBeam = false;
      if (input.activeHeld || input.activePressed) {
        if (player.rads > 0) {
          firingBeam = true;
          const prevBeamTicks = player.radBeamTicks;
          player.radBeamTicks += hasTB ? 2 : 1;
          if (state.tick % 2 === 0) {
            player.rads = Math.max(0, player.rads - 1);
          }
          const ramp = Math.min(3, Math.floor(player.radBeamTicks / 24));
          const spread = rng.range(-0.12, 0.12);
          const ang = aimAngle + spread;
          const spd = 15;
          state.projectiles.push({
            id: allocEntityId(state),
            kind: 'rad_beam',
            team: 'player',
            x: player.x + Math.cos(ang) * 10,
            y: player.y + Math.sin(ang) * 10,
            prevX: player.x,
            prevY: player.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            angle: ang,
            radius: 5 + ramp,
            damage: 2 + ramp,
            lifeTicks: 18,
            maxLifeTicks: 18,
            pierce: 2,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprHorrorBullet',
            hitIds: [],
          });
          // Throne Butt: threshold crossing guarantees healing every 60 ramp ticks even if radBeamTicks starts odd!
          if (
            hasTB &&
            Math.floor(player.radBeamTicks / 60) > Math.floor(prevBeamTicks / 60) &&
            player.hp < player.maxHp
          ) {
            healPlayer(state, 1);
          }
          if (state.tick % 6 === 0) {
            emitEvent(state, {
              type: 'sfx',
              sound: hasTB ? 'sndHorrorLoopTB' : 'sndHorrorLoop',
              x: player.x,
              y: player.y,
            });
          }
        } else if (input.activePressed) {
          emitEvent(state, { type: 'sfx', sound: 'sndHorrorEmpty', x: player.x, y: player.y });
        }
      } else {
        player.radBeamTicks = Math.max(0, player.radBeamTicks - 2);
      }
      player.radBeamActive = firingBeam;
      break;
    }

    case 'rogue': {
      // Authentic NT hold-to-drag Portal Strike targeting with delayed rolling blasts!
      const superStrike = hasUltra(player, 'rogue_a');
      const blastRadius = superStrike ? 46 : hasTB ? 38 : 30;

      if (player.portalStrikeAim?.active) {
        const aim = player.portalStrikeAim;
        if (input.activeHeld) {
          const dragDx = input.aimWorldX - aim.x;
          const dragDy = input.aimWorldY - aim.y;
          if (dragDx * dragDx + dragDy * dragDy >= 64) {
            aim.angle = Math.atan2(dragDy, dragDx);
          } else {
            const pDx = aim.x - player.x;
            const pDy = aim.y - player.y;
            if (pDx * pDx + pDy * pDy > 1) {
              aim.angle = Math.atan2(pDy, pDx);
            }
          }
        } else {
          // Released RMB -> launch rolling delayed carpet along dragged vector!
          player.portalStrikeAim = null;
          if (player.portalStrikes > 0) {
            player.portalStrikes -= 1;
            player.activeCooldown = 16;
            queueRoguePortalStrike(state, aim.x, aim.y, aim.angle, hasTB);
          }
        }
      } else if (input.activePressed && player.activeCooldown <= 0) {
        if (player.portalStrikes > 0) {
          if (input.activeHeld) {
            // Enter hold-to-drag aiming mode anchored at cursor (clamped to 180px, zero instant self-detonation!)
            const cursorDist = Math.hypot(input.aimWorldX - player.x, input.aimWorldY - player.y);
            const anchorX =
              cursorDist > 180
                ? player.x + ((input.aimWorldX - player.x) / cursorDist) * 180
                : input.aimWorldX;
            const anchorY =
              cursorDist > 180
                ? player.y + ((input.aimWorldY - player.y) / cursorDist) * 180
                : input.aimWorldY;
            player.portalStrikeAim = {
              x: anchorX,
              y: anchorY,
              angle: aimAngle,
              active: true,
            };
            emitEvent(state, { type: 'sfx', sound: 'sndRogueAim', x: player.x, y: player.y });
          } else {
            // Single-tick quick tap: launch delayed rolling blasts forward past safe standoff!
            player.portalStrikes -= 1;
            player.activeCooldown = 16;
            const cursorDist = Math.hypot(input.aimWorldX - player.x, input.aimWorldY - player.y);
            const safeStandoff = blastRadius + player.radius + 14;
            const launchDist = Math.max(safeStandoff, Math.min(140, cursorDist));
            const startX = player.x + Math.cos(aimAngle) * launchDist;
            const startY = player.y + Math.sin(aimAngle) * launchDist;
            queueRoguePortalStrike(state, startX, startY, aimAngle, hasTB);
          }
        } else {
          emitEvent(state, { type: 'sfx', sound: 'sndPortalStrikeEmpty', x: player.x, y: player.y });
        }
      }
      break;
    }
  }
}

function stepSnareTrapsAndFriendlies(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const plantTB = player.mutant === 'plant' && hasMutation(player, 'throne_butt');

  // 1. Snare traps root nearby hostile enemies and execute <33% HP with Plant TB
  for (let i = state.props.length - 1; i >= 0; i--) {
    const prop = state.props[i]!;
    if (prop.kind !== 'snare_trap') continue;
    if (prop.lifeTicks !== undefined) {
      prop.lifeTicks -= 1;
      if (prop.lifeTicks <= 0) {
        state.props.splice(i, 1);
        continue;
      }
    }
    const rSq = prop.radius * prop.radius;
    const snap = [...state.enemies];
    for (let j = 0; j < snap.length; j++) {
      const e = snap[j]!;
      if (e.friendly || e.hp <= 0 || e.invulnerable || e.aiState === 'sleep' || e.aiState === 'disguised') continue;
      const dx = e.x - prop.x;
      const dy = e.y - prop.y;
      if (dx * dx + dy * dy <= rSq) {
        e.snaredTicks = Math.max(e.snaredTicks, 8);
        e.vx *= 0.2;
        e.vy *= 0.2;
        // Plant Throne Butt executes ALL snared enemies (including bosses!) at <= 33% HP!
        if (plantTB && e.hp <= e.maxHp * 0.33) {
          applyDamageToEnemy(state, e, e.hp + 10, 0, 0, rng, { isCrit: true });
          emitEvent(state, { type: 'sfx', sound: 'sndPlantTBKill', x: e.x, y: e.y });
        }
      }
    }
  }

  // 2. Friendly units (Rebel Allies & Plant Killer Saplings)
  const rebelTB = player.mutant === 'rebel' && hasMutation(player, 'throne_butt');
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const u = state.enemies[i]!;
    if (!u.friendly || u.hp <= 0) continue;
    u.prevX = u.x;
    u.prevY = u.y;
    u.animFrame = (u.animFrame + 0.25) % 8;
    if (u.hurtFlashTicks > 0) u.hurtFlashTicks -= 1;
    if (u.attackCooldown > 0) u.attackCooldown -= 1;

    // Find nearest hostile enemy
    let target = null;
    let bestSq = 220 * 220;
    for (let j = 0; j < state.enemies.length; j++) {
      const e = state.enemies[j]!;
      if (e.friendly || e.hp <= 0) continue;
      const dx = e.x - u.x;
      const dy = e.y - u.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestSq) {
        bestSq = dSq;
        target = e;
      }
    }

    if (u.defId === 'plant_sapling') {
      // Sapling charges nearest hostile enemy
      if (target) {
        const dx = target.x - u.x;
        const dy = target.y - u.y;
        const dist = Math.hypot(dx, dy) || 1;
        const mv = moveCircleWithSlide(state.map, u.x, u.y, (dx / dist) * 2.8, (dy / dist) * 2.8, u.radius);
        u.x = mv.x;
        u.y = mv.y;
        u.facing = dx >= 0 ? 1 : -1;
        if (dist <= u.radius + target.radius + 4 && u.attackCooldown <= 0) {
          applyDamageToEnemy(state, target, 4, (dx / dist) * 2, (dy / dist) * 2, rng);
          u.attackCooldown = 10;
        }
      }
      // Sapling decays slowly over time
      if (state.tick % 45 === 0) {
        u.hp -= 1;
        if (u.hp <= 0) state.enemies.splice(i, 1);
      }
    } else if (u.defId === 'rebel_ally') {
      // Follow player gently, separate from sibling allies (no 1-pixel stacking!), and seek LOS to enemies!
      let steerX = 0;
      let steerY = 0;

      // 1. Separation force from other Rebel Allies
      for (let j = 0; j < state.enemies.length; j++) {
        const other = state.enemies[j]!;
        if (other === u || !other.friendly || other.defId !== 'rebel_ally' || other.hp <= 0) continue;
        const sdx = u.x - other.x;
        const sdy = u.y - other.y;
        const sDistSq = sdx * sdx + sdy * sdy;
        if (sDistSq < 20 * 20) {
          if (sDistSq < 0.01) {
            const tieAng = ((u.id * 2.39996) % (Math.PI * 2));
            steerX += Math.cos(tieAng) * 1.4;
            steerY += Math.sin(tieAng) * 1.4;
          } else {
            const sDist = Math.sqrt(sDistSq);
            const push = ((20 - sDist) / 20) * 1.5;
            steerX += (sdx / sDist) * push;
            steerY += (sdy / sDist) * push;
          }
        }
      }

      // 2. Follow player if far away, OR seek LOS to nearby enemy when player stands still
      const pdx = player.x - u.x;
      const pdy = player.y - u.y;
      const pDist = Math.hypot(pdx, pdy);
      const hasTargetLos = target ? hasLineOfSight(state.map, u.x, u.y, target.x, target.y) : false;

      if (pDist > 42) {
        steerX += (pdx / pDist) * 2.0;
        steerY += (pdy / pDist) * 2.0;
      } else if (target && !hasTargetLos && pDist < 110) {
        const tdx = target.x - u.x;
        const tdy = target.y - u.y;
        const tDist = Math.hypot(tdx, tdy) || 1;
        // Strafe-advance around corners to open LOS
        const flankSign = (u.id & 1) === 0 ? 1 : -1;
        const txDir = tdx / tDist;
        const tyDir = tdy / tDist;
        steerX += (txDir * 0.72 - tyDir * 0.45 * flankSign) * 1.8;
        steerY += (tyDir * 0.72 + txDir * 0.45 * flankSign) * 1.8;
      }

      const steerLen = Math.hypot(steerX, steerY);
      if (steerLen > 0.08) {
        const stepSpd = Math.min(2.2, steerLen);
        const mv = moveCircleWithSlide(
          state.map,
          u.x,
          u.y,
          (steerX / steerLen) * stepSpd,
          (steerY / steerLen) * stepSpd,
          u.radius,
        );
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
            weaponId: 'rebel_ally_bullet',
            hitIds: [],
          });
          u.attackCooldown = rebelTB ? 6 : 12;
          emitEvent(state, { type: 'sfx', sound: 'sndPistol', x: u.x, y: u.y, pitchJitter: 0.15, volume: 0.6 });
        }
      }
      // Rebel Allies slowly lose HP over time (NT parity!)
      if (state.tick % 60 === 0) {
        u.hp -= 1;
        if (u.hp <= 0) {
          state.enemies.splice(i, 1);
          player.allyCount = Math.max(0, player.allyCount - 1);
        }
      }
    }
  }
}

function collectPickupsAndChests(state: SimState, input: InputFrame, rng: SeededRng): void {
  const player = state.player;
  if (!player.alive) return;

  // 1. Open unopened chests on contact
  for (let i = 0; i < state.props.length; i++) {
    const prop = state.props[i]!;
    if (prop.opened || prop.mimic) continue;
    if (
      prop.kind === 'weapon_chest' ||
      prop.kind === 'big_weapon_chest' ||
      prop.kind === 'ammo_chest' ||
      prop.kind === 'idpd_canister'
    ) {
      if (circleOverlap(player.x, player.y, player.radius + 6, prop.x, prop.y, prop.radius)) {
        openChest(state, prop, rng);
      }
    }
  }

  // 2. Collect non-weapon pickups automatically; weapon pickup on E (pickupPressed)
  let nearestWep: PickupEntity | null = null;
  let nearestWepDistSq = 28 * 28;

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i]!;
    const dx = pk.x - player.x;
    const dy = pk.y - player.y;
    const dSq = dx * dx + dy * dy;

    if (pk.kind === 'weapon') {
      if (dSq < nearestWepDistSq) {
        nearestWepDistSq = dSq;
        nearestWep = pk;
      }
      continue;
    }

    if (dSq > (player.radius + 10) * (player.radius + 10)) continue;

    switch (pk.kind) {
      case 'rad':
      case 'big_rad':
        addRads(state, pk.value, rng);
        emitEvent(state, { type: 'sfx', sound: 'sndRadPickup', x: pk.x, y: pk.y, pitchJitter: 0.12 });
        state.pickups.splice(i, 1);
        break;

      case 'ammo': {
        const aType = pk.ammoType ?? rng.pick(NON_MELEE_AMMO_TYPES);
        const gained = addAmmoToPool(state, aType, pk.value);
        emitEvent(state, { type: 'sfx', sound: 'sndAmmoPickup', x: pk.x, y: pk.y, pitchJitter: 0.1 });
        if (gained > 0) {
          emitEvent(state, {
            type: 'pickup_text',
            x: pk.x,
            y: pk.y - 8,
            text: `+${gained} ${aType.toUpperCase()}`,
            color: '#ffe066',
          });
        }
        state.pickups.splice(i, 1);
        break;
      }

      case 'hp': {
        const mult = hasMutation(player, 'second_stomach') ? 2 : 1;
        const hasteBonus = state.crown === 'haste' ? 1 : 0;
        const healAmt = pk.value * mult + hasteBonus;
        if (player.hp < player.maxHp || player.headlessTicks > 0) {
          healPlayer(state, healAmt);
          emitEvent(state, {
            type: 'sfx',
            sound: healAmt >= 4 ? 'sndHPPickupBig' : 'sndHPPickup',
            x: pk.x,
            y: pk.y,
          });
          state.pickups.splice(i, 1);
        }
        break;
      }

      case 'portal_strike': {
        const cap = hasUltra(player, 'rogue_a') ? 6 : 3;
        if (player.portalStrikes < cap) {
          player.portalStrikes = Math.min(cap, player.portalStrikes + pk.value);
          emitEvent(state, { type: 'sfx', sound: 'sndRogueCanister', x: pk.x, y: pk.y });
          state.pickups.splice(i, 1);
        }
        break;
      }
    }
  }

  // Pick up nearest weapon when pressing E (pickupPressed) — resolve by reference so earlier splices never shift index!
  if (input.pickupPressed && nearestWep !== null) {
    const pk = nearestWep;
    if (
      pk.weaponId &&
      givePlayerWeapon(state, pk.weaponId, undefined, true, {
        cursed: pk.cursed,
        grantBonus: pk.value > 0,
      })
    ) {
      const wepIdx = state.pickups.indexOf(pk);
      if (wepIdx !== -1) {
        state.pickups.splice(wepIdx, 1);
      }
    }
  }
}

/**
 * Full 1-tick player movement, aiming, weapon firing, mutant passives/actives/ultras,
 * pickups/chests, friendly allies, and swept projectile combat resolution.
 */
export function stepPlayerAndCombat(
  state: SimState,
  input: InputFrame,
  rng: SeededRng,
): void {
  const player = state.player;

  // 1. Update player timers & headless state
  if (player.alive) {
    player.prevX = player.x;
    player.prevY = player.y;

    if (player.iframes > 0) player.iframes -= 1;
    if (player.hurtFlashTicks > 0) player.hurtFlashTicks -= 1;
    if (player.gunWarrantTicks > 0) {
      player.gunWarrantTicks -= 1;
      if (player.gunWarrantTicks === 0) {
        emitEvent(state, { type: 'sfx', sound: 'sndFishWarrantEnd', x: player.x, y: player.y });
      }
    }

    // Chicken headless countdown (dies when it reaches 0!)
    if (player.mutant === 'chicken' && player.headlessTicks > 0) {
      player.headlessTicks -= 1;
      if (player.headlessTicks > 0 && player.headlessTicks % 10 === 0) {
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndChickenHeadlessLoop',
          x: player.x,
          y: player.y,
          volume: 0.7,
        });
      }
      if (player.headlessTicks <= 0) {
        player.alive = false;
        state.phase = 'game_over';
        if (!player.lastDamageCause) {
          player.lastDamageCause = 'BLED OUT HEADLESS';
        }
        if (!player.lastKillerSprite) {
          player.lastKillerSprite = 'sprMutant9Dead';
        }
        emitEvent(state, {
          type: 'sfx',
          sound: MUTANTS.chicken.sounds.dead,
          x: player.x,
          y: player.y,
        });
        emitEvent(state, {
          type: 'player_died',
          cause: player.lastDamageCause,
          killerSprite: player.lastKillerSprite,
          areaCode: state.areaCode,
          loop: state.loop,
          kills: state.stats.kills,
        });
        return;
      }
    }

    // Aim & facing
    const aimDx = input.aimWorldX - player.x;
    const aimDy = input.aimWorldY - player.y;
    if (aimDx * aimDx + aimDy * aimDy > 1e-4) {
      player.aimAngle = Math.atan2(aimDy, aimDx);
      player.facing = aimDx >= 0 ? 1 : -1;
    }

    // Weapon swap (Q) — 15 authentic NT weapon-class sndSwap* triggers!
    if (input.swapPressed && player.weapons[1] !== null) {
      player.activeSlot = player.activeSlot === 0 ? 1 : 0;
      const swappedSlot = player.weapons[player.activeSlot];
      const swapSound = swappedSlot
        ? swapSoundForWeapon(getWeaponDef(swappedSlot.weaponId), swappedSlot.cursed)
        : 'sndSwapPistol';
      emitEvent(state, {
        type: 'sfx',
        sound: swapSound,
        x: player.x,
        y: player.y,
      });
    }

    // Subtle purple curse sparkles when carrying any cursed weapon
    if ((player.weapons[0]?.cursed || player.weapons[1]?.cursed) && state.tick % 10 === 0) {
      emitEvent(state, {
        type: 'particle',
        kind: 'curse',
        x: player.x + rng.range(-5, 5),
        y: player.y + rng.range(-5, 5),
        vx: rng.range(-0.3, 0.3),
        vy: rng.range(-0.8, -0.3),
        color: '#c44dff',
        size: 2.5,
        life: 10,
      });
    }

    // Tick weapon reloads, reload-complete SFX, kick recovery, and active/Pop-Pop bursts on BOTH slots
    const hasLaserBrain = hasMutation(player, 'laser_brain');
    for (let s = 0; s < 2; s++) {
      const slot = player.weapons[s];
      if (!slot) continue;
      if (slot.reloadTicks > 0) {
        slot.reloadTicks -= 1;
        if (slot.reloadTicks === 0 && slot.maxReloadTicks >= 12) {
          const reloadSfx = reloadCompleteSoundForWeapon(getWeaponDef(slot.weaponId), hasLaserBrain);
          if (reloadSfx) {
            emitEvent(state, {
              type: 'sfx',
              sound: reloadSfx,
              x: player.x,
              y: player.y,
              pitchJitter: 0.06,
              volume: 0.48,
            });
          }
        }
      }
      if (slot.kickOffset > 0) {
        slot.kickOffset *= 0.7;
        if (slot.kickOffset < 0.1) slot.kickOffset = 0;
      }
      if (slot.burstRemaining > 0) {
        slot.burstTimer -= 1;
        if (slot.burstTimer <= 0) {
          const wep = getWeaponDef(slot.weaponId);
          const freeBonus = slotFreeBurstShots.get(slot) ?? 0;
          const isFreeTick = player.gunWarrantTicks > 0 || freeBonus > 0;
          const ammoCost = isFreeTick ? 0 : wep.ammoCost;
          const radCost = isFreeTick ? 0 : (wep.radCost ?? 0);
          const hasAmmo = wep.ammoType === 'melee' || player.ammo[wep.ammoType] >= ammoCost;
          const hasRads = radCost === 0 || player.rads >= radCost;

          if (!hasAmmo || !hasRads) {
            slot.burstRemaining = 0;
            slotFreeBurstShots.set(slot, 0);
          } else {
            if (freeBonus > 0 && player.gunWarrantTicks <= 0) {
              slotFreeBurstShots.set(slot, freeBonus - 1);
            }
            if (wep.ammoType !== 'melee' && ammoCost > 0) {
              player.ammo[wep.ammoType] = Math.max(0, player.ammo[wep.ammoType] - ammoCost);
            }
            if (radCost > 0) {
              player.rads = Math.max(0, player.rads - radCost);
            }
            const jitterRange = slotBurstJitter.get(slot) ?? 0;
            const jitter = jitterRange > 0 ? rng.range(-jitterRange, jitterRange) : 0;
            spawnWeaponShot(state, slot, wep, player.aimAngle + jitter, rng);
            slot.burstRemaining -= 1;
            const nextInterval = slotBurstInterval.get(slot) ?? Math.max(1, wep.burstIntervalTicks);
            slot.burstTimer = Math.max(1, nextInterval);
          }
        }
      }
    }

    // Mutant Active Abilities (RMB) + pending Rogue rolling Portal Strike carpet
    handleMutantActive(state, input, player.aimAngle, rng);
    stepPendingPortalStrikes(state, rng);

    // Movement calculation with Vlambeer-snappy accel/friction & biome terrain traction (Extra Feet immunity!)
    let moveDx = 0;
    let moveDy = 0;
    const baseSpeed = getPlayerMoveSpeed(player);
    const hasExtraFeet = hasMutation(player, 'extra_feet');

    if (player.rolling) {
      const rollSpeed = baseSpeed * 1.7;
      moveDx = player.rollDirX * rollSpeed;
      moveDy = player.rollDirY * rollSpeed;
      player.activeTimer -= 1;
      if (player.activeTimer <= 0) {
        player.rolling = false;
      }
    } else if (player.shielding && !hasUltra(player, 'crystal_b')) {
      moveDx = 0;
      moveDy = 0;
    } else {
      const len = Math.hypot(input.moveX, input.moveY);
      const isIce = !hasExtraFeet && state.biome === 'frozen_city';
      const isSticky =
        !hasExtraFeet &&
        (state.biome === 'caves' || state.biome === 'cursed_caves' || state.biome === 'oasis');
      const accel = isIce ? 0.28 : isSticky ? 0.65 : 0.78;
      const friction = isIce ? 0.86 : 0.55;
      const terrainSpeedMult = isSticky ? 0.84 : 1.0;

      if (len > 0.01) {
        const clamped = Math.min(1, len);
        const speedMult = player.shielding && hasUltra(player, 'crystal_b') ? 0.45 : 1.0;
        const targetVx = (input.moveX / len) * clamped * baseSpeed * speedMult * terrainSpeedMult;
        const targetVy = (input.moveY / len) * clamped * baseSpeed * speedMult * terrainSpeedMult;
        moveDx = player.vx + (targetVx - player.vx) * accel;
        moveDy = player.vy + (targetVy - player.vy) * accel;
      } else {
        moveDx = player.vx * friction;
        moveDy = player.vy * friction;
        if (moveDx * moveDx + moveDy * moveDy < 0.04) {
          moveDx = 0;
          moveDy = 0;
        }
      }
    }

    if (moveDx !== 0 || moveDy !== 0) {
      // Build solid prop AABBs (cars, pillars, generators, statues, barrels) with spawn/overlap unstuck safety!
      let solidPropBoxes: SolidBox[] | undefined;
      if (!state.portal.entered) {
        for (let i = 0; i < state.props.length; i++) {
          const prop = state.props[i]!;
          if (!prop.solid || prop.hp <= 0 || prop.opened) continue;
          const half = Math.max(4, prop.radius * 0.8);
          const bx0 = prop.x - half;
          const by0 = prop.y - half;
          const bx1 = prop.x + half;
          const by1 = prop.y + half;
          // Unstuck safety: if player already overlaps this prop, skip it so player can cleanly walk free
          const nearX = player.x < bx0 ? bx0 : player.x > bx1 ? bx1 : player.x;
          const nearY = player.y < by0 ? by0 : player.y > by1 ? by1 : player.y;
          const ovDx = player.x - nearX;
          const ovDy = player.y - nearY;
          if (ovDx * ovDx + ovDy * ovDy < player.radius * player.radius) {
            continue;
          }
          if (!solidPropBoxes) solidPropBoxes = [];
          solidPropBoxes.push({ x: bx0, y: by0, w: half * 2, h: half * 2 });
        }
      }

      const mv = moveCircleWithSlide(
        state.map,
        player.x,
        player.y,
        moveDx,
        moveDy,
        player.radius,
        solidPropBoxes,
      );
      player.vx = mv.x - player.x;
      player.vy = mv.y - player.y;
      player.x = mv.x;
      player.y = mv.y;
      player.animFrame = (player.animFrame + 0.35) % 8;

      // Biome & mutant-specific footstep SFX while walking
      const movedSq = player.vx * player.vx + player.vy * player.vy;
      if (!player.rolling && !player.shielding && movedSq > 1.4 && state.tick % 9 === 0) {
        emitEvent(state, {
          type: 'sfx',
          sound: footstepSoundForBiome(state.biome, player.mutant, state.tick),
          x: player.x,
          y: player.y,
          pitchJitter: 0.08,
          volume: 0.3,
        });
      }

      // Hammerhead: pushing into a wall for 0.5s (15 ticks) carves through!
      if (mv.hitWall && hasMutation(player, 'hammerhead') && player.hammerheadTicks > 0) {
        player.hammerheadWallTicks += 1;
        if (player.hammerheadWallTicks >= 15) {
          const dirLen = Math.hypot(moveDx, moveDy) || 1;
          const carveX = player.x + (moveDx / dirLen) * (player.radius + 8);
          const carveY = player.y + (moveDy / dirLen) * (player.radius + 8);
          const carved = carveCircle(state.map, carveX, carveY, 15, true);
          player.hammerheadWallTicks = 0;
          if (carved > 0) {
            player.hammerheadTicks = Math.max(0, player.hammerheadTicks - carved);
            emitEvent(state, { type: 'sfx', sound: 'sndHammerHeadProc', x: carveX, y: carveY });
            emitEvent(state, { type: 'shake', trauma: 0.25 });
          }
        }
      } else {
        player.hammerheadWallTicks = 0;
      }
    } else {
      player.vx = 0;
      player.vy = 0;
      player.hammerheadWallTicks = 0;
    }

    // Primary weapon firing (LMB)
    if (!player.shielding && (input.fireHeld || input.firePressed)) {
      tryFireWeaponSlot(state, player.activeSlot, player.aimAngle, input.firePressed, rng);
    }

    // Gamma Guts: per-enemy 4-tick cadence (never skipped due to bullet hurtFlashTicks!)
    // Cleanly finishes weak <=12 HP non-boss contact foes (1 HP Maggots, 7 HP Rats, 9 HP Scarier-Face Freaks) before contact damage!
    if (hasMutation(player, 'gamma_guts')) {
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i]!;
        if (
          e.friendly ||
          e.hp <= 0 ||
          e.elevated ||
          e.invulnerable ||
          e.aiState === 'sleep' ||
          e.aiState === 'disguised'
        ) {
          continue;
        }
        const lastTick = gammaGutsLastTick.get(e);
        if (lastTick !== undefined && state.tick >= lastTick && state.tick - lastTick < 4) {
          continue;
        }
        if (circleOverlap(player.x, player.y, player.radius + 2, e.x, e.y, e.radius)) {
          gammaGutsLastTick.set(e, state.tick);
          applyDamageToEnemy(state, e, 6, (e.x - player.x) * 0.4, (e.y - player.y) * 0.4, rng);
          if (
            !e.isBoss &&
            e.hp > 0 &&
            e.hp <= 6 &&
            e.contactDamage > 0 &&
            circleOverlap(player.x, player.y, player.radius, e.x, e.y, e.radius)
          ) {
            applyDamageToEnemy(state, e, 6, (e.x - player.x) * 0.4, (e.y - player.y) * 0.4, rng);
          }
        }
      }
    }

    // Collect pickups & open chests
    collectPickupsAndChests(state, input, rng);
  } else {
    // Still resolve in-flight Rogue Portal Strikes even if Rogue died mid-call
    stepPendingPortalStrikes(state, rng);
  }

  // 2. Step snare traps & friendly allies
  stepSnareTrapsAndFriendlies(state, rng);

  // 3. Step all projectiles with swept collision (pass cursor for Nuke steering)
  stepProjectiles(state, rng, input.aimWorldX, input.aimWorldY);
}
