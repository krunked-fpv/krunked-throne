import type { BiomeId, SimState } from '@/contracts';
import type { CameraController } from './camera';
import { fillPixelDisc, SHARED_GLOW_CACHE, type GlowCanvas, type GlowStampCache } from './glow-cache';

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
  glowRadius?: number; // crisp flat pixel-hard inner highlight disc radius
  glowAlpha?: number; // translucent flat highlight opacity
  brightWorldHalo?: boolean; // true for glowing plasma/guardian orbs & portals visible in bright biomes
}

/**
 * Biomes that use Nuclear Throne's iconic hard-edged pitch-black circular darkness veil
 * (Sewers, Pizza Sewers, Crystal Caves, Cursed Caves, Labs).
 */
const HARD_DARK_BIOMES = new Set<BiomeId>([
  'sewers',
  'pizza_sewers',
  'caves',
  'cursed_caves',
  'labs',
]);

function getBiomePlayerHaloStyle(biome: BiomeId): string {
  if (biome === 'caves' || biome === 'cursed_caves') {
    return 'rgba(215, 185, 255, 0.22)';
  }
  if (biome === 'labs') {
    return 'rgba(165, 225, 240, 0.16)';
  }
  if (biome === 'sewers' || biome === 'pizza_sewers') {
    return 'rgba(195, 245, 180, 0.14)';
  }
  return 'rgba(210, 215, 240, 0.16)';
}

function getBiomeAccentHaloStyle(biome: BiomeId): string {
  if (biome === 'caves' || biome === 'cursed_caves') {
    return 'rgba(215, 185, 255, 0.18)';
  }
  if (biome === 'labs') {
    return 'rgba(165, 225, 240, 0.16)';
  }
  if (biome === 'sewers' || biome === 'pizza_sewers') {
    return 'rgba(195, 245, 180, 0.15)';
  }
  return 'rgba(220, 230, 245, 0.16)';
}

