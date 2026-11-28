import { describe, expect, it } from 'vitest';
import {
  TileType,
  type EnemyEntity,
  type PickupEntity,
  type ProjectileEntity,
  type PropEntity,
  type RenderSettings,
  type SimState,
  type SpriteDef,
  type WorldMap,
} from '@/contracts';
import { createFallbackBundle, type AssetBundle } from '@/assets';
import {
  BIOME_ROOF_COLORS,
  FloorBuffer,
  STEAM_BIOME_ROOF_COLORS,
  computeSlabSubRect,
  getBiomeRoofColor,
} from '@/render/floor-buffer';
import { LightingPass } from '@/render/lighting';
import {
  BIOME_TOP_DECAL_SPRITES,
  GameRenderer,
  resolveBiomeTopDecalSprite,
  resolveLaserColor,
} from '@/render/renderer';

interface RecordedDrawCall {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  alpha: number;
}

function createTrackingCtx() {
  const fillRects: Array<{ x: number; y: number; w: number; h: number; style: string; alpha: number }> = [];
  const fillTexts: string[] = [];
  const drawCalls: RecordedDrawCall[] = [];
  let curFill = '#000000';
  let curAlpha = 1;
  const stack: Array<{ fill: string; alpha: number }> = [];
  const noop = (): void => {};
  const grad = { addColorStop: noop };

  const mock = {
    imageSmoothingEnabled: false,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000000',
    font: '8px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    get globalAlpha(): number {
      return curAlpha;
    },
    set globalAlpha(v: number) {
      curAlpha = v;
    },
    get fillStyle(): string {
      return curFill;
    },
    set fillStyle(v: string | object) {
      if (typeof v === 'string') curFill = v;
    },
    save: () => {
      stack.push({ fill: curFill, alpha: curAlpha });
    },
    restore: () => {
      const top = stack.pop();
      if (top) {
        curFill = top.fill;
        curAlpha = top.alpha;
      }
    },
    setTransform: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    strokeRect: noop,
    setLineDash: noop,
    clearRect: noop,
    clip: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    drawImage: (...args: unknown[]) => {
      if (args.length >= 9) {
        drawCalls.push({
          sx: Number(args[1]),
          sy: Number(args[2]),
          sw: Number(args[3]),
          sh: Number(args[4]),
          dx: Number(args[5]),
          dy: Number(args[6]),
          dw: Number(args[7]),
          dh: Number(args[8]),
          alpha: curAlpha,
        });
      } else {
        drawCalls.push({
          sx: 0,
          sy: 0,
          sw: Number(args[3] ?? 0),
          sh: Number(args[4] ?? 0),
          dx: Number(args[1] ?? 0),
          dy: Number(args[2] ?? 0),
          dw: Number(args[3] ?? 0),
          dh: Number(args[4] ?? 0),
          alpha: curAlpha,
        });
      }
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, style: curFill, alpha: curAlpha });
    },
    fillText: (text: string) => {
      fillTexts.push(text);
    },
  };

  return {
    ctx: mock as unknown as CanvasRenderingContext2D,
    fillRects,
    fillTexts,
    drawCalls,
  };
}

const FAKE_TEXTURE = {} as unknown as HTMLCanvasElement;

function createRenderableBundle(sourceMode: 'fallback' | 'steam' = 'fallback'): AssetBundle {
  const base = createFallbackBundle();
  return {
    ...base,
    sourceMode,
    getTexture: () => FAKE_TEXTURE,
  };
}

function makeMap(overrides: Partial<WorldMap> = {}): WorldMap {
  const width = overrides.width ?? 20;
  const height = overrides.height ?? 16;
  const tiles = new Uint8Array(width * height);
  const wallMask = new Uint8Array(width * height);
  const floorVariants = new Uint8Array(width * height);
  let walkableCount = 0;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      tiles[y * width + x] = TileType.Floor;
      walkableCount += 1;
    }
  }
  return {
    width,
    height,
    tileSize: 16,
    tiles,
    floorVariants,
    wallMask,
    spawnX: 160,
    spawnY: 128,
    biome: 'desert',
    areaCode: '1-1',
    loop: 0,
    darkness: 0,
    walkableCount,
    ...overrides,
  };
}

