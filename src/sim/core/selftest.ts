import {
  TILE_SIZE,
  TileType,
  type AreaCode,
  type BiomeId,
  type SimState,
  type WorldMap,
} from '@/contracts';
import {
  SeededRng,
  allocEntityId,
  carveCircle,
  checkMapConnectivity,
  circleOverlap,
  drainEvents,
  emitEvent,
  findNearestFloor,
  generateWorldMap,
  getTile,
  hasLineOfSight,
  hashSimState,
  hashWorldMap,
  isCircleOverlappingSolid,
  isSolidTile,
  isWalkableTile,
  isWorldSolid,
  moveCircleWithSlide,
  segmentCircleHit,
  setTile,
  stepCasings,
  stepCorpses,
  stepParticles,
  stepPickups,
  stepPortal,
  sweptRayTile,
  tileToWorldCenter,
  worldToTile,
  type SolidBox,
} from '@/sim/core/index';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error(`SELFTEST FAILURE: ${msg}`);
  }
}

const ALL_AREAS: ReadonlyArray<{ code: AreaCode; biome: BiomeId }> = [
  { code: '1-1', biome: 'desert' },
  { code: '1-2', biome: 'desert' },
  { code: '1-3', biome: 'desert' },
  { code: '2-1', biome: 'sewers' },
  { code: '3-1', biome: 'scrapyard' },
  { code: '3-2', biome: 'scrapyard' },
  { code: '3-3', biome: 'scrapyard' },
  { code: '4-1', biome: 'caves' },
  { code: '5-1', biome: 'frozen_city' },
  { code: '5-2', biome: 'frozen_city' },
  { code: '5-3', biome: 'frozen_city' },
  { code: '6-1', biome: 'labs' },
  { code: '7-1', biome: 'palace' },
  { code: '7-2', biome: 'palace' },
  { code: '7-3', biome: 'palace' },
  { code: '0-1', biome: 'campfire' },
  { code: 'vault', biome: 'vault' },
  { code: '1-?', biome: 'oasis' },
  { code: '2-?', biome: 'pizza_sewers' },
  { code: '3-?', biome: 'mansion' },
  { code: '4-?', biome: 'cursed_caves' },
  { code: '5-?', biome: 'jungle' },
  { code: 'hq-1', biome: 'hq' },
];

function verifyWallMask(map: WorldMap): void {
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const idx = ty * map.width + tx;
      const tile = map.tiles[idx] as TileType;
      const mask = map.wallMask[idx]!;
      if (!isSolidTile(tile)) {
        assert(mask === 0, `Walkable tile (${tx},${ty}) has non-zero wallMask ${mask}`);
        continue;
      }
      let expected = 0;
      if (isSolidTile(getTile(map, tx, ty - 1))) expected |= 1;
      if (isSolidTile(getTile(map, tx + 1, ty))) expected |= 2;
      const south = getTile(map, tx, ty + 1);
      if (isSolidTile(south)) expected |= 4;
      else if (ty + 1 < map.height && isWalkableTile(south)) expected |= 16;
      if (isSolidTile(getTile(map, tx - 1, ty))) expected |= 8;
      assert(
        mask === expected,
        `Wall autotile mismatch at (${tx},${ty}): got ${mask}, expected ${expected}`,
      );
    }
  }
}

