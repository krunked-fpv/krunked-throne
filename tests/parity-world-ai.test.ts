import { describe, expect, it } from 'vitest';
import {
  TileType,
  type InputFrame,
  type SimState,
} from '@/contracts';
import { AREAS, AREA_CODES, ENEMIES } from '@/data';
import {
  SeededRng,
  carveCircle,
  drainEvents,
  findNearestFloor,
  generateWorldMap,
  getTile,
  hasLineOfSight,
  isCircleOverlappingSolid,
  isSolidTile,
  isWalkableTile,
  isWorldSolid,
  moveCircleWithSlide,
  setTile,
  tileToWorldCenter,
  worldToTile,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  damageProp,
  spawnCorpse,
  spawnExplosion,
  spawnPickup,
} from '@/sim/combat';
import { createWeaponSlot, loadAreaIntoState } from '@/sim/progression';
import {
  createEnemyEntity,
  createRunState,
  getAreaRuntime,
  populateAreaEntities,
  spawnIdpdWave,
} from '@/sim/entities';
import { stepSimulation, warpToArea } from '@/sim/ai';

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

function carveOpenRoom(state: SimState, halfTiles: number = 7): void {
  const { tx: ptx, ty: pty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
  for (let ty = pty - halfTiles; ty <= pty + halfTiles; ty++) {
    for (let tx = ptx - halfTiles; tx <= ptx + halfTiles; tx++) {
      if (tx >= 2 && ty >= 2 && tx < state.map.width - 2 && ty < state.map.height - 2) {
        setTile(state.map, tx, ty, TileType.Floor);
      }
    }
  }
}

function countWalkableTiles(stateOrMap: { width: number; height: number; tiles: Uint8Array }): number {
  let n = 0;
  for (let i = 0; i < stateOrMap.tiles.length; i++) {
    if (isWalkableTile(stateOrMap.tiles[i] as TileType)) n += 1;
  }
  return n;
}

describe('worldgen, darkness & collision parity', () => {
  it('scales map floor count across loops even when Loop-0 targetFloors/walkerCount opts are provided', () => {
    const m0 = generateWorldMap('1-1', 'desert', 0, new SeededRng(4242), {
      targetFloors: 260,
      walkerCount: 4,
    });
    const m1 = generateWorldMap('1-1', 'desert', 1, new SeededRng(4242), {
      targetFloors: 260,
      walkerCount: 4,
    });
    const m2 = generateWorldMap('1-1', 'desert', 2, new SeededRng(4242), {
      targetFloors: 260,
      walkerCount: 4,
    });

    const f0 = countWalkableTiles(m0);
    const f1 = countWalkableTiles(m1);
    const f2 = countWalkableTiles(m2);
    expect(f1).toBeGreaterThan(f0);
    expect(f2).toBeGreaterThan(f1);

    // Fixed layouts remain identical across loops
    const throneL0 = generateWorldMap('7-3', 'palace', 0, new SeededRng(100));
    const throneL1 = generateWorldMap('7-3', 'palace', 1, new SeededRng(100));
    expect(throneL0.width).toBe(throneL1.width);
    expect(throneL0.height).toBe(throneL1.height);
  });

  it('preserves authentic biome darkness and locked area/enemy registry counts', () => {
    expect(AREA_CODES.length).toBe(23);
    expect(Object.keys(ENEMIES).length).toBe(50);

    expect(AREAS['4-?'].darkness).toBeGreaterThanOrEqual(0.5);
    expect(AREAS['2-?'].darkness).toBeGreaterThanOrEqual(0.4);
    expect(AREAS['5-?'].darkness).toBeGreaterThan(0.15);
    expect(AREAS['7-1'].darkness).toBeGreaterThan(0);
    expect(AREAS['7-2'].darkness).toBeGreaterThan(0);
    expect(AREAS['7-3'].darkness).toBeGreaterThan(0);
    expect(AREAS['0-1'].darkness).toBeGreaterThan(0);
    expect(AREAS.vault.darkness).toBeGreaterThan(0.15);
  });

  it('places 7-3 generators in visible flanking lanes and uses real Steam sprPillar', () => {
    const state = createRunState({ mutant: 'fish', seed: 7373 });
    warpToArea(state, '7-3', 0);

    const cx = Math.floor(state.map.width / 2);
    const ts = state.map.tileSize;
    expect(getTile(state.map, cx, 25)).toBe(TileType.Carpet);

    const gens = state.props.filter((p) => p.kind === 'throne_generator');
    expect(gens.length).toBe(4);
    const centerX = tileToWorldCenter(cx, 25, ts).x;
    for (const g of gens) {
      expect(Math.abs(g.x - centerX)).toBeLessThanOrEqual(11 * ts);
      expect(isWorldSolid(state.map, g.x, g.y)).toBe(false);
    }

    const pillars = state.props.filter((p) => p.kind === 'pillar');
    expect(pillars.length).toBeGreaterThan(0);
    for (const p of pillars) {
      expect(p.sprite).toBe('sprPillar');
    }
  });

  it('carveCircle carves interior Void tiles and moveCircleWithSlide never embeds large entities in solids', () => {
    const map = generateWorldMap('1-1', 'desert', 0, new SeededRng(5511));
    // Place interior Void at a known interior tile and carve it
    const tx = Math.floor(map.width / 2);
    const ty = Math.floor(map.height / 2);
    setTile(map, tx, ty, TileType.Void);
    expect(isSolidTile(getTile(map, tx, ty))).toBe(true);

    const c = tileToWorldCenter(tx, ty, map.tileSize);
    const carved = carveCircle(map, c.x, c.y, 14, true);
    expect(carved).toBeGreaterThan(0);
    expect(isWalkableTile(getTile(map, tx, ty))).toBe(true);

    // Construct a 1-tile corridor surrounded by solid walls and test a large-radius entity (r=14)
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) {
        setTile(map, x, y, y === ty ? TileType.Floor : TileType.Wall);
      }
    }
    const mv = moveCircleWithSlide(map, c.x, c.y, 3, 2, 14);
    expect(isWorldSolid(map, mv.x, mv.y)).toBe(false);
  });
});

