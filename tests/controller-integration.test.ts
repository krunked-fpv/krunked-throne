import { describe, expect, it, vi } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_4_3,
  TILE_SIZE,
  TileType,
  type GamepadFamily,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type WorldMap,
} from '@/contracts';
import { createFallbackBundle } from '@/assets';
import { GameApp } from '@/app';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEYBINDINGS,
  InputManager,
  TOUCH_AIM_STICK_RADIUS,
  getGamepadGlyphs,
  type GamepadButtonLike,
  type GamepadDebugSnapshot,
  type GamepadDisconnectInfo,
  type GamepadLike,
  type GamepadVibrationActuatorLike,
  type MenuInputSnapshot,
  type TouchEnvironmentLike,
} from '@/input';
import { BitmapFontRenderer, CameraController, GameRenderer } from '@/render';
import {
  HudRenderer,
  MenuSystem,
  createDefaultSaveData,
  type MenuRenderContext,
} from '@/ui';

function makeButtons(
  count: number,
  pressed: Record<number, number | boolean> = {},
): GamepadButtonLike[] {
  const arr: GamepadButtonLike[] = [];
  for (let i = 0; i < count; i++) {
    const val = pressed[i];
    if (typeof val === 'number') {
      arr.push({ pressed: val > 0.5, value: val });
    } else {
      arr.push({ pressed: Boolean(val), value: val ? 1 : 0 });
    }
  }
  return arr;
}

function makePad(opts: {
  index?: number;
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes?: number[];
  buttonCount?: number;
  pressed?: Record<number, number | boolean>;
  vibrationActuator?: GamepadVibrationActuatorLike | null;
}): GamepadLike {
  return {
    index: opts.index ?? 0,
    id: opts.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    connected: opts.connected ?? true,
    mapping: opts.mapping ?? 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: makeButtons(opts.buttonCount ?? 17, opts.pressed),
    vibrationActuator: opts.vibrationActuator,
  };
}

function makeTestMap(width = 20, height = 20): WorldMap {
  const tiles = new Uint8Array(width * height);
  tiles.fill(TileType.Floor);
  return {
    width,
    height,
    tileSize: TILE_SIZE,
    tiles,
    floorVariants: new Uint8Array(width * height),
    wallMask: new Uint8Array(width * height),
    spawnX: 160,
    spawnY: 160,
    biome: 'desert',
    areaCode: '1-1',
    loop: 0,
    darkness: 0,
    walkableCount: width * height,
  };
}

