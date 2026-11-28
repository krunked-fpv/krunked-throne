import { describe, expect, it } from 'vitest';
import { TileType, type InputFrame, type MutantId, type SaveData, type SimState } from '@/contracts';
import {
  AMMO_PICKUP_AMOUNT,
  POST_LOOP_CROWN_IDS,
  PRE_LOOP_CROWN_IDS,
  WEAPONS,
} from '@/data';
import {
  MELTDOWN_RAD_CAP,
  SeededRng,
  ULTRA_RAD_CAP,
  allocEntityId,
  setTile,
  stepPickups,
  stepPortal,
} from '@/sim/core';
import {
  MINI_AMMO_PACK_SIZE,
  PLAYER_CONTACT_IFRAMES,
  PLAYER_PROJECTILE_IFRAMES,
  applyDamageToEnemy,
  applyDamageToPlayer,
  checkSaveLevelUnlocks,
  damageProp,
  getPendingUnlocks,
  getPlayerMoveSpeed,
  spawnEnemyProjectile,
  spawnPickup,
  stepPlayerAndCombat,
} from '@/sim/combat';
import {
  PORTAL_SPAWN_DELAY_TICKS,
  PORTAL_WARP_TICKS,
  addRads,
  applyMutationSelection,
  checkPortalTrigger,
  createInitialSimState,
  drawUltraChoices,
  exitCribToReturnArea,
  getProtoChestWeaponId,
  getVaultCrownPool,
  givePlayerWeapon,
  grantMutationById,
  grantUltraById,
  interactProtoChest,
  loadAreaIntoState,
  openChest,
  openPendingLevelUp,
  selectVaultCrown,
  setProtoChestWeaponId,
} from '@/sim/progression';
import { createEnemyEntity, getRunRuntime } from '@/sim/entities';
import { createDefaultSaveData } from '@/ui/save';

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

function clearBox(state: SimState, radiusX = 8, radiusY = 6): void {
  const tx = Math.floor(state.player.x / state.map.tileSize);
  const ty = Math.floor(state.player.y / state.map.tileSize);
  for (let dy = -radiusY; dy <= radiusY; dy++) {
    for (let dx = -radiusX; dx <= radiusX; dx++) {
      setTile(state.map, tx + dx, ty + dy, TileType.Floor);
    }
  }
}

function stepUntilPortalOpens(state: SimState, rng: SeededRng, maxTicks = 40): string {
  for (let t = 0; t < maxTicks; t++) {
    const res = checkPortalTrigger(state, rng);
    if (res !== 'none') return res;
  }
  return 'none';
}