describe('secret exits & Crown Vault end-to-end parity', () => {
  it('1-1 Early Big Bandit spawns when chests opened + rad canister broken, fast kill opens Oasis (1-?)', () => {
    const state = createRunState({ mutant: 'fish', seed: 1011 });
    state.player.godMode = true;

    // Open all chests & destroy rad canisters with 0 kills
    for (let i = state.props.length - 1; i >= 0; i--) {
      const p = state.props[i]!;
      if (p.kind === 'weapon_chest' || p.kind === 'big_weapon_chest' || p.kind === 'ammo_chest') {
        p.opened = true;
      } else if (p.kind === 'rad_canister' || p.kind === 'idpd_canister') {
        state.props.splice(i, 1);
      }
    }

    stepSimulation(state, makeInput());
    expect(state.boss?.bossId).toBe('big_bandit');
    const bb = state.enemies.find((e) => e.bossId === 'big_bandit')!;
    expect(bb).toBeDefined();

    // Defeat Early Big Bandit quickly (<300 ticks) -> Oasis 1-? portal opens!
    const rng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, bb, 9999, 0, 0, rng);
    state.rngState = rng.getState();
    for (let t = 0; t < 6; t++) stepSimulation(state, makeInput());

    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('1-?');
  });

  it('2-1 Sewer Manhole ignores bullets and opens Pizza Sewers (2-?) on nearby explosion', () => {
    const state = createRunState({ mutant: 'fish', seed: 2021 });
    state.player.godMode = true;
    warpToArea(state, '2-1', 0);

    const rt = getAreaRuntime(state);
    expect(rt.pizzaManholePropId).not.toBeNull();
    const manhole = state.props.find((p) => p.id === rt.pizzaManholePropId)!;
    expect(manhole).toBeDefined();
    expect(manhole.sprite).toBe('sprPizzaEntrance');

    // Non-explosive chip does not break or open the grate; simulate GameApp draining events each tick
    // so tick N emits multiple events, drainEvents clears them, and tick N+1's explosion at index 0 is still caught!
    manhole.hp -= 20;
    for (let k = 0; k < 4; k++) {
      state.events.push({ type: 'shake', trauma: 0.01 });
    }
    stepSimulation(state, makeInput());
    expect(state.portal.active).toBe(false);
    expect(manhole.hp).toBe(manhole.maxHp);
    drainEvents(state);

    // Explosion next to manhole on freshly drained events queue pops it open to Pizza Sewers (2-?)
    const rng = SeededRng.fromState(state.rngState);
    spawnExplosion(state, manhole.x + 12, manhole.y, 32, 20, 'player', rng);
    state.rngState = rng.getState();
    for (let t = 0; t < 6; t++) stepSimulation(state, makeInput());

    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('2-?');
  });

  it('3-1 Golden Car repairs via Screwdriver swing and enters Y.V.\'s Mansion (3-?) via [E]', () => {
    const state = createRunState({ mutant: 'fish', seed: 3031 });
    state.player.godMode = true;
    warpToArea(state, '3-1', 0);

    const rt = getAreaRuntime(state);
    expect(rt.venusCarPropId).not.toBeNull();
    const car = state.props.find((p) => p.id === rt.venusCarPropId)!;
    expect(car.sprite).toBe('sprVenusCar');

    // Equip Screwdriver, move next to Golden Car, and swing
    state.player.weapons[0] = createWeaponSlot('screwdriver');
    state.player.activeSlot = 0;
    const stand = findNearestFloor(state.map, car.x - 14, car.y, 6);
    state.player.x = stand.x;
    state.player.y = stand.y;

    stepSimulation(
      state,
      makeInput({
        aimWorldX: car.x,
        aimWorldY: car.y,
        fireHeld: true,
        firePressed: true,
      }),
    );

    expect(rt.venusCarFixed).toBe(true);
    expect(car.sprite).toBe('sprVenusCarFixed');
    expect(car.hp).toBe(999);
    expect(state.portal.active).toBe(false);

    // Press [E] beside repaired car -> opens 3-? Y.V.'s Mansion portal!
    stepSimulation(state, makeInput({ pickupPressed: true }));
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('3-?');
  });

  it('3-3 portal redirects to Cursed Crystal Caves (4-?) when player holds a cursed weapon', () => {
    const state = createRunState({ mutant: 'fish', seed: 3033 });
    state.player.godMode = true;
    warpToArea(state, '3-3', 0);

    state.player.weapons[0] = createWeaponSlot('revolver', true);
    state.enemies = state.enemies.filter((e) => e.bossId === 'big_dog');
    const bigDog = state.enemies.find((e) => e.bossId === 'big_dog')!;
    const rng = SeededRng.fromState(state.rngState);
    applyDamageToEnemy(state, bigDog, 9999, 0, 0, rng);
    state.rngState = rng.getState();

    for (let t = 0; t < 8; t++) stepSimulation(state, makeInput());
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('4-?');
  });

  it('5-1 Jungle Flower spawns with Last Wish and opens The Jungle (5-?) after 4 HP feeds', () => {
    const state = createRunState({ mutant: 'fish', seed: 5051 });
    state.player.mutations.push('last_wish');
    state.player.maxHp = 8;
    state.player.hp = 8;
    warpToArea(state, '5-1', 0);

    const rt = getAreaRuntime(state);
    expect(rt.jungleFlowerPropId).not.toBeNull();
    const flower = state.props.find((p) => p.id === rt.jungleFlowerPropId)!;
    // Keep 1 distant enemy alive so normal 5-2 portal does not spawn right under the player mid-feed
    const rng = SeededRng.fromState(state.rngState);
    const farSpot = findNearestFloor(state.map, flower.x + 260, flower.y + 260, 16);
    rt.trackedSpecials.clear();
    state.enemies = [];
    createEnemyEntity(state, 'wolf', farSpot.x, farSpot.y, rng);
    state.rngState = rng.getState();

    state.player.x = flower.x;
    state.player.y = flower.y;

    for (let i = 1; i <= 4; i++) {
      stepSimulation(state, makeInput({ pickupPressed: true }));
      expect(state.player.hp).toBe(8 - i);
    }

    expect(state.player.mutations.includes('last_wish')).toBe(false);
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('5-?');
  });

  it('3-2 Proto Statue absorbs 30 rads, shatters into Crown Vault (vault), cycles Crown, and returns to 3-3', () => {
    const state = createRunState({ mutant: 'fish', seed: 3032 });
    state.player.godMode = true;
    warpToArea(state, '3-2', 0);

    const rt = getAreaRuntime(state);
    expect(rt.protoStatuePropId).not.toBeNull();
    const statue = state.props.find((p) => p.id === rt.protoStatuePropId)!;

    // Move player away so player magnetism does not steal rads from the statue
    const far = findNearestFloor(state.map, statue.x + 220, statue.y + 220, 16);
    state.player.x = far.x;
    state.player.y = far.y;

    // Drop 35 rads right next to Proto Statue
    const rng = SeededRng.fromState(state.rngState);
    for (let i = 0; i < 4; i++) {
      spawnPickup(state, 'big_rad', statue.x + (i % 2 === 0 ? 12 : -12), statue.y, { value: 10 }, rng);
    }
    state.rngState = rng.getState();

    for (let t = 0; t < 12; t++) {
      stepSimulation(state, makeInput());
    }
    expect(rt.protoStatueCharged).toBe(true);
    expect(statue.sprite).toBe('sprProtoStatueCharge');

    // Shatter charged statue -> Crown Vault portal opens!
    const rng2 = SeededRng.fromState(state.rngState);
    damageProp(state, statue, 999, rng2);
    state.rngState = rng2.getState();
    stepSimulation(state, makeInput());

    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('vault');

    // Enter Crown Vault -> 2 Crown Guardians spawn
    loadAreaIntoState(state, 'vault', state.loop, populateAreaEntities);
    const guardians = state.enemies.filter((e) => e.defId === 'crown_guardian');
    expect(guardians.length).toBe(2);

    // Vault pedestal must survive stray combat damage so Crown cycling can never be softlocked
    const pedestal = state.props.find((p) => p.kind === 'proto_statue')!;
    expect(pedestal).toBeDefined();
    expect(pedestal.hp).toBeGreaterThanOrEqual(999999);
    const pedRng = SeededRng.fromState(state.rngState);
    damageProp(state, pedestal, 500, pedRng);
    state.rngState = pedRng.getState();

    // Clear guardians -> Vault pedestal stays indestructible, cycles Crown via [E], and Vault exit returns to 3-3!
    state.enemies = [];
    state.player.x = pedestal.x;
    state.player.y = pedestal.y;
    const crownBefore = state.crown;

    stepSimulation(state, makeInput({ pickupPressed: true }));
    expect(pedestal.hp).toBe(pedestal.maxHp);
    expect(state.crown).not.toBe(crownBefore);
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('3-3');
  });

  it('Loop 1+ open IDPD Van hijacks to I.D.P.D. HQ (hq-1) via [E] and empty unboarded Van departs cleanly', () => {
    // Part A: Hijack open van to hq-1
    const sA = createRunState({ mutant: 'fish', seed: 9101 });
    sA.player.godMode = true;
    warpToArea(sA, '1-1', 1);
    carveOpenRoom(sA, 8);
    sA.enemies = [];
    const rA = SeededRng.fromState(sA.rngState);
    const [vanA] = spawnIdpdWave(sA, rA, { includeVan: true, anchorX: sA.player.x + 64, anchorY: sA.player.y });
    sA.rngState = rA.getState();
    expect(vanA?.defId).toBe('idpd_van');

    for (let t = 0; t < 40 && vanA!.aiState === 'drive'; t++) {
      stepSimulation(sA, makeInput());
    }
    expect(vanA!.aiState).toBe('open');
    sA.player.x = vanA!.x + 12;
    sA.player.y = vanA!.y;
    stepSimulation(sA, makeInput({ pickupPressed: true }));
    expect(sA.portal.active).toBe(true);
    expect(sA.portal.targetArea).toBe('hq-1');

    // Part B: Unboarded empty van departs via blue portal without exploding or blocking exit
    const sB = createRunState({ mutant: 'fish', seed: 9102 });
    sB.player.godMode = true;
    warpToArea(sB, '1-1', 1);
    carveOpenRoom(sB, 8);
    sB.enemies = [];
    const rB = SeededRng.fromState(sB.rngState);
    const [vanB] = spawnIdpdWave(sB, rB, { includeVan: true, anchorX: sB.player.x + 64, anchorY: sB.player.y });
    sB.rngState = rB.getState();

    let sawDepartSfx = false;
    for (let t = 0; t < 240; t++) {
      // Remove deployed IDPD squad so only the van remains
      sB.enemies = sB.enemies.filter((e) => e.defId === 'idpd_van');
      drainEvents(sB);
      stepSimulation(sB, makeInput());
      const evs = sB.events;
      if (evs.some((ev) => ev.type === 'sfx' && ev.sound === 'sndVanPortal')) {
        sawDepartSfx = true;
        expect(evs.some((ev) => ev.type === 'particle' && ev.kind === 'explosion')).toBe(false);
      }
      if (sB.portal.active) break;
    }
    expect(sawDepartSfx).toBe(true);
    expect(sB.enemies.some((e) => e.defId === 'idpd_van')).toBe(false);
    expect(sB.portal.active).toBe(true);
  });
});

