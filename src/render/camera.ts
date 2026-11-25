import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_4_3,
  SIM_HZ,
  type RenderSettings,
} from '@/contracts';

export const CAMERA_MAX_LOOKAHEAD = 48;
export const CAMERA_LOOKAHEAD_FACTOR = 0.25;
export const CAMERA_KICK_DECAY = 0.72; // multiplicative decay per 30 Hz sim tick
export const CAMERA_TRAUMA_DECAY_PER_SEC = 1.85;
export const CAMERA_MAX_SHAKE_PX = 14;

/**
 * Vlambeer-feel camera controller:
 * - Tracks player + clamp((aimWorld - player) * 0.25, 48px)
 * - Decaying directional weapon recoil kick (* 0.72 per 30 Hz tick)
 * - Trauma-squared screenshake scaled by RenderSettings.screenShakeScale
 * - Exact invertible worldToScreen() <-> screenToWorld() transforms
 */
export class CameraController {
  x = 0;
  y = 0;
  targetX = 0;
  targetY = 0;

  lookAheadX = 0;
  lookAheadY = 0;

  kickX = 0;
  kickY = 0;

  trauma = 0;
  shakeOffsetX = 0;
  shakeOffsetY = 0;

  viewportWidth = LOGICAL_WIDTH_4_3;
  viewportHeight = LOGICAL_HEIGHT;
  pixelSnap = true;