function createFixtureSimState(seed: number, areaCode: AreaCode = '1-1', biome: BiomeId = 'desert'): SimState {
  const rng = new SeededRng(seed);
  const map = generateWorldMap(areaCode, biome, 0, rng);
  return {
    tick: 0,
    seed,
    rngState: rng.getState(),
    phase: 'playing',
    areaCode,
    biome,
    loop: 0,
    crown: 'none',
    map,
    player: {
      id: 1,
      mutant: 'fish',
      skin: 'a',
      x: map.spawnX,
      y: map.spawnY,
      prevX: map.spawnX,
      prevY: map.spawnY,
      vx: 0,
      vy: 0,
      radius: 6,
      aimAngle: 0,
      facing: 1,
      hp: 8,
      maxHp: 8,
      iframes: 0,
      hurtFlashTicks: 0,
      rads: 0,
      level: 1,
      radsToNextLevel: 60,
      mutations: [],
      ultra: null,
      strongSpiritReady: false,
      strongSpiritRecharging: false,
      ammo: { melee: 0, bullet: 96, shell: 0, bolt: 0, explosive: 0, energy: 0 },
      ammoMax: { melee: 0, bullet: 255, shell: 55, bolt: 55, explosive: 55, energy: 55 },
      weapons: [
        {
          weaponId: 'revolver',
          reloadTicks: 0,
          maxReloadTicks: 6,
          burstRemaining: 0,
          burstTimer: 0,
          kickOffset: 0,
        },
        null,
      ],
      activeSlot: 0,
      activeCooldown: 0,
      activeTimer: 0,
      shielding: false,
      rolling: false,
      rollDirX: 0,
      rollDirY: 0,
      telekinesisActive: false,
      radBeamTicks: 0,
      headlessTicks: 0,
      headlessDeaths: 0,
      gunWarrantTicks: 0,
      portalStrikes: 0,
      hammerheadTicks: 0,
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
      x: map.spawnX,
      y: map.spawnY,
      radius: 20,
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
    pendingLevelUps: 0,
    chestSkipStreak: 0,
    generatorsRemaining: 0,
    idpdHeat: 0,
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
    nextEntityId: 2,
    portalTransitionTicks: 0,
    floorClearTrigger: false,
  };
}

function test1_WorldgenConnectivity500Seeds(): string {
  let checked = 0;
  let throneCarpetChecked = 0;

  for (let i = 0; i < 500; i++) {
    const spec = ALL_AREAS[i % ALL_AREAS.length]!;
    const loop = i % 3; // Loop 0, 1, 2
    const seed = 10001 + i * 7919;
    const rng = new SeededRng(seed);
    const map = generateWorldMap(spec.code, spec.biome, loop, rng);

    // 1. Connectivity
    const conn = checkMapConnectivity(map);
    assert(
      conn.connected && conn.reachable === conn.totalWalkable && conn.totalWalkable === map.walkableCount,
      `Seed ${seed} (${spec.code} L${loop}) disconnected or walkableCount mismatch: ${JSON.stringify(conn)} vs ${map.walkableCount}`,
    );
    assert(conn.totalWalkable >= 9, `Seed ${seed} (${spec.code}) too few walkable tiles: ${conn.totalWalkable}`);

    // 2. Non-wall spawn & guaranteed 3x3 clear spawn plaza
    assert(!isWorldSolid(map, map.spawnX, map.spawnY), `Seed ${seed} (${spec.code}) spawn is solid`);
    const { tx: stx, ty: sty } = worldToTile(map.spawnX, map.spawnY, map.tileSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        assert(
          isWalkableTile(getTile(map, stx + dx, sty + dy)),
          `Seed ${seed} (${spec.code}) spawn 3x3 blocked at (${stx + dx},${sty + dy})`,
        );
      }
    }

    // 3. Guaranteed 2-tile outer wall margin
    for (let tx = 0; tx < map.width; tx++) {
      assert(getTile(map, tx, 0) === TileType.Wall, `Outer margin top0 breached (${spec.code})`);
      assert(getTile(map, tx, 1) === TileType.Wall, `Outer margin top1 breached (${spec.code})`);
      assert(getTile(map, tx, map.height - 1) === TileType.Wall, `Outer margin bot0 breached (${spec.code})`);
      assert(getTile(map, tx, map.height - 2) === TileType.Wall, `Outer margin bot1 breached (${spec.code})`);
    }
    for (let ty = 0; ty < map.height; ty++) {
      assert(getTile(map, 0, ty) === TileType.Wall, `Outer margin left0 breached (${spec.code})`);
      assert(getTile(map, 1, ty) === TileType.Wall, `Outer margin left1 breached (${spec.code})`);
      assert(getTile(map, map.width - 1, ty) === TileType.Wall, `Outer margin right0 breached (${spec.code})`);
      assert(getTile(map, map.width - 2, ty) === TileType.Wall, `Outer margin right1 breached (${spec.code})`);
    }

    // 4. Wall autotile bitmask validation (check first 50 thoroughly + every 7-3/vault)
    if (i < 50 || spec.code === '7-3' || spec.code === 'vault') {
      verifyWallMask(map);
    }

    // 5. Special 7-3 Nuclear Throne layout invariants
    if (spec.code === '7-3') {
      const cx = Math.floor(map.width / 2);
      let carpetRun = 0;
      for (let ty = 15; ty <= sty; ty++) {
        assert(
          getTile(map, cx, ty) === TileType.Carpet,
          `7-3 missing red carpet at center (${cx},${ty})`,
        );
        carpetRun += 1;
      }
      assert(carpetRun >= 40, `7-3 carpet hall too short: ${carpetRun}`);
      // Verify side corridors & 4 generator alcoves exist (walkable tiles on both far flanks)
      assert(isWalkableTile(getTile(map, cx - 12, 30)), '7-3 missing west side corridor');
      assert(isWalkableTile(getTile(map, cx + 12, 30)), '7-3 missing east side corridor');
      assert(isWalkableTile(getTile(map, cx - 15, 19)), '7-3 missing NW generator alcove');
      assert(isWalkableTile(getTile(map, cx + 15, 19)), '7-3 missing NE generator alcove');
      assert(isWalkableTile(getTile(map, cx - 15, 31)), '7-3 missing SW generator alcove');
      assert(isWalkableTile(getTile(map, cx + 15, 31)), '7-3 missing SE generator alcove');
      throneCarpetChecked += 1;
    }

    checked += 1;
  }

  return `PASS (500/500 seeds connected across all ${ALL_AREAS.length} areas & loops 0-2; ${throneCarpetChecked} Nuclear Throne 7-3 carpet/alcove layouts verified)`;
}

