import {
  TILE_SIZE,
  TileType,
  type ControlSettings,
  type WorldMap,
} from '@/contracts';

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  gamepadAimAssist: true,
  gamepadRumble: true,
  gamepadDeadzone: 0.16,
  touchMode: 'auto',
};

export const MIN_GAMEPAD_DEADZONE = 0.08;
export const MAX_GAMEPAD_DEADZONE = 0.35;

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadVibrationActuatorLike {
  playEffect?: (
    type: string,
    params: {
      startDelay?: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<string> | void;
}

export interface GamepadHapticActuatorLike {
  pulse?: (value: number, duration: number) => Promise<boolean> | void;
}

export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly (GamepadButtonLike | undefined)[];
  readonly vibrationActuator?: GamepadVibrationActuatorLike | null;
  readonly hapticActuators?: readonly GamepadHapticActuatorLike[] | null;
}

export type GamepadFamily = 'xbox' | 'playstation' | 'nintendo' | 'tesla' | 'generic';

export type GamepadProfileKind =
  | 'standard'
  | 'linux-xpad'
  | 'xbox-bt-hid'
  | 'sony-hid'
  | 'nintendo-hid'
  | 'logitech-dinput'
  | 'generic-nonstandard';

export interface GamepadGlyphSet {
  family: GamepadFamily;
  familyLabel: string;
  confirm: string;
  back: string;
  pickup: string;
  swap: string;
  fire: string;
  active: string;
  prevTab: string;
  nextTab: string;
  pause: string;
  retry: string;
}

export interface GamepadDisconnectInfo {
  padIndex: number;
  padName: string | null;
  family: GamepadFamily;
}

export interface GamepadDebugSnapshot {
  connected: boolean;
  padIndex: number | null;
  padName: string | null;
  family: GamepadFamily;
  profile: GamepadProfileKind | null;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: boolean;
  rt: boolean;
  activeButtonCount: number;
}

export interface GamepadPollResult {
  connected: boolean;
  padIndex: number | null;
  padName: string | null;
  family: GamepadFamily;
  profile: GamepadProfileKind | null;
  hadActivity: boolean;
  moveX: number;
  moveY: number;
  aimDirX: number;
  aimDirY: number;
  aimActive: boolean;
  aimMagnitude: number;
  fireHeld: boolean;
  firePressed: boolean;
  activeHeld: boolean;
  activePressed: boolean;
  swapPressed: boolean;
  pickupPressed: boolean;
  pausePressed: boolean;
  retryPressed: boolean;
  menuNavUp: boolean;
  menuNavDown: boolean;
  menuNavLeft: boolean;
  menuNavRight: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
  menuPrevTab: boolean;
  menuNextTab: boolean;
  menuSecondary: boolean;
  menuTertiary: boolean;
}

export interface AimAssistEnemy {
  x: number;
  y: number;
  hp: number;
  radius: number;
  friendly?: boolean;
  invulnerable?: boolean;
}

export interface AimAssistResult {
  dirX: number;
  dirY: number;
  assisted: boolean;
  targetX?: number;
  targetY?: number;
}

export interface RumbleSpec {
  durationMs: number;
  weakMagnitude: number;
  strongMagnitude: number;
  priority?: number;
}

export type RumblePreset =
  | 'fire_light'
  | 'fire_heavy'
  | 'kill'
  | 'explosion'
  | 'hurt'
  | 'death'
  | 'parry';

const RUMBLE_PRESETS: Record<RumblePreset, RumbleSpec> = {
  fire_light: { durationMs: 42, weakMagnitude: 0.2, strongMagnitude: 0.08, priority: 1 },
  fire_heavy: { durationMs: 68, weakMagnitude: 0.42, strongMagnitude: 0.28, priority: 2 },
  kill: { durationMs: 55, weakMagnitude: 0.3, strongMagnitude: 0.16, priority: 2 },
  parry: { durationMs: 60, weakMagnitude: 0.45, strongMagnitude: 0.22, priority: 3 },
  explosion: { durationMs: 165, weakMagnitude: 0.65, strongMagnitude: 0.85, priority: 4 },
  hurt: { durationMs: 185, weakMagnitude: 0.72, strongMagnitude: 0.9, priority: 5 },
  death: { durationMs: 280, weakMagnitude: 0.85, strongMagnitude: 1.0, priority: 6 },
};

interface PadCalibration {
  padId: string;
  profile: GamepadProfileKind;
  rxAxis: number;
  ryAxis: number;
  ltAxis: number | null;
  rtAxis: number | null;
  ltResting: number;
  rtResting: number;
  hasHatAxis9: boolean;
  hasPairedHat67: boolean;
  hasPairedHat45: boolean;
}

interface NormalizedPadState {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  btnA: boolean;
  btnB: boolean;
  btnX: boolean;
  btnY: boolean;
  btnLB: boolean;
  btnRB: boolean;
  btnLT: boolean;
  btnRT: boolean;
  btnBack: boolean;
  btnStart: boolean;
  rawActivity: boolean;
}

interface NavRepeatTracker {
  held: boolean;
  nextFireMs: number;
}

const MENU_NAV_INITIAL_DELAY_MS = 320;
const MENU_NAV_REPEAT_INTERVAL_MS = 115;
const MENU_STICK_ENGAGE = 0.55;
const MENU_STICK_RELEASE = 0.32;
const TRIGGER_PRESS_THRESHOLD = 0.28;
const BUTTON_VALUE_THRESHOLD = 0.35;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Scaled radial deadzone with smooth non-linear response curve so worn sticks
 * never drift while preserving fine micro-aiming near center and full speed at tilt.
 */
export function applyRadialDeadzone(
  rawX: number,
  rawY: number,
  deadzone: number = DEFAULT_CONTROL_SETTINGS.gamepadDeadzone,
  curveExponent: number = 1.4,
): { x: number; y: number; magnitude: number } {
  const dz = clamp(deadzone, 0.02, 0.65);
  const mag = Math.hypot(rawX, rawY);
  if (!Number.isFinite(mag) || mag <= dz) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  const scaled = clamp((mag - dz) / (1 - dz), 0, 1);
  const curved = Math.pow(scaled, curveExponent);
  const invMag = 1 / mag;
  return {
    x: rawX * invMag * curved,
    y: rawY * invMag * curved,
    magnitude: curved,
  };
}

/**
 * Decodes a single-axis 8-way POV Hat Switch (typically `axes[9]` on Chromium HID /
 * DirectInput / Tesla non-standard gamepads).
 * Standard HID hat mapping spans [-1, +1] in 7 steps of 2/7:
 *   0=Up(-1.000), 1=UR(-0.714), 2=Right(-0.429), 3=DR(-0.143),
 *   4=Down(+0.143), 5=DL(+0.429), 6=Left(+0.714), 7=UL(+1.000).
 * Neutral reports > 1.15 (typically 3.2857 or 1.2857) or exact 0.0 when unused.
 */
export function decodeHatSwitchAxis(value: number): {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
} {
  if (!Number.isFinite(value) || Math.abs(value) > 1.08 || Math.abs(value) < 0.05) {
    return { up: false, down: false, left: false, right: false };
  }
  const step = Math.round(((value + 1) * 0.5) * 7);
  switch (step) {
    case 0:
      return { up: true, down: false, left: false, right: false };
    case 1:
      return { up: true, down: false, left: false, right: true };
    case 2:
      return { up: false, down: false, left: false, right: true };
    case 3:
      return { up: false, down: true, left: false, right: true };
    case 4:
      return { up: false, down: true, left: false, right: false };
    case 5:
      return { up: false, down: true, left: true, right: false };
    case 6:
      return { up: false, down: false, left: true, right: false };
    case 7:
      return { up: true, down: false, left: true, right: false };
    default:
      return { up: false, down: false, left: false, right: false };
  }
}

/**
 * Pure tile-grid line-of-sight check used by controller aim assist so aim never
 * magnetizes toward an enemy behind a solid wall.
 */
export function hasTileLineOfSight(
  map: WorldMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const ts = map.tileSize || TILE_SIZE;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const step = 4;
  const steps = Math.floor(dist / step);
  const invDist = 1 / dist;
  const ux = dx * invDist;
  const uy = dy * invDist;

  for (let i = 1; i < steps; i++) {
    const wx = x0 + ux * (i * step);
    const wy = y0 + uy * (i * step);
    const tx = Math.floor(wx / ts);
    const ty = Math.floor(wy / ts);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
      return false;
    }
    const tile = map.tiles[ty * map.width + tx] as TileType;
    if (
      tile !== TileType.Floor &&
      tile !== TileType.FloorCracked &&
      tile !== TileType.Carpet
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Subtle magnetic controller aim assist: gently bends aim vector toward the closest
 * angular line-of-sight enemy inside a narrow cone (~13 deg, <= 195 px), never
 * snapping wildly or targeting behind cover.
 */
export function applyControllerAimAssist(
  playerX: number,
  playerY: number,
  aimDirX: number,
  aimDirY: number,
  enemies: readonly AimAssistEnemy[],
  map: WorldMap | null,
  opts: {
    enabled: boolean;
    maxConeRad?: number;
    maxRangePx?: number;
    pullStrength?: number;
  },
): AimAssistResult {
  const dirLen = Math.hypot(aimDirX, aimDirY);
  if (dirLen < 1e-5) {
    return { dirX: 1, dirY: 0, assisted: false };
  }
  const ux = aimDirX / dirLen;
  const uy = aimDirY / dirLen;

  if (!opts.enabled || enemies.length === 0) {
    return { dirX: ux, dirY: uy, assisted: false };
  }

  const maxConeRad = opts.maxConeRad ?? (13 * Math.PI) / 180;
  const maxRangePx = opts.maxRangePx ?? 195;
  const pullStrength = clamp(opts.pullStrength ?? 0.56, 0, 0.85);
  const baseAngle = Math.atan2(uy, ux);

  let bestEnemy: AimAssistEnemy | null = null;
  let bestScore = Infinity;
  let bestAngleDiff = 0;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    if (e.hp <= 0 || e.friendly || e.invulnerable) continue;
    const dx = e.x - playerX;
    const dy = e.y - playerY;
    const dist = Math.hypot(dx, dy);
    if (dist < 6 || dist > maxRangePx) continue;

    const targetAngle = Math.atan2(dy, dx);
    let diff = targetAngle - baseAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const absDiff = Math.abs(diff);

    // Slightly widen tolerance for large enemies at close range
    const angularRadius = Math.atan2(Math.max(4, e.radius * 0.65), dist);
    if (absDiff > maxConeRad + angularRadius * 0.35) continue;

    if (map && !hasTileLineOfSight(map, playerX, playerY, e.x, e.y)) {
      continue;
    }

    // Strongly prefer alignment with aim vector, breaking ties by proximity
    const score = absDiff / maxConeRad + (dist / maxRangePx) * 0.28;
    if (score < bestScore) {
      bestScore = score;
      bestEnemy = e;
      bestAngleDiff = diff;
    }
  }

  if (!bestEnemy) {
    return { dirX: ux, dirY: uy, assisted: false };
  }

  // Smooth pull: stronger near center of cone, tapers cleanly at cone edge
  const coneT = clamp(1 - Math.abs(bestAngleDiff) / (maxConeRad * 1.15), 0.15, 1);
  const assistedAngle = baseAngle + bestAngleDiff * pullStrength * coneT;
  return {
    dirX: Math.cos(assistedAngle),
    dirY: Math.sin(assistedAngle),
    assisted: true,
    targetX: bestEnemy.x,
    targetY: bestEnemy.y,
  };
}

const GAMEPAD_GLYPHS: Record<GamepadFamily, GamepadGlyphSet> = {
  xbox: {
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
  },
  playstation: {
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
  },
  nintendo: {
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
  },
  tesla: {
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
  },
  generic: {
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
  },
};

const PLAYSTATION_EXPLICIT_RE = /054c|dualshock|dualsense|playstation|ps4|ps5/i;
const NINTENDO_ID_RE = /057e|nintendo|switch|pro controller|joy-con|joycon/i;
const XBOX_FAMILY_ID_RE = /045e|xbox|x-box|xinput|xpad|elite|backbone|kishi/i;
const XBOX_BT_VENDOR_RE = /045e|xbox|x-box|xinput|xpad/i;
const TESLA_BRAND_ID_RE = /tesla|jowua/i;
const WIRELESS_CONTROLLER_RE = /wireless controller/i;
const PHANTOM_HID_ID_RE =
  /space navigator|3dconnexion|rgb|aura|corsair.*lighting|headset|audio|touchscreen|touchpad|mouse|keyboard/i;
const EXPLICIT_GAMEPAD_ID_RE = /gamepad|controller|joystick|xbox|dualshock|dualsense/i;

/**
 * Classifies a connected controller into its physical button-label family so HUD/menu
 * glyphs match the controller in the player's hands (including PlayStation/Nintendo/Xbox
 * pads plugged into a Tesla MCU browser).
 */
export function detectGamepadFamily(id: string, userAgent?: string): GamepadFamily {
  const safeId = id ?? '';
  if (PLAYSTATION_EXPLICIT_RE.test(safeId)) {
    return 'playstation';
  }
  if (NINTENDO_ID_RE.test(safeId)) {
    return 'nintendo';
  }
  if (XBOX_FAMILY_ID_RE.test(safeId)) {
    return 'xbox';
  }
  if (TESLA_BRAND_ID_RE.test(safeId)) {
    return 'tesla';
  }
  if (WIRELESS_CONTROLLER_RE.test(safeId)) {
    return 'playstation';
  }

  const ua =
    userAgent !== undefined
      ? userAgent
      : typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';
  if (/tesla\//i.test(ua)) {
    return 'tesla';
  }
  return 'generic';
}

/**
 * Returns the pure-ASCII uppercase button glyph set for a controller family
 * (safe for pixel bitmap fonts without Unicode symbols or `&`).
 */
export function getGamepadGlyphs(family: GamepadFamily): GamepadGlyphSet {
  return { ...(GAMEPAD_GLYPHS[family] ?? GAMEPAD_GLYPHS.generic) };
}

/**
 * Filters out non-gamepad virtual/HID devices (3D mice, RGB controllers, headsets,
 * touchpads, keyboards, volume knobs) that Tesla/Linux/Windows browsers sometimes expose
 * in `navigator.getGamepads()`.
 */
export function isPhantomGamepad(pad: GamepadLike): boolean {
  const buttonCount = pad.buttons?.length ?? 0;
  const axisCount = pad.axes?.length ?? 0;
  if (buttonCount < 4 && axisCount < 2) {
    return true;
  }
  const id = pad.id ?? '';
  if (PHANTOM_HID_ID_RE.test(id) && !EXPLICIT_GAMEPAD_ID_RE.test(id)) {
    return true;
  }
  return false;
}

function isSonyPadId(id: string): boolean {
  if (PLAYSTATION_EXPLICIT_RE.test(id)) return true;
  return (
    WIRELESS_CONTROLLER_RE.test(id) &&
    !NINTENDO_ID_RE.test(id) &&
    !XBOX_FAMILY_ID_RE.test(id) &&
    !TESLA_BRAND_ID_RE.test(id)
  );
}

function isNintendoPadId(id: string): boolean {
  return NINTENDO_ID_RE.test(id);
}

function isXboxBtVendorId(id: string): boolean {
  return XBOX_BT_VENDOR_RE.test(id);
}

function isLogitechDInputId(id: string): boolean {
  return (
    /046d|logitech/i.test(id) &&
    /c216|c218|c219|dual action|rumblepad|f310|f710/i.test(id) &&
    !/c21d|c21f/i.test(id)
  );
}

function isXboxOrLinuxXpadId(id: string): boolean {
  return /045e|xbox|x-box|xinput|xpad|8bitdo|logitech.*f310|gamepad/i.test(id);
}

function normalizeTriggerAxis(rawValue: number, resting: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  if (resting < -0.5) {
    return clamp((rawValue - resting) / (1 - resting), 0, 1);
  }
  return clamp(rawValue, 0, 1);
}

function buttonIsPressed(btn: GamepadButtonLike | undefined): boolean {
  return Boolean(btn && (btn.pressed || btn.value > BUTTON_VALUE_THRESHOLD));
}

function calibrateNonStandardPad(pad: GamepadLike): PadCalibration {
  const axes = pad.axes;
  const len = axes.length;
  const a = (idx: number): number => (idx < len && Number.isFinite(axes[idx]) ? axes[idx]! : 0);

  const sony = isSonyPadId(pad.id);
  const nintendo = isNintendoPadId(pad.id);
  const xboxBtVendor = isXboxBtVendorId(pad.id);
  const logitechDInput = isLogitechDInputId(pad.id);

  const a2Neg = len > 2 && a(2) < -0.75;
  const a3Neg = len > 3 && a(3) < -0.75;
  const a4Neg = len > 4 && a(4) < -0.75;
  const a5Neg = len > 5 && a(5) < -0.75;

  const hasHatAxis9 = len >= 10;
  const hat9LooksActive = len >= 10 && Math.abs(a(9)) > 1.05;
  let rxAxis = len > 2 ? 2 : 0;
  let ryAxis = len > 3 ? 3 : 1;
  let ltAxis: number | null = null;
  let rtAxis: number | null = null;
  let ltResting = 0;
  let rtResting = 0;
  let profile: GamepadProfileKind = 'generic-nonstandard';
  let hasPairedHat45 = false;
  let hasPairedHat67: boolean | null = null;

  if (nintendo) {
    // Nintendo Switch Pro / Joy-Con non-standard HID (digital ZL/ZR on buttons 6/7)
    profile = 'nintendo-hid';
    rxAxis = len > 2 ? 2 : 0;
    ryAxis =
      len >= 10 && Math.abs(a(5)) > 0.12 && Math.abs(a(5)) > Math.abs(a(3)) + 0.08
        ? 5
        : len > 3
          ? 3
          : 1;
    hasPairedHat67 = len >= 8 && !hat9LooksActive && (len < 10 || Math.abs(a(9)) < 0.05);
  } else if (xboxBtVendor && pad.buttons.length >= 15) {
    // Xbox One S / Series X|S Bluetooth HID (Linux hid-microsoft / Tesla / Android)
    profile = 'xbox-bt-hid';
    if (a2Neg && a5Neg) {
      ltAxis = 2;
      rtAxis = 5;
      ltResting = a(2);
      rtResting = a(5);
      rxAxis = 3;
      ryAxis = 4;
    } else if (a4Neg && a5Neg && len >= 6) {
      ltAxis = 4;
      rtAxis = 5;
      ltResting = a(4);
      rtResting = a(5);
      rxAxis = 2;
      ryAxis = 3;
    } else if (a2Neg && len >= 5) {
      ltAxis = 2;
      ltResting = a(2);
      rxAxis = 3;
      ryAxis = 4;
      if (len >= 6) {
        rtAxis = 5;
        rtResting = a(5) < -0.5 ? a(5) : 0;
      }
    } else if (a4Neg && len >= 6) {
      ltAxis = 4;
      ltResting = a(4);
      rtAxis = 5;
      rtResting = a(5) < -0.5 ? a(5) : 0;
      rxAxis = 2;
      ryAxis = 3;
    } else if (a5Neg && len >= 6) {
      if (hasHatAxis9) {
        ltAxis = 4;
        ltResting = a(4) < -0.5 ? a(4) : 0;
        rtAxis = 5;
        rtResting = a(5);
        rxAxis = 2;
        ryAxis = 3;
      } else {
        ltAxis = 2;
        ltResting = a(2) < -0.5 ? a(2) : 0;
        rtAxis = 5;
        rtResting = a(5);
        rxAxis = 3;
        ryAxis = 4;
      }
    } else {
      rxAxis = len > 2 ? 2 : 0;
      ryAxis = len > 3 ? 3 : 1;
    }
    hasPairedHat67 = len >= 8 && !hat9LooksActive && (len < 10 || Math.abs(a(9)) < 0.05);
  } else if (logitechDInput && !(a2Neg && a5Neg)) {
    // Logitech F310 / F710 / Dual Action / RumblePad DirectInput D-Mode
    profile = 'logitech-dinput';
    rxAxis = len > 2 ? 2 : 0;
    ryAxis = len > 3 ? 3 : 1;
    hasPairedHat45 = len >= 6 && !hat9LooksActive && (len < 10 || Math.abs(a(9)) < 0.05);
    hasPairedHat67 = false;
  } else if (a2Neg && a5Neg) {
    // Classic Linux evdev / Tesla xpad layout (also Logitech F310/F710 in X-Mode):
    // 0=LX, 1=LY, 2=LT(-1..1), 3=RX, 4=RY, 5=RT(-1..1), [6=HatX, 7=HatY]
    profile = sony ? 'sony-hid' : 'linux-xpad';
    ltAxis = 2;
    rtAxis = 5;
    ltResting = a(2);
    rtResting = a(5);
    rxAxis = 3;
    ryAxis = 4;
  } else if (a3Neg && a4Neg && len >= 6) {
    // DualShock 4 / DualSense HID layout on Chromium/Linux/Tesla:
    // 0=LX, 1=LY, 2=RX, 3=LT(-1..1), 4=RT(-1..1), 5=RY, [9=Hat]
    profile = sony ? 'sony-hid' : 'generic-nonstandard';
    ltAxis = 3;
    rtAxis = 4;
    ltResting = a(3);
    rtResting = a(4);
    rxAxis = 2;
    ryAxis = 5;
  } else if (a4Neg && a5Neg && len >= 6) {
    // Alternate Linux/Tesla DirectInput layout:
    // 0=LX, 1=LY, 2=RX, 3=RY, 4=LT(-1..1), 5=RT(-1..1), [9=Hat]
    profile = sony ? 'sony-hid' : isXboxOrLinuxXpadId(pad.id) ? 'linux-xpad' : 'generic-nonstandard';
    ltAxis = 4;
    rtAxis = 5;
    ltResting = a(4);
    rtResting = a(5);
    rxAxis = 2;
    ryAxis = 3;
  } else if (sony && len >= 6) {
    // Sony HID pad where triggers haven't reported -1 yet (e.g. cold boot before first touch)
    profile = 'sony-hid';
    rxAxis = 2;
    ryAxis = hasHatAxis9 ? 5 : 3;
    if (hasHatAxis9) {
      ltAxis = 3;
      rtAxis = 4;
      ltResting = a(3) < -0.5 ? a(3) : 0;
      rtResting = a(4) < -0.5 ? a(4) : 0;
    }
  } else if (isXboxOrLinuxXpadId(pad.id) && len >= 6) {
    // Cold-boot Linux xpad/evdev Xbox pad where triggers report 0 until first touch/release (-1)
    profile = 'linux-xpad';
    ltAxis = 2;
    rtAxis = 5;
    ltResting = a(2) < -0.5 ? a(2) : 0;
    rtResting = a(5) < -0.5 ? a(5) : 0;
    rxAxis = 3;
    ryAxis = 4;
  } else {
    // Generic non-standard: check if any single axis 2..5 is resting at -1
    if (a2Neg && len >= 5) {
      ltAxis = 2;
      ltResting = a(2);
      rxAxis = 3;
      ryAxis = 4;
      if (len >= 6) {
        rtAxis = 5;
        rtResting = a(5) < -0.5 ? a(5) : 0;
      }
      profile = 'linux-xpad';
    } else if (a5Neg && len >= 6) {
      ltAxis = 2;
      ltResting = a(2) < -0.5 ? a(2) : 0;
      rtAxis = 5;
      rtResting = a(5);
      rxAxis = 3;
      ryAxis = 4;
      profile = 'linux-xpad';
    } else if (a4Neg && len >= 6) {
      ltAxis = 4;
      ltResting = a(4);
      rtAxis = 5;
      rtResting = a(5) < -0.5 ? a(5) : 0;
      rxAxis = 2;
      ryAxis = 3;
    } else {
      rxAxis = len > 2 ? 2 : 0;
      ryAxis = len > 3 ? 3 : 1;
    }
  }

  // Paired D-pad hat axes (6, 7) on Linux evdev (only if not trigger/stick axes and resting near 0)
  const resolvedHasPairedHat67 =
    hasPairedHat67 !== null
      ? hasPairedHat67
      : len >= 8 &&
        rxAxis !== 6 &&
        ryAxis !== 6 &&
        ltAxis !== 6 &&
        rtAxis !== 6 &&
        Math.abs(a(6)) < 0.75 &&
        Math.abs(a(7)) < 0.75 &&
        !hat9LooksActive;

  return {
    padId: pad.id,
    profile,
    rxAxis,
    ryAxis,
    ltAxis,
    rtAxis,
    ltResting,
    rtResting,
    hasHatAxis9,
    hasPairedHat67: resolvedHasPairedHat67,
    hasPairedHat45,
  };
}

/**
 * First-class PC + Tesla Chromium Gamepad Controller:
 * - Hot-plug (`gamepadconnected`/`gamepaddisconnected`) + continuous `navigator.getGamepads()` polling
 * - Automatic active-pad switching (ignores idle/phantom pads, selects whichever pad receives input)
 * - Full W3C `standard` mapping + Tesla/Linux-evdev/HID non-standard mapper with resting-axis calibration
 * - Scaled radial deadzones with non-linear response curves
 * - Twin-stick aiming persistence (retains last aim direction on release)
 * - Menu navigation with stick hysteresis + smooth auto-repeat
 * - Safe, feature-detected dual-rumble haptics (never throws on Tesla/unsupported browsers)
 */
export class GamepadManager {
  private readonly getPadsFn: () => readonly (GamepadLike | null | undefined)[];
  private readonly nowMsFn: () => number;
  private readonly userAgent?: string;

  private activePadIndex: number | null = null;
  private activePadName: string | null = null;
  private activeFamily: GamepadFamily = 'generic';
  private activeProfile: GamepadProfileKind | null = null;
  private calibrations = new Map<number, PadCalibration>();
  private lastDebugSnapshot: GamepadDebugSnapshot = this.makeEmptyDebugSnapshot();

  private aimDirX = 1;
  private aimDirY = 0;

  private prevState: NormalizedPadState | null = null;
  private stickNavState = { up: false, down: false, left: false, right: false };
  private navRepeat: Record<'up' | 'down' | 'left' | 'right', NavRepeatTracker> = {
    up: { held: false, nextFireMs: 0 },
    down: { held: false, nextFireMs: 0 },
    left: { held: false, nextFireMs: 0 },
    right: { held: false, nextFireMs: 0 },
  };

  private deadzone = DEFAULT_CONTROL_SETTINGS.gamepadDeadzone;
  private rumbleEnabled = DEFAULT_CONTROL_SETTINGS.gamepadRumble;
  private rumbleBusyUntilMs = 0;
  private rumbleActivePriority = 0;

  private listenersAttached = false;
  private onConnectCallback?: (pad: GamepadLike) => void;
  private onDisconnectCallback?: (info: GamepadDisconnectInfo) => void;

  private makeEmptyDebugSnapshot(): GamepadDebugSnapshot {
    return {
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
    };
  }

  private boundOnConnected = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad as GamepadLike | undefined;
    if (!gp || isPhantomGamepad(gp)) return;
    this.calibrations.delete(gp.index);
    if (this.activePadIndex === null) {
      this.activePadIndex = gp.index;
      this.activePadName = gp.id;
      this.activeFamily = detectGamepadFamily(gp.id, this.userAgent);
      this.activeProfile = gp.mapping === 'standard' ? 'standard' : null;
      this.lastDebugSnapshot = {
        connected: true,
        padIndex: this.activePadIndex,
        padName: this.activePadName,
        family: this.activeFamily,
        profile: this.activeProfile,
        lx: 0,
        ly: 0,
        rx: 0,
        ry: 0,
        lt: false,
        rt: false,
        activeButtonCount: 0,
      };
    }
    this.onConnectCallback?.(gp);
  };
  private boundOnDisconnected = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad as GamepadLike | undefined;
    if (!gp) return;
    this.calibrations.delete(gp.index);
    if (this.activePadIndex === gp.index) {
      const info: GamepadDisconnectInfo = {
        padIndex: this.activePadIndex,
        padName: this.activePadName,
        family: this.activeFamily,
      };
      this.activePadIndex = null;
      this.activePadName = null;
      this.activeFamily = 'generic';
      this.activeProfile = null;
      this.prevState = null;
      this.lastDebugSnapshot = this.makeEmptyDebugSnapshot();
      this.onDisconnectCallback?.(info);
    }
  };

  constructor(opts?: {
    getGamepads?: () => readonly (GamepadLike | null | undefined)[];
    nowMs?: () => number;
    onConnect?: (pad: GamepadLike) => void;
    onDisconnect?: (info: GamepadDisconnectInfo) => void;
    userAgent?: string;
  }) {
    this.getPadsFn =
      opts?.getGamepads ??
      (() => {
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
          try {
            return navigator.getGamepads() as readonly (GamepadLike | null)[];
          } catch {
            return [];
          }
        }
        return [];
      });
    this.nowMsFn =
      opts?.nowMs ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onConnectCallback = opts?.onConnect;
    this.onDisconnectCallback = opts?.onDisconnect;
    this.userAgent = opts?.userAgent;
  }

  attachListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', this.boundOnConnected);
    window.addEventListener('gamepaddisconnected', this.boundOnDisconnected);
    this.listenersAttached = true;
  }

  detachListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected', this.boundOnConnected);
    window.removeEventListener('gamepaddisconnected', this.boundOnDisconnected);
    this.listenersAttached = false;
  }

  applySettings(settings: Pick<ControlSettings, 'gamepadDeadzone' | 'gamepadRumble'>): void {
    this.deadzone = clamp(settings.gamepadDeadzone, MIN_GAMEPAD_DEADZONE, MAX_GAMEPAD_DEADZONE);
    this.rumbleEnabled = Boolean(settings.gamepadRumble);
  }

  getAimDirection(): { x: number; y: number } {
    return { x: this.aimDirX, y: this.aimDirY };
  }

  setAimDirection(dirX: number, dirY: number): void {
    const len = Math.hypot(dirX, dirY);
    if (len > 1e-5) {
      this.aimDirX = dirX / len;
      this.aimDirY = dirY / len;
    }
  }

  getConnectedInfo(): {
    connected: boolean;
    padIndex: number | null;
    padName: string | null;
    family: GamepadFamily;
    profile: GamepadProfileKind | null;
  } {
    return {
      connected: this.activePadIndex !== null,
      padIndex: this.activePadIndex,
      padName: this.activePadName,
      family: this.activeFamily,
      profile: this.activeProfile,
    };
  }

  getRawDebugState(): GamepadDebugSnapshot {
    return { ...this.lastDebugSnapshot };
  }

  resetState(): void {
    this.prevState = null;
    this.stickNavState = { up: false, down: false, left: false, right: false };
    this.navRepeat.up.held = false;
    this.navRepeat.down.held = false;
    this.navRepeat.left.held = false;
    this.navRepeat.right.held = false;
  }

  private getCalibration(pad: GamepadLike): PadCalibration {
    const existing = this.calibrations.get(pad.index);
    if (existing && existing.padId === pad.id) {
      // If pad booted cold with all-zero axes (ltAxis/rtAxis unresolved) and any axis 2..5
      // later settles to -1.0, recalibrate immediately so triggers never lock R-stick!
      // Skip digital-trigger profiles (nintendo-hid, logitech-dinput) so stick/hat -1 never corrupts them.
      if (
        existing.profile !== 'nintendo-hid' &&
        existing.profile !== 'logitech-dinput' &&
        existing.ltAxis === null &&
        existing.rtAxis === null
      ) {
        const limit = Math.min(5, pad.axes.length - 1);
        for (let i = 2; i <= limit; i++) {
          const v = pad.axes[i];
          if (typeof v === 'number' && Number.isFinite(v) && v < -0.75) {
            const recalibrated = calibrateNonStandardPad(pad);
            this.calibrations.set(pad.index, recalibrated);
            return recalibrated;
          }
        }
      }

      // If single-axis recalibration guessed lt=2/rt=5 while axis 2 was still 0, and axis 4
      // later settles to -1.0 alongside axis 5, switch cleanly to the 4/5 trigger layout
      if (
        existing.ltAxis === 2 &&
        existing.ltResting > -0.5 &&
        pad.axes.length >= 6 &&
        (pad.axes[4] ?? 0) < -0.75 &&
        (pad.axes[2] ?? 0) > -0.5
      ) {
        const recalibrated = calibrateNonStandardPad(pad);
        this.calibrations.set(pad.index, recalibrated);
        return recalibrated;
      }

      // Dynamic late-calibration for Linux/Tesla pads that report 0 until first trigger release (-1)
      if (existing.ltAxis !== null) {
        const lv = pad.axes[existing.ltAxis] ?? 0;
        if (lv < -0.75 && existing.ltResting > -0.5) {
          existing.ltResting = -1;
        }
      }
      if (existing.rtAxis !== null) {
        const rv = pad.axes[existing.rtAxis] ?? 0;
        if (rv < -0.75 && existing.rtResting > -0.5) {
          existing.rtResting = -1;
        }
      }
      return existing;
    }
    const created = calibrateNonStandardPad(pad);
    this.calibrations.set(pad.index, created);
    return created;
  }

  private readPadState(pad: GamepadLike): {
    state: NormalizedPadState;
    profile: GamepadProfileKind;
    hasRightStick: boolean;
    activeButtonCount: number;
  } {
    const btn = (i: number): boolean => buttonIsPressed(pad.buttons[i]);
    const axis = (i: number): number => {
      const v = pad.axes[i];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    };

    let activeButtonCount = 0;
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i];
      if (
        buttonIsPressed(b) ||
        (pad.mapping === 'standard' &&
          (i === 6 || i === 7) &&
          (b?.value ?? 0) > TRIGGER_PRESS_THRESHOLD)
      ) {
        activeButtonCount++;
      }
    }

    if (pad.mapping === 'standard') {
      const hasRightStick = pad.axes.length >= 4;
      const lx = axis(0);
      const ly = axis(1);
      const rx = hasRightStick ? axis(2) : 0;
      const ry = hasRightStick ? axis(3) : 0;

      const dpadUp = btn(12);
      const dpadDown = btn(13);
      const dpadLeft = btn(14);
      const dpadRight = btn(15);

      const btnA = btn(0);
      const btnB = btn(1);
      const btnX = btn(2);
      const btnY = btn(3);
      const btnLB = btn(4);
      const btnRB = btn(5);
      const ltVal = pad.buttons[6]?.value ?? 0;
      const rtVal = pad.buttons[7]?.value ?? 0;
      const btnLT = Boolean(pad.buttons[6]?.pressed || ltVal > TRIGGER_PRESS_THRESHOLD);
      const btnRT = Boolean(pad.buttons[7]?.pressed || rtVal > TRIGGER_PRESS_THRESHOLD);
      const btnBack = btn(8);
      const btnStart = btn(9);

      const rawActivity =
        btnA ||
        btnB ||
        btnX ||
        btnY ||
        btnLB ||
        btnRB ||
        btnLT ||
        btnRT ||
        btnBack ||
        btnStart ||
        dpadUp ||
        dpadDown ||
        dpadLeft ||
        dpadRight ||
        Math.hypot(lx, ly) > this.deadzone ||
        Math.hypot(rx, ry) > Math.min(0.4, this.deadzone + 0.02);

      return {
        profile: 'standard',
        hasRightStick,
        activeButtonCount,
        state: {
          lx,
          ly,
          rx,
          ry,
          dpadUp,
          dpadDown,
          dpadLeft,
          dpadRight,
          btnA,
          btnB,
          btnX,
          btnY,
          btnLB,
          btnRB,
          btnLT,
          btnRT,
          btnBack,
          btnStart,
          rawActivity,
        },
      };
    }

    // Non-standard / Tesla Chromium / Linux-evdev / HID fallback mapper
    const cal = this.getCalibration(pad);

    // Switch Pro 10-axis HID can report right-stick Y on axes[5] instead of axes[3]
    if (cal.profile === 'nintendo-hid' && pad.axes.length >= 10) {
      const a3 = Math.abs(axis(3));
      const a5 = Math.abs(axis(5));
      if (a5 > 0.12 && a5 > a3 + 0.08) {
        cal.ryAxis = 5;
      } else if (a3 > 0.12 && a3 > a5 + 0.08) {
        cal.ryAxis = 3;
      }
    }

    const hasRightStick = cal.rxAxis !== 0 || cal.ryAxis !== 1;
    const lx = axis(0);
    const ly = axis(1);
    const rx = hasRightStick ? axis(cal.rxAxis) : 0;
    const ry = hasRightStick ? axis(cal.ryAxis) : 0;

    // Combine D-pad sources: standard buttons 12..15 (where applicable), paired hat (4/5 or 6/7), single POV hat axis (9)
    const allowButtons12To15Dpad =
      cal.profile === 'generic-nonstandard' ||
      cal.profile === 'linux-xpad' ||
      (cal.profile === 'nintendo-hid' && !cal.hasHatAxis9 && !cal.hasPairedHat67);
    let dpadUp = allowButtons12To15Dpad ? btn(12) : false;
    let dpadDown = allowButtons12To15Dpad ? btn(13) : false;
    let dpadLeft = allowButtons12To15Dpad ? btn(14) : false;
    let dpadRight = allowButtons12To15Dpad ? btn(15) : false;

    if (cal.hasPairedHat45) {
      const hx = axis(4);
      const hy = axis(5);
      if (hx < -0.5) dpadLeft = true;
      if (hx > 0.5) dpadRight = true;
      if (hy < -0.5) dpadUp = true;
      if (hy > 0.5) dpadDown = true;
    }

    if (cal.hasPairedHat67) {
      const hx = axis(6);
      const hy = axis(7);
      if (hx < -0.5) dpadLeft = true;
      if (hx > 0.5) dpadRight = true;
      if (hy < -0.5) dpadUp = true;
      if (hy > 0.5) dpadDown = true;
    }

    if (cal.hasHatAxis9 && pad.axes.length >= 10) {
      const hat = decodeHatSwitchAxis(axis(9));
      dpadUp = dpadUp || hat.up;
      dpadDown = dpadDown || hat.down;
      dpadLeft = dpadLeft || hat.left;
      dpadRight = dpadRight || hat.right;
    }

    const ltAxisNorm = cal.ltAxis !== null ? normalizeTriggerAxis(axis(cal.ltAxis), cal.ltResting) : 0;
    const rtAxisNorm = cal.rtAxis !== null ? normalizeTriggerAxis(axis(cal.rtAxis), cal.rtResting) : 0;

    let btnA = false;
    let btnB = false;
    let btnX = false;
    let btnY = false;
    let btnLB = false;
    let btnRB = false;
    let btnLT = false;
    let btnRT = false;
    let btnBack = false;
    let btnStart = false;

    if (cal.profile === 'sony-hid' && pad.buttons.length >= 10) {
      // Sony DirectInput / HID button layout: 0=Square, 1=Cross, 2=Circle, 3=Triangle
      btnX = btn(0);
      btnA = btn(1);
      btnB = btn(2);
      btnY = btn(3);
      btnLB = btn(4);
      btnRB = btn(5);
      btnLT = ltAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(6);
      btnRT = rtAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(7);
      btnBack = btn(8);
      btnStart = btn(9);
    } else if (cal.profile === 'xbox-bt-hid') {
      // Xbox One S / Series X|S Bluetooth HID (Linux hid-microsoft / Tesla / Android):
      // 0=A, 1=B, 3=X, 4=Y, 6=LB, 7=RB, 10=Back/View, 11=Start/Menu; triggers on axes 2/5 or 4/5 or btn 8/9 fallback
      btnA = btn(0);
      btnB = btn(1);
      btnX = btn(3);
      btnY = btn(4);
      btnLB = btn(6);
      btnRB = btn(7);
      btnLT = ltAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(8);
      btnRT = rtAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(9);
      btnBack = btn(10);
      btnStart = btn(11);
    } else if (cal.profile === 'nintendo-hid') {
      // Nintendo Switch Pro / Joy-Con non-standard HID:
      // 0=B(confirm south), 1=A(back east), 2=Y(pickup west), 3=X(swap north),
      // 4=L(LB), 5=R(RB), 6=ZL(LT), 7=ZR(RT), 8=Minus(Back), 9=Plus(Start)
      btnA = btn(0);
      btnB = btn(1);
      btnX = btn(2);
      btnY = btn(3);
      btnLB = btn(4);
      btnRB = btn(5);
      btnLT = btn(6) || ltAxisNorm > TRIGGER_PRESS_THRESHOLD;
      btnRT = btn(7) || rtAxisNorm > TRIGGER_PRESS_THRESHOLD;
      btnBack = btn(8);
      btnStart = btn(9);
    } else if (cal.profile === 'logitech-dinput') {
      // Logitech F310 / F710 / Dual Action / RumblePad DirectInput D-mode:
      // 0=X, 1=A, 2=B, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 8=Back, 9=Start
      btnX = btn(0);
      btnA = btn(1);
      btnB = btn(2);
      btnY = btn(3);
      btnLB = btn(4);
      btnRB = btn(5);
      btnLT = btn(6);
      btnRT = btn(7);
      btnBack = btn(8);
      btnStart = btn(9);
    } else if (cal.profile === 'linux-xpad' && cal.ltAxis !== null && cal.rtAxis !== null && pad.buttons.length <= 12) {
      // Linux kernel xpad driver (11 buttons): 6=Back, 7=Start, triggers strictly on axes 2 & 5
      btnA = btn(0);
      btnB = btn(1);
      btnX = btn(2);
      btnY = btn(3);
      btnLB = btn(4);
      btnRB = btn(5);
      btnLT = ltAxisNorm > TRIGGER_PRESS_THRESHOLD;
      btnRT = rtAxisNorm > TRIGGER_PRESS_THRESHOLD;
      btnBack = btn(6);
      btnStart = btn(7);
    } else {
      btnA = btn(0);
      btnB = btn(1);
      btnX = btn(2);
      btnY = btn(3);
      btnLB = btn(4);
      btnRB = btn(5);
      btnLT = ltAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(6);
      btnRT = rtAxisNorm > TRIGGER_PRESS_THRESHOLD || btn(7);
      btnBack = btn(8);
      btnStart = btn(9);
    }

    const rawActivity =
      btnA ||
      btnB ||
      btnX ||
      btnY ||
      btnLB ||
      btnRB ||
      btnLT ||
      btnRT ||
      btnBack ||
      btnStart ||
      dpadUp ||
      dpadDown ||
      dpadLeft ||
      dpadRight ||
      Math.hypot(lx, ly) > this.deadzone ||
      Math.hypot(rx, ry) > Math.min(0.4, this.deadzone + 0.02);

    return {
      profile: cal.profile,
      hasRightStick,
      activeButtonCount,
      state: {
        lx,
        ly,
        rx,
        ry,
        dpadUp,
        dpadDown,
        dpadLeft,
        dpadRight,
        btnA,
        btnB,
        btnX,
        btnY,
        btnLB,
        btnRB,
        btnLT,
        btnRT,
        btnBack,
        btnStart,
        rawActivity,
      },
    };
  }

  private selectActivePad(
    rawPads: readonly (GamepadLike | null | undefined)[],
  ): {
    pad: GamepadLike;
    state: NormalizedPadState;
    profile: GamepadProfileKind;
    hasRightStick: boolean;
    activeButtonCount: number;
  } | null {
    const connectedPads: Array<{
      pad: GamepadLike;
      state: NormalizedPadState;
      profile: GamepadProfileKind;
      hasRightStick: boolean;
      activeButtonCount: number;
    }> = [];

    for (let i = 0; i < rawPads.length; i++) {
      const p = rawPads[i];
      if (!p || !p.connected || isPhantomGamepad(p)) continue;
      const read = this.readPadState(p);
      connectedPads.push({
        pad: p,
        state: read.state,
        profile: read.profile,
        hasRightStick: read.hasRightStick,
        activeButtonCount: read.activeButtonCount,
      });
    }

    // Detect active pad disappearing from getGamepads() (deduplicated with gamepaddisconnected)
    if (
      this.activePadIndex !== null &&
      !connectedPads.some((c) => c.pad.index === this.activePadIndex)
    ) {
      const info: GamepadDisconnectInfo = {
        padIndex: this.activePadIndex,
        padName: this.activePadName,
        family: this.activeFamily,
      };
      this.calibrations.delete(this.activePadIndex);
      this.activePadIndex = null;
      this.activePadName = null;
      this.activeFamily = 'generic';
      this.activeProfile = null;
      this.prevState = null;
      this.lastDebugSnapshot = this.makeEmptyDebugSnapshot();
      this.onDisconnectCallback?.(info);
    }

    if (connectedPads.length === 0) {
      this.activePadIndex = null;
      this.activePadName = null;
      this.activeFamily = 'generic';
      this.activeProfile = null;
      this.prevState = null;
      return null;
    }

    // If any non-active connected pad shows active input, switch to it immediately
    // (critical on Tesla / multi-HID setups where slot 0 may be an idle virtual device)
    let chosen = connectedPads.find((c) => c.pad.index === this.activePadIndex) ?? null;

    if (!chosen || !chosen.state.rawActivity) {
      const activeOther = connectedPads.find((c) => c.state.rawActivity);
      if (activeOther) {
        if (activeOther.pad.index !== this.activePadIndex) {
          this.prevState = null;
        }
        chosen = activeOther;
      }
    }

    if (!chosen) {
      chosen = connectedPads[0]!;
      this.prevState = null;
    }

    this.activePadIndex = chosen.pad.index;
    this.activePadName = chosen.pad.id;
    this.activeFamily = detectGamepadFamily(chosen.pad.id, this.userAgent);
    this.activeProfile = chosen.profile;
    return chosen;
  }

  private sampleNavRepeat(dir: 'up' | 'down' | 'left' | 'right', active: boolean, nowMs: number): boolean {
    const tracker = this.navRepeat[dir];
    if (!active) {
      tracker.held = false;
      tracker.nextFireMs = 0;
      return false;
    }
    if (!tracker.held) {
      tracker.held = true;
      tracker.nextFireMs = nowMs + MENU_NAV_INITIAL_DELAY_MS;
      return true;
    }
    if (nowMs >= tracker.nextFireMs) {
      tracker.nextFireMs = nowMs + MENU_NAV_REPEAT_INTERVAL_MS;
      return true;
    }
    return false;
  }

  poll(): GamepadPollResult {
    const empty: GamepadPollResult = {
      connected: false,
      padIndex: null,
      padName: null,
      family: 'generic',
      profile: null,
      hadActivity: false,
      moveX: 0,
      moveY: 0,
      aimDirX: this.aimDirX,
      aimDirY: this.aimDirY,
      aimActive: false,
      aimMagnitude: 0,
      fireHeld: false,
      firePressed: false,
      activeHeld: false,
      activePressed: false,
      swapPressed: false,
      pickupPressed: false,
      pausePressed: false,
      retryPressed: false,
      menuNavUp: false,
      menuNavDown: false,
      menuNavLeft: false,
      menuNavRight: false,
      menuConfirm: false,
      menuBack: false,
      menuPrevTab: false,
      menuNextTab: false,
      menuSecondary: false,
      menuTertiary: false,
    };

    const rawPads = this.getPadsFn();
    const chosen = this.selectActivePad(rawPads);
    if (!chosen) {
      this.resetState();
      this.lastDebugSnapshot = this.makeEmptyDebugSnapshot();
      return empty;
    }

    const cur = chosen.state;
    const prev = this.prevState;
    const nowMs = this.nowMsFn();

    // Scaled radial deadzones (aim slightly tighter deadzone + finer low-end curve)
    const moveStick = applyRadialDeadzone(cur.lx, cur.ly, this.deadzone, 1.32);
    const aimDeadzone = Math.min(0.4, this.deadzone + 0.02);
    const aimStick = applyRadialDeadzone(cur.rx, cur.ry, aimDeadzone, 1.5);

    // Movement: combine left stick + D-pad
    let moveX = moveStick.x + (cur.dpadRight ? 1 : 0) - (cur.dpadLeft ? 1 : 0);
    let moveY = moveStick.y + (cur.dpadDown ? 1 : 0) - (cur.dpadUp ? 1 : 0);
    const moveMag = Math.hypot(moveX, moveY);
    if (moveMag > 1) {
      moveX /= moveMag;
      moveY /= moveMag;
    }

    // Twin-stick aim persistence: update direction when right stick pushed, KEEP last direction on release.
    // On single-stick / D-pad-only retro pads (!hasRightStick), aim tracks movement direction smoothly.
    const aimActive = aimStick.magnitude > 0;
    if (aimActive) {
      const aLen = Math.hypot(aimStick.x, aimStick.y);
      if (aLen > 1e-5) {
        this.aimDirX = aimStick.x / aLen;
        this.aimDirY = aimStick.y / aLen;
      }
    } else if (!chosen.hasRightStick && moveMag > 0.2) {
      const mLen = Math.hypot(moveX, moveY);
      if (mLen > 1e-5) {
        this.aimDirX = moveX / mLen;
        this.aimDirY = moveY / mLen;
      }
    }

    // Menu stick navigation hysteresis (prevents bounce near threshold)
    this.stickNavState.up = this.stickNavState.up
      ? cur.ly < -MENU_STICK_RELEASE
      : cur.ly < -MENU_STICK_ENGAGE;
    this.stickNavState.down = this.stickNavState.down
      ? cur.ly > MENU_STICK_RELEASE
      : cur.ly > MENU_STICK_ENGAGE;
    this.stickNavState.left = this.stickNavState.left
      ? cur.lx < -MENU_STICK_RELEASE
      : cur.lx < -MENU_STICK_ENGAGE;
    this.stickNavState.right = this.stickNavState.right
      ? cur.lx > MENU_STICK_RELEASE
      : cur.lx > MENU_STICK_ENGAGE;

    const menuNavUp = this.sampleNavRepeat('up', cur.dpadUp || this.stickNavState.up, nowMs);
    const menuNavDown = this.sampleNavRepeat('down', cur.dpadDown || this.stickNavState.down, nowMs);
    const menuNavLeft = this.sampleNavRepeat('left', cur.dpadLeft || this.stickNavState.left, nowMs);
    const menuNavRight = this.sampleNavRepeat('right', cur.dpadRight || this.stickNavState.right, nowMs);

    const edge = (curVal: boolean, prevVal: boolean | undefined): boolean =>
      curVal && !prevVal;

    const fireHeld = cur.btnRT || cur.btnRB;
    const prevFireHeld = Boolean(prev && (prev.btnRT || prev.btnRB));
    const activeHeld = cur.btnLT || cur.btnLB;
    const prevActiveHeld = Boolean(prev && (prev.btnLT || prev.btnLB));

    const firePressed = fireHeld && !prevFireHeld;
    const activePressed = activeHeld && !prevActiveHeld;
    const swapPressed = edge(cur.btnY, prev?.btnY);
    const pickupPressed = edge(cur.btnX, prev?.btnX) || edge(cur.btnA, prev?.btnA);
    const pausePressed = edge(cur.btnStart, prev?.btnStart);
    const retryPressed = edge(cur.btnBack, prev?.btnBack);

    const menuConfirm = edge(cur.btnA, prev?.btnA);
    const menuBack = edge(cur.btnB, prev?.btnB) || edge(cur.btnStart, prev?.btnStart);
    const menuPrevTab = edge(cur.btnLB, prev?.btnLB);
    const menuNextTab = edge(cur.btnRB, prev?.btnRB);
    const menuSecondary = edge(cur.btnY, prev?.btnY);
    const menuTertiary = edge(cur.btnX, prev?.btnX);

    const hadActivity =
      cur.rawActivity ||
      moveStick.magnitude > 0 ||
      aimActive ||
      fireHeld ||
      activeHeld;

    this.prevState = cur;
    this.lastDebugSnapshot = {
      connected: true,
      padIndex: chosen.pad.index,
      padName: chosen.pad.id,
      family: this.activeFamily,
      profile: chosen.profile,
      lx: cur.lx,
      ly: cur.ly,
      rx: cur.rx,
      ry: cur.ry,
      lt: cur.btnLT,
      rt: cur.btnRT,
      activeButtonCount: chosen.activeButtonCount,
    };

    return {
      connected: true,
      padIndex: chosen.pad.index,
      padName: chosen.pad.id,
      family: this.activeFamily,
      profile: chosen.profile,
      hadActivity,
      moveX,
      moveY,
      aimDirX: this.aimDirX,
      aimDirY: this.aimDirY,
      aimActive,
      aimMagnitude: aimStick.magnitude,
      fireHeld,
      firePressed,
      activeHeld,
      activePressed,
      swapPressed,
      pickupPressed,
      pausePressed,
      retryPressed,
      menuNavUp,
      menuNavDown,
      menuNavLeft,
      menuNavRight,
      menuConfirm,
      menuBack,
      menuPrevTab,
      menuNextTab,
      menuSecondary,
      menuTertiary,
    };
  }

  /**
   * Triggers safe, feature-detected dual-rumble haptic feedback on the active gamepad.
   * Uses Chromium `vibrationActuator.playEffect('dual-rumble', ...)` first and falls back
   * to Firefox/Safari `hapticActuators[0].pulse(strength, duration)` when absent.
   * Silently no-ops on Tesla Chromium or any unsupported browser without throwing.
   */
  rumble(specOrPreset: RumblePreset | RumbleSpec): boolean {
    if (!this.rumbleEnabled || this.activePadIndex === null) return false;

    const spec: RumbleSpec =
      typeof specOrPreset === 'string' ? RUMBLE_PRESETS[specOrPreset] : specOrPreset;
    const priority = spec.priority ?? 1;
    const nowMs = this.nowMsFn();

    if (nowMs < this.rumbleBusyUntilMs && priority < this.rumbleActivePriority) {
      return false;
    }

    const pads = this.getPadsFn();
    let activePad: GamepadLike | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.index === this.activePadIndex) {
        activePad = p;
        break;
      }
    }
    if (!activePad) return false;

    const duration = Math.max(15, Math.min(500, Math.round(spec.durationMs)));
    const weakMagnitude = clamp(spec.weakMagnitude, 0, 1);
    const strongMagnitude = clamp(spec.strongMagnitude, 0, 1);

    const actuator = activePad.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        const maybePromise = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude,
          strongMagnitude,
        });
        if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
          void (maybePromise as Promise<unknown>).catch(() => {});
        }
        this.rumbleBusyUntilMs = nowMs + duration * 0.8;
        this.rumbleActivePriority = priority;
        return true;
      } catch {
        // Fall through to hapticActuators fallback if available
      }
    }

    const haptic = activePad.hapticActuators?.[0];
    if (haptic && typeof haptic.pulse === 'function') {
      try {
        const strength = clamp(Math.max(strongMagnitude, weakMagnitude), 0, 1);
        const maybePromise = haptic.pulse(strength, duration);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
          void (maybePromise as Promise<unknown>).catch(() => {});
        }
        this.rumbleBusyUntilMs = nowMs + duration * 0.8;
        this.rumbleActivePriority = priority;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }
}