function makeState(overrides: Partial<SimState> = {}): SimState {
  const map = overrides.map ?? makeMap({ biome: overrides.biome ?? 'desert', areaCode: overrides.areaCode ?? '1-1' });
  return {
    tick: 120,
    seed: 1337,
    rngState: 1337,
    phase: 'playing',
    areaCode: map.areaCode,
    biome: map.biome,
    loop: 0,
    crown: 'none',
    map,
    player: {
      id: 1,
      mutant: 'fish',
      skin: 'a',
      x: 160,
      y: 128,
      prevX: 160,
      prevY: 128,
      vx: 0,
      vy: 0,
      radius: 6,
      aimAngle: 0,
      facing: 1,
      hp: 8,
      maxHp: 8,
      iframes: 0,
      hurtFlashTicks: 0,
      rads: 30,
      level: 1,
      radsToNextLevel: 60,
      mutations: [],
      ultra: null,
      strongSpiritReady: false,
      strongSpiritRecharging: false,
      ammo: { melee: 0, bullet: 48, shell: 16, bolt: 0, explosive: 0, energy: 20 },
      ammoMax: { melee: 0, bullet: 255, shell: 55, bolt: 55, explosive: 55, energy: 55 },
      weapons: [
        { weaponId: 'laser_pistol', reloadTicks: 0, maxReloadTicks: 10, burstRemaining: 0, burstTimer: 0, kickOffset: 0, cursed: false },
        null,
      ],
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
      portalStrikes: 3,
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
    particles: [],
    decals: [],
    portal: {
      active: false,
      x: 200,
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
    pendingLevelUps: 0,
    chestSkipStreak: 0,
    generatorsRemaining: 0,
    idpdHeat: 0,
    levelStartEnemyCount: 8,
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
    nextEntityId: 100,
    portalTransitionTicks: 0,
    floorClearTrigger: false,
    ...overrides,
  };
}

const RENDER_SETTINGS: RenderSettings = {
  widescreen: false,
  targetFps: 60,
  classic30Fps: false,
  screenShakeScale: 1,
  crosshairStyle: 0,
  showFps: false,
  pixelSnap: true,
};

function makeEnemy(partial: Partial<EnemyEntity> & { id: number; defId: string }): EnemyEntity {
  return {
    x: 180,
    y: 128,
    prevX: 180,
    prevY: 128,
    vx: 0,
    vy: 0,
    radius: 10,
    hp: 20,
    maxHp: 20,
    facing: 1,
    aimAngle: 0,
    hurtFlashTicks: 0,
    snaredTicks: 0,
    aiState: 'idle',
    aiTimer: 0,
    aiPhase: 0,
    attackCooldown: 0,
    targetX: 160,
    targetY: 128,
    animFrame: 0,
    contactDamage: 2,
    radDrop: 4,
    ...partial,
  };
}

function makeProp(partial: Partial<PropEntity> & { id: number; kind: PropEntity['kind'] }): PropEntity {
  return {
    x: 180,
    y: 128,
    radius: 10,
    hp: 10,
    maxHp: 10,
    solid: true,
    opened: false,
    hurtFlashTicks: 0,
    sprite: '',
    ...partial,
  };
}

function makeLaserProj(partial: Partial<ProjectileEntity>): ProjectileEntity {
  return {
    id: 500,
    kind: 'laser',
    team: 'player',
    x: 220,
    y: 128,
    prevX: 160,
    prevY: 128,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 3,
    damage: 8,
    lifeTicks: 10,
    maxLifeTicks: 12,
    pierce: 3,
    bounce: 0,
    explosionRadius: 0,
    sprite: 'sprLaser',
    hitIds: [],
    beamOriginX: 160,
    beamOriginY: 128,
    ...partial,
  };
}

describe('wiki-render-fixes: Bug #2 Laser Color Dispatch', () => {
  it('resolves exact beam colors for red default, cyan Ion Cannon, neon-green Ultra, pink enemy, and purple Cursed Caves enemy lasers', () => {
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'laser_pistol' })).toBe('#ff3838');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'laser_rifle' })).toBe('#ff3838');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'laser_minigun' })).toBe('#ff3838');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'laser_cannon' })).toBe('#ff3838');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'energy_sword' })).toBe('#ff3838');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'ion_cannon' })).toBe('#38e4ff');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'ultra_laser_pistol' })).toBe('#38d848');
    expect(resolveLaserColor({ kind: 'laser', team: 'player', weaponId: 'laser_pistol', isUltra: true })).toBe('#38d848');
    expect(resolveLaserColor({ kind: 'enemy_laser', team: 'enemy', biome: 'caves', areaCode: '4-1' })).toBe('#ff3ec8');
    expect(resolveLaserColor({ kind: 'enemy_laser', team: 'enemy', biome: 'cursed_caves', areaCode: '4-?' })).toBe('#b838ff');
    expect(
      resolveLaserColor({
        kind: 'enemy_laser',
        team: 'enemy',
        sourceCause: 'Cursed Laser Crystal',
        biome: 'caves',
      }),
    ).toBe('#b838ff');
    expect(
      resolveLaserColor({
        kind: 'enemy_laser',
        team: 'enemy',
        sourceSprite: 'sprInvLaserCrystalFire',
      }),
    ).toBe('#b838ff');
  });

  it('paints distinct outer beam colors in GameRenderer.renderWorld instead of hardcoded #38d848', () => {
    const bundle = createFallbackBundle();
    const cases: Array<{ label: string; proj: ProjectileEntity; biome?: SimState['biome']; areaCode?: SimState['areaCode']; expected: string }> = [
      { label: 'default red laser', proj: makeLaserProj({ weaponId: 'laser_pistol' }), expected: '#ff3838' },
      { label: 'cyan ion cannon', proj: makeLaserProj({ weaponId: 'ion_cannon' }), expected: '#38e4ff' },
      { label: 'ultra green laser', proj: makeLaserProj({ weaponId: 'ultra_laser_pistol', isUltra: true }), expected: '#38d848' },
      { label: 'pink enemy laser', proj: makeLaserProj({ kind: 'enemy_laser', team: 'enemy' }), biome: 'caves', areaCode: '4-1', expected: '#ff3ec8' },
      { label: 'purple cursed enemy laser', proj: makeLaserProj({ kind: 'enemy_laser', team: 'enemy' }), biome: 'cursed_caves', areaCode: '4-?', expected: '#b838ff' },
    ];

    for (const tc of cases) {
      const renderer = new GameRenderer(bundle);
      const state = makeState({
        biome: tc.biome ?? 'desert',
        areaCode: tc.areaCode ?? '1-1',
        projectiles: [tc.proj],
      });
      const mock = createTrackingCtx();
      renderer.renderWorld(mock.ctx, state, RENDER_SETTINGS, 1);
      expect(
        mock.fillRects.some((r) => r.style.toLowerCase() === tc.expected),
        `${tc.label} should paint outer beam with ${tc.expected}`,
      ).toBe(true);
    }
  });
});

