import type { SimState } from '@/contracts';
import { BIOME_FALLBACK_PALETTES } from '@/ui/data-provider';
import type { CameraController } from './camera';
import { SHARED_GLOW_CACHE, type GlowCanvas, type GlowStampCache } from './glow-cache';

type LightCanvas = HTMLCanvasElement | OffscreenCanvas;
type LightCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function createOffscreenCanvas(w: number, h: number): LightCanvas | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  return null;
}

export interface DynamicLight {
  x: number;
  y: number;
  radius: number;
  intensity: number; // 0..1
  glowColor?: string;
}

/**
 * Offscreen darkness & dynamic glow pass for dark biomes (map.darkness > 0:
 * Sewers, Crystal Caves, Labs, Cursed Caves, Palace, Vault).
 * Carves smooth radial light pools around the player (wider for Eyes!), glowing
 * projectiles, explosions, rad canisters, portals, and bosses.
 */
export class LightingPass {
  private canvas: LightCanvas | null = null;
  private ctx: LightCtx | null = null;
  private width = 0;
  private height = 0;
  private readonly glowCache: GlowStampCache;

  constructor(glowCache: GlowStampCache = SHARED_GLOW_CACHE) {
    this.glowCache = glowCache;
  }

  getGlowStamp(color: string, radius: number): GlowCanvas | null {
    return this.glowCache.getGlowStamp(color, radius);
  }

  private ensureSurface(w: number, h: number): LightCtx | null {
    if (this.canvas && this.ctx && this.width === w && this.height === h) {
      return this.ctx;
    }
    this.width = w;
    this.height = h;
    this.canvas = createOffscreenCanvas(w, h);
    this.ctx = this.canvas ? (this.canvas.getContext('2d') as LightCtx | null) : null;
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
    return this.ctx;
  }

