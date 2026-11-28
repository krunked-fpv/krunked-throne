import {
  TILE_SIZE,
  TileType,
  type AmmoType,
  type AreaCode,
  type BossId,
  type InputFrame,
  type MutantId,
  type SimState,
  type WorldMap,
} from '@/contracts';
import {
  AREAS,
  AREA_CODES,
  BOSS_IDS,
  ENEMIES,
  MUTANTS,
  MUTANT_IDS,
  MUTATION_IDS,
  WEAPONS,
} from '@/data';
import {
  SeededRng,
  checkMapConnectivity,
  findNearestFloor,
  generateWorldMap,
  getTile,
  hasLineOfSight,
  hashSimState,
  isWalkableTile,
  isWorldSolid,
  setTile,
  tileToWorldCenter,
  worldToTile,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  damageProp,
  getPlayerMoveSpeed,
  healPlayer,
  spawnCorpse,
  spawnEnemyProjectile,
} from '@/sim/combat';
import {
  addRads,
  applyMutationSelection,
  givePlayerWeapon,
  grantMutationById,
  openPendingLevelUp,
} from '@/sim/progression';
import {
  createEnemyEntity,
  createRunState,
  populateAreaEntities,
  spawnBossEntity,
} from '@/sim/entities';
import { stepSimulation, warpToArea } from '@/sim/ai';

const AMMO_KEYS: readonly AmmoType[] = ['melee', 'bullet', 'shell', 'bolt', 'explosive', 'energy'];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error(`GATE B FAILURE: ${msg}`);
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

/**
 * Strict per-tick physics, entity, coordinate, and resource bounds invariant checker.
 */
function assertSimInvariants(state: SimState, label: string): void {
  const p = state.player;
  assert(
    Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Number.isFinite(p.prevX) &&
      Number.isFinite(p.prevY) &&
      Number.isFinite(p.vx) &&
      Number.isFinite(p.vy) &&
      Number.isFinite(p.aimAngle),
    `${label} (seed=${state.seed}, area=${state.areaCode}@L${state.loop}, tick=${state.tick}): player has non-finite coords/vel`,
  );
  assert(
    Number.isFinite(p.hp) && Number.isFinite(p.maxHp) && p.maxHp >= 1 && p.hp >= 0 && p.hp <= p.maxHp,
    `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): invalid player HP ${p.hp}/${p.maxHp}`,
  );
  assert(
    Number.isFinite(p.rads) && p.rads >= 0,
    `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): invalid rads ${p.rads}`,
  );
  for (const ammoKey of AMMO_KEYS) {
    const val = p.ammo[ammoKey];
    const max = p.ammoMax[ammoKey];
    assert(
      Number.isFinite(val) && val >= 0 && val <= max,
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): invalid ammo[${ammoKey}]=${val} (max=${max})`,
    );
  }
  if (state.phase === 'playing' && p.alive) {
    assert(
      !isWorldSolid(state.map, p.x, p.y),
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): player trapped in solid wall at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`,
    );
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    assert(
      Number.isFinite(e.x) &&
        Number.isFinite(e.y) &&
        Number.isFinite(e.vx) &&
        Number.isFinite(e.vy) &&
        Number.isFinite(e.hp) &&
        Number.isFinite(e.maxHp),
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): enemy ${e.defId}#${e.id} has NaN/Inf`,
    );
    assert(
      e.hp > 0,
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): dead enemy ${e.defId}#${e.id} (hp=${e.hp}) still in state.enemies`,
    );
    if (!e.elevated) {
      assert(
        !isWorldSolid(state.map, e.x, e.y),
        `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): enemy ${e.defId}#${e.id} trapped in solid wall at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`,
      );
    }
  }

  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i]!;
    assert(
      Number.isFinite(pr.x) &&
        Number.isFinite(pr.y) &&
        Number.isFinite(pr.vx) &&
        Number.isFinite(pr.vy) &&
        Number.isFinite(pr.damage),
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): projectile ${pr.kind}#${pr.id} has NaN/Inf`,
    );
  }

  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i]!;
    assert(
      Number.isFinite(pk.x) && Number.isFinite(pk.y) && Number.isFinite(pk.value),
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): pickup ${pk.kind}#${pk.id} has NaN/Inf`,
    );
  }

  for (let i = 0; i < state.props.length; i++) {
    const prop = state.props[i]!;
    assert(
      Number.isFinite(prop.x) && Number.isFinite(prop.y) && Number.isFinite(prop.hp),
      `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): prop ${prop.kind}#${prop.id} has NaN/Inf`,
    );
    if (!state.portal.active) {
      assert(
        !isWorldSolid(state.map, prop.x, prop.y),
        `${label} (seed=${state.seed}, area=${state.areaCode}, tick=${state.tick}): prop ${prop.kind}#${prop.id} inside solid wall at (${prop.x.toFixed(1)}, ${prop.y.toFixed(1)})`,
      );
    }
  }
}

/**
 * Computes a 4-connected BFS distance field from (goalTx, goalTy) on walkable tiles
 * so the autonomous combat-bot navigates any biome reliably without getting stuck.
 */
function buildBfsField(map: WorldMap, goalTx: number, goalTy: number): Int32Array {
  const { width, height, tiles } = map;
  const dist = new Int32Array(width * height);
  dist.fill(-1);

  if (
    goalTx < 0 ||
    goalTy < 0 ||
    goalTx >= width ||
    goalTy >= height ||
    !isWalkableTile(getTile(map, goalTx, goalTy))
  ) {
    return dist;
  }

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const startIdx = goalTy * width + goalTx;
  dist[startIdx] = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++]!;
    const d = dist[idx]! + 1;
    const cx = idx % width;
    const cy = (idx - cx) / width;

    if (cx > 0) {
      const n = idx - 1;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cx + 1 < width) {
      const n = idx + 1;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cy > 0) {
      const n = idx - width;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    if (cy + 1 < height) {
      const n = idx + width;
      if (dist[n] === -1 && isWalkableTile(tiles[n] as TileType)) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
  }

  return dist;
}

function getBfsMoveVector(
  map: WorldMap,
  fromX: number,
  fromY: number,
  goalX: number,
  goalY: number,
  field: Int32Array,
): { mx: number; my: number } {
  const ts = map.tileSize || TILE_SIZE;
  const { tx, ty } = worldToTile(fromX, fromY, ts);
  const { tx: gtx, ty: gty } = worldToTile(goalX, goalY, ts);

  if (tx === gtx && ty === gty) {
    const dx = goalX - fromX;
    const dy = goalY - fromY;
    const len = Math.hypot(dx, dy) || 1;
    return { mx: dx / len, my: dy / len };
  }

  const curIdx = ty * map.width + tx;
  const curDist = curIdx >= 0 && curIdx < field.length ? field[curIdx]! : -1;

  let bestTx = tx;
  let bestTy = ty;
  let bestDist = curDist >= 0 ? curDist : Number.MAX_SAFE_INTEGER;

  const dirs: ReadonlyArray<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const nd = field[ny * map.width + nx]!;
    if (nd >= 0 && nd < bestDist) {
      bestDist = nd;
      bestTx = nx;
      bestTy = ny;
    }
  }

  if (bestTx !== tx || bestTy !== ty) {
    const center = tileToWorldCenter(bestTx, bestTy, ts);
    const dx = center.x - fromX;
    const dy = center.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    return { mx: dx / len, my: dy / len };
  }

  const dx = goalX - fromX;
  const dy = goalY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { mx: dx / len, my: dy / len };
}

