import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_4_3,
  type ControlSettings,
  type InputDeviceMode,
  type InputFrame,
  type KeyBindings,
  type WorldMap,
} from '@/contracts';
import type { CameraController } from '@/render/camera';
import {
  DEFAULT_CONTROL_SETTINGS,
  GamepadManager,
  applyControllerAimAssist,
  type AimAssistEnemy,
  type GamepadLike,
  type GamepadPollResult,
  type GamepadProfileKind,
  type RumblePreset,
  type RumbleSpec,
} from './gamepad';
import { TouchControlsManager } from './touch-controls';

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  swap: 'KeyQ',
  pickup: 'KeyE',
  pause: 'Escape',
  activeAlt: 'Space',
};

export interface PointerSnapshot {
  logicalX: number;
  logicalY: number;
  down: boolean;
  clicked: boolean;
  rightClicked: boolean;
  moved?: boolean;
}

export interface MenuInputSnapshot {
  pointer: PointerSnapshot;
  navUp: boolean;
  navDown: boolean;
  navLeft: boolean;
  navRight: boolean;
  confirm: boolean;
  back: boolean;
  retry: boolean;
  prevTab?: boolean;
  nextTab?: boolean;
  secondary?: boolean;
  tertiary?: boolean;
  deviceMode?: InputDeviceMode;
  selectIndex?: number;
  capturedKeyCode?: string;
}

export interface SimInputContext {
  enemies?: readonly AimAssistEnemy[];
  map?: WorldMap | null;
}

export interface InputManagerOptions {
  controls?: ControlSettings;
  getGamepads?: () => readonly (GamepadLike | null | undefined)[];
  nowMs?: () => number;
  onUserInteraction?: (mode: InputDeviceMode) => void;
}

const TOUCH_COMPAT_MOUSE_WINDOW_MS = 450;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Converts client (browser viewport) pointer coordinates into logical canvas pixel coordinates.
 */
export function clientToLogicalCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  logicalWidth: number,
  logicalHeight: number,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: logicalWidth * 0.5, y: logicalHeight * 0.5 };
  }
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return {
    x: clamp(nx * logicalWidth, 0, logicalWidth),
    y: clamp(ny * logicalHeight, 0, logicalHeight),
  };
}

function isTouchSynthesizedMouseEvent(e: MouseEvent): boolean {
  const sc = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } })
    .sourceCapabilities;
  return Boolean(sc && sc.firesTouchEvents);
}

/**
 * Unified input controller handling:
 * - WASD/Arrows + Mouse (KBM) with custom keybinds
 * - First-class PC + Tesla Chromium Gamepad (standard + non-standard evdev/HID, aim assist, rumble)
 * - Sleek, Non-Blocking, Invisible-Until-Touch Floating Dual-Stick & Edge Ghost Triggers
 * - Automatic active device switching (`'kbm' | 'gamepad' | 'touch'`)
 * - Accurate client -> logical canvas -> world coordinate transform via CameraController
 * - Edge-triggered pressed flags cleared cleanly per simulation step
 * - 100% headless-Node-safe with direct simulation injection helpers
 */
export class InputManager {
  private keybinds: KeyBindings;
  private controlSettings: ControlSettings;
  private readonly gamepad: GamepadManager;
  private readonly touch: TouchControlsManager;
  private readonly nowMsFn: () => number;
  private readonly onUserInteraction?: (mode: InputDeviceMode) => void;

  private canvas: HTMLCanvasElement | null = null;
  private logicalWidth = LOGICAL_WIDTH_4_3;
  private logicalHeight = LOGICAL_HEIGHT;
  private gameplayActive = false;

  private deviceMode: InputDeviceMode = 'kbm';
  private keysHeld = new Set<string>();
  private mouseButtonsHeld = new Set<number>();

  // Logical canvas pointer coordinates
  private pointerLogicalX = LOGICAL_WIDTH_4_3 * 0.5;
  private pointerLogicalY = LOGICAL_HEIGHT * 0.5;
  private pointerMoved = false;
  private activeMenuTouchPointerId: number | null = null;

  // Dedup timestamps between PointerEvent and Mouse/TouchEvent (per-button for chorded LMB+RMB!)
  private lastPointerMouseMoveMs = -10000;
  private lastPointerTouchMs = -10000;
  private lastAnyTouchMs = -10000;
  private lastPointerDownMsByButton = new Map<number, number>();
  private lastPointerUpMsByButton = new Map<number, number>();
  private lastWheelSwapMs = -10000;
  private lastMouseClientX: number | null = null;
  private lastMouseClientY: number | null = null;

  // Edge-triggered simulation latches (cleared on consumeSimInput / clearSimLatches)
  private firePressed = false;
  private activePressed = false;
  private swapPressed = false;
  private pickupPressed = false;
  private pausePressed = false;
  private retryPressed = false;
  private selectIndex: number | undefined = undefined;