function test2_SweptRayZeroTunneling(): string {
  const rng = new SeededRng(424242);
  const map = generateWorldMap('3-2', 'scrapyard', 0, rng);

  // Build explicit 1-tile-thick thin wall test arena inside a small custom map
  const thinMap = generateWorldMap('1-1', 'desert', 0, new SeededRng(99));
  // Clear a 10x10 room and place a 1-tile thick vertical wall right down the middle
  for (let ty = 10; ty <= 20; ty++) {
    for (let tx = 10; tx <= 20; tx++) {
      setTile(thinMap, tx, ty, tx === 15 ? TileType.Wall : TileType.Floor);
    }
  }
  const startCenter = tileToWorldCenter(13, 15, TILE_SIZE);
  for (const speed of [40, 60, 80, 120]) {
    const hit0 = sweptRayTile(thinMap, startCenter.x, startCenter.y, startCenter.x + speed, startCenter.y, 0);
    assert(hit0.hit, `Zero-radius ray tunneled through 1-tile wall at speed ${speed}`);
    assert(hit0.tileX === 15 && hit0.tileY === 15, `Wrong tile hit at speed ${speed}: (${hit0.tileX},${hit0.tileY})`);
    assert(hit0.normalX === -1 && hit0.normalY === 0, `Wrong normal: (${hit0.normalX},${hit0.normalY})`);
    assert(Math.abs(hit0.hitX - 15 * TILE_SIZE) < 1e-6, `Imprecise hitX: ${hit0.hitX}`);

    const hitR = sweptRayTile(thinMap, startCenter.x, startCenter.y, startCenter.x + speed, startCenter.y, 4);
    assert(hitR.hit, `Radius-4 ray tunneled through 1-tile wall at speed ${speed}`);
    assert(hitR.tileX === 15 && hitR.tileY === 15, `Wrong radius-4 tile hit: (${hitR.tileX},${hitR.tileY})`);
    assert(Math.abs(hitR.hitX - (15 * TILE_SIZE - 4)) < 1e-6, `Imprecise radius-4 hitX: ${hitR.hitX}`);
    assert(hitR.normalX === -1 && hitR.normalY === 0, `Wrong radius-4 normal`);
  }

  // Collect all walkable floor tile centers for random ray origins
  const floorCenters: Array<{ x: number; y: number }> = [];
  for (let ty = 2; ty < map.height - 2; ty++) {
    for (let tx = 2; tx < map.width - 2; tx++) {
      if (isWalkableTile(getTile(map, tx, ty))) {
        floorCenters.push(tileToWorldCenter(tx, ty, map.tileSize));
      }
    }
  }
  assert(floorCenters.length > 50, 'Not enough floor tiles for ray test');

  let hitsCount = 0;
  let clearCount = 0;

  for (let i = 0; i < 1000; i++) {
    const origin = rng.pick(floorCenters);
    const ox = origin.x + rng.range(-5, 5);
    const oy = origin.y + rng.range(-5, 5);
    const angle = rng.range(0, Math.PI * 2);
    const speed = rng.range(40, 80);
    const x1 = ox + Math.cos(angle) * speed;
    const y1 = oy + Math.sin(angle) * speed;
    const radius = i % 2 === 0 ? 0 : rng.range(1.5, 4.5);

    const hit = sweptRayTile(map, ox, oy, x1, y1, radius);

    // Dense reference march at 0.25 px step
    const samples = Math.ceil(speed / 0.25);
    let refFirstHitT = -1;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const sx = ox + (x1 - ox) * t;
      const sy = oy + (y1 - oy) * t;
      const blocked =
        radius <= 0
          ? isWorldSolid(map, sx, sy)
          : isCircleOverlappingSolid(map, sx, sy, radius - 0.05);
      if (blocked) {
        refFirstHitT = t;
        break;
      }
    }

    if (refFirstHitT >= 0) {
      assert(
        hit.hit,
        `Ray #${i} (r=${radius.toFixed(2)}, speed=${speed.toFixed(1)}) tunneled! Reference hit at t=${refFirstHitT.toFixed(4)}`,
      );
      assert(
        hit.t <= refFirstHitT + 0.02,
        `Ray #${i} overshot first wall contact: hit.t=${hit.t.toFixed(4)} vs ref=${refFirstHitT.toFixed(4)}`,
      );
      hitsCount += 1;
    } else if (hit.hit) {
      // Exact analytic test can catch grazing hits narrower than 0.25px sample spacing; verify hit tile is indeed solid
      assert(
        isSolidTile(getTile(map, hit.tileX, hit.tileY)),
        `Ray #${i} reported hit on non-solid tile (${hit.tileX},${hit.tileY})`,
      );
      hitsCount += 1;
    } else {
      assert(!isWorldSolid(map, x1, y1), `Ray #${i} missed solid endpoint!`);
      clearCount += 1;
    }
  }

  // Verify LOS & segmentCircleHit helpers
  assert(
    hasLineOfSight(thinMap, tileToWorldCenter(12, 12).x, tileToWorldCenter(12, 12).y, tileToWorldCenter(14, 14).x, tileToWorldCenter(14, 14).y),
    'LOS should be clear inside open quadrant',
  );
  assert(
    !hasLineOfSight(thinMap, tileToWorldCenter(13, 15).x, tileToWorldCenter(13, 15).y, tileToWorldCenter(17, 15).x, tileToWorldCenter(17, 15).y),
    'LOS should be blocked by wall',
  );
  const segHit = segmentCircleHit(0, 0, 100, 0, 50, 3, 5);
  assert(segHit.hit && Math.abs(segHit.hitX - 46) < 1e-6, `segmentCircleHit inaccurate: ${JSON.stringify(segHit)}`);
  assert(circleOverlap(0, 0, 5, 8, 0, 4), 'circleOverlap should be true');
  assert(!circleOverlap(0, 0, 5, 10, 0, 4), 'circleOverlap should be false');

  return `PASS (1,000 random rays at 40-80 px/tick + thin-wall speed 40-120 tests: 0 tunneling; ${hitsCount} wall hits, ${clearCount} clear)`;
}

