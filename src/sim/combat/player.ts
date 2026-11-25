import type {
  AmmoType,
  CasingEntity,
  InputFrame,
  SimState,
  WeaponDef,
  WeaponSlotState,
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
} from '@/sim/core';
import {
  addRads,
  createWeaponSlot,
  givePlayerWeapon,
  openChest,
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

function casingKindForAmmo(ammoType: AmmoType): CasingEntity['kind'] | null {
  switch (ammoType) {
    case 'bullet':
      return 'bullet';
    case 'shell':
      return 'shell';
    case 'bolt':
      return 'bolt';
    case 'energy':
      return 'energy';
    case 'explosive':
      return 'debris';
    case 'melee':
      return null;
  }
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
  const count = Math.max(1, wep.projectilesPerShot);

  for (let p = 0; p < count; p++) {
    const offset =
      count > 1 && spreadRad > 0
        ? (p / (count - 1) - 0.5) * spreadRad + rng.range(-spreadRad * 0.15, spreadRad * 0.15)
        : rng.range(-spreadRad * 0.5, spreadRad * 0.5);
    const angle = aimAngle + offset;

    if (wep.projectileKind === 'melee_slash') {
      const reach = Math.round(wep.meleeReach * (hasLongArms ? 1.45 : 1.0));
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'melee_slash',
        team: 'player',
        x: player.x + Math.cos(angle) * (reach * 0.45),
        y: player.y + Math.sin(angle) * (reach * 0.45),
        prevX: player.x,
        prevY: player.y,
        vx: 0,
        vy: 0,
        angle,
        radius: reach * 0.5,
        damage: Math.round(wep.damage * damageMult),
        lifeTicks: wep.projectileLifeTicks,
        maxLifeTicks: wep.projectileLifeTicks,
        pierce: 99,
        bounce: 0,
        explosionRadius: 0,
        sprite: wep.projectileSprite ?? 'sprSlash',
        weaponId: wep.id,
        hitIds: [],
        deflectsProjectiles: wep.deflectsProjectiles,
        destroysProjectiles: wep.destroysProjectiles,
        meleeReach: reach,
        meleeArcDeg: wep.meleeArcDeg,
        isUltra: wep.ultra,
      });
      continue;
    }

    const speedJitter = wep.projectileKind === 'shell' || wep.projectileKind === 'flame' ? rng.range(0.88, 1.12) : 1.0;
    const spd = wep.projectileSpeed * speedJitter;
    const spawnDist = player.radius + 3;
    const sx = player.x + Math.cos(angle) * spawnDist;
    const sy = player.y + Math.sin(angle) * spawnDist;

    const extraBounce = wep.projectileKind === 'shell' && hasShotgunShoulders ? 2 : 0;
    const extraLife =
      wep.projectileKind === 'shell' && hasShotgunShoulders
        ? 10
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

  // Eject brass/shell casing
  const cKind = casingKindForAmmo(wep.ammoType);
  if (cKind) {
    spawnCasing(state, player.x, player.y, aimAngle, cKind, rng);
  }

  slotState.kickOffset = Math.min(8, wep.kick * 1.4);
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
): boolean {
  const player = state.player;
  const slotState = player.weapons[slotIndex];
  if (!slotState) return false;
  if (slotState.reloadTicks > 0 || slotState.burstRemaining > 0) return false;

  const wep = getWeaponDef(slotState.weaponId);
  const autoAllowed = wep.auto || player.mutant === 'steroids';
  if (!autoAllowed && !isTriggerEdge && shotMultiplier === 1) return false;

  const freeAmmo = player.gunWarrantTicks > 0;
  const totalAmmoCost = freeAmmo ? 0 : wep.ammoCost * shotMultiplier;
  const totalRadCost = freeAmmo ? 0 : (wep.radCost ?? 0) * shotMultiplier;

  if (wep.ammoType !== 'melee' && player.ammo[wep.ammoType] < totalAmmoCost) {
    if (isTriggerEdge) {
      emitEvent(state, { type: 'sfx', sound: 'sndEmpty', x: player.x, y: player.y });
      emitEvent(state, { type: 'ammo_empty', x: player.x, y: player.y, ammoType: wep.ammoType });
    }
    return false;
  }
  if (totalRadCost > 0 && player.rads < totalRadCost) {
    if (isTriggerEdge) {
      emitEvent(state, { type: 'sfx', sound: 'sndUltraEmpty', x: player.x, y: player.y });
    }
    return false;
  }

  if (wep.ammoType !== 'melee') {
    player.ammo[wep.ammoType] -= totalAmmoCost;
  }
  if (totalRadCost > 0) {
    player.rads -= totalRadCost;
  }

  // Steroids Throne Butt: chance to refill ammo for the OTHER weapon slot when firing!
  if (player.mutant === 'steroids' && hasMutation(player, 'throne_butt') && rng.chance(0.35)) {
    const otherSlot = player.weapons[slotIndex === 0 ? 1 : 0];
    if (otherSlot) {
      const otherWep = getWeaponDef(otherSlot.weaponId);
      if (otherWep.ammoType !== 'melee') {
        addAmmoToPool(state, otherWep.ammoType, Math.max(1, Math.round(AMMO_PICKUP_AMOUNT[otherWep.ammoType] * 0.15)));
      }
    }
  }

  for (let s = 0; s < shotMultiplier; s++) {
    const jitter = shotMultiplier > 1 ? rng.range(-0.07, 0.07) : 0;
    spawnWeaponShot(state, slotState, wep, aimAngle + jitter, rng);
  }

  const effectiveReload = Math.max(1, Math.round(computeEffectiveReload(state, wep.reloadTicks) * reloadMultiplier));
  slotState.reloadTicks = effectiveReload;
  slotState.maxReloadTicks = effectiveReload;

  if (wep.burstCount > 1) {
    slotState.burstRemaining = wep.burstCount - 1;
    slotState.burstTimer = Math.max(1, wep.burstIntervalTicks);
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
        // Water Boost: continuous thrust along movement (or aim) direction
        const mvLen = Math.hypot(input.moveX, input.moveY);
        const dirX = mvLen > 0.05 ? input.moveX / mvLen : Math.cos(aimAngle);
        const dirY = mvLen > 0.05 ? input.moveY / mvLen : Math.sin(aimAngle);
        player.rolling = true;
        player.rollDirX = dirX;
        player.rollDirY = dirY;
        player.activeTimer = 2;
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
        player.activeCooldown = 10;
        emitEvent(state, { type: 'sfx', sound: 'sndCrystalShield', x: player.x, y: player.y });
      } else if (player.shielding && !input.activeHeld && player.activeTimer < (hasTB ? 14 : 24)) {
        // Allow early release
        player.activeTimer = 0;
      }

      if (player.shielding) {
        player.activeTimer -= 1;
        // Juggernaut (crystal_b): crush enemies on contact while moving slowly
        if (hasUltra(player, 'crystal_b') && state.tick % 5 === 0) {
          for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i]!;
            if (!e.friendly && e.hp > 0 && circleOverlap(player.x, player.y, player.radius + 5, e.x, e.y, e.radius)) {
              applyDamageToEnemy(state, e, 6, (e.x - player.x) * 0.4, (e.y - player.y) * 0.4, rng);
            }
          }
        }
        if (player.activeTimer <= 0) {
          player.shielding = false;
          // Crystal Throne Butt: Teleport to cursor upon releasing shield!
          if (hasTB) {
            const dest = findNearestFloor(state.map, input.aimWorldX, input.aimWorldY, 10);
            player.x = dest.x;
            player.y = dest.y;
            player.prevX = dest.x;
            player.prevY = dest.y;
            emitEvent(state, { type: 'sfx', sound: 'sndCrystalTB', x: dest.x, y: dest.y });
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
        const monsterStyle = hasUltra(player, 'eyes_b');
        const force = hasTB ? 1.7 : 1.1;

        // Pull enemies (or push + damage them with Monster Style!)
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i]!;
          if (e.friendly || e.hp <= 0) continue;
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1e-4 && dSq <= radiusSq) {
            const d = Math.sqrt(dSq);
            const sign = monsterStyle ? -1.4 : 1.0;
            const res = moveCircleWithSlide(
              state.map,
              e.x,
              e.y,
              (dx / d) * force * sign,
              (dy / d) * force * sign,
              e.radius,
            );
            e.x = res.x;
            e.y = res.y;
            if (monsterStyle && state.tick % 6 === 0) {
              applyDamageToEnemy(state, e, 2, -(dx / d) * 3, -(dy / d) * 3, rng);
            }
          }
        }

        // Push enemy projectiles away from Eyes!
        for (let i = 0; i < state.projectiles.length; i++) {
          const pr = state.projectiles[i]!;
          if (pr.team !== 'enemy') continue;
          const dx = pr.x - player.x;
          const dy = pr.y - player.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1e-4 && dSq <= radiusSq) {
            const d = Math.sqrt(dSq);
            const push = hasTB ? 1.5 : 0.95;
            pr.vx += (dx / d) * push;
            pr.vy += (dy / d) * push;
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
      }
      break;
    }

    case 'melting': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const range = hasTB ? 240 : 185;
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
              sound: hasTB ? 'sndCorpseExploUpg' : 'sndCorpseExplo',
            });
          }
        }

        // Melting Ultra A (Brain Capacity): detonate living enemies at or below 5 HP!
        if (hasUltra(player, 'melting_a')) {
          const snap = [...state.enemies];
          for (let i = 0; i < snap.length; i++) {
            const e = snap[i]!;
            if (e.friendly || e.hp <= 0 || e.hp > 5 || e.isBoss) continue;
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            if (dx * dx + dy * dy <= rangeSq) {
              detonated += 1;
              applyDamageToEnemy(state, e, 99, 0, 0, rng, { isExplosion: true, isHeavy: true });
              spawnExplosion(state, e.x, e.y, blastRad, blastDmg, 'player', rng, {
                carveWalls: false,
                clearsProjectiles: true,
                isBlood: true,
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
      if (input.activePressed) {
        const shots = hasTB ? 4 : 2;
        const reloadMult = hasTB ? 2.5 : 1.75;
        const fired = tryFireWeaponSlot(
          state,
          player.activeSlot,
          aimAngle,
          true,
          rng,
          shots,
          reloadMult,
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
        if (curWep && !curWep.cursed) {
          // Consume active weapon; shift surviving weapon into slot 0 or fall back to Rusty Revolver
          const surviving = player.weapons[otherSlot];
          if (surviving) {
            player.weapons[0] = surviving;
            player.weapons[1] = null;
            player.activeSlot = 0;
          } else {
            player.weapons[0] = createWeaponSlot('rusty_revolver');
            player.weapons[1] = null;
            player.activeSlot = 0;
          }
          const hpGain = hasTB ? 4 : 2;
          if (player.hp < player.maxHp) {
            healPlayer(state, hpGain);
          } else {
            const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
            addAmmoToPool(state, ammoType, AMMO_PICKUP_AMOUNT[ammoType] * (hasTB ? 2 : 1));
          }
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndRobotEatUpg' : 'sndRobotEat',
            x: player.x,
            y: player.y,
          });

          // Robot Ultra B (Regurgitate): 35% chance to drop a bonus chest
          if (hasUltra(player, 'robot_b') && rng.chance(0.35)) {
            const isWep = rng.chance(0.45);
            state.props.push({
              id: allocEntityId(state),
              kind: isWep ? 'weapon_chest' : 'ammo_chest',
              x: player.x + Math.cos(aimAngle) * 14,
              y: player.y + Math.sin(aimAngle) * 14,
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
        if (cur && !cur.cursed) {
          const wepDef = getWeaponDef(cur.weaponId);
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
            damage: Math.max(22, wepDef.tier * 4 + 16),
            lifeTicks: 28,
            maxLifeTicks: 28,
            pierce: hasTB ? 5 : 0,
            bounce: hasTB ? 2 : 0,
            explosionRadius: 0,
            sprite: wepDef.sprite,
            weaponId: wepDef.id,
            hitIds: [],
          });

          const surviving = player.weapons[otherSlot];
          if (surviving) {
            player.weapons[0] = surviving;
            player.weapons[1] = null;
            player.activeSlot = 0;
          } else {
            player.weapons[0] = createWeaponSlot('chicken_sword');
            player.weapons[1] = null;
            player.activeSlot = 0;
          }
          player.activeCooldown = 10;
          emitEvent(state, { type: 'sfx', sound: 'sndChickenThrow', x: player.x, y: player.y });
        }
      }
      break;
    }

    case 'rebel': {
      if (input.activePressed && player.activeCooldown <= 0) {
        const hpCost = player.allyCount === 0 ? 1 : 2;
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
      if (input.activeHeld || input.activePressed) {
        if (player.rads > 0) {
          player.radBeamTicks += hasTB ? 2 : 1;
          if (state.tick % 2 === 0) {
            player.rads = Math.max(0, player.rads - 1);
          }
          const ramp = Math.min(4, Math.floor(player.radBeamTicks / 18));
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
            damage: 4 + ramp * 2,
            lifeTicks: 18,
            maxLifeTicks: 18,
            pierce: 2,
            bounce: 0,
            explosionRadius: 0,
            sprite: 'sprHorrorBullet',
            hitIds: [],
          });
          // Throne Butt: sustained beam heals +1 HP every 60 ramp ticks
          if (hasTB && player.radBeamTicks > 0 && player.radBeamTicks % 60 === 0 && player.hp < player.maxHp) {
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
      break;
    }

    case 'rogue': {
      if (input.activePressed && player.activeCooldown <= 0) {
        if (player.portalStrikes > 0) {
          player.portalStrikes -= 1;
          player.activeCooldown = 16;
          const superStrike = hasUltra(player, 'rogue_a');
          const blastCount = superStrike ? 6 : hasTB ? 5 : 4;
          const blastRadius = superStrike ? 46 : hasTB ? 38 : 30;
          const blastDamage = superStrike ? 54 : hasTB ? 42 : 34;

          const baseDist = Math.min(120, Math.hypot(input.aimWorldX - player.x, input.aimWorldY - player.y));
          const startX = player.x + Math.cos(aimAngle) * Math.max(24, baseDist * 0.65);
          const startY = player.y + Math.sin(aimAngle) * Math.max(24, baseDist * 0.65);

          for (let b = 0; b < blastCount; b++) {
            const bx = startX + Math.cos(aimAngle) * (b * 24);
            const by = startY + Math.sin(aimAngle) * (b * 24);
            spawnExplosion(state, bx, by, blastRadius, blastDamage, 'player', rng, {
              carveWalls: true,
              clearsProjectiles: true,
              isRogue: true,
              sound: hasTB ? 'sndPortalStrikeFireButt' : 'sndPortalStrikeFire',
            });
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
      if (e.friendly || e.hp <= 0) continue;
      const dx = e.x - prop.x;
      const dy = e.y - prop.y;
      if (dx * dx + dy * dy <= rSq) {
        e.snaredTicks = Math.max(e.snaredTicks, 8);
        e.vx *= 0.2;
        e.vy *= 0.2;
        if (plantTB && !e.isBoss && e.hp <= e.maxHp * 0.33) {
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
      // Follow player gently, shoot nearest visible enemy
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
          u.attackCooldown = rebelTB ? 6 : 12;
          emitEvent(state, { type: 'sfx', sound: 'sndPistol', x: u.x, y: u.y, pitchJitter: 0.15, volume: 0.6 });
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
  let nearestWepIdx = -1;
  let nearestWepDistSq = 28 * 28;
  const robotRefined = player.mutant === 'robot' && hasUltra(player, 'robot_a');

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i]!;
    const dx = pk.x - player.x;
    const dy = pk.y - player.y;
    const dSq = dx * dx + dy * dy;

    if (pk.kind === 'weapon') {
      // Robot Refined Taste auto-eats very low tier floor weapons on contact
      if (robotRefined && pk.weaponId && dSq <= 16 * 16) {
        const wDef = getWeaponDef(pk.weaponId);
        if (wDef.tier <= 2 && !wDef.golden && !wDef.ultra) {
          state.pickups.splice(i, 1);
          addAmmoToPool(state, rng.pick(NON_MELEE_AMMO_TYPES), 6);
          emitEvent(state, { type: 'sfx', sound: 'sndRobotEat', x: player.x, y: player.y });
          continue;
        }
      }
      if (dSq < nearestWepDistSq) {
        nearestWepDistSq = dSq;
        nearestWepIdx = i;
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
        const cap = hasUltra(player, 'rogue_a') ? 5 : 3;
        if (player.portalStrikes < cap) {
          player.portalStrikes = Math.min(cap, player.portalStrikes + pk.value);
          emitEvent(state, { type: 'sfx', sound: 'sndRogueCanister', x: pk.x, y: pk.y });
          state.pickups.splice(i, 1);
        }
        break;
      }
    }
  }

  // Pick up nearest weapon when pressing E (pickupPressed)
  if (input.pickupPressed && nearestWepIdx !== -1) {
    const pk = state.pickups[nearestWepIdx]!;
    if (pk.weaponId && givePlayerWeapon(state, pk.weaponId)) {
      state.pickups.splice(nearestWepIdx, 1);
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
      if (player.headlessTicks <= 0) {
        player.alive = false;
        state.phase = 'game_over';
        emitEvent(state, {
          type: 'sfx',
          sound: MUTANTS.chicken.sounds.dead,
          x: player.x,
          y: player.y,
        });
        emitEvent(state, {
          type: 'player_died',
          cause: 'BLED OUT HEADLESS',
          killerSprite: 'sprMutant9Dead',
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

    // Weapon swap (Q)
    if (input.swapPressed && player.weapons[1] !== null) {
      player.activeSlot = player.activeSlot === 0 ? 1 : 0;
      emitEvent(state, { type: 'sfx', sound: 'sndSwapPistol', x: player.x, y: player.y });
    }

    // Tick weapon reloads, kick recovery, and active bursts on BOTH slots
    for (let s = 0; s < 2; s++) {
      const slot = player.weapons[s];
      if (!slot) continue;
      if (slot.reloadTicks > 0) slot.reloadTicks -= 1;
      if (slot.kickOffset > 0) {
        slot.kickOffset *= 0.7;
        if (slot.kickOffset < 0.1) slot.kickOffset = 0;
      }
      if (slot.burstRemaining > 0) {
        slot.burstTimer -= 1;
        if (slot.burstTimer <= 0) {
          const wep = getWeaponDef(slot.weaponId);
          spawnWeaponShot(state, slot, wep, player.aimAngle, rng);
          slot.burstRemaining -= 1;
          slot.burstTimer = Math.max(1, wep.burstIntervalTicks);
        }
      }
    }

    // Mutant Active Abilities (RMB)
    handleMutantActive(state, input, player.aimAngle, rng);

    // Movement calculation
    let moveDx = 0;
    let moveDy = 0;
    const baseSpeed = getPlayerMoveSpeed(player);

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
      if (len > 0.01) {
        const clamped = Math.min(1, len);
        const speedMult = player.shielding && hasUltra(player, 'crystal_b') ? 0.45 : 1.0;
        moveDx = (input.moveX / len) * clamped * baseSpeed * speedMult;
        moveDy = (input.moveY / len) * clamped * baseSpeed * speedMult;
      }
    }

    if (moveDx !== 0 || moveDy !== 0) {
      const mv = moveCircleWithSlide(state.map, player.x, player.y, moveDx, moveDy, player.radius);
      player.vx = mv.x - player.x;
      player.vy = mv.y - player.y;
      player.x = mv.x;
      player.y = mv.y;
      player.animFrame = (player.animFrame + 0.35) % 8;

      // Hammerhead: pushing into a wall carves through!
      if (mv.hitWall && hasMutation(player, 'hammerhead') && player.hammerheadTicks > 0) {
        player.hammerheadWallTicks += 1;
        if (player.hammerheadWallTicks >= 8) {
          const dirLen = Math.hypot(moveDx, moveDy) || 1;
          const carveX = player.x + (moveDx / dirLen) * (player.radius + 8);
          const carveY = player.y + (moveDy / dirLen) * (player.radius + 8);
          const carved = carveCircle(state.map, carveX, carveY, 15, true);
          if (carved > 0) {
            player.hammerheadTicks = Math.max(0, player.hammerheadTicks - carved);
            player.hammerheadWallTicks = 0;
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

    // Gamma Guts: enemies touching the player take contact damage!
    if (hasMutation(player, 'gamma_guts') && state.tick % 4 === 0) {
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i]!;
        if (e.friendly || e.hp <= 0) continue;
        if (circleOverlap(player.x, player.y, player.radius + 2, e.x, e.y, e.radius)) {
          applyDamageToEnemy(state, e, 6, (e.x - player.x) * 0.4, (e.y - player.y) * 0.4, rng);
        }
      }
    }

    // Collect pickups & open chests
    collectPickupsAndChests(state, input, rng);
  }

  // 2. Step snare traps & friendly allies
  stepSnareTrapsAndFriendlies(state, rng);

  // 3. Step all projectiles with swept collision
  stepProjectiles(state, rng);
}
