import {
  TileType,
  type AmmoType,
  type AreaCode,
  type CrownId,
  type MutantId,
  type MutationId,
  type PlayerState,
  type PropEntity,
  type SimState,
  type UltraId,
  type WeaponSlotState,
  type WorldMap,
} from '@/contracts';
import {
  AMMO_PICKUP_AMOUNT,
  AREAS,
  BACK_MUSCLE_AMMO_MAX,
  CROWNS,
  DEFAULT_AMMO_MAX,
  MUTANTS,
  MUTATION_IDS,
  POST_LOOP_CROWN_IDS,
  PRE_LOOP_CROWN_IDS,
  ULTRAS,
  WEAPONS,
  WEAPON_SPECIFIC_MUTATIONS,
  getAreaDef,
  getNextAreaTransition,
  getWeaponDef,
  getWeaponsByTier,
} from '@/data';
import {
  MELTDOWN_RAD_CAP,
  SeededRng,
  ULTRA_RAD_CAP,
  allocEntityId,
  emitEvent,
  findNearestFloor,
  generateWorldMap,
  getPlayerRadCap,
  getTile,
  isWalkableTile,
  rolloverPlayerRads,
  tileToWorldCenter,
} from '@/sim/core';
import { getRunRuntime } from '@/sim/entities/runtime';
import {
  MINI_AMMO_PACK_SIZE,
  NON_MELEE_AMMO_TYPES,
  addAmmoToPool,
  applyDamageToPlayer,
  drainPendingUnlocks,
  getPendingUnlocks,
  getProtoChestWeaponId,
  hasMutation,
  hasUltra,
  healPlayer,
  recordUnlock,
  setProtoChestWeaponId,
  spawnFriendlyUnit,
  spawnPickup,
  type UnlockEventKind,
} from '@/sim/combat/helpers';

export const PORTAL_SPAWN_DELAY_TICKS = 30;
export const PORTAL_WARP_TICKS = 18;

// Tracks players who have already consumed Patience in the current run (once-per-run NT rule).
const patienceConsumedPlayers = new WeakSet<PlayerState>();

// Tracks Y.V. players who picked an Ultra directly outside a portal transition.
const yvCribPendingPlayers = new WeakSet<PlayerState>();

// Tracks Skeleton -> Melting REDEMPTION picks until Melting's Ultra is selected.
const redemptionPendingMeltingUltra = new WeakSet<PlayerState>();

// Tracks the 30-tick portal spawn delay after final kill or Horror Anomaly trigger.
interface PendingPortalDelay {
  mapRef: WorldMap;
  delayTicks: number;
  anchorX: number;
  anchorY: number;
  triggeredByAnomaly: boolean;
}
const pendingPortalDelays = new WeakMap<SimState, PendingPortalDelay>();

// Tracks total starting enemy HP per floor for Horror Anomaly high-loop 10% rule.
const levelStartTotalHpMap = new WeakMap<SimState, { mapRef: WorldMap; totalHp: number }>();

// Tracks destination loop saved when Y.V. warps to $$$ Crib mid-transition.
const cribReturnLoopMap = new WeakMap<SimState, number>();

export {
  MELTDOWN_RAD_CAP,
  ULTRA_RAD_CAP,
  drainPendingUnlocks,
  getPendingUnlocks,
  getPlayerRadCap,
  getProtoChestWeaponId,
  recordUnlock,
  setProtoChestWeaponId,
  type UnlockEventKind,
};

/** Pre-Loop (Loop 0) vs Post-Loop (Loop >= 1) Crown Vault pool split (Wiki §4.3). */
export function getVaultCrownPool(loop: number): readonly CrownId[] {
  return loop === 0 ? PRE_LOOP_CROWN_IDS : POST_LOOP_CROWN_IDS;
}

export function getVaultSelectableCrowns(loop: number): readonly CrownId[] {
  return ['none', ...getVaultCrownPool(loop)];
}

/** Selects a Crown inside the Crown Vault, enforcing Loop 0 vs Loop 1+ pool & stat hooks. */
export function selectVaultCrown(state: SimState, crown: CrownId): boolean {
  if (crown !== 'none' && !getVaultCrownPool(state.loop).includes(crown)) {
    return false;
  }
  const player = state.player;
  const runRt = getRunRuntime(state);
  const prevCrown = state.crown;

  if (prevCrown === 'death' && runRt.crownDeathPenalty > 0) {
    player.maxHp += runRt.crownDeathPenalty;
    runRt.crownDeathPenalty = 0;
  }

  state.crown = crown;

  if (crown === 'death') {
    const penalty = player.maxHp > 1 ? 1 : 0;
    player.maxHp -= penalty;
    player.hp = Math.min(player.hp, player.maxHp);
    runRt.crownDeathPenalty = penalty;
  } else if (crown === 'destiny' && !runRt.destinyMutationGranted) {
    runRt.destinyMutationGranted = true;
    state.pendingLevelUps += 1;
    emitEvent(state, {
      type: 'pickup_text',
      x: player.x,
      y: player.y - 24,
      text: 'DESTINY MUTATION!',
      color: '#ffd700',
    });
  }

  emitEvent(state, { type: 'sfx', sound: 'sndCrownAppear', x: player.x, y: player.y });
  emitEvent(state, {
    type: 'pickup_text',
    x: player.x,
    y: player.y - 16,
    text: CROWNS[crown].name,
    color: '#ffd700',
  });
  return true;
}

/** Cleanses cursed flags from all currently held weapons (Vault entry, Last Wish, etc.). */
export function cleanseCursedWeapons(state: SimState): number {
  let cleansed = 0;
  for (let s = 0; s < 2; s++) {
    const slot = state.player.weapons[s];
    if (slot && slot.cursed) {
      slot.cursed = false;
      cleansed += 1;
    }
  }
  if (cleansed > 0) {
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndSwapCursed',
      x: state.player.x,
      y: state.player.y,
    });
    emitEvent(state, {
      type: 'pickup_text',
      x: state.player.x,
      y: state.player.y - 14,
      text: 'CURSE CLEANSED!',
      color: '#a8e8ff',
    });
  }
  return cleansed;
}

/**
 * [E] interaction with the Crown Vault Proto Chest (`proto_chest`).
 * Swaps the player's held active weapon with `state.protoChestWeaponId`.
 * Authentic NT secret: retrieving a stored `frog_pistol` converts it into `golden_frog_pistol`!
 */
export function interactProtoChest(state: SimState, prop: PropEntity): boolean {
  const player = state.player;
  const activeSlot = player.weapons[player.activeSlot];
  if (activeSlot?.cursed) {
    emitEvent(state, { type: 'sfx', sound: 'sndSwapCursed', x: player.x, y: player.y });
    emitEvent(state, {
      type: 'pickup_text',
      x: player.x,
      y: player.y - 12,
      text: 'CURSED!',
      color: '#cc55ff',
    });
    return false;
  }

  const storedId = getProtoChestWeaponId(state);
  const heldId = activeSlot?.weaponId ?? null;

  if (storedId && WEAPONS[storedId]) {
    const retrievedId = storedId === 'frog_pistol' ? 'golden_frog_pistol' : storedId;
    const retrievedDef = getWeaponDef(retrievedId);
    setProtoChestWeaponId(state, heldId);
    player.weapons[player.activeSlot] = createWeaponSlot(retrievedDef.id, false);
    prop.sprite = heldId ? 'sprProtoChest' : 'sprProtoChestEmpty';
    emitEvent(state, { type: 'sfx', sound: 'sndWeaponPickup', x: prop.x, y: prop.y });
    emitEvent(state, {
      type: 'pickup_text',
      x: prop.x,
      y: prop.y - 14,
      text: retrievedId === 'golden_frog_pistol' ? 'GOLDEN FROG PISTOL!' : retrievedDef.name,
      color: retrievedDef.golden ? '#ffe066' : '#88eeff',
    });
    return true;
  }

  // Proto Chest is empty: store currently held weapon inside it!
  if (!heldId) return false;
  const storedDef = getWeaponDef(heldId);
  setProtoChestWeaponId(state, heldId);
  const otherSlot: 0 | 1 = player.activeSlot === 0 ? 1 : 0;
  const other = player.weapons[otherSlot];
  if (other) {
    player.weapons[0] = other;
    player.weapons[1] = null;
    player.activeSlot = 0;
  } else {
    player.weapons[0] = createWeaponSlot('revolver', false);
    player.weapons[1] = null;
    player.activeSlot = 0;
  }
  prop.sprite = 'sprProtoChest';
  emitEvent(state, { type: 'sfx', sound: 'sndWeaponChest', x: prop.x, y: prop.y });
  emitEvent(state, {
    type: 'pickup_text',
    x: prop.x,
    y: prop.y - 14,
    text: `STORED ${storedDef.name}`,
    color: '#88eeff',
  });
  return true;
}

/** Triggers clean exit portal warp out of Y.V.'s Crib (`$$$`) back to `cribReturnArea`. */
export function triggerCribExitPortal(state: SimState, originX?: number, originY?: number): boolean {
  if (state.areaCode !== '$$$' || state.portal.entered) return false;
  const target: AreaCode = state.cribReturnArea ?? '1-1';
  const nextLoop = cribReturnLoopMap.get(state) ?? state.loop;
  state.portal.active = true;
  state.portal.x = originX ?? state.player.x;
  state.portal.y = originY ?? state.player.y;
  state.portal.targetArea = target;
  state.portal.nextLoop = nextLoop;
  state.portal.entered = true;
  state.portal.enterTicks = PORTAL_WARP_TICKS;
  state.portal.carved = true;
  state.phase = 'portal_transition';
  state.portalTransitionTicks = PORTAL_WARP_TICKS;
  emitEvent(state, { type: 'sfx', sound: 'sndPortalClose', x: state.portal.x, y: state.portal.y });
  return true;
}