function makeSimState(overrides: Partial<SimState> = {}): SimState {
  const map = makeTestMap();
  return {
    tick: 60,
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
      x: 160,
      y: 160,
      prevX: 160,
      prevY: 160,
      vx: 0,
      vy: 0,
      radius: 6,
      aimAngle: 0,
      facing: 1,
      hp: 8,
      maxHp: 8,
      iframes: 0,
      hurtFlashTicks: 0,
      rads: 12,
      level: 1,
      radsToNextLevel: 60,
      mutations: ['rhino_skin'],
      ultra: null,
      strongSpiritReady: false,
      strongSpiritRecharging: false,
      ammo: { melee: 0, bullet: 48, shell: 16, bolt: 0, explosive: 0, energy: 0 },
      ammoMax: { melee: 0, bullet: 255, shell: 55, bolt: 55, explosive: 55, energy: 55 },
      weapons: [
        { weaponId: 'revolver', reloadTicks: 0, maxReloadTicks: 6, burstRemaining: 0, burstTimer: 0, kickOffset: 0 },
        { weaponId: 'shotgun', reloadTicks: 0, maxReloadTicks: 18, burstRemaining: 0, burstTimer: 0, kickOffset: 0 },
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
      lastDamageCause: 'BANDIT',
      lastKillerSprite: 'sprBanditIdle',
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
      y: 160,
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
    pendingMutations: ['rhino_skin', 'trigger_fingers', 'rabbit_paw'],
    pendingUltras: ['fish_a', 'fish_b'],
    pendingLevelUps: 0,
    chestSkipStreak: 0,
    generatorsRemaining: 0,
    idpdHeat: 0,
    levelStartEnemyCount: 6,
    levelKills: 0,
    stats: {
      kills: 5,
      shotsFired: 10,
      damageDealt: 30,
      damageTaken: 0,
      radsCollected: 12,
      bossesDefeated: [],
      areasCleared: 0,
      timeTicks: 600,
    },
    nextEntityId: 50,
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

function createSpyCanvasContext() {
  const fillRects: Array<{ x: number; y: number; w: number; h: number; style: string; alpha: number }> = [];
  let curFill = '#000000';
  let curAlpha = 1;
  const stack: Array<{ fill: string; alpha: number }> = [];
  const noop = (): void => {};
  const grad = { addColorStop: noop };

  const ctx = {
    imageSmoothingEnabled: false,
    strokeStyle: '#000000',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
    font: '8px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    get fillStyle(): string {
      return curFill;
    },
    set fillStyle(v: string | object) {
      if (typeof v === 'string') curFill = v;
    },
    get globalAlpha(): number {
      return curAlpha;
    },
    set globalAlpha(v: number) {
      curAlpha = v;
    },
    save: vi.fn(() => {
      stack.push({ fill: curFill, alpha: curAlpha });
    }),
    restore: vi.fn(() => {
      const top = stack.pop();
      if (top) {
        curFill = top.fill;
        curAlpha = top.alpha;
      }
    }),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => grad),
    createRadialGradient: vi.fn(() => grad),
    drawImage: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, style: curFill, alpha: curAlpha });
    }),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillRects,
  };
}

function makeFakeCanvasWithParent() {
  const canvasListeners = new Map<string, Array<(e: unknown) => void>>();
  const parentListeners = new Map<string, Array<(e: unknown) => void>>();
  const classSet = new Set<string>();
  const { ctx } = createSpyCanvasContext();

  const parent = {
    clientWidth: 900,
    clientHeight: 480,
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = parentListeners.get(type) ?? [];
      arr.push(fn);
      parentListeners.set(type, arr);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = parentListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  } as unknown as HTMLElement;

  const canvas = {
    width: LOGICAL_WIDTH_4_3,
    height: LOGICAL_HEIGHT,
    tabIndex: 0,
    style: { width: '640px', height: '480px' },
    parentElement: parent,
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force === undefined) {
          if (classSet.has(name)) classSet.delete(name);
          else classSet.add(name);
        } else if (force) {
          classSet.add(name);
        } else {
          classSet.delete(name);
        }
      },
      contains: (name: string) => classSet.has(name),
    },
    getContext: () => ctx,
    // Canvas sits centered inside 900px parent with 130px dark letterbox margins left & right
    getBoundingClientRect: () => ({ left: 130, top: 0, width: 640, height: 480 }),
    focus: vi.fn(),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = canvasListeners.get(type) ?? [];
      arr.push(fn);
      canvasListeners.set(type, arr);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = canvasListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  } as unknown as HTMLCanvasElement;

  return { canvas, parent, canvasListeners, parentListeners, classSet };
}

function makeBlankMenuSnap(overrides: Partial<MenuInputSnapshot> = {}): MenuInputSnapshot {
  return {
    pointer: { logicalX: 0, logicalY: 0, down: false, clicked: false, rightClicked: false, moved: false },
    navUp: false,
    navDown: false,
    navLeft: false,
    navRight: false,
    confirm: false,
    back: false,
    retry: false,
    ...overrides,
  };
}