function test3_MoveCircleNoEmbedding(): string {
  const rng = new SeededRng(777333);
  const map = generateWorldMap('2-1', 'sewers', 0, rng);
  const radius = 6;

  // Add a few extra solid prop boxes on nearby floor tiles
  const boxes: SolidBox[] = [
    { x: map.spawnX + 48, y: map.spawnY - 8, w: 12, h: 12 },
    { x: map.spawnX - 54, y: map.spawnY + 12, w: 14, h: 14 },
  ];

  let x = map.spawnX;
  let y = map.spawnY;
  assert(!isCircleOverlappingSolid(map, x, y, radius, boxes), 'Initial spawn overlaps solid');

  let wallHits = 0;
  for (let step = 0; step < 1000; step++) {
    // Mix normal movement, fast dashes/rolls, and violent diagonal slams
    const speed = step % 7 === 0 ? rng.range(12, 32) : rng.range(2, 8);
    const angle = rng.range(0, Math.PI * 2);
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;

    const res = moveCircleWithSlide(map, x, y, dx, dy, radius, boxes);
    x = res.x;
    y = res.y;
    if (res.hitWall) wallHits += 1;

    assert(
      !isCircleOverlappingSolid(map, x, y, radius, boxes),
      `Step ${step}: circle embedded in solid at (${x.toFixed(3)}, ${y.toFixed(3)})`,
    );
    assert(
      !isWorldSolid(map, x, y),
      `Step ${step}: circle center inside solid tile at (${x.toFixed(3)}, ${y.toFixed(3)})`,
    );
  }

  // Explicit clean wall-sliding check in controlled room
  const room = generateWorldMap('1-1', 'desert', 0, new SeededRng(1234));
  for (let ty = 10; ty <= 16; ty++) {
    for (let tx = 10; tx <= 16; tx++) {
      setTile(room, tx, ty, tx === 15 ? TileType.Wall : TileType.Floor);
    }
  }
  const startX = 15 * TILE_SIZE - radius - 1;
  const startY = 12.5 * TILE_SIZE;
  const slide = moveCircleWithSlide(room, startX, startY, 5, 6, radius);
  assert(slide.hitX && !slide.hitY, `Expected hitX=true, hitY=false on east wall slide: ${JSON.stringify(slide)}`);
  assert(Math.abs(slide.y - (startY + 6)) < 1e-5, `Slide lost Y progress: ${slide.y} vs ${startY + 6}`);
  assert(!isCircleOverlappingSolid(room, slide.x, slide.y, radius), 'Post-slide embedded');

  // Verify findNearestFloor rescues points inside solid walls
  const solidWallPt = tileToWorldCenter(0, 0, TILE_SIZE);
  const nearest = findNearestFloor(map, solidWallPt.x, solidWallPt.y, 40);
  assert(!isWorldSolid(map, nearest.x, nearest.y), 'findNearestFloor returned solid tile');

  return `PASS (1,000 random/high-speed steps + extra solid boxes: 0 embeds, ${wallHits} clean wall collisions; diagonal wall-slide verified)`;
}

