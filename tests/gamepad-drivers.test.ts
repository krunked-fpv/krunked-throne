import { describe, expect, it, vi } from 'vitest';
import {
  GamepadManager,
  detectGamepadFamily,
  getGamepadGlyphs,
  isPhantomGamepad,
  type GamepadButtonLike,
  type GamepadFamily,
  type GamepadHapticActuatorLike,
  type GamepadLike,
  type GamepadVibrationActuatorLike,
} from '@/input';

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
  hapticActuators?: readonly GamepadHapticActuatorLike[] | null;
}): GamepadLike {
  return {
    index: opts.index ?? 0,
    id: opts.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    connected: opts.connected ?? true,
    mapping: opts.mapping ?? 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: makeButtons(opts.buttonCount ?? 17, opts.pressed),
    vibrationActuator: opts.vibrationActuator,
    hapticActuators: opts.hapticActuators,
  };
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
const TESLA_UA =
  'Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/114.0.5735.198 Safari/537.36 Tesla/2024.20.9-abcdef';

describe('gamepad-drivers: Controller Family Detection & ASCII-Safe Glyphs', () => {
  it('classifies Xbox, PlayStation, Nintendo, Tesla, Jowua, 8BitDo, Logitech, Steam Deck, Stadia, and Generic controllers accurately', () => {
    // Xbox family
    expect(
      detectGamepadFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)', DESKTOP_UA),
    ).toBe('xbox');
    expect(detectGamepadFamily('Microsoft X-Box 360 pad', DESKTOP_UA)).toBe('xbox');
    expect(detectGamepadFamily('XInput STANDARD GAMEPAD', DESKTOP_UA)).toBe('xbox');
    expect(detectGamepadFamily('xpad USB controller', DESKTOP_UA)).toBe('xbox');
    expect(detectGamepadFamily('Xbox Elite Wireless Controller Series 2', DESKTOP_UA)).toBe('xbox');
    expect(detectGamepadFamily('Backbone One', DESKTOP_UA)).toBe('xbox');
    expect(detectGamepadFamily('Razer Kishi V2', DESKTOP_UA)).toBe('xbox');

    // PlayStation family
    expect(
      detectGamepadFamily('Wireless Controller (Vendor: 054c Product: 0ce6)', DESKTOP_UA),
    ).toBe('playstation');
    expect(detectGamepadFamily('DualSense Wireless Controller', DESKTOP_UA)).toBe('playstation');
    expect(detectGamepadFamily('Sony DualShock 4', DESKTOP_UA)).toBe('playstation');
    expect(detectGamepadFamily('PlayStation 5 Controller', DESKTOP_UA)).toBe('playstation');
    expect(detectGamepadFamily('PS4 Gamepad', DESKTOP_UA)).toBe('playstation');
    expect(detectGamepadFamily('PS5 Pad', DESKTOP_UA)).toBe('playstation');
    expect(detectGamepadFamily('Wireless Controller', DESKTOP_UA)).toBe('playstation');

    // Nintendo family
    expect(
      detectGamepadFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', DESKTOP_UA),
    ).toBe('nintendo');
    expect(detectGamepadFamily('Nintendo Switch Pro Controller', DESKTOP_UA)).toBe('nintendo');
    expect(detectGamepadFamily('Joy-Con (L+R)', DESKTOP_UA)).toBe('nintendo');
    expect(detectGamepadFamily('Joycon Combined', DESKTOP_UA)).toBe('nintendo');

    // Tesla / Jowua pads and Tesla MCU Chromium UA fallback
    expect(detectGamepadFamily('Tesla USB Controller', DESKTOP_UA)).toBe('tesla');
    expect(detectGamepadFamily('Jowua Wireless Controller', DESKTOP_UA)).toBe('tesla');
    expect(detectGamepadFamily('Generic USB Gamepad', TESLA_UA)).toBe('tesla');
    expect(detectGamepadFamily('8BitDo Ultimate Wireless', TESLA_UA)).toBe('tesla');

    // Real PlayStation / Nintendo / Xbox controllers plugged into a Tesla preserve their vendor family!
    expect(
      detectGamepadFamily('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', TESLA_UA),
    ).toBe('playstation');
    expect(
      detectGamepadFamily('Pro Controller (Vendor: 057e Product: 2009)', TESLA_UA),
    ).toBe('nintendo');
    expect(
      detectGamepadFamily('Xbox Wireless Controller (Vendor: 045e Product: 0b13)', TESLA_UA),
    ).toBe('xbox');

    // Generic on desktop
    expect(detectGamepadFamily('8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)', DESKTOP_UA)).toBe('generic');
    expect(detectGamepadFamily('Logitech Gamepad F310 (Vendor: 046d Product: c216)', DESKTOP_UA)).toBe('generic');
    expect(detectGamepadFamily('Steam Deck Virtual Gamepad', DESKTOP_UA)).toBe('generic');
    expect(detectGamepadFamily('Google Stadia Controller rev. A', DESKTOP_UA)).toBe('generic');
    expect(detectGamepadFamily('Generic USB Joystick', DESKTOP_UA)).toBe('generic');
  });

  it('returns exact pure-ASCII uppercase glyph sets with no Unicode symbols or ampersands', () => {
    const families: GamepadFamily[] = ['xbox', 'playstation', 'nintendo', 'tesla', 'generic'];

    expect(getGamepadGlyphs('xbox')).toEqual({
      family: 'xbox',
      familyLabel: 'XBOX',
      confirm: 'A',
      back: 'B',
      pickup: 'X',
      swap: 'Y',
      fire: 'RT',
      active: 'LT',
      prevTab: 'LB',
      nextTab: 'RB',
      pause: 'START',
      retry: 'BACK',
    });
    expect(getGamepadGlyphs('playstation')).toEqual({
      family: 'playstation',
      familyLabel: 'PLAYSTATION',
      confirm: 'X',
      back: 'O',
      pickup: 'SQ',
      swap: 'TRI',
      fire: 'R2',
      active: 'L2',
      prevTab: 'L1',
      nextTab: 'R1',
      pause: 'OPT',
      retry: 'SHARE',
    });
    expect(getGamepadGlyphs('nintendo')).toEqual({
      family: 'nintendo',
      familyLabel: 'NINTENDO',
      confirm: 'B',
      back: 'A',
      pickup: 'Y',
      swap: 'X',
      fire: 'ZR',
      active: 'ZL',
      prevTab: 'L',
      nextTab: 'R',
      pause: '+',
      retry: '-',
    });
    expect(getGamepadGlyphs('tesla')).toEqual({
      family: 'tesla',
      familyLabel: 'TESLA PAD',
      confirm: 'A',
      back: 'B',
      pickup: 'X',
      swap: 'Y',
      fire: 'RT',
      active: 'LT',
      prevTab: 'LB',
      nextTab: 'RB',
      pause: 'START',
      retry: 'BACK',
    });
    expect(getGamepadGlyphs('generic')).toEqual({
      family: 'generic',
      familyLabel: 'GAMEPAD',
      confirm: 'A',
      back: 'B',
      pickup: 'X',
      swap: 'Y',
      fire: 'RT',
      active: 'LT',
      prevTab: 'LB',
      nextTab: 'RB',
      pause: 'START',
      retry: 'BACK',
    });

    for (const fam of families) {
      const glyphs = getGamepadGlyphs(fam);
      for (const [key, val] of Object.entries(glyphs)) {
        if (key === 'family') continue;
        expect(typeof val).toBe('string');
        // Pure printable ASCII (0x20-0x7E), uppercase only (no a-z), and no '&'
        expect(val).toMatch(/^[\x20-\x7E]+$/);
        expect(val).not.toMatch(/[a-z&]/);
      }
    }
  });
});

