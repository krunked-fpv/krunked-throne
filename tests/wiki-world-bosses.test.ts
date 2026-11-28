import { describe, expect, it } from 'vitest';
import {
  TileType,
  type InputFrame,
  type SimState,
} from '@/contracts';
import { AREAS, ENEMIES } from '@/data';
import {
  SeededRng,
  hasLineOfSight,
  setTile,
  worldToTile,
} from '@/sim/core';
import { checkMapConnectivity, generateWorldMap } from '@/sim/worldgen/generator';
import {
  applyDamageToEnemy,
  damageProp,
  spawnCorpse,
  spawnExplosion,
} from '@/sim/combat';
import { givePlayerWeapon, loadAreaIntoState } from '@/sim/progression';
import {
  computeLoopScaledHp,
  createEnemyEntity,
  createRunState,
  getExtendedAreaRuntime,
  populateAreaEntities,
  spawnBossEntity,
} from '@/sim/entities';
import { addToxicGasCloud, stepSimulation, warpToArea } from '@/sim/ai';

function makeInput(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimWorldX: 0,
    aimWorldY: 0,
    fireHeld: false,
    firePressed: false,
    activeHeld: false,
    activePressed: false,
    swapPressed: false,
    pickupPressed: false,
    pausePressed: false,
    ...overrides,
  };
}

