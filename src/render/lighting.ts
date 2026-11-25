import type { SimState } from '@/contracts';
import { BIOME_FALLBACK_PALETTES } from '@/ui/data-provider';
import type { CameraController } from './camera';
import { SHARED_GLOW_CACHE, type GlowCanvas, type GlowStampCache } from './glow-cache';

type LightCanvas = HTMLCanvasElement | OffscreenCanvas;
type LightCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function lerpPos(prevX: number, prevY: number, x: number, y: number, t: number, maxJump = 56): { x: number; y: number } {
  if (Math.hypot(x - prevX, y - prevY) > maxJump) {
    return { x, y };
  }
  return { x: prevX + (x - prevX) * t, y: prevY + (y - prevY) * t };
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
  glowRadius?: number; // optional tighter additive halo radius (defaults to shrunk radius)
  glowAlpha?: number; // optional clamped additive opacity (<= 0.16 for combat lights)
}

const MAX_ADDITIVE_GLOW_ALPHA = 0.16;
const BLOOM_CELL_SIZE = 24;
const BLOOM_GRID_COLS = 20;
const BLOOM_GRID_ROWS = 12;

/**
 * Offscreen darkness & dynamic glow pass for dark biomes (map.darkness > 0:
 * Sewers, Crystal Caves, Labs, Cursed Caves, Palace, Vault).
 * Carves smooth radial light pools around the player (wider for Eyes!), glowing
 * projectiles, explosions, rad canisters, Plant snares, Rebel allies, portals, and bosses.
 * Clamps additive glow accumulation tightly so pixel art never washes out to white.
 */
export class LightingPass {
  private canvas: LightCanvas | null = null;
  private ctx: LightCtx | null = null;
  private width = 0;
  private height = 0;
  private readonly glowCache: GlowStampCache;
  private readonly bloomCellHits = new Uint8Array(BLOOM_GRID_COLS * BLOOM_GRID_ROWS);

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

    // 1. Player light pool (Eyes sees significantly farther in dark biomes; Horror radiates subtle rad glow!)
    const isEyes = state.player.mutant === 'eyes';
    const isHorror = state.player.mutant === 'horror';
    const playerRadius = state.player.alive ? (isEyes ? 128 : isHorror ? 84 : 74) : 40;
    const boilingActive =
      state.player.alive &&
      state.player.hp <= 4 &&
      state.player.mutations.includes('boiling_veins');
    lights.push({
      x: playerX,
      y: playerY,
      radius: playerRadius,
      intensity: isEyes ? 1.0 : 0.92,
      glowRadius: 28,
      glowAlpha: 0.14,
      glowColor: state.player.shielding
        ? 'rgba(200, 100, 255, 0.9)'
        : state.player.telekinesisActive
          ? 'rgba(100, 180, 255, 0.9)'
          : boilingActive
            ? 'rgba(255, 130, 42, 0.9)'
            : isHorror
              ? 'rgba(85, 255, 115, 0.75)'
              : undefined,
    });