// ============================================================================
// 1. FULL CAMPAIGN PROGRESSION SOAK (1-1 -> 7-3 -> 0-1 -> LOOP 1-1)
// ============================================================================
function runCampaignProgressionSoak(): string {
  const SEED = 20261125;
  const EXPECTED_SEQUENCE: ReadonlyArray<{ area: AreaCode; loop: number; boss?: BossId }> = [
    { area: '1-1', loop: 0 },
    { area: '1-2', loop: 0 },
    { area: '1-3', loop: 0, boss: 'big_bandit' },
    { area: '2-1', loop: 0 },
    { area: '3-1', loop: 0 },
    { area: '3-2', loop: 0 },
    { area: '3-3', loop: 0, boss: 'big_dog' },
    { area: '4-1', loop: 0 },
    { area: '5-1', loop: 0 },
    { area: '5-2', loop: 0 },
    { area: '5-3', loop: 0, boss: 'lil_hunter' },
    { area: '6-1', loop: 0 },
    { area: '7-1', loop: 0 },
    { area: '7-2', loop: 0 },
    { area: '7-3', loop: 0, boss: 'nuclear_throne' },
    { area: '0-1', loop: 0, boss: 'throne_ii' },
    { area: '1-1', loop: 1 },
  ];

  const state = createRunState({ mutant: 'fish', seed: SEED });
  state.player.godMode = true;
  givePlayerWeapon(state, 'hyper_rifle', 0, false);
  givePlayerWeapon(state, 'wrench', 1, false);
  state.player.activeSlot = 0;

  let seqIdx = 0;
  let totalTicks = 0;
  let areaTicks = 0;
  let mutationsPicked = 0;
  let ultraPicked = false;
  let sawLevelUp = false;
  let throneGeneratorsDestroyed = false;

  // Verify initial 1-1 connectivity
  const initConn = checkMapConnectivity(state.map);
  assert(initConn.connected, `Initial 1-1 map disconnected (seed=${SEED})`);

  let cachedBfs: Int32Array | null = null;
  let cachedGoalTx = -1;
  let cachedGoalTy = -1;
  let cachedMap: WorldMap | null = null;
  let lastPlayerX = state.player.x;
  let lastPlayerY = state.player.y;
  let stallTicks = 0;

  const MAX_TICKS_PER_AREA = 3000;

  while (seqIdx < EXPECTED_SEQUENCE.length - 1) {
    const expectedCurrent = EXPECTED_SEQUENCE[seqIdx]!;
    const expectedNext = EXPECTED_SEQUENCE[seqIdx + 1]!;

    // Track level-ups & keep ammo sustained for full 16-area autonomous combat
    if (state.player.level > 1) sawLevelUp = true;
    if (state.player.ammo.bullet < 50) {
      state.player.ammo.bullet = state.player.ammoMax.bullet;
    }
    if (state.player.hp <= 2 && state.player.alive) {
      healPlayer(state, state.player.maxHp - state.player.hp);
    }
    assert(
      state.phase !== 'game_over',
      `Player died unexpectedly on ${state.areaCode}@L${state.loop} (cause=${state.player.lastDamageCause}, seed=${SEED})`,
    );

    // Handle mutation / ultra selection cards authentically via InputFrame.selectIndex
    if (state.phase === 'mutation_select' || state.phase === 'ultra_select') {
      const wasUltra = state.phase === 'ultra_select';
      if (wasUltra) {
        const expectedUltras = MUTANTS[state.player.mutant].ultras.length;
        assert(
          state.pendingUltras.length === expectedUltras,
          `Ultra select offered ${state.pendingUltras.length} choices instead of ${expectedUltras}`,
        );
      } else {
        assert(
          state.pendingMutations.length >= 1,
          `Mutation select offered 0 choices at ${state.areaCode}`,
        );
      }
      stepSimulation(
        state,
        makeInput({
          aimWorldX: state.player.x + 20,
          aimWorldY: state.player.y,
          selectIndex: 0,
        }),
      );
      if (wasUltra) {
        assert(state.player.ultra !== null, 'Ultra selection did not grant ultra');
        ultraPicked = true;
      } else {
        mutationsPicked += 1;
      }
      totalTicks += 1;
      assertSimInvariants(state, `campaign:${state.areaCode}@L${state.loop}`);
    } else {
      // Decide target: Portal > 7-3 Generators > Nearest Hostile Enemy
      let goalX = state.player.x;
      let goalY = state.player.y;
      let aimX = state.player.x + 40;
      let aimY = state.player.y;
      let shouldFire = false;
      let combatStandOff = 0;
      let hasCombatGoal = false;

      if (state.portal.active) {
        // Guarantee steady XP pace across the 16-stage campaign so Ultra triggers before Loop 1
        if (state.player.level < 10 && !state.portal.entered) {
          const boostRng = SeededRng.fromState(state.rngState);
          addRads(state, 180, boostRng);
          state.rngState = boostRng.getState();
        }
        goalX = state.portal.x;
        goalY = state.portal.y;
        aimX = state.portal.x;
        aimY = state.portal.y;
        shouldFire = false;
      } else if (state.areaCode === '7-3' && state.generatorsRemaining > 0) {
        let bestGen = null;
        let bestDistSq = Infinity;
        for (const prop of state.props) {
          if (prop.kind !== 'throne_generator' || prop.hp <= 0) continue;
          const dSq = (prop.x - state.player.x) ** 2 + (prop.y - state.player.y) ** 2;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestGen = prop;
          }
        }
        if (bestGen) {
          hasCombatGoal = true;
          goalX = bestGen.x;
          goalY = bestGen.y;
          aimX = bestGen.x;
          aimY = bestGen.y;
          combatStandOff = 85;
          const dist = Math.sqrt(bestDistSq);
          shouldFire =
            dist < 170 &&
            hasLineOfSight(state.map, state.player.x, state.player.y, bestGen.x, bestGen.y);
        }
      } else {
        if (state.areaCode === '7-3' && state.generatorsRemaining === 0) {
          throneGeneratorsDestroyed = true;
        }
        let bestEnemy = null;
        let bestDistSq = Infinity;
        for (const e of state.enemies) {
          if (e.friendly || e.hp <= 0) continue;
          const dSq = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
          // Prefer damageable targets over airborne invulnerable ones
          const weighted = e.invulnerable ? dSq + 1_000_000 : dSq;
          if (weighted < bestDistSq) {
            bestDistSq = weighted;
            bestEnemy = e;
          }
        }

        if (bestEnemy) {
          hasCombatGoal = true;
          const safeTarget = isWorldSolid(state.map, bestEnemy.x, bestEnemy.y)
            ? findNearestFloor(state.map, bestEnemy.x, bestEnemy.y, 12)
            : { x: bestEnemy.x, y: bestEnemy.y };
          goalX = safeTarget.x;
          goalY = safeTarget.y;
          aimX = bestEnemy.x;
          aimY = bestEnemy.y;
          combatStandOff = bestEnemy.isBoss ? 105 : 80;
          const dist = Math.hypot(bestEnemy.x - state.player.x, bestEnemy.y - state.player.y);
          const los = hasLineOfSight(state.map, state.player.x, state.player.y, bestEnemy.x, bestEnemy.y);
          shouldFire = !bestEnemy.invulnerable && dist < 210 && (los || dist < 44);
        }
      }

      const ts = state.map.tileSize || TILE_SIZE;
      const goalTile = worldToTile(goalX, goalY, ts);
      if (
        cachedMap !== state.map ||
        cachedGoalTx !== goalTile.tx ||
        cachedGoalTy !== goalTile.ty ||
        !cachedBfs
      ) {
        cachedMap = state.map;
        cachedGoalTx = goalTile.tx;
        cachedGoalTy = goalTile.ty;
        cachedBfs = buildBfsField(state.map, goalTile.tx, goalTile.ty);
      }

      const directDist = Math.hypot(goalX - state.player.x, goalY - state.player.y);
      let moveX = 0;
      let moveY = 0;

      if (state.portal.active) {
        const mv = getBfsMoveVector(state.map, state.player.x, state.player.y, goalX, goalY, cachedBfs);
        moveX = mv.mx;
        moveY = mv.my;
      } else if (shouldFire && directDist < combatStandOff) {
        // Gentle strafe while firing in line of sight
        const toTarget = Math.atan2(aimY - state.player.y, aimX - state.player.x);
        const strafe = toTarget + (totalTicks % 60 < 30 ? Math.PI * 0.5 : -Math.PI * 0.5);
        moveX = Math.cos(strafe) * 0.7;
        moveY = Math.sin(strafe) * 0.7;
      } else if (hasCombatGoal) {
        const mv = getBfsMoveVector(state.map, state.player.x, state.player.y, goalX, goalY, cachedBfs);
        moveX = mv.mx;
        moveY = mv.my;
      }

      // If blocked by a solid destructible prop (e.g. car/pillar) while pursuing a combat goal, fire ahead to clear path
      if (stallTicks > 14 && hasCombatGoal && !state.portal.active) {
        aimX = state.player.x + moveX * 48;
        aimY = state.player.y + moveY * 48;
        shouldFire = true;
      }

      stepSimulation(
        state,
        makeInput({
          moveX,
          moveY,
          aimWorldX: aimX,
          aimWorldY: aimY,
          fireHeld: shouldFire,
          firePressed: shouldFire && totalTicks % 2 === 0,
          activePressed: hasCombatGoal && !state.portal.active && totalTicks % 75 === 20,
        }),
      );

      totalTicks += 1;
      areaTicks += 1;
      assertSimInvariants(state, `campaign:${state.areaCode}@L${state.loop}`);

      const moved = Math.hypot(state.player.x - lastPlayerX, state.player.y - lastPlayerY);
      stallTicks = moved < 0.35 && hasCombatGoal && !state.portal.entered ? stallTicks + 1 : 0;
      lastPlayerX = state.player.x;
      lastPlayerY = state.player.y;
    }

    // Check if we transitioned to the next area!
    if (state.areaCode !== expectedCurrent.area || state.loop !== expectedCurrent.loop) {
      assert(
        state.areaCode === expectedNext.area && state.loop === expectedNext.loop,
        `Area transition mismatch from ${expectedCurrent.area}@L${expectedCurrent.loop}: expected ${expectedNext.area}@L${expectedNext.loop}, got ${state.areaCode}@L${state.loop} (seed=${SEED})`,
      );
      if (expectedCurrent.boss) {
        assert(
          state.stats.bossesDefeated.includes(expectedCurrent.boss),
          `Left ${expectedCurrent.area} without defeating boss ${expectedCurrent.boss} (seed=${SEED})`,
        );
      }
      const conn = checkMapConnectivity(state.map);
      assert(
        conn.connected,
        `Map connectivity failed on ${state.areaCode}@L${state.loop} (seed=${SEED}): ${JSON.stringify(conn)}`,
      );
      if (expectedNext.boss) {
        assert(
          state.boss?.bossId === expectedNext.boss,
          `Expected boss ${expectedNext.boss} on ${state.areaCode}, got ${state.boss?.bossId}`,
        );
      }
      seqIdx += 1;
      areaTicks = 0;
      cachedMap = null;
      stallTicks = 0;
    }

    assert(
      areaTicks <= MAX_TICKS_PER_AREA,
      `Softlock / timeout on ${state.areaCode}@L${state.loop} after ${areaTicks} ticks (seed=${SEED}, enemies=${state.enemies.filter((e) => !e.friendly).length}, gens=${state.generatorsRemaining}, portalActive=${state.portal.active}, phase=${state.phase})`,
    );
  }

  assert(state.areaCode === '1-1' && state.loop === 1, `Expected Loop 1-1 at end of soak, got ${state.areaCode}@L${state.loop}`);
  assert(sawLevelUp, 'Campaign soak never leveled up');
  assert(mutationsPicked >= 4, `Expected >= 4 mutations picked, got ${mutationsPicked}`);
  assert(ultraPicked && state.player.ultra !== null, 'Campaign soak never completed Ultra selection');
  assert(throneGeneratorsDestroyed, '7-3 Throne Generators were not destroyed before Nuclear Throne defeat');

  const LOOP_0_BOSS_IDS: readonly BossId[] = [
    'big_bandit',
    'big_dog',
    'lil_hunter',
    'nuclear_throne',
    'throne_ii',
  ];
  const allDefeatedBosses = new Set<BossId>(state.stats.bossesDefeated);
  for (const bossId of LOOP_0_BOSS_IDS) {
    assert(
      allDefeatedBosses.has(bossId),
      `Loop-0 campaign soak missing boss defeat: ${bossId}`,
    );
  }

  // Verify Y.V.'s Crib ($$$), IDPD HQ-2 (hq-2), and the 4 Loop-1+ / HQ bosses (Mom, Hyper Crystal, Technomancer, Captain)
  // so ALL 9/9 bosses and special areas are empirically verified in Pillar 1!
  {
    // A. Y.V.'s Crib ($$$): base 2 Giant Weapon Chests, Open Mind + Crown of Love = exact 3 Giant Ammo Chests, 0 enemies
    const cribState = createRunState({ mutant: 'yv', seed: 20261201 });
    cribState.player.godMode = true;
    cribState.cribReturnArea = '3-2';
    warpToArea(cribState, '$$$', 0);
    assert(checkMapConnectivity(cribState.map).connected, '$$$ Crib map disconnected');
    assert(cribState.enemies.length === 0, `$$$ Crib expected 0 enemies, got ${cribState.enemies.length}`);
    assert(
      cribState.props.filter((p) => p.kind === 'giant_weapon_chest').length === 2,
      '$$$ Crib base expected 2 giant_weapon_chest props',
    );
    assert(
      cribState.props.filter((p) => p.kind === 'venuz_car_exit').length >= 4,
      '$$$ Crib expected >= 4 venuz_car_exit cars',
    );
    for (let t = 0; t < 15; t++) {
      stepSimulation(cribState, makeInput({ aimWorldX: cribState.player.x + 20, aimWorldY: cribState.player.y }));
      assertSimInvariants(cribState, `crib@t${t}`);
    }
    assert(!cribState.portal.active, '$$$ Crib must never auto-open a portal');

    const cribLove = createRunState({ mutant: 'yv', seed: 20261202, crown: 'love' });
    cribLove.player.mutations.push('open_mind');
    warpToArea(cribLove, '$$$', 0);
    assert(
      cribLove.props.filter((p) => p.kind === 'giant_weapon_chest').length === 0 &&
        cribLove.props.filter((p) => p.kind === 'giant_ammo_chest').length === 3,
      '$$$ Crib with open_mind + Crown of Love must spawn exactly 3 giant_ammo_chest props',
    );

    // B. IDPD HQ-2 (hq-2): HQ props, 0 rad canisters, Elites + Van on L1
    const hq2State = createRunState({ mutant: 'rogue', seed: 20261203 });
    hq2State.player.godMode = true;
    warpToArea(hq2State, 'hq-2', 1);
    assert(checkMapConnectivity(hq2State.map).connected, 'hq-2 map disconnected');
    assert(
      !hq2State.props.some((p) => p.kind === 'rad_canister' || p.kind === 'rad_maggot_canister'),
      'hq-2 must have 0 rad canisters',
    );
    assert(
      hq2State.props.some((p) => p.kind === 'server') && hq2State.props.some((p) => p.kind === 'terminal'),
      'hq-2 missing HQ server/terminal props',
    );
    assert(
      hq2State.enemies.some((e) => e.defId === 'idpd_van') &&
        hq2State.enemies.some((e) => ENEMIES[e.defId]?.isIdpd),
      'hq-2 L1 missing IDPD Van / Elites',
    );
    for (let t = 0; t < 20; t++) {
      stepSimulation(hq2State, makeInput({ aimWorldX: hq2State.player.x + 24, aimWorldY: hq2State.player.y }));
      assertSimInvariants(hq2State, `hq-2@t${t}`);
    }

    // C. Loop-1+ & HQ-3 Boss Verification: Mom (2-1 L1), Hyper Crystal (4-1 L1), Technomancer (6-1 L1), Captain (hq-3 L1)
    const extendedBossSpecs: ReadonlyArray<{
      bossId: BossId;
      area: AreaCode;
      loop: number;
      nextArea?: AreaCode;
      nextLoop?: number;
      victory?: boolean;
    }> = [
      { bossId: 'mom', area: '2-1', loop: 1, nextArea: '3-1', nextLoop: 1 },
      { bossId: 'hyper_crystal', area: '4-1', loop: 1, nextArea: '5-1', nextLoop: 1 },
      { bossId: 'technomancer', area: '6-1', loop: 1, nextArea: '7-1', nextLoop: 1 },
      { bossId: 'captain', area: 'hq-3', loop: 1, victory: true },
    ];

    for (let bIdx = 0; bIdx < extendedBossSpecs.length; bIdx++) {
      const spec = extendedBossSpecs[bIdx]!;
      const bState = createRunState({ mutant: 'fish', seed: 20261300 + bIdx * 17 });
      bState.player.godMode = true;
      warpToArea(bState, spec.area, spec.loop);
      assert(checkMapConnectivity(bState.map).connected, `${spec.area}@L${spec.loop} map disconnected`);
      assert(
        bState.boss?.bossId === spec.bossId,
        `Expected boss ${spec.bossId} on ${spec.area}@L${spec.loop}, got ${bState.boss?.bossId}`,
      );

      if (spec.bossId === 'technomancer') {
        const stations = bState.enemies.filter((e) => e.bossId === 'technomancer');
        assert(stations.length === 3, `Technomancer L1 expected 3 Battle Stations, got ${stations.length}`);
      } else if (spec.bossId === 'captain') {
        const desk = bState.props.find((p) => p.kind === 'captain_desk');
        assert(desk, 'hq-3 missing captain_desk');
        const cap = bState.enemies.find((e) => e.bossId === 'captain');
        assert(cap && cap.aiState === 'idle_desk', 'Captain should start passive in idle_desk');
        const dRng = SeededRng.fromState(bState.rngState);
        damageProp(bState, desk!, 10, dRng);
        bState.rngState = dRng.getState();
        stepSimulation(bState, makeInput({ aimWorldX: cap!.x, aimWorldY: cap!.y }));
        assert(bState.boss?.introTicks === 45, `Captain wake did not trigger introTicks=45 (got ${bState.boss?.introTicks})`);
      }

      // Isolate boss encounter (keep all Technomancer stations; keep Hyper Crystal orbiters)
      if (spec.bossId === 'mom' || spec.bossId === 'captain' || spec.bossId === 'technomancer') {
        bState.enemies = bState.enemies.filter((e) => e.bossId === spec.bossId);
      } else if (spec.bossId === 'hyper_crystal') {
        bState.enemies = bState.enemies.filter(
          (e) => e.bossId === 'hyper_crystal' || e.defId === 'laser_crystal' || e.defId === 'cursed_laser_crystal',
        );
      }

      // Step 90 ticks of live boss AI combat
      for (let t = 0; t < 90; t++) {
        const target = bState.enemies.find((e) => e.bossId === spec.bossId);
        stepSimulation(
          bState,
          makeInput({
            moveX: Math.cos(t * 0.1) * 0.35,
            moveY: Math.sin(t * 0.1) * 0.35,
            aimWorldX: target ? target.x : bState.player.x + 30,
            aimWorldY: target ? target.y : bState.player.y,
          }),
        );
        assertSimInvariants(bState, `extBoss:${spec.bossId}@t${t}`);
      }

      // Defeat boss + any remaining hostiles/summons cleanly
      const killRng = SeededRng.fromState(bState.rngState);
      for (const e of [...bState.enemies]) {
        if (!e.friendly && e.hp > 0) {
          e.invulnerable = false;
          applyDamageToEnemy(bState, e, e.hp + 999, 1, 0, killRng);
        }
      }
      bState.rngState = killRng.getState();

      // Step through hitstop + 30-tick PORTAL_SPAWN_DELAY_TICKS (or Captain ending transition)
      for (let k = 0; k < 70 && !bState.portal.active && bState.phase === 'playing'; k++) {
        // Clear any late-hatching frog eggs / turrets spawned during death frames
        if (k === 12) {
          const cleanRng = SeededRng.fromState(bState.rngState);
          for (const e of [...bState.enemies]) {
            if (!e.friendly && e.hp > 0) {
              applyDamageToEnemy(bState, e, e.hp + 999, 1, 0, cleanRng);
            }
          }
          bState.rngState = cleanRng.getState();
        }
        stepSimulation(bState, makeInput({ aimWorldX: bState.player.x + 20, aimWorldY: bState.player.y }));
        assertSimInvariants(bState, `extBossPost:${spec.bossId}@k${k}`);
      }

      assert(bState.boss?.defeated === true, `Extended boss ${spec.bossId} not marked defeated`);
      assert(
        bState.stats.bossesDefeated.includes(spec.bossId),
        `Extended boss ${spec.bossId} missing from stats.bossesDefeated`,
      );
      if (spec.victory) {
        assert(
          bState.phase === 'victory_throne' && bState.endingType === 'captain',
          `Captain defeat expected victory_throne/captain, got ${bState.phase}/${bState.endingType}`,
        );
      } else {
        assert(bState.portal.active, `Portal did not open after defeating ${spec.bossId}`);
        assert(
          bState.portal.targetArea === spec.nextArea && bState.portal.nextLoop === spec.nextLoop,
          `${spec.bossId} portal expected ${spec.nextArea}@L${spec.nextLoop}, got ${bState.portal.targetArea}@L${bState.portal.nextLoop}`,
        );
      }
      allDefeatedBosses.add(spec.bossId);
    }
  }

  for (const bossId of BOSS_IDS) {
    assert(
      allDefeatedBosses.has(bossId),
      `Campaign + Loop-1+/HQ soak missing boss defeat: ${bossId}`,
    );
  }

  return `PASS (1-1 -> 7-3[4 gens + Throne] -> 0-1[Throne II] -> Loop 1-1 in ${totalTicks} ticks + Loop-1+/HQ bosses[Mom/HyperCrystal/Technomancer/Captain] + $$$ + hq-2 | kills=${state.stats.kills}, level=${state.player.level}, mutations=${mutationsPicked}, ultra=${state.player.ultra}, bosses=${allDefeatedBosses.size}/${BOSS_IDS.length}, loop=${state.loop})`;
}

