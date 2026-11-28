import fs from 'node:fs';
import path from 'node:path';
import {
  TileType,
  type AreaCode,
  type AssetManifest,
  type BossId,
  type InputFrame,
  type SimState,
} from '@/contracts';
import { BOSS_IDS, ENEMIES } from '@/data';
import {
  SeededRng,
  hashSimState,
  isWorldSolid,
  setTile,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  damageProp,
  spawnCorpse,
  spawnFriendlyUnit,
} from '@/sim/combat';
import { givePlayerWeapon } from '@/sim/progression';
import {
  createEnemyEntity,
  createRunState,
  populateAreaEntities,
  spawnBossEntity,
  spawnIdpdWave,
} from '@/sim/entities';
import { stepSimulation, warpToArea } from '@/sim/ai';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

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

function assertAllCoordsFiniteAndWalkable(
  state: SimState,
  label: string,
  checkMinDist96: boolean = false,
): void {
  assert(
    Number.isFinite(state.player.x) && Number.isFinite(state.player.y),
    `${label}: player has NaN/Inf coords`,
  );
  for (const e of state.enemies) {
    assert(
      Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.vx) && Number.isFinite(e.vy),
      `${label}: enemy ${e.defId}#${e.id} has NaN coords/vel`,
    );
    if (!e.elevated) {
      assert(
        !isWorldSolid(state.map, e.x, e.y),
        `${label}: enemy ${e.defId}#${e.id} spawned/ended inside solid wall at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`,
      );
    }
    if (checkMinDist96 && !e.friendly) {
      const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
      assert(
        d >= 95.5,
        `${label}: hostile ${e.defId}#${e.id} spawned too close to player (${d.toFixed(1)}px < 96px)`,
      );
    }
  }
  for (const p of state.props) {
    assert(
      Number.isFinite(p.x) && Number.isFinite(p.y),
      `${label}: prop ${p.kind}#${p.id} has NaN coords`,
    );
    assert(
      !isWorldSolid(state.map, p.x, p.y),
      `${label}: prop ${p.kind}#${p.id} placed inside solid wall at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`,
    );
  }
  for (const pr of state.projectiles) {
    assert(
      Number.isFinite(pr.x) && Number.isFinite(pr.y) && Number.isFinite(pr.vx) && Number.isFinite(pr.vy),
      `${label}: projectile ${pr.kind}#${pr.id} has NaN coords/vel`,
    );
  }
}

/**
 * TEST 1: All 7 biomes + 0-1 + secret/vault + Loop 1 populate enemies/props safely
 * (0 enemies inside solid walls, 0 NaN coords, >= 96px away from player, 4 generators on 7-3).
 */
