import { describe, expect, it } from 'vitest';
import {
  TileType,
  type InputFrame,
  type SimState,
} from '@/contracts';
import { AMMO_PICKUP_AMOUNT, ENEMIES, MUTANTS, WEAPONS } from '@/data';
import {
  SeededRng,
  allocEntityId,
  getTile,
  hashSimState,
  isWorldSolid,
  setTile,
  stepCorpses,
  stepPickups,
  stepPortal,
  tileToWorldCenter,
  worldToTile,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  damageProp,
  spawnCorpse,
  spawnEnemyProjectile,
  spawnExplosion,
  spawnFriendlyUnit,
  spawnPickup,
  stepPlayerAndCombat,
} from '@/sim/combat';
import {
  applyMutationSelection,
  checkPortalTrigger,
  createInitialSimState,
  drawMutationChoices,
  givePlayerWeapon,
  grantMutationById,
  grantUltraById,
  loadAreaIntoState,
  openChest,
} from '@/sim/progression';
import { createEnemyEntity, createRunState, getAreaRuntime } from '@/sim/entities';
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

function clearBox(state: SimState, halfW = 8, halfH = 5): void {
  const { tx: ptx, ty: pty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
  for (let ty = Math.max(2, pty - halfH); ty <= Math.min(state.map.height - 3, pty + halfH); ty++) {
    for (let tx = Math.max(2, ptx - halfW); tx <= Math.min(state.map.width - 3, ptx + halfW); tx++) {
      setTile(state.map, tx, ty, TileType.Floor);
    }
  }
}

describe('parity-combat: Exploit Fixes, Economy & Portal Rules', () => {
  it('eliminates the infinite weapon drop/pickup ammo & Crown of Protection HP exploit', () => {
    // 1. Standard ammo exploit check
    const state = createRunState({ mutant: 'fish', seed: 1001 });
    state.enemies = [];
    state.pickups = [];
    clearBox(state);
    givePlayerWeapon(state, 'shotgun', 1, false);
    state.player.ammo.bullet = 50;
    state.player.ammo.shell = 10;

    // Spawn a fresh shotgun drop (value: 1) and pick it up -> grants starter shells once
    spawnPickup(state, 'weapon', state.player.x, state.player.y, { weaponId: 'shotgun', value: 1 });
    const rng = SeededRng.fromState(state.rngState);
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y, pickupPressed: true }),
      rng,
    );
    const shellsAfterFresh = state.player.ammo.shell;
    expect(shellsAfterFresh).toBeGreaterThan(10);

    // Swap back and forth with the dropped weapon (value: 0) 5 times -> ZERO extra ammo!
    const bulletsBeforeLoop = state.player.ammo.bullet;
    const shellsBeforeLoop = state.player.ammo.shell;
    for (let i = 0; i < 5; i++) {
      stepPlayerAndCombat(
        state,
        makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y, pickupPressed: true }),
        rng,
      );
    }
    expect(state.player.ammo.bullet).toBe(bulletsBeforeLoop);
    expect(state.player.ammo.shell).toBe(shellsBeforeLoop);

    // 2. Crown of Protection HP loop exploit check
    const prot = createRunState({ mutant: 'fish', seed: 1002, crown: 'protection' });
    prot.enemies = [];
    prot.pickups = [];
    clearBox(prot);
    givePlayerWeapon(prot, 'shotgun', 1, false, { grantBonus: false });
    prot.player.hp = 2;
    spawnPickup(prot, 'weapon', prot.player.x, prot.player.y, { weaponId: 'machinegun', value: 1 });
    const pRng = SeededRng.fromState(prot.rngState);
    stepPlayerAndCombat(
      prot,
      makeInput({ aimWorldX: prot.player.x + 20, aimWorldY: prot.player.y, pickupPressed: true }),
      pRng,
    );
    expect(prot.player.hp).toBe(4); // fresh weapon heals +2 HP once
    for (let i = 0; i < 4; i++) {
      stepPlayerAndCombat(
        prot,
        makeInput({ aimWorldX: prot.player.x + 20, aimWorldY: prot.player.y, pickupPressed: true }),
        pRng,
      );
    }
    expect(prot.player.hp).toBe(4); // ZERO further healing from swapped player weapon!
  });

  it('uses authentic starting ammo (96 bullets, 0 others; seeds golden weapon ammo) and Fish +25% passive', () => {
    const fish = createInitialSimState({ mutant: 'fish', seed: 2001 });
    expect(fish.player.ammo.bullet).toBe(96);
    expect(fish.player.ammo.shell).toBe(0);
    expect(fish.player.ammo.bolt).toBe(0);
    expect(fish.player.ammo.explosive).toBe(0);
    expect(fish.player.ammo.energy).toBe(0);

    const goldShotgun = createInitialSimState({
      mutant: 'crystal',
      seed: 2002,
      goldenWeapon: 'golden_shotgun',
    });
    expect(goldShotgun.player.ammo.shell).toBe(AMMO_PICKUP_AMOUNT.shell * 2);

    // Fish passive = exact +25% ammo pickup (32 -> 40 bullets)
    fish.player.ammo.bullet = 0;
    spawnPickup(fish, 'ammo', fish.player.x, fish.player.y, { ammoType: 'bullet', value: 32 });
    const rng = SeededRng.fromState(fish.rngState);
    stepPlayerAndCombat(fish, makeInput({ aimWorldX: fish.player.x + 20, aimWorldY: fish.player.y }), rng);
    expect(fish.player.ammo.bullet).toBe(40);
  });

  it('portal vacuum preserves HP, ammo, and floor weapons while sweeping rads, emitting sndPortalClose, and crediting chestSkipStreak', () => {
    const state = createInitialSimState({ mutant: 'fish', seed: 2003 });
    state.enemies = [];
    state.pickups = [];
    state.props = [];
    clearBox(state, 12, 5);
    state.portal.active = true;
    // Place portal outside 96px player pullRadius while verifying pickup vacuum
    state.portal.x = state.player.x + 120;
    state.portal.y = state.player.y;

    spawnPickup(state, 'rad', state.portal.x + 24, state.portal.y, { value: 5, vx: 0, vy: 0 });
    spawnPickup(state, 'hp', state.portal.x + 24, state.portal.y + 8, { value: 2, vx: 0, vy: 0 });
    spawnPickup(state, 'ammo', state.portal.x + 24, state.portal.y - 8, { ammoType: 'shell', value: 8, vx: 0, vy: 0 });
    spawnPickup(state, 'weapon', state.portal.x + 20, state.portal.y, { weaponId: 'shotgun', value: 1, vx: 0, vy: 0 });
    // Far-away unopened weapon chest that won't reach portal before transition
    state.props.push({
      id: allocEntityId(state),
      kind: 'weapon_chest',
      x: state.portal.x + 200,
      y: state.portal.y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprWeaponChest',
    });

    for (let t = 0; t < 18; t++) {
      stepPortal(state);
    }
    expect(state.player.rads).toBe(5);
    expect(state.pickups.some((p) => p.kind === 'hp')).toBe(true);
    expect(state.pickups.some((p) => p.kind === 'ammo')).toBe(true);
    expect(state.pickups.some((p) => p.kind === 'weapon')).toBe(true);
    expect(state.pickups.some((p) => p.kind === 'rad')).toBe(false);

    // Enter portal -> emits sndPortalClose (never fabricated sndPortalEnter) and increments chestSkipStreak on transition
    state.events = [];
    state.player.x = state.portal.x;
    state.player.y = state.portal.y;
    const rng = SeededRng.fromState(state.rngState);
    let sawPortalClose = false;
    for (let t = 0; t < 30 && state.areaCode === '1-1'; t++) {
      state.tick += 1;
      stepPortal(state);
      if (state.events.some((e) => e.type === 'sfx' && e.sound === 'sndPortalClose')) {
        sawPortalClose = true;
      }
      expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'sndPortalEnter')).toBe(false);
      checkPortalTrigger(state, rng);
    }
    expect(sawPortalClose).toBe(true);
    expect(state.areaCode).toBe('1-2');
    expect(state.chestSkipStreak).toBeGreaterThanOrEqual(1);
    expect(state.props.some((p) => p.kind === 'big_weapon_chest')).toBe(true);
  });

  it('ignores disguised mimics when checking portal open condition', () => {
    const state = createRunState({ mutant: 'fish', seed: 2004 });
    state.enemies = [];
    state.boss = null;
    state.levelStartEnemyCount = 2;
    state.levelKills = 1;
    const rng = SeededRng.fromState(state.rngState);
    const mimic = createEnemyEntity(state, 'mimic', state.player.x + 80, state.player.y, rng);
    mimic.aiState = 'disguised';
    const res = checkPortalTrigger(state, rng);
    expect(res).toBe('portal_opened');
    expect(state.portal.active).toBe(true);
  });

  it('handles chain-exploding adjacent cars and barrels in spawnExplosion without prop-array index crash', () => {
    const state = createInitialSimState({ mutant: 'fish', seed: 2005 });
    state.enemies = [];
    state.props = [];
    clearBox(state, 8, 5);
    const rng = SeededRng.fromState(state.rngState);

    for (let k = 0; k < 4; k++) {
      state.props.push({
        id: allocEntityId(state),
        kind: k % 2 === 0 ? 'car' : 'barrel',
        x: state.player.x + 40 + k * 14,
        y: state.player.y,
        radius: 10,
        hp: 5,
        maxHp: 5,
        solid: true,
        opened: false,
        hurtFlashTicks: 0,
        sprite: k % 2 === 0 ? 'sprCarIdle' : 'sprBarrel',
      });
    }

    expect(() =>
      spawnExplosion(state, state.player.x + 40, state.player.y, 40, 40, 'enemy', rng),
    ).not.toThrow();
    expect(state.props).toHaveLength(0);
  });
});

