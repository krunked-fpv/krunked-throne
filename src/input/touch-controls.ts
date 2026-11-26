import { LOGICAL_HEIGHT, LOGICAL_WIDTH_4_3 } from '@/contracts';

export type TouchTriggerId = 'active' | 'swap' | 'pickup' | 'pause';

export interface TouchTriggerRect {
  id: TouchTriggerId;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface FloatingStickState {
  pointerId: number | null;
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  dirX: number;
  dirY: number;
  magnitude: number; // 0..1
  alpha: number; // 0..1 visual fade
  firing: boolean;
}

export interface TouchGameplaySample {
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
}

export interface TouchEnvironmentLike {
  matchMedia?: (query: string) => { matches: boolean };
  maxTouchPoints?: number;
  userAgent?: string;
  hasOntouchstart?: boolean;
}

export interface TouchStickHome {
  x: number;
  y: number;
  radius: number;
}

export const TOUCH_MOVE_STICK_RADIUS = 26;
export const TOUCH_AIM_STICK_RADIUS = 28;
export const TOUCH_STICK_DEADZONE_PX = 3.2;
export const TOUCH_AIM_FIRE_THRESHOLD = 0.52;

const STICK_FADE_IN_SPEED = 14; // ~70ms to full
const STICK_FADE_OUT_SPEED = 6.5; // ~155ms smooth dissolve
const STICK_IDLE_OPACITY = 0.34;
const STICK_ACTIVE_OPACITY = 0.78;
const TRIGGER_HIT_PAD = 3;
const MOBILE_TOUCH_UA_RE = /android|iphone|ipad|ipod|mobile|tablet|tesla\//i;

const MICRO_GLYPHS_3X5: Record<string, readonly number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
};