describe('controller-integration: Auto-Sense Mobile/Touch & Strict Desktop Zero-Leak', () => {
  it('auto-senses coarse+no-hover mobile env into touch mode without unlocking audio, while keeping desktop & touchscreen laptops strictly kbm', () => {
    const mobileEnv: TouchEnvironmentLike = {
      matchMedia: (q) => ({ matches: q.includes('coarse') || q.includes('hover: none') }),
      maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    };
    const unlocked: string[] = [];
    const mobileInput = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS, touchMode: 'auto' },
      touchEnv: mobileEnv,
      onUserInteraction: (mode) => unlocked.push(mode),
    });

    expect(mobileInput.getInputMode()).toBe('touch');
    expect(mobileInput.isTouchOverlayVisible()).toBe(true);
    expect(unlocked).toHaveLength(0); // Constructor must NOT fire onUserInteraction!

    // Instant hide on mouse, keyboard, or gamepad input
    mobileInput.simulateMouseMoveLogical(120, 100);
    expect(mobileInput.getInputMode()).toBe('kbm');
    expect(mobileInput.isTouchOverlayVisible()).toBe(false);

    mobileInput.simulateTouchStartLogical(1, 50, 160);
    expect(mobileInput.isTouchOverlayVisible()).toBe(true);
    mobileInput.simulateKeyDown('KeyW');
    expect(mobileInput.getInputMode()).toBe('kbm');
    expect(mobileInput.isTouchOverlayVisible()).toBe(false);

    // Touch disabled in Options -> stays kbm even on mobile touchEnv
    const mobileOff = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS, touchMode: 'off' },
      touchEnv: mobileEnv,
    });
    expect(mobileOff.getInputMode()).toBe('kbm');
    expect(mobileOff.isTouchOverlayVisible()).toBe(false);

    // Desktop touchscreen laptop (pointer: fine + maxTouchPoints > 0) -> strictly kbm!
    const laptopEnv: TouchEnvironmentLike = {
      matchMedia: (q) => ({ matches: q.includes('fine') || q.includes('hover: hover') }),
      maxTouchPoints: 10,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    };
    const laptopInput = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS, touchMode: 'auto' },
      touchEnv: laptopEnv,
    });
    expect(laptopInput.getInputMode()).toBe('kbm');
    expect(laptopInput.isTouchOverlayVisible()).toBe(false);

    // Headless Node without touchEnv -> strictly kbm!
    const headlessInput = new InputManager(DEFAULT_KEYBINDINGS);
    expect(headlessInput.getInputMode()).toBe('kbm');
    expect(headlessInput.isTouchOverlayVisible()).toBe(false);
  });

  it('tracks live window.matchMedia coarse/no-hover change events on attach and cleans up on detach', () => {
    let mediaChangeListener: ((e: { matches: boolean }) => void) | null = null;
    const removedSpy = vi.fn(() => {
      mediaChangeListener = null;
    });
    const origWindow = globalThis.window;
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: (_type: string, fn: (e: { matches: boolean }) => void) => {
          mediaChangeListener = fn;
        },
        removeEventListener: removedSpy,
      })),
    };

    try {
      const { canvas } = makeFakeCanvasWithParent();
      const input = new InputManager(DEFAULT_KEYBINDINGS, {
        controls: { ...DEFAULT_CONTROL_SETTINGS, touchMode: 'auto' },
      });
      input.attach(canvas);
      expect(input.getInputMode()).toBe('kbm');
      expect(mediaChangeListener).not.toBeNull();

      // Flipping to mobile coarse/no-hover activates touch mode cleanly
      mediaChangeListener!({ matches: true });
      expect(input.getInputMode()).toBe('touch');
      expect(input.isTouchOverlayVisible()).toBe(true);

      // Flipping back to desktop hides touch mode cleanly
      mediaChangeListener!({ matches: false });
      expect(input.getInputMode()).toBe('kbm');
      expect(input.isTouchOverlayVisible()).toBe(false);

      input.detach();
      expect(removedSpy).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { window: unknown }).window = origWindow;
    }
  });
});

