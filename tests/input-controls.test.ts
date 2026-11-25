import { describe, expect, it, vi } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  TILE_SIZE,
  TileType,
  type SimState,
  type WorldMap,
} from '@/contracts';
import { createFallbackBundle } from '@/assets';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEYBINDINGS,
  GamepadManager,
  InputManager,
  TOUCH_AIM_FIRE_THRESHOLD,
  TOUCH_AIM_STICK_RADIUS,
  TOUCH_MOVE_STICK_RADIUS,
  TouchControlsManager,
  applyControllerAimAssist,
  applyRadialDeadzone,
  computeTouchTriggerRects,
  decodeHatSwitchAxis,
  type GamepadButtonLike,
  type GamepadLike,
  type GamepadVibrationActuatorLike,
} from '@/input';
import { CameraController } from '@/render';
import { MenuSystem, createDefaultSaveData, type MenuRenderContext } from '@/ui';

function makeButtons(count: number, pressed: Record<number, number | boolean> = {}): GamepadButtonLike[] {
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

function makeTestMap(width = 20, height = 20, wallTiles: Array<[number, number]> = []): WorldMap {
  const tiles = new Uint8Array(width * height);
  tiles.fill(TileType.Floor);
  for (const [wx, wy] of wallTiles) {
    if (wx >= 0 && wy >= 0 && wx < width && wy < height) {
      tiles[wy * width + wx] = TileType.Wall;
    }
  }
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
    walkableCount: width * height - wallTiles.length,
  };
}

function createSpyCanvasContext() {
  const calls: string[] = [];
  const ctx = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    fillRect: vi.fn(() => calls.push('fillRect')),
    strokeRect: vi.fn(() => calls.push('strokeRect')),
    beginPath: vi.fn(() => calls.push('beginPath')),
    arc: vi.fn(() => calls.push('arc')),
    moveTo: vi.fn(() => calls.push('moveTo')),
    lineTo: vi.fn(() => calls.push('lineTo')),
    stroke: vi.fn(() => calls.push('stroke')),
    fill: vi.fn(() => calls.push('fill')),
    ellipse: vi.fn(() => calls.push('ellipse')),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(() => calls.push('drawImage')),
    fillText: vi.fn(() => calls.push('fillText')),
    measureText: vi.fn(() => ({ width: 20 })),
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
  };
}