/**
 * Authentic 1x pixel-grid Nuclear Throne circular darkness & hard-edged highlight pass:
 * - Dark biomes (Crystal Caves, Labs, Sewers, Cursed Caves, Pizza Sewers):
 *   * Outer unlit region is 100% PURE SOLID PITCH BLACK (#000000, alpha 1.0)
 *   * Visibility holes are carved with razor-sharp HARD-EDGED PIXEL-STEPPED CIRCLES
 *     (player radius 112 / Eyes 150 / Horror 122 / dead 60, cleanly unioned with crystals,
 *     torches, rad canisters, portals, bosses, projectiles, and explosions)
 *   * Iconic inner brighter translucent pixel-hard halo circle around the player (radius 36)
 *     plus crisp flat pixel-hard highlight discs around luminous crystals/torches/lasers/explosions
 * - ZERO blurry additive `lighter` bloom haze that washes out pixel art!
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

    // 1. Player primary visibility circle (exact Nuclear Throne radii: 112 / Eyes 150 / Horror 122 / dead 60)
    const isEyes = state.player.mutant === 'eyes';
    const isHorror = state.player.mutant === 'horror';
    const playerRadius = state.player.alive ? (isEyes ? 150 : isHorror ? 122 : 112) : 60;
    lights.push({
      x: playerX,
      y: playerY,
      radius: playerRadius,
      intensity: 1,
      glowRadius: state.player.alive ? 36 : 20,
      glowAlpha: 1,
      glowColor: getBiomePlayerHaloStyle(state.map.biome),
    });

    // 2. Glowing projectiles (lasers, plasma, guardian orbs, fire, lightning, rad beam, rockets)
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i]!;
      const pos = lerpPos(p.prevX, p.prevY, p.x, p.y, alpha, 96);
      const px = pos.x;
      const py = pos.y;
      switch (p.kind) {
        case 'laser':
        case 'enemy_laser': {
          const laserHalo = 'rgba(80, 235, 95, 0.18)';
          lights.push({ x: px, y: py, radius: 46, intensity: 1, glowColor: laserHalo, glowRadius: 16, glowAlpha: 1 });
          if (p.beamOriginX !== undefined && p.beamOriginY !== undefined) {
            lights.push({
              x: (p.beamOriginX + px) * 0.5,
              y: (p.beamOriginY + py) * 0.5,
              radius: 44,
              intensity: 1,
              glowColor: laserHalo,
              glowRadius: 14,
              glowAlpha: 1,
            });
          }
          break;
        }
        case 'plasma':
        case 'enemy_plasma':
          lights.push({
            x: px,
            y: py,
            radius: p.sprite === 'sprNothingBeam' ? 60 : 52,
            intensity: 1,
            glowColor: 'rgba(80, 235, 72, 0.16)',
            glowRadius: p.sprite === 'sprNothingBeam' ? 22 : Math.max(14, Math.round(p.radius * 2.1)),
            glowAlpha: 1,
            brightWorldHalo: p.sprite !== 'sprNothingBeam',
          });
          break;
        case 'enemy_bullet': {
          const spr = p.sprite || '';
          if (
            spr === 'sprGuardianBullet' ||
            spr === 'sprBigGuardianBullet' ||
            spr === 'sprExploGuardianBullet' ||
            spr === 'sprThrone2Bullet'
          ) {
            lights.push({
              x: px,
              y: py,
              radius: 48,
              intensity: 1,
              glowColor: 'rgba(72, 230, 56, 0.15)',
              glowRadius: Math.max(15, Math.round(p.radius * 2.2)),
              glowAlpha: 1,
              brightWorldHalo: true,
            });
          }
          break;
        }
        case 'flame':
        case 'enemy_flame':
          lights.push({ x: px, y: py, radius: 40, intensity: 1, glowColor: 'rgba(255, 165, 65, 0.18)', glowRadius: 14, glowAlpha: 1 });
          break;
        case 'lightning':
          lights.push({ x: px, y: py, radius: 48, intensity: 1, glowColor: 'rgba(130, 225, 255, 0.18)', glowRadius: 16, glowAlpha: 1 });
          break;
        case 'rad_beam':
          lights.push({
            x: px,
            y: py,
            radius: 44 + p.radius * 2,
            intensity: 1,
            glowColor: 'rgba(95, 245, 115, 0.18)',
            glowRadius: 14 + Math.round(p.radius),
            glowAlpha: 1,
          });
          break;
        case 'boss_orb':
          lights.push({
            x: px,
            y: py,
            radius: 50,
            intensity: 1,
            glowColor: 'rgba(85, 235, 85, 0.16)',
            glowRadius: 17,
            glowAlpha: 1,
            brightWorldHalo: true,
          });
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          lights.push({ x: px, y: py, radius: 36, intensity: 1, glowColor: 'rgba(255, 150, 65, 0.18)', glowRadius: 12, glowAlpha: 1 });
          break;
        default:
          break;
      }
    }

    // 3. Props: rad canisters, crystals, torches/lamps, lab tubes, throne generators, proto statues, Plant snares
    const biomeAccentHalo = getBiomeAccentHaloStyle(state.map.biome);
    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind === 'rad_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 56, intensity: 1, glowColor: 'rgba(110, 245, 115, 0.18)', glowRadius: 20, glowAlpha: 1 });
      } else if (prop.kind === 'idpd_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 50, intensity: 1, glowColor: 'rgba(100, 190, 255, 0.18)', glowRadius: 18, glowAlpha: 1 });
      } else if (prop.kind === 'throne_generator' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 68, intensity: 1, glowColor: 'rgba(100, 245, 125, 0.18)', glowRadius: 24, glowAlpha: 1 });
      } else if (prop.kind === 'proto_statue') {
        const charging = prop.hp < prop.maxHp || (prop.radsStored ?? 0) > 0;
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: charging ? 72 : 56,
          intensity: 1,
          glowColor: 'rgba(115, 245, 150, 0.18)',
          glowRadius: charging ? 26 : 20,
          glowAlpha: 1,
        });
      } else if (prop.kind === 'snare_trap') {
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: Math.max(58, prop.radius + 20),
          intensity: 1,
          glowColor: 'rgba(110, 240, 125, 0.16)',
          glowRadius: Math.min(30, Math.max(18, Math.round(prop.radius * 0.45))),
          glowAlpha: 1,
        });
      } else if (prop.sprite) {
        const spr = prop.sprite;
        if (spr === 'sprStreetLight' || spr === 'sprTorch' || spr === 'sprWallTorch') {
          lights.push({ x: prop.x, y: prop.y - 6, radius: 74, intensity: 1, glowColor: 'rgba(255, 215, 125, 0.18)', glowRadius: 26, glowAlpha: 1 });
        } else if (spr.startsWith('sprCrystalProp')) {
          lights.push({
            x: prop.x,
            y: prop.y - 2,
            radius: 68,
            intensity: 1,
            glowColor: biomeAccentHalo,
            glowRadius: 26,
            glowAlpha: 1,
          });
        } else if (spr === 'sprPalacePillar' || spr === 'sprNuclearPillar') {
          lights.push({ x: prop.x, y: prop.y - 4, radius: 56, intensity: 1, glowColor: 'rgba(95, 240, 125, 0.16)', glowRadius: 20, glowAlpha: 1 });
        } else if (spr === 'sprMutantTube' || spr === 'sprTube') {
          lights.push({ x: prop.x, y: prop.y - 4, radius: 64, intensity: 1, glowColor: 'rgba(130, 235, 215, 0.18)', glowRadius: 24, glowAlpha: 1 });
        } else if (spr === 'sprSodaMachine') {
          lights.push({ x: prop.x, y: prop.y - 2, radius: 50, intensity: 1, glowColor: 'rgba(130, 225, 255, 0.16)', glowRadius: 18, glowAlpha: 1 });
        } else if (spr === 'sprCampfire') {
          lights.push({ x: prop.x, y: prop.y - 2, radius: 96, intensity: 1, glowColor: 'rgba(255, 170, 75, 0.18)', glowRadius: 34, glowAlpha: 1 });
        } else if (spr === 'sprIceFlower' || spr === 'sprIceFlowerIdle') {
          lights.push({ x: prop.x, y: prop.y - 4, radius: 56, intensity: 1, glowColor: 'rgba(135, 230, 255, 0.18)', glowRadius: 20, glowAlpha: 1 });
        } else if (spr === 'sprServer') {
          lights.push({ x: prop.x, y: prop.y - 4, radius: 48, intensity: 1, glowColor: 'rgba(140, 215, 235, 0.16)', glowRadius: 18, glowAlpha: 1 });
        }
      }
    }

    // 4. Rad pickups (small crisp visibility dot in dark biomes)
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind === 'rad' || pk.kind === 'big_rad') {
        const pkPos = lerpPos(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
        lights.push({
          x: pkPos.x,
          y: pkPos.y,
          radius: pk.kind === 'big_rad' ? 34 : 22,
          intensity: 1,
          glowColor: 'rgba(110, 245, 120, 0.16)',
          glowRadius: pk.kind === 'big_rad' ? 12 : 7,
          glowAlpha: 1,
        });
      }
    }

    // 5. Active portal vortex
    if (state.portal.active) {
      const pulse = Math.round(88 + Math.sin(state.tick * 0.25) * 4);
      const target = state.portal.targetArea;
      const portalGlow =
        target === 'vault'
          ? 'rgba(95, 240, 140, 0.18)'
          : target === '1-?' || target === 'hq-1'
            ? 'rgba(95, 195, 255, 0.18)'
            : 'rgba(195, 125, 255, 0.18)';
      lights.push({
        x: state.portal.x,
        y: state.portal.y,
        radius: pulse,
        intensity: 1,
        glowColor: portalGlow,
        glowRadius: 30,
        glowAlpha: 1,
        brightWorldHalo: true,
      });
    }

    // 6. Bosses, Rebel allies, & luminous enemies (Laser/Lightning Crystals, Guardians)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const ePos = lerpPos(e.prevX, e.prevY, e.x, e.y, alpha, 56);
      const ex = ePos.x;
      const ey = ePos.y;
      if (e.isBoss) {
        lights.push({
          x: ex,
          y: ey,
          radius: 90,
          intensity: 1,
          glowColor: biomeAccentHalo,
          glowRadius: 32,
          glowAlpha: 1,
        });
      } else if (e.friendly) {
        const isSapling = e.defId === 'sapling';
        lights.push({
          x: ex,
          y: ey,
          radius: isSapling ? 46 : 68,
          intensity: 1,
          glowColor: biomeAccentHalo,
          glowRadius: isSapling ? 14 : 22,
          glowAlpha: 1,
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
          radius: 66,
          intensity: 1,
          glowColor:
            e.defId === 'guardian' || e.defId === 'explo_guardian'
              ? 'rgba(90, 240, 85, 0.16)'
              : biomeAccentHalo,
          glowRadius: 24,
          glowAlpha: 1,
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
          radius: Math.round(Math.min(68, Math.max(26, pt.size * 2.4) * (0.65 + 0.35 * lifeFrac))),
          intensity: 1,
          glowColor:
            pt.kind === 'plasma'
              ? 'rgba(95, 245, 115, 0.18)'
              : 'rgba(255, 200, 110, 0.18)',
          glowRadius: Math.round(Math.min(26, Math.max(12, pt.size * 1.2) * (0.65 + 0.35 * lifeFrac))),
          glowAlpha: 1,
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
   * Renders crisp 1x pixel-hard flat highlight discs (zero blurry additive haze)
   * and Nuclear Throne's hard-edged pitch-black circular darkness veil in dark biomes.
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
    const darkness = Math.max(0, Math.min(1, state.map.darkness));
    const isHardDark =
      darkness >= 0.35 || (darkness > 0.01 && HARD_DARK_BIOMES.has(state.map.biome));
    const w = camera.viewportWidth;
    const h = camera.viewportHeight;
    const view = camera.getViewOrigin();

    const lights = this.collectLights(state, playerX, playerY, interpAlpha, extraLights);

    // 1. Crisp pixel-hard flat translucent highlight discs (drawn via source-over, ZERO blurry lighter bloom!)
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      if (!l.glowColor) continue;
      // In bright biomes, only render crisp flat highlight discs for glowing plasma/guardian orbs & portals
      if (!isHardDark && !l.brightWorldHalo) continue;
      const glowR = Math.round(l.glowRadius ?? 0);
      if (glowR <= 0) continue;
      const scrX = Math.round(l.x - view.left);
      const scrY = Math.round(l.y - view.top);
      if (
        scrX + glowR < 0 ||
        scrX - glowR > w ||
        scrY + glowR < 0 ||
        scrY - glowR > h
      ) {
        continue;
      }
      mainCtx.globalAlpha = Math.max(0, Math.min(1, l.glowAlpha ?? 1));
      mainCtx.fillStyle = l.glowColor;
      fillPixelDisc(mainCtx, scrX, scrY, glowR);
    }
    mainCtx.restore();

    // 2. Hard-edged 1x pitch-black circular darkness veil for dark biomes (Caves, Labs, Sewers, Cursed Caves)
    if (!isHardDark) return;

    const lScale = 1;
    const lctx = this.ensureSurface(w * lScale, h * lScale);
    if (!lctx || !this.canvas) return;

    lctx.save();
    if (typeof lctx.setTransform === 'function') {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    lctx.imageSmoothingEnabled = false;
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    // 100% pure solid pitch black outside carved visibility circles (matches 08_caves_4_1 & 14_labs_6_1!)
    lctx.fillStyle = '#000000';
    lctx.fillRect(0, 0, w, h);

    // Carve visibility holes with razor-sharp hard-edged pixel-stepped discs (zero radial feathering!)
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = '#000000';
    lctx.globalAlpha = 1;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      const r = Math.round(l.radius);
      if (r <= 0) continue;
      const scrX = Math.round(l.x - view.left);
      const scrY = Math.round(l.y - view.top);
      if (
        scrX + r < 0 ||
        scrX - r > w ||
        scrY + r < 0 ||
        scrY - r > h
      ) {
        continue;
      }
      fillPixelDisc(lctx, scrX, scrY, r);
    }
    lctx.globalCompositeOperation = 'source-over';
    lctx.restore();

    mainCtx.imageSmoothingEnabled = false;
    mainCtx.drawImage(this.canvas, 0, 0, w, h, 0, 0, w, h);
  }
}
