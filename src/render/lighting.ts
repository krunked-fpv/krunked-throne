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
  radius: number; // Pass B outer visibility hole punched through #000000 darkness mask
  innerRadius?: number; // Pass A inner full-bright hole punched through 42% dim veil
  intensity: number; // 0..1
  glowColor?: string;
  glowRadius?: number;
  glowAlpha?: number;
}

/**
 * Biomes that use Nuclear Throne's iconic 2-tier hard-edged pitch-black circular darkness veil
 * (Sewers, Pizza Sewers, Crystal Caves, Cursed Caves, Labs).
 */
const HARD_DARK_BIOMES = new Set<BiomeId>([
  'sewers',
  'pizza_sewers',
  'caves',
  'cursed_caves',
  'labs',
]);

/**
 * Authentic 1x pixel-grid 2-tier Nuclear Throne circular darkness pass:
 * - Only applies to dark biomes (Caves, Cursed Caves, Labs, Sewers, Pizza Sewers); bright biomes
 *   (including Palace 7-1..7-3, Desert, Oasis, Scrapyard, Frozen, Jungle) stay 100% razor-crisp with
 *   zero translucent green/milky floor discs!
 * - Pass A (Mid-Ring 42% Dim Veil): fills 1x surface with rgba(0, 0, 0, 0.42) and punches crisp
 *   pixel-hard inner full-bright holes (Player r=38 / Eyes 54 / Horror 42, crystals/torches 20,
 *   lasers/projectiles 22, portals 30, explosions 38).
 * - Pass B (Outer Pitch-Black Mask): fills 1x surface with #000000 (alpha 1.0) and punches crisp
 *   pixel-hard outer visibility holes (Player r=108 / Eyes 144 / Horror 118 / dead 58, portals 68,
 *   bosses 68, explosions 62, lasers 36, Rebel allies 54, passive crystals/torches/canisters <= 34).
 * - Inside r=38: 100% full-bright sprites; r=38..108: exact 42% shadowed tones (#8152bc -> #44315e,
 *   #12333b -> #0d1919); outside r=108: 100% pitch black #000000.
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

    // 1. Player 2-tier visibility circles:
    //    Outer visibility: 108 (Eyes: 144, Horror: 118, dead: 58)
    //    Inner full-bright: 38 (Eyes: 54, Horror: 42, dead: 20)
    const isEyes = state.player.mutant === 'eyes';
    const isHorror = state.player.mutant === 'horror';
    const playerOuter = state.player.alive ? (isEyes ? 144 : isHorror ? 118 : 108) : 58;
    const playerInner = state.player.alive ? (isEyes ? 54 : isHorror ? 42 : 38) : 20;
    lights.push({
      x: playerX,
      y: playerY,
      radius: playerOuter,
      innerRadius: playerInner,
      intensity: 1,
    });

    // 2. Glowing projectiles (lasers, plasma, flames, lightning, rad beam, boss orbs, rockets)
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i]!;
      const pos = lerpPos(p.prevX, p.prevY, p.x, p.y, alpha, 96);
      const px = pos.x;
      const py = pos.y;
      switch (p.kind) {
        case 'laser':
        case 'enemy_laser': {
          lights.push({ x: px, y: py, radius: 36, innerRadius: 22, intensity: 1 });
          if (p.beamOriginX !== undefined && p.beamOriginY !== undefined) {
            lights.push({
              x: (p.beamOriginX + px) * 0.5,
              y: (p.beamOriginY + py) * 0.5,
              radius: 34,
              innerRadius: 18,
              intensity: 1,
            });
          }
          break;
        }
        case 'plasma':
        case 'enemy_plasma':
          lights.push({
            x: px,
            y: py,
            radius: p.sprite === 'sprNothingBeam' ? 48 : 36,
            innerRadius: 22,
            intensity: 1,
          });
          break;
        case 'flame':
        case 'enemy_flame':
          lights.push({ x: px, y: py, radius: 32, innerRadius: 18, intensity: 1 });
          break;
        case 'lightning':
          lights.push({ x: px, y: py, radius: 36, innerRadius: 22, intensity: 1 });
          break;
        case 'rad_beam':
          lights.push({
            x: px,
            y: py,
            radius: Math.min(44, 30 + Math.round(p.radius * 1.5)),
            innerRadius: 22,
            intensity: 1,
          });
          break;
        case 'boss_orb':
          lights.push({
            x: px,
            y: py,
            radius: p.sprite === 'sprLastBall' ? 44 : 36,
            innerRadius: p.sprite === 'sprLastBall' ? 24 : 22,
            intensity: 1,
          });
          break;
        case 'rocket':
        case 'nuke':
        case 'boss_missile':
          lights.push({ x: px, y: py, radius: 30, innerRadius: 16, intensity: 1 });
          break;
        default:
          if (p.sprite === 'sprLastBall') {
            lights.push({ x: px, y: py, radius: 44, innerRadius: 24, intensity: 1 });
          } else if (p.sprite === 'sprTrapFire') {
            lights.push({ x: px, y: py, radius: 32, innerRadius: 18, intensity: 1 });
          } else if (p.sprite === 'sprFrogQueenBall') {
            lights.push({ x: px, y: py, radius: 34, innerRadius: 18, intensity: 1 });
          }
          break;
      }
    }

    // 3. Props: tight small visibility circles for passive landmarks & glowing setpieces
    for (let i = 0; i < state.props.length; i++) {
      const prop = state.props[i]!;
      if (prop.kind === 'rad_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 34, innerRadius: 20, intensity: 1 });
      } else if (prop.kind === 'rad_maggot_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 38, innerRadius: 22, intensity: 1 });
      } else if (prop.kind === 'idpd_canister' && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 32, innerRadius: 18, intensity: 1 });
      } else if (prop.kind === 'throne_generator' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 34, innerRadius: 20, intensity: 1 });
      } else if (prop.kind === 'small_generator' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 36, innerRadius: 20, intensity: 1 });
      } else if (prop.kind === 'proto_statue') {
        const charging = prop.hp < prop.maxHp || (prop.radsStored ?? 0) > 0;
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: charging ? 48 : 34,
          innerRadius: charging ? 24 : 20,
          intensity: 1,
        });
      } else if (prop.kind === 'proto_chest') {
        lights.push({ x: prop.x, y: prop.y, radius: 34, innerRadius: 20, intensity: 1 });
      } else if (prop.kind === 'snare_trap') {
        lights.push({
          x: prop.x,
          y: prop.y,
          radius: 34,
          innerRadius: 20,
          intensity: 1,
        });
      } else if (prop.kind === 'necro_revive_area') {
        lights.push({ x: prop.x, y: prop.y, radius: 48, innerRadius: 28, intensity: 1 });
      } else if (prop.kind === 'torch' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y - 3, radius: 42, innerRadius: 24, intensity: 1 });
      } else if (prop.kind === 'chandelier' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y - 4, radius: 44, innerRadius: 24, intensity: 1 });
      } else if (prop.kind === 'frog_egg' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 32, innerRadius: 18, intensity: 1 });
      } else if (prop.kind === 'fire_trap' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 32, innerRadius: 18, intensity: 1 });
      } else if (prop.kind === 'big_tv' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y, radius: 52, innerRadius: 28, intensity: 1 });
      } else if (prop.kind === 'venuz_tv' && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y - 12, radius: 64, innerRadius: 34, intensity: 1 });
      } else if ((prop.kind === 'giant_weapon_chest' || prop.kind === 'giant_ammo_chest') && !prop.opened) {
        lights.push({ x: prop.x, y: prop.y, radius: 46, innerRadius: 24, intensity: 1 });
      } else if ((prop.kind === 'terminal' || prop.kind === 'server') && prop.hp > 0) {
        lights.push({ x: prop.x, y: prop.y - 2, radius: 28, innerRadius: 16, intensity: 1 });
      } else if (prop.sprite) {
        const spr = prop.sprite;
        if (
          spr === 'sprStreetLight' ||
          spr === 'sprTorch' ||
          spr === 'sprWallTorch' ||
          spr === 'sprChandelier' ||
          spr.startsWith('sprCrystalProp') ||
          spr === 'sprMutantTube' ||
          spr === 'sprTube' ||
          spr === 'sprSmallGenerator' ||
          spr === 'sprRadChestMaggot'
        ) {
          lights.push({ x: prop.x, y: prop.y - 3, radius: 34, innerRadius: 20, intensity: 1 });
        } else if (spr === 'sprReviveArea' || spr === 'sprNecroReviveArea' || spr === 'sprPopoReviveArea') {
          lights.push({ x: prop.x, y: prop.y, radius: 48, innerRadius: 28, intensity: 1 });
        } else if (spr === 'sprFrogEgg' || spr === 'sprTrap') {
          lights.push({ x: prop.x, y: prop.y, radius: 32, innerRadius: 18, intensity: 1 });
        } else if (spr === 'sprBigTVOn' || spr === 'sprBigTVTurnOn' || spr === 'sprVenuzTV') {
          lights.push({ x: prop.x, y: prop.y, radius: 52, innerRadius: 28, intensity: 1 });
        } else if (spr === 'sprGiantWepChest' || spr === 'sprGiantAmmoChest') {
          lights.push({ x: prop.x, y: prop.y, radius: 46, innerRadius: 24, intensity: 1 });
        } else if (
          spr === 'sprPalacePillar' ||
          spr === 'sprNuclearPillar' ||
          spr === 'sprSodaMachine' ||
          spr === 'sprIceFlower' ||
          spr === 'sprIceFlowerIdle' ||
          spr === 'sprServer' ||
          spr === 'sprTerminal' ||
          spr === 'sprProtoChest'
        ) {
          lights.push({ x: prop.x, y: prop.y - 3, radius: 28, innerRadius: 16, intensity: 1 });
        } else if (spr === 'sprCampfire') {
          lights.push({ x: prop.x, y: prop.y - 2, radius: 68, innerRadius: 34, intensity: 1 });
        }
      }
    }

    // 4. Rad & Cursed pickups (subtle tight glints — never flood the screen)
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind === 'rad' || pk.kind === 'big_rad') {
        const pkPos = lerpPos(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
        lights.push({
          x: pkPos.x,
          y: pkPos.y,
          radius: pk.kind === 'big_rad' ? 22 : 14,
          innerRadius: pk.kind === 'big_rad' ? 10 : 0,
          intensity: 1,
        });
      } else if (pk.kind === 'cursed_ammo') {
        const pkPos = lerpPos(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
        lights.push({
          x: pkPos.x,
          y: pkPos.y,
          radius: 26,
          innerRadius: 14,
          intensity: 1,
        });
      } else if (pk.cursed) {
        const pkPos = lerpPos(pk.prevX ?? pk.x, pk.prevY ?? pk.y, pk.x, pk.y, alpha, 56);
        lights.push({
          x: pkPos.x,
          y: pkPos.y,
          radius: 22,
          innerRadius: 10,
          intensity: 1,
        });
      }
    }

    // 5. Active portal vortex
    if (state.portal.active) {
      const pulse = Math.round(68 + Math.sin(state.tick * 0.25) * 3);
      lights.push({
        x: state.portal.x,
        y: state.portal.y,
        radius: pulse,
        innerRadius: 30,
        intensity: 1,
      });
    }

    // 6. Bosses, Rebel allies, Plant saplings, & luminous enemies
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const ePos = lerpPos(e.prevX, e.prevY, e.x, e.y, alpha, 56);
      const ex = ePos.x;
      const ey = ePos.y;
      if (e.defId === 'hyper_crystal' || e.bossId === 'hyper_crystal') {
        lights.push({
          x: ex,
          y: ey,
          radius: 78,
          innerRadius: 36,
          intensity: 1,
        });
      } else if (e.defId === 'captain' || e.bossId === 'captain') {
        lights.push({
          x: ex,
          y: ey,
          radius: 72,
          innerRadius: 34,
          intensity: 1,
        });
      } else if (e.isBoss) {
        lights.push({
          x: ex,
          y: ey,
          radius: 68,
          innerRadius: 30,
          intensity: 1,
        });
      } else if (e.friendly) {
        const isSapling = e.defId === 'plant_sapling' || e.defId === 'sapling';
        lights.push({
          x: ex,
          y: ey,
          radius: isSapling ? 32 : 54,
          innerRadius: isSapling ? 14 : 20,
          intensity: 1,
        });
      } else if (e.defId === 'enemy_horror') {
        lights.push({
          x: ex,
          y: ey,
          radius: 56,
          innerRadius: 28,
          intensity: 1,
        });
      } else if (e.defId === 'cursed_laser_crystal') {
        lights.push({
          x: ex,
          y: ey,
          radius: 38,
          innerRadius: 22,
          intensity: 1,
        });
      } else if (
        e.defId === 'laser_crystal' ||
        e.defId === 'lightning_crystal' ||
        e.defId === 'guardian' ||
        e.defId === 'explo_guardian' ||
        e.defId === 'fireballer' ||
        e.defId === 'super_fireballer'
      ) {
        lights.push({
          x: ex,
          y: ey,
          radius: 34,
          innerRadius: 20,
          intensity: 1,
        });
      } else if (e.defId === 'fire_trap') {
        lights.push({
          x: ex,
          y: ey,
          radius: 32,
          innerRadius: 18,
          intensity: 1,
        });
      } else if (e.defId === 'cursed_spider') {
        lights.push({
          x: ex,
          y: ey,
          radius: 26,
          innerRadius: 14,
          intensity: 1,
        });
      } else if (e.defId === 'rad_maggot') {
        lights.push({
          x: ex,
          y: ey,
          radius: 20,
          innerRadius: 10,
          intensity: 1,
        });
      }
    }

    // 7. Explosions & glowing combat particles
    for (let i = 0; i < state.particles.length; i++) {
      const pt = state.particles[i]!;
      if (
        pt.kind === 'explosion' ||
        pt.kind === 'popo_explo' ||
        pt.kind === 'gamma_blast' ||
        pt.kind === 'portal_clear' ||
        pt.kind === 'fire' ||
        pt.kind === 'trap_fire' ||
        pt.kind === 'plasma' ||
        pt.kind === 'muzzle' ||
        pt.kind === 'laser_hit' ||
        pt.kind === 'frog_heal'
      ) {
        const lifeFrac = pt.maxLifeTicks > 0 ? pt.lifeTicks / pt.maxLifeTicks : 0.5;
        const isBlast =
          pt.kind === 'explosion' ||
          pt.kind === 'popo_explo' ||
          pt.kind === 'gamma_blast' ||
          pt.kind === 'portal_clear';
        const outerR = isBlast
          ? Math.round(Math.min(62, Math.max(30, pt.size * 2.2) * (0.65 + 0.35 * lifeFrac)))
          : Math.round(Math.min(36, Math.max(18, pt.size * 1.8) * (0.65 + 0.35 * lifeFrac)));
        const innerR = isBlast
          ? Math.round(Math.min(38, Math.max(18, pt.size * 1.4) * (0.65 + 0.35 * lifeFrac)))
          : Math.round(Math.min(22, Math.max(10, pt.size * 1.0) * (0.65 + 0.35 * lifeFrac)));
        lights.push({
          x: pt.x,
          y: pt.y,
          radius: outerR,
          innerRadius: innerR,
          intensity: 1,
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
   * Renders Nuclear Throne's true 2-tier 1x pixel-hard circular darkness:
   * - Pass A: 42% black dim veil (`rgba(0, 0, 0, 0.42)`) with crisp full-bright inner circles punched out.
   * - Pass B: 100% pitch-black (`#000000`) mask with crisp outer visibility circles punched out.
   * Bright biomes return immediately with ZERO translucent floor discs!
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
    if (!isHardDark) return;

    const w = camera.viewportWidth;
    const h = camera.viewportHeight;
    const view = camera.getViewOrigin();
    const lScale = 1;
    const lctx = this.ensureSurface(w * lScale, h * lScale);
    if (!lctx || !this.canvas) return;

    const lights = this.collectLights(state, playerX, playerY, interpAlpha, extraLights);

    lctx.save();
    if (typeof lctx.setTransform === 'function') {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    lctx.imageSmoothingEnabled = false;
    mainCtx.imageSmoothingEnabled = false;

    // ------------------------------------------------------------------------
    // PASS A: Mid-Ring 42% Dim Veil with crisp pixel-hard inner full-bright holes
    // ------------------------------------------------------------------------
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    lctx.fillRect(0, 0, w, h);

    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = '#000000';
    lctx.globalAlpha = 1;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      const r = Math.round(l.innerRadius ?? 0);
      if (r <= 0) continue;
      const scrX = Math.round(l.x - view.left);
      const scrY = Math.round(l.y - view.top);
      if (scrX + r < 0 || scrX - r > w || scrY + r < 0 || scrY - r > h) continue;
      fillPixelDisc(lctx, scrX, scrY, r);
    }
    mainCtx.drawImage(this.canvas, 0, 0, w, h, 0, 0, w, h);

    // ------------------------------------------------------------------------
    // PASS B: Outer 100% Pitch-Black (#000000) Mask with crisp outer visibility holes
    // ------------------------------------------------------------------------
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = '#000000';
    lctx.fillRect(0, 0, w, h);

    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = '#000000';
    lctx.globalAlpha = 1;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!;
      const r = Math.round(l.radius);
      if (r <= 0) continue;
      const scrX = Math.round(l.x - view.left);
      const scrY = Math.round(l.y - view.top);
      if (scrX + r < 0 || scrX - r > w || scrY + r < 0 || scrY - r > h) continue;
      fillPixelDisc(lctx, scrX, scrY, r);
    }
    lctx.globalCompositeOperation = 'source-over';
    lctx.restore();

    mainCtx.drawImage(this.canvas, 0, 0, w, h, 0, 0, w, h);
  }
}