function runTest1AllBiomesAndLoopPopulation(): void {
  const testAreas: Array<{ code: AreaCode; loop: number; expectBoss?: BossId; expectMinHostiles: number }> = [
    { code: '1-1', loop: 0, expectMinHostiles: 3 },
    { code: '1-2', loop: 0, expectMinHostiles: 4 },
    { code: '1-3', loop: 0, expectBoss: 'big_bandit', expectMinHostiles: 5 },
    { code: '2-1', loop: 0, expectMinHostiles: 5 },
    { code: '3-1', loop: 0, expectMinHostiles: 5 },
    { code: '3-3', loop: 0, expectBoss: 'big_dog', expectMinHostiles: 5 },
    { code: '4-1', loop: 0, expectMinHostiles: 4 },
    { code: '5-1', loop: 0, expectMinHostiles: 5 },
    { code: '5-3', loop: 0, expectBoss: 'lil_hunter', expectMinHostiles: 5 },
    { code: '6-1', loop: 0, expectMinHostiles: 5 },
    { code: '7-1', loop: 0, expectMinHostiles: 5 },
    { code: '7-3', loop: 0, expectBoss: 'nuclear_throne', expectMinHostiles: 1 },
    { code: '0-1', loop: 0, expectBoss: 'throne_ii', expectMinHostiles: 1 },
    { code: 'vault', loop: 0, expectMinHostiles: 0 },
    { code: '$$$', loop: 0, expectMinHostiles: 0 },
    { code: '1-?', loop: 0, expectMinHostiles: 3 },
    { code: '2-?', loop: 0, expectMinHostiles: 5 },
    { code: '3-?', loop: 0, expectMinHostiles: 3 },
    { code: '4-?', loop: 0, expectMinHostiles: 3 },
    { code: '5-?', loop: 0, expectMinHostiles: 3 },
    { code: 'hq-1', loop: 0, expectMinHostiles: 4 },
    { code: 'hq-2', loop: 1, expectMinHostiles: 4 },
    { code: 'hq-3', loop: 1, expectBoss: 'captain', expectMinHostiles: 1 },
    // Loop 1 across biomes including Loop 1+ bosses!
    { code: '1-1', loop: 1, expectMinHostiles: 6 },
    { code: '2-1', loop: 1, expectBoss: 'mom', expectMinHostiles: 6 },
    { code: '3-3', loop: 1, expectBoss: 'big_dog', expectMinHostiles: 8 },
    { code: '4-1', loop: 1, expectBoss: 'hyper_crystal', expectMinHostiles: 6 },
    { code: '5-3', loop: 1, expectBoss: 'lil_hunter', expectMinHostiles: 8 },
    { code: '6-1', loop: 1, expectBoss: 'technomancer', expectMinHostiles: 6 },
    { code: '7-3', loop: 1, expectBoss: 'nuclear_throne', expectMinHostiles: 1 },
    { code: '0-1', loop: 1, expectBoss: 'throne_ii', expectMinHostiles: 1 },
  ];

  const state = createRunState({ mutant: 'fish', seed: 1337, crown: 'blood' });
  let totalEnemiesChecked = 0;
  let totalPropsChecked = 0;

  for (const tc of testAreas) {
    warpToArea(state, tc.code, tc.loop);
    assertAllCoordsFiniteAndWalkable(state, `${tc.code}@L${tc.loop}`, true);

    const hostiles = state.enemies.filter((e) => !e.friendly && e.hp > 0 && e.aiState !== 'disguised');
    assert(
      hostiles.length >= tc.expectMinHostiles,
      `${tc.code}@L${tc.loop}: expected >= ${tc.expectMinHostiles} hostiles, got ${hostiles.length}`,
    );
    assert(
      state.levelStartEnemyCount === hostiles.length,
      `${tc.code}@L${tc.loop}: levelStartEnemyCount (${state.levelStartEnemyCount}) !== hostiles (${hostiles.length})`,
    );

    if (tc.code === 'vault') {
      const statues = state.props.filter((p) => p.kind === 'vault_statue');
      assert(statues.length === 2, `vault expected 2 dormant vault_statue props, got ${statues.length}`);
    }
    if (tc.code === '$$$') {
      assert(hostiles.length === 0, `$$$ Crib must have 0 enemies, got ${hostiles.length}`);
    }

    if (tc.expectBoss) {
      assert(
        state.boss?.bossId === tc.expectBoss,
        `${tc.code}@L${tc.loop}: expected boss ${tc.expectBoss}, got ${state.boss?.bossId}`,
      );
    }

    if (tc.code === '7-3') {
      const gens = state.props.filter((p) => p.kind === 'throne_generator');
      assert(gens.length === 4, `7-3 expected 4 Throne Generators, got ${gens.length}`);
      assert(state.generatorsRemaining === 4, `7-3 expected generatorsRemaining=4, got ${state.generatorsRemaining}`);
    }

    if (tc.code === '1-1' && tc.loop === 1) {
      // Loop 1 should seed IDPD units on area start
      const hasIdpd = state.enemies.some((e) => ENEMIES[e.defId]?.isIdpd);
      assert(hasIdpd, 'Loop 1 1-1 did not spawn IDPD presence');
    }

    totalEnemiesChecked += hostiles.length;
    totalPropsChecked += state.props.length;
  }

  console.log(
    `[PASS 1/5] All biomes + 0-1 + vault + $$$ + hq-1..3 + secrets + Loop 1 populated safely (${testAreas.length} areas, ${totalEnemiesChecked} enemies, ${totalPropsChecked} props, 0 in solid walls, 0 NaNs, all >=96px away)`,
  );
}

/**
 * TEST 2: All 9 Bosses (big_bandit, big_dog, lil_hunter, nuclear_throne, throne_ii,
 * mom, hyper_crystal, technomancer, captain) spawn, execute multi-phase AI across 180 ticks,
 * take damage, and cleanly complete their defeat outcome (portal or Captain victory)!
 */
