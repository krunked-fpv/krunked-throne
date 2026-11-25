import {
  PLAYER_IFRAMES,
  type AmmoType,
  type CasingEntity,
  type CorpseEntity,
  type EnemyEntity,
  type MutationId,
  type PickupEntity,
  type PickupKind,
  type PlayerState,
  type ProjectileEntity,
  type ProjectileKind,
  type SimState,
  type UltraId,
} from '@/contracts';
import {
  AMMO_PICKUP_AMOUNT,
  ENEMIES,
  MUTANTS,
  WEAPONS,
  getWeaponDef,
  getWeaponsByTier,
} from '@/data';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  emitEvent,
  findNearestFloor,
} from '@/sim/core';

export const NON_MELEE_AMMO_TYPES: readonly Exclude<AmmoType, 'melee'>[] = [
  'bullet',
  'shell',
  'bolt',
  'explosive',
  'energy',
] as const;

export function hasMutation(player: PlayerState, id: MutationId): boolean {
  return player.mutations.includes(id);
}

export function hasUltra(player: PlayerState, id: UltraId): boolean {
  return player.ultra === id;
}

export function getPlayerMoveSpeed(player: PlayerState): number {
  const base = MUTANTS[player.mutant].moveSpeed;
  const extraFeetMult = hasMutation(player, 'extra_feet') ? 1.2 : 1.0;
  return base * extraFeetMult;
}

// Tracks rads absorbed into enemies by Horror's Rad Beam so killing them refunds rads (NT parity).
const horrorAbsorbedRads = new WeakMap<EnemyEntity, number>();

export function addHorrorAbsorbedRads(enemy: EnemyEntity, amount: number): void {
  if (amount <= 0) return;
  const cur = horrorAbsorbedRads.get(enemy) ?? 0;
  horrorAbsorbedRads.set(enemy, Math.min(60, cur + amount));
}

export function addAmmoToPool(
  state: SimState,
  ammoType: AmmoType,
  amount: number,
): number {
  if (ammoType === 'melee' || amount <= 0) return 0;
  const player = state.player;
  const fishMult = player.mutant === 'fish' ? 1.25 : 1.0;
  const hasteMult = state.crown === 'haste' ? 1.25 : 1.0;
  const gain = Math.max(1, Math.round(amount * fishMult * hasteMult));
  const before = player.ammo[ammoType];
  const max = player.ammoMax[ammoType];
  const next = Math.min(max, before + gain);
  player.ammo[ammoType] = next;
  return next - before;
}

function tryRechargeStrongSpirit(state: SimState): void {
  const player = state.player;
  if (player.strongSpiritRecharging && !player.strongSpiritReady && player.hp >= player.maxHp) {
    player.strongSpiritReady = true;
    player.strongSpiritRecharging = false;
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndStrongSpiritGain',
      x: player.x,
      y: player.y,
    });
    emitEvent(state, {
      type: 'pickup_text',
      x: player.x,
      y: player.y - 14,
      text: 'SPIRIT RECHARGED!',
      color: '#88e8ff',
    });
  }
}

export function healPlayer(state: SimState, amount: number): number {
  if (amount <= 0) return 0;
  const player = state.player;
  if (!player.alive) return 0;

  // Chicken headless revive upon receiving HP!
  if (player.mutant === 'chicken' && player.headlessTicks > 0) {
    player.headlessTicks = 0;
    player.headlessDeaths += 1;
    player.maxHp = Math.max(2, player.maxHp - 2);
    player.hp = Math.min(player.maxHp, Math.max(1, amount));
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndChickenRegenHead',
      x: player.x,
      y: player.y,
    });
    emitEvent(state, {
      type: 'pickup_text',
      x: player.x,
      y: player.y - 10,
      text: 'HEAD REGROWN!',
      color: '#ff6666',
    });
    tryRechargeStrongSpirit(state);
    return player.hp;
  }

  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  const gained = player.hp - before;
  if (gained > 0) {
    emitEvent(state, {
      type: 'damage_number',
      x: player.x,
      y: player.y - 8,
      amount: gained,
      heal: true,
    });
  }
  tryRechargeStrongSpirit(state);
  return gained;
}

export function spawnCasing(
  state: SimState,
  x: number,
  y: number,
  aimAngle: number,
  kind: CasingEntity['kind'],
  rng: SeededRng,
): CasingEntity {
  // Eject roughly perpendicular to barrel
  const ejectAngle = aimAngle + (rng.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5) + rng.range(-0.35, 0.35);
  const speed = rng.range(1.2, 2.8);
  const casing: CasingEntity = {
    id: allocEntityId(state),
    x,
    y,
    z: 3,
    vx: Math.cos(ejectAngle) * speed,
    vy: Math.sin(ejectAngle) * speed,
    vz: rng.range(1.6, 2.8),
    angle: rng.range(0, Math.PI * 2),
    vAngle: rng.range(-0.45, 0.45),
    kind,
    baked: false,
  };
  state.casings.push(casing);
  return casing;
}