describe('gamepad-drivers: Phantom HID Filtering', () => {
  it('detects and rejects phantom virtual/HID devices in both selectActivePad and gamepadconnected', () => {
    const spaceMouse = makePad({
      index: 0,
      id: '3Dconnexion Space Navigator',
      axes: [0, 0, 0, 0, 0, 0],
      buttonCount: 2,
    });
    const rgbLighting = makePad({
      index: 1,
      id: 'Corsair iCUE RGB Lighting Node',
      axes: [0, 0, 0, 0],
      buttonCount: 8,
    });
    const auraDevice = makePad({
      index: 2,
      id: 'ASUS AURA Motherboard LED',
      axes: [0, 0, 0, 0],
      buttonCount: 8,
    });
    const headsetAudio = makePad({
      index: 3,
      id: 'SteelSeries Arctis Headset Audio',
      axes: [0, 0, 0, 0],
      buttonCount: 6,
    });
    const touchscreenHid = makePad({
      index: 4,
      id: 'Tesla Touchscreen Digitizer',
      axes: [0, 0],
      buttonCount: 4,
    });
    const keyboardMouse = makePad({
      index: 5,
      id: 'Logitech Wireless Keyboard',
      axes: [0, 0],
      buttonCount: 10,
    });
    const tinyVirtual = makePad({
      index: 6,
      id: 'Virtual Volume Knob',
      axes: [0],
      buttonCount: 2,
    });

    expect(isPhantomGamepad(spaceMouse)).toBe(true);
    expect(isPhantomGamepad(rgbLighting)).toBe(true);
    expect(isPhantomGamepad(auraDevice)).toBe(true);
    expect(isPhantomGamepad(headsetAudio)).toBe(true);
    expect(isPhantomGamepad(touchscreenHid)).toBe(true);
    expect(isPhantomGamepad(keyboardMouse)).toBe(true);
    expect(isPhantomGamepad(tinyVirtual)).toBe(true);

    // Explicit gamepads/controllers with audio/RGB/touchpad words MUST NOT be rejected
    const rgbGamepad = makePad({
      index: 7,
      id: 'PDP Afterglow RGB Controller',
      axes: [0, 0, 0, 0],
      buttonCount: 16,
    });
    const ds4Touchpad = makePad({
      index: 8,
      id: 'DualShock 4 Touchpad Controller',
      axes: [0, 0, 0, 0],
      buttonCount: 17,
    });
    const retro2Axis = makePad({
      index: 9,
      id: 'USB Retro NES Pad',
      axes: [0, 0],
      buttonCount: 8,
    });
    const retroDpadOnly = makePad({
      index: 10,
      id: 'USB Arcade Fightstick',
      axes: [],
      buttonCount: 8,
    });

    expect(isPhantomGamepad(rgbGamepad)).toBe(false);
    expect(isPhantomGamepad(ds4Touchpad)).toBe(false);
    expect(isPhantomGamepad(retro2Axis)).toBe(false);
    expect(isPhantomGamepad(retroDpadOnly)).toBe(false);

    // selectActivePad skips phantoms and picks the real controller
    let pads: Array<GamepadLike | null> = [spaceMouse, rgbLighting, tinyVirtual];
    const onConnect = vi.fn();
    const gm = new GamepadManager({
      getGamepads: () => pads,
      onConnect,
      userAgent: DESKTOP_UA,
    });
    expect(gm.poll().connected).toBe(false);

    // Real pad added alongside phantoms -> picks real pad
    const realXbox = makePad({
      index: 2,
      id: 'Xbox Wireless Controller (Vendor: 045e Product: 02fd)',
      axes: [0, 0, 0, 0],
    });
    pads = [spaceMouse, rgbLighting, realXbox];
    const res = gm.poll();
    expect(res.connected).toBe(true);
    expect(res.padIndex).toBe(2);
    expect(res.family).toBe('xbox');

    // boundOnConnected ignores phantom events and accepts real pads
    const windowListeners = new Map<string, (e: Event) => void>();
    const origWindow = globalThis.window;
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (t: string, fn: (e: Event) => void) => windowListeners.set(t, fn),
      removeEventListener: (t: string) => windowListeners.delete(t),
    };
    try {
      const gm2 = new GamepadManager({ getGamepads: () => [], onConnect, userAgent: DESKTOP_UA });
      gm2.attachListeners();
      windowListeners.get('gamepadconnected')?.({ gamepad: spaceMouse } as unknown as Event);
      expect(onConnect).not.toHaveBeenCalled();
      expect(gm2.getConnectedInfo().connected).toBe(false);

      windowListeners.get('gamepadconnected')?.({ gamepad: realXbox } as unknown as Event);
      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(gm2.getConnectedInfo().connected).toBe(true);
      expect(gm2.getConnectedInfo().family).toBe('xbox');
      gm2.detachListeners();
    } finally {
      (globalThis as unknown as { window: unknown }).window = origWindow;
    }
  });
});