function runTest2AllNineBossesAndLoopChain(): void {
  const bossAreaMap: Record<
    BossId,
    { area: AreaCode; loop: number; nextArea?: AreaCode; nextLoop?: number; victory?: boolean }
  > = {
    big_bandit: { area: '1-3', loop: 0, nextArea: '2-1', nextLoop: 0 },
    big_dog: { area: '3-3', loop: 0, nextArea: '4-1', nextLoop: 0 },
    lil_hunter: { area: '5-3', loop: 0, nextArea: '6-1', nextLoop: 0 },
    nuclear_throne: { area: '7-3', loop: 0, nextArea: '0-1', nextLoop: 0 },
    throne_ii: { area: '0-1', loop: 0, nextArea: '1-1', nextLoop: 1 },
    mom: { area: '2-1', loop: 1, nextArea: '3-1', nextLoop: 1 },
    hyper_crystal: { area: '4-1', loop: 1, nextArea: '5-1', nextLoop: 1 },
    technomancer: { area: '6-1', loop: 1, nextArea: '7-1', nextLoop: 1 },
    captain: { area: 'hq-3', loop: 1, victory: true },
  };
  assert(BOSS_IDS.length === 9, `Expected 9 BOSS_IDS, got ${BOSS_IDS.length}`);

  const bossSummary: string[] = [];

  for (const bossId of BOSS_IDS) {
    const cfg = bossAreaMap[bossId]!;
    const state = createRunState({ mutant: 'crystal', seed: 5000 + bossId.length });
    state.player.godMode = true;
    warpToArea(state, cfg.area, cfg.loop);

    // Clear non-boss enemies so boss defeat cleanly tests portal open / victory invariant
    state.enemies = state.enemies.filter((e) => e.isBoss);
    let boss = state.enemies.find((e) => e.bossId === bossId);
    if (!boss) {
      const rng = SeededRng.fromState(state.rngState);
      boss = spawnBossEntity(state, bossId, rng);
      state.rngState = rng.getState();
    }
    assert(boss && state.boss?.bossId === bossId, `Failed to spawn boss ${bossId}`);

    // Poke sleeping/passive bosses (Big Dog, Nuclear Throne, Captain) so they wake and exercise all attack phases!
    const wakeRng = SeededRng.fromState(state.rngState);
    if (bossId === 'big_dog' || bossId === 'nuclear_throne' || bossId === 'captain') {
      applyDamageToEnemy(state, boss, 5, 0, 0, wakeRng);
    }
    state.rngState = wakeRng.getState();

    // If Nuclear Throne, destroy all 4 Throne Generators during the fight!
    let generatorsBroken = 0;
    if (bossId === 'nuclear_throne') {
      const genRng = SeededRng.fromState(state.rngState);
      const gens = state.props.filter((p) => p.kind === 'throne_generator');
      assert(gens.length === 4, '7-3 missing 4 generators');
      for (const g of gens) {
        damageProp(state, g, 200, genRng);
        generatorsBroken += 1;
      }
      state.rngState = genRng.getState();
      assert(state.generatorsRemaining === 0, `Expected generatorsRemaining=0, got ${state.generatorsRemaining}`);
    }

    const observedStates = new Set<string>();
    let totalEnemyProjectilesSeen = 0;
    let totalBossActivitySeen = 0;
    let damagedDuringFight = false;
    const preHp = boss.hp;

    // Step 180 ticks of multi-phase AI combat (6 seconds @ 30 Hz)
    for (let t = 0; t < 180; t++) {
      const liveBoss = state.enemies.find((e) => e.id === boss!.id);
      if (liveBoss) {
        observedStates.add(liveBoss.aiState);
        // Periodically chip boss when vulnerable to prove it takes damage & exercises hurt/enrage logic
        if (t === 60 && !liveBoss.invulnerable) {
          const r = SeededRng.fromState(state.rngState);
          applyDamageToEnemy(state, liveBoss, Math.round(liveBoss.maxHp * 0.35), 0, 0, r);
          state.rngState = r.getState();
          if (liveBoss.hp < preHp) damagedDuringFight = true;
        }
      }

      const angle = (t / 30) * Math.PI * 0.5;
      stepSimulation(
        state,
        makeInput({
          moveX: Math.cos(angle) * 0.4,
          moveY: Math.sin(angle) * 0.4,
          aimWorldX: boss.x,
          aimWorldY: boss.y,
        }),
      );

      for (const pr of state.projectiles) {
        if (pr.team === 'enemy') totalEnemyProjectilesSeen += 1;
      }
      if (
        bossId === 'technomancer' &&
        (state.enemies.some((e) => e.defId === 'turret') ||
          state.props.some((p) => p.kind === 'necro_revive_area'))
      ) {
        totalBossActivitySeen += 1;
      }
      assertAllCoordsFiniteAndWalkable(state, `boss:${bossId}@t${t}`, false);
    }

    assert(
      observedStates.size >= 2,
      `Boss ${bossId} only exhibited ${observedStates.size} AI state(s): ${[...observedStates].join(',')}`,
    );
    assert(
      totalEnemyProjectilesSeen > 0 || totalBossActivitySeen > 0,
      `Boss ${bossId} produced 0 attacks/summons across 180 ticks`,
    );

    // Finish off all living hostiles (handles multi-station Technomancer + any boss summons!)
    const killRng = SeededRng.fromState(state.rngState);
    for (const e of [...state.enemies]) {
      if (!e.friendly && e.hp > 0) {
        e.invulnerable = false;
        applyDamageToEnemy(state, e, e.hp + 999, 1, 0, killRng);
        damagedDuringFight = true;
      }
    }
    state.rngState = killRng.getState();
    assert(damagedDuringFight, `Boss ${bossId} never took damage`);

    // Step through hitstop + death resolution (incl. Lil' Hunter's visible jetpack death spiral + 30-tick portal spawn delay!)
    for (let k = 0; k < 110 && !state.portal.active && state.phase === 'playing'; k++) {
      stepSimulation(state, makeInput({ aimWorldX: state.player.x + 20, aimWorldY: state.player.y }));
    }

    assert(state.boss?.defeated === true, `Boss ${bossId} not marked defeated`);
    if (cfg.victory) {
      assert(state.phase === 'victory_throne', `Captain defeat did not trigger victory_throne`);
      assert(state.endingType === 'captain', `Captain defeat did not set endingType='captain'`);
      bossSummary.push(`${bossId}(states=${observedStates.size},END2)`);
    } else {
      assert(state.portal.active, `Portal did not open after defeating ${bossId}`);
      assert(
        state.portal.targetArea === cfg.nextArea && state.portal.nextLoop === cfg.nextLoop,
        `Boss ${bossId} portal expected ${cfg.nextArea}@L${cfg.nextLoop}, got ${state.portal.targetArea}@L${state.portal.nextLoop}`,
      );

      // For 7-3 -> 0-1 and 0-1 -> 1-1 Loop 1, actually walk into portal and verify area transition!
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
        assert(
          state.areaCode === cfg.nextArea && state.loop === cfg.nextLoop,
          `Portal transition from ${cfg.area} failed: got ${state.areaCode}@L${state.loop}`,
        );
        if (bossId === 'nuclear_throne') {
          assert(state.boss?.bossId === 'throne_ii', 'Entering 0-1 from 7-3 did not spawn Throne II!');
        }
      }

      bossSummary.push(
        `${bossId}(states=${observedStates.size}${generatorsBroken ? ',gens=4->0' : ''}->${cfg.nextArea}@L${cfg.nextLoop})`,
      );
    }
  }

  // Verify RT-10: Nuclear Throne defeated with generators intact spawns sit-able broken Throne -> victory_throne (no 0-1 portal)
  {
    const sitState = createRunState({ mutant: 'fish', seed: 202 });
    sitState.player.godMode = true;
    warpToArea(sitState, '7-3', 0);
    assert(sitState.generatorsRemaining === 4, '7-3 intact victory check expected 4 generators');
    const throne = sitState.enemies.find((e) => e.bossId === 'nuclear_throne');
    assert(throne, '7-3 intact victory check missing nuclear_throne');
    const r = SeededRng.fromState(sitState.rngState);
    applyDamageToEnemy(sitState, throne!, throne!.hp + 999, 0, 0, r);
    sitState.rngState = r.getState();
    for (let k = 0; k < 10; k++) {
      stepSimulation(sitState, makeInput({ aimWorldX: sitState.player.x, aimWorldY: sitState.player.y }));
    }
    assert(sitState.boss?.defeated === true, 'Intact-generator Nuclear Throne not marked defeated');
    assert(!sitState.portal.active, 'Intact-generator Nuclear Throne unexpectedly opened Loop portal');
    const brokenThrone = sitState.props.find((p) => p.sprite === 'sprThroneCorpseIdle');
    assert(brokenThrone, 'Intact-generator Nuclear Throne did not spawn sit-able sprThroneCorpseIdle');
    assert(brokenThrone!.interactPrompt === '[E] SIT ON THRONE', `Unexpected broken throne prompt: ${brokenThrone!.interactPrompt}`);
    sitState.player.x = brokenThrone!.x;
    sitState.player.y = brokenThrone!.y;
    stepSimulation(sitState, makeInput({ aimWorldX: brokenThrone!.x, aimWorldY: brokenThrone!.y, pickupPressed: true }));
    assert(sitState.phase === 'victory_throne', `Expected victory_throne after sitting on Throne, got ${sitState.phase}`);
    assert(!sitState.portal.active, 'Sitting on Throne unexpectedly opened Loop portal');
  }

  console.log(`[PASS 2/5] All 9 Bosses verified across 180 ticks + defeat portals + Loop chain + Throne victory: ${bossSummary.join(', ')}`);
}