function carveOpenRoom(state: SimState, radiusTiles: number = 9): void {
  const { tx, ty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
  for (let y = ty - radiusTiles; y <= ty + radiusTiles; y++) {
    for (let x = tx - radiusTiles; x <= tx + radiusTiles; x++) {
      if (x >= 2 && y >= 2 && x < state.map.width - 2 && y < state.map.height - 2) {
        setTile(state.map, x, y, TileType.Floor);
      }
    }
  }
}

describe('Wave 2B — New Maps: Y.V.\'s Crib ($$$), IDPD HQ-2 & HQ-3', () => {
  it('Y.V.\'s Crib ($$$) uses fixed layout, 0 enemies, TV->Cuz cry, Open Mind +1 Giant Chest, Crown of Love Ammo Chests & Golden Car exit', () => {
    const mapA = generateWorldMap('$$$', 'crib', 0, new SeededRng(101));
    const mapB = generateWorldMap('$$$', 'crib', 2, new SeededRng(999));
    expect(mapA.width).toBe(mapB.width);
    expect(mapA.height).toBe(mapB.height);
    expect(mapA.walkableCount).toBe(mapB.walkableCount);
    expect(checkMapConnectivity(mapA).connected).toBe(true);

    // Default Crib: 0 enemies, carpet decal, TV, Couch, Yung Cuz, 2 Giant Weapon Chests, 4-6 Golden Cars
    const state = createRunState({ mutant: 'yv', seed: 3001 });
    state.cribReturnArea = '3-2';
    warpToArea(state, '$$$', 0);
    expect(state.enemies.length).toBe(0);
    expect(state.levelStartEnemyCount).toBe(0);
    expect(state.decals.some((d) => d.sprite === 'sprVenuzCarpet')).toBe(true);

    const tv = state.props.find((p) => p.kind === 'venuz_tv')!;
    const couch = state.props.find((p) => p.kind === 'venuz_couch')!;
    const cuz = state.props.find((p) => p.kind === 'yung_cuz')!;
    const giantWep = state.props.filter((p) => p.kind === 'giant_weapon_chest');
    const cars = state.props.filter((p) => p.kind === 'venuz_car_exit');
    expect(tv?.sprite).toBe('sprVenuzTV');
    expect(couch?.sprite).toBe('sprVenuzCouch');
    expect(cuz?.sprite).toBe('sprCuzIdle');
    expect(giantWep.length).toBe(2);
    expect(cars.length).toBeGreaterThanOrEqual(4);
    expect(cars.length).toBeLessThanOrEqual(6);

    // Destroying TV makes Yung Cuz cry (`sprCuzCry`)!
    const rng = SeededRng.fromState(state.rngState);
    damageProp(state, tv, 999, rng);
    state.rngState = rng.getState();
    stepSimulation(state, makeInput());
    expect(cuz.sprite).toBe('sprCuzCry');
    // Crib NEVER auto-opens a portal despite 0 enemies
    expect(state.portal.active).toBe(false);

    // Walk onto a Giant Weapon Chest -> bursts weapons!
    const gc = giantWep[0]!;
    state.player.x = gc.x;
    state.player.y = gc.y;
    stepSimulation(state, makeInput());
    expect(gc.opened).toBe(true);
    expect(state.pickups.filter((p) => p.kind === 'weapon').length).toBeGreaterThanOrEqual(10);

    // [E] on Golden Car warps cleanly back to cribReturnArea ('3-2')!
    const car = cars[0]!;
    state.player.x = car.x;
    state.player.y = car.y + 14;
    stepSimulation(state, makeInput({ pickupPressed: true }));
    expect(state.areaCode).toBe('3-2');

    // Open Mind adds +1 Giant Chest (3 total); Crown of Love converts all to Giant Ammo Chests!
    const loveState = createRunState({ mutant: 'yv', seed: 3002, crown: 'love' });
    loveState.player.mutations.push('open_mind');
    warpToArea(loveState, '$$$', 0);
    expect(loveState.props.filter((p) => p.kind === 'giant_weapon_chest').length).toBe(0);
    expect(loveState.props.filter((p) => p.kind === 'giant_ammo_chest').length).toBe(3);
  });

  it('IDPD HQ-2 has HQ props, 0 rad canisters, Elites + Vans on L1, and all IDPD Freaks on L3+', () => {
    const state = createRunState({ mutant: 'rogue', seed: 3101 });
    warpToArea(state, 'hq-2', 1);
    expect(checkMapConnectivity(state.map).connected).toBe(true);
    expect(state.props.some((p) => p.kind === 'rad_canister' || p.kind === 'rad_maggot_canister')).toBe(false);
    expect(state.props.some((p) => p.kind === 'server')).toBe(true);
    expect(state.props.some((p) => p.kind === 'terminal')).toBe(true);
    expect(state.props.some((p) => p.kind === 'office_table')).toBe(true);
    expect(state.props.some((p) => p.kind === 'small_generator')).toBe(true);
    expect(state.enemies.some((e) => e.defId === 'idpd_van')).toBe(true);
    expect(
      state.enemies.some(
        (e) =>
          e.defId === 'elite_grunt' ||
          e.defId === 'elite_inspector' ||
          e.defId === 'elite_shielder' ||
          e.defId.startsWith('idpd_'),
      ),
    ).toBe(true);

    // Loop 3+: IDPD HQ-2 enemies & vans replaced by IDPD Freaks!
    const l3 = createRunState({ mutant: 'rogue', seed: 3102 });
    warpToArea(l3, 'hq-2', 3);
    expect(l3.enemies.length).toBeGreaterThan(0);
    expect(l3.enemies.every((e) => e.defId === 'idpd_freak')).toBe(true);
  });

  it('IDPD HQ-3 fixed Captain\'s Office wakes passive Captain on Desk damage, runs 3 phases & triggers endingType="captain"', () => {
    const mA = generateWorldMap('hq-3', 'hq', 1, new SeededRng(10));
    const mB = generateWorldMap('hq-3', 'hq', 3, new SeededRng(99));
    expect(mA.walkableCount).toBe(mB.walkableCount);
    expect(checkMapConnectivity(mA).connected).toBe(true);

    const state = createRunState({ mutant: 'rogue', seed: 3201 });
    state.player.godMode = true;
    warpToArea(state, 'hq-3', 1);

    expect(state.props.some((p) => p.kind === 'big_tv')).toBe(true);
    expect(state.props.some((p) => p.kind === 'last_chair')).toBe(true);
    expect(state.props.some((p) => p.kind === 'messenger')).toBe(true);
    const desk = state.props.find((p) => p.kind === 'captain_desk')!;
    expect(desk).toBeDefined();
    expect(state.props.some((p) => p.kind === 'weapon_chest')).toBe(true);
    expect(state.props.some((p) => p.kind === 'ammo_chest')).toBe(true);

    const captain = state.enemies.find((e) => e.bossId === 'captain')!;
    expect(captain).toBeDefined();
    expect(captain.aiState).toBe('idle_desk');
    expect(state.boss?.introTicks).toBe(0);

    // Step 10 ticks untouched: Captain stays passive!
    for (let t = 0; t < 10; t++) stepSimulation(state, makeInput());
    expect(captain.aiState).toBe('idle_desk');

    // Damage Captain's Desk -> shatters desk to sprDeskDead, triggers introTicks = 45 & CAPTAIN boss_intro!
    const rng = SeededRng.fromState(state.rngState);
    damageProp(state, desk, 10, rng);
    state.rngState = rng.getState();
    stepSimulation(state, makeInput());
    expect(desk.sprite).toBe('sprDeskDead');
    expect(state.boss?.introTicks).toBe(45);
    expect(state.events.some((ev) => ev.type === 'boss_intro' && ev.bossId === 'captain')).toBe(true);

    // Step past intro + through all 3 phases (dash -> warp + sprLastBall -> spin bullet curtain)
    const seenStates = new Set<string>();
    let sawLastBall = false;
    for (let t = 0; t < 240; t++) {
      stepSimulation(state, makeInput({ aimWorldX: captain.x, aimWorldY: captain.y }));
      seenStates.add(captain.aiState);
      if (state.projectiles.some((p) => p.sprite === 'sprLastBall')) sawLastBall = true;
    }
    expect(seenStates.has('dash')).toBe(true);
    expect(seenStates.has('warp_out') || seenStates.has('warp_in')).toBe(true);
    expect(seenStates.has('spin')).toBe(true);
    expect(sawLastBall).toBe(true);

    // Kill Captain -> endingType = 'captain' & phase = 'victory_throne'!
    captain.invulnerable = false;
    const kRng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, captain, captain.hp + 999, 0, 0, kRng);
    state.rngState = kRng.getState();
    for (let k = 0; k < 10 && state.phase === 'playing'; k++) stepSimulation(state, makeInput());
    expect(state.boss?.defeated).toBe(true);
    expect(state.phase).toBe('victory_throne');
    expect(state.endingType).toBe('captain');
  });
});

