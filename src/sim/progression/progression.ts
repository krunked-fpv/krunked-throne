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
} from '@/contracts';
import {
  AMMO_PICKUP_AMOUNT,
  AREAS,
  BACK_MUSCLE_AMMO_MAX,
  DEFAULT_AMMO_MAX,
  MUTANTS,
  MUTATION_IDS,
  ULTRAS,
  WEAPONS,
  WEAPON_SPECIFIC_MUTATIONS,
  getAreaDef,
  getNextAreaTransition,
  getWeaponDef,
  getWeaponsByTier,
} from '@/data';
import {
  SeededRng,
  allocEntityId,
  emitEvent,
  findNearestFloor,
  generateWorldMap,
  getTile,
  isWalkableTile,
  rolloverPlayerRads,
  tileToWorldCenter,
} from '@/sim/core';
import {
  NON_MELEE_AMMO_TYPES,
  addAmmoToPool,
  applyDamageToPlayer,
  hasMutation,
  hasUltra,
  healPlayer,
  spawnFriendlyUnit,
  spawnPickup,
} from '@/sim/combat/helpers';

// Tracks players who have already consumed Patience in the current run (once-per-run NT rule).
const patienceConsumedPlayers = new WeakSet<PlayerState>();

// Tracks Y.V. players who picked an Ultra during portal transition and should receive Crib chests on arrival.
const yvCribPendingPlayers = new WeakSet<PlayerState>();

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
  rogue_a: 'snd/RogueUltraA',
  rogue_b: 'snd/RogueUltraB',
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
  populateFn?: PopulateAreaFn;
}