export function spawnCorpse(
  state: SimState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  facing: 1 | -1,
  sprite: string,
  size: number = 12,
  explodable: boolean = true,
): CorpseEntity {
  const corpse: CorpseEntity = {
    id: allocEntityId(state),
    x,
    y,
    vx,
    vy,
    facing,
    sprite,
    frame: 0,
    baked: false,
    explodable,
    size,
  };
  state.corpses.push(corpse);
  return corpse;
}

export interface SpawnPickupOptions {
  value?: number;
  ammoType?: AmmoType;
  weaponId?: string;
  cursed?: boolean;
  vx?: number;
  vy?: number;
  lifeTicks?: number;
}

export function spawnPickup(
  state: SimState,
  kind: PickupKind,
  x: number,
  y: number,
  opts: SpawnPickupOptions = {},
  rng?: SeededRng,
): PickupEntity {
  const spreadAngle = rng ? rng.range(0, Math.PI * 2) : 0;
  const spreadSpeed = rng ? rng.range(0.8, 2.6) : 0;
  const haste = state.crown === 'haste';
  const defaultLife =
    kind === 'weapon'
      ? 0
      : haste
        ? 150
        : kind === 'rad' || kind === 'big_rad'
          ? 360
          : 420;

  let value = opts.value ?? 1;
  if (kind === 'big_rad' && opts.value === undefined) value = 10;
  if (kind === 'hp' && opts.value === undefined) value = 2;
  if (kind === 'portal_strike' && opts.value === undefined) value = 1;

  const pickup: PickupEntity = {
    id: allocEntityId(state),
    kind,
    x,
    y,
    vx: opts.vx ?? Math.cos(spreadAngle) * spreadSpeed,
    vy: opts.vy ?? Math.sin(spreadAngle) * spreadSpeed,
    value,
    ammoType: opts.ammoType,
    weaponId: opts.weaponId,
    cursed: opts.cursed,
    lifeTicks: opts.lifeTicks ?? defaultLife,
    animFrame: 0,
  };
  state.pickups.push(pickup);
  return pickup;
}

export interface SpawnEnemyProjectileOptions {
  kind?: ProjectileKind;
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  radius?: number;
  lifeTicks?: number;
  sprite?: string;
  pierce?: number;
  bounce?: number;
  explosionRadius?: number;
  sound?: string;
}

export function spawnEnemyProjectile(
  state: SimState,
  opts: SpawnEnemyProjectileOptions,
): ProjectileEntity {
  const euphoriaMult = hasMutation(state.player, 'euphoria') ? 0.72 : 1.0;
  const speed = opts.speed * euphoriaMult;
  const proj: ProjectileEntity = {
    id: allocEntityId(state),
    kind: opts.kind ?? 'enemy_bullet',
    team: 'enemy',
    x: opts.x,
    y: opts.y,
    prevX: opts.x,
    prevY: opts.y,
    vx: Math.cos(opts.angle) * speed,
    vy: Math.sin(opts.angle) * speed,
    angle: opts.angle,
    radius: opts.radius ?? 4,
    damage: opts.damage,
    lifeTicks: opts.lifeTicks ?? 110,
    maxLifeTicks: opts.lifeTicks ?? 110,
    pierce: opts.pierce ?? 0,
    bounce: opts.bounce ?? 0,
    explosionRadius: opts.explosionRadius ?? 0,
    sprite: opts.sprite ?? 'sprEnemyBullet1',
    hitIds: [],
  };
  state.projectiles.push(proj);
  if (opts.sound) {
    emitEvent(state, {
      type: 'sfx',
      sound: opts.sound,
      x: opts.x,
      y: opts.y,
      pitchJitter: 0.08,
    });
  }
  return proj;
}

export interface SpawnExplosionOptions {
  carveWalls?: boolean;
  clearsProjectiles?: boolean;
  isFire?: boolean;
  isBlood?: boolean;
  isRogue?: boolean;
  isRad?: boolean;
  selfDamage?: boolean;
  detonateCorpses?: boolean;
  sound?: string;
  cause?: string;
  killerSprite?: string;
}