  private shakePhase = 0;
  private initialized = false;
  private focusBiasX = 0;
  private focusBiasY = 0;
  private focusBiasWeight = 0;

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, Math.round(width));
    this.viewportHeight = Math.max(1, Math.round(height));
  }

  /**
   * Temporarily biases camera tracking toward a world focal point (e.g. Boss Intro beat)
   * without breaking player look-ahead or worldToScreen/screenToWorld invertibility.
   */
  setFocusBias(worldX: number, worldY: number, weight: number): void {
    this.focusBiasX = worldX;
    this.focusBiasY = worldY;
    this.focusBiasWeight = Math.max(0, Math.min(0.65, weight));
  }

  clearFocusBias(): void {
    this.focusBiasWeight = 0;
  }

  snapTo(worldX: number, worldY: number): void {
    this.x = worldX;
    this.y = worldY;
    this.targetX = worldX;
    this.targetY = worldY;
    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.kickX = 0;
    this.kickY = 0;
    this.trauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.focusBiasWeight = 0;
    this.initialized = true;
  }

  /**
   * Computes clamped Vlambeer aim look-ahead offset:
   * clamp((aimWorld - player) * 0.25, 48px).
   */
  static computeLookAhead(
    playerX: number,
    playerY: number,
    aimWorldX: number,
    aimWorldY: number,
    maxLead: number = CAMERA_MAX_LOOKAHEAD,
  ): { x: number; y: number } {
    const rawX = (aimWorldX - playerX) * CAMERA_LOOKAHEAD_FACTOR;
    const rawY = (aimWorldY - playerY) * CAMERA_LOOKAHEAD_FACTOR;
    const dist = Math.hypot(rawX, rawY);
    if (dist > maxLead && dist > 1e-6) {
      const scale = maxLead / dist;
      return { x: rawX * scale, y: rawY * scale };
    }
    return { x: rawX, y: rawY };
  }

  /**
   * Adds screenshake trauma (0..1) and optional directional recoil kick impulse.
   */
  addShake(trauma: number, dirX?: number, dirY?: number, kick?: number): void {
    if (trauma > 0) {
      this.trauma = Math.min(1, this.trauma + trauma);
    }
    if (kick && kick !== 0 && dirX !== undefined && dirY !== undefined) {
      const len = Math.hypot(dirX, dirY);
      if (len > 1e-6) {
        this.kickX += (dirX / len) * kick;
        this.kickY += (dirY / len) * kick;
      }
    }
  }

  /**
   * Adds a direct recoil kick vector in world pixels.
   */
  addKick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  /**
   * Advances camera tracking, recoil decay, and trauma-squared screenshake.
   * Supports arbitrary frame dt (60+ Hz or 30 Hz) while preserving 30 Hz decay parity.
   */
  update(
    playerX: number,
    playerY: number,
    aimWorldX: number,
    aimWorldY: number,
    dtSeconds: number,
    settings?: Pick<RenderSettings, 'screenShakeScale' | 'pixelSnap'>,
  ): void {
    const dt = Math.max(0, Math.min(0.1, dtSeconds));
    const ticks = dt * SIM_HZ;
    const shakeScale = settings ? Math.max(0, Math.min(1, settings.screenShakeScale)) : 1;
    if (settings) {
      this.pixelSnap = settings.pixelSnap;
    }

    const lead = CameraController.computeLookAhead(playerX, playerY, aimWorldX, aimWorldY);
    this.lookAheadX = lead.x;
    this.lookAheadY = lead.y;

    const baseTargetX = playerX + lead.x;
    const baseTargetY = playerY + lead.y;
    if (this.focusBiasWeight > 0.001) {
      this.targetX = baseTargetX + (this.focusBiasX - baseTargetX) * this.focusBiasWeight;
      this.targetY = baseTargetY + (this.focusBiasY - baseTargetY) * this.focusBiasWeight;
    } else {
      this.targetX = baseTargetX;
      this.targetY = baseTargetY;
    }

    if (!this.initialized) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.initialized = true;
    } else {
      // Snappy Nuclear Throne follow smoothing (tight follow, frame-rate independent)
      const followRate = 1 - Math.pow(1 - 0.35, Math.max(0.01, ticks));
      this.x += (this.targetX - this.x) * followRate;
      this.y += (this.targetY - this.y) * followRate;
    }

    // Multiplicative recoil kick decay (0.72 per 30 Hz sim tick)
    if (ticks > 0) {
      const kickFactor = Math.pow(CAMERA_KICK_DECAY, ticks);
      this.kickX *= kickFactor;
      this.kickY *= kickFactor;
      if (Math.abs(this.kickX) < 0.05) this.kickX = 0;
      if (Math.abs(this.kickY) < 0.05) this.kickY = 0;
    }

    // Trauma-squared screenshake
    if (this.trauma > 0) {
      this.shakePhase += Math.max(0.5, ticks) * 2.37;
      const mag = this.trauma * this.trauma * CAMERA_MAX_SHAKE_PX * shakeScale;
      if (mag > 0) {
        // Deterministic multi-frequency pseudo-random jitter so shake feels punchy & works reproducibly
        const nx = Math.sin(this.shakePhase * 12.9898) * 0.65 + Math.cos(this.shakePhase * 27.13) * 0.35;
        const ny = Math.cos(this.shakePhase * 17.2331) * 0.65 + Math.sin(this.shakePhase * 31.71) * 0.35;
        this.shakeOffsetX = nx * mag || 0;
        this.shakeOffsetY = ny * mag || 0;
      } else {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      }

      this.trauma = Math.max(0, this.trauma - CAMERA_TRAUMA_DECAY_PER_SEC * dt);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  /**
   * Computes the top-left world coordinate of the rendered viewport
   * (includes recoil kick and screenshake offsets for visual punch).
   */
  getViewOrigin(): { left: number; top: number } {
    const rawLeft = this.x + this.kickX + this.shakeOffsetX - this.viewportWidth * 0.5;
    const rawTop = this.y + this.kickY + this.shakeOffsetY - this.viewportHeight * 0.5;
    if (this.pixelSnap) {
      return { left: Math.round(rawLeft), top: Math.round(rawTop) };
    }
    return { left: rawLeft, top: rawTop };
  }

  /**
   * Computes the unshaken top-left world coordinate (excluding transient kick & shake)
   * so stationary cursor aim never drifts during heavy gunfire while preserving
   * exact worldToScreen <-> screenToWorld mathematical invertibility.
   */
  getStableViewOrigin(): { left: number; top: number } {
    const rawLeft = this.x - this.viewportWidth * 0.5;
    const rawTop = this.y - this.viewportHeight * 0.5;
    if (this.pixelSnap) {
      return { left: Math.round(rawLeft), top: Math.round(rawTop) };
    }
    return { left: rawLeft, top: rawTop };
  }

  /**
   * Converts world coordinates into logical canvas screen coordinates
   * (uses stable unshaken origin for exact invertibility with screenToWorld).
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const { left, top } = this.getStableViewOrigin();
    return {
      x: worldX - left,
      y: worldY - top,
    };
  }

  /**
   * Converts logical canvas screen coordinates into world coordinates.
   * Excludes recoil kick and screenshake so stationary aim stays rock-solid
   * while remaining the exact mathematical inverse of worldToScreen().
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const { left, top } = this.getStableViewOrigin();
    return {
      x: screenX + left,
      y: screenY + top,
    };
  }
}