describe('gamepad-drivers: Xbox BT HID, Nintendo Switch Pro HID & Logitech DirectInput Mappers', () => {
  it('maps Xbox One S / Series X|S Bluetooth HID (xbox-bt-hid) across 2/5 triggers, 4/5 triggers, and btn 8/9 fallback', () => {
    // Variant 1: 4/5 resting -1 triggers, 16 buttons (0=A, 1=B, 3=X, 4=Y, 6=LB, 7=RB, 10=Back, 11=Start)
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b13)',
        mapping: '',
        axes: [0, 0, 0, 0, -1, -1, 0, 0],
        buttonCount: 16,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads, userAgent: TESLA_UA });
    const rest = gm.poll();
    expect(rest.profile).toBe('xbox-bt-hid');
    expect(rest.family).toBe('xbox');
    expect(rest.fireHeld).toBe(false);
    expect(rest.activeHeld).toBe(false);

    // Test face buttons + bumpers + Back/Start + RT pull + R-stick on axes[2/3] + Hat 6/7
    pads[0] = makePad({
      index: 0,
      id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b13)',
      mapping: '',
      axes: [0, 0, 0.9, 0, -1, 0.6, 1, 0],
      buttonCount: 16,
      pressed: { 0: true, 3: true, 4: true, 6: true, 10: true, 11: true },
    });
    const act = gm.poll();
    expect(act.menuConfirm).toBe(true); // btn 0 = A
    expect(act.pickupPressed).toBe(true); // btn 3 = X (and btn 0 = A)
    expect(act.menuTertiary).toBe(true); // btn 3 = X
    expect(act.swapPressed).toBe(true); // btn 4 = Y
    expect(act.menuPrevTab).toBe(true); // btn 6 = LB
    expect(act.retryPressed).toBe(true); // btn 10 = Back
    expect(act.pausePressed).toBe(true); // btn 11 = Start
    expect(act.fireHeld).toBe(true); // RT on axis 5 pulled
    expect(act.aimDirX).toBeCloseTo(1, 3);
    expect(act.moveX).toBe(1); // Hat axis 6 = +1 -> Right

    // Ensure button 1 = B (Back) and button 7 = RB (nextTab) and Guide/L3/R3/Share (12..15) do NOT trigger D-pad
    pads[0] = makePad({
      index: 0,
      id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b13)',
      mapping: '',
      axes: [0, 0, 0, 0, -1, -1, 0, 0],
      buttonCount: 16,
      pressed: { 1: true, 7: true, 12: true, 13: true, 14: true, 15: true },
    });
    const act2 = gm.poll();
    expect(act2.menuBack).toBe(true); // btn 1 = B
    expect(act2.menuNextTab).toBe(true); // btn 7 = RB
    expect(act2.moveX).toBe(0);
    expect(act2.moveY).toBe(0);

    // Variant 2: 2/5 resting -1 triggers with right stick on axes[3/4]
    let pads25: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Xbox Wireless Controller (Vendor: 045e Product: 02e0)',
        mapping: '',
        axes: [0, 0, -1, 0, -0.9, 0.5, 0, 0],
        buttonCount: 15,
      }),
    ];
    const gm25 = new GamepadManager({ getGamepads: () => pads25, userAgent: DESKTOP_UA });
    const res25 = gm25.poll();
    expect(res25.profile).toBe('xbox-bt-hid');
    expect(res25.fireHeld).toBe(true);
    expect(res25.activeHeld).toBe(false);
    expect(res25.aimDirY).toBeCloseTo(-1, 3);

    // Variant 3: Digital buttons 8/9 fallback for LT/RT on 4-axis BT stack
    let padsDigital: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Xbox Series X Controller (Vendor: 045e Product: 0b13)',
        mapping: '',
        axes: [0, 0, 0, 0],
        buttonCount: 15,
        pressed: { 8: true, 9: true },
      }),
    ];
    const gmDig = new GamepadManager({ getGamepads: () => padsDigital, userAgent: DESKTOP_UA });
    const resDig = gmDig.poll();
    expect(resDig.profile).toBe('xbox-bt-hid');
    expect(resDig.activeHeld).toBe(true);
    expect(resDig.fireHeld).toBe(true);
  });

  it('maps Nintendo Switch Pro / Joy-Con non-standard HID (nintendo-hid) including axes[9] hat, paired 6/7 hat, and dynamic axes[5] right-stick Y', () => {
    // 10-axis Switch Pro HID where right-stick Y is on axes[5] and POV hat is on axes[9]
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Pro Controller (Vendor: 057e Product: 2009)',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.285714],
        buttonCount: 14,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads, userAgent: TESLA_UA });
    const rest = gm.poll();
    expect(rest.profile).toBe('nintendo-hid');
    expect(rest.family).toBe('nintendo');
    expect(rest.fireHeld).toBe(false);
    expect(rest.menuNavUp).toBe(false);

    // Push right stick down via axes[5]=0.95, press B(0=confirm), Y(2=pickup), X(3=swap), L(4=LB), ZR(7=RT), Plus(9=Start), Hat Up(-1.0)
    pads[0] = makePad({
      index: 0,
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      mapping: '',
      axes: [0, 0, 0, 0, 0, 0.95, 0, 0, 0, -1.0],
      buttonCount: 14,
      pressed: { 0: true, 2: true, 3: true, 4: true, 7: true, 9: true },
    });
    const act = gm.poll();
    expect(act.profile).toBe('nintendo-hid');
    expect(act.menuConfirm).toBe(true); // 0=B (south confirm)
    expect(act.menuTertiary).toBe(true); // 2=Y (west pickup)
    expect(act.swapPressed).toBe(true); // 3=X (north swap)
    expect(act.menuPrevTab).toBe(true); // 4=L
    expect(act.fireHeld).toBe(true); // 7=ZR
    expect(act.pausePressed).toBe(true); // 9=Plus
    expect(act.menuNavUp).toBe(true); // hat axis 9 = -1.0 -> Up
    expect(act.aimActive).toBe(true);
    expect(act.aimDirY).toBeCloseTo(1, 3); // dynamically detected axes[5]!

    // Press A(1=back), R(5=RB), ZL(6=LT), Minus(8=Back) and verify pushing R-stick left (-1) never corrupts profile!
    pads[0] = makePad({
      index: 0,
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      mapping: '',
      axes: [0, 0, -1, 0, 0, 0, 0, 0, 0, 3.285714],
      buttonCount: 14,
      pressed: { 1: true, 5: true, 6: true, 8: true },
    });
    const act2 = gm.poll();
    expect(act2.profile).toBe('nintendo-hid');
    expect(act2.menuBack).toBe(true); // 1=A
    expect(act2.menuNextTab).toBe(true); // 5=R
    expect(act2.activeHeld).toBe(true); // 6=ZL
    expect(act2.retryPressed).toBe(true); // 8=Minus
    expect(act2.aimDirX).toBeCloseTo(-1, 3);

    // 8-axis Switch Pro with paired hat on axes[6]/axes[7] and right stick on axes[2]/axes[3]
    let pads8: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Nintendo Switch Pro Controller',
        mapping: '',
        axes: [0, 0, 0, -0.9, 0, 0, -1, 0],
        buttonCount: 14,
      }),
    ];
    const gm8 = new GamepadManager({ getGamepads: () => pads8, userAgent: DESKTOP_UA });
    const res8 = gm8.poll();
    expect(res8.profile).toBe('nintendo-hid');
    expect(res8.moveX).toBe(-1); // paired hat axes[6] = -1 -> Left
    expect(res8.aimDirY).toBeCloseTo(-1, 3); // axes[3] = -0.9 -> Up
  });

  it('maps Logitech F310/F710 DirectInput D-Mode (logitech-dinput) while preserving X-Mode as linux-xpad', () => {
    // 1. F310 in DirectInput D-Mode (6 axes: 2/3=RS, 4/5=Hat; 0=X, 1=A, 2=B, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 8=Back, 9=Start)
    let dPads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Logitech Gamepad F310 (Vendor: 046d Product: c216)',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0],
        buttonCount: 12,
      }),
    ];
    const gmD = new GamepadManager({ getGamepads: () => dPads, userAgent: DESKTOP_UA });
    const restD = gmD.poll();
    expect(restD.profile).toBe('logitech-dinput');
    expect(restD.family).toBe('generic');

    // Press D-pad Up on axes[5]=-1 (must NOT trigger xpad recalibration!), R-stick Right on axes[2]=0.95, and face/shoulder/trigger buttons
    dPads[0] = makePad({
      index: 0,
      id: 'Logitech Gamepad F310 (Vendor: 046d Product: c216)',
      mapping: '',
      axes: [0, 0, 0.95, 0, 0, -1],
      buttonCount: 12,
      pressed: { 0: true, 1: true, 3: true, 4: true, 7: true, 9: true },
    });
    const actD = gmD.poll();
    expect(actD.profile).toBe('logitech-dinput');
    expect(actD.moveY).toBe(-1); // axes[5] = -1 -> D-pad Up
    expect(actD.aimDirX).toBeCloseTo(1, 3);
    expect(actD.menuTertiary).toBe(true); // 0=X
    expect(actD.menuConfirm).toBe(true); // 1=A
    expect(actD.swapPressed).toBe(true); // 3=Y
    expect(actD.menuPrevTab).toBe(true); // 4=LB
    expect(actD.fireHeld).toBe(true); // 7=RT
    expect(actD.pausePressed).toBe(true); // 9=Start

    // Test 2=B, 5=RB, 6=LT, 8=Back on F710 with axes[9] POV hat
    let f710Pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Logitech Wireless Gamepad F710 (Vendor: 046d Product: c219)',
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -0.4286], // Hat Right
        buttonCount: 12,
        pressed: { 2: true, 5: true, 6: true, 8: true },
      }),
    ];
    const gm710 = new GamepadManager({ getGamepads: () => f710Pads, userAgent: DESKTOP_UA });
    const act710 = gm710.poll();
    expect(act710.profile).toBe('logitech-dinput');
    expect(act710.menuBack).toBe(true); // 2=B
    expect(act710.menuNextTab).toBe(true); // 5=RB
    expect(act710.activeHeld).toBe(true); // 6=LT
    expect(act710.retryPressed).toBe(true); // 8=Back
    expect(act710.menuNavRight).toBe(true); // Hat axis 9 -> Right

    // 2. F310 in X-Mode (Linux xpad with resting -1 triggers on axes 2/5 and 11 buttons) MUST stay linux-xpad!
    let xPads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Logitech Gamepad F310 (Vendor: 046d Product: c21d)',
        mapping: '',
        axes: [0, 0, -1, 0, 0, -1, 0, 0],
        buttonCount: 11,
      }),
    ];
    const gmX = new GamepadManager({ getGamepads: () => xPads, userAgent: DESKTOP_UA });
    const resX = gmX.poll();
    expect(resX.profile).toBe('linux-xpad');
    expect(resX.fireHeld).toBe(false);
    expect(resX.activeHeld).toBe(false);
  });
});