export function spawnExplosion(
  state: SimState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  team: 'player' | 'enemy' | 'neutral',
  rng: SeededRng,
  opts: SpawnExplosionOptions = {},
): void {
  const crownDeathMult = state.crown === 'death' ? 1.4 : 1.0;
  const effectiveRadius = Math.max(8, radius * crownDeathMult);
  const carveWalls = opts.carveWalls ?? true;

  if (carveWalls) {
    carveCircle(state.map, x, y, effectiveRadius * 0.85, true);
  }

  // Emit scorch decal + particles + shake + hitstop
  emitEvent(state, {
    type: 'decal',
    decal: {
      kind: opts.isBlood ? 'blood' : opts.isRad ? 'acid' : 'scorch',
      x,
      y,
      angle: rng.range(0, Math.PI * 2),
      scale: effectiveRadius / 28,
      color: opts.isBlood
        ? '#7a1212'
        : opts.isRogue
          ? '#1e4ea8'
          : opts.isRad
            ? '#33cc44'
            : '#221c18',
    },
  });

  const particleColor = opts.isBlood
    ? '#cc2222'
    : opts.isRogue
      ? '#4ca6ff'
      : opts.isRad
        ? '#55ff66'
        : '#ffaa33';
  const particleSprite = opts.isBlood
    ? 'sprMeatExplosion'
    : opts.isRogue
      ? 'sprRogueExplosion'
      : opts.isRad
        ? 'sprGreenExplosion'
        : effectiveRadius >= 40
          ? 'sprExplosion'
          : 'sprSmallExplosion';

  emitEvent(state, {
    type: 'particle',
    kind: 'explosion',
    x,
    y,
    vx: 0,
    vy: 0,
    color: particleColor,
    size: effectiveRadius,
    life: 10,
    sprite: particleSprite,
  });

  for (let i = 0; i < 6; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const spd = rng.range(1.2, 4.5);
    emitEvent(state, {
      type: 'particle',
      kind: 'spark',
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      color: particleColor,
      size: rng.range(2, 4),
      life: rng.int(6, 12),
    });
  }

  const soundKey =
    opts.sound ??
    (opts.isBlood
      ? 'sndCorpseExplo'
      : effectiveRadius >= 55
        ? 'sndExplosionL'
        : 'sndExplosion');
  if (soundKey.length > 0) {
    emitEvent(state, {
      type: 'sfx',
      sound: soundKey,
      x,
      y,
      pitchJitter: 0.1,
    });
  }

  emitEvent(state, {
    type: 'shake',
    trauma: Math.min(0.9, 0.28 + effectiveRadius / 110),
  });

  const hitstop = effectiveRadius >= 55 ? 4 : 3;
  if (state.hitstopTicks < hitstop) {
    state.hitstopTicks = hitstop;
    emitEvent(state, { type: 'hitstop', ticks: hitstop });
  }

  // Clear enemy projectiles inside blast when player/corpse/rogue explosion
  if (opts.clearsProjectiles ?? (team === 'player' || opts.isBlood || opts.isRogue)) {
    const clearRadSq = effectiveRadius * effectiveRadius;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const pr = state.projectiles[i]!;
      if (pr.team === 'enemy' && pr.kind !== 'enemy_laser' && pr.kind !== 'melee_slash') {
        const dx = pr.x - x;
        const dy = pr.y - y;
        if (dx * dx + dy * dy <= clearRadSq) {
          state.projectiles.splice(i, 1);
        }
      }
    }
  }

  // Damage enemies
  const enemiesSnapshot = [...state.enemies];
  for (let i = 0; i < enemiesSnapshot.length; i++) {
    const enemy = enemiesSnapshot[i]!;
    if (enemy.hp <= 0) continue;
    if (team === 'player' && enemy.friendly) continue;
    if (team === 'enemy' && !enemy.friendly) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const reach = effectiveRadius + enemy.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      const dist = Math.hypot(dx, dy) || 1;
      const falloff = Math.max(0.5, 1 - (dist / (reach * 1.35)) * 0.5);
      const dmg = Math.max(1, Math.round(damage * falloff));
      applyDamageToEnemy(
        state,
        enemy,
        dmg,
        (dx / dist) * 6,
        (dy / dist) * 6,
        rng,
        { isExplosion: true, isHeavy: true },
      );
    }
  }

  // Damage nearby breakable props (snapshot array so chain-exploding cars/barrels can never invalidate indices!)
  const propsSnapshot = [...state.props];
  for (let i = 0; i < propsSnapshot.length; i++) {
    const prop = propsSnapshot[i]!;
    if (!state.props.includes(prop) || prop.hp <= 0 || prop.opened) continue;
    if (
      prop.kind === 'weapon_chest' ||
      prop.kind === 'big_weapon_chest' ||
      prop.kind === 'ammo_chest' ||
      prop.kind === 'snare_trap'
    ) {
      continue;
    }
    const dx = prop.x - x;
    const dy = prop.y - y;
    const reach = effectiveRadius + prop.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      damageProp(state, prop, Math.max(4, Math.round(damage * 0.5)), rng);
    }
  }

  // Blood Launcher / Blood Cannon detonates nearby explodable corpses in a chain!
  if (opts.detonateCorpses) {
    const corpseRadSq = effectiveRadius * effectiveRadius;
    const toDetonate: Array<{ x: number; y: number }> = [];
    for (let i = state.corpses.length - 1; i >= 0; i--) {
      const c = state.corpses[i]!;
      if (!c.explodable) continue;
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy <= corpseRadSq) {
        toDetonate.push({ x: c.x, y: c.y });
        state.corpses.splice(i, 1);
      }
    }
    for (let i = 0; i < toDetonate.length; i++) {
      const pt = toDetonate[i]!;
      spawnExplosion(state, pt.x, pt.y, 28, 22, team, rng, {
        carveWalls: false,
        clearsProjectiles: true,
        isBlood: true,
        selfDamage: false,
        detonateCorpses: false,
        sound: 'sndCorpseExplo',
      });
    }
  }

  // Damage player (respects explicit selfDamage override, plus Boiling Veins <=4 HP protection)
  const canHurtPlayer = opts.selfDamage ?? (!opts.isBlood && !opts.isRogue && !opts.isRad);
  if (canHurtPlayer && state.player.alive) {
    const p = state.player;
    const dx = p.x - x;
    const dy = p.y - y;
    const reach = effectiveRadius + p.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      const playerDmg = team === 'player' ? Math.min(4, Math.max(2, Math.round(damage * 0.12))) : Math.min(6, Math.max(2, Math.round(damage * 0.25)));
      applyDamageToPlayer(
        state,
        playerDmg,
        opts.cause ?? 'EXPLOSION',
        opts.killerSprite ?? 'sprExplosion',
        rng,
        { isExplosion: true, isFire: opts.isFire ?? false },
      );
    }
  }
}