  /**
   * Collects active world-space lights from SimState (exported for inspection/testing).
   */
  collectLights(
    state: SimState,
    playerX: number,
    playerY: number,
    interpAlpha: number = 1,
    extraLights?: readonly DynamicLight[],
  ): DynamicLight[] {
    const lights: DynamicLight[] = [];
    const alpha = Math.max(0, Math.min(1, interpAlpha));

    // 1. Player light pool (Eyes sees significantly farther in dark biomes!)
    const isEyes = state.player.mutant === 'eyes';
    const playerRadius = state.player.alive ? (isEyes ? 124 : 74) : 40;
    lights.push({
      x: playerX,
      y: playerY,
      radius: playerRadius,
      intensity: isEyes ? 1.0 : 0.92,
      glowColor: state.player.shielding
        ? 'rgba(200, 100, 255, 0.22)'
        : state.player.telekinesisActive
          ? 'rgba(100, 180, 255, 0.22)'
          : undefined,
    });

    // 2. Glowing projectiles (lasers, plasma, fire, lightning, rad beam, boss orbs)
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i]!;
      const px = lerp(p.prevX, p.x, alpha);
      const py = lerp(p.prevY, p.y, alpha);
      switch (p.kind) {
        case 'laser':
        case 'enemy_laser':
          lights.push({ x: px, y: py, radius: 42, intensity: 0.85, glowColor: 'rgba(255, 60, 90, 0.24)' });
          break;
        case 'plasma':
        case 'enemy_plasma':
          lights.push({ x: px, y: py, radius: 52, intensity: 0.9, glowColor: 'rgba(80, 255, 115, 0.28)' });
          break;
        case 'flame':
        case 'enemy_flame':
          lights.push({ x: px, y: py, radius: 36, intensity: 0.78, glowColor: 'rgba(255, 145, 45, 0.25)' });
          break;
        case 'lightning':
          lights.push({ x: px, y: py, radius: 44, intensity: 0.85, glowColor: 'rgba(120, 225, 255, 0.26)' });
          break;
        case 'rad_beam':
          lights.push({ x: px, y: py, radius: 48, intensity: 0.92, glowColor: 'rgba(85, 255, 105, 0.30)' });
          break;
        case 'boss_orb':
          lights.push({ x: px, y: py, radius: 46, intensity: 0.85, glowColor: 'rgba(110, 255, 130, 0.26)' });
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          lights.push({ x: px, y: py, radius: 30, intensity: 0.65, glowColor: 'rgba(255, 130, 50, 0.20)' });
          break;
        default:
          break;
      }
    }

    // 3. Props: rad canisters, throne generators, proto statues
    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind === 'rad_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 40, intensity: 0.78, glowColor: 'rgba(85, 255, 105, 0.22)' });
      } else if (prop.kind === 'idpd_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 36, intensity: 0.72, glowColor: 'rgba(80, 175, 255, 0.22)' });
      } else if (prop.kind === 'throne_generator' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 56, intensity: 0.85, glowColor: 'rgba(90, 255, 130, 0.26)' });
      } else if (prop.kind === 'proto_statue') {
        lights.push({ x: prop.x, y: prop.y, radius: 44, intensity: 0.7, glowColor: 'rgba(100, 255, 150, 0.18)' });
      }
    }

    // 4. Rad pickups (subtle rad shimmer)
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind === 'rad' || pk.kind === 'big_rad') {
        lights.push({
          x: pk.x,
          y: pk.y,
          radius: pk.kind === 'big_rad' ? 28 : 16,
          intensity: 0.5,
          glowColor: 'rgba(85, 255, 110, 0.14)',
        });
      }
    }

    // 5. Active portal swirling vortex
    if (state.portal.active) {
      const pulse = 78 + Math.sin(state.tick * 0.25) * 8;
      lights.push({
        x: state.portal.x,
        y: state.portal.y,
        radius: pulse,
        intensity: 1.0,
        glowColor: 'rgba(185, 95, 255, 0.34)',
      });
    }

    // 6. Bosses & luminous enemies (laser crystals, guardians)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const ex = lerp(e.prevX, e.x, alpha);
      const ey = lerp(e.prevY, e.y, alpha);
      if (e.isBoss) {
        lights.push({
          x: ex,
          y: ey,
          radius: 76,
          intensity: 0.88,
          glowColor: 'rgba(120, 255, 140, 0.22)',
        });
      } else if (
        e.defId === 'laser_crystal' ||
        e.defId === 'lightning_crystal' ||
        e.defId === 'guardian' ||
        e.defId === 'explo_guardian'
      ) {
        lights.push({
          x: ex,
          y: ey,
          radius: 34,
          intensity: 0.65,
          glowColor: 'rgba(200, 100, 255, 0.18)',
        });
      }
    }

    // 7. Explosions & glowing particles
    for (let i = 0; i < state.particles.length; i++) {
      const pt = state.particles[i]!;
      if (
        pt.kind === 'explosion' ||
        pt.kind === 'fire' ||
        pt.kind === 'plasma' ||
        pt.kind === 'muzzle' ||
        pt.kind === 'laser_hit'
      ) {
        const lifeFrac = pt.maxLifeTicks > 0 ? pt.lifeTicks / pt.maxLifeTicks : 0.5;
        lights.push({
          x: pt.x,
          y: pt.y,
          radius: Math.max(24, pt.size * 3.5) * (0.6 + 0.4 * lifeFrac),
          intensity: Math.min(1, 0.85 * lifeFrac + 0.2),
          glowColor:
            pt.kind === 'plasma'
              ? 'rgba(80, 255, 115, 0.26)'
              : 'rgba(255, 165, 65, 0.26)',
        });
      }
    }

    // 8. Transient render-side blast & muzzle flash lights
    if (extraLights) {
      for (let i = 0; i < extraLights.length; i++) {
        lights.push(extraLights[i]!);
      }
    }

    return lights;
  }

  /**
   * Renders the ambient darkness mask and subtle additive glows onto the main logical canvas
   * using pre-rendered cached offscreen glow sprite stamps (zero per-frame createRadialGradient).
   */
  render(
    mainCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    state: SimState,
    camera: CameraController,
    playerX: number,
    playerY: number,
    interpAlpha: number = 1,
    extraLights?: readonly DynamicLight[],
  ): void {
    const darkness = Math.max(0, Math.min(0.9, state.map.darkness));
    const w = camera.viewportWidth;
    const h = camera.viewportHeight;

    const lights = this.collectLights(state, playerX, playerY, interpAlpha, extraLights);

    // 1. Subtle additive bloom glows via cached offscreen glow stamps
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      if (!l.glowColor) continue;
      const scr = camera.worldToScreen(l.x, l.y);
      const glowR = l.radius * 0.72;
      if (
        scr.x + glowR < 0 ||
        scr.x - glowR > w ||
        scr.y + glowR < 0 ||
        scr.y - glowR > h
      ) {
        continue;
      }
      const stamp = this.getGlowStamp(l.glowColor, glowR);
      if (stamp) {
        mainCtx.drawImage(
          stamp,
          Math.floor(scr.x - glowR),
          Math.floor(scr.y - glowR),
          Math.ceil(glowR * 2),
          Math.ceil(glowR * 2),
        );
      }
    }
    mainCtx.restore();

    // 2. Darkness veil with carved light pools via cached radial mask stamp
    if (darkness <= 0.01) return;

    const lctx = this.ensureSurface(w, h);
    if (!lctx || !this.canvas) return;

    const pal = BIOME_FALLBACK_PALETTES[state.map.biome] ?? BIOME_FALLBACK_PALETTES.sewers;
    // Slightly reduce ambient darkness for Eyes so their passive feels awesome immediately
    const effectiveDarkness =
      state.player.mutant === 'eyes' ? darkness * 0.74 : darkness;

    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = `rgba(${pal.darkTint}, ${effectiveDarkness.toFixed(3)})`;
    lctx.fillRect(0, 0, w, h);

    const maskStamp = this.glowCache.getDarknessMaskStamp();
    if (maskStamp) {
      lctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i]!;
        const scr = camera.worldToScreen(l.x, l.y);
        if (
          scr.x + l.radius < 0 ||
          scr.x - l.radius > w ||
          scr.y + l.radius < 0 ||
          scr.y - l.radius > h
        ) {
          continue;
        }
        lctx.globalAlpha = Math.max(0, Math.min(1, l.intensity));
        lctx.drawImage(
          maskStamp,
          Math.floor(scr.x - l.radius),
          Math.floor(scr.y - l.radius),
          Math.ceil(l.radius * 2),
          Math.ceil(l.radius * 2),
        );
      }
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'source-over';
    }

    mainCtx.drawImage(this.canvas, 0, 0);
  }
}