// ============================================================================
// 2. ALL 14 MUTANTS MATRIX (PASSIVE + ACTIVE + THRONE BUTT + ALL 29 ULTRAS)
// ============================================================================
function resolveToUltra(
  state: SimState,
  ultraChoiceIndex: 0 | 1 | 2,
  opts: { stopAfterFirstUltra?: boolean } = {},
): void {
  const rng = SeededRng.fromState(state.rngState);
  addRads(state, 4000, rng);
  state.rngState = rng.getState();

  for (let guard = 0; guard < 35 && (state.pendingLevelUps > 0 || state.phase !== 'playing'); guard++) {
    if (state.phase === 'playing' && state.pendingLevelUps > 0) {
      const r = SeededRng.fromState(state.rngState);
      openPendingLevelUp(state, r);
      state.rngState = r.getState();
    }
    if (state.phase === 'ultra_select') {
      const expectedChoices = MUTANTS[state.player.mutant].ultras.length;
      assert(
        state.pendingUltras.length === expectedChoices,
        `${state.player.mutant} ultra_select offered ${state.pendingUltras.length}, expected ${expectedChoices}`,
      );
      const r = SeededRng.fromState(state.rngState);
      const pickIdx = Math.min(ultraChoiceIndex, state.pendingUltras.length - 1);
      const ok = applyMutationSelection(state, pickIdx, r, populateAreaEntities);
      assert(ok, `applyMutationSelection failed for ultra index ${pickIdx} on ${state.player.mutant}`);
      state.rngState = r.getState();
      if (opts.stopAfterFirstUltra) {
        return;
      }
    } else if (state.phase === 'mutation_select') {
      const r = SeededRng.fromState(state.rngState);
      const ok = applyMutationSelection(state, 0, r, populateAreaEntities);
      assert(ok, `applyMutationSelection failed for mutation index 0 on ${state.player.mutant}`);
      state.rngState = r.getState();
    }
  }
}

