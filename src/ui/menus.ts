import type {
  AreaCode,
  AudioSettings,
  ControlSettings,
  CrownId,
  GamepadFamily,
  GameScreen,
  InputDeviceMode,
  KeyBindings,
  MutantDef,
  MutantId,
  MutationId,
  RenderSettings,
  SaveData,
  SimState,
  SpriteDef,
  TargetFps,
  UltraId,
} from '@/contracts';
import type { AssetBundle } from '@/assets';
import {
  KRUNKED_LOGO_FRAMES,
  KRUNKED_LOGO_GLOW_HEIGHT,
  KRUNKED_LOGO_GLOW_ORIGIN_X,
  KRUNKED_LOGO_GLOW_ORIGIN_Y,
  KRUNKED_LOGO_GLOW_WIDTH,
  KRUNKED_LOGO_HEIGHT,
  KRUNKED_LOGO_ORIGIN_X,
  KRUNKED_LOGO_ORIGIN_Y,
  KRUNKED_LOGO_WIDTH,
  getKrunkedLogoFrameSurface,
  getKrunkedLogoGlowSurface,
} from '@/assets/fallback-ui';
import {
  MAX_GAMEPAD_DEADZONE,
  MIN_GAMEPAD_DEADZONE,
  getGamepadGlyphs,
  type GamepadDebugSnapshot,
  type MenuInputSnapshot,
} from '@/input';
import { BitmapFontRenderer, wrapMarkupText } from '@/render/bitmap-font';
import { SpriteRenderer } from '@/render/sprites';
import {
  ALL_CROWN_IDS,
  DEFAULT_UI_DATA_PROVIDER,
  resolveWeaponLabel,
  resolveWeaponSpriteName,
  type UiDataProvider,
} from './data-provider';
import { computeUltraIconFrame, renderTopLeftGameplayHud } from './hud';

export const OPAQUE_MENU_BACKDROP = 'rgba(10, 9, 14, 0.96)';

const MAIN_PATH_AREAS = [
  '1-1', '1-2', '1-3',
  '2-1',
  '3-1', '3-2', '3-3',
  '4-1',
  '5-1', '5-2', '5-3',
  '6-1',
  '7-1', '7-2', '7-3',
] as const;

const FALLBACK_MUTATION_DECK: readonly MutationId[] = [
  'rhino_skin',
  'trigger_fingers',
  'strong_spirit',
  'laser_brain',
];

/**
 * Formats simulation ticks (30 Hz) as Nuclear Throne's exact `MM:SS.cc` run timer (`00:26.35`).
 */
export function formatRunTimer(timeTicks: number): string {
  const totalSec = Math.max(0, timeTicks) / 30;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const centis = Math.floor((totalSec - Math.floor(totalSec)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/**
 * Maps any area code (main path, secrets, Crown Vault, Campfire 0-1, IDPD HQ)
 * onto the 0..14 progression road map.
 * Crown Vault maps to mid-run index 7 (matching AREA_RANK alongside 4-1), never 1-1!
 */
export function resolveRunProgressIndex(areaCode: string): number {
  const direct = (MAIN_PATH_AREAS as readonly string[]).indexOf(areaCode);
  if (direct >= 0) return direct;
  if (areaCode === '0-1') return MAIN_PATH_AREAS.length - 1;
  if (areaCode === '1-?') return 2;
  if (areaCode === '2-?') return 3;
  if (areaCode === '3-?') return 5;
  if (areaCode === '4-?') return 7;
  if (areaCode === 'vault') return 7;
  if (areaCode === '5-?') return 10;
  if (areaCode === 'hq-1') return 13;
  return 0;
}

// ============================================================================
// SHARED NUCLEAR THRONE 1x PIXEL PRIMITIVES:
// - drawPortalVortex (swirling purple spiral + crackling 1px white lightning + 28px letterbox)
// - drawInkSplatBanner & drawEdgeInkSplats (hand-brushed ragged #000000 ink strokes)
// - drawChunkyMenuText (iconic bold jagged black-outlined display lettering)
// - drawRunRoadMap (authentic red/white horizontal run progression rail + mutant head + Throne)
// ============================================================================

type VortexSurface = HTMLCanvasElement | OffscreenCanvas;

let cachedVortexCanvas: VortexSurface | null = null;
let cachedVortexW = 0;
let cachedVortexH = 0;
let cachedVortexTick = -1;

function createVortexCanvas(w: number, h: number): VortexSurface | null {
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

function drawPixelLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness = 1,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  for (let steps = 0; steps < 280; steps++) {
    ctx.fillRect(ix0, iy0, thickness, thickness);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

/**
 * Authentic Nuclear Throne concentric stepped purple spiral vortex (#4a275f & #3a1f4a
 * spiral arms twisting into an off-center dark core #14091c) with sporadic crackling
 * jagged 1px white pixel lightning arcs + optional 28px pure #000000 letterbox bars!
 */
export function drawPortalVortex(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number,
  letterbox: boolean = true,
): void {
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const frameBucket = Math.floor(Math.max(0, timeSec) * 24);
  const coreX = iw * 0.44 + Math.sin(timeSec * 0.58) * 14;
  const coreY = ih * 0.55 + Math.cos(timeSec * 0.46) * 9;

  let drewRasterVortex = false;
  if (!cachedVortexCanvas || cachedVortexW !== iw || cachedVortexH !== ih) {
    cachedVortexCanvas = createVortexCanvas(iw, ih);
    cachedVortexW = iw;
    cachedVortexH = ih;
    cachedVortexTick = -1;
  }

  if (cachedVortexCanvas) {
    const vctx = cachedVortexCanvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (vctx && typeof vctx.createImageData === 'function' && typeof vctx.putImageData === 'function') {
      if (cachedVortexTick !== frameBucket) {
        cachedVortexTick = frameBucket;
        const img = vctx.createImageData(iw, ih);
        const data = img.data;
        const phaseShift = timeSec * 1.95;

        // Exact sampled Nuclear Throne 5-arm smooth curved portal tunnel (#4a275f / #3a1f4a -> #14091c core)
        const lightR = [0x14, 0x26, 0x35, 0x42, 0x4a];
        const lightG = [0x09, 0x12, 0x1a, 0x22, 0x27];
        const lightB = [0x1c, 0x34, 0x47, 0x56, 0x5f];
        const darkR = [0x12, 0x1d, 0x28, 0x32, 0x3a];
        const darkG = [0x08, 0x0d, 0x14, 0x1a, 0x1f];
        const darkB = [0x18, 0x29, 0x37, 0x42, 0x4a];

        let off = 0;
        for (let y = 0; y < ih; y++) {
          const dy = (y - coreY) * 1.06;
          const dy2 = dy * dy;
          for (let x = 0; x < iw; x++) {
            const dx = x - coreX;
            const dist = Math.sqrt(dx * dx + dy2);
            let tier: number;
            if (dist < 13) tier = 0;
            else if (dist < 30) tier = 1;
            else if (dist < 58) tier = 2;
            else if (dist < 102) tier = 3;
            else tier = 4;

            if (tier === 0) {
              data[off] = 0x14;
              data[off + 1] = 0x09;
              data[off + 2] = 0x1c;
              data[off + 3] = 0xff;
            } else {
              const ang = Math.atan2(dy, dx);
              // 5 smooth curving spiral bands matching 01_title.png & 11a_levelup.png!
              const twist = Math.log(dist + 22) * 3.15 + dist * 0.011;
              const arm = Math.sin(ang * 5 + twist - phaseShift) >= 0;
              if (arm) {
                data[off] = lightR[tier]!;
                data[off + 1] = lightG[tier]!;
                data[off + 2] = lightB[tier]!;
              } else {
                data[off] = darkR[tier]!;
                data[off + 1] = darkG[tier]!;
                data[off + 2] = darkB[tier]!;
              }
              data[off + 3] = 0xff;
            }
            off += 4;
          }
        }
        vctx.putImageData(img, 0, 0);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cachedVortexCanvas, 0, 0);
      drewRasterVortex = true;
    }
  }

  if (!drewRasterVortex) {
    // Headless test fallback: crisp stepped purple concentric spiral bands via integer fillRect
    ctx.fillStyle = '#4a275f';
    ctx.fillRect(0, 0, iw, ih);
    const rings: ReadonlyArray<[number, string]> = [
      [130, '#3a1f4a'],
      [98, '#4a275f'],
      [72, '#341a44'],
      [48, '#281336'],
      [28, '#1d0d29'],
      [15, '#14091c'],
    ];
    for (const [r, col] of rings) {
      ctx.fillStyle = col;
      for (let dy = -r; dy <= r; dy += 3) {
        const span = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
        ctx.fillRect(Math.round(coreX) - span, Math.round(coreY) + dy, span * 2, 3);
      }
    }
  }

  // Swirling tiny white/pale-lavender pixel debris specks orbiting into the vortex core
  for (let i = 0; i < 8; i++) {
    const cycle = (timeSec * (0.45 + (i % 3) * 0.14) + i * 0.21) % 1;
    const rad = (1 - cycle) * (Math.max(iw, ih) * 0.54) + 10;
    const theta = i * 1.65 - timeSec * 1.45 - cycle * 3.4;
    const sx = Math.round(coreX + Math.cos(theta) * rad);
    const sy = Math.round(coreY + Math.sin(theta) * rad * 0.85);
    const sz = rad > 85 ? 2 : 1;
    ctx.fillStyle = i % 2 === 0 ? '#dcd4ea' : '#9c8db5';
    ctx.fillRect(sx, sy, sz, sz);
  }

  // Sporadic jagged 1px white pixel lightning arcs crackling across the purple tunnel!
  const zapBucket = Math.floor(Math.max(0, timeSec) * 14);
  for (let bolt = 0; bolt < 3; bolt++) {
    const hVal = Math.imul((zapBucket + bolt * 37) ^ 0x5bf03635, 0x27d4eb2d) >>> 0;
    if (bolt > 0 && (hVal & 7) > 3) continue; // Keep at least 1 crisp crackling bolt alive like NT!
    const baseAngle = ((hVal >>> 4) % 360) * (Math.PI / 180);
    const startR = 16 + ((hVal >>> 12) % 42);
    const endR = startR + 34 + ((hVal >>> 18) % 66);
    let px = coreX + Math.cos(baseAngle) * startR;
    let py = coreY + Math.sin(baseAngle) * startR * 0.88;
    const segs = 5;
    for (let s = 1; s <= segs; s++) {
      const frac = s / segs;
      const segHash = Math.imul(hVal ^ (s * 2654435761), 0x45d9f3b) >>> 0;
      const jitter = (((segHash & 31) - 15.5) / 15.5) * 14;
      const rNow = startR + (endR - startR) * frac;
      const perp = baseAngle + Math.PI * 0.5;
      const nx = coreX + Math.cos(baseAngle) * rNow + Math.cos(perp) * jitter;
      const ny = coreY + Math.sin(baseAngle) * rNow * 0.88 + Math.sin(perp) * jitter;
      ctx.fillStyle = s === 2 || s === 3 ? '#ffffff' : '#e6dcf5';
      drawPixelLine(ctx, px, py, nx, ny, s === 2 ? 2 : 1);
      px = nx;
      py = ny;
    }
  }

  // Optional iconic 28px pure #000000 top & bottom letterbox bars (matches 01_title.png & 03_portal_gen.png!)
  if (letterbox) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, iw, 28);
    ctx.fillRect(0, ih - 28, iw, 28);
  }
}

/**
 * Authentic Nuclear Throne hand-drawn jagged pure-black #000000 ink-splat brush stroke
 * (ragged horizontal strokes, sweeping top-right diagonal brush tails, and tiny ink flecks).
 */
export function drawInkSplatBanner(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number = 0,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.max(8, Math.round(w));
  const ih = Math.max(6, Math.round(h));

  const hash = (n: number): number => (Math.imul((seed + 17) ^ (n * 374761393), 668265263) >>> 0) % 100;

  ctx.fillStyle = '#000000';
  // Core ragged brushstroke body
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillRect(ix + 4, iy - 2, Math.max(4, iw - 10), 2);
  ctx.fillRect(ix + 6, iy + ih, Math.max(4, iw - 14), 2);

  // Tapered jagged horizontal brush rows extending organically past left & right bounds
  const leftSpikes = [
    [-(6 + (hash(1) % 9)), 0, 2],
    [-(12 + (hash(2) % 11)), Math.floor(ih * 0.22), 3],
    [-(8 + (hash(3) % 8)), Math.floor(ih * 0.52), 3],
    [-(10 + (hash(4) % 9)), Math.max(0, ih - 3), 2],
  ] as const;
  for (const [dx, dy, sh] of leftSpikes) {
    ctx.fillRect(ix + dx, iy + dy, -dx + 4, sh);
  }

  const rightSpikes = [
    [10 + (hash(5) % 16), -2, 2],
    [16 + (hash(6) % 18), Math.floor(ih * 0.14), 3],
    [8 + (hash(7) % 12), Math.floor(ih * 0.48), 3],
    [12 + (hash(8) % 14), Math.max(0, ih - 3), 3],
  ] as const;
  for (const [ext, dy, sh] of rightSpikes) {
    ctx.fillRect(ix + iw - 3, iy + dy, ext + 3, sh);
  }

  // Iconic sweeping top-right ink whip-streak (seen in 03_portal_gen.png & 23_victory.png!)
  const whipLen = Math.min(34, Math.max(16, Math.round(iw * 0.52)));
  drawPixelLine(ctx, ix + Math.round(iw * 0.25), iy - 1, ix + Math.round(iw * 0.25) + whipLen, iy - 7, 2);
  drawPixelLine(ctx, ix + Math.round(iw * 0.45), iy - 1, ix + Math.round(iw * 0.45) + Math.round(whipLen * 0.7), iy - 4, 1);

  // Scattered 1-2px ink flecks
  ctx.fillRect(ix - 15 - (hash(9) % 7), iy + Math.floor(ih * 0.3), 2, 1);
  ctx.fillRect(ix + iw + 18 + (hash(10) % 9), iy + Math.floor(ih * 0.2), 2, 2);
  ctx.fillRect(ix + iw + 14 + (hash(11) % 7), iy + ih - 1, 3, 1);
}

/**
 * Full-width jagged pure-black ink-splat banners along top & bottom edges of Pause,
 * Level Up, Options, Game Over, and Victory screens (matching 21_paused.png & 22_settings_video.png!).
 */
function drawEdgeInkSplats(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  topH: number,
  botH: number,
  cornerRise: number = 0,
): void {
  const iw = Math.round(w);
  const ih = Math.round(h);
  ctx.fillStyle = '#000000';

  if (topH > 0) {
    ctx.fillRect(0, 0, iw, topH);
    for (let x = 0; x < iw; x += 6) {
      const hVal = (Math.imul((x + 13) ^ 0x5a3c, 2654435761) >>> 0) % 100;
      const tooth = (hVal % 5) + (x < 70 || x > iw - 70 ? 2 : 0);
      ctx.fillRect(x, topH, 6, tooth);
      if (hVal % 7 === 0) {
        ctx.fillRect(x + 2, topH + tooth + 1, 2, 1);
      }
    }
  }

  if (botH > 0) {
    ctx.fillRect(0, ih - botH, iw, botH);
    for (let x = 0; x < iw; x += 5) {
      const hVal = (Math.imul((x + 31) ^ 0x7c11, 2654435761) >>> 0) % 100;
      const edgeProx = Math.min(x, iw - x);
      const wingLift = cornerRise > 0 && edgeProx < 115
        ? Math.round(((115 - edgeProx) / 115) * cornerRise)
        : 0;
      const tooth = (hVal % 6) + wingLift;
      ctx.fillRect(x, ih - botH - tooth, 5, tooth);
      if (hVal % 9 === 0) {
        ctx.fillRect(x + 1, ih - botH - tooth - 2, 2, 1);
      }
    }
    if (cornerRise > 0) {
      // Sweeping diagonal brush strokes on lower-left and lower-right corners (21_paused.png!)
      drawPixelLine(ctx, 0, ih - botH - cornerRise - 6, 86, ih - botH + 2, 3);
      drawPixelLine(ctx, 18, ih - botH - cornerRise - 2, 108, ih - botH + 4, 2);
      drawPixelLine(ctx, iw, ih - botH - cornerRise - 8, iw - 92, ih - botH + 2, 3);
      drawPixelLine(ctx, iw - 14, ih - botH - cornerRise - 2, iw - 114, ih - botH + 4, 2);
    }
  }
}

/**
 * Organic angled diagonal spiky brush-stroke ink splats for Pause screen (exact match to 21_paused.png!):
 * - Sleek ragged top ink bar behind the HUD
 * - Diagonal spiky ink wedges rising into bottom-left (MENU/RETRY) and bottom-right (SETTINGS/CONTINUE)
 *   while leaving the CENTER arena floor clearly visible between them!
 */
function drawPauseCornerInkSplats(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  phase: 'top' | 'bottom',
): void {
  const iw = Math.round(w);
  const ih = Math.round(h);
  const isWide = iw >= 380;
  ctx.fillStyle = '#000000';

  if (phase === 'top') {
    // Sleek pure-black top HUD bar (28px tall) with hand-brushed jagged bottom teeth
    const topH = 29;
    ctx.fillRect(0, 0, iw, topH);
    for (let x = 0; x < iw; x += 6) {
      const hv = (Math.imul((x + 19) ^ 0x3b71, 2654435761) >>> 0) % 100;
      const tooth = (hv % 4) + (x < 92 || x > iw - 96 ? 2 : 0);
      ctx.fillRect(x, topH, 6, tooth);
      if (hv % 11 === 0) ctx.fillRect(x + 2, topH + tooth + 1, 2, 1);
    }
    return;
  }

  // Bottom thin footer strip (16px) leaving center arena clearly visible from y = 160..224!
  const footH = 16;
  ctx.fillRect(0, ih - footH, iw, footH);
  for (let x = 0; x < iw; x += 5) {
    const hv = (Math.imul((x + 41) ^ 0x6d19, 2654435761) >>> 0) % 100;
    ctx.fillRect(x, ih - footH - (hv % 3), 5, hv % 3);
  }

  // Bottom-Left organic diagonal ink wedge sloping UP into left corner (holds MENU & RETRY)
  const leftSpan = isWide ? 148 : 114;
  const leftPeak = 64;
  for (let yOff = 0; yOff < leftPeak; yOff++) {
    const t = yOff / leftPeak; // 0 at foot, 1 at top peak
    const hv = (Math.imul((yOff + 7) ^ 0x51a3, 2654435761) >>> 0) % 100;
    const jag = (hv % 15) - 6;
    const span = Math.max(8, Math.round(leftSpan * (1 - t * 0.78) + jag));
    ctx.fillRect(0, ih - footH - yOff - 1, span, 1);
    if (hv % 8 === 0 && span + 8 < iw * 0.45) {
      ctx.fillRect(span + 3, ih - footH - yOff - 1, 4 + (hv % 7), 1);
    }
  }
  // Dramatic diagonal brush whip-streaks fanning out from bottom-left wedge (matching 21_paused.png!)
  drawPixelLine(ctx, 0, ih - footH - leftPeak - 10, leftSpan - 18, ih - footH - 12, 3);
  drawPixelLine(ctx, 14, ih - footH - leftPeak - 4, leftSpan + 16, ih - footH - 2, 2);
  drawPixelLine(ctx, 42, ih - footH - 42, leftSpan + 26, ih - footH - 8, 2);
  drawPixelLine(ctx, 64, ih - footH - 28, leftSpan + 30, ih - footH - 18, 1);
  // Stray ink flecks
  ctx.fillRect(leftSpan + 12, ih - footH - 36, 3, 2);
  ctx.fillRect(leftSpan + 24, ih - footH - 22, 2, 2);

  // Bottom-Right mirrored organic diagonal ink wedge sloping UP into right corner (holds SETTINGS & CONTINUE)
  const rightSpan = isWide ? 164 : 122;
  const rightPeak = 68;
  for (let yOff = 0; yOff < rightPeak; yOff++) {
    const t = yOff / rightPeak;
    const hv = (Math.imul((yOff + 23) ^ 0x73c9, 2654435761) >>> 0) % 100;
    const jag = (hv % 17) - 7;
    const span = Math.max(10, Math.round(rightSpan * (1 - t * 0.72) + jag));
    ctx.fillRect(iw - span, ih - footH - yOff - 1, span, 1);
    if (hv % 7 === 0 && iw - span - 12 > iw * 0.55) {
      ctx.fillRect(iw - span - 7 - (hv % 6), ih - footH - yOff - 1, 4 + (hv % 6), 1);
    }
  }
  // Dramatic diagonal brush whip-streaks fanning up-left from bottom-right wedge (matching 21_paused.png!)
  drawPixelLine(ctx, iw, ih - footH - rightPeak - 12, iw - rightSpan + 14, ih - footH - 14, 3);
  drawPixelLine(ctx, iw - 12, ih - footH - rightPeak - 4, iw - rightSpan - 18, ih - footH - 4, 2);
  drawPixelLine(ctx, iw - 48, ih - footH - 48, iw - rightSpan - 26, ih - footH - 16, 2);
  drawPixelLine(ctx, iw - 28, ih - footH - rightPeak - 14, iw - rightSpan + 24, ih - footH - 54, 1);
  // Stray ink flecks
  ctx.fillRect(iw - rightSpan - 16, ih - footH - 38, 3, 2);
  ctx.fillRect(iw - rightSpan - 28, ih - footH - 20, 2, 2);
}

/**
 * Sleek horizontal jagged corner ink splat extending inward from the left or right screen edge
 * (exact match to top-right & bottom-left ink strokes in 11a_levelup.png!).
 */
function drawCornerEdgeInkSplat(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  side: 'left' | 'right',
  y: number,
  span: number,
  h: number,
  seed: number = 0,
): void {
  const iw = Math.round(w);
  const iy = Math.round(y);
  const ih = Math.max(8, Math.round(h));
  const iSpan = Math.max(24, Math.round(span));
  ctx.fillStyle = '#000000';

  for (let r = 0; r < ih; r++) {
    const hv = (Math.imul((seed + r * 31) ^ 0x45d9f3b, 2654435761) >>> 0) % 100;
    const edgeTaper = r < 4 ? (4 - r) * 5 : r > ih - 4 ? (r - (ih - 4)) * 4 : 0;
    const spike = (hv % 28) - 8;
    const rowW = Math.max(16, iSpan - edgeTaper + spike);
    if (side === 'left') {
      ctx.fillRect(0, iy + r, rowW, 1);
      if (hv % 6 === 0) {
        ctx.fillRect(rowW + 3 + (hv % 6), iy + r, 5 + (hv % 9), 1);
      }
    } else {
      ctx.fillRect(iw - rowW, iy + r, rowW, 1);
      if (hv % 6 === 0) {
        const fw = 5 + (hv % 9);
        ctx.fillRect(iw - rowW - 3 - (hv % 6) - fw, iy + r, fw, 1);
      }
    }
  }

  // Sweeping horizontal whip-streaks shooting cleanly off the inner edge
  if (side === 'left') {
    drawPixelLine(ctx, iSpan - 18, iy + 2, iSpan + 24, iy + 5, 2);
    drawPixelLine(ctx, iSpan - 8, iy + Math.round(ih * 0.45), iSpan + 30, iy + Math.round(ih * 0.55), 2);
  } else {
    drawPixelLine(ctx, iw - iSpan + 16, iy + 3, iw - iSpan - 26, iy + 6, 2);
    drawPixelLine(ctx, iw - iSpan + 8, iy + Math.round(ih * 0.52), iw - iSpan - 30, iy + Math.round(ih * 0.62), 2);
  }
}

// ============================================================================
// BESPOKE 1x BOLD HAND-DRAWN NUCLEAR THRONE CHUNKY DISPLAY FONT (11x14 NATIVE 1x)
// Thick 3px hand-painted strokes, organic irregular edges & 2px crisp #000000 outline!
// Matches 01_title.png, 21_paused.png, 11a_levelup.png, 22_settings_video.png!
// ============================================================================

const CHUNKY_GLYPHS_11X14: Readonly<Record<string, readonly string[]>> = {
  A: [
    '....###....',
    '...#####...',
    '..#######..',
    '..###.###..',
    '.###...###.',
    '.###...###.',
    '###########',
    '###########',
    '###########',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '.##.....##.',
  ],
  B: [
    '########...',
    '#########..',
    '##########.',
    '###....###.',
    '###....###.',
    '#########..',
    '##########.',
    '###....####',
    '###.....###',
    '###.....###',
    '###....####',
    '##########.',
    '#########..',
    '#######....',
  ],
  C: [
    '...#######.',
    '..#########',
    '.##########',
    '####....###',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###.....###',
    '####...####',
    '.##########',
    '..########.',
    '...######..',
  ],
  D: [
    '#######....',
    '########...',
    '#########..',
    '###...####.',
    '###....###.',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###....###.',
    '###...####.',
    '#########..',
    '########...',
    '######.....',
  ],
  E: [
    '###########',
    '###########',
    '##########.',
    '###........',
    '###........',
    '#########..',
    '#########..',
    '########...',
    '###........',
    '###........',
    '###........',
    '###########',
    '###########',
    '##########.',
  ],
  F: [
    '###########',
    '###########',
    '##########.',
    '###........',
    '###........',
    '#########..',
    '#########..',
    '########...',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '##.........',
  ],
  G: [
    '...#######.',
    '..#########',
    '.##########',
    '####....###',
    '###........',
    '###........',
    '###...#####',
    '###...#####',
    '###.....###',
    '###.....###',
    '####...####',
    '.##########',
    '..#########',
    '...######.#',
  ],
  H: [
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###########',
    '###########',
    '###########',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '##.......##',
  ],
  I: [
    '.#########.',
    '.#########.',
    '.#########.',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '.#########.',
    '.#########.',
    '.########..',
  ],
  J: [
    '..#########',
    '..#########',
    '..#########',
    '......####.',
    '......####.',
    '......####.',
    '......####.',
    '......####.',
    '###...####.',
    '###...####.',
    '####..####.',
    '.########..',
    '..#######..',
    '...#####...',
  ],
  K: [
    '###....###.',
    '###...####.',
    '###..####..',
    '###.####...',
    '#######....',
    '######.....',
    '#######....',
    '###.####...',
    '###..####..',
    '###...####.',
    '###....###.',
    '###....####',
    '###.....###',
    '##.......##',
  ],
  L: [
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
    '###########',
    '###########',
    '##########.',
  ],
  M: [
    '###.....###',
    '####...####',
    '#####.#####',
    '###########',
    '###########',
    '###.###.###',
    '###..#..###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '##.......##',
  ],
  N: [
    '###.....###',
    '####....###',
    '#####...###',
    '######..###',
    '#######.###',
    '###.#######',
    '###..######',
    '###...#####',
    '###....####',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '##.......##',
  ],
  O: [
    '..#######..',
    '.#########.',
    '###########',
    '####...####',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  P: [
    '#########..',
    '##########.',
    '###########',
    '###....####',
    '###.....###',
    '###....####',
    '###########',
    '##########.',
    '########...',
    '###........',
    '###........',
    '###........',
    '###........',
    '##.........',
  ],
  Q: [
    '..#######..',
    '.#########.',
    '###########',
    '####...####',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###..##.###',
    '###...#####',
    '####..#####',
    '##########.',
    '.########.#',
    '..#####.###',
  ],
  R: [
    '#########..',
    '##########.',
    '###########',
    '###....####',
    '###.....###',
    '###....####',
    '##########.',
    '#########..',
    '###..####..',
    '###...####.',
    '###....###.',
    '###....####',
    '###.....###',
    '##.......##',
  ],
  S: [
    '..########.',
    '.##########',
    '###########',
    '###.....###',
    '####.......',
    '.########..',
    '..########.',
    '...########',
    '........###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  T: [
    '###########',
    '###########',
    '###########',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....##.....',
  ],
  U: [
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  V: [
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '.###...###.',
    '.###...###.',
    '..###.###..',
    '..#######..',
    '...#####...',
    '...#####...',
    '....###....',
    '....###....',
    '.....#.....',
  ],
  W: [
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###..#..###',
    '###.###.###',
    '###########',
    '###########',
    '#####.#####',
    '####...####',
    '###.....###',
    '##.......##',
  ],
  X: [
    '###.....###',
    '####...####',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
    '...#####...',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '####...####',
    '###.....###',
    '###.....###',
    '##.......##',
  ],
  Y: [
    '###.....###',
    '####...####',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....##.....',
  ],
  Z: [
    '###########',
    '###########',
    '###########',
    '.......####',
    '......####.',
    '.....####..',
    '....####...',
    '...####....',
    '..####.....',
    '.####......',
    '####.......',
    '###########',
    '###########',
    '##########.',
  ],
  '0': [
    '..#######..',
    '.#########.',
    '###....####',
    '###...#####',
    '###..######',
    '###.###.###',
    '######..###',
    '#####...###',
    '####....###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  '1': [
    '....###....',
    '...####....',
    '..#####....',
    '.######....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '....###....',
    '.#########.',
    '.#########.',
    '.########..',
  ],
  '2': [
    '.#########.',
    '###########',
    '###....####',
    '.......####',
    '......####.',
    '....#####..',
    '...#####...',
    '..####.....',
    '.####......',
    '####.......',
    '###........',
    '###########',
    '###########',
    '##########.',
  ],
  '3': [
    '.#########.',
    '###########',
    '###....####',
    '.......####',
    '.......####',
    '...#######.',
    '...#######.',
    '.......####',
    '........###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  '4': [
    '......####.',
    '.....#####.',
    '....######.',
    '...###.###.',
    '..###..###.',
    '.###...###.',
    '###########',
    '###########',
    '###########',
    '.......###.',
    '.......###.',
    '.......###.',
    '.......###.',
    '.......##..',
  ],
  '5': [
    '###########',
    '###########',
    '###........',
    '###........',
    '#########..',
    '##########.',
    '........###',
    '........###',
    '........###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  '6': [
    '..########.',
    '.#########.',
    '####.......',
    '###........',
    '#########..',
    '##########.',
    '###....####',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '###########',
    '.#########.',
    '..#######..',
  ],
  '7': [
    '###########',
    '###########',
    '###########',
    '.......####',
    '......####.',
    '.....####..',
    '....####...',
    '...####....',
    '...###.....',
    '..###......',
    '..###......',
    '..###......',
    '..###......',
    '..##.......',
  ],
  '8': [
    '.#########.',
    '###########',
    '###.....###',
    '####...####',
    '.#########.',
    '.#########.',
    '####...####',
    '###.....###',
    '###.....###',
    '###.....###',
    '####...####',
    '###########',
    '###########',
    '.#########.',
  ],
  '9': [
    '.#########.',
    '###########',
    '###.....###',
    '###.....###',
    '####...####',
    '.##########',
    '..#########',
    '.......####',
    '.......####',
    '###....####',
    '####..####.',
    '.########..',
    '..######...',
    '...####....',
  ],
  '-': [
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '.#####.',
    '#######',
    '#######',
    '.#####.',
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
  ],
  ':': [
    '.....',
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
    '.....',
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
    '.....',
    '.....',
  ],
  '.': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
  ],
  '!': [
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
  ],
  '/': [
    '.......###.',
    '......####.',
    '......###..',
    '.....####..',
    '.....###...',
    '....####...',
    '....###....',
    '...####....',
    '...###.....',
    '..####.....',
    '..###......',
    '.####......',
    '.###.......',
    '###........',
  ],
  ' ': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ],
};

function measureChunkyTextWidth(text: string, scale: number = 1): number {
  const upper = text.toUpperCase();
  const s = Math.max(0.75, scale);
  const gap = Math.max(1, Math.round(1 * s));
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]!;
    const g = CHUNKY_GLYPHS_11X14[ch];
    const cw = Math.max(1, Math.round((g ? g[0]!.length : 7) * s));
    total += cw + (i + 1 < upper.length ? gap : 0);
  }
  return total;
}

/**
 * Crisp chunky bold black-outlined jagged hand-drawn display text matching
 * 01_title.png, 21_paused.png, 11a_levelup.png & 23_victory.png:
 * - Unselected: exact stone-gray #9c9c9c with rough lower shade & 2px crisp #000000 outline
 * - Hovered/Selected: bright #ffffff (or custom color) with 1px upward pop + 2px #000000 outline
 * - Optional scale (nearest-neighbor 1x rasterized — zero blur!), slimeDrips mode, and per-char tilt!
 */
export function drawChunkyMenuText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  hovered: boolean,
  color?: string,
  opts: {
    slimeDrips?: boolean;
    timeSec?: number;
    align?: 'center' | 'left' | 'right';
    scale?: number;
    tilt?: number;
  } = {},
): { x: number; y: number; w: number; h: number } {
  const upper = text.toUpperCase();
  const s = Math.max(0.75, opts.scale ?? 1);
  const gap = Math.max(1, Math.round(1 * s));
  const totalW = measureChunkyTextWidth(upper, s);
  const h = Math.round(14 * s);
  const align = opts.align ?? 'center';
  const startX =
    align === 'left'
      ? Math.round(cx)
      : align === 'right'
        ? Math.round(cx - totalW)
        : Math.round(cx - totalW * 0.5);
  const popY = hovered ? -1 : 0;
  const baseY = Math.round(y) + popY;
  const tilt = opts.tilt ?? 0;
  const fillCol = color ?? (hovered ? '#ffffff' : '#9c9c9c');
  const shadeCol = opts.slimeDrips
    ? '#2a8c16'
    : color
      ? color
      : hovered
        ? '#e2e2ea'
        : '#84848a';
  const hiCol = opts.slimeDrips ? '#9eff64' : null;

  const paintCharMask = (
    gx0: number,
    gy0: number,
    glyph: readonly string[],
    col: string,
    onlySrcRows?: { min: number; max: number },
  ): void => {
    ctx.fillStyle = col;
    const srcH = glyph.length;
    const srcW = glyph[0]!.length;
    const dstH = Math.max(1, Math.round(srcH * s));
    const dstW = Math.max(1, Math.round(srcW * s));
    const minSR = onlySrcRows ? onlySrcRows.min : 0;
    const maxSR = onlySrcRows ? onlySrcRows.max : srcH - 1;
    for (let dr = 0; dr < dstH; dr++) {
      const sr = Math.min(srcH - 1, Math.floor((dr * srcH) / dstH));
      if (sr < minSR || sr > maxSR) continue;
      const row = glyph[sr]!;
      let dc = 0;
      while (dc < dstW) {
        const sc = Math.min(srcW - 1, Math.floor((dc * srcW) / dstW));
        if (row[sc] === '#') {
          let end = dc + 1;
          while (end < dstW) {
            const nextSc = Math.min(srcW - 1, Math.floor((end * srcW) / dstW));
            if (row[nextSc] !== '#') break;
            end++;
          }
          ctx.fillRect(gx0 + dc, gy0 + dr, end - dc, 1);
          dc = end;
        } else {
          dc++;
        }
      }
    }
  };

  // Pass 1: Thick 2px pure #000000 outline for every character (plus slime drips outline!)
  const outlineOffsets: ReadonlyArray<[number, number]> = [
    [-2, -1], [-2, 0], [-2, 1],
    [2, -1], [2, 0], [2, 1],
    [-1, -2], [0, -2], [1, -2],
    [-1, 2], [0, 2], [1, 2],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];

  const charYOffset = (i: number): number => {
    const wobbleY =
      hovered && opts.timeSec !== undefined
        ? Math.round(Math.sin(opts.timeSec * 14 + i * 1.3) * 0.6)
        : i % 3 === 1
          ? 1
          : i % 5 === 3
            ? -1
            : 0;
    const tiltY = tilt !== 0 ? Math.round((i - (upper.length - 1) * 0.5) * tilt) : 0;
    return wobbleY + tiltY;
  };

  let curX = startX;
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]!;
    const g = CHUNKY_GLYPHS_11X14[ch];
    const cw = Math.max(1, Math.round((g ? g[0]!.length : 7) * s));
    if (g && ch !== ' ') {
      const charY = baseY + charYOffset(i);
      for (const [ox, oy] of outlineOffsets) {
        paintCharMask(curX + ox, charY + oy, g, '#000000');
      }
      if (opts.slimeDrips) {
        const dripH = Math.round((3 + ((i * 5 + 2) % 4)) * s);
        ctx.fillStyle = '#000000';
        ctx.fillRect(curX + 1, charY + h - 1, Math.max(4, Math.round(4 * s)), dripH + 2);
        if (i % 2 === 0) {
          ctx.fillRect(
            curX + cw - Math.max(4, Math.round(4 * s)),
            charY + h - 1,
            Math.max(3, Math.round(3 * s)),
            Math.max(2, dripH - 1) + 2,
          );
        }
      }
    }
    curX += cw + gap;
  }

  // Pass 2: Bold interior fill + rough hand-drawn lower edge shading & optional slime drips
  curX = startX;
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]!;
    const g = CHUNKY_GLYPHS_11X14[ch];
    const cw = Math.max(1, Math.round((g ? g[0]!.length : 7) * s));
    if (g && ch !== ' ') {
      const charY = baseY + charYOffset(i);
      paintCharMask(curX, charY, g, fillCol);
      paintCharMask(curX, charY, g, shadeCol, { min: 11, max: 13 });
      if (hiCol) {
        paintCharMask(curX, charY, g, hiCol, { min: 0, max: 2 });
      }
      if (opts.slimeDrips) {
        const dripH = Math.round((3 + ((i * 5 + 2) % 4)) * s);
        const dripW = Math.max(2, Math.round(2 * s));
        ctx.fillStyle = fillCol;
        ctx.fillRect(curX + 2, charY + h - 1, dripW, dripH);
        ctx.fillStyle = '#a8ff60';
        ctx.fillRect(curX + 2, charY + h + dripH - 2, Math.max(1, dripW - 1), 1);
        if (i % 2 === 0) {
          ctx.fillStyle = shadeCol;
          ctx.fillRect(
            curX + cw - Math.max(3, Math.round(3 * s)),
            charY + h - 1,
            Math.max(1, Math.round(1.5 * s)),
            Math.max(2, dripH - 1),
          );
        }
      }
    }
    curX += cw + gap;
  }

  return { x: startX - 4, y: baseY - 3, w: totalW + 8, h: h + 6 };
}