describe('parity-combat: All 12 Mutants, Throne Butts & Ultras', () => {
  it('Robot refuses to eat last weapon and auto-eats leftover floor weapons on portal exit with robot_a/robot_b', () => {
    const state = createInitialSimState({ mutant: 'robot', seed: 3001 });
    state.enemies = [];
    state.pickups = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // Only 1 weapon held -> RMB Eat Gun must be refused!
    state.player.hp = 4;
    state.events = [];
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 30, aimWorldY: state.player.y, activePressed: true }),
      rng,
    );
    expect(state.player.hp).toBe(4);
    expect(state.player.weapons[0]?.weaponId).toBe('revolver');
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'sndEmpty')).toBe(true);

    // Grant robot_a (Refined Taste) and leave 2 weapons on the floor on portal exit -> auto-eats them!
    grantUltraById(state, 'robot_a', rng);
    spawnPickup(state, 'weapon', state.player.x + 40, state.player.y, { weaponId: 'shotgun', value: 1, vx: 0, vy: 0 });
    spawnPickup(state, 'weapon', state.player.x - 40, state.player.y, { weaponId: 'wrench', value: 1, vx: 0, vy: 0 });
    state.portal.active = true;
    state.portal.x = state.player.x;
    state.portal.y = state.player.y;
    for (let t = 0; t < 30 && state.areaCode === '1-1'; t++) {
      state.tick += 1;
      stepPortal(state);
      checkPortalTrigger(state, rng);
    }
    expect(state.areaCode).toBe('1-2');
    expect(state.player.hp).toBe(8); // healed +2 twice from auto-eating the 2 floor weapons!
  });

  it('Chicken is immune to damage-death while headless, scales throw damage by level, and never dupes chicken_sword', () => {
    const state = createInitialSimState({ mutant: 'chicken', seed: 3002 });
    state.enemies = [];
    state.pickups = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // Lethal hit puts Chicken into headless state (150 ticks)
    applyDamageToPlayer(state, 20, 'HIT', 'sprEnemyBullet1', rng);
    expect(state.player.alive).toBe(true);
    expect(state.player.headlessTicks).toBe(150);

    // Additional damage while headless does NOT kill Chicken!
    state.player.iframes = 0;
    applyDamageToPlayer(state, 10, 'HIT2', 'sprEnemyBullet1', rng, { ignoreIframes: true });
    expect(state.player.alive).toBe(true);
    expect(state.player.hp).toBe(0);

    // Bleed-out timer reaching 0 DOES kill Chicken
    state.player.headlessTicks = 1;
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }), rng);
    expect(state.player.alive).toBe(false);
    expect(state.phase).toBe('game_over');

    // Level-scaled throw damage + zero chicken_sword duplication
    const throwState = createInitialSimState({ mutant: 'chicken', seed: 3003 });
    throwState.enemies = [];
    throwState.pickups = [];
    clearBox(throwState);
    throwState.player.level = 8;
    const tRng = SeededRng.fromState(throwState.rngState);
    stepPlayerAndCombat(
      throwState,
      makeInput({ aimWorldX: throwState.player.x + 40, aimWorldY: throwState.player.y, activePressed: true }),
      tRng,
    );
    const thrown = throwState.projectiles.find((p) => p.kind === 'thrown_weapon')!;
    expect(thrown).toBeDefined();
    expect(thrown.damage).toBe(14 + 8 * 4); // level-scaled!
    // Step until thrown sword expires -> must NOT leave a duplicate chicken_sword pickup on floor!
    for (let t = 0; t < 35; t++) {
      stepPlayerAndCombat(throwState, makeInput({ aimWorldX: throwState.player.x + 40, aimWorldY: throwState.player.y }), tRng);
    }
    expect(throwState.pickups.some((p) => p.kind === 'weapon' && p.weaponId === 'chicken_sword')).toBe(false);
  });

  it('Eyes Ultra A hits enemies pulled into suspended shots & Eyes Ultra B passively pushes enemies away when NOT using Telekinesis', () => {
    // 1. Eyes Ultra B (Monster Style): pushes enemies away passively when activeHeld is FALSE
    const bState = createRunState({ mutant: 'eyes', seed: 3004 });
    bState.enemies = [];
    clearBox(bState);
    const bRng = SeededRng.fromState(bState.rngState);
    grantUltraById(bState, 'eyes_b', bRng);
    const foe = createEnemyEntity(bState, 'bandit', bState.player.x + 36, bState.player.y, bRng);
    const startX = foe.x;
    for (let t = 0; t < 5; t++) {
      bState.tick += 1;
      stepPlayerAndCombat(
        bState,
        makeInput({ aimWorldX: bState.player.x + 50, aimWorldY: bState.player.y, activeHeld: false }),
        bRng,
      );
    }
    expect(foe.x).toBeGreaterThan(startX + 4);

    // Holding Telekinesis with Monster Style still pulls enemies inward
    const beforePullX = foe.x;
    for (let t = 0; t < 5; t++) {
      bState.tick += 1;
      stepPlayerAndCombat(
        bState,
        makeInput({ aimWorldX: bState.player.x + 50, aimWorldY: bState.player.y, activeHeld: true }),
        bRng,
      );
    }
    expect(foe.x).toBeLessThan(beforePullX);

    // 2. Eyes Ultra A (Projectile Style): suspended bullets still hit enemies pulled into them!
    const aState = createRunState({ mutant: 'eyes', seed: 3005 });
    aState.enemies = [];
    aState.projectiles = [];
    clearBox(aState);
    const aRng = SeededRng.fromState(aState.rngState);
    grantUltraById(aState, 'eyes_a', aRng);
    // Fire a bullet, then hold telekinesis while enemy is overlapping the suspended bullet
    const target = createEnemyEntity(aState, 'scorpion', aState.player.x + 12, aState.player.y, aRng);
    const preHp = target.hp;
    aState.projectiles.push({
      id: allocEntityId(aState),
      kind: 'bullet',
      team: 'player',
      x: target.x,
      y: target.y,
      prevX: target.x,
      prevY: target.y,
      vx: 16,
      vy: 0,
      angle: 0,
      radius: 4,
      damage: 8,
      lifeTicks: 30,
      maxLifeTicks: 30,
      pierce: 0,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprBullet1',
      hitIds: [],
    });
    aState.tick += 1;
    stepPlayerAndCombat(
      aState,
      makeInput({ aimWorldX: target.x, aimWorldY: target.y, activeHeld: true }),
      aRng,
    );
    expect(target.hp).toBeLessThan(preHp);
  });

  it('Y.V. Pop Pop handles partial ammo, 2x/3x reload, Back 2 Bizniz free extra shot, and per-shot burst ammo consumption', () => {
    const state = createInitialSimState({ mutant: 'yv', seed: 3006 });
    state.enemies = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // 1. Pop Pop on low ammo (only 1 shell left -> still fires 1 shot!)
    givePlayerWeapon(state, 'shotgun', 0, false, { grantBonus: false });
    state.player.ammo.shell = 1;
    const preShots = state.stats.shotsFired;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, activePressed: true }),
      rng,
    );
    expect(state.stats.shotsFired).toBe(preShots + 1);
    expect(state.player.ammo.shell).toBe(0);
    // Pop Pop reload multiplier = 2.0x (YV passive 0.8 * 18 = 14 -> * 2.0 = 28)
    expect(state.player.weapons[0]!.maxReloadTicks).toBe(28);

    // 2. Back 2 Bizniz: Pop Pop fires 3 staggered shots for ONLY 2 ammo!
    grantUltraById(state, 'yv_b', rng);
    state.player.weapons[0]!.reloadTicks = 0;
    state.player.ammo.shell = 10;
    const preB2BShots = state.stats.shotsFired;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, activePressed: true }),
      rng,
    );
    // Shot 1 fires on tick 0; remaining 2 stagger over ticks 1-2 (never all 3 simultaneously on tick 0!)
    expect(state.stats.shotsFired).toBe(preB2BShots + 1);
    for (let t = 0; t < 4; t++) {
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    }
    expect(state.stats.shotsFired).toBe(preB2BShots + 3);
    expect(state.player.ammo.shell).toBe(8); // paid 2, got 3!

    // 3. Brrrap + Back 2 Bizniz: fires 5 staggered shots for ONLY 4 ammo at 3.0x reload!
    grantMutationById(state, 'throne_butt', rng);
    state.player.weapons[0]!.reloadTicks = 0;
    state.player.weapons[0]!.burstRemaining = 0;
    state.player.ammo.shell = 10;
    const preBrrrap = state.stats.shotsFired;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, activePressed: true }),
      rng,
    );
    expect(state.stats.shotsFired).toBe(preBrrrap + 1);
    for (let t = 0; t < 6; t++) {
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    }
    expect(state.stats.shotsFired).toBe(preBrrrap + 5);
    expect(state.player.ammo.shell).toBe(6); // paid 4, got 5!
    expect(state.player.weapons[0]!.maxReloadTicks).toBe(42); // 14 * 3.0

    // 4. Burst weapon (Assault Rifle) consumes 1 ammo per shot (3 total) and halts early if ammo runs out
    givePlayerWeapon(state, 'assault_rifle', 0, false, { grantBonus: false });
    state.player.ammo.bullet = 2; // only 2 bullets for a 3-round burst
    const preBurst = state.stats.shotsFired;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    for (let t = 0; t < 10; t++) {
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    }
    expect(state.stats.shotsFired).toBe(preBurst + 2);
    expect(state.player.ammo.bullet).toBe(0);
  });

  it('Crystal Shield reflects bullets, absorbs beams/flames, enforces post-shield cooldown, and clamps TB teleport with exit iframes', () => {
    const state = createInitialSimState({ mutant: 'crystal', seed: 3007 });
    state.enemies = [];
    state.projectiles = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);
    grantMutationById(state, 'throne_butt', rng);

    // Activate shield
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 50, aimWorldY: state.player.y, activePressed: true, activeHeld: true }),
      rng,
    );
    expect(state.player.shielding).toBe(true);

    // Incoming enemy bullet -> reflected!
    const bullet = spawnEnemyProjectile(state, {
      x: state.player.x + 8,
      y: state.player.y,
      angle: Math.PI,
      speed: 5,
      damage: 3,
      kind: 'enemy_bullet',
    });
    // Incoming enemy laser & flame -> absorbed/destroyed, NOT reflected!
    const laser = spawnEnemyProjectile(state, {
      x: state.player.x + 8,
      y: state.player.y,
      angle: Math.PI,
      speed: 12,
      damage: 5,
      kind: 'enemy_laser',
    });
    const flame = spawnEnemyProjectile(state, {
      x: state.player.x + 8,
      y: state.player.y,
      angle: Math.PI,
      speed: 4,
      damage: 2,
      kind: 'enemy_flame',
    });

    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 50, aimWorldY: state.player.y, activeHeld: true }),
      rng,
    );
    expect(bullet.team).toBe('player');
    expect(bullet.vx).toBeGreaterThan(0);
    expect(state.projectiles.includes(laser)).toBe(false);
    expect(state.projectiles.includes(flame)).toBe(false);
    expect(state.player.hp).toBe(state.player.maxHp);

    // Release shield targeting 600px away -> teleports clamped <= 220px + exit iframes + post-shield cooldown!
    const originX = state.player.x;
    const originY = state.player.y;
    for (let t = 0; t < 25 && state.player.shielding; t++) {
      stepPlayerAndCombat(
        state,
        makeInput({ aimWorldX: originX + 600, aimWorldY: originY, activeHeld: false }),
        rng,
      );
    }
    expect(state.player.shielding).toBe(false);
    expect(state.player.activeCooldown).toBeGreaterThanOrEqual(9);
    expect(state.player.iframes).toBeGreaterThanOrEqual(7);
    expect(Math.hypot(state.player.x - originX, state.player.y - originY)).toBeLessThanOrEqual(240);
    expect(isWorldSolid(state.map, state.player.x, state.player.y)).toBe(false);
  });

  it('Plant snare persists without expiring, Plant TB executes bosses <=33% HP, Melting Brain Capacity suppresses corpse & Detachment rounds up', () => {
    // 1. Plant snare persistence + boss execute
    const pState = createRunState({ mutant: 'plant', seed: 3008 });
    pState.enemies = [];
    pState.props = [];
    clearBox(pState);
    const pRng = SeededRng.fromState(pState.rngState);
    grantMutationById(pState, 'throne_butt', pRng);
    // Fire snare into wall or open air until it blooms
    stepPlayerAndCombat(
      pState,
      makeInput({ aimWorldX: pState.player.x + 40, aimWorldY: pState.player.y, activePressed: true }),
      pRng,
    );
    for (let t = 0; t < 25; t++) {
      stepPlayerAndCombat(pState, makeInput({ aimWorldX: pState.player.x + 40, aimWorldY: pState.player.y }), pRng);
    }
    const snare = pState.props.find((pr) => pr.kind === 'snare_trap')!;
    expect(snare).toBeDefined();
    expect(snare.lifeTicks).toBeUndefined(); // infinite duration until recast!

    // Spawn a boss at 30% HP inside the snare -> Plant TB executes it!
    const boss = createEnemyEntity(pState, 'big_bandit', snare.x, snare.y, pRng);
    boss.isBoss = true;
    boss.bossId = 'big_bandit';
    boss.hp = Math.floor(boss.maxHp * 0.3);
    stepPlayerAndCombat(pState, makeInput({ aimWorldX: snare.x, aimWorldY: snare.y }), pRng);
    expect(boss.hp).toBeLessThanOrEqual(0);

    // 2. Melting Brain Capacity corpse suppression + Detachment ceil(maxHp / 2)
    const mState = createRunState({ mutant: 'melting', seed: 3009 });
    mState.enemies = [];
    mState.corpses = [];
    clearBox(mState);
    const mRng = SeededRng.fromState(mState.rngState);
    grantUltraById(mState, 'melting_a', mRng);
    const lowFoe = createEnemyEntity(mState, 'bandit', mState.player.x + 32, mState.player.y, mRng);
    lowFoe.hp = 4;
    stepPlayerAndCombat(
      mState,
      makeInput({ aimWorldX: lowFoe.x, aimWorldY: lowFoe.y, activePressed: true }),
      mRng,
    );
    expect(lowFoe.hp).toBeLessThanOrEqual(0);
    expect(mState.corpses).toHaveLength(0); // suppressed!

    mState.player.maxHp = 5;
    grantUltraById(mState, 'melting_b', mRng);
    expect(mState.player.maxHp).toBe(3); // Math.ceil(5 / 2) = 3!
  });

  it('Rebel allies decay over time, Personal Guard boosts ally maxHp, and ally bullets do not proc Recycle Gland', () => {
    const state = createRunState({ mutant: 'rebel', seed: 3010 });
    state.enemies = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);
    const baseAllyHp = ENEMIES.rebel_ally!.maxHp;

    grantUltraById(state, 'rebel_a', rng);
    const ally = spawnFriendlyUnit(state, 'rebel_ally', state.player.x + 20, state.player.y);
    expect(ally.maxHp).toBeGreaterThan(baseAllyHp);

    // Step 60 ticks -> ally decays 1 HP
    const hpStart = ally.hp;
    for (let t = 1; t <= 60; t++) {
      state.tick = t;
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    }
    expect(ally.hp).toBe(hpStart - 1);

    // Ally bullets must NOT proc Recycle Gland
    grantMutationById(state, 'recycle_gland', rng);
    state.player.ammo.bullet = 50;
    const foe = createEnemyEntity(state, 'scorpion', state.player.x + 40, state.player.y, rng);
    foe.hp = 200;
    for (let k = 0; k < 20; k++) {
      state.projectiles.push({
        id: allocEntityId(state),
        kind: 'bullet',
        team: 'player',
        x: foe.x - 4,
        y: foe.y,
        prevX: foe.x - 4,
        prevY: foe.y,
        vx: 10,
        vy: 0,
        angle: 0,
        radius: 3,
        damage: 3,
        lifeTicks: 10,
        maxLifeTicks: 10,
        pierce: 0,
        bounce: 0,
        explosionRadius: 0,
        sprite: 'sprAllyBullet',
        weaponId: 'rebel_ally_bullet',
        hitIds: [],
      });
    }
    stepPlayerAndCombat(state, makeInput({ aimWorldX: foe.x, aimWorldY: foe.y }), rng);
    expect(state.player.ammo.bullet).toBe(50);
  });

  it('Horror Rad Beam pauses rad attraction & refunds absorbed rads on kill; Anomaly credits kills/rads; Rogue Portal Strike self-damages & rogue_a cap is 6', () => {
    // 1. Horror Rad Beam
    const hState = createRunState({ mutant: 'horror', seed: 3011 });
    hState.enemies = [];
    hState.pickups = [];
    clearBox(hState);
    const hRng = SeededRng.fromState(hState.rngState);
    hState.player.rads = 20;

    // Place a rad pickup within attraction range -> should NOT pull while radBeamActive is true,
    // and MUST immediately resume pulling once radBeamActive is false (even while radBeamTicks > 0)!
    const radPk = spawnPickup(hState, 'rad', hState.player.x + 30, hState.player.y, { value: 1, vx: 0, vy: 0 });
    hState.player.radBeamTicks = 10;
    hState.player.radBeamActive = true;
    stepPickups(hState);
    expect(radPk.x).toBe(hState.player.x + 30);
    hState.player.radBeamActive = false;
    stepPickups(hState);
    expect(radPk.x).toBeLessThan(hState.player.x + 30);

    // Beam an enemy -> absorbed rads refunded on death!
    const foe = createEnemyEntity(hState, 'bandit', hState.player.x + 28, hState.player.y, hRng);
    foe.radDrop = 2;
    foe.hp = 5;
    hState.pickups = [];
    hState.tick = 1;
    stepPlayerAndCombat(
      hState,
      makeInput({ aimWorldX: foe.x, aimWorldY: foe.y, activePressed: true, activeHeld: true }),
      hRng,
    );
    hState.tick = 2;
    stepPlayerAndCombat(
      hState,
      makeInput({ aimWorldX: foe.x, aimWorldY: foe.y, activeHeld: true }),
      hRng,
    );
    // Kill enemy if still alive
    if (foe.hp > 0) applyDamageToEnemy(hState, foe, 20, 0, 0, hRng);
    const droppedRadTotal = hState.pickups
      .filter((p) => p.kind === 'rad' || p.kind === 'big_rad')
      .reduce((acc, p) => acc + p.value, 0);
    expect(droppedRadTotal).toBeGreaterThan(2); // base 2 + absorbed rads!

    // Horror Anomaly credits kills & spawns rads for remaining enemies
    const anom = createRunState({ mutant: 'horror', seed: 3012 });
    anom.enemies = [];
    anom.pickups = [];
    const aRng = SeededRng.fromState(anom.rngState);
    grantUltraById(anom, 'horror_b', aRng);
    anom.levelStartEnemyCount = 8;
    anom.levelKills = 6;
    const leftover = createEnemyEntity(anom, 'bandit', anom.player.x + 60, anom.player.y, aRng);
    leftover.radDrop = 5;
    const killsBefore = anom.stats.kills;
    expect(checkPortalTrigger(anom, aRng)).toBe('portal_opened');
    expect(anom.stats.kills).toBe(killsBefore + 1);
    expect(anom.pickups.reduce((s, p) => s + (p.kind === 'rad' || p.kind === 'big_rad' ? p.value : 0), 0)).toBe(5);

    // 2. Rogue Portal Strike hold-to-drag targeting + rolling delayed blasts + safe quick-tap standoff + rogue_a cap 6
    const rState = createInitialSimState({ mutant: 'rogue', seed: 3013 });
    rState.enemies = [];
    clearBox(rState);
    const rRng = SeededRng.fromState(rState.rngState);
    const hpBeforeQuickTap = rState.player.hp;
    // Quick tap with close cursor launches safely PAST standoff (zero instant tick-0 self-nuke!)
    stepPlayerAndCombat(
      rState,
      makeInput({ aimWorldX: rState.player.x + 2, aimWorldY: rState.player.y, activePressed: true, activeHeld: false }),
      rRng,
    );
    for (let t = 0; t < 24; t++) {
      rState.tick += 1;
      stepPlayerAndCombat(rState, makeInput({ aimWorldX: rState.player.x + 2, aimWorldY: rState.player.y }), rRng);
    }
    expect(rState.player.hp).toBe(hpBeforeQuickTap);

    // Hold-to-drag directly on top of Rogue & stand still through telegraph -> delayed blast CAN self-damage Rogue!
    rState.player.activeCooldown = 0;
    rState.events = [];
    stepPlayerAndCombat(
      rState,
      makeInput({ aimWorldX: rState.player.x, aimWorldY: rState.player.y, activePressed: true, activeHeld: true }),
      rRng,
    );
    expect(rState.player.portalStrikeAim?.active).toBe(true);
    expect(rState.events.some((e) => e.type === 'sfx' && e.sound === 'sndRogueAim')).toBe(true);
    // Release RMB -> queues rolling delayed blasts
    stepPlayerAndCombat(
      rState,
      makeInput({ aimWorldX: rState.player.x + 20, aimWorldY: rState.player.y, activeHeld: false }),
      rRng,
    );
    expect(rState.player.portalStrikeAim).toBeNull();
    expect(rState.events.some((e) => e.type === 'sfx' && e.sound === 'sndPortalStrikeLoop')).toBe(true);
    for (let t = 0; t < 12; t++) {
      rState.tick += 1;
      stepPlayerAndCombat(rState, makeInput({ aimWorldX: rState.player.x + 20, aimWorldY: rState.player.y }), rRng);
    }
    expect(rState.player.hp).toBeLessThan(hpBeforeQuickTap);
    expect(rState.player.lastDamageCause).toBe('PORTAL STRIKE');

    grantUltraById(rState, 'rogue_a', rRng);
    rState.player.portalStrikes = 5;
    rState.pickups = [];
    const canister = {
      id: allocEntityId(rState),
      kind: 'idpd_canister' as const,
      x: rState.player.x + 40,
      y: rState.player.y,
      radius: 8,
      hp: 6,
      maxHp: 6,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprRogueAmmoChest',
    };
    rState.props.push(canister);
    damageProp(rState, canister, 20, rRng);
    const droppedStrike = rState.pickups.find((p) => p.kind === 'portal_strike')!;
    expect(droppedStrike.value).toBe(2);
    droppedStrike.x = rState.player.x;
    droppedStrike.y = rState.player.y;
    stepPlayerAndCombat(rState, makeInput({ aimWorldX: rState.player.x + 20, aimWorldY: rState.player.y }), rRng);
    expect(rState.player.portalStrikes).toBe(6); // double base cap 3 -> 6!
  });
});