describe('Wiki Parity: Secret Mutants (Frog & Skeleton) + Horror 3rd Ultra (MELTDOWN)', () => {
  it('Frog: Golden Frog Pistol 1-1 transform, continuous movement + wall bounce, toxic immunity, Active root+gas (TB 2x), Ultras A/B, and 20-projectile death burst', () => {
    // 1. Starting on 1-1 carrying golden_frog_pistol transforms into Frog & emits mutant_frog unlock!
    const state = createInitialSimState({
      mutant: 'fish',
      seed: 9101,
      goldenWeapon: 'golden_frog_pistol',
    });
    expect(state.player.mutant).toBe('frog');
    expect(state.player.weapons[0]?.weaponId).toBe('golden_frog_pistol');
    expect(getPendingUnlocks(state)).toContain('mutant_frog');

    clearBox(state, 6, 4);
    state.enemies = [];
    state.props = [];
    const rng = SeededRng.fromState(state.rngState);

    // 2. CAN'T STAND STILL: moves continuously even with zero WASD input
    const x0 = state.player.x;
    for (let t = 0; t < 4; t++) {
      state.tick += 1;
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 30, aimWorldY: state.player.y }), rng);
    }
    expect(state.player.x).toBeGreaterThan(x0 + 8);

    // Wall bounce: place solid wall right in front of Frog -> reverses velocity!
    const wallTx = Math.floor((state.player.x + 16) / state.map.tileSize);
    const pty = Math.floor(state.player.y / state.map.tileSize);
    for (let dy = -2; dy <= 2; dy++) {
      setTile(state.map, wallTx, pty + dy, TileType.Wall);
    }
    let bounced = false;
    for (let t = 0; t < 16; t++) {
      state.tick += 1;
      const prevX = state.player.x;
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 30, aimWorldY: state.player.y }), rng);
      if (state.player.x < prevX - 0.5) {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);

    // 3. Immune to ALL Toxic Gas damage (toxic barrels & enemy toxic gas projectiles)
    const hpBeforeToxic = state.player.hp;
    const dealtDirect = applyDamageToPlayer(state, 4, 'TOXIC GAS', 'sprToxicGas', rng, {
      isToxic: true,
      isProjectile: true,
    });
    expect(dealtDirect).toBe(false);
    expect(state.player.hp).toBe(hpBeforeToxic);

    const toxicBarrel = {
      id: allocEntityId(state),
      kind: 'toxic_barrel' as const,
      x: state.player.x + 4,
      y: state.player.y,
      radius: 8,
      hp: 1,
      maxHp: 1,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprToxicBarrel',
    };
    state.props.push(toxicBarrel);
    damageProp(state, toxicBarrel, 10, rng);
    expect(state.player.hp).toBe(hpBeforeToxic);

    // 4. Active (hold RMB) roots Frog in place and emits growing Toxic Gas Cloud (`2 dmg/tick`)
    clearBox(state, 8, 6);
    const foe = createEnemyEntity(state, 'bandit', state.player.x + 12, state.player.y, rng);
    foe.hp = 30;
    foe.maxHp = 30;
    const rootedX = state.player.x;
    const rootedY = state.player.y;
    for (let t = 0; t < 12; t++) {
      state.tick += 1;
      stepPlayerAndCombat(
        state,
        makeInput({
          aimWorldX: foe.x,
          aimWorldY: foe.y,
          activePressed: t === 0,
          activeHeld: true,
        }),
        rng,
      );
    }
    expect(state.player.frogRooted).toBe(true);
    expect(state.player.x).toBe(rootedX);
    expect(state.player.y).toBe(rootedY);
    expect(state.projectiles.some((p) => p.weaponId === 'frog_gas' && p.sprite === 'sprFrogGas')).toBe(true);
    expect(foe.hp).toBeLessThan(30);

    // Throne Butt makes toxic gas travel 2x faster
    state.projectiles = [];
    grantMutationById(state, 'throne_butt', rng);
    state.tick += 1;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: foe.x, aimWorldY: foe.y, activePressed: true, activeHeld: true }),
      rng,
    );
    const tbGas = state.projectiles.filter((p) => p.weaponId === 'frog_gas');
    expect(tbGas.length).toBeGreaterThanOrEqual(3);
    const avgSpd = tbGas.reduce((s, p) => s + Math.hypot(p.vx, p.vy), 0) / tbGas.length;
    expect(avgSpd).toBeGreaterThan(1.7);

    // 5. Ultra B (INTIMACY): continuous toxic gas trail while moving
    state.projectiles = [];
    grantUltraById(state, 'frog_b', rng);
    for (let t = 0; t < 10; t++) {
      state.tick += 1;
      stepPlayerAndCombat(
        state,
        makeInput({ moveX: 1, aimWorldX: state.player.x + 30, aimWorldY: state.player.y }),
        rng,
      );
    }
    expect(state.projectiles.some((p) => p.weaponId === 'frog_gas')).toBe(true);

    // 6. Ultra A (DISTANCE): 25% rad pickups/canisters spawn Toxic Gas
    const distFrog = createInitialSimState({ mutant: 'frog', seed: 9102 });
    clearBox(distFrog, 6, 4);
    const dRng = SeededRng.fromState(distFrog.rngState);
    grantUltraById(distFrog, 'frog_a', dRng);
    distFrog.projectiles = [];
    for (let i = 0; i < 25; i++) {
      spawnPickup(distFrog, 'rad', distFrog.player.x, distFrog.player.y, { value: 1 }, dRng);
    }
    distFrog.tick += 1;
    stepPlayerAndCombat(
      distFrog,
      makeInput({ aimWorldX: distFrog.player.x + 20, aimWorldY: distFrog.player.y }),
      dRng,
    );
    expect(distFrog.projectiles.some((p) => p.weaponId === 'frog_gas')).toBe(true);

    // 7. Death burst: 20 bouncing venom projectiles!
    distFrog.projectiles = [];
    applyDamageToPlayer(distFrog, 99, 'BANDIT', 'sprBanditIdle', dRng, { ignoreIframes: true });
    expect(distFrog.player.alive).toBe(false);
    const venomCount = distFrog.projectiles.filter((p) => p.weaponId === 'frog_venom').length;
    expect(venomCount).toBe(20);
  });

  it('Skeleton: Melting death inside necro_revive_area resurrects as Skeleton, Blood Gamble (0 ammo + risk + TB), REDEMPTION (Melting + 9 picks + Ultra), DAMNATION (-80% reload)', () => {
    const state = createInitialSimState({ mutant: 'melting', seed: 9201, crown: 'haste' });
    loadAreaIntoState(state, '6-1', 0);
    clearBox(state, 8, 6);
    const rng = SeededRng.fromState(state.rngState);
    givePlayerWeapon(state, 'shotgun', 1, false, { grantBonus: false });
    state.player.ammo.shell = 12;
    grantMutationById(state, 'rhino_skin', rng);
    addRads(state, 150, rng);
    expect(state.player.level).toBeGreaterThan(1);
    expect(state.player.mutations).toContain('rhino_skin');

    // Place necro_revive_area right under Melting
    state.props.push({
      id: allocEntityId(state),
      kind: 'necro_revive_area',
      x: state.player.x,
      y: state.player.y,
      radius: 36,
      hp: 999,
      maxHp: 999,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprReviveArea',
    });

    // Lethal damage -> resurrects immediately as Skeleton!
    applyDamageToPlayer(state, 99, 'FREAK', 'sprFreakIdle', rng, { ignoreIframes: true });
    expect(state.player.alive).toBe(true);
    expect(state.phase).toBe('playing');
    expect(state.player.mutant).toBe('skeleton');
    expect(state.player.hp).toBe(1);
    expect(state.player.maxHp).toBe(4);
    expect(state.player.level).toBe(1);
    expect(state.player.rads).toBe(0);
    expect(state.player.mutations).toHaveLength(0);
    expect(state.player.ultra).toBeNull();
    expect(state.player.skeletonTransformed).toBe(true);
    expect(getPlayerMoveSpeed(state.player)).toBeCloseTo(3.2, 2);
    // Keeps weapons, ammo, and crown!
    expect(state.player.weapons[1]?.weaponId).toBe('shotgun');
    expect(state.player.ammo.shell).toBe(12);
    expect(state.crown).toBe('haste');
    expect(getPendingUnlocks(state)).toContain('mutant_skeleton');

    // Blood Gamble: fires active weapon for 0 ammo/rads and risks 1 HP self-damage!
    state.player.activeSlot = 1; // shotgun (shell, ammoCost 1, miniPack 4 -> 25% risk)
    state.player.ammo.shell = 0; // 0 ammo!
    state.player.hp = 4;
    state.player.iframes = 0;
    const shotsBefore = state.stats.shotsFired;
    state.tick += 1;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 50, aimWorldY: state.player.y, activePressed: true, activeHeld: true }),
      rng,
    );
    expect(state.stats.shotsFired).toBe(shotsBefore + 1);
    expect(state.player.ammo.shell).toBe(0); // Spent 0 ammo!

    // Verify self-damage risk with Blood Gamble (100% risk on ammoCost >= miniPack, reduced with TB!)
    const gambleNoTb = createInitialSimState({ mutant: 'skeleton', seed: 9202 });
    const gRng1 = SeededRng.fromState(gambleNoTb.rngState);
    givePlayerWeapon(gambleNoTb, 'super_bazooka', 0, false, { grantBonus: false }); // explosive cost 3 / miniPack 3 = 1.0!
    gambleNoTb.player.ammo.explosive = 0;
    gambleNoTb.player.hp = 4;
    gambleNoTb.tick += 1;
    stepPlayerAndCombat(
      gambleNoTb,
      makeInput({ aimWorldX: gambleNoTb.player.x + 50, aimWorldY: gambleNoTb.player.y, activePressed: true }),
      gRng1,
    );
    expect(gambleNoTb.player.hp).toBe(3);

    // Verify Throne Butt halves Blood Gamble self-damage frequency across 60 trials
    let selfHitsNoTb = 0;
    let selfHitsTb = 0;
    for (const withTb of [false, true]) {
      const s = createInitialSimState({ mutant: 'skeleton', seed: 9203 });
      const sr = SeededRng.fromState(s.rngState);
      if (withTb) grantMutationById(s, 'throne_butt', sr);
      givePlayerWeapon(s, 'super_bazooka', 0, false, { grantBonus: false });
      s.player.ammo.explosive = 0;
      for (let i = 0; i < 60; i++) {
        s.player.hp = 4;
        s.player.weapons[0]!.reloadTicks = 0;
        s.tick += 1;
        stepPlayerAndCombat(
          s,
          makeInput({ aimWorldX: s.player.x + 50, aimWorldY: s.player.y, activePressed: true }),
          sr,
        );
        if (s.player.hp < 4) {
          if (withTb) selfHitsTb += 1;
          else selfHitsNoTb += 1;
        }
      }
    }
    expect(selfHitsNoTb).toBe(60);
    expect(selfHitsTb).toBeLessThan(35);

    // Skeleton Ultra B (DAMNATION): Blood Gamble cuts reload timer by 80%!
    const damn = createInitialSimState({ mutant: 'skeleton', seed: 9204 });
    const dRng = SeededRng.fromState(damn.rngState);
    givePlayerWeapon(damn, 'super_bazooka', 0, false, { grantBonus: false });
    const baseReload = WEAPONS.super_bazooka!.reloadTicks;
    grantUltraById(damn, 'skeleton_b', dRng);
    damn.player.ammo.explosive = 0;
    damn.tick += 1;
    stepPlayerAndCombat(
      damn,
      makeInput({ aimWorldX: damn.player.x + 50, aimWorldY: damn.player.y, activePressed: true }),
      dRng,
    );
    expect(damn.player.weapons[0]!.reloadTicks).toBe(Math.max(1, Math.round(baseReload * 0.2)));

    // Skeleton Ultra A (REDEMPTION): back to Melting (2 base HP), strips Skeleton mutations, queues 9 picks + Melting Ultra!
    const redemp = createInitialSimState({ mutant: 'skeleton', seed: 9205 });
    const rRng = SeededRng.fromState(redemp.rngState);
    grantMutationById(redemp, 'rhino_skin', rRng);
    grantMutationById(redemp, 'back_muscle', rRng);
    redemp.player.level = 10;
    redemp.pendingLevelUps = 1;
    openPendingLevelUp(redemp, rRng);
    expect(redemp.phase).toBe('ultra_select');
    const redempIdx = redemp.pendingUltras.indexOf('skeleton_a');
    expect(redempIdx).toBeGreaterThanOrEqual(0);
    applyMutationSelection(redemp, redempIdx, rRng);

    expect(redemp.player.mutant).toBe('melting');
    expect(redemp.player.maxHp).toBe(2);
    expect(redemp.player.mutations).toHaveLength(0);
    expect(redemp.player.ultra).toBe('skeleton_a'); // Kept until Melting Ultra is picked!
    expect(redemp.pendingLevelUps).toBe(10); // 9 mutations + 1 Melting Ultra!

    // Pick all 9 fresh Melting mutations -> 10th pick opens Melting Ultra select!
    for (let i = 0; i < 9; i++) {
      expect(redemp.phase).toBe('mutation_select');
      applyMutationSelection(redemp, 0, rRng);
    }
    expect(redemp.phase).toBe('ultra_select');
    expect(redemp.pendingUltras).toEqual(['melting_a', 'melting_b']);
    applyMutationSelection(redemp, 0, rRng);
    expect(redemp.player.ultra).toBe('melting_a');
    expect(redemp.player.mutations).toHaveLength(9);
    expect(redemp.phase).toBe('playing');
  });

  it('Horror MELTDOWN (600 -> 1,200 rad cap), 3 Ultra cards, Stalker raddrop pellets, and Anomaly <= 140 HP trigger', () => {
    const state = createInitialSimState({ mutant: 'horror', seed: 9301, skin: 'b' });
    const rng = SeededRng.fromState(state.rngState);

    // Non-Horror gets 2 Ultra cards; Horror gets 3 Ultra cards!
    const fish = createInitialSimState({ mutant: 'fish', seed: 9302 });
    expect(drawUltraChoices(fish)).toHaveLength(2);
    expect(drawUltraChoices(state)).toEqual(['horror_a', 'horror_b', 'horror_c']);

    // Global Level 10 rad cap = 600
    addRads(state, 5000, rng);
    expect(state.player.level).toBe(10);
    expect(state.player.rads).toBe(ULTRA_RAD_CAP);
    expect(state.player.radsToNextLevel).toBe(600);

    // MELTDOWN raises cap to 1,200!
    grantUltraById(state, 'horror_c', rng);
    addRads(state, 5000, rng);
    expect(state.player.rads).toBe(MELTDOWN_RAD_CAP);
    expect(state.player.radsToNextLevel).toBe(1200);

    // Stalker (horror_a): spawns `raddrop` count of sprHorrorBBullet (B-skin!) pellets on kill
    grantUltraById(state, 'horror_a', rng);
    state.projectiles = [];
    const foe = createEnemyEntity(state, 'bandit', state.player.x + 40, state.player.y, rng);
    foe.radDrop = 7;
    applyDamageToEnemy(state, foe, 99, 0, 0, rng);
    const stalkerPellets = state.projectiles.filter((p) => p.weaponId === 'horror_stalker');
    expect(stalkerPellets).toHaveLength(7);
    expect(stalkerPellets[0]!.sprite).toBe('sprHorrorBBullet');

    // Anomaly (horror_b): does NOT trigger when remaining HP > 140, DOES trigger when remaining HP <= 140!
    const anom = createInitialSimState({ mutant: 'horror', seed: 9303 });
    const aRng = SeededRng.fromState(anom.rngState);
    anom.enemies = [];
    grantUltraById(anom, 'horror_b', aRng);
    anom.levelStartEnemyCount = 4;
    anom.levelKills = 2;
    const tank = createEnemyEntity(anom, 'bandit', anom.player.x + 60, anom.player.y, aRng);
    tank.hp = 180;
    tank.maxHp = 180;
    expect(checkPortalTrigger(anom, aRng)).toBe('none');
    tank.hp = 120;
    expect(stepUntilPortalOpens(anom, aRng)).toBe('portal_opened');
  });
});