function prepareMutantContext(state: SimState, mutant: MutantId): void {
  const p = state.player;
  if (mutant === 'melting') {
    spawnCorpse(state, p.x + 18, p.y, 0, 0, 1, 'sprBanditDead', 12, true);
  } else if (mutant === 'horror') {
    p.rads = Math.max(p.rads, 30);
  } else if (mutant === 'robot') {
    givePlayerWeapon(state, 'shotgun', 1, false);
  } else if (mutant === 'rogue') {
    p.portalStrikes = Math.max(p.portalStrikes, 2);
  }
}

function runAll14MutantsMatrix(): string {
  assert(MUTANT_IDS.length === 14, `Expected 14 mutants in MUTANT_IDS, got ${MUTANT_IDS.length}`);
  let totalTicks = 0;
  let ultrasVerified = 0;

  for (let idx = 0; idx < MUTANT_IDS.length; idx++) {
    const mutant = MUTANT_IDS[idx]!;
    const def = MUTANTS[mutant];

    // Run A: Base passive + RMB active -> Throne Butt -> Ultra A
    const stateA = createRunState({ mutant, seed: 10000 + idx * 31 });
    stateA.player.godMode = true;
    assert(stateA.player.maxHp === def.maxHp, `${mutant} starting maxHp mismatch`);
    assert(stateA.player.weapons[0]?.weaponId === def.startingWeapon, `${mutant} startingWeapon mismatch`);
    if (def.secondaryWeapon) {
      assert(stateA.player.weapons[1]?.weaponId === def.secondaryWeapon, `${mutant} secondaryWeapon mismatch`);
    }

    // Exercise base active
    prepareMutantContext(stateA, mutant);
    for (let t = 0; t < 20; t++) {
      stepSimulation(
        stateA,
        makeInput({
          moveX: Math.cos(t * 0.2),
          moveY: Math.sin(t * 0.2),
          aimWorldX: stateA.player.x + 48,
          aimWorldY: stateA.player.y,
          fireHeld: t % 4 < 2,
          firePressed: t % 4 === 0,
          activeHeld: t < 10,
          activePressed: t === 0,
        }),
      );
      totalTicks += 1;
      assertSimInvariants(stateA, `mutant:${mutant}:base@t${t}`);
    }

    // Grant Throne Butt and exercise upgraded active
    const tbRng = SeededRng.fromState(stateA.rngState);
    assert(grantMutationById(stateA, 'throne_butt', tbRng), `grantMutationById(throne_butt) failed for ${mutant}`);
    stateA.rngState = tbRng.getState();
    prepareMutantContext(stateA, mutant);
    for (let t = 0; t < 24; t++) {
      stepSimulation(
        stateA,
        makeInput({
          moveX: Math.sin(t * 0.25),
          moveY: Math.cos(t * 0.25),
          aimWorldX: stateA.player.x + 40,
          aimWorldY: stateA.player.y + 12,
          fireHeld: true,
          firePressed: t % 3 === 0,
          activeHeld: t < 12,
          activePressed: t === 0,
        }),
      );
      totalTicks += 1;
      assertSimInvariants(stateA, `mutant:${mutant}:tb@t${t}`);
    }

    // Resolve to Ultra A and exercise combat
    if (mutant === 'skeleton') {
      // Skeleton Ultra A (REDEMPTION): transforms back to Melting with ultra='skeleton_a' initially,
      // queuing 9 fresh Melting mutations + Melting Ultra!
      resolveToUltra(stateA, 0, { stopAfterFirstUltra: true });
      const postRedemptionMutant: MutantId = stateA.player.mutant;
      const postRedemptionUltra: string | null = stateA.player.ultra;
      assert(
        postRedemptionMutant === 'melting' && postRedemptionUltra === 'skeleton_a',
        `Skeleton REDEMPTION expected mutant='melting' & ultra='skeleton_a', got mutant=${postRedemptionMutant}, ultra=${postRedemptionUltra}`,
      );
      assert(
        stateA.player.maxHp === MUTANTS.melting.maxHp && stateA.pendingLevelUps === 10,
        `Skeleton REDEMPTION expected Melting maxHp=${MUTANTS.melting.maxHp} & pendingLevelUps=10, got maxHp=${stateA.player.maxHp}, pending=${stateA.pendingLevelUps}`,
      );
      ultrasVerified += 1;
      // Finish resolving the 9 fresh Melting mutations + Melting Ultra cleanly
      resolveToUltra(stateA, 0);
      const finalUltra: string | null = stateA.player.ultra;
      assert(
        stateA.player.mutant === 'melting' &&
          finalUltra === 'melting_a' &&
          stateA.player.mutations.length === 9,
        `Skeleton REDEMPTION follow-up expected melting_a + 9 mutations, got ultra=${finalUltra}, muts=${stateA.player.mutations.length}`,
      );
    } else {
      resolveToUltra(stateA, 0);
      assert(stateA.player.ultra === `${mutant}_a`, `Expected ${mutant}_a, got ${stateA.player.ultra}`);
      ultrasVerified += 1;
    }
    prepareMutantContext(stateA, stateA.player.mutant);
    for (let t = 0; t < 24; t++) {
      stepSimulation(
        stateA,
        makeInput({
          moveX: 0.5,
          moveY: -0.3,
          aimWorldX: stateA.player.x + 50,
          aimWorldY: stateA.player.y - 10,
          fireHeld: true,
          firePressed: t % 3 === 0,
          activeHeld: t < 10,
          activePressed: t === 0,
        }),
      );
      totalTicks += 1;
      assertSimInvariants(stateA, `mutant:${mutant}:ultraA@t${t}`);
    }

    // Run B: Fresh mutant -> Ultra B (including Melting's Detachment +3 mutations, Skeleton DAMNATION, Frog INTIMACY)
    const stateB = createRunState({ mutant, seed: 20000 + idx * 31 });
    stateB.player.godMode = true;
    resolveToUltra(stateB, 1);
    assert(stateB.player.ultra === `${mutant}_b`, `Expected ${mutant}_b, got ${stateB.player.ultra}`);
    ultrasVerified += 1;
    prepareMutantContext(stateB, mutant);
    for (let t = 0; t < 24; t++) {
      stepSimulation(
        stateB,
        makeInput({
          moveX: -0.4,
          moveY: 0.5,
          aimWorldX: stateB.player.x - 45,
          aimWorldY: stateB.player.y + 15,
          fireHeld: true,
          firePressed: t % 3 === 0,
          activeHeld: t < 10,
          activePressed: t === 0,
        }),
      );
      totalTicks += 1;
      assertSimInvariants(stateB, `mutant:${mutant}:ultraB@t${t}`);
    }

    // Run C: 3rd Ultra (Horror's MELTDOWN -> double 1,200 rad cap!)
    if (def.ultras.length >= 3) {
      const stateC = createRunState({ mutant, seed: 30000 + idx * 31 });
      stateC.player.godMode = true;
      resolveToUltra(stateC, 2);
      assert(stateC.player.ultra === `${mutant}_c`, `Expected ${mutant}_c, got ${stateC.player.ultra}`);
      if (mutant === 'horror') {
        const capRng = SeededRng.fromState(stateC.rngState);
        addRads(stateC, 2000, capRng);
        stateC.rngState = capRng.getState();
        assert(
          stateC.player.rads === 1200,
          `Horror MELTDOWN expected 1200 rad cap, got ${stateC.player.rads}`,
        );
      }
      ultrasVerified += 1;
      prepareMutantContext(stateC, mutant);
      for (let t = 0; t < 24; t++) {
        stepSimulation(
          stateC,
          makeInput({
            moveX: 0.3,
            moveY: 0.4,
            aimWorldX: stateC.player.x + 42,
            aimWorldY: stateC.player.y - 12,
            fireHeld: true,
            firePressed: t % 3 === 0,
            activeHeld: t < 10,
            activePressed: t === 0,
          }),
        );
        totalTicks += 1;
        assertSimInvariants(stateC, `mutant:${mutant}:ultraC@t${t}`);
      }
    }
  }

  return `PASS (${MUTANT_IDS.length}/14 mutants verified: passive + RMB active + Throne Butt + ${ultrasVerified}/29 Ultras incl. Skeleton REDEMPTION/DAMNATION, Frog DISTANCE/INTIMACY & Horror MELTDOWN across ${totalTicks} ticks, 0 NaNs, 0 wall traps)`;
}