export interface RunRoadMapInput {
  areaCode: string;
  mutant: MutantId;
  skin: 'a' | 'b';
  loop: number;
  victory?: boolean;
}

/**
 * Authentic Nuclear Throne horizontal progression road map:
 * red visited trail, white unvisited trail, crisp square checkpoint ticks,
 * mutant sprite icon at current area (wearing crown on Victory), and tiny Throne icon at right!
 */
export function drawRunRoadMap(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprites: SpriteRenderer,
  data: UiDataProvider,
  info: RunRoadMapInput,
  cx: number,
  y: number,
): void {
  const mapW = 132;
  const x0 = Math.round(cx - mapW * 0.5);
  const x1 = x0 + mapW;
  const iy = Math.round(y);
  const nodeCount = MAIN_PATH_AREAS.length;
  const progressIdx = info.victory ? nodeCount - 1 : resolveRunProgressIndex(info.areaCode);
  const reachX = Math.round(x0 + (mapW * progressIdx) / Math.max(1, nodeCount - 1));

  // Crisp black outline backing behind rail
  ctx.fillStyle = '#000000';
  ctx.fillRect(x0 - 1, iy - 1, mapW + 2, 3);

  // White unvisited rail
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, iy, mapW, 1);

  // Red visited trail from 1-1 up to current area (exact match to 21_paused.png & 23_victory.png!)
  if (reachX > x0) {
    ctx.fillStyle = '#d82820';
    ctx.fillRect(x0, iy, reachX - x0, 1);
    // Secret area/loop subtle red detour drop line (matches 21_paused.png red angled detour!)
    if (info.areaCode.includes('?') || info.areaCode === 'vault' || info.loop > 0) {
      const dipX = Math.max(x0 + 8, Math.min(reachX - 6, x0 + Math.round(mapW * 0.25)));
      drawPixelLine(ctx, x0, iy, x0, iy + 8, 1);
      drawPixelLine(ctx, x0, iy + 8, dipX, iy, 1);
    }
  }

  // Checkpoint ticks along the road
  for (let n = 0; n < nodeCount - 1; n++) {
    const nx = Math.round(x0 + (mapW * n) / Math.max(1, nodeCount - 1));
    const visited = n <= progressIdx;
    const isMajor = n === 0 || n === 3 || n === 7 || n === 11 || MAIN_PATH_AREAS[n]!.endsWith('-3');
    const sz = isMajor ? 3 : 2;
    const half = Math.floor(sz / 2);
    ctx.fillStyle = '#000000';
    ctx.fillRect(nx - half - 1, iy - half - 1, sz + 2, sz + 2);
    ctx.fillStyle = visited ? '#d82820' : '#ffffff';
    ctx.fillRect(nx - half, iy - half, sz, sz);
  }

  // Tiny Throne icon at far right (x1, iy)
  const throneDrawn = sprites.drawInBox(ctx, 'sprGameOverThrone', 0, x1 - 4, iy - 5, 9, 9, { maxScale: 1 });
  if (!throneDrawn) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x1 - 4, iy - 5, 9, 9);
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(x1 - 3, iy - 4, 7, 7);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x1 - 2, iy - 4, 1, 2);
    ctx.fillRect(x1 + 1, iy - 4, 1, 2);
  }

  // Mutant head/character sprite sitting right on (reachX, iy)
  const mDef = data.getMutant(info.mutant);
  const sprName =
    info.skin === 'b' && mDef.sprites.bIdle && sprites.hasSprite(mDef.sprites.bIdle)
      ? mDef.sprites.bIdle
      : mDef.sprites.idle;

  // Crisp circular-stepped dark ink badge behind mutant head so it pops cleanly
  ctx.fillStyle = '#000000';
  ctx.fillRect(reachX - 7, iy - 6, 14, 12);
  ctx.fillRect(reachX - 6, iy - 7, 12, 14);
  const drewMut = sprites.drawInBox(ctx, sprName, 0, reachX - 8, iy - 8, 16, 16, { maxScale: 1 });
  if (!drewMut) {
    ctx.fillStyle = '#f0c078';
    ctx.fillRect(reachX - 5, iy - 5, 10, 10);
  }

  // Tiny white/gold Victory Crown perched atop mutant head (matches 23_victory.png!)
  if (info.victory) {
    const cx0 = reachX - 4;
    const cy0 = iy - 12;
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx0 - 1, cy0, 10, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx0, cy0 + 2, 8, 3);
    ctx.fillRect(cx0, cy0, 2, 2);
    ctx.fillRect(cx0 + 3, cy0, 2, 2);
    ctx.fillRect(cx0 + 6, cy0, 2, 2);
  }
}

export interface HitRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onActivate: () => MenuAction | null;
  onDrag?: (normX: number) => MenuAction | null;
}

export type UiSfxName = 'sndHover' | 'sndClick' | 'sndClickBack' | 'sndMutHover';

export type MenuAction =
  | { type: 'open_screen'; screen: GameScreen }
  | { type: 'start_run'; mutant: MutantId; skin: 'a' | 'b'; crown: CrownId; useGoldenWeapon: boolean }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'select_mutant'; mutant: MutantId }
  | { type: 'toggle_bskin'; mutant: MutantId }
  | { type: 'cycle_crown'; crown: CrownId }
  | { type: 'toggle_golden'; enabled: boolean }
  | { type: 'pick_mutation'; index: number; mutationId: MutationId }
  | { type: 'pick_ultra'; index: number; ultraId: UltraId }
  | { type: 'update_audio'; partial: Partial<AudioSettings> }
  | { type: 'update_render'; partial: Partial<RenderSettings> }
  | { type: 'update_controls'; partial: Partial<ControlSettings> }
  | { type: 'test_rumble' }
  | { type: 'begin_rebind'; field: keyof KeyBindings }
  | { type: 'cancel_rebind' }
  | { type: 'rebind_key'; field: keyof KeyBindings; code: string }
  | { type: 'reset_keybinds' }
  | { type: 'request_load_local' }
  | { type: 'use_builtin_art' }
  | { type: 'use_local_art' }
  | { type: 'clear_local_cache' }
  | { type: 'ui_sfx'; sound: UiSfxName };

export interface MenuRenderContext {
  screen: GameScreen;
  save: SaveData;
  simState: SimState | null;
  width: number;
  height: number;
  timeSec: number;
  returnScreenFromOptions: GameScreen;
  rebindingField?: keyof KeyBindings | null;
  hasCachedLocal?: boolean;
  hasServerSteam?: boolean;
  assetStatusText?: string;
  assetLoading?: boolean;
  inputMode?: InputDeviceMode;
  gamepadConnected?: boolean;
  gamepadName?: string | null;
  gamepadProfile?: string | null;
  gamepadFamily?: GamepadFamily;
  gamepadDebug?: GamepadDebugSnapshot;
}

export type OptionsTab = 'general' | 'controls' | 'keybinds';

const OPTIONS_TABS: readonly OptionsTab[] = ['general', 'controls', 'keybinds'];
const GENERAL_OPTION_COUNT = 10;
const CONTROLS_OPTION_COUNT = 4;
const KEYBINDS_OPTION_COUNT = 9; // 8 keybinds + reset defaults
const CAMPFIRE_ACTION_COUNT = 5; // skin, crown, gold, go, back

const KEYBIND_LABELS: ReadonlyArray<{ field: keyof KeyBindings; label: string }> = [
  { field: 'up', label: 'MOVE UP' },
  { field: 'down', label: 'MOVE DOWN' },
  { field: 'left', label: 'MOVE LEFT' },
  { field: 'right', label: 'MOVE RIGHT' },
  { field: 'swap', label: 'SWAP WEAPON' },
  { field: 'pickup', label: 'PICKUP / USE' },
  { field: 'activeAlt', label: 'ACTIVE (ALT)' },
  { field: 'pause', label: 'PAUSE / MENU' },
];