    // 2. Glowing projectiles (lasers, plasma, fire, lightning, rad beam, boss orbs)
    // Darkness carving keeps generous readability; additive halo radii & alphas stay tightly clamped!
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i]!;
      const pos = lerpPos(p.prevX, p.prevY, p.x, p.y, alpha, 96);
      const px = pos.x;
      const py = pos.y;
      switch (p.kind) {
        case 'laser':
        case 'enemy_laser': {
          const laserColor =
            p.isUltra || p.weaponId === 'ultra_laser_pistol'
              ? 'rgba(80, 255, 120, 0.9)'
              : p.weaponId === 'ion_cannon'
                ? 'rgba(80, 225, 255, 0.9)'
                : p.team === 'enemy'
                  ? 'rgba(255, 75, 225, 0.9)'
                  : 'rgba(255, 60, 90, 0.9)';
          lights.push({ x: px, y: py, radius: 34, intensity: 0.8, glowColor: laserColor, glowRadius: 16, glowAlpha: 0.12 });
          if (p.beamOriginX !== undefined && p.beamOriginY !== undefined) {
            lights.push({
              x: (p.beamOriginX + px) * 0.5,
              y: (p.beamOriginY + py) * 0.5,
              radius: 36,
              intensity: 0.65,
              glowColor: laserColor,
              glowRadius: 18,
              glowAlpha: 0.10,
            });
          }
          break;
        }
        case 'plasma':
        case 'enemy_plasma':
          lights.push({
            x: px,
            y: py,
            radius: p.sprite === 'sprNothingBeam' ? 44 : 40,
            intensity: 0.85,
            glowColor: 'rgba(80, 255, 115, 0.9)',
            glowRadius: p.sprite === 'sprNothingBeam' ? 20 : 18,
            glowAlpha: 0.12,
          });
          break;
        case 'flame':
        case 'enemy_flame':
          lights.push({ x: px, y: py, radius: 30, intensity: 0.72, glowColor: 'rgba(255, 145, 45, 0.9)', glowRadius: 14, glowAlpha: 0.12 });
          break;
        case 'lightning':
          lights.push({ x: px, y: py, radius: 36, intensity: 0.8, glowColor: 'rgba(120, 225, 255, 0.9)', glowRadius: 16, glowAlpha: 0.13 });
          break;
        case 'rad_beam':
          lights.push({
            x: px,
            y: py,
            radius: 34 + p.radius * 2,
            intensity: 0.85,
            glowColor: 'rgba(85, 255, 115, 0.9)',
            glowRadius: 14 + p.radius,
            glowAlpha: 0.13,
          });
          break;
        case 'boss_orb':
          lights.push({ x: px, y: py, radius: 34, intensity: 0.76, glowColor: 'rgba(110, 255, 130, 0.9)', glowRadius: 15, glowAlpha: 0.11 });
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          lights.push({ x: px, y: py, radius: 26, intensity: 0.6, glowColor: 'rgba(255, 130, 50, 0.9)', glowRadius: 12, glowAlpha: 0.11 });
          break;
        default:
          break;
      }
    }

    // 3. Props: rad canisters, throne generators, proto statues, Plant snares
    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind === 'rad_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 40, intensity: 0.78, glowColor: 'rgba(85, 255, 105, 0.9)', glowRadius: 18, glowAlpha: 0.12 });
      } else if (prop.kind === 'idpd_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 36, intensity: 0.72, glowColor: 'rgba(80, 175, 255, 0.9)', glowRadius: 16, glowAlpha: 0.12 });
      } else if (prop.kind === 'throne_generator' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 54, intensity: 0.85, glowColor: 'rgba(90, 255, 130, 0.9)', glowRadius: 24, glowAlpha: 0.13 });
      } else if (prop.kind === 'proto_statue') {
        const charging = prop.hp < prop.maxHp || (prop.radsStored ?? 0) > 0;
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: charging ? 58 : 44,
          intensity: charging ? 0.85 : 0.7,
          glowColor: 'rgba(100, 255, 150, 0.9)',
          glowRadius: charging ? 26 : 18,
          glowAlpha: charging ? 0.15 : 0.11,
        });
      } else if (prop.kind === 'snare_trap') {
        // Authentic NT: Plant's Snare illuminates dark biomes!
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: Math.max(46, prop.radius + 16),
          intensity: 0.74,
          glowColor: 'rgba(85, 240, 115, 0.9)',
          glowRadius: Math.min(34, Math.max(18, prop.radius * 0.45)),
          glowAlpha: 0.11,
        });
      }
    }

    // 4. Rad pickups (subtle rad shimmer)
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind === 'rad' || pk.kind === 'big_rad') {
        const pkPos = lerpPos(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
        lights.push({
          x: pkPos.x,
          y: pkPos.y,
          radius: pk.kind === 'big_rad' ? 26 : 15,
          intensity: 0.48,
          glowColor: 'rgba(85, 255, 110, 0.9)',
          glowRadius: pk.kind === 'big_rad' ? 12 : 8,
          glowAlpha: 0.09,
        });
      }
    }

    // 5. Active portal swirling vortex (tinted by destination: Oasis blue, Vault green, HQ blue, default purple)
    if (state.portal.active) {
      const pulse = 74 + Math.sin(state.tick * 0.25) * 6;
      const target = state.portal.targetArea;
      const portalGlow =
        target === 'vault'
          ? 'rgba(72, 245, 130, 0.9)'
          : target === '1-?' || target === 'hq-1'
            ? 'rgba(72, 185, 255, 0.9)'
            : 'rgba(185, 95, 255, 0.9)';
      lights.push({
        x: state.portal.x,
        y: state.portal.y,
        radius: pulse,
        intensity: 1.0,
        glowColor: portalGlow,
        glowRadius: 34,
        glowAlpha: 0.16,
      });
    }

    // 6. Bosses, Rebel allies (light sources in NT!), & luminous enemies
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const ePos = lerpPos(e.prevX, e.prevY, e.x, e.y, alpha, 56);
      const ex = ePos.x;
      const ey = ePos.y;
      if (e.isBoss) {
        lights.push({
          x: ex,
          y: ey,
          radius: 72,
          intensity: 0.85,
          glowColor: 'rgba(120, 255, 140, 0.9)',
          glowRadius: 30,
          glowAlpha: 0.12,
        });
      } else if (e.friendly) {
        // Authentic NT: Rebel Allies & Plant Saplings cast light pools in dark biomes!
        const isSapling = e.defId === 'sapling';
        lights.push({
          x: ex,
          y: ey,
          radius: isSapling ? 34 : 54,
          intensity: isSapling ? 0.62 : 0.78,
          glowColor: isSapling ? 'rgba(95, 245, 120, 0.85)' : 'rgba(145, 235, 195, 0.85)',
          glowRadius: isSapling ? 14 : 20,
          glowAlpha: 0.10,
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
          glowColor: 'rgba(200, 100, 255, 0.9)',
          glowRadius: 15,
          glowAlpha: 0.11,
        });
      }
    }

    // 7. Explosions & glowing particles (clamped tight so explosions never wash out to white!)
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
          radius: Math.min(54, Math.max(18, pt.size * 2.2) * (0.6 + 0.4 * lifeFrac)),
          intensity: Math.min(0.9, 0.75 * lifeFrac + 0.15),
          glowColor:
            pt.kind === 'plasma'
              ? 'rgba(80, 255, 115, 0.9)'
              : 'rgba(255, 165, 65, 0.9)',
          glowRadius: Math.min(24, Math.max(10, pt.size * 1.15) * (0.65 + 0.35 * lifeFrac)),
          glowAlpha: Math.min(0.14, 0.14 * lifeFrac),
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
   * Renders the ambient darkness mask and clamped subtle additive glows onto the main logical canvas
   * using pre-rendered cached offscreen glow sprite stamps (zero per-frame createRadialGradient).
   * Uses camera.getViewOrigin() so lighting stays pixel-locked to screenshake & recoil kick.
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
    const view = camera.getViewOrigin();

    const lights = this.collectLights(state, playerX, playerY, interpAlpha, extraLights);

    // 1. Clamped additive bloom glows via cached offscreen glow stamps with spatial washout protection
    this.bloomCellHits.fill(0);
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      if (!l.glowColor) continue;
      const scrX = l.x - view.left;
      const scrY = l.y - view.top;
      const glowR = Math.min(38, l.glowRadius ?? l.radius * 0.4);
      if (
        glowR <= 0 ||
        scrX + glowR < 0 ||
        scrX - glowR > w ||
        scrY + glowR < 0 ||
        scrY - glowR > h
      ) {
        continue;
      }

      // Coarse screen-grid density attenuation prevents 10+ stacked Plasma/Boss orbs washing out to pure white
      const gx = Math.max(0, Math.min(BLOOM_GRID_COLS - 1, Math.floor(scrX / BLOOM_CELL_SIZE)));
      const gy = Math.max(0, Math.min(BLOOM_GRID_ROWS - 1, Math.floor(scrY / BLOOM_CELL_SIZE)));
      const cellIdx = gy * BLOOM_GRID_COLS + gx;
      const priorHits = this.bloomCellHits[cellIdx]!;
      if (priorHits >= 6) continue;
      this.bloomCellHits[cellIdx] = priorHits + 1;

      const baseAlpha = Math.min(MAX_ADDITIVE_GLOW_ALPHA, Math.max(0, l.glowAlpha ?? 0.13));
      const attenuatedAlpha = baseAlpha / (1 + priorHits * 0.9);
      if (attenuatedAlpha < 0.015) continue;

      const stamp = this.getGlowStamp(l.glowColor, glowR);
      if (stamp) {
        mainCtx.globalAlpha = attenuatedAlpha;
        mainCtx.drawImage(
          stamp,
          Math.floor(scrX - glowR),
          Math.floor(scrY - glowR),
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
        const scrX = l.x - view.left;
        const scrY = l.y - view.top;
        if (
          scrX + l.radius < 0 ||
          scrX - l.radius > w ||
          scrY + l.radius < 0 ||
          scrY - l.radius > h
        ) {
          continue;
        }
        lctx.globalAlpha = Math.max(0, Math.min(1, l.intensity));
        lctx.drawImage(
          maskStamp,
          Math.floor(scrX - l.radius),
          Math.floor(scrY - l.radius),
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