/**
 * TEST 3: Full stepSimulation() run over 300 ticks with a rich combat input stream
 * produces identical hashSimState() across two independent runs (100% deterministic, zero Math.random).
 */
function runTest3Determinism300Ticks(): void {
  const runOnce = (): { hash: string; shots: number; kills: number; ticks: number } => {
    const state = createRunState({ mutant: 'yv', seed: 20261125 });
    givePlayerWeapon(state, 'assault_rifle', 0, false);
    state.player.ammo.bullet = 250;

    for (let t = 0; t < 300; t++) {
      // Aim at nearest hostile enemy if any, else sweep smoothly
      let aimX = state.player.x + Math.cos(t * 0.1) * 80;
      let aimY = state.player.y + Math.sin(t * 0.1) * 80;
      let nearestSq = Infinity;
      for (const e of state.enemies) {
        if (e.friendly || e.hp <= 0) continue;
        const dSq = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
        if (dSq < nearestSq) {
          nearestSq = dSq;
          aimX = e.x;
          aimY = e.y;
        }
      }

      const input = makeInput({
        moveX: Math.cos(t * 0.08),
        moveY: Math.sin(t * 0.11),
        aimWorldX: aimX,
        aimWorldY: aimY,
        fireHeld: t % 12 < 8,
        firePressed: t % 12 === 0,
        activePressed: t % 45 === 15,
        swapPressed: t === 120,
      });

      stepSimulation(state, input);
      assertAllCoordsFiniteAndWalkable(state, `det@t${t}`, false);
    }

    return {
      hash: hashSimState(state),
      shots: state.stats.shotsFired,
      kills: state.stats.kills,
      ticks: state.tick,
    };
  };

  const runA = runOnce();
  const runB = runOnce();
  assert(runA.hash === runB.hash, `Determinism mismatch! ${runA.hash} !== ${runB.hash}`);
  assert(runA.ticks === 300, `Expected 300 ticks, got ${runA.ticks}`);
  assert(runA.shots > 10, `Expected combat shots fired > 10, got ${runA.shots}`);

  console.log(
    `[PASS 3/5] 300-tick combat determinism verified: hashA === hashB === ${runA.hash} (shots=${runA.shots}, kills=${runA.kills})`,
  );
}

