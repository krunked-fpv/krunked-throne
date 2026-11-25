import {
  TileType,
  type AmmoType,
  type AreaCode,
  type CrownId,
  type MutantId,
  type MutationId,
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
  };
}

function countHostileEnemies(state: SimState): number {
  let count = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (!e.friendly && e.hp > 0) count += 1;
  }
  return count;
}

function findSpawnTileAwayFrom(
  state: SimState,
  avoidX: number,
  avoidY: number,
  minDist: number,
  rng: SeededRng,
): { x: number; y: number } {
  const map = state.map;
  const minDistSq = minDist * minDist;
  for (let attempt = 0; attempt < 80; attempt++) {
    const tx = rng.int(3, map.width - 4);
    const ty = rng.int(3, map.height - 4);
    if (!isWalkableTile(getTile(map, tx, ty))) continue;
    const pos = tileToWorldCenter(tx, ty, map.tileSize);
    const dx = pos.x - avoidX;
    const dy = pos.y - avoidY;
    if (dx * dx + dy * dy >= minDistSq) {
      return pos;
    }
  }
  return findNearestFloor(map, avoidX + 48, avoidY, 12);
}

export function pickTierWeaponId(state: SimState, rng: SeededRng, bonusTier = 0): string {
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
  const pool = getWeaponsByTier(minTier, maxTier, allowCursed);
  if (pool.length === 0) return 'revolver';

  if (allowCursed && rng.chance(0.45)) {
    const cursedPool = pool.filter((w) => w.cursed);
    if (cursedPool.length > 0) return rng.pick(cursedPool).id;
  }
  return rng.pick(pool).id;
}

export function spawnLevelChests(state: SimState, rng: SeededRng): void {
  const player = state.player;
  const isBossArena = state.areaCode === '0-1';

  // 1. Weapon chest (converts to Big Weapon Chest if chestSkipStreak >= 1, or Ammo Chest with Crown of Love)
  if (!isBossArena) {
    const pos1 = findSpawnTileAwayFrom(state, state.map.spawnX, state.map.spawnY, 48, rng);
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
        sprite: 'sprAmmoChest',
        openSprite: 'sprAmmoChestOpen',
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
        sprite: 'sprWeaponChest',
        openSprite: 'sprWeaponChestOpen',
      });
    }

    // 2. Ammo chest
    const pos2 = findSpawnTileAwayFrom(state, state.map.spawnX, state.map.spawnY, 64, rng);
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
      sprite: 'sprAmmoChest',
      openSprite: 'sprAmmoChestOpen',
    });

    // 3. Rad canister (or IDPD Portal Strike canister for Rogue!)
    const pos3 = findSpawnTileAwayFrom(state, state.map.spawnX, state.map.spawnY, 72, rng);
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
        radsStored: 12 + state.loop * 8,
      });
    }

    // 4. Open Mind extra chest
    if (hasMutation(player, 'open_mind')) {
      const posExtra = findSpawnTileAwayFrom(state, state.map.spawnX, state.map.spawnY, 56, rng);
      const extraWeapon = rng.chance(0.5) && state.crown !== 'love';
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
        sprite: extraWeapon ? 'sprWeaponChest' : 'sprAmmoChest',
        openSprite: extraWeapon ? 'sprWeaponChestOpen' : 'sprAmmoChestOpen',
      });
    }

    // 5. Y.V. Ultra B (Back 2 Bizniz): extra Crib weapon chests
    if (player.mutant === 'yv' && hasUltra(player, 'yv_b')) {
      for (let c = 0; c < 2; c++) {
        const posCrib = findSpawnTileAwayFrom(state, state.map.spawnX, state.map.spawnY, 36, rng);
        state.props.push({
          id: allocEntityId(state),
          kind: 'weapon_chest',
          x: posCrib.x,
          y: posCrib.y,
          radius: 8,
          hp: 10,
          maxHp: 10,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: 'sprWeaponChest',
          openSprite: 'sprWeaponChestOpen',
        });
      }
    }
  }
}