describe('input-controls: Radial Deadzone & Hat-Switch Decoding', () => {
  it('applies radial deadzones isotropically without cardinal snapping and smooths response', () => {
    // Inside deadzone -> zero
    expect(applyRadialDeadzone(0.1, -0.1, 0.16)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(applyRadialDeadzone(0.15, 0, 0.16)).toEqual({ x: 0, y: 0, magnitude: 0 });

    // Outside deadzone -> non-zero, strictly monotonic, full tilt reaches 1.0
    const low = applyRadialDeadzone(0.35, 0, 0.16, 1.4);
    const mid = applyRadialDeadzone(0.65, 0, 0.16, 1.4);
    const full = applyRadialDeadzone(1, 0, 0.16, 1.4);
    expect(low.magnitude).toBeGreaterThan(0);
    expect(mid.magnitude).toBeGreaterThan(low.magnitude);
    expect(full.x).toBeCloseTo(1, 5);
    expect(full.magnitude).toBeCloseTo(1, 5);

    // Diagonal vector preserves exact 45-degree angle
    const diag = applyRadialDeadzone(0.7, -0.7, 0.16, 1.4);
    expect(Math.abs(diag.x)).toBeCloseTo(Math.abs(diag.y), 5);
    expect(diag.x).toBeGreaterThan(0);
    expect(diag.y).toBeLessThan(0);
  });

  it('decodes all 8 POV hat-switch directions and ignores neutral (>1.1) and unused (0.0)', () => {
    expect(decodeHatSwitchAxis(3.285714)).toEqual({ up: false, down: false, left: false, right: false });
    expect(decodeHatSwitchAxis(1.285714)).toEqual({ up: false, down: false, left: false, right: false });
    expect(decodeHatSwitchAxis(0)).toEqual({ up: false, down: false, left: false, right: false });

    expect(decodeHatSwitchAxis(-1.0)).toEqual({ up: true, down: false, left: false, right: false });
    expect(decodeHatSwitchAxis(-0.7143)).toEqual({ up: true, down: false, left: false, right: true });
    expect(decodeHatSwitchAxis(-0.4286)).toEqual({ up: false, down: false, left: false, right: true });
    expect(decodeHatSwitchAxis(-0.1429)).toEqual({ up: false, down: true, left: false, right: true });
    expect(decodeHatSwitchAxis(0.1429)).toEqual({ up: false, down: true, left: false, right: false });
    expect(decodeHatSwitchAxis(0.4286)).toEqual({ up: false, down: true, left: true, right: false });
    expect(decodeHatSwitchAxis(0.7143)).toEqual({ up: false, down: false, left: true, right: false });
    expect(decodeHatSwitchAxis(1.0)).toEqual({ up: true, down: false, left: true, right: false });
  });
});

describe('input-controls: Standard PC Gamepad & Active Pad Switching', () => {
  it('handles twin-stick aim persistence, triggers/face buttons, edge latches, and multi-pad switching', () => {
    let pads: Array<GamepadLike | null> = [
      makePad({ index: 0, id: 'Idle Virtual Steering Wheel', axes: [0, 0, 0, 0] }),
      makePad({ index: 1, id: 'Xbox Wireless Controller', axes: [0, 0, 0, 0] }),
    ];
    let now = 1000;
    const gm = new GamepadManager({ getGamepads: () => pads, nowMs: () => now });

    // Initial poll selects slot 0 when both idle
    const p0 = gm.poll();
    expect(p0.connected).toBe(true);
    expect(p0.padIndex).toBe(0);
    expect(p0.hadActivity).toBe(false);

    // Input arrives on slot 1 -> seamlessly switches active pad to slot 1!
    pads[1] = makePad({
      index: 1,
      id: 'Xbox Wireless Controller',
      axes: [0.8, -0.4, 0, -1],
      pressed: { 7: 0.75, 3: true, 2: true, 9: true },
    });
    const p1 = gm.poll();
    expect(p1.padIndex).toBe(1);
    expect(p1.hadActivity).toBe(true);
    expect(p1.moveX).toBeGreaterThan(0.5);
    expect(p1.moveY).toBeLessThan(0);
    expect(p1.aimActive).toBe(true);
    expect(p1.aimDirX).toBeCloseTo(0, 4);
    expect(p1.aimDirY).toBeCloseTo(-1, 4);
    expect(p1.fireHeld).toBe(true);
    expect(p1.firePressed).toBe(true);
    expect(p1.swapPressed).toBe(true);
    expect(p1.pickupPressed).toBe(true);
    expect(p1.pausePressed).toBe(true);

    // Release right stick while holding RT: aim direction MUST persist (0, -1) and edge latches clear
    now += 33;
    pads[1] = makePad({
      index: 1,
      id: 'Xbox Wireless Controller',
      axes: [0, 0, 0.04, -0.02], // sub-deadzone drift
      pressed: { 7: 0.75 },
    });
    const p2 = gm.poll();
    expect(p2.aimActive).toBe(false);
    expect(p2.aimDirX).toBeCloseTo(0, 4);
    expect(p2.aimDirY).toBeCloseTo(-1, 4);
    expect(p2.fireHeld).toBe(true);
    expect(p2.firePressed).toBe(false);
    expect(p2.swapPressed).toBe(false);
    expect(p2.pausePressed).toBe(false);

    // LB / LT trigger Mutant Active, Back triggers Quick Retry
    now += 33;
    pads[1] = makePad({
      index: 1,
      id: 'Xbox Wireless Controller',
      pressed: { 6: 0.9, 8: true },
    });
    const p3 = gm.poll();
    expect(p3.activeHeld).toBe(true);
    expect(p3.activePressed).toBe(true);
    expect(p3.retryPressed).toBe(true);
  });

  it('supports left-stick menu hysteresis and ergonomic auto-repeat', () => {
    let pads: Array<GamepadLike | null> = [makePad({ axes: [0, 0, 0, 0] })];
    let now = 0;
    const gm = new GamepadManager({ getGamepads: () => pads, nowMs: () => now });
    gm.poll();

    // Push stick right past engage threshold (0.55) -> fires immediately
    now = 100;
    pads[0] = makePad({ axes: [0.8, 0, 0, 0] });
    expect(gm.poll().menuNavRight).toBe(true);

    // Hold at 200ms (< 320ms initial delay) -> does not fire yet
    now = 250;
    expect(gm.poll().menuNavRight).toBe(false);

    // Hold at 430ms (>= 100 + 320) -> repeats!
    now = 430;
    expect(gm.poll().menuNavRight).toBe(true);

    // Next repeat after 115ms interval
    now = 550;
    expect(gm.poll().menuNavRight).toBe(true);

    // Release back to center
    now = 600;
    pads[0] = makePad({ axes: [0.1, 0, 0, 0] });
    expect(gm.poll().menuNavRight).toBe(false);
  });
});

describe('input-controls: Tesla Chromium & Linux-evdev Non-Standard Gamepads', () => {
  it('calibrates resting -1.0 triggers on Linux xpad (0=LX,1=LY,2=LT,3=RX,4=RY,5=RT,6/7=Hat) so triggers never stick firing', () => {
    // Classic Linux kernel xpad driver in Tesla Chromium: 11 buttons (6=Back, 7=Start), triggers rest at -1.0
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
        mapping: '',
        axes: [0, 0, -1, 0, 0, -1, 0, 0],
        buttonCount: 11,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads });

    // Frame 0 at rest: triggers resting at -1 MUST NOT fire or activate!
    const rest = gm.poll();
    expect(rest.connected).toBe(true);
    expect(rest.profile).toBe('linux-xpad');
    expect(rest.fireHeld).toBe(false);
    expect(rest.activeHeld).toBe(false);
    expect(rest.hadActivity).toBe(false);

    // Pull RT (axes[5]) halfway to 0.0 -> normalized 0.5 > 0.28 -> FIRES!
    // Aim right stick on alternate pair axes[3], axes[4]
    pads[0] = makePad({
      index: 0,
      id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
      mapping: '',
      axes: [0, 0, -1, 0.9, 0, 0.2, -1, 0],
      buttonCount: 11,
    });
    const firing = gm.poll();
    expect(firing.fireHeld).toBe(true);
    expect(firing.firePressed).toBe(true);
    expect(firing.activeHeld).toBe(false);
    expect(firing.aimActive).toBe(true);
    expect(firing.aimDirX).toBeCloseTo(1, 4);
    expect(firing.aimDirY).toBeCloseTo(0, 4);
    expect(firing.moveX).toBe(-1); // Paired hat axis[6] = -1 -> Left!
    expect(firing.menuNavLeft).toBe(true);

    // Press Start (button 7 on 11-button xpad) -> Pause ONLY, must NOT fire RT!
    pads[0] = makePad({
      index: 0,
      id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
      mapping: '',
      axes: [0, 0, -1, 0, 0, -1, 0, 0],
      buttonCount: 11,
      pressed: { 7: true },
    });
    const paused = gm.poll();
    expect(paused.pausePressed).toBe(true);
    expect(paused.fireHeld).toBe(false);
  });

  it('supports Sony DualSense/DS4 HID non-standard layout (axes[2]=RX, axes[3]=LT@-1, axes[4]=RT@-1, axes[5]=RY, axes[9]=POV hat)', () => {
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
        mapping: '',
        axes: [0, 0, 0, -1, -1, 0, 0, 0, 0, 3.285714],
        buttonCount: 14,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads });

    const rest = gm.poll();
    expect(rest.profile).toBe('sony-hid');
    expect(rest.fireHeld).toBe(false);
    expect(rest.activeHeld).toBe(false);
    expect(rest.menuNavUp).toBe(false);

    // Hat axis 9 = Down (+0.1429), Cross = btn 1 (Confirm), R2 = axes[4] (+0.8), Right Stick Down (axes[5]=1)
    pads[0] = makePad({
      index: 0,
      id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
      mapping: '',
      axes: [0, 0, 0, -1, 0.8, 0.95, 0, 0, 0, 0.1429],
      buttonCount: 14,
      pressed: { 1: true },
    });
    const active = gm.poll();
    expect(active.menuNavDown).toBe(true);
    expect(active.menuConfirm).toBe(true);
    expect(active.fireHeld).toBe(true);
    expect(active.aimDirY).toBeCloseTo(1, 4);

    // Circle = btn 2 (Back), Triangle = btn 3 (Swap)
    pads[0] = makePad({
      index: 0,
      id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
      mapping: '',
      axes: [0, 0, 0, -1, -1, 0, 0, 0, 0, 3.285714],
      buttonCount: 14,
      pressed: { 2: true, 3: true },
    });
    const back = gm.poll();
    expect(back.menuBack).toBe(true);
    expect(back.swapPressed).toBe(true);
    expect(back.fireHeld).toBe(false);
  });

  it('handles Tesla generic non-standard pad with axes[4/5] resting at -1 and axes[9] hat switch', () => {
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Tesla USB Controller',
        mapping: '',
        axes: [0, 0, 0, 0, -1, -1, 0, 0, 0, 3.2857],
        buttonCount: 12,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads });
    expect(gm.poll().fireHeld).toBe(false);

    pads[0] = makePad({
      index: 0,
      id: 'Tesla USB Controller',
      mapping: '',
      axes: [0, 0, -0.8, 0.6, 0.5, 0.7, 0, 0, 0, -0.4286], // LT+RT pulled, RS down-left, Hat Right
      buttonCount: 12,
    });
    const res = gm.poll();
    expect(res.fireHeld).toBe(true);
    expect(res.activeHeld).toBe(true);
    expect(res.menuNavRight).toBe(true);
    expect(res.aimDirX).toBeLessThan(-0.7);
    expect(res.aimDirY).toBeGreaterThan(0.5);
  });
});