describe('controller-integration: Letterbox Parent (#app) Touch Capture', () => {
  it('captures gameplay touches landing in dark letterbox margins while ignoring canvas-targeted, mouse, and menu touches', () => {
    let now = 1000;
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS },
      nowMs: () => now,
    });
    const { canvas, parent, parentListeners } = makeFakeCanvasWithParent();
    input.attach(canvas);

    // 1. Not in gameplay -> letterbox touch MUST be ignored!
    input.setGameplayActive(false);
    parentListeners.get('pointerdown')?.[0]?.({
      target: parent,
      pointerType: 'touch',
      pointerId: 11,
      clientX: 40, // left dark letterbox outside canvas.left=130
      clientY: 320,
      preventDefault: vi.fn(),
    });
    expect(input.getInputMode()).toBe('kbm');
    expect(input.getTouchManager().hasActiveTouches()).toBe(false);

    // 2. Active gameplay: non-touch mouse pointerdown on letterbox is ignored
    input.setGameplayActive(true);
    parentListeners.get('pointerdown')?.[0]?.({
      target: parent,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 40,
      clientY: 320,
      preventDefault: vi.fn(),
    });
    expect(input.getInputMode()).toBe('kbm');

    // 3. Active gameplay: touch pointerdown with target === canvas is ignored by parent (no double-handling)
    parentListeners.get('pointerdown')?.[0]?.({
      target: canvas,
      pointerType: 'touch',
      pointerId: 12,
      clientX: 250,
      clientY: 320,
      preventDefault: vi.fn(),
    });
    expect(input.getTouchManager().hasActiveTouches()).toBe(false);

    // 4. Active gameplay: left letterbox touch clamps to logical x=0 (left half -> floating move stick!)
    //    and right letterbox touch clamps to logical x=320 (right half -> floating aim stick!)
    parentListeners.get('pointerdown')?.[0]?.({
      target: parent,
      pointerType: 'touch',
      pointerId: 21,
      clientX: 20, // left letterbox (< 130)
      clientY: 240, // mid-height -> logical y=120 (avoids bottom-left ACT trigger)
      preventDefault: vi.fn(),
    });
    expect(input.getInputMode()).toBe('touch');
    expect(input.getTouchManager().getMoveStickState().active).toBe(true);

    now += 40;
    parentListeners.get('touchstart')?.[0]?.({
      target: parent,
      changedTouches: [{ identifier: 5, clientX: 860, clientY: 240 }], // right letterbox (> 770)
      preventDefault: vi.fn(),
    });
    expect(input.getTouchManager().getAimStickState().active).toBe(true);

    // Detach removes all parent listeners cleanly
    input.detach();
    expect(parentListeners.get('pointerdown')?.length ?? 0).toBe(0);
    expect(parentListeners.get('touchstart')?.length ?? 0).toBe(0);
  });
});