export function openChest(state: SimState, prop: PropEntity, rng: SeededRng): boolean {
  if (prop.opened) return false;
  prop.opened = true;
  if (prop.openSprite) {
    prop.sprite = prop.openSprite;
  }

  const player = state.player;

  // Crown of Hatred: opening any chest damages player by 1 and yields 14 rads
  if (state.crown === 'hatred') {
    applyDamageToPlayer(state, 1, 'CROWN OF HATRED', 'sprCrown6Idle', rng, {
      ignoreIframes: true,
    });
    for (let i = 0; i < 4; i++) {
      spawnPickup(state, 'rad', prop.x, prop.y, { value: 1 }, rng);
    }
    spawnPickup(state, 'big_rad', prop.x, prop.y, { value: 10 }, rng);
  }

  if (prop.kind === 'weapon_chest') {
    state.chestSkipStreak = 0;
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const wepId = pickTierWeaponId(state, rng);
      const def = getWeaponDef(wepId);
      spawnPickup(
        state,
        'weapon',
        prop.x,
        prop.y,
        { weaponId: def.id, cursed: def.cursed },
        rng,
      );
    }
    emitEvent(state, { type: 'sfx', sound: 'sndWeaponChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'big_weapon_chest') {
    state.chestSkipStreak = 0;
    const count = player.mutant === 'steroids' && hasUltra(player, 'steroids_a') ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const wepId = pickTierWeaponId(state, rng, 1);
      const def = getWeaponDef(wepId);
      spawnPickup(
        state,
        'weapon',
        prop.x,
        prop.y,
        { weaponId: def.id, cursed: def.cursed },
        rng,
      );
    }
    emitEvent(state, { type: 'sfx', sound: 'sndWeaponChest', x: prop.x, y: prop.y });
    return true;
  }

  if (prop.kind === 'ammo_chest') {
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
    } else if (state.crown === 'life' && player.hp < player.maxHp) {
      healPlayer(state, hasMutation(player, 'second_stomach') ? 8 : 4);
      emitEvent(state, { type: 'sfx', sound: 'sndHealthChestBig', x: prop.x, y: prop.y });
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
    const cap = hasUltra(player, 'rogue_a') ? 5 : 3;
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

export function givePlayerWeapon(
  state: SimState,
  weaponId: string,
  slot?: 0 | 1,
  dropPrevious: boolean = true,
): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;

  const player = state.player;
  let targetSlot: 0 | 1;

  if (slot !== undefined) {
    targetSlot = slot;
  } else if (player.weapons[1] === null) {
    targetSlot = 1;
  } else {
    targetSlot = player.activeSlot;
    // Do not drop a cursed active weapon automatically if secondary is uncursed
    const cur = player.weapons[targetSlot];
    const alt = player.weapons[targetSlot === 0 ? 1 : 0];
    if (cur?.cursed && alt && !alt.cursed) {
      targetSlot = targetSlot === 0 ? 1 : 0;
    } else if (cur?.cursed && alt?.cursed) {
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

  const prev = player.weapons[targetSlot];
  if (prev && dropPrevious) {
    spawnPickup(state, 'weapon', player.x, player.y, {
      weaponId: prev.weaponId,
      cursed: prev.cursed,
      vx: 0,
      vy: 0,
    });
  }

  player.weapons[targetSlot] = createWeaponSlot(def.id, def.cursed);
  if (slot === undefined && targetSlot === 1 && prev === null) {
    player.activeSlot = 1;
  }

  // Picking up a weapon grants starter ammo of that type (or HP with Crown of Protection!)
  if (state.crown === 'protection') {
    healPlayer(state, hasMutation(player, 'second_stomach') ? 4 : 2);
  } else if (def.ammoType !== 'melee') {
    addAmmoToPool(state, def.ammoType, Math.max(2, Math.round(AMMO_PICKUP_AMOUNT[def.ammoType] * 0.5)));
  }

  emitEvent(state, { type: 'sfx', sound: 'sndWeaponPickup', x: player.x, y: player.y });
  emitEvent(state, {
    type: 'pickup_text',
    x: player.x,
    y: player.y - 12,
    text: def.name,
    color: def.golden ? '#ffe066' : def.cursed ? '#d966ff' : '#ffffff',
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

  const eligible = MUTATION_IDS.filter((id) => {
    if (owned.has(id)) return false;
    if (id === 'heavy_heart' && weaponMutCount < 3) return false;
    return true;
  });

  const shuffled = rng.shuffle([...eligible]);
  const cardCount =
    state.crown === 'destiny' ? 1 : player.mutant === 'horror' ? 5 : 4;
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

  if (!player.mutations.includes(id)) {
    player.mutations.push(id);
  }

  switch (id) {
    case 'rhino_skin':
      player.maxHp += 4;
      player.hp = Math.min(player.maxHp, player.hp + 4);
      break;
    case 'back_muscle':
      player.ammoMax = { ...BACK_MUSCLE_AMMO_MAX };
      break;
    case 'last_wish':
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
    sound: 'sndMutAppear',
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
      player.maxHp = Math.max(1, Math.floor(player.maxHp / 2));
      player.hp = Math.min(player.hp, player.maxHp);
      state.pendingLevelUps += 3;
      break;
    case 'fish_b':
      player.gunWarrantTicks = 210;
      break;
    case 'rogue_a':
      player.portalStrikes = Math.min(5, player.portalStrikes + 2);
      break;
    default:
      break;
  }

  emitEvent(state, {
    type: 'sfx',
    sound: 'sndLevelUltra',
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

  // Strong Spirit recharge when entering new area at full HP
  if (player.strongSpiritRecharging && player.hp >= player.maxHp) {
    player.strongSpiritReady = true;
    player.strongSpiritRecharging = false;
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

  // Apply Scarier Face (-20% enemy HP) & Crown of Luck (chance enemy spawns at 1 HP)
  const scarier = hasMutation(player, 'scarier_face');
  const luck = state.crown === 'luck';
  if (scarier || luck) {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (e.friendly) continue;
      if (scarier) {
        e.maxHp = Math.max(1, Math.round(e.maxHp * 0.8));
        e.hp = Math.min(e.hp, e.maxHp);
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
  emitEvent(state, {
    type: 'music',
    track: areaDef.musicTrack,
    ambience: areaDef.ambienceTrack,
    boss: areaCode === '7-3' || areaCode === '0-1',
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
      ammo: {
        melee: 0,
        bullet: 96,
        shell: 16,
        bolt: 14,
        explosive: 10,
        energy: 20,
      },
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
      headlessTicks: 0,
      headlessDeaths: 0,
      gunWarrantTicks: 0,
      portalStrikes: opts.mutant === 'rogue' ? 3 : 0,
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
      // Consume Patience deferred mutation on portal transition
      const patienceIdx = state.player.mutations.indexOf('patience');
      if (patienceIdx !== -1) {
        state.player.mutations.splice(patienceIdx, 1);
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

  // If Anomaly triggered early, clear remaining minor enemies into the portal
  if (hostileCount > 0 && anomalyThreshold > 0) {
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      if (!state.enemies[i]!.friendly) {
        state.enemies.splice(i, 1);
      }
    }
  }

  // Position portal safely near last corpse or player
  const lastCorpse = state.corpses[state.corpses.length - 1];
  const anchorX = lastCorpse ? lastCorpse.x : state.player.x + 28;
  const anchorY = lastCorpse ? lastCorpse.y : state.player.y;
  const safe = findNearestFloor(state.map, anchorX, anchorY, 10);

  const next = getNextAreaTransition(state.areaCode, state.loop);
  state.portal.active = true;
  state.portal.x = safe.x;
  state.portal.y = safe.y;
  state.portal.timer = 0;
  state.portal.entered = false;
  state.portal.enterTicks = 0;
  state.portal.carved = false;
  state.portal.targetArea = next.areaCode;
  state.portal.nextLoop = next.loop;

  emitEvent(state, {
    type: 'portal_open',
    x: safe.x,
    y: safe.y,
    targetArea: next.areaCode,
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
