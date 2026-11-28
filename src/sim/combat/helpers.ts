import {
  type AmmoType,
  type CasingEntity,
  type CorpseEntity,
  type EnemyEntity,
  type MutantId,
  type MutationId,
  type PickupEntity,
  type PickupKind,
  type PlayerState,
  type ProjectileEntity,
  type ProjectileKind,
  type PropKind,
  type SaveData,
  type SimState,
  type UltraId,
} from '@/contracts';
import {
  AMMO_PICKUP_AMOUNT,
  DEFAULT_AMMO_MAX,
  ENEMIES,
  MUTANTS,
  WEAPONS,
  getAreaDef,
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

/** Canonical Nuclear Throne mini ammo pack sizes (used by Lucky Shot & Skeleton Blood Gamble). */
export const MINI_AMMO_PACK_SIZE: Record<AmmoType, number> = {
  melee: 0,
  bullet: 12,
  shell: 4,
  bolt: 4,
  explosive: 3,
  energy: 6,
};

/** Authentic NT i-frame distinction: projectile hits grant 5 ticks vs contact/melee 11 ticks. */
export const PLAYER_PROJECTILE_IFRAMES = 5;
export const PLAYER_CONTACT_IFRAMES = 11;

export type UnlockEventKind =
  | 'bskin_fish'
  | 'bskin_crystal'
  | 'bskin_eyes'
  | 'bskin_melting'
  | 'bskin_plant'
  | 'bskin_yv'
  | 'bskin_steroids'
  | 'bskin_robot'
  | 'bskin_chicken'
  | 'bskin_rebel'
  | 'bskin_horror'
  | 'bskin_rogue'
  | 'bskin_skeleton'
  | 'hard_mode'
  | 'mutant_frog'
  | 'mutant_skeleton'
  | 'mutant_horror';

const CORE_12_MUTANTS: readonly MutantId[] = [
  'fish',
  'crystal',
  'eyes',
  'melting',
  'plant',
  'yv',
  'steroids',
  'robot',
  'chicken',
  'rebel',
  'horror',
  'rogue',
] as const;

type SimStateWithMeta = SimState & {
  protoChestWeaponId?: string | null;
  pendingUnlocks?: UnlockEventKind[];
};

const INDESTRUCTIBLE_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  'weapon_chest',
  'big_weapon_chest',
  'ammo_chest',
  'health_chest',
  'giant_weapon_chest',
  'giant_ammo_chest',
  'pizza_chest',
  'proto_chest',
  'venuz_car_exit',
  'yung_cuz',
  'necro_revive_area',
  'snare_trap',
]);

export function isIndestructiblePropKind(kind: PropKind): boolean {
  return INDESTRUCTIBLE_PROP_KINDS.has(kind);
}

export function getProtoChestWeaponId(state: SimState): string | null {
  const meta = state as SimStateWithMeta;
  return meta.protoChestWeaponId ?? null;
}

export function setProtoChestWeaponId(state: SimState, weaponId: string | null): void {
  const meta = state as SimStateWithMeta;
  meta.protoChestWeaponId = weaponId && weaponId.trim().length > 0 ? weaponId.trim() : null;
}

export function getPendingUnlocks(state: SimState): readonly UnlockEventKind[] {
  const meta = state as SimStateWithMeta;
  return meta.pendingUnlocks ?? [];
}

export function drainPendingUnlocks(state: SimState): UnlockEventKind[] {
  const meta = state as SimStateWithMeta;
  const list = meta.pendingUnlocks ?? [];
  meta.pendingUnlocks = [];
  return list;
}

export function recordUnlock(state: SimState, unlock: UnlockEventKind): boolean {
  const meta = state as SimStateWithMeta;
  if (!meta.pendingUnlocks) {
    meta.pendingUnlocks = [];
  }
  if (meta.pendingUnlocks.includes(unlock)) {
    return false;
  }
  meta.pendingUnlocks.push(unlock);
  emitEvent(state, {
    type: 'pickup_text',
    x: state.player.x,
    y: state.player.y - 20,
    text: `UNLOCKED: ${unlock.toUpperCase().replace(/_/g, ' ')}!`,
    color: '#ffe066',
  });
  return true;
}