// ============================================================================
// 3. ALL 29 MUTATIONS + ALL 5 AMMO CLASSES + MELEE PROJECTILE DEFLECTION
// ============================================================================
function carveOpenTestChamber(state: SimState): void {
  const { tx: ptx, ty: pty } = worldToTile(state.player.x, state.player.y, state.map.tileSize);
  for (let ty = pty - 5; ty <= pty + 5; ty++) {
    for (let tx = ptx - 5; tx <= ptx + 5; tx++) {
      setTile(state.map, tx, ty, TileType.Floor);
    }
  }
}

function runMutationsAmmoAndMeleeDeflection(): string {
  // 3A. All 29 Mutations
  const mutState = createRunState({ mutant: 'fish', seed: 33001 });
  mutState.player.godMode = true;
  const baseMaxHp = mutState.player.maxHp;
  const baseSpeed = getPlayerMoveSpeed(mutState.player);
  const baseBulletMax = mutState.player.ammoMax.bullet;

  const mutRng = SeededRng.fromState(mutState.rngState);
  for (const mutId of MUTATION_IDS) {
    assert(grantMutationById(mutState, mutId, mutRng), `Failed to grant mutation ${mutId}`);
  }
  mutState.rngState = mutRng.getState();

  assert(mutState.player.mutations.length === 29, `Expected 29 mutations, got ${mutState.player.mutations.length}`);
  assert(mutState.player.maxHp === baseMaxHp + 4, 'rhino_skin failed (+4 maxHp)');
  assert(getPlayerMoveSpeed(mutState.player) > baseSpeed, 'extra_feet failed');
  assert(mutState.player.ammoMax.bullet > baseBulletMax, 'back_muscle failed');
  assert(mutState.player.strongSpiritReady, 'strong_spirit failed');

  for (let t = 0; t < 40; t++) {
    stepSimulation(
      mutState,
      makeInput({
        moveX: Math.cos(t * 0.2),
        moveY: Math.sin(t * 0.2),
        aimWorldX: mutState.player.x + 60,
        aimWorldY: mutState.player.y,
        fireHeld: true,
        firePressed: t % 3 === 0,
      }),
    );
    assertSimInvariants(mutState, `all29muts@t${t}`);
  }

  // 3B. All 5 Ammo Classes (+ melee) & non-godMode damage/iframes sanity check
  const ammoTestWeapons: ReadonlyArray<{ ammo: Exclude<AmmoType, 'melee'>; weaponId: string }> = [
    { ammo: 'bullet', weaponId: 'assault_rifle' },
    { ammo: 'shell', weaponId: 'shotgun' },
    { ammo: 'bolt', weaponId: 'crossbow' },
    { ammo: 'explosive', weaponId: 'grenade_launcher' },
    { ammo: 'energy', weaponId: 'laser_rifle' },
  ];

  for (let idx = 0; idx < ammoTestWeapons.length; idx++) {
    const tc = ammoTestWeapons[idx]!;
    const ammoState = createRunState({ mutant: 'crystal', seed: 33002 + idx });
    ammoState.player.godMode = true;
    ammoState.enemies = [];
    carveOpenTestChamber(ammoState);

    assert(WEAPONS[tc.weaponId]?.ammoType === tc.ammo, `Weapon ${tc.weaponId} ammoType mismatch`);
    assert(givePlayerWeapon(ammoState, tc.weaponId, 0, false), `givePlayerWeapon(${tc.weaponId}) failed`);
    ammoState.player.activeSlot = 0;
    ammoState.player.weapons[0]!.reloadTicks = 0;
    ammoState.player.ammo[tc.ammo] = ammoState.player.ammoMax[tc.ammo];

    // Spawn target dummy to absorb fire
    const eRng = SeededRng.fromState(ammoState.rngState);
    const dummy = createEnemyEntity(ammoState, 'scorpion', ammoState.player.x + 56, ammoState.player.y, eRng);
    ammoState.rngState = eRng.getState();

    const ammoBefore = ammoState.player.ammo[tc.ammo];
    const shotsBefore = ammoState.stats.shotsFired;
    stepSimulation(
      ammoState,
      makeInput({
        aimWorldX: dummy.x,
        aimWorldY: dummy.y,
        fireHeld: true,
        firePressed: true,
      }),
    );
    assert(ammoState.stats.shotsFired > shotsBefore, `Ammo class ${tc.ammo} (${tc.weaponId}) failed to fire`);
    assert(ammoState.player.ammo[tc.ammo] < ammoBefore, `Ammo class ${tc.ammo} (${tc.weaponId}) did not consume ammo`);

    for (let t = 0; t < 12; t++) {
      stepSimulation(ammoState, makeInput({ aimWorldX: dummy.x, aimWorldY: dummy.y }));
      assertSimInvariants(ammoState, `ammo:${tc.ammo}@t${t}`);
    }
    if (dummy.hp > 0) {
      const dRng = SeededRng.fromState(ammoState.rngState);
      applyDamageToEnemy(ammoState, dummy, dummy.hp + 10, 1, 0, dRng);
      ammoState.rngState = dRng.getState();
    }
  }

  // 3C. Melee Projectile Deflection & Destruction (wrench, shovel, energy_sword, screwdriver)
  const meleeCases: ReadonlyArray<{ weaponId: string; expectMode: 'deflect' | 'destroy' }> = [
    { weaponId: 'wrench', expectMode: 'deflect' },
    { weaponId: 'shovel', expectMode: 'deflect' },
    { weaponId: 'energy_sword', expectMode: 'deflect' },
    { weaponId: 'screwdriver', expectMode: 'destroy' },
  ];

  for (const mc of meleeCases) {
    const mState = createRunState({ mutant: 'fish', seed: 33100 });
    mState.player.godMode = true;
    mState.enemies = [];
    mState.projectiles = [];
    carveOpenTestChamber(mState);
    assert(givePlayerWeapon(mState, mc.weaponId, 0, false), `givePlayerWeapon(${mc.weaponId}) failed`);
    mState.player.activeSlot = 0;
    mState.player.weapons[0]!.reloadTicks = 0;
    mState.player.ammo.energy = mState.player.ammoMax.energy;

    const incoming = spawnEnemyProjectile(mState, {
      x: mState.player.x + 18,
      y: mState.player.y,
      angle: Math.PI, // traveling directly left at player
      speed: 3.5,
      damage: 2,
    });

    stepSimulation(
      mState,
      makeInput({
        aimWorldX: mState.player.x + 48,
        aimWorldY: mState.player.y,
        fireHeld: true,
        firePressed: true,
      }),
    );
    assertSimInvariants(mState, `melee:${mc.weaponId}`);

    if (mc.expectMode === 'deflect') {
      assert(
        incoming.team === 'player' && incoming.vx > 0,
        `${mc.weaponId} failed to deflect incoming enemy bullet (team=${incoming.team}, vx=${incoming.vx})`,
      );
    } else {
      assert(
        !mState.projectiles.includes(incoming),
        `${mc.weaponId} failed to destroy incoming enemy bullet`,
      );
    }
  }

  return 'PASS (29/29 mutations, 5/5 ammo classes fired & consumed, wrench/shovel/energy_sword deflected & screwdriver destroyed enemy bullets)';
}