describe('Wiki Parity: Cursed Weapons, Cursed Ammo, Special Weapons, Crib & Proto Chest', () => {
  it('enforces dynamic cursed weapon rules, 4-1 -> 4-? redirect, cleansing paths, and 2-cursed cursed_ammo expiry explosions', () => {
    const state = createInitialSimState({ mutant: 'chicken', seed: 9401 });
    clearBox(state, 8, 6);
    const rng = SeededRng.fromState(state.rngState);

    givePlayerWeapon(state, 'revolver', 0, false, { cursed: true });
    givePlayerWeapon(state, 'shotgun', 1, false, { cursed: true });

    // Cannot swap for uncursed when both slots cursed; CAN swap for another cursed weapon
    expect(givePlayerWeapon(state, 'machinegun', undefined, true, { cursed: false })).toBe(false);
    expect(givePlayerWeapon(state, 'smg', undefined, true, { cursed: true })).toBe(true);

    // Entering 4-1 with any cursed weapon automatically redirects to 4-? Cursed Caves!
    state.tick = 10;
    loadAreaIntoState(state, '4-1', 0);
    expect(state.areaCode).toBe('4-?');
    clearBox(state, 8, 6);

    // Chicken CAN throw a cursed weapon (cleanses it!)
    state.player.activeSlot = 0;
    state.player.activeCooldown = 0;
    state.tick += 1;
    stepPlayerAndCombat(
      state,
      makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y, activePressed: true }),
      rng,
    );
    expect(state.projectiles.some((p) => p.kind === 'thrown_weapon')).toBe(true);
    for (let t = 0; t < 35; t++) {
      state.tick += 1;
      stepPlayerAndCombat(state, makeInput({ aimWorldX: state.player.x + 40, aimWorldY: state.player.y }), rng);
    }
    const thrownPickup = state.pickups.find((p) => p.kind === 'weapon');
    expect(thrownPickup?.cursed).toBeFalsy();

    // Last Wish & Crown Vault entry cleanse cursed weapons!
    givePlayerWeapon(state, 'revolver', 0, false, { cursed: true });
    grantMutationById(state, 'last_wish', rng);
    expect(state.player.weapons[0]?.cursed).toBe(false);

    givePlayerWeapon(state, 'revolver', 0, false, { cursed: true });
    loadAreaIntoState(state, 'vault', 0);
    expect(state.player.weapons[0]?.cursed).toBe(false);

    // Holding 2 cursed weapons converts enemy ammo drops to cursed_ammo (1.5x value, 3x faster fade, 4-5 dmg expiry explosion!)
    const cursed2 = createInitialSimState({ mutant: 'fish', seed: 9402 });
    clearBox(cursed2, 8, 6);
    const cRng = SeededRng.fromState(cursed2.rngState);
    givePlayerWeapon(cursed2, 'revolver', 0, false, { cursed: true });
    givePlayerWeapon(cursed2, 'shotgun', 1, false, { cursed: true });
    cursed2.player.ammo.bullet = 0;
    cursed2.pickups = [];
    for (let k = 0; k < 40; k++) {
      const f = createEnemyEntity(cursed2, 'bandit', cursed2.player.x + 40, cursed2.player.y, cRng);
      applyDamageToEnemy(cursed2, f, 99, 0, 0, cRng);
    }
    const normalAmmo = spawnPickup(cursed2, 'ammo', cursed2.player.x + 80, cursed2.player.y, {
      ammoType: 'bullet',
      value: AMMO_PICKUP_AMOUNT.bullet,
    });
    const cursedAmmo = cursed2.pickups.find((p) => p.kind === 'cursed_ammo');
    expect(cursedAmmo).toBeDefined();
    expect(cursedAmmo!.value).toBe(Math.round(AMMO_PICKUP_AMOUNT[cursedAmmo!.ammoType!] * 1.5));
    expect(cursedAmmo!.lifeTicks).toBe(Math.round(normalAmmo.lifeTicks / 3)); // 3x faster fade!

    // Expiry explosion deals 4-5 dmg!
    cursedAmmo!.x = cursed2.player.x + 4;
    cursedAmmo!.y = cursed2.player.y;
    cursedAmmo!.lifeTicks = 1;
    const hpPreBlast = cursed2.player.hp;
    stepPickups(cursed2);
    const dmgTaken = hpPreBlast - cursed2.player.hp;
    expect(dmgTaken).toBeGreaterThanOrEqual(4);
    expect(dmgTaken).toBeLessThanOrEqual(5);
  });

  it('Gun Gun (40 energy, diff+10, sprGunGunFire, Skeleton B-skin unlock), Black Sword (12 vs 80 headless), Frog Pistol (3x2 bounce), Ultra rad drain', () => {
    // 1. Gun Gun fired as Skeleton
    const skel = createInitialSimState({ mutant: 'skeleton', seed: 9410 });
    clearBox(skel, 8, 6);
    const sRng = SeededRng.fromState(skel.rngState);
    givePlayerWeapon(skel, 'gun_gun', 0, false, { grantBonus: false });
    skel.player.ammo.energy = 50;
    skel.difficulty = 2;
    skel.pickups = [];
    skel.events = [];
    skel.tick += 1;
    stepPlayerAndCombat(
      skel,
      makeInput({ aimWorldX: skel.player.x + 40, aimWorldY: skel.player.y, firePressed: true, fireHeld: true }),
      sRng,
    );
    expect(skel.player.ammo.energy).toBe(10); // Spent 40 energy!
    expect(skel.pickups.some((p) => p.kind === 'weapon')).toBe(true);
    expect(skel.events.some((e) => e.type === 'particle' && e.sprite === 'sprGunGunFire')).toBe(true);
    expect(getPendingUnlocks(skel)).toContain('bskin_skeleton');

    // 2. Black Sword: 12 normal vs 80 while Chicken headless + chickenDroppedSwordOn1_1 flag
    const chick = createInitialSimState({ mutant: 'chicken', seed: 9411 });
    clearBox(chick, 8, 6);
    const cRng = SeededRng.fromState(chick.rngState);
    // Drop chicken_sword on L0 1-1 via swap
    givePlayerWeapon(chick, 'black_sword', 0, true, { grantBonus: false });
    expect(chick.chickenDroppedSwordOn1_1).toBe(true);

    chick.projectiles = [];
    chick.tick += 1;
    stepPlayerAndCombat(
      chick,
      makeInput({ aimWorldX: chick.player.x + 30, aimWorldY: chick.player.y, firePressed: true }),
      cRng,
    );
    expect(chick.projectiles.find((p) => p.weaponId === 'black_sword')?.damage).toBe(12);

    // Go headless -> 80 damage!
    chick.player.headlessTicks = 120;
    chick.player.weapons[0]!.reloadTicks = 0;
    chick.projectiles = [];
    chick.tick += 1;
    stepPlayerAndCombat(
      chick,
      makeInput({ aimWorldX: chick.player.x + 30, aimWorldY: chick.player.y, firePressed: true }),
      cRng,
    );
    expect(chick.projectiles.find((p) => p.weaponId === 'black_sword')?.damage).toBe(80);

    // 3. Frog Pistol / Golden Frog Pistol: 3 bouncing projectiles x 2 dmg
    givePlayerWeapon(chick, 'golden_frog_pistol', 0, false, { grantBonus: false });
    chick.projectiles = [];
    chick.tick += 1;
    stepPlayerAndCombat(
      chick,
      makeInput({ aimWorldX: chick.player.x + 30, aimWorldY: chick.player.y, firePressed: true }),
      cRng,
    );
    const frogShots = chick.projectiles.filter((p) => p.weaponId === 'golden_frog_pistol');
    expect(frogShots).toHaveLength(3);
    expect(frogShots.every((p) => p.damage === 2 && p.bounce >= 2)).toBe(true);

    // 4. Ultra weapon drains rads from the 600/1200 reserve!
    chick.player.level = 10;
    chick.player.rads = 600;
    givePlayerWeapon(chick, 'ultra_revolver', 0, false, { grantBonus: false });
    chick.tick += 1;
    stepPlayerAndCombat(
      chick,
      makeInput({ aimWorldX: chick.player.x + 30, aimWorldY: chick.player.y, firePressed: true }),
      cRng,
    );
    expect(chick.player.rads).toBe(598);
  });

  it("Y.V. Ultra redirects to $$$ Crib (Giant Chests + Open Mind + [E] venuz_car_exit) & Proto Chest converts frog_pistol -> golden_frog_pistol", () => {
    const yv = createInitialSimState({ mutant: 'yv', seed: 9420 });
    const rng = SeededRng.fromState(yv.rngState);
    grantMutationById(yv, 'open_mind', rng);
    yv.tick = 10;
    yv.player.level = 10;
    yv.pendingLevelUps = 1;
    yv.portal.active = true;
    yv.portal.entered = true;
    yv.portal.targetArea = '5-2';
    yv.portal.nextLoop = 0;
    yv.phase = 'portal_transition';
    yv.portalTransitionTicks = PORTAL_WARP_TICKS;

    expect(checkPortalTrigger(yv, rng)).toBe('selection_opened');
    expect(yv.phase).toBe('ultra_select');
    applyMutationSelection(yv, 0, rng);

    expect(yv.visitedCrib).toBe(true);
    expect(yv.areaCode).toBe('$$$');
    expect(yv.cribReturnArea).toBe('5-2');

    // Open Mind gives an extra giant chest in Crib!
    const giantWepChests = yv.props.filter((p) => p.kind === 'giant_weapon_chest');
    const giantAmmoChests = yv.props.filter((p) => p.kind === 'giant_ammo_chest');
    expect(giantWepChests.length + giantAmmoChests.length).toBeGreaterThanOrEqual(4);

    // Giant Weapon Chest bursts 12-13 weapons (min Tier 4); Giant Ammo Chest bursts 16 mini packs!
    yv.pickups = [];
    openChest(yv, giantWepChests[0]!, rng);
    const wepDrops = yv.pickups.filter((p) => p.kind === 'weapon');
    expect(wepDrops.length).toBeGreaterThanOrEqual(12);
    expect(wepDrops.length).toBeLessThanOrEqual(13);
    expect(wepDrops.every((p) => WEAPONS[p.weaponId!]!.tier >= 4)).toBe(true);

    yv.pickups = [];
    openChest(yv, giantAmmoChests[0]!, rng);
    const ammoDrops = yv.pickups.filter((p) => p.kind === 'ammo');
    expect(ammoDrops).toHaveLength(16);

    // [E] on venuz_car_exit warps cleanly back to cribReturnArea ('5-2')!
    const exitCar = yv.props.find((p) => p.kind === 'venuz_car_exit')!;
    expect(exitCar).toBeDefined();
    yv.player.x = exitCar.x;
    yv.player.y = exitCar.y;
    yv.tick += 1;
    stepPlayerAndCombat(
      yv,
      makeInput({ aimWorldX: exitCar.x + 20, aimWorldY: exitCar.y, pickupPressed: true }),
      rng,
    );
    expect(yv.phase).toBe('portal_transition');
    expect(checkPortalTrigger(yv, rng)).toBe('area_loaded');
    expect(yv.areaCode).toBe('5-2');
    expect(exitCribToReturnArea(yv)).toBe(false);

    // Proto Chest: storing frog_pistol and retrieving it converts to golden_frog_pistol!
    const vaultRun = createInitialSimState({ mutant: 'fish', seed: 9421 });
    givePlayerWeapon(vaultRun, 'frog_pistol', 0, false, { grantBonus: false });
    givePlayerWeapon(vaultRun, 'shotgun', 1, false, { grantBonus: false });
    vaultRun.player.activeSlot = 0;
    const protoProp = {
      id: allocEntityId(vaultRun),
      kind: 'proto_chest' as const,
      x: vaultRun.player.x,
      y: vaultRun.player.y,
      radius: 10,
      hp: 999,
      maxHp: 999,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprProtoChestEmpty',
    };
    expect(interactProtoChest(vaultRun, protoProp)).toBe(true);
    expect(getProtoChestWeaponId(vaultRun)).toBe('frog_pistol');
    expect(protoProp.sprite).toBe('sprProtoChest');

    // Next run retrieves stored frog_pistol -> converts to golden_frog_pistol!
    const nextRun = createInitialSimState({
      mutant: 'eyes',
      seed: 9422,
      protoChestWeaponId: getProtoChestWeaponId(vaultRun),
    });
    expect(interactProtoChest(nextRun, protoProp)).toBe(true);
    expect(nextRun.player.weapons[0]?.weaponId).toBe('golden_frog_pistol');
    expect(getProtoChestWeaponId(nextRun)).toBe('revolver');
    setProtoChestWeaponId(nextRun, null);
  });
});