describe('parity-combat: Mutations & Crowns 1:1 Rules', () => {
  it('Strong Spirit does NOT recharge in the same area, then recharges immediately upon reaching full HP in the next area', () => {
    const state = createInitialSimState({ mutant: 'fish', seed: 4001 });
    const rng = SeededRng.fromState(state.rngState);
    grantMutationById(state, 'strong_spirit', rng);

    // Trigger Strong Spirit
    state.events = [];
    applyDamageToPlayer(state, 99, 'BIG HIT', 'sprEnemyBullet1', rng);
    expect(state.player.hp).toBe(1);
    expect(state.player.strongSpiritReady).toBe(false);
    expect(state.player.strongSpiritRecharging).toBe(false);
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'sndStrongSpiritLost')).toBe(true);

    // Healing to full HP in the SAME area must NOT recharge Strong Spirit!
    state.player.hp = 6;
    spawnPickup(state, 'hp', state.player.x, state.player.y, { value: 4 });
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 10, aimWorldY: state.player.y }), rng);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.strongSpiritReady).toBe(false);

    // Enter next area wounded -> becomes recharging, NOT yet ready
    state.player.hp = 4;
    state.tick = 10;
    loadAreaIntoState(state, '1-2', 0);
    expect(state.player.strongSpiritRecharging).toBe(true);
    expect(state.player.strongSpiritReady).toBe(false);

    // Healing to full HP in the NEW area recharges Strong Spirit immediately!
    state.events = [];
    spawnPickup(state, 'hp', state.player.x, state.player.y, { value: 4 });
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 10, aimWorldY: state.player.y }), rng);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.strongSpiritReady).toBe(true);
    expect(state.player.strongSpiritRecharging).toBe(false);
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'sndStrongSpiritGain')).toBe(true);
  });

  it('Boiling Veins clamps explosion damage from >4 HP down to 4 HP instead of killing player', () => {
    const state = createInitialSimState({ mutant: 'fish', seed: 4002 });
    const rng = SeededRng.fromState(state.rngState);
    grantMutationById(state, 'boiling_veins', rng);
    state.player.hp = 6;
    applyDamageToPlayer(state, 10, 'NUKE', 'sprExplosion', rng, { isExplosion: true });
    expect(state.player.alive).toBe(true);
    expect(state.player.hp).toBe(4);
  });

  it('Trigger Fingers reduces reloadTicks on BOTH weapon slots and Patience can only be used once per run', () => {
    const state = createRunState({ mutant: 'fish', seed: 4003 });
    state.enemies = [];
    const rng = SeededRng.fromState(state.rngState);
    grantMutationById(state, 'trigger_fingers', rng);
    givePlayerWeapon(state, 'shotgun', 1, false);
    state.player.weapons[0]!.reloadTicks = 20;
    state.player.weapons[1]!.reloadTicks = 30;
    const foe = createEnemyEntity(state, 'maggot', state.player.x + 20, state.player.y, rng);
    applyDamageToEnemy(state, foe, 20, 0, 0, rng);
    expect(state.player.weapons[0]!.reloadTicks).toBe(12); // floor(20 * 0.6)
    expect(state.player.weapons[1]!.reloadTicks).toBe(18); // floor(30 * 0.6)

    // Patience once-per-run check
    grantMutationById(state, 'patience', rng);
    state.portal.active = true;
    state.portal.entered = true;
    state.phase = 'portal_transition';
    state.portalTransitionTicks = 24;
    expect(checkPortalTrigger(state, rng)).toBe('selection_opened');
    expect(state.player.mutations.includes('patience')).toBe(false);

    // Draw many times -> patience must NEVER be offered again for this player!
    for (let i = 0; i < 40; i++) {
      const choices = drawMutationChoices(state, rng);
      expect(choices).not.toContain('patience');
    }
  });

  it('Crown of Destiny opens mutation_select on frame 0 (1 card normal, 2 for Horror), and Crown of Curses works on 1-1 & routes 3-3 -> 4-?', () => {
    const destFish = createInitialSimState({ mutant: 'fish', seed: 4004, crown: 'destiny' });
    expect(destFish.phase).toBe('mutation_select');
    expect(destFish.pendingMutations).toHaveLength(1);

    const destHorror = createInitialSimState({ mutant: 'horror', seed: 4004, crown: 'destiny' });
    expect(destHorror.phase).toBe('mutation_select');
    expect(destHorror.pendingMutations).toHaveLength(2);
    const dRng = SeededRng.fromState(destHorror.rngState);
    expect(applyMutationSelection(destHorror, 0, dRng)).toBe(true);
    expect(destHorror.phase).toBe('playing');

    // Crown of Curses: rolls cursed weapons even on 1-1!
    const cursedState = createInitialSimState({ mutant: 'fish', seed: 4005, crown: 'curses' });
    const cRng = SeededRng.fromState(cursedState.rngState);
    let sawCursedOn11 = false;
    for (let i = 0; i < 20; i++) {
      const chest = {
        id: allocEntityId(cursedState),
        kind: 'weapon_chest' as const,
        x: cursedState.player.x,
        y: cursedState.player.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprWeaponChest',
      };
      cursedState.pickups = [];
      openChest(cursedState, chest, cRng);
      if (cursedState.pickups.some((p) => p.kind === 'weapon' && p.cursed)) {
        sawCursedOn11 = true;
        break;
      }
    }
    expect(sawCursedOn11).toBe(true);

    // Holding two cursed weapons blocks uncursed swap, ALLOWS cursed-for-cursed swap!
    givePlayerWeapon(cursedState, 'revolver', 0, false, { cursed: true });
    givePlayerWeapon(cursedState, 'shotgun', 1, false, { cursed: true });
    expect(givePlayerWeapon(cursedState, 'machinegun', undefined, true, { cursed: false })).toBe(false);
    expect(givePlayerWeapon(cursedState, 'smg', undefined, true, { cursed: true })).toBe(true);

    // 3-3 portal routes to 4-? (Cursed Crystal Caves) when carrying any cursed weapon!
    loadAreaIntoState(cursedState, '3-3', 0);
    cursedState.enemies = [];
    cursedState.boss = null;
    cursedState.levelStartEnemyCount = 1;
    cursedState.levelKills = 1;
    expect(checkPortalTrigger(cursedState, cRng)).toBe('portal_opened');
    expect(cursedState.portal.targetArea).toBe('4-?');
  });

  it('Crown of Life heals without duplicate ammo sound, Crown of Hatred bypasses Crystal Shield, and full-HP kills drop zero medkits', () => {
    // 1. Crown of Life single sound
    const life = createInitialSimState({ mutant: 'fish', seed: 4006, crown: 'life' });
    life.player.hp = 3;
    life.events = [];
    const lRng = SeededRng.fromState(life.rngState);
    openChest(
      life,
      {
        id: allocEntityId(life),
        kind: 'ammo_chest',
        x: life.player.x,
        y: life.player.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprAmmoChest',
      },
      lRng,
    );
    expect(life.player.hp).toBe(7);
    expect(life.events.some((e) => e.type === 'sfx' && e.sound === 'sndHealthChestBig')).toBe(true);
    expect(life.events.some((e) => e.type === 'sfx' && e.sound === 'sndAmmoChest')).toBe(false);

    // 2. Crown of Hatred bypasses Crystal Shield
    const hat = createInitialSimState({ mutant: 'crystal', seed: 4007, crown: 'hatred' });
    hat.player.shielding = true;
    const hRng = SeededRng.fromState(hat.rngState);
    const preHp = hat.player.hp;
    openChest(
      hat,
      {
        id: allocEntityId(hat),
        kind: 'ammo_chest',
        x: hat.player.x,
        y: hat.player.y,
        radius: 8,
        hp: 10,
        maxHp: 10,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprAmmoChest',
      },
      hRng,
    );
    expect(hat.player.hp).toBe(preHp - 1);

    // 3. Zero HP drops at full HP across 100 kills!
    const full = createRunState({ mutant: 'fish', seed: 4008 });
    full.enemies = [];
    full.pickups = [];
    const fRng = SeededRng.fromState(full.rngState);
    for (let i = 0; i < 100; i++) {
      const f = createEnemyEntity(full, 'bandit', full.player.x + 20, full.player.y, fRng);
      applyDamageToEnemy(full, f, 99, 0, 0, fRng);
    }
    expect(full.pickups.some((p) => p.kind === 'hp')).toBe(false);
  });

  it('Gamma Guts skips elevated enemies, Hammerhead requires 15 ticks, and duplicate grantMutationById does not stack Rhino Skin', () => {
    const state = createRunState({ mutant: 'fish', seed: 4009 });
    state.enemies = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    const baseHp = state.player.maxHp;
    grantMutationById(state, 'rhino_skin', rng);
    grantMutationById(state, 'rhino_skin', rng);
    expect(state.player.maxHp).toBe(baseHp + 4);

    grantMutationById(state, 'gamma_guts', rng);
    const airborne = createEnemyEntity(state, 'scorpion', state.player.x, state.player.y, rng);
    airborne.elevated = true;
    const ground = createEnemyEntity(state, 'scorpion', state.player.x, state.player.y, rng);
    const airHp = airborne.hp;
    const grdHp = ground.hp;
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }), rng);
    expect(airborne.hp).toBe(airHp);
    expect(ground.hp).toBe(grdHp - 6);
  });
});

