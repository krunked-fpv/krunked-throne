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

  // Dedup timestamps between PointerEvent and Mouse/TouchEvent
  private lastPointerMouseMs = -10000;
  private lastPointerTouchMs = -10000;
  private lastAnyTouchMs = -10000;
  private lastMouseDownPointerMs = -10000;

  // Edge-triggered simulation latches (cleared on consumeSimInput / clearSimLatches)
  private firePressed = false;
  private activePressed = false;
  private swapPressed = false;
  private pickupPressed = false;
  private pausePressed = false;
  private retryPressed = false;
  private selectIndex: number | undefined = undefined;

  // Edge-triggered UI / Menu latches (cleared on consumeMenuInput)
  private menuClicked = false;
  private menuRightClicked = false;
  private menuNavUp = false;
  private menuNavDown = false;
  private menuNavLeft = false;
  private menuNavRight = false;
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
    }
  }

  setLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width);
    this.logicalHeight = Math.max(1, height);
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
    this.touch.clearAllTouches();
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

  simulateKeyDown(code: string, repeat: boolean = false): void {
    this.setDeviceMode('kbm');

    if (this.capturingKey) {
      if (!repeat) {
        if (code !== 'Escape') {
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
    if (code === kb.pause || code === 'Escape' || code === 'KeyP') {
      this.pausePressed = true;
      this.menuBack = true;
    }
    if (code === kb.activeAlt) {
      this.activePressed = true;
    }
    if (code === 'KeyR') {
      this.retryPressed = true;
      this.menuRetry = true;
    }

    // Quick pick 1-5 (both top-row Digit1..5 and Numpad1..5)
    if (code === 'Digit1' || code === 'Numpad1') {
      this.selectIndex = 0;
      this.menuSelectIndex = 0;
    } else if (code === 'Digit2' || code === 'Numpad2') {
      this.selectIndex = 1;
      this.menuSelectIndex = 1;
    } else if (code === 'Digit3' || code === 'Numpad3') {
      this.selectIndex = 2;
      this.menuSelectIndex = 2;
    } else if (code === 'Digit4' || code === 'Numpad4') {
      this.selectIndex = 3;
      this.menuSelectIndex = 3;
    } else if (code === 'Digit5' || code === 'Numpad5') {
      this.selectIndex = 4;
      this.menuSelectIndex = 4;
    }

    // Menu navigation
    if (code === 'ArrowUp' || code === kb.up) this.menuNavUp = true;
    if (code === 'ArrowDown' || code === kb.down) this.menuNavDown = true;
    if (code === 'ArrowLeft' || code === kb.left) this.menuNavLeft = true;
    if (code === 'ArrowRight' || code === kb.right) this.menuNavRight = true;
    if (code === 'Enter' || code === 'Space') this.menuConfirm = true;
    if (code === 'BracketLeft') this.menuPrevTab = true;
    if (code === 'BracketRight') this.menuNextTab = true;
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
          this.menuClicked = true;
          this.pointerMoved = true;
        } else if (button === 2) {
          this.activePressed = true;
          this.menuRightClicked = true;
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

    this.lastPointerMouseMs = this.nowMsFn();
    this.lastMouseDownPointerMs = this.lastPointerMouseMs;
    this.simulateMouseMoveLogical(pos.x, pos.y);
    this.simulateMouseButton(e.button, true);
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

    this.lastPointerMouseMs = this.nowMsFn();
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

    this.lastPointerMouseMs = this.nowMsFn();
    this.simulateMouseButton(e.button, false);
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
    if (now - this.lastPointerMouseMs < 6) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    const pos = this.mapClientEvent(e.clientX, e.clientY);
    this.simulateMouseMoveLogical(pos.x, pos.y);
  }

  private onMouseDown(e: MouseEvent): void {
    if (isTouchSynthesizedMouseEvent(e)) return;
    const now = this.nowMsFn();
    if (now - this.lastMouseDownPointerMs < 12) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    if (this.canvas) {
      const pos = this.mapClientEvent(e.clientX, e.clientY);
      this.simulateMouseMoveLogical(pos.x, pos.y);
    }
    this.simulateMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    if (isTouchSynthesizedMouseEvent(e)) return;
    const now = this.nowMsFn();
    if (now - this.lastPointerMouseMs < 6) return;
    if (now - this.lastAnyTouchMs < TOUCH_COMPAT_MOUSE_WINDOW_MS) return;
    this.simulateMouseButton(e.button, false);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
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
      this.menuRetry = true;
    }

    if (gp.menuNavUp) this.menuNavUp = true;
    if (gp.menuNavDown) this.menuNavDown = true;
    if (gp.menuNavLeft) this.menuNavLeft = true;
    if (gp.menuNavRight) this.menuNavRight = true;
    if (gp.menuConfirm) this.menuConfirm = true;
    if (gp.menuBack) this.menuBack = true;
    if (gp.menuPrevTab) this.menuPrevTab = true;
    if (gp.menuNextTab) this.menuNextTab = true;
    if (gp.menuSecondary) this.menuSecondary = true;
    if (gp.menuTertiary) this.menuTertiary = true;

    return gp;
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

  /**
   * Produces a clean per-frame UI/menu interaction snapshot and clears UI edge latches.
   */
  consumeMenuInput(): MenuInputSnapshot {
    this.pollGamepadAndMerge();
    const snap: MenuInputSnapshot = {
      pointer: {
        logicalX: this.pointerLogicalX,
        logicalY: this.pointerLogicalY,
        down: this.mouseButtonsHeld.has(0),
        clicked: this.menuClicked,
        rightClicked: this.menuRightClicked,
        moved: this.pointerMoved,
      },
      navUp: this.menuNavUp,
      navDown: this.menuNavDown,
      navLeft: this.menuNavLeft,
      navRight: this.menuNavRight,
      confirm: this.menuConfirm,
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

    this.pointerMoved = false;
    this.menuClicked = false;
    this.menuRightClicked = false;
    this.menuNavUp = false;
    this.menuNavDown = false;
    this.menuNavLeft = false;
    this.menuNavRight = false;
    this.menuConfirm = false;
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
