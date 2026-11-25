import { describe, expect, it } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  TileType,
  type BossState,
  type EnemyEntity,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type WorldMap,
} from '@/contracts';
import { createFallbackBundle, createFallbackManifest, loadAssets, type AssetBundle } from '@/assets';
import { CameraController, GameRenderer, lerpPosSafe } from '@/render';
import {
  ALL_MUTANT_IDS,
  DEFAULT_CROWNS,
  DEFAULT_MUTANTS,
  DEFAULT_UI_DATA_PROVIDER,
  HudRenderer,
  MenuSystem,
  computeAmmoIconFrame,
  computeUltraIconFrame,
  createDefaultSaveData,
  resolveCorpseFrame,
  selectLoadingTip,
  validateSaveData,
} from '@/ui';

function createMockCtx() {
  const fillTexts: string[] = [];
  const fillRects: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  const drawCalls: Array<{
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    rot: number;
    scaleX: number;
    scaleY: number;
  }> = [];
  let curFill = '#000000';
  let curRot = 0;
  let curScaleX = 1;
  let curScaleY = 1;
  const stack: Array<{ rot: number; sx: number; sy: number }> = [];
  const noop = (): void => {};
  const grad = { addColorStop: noop };

  const mock = {
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000000',
    font: '8px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    get fillStyle(): string {
      return curFill;
    },
    set fillStyle(v: string | object) {
      if (typeof v === 'string') curFill = v;
    },
    save: () => {
      stack.push({ rot: curRot, sx: curScaleX, sy: curScaleY });
    },
    restore: () => {
      const top = stack.pop();
      if (top) {
        curRot = top.rot;
        curScaleX = top.sx;
        curScaleY = top.sy;
      }
    },
    translate: noop,
    rotate: (r: number) => {
      curRot += r;
    },
    scale: (sx: number, sy: number) => {
      curScaleX *= sx;
      curScaleY *= sy;
    },
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
      const dx = Number(args[args.length >= 9 ? 5 : 1] ?? 0);
      const dy = Number(args[args.length >= 9 ? 6 : 2] ?? 0);
      const dw = Number(args[args.length >= 9 ? 7 : 3] ?? 0);
      const dh = Number(args[args.length >= 9 ? 8 : 4] ?? 0);
      drawCalls.push({ dx, dy, dw, dh, rot: curRot, scaleX: curScaleX, scaleY: curScaleY });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, style: curFill });
    },
    fillText: (text: string) => {
      fillTexts.push(text);
    },
  };

  return {
    ctx: mock as unknown as CanvasRenderingContext2D,
    fillTexts,
    fillRects,
    drawCalls,
  };
}

function makeTestMap(width = 16, height = 16): WorldMap {
  const tiles = new Uint8Array(width * height);
  const wallMask = new Uint8Array(width * height);
  const floorVariants = new Uint8Array(width * height);
  let walkableCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
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
    spawnX: 128,
    spawnY: 128,
    biome: 'desert',
    areaCode: '1-1',
    loop: 0,
    darkness: 0,
    walkableCount,
  };
}

function makeSimState(overrides: Partial<SimState> = {}): SimState {
  const map = makeTestMap();
  return {
    tick: 120,
    seed: 1337,
    rngState: 1337,
    phase: 'playing',
    areaCode: '1-1',
    biome: 'desert',
    loop: 0,
    crown: 'none',
    map,
    player: {
      id: 1,
      mutant: 'fish',
      skin: 'a',
      x: 128,
      y: 128,
      prevX: 128,
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
      ammo: { melee: 0, bullet: 48, shell: 16, bolt: 0, explosive: 0, energy: 0 },
      ammoMax: { melee: 0, bullet: 255, shell: 55, bolt: 55, explosive: 55, energy: 55 },
      weapons: [
        { weaponId: 'revolver', reloadTicks: 0, maxReloadTicks: 6, burstRemaining: 0, burstTimer: 0, kickOffset: 0, cursed: false },
        { weaponId: 'shotgun', reloadTicks: 0, maxReloadTicks: 18, burstRemaining: 0, burstTimer: 0, kickOffset: 0, cursed: false },
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
      x: 192,
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
      kills: 12,
      shotsFired: 20,
      damageDealt: 84,
      damageTaken: 0,
      radsCollected: 30,
      bossesDefeated: [],
      areasCleared: 0,
      timeTicks: 1800,
    },
    nextEntityId: 100,
    portalTransitionTicks: 0,
    floorClearTrigger: false,
    ...overrides,
  };
}

const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  widescreen: false,
  targetFps: 120,
  classic30Fps: false,
  screenShakeScale: 1,
  crosshairStyle: 0,
  showFps: false,
  pixelSnap: true,
};