function runPortalScenario(seed: number): {
  carvedTiles: number;
  finalRads: number;
  chestSkipStreak: number;
  phase: string;
  portalEntered: boolean;
  pickupsRemaining: number;
  chestsRemaining: number;
  hash: string;
  ticksToCapture: number;
} {
  const state = createFixtureSimState(seed, '1-1', 'desert');

  // Place a solid wall ring just north of spawn so portal carving is guaranteed to carve wall tiles
  const { tx: stx, ty: sty } = worldToTile(state.map.spawnX, state.map.spawnY, TILE_SIZE);
  const portalTx = stx;
  const portalTy = sty - 2;
  setTile(state.map, portalTx, portalTy - 1, TileType.Wall);
  setTile(state.map, portalTx - 1, portalTy - 1, TileType.Wall);
  setTile(state.map, portalTx + 1, portalTy - 1, TileType.Wall);

  const portalPos = tileToWorldCenter(portalTx, portalTy, TILE_SIZE);
  state.portal = {
    active: true,
    x: portalPos.x,
    y: portalPos.y,
    radius: 20,
    timer: 0,
    targetArea: '1-2',
    nextLoop: 0,
    entered: false,
    enterTicks: 0,
    carved: false,
  };

  // Position player slightly south of portal so portal pulls & captures player
  state.player.x = portalPos.x;
  state.player.y = portalPos.y + 42;

  // Spawn loose rads, ammo, weapon pickup, unopened weapon chest, and rad canister
  state.pickups.push(
    {
      id: allocEntityId(state),
      kind: 'rad',
      x: portalPos.x - 50,
      y: portalPos.y,
      vx: 0,
      vy: 0,
      value: 5,
      lifeTicks: 300,
      animFrame: 0,
    },
    {
      id: allocEntityId(state),
      kind: 'big_rad',
      x: portalPos.x + 60,
      y: portalPos.y + 10,
      vx: 0,
      vy: 0,
      value: 15,
      lifeTicks: 300,
      animFrame: 0,
    },
    {
      id: allocEntityId(state),
      kind: 'ammo',
      x: portalPos.x + 40,
      y: portalPos.y - 20,
      vx: 0,
      vy: 0,
      value: 16,
      ammoType: 'bullet',
      lifeTicks: 300,
      animFrame: 0,
    },
    {
      id: allocEntityId(state),
      kind: 'weapon',
      x: portalPos.x - 35,
      y: portalPos.y + 20,
      vx: 0,
      vy: 0,
      value: 1,
      weaponId: 'shotgun',
      lifeTicks: -1,
      animFrame: 0,
    },
  );

  state.props.push(
    {
      id: allocEntityId(state),
      kind: 'weapon_chest',
      x: portalPos.x - 55,
      y: portalPos.y - 15,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprWeaponChest',
    },
    {
      id: allocEntityId(state),
      kind: 'rad_canister',
      x: portalPos.x + 55,
      y: portalPos.y - 10,
      radius: 8,
      hp: 10,
      maxHp: 10,
      solid: false,
      opened: false,
      hurtFlashTicks: 0,
      sprite: 'sprRadChest',
      radsStored: 12,
    },
  );

  // Also test corpses, casings, particles, and event draining alongside portal steps
  state.corpses.push({
    id: allocEntityId(state),
    x: state.map.spawnX,
    y: state.map.spawnY,
    vx: 4.5,
    vy: -2.0,
    facing: 1,
    sprite: 'sprBanditDead',
    frame: 0,
    baked: false,
    explodable: true,
    size: 12,
  });
  state.casings.push({
    id: allocEntityId(state),
    x: state.map.spawnX,
    y: state.map.spawnY,
    z: 5,
    vx: -2.2,
    vy: 1.5,
    vz: 2.1,
    angle: 0,
    vAngle: 0.4,
    kind: 'shell',
    baked: false,
  });
  state.particles.push({
    id: allocEntityId(state),
    kind: 'smoke',
    x: state.map.spawnX,
    y: state.map.spawnY,
    vx: 0.5,
    vy: -0.5,
    lifeTicks: 8,
    maxLifeTicks: 8,
    size: 3,
    color: '#cccccc',
    alpha: 1,
  });

  const walkableBefore = state.map.walkableCount;
  let carvedAfterTick1 = 0;
  let ticksToCapture = -1;

  for (let tick = 1; tick <= 60; tick++) {
    state.tick = tick;
    stepCorpses(state);
    stepCasings(state);
    stepParticles(state);
    stepPickups(state);
    stepPortal(state);
    if (tick === 1) {
      assert(state.portal.carved, 'Portal must carve on first active tick');
      carvedAfterTick1 = state.map.walkableCount - walkableBefore;
    }
    if (ticksToCapture === -1 && state.portal.entered) {
      ticksToCapture = tick;
    }
    drainEvents(state);
  }

  // Verify corpse baked & retained (explodable), casing baked & removed, particle expired
  assert(state.corpses.length === 1 && state.corpses[0]!.baked, 'Explodable corpse should bake and remain');
  assert(state.casings.length === 0, 'Settled casing should bake into decal and leave active list');
  assert(state.particles.length === 0, 'Particle should expire');
  assert(
    state.decals.some((d) => d.kind === 'corpse') && state.decals.some((d) => d.kind === 'casing'),
    'Baked corpse and casing decals missing',
  );

  return {
    carvedTiles: carvedAfterTick1,
    finalRads: state.player.rads,
    chestSkipStreak: state.chestSkipStreak,
    phase: state.phase,
    portalEntered: state.portal.entered,
    pickupsRemaining: state.pickups.length,
    chestsRemaining: state.props.length,
    hash: hashSimState(state),
    ticksToCapture,
  };
}