describe('input-controls: Controller Aim Assist & Safe Dual-Rumble', () => {
  it('magnetizes gently toward nearby LoS enemy inside cone, ignores occluded/out-of-cone/friendly enemies', () => {
    const openMap = makeTestMap(24, 24);
    const enemyInCone = { x: 240, y: 170, hp: 10, radius: 7 }; // ~7 deg off +X from (160, 160)
    const assisted = applyControllerAimAssist(160, 160, 1, 0, [enemyInCone], openMap, {
      enabled: true,
    });
    expect(assisted.assisted).toBe(true);
    expect(assisted.dirY).toBeGreaterThan(0.03); // pulled gently toward +Y
    expect(assisted.dirY).toBeLessThan(0.14); // never over-snaps past enemy

    // Disabled -> untouched
    const disabled = applyControllerAimAssist(160, 160, 1, 0, [enemyInCone], openMap, {
      enabled: false,
    });
    expect(disabled.assisted).toBe(false);
    expect(disabled.dirX).toBeCloseTo(1, 5);
    expect(disabled.dirY).toBeCloseTo(0, 5);

    // Wall blocking LoS between player (tile 10,10) and enemy (tile 15,10) -> ignored!
    const walledMap = makeTestMap(24, 24, [
      [12, 9],
      [12, 10],
      [12, 11],
    ]);
    const blocked = applyControllerAimAssist(160, 160, 1, 0, [enemyInCone], walledMap, {
      enabled: true,
    });
    expect(blocked.assisted).toBe(false);

    // Out-of-cone, friendly, dead, and invulnerable enemies ignored
    const ignored = applyControllerAimAssist(
      160,
      160,
      1,
      0,
      [
        { x: 160, y: 240, hp: 10, radius: 7 }, // 90 deg off
        { x: 220, y: 160, hp: 10, radius: 7, friendly: true },
        { x: 220, y: 160, hp: 0, radius: 7 },
        { x: 220, y: 160, hp: 10, radius: 7, invulnerable: true },
      ],
      openMap,
      { enabled: true },
    );
    expect(ignored.assisted).toBe(false);
  });

  it('triggers feature-detected dual-rumble safely and never throws on Tesla / unsupported actuators', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    let now = 100;
    let pads: Array<GamepadLike | null> = [
      makePad({ index: 0, vibrationActuator: { playEffect } }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads, nowMs: () => now });
    gm.poll();

    expect(gm.rumble('explosion')).toBe(true);
    expect(playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({
        startDelay: 0,
        duration: 165,
        strongMagnitude: 0.85,
      }),
    );

    // Lower-priority light rumble does not clobber active explosion rumble
    now += 20;
    expect(gm.rumble('fire_light')).toBe(false);

    // Disabled in settings -> returns false
    now += 500;
    gm.applySettings({ gamepadDeadzone: 0.16, gamepadRumble: false });
    expect(gm.rumble('hurt')).toBe(false);

    // Throwing / rejecting / missing vibrationActuator never throws
    gm.applySettings({ gamepadDeadzone: 0.16, gamepadRumble: true });
    pads = [makePad({ index: 0, vibrationActuator: null })];
    expect(() => gm.rumble('hurt')).not.toThrow();
    expect(gm.rumble('hurt')).toBe(false);

    pads = [
      makePad({
        index: 0,
        vibrationActuator: {
          playEffect: () => {
            throw new Error('Tesla unsupported');
          },
        },
      }),
    ];
    expect(() => gm.rumble('hurt')).not.toThrow();
    expect(gm.rumble('hurt')).toBe(false);
  });
});