describe('controller-integration: Touch Aim Assist, Touch Micro-Haptics & Test Rumble', () => {
  it('applies magnetic aim assist to touch twin-stick aim in both consumeSimInput and updatePresentationAim', () => {
    const openMap = makeTestMap(24, 24);
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 160);

    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS, gamepadAimAssist: true },
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(true);

    // Aim directly along +X while enemy sits ~7 deg off-axis at (240, 170)
    input.simulateTouchStartLogical(7, 230, 140);
    input.simulateTouchMoveLogical(7, 230 + TOUCH_AIM_STICK_RADIUS, 140);

    const simFrame = input.consumeSimInput(cam, 160, 160, {
      enemies: [{ x: 240, y: 170, hp: 10, radius: 7 }],
      map: openMap,
    });
    expect(simFrame.aimWorldX).toBeGreaterThan(220);
    expect(simFrame.aimWorldY).toBeGreaterThan(162);

    const presAim = input.updatePresentationAim(cam, 160, 160, {
      enemies: [{ x: 240, y: 170, hp: 10, radius: 7 }],
      map: openMap,
    });
    expect(presAim.y).toBeGreaterThan(162);

    // Disabling aim assist restores exact unassisted +X vector (y === 160)
    input.setControlSettings({ ...DEFAULT_CONTROL_SETTINGS, gamepadAimAssist: false });
    const unassisted = input.consumeSimInput(cam, 160, 160, {
      enemies: [{ x: 240, y: 170, hp: 10, radius: 7 }],
      map: openMap,
    });
    expect(unassisted.aimWorldY).toBeCloseTo(160, 3);
  });

  it('triggers touch micro-haptics presets and testRumble across connected gamepad & touch fallback', () => {
    const vibrateSpy = vi.fn(() => true);
    const origNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...(origNav ?? {}), vibrate: vibrateSpy },
    });

    try {
      const playEffect = vi.fn(() => Promise.resolve('complete'));
      let pads: Array<GamepadLike | null> = [
        makePad({ index: 0, vibrationActuator: { playEffect } }),
      ];

      const input = new InputManager(DEFAULT_KEYBINDINGS, {
        controls: { ...DEFAULT_CONTROL_SETTINGS, gamepadRumble: true },
        getGamepads: () => pads,
      });

      // Poll once to register connected pad, then switch active deviceMode to 'kbm' via mouse
      input.pollGamepad();
      input.simulateMouseMoveLogical(160, 120);
      expect(input.getInputMode()).toBe('kbm');

      // testRumble() MUST bypass deviceMode === 'gamepad' check when a pad is connected!
      expect(input.testRumble()).toBe(true);
      expect(playEffect).toHaveBeenCalledWith(
        'dual-rumble',
        expect.objectContaining({
          duration: 140,
          weakMagnitude: 0.45,
          strongMagnitude: 0.65,
        }),
      );

      // Disconnect pad and enter touch mode -> touch micro-haptics presets fire cleanly
      pads = [];
      input.pollGamepad();
      input.simulateTouchStartLogical(1, 60, 160);
      expect(input.getInputMode()).toBe('touch');

      expect(input.triggerTouchHapticForPreset('hurt')).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith(28);

      expect(input.triggerTouchHapticForPreset('explosion')).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith(35);

      expect(input.triggerTouchHapticForPreset('death')).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith([45, 30, 65]);

      expect(input.triggerTouchHapticForPreset('fire_heavy')).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith(14);

      expect(input.triggerTouchHapticForPreset('parry')).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith(16);

      // Noisy presets ignored for touch
      expect(input.triggerTouchHapticForPreset('fire_light')).toBe(false);
      expect(input.triggerTouchHapticForPreset('kill')).toBe(false);

      // testRumble() falls back to touch micro-haptic (35ms) when no pad is connected
      expect(input.testRumble()).toBe(true);
      expect(vibrateSpy).toHaveBeenLastCalledWith(35);

      // Disabled rumble setting blocks both
      input.setControlSettings({ ...DEFAULT_CONTROL_SETTINGS, gamepadRumble: false });
      expect(input.triggerTouchHapticForPreset('hurt')).toBe(false);
      expect(input.testRumble()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: origNav,
      });
    }
  });
});