  // Edge-triggered UI / Menu latches (nav directions buffered with step counters so rapid taps never collapse)
  private menuClicked = false;
  private menuRightClicked = false;
  private menuNavUpCount = 0;
  private menuNavDownCount = 0;
  private menuNavLeftCount = 0;
  private menuNavRightCount = 0;
  private menuConfirm = false;
  private menuBack = false;
  private menuRetry = false;
  private menuPrevTab = false;
  private menuNextTab = false;
  private menuSecondary = false;
  private menuTertiary = false;
  private menuSelectIndex: number | undefined = undefined;

  // Keybind rebinding capture state
  private capturingKey = false;
  private capturedKeyCode: string | undefined = undefined;

  // Bound DOM listeners for clean attach/detach
  private attached = false;
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundPointerCancel = (e: PointerEvent) => this.onPointerCancel(e);
  private boundTouchStart = (e: TouchEvent) => this.onTouchStart(e);
  private boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private boundTouchEnd = (e: TouchEvent) => this.onTouchEnd(e);
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
  private boundWheel = (e: WheelEvent) => this.onWheel(e);
  private boundContextMenu = (e: MouseEvent) => e.preventDefault();
  private boundBlur = () => this.resetHeldState();

  constructor(
    keybinds: KeyBindings = DEFAULT_KEYBINDINGS,
    options: InputManagerOptions = {},
  ) {
    this.keybinds = { ...keybinds };
    this.controlSettings = { ...DEFAULT_CONTROL_SETTINGS, ...(options.controls ?? {}) };
    this.nowMsFn =
      options.nowMs ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onUserInteraction = options.onUserInteraction;

    this.gamepad = new GamepadManager({
      getGamepads: options.getGamepads,
      nowMs: this.nowMsFn,
      onConnect: () => {
        this.onUserInteraction?.('gamepad');
      },
    });
    this.gamepad.applySettings(this.controlSettings);
    this.touch = new TouchControlsManager();
  }

  setKeybinds(keybinds: KeyBindings): void {
    this.keybinds = { ...keybinds };
  }

  getKeybinds(): KeyBindings {
    return { ...this.keybinds };
  }

  setControlSettings(settings: ControlSettings): void {
    this.controlSettings = { ...settings };
    this.gamepad.applySettings(this.controlSettings);
    if (this.controlSettings.touchMode === 'off') {
      this.touch.clearAllTouches();
    }
  }

  getControlSettings(): ControlSettings {
    return { ...this.controlSettings };
  }

  getInputMode(): InputDeviceMode {
    return this.deviceMode;
  }

  /**
   * STRICT VISIBILITY RULE:
   * Returns true ONLY when real touch input is the active device mode AND
   * touch controls are not disabled in Options. Never true on desktop KBM or Gamepad.
   */
  isTouchOverlayVisible(): boolean {
    return this.deviceMode === 'touch' && this.controlSettings.touchMode !== 'off';
  }

  getGamepadInfo(): {
    connected: boolean;
    padIndex: number | null;
    padName: string | null;
    profile: GamepadProfileKind | null;
  } {
    return this.gamepad.getConnectedInfo();
  }

  getTouchManager(): TouchControlsManager {
    return this.touch;
  }

  getGamepadManager(): GamepadManager {
    return this.gamepad;
  }

  setGameplayActive(active: boolean): void {
    if (this.gameplayActive !== active) {
      this.gameplayActive = active;
      this.touch.clearAllTouches();
      this.activeMenuTouchPointerId = null;
      if (active) {
        this.clearSimLatches();
      } else {
        this.clearMenuLatches();
      }
    }
  }

  setLogicalSize(width: number, height: number): void {
    const nextW = Math.max(1, width);
    const nextH = Math.max(1, height);
    if (this.logicalWidth > 0 && this.logicalHeight > 0 && (nextW !== this.logicalWidth || nextH !== this.logicalHeight)) {
      this.pointerLogicalX = clamp((this.pointerLogicalX / this.logicalWidth) * nextW, 0, nextW);
      this.pointerLogicalY = clamp((this.pointerLogicalY / this.logicalHeight) * nextH, 0, nextH);
    }
    this.logicalWidth = nextW;
    this.logicalHeight = nextH;
    this.touch.setLogicalSize(this.logicalWidth, this.logicalHeight);
  }

  beginKeyCapture(): void {
    this.capturingKey = true;
    this.capturedKeyCode = undefined;
  }

  cancelKeyCapture(): void {
    this.capturingKey = false;
    this.capturedKeyCode = undefined;
  }

  isCapturingKey(): boolean {
    return this.capturingKey;
  }