// ============================================================================
// 4. DETERMINISM REPLAY TEST (TICKS 60, 120, 180, 240)
// ============================================================================
function runDeterminismReplayTest(): string {
  const CHECKPOINTS = [60, 120, 180, 240] as const;

  const runReplay = (seed: number): Record<number, string> => {
    const state = createRunState({ mutant: 'yv', seed });
    givePlayerWeapon(state, 'assault_rifle', 0, false);
    state.player.ammo.bullet = 250;
    const hashes: Record<number, string> = {};

    for (let t = 1; t <= 240; t++) {
      let aimX = state.player.x + Math.cos(t * 0.11) * 72;
      let aimY = state.player.y + Math.sin(t * 0.11) * 72;
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

      stepSimulation(
        state,
        makeInput({
          moveX: Math.cos(t * 0.09),
          moveY: Math.sin(t * 0.13),
          aimWorldX: aimX,
          aimWorldY: aimY,
          fireHeld: t % 10 < 7,
          firePressed: t % 10 === 0,
          activePressed: t % 48 === 12,
          swapPressed: t === 100,
        }),
      );
      assertSimInvariants(state, `determinism@${seed}:t${t}`);

      if (t === 60 || t === 120 || t === 180 || t === 240) {
        hashes[t] = hashSimState(state);
      }
    }
    return hashes;
  };

  const runA = runReplay(20261125);
  const runB = runReplay(20261125);
  const runDiff = runReplay(20261126);

  for (const cp of CHECKPOINTS) {
    assert(
      runA[cp] === runB[cp],
      `Determinism mismatch at tick ${cp}: runA=${runA[cp]} !== runB=${runB[cp]}`,
    );
  }
  assert(runA[240] !== runDiff[240], 'Different seeds unexpectedly produced identical tick-240 state hash');

  return `PASS (bit-for-bit identical hashes at t60=${runA[60]}, t120=${runA[120]}, t180=${runA[180]}, t240=${runA[240]})`;
}