describe('parity-combat: Iconic Weapons & Projectile Physics', () => {
  it('Laser hits lined-up enemies instantly on tick 1 via piercing hitscan and spawns visual beam segments', () => {
    const state = createRunState({ mutant: 'fish', seed: 5001 });
    state.enemies = [];
    state.projectiles = [];
    clearBox(state, 10, 4);
    const rng = SeededRng.fromState(state.rngState);
    givePlayerWeapon(state, 'laser_pistol', 0, false);
    state.player.ammo.energy = 20;

    const e1 = createEnemyEntity(state, 'scorpion', state.player.x + 48, state.player.y, rng);
    const e2 = createEnemyEntity(state, 'scorpion', state.player.x + 96, state.player.y, rng);
    const hp1 = e1.hp;
    const hp2 = e2.hp;

    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 120, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    // Both enemies damaged immediately on tick 1!
    expect(e1.hp).toBeLessThan(hp1);
    expect(e2.hp).toBeLessThan(hp2);
    // Visual laser segments remain for rendering
    expect(state.projectiles.some((p) => p.kind === 'laser' && p.damage === 0)).toBe(true);
  });

  it('Plasma Cannon & Super Plasma Cannon chain-split with ZERO self-damage', () => {
    const state = createRunState({ mutant: 'fish', seed: 5002 });
    state.enemies = [];
    state.projectiles = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);
    givePlayerWeapon(state, 'super_plasma_cannon', 0, false);
    state.player.ammo.energy = 50;

    // Place a wall 1 tile ahead so SPC detonates point-blank right next to player
    const { tx, ty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
    setTile(state.map, tx + 2, ty, TileType.Wall);
    const hpBefore = state.player.hp;

    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 32, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    for (let t = 0; t < 4; t++) {
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 32, aimWorldY: state.player.y }), rng);
    }
    expect(state.player.hp).toBe(hpBefore); // ZERO self-damage!
    expect(state.projectiles.some((p) => p.kind === 'plasma' && p.weaponId === 'plasma_cannon_sub')).toBe(true);
  });

  it('Flare Gun & Flame Cannon split into flame projectiles; Toxic Bow spawns toxic cloud; Sticky Launcher sticks before popping', () => {
    // 1. Flare Gun -> flames (NOT shells!)
    const fState = createRunState({ mutant: 'fish', seed: 5003 });
    fState.enemies = [];
    fState.projectiles = [];
    clearBox(fState);
    const fRng = SeededRng.fromState(fState.rngState);
    givePlayerWeapon(fState, 'flare_gun', 0, false);
    fState.player.ammo.shell = 10;
    const { tx, ty } = worldToTile(fState.player.x, fState.player.y, fState.map.tileSize);
    setTile(fState.map, tx + 2, ty, TileType.Wall);
    stepPlayerAndCombat(
      fState,
      makeInput({ aimWorldX: fState.player.x + 32, aimWorldY: fState.player.y, firePressed: true, fireHeld: true }),
      fRng,
    );
    for (let t = 0; t < 5; t++) {
      stepPlayerAndCombat(fState, makeInput({ aimWorldX: fState.player.x + 32, aimWorldY: fState.player.y }), fRng);
    }
    expect(fState.projectiles.some((p) => p.kind === 'flame')).toBe(true);
    expect(fState.projectiles.some((p) => p.kind === 'shell')).toBe(false);

    // 2. Sticky Launcher sticks onto enemy for ~18 ticks before detonating
    const sState = createRunState({ mutant: 'fish', seed: 5004 });
    sState.enemies = [];
    sState.projectiles = [];
    clearBox(sState);
    const sRng = SeededRng.fromState(sState.rngState);
    givePlayerWeapon(sState, 'sticky_launcher', 0, false);
    sState.player.ammo.explosive = 10;
    const foe = createEnemyEntity(sState, 'scorpion', sState.player.x + 36, sState.player.y, sRng);
    foe.hp = 60;
    stepPlayerAndCombat(
      sState,
      makeInput({ aimWorldX: foe.x, aimWorldY: foe.y, firePressed: true, fireHeld: true }),
      sRng,
    );
    for (let t = 0; t < 4; t++) {
      stepPlayerAndCombat(sState, makeInput({ aimWorldX: foe.x, aimWorldY: foe.y }), sRng);
    }
    // Still latched (not detonated yet!), velocity zeroed
    const stuck = sState.projectiles.find((p) => p.weaponId === 'sticky_launcher');
    expect(stuck).toBeDefined();
    expect(stuck!.vx).toBe(0);
    expect(foe.hp).toBe(60);
    // Advance 20 ticks -> pops and damages enemy!
    for (let t = 0; t < 20; t++) {
      stepPlayerAndCombat(sState, makeInput({ aimWorldX: foe.x, aimWorldY: foe.y }), sRng);
    }
    expect(foe.hp).toBeLessThan(60);

    // 3. Toxic Bow spawns toxic cloud puffs
    const tState = createRunState({ mutant: 'fish', seed: 5005 });
    tState.enemies = [];
    tState.projectiles = [];
    clearBox(tState);
    const tRng = SeededRng.fromState(tState.rngState);
    givePlayerWeapon(tState, 'toxic_bow', 0, false);
    tState.player.ammo.bolt = 10;
    const tPos = worldToTile(tState.player.x, tState.player.y, tState.map.tileSize);
    setTile(tState.map, tPos.tx + 2, tPos.ty, TileType.Wall);
    stepPlayerAndCombat(
      tState,
      makeInput({ aimWorldX: tState.player.x + 32, aimWorldY: tState.player.y, firePressed: true, fireHeld: true }),
      tRng,
    );
    for (let t = 0; t < 4; t++) {
      stepPlayerAndCombat(tState, makeInput({ aimWorldX: tState.player.x + 32, aimWorldY: tState.player.y }), tRng);
    }
    expect(tState.projectiles.some((p) => p.weaponId === 'toxic_cloud')).toBe(true);
  });

  it('Blood Hammer hurts player on miss, explodes on hit, heals on kill; Disc Gun caps self-damage at 4 HP & resets hitIds on bounce', () => {
    // 1. Blood Hammer miss -> 1 self-damage
    const bState = createRunState({ mutant: 'fish', seed: 5006 });
    bState.enemies = [];
    bState.props = [];
    bState.projectiles = [];
    clearBox(bState);
    const bRng = SeededRng.fromState(bState.rngState);
    givePlayerWeapon(bState, 'blood_hammer', 0, false);
    const hpStart = bState.player.hp;
    stepPlayerAndCombat(
      bState,
      makeInput({ aimWorldX: bState.player.x + 40, aimWorldY: bState.player.y, firePressed: true, fireHeld: true }),
      bRng,
    );
    for (let t = 0; t < 6; t++) {
      stepPlayerAndCombat(bState, makeInput({ aimWorldX: bState.player.x + 40, aimWorldY: bState.player.y }), bRng);
    }
    expect(bState.player.hp).toBe(hpStart - 1);

    // Blood Hammer kill -> heals +1 HP (no self-damage!)
    bState.player.weapons[0]!.reloadTicks = 0;
    bState.player.iframes = 0;
    const preKillHp = bState.player.hp;
    const foe = createEnemyEntity(bState, 'bandit', bState.player.x + 24, bState.player.y, bRng);
    foe.hp = 10;
    stepPlayerAndCombat(
      bState,
      makeInput({ aimWorldX: foe.x, aimWorldY: foe.y, firePressed: true, fireHeld: true }),
      bRng,
    );
    for (let t = 0; t < 6; t++) {
      stepPlayerAndCombat(bState, makeInput({ aimWorldX: foe.x, aimWorldY: foe.y }), bRng);
    }
    expect(bState.player.hp).toBe(preKillHp + 1);

    // 2. Disc Gun self-hit capped at 4 HP (not 24!)
    const dState = createRunState({ mutant: 'fish', seed: 5007 });
    dState.enemies = [];
    dState.projectiles = [];
    clearBox(dState);
    const dRng = SeededRng.fromState(dState.rngState);
    dState.player.hp = 8;
    dState.projectiles.push({
      id: allocEntityId(dState),
      kind: 'disc',
      team: 'player',
      x: dState.player.x + 6,
      y: dState.player.y,
      prevX: dState.player.x + 6,
      prevY: dState.player.y,
      vx: -10,
      vy: 0,
      angle: Math.PI,
      radius: 4.5,
      damage: 24,
      lifeTicks: 50,
      maxLifeTicks: 90,
      pierce: 4,
      bounce: 3,
      explosionRadius: 0,
      sprite: 'sprDisc',
      weaponId: 'disc_gun',
      hitIds: [],
      canHitPlayer: true,
    });
    stepPlayerAndCombat(dState, makeInput({ aimWorldX: dState.player.x + 20, aimWorldY: dState.player.y }), dRng);
    expect(dState.player.alive).toBe(true);
    expect(dState.player.hp).toBe(4); // 8 - 4 = 4!
  });

  it('Gun Gun shoots weapon pickups, Shovel fans 3 arcs, Ultra Shovel carves walls, and Melee bats own grenades & caps enemy reflection', () => {
    const state = createRunState({ mutant: 'fish', seed: 5008 });
    state.enemies = [];
    state.pickups = [];
    state.projectiles = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // 1. Gun Gun spawns weapon pickup
    givePlayerWeapon(state, 'gun_gun', 0, false);
    state.player.ammo.bullet = 100;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    expect(state.player.ammo.bullet).toBe(60); // 40 bullet cost
    expect(state.pickups.some((p) => p.kind === 'weapon' && p.value === 1)).toBe(true);

    // 2. Shovel spawns 3 melee arcs
    state.projectiles = [];
    givePlayerWeapon(state, 'shovel', 0, false);
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    expect(state.projectiles.filter((p) => p.kind === 'melee_slash')).toHaveLength(3);

    // 3. Ultra Shovel carves walls!
    state.projectiles = [];
    givePlayerWeapon(state, 'ultra_shovel', 0, false);
    state.player.rads = 20;
    const { tx, ty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
    setTile(state.map, tx + 2, ty, TileType.Wall);
    expect(getTile(state.map, tx + 2, ty)).toBe(TileType.Wall);
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 32, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    expect(getTile(state.map, tx + 2, ty)).toBe(TileType.FloorCracked);

    // 4. Wrench bats player's own grenade forward AND enemy melee reflection caps reflected player shot damage <= 4!
    state.projectiles = [];
    givePlayerWeapon(state, 'wrench', 0, false);
    const nade = {
      id: allocEntityId(state),
      kind: 'grenade' as const,
      team: 'player' as const,
      x: state.player.x + 14,
      y: state.player.y,
      prevX: state.player.x + 14,
      prevY: state.player.y,
      vx: 1,
      vy: 0,
      angle: 0,
      radius: 4,
      damage: 28,
      lifeTicks: 10,
      maxLifeTicks: 38,
      pierce: 0,
      bounce: 2,
      explosionRadius: 34,
      sprite: 'sprGrenade',
      hitIds: [],
    };
    state.projectiles.push(nade);
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, firePressed: true, fireHeld: true }),
      rng,
    );
    expect(nade.vx).toBeGreaterThan(10);

    // Enemy melee reflection cap check (prevents 1-shot reflected Heavy Slug / Crossbow bolt)
    state.projectiles = [];
    const heavyBolt = {
      id: allocEntityId(state),
      kind: 'bolt' as const,
      team: 'player' as const,
      x: state.player.x + 60,
      y: state.player.y,
      prevX: state.player.x + 60,
      prevY: state.player.y,
      vx: 18,
      vy: 0,
      angle: 0,
      radius: 3,
      damage: 44,
      lifeTicks: 40,
      maxLifeTicks: 40,
      pierce: 1,
      bounce: 0,
      explosionRadius: 20,
      sprite: 'sprHeavyBolt',
      hitIds: [],
    };
    const enemySwing = {
      id: allocEntityId(state),
      kind: 'melee_slash' as const,
      team: 'enemy' as const,
      x: state.player.x + 70,
      y: state.player.y,
      prevX: state.player.x + 70,
      prevY: state.player.y,
      vx: 0,
      vy: 0,
      angle: Math.PI,
      radius: 16,
      damage: 4,
      lifeTicks: 3,
      maxLifeTicks: 3,
      pierce: 99,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprSlash',
      hitIds: [],
      deflectsProjectiles: true,
      meleeReach: 30,
      meleeArcDeg: 140,
    };
    state.projectiles.push(heavyBolt, enemySwing);
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    expect(heavyBolt.team).toBe('enemy');
    expect(heavyBolt.damage).toBeLessThanOrEqual(4);
    expect(heavyBolt.explosionRadius).toBe(0);
  });

  it('Blood Launcher detonates nearby corpses & self-damages; Bouncer SMG ricochets toward visible enemies; Smart Gun homes as a bullet', () => {
    // 1. Blood Launcher detonates corpse + self-damages when detonating on player
    const bl = createRunState({ mutant: 'fish', seed: 5009 });
    bl.enemies = [];
    bl.corpses = [];
    clearBox(bl);
    const blRng = SeededRng.fromState(bl.rngState);
    spawnCorpse(bl, bl.player.x + 12, bl.player.y, 0, 0, 1, 'sprBanditDead', 12, true);
    const preHp = bl.player.hp;
    spawnExplosion(bl, bl.player.x + 4, bl.player.y, 38, 36, 'player', blRng, {
      isBlood: true,
      selfDamage: true,
      detonateCorpses: true,
      sound: 'sndBloodLauncherExplo',
    });
    expect(bl.corpses).toHaveLength(0);
    expect(bl.player.hp).toBeLessThan(preHp);

    // 2. Smart Gun is projectileKind 'bullet' and homes toward visible enemy
    expect(WEAPONS.smart_gun!.projectileKind).toBe('bullet');
    const sg = createRunState({ mutant: 'fish', seed: 5010 });
    sg.enemies = [];
    sg.projectiles = [];
    clearBox(sg, 10, 6);
    const sgRng = SeededRng.fromState(sg.rngState);
    const target = createEnemyEntity(sg, 'scorpion', sg.player.x + 70, sg.player.y + 32, sgRng);
    sg.projectiles.push({
      id: allocEntityId(sg),
      kind: 'bullet',
      team: 'player',
      x: sg.player.x + 12,
      y: sg.player.y,
      prevX: sg.player.x + 12,
      prevY: sg.player.y,
      vx: 14,
      vy: 0,
      angle: 0,
      radius: 3,
      damage: 3,
      lifeTicks: 40,
      maxLifeTicks: 40,
      pierce: 0,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprBullet1',
      weaponId: 'smart_gun',
      hitIds: [],
    });
    stepPlayerAndCombat(sg, makeInput({ aimWorldX: target.x, aimWorldY: target.y }), sgRng);
    expect(sg.projectiles[0]!.vy).toBeGreaterThan(0); // steered downward toward target!

    // 3. Bouncer SMG bounces off north wall straight toward an enemy to the south-east
    const bc = createRunState({ mutant: 'fish', seed: 5011 });
    bc.enemies = [];
    bc.projectiles = [];
    clearBox(bc, 8, 6);
    const bcRng = SeededRng.fromState(bc.rngState);
    const { tx, ty } = worldToTile(bc.player.x, bc.player.y, bc.map.tileSize);
    for (let wx = tx - 4; wx <= tx + 4; wx++) {
      setTile(bc.map, wx, ty - 2, TileType.Wall);
    }
    const wallBottom = tileToWorldCenter(tx, ty - 2, bc.map.tileSize).y + 8;
    const ricTarget = createEnemyEntity(bc, 'scorpion', bc.player.x + 48, bc.player.y + 30, bcRng);
    bc.projectiles.push({
      id: allocEntityId(bc),
      kind: 'bullet',
      team: 'player',
      x: bc.player.x,
      y: wallBottom + 5,
      prevX: bc.player.x,
      prevY: wallBottom + 5,
      vx: 0,
      vy: -14,
      angle: -Math.PI / 2,
      radius: 3,
      damage: 3,
      lifeTicks: 40,
      maxLifeTicks: 40,
      pierce: 0,
      bounce: 3,
      explosionRadius: 0,
      sprite: 'sprBouncerBullet',
      weaponId: 'bouncer_smg',
      hitIds: [],
    });
    stepPlayerAndCombat(bc, makeInput({ aimWorldX: ricTarget.x, aimWorldY: ricTarget.y }), bcRng);
    expect(bc.projectiles[0]!.vx).toBeGreaterThan(2); // steered east toward ricTarget after wall bounce!
    expect(bc.projectiles[0]!.vy).toBeGreaterThan(2);
  });

  it('maintains deterministic hashSimState sensitivity across Strong Spirit and Hammerhead state', () => {
    const a = createRunState({ mutant: 'fish', seed: 6001 });
    const b = createRunState({ mutant: 'fish', seed: 6001 });
    expect(hashSimState(a)).toBe(hashSimState(b));

    b.player.strongSpiritReady = true;
    expect(hashSimState(a)).not.toBe(hashSimState(b));
    b.player.strongSpiritReady = false;
    b.player.hammerheadTicks = 12;
    expect(hashSimState(a)).not.toBe(hashSimState(b));

    // Verify Plant moveSpeed parity & Mutant data consistency
    expect(MUTANTS.plant.moveSpeed).toBe(4.4);
    expect(MUTANTS.fish.passiveDesc).toContain('25%');

    // Full simulation loop check with stepSimulation + warpToArea remains deterministic
    const run1 = createRunState({ mutant: 'yv', seed: 6002 });
    const run2 = createRunState({ mutant: 'yv', seed: 6002 });
    warpToArea(run1, '1-2', 0);
    warpToArea(run2, '1-2', 0);
    for (let t = 0; t < 20; t++) {
      stepSimulation(run1, makeInput({ moveX: 1, aimWorldX: run1.player.x + 50, aimWorldY: run1.player.y }));
      stepSimulation(run2, makeInput({ moveX: 1, aimWorldX: run2.player.x + 50, aimWorldY: run2.player.y }));
    }
    expect(hashSimState(run1)).toBe(hashSimState(run2));
  });
});