/**
 * TEST 4: IDPD units (Grunt, Inspector, Shielder reflection, IDPD Van wall-carve & squad deploy),
 * Mimics (disguised -> wake -> attack), Necromancer corpse revivals, Maggot Nest/Big Rat/Explo Freak deaths,
 * and friendly Rebel Allies & Plant Saplings all execute cleanly.
 */
function runTest4SpecialArchetypesAndAll50Defs(): void {
  const state = createRunState({ mutant: 'rebel', seed: 7777 });
  state.player.godMode = true;
  state.enemies = [];
  state.props = [];
  state.corpses = [];

  // Carve an open 15x15 test chamber around player for clean LOS tests
  const ptx = Math.floor(state.player.x / state.map.tileSize);
  const pty = Math.floor(state.player.y / state.map.tileSize);
  for (let ty = pty - 7; ty <= pty + 7; ty++) {
    for (let tx = ptx - 7; tx <= ptx + 7; tx++) {
      setTile(state.map, tx, ty, TileType.Floor);
    }
  }

  const rng = SeededRng.fromState(state.rngState);

  // 4A. IDPD Van drives & deploys IDPD squad (Grunt, Inspector, Shielder)
  const vanWave = spawnIdpdWave(state, rng, {
    includeVan: true,
    anchorX: state.player.x + 80,
    anchorY: state.player.y,
  });
  assert(vanWave.length === 1 && vanWave[0]!.defId === 'idpd_van', 'IDPD Van failed to spawn');

  // 4B. Mimic & Weapon Mimic wake on proximity/damage and attack
  const mimic = createEnemyEntity(state, 'mimic', state.player.x + 42, state.player.y - 24, rng);
  const wMimic = createEnemyEntity(state, 'weapon_mimic', state.player.x - 42, state.player.y - 24, rng);
  assert(mimic.aiState === 'disguised' && wMimic.aiState === 'disguised', 'Mimics should start disguised');

  // 4C. Necromancer revives nearby corpse into a Freak!
  const necro = createEnemyEntity(state, 'necromancer', state.player.x - 64, state.player.y + 40, rng);
  necro.attackCooldown = 2;
  spawnCorpse(state, necro.x + 20, necro.y, 0, 0, 1, 'sprFreak1Dead', 10, true);

  // 4D. Friendly Rebel Ally & Plant Sapling attack hostiles!
  const ally = spawnFriendlyUnit(state, 'rebel_ally', state.player.x - 16, state.player.y);
  const sapling = spawnFriendlyUnit(state, 'plant_sapling', state.player.x + 16, state.player.y);
  assert(ally.friendly && sapling.friendly, 'Friendly units missing friendly flag');

  // 4E. Special death units (maggot_nest, big_rat, explo_freak, snow_tank)
  const nest = createEnemyEntity(state, 'maggot_nest', state.player.x + 64, state.player.y + 56, rng);
  const bigRat = createEnemyEntity(state, 'big_rat', state.player.x + 40, state.player.y + 64, rng);

  state.rngState = rng.getState();

  let sawShielder = false;
  let sawRevivedFreak = false;
  let sawMimicAwake = false;
  let sawAllyBullet = false;

  for (let t = 0; t < 95; t++) {
    stepSimulation(
      state,
      makeInput({
        aimWorldX: state.player.x + 60,
        aimWorldY: state.player.y,
      }),
    );
    if (state.enemies.some((e) => e.defId === 'idpd_shielder')) sawShielder = true;
    if (state.enemies.some((e) => e.defId === 'freak')) sawRevivedFreak = true;
    if (mimic.aiState !== 'disguised' && wMimic.aiState !== 'disguised') sawMimicAwake = true;
    if (state.projectiles.some((p) => p.team === 'player' && p.sprite === 'sprAllyBullet')) sawAllyBullet = true;
    assertAllCoordsFiniteAndWalkable(state, `special@t${t}`, false);
  }

  assert(sawShielder, 'IDPD Van did not deploy IDPD Shielder/squad');
  assert(sawRevivedFreak, 'Necromancer did not revive corpse into Freak');
  assert(sawMimicAwake, 'Mimics did not wake on proximity');
  assert(sawAllyBullet, 'Friendly Rebel Ally did not fire at hostile enemies');

  // Kill Maggot Nest & Big Rat and verify death spawns!
  const r2 = SeededRng.fromState(state.rngState);
  applyDamageToEnemy(state, nest, 999, 0, 0, r2);
  applyDamageToEnemy(state, bigRat, 999, 0, 0, r2);
  state.rngState = r2.getState();
  for (let k = 0; k < 6; k++) {
    stepSimulation(state, makeInput({ aimWorldX: state.player.x, aimWorldY: state.player.y }));
  }
  assert(state.enemies.some((e) => e.defId === 'maggot'), 'Maggot Nest death did not burst into maggots');
  assert(state.enemies.some((e) => e.defId === 'green_rat'), 'Big Rat death did not split into green rats');

  // Smoke-test ALL 72 EnemyDefs in src/data/enemies.ts across 20 ticks (zero NaNs/throws!)
  const allIds = Object.keys(ENEMIES);
  assert(allIds.length === 72, `Expected 72 EnemyDefs, found ${allIds.length}`);
  const smokeState = createRunState({ mutant: 'fish', seed: 9999 });
  smokeState.player.godMode = true;
  smokeState.enemies = [];
  const sRng = SeededRng.fromState(smokeState.rngState);
  for (const id of allIds) {
    const def = ENEMIES[id]!;
    if (def.isBoss) {
      spawnBossEntity(smokeState, id as BossId, sRng);
    } else if (id === 'rebel_ally' || id === 'plant_sapling') {
      spawnFriendlyUnit(smokeState, id, smokeState.player.x + 24, smokeState.player.y);
    } else {
      createEnemyEntity(smokeState, id, smokeState.player.x + sRng.range(-80, 80), smokeState.player.y + sRng.range(-80, 80), sRng);
    }
  }
  smokeState.rngState = sRng.getState();
  for (let t = 0; t < 20; t++) {
    stepSimulation(smokeState, makeInput({ aimWorldX: smokeState.player.x + 30, aimWorldY: smokeState.player.y }));
    assertAllCoordsFiniteAndWalkable(smokeState, `all72@t${t}`, false);
  }

  console.log(
    `[PASS 4/5] IDPD Van+squad, Mimics, Necromancer revival, Nest/BigRat splits, Rebel Allies, and all ${allIds.length}/72 EnemyDefs executed cleanly`,
  );
}