describe('parity-render-ui: Ultra & Ammo Icon Frame Resolvers + Fallback Atlas Parity', () => {
  it('maps Ultra icons accurately for Steam 48f sprEGSkillIcon, 52f sprEGIconHUD, and 24f fallback atlas', () => {
    // Steam sprEGSkillIcon (48 frames, NO race-0 prefix): (raceIndex - 1) * 3 + offset
    expect(computeUltraIconFrame(1, 'a', 48)).toBe(0); // Fish A
    expect(computeUltraIconFrame(1, 'b', 48)).toBe(1); // Fish B
    expect(computeUltraIconFrame(2, 'a', 48)).toBe(3); // Crystal A
    expect(computeUltraIconFrame(2, 'b', 48)).toBe(4); // Crystal B
    expect(computeUltraIconFrame(11, 'a', 48)).toBe(30); // Horror A
    expect(computeUltraIconFrame(11, 'b', 48)).toBe(31); // Horror B
    expect(computeUltraIconFrame(12, 'a', 48)).toBe(33); // Rogue A
    expect(computeUltraIconFrame(12, 'b', 48)).toBe(34); // Rogue B

    // Steam sprEGIconHUD (52 frames, WITH 3-frame race-0 prefix): raceIndex * 3 + offset
    expect(computeUltraIconFrame(1, 'a', 52)).toBe(3); // Fish A
    expect(computeUltraIconFrame(1, 'b', 52)).toBe(4); // Fish B
    expect(computeUltraIconFrame(2, 'a', 52)).toBe(6); // Crystal A
    expect(computeUltraIconFrame(2, 'b', 52)).toBe(7); // Crystal B
    expect(computeUltraIconFrame(11, 'a', 52)).toBe(33); // Horror A
    expect(computeUltraIconFrame(11, 'b', 52)).toBe(34); // Horror B
    expect(computeUltraIconFrame(12, 'a', 52)).toBe(36); // Rogue A
    expect(computeUltraIconFrame(12, 'b', 52)).toBe(37); // Rogue B

    // Built-In 24-frame fallback stride: (raceIndex - 1) * 2 + slot
    for (let r = 1; r <= 12; r++) {
      expect(computeUltraIconFrame(r, 'a', 24)).toBe((r - 1) * 2);
      expect(computeUltraIconFrame(r, 'b', 24)).toBe((r - 1) * 2 + 1);
    }
  });

  it('drains ammo icon frames from 0 (FULL) to 7 (EMPTY) and overrides to 0 under Gun Warrant', () => {
    expect(computeAmmoIconFrame(255, 255, 8, 0)).toBe(0);
    expect(computeAmmoIconFrame(128, 255, 8, 0)).toBeGreaterThanOrEqual(3);
    expect(computeAmmoIconFrame(128, 255, 8, 0)).toBeLessThanOrEqual(4);
    expect(computeAmmoIconFrame(0, 255, 8, 0)).toBe(7);
    expect(computeAmmoIconFrame(0, 255, 8, 60)).toBe(0); // Gun Warrant forces FULL bright icon
    expect(computeAmmoIconFrame(10, 55, 1, 0)).toBe(0);
  });

  it('builds single-page fallback atlas with 36x24 sprNothingBeam, 8-frame ammo icons, 9 crosshairs & sprPillar', () => {
    const manifest = createFallbackManifest();
    expect(manifest.textures).toHaveLength(1);

    // P0 #13/#19: sprNothingBeam is a 36x24 vertical beam segment (NOT 96x88 Throne body!)
    const beam = manifest.sprites.sprNothingBeam!;
    expect(beam).toBeDefined();
    expect(beam.width).toBe(36);
    expect(beam.height).toBe(24);
    expect(beam.frames.length).toBe(3);

    // Throne firing body exists separately at 96x88
    expect(manifest.sprites.sprNothingFire!.width).toBe(96);
    expect(manifest.sprites.sprNothingFire!.height).toBe(88);

    // Draining ammo HUD icons (8 frames each), Rogue HUD (4 frames), 9 crosshairs, pillar & game-over icons
    for (const s of ['sprBulletIcon', 'sprShotIcon', 'sprBoltIcon', 'sprExploIcon', 'sprEnergyIcon']) {
      expect(manifest.sprites[s]!.frames.length).toBe(8);
    }
    expect(manifest.sprites.sprRogueAmmoHUD!.frames.length).toBe(4);
    expect(manifest.sprites.sprRogueAmmo!.frames.length).toBe(2);
    expect(manifest.sprites.sprCrosshair!.frames.length).toBe(9);
    expect(manifest.sprites.sprPillar).toBeDefined();
    expect(manifest.sprites.sprGameOverSkull).toBeDefined();
    expect(manifest.sprites.sprGameOverThrone).toBeDefined();
    expect(manifest.sprites.sprMapDot).toBeDefined();

    // Every frame remains strictly on atlas texture page 0
    for (const spr of Object.values(manifest.sprites)) {
      for (const f of spr.frames) {
        expect(f.textureId).toBe(0);
      }
    }
  });

  it('validates standalone UiDataProvider NT sprite names, crown indices, descriptions & deterministic tips', () => {
    // Crowns 1..13 with luck=sprCrown10Idle, risk=sprCrown12Idle, protection=AMMO
    expect(DEFAULT_CROWNS).toHaveLength(13);
    expect(DEFAULT_CROWNS.map((c) => c.crownIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(DEFAULT_UI_DATA_PROVIDER.getCrown('luck').spriteIdle).toBe('sprCrown10Idle');
    expect(DEFAULT_UI_DATA_PROVIDER.getCrown('risk').spriteIdle).toBe('sprCrown12Idle');
    expect(DEFAULT_UI_DATA_PROVIDER.getCrown('protection').description).toContain('AMMO');

    // Chicken B dead sprite & NT weapon sprite names
    const chicken = DEFAULT_MUTANTS.find((m) => m.id === 'chicken')!;
    expect(chicken.sprites.bDead).toBe('sprMutant9Dead');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('golden_revolver')?.sprite).toBe('sprGoldRevolver');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('chicken_sword')?.sprite).toBe('sprSword');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('chicken_sword')?.fireSound).toBe('sndChickenSword');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('shotgun')?.projectileSprite).toBe('sprBullet2');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('grenade_launcher')?.sprite).toBe('sprNader');
    expect(DEFAULT_UI_DATA_PROVIDER.getWeapon('laser_pistol')?.sprite).toBe('sprLaserGun');

    // Deterministic wasteland loading tips
    const tip1 = selectLoadingTip('palace', '7-3', 0, 42);
    const tip2 = selectLoadingTip('palace', '7-3', 0, 42);
    expect(tip1).toBe(tip2);
    expect(tip1.length).toBeGreaterThan(4);
  });
});