/** Evaluates cross-run global B-skin unlocks (Fish: all 12 looped; Y.V.: all 12 golden weapons). */
export function checkSaveLevelUnlocks(save: SaveData): UnlockEventKind[] {
  const unlocked: UnlockEventKind[] = [];
  if (CORE_12_MUTANTS.every((id) => (save.mutants[id]?.bestLoop ?? 0) >= 1)) {
    unlocked.push('bskin_fish');
  }
  if (CORE_12_MUTANTS.every((id) => Boolean(save.mutants[id]?.goldenWeapon))) {
    unlocked.push('bskin_yv');
  }
  return unlocked;
}

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

export interface SpawnFrogGasOptions {
  count?: number;
  speedMult?: number;
  lifeTicks?: number;
  team?: 'player' | 'enemy';
  emitSound?: boolean;
}

/** Emits growing Frog Toxic Gas Cloud puffs (`sprFrogGas`, 2 dmg/tick; Throne Butt expands 2x faster). */
export function spawnFrogToxicGas(
  state: SimState,
  x: number,
  y: number,
  rng: SeededRng,
  opts: SpawnFrogGasOptions = {},
): void {
  const hasTB = state.player.mutant === 'frog' && hasMutation(state.player, 'throne_butt');
  const team = opts.team ?? 'player';
  const count = opts.count ?? 3;
  const speedMult = (opts.speedMult ?? 1.0) * (team === 'player' && hasTB ? 2.0 : 1.0);
  const lifeTicks = opts.lifeTicks ?? (team === 'player' && hasTB ? 68 : 50);

  for (let k = 0; k < count; k++) {
    const ang = (k / Math.max(1, count)) * Math.PI * 2 + rng.range(-0.45, 0.45);
    const spd = rng.range(0.9, 2.2) * speedMult;
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
      radius: 9,
      damage: 2,
      lifeTicks,
      maxLifeTicks: lifeTicks,
      pierce: 99,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprFrogGas',
      weaponId: 'frog_gas',
      hitIds: [],
      sourceCause: 'TOXIC GAS',
      sourceSprite: 'sprFrogGas',
    });
    emitEvent(state, {
      type: 'particle',
      kind: 'toxic',
      x,
      y,
      vx: Math.cos(ang) * spd * 0.7,
      vy: Math.sin(ang) * spd * 0.7,
      color: '#58e038',
      size: 6,
      life: 16,
      sprite: 'sprFrogGas',
    });
  }
  if (opts.emitSound) {
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndToxicBoltGas',
      x,
      y,
      pitchJitter: 0.12,
      volume: 0.65,
    });
  }
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
    prevX: x,
    prevY: y,
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
  const baseDefaultLife =
    kind === 'weapon'
      ? 0
      : haste
        ? 150
        : kind === 'rad' || kind === 'big_rad'
          ? 360
          : 420;
  // Cursed Ammo fades 3x faster and explodes on expiry!
  const defaultLife =
    kind === 'cursed_ammo' ? Math.max(20, Math.round(baseDefaultLife / 3)) : baseDefaultLife;

  let value = opts.value ?? 1;
  if (kind === 'big_rad' && opts.value === undefined) value = 10;
  if (kind === 'hp' && opts.value === undefined) value = 2;
  if (kind === 'portal_strike' && opts.value === undefined) value = 1;

  const pickup: PickupEntity = {
    id: allocEntityId(state),
    kind,
    x,
    y,
    prevX: x,
    prevY: y,
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
  sourceCause?: string;
  sourceSprite?: string;
}