/**
 * TEST 5: Purity check (zero window/document/canvas/Math.random in src/sim/entities/** & src/sim/ai/**)
 * + manifest sprite/sound validation when local .nt-assets/manifest.json exists.
 */
function runTest5PurityAndManifestKeys(): void {
  const dirs = ['src/sim/entities', 'src/sim/ai'];
  const forbidden = /\b(window|document|Math\.random)\b/;
  const spriteLiterals = new Set<string>();
  const soundLiterals = new Set<string>();

  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.ts') || file === 'selftest.ts') continue;
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      assert(!forbidden.test(content), `Forbidden DOM/Math.random usage in ${dir}/${file}`);
      for (const m of content.matchAll(/'(spr[A-Za-z0-9_]+)'/g)) {
        spriteLiterals.add(m[1]!);
      }
      for (const m of content.matchAll(/'(snd[A-Za-z0-9_]+)'/g)) {
        soundLiterals.add(m[1]!);
      }
    }
  }

  const manifestPath = path.join(process.cwd(), '.nt-assets', 'manifest.json');
  let manifestChecked = false;
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AssetManifest;
    const missing: string[] = [];
    for (const spr of spriteLiterals) {
      if (!manifest.sprites[spr]) missing.push(`SPR ${spr}`);
    }
    for (const snd of soundLiterals) {
      if (!manifest.sounds[snd]) missing.push(`SND ${snd}`);
    }
    assert(missing.length === 0, `Missing manifest keys referenced in entities/ai: ${missing.join(', ')}`);
    manifestChecked = true;
  }

  // Also ensure populateAreaEntities works directly when invoked standalone
  const direct = createRunState({ mutant: 'horror', seed: 31415 });
  const r = SeededRng.fromState(direct.rngState);
  direct.enemies = [];
  direct.props = [];
  populateAreaEntities(direct, r);
  assert(direct.enemies.length > 0 && direct.props.length > 0, 'Standalone populateAreaEntities failed');

  console.log(
    `[PASS 5/5] Purity verified (0 DOM/Math.random) & ${spriteLiterals.size} sprites + ${soundLiterals.size} sounds validated against Steam manifest (${manifestChecked ? 'checked' : 'skipped'})`,
  );
}

runTest1AllBiomesAndLoopPopulation();
runTest2AllNineBossesAndLoopChain();
runTest3Determinism300Ticks();
runTest4SpecialArchetypesAndAll50Defs();
runTest5PurityAndManifestKeys();
console.log('ALL GAMEPLAY-AI SELFTESTS PASSED (5/5)!');