/**
 * Actions that already emit their own dedicated NT SFX in GameApp / Sim,
 * so MenuSystem must NOT double-stack a generic sndClick alongside them.
 */
const SELF_SOUNDING_ACTIONS = new Set<MenuAction['type']>([
  'ui_sfx',
  'select_mutant',
  'toggle_bskin',
  'cycle_crown',
  'toggle_golden',
  'start_run',
  'restart',
  'pick_mutation',
  'pick_ultra',
]);

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Escape') return 'ESC';
  if (code === 'Space') return 'SPACE';
  return code.toUpperCase().slice(0, 10);
}

function pointInRegion(x: number, y: number, r: HitRegion): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawPixelBorder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  thickness = 1,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy, iw, thickness);
  ctx.fillRect(ix, iy + ih - thickness, iw, thickness);
  ctx.fillRect(ix, iy, thickness, ih);
  ctx.fillRect(ix + iw - thickness, iy, thickness, ih);
}

/**
 * Authentic Nuclear Throne dark hand-brushed jagged ink-splat backing plate (zero yellow wireframes!).
 */
function drawWastelandPlate(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    fill?: string;
    border?: string;
    borderThickness?: number;
    topAccent?: string;
  } = {},
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  const bt = opts.borderThickness ?? 1;

  ctx.fillStyle = '#000000';
  ctx.fillRect(ix - 2, iy + 3, iw + 4, Math.max(4, ih - 6));
  ctx.fillRect(ix + 5, iy - 2, Math.max(4, iw - 10), ih + 4);
  if (iw >= 50 && ih >= 20) {
    ctx.fillRect(ix - 6, iy + Math.round(ih * 0.20), 7, 3);
    ctx.fillRect(ix + iw - 1, iy + Math.round(ih * 0.16), 8, 3);
    ctx.fillRect(ix - 4, iy + Math.round(ih * 0.74), 5, 2);
    ctx.fillRect(ix + iw - 1, iy + Math.round(ih * 0.78), 6, 2);
    ctx.fillRect(ix - 9, iy + Math.round(ih * 0.21), 2, 1);
    ctx.fillRect(ix + iw + 8, iy + Math.round(ih * 0.17), 2, 2);
  }

  ctx.fillStyle = opts.fill ?? 'rgba(8, 6, 12, 0.90)';
  ctx.fillRect(ix, iy, iw, ih);

  if (opts.topAccent) {
    ctx.fillStyle = opts.topAccent;
    ctx.fillRect(ix + bt, iy + bt, iw - bt * 2, 1);
  }
  if (opts.border) {
    drawPixelBorder(ctx, ix, iy, iw, ih, opts.border, bt);
  }
}

/**
 * Computes evenly spaced arc-length angles around an ellipse so wide 4:3
 * ellipses do not bunch mutants together at the left/right tips.
 */
function computeBalancedEllipseAngles(count: number, rx: number, ry: number, startOffset: number): number[] {
  const samples = 240;
  const cumLen: number[] = [0];
  let prevX = Math.cos(startOffset) * rx;
  let prevY = Math.sin(startOffset) * ry;
  for (let s = 1; s <= samples; s++) {
    const t = startOffset + (s / samples) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    cumLen.push(cumLen[s - 1]! + Math.hypot(x - prevX, y - prevY));
    prevX = x;
    prevY = y;
  }
  const totalLen = cumLen[samples]!;
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / count) * totalLen;
    let lo = 0;
    let hi = samples;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumLen[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    angles.push(startOffset + (lo / samples) * Math.PI * 2);
  }
  return angles;
}

/**
 * Pixel-verified sprBigPortrait frame index:
 * Steam portraits_0.png stores 2 frames per mutant (A-skin even, B-skin odd):
 * (raceIndex - 1) * 2 + (skin === 'b' ? 1 : 0) across all 12 mutants (frames 0..23).
 * Falls back to (raceIndex - 1) for compact 12-frame fallback atlases.
 */
export function computePortraitFrame(
  raceIndex: number,
  skin: 'a' | 'b',
  totalFrames: number = 24,
): number {
  const base = Math.max(0, raceIndex - 1);
  if (totalFrames >= 24) {
    return base * 2 + (skin === 'b' ? 1 : 0);
  }
  return base;
}

/**
 * Title logo intro frame: reveals frames 0..6 then clamps permanently on frame 7
 * (preserved for backwards-compatible exports).
 */
export function computeTitleLogoFrame(timeSec: number, frameCount: number = 8): number {
  const maxFrame = Math.max(0, Math.min(7, frameCount - 1));
  return Math.min(maxFrame, Math.floor(Math.max(0, timeSec) * 12));
}

/**
 * Resolves the final resting corpse frame of a death sprite animation
 * instead of frame 0 (which is often a bright white hurt/death flash).
 */
export function resolveCorpseFrame(frameCount: number): number {
  return Math.max(0, Math.floor(frameCount) - 1);
}

/**
 * Resolves a visible, non-blank, non-white-flash frame index for Game Over killer/corpse portraits.
 */
export function resolveDisplaySpriteFrame(
  sprite: SpriteDef | undefined,
  spriteName: string = '',
): number {
  if (!sprite || sprite.frames.length <= 1) return 0;
  const frames = sprite.frames;
  const isVisible = (idx: number): boolean => {
    const f = frames[idx];
    return Boolean(f && f.srcW > 2 && f.srcH > 2);
  };

  if (/explo|impact|blast/i.test(spriteName)) {
    const preferred = Math.min(3, frames.length - 1);
    if (isVisible(preferred)) return preferred;
    for (let i = Math.min(2, frames.length - 1); i < frames.length; i++) {
      if (isVisible(i)) return i;
    }
    return preferred;
  }

  if (/dead/i.test(spriteName)) {
    for (let i = frames.length - 1; i >= 1; i--) {
      if (isVisible(i)) return i;
    }
    return isVisible(0) ? 0 : Math.max(0, frames.length - 1);
  }

  for (let i = 0; i < frames.length; i++) {
    if (isVisible(i)) return i;
  }
  return 0;
}

export interface CampfireDetailsLayout {
  passiveY: number;
  passiveH: number;
  activeY: number;
  activeH: number;
  tbY: number;
  tbH: number;
  bestY: number;
  totalHeight: number;
  lineSpacing: number;
}

/**
 * Pure dynamic Y layout calculator for Campfire mutant details (PASSIVE, ACTIVE, TB, BEST).
 * Guarantees zero pixel overlap across all 12 mutants in both Steam Pack and Built-In Art bitmap fonts.
 */
export function computeCampfireDetailsLayout(
  fonts: BitmapFontRenderer,
  mutant: Pick<MutantDef, 'passiveDesc' | 'activeDesc' | 'throneButtDesc'>,
  maxWidth: number,
  startY: number,
  maxBottomY: number,
  hasBestLine: boolean,
): CampfireDetailsLayout {
  const font = fonts.getFont('fntSmall');
  const lineH = Math.round((font ? Math.max(1, font.lineHeight) : 8) * (font?.scaleY || 1));

  const measureBlock = (text: string, lineSpacing: number): number => {
    const lines = wrapMarkupText(font, text, maxWidth, 1);
    if (lines.length === 0) return lineH;
    return lineH + Math.max(0, lines.length - 1) * (lineH + lineSpacing);
  };

  const passiveText = `@wPASSIVE: @s${mutant.passiveDesc}`;
  const activeText = `@gACTIVE: @s${mutant.activeDesc}`;
  const tbText = `@pTB: @s${mutant.throneButtDesc}`;

  const tryFit = (lineSpacing: number, gap: number): CampfireDetailsLayout => {
    const passiveH = measureBlock(passiveText, lineSpacing);
    const activeY = startY + passiveH + gap;
    const activeH = measureBlock(activeText, lineSpacing);
    const tbY = activeY + activeH + gap;
    const tbH = measureBlock(tbText, lineSpacing);
    const bestY = tbY + tbH + gap;
    const endY = hasBestLine ? bestY + lineH : tbY + tbH;
    return {
      passiveY: startY,
      passiveH,
      activeY,
      activeH,
      tbY,
      tbH,
      bestY,
      totalHeight: endY - startY,
      lineSpacing,
    };
  };

  const roomy = tryFit(1, 4);
  if (startY + roomy.totalHeight <= maxBottomY) return roomy;
  const compactGap = tryFit(1, 3);
  if (startY + compactGap.totalHeight <= maxBottomY) return compactGap;
  return tryFit(0, 3);
}

/**
 * Cycles target render framerate through 30 -> 60 -> 120 -> 30.
 */
export function cycleTargetFps(current: TargetFps): TargetFps {
  if (current === 30) return 60;
  if (current === 60) return 120;
  return 30;
}

/**
 * Formats the Options screen 3-state FPS toggle button label.
 */
export function formatTargetFpsLabel(targetFps: TargetFps): string {
  if (targetFps === 30) return 'FPS: @y30 CLASSIC';
  if (targetFps === 60) return 'FPS: @g60 SMOOTH';
  return 'FPS: @b120 ULTRA';
}

/**
 * Complete Interactive Canvas UI Screen Controller matching Nuclear Throne 1:1 visual parity:
 * Title (purple portal vortex), Campfire, Level Up / Mutation Select, Ultra Select,
 * Pause (huge portrait + ink splats + road map), Borderless Settings/Options, Game Over, Victory.
 */
export class MenuSystem {
  private bundle: AssetBundle;
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;

  private regions: HitRegion[] = [];
  private hoveredId: string | null = null;
  private focusedIndex = 0;
  private titleSubCol = 0; // 0 = left button, 1 = right button on Title art-pack row
  private campfireRow: 'roster' | 'actions' = 'roster';
  private campfireActionIndex = 3; // 0=skin, 1=crown, 2=gold, 3=go, 4=back
  private pauseInspectIdx = -1; // -1 = none, 0..muts-1 = mutation, muts = ultra
  private optionsTab: OptionsTab = 'general';
  private activeDragRegionId: string | null = null;
  private lastScreen: GameScreen | null = null;
  private renderTimeSec = 0;

  constructor(bundle: AssetBundle, data: UiDataProvider = DEFAULT_UI_DATA_PROVIDER) {
    this.bundle = bundle;
    this.sprites = new SpriteRenderer(bundle);
    this.fonts = new BitmapFontRenderer(bundle);
    this.data = data;
  }

  setBundle(bundle: AssetBundle): void {
    this.bundle = bundle;
    this.sprites.setBundle(bundle);
    this.fonts.setBundle(bundle);
  }

  setDataProvider(data: UiDataProvider): void {
    this.data = data;
  }

  private get isSteamMode(): boolean {
    return this.bundle.sourceMode === 'steam';
  }

  getHitRegions(): readonly HitRegion[] {
    return this.regions;
  }

  getHoveredRegionId(): string | null {
    return this.hoveredId;
  }

  getFocusedIndex(): number {
    return this.focusedIndex;
  }

  getOptionsTab(): OptionsTab {
    return this.optionsTab;
  }

  setOptionsTab(tab: OptionsTab): void {
    this.optionsTab = tab;
    this.focusedIndex = 0;
  }

  getCampfireFocus(): { row: 'roster' | 'actions'; actionIndex: number } {
    return { row: this.campfireRow, actionIndex: this.campfireActionIndex };
  }

  getPauseInspectIndex(): number {
    return this.pauseInspectIdx;
  }

  /**
   * Draws a sprite at crisp integer scale (1x or optional 2x) centered inside a box.
   */
  private drawSpriteIntegerCentered(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    spriteName: string,
    frame: number,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
    opts: { alpha?: number; flipX?: boolean; tintColor?: string; allow2x?: boolean } = {},
  ): boolean {
    const spr = this.sprites.getSprite(spriteName);
    if (!spr || spr.frames.length === 0 || !this.sprites.hasSprite(spriteName)) return false;
    const fIdx = Math.max(0, Math.min(spr.frames.length - 1, Math.floor(frame)));
    const rect = spr.frames[fIdx];
    if (!rect || rect.srcW <= 0 || rect.srcH <= 0) return false;

    const scale =
      opts.allow2x && rect.targetW * 2 <= boxW && rect.targetH * 2 <= boxH ? 2 : 1;
    const drawW = rect.targetW * scale;
    const drawH = rect.targetH * scale;

    if (drawW <= boxW && drawH <= boxH) {
      const left = Math.round(boxX + (boxW - drawW) * 0.5);
      const top = Math.round(boxY + (boxH - drawH) * 0.5);
      const drawX = left - (rect.targetX - spr.originX) * scale;
      const drawY = top - (rect.targetY - spr.originY) * scale;
      return this.sprites.draw(ctx, spriteName, drawX, drawY, {
        frame: fIdx,
        scaleX: scale,
        scaleY: scale,
        flipX: opts.flipX,
        alpha: opts.alpha,
        tintColor: opts.tintColor,
        pixelSnap: true,
      });
    }

    return this.sprites.drawInBox(ctx, spriteName, fIdx, boxX, boxY, boxW, boxH, {
      alpha: opts.alpha,
      flipX: opts.flipX,
      tintColor: opts.tintColor,
      maxScale: 1,
    });
  }

  /**
   * Processes pointer hover/click/drag, touch taps, and full keyboard/gamepad navigation.
   */
  update(input: MenuInputSnapshot, ctx: MenuRenderContext): MenuAction[] {
    const actions: MenuAction[] = [];

    if (this.lastScreen !== ctx.screen) {
      this.lastScreen = ctx.screen;
      this.focusedIndex = 0;
      this.titleSubCol = 0;
      this.campfireRow = 'roster';
      this.campfireActionIndex = 3;
      this.pauseInspectIdx = -1;
      this.activeDragRegionId = null;
      this.hoveredId = null;
    }

    if (ctx.rebindingField && input.capturedKeyCode) {
      actions.push({
        type: 'rebind_key',
        field: ctx.rebindingField,
        code: input.capturedKeyCode,
      });
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
      return actions;
    }

    if (ctx.rebindingField && input.back) {
      actions.push({ type: 'cancel_rebind' });
      actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
      return actions;
    }

    const hadDirectionalNav =
      input.navUp ||
      input.navDown ||
      input.navLeft ||
      input.navRight ||
      Boolean(input.prevTab) ||
      Boolean(input.nextTab);
    if (hadDirectionalNav) {
      this.hoveredId = null;
    }

    const px = input.pointer.logicalX;
    const py = input.pointer.logicalY;
    const pointerShouldHitTest =
      input.pointer.moved === undefined ||
      input.pointer.moved ||
      input.pointer.clicked ||
      input.pointer.down;

    let hoveredRegion: HitRegion | null = null;
    if (pointerShouldHitTest) {
      let nextHover: string | null = null;
      for (let i = this.regions.length - 1; i >= 0; i--) {
        const r = this.regions[i]!;
        if (pointInRegion(px, py, r)) {
          nextHover = r.id;
          hoveredRegion = r;
          break;
        }
      }

      if (nextHover !== this.hoveredId && !hadDirectionalNav) {
        this.hoveredId = nextHover;
        if (nextHover) {
          const isMutationCard =
            nextHover.startsWith('mut_card_') || nextHover.startsWith('ultra_card_');
          actions.push({
            type: 'ui_sfx',
            sound: isMutationCard ? 'sndMutHover' : 'sndHover',
          });
        }
      }
    }

    if (!input.pointer.down) {
      this.activeDragRegionId = null;
    }
    if (input.pointer.clicked && hoveredRegion?.onDrag) {
      this.activeDragRegionId = hoveredRegion.id;
    }
    if (input.pointer.down && this.activeDragRegionId) {
      const dragReg = this.regions.find((r) => r.id === this.activeDragRegionId);
      if (dragReg && dragReg.onDrag && dragReg.w > 0) {
        const norm = Math.max(0, Math.min(1, (px - dragReg.x) / dragReg.w));
        const act = dragReg.onDrag(norm);
        if (act) actions.push(act);
      }
    } else if (input.pointer.clicked && hoveredRegion) {
      const act = hoveredRegion.onActivate();
      if (act) {
        actions.push(act);
        if (!SELF_SOUNDING_ACTIONS.has(act.type)) {
          const isBackBtn = hoveredRegion.id === 'camp_back' || hoveredRegion.id === 'opt_back';
          actions.push({ type: 'ui_sfx', sound: isBackBtn ? 'sndClickBack' : 'sndClick' });
        }
      }
    }

    this.handleNavigation(input, ctx, actions);

    return actions;
  }

  private cycleCrownFrom(current: CrownId, delta: number): CrownId {
    const idx = Math.max(0, ALL_CROWN_IDS.indexOf(current));
    return ALL_CROWN_IDS[(idx + delta + ALL_CROWN_IDS.length) % ALL_CROWN_IDS.length]!;
  }

  private handleNavigation(
    input: MenuInputSnapshot,
    ctx: MenuRenderContext,
    actions: MenuAction[],
  ): void {
    const mutants = this.data.getMutants();

    switch (ctx.screen) {
      case 'title': {
        const hasSplitArtRow =
          !ctx.assetLoading &&
          (this.bundle.sourceMode === 'steam' || Boolean(ctx.hasCachedLocal || ctx.hasServerSteam));

        if (input.navUp) {
          this.focusedIndex = (this.focusedIndex - 1 + 3) % 3;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navDown) {
          this.focusedIndex = (this.focusedIndex + 1) % 3;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 2 && hasSplitArtRow && (input.navLeft || input.navRight)) {
          this.titleSubCol = this.titleSubCol === 0 ? 1 : 0;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        }

        if (input.confirm) {
          if (this.focusedIndex === 0) {
            actions.push({ type: 'open_screen', screen: 'campfire' });
          } else if (this.focusedIndex === 1) {
            actions.push({ type: 'open_screen', screen: 'options' });
          } else if (hasSplitArtRow && this.titleSubCol === 1) {
            actions.push({ type: 'request_load_local' });
          } else if (this.bundle.sourceMode === 'steam') {
            actions.push({ type: 'use_builtin_art' });
          } else if (ctx.hasCachedLocal || ctx.hasServerSteam) {
            actions.push({ type: 'use_local_art' });
          } else {
            actions.push({ type: 'request_load_local' });
          }
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }
        break;
      }

      case 'campfire': {
        const curIdx = Math.max(0, mutants.findIndex((m) => m.id === ctx.save.selectedMutant));
        const selectedId = ctx.save.selectedMutant;
        const hasGold = Boolean(ctx.save.mutants[selectedId]?.goldenWeapon) || selectedId === 'yv';

        if (input.prevTab) {
          actions.push({ type: 'toggle_bskin', mutant: selectedId });
        }
        if (input.nextTab) {
          actions.push({ type: 'cycle_crown', crown: this.cycleCrownFrom(ctx.save.selectedCrown, 1) });
        }
        if (input.secondary && hasGold) {
          actions.push({ type: 'toggle_golden', enabled: !ctx.save.useGoldenWeapon });
        }

        if (input.navUp && this.campfireRow === 'roster') {
          this.campfireRow = 'actions';
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navDown && this.campfireRow === 'actions') {
          this.campfireRow = 'roster';
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.campfireRow === 'roster') {
          if (input.navLeft) {
            const next = mutants[(curIdx - 1 + mutants.length) % mutants.length]!;
            actions.push({ type: 'select_mutant', mutant: next.id });
          } else if (input.navRight) {
            const next = mutants[(curIdx + 1) % mutants.length]!;
            actions.push({ type: 'select_mutant', mutant: next.id });
          }
        } else {
          if (input.navLeft) {
            this.campfireActionIndex =
              (this.campfireActionIndex - 1 + CAMPFIRE_ACTION_COUNT) % CAMPFIRE_ACTION_COUNT;
            actions.push({ type: 'ui_sfx', sound: 'sndHover' });
          } else if (input.navRight) {
            this.campfireActionIndex = (this.campfireActionIndex + 1) % CAMPFIRE_ACTION_COUNT;
            actions.push({ type: 'ui_sfx', sound: 'sndHover' });
          }
        }

        if (input.confirm) {
          if (this.campfireRow === 'actions') {
            switch (this.campfireActionIndex) {
              case 0:
                actions.push({ type: 'toggle_bskin', mutant: selectedId });
                break;
              case 1:
                actions.push({
                  type: 'cycle_crown',
                  crown: this.cycleCrownFrom(ctx.save.selectedCrown, 1),
                });
                break;
              case 2:
                if (hasGold) {
                  actions.push({ type: 'toggle_golden', enabled: !ctx.save.useGoldenWeapon });
                }
                break;
              case 3:
                actions.push({
                  type: 'start_run',
                  mutant: selectedId,
                  skin: ctx.save.selectedSkins[selectedId] ?? 'a',
                  crown: ctx.save.selectedCrown,
                  useGoldenWeapon: hasGold && ctx.save.useGoldenWeapon,
                });
                break;
              case 4:
                actions.push({ type: 'open_screen', screen: 'title' });
                actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
                break;
            }
          } else {
            actions.push({
              type: 'start_run',
              mutant: selectedId,
              skin: ctx.save.selectedSkins[selectedId] ?? 'a',
              crown: ctx.save.selectedCrown,
              useGoldenWeapon: hasGold && ctx.save.useGoldenWeapon,
            });
          }
        } else if (input.back) {
          actions.push({ type: 'open_screen', screen: 'title' });
          actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
        }
        break;
      }

      case 'mutation_select': {
        const rawList = ctx.simState?.pendingMutations ?? [];
        const list = rawList.length > 0 ? rawList : FALLBACK_MUTATION_DECK;
        if (input.selectIndex !== undefined && input.selectIndex < list.length) {
          actions.push({
            type: 'pick_mutation',
            index: input.selectIndex,
            mutationId: list[input.selectIndex]!,
          });
          break;
        }
        if (input.navLeft) {
          this.focusedIndex = (this.focusedIndex - 1 + list.length) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndMutHover' });
        } else if (input.navRight) {
          this.focusedIndex = (this.focusedIndex + 1) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndMutHover' });
        } else if (input.confirm) {
          const idx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));
          actions.push({ type: 'pick_mutation', index: idx, mutationId: list[idx]! });
        }
        break;
      }