function test4_PortalVortexAndPhysics(): string {
  const runA = runPortalScenario(202601);
  const runB = runPortalScenario(202601);

  assert(runA.carvedTiles >= 3, `Portal failed to carve walls: carved ${runA.carvedTiles}`);
  assert(runA.pickupsRemaining === 0, `Portal left ${runA.pickupsRemaining} pickups unvacuumed`);
  assert(runA.chestsRemaining === 0, `Portal left ${runA.chestsRemaining} chests unvacuumed`);
  assert(runA.chestSkipStreak === 1, `Expected chestSkipStreak=1, got ${runA.chestSkipStreak}`);
  assert(runA.finalRads === 5 + 15 + 12, `Expected 32 vacuumed rads, got ${runA.finalRads}`);
  assert(runA.portalEntered, 'Portal did not capture player');
  assert(runA.phase === 'portal_transition', `Expected phase=portal_transition, got ${runA.phase}`);
  assert(runA.hash === runB.hash, `Portal determinism mismatch: ${runA.hash} vs ${runB.hash}`);

  // Also test Plutonium Hunger & Eyes Telekinesis attraction
  const pkState = createFixtureSimState(8888, '1-1', 'desert');
  pkState.player.mutations.push('plutonium_hunger');
  pkState.pickups.push({
    id: allocEntityId(pkState),
    kind: 'rad',
    x: pkState.player.x + 110,
    y: pkState.player.y,
    vx: 0,
    vy: 0,
    value: 1,
    lifeTicks: 200,
    animFrame: 0,
  });
  const startDist = Math.abs(pkState.pickups[0]!.x - pkState.player.x);
  for (let i = 0; i < 10; i++) stepPickups(pkState);
  const endDist = Math.abs(pkState.pickups[0]!.x - pkState.player.x);
  assert(endDist < startDist - 10, `Plutonium Hunger failed to pull rad: ${startDist} -> ${endDist}`);

  // Verify carveCircle preserves outer border
  const borderTest = generateWorldMap('1-1', 'desert', 0, new SeededRng(55));
  const carvedBorder = carveCircle(borderTest, 8, 8, 24, true);
  assert(carvedBorder === 0, `carveCircle breached outer margin: ${carvedBorder}`);
  assert(getTile(borderTest, 0, 0) === TileType.Wall && getTile(borderTest, 1, 1) === TileType.Wall, 'Outer margin damaged');

  // Verify emitEvent/drainEvents
  emitEvent(pkState, { type: 'hitstop', ticks: 2 });
  const ev = drainEvents(pkState);
  assert(ev.length === 1 && ev[0]!.type === 'hitstop', 'emitEvent/drainEvents mismatch');
  assert(drainEvents(pkState).length === 0, 'drainEvents did not clear queue');

  return `PASS (carved ${runA.carvedTiles} wall tiles, vacuumed all pickups/chests, chestSkipStreak=${runA.chestSkipStreak}, rads=${runA.finalRads}, captured player on tick ${runA.ticksToCapture}, hash=${runA.hash})`;
}