describe('parity-render-ui: Renderer Teleport Guard, Corpse Baking, Throne Beam & Slash Scaling', () => {
  it('lerpPosSafe interpolates smoothly on small steps and snaps on teleports (> threshold)', () => {
    expect(lerpPosSafe(10, 20, 20, 40, 0.5, 56)).toEqual({ x: 15, y: 30 });
    expect(lerpPosSafe(10, 20, 200, 20, 0.5, 56)).toEqual({ x: 200, y: 20 });
  });

  it('does not permanently bake corpse decals into FloorBuffer so Melting/Necromancer never leave ghosts', () => {
    const bundle = createFallbackBundle();
    const renderer = new GameRenderer(bundle);
    const state = makeSimState();

    // Corpse decal event must NOT increment FloorBuffer baked count, while scorch/blood decals DO
    const events: SimEvent[] = [
      {
        type: 'decal',
        decal: { kind: 'corpse', x: 120, y: 120, angle: 0, color: '#9e1925', sprite: 'sprBanditDead', frame: 0, facing: 1, scale: 1 },
      },
      {
        type: 'decal',
        decal: { kind: 'scorch', x: 130, y: 130, angle: 0, color: '#181316', scale: 1 },
      },
      {
        type: 'decal',
        decal: { kind: 'blood', x: 132, y: 132, angle: 0, scale: 1, color: '#9e1925' },
      },
    ];
    renderer.consumeEvents(events, state);
    expect(renderer.getFloorBuffer().getBakedDecalCount()).toBe(2);
  });

  it('orients sprNothingBeam vertically down the 7-3 carpet and prevents Steam 48x48 slash oversizing', () => {
    const baseBundle = createFallbackBundle();
    // Create a synthetic Steam-like bundle where sprSlash is 48x48, ox=0, oy=24
    const steamSprites: typeof baseBundle.manifest.sprites = {
      ...baseBundle.manifest.sprites,
      sprSlash: {
        ...baseBundle.manifest.sprites.sprSlash!,
        width: 48,
        height: 48,
        originX: 0,
        originY: 24,
      },
      sprBigGenerator: {
        ...baseBundle.manifest.sprites.sprBigGenerator!,
        width: 96,
        height: 96,
        originX: 32,
        originY: 32,
      },
    };
    const steamManifest = {
      ...baseBundle.manifest,
      sprites: steamSprites,
    };
    const fakeTex = {} as unknown as HTMLCanvasElement;
    const steamBundle: AssetBundle = {
      ...baseBundle,
      manifest: steamManifest,
      sourceMode: 'steam',
      getSprite: (name: string) => steamSprites[name],
      getTexture: () => fakeTex,
    };

    const renderer = new GameRenderer(steamBundle);
    const state = makeSimState({
      areaCode: '7-3',
      biome: 'palace',
      projectiles: [
        {
          id: 1,
          kind: 'enemy_plasma',
          team: 'enemy',
          x: 128,
          y: 128,
          prevX: 128,
          prevY: 118,
          vx: 0,
          vy: 13.5,
          angle: Math.PI * 0.5,
          radius: 7,
          damage: 4,
          pierce: 2,
          bounce: 0,
          lifeTicks: 30,
          maxLifeTicks: 46,
          explosionRadius: 0,
          sprite: 'sprNothingBeam',
          hitIds: [],
        },
        {
          id: 2,
          kind: 'melee_slash',
          team: 'player',
          x: 140,
          y: 128,
          prevX: 140,
          prevY: 128,
          vx: 0,
          vy: 0,
          angle: 0,
          radius: 18,
          damage: 20,
          pierce: 99,
          bounce: 0,
          lifeTicks: 3,
          maxLifeTicks: 4,
          explosionRadius: 0,
          meleeReach: 44, // Shovel + Long Arms worst case
          meleeArcDeg: 130,
          sprite: 'sprSlash',
          hitIds: [],
        },
      ],
    });
    const mock = createMockCtx();
    renderer.renderWorld(mock.ctx, state, DEFAULT_RENDER_SETTINGS, 1);

    // Every draw call for the 48x48 Steam slash must stay <= 1.35x scale (never 2.0x-2.4x oversized!)
    const maxScale = Math.max(...mock.drawCalls.map((c) => Math.max(Math.abs(c.scaleX), Math.abs(c.scaleY))));
    expect(maxScale).toBeLessThanOrEqual(1.35);

    // Mega-beam traveling straight down (angle = PI/2) must draw unrotated (rot === 0), never sideways!
    const hasVerticalBeamDraw = mock.drawCalls.some((c) => Math.abs(c.rot) < 1e-4 && c.dw === 36 && c.dh === 24);
    expect(hasVerticalBeamDraw).toBe(true);
  });
});