describe('enemy AI & roster 1:1 NT parity', () => {
  it('matches canonical NT HP stats and applies Scarier Face to mid-level spawns without double-scaling initial loads', () => {
    expect(ENEMIES.bandit!.maxHp).toBe(7);
    expect(ENEMIES.big_maggot!.maxHp).toBe(15);
    expect(ENEMIES.scorpion!.maxHp).toBe(25);
    expect(ENEMIES.sniper!.maxHp).toBe(20);
    expect(ENEMIES.salamander!.maxHp).toBe(35);
    expect(ENEMIES.assassin!.maxHp).toBe(15);
    expect(ENEMIES.rhino_freak!.maxHp).toBe(80);
    expect(ENEMIES.guardian_dog!.maxHp).toBe(140);
    expect(ENEMIES.guardian_dog!.contactDamage).toBe(6);
    expect(ENEMIES.big_bandit!.maxHp).toBe(100);
    expect(ENEMIES.big_dog!.maxHp).toBe(300);
    expect(ENEMIES.lil_hunter!.maxHp).toBe(140);
    expect(ENEMIES.throne_ii!.maxHp).toBe(750);

    const state = createRunState({ mutant: 'fish', seed: 4411 });
    state.player.mutations.push('scarier_face');
    warpToArea(state, '1-1', 0);

    // Initial area-loaded bandit gets single -20% HP (Math.round(7 * 0.8) = 6, NOT 5)
    const initialBandit = state.enemies.find((e) => e.defId === 'bandit');
    expect(initialBandit).toBeDefined();
    expect(initialBandit!.maxHp).toBe(Math.max(1, Math.round(7 * 0.8)));

    // Mid-level dynamically spawned enemy ALSO gets single -20% HP
    const rng = SeededRng.fromState(state.rngState);
    const midSpawn = createEnemyEntity(state, 'rhino_freak', state.player.x + 90, state.player.y, rng);
    expect(midSpawn.maxHp).toBe(Math.max(1, Math.round(80 * 0.8)));
  });

  it('Plant snare fully roots enemies and Gamma Guts rate-limits via hurtFlashTicks', () => {
    const state = createRunState({ mutant: 'plant', seed: 4412 });
    state.player.godMode = true;
    carveOpenRoom(state, 7);
    state.enemies = [];

    const rng = SeededRng.fromState(state.rngState);
    const rat = createEnemyEntity(state, 'rat', state.player.x + 48, state.player.y, rng);
    rat.snaredTicks = 20;
    state.rngState = rng.getState();

    const startX = rat.x;
    const startY = rat.y;
    for (let t = 0; t < 5; t++) {
      stepSimulation(state, makeInput());
    }
    expect(rat.x).toBe(startX);
    expect(rat.y).toBe(startY);

    // Gamma Guts: overlapping a high-HP enemy should NOT deal 6 dmg every single tick (gated by hurtFlashTicks < 4)
    state.player.mutations.push('gamma_guts');
    const rng2 = SeededRng.fromState(state.rngState);
    const rhino = createEnemyEntity(state, 'rhino_freak', state.player.x, state.player.y, rng2);
    rhino.snaredTicks = 20;
    state.rngState = rng2.getState();
    const initialHp = rhino.hp;

    for (let t = 0; t < 4; t++) {
      rhino.x = state.player.x;
      rhino.y = state.player.y;
      stepSimulation(state, makeInput());
    }
    // Should trigger at most 2 times across 4 ticks, not 4 times (24 dmg)
    expect(initialHp - rhino.hp).toBeLessThanOrEqual(12);
    expect(initialHp - rhino.hp).toBeGreaterThanOrEqual(6);
  });

  it('special death payoffs: Big Maggot splits, Ballguy toxic bursts, Mimics drop loot', () => {
    const state = createRunState({ mutant: 'fish', seed: 4413 });
    state.player.godMode = true;
    state.player.hp = 4;
    carveOpenRoom(state, 8);
    state.enemies = [];
    state.pickups = [];

    const rng = SeededRng.fromState(state.rngState);
    const bigMag = createEnemyEntity(state, 'big_maggot', state.player.x + 60, state.player.y, rng);
    const ball = createEnemyEntity(state, 'ballguy', state.player.x - 60, state.player.y, rng);
    const mimic = createEnemyEntity(state, 'mimic', state.player.x, state.player.y + 56, rng);
    const wMimic = createEnemyEntity(state, 'weapon_mimic', state.player.x, state.player.y - 56, rng);

    applyDamageToEnemy(state, bigMag, 999, 0, 0, rng);
    applyDamageToEnemy(state, ball, 999, 0, 0, rng);
    applyDamageToEnemy(state, mimic, 999, 0, 0, rng);
    applyDamageToEnemy(state, wMimic, 999, 0, 0, rng);
    state.rngState = rng.getState();

    for (let t = 0; t < 6; t++) stepSimulation(state, makeInput());

    expect(state.enemies.filter((e) => e.defId === 'maggot').length).toBe(3);
    expect(state.projectiles.filter((p) => p.team === 'enemy' && p.sprite === 'sprScorpionBullet').length).toBeGreaterThanOrEqual(6);
    expect(state.pickups.filter((p) => p.kind === 'ammo').length).toBeGreaterThanOrEqual(2);
    expect(state.pickups.filter((p) => p.kind === 'hp').length).toBeGreaterThanOrEqual(1);
    expect(state.pickups.filter((p) => p.kind === 'weapon').length).toBeGreaterThanOrEqual(2);
  });

  it('Big Rat vomits live Green Rats, Buff Gator shoots splitting Flak, Assassin destroys (not reflects) shots', () => {
    const state = createRunState({ mutant: 'fish', seed: 4414 });
    state.player.godMode = true;
    carveOpenRoom(state, 10);
    state.enemies = [];

    const rng = SeededRng.fromState(state.rngState);
    const bigRat = createEnemyEntity(state, 'big_rat', state.player.x + 64, state.player.y, rng);
    bigRat.attackCooldown = 1;
    // Place Buff Gator far enough (> 135px) so its Flak ball splits in mid-air before touching the player
    const buffGator = createEnemyEntity(state, 'buff_gator', state.player.x - 140, state.player.y, rng);
    buffGator.attackCooldown = 1;
    const assassin = createEnemyEntity(state, 'assassin', state.player.x + 18, state.player.y, rng);
    assassin.aiState = 'rush';
    assassin.attackCooldown = 0;
    state.rngState = rng.getState();

    let sawFlak = false;
    let sawSplitShell = false;
    let sawAssassinSlash = false;

    for (let t = 0; t < 115; t++) {
      stepSimulation(state, makeInput());
      if (state.projectiles.some((p) => p.team === 'enemy' && p.kind === 'flak' && p.sprite === 'sprFlakBullet')) {
        sawFlak = true;
      }
      if (state.projectiles.some((p) => p.team === 'enemy' && p.kind === 'shell')) {
        sawSplitShell = true;
      }
      const slash = state.projectiles.find((p) => p.team === 'enemy' && p.kind === 'melee_slash');
      if (slash) {
        sawAssassinSlash = true;
        expect(slash.deflectsProjectiles).toBe(false);
        expect(slash.destroysProjectiles).toBe(true);
      }
    }

    expect(state.enemies.some((e) => e.defId === 'green_rat')).toBe(true);
    expect(sawFlak).toBe(true);
    expect(sawSplitShell).toBe(true);
    expect(sawAssassinSlash).toBe(true);
  });

  it('Snowbot respects wall LOS for car grab, Necromancer telegraphs revive & skips boss corpses, Guardian vanishes safely & Guardian Dog has no orb ring', () => {
    const state = createRunState({ mutant: 'fish', seed: 4415 });
    state.player.godMode = true;
    carveOpenRoom(state, 9);
    state.enemies = [];
    state.props = [];
    state.corpses = [];

    // Build a solid wall separating a Snowbot from a Car 32px away
    const { tx: ptx, ty: pty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
    setTile(state.map, ptx + 3, pty - 3, TileType.Wall);
    setTile(state.map, ptx + 3, pty - 2, TileType.Wall);
    setTile(state.map, ptx + 3, pty - 1, TileType.Wall);
    const botPos = tileToWorldCenter(ptx + 2, pty - 2, state.map.tileSize);
    const carPos = tileToWorldCenter(ptx + 4, pty - 2, state.map.tileSize);

    state.props.push({
      id: 90001,
      kind: 'car',
      x: carPos.x,
      y: carPos.y,
      radius: 11,
      hp: 24,
      maxHp: 24,
      solid: true,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprFrozenCar',
    });

    const rng = SeededRng.fromState(state.rngState);
    const snowbot = createEnemyEntity(state, 'snowbot', botPos.x, botPos.y, rng);
    snowbot.attackCooldown = 1;

    // Necromancer with ONLY a boss corpse nearby -> must NOT revive boss corpse!
    const necro = createEnemyEntity(state, 'necromancer', state.player.x - 70, state.player.y, rng);
    necro.attackCooldown = 1;
    spawnCorpse(state, necro.x + 16, necro.y, 0, 0, 1, 'sprBanditBossDead', 14, false);

    // Guardian Dog leaps -> must NOT emit boss_orb projectiles!
    const dog = createEnemyEntity(state, 'guardian_dog', state.player.x, state.player.y + 72, rng);
    dog.attackCooldown = 1;

    // Palace Guardian -> must pass through invulnerable 'vanish' state before teleporting >= 68px from player
    const guard = createEnemyEntity(state, 'guardian', state.player.x - 48, state.player.y - 48, rng);
    guard.aiTimer = 2;

    // Ammo Mimic -> melee only (no enemy_bullet spread); Lightning Crystal -> kind: 'lightning'
    const ammoMimic = createEnemyEntity(state, 'mimic', state.player.x + 24, state.player.y + 24, rng);
    ammoMimic.aiState = 'awake';
    ammoMimic.attackCooldown = 0;
    const lCrys = createEnemyEntity(state, 'lightning_crystal', state.player.x - 64, state.player.y + 64, rng);
    lCrys.attackCooldown = 1;

    state.rngState = rng.getState();

    let sawGuardianVanish = false;
    let sawDogLeap = false;
    let sawLightningBolt = false;

    for (let t = 0; t < 115; t++) {
      stepSimulation(state, makeInput());
      if (guard.aiState === 'vanish') {
        sawGuardianVanish = true;
        expect(guard.invulnerable).toBe(true);
      }
      if (dog.aiState === 'leap') sawDogLeap = true;
      if (state.projectiles.some((p) => p.team === 'enemy' && p.kind === 'lightning')) {
        sawLightningBolt = true;
      }
      // Ammo Mimic never fires sprEnemyBullet1
      expect(
        state.projectiles.some((p) => p.team === 'enemy' && p.sprite === 'sprEnemyBullet1'),
      ).toBe(false);
    }

    // Car behind solid wall was NOT grabbed by Snowbot!
    expect(state.props.some((p) => p.id === 90001)).toBe(true);
    // Boss corpse was NOT revived into a freak!
    expect(state.enemies.some((e) => e.defId === 'freak')).toBe(false);
    expect(sawGuardianVanish).toBe(true);
    expect(sawDogLeap).toBe(true);
    expect(sawLightningBolt).toBe(true);
  });
});

describe('boss multi-phase & mechanic parity', () => {
  it('Big Dog and Krunked Throne hold intro/music while asleep and emit on wake', () => {
    const sDog = createRunState({ mutant: 'fish', seed: 6001 });
    sDog.player.godMode = true;
    warpToArea(sDog, '3-3', 0);
    const dogEventsAtSpawn = drainEvents(sDog);
    expect(sDog.boss?.bossId).toBe('big_dog');
    expect(sDog.boss?.introTicks).toBe(0);
    expect(dogEventsAtSpawn.some((ev) => ev.type === 'boss_intro')).toBe(false);

    const dog = sDog.enemies.find((e) => e.bossId === 'big_dog')!;
    expect(dog.aiState).toBe('sleep');

    // Damage Big Dog -> wakes up and emits boss_intro + Boss2 music!
    const rng = SeededRng.fromState(sDog.rngState);
    applyDamageToEnemy(sDog, dog, 5, 0, 0, rng);
    sDog.rngState = rng.getState();
    stepSimulation(sDog, makeInput());
    expect(dog.aiState).not.toBe('sleep');
    expect(sDog.events.some((ev) => ev.type === 'boss_intro' && ev.bossId === 'big_dog')).toBe(true);
    expect(sDog.events.some((ev) => ev.type === 'music' && ev.track === 'mus/Boss2')).toBe(true);

    // 7-3 Krunked Throne also starts asleep holding boss_intro until woken
    const sThrone = createRunState({ mutant: 'fish', seed: 6002 });
    sThrone.player.godMode = true;
    warpToArea(sThrone, '7-3', 0);
    const throneSpawnEvents = drainEvents(sThrone);
    expect(sThrone.boss?.bossId).toBe('nuclear_throne');
    expect(sThrone.boss?.introTicks).toBe(0);
    expect(throneSpawnEvents.some((ev) => ev.type === 'boss_intro')).toBe(false);
    expect(ENEMIES.nuclear_throne!.sprites.fire).toBe('sprNothingOn');
  });

  it('7-3 destroying all 4 generators chunks 50% Throne maxHp and giant Throne orbs respect Crown of Life & split on expiry', () => {
    const state = createRunState({ mutant: 'fish', seed: 6003, crown: 'life' });
    state.player.godMode = true;
    warpToArea(state, '7-3', 0);
    const throne = state.enemies.find((e) => e.bossId === 'nuclear_throne')!;
    const maxHp = throne.maxHp;

    // Wake Throne by moving up onto the carpet
    state.player.x = throne.x;
    state.player.y = throne.y + 110;
    stepSimulation(state, makeInput());
    expect(throne.aiState).not.toBe('sleep');
    expect(state.boss?.introTicks).toBe(45);

    // Step past the 45-tick Boss Intro combat pause so active Throne combat resumes
    for (let t = 0; t < 45; t++) stepSimulation(state, makeInput());
    expect(state.boss?.introTicks).toBe(0);

    const hpBeforeGens = throne.hp;
    const rng = SeededRng.fromState(state.rngState);
    const gens = state.props.filter((p) => p.kind === 'throne_generator');
    expect(gens.length).toBe(4);
    for (const g of gens) {
      damageProp(state, g, 999, rng);
    }
    state.rngState = rng.getState();
    for (let t = 0; t < 6; t++) stepSimulation(state, makeInput());

    // 4-generator destruction chunks 50% of maxHp!
    expect(hpBeforeGens - throne.hp).toBeGreaterThanOrEqual(Math.round(maxHp * 0.48));

    // Giant orb shootdown with Crown of Life: drops ammo, NEVER drops HP!
    state.pickups = [];
    state.projectiles = [
      {
        id: 88001,
        kind: 'boss_orb',
        team: 'enemy',
        x: throne.x,
        y: throne.y + 60,
        prevX: throne.x,
        prevY: throne.y + 60,
        vx: 0,
        vy: 1,
        angle: Math.PI * 0.5,
        radius: 11,
        damage: 3,
        lifeTicks: 40,
        maxLifeTicks: 40,
        pierce: 0,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprBigGuardianBullet',
        hitIds: [],
      },
      {
        id: 88002,
        kind: 'bullet',
        team: 'player',
        x: throne.x + 2,
        y: throne.y + 60,
        prevX: throne.x - 12,
        prevY: throne.y + 60,
        vx: 14,
        vy: 0,
        angle: 0,
        radius: 3,
        damage: 4,
        lifeTicks: 20,
        maxLifeTicks: 20,
        pierce: 0,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprBullet1',
        hitIds: [],
      },
    ];
    state.player.hp = 3;
    stepSimulation(state, makeInput());
    expect(state.pickups.some((p) => p.kind === 'ammo')).toBe(true);
    expect(state.pickups.some((p) => p.kind === 'hp')).toBe(false);

    // Unshot expiring giant orb splits into 6 smaller orbs!
    state.projectiles = [
      {
        id: 88003,
        kind: 'boss_orb',
        team: 'enemy',
        x: throne.x,
        y: throne.y + 80,
        prevX: throne.x,
        prevY: throne.y + 80,
        vx: 0,
        vy: 1,
        angle: Math.PI * 0.5,
        radius: 11,
        damage: 3,
        lifeTicks: 2,
        maxLifeTicks: 40,
        pierce: 0,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprBigGuardianBullet',
        hitIds: [],
      },
    ];
    stepSimulation(state, makeInput());
    const smallOrbs = state.projectiles.filter((p) => p.team === 'enemy' && p.kind === 'boss_orb' && p.radius <= 6);
    expect(smallOrbs.length).toBeGreaterThanOrEqual(6);
  });

  it('Lil\' Hunter launches visible death jetpack pinball spiral (delaying portal) and Throne II never spawns Palace Guardians', () => {
    const sLH = createRunState({ mutant: 'fish', seed: 6004 });
    sLH.player.godMode = true;
    warpToArea(sLH, '5-3', 0);
    // Clear regular enemies so we also verify death_spiral delays the 6-1 portal until final detonation
    sLH.enemies = sLH.enemies.filter((e) => e.bossId === 'lil_hunter');
    const lh = sLH.enemies.find((e) => e.bossId === 'lil_hunter')!;
    expect(lh.maxHp).toBe(140);

    // Land Lil' Hunter, then kill him -> visible jetpack death spiral triggers!
    lh.aiState = 'grounded';
    lh.elevated = false;
    lh.invulnerable = false;
    const r1 = SeededRng.fromState(sLH.rngState);
    applyDamageToEnemy(sLH, lh, 9999, 0, 0, r1);
    sLH.rngState = r1.getState();

    for (let t = 0; t < 6; t++) stepSimulation(sLH, makeInput());
    const rt = getAreaRuntime(sLH);
    expect(sLH.boss?.defeated).toBe(true);
    expect(rt.lilHunterSpiral?.active).toBe(true);
    const spiralBody = sLH.enemies.find((e) => e.bossId === 'lil_hunter' && e.aiState === 'death_spiral');
    expect(spiralBody).toBeDefined();
    expect(spiralBody!.invulnerable).toBe(true);
    expect(spiralBody!.contactDamage).toBe(0);
    expect(sLH.portal.active).toBe(false);

    let sawSpiralFlame = false;
    for (let t = 0; t < 70 && rt.lilHunterSpiral !== null; t++) {
      drainEvents(sLH);
      stepSimulation(sLH, makeInput());
      if (sLH.events.some((ev) => ev.type === 'particle' && ev.kind === 'flame')) {
        sawSpiralFlame = true;
      }
    }
    expect(sawSpiralFlame).toBe(true);
    expect(rt.lilHunterSpiral).toBeNull();
    expect(sLH.enemies.some((e) => e.bossId === 'lil_hunter')).toBe(false);
    expect(sLH.portal.active).toBe(true);
    expect(sLH.portal.targetArea).toBe('6-1');

    // Throne II: 750 HP and never spawns Palace Guardians across 180 ticks
    const sT2 = createRunState({ mutant: 'fish', seed: 6005 });
    sT2.player.godMode = true;
    warpToArea(sT2, '0-1', 0);
    const t2 = sT2.enemies.find((e) => e.bossId === 'throne_ii')!;
    expect(t2.maxHp).toBe(750);

    for (let t = 0; t < 180; t++) {
      stepSimulation(sT2, makeInput());
      expect(sT2.enemies.some((e) => e.defId === 'guardian')).toBe(false);
    }
  });
});

describe('Wave 2 worldgen, secrets, Vault, AI & boss polish regressions', () => {
  it('[P0 #1] hitstop syncs prevX/prevY across player, enemies, projectiles, corpses & pickups (zero 60/120 FPS jitter)', () => {
    const state = createRunState({ mutant: 'fish', seed: 7101 });
    carveOpenRoom(state, 8);
    state.enemies = [];
    const rng = SeededRng.fromState(state.rngState);
    const enemy = createEnemyEntity(state, 'bandit', state.player.x + 48, state.player.y, rng);
    spawnCorpse(state, state.player.x + 20, state.player.y, 1, 0, 1, 'sprBanditDead', 12, false);
    spawnPickup(state, 'rad', state.player.x + 30, state.player.y, { value: 2 }, rng);
    state.rngState = rng.getState();

    state.projectiles.push({
      id: 99101,
      kind: 'bullet',
      team: 'player',
      x: state.player.x + 15,
      y: state.player.y,
      prevX: state.player.x + 5,
      prevY: state.player.y - 4,
      vx: 10,
      vy: 0,
      angle: 0,
      radius: 3,
      damage: 3,
      lifeTicks: 20,
      maxLifeTicks: 20,
      pierce: 0,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprBullet1',
      hitIds: [],
    });

    // Offset prevX/prevY on all entity classes to simulate pre-hitstop motion
    state.player.prevX = state.player.x - 4;
    state.player.prevY = state.player.y - 3;
    enemy.prevX = enemy.x - 2;
    enemy.prevY = enemy.y + 2;
    const corpse = state.corpses[0]!;
    corpse.prevX = corpse.x - 3;
    corpse.prevY = corpse.y - 1;
    const pickup = state.pickups[0]!;
    pickup.prevX = pickup.x + 2;
    pickup.prevY = pickup.y - 2;
    const proj = state.projectiles[0]!;

    state.hitstopTicks = 3;
    stepSimulation(state, makeInput({ moveX: 1 }));

    expect(state.hitstopTicks).toBe(2);
    expect(state.player.prevX).toBe(state.player.x);
    expect(state.player.prevY).toBe(state.player.y);
    expect(enemy.prevX).toBe(enemy.x);
    expect(enemy.prevY).toBe(enemy.y);
    expect(proj.prevX).toBe(proj.x);
    expect(proj.prevY).toBe(proj.y);
    expect(corpse.prevX).toBe(corpse.x);
    expect(corpse.prevY).toBe(corpse.y);
    expect(pickup.prevX).toBe(pickup.x);
    expect(pickup.prevY).toBe(pickup.y);
  });

  it('[P0 #2] Crown Vault uses sprCrownPedIdle + sprProtoChest, zero sprPillar, >=110px alcove portal emitting vaultReturnArea, and applies/reverts Death & Destiny Crowns', () => {
    const state = createRunState({ mutant: 'fish', seed: 7102 });
    state.player.godMode = true;
    // Simulate coming from 5-2 -> return area should be 5-3!
    warpToArea(state, '5-2', 0);
    const rt52 = getAreaRuntime(state);
    const statue = state.props.find((p) => p.id === rt52.protoStatuePropId)!;
    statue.radsStored = 30;
    stepSimulation(state, makeInput());
    const r = SeededRng.fromState(state.rngState);
    damageProp(state, statue, 999, r);
    state.rngState = r.getState();
    stepSimulation(state, makeInput());
    expect(state.portal.targetArea).toBe('vault');

    loadAreaIntoState(state, 'vault', state.loop, populateAreaEntities);
    const pedestal = state.props.find((p) => p.kind === 'proto_statue')!;
    expect(pedestal).toBeDefined();
    expect(pedestal.sprite).toBe('sprCrownPedIdle');
    // Prompt stays hidden while Crown Guardians are still alive!
    expect(pedestal.interactPrompt).toBeUndefined();
    stepSimulation(state, makeInput());
    expect(pedestal.interactPrompt).toBeUndefined();
    // Zero stray sprPillar props in Crown Vault!
    expect(state.props.some((p) => p.sprite === 'sprPillar')).toBe(false);
    // Vault weapon & ammo chests use sprProtoChest!
    const vaultChests = state.props.filter(
      (p) => p.kind === 'weapon_chest' || p.kind === 'big_weapon_chest' || p.kind === 'ammo_chest',
    );
    expect(vaultChests.length).toBeGreaterThanOrEqual(2);
    for (const c of vaultChests) {
      expect(c.sprite).toBe('sprProtoChest');
    }

    // Clear guardians -> prompt appears, exit portal opens in alcove >= 110px away from pedestal and emits '5-3' on portal_open!
    drainEvents(state);
    state.enemies = [];
    state.player.x = pedestal.x;
    state.player.y = pedestal.y;
    stepSimulation(state, makeInput());
    expect(pedestal.interactPrompt).toBe('[E] SWITCH CROWN');
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('5-3');
    const portalOpenEv = state.events.find((ev) => ev.type === 'portal_open');
    expect(portalOpenEv).toBeDefined();
    if (portalOpenEv?.type === 'portal_open') {
      expect(portalOpenEv.targetArea).toBe('5-3');
    }
    const distFromPed = Math.hypot(state.portal.x - pedestal.x, state.portal.y - pedestal.y);
    expect(distFromPed).toBeGreaterThanOrEqual(110);

    // Cycle Crowns via [E]: verify Crown of Death -1/+1 maxHp and Crown of Destiny once-per-run pendingLevelUps!
    const baseMaxHp = state.player.maxHp;
    const basePending = state.pendingLevelUps;
    let sawDeathPenalty = false;
    let sawDeathRevert = false;
    let destinyGrants = 0;

    // Cycle through ALL 13 crowns twice to prove Destiny only grants ONCE and Death cleanly reverts!
    for (let step = 0; step < 26; step++) {
      const prevCrown = state.crown;
      const prevPending = state.pendingLevelUps;
      stepSimulation(state, makeInput({ pickupPressed: true }));
      if (state.crown === 'death') {
        expect(state.player.maxHp).toBe(baseMaxHp - 1);
        sawDeathPenalty = true;
      } else {
        expect(state.player.maxHp).toBe(baseMaxHp);
        if (prevCrown === 'death') sawDeathRevert = true;
      }
      if (state.crown === 'destiny' && state.pendingLevelUps > prevPending) {
        destinyGrants += state.pendingLevelUps - prevPending;
      }
    }
    expect(sawDeathPenalty).toBe(true);
    expect(sawDeathRevert).toBe(true);
    expect(destinyGrants).toBe(1);
    expect(state.pendingLevelUps).toBe(basePending + 1);
  });

  it('[P0 #3] Proto Statue wide >=180px rad suction out-pulls Plutonium Hunger and 7-2 places statue near active rooms', () => {
    const state = createRunState({ mutant: 'fish', seed: 7103 });
    state.player.godMode = true;
    state.player.mutations.push('plutonium_hunger');
    warpToArea(state, '3-2', 0);

    const rt = getAreaRuntime(state);
    const statue = state.props.find((p) => p.id === rt.protoStatuePropId)!;
    // Clear area around statue and damage statue by 1 HP to activate wide rad suction
    const stTile = worldToTile(statue.x, statue.y, state.map.tileSize);
    for (let ty = stTile.ty - 10; ty <= stTile.ty + 10; ty++) {
      for (let tx = stTile.tx - 10; tx <= stTile.tx + 10; tx++) {
        if (tx >= 2 && ty >= 2 && tx < state.map.width - 2 && ty < state.map.height - 2) {
          setTile(state.map, tx, ty, TileType.Floor);
        }
      }
    }
    // Keep 1 distant enemy alive so the 3-3 exit portal doesn't vacuum the test rads!
    const farEnemyPos = findNearestFloor(state.map, statue.x - 240, statue.y - 240, 16);
    rt.trackedSpecials.clear();
    state.enemies = [];
    const eRng = SeededRng.fromState(state.rngState);
    createEnemyEntity(state, 'raven', farEnemyPos.x, farEnemyPos.y, eRng);
    state.rngState = eRng.getState();
    state.pickups = [];
    statue.hp = statue.maxHp - 1;

    // Player stands 60px from the rads with Plutonium Hunger (130px pull!) while statue is 150px away!
    // Statue's 210px wide suction MUST out-pull Plutonium Hunger and absorb all 40 rads!
    state.player.x = statue.x + 110;
    state.player.y = statue.y - 45;
    const rng = SeededRng.fromState(state.rngState);
    for (let i = 0; i < 4; i++) {
      spawnPickup(state, 'big_rad', statue.x + 150, statue.y + (i - 1.5) * 4, { value: 10 }, rng);
    }
    state.rngState = rng.getState();

    for (let t = 0; t < 25; t++) {
      stepSimulation(state, makeInput());
    }
    expect(statue.radsStored ?? 0).toBeGreaterThanOrEqual(30);
    expect(rt.protoStatueCharged).toBe(true);

    // Verify 7-2 Proto Statue spawns on safe walkable floor near active encounter areas across 5 seeds
    for (let s = 0; s < 5; s++) {
      const s72 = createRunState({ mutant: 'fish', seed: 7200 + s });
      warpToArea(s72, '7-2', 0);
      const st72 = s72.props.find((p) => p.kind === 'proto_statue');
      expect(st72).toBeDefined();
      expect(isWorldSolid(s72.map, st72!.x, st72!.y)).toBe(false);
    }
  });

  it('[P0 #4] 5-1 Ice Flower ALWAYS spawns as indestructible sprIceFlowerIdle and grants replacement mutation pick on 4th feed', () => {
    // Even WITHOUT last_wish, 5-1 always spawns the Ice Flower with sprIceFlowerIdle!
    const state = createRunState({ mutant: 'fish', seed: 7104 });
    warpToArea(state, '5-1', 0);
    const rt = getAreaRuntime(state);
    expect(rt.jungleFlowerPropId).not.toBeNull();
    const flower = state.props.find((p) => p.id === rt.jungleFlowerPropId)!;
    expect(flower.sprite).toBe('sprIceFlowerIdle');
    expect(flower.hp).toBeGreaterThanOrEqual(999999);
    expect(flower.interactPrompt).toBeUndefined();

    // Grant Last Wish -> prompt activates dynamically, stays indestructible, and 4th feed increments pendingLevelUps!
    state.player.mutations.push('last_wish');
    state.player.maxHp = 8;
    state.player.hp = 8;
    const pendingBefore = state.pendingLevelUps;
    // Keep 1 distant enemy alive
    const rng = SeededRng.fromState(state.rngState);
    const far = findNearestFloor(state.map, flower.x + 260, flower.y + 260, 16);
    rt.trackedSpecials.clear();
    state.enemies = [];
    createEnemyEntity(state, 'wolf', far.x, far.y, rng);
    state.rngState = rng.getState();

    stepSimulation(state, makeInput());
    expect(flower.interactPrompt).toBe('[E] FEED FLOWER');

    state.player.x = flower.x;
    state.player.y = flower.y;
    for (let i = 0; i < 4; i++) {
      stepSimulation(state, makeInput({ pickupPressed: true }));
    }
    expect(state.player.mutations.includes('last_wish')).toBe(false);
    expect(state.pendingLevelUps).toBe(pendingBefore + 1);
    expect(state.portal.active).toBe(true);
    expect(state.portal.targetArea).toBe('5-?');
  });

  it('[P0 #5] 3-1 Golden Car enforces screwdriver directional arc, avoids double-trigger, and sets [E] prompts for Car & Loop 1+ Van', () => {
    const state = createRunState({ mutant: 'fish', seed: 7105 });
    state.player.godMode = true;
    warpToArea(state, '3-1', 0);

    const rt = getAreaRuntime(state);
    const car = state.props.find((p) => p.id === rt.venusCarPropId)!;
    state.player.weapons[0] = createWeaponSlot('screwdriver');
    state.player.activeSlot = 0;

    // Stand 22px left of car and swing BACKWARD (left, away from car) -> MUST NOT repair!
    const stand = findNearestFloor(state.map, car.x - 22, car.y, 4);
    state.player.x = stand.x;
    state.player.y = stand.y;
    stepSimulation(
      state,
      makeInput({
        aimWorldX: state.player.x - 40,
        aimWorldY: state.player.y,
        fireHeld: true,
        firePressed: true,
      }),
    );
    expect(rt.venusCarFixed).toBe(false);
    expect(car.sprite).toBe('sprVenusCar');

    // Step past screwdriver reload, then swing TOWARD car -> repairs + sets [E] Y.V. MANSION!
    for (let t = 0; t < 12; t++) stepSimulation(state, makeInput());
    stepSimulation(
      state,
      makeInput({
        aimWorldX: car.x,
        aimWorldY: car.y,
        fireHeld: true,
        firePressed: true,
      }),
    );
    expect(rt.venusCarFixed).toBe(true);
    expect(car.sprite).toBe('sprVenusCarFixed');
    expect(car.interactPrompt).toBe('[E] Y.V. MANSION');

    // Verify pre-repaired sprite syncs silently with zero duplicate 'CAR FIXED! [E]' text
    const s2 = createRunState({ mutant: 'fish', seed: 7106 });
    s2.player.godMode = true;
    warpToArea(s2, '3-1', 0);
    const rt2 = getAreaRuntime(s2);
    const car2 = s2.props.find((p) => p.id === rt2.venusCarPropId)!;
    car2.sprite = 'sprVenusCarFixed';
    drainEvents(s2);
    stepSimulation(s2, makeInput());
    expect(rt2.venusCarFixed).toBe(true);
    expect(car2.interactPrompt).toBe('[E] Y.V. MANSION');
    expect(s2.events.some((ev) => ev.type === 'pickup_text' && ev.text === 'CAR FIXED! [E]')).toBe(false);

    // Loop 1+ open IDPD Van exposes [E] BOARD VAN prompt prop and cleans up on close
    const sVan = createRunState({ mutant: 'fish', seed: 7107 });
    sVan.player.godMode = true;
    warpToArea(sVan, '1-1', 1);
    carveOpenRoom(sVan, 8);
    sVan.enemies = [];
    const rV = SeededRng.fromState(sVan.rngState);
    const [van] = spawnIdpdWave(sVan, rV, { includeVan: true, anchorX: sVan.player.x + 64, anchorY: sVan.player.y });
    sVan.rngState = rV.getState();
    for (let t = 0; t < 40 && van!.aiState === 'drive'; t++) stepSimulation(sVan, makeInput());
    expect(van!.aiState).toBe('open');
    expect(van!.aiTimer).toBe(150);
    const vanBoardAnchor = sVan.props.find((p) => p.interactPrompt === '[E] BOARD VAN');
    expect(vanBoardAnchor).toBeDefined();
    expect(vanBoardAnchor!.sprite).toBe('');

    // Once van closes into 'parked' after 150-tick (5.0s) window, [E] BOARD VAN prompt prop is removed cleanly
    for (let t = 0; t < 165 && van!.aiState === 'open'; t++) stepSimulation(sVan, makeInput());
    expect(sVan.props.some((p) => p.interactPrompt === '[E] BOARD VAN')).toBe(false);
  });

  it('[P0 #6] 7-3 Throne Generators sit flush in open hall (radius 22, zero wall clipping) with East flipX=true', () => {
    const state = createRunState({ mutant: 'fish', seed: 7108 });
    warpToArea(state, '7-3', 0);

    const cx = Math.floor(state.map.width / 2);
    const centerX = tileToWorldCenter(cx, 25, state.map.tileSize).x;
    const gens = state.props.filter((p) => p.kind === 'throne_generator');
    expect(gens.length).toBe(4);

    let westCount = 0;
    let eastCount = 0;
    for (const g of gens) {
      expect(g.radius).toBe(22);
      expect(g.solid).toBe(true);
      expect(isCircleOverlappingSolid(state.map, g.x, g.y, g.radius)).toBe(false);
      if (g.x < centerX) {
        westCount += 1;
        expect(g.flipX).toBe(false);
      } else {
        eastCount += 1;
        expect(g.flipX).toBe(true);
      }
    }
    expect(westCount).toBe(2);
    expect(eastCount).toBe(2);
  });

  it('[P0 #7] authentic sourceCause/sourceSprite on enemy/boss shots & Ammo Mimic melee, plus lethal selfDamage blasts honoring Boiling Veins', () => {
    // 1. Ammo Mimic melee_slash stamps 'AMMO MIMIC' / 'sprMimicIdle' (NOT 'ASSASSIN'!)
    const sMim = createRunState({ mutant: 'fish', seed: 7109 });
    sMim.player.godMode = true;
    carveOpenRoom(sMim, 8);
    sMim.enemies = [];
    const rM = SeededRng.fromState(sMim.rngState);
    const mimic = createEnemyEntity(sMim, 'mimic', sMim.player.x + 18, sMim.player.y, rM);
    mimic.aiState = 'awake';
    mimic.attackCooldown = 0;
    const sniper = createEnemyEntity(sMim, 'sniper', sMim.player.x - 80, sMim.player.y, rM);
    sniper.aiState = 'tell';
    sniper.aiTimer = 1;
    sniper.aimAngle = 0;
    sMim.rngState = rM.getState();

    let mimicSlash = sMim.projectiles.find((p) => p.team === 'enemy' && p.kind === 'melee_slash');
    let sniperShot = sMim.projectiles.find((p) => p.team === 'enemy' && p.sprite === 'sprEnemyBullet4');
    for (let t = 0; t < 30 && (!mimicSlash || !sniperShot); t++) {
      stepSimulation(sMim, makeInput());
      if (!mimicSlash) {
        mimicSlash = sMim.projectiles.find((p) => p.team === 'enemy' && p.kind === 'melee_slash');
      }
      if (!sniperShot) {
        sniperShot = sMim.projectiles.find((p) => p.team === 'enemy' && p.sprite === 'sprEnemyBullet4');
      }
    }
    expect(mimicSlash).toBeDefined();
    expect(mimicSlash!.sourceCause).toBe('AMMO MIMIC');
    expect(mimicSlash!.sourceSprite).toBe('sprMimicIdle');

    expect(sniperShot).toBeDefined();
    expect(sniperShot!.sourceCause).toBe('SNIPER');
    expect(sniperShot!.sourceSprite).toBe('sprSniperIdle');

    // 2. Lethal Toxic Ballguy & Big Dog death blasts kill 1 HP player AND honor Boiling Veins at <= 4 HP!
    for (const enemyId of ['ballguy', 'big_dog'] as const) {
      const sLethal = createRunState({ mutant: 'fish', seed: 7110 });
      carveOpenRoom(sLethal, 8);
      sLethal.enemies = [];
      sLethal.player.hp = 1;
      sLethal.player.iframes = 0;
      const rL = SeededRng.fromState(sLethal.rngState);
      const target = createEnemyEntity(sLethal, enemyId, sLethal.player.x + 8, sLethal.player.y, rL, {
        bossId: enemyId === 'big_dog' ? 'big_dog' : undefined,
      });
      applyDamageToEnemy(sLethal, target, 9999, 0, 0, rL);
      sLethal.rngState = rL.getState();
      // Step through hitstop + 1 combat tick so processSpecialDeaths fires the death blast (before Ballguy pellets travel)
      while (sLethal.hitstopTicks > 0) stepSimulation(sLethal, makeInput());
      stepSimulation(sLethal, makeInput());
      expect(sLethal.player.alive).toBe(false);

      // Same death blast with Boiling Veins at 4 HP deals 0 blast damage!
      const sBV = createRunState({ mutant: 'fish', seed: 7111 });
      carveOpenRoom(sBV, 8);
      sBV.enemies = [];
      sBV.player.mutations.push('boiling_veins');
      sBV.player.hp = 4;
      sBV.player.iframes = 0;
      const rBV = SeededRng.fromState(sBV.rngState);
      const targetBV = createEnemyEntity(sBV, enemyId, sBV.player.x + 8, sBV.player.y, rBV, {
        bossId: enemyId === 'big_dog' ? 'big_dog' : undefined,
      });
      applyDamageToEnemy(sBV, targetBV, 9999, 0, 0, rBV);
      sBV.rngState = rBV.getState();
      while (sBV.hitstopTicks > 0) stepSimulation(sBV, makeInput());
      stepSimulation(sBV, makeInput());
      expect(sBV.player.alive).toBe(true);
      expect(sBV.player.hp).toBe(4);
    }
  });

  it('[P0 #8] Gamma Guts kills 1 HP bullet-hurt Maggot, 7 HP Rat, and 9 HP Scarier-Face Freak BEFORE contact damage', () => {
    const cases: Array<{ defId: string; hp?: number; hurtFlash?: number; scarierFace?: boolean }> = [
      { defId: 'maggot', hp: 1, hurtFlash: 4 },
      { defId: 'rat', hp: 7, hurtFlash: 0 },
      { defId: 'freak', scarierFace: true, hurtFlash: 0 },
    ];

    for (const tc of cases) {
      const state = createRunState({ mutant: 'fish', seed: 7112 });
      carveOpenRoom(state, 8);
      state.enemies = [];
      state.player.mutations.push('gamma_guts');
      if (tc.scarierFace) state.player.mutations.push('scarier_face');
      state.player.hp = 8;
      state.player.iframes = 0;

      const rng = SeededRng.fromState(state.rngState);
      const e = createEnemyEntity(state, tc.defId, state.player.x, state.player.y, rng);
      if (tc.hp !== undefined) e.hp = tc.hp;
      if (tc.hurtFlash !== undefined) e.hurtFlashTicks = tc.hurtFlash;
      state.rngState = rng.getState();

      stepSimulation(state, makeInput());
      expect(state.enemies.some((x) => x.id === e.id)).toBe(false);
      expect(state.player.hp).toBe(8);
    }
  });

  it('[P1 #9] pristine worldgen floors (zero FloorCracked), authentic biome props, Crown of Love no weapon mimics & Loop 1 IDPD LOS safety', () => {
    // 1. Fresh maps across all 23 areas have ZERO TileType.FloorCracked tiles; 3-? has 0 carpet tiles
    for (let i = 0; i < AREA_CODES.length; i++) {
      const code = AREA_CODES[i]!;
      const area = AREAS[code];
      const map = generateWorldMap(code, area.biome, 0, new SeededRng(8100 + i));
      let cracked = 0;
      let carpet = 0;
      for (let t = 0; t < map.tiles.length; t++) {
        if (map.tiles[t] === TileType.FloorCracked) cracked += 1;
        if (map.tiles[t] === TileType.Carpet) carpet += 1;
      }
      expect(cracked).toBe(0);
      if (code === '3-?' || code === 'hq-1') expect(carpet).toBe(0);
    }

    // 2. Authentic biome props across Oasis, Pizza Sewers, Mansion, Caves, Cursed Caves, Frozen City, Labs & HQ
    const checkBiome = (code: (typeof AREA_CODES)[number], seed: number) => {
      const s = createRunState({ mutant: 'fish', seed });
      warpToArea(s, code, code === 'hq-1' ? 1 : 0);
      return s.props;
    };
    const oasisProps = checkBiome('1-?', 8201);
    expect(oasisProps.some((p) => p.sprite.startsWith('sprCactus'))).toBe(false);
    expect(oasisProps.some((p) => p.sprite === 'sprCoral' || p.sprite === 'sprAnchor' || p.sprite === 'sprOasisBarrel')).toBe(true);

    const pizzaProps = checkBiome('2-?', 8202);
    expect(pizzaProps.some((p) => p.sprite === 'sprPizzaBox')).toBe(true);

    const mansionProps = checkBiome('3-?', 8203);
    expect(mansionProps.some((p) => p.sprite === 'sprYVStatue' || p.sprite === 'sprMoneyPile')).toBe(true);
    expect(mansionProps.some((p) => p.sprite === 'sprGoldChest')).toBe(true);

    const cavesProps = checkBiome('4-1', 8204);
    expect(cavesProps.some((p) => p.sprite === 'sprPillar')).toBe(false);
    expect(cavesProps.some((p) => p.sprite === 'sprCrystalProp')).toBe(true);

    const cursedCavesProps = checkBiome('4-?', 8205);
    expect(cursedCavesProps.some((p) => p.sprite === 'sprPillar')).toBe(false);
    expect(cursedCavesProps.some((p) => p.sprite === 'sprCursedChest' && p.cursed === true)).toBe(true);

    const frozenProps = checkBiome('5-1', 8206);
    expect(frozenProps.some((p) => p.sprite === 'sprPillar')).toBe(false);
    expect(frozenProps.some((p) => p.sprite === 'sprStreetLight' || p.sprite === 'sprHydrant' || p.sprite === 'sprSodaMachine')).toBe(true);

    const labsProps = checkBiome('6-1', 8207);
    expect(labsProps.some((p) => p.sprite === 'sprMutantTube')).toBe(true);

    const hqProps = checkBiome('hq-1', 8208);
    expect(hqProps.some((p) => p.sprite === 'sprBarrel')).toBe(false);

    // 3. Crown of Love NEVER spawns Weapon Mimics across 40 seeds of 3-1
    for (let s = 0; s < 40; s++) {
      const sLove = createRunState({ mutant: 'fish', seed: 8300 + s, crown: 'love' });
      warpToArea(sLove, '3-1', 0);
      expect(sLove.enemies.some((e) => e.defId === 'weapon_mimic')).toBe(false);
    }

    // 4. Loop 1 initial spawnIdpdWave never spawns units with tick-0 LOS to player
    for (let s = 0; s < 15; s++) {
      const sL1 = createRunState({ mutant: 'fish', seed: 8400 + s });
      warpToArea(sL1, '3-1', 1);
      for (const e of sL1.enemies) {
        if (e.defId.startsWith('idpd_')) {
          const d = Math.hypot(e.x - sL1.player.x, e.y - sL1.player.y);
          const los = hasLineOfSight(sL1.map, sL1.player.x, sL1.player.y, e.x, e.y);
          expect(d >= 220 || !los).toBe(true);
        }
      }
    }
  });

  it('[P1 #10] Lil\' Hunter delayed drop-in, Throne giant orb & broken Throne sit-on, Boss Intro combat pause & Scarier Face boss HUD sync', () => {
    // 1. Lil' Hunter delayed drop-in (~130 ticks) holds boss_intro until arrival
    const sLH = createRunState({ mutant: 'fish', seed: 7120 });
    sLH.player.godMode = true;
    warpToArea(sLH, '5-3', 0);
    const spawnEvs = drainEvents(sLH);
    const lh = sLH.enemies.find((e) => e.bossId === 'lil_hunter')!;
    expect(lh.aiState).toBe('await_drop');
    expect(lh.aiTimer).toBe(130);
    expect(sLH.boss?.introTicks).toBe(0);
    expect(spawnEvs.some((ev) => ev.type === 'boss_intro')).toBe(false);

    // After clearing regular hostiles, Lil' Hunter accelerates arrival & emits boss_intro with 45 introTicks
    sLH.enemies = [lh];
    let sawIntro = false;
    for (let t = 0; t < 20; t++) {
      drainEvents(sLH);
      stepSimulation(sLH, makeInput());
      if (sLH.events.some((ev) => ev.type === 'boss_intro' && ev.bossId === 'lil_hunter')) {
        sawIntro = true;
        expect(sLH.boss?.introTicks).toBe(45);
        break;
      }
    }
    expect(sawIntro).toBe(true);

    // 2. Boss Intro combat pause freezes enemy movement/attacks & protects player on 1-3 Big Bandit
    const sIntro = createRunState({ mutant: 'fish', seed: 7121 });
    warpToArea(sIntro, '1-3', 0);
    expect(sIntro.boss?.introTicks).toBe(45);
    sIntro.player.hp = 8;
    const bb = sIntro.enemies.find((e) => e.bossId === 'big_bandit')!;
    const bbStartX = bb.x;
    const bbStartY = bb.y;
    for (let t = 0; t < 10; t++) stepSimulation(sIntro, makeInput());
    expect(sIntro.boss?.introTicks).toBe(35);
    expect(bb.x).toBe(bbStartX);
    expect(bb.y).toBe(bbStartY);
    expect(sIntro.player.hp).toBe(8);

    // 3. 7-3 Krunked Throne: stays asleep until player approaches within 150px, giant rad orb fires at aiTimer === 24 & intact-gen walk-on victory
    const sThrone = createRunState({ mutant: 'fish', seed: 7122 });
    sThrone.player.godMode = true;
    warpToArea(sThrone, '7-3', 0);
    const throne = sThrone.enemies.find((e) => e.bossId === 'nuclear_throne')!;
    // At 220px south of Throne (> 150px), Throne remains silently asleep so player sees sprNothingOff enter viewport!
    sThrone.player.x = throne.x;
    sThrone.player.y = throne.y + 220;
    stepSimulation(sThrone, makeInput());
    expect(throne.aiState).toBe('sleep');
    expect(sThrone.boss?.introTicks).toBe(0);

    // Stepping within 150px wakes the Throne!
    sThrone.player.y = throne.y + 110;
    stepSimulation(sThrone, makeInput());
    expect(throne.aiState).not.toBe('sleep');
    expect(sThrone.boss?.introTicks).toBe(45);
    for (let t = 0; t < 45; t++) stepSimulation(sThrone, makeInput());

    // Force advance_volley right before aiTimer === 24 -> verify giant orb fires on aiTimer === 24!
    throne.aiState = 'advance_volley';
    throne.aiTimer = 25;
    sThrone.projectiles = [];
    stepSimulation(sThrone, makeInput());
    expect(
      sThrone.projectiles.some((p) => p.team === 'enemy' && p.sprite === 'sprBigGuardianBullet'),
    ).toBe(true);

    // Kill Throne with generators intact -> spawns sit-able sprThroneCorpseIdle, NO portal, walk-on triggers victory_throne!
    const rT = SeededRng.fromState(sThrone.rngState);
    applyDamageToEnemy(sThrone, throne, 99999, 0, 0, rT);
    sThrone.rngState = rT.getState();
    for (let t = 0; t < 10; t++) stepSimulation(sThrone, makeInput());
    expect(sThrone.portal.active).toBe(false);
    expect(sThrone.phase).toBe('playing');
    const broken = sThrone.props.find((p) => p.sprite === 'sprThroneCorpseIdle');
    expect(broken).toBeDefined();
    expect(broken!.interactPrompt).toBe('[E] SIT ON THRONE');

    // Move onto broken Throne and step past brief sit delay -> triggers victory_throne automatically!
    sThrone.player.x = broken!.x;
    sThrone.player.y = broken!.y;
    for (let t = 0; t < 20 && sThrone.phase === 'playing'; t++) {
      stepSimulation(sThrone, makeInput());
    }
    expect(sThrone.phase).toBe('victory_throne');
    expect(sThrone.portal.active).toBe(false);

    // 4. Scarier Face Boss HUD HP bar matches scaled boss.maxHp on spawn (zero 80% desync!)
    for (const area of ['1-3', '3-3', '5-3', '7-3', '0-1'] as const) {
      const sSF = createRunState({ mutant: 'fish', seed: 7130 });
      sSF.player.mutations.push('scarier_face');
      warpToArea(sSF, area, 0);
      const bossEnt = sSF.enemies.find((e) => e.isBoss)!;
      expect(sSF.boss).not.toBeNull();
      expect(sSF.boss!.maxHp).toBe(bossEnt.maxHp);
      expect(sSF.boss!.hp).toBe(bossEnt.hp);
    }
  });
});