describe('Wiki Parity: Mutation & Crown Formulas (§§4.2 & 4.3) + Bug #11', () => {
  it('verifies Stress formula, GammaBlast AOE, Euphoria 0.80x, Boiling Veins, Patience, and Lucky Shot mini packs', () => {
    // 1. Stress exact formula: reload *= (0.2 + 0.8 * (hp / maxHp))
    const stressState = createInitialSimState({ mutant: 'fish', seed: 9501 });
    const sRng = SeededRng.fromState(stressState.rngState);
    grantMutationById(stressState, 'stress', sRng);
    givePlayerWeapon(stressState, 'super_bazooka', 0, false, { grantBonus: false });
    const baseReload = WEAPONS.super_bazooka!.reloadTicks;
    stressState.player.hp = 4; // 4/8 -> 0.2 + 0.8 * 0.5 = 0.6
    stressState.player.ammo.explosive = 20;
    stressState.tick += 1;
    stepPlayerAndCombat(
      stressState,
      makeInput({ aimWorldX: stressState.player.x + 30, aimWorldY: stressState.player.y, firePressed: true }),
      sRng,
    );
    expect(stressState.player.weapons[0]!.maxReloadTicks).toBe(Math.round(baseReload * 0.6));

    // 2. Gamma Guts GammaBlast: 8 AOE dmg + sprGammaBlast on Gamma Guts kill!
    const gg = createInitialSimState({ mutant: 'fish', seed: 9502 });
    clearBox(gg, 8, 6);
    const ggRng = SeededRng.fromState(gg.rngState);
    grantMutationById(gg, 'gamma_guts', ggRng);
    gg.enemies = [];
    const target = createEnemyEntity(gg, 'maggot', gg.player.x, gg.player.y, ggRng);
    target.hp = 2;
    const bystander = createEnemyEntity(gg, 'bandit', gg.player.x + 28, gg.player.y, ggRng);
    bystander.hp = 20;
    bystander.maxHp = 20;
    gg.events = [];
    gg.tick += 1;
    stepPlayerAndCombat(gg, makeInput({ aimWorldX: gg.player.x + 30, aimWorldY: gg.player.y }), ggRng);
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(bystander.hp).toBe(12); // Took 8 AOE GammaBlast dmg!
    expect(gg.events.some((e) => e.type === 'particle' && e.sprite === 'sprGammaBlast')).toBe(true);

    // 3. Euphoria exact 0.80x enemy projectile speed
    const euph = createInitialSimState({ mutant: 'fish', seed: 9503 });
    const eRng = SeededRng.fromState(euph.rngState);
    const pBase = spawnEnemyProjectile(euph, { x: 100, y: 100, angle: 0, speed: 10, damage: 2 });
    grantMutationById(euph, 'euphoria', eRng);
    const pSlow = spawnEnemyProjectile(euph, { x: 100, y: 100, angle: 0, speed: 10, damage: 2 });
    expect(pBase.vx).toBeCloseTo(10, 4);
    expect(pSlow.vx).toBeCloseTo(8, 4);

    // 4. Boiling Veins clamps lethal explosion from >4 HP down to 4 HP & blocks at <= 4 HP
    const bv = createInitialSimState({ mutant: 'fish', seed: 9504 });
    const bvRng = SeededRng.fromState(bv.rngState);
    grantMutationById(bv, 'boiling_veins', bvRng);
    bv.player.hp = 6;
    applyDamageToPlayer(bv, 10, 'EXPLOSION', 'sprExplosion', bvRng, { isExplosion: true });
    expect(bv.player.hp).toBe(4);
    bv.player.iframes = 0;
    expect(applyDamageToPlayer(bv, 10, 'FIRE', 'sprFlame', bvRng, { isFire: true })).toBe(false);
    expect(bv.player.hp).toBe(4);

    // 5. Patience sets pendingPatiencePick & offers fresh 4-card roll on portal exit
    const pat = createInitialSimState({ mutant: 'fish', seed: 9505 });
    const patRng = SeededRng.fromState(pat.rngState);
    grantMutationById(pat, 'patience', patRng);
    expect(pat.pendingPatiencePick).toBe(true);
    pat.portal.active = true;
    pat.portal.entered = true;
    pat.phase = 'portal_transition';
    pat.portalTransitionTicks = PORTAL_WARP_TICKS;
    expect(checkPortalTrigger(pat, patRng)).toBe('selection_opened');
    expect(pat.pendingPatiencePick).toBe(false);
    expect(pat.pendingMutations).toHaveLength(4);

    // 6. Lucky Shot awards mini ammo pack sizes (bullet=12, shell=4, bolt=4, explosive=3, energy=6)
    expect(MINI_AMMO_PACK_SIZE).toEqual({
      melee: 0,
      bullet: 12,
      shell: 4,
      bolt: 4,
      explosive: 3,
      energy: 6,
    });
  });

  it('verifies Pre/Post-Loop Vault Crown split, Hatred (lethal + 16 rads), Blood (-1 rad), Love, Protection walk-over (+1 HP), and Crown of Life Bug #11 sync', () => {
    // 1. Pre-Loop vs Post-Loop Crown pool split!
    expect(getVaultCrownPool(0)).toEqual(PRE_LOOP_CROWN_IDS);
    expect(getVaultCrownPool(1)).toEqual(POST_LOOP_CROWN_IDS);
    const vState = createInitialSimState({ mutant: 'fish', seed: 9510 });
    expect(selectVaultCrown(vState, 'blood')).toBe(false); // Post-loop crown rejected on Loop 0!
    expect(selectVaultCrown(vState, 'haste')).toBe(true);
    vState.loop = 1;
    expect(selectVaultCrown(vState, 'haste')).toBe(false); // Pre-loop crown rejected on Loop 1!
    expect(selectVaultCrown(vState, 'blood')).toBe(true);

    // 2. Crown of Hatred: 1 LETHAL dmg + 16 rads on chest AND rad canister break
    const hat = createInitialSimState({ mutant: 'fish', seed: 9511, crown: 'hatred' });
    const hRng = SeededRng.fromState(hat.rngState);
    hat.pickups = [];
    hat.player.hp = 1; // Lethal!
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
    expect(hat.player.alive).toBe(false);
    const hatredRads = hat.pickups
      .filter((p) => p.kind === 'rad' || p.kind === 'big_rad')
      .reduce((s, p) => s + p.value, 0);
    expect(hatredRads).toBe(16);

    // 3. Crown of Blood: -1 rad per enemy (min 0)
    const blood = createInitialSimState({ mutant: 'fish', seed: 9512, crown: 'blood' });
    const bRng = SeededRng.fromState(blood.rngState);
    blood.pickups = [];
    const e1 = createEnemyEntity(blood, 'bandit', blood.player.x + 30, blood.player.y, bRng);
    e1.radDrop = 3;
    applyDamageToEnemy(blood, e1, 99, 0, 0, bRng);
    expect(
      blood.pickups.filter((p) => p.kind === 'rad' || p.kind === 'big_rad').reduce((s, p) => s + p.value, 0),
    ).toBe(2);

    // 4. Crown of Life + Bug #11: sprite & openSprite ALWAYS match reward (wounded vs full HP)
    const life = createInitialSimState({ mutant: 'fish', seed: 9513, crown: 'life' });
    clearBox(life, 6, 4);
    const lRng = SeededRng.fromState(life.rngState);
    const chestA = {
      id: allocEntityId(life),
      kind: 'ammo_chest' as const,
      x: life.player.x + 40,
      y: life.player.y,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprAmmoChest',
      openSprite: 'sprAmmoChestOpen',
    };
    life.props.push(chestA);
    life.player.hp = 3;
    life.tick += 1;
    stepPlayerAndCombat(life, makeInput({ aimWorldX: life.player.x + 20, aimWorldY: life.player.y }), lRng);
    // Synced while still unopened!
    expect(chestA.sprite).toBe('sprHealthChest');
    expect(chestA.openSprite).toBe('sprHealthChestOpen');
    // Heal to full HP BEFORE opening -> sprite flips BACK to sprAmmoChest & drops ammo on open!
    life.player.hp = life.player.maxHp;
    life.tick += 1;
    stepPlayerAndCombat(life, makeInput({ aimWorldX: life.player.x + 20, aimWorldY: life.player.y }), lRng);
    expect(chestA.sprite).toBe('sprAmmoChest');
    life.pickups = [];
    openChest(life, chestA, lRng);
    expect(chestA.sprite).toBe('sprAmmoChestOpen');
    expect(life.pickups.some((p) => p.kind === 'ammo')).toBe(true);

    // 5. Crown of Love converts weapon chests AND rad canisters to ammo chests!
    const love = createInitialSimState({ mutant: 'fish', seed: 9514, crown: 'love' });
    expect(love.props.some((p) => p.kind === 'weapon_chest' || p.kind === 'rad_canister')).toBe(false);
    expect(love.props.filter((p) => p.kind === 'ammo_chest').length).toBeGreaterThanOrEqual(3);

    // 6. Crown of Protection: walking over fresh ground weapon heals +1 HP without pressing E!
    const prot = createInitialSimState({ mutant: 'fish', seed: 9515, crown: 'protection' });
    clearBox(prot, 6, 4);
    const pRng = SeededRng.fromState(prot.rngState);
    prot.player.hp = 4;
    prot.pickups = [];
    spawnPickup(prot, 'weapon', prot.player.x, prot.player.y, { weaponId: 'shotgun', value: 1 }, pRng);
    prot.tick += 1;
    stepPlayerAndCombat(prot, makeInput({ aimWorldX: prot.player.x + 20, aimWorldY: prot.player.y }), pRng);
    expect(prot.player.hp).toBe(5);
  });
});