      case 'ultra_select': {
        const list = ctx.simState?.pendingUltras ?? [];
        if (list.length === 0) break;
        if (input.selectIndex !== undefined && input.selectIndex < list.length) {
          actions.push({
            type: 'pick_ultra',
            index: input.selectIndex,
            ultraId: list[input.selectIndex]!,
          });
          break;
        }
        if (input.navLeft || input.navRight) {
          this.focusedIndex = (this.focusedIndex + 1) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndMutHover' });
        } else if (input.confirm) {
          const idx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));
          actions.push({ type: 'pick_ultra', index: idx, ultraId: list[idx]! });
        }
        break;
      }

      case 'paused': {
        const ownedCount =
          (ctx.simState?.player.mutations.length ?? 0) + (ctx.simState?.player.ultra ? 1 : 0);

        if (input.back) {
          actions.push({ type: 'resume' });
          actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
        } else if (input.retry) {
          actions.push({ type: 'restart' });
        } else if (input.navUp) {
          this.focusedIndex = (this.focusedIndex - 1 + 4) % 4;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navDown) {
          this.focusedIndex = (this.focusedIndex + 1) % 4;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if ((input.navLeft || input.navRight) && ownedCount > 0) {
          if (this.pauseInspectIdx < 0) {
            this.pauseInspectIdx = input.navRight ? 0 : ownedCount - 1;
          } else {
            const delta = input.navRight ? 1 : -1;
            const next = this.pauseInspectIdx + delta;
            this.pauseInspectIdx =
              next < 0 ? ownedCount - 1 : next >= ownedCount ? 0 : next;
          }
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.confirm) {
          const map: MenuAction[] = [
            { type: 'resume' },
            { type: 'open_screen', screen: 'options' },
            { type: 'restart' },
            { type: 'open_screen', screen: 'campfire' },
          ];
          const chosen = map[this.focusedIndex] ?? { type: 'resume' };
          actions.push(chosen);
          if (!SELF_SOUNDING_ACTIONS.has(chosen.type)) {
            actions.push({ type: 'ui_sfx', sound: 'sndClick' });
          }
        }
        break;
      }

      case 'options': {
        this.handleOptionsNavigation(input, ctx, actions);
        break;
      }

      case 'game_over':
      case 'victory': {
        if (input.navLeft || input.navRight || input.navUp || input.navDown) {
          this.focusedIndex = this.focusedIndex === 0 ? 1 : 0;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.retry) {
          actions.push({ type: 'restart' });
        } else if (input.confirm) {
          if (this.focusedIndex === 1) {
            actions.push({ type: 'open_screen', screen: 'campfire' });
            actions.push({ type: 'ui_sfx', sound: 'sndClick' });
          } else {
            actions.push({ type: 'restart' });
          }
        } else if (input.back) {
          actions.push({ type: 'open_screen', screen: 'campfire' });
          actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
        }
        break;
      }

      default:
        break;
    }
  }

  private handleOptionsNavigation(
    input: MenuInputSnapshot,
    ctx: MenuRenderContext,
    actions: MenuAction[],
  ): void {
    if (ctx.rebindingField) return;

    if (input.back) {
      actions.push({ type: 'open_screen', screen: ctx.returnScreenFromOptions });
      actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
      return;
    }

    if (input.prevTab || input.nextTab) {
      const curTabIdx = OPTIONS_TABS.indexOf(this.optionsTab);
      const delta = input.nextTab ? 1 : -1;
      const nextTab = OPTIONS_TABS[(curTabIdx + delta + OPTIONS_TABS.length) % OPTIONS_TABS.length]!;
      this.optionsTab = nextTab;
      this.focusedIndex = 0;
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
      return;
    }

    const { save } = ctx;

    if (this.optionsTab === 'general') {
      const count = GENERAL_OPTION_COUNT;
      if (input.navUp) {
        this.focusedIndex = (this.focusedIndex - 1 + count) % count;
        actions.push({ type: 'ui_sfx', sound: 'sndHover' });
      } else if (input.navDown) {
        this.focusedIndex = (this.focusedIndex + 1) % count;
        actions.push({ type: 'ui_sfx', sound: 'sndHover' });
      }

      const stepSlider = (cur: number, delta: number): number =>
        Math.round(Math.max(0, Math.min(1, cur + delta)) * 20) / 20;

      if (input.navLeft || input.navRight) {
        const dir = input.navRight ? 1 : -1;
        if (this.focusedIndex === 0) {
          actions.push({ type: 'update_render', partial: { widescreen: !save.render.widescreen } });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 1) {
          const curFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
          const nextFps = cycleTargetFps(curFps);
          actions.push({
            type: 'update_render',
            partial: { targetFps: nextFps, classic30Fps: nextFps === 30 },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 2) {
          actions.push({
            type: 'update_render',
            partial: { crosshairStyle: (save.render.crosshairStyle + dir + 9) % 9 },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 3) {
          actions.push({ type: 'update_render', partial: { showFps: !save.render.showFps } });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 4) {
          actions.push({ type: 'update_audio', partial: { muted: !save.audio.muted } });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 5) {
          actions.push({
            type: 'update_render',
            partial: { screenShakeScale: stepSlider(save.render.screenShakeScale, dir * 0.05) },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 6) {
          actions.push({
            type: 'update_audio',
            partial: { masterVolume: stepSlider(save.audio.masterVolume, dir * 0.05) },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 7) {
          actions.push({
            type: 'update_audio',
            partial: { sfxVolume: stepSlider(save.audio.sfxVolume, dir * 0.05) },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 8) {
          actions.push({
            type: 'update_audio',
            partial: { musicVolume: stepSlider(save.audio.musicVolume, dir * 0.05) },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 9) {
          actions.push({
            type: 'update_audio',
            partial: { ambienceVolume: stepSlider(save.audio.ambienceVolume, dir * 0.05) },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        }
      }

      if (input.confirm) {
        if (this.focusedIndex === 0) {
          actions.push({ type: 'update_render', partial: { widescreen: !save.render.widescreen } });
        } else if (this.focusedIndex === 1) {
          const curFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
          const nextFps = cycleTargetFps(curFps);
          actions.push({
            type: 'update_render',
            partial: { targetFps: nextFps, classic30Fps: nextFps === 30 },
          });
        } else if (this.focusedIndex === 2) {
          actions.push({
            type: 'update_render',
            partial: { crosshairStyle: (save.render.crosshairStyle + 1) % 9 },
          });
        } else if (this.focusedIndex === 3) {
          actions.push({ type: 'update_render', partial: { showFps: !save.render.showFps } });
        } else if (this.focusedIndex === 4) {
          actions.push({ type: 'update_audio', partial: { muted: !save.audio.muted } });
        }
        actions.push({ type: 'ui_sfx', sound: 'sndClick' });
      }
      return;
    }

    if (this.optionsTab === 'controls') {
      if (input.tertiary) {
        actions.push({ type: 'test_rumble' });
        actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        return;
      }
      const count = CONTROLS_OPTION_COUNT;
      if (input.navUp) {
        this.focusedIndex = (this.focusedIndex - 1 + count) % count;
        actions.push({ type: 'ui_sfx', sound: 'sndHover' });
      } else if (input.navDown) {
        this.focusedIndex = (this.focusedIndex + 1) % count;
        actions.push({ type: 'ui_sfx', sound: 'sndHover' });
      }

      const controls = save.controls;
      if (input.navLeft || input.navRight) {
        const dir = input.navRight ? 1 : -1;
        if (this.focusedIndex === 0) {
          actions.push({
            type: 'update_controls',
            partial: { gamepadAimAssist: !controls.gamepadAimAssist },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 1) {
          actions.push({
            type: 'update_controls',
            partial: { gamepadRumble: !controls.gamepadRumble },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (this.focusedIndex === 2) {
          const nextDz =
            Math.round(
              Math.max(
                MIN_GAMEPAD_DEADZONE,
                Math.min(MAX_GAMEPAD_DEADZONE, controls.gamepadDeadzone + dir * 0.02),
              ) * 100,
            ) / 100;
          actions.push({ type: 'update_controls', partial: { gamepadDeadzone: nextDz } });
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex === 3) {
          actions.push({
            type: 'update_controls',
            partial: { touchMode: controls.touchMode === 'auto' ? 'off' : 'auto' },
          });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }
      } else if (input.confirm) {
        if (this.focusedIndex === 0) {
          actions.push({
            type: 'update_controls',
            partial: { gamepadAimAssist: !controls.gamepadAimAssist },
          });
        } else if (this.focusedIndex === 1) {
          actions.push({
            type: 'update_controls',
            partial: { gamepadRumble: !controls.gamepadRumble },
          });
        } else if (this.focusedIndex === 2) {
          const nextDz =
            controls.gamepadDeadzone >= MAX_GAMEPAD_DEADZONE
              ? MIN_GAMEPAD_DEADZONE
              : Math.round(Math.min(MAX_GAMEPAD_DEADZONE, controls.gamepadDeadzone + 0.04) * 100) /
                100;
          actions.push({ type: 'update_controls', partial: { gamepadDeadzone: nextDz } });
        } else if (this.focusedIndex === 3) {
          actions.push({
            type: 'update_controls',
            partial: { touchMode: controls.touchMode === 'auto' ? 'off' : 'auto' },
          });
        }
        actions.push({ type: 'ui_sfx', sound: 'sndClick' });
      }
      return;
    }

    // Keybinds tab (0..7 rows + 8 = Reset Defaults)
    const count = KEYBINDS_OPTION_COUNT;
    if (input.navUp) {
      this.focusedIndex = (this.focusedIndex - 1 + count) % count;
      actions.push({ type: 'ui_sfx', sound: 'sndHover' });
    } else if (input.navDown) {
      this.focusedIndex = (this.focusedIndex + 1) % count;
      actions.push({ type: 'ui_sfx', sound: 'sndHover' });
    }

    if (input.confirm) {
      if (this.focusedIndex === count - 1) {
        actions.push({ type: 'reset_keybinds' });
      } else {
        const entry = KEYBIND_LABELS[this.focusedIndex];
        if (entry) {
          actions.push({ type: 'begin_rebind', field: entry.field });
        }
      }
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
    }
  }

  /**
   * Renders the active menu screen and populates this.regions for exact hit-testing.
   */
  render(
    canvasCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    ctx: MenuRenderContext,
  ): void {
    this.regions = [];
    this.renderTimeSec = ctx.timeSec;
    canvasCtx.imageSmoothingEnabled = false;

    switch (ctx.screen) {
      case 'title':
        this.renderTitleScreen(canvasCtx, ctx);
        break;
      case 'campfire':
        this.renderCampfireScreen(canvasCtx, ctx);
        break;
      case 'mutation_select':
        this.renderMutationSelect(canvasCtx, ctx);
        break;
      case 'ultra_select':
        this.renderUltraSelect(canvasCtx, ctx);
        break;
      case 'paused':
        this.renderPauseOverlay(canvasCtx, ctx);
        break;
      case 'options':
        this.renderOptionsScreen(canvasCtx, ctx);
        break;
      case 'game_over':
        this.renderEndScreen(canvasCtx, ctx, false);
        break;
      case 'victory':
        this.renderEndScreen(canvasCtx, ctx, true);
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Reusable Nuclear Throne Crisp Pixel UI Helpers
  // --------------------------------------------------------------------------

  private drawButton(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onActivate: () => MenuAction | null,
    opts: { accent?: string; focused?: boolean; font?: string; labelOffsetX?: number } = {},
  ): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(w);
    const ih = Math.round(h);
    const isFocused = Boolean(opts.focused);
    const hovered = this.hoveredId === id || isFocused;
    const accent = opts.accent ?? '#ffffff';

    ctx.fillStyle = '#000000';
    ctx.fillRect(ix - 2, iy + 2, iw + 4, Math.max(2, ih - 4));
    ctx.fillRect(ix + 1, iy + ih, iw - 2, 1);
    if (hovered) {
      ctx.fillRect(ix - 5, iy + Math.floor(ih * 0.25), 5, 3);
      ctx.fillRect(ix + iw, iy + Math.floor(ih * 0.62), 6, 3);
    }

    ctx.fillStyle = hovered ? 'rgba(18, 15, 22, 0.96)' : 'rgba(8, 6, 12, 0.88)';
    ctx.fillRect(ix, iy, iw, ih);
    drawPixelBorder(ctx, ix, iy, iw, ih, hovered ? accent : '#342e3e', 1);

    if (hovered) {
      ctx.fillStyle = accent;
      ctx.fillRect(ix + 2, iy + 2, 2, ih - 4);
    }

    this.fonts.draw(
      ctx,
      label,
      ix + Math.floor(iw * 0.5) + (opts.labelOffsetX ?? 0),
      iy + Math.floor(ih * 0.5),
      opts.font ?? 'fntM1',
      {
        align: 'center',
        baseline: 'middle',
        color: hovered ? '#ffffff' : '#b8b6c2',
        outline: true,
      },
    );

    this.regions.push({ id, x: ix, y: iy, w: iw, h: ih, onActivate });
  }

  /**
   * Renders a clickable chunky Nuclear Throne display menu item (zero rectangular button frames!).
   */
  private drawChunkyButton(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    cx: number,
    y: number,
    label: string,
    onActivate: () => MenuAction | null,
    opts: {
      focused?: boolean;
      align?: 'center' | 'left' | 'right';
      color?: string;
      scale?: number;
      tilt?: number;
    } = {},
  ): void {
    const hovered = this.hoveredId === id || Boolean(opts.focused);
    const bounds = drawChunkyMenuText(ctx, label, cx, y, hovered, opts.color, {
      timeSec: this.renderTimeSec,
      align: opts.align ?? 'center',
      scale: opts.scale,
      tilt: opts.tilt,
    });
    this.regions.push({
      id,
      x: bounds.x - 4,
      y: bounds.y - 2,
      w: bounds.w + 8,
      h: bounds.h + 4,
      onActivate,
    });
  }

  /**
   * Borderless Nuclear Throne Video/Settings toggle row (matches 22_settings_video.png!).
   */
  private drawSettingsToggleRow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    labelX: number,
    valueX: number,
    y: number,
    rowW: number,
    label: string,
    valueText: string,
    onActivate: () => MenuAction | null,
    opts: { focused?: boolean; afterDraw?: (valRightX: number, rowY: number) => void } = {},
  ): void {
    const hovered = this.hoveredId === id || Boolean(opts.focused);
    if (hovered) {
      drawInkSplatBanner(ctx, labelX - 6, y - 1, rowW + 12, 12, label.length * 7 + y);
    }

    this.fonts.draw(ctx, label, labelX, y + 1, 'fntM1', {
      color: hovered ? '#ffffff' : '#969696',
      outline: true,
    });

    const valRes = this.fonts.draw(ctx, valueText, valueX, y + 1, 'fntM1', {
      color: hovered ? '#ffffff' : '#969696',
      outline: true,
    });

    opts.afterDraw?.(valueX + valRes.width, y);

    this.regions.push({
      id,
      x: labelX - 6,
      y: y - 2,
      w: rowW + 12,
      h: 14,
      onActivate,
    });
  }

  /**
   * Borderless Nuclear Throne green-filled slider row matching `FREEZE FRAMES  [80% ====|]` in 22_settings_video.png!
   */
  private drawSettingsSliderRow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    labelX: number,
    barX: number,
    y: number,
    rowW: number,
    label: string,
    value: number,
    onChange: (val: number) => MenuAction,
    opts: { focused?: boolean; valueText?: string } = {},
  ): void {
    const hovered = this.hoveredId === id || this.activeDragRegionId === id || Boolean(opts.focused);
    const clamped = Math.max(0, Math.min(1, value));
    const barW = 78;
    const barH = 9;
    const barY = Math.round(y + 1);

    if (hovered) {
      drawInkSplatBanner(ctx, labelX - 6, y - 1, rowW + 12, 12, label.length * 11 + y);
    }

    this.fonts.draw(ctx, label, labelX, y + 1, 'fntM1', {
      color: hovered ? '#ffffff' : '#969696',
      outline: true,
    });

    // Black ink backing strip behind slider bar
    drawInkSplatBanner(ctx, barX, barY, barW, barH, y + 5);

    // Bright Nuclear Throne green filled slider bar (#44d844) + crisp white vertical thumb bar!
    const fillW = Math.round(barW * clamped);
    if (fillW > 0) {
      ctx.fillStyle = hovered ? '#54f054' : '#44d844';
      ctx.fillRect(barX, barY, fillW, barH);
      ctx.fillStyle = '#88ff78';
      ctx.fillRect(barX, barY, fillW, 1);
    }

    // Crisp white right-edge vertical slider handle bar (exact match to 22_settings_video.png!)
    const thumbX = Math.max(barX, Math.min(barX + barW - 3, barX + fillW - 2));
    ctx.fillStyle = '#000000';
    ctx.fillRect(thumbX - 1, barY - 1, 5, barH + 2);
    ctx.fillStyle = hovered ? '#ffffff' : '#d8d8de';
    ctx.fillRect(thumbX, barY, 3, barH);

    // Crisp white-outlined percentage sitting cleanly over the bar!
    const pct = opts.valueText ?? `${Math.round(clamped * 100)}%`;
    this.fonts.draw(ctx, pct, barX + 3, barY + 1, 'fntM1', {
      color: '#ffffff',
      outline: true,
    });

    this.regions.push({
      id,
      x: barX - 4,
      y: y - 2,
      w: barW + 8,
      h: 14,
      onActivate: () => onChange(clamped),
      onDrag: (normX: number) => onChange(Math.round(normX * 20) / 20),
    });
  }

  /**
   * Draws top-right owned mutations + ultra + crown icons (used on Pause, Level Up, Victory, Game Over).
   */
  private drawTopRightHudIcons(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    simState: SimState | null,
    width: number,
    opts: { interactivePause?: boolean } = {},
  ): void {
    if (!simState) return;
    const iconSize = 16;
    const stride = 18;
    let cursorRight = width - 4;
    const topY = 4;

    if (simState.crown !== 'none') {
      const cDef = this.data.getCrown(simState.crown);
      const x = cursorRight - iconSize;
      this.drawSpriteIntegerCentered(ctx, cDef.spriteIdle, 0, x, topY, iconSize, iconSize);
      cursorRight -= stride;
    }

    const muts = simState.player.mutations;
    const mutant = this.data.getMutant(simState.player.mutant);

    if (simState.player.ultra) {
      const uDef = this.data.getUltra(simState.player.ultra);
      const egHudDef = this.sprites.getSprite('sprEGIconHUD');
      const uFrame = uDef
        ? computeUltraIconFrame(mutant.raceIndex, uDef.slot, egHudDef?.frames.length ?? 24)
        : 0;
      const x = cursorRight - iconSize;
      const rid = 'pause_ultra';
      const idx = muts.length;
      if (opts.interactivePause) {
        const hovered = this.hoveredId === rid;
        if (hovered) this.pauseInspectIdx = idx;
        if (hovered || this.pauseInspectIdx === idx) {
          drawPixelBorder(ctx, x - 1, topY - 1, iconSize + 2, iconSize + 2, '#ffe047', 1);
        }
        this.regions.push({
          id: rid,
          x: x - 1,
          y: topY - 1,
          w: iconSize + 2,
          h: iconSize + 2,
          onActivate: () => {
            this.pauseInspectIdx = idx;
            return { type: 'ui_sfx', sound: 'sndHover' };
          },
        });
      }
      const drew = uDef
        ? this.drawSpriteIntegerCentered(ctx, 'sprEGIconHUD', uFrame, x, topY, iconSize, iconSize)
        : false;
      if (!drew) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, topY, iconSize, iconSize);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 2, topY + 2, iconSize - 4, iconSize - 4);
      }
      cursorRight -= stride;
    }

    for (let i = 0; i < muts.length; i++) {
      const def = this.data.getMutation(muts[i]!);
      const x = cursorRight - iconSize;
      if (x < 120) break;
      const rid = `pause_mut_${i}`;
      if (opts.interactivePause) {
        const hovered = this.hoveredId === rid;
        if (hovered) this.pauseInspectIdx = i;
        if (hovered || this.pauseInspectIdx === i) {
          drawPixelBorder(ctx, x - 1, topY - 1, iconSize + 2, iconSize + 2, '#58f048', 1);
        }
        this.regions.push({
          id: rid,
          x: x - 1,
          y: topY - 1,
          w: iconSize + 2,
          h: iconSize + 2,
          onActivate: () => {
            this.pauseInspectIdx = i;
            return { type: 'ui_sfx', sound: 'sndHover' };
          },
        });
      }
      const drew = def
        ? this.drawSpriteIntegerCentered(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, x, topY, iconSize, iconSize)
        : false;
      if (!drew) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, topY, iconSize, iconSize);
        ctx.fillStyle = '#48e048';
        ctx.fillRect(x + 2, topY + 2, iconSize - 4, iconSize - 4);
      }
      cursorRight -= stride;
    }
  }

  // --------------------------------------------------------------------------
  // 1. TITLE SCREEN (RESTORED 9a554e6 WASTELAND + BIG KRUNKED THRONE EMBLEM!)
  // --------------------------------------------------------------------------

  /**
   * Bold Nuclear Throne wasteland menu entry for the Title Screen:
   * renders Steam sprMainMenuSplat or crisp jagged pixel accent splat + chevron pointers on hover/focus.
   */
  private drawTitleMenuItem(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    cx: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onActivate: () => MenuAction | null,
    opts: { accent: string; focused: boolean },
  ): void {
    const ix = Math.round(cx - w * 0.5);
    const iy = Math.round(y);
    const hovered = this.hoveredId === id || opts.focused;

    if (hovered) {
      const hasSplat = this.isSteamMode && this.sprites.hasSprite('sprMainMenuSplat');
      if (hasSplat) {
        // sprMainMenuSplat frame 3 (155x53, orig=(60,34)) -> center cleanly behind PLAY/OPTIONS
        this.sprites.draw(ctx, 'sprMainMenuSplat', cx - 14, iy + Math.floor(h * 0.5) + 3, {
          frame: 3,
          alpha: 0.92,
          pixelSnap: true,
        });
      } else {
        // Sweeping dynamic Vlambeer/Nuclear Throne jagged black ink brush-splat (ZERO boxy rectangle!)
        ctx.fillStyle = '#07050c';
        // Core sweeping brushstroke body
        ctx.fillRect(ix - 2, iy + 2, w + 6, h - 4);
        ctx.fillRect(ix + 8, iy, w - 12, h);
        // Sweeping tapered horizontal ink tails & brush slashes
        ctx.fillRect(ix - 18, iy + 5, w + 40, 4);
        ctx.fillRect(ix - 26, iy + 10, w + 56, 4);
        ctx.fillRect(ix - 12, iy + 15, w + 34, 3);
        ctx.fillRect(ix + 14, iy - 2, w - 26, 2);
        ctx.fillRect(ix + 4, iy + h, w - 18, 2);
        // Raw ink splatter flecks flying off right & left tips
        ctx.fillRect(ix - 31, iy + 11, 3, 2);
        ctx.fillRect(ix - 22, iy + 17, 2, 2);
        ctx.fillRect(ix + w + 33, iy + 10, 4, 2);
        ctx.fillRect(ix + w + 25, iy + 5, 3, 2);
        ctx.fillRect(ix + w + 22, iy + 17, 2, 2);
      }

      // Animated pixel pointer chevron on left
      const nudge = Math.round(Math.sin(this.renderTimeSec * 9) * 1.5);
      const ptrX = ix - 11 + nudge;
      const ptrY = iy + Math.floor(h * 0.5) - 2;
      if (this.isSteamMode && this.sprites.hasSprite('sprMenuPointer')) {
        this.sprites.draw(ctx, 'sprMenuPointer', ptrX, ptrY, { frame: 0, pixelSnap: true });
      } else {
        ctx.fillStyle = '#09060d';
        ctx.fillRect(ptrX - 1, ptrY - 1, 5, 7);
        ctx.fillStyle = opts.accent;
        ctx.fillRect(ptrX, ptrY, 2, 5);
        ctx.fillRect(ptrX + 2, ptrY + 1, 2, 3);
        ctx.fillRect(ptrX + 4, ptrY + 2, 1, 1);
      }
    } else {
      // Sleek minimal dark wasteland shadow underline (keeps sunset skyline visible!)
      ctx.fillStyle = 'rgba(10, 7, 15, 0.52)';
      ctx.fillRect(ix + 16, iy + h - 5, w - 32, 3);
    }

    this.fonts.draw(
      ctx,
      label,
      cx + (hovered ? 2 : 0),
      iy + Math.floor(h * 0.5),
      hovered ? 'fntL' : 'fntM1',
      {
        align: 'center',
        baseline: 'middle',
        color: hovered ? opts.accent : '#d8d4e3',
        outline: true,
      },
    );

    this.regions.push({ id, x: ix - 6, y: iy, w: w + 12, h, onActivate });
  }

  private renderTitleWastelandBackdrop(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number,
  ): void {
    // Steam bakMenu (320x240) when Steam Pack is active!
    if (this.isSteamMode && this.sprites.hasSprite('bakMenu')) {
      const bx = Math.round((width - 320) * 0.5);
      // Seamless per-scanline edge extrusion left & right of 320x240 bakMenu in 16:9 (ZERO vertical seam or black sidebars!)
      if (bx > 0) {
        const leftDrawn = this.sprites.drawSubRect(ctx, 'bakMenu', 0, 0, 0, 1, 240, 0, 0, bx, height);
        const rightX = bx + 320;
        const rightW = Math.max(0, width - rightX);
        const rightDrawn =
          rightW > 0
            ? this.sprites.drawSubRect(ctx, 'bakMenu', 0, 319, 0, 1, 240, rightX, 0, rightW, height)
            : true;
        if (!leftDrawn || !rightDrawn) {
          const steamSky: ReadonlyArray<[number, string]> = [
            [0, '#5a5a4e'],
            [44, '#666457'],
            [94, '#706c5d'],
            [114, '#8d7244'],
            [168, '#9b7b43'],
          ];
          for (let i = 0; i < steamSky.length; i++) {
            const [sy, col] = steamSky[i]!;
            const ny = i + 1 < steamSky.length ? steamSky[i + 1]![0] : height;
            ctx.fillStyle = col;
            ctx.fillRect(0, sy, width, ny - sy);
          }
        }
      }
      this.sprites.draw(ctx, 'bakMenu', bx, 0, { frame: 0, pixelSnap: true });
      if (bx > 0) {
        // Gentle warm atmospheric edge vignette on outer 16:9 wings (NO dark sidebars!)
        const vigW = Math.min(bx + 10, 44);
        for (let step = 0; step < vigW; step++) {
          const distFromEdge = (vigW - step) / vigW;
          const a = distFromEdge * distFromEdge * 0.28;
          ctx.fillStyle = `rgba(18, 12, 10, ${a.toFixed(3)})`;
          ctx.fillRect(step, 0, 1, height);
          ctx.fillRect(width - 1 - step, 0, 1, height);
        }
      }
      ctx.fillStyle = 'rgba(10, 7, 14, 0.16)';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Built-In Art: Iconic Nuclear Throne-inspired sun-bleached dusty wasteland hill, ruined skyline & buried crown!
    const skyBands: ReadonlyArray<[number, string]> = [
      [0, '#5a5648'],
      [28, '#666050'],
      [56, '#756c57'],
      [82, '#87785c'],
      [104, '#9c8662'],
      [122, '#b39564'],
    ];
    for (let i = 0; i < skyBands.length; i++) {
      const [sy, col] = skyBands[i]!;
      const nextY = i + 1 < skyBands.length ? skyBands[i + 1]![0] : height;
      ctx.fillStyle = col;
      ctx.fillRect(0, sy, width, nextY - sy);
      if (i > 0) {
        ctx.fillStyle = skyBands[i - 1]![1];
        for (let dx = (i % 2) * 2; dx < width; dx += 4) {
          ctx.fillRect(dx, sy, 2, 1);
        }
      }
    }

    // Soft drifting dusty wasteland cloud haze across upper sky
    const drawDustCloud = (cx0: number, cy0: number, cw: number, ch: number): void => {
      const wx = ((cx0 + Math.floor(timeSec * 2.5)) % (width + cw + 40)) - cw - 20;
      ctx.fillStyle = 'rgba(218, 204, 168, 0.16)';
      ctx.fillRect(wx, cy0, cw, ch);
      ctx.fillRect(wx + 10, cy0 - 3, cw - 20, 3);
      ctx.fillStyle = 'rgba(72, 64, 52, 0.14)';
      ctx.fillRect(wx + 4, cy0 + ch - 2, cw - 8, 2);
    };
    drawDustCloud(24, 34, 88, 9);
    drawDustCloud(220, 22, 74, 8);
    drawDustCloud(330, 56, 96, 10);

    // Distant hazy ruined wasteland city skyline & jagged girders silhouetted along desert ridge!
    const ridgeY = 128;
    const skyline: ReadonlyArray<[number, number, number]> = [
      [0.06, 18, 26], [0.11, 14, 16], [0.17, 10, 32],
      [0.64, 16, 22], [0.69, 22, 34], [0.75, 12, 18], [0.80, 18, 28], [0.87, 14, 20],
    ];
    for (const [fx, bw, bh] of skyline) {
      const bx = Math.round(fx * width);
      ctx.fillStyle = '#5e5245';
      ctx.fillRect(bx, ridgeY - bh, bw, bh + 10);
      // Ruined jagged broken roofline & hollow window slits
      ctx.fillStyle = '#4d4238';
      ctx.fillRect(bx + Math.floor(bw * 0.55), ridgeY - bh + 2, Math.ceil(bw * 0.45), bh + 8);
      ctx.fillStyle = '#87785c';
      ctx.fillRect(bx + 3, ridgeY - bh + 4, 2, 3);
      ctx.fillRect(bx + 7, ridgeY - bh + 4, 2, 3);
      ctx.fillRect(bx + 3, ridgeY - bh + 11, 2, 3);
      // Protruding rusty rebar spikes on roof
      ctx.fillStyle = '#4d4238';
      ctx.fillRect(bx + 2, ridgeY - bh - 5, 1, 5);
      ctx.fillRect(bx + bw - 4, ridgeY - bh - 3, 1, 3);
    }

    // Mid-ground sweeping warm ochre desert hill (left slope)
    for (let x = 0; x < width; x += 2) {
      const slopeL = Math.round(122 + Math.sin(x * 0.011 + 0.5) * 14 + (x / width) * 26);
      ctx.fillStyle = '#99743f';
      ctx.fillRect(x, slopeL, 2, height - slopeL);
      ctx.fillStyle = '#ab8449';
      ctx.fillRect(x, slopeL, 2, 2);
    }

    // Foreground sunlit sweeping golden wasteland dune (right-to-left diagonal rise!)
    for (let x = 0; x < width; x += 2) {
      const duneY = Math.round(166 - (x / width) * 34 + Math.sin(x * 0.022) * 5);
      ctx.fillStyle = '#ba9146';
      ctx.fillRect(x, duneY, 2, height - duneY);
      ctx.fillStyle = '#cfa655';
      ctx.fillRect(x, duneY, 2, 3);
      // Warm sunlit sand band in lower foreground
      if (duneY + 26 < height) {
        ctx.fillStyle = '#ad843e';
        ctx.fillRect(x, duneY + 28, 2, height - (duneY + 28));
      }
    }

    // Subtle organic desert wind-carved sand troughs & scattered wasteland pebbles
    ctx.fillStyle = '#967035';
    ctx.fillRect(Math.round(width * 0.58), 166, 36, 2);
    ctx.fillRect(Math.round(width * 0.62), 168, 22, 2);
    ctx.fillRect(Math.round(width * 0.42), 206, 28, 2);
    ctx.fillRect(Math.round(width * 0.78), 192, 24, 2);
    ctx.fillStyle = '#deb764';
    ctx.fillRect(Math.round(width * 0.58), 165, 34, 1);
    ctx.fillRect(Math.round(width * 0.42), 205, 26, 1);

    // Iconic Half-Buried Gilded Wasteland Crown in bottom-left desert sand!
    const crX = Math.round(width * 0.14);
    const crY = 186;
    // Soft sand shadow beneath crown
    ctx.fillStyle = '#87622e';
    ctx.fillRect(crX - 18, crY + 20, 40, 6);
    ctx.fillRect(crX - 14, crY + 25, 32, 3);
    // Bold dark ink silhouette of tilted royal crown
    ctx.fillStyle = '#120b0d';
    ctx.fillRect(crX - 15, crY + 2, 30, 20);
    ctx.fillRect(crX - 12, crY - 4, 24, 8);
    ctx.fillRect(crX - 5, crY - 9, 10, 6);
    // Crimson velvet dome with curved gold ribs
    ctx.fillStyle = '#9e1c2c';
    ctx.fillRect(crX - 13, crY + 3, 26, 16);
    ctx.fillStyle = '#cf2a3c';
    ctx.fillRect(crX - 11, crY - 2, 20, 14);
    // Gold crown arches & top orb
    ctx.fillStyle = '#e8b632';
    ctx.fillRect(crX - 3, crY - 7, 6, 4);
    ctx.fillRect(crX - 2, crY - 3, 4, 18);
    ctx.fillRect(crX - 10, crY + 1, 3, 14);
    ctx.fillRect(crX + 7, crY + 1, 3, 14);
    // Golden jeweled rim band tilted into sand
    ctx.fillStyle = '#d99e26';
    ctx.fillRect(crX - 14, crY + 13, 28, 8);
    ctx.fillStyle = '#fff08a';
    ctx.fillRect(crX - 12, crY + 14, 24, 2);
    ctx.fillRect(crX - 2, crY - 7, 3, 2);
    // Center ruby jewel on rim
    ctx.fillStyle = '#ff384c';
    ctx.fillRect(crX - 2, crY + 16, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(crX - 1, crY + 16, 1, 1);
    // Sunlit desert sand mound lapping organically over lower crown base!
    ctx.fillStyle = '#cfa655';
    ctx.fillRect(crX - 18, crY + 18, 12, 6);
    ctx.fillRect(crX + 6, crY + 19, 14, 5);
    ctx.fillRect(crX - 10, crY + 21, 24, 5);
    ctx.fillStyle = '#e6c270';
    ctx.fillRect(crX - 16, crY + 18, 10, 2);
    ctx.fillRect(crX + 8, crY + 19, 10, 2);

    // Subtle warm dusk edge vignette so logo & bright menu text pop cleanly
    ctx.fillStyle = 'rgba(18, 12, 14, 0.14)';
    ctx.fillRect(0, 0, width, height);
  }

  private renderKrunkedTitleLogo(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    logoY: number,
    timeSec: number,
  ): void {
    const glowPulse = 0.22 + 0.12 * Math.sin(timeSec * 3.0);

    // Built-In Art mode: render directly from our Hi-Bit fallback atlas sprKrunkedLogo/sprLogo
    if (!this.isSteamMode && this.sprites.hasSprite('sprLogo')) {
      if (this.sprites.hasSprite('sprLogoGlow')) {
        this.sprites.draw(ctx, 'sprLogoGlow', cx, logoY, { alpha: glowPulse, pixelSnap: true });
      }
      const logoSpr = this.sprites.getSprite('sprLogo');
      const logoFrame = computeTitleLogoFrame(timeSec, logoSpr?.frames.length ?? KRUNKED_LOGO_FRAMES);
      this.sprites.draw(ctx, 'sprLogo', cx, logoY, {
        frame: logoFrame,
        pixelSnap: true,
      });
      return;
    }

    // Steam Pack mode (and any bundle without built-in sprLogo): render our dedicated Hi-Bit
    // KRUNKED THRONE emblem instead of Steam's "NUCLEAR THRONE" sprLogo!
    const logoFrame = computeTitleLogoFrame(timeSec, KRUNKED_LOGO_FRAMES);
    const logoSurface = getKrunkedLogoFrameSurface(logoFrame);
    if (logoSurface) {
      const glowSurface = getKrunkedLogoGlowSurface();
      if (glowSurface) {
        ctx.save();
        ctx.globalAlpha *= glowPulse;
        ctx.drawImage(
          glowSurface,
          0,
          0,
          glowSurface.width,
          glowSurface.height,
          Math.round(cx - KRUNKED_LOGO_GLOW_ORIGIN_X),
          Math.round(logoY - KRUNKED_LOGO_GLOW_ORIGIN_Y),
          KRUNKED_LOGO_GLOW_WIDTH,
          KRUNKED_LOGO_GLOW_HEIGHT,
        );
        ctx.restore();
      }
      ctx.drawImage(
        logoSurface,
        0,
        0,
        logoSurface.width,
        logoSurface.height,
        Math.round(cx - KRUNKED_LOGO_ORIGIN_X),
        Math.round(logoY - KRUNKED_LOGO_ORIGIN_Y),
        KRUNKED_LOGO_WIDTH,
        KRUNKED_LOGO_HEIGHT,
      );
      return;
    }

    // Headless Node fallback when neither HTMLCanvasElement nor OffscreenCanvas is available
    ctx.fillStyle = 'rgba(64, 232, 72, 0.22)';
    ctx.fillRect(cx - 118, 20, 236, 60);
    ctx.fillStyle = '#160f1c';
    ctx.fillRect(cx - 114, 24, 228, 52);
    drawPixelBorder(ctx, cx - 114, 24, 228, 52, '#52e864', 2);

    this.fonts.draw(ctx, 'KRUNKED', cx, 33, 'fntL', {
      align: 'center',
      color: '#5cf043',
      outline: true,
    });
    this.fonts.draw(ctx, 'THRONE', cx, 53, 'fntL', {
      align: 'center',
      color: '#dce8f7',
      outline: true,
    });
  }

  private renderTitleScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, timeSec, save } = mctx;
    const cx = Math.round(width * 0.5);

    this.renderTitleWastelandBackdrop(ctx, width, height, timeSec);

    // Animated floating ash embers
    for (let i = 0; i < 18; i++) {
      const ex = ((i * 47 + Math.floor(timeSec * (12 + (i % 4) * 5))) % (width + 16)) - 8;
      const ey = height - ((i * 29 + Math.floor(timeSec * (16 + (i % 3) * 6))) % height);
      ctx.fillStyle = i % 3 === 0 ? '#ffe047' : '#ff6b35';
      ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
    }

    // Big pulsing dripping radioactive KRUNKED / chrome-steel THRONE emblem in BOTH Built-In & Steam modes!
    this.renderKrunkedTitleLogo(ctx, cx, 56, timeSec);

    // Bold NT Wasteland Primary Menu Items (PLAY & OPTIONS)
    this.drawTitleMenuItem(
      ctx,
      'title_play',
      cx,
      112,
      124,
      24,
      'PLAY',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { accent: '#52e864', focused: this.focusedIndex === 0 },
    );

    this.drawTitleMenuItem(
      ctx,
      'title_options',
      cx,
      141,
      124,
      22,
      'OPTIONS',
      () => ({ type: 'open_screen', screen: 'options' }),
      { accent: '#ffe047', focused: this.focusedIndex === 1 },
    );

    // Custom Pack / Built-In Art Pack Toggle Row
    const isCustomPack = this.bundle.sourceMode === 'steam';
    const toggleY = 171;
    const toggleH = 16;
    if (mctx.assetLoading) {
      this.drawButton(
        ctx,
        'title_loading_assets',
        cx - 68,
        toggleY,
        136,
        toggleH,
        '@yLOADING CUSTOM PACK...',
        () => null,
        { font: 'fntSmall', accent: '#ffe047' },
      );
    } else if (isCustomPack) {
      const leftW = 92;
      const rightW = 74;
      const totalW = leftW + 4 + rightW;
      const startX = cx - Math.floor(totalW / 2);
      this.drawButton(
        ctx,
        'title_use_builtin',
        startX,
        toggleY,
        leftW,
        toggleH,
        'USE BUILT-IN ART',
        () => ({ type: 'use_builtin_art' }),
        { font: 'fntSmall', accent: '#52e864', focused: this.focusedIndex === 2 && this.titleSubCol === 0 },
      );
      this.drawButton(
        ctx,
        'title_load_local',
        startX + leftW + 4,
        toggleY,
        rightW,
        toggleH,
        'LOAD FOLDER',
        () => ({ type: 'request_load_local' }),
        { font: 'fntSmall', accent: '#52a8ff', focused: this.focusedIndex === 2 && this.titleSubCol === 1 },
      );
    } else if (mctx.hasCachedLocal || mctx.hasServerSteam) {
      const leftW = 90;
      const rightW = 74;
      const totalW = leftW + 4 + rightW;
      const startX = cx - Math.floor(totalW / 2);
      this.drawButton(
        ctx,
        'title_use_local',
        startX,
        toggleY,
        leftW,
        toggleH,
        'USE CUSTOM PACK',
        () => ({ type: 'use_local_art' }),
        { font: 'fntSmall', accent: '#52a8ff', focused: this.focusedIndex === 2 && this.titleSubCol === 0 },
      );
      this.drawButton(
        ctx,
        'title_load_local',
        startX + leftW + 4,
        toggleY,
        rightW,
        toggleH,
        'LOAD FOLDER',
        () => ({ type: 'request_load_local' }),
        { font: 'fntSmall', accent: '#ffe047', focused: this.focusedIndex === 2 && this.titleSubCol === 1 },
      );
    } else {
      this.drawButton(
        ctx,
        'title_load_local',
        cx - 68,
        toggleY,
        136,
        toggleH,
        'LOAD CUSTOM PACK',
        () => ({ type: 'request_load_local' }),
        { font: 'fntSmall', accent: '#52a8ff', focused: this.focusedIndex === 2 },
      );
    }

    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');

    // Best run footer
    if (save.totalRuns > 0) {
      const best =
        save.bestLoop > 0
          ? `@dBEST: @yL${save.bestLoop} ${save.bestArea}@d  KILLS: @w${save.bestKills}`
          : `@dBEST: @w${save.bestArea}@d  KILLS: @w${save.bestKills}`;
      this.fonts.draw(ctx, best, cx, 196, 'fntSmall', { align: 'center', outline: true });
    } else if (mctx.inputMode === 'gamepad' || mctx.gamepadConnected) {
      this.fonts.draw(
        ctx,
        `@g${g.familyLabel} READY  @d[LS/DPAD] MOVE  [${g.confirm}] SELECT`,
        cx,
        196,
        'fntSmall',
        { align: 'center', outline: true },
      );
    }

    // Subtle top-right connected controller badge when active
    if (mctx.gamepadConnected) {
      this.fonts.draw(ctx, `@g${g.familyLabel} READY`, width - 6, 5, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }

    // Clean atmospheric footer (NO debug "(823 SPRITES)" text!)
    const cleanedStatus = mctx.assetStatusText
      ? mctx.assetStatusText.replace(/\s*\(\d+\s*SPRITES\)/gi, '').trim()
      : '';
    const footerText =
      cleanedStatus ||
      (isCustomPack ? '@dCUSTOM ART PACK ACTIVE' : '@dTHE WASTELAND CALLS YOU');
    this.fonts.draw(ctx, footerText, cx, height - 13, 'fntSmall', {
      align: 'center',
      outline: true,
    });
  }

  // --------------------------------------------------------------------------
  // 2. CAMPFIRE MUTANT SELECT (ALL 12 MUTANTS, CLEAN INK-SPLAT AESTHETIC)
  // --------------------------------------------------------------------------

  private renderCampfireGround(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    fireX: number,
    fireY: number,
    seatRx: number,
    seatRy: number,
    timeSec: number,
  ): void {
    if (this.sprites.hasSprite('sprFloor0')) {
      const floorSpr = this.sprites.getSprite('sprFloor0')!;
      const fCount = Math.max(1, floorSpr.frames.length);
      for (let ty = 0; ty < height; ty += 32) {
        for (let tx = 0; tx < width; tx += 32) {
          const hash = ((tx * 73) ^ (ty * 151) ^ 0x5a) & 0xff;
          this.sprites.draw(ctx, 'sprFloor0', tx, ty, { frame: hash % fCount, pixelSnap: true });
        }
      }
      ctx.fillStyle = this.isSteamMode ? 'rgba(10, 7, 14, 0.56)' : 'rgba(12, 9, 16, 0.62)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#241b16';
      ctx.fillRect(0, 0, width, height);
    }

    // Crisp stepped warm firelight pools around campfire
    const flick = Math.round(Math.sin(timeSec * 12) * 3 + Math.cos(timeSec * 19) * 2);
    const rings: ReadonlyArray<[number, number, string]> = [
      [seatRx + 38 + flick, seatRy + 28 + flick, 'rgba(255, 130, 42, 0.14)'],
      [seatRx + 18 + flick, seatRy + 16 + flick, 'rgba(255, 145, 48, 0.16)'],
      [Math.round(seatRx * 0.65) + flick, Math.round(seatRy * 0.7) + flick, 'rgba(255, 178, 66, 0.18)'],
    ];
    for (const [rx, ry, col] of rings) {
      ctx.fillStyle = col;
      for (let dy = -ry; dy <= ry; dy += 2) {
        const norm = dy / Math.max(1, ry);
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - norm * norm)));
        ctx.fillRect(fireX - span, fireY + 4 + dy, span * 2, 2);
      }
    }

    if (this.isSteamMode && this.sprites.hasSprite('sprLogMenu')) {
      const logAngles = [-2.5, -0.6, 0.55, 2.55];
      for (let i = 0; i < logAngles.length; i++) {
        const a = logAngles[i]!;
        const lx = Math.round(fireX + Math.cos(a) * (seatRx * 0.92));
        const ly = Math.round(fireY + 10 + Math.sin(a) * (seatRy * 0.92));
        this.sprites.draw(ctx, 'sprLogMenu', lx, ly, {
          frame: i % 2,
          flipX: lx > fireX,
          pixelSnap: true,
        });
      }
    } else {
      const drawSittingLog = (lx: number, ly: number): void => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(lx - 11, ly + 4, 23, 2);
        ctx.fillStyle = '#0e0908';
        ctx.fillRect(lx - 11, ly - 2, 22, 7);
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(lx - 10, ly - 1, 20, 5);
        ctx.fillStyle = '#825638';
        ctx.fillRect(lx - 10, ly - 1, 18, 2);
        ctx.fillStyle = '#a3754e';
        ctx.fillRect(lx + 8, ly, 2, 3);
      };
      drawSittingLog(fireX - Math.round(seatRx * 0.65), fireY + Math.round(seatRy * 0.72));
      drawSittingLog(fireX + Math.round(seatRx * 0.65), fireY + Math.round(seatRy * 0.72));
      drawSittingLog(fireX - Math.round(seatRx * 0.72), fireY - Math.round(seatRy * 0.45));
      drawSittingLog(fireX + Math.round(seatRx * 0.72), fireY - Math.round(seatRy * 0.45));
    }
  }

  private renderCampfireScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, timeSec, save } = mctx;
    const mutants = this.data.getMutants();
    const selected = this.data.getMutant(save.selectedMutant);
    const skin = save.selectedSkins[selected.id] ?? 'a';
    const crown = this.data.getCrown(save.selectedCrown);
    const mProg = save.mutants[selected.id];
    const storedGoldId = mProg?.goldenWeapon ?? (selected.id === 'yv' ? 'golden_revolver' : null);
    const hasGold = Boolean(storedGoldId);
    const goldActive = hasGold && save.useGoldenWeapon;
    const storedGoldLabel = storedGoldId ? resolveWeaponLabel(storedGoldId, this.data) : '';

    const isWide = width >= 380;

    const portW = 96;
    const portH = 80;
    const portX = isWide ? 8 : 4;
    const portY = isWide ? 20 : 17;

    const infoW = isWide ? 142 : 138;
    const infoX = width - infoW - (isWide ? 8 : 4);
    const infoY = isWide ? 20 : 17;
    const infoH = isWide ? 138 : 143;

    const fireX = isWide ? 190 : 90;
    const fireY = isWide ? 90 : 131;
    const seatRx = isWide ? 66 : 70;
    const seatRy = isWide ? 38 : 21;

    // 1. Campfire ground + dark ink top/bottom bars
    this.renderCampfireGround(ctx, width, height, fireX, fireY, seatRx, seatRy, timeSec);
    drawEdgeInkSplats(ctx, width, height, 14, 48, 0);

    // 2. Depth-sorted campfire + ALL 12 mutants at CRISP 1.0x INTEGER SCALE
    const sceneItems: Array<{ y: number; draw: () => void }> = [];

    sceneItems.push({
      y: fireY + 2,
      draw: () => {
        const drewFire = this.sprites.draw(ctx, 'sprCampfire', fireX, fireY, {
          frame: Math.floor(timeSec * 8),
          pixelSnap: true,
        });
        if (!drewFire) {
          ctx.fillStyle = '#5c3c24';
          ctx.fillRect(fireX - 9, fireY + 3, 18, 5);
          ctx.fillStyle = '#ff6a26';
          ctx.fillRect(fireX - 6, fireY - 6 - (Math.floor(timeSec * 8) % 2), 12, 10);
          ctx.fillStyle = '#ffe047';
          ctx.fillRect(fireX - 3, fireY - 3, 6, 5);
        }
        for (let e = 0; e < 7; e++) {
          const phase = (timeSec * (0.85 + (e % 3) * 0.25) + e * 0.17) % 1;
          const ex = Math.round(fireX + Math.sin(timeSec * 4 + e * 2.1) * (4 + phase * 8));
          const ey = Math.round(fireY - 4 - phase * 28);
          ctx.save();
          ctx.globalAlpha = (1 - phase) * 0.92;
          ctx.fillStyle = e % 2 === 0 ? '#ffe047' : '#ff7b32';
          ctx.fillRect(ex, ey, 2, 2);
          ctx.restore();
        }
      },
    });

    const totalMutants = mutants.length;
    const seatAngles = computeBalancedEllipseAngles(totalMutants, seatRx, seatRy, -Math.PI * 0.5 + 0.24);

    for (let i = 0; i < totalMutants; i++) {
      const m = mutants[i]!;
      const mSkin = save.selectedSkins[m.id] ?? 'a';
      const isSel = m.id === selected.id;
      const angle = seatAngles[i]!;
      const pullIn = isSel ? 0.9 : 1;
      const mx = Math.round(fireX + Math.cos(angle) * seatRx * pullIn);
      const my = Math.round(fireY + 5 + Math.sin(angle) * seatRy * pullIn);
      const faceLeft = mx > fireX;

      this.regions.push({
        id: `camp_sit_${m.id}`,
        x: mx - 9,
        y: my - 10,
        w: 18,
        h: 20,
        onActivate: () => ({ type: 'select_mutant', mutant: m.id }),
      });

      sceneItems.push({
        y: my,
        draw: () => {
          ctx.fillStyle = isSel ? 'rgba(255, 224, 71, 0.34)' : 'rgba(0, 0, 0, 0.44)';
          ctx.fillRect(mx - 6, my + 6, 12, 3);
          ctx.fillRect(mx - 4, my + 5, 8, 5);

          let sprName: string;
          if (isSel) {
            sprName =
              mSkin === 'b' && m.sprites.bIdle && this.sprites.hasSprite(m.sprites.bIdle)
                ? m.sprites.bIdle
                : m.sprites.idle;
          } else {
            const bSit = mSkin === 'b' ? m.sprites.bSit : undefined;
            if (bSit && this.sprites.hasSprite(bSit)) {
              sprName = bSit;
            } else if (m.sprites.sit && this.sprites.hasSprite(m.sprites.sit)) {
              sprName = m.sprites.sit;
            } else {
              sprName =
                mSkin === 'b' && m.sprites.bIdle && this.sprites.hasSprite(m.sprites.bIdle)
                  ? m.sprites.bIdle
                  : m.sprites.idle;
            }
          }

          const standLift = isSel ? Math.round(Math.sin(timeSec * 5) * 1) - 3 : 0;

          if (isSel && crown.id !== 'none') {
            const crX = mx + (faceLeft ? 8 : -8);
            const crY = Math.round(my + standLift - 9 + Math.sin(timeSec * 4.2) * 1.5);
            this.sprites.draw(ctx, crown.spriteIdle, crX, crY, {
              frame: Math.floor(timeSec * 4),
              scaleX: 1,
              scaleY: 1,
              pixelSnap: true,
            });
          }

          this.sprites.draw(ctx, sprName, mx, my + standLift, {
            frame: isSel ? Math.floor(timeSec * 6) : Math.floor(timeSec * 2 + i),
            flipX: faceLeft,
            scaleX: 1,
            scaleY: 1,
            alpha: isSel ? 1 : 0.92,
            pixelSnap: true,
          });

          if (isSel) {
            const startWepId = goldActive && storedGoldId ? storedGoldId : m.startingWeapon;
            const wepSpr = resolveWeaponSpriteName(startWepId, this.data);
            const dir = faceLeft ? -1 : 1;
            this.sprites.draw(ctx, wepSpr, mx + dir * 5, my + standLift + 2, {
              frame: 0,
              rotation: faceLeft ? Math.PI : 0,
              flipY: faceLeft,
              scaleX: 1,
              scaleY: 1,
              pixelSnap: true,
            });
          }
        },
      });
    }

    sceneItems.sort((a, b) => a.y - b.y);
    for (let i = 0; i < sceneItems.length; i++) {
      sceneItems[i]!.draw();
    }

    const idleSpr =
      skin === 'b' && selected.sprites.bIdle && this.sprites.hasSprite(selected.sprites.bIdle)
        ? selected.sprites.bIdle
        : selected.sprites.idle;

    // 3. Crisp Left Mutant Portrait (integer 1x for Built-In 96x80, clean integer fit for Steam!)
    drawWastelandPlate(ctx, portX, portY, portW, portH, {
      fill: '#08060c',
      border: skin === 'b' ? '#d4b84a' : '#2a2434',
    });
    const portSpriteName =
      skin === 'b' && selected.sprites.bPortrait && this.sprites.hasSprite(selected.sprites.bPortrait)
        ? selected.sprites.bPortrait
        : selected.sprites.portrait;
    const portSprDef = this.sprites.getSprite(portSpriteName);
    const portraitFrame = computePortraitFrame(
      selected.raceIndex,
      skin,
      portSprDef?.frames.length ?? 24,
    );
    let drewPort = false;
    if (portSprDef && portSprDef.frames.length > 0 && this.sprites.hasSprite(portSpriteName)) {
      const fIdx = Math.max(0, Math.min(portSprDef.frames.length - 1, portraitFrame));
      const rect = portSprDef.frames[fIdx];
      if (rect && rect.srcW > 0 && rect.srcH > 0) {
        if (rect.targetW <= portW && rect.targetH <= portH) {
          // Built-In 96x80 portrait fits natively at exact 1x integer scale!
          drewPort = this.drawSpriteIntegerCentered(ctx, portSpriteName, fIdx, portX, portY, portW, portH);
        } else {
          // Oversized Steam sprBigPortrait (e.g. 240x200 with originX=80, originY=243 below sprite bounds!):
          // Anchor the sprite's actual trimmed bounding box (rect.targetX/Y/W/H) cleanly inside the 96x80 frame!
          const innerX = portX + 1;
          const innerY = portY + 1;
          const innerW = portW - 2;
          const innerH = portH - 2;
          const fitScale = Math.min(innerW / rect.targetW, innerH / rect.targetH);
          const drawW = rect.targetW * fitScale;
          const drawH = rect.targetH * fitScale;
          const left = Math.round(innerX + (innerW - drawW) * 0.5);
          const top = Math.round(innerY + (innerH - drawH));
          const localX = Math.round(rect.targetX - portSprDef.originX);
          const localY = Math.round(rect.targetY - portSprDef.originY);
          const drawX = Math.round(left - localX * fitScale);
          const drawY = Math.round(top - localY * fitScale);
          ctx.save();
          ctx.beginPath();
          ctx.rect(innerX, innerY, innerW, innerH);
          ctx.clip();
          drewPort = this.sprites.draw(ctx, portSpriteName, drawX, drawY, {
            frame: fIdx,
            scaleX: fitScale,
            scaleY: fitScale,
            pixelSnap: true,
          });
          ctx.restore();
        }
      }
    }
    if (!drewPort) {
      this.drawSpriteIntegerCentered(ctx, idleSpr, Math.floor(timeSec * 4), portX + 8, portY + 8, portW - 16, portH - 16, {
        allow2x: true,
      });
    }

    if (isWide) {
      const subY = portY + portH + 4;
      const subH = 54;
      drawWastelandPlate(ctx, portX, subY, portW, subH, {
        fill: 'rgba(8, 6, 12, 0.88)',
      });
      const startWepId = goldActive && storedGoldId ? storedGoldId : selected.startingWeapon;
      const startWepLabel = resolveWeaponLabel(startWepId, this.data);
      this.fonts.draw(ctx, '@dSTART WEAPON', portX + 4, subY + 4, 'fntSmall');
      const wepSpr = resolveWeaponSpriteName(startWepId, this.data);
      this.drawSpriteIntegerCentered(ctx, wepSpr, 0, portX + 4, subY + 13, 30, 14);
      this.fonts.draw(ctx, startWepLabel, portX + 36, subY + 16, 'fntSmall', {
        color: goldActive ? '#ffe047' : '#e4e8f2',
        maxWidth: portW - 40,
        shadow: true,
      });
      if (hasGold) {
        this.fonts.draw(ctx, `@yGOLD: @w${storedGoldLabel}`, portX + 4, subY + 34, 'fntSmall', {
          maxWidth: portW - 8,
          shadow: true,
        });
      } else {
        this.fonts.draw(ctx, '@dNO GOLDEN WEAPON', portX + 4, subY + 38, 'fntSmall');
      }
    }

    // 4. Right-Side Mutant Details Ink-Splat Panel (borderless dark ink — ZERO yellow wireframe!)
    if (this.isSteamMode && this.sprites.hasSprite('sprLoadoutSplat')) {
      this.sprites.draw(ctx, 'sprLoadoutSplat', infoX + infoW + 4, infoY + infoH + 2, {
        frame: 3,
        alpha: 0.72,
        pixelSnap: true,
      });
    }
    drawWastelandPlate(ctx, infoX, infoY, infoW, infoH, {
      fill: 'rgba(8, 6, 12, 0.88)',
    });

    this.fonts.draw(ctx, selected.name, infoX + 6, infoY + 5, 'fntM1', {
      color: '#ffffff',
      outline: true,
    });
    this.fonts.draw(ctx, `@r${selected.maxHp} HP`, infoX + infoW - 6, infoY + 6, 'fntSmall', {
      align: 'right',
      outline: true,
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(infoX + 5, infoY + 15, infoW - 10, 1);

    const hasBestLine = Boolean(mProg && mProg.runs > 0);
    const detailsMaxW = infoW - 12;
    const layout = computeCampfireDetailsLayout(
      this.fonts,
      selected,
      detailsMaxW,
      infoY + 18,
      infoY + infoH - 4,
      hasBestLine,
    );

    const pRes = this.fonts.draw(ctx, `@wPASSIVE: @s${selected.passiveDesc}`, infoX + 6, layout.passiveY, 'fntSmall', {
      maxWidth: detailsMaxW,
      lineSpacing: layout.lineSpacing,
      shadow: true,
    });
    const activeY = Math.max(layout.activeY, layout.passiveY + pRes.height + 3);
    const aRes = this.fonts.draw(ctx, `@gACTIVE: @s${selected.activeDesc}`, infoX + 6, activeY, 'fntSmall', {
      maxWidth: detailsMaxW,
      lineSpacing: layout.lineSpacing,
      shadow: true,
    });
    const tbY = Math.max(layout.tbY, activeY + aRes.height + 3);
    const tRes = this.fonts.draw(ctx, `@pTB: @s${selected.throneButtDesc}`, infoX + 6, tbY, 'fntSmall', {
      maxWidth: detailsMaxW,
      lineSpacing: layout.lineSpacing,
      shadow: true,
    });

    if (hasBestLine && mProg) {
      const bestY = Math.max(layout.bestY, tbY + tRes.height + 3);
      if (bestY + 6 <= infoY + infoH - 1) {
        this.fonts.draw(
          ctx,
          `@dBEST ${mProg.bestLoop > 0 ? `L${mProg.bestLoop} ` : ''}${mProg.bestArea} | ${mProg.bestKills}K`,
          infoX + 6,
          bestY,
          'fntSmall',
          { shadow: false },
        );
      }
    }

    // 5. Header & Top-Left Back button
    const inActions = this.campfireRow === 'actions';
    const inputMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    this.drawButton(
      ctx,
      'camp_back',
      4,
      2,
      48,
      13,
      inputMode === 'gamepad' ? `BACK [${g.back}]` : 'BACK',
      () => ({ type: 'open_screen', screen: 'title' }),
      {
        font: 'fntSmall',
        accent: '#ff7038',
        focused: inActions && this.campfireActionIndex === 4,
      },
    );

    this.fonts.draw(ctx, 'SELECT MUTANT', width * 0.5, 4, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // 6. Uniform-Height Loadout Action Row: SKIN | CROWN | GOLD | GO! (exact same y and h!)
    const rowY = 164;
    const btnH = 18;
    const gap = 4;
    const skinW = isWide ? 58 : 48;
    const crownW = isWide ? 124 : 106;
    const goldW = isWide ? 116 : 70;
    const goW = isWide ? 86 : 76;
    const barTotalW = skinW + crownW + goldW + goW + gap * 3;
    const barStartX = Math.round((width - barTotalW) * 0.5);

    this.drawButton(
      ctx,
      'camp_skin',
      barStartX,
      rowY,
      skinW,
      btnH,
      skin === 'b' ? '@ySKIN: B' : 'SKIN: A',
      () => ({ type: 'toggle_bskin', mutant: selected.id }),
      {
        font: 'fntSmall',
        accent: '#ffffff',
        focused: inActions && this.campfireActionIndex === 0,
      },
    );

    const crownX = barStartX + skinW + gap;
    this.drawButton(
      ctx,
      'camp_crown',
      crownX,
      rowY,
      crownW,
      btnH,
      crown.id === 'none' ? 'NO CROWN' : `@p${crown.name}`,
      () => {
        const idx = ALL_CROWN_IDS.indexOf(save.selectedCrown);
        const nextCrown = ALL_CROWN_IDS[(idx + 1) % ALL_CROWN_IDS.length]!;
        return { type: 'cycle_crown', crown: nextCrown };
      },
      {
        font: 'fntSmall',
        accent: '#c96bff',
        focused: inActions && this.campfireActionIndex === 1,
      },
    );

    const goldX = crownX + crownW + gap;
    const goldBtnLabel = hasGold
      ? isWide
        ? (goldActive ? `@yGOLD: ${storedGoldLabel.replace('GOLDEN ', '')}` : `GOLD: ${storedGoldLabel.replace('GOLDEN ', '')}`)
        : (goldActive ? '@yGOLD: ON' : 'GOLD: OFF')
      : '@dGOLD: NONE';
    this.drawButton(
      ctx,
      'camp_golden',
      goldX,
      rowY,
      goldW,
      btnH,
      goldBtnLabel,
      () => (hasGold ? { type: 'toggle_golden', enabled: !save.useGoldenWeapon } : null),
      {
        font: 'fntSmall',
        accent: hasGold ? '#ffe047' : '#4a4456',
        focused: inActions && this.campfireActionIndex === 2,
      },
    );

    const goX = goldX + goldW + gap;
    const goLabel =
      inputMode === 'gamepad'
        ? `@gGO! [${g.confirm}]`
        : inputMode === 'touch'
          ? '@gGO!'
          : '@gGO! [ENTER]';
    this.drawButton(
      ctx,
      'camp_go',
      goX,
      rowY,
      goW,
      btnH,
      goLabel,
      () => ({
        type: 'start_run',
        mutant: selected.id,
        skin,
        crown: save.selectedCrown,
        useGoldenWeapon: goldActive,
      }),
      {
        font: 'fntSmall',
        accent: '#48e048',
        focused: !inActions || this.campfireActionIndex === 3,
      },
    );

    // 7. Crown / Gold effect description strip (borderless dark ink — strictly 1 line so it never wraps into roster!)
    const effectY = rowY + btnH + 2;
    const crownEffectText = crown.description.replace(/#/g, ' - ');
    const maxStatusW = width - 16;
    const buildStatusInfo = (): string => {
      if (crown.id !== 'none') {
        const goldTag = hasGold && !isWide ? `  @y[${storedGoldLabel}]` : '';
        const full = `@p${crown.name}: @s${crownEffectText}${goldTag}`;
        if (this.fonts.measure(full, 'fntSmall').width <= maxStatusW) return full;
        const shortGold = hasGold && !isWide ? '  @y[GOLD]' : '';
        const compact = `@p${crown.name}: @s${crownEffectText}${shortGold}`;
        if (this.fonts.measure(compact, 'fntSmall').width <= maxStatusW) return compact;
        const noGold = `@p${crown.name}: @s${crownEffectText}`;
        if (this.fonts.measure(noGold, 'fntSmall').width <= maxStatusW) return noGold;
        return `@p${crown.name}: @s${crownEffectText.slice(0, 32)}..`;
      }
      if (hasGold) {
        const full = `@ySTORED GOLD: @w${storedGoldLabel}  @d- ${crownEffectText}`;
        if (this.fonts.measure(full, 'fntSmall').width <= maxStatusW) return full;
        return `@ySTORED GOLD: @w${storedGoldLabel}`;
      }
      return `@d${crown.name}: ${crownEffectText}`;
    };
    const statusInfo = buildStatusInfo();
    this.fonts.draw(ctx, statusInfo, Math.round(width * 0.5), effectY + 2, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    // 8. Bottom 12-Mutant Roster Strip over pure black ink-splat bottom bar
    const count = mutants.length;
    const slotGap = isWide ? 4 : 3;
    const slotW = Math.min(24, Math.floor((width - 12 - (count - 1) * slotGap) / count));
    const slotH = 28;
    const stripW = count * slotW + (count - 1) * slotGap;
    const stripX = Math.round((width - stripW) * 0.5);
    const stripY = height - slotH - 14;

    const charSelectSpr = this.sprites.getSprite('sprCharSelect');

    for (let i = 0; i < count; i++) {
      const m = mutants[i]!;
      const sx = stripX + i * (slotW + slotGap);
      const isSelected = m.id === selected.id;
      const rid = `camp_mutant_${m.id}`;
      const hovered = this.hoveredId === rid;

      ctx.fillStyle = isSelected ? '#28202e' : hovered ? '#1e1a26' : '#0c0a10';
      ctx.fillRect(sx, stripY, slotW, slotH);
      drawPixelBorder(
        ctx,
        sx,
        stripY,
        slotW,
        slotH,
        isSelected ? '#ffffff' : hovered ? '#b8b8c4' : '#302c38',
        isSelected ? 2 : 1,
      );

      const useCharSelect =
        charSelectSpr &&
        charSelectSpr.frames.length >= 12 &&
        this.sprites.hasSprite('sprCharSelect');
      let drewCard = false;
      if (useCharSelect) {
        const frame = charSelectSpr.frames.length >= 13 ? m.raceIndex : i;
        drewCard = this.drawSpriteIntegerCentered(ctx, 'sprCharSelect', frame, sx + 2, stripY + 2, slotW - 4, slotH - 4);
      }
      if (!drewCard) {
        this.drawSpriteIntegerCentered(ctx, m.sprites.idle, 0, sx + 2, stripY + 2, slotW - 4, slotH - 4);
      }

      this.regions.push({
        id: rid,
        x: sx,
        y: stripY,
        w: slotW,
        h: slotH,
        onActivate: () => ({ type: 'select_mutant', mutant: m.id }),
      });
    }

    const campHint =
      inputMode === 'gamepad'
        ? `@y[${g.confirm}] @w${selected.name}  @d[${g.prevTab}]SKIN [${g.nextTab}]CRN [${g.swap}]GOLD [UP]BAR`
        : inputMode === 'touch'
          ? `@w${selected.name}  @dTAP MUTANT OR GO TO PLAY`
          : `@y< A / D > @w${selected.name}  @d(UP/DOWN LOADOUT - ENTER PLAY)`;
    this.fonts.draw(ctx, campHint, width * 0.5, height - 10, 'fntSmall', {
      align: 'center',
      outline: true,
    });
  }

  // --------------------------------------------------------------------------
  // 3. LEVEL UP / MUTATION & ULTRA SELECT (EXACT MATCH TO 11a_levelup.png!)
  // --------------------------------------------------------------------------

  private renderMutationSelect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState, save, timeSec } = mctx;
    const cx = Math.round(width * 0.5);
    const rawList = simState?.pendingMutations ?? [];
    const list = rawList.length > 0 ? rawList : FALLBACK_MUTATION_DECK;

    // 1. Opaque backdrop base (preserves UI selftest invariant) + animated 5-arm swirling purple portal vortex!
    ctx.fillStyle = OPAQUE_MENU_BACKDROP;
    ctx.fillRect(0, 0, width, height);
    drawPortalVortex(ctx, width, height, timeSec, false);

    // 2. Full-bright Top-Left Gameplay HUD (Rad canister, HP bar, weapons, 5 ammo icons — exact match to 11a_levelup.png!)
    if (simState) {
      renderTopLeftGameplayHud(ctx, {
        sprites: this.sprites,
        fonts: this.fonts,
        data: this.data,
        isSteamMode: this.isSteamMode,
        state: simState,
        inputMode: mctx.inputMode ?? 'kbm',
        gamepadFamily: mctx.gamepadFamily ?? 'generic',
      });
    }

    // 3. Sleek jagged Top-Right black ink-splat + owned mutation/ultra/crown icons (exact match to 11a_levelup.png!)
    if (simState) {
      const iconCount =
        simState.player.mutations.length +
        (simState.player.ultra ? 1 : 0) +
        (simState.crown !== 'none' ? 1 : 0);
      const topRightSpan = Math.max(82, iconCount * 18 + 38);
      drawCornerEdgeInkSplat(ctx, width, 'right', 0, topRightSpan, 24, 31);
      this.drawTopRightHudIcons(ctx, simState, width);
    }

    // 4. HUGE jagged radioactive slime-green outlined `LEVEL UP` header (scale 1.45, exact match to 11a_levelup.png!)
    drawChunkyMenuText(ctx, 'LEVEL UP', cx, 50, false, '#5ce828', {
      slimeDrips: true,
      timeSec,
      scale: 1.45,
    });

    if (list.length >= 5) {
      this.fonts.draw(ctx, '@gHORROR +1 CHOICE', cx, 78, 'fntSmall', {
        align: 'center',
        outline: true,
      });
    } else if (rawList.length === 1 && simState?.crown === 'destiny') {
      this.fonts.draw(ctx, '@pCROWN OF DESTINY', cx, 78, 'fntSmall', {
        align: 'center',
        outline: true,
      });
    }

    // 5. Player's mutant sprite floating/tumbling gently in the center of the vortex!
    const mutantId = simState?.player.mutant ?? save.selectedMutant;
    const mutantDef = this.data.getMutant(mutantId);
    const skin = simState?.player.skin ?? save.selectedSkins[mutantId] ?? 'a';
    const floatSpr =
      skin === 'b' && mutantDef.sprites.bIdle && this.sprites.hasSprite(mutantDef.sprites.bIdle)
        ? mutantDef.sprites.bIdle
        : mutantDef.sprites.idle;
    const floatX = cx + Math.round(Math.sin(timeSec * 1.4) * 5);
    const floatY = 112 + Math.round(Math.sin(timeSec * 2.4) * 5);
    const floatRot = Math.sin(timeSec * 1.8) * 0.35;
    this.sprites.draw(ctx, floatSpr, floatX, floatY, {
      frame: Math.floor(timeSec * 6),
      rotation: floatRot,
      scaleX: 1,
      scaleY: 1,
      pixelSnap: true,
    });

    // 6. FULL-BLEED 24x32 Mutation Cards + sleek Bottom-Left jagged ink-splat (exact match to 11a_levelup.png!)
    const cardW = 24;
    const cardH = 32;
    const gap = 8;
    const totalW = list.length * cardW + (list.length - 1) * gap;
    const startX = Math.round((width - totalW) * 0.5);
    const baseCardY = height - 34;

    // Sleek jagged black ink-splat sweeping in cleanly from the left edge right up to the cards (matches 11a_levelup.png!)
    drawCornerEdgeInkSplat(ctx, width, 'left', height - 30, Math.max(88, startX + 12), 30, 59);

    let activeIdx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));
    for (let i = 0; i < list.length; i++) {
      if (this.hoveredId === `mut_card_${i}`) {
        activeIdx = i;
        this.focusedIndex = i;
        break;
      }
    }

    // Selected mutation name & clean description text directly ABOVE the cards!
    const focusedDef = this.data.getMutation(list[activeIdx]!);
    if (focusedDef) {
      this.fonts.draw(ctx, focusedDef.name, cx, baseCardY - 34, 'fntM1', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
      this.fonts.draw(ctx, focusedDef.description, cx, baseCardY - 22, 'fntSmall', {
        align: 'center',
        maxWidth: width - 24,
        outline: true,
      });
    }

    for (let i = 0; i < list.length; i++) {
      const mutId = list[i]!;
      const def = this.data.getMutation(mutId);
      const rid = `mut_card_${i}`;
      const isFocused = i === activeIdx;

      const x = startX + i * (cardW + gap);
      const y = isFocused ? baseCardY - 6 : baseCardY;

      // ZERO inner gray padding box! Crisp 1px #000000 frame (and crisp #ffffff highlight rim on lifted selected card)
      if (isFocused) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - 2, y - 2, cardW + 4, cardH + 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - 1, cardW + 2, cardH + 2);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - 1, y - 1, cardW + 2, cardH + 2);
      }

      const drewIcon = def
        ? this.drawSpriteIntegerCentered(
            ctx,
            def.sprite || 'sprSkillIcon',
            def.iconFrame,
            x,
            y,
            cardW,
            cardH,
          )
        : false;
      if (!drewIcon) {
        ctx.fillStyle = '#48e048';
        ctx.fillRect(x, y, cardW, cardH);
      }

      this.regions.push({
        id: rid,
        x: x - 2,
        y: baseCardY - 8,
        w: cardW + 4,
        h: cardH + 10,
        onActivate: () => ({ type: 'pick_mutation', index: i, mutationId: mutId }),
      });
    }

    // Compact bottom-right timer (exact match to 11a_levelup.png!)
    if (simState) {
      this.fonts.draw(ctx, formatRunTimer(simState.stats.timeTicks), width - 4, height - 10, 'fntM1', {
        align: 'right',
        color: '#ffffff',
        outline: true,
      });
    }
  }

  private renderUltraSelect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState, save, timeSec } = mctx;
    const cx = Math.round(width * 0.5);
    const list = simState?.pendingUltras ?? [];
    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);

    // First fillRect stays OPAQUE_MENU_BACKDROP (preserves parity test contract!), then swirls purple vortex over it!
    ctx.fillStyle = OPAQUE_MENU_BACKDROP;
    ctx.fillRect(0, 0, width, height);
    drawPortalVortex(ctx, width, height, timeSec, false);
    drawEdgeInkSplats(ctx, width, height, 0, 26, 6);

    drawChunkyMenuText(ctx, 'ULTRA MUTATION', cx, 16, false, '#ffe047', {
      timeSec,
    });
    this.fonts.draw(ctx, '@gLEVEL ULTRA REACHED - CHOOSE YOUR PATH', cx, 36, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    if (list.length === 0) return;

    const cardW = 138;
    const cardH = 114;
    const gap = 16;
    const totalW = list.length * cardW + (list.length - 1) * gap;
    const startX = Math.round((width - totalW) * 0.5);
    const cardY = Math.round((height - cardH) * 0.5) + 6;

    let activeIdx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));

    for (let i = 0; i < list.length; i++) {
      const ultraId = list[i]!;
      const def = this.data.getUltra(ultraId);
      const rid = `ultra_card_${i}`;
      const hovered = this.hoveredId === rid;
      if (hovered) {
        activeIdx = i;
        this.focusedIndex = i;
      }
      const isFocused = i === activeIdx;

      const x = startX + i * (cardW + gap);
      const y = isFocused ? cardY - 4 : cardY;

      drawWastelandPlate(ctx, x, y, cardW, cardH, {
        fill: isFocused ? 'rgba(34, 24, 14, 0.95)' : 'rgba(12, 10, 18, 0.92)',
        border: isFocused ? '#ffe047' : '#464056',
        borderThickness: isFocused ? 2 : 1,
      });

      this.fonts.draw(ctx, `@y[${i + 1}] ULTRA ${i === 0 ? 'A' : 'B'}`, x + cardW * 0.5, y + 7, 'fntSmall', {
        align: 'center',
        outline: true,
      });

      const iconSprName = def?.sprite || 'sprEGSkillIcon';
      const iconSprDef = this.sprites.getSprite(iconSprName);
      const ultraFrame = def
        ? computeUltraIconFrame(mutant.raceIndex, def.slot, iconSprDef?.frames.length ?? 24)
        : 0;
      const drewIcon = def
        ? this.drawSpriteIntegerCentered(ctx, iconSprName, ultraFrame, x + Math.floor((cardW - 24) / 2), y + 18, 24, 32)
        : false;
      if (!drewIcon) {
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + Math.floor((cardW - 24) / 2), y + 18, 24, 32);
      }

      const title = def ? def.name : ultraId.toUpperCase();
      const titleRes = this.fonts.draw(ctx, title, x + cardW * 0.5, y + 54, 'fntM1', {
        align: 'center',
        maxWidth: cardW - 10,
        color: '#ffe047',
        outline: true,
      });
      if (def) {
        this.fonts.draw(ctx, def.description, x + cardW * 0.5, y + 54 + titleRes.height + 5, 'fntSmall', {
          align: 'center',
          maxWidth: cardW - 12,
          outline: true,
        });
      }

      this.regions.push({
        id: rid,
        x,
        y: cardY - 4,
        w: cardW,
        h: cardH + 4,
        onActivate: () => ({ type: 'pick_ultra', index: i, ultraId }),
      });
    }

    const uInput = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const uPrompt =
      uInput === 'gamepad'
        ? `@d[L/R] BROWSE  [${g.confirm}] CONFIRM ULTRA`
        : uInput === 'touch'
          ? '@dTAP AN ULTRA CARD TO EVOLVE'
          : '@dCLICK OR KEYS 1-2 / ENTER TO EVOLVE';
    this.fonts.draw(ctx, uPrompt, cx, height - 14, 'fntSmall', {
      align: 'center',
      outline: true,
    });
  }

  // --------------------------------------------------------------------------
  // 4. PAUSED SCREEN (EXACT MATCH TO 21_paused.png & part_4.mp4 00:25..00:42!)
  // --------------------------------------------------------------------------

  private renderPauseOverlay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState, save } = mctx;
    const isWide = width >= 380;
    const cx = Math.round(width * 0.5);

    // 1. Uniformly dimmed frozen gameplay directly visible underneath (exact match to 21_paused.png!)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(0, 0, width, height);

    // 2. Sleek ragged top HUD ink bar (matches 21_paused.png top bar!)
    drawPauseCornerInkSplats(ctx, width, height, 'top');

    // 3. HUGE Mutant Portrait rising cleanly on the LEFT side (unclipped revolver & arm, exact match to 21_paused.png!)
    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);
    const skin: 'a' | 'b' = simState?.player.skin ?? save.selectedSkins[mutant.id] ?? 'a';
    const portSpriteName =
      skin === 'b' && mutant.sprites.bPortrait && this.sprites.hasSprite(mutant.sprites.bPortrait)
        ? mutant.sprites.bPortrait
        : mutant.sprites.portrait;
    const portDef = this.sprites.getSprite(portSpriteName);
    const portraitFrame = computePortraitFrame(
      mutant.raceIndex,
      skin,
      portDef?.frames.length ?? 24,
    );
    const portZoneW = isWide ? 186 : 122;
    const portTopY = 34;
    const portBotY = height - 22;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, portTopY, portZoneW, portBotY - portTopY);
    ctx.clip();
    let drewBigPort = false;
    if (portDef && this.sprites.hasSprite(portSpriteName)) {
      const fIdx = Math.max(0, Math.min(portDef.frames.length - 1, portraitFrame));
      const fRect = portDef.frames[fIdx];
      const srcH = fRect?.targetH ?? portDef.height;
      const srcW = fRect?.targetW ?? portDef.width;
      const scale = srcH <= 92 ? (isWide ? 2 : 1) : 1;
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const left = Math.max(-10, Math.round(Math.min(0, (portZoneW - drawW) * 0.25)));
      const top = Math.max(portTopY, Math.round(portBotY - drawH + 8));
      const drawX = Math.round(left - Math.round((fRect?.targetX ?? 0) - portDef.originX) * scale);
      const drawY = Math.round(top - Math.round((fRect?.targetY ?? 0) - portDef.originY) * scale);
      drewBigPort = this.sprites.draw(ctx, portSpriteName, drawX, drawY, {
        frame: fIdx,
        scaleX: scale,
        scaleY: scale,
        pixelSnap: true,
      });
    }
    if (!drewBigPort) {
      this.drawSpriteIntegerCentered(ctx, mutant.sprites.idle, 0, 8, 70, 72, 72, { allow2x: true });
    }
    ctx.restore();

    // 4. Organic angled diagonal spiky corner ink-splats OVER portrait base (leaving CENTER arena visible!)
    drawPauseCornerInkSplats(ctx, width, height, 'bottom');

    // 5. Full-bright Top-Left Gameplay HUD + Top-Right interactive mutations on top of top ink bar!
    if (simState) {
      renderTopLeftGameplayHud(ctx, {
        sprites: this.sprites,
        fonts: this.fonts,
        data: this.data,
        isSteamMode: this.isSteamMode,
        state: simState,
        inputMode: mctx.inputMode ?? 'kbm',
        gamepadFamily: mctx.gamepadFamily ?? 'generic',
      });

      const ownedTotal = simState.player.mutations.length + (simState.player.ultra ? 1 : 0);
      if (this.pauseInspectIdx >= ownedTotal) {
        this.pauseInspectIdx = ownedTotal > 0 ? ownedTotal - 1 : -1;
      }
      this.drawTopRightHudIcons(ctx, simState, width, { interactivePause: true });
    }

    // 6. Larger bold chunky white-outlined `PAUSED` (1.25x!) + Area/Kills ink-splats + Road Map!
    const centerAnchorX = isWide ? cx + 16 : cx + 22;
    drawChunkyMenuText(ctx, 'PAUSED', centerAnchorX, 56, false, '#ffffff', { scale: 1.25 });

    const areaText = simState
      ? simState.loop > 0
        ? `L${simState.loop} ${simState.areaCode}`
        : simState.areaCode
      : save.bestArea;
    const kills = simState?.stats.kills ?? 0;

    const badgeY = 88;
    const leftSplatX = centerAnchorX - 74;
    const rightSplatX = centerAnchorX + 12;
    drawInkSplatBanner(ctx, leftSplatX, badgeY, 50, 12, 17);
    drawInkSplatBanner(ctx, rightSplatX, badgeY, 58, 12, 53);

    this.fonts.draw(ctx, areaText, leftSplatX + 25, badgeY + 2, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    const drewSkull = this.drawSpriteIntegerCentered(ctx, 'sprKillsIcon', 0, rightSplatX + 6, badgeY + 1, 10, 10);
    if (!drewSkull) {
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(rightSplatX + 8, badgeY + 3, 6, 6);
    }
    this.fonts.draw(ctx, String(kills), rightSplatX + 22, badgeY + 2, 'fntM1', {
      color: '#ffffff',
      outline: true,
    });

    // Horizontal red/white run progression road map directly below!
    drawRunRoadMap(
      ctx,
      this.sprites,
      this.data,
      {
        areaCode: simState?.areaCode ?? save.bestArea,
        mutant: mutant.id,
        skin,
        loop: simState?.loop ?? 0,
        victory: false,
      },
      centerAnchorX,
      118,
    );

    // Inspected Mutation / Ultra clean ink-splat tooltip (only when hovered or L/R inspected!)
    if (simState && this.pauseInspectIdx >= 0) {
      const muts = simState.player.mutations;
      let tipTitle = '';
      let tipDesc = '';
      if (this.pauseInspectIdx < muts.length) {
        const def = this.data.getMutation(muts[this.pauseInspectIdx]!);
        if (def) {
          tipTitle = `@g${def.name}`;
          tipDesc = def.description.replace(/#/g, ' ');
        }
      } else if (simState.player.ultra) {
        const uDef = this.data.getUltra(simState.player.ultra);
        if (uDef) {
          tipTitle = `@yULTRA: ${uDef.name}`;
          tipDesc = uDef.description;
        }
      }
      if (tipTitle) {
        drawInkSplatBanner(ctx, centerAnchorX - 88, 138, 176, 22, 89);
        this.fonts.draw(ctx, tipTitle, centerAnchorX, 140, 'fntSmall', { align: 'center', outline: true });
        this.fonts.draw(ctx, tipDesc, centerAnchorX, 149, 'fntSmall', {
          align: 'center',
          maxWidth: 168,
          outline: true,
        });
      }
    }

    // 7. Bottom-left bold jagged chunky menu items with authentic subtle diagonal tilt: MENU & RETRY
    this.drawChunkyButton(
      ctx,
      'pause_campfire',
      8,
      height - 62,
      'MENU',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { focused: this.focusedIndex === 3, align: 'left', tilt: -0.45 },
    );
    this.drawChunkyButton(
      ctx,
      'pause_restart',
      16,
      height - 36,
      'RETRY',
      () => ({ type: 'restart' }),
      { focused: this.focusedIndex === 2, align: 'left', tilt: -0.45 },
    );

    // 8. Bottom-right bold jagged chunky menu items with authentic subtle diagonal tilt: SETTINGS & CONTINUE
    this.drawChunkyButton(
      ctx,
      'pause_options',
      width - 8,
      height - 64,
      'SETTINGS',
      () => ({ type: 'open_screen', screen: 'options' }),
      { focused: this.focusedIndex === 1, align: 'right', tilt: 0.45 },
    );
    this.drawChunkyButton(
      ctx,
      'pause_resume',
      width - 8,
      height - 36,
      'CONTINUE',
      () => ({ type: 'resume' }),
      { focused: this.focusedIndex === 0, align: 'right', tilt: 0.45 },
    );

    // 9. Bottom thin black footer labels + run timer (matches 21_paused.png!)
    const pauseMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const leftFooter =
      pauseMode === 'gamepad'
        ? `RETRY [${g.retry}]`
        : 'KRUNKED THRONE';
    this.fonts.draw(ctx, leftFooter, 8, height - 10, 'fntSmall', {
      color: '#a8a8b2',
      shadow: false,
    });
    if (simState) {
      this.fonts.draw(ctx, formatRunTimer(simState.stats.timeTicks), width - 6, height - 11, 'fntM1', {
        align: 'right',
        color: '#ffffff',
        outline: true,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 5. SETTINGS / OPTIONS (EXACT MATCH TO 22_settings_video.png & part_5.mp4!)
  // --------------------------------------------------------------------------

  private drawOrangeBackArrow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    hovered: boolean,
  ): void {
    const col = hovered ? '#ff8844' : '#d84e24';
    const hi = hovered ? '#ffd488' : '#ff7b40';
    // Crisp 1x curved Nuclear Throne back-arrow icon (matches top-left of 22_settings_video.png!)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y + 4, 8, 5);
    ctx.fillRect(x + 2, y + 2, 5, 9);
    ctx.fillRect(x + 6, y + 4, 8, 9);
    ctx.fillRect(x + 4, y + 10, 10, 5);

    ctx.fillStyle = col;
    // Arrowhead pointing left
    ctx.fillRect(x + 1, y + 6, 6, 2);
    ctx.fillRect(x + 3, y + 4, 4, 6);
    ctx.fillRect(x + 5, y + 3, 2, 8);
    // Curved U-stem looping down and left
    ctx.fillRect(x + 7, y + 5, 5, 3);
    ctx.fillRect(x + 10, y + 6, 3, 7);
    ctx.fillRect(x + 5, y + 11, 7, 3);
    ctx.fillStyle = hi;
    ctx.fillRect(x + 3, y + 5, 3, 1);
    ctx.fillRect(x + 7, y + 5, 4, 1);
  }

  private drawGamepadABXYBadges(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const badges: ReadonlyArray<[string, string]> = [
      ['A', '#44d844'],
      ['B', '#e83830'],
      ['X', '#3890f0'],
      ['Y', '#f0d030'],
    ];
    for (let i = 0; i < badges.length; i++) {
      const [letter, col] = badges[i]!;
      const bx = x + i * 11;
      ctx.fillStyle = '#000000';
      ctx.fillRect(bx, y, 9, 9);
      ctx.fillStyle = col;
      ctx.fillRect(bx + 1, y + 1, 7, 7);
      this.fonts.draw(ctx, letter, bx + 5, y + 2, 'fntSmall', {
        align: 'center',
        color: '#0c0a10',
        shadow: false,
      });
    }
  }

  private renderOptionsScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, save, returnScreenFromOptions, rebindingField, simState, timeSec } = mctx;
    const inputMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const cx = Math.round(width * 0.5);

    // 1. Dimmed frozen gameplay (from Pause) OR dimmed purple portal vortex (from Title) — NO modal box!
    if (returnScreenFromOptions === 'paused' && simState) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(0, 0, width, height);
    } else {
      drawPortalVortex(ctx, width, height, timeSec, false);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Jagged pure-black ink-splat top & bottom edge banners (matches 22_settings_video.png!)
    drawEdgeInkSplats(ctx, width, height, 22, 20, 8);

    // 3. Top-left curved orange BACK arrow + label (preserves opt_back hit region & gamepad BACK [O]!)
    const backHovered = this.hoveredId === 'opt_back';
    this.drawOrangeBackArrow(ctx, 6, 4, backHovered);
    this.fonts.draw(
      ctx,
      inputMode === 'gamepad' ? `BACK [${g.back}]` : 'BACK',
      22,
      8,
      'fntSmall',
      { color: backHovered ? '#ffffff' : '#b8b6c2', outline: true },
    );
    this.regions.push({
      id: 'opt_back',
      x: 4,
      y: 2,
      w: 58,
      h: 18,
      onActivate: () => ({ type: 'open_screen', screen: returnScreenFromOptions }),
    });

    // 4. Bold chunky centered OPTIONS header
    drawChunkyMenuText(ctx, 'OPTIONS', cx, 5, false, '#ffffff');

    if (inputMode === 'gamepad') {
      this.fonts.draw(ctx, `@d[${g.prevTab}/${g.nextTab}]`, width - 8, 8, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }

    // 5. Compact borderless category tabs directly underneath (`VIDEO/AUDIO`, `CONTROLS`, `KEYBINDS`)
    const tabY = 26;
    const tabs: ReadonlyArray<{ id: string; tab: OptionsTab; label: string }> = [
      { id: 'opt_tab_general', tab: 'general', label: 'VIDEO/AUDIO' },
      { id: 'opt_tab_controls', tab: 'controls', label: 'CONTROLS' },
      { id: 'opt_tab_keybinds', tab: 'keybinds', label: 'KEYBINDS' },
    ];
    const tabW = 78;
    const tabGap = 10;
    const tabStartX = cx - Math.floor((tabW * 3 + tabGap * 2) / 2);

    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i]!;
      const tx = tabStartX + i * (tabW + tabGap);
      const active = this.optionsTab === t.tab;
      const hov = this.hoveredId === t.id;
      if (active) {
        drawInkSplatBanner(ctx, tx + 4, tabY, tabW - 8, 10, i * 19);
        ctx.fillStyle = '#44d844';
        ctx.fillRect(tx + 12, tabY + 10, tabW - 24, 1);
      }
      this.fonts.draw(ctx, t.label, tx + Math.floor(tabW * 0.5), tabY + 2, 'fntSmall', {
        align: 'center',
        color: active || hov ? '#ffffff' : '#969696',
        outline: true,
      });
      this.regions.push({
        id: t.id,
        x: tx,
        y: tabY - 1,
        w: tabW,
        h: 13,
        onActivate: () => {
          this.optionsTab = t.tab;
          this.focusedIndex = 0;
          return { type: 'ui_sfx', sound: 'sndClick' };
        },
      });
    }

    // 6. Crisp borderless two-column list matching 22_settings_video.png!
    const colSpan = Math.min(248, width - 28);
    const colLeft = cx - Math.floor(colSpan * 0.5);
    const colVal = colLeft + Math.round(colSpan * 0.54);
    let y = 44;

    if (this.optionsTab === 'general') {
      const rowStep = 17;

      // 0: ASPECT RATIO
      this.drawSettingsToggleRow(
        ctx,
        'opt_widescreen',
        colLeft,
        colVal,
        y,
        colSpan,
        'ASPECT RATIO',
        save.render.widescreen ? '16:9' : '4:3',
        () => ({ type: 'update_render', partial: { widescreen: !save.render.widescreen } }),
        { focused: this.focusedIndex === 0 },
      );
      y += rowStep;

      // 1: FRAMERATE
      const curTargetFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
      this.drawSettingsToggleRow(
        ctx,
        'opt_fps',
        colLeft,
        colVal,
        y,
        colSpan,
        'FRAMERATE',
        `${curTargetFps}`,
        () => {
          const nextFps = cycleTargetFps(curTargetFps);
          return {
            type: 'update_render',
            partial: { targetFps: nextFps, classic30Fps: nextFps === 30 },
          };
        },
        { focused: this.focusedIndex === 1 },
      );
      y += rowStep;

      // 2: CROSSHAIR (3/9 + crisp 1x sprCrosshair right beside it — matches 22_settings_video.png!)
      this.drawSettingsToggleRow(
        ctx,
        'opt_crosshair',
        colLeft,
        colVal,
        y,
        colSpan,
        'CROSSHAIR',
        `${save.render.crosshairStyle + 1}/9`,
        () => ({
          type: 'update_render',
          partial: { crosshairStyle: (save.render.crosshairStyle + 1) % 9 },
        }),
        {
          focused: this.focusedIndex === 2,
          afterDraw: (valRightX, ry) => {
            this.sprites.draw(ctx, 'sprCrosshair', valRightX + 12, ry + 4, {
              frame: save.render.crosshairStyle,
              scaleX: 1,
              scaleY: 1,
              pixelSnap: true,
            });
          },
        },
      );
      y += rowStep;

      // 3: HUD FPS
      this.drawSettingsToggleRow(
        ctx,
        'opt_showfps',
        colLeft,
        colVal,
        y,
        colSpan,
        'HUD FPS',
        save.render.showFps ? 'ON' : 'OFF',
        () => ({ type: 'update_render', partial: { showFps: !save.render.showFps } }),
        { focused: this.focusedIndex === 3 },
      );
      y += rowStep;

      // 4: AUDIO
      this.drawSettingsToggleRow(
        ctx,
        'opt_mute',
        colLeft,
        colVal,
        y,
        colSpan,
        'AUDIO',
        save.audio.muted ? 'MUTED' : 'ON',
        () => ({ type: 'update_audio', partial: { muted: !save.audio.muted } }),
        { focused: this.focusedIndex === 4 },
      );
      y += rowStep;

      // 5..9: Bright green filled slider bars with white-outlined percentage!
      this.drawSettingsSliderRow(
        ctx,
        'opt_shake',
        colLeft,
        colVal,
        y,
        colSpan,
        'SCREENSHAKE',
        save.render.screenShakeScale,
        (v) => ({ type: 'update_render', partial: { screenShakeScale: v } }),
        { focused: this.focusedIndex === 5 },
      );
      y += rowStep;

      this.drawSettingsSliderRow(
        ctx,
        'opt_vol_master',
        colLeft,
        colVal,
        y,
        colSpan,
        'MASTER VOL',
        save.audio.masterVolume,
        (v) => ({ type: 'update_audio', partial: { masterVolume: v } }),
        { focused: this.focusedIndex === 6 },
      );
      y += rowStep;

      this.drawSettingsSliderRow(
        ctx,
        'opt_vol_sfx',
        colLeft,
        colVal,
        y,
        colSpan,
        'SFX VOLUME',
        save.audio.sfxVolume,
        (v) => ({ type: 'update_audio', partial: { sfxVolume: v } }),
        { focused: this.focusedIndex === 7 },
      );
      y += rowStep;

      this.drawSettingsSliderRow(
        ctx,
        'opt_vol_music',
        colLeft,
        colVal,
        y,
        colSpan,
        'MUSIC VOL',
        save.audio.musicVolume,
        (v) => ({ type: 'update_audio', partial: { musicVolume: v } }),
        { focused: this.focusedIndex === 8 },
      );
      y += rowStep;

      this.drawSettingsSliderRow(
        ctx,
        'opt_vol_amb',
        colLeft,
        colVal,
        y,
        colSpan,
        'AMBIENCE',
        save.audio.ambienceVolume,
        (v) => ({ type: 'update_audio', partial: { ambienceVolume: v } }),
        { focused: this.focusedIndex === 9 },
      );

      const genFooter =
        inputMode === 'gamepad'
          ? `@d[UP/DN] SELECT  [L/R] ADJUST  [${g.confirm}] TOGGLE  [${g.back}] BACK`
          : '@dCLICK, DRAG, OR ARROWS - SETTINGS AUTO-SAVE';
      this.fonts.draw(ctx, genFooter, cx, height - 11, 'fntSmall', { align: 'center' });
    } else if (this.optionsTab === 'controls') {
      const ctrl = save.controls;
      const rowStep = 19;

      this.drawSettingsToggleRow(
        ctx,
        'opt_ctrl_aim_assist',
        colLeft,
        colVal,
        y,
        colSpan,
        'AIM ASSIST',
        ctrl.gamepadAimAssist ? 'ON' : 'OFF',
        () => ({ type: 'update_controls', partial: { gamepadAimAssist: !ctrl.gamepadAimAssist } }),
        { focused: this.focusedIndex === 0 },
      );
      y += rowStep;

      this.drawSettingsToggleRow(
        ctx,
        'opt_ctrl_rumble',
        colLeft,
        colVal,
        y,
        colSpan,
        'RUMBLE',
        ctrl.gamepadRumble ? 'ON' : 'OFF',
        () => ({ type: 'update_controls', partial: { gamepadRumble: !ctrl.gamepadRumble } }),
        { focused: this.focusedIndex === 1 },
      );
      y += rowStep;

      const dzNorm =
        (ctrl.gamepadDeadzone - MIN_GAMEPAD_DEADZONE) /
        (MAX_GAMEPAD_DEADZONE - MIN_GAMEPAD_DEADZONE);
      this.drawSettingsSliderRow(
        ctx,
        'opt_ctrl_deadzone',
        colLeft,
        colVal,
        y,
        colSpan,
        'DEADZONE',
        dzNorm,
        (norm) => {
          const mapped =
            MIN_GAMEPAD_DEADZONE + norm * (MAX_GAMEPAD_DEADZONE - MIN_GAMEPAD_DEADZONE);
          return {
            type: 'update_controls',
            partial: { gamepadDeadzone: Math.round(mapped * 100) / 100 },
          };
        },
        {
          focused: this.focusedIndex === 2,
          valueText: `${Math.round(ctrl.gamepadDeadzone * 100)}%`,
        },
      );
      y += rowStep;

      // Keep exact text expected by controller-integration tests!
      const touchHovered = this.hoveredId === 'opt_ctrl_touch' || this.focusedIndex === 3;
      if (touchHovered) {
        drawInkSplatBanner(ctx, colLeft - 6, y - 1, colSpan + 12, 12, 91);
      }
      this.fonts.draw(
        ctx,
        ctrl.touchMode === 'auto'
          ? 'TOUCH STICKS: @gAUTO (TOUCH ONLY)'
          : 'TOUCH STICKS: @dOFF',
        colLeft,
        y + 1,
        'fntM1',
        { color: touchHovered ? '#ffffff' : '#969696', outline: true },
      );
      this.regions.push({
        id: 'opt_ctrl_touch',
        x: colLeft - 6,
        y: y - 2,
        w: colSpan + 12,
        h: 14,
        onActivate: () => ({
          type: 'update_controls',
          partial: { touchMode: ctrl.touchMode === 'auto' ? 'off' : 'auto' },
        }),
      });
      y += rowStep + 2;

      // Color-coded A B X Y Gamepad Style row (matches part_5.mp4 00:05!)
      this.fonts.draw(ctx, 'GAMEPAD STYLE', colLeft, y + 1, 'fntM1', {
        color: '#969696',
        outline: true,
      });
      this.drawGamepadABXYBadges(ctx, colVal, y);
      this.fonts.draw(ctx, g.familyLabel, colVal + 46, y + 2, 'fntSmall', {
        color: '#ffffff',
        outline: true,
      });
      y += 18;

      // Clean borderless controller status & live telemetry / rumble test region
      const canTestRumble = Boolean(mctx.gamepadConnected || inputMode === 'touch');
      const cardHovered = canTestRumble && this.hoveredId === 'opt_ctrl_pad_status';
      drawInkSplatBanner(ctx, colLeft - 2, y, colSpan + 4, 48, 37);

      if (canTestRumble) {
        this.regions.push({
          id: 'opt_ctrl_pad_status',
          x: colLeft,
          y,
          w: colSpan,
          h: 48,
          onActivate: () => ({ type: 'test_rumble' }),
        });
      }

      const rawName = (mctx.gamepadName ?? '').trim().toUpperCase();
      const shortName = rawName.length > 18 ? `${rawName.slice(0, 17).trimEnd()}.` : rawName;
      const padLine = mctx.gamepadConnected
        ? `@g${g.familyLabel}: @w${shortName || 'CONNECTED'}`
        : '@dNO CONTROLLER DETECTED - PRESS ANY PAD BUTTON';
      this.fonts.draw(ctx, padLine, cx, y + 4, 'fntSmall', {
        align: 'center',
        maxWidth: colSpan - 8,
        outline: true,
      });

      const dbg = mctx.gamepadDebug;
      if (mctx.gamepadConnected && dbg) {
        const padSize = 12;
        const padY = y + 16;
        const clampUnit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
        const lsX = colLeft + 4;
        ctx.fillStyle = '#14121c';
        ctx.fillRect(lsX, padY, padSize, padSize);
        drawPixelBorder(ctx, lsX, padY, padSize, padSize, '#504866', 1);
        ctx.fillStyle = '#52e864';
        ctx.fillRect(
          Math.round(lsX + 5 + clampUnit(dbg.lx) * 4),
          Math.round(padY + 5 + clampUnit(dbg.ly) * 4),
          2,
          2,
        );
        const rsX = colLeft + colSpan - 4 - padSize;
        ctx.fillStyle = '#14121c';
        ctx.fillRect(rsX, padY, padSize, padSize);
        drawPixelBorder(ctx, rsX, padY, padSize, padSize, '#504866', 1);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(
          Math.round(rsX + 5 + clampUnit(dbg.rx) * 4),
          Math.round(padY + 5 + clampUnit(dbg.ry) * 4),
          2,
          2,
        );
      }

      this.fonts.draw(
        ctx,
        `@yLS@w MOVE @yRS@w AIM @y${g.fire}/${g.nextTab}@w FIRE @y${g.active}/${g.prevTab}@w ACT`,
        cx,
        y + 15,
        'fntSmall',
        { align: 'center', outline: true },
      );
      this.fonts.draw(
        ctx,
        `@y${g.swap}@w SWAP @y${g.confirm}/${g.pickup}@w USE @y${g.pause}@w PAUSE @y${g.retry}@w RETRY`,
        cx,
        y + 25,
        'fntSmall',
        { align: 'center', outline: true },
      );
      const rumbleLine = mctx.gamepadConnected
        ? `@b[${g.pickup}] TEST RUMBLE${cardHovered ? ' @y(CLICK)' : ''}`
        : inputMode === 'touch'
          ? '@bTAP TO TEST HAPTICS'
          : '@dXBOX / PLAYSTATION / NINTENDO / TESLA READY';
      this.fonts.draw(ctx, rumbleLine, cx, y + 36, 'fntSmall', {
        align: 'center',
        outline: mctx.gamepadConnected,
      });

      const ctrlFooter =
        inputMode === 'gamepad'
          ? `@d[${g.prevTab}/${g.nextTab}] TABS  [L/R] ADJUST  [${g.confirm}] TOGGLE  [${g.back}] BACK`
          : '@dPC / TESLA GAMEPAD + TOUCH AUTO-DETECT';
      this.fonts.draw(ctx, ctrlFooter, cx, height - 11, 'fntSmall', { align: 'center' });
    } else {
      // Borderless Keybinds list matching part_5.mp4 00:09!
      const rowStep = 17;
      for (let i = 0; i < KEYBIND_LABELS.length; i++) {
        const entry = KEYBIND_LABELS[i]!;
        const ry = y + i * rowStep;
        const isListening = rebindingField === entry.field;
        const rid = `opt_kb_${entry.field}`;
        const hovered = this.hoveredId === rid || this.focusedIndex === i || isListening;

        if (hovered) {
          drawInkSplatBanner(ctx, colLeft - 6, ry - 1, colSpan + 12, 12, i * 13);
        }

        this.fonts.draw(ctx, entry.label, colLeft, ry + 1, 'fntM1', {
          color: hovered ? '#ffffff' : '#969696',
          outline: true,
        });

        const keyText = isListening
          ? 'PRESS KEY...'
          : formatKeyCode(save.keybinds[entry.field]);

        if (hovered) {
          ctx.fillStyle = isListening ? '#ffe047' : '#ffffff';
          ctx.fillRect(colVal - 3, ry - 1, Math.max(24, keyText.length * 6 + 6), 11);
          this.fonts.draw(ctx, keyText, colVal, ry + 1, 'fntM1', {
            color: '#0c0a10',
            shadow: false,
          });
        } else {
          this.fonts.draw(ctx, keyText, colVal, ry + 1, 'fntM1', {
            color: '#969696',
            outline: true,
          });
        }

        this.regions.push({
          id: rid,
          x: colLeft - 6,
          y: ry - 2,
          w: colSpan + 12,
          h: 14,
          onActivate: () => ({ type: 'begin_rebind', field: entry.field }),
        });
      }

      const resetY = y + KEYBIND_LABELS.length * rowStep + 4;
      const resetHovered = this.hoveredId === 'opt_kb_reset' || this.focusedIndex === 8;
      if (resetHovered) {
        drawInkSplatBanner(ctx, cx - 64, resetY - 1, 128, 13, 101);
      }
      this.fonts.draw(ctx, 'RESET DEFAULTS', cx, resetY + 1, 'fntM1', {
        align: 'center',
        color: resetHovered ? '#ff8a38' : '#969696',
        outline: true,
      });
      this.regions.push({
        id: 'opt_kb_reset',
        x: cx - 64,
        y: resetY - 2,
        w: 128,
        h: 15,
        onActivate: () => ({ type: 'reset_keybinds' }),
      });

      const kbHint = rebindingField
        ? '@yLISTENING FOR KEY - PRESS ESC TO CANCEL'
        : '@dCLICK OR ENTER TO REBIND - CONFLICTS AUTO-SWAP';
      this.fonts.draw(ctx, kbHint, cx, height - 11, 'fntSmall', {
        align: 'center',
        outline: Boolean(rebindingField),
      });
    }
  }

  // --------------------------------------------------------------------------
  // 6. GAME OVER (02_gameover.png, 03_portal_gen.png) & VICTORY (23_victory.png)
  // --------------------------------------------------------------------------

  private renderEndScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
    victory: boolean,
  ): void {
    const { width, height, simState, save } = mctx;
    const cx = Math.round(width * 0.5);

    // 1. Dimmed frozen gameplay directly visible underneath (ZERO opaque dark modal card!)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(0, 0, width, height);

    // 2. Iconic 28px pure #000000 top & bottom letterbox bars + corner ink splats
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 28);
    ctx.fillRect(0, height - 28, width, 28);
    drawInkSplatBanner(ctx, width - 84, 18, 88, 12, 61);
    drawInkSplatBanner(ctx, -6, height - 36, 92, 12, 83);

    // 3. Top-right owned mutations + ultra + crown on the top black bar (matches 23_victory.png!)
    this.drawTopRightHudIcons(ctx, simState, width);

    // 4. Bold centered white-outlined headline (matches 02_gameover.png & 23_victory.png!)
    const areaCode: AreaCode | string = simState?.areaCode ?? save.bestArea;
    const loopNum = simState?.loop ?? 0;
    const headline = victory
      ? 'YOU REACHED THE KRUNKED THRONE'
      : loopNum > 0
        ? 'THE STRUGGLE CONTINUES'
        : areaCode.startsWith('7-')
          ? 'YOU ALMOST REACHED THE KRUNKED THRONE'
          : 'YOU DID NOT REACH THE KRUNKED THRONE';
    this.fonts.draw(ctx, headline, cx, 54, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // 5. Middle jagged pure-black ink-splat badges!
    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);
    const endSkin: 'a' | 'b' = simState?.player.skin ?? save.selectedSkins[mutant.id] ?? 'a';
    const kills = simState?.stats.kills ?? 0;
    const timeStr = formatRunTimer(simState?.stats.timeTicks ?? 0);

    const badgeY = 86;
    const leftBlockCx = cx - 48;
    const areaBadgeX = leftBlockCx - 66;
    const killsBadgeX = leftBlockCx + 8;
    const rightBadgeX = cx + 52;

    // Left ink-splat: Area code (`1-3` / `7-3`) or `END1` on Victory!
    const areaBadgeText = victory
      ? `END${loopNum + 1}`
      : loopNum > 0
        ? `L${loopNum} ${areaCode}`
        : areaCode;
    drawInkSplatBanner(ctx, areaBadgeX, badgeY, 48, 12, 19);
    this.fonts.draw(ctx, areaBadgeText, areaBadgeX + 24, badgeY + 2, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // Middle ink-splat: `[skull] <kills>`
    drawInkSplatBanner(ctx, killsBadgeX, badgeY, 52, 12, 43);
    const drewSkull = this.drawSpriteIntegerCentered(ctx, 'sprKillsIcon', 0, killsBadgeX + 6, badgeY + 1, 10, 10);
    if (!drewSkull) {
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(killsBadgeX + 8, badgeY + 3, 6, 6);
    }
    this.fonts.draw(ctx, String(kills), killsBadgeX + 22, badgeY + 2, 'fntM1', {
      color: '#ffffff',
      outline: true,
    });

    // Horizontal red/white run progression road map directly under area + kills!
    drawRunRoadMap(
      ctx,
      this.sprites,
      this.data,
      {
        areaCode,
        mutant: mutant.id,
        skin: endSkin,
        loop: loopNum,
        victory,
      },
      leftBlockCx - 4,
      118,
    );

    if (victory) {
      // Victory right ink-splat: `COMPLETION TIME` + `02:58.97` (exact match to 23_victory.png!)
      drawInkSplatBanner(ctx, rightBadgeX, badgeY, 82, 22, 67);
      this.fonts.draw(ctx, 'COMPLETION TIME', rightBadgeX + 41, badgeY + 2, 'fntSmall', {
        align: 'center',
        color: '#b8b8c4',
        outline: true,
      });
      this.fonts.draw(ctx, timeStr, rightBadgeX + 41, badgeY + 11, 'fntM1', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });
    } else {
      // Game Over right ink-splats: `KILLED BY` + killer sprite + `00:13.33` (exact match to 03_portal_gen.png!)
      drawInkSplatBanner(ctx, rightBadgeX, badgeY, 72, 14, 71);
      this.fonts.draw(ctx, 'KILLED BY', rightBadgeX + 36, badgeY + 3, 'fntM1', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });

      // Killer sprite (or resting mutant corpse fallback) sitting cleanly between KILLED BY and timer!
      const rawCause = (simState?.player.lastDamageCause ?? '').trim().toUpperCase();
      const rawKiller = (simState?.player.lastKillerSprite ?? '').trim();
      const isUnknownCause = !rawCause || rawCause === 'WASTELAND' || rawCause === 'UNKNOWN';
      const deadSpr =
        endSkin === 'b' && mutant.sprites.bDead && this.sprites.hasSprite(mutant.sprites.bDead)
          ? mutant.sprites.bDead
          : mutant.sprites.dead;
      const hasValidKiller =
        !isUnknownCause &&
        rawKiller.length > 0 &&
        rawKiller !== 'sprMutant10Idle' &&
        this.sprites.hasSprite(rawKiller);

      const sprBoxX = rightBadgeX + 18;
      const sprBoxY = badgeY + 15;
      let drewKiller = false;
      if (hasValidKiller) {
        const killerDef = this.sprites.getSprite(rawKiller);
        const killerFrame = resolveDisplaySpriteFrame(killerDef, rawKiller);
        drewKiller = this.drawSpriteIntegerCentered(ctx, rawKiller, killerFrame, sprBoxX, sprBoxY, 36, 26);
      }
      if (!drewKiller) {
        const deadDef = this.sprites.getSprite(deadSpr);
        const deadFrame = resolveDisplaySpriteFrame(deadDef, deadSpr);
        drewKiller = this.drawSpriteIntegerCentered(ctx, deadSpr, deadFrame, sprBoxX, sprBoxY, 36, 26);
      }
      if (!drewKiller) {
        this.drawSpriteIntegerCentered(ctx, 'sprBanditIdle', 0, sprBoxX, sprBoxY, 36, 26);
      }

      // Lower-right ink splat: exact `MM:SS.cc` run timer!
      const timeBadgeY = badgeY + 42;
      drawInkSplatBanner(ctx, rightBadgeX, timeBadgeY, 72, 14, 97);
      this.fonts.draw(ctx, timeStr, rightBadgeX + 36, timeBadgeY + 3, 'fntM1', {
        align: 'center',
        color: '#ffffff',
        outline: true,
      });
    }

    // 6. Centered bottom spiky ink-splatter burst holding bold chunky `MENU` & `RETRY` (matches 03_portal_gen.png & 23_victory.png!)
    ctx.fillStyle = '#000000';
    drawInkSplatBanner(ctx, cx - 38, height - 52, 76, 26, 109);
    drawPixelLine(ctx, cx - 22, height - 48, cx - 34, height - 72, 2);
    drawPixelLine(ctx, cx - 4, height - 50, cx - 10, height - 74, 2);
    drawPixelLine(ctx, cx + 14, height - 50, cx + 26, height - 70, 2);
    drawPixelLine(ctx, cx + 30, height - 46, cx + 52, height - 62, 2);
    drawPixelLine(ctx, cx - 34, height - 44, cx - 54, height - 58, 2);

    this.drawChunkyButton(
      ctx,
      'end_campfire',
      cx,
      height - 58,
      'MENU',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { focused: this.focusedIndex === 1 },
    );
    this.drawChunkyButton(
      ctx,
      'end_retry',
      cx,
      height - 34,
      'RETRY',
      () => ({ type: 'restart' }),
      { focused: this.focusedIndex === 0 },
    );

    // 7. Bottom black bar labels (gamepad hints when controller active, subtle build tag in KBM!)
    const endMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    if (endMode === 'gamepad') {
      this.fonts.draw(
        ctx,
        `@dCAMPFIRE [${g.back}]   RETRY [${g.retry}]`,
        8,
        height - 10,
        'fntSmall',
        { shadow: false },
      );
    }
    this.fonts.draw(ctx, 'KRUNKED THRONE', width - 8, height - 10, 'fntSmall', {
      align: 'right',
      color: '#6e6e78',
      shadow: false,
    });
  }
}
