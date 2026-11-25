import { describe, expect, it } from 'vitest';
import {
  TILE_SIZE,
  TileType,
  type AreaCode,
  type BiomeId,
  type SimState,
  type WorldMap,
} from '@/contracts';
import { AREAS, AREA_CODES } from '@/data';
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
} from '@/sim/core';
import { createInitialSimState } from '@/sim/progression';

function verifyWallMask(map: WorldMap): void {
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const idx = ty * map.width + tx;
      const tile = map.tiles[idx] as TileType;
      const mask = map.wallMask[idx]!;
      if (!isSolidTile(tile)) {
        expect(mask).toBe(0);
        continue;
      }
      let expected = 0;
      if (isSolidTile(getTile(map, tx, ty - 1))) expected |= 1;
      if (isSolidTile(getTile(map, tx + 1, ty))) expected |= 2;
      const south = getTile(map, tx, ty + 1);
      if (isSolidTile(south)) expected |= 4;
      else if (ty + 1 < map.height && isWalkableTile(south)) expected |= 16;
      if (isSolidTile(getTile(map, tx - 1, ty))) expected |= 8;
      expect(mask).toBe(expected);
    }
  }
}

describe('simcore: SeededRng', () => {
  it('replays deterministically via seed, getState/setState, fork, and shuffle without Math.random', () => {
    const origRandom = Math.random;
    Math.random = () => {
      throw new Error('Math.random must never be called inside simcore');
    };
    try {
      const r1 = new SeededRng(13379001);
      const r2 = new SeededRng(13379001);
      for (let i = 0; i < 100; i++) {
        expect(r1.next()).toBe(r2.next());
        const a = r1.int(-5, 12);
        const b = r2.int(-5, 12);
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(-5);
        expect(a).toBeLessThanOrEqual(12);
        const fa = r1.range(-10, 10);
        const fb = r2.range(-10, 10);
        expect(fa).toBe(fb);
        expect(fa).toBeGreaterThanOrEqual(-10);
        expect(fa).toBeLessThan(10);
        expect(r1.chance(0.37)).toBe(r2.chance(0.37));
      }

      const saved = r1.getState();
      const seqA = [r1.next(), r1.next(), r1.next()];
      r1.setState(saved);
      const seqB = [r1.next(), r1.next(), r1.next()];
      expect(seqB).toEqual(seqA);

      const forkA1 = r1.fork('worldgen');
      const forkA2 = r1.fork('worldgen');
      const forkB = r1.fork('enemies');
      expect(forkA1.next()).toBe(forkA2.next());
      expect(forkA1.next()).not.toBe(forkB.next());

      const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
      const arr2 = [1, 2, 3, 4, 5, 6, 7, 8];
      const shufRngA = SeededRng.fromState(saved);
      const shufRngB = SeededRng.fromState(saved);
      shufRngA.shuffle(arr1);
      shufRngB.shuffle(arr2);
      expect(arr1).toEqual(arr2);
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('simcore: State & WorldMap FNV-1a Hashing', () => {
  it('produces deterministic 64-bit hex digests sensitive to state changes', () => {
    const mapA = generateWorldMap('3-1', 'scrapyard', 0, new SeededRng(987654));
    const mapB = generateWorldMap('3-1', 'scrapyard', 0, new SeededRng(987654));
    const mapC = generateWorldMap('3-1', 'scrapyard', 0, new SeededRng(987655));

    const hA = hashWorldMap(mapA);
    const hB = hashWorldMap(mapB);
    const hC = hashWorldMap(mapC);
    expect(hA).toMatch(/^[0-9a-f]{16}$/);
    expect(hA).toBe(hB);
    expect(hA).not.toBe(hC);

    const sA = createInitialSimState({ mutant: 'fish', seed: 55555 });
    const sB = createInitialSimState({ mutant: 'fish', seed: 55555 });
    const shA = hashSimState(sA);
    expect(shA).toMatch(/^[0-9a-f]{16}$/);
    expect(hashSimState(sB)).toBe(shA);

    sB.stats.kills += 1;
    expect(hashSimState(sB)).not.toBe(shA);
  });
});

describe('simcore: Swept Collision Anti-Tunneling & LOS', () => {
  it('never tunnels through 1-tile walls at 40..120 px/tick for point and circle rays', () => {
    const map = generateWorldMap('1-1', 'desert', 0, new SeededRng(99));
    for (let ty = 10; ty <= 20; ty++) {
      for (let tx = 10; tx <= 20; tx++) {
        setTile(map, tx, ty, tx === 15 ? TileType.Wall : TileType.Floor);
      }
    }

    const start = tileToWorldCenter(13, 15, TILE_SIZE);
    for (const speed of [40, 60, 80, 120]) {
      const hit0 = sweptRayTile(map, start.x, start.y, start.x + speed, start.y, 0);
      expect(hit0.hit).toBe(true);
      expect(hit0.tileX).toBe(15);
      expect(hit0.tileY).toBe(15);
      expect(hit0.normalX).toBe(-1);
      expect(hit0.normalY).toBe(0);
      expect(Math.abs(hit0.hitX - 15 * TILE_SIZE)).toBeLessThan(1e-6);

      const hitR = sweptRayTile(map, start.x, start.y, start.x + speed, start.y, 4);
      expect(hitR.hit).toBe(true);
      expect(hitR.tileX).toBe(15);
      expect(Math.abs(hitR.hitX - (15 * TILE_SIZE - 4))).toBeLessThan(1e-6);
      expect(hitR.normalX).toBe(-1);
    }

    expect(
      hasLineOfSight(
        map,
        tileToWorldCenter(12, 12).x,
        tileToWorldCenter(12, 12).y,
        tileToWorldCenter(14, 14).x,
        tileToWorldCenter(14, 14).y,
      ),
    ).toBe(true);
    expect(
      hasLineOfSight(
        map,
        tileToWorldCenter(13, 15).x,
        tileToWorldCenter(13, 15).y,
        tileToWorldCenter(17, 15).x,
        tileToWorldCenter(17, 15).y,
      ),
    ).toBe(false);

    const seg = segmentCircleHit(0, 0, 100, 0, 50, 3, 5);
    expect(seg.hit).toBe(true);
    expect(Math.abs(seg.hitX - 46)).toBeLessThan(1e-6);
    expect(circleOverlap(0, 0, 5, 8, 0, 4)).toBe(true);
    expect(circleOverlap(0, 0, 5, 10, 0, 4)).toBe(false);
  });

  it('matches dense reference ray marching with zero tunneling across 300 random high-speed rays', () => {
    const rng = new SeededRng(424242);
    const map = generateWorldMap('3-2', 'scrapyard', 0, rng);
    const floorCenters: Array<{ x: number; y: number }> = [];
    for (let ty = 2; ty < map.height - 2; ty++) {
      for (let tx = 2; tx < map.width - 2; tx++) {
        if (isWalkableTile(getTile(map, tx, ty))) {
          floorCenters.push(tileToWorldCenter(tx, ty, map.tileSize));
        }
      }
    }

    for (let i = 0; i < 300; i++) {
      const origin = rng.pick(floorCenters);
      const ox = origin.x + rng.range(-4, 4);
      const oy = origin.y + rng.range(-4, 4);
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(40, 80);
      const x1 = ox + Math.cos(angle) * speed;
      const y1 = oy + Math.sin(angle) * speed;
      const radius = i % 2 === 0 ? 0 : rng.range(1.5, 4.0);

      const hit = sweptRayTile(map, ox, oy, x1, y1, radius);
      const samples = Math.ceil(speed / 0.25);
      let refHitT = -1;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const sx = ox + (x1 - ox) * t;
        const sy = oy + (y1 - oy) * t;
        const blocked =
          radius <= 0
            ? isWorldSolid(map, sx, sy)
            : isCircleOverlappingSolid(map, sx, sy, radius - 0.05);
        if (blocked) {
          refHitT = t;
          break;
        }
      }

      if (refHitT >= 0) {
        expect(hit.hit).toBe(true);
        expect(hit.t).toBeLessThanOrEqual(refHitT + 0.02);
      } else if (!hit.hit) {
        expect(isWorldSolid(map, x1, y1)).toBe(false);
      }
    }
  });
});

describe('simcore: Slide Collision & Wall Carving', () => {
  it('slides cleanly along walls without embedding across 500 high-speed moves', () => {
    const rng = new SeededRng(777333);
    const map = generateWorldMap('2-1', 'sewers', 0, rng);
    const radius = 6;
    const boxes: SolidBox[] = [
      { x: map.spawnX + 48, y: map.spawnY - 8, w: 12, h: 12 },
      { x: map.spawnX - 54, y: map.spawnY + 12, w: 14, h: 14 },
    ];

    let x = map.spawnX;
    let y = map.spawnY;
    for (let step = 0; step < 500; step++) {
      const speed = step % 7 === 0 ? rng.range(12, 30) : rng.range(2, 8);
      const angle = rng.range(0, Math.PI * 2);
      const res = moveCircleWithSlide(map, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, radius, boxes);
      x = res.x;
      y = res.y;
      expect(isCircleOverlappingSolid(map, x, y, radius, boxes)).toBe(false);
      expect(isWorldSolid(map, x, y)).toBe(false);
    }

    // Diagonal slide against vertical east wall preserves full Y travel
    const room = generateWorldMap('1-1', 'desert', 0, new SeededRng(1234));
    for (let ty = 10; ty <= 16; ty++) {
      for (let tx = 10; tx <= 16; tx++) {
        setTile(room, tx, ty, tx === 15 ? TileType.Wall : TileType.Floor);
      }
    }
    const startX = 15 * TILE_SIZE - radius - 1;
    const startY = 12.5 * TILE_SIZE;
    const slide = moveCircleWithSlide(room, startX, startY, 5, 6, radius);
    expect(slide.hitX).toBe(true);
    expect(slide.hitY).toBe(false);
    expect(Math.abs(slide.y - (startY + 6))).toBeLessThan(1e-5);
    expect(isCircleOverlappingSolid(room, slide.x, slide.y, radius)).toBe(false);

    // carveCircle preserves outer border & updates wallMask
    const carvedBorder = carveCircle(room, 8, 8, 24, true);
    expect(carvedBorder).toBe(0);
    expect(getTile(room, 0, 0)).toBe(TileType.Wall);

    const nearest = findNearestFloor(map, 8, 8, 40);
    expect(isWorldSolid(map, nearest.x, nearest.y)).toBe(false);
  });
});

describe('simcore: 100-Seed Worldgen Connectivity Across All Biomes', () => {
  it('guarantees 100% BFS connectivity, 3x3 spawn plaza, 2-tile outer wall margin, and 7-3 layout', () => {
    for (let i = 0; i < 100; i++) {
      const code: AreaCode = AREA_CODES[i % AREA_CODES.length]!;
      const biome: BiomeId = AREAS[code].biome;
      const loop = i % 3;
      const seed = 10001 + i * 7919;
      const map = generateWorldMap(code, biome, loop, new SeededRng(seed));

      const conn = checkMapConnectivity(map);
      expect(conn.connected).toBe(true);
      expect(conn.reachable).toBe(conn.totalWalkable);
      expect(conn.totalWalkable).toBe(map.walkableCount);

      expect(isWorldSolid(map, map.spawnX, map.spawnY)).toBe(false);
      const { tx: stx, ty: sty } = worldToTile(map.spawnX, map.spawnY, map.tileSize);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(isWalkableTile(getTile(map, stx + dx, sty + dy))).toBe(true);
        }
      }

      // 2-tile solid outer margin
      for (let tx = 0; tx < map.width; tx++) {
        expect(getTile(map, tx, 0)).toBe(TileType.Wall);
        expect(getTile(map, tx, 1)).toBe(TileType.Wall);
        expect(getTile(map, tx, map.height - 1)).toBe(TileType.Wall);
        expect(getTile(map, tx, map.height - 2)).toBe(TileType.Wall);
      }
      for (let ty = 0; ty < map.height; ty++) {
        expect(getTile(map, 0, ty)).toBe(TileType.Wall);
        expect(getTile(map, 1, ty)).toBe(TileType.Wall);
        expect(getTile(map, map.width - 1, ty)).toBe(TileType.Wall);
        expect(getTile(map, map.width - 2, ty)).toBe(TileType.Wall);
      }

      if (i < 25 || code === '7-3') {
        verifyWallMask(map);
      }

      if (code === '7-3') {
        const cx = Math.floor(map.width / 2);
        expect(getTile(map, cx, 25)).toBe(TileType.Carpet);
        expect(isWalkableTile(getTile(map, cx - 15, 19))).toBe(true);
        expect(isWalkableTile(getTile(map, cx + 15, 19))).toBe(true);
        expect(isWalkableTile(getTile(map, cx - 15, 31))).toBe(true);
        expect(isWalkableTile(getTile(map, cx + 15, 31))).toBe(true);
      }
    }
  });
});

describe('simcore: Portal Vortex & World Physics', () => {
  it('carves safe radius, vacuums pickups/chests, increments chestSkipStreak, and captures player', () => {
    const state: SimState = createInitialSimState({ mutant: 'fish', seed: 202601 });
    state.pickups = [];
    state.props = [];

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
    state.player.x = portalPos.x;
    state.player.y = portalPos.y + 42;

    state.pickups.push(
      {
        id: allocEntityId(state),
        kind: 'rad',
        x: portalPos.x - 45,
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
        x: portalPos.x + 50,
        y: portalPos.y,
        vx: 0,
        vy: 0,
        value: 15,
        lifeTicks: 300,
        animFrame: 0,
      },
    );
    state.props.push(
      {
        id: allocEntityId(state),
        kind: 'weapon_chest',
        x: portalPos.x - 48,
        y: portalPos.y - 12,
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
        x: portalPos.x + 48,
        y: portalPos.y - 12,
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
    state.corpses.push({
      id: allocEntityId(state),
      x: state.map.spawnX,
      y: state.map.spawnY,
      vx: 4,
      vy: -2,
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
      z: 4,
      vx: -2,
      vy: 1,
      vz: 2,
      angle: 0,
      vAngle: 0.3,
      kind: 'shell',
      baked: false,
    });
    state.particles.push({
      id: allocEntityId(state),
      kind: 'smoke',
      x: state.map.spawnX,
      y: state.map.spawnY,
      vx: 0.4,
      vy: -0.4,
      lifeTicks: 6,
      maxLifeTicks: 6,
      size: 3,
      color: '#ccc',
      alpha: 1,
    });

    const walkableBefore = state.map.walkableCount;
    for (let tick = 1; tick <= 60; tick++) {
      state.tick = tick;
      stepCorpses(state);
      stepCasings(state);
      stepParticles(state);
      stepPickups(state);
      stepPortal(state);
      drainEvents(state);
    }

    expect(state.portal.carved).toBe(true);
    expect(state.map.walkableCount - walkableBefore).toBeGreaterThanOrEqual(3);
    expect(state.pickups.length).toBe(0);
    expect(state.props.length).toBe(0);
    expect(state.chestSkipStreak).toBe(1);
    expect(state.player.rads).toBe(5 + 15 + 12);
    expect(state.portal.entered).toBe(true);
    expect(state.phase).toBe('portal_transition');
    expect(state.corpses[0]?.baked).toBe(true);
    expect(state.casings.length).toBe(0);
    expect(state.particles.length).toBe(0);

    emitEvent(state, { type: 'hitstop', ticks: 2 });
    expect(drainEvents(state).length).toBe(1);
    expect(drainEvents(state).length).toBe(0);
  });

  it('carves tucked-in safe spawn coves with adjacent solid cover walls across procedural biomes', () => {
    const biomes: AreaCode[] = ['1-1', '1-2', '2-1', '3-1', '4-1', '5-1', '6-1', '7-1'];
    for (let i = 0; i < 40; i++) {
      const code = biomes[i % biomes.length]!;
      const map = generateWorldMap(code, AREAS[code].biome, 0, new SeededRng(4100 + i * 37));
      const { tx: stx, ty: sty } = worldToTile(map.spawnX, map.spawnY, map.tileSize);

      // Perimeter ring around the 3x3 spawn cove (Chebyshev distance = 2) must contain solid rock cover
      let solidCoverTiles = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) !== 2 && Math.abs(dy) !== 2) continue;
          if (isSolidTile(getTile(map, stx + dx, sty + dy))) {
            solidCoverTiles += 1;
          }
        }
      }
      expect(solidCoverTiles).toBeGreaterThanOrEqual(8);
    }
  });

  it('emits blood skid trails and corpse_impact events when flying corpses slam into walls', () => {
    const state: SimState = createInitialSimState({ mutant: 'fish', seed: 202699 });
    state.enemies = [];
    state.corpses = [];
    const { tx: stx, ty: sty } = worldToTile(state.map.spawnX, state.map.spawnY, TILE_SIZE);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        setTile(state.map, stx + dx, sty + dy, dx === 3 ? TileType.Wall : TileType.Floor);
      }
    }
    const wallCorpsePos = tileToWorldCenter(stx + 1, sty, TILE_SIZE);
    state.corpses.push({
      id: allocEntityId(state),
      x: wallCorpsePos.x,
      y: wallCorpsePos.y,
      vx: 11,
      vy: 0,
      facing: 1,
      sprite: 'sprBanditDead',
      frame: 0,
      baked: false,
      explodable: true,
      size: 12,
    });
    drainEvents(state);

    let sawWallImpact = false;
    let sawBloodTrail = false;
    for (let t = 1; t <= 35; t++) {
      state.tick = t;
      stepCorpses(state);
      const evs = drainEvents(state);
      if (evs.some((e) => e.type === 'corpse_impact' && e.speed > 3)) sawWallImpact = true;
      if (evs.some((e) => e.type === 'decal' && e.decal.kind === 'blood')) sawBloodTrail = true;
    }

    expect(sawWallImpact).toBe(true);
    expect(sawBloodTrail).toBe(true);
    expect(state.corpses[0]?.baked).toBe(true);
  });
});