describe('input-controls: Invisible-Until-Touch State Machine & Floating Dual-Stick', () => {
  it('strictly hides touch controls on desktop KBM & Gamepad and reveals ONLY on real touch', () => {
    let pads: Array<GamepadLike | null> = [];
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS },
      getGamepads: () => pads,
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(true);

    // Default desktop boot: strictly invisible -> ZERO canvas draw calls!
    expect(input.getInputMode()).toBe('kbm');
    expect(input.isTouchOverlayVisible()).toBe(false);
    const spyDesktop = createSpyCanvasContext();
    input.renderTouchOverlay(spyDesktop.ctx, LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, true, 1);
    expect(spyDesktop.calls.length).toBe(0);

    // Touch event activates touch mode and overlay becomes visible
    input.simulateTouchStartLogical(1, 70, 170);
    expect(input.getInputMode()).toBe('touch');
    expect(input.isTouchOverlayVisible()).toBe(true);
    const spyTouch = createSpyCanvasContext();
    input.renderTouchOverlay(spyTouch.ctx, LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, true, 1);
    expect(spyTouch.calls.length).toBeGreaterThan(0);

    // Mouse move immediately hides touch overlay and clears active sticks!
    input.simulateMouseMoveLogical(200, 120);
    expect(input.getInputMode()).toBe('kbm');
    expect(input.isTouchOverlayVisible()).toBe(false);
    expect(input.getTouchManager().hasActiveTouches()).toBe(false);

    // Touch again -> visible, then keyboard press immediately hides!
    input.simulateTouchStartLogical(2, 70, 170);
    expect(input.isTouchOverlayVisible()).toBe(true);
    input.simulateKeyDown('KeyW');
    expect(input.getInputMode()).toBe('kbm');
    expect(input.isTouchOverlayVisible()).toBe(false);
    input.simulateKeyUp('KeyW');

    // Touch again -> visible, then gamepad activity immediately hides!
    input.simulateTouchStartLogical(3, 70, 170);
    expect(input.isTouchOverlayVisible()).toBe(true);
    pads = [makePad({ pressed: { 0: true } })];
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 120);
    input.consumeSimInput(cam, 160, 120);
    expect(input.getInputMode()).toBe('gamepad');
    expect(input.isTouchOverlayVisible()).toBe(false);

    // Touch controls set to 'off' -> remains strictly invisible AND does not hijack mode/aim during gameplay!
    pads = [];
    input.simulateMouseMoveLogical(240, 80);
    expect(input.getInputMode()).toBe('kbm');
    input.setControlSettings({ ...DEFAULT_CONTROL_SETTINGS, touchMode: 'off' });
    input.simulateTouchStartLogical(4, 70, 170);
    expect(input.getInputMode()).toBe('kbm');
    expect(input.isTouchOverlayVisible()).toBe(false);
    const kbmFrame = input.consumeSimInput(cam, 160, 120);
    expect(kbmFrame.aimWorldX).toBeCloseTo(240, 3);
    expect(kbmFrame.aimWorldY).toBeCloseTo(80, 3);
    const spyOff = createSpyCanvasContext();
    input.renderTouchOverlay(spyOff.ctx, LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, true, 1);
    expect(spyOff.calls.length).toBe(0);

    // Even if touchMode is toggled 'off' while already in 'touch' mode, gameplay aim falls back cleanly to cursor!
    input.setControlSettings({ ...DEFAULT_CONTROL_SETTINGS, touchMode: 'auto' });
    input.simulateTouchStartLogical(5, 70, 170);
    expect(input.getInputMode()).toBe('touch');
    input.setControlSettings({ ...DEFAULT_CONTROL_SETTINGS, touchMode: 'off' });
    expect(input.isTouchOverlayVisible()).toBe(false);
    const fallbackFrame = input.consumeSimInput(cam, 160, 120);
    expect(Number.isFinite(fallbackFrame.aimWorldX)).toBe(true);
    expect(Number.isFinite(fallbackFrame.aimWorldY)).toBe(true);
  });

  it('calibrates cold-boot Linux xpad and generic non-standard pads transitioning [0..0] -> [-1] without locking right stick', () => {
    // 1. Cold-boot Linux xpad Xbox controller starting at [0,0,0,0,0,0,0,0]
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0, 0, 0],
        buttonCount: 11,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads });
    const cold = gm.poll();
    expect(cold.profile).toBe('linux-xpad');
    expect(cold.fireHeld).toBe(false);
    expect(cold.activeHeld).toBe(false);
    expect(cold.aimActive).toBe(false);

    // LT & RT settle to -1.0 after first touch -> MUST NOT lock right stick left or fire!
    pads[0] = makePad({
      index: 0,
      id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
      mapping: '',
      axes: [0, 0, -1, 0, 0, -1, 0, 0],
      buttonCount: 11,
    });
    const settled = gm.poll();
    expect(settled.aimActive).toBe(false);
    expect(settled.fireHeld).toBe(false);
    expect(settled.activeHeld).toBe(false);

    // Pull RT (axes[5]=0.6) & push R-stick up (axes[4]=-0.95) -> works cleanly!
    pads[0] = makePad({
      index: 0,
      id: 'Microsoft X-Box One pad (Vendor: 045e Product: 02ea)',
      mapping: '',
      axes: [0, 0, -1, 0, -0.95, 0.6, 0, 0],
      buttonCount: 11,
    });
    const live = gm.poll();
    expect(live.fireHeld).toBe(true);
    expect(live.aimActive).toBe(true);
    expect(live.aimDirY).toBeCloseTo(-1, 3);

    // 2. Cold-boot generic unknown non-standard pad starting at [0,0,0,0,0,0] then settling triggers to -1
    let genPads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Generic USB Controller',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0],
        buttonCount: 12,
      }),
    ];
    const gmGen = new GamepadManager({ getGamepads: () => genPads });
    expect(gmGen.poll().fireHeld).toBe(false);

    // Triggers on axes[2] & axes[5] settle to -1.0 -> auto-recalibrates immediately!
    genPads[0] = makePad({
      index: 0,
      id: 'Generic USB Controller',
      mapping: '',
      axes: [0, 0, -1, 0, 0, -1],
      buttonCount: 12,
    });
    const genSettled = gmGen.poll();
    expect(genSettled.profile).toBe('linux-xpad');
    expect(genSettled.aimActive).toBe(false);
    expect(genSettled.fireHeld).toBe(false);
    expect(genSettled.activeHeld).toBe(false);

    // Pull RT (axes[5]=0.8) -> fires cleanly!
    genPads[0] = makePad({
      index: 0,
      id: 'Generic USB Controller',
      mapping: '',
      axes: [0, 0, -1, 0.85, 0, 0.8],
      buttonCount: 12,
    });
    const genLive = gmGen.poll();
    expect(genLive.fireHeld).toBe(true);
    expect(genLive.aimDirX).toBeCloseTo(1, 3);
  });

  it('suppresses delayed compatibility MouseEvents after touch while allowing real mouse PointerEvents immediately', () => {
    let now = 1000;
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS },
      nowMs: () => now,
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(true);

    // Minimal mock canvas + listener registry to exercise DOM event handlers directly in Node
    const canvasListeners = new Map<string, (e: unknown) => void>();
    const mockCanvas = {
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
      addEventListener: (type: string, fn: (e: unknown) => void) => canvasListeners.set(type, fn),
      removeEventListener: (type: string) => canvasListeners.delete(type),
    } as unknown as HTMLCanvasElement;
    input.attach(mockCanvas);

    // Real touch PointerEvent enters touch mode
    canvasListeners.get('pointerdown')?.({
      pointerType: 'touch',
      pointerId: 7,
      clientX: 60,
      clientY: 160,
      button: 0,
      preventDefault: () => {},
    });
    expect(input.getInputMode()).toBe('touch');

    // Delayed compatibility MouseEvent 120ms later (no sourceCapabilities on Safari/Firefox) MUST NOT exit touch mode
    now += 120;
    canvasListeners.get('mousedown')?.({
      clientX: 60,
      clientY: 160,
      button: 0,
    });
    expect(input.getInputMode()).toBe('touch');

    // Real mouse PointerEvent immediately switches back to 'kbm' even within 450ms!
    now += 10;
    canvasListeners.get('pointerdown')?.({
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 160,
      clientY: 120,
      button: 0,
      preventDefault: () => {},
    });
    expect(input.getInputMode()).toBe('kbm');
    expect(input.isTouchOverlayVisible()).toBe(false);

    input.detach();
  });

  it('drives floating left move stick with gentle follow, right aim+fire stick with 52% threshold, aim persistence, and edge ghost triggers', () => {
    const touch = new TouchControlsManager();
    touch.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);

    // 1. Left thumb lands at (64, 165) -> floating origin anchors right where thumb landed
    touch.handleGameplayTouchStart(10, 64, 165);
    expect(touch.getMoveStickState().active).toBe(true);
    expect(touch.getMoveStickState().originX).toBe(64);
    expect(touch.getMoveStickState().originY).toBe(165);

    // Drag far right past follow distance -> origin gently follows thumb
    touch.handleGameplayTouchMove(10, 64 + TOUCH_MOVE_STICK_RADIUS * 2, 165);
    expect(touch.getMoveStickState().originX).toBeGreaterThan(64);
    const s1 = touch.sampleGameplay();
    expect(s1.moveX).toBeCloseTo(1, 3);
    expect(s1.moveY).toBeCloseTo(0, 3);

    // 2. Right thumb lands at (240, 160) -> drag 35% of radius: aims cleanly WITHOUT firing!
    touch.handleGameplayTouchStart(20, 240, 160);
    touch.handleGameplayTouchMove(20, 240, 160 - TOUCH_AIM_STICK_RADIUS * 0.35);
    const sAimOnly = touch.sampleGameplay();
    expect(sAimOnly.aimActive).toBe(true);
    expect(sAimOnly.aimDirX).toBeCloseTo(0, 3);
    expect(sAimOnly.aimDirY).toBeCloseTo(-1, 3);
    expect(sAimOnly.fireHeld).toBe(false);
    expect(sAimOnly.firePressed).toBe(false);

    // Push past 52% fire threshold -> fires continuously while aiming!
    const fireDist = TOUCH_AIM_STICK_RADIUS * (TOUCH_AIM_FIRE_THRESHOLD + 0.25);
    touch.handleGameplayTouchMove(20, 240 + fireDist, 160);
    const sFire = touch.sampleGameplay();
    expect(sFire.fireHeld).toBe(true);
    expect(sFire.firePressed).toBe(true);
    expect(sFire.aimDirX).toBeCloseTo(1, 3);
    expect(sFire.aimDirY).toBeCloseTo(0, 3);

    // Release right thumb -> stops firing, RETAINS last aim direction, and fades completely to 0
    touch.handleGameplayTouchEnd(20);
    const sAfterRelease = touch.sampleGameplay();
    expect(sAfterRelease.fireHeld).toBe(false);
    expect(sAfterRelease.aimDirX).toBeCloseTo(1, 3);
    expect(sAfterRelease.aimDirY).toBeCloseTo(0, 3);
    for (let i = 0; i < 20; i++) touch.updateFade(0.033);
    expect(touch.getAimStickState().alpha).toBe(0);

    // 3. Edge ghost triggers work concurrently alongside movement stick and stay strictly in far margins
    // Check both 4:3 and 16:9 widescreen trigger placement
    for (const w of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const checkRects = computeTouchTriggerRects(w, LOGICAL_HEIGHT);
      expect(checkRects.find((r) => r.id === 'active')!.x + 26).toBeLessThanOrEqual(32);
      expect(checkRects.find((r) => r.id === 'swap')!.x).toBeGreaterThanOrEqual(w - 32);
      expect(checkRects.find((r) => r.id === 'pickup')!.x).toBeGreaterThanOrEqual(w - 32);
      expect(checkRects.find((r) => r.id === 'pause')!.y).toBeGreaterThanOrEqual(46);
    }

    touch.setLogicalSize(LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    const rects = computeTouchTriggerRects(LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    const actRect = rects.find((r) => r.id === 'active')!;
    const swpRect = rects.find((r) => r.id === 'swap')!;
    const useRect = rects.find((r) => r.id === 'pickup')!;
    const pauseRect = rects.find((r) => r.id === 'pause')!;

    touch.handleGameplayTouchStart(30, actRect.x + 5, actRect.y + 5);
    touch.handleGameplayTouchStart(31, swpRect.x + 5, swpRect.y + 5);
    touch.handleGameplayTouchStart(32, useRect.x + 5, useRect.y + 5);
    touch.handleGameplayTouchStart(33, pauseRect.x + 5, pauseRect.y + 5);
    const sTrig = touch.sampleGameplay();
    expect(sTrig.activeHeld).toBe(true);
    expect(sTrig.activePressed).toBe(true);
    expect(sTrig.swapPressed).toBe(true);
    expect(sTrig.pickupPressed).toBe(true);
    expect(sTrig.pausePressed).toBe(true);
    expect(sTrig.moveX).toBeCloseTo(1, 3); // left thumb still moving smoothly!
  });
});

