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

export const TOUCH_MOVE_STICK_RADIUS = 26;
export const TOUCH_AIM_STICK_RADIUS = 28;
export const TOUCH_STICK_DEADZONE_PX = 3.2;
export const TOUCH_AIM_FIRE_THRESHOLD = 0.52;

const STICK_FADE_IN_SPEED = 14; // ~70ms to full
const STICK_FADE_OUT_SPEED = 6.5; // ~155ms smooth dissolve
const TRIGGER_HIT_PAD = 3;

const MICRO_GLYPHS_3X5: Record<string, readonly number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
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
   * Renders sleek, non-blocking pixel-styled touch controls directly onto the logical canvas.
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

    // 2. Floating Left Movement Stick (strictly invisible when alpha <= 0.01)
    if (this.moveStick.alpha > 0.01) {
      this.renderFloatingStick(ctx, this.moveStick, TOUCH_MOVE_STICK_RADIUS, false);
    }

    // 3. Floating Right Aim + Fire Stick (strictly invisible when alpha <= 0.01)
    if (this.aimStick.alpha > 0.01) {
      this.renderFloatingStick(ctx, this.aimStick, TOUCH_AIM_STICK_RADIUS, true);
    }

    ctx.restore();
  }

  private renderFloatingStick(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    stick: FloatingStickState,
    radius: number,
    isAimStick: boolean,
  ): void {
    const a = stick.alpha;
    const ox = Math.round(stick.originX) + 0.5;
    const oy = Math.round(stick.originY) + 0.5;
    const cx = Math.round(stick.currentX) + 0.5;
    const cy = Math.round(stick.currentY) + 0.5;
    const firing = isAimStick && stick.firing;

    // Ultra-subtle dark halo ring so 1px bright lines stay legible on bright sand & snow
    ctx.strokeStyle = `rgba(8, 6, 14, ${(0.32 * a).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp 1px outer ring
    ctx.strokeStyle = firing
      ? `rgba(255, 108, 56, ${(0.64 * a).toFixed(3)})`
      : isAimStick
        ? `rgba(255, 224, 110, ${(0.34 * a).toFixed(3)})`
        : `rgba(235, 240, 255, ${(0.32 * a).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle 4-cardinal pixel notch ticks on outer ring
    ctx.fillStyle = firing
      ? `rgba(255, 160, 80, ${(0.55 * a).toFixed(3)})`
      : `rgba(255, 255, 255, ${(0.35 * a).toFixed(3)})`;
    ctx.fillRect(Math.round(ox - 1), Math.round(oy - radius - 1), 2, 2);
    ctx.fillRect(Math.round(ox - 1), Math.round(oy + radius - 1), 2, 2);
    ctx.fillRect(Math.round(ox - radius - 1), Math.round(oy - 1), 2, 2);
    ctx.fillRect(Math.round(ox + radius - 1), Math.round(oy - 1), 2, 2);

    // For Aim+Fire stick: whisper-thin inner fire-threshold dashed/ring cue at 52% radius
    if (isAimStick) {
      const fireR = radius * TOUCH_AIM_FIRE_THRESHOLD;
      ctx.strokeStyle = firing
        ? `rgba(255, 92, 56, ${(0.45 * a).toFixed(3)})`
        : `rgba(255, 224, 110, ${(0.18 * a).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, fireR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Subtle directional tether line from ring center to thumb pip
    if (stick.magnitude > 0.05) {
      ctx.strokeStyle = firing
        ? `rgba(255, 190, 88, ${(0.45 * a).toFixed(3)})`
        : `rgba(255, 255, 255, ${(0.24 * a).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }

    // Center micro-anchor pixel
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 * a).toFixed(3)})`;
    ctx.fillRect(Math.round(ox) - 1, Math.round(oy) - 1, 2, 2);

    // Crisp translucent thumb dot (6px pixel-octagonal pip)
    const pipR = firing ? 4.5 : 4;
    ctx.fillStyle = `rgba(8, 6, 14, ${(0.42 * a).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, pipR + 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = firing
      ? `rgba(255, 224, 71, ${(0.82 * a).toFixed(3)})`
      : `rgba(255, 255, 255, ${(0.64 * a).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderGhostTrigger(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    r: TouchTriggerRect,
    pressed: boolean,
    nearbyInteractable: boolean,
    timeSec: number,
  ): void {
    let baseAlpha = pressed ? 0.72 : 0.24;
    let accent = '#d8dce8';

    if (r.id === 'active') {
      accent = '#52e864';
    } else if (r.id === 'swap') {
      accent = '#78c8ff';
    } else if (r.id === 'pickup') {
      accent = '#ffe047';
      if (!pressed) {
        baseAlpha = nearbyInteractable
          ? 0.48 + 0.1 * Math.sin(timeSec * 6.5)
          : 0.15;
      }
    } else if (r.id === 'pause') {
      accent = '#d8dce8';
      if (!pressed) baseAlpha = 0.24;
    }

    ctx.save();
    ctx.globalAlpha = clamp(baseAlpha, 0.1, 0.85);

    // Ultra-clean translucent dark backing + 1px pixel hairline border (no ugly heavy circles)
    ctx.fillStyle = pressed ? 'rgba(32, 28, 44, 0.75)' : 'rgba(10, 8, 16, 0.45)';
    ctx.fillRect(r.x + 1, r.y, r.w - 2, r.h);
    ctx.fillRect(r.x, r.y + 1, r.w, r.h - 2);

    ctx.strokeStyle = pressed ? '#ffffff' : accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Minimal crisp pixel icon + tiny micro-label per trigger
    const mx = Math.round(r.x + r.w * 0.5);
    const my = Math.round(r.y + r.h * 0.5);
    ctx.fillStyle = pressed ? '#ffffff' : accent;

    if (r.id === 'pause') {
      ctx.fillRect(mx - 3, my - 3, 2, 7);
      ctx.fillRect(mx + 1, my - 3, 2, 7);
    } else if (r.id === 'active') {
      const iy = r.y + 6;
      ctx.fillRect(mx - 1, iy - 3, 2, 7);
      ctx.fillRect(mx - 3, iy - 1, 6, 3);
      ctx.fillStyle = '#0c0912';
      ctx.fillRect(mx - 1, iy, 2, 1);
      ctx.fillStyle = pressed ? '#ffffff' : accent;
      drawMicroLabel(ctx, 'ACT', mx, r.y + 12);
    } else if (r.id === 'swap') {
      const iy = r.y + 6;
      ctx.fillRect(mx - 4, iy - 2, 7, 1);
      ctx.fillRect(mx + 2, iy - 3, 1, 3);
      ctx.fillRect(mx - 3, iy + 1, 7, 1);
      ctx.fillRect(mx - 3, iy, 1, 3);
      drawMicroLabel(ctx, 'SWP', mx, r.y + 12);
    } else if (r.id === 'pickup') {
      const iy = r.y + 6;
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