describe('gamepad-drivers: Single-Stick / D-Pad-Only Retro Aiming', () => {
  it('updates aimDirX/Y to follow movement on 2-axis and D-pad-only retro pads and preserves aim on release', () => {
    // 2-axis non-standard retro USB pad
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Retro SNES USB Pad',
        mapping: '',
        axes: [0, 0],
        buttonCount: 10,
      }),
    ];
    const gm = new GamepadManager({ getGamepads: () => pads, userAgent: DESKTOP_UA });
    const idle = gm.poll();
    expect(idle.connected).toBe(true);
    expect(idle.aimDirX).toBeCloseTo(1, 4);
    expect(idle.aimDirY).toBeCloseTo(0, 4);

    // Move up-left on the single stick -> aimDir tracks movement direction!
    pads[0] = makePad({
      index: 0,
      id: 'Retro SNES USB Pad',
      mapping: '',
      axes: [-0.8, -0.8],
      buttonCount: 10,
    });
    const moving = gm.poll();
    expect(moving.aimDirX).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(moving.aimDirY).toBeCloseTo(-Math.SQRT1_2, 3);

    // Release stick -> last aim direction persists!
    pads[0] = makePad({
      index: 0,
      id: 'Retro SNES USB Pad',
      mapping: '',
      axes: [0, 0],
      buttonCount: 10,
    });
    const released = gm.poll();
    expect(released.aimDirX).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(released.aimDirY).toBeCloseTo(-Math.SQRT1_2, 3);

    // D-pad-only standard pad with 0 axes -> pressing D-pad Down aims down (0, 1)
    let dpadOnly: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'Retro Fightstick',
        mapping: 'standard',
        axes: [],
        buttonCount: 16,
        pressed: { 13: true }, // D-pad Down
      }),
    ];
    const gmDpad = new GamepadManager({ getGamepads: () => dpadOnly, userAgent: DESKTOP_UA });
    const dRes = gmDpad.poll();
    expect(dRes.moveY).toBe(1);
    expect(dRes.aimDirX).toBeCloseTo(0, 4);
    expect(dRes.aimDirY).toBeCloseTo(1, 4);
  });
});