describe('wiki-render-fixes: Bugs #9, #10 & #17a FloorBuffer Roofs, sprFloor1B Offset & Pizza Sewers', () => {
  it('uses warm amber roof color for Steam cursed_caves (Bug #9) and proper crib roof colors', () => {
    expect(STEAM_BIOME_ROOF_COLORS.cursed_caves).toBe('#c8781e');
    expect(STEAM_BIOME_ROOF_COLORS.cursed_caves).not.toBe('#6a3ca8');
    expect(getBiomeRoofColor('cursed_caves', true)).toBe('#c8781e');
    expect(BIOME_ROOF_COLORS.cursed_caves).toBe('#643a98');
    expect(BIOME_ROOF_COLORS.crib).toBe('#64406e');
    expect(STEAM_BIOME_ROOF_COLORS.crib).toBe('#84786a');
    expect(getBiomeRoofColor('crib', false)).toBe('#64406e');
    expect(getBiomeRoofColor('crib', true)).toBe('#84786a');
  });

  it('offsets sprFloor1B 36x36 orig=(2,2) quadrants into the centered 32x32 core (Bug #10)', () => {
    const steamFloor1B: SpriteDef = {
      id: 1,
      name: 'sprFloor1B',
      width: 36,
      height: 36,
      originX: 2,
      originY: 2,
      bboxLeft: 0,
      bboxRight: 35,
      bboxTop: 0,
      bboxBottom: 35,
      bboxMode: 0,
      sepMasks: 0,
      playbackSpeed: 1,
      playbackSpeedType: 0,
      frames: [
        {
          srcX: 100,
          srcY: 200,
          srcW: 36,
          srcH: 36,
          targetX: 0,
          targetY: 0,
          targetW: 36,
          targetH: 36,
          boundW: 36,
          boundH: 36,
          textureId: 0,
        },
      ],
    };

    expect(computeSlabSubRect(steamFloor1B, 0, 0, 0, 16)).toEqual({ subX: 2, subY: 2 });
    expect(computeSlabSubRect(steamFloor1B, 0, 1, 0, 16)).toEqual({ subX: 18, subY: 2 });
    expect(computeSlabSubRect(steamFloor1B, 0, 0, 1, 16)).toEqual({ subX: 2, subY: 18 });
    expect(computeSlabSubRect(steamFloor1B, 0, 1, 1, 16)).toEqual({ subX: 18, subY: 18 });

    // Standard 32x32 slab with origin=(0,0) keeps exact (0,16) quadrants
    const normalSlab: SpriteDef = {
      ...steamFloor1B,
      name: 'sprFloor1',
      width: 32,
      height: 32,
      originX: 0,
      originY: 0,
      frames: [{ ...steamFloor1B.frames[0]!, srcW: 32, srcH: 32, targetW: 32, targetH: 32, boundW: 32, boundH: 32 }],
    };
    expect(computeSlabSubRect(normalSlab, 0, 0, 0, 16)).toEqual({ subX: 0, subY: 0 });
    expect(computeSlabSubRect(normalSlab, 0, 1, 1, 16)).toEqual({ subX: 16, subY: 16 });
  });

  it('softens Steam Pizza Sewers sprFloor102B with reduced frequency & alpha blend (Bug #17a)', () => {
    const baseBundle = createFallbackBundle();
    const fakeTex = {} as unknown as HTMLCanvasElement;
    const steamBundle: AssetBundle = {
      ...baseBundle,
      sourceMode: 'steam',
      getTexture: () => fakeTex,
    };

    const floorBuf = new FloorBuffer(steamBundle);
    const tracking = createTrackingCtx();
    // Inject tracking ctx so we can inspect drawImage alpha calls during rebuild
    (floorBuf as unknown as { canvas: unknown; ctx: unknown }).canvas = {
      width: 24 * 16,
      height: 24 * 16,
      getContext: () => tracking.ctx,
    };
    (floorBuf as unknown as { ctx: unknown }).ctx = tracking.ctx;

    const pizzaMap = makeMap({ width: 24, height: 24, biome: 'pizza_sewers', areaCode: '2-?' });
    floorBuf.rebuild(pizzaMap);

    // Softened Steam sprFloor102B draws with globalAlpha === 0.42 (never harsh 1.0 neon blocks!)
    const softenedDraws = tracking.drawCalls.filter((d) => Math.abs(d.alpha - 0.42) < 1e-3 && d.dw === 16 && d.dh === 16);
    expect(softenedDraws.length).toBeGreaterThan(0);
    // And total alt-slab tiles are strictly sparser than the old 1/7 (~14%) rate
    const totalFloorTiles = pizzaMap.walkableCount;
    expect(softenedDraws.length).toBeLessThan(totalFloorTiles * 0.11);
  });
});