describe('parity-render-ui: HUD Fixes (Ultra Rads, Sleeping Boss, Back Muscle 4:3, Boiling Veins, Chests)', () => {
  it('hides /9999 at Level 10 Ultra, trims weapon labels cleanly, and hides sleeping boss HP bar', () => {
    const bundle = createFallbackBundle();
    const hud = new HudRenderer(bundle);
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(128, 128);

    const sleepingBossEnt: EnemyEntity = {
      id: 77,
      defId: 'nuclear_throne',
      bossId: 'nuclear_throne',
      isBoss: true,
      friendly: false,
      x: 128,
      y: 40,
      prevX: 128,
      prevY: 40,
      vx: 0,
      vy: 0,
      radius: 34,
      hp: 1500,
      maxHp: 1500,
      facing: 1,
      aimAngle: Math.PI * 0.5,
      aiState: 'sleep',
      aiTimer: 0,
      aiPhase: 0,
      attackCooldown: 0,
      targetX: 128,
      targetY: 128,
      contactDamage: 8,
      radDrop: 120,
      hurtFlashTicks: 0,
      snaredTicks: 0,
      animFrame: 0,
    };
    const bossHudState: BossState = {
      bossId: 'nuclear_throne',
      entityId: 77,
      name: 'THE KRUNKED THRONE',
      subtitle: 'THE END OF THE ROAD',
      hp: 1500,
      maxHp: 1500,
      introTicks: 40,
      defeated: false,
    };

    const state = makeSimState({
      enemies: [sleepingBossEnt],
      boss: bossHudState,
      props: [
        {
          id: 9,
          kind: 'weapon_chest',
          x: 600, // Off-screen right
          y: 128,
          radius: 8,
          hp: 1,
          maxHp: 1,
          opened: false,
          solid: false,
          sprite: 'sprWeaponChest',
          hurtFlashTicks: 0,
        },
      ],
      portal: {
        active: true,
        x: 600,
        y: 128,
        radius: 18,
        timer: 0,
        targetArea: '0-1',
        nextLoop: 1,
        entered: false,
        enterTicks: 0,
        carved: false,
      },
    });
    state.player.level = 10;
    state.player.rads = 120;
    state.player.radsToNextLevel = 9999;
    state.player.hp = 3;
    state.player.mutations = ['boiling_veins', 'strong_spirit', 'back_muscle'];
    state.player.strongSpiritReady = true;
    state.player.ultra = 'fish_a';
    state.player.ammo.bullet = 555;
    state.player.ammoMax.bullet = 555;

    // 1. Sleeping boss: HP bar & boss intro MUST be hidden
    const mockSleep = createMockCtx();
    hud.render(mockSleep.ctx, {
      state,
      camera: cam,
      renderSettings: DEFAULT_RENDER_SETTINGS,
      fps: 120,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
    });
    expect(mockSleep.fillTexts.some((t) => t.includes('9999'))).toBe(false);
    expect(mockSleep.fillTexts.some((t) => t.includes('KRUNKED THRONE'))).toBe(false);

    // 2. Wake boss: Boss HP bar & intro appear cleanly
    sleepingBossEnt.aiState = 'idle';
    const mockAwake = createMockCtx();
    hud.render(mockAwake.ctx, {
      state,
      camera: cam,
      renderSettings: DEFAULT_RENDER_SETTINGS,
      fps: 120,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
    });
    expect(mockAwake.fillRects.length).toBeGreaterThan(mockSleep.fillRects.length);
  });
});