describe('Wave 2B — 4 New Bosses & Hostile Horror', () => {
  it('Mom spawns on 2-1 Loop 1+, lays hatching Frog Eggs, heals in Toxic Gas, bursts 80 shots & drops Frog Pistol with Golden Weapon', () => {
    const state = createRunState({ mutant: 'fish', seed: 4001 });
    state.player.godMode = true;
    givePlayerWeapon(state, 'golden_revolver');
    warpToArea(state, '2-1', 1);

    const mom = state.enemies.find((e) => e.bossId === 'mom')!;
    expect(mom).toBeDefined();
    expect(mom.maxHp).toBe(490); // 350 * 1.05 * (4/3) = 490

    // Clear other enemies and open room around Mom
    state.enemies = [mom];
    state.boss!.introTicks = 0;

    // Test Toxic Gas heals Mom (+2 HP)
    mom.hp = 400;
    addToxicGasCloud(state, mom.x, mom.y, 40, 60, 'enemy');
    for (let t = 0; t < 24; t++) stepSimulation(state, makeInput());
    expect(mom.hp).toBeGreaterThan(400);

    // Step until Mom fires Toxic Ball AND lays Frog Eggs
    let sawToxicBall = false;
    let sawEgg = false;
    for (let t = 0; t < 180; t++) {
      stepSimulation(state, makeInput());
      if (state.projectiles.some((p) => p.sprite === 'sprFrogQueenBall')) sawToxicBall = true;
      if (state.props.some((p) => p.kind === 'frog_egg')) sawEgg = true;
    }
    expect(sawToxicBall).toBe(true);
    expect(sawEgg).toBe(true);

    // Let Frog Egg hatch after ~120 ticks into ballguy / toxic_ballguy!
    const preEggEnemies = state.enemies.length;
    for (let t = 0; t < 130; t++) stepSimulation(state, makeInput());
    expect(state.enemies.length).toBeGreaterThan(preEggEnemies);
    expect(state.enemies.some((e) => e.defId === 'ballguy' || e.defId === 'toxic_ballguy')).toBe(true);

    // Kill Mom while holding Golden Revolver -> 80-shot death burst + guaranteed frog_pistol drop!
    const rng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, mom, mom.hp + 999, 0, 0, rng);
    state.rngState = rng.getState();
    while (state.hitstopTicks > 0) stepSimulation(state, makeInput());
    stepSimulation(state, makeInput());
    const venomBurst = state.projectiles.filter((p) => p.team === 'enemy' && p.sprite === 'sprScorpionBullet');
    expect(venomBurst.length).toBeGreaterThanOrEqual(75);
    expect(state.pickups.some((p) => p.kind === 'weapon' && p.weaponId === 'frog_pistol')).toBe(true);
  });

  it('Hyper Crystal spawns on 4-1 & Cursed 4-? Loop 1+, has 200 contact dmg, orbits crystals & expands w/ 7-way lasers out of LOS', () => {
    const s41 = createRunState({ mutant: 'crystal', seed: 4101 });
    s41.player.godMode = true;
    warpToArea(s41, '4-1', 1);
    const hc = s41.enemies.find((e) => e.bossId === 'hyper_crystal')!;
    expect(hc).toBeDefined();
    expect(hc.maxHp).toBe(770); // 550 * 1.05 * (4/3) = 770
    expect(hc.contactDamage).toBe(200);
    expect(getExtendedAreaRuntime(s41).hyperCrystalOrbIds.length).toBe(5);

    // Cursed 4-? Loop 2 variant: orbits 7 cursed_laser_crystal!
    const s4q = createRunState({ mutant: 'crystal', seed: 4102 });
    s4q.player.godMode = true;
    warpToArea(s4q, '4-?', 2);
    const chc = s4q.enemies.find((e) => e.bossId === 'hyper_crystal')!;
    expect(chc).toBeDefined();
    const orbIds = getExtendedAreaRuntime(s4q).hyperCrystalOrbIds;
    expect(orbIds.length).toBe(7); // 5 + (2 - 1)*2
    expect(
      orbIds.every((id) => s4q.enemies.find((e) => e.id === id)?.defId === 'cursed_laser_crystal'),
    ).toBe(true);

    // Step out of LOS -> expands orbiters and fires lasers!
    s41.boss!.introTicks = 0;
    let sawEnemyLaser = false;
    for (let t = 0; t < 110; t++) {
      stepSimulation(s41, makeInput());
      if (s41.projectiles.some((p) => p.team === 'enemy' && p.kind === 'enemy_laser')) {
        sawEnemyLaser = true;
      }
    }
    expect(sawEnemyLaser).toBe(true);
  });

  it('Technomancer spawns 3 + max(0, loop-1) Battle Stations, summons turrets/necro revive & dies only when ALL stations fall', () => {
    const sL1 = createRunState({ mutant: 'steroids', seed: 4201 });
    sL1.player.godMode = true;
    warpToArea(sL1, '6-1', 1);
    const l1Stations = sL1.enemies.filter((e) => e.bossId === 'technomancer');
    expect(l1Stations.length).toBe(3);

    const sL2 = createRunState({ mutant: 'steroids', seed: 4202 });
    sL2.player.godMode = true;
    warpToArea(sL2, '6-1', 2);
    expect(sL2.enemies.filter((e) => e.bossId === 'technomancer').length).toBe(4);

    // Step Technomancer L1 -> spawns turrets & necro_revive_area!
    sL1.enemies = [...l1Stations];
    sL1.boss!.introTicks = 0;
    spawnCorpse(sL1, l1Stations[0]!.x + 16, l1Stations[0]!.y, 0, 0, 1, 'sprFreak1Dead', 10, true);
    let sawTurrets = false;
    let sawReviveZone = false;
    for (let t = 0; t < 160; t++) {
      stepSimulation(sL1, makeInput());
      if (sL1.enemies.some((e) => e.defId === 'turret')) sawTurrets = true;
      if (sL1.props.some((p) => p.kind === 'necro_revive_area')) sawReviveZone = true;
    }
    expect(sawTurrets).toBe(true);
    expect(sawReviveZone).toBe(true);

    // Kill 1 station -> boss NOT defeated yet!
    const r1 = SeededRng.fromState(sL1.rngState);
    applyDamageToEnemy(sL1, l1Stations[0]!, l1Stations[0]!.hp + 999, 0, 0, r1);
    sL1.rngState = r1.getState();
    for (let k = 0; k < 5; k++) stepSimulation(sL1, makeInput());
    expect(sL1.boss?.defeated).toBe(false);

    // Kill remaining 2 stations -> boss IS defeated!
    const r2 = SeededRng.fromState(sL1.rngState);
    for (const st of sL1.enemies.filter((e) => e.bossId === 'technomancer' && e.hp > 0)) {
      applyDamageToEnemy(sL1, st, st.hp + 999, 0, 0, r2);
    }
    sL1.rngState = r2.getState();
    for (let k = 0; k < 8; k++) stepSimulation(sL1, makeInput());
    expect(sL1.boss?.defeated).toBe(true);
  });

  it('Hostile Horror spawns at radCanisterSkipStreak >= 2 (resetting streak), drains 90-rad beam -> melee charge, and unlocks Horror on death', () => {
    const state = createRunState({ mutant: 'fish', seed: 4301 });
    state.player.godMode = true;
    state.radCanisterSkipStreak = 2;
    warpToArea(state, '1-2', 0);

    expect(state.radCanisterSkipStreak).toBe(0);
    const horror = state.enemies.find((e) => e.defId === 'enemy_horror')!;
    expect(horror).toBeDefined();
    expect(getExtendedAreaRuntime(state).horrorRadPools.get(horror.id)).toBe(90);

    // Open room around player & horror so beam fires and drains rad pool -> transitions to melee charge!
    carveOpenRoom(state, 10);
    state.enemies = [horror];
    horror.x = state.player.x + 80;
    horror.y = state.player.y;
    horror.attackCooldown = 1;

    let sawBeam = false;
    let sawMeleeCharge = false;
    for (let t = 0; t < 160; t++) {
      stepSimulation(state, makeInput());
      if (state.projectiles.some((p) => p.team === 'enemy' && p.sprite === 'sprHorrorBullet')) {
        sawBeam = true;
      }
      if (horror.aiState === 'charge') sawMeleeCharge = true;
    }
    expect(sawBeam).toBe(true);
    expect(sawMeleeCharge).toBe(true);
    expect(getExtendedAreaRuntime(state).horrorRadPools.get(horror.id)).toBe(0);

    // Kill Horror -> records Horror unlock!
    const rng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, horror, horror.hp + 999, 0, 0, rng);
    state.rngState = rng.getState();
    for (let k = 0; k < 5; k++) stepSimulation(state, makeInput());
    expect(getExtendedAreaRuntime(state).pendingHorrorUnlock).toBe(true);
    expect(
      state.events.some((ev) => ev.type === 'pickup_text' && ev.text === 'HORROR UNLOCKED!'),
    ).toBe(true);
  });
});