export function damageProp(
  state: SimState,
  prop: SimState['props'][number],
  damage: number,
  rng: SeededRng,
): void {
  if (prop.hp <= 0) return;
  prop.hp -= damage;
  prop.hurtFlashTicks = 3;

  if (prop.hp > 0) {
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndHitMetal',
      x: prop.x,
      y: prop.y,
      pitchJitter: 0.1,
    });
    return;
  }

  const idx = state.props.indexOf(prop);
  if (idx !== -1) state.props.splice(idx, 1);

  switch (prop.kind) {
    case 'rad_canister': {
      const rads = prop.radsStored ?? 12;
      const bigCount = Math.floor(rads / 10);
      const smallCount = rads % 10;
      for (let i = 0; i < bigCount; i++) {
        spawnPickup(state, 'big_rad', prop.x, prop.y, { value: 10 }, rng);
      }
      for (let i = 0; i < smallCount; i++) {
        spawnPickup(state, 'rad', prop.x, prop.y, { value: 1 }, rng);
      }
      emitEvent(state, { type: 'sfx', sound: 'sndEXPChest', x: prop.x, y: prop.y });
      break;
    }
    case 'idpd_canister': {
      const strikeGain = hasUltra(state.player, 'rogue_a') ? 2 : 1;
      spawnPickup(state, 'portal_strike', prop.x, prop.y, { value: strikeGain }, rng);
      emitEvent(state, { type: 'sfx', sound: 'sndRogueCanister', x: prop.x, y: prop.y });
      break;
    }
    case 'car': {
      spawnExplosion(state, prop.x, prop.y, 44, 34, 'neutral', rng, {
        sound: 'sndExplosionCar',
        cause: 'CAR EXPLOSION',
        killerSprite: 'sprCarIdle',
      });
      break;
    }
    case 'barrel': {
      spawnExplosion(state, prop.x, prop.y, 34, 24, 'neutral', rng, {
        cause: 'BARREL EXPLOSION',
        killerSprite: 'sprBarrel',
      });
      break;
    }
    case 'toxic_barrel': {
      spawnExplosion(state, prop.x, prop.y, 38, 16, 'neutral', rng, {
        isRad: true,
        sound: 'sndToxicBarrelGas',
        cause: 'TOXIC BARREL',
        killerSprite: 'sprToxicBarrel',
      });
      break;
    }
    case 'throne_generator': {
      state.generatorsRemaining = Math.max(0, state.generatorsRemaining - 1);
      spawnExplosion(state, prop.x, prop.y, 46, 32, 'player', rng, {
        isRad: true,
        sound: 'sndBigGeneratorBreak',
      });
      emitEvent(state, {
        type: 'pickup_text',
        x: prop.x,
        y: prop.y - 10,
        text: `GENERATORS LEFT: ${state.generatorsRemaining}`,
        color: '#66ff88',
      });
      break;
    }
    default: {
      emitEvent(state, {
        type: 'decal',
        decal: {
          kind: 'rubble',
          x: prop.x,
          y: prop.y,
          angle: rng.range(0, Math.PI * 2),
          scale: 1,
          color: '#7a7266',
        },
      });
      break;
    }
  }
}