describe('controller-integration: Adaptive Family Glyphs, Campfire Guard, Controls Card & Touch Reticle', () => {
  it('renders pure-ASCII adaptive PlayStation / Nintendo / Xbox / Tesla glyphs across MenuSystem, HudRenderer, and GameRenderer', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const hud = new HudRenderer(bundle);
    const renderer = new GameRenderer(bundle);
    const save = createDefaultSaveData();
    const simState = makeSimState({
      pickups: [
        {
          id: 99,
          kind: 'weapon',
          weaponId: 'shotgun',
          x: 168,
          y: 160,
          vx: 0,
          vy: 0,
          value: 1,
          lifeTicks: 300,
          animFrame: 0,
        },
      ],
      props: [
        {
          id: 100,
          kind: 'car',
          x: 152,
          y: 160,
          radius: 10,
          hp: 20,
          maxHp: 20,
          solid: true,
          opened: false,
          hurtFlashTicks: 0,
          sprite: 'sprCar',
          interactPrompt: '[E] ENTER CAR',
        },
      ],
    });
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 160);

    const families: readonly GamepadFamily[] = [
      'xbox',
      'playstation',
      'nintendo',
      'tesla',
      'generic',
    ];
    const screens: readonly MenuRenderContext['screen'][] = [
      'title',
      'campfire',
      'options',
      'paused',
      'mutation_select',
      'ultra_select',
      'game_over',
      'victory',
    ];

    const drawnByFamily = new Map<GamepadFamily, string[]>();
    const fontDrawSpy = vi.spyOn(BitmapFontRenderer.prototype, 'draw');

    try {
      for (const family of families) {
        const captured: string[] = [];
        fontDrawSpy.mockImplementation((_ctx, text) => {
          captured.push(text);
          return { width: text.length * 5, height: 8 };
        });

        const debugSnap: GamepadDebugSnapshot = {
          connected: true,
          padIndex: 0,
          padName: `${family.toUpperCase()} CONTROLLER`,
          family,
          profile: family === 'playstation' ? 'sony-hid' : 'standard',
          lx: 0.4,
          ly: -0.5,
          rx: -0.6,
          ry: 0.3,
          lt: true,
          rt: true,
          activeButtonCount: 2,
        };

        const spy = createSpyCanvasContext();

        // Render every menu screen + all 3 Options tabs
        for (const screen of screens) {
          const baseCtx: MenuRenderContext = {
            screen,
            save,
            simState,
            width: LOGICAL_WIDTH_4_3,
            height: LOGICAL_HEIGHT,
            timeSec: 1.5,
            returnScreenFromOptions: 'title',
            inputMode: 'gamepad',
            gamepadConnected: true,
            gamepadName: debugSnap.padName,
            gamepadProfile: debugSnap.profile,
            gamepadFamily: family,
            gamepadDebug: debugSnap,
          };
          if (screen === 'options') {
            for (const tab of ['general', 'controls', 'keybinds'] as const) {
              menus.setOptionsTab(tab);
              expect(() => menus.render(spy.ctx, baseCtx)).not.toThrow();
            }
          } else {
            expect(() => menus.render(spy.ctx, baseCtx)).not.toThrow();
          }
        }

        // Render HUD & World prompts with this family
        expect(() =>
          hud.render(spy.ctx, {
            state: simState,
            camera: cam,
            renderSettings: DEFAULT_RENDER_SETTINGS,
            fps: 120,
            width: LOGICAL_WIDTH_4_3,
            height: LOGICAL_HEIGHT,
            inputMode: 'gamepad',
            gamepadFamily: family,
          }),
        ).not.toThrow();

        expect(() =>
          renderer.renderWorld(
            spy.ctx,
            simState,
            DEFAULT_RENDER_SETTINGS,
            1,
            { x: 200, y: 120 },
            'gamepad',
            family,
          ),
        ).not.toThrow();

        // Enforce strict ASCII-only invariant (zero '&' and zero Unicode > 127)
        for (const text of captured) {
          expect(text).not.toContain('&');
          for (let i = 0; i < text.length; i++) {
            expect(text.charCodeAt(i)).toBeLessThanOrEqual(127);
          }
        }

        drawnByFamily.set(family, captured);
      }
    } finally {
      fontDrawSpy.mockRestore();
    }

    // PlayStation family uses authentic [O], [X], [SQ], [TRI], [L1/R1], [SHARE]
    const psTexts = drawnByFamily.get('playstation')!;
    expect(psTexts.some((t) => t.includes('BACK [O]'))).toBe(true);
    expect(psTexts.some((t) => t.includes('[L1/R1]'))).toBe(true);
    expect(psTexts.some((t) => t.includes('RETRY [SHARE]'))).toBe(true);
    expect(psTexts.some((t) => t.includes('CAMPFIRE [O]'))).toBe(true);
    expect(psTexts.some((t) => t.includes('[SQ]'))).toBe(true);
    expect(psTexts.some((t) => t === 'TRI')).toBe(true);
    expect(psTexts.some((t) => t.includes('TOUCH STICKS: @gAUTO (TOUCH ONLY)'))).toBe(true);

    // Nintendo family uses [B] confirm, [A] back, [Y] pickup, [X] swap, [L/R], [-] retry
    const nswTexts = drawnByFamily.get('nintendo')!;
    expect(nswTexts.some((t) => t.includes('BACK [A]'))).toBe(true);
    expect(nswTexts.some((t) => t.includes('GO! [B]'))).toBe(true);
    expect(nswTexts.some((t) => t.includes('[L/R]'))).toBe(true);
    expect(nswTexts.some((t) => t.includes('RETRY [-]'))).toBe(true);
    expect(nswTexts.some((t) => t.includes('[Y]'))).toBe(true);
    expect(nswTexts.some((t) => t === 'X')).toBe(true);

    // Tesla family displays TESLA PAD label
    const teslaTexts = drawnByFamily.get('tesla')!;
    expect(teslaTexts.some((t) => t.includes('TESLA PAD'))).toBe(true);

    // Touch mode renders sleek translucent touch aim reticle (alpha ~0.48) when cursorScreen is provided
    const touchSpy = createSpyCanvasContext();
    renderer.renderTouchAimReticle(touchSpy.ctx, 180, 110);
    expect(touchSpy.fillRects.length).toBeGreaterThan(8);
    expect(touchSpy.fillRects.some((r) => r.alpha > 0.35 && r.alpha < 0.6)).toBe(true);
  });

  it('guards Campfire Y (secondary) when mutant has no golden weapon and triggers test_rumble from Controls tab tertiary/click', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    save.selectedMutant = 'fish';
    save.mutants.fish.goldenWeapon = null;

    const campCtx: MenuRenderContext = {
      screen: 'campfire',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      inputMode: 'gamepad',
      gamepadFamily: 'xbox',
    };

    // Fish without golden weapon: pressing Y (secondary) MUST NOT emit toggle_golden!
    const blockedGold = menus.update(makeBlankMenuSnap({ secondary: true }), campCtx);
    expect(blockedGold.some((a) => a.type === 'toggle_golden')).toBe(false);

    // Grant golden weapon to Fish -> pressing Y toggles golden cleanly!
    save.mutants.fish.goldenWeapon = 'golden_revolver';
    const allowedGold = menus.update(makeBlankMenuSnap({ secondary: true }), campCtx);
    expect(allowedGold.some((a) => a.type === 'toggle_golden' && a.enabled === true)).toBe(true);

    // Options -> Controls tab: tertiary button (X/SQ/Y) emits test_rumble + sndClick
    menus.setOptionsTab('controls');
    const optCtx: MenuRenderContext = {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      inputMode: 'gamepad',
      gamepadConnected: true,
      gamepadName: 'DualSense Wireless Controller',
      gamepadProfile: 'standard',
      gamepadFamily: 'playstation',
    };

    const spy = createSpyCanvasContext();
    menus.render(spy.ctx, optCtx);

    const tertActions = menus.update(makeBlankMenuSnap({ tertiary: true }), optCtx);
    expect(tertActions.some((a) => a.type === 'test_rumble')).toBe(true);
    expect(tertActions.some((a) => a.type === 'ui_sfx' && a.sound === 'sndClick')).toBe(true);

    // Clicking the connected controller status card also emits test_rumble + sndClick!
    const statusCard = menus.getHitRegions().find((r) => r.id === 'opt_ctrl_pad_status')!;
    expect(statusCard).toBeDefined();
    const clickActions = menus.update(
      makeBlankMenuSnap({
        pointer: {
          logicalX: statusCard.x + 10,
          logicalY: statusCard.y + 10,
          down: true,
          clicked: true,
          rightClicked: false,
          moved: true,
        },
      }),
      optCtx,
    );
    expect(clickActions.some((a) => a.type === 'test_rumble')).toBe(true);
    expect(clickActions.some((a) => a.type === 'ui_sfx' && a.sound === 'sndClick')).toBe(true);
  });
});