describe('input-controls: End-to-End Controller & Touch UI Navigation (Zero Keyboard/Mouse)', () => {
  it('navigates Title -> Options (all 3 tabs & sliders) -> Campfire (mutants/skin/crown/gold/start) -> Mutation -> Pause -> GameOver purely via Gamepad', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    let pads: Array<GamepadLike | null> = [];
    let now = 1000;
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: save.controls,
      getGamepads: () => pads,
      nowMs: () => now,
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);

    const makeCtx = (
      screen: MenuRenderContext['screen'],
      simState: SimState | null = null,
    ): MenuRenderContext => ({
      screen,
      save,
      simState,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: now / 1000,
      returnScreenFromOptions: 'title',
      inputMode: input.getInputMode(),
      gamepadConnected: true,
      gamepadName: 'Tesla Controller',
      gamepadProfile: 'linux-xpad',
    });

    const stepPad = (
      screen: MenuRenderContext['screen'],
      pressed: Record<number, number | boolean>,
      axes: number[] = [0, 0, 0, 0],
      simState: SimState | null = null,
    ) => {
      now += 60;
      pads = [makePad({ axes, pressed })];
      const snap = input.consumeMenuInput();
      return menus.update(snap, makeCtx(screen, simState));
    };

    const releasePad = () => {
      now += 60;
      pads = [makePad({})];
      input.consumeMenuInput();
    };

    // 1. Title: Down -> Options (idx 1), A -> opens Options
    stepPad('title', { 13: true }); // D-pad Down
    expect(menus.getFocusedIndex()).toBe(1);
    releasePad();
    const openOptActions = stepPad('title', { 0: true }); // A Confirm
    expect(openOptActions.some((a) => a.type === 'open_screen' && a.screen === 'options')).toBe(true);
    releasePad();

    // 2. Options: RB switches VIDEO/AUDIO -> CONTROLS tab
    expect(menus.getOptionsTab()).toBe('general');
    stepPad('options', { 5: true }); // RB nextTab
    expect(menus.getOptionsTab()).toBe('controls');
    releasePad();

    // In CONTROLS tab: A toggles Aim Assist (idx 0)
    const toggleAssist = stepPad('options', { 0: true });
    expect(
      toggleAssist.some(
        (a) => a.type === 'update_controls' && a.partial.gamepadAimAssist === false,
      ),
    ).toBe(true);
    releasePad();

    // Down -> Rumble (idx 1), Down -> Deadzone slider (idx 2), Right adjusts deadzone!
    stepPad('options', { 13: true });
    releasePad();
    stepPad('options', { 13: true });
    expect(menus.getFocusedIndex()).toBe(2);
    releasePad();
    const dzAdj = stepPad('options', { 15: true }); // D-pad Right
    expect(
      dzAdj.some(
        (a) =>
          a.type === 'update_controls' &&
          typeof a.partial.gamepadDeadzone === 'number' &&
          a.partial.gamepadDeadzone > save.controls.gamepadDeadzone,
      ),
    ).toBe(true);
    releasePad();

    // Down -> Touch Controls (idx 3), A toggles auto -> off
    stepPad('options', { 13: true });
    releasePad();
    const touchToggle = stepPad('options', { 0: true });
    expect(
      touchToggle.some((a) => a.type === 'update_controls' && a.partial.touchMode === 'off'),
    ).toBe(true);
    releasePad();

    // RB -> KEYBINDS tab, LB -> back to CONTROLS, LB -> VIDEO/AUDIO, B -> returns to Title
    stepPad('options', { 5: true });
    expect(menus.getOptionsTab()).toBe('keybinds');
    releasePad();
    stepPad('options', { 4: true });
    expect(menus.getOptionsTab()).toBe('controls');
    releasePad();
    const backFromOpt = stepPad('options', { 1: true }); // B Back
    expect(backFromOpt.some((a) => a.type === 'open_screen' && a.screen === 'title')).toBe(true);
    releasePad();

    // 3. Campfire: cycle mutants, LB toggles skin, RB cycles crown, Y toggles golden, Up focuses loadout bar, A starts run
    const nextMut = stepPad('campfire', { 15: true }); // D-pad Right
    expect(nextMut.some((a) => a.type === 'select_mutant' && a.mutant === 'crystal')).toBe(true);
    save.selectedMutant = 'crystal';
    save.mutants.crystal.goldenWeapon = 'golden_revolver';
    releasePad();

    const skinAct = stepPad('campfire', { 4: true }); // LB
    expect(skinAct.some((a) => a.type === 'toggle_bskin' && a.mutant === 'crystal')).toBe(true);
    releasePad();

    const crownAct = stepPad('campfire', { 5: true }); // RB
    expect(crownAct.some((a) => a.type === 'cycle_crown' && a.crown !== 'none')).toBe(true);
    releasePad();

    const goldAct = stepPad('campfire', { 3: true }); // Y
    expect(goldAct.some((a) => a.type === 'toggle_golden' && a.enabled === true)).toBe(true);
    releasePad();

    stepPad('campfire', { 12: true }); // Up into action bar
    expect(menus.getCampfireFocus().row).toBe('actions');
    releasePad();
    stepPad('campfire', { 13: true }); // Down back to roster
    expect(menus.getCampfireFocus().row).toBe('roster');
    releasePad();

    const startAct = stepPad('campfire', { 0: true }); // A starts run!
    expect(startAct.some((a) => a.type === 'start_run' && a.mutant === 'crystal')).toBe(true);
    releasePad();

    // 4. Mutation Select: D-pad Right picks card 1, A confirms
    const fakeSim = {
      pendingMutations: ['rhino_skin', 'trigger_fingers', 'rabbit_paw'],
      pendingUltras: ['crystal_a', 'crystal_b'],
    } as unknown as SimState;
    stepPad('mutation_select', { 15: true }, [0, 0, 0, 0], fakeSim);
    expect(menus.getFocusedIndex()).toBe(1);
    releasePad();
    const pickMut = stepPad('mutation_select', { 0: true }, [0, 0, 0, 0], fakeSim);
    expect(
      pickMut.some(
        (a) => a.type === 'pick_mutation' && a.index === 1 && a.mutationId === 'trigger_fingers',
      ),
    ).toBe(true);
    releasePad();

    // 5. Pause: B resumes cleanly, Back/Select quick-restarts
    const resumeAct = stepPad('paused', { 1: true });
    expect(resumeAct.some((a) => a.type === 'resume')).toBe(true);
    releasePad();
    const pauseRestart = stepPad('paused', { 8: true });
    expect(pauseRestart.some((a) => a.type === 'restart')).toBe(true);
    releasePad();

    // 6. Game Over: Right focuses CAMPFIRE (idx 1), A confirms CAMPFIRE; Back quick-restarts!
    stepPad('game_over', { 15: true });
    expect(menus.getFocusedIndex()).toBe(1);
    releasePad();
    const goCamp = stepPad('game_over', { 0: true });
    expect(goCamp.some((a) => a.type === 'open_screen' && a.screen === 'campfire')).toBe(true);
    releasePad();
    const quickRetry = stepPad('game_over', { 8: true });
    expect(quickRetry.some((a) => a.type === 'restart')).toBe(true);
  });

  it('supports touch tap activation across menu screens using exact logical coordinates', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const input = new InputManager(DEFAULT_KEYBINDINGS, { controls: save.controls });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(false);

    const spy = createSpyCanvasContext();
    const ctx: MenuRenderContext = {
      screen: 'title',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      inputMode: 'touch',
    };
    menus.render(spy.ctx, ctx);

    const playRegion = menus.getHitRegions().find((r) => r.id === 'title_play')!;
    expect(playRegion).toBeDefined();

    input.simulateTouchStartLogical(50, playRegion.x + 10, playRegion.y + 8);
    const actions = menus.update(input.consumeMenuInput(), ctx);
    input.simulateTouchEnd(50);

    expect(actions.some((a) => a.type === 'open_screen' && a.screen === 'campfire')).toBe(true);
  });

  it('integrates aim assist inside InputManager.consumeSimInput, fires onUserInteraction for audio unlock, and handles late trigger calibration + Options sliders/keybind cancel', () => {
    const unlockedModes: string[] = [];
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.2857], // cold boot before triggers report -1
        buttonCount: 14,
      }),
    ];
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS, gamepadAimAssist: true },
      getGamepads: () => pads,
      onUserInteraction: (mode) => unlockedModes.push(mode),
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(true);

    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 160);
    const openMap = makeTestMap(24, 24);

    // Cold boot frame -> later triggers settle to -1.0 -> dynamically calibrated to rest (no stuck fire!)
    input.consumeSimInput(cam, 160, 160, { enemies: [], map: openMap });
    pads[0] = makePad({
      index: 0,
      id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
      mapping: '',
      axes: [0, 0, 0.95, -1, -1, 0, 0, 0, 0, 3.2857], // aiming +X, triggers settled to -1
      buttonCount: 14,
    });
    const assistedFrame = input.consumeSimInput(cam, 160, 160, {
      enemies: [{ x: 240, y: 170, hp: 10, radius: 7 }],
      map: openMap,
    });
    expect(assistedFrame.fireHeld).toBe(false);
    expect(assistedFrame.activeHeld).toBe(false);
    expect(assistedFrame.aimWorldX).toBeGreaterThan(220);
    expect(assistedFrame.aimWorldY).toBeGreaterThan(162); // gently magnetized toward y=170
    expect(unlockedModes).toContain('gamepad');

    // Options VIDEO/AUDIO slider navigation + Keybind cancel on Back (B)
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const optCtx: MenuRenderContext = {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'paused',
      inputMode: 'gamepad',
    };
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
    // Move down 6 times to Master Volume slider (idx 6), then press Left to lower volume
    for (let i = 0; i < 6; i++) {
      menus.update({ ...blankSnap, navDown: true }, optCtx);
    }
    expect(menus.getFocusedIndex()).toBe(6);
    const volDown = menus.update({ ...blankSnap, navLeft: true }, optCtx);
    expect(
      volDown.some(
        (a) =>
          a.type === 'update_audio' &&
          typeof a.partial.masterVolume === 'number' &&
          a.partial.masterVolume < save.audio.masterVolume,
      ),
    ).toBe(true);

    // Pressing Back while rebinding cancels rebind instead of closing Options
    const cancelAct = menus.update({ ...blankSnap, back: true }, { ...optCtx, rebindingField: 'up' });
    expect(cancelAct.some((a) => a.type === 'cancel_rebind')).toBe(true);
    expect(cancelAct.some((a) => a.type === 'open_screen')).toBe(false);
  });
});