export function spawnFriendlyUnit(
  state: SimState,
  defId: 'rebel_ally' | 'plant_sapling',
  x: number,
  y: number,
): EnemyEntity {
  const def = ENEMIES[defId]!;
  const safe = findNearestFloor(state.map, x, y, 6);
  const boostedMaxHp =
    defId === 'rebel_ally' && hasUltra(state.player, 'rebel_a')
      ? Math.round(def.maxHp * 1.6)
      : def.maxHp;
  const unit: EnemyEntity = {
    id: allocEntityId(state),
    defId,
    x: safe.x,
    y: safe.y,
    prevX: safe.x,
    prevY: safe.y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    hp: boostedMaxHp,
    maxHp: boostedMaxHp,
    facing: 1,
    aimAngle: 0,
    hurtFlashTicks: 0,
    snaredTicks: 0,
    aiState: 'follow',
    aiTimer: 10,
    aiPhase: 0,
    attackCooldown: 12,
    targetX: safe.x,
    targetY: safe.y,
    animFrame: 0,
    contactDamage: def.contactDamage,
    radDrop: 0,
    friendly: true,
  };
  state.enemies.push(unit);
  return unit;
}

export interface DamageEnemyOptions {
  isMelee?: boolean;
  isExplosion?: boolean;
  isHeavy?: boolean;
  isCrit?: boolean;
  fromBullet?: boolean;
  fromHeavyBullet?: boolean;
  suppressCorpse?: boolean;
}