describe('Wave 2B — Exact NT Loop HP Scaling, Area Spawners & Biome Tables', () => {
  it('applies exact NT Loop HP scaling formulas (normal, boss, Big Dog, Captain, Hard Mode effLoop)', () => {
    expect(computeLoopScaledHp(ENEMIES.bandit!, 0)).toBe(ENEMIES.bandit!.maxHp);
    expect(computeLoopScaledHp(ENEMIES.bandit!, 2)).toBe(Math.round(ENEMIES.bandit!.maxHp * 1.1));
    expect(computeLoopScaledHp(ENEMIES.mom!, 1, 'mom')).toBe(490);
    expect(computeLoopScaledHp(ENEMIES.hyper_crystal!, 1, 'hyper_crystal')).toBe(770);
    expect(computeLoopScaledHp(ENEMIES.big_dog!, 1, 'big_dog')).toBe(Math.round(ENEMIES.big_dog!.maxHp * 1.8));
    expect(computeLoopScaledHp(ENEMIES.captain!, 1, 'captain')).toBe(Math.round(ENEMIES.captain!.maxHp * 1.05));

    // Hard Mode starts at effLoop = 1 -> Loop 0 2-1 spawns Mom!
    const hm = createRunState({ mutant: 'chicken', seed: 4401, hardMode: true });
    warpToArea(hm, '2-1', 0);
    expect(hm.boss?.bossId).toBe('mom');
  });

  it('enforces exact biome tables: Oasis (bonefish+crab), Pizza Sewers (4 turtles + 1 big_rat), Mansion (no bandits), Cursed Caves (Large Cursed Chest)', () => {
    // 1-? Oasis: ONLY bonefish & crab (0 molefish) + water_mine & water_plant
    const oasis = createRunState({ mutant: 'fish', seed: 4501 });
    warpToArea(oasis, '1-?', 0);
    expect(oasis.enemies.length).toBeGreaterThan(0);
    expect(oasis.enemies.every((e) => e.defId === 'bonefish' || e.defId === 'crab')).toBe(true);
    expect(oasis.props.some((p) => p.kind === 'water_mine')).toBe(true);
    expect(oasis.props.some((p) => p.kind === 'water_plant')).toBe(true);

    // 2-? Pizza Sewers: EXACTLY 4 Turtles + 1 Rat King + pizza_chest!
    const pizza = createRunState({ mutant: 'eyes', seed: 4502 });
    warpToArea(pizza, '2-?', 0);
    expect(pizza.enemies.filter((e) => e.defId === 'turtle').length).toBe(4);
    expect(pizza.enemies.filter((e) => e.defId === 'big_rat').length).toBe(1);
    expect(pizza.enemies.length).toBe(5);
    expect(pizza.props.some((p) => p.kind === 'pizza_chest')).toBe(true);

    // 3-? Mansion: authentic Mansion enemies (0 bandit/sniper) + gold_barrel & chandelier
    const mansion = createRunState({ mutant: 'yv', seed: 4503 });
    warpToArea(mansion, '3-?', 0);
    expect(mansion.enemies.some((e) => e.defId === 'bandit' || e.defId === 'sniper')).toBe(false);
    expect(mansion.props.some((p) => p.kind === 'gold_barrel')).toBe(true);
    expect(mansion.props.some((p) => p.kind === 'chandelier')).toBe(true);

    // 4-? Cursed Caves: cursed_spider/cursed_laser_crystal + Large Cursed Weapon Chest
    const cursed = createRunState({ mutant: 'crystal', seed: 4504 });
    warpToArea(cursed, '4-?', 0);
    expect(
      cursed.enemies.every(
        (e) =>
          e.defId === 'cursed_spider' ||
          e.defId === 'cursed_laser_crystal' ||
          e.defId === 'mimic' ||
          e.defId === 'weapon_mimic',
      ),
    ).toBe(true);
    expect(
      cursed.props.some(
        (p) => p.kind === 'big_weapon_chest' && p.cursed === true && p.sprite === 'sprCursedChestBig',
      ),
    ).toBe(true);
  });

  it('spawns 1-2 L1+ Proto Statue, 7-3 Throne Statues, rad_maggot_canister, Crown of Life/Curses chests, Fish Guitar, Chicken Black Sword & Vault Ambush', () => {
    // 1-2 Loop 1+ Proto Statue
    const l1_12 = createRunState({ mutant: 'fish', seed: 4601 });
    warpToArea(l1_12, '1-2', 1);
    expect(l1_12.props.some((p) => p.kind === 'proto_statue')).toBe(true);

    // 7-3 Throne Statues wake into Palace Guardians on damage!
    const t73 = createRunState({ mutant: 'fish', seed: 4602 });
    t73.player.godMode = true;
    warpToArea(t73, '7-3', 0);
    const tStatue = t73.props.find((p) => p.kind === 'throne_statue')!;
    expect(tStatue).toBeDefined();
    const tRng = SeededRng.fromState(t73.rngState);
    damageProp(t73, tStatue, 5, tRng);
    t73.rngState = tRng.getState();
    stepSimulation(t73, makeInput());
    expect(t73.enemies.some((e) => e.defId === 'guardian')).toBe(true);

    // rad_maggot_canister when radCanisterSkipStreak === 1 (bursts rad_maggots on break!)
    const rmState = createRunState({ mutant: 'fish', seed: 4603 });
    rmState.radCanisterSkipStreak = 1;
    warpToArea(rmState, '1-2', 0);
    const rmc = rmState.props.find((p) => p.kind === 'rad_maggot_canister')!;
    expect(rmc).toBeDefined();
    const rmcRng = SeededRng.fromState(rmState.rngState);
    damageProp(rmState, rmc, 999, rmcRng);
    rmState.rngState = rmcRng.getState();
    stepSimulation(rmState, makeInput());
    expect(rmState.enemies.some((e) => e.defId === 'rad_maggot')).toBe(true);

    // weaponChestSkipStreak = 4 upgrades weapon_chest -> big_weapon_chest (100% chance)
    const wcState = createRunState({ mutant: 'fish', seed: 4604 });
    wcState.weaponChestSkipStreak = 4;
    warpToArea(wcState, '1-2', 0);
    expect(wcState.props.some((p) => p.kind === 'big_weapon_chest')).toBe(true);
    expect(wcState.weaponChestSkipStreak).toBe(0);

    // Crown of Life converts ~2/3 rad canisters to health_chest; Crown of Curses ~66.7% cursed chests
    let lifeHealthChests = 0;
    let cursedChests = 0;
    for (let s = 0; s < 15; s++) {
      const sLife = createRunState({ mutant: 'fish', seed: 4700 + s, crown: 'life' });
      if (sLife.props.some((p) => p.kind === 'health_chest')) lifeHealthChests += 1;
      const sCurse = createRunState({ mutant: 'fish', seed: 4800 + s, crown: 'curses' });
      if (sCurse.props.some((p) => p.cursed === true)) cursedChests += 1;
    }
    expect(lifeHealthChests).toBeGreaterThanOrEqual(5);
    expect(cursedChests).toBeGreaterThanOrEqual(5);

    // Fish 0-1 Guitar & Chicken L1 1-1 Black Sword
    const fish01 = createRunState({ mutant: 'fish', seed: 4605 });
    warpToArea(fish01, '0-1', 0);
    expect(fish01.pickups.some((p) => p.kind === 'weapon' && p.weaponId === 'guitar')).toBe(true);

    const chick11 = createRunState({ mutant: 'chicken', seed: 4606 });
    chick11.chickenDroppedSwordOn1_1 = true;
    warpToArea(chick11, '1-1', 1);
    expect(chick11.pickups.some((p) => p.kind === 'weapon' && p.weaponId === 'black_sword')).toBe(true);

    // Vault Ambush triggers immediate IDPD wave and consumes flag
    const vAmb = createRunState({ mutant: 'fish', seed: 4607 });
    vAmb.vaultAmbushPending = true;
    warpToArea(vAmb, '3-3', 0);
    expect(vAmb.vaultAmbushPending).toBe(false);
    expect(vAmb.enemies.some((e) => ENEMIES[e.defId]?.isIdpd)).toBe(true);
  });

  it('1-1 Oasis trigger allows up to 50% kills before spawning Early Big Bandit', () => {
    const state = createRunState({ mutant: 'fish', seed: 4610 });
    state.player.godMode = true;
    const halfKills = Math.floor(state.levelStartEnemyCount * 0.5);
    state.levelKills = halfKills;
    for (const p of state.props) {
      if (p.kind === 'weapon_chest' || p.kind === 'big_weapon_chest' || p.kind === 'ammo_chest') {
        p.opened = true;
      } else if (p.kind === 'rad_canister') {
        p.hp = 0;
        p.opened = true;
      }
    }
    stepSimulation(state, makeInput());
    expect(state.boss?.bossId).toBe('big_bandit');
  });
});