export function radsRequiredForLevel(level: number): number {
  if (level >= 10) return 9999;
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

function rollTierWeapon(
  state: SimState,
  rng: SeededRng,
  bonusTier = 0,
): { weaponId: string; cursed: boolean } {
  const areaDef = getAreaDef(state.areaCode);
  const player = state.player;
  const robotBonus = player.mutant === 'robot' ? 1 : 0;
  const maxTier = Math.min(
    12,
    Math.max(1, areaDef.weaponTierBase + state.loop * 4 + robotBonus + bonusTier),
  );
  let minTier = Math.max(0, maxTier - 4);
  if (player.mutant === 'robot' && hasUltra(player, 'robot_a')) {
    minTier = Math.min(maxTier, Math.max(minTier, 4));
  }

  const allowCursed = state.crown === 'curses' || state.biome === 'cursed_caves';
  if (allowCursed && rng.chance(state.crown === 'curses' ? 0.55 : 0.45)) {
    // Crown of Curses / Cursed Crystal Caves: roll elevated-tier cursed weapons on ANY floor!
    const cursedMax = Math.min(12, maxTier + 2);
    const cursedMin = Math.min(cursedMax, Math.max(minTier, maxTier - 1));
    const elevatedPool = getWeaponsByTier(cursedMin, cursedMax, true);
    if (elevatedPool.length > 0) {
      const intrinsicCursed = elevatedPool.filter((w) => w.cursed);
      const chosen =
        intrinsicCursed.length > 0 && rng.chance(0.6)
          ? rng.pick(intrinsicCursed)
          : rng.pick(elevatedPool);
      return { weaponId: chosen.id, cursed: true };
    }
  }

  const pool = getWeaponsByTier(minTier, maxTier, allowCursed);
  if (pool.length === 0) return { weaponId: 'revolver', cursed: false };

  const chosen = rng.pick(pool);
  return { weaponId: chosen.id, cursed: Boolean(chosen.cursed) };
}

export function pickTierWeaponId(state: SimState, rng: SeededRng, bonusTier = 0): string {
  return rollTierWeapon(state, rng, bonusTier).weaponId;
}

export function spawnLevelChests(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const isBossArena = state.areaCode === '0-1';

  // 1. Weapon chest (converts to Big Weapon Chest if chestSkipStreak >= 1, or Ammo Chest with Crown of Love)
  const cursedChests = state.crown === 'curses' || state.biome === 'cursed_caves';
  const lifeHealthChests = state.crown === 'life' && player.hp < player.maxHp;

  if (!isBossArena && state.areaCode !== '7-3' && state.areaCode !== 'vault') {
    const pos1 = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 96, true, rng);
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
    } else if (state.chestSkipStreak >= 1) {
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
        cursed: cursedChests || undefined,
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
        sprite: cursedChests ? 'sprCursedChest' : 'sprWeaponChest',
        openSprite: cursedChests ? 'sprCursedChestOpen' : 'sprWeaponChestOpen',
        cursed: cursedChests || undefined,
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

    // 3. Rad canister (or IDPD Portal Strike canister for Rogue!) tucked in an outer risk-reward nook
    const pos3 = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 108, true, rng);
    if (player.mutant === 'rogue') {
      state.props.push({
        id: allocEntityId(state),
        kind: 'idpd_canister',
        x: pos3.x,
        y: pos3.y,
        radius: 8,
        hp: 6,
        maxHp: 6,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprRogueAmmoChest',
        openSprite: 'sprRogueAmmoChestOpen',
      });
    } else {
      state.props.push({
        id: allocEntityId(state),
        kind: 'rad_canister',
        x: pos3.x,
        y: pos3.y,
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

    // 4. Open Mind extra chest (equal 1/3 chance: weapon chest, ammo chest, or rad/IDPD canister)
    if (hasMutation(player, 'open_mind')) {
      const posExtra = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 88, true, rng);
      const roll = rng.int(0, 2);
      if (roll === 2) {
        if (player.mutant === 'rogue') {
          state.props.push({
            id: allocEntityId(state),
            kind: 'idpd_canister',
            x: posExtra.x,
            y: posExtra.y,
            radius: 8,
            hp: 6,
            maxHp: 6,
            solid: false,
            opened: false,
            hurtFlashTicks: 0,
            sprite: 'sprRogueAmmoChest',
            openSprite: 'sprRogueAmmoChestOpen',
          });
        } else {
          state.props.push({
            id: allocEntityId(state),
            kind: 'rad_canister',
            x: posExtra.x,
            y: posExtra.y,
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
      } else {
        const extraWeapon = roll === 0 && state.crown !== 'love';
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
            ? cursedChests
              ? 'sprCursedChest'
              : 'sprWeaponChest'
            : lifeHealthChests
              ? 'sprHealthChest'
              : 'sprAmmoChest',
          openSprite: extraWeapon
            ? cursedChests
              ? 'sprCursedChestOpen'
              : 'sprWeaponChestOpen'
            : lifeHealthChests
              ? 'sprHealthChestOpen'
              : 'sprAmmoChestOpen',
          cursed: extraWeapon && cursedChests ? true : undefined,
        });
      }
    }

    // 5. Y.V. Ultra B (Back 2 Bizniz): extra Crib weapon chests (or ammo chests with Crown of Love)
    if (player.mutant === 'yv' && hasUltra(player, 'yv_b')) {
      const cribAmmoOnly = state.crown === 'love';
      for (let c = 0; c < 2; c++) {
        const posCrib = findRiskRewardChestSpot(state, state.map.spawnX, state.map.spawnY, 56, false, rng);
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
            : cursedChests
              ? 'sprCursedChest'
              : 'sprWeaponChest',
          openSprite: cribAmmoOnly
            ? lifeHealthChests
              ? 'sprHealthChestOpen'
              : 'sprAmmoChestOpen'
            : cursedChests
              ? 'sprCursedChestOpen'
              : 'sprWeaponChestOpen',
          cursed: !cribAmmoOnly && cursedChests ? true : undefined,
        });
      }
    }
  }

  // 6. Y.V. Ultra Crib bonanza queued from portal Ultra selection (both yv_a and yv_b!)
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

  // Crown of Hatred: opening any chest damages player by 1 (bypassing shield/iframes) and yields 14 rads
  if (state.crown === 'hatred') {
    applyDamageToPlayer(state, 1, 'CROWN OF HATRED', 'sprCrown6Idle', rng, {
      ignoreIframes: true,
      bypassShield: true,
    });
    for (let i = 0; i < 4; i++) {
      spawnPickup(state, 'rad', prop.x, prop.y, { value: 1 }, rng);
    }
    spawnPickup(state, 'big_rad', prop.x, prop.y, { value: 10 }, rng);
  }

  if (prop.kind === 'weapon_chest') {
    state.chestSkipStreak = 0;
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 2 : 1;
    let anyCursed = false;
    for (let i = 0; i < count; i++) {
      const rolled = rollTierWeapon(state, rng, 0);
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
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 6 : 3;
    let anyCursed = false;
    for (let i = 0; i < count; i++) {
      const rolled = rollTierWeapon(state, rng, 1);
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

  if (prop.kind === 'ammo_chest') {
    // Check Crown of Life BEFORE Steroids Ultra B so Crown of Life + Get Loaded NEVER softlocks healing!
    if (state.crown === 'life' && player.hp < player.maxHp) {
      prop.sprite = 'sprHealthChest';
      prop.openSprite = 'sprHealthChestOpen';
      healPlayer(state, hasMutation(player, 'second_stomach') ? 8 : 4);
      emitEvent(state, { type: 'sfx', sound: 'sndHealthChestBig', x: prop.x, y: prop.y });
      return true;
    } else if (player.mutant === 'steroids' && hasUltra(player, 'steroids_b')) {
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

  // Only fresh unlooted weapons grant starter ammo (or HP with Crown of Protection)
  if (grantBonus) {
    if (state.crown === 'protection') {
      healPlayer(state, hasMutation(player, 'second_stomach') ? 4 : 2);
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
    player.radsToNextLevel = radsRequiredForLevel(player.level);
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
  const ultras = MUTANTS[state.player.mutant].ultras;
  state.pendingUltras = [ultras[0].id, ultras[1].id];
  return state.pendingUltras;
}

export function openPendingLevelUp(state: SimState, rng: SeededRng): boolean {
  if (state.pendingLevelUps <= 0) return false;
  const player = state.player;

  // Trigger Ultra selection at level 10 when Ultra hasn't been picked yet
  if (player.level >= 10 && !player.ultra && state.pendingLevelUps === 1) {
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

  if (player.level >= 10 && !player.ultra) {
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
      // Both Y.V. Ultras grant an immediate Crib-style giant weapon chest bonanza!
      if (state.portal.entered) {
        yvCribPendingPlayers.add(player);
      } else {
        const cribRng = rng ?? SeededRng.fromState(state.rngState);
        spawnYvCribChests(state, cribRng);
        if (!rng) {
          state.rngState = cribRng.getState();
        }
      }
      break;
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
  const areaDef = getAreaDef(areaCode);
  const targetLoop = loop ?? state.loop;
  const isTransition = state.tick > 0;

  const map = generateWorldMap(areaCode, areaDef.biome, targetLoop, rng, {
    targetFloors: areaDef.targetFloors,
    walkerCount: areaDef.walkerCount,
    darkness: areaDef.darkness,
  });

  state.areaCode = areaCode;
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
  state.generatorsRemaining = areaCode === '7-3' ? 4 : 0;

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

  // Reset portal state
  const next = getNextAreaTransition(areaCode, targetLoop);
  state.portal = {
    active: false,
    x: map.spawnX,
    y: map.spawnY,
    radius: 18,
    timer: 0,
    targetArea: next.areaCode,
    nextLoop: next.loop,
    entered: false,
    enterTicks: 0,
    carved: false,
  };

  // Spawn standard chests/canisters & invoke Wave 2C entity populator if provided
  spawnLevelChests(state, rng);
  if (populateFn) {
    populateFn(state, rng);
  }

  // Apply Scarier Face (-20% enemy HP + sync Boss HUD!) & Crown of Luck (chance enemy spawns at 1 HP)
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
      if (luck && !e.isBoss && rng.chance(0.25)) {
        e.hp = 1;
      }
    }
  }

  state.levelStartEnemyCount = countHostileEnemies(state);
  state.rngState = rng.getState();

  emitEvent(state, {
    type: 'area_change',
    areaCode,
    biome: areaDef.biome,
    loop: targetLoop,
  });
  // Never emit mus/Boss4A while 7-3 Throne sleeps (prevents double-fetch before Boss4Silence routing!)
  const initialTrack =
    areaCode === '7-3'
      ? 'mus/Boss4Silence'
      : targetLoop > 0 && areaDef.musicTrackB
        ? areaDef.musicTrackB
        : areaDef.musicTrack;
  emitEvent(state, {
    type: 'music',
    track: initialTrack,
    ambience: areaDef.ambienceTrack,
    boss: areaCode === '0-1',
  });
}

export function createInitialSimState(opts: CreateInitialSimOptions): SimState {
  const seed = (opts.seed ?? 1337) >>> 0;
  const rng = new SeededRng(seed);
  const mutantDef = MUTANTS[opts.mutant];
  const crown: CrownId = opts.crown ?? 'none';
  const skin: 'a' | 'b' = opts.skin ?? 'a';

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
    loop: 0,
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
    loop: 0,
    crown,
    map: placeholderMap,
    player: {
      id: 1,
      mutant: opts.mutant,
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
      portalStrikes: opts.mutant === 'rogue' ? 3 : 0,
      portalStrikeAim: null,
      hammerheadTicks: 24,
      hammerheadWallTicks: 0,
      allyCount: 0,
      animFrame: 0,
      godMode: false,
      alive: true,
      lastDamageCause: '',
      lastKillerSprite: '',
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
      nextLoop: 0,
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
    idpdHeat: opts.mutant === 'rogue' ? 1 : 0,
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
  };

  loadAreaIntoState(state, '1-1', 0, opts.populateFn);
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
  // 1. Complete portal transition once player has been pulled inside for 24 ticks
  if (state.phase === 'portal_transition' && state.portal.entered) {
    if (state.portalTransitionTicks >= 24) {
      const player = state.player;
      const hasTB = hasMutation(player, 'throne_butt');

      // Sweep any remaining loose floor rads & unopened rad canisters into player XP
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
      for (let i = state.props.length - 1; i >= 0; i--) {
        const prop = state.props[i]!;
        if (prop.opened || prop.mimic) continue;
        if (prop.kind === 'rad_canister') {
          const stored = prop.radsStored ?? 10;
          if (stored > 0) {
            player.rads += stored;
            state.stats.radsCollected += stored;
            sweptRads += stored;
          }
          prop.opened = true;
        } else if (prop.kind === 'weapon_chest' || prop.kind === 'big_weapon_chest') {
          // Any unopened weapon chest left behind on exit counts toward Big Weapon Chest streak!
          state.chestSkipStreak += 1;
          prop.opened = true;
        }
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
      if (patienceIdx !== -1) {
        player.mutations.splice(patienceIdx, 1);
        patienceConsumedPlayers.add(player);
        state.pendingLevelUps += 1;
      }

      if (state.pendingLevelUps > 0 && openPendingLevelUp(state, rng)) {
        return 'selection_opened';
      }

      state.stats.areasCleared += 1;
      loadAreaIntoState(state, state.portal.targetArea, state.portal.nextLoop, populateFn);
      return 'area_loaded';
    }
    return 'none';
  }

  // 2. Check if portal should open on current floor
  if (state.portal.active || state.phase !== 'playing') {
    return 'none';
  }

  const hostileCount = countHostileEnemies(state);
  const bossAlive = Boolean(state.boss && !state.boss.defeated);
  if (bossAlive) return 'none';

  const anomalyThreshold =
    state.player.mutant === 'horror' && hasUltra(state.player, 'horror_b') && state.levelStartEnemyCount >= 4
      ? Math.max(1, Math.floor(state.levelStartEnemyCount * 0.25))
      : 0;

  const clearedByKills =
    hostileCount <= anomalyThreshold &&
    (state.levelStartEnemyCount > 0 || state.levelKills > 0 || Boolean(state.boss?.defeated));

  if (!clearedByKills) {
    return 'none';
  }

  // Position portal safely near last corpse or player
  const lastCorpse = state.corpses[state.corpses.length - 1];
  const anchorX = lastCorpse ? lastCorpse.x : state.player.x + 28;
  const anchorY = lastCorpse ? lastCorpse.y : state.player.y;
  const safe = findNearestFloor(state.map, anchorX, anchorY, 10);

  // If Horror Anomaly triggered early, consume remaining enemies into the portal (crediting kills & rads!)
  if (hostileCount > 0 && anomalyThreshold > 0) {
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i]!;
      if (!e.friendly && e.hp > 0 && e.aiState !== 'disguised') {
        state.stats.kills += 1;
        state.levelKills += 1;
        let totalRads = e.radDrop;
        if (state.crown === 'blood') totalRads = Math.max(0, Math.floor(totalRads * 0.65));
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

  const next = getNextAreaTransition(state.areaCode, state.loop);
  const carryingCursed = Boolean(state.player.weapons[0]?.cursed || state.player.weapons[1]?.cursed);
  const targetArea: AreaCode =
    state.areaCode === '3-3' && carryingCursed ? '4-?' : next.areaCode;

  state.portal.active = true;
  state.portal.x = safe.x;
  state.portal.y = safe.y;
  state.portal.timer = 0;
  state.portal.entered = false;
  state.portal.enterTicks = 0;
  state.portal.carved = false;
  state.portal.targetArea = targetArea;
  state.portal.nextLoop = next.loop;

  emitEvent(state, {
    type: 'portal_open',
    x: safe.x,
    y: safe.y,
    targetArea,
  });
  emitEvent(state, {
    type: 'sfx',
    sound: state.player.mutant === 'horror' && anomalyThreshold > 0 ? 'sndHorrorPortal' : 'sndPortalOpen',
    x: safe.x,
    y: safe.y,
  });
  return 'portal_opened';
}

export { AREAS };