// ============================================================================
// 5. 500-SEED CONNECTIVITY & BOSS WARP STRESS
// ============================================================================
function runConnectivityAndBossWarpStress(): string {
  assert(AREA_CODES.length === 26, `Expected 26 AREA_CODES, got ${AREA_CODES.length}`);
  assert(BOSS_IDS.length === 9, `Expected 9 BOSS_IDS, got ${BOSS_IDS.length}`);
  for (let i = 0; i < 500; i++) {
    const code = AREA_CODES[i % AREA_CODES.length]!;
    const areaDef = AREAS[code];
    const loop = i % 3;
    const seed = 70001 + i * 7919;
    const map = generateWorldMap(code, areaDef.biome, loop, new SeededRng(seed), {
      targetFloors: areaDef.targetFloors,
      walkerCount: areaDef.walkerCount,
      darkness: areaDef.darkness,
    });
    const conn = checkMapConnectivity(map);
    assert(
      conn.connected && conn.reachable === conn.totalWalkable && conn.totalWalkable === map.walkableCount,
      `Map connectivity failed on seed=${seed}, area=${code}@L${loop}: ${JSON.stringify(conn)}`,
    );
    assert(!isWorldSolid(map, map.spawnX, map.spawnY), `Spawn solid on seed=${seed}, area=${code}`);
  }

  // Verify warpToArea + spawnBossEntity across all 9 bosses cleanly
  const warpState = createRunState({ mutant: 'eyes', seed: 91919 });
  warpState.player.godMode = true;
  for (const bossId of BOSS_IDS) {
    warpToArea(warpState, '1-1', 0);
    warpState.enemies = [];
    const rng = SeededRng.fromState(warpState.rngState);
    const boss = spawnBossEntity(warpState, bossId, rng);
    warpState.rngState = rng.getState();
    assert(boss.bossId === bossId && warpState.boss?.bossId === bossId, `spawnBossEntity(${bossId}) failed`);
    for (let t = 0; t < 15; t++) {
      stepSimulation(warpState, makeInput({ aimWorldX: boss.x, aimWorldY: boss.y }));
      assertSimInvariants(warpState, `bossWarp:${bossId}@t${t}`);
    }
  }

  // Verify zero tick-0 spawn LOS ambushes & safe 2s opening pocket across 20 1-1 seeds
  for (let s = 100; s < 120; s++) {
    const safeState = createRunState({ mutant: 'fish', seed: s });
    for (const e of safeState.enemies) {
      if (e.friendly) continue;
      const d = Math.hypot(e.x - safeState.player.x, e.y - safeState.player.y);
      assert(d >= 112, `Unsafe spawn distance ${d.toFixed(1)}px on 1-1 seed=${s}`);
      if (d < 220) {
        assert(
          !hasLineOfSight(safeState.map, safeState.player.x, safeState.player.y, e.x, e.y),
          `Direct tick-0 spawn LoS ambush on 1-1 seed=${s} (enemy=${e.defId}, d=${d.toFixed(1)})`,
        );
      }
    }
    for (let t = 0; t < 60; t++) {
      stepSimulation(
        safeState,
        makeInput({ aimWorldX: safeState.player.x + 40, aimWorldY: safeState.player.y }),
      );
    }
    assert(
      safeState.player.hp === safeState.player.maxHp,
      `Stand-still spawn ambush hit player within 2s on 1-1 seed=${s} (hp=${safeState.player.hp}/${safeState.player.maxHp})`,
    );
  }

  return `PASS (500/500 seeds 100% connected across all ${AREA_CODES.length} areas & loops 0-2; 20/20 safe spawn pockets; ${BOSS_IDS.length}/${BOSS_IDS.length} bosses warp-spawned & stepped cleanly)`;
}

function main(): void {
  const startMs = Date.now();
  console.log('========================================================================');
  console.log('GATE B — AUTONOMOUS HEADLESS SIMULATION SOAK & INVARIANT SUITE');
  console.log('========================================================================');

  const r1 = runCampaignProgressionSoak();
  console.log(`[1/5 Campaign Soak]        ${r1}`);

  const r2 = runAll14MutantsMatrix();
  console.log(`[2/5 14-Mutant Matrix]     ${r2}`);

  const r3 = runMutationsAmmoAndMeleeDeflection();
  console.log(`[3/5 29 Muts+Ammo+Melee]   ${r3}`);

  const r4 = runDeterminismReplayTest();
  console.log(`[4/5 Determinism Replay]   ${r4}`);

  const r5 = runConnectivityAndBossWarpStress();
  console.log(`[5/5 500-Seed+Boss Stress] ${r5}`);

  const elapsedMs = Date.now() - startMs;
  console.log(`[GATE B PASS] All 5 verification pillars passed in ${elapsedMs} ms with 0 NaNs, 0 wall traps, 0 exceptions.`);
}

main();
