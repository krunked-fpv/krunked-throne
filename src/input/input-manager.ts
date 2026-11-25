import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_4_3,
  type InputFrame,
  type KeyBindings,
} from '@/contracts';
import type { CameraController } from '@/render/camera';

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
  selectIndex?: number;
  capturedKeyCode?: string;
}

const GAMEPAD_DEADZONE = 0.22;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function applyDeadzone(val: number, dz: number = GAMEPAD_DEADZONE): number {
  if (Math.abs(val) < dz) return 0;
  const sign = val < 0 ? -1 : 1;
  return sign * ((Math.abs(val) - dz) / (1 - dz));
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

/**
 * Unified input controller handling:
 * - WASD / Arrow keys respecting SaveData.keybinds
 * - Mouse move / LMB / RMB / Wheel
 * - Q swap, E pickup, Escape/P pause, 1-5 quick pick, R quick retry
 * - Gamepad API (left/right sticks + triggers + face buttons)
 * - Accurate client -> logical canvas -> world coordinate transform via CameraController
 * - Edge-triggered pressed flags cleared cleanly per simulation step
 * - 100% headless-Node-safe with direct simulation injection helpers
 */
export class InputManager {
  private keybinds: KeyBindings;
  private canvas: HTMLCanvasElement | null = null;
  private logicalWidth = LOGICAL_WIDTH_4_3;
  private logicalHeight = LOGICAL_HEIGHT;

  private keysHeld = new Set<string>();
  private mouseButtonsHeld = new Set<number>();

  // Logical canvas pointer coordinates
  private pointerLogicalX = LOGICAL_WIDTH_4_3 * 0.5;
  private pointerLogicalY = LOGICAL_HEIGHT * 0.5;
  private usingGamepadAim = false;
  private gamepadAimDirX = 1;
  private gamepadAimDirY = 0;

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
  private menuSelectIndex: number | undefined = undefined;

  // Keybind rebinding capture state
  private capturingKey = false;
  private capturedKeyCode: string | undefined = undefined;

  // Previous gamepad button states for edge detection
  private prevGpButtons: boolean[] = [];

  // Bound DOM listeners for clean attach/detach
  private attached = false;
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
  private boundWheel = (e: WheelEvent) => this.onWheel(e);
  private boundContextMenu = (e: MouseEvent) => e.preventDefault();
  private boundBlur = () => this.resetHeldState();

  constructor(keybinds: KeyBindings = DEFAULT_KEYBINDINGS) {
    this.keybinds = { ...keybinds };
  }

  setKeybinds(keybinds: KeyBindings): void {
    this.keybinds = { ...keybinds };
  }

  getKeybinds(): KeyBindings {
    return { ...this.keybinds };
  }

  setLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width);
    this.logicalHeight = Math.max(1, height);
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

  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.canvas = canvas;
    this.logicalWidth = canvas.width || LOGICAL_WIDTH_4_3;
    this.logicalHeight = canvas.height || LOGICAL_HEIGHT;
    this.pointerLogicalX = this.logicalWidth * 0.5;
    this.pointerLogicalY = this.logicalHeight * 0.5;

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('mouseup', this.boundMouseUp);
      window.addEventListener('blur', this.boundBlur);
    }
    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('mouseup', this.boundMouseUp);
      window.removeEventListener('blur', this.boundBlur);
    }
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('wheel', this.boundWheel);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    this.canvas = null;
    this.attached = false;
  }

  resetHeldState(): void {
    this.keysHeld.clear();
    this.mouseButtonsHeld.clear();
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

  // --------------------------------------------------------------------------
  // Headless-friendly input injection methods (used by both DOM events & tests)
  // --------------------------------------------------------------------------

  simulateKeyDown(code: string, repeat: boolean = false): void {
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
  }

  simulateKeyUp(code: string): void {
    this.keysHeld.delete(code);
  }

  simulateMouseMoveLogical(logicalX: number, logicalY: number): void {
    this.pointerLogicalX = clamp(logicalX, 0, this.logicalWidth);
    this.pointerLogicalY = clamp(logicalY, 0, this.logicalHeight);
    this.usingGamepadAim = false;
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
    if (down) {
      const wasDown = this.mouseButtonsHeld.has(button);
      this.mouseButtonsHeld.add(button);
      if (!wasDown) {
        if (button === 0) {
          this.firePressed = true;
          this.menuClicked = true;
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
      this.swapPressed = true;
    }
  }

  // --------------------------------------------------------------------------
  // DOM event handlers
  // --------------------------------------------------------------------------

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

  private onMouseMove(e: MouseEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.logicalWidth = this.canvas.width || this.logicalWidth;
    this.logicalHeight = this.canvas.height || this.logicalHeight;
    this.simulateMouseMoveClient(e.clientX, e.clientY, rect);
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.logicalWidth = this.canvas.width || this.logicalWidth;
      this.logicalHeight = this.canvas.height || this.logicalHeight;
      this.simulateMouseMoveClient(e.clientX, e.clientY, rect);
    }
    this.simulateMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    this.simulateMouseButton(e.button, false);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.simulateWheel(e.deltaY);
  }

  // --------------------------------------------------------------------------
  // Gamepad polling
  // --------------------------------------------------------------------------

  private pollGamepad(): {
    moveX: number;
    moveY: number;
    fireHeld: boolean;
    activeHeld: boolean;
  } {
    const out = { moveX: 0, moveY: 0, fireHeld: false, activeHeld: false };
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return out;
    }
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        pad = pads[i]!;
        break;
      }
    }
    if (!pad) return out;

    const lx = applyDeadzone(pad.axes[0] ?? 0);
    const ly = applyDeadzone(pad.axes[1] ?? 0);
    const rx = applyDeadzone(pad.axes[2] ?? 0);
    const ry = applyDeadzone(pad.axes[3] ?? 0);

    out.moveX = lx;
    out.moveY = ly;

    if (Math.hypot(rx, ry) > 0.15) {
      this.usingGamepadAim = true;
      this.gamepadAimDirX = rx;
      this.gamepadAimDirY = ry;
    }

    const btnDown = (idx: number): boolean => {
      const b = pad!.buttons[idx];
      return Boolean(b && (b.pressed || b.value > 0.35));
    };
    const btnEdge = (idx: number): boolean => {
      const cur = btnDown(idx);
      const prev = this.prevGpButtons[idx] ?? false;
      return cur && !prev;
    };

    // Standard Gamepad mapping:
    // 7=RT (fire), 6=LT (active), 5=RB (fire alt), 4=LB (active alt)
    // 0=A (pickup/confirm), 1=B (back), 2=X (pickup), 3=Y (swap), 9=Start (pause)
    // 12..15 = D-pad U/D/L/R
    out.fireHeld = btnDown(7) || btnDown(5);
    out.activeHeld = btnDown(6) || btnDown(4);

    if (btnEdge(7) || btnEdge(5)) this.firePressed = true;
    if (btnEdge(6) || btnEdge(4)) this.activePressed = true;
    if (btnEdge(3)) this.swapPressed = true;
    if (btnEdge(2) || btnEdge(0)) {
      this.pickupPressed = true;
      this.menuConfirm = true;
    }
    if (btnEdge(9)) {
      this.pausePressed = true;
      this.menuBack = true;
    }
    if (btnEdge(1)) this.menuBack = true;
    if (btnEdge(12)) this.menuNavUp = true;
    if (btnEdge(13)) this.menuNavDown = true;
    if (btnEdge(14)) this.menuNavLeft = true;
    if (btnEdge(15)) this.menuNavRight = true;

    this.prevGpButtons = pad.buttons.map((b) => Boolean(b && (b.pressed || b.value > 0.35)));
    return out;
  }

  /**
   * Produces a clean per-tick InputFrame for SimEngine and clears all
   * edge-triggered sim press latches so single clicks/presses fire once.
   */
  consumeSimInput(
    camera: CameraController,
    playerWorldX?: number,
    playerWorldY?: number,
  ): InputFrame {
    const gp = this.pollGamepad();
    const kb = this.keybinds;

    let moveX = gp.moveX;
    let moveY = gp.moveY;

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

    if (this.usingGamepadAim && playerWorldX !== undefined && playerWorldY !== undefined) {
      aimWorldX = playerWorldX + this.gamepadAimDirX * 80;
      aimWorldY = playerWorldY + this.gamepadAimDirY * 80;
      const scr = camera.worldToScreen(aimWorldX, aimWorldY);
      this.pointerLogicalX = clamp(scr.x, 0, camera.viewportWidth);
      this.pointerLogicalY = clamp(scr.y, 0, camera.viewportHeight);
    } else {
      const world = camera.screenToWorld(this.pointerLogicalX, this.pointerLogicalY);
      aimWorldX = world.x;
      aimWorldY = world.y;
    }

    const fireHeld = this.mouseButtonsHeld.has(0) || gp.fireHeld;
    const activeHeld =
      this.mouseButtonsHeld.has(2) ||
      this.keysHeld.has(kb.activeAlt) ||
      gp.activeHeld;

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
    this.pollGamepad();
    const snap: MenuInputSnapshot = {
      pointer: {
        logicalX: this.pointerLogicalX,
        logicalY: this.pointerLogicalY,
        down: this.mouseButtonsHeld.has(0),
        clicked: this.menuClicked,
        rightClicked: this.menuRightClicked,
      },
      navUp: this.menuNavUp,
      navDown: this.menuNavDown,
      navLeft: this.menuNavLeft,
      navRight: this.menuNavRight,
      confirm: this.menuConfirm,
      back: this.menuBack,
      retry: this.menuRetry,
      selectIndex: this.menuSelectIndex,
      capturedKeyCode: this.capturedKeyCode,
    };

    this.menuClicked = false;
    this.menuRightClicked = false;
    this.menuNavUp = false;
    this.menuNavDown = false;
    this.menuNavLeft = false;
    this.menuNavRight = false;
    this.menuConfirm = false;
    this.menuBack = false;
    this.menuRetry = false;
    this.menuSelectIndex = undefined;
    this.capturedKeyCode = undefined;

    return snap;
  }
}