/** Immediate helper for direct callers/tests to exit Y.V.'s Crib back to `cribReturnArea`. */
export function exitCribToReturnArea(state: SimState, populateFn?: PopulateAreaFn): boolean {
  if (state.areaCode !== '$$$') return false;
  const target: AreaCode = state.cribReturnArea ?? '1-1';
  const nextLoop = cribReturnLoopMap.get(state) ?? state.loop;
  state.cribReturnArea = null;
  cribReturnLoopMap.delete(state);
  loadAreaIntoState(state, target, nextLoop, populateFn);
  return true;
}

// Authentic Nuclear Throne per-mutation pick SFX (verified against Steam manifest).
const MUTATION_SOUNDS: Record<MutationId, string> = {
  rhino_skin: 'sndMutRhinoSkin',
  extra_feet: 'sndMutExtraFeet',
  plutonium_hunger: 'sndMutPlutoniumHunger',
  rabbit_paw: 'sndMutRabbitPaw',
  throne_butt: 'sndMutThroneButt',
  lucky_shot: 'sndMutLuckyShot',
  bloodlust: 'sndMutBloodLust',
  gamma_guts: 'sndMutGammaGuts',
  second_stomach: 'sndMutSecondStomach',
  back_muscle: 'sndMutBackMuscle',
  scarier_face: 'sndMutScarierFace',
  euphoria: 'sndMutEuphoria',
  long_arms: 'sndMutLongArms',
  boiling_veins: 'sndMutBoilingVeins',
  shotgun_shoulders: 'sndMutShotgunFingers',
  recycle_gland: 'sndMutRecycleGland',
  laser_brain: 'sndMutLaserBrain',
  last_wish: 'sndMutLastWish',
  eagle_eyes: 'sndMutEagleEyes',
  impact_wrists: 'sndMutImpactWrists',
  bolt_marrow: 'sndMutBoltMarrow',
  stress: 'sndMutStress',
  trigger_fingers: 'sndMutTriggerFingers',
  sharp_teeth: 'sndMutSharpTeeth',
  patience: 'sndMutPatience',
  hammerhead: 'sndMutHammerhead',
  strong_spirit: 'sndMutStrongSpirit',
  open_mind: 'sndMutOpenMind',
  heavy_heart: 'sndMutHeavyHeart',
};

// Authentic Nuclear Throne per-Ultra pick SFX (verified against Steam manifest looseSounds).
const ULTRA_SOUNDS: Record<UltraId, string> = {
  fish_a: 'snd/FishUltraA',
  fish_b: 'snd/FishUltraB',
  crystal_a: 'snd/CrystalUltraA',
  crystal_b: 'snd/CrystalUltraB',
  eyes_a: 'snd/EyesUltraA',
  eyes_b: 'snd/EyesUltraB',
  melting_a: 'snd/MeltingUltraA',
  melting_b: 'snd/MeltingUltraB',
  plant_a: 'snd/PlantUltraA',
  plant_b: 'snd/PlantUltraB',
  yv_a: 'snd/YVUltraA',
  yv_b: 'snd/YVUltraB',
  steroids_a: 'snd/SteroidsUltraA',
  steroids_b: 'snd/SteroidsUltraB',
  robot_a: 'snd/RobotUltraA',
  robot_b: 'snd/RobotUltraB',
  chicken_a: 'snd/ChickenUltraA',
  chicken_b: 'snd/ChickenUltraB',
  rebel_a: 'snd/RebelUltraA',
  rebel_b: 'snd/RebelUltraB',
  horror_a: 'snd/HorrorUltraA',
  horror_b: 'snd/HorrorUltraB',
  horror_c: 'sndHorrorUltraC', // Wave 2B
  rogue_a: 'snd/RogueUltraA',
  rogue_b: 'snd/RogueUltraB',
  skeleton_a: 'snd/SkeletonUltraA', // Wave 2B
  skeleton_b: 'snd/SkeletonUltraB', // Wave 2B
  frog_a: 'snd/FrogUltraA', // Wave 2B
  frog_b: 'snd/FrogUltraB', // Wave 2B
};

function spawnYvCribChests(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const loveOnly = state.crown === 'love';
  const cursedZone = state.crown === 'curses' || state.biome === 'cursed_caves';
  const offsets: ReadonlyArray<[number, number]> = [
    [-22, -10],
    [22, -10],
  ];
  for (let i = 0; i < offsets.length; i++) {
    const [ox, oy] = offsets[i]!;
    const spot = findNearestFloor(state.map, player.x + ox, player.y + oy, 8);
    if (loveOnly) {
      const lifeChest = state.crown === 'life' && player.hp < player.maxHp;
      state.props.push({
        id: allocEntityId(state),
        kind: 'ammo_chest',
        x: spot.x,
        y: spot.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: lifeChest ? 'sprHealthChest' : 'sprAmmoChest',
        openSprite: lifeChest ? 'sprHealthChestOpen' : 'sprAmmoChestOpen',
      });
    } else {
      state.props.push({
        id: allocEntityId(state),
        kind: 'big_weapon_chest',
        x: spot.x,
        y: spot.y,
        radius: 10,
        hp: 14,
        maxHp: 14,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprWeaponChestBig',
        openSprite: 'sprWeaponChestBigOpen',
        cursed: cursedZone || undefined,
      });
    }
  }
  emitEvent(state, {
    type: 'pickup_text',
    x: player.x,
    y: player.y - 16,
    text: "Y.V.'S CRIB! $$$",
    color: '#ffd700',
  });
}

export type PopulateAreaFn = (state: SimState, rng: SeededRng) => void;

export interface CreateInitialSimOptions {
  mutant: MutantId;
  seed?: number;
  crown?: CrownId;
  skin?: 'a' | 'b';
  goldenWeapon?: string | null;
  hardMode?: boolean;
  protoChestWeaponId?: string | null;
  populateFn?: PopulateAreaFn;
}

export function radsRequiredForLevel(level: number, ultra?: UltraId | null): number {
  if (level >= 10) return ultra === 'horror_c' ? MELTDOWN_RAD_CAP : ULTRA_RAD_CAP;
  return Math.max(1, level) * 60;
}

export function createWeaponSlot(weaponId: string, cursedOverride?: boolean): WeaponSlotState {
  const def = getWeaponDef(weaponId);
  return {
    weaponId: def.id,
    reloadTicks: 0,
    maxReloadTicks: def.reloadTicks,
    burstRemaining: 0,
    burstTimer: 0,
    kickOffset: 0,
    cursed: cursedOverride ?? def.cursed ?? false,
    meleeSwingSide: 1,
  };
}

function countHostileEnemies(state: SimState): number {
  let count = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') count += 1;
  }
  return count;
}

function findRiskRewardChestSpot(
  state: SimState,
  avoidX: number,
  avoidY: number,
  minDist: number,
  preferAlcove: boolean,
  rng: SeededRng,
): { x: number; y: number } {
  const map = state.map;
  const ts = map.tileSize || 16;
  const minDistSq = minDist * minDist;
  const minChestSepSq = 68 * 68;

  let bestFallback: { x: number; y: number } | null = null;
  let bestScore = -1e9;

  for (let attempt = 0; attempt < 110; attempt++) {
    const tx = rng.int(3, map.width - 4);
    const ty = rng.int(3, map.height - 4);
    if (!isWalkableTile(getTile(map, tx, ty))) continue;
    const pos = tileToWorldCenter(tx, ty, ts);
    const dx = pos.x - avoidX;
    const dy = pos.y - avoidY;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) continue;

    // Keep chests spread into distinct risk-reward pockets across the level
    let tooCloseToProp = false;
    for (let i = 0; i < state.props.length; i++) {
      const p = state.props[i]!;
      const pdx = pos.x - p.x;
      const pdy = pos.y - p.y;
      if (pdx * pdx + pdy * pdy < minChestSepSq) {
        tooCloseToProp = true;
        break;
      }
    }
    if (tooCloseToProp && attempt < 80) continue;

    // Count cardinal solid wall neighbors: 1-2 walls = crisp alcove/corner nook (not middle of narrow choke)
    let wallNeighbors = 0;
    if (!isWalkableTile(getTile(map, tx - 1, ty))) wallNeighbors += 1;
    if (!isWalkableTile(getTile(map, tx + 1, ty))) wallNeighbors += 1;
    if (!isWalkableTile(getTile(map, tx, ty - 1))) wallNeighbors += 1;
    if (!isWalkableTile(getTile(map, tx, ty + 1))) wallNeighbors += 1;

    // Ideal alcove has 2 or 3 wall neighbors (tucked pocket) or 1 wall (edge of chamber)
    const alcoveBonus = preferAlcove
      ? wallNeighbors === 2
        ? 45
        : wallNeighbors === 3
          ? 38
          : wallNeighbors === 1
            ? 20
            : 0
      : wallNeighbors <= 2
        ? 15
        : 0;
    const distScore = Math.min(260, Math.sqrt(dSq)) * 0.18;
    const score = alcoveBonus + distScore + (tooCloseToProp ? -60 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestFallback = pos;
    }
    if (!tooCloseToProp && (!preferAlcove || wallNeighbors >= 2) && dSq >= minDistSq * 1.15) {
      return pos;
    }
  }

  if (bestFallback) return bestFallback;
  return findNearestFloor(map, avoidX + 64, avoidY, 16);
}

interface RollWeaponOptions {
  forceCursed?: boolean;
  minTierOverride?: number;
  difficultyBonus?: number;
  allowGunGun?: boolean;
}