describe('wiki-render-fixes: Bug #18 Plant Sapling 32px Light & New Dynamic Light Halos', () => {
  it('gives plant_sapling a 32px light radius (distinct from Rebel Ally 54px) and illuminates all new glowing props/pickups/enemies', () => {
    const lighting = new LightingPass();
    const props: PropEntity[] = [
      makeProp({ id: 10, kind: 'torch', x: 40, y: 40, sprite: 'sprTorch' }),
      makeProp({ id: 11, kind: 'chandelier', x: 60, y: 40, sprite: 'sprChandelier' }),
      makeProp({ id: 12, kind: 'necro_revive_area', x: 80, y: 40, sprite: 'sprReviveArea' }),
      makeProp({ id: 13, kind: 'frog_egg', x: 100, y: 40, sprite: 'sprFrogEgg' }),
      makeProp({ id: 14, kind: 'fire_trap', x: 120, y: 40, sprite: 'sprTrap' }),
      makeProp({ id: 15, kind: 'small_generator', x: 140, y: 40, sprite: 'sprSmallGenerator' }),
      makeProp({ id: 16, kind: 'big_tv', x: 160, y: 40, sprite: 'sprBigTVOn' }),
      makeProp({ id: 17, kind: 'venuz_tv', x: 180, y: 40, sprite: 'sprVenuzTV' }),
      makeProp({ id: 18, kind: 'rad_maggot_canister', x: 200, y: 40, sprite: 'sprRadChestMaggot' }),
      makeProp({ id: 19, kind: 'giant_weapon_chest', x: 220, y: 40, sprite: 'sprGiantWepChest' }),
      makeProp({ id: 20, kind: 'giant_ammo_chest', x: 240, y: 40, sprite: 'sprGiantAmmoChest' }),
    ];
    const pickups: PickupEntity[] = [
      { id: 30, kind: 'cursed_ammo', x: 260, y: 40, vx: 0, vy: 0, value: 12, lifeTicks: 40, animFrame: 0 },
    ];
    const enemies: EnemyEntity[] = [
      makeEnemy({ id: 40, defId: 'plant_sapling', friendly: true, x: 50, y: 100 }),
      makeEnemy({ id: 41, defId: 'rebel_ally', friendly: true, x: 90, y: 100 }),
      makeEnemy({ id: 42, defId: 'hyper_crystal', bossId: 'hyper_crystal', isBoss: true, x: 130, y: 100 }),
      makeEnemy({ id: 43, defId: 'captain', bossId: 'captain', isBoss: true, x: 170, y: 100 }),
      makeEnemy({ id: 44, defId: 'enemy_horror', x: 210, y: 100 }),
    ];

    const state = makeState({
      biome: 'labs',
      areaCode: '6-1',
      props,
      pickups,
      enemies,
    });

    const lights = lighting.collectLights(state, state.player.x, state.player.y, 1);

    const saplingLight = lights.find((l) => l.x === 50 && l.y === 100);
    const allyLight = lights.find((l) => l.x === 90 && l.y === 100);
    expect(saplingLight?.radius).toBe(32);
    expect(saplingLight?.innerRadius).toBe(14);
    expect(allyLight?.radius).toBe(54);

    // Every new glowing prop, pickup, and boss/enemy has an active dynamic light halo
    for (const expectedX of [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 130, 170, 210]) {
      const match = lights.find((l) => Math.abs(l.x - expectedX) < 1);
      expect(match, `expected dynamic light at x=${expectedX}`).toBeDefined();
      expect(match!.radius).toBeGreaterThanOrEqual(26);
    }
  });
});