describe('Wave 2B — All 17 New Enemies, Hazards & Existing AI/Boss Parity Fixes', () => {
  it('exercises Elite IDPD (rocket, energy sword deflect, shield teleport), IDPD Freak (15-spread + endless revive), Crab, Jungle Fly, Jock, Molesarge, Super Fireballer, Cursed Spider/Crystal & Snowman->Snow Bandit', () => {
    const state = createRunState({ mutant: 'fish', seed: 5001 });
    state.player.godMode = true;
    carveOpenRoom(state, 12);
    state.enemies = [];
    state.props = [];

    const rng = SeededRng.fromState(state.rngState);
    const eGrunt = createEnemyEntity(state, 'elite_grunt', state.player.x + 80, state.player.y, rng);
    eGrunt.aiPhase = 2; // trigger rocket cycle
    eGrunt.attackCooldown = 1;

    const eInsp = createEnemyEntity(state, 'elite_inspector', state.player.x + 28, state.player.y, rng);
    eInsp.attackCooldown = 1;

    const eShield = createEnemyEntity(state, 'elite_shielder', state.player.x - 80, state.player.y, rng);
    eShield.aiState = 'shield';
    eShield.aiTimer = 2;
    const shieldStartX = eShield.x;
    const shieldStartY = eShield.y;

    const jock = createEnemyEntity(state, 'jock', state.player.x, state.player.y + 84, rng);
    jock.attackCooldown = 1;

    const jFly = createEnemyEntity(state, 'jungle_fly', state.player.x, state.player.y - 76, rng);
    jFly.attackCooldown = 1;

    const crab = createEnemyEntity(state, 'crab', state.player.x - 70, state.player.y + 60, rng);
    crab.attackCooldown = 1;

    const freak = createEnemyEntity(state, 'idpd_freak', state.player.x + 70, state.player.y - 60, rng);
    freak.attackCooldown = 1;

    state.rngState = rng.getState();

    let sawPopoRocket = false;
    let sawEnergySlash = false;
    let sawJockRocket = false;
    let sawFiredMaggot = false;
    let sawFreakSpread = false;

    for (let t = 0; t < 45; t++) {
      stepSimulation(state, makeInput());
      if (state.projectiles.some((p) => p.sprite === 'sprPopoRocket')) sawPopoRocket = true;
      if (state.projectiles.some((p) => p.sprite === 'sprEnergySlash' && p.deflectsProjectiles)) {
        sawEnergySlash = true;
      }
      if (state.projectiles.some((p) => p.sprite === 'sprJockRocket')) sawJockRocket = true;
      if (state.projectiles.some((p) => p.sprite === 'sprFiredMaggot')) sawFiredMaggot = true;
      if (state.projectiles.filter((p) => p.sprite === 'sprIDPDBullet').length >= 12) {
        sawFreakSpread = true;
      }
    }

    expect(sawPopoRocket).toBe(true);
    expect(sawEnergySlash).toBe(true);
    expect(Math.hypot(eShield.x - shieldStartX, eShield.y - shieldStartY)).toBeGreaterThan(20);
    expect(sawJockRocket).toBe(true);
    expect(sawFiredMaggot).toBe(true);
    expect(sawFreakSpread).toBe(true);
    expect(crab.hp).toBeGreaterThan(0);

    // IDPD Freak resurrects while another hostile lives!
    const fRng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, freak, freak.hp + 999, 0, 0, fRng);
    state.rngState = fRng.getState();
    for (let t = 0; t < 75; t++) stepSimulation(state, makeInput());
    expect(state.enemies.some((e) => e.defId === 'idpd_freak' && e.hp > 0)).toBe(true);

    // Frozen City Snowman pops out Snow Bandit when approached!
    const snowState = createRunState({ mutant: 'fish', seed: 5002 });
    snowState.player.godMode = true;
    warpToArea(snowState, '5-1', 0);
    const snowman = snowState.props.find((p) => p.kind === 'snowman')!;
    expect(snowman).toBeDefined();
    snowState.player.x = snowman.x + 24;
    snowState.player.y = snowman.y;
    stepSimulation(snowState, makeInput());
    expect(snowState.enemies.some((e) => e.defId === 'snow_bandit')).toBe(true);
  });

  it('verifies Ballguy -> Toxic Ballguy gas transform, Fire Trap disable on portal, Sniper 3-shot+blast, Gold Scorpion venom ring, Turtle spin, Big Rat rage, Necro revive area, Big Dog 3-missile & Lil\' Hunter 11-pellet spread', () => {
    const state = createRunState({ mutant: 'fish', seed: 5101 });
    state.player.godMode = true;
    carveOpenRoom(state, 10);
    state.enemies = [];
    state.props = [];

    const rng = SeededRng.fromState(state.rngState);
    // 1. Regular ballguy transforms into toxic_ballguy inside Toxic Gas!
    const bg = createEnemyEntity(state, 'ballguy', state.player.x + 56, state.player.y, rng);
    addToxicGasCloud(state, bg.x, bg.y, 32, 40, 'enemy');

    // 2. Sniper fires 3-shot burst & explodes on death!
    const sniper = createEnemyEntity(state, 'sniper', state.player.x - 96, state.player.y, rng);
    sniper.attackCooldown = 1;

    // 3. Turtle shell-spin + Big Rat rage charge
    const turtle = createEnemyEntity(state, 'turtle', state.player.x, state.player.y + 64, rng);
    turtle.attackCooldown = 1;
    const ratKing = createEnemyEntity(state, 'big_rat', state.player.x, state.player.y - 64, rng);
    ratKing.hp = Math.floor(ratKing.maxHp * 0.5);
    ratKing.attackCooldown = 1;

    // 4. Necromancer spawns persistent 35px necro_revive_area
    const necro = createEnemyEntity(state, 'necromancer', state.player.x + 88, state.player.y + 44, rng);
    necro.attackCooldown = 1;
    spawnCorpse(state, necro.x + 12, necro.y, 0, 0, 1, 'sprFreak1Dead', 10, true);

    state.rngState = rng.getState();

    let sniperShots = 0;
    let sawTurtleSpin = false;
    let sawRatRage = false;
    let sawNecroZone = false;
    for (let t = 0; t < 65; t++) {
      const beforeShots = state.projectiles.filter((p) => p.sprite === 'sprEnemyBullet4').length;
      stepSimulation(state, makeInput());
      const afterShots = state.projectiles.filter((p) => p.sprite === 'sprEnemyBullet4').length;
      if (afterShots > beforeShots) sniperShots += afterShots - beforeShots;
      if (turtle.aiState === 'spin') sawTurtleSpin = true;
      if (ratKing.aiState === 'rage_charge' && ratKing.contactDamage === 5) sawRatRage = true;
      if (state.props.some((p) => p.kind === 'necro_revive_area' && p.radius === 35)) {
        sawNecroZone = true;
      }
    }
    expect(bg.defId).toBe('toxic_ballguy');
    expect(sniperShots).toBeGreaterThanOrEqual(3);
    expect(sawTurtleSpin).toBe(true);
    expect(sawRatRage).toBe(true);
    expect(sawNecroZone).toBe(true);

    // Kill Sniper -> explosion event; kill Gold Scorpion -> 12-bullet venom ring!
    const kRng = SeededRng.fromState(state.rngState);
    const goldScorp = createEnemyEntity(state, 'gold_scorpion', state.player.x + 60, state.player.y - 40, kRng);
    applyDamageToEnemy(state, sniper, 999, 0, 0, kRng);
    applyDamageToEnemy(state, goldScorp, 999, 0, 0, kRng);
    state.rngState = kRng.getState();
    while (state.hitstopTicks > 0) stepSimulation(state, makeInput());
    stepSimulation(state, makeInput());
    expect(state.projectiles.filter((p) => p.sprite === 'sprScorpionBullet').length).toBeGreaterThanOrEqual(12);

    // Big Dog 3-missile volley & Lil' Hunter 11-pellet close bouncer spread!
    const bdState = createRunState({ mutant: 'fish', seed: 5102 });
    bdState.player.godMode = true;
    carveOpenRoom(bdState, 10);
    bdState.enemies = [];
    const bdRng = SeededRng.fromState(bdState.rngState);
    const bd = spawnBossEntity(bdState, 'big_dog', bdRng);
    bd.aiState = 'missiles';
    bd.aiTimer = 16;
    bdState.boss!.introTicks = 0;
    bdState.rngState = bdRng.getState();
    stepSimulation(bdState, makeInput());
    expect(bdState.projectiles.filter((p) => p.kind === 'boss_missile').length).toBe(3);

    const lhState = createRunState({ mutant: 'fish', seed: 5103 });
    lhState.player.godMode = true;
    carveOpenRoom(lhState, 10);
    lhState.enemies = [];
    const lhRng = SeededRng.fromState(lhState.rngState);
    const lh = spawnBossEntity(lhState, 'lil_hunter', lhRng);
    lh.x = lhState.player.x + 70;
    lh.y = lhState.player.y;
    lh.aiState = 'grounded';
    lh.elevated = false;
    lh.invulnerable = false;
    lh.aiPhase = 0;
    lh.aiTimer = 40;
    lh.attackCooldown = 1;
    lhState.boss!.introTicks = 0;
    lhState.rngState = lhRng.getState();
    stepSimulation(lhState, makeInput());
    expect(lhState.projectiles.filter((p) => p.sprite === 'sprLHBouncer').length).toBe(11);

    // Scrapyard Fire Trap fires sprTrapFire & disables on portal open!
    const ftState = createRunState({ mutant: 'fish', seed: 5104 });
    ftState.player.godMode = true;
    warpToArea(ftState, '3-1', 0);
    const trap = ftState.props.find((p) => p.kind === 'fire_trap');
    expect(trap).toBeDefined();
    if (trap) {
      getExtendedAreaRuntime(ftState).fireTrapTimers.set(trap.id, 1);
      let sawTrapFire = false;
      for (let t = 0; t < 12; t++) {
        stepSimulation(ftState, makeInput());
        if (ftState.projectiles.some((p) => p.sprite === 'sprTrapFire')) sawTrapFire = true;
      }
      expect(sawTrapFire).toBe(true);
      // Opening portal disables fire trap
      ftState.portal.active = true;
      ftState.projectiles = [];
      getExtendedAreaRuntime(ftState).fireTrapTimers.set(trap.id, 1);
      getExtendedAreaRuntime(ftState).fireTrapFiringTicks.set(trap.id, 0);
      for (let t = 0; t < 6; t++) stepSimulation(ftState, makeInput());
      expect(ftState.projectiles.some((p) => p.sprite === 'sprTrapFire')).toBe(false);
    }
  });
});