function rollTierWeapon(
  state: SimState,
  rng: SeededRng,
  bonusTier = 0,
  opts: RollWeaponOptions = {},
): { weaponId: string; cursed: boolean } {
  const areaDef = getAreaDef(state.areaCode);
  const player = state.player;
  const robotBonus = player.mutant === 'robot' ? 1 : 0;

  // Gun Gun rare drop: Crown of Guns + L1 1-2+ (or L2+)
  const gunGunEligible =
    opts.allowGunGun !== false &&
    state.crown === 'guns' &&
    (state.loop >= 2 || (state.loop === 1 && state.areaCode !== '1-1'));
  if (gunGunEligible && rng.chance(0.06)) {
    return { weaponId: 'gun_gun', cursed: Boolean(opts.forceCursed) };
  }

  const diffScore = (state.difficulty ?? 1) + (opts.difficultyBonus ?? 0);
  const baseTier = Math.max(areaDef.weaponTierBase + state.loop * 4, Math.min(12, diffScore));
  const maxTier = Math.min(12, Math.max(1, baseTier + robotBonus + bonusTier));
  let minTier = opts.minTierOverride !== undefined ? Math.min(maxTier, opts.minTierOverride) : Math.max(0, maxTier - 4);
  if (player.mutant === 'robot' && hasUltra(player, 'robot_a')) {
    minTier = Math.min(maxTier, Math.max(minTier, 4));
  }

  const allowCursed = state.crown === 'curses' || state.biome === 'cursed_caves';
  const makeCursed =
    opts.forceCursed === true ||
    (opts.forceCursed !== false && allowCursed && rng.chance(state.crown === 'curses' ? 0.55 : 0.45));

  if (makeCursed) {
    // Authentic NT dynamic curse: bump max tier by +2 (or +5 on cursed_caves large chest) and tag any rolled weapon cursed!
    const cursedMax = Math.min(12, maxTier + 2);
    const cursedMin = Math.min(cursedMax, Math.max(minTier, maxTier - 1));
    const elevatedPool = getWeaponsByTier(cursedMin, cursedMax, false, { hardMode: Boolean(state.hardMode) });
    if (elevatedPool.length > 0) {
      const chosen = rng.pick(elevatedPool);
      return { weaponId: chosen.id, cursed: true };
    }
  }

  const pool = getWeaponsByTier(minTier, maxTier, false, { hardMode: Boolean(state.hardMode) });
  if (pool.length === 0) return { weaponId: 'revolver', cursed: Boolean(opts.forceCursed) };

  const chosen = rng.pick(pool);
  return { weaponId: chosen.id, cursed: Boolean(opts.forceCursed) };
}

export function pickTierWeaponId(state: SimState, rng: SeededRng, bonusTier = 0): string {
  return rollTierWeapon(state, rng, bonusTier).weaponId;
}

/** Gun Gun rolls a random weapon at `difficulty + 10` (clamped to Tier 12, min Tier 4). */
export function rollGunGunWeapon(state: SimState, rng: SeededRng): { weaponId: string; cursed: boolean } {
  return rollTierWeapon(state, rng, 0, {
    difficultyBonus: 10,
    minTierOverride: Math.min(10, Math.max(4, (state.difficulty ?? 1) + 4)),
    allowGunGun: false,
    forceCursed: false,
  });
}

function rollIsCursedWeaponChest(state: SimState, rng: SeededRng): boolean {
  if (state.biome === 'cursed_caves') return true;
  if (state.crown === 'curses') return rng.chance(2 / 3);
  if (state.crown !== 'none') return rng.chance(1 / 7);
  return false;
}

function spawnRadOrLifeOrLoveCanister(
  state: SimState,
  x: number,
  y: number,
  lifeHealthChests: boolean,
  rng: SeededRng,
): void {
  const player = state.player;
  if (state.crown === 'love') {
    // Crown of Love converts rad canisters into ammo chests too (Wiki §4.3)!
    state.props.push({
      id: allocEntityId(state),
      kind: 'ammo_chest',
      x,
      y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: lifeHealthChests ? 'sprHealthChest' : 'sprAmmoChest',
      openSprite: lifeHealthChests ? 'sprHealthChestOpen' : 'sprAmmoChestOpen',
    });
    return;
  }
  if (state.crown === 'life' && rng.chance(2 / 3)) {
    // Crown of Life: 2/3 of rad canisters become Big Health Chests!
    state.props.push({
      id: allocEntityId(state),
      kind: 'health_chest',
      x,
      y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprHealthChest',
      openSprite: 'sprHealthChestOpen',
    });
    return;
  }
  if (player.mutant === 'rogue') {
    state.props.push({
      id: allocEntityId(state),
      kind: 'idpd_canister',
      x,
      y,
      radius: 8,
      hp: 6,
      maxHp: 6,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprRogueAmmoChest',
      openSprite: 'sprRogueAmmoChestOpen',
    });
    return;
  }
  state.props.push({
    id: allocEntityId(state),
    kind: 'rad_canister',
    x,
    y,
    radius: 8,
    hp: 6,
    maxHp: 6,
    solid: false,
    opened: false,
    hurtFlashTicks: 0,
    sprite: 'sprRadChest',
    radsStored: 14 + state.loop * 8,
  });
}

export function spawnLevelChests(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const isBossArena = state.areaCode === '0-1';

  const lifeHealthChests = state.crown === 'life' && player.hp < player.maxHp;

  if (!isBossArena && state.areaCode !== '7-3' && state.areaCode !== 'vault' && state.areaCode !== '$$$') {
    const pos1 = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 96, true, rng);
    const skipStreak = Math.max(state.weaponChestSkipStreak ?? 0, state.chestSkipStreak);
    const spawnBigWep = skipStreak >= 1 && rng.chance(Math.min(1, skipStreak * 0.25));
    const isCursedChest = rollIsCursedWeaponChest(state, rng);

    if (state.crown === 'love') {
      state.props.push({
        id: allocEntityId(state),
        kind: 'ammo_chest',
        x: pos1.x,
        y: pos1.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: lifeHealthChests ? 'sprHealthChest' : 'sprAmmoChest',
        openSprite: lifeHealthChests ? 'sprHealthChestOpen' : 'sprAmmoChestOpen',
      });
    } else if (spawnBigWep) {
      // Big Weapon Chest spawned -> reset weapon chest skip streak (Wiki §6.2)!
      state.weaponChestSkipStreak = 0;
      state.chestSkipStreak = 0;
      state.props.push({
        id: allocEntityId(state),
        kind: 'big_weapon_chest',
        x: pos1.x,
        y: pos1.y,
        radius: 10,
        hp: 14,
        maxHp: 14,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprWeaponChestBig',
        openSprite: 'sprWeaponChestBigOpen',
        cursed: isCursedChest || undefined,
      });
    } else {
      state.props.push({
        id: allocEntityId(state),
        kind: 'weapon_chest',
        x: pos1.x,
        y: pos1.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: isCursedChest ? 'sprCursedChest' : 'sprWeaponChest',
        openSprite: isCursedChest ? 'sprCursedChestOpen' : 'sprWeaponChestOpen',
        cursed: isCursedChest || undefined,
      });
    }

    // 2. Ammo chest in a separate mid/outer pocket (renders as sprHealthChest under Crown of Life when wounded!)
    const pos2 = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 84, true, rng);
    state.props.push({
      id: allocEntityId(state),
      kind: 'ammo_chest',
      x: pos2.x,
      y: pos2.y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: lifeHealthChests ? 'sprHealthChest' : 'sprAmmoChest',
      openSprite: lifeHealthChests ? 'sprHealthChestOpen' : 'sprAmmoChestOpen',
    });

    // 3. Rad canister (or IDPD canister for Rogue, or Health Chest under Crown of Life, or Ammo under Crown of Love)
    const pos3 = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 108, true, rng);
    spawnRadOrLifeOrLoveCanister(state, pos3.x, pos3.y, lifeHealthChests, rng);

    // 4. Open Mind extra chest (equal 1/3 chance: weapon chest, ammo chest, or rad/IDPD canister)
    if (hasMutation(player, 'open_mind')) {
      const posExtra = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 88, true, rng);
      const roll = rng.int(0, 2);
      if (roll === 2) {
        spawnRadOrLifeOrLoveCanister(state, posExtra.x, posExtra.y, lifeHealthChests, rng);
      } else {
        const extraWeapon = roll === 0 && state.crown !== 'love';
        const extraCursed = extraWeapon && rollIsCursedWeaponChest(state, rng);
        state.props.push({
          id: allocEntityId(state),
          kind: extraWeapon ? 'weapon_chest' : 'ammo_chest',
          x: posExtra.x,
          y: posExtra.y,
          radius: 8,
          hp: 10,
          maxHp: 10,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: extraWeapon
            ? extraCursed
              ? 'sprCursedChest'
              : 'sprWeaponChest'
            : lifeHealthChests
              ? 'sprHealthChest'
              : 'sprAmmoChest',
          openSprite: extraWeapon
            ? extraCursed
              ? 'sprCursedChestOpen'
              : 'sprWeaponChestOpen'
            : lifeHealthChests
              ? 'sprHealthChestOpen'
              : 'sprAmmoChestOpen',
          cursed: extraCursed ? true : undefined,
        });
      }
    }

    // 5. Y.V. Ultra B (Back 2 Bizniz): extra weapon chests (or ammo chests with Crown of Love)
    if (player.mutant === 'yv' && hasUltra(player, 'yv_b')) {
      const cribAmmoOnly = state.crown === 'love';
      for (let c = 0; c < 2; c++) {
        const posCrib = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 56, false, rng);
        const bonusCursed = !cribAmmoOnly && rollIsCursedWeaponChest(state, rng);
        state.props.push({
          id: allocEntityId(state),
          kind: cribAmmoOnly ? 'ammo_chest' : 'weapon_chest',
          x: posCrib.x,
          y: posCrib.y,
          radius: 8,
          hp: 10,
          maxHp: 10,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: cribAmmoOnly
            ? lifeHealthChests
              ? 'sprHealthChest'
              : 'sprAmmoChest'
            : bonusCursed
              ? 'sprCursedChest'
              : 'sprWeaponChest',
          openSprite: cribAmmoOnly
            ? lifeHealthChests
              ? 'sprHealthChestOpen'
              : 'sprAmmoChestOpen'
            : bonusCursed
              ? 'sprCursedChestOpen'
              : 'sprWeaponChestOpen',
          cursed: bonusCursed ? true : undefined,
        });
      }
    }
  }

  // 6. Direct-call Y.V. Ultra fallback chests (when grantUltraById was called outside portal transition)
  if (yvCribPendingPlayers.has(player)) {
    yvCribPendingPlayers.delete(player);
    spawnYvCribChests(state, rng);
  }
}