describe('gamepad-drivers: Active Disconnect Callback, Cross-Browser Haptics & Raw Debug Snapshot', () => {
  it('fires onDisconnect once per disconnect via gamepaddisconnected event AND via poll disappearance (deduplicated)', () => {
    const disconnects: Array<{ padIndex: number; padName: string | null; family: GamepadFamily }> = [];
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)',
      }),
    ];

    // 1. Poll-drop detection (e.g. pad vanishes from navigator.getGamepads() without DOM event)
    const gmPoll = new GamepadManager({
      getGamepads: () => pads,
      onDisconnect: (info) => disconnects.push(info),
      userAgent: DESKTOP_UA,
    });
    expect(gmPoll.poll().connected).toBe(true);
    expect(gmPoll.getConnectedInfo().family).toBe('playstation');

    pads = [];
    expect(gmPoll.poll().connected).toBe(false);
    expect(disconnects).toHaveLength(1);
    expect(disconnects[0]).toEqual({
      padIndex: 0,
      padName: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)',
      family: 'playstation',
    });

    // Repeated empty polls MUST NOT re-fire onDisconnect
    gmPoll.poll();
    gmPoll.poll();
    expect(disconnects).toHaveLength(1);

    // 2. DOM gamepaddisconnected event followed by empty poll MUST fire exactly ONCE (deduplicated)
    const windowListeners = new Map<string, (e: Event) => void>();
    const origWindow = globalThis.window;
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (t: string, fn: (e: Event) => void) => windowListeners.set(t, fn),
      removeEventListener: (t: string) => windowListeners.delete(t),
    };
    try {
      const evDisconnects: Array<{ padIndex: number; padName: string | null; family: GamepadFamily }> = [];
      let evPads: Array<GamepadLike | null> = [
        makePad({
          index: 1,
          id: 'Pro Controller (Vendor: 057e Product: 2009)',
        }),
      ];
      const gmEv = new GamepadManager({
        getGamepads: () => evPads,
        onDisconnect: (info) => evDisconnects.push(info),
        userAgent: DESKTOP_UA,
      });
      gmEv.attachListeners();
      gmEv.poll();

      // Unrelated inactive pad index 2 disconnects -> does NOT fire active disconnect
      windowListeners.get('gamepaddisconnected')?.({
        gamepad: makePad({ index: 2, id: 'Other Pad' }),
      } as unknown as Event);
      expect(evDisconnects).toHaveLength(0);

      // Active pad index 1 disconnects via event, then poll sees empty list -> fires ONCE
      evPads = [];
      windowListeners.get('gamepaddisconnected')?.({
        gamepad: makePad({ index: 1, id: 'Pro Controller (Vendor: 057e Product: 2009)' }),
      } as unknown as Event);
      gmEv.poll();
      expect(evDisconnects).toHaveLength(1);
      expect(evDisconnects[0]).toEqual({
        padIndex: 1,
        padName: 'Pro Controller (Vendor: 057e Product: 2009)',
        family: 'nintendo',
      });
      gmEv.detachListeners();
    } finally {
      (globalThis as unknown as { window: unknown }).window = origWindow;
    }
  });

  it('falls back to hapticActuators[0].pulse when vibrationActuator.playEffect is absent and never throws', () => {
    const pulse = vi.fn(() => Promise.resolve(true));
    let now = 500;
    let pads: Array<GamepadLike | null> = [
      makePad({
        index: 0,
        vibrationActuator: null,
        hapticActuators: [{ pulse }],
      }),
    ];
    const gm = new GamepadManager({
      getGamepads: () => pads,
      nowMs: () => now,
      userAgent: DESKTOP_UA,
    });
    gm.poll();

    expect(gm.rumble('explosion')).toBe(true);
    expect(pulse).toHaveBeenCalledTimes(1);
    expect(pulse).toHaveBeenCalledWith(0.85, 165);

    // Lower-priority rumble respects busy window
    now += 30;
    expect(gm.rumble('fire_light')).toBe(false);

    // Throwing hapticActuators[0].pulse is safely caught and returns false
    now += 500;
    pads = [
      makePad({
        index: 0,
        vibrationActuator: null,
        hapticActuators: [
          {
            pulse: () => {
              throw new Error('Firefox haptic failure');
            },
          },
        ],
      }),
    ];
    expect(() => gm.rumble('hurt')).not.toThrow();
    expect(gm.rumble('hurt')).toBe(false);

    // Rejected promise from pulse is safely swallowed
    pads = [
      makePad({
        index: 0,
        vibrationActuator: null,
        hapticActuators: [{ pulse: () => Promise.reject(new Error('rejected')) }],
      }),
    ];
    expect(() => gm.rumble('kill')).not.toThrow();
    expect(gm.rumble('kill')).toBe(true);
  });

  it('exposes live raw axes, triggers, family, profile, and active button count via getRawDebugState()', () => {
    let pads: Array<GamepadLike | null> = [];
    const gm = new GamepadManager({ getGamepads: () => pads, userAgent: DESKTOP_UA });

    expect(gm.getRawDebugState()).toEqual({
      connected: false,
      padIndex: null,
      padName: null,
      family: 'generic',
      profile: null,
      lx: 0,
      ly: 0,
      rx: 0,
      ry: 0,
      lt: false,
      rt: false,
      activeButtonCount: 0,
    });

    pads = [
      makePad({
        index: 0,
        id: 'Xbox Wireless Controller (Vendor: 045e Product: 02fd)',
        axes: [0.5, -0.25, -0.75, 0.9],
        pressed: { 0: true, 4: true, 7: 0.85 },
      }),
    ];
    gm.poll();

    const snap = gm.getRawDebugState();
    expect(snap).toEqual({
      connected: true,
      padIndex: 0,
      padName: 'Xbox Wireless Controller (Vendor: 045e Product: 02fd)',
      family: 'xbox',
      profile: 'standard',
      lx: 0.5,
      ly: -0.25,
      rx: -0.75,
      ry: 0.9,
      lt: false,
      rt: true,
      activeButtonCount: 3,
    });

    // Mutating returned snapshot does not mutate internal manager state
    snap.lx = 999;
    expect(gm.getRawDebugState().lx).toBe(0.5);

    // Disconnecting resets debug snapshot cleanly
    pads = [];
    gm.poll();
    expect(gm.getRawDebugState().connected).toBe(false);
    expect(gm.getRawDebugState().activeButtonCount).toBe(0);
    expect(gm.getRawDebugState().family).toBe('generic');
  });
});