function test5_DeterminismAndRng(): string {
  // 1. SeededRng save/restore, fork, shuffle, pick, int, range, chance
  const r1 = new SeededRng(13379001);
  const r2 = new SeededRng(13379001);
  for (let i = 0; i < 100; i++) {
    assert(r1.next() === r2.next(), 'SeededRng.next diverged');
    const a = r1.int(-5, 12);
    const b = r2.int(-5, 12);
    assert(a === b && a >= -5 && a <= 12, 'SeededRng.int out of bounds or diverged');
    const fa = r1.range(-10, 10);
    const fb = r2.range(-10, 10);
    assert(fa === fb && fa >= -10 && fa < 10, 'SeededRng.range out of bounds or diverged');
    assert(r1.chance(0.37) === r2.chance(0.37), 'SeededRng.chance diverged');
  }
  const saved = r1.getState();
  const seqA = [r1.next(), r1.next(), r1.next()];
  r1.setState(saved);
  const seqB = [r1.next(), r1.next(), r1.next()];
  assert(
    seqA[0] === seqB[0] && seqA[1] === seqB[1] && seqA[2] === seqB[2],
    'SeededRng getState/setState replay mismatch',
  );

  const forkA1 = r1.fork('worldgen');
  const forkA2 = r1.fork('worldgen');
  const forkB = r1.fork('enemies');
  assert(forkA1.next() === forkA2.next(), 'fork with identical salt diverged');
  assert(forkA1.next() !== forkB.next(), 'fork with different salts collided');

  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
  const arr2 = [1, 2, 3, 4, 5, 6, 7, 8];
  r1.shuffle(arr1);
  r2.setState(r1.getState());
  const r3 = SeededRng.fromState(saved);
  r3.next();
  r3.next();
  r3.next();
  r3.shuffle(arr2);
  assert(arr1.join(',') === arr2.join(','), 'shuffle determinism mismatch');

  // 2. Identical seeds -> identical map layouts & hashes across areas
  const testAreas: Array<{ code: AreaCode; biome: BiomeId; loop: number }> = [
    { code: '1-1', biome: 'desert', loop: 0 },
    { code: '4-1', biome: 'caves', loop: 1 },
    { code: '7-3', biome: 'palace', loop: 0 },
    { code: '0-1', biome: 'campfire', loop: 1 },
    { code: 'vault', biome: 'vault', loop: 0 },
    { code: '5-?', biome: 'jungle', loop: 2 },
  ];

  const hashes: string[] = [];
  for (const spec of testAreas) {
    const mA = generateWorldMap(spec.code, spec.biome, spec.loop, new SeededRng(987654));
    const mB = generateWorldMap(spec.code, spec.biome, spec.loop, new SeededRng(987654));
    const mC = generateWorldMap(spec.code, spec.biome, spec.loop, new SeededRng(987655));

    const hA = hashWorldMap(mA);
    const hB = hashWorldMap(mB);
    const hC = hashWorldMap(mC);
    assert(hA.length === 16 && /^[0-9a-f]{16}$/.test(hA), `Invalid 64-bit hex hash: ${hA}`);
    assert(hA === hB, `Map hash mismatch for identical seed on ${spec.code}: ${hA} vs ${hB}`);
    if (spec.code !== 'vault') {
      assert(hA !== hC, `Distinct seeds collided on ${spec.code}: ${hA}`);
    }
    hashes.push(`${spec.code}:${hA}`);
  }

  // 3. SimState hash determinism & sensitivity
  const sA = createFixtureSimState(55555, '3-1', 'scrapyard');
  const sB = createFixtureSimState(55555, '3-1', 'scrapyard');
  const shA = hashSimState(sA);
  const shB = hashSimState(sB);
  assert(shA === shB && shA.length === 16, `SimState hash mismatch: ${shA} vs ${shB}`);
  sB.stats.kills += 1;
  assert(hashSimState(sB) !== shA, 'hashSimState failed to detect kills change');

  return `PASS (identical seeds match bit-for-bit across ${testAreas.length} areas & SimState; sample hashes: ${hashes.slice(0, 3).join(', ')})`;
}

function main(): void {
  // Purity guard: guarantee ZERO calls to Math.random() anywhere in simcore
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('FORBIDDEN: Math.random() was called inside pure simcore!');
  };

  try {
    const t0 = Date.now();
    const r1 = test1_WorldgenConnectivity500Seeds();
    const r2 = test2_SweptRayZeroTunneling();
    const r3 = test3_MoveCircleNoEmbedding();
    const r4 = test4_PortalVortexAndPhysics();
    const r5 = test5_DeterminismAndRng();
    const elapsed = Date.now() - t0;

    console.log('=== SIMCORE SELF-TEST SUITE ===');
    console.log(`[1] 500-seed worldgen connectivity: ${r1}`);
    console.log(`[2] sweptRayTile anti-tunneling:    ${r2}`);
    console.log(`[3] moveCircleWithSlide no-embed:   ${r3}`);
    console.log(`[4] Portal vortex & core physics:   ${r4}`);
    console.log(`[5] Seed & hash determinism:        ${r5}`);
    console.log(`ALL 5 CHECKS PASSED in ${elapsed} ms (Math.random purity guard active).`);
  } finally {
    Math.random = originalRandom;
  }
}

main();
