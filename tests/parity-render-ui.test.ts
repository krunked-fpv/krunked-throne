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
  type SpriteDef,
  type TpagRect,
  type WorldMap,
} from '@/contracts';
import { createFallbackBundle, createFallbackManifest, loadAssets, type AssetBundle } from '@/assets';
import { MUTANTS } from '@/data/mutants';
import { BitmapFontRenderer, CameraController, GameRenderer, lerpPosSafe } from '@/render';
import {
  ALL_MUTANT_IDS,
  DEFAULT_CROWNS,
  DEFAULT_MUTANTS,
  DEFAULT_MUTATIONS,
  DEFAULT_UI_DATA_PROVIDER,
  HudRenderer,
  MenuSystem,
  OPAQUE_MENU_BACKDROP,
  PORTAL_INDICATOR_PAD_TOP,
  SaveManager,
  computeAmmoIconFrame,
  computeCampfireDetailsLayout,
  computeUltraIconFrame,
  createDefaultSaveData,
  resolveBossDisplayName,
  resolveCorpseFrame,
  resolveDisplaySpriteFrame,
  resolvePortalIndicatorStyle,
  resolveRunProgressIndex,
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

    // 2. Wake boss (introTicks > 0): Boss Intro splash takes over full screen & hides normal HUD (matching NT!)
    sleepingBossEnt.aiState = 'idle';
    const mockIntro = createMockCtx();
    hud.render(mockIntro.ctx, {
      state,
      camera: cam,
      renderSettings: DEFAULT_RENDER_SETTINGS,
      fps: 120,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
    });
    expect(mockIntro.fillRects[0]).toMatchObject({ x: 0, y: 0, w: LOGICAL_WIDTH_16_9, h: LOGICAL_HEIGHT });
    expect(mockIntro.fillRects.length).toBeGreaterThan(20);

    // 3. After Boss Intro completes (introTicks === 0): Boss Intro splash clears and normal gameplay HUD renders cleanly (no non-NT bottom boss HP bar)
    bossHudState.introTicks = 0;
    const mockAwake = createMockCtx();
    hud.render(mockAwake.ctx, {
      state,
      camera: cam,
      renderSettings: DEFAULT_RENDER_SETTINGS,
      fps: 120,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
    });
    expect(mockAwake.fillRects[0]).not.toMatchObject({ x: 0, y: 0, w: LOGICAL_WIDTH_16_9, h: LOGICAL_HEIGHT });
    expect(mockAwake.fillRects.length).toBeGreaterThan(0);
    expect(mockAwake.fillRects.length).toBeLessThan(mockIntro.fillRects.length);
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

    // 1. Ultra Select balanced cards with opaque dark backdrop (alpha >= 0.94)
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
    expect(ultraMock.fillRects[0]?.style).toBe(OPAQUE_MENU_BACKDROP);
    const ultraCard0 = menus.getHitRegions().find((r) => r.id === 'ultra_card_0')!;
    expect(ultraCard0.w).toBeGreaterThanOrEqual(136);
    expect(ultraCard0.h).toBeGreaterThanOrEqual(110);
    expect(ultraCard0.h).toBeLessThanOrEqual(126);

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

  it('flows Campfire PASSIVE/ACTIVE/TB/BEST dynamically without overlap for all 12 mutants, aligns loadout bar, and keeps 1.0x mutant scale', () => {
    const bundle = createFallbackBundle();
    const fonts = new BitmapFontRenderer(bundle);

    // Check every single one of the 12 real mutants (including Rogue, Horror, Melting, Y.V., Robot)
    for (const m of Object.values(MUTANTS)) {
      for (const maxW of [126, 130]) {
        const lay = computeCampfireDetailsLayout(fonts, m, maxW, 35, 156, true);
        expect(lay.passiveY + lay.passiveH).toBeLessThan(lay.activeY);
        expect(lay.activeY + lay.activeH).toBeLessThan(lay.tbY);
        expect(lay.tbY + lay.tbH).toBeLessThan(lay.bestY);
        expect(lay.bestY + 6).toBeLessThanOrEqual(158);
      }
    }

    // Verify uniform loadout row alignment (SKIN, CROWN, GOLD, GO! share identical y and h)
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    save.selectedMutant = 'horror';
    save.selectedCrown = 'protection';
    for (const vw of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const mock = createMockCtx();
      menus.render(mock.ctx, {
        screen: 'campfire',
        save,
        simState: null,
        width: vw,
        height: LOGICAL_HEIGHT,
        timeSec: 1.5,
        returnScreenFromOptions: 'title',
      });
      const regs = menus.getHitRegions();
      const skin = regs.find((r) => r.id === 'camp_skin')!;
      const crown = regs.find((r) => r.id === 'camp_crown')!;
      const gold = regs.find((r) => r.id === 'camp_golden')!;
      const go = regs.find((r) => r.id === 'camp_go')!;
      expect(skin.y).toBe(go.y);
      expect(crown.y).toBe(go.y);
      expect(gold.y).toBe(go.y);
      expect(skin.h).toBe(go.h);
      expect(crown.h).toBe(go.h);
      expect(gold.h).toBe(go.h);
      // Full CROWN OF PROTECTION fits without mid-word truncation
      expect(crown.w).toBeGreaterThanOrEqual(100);
      // No non-integer fractional scaling on campfire mutant draws (every scaleX/scaleY is integer or +/-1!)
      for (const dc of mock.drawCalls) {
        expect(Math.abs(Math.abs(dc.scaleX) - Math.round(Math.abs(dc.scaleX)))).toBeLessThan(1e-4);
        expect(Math.abs(Math.abs(dc.scaleY) - Math.round(Math.abs(dc.scaleY)))).toBeLessThan(1e-4);
      }
    }

    // Verify no double-emitted sndHover/sndClick on Campfire mutant nav & confirm, and sndClickBack on Back!
    const blankSnap = {
      pointer: { logicalX: 0, logicalY: 0, down: false, clicked: false, rightClicked: false, moved: false },
      navUp: false,
      navDown: false,
      navLeft: false,
      navRight: false,
      confirm: false,
      back: false,
      retry: false,
    };
    const campCtx = {
      screen: 'campfire' as const,
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title' as const,
    };
    const nextMutActs = menus.update({ ...blankSnap, navRight: true }, campCtx);
    expect(nextMutActs.some((a) => a.type === 'select_mutant')).toBe(true);
    expect(nextMutActs.some((a) => a.type === 'ui_sfx')).toBe(false);

    const startActs = menus.update({ ...blankSnap, confirm: true }, campCtx);
    expect(startActs.some((a) => a.type === 'start_run')).toBe(true);
    expect(startActs.some((a) => a.type === 'ui_sfx')).toBe(false);

    const backActs = menus.update({ ...blankSnap, back: true }, campCtx);
    expect(backActs).toContainEqual({ type: 'ui_sfx', sound: 'sndClickBack' });
  });

function makeTestSpriteDef(
  name: string,
  width: number,
  height: number,
  originX: number,
  originY: number,
  frames: TpagRect[],
): SpriteDef {
  return {
    id: 0,
    name,
    width,
    height,
    originX,
    originY,
    bboxLeft: 0,
    bboxRight: width - 1,
    bboxTop: 0,
    bboxBottom: height - 1,
    bboxMode: 0,
    sepMasks: 0,
    playbackSpeed: 1,
    playbackSpeedType: 0,
    frames,
  };
}

  it('draws sprExpBarLevel BEFORE sprExpBar, enforces Portal padTop >= 42 & colors, avoids ctx.arc, and unifies Boss Intro naming', () => {
    const baseBundle = createFallbackBundle();
    // Create a Steam-like bundle where sprExpBarLevel (16x26) sits at distinct srcX=900 vs sprExpBar at srcX=100
    const sprExpBarLevel = makeTestSpriteDef('sprExpBarLevel', 16, 26, 1, 1, [
      { textureId: 0, srcX: 900, srcY: 10, srcW: 16, srcH: 26, targetX: 0, targetY: 0, targetW: 16, targetH: 26, boundW: 16, boundH: 26 },
    ]);
    const sprExpBar = makeTestSpriteDef(
      'sprExpBar',
      14,
      24,
      0,
      0,
      Array.from({ length: 16 }, () => ({
        textureId: 0,
        srcX: 100,
        srcY: 10,
        srcW: 14,
        srcH: 24,
        targetX: 0,
        targetY: 0,
        targetW: 14,
        targetH: 24,
        boundW: 14,
        boundH: 24,
      })),
    );
    const fakeTex = {} as unknown as HTMLCanvasElement;
    const customSprites: Record<string, SpriteDef> = {
      ...baseBundle.manifest.sprites,
      sprExpBar,
      sprExpBarLevel,
    };
    const steamLikeBundle: AssetBundle = {
      ...baseBundle,
      sourceMode: 'steam',
      manifest: { ...baseBundle.manifest, sprites: customSprites },
      getSprite: (n) => customSprites[n],
      getTexture: () => fakeTex,
    };

    const hud = new HudRenderer(steamLikeBundle);
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(128, 128);

    const drawSeq: Array<{ sx: number; w: number; h: number }> = [];
    let arcCalls = 0;
    const mock = createMockCtx();
    const rawCtx = mock.ctx as unknown as {
      drawImage: (...args: unknown[]) => void;
      arc: (...args: unknown[]) => void;
    };
    const origDraw = rawCtx.drawImage;
    rawCtx.drawImage = (...args: unknown[]) => {
      if (args.length >= 9) {
        drawSeq.push({ sx: Number(args[1]), w: Number(args[3]), h: Number(args[4]) });
      }
      origDraw(...args);
    };
    rawCtx.arc = () => {
      arcCalls += 1;
    };

    const state = makeSimState({
      tick: 0, // Math.floor(0/6)%2 === 0 -> level glow active!
      pendingLevelUps: 1,
    });
    state.player.mutations = ['strong_spirit'];
    state.player.strongSpiritReady = true;
    state.player.weapons[1]!.reloadTicks = 9;
    state.player.weapons[1]!.maxReloadTicks = 18;
    // Melting full 2/2 HP check
    state.player.mutant = 'melting';
    state.player.hp = 2;
    state.player.maxHp = 2;

    hud.render(mock.ctx, {
      state,
      camera: cam,
      renderSettings: DEFAULT_RENDER_SETTINGS,
      fps: 120,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
    });

    const levelIdx = drawSeq.findIndex((d) => d.sx === 900 && d.w === 16 && d.h === 26);
    const barIdx = drawSeq.findIndex((d) => d.sx === 100 && d.w === 14 && d.h === 24);
    expect(levelIdx).toBeGreaterThanOrEqual(0);
    expect(barIdx).toBeGreaterThanOrEqual(0);
    expect(levelIdx).toBeLessThan(barIdx); // sprExpBarLevel MUST draw BEFORE sprExpBar!
    expect(arcCalls).toBe(0); // Strong Spirit must NEVER use smooth anti-aliased ctx.arc!

    // Portal indicator padTop & destination colors
    expect(PORTAL_INDICATOR_PAD_TOP).toBeGreaterThanOrEqual(42);
    expect(resolvePortalIndicatorStyle('1-?').fill).toBe('#38c8ff'); // Oasis blue
    expect(resolvePortalIndicatorStyle('vault').fill).toBe('#52ff7a'); // Vault green
    expect(resolvePortalIndicatorStyle('hq-1').fill).toBe('#52a8ff'); // HQ blue
    expect(resolvePortalIndicatorStyle('1-2').fill).toBe('#d16bff'); // Standard violet

    // Boss display naming unified across Steam & Built-In
    expect(resolveBossDisplayName('nuclear_throne', 'THE KRUNKED THRONE', true)).toBe('THE THRONE');
    expect(resolveBossDisplayName('nuclear_throne', 'THE KRUNKED THRONE', false)).toBe('THE KRUNKED THRONE');
  });

  it('maps Vault on road map cleanly, selects non-blank Horror/Y.V./explosion Game Over frames, emits sndMutHover, and fixes Patience copy', () => {
    // 1. Vault road map index never maps to 0 (1-1)!
    expect(resolveRunProgressIndex('vault')).toBe(7);
    expect(resolveRunProgressIndex('1-1')).toBe(0);
    expect(resolveRunProgressIndex('7-3')).toBe(14);
    expect(resolveRunProgressIndex('0-1')).toBe(14);
    expect(resolveRunProgressIndex('hq-1')).toBe(13);

    // 2. Horror sprMutant11Dead skips 2x11 & 1x1 dissolve tail frames -> picks frame 4
    const horrorDead = makeTestSpriteDef('sprMutant11Dead', 48, 48, 24, 24, [
      { textureId: 0, srcX: 0, srcY: 0, srcW: 26, srcH: 23, targetX: 7, targetY: 10, targetW: 26, targetH: 23, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 47, srcH: 45, targetX: 0, targetY: 1, targetW: 47, targetH: 45, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 48, srcH: 45, targetX: 0, targetY: 2, targetW: 48, targetH: 45, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 48, srcH: 43, targetX: 0, targetY: 5, targetW: 48, targetH: 43, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 18, srcH: 12, targetX: 13, targetY: 15, targetW: 18, targetH: 12, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 2, srcH: 11, targetX: 21, targetY: 17, targetW: 2, targetH: 11, boundW: 48, boundH: 48 },
      { textureId: 0, srcX: 0, srcY: 0, srcW: 1, srcH: 1, targetX: 0, targetY: 0, targetW: 1, targetH: 1, boundW: 48, boundH: 48 },
    ]);
    expect(resolveDisplaySpriteFrame(horrorDead, 'sprMutant11Dead')).toBe(4);

    // Y.V. sprMutant6Dead skips final 1x1 blank frame 18 -> picks frame 17
    const yvDead = makeTestSpriteDef(
      'sprMutant6Dead',
      48,
      48,
      24,
      24,
      Array.from({ length: 19 }, (_, idx) => ({
        textureId: 0,
        srcX: 0,
        srcY: 0,
        srcW: idx === 18 ? 1 : 36,
        srcH: idx === 18 ? 1 : 17,
        targetX: 0,
        targetY: 0,
        targetW: idx === 18 ? 1 : 36,
        targetH: idx === 18 ? 1 : 17,
        boundW: 48,
        boundH: 48,
      })),
    );
    expect(resolveDisplaySpriteFrame(yvDead, 'sprMutant6Dead')).toBe(17);

    // Explosion skips solid-white frame 0 -> picks mid-frame 3!
    const exploSpr = makeTestSpriteDef(
      'sprExplosion',
      48,
      48,
      24,
      24,
      Array.from({ length: 9 }, () => ({
        textureId: 0,
        srcX: 0,
        srcY: 0,
        srcW: 37,
        srcH: 37,
        targetX: 6,
        targetY: 4,
        targetW: 37,
        targetH: 37,
        boundW: 48,
        boundH: 48,
      })),
    );
    expect(resolveDisplaySpriteFrame(exploSpr, 'sprExplosion')).toBe(3);

    // 3. Mutation Select emits sndMutHover & Pause supports keyboard mutation inspection
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const state = makeSimState({
      pendingMutations: ['sharp_teeth', 'boiling_veins', 'strong_spirit'],
    });
    state.player.mutations = ['rhino_skin', 'long_arms'];
    state.player.ultra = 'fish_a';

    const mutMock = createMockCtx();
    const mutCtx = {
      screen: 'mutation_select' as const,
      save,
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title' as const,
    };
    menus.render(mutMock.ctx, mutCtx);
    const card1 = menus.getHitRegions().find((r) => r.id === 'mut_card_1')!;
    const hoverActs = menus.update(
      {
        pointer: { logicalX: card1.x + 5, logicalY: card1.y + 5, down: false, clicked: false, rightClicked: false, moved: true },
        navUp: false,
        navDown: false,
        navLeft: false,
        navRight: false,
        confirm: false,
        back: false,
        retry: false,
      },
      mutCtx,
    );
    expect(hoverActs).toContainEqual({ type: 'ui_sfx', sound: 'sndMutHover' });

    // Pause keyboard L/R inspection cycles through owned mutations + ultra
    const pauseCtx = { ...mutCtx, screen: 'paused' as const };
    const blankSnap = {
      pointer: { logicalX: 0, logicalY: 0, down: false, clicked: false, rightClicked: false, moved: false },
      navUp: false,
      navDown: false,
      navLeft: false,
      navRight: false,
      confirm: false,
      back: false,
      retry: false,
    };
    menus.update({ ...blankSnap, navRight: true }, pauseCtx);
    expect(menus.getPauseInspectIndex()).toBe(0);
    menus.update({ ...blankSnap, navRight: true }, pauseCtx);
    expect(menus.getPauseInspectIndex()).toBe(1);
    menus.update({ ...blankSnap, navRight: true }, pauseCtx);
    expect(menus.getPauseInspectIndex()).toBe(2); // Ultra

    // 4. Patience copy in data-provider matches NT ("MUTATE LATER", not "WITH EXTRA CHOICE")
    const patience = DEFAULT_MUTATIONS.find((m) => m.id === 'patience')!;
    expect(patience.description).toBe('@gMUTATE@s LATER');

    // Keybind conflict swap via SaveManager
    const sm = new SaveManager();
    const rebound = sm.rebindKey('up', 'KeyS');
    expect(rebound.up).toBe('KeyS');
    expect(rebound.down).toBe('KeyW');
  });

  it('restores the 9a554e6 Hi-Bit KRUNKED THRONE logo and wasteland Title screen in both Built-In and Steam modes', () => {
    const manifest = createFallbackManifest();
    expect(manifest.textures).toHaveLength(1);

    // Restored 2x Hi-Bit KRUNKED THRONE logo + glow & aliases on page 0
    const sprLogo = manifest.sprites.sprLogo!;
    const sprLogoGlow = manifest.sprites.sprLogoGlow!;
    expect(sprLogo.width).toBe(258);
    expect(sprLogo.height).toBe(96);
    expect(sprLogo.frames).toHaveLength(8);
    expect(sprLogo.frames[7]!.srcW).toBe(516);
    expect(sprLogo.frames[7]!.srcH).toBe(192);
    expect(sprLogo.frames[7]!.textureId).toBe(0);
    expect(sprLogoGlow.width).toBe(261);
    expect(sprLogoGlow.height).toBe(93);
    expect(sprLogoGlow.frames[0]!.srcW).toBe(522);
    expect(sprLogoGlow.frames[0]!.srcH).toBe(186);
    expect(manifest.sprites.sprKrunkedLogo).toBeDefined();
    expect(manifest.sprites.sprKrunkedLogoGlow).toBeDefined();

    // 1. Built-In Art mode Title screen renders wasteland backdrop, PLAY, OPTIONS, and split art-pack row
    const fbBundle = createFallbackBundle();
    const fbMenus = new MenuSystem(fbBundle);
    const save = createDefaultSaveData();
    const fbMock = createMockCtx();
    fbMenus.render(fbMock.ctx, {
      screen: 'title',
      save,
      simState: null,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
      timeSec: 2.0,
      returnScreenFromOptions: 'title',
      hasServerSteam: true,
    });
    const fbRegs = fbMenus.getHitRegions();
    expect(fbRegs.find((r) => r.id === 'title_play')?.onActivate()).toEqual({ type: 'open_screen', screen: 'campfire' });
    expect(fbRegs.find((r) => r.id === 'title_options')?.onActivate()).toEqual({ type: 'open_screen', screen: 'options' });
    expect(fbRegs.find((r) => r.id === 'title_use_local')?.onActivate()).toEqual({ type: 'use_local_art' });
    expect(fbRegs.find((r) => r.id === 'title_load_local')?.onActivate()).toEqual({ type: 'request_load_local' });
    // Wasteland backdrop does NOT render the 28px black letterbox portal vortex on Title
    expect(fbMock.fillRects.some((r) => r.style === '#5a5648')).toBe(true);

    // Keyboard/gamepad navigation: Down -> OPTIONS -> Art Pack row, Left/Right toggles split art-pack buttons!
    const blankSnap = {
      pointer: { logicalX: 0, logicalY: 0, down: false, clicked: false, rightClicked: false, moved: false },
      navUp: false,
      navDown: false,
      navLeft: false,
      navRight: false,
      confirm: false,
      back: false,
      retry: false,
    };
    const titleCtx = {
      screen: 'title' as const,
      save,
      simState: null,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
      timeSec: 2.0,
      returnScreenFromOptions: 'title' as const,
      hasServerSteam: true,
    };
    fbMenus.update({ ...blankSnap, navDown: true }, titleCtx); // -> 1 (OPTIONS)
    expect(fbMenus.getFocusedIndex()).toBe(1);
    fbMenus.update({ ...blankSnap, navDown: true }, titleCtx); // -> 2 (Art Pack row, col 0)
    expect(fbMenus.getFocusedIndex()).toBe(2);
    expect(fbMenus.update({ ...blankSnap, confirm: true }, titleCtx)).toContainEqual({ type: 'use_local_art' });
    fbMenus.update({ ...blankSnap, navRight: true }, titleCtx); // -> col 1 (LOAD FOLDER)
    expect(fbMenus.update({ ...blankSnap, confirm: true }, titleCtx)).toContainEqual({ type: 'request_load_local' });

    // 2. Steam Pack mode Title screen draws bakMenu seamlessly in 16:9 and NEVER draws Steam's "NUCLEAR THRONE" sprLogo!
    const steamLogoSentinel = makeTestSpriteDef('sprLogo', 258, 96, 129, 48, [
      { textureId: 0, srcX: 777, srcY: 777, srcW: 258, srcH: 96, targetX: 0, targetY: 0, targetW: 258, targetH: 96, boundW: 258, boundH: 96 },
    ]);
    const steamBakMenu = makeTestSpriteDef('bakMenu', 320, 240, 0, 0, [
      { textureId: 0, srcX: 10, srcY: 10, srcW: 320, srcH: 240, targetX: 0, targetY: 0, targetW: 320, targetH: 240, boundW: 320, boundH: 240 },
    ]);
    const fakeTex = {} as unknown as HTMLCanvasElement;
    const steamSprites: Record<string, SpriteDef> = {
      ...fbBundle.manifest.sprites,
      sprLogo: steamLogoSentinel,
      bakMenu: steamBakMenu,
    };
    const steamBundle: AssetBundle = {
      ...fbBundle,
      sourceMode: 'steam',
      manifest: { ...fbBundle.manifest, sprites: steamSprites },
      getSprite: (n) => steamSprites[n],
      getTexture: () => fakeTex,
    };

    const steamMenus = new MenuSystem(steamBundle);
    const steamDrawSrcs: Array<{ sx: number; sy: number; sw: number; sh: number }> = [];
    const steamMock = createMockCtx();
    const rawSteamCtx = steamMock.ctx as unknown as { drawImage: (...args: unknown[]) => void };
    const origSteamDraw = rawSteamCtx.drawImage;
    rawSteamCtx.drawImage = (...args: unknown[]) => {
      if (args.length >= 9) {
        steamDrawSrcs.push({
          sx: Number(args[1]),
          sy: Number(args[2]),
          sw: Number(args[3]),
          sh: Number(args[4]),
        });
      }
      origSteamDraw(...args);
    };

    steamMenus.render(steamMock.ctx, {
      screen: 'title',
      save,
      simState: null,
      width: LOGICAL_WIDTH_16_9,
      height: LOGICAL_HEIGHT,
      timeSec: 2.0,
      returnScreenFromOptions: 'title',
      hasServerSteam: true,
    });
    // bakMenu (320x240) IS drawn
    expect(steamDrawSrcs.some((d) => d.sx === 10 && d.sy === 10 && d.sw === 320 && d.sh === 240)).toBe(true);
    // Steam's sprLogo sentinel (srcX=777, srcY=777) MUST NEVER be drawn — our KRUNKED THRONE logo replaces it!
    expect(steamDrawSrcs.some((d) => d.sx === 777 && d.sy === 777)).toBe(false);
    // Title split row exposes USE BUILT-IN ART + LOAD FOLDER
    const steamRegs = steamMenus.getHitRegions();
    expect(steamRegs.find((r) => r.id === 'title_use_builtin')?.onActivate()).toEqual({ type: 'use_builtin_art' });
    expect(steamRegs.find((r) => r.id === 'title_load_local')?.onActivate()).toEqual({ type: 'request_load_local' });
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