export function applyDamageToEnemy(
  state: SimState,
  enemy: EnemyEntity,
  damage: number,
  knockX: number,
  knockY: number,
  rng: SeededRng,
  opts: DamageEnemyOptions = {},
): boolean {
  if (enemy.hp <= 0 || enemy.invulnerable) return false;

  const actualDmg = Math.max(1, Math.round(damage));
  enemy.hp -= actualDmg;
  enemy.hurtFlashTicks = 4;
  enemy.vx += knockX * (enemy.isBoss ? 0.16 : 0.78);
  enemy.vy += knockY * (enemy.isBoss ? 0.16 : 0.78);
  state.stats.damageDealt += actualDmg;

  const def = ENEMIES[enemy.defId];
  const killedNow = enemy.hp <= 0;

  emitEvent(state, {
    type: 'damage_number',
    x: enemy.x,
    y: enemy.y - enemy.radius - 4,
    amount: actualDmg,
    crit: opts.isCrit || opts.isHeavy,
  });

  if (!enemy.friendly) {
    emitEvent(state, {
      type: 'hit_confirm',
      x: enemy.x,
      y: enemy.y,
      damage: actualDmg,
      killed: killedNow,
      crit: Boolean(opts.isCrit || opts.isHeavy),
      melee: Boolean(opts.isMelee),
    });
  }

  if (state.boss && state.boss.entityId === enemy.id) {
    state.boss.hp = Math.max(0, enemy.hp);
  }

  // Recycle Gland on player bullet hits (60% chance refund 1 bullet, or 2 for heavy bullets!)
  if (
    (opts.fromBullet || opts.fromHeavyBullet) &&
    !enemy.friendly &&
    hasMutation(state.player, 'recycle_gland') &&
    rng.chance(0.6)
  ) {
    const refund = opts.fromHeavyBullet ? 2 : 1;
    state.player.ammo.bullet = Math.min(state.player.ammoMax.bullet, state.player.ammo.bullet + refund);
  }

  if (enemy.hp > 0) {
    if ((opts.isHeavy || (opts.isMelee && actualDmg >= 10)) && state.hitstopTicks < 1) {
      state.hitstopTicks = 1;
      emitEvent(state, { type: 'hitstop', ticks: 1 });
    }
    emitEvent(state, {
      type: 'sfx',
      sound: def?.sounds.hurt ?? 'sndHitFlesh',
      x: enemy.x,
      y: enemy.y,
      pitchJitter: 0.12,
    });
    return false;
  }

  // === ENEMY KILLED ===
  const idx = state.enemies.indexOf(enemy);
  if (idx !== -1) state.enemies.splice(idx, 1);

  if (enemy.friendly) {
    if (enemy.defId === 'rebel_ally') {
      state.player.allyCount = Math.max(0, state.player.allyCount - 1);
    }
    emitEvent(state, {
      type: 'sfx',
      sound: def?.sounds.dead ?? 'sndAllyDead',
      x: enemy.x,
      y: enemy.y,
    });
    return true;
  }

  const player = state.player;
  state.stats.kills += 1;
  state.levelKills += 1;

  // Hitstop & screen feedback
  const stopTicks = enemy.isBoss ? 4 : opts.isMelee || opts.isHeavy ? 2 : 1;
  if (state.hitstopTicks < stopTicks) {
    state.hitstopTicks = stopTicks;
    emitEvent(state, { type: 'hitstop', ticks: stopTicks });
  }
  emitEvent(state, {
    type: 'shake',
    trauma: enemy.isBoss ? 0.75 : opts.isHeavy ? 0.25 : 0.1,
  });
  emitEvent(state, {
    type: 'sfx',
    sound: def?.sounds.dead ?? 'sndBanditDie',
    x: enemy.x,
    y: enemy.y,
    pitchJitter: 0.1,
  });

  // Blood decal
  emitEvent(state, {
    type: 'decal',
    decal: {
      kind: 'blood',
      x: enemy.x,
      y: enemy.y,
      angle: rng.range(0, Math.PI * 2),
      scale: enemy.isBoss ? 2.2 : 1.0,
      color: '#8c1414',
    },
  });

  // Spawn high-velocity flying corpse (skipped if vaporized by Melting Brain Capacity)
  if (!opts.suppressCorpse) {
    const hasIW = hasMutation(player, 'impact_wrists');
    const impactMult = hasIW ? 2.45 : 1.25;
    const rawVx = (enemy.vx * 0.55 + (knockX || rng.range(-2.4, 2.4))) * impactMult;
    const rawVy = (enemy.vy * 0.55 + (knockY || rng.range(-2.4, 2.4))) * impactMult;
    const maxCorpseSpd = hasIW ? 22 : 14;
    const rawSpd = Math.hypot(rawVx, rawVy);
    const scale = rawSpd > maxCorpseSpd && rawSpd > 1e-4 ? maxCorpseSpd / rawSpd : 1;
    spawnCorpse(
      state,
      enemy.x,
      enemy.y,
      rawVx * scale,
      rawVy * scale,
      enemy.facing,
      def?.sprites.dead ?? 'sprBanditDead',
      enemy.radius * 1.5,
      true,
    );
  }

  // Boss defeat handling
  if (enemy.isBoss && enemy.bossId) {
    if (state.boss && state.boss.entityId === enemy.id) {
      state.boss.hp = 0;
      state.boss.defeated = true;
    }
    if (!state.stats.bossesDefeated.includes(enemy.bossId)) {
      state.stats.bossesDefeated.push(enemy.bossId);
    }
  }

  // Trigger Fingers: reduce reload time on BOTH weapon slots by 40% on every kill (NT parity!)
  if (hasMutation(player, 'trigger_fingers')) {
    for (let s = 0; s < 2; s++) {
      const slotWep = player.weapons[s];
      if (slotWep && slotWep.reloadTicks > 0) {
        slotWep.reloadTicks = Math.max(0, Math.floor(slotWep.reloadTicks * 0.6));
      }
    }
  }

  // Bloodlust: chance to heal +1 HP on kill
  if (hasMutation(player, 'bloodlust') && player.hp < player.maxHp && rng.chance(0.08)) {
    healPlayer(state, 1);
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndBloodlustProc',
      x: player.x,
      y: player.y,
    });
  }

  // Lucky Shot: chance on kill to grant a FULL ammo pack for a random ammo type
  if (hasMutation(player, 'lucky_shot') && rng.chance(0.1)) {
    const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
    const gained = addAmmoToPool(state, ammoType, AMMO_PICKUP_AMOUNT[ammoType]);
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndLuckyShotProc',
      x: player.x,
      y: player.y,
    });
    if (gained > 0) {
      emitEvent(state, {
        type: 'pickup_text',
        x: player.x,
        y: player.y - 12,
        text: `+${gained} ${ammoType.toUpperCase()}`,
        color: '#ffe066',
      });
    }
  }

  // Chicken Ultra A (Harder to Kill): extend headless timer on kill
  if (player.mutant === 'chicken' && player.headlessTicks > 0 && hasUltra(player, 'chicken_a')) {
    player.headlessTicks = Math.min(210, player.headlessTicks + 35);
  }

  // Plant Ultra B (Killer): snared enemy spawns multiple friendly saplings!
  if (player.mutant === 'plant' && hasUltra(player, 'plant_b') && enemy.snaredTicks > 0) {
    const saplingCount = enemy.maxHp >= 30 ? 3 : 2;
    for (let s = 0; s < saplingCount; s++) {
      const ang = (s / saplingCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
      spawnFriendlyUnit(state, 'plant_sapling', enemy.x + Math.cos(ang) * 8, enemy.y + Math.sin(ang) * 8);
    }
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndSaplingSpawn',
      x: enemy.x,
      y: enemy.y,
    });
  }

  // Horror Ultra A (Stalker): enemy explodes into rad burst on death
  if (player.mutant === 'horror' && hasUltra(player, 'horror_a')) {
    spawnExplosion(state, enemy.x, enemy.y, 30, 14, 'player', rng, {
      carveWalls: false,
      isRad: true,
      selfDamage: false,
      sound: 'sndRadPickup',
    });
  }

  // Rad drops (Melting gets +1 bonus rad per kill; Crown of Blood drops fewer; Horror refunds absorbed beam rads)
  const absorbedRads = horrorAbsorbedRads.get(enemy) ?? 0;
  let baseRads = enemy.radDrop;
  if (player.mutant === 'melting') baseRads += 1;
  if (state.crown === 'blood') baseRads = Math.max(0, Math.floor(baseRads * 0.65));
  const totalRads = baseRads + absorbedRads;

  const bigRads = Math.floor(totalRads / 10);
  const smallRads = totalRads % 10;
  for (let i = 0; i < bigRads; i++) {
    spawnPickup(state, 'big_rad', enemy.x, enemy.y, { value: 10 }, rng);
  }
  for (let i = 0; i < smallRads; i++) {
    spawnPickup(state, 'rad', enemy.x, enemy.y, { value: 1 }, rng);
  }

  // Drop rates modified by Rabbit Paw, Crown of Risk, Crown of Life, Crown of Guns, Heavy Heart
  let dropMult = 1.0;
  if (hasMutation(player, 'rabbit_paw')) dropMult *= 1.45;
  if (state.crown === 'risk') {
    dropMult *= player.hp >= player.maxHp ? 1.6 : 0.55;
  }

  // Health drop (ONLY drops when wounded or Chicken headless, never at full HP or with Crown of Life!)
  const needsHp = player.hp < player.maxHp || player.headlessTicks > 0;
  const missingHpRatio = player.maxHp > 0 ? Math.max(0, 1 - player.hp / player.maxHp) : 0;
  if (needsHp && state.crown !== 'life' && rng.chance((0.06 + missingHpRatio * 0.16) * dropMult)) {
    spawnPickup(state, 'hp', enemy.x, enemy.y, { value: 2 }, rng);
  }

  // Ammo drop (scales inversely with current active weapon ammo fullness, NT parity!)
  if (state.crown !== 'guns') {
    const activeWep = getWeaponDef(player.weapons[player.activeSlot]?.weaponId ?? 'revolver');
    const ammoFill =
      activeWep.ammoType !== 'melee' && player.ammoMax[activeWep.ammoType] > 0
        ? Math.min(1, player.ammo[activeWep.ammoType] / player.ammoMax[activeWep.ammoType])
        : 0.5;
    const scarcityBoost = 1 + (1 - ammoFill) * 0.65;
    if (rng.chance(0.11 * scarcityBoost * dropMult)) {
      const chosenAmmo =
        activeWep.ammoType !== 'melee' && rng.chance(0.65)
          ? activeWep.ammoType
          : rng.pick(NON_MELEE_AMMO_TYPES);
      spawnPickup(
        state,
        'ammo',
        enemy.x,
        enemy.y,
        { ammoType: chosenAmmo, value: AMMO_PICKUP_AMOUNT[chosenAmmo] },
        rng,
      );
    }
  }

  // Weapon drop (Crown of Guns / Heavy Heart / Boss drop)
  let wepDropChance = enemy.isBoss ? 1.0 : 0.025;
  if (state.crown === 'guns') wepDropChance = Math.max(wepDropChance, 0.22);
  if (hasMutation(player, 'heavy_heart')) wepDropChance *= 2.5;
  if (rng.chance(wepDropChance)) {
    const tier = Math.min(12, Math.max(0, state.loop * 4 + 3 + (player.mutant === 'robot' ? 1 : 0)));
    const minTier = player.mutant === 'robot' && hasUltra(player, 'robot_a') ? Math.min(tier, 4) : 0;
    const allowCursed = state.crown === 'curses' || state.biome === 'cursed_caves';
    const pool = getWeaponsByTier(minTier, tier, allowCursed);
    const chosen = pool.length > 0 ? rng.pick(pool) : WEAPONS.revolver!;
    const dropCursed = Boolean(chosen.cursed) || (allowCursed && rng.chance(0.35));
    spawnPickup(
      state,
      'weapon',
      enemy.x,
      enemy.y,
      { weaponId: chosen.id, cursed: dropCursed, value: 1 },
      rng,
    );
  }

  // Fish Ultra A (Confiscate): chance to drop a bonus ammo/weapon chest on valid walkable floor
  if (player.mutant === 'fish' && hasUltra(player, 'fish_a') && rng.chance(0.12)) {
    const chestPos = findNearestFloor(state.map, enemy.x, enemy.y, 8);
    const isWep = state.crown !== 'love' && rng.chance(0.35);
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

  return true;
}