describe('Wiki Parity: Game Feel, Rad Canister Skip Streak, Difficulty, Bugs #1 & #22b, Unlocks', () => {
  it('NEVER auto-vacuums rad canisters, tracks radCanisterSkipStreak (resets on break), tracks difficulty + Vault exit ambush + Bug #22b vaultReturnArea', () => {
    const state = createInitialSimState({ mutant: 'fish', seed: 9601 });
    const rng = SeededRng.fromState(state.rngState);
    expect(state.difficulty).toBe(1);
    expect(state.radCanisterSkipStreak).toBe(0);

    // Leave intact rad_canister behind on portal exit -> NOT vacuumed, streak increments to 1!
    const preRads = state.player.rads;
    state.props = [
      {
        id: allocEntityId(state),
        kind: 'rad_canister',
        x: state.player.x + 40,
        y: state.player.y,
        radius: 8,
        hp: 6,
        maxHp: 6,
        solid: false,
        opened: false,
        hurtFlashTicks: 0,
        sprite: 'sprRadChest',
        radsStored: 16,
      },
    ];
    state.portal.active = true;
    state.portal.entered = true;
    state.phase = 'portal_transition';
    state.portalTransitionTicks = PORTAL_WARP_TICKS;
    state.tick = 20;
    expect(checkPortalTrigger(state, rng)).toBe('area_loaded');
    expect(state.player.rads).toBe(preRads); // ZERO rads auto-vacuumed from canister!
    expect(state.radCanisterSkipStreak).toBe(1);
    expect(state.difficulty).toBe(2);

    // Breaking a rad_maggot_canister resets streak to 0, drops 1.5x rads, and spawns 4-6 rad_maggots!
    state.enemies = [];
    state.pickups = [];
    const magCan = {
      id: allocEntityId(state),
      kind: 'rad_maggot_canister' as const,
      x: state.player.x + 20,
      y: state.player.y,
      radius: 8,
      hp: 6,
      maxHp: 6,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprRadMaggotChest',
      radsStored: 10,
    };
    state.props.push(magCan);
    damageProp(state, magCan, 20, rng);
    expect(state.radCanisterSkipStreak).toBe(0);
    const radSum = state.pickups
      .filter((p) => p.kind === 'rad' || p.kind === 'big_rad')
      .reduce((s, p) => s + p.value, 0);
    expect(radSum).toBe(15); // 1.5x of 10
    const radMaggots = state.enemies.filter((e) => e.defId === 'rad_maggot');
    expect(radMaggots.length).toBeGreaterThanOrEqual(4);
    expect(radMaggots.length).toBeLessThanOrEqual(6);

    // Bug #22b Fix: entering Vault from 5-2 preserves vaultReturnArea = '5-3' (NOT '4-1'!)
    // Exiting Vault adds extra +1 difficulty AND sets vaultAmbushPending = true!
    state.tick = 100;
    loadAreaIntoState(state, '5-2', 0);
    const diffAt52 = state.difficulty!;
    loadAreaIntoState(state, 'vault', 0);
    expect(getRunRuntime(state).vaultReturnArea).toBe('5-3');
    expect(state.portal.targetArea).toBe('5-3');
    const diffAtVault = state.difficulty!;
    expect(diffAtVault).toBe(diffAt52 + 1);

    loadAreaIntoState(state, state.portal.targetArea, 0);
    expect(state.areaCode).toBe('5-3');
    expect(state.vaultAmbushPending).toBe(true);
    expect(state.difficulty).toBe(diffAtVault + 2); // +1 normal + 1 extra Vault exit!
  });

  it('Portal feel (30-tick delay, sprPortalClear car detonation), 5 vs 11 i-frames, 2-tick melee-deflect hitstop, Bug #1 Rogue 90ms WASD+camera pan safety, and Unlocks', () => {
    // 1. Portal 30-tick spawn delay + car detonation ("PORTALS CAN DETONATE CARS")
    const pState = createInitialSimState({ mutant: 'fish', seed: 9610 });
    clearBox(pState, 10, 8);
    const pRng = SeededRng.fromState(pState.rngState);
    pState.enemies = [];
    pState.levelStartEnemyCount = 1;
    pState.levelKills = 1;
    // Must stay closed for first PORTAL_SPAWN_DELAY_TICKS - 1 calls, then open on tick 30!
    for (let t = 0; t < PORTAL_SPAWN_DELAY_TICKS - 1; t++) {
      expect(checkPortalTrigger(pState, pRng)).toBe('none');
      expect(pState.portal.active).toBe(false);
    }
    expect(checkPortalTrigger(pState, pRng)).toBe('portal_opened');
    expect(pState.portal.active).toBe(true);

    // Place a car near portal -> stepPortal detonates it and emits sprPortalClear!
    pState.props.push({
      id: allocEntityId(pState),
      kind: 'car',
      x: pState.portal.x + 24,
      y: pState.portal.y,
      radius: 10,
      hp: 20,
      maxHp: 20,
      solid: true,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprCarIdle',
    });
    pState.events = [];
    stepPortal(pState);
    expect(pState.props.some((p) => p.kind === 'car')).toBe(false);
    expect(pState.events.some((e) => e.type === 'particle' && e.sprite === 'sprPortalClear')).toBe(true);
    expect(pState.events.some((e) => e.type === 'sfx' && e.sound === 'sndExplosionCar')).toBe(true);

    // 2. Distinguished i-frames (5 projectile vs 11 contact) + 2-tick melee deflection hitstop!
    const ifr = createInitialSimState({ mutant: 'fish', seed: 9611 });
    clearBox(ifr, 8, 6);
    const iRng = SeededRng.fromState(ifr.rngState);
    applyDamageToPlayer(ifr, 1, 'BANDIT BULLET', 'sprEnemyBullet1', iRng, { isProjectile: true });
    expect(ifr.player.iframes).toBe(PLAYER_PROJECTILE_IFRAMES);
    expect(PLAYER_PROJECTILE_IFRAMES).toBe(5);
    ifr.player.iframes = 0;
    applyDamageToPlayer(ifr, 1, 'BANDIT CONTACT', 'sprBanditIdle', iRng, { isContact: true });
    expect(ifr.player.iframes).toBe(PLAYER_CONTACT_IFRAMES);
    expect(PLAYER_CONTACT_IFRAMES).toBe(11);

    // 2-tick melee deflection hitstop!
    givePlayerWeapon(ifr, 'wrench', 0, false, { grantBonus: false });
    ifr.hitstopTicks = 0;
    spawnEnemyProjectile(ifr, {
      x: ifr.player.x + 16,
      y: ifr.player.y,
      angle: Math.PI,
      speed: 4,
      damage: 2,
    });
    ifr.tick += 1;
    stepPlayerAndCombat(
      ifr,
      makeInput({ aimWorldX: ifr.player.x + 40, aimWorldY: ifr.player.y, firePressed: true }),
      iRng,
    );
    expect(ifr.hitstopTicks).toBe(2);

    // 3. Bug #1 Fix: Rogue 90ms (3-tick) RMB click while walking WASD + cursor moving WITH camera NEVER self-damages!
    const rogue = createInitialSimState({ mutant: 'rogue', seed: 9612 });
    clearBox(rogue, 14, 8);
    rogue.enemies = [];
    const rRng = SeededRng.fromState(rogue.rngState);
    const startHp = rogue.player.hp;
    // Cursor is fixed at +10px screen offset from Rogue while Rogue walks right at ~4px/tick (world aim moves 12px over 3 ticks!)
    for (let t = 0; t < 3; t++) {
      rogue.tick += 1;
      stepPlayerAndCombat(
        rogue,
        makeInput({
          moveX: 1,
          aimWorldX: rogue.player.x + 10,
          aimWorldY: rogue.player.y,
          activePressed: t === 0,
          activeHeld: true,
        }),
        rRng,
      );
    }
    // Release RMB on tick 4 (after 90ms hold) -> relative drag was ~0px AND holdTicks < 4 -> MUST enforce safeStandoff!
    rogue.tick += 1;
    stepPlayerAndCombat(
      rogue,
      makeInput({
        moveX: 0,
        aimWorldX: rogue.player.x + 10,
        aimWorldY: rogue.player.y,
        activeHeld: false,
      }),
      rRng,
    );
    for (let t = 0; t < 36; t++) {
      rogue.tick += 1;
      stepPlayerAndCombat(rogue, makeInput({ aimWorldX: rogue.player.x + 10, aimWorldY: rogue.player.y }), rRng);
    }
    expect(rogue.player.hp).toBe(startHp);

    // 4. B-skin & Hard Mode unlocks
    const unl = createInitialSimState({ mutant: 'crystal', seed: 9613 });
    loadAreaIntoState(unl, '4-?', 2);
    expect(getPendingUnlocks(unl)).toContain('bskin_crystal');
    expect(getPendingUnlocks(unl)).toContain('hard_mode');

    const mel = createInitialSimState({ mutant: 'melting', seed: 9614 });
    loadAreaIntoState(mel, '7-3', 0);
    expect(getPendingUnlocks(mel)).toContain('bskin_melting');

    const plt = createInitialSimState({ mutant: 'plant', seed: 9615 });
    plt.stats.timeTicks = 5000;
    loadAreaIntoState(plt, '7-3', 0);
    expect(getPendingUnlocks(plt)).toContain('bskin_plant');

    const rob = createInitialSimState({ mutant: 'robot', seed: 9616 });
    const robRng = SeededRng.fromState(rob.rngState);
    givePlayerWeapon(rob, 'hyper_rifle', 0, false, { grantBonus: false });
    givePlayerWeapon(rob, 'revolver', 1, false, { grantBonus: false });
    rob.player.activeSlot = 0;
    rob.tick += 1;
    stepPlayerAndCombat(rob, makeInput({ aimWorldX: rob.player.x + 20, aimWorldY: rob.player.y, activePressed: true }), robRng);
    expect(getPendingUnlocks(rob)).toContain('bskin_robot');

    const chickHard = createInitialSimState({ mutant: 'chicken', seed: 9617, hardMode: true });
    expect(chickHard.hardMode).toBe(true);
    expect(chickHard.loop).toBe(1);
    expect(chickHard.difficulty).toBe(8);
    loadAreaIntoState(chickHard, '2-1', 1);
    expect(getPendingUnlocks(chickHard)).toContain('bskin_chicken');

    // Cross-run global B-skins (Fish all-loop + Y.V. all golden)
    const core12: MutantId[] = [
      'fish', 'crystal', 'eyes', 'melting', 'plant', 'yv',
      'steroids', 'robot', 'chicken', 'rebel', 'horror', 'rogue',
    ];
    const mockSave: SaveData = createDefaultSaveData();
    for (const id of core12) {
      mockSave.mutants[id].bestLoop = 1;
      mockSave.mutants[id].goldenWeapon = 'golden_revolver';
    }
    expect(checkSaveLevelUnlocks(mockSave)).toEqual(['bskin_fish', 'bskin_yv']);
  });
});