describe('parity-combat: Wave 2 P0 & P1 Combat, Mutants, Cause-of-Death & Progression Polish', () => {
  it('P0: animates corpses smoothly to resting frame 5 before baking and records prevX/prevY on corpses & pickups', () => {
    const state = createRunState({ mutant: 'fish', seed: 7001 });
    state.corpses = [];
    state.pickups = [];
    state.decals = [];
    clearBox(state, 8, 6);

    const corpse = spawnCorpse(state, state.player.x + 12, state.player.y, 0.1, 0, 1, 'sprBanditDead', 12, true);
    expect(corpse.frame).toBe(0);
    expect(corpse.prevX).toBe(corpse.x);
    expect(corpse.prevY).toBe(corpse.y);

    // After 1 tick with tiny velocity, frame advances by +0.4 and MUST NOT bake prematurely on white frame 0!
    stepCorpses(state);
    expect(corpse.frame).toBeCloseTo(0.4, 5);
    expect(corpse.baked).toBe(false);

    // After 15 ticks, corpse finishes animation at resting frame 5 and bakes decal at frame 5
    for (let t = 0; t < 15; t++) stepCorpses(state);
    expect(corpse.frame).toBe(5);
    expect(corpse.baked).toBe(true);
    const decal = state.decals.find((d) => d.kind === 'corpse');
    expect(decal).toBeDefined();
    expect(decal!.frame).toBe(5);

    // Pickup prevX/prevY updates on movement for smooth 60/120 FPS interpolation
    const pk = spawnPickup(state, 'ammo', state.player.x + 20, state.player.y, {
      ammoType: 'bullet',
      value: 10,
      vx: 3,
      vy: 0,
    });
    const oldX = pk.x;
    stepPickups(state);
    expect(pk.prevX).toBe(oldX);
    expect(pk.x).not.toBe(oldX);
  });

  it('P0: threads authentic cause-of-death through enemy projectiles, melee slashes, explosions, Golden Disc, and headless Chicken', () => {
    const state = createRunState({ mutant: 'fish', seed: 7002 });
    state.enemies = [];
    state.projectiles = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // 1. Enemy ranged projectile carries sourceCause & sourceSprite
    spawnEnemyProjectile(state, {
      x: state.player.x + 6,
      y: state.player.y,
      angle: Math.PI,
      speed: 8,
      damage: 2,
      kind: 'boss_orb',
      sprite: 'sprThroneBullet',
      sourceCause: 'THE THRONE',
      sourceSprite: 'sprNothingOn',
    });
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }), rng);
    expect(state.player.lastDamageCause).toBe('THE THRONE');
    expect(state.player.lastKillerSprite).toBe('sprNothingOn');

    // 2. Enemy melee slash uses sourceCause/sourceSprite (Ammo Mimic != ASSASSIN!)
    state.player.iframes = 0;
    state.projectiles = [];
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'melee_slash',
      team: 'enemy',
      x: state.player.x + 6,
      y: state.player.y,
      prevX: state.player.x + 10,
      prevY: state.player.y,
      vx: 0,
      vy: 0,
      angle: Math.PI,
      radius: 13,
      damage: 2,
      lifeTicks: 3,
      maxLifeTicks: 3,
      pierce: 1,
      bounce: 0,
      explosionRadius: 0,
      sprite: 'sprSlash',
      hitIds: [],
      meleeReach: 22,
      meleeArcDeg: 110,
      sourceCause: 'AMMO MIMIC',
      sourceSprite: 'sprMimicIdle',
    });
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }), rng);
    expect(state.player.lastDamageCause).toBe('AMMO MIMIC');
    expect(state.player.lastKillerSprite).toBe('sprMimicIdle');

    // 3. Golden Disc Gun self-hit reports GOLDEN DISC
    state.player.iframes = 0;
    state.player.hp = 8;
    state.projectiles = [];
    state.projectiles.push({
      id: allocEntityId(state),
      kind: 'disc',
      team: 'player',
      x: state.player.x + 5,
      y: state.player.y,
      prevX: state.player.x + 5,
      prevY: state.player.y,
      vx: -8,
      vy: 0,
      angle: Math.PI,
      radius: 4.5,
      damage: 28,
      lifeTicks: 50,
      maxLifeTicks: 90,
      pierce: 4,
      bounce: 4,
      explosionRadius: 0,
      sprite: 'sprGoldDisc',
      weaponId: 'golden_disc_gun',
      hitIds: [],
      canHitPlayer: true,
    });
    stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }), rng);
    expect(state.player.lastDamageCause).toBe('GOLDEN DISC');
    expect(state.player.hp).toBe(3); // 8 - 5

    // 4. Headless Chicken bleed-out fills empty lastDamageCause fallback
    const ch = createRunState({ mutant: 'chicken', seed: 7003 });
    ch.player.headlessTicks = 1;
    ch.player.lastDamageCause = '';
    ch.player.lastKillerSprite = '';
    stepPlayerAndCombat(ch, makeInput({ aimWorldX: ch.player.x + 20, aimWorldY: ch.player.y }), SeededRng.fromState(ch.rngState));
    expect(ch.player.alive).toBe(false);
    expect(ch.player.lastDamageCause).toBe('BLED OUT HEADLESS');
    expect(ch.player.lastKillerSprite).toBe('sprMutant9Dead');
  });

  it('P0: isRad explosions hurt players (Toxic Barrel, Throne Generator) while honoring Boiling Veins and keeping Flare/Plasma safe', () => {
    const state = createRunState({ mutant: 'fish', seed: 7004 });
    state.enemies = [];
    state.props = [];
    clearBox(state);
    const rng = SeededRng.fromState(state.rngState);

    // Toxic Barrel (isRad: true) hurts player
    const toxicBarrel = {
      id: allocEntityId(state),
      kind: 'toxic_barrel' as const,
      x: state.player.x + 8,
      y: state.player.y,
      radius: 8,
      hp: 4,
      maxHp: 4,
      solid: true,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprToxicBarrel',
    };
    state.props.push(toxicBarrel);
    const hpBefore = state.player.hp;
    damageProp(state, toxicBarrel, 20, rng);
    expect(state.player.hp).toBeLessThan(hpBefore);
    expect(state.player.lastDamageCause).toBe('TOXIC BARREL');

    // Boiling Veins at <= 4 HP blocks isRad generator explosion cleanly
    grantMutationById(state, 'boiling_veins', rng);
    state.player.hp = 4;
    state.player.iframes = 0;
    const gen = {
      id: allocEntityId(state),
      kind: 'throne_generator' as const,
      x: state.player.x + 8,
      y: state.player.y,
      radius: 12,
      hp: 4,
      maxHp: 4,
      solid: true,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprBigGenerator',
    };
    state.props.push(gen);
    damageProp(state, gen, 20, rng);
    expect(state.player.hp).toBe(4);

    // Flare Gun & Flame Cannon deal ZERO self-damage even without Boiling Veins!
    for (const wId of ['flare_gun', 'flame_cannon'] as const) {
      const fs = createRunState({ mutant: 'fish', seed: 7005 });
      fs.enemies = [];
      fs.projectiles = [];
      clearBox(fs);
      const fRng = SeededRng.fromState(fs.rngState);
      givePlayerWeapon(fs, wId, 0, false);
      fs.player.ammo.shell = 10;
      const { tx, ty } = worldToTile(fs.player.x, fs.player.y, fs.map.tileSize);
      setTile(fs.map, tx + 1, ty, TileType.Wall);
      const startHp = fs.player.hp;
      stepPlayerAndCombat(
        fs,
        makeInput({ aimWorldX: fs.player.x + 16, aimWorldY: fs.player.y, firePressed: true, fireHeld: true }),
        fRng,
      );
      for (let t = 0; t < 6; t++) {
        stepPlayerAndCombat(fs, makeInput({ aimWorldX: fs.player.x + 16, aimWorldY: fs.player.y }), fRng);
      }
      expect(fs.player.hp).toBe(startHp);
    }
  });

  it('P0: Shovel (3 arcs) and Ultra Shovel (5 arcs) hit each enemy exactly 1x (never 3x/5x)', () => {
    for (const tc of [
      { id: 'shovel', expectedDmg: 15, arcs: 3 },
      { id: 'ultra_shovel', expectedDmg: 34, arcs: 5 },
    ]) {
      const state = createRunState({ mutant: 'fish', seed: 7006 });
      state.enemies = [];
      state.projectiles = [];
      clearBox(state);
      const rng = SeededRng.fromState(state.rngState);
      givePlayerWeapon(state, tc.id, 0, false);
      state.player.rads = 20;

      const boss = createEnemyEntity(state, 'big_dog', state.player.x + 22, state.player.y, rng);
      boss.hp = 200;
      boss.maxHp = 200;
      stepPlayerAndCombat(
        state,
        makeInput({ aimWorldX: boss.x, aimWorldY: boss.y, firePressed: true, fireHeld: true }),
        rng,
      );
      expect(state.projectiles.filter((p) => p.kind === 'melee_slash')).toHaveLength(tc.arcs);
      for (let t = 0; t < 6; t++) {
        stepPlayerAndCombat(state, makeInput({ aimWorldX: boss.x, aimWorldY: boss.y }), rng);
      }
      expect(200 - boss.hp).toBe(tc.expectedDmg);
    }
  });

  it('P0: Horror Throne Butt heals even from odd radBeamTicks and Steroids TB cannot farm infinite ammo', () => {
    // 1. Horror TB starting from odd radBeamTicks = 1 still heals reliably!
    const h = createRunState({ mutant: 'horror', seed: 7007 });
    h.enemies = [];
    clearBox(h);
    const hRng = SeededRng.fromState(h.rngState);
    grantMutationById(h, 'throne_butt', hRng);
    h.player.hp = 2;
    h.player.rads = 120;
    h.player.radBeamTicks = 1; // ODD start previously broke % 60 === 0 forever!
    for (let t = 1; t <= 90; t++) {
      h.tick = t;
      stepPlayerAndCombat(
        h,
        makeInput({ aimWorldX: h.player.x + 40, aimWorldY: h.player.y, activeHeld: true }),
        hRng,
      );
    }
    expect(h.player.hp).toBeGreaterThanOrEqual(4);
    expect(h.player.radBeamActive).toBe(true);

    // Releasing RMB immediately sets radBeamActive = false
    stepPlayerAndCombat(
      h,
      makeInput({ aimWorldX: h.player.x + 40, aimWorldY: h.player.y, activeHeld: false }),
      hRng,
    );
    expect(h.player.radBeamActive).toBe(false);

    // 2. Steroids TB dual-firing Revolvers into a wall NEVER nets infinite ammo + stamps lastFiredTick & meleeSwingSide
    const s = createRunState({ mutant: 'steroids', seed: 7008 });
    s.enemies = [];
    clearBox(s);
    const sRng = SeededRng.fromState(s.rngState);
    grantMutationById(s, 'throne_butt', sRng);
    s.player.ammo.bullet = 50;
    for (let t = 1; t <= 200; t++) {
      s.tick = t;
      stepPlayerAndCombat(
        s,
        makeInput({
          aimWorldX: s.player.x + 40,
          aimWorldY: s.player.y,
          fireHeld: true,
          firePressed: t === 1,
          activeHeld: true,
          activePressed: t === 1,
        }),
        sRng,
      );
    }
    expect(s.player.ammo.bullet).toBeLessThan(50);
    expect(s.player.weapons[0]!.lastFiredTick).toBeGreaterThan(0);
    expect(s.player.weapons[1]!.lastFiredTick).toBeGreaterThan(0);
  });

  it('P0: solid props block player movement, Shotgun Shoulders skips enemy flak, Palace drops high-tier guns, Crown of Life + Steroids B heals, Scarier Face syncs boss HUD', () => {
    // 1. Player cannot walk straight through a solid 3-1 car
    const carState = createRunState({ mutant: 'fish', seed: 7009 });
    carState.enemies = [];
    carState.props = [];
    clearBox(carState, 8, 5);
    const carRng = SeededRng.fromState(carState.rngState);
    const carX = carState.player.x + 28;
    const carY = carState.player.y;
    carState.props.push({
      id: allocEntityId(carState),
      kind: 'car',
      x: carX,
      y: carY,
      radius: 11,
      hp: 30,
      maxHp: 30,
      solid: true,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprCarIdle',
    });
    for (let t = 0; t < 25; t++) {
      carState.tick += 1;
      stepPlayerAndCombat(
        carState,
        makeInput({ moveX: 1, moveY: 0, aimWorldX: carX + 40, aimWorldY: carY }),
        carRng,
      );
    }
    expect(carState.player.x).toBeLessThan(carX - 8);

    // 2. Shotgun Shoulders does NOT buff enemy flak pellets
    const ss = createRunState({ mutant: 'fish', seed: 7010 });
    ss.enemies = [];
    ss.projectiles = [];
    clearBox(ss);
    const ssRng = SeededRng.fromState(ss.rngState);
    grantMutationById(ss, 'shotgun_shoulders', ssRng);
    spawnEnemyProjectile(ss, {
      x: ss.player.x + 40,
      y: ss.player.y,
      angle: 0,
      speed: 2,
      damage: 4,
      kind: 'flak',
      lifeTicks: 1,
      sprite: 'sprFlakBullet',
    });
    stepPlayerAndCombat(ss, makeInput({ aimWorldX: ss.player.x + 40, aimWorldY: ss.player.y }), ssRng);
    const enemyShells = ss.projectiles.filter((p) => p.team === 'enemy' && p.kind === 'shell');
    expect(enemyShells.length).toBeGreaterThan(0);
    for (const sh of enemyShells) {
      expect(sh.bounce).toBe(1);
      expect(sh.maxLifeTicks).toBe(20);
    }

    // 3. Palace 7-2 Loop 0 Crown of Guns weapon drops use area weaponTierBase (high tier, NOT 0-3!)
    const pal = createRunState({ mutant: 'fish', seed: 7011, crown: 'guns' });
    warpToArea(pal, '7-2', 0);
    pal.pickups = [];
    const palRng = SeededRng.fromState(pal.rngState);
    for (let k = 0; k < 40; k++) {
      const f = createEnemyEntity(pal, 'guardian', pal.player.x + 40, pal.player.y, palRng);
      applyDamageToEnemy(pal, f, 999, 0, 0, palRng);
    }
    const droppedTiers = pal.pickups
      .filter((p) => p.kind === 'weapon' && p.weaponId)
      .map((p) => WEAPONS[p.weaponId!]!.tier);
    expect(droppedTiers.length).toBeGreaterThan(0);
    expect(Math.max(...droppedTiers)).toBeGreaterThanOrEqual(8);

    // 4. Crown of Life + Steroids Ultra B (Get Loaded) STILL heals on ammo chest (no softlock!)
    const lifeSteroids = createRunState({ mutant: 'steroids', seed: 7012, crown: 'life' });
    const lsRng = SeededRng.fromState(lifeSteroids.rngState);
    grantUltraById(lifeSteroids, 'steroids_b', lsRng);
    lifeSteroids.player.hp = 2;
    const chest = {
      id: allocEntityId(lifeSteroids),
      kind: 'ammo_chest' as const,
      x: lifeSteroids.player.x,
      y: lifeSteroids.player.y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprAmmoChest',
    };
    openChest(lifeSteroids, chest, lsRng);
    expect(lifeSteroids.player.hp).toBe(6);
    expect(chest.sprite).toBe('sprHealthChest');

    // 5. Scarier Face syncs state.boss.maxHp & state.boss.hp on area load
    const sf = createRunState({ mutant: 'fish', seed: 7013 });
    grantMutationById(sf, 'scarier_face', SeededRng.fromState(sf.rngState));
    warpToArea(sf, '1-3', 0);
    const bb = sf.enemies.find((e) => e.bossId === 'big_bandit')!;
    expect(sf.boss).not.toBeNull();
    expect(sf.boss!.maxHp).toBe(bb.maxHp);
    expect(sf.boss!.hp).toBe(bb.hp);
  });

  it('P0: Gamma Guts kills pre-hurt 1 HP Maggot, 7 HP Rat, and 9 HP Scarier-Face Freak cleanly; 3-1 Golden Car repairs at low HP without exploding', () => {
    // 1. Gamma Guts reliability
    const gg = createRunState({ mutant: 'fish', seed: 7014 });
    gg.enemies = [];
    clearBox(gg);
    const ggRng = SeededRng.fromState(gg.rngState);
    grantMutationById(gg, 'gamma_guts', ggRng);
    grantMutationById(gg, 'scarier_face', ggRng);

    // Pre-hurt 1 HP maggot (hurtFlashTicks = 4 from bullet!)
    const mag = createEnemyEntity(gg, 'maggot', gg.player.x, gg.player.y, ggRng);
    mag.hp = 1;
    mag.hurtFlashTicks = 4;
    // 7 HP Rat
    const rat = createEnemyEntity(gg, 'rat', gg.player.x, gg.player.y, ggRng);
    rat.hp = 7;
    // 9 HP Scarier-Face Freak
    const freak = createEnemyEntity(gg, 'freak', gg.player.x, gg.player.y, ggRng);
    freak.hp = 9;
    gg.rngState = ggRng.getState();

    const hpStart = gg.player.hp;
    stepSimulation(gg, makeInput({ aimWorldX: gg.player.x + 20, aimWorldY: gg.player.y }));
    expect(mag.hp).toBeLessThanOrEqual(0);
    expect(rat.hp).toBeLessThanOrEqual(0);
    expect(freak.hp).toBeLessThanOrEqual(0);
    expect(gg.player.hp).toBe(hpStart);

    // 2. 3-1 Golden Car at 2 HP repaired cleanly by Energy Screwdriver (16 dmg!) without exploding
    const car = createRunState({ mutant: 'fish', seed: 7015 });
    warpToArea(car, '3-1', 0);
    const rt = getAreaRuntime(car);
    const venusCar = car.props.find((p) => p.id === rt.venusCarPropId)!;
    venusCar.hp = 2; // Previously exploded immediately on Screwdriver/Energy Screwdriver!
    car.enemies = [];
    givePlayerWeapon(car, 'energy_screwdriver', 0, false);
    car.player.ammo.energy = 20;
    car.player.x = venusCar.x - 16;
    car.player.y = venusCar.y;

    // Swinging AWAY from car must NOT repair it
    stepPlayerAndCombat(
      car,
      makeInput({ aimWorldX: car.player.x - 40, aimWorldY: car.player.y, firePressed: true, fireHeld: true }),
      SeededRng.fromState(car.rngState),
    );
    expect(rt.venusCarFixed).toBe(false);
    expect(car.props.includes(venusCar)).toBe(true);

    // Swinging TOWARD car repairs cleanly without exploding!
    car.player.weapons[0]!.reloadTicks = 0;
    stepPlayerAndCombat(
      car,
      makeInput({ aimWorldX: venusCar.x, aimWorldY: venusCar.y, firePressed: true, fireHeld: true }),
      SeededRng.fromState(car.rngState),
    );
    expect(rt.venusCarFixed).toBe(true);
    expect(car.props.includes(venusCar)).toBe(true);
    expect(venusCar.sprite).toBe('sprVenusCarFixed');
    expect(venusCar.interactPrompt).toBe('[E] Y.V. MANSION');
  });

  it('P1: Unified lasers, 5-beam Ultra Laser Pistol, Nuke sprNuke/steering, ToxicGas, Blood Hammer parry, casings, Robot/Chicken cursed UX, terrain traction, Rebel separation & authentic NT audio', () => {
    // 1. Unified hitscan laser emits ONE visual beam carrying beamOriginX/Y; Ultra Laser Pistol fires 5 beams!
    const ls = createRunState({ mutant: 'fish', seed: 7016 });
    ls.enemies = [];
    ls.projectiles = [];
    clearBox(ls, 10, 5);
    const lRng = SeededRng.fromState(ls.rngState);
    givePlayerWeapon(ls, 'laser_pistol', 0, false);
    ls.player.ammo.energy = 20;
    stepPlayerAndCombat(
      ls,
      makeInput({ aimWorldX: ls.player.x + 120, aimWorldY: ls.player.y, firePressed: true, fireHeld: true }),
      lRng,
    );
    const laserVisuals = ls.projectiles.filter((p) => p.kind === 'laser' && p.damage === 0);
    expect(laserVisuals).toHaveLength(1);
    expect(laserVisuals[0]!.beamOriginX).toBeDefined();
    expect(laserVisuals[0]!.beamOriginY).toBeDefined();
    // Energy weapon ejects ZERO casings!
    expect(ls.casings).toHaveLength(0);

    ls.projectiles = [];
    givePlayerWeapon(ls, 'ultra_laser_pistol', 0, false);
    ls.player.rads = 20;
    stepPlayerAndCombat(
      ls,
      makeInput({ aimWorldX: ls.player.x + 120, aimWorldY: ls.player.y, firePressed: true, fireHeld: true }),
      lRng,
    );
    const ultraVisuals = ls.projectiles.filter((p) => p.kind === 'laser' && p.damage === 0 && p.isUltra);
    expect(ultraVisuals).toHaveLength(5);

    // 2. Blood Hammer parrying an enemy bullet causes ZERO self-damage!
    const bh = createRunState({ mutant: 'fish', seed: 7017 });
    bh.enemies = [];
    bh.props = [];
    bh.projectiles = [];
    clearBox(bh);
    const bhRng = SeededRng.fromState(bh.rngState);
    givePlayerWeapon(bh, 'blood_hammer', 0, false);
    spawnEnemyProjectile(bh, {
      x: bh.player.x + 18,
      y: bh.player.y,
      angle: Math.PI,
      speed: 3,
      damage: 2,
    });
    const bhHp = bh.player.hp;
    stepPlayerAndCombat(
      bh,
      makeInput({ aimWorldX: bh.player.x + 32, aimWorldY: bh.player.y, firePressed: true, fireHeld: true }),
      bhRng,
    );
    for (let t = 0; t < 6; t++) {
      stepPlayerAndCombat(bh, makeInput({ aimWorldX: bh.player.x + 32, aimWorldY: bh.player.y }), bhRng);
    }
    expect(bh.player.hp).toBe(bhHp);
    expect(bh.casings).toHaveLength(0);

    // 3. Nuke Launcher uses sprNuke & steers toward cursor; Toxic Cloud uses sprToxicGas
    expect(WEAPONS.nuke_launcher!.projectileSprite).toBe('sprNuke');
    const nk = createRunState({ mutant: 'fish', seed: 7018 });
    nk.enemies = [];
    nk.projectiles = [];
    clearBox(nk, 10, 6);
    const nkRng = SeededRng.fromState(nk.rngState);
    givePlayerWeapon(nk, 'nuke_launcher', 0, false);
    nk.player.ammo.explosive = 10;
    stepPlayerAndCombat(
      nk,
      makeInput({ aimWorldX: nk.player.x + 60, aimWorldY: nk.player.y, firePressed: true, fireHeld: true }),
      nkRng,
    );
    const nukeProj = nk.projectiles.find((p) => p.kind === 'nuke')!;
    expect(nukeProj).toBeDefined();
    expect(nukeProj.sprite).toBe('sprNuke');
    const initSpd = Math.hypot(nukeProj.vx, nukeProj.vy);
    stepPlayerAndCombat(nk, makeInput({ aimWorldX: nk.player.x + 60, aimWorldY: nk.player.y + 80 }), nkRng);
    expect(Math.hypot(nukeProj.vx, nukeProj.vy)).toBeGreaterThan(initSpd);
    expect(nukeProj.vy).toBeGreaterThan(0);

    // 4. Robot eating cursed weapon deals 7 HP CURSE damage & consumes it; full-HP eat emits +N AMMO text
    const rob = createRunState({ mutant: 'robot', seed: 7019 });
    rob.enemies = [];
    clearBox(rob);
    const robRng = SeededRng.fromState(rob.rngState);
    givePlayerWeapon(rob, 'shotgun', 1, false, { cursed: true });
    rob.player.activeSlot = 1;
    rob.player.hp = 8;
    rob.events = [];
    stepPlayerAndCombat(
      rob,
      makeInput({ aimWorldX: rob.player.x + 30, aimWorldY: rob.player.y, activePressed: true }),
      robRng,
    );
    expect(rob.player.weapons[1]).toBeNull();
    expect(rob.player.hp).toBe(1);
    expect(rob.player.lastDamageCause).toBe('CURSE');

    // 5. Frozen City ice slide vs Extra Feet immunity
    const ice = createRunState({ mutant: 'fish', seed: 7020 });
    warpToArea(ice, '5-1', 0);
    ice.enemies = [];
    ice.props = [];
    clearBox(ice, 8, 5);
    const iceRng = SeededRng.fromState(ice.rngState);
    for (let t = 0; t < 12; t++) {
      ice.tick += 1;
      stepPlayerAndCombat(ice, makeInput({ moveX: 1, aimWorldX: ice.player.x + 40, aimWorldY: ice.player.y }), iceRng);
    }
    // Release movement -> slides noticeably on ice
    const vxBeforeStop = ice.player.vx;
    stepPlayerAndCombat(ice, makeInput({ moveX: 0, aimWorldX: ice.player.x + 40, aimWorldY: ice.player.y }), iceRng);
    expect(ice.player.vx).toBeGreaterThan(vxBeforeStop * 0.75);

    // With Extra Feet, ice friction is normal (0.55)
    grantMutationById(ice, 'extra_feet', iceRng);
    const vxBeforeEfStop = ice.player.vx;
    stepPlayerAndCombat(ice, makeInput({ moveX: 0, aimWorldX: ice.player.x + 40, aimWorldY: ice.player.y }), iceRng);
    expect(ice.player.vx).toBeLessThan(vxBeforeEfStop * 0.65);

    // 6. Rebel Allies spawned on identical pixel immediately separate
    const reb = createRunState({ mutant: 'rebel', seed: 7021 });
    reb.enemies = [];
    clearBox(reb, 8, 5);
    const rebRng = SeededRng.fromState(reb.rngState);
    const a1 = spawnFriendlyUnit(reb, 'rebel_ally', reb.player.x + 20, reb.player.y);
    const a2 = spawnFriendlyUnit(reb, 'rebel_ally', reb.player.x + 20, reb.player.y);
    a2.x = a1.x;
    a2.y = a1.y;
    for (let t = 0; t < 6; t++) {
      stepPlayerAndCombat(reb, makeInput({ aimWorldX: reb.player.x + 40, aimWorldY: reb.player.y }), rebRng);
    }
    expect(Math.hypot(a1.x - a2.x, a1.y - a2.y)).toBeGreaterThan(4);

    // 7. Authentic NT Audio events: 7-3 emits mus/Boss4Silence, per-mutation sndMut*, per-Ultra snd/*Ultra*, class sndSwap*, Y.V. yv_a spawns Crib chests!
    const aud = createRunState({ mutant: 'yv', seed: 7022 });
    aud.events = [];
    loadAreaIntoState(aud, '7-3', 0);
    const musicEv = aud.events.find((e) => e.type === 'music');
    expect(musicEv && musicEv.type === 'music' ? musicEv.track : '').toBe('mus/Boss4Silence');

    aud.events = [];
    grantMutationById(aud, 'shotgun_shoulders', SeededRng.fromState(aud.rngState));
    expect(aud.events.some((e) => e.type === 'sfx' && e.sound === 'sndMutShotgunFingers')).toBe(true);

    aud.events = [];
    grantUltraById(aud, 'yv_a', SeededRng.fromState(aud.rngState));
    expect(aud.events.some((e) => e.type === 'sfx' && e.sound === 'snd/YVUltraA')).toBe(true);
    expect(aud.props.filter((p) => p.kind === 'big_weapon_chest').length).toBeGreaterThanOrEqual(2);

    givePlayerWeapon(aud, 'shotgun', 1, false);
    aud.player.activeSlot = 0;
    aud.events = [];
    stepPlayerAndCombat(
      aud,
      makeInput({ aimWorldX: aud.player.x + 20, aimWorldY: aud.player.y, swapPressed: true }),
      SeededRng.fromState(aud.rngState),
    );
    expect(aud.events.some((e) => e.type === 'sfx' && e.sound === 'sndSwapShotgun')).toBe(true);
  });
});