export interface DamagePlayerOptions {
  isExplosion?: boolean;
  isFire?: boolean;
  ignoreIframes?: boolean;
  bypassShield?: boolean;
}

export function applyDamageToPlayer(
  state: SimState,
  damage: number,
  cause: string,
  killerSprite: string,
  rng: SeededRng,
  opts: DamagePlayerOptions = {},
): boolean {
  const player = state.player;
  if (!player.alive || player.godMode || damage <= 0) return false;
  if (!opts.ignoreIframes && player.iframes > 0) return false;
  if (!opts.bypassShield && player.shielding) return false;

  // Boiling Veins: immune to explosions & fire at <= 4 HP, and clamps lethal hits from >4 HP down to 4 HP!
  let dmg = Math.max(1, Math.round(damage));
  if ((opts.isExplosion || opts.isFire) && hasMutation(player, 'boiling_veins')) {
    if (player.hp <= 4) {
      return false;
    }
    if (player.hp - dmg < 4) {
      dmg = player.hp - 4;
    }
  }

  const alreadyHeadless = player.mutant === 'chicken' && player.headlessTicks > 0;
  player.hp = alreadyHeadless ? 0 : player.hp - dmg;
  player.iframes = PLAYER_IFRAMES;
  player.hurtFlashTicks = 6;
  player.lastDamageCause = cause;
  player.lastKillerSprite = killerSprite;
  state.stats.damageTaken += dmg;

  const mutantDef = MUTANTS[player.mutant];
  emitEvent(state, {
    type: 'sfx',
    sound: mutantDef.sounds.hurt,
    x: player.x,
    y: player.y,
  });
  emitEvent(state, {
    type: 'damage_number',
    x: player.x,
    y: player.y - 10,
    amount: dmg,
    crit: true,
  });
  emitEvent(state, { type: 'shake', trauma: 0.45 });
  if (state.hitstopTicks < 2) {
    state.hitstopTicks = 2;
    emitEvent(state, { type: 'hitstop', ticks: 2 });
  }

  // Sharp Teeth: retaliate 2x damage taken to all active enemies on screen (within 260px)
  if (hasMutation(player, 'sharp_teeth')) {
    const retal = dmg * 2;
    const snap = [...state.enemies];
    for (let i = 0; i < snap.length; i++) {
      const e = snap[i]!;
      if (e.friendly || e.hp <= 0 || e.aiState === 'disguised') continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy <= 260 * 260) {
        applyDamageToEnemy(state, e, retal, 0, 0, rng);
      }
    }
  }

  // Rogue Passive: Blast Armor / Ultra B: Super Blast Armor (never hurts Rogue!)
  if (player.mutant === 'rogue') {
    const superBlast = hasUltra(player, 'rogue_b');
    spawnExplosion(
      state,
      player.x,
      player.y,
      superBlast ? 72 : 44,
      superBlast ? 48 : 24,
      'player',
      rng,
      {
        carveWalls: true,
        clearsProjectiles: true,
        isRogue: true,
        selfDamage: false,
        sound: 'sndPortalStrikeFire',
      },
    );
  }

  // Headless Chicken is immune to further HP death (only the bleed-out timer kills her!)
  if (alreadyHeadless) {
    player.hp = 0;
    return true;
  }

  // Lethal check
  if (player.hp <= 0) {
    // Strong Spirit: prevents death once at 1 HP; must enter next area before becoming eligible to recharge!
    if (player.strongSpiritReady) {
      player.hp = 1;
      player.strongSpiritReady = false;
      player.strongSpiritRecharging = false;
      player.iframes = 24;
      emitEvent(state, {
        type: 'sfx',
        sound: 'sndStrongSpiritLost',
        x: player.x,
        y: player.y,
      });
      emitEvent(state, {
        type: 'pickup_text',
        x: player.x,
        y: player.y - 14,
        text: 'STRONG SPIRIT!',
        color: '#88e8ff',
      });
      return true;
    }

    // Chicken passive: enter 5-second headless state if not already headless
    if (player.mutant === 'chicken' && player.headlessTicks === 0 && player.maxHp > 2) {
      player.hp = 0;
      player.headlessTicks = 150;
      player.iframes = 18;
      emitEvent(state, {
        type: 'sfx',
        sound: 'sndChickenLoseHead',
        x: player.x,
        y: player.y,
      });
      emitEvent(state, {
        type: 'pickup_text',
        x: player.x,
        y: player.y - 14,
        text: 'HEADLESS!',
        color: '#ff4444',
      });
      return true;
    }

    // True death
    player.hp = 0;
    player.alive = false;
    state.phase = 'game_over';
    emitEvent(state, {
      type: 'sfx',
      sound: mutantDef.sounds.dead,
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
  }

  return true;
}