function drawMicroLabel(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  centerX: number,
  topY: number,
): void {
  const charW = 3;
  const gap = 1;
  const totalW = text.length * charW + Math.max(0, text.length - 1) * gap;
  let x = Math.round(centerX - totalW * 0.5);
  const y = Math.round(topY);
  for (let i = 0; i < text.length; i++) {
    const rows = MICRO_GLYPHS_3X5[text[i]!];
    if (rows) {
      for (let r = 0; r < rows.length; r++) {
        const bits = rows[r]!;
        if (bits & 0b100) ctx.fillRect(x, y + r, 1, 1);
        if (bits & 0b010) ctx.fillRect(x + 1, y + r, 1, 1);
        if (bits & 0b001) ctx.fillRect(x + 2, y + r, 1, 1);
      }
    }
    x += charW + gap;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function createEmptyStick(): FloatingStickState {
  return {
    pointerId: null,
    active: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    dirX: 0,
    dirY: 0,
    magnitude: 0,
    alpha: 0,
    firing: false,
  };
}

/**
 * Strict mobile/tablet/Tesla touch-only environment detector.
 *
 * ZERO-LEAK DESKTOP INVARIANT:
 * - Desktop PCs AND Windows/Mac touchscreen laptops (where `(pointer: fine)` or
 *   `(hover: hover)` matches, even when `maxTouchPoints > 0`) ALWAYS return `false`.
 * - Headless Node (`typeof window === 'undefined'`) safely returns `false`.
 * - Returns `true` ONLY when primary input is genuinely touch-only (`(pointer: coarse)`
 *   and `(hover: none)`), OR when `matchMedia` is unavailable/inconclusive and both
 *   touch hardware and a mobile/tablet/Tesla user agent are detected.
 */
export function detectMobileOrTouchEnvironment(env?: TouchEnvironmentLike): boolean {
  let matchMedia: ((query: string) => { matches: boolean }) | undefined;
  let maxTouchPoints = 0;
  let userAgent = '';
  let hasOntouchstart = false;

  if (env !== undefined) {
    matchMedia = env.matchMedia;
    maxTouchPoints = typeof env.maxTouchPoints === 'number' ? env.maxTouchPoints : 0;
    userAgent = typeof env.userAgent === 'string' ? env.userAgent : '';
    hasOntouchstart = Boolean(env.hasOntouchstart);
  } else {
    if (typeof window === 'undefined') {
      return false;
    }
    if (typeof window.matchMedia === 'function') {
      matchMedia = (q: string) => window.matchMedia(q);
    }
    if (typeof navigator !== 'undefined') {
      if (typeof navigator.maxTouchPoints === 'number') {
        maxTouchPoints = navigator.maxTouchPoints;
      }
      if (typeof navigator.userAgent === 'string') {
        userAgent = navigator.userAgent;
      }
    }
    hasOntouchstart = 'ontouchstart' in window;
  }

  const queryMatches = (q: string): boolean => {
    if (typeof matchMedia !== 'function') return false;
    try {
      return Boolean(matchMedia(q)?.matches);
    } catch {
      return false;
    }
  };

  // Strict desktop & touchscreen laptop zero-leak gate
  if (queryMatches('(pointer: fine)') || queryMatches('(hover: hover)')) {
    return false;
  }

  // Genuine touch-only primary input (phones, tablets, iPads, DevTools mobile, Tesla screen)
  if (
    queryMatches('(pointer: coarse) and (hover: none)') ||
    (queryMatches('(pointer: coarse)') && queryMatches('(hover: none)'))
  ) {
    return true;
  }

  // Fallback when matchMedia is unavailable or reports neither fine/hover nor coarse/none
  const hasTouchHardware = maxTouchPoints > 0 || hasOntouchstart;
  if (hasTouchHardware && MOBILE_TOUCH_UA_RE.test(userAgent)) {
    return true;
  }

  return false;
}

/**
 * Computes safe, non-overlapping ergonomic resting home positions for the translucent
 * left MOVE and right AIM+FIRE virtual game sticks in logical canvas pixels.
 *
 * Strictly avoids top HUD (`y <= 46`), Boss HP bar (`y >= height - 23`),
 * left `ACT` button (`x: 4..30`), right `SWP`/`USE` buttons (`x: width - 30..width - 4`),
 * and top-right `||` pause button (`y: 48..63`) on both 4:3 (320x240) and 16:9 (426x240).
 */
export function computeTouchStickHomes(
  width: number,
  height: number,
): { move: TouchStickHome; aim: TouchStickHome } {
  const isWide = width >= 380;
  const insetX = isWide ? 66 : 58;
  const homeY = height - 52;
  return {
    move: {
      x: insetX,
      y: homeY,
      radius: TOUCH_MOVE_STICK_RADIUS,
    },
    aim: {
      x: width - insetX,
      y: homeY,
      radius: TOUCH_AIM_STICK_RADIUS,
    },
  };
}

/**
 * Safe feature-detected mobile micro-haptics trigger.
 * No-ops cleanly and never throws on iOS Safari, Tesla Chromium, desktop, or Node.
 */
export function triggerTouchHaptic(
  pattern: number | readonly number[],
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    const arg = typeof pattern === 'number' ? pattern : [...pattern];
    return Boolean(navigator.vibrate(arg));
  } catch {
    return false;
  }
}

/**
 * Computes far-margin translucent edge ghost trigger rectangles in logical canvas coords.
 * Strictly avoids top HUD (`y <= 46`), Boss HP bar (`x: 50..width-50, y: height-28..height`),
 * and the entire central combat arena.
 */
export function computeTouchTriggerRects(
  width: number,
  height: number,
): readonly TouchTriggerRect[] {
  return [
    {
      id: 'active',
      x: 4,
      y: height - 26,
      w: 26,
      h: 20,
      label: 'ACT',
    },
    {
      id: 'swap',
      x: width - 30,
      y: height - 51,
      w: 26,
      h: 20,
      label: 'SWP',
    },
    {
      id: 'pickup',
      x: width - 30,
      y: height - 26,
      w: 26,
      h: 20,
      label: 'USE',
    },
    {
      id: 'pause',
      x: width - 22,
      y: 48,
      w: 18,
      h: 15,
      label: '||',
    },
  ];
}

/**
 * Sleek, Non-Blocking, Invisible-Until-Touch Floating Dual-Stick & Edge Ghost Trigger Controller.
 *
 * Design invariants:
 * - Zero DOM clutter; rendered pixel-crisply on the game canvas ONLY when touch mode is active.
 * - Left half: floating movement thumbstick materializing where the left thumb touches, with gentle
 *   follow when dragged past max radius, fading out completely on release.
 * - Right half: floating aim+fire thumbstick — dragging sets aim angle smoothly (retaining last
 *   aim direction on release); pushing past 52% radius fires continuously with no opaque fire button.
 * - Outer edge ghost triggers (`ACT`, `SWP`, `USE`, `||`) tucked in far margins at low resting alpha
 *   (~0.24 -> ~0.72 pressed), with contextual emphasis on `USE` near pickups/chests.
 */
export class TouchControlsManager {
  private logicalWidth = LOGICAL_WIDTH_4_3;
  private logicalHeight = LOGICAL_HEIGHT;

  private moveStick: FloatingStickState = createEmptyStick();
  private aimStick: FloatingStickState = createEmptyStick();
  private lastAimDirX = 1;
  private lastAimDirY = 0;

  // Map pointerId -> pressed edge trigger id
  private triggerPointers = new Map<number, TouchTriggerId>();

  // Gameplay edge latches (cleared on sampleGameplay)
  private firePressed = false;
  private activePressed = false;
  private swapPressed = false;
  private pickupPressed = false;
  private pausePressed = false;

  setLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width);
    this.logicalHeight = Math.max(1, height);
  }

  getMoveStickState(): Readonly<FloatingStickState> {
    return this.moveStick;
  }

  getAimStickState(): Readonly<FloatingStickState> {
    return this.aimStick;
  }

  getLastAimDirection(): { x: number; y: number } {
    return { x: this.lastAimDirX, y: this.lastAimDirY };
  }

  setLastAimDirection(dirX: number, dirY: number): void {
    const len = Math.hypot(dirX, dirY);
    if (len > 1e-5) {
      this.lastAimDirX = dirX / len;
      this.lastAimDirY = dirY / len;
    }
  }

  getTriggerRects(): readonly TouchTriggerRect[] {
    return computeTouchTriggerRects(this.logicalWidth, this.logicalHeight);
  }

  isTriggerPressed(id: TouchTriggerId): boolean {
    for (const tid of this.triggerPointers.values()) {
      if (tid === id) return true;
    }
    return false;
  }

  hasActiveTouches(): boolean {
    return (
      this.moveStick.active ||
      this.aimStick.active ||
      this.triggerPointers.size > 0
    );
  }

  clearAllTouches(): void {
    this.moveStick.pointerId = null;
    this.moveStick.active = false;
    this.moveStick.dirX = 0;
    this.moveStick.dirY = 0;
    this.moveStick.magnitude = 0;
    this.moveStick.firing = false;
    this.moveStick.alpha = 0;

    this.aimStick.pointerId = null;
    this.aimStick.active = false;
    this.aimStick.dirX = 0;
    this.aimStick.dirY = 0;
    this.aimStick.magnitude = 0;
    this.aimStick.firing = false;
    this.aimStick.alpha = 0;

    this.triggerPointers.clear();
    this.firePressed = false;
    this.activePressed = false;
    this.swapPressed = false;
    this.pickupPressed = false;
    this.pausePressed = false;
  }

  private hitTestTrigger(logicalX: number, logicalY: number): TouchTriggerId | null {
    const rects = this.getTriggerRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      if (
        logicalX >= r.x - TRIGGER_HIT_PAD &&
        logicalX <= r.x + r.w + TRIGGER_HIT_PAD &&
        logicalY >= r.y - TRIGGER_HIT_PAD &&
        logicalY <= r.y + r.h + TRIGGER_HIT_PAD
      ) {
        return r.id;
      }
    }
    return null;
  }

  handleGameplayTouchStart(pointerId: number, logicalX: number, logicalY: number): void {
    const x = clamp(logicalX, 0, this.logicalWidth);
    const y = clamp(logicalY, 0, this.logicalHeight);

    // 1. Check compact far-edge ghost triggers first
    const hitTrigger = this.hitTestTrigger(x, y);
    if (hitTrigger) {
      this.triggerPointers.set(pointerId, hitTrigger);
      if (hitTrigger === 'active') this.activePressed = true;
      else if (hitTrigger === 'swap') this.swapPressed = true;
      else if (hitTrigger === 'pickup') this.pickupPressed = true;
      else if (hitTrigger === 'pause') this.pausePressed = true;
      return;
    }

    const midX = this.logicalWidth * 0.5;
    if (x < midX) {
      // Left half -> Floating Movement Stick
      if (!this.moveStick.active) {
        const ox = clamp(x, 14, midX - 10);
        const oy = clamp(y, 38, this.logicalHeight - 16);
        this.moveStick.pointerId = pointerId;
        this.moveStick.active = true;
        this.moveStick.originX = ox;
        this.moveStick.originY = oy;
        this.moveStick.currentX = x;
        this.moveStick.currentY = y;
        this.moveStick.dirX = 0;
        this.moveStick.dirY = 0;
        this.moveStick.magnitude = 0;
        this.moveStick.alpha = Math.max(this.moveStick.alpha, 0.35);
      }
    } else {
      // Right half -> Floating Aim + Fire Stick
      if (!this.aimStick.active) {
        const ox = clamp(x, midX + 10, this.logicalWidth - 14);
        const oy = clamp(y, 38, this.logicalHeight - 16);
        this.aimStick.pointerId = pointerId;
        this.aimStick.active = true;
        this.aimStick.originX = ox;
        this.aimStick.originY = oy;
        this.aimStick.currentX = x;
        this.aimStick.currentY = y;
        this.aimStick.dirX = 0;
        this.aimStick.dirY = 0;
        this.aimStick.magnitude = 0;
        this.aimStick.firing = false;
        this.aimStick.alpha = Math.max(this.aimStick.alpha, 0.35);
      }
    }
  }

  handleGameplayTouchMove(pointerId: number, logicalX: number, logicalY: number): void {
    const x = clamp(logicalX, 0, this.logicalWidth);
    const y = clamp(logicalY, 0, this.logicalHeight);
    const midX = this.logicalWidth * 0.5;

    if (this.moveStick.active && this.moveStick.pointerId === pointerId) {
      this.updateStickGeometry(this.moveStick, x, y, TOUCH_MOVE_STICK_RADIUS, 1.18, 12, midX - 8);
      return;
    }

    if (this.aimStick.active && this.aimStick.pointerId === pointerId) {
      const wasFiring = this.aimStick.firing;
      this.updateStickGeometry(
        this.aimStick,
        x,
        y,
        TOUCH_AIM_STICK_RADIUS,
        1.24,
        midX + 8,
        this.logicalWidth - 12,
      );

      if (this.aimStick.magnitude > 0) {
        const len = Math.hypot(this.aimStick.dirX, this.aimStick.dirY);
        if (len > 1e-5) {
          this.lastAimDirX = this.aimStick.dirX / len;
          this.lastAimDirY = this.aimStick.dirY / len;
        }
      }

      this.aimStick.firing = this.aimStick.magnitude >= TOUCH_AIM_FIRE_THRESHOLD;
      if (this.aimStick.firing && !wasFiring) {
        this.firePressed = true;
      }
    }
  }

  handleGameplayTouchEnd(pointerId: number): void {
    if (this.triggerPointers.has(pointerId)) {
      this.triggerPointers.delete(pointerId);
    }

    if (this.moveStick.active && this.moveStick.pointerId === pointerId) {
      this.moveStick.pointerId = null;
      this.moveStick.active = false;
      this.moveStick.dirX = 0;
      this.moveStick.dirY = 0;
      this.moveStick.magnitude = 0;
      this.moveStick.currentX = this.moveStick.originX;
      this.moveStick.currentY = this.moveStick.originY;
    }

    if (this.aimStick.active && this.aimStick.pointerId === pointerId) {
      this.aimStick.pointerId = null;
      this.aimStick.active = false;
      this.aimStick.dirX = 0;
      this.aimStick.dirY = 0;
      this.aimStick.magnitude = 0;
      this.aimStick.firing = false;
      this.aimStick.currentX = this.aimStick.originX;
      this.aimStick.currentY = this.aimStick.originY;
      // Intentionally preserve this.lastAimDirX / this.lastAimDirY on release!
    }
  }

  private updateStickGeometry(
    stick: FloatingStickState,
    x: number,
    y: number,
    radius: number,
    followFactor: number,
    minOriginX: number,
    maxOriginX: number,
  ): void {
    let dx = x - stick.originX;
    let dy = y - stick.originY;
    let dist = Math.hypot(dx, dy);

    // Gentle floating follow if dragged beyond follow threshold so direction reversal stays instant
    const followDist = radius * followFactor;
    if (dist > followDist && dist > 1e-5) {
      const pull = dist - followDist;
      const ux = dx / dist;
      const uy = dy / dist;
      stick.originX = clamp(stick.originX + ux * pull, minOriginX, maxOriginX);
      stick.originY = clamp(stick.originY + uy * pull, 34, this.logicalHeight - 14);
      dx = x - stick.originX;
      dy = y - stick.originY;
      dist = Math.hypot(dx, dy);
    }

    // Clamp visual thumb pip to ring radius
    if (dist > radius && dist > 1e-5) {
      stick.currentX = stick.originX + (dx / dist) * radius;
      stick.currentY = stick.originY + (dy / dist) * radius;
    } else {
      stick.currentX = x;
      stick.currentY = y;
    }

    if (dist <= TOUCH_STICK_DEADZONE_PX) {
      stick.dirX = 0;
      stick.dirY = 0;
      stick.magnitude = 0;
      return;
    }

    const norm = clamp((dist - TOUCH_STICK_DEADZONE_PX) / (radius - TOUCH_STICK_DEADZONE_PX), 0, 1);
    stick.dirX = (dx / dist) * norm;
    stick.dirY = (dy / dist) * norm;
    stick.magnitude = norm;
  }

  updateFade(dtSeconds: number): void {
    const dt = clamp(dtSeconds, 0, 0.1);
    this.stepStickAlpha(this.moveStick, dt);
    this.stepStickAlpha(this.aimStick, dt);
  }

  private stepStickAlpha(stick: FloatingStickState, dt: number): void {
    if (stick.active) {
      stick.alpha = Math.min(1, stick.alpha + dt * STICK_FADE_IN_SPEED);
    } else if (stick.alpha > 0) {
      stick.alpha = Math.max(0, stick.alpha - dt * STICK_FADE_OUT_SPEED);
    }
  }

  sampleGameplay(): TouchGameplaySample {
    const sample: TouchGameplaySample = {
      moveX: this.moveStick.dirX,
      moveY: this.moveStick.dirY,
      aimDirX: this.lastAimDirX,
      aimDirY: this.lastAimDirY,
      aimActive: this.aimStick.active && this.aimStick.magnitude > 0,
      aimMagnitude: this.aimStick.magnitude,
      fireHeld: this.aimStick.active && this.aimStick.firing,
      firePressed: this.firePressed,
      activeHeld: this.isTriggerPressed('active'),
      activePressed: this.activePressed,
      swapPressed: this.swapPressed,
      pickupPressed: this.pickupPressed,
      pausePressed: this.pausePressed,
    };

    this.firePressed = false;
    this.activePressed = false;
    this.swapPressed = false;
    this.pickupPressed = false;
    this.pausePressed = false;
    return sample;
  }

  /**
   * Renders sleek, non-blocking translucent virtual game sticks & edge ghost triggers
   * directly onto the logical canvas.
   * STRICT VISIBILITY INVARIANT: draws ZERO pixels unless `opts.visible === true`.
   */
  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    opts: { visible: boolean; nearbyInteractable: boolean; timeSec: number },
  ): void {
    if (!opts.visible) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. Far-margin translucent ghost triggers
    const rects = computeTouchTriggerRects(width, height);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      const pressed = this.isTriggerPressed(r.id);
      this.renderGhostTrigger(ctx, r, pressed, opts.nearbyInteractable, opts.timeSec);
    }

    // 2. Translucent Virtual Game Sticks (Resting + Floating Hybrid: always visible when opts.visible === true)
    const homes = computeTouchStickHomes(width, height);
    this.renderVirtualStick(ctx, this.moveStick, homes.move, false);
    this.renderVirtualStick(ctx, this.aimStick, homes.aim, true);

    ctx.restore();
  }

  private renderVirtualStick(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    stick: FloatingStickState,
    home: TouchStickHome,
    isAimStick: boolean,
  ): void {
    const radius = home.radius;
    const engage = clamp(stick.alpha, 0, 1);
    const opacity = STICK_IDLE_OPACITY + (STICK_ACTIVE_OPACITY - STICK_IDLE_OPACITY) * engage;
    const hasFloating = engage > 0.01 && (stick.originX !== 0 || stick.originY !== 0);

    // Smoothly blend between ergonomic resting home and active floating touch origin
    const rawOx = hasFloating ? home.x + (stick.originX - home.x) * engage : home.x;
    const rawOy = hasFloating ? home.y + (stick.originY - home.y) * engage : home.y;
    const knobDx = hasFloating ? (stick.currentX - stick.originX) * engage : 0;
    const knobDy = hasFloating ? (stick.currentY - stick.originY) * engage : 0;

    const ox = Math.round(rawOx) + 0.5;
    const oy = Math.round(rawOy) + 0.5;
    const kx = Math.round(rawOx + knobDx) + 0.5;
    const ky = Math.round(rawOy + knobDy) + 0.5;
    const rx = Math.round(rawOx);
    const ry = Math.round(rawOy);
    const firing = isAimStick && stick.active && stick.firing;

    // 1. Translucent frosted dark-glass circular socket/well fill + subtle dark contrast halo
    ctx.fillStyle = firing
      ? `rgba(28, 10, 14, ${(0.48 * opacity).toFixed(3)})`
      : `rgba(10, 8, 18, ${(0.44 * opacity).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(6, 4, 12, ${(0.48 * opacity).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle frosted top-left inner bevel gleam on the glass socket
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.16 * opacity).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, radius - 1.5, Math.PI * 1.12, Math.PI * 1.66);
    ctx.stroke();

    // 2. Inner concentric depth ring (Move: 72% radius) or crisp 52% fire-threshold ring (Aim)
    if (isAimStick) {
      const fireR = radius * TOUCH_AIM_FIRE_THRESHOLD;
      ctx.strokeStyle = firing
        ? `rgba(255, 108, 56, ${(0.82 * opacity).toFixed(3)})`
        : `rgba(255, 224, 110, ${(0.42 * opacity).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, fireR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(196, 220, 255, ${(0.24 * opacity).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Crisp 1px outer socket ring
    ctx.strokeStyle = firing
      ? `rgba(255, 108, 56, ${(0.96 * opacity).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 224, 110, ${(0.76 * opacity).toFixed(3)})`
        : `rgba(220, 236, 255, ${(0.74 * opacity).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Four subtle cardinal directional pip/arrow ticks tucked inside the outer rim
    ctx.fillStyle = firing
      ? `rgba(255, 148, 72, ${(0.88 * opacity).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 228, 128, ${(0.62 * opacity).toFixed(3)})`
        : `rgba(220, 236, 255, ${(0.60 * opacity).toFixed(3)})`;
    // North chevron
    ctx.fillRect(rx, ry - radius + 2, 1, 1);
    ctx.fillRect(rx - 1, ry - radius + 3, 3, 1);
    // South chevron
    ctx.fillRect(rx - 1, ry + radius - 4, 3, 1);
    ctx.fillRect(rx, ry + radius - 3, 1, 1);
    // West chevron
    ctx.fillRect(rx - radius + 2, ry, 1, 1);
    ctx.fillRect(rx - radius + 3, ry - 1, 1, 3);
    // East chevron
    ctx.fillRect(rx + radius - 4, ry - 1, 1, 3);
    ctx.fillRect(rx + radius - 3, ry, 1, 1);

    // 5. Subtle micro-label tucked cleanly at bottom edge of socket (fades gently when active)
    const labelText = isAimStick ? (firing ? 'FIRE' : 'AIM') : 'MOVE';
    const labelAlpha = firing
      ? 0.85 * opacity
      : (0.72 - 0.34 * engage) * (0.68 + 0.32 * engage);
    const labelY = ry + radius - 10;
    ctx.fillStyle = `rgba(6, 4, 12, ${(0.75 * labelAlpha).toFixed(3)})`;
    drawMicroLabel(ctx, labelText, rx + 1, labelY + 1);
    ctx.fillStyle = firing
      ? `rgba(255, 162, 82, ${labelAlpha.toFixed(3)})`
      : isAimStick
        ? `rgba(255, 228, 132, ${labelAlpha.toFixed(3)})`
        : `rgba(220, 236, 255, ${labelAlpha.toFixed(3)})`;
    drawMicroLabel(ctx, labelText, rx, labelY);

    // 6. Subtle center anchor dot + directional translucent tether line when deflected
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 * opacity).toFixed(3)})`;
    ctx.fillRect(rx - 1, ry - 1, 2, 2);

    if (stick.magnitude > 0.05 && engage > 0.01) {
      ctx.strokeStyle = firing
        ? `rgba(255, 168, 76, ${(0.68 * opacity).toFixed(3)})`
        : isAimStick
          ? `rgba(255, 224, 110, ${(0.48 * opacity).toFixed(3)})`
          : `rgba(216, 234, 255, ${(0.44 * opacity).toFixed(3)})`;
      ctx.lineWidth = firing ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(kx, ky);
      ctx.stroke();
    }

    // 7. Translucent 3D-shaded analog thumbstick knob/cap
    const knobR = isAimStick ? 9 : 8.5;

    // 7a. Soft dark drop/rim shadow beneath thumbcap
    ctx.fillStyle = `rgba(6, 4, 14, ${(0.52 * opacity).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(kx + 0.5, ky + 1, knobR + 1.1, 0, Math.PI * 2);
    ctx.fill();

    // 7b. Frosted translucent thumbcap body
    ctx.fillStyle = firing
      ? `rgba(255, 206, 78, ${(0.76 * opacity).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 224, 128, ${(0.54 * opacity).toFixed(3)})`
        : `rgba(235, 244, 255, ${(0.52 * opacity).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
    ctx.fill();

    // 7c. Crisp outer thumbcap rim
    ctx.strokeStyle = firing
      ? `rgba(255, 116, 56, ${(0.98 * opacity).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 234, 146, ${(0.88 * opacity).toFixed(3)})`
        : `rgba(240, 248, 255, ${(0.86 * opacity).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(kx, ky, knobR - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // 7d. Inner concave thumb-dish well & concentric ring
    ctx.fillStyle = `rgba(10, 8, 20, ${(0.26 * opacity).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(kx, ky, knobR * 0.58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = firing
      ? `rgba(255, 244, 184, ${(0.82 * opacity).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 214, 108, ${(0.56 * opacity).toFixed(3)})`
        : `rgba(202, 226, 255, ${(0.56 * opacity).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(kx, ky, knobR * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    // 7e. Crisp top-left specular crescent highlight for 3D translucent game-stick sheen
    ctx.strokeStyle = `rgba(255, 255, 255, ${((firing ? 0.94 : 0.80) * opacity).toFixed(3)})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(kx, ky, knobR - 2, Math.PI * 1.08, Math.PI * 1.58);
    ctx.stroke();
  }

  private renderGhostTrigger(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    r: TouchTriggerRect,
    pressed: boolean,
    nearbyInteractable: boolean,
    timeSec: number,
  ): void {
    let baseAlpha = pressed ? 0.84 : 0.42;
    let accent = '#e4e8f4';

    if (r.id === 'active') {
      accent = '#52e864';
    } else if (r.id === 'swap') {
      accent = '#78c8ff';
    } else if (r.id === 'pickup') {
      accent = '#ffe047';
      if (!pressed) {
        baseAlpha = nearbyInteractable
          ? 0.64 + 0.12 * Math.sin(timeSec * 6.5)
          : 0.3;
      }
    } else if (r.id === 'pause') {
      accent = '#e4e8f4';
      if (!pressed) baseAlpha = 0.38;
    }

    ctx.save();
    ctx.globalAlpha = clamp(baseAlpha, 0.2, 0.9);

    // Subtle dark pixel outer halo + translucent dark backing so triggers stay legible on bright Desert sand & snow
    ctx.fillStyle = 'rgba(6, 4, 12, 0.52)';
    ctx.fillRect(r.x - 1, r.y, r.w + 2, r.h);
    ctx.fillRect(r.x, r.y - 1, r.w, r.h + 2);

    ctx.fillStyle = pressed ? 'rgba(28, 24, 42, 0.88)' : 'rgba(10, 8, 18, 0.68)';
    ctx.fillRect(r.x + 1, r.y, r.w - 2, r.h);
    ctx.fillRect(r.x, r.y + 1, r.w, r.h - 2);

    // Subtle frosted top sheen to visually harmonize with the translucent game sticks
    ctx.fillStyle = pressed ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(r.x + 2, r.y + 1, r.w - 4, 1);

    ctx.strokeStyle = pressed ? '#ffffff' : accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Minimal crisp pixel icon + tiny micro-label per trigger (with 1px dark drop shadow for sand contrast)
    const mx = Math.round(r.x + r.w * 0.5);
    const my = Math.round(r.y + r.h * 0.5);
    const fg = pressed ? '#ffffff' : accent;

    if (r.id === 'pause') {
      ctx.fillStyle = '#08060e';
      ctx.fillRect(mx - 2, my - 2, 2, 7);
      ctx.fillRect(mx + 2, my - 2, 2, 7);
      ctx.fillStyle = fg;
      ctx.fillRect(mx - 3, my - 3, 2, 7);
      ctx.fillRect(mx + 1, my - 3, 2, 7);
    } else if (r.id === 'active') {
      const iy = r.y + 6;
      ctx.fillStyle = '#08060e';
      drawMicroLabel(ctx, 'ACT', mx + 1, r.y + 13);
      ctx.fillStyle = fg;
      ctx.fillRect(mx - 1, iy - 3, 2, 7);
      ctx.fillRect(mx - 3, iy - 1, 6, 3);
      ctx.fillStyle = '#0c0912';
      ctx.fillRect(mx - 1, iy, 2, 1);
      ctx.fillStyle = fg;
      drawMicroLabel(ctx, 'ACT', mx, r.y + 12);
    } else if (r.id === 'swap') {
      const iy = r.y + 6;
      ctx.fillStyle = '#08060e';
      drawMicroLabel(ctx, 'SWP', mx + 1, r.y + 13);
      ctx.fillStyle = fg;
      ctx.fillRect(mx - 4, iy - 2, 7, 1);
      ctx.fillRect(mx + 2, iy - 3, 1, 3);
      ctx.fillRect(mx - 3, iy + 1, 7, 1);
      ctx.fillRect(mx - 3, iy, 1, 3);
      drawMicroLabel(ctx, 'SWP', mx, r.y + 12);
    } else if (r.id === 'pickup') {
      const iy = r.y + 6;
      ctx.fillStyle = '#08060e';
      drawMicroLabel(ctx, 'USE', mx + 1, r.y + 13);
      ctx.fillStyle = fg;
      ctx.fillRect(mx - 4, iy - 3, 2, 1);
      ctx.fillRect(mx - 4, iy - 3, 1, 2);
      ctx.fillRect(mx + 2, iy - 3, 2, 1);
      ctx.fillRect(mx + 3, iy - 3, 1, 2);
      ctx.fillRect(mx - 4, iy + 2, 2, 1);
      ctx.fillRect(mx - 4, iy + 1, 1, 2);
      ctx.fillRect(mx + 2, iy + 2, 2, 1);
      ctx.fillRect(mx + 3, iy + 1, 1, 2);
      ctx.fillRect(mx - 1, iy - 1, 2, 2);
      drawMicroLabel(ctx, 'USE', mx, r.y + 12);
    }

    ctx.restore();
  }
}