  private setDeviceMode(next: InputDeviceMode): void {
    if (this.deviceMode !== next) {
      if (this.deviceMode === 'touch' && next !== 'touch') {
        this.touch.clearAllTouches();
        this.activeMenuTouchPointerId = null;
      }
      this.deviceMode = next;
    }
    this.onUserInteraction?.(next);
  }

  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.canvas = canvas;
    this.logicalWidth = canvas.width || LOGICAL_WIDTH_4_3;
    this.logicalHeight = canvas.height || LOGICAL_HEIGHT;
    this.touch.setLogicalSize(this.logicalWidth, this.logicalHeight);
    this.pointerLogicalX = this.logicalWidth * 0.5;
    this.pointerLogicalY = this.logicalHeight * 0.5;

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('pointermove', this.boundPointerMove);
      window.addEventListener('pointerup', this.boundPointerUp);
      window.addEventListener('pointercancel', this.boundPointerCancel);
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('mouseup', this.boundMouseUp);
      window.addEventListener('blur', this.boundBlur);
    }

    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.boundContextMenu);

    this.gamepad.attachListeners();
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('pointercancel', this.boundPointerCancel);
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('mouseup', this.boundMouseUp);
      window.removeEventListener('blur', this.boundBlur);
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchmove', this.boundTouchMove);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.boundTouchEnd);
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('wheel', this.boundWheel);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    this.gamepad.detachListeners();
    this.canvas = null;
    this.attached = false;
  }

  resetHeldState(): void {
    this.keysHeld.clear();
    this.mouseButtonsHeld.clear();
    this.lastPointerDownMsByButton.clear();
    this.lastPointerUpMsByButton.clear();
    this.touch.clearAllTouches();
    this.gamepad.resetState();
    this.activeMenuTouchPointerId = null;
  }

  getPointerLogical(): { x: number; y: number } {
    return { x: this.pointerLogicalX, y: this.pointerLogicalY };
  }

  isRetryPressed(): boolean {
    return this.retryPressed;
  }

  consumeRetryPressed(): boolean {
    const was = this.retryPressed;
    this.retryPressed = false;
    return was;
  }

  updatePresentation(dtSeconds: number): void {
    this.touch.updateFade(dtSeconds);
  }

  renderTouchOverlay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    nearbyInteractable: boolean,
    timeSec: number,
  ): void {
    if (!this.isTouchOverlayVisible()) return;
    this.touch.render(ctx, width, height, {
      visible: true,
      nearbyInteractable,
      timeSec,
    });
  }

  rumble(specOrPreset: RumblePreset | RumbleSpec): boolean {
    if (this.deviceMode !== 'gamepad') return false;
    return this.gamepad.rumble(specOrPreset);
  }

  // --------------------------------------------------------------------------
  // Headless-friendly input injection methods (used by both DOM events & tests)
  // --------------------------------------------------------------------------

  private isCodeBoundToNonPauseAction(code: string): boolean {
    const kb = this.keybinds;
    return (
      code === kb.up ||
      code === kb.down ||
      code === kb.left ||
      code === kb.right ||
      code === kb.swap ||
      code === kb.pickup ||
      code === kb.activeAlt
    );
  }

  simulateKeyDown(code: string, repeat: boolean = false): void {
    this.setDeviceMode('kbm');

    if (this.capturingKey) {
      if (!repeat) {
        if (code === 'Escape') {
          this.menuBack = true;
        } else {
          this.capturedKeyCode = code;
        }
        this.capturingKey = false;
      }
      return;
    }

    const wasHeld = this.keysHeld.has(code);
    this.keysHeld.add(code);
    if (repeat || wasHeld) return;

    const kb = this.keybinds;

    // Gameplay edge-triggered actions
    if (code === kb.swap) this.swapPressed = true;
    if (code === kb.pickup) this.pickupPressed = true;
    const isPauseKey =
      code === kb.pause ||
      code === 'Escape' ||
      (code === 'KeyP' && !this.isCodeBoundToNonPauseAction('KeyP'));
    if (isPauseKey) {
      this.pausePressed = true;
      if (!this.gameplayActive) {
        this.menuBack = true;
      }
    }
    if (code === kb.activeAlt) {
      this.activePressed = true;
    }
    if (code === 'KeyR' && !this.isCodeBoundToNonPauseAction('KeyR') && kb.pause !== 'KeyR') {
      this.retryPressed = true;
      if (!this.gameplayActive) {
        this.menuRetry = true;
      }
    }

    // Quick pick 1-5 (both top-row Digit1..5 and Numpad1..5)
    let pickedDigit: number | undefined = undefined;
    if (code === 'Digit1' || code === 'Numpad1') pickedDigit = 0;
    else if (code === 'Digit2' || code === 'Numpad2') pickedDigit = 1;
    else if (code === 'Digit3' || code === 'Numpad3') pickedDigit = 2;
    else if (code === 'Digit4' || code === 'Numpad4') pickedDigit = 3;
    else if (code === 'Digit5' || code === 'Numpad5') pickedDigit = 4;

    if (pickedDigit !== undefined) {
      this.selectIndex = pickedDigit;
      if (!this.gameplayActive) {
        this.menuSelectIndex = pickedDigit;
      }
    }

    // Menu navigation (suppressed while gameplayActive so gameplay WASD/Space never auto-confirms Mutation/GameOver on frame 0!)
    if (!this.gameplayActive) {
      if (code === 'ArrowUp' || code === kb.up) this.menuNavUpCount = Math.min(16, this.menuNavUpCount + 1);
      if (code === 'ArrowDown' || code === kb.down) this.menuNavDownCount = Math.min(16, this.menuNavDownCount + 1);
      if (code === 'ArrowLeft' || code === kb.left) this.menuNavLeftCount = Math.min(16, this.menuNavLeftCount + 1);
      if (code === 'ArrowRight' || code === kb.right) this.menuNavRightCount = Math.min(16, this.menuNavRightCount + 1);
      if (code === 'Enter' || code === 'Space') this.menuConfirm = true;
      if (code === 'BracketLeft') this.menuPrevTab = true;
      if (code === 'BracketRight') this.menuNextTab = true;
    }
  }

  simulateKeyUp(code: string): void {
    this.keysHeld.delete(code);
  }

  simulateMouseMoveLogical(logicalX: number, logicalY: number): void {
    this.pointerLogicalX = clamp(logicalX, 0, this.logicalWidth);
    this.pointerLogicalY = clamp(logicalY, 0, this.logicalHeight);
    this.pointerMoved = true;
    this.setDeviceMode('kbm');
  }

  simulateMouseMoveClient(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
  ): void {
    const pos = clientToLogicalCanvas(
      clientX,
      clientY,
      rect,
      this.logicalWidth,
      this.logicalHeight,
    );
    this.simulateMouseMoveLogical(pos.x, pos.y);
  }

  simulateMouseButton(button: number, down: boolean): void {
    this.setDeviceMode('kbm');
    if (down) {
      const wasDown = this.mouseButtonsHeld.has(button);
      this.mouseButtonsHeld.add(button);
      if (!wasDown) {
        if (button === 0) {
          this.firePressed = true;
          if (!this.gameplayActive) {
            this.menuClicked = true;
          }
          this.pointerMoved = true;
        } else if (button === 2) {
          this.activePressed = true;
          if (!this.gameplayActive) {
            this.menuRightClicked = true;
          }
        }
      }
    } else {
      this.mouseButtonsHeld.delete(button);
    }
  }

  simulateWheel(deltaY: number): void {
    if (deltaY !== 0) {
      this.setDeviceMode('kbm');
      this.swapPressed = true;
    }
  }

  simulateTouchStartLogical(pointerId: number, logicalX: number, logicalY: number): void {
    const x = clamp(logicalX, 0, this.logicalWidth);
    const y = clamp(logicalY, 0, this.logicalHeight);

    if (this.gameplayActive) {
      if (this.controlSettings.touchMode === 'off') {
        return;
      }
      this.setDeviceMode('touch');
      this.touch.handleGameplayTouchStart(pointerId, x, y);
      return;
    }

    this.setDeviceMode('touch');
    // Menu tap / slider drag start
    this.pointerLogicalX = x;
    this.pointerLogicalY = y;
    this.pointerMoved = true;
    this.activeMenuTouchPointerId = pointerId;
    this.mouseButtonsHeld.add(0);
    this.menuClicked = true;
  }

  simulateTouchMoveLogical(pointerId: number, logicalX: number, logicalY: number): void {
    const x = clamp(logicalX, 0, this.logicalWidth);
    const y = clamp(logicalY, 0, this.logicalHeight);

    if (this.gameplayActive) {
      if (this.controlSettings.touchMode === 'off') {
        return;
      }
      this.setDeviceMode('touch');
      this.touch.handleGameplayTouchMove(pointerId, x, y);
      return;
    }

    this.setDeviceMode('touch');
    if (this.activeMenuTouchPointerId === pointerId) {
      this.pointerLogicalX = x;
      this.pointerLogicalY = y;
      this.pointerMoved = true;
    }
  }

  simulateTouchEnd(pointerId: number): void {
    this.touch.handleGameplayTouchEnd(pointerId);
    if (this.activeMenuTouchPointerId === pointerId) {
      this.activeMenuTouchPointerId = null;
      this.mouseButtonsHeld.delete(0);
    }
  }

  // --------------------------------------------------------------------------
  // DOM event handlers
  // --------------------------------------------------------------------------

  private mapClientEvent(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.canvas) {
      return { x: this.pointerLogicalX, y: this.pointerLogicalY };
    }
    const rect = this.canvas.getBoundingClientRect();
    this.logicalWidth = this.canvas.width || this.logicalWidth;
    this.logicalHeight = this.canvas.height || this.logicalHeight;
    this.touch.setLogicalSize(this.logicalWidth, this.logicalHeight);
    return clientToLogicalCanvas(clientX, clientY, rect, this.logicalWidth, this.logicalHeight);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }
    this.simulateKeyDown(e.code, e.repeat);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.simulateKeyUp(e.code);
  }

  /**
   * Synchronizes held mouse button state directly from the W3C PointerEvent.buttons bitmask
   * (bit 1 = LMB/0, bit 2 = RMB/2, bit 4 = MMB/1). Essential in Chromium where chorded
   * LMB+RMB presses and partial button releases emit `pointermove` with updated `buttons`
   * instead of secondary `pointerdown`/`pointerup` events.
   */
  private syncMouseButtonsBitmask(buttons: number, now: number): boolean {
    let changed = false;
    const checks: ReadonlyArray<readonly [number, number]> = [
      [0, 1], // LMB
      [2, 2], // RMB
      [1, 4], // MMB
    ];
    for (let i = 0; i < checks.length; i++) {
      const [btn, mask] = checks[i]!;
      const isDown = (buttons & mask) !== 0;
      const wasDown = this.mouseButtonsHeld.has(btn);
      if (isDown !== wasDown) {
        changed = true;
        if (isDown) {
          this.lastPointerDownMsByButton.set(btn, now);
          this.lastPointerUpMsByButton.delete(btn);
        } else {
          this.lastPointerUpMsByButton.set(btn, now);
          this.lastPointerDownMsByButton.delete(btn);
        }
        this.simulateMouseButton(btn, isDown);
      }
    }
    return changed;
  }

  private onPointerDown(e: PointerEvent): void {
    const pos = this.mapClientEvent(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      e.preventDefault();
      this.lastPointerTouchMs = this.nowMsFn();
      this.lastAnyTouchMs = this.lastPointerTouchMs;
      if (this.canvas && typeof this.canvas.setPointerCapture === 'function') {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic PointerEvents do not own an active browser pointerId
        }
      }
      this.simulateTouchStartLogical(e.pointerId, pos.x, pos.y);
      return;
    }

    const now = this.nowMsFn();
    this.lastPointerMouseMoveMs = now;
    this.lastPointerDownMsByButton.set(e.button, now);
    this.lastPointerUpMsByButton.delete(e.button);
    this.lastMouseClientX = e.clientX;
    this.lastMouseClientY = e.clientY;
    this.simulateMouseMoveLogical(pos.x, pos.y);
    this.simulateMouseButton(e.button, true);
    if (typeof e.buttons === 'number' && e.buttons !== 0) {
      this.syncMouseButtonsBitmask(e.buttons, now);
    }
  }

  private isSubThresholdMouseJitter(clientX: number, clientY: number): boolean {
    if (this.deviceMode === 'kbm' || this.lastMouseClientX === null || this.lastMouseClientY === null) {
      return false;
    }
    return Math.hypot(clientX - this.lastMouseClientX, clientY - this.lastMouseClientY) < 2;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.canvas) return;
    const pos = this.mapClientEvent(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      if (this.gameplayActive || this.activeMenuTouchPointerId === e.pointerId) {
        e.preventDefault();
      }
      this.lastPointerTouchMs = this.nowMsFn();
      this.lastAnyTouchMs = this.lastPointerTouchMs;
      this.simulateTouchMoveLogical(e.pointerId, pos.x, pos.y);
      return;
    }

    const now = this.nowMsFn();
    // Sync chorded mouse button presses/releases from PointerEvent.buttons BEFORE jitter gate
    const buttonsChanged =
      typeof e.buttons === 'number' ? this.syncMouseButtonsBitmask(e.buttons, now) : false;

    if (!buttonsChanged && this.isSubThresholdMouseJitter(e.clientX, e.clientY)) {
      return;
    }
    this.lastMouseClientX = e.clientX;
    this.lastMouseClientY = e.clientY;
    this.lastPointerMouseMoveMs = now;
    this.simulateMouseMoveLogical(pos.x, pos.y);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.lastPointerTouchMs = this.nowMsFn();
      this.lastAnyTouchMs = this.lastPointerTouchMs;
      if (this.canvas && typeof this.canvas.releasePointerCapture === 'function') {
        try {
          if (this.canvas.hasPointerCapture?.(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch {
          // ignore synthetic pointer errors
        }
      }
      this.simulateTouchEnd(e.pointerId);
      return;
    }

    const now = this.nowMsFn();
    this.lastPointerMouseMoveMs = now;
    this.lastPointerUpMsByButton.set(e.button, now);
    this.lastPointerDownMsByButton.delete(e.button);
    this.simulateMouseButton(e.button, false);
    if (typeof e.buttons === 'number') {
      this.syncMouseButtonsBitmask(e.buttons, now);
    }
  }

  private onPointerCancel(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.lastAnyTouchMs = this.nowMsFn();
      this.simulateTouchEnd(e.pointerId);
    } else {
      this.mouseButtonsHeld.clear();
    }
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const now = this.nowMsFn();
    this.lastAnyTouchMs = now;
    if (now - this.lastPointerTouchMs < 25) {
      return; // Already handled by PointerEvent
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      const pos = this.mapClientEvent(t.clientX, t.clientY);
      this.simulateTouchStartLogical(10000 + t.identifier, pos.x, pos.y);
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const now = this.nowMsFn();
    this.lastAnyTouchMs = now;
    if (now - this.lastPointerTouchMs < 25) {
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      const pos = this.mapClientEvent(t.clientX, t.clientY);
      this.simulateTouchMoveLogical(10000 + t.identifier, pos.x, pos.y);
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    const now = this.nowMsFn();
    this.lastAnyTouchMs = now;
    if (now - this.lastPointerTouchMs < 25) {
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      this.simulateTouchEnd(10000 + t.identifier);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.canvas || isTouchSynthesizedMouseEvent(e)) return;
    const now = this.nowMsFn();
    if (now - this.lastPointerMouseMoveMs < 6) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    if (this.isSubThresholdMouseJitter(e.clientX, e.clientY)) return;
    this.lastMouseClientX = e.clientX;
    this.lastMouseClientY = e.clientY;
    const pos = this.mapClientEvent(e.clientX, e.clientY);
    this.simulateMouseMoveLogical(pos.x, pos.y);
  }

  private onMouseDown(e: MouseEvent): void {
    if (isTouchSynthesizedMouseEvent(e)) return;
    const now = this.nowMsFn();
    const lastDownForBtn = this.lastPointerDownMsByButton.get(e.button) ?? -10000;
    if (now - lastDownForBtn < 12) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    this.lastMouseClientX = e.clientX;
    this.lastMouseClientY = e.clientY;
    if (this.canvas) {
      const pos = this.mapClientEvent(e.clientX, e.clientY);
      this.simulateMouseMoveLogical(pos.x, pos.y);
    }
    this.simulateMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    if (isTouchSynthesizedMouseEvent(e)) return;
    const now = this.nowMsFn();
    const lastUpForBtn = this.lastPointerUpMsByButton.get(e.button) ?? -10000;
    if (now - lastUpForBtn < 12) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    this.simulateMouseButton(e.button, false);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY === 0) return;
    const now = this.nowMsFn();
    if (now - this.lastWheelSwapMs < 80) return;
    this.lastWheelSwapMs = now;
    this.simulateWheel(e.deltaY);
  }

  // --------------------------------------------------------------------------
  // Gamepad polling & latch merging
  // --------------------------------------------------------------------------

  private pollGamepadAndMerge(): GamepadPollResult {
    const gp = this.gamepad.poll();
    if (gp.hadActivity) {
      this.setDeviceMode('gamepad');
    }

    if (gp.firePressed) this.firePressed = true;
    if (gp.activePressed) this.activePressed = true;
    if (gp.swapPressed) this.swapPressed = true;
    if (gp.pickupPressed) this.pickupPressed = true;
    if (gp.pausePressed) this.pausePressed = true;
    if (gp.retryPressed) {
      this.retryPressed = true;
      if (!this.gameplayActive) {
        this.menuRetry = true;
      }
    }

    if (!this.gameplayActive) {
      if (gp.menuNavUp) this.menuNavUpCount = Math.min(16, this.menuNavUpCount + 1);
      if (gp.menuNavDown) this.menuNavDownCount = Math.min(16, this.menuNavDownCount + 1);
      if (gp.menuNavLeft) this.menuNavLeftCount = Math.min(16, this.menuNavLeftCount + 1);
      if (gp.menuNavRight) this.menuNavRightCount = Math.min(16, this.menuNavRightCount + 1);
      if (gp.menuConfirm) this.menuConfirm = true;
      if (gp.menuBack) this.menuBack = true;
      if (gp.menuPrevTab) this.menuPrevTab = true;
      if (gp.menuNextTab) this.menuNextTab = true;
      if (gp.menuSecondary) this.menuSecondary = true;
      if (gp.menuTertiary) this.menuTertiary = true;
    }

    return gp;
  }

  /**
   * High-frequency gamepad poll for 60/120 Hz render frames between 30 Hz sim steps,
   * capturing brief button taps into edge latches so zero inputs are dropped.
   */
  pollGamepad(): GamepadPollResult {
    return this.pollGamepadAndMerge();
  }

  /**
   * Smoothly refreshes Gamepad / Touch crosshair & aim world coordinates at 60/120 Hz
   * using the interpolated player position so reticle and camera look-ahead never stutter at 30 Hz.
   */
  updatePresentationAim(
    camera: CameraController,
    interpPlayerX: number,
    interpPlayerY: number,
    simContext?: SimInputContext,
  ): { x: number; y: number } {
    if (this.deviceMode === 'gamepad') {
      const gp = this.pollGamepadAndMerge();
      let dirX = gp.aimDirX;
      let dirY = gp.aimDirY;
      if (this.controlSettings.gamepadAimAssist && simContext?.enemies) {
        const assisted = applyControllerAimAssist(
          interpPlayerX,
          interpPlayerY,
          dirX,
          dirY,
          simContext.enemies,
          simContext.map ?? null,
          { enabled: true },
        );
        dirX = assisted.dirX;
        dirY = assisted.dirY;
      }
      const lookDist = 76 + gp.aimMagnitude * 28;
      const aimWorldX = interpPlayerX + dirX * lookDist;
      const aimWorldY = interpPlayerY + dirY * lookDist;
      const scr = camera.worldToScreen(aimWorldX, aimWorldY);
      this.pointerLogicalX = clamp(scr.x, 0, camera.viewportWidth);
      this.pointerLogicalY = clamp(scr.y, 0, camera.viewportHeight);
      return { x: aimWorldX, y: aimWorldY };
    }

    if (this.isTouchOverlayVisible()) {
      const aimStick = this.touch.getAimStickState();
      const aimDir = this.touch.getLastAimDirection();
      const lookDist = 72 + (aimStick.active ? aimStick.magnitude : 0) * 26;
      const aimWorldX = interpPlayerX + aimDir.x * lookDist;
      const aimWorldY = interpPlayerY + aimDir.y * lookDist;
      const scr = camera.worldToScreen(aimWorldX, aimWorldY);
      this.pointerLogicalX = clamp(scr.x, 0, camera.viewportWidth);
      this.pointerLogicalY = clamp(scr.y, 0, camera.viewportHeight);
      return { x: aimWorldX, y: aimWorldY };
    }

    return camera.screenToWorld(this.pointerLogicalX, this.pointerLogicalY);
  }

  /**
   * Polls pause state while preserving gameplay edge latches (fire/active/swap/pickup)
   * across hitstop freeze ticks so rapid inputs during kill-stop never get swallowed.
   */
  consumePauseOnly(): boolean {
    this.pollGamepadAndMerge();
    const touchPause = this.touch.isTriggerPressed('pause');
    const wasPaused = this.pausePressed || touchPause;
    this.pausePressed = false;
    return wasPaused;
  }

  /**
   * Produces a clean per-tick InputFrame for SimEngine and clears all
   * edge-triggered sim press latches so single clicks/presses fire once.
   */
  consumeSimInput(
    camera: CameraController,
    playerWorldX?: number,
    playerWorldY?: number,
    simContext?: SimInputContext,
  ): InputFrame {
    const gp = this.pollGamepadAndMerge();
    const touchSample = this.touch.sampleGameplay();
    const kb = this.keybinds;

    if (touchSample.firePressed) this.firePressed = true;
    if (touchSample.activePressed) this.activePressed = true;
    if (touchSample.swapPressed) this.swapPressed = true;
    if (touchSample.pickupPressed) this.pickupPressed = true;
    if (touchSample.pausePressed) this.pausePressed = true;

    let moveX = gp.moveX + touchSample.moveX;
    let moveY = gp.moveY + touchSample.moveY;

    if (this.keysHeld.has(kb.left) || this.keysHeld.has('ArrowLeft')) moveX -= 1;
    if (this.keysHeld.has(kb.right) || this.keysHeld.has('ArrowRight')) moveX += 1;
    if (this.keysHeld.has(kb.up) || this.keysHeld.has('ArrowUp')) moveY -= 1;
    if (this.keysHeld.has(kb.down) || this.keysHeld.has('ArrowDown')) moveY += 1;

    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    let aimWorldX: number;
    let aimWorldY: number;

    if (
      this.deviceMode === 'gamepad' &&
      playerWorldX !== undefined &&
      playerWorldY !== undefined
    ) {
      // Keep touch aim direction synchronized if player switches devices mid-run
      let dirX = gp.aimDirX;
      let dirY = gp.aimDirY;

      if (this.controlSettings.gamepadAimAssist && simContext?.enemies) {
        const assisted = applyControllerAimAssist(
          playerWorldX,
          playerWorldY,
          dirX,
          dirY,
          simContext.enemies,
          simContext.map ?? null,
          { enabled: true },
        );
        dirX = assisted.dirX;
        dirY = assisted.dirY;
      }

      const lookDist = 76 + gp.aimMagnitude * 28;
      aimWorldX = playerWorldX + dirX * lookDist;
      aimWorldY = playerWorldY + dirY * lookDist;
      const scr = camera.worldToScreen(aimWorldX, aimWorldY);
      this.pointerLogicalX = clamp(scr.x, 0, camera.viewportWidth);
      this.pointerLogicalY = clamp(scr.y, 0, camera.viewportHeight);
    } else if (
      this.isTouchOverlayVisible() &&
      playerWorldX !== undefined &&
      playerWorldY !== undefined
    ) {
      const lookDist = 72 + touchSample.aimMagnitude * 26;
      aimWorldX = playerWorldX + touchSample.aimDirX * lookDist;
      aimWorldY = playerWorldY + touchSample.aimDirY * lookDist;
      const scr = camera.worldToScreen(aimWorldX, aimWorldY);
      this.pointerLogicalX = clamp(scr.x, 0, camera.viewportWidth);
      this.pointerLogicalY = clamp(scr.y, 0, camera.viewportHeight);
    } else {
      const world = camera.screenToWorld(this.pointerLogicalX, this.pointerLogicalY);
      aimWorldX = world.x;
      aimWorldY = world.y;
    }

    const fireHeld = this.mouseButtonsHeld.has(0) || gp.fireHeld || touchSample.fireHeld;
    const activeHeld =
      this.mouseButtonsHeld.has(2) ||
      this.keysHeld.has(kb.activeAlt) ||
      gp.activeHeld ||
      touchSample.activeHeld;

    const frame: InputFrame = {
      moveX,
      moveY,
      aimWorldX,
      aimWorldY,
      fireHeld,
      firePressed: this.firePressed,
      activeHeld,
      activePressed: this.activePressed,
      swapPressed: this.swapPressed,
      pickupPressed: this.pickupPressed,
      pausePressed: this.pausePressed,
      selectIndex: this.selectIndex,
    };

    // Clear edge-triggered sim latches after sampling
    this.clearSimLatches();

    return frame;
  }

  clearSimLatches(): void {
    this.firePressed = false;
    this.activePressed = false;
    this.swapPressed = false;
    this.pickupPressed = false;
    this.pausePressed = false;
    this.selectIndex = undefined;
  }

  clearMenuLatches(): void {
    this.pointerMoved = false;
    this.menuClicked = false;
    this.menuRightClicked = false;
    this.menuNavUpCount = 0;
    this.menuNavDownCount = 0;
    this.menuNavLeftCount = 0;
    this.menuNavRightCount = 0;
    this.menuConfirm = false;
    this.menuBack = false;
    this.menuRetry = false;
    this.menuPrevTab = false;
    this.menuNextTab = false;
    this.menuSecondary = false;
    this.menuTertiary = false;
    this.menuSelectIndex = undefined;
    this.capturedKeyCode = undefined;
  }

  clearAllLatches(): void {
    this.clearSimLatches();
    this.clearMenuLatches();
  }

  /**
   * Produces a clean per-frame UI/menu interaction snapshot, draining 1 step per
   * buffered directional nav direction so rapid keyboard taps never collapse into 1.
   */
  consumeMenuInput(): MenuInputSnapshot {
    this.pollGamepadAndMerge();
    const navUp = this.menuNavUpCount > 0;
    const navDown = this.menuNavDownCount > 0;
    const navLeft = this.menuNavLeftCount > 0;
    const navRight = this.menuNavRightCount > 0;
    if (navUp) this.menuNavUpCount -= 1;
    if (navDown) this.menuNavDownCount -= 1;
    if (navLeft) this.menuNavLeftCount -= 1;
    if (navRight) this.menuNavRightCount -= 1;

    // If more buffered nav steps remain behind this step, hold confirm until the final nav step lands
    const hasRemainingNav =
      this.menuNavUpCount > 0 ||
      this.menuNavDownCount > 0 ||
      this.menuNavLeftCount > 0 ||
      this.menuNavRightCount > 0;
    const confirmNow = this.menuConfirm && !hasRemainingNav;

    const snap: MenuInputSnapshot = {
      pointer: {
        logicalX: this.pointerLogicalX,
        logicalY: this.pointerLogicalY,
        down: this.mouseButtonsHeld.has(0),
        clicked: this.menuClicked,
        rightClicked: this.menuRightClicked,
        moved: this.pointerMoved,
      },
      navUp,
      navDown,
      navLeft,
      navRight,
      confirm: confirmNow,
      back: this.menuBack,
      retry: this.menuRetry,
      prevTab: this.menuPrevTab,
      nextTab: this.menuNextTab,
      secondary: this.menuSecondary,
      tertiary: this.menuTertiary,
      deviceMode: this.deviceMode,
      selectIndex: this.menuSelectIndex,
      capturedKeyCode: this.capturedKeyCode,
    };

    // Clear single-shot UI latches while preserving remaining buffered directional nav counts
    this.pointerMoved = false;
    this.menuClicked = false;
    this.menuRightClicked = false;
    if (confirmNow) this.menuConfirm = false;
    this.menuBack = false;
    this.menuRetry = false;
    this.menuPrevTab = false;
    this.menuNextTab = false;
    this.menuSecondary = false;
    this.menuTertiary = false;
    this.menuSelectIndex = undefined;
    this.capturedKeyCode = undefined;

    return snap;
  }
}