describe('wiki-render-fixes: Bug #15a Dead Portal Card Removal, Crib/HQ Setpieces, Floor FX & B-Skin VFX', () => {
  it('eliminates the dead legacy WARPING TO portal loading card during ticksIn >= 7 (Bug #15a)', () => {
    const bundle = createFallbackBundle();
    const renderer = new GameRenderer(bundle);
    const state = makeState({
      portal: {
        active: true,
        x: 160,
        y: 128,
        radius: 18,
        timer: 0,
        targetArea: '1-2',
        nextLoop: 0,
        entered: true,
        enterTicks: 12,
        carved: true,
      },
      portalTransitionTicks: 12,
    });
    const mock = createTrackingCtx();
    renderer.renderWorld(mock.ctx, state, RENDER_SETTINGS, 1);

    // Must NOT draw the old #0a0712 full-screen loading card or "WARPING TO" text
    const drewLegacyDarkCard = mock.fillRects.some(
      (r) => r.style.toLowerCase() === '#0a0712' && r.w >= 300 && r.h >= 200,
    );
    expect(drewLegacyDarkCard).toBe(false);
    expect(mock.fillTexts.some((t) => t.toUpperCase().includes('WARPING TO'))).toBe(false);
  });

  it('renders Y.V. Crib ($$$) biome with sprVenuzCarpet under setpiece props and HQ-3 setpieces cleanly', () => {
    const bundle = createRenderableBundle();
    const renderer = new GameRenderer(bundle);

    const cribMap = makeMap({ width: 22, height: 18, biome: 'crib', areaCode: '$$$' });
    for (let y = 7; y <= 10; y++) {
      for (let x = 6; x <= 15; x++) {
        cribMap.tiles[y * cribMap.width + x] = TileType.Carpet;
      }
    }

    const cribState = makeState({
      biome: 'crib',
      areaCode: '$$$',
      map: cribMap,
      props: [
        makeProp({ id: 1, kind: 'venuz_tv', x: 176, y: 76, radius: 40, sprite: 'sprVenuzTV' }),
        makeProp({ id: 2, kind: 'venuz_couch', x: 176, y: 132, radius: 32, sprite: 'sprVenuzCouch' }),
        makeProp({ id: 3, kind: 'yung_cuz', x: 176, y: 132, radius: 10, sprite: 'sprCuzIdle' }),
        makeProp({ id: 4, kind: 'giant_weapon_chest', x: 112, y: 128, radius: 22, sprite: 'sprGiantWepChest' }),
        makeProp({ id: 5, kind: 'giant_ammo_chest', x: 240, y: 128, radius: 22, sprite: 'sprGiantAmmoChest' }),
        makeProp({ id: 6, kind: 'venuz_car_exit', x: 176, y: 56, radius: 14, sprite: 'sprVenuzCar2' }),
      ],
    });
    const cribMock = createTrackingCtx();
    renderer.getCamera().snapTo(176, 112);
    renderer.renderWorld(cribMock.ctx, cribState, RENDER_SETTINGS, 1);

    // sprVenuzCarpet (164x68) must draw BEFORE large setpiece props (sprVenuzTV 240x96, sprVenuzCouch 98x48, sprGiantWepChest 64x64)
    const carpetIdx = cribMock.drawCalls.findIndex((c) => c.dw === 164 && c.dh === 68);
    const couchIdx = cribMock.drawCalls.findIndex((c) => c.dw === 98 && c.dh === 48);
    const cuzIdx = cribMock.drawCalls.findIndex((c) => c.dw === 32 && c.dh === 32 && c.dy > 100);
    const tvIdx = cribMock.drawCalls.findIndex((c) => c.dw === 240 && c.dh === 96);
    const giantChestCalls = cribMock.drawCalls.filter((c) => c.dw === 64 && c.dh === 64);
    expect(carpetIdx).toBeGreaterThanOrEqual(0);
    expect(tvIdx).toBeGreaterThan(carpetIdx);
    expect(couchIdx).toBeGreaterThan(carpetIdx);
    expect(cuzIdx).toBeGreaterThan(couchIdx);
    expect(giantChestCalls.length).toBeGreaterThanOrEqual(2);

    // HQ-3 setpieces render cleanly with CRT scanlines & Captain desk
    const hqState = makeState({
      biome: 'hq',
      areaCode: 'hq-3',
      props: [
        makeProp({ id: 10, kind: 'big_tv', x: 160, y: 76, radius: 36, sprite: 'sprBigTVOn' }),
        makeProp({ id: 11, kind: 'captain_desk', x: 160, y: 116, radius: 40, sprite: 'sprDeskEmpty' }),
        makeProp({ id: 12, kind: 'last_chair', x: 160, y: 100, radius: 10, sprite: 'sprLastChair' }),
        makeProp({ id: 13, kind: 'messenger', x: 196, y: 120, radius: 8, sprite: 'sprMessengerIdle' }),
      ],
    });
    const hqMock = createTrackingCtx();
    renderer.getCamera().snapTo(160, 112);
    renderer.renderWorld(hqMock.ctx, hqState, RENDER_SETTINGS, 1);
    expect(hqMock.drawCalls.some((c) => c.dw === 128 && c.dh === 85)).toBe(true); // sprDeskEmpty
    expect(hqMock.drawCalls.filter((c) => c.dw === 113 && c.dh === 96).length).toBeGreaterThanOrEqual(2); // sprBigTVOn + sprBigTVLines
  });

  it('renders necro_revive_area & trap scorch under entities, Horror B purple beam vs Hostile Horror green beam, Crystal B sprShieldB, cursed_ammo warning, cursed weapon smoke, new combat VFX, and biome roof decals', () => {
    const bundle = createRenderableBundle();
    const renderer = new GameRenderer(bundle);

    // 1. necro_revive_area & sprTrapScorchMark draw in Layer 3 UNDER player/enemies + pulsing green/purple rings
    const labsState = makeState({
      biome: 'labs',
      areaCode: '6-1',
      props: [
        makeProp({ id: 20, kind: 'necro_revive_area', x: 160, y: 128, radius: 32, sprite: 'sprReviveArea' }),
        makeProp({ id: 29, kind: 'fire_trap', x: 140, y: 128, radius: 10, sprite: 'sprTrap' }),
      ],
      pickups: [
        { id: 21, kind: 'cursed_ammo', x: 175, y: 128, vx: 0, vy: 0, value: 12, lifeTicks: 20, animFrame: 0 },
      ],
      projectiles: [
        makeLaserProj({ id: 26, kind: 'boss_orb', team: 'enemy', x: 185, y: 128, radius: 12, sprite: 'sprLastBall' }),
        makeLaserProj({ id: 27, kind: 'enemy_flame', team: 'enemy', x: 148, y: 128, radius: 6, sprite: 'sprTrapFire' }),
      ],
      particles: [
        { id: 22, kind: 'gamma_blast', x: 160, y: 128, vx: 0, vy: 0, lifeTicks: 4, maxLifeTicks: 6, size: 48, color: '#58ff68', alpha: 1 },
        { id: 23, kind: 'frog_gas', x: 150, y: 128, vx: 0, vy: 0, lifeTicks: 10, maxLifeTicks: 20, size: 12, color: '#58e038', alpha: 0.8 },
        { id: 24, kind: 'frog_heal', x: 155, y: 128, vx: 0, vy: 0, lifeTicks: 8, maxLifeTicks: 14, size: 8, color: '#80ff80', alpha: 1 },
        { id: 25, kind: 'popo_explo', x: 165, y: 128, vx: 0, vy: 0, lifeTicks: 6, maxLifeTicks: 12, size: 48, color: '#4ca6ff', alpha: 1 },
      ],
    });
    labsState.player.weapons[0]!.cursed = true;
    renderer.consumeEvents([{ type: 'portal_open', x: 160, y: 128, targetArea: '7-1' }], labsState);
    const labsMock = createTrackingCtx();
    renderer.getCamera().snapTo(160, 128);
    renderer.renderWorld(labsMock.ctx, labsState, RENDER_SETTINGS, 1);

    // Revive circle neon green (#58ff68) & purple (#9848e8) rings + sprReviveArea (70x80) + sprTrapScorchMark (80x80) drawn BEFORE Layer 4
    expect(labsMock.fillRects.some((r) => r.style.toLowerCase() === '#58ff68')).toBe(true);
    expect(labsMock.fillRects.some((r) => r.style.toLowerCase() === '#9848e8')).toBe(true);
    const reviveIdx = labsMock.drawCalls.findIndex((c) => c.dw === 70 && c.dh === 80);
    const scorchIdx = labsMock.drawCalls.findIndex((c) => c.dw === 80 && c.dh === 80);
    const cursedAmmoIdx = labsMock.drawCalls.findIndex((c) => c.dw === 10 && c.dh === 10);
    expect(reviveIdx).toBeGreaterThanOrEqual(0);
    expect(scorchIdx).toBeGreaterThanOrEqual(0);
    expect(cursedAmmoIdx).toBeGreaterThan(reviveIdx);
    // Expiring cursed_ammo blinks crimson warning ring (#ff3868) and held cursed weapon emits purple smoke (#f0a8ff/#b838ff)
    expect(labsMock.fillRects.some((r) => r.style.toLowerCase() === '#ff3868')).toBe(true);
    expect(labsMock.fillRects.some((r) => r.style.toLowerCase() === '#f0a8ff')).toBe(true);
    // sprGammaBlast (96x96), sprPortalClear (64x64), sprPopoExplo (96x96), sprFrogGas (24x24), sprFrogHeal (16x16), sprLastBall (32x32), sprTrapFire (16x16)
    expect(labsMock.drawCalls.filter((c) => c.dw === 96 && c.dh === 96).length).toBeGreaterThanOrEqual(2);
    expect(labsMock.drawCalls.some((c) => c.dw === 64 && c.dh === 64)).toBe(true);
    expect(labsMock.drawCalls.some((c) => c.dw === 32 && c.dh === 32)).toBe(true);
    expect(labsMock.drawCalls.some((c) => c.dw === 24 && c.dh === 24)).toBe(true);
    expect(labsMock.drawCalls.some((c) => c.dw === 16 && c.dh === 16)).toBe(true);

    // 2. Horror B-Skin draws purple sprHorrorBBullet beam (#b838ff) while Hostile Horror stays green (#38d848)
    const horrorBState = makeState({
      projectiles: [
        makeLaserProj({ id: 30, kind: 'rad_beam', team: 'player', x: 190, y: 128, radius: 6, sprite: 'sprHorrorBullet' }),
      ],
    });
    horrorBState.player.mutant = 'horror';
    horrorBState.player.skin = 'b';
    const horrorBMock = createTrackingCtx();
    renderer.renderWorld(horrorBMock.ctx, horrorBState, RENDER_SETTINGS, 1);
    expect(horrorBMock.fillRects.some((r) => r.style.toLowerCase() === '#b838ff')).toBe(true);
    expect(horrorBMock.drawCalls.some((c) => c.dw === 20 && c.dh === 16)).toBe(true); // sprHorrorBBullet 20x16

    const enemyHorrorBeamState = makeState({
      projectiles: [
        makeLaserProj({ id: 31, kind: 'rad_beam', team: 'enemy', x: 190, y: 128, radius: 6, sprite: 'sprHorrorBullet' }),
      ],
    });
    enemyHorrorBeamState.player.mutant = 'horror';
    enemyHorrorBeamState.player.skin = 'b';
    const enemyHorrorMock = createTrackingCtx();
    renderer.renderWorld(enemyHorrorMock.ctx, enemyHorrorBeamState, RENDER_SETTINGS, 1);
    expect(enemyHorrorMock.fillRects.some((r) => r.style.toLowerCase() === '#38d848')).toBe(true);

    // 3. Crystal B-Skin draws golden sprShieldB (26x26) while shielding
    const crystalBState = makeState();
    crystalBState.player.mutant = 'crystal';
    crystalBState.player.skin = 'b';
    crystalBState.player.shielding = true;
    const crystalBMock = createTrackingCtx();
    renderer.renderWorld(crystalBMock.ctx, crystalBState, RENDER_SETTINGS, 1);
    expect(crystalBMock.drawCalls.some((c) => c.dw === 26 && c.dh === 26)).toBe(true);

    // 4. All 7 biome roof decals map cleanly to valid fallback sprites & draw on intact wall-top islands
    expect(Object.keys(BIOME_TOP_DECAL_SPRITES)).toHaveLength(7);
    for (const biome of ['caves', 'cursed_caves', 'frozen_city', 'jungle', 'pizza_sewers', 'scrapyard', 'sewers'] as const) {
      const spr = resolveBiomeTopDecalSprite(biome);
      expect(spr).toBeDefined();
      expect(bundle.getSprite(spr!)).toBeDefined();
    }
    const cavesState = makeState({
      biome: 'caves',
      areaCode: '4-1',
      map: makeMap({ width: 28, height: 24, biome: 'caves', areaCode: '4-1' }),
    });
    const cavesMock = createTrackingCtx();
    renderer.renderWorld(cavesMock.ctx, cavesState, RENDER_SETTINGS, 1);
    expect(cavesMock.drawCalls.some((c) => c.dw === 32 && c.dh === 32 && Math.abs(c.alpha - 0.82) < 1e-3)).toBe(true);
  });
});