describe('controller-integration: Gamepad Disconnect Auto-Pause, Toasts & Telemetry in GameApp', () => {
  it('fires onGamepadDisconnect on active pad drop, auto-pauses active combat in GameApp, and exposes family/profile telemetry', async () => {
    // 1. Unit check on InputManager onGamepadDisconnect forwarding
    let unitPads: Array<GamepadLike | null> = [
      makePad({ index: 0, id: 'Wireless Controller (Vendor: 054c Product: 0ce6)' }),
    ];
    const disconnected: GamepadDisconnectInfo[] = [];
    const unitInput = new InputManager(DEFAULT_KEYBINDINGS, {
      getGamepads: () => unitPads,
      onGamepadDisconnect: (info) => disconnected.push(info),
    });
    unitInput.pollGamepad();
    expect(unitInput.getGamepadInfo().family).toBe('playstation');

    unitPads = [];
    unitInput.pollGamepad();
    expect(disconnected).toHaveLength(1);
    expect(disconnected[0]?.family).toBe('playstation');
    expect(getGamepadGlyphs(disconnected[0]!.family).familyLabel).toBe('PLAYSTATION');

    // 2. Full GameApp combat disconnect auto-pause + toasts + test_rumble + telemetry
    const { canvas } = makeFakeCanvasWithParent();
    const app = new GameApp(canvas);
    await app.init();

    const internal = app as unknown as {
      screen: string;
      audio: { isPaused: () => boolean };
      input: InputManager;
      controllerToastText: string;
      handleGamepadConnected: (info: { padIndex: number; padName: string | null; family: GamepadFamily }) => void;
      handleGamepadDisconnected: (info: GamepadDisconnectInfo) => void;
      handleMenuAction: (action: unknown) => void;
      triggerRumbleForEvents: (events: readonly SimEvent[]) => void;
      createDebugBridge: () => {
        startRun: (m?: 'fish', seed?: number) => void;
        getTelemetry: () => {
          gamepadFamily?: GamepadFamily;
          gamepadProfile?: string | null;
        };
      };
    };

    // Connect toast
    internal.handleGamepadConnected({
      padIndex: 0,
      padName: 'DualSense Wireless Controller',
      family: 'playstation',
    });
    expect(internal.controllerToastText).toBe('@gPLAYSTATION CONTROLLER CONNECTED');

    internal.handleGamepadConnected({
      padIndex: 0,
      padName: 'Tesla USB Pad',
      family: 'tesla',
    });
    expect(internal.controllerToastText).toBe('@gTESLA PAD CONNECTED');

    // Start run -> active combat -> controller disconnects -> auto-pauses cleanly!
    const bridge = internal.createDebugBridge();
    bridge.startRun('fish', 1337);
    expect(internal.screen).toBe('playing');

    internal.handleGamepadDisconnected({
      padIndex: 0,
      padName: 'DualSense Wireless Controller',
      family: 'playstation',
    });
    expect(internal.screen).toBe('paused');
    expect(internal.audio.isPaused()).toBe(true);
    expect(internal.controllerToastText).toBe('@yPLAYSTATION CONTROLLER DISCONNECTED - PAUSED');

    // Menu action test_rumble shows toast & respects disabled setting
    internal.handleMenuAction({ type: 'test_rumble' });
    expect(internal.controllerToastText).toBe('@gRUMBLE TEST');

    internal.handleMenuAction({ type: 'update_controls', partial: { gamepadRumble: false } });
    internal.handleMenuAction({ type: 'test_rumble' });
    expect(internal.controllerToastText).toBe('@dENABLE RUMBLE TO TEST');

    // Telemetry includes gamepadFamily and gamepadProfile fields
    const telem = bridge.getTelemetry();
    expect(telem.gamepadFamily).toBe('generic');
    expect(telem.gamepadProfile).toBeNull();

    // Touch haptics triggered through GameApp.triggerRumbleForEvents
    internal.handleMenuAction({ type: 'update_controls', partial: { gamepadRumble: true } });
    internal.input.simulateTouchStartLogical(1, 60, 160);
    const touchHapticSpy = vi.spyOn(internal.input, 'triggerTouchHapticForPreset');
    internal.triggerRumbleForEvents([
      { type: 'sfx', sound: 'sndExplosion', x: 0, y: 0 },
      { type: 'melee_deflect', x: 0, y: 0, angle: 0 },
    ]);
    expect(touchHapticSpy).toHaveBeenCalledWith('explosion');
    expect(touchHapticSpy).toHaveBeenCalledWith('parry');
    touchHapticSpy.mockRestore();

    app.destroy();
  });
});