export function spawnEnemyProjectile(
  state: SimState,
  opts: SpawnEnemyProjectileOptions,
): ProjectileEntity {
  const euphoriaMult = hasMutation(state.player, 'euphoria') ? 0.8 : 1.0;
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
    sourceCause: opts.sourceCause,
    sourceSprite: opts.sourceSprite,
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
  isToxic?: boolean;
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
    if (isIndestructiblePropKind(prop.kind)) {
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

  // Damage player (respects explicit selfDamage override; isRad no longer suppresses toxic/boss/generator hazards!)
  const canHurtPlayer = opts.selfDamage ?? (!opts.isBlood && !opts.isRogue);
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
        { isExplosion: true, isFire: opts.isFire ?? false, isToxic: opts.isToxic ?? false, isProjectile: true },
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
  if (prop.hp <= 0 || prop.sprite === 'sprVenusCarFixed' || isIndestructiblePropKind(prop.kind)) return;
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
    case 'rad_canister':
    case 'rad_maggot_canister': {
      // Breaking any rad canister resets the Horror-spawn skip streak!
      state.radCanisterSkipStreak = 0;
      const isMaggotCanister = prop.kind === 'rad_maggot_canister';
      const baseRads = prop.radsStored ?? 12;
      const rads = isMaggotCanister ? Math.round(baseRads * 1.5) : baseRads;
      const bigCount = Math.floor(rads / 10);
      const smallCount = rads % 10;
      for (let i = 0; i < bigCount; i++) {
        spawnPickup(state, 'big_rad', prop.x, prop.y, { value: 10 }, rng);
      }
      for (let i = 0; i < smallCount; i++) {
        spawnPickup(state, 'rad', prop.x, prop.y, { value: 1 }, rng);
      }
      if (isMaggotCanister) {
        const maggotDef = ENEMIES.rad_maggot;
        const maggotCount = rng.int(4, 6);
        for (let m = 0; m < maggotCount; m++) {
          const ang = (m / maggotCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const pos = findNearestFloor(state.map, prop.x + Math.cos(ang) * 10, prop.y + Math.sin(ang) * 10, 4);
          state.enemies.push({
            id: allocEntityId(state),
            defId: 'rad_maggot',
            x: pos.x,
            y: pos.y,
            prevX: pos.x,
            prevY: pos.y,
            vx: Math.cos(ang) * 1.6,
            vy: Math.sin(ang) * 1.6,
            radius: maggotDef?.radius ?? 4,
            hp: maggotDef?.maxHp ?? 2,
            maxHp: maggotDef?.maxHp ?? 2,
            facing: Math.cos(ang) >= 0 ? 1 : -1,
            aimAngle: ang,
            hurtFlashTicks: 0,
            snaredTicks: 0,
            aiState: 'chase',
            aiTimer: 8,
            aiPhase: 0,
            attackCooldown: 10,
            targetX: state.player.x,
            targetY: state.player.y,
            animFrame: 0,
            contactDamage: maggotDef?.contactDamage ?? 1,
            radDrop: maggotDef?.radDrop ?? 2,
          });
        }
      }
      // Crown of Hatred: 1 LETHAL dmg + 16 rads when opening/breaking chests & canisters!
      if (state.crown === 'hatred') {
        applyDamageToPlayer(state, 1, 'CROWN OF HATRED', 'sprCrown6Idle', rng, {
          ignoreIframes: true,
          bypassShield: true,
        });
        spawnPickup(state, 'big_rad', prop.x, prop.y, { value: 10 }, rng);
        for (let i = 0; i < 6; i++) {
          spawnPickup(state, 'rad', prop.x, prop.y, { value: 1 }, rng);
        }
      }
      // Frog Ultra A (DISTANCE): 25% chance for rad canisters to emit Toxic Gas Cloud!
      if (state.player.mutant === 'frog' && hasUltra(state.player, 'frog_a') && rng.chance(0.25)) {
        spawnFrogToxicGas(state, prop.x, prop.y, rng, { count: 4, emitSound: true });
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
    case 'gold_barrel': {
      spawnExplosion(state, prop.x, prop.y, 38, 28, 'neutral', rng, {
        cause: 'GOLD BARREL',
        killerSprite: 'sprGoldBarrel',
      });
      break;
    }
    case 'toxic_barrel': {
      spawnExplosion(state, prop.x, prop.y, 38, 16, 'neutral', rng, {
        isRad: true,
        isToxic: true,
        sound: 'sndToxicBarrelGas',
        cause: 'TOXIC BARREL',
        killerSprite: 'sprToxicBarrel',
      });
      break;
    }
    case 'venuz_tv': {
      for (let i = 0; i < state.props.length; i++) {
        const p = state.props[i]!;
        if (p.kind === 'yung_cuz') {
          p.sprite = 'sprCuzCry';
        }
      }
      emitEvent(state, { type: 'sfx', sound: 'sndHitMetal', x: prop.x, y: prop.y });
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
    case 'throne_generator': {
      state.generatorsRemaining = Math.max(0, state.generatorsRemaining - 1);
      spawnExplosion(state, prop.x, prop.y, 46, 32, 'player', rng, {
        isRad: true,
        sound: 'sndBigGeneratorBreak',
        cause: 'GENERATOR EXPLOSION',
        killerSprite: 'sprBigGenerator',
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
  fromGammaGuts?: boolean;
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

  // Boss defeat & unlock handling
  if (enemy.isBoss && enemy.bossId) {
    if (state.boss && state.boss.entityId === enemy.id) {
      state.boss.hp = 0;
      state.boss.defeated = true;
    }
    if (!state.stats.bossesDefeated.includes(enemy.bossId)) {
      state.stats.bossesDefeated.push(enemy.bossId);
    }
    if (enemy.bossId === 'mom' && player.mutant === 'rebel') {
      recordUnlock(state, 'bskin_rebel');
    } else if (enemy.bossId === 'hyper_crystal' && player.mutant === 'horror') {
      recordUnlock(state, 'bskin_horror');
    } else if (enemy.bossId === 'technomancer' && player.mutant === 'steroids') {
      recordUnlock(state, 'bskin_steroids');
    } else if (enemy.bossId === 'captain' && player.mutant === 'rogue') {
      recordUnlock(state, 'bskin_rogue');
    }
  }
  if (enemy.defId === 'enemy_horror') {
    recordUnlock(state, 'mutant_horror');
  }

  // Gamma Guts GammaBlast: enemies killed by Gamma Guts detonate in an 8-dmg AOE blast!
  if (opts.fromGammaGuts) {
    emitEvent(state, {
      type: 'particle',
      kind: 'toxic',
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: 0,
      color: '#6dff63',
      size: 26,
      life: 10,
      sprite: 'sprGammaBlast',
    });
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndMutGammaGuts',
      x: enemy.x,
      y: enemy.y,
      pitchJitter: 0.1,
    });
    const blastSnap = [...state.enemies];
    const blastRadSq = 48 * 48;
    for (let b = 0; b < blastSnap.length; b++) {
      const other = blastSnap[b]!;
      if (other.friendly || other.hp <= 0 || other.invulnerable || other.aiState === 'disguised') continue;
      const bdx = other.x - enemy.x;
      const bdy = other.y - enemy.y;
      if (bdx * bdx + bdy * bdy <= blastRadSq) {
        applyDamageToEnemy(state, other, 8, bdx * 0.15, bdy * 0.15, rng, { isExplosion: true });
      }
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

  // Bloodlust: 5.5% chance to heal +1 HP on kill (Wiki §4.2: 5-6%)
  if (hasMutation(player, 'bloodlust') && player.hp < player.maxHp && rng.chance(0.055)) {
    healPlayer(state, 1);
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndBloodlustProc',
      x: player.x,
      y: player.y,
    });
  }

  // Lucky Shot: ~11.76% (1/8.5) chance on kill to grant a mini ammo pack for a random ammo type
  if (hasMutation(player, 'lucky_shot') && rng.chance(1 / 8.5)) {
    const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
    const gained = addAmmoToPool(state, ammoType, MINI_AMMO_PACK_SIZE[ammoType]);
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

  // Horror Ultra A (Stalker): killed enemy bursts into `raddrop` count of sprHorrorBullet pellets!
  if (player.mutant === 'horror' && hasUltra(player, 'horror_a')) {
    const pelletCount = Math.min(40, Math.max(1, enemy.radDrop));
    const pelletSprite = player.skin === 'b' ? 'sprHorrorBBullet' : 'sprHorrorBullet';
    for (let k = 0; k < pelletCount; k++) {
      const ang = (k / pelletCount) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const spd = rng.range(7.5, 11.5);
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'rad_beam',
        team: 'player',
        x: enemy.x + Math.cos(ang) * 4,
        y: enemy.y + Math.sin(ang) * 4,
        prevX: enemy.x,
        prevY: enemy.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        angle: ang,
        radius: 4,
        damage: 2,
        lifeTicks: 24,
        maxLifeTicks: 24,
        pierce: 1,
        bounce: 0,
        explosionRadius: 0,
        sprite: pelletSprite,
        weaponId: 'horror_stalker',
        hitIds: [],
      });
    }
    emitEvent(state, { type: 'sfx', sound: 'sndRadPickup', x: enemy.x, y: enemy.y, pitchJitter: 0.12 });
  }

  // Rad drops (Melting gets +1 bonus rad per kill; Crown of Blood -1 rad per enemy min 0; Horror refunds absorbed beam rads)
  const absorbedRads = horrorAbsorbedRads.get(enemy) ?? 0;
  let baseRads = enemy.radDrop;
  if (player.mutant === 'melting') baseRads += 1;
  if (state.crown === 'blood') baseRads = Math.max(0, baseRads - 1);
  const totalRads = baseRads + absorbedRads;

  const bigRads = Math.floor(totalRads / 10);
  const smallRads = totalRads % 10;
  for (let i = 0; i < bigRads; i++) {
    spawnPickup(state, 'big_rad', enemy.x, enemy.y, { value: 10 }, rng);
  }
  for (let i = 0; i < smallRads; i++) {
    spawnPickup(state, 'rad', enemy.x, enemy.y, { value: 1 }, rng);
  }

  // Drop rates modified by Rabbit Paw (+40%), Crown of Risk, Crown of Life, Crown of Guns, Heavy Heart
  let dropMult = 1.0;
  if (hasMutation(player, 'rabbit_paw')) dropMult *= 1.4;
  if (state.crown === 'risk') {
    dropMult *= player.hp >= player.maxHp ? 1.6 : 0.55;
  }

  // Health drop (ONLY drops when wounded or Chicken headless, never at full HP or with Crown of Life!)
  const needsHp = player.hp < player.maxHp || player.headlessTicks > 0;
  const missingHpRatio = player.maxHp > 0 ? Math.max(0, 1 - player.hp / player.maxHp) : 0;
  if (needsHp && state.crown !== 'life' && rng.chance((0.06 + missingHpRatio * 0.16) * dropMult)) {
    spawnPickup(state, 'hp', enemy.x, enemy.y, { value: 2 }, rng);
  }

  // Ammo drop (scales inversely with active weapon fullness; holding 2 cursed weapons converts to cursed_ammo!)
  const dualCursed = Boolean(player.weapons[0]?.cursed && player.weapons[1]?.cursed);
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
      if (dualCursed) {
        spawnPickup(
          state,
          'cursed_ammo',
          enemy.x,
          enemy.y,
          {
            ammoType: chosenAmmo,
            value: Math.round(AMMO_PICKUP_AMOUNT[chosenAmmo] * 1.5),
            cursed: true,
          },
          rng,
        );
      } else {
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
  }

  // Weapon drop (Crown of Guns / Heavy Heart / Boss drop) — uses difficulty + authentic area weaponTierBase!
  let wepDropChance = enemy.isBoss ? 1.0 : 0.025;
  if (state.crown === 'guns') wepDropChance = Math.max(wepDropChance, 0.22);
  if (hasMutation(player, 'heavy_heart')) wepDropChance *= 2.5;
  if (rng.chance(wepDropChance)) {
    const areaDef = getAreaDef(state.areaCode);
    const robotBonus = player.mutant === 'robot' ? 1 : 0;
    const diffTier = Math.max(areaDef.weaponTierBase + state.loop * 4, Math.min(12, state.difficulty ?? 1));
    const tier = Math.min(12, Math.max(1, diffTier + robotBonus));
    let minTier = Math.max(0, tier - 4);
    if (player.mutant === 'robot' && hasUltra(player, 'robot_a')) {
      minTier = Math.min(tier, Math.max(minTier, 4));
    }
    const allowCursed = state.crown === 'curses' || state.biome === 'cursed_caves';
    const dropCursed = allowCursed && rng.chance(0.35);
    const maxRollTier = dropCursed ? Math.min(12, tier + 2) : tier;
    const pool = getWeaponsByTier(minTier, maxRollTier, false, { hardMode: Boolean(state.hardMode) });
    const chosen = pool.length > 0 ? rng.pick(pool) : WEAPONS.revolver!;
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
  isToxic?: boolean;
  isProjectile?: boolean;
  isContact?: boolean;
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
  // Frog Passive: 100% immune to all Toxic Gas damage!
  if (opts.isToxic && player.mutant === 'frog') return false;
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
      if (dmg <= 0) return false;
    }
  }

  const alreadyHeadless = player.mutant === 'chicken' && player.headlessTicks > 0;
  player.hp = alreadyHeadless ? 0 : player.hp - dmg;
  // Authentic NT i-frames: projectiles/explosions grant 5 ticks; contact/melee grant 11 ticks!
  player.iframes = opts.isProjectile ? PLAYER_PROJECTILE_IFRAMES : PLAYER_CONTACT_IFRAMES;
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

    // Secret Mutant Skeleton: Melting dying inside a Necromancer revive circle resurrects as Skeleton!
    if (player.mutant === 'melting') {
      const reviveCircle = state.props.find((prop) => {
        if (prop.kind !== 'necro_revive_area') return false;
        const reach = Math.max(32, prop.radius) + player.radius + 8;
        const rdx = player.x - prop.x;
        const rdy = player.y - prop.y;
        return rdx * rdx + rdy * rdy <= reach * reach;
      });
      if (reviveCircle) {
        player.mutant = 'skeleton';
        player.maxHp = MUTANTS.skeleton.maxHp;
        player.hp = 1;
        player.level = 1;
        player.rads = 0;
        player.radsToNextLevel = 60;
        player.mutations = [];
        player.ultra = null;
        player.strongSpiritReady = false;
        player.strongSpiritRecharging = false;
        player.ammoMax = { ...DEFAULT_AMMO_MAX };
        for (const ammoType of NON_MELEE_AMMO_TYPES) {
          player.ammo[ammoType] = Math.min(player.ammo[ammoType], player.ammoMax[ammoType]);
        }
        player.skeletonTransformed = true;
        player.iframes = 30;
        state.pendingLevelUps = 0;
        state.pendingMutations = [];
        state.pendingUltras = [];
        state.pendingPatiencePick = false;
        emitEvent(state, {
          type: 'sfx',
          sound: 'sndMutant14Turn',
          x: player.x,
          y: player.y,
        });
        emitEvent(state, {
          type: 'particle',
          kind: 'spark',
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          color: '#e8e4d8',
          size: 20,
          life: 16,
          sprite: 'sprMutant14Revive',
        });
        emitEvent(state, {
          type: 'pickup_text',
          x: player.x,
          y: player.y - 16,
          text: 'SKELETON!',
          color: '#f2f2e0',
        });
        recordUnlock(state, 'mutant_skeleton');
        return true;
      }
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

    // Frog passive: burst into 20 bouncing venom projectiles on death!
    if (player.mutant === 'frog') {
      for (let v = 0; v < 20; v++) {
        const ang = (v / 20) * Math.PI * 2 + rng.range(-0.1, 0.1);
        const spd = rng.range(8, 12);
        state.projectiles.push({
          id: allocEntityId(state),
          kind: 'bullet',
          team: 'player',
          x: player.x + Math.cos(ang) * 4,
          y: player.y + Math.sin(ang) * 4,
          prevX: player.x,
          prevY: player.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          angle: ang,
          radius: 3,
          damage: 2,
          lifeTicks: 50,
          maxLifeTicks: 50,
          pierce: 0,
          bounce: 2,
          explosionRadius: 0,
          sprite: 'sprBouncerBullet',
          weaponId: 'frog_venom',
          hitIds: [],
        });
      }
      spawnFrogToxicGas(state, player.x, player.y, rng, { count: 6, emitSound: true });
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