export function openChest(state: SimState, prop: PropEntity, rng: SeededRng): boolean {
  if (prop.opened) return false;
  prop.opened = true;
  if (prop.openSprite) {
    prop.sprite = prop.openSprite;
  }

  const player = state.player;

  // Crown of Hatred: opening any chest deals 1 LETHAL dmg (bypassing shield/iframes) and yields 16 rads!
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

  if (prop.kind === 'weapon_chest') {
    state.chestSkipStreak = 0;
    state.weaponChestSkipStreak = 0;
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 2 : 1;
    let anyCursed = Boolean(prop.cursed);
    for (let i = 0; i < count; i++) {
      const rolled = rollTierWeapon(state, rng, prop.cursed ? 2 : 0, {
        forceCursed: prop.cursed ? true : undefined,
      });
      if (rolled.cursed) anyCursed = true;
      spawnPickup(
        state,
        'weapon',
        prop.x,
        prop.y,
        { weaponId: rolled.weaponId, cursed: rolled.cursed, value: 1 },
        rng,
      );
    }
    emitEvent(state, {
      type: 'sfx',
      sound: anyCursed ? 'sndCursedChest' : 'sndWeaponChest',
      x: prop.x,
      y: prop.y,
    });
    return true;
  }

  if (prop.kind === 'big_weapon_chest') {
    state.chestSkipStreak = 0;
    state.weaponChestSkipStreak = 0;
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 6 : 3;
    const isLargeCursed = Boolean(prop.cursed) && state.biome === 'cursed_caves';
    let anyCursed = Boolean(prop.cursed);
    for (let i = 0; i < count; i++) {
      const rolled = rollTierWeapon(state, rng, isLargeCursed ? 5 : 1, {
        forceCursed: prop.cursed ? true : undefined,
      });
      if (rolled.cursed) anyCursed = true;
      spawnPickup(
        state,
        'weapon',
        prop.x,
        prop.y,
        { weaponId: rolled.weaponId, cursed: rolled.cursed, value: 1 },
        rng,
      );
    }
    emitEvent(state, {
      type: 'sfx',
      sound: anyCursed ? 'sndCursedChest' : 'sndBigWeaponChest',
      x: prop.x,
      y: prop.y,
    });
    return true;
  }

  if (prop.kind === 'giant_weapon_chest') {
    prop.sprite = 'sprGiantWepChestOpen';
    prop.openSprite = 'sprGiantWepChestOpen';
    const count = rng.int(12, 13);
    for (let i = 0; i < count; i++) {
      const rolled = rollTierWeapon(state, rng, 0, {
        difficultyBonus: 3,
        minTierOverride: 4,
        forceCursed: prop.cursed ? true : false,
      });
      spawnPickup(
        state,
        'weapon',
        prop.x,
        prop.y,
        { weaponId: rolled.weaponId, cursed: rolled.cursed, value: 1 },
        rng,
      );
    }
    emitEvent(state, { type: 'sfx', sound: 'sndBigWeaponChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'giant_ammo_chest') {
    prop.sprite = 'sprGiantAmmoChestOpen';
    prop.openSprite = 'sprGiantAmmoChestOpen';
    for (let i = 0; i < 16; i++) {
      const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
      spawnPickup(
        state,
        'ammo',
        prop.x,
        prop.y,
        { ammoType, value: MINI_AMMO_PACK_SIZE[ammoType] },
        rng,
      );
    }
    emitEvent(state, { type: 'sfx', sound: 'sndAmmoChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'health_chest') {
    prop.sprite = 'sprHealthChestOpen';
    prop.openSprite = 'sprHealthChestOpen';
    healPlayer(state, hasMutation(player, 'second_stomach') ? 8 : 4);
    emitEvent(state, { type: 'sfx', sound: 'sndHealthChestBig', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'pizza_chest') {
    prop.sprite = 'sprPizzaChestOpen';
    prop.openSprite = 'sprPizzaChestOpen';
    if ((player.hp < player.maxHp || player.headlessTicks > 0) && state.crown !== 'life') {
      spawnPickup(state, 'hp', prop.x, prop.y, { value: 2 }, rng);
    }
    for (let i = 0; i < 2; i++) {
      const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
      spawnPickup(state, 'ammo', prop.x, prop.y, { ammoType, value: MINI_AMMO_PACK_SIZE[ammoType] }, rng);
    }
    emitEvent(state, { type: 'sfx', sound: 'sndAmmoChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'ammo_chest') {
    // Bug #11 Fix: always sync sprite & openSprite with actual reward so visual NEVER mismatches payout!
    if (state.crown === 'life' && player.hp < player.maxHp) {
      prop.sprite = 'sprHealthChest';
      prop.openSprite = 'sprHealthChestOpen';
      healPlayer(state, hasMutation(player, 'second_stomach') ? 8 : 4);
      emitEvent(state, { type: 'sfx', sound: 'sndHealthChestBig', x: prop.x, y: prop.y });
      return true;
    }
    prop.sprite = 'sprAmmoChestOpen';
    prop.openSprite = 'sprAmmoChestOpen';
    if (player.mutant === 'steroids' && hasUltra(player, 'steroids_b')) {
      // Get Loaded: refill ALL 5 ammo pools simultaneously!
      for (const ammoType of NON_MELEE_AMMO_TYPES) {
        addAmmoToPool(state, ammoType, AMMO_PICKUP_AMOUNT[ammoType]);
      }
      emitEvent(state, {
        type: 'pickup_text',
        x: prop.x,
        y: prop.y - 10,
        text: 'ALL AMMO +',
        color: '#ffe066',
      });
    } else {
      const activeWep = getWeaponDef(player.weapons[player.activeSlot]?.weaponId ?? 'revolver');
      const secWep = player.weapons[1 - player.activeSlot]
        ? getWeaponDef(player.weapons[1 - player.activeSlot]!.weaponId)
        : null;
      const t1: AmmoType =
        activeWep.ammoType !== 'melee' ? activeWep.ammoType : rng.pick(NON_MELEE_AMMO_TYPES);
      const t2: AmmoType =
        secWep && secWep.ammoType !== 'melee' ? secWep.ammoType : rng.pick(NON_MELEE_AMMO_TYPES);
      spawnPickup(state, 'ammo', prop.x, prop.y, { ammoType: t1, value: AMMO_PICKUP_AMOUNT[t1] }, rng);
      spawnPickup(state, 'ammo', prop.x, prop.y, { ammoType: t2, value: AMMO_PICKUP_AMOUNT[t2] }, rng);
    }
    emitEvent(state, { type: 'sfx', sound: 'sndAmmoChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'idpd_canister') {
    const gain = hasUltra(player, 'rogue_a') ? 2 : 1;
    const cap = hasUltra(player, 'rogue_a') ? 6 : 3;
    player.portalStrikes = Math.min(cap, player.portalStrikes + gain);
    emitEvent(state, { type: 'sfx', sound: 'sndRogueCanister', x: prop.x, y: prop.y });
    emitEvent(state, {
      type: 'pickup_text',
      x: prop.x,
      y: prop.y - 10,
      text: `+${gain} STRIKE`,
      color: '#66b2ff',
    });
    return true;
  }

  return false;
}

export interface GiveWeaponOptions {
  cursed?: boolean;
  grantBonus?: boolean;
}

export function givePlayerWeapon(
  state: SimState,
  weaponId: string,
  slot?: 0 | 1,
  dropPrevious: boolean = true,
  opts: GiveWeaponOptions = {},
): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;

  const incomingCursed = opts.cursed ?? Boolean(def.cursed);
  const grantBonus = opts.grantBonus ?? true;
  const player = state.player;
  let targetSlot: 0 | 1;

  if (slot !== undefined) {
    targetSlot = slot;
  } else if (player.weapons[1] === null) {
    targetSlot = 1;
  } else {
    targetSlot = player.activeSlot;
    // Cursed weapons cannot be dropped for uncursed ones (but CAN be swapped for another cursed weapon!)
    if (!incomingCursed) {
      const cur = player.weapons[targetSlot];
      const alt = player.weapons[targetSlot === 0 ? 1 : 0];
      if (cur?.cursed && alt && !alt.cursed) {
        targetSlot = targetSlot === 0 ? 1 : 0;
      } else if (cur?.cursed && alt?.cursed) {
        emitEvent(state, { type: 'sfx', sound: 'sndSwapCursed', x: player.x, y: player.y });
        emitEvent(state, {
          type: 'pickup_text',
          x: player.x,
          y: player.y - 12,
          text: 'CURSED!',
          color: '#cc55ff',
        });
        return false;
      }
    }
  }

  const prev = player.weapons[targetSlot];
  if (prev && dropPrevious) {
    // Track Chicken dropping Chicken Sword on L0 1-1 for L1 1-1 Black Sword unlock!
    if (
      player.mutant === 'chicken' &&
      state.loop === 0 &&
      state.areaCode === '1-1' &&
      prev.weaponId === 'chicken_sword'
    ) {
      state.chickenDroppedSwordOn1_1 = true;
    }
    // Dropped player weapons have value: 0 so picking them back up cannot farm infinite ammo or HP!
    spawnPickup(state, 'weapon', player.x, player.y, {
      weaponId: prev.weaponId,
      cursed: prev.cursed,
      value: 0,
      vx: 0,
      vy: 0,
    });
  }

  player.weapons[targetSlot] = createWeaponSlot(def.id, incomingCursed);
  if (slot === undefined && targetSlot === 1 && prev === null) {
    player.activeSlot = 1;
  }

  // Only fresh unlooted weapons grant starter ammo (or +1 HP with Crown of Protection; +2 w/ Second Stomach)
  if (grantBonus) {
    if (state.crown === 'protection') {
      healPlayer(state, hasMutation(player, 'second_stomach') ? 2 : 1);
    } else if (def.ammoType !== 'melee') {
      addAmmoToPool(state, def.ammoType, Math.max(2, Math.round(AMMO_PICKUP_AMOUNT[def.ammoType] * 0.5)));
    }
  }

  emitEvent(state, {
    type: 'sfx',
    sound: incomingCursed ? 'sndCursedPickup' : 'sndWeaponPickup',
    x: player.x,
    y: player.y,
  });
  emitEvent(state, {
    type: 'pickup_text',
    x: player.x,
    y: player.y - 12,
    text: incomingCursed && !def.cursed ? `CURSED ${def.name}` : def.name,
    color: def.golden ? '#ffe066' : incomingCursed ? '#d966ff' : '#ffffff',
  });
  return true;
}

export function addRads(state: SimState, amount: number, rng?: SeededRng): number {
  if (amount <= 0) return 0;
  const player = state.player;
  player.rads += amount;
  state.stats.radsCollected += amount;

  let levelsGained = 0;
  while (player.level < 10 && player.rads >= player.radsToNextLevel) {
    player.rads -= player.radsToNextLevel;
    player.level += 1;
    player.radsToNextLevel = radsRequiredForLevel(player.level, player.ultra);
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

  if (rng) {
    state.rngState = rng.getState();
  }
  return levelsGained;
}

export function drawMutationChoices(state: SimState, rng: SeededRng): MutationId[] {
  const player = state.player;
  const owned = new Set<MutationId>(player.mutations);
  const weaponMutCount = WEAPON_SPECIFIC_MUTATIONS.filter((id) => owned.has(id)).length;
  const patienceUsed = patienceConsumedPlayers.has(player);

  const eligible = MUTATION_IDS.filter((id) => {
    if (owned.has(id)) return false;
    if (id === 'patience' && patienceUsed) return false;
    if (id === 'heavy_heart' && weaponMutCount < 3) return false;
    return true;
  });

  const shuffled = rng.shuffle([...eligible]);
  // Crown of Destiny narrows picks to 1 card (2 for Horror via +1 extra choice passive)
  const baseCards = state.crown === 'destiny' ? 1 : 4;
  const cardCount = baseCards + (player.mutant === 'horror' ? 1 : 0);
  const drawn = shuffled.slice(0, Math.min(cardCount, shuffled.length));
  state.pendingMutations = drawn;
  state.rngState = rng.getState();
  return drawn;
}

export function drawUltraChoices(state: SimState): UltraId[] {
  // Wave 2B: supports 2-choice mutants and 3-choice Horror (horror_c Meltdown)
  const ultras = MUTANTS[state.player.mutant].ultras;
  state.pendingUltras = ultras.map((u) => u.id);
  return state.pendingUltras;
}

export function openPendingLevelUp(state: SimState, rng: SeededRng): boolean {
  if (state.pendingLevelUps <= 0) return false;
  const player = state.player;
  const needsUltra = !player.ultra || redemptionPendingMeltingUltra.has(player);

  // Trigger Ultra selection at level 10 when Ultra hasn't been picked yet (or after Skeleton REDEMPTION's 9 picks!)
  if (player.level >= 10 && needsUltra && state.pendingLevelUps === 1) {
    drawUltraChoices(state);
    state.pendingMutations = [];
    state.phase = 'ultra_select';
    return true;
  }

  const cards = drawMutationChoices(state, rng);
  if (cards.length > 0) {
    state.pendingUltras = [];
    state.phase = 'mutation_select';
    return true;
  }

  if (player.level >= 10 && needsUltra) {
    drawUltraChoices(state);
    state.phase = 'ultra_select';
    return true;
  }

  state.pendingLevelUps = 0;
  return false;
}

export function grantMutationById(
  state: SimState,
  id: MutationId,
  rng?: SeededRng,
): boolean {
  const player = state.player;
  if (!MUTATION_IDS.includes(id)) return false;
  if (player.mutations.includes(id)) return true;

  player.mutations.push(id);

  switch (id) {
    case 'rhino_skin':
      player.maxHp += 4;
      player.hp = Math.min(player.maxHp, player.hp + 4);
      break;
    case 'back_muscle':
      player.ammoMax = { ...BACK_MUSCLE_AMMO_MAX };
      break;
    case 'last_wish':
      if (player.mutant === 'chicken' && player.headlessTicks > 0) {
        healPlayer(state, player.maxHp);
      }
      healPlayer(state, Math.max(0, player.maxHp - player.hp));
      player.hp = player.maxHp;
      for (const ammoType of NON_MELEE_AMMO_TYPES) {
        player.ammo[ammoType] = player.ammoMax[ammoType];
      }
      // Authentic NT: Last Wish cleanses all held cursed weapons!
      cleanseCursedWeapons(state);
      break;
    case 'strong_spirit':
      player.strongSpiritReady = true;
      player.strongSpiritRecharging = false;
      break;
    case 'scarier_face':
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i]!;
        if (!e.friendly && e.hp > 1) {
          e.maxHp = Math.max(1, Math.round(e.maxHp * 0.8));
          e.hp = Math.min(e.hp, e.maxHp);
          if (state.boss && state.boss.entityId === e.id) {
            state.boss.maxHp = e.maxHp;
            state.boss.hp = Math.min(state.boss.hp, e.hp);
          }
        }
      }
      break;
    case 'patience':
      state.pendingPatiencePick = true;
      break;
    case 'hammerhead':
      player.hammerheadTicks = Math.max(player.hammerheadTicks, 24);
      break;
    default:
      break;
  }

  emitEvent(state, {
    type: 'sfx',
    sound: MUTATION_SOUNDS[id] ?? 'sndMutAppear',
    x: player.x,
    y: player.y,
  });

  if (rng) {
    state.rngState = rng.getState();
  }
  return true;
}

export function grantUltraById(
  state: SimState,
  ultraId: UltraId,
  rng?: SeededRng,
): boolean {
  const def = ULTRAS[ultraId];
  if (!def) return false;
  const player = state.player;
  if (redemptionPendingMeltingUltra.has(player) && ultraId !== 'skeleton_a') {
    redemptionPendingMeltingUltra.delete(player);
  }
  player.ultra = ultraId;

  switch (ultraId) {
    case 'crystal_a':
      player.maxHp += 6;
      player.hp = Math.min(player.maxHp, player.hp + 6);
      break;
    case 'melting_b':
      player.maxHp = Math.max(1, Math.ceil(player.maxHp / 2));
      player.hp = Math.min(player.hp, player.maxHp);
      state.pendingLevelUps += 3;
      break;
    case 'fish_b':
      player.gunWarrantTicks = 210;
      break;
    case 'yv_a':
    case 'yv_b':
      // Y.V. Ultra redirects portal into Y.V.'s Crib ($$$), saving cribReturnArea!
      state.visitedCrib = true;
      if (state.portal.entered) {
        if (state.portal.targetArea !== '$$$') {
          state.cribReturnArea = state.portal.targetArea;
          cribReturnLoopMap.set(state, state.portal.nextLoop);
        }
        state.portal.targetArea = '$$$';
      } else {
        const cribRng = rng ?? SeededRng.fromState(state.rngState);
        spawnYvCribChests(state, cribRng);
        if (!rng) {
          state.rngState = cribRng.getState();
        }
      }
      break;
    case 'horror_c':
      // MELTDOWN: doubles Level 10 rad capacity from 600 -> 1,200!
      player.radsToNextLevel = MELTDOWN_RAD_CAP;
      break;
    case 'skeleton_a': {
      // REDEMPTION: transform back into Melting (2 base HP), strip Skeleton mutations,
      // keep `player.ultra = 'skeleton_a'` until Melting's Ultra is selected, queue 9 picks + Melting Ultra!
      player.mutant = 'melting';
      player.maxHp = MUTANTS.melting.maxHp;
      player.hp = Math.min(Math.max(1, player.hp), player.maxHp);
      player.mutations = [];
      player.strongSpiritReady = false;
      player.strongSpiritRecharging = false;
      player.ammoMax = { ...DEFAULT_AMMO_MAX };
      for (const ammoType of NON_MELEE_AMMO_TYPES) {
        player.ammo[ammoType] = Math.min(player.ammo[ammoType], player.ammoMax[ammoType]);
      }
      player.skeletonTransformed = false;
      redemptionPendingMeltingUltra.add(player);
      state.pendingLevelUps += 10; // 9 fresh mutations + 1 Melting Ultra!
      emitEvent(state, {
        type: 'pickup_text',
        x: player.x,
        y: player.y - 16,
        text: 'REDEMPTION! BACK IN THE FLESH',
        color: '#ffaa66',
      });
      break;
    }
    case 'rogue_a':
      player.portalStrikes = Math.min(6, player.portalStrikes + 2);
      break;
    default:
      break;
  }

  emitEvent(state, {
    type: 'sfx',
    sound: ULTRA_SOUNDS[ultraId] ?? 'sndLevelUltra',
    x: player.x,
    y: player.y,
  });

  if (rng) {
    state.rngState = rng.getState();
  }
  return true;
}

export function applyMutationSelection(
  state: SimState,
  index: number,
  rng: SeededRng,
  populateFn?: PopulateAreaFn,
): boolean {
  if (state.phase === 'ultra_select') {
    const ultraId = state.pendingUltras[index];
    if (!ultraId) return false;
    state.pendingUltras = [];
    state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
    grantUltraById(state, ultraId, rng);

    if (state.pendingLevelUps > 0 && openPendingLevelUp(state, rng)) {
      return true;
    }
    if (state.portal.entered) {
      state.stats.areasCleared += 1;
      loadAreaIntoState(state, state.portal.targetArea, state.portal.nextLoop, populateFn);
    } else {
      state.phase = 'playing';
    }
    return true;
  }

  if (state.phase === 'mutation_select') {
    const mutId = state.pendingMutations[index];
    if (!mutId) return false;
    state.pendingMutations = [];
    state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
    grantMutationById(state, mutId, rng);

    if (state.pendingLevelUps > 0 && openPendingLevelUp(state, rng)) {
      return true;
    }
    if (state.portal.entered) {
      state.stats.areasCleared += 1;
      loadAreaIntoState(state, state.portal.targetArea, state.portal.nextLoop, populateFn);
    } else {
      state.phase = 'playing';
    }
    return true;
  }

  return false;
}

export function loadAreaIntoState(
  state: SimState,
  areaCode: AreaCode,
  loop?: number,
  populateFn?: PopulateAreaFn,
): void {
  const rng = SeededRng.fromState(state.rngState);
  const prevArea = state.areaCode;
  const targetLoop = loop ?? state.loop;
  const isTransition = state.tick > 0;
  const carryingCursed = Boolean(state.player.weapons[0]?.cursed || state.player.weapons[1]?.cursed);

  // Entering 4-1 while carrying any cursed weapon automatically redirects to 4-? Cursed Crystal Caves!
  const effectiveAreaCode: AreaCode = areaCode === '4-1' && carryingCursed ? '4-?' : areaCode;
  const areaDef = getAreaDef(effectiveAreaCode);
  const runRt = getRunRuntime(state);

  pendingPortalDelays.delete(state);

  // Bug #22b Fix: preserve true vaultReturnArea on Crown Vault entry & trigger Vault exit ambush + extra difficulty!
  if (effectiveAreaCode === 'vault') {
    cleanseCursedWeapons(state);
    if (!runRt.vaultReturnArea && prevArea !== 'vault') {
      runRt.vaultReturnArea = getNextAreaTransition(prevArea, targetLoop).areaCode;
    }
  } else if (isTransition && prevArea === 'vault') {
    runRt.vaultReturnArea = null;
    state.vaultAmbushPending = true;
    state.difficulty = (state.difficulty ?? 1) + 1; // Extra +1 difficulty on Crown Vault exit!
  }

  // Increment internal difficulty (+1 per normal portal transition; Crib exit does not bump difficulty)
  if (isTransition && prevArea !== '$$$') {
    state.difficulty = (state.difficulty ?? 1) + 1;
  }

  const map = generateWorldMap(effectiveAreaCode, areaDef.biome, targetLoop, rng, {
    targetFloors: areaDef.targetFloors,
    walkerCount: areaDef.walkerCount,
    darkness: areaDef.darkness,
  });

  state.areaCode = effectiveAreaCode;
  state.biome = areaDef.biome;
  state.loop = targetLoop;
  state.map = map;
  state.phase = 'playing';

  // Clear old floor entities
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.props = [];
  state.corpses = [];
  state.casings = [];
  state.decals = [];
  state.particles = [];
  state.boss = null;
  state.hitstopTicks = 0;
  state.cameraShake = 0;
  state.cameraKickX = 0;
  state.cameraKickY = 0;
  state.levelKills = 0;
  state.portalTransitionTicks = 0;
  state.floorClearTrigger = true;
  state.generatorsRemaining = effectiveAreaCode === '7-3' ? 4 : 0;

  // Place player safely on map spawn
  const player = state.player;
  player.x = map.spawnX;
  player.y = map.spawnY;
  player.prevX = map.spawnX;
  player.prevY = map.spawnY;
  player.vx = 0;
  player.vy = 0;
  player.rolling = false;
  player.shielding = false;
  player.telekinesisActive = false;
  player.radBeamActive = false;
  player.radBeamTicks = 0;
  player.portalStrikeAim = null;
  player.activeTimer = 0;
  player.hammerheadTicks = 24;
  player.hammerheadWallTicks = 0;
  player.allyCount = 0;
  player.frogRooted = false;

  // Chicken headless: entering portal regrows head (-2 max HP)
  if (isTransition && player.mutant === 'chicken' && player.headlessTicks > 0) {
    player.headlessTicks = 0;
    player.headlessDeaths += 1;
    player.maxHp = Math.max(2, player.maxHp - 2);
    player.hp = Math.max(1, Math.min(player.hp, player.maxHp));
  }

  // Rebel passive: portal heals 50% of missing HP
  if (isTransition && player.mutant === 'rebel' && player.hp < player.maxHp) {
    const healAmt = Math.ceil((player.maxHp - player.hp) * 0.5);
    healPlayer(state, healAmt);
  }

  // Strong Spirit: entering a new area makes a spent spirit eligible to recharge;
  // if already at full HP (before Crown of Luck lowers HP to 1), recharge immediately!
  if (isTransition && hasMutation(player, 'strong_spirit') && !player.strongSpiritReady) {
    player.strongSpiritRecharging = true;
  }
  if (player.strongSpiritRecharging && !player.strongSpiritReady && player.hp >= player.maxHp) {
    player.strongSpiritReady = true;
    player.strongSpiritRecharging = false;
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndStrongSpiritGain',
      x: player.x,
      y: player.y,
    });
  }

  // Fish Ultra B (Gun Warrant): 7 seconds (210 ticks) infinite ammo on area start
  if (player.mutant === 'fish' && hasUltra(player, 'fish_b')) {
    player.gunWarrantTicks = 210;
  } else {
    player.gunWarrantTicks = 0;
  }

  // Rebel Ultra A (Personal Guard): 2 free allies on area start
  if (player.mutant === 'rebel' && hasUltra(player, 'rebel_a')) {
    spawnFriendlyUnit(state, 'rebel_ally', map.spawnX - 16, map.spawnY);
    spawnFriendlyUnit(state, 'rebel_ally', map.spawnX + 16, map.spawnY);
    player.allyCount = 2;
  }

  // Crown of Luck: start area at 1 HP
  if (state.crown === 'luck' && player.alive) {
    player.hp = 1;
  }

  // Reset portal state (preserving true vaultReturnArea on Vault and cribReturnArea on $$$!)
  const next = getNextAreaTransition(effectiveAreaCode, targetLoop);
  const initialTargetArea: AreaCode =
    effectiveAreaCode === 'vault' && runRt.vaultReturnArea
      ? runRt.vaultReturnArea
      : effectiveAreaCode === '$$$' && state.cribReturnArea
        ? state.cribReturnArea
        : next.areaCode;
  const initialNextLoop =
    effectiveAreaCode === '$$$' ? (cribReturnLoopMap.get(state) ?? targetLoop) : next.loop;
  state.portal = {
    active: false,
    x: map.spawnX,
    y: map.spawnY,
    radius: 18,
    timer: 0,
    targetArea: initialTargetArea,
    nextLoop: initialNextLoop,
    entered: false,
    enterTicks: 0,
    carved: false,
  };

  // Spawn standard chests/canisters & invoke entity populator if provided
  spawnLevelChests(state, rng);
  if (populateFn) {
    populateFn(state, rng);
  }

  // Y.V.'s Crib ($$$): enforce Crown of Love conversion, Open Mind +1 Giant Chest, and fallback props if no populator
  if (effectiveAreaCode === '$$$') {
    const hasAnyGiant = state.props.some(
      (p) => p.kind === 'giant_weapon_chest' || p.kind === 'giant_ammo_chest',
    );
    if (!hasAnyGiant) {
      const cribOffsets: ReadonlyArray<[number, number, 'giant_weapon_chest' | 'giant_ammo_chest']> = [
        [-28, -16, 'giant_weapon_chest'],
        [28, -16, 'giant_weapon_chest'],
        [0, -28, 'giant_ammo_chest'],
      ];
      for (const [ox, oy, kind] of cribOffsets) {
        const spot = findNearestFloor(state.map, map.spawnX + ox, map.spawnY + oy, 8);
        const isWep = kind === 'giant_weapon_chest';
        state.props.push({
          id: allocEntityId(state),
          kind,
          x: spot.x,
          y: spot.y,
          radius: 12,
          hp: 999,
          maxHp: 999,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: isWep ? 'sprGiantWepChest' : 'sprGiantAmmoChest',
          openSprite: isWep ? 'sprGiantWepChestOpen' : 'sprGiantAmmoChestOpen',
        });
      }
    }
    if (hasMutation(player, 'open_mind')) {
      const extraSpot = findNearestFloor(state.map, map.spawnX + 36, map.spawnY + 12, 8);
      const isAmmo = state.crown === 'love';
      state.props.push({
        id: allocEntityId(state),
        kind: isAmmo ? 'giant_ammo_chest' : 'giant_weapon_chest',
        x: extraSpot.x,
        y: extraSpot.y,
        radius: 12,
        hp: 999,
        maxHp: 999,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: isAmmo ? 'sprGiantAmmoChest' : 'sprGiantWepChest',
        openSprite: isAmmo ? 'sprGiantAmmoChestOpen' : 'sprGiantWepChestOpen',
      });
    }
    if (state.crown === 'love') {
      for (let i = 0; i < state.props.length; i++) {
        const p = state.props[i]!;
        if (p.kind === 'giant_weapon_chest') {
          p.kind = 'giant_ammo_chest';
          p.sprite = 'sprGiantAmmoChest';
          p.openSprite = 'sprGiantAmmoChestOpen';
        }
      }
    }
    if (!state.props.some((p) => p.kind === 'venuz_car_exit')) {
      const carSpot = findNearestFloor(state.map, map.spawnX, map.spawnY + 26, 8);
      state.props.push({
        id: allocEntityId(state),
        kind: 'venuz_car_exit',
        x: carSpot.x,
        y: carSpot.y,
        radius: 12,
        hp: 999,
        maxHp: 999,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprVenusCarFixed',
        interactPrompt: '[E] LEAVE CRIB',
      });
    }
  }

  // Apply Scarier Face (-20% enemy HP + sync Boss HUD!) & Crown of Luck (10% chance enemy spawns at 1 HP)
  const scarier = hasMutation(player, 'scarier_face');
  const luck = state.crown === 'luck';
  if (scarier || luck) {
    const activeBoss = state.boss as SimState['boss'];
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (e.friendly) continue;
      if (scarier) {
        e.maxHp = Math.max(1, Math.round(e.maxHp * 0.8));
        e.hp = Math.min(e.hp, e.maxHp);
        if (activeBoss && activeBoss.entityId === e.id) {
          activeBoss.maxHp = e.maxHp;
          activeBoss.hp = e.hp;
        }
      }
      if (luck && !e.isBoss && rng.chance(0.1)) {
        e.hp = 1;
      }
    }
  }

  let startTotalHp = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') {
      startTotalHp += e.hp;
    }
  }
  levelStartTotalHpMap.set(state, { mapRef: state.map, totalHp: startTotalHp });
  state.levelStartEnemyCount = countHostileEnemies(state);
  state.rngState = rng.getState();

  // Emit authentic Wiki B-Skin & Hard Mode unlock events!
  if (effectiveAreaCode === '4-?' && player.mutant === 'crystal') {
    recordUnlock(state, 'bskin_crystal');
  }
  if (effectiveAreaCode === '2-?' && player.mutant === 'eyes') {
    recordUnlock(state, 'bskin_eyes');
  }
  if (
    effectiveAreaCode === '7-3' &&
    player.mutant === 'melting' &&
    !hasMutation(player, 'rhino_skin') &&
    !hasMutation(player, 'strong_spirit')
  ) {
    recordUnlock(state, 'bskin_melting');
  }
  if (effectiveAreaCode === '7-3' && player.mutant === 'plant' && state.stats.timeTicks < 18000) {
    recordUnlock(state, 'bskin_plant');
  }
  if (effectiveAreaCode === '2-1' && player.mutant === 'chicken' && state.hardMode) {
    recordUnlock(state, 'bskin_chicken');
  }
  if (targetLoop >= 2) {
    recordUnlock(state, 'hard_mode');
  }

  emitEvent(state, {
    type: 'area_change',
    areaCode: effectiveAreaCode,
    biome: areaDef.biome,
    loop: targetLoop,
  });
  // Never emit mus/Boss4A while 7-3 Throne sleeps (prevents double-fetch before Boss4Silence routing!)
  const initialTrack =
    effectiveAreaCode === '7-3'
      ? 'mus/Boss4Silence'
      : targetLoop > 0 && areaDef.musicTrackB
        ? areaDef.musicTrackB
        : areaDef.musicTrack;
  emitEvent(state, {
    type: 'music',
    track: initialTrack,
    ambience: areaDef.ambienceTrack,
    boss: effectiveAreaCode === '0-1',
  });
}

export function createInitialSimState(opts: CreateInitialSimOptions): SimState {
  const seed = (opts.seed ?? 1337) >>> 0;
  const rng = new SeededRng(seed);
  // Secret Mutant Frog: starting a run on 1-1 carrying Golden Frog Pistol transforms player into Frog!
  const frogTransform = opts.goldenWeapon === 'golden_frog_pistol' && opts.mutant !== 'frog';
  const effectiveMutant: MutantId = frogTransform ? 'frog' : opts.mutant;
  const mutantDef = MUTANTS[effectiveMutant];
  const crown: CrownId = opts.crown ?? 'none';
  const skin: 'a' | 'b' = opts.skin ?? 'a';
  const hardMode = Boolean(opts.hardMode);
  const startLoop = hardMode ? 1 : 0;

  let maxHp = mutantDef.maxHp;
  if (crown === 'death') {
    maxHp = Math.max(1, maxHp - 1);
  }
  const startHp = crown === 'luck' ? 1 : maxHp;

  const primaryWepId =
    opts.goldenWeapon && WEAPONS[opts.goldenWeapon]
      ? opts.goldenWeapon
      : mutantDef.startingWeapon;
  const primarySlot = createWeaponSlot(primaryWepId);
  const secondarySlot = mutantDef.secondaryWeapon
    ? createWeaponSlot(mutantDef.secondaryWeapon)
    : null;

  // Authentic NT starting ammo: 96 bullets (plus starter reserves if carrying a non-bullet golden weapon)
  const startAmmo: Record<AmmoType, number> = {
    melee: 0,
    bullet: 96,
    shell: 0,
    bolt: 0,
    explosive: 0,
    energy: 0,
  };
  for (const slot of [primarySlot, secondarySlot]) {
    if (!slot) continue;
    const wDef = getWeaponDef(slot.weaponId);
    if (wDef.ammoType !== 'melee' && startAmmo[wDef.ammoType] === 0) {
      startAmmo[wDef.ammoType] = AMMO_PICKUP_AMOUNT[wDef.ammoType] * 2;
    }
  }

  const placeholderMap = {
    width: 16,
    height: 16,
    tileSize: 16,
    tiles: new Uint8Array(256).fill(TileType.Floor),
    floorVariants: new Uint8Array(256),
    wallMask: new Uint8Array(256),
    spawnX: 128,
    spawnY: 128,
    biome: 'desert' as const,
    areaCode: '1-1' as const,
    loop: startLoop,
    darkness: 0,
    walkableCount: 256,
  };

  const state: SimState = {
    tick: 0,
    seed,
    rngState: rng.getState(),
    phase: 'playing',
    areaCode: '1-1',
    biome: 'desert',
    loop: startLoop,
    crown,
    map: placeholderMap,
    player: {
      id: 1,
      mutant: effectiveMutant,
      skin,
      x: 128,
      y: 128,
      prevX: 128,
      prevY: 128,
      vx: 0,
      vy: 0,
      radius: 5.5,
      aimAngle: 0,
      facing: 1,
      hp: startHp,
      maxHp,
      iframes: 0,
      hurtFlashTicks: 0,
      rads: 0,
      level: 1,
      radsToNextLevel: radsRequiredForLevel(1),
      mutations: [],
      ultra: null,
      strongSpiritReady: false,
      strongSpiritRecharging: false,
      ammo: startAmmo,
      ammoMax: { ...DEFAULT_AMMO_MAX },
      weapons: [primarySlot, secondarySlot],
      activeSlot: 0,
      activeCooldown: 0,
      activeTimer: 0,
      shielding: false,
      rolling: false,
      rollDirX: 1,
      rollDirY: 0,
      telekinesisActive: false,
      radBeamTicks: 0,
      radBeamActive: false,
      headlessTicks: 0,
      headlessDeaths: 0,
      gunWarrantTicks: 0,
      portalStrikes: effectiveMutant === 'rogue' ? 3 : 0,
      portalStrikeAim: null,
      hammerheadTicks: 24,
      hammerheadWallTicks: 0,
      allyCount: 0,
      animFrame: 0,
      godMode: false,
      alive: true,
      lastDamageCause: '',
      lastKillerSprite: '',
      frogRooted: false,
      skeletonTransformed: false,
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    corpses: [],
    casings: [],
    decals: [],
    particles: [],
    portal: {
      active: false,
      x: 128,
      y: 128,
      radius: 18,
      timer: 0,
      targetArea: '1-2',
      nextLoop: startLoop,
      entered: false,
      enterTicks: 0,
      carved: false,
    },
    boss: null,
    hitstopTicks: 0,
    cameraShake: 0,
    cameraKickX: 0,
    cameraKickY: 0,
    events: [],
    pendingMutations: [],
    pendingUltras: [],
    pendingLevelUps: crown === 'destiny' ? 1 : 0,
    chestSkipStreak: 0,
    generatorsRemaining: 0,
    idpdHeat: effectiveMutant === 'rogue' ? 1 : 0,
    levelStartEnemyCount: 0,
    levelKills: 0,
    stats: {
      kills: 0,
      shotsFired: 0,
      damageDealt: 0,
      damageTaken: 0,
      radsCollected: 0,
      bossesDefeated: [],
      areasCleared: 0,
      timeTicks: 0,
    },
    nextEntityId: 10,
    portalTransitionTicks: 0,
    floorClearTrigger: true,
    visitedCrib: false,
    cribReturnArea: null,
    radCanisterSkipStreak: 0,
    weaponChestSkipStreak: 0,
    difficulty: hardMode ? 8 : 1,
    hardMode,
    vaultAmbushPending: false,
    pendingPatiencePick: false,
    chickenDroppedSwordOn1_1: false,
  };

  if (opts.protoChestWeaponId !== undefined) {
    setProtoChestWeaponId(state, opts.protoChestWeaponId);
  }

  loadAreaIntoState(state, '1-1', startLoop, opts.populateFn);
  if (frogTransform) {
    recordUnlock(state, 'mutant_frog');
    emitEvent(state, {
      type: 'sfx',
      sound: 'sndFrogStart',
      x: state.player.x,
      y: state.player.y,
    });
  }
  // Crown of Destiny grants an immediate free mutation choice at run start
  if (crown === 'destiny' && state.pendingLevelUps > 0) {
    const destinyRng = SeededRng.fromState(state.rngState);
    openPendingLevelUp(state, destinyRng);
    state.rngState = destinyRng.getState();
  }
  return state;
}

export function checkPortalTrigger(
  state: SimState,
  rng: SeededRng,
  populateFn?: PopulateAreaFn,
): 'none' | 'portal_opened' | 'selection_opened' | 'area_loaded' {
  // 1. Complete portal transition once player has warped for PORTAL_WARP_TICKS (~18 ticks)
  if (state.phase === 'portal_transition' && state.portal.entered) {
    if (state.portalTransitionTicks >= PORTAL_WARP_TICKS) {
      const player = state.player;
      const hasTB = hasMutation(player, 'throne_butt');

      // Sweep ONLY loose floor rads into player XP (NEVER auto-vacuum unopened rad canisters!)
      let sweptRads = 0;
      for (let i = state.pickups.length - 1; i >= 0; i--) {
        const pk = state.pickups[i]!;
        if (pk.kind === 'rad' || pk.kind === 'big_rad') {
          player.rads += pk.value;
          state.stats.radsCollected += pk.value;
          sweptRads += pk.value;
          state.pickups.splice(i, 1);
        }
      }

      let leftIntactCanister = false;
      for (let i = state.props.length - 1; i >= 0; i--) {
        const prop = state.props[i]!;
        if (prop.opened || prop.mimic) continue;
        if (prop.kind === 'rad_canister' || prop.kind === 'rad_maggot_canister') {
          leftIntactCanister = true;
        } else if (prop.kind === 'weapon_chest' || prop.kind === 'big_weapon_chest') {
          state.chestSkipStreak += 1;
          state.weaponChestSkipStreak = (state.weaponChestSkipStreak ?? 0) + 1;
          prop.opened = true;
        }
      }
      if (leftIntactCanister) {
        state.radCanisterSkipStreak = (state.radCanisterSkipStreak ?? 0) + 1;
      }
      if (sweptRads > 0) {
        rolloverPlayerRads(state);
      }

      // Robot Ultra A (Refined Taste) & Ultra B (Regurgitate): auto-eat leftover floor weapons on portal exit!
      if (player.mutant === 'robot' && (hasUltra(player, 'robot_a') || hasUltra(player, 'robot_b'))) {
        let ateAny = false;
        const isRegurgitate = hasUltra(player, 'robot_b');
        for (let i = state.pickups.length - 1; i >= 0; i--) {
          const pk = state.pickups[i]!;
          if (pk.kind !== 'weapon') continue;
          state.pickups.splice(i, 1);
          ateAny = true;
          const hpGain = hasTB ? 4 : 2;
          if (player.hp < player.maxHp) {
            healPlayer(state, hpGain);
          } else {
            const ammoType = rng.pick(NON_MELEE_AMMO_TYPES);
            addAmmoToPool(state, ammoType, AMMO_PICKUP_AMOUNT[ammoType] * (hasTB ? 2 : 1));
          }
          if (isRegurgitate && rng.chance(0.45)) {
            const bonusAmmo = rng.pick(NON_MELEE_AMMO_TYPES);
            addAmmoToPool(state, bonusAmmo, AMMO_PICKUP_AMOUNT[bonusAmmo]);
          }
        }
        if (ateAny) {
          emitEvent(state, {
            type: 'sfx',
            sound: hasTB ? 'sndRobotEatUpg' : 'sndRobotEat',
            x: player.x,
            y: player.y,
          });
        }
      }

      // Consume Patience deferred mutation on portal transition (once per run!)
      const patienceIdx = player.mutations.indexOf('patience');
      if (patienceIdx !== -1 || state.pendingPatiencePick) {
        if (patienceIdx !== -1) {
          player.mutations.splice(patienceIdx, 1);
        }
        state.pendingPatiencePick = false;
        patienceConsumedPlayers.add(player);
        state.pendingLevelUps += 1;
      }

      if (state.pendingLevelUps > 0 && openPendingLevelUp(state, rng)) {
        return 'selection_opened';
      }

      const exitingCrib = state.areaCode === '$$$';
      if (!exitingCrib) {
        state.stats.areasCleared += 1;
      } else {
        state.cribReturnArea = null;
        cribReturnLoopMap.delete(state);
      }
      loadAreaIntoState(state, state.portal.targetArea, state.portal.nextLoop, populateFn);
      return 'area_loaded';
    }
    return 'none';
  }

  // 2. Check if portal should open on current floor
  if (state.portal.active || state.phase !== 'playing') {
    return 'none';
  }

  const pendingDelay = pendingPortalDelays.get(state);
  if (pendingDelay && pendingDelay.mapRef === state.map) {
    pendingDelay.delayTicks -= 1;
    if (pendingDelay.delayTicks > 0) {
      return 'none';
    }
    pendingPortalDelays.delete(state);
    const safe = findNearestFloor(state.map, pendingDelay.anchorX, pendingDelay.anchorY, 10);
    const next = getNextAreaTransition(state.areaCode, state.loop);
    const runRt = getRunRuntime(state);
    const carryingCursed = Boolean(state.player.weapons[0]?.cursed || state.player.weapons[1]?.cursed);
    let targetArea: AreaCode =
      state.areaCode === 'vault' && runRt.vaultReturnArea
        ? runRt.vaultReturnArea
        : state.areaCode === '$$$' && state.cribReturnArea
          ? state.cribReturnArea
          : next.areaCode;
    if (targetArea === '4-1' && carryingCursed) {
      targetArea = '4-?';
    }
    const nextLoop = state.areaCode === '$$$' ? (cribReturnLoopMap.get(state) ?? state.loop) : next.loop;

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
      type: 'particle',
      kind: 'portal_swirl',
      x: safe.x,
      y: safe.y,
      vx: 0,
      vy: 0,
      color: '#a8ff8a',
      size: 64,
      life: 12,
      sprite: 'sprPortalClear',
    });
    emitEvent(state, {
      type: 'portal_open',
      x: safe.x,
      y: safe.y,
      targetArea,
    });
    emitEvent(state, {
      type: 'sfx',
      sound: pendingDelay.triggeredByAnomaly ? 'sndHorrorPortal' : 'sndPortalOpen',
      x: safe.x,
      y: safe.y,
    });
    return 'portal_opened';
  }

  const bossAlive = Boolean(state.boss && !state.boss.defeated);
  if (bossAlive) return 'none';

  let hostileCount = 0;
  let remainingHostileHp = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') {
      hostileCount += 1;
      remainingHostileHp += e.hp;
    }
  }

  const isHorrorAnomaly = state.player.mutant === 'horror' && hasUltra(state.player, 'horror_b');
  const startHpRec = levelStartTotalHpMap.get(state);
  const startTotalHp = startHpRec && startHpRec.mapRef === state.map ? startHpRec.totalHp : 0;
  const anomalyHpThreshold =
    state.loop >= 2 && startTotalHp > 0 ? Math.max(140, Math.round(startTotalHp * 0.1)) : 140;
  const hasProgress = state.levelKills > 0 || (state.levelStartEnemyCount > 0 && hostileCount < state.levelStartEnemyCount);
  const triggeredByAnomaly =
    isHorrorAnomaly && hostileCount > 0 && hasProgress && remainingHostileHp <= anomalyHpThreshold;

  const clearedByKills =
    triggeredByAnomaly ||
    (hostileCount === 0 && (state.levelStartEnemyCount > 0 || state.levelKills > 0 || Boolean(state.boss?.defeated)));

  if (!clearedByKills) {
    return 'none';
  }

  // Position portal safely near last corpse or player
  const lastCorpse = state.corpses[state.corpses.length - 1];
  const anchorX = lastCorpse ? lastCorpse.x : state.player.x + 28;
  const anchorY = lastCorpse ? lastCorpse.y : state.player.y;

  // If Horror Anomaly triggered early, consume remaining enemies immediately (crediting kills & rads!)
  if (triggeredByAnomaly) {
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i]!;
      if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') {
        state.stats.kills += 1;
        state.levelKills += 1;
        let totalRads = e.radDrop;
        if (state.crown === 'blood') totalRads = Math.max(0, totalRads - 1);
        const bigRads = Math.floor(totalRads / 10);
        const smallRads = totalRads % 10;
        for (let r = 0; r < bigRads; r++) {
          spawnPickup(state, 'big_rad', e.x, e.y, { value: 10 }, rng);
        }
        for (let r = 0; r < smallRads; r++) {
          spawnPickup(state, 'rad', e.x, e.y, { value: 1 }, rng);
        }
        emitEvent(state, {
          type: 'particle',
          kind: 'portal_swirl',
          x: e.x,
          y: e.y,
          vx: 0,
          vy: 0,
          color: '#7cff6b',
          size: 5,
          life: 12,
        });
        state.enemies.splice(i, 1);
      }
    }
  }

  // Authentic ~30-tick portal spawn delay (1.0s pause after final kill before sprPortalClear blast!)
  pendingPortalDelays.set(state, {
    mapRef: state.map,
    delayTicks: PORTAL_SPAWN_DELAY_TICKS - 1,
    anchorX,
    anchorY,
    triggeredByAnomaly,
  });
  return 'none';
}

export { AREAS };
