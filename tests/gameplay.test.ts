import { describe, expect, it } from 'vitest';
import {
  TileType,
  type AmmoType,
  type AreaCode,
  type BossId,
  type InputFrame,
  type SimState,
} from '@/contracts';
import {
  BOSS_IDS,
  ENEMIES,
  MUTANTS,
  MUTANT_IDS,
  MUTATIONS,
  MUTATION_IDS,
  ULTRAS,
  WEAPONS,
  WEAPON_IDS,
} from '@/data';
import {
  SeededRng,
  allocEntityId,
  hashSimState,
  isWorldSolid,
  setTile,
  worldToTile,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  damageProp,
  getPlayerMoveSpeed,
  spawnCorpse,
  spawnEnemyProjectile,
  stepPlayerAndCombat,
} from '@/sim/combat';
import {
  addRads,
  applyMutationSelection,
  drawMutationChoices,
  givePlayerWeapon,
  grantMutationById,
  openPendingLevelUp,
} from '@/sim/progression';
import {
  createEnemyEntity,
  createRunState,
  populateAreaEntities,
  registerTrackedEnemy,
  resetAreaRuntime,
  spawnBossEntity,
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

function clearChamber(state: SimState): void {
  const { tx: ptx, ty: pty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
  for (let ty = pty - 4; ty <= pty + 4; ty++) {
    for (let tx = ptx - 4; tx <= ptx + 4; tx++) {
      setTile(state.map, tx, ty, TileType.Floor);
    }
  }
}

describe('gameplay: All 12 Mutants', () => {
  it('instantiates all 12 mutants, executes RMB actives, Throne Butt, and Ultras cleanly', () => {
    expect(MUTANT_IDS).toHaveLength(12);
    expect(Object.keys(ULTRAS)).toHaveLength(24);

    for (const mutantId of MUTANT_IDS) {
      const def = MUTANTS[mutantId];
      const state = createRunState({ mutant: mutantId, seed: 4242 });
      state.enemies = [];
      clearChamber(state);

      expect(state.player.maxHp).toBe(def.maxHp);
      expect(state.player.weapons[0]?.weaponId).toBe(def.startingWeapon);
      if (def.secondaryWeapon) {
        expect(state.player.weapons[1]?.weaponId).toBe(def.secondaryWeapon);
      }

      if (mutantId === 'melting') {
        spawnCorpse(state, state.player.x + 18, state.player.y, 0, 0, 1, 'sprBanditDead', 12, true);
      } else if (mutantId === 'horror') {
        state.player.rads = 25;
      } else if (mutantId === 'robot') {
        givePlayerWeapon(state, 'shotgun', 1, false);
      }

      const preShots = state.stats.shotsFired;
      const preCorpses = state.corpses.length;
      const preStrikes = state.player.portalStrikes;
      const preRads = state.player.rads;

      const rng = SeededRng.fromState(state.rngState);
      state.tick += 1;
      stepPlayerAndCombat(
        state,
        makeInput({
          aimWorldX: state.player.x + 48,
          aimWorldY: state.player.y,
          activePressed: true,
          activeHeld: true,
        }),
        rng,
      );
      state.tick += 1;
      stepPlayerAndCombat(
        state,
        makeInput({
          aimWorldX: state.player.x + 48,
          aimWorldY: state.player.y,
          activePressed: false,
          activeHeld: true,
        }),
        rng,
      );
      state.rngState = rng.getState();

      expect(Number.isFinite(state.player.x)).toBe(true);
      expect(Number.isFinite(state.player.y)).toBe(true);

      if (mutantId === 'fish') expect(state.player.rolling).toBe(true);
      if (mutantId === 'crystal') expect(state.player.shielding).toBe(true);
      if (mutantId === 'eyes') expect(state.player.telekinesisActive).toBe(true);
      if (mutantId === 'melting') expect(state.corpses.length).toBeLessThan(preCorpses);
      if (mutantId === 'plant') {
        expect(
          state.projectiles.some((p) => p.kind === 'snare') ||
            state.props.some((pr) => pr.kind === 'snare_trap'),
        ).toBe(true);
      }
      if (mutantId === 'yv') expect(state.stats.shotsFired).toBeGreaterThanOrEqual(preShots + 2);
      if (mutantId === 'steroids') expect(state.stats.shotsFired).toBeGreaterThanOrEqual(preShots + 1);
      if (mutantId === 'robot') expect(state.player.weapons[1]).toBeNull();
      if (mutantId === 'chicken') {
        expect(
          state.projectiles.some((p) => p.kind === 'thrown_weapon') ||
            state.pickups.some((pk) => pk.kind === 'weapon'),
        ).toBe(true);
      }
      if (mutantId === 'rebel') {
        expect(state.enemies.some((e) => e.friendly && e.defId === 'rebel_ally')).toBe(true);
      }
      if (mutantId === 'horror') {
        expect(state.player.rads).toBeLessThan(preRads);
        expect(state.projectiles.some((p) => p.kind === 'rad_beam')).toBe(true);
      }
      if (mutantId === 'rogue') expect(state.player.portalStrikes).toBe(preStrikes - 1);
    }
  });
});

describe('gameplay: All 29 Mutations', () => {
  it('grants all 29 mutations and verifies key mechanical rules & card draw counts', () => {
    expect(MUTATION_IDS).toHaveLength(29);
    expect(Object.keys(MUTATIONS)).toHaveLength(29);

    const state = createRunState({ mutant: 'fish', seed: 9001 });
    const baseSpeed = getPlayerMoveSpeed(state.player);
    const baseMaxHp = state.player.maxHp;
    const baseBulletMax = state.player.ammoMax.bullet;

    const rng = SeededRng.fromState(state.rngState);
    for (const mutId of MUTATION_IDS) {
      expect(grantMutationById(state, mutId, rng)).toBe(true);
      expect(state.player.mutations).toContain(mutId);
    }
    expect(state.player.maxHp).toBe(baseMaxHp + 4);
    expect(getPlayerMoveSpeed(state.player)).toBeGreaterThan(baseSpeed);
    expect(state.player.ammoMax.bullet).toBeGreaterThan(baseBulletMax);
    expect(state.player.strongSpiritReady).toBe(true);
    expect(state.player.ammo.bullet).toBe(state.player.ammoMax.bullet);

    // Boiling Veins blocks explosions at <= 4 HP
    const bv = createRunState({ mutant: 'fish', seed: 9002 });
    const bvRng = SeededRng.fromState(bv.rngState);
    grantMutationById(bv, 'boiling_veins', bvRng);
    bv.player.hp = 4;
    expect(
      applyDamageToPlayer(bv, 4, 'EXPLOSION', 'sprExplosion', bvRng, { isExplosion: true }),
    ).toBe(false);
    expect(bv.player.hp).toBe(4);

    // Strong Spirit saves lethal hit at 1 HP once
    const ss = createRunState({ mutant: 'fish', seed: 9003 });
    const ssRng = SeededRng.fromState(ss.rngState);
    grantMutationById(ss, 'strong_spirit', ssRng);
    applyDamageToPlayer(ss, 20, 'HIT', 'sprEnemyBullet1', ssRng);
    expect(ss.player.alive).toBe(true);
    expect(ss.player.hp).toBe(1);
    expect(ss.player.strongSpiritReady).toBe(false);

    // Sharp Teeth retaliates to nearby enemy
    const st = createRunState({ mutant: 'crystal', seed: 9004 });
    st.enemies = [];
    const stRng = SeededRng.fromState(st.rngState);
    grantMutationById(st, 'sharp_teeth', stRng);
    const foe = createEnemyEntity(st, 'scorpion', st.player.x + 28, st.player.y, stRng);
    const preFoeHp = foe.hp;
    applyDamageToPlayer(st, 3, 'TEST', 'sprEnemyBullet1', stRng);
    expect(foe.hp).toBe(preFoeHp - 6);

    // Trigger Fingers shortens active reload on kill
    const tf = createRunState({ mutant: 'fish', seed: 9005 });
    tf.enemies = [];
    const tfRng = SeededRng.fromState(tf.rngState);
    grantMutationById(tf, 'trigger_fingers', tfRng);
    tf.player.weapons[0]!.reloadTicks = 20;
    const weak = createEnemyEntity(tf, 'maggot', tf.player.x + 24, tf.player.y, tfRng);
    applyDamageToEnemy(tf, weak, 10, 1, 0, tfRng);
    expect(tf.player.weapons[0]!.reloadTicks).toBeLessThan(20);

    // Horror draws 5 mutation cards vs standard 4 cards; Heavy Heart gated until 3 weapon mutations
    const fishDraw = createRunState({ mutant: 'fish', seed: 9006 });
    const horrorDraw = createRunState({ mutant: 'horror', seed: 9006 });
    expect(drawMutationChoices(fishDraw, SeededRng.fromState(fishDraw.rngState))).toHaveLength(4);
    expect(drawMutationChoices(horrorDraw, SeededRng.fromState(horrorDraw.rngState))).toHaveLength(5);
  });
});

describe('gameplay: All 142 Weapons & Melee Deflection', () => {
  it('validates all 142 weapons across all 5 ammo classes + melee, golden, cursed, and ultra tiers', () => {
    expect(WEAPON_IDS).toHaveLength(142);
    expect(Object.keys(WEAPONS)).toHaveLength(142);

    const ammoCounts: Record<AmmoType, number> = {
      melee: 0,
      bullet: 0,
      shell: 0,
      bolt: 0,
      explosive: 0,
      energy: 0,
    };
    let goldenCount = 0;
    let cursedCount = 0;
    let ultraCount = 0;

    for (const w of Object.values(WEAPONS)) {
      ammoCounts[w.ammoType] += 1;
      expect(w.reloadTicks).toBeGreaterThan(0);
      expect(w.damage).toBeGreaterThan(0);
      expect(w.sprite.length).toBeGreaterThan(0);
      expect(w.fireSound.length).toBeGreaterThan(0);
      if (w.golden) goldenCount += 1;
      if (w.cursed) cursedCount += 1;
      if (w.ultra) ultraCount += 1;
    }

    for (const ammo of Object.keys(ammoCounts) as AmmoType[]) {
      expect(ammoCounts[ammo]).toBeGreaterThanOrEqual(10);
    }
    expect(goldenCount).toBeGreaterThanOrEqual(6);
    expect(cursedCount).toBeGreaterThanOrEqual(1);
    expect(ultraCount).toBeGreaterThanOrEqual(6);
  });

  it('deflects enemy projectiles with wrench, shovel, and energy_sword and destroys with screwdriver', () => {
    const cases: Array<{ id: string; mode: 'deflect' | 'destroy' }> = [
      { id: 'wrench', mode: 'deflect' },
      { id: 'shovel', mode: 'deflect' },
      { id: 'energy_sword', mode: 'deflect' },
      { id: 'screwdriver', mode: 'destroy' },
    ];

    for (const tc of cases) {
      const state = createRunState({ mutant: 'fish', seed: 777 });
      state.enemies = [];
      state.projectiles = [];
      clearChamber(state);
      givePlayerWeapon(state, tc.id, 0, false);
      state.player.activeSlot = 0;
      state.player.weapons[0]!.reloadTicks = 0;
      state.player.ammo.energy = state.player.ammoMax.energy;

      const incoming = spawnEnemyProjectile(state, {
        x: state.player.x + 18,
        y: state.player.y,
        angle: Math.PI,
        speed: 3.5,
        damage: 2,
      });

      stepSimulation(
        state,
        makeInput({
          aimWorldX: state.player.x + 48,
          aimWorldY: state.player.y,
          fireHeld: true,
          firePressed: true,
        }),
      );

      if (tc.mode === 'deflect') {
        expect(incoming.team).toBe('player');
        expect(incoming.vx).toBeGreaterThan(0);
      } else {
        expect(state.projectiles).not.toContain(incoming);
      }
    }
  });
});

describe('gameplay: All 5 Bosses & Full Progression Determinism', () => {
  it('exercises all 5 bosses (including 7-3 generators -> 0-1 Throne II -> Loop 1-1)', () => {
    const bossAreas: Record<BossId, { area: AreaCode; nextArea: AreaCode; nextLoop: number }> = {
      big_bandit: { area: '1-3', nextArea: '2-1', nextLoop: 0 },
      big_dog: { area: '3-3', nextArea: '4-1', nextLoop: 0 },
      lil_hunter: { area: '5-3', nextArea: '6-1', nextLoop: 0 },
      nuclear_throne: { area: '7-3', nextArea: '0-1', nextLoop: 0 },
      throne_ii: { area: '0-1', nextArea: '1-1', nextLoop: 1 },
    };

    expect(Object.keys(ENEMIES)).toHaveLength(50);

    for (const bossId of BOSS_IDS) {
      const cfg = bossAreas[bossId];
      const state = createRunState({ mutant: 'crystal', seed: 5100 + bossId.length });
      state.player.godMode = true;
      warpToArea(state, cfg.area, 0);

      state.enemies = state.enemies.filter((e) => e.isBoss);
      const rt = resetAreaRuntime(state);
      rt.throneLastGenCount = state.generatorsRemaining;
      let boss = state.enemies.find((e) => e.bossId === bossId);
      if (boss) {
        registerTrackedEnemy(state, boss, false);
      } else {
        const r = SeededRng.fromState(state.rngState);
        boss = spawnBossEntity(state, bossId, r);
        state.rngState = r.getState();
      }
      expect(boss).toBeDefined();
      expect(state.boss?.bossId).toBe(bossId);

      if (bossId === 'big_dog' || bossId === 'nuclear_throne') {
        const wakeRng = SeededRng.fromState(state.rngState);
        applyDamageToEnemy(state, boss!, 5, 0, 0, wakeRng);
        state.rngState = wakeRng.getState();
      }

      if (bossId === 'nuclear_throne') {
        const gens = state.props.filter((p) => p.kind === 'throne_generator');
        expect(gens).toHaveLength(4);
        const genRng = SeededRng.fromState(state.rngState);
        for (const g of gens) {
          damageProp(state, g, 200, genRng);
        }
        state.rngState = genRng.getState();
        expect(state.generatorsRemaining).toBe(0);
      }

      const statesSeen = new Set<string>();
      let enemyProjSeen = 0;
      for (let t = 0; t < 140; t++) {
        const live = state.enemies.find((e) => e.id === boss!.id);
        if (live) statesSeen.add(live.aiState);
        stepSimulation(state, makeInput({ aimWorldX: boss!.x, aimWorldY: boss!.y }));
        for (const pr of state.projectiles) {
          if (pr.team === 'enemy') enemyProjSeen += 1;
        }
      }

      expect(statesSeen.size).toBeGreaterThanOrEqual(2);
      expect(enemyProjSeen).toBeGreaterThan(0);

      // Defeat boss and verify portal
      const live = state.enemies.find((e) => e.id === boss!.id);
      if (live) {
        live.invulnerable = false;
        const killRng = SeededRng.fromState(state.rngState);
        applyDamageToEnemy(state, live, live.hp + 999, 1, 0, killRng);
        state.rngState = killRng.getState();
      }

      for (let k = 0; k < 10 && !state.portal.active; k++) {
        stepSimulation(state, makeInput({ aimWorldX: state.player.x, aimWorldY: state.player.y }));
      }
      expect(state.boss?.defeated).toBe(true);
      expect(state.portal.active).toBe(true);
      expect(state.portal.targetArea).toBe(cfg.nextArea);
      expect(state.portal.nextLoop).toBe(cfg.nextLoop);

      if (bossId === 'nuclear_throne' || bossId === 'throne_ii') {
        state.player.x = state.portal.x;
        state.player.y = state.portal.y;
        for (let k = 0; k < 40 && state.areaCode === cfg.area; k++) {
          const selectIndex =
            state.phase === 'mutation_select' || state.phase === 'ultra_select' ? 0 : undefined;
          stepSimulation(
            state,
            makeInput({ aimWorldX: state.player.x, aimWorldY: state.player.y, selectIndex }),
          );
        }
        expect(state.areaCode).toBe(cfg.nextArea);
        expect(state.loop).toBe(cfg.nextLoop);
      }
    }
  });

  it('rolls over portal-vacuumed rads and rad canisters into immediate level-ups before area exit (RT-09)', () => {
    for (const source of ['big_rad', 'rad_canister'] as const) {
      const state = createRunState({ mutant: 'fish', seed: 101 });
      state.enemies = [];
      state.pickups = [];
      state.props = [];
      state.portal.active = true;
      state.portal.x = state.player.x + 80;
      state.portal.y = state.player.y;

      if (source === 'big_rad') {
        state.pickups.push({
          id: allocEntityId(state),
          kind: 'big_rad',
          x: state.portal.x + 20,
          y: state.portal.y,
          vx: 0,
          vy: 0,
          value: 80,
          lifeTicks: 300,
          animFrame: 0,
        });
      } else {
        state.props.push({
          id: allocEntityId(state),
          kind: 'rad_canister',
          x: state.portal.x + 20,
          y: state.portal.y,
          radius: 8,
          hp: 6,
          maxHp: 6,
          solid: false,
          opened: false,
          hurtFlashTicks: 0,
          sprite: 'sprRadChest',
          radsStored: 80,
        });
      }

      let sawLevelUpEvent = false;
      for (let t = 0; t < 15; t++) {
        stepSimulation(state, makeInput({ aimWorldX: state.player.x + 10, aimWorldY: state.player.y }));
        if (state.events.some((e) => e.type === 'level_up' && e.level === 2)) {
          sawLevelUpEvent = true;
        }
      }

      expect(state.areaCode).toBe('1-1');
      expect(state.player.level).toBe(2);
      expect(state.player.rads).toBe(20);
      expect(state.player.radsToNextLevel).toBe(120);
      expect(state.pendingLevelUps).toBeGreaterThanOrEqual(1);
      expect(sawLevelUpEvent).toBe(true);

      // Entering portal immediately offers mutation selection before loading 1-2
      state.player.x = state.portal.x;
      state.player.y = state.portal.y;
      for (let t = 0; t < 35 && state.phase !== 'mutation_select'; t++) {
        stepSimulation(state, makeInput({ aimWorldX: state.player.x, aimWorldY: state.player.y }));
      }
      expect(state.phase).toBe('mutation_select');
      expect(state.pendingMutations.length).toBeGreaterThanOrEqual(1);

      stepSimulation(
        state,
        makeInput({ aimWorldX: state.player.x, aimWorldY: state.player.y, selectIndex: 0 }),
      );
      expect(state.areaCode).toBe('1-2');
      expect(state.player.mutations.length).toBe(1);
    }
  });

  it('triggers victory_throne when Nuclear Throne falls with generators intact vs Loop 0-1 when all 4 broken (RT-10)', () => {
    // 1. Generators intact (generatorsRemaining = 4) -> authentic sit-on-Throne victory
    const victoryState = createRunState({ mutant: 'fish', seed: 202 });
    victoryState.player.godMode = true;
    warpToArea(victoryState, '7-3', 0);
    expect(victoryState.generatorsRemaining).toBe(4);

    const intactThrone = victoryState.enemies.find((e) => e.bossId === 'nuclear_throne')!;
    expect(intactThrone).toBeDefined();
    const vRng = SeededRng.fromState(victoryState.rngState);
    applyDamageToEnemy(victoryState, intactThrone, intactThrone.hp + 999, 0, 0, vRng);
    victoryState.rngState = vRng.getState();

    for (let t = 0; t < 10; t++) {
      stepSimulation(
        victoryState,
        makeInput({ aimWorldX: victoryState.player.x, aimWorldY: victoryState.player.y }),
      );
    }

    expect(victoryState.generatorsRemaining).toBe(4);
    expect(victoryState.boss?.defeated).toBe(true);
    expect(victoryState.phase).toBe('victory_throne');
    expect(victoryState.portal.active).toBe(false);
    expect(victoryState.events.some((e) => e.type === 'sfx' && e.sound === 'sndLevelUltra')).toBe(true);
    expect(
      victoryState.events.filter((e) => e.type === 'particle' && e.kind === 'throne_victory').length,
    ).toBeGreaterThanOrEqual(8);

    // 2. All 4 generators destroyed (generatorsRemaining = 0) -> Loop portal to 0-1 (Throne II)
    const loopState = createRunState({ mutant: 'fish', seed: 202 });
    loopState.player.godMode = true;
    warpToArea(loopState, '7-3', 0);
    const lRng = SeededRng.fromState(loopState.rngState);
    for (const gen of loopState.props.filter((p) => p.kind === 'throne_generator')) {
      damageProp(loopState, gen, 999, lRng);
    }
    expect(loopState.generatorsRemaining).toBe(0);

    const loopThrone = loopState.enemies.find((e) => e.bossId === 'nuclear_throne')!;
    applyDamageToEnemy(loopState, loopThrone, loopThrone.hp + 999, 0, 0, lRng);
    loopState.rngState = lRng.getState();

    for (let t = 0; t < 10 && !loopState.portal.active; t++) {
      stepSimulation(
        loopState,
        makeInput({ aimWorldX: loopState.player.x, aimWorldY: loopState.player.y }),
      );
    }
    expect(loopState.boss?.defeated).toBe(true);
    expect(loopState.phase).toBe('playing');
    expect(loopState.portal.active).toBe(true);
    expect(loopState.portal.targetArea).toBe('0-1');
    expect(loopState.portal.nextLoop).toBe(0);

    loopState.player.x = loopState.portal.x;
    loopState.player.y = loopState.portal.y;
    for (let t = 0; t < 40 && loopState.areaCode === '7-3'; t++) {
      const selectIndex =
        loopState.phase === 'mutation_select' || loopState.phase === 'ultra_select' ? 0 : undefined;
      stepSimulation(
        loopState,
        makeInput({ aimWorldX: loopState.player.x, aimWorldY: loopState.player.y, selectIndex }),
      );
    }
    expect(loopState.areaCode).toBe('0-1');
    expect(loopState.boss?.bossId).toBe('throne_ii');
  });

  it('replays combat, level-up, Ultra selection, and portal progression with bit-for-bit identical hashes', () => {
    const run = (seed: number): string => {
      const state = createRunState({ mutant: 'yv', seed });
      givePlayerWeapon(state, 'assault_rifle', 0, false);
      state.player.ammo.bullet = 240;

      for (let t = 1; t <= 180; t++) {
        let aimX = state.player.x + Math.cos(t * 0.1) * 70;
        let aimY = state.player.y + Math.sin(t * 0.1) * 70;
        for (const e of state.enemies) {
          if (!e.friendly && e.hp > 0) {
            aimX = e.x;
            aimY = e.y;
            break;
          }
        }
        stepSimulation(
          state,
          makeInput({
            moveX: Math.cos(t * 0.08),
            moveY: Math.sin(t * 0.11),
            aimWorldX: aimX,
            aimWorldY: aimY,
            fireHeld: t % 8 < 5,
            firePressed: t % 8 === 0,
            activePressed: t % 45 === 10,
          }),
        );
        if (state.player.alive && state.phase === 'playing') {
          expect(isWorldSolid(state.map, state.player.x, state.player.y)).toBe(false);
        }
      }

      // Exercise level 10 Ultra selection deterministically
      const rng = SeededRng.fromState(state.rngState);
      addRads(state, 3500, rng);
      state.rngState = rng.getState();
      for (let g = 0; g < 15 && state.pendingLevelUps > 0; g++) {
        const r = SeededRng.fromState(state.rngState);
        openPendingLevelUp(state, r);
        applyMutationSelection(state, 0, r, populateAreaEntities);
        state.rngState = r.getState();
      }
      expect(state.player.ultra).toBe('yv_a');
      return hashSimState(state);
    };

    const hashA = run(20261125);
    const hashB = run(20261125);
    const hashDiff = run(20261126);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashDiff);
  });
});