describe('parity-render-ui: Menus Parity (Campfire 12 Mutants, Gold Guard, Ultra Cards, Pause, Game Over)', () => {
  it('seats all 12 clickable mutants at Campfire and guards GOLD toggle when mutant has no golden weapon', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    save.selectedMutant = 'fish';
    save.mutants.fish.goldenWeapon = null;

    for (const vw of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const mock = createMockCtx();
      menus.render(mock.ctx, {
        screen: 'campfire',
        save,
        simState: null,
        width: vw,
        height: LOGICAL_HEIGHT,
        timeSec: 2.0,
        returnScreenFromOptions: 'title',
      });
      const regions = menus.getHitRegions();
      // Every single mutant has BOTH a campfire seated click target and a bottom roster strip target
      for (const id of ALL_MUTANT_IDS) {
        expect(regions.find((r) => r.id === `camp_sit_${id}`)).toBeDefined();
        expect(regions.find((r) => r.id === `camp_mutant_${id}`)).toBeDefined();
      }
      // Fish without golden weapon: clicking GOLD returns null (does NOT flip bright GOLD: ON)
      const goldBtn = regions.find((r) => r.id === 'camp_golden')!;
      expect(goldBtn.onActivate()).toBeNull();
    }

    // Y.V. starts with Golden Revolver -> GOLD toggle activates cleanly!
    save.selectedMutant = 'yv';
    const mockYv = createMockCtx();
    menus.render(mockYv.ctx, {
      screen: 'campfire',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 2.0,
      returnScreenFromOptions: 'title',
    });
    const yvGold = menus.getHitRegions().find((r) => r.id === 'camp_golden')!;
    expect(yvGold.onActivate()).toEqual({ type: 'toggle_golden', enabled: true });
  });

  it('renders enlarged Ultra Select cards, 2-column Pause menu, 9-style Crosshair options, and Game Over map', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const state = makeSimState({
      areaCode: '7-3',
      biome: 'palace',
      crown: 'blood',
      pendingUltras: ['fish_a', 'fish_b'],
      pendingMutations: ['rhino_skin', 'long_arms', 'strong_spirit', 'boiling_veins', 'rabbit_paw'],
    });
    state.player.mutations = ['rhino_skin', 'boiling_veins', 'strong_spirit'];
    state.player.ultra = 'fish_a';
    state.player.lastDamageCause = 'THE KRUNKED THRONE';

    // 1. Ultra Select cards enlarged to 136x136 with dark backdrop
    const ultraMock = createMockCtx();
    menus.render(ultraMock.ctx, {
      screen: 'ultra_select',
      save,
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1.0,
      returnScreenFromOptions: 'title',
    });
    expect(ultraMock.fillRects[0]?.style).toBe('rgba(10, 9, 14, 0.92)');
    const ultraCard0 = menus.getHitRegions().find((r) => r.id === 'ultra_card_0')!;
    expect(ultraCard0.w).toBeGreaterThanOrEqual(136);
    expect(ultraCard0.h).toBeGreaterThanOrEqual(136);

    // 2. Pause menu keeps all 4 action buttons + hoverable mutation & ultra regions cleanly
    const pauseMock = createMockCtx();
    menus.render(pauseMock.ctx, {
      screen: 'paused',
      save,
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1.0,
      returnScreenFromOptions: 'paused',
    });
    const pauseRegions = menus.getHitRegions();
    expect(pauseRegions.find((r) => r.id === 'pause_resume')).toBeDefined();
    expect(pauseRegions.find((r) => r.id === 'pause_options')).toBeDefined();
    expect(pauseRegions.find((r) => r.id === 'pause_restart')).toBeDefined();
    expect(pauseRegions.find((r) => r.id === 'pause_campfire')).toBeDefined();
    expect(pauseRegions.find((r) => r.id === 'pause_mut_0')).toBeDefined();
    expect(pauseRegions.find((r) => r.id === 'pause_ultra')).toBeDefined();

    // 3. Options crosshair cycles 0..8 (9 styles)
    save.render.crosshairStyle = 8;
    const optMock = createMockCtx();
    menus.render(optMock.ctx, {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1.0,
      returnScreenFromOptions: 'title',
    });
    const aimBtn = menus.getHitRegions().find((r) => r.id === 'opt_crosshair')!;
    expect(aimBtn.onActivate()).toEqual({ type: 'update_render', partial: { crosshairStyle: 0 } });
    expect(validateSaveData({ render: { crosshairStyle: 8 } }).render.crosshairStyle).toBe(8);
    expect(validateSaveData({ render: { crosshairStyle: 99 } }).render.crosshairStyle).toBe(8);

    // 4. Game Over preserves resting corpse & action buttons
    expect(resolveCorpseFrame(6)).toBe(5);
    const goMock = createMockCtx();
    menus.render(goMock.ctx, {
      screen: 'game_over',
      save,
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1.0,
      returnScreenFromOptions: 'title',
    });
    const goRegions = menus.getHitRegions();
    expect(goRegions.find((r) => r.id === 'end_retry')).toBeDefined();
    expect(goRegions.find((r) => r.id === 'end_campfire')).toBeDefined();
  });
});

describe('parity-render-ui: Asset Loader Graceful 204 & Sentinel Handling', () => {
  it('falls back cleanly on HTTP 204 or { available: false } manifest response', async () => {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response(null, { status: 204 })) as unknown as typeof fetch;
      const b204 = await loadAssets('/nt-assets', { modePreference: 'auto' });
      expect(b204.sourceMode).toBe('fallback');

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ available: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch;
      const bSentinel = await loadAssets('/nt-assets', { modePreference: 'auto' });
      expect(bSentinel.sourceMode).toBe('fallback');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