describe('input-controls: Chromium Chorded LMB+RMB & Rapid Menu Nav Queue Regressions', () => {
  it('handles Chromium W3C PointerEvent + MouseEvent chorded LMB+RMB press and partial RMB release without drop or stuck RMB', () => {
    let now = 1000;
    const input = new InputManager(DEFAULT_KEYBINDINGS, {
      controls: { ...DEFAULT_CONTROL_SETTINGS },
      nowMs: () => now,
    });
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    input.setGameplayActive(true);

    const canvasListeners = new Map<string, (e: unknown) => void>();
    const windowListeners = new Map<string, (e: unknown) => void>();
    const origWindow = globalThis.window;
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (type: string, fn: (e: unknown) => void) => windowListeners.set(type, fn),
      removeEventListener: (type: string) => windowListeners.delete(type),
    };

    const mockCanvas = {
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
      addEventListener: (type: string, fn: (e: unknown) => void) => canvasListeners.set(type, fn),
      removeEventListener: (type: string) => canvasListeners.delete(type),
    } as unknown as HTMLCanvasElement;

    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 120);

    try {
      input.attach(mockCanvas);

      // 1. Exact Chromium chord sequence (Steroids dual-wield):
      //    Press LMB (pointerdown btn=0, buttons=1 -> mousedown btn=0, buttons=1)
      canvasListeners.get('pointerdown')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 200,
        clientY: 120,
        button: 0,
        buttons: 1,
        preventDefault: () => {},
      });
      now += 1;
      canvasListeners.get('mousedown')?.({
        clientX: 200,
        clientY: 120,
        button: 0,
        buttons: 1,
      });

      //    2ms later while holding LMB, press RMB: Chromium fires pointermove(buttons=3) + mousedown(btn=2, buttons=3)
      //    (NO second pointerdown!). Both LMB & RMB must activate cleanly!
      now += 2;
      windowListeners.get('pointermove')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 200,
        clientY: 120,
        button: 2,
        buttons: 3,
      });
      canvasListeners.get('mousedown')?.({
        clientX: 200,
        clientY: 120,
        button: 2,
        buttons: 3,
      });

      const dualFrame = input.consumeSimInput(cam, 160, 120);
      expect(dualFrame.fireHeld).toBe(true);
      expect(dualFrame.firePressed).toBe(true);
      expect(dualFrame.activeHeld).toBe(true);
      expect(dualFrame.activePressed).toBe(true);

      // 2. While holding LMB and moving cursor, release RMB:
      //    Chromium fires pointermove(buttons=1) + mouseup(btn=2, buttons=1) (NO pointerup!).
      //    RMB MUST release immediately and NEVER stick held!
      now += 20;
      windowListeners.get('pointermove')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 210,
        clientY: 125,
        button: -1,
        buttons: 3,
      });
      now += 2;
      windowListeners.get('pointermove')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 212,
        clientY: 125,
        button: 2,
        buttons: 1,
      });
      windowListeners.get('mouseup')?.({
        clientX: 212,
        clientY: 125,
        button: 2,
        buttons: 1,
      });

      const afterRmbRelease = input.consumeSimInput(cam, 160, 120);
      expect(afterRmbRelease.fireHeld).toBe(true);
      expect(afterRmbRelease.activeHeld).toBe(false);

      // 3. Release last button (LMB): Chromium fires pointerup(btn=0, buttons=0) + mouseup(btn=0, buttons=0)
      now += 15;
      windowListeners.get('pointerup')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 212,
        clientY: 125,
        button: 0,
        buttons: 0,
      });
      windowListeners.get('mouseup')?.({
        clientX: 212,
        clientY: 125,
        button: 0,
        buttons: 0,
      });

      const idleFrame = input.consumeSimInput(cam, 160, 120);
      expect(idleFrame.fireHeld).toBe(false);
      expect(idleFrame.activeHeld).toBe(false);

      // 4. Fallback per-button dedup path (even if pointermove didn't carry chord update):
      //    LMB pointerdown at t=2000, RMB mousedown at t=2002 (< 12ms!), cursor pointermove at t=2030, RMB mouseup at t=2032 (< 6ms!)
      now = 2000;
      canvasListeners.get('pointerdown')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 180,
        clientY: 120,
        button: 0,
        preventDefault: () => {},
      });
      now = 2002;
      canvasListeners.get('mousedown')?.({
        clientX: 180,
        clientY: 120,
        button: 2,
      });
      const fallbackDual = input.consumeSimInput(cam, 160, 120);
      expect(fallbackDual.fireHeld).toBe(true);
      expect(fallbackDual.activeHeld).toBe(true);

      now = 2030;
      windowListeners.get('pointermove')?.({
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 190,
        clientY: 120,
      });
      now = 2032;
      windowListeners.get('mouseup')?.({
        clientX: 190,
        clientY: 120,
        button: 2,
      });
      const fallbackReleased = input.consumeSimInput(cam, 160, 120);
      expect(fallbackReleased.fireHeld).toBe(true);
      expect(fallbackReleased.activeHeld).toBe(false);

      input.detach();
    } finally {
      (globalThis as unknown as { window: unknown }).window = origWindow;
    }
  });

  it('queues rapid menu directional taps so 3 fast ArrowDown presses advance 3 items instead of collapsing into 1', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const input = new InputManager(DEFAULT_KEYBINDINGS, { controls: save.controls });
    input.setGameplayActive(false);

    const pauseCtx: MenuRenderContext = {
      screen: 'paused',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      inputMode: 'kbm',
    };

    // Rapidly tap ArrowDown 3 times within a single frame before any consumeMenuInput() poll
    for (let i = 0; i < 3; i++) {
      input.simulateKeyDown('ArrowDown');
      input.simulateKeyUp('ArrowDown');
    }

    // Drains exactly 1 step per frame -> moves Pause focus 0 -> 1 -> 2 -> 3 cleanly!
    const s1 = input.consumeMenuInput();
    expect(s1.navDown).toBe(true);
    menus.update(s1, pauseCtx);
    expect(menus.getFocusedIndex()).toBe(1);

    const s2 = input.consumeMenuInput();
    expect(s2.navDown).toBe(true);
    menus.update(s2, pauseCtx);
    expect(menus.getFocusedIndex()).toBe(2);

    const s3 = input.consumeMenuInput();
    expect(s3.navDown).toBe(true);
    menus.update(s3, pauseCtx);
    expect(menus.getFocusedIndex()).toBe(3);

    const s4 = input.consumeMenuInput();
    expect(s4.navDown).toBe(false);

    // Rapid 3x ArrowDown + Enter on Pause defers confirm to the frame AFTER the final nav step
    // so MenuSystem's `else if (input.confirm)` executes Enter cleanly instead of dropping it!
    const pauseMenus = new MenuSystem(bundle);
    for (let i = 0; i < 3; i++) {
      input.simulateKeyDown('ArrowDown');
      input.simulateKeyUp('ArrowDown');
    }
    input.simulateKeyDown('Enter');
    input.simulateKeyUp('Enter');

    const q1 = input.consumeMenuInput();
    expect(q1.navDown).toBe(true);
    expect(q1.confirm).toBe(false);
    expect(pauseMenus.update(q1, pauseCtx).some((a) => a.type === 'open_screen')).toBe(false);
    expect(pauseMenus.getFocusedIndex()).toBe(1);

    const q2 = input.consumeMenuInput();
    expect(q2.navDown).toBe(true);
    expect(q2.confirm).toBe(false);
    expect(pauseMenus.update(q2, pauseCtx).some((a) => a.type === 'open_screen')).toBe(false);
    expect(pauseMenus.getFocusedIndex()).toBe(2);

    const q3 = input.consumeMenuInput();
    expect(q3.navDown).toBe(true);
    expect(q3.confirm).toBe(false);
    expect(pauseMenus.update(q3, pauseCtx).some((a) => a.type === 'open_screen')).toBe(false);
    expect(pauseMenus.getFocusedIndex()).toBe(3);

    const q4 = input.consumeMenuInput();
    expect(q4.navDown).toBe(false);
    expect(q4.confirm).toBe(true);
    const confirmActions = pauseMenus.update(q4, pauseCtx);
    expect(confirmActions.some((a) => a.type === 'open_screen' && a.screen === 'campfire')).toBe(true);

    // Rapid 2x ArrowRight + Enter on Mutation Select picks card 2 cleanly without dropping Enter
    const mutMenus = new MenuSystem(bundle);
    const mutSim = {
      pendingMutations: ['rhino_skin', 'trigger_fingers', 'rabbit_paw'],
      pendingUltras: ['fish_a', 'fish_b'],
    } as unknown as SimState;
    const mutCtx: MenuRenderContext = {
      screen: 'mutation_select',
      save,
      simState: mutSim,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      inputMode: 'kbm',
    };
    input.simulateKeyDown('ArrowRight');
    input.simulateKeyUp('ArrowRight');
    input.simulateKeyDown('ArrowRight');
    input.simulateKeyUp('ArrowRight');
    input.simulateKeyDown('Enter');
    input.simulateKeyUp('Enter');

    const m1 = input.consumeMenuInput();
    expect(m1.navRight).toBe(true);
    expect(m1.confirm).toBe(false);
    mutMenus.update(m1, mutCtx);
    const m2 = input.consumeMenuInput();
    expect(m2.navRight).toBe(true);
    expect(m2.confirm).toBe(false);
    mutMenus.update(m2, mutCtx);
    const m3 = input.consumeMenuInput();
    expect(m3.navRight).toBe(false);
    expect(m3.confirm).toBe(true);
    const mutPickActions = mutMenus.update(m3, mutCtx);
    expect(
      mutPickActions.some(
        (a) => a.type === 'pick_mutation' && a.index === 2 && a.mutationId === 'rabbit_paw',
      ),
    ).toBe(true);

    // clearMenuLatches wipes any pending buffered taps cleanly on screen switch
    input.simulateKeyDown('ArrowUp');
    input.simulateKeyUp('ArrowUp');
    input.simulateKeyDown('ArrowUp');
    input.simulateKeyUp('ArrowUp');
    input.clearMenuLatches();
    expect(input.consumeMenuInput().navUp).toBe(false);
  });
});
