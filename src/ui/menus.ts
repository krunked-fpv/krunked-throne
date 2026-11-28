import type {
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
  selectLoadingTip,
  type UiDataProvider,
} from './data-provider';
import { computeUltraIconFrame } from './hud';

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

/**
 * Maps any area code (main path, secrets, Crown Vault, Campfire 0-1, IDPD HQ)
 * onto the 0..14 Game Over progression road map.
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
 * Authentic Nuclear Throne hand-brushed jagged ink-splat panel (100% crisp integer fillRect, ZERO sci-fi screws!).
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
    rivets?: boolean;
    rivetColor?: string;
  } = {},
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  const bt = opts.borderThickness ?? 1;

  // Ragged Nuclear Throne outer ink brush-splat silhouette tails behind the panel!
  ctx.fillStyle = '#07050c';
  ctx.fillRect(ix - 2, iy + 4, iw + 4, Math.max(4, ih - 8));
  ctx.fillRect(ix + 5, iy - 2, Math.max(4, iw - 10), ih + 4);
  if (iw >= 50 && ih >= 24) {
    ctx.fillRect(ix - 5, iy + Math.round(ih * 0.20), 6, 3);
    ctx.fillRect(ix + iw - 1, iy + Math.round(ih * 0.16), 7, 3);
    ctx.fillRect(ix - 4, iy + Math.round(ih * 0.72), 5, 2);
    ctx.fillRect(ix + iw - 1, iy + Math.round(ih * 0.78), 6, 2);
    // Tiny ink splatter flecks
    ctx.fillRect(ix - 8, iy + Math.round(ih * 0.21), 2, 1);
    ctx.fillRect(ix + iw + 7, iy + Math.round(ih * 0.17), 2, 2);
  }

  // Deep charcoal-ink core fill
  ctx.fillStyle = opts.fill ?? 'rgba(11, 8, 16, 0.94)';
  ctx.fillRect(ix, iy, iw, ih);

  // Stark high-contrast top accent slash (optional)
  if (opts.topAccent) {
    ctx.fillStyle = opts.topAccent;
    ctx.fillRect(ix + bt, iy + bt, iw - bt * 2, 2);
  }
  drawPixelBorder(ctx, ix, iy, iw, ih, opts.border ?? '#4d455c', bt);
  void opts.rivets;
  void opts.rivetColor;
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
 * (the complete title logo) so it never loops back to partial letters.
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
 * Resolves a visible, non-blank, non-white-flash frame index for Game Over killer/corpse portraits:
 * - Explosion sprites (`sprExplosion`, `sprSmallExplosion`, `sprGreenExplosion`, `sprPlasmaImpact`):
 *   skips solid-white flash frame 0 and selects fiery mid-frame `3` (or closest non-blank mid-frame).
 * - Death/corpse sprites (`sprMutant*Dead`, `spr*Dead`):
 *   scans backwards from last frame skipping `srcW <= 2 || srcH <= 2` dissolve frames
 *   (fixes Horror `sprMutant11Dead` frame 5/6 & Y.V. `sprMutant6Dead` frame 18 empty black box!).
 * - All other sprites: picks first frame with `srcW > 2 && srcH > 2`.
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
 * Guarantees zero pixel overlap across all 12 mutants (including Rogue, Horror, Melting, Y.V., Robot)
 * in both Steam Pack and Built-In Art bitmap fonts.
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
 * Complete Interactive Canvas UI Screen Controller with hit-tested clickable regions,
 * hover feedback, slider dragging, and keyboard/gamepad navigation across all screens:
 * Title, Campfire Mutant Select, Mutation/Ultra Select, Pause, Options, Game Over, Victory.
 */
export class MenuSystem {
  private bundle: AssetBundle;
  private sprites: SpriteRenderer;
  private fonts: BitmapFontRenderer;
  private data: UiDataProvider;

  private regions: HitRegion[] = [];
  private hoveredId: string | null = null;
  private focusedIndex = 0;
  private titleSubCol = 0;
  private campfireRow: 'roster' | 'actions' = 'roster';
  private campfireActionIndex = 3; // 0=skin, 1=crown, 2=gold, 3=go, 4=back
  private pauseInspectIdx = -1; // -1 = mutant summary, 0..muts-1 = mutation, muts = ultra
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
   * Draws a sprite at crisp integer scale (1x or optional integer scale) centered inside a box
   * whenever it fits, avoiding non-integer mixels.
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

    // Complete pending key rebind immediately if a key was captured
    if (ctx.rebindingField && input.capturedKeyCode) {
      actions.push({
        type: 'rebind_key',
        field: ctx.rebindingField,
        code: input.capturedKeyCode,
      });
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
      return actions;
    }

    // Cancel pending key rebind cleanly on Back/B/Escape without leaving Options
    if (ctx.rebindingField && input.back) {
      actions.push({ type: 'cancel_rebind' });
      actions.push({ type: 'ui_sfx', sound: 'sndClickBack' });
      return actions;
    }

    // Clear pointer hover when user navigates via keyboard/gamepad so focus never fights parked cursor
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

    // Pointer hover detection
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

    // Slider dragging (works smoothly for both mouse and touch)
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

    // Screen-specific keyboard & gamepad navigation
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

        // Instant shoulder/face shortcuts — do NOT double-emit sndClick alongside sndMenu* SFX!
        if (input.prevTab) {
          actions.push({ type: 'toggle_bskin', mutant: selectedId });
        }
        if (input.nextTab) {
          actions.push({ type: 'cycle_crown', crown: this.cycleCrownFrom(ctx.save.selectedCrown, 1) });
        }
        if (input.secondary && hasGold) {
          actions.push({ type: 'toggle_golden', enabled: !ctx.save.useGoldenWeapon });
        }

        // Up/Down switches between 12-Mutant Roster and Loadout Action Bar
        if (input.navUp && this.campfireRow === 'roster') {
          this.campfireRow = 'actions';
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navDown && this.campfireRow === 'actions') {
          this.campfireRow = 'roster';
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.campfireRow === 'roster') {
          // Do NOT double-emit sndHover alongside select_mutant (which plays sndMutant*Slct!)
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
        const list = ctx.simState?.pendingMutations ?? [];
        if (list.length === 0) break;
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
          // Keyboard/gamepad inspection across owned mutations + Ultra!
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

    // LB / RB cycles between VIDEO/AUDIO <-> CONTROLS <-> KEYBINDS
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
        if (this.focusedIndex === 0 || this.focusedIndex === 1) {
          this.focusedIndex = this.focusedIndex === 0 ? 1 : 0;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (this.focusedIndex >= 2 && this.focusedIndex <= 4) {
          this.focusedIndex = 2 + ((this.focusedIndex - 2 + dir + 3) % 3);
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
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
          const nextDz = Math.round(
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

    // Keybinds tab (0..7 in 2-col grid, 8 = Reset Defaults)
    const count = KEYBINDS_OPTION_COUNT;
    if (input.navUp) {
      if (this.focusedIndex === 8) {
        this.focusedIndex = 6;
      } else if (this.focusedIndex >= 2) {
        this.focusedIndex -= 2;
      } else {
        this.focusedIndex = 8;
      }
      actions.push({ type: 'ui_sfx', sound: 'sndHover' });
    } else if (input.navDown) {
      if (this.focusedIndex === 8) {
        this.focusedIndex = 0;
      } else if (this.focusedIndex >= 6) {
        this.focusedIndex = 8;
      } else {
        this.focusedIndex += 2;
      }
      actions.push({ type: 'ui_sfx', sound: 'sndHover' });
    } else if ((input.navLeft || input.navRight) && this.focusedIndex < 8) {
      this.focusedIndex = this.focusedIndex % 2 === 0 ? this.focusedIndex + 1 : this.focusedIndex - 1;
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
  // Reusable Crisp Integer Pixel UI Primitives
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
    const accent = opts.accent ?? '#ffe047';

    // Stark Nuclear Throne ink-charcoal button (jagged ink brush streaks on hover/focus, ZERO sci-fi screws!)
    ctx.fillStyle = '#07050c';
    ctx.fillRect(ix - 1, iy + 2, iw + 2, Math.max(2, ih - 4));
    ctx.fillRect(ix + 1, iy + ih, iw, 1);
    if (hovered) {
      ctx.fillRect(ix - 5, iy + Math.floor(ih * 0.25), 5, 3);
      ctx.fillRect(ix + iw, iy + Math.floor(ih * 0.62), 6, 3);
    }

    ctx.fillStyle = hovered ? 'rgba(22, 17, 28, 0.98)' : 'rgba(13, 10, 18, 0.90)';
    ctx.fillRect(ix, iy, iw, ih);
    drawPixelBorder(ctx, ix, iy, iw, ih, hovered ? accent : '#4a4257', 1);

    if (hovered) {
      ctx.fillStyle = accent;
      ctx.fillRect(ix + 2, iy + 2, 2, ih - 4);
      if (isFocused) {
        ctx.fillRect(ix + iw - 4, iy + 2, 2, ih - 4);
      }
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
        color: hovered ? '#ffffff' : '#c8c6d4',
        outline: true,
      },
    );

    this.regions.push({ id, x: ix, y: iy, w: iw, h: ih, onActivate });
  }

  /**
   * Bold Nuclear Throne wasteland menu entry for the Title Screen (replaces generic SaaS boxes!):
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
        // sprMainMenuSplat frame 3 (151x48, orig=(60,34)) -> center around (cx, iy + h/2)
        this.sprites.draw(ctx, 'sprMainMenuSplat', cx - 16, iy + Math.floor(h * 0.5) + 7, {
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

  private drawSliderRow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    label: string,
    value: number,
    onChange: (val: number) => MenuAction,
    opts: { focused?: boolean; valueText?: string } = {},
  ): void {
    const isFocused = Boolean(opts.focused);
    const hovered = this.hoveredId === id || this.activeDragRegionId === id || isFocused;
    const clamped = Math.max(0, Math.min(1, value));
    const barW = 86;
    const barH = 8;
    const barX = Math.round(x + w - barW - 30);
    const barY = Math.round(y + 3);

    if (isFocused) {
      ctx.fillStyle = 'rgba(255, 224, 71, 0.12)';
      ctx.fillRect(x - 3, y - 1, w + 6, 15);
      ctx.fillStyle = '#ffe047';
      ctx.fillRect(x - 3, y, 2, 13);
    }

    this.fonts.draw(ctx, label, x + (isFocused ? 2 : 0), y + 2, 'fntSmall', {
      color: hovered ? '#ffe047' : '#d2d0dc',
      outline: true,
    });

    // Track
    ctx.fillStyle = '#100c16';
    ctx.fillRect(barX, barY, barW, barH);
    const fillW = Math.round((barW - 2) * clamped);
    if (fillW > 0) {
      ctx.fillStyle = hovered ? '#ffe047' : '#52e864';
      ctx.fillRect(barX + 1, barY + 1, fillW, barH - 2);
      ctx.fillStyle = hovered ? '#fff6a6' : '#96ff9e';
      ctx.fillRect(barX + 1, barY + 1, fillW, 2);
    }
    drawPixelBorder(ctx, barX, barY, barW, barH, hovered ? '#ffffff' : '#6b637a', 1);

    // Crisp visible pixel thumb knob!
    const knobW = 5;
    const knobH = 12;
    const knobX = Math.max(barX, Math.min(barX + barW - knobW, barX + 1 + fillW - Math.floor(knobW / 2)));
    const knobY = barY - 2;
    ctx.fillStyle = '#09070e';
    ctx.fillRect(knobX - 1, knobY - 1, knobW + 2, knobH + 2);
    ctx.fillStyle = hovered ? '#ffe047' : '#d4d8e6';
    ctx.fillRect(knobX, knobY, knobW, knobH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(knobX + 1, knobY + 1, knobW - 2, 2);
    ctx.fillStyle = hovered ? '#b88212' : '#7a8094';
    ctx.fillRect(knobX, knobY + knobH - 2, knobW, 2);

    const pct = opts.valueText ?? `${Math.round(clamped * 100)}%`;
    this.fonts.draw(ctx, pct, x + w, y + 2, 'fntSmall', {
      align: 'right',
      color: hovered ? '#ffe047' : '#ffffff',
      outline: true,
    });

    this.regions.push({
      id,
      x: barX - 4,
      y,
      w: barW + 8,
      h: 14,
      onActivate: () => onChange(clamped),
      onDrag: (normX: number) => onChange(Math.round(normX * 20) / 20),
    });
  }

  // --------------------------------------------------------------------------
  // 1. TITLE SCREEN
  // --------------------------------------------------------------------------

  private renderTitleWastelandBackdrop(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number,
  ): void {
    // Steam bakMenu (320x240) when Steam Pack is active!
    if (this.isSteamMode && this.sprites.hasSprite('bakMenu')) {
      // Seamless color-matched wasteland sky & desert side extension behind 320x240 bakMenu in 16:9!
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
      // Subtle atmospheric dim on outer widescreen wings so focus stays naturally centered
      const bx = Math.round((width - 320) * 0.5);
      this.sprites.draw(ctx, 'bakMenu', bx, 0, { frame: 0, pixelSnap: true });
      if (bx > 0) {
        // Smooth 1px-stepped soft dark cinematic edge vignette (ZERO blocky vertical bars!)
        for (let step = 0; step < bx + 20; step++) {
          const distFromEdge = Math.max(0, bx + 20 - step) / (bx + 20);
          const a = distFromEdge * distFromEdge * 0.78;
          ctx.fillStyle = `rgba(10, 7, 14, ${a.toFixed(3)})`;
          ctx.fillRect(step, 0, 1, height);
          ctx.fillRect(width - 1 - step, 0, 1, height);
        }
      }
      ctx.fillStyle = 'rgba(10, 7, 14, 0.20)';
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
      const nextY = i + 1 < skyBands.length ? skyBands[i + 1]![0] : 134;
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

    // Logo (sprLogoGlow softly pulsing behind sprLogo; intro clamps permanently at frame 7)
    const logoY = 56;
    const hasLogo = this.sprites.hasSprite('sprLogo');
    if (hasLogo) {
      if (this.sprites.hasSprite('sprLogoGlow')) {
        const glowPulse = 0.22 + 0.12 * Math.sin(timeSec * 3.0);
        this.sprites.draw(ctx, 'sprLogoGlow', cx, logoY, { alpha: glowPulse, pixelSnap: true });
      }
      const logoSpr = this.sprites.getSprite('sprLogo');
      let logoFrame = computeTitleLogoFrame(timeSec, logoSpr?.frames.length ?? 8);
      // In Steam data.win, sprLogo frame 0 is a 1x1 blank placeholder; skip straight to frame 1 when tiny
      const f0 = logoSpr?.frames[logoFrame];
      if (logoFrame === 0 && f0 && f0.srcW <= 2 && f0.srcH <= 2 && (logoSpr?.frames.length ?? 0) > 1) {
        logoFrame = 1;
      }
      this.sprites.draw(ctx, 'sprLogo', cx, logoY, {
        frame: logoFrame,
        pixelSnap: true,
      });
    } else {
      ctx.fillStyle = 'rgba(255, 110, 40, 0.22)';
      ctx.fillRect(cx - 118, 20, 236, 60);
      ctx.fillStyle = '#160f1c';
      ctx.fillRect(cx - 114, 24, 228, 52);
      drawPixelBorder(ctx, cx - 114, 24, 228, 52, '#ff9838', 2);

      this.fonts.draw(ctx, 'KRUNKED', cx, 33, 'fntL', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
      this.fonts.draw(ctx, 'THRONE', cx, 53, 'fntL', {
        align: 'center',
        color: '#ff5238',
        outline: true,
      });
    }

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
  // 2. CAMPFIRE MUTANT SELECT (ALL 12 MUTANTS)
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
    if (this.isSteamMode && this.sprites.hasSprite('sprFloor0')) {
      // Tile authentic Steam 32x32 sprFloor0 across the campsite clearing!
      const floorSpr = this.sprites.getSprite('sprFloor0')!;
      const fCount = Math.max(1, floorSpr.frames.length);
      for (let ty = 0; ty < height; ty += 32) {
        for (let tx = 0; tx < width; tx += 32) {
          const hash = ((tx * 73) ^ (ty * 151) ^ 0x5a) & 0xff;
          const frame = hash % fCount;
          this.sprites.draw(ctx, 'sprFloor0', tx, ty, { frame, pixelSnap: true });
        }
      }

      // Stepped night atmospheric darkening around outer edges (bright warm clearing in center)
      ctx.fillStyle = 'rgba(10, 7, 14, 0.56)';
      ctx.fillRect(0, 0, width, height);

      // Stepped pixel warm firelight pools around campfire
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

      // Authentic Steam sprLogMenu sitting logs placed around the campfire!
      if (this.sprites.hasSprite('sprLogMenu')) {
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
      }
      return;
    }

    // Built-In Mode: Rich Hi-Bit tiled wasteland night campsite with starry mesa horizon, warm firelight & organic logs!
    const horizonY = 38;
    // 1. Tile our 2x Hi-Bit 64x64 (32x32 logical) sprFloor0 desert clearing floor!
    if (this.sprites.hasSprite('sprFloor0')) {
      const floorSpr = this.sprites.getSprite('sprFloor0')!;
      const fCount = Math.max(1, floorSpr.frames.length);
      for (let ty = horizonY - 6; ty < height; ty += 32) {
        for (let tx = 0; tx < width; tx += 32) {
          const hash = ((tx * 73) ^ (ty * 151) ^ 0x5a) & 0xff;
          this.sprites.draw(ctx, 'sprFloor0', tx, ty, { frame: hash % fCount, pixelSnap: true });
        }
      }
      // Deep atmospheric wasteland night tint over the desert tiles
      ctx.fillStyle = 'rgba(13, 9, 18, 0.70)';
      ctx.fillRect(0, horizonY - 6, width, height - (horizonY - 6));
    } else {
      ctx.fillStyle = '#1f1514';
      ctx.fillRect(0, horizonY, width, height - horizonY);
    }

    // 2. Night twilight sky band at top with pixel stars & silhouetted mesas
    ctx.fillStyle = '#0c0814';
    ctx.fillRect(0, 0, width, 16);
    ctx.fillStyle = '#160e20';
    ctx.fillRect(0, 16, width, 12);
    ctx.fillStyle = '#241624';
    ctx.fillRect(0, 28, width, horizonY - 28);
    // Soft twilight transition strip onto tiled desert clearing
    ctx.fillStyle = '#181016';
    ctx.fillRect(0, horizonY - 2, width, 3);

    for (let s = 0; s < 18; s++) {
      const sx = (s * 59 + 13) % width;
      const sy = 4 + ((s * 17) % 22);
      ctx.fillStyle = (s + Math.floor(timeSec * 2)) % 4 === 0 ? '#ffe9a8' : '#71658a';
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Distant jagged wasteland mesas along horizon
    ctx.fillStyle = '#160e16';
    const mesas: ReadonlyArray<[number, number, number]> = [
      [0.24, 0.34, 12],
      [0.33, 0.42, 7],
      [0.44, 0.56, 11],
      [0.57, 0.66, 15],
    ];
    for (const [m0, m1, mh] of mesas) {
      const mx = Math.round(m0 * width);
      const mw = Math.round((m1 - m0) * width);
      ctx.fillRect(mx, horizonY - mh, mw, mh + 2);
      ctx.fillRect(mx + 3, horizonY - mh - 3, Math.max(4, mw - 6), 3);
      ctx.fillStyle = '#38212b';
      ctx.fillRect(mx + 3, horizonY - mh - 3, Math.max(4, mw - 6), 1);
      ctx.fillStyle = '#160e16';
    }

    // 3. Smooth multi-ring warm amber-orange pixel firelight falloff over the textured tiles!
    const flick = Math.round(Math.sin(timeSec * 12) * 2.5 + Math.cos(timeSec * 21) * 1.5);
    const firePools: ReadonlyArray<[number, number, string]> = [
      [seatRx + 52 + flick, seatRy + 34 + flick, 'rgba(255, 118, 36, 0.07)'],
      [seatRx + 36 + flick, seatRy + 24 + flick, 'rgba(255, 128, 40, 0.08)'],
      [seatRx + 20 + flick, seatRy + 15 + flick, 'rgba(255, 142, 46, 0.09)'],
      [seatRx + 4 + flick, seatRy + 6 + flick, 'rgba(255, 160, 54, 0.10)'],
      [Math.round(seatRx * 0.72) + flick, Math.round(seatRy * 0.74) + flick, 'rgba(255, 180, 66, 0.11)'],
      [Math.round(seatRx * 0.42) + flick, Math.round(seatRy * 0.46) + flick, 'rgba(255, 212, 92, 0.14)'],
      [Math.round(seatRx * 0.22) + flick, Math.round(seatRy * 0.26) + flick, 'rgba(255, 236, 148, 0.16)'],
    ];
    for (const [rx, ry, col] of firePools) {
      ctx.fillStyle = col;
      for (let dy = -ry; dy <= ry; dy++) {
        const norm = dy / Math.max(1, ry);
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - norm * norm)));
        if (span > 0) ctx.fillRect(fireX - span, fireY + 5 + dy, span * 2, 1);
      }
    }

    // 4. Sculpted stone fire-pit ring + rustic bark-textured sitting logs around clearing
    const pitRocks: ReadonlyArray<[number, number]> = [
      [-13, 3], [-8, 8], [-2, 10], [5, 9], [11, 4], [10, -2], [-10, -2],
    ];
    for (const [ox, oy] of pitRocks) {
      ctx.fillStyle = '#100a0c';
      ctx.fillRect(fireX + ox - 2, fireY + oy - 1, 6, 4);
      ctx.fillStyle = '#5c4b47';
      ctx.fillRect(fireX + ox - 1, fireY + oy, 4, 2);
      ctx.fillStyle = '#a8846c';
      ctx.fillRect(fireX + ox - 1, fireY + oy, 2, 1);
    }

    const drawSittingLog = (lx: number, ly: number): void => {
      ctx.fillStyle = 'rgba(6, 4, 10, 0.55)';
      ctx.fillRect(lx - 11, ly + 4, 23, 2);
      ctx.fillStyle = '#120b09';
      ctx.fillRect(lx - 11, ly - 2, 22, 7);
      ctx.fillStyle = '#4e3120';
      ctx.fillRect(lx - 10, ly - 1, 20, 5);
      ctx.fillStyle = '#7d5034';
      ctx.fillRect(lx - 10, ly - 1, 18, 2);
      ctx.fillStyle = '#9e6b46';
      ctx.fillRect(lx - 8, ly - 1, 12, 1);
      ctx.fillStyle = '#331e13';
      ctx.fillRect(lx - 6, ly + 1, 4, 1);
      ctx.fillRect(lx + 2, ly + 2, 5, 1);
      // Cut log wood grain end cap
      ctx.fillStyle = '#a3754e';
      ctx.fillRect(lx + 8, ly, 2, 3);
      ctx.fillStyle = '#d4a678';
      ctx.fillRect(lx + 8, ly, 1, 1);
    };
    drawSittingLog(fireX - Math.round(seatRx * 0.65), fireY + Math.round(seatRy * 0.72));
    drawSittingLog(fireX + Math.round(seatRx * 0.65), fireY + Math.round(seatRy * 0.72));
    drawSittingLog(fireX - Math.round(seatRx * 0.72), fireY - Math.round(seatRy * 0.45));
    drawSittingLog(fireX + Math.round(seatRx * 0.72), fireY - Math.round(seatRy * 0.45));
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

    // Geometry: exact 1x 96x80 portrait + spacious Details Panel + wide non-squished campfire arc!
    const portW = 96;
    const portH = 80;
    const portX = isWide ? 8 : 4;
    const portY = isWide ? 20 : 17;

    const infoW = isWide ? 142 : 138;
    const infoX = width - infoW - (isWide ? 8 : 4);
    const infoY = isWide ? 20 : 17;
    const infoH = isWide ? 138 : 143;

    // Wide campfire clearing:
    // - 16:9: centered cleanly between Portrait (x=104) and Details (x=276)
    // - 4:3: spacious lower-left clearing below Portrait (y=97) and left of Details (x=178),
    //   widening seatRx from 36 -> 70 so Fish & Rogue NEVER squish!
    const fireX = isWide ? 190 : 90;
    const fireY = isWide ? 90 : 131;
    const seatRx = isWide ? 66 : 70;
    const seatRy = isWide ? 38 : 21;

    // 1. Atmospheric tiled wasteland campsite ground, logs & stepped firelight
    this.renderCampfireGround(ctx, width, height, fireX, fireY, seatRx, seatRy, timeSec);

    // 2. Depth-sorted campfire + ALL 12 mutants at CRISP 1.0x INTEGER SCALE!
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
        // Rising flickering embers above flame
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
          // Crisp pixel ground shadow under mutant (zero smooth anti-aliased ellipse!)
          ctx.fillStyle = isSel ? 'rgba(255, 224, 71, 0.34)' : 'rgba(8, 6, 12, 0.50)';
          ctx.fillRect(mx - 6, my + 6, 12, 3);
          ctx.fillRect(mx - 4, my + 5, 8, 5);
          if (isSel) {
            ctx.fillStyle = '#ffe047';
            ctx.fillRect(mx - 7, my + 7, 2, 1);
            ctx.fillRect(mx + 5, my + 7, 2, 1);
          }

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

          // CRISP 1.0x INTEGER PIXEL SCALE FOR ALL 12 MUTANTS (fixes 0.5x Horror & 0.75x mixels!)
          const standLift = isSel ? Math.round(Math.sin(timeSec * 5) * 1) - 3 : 0;

          // Selected Crown floating behind the standing mutant at crisp integer 1x scale!
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

          // Starting or Golden weapon held at crisp 1.0x integer scale!
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

    // 3. Tightly framed integer 1x Big Portrait (96x80 — ZERO giant letterbox bars!)
    ctx.fillStyle = '#0c0912';
    ctx.fillRect(portX, portY, portW, portH);
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
    if (portSprDef && portSprDef.width === portW && portSprDef.height === portH && this.sprites.hasSprite(portSpriteName)) {
      // Exact 1:1 integer pixel draw for 96x80 Built-In portraits (zero scaling, zero letterbox!)
      drewPort = this.sprites.draw(ctx, portSpriteName, portX + portSprDef.originX, portY + portSprDef.originY, {
        frame: portraitFrame,
        pixelSnap: true,
      });
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(portX + 1, portY + 1, portW - 2, portH - 2);
      ctx.clip();
      drewPort = this.sprites.drawInBox(
        ctx,
        portSpriteName,
        portraitFrame,
        portX + 1,
        portY + 1,
        portW - 2,
        portH - 2,
      );
      ctx.restore();
    }
    if (!drewPort) {
      this.drawSpriteIntegerCentered(ctx, idleSpr, Math.floor(timeSec * 4), portX + 8, portY + 8, portW - 16, portH - 16, {
        allow2x: true,
      });
    }
    drawPixelBorder(ctx, portX, portY, portW, portH, skin === 'b' ? '#ffe047' : '#635675', 1);
    // Corner accent rivets on portrait frame
    ctx.fillStyle = skin === 'b' ? '#ffe047' : '#9687ad';
    ctx.fillRect(portX, portY, 3, 1);
    ctx.fillRect(portX, portY, 1, 3);
    ctx.fillRect(portX + portW - 3, portY, 3, 1);
    ctx.fillRect(portX + portW - 1, portY, 1, 3);

    // 16:9 under-portrait loadout summary badge (stored Golden weapon & active Crown icon)
    if (isWide) {
      const subY = portY + portH + 4;
      const subH = 54;
      drawWastelandPlate(ctx, portX, subY, portW, subH, {
        fill: 'rgba(13, 10, 20, 0.90)',
        border: '#5a4e6e',
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

    // 4. Right-Side Mutant Details Panel with DYNAMIC Y layout (ZERO text collisions!)
    if (this.isSteamMode && this.sprites.hasSprite('sprLoadoutSplat')) {
      this.sprites.draw(ctx, 'sprLoadoutSplat', infoX + infoW + 4, infoY + infoH + 2, {
        frame: 3,
        alpha: 0.72,
        pixelSnap: true,
      });
    }
    drawWastelandPlate(ctx, infoX, infoY, infoW, infoH, {
      fill: 'rgba(14, 11, 22, 0.92)',
      border: '#685b80',
      topAccent: '#ffe047',
    });

    this.fonts.draw(ctx, selected.name, infoX + 6, infoY + 5, 'fntM1', {
      color: '#ffe047',
      outline: true,
    });
    this.fonts.draw(ctx, `@r${selected.maxHp} HP`, infoX + infoW - 6, infoY + 6, 'fntSmall', {
      align: 'right',
      outline: true,
    });

    // Subtle divider below header
    ctx.fillStyle = 'rgba(130, 118, 156, 0.35)';
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
        accent: '#ff8a38',
        focused: inActions && this.campfireActionIndex === 4,
      },
    );

    this.fonts.draw(ctx, 'SELECT MUTANT', width * 0.5, 4, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // 6. Uniform-Height Loadout Action Row: SKIN | FULL CROWN NAME | GOLD | GO! (ALL h=18, same rowY!)
    const rowY = 164;
    const btnH = 18;
    const gap = 4;
    const skinW = isWide ? 58 : 48;
    const crownW = isWide ? 124 : 106; // Fits full "CROWN OF PROTECTION" (96px fallback / 76px steam) with ZERO truncation!
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
        accent: '#ffe047',
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
        accent: hasGold ? '#ffe047' : '#5a5268',
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
        accent: '#52e864',
        focused: !inActions || this.campfireActionIndex === 3,
      },
    );

    // 7. Active Crown Effect Description Line + Stored Golden Weapon Info Strip (y = 184..195)
    const effectY = rowY + btnH + 2;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.80)';
    ctx.fillRect(4, effectY, width - 8, 11);
    drawPixelBorder(ctx, 4, effectY, width - 8, 11, crown.id !== 'none' ? 'rgba(201, 107, 255, 0.45)' : 'rgba(92, 82, 112, 0.35)', 1);
    const crownEffectText = crown.description.replace(/#/g, ' - ');
    const statusInfo =
      crown.id !== 'none'
        ? `@p${crown.name}: @s${crownEffectText}${hasGold && !isWide ? `  @y[${storedGoldLabel}]` : ''}`
        : hasGold
          ? `@ySTORED GOLD: @w${storedGoldLabel}  @d- ${crownEffectText}`
          : `@d${crown.name}: ${crownEffectText}`;
    this.fonts.draw(ctx, statusInfo, Math.round(width * 0.5), effectY + 2, 'fntSmall', {
      align: 'center',
      maxWidth: width - 16,
      shadow: true,
    });

    // 8. Bottom 12-Mutant Roster Strip (crisp integer 1x 16x24 sprCharSelect!)
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

      ctx.fillStyle = isSelected
        ? 'rgba(72, 54, 30, 0.96)'
        : hovered
          ? 'rgba(42, 36, 56, 0.92)'
          : 'rgba(16, 13, 22, 0.88)';
      ctx.fillRect(sx, stripY, slotW, slotH);
      drawPixelBorder(
        ctx,
        sx,
        stripY,
        slotW,
        slotH,
        isSelected ? '#ffe047' : hovered ? '#ffffff' : '#4a4358',
        isSelected ? 2 : 1,
      );

      // Draw sprCharSelect (16x24) at exact crisp integer 1x scale!
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

    // Active mutant short name & adaptive input hint under strip
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
  // 3. MUTATION & ULTRA SELECTION SCREEN
  // --------------------------------------------------------------------------

  private renderMutationSelect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState } = mctx;
    const list = simState?.pendingMutations ?? [];

    // Opaque dark backdrop (alpha >= 0.94) so world & portal warp text NEVER bleed through!
    ctx.fillStyle = OPAQUE_MENU_BACKDROP;
    ctx.fillRect(0, 0, width, height);

    if (this.isSteamMode && this.sprites.hasSprite('bakMut')) {
      const bx = Math.round((width - 320) * 0.5);
      this.sprites.draw(ctx, 'bakMut', bx, 0, { frame: 0, alpha: 0.18, pixelSnap: true });
    } else {
      // Subtle stepped radioactive emerald radial stage & wasteland scanlines
      ctx.fillStyle = 'rgba(32, 128, 54, 0.14)';
      ctx.fillRect(Math.round(width * 0.12), 26, Math.round(width * 0.76), height - 56);
      ctx.fillStyle = 'rgba(72, 232, 98, 0.08)';
      ctx.fillRect(Math.round(width * 0.24), 44, Math.round(width * 0.52), height - 92);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      for (let sy = 4; sy < height; sy += 6) {
        ctx.fillRect(0, sy, width, 1);
      }
      ctx.fillStyle = 'rgba(82, 232, 100, 0.35)';
      ctx.fillRect(10, 4, width - 20, 1);
      ctx.fillRect(10, height - 5, width - 20, 1);
    }

    this.fonts.draw(ctx, '@gMUTATION', width * 0.5, 10, 'fntL', {
      align: 'center',
      outline: true,
    });
    const mutInputMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const mutPrompt =
      mutInputMode === 'gamepad'
        ? `@dCHOOSE ONE  ([LS/DPAD] BROWSE  [${g.confirm}] PICK)`
        : mutInputMode === 'touch'
          ? '@dTAP A MUTATION TO SELECT'
          : list.length <= 1
            ? '@dPRESS 1 OR ENTER TO SELECT'
            : `@dCHOOSE ONE  (CLICK OR KEYS 1-${list.length})`;
    this.fonts.draw(ctx, mutPrompt, width * 0.5, 28, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    // Context badge for Horror's 5th choice or Crown of Destiny's single forced choice
    if (list.length >= 5) {
      this.fonts.draw(ctx, '@gHORROR +1 CHOICE', width * 0.5, 38, 'fntSmall', {
        align: 'center',
        outline: true,
      });
    } else if (list.length === 1 && simState?.crown === 'destiny') {
      this.fonts.draw(ctx, '@pCROWN OF DESTINY', width * 0.5, 38, 'fntSmall', {
        align: 'center',
        outline: true,
      });
    }

    if (list.length === 0) return;

    const isWide = width >= 380;
    const cardW = list.length >= 5 ? (isWide ? 66 : 58) : 64;
    const cardH = 74;
    const gap = list.length >= 5 ? (isWide ? 10 : 5) : 10;
    const totalW = list.length * cardW + (list.length - 1) * gap;
    const startX = Math.round((width - totalW) * 0.5);
    const cardY = 54;

    let activeIdx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));

    for (let i = 0; i < list.length; i++) {
      const mutId = list[i]!;
      const def = this.data.getMutation(mutId);
      const rid = `mut_card_${i}`;
      const hovered = this.hoveredId === rid;
      if (hovered) {
        activeIdx = i;
        this.focusedIndex = i;
      }
      const isFocused = i === activeIdx;

      const x = startX + i * (cardW + gap);
      const y = isFocused ? cardY - 6 : cardY;

      // Ornate beveled wasteland mutation card with glowing focus aura & corner rivets!
      if (isFocused) {
        ctx.fillStyle = 'rgba(82, 232, 100, 0.20)';
        ctx.fillRect(x - 2, y - 2, cardW + 4, cardH + 4);
      }
      drawWastelandPlate(ctx, x, y, cardW, cardH, {
        fill: isFocused ? 'rgba(26, 46, 32, 0.97)' : 'rgba(18, 20, 28, 0.93)',
        border: isFocused ? '#52e864' : '#54586c',
        borderThickness: isFocused ? 2 : 1,
        topAccent: isFocused ? '#52e864' : undefined,
        rivetColor: isFocused ? '#b6ffbe' : 'rgba(180, 184, 208, 0.42)',
      });

      // Key badge [1]..[5]
      this.fonts.draw(ctx, `@y[${i + 1}]`, x + 4, y + 5, 'fntSmall', { outline: true });

      // Crisp INTEGER 1x sprSkillIcon (24x32 — ZERO 1.1875x mixels!)
      const drewIcon = def
        ? this.drawSpriteIntegerCentered(
            ctx,
            def.sprite || 'sprSkillIcon',
            def.iconFrame,
            x + Math.floor((cardW - 24) / 2),
            y + 15,
            24,
            32,
          )
        : false;
      if (!drewIcon) {
        ctx.fillStyle = '#4de862';
        ctx.fillRect(x + Math.floor((cardW - 24) / 2), y + 15, 24, 32);
      }

      const name = def ? def.name : mutId.replace(/_/g, ' ').toUpperCase();
      this.fonts.draw(ctx, name, x + Math.floor(cardW * 0.5), y + 50, 'fntSmall', {
        align: 'center',
        maxWidth: cardW - 4,
        lineSpacing: 0,
        color: isFocused ? '#ffffff' : '#b8bec9',
        outline: true,
      });

      this.regions.push({
        id: rid,
        x,
        y: cardY - 6,
        w: cardW,
        h: cardH + 6,
        onActivate: () => ({ type: 'pick_mutation', index: i, mutationId: mutId }),
      });
    }

    // Selected mutation detail box with DYNAMIC Y height (tip NEVER collides on multi-line descriptions!)
    const owned = simState?.player.mutations ?? [];
    const focusedDef = this.data.getMutation(list[activeIdx]!);
    const descBoxW = Math.min(304, width - 16);
    const descX = Math.round((width - descBoxW) * 0.5);
    const trayReserve = owned.length > 0 ? 22 : 8;

    const fontSmall = this.fonts.getFont('fntSmall');
    const smallLH = Math.round((fontSmall ? Math.max(1, fontSmall.lineHeight) : 8) * (fontSmall?.scaleY || 1));
    const descLines = focusedDef
      ? wrapMarkupText(fontSmall, focusedDef.description, descBoxW - 16, 1)
      : [];
    const tipLines = focusedDef
      ? wrapMarkupText(fontSmall, `"${focusedDef.tip}"`, descBoxW - 16, 1)
      : [];
    const descEstH = descLines.length > 0 ? smallLH + (descLines.length - 1) * (smallLH + 1) : smallLH;
    const tipEstH = tipLines.length > 0 ? smallLH + (tipLines.length - 1) * (smallLH + 1) : smallLH;
    const descBoxH = Math.max(46, 20 + descEstH + 4 + tipEstH + 6);
    const descY = Math.min(height - trayReserve - descBoxH, Math.max(cardY + cardH + 6, height - trayReserve - descBoxH));

    drawWastelandPlate(ctx, descX, descY, descBoxW, descBoxH, {
      fill: 'rgba(12, 14, 20, 0.96)',
      border: '#52e864',
      topAccent: 'rgba(82, 232, 100, 0.65)',
    });

    if (focusedDef) {
      this.fonts.draw(ctx, `@y${focusedDef.name}`, width * 0.5, descY + 5, 'fntM1', {
        align: 'center',
        outline: true,
      });
      const descTextY = descY + 18;
      const dRes = this.fonts.draw(ctx, focusedDef.description, width * 0.5, descTextY, 'fntSmall', {
        align: 'center',
        maxWidth: descBoxW - 16,
        outline: true,
      });
      const tipY = descTextY + dRes.height + 4;
      this.fonts.draw(ctx, `@d"${focusedDef.tip}"`, width * 0.5, tipY, 'fntSmall', {
        align: 'center',
        maxWidth: descBoxW - 16,
      });
    }

    // Owned mutations tray cleanly padded inside viewport bottom (never 2px off bottom!)
    if (owned.length > 0) {
      const iconSize = 16;
      const iconStep = 17;
      const maxFit = Math.max(1, Math.floor((width - 16) / iconStep));
      const shown = Math.min(owned.length, maxFit);
      const rowW = shown * iconStep - 1;
      const oxStart = Math.round((width - rowW) * 0.5);
      const oy = height - iconSize - 4;
      for (let i = 0; i < shown; i++) {
        const oDef = this.data.getMutation(owned[i]!);
        const ix = oxStart + i * iconStep;
        const drew = oDef
          ? this.drawSpriteIntegerCentered(ctx, oDef.hudSprite || 'sprSkillIconHUD', oDef.iconFrame, ix, oy, iconSize, iconSize)
          : false;
        if (!drew) {
          ctx.fillStyle = '#4de862';
          ctx.fillRect(ix + 2, oy + 2, 12, 12);
        }
      }
    }
  }

  private renderUltraSelect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState, save } = mctx;
    const list = simState?.pendingUltras ?? [];
    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);

    // Opaque dark backdrop (alpha >= 0.94) so world/portal text never bleeds through!
    ctx.fillStyle = OPAQUE_MENU_BACKDROP;
    ctx.fillRect(0, 0, width, height);

    if (this.isSteamMode && this.sprites.hasSprite('bakMut')) {
      const bx = Math.round((width - 320) * 0.5);
      this.sprites.draw(ctx, 'bakMut', bx, 0, { frame: 0, alpha: 0.18, pixelSnap: true });
    } else {
      // Regal golden Ultra stage aura + horizontal scanlines
      ctx.fillStyle = 'rgba(176, 122, 24, 0.14)';
      ctx.fillRect(Math.round(width * 0.10), 28, Math.round(width * 0.80), height - 58);
      ctx.fillStyle = 'rgba(255, 224, 71, 0.08)';
      ctx.fillRect(Math.round(width * 0.22), 46, Math.round(width * 0.56), height - 92);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      for (let sy = 4; sy < height; sy += 6) {
        ctx.fillRect(0, sy, width, 1);
      }
      ctx.fillStyle = 'rgba(255, 224, 71, 0.42)';
      ctx.fillRect(10, 4, width - 20, 1);
      ctx.fillRect(10, height - 5, width - 20, 1);
    }

    this.fonts.draw(ctx, '@yULTRA MUTATION', width * 0.5, 16, 'fntL', {
      align: 'center',
      outline: true,
    });
    this.fonts.draw(ctx, '@gLEVEL ULTRA REACHED - CHOOSE YOUR PATH', width * 0.5, 36, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    if (list.length === 0) return;

    // Tighter, balanced cards eliminating giant empty dark lower void!
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

      if (isFocused) {
        ctx.fillStyle = 'rgba(255, 224, 71, 0.20)';
        ctx.fillRect(x - 2, y - 2, cardW + 4, cardH + 4);
      }
      drawWastelandPlate(ctx, x, y, cardW, cardH, {
        fill: isFocused ? 'rgba(50, 38, 22, 0.97)' : 'rgba(20, 17, 28, 0.94)',
        border: isFocused ? '#ffe047' : '#655b7c',
        borderThickness: isFocused ? 2 : 1,
        topAccent: isFocused ? '#ffe047' : undefined,
        rivetColor: isFocused ? '#fff5b0' : 'rgba(196, 188, 220, 0.42)',
      });

      this.fonts.draw(ctx, `@y[${i + 1}] ULTRA ${i === 0 ? 'A' : 'B'}`, x + cardW * 0.5, y + 7, 'fntSmall', {
        align: 'center',
        outline: true,
      });

      // Crisp integer 1x sprEGSkillIcon (24x32 — zero fractional scaling!)
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
    this.fonts.draw(ctx, uPrompt, width * 0.5, height - 16, 'fntSmall', {
      align: 'center',
      outline: true,
    });
  }

  // --------------------------------------------------------------------------
  // 4. PAUSE OVERLAY (CLEAN 2-COLUMN NT OVERLAY + KEYBOARD MUTATION INSPECTION)
  // --------------------------------------------------------------------------

  private renderPauseOverlay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState, save } = mctx;
    const cx = Math.round(width * 0.5);

    // Heavy dark opaque backdrop cleanly masking gameplay HUD behind Pause!
    ctx.fillStyle = 'rgba(8, 6, 14, 0.92)';
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(304, width - 16);
    const panelH = 196;
    const px = cx - Math.floor(panelW / 2);
    const py = Math.round((height - panelH) * 0.5);

    // Riveted beveled gunmetal Pause overlay
    drawWastelandPlate(ctx, px, py, panelW, panelH, {
      fill: 'rgba(16, 13, 24, 0.98)',
      border: '#ffe047',
      topAccent: '#ffe047',
      rivetColor: '#fff099',
    });

    this.fonts.draw(ctx, 'PAUSED', cx, py + 7, 'fntL', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    if (simState) {
      const mins = Math.floor((simState.stats.timeTicks / 30) / 60);
      const secs = Math.floor((simState.stats.timeTicks / 30) % 60);
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      const info = `@y${simState.loop > 0 ? `L${simState.loop} ` : ''}${simState.areaCode}  @wKILLS: ${simState.stats.kills}  @gLV ${simState.player.level}  @d${timeStr}`;
      this.fonts.draw(ctx, info, cx, py + 26, 'fntSmall', { align: 'center', outline: true });
    }

    // Subtle divider below header
    ctx.fillStyle = 'rgba(130, 120, 158, 0.35)';
    ctx.fillRect(px + 10, py + 37, panelW - 20, 1);

    // Left Column: Primary Pause Action Buttons
    const btnW = 110;
    const btnH = 20;
    const bx = px + 10;

    this.drawButton(ctx, 'pause_resume', bx, py + 44, btnW, btnH, 'RESUME', () => ({ type: 'resume' }), {
      accent: '#52e864',
      focused: this.focusedIndex === 0,
      font: 'fntSmall',
    });
    this.drawButton(
      ctx,
      'pause_options',
      bx,
      py + 68,
      btnW,
      btnH,
      'OPTIONS',
      () => ({ type: 'open_screen', screen: 'options' }),
      { accent: '#ffe047', focused: this.focusedIndex === 1, font: 'fntSmall' },
    );
    const pauseMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const restartLabel =
      pauseMode === 'gamepad'
        ? `RESTART [${g.retry}]`
        : pauseMode === 'touch'
          ? 'RESTART'
          : 'RESTART [R]';
    this.drawButton(ctx, 'pause_restart', bx, py + 92, btnW, btnH, restartLabel, () => ({ type: 'restart' }), {
      accent: '#ff8a38',
      focused: this.focusedIndex === 2,
      font: 'fntSmall',
    });
    this.drawButton(
      ctx,
      'pause_campfire',
      bx,
      py + 116,
      btnW,
      btnH,
      'CAMPFIRE',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { accent: '#ff4242', focused: this.focusedIndex === 3, font: 'fntSmall' },
    );

    // Subtle vertical column rule between actions and loadout
    const rx = bx + btnW + 12;
    const rw = px + panelW - rx - 10;
    ctx.fillStyle = 'rgba(130, 120, 158, 0.28)';
    ctx.fillRect(rx - 6, py + 44, 1, 96);

    let tooltipTitle = '';
    let tooltipLine1 = '';
    let tooltipLine2 = '';

    if (simState) {
      const player = simState.player;
      const mutant = this.data.getMutant(player.mutant);

      // Weapons section (clean flat layout — no nested box borders!)
      this.fonts.draw(ctx, '@dWEAPONS', rx, py + 44, 'fntSmall', { shadow: true });
      for (let s = 0; s < 2; s++) {
        const slot = player.weapons[s];
        const wy = py + 54 + s * 13;
        if (slot) {
          const wDef = this.data.getWeapon(slot.weaponId);
          const wSpr = resolveWeaponSpriteName(slot.weaponId, this.data);
          this.drawSpriteIntegerCentered(ctx, wSpr, 0, rx, wy, 22, 10);
          const wCol = slot.cursed ? '#d47aff' : wDef?.golden ? '#ffe047' : s === player.activeSlot ? '#ffffff' : '#9ca0ad';
          const wName = resolveWeaponLabel(slot.weaponId, this.data);
          const trimmed = wName.length > 17 ? `${wName.slice(0, 16).trimEnd()}.` : wName;
          this.fonts.draw(ctx, trimmed, rx + 25, wy + 2, 'fntSmall', { color: wCol, shadow: true });
        } else {
          this.fonts.draw(ctx, '@d(EMPTY SLOT)', rx + 25, wy + 2, 'fntSmall', { shadow: false });
        }
      }

      // Active Crown & Mutant row
      const crownY = py + 84;
      ctx.fillStyle = 'rgba(130, 120, 158, 0.22)';
      ctx.fillRect(rx, crownY - 2, rw, 1);
      const crownDef = this.data.getCrown(simState.crown);
      if (crownDef.id !== 'none') {
        this.drawSpriteIntegerCentered(ctx, crownDef.spriteIdle, 0, rx, crownY + 1, 16, 14);
        this.fonts.draw(ctx, `@p${crownDef.name}`, rx + 18, crownY + 4, 'fntSmall', {
          maxWidth: rw - 18,
          shadow: true,
        });
      } else {
        this.fonts.draw(ctx, `@y${mutant.name}  @dNO CROWN`, rx, crownY + 4, 'fntSmall', {
          shadow: true,
        });
      }

      // Mutations + Ultra interactive tray (supports BOTH hover AND Left/Right keyboard inspection!)
      const mutY = py + 102;
      ctx.fillStyle = 'rgba(130, 120, 158, 0.22)';
      ctx.fillRect(rx, mutY - 2, rw, 1);

      const muts = player.mutations;
      const totalOwned = muts.length + (player.ultra ? 1 : 0);
      if (this.pauseInspectIdx >= totalOwned) {
        this.pauseInspectIdx = totalOwned > 0 ? totalOwned - 1 : -1;
      }

      this.fonts.draw(
        ctx,
        totalOwned > 0 ? `@dMUTATIONS (${totalOwned})  @y< L/R >` : '@dMUTATIONS (0)',
        rx,
        mutY + 1,
        'fntSmall',
      );

      if (totalOwned === 0) {
        this.fonts.draw(ctx, '@dNO MUTATIONS YET', rx, mutY + 14, 'fntSmall');
      } else {
        const iconStep = 14;
        const cols = Math.max(1, Math.floor(rw / iconStep));
        for (let i = 0; i < muts.length; i++) {
          const def = this.data.getMutation(muts[i]!);
          const col = i % cols;
          const row = Math.floor(i / cols);
          if (row >= 2) break;
          const mx = rx + col * iconStep;
          const my = mutY + 11 + row * 13;
          const rid = `pause_mut_${i}`;
          const hovered = this.hoveredId === rid;
          if (hovered) {
            this.pauseInspectIdx = i;
          }
          const inspected = hovered || this.pauseInspectIdx === i;
          if (inspected && def) {
            tooltipTitle = `@g${def.name}`;
            tooltipLine1 = def.description.replace(/#/g, ' ');
            tooltipLine2 = `@d"${def.tip}"`;
            drawPixelBorder(ctx, mx - 1, my - 1, 14, 14, '#52e864', 1);
          }
          const drew = def
            ? this.sprites.drawInBox(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, mx, my, 12, 12, { maxScale: 1 })
            : false;
          if (!drew) {
            ctx.fillStyle = '#4de862';
            ctx.fillRect(mx + 1, my + 1, 10, 10);
          }
          this.regions.push({
            id: rid,
            x: mx - 1,
            y: my - 1,
            w: 14,
            h: 14,
            onActivate: () => {
              this.pauseInspectIdx = i;
              return { type: 'ui_sfx', sound: 'sndHover' };
            },
          });
        }
        if (player.ultra) {
          const uDef = this.data.getUltra(player.ultra);
          const idx = muts.length;
          const col = idx % cols;
          const row = Math.min(1, Math.floor(idx / cols));
          const ux = rx + col * iconStep;
          const uy = mutY + 11 + row * 13;
          const rid = 'pause_ultra';
          const hovered = this.hoveredId === rid;
          if (hovered) {
            this.pauseInspectIdx = idx;
          }
          const inspected = hovered || this.pauseInspectIdx === idx;
          if (inspected && uDef) {
            tooltipTitle = `@yULTRA: ${uDef.name}`;
            tooltipLine1 = uDef.description;
            drawPixelBorder(ctx, ux - 1, uy - 1, 14, 14, '#ffe047', 1);
          }
          const egHudDef = this.sprites.getSprite('sprEGIconHUD');
          const uFrame = uDef
            ? computeUltraIconFrame(mutant.raceIndex, uDef.slot, egHudDef?.frames.length ?? 24)
            : 0;
          const drew = uDef
            ? this.sprites.drawInBox(ctx, 'sprEGIconHUD', uFrame, ux, uy, 12, 12, { maxScale: 1 })
            : false;
          if (!drew) {
            ctx.fillStyle = '#ffe047';
            ctx.fillRect(ux + 1, uy + 1, 10, 10);
          }
          this.regions.push({
            id: rid,
            x: ux - 1,
            y: uy - 1,
            w: 14,
            h: 14,
            onActivate: () => {
              this.pauseInspectIdx = idx;
              return { type: 'ui_sfx', sound: 'sndHover' };
            },
          });
        }
      }

      // Default mutant tooltip: clean separate lines with ZERO stray trailing "|" pipe!
      if (!tooltipTitle) {
        tooltipTitle = `@y${mutant.name}  @d(${mutant.passiveName})`;
        tooltipLine1 = `@wPASSIVE: @s${mutant.passiveDesc}`;
        tooltipLine2 = `@gACTIVE: @s${mutant.activeName}`;
      }
    } else {
      const m = this.data.getMutant(save.selectedMutant);
      tooltipTitle = `@y${m.name}`;
      tooltipLine1 = m.passiveDesc;
    }

    // Bottom tooltip strip (clean top divider, dynamic non-colliding lines!)
    const tipY = py + 144;
    ctx.fillStyle = 'rgba(130, 120, 158, 0.35)';
    ctx.fillRect(px + 10, tipY, panelW - 20, 1);
    ctx.fillStyle = 'rgba(10, 8, 16, 0.60)';
    ctx.fillRect(px + 10, tipY + 1, panelW - 20, panelH - (tipY - py) - 6);

    const tHead = this.fonts.draw(ctx, tooltipTitle, px + 14, tipY + 5, 'fntSmall', { outline: true });
    const l1Y = tipY + 5 + tHead.height + 3;
    const l1Res = this.fonts.draw(ctx, tooltipLine1, px + 14, l1Y, 'fntSmall', {
      maxWidth: panelW - 28,
      lineSpacing: 0,
      shadow: true,
    });
    if (tooltipLine2) {
      const l2Y = l1Y + l1Res.height + 2;
      if (l2Y + 6 <= py + panelH - 3) {
        this.fonts.draw(ctx, tooltipLine2, px + 14, l2Y, 'fntSmall', {
          maxWidth: panelW - 28,
          lineSpacing: 0,
          shadow: true,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. OPTIONS MENU (VIDEO/AUDIO, CONTROLS, KEYBINDS)
  // --------------------------------------------------------------------------

  private renderOptionsScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, save, returnScreenFromOptions, rebindingField } = mctx;
    const inputMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const cx = Math.round(width * 0.5);

    ctx.fillStyle = OPAQUE_MENU_BACKDROP;
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(296, width - 16);
    const panelH = height - 16;
    const px = Math.round((width - panelW) * 0.5);
    const modalY = 8;

    drawWastelandPlate(ctx, px, modalY, panelW, panelH, {
      fill: 'rgba(18, 15, 26, 0.98)',
      border: '#72668a',
      topAccent: 'rgba(255, 224, 71, 0.65)',
    });

    // Top row: BACK button on top-left + OPTIONS header centered cleanly at modalY + 8
    this.drawButton(
      ctx,
      'opt_back',
      px + 6,
      modalY + 5,
      50,
      15,
      inputMode === 'gamepad' ? `BACK [${g.back}]` : 'BACK',
      () => ({
        type: 'open_screen',
        screen: returnScreenFromOptions,
      }),
      { font: 'fntSmall', accent: '#ff8a38' },
    );

    this.fonts.draw(ctx, 'OPTIONS', cx, modalY + 8, 'fntM1', {
      align: 'center',
      color: '#ffe047',
      outline: true,
    });

    if (inputMode === 'gamepad') {
      this.fonts.draw(ctx, `@d[${g.prevTab}/${g.nextTab}]`, px + panelW - 8, modalY + 9, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }

    // 3-Tab Row below header (VIDEO/AUDIO | CONTROLS | KEYBINDS)
    const tabW = 86;
    const tabH = 14;
    const tabGap = 6;
    const tabStartX = cx - Math.floor((tabW * 3 + tabGap * 2) / 2);
    const tabY = modalY + 24;
    this.drawButton(
      ctx,
      'opt_tab_general',
      tabStartX,
      tabY,
      tabW,
      tabH,
      'VIDEO/AUDIO',
      () => {
        this.optionsTab = 'general';
        this.focusedIndex = 0;
        return { type: 'ui_sfx', sound: 'sndClick' };
      },
      { font: 'fntSmall', focused: this.optionsTab === 'general', accent: '#52e864' },
    );
    this.drawButton(
      ctx,
      'opt_tab_controls',
      tabStartX + tabW + tabGap,
      tabY,
      tabW,
      tabH,
      'CONTROLS',
      () => {
        this.optionsTab = 'controls';
        this.focusedIndex = 0;
        return { type: 'ui_sfx', sound: 'sndClick' };
      },
      { font: 'fntSmall', focused: this.optionsTab === 'controls', accent: '#ffe047' },
    );
    this.drawButton(
      ctx,
      'opt_tab_keybinds',
      tabStartX + (tabW + tabGap) * 2,
      tabY,
      tabW,
      tabH,
      'KEYBINDS',
      () => {
        this.optionsTab = 'keybinds';
        this.focusedIndex = 0;
        return { type: 'ui_sfx', sound: 'sndClick' };
      },
      { font: 'fntSmall', focused: this.optionsTab === 'keybinds', accent: '#52a8ff' },
    );

    const contentX = px + 10;
    const contentW = panelW - 20;
    let y = modalY + 44;

    if (this.optionsTab === 'general') {
      // Video / Display toggles (compact 2-column row)
      const halfW = Math.floor((contentW - 6) / 2);
      this.drawButton(
        ctx,
        'opt_widescreen',
        contentX,
        y,
        halfW,
        16,
        save.render.widescreen ? 'ASPECT: @g16:9 WIDE' : 'ASPECT: @w4:3 CLASSIC',
        () => ({ type: 'update_render', partial: { widescreen: !save.render.widescreen } }),
        { font: 'fntSmall', focused: this.focusedIndex === 0 },
      );
      const curTargetFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
      this.drawButton(
        ctx,
        'opt_fps',
        contentX + halfW + 6,
        y,
        halfW,
        16,
        formatTargetFpsLabel(curTargetFps),
        () => {
          const nextFps = cycleTargetFps(curTargetFps);
          return {
            type: 'update_render',
            partial: { targetFps: nextFps, classic30Fps: nextFps === 30 },
          };
        },
        {
          font: 'fntSmall',
          accent: curTargetFps === 120 ? '#52a8ff' : curTargetFps === 60 ? '#52e864' : '#ffe047',
          focused: this.focusedIndex === 1,
        },
      );
      y += 20;

      // Crosshair style (crisp integer 1x 16x16 preview!) + Show FPS + Mute row
      const thirdW = Math.floor((contentW - 8) / 3);
      this.drawButton(
        ctx,
        'opt_crosshair',
        contentX,
        y,
        thirdW,
        18,
        `AIM ${save.render.crosshairStyle + 1}`,
        () => ({
          type: 'update_render',
          partial: { crosshairStyle: (save.render.crosshairStyle + 1) % 9 },
        }),
        { font: 'fntSmall', labelOffsetX: -11, focused: this.focusedIndex === 2 },
      );
      // Crisp 1.0x INTEGER crosshair preview (zero 0.7x mixels!)
      this.sprites.draw(ctx, 'sprCrosshair', contentX + thirdW - 12, y + 9, {
        frame: save.render.crosshairStyle,
        scaleX: 1,
        scaleY: 1,
        pixelSnap: true,
      });

      this.drawButton(
        ctx,
        'opt_showfps',
        contentX + thirdW + 4,
        y,
        thirdW,
        18,
        save.render.showFps ? 'HUD FPS: @gON' : 'HUD FPS: @dOFF',
        () => ({ type: 'update_render', partial: { showFps: !save.render.showFps } }),
        { font: 'fntSmall', focused: this.focusedIndex === 3 },
      );

      this.drawButton(
        ctx,
        'opt_mute',
        contentX + (thirdW + 4) * 2,
        y,
        thirdW,
        18,
        save.audio.muted ? '@rMUTED' : '@gAUDIO ON',
        () => ({ type: 'update_audio', partial: { muted: !save.audio.muted } }),
        {
          font: 'fntSmall',
          accent: save.audio.muted ? '#ff4242' : '#52e864',
          focused: this.focusedIndex === 4,
        },
      );
      y += 23;

      // Sliders with visible pixel thumb knobs: Screen Shake + Master / SFX / Music / Ambience volumes
      this.drawSliderRow(
        ctx,
        'opt_shake',
        contentX,
        y,
        contentW,
        'SCREEN SHAKE',
        save.render.screenShakeScale,
        (v) => ({
          type: 'update_render',
          partial: { screenShakeScale: v },
        }),
        { focused: this.focusedIndex === 5 },
      );
      y += 19;

      this.drawSliderRow(
        ctx,
        'opt_vol_master',
        contentX,
        y,
        contentW,
        'MASTER VOL',
        save.audio.masterVolume,
        (v) => ({
          type: 'update_audio',
          partial: { masterVolume: v },
        }),
        { focused: this.focusedIndex === 6 },
      );
      y += 19;

      this.drawSliderRow(
        ctx,
        'opt_vol_sfx',
        contentX,
        y,
        contentW,
        'SFX VOLUME',
        save.audio.sfxVolume,
        (v) => ({
          type: 'update_audio',
          partial: { sfxVolume: v },
        }),
        { focused: this.focusedIndex === 7 },
      );
      y += 19;

      this.drawSliderRow(
        ctx,
        'opt_vol_music',
        contentX,
        y,
        contentW,
        'MUSIC VOLUME',
        save.audio.musicVolume,
        (v) => ({
          type: 'update_audio',
          partial: { musicVolume: v },
        }),
        { focused: this.focusedIndex === 8 },
      );
      y += 19;

      this.drawSliderRow(
        ctx,
        'opt_vol_amb',
        contentX,
        y,
        contentW,
        'AMBIENCE VOL',
        save.audio.ambienceVolume,
        (v) => ({ type: 'update_audio', partial: { ambienceVolume: v } }),
        { focused: this.focusedIndex === 9 },
      );

      const genFooter =
        inputMode === 'gamepad'
          ? `@d[UP/DN] SELECT  [L/R] SLIDER  [${g.confirm}] TOGGLE  [${g.back}] BACK`
          : '@dCLICK, DRAG, OR ARROWS - SETTINGS AUTO-SAVE';
      this.fonts.draw(ctx, genFooter, cx, modalY + panelH - 12, 'fntSmall', { align: 'center' });
    } else if (this.optionsTab === 'controls') {
      // Dedicated Controls Tab (PC / Tesla Controller + Touch Controls)
      const ctrl = save.controls;
      this.drawButton(
        ctx,
        'opt_ctrl_aim_assist',
        contentX,
        y,
        contentW,
        18,
        ctrl.gamepadAimAssist ? 'GAMEPAD AIM ASSIST: @gON' : 'GAMEPAD AIM ASSIST: @dOFF',
        () => ({ type: 'update_controls', partial: { gamepadAimAssist: !ctrl.gamepadAimAssist } }),
        {
          font: 'fntSmall',
          accent: ctrl.gamepadAimAssist ? '#52e864' : '#ffe047',
          focused: this.focusedIndex === 0,
        },
      );
      y += 22;

      this.drawButton(
        ctx,
        'opt_ctrl_rumble',
        contentX,
        y,
        contentW,
        18,
        ctrl.gamepadRumble ? 'CONTROLLER RUMBLE: @gON' : 'CONTROLLER RUMBLE: @dOFF',
        () => ({ type: 'update_controls', partial: { gamepadRumble: !ctrl.gamepadRumble } }),
        {
          font: 'fntSmall',
          accent: ctrl.gamepadRumble ? '#52e864' : '#ffe047',
          focused: this.focusedIndex === 1,
        },
      );
      y += 23;

      const dzNorm =
        (ctrl.gamepadDeadzone - MIN_GAMEPAD_DEADZONE) /
        (MAX_GAMEPAD_DEADZONE - MIN_GAMEPAD_DEADZONE);
      this.drawSliderRow(
        ctx,
        'opt_ctrl_deadzone',
        contentX,
        y,
        contentW,
        'STICK DEADZONE',
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
      y += 20;

      this.drawButton(
        ctx,
        'opt_ctrl_touch',
        contentX,
        y,
        contentW,
        18,
        ctrl.touchMode === 'auto'
          ? 'TOUCH STICKS: @gAUTO (TOUCH ONLY)'
          : 'TOUCH STICKS: @dOFF',
        () => ({
          type: 'update_controls',
          partial: { touchMode: ctrl.touchMode === 'auto' ? 'off' : 'auto' },
        }),
        {
          font: 'fntSmall',
          accent: ctrl.touchMode === 'auto' ? '#52a8ff' : '#ff8a38',
          focused: this.focusedIndex === 3,
        },
      );
      y += 23;

      // Live PC / Tesla / Console Controller Status, Mini Stick/Trigger Telemetry & Dynamic Legend Card
      const boxH = 58;
      const canTestRumble = Boolean(mctx.gamepadConnected || inputMode === 'touch');
      const cardHovered = canTestRumble && this.hoveredId === 'opt_ctrl_pad_status';
      ctx.fillStyle = cardHovered ? 'rgba(26, 22, 38, 0.92)' : 'rgba(12, 10, 18, 0.85)';
      ctx.fillRect(contentX, y, contentW, boxH);
      drawPixelBorder(
        ctx,
        contentX,
        y,
        contentW,
        boxH,
        cardHovered ? '#ffe047' : mctx.gamepadConnected ? '#52e864' : '#4a4358',
        1,
      );

      if (canTestRumble) {
        this.regions.push({
          id: 'opt_ctrl_pad_status',
          x: contentX,
          y,
          w: contentW,
          h: boxH,
          onActivate: () => ({ type: 'test_rumble' }),
        });
      }

      const rawName = (mctx.gamepadName ?? '').trim().toUpperCase();
      const shortName = rawName.length > 20 ? `${rawName.slice(0, 19).trimEnd()}.` : rawName;
      const profileTag =
        mctx.gamepadProfile === 'standard'
          ? 'STD'
          : mctx.gamepadProfile === 'linux-xpad'
            ? 'XPAD'
            : mctx.gamepadProfile === 'xbox-bt-hid'
              ? 'BT-HID'
              : mctx.gamepadProfile === 'sony-hid'
                ? 'SONY'
                : mctx.gamepadProfile === 'nintendo-hid'
                  ? 'NSW'
                  : mctx.gamepadProfile === 'logitech-dinput'
                    ? 'DINPUT'
                    : mctx.gamepadProfile
                      ? 'COMPAT'
                      : '';
      const padLine = mctx.gamepadConnected
        ? `@g${g.familyLabel}: @w${shortName || 'CONNECTED'}${profileTag ? ` @d(${profileTag})` : ''}`
        : '@dNO CONTROLLER DETECTED - PRESS ANY PAD BUTTON';
      this.fonts.draw(ctx, padLine, cx, y + 5, 'fntSmall', {
        align: 'center',
        maxWidth: contentW - 10,
        outline: true,
      });

      // Live crisp mini stick-dot pads (LS / RS) + LT / RT trigger bars inside left/right corners
      const dbg = mctx.gamepadDebug;
      if (mctx.gamepadConnected && dbg) {
        const padSize = 14;
        const padY = y + 20;
        const clampUnit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

        // Left Stick micro-pad + LT bar
        const lsX = contentX + 5;
        ctx.fillStyle = '#090710';
        ctx.fillRect(lsX, padY, padSize, padSize);
        drawPixelBorder(ctx, lsX, padY, padSize, padSize, '#504866', 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(lsX + 6, padY + 6, 2, 2);
        const lDotX = Math.round(lsX + 6 + clampUnit(dbg.lx) * 5);
        const lDotY = Math.round(padY + 6 + clampUnit(dbg.ly) * 5);
        ctx.fillStyle = '#52e864';
        ctx.fillRect(lDotX, lDotY, 2, 2);

        const ltX = lsX + padSize + 2;
        ctx.fillStyle = dbg.lt ? '#52a8ff' : '#242032';
        ctx.fillRect(ltX, padY, 3, padSize);
        drawPixelBorder(ctx, ltX, padY, 3, padSize, dbg.lt ? '#a6dcff' : '#4a4358', 1);

        // Right Stick micro-pad + RT bar
        const rsX = contentX + contentW - 5 - padSize;
        const rtX = rsX - 5;
        ctx.fillStyle = dbg.rt ? '#ff6a38' : '#242032';
        ctx.fillRect(rtX, padY, 3, padSize);
        drawPixelBorder(ctx, rtX, padY, 3, padSize, dbg.rt ? '#ffb48a' : '#4a4358', 1);

        ctx.fillStyle = '#090710';
        ctx.fillRect(rsX, padY, padSize, padSize);
        drawPixelBorder(ctx, rsX, padY, padSize, padSize, '#504866', 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(rsX + 6, padY + 6, 2, 2);
        const rDotX = Math.round(rsX + 6 + clampUnit(dbg.rx) * 5);
        const rDotY = Math.round(padY + 6 + clampUnit(dbg.ry) * 5);
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(rDotX, rDotY, 2, 2);
      }

      this.fonts.draw(
        ctx,
        `@yLS@w MOVE @yRS@w AIM @y${g.fire}/${g.nextTab}@w FIRE @y${g.active}/${g.prevTab}@w ACT`,
        cx,
        y + 19,
        'fntSmall',
        { align: 'center', outline: true },
      );
      this.fonts.draw(
        ctx,
        `@y${g.swap}@w SWAP @y${g.confirm}/${g.pickup}@w USE @y${g.pause}@w PAUSE @y${g.retry}@w RETRY`,
        cx,
        y + 31,
        'fntSmall',
        { align: 'center', outline: true },
      );

      const rumbleLine = mctx.gamepadConnected
        ? `@b[${g.pickup}] TEST RUMBLE  @d(CLICK CARD)`
        : inputMode === 'touch'
          ? '@bTAP CARD TO TEST HAPTICS'
          : '@dXBOX / PLAYSTATION / NINTENDO / TESLA READY';
      this.fonts.draw(ctx, rumbleLine, cx, y + 45, 'fntSmall', {
        align: 'center',
        outline: mctx.gamepadConnected,
      });

      const ctrlFooter =
        inputMode === 'gamepad'
          ? `@d[${g.prevTab}/${g.nextTab}] TABS  [L/R] ADJUST  [${g.confirm}] TOGGLE  [${g.back}] BACK`
          : '@dPC / TESLA GAMEPAD + TOUCH AUTO-DETECT';
      this.fonts.draw(ctx, ctrlFooter, cx, modalY + panelH - 12, 'fntSmall', {
        align: 'center',
      });
    } else {
      // Keybind Rebinding Table (balanced vertical spacing + ESC TO CANCEL + conflict auto-swap note)
      const rowH = 20;
      const colW = Math.floor((contentW - 8) / 2);

      for (let i = 0; i < KEYBIND_LABELS.length; i++) {
        const entry = KEYBIND_LABELS[i]!;
        const col = i % 2;
        const row = Math.floor(i / 2);
        const rx = contentX + col * (colW + 8);
        const ry = y + 4 + row * (rowH + 6);
        const isListening = rebindingField === entry.field;
        const isRowFocused = this.focusedIndex === i;
        const keyText = isListening
          ? '@yPRESS KEY...'
          : `@w${formatKeyCode(save.keybinds[entry.field])}`;

        this.fonts.draw(ctx, entry.label, rx, ry + 5, 'fntSmall', {
          color: isRowFocused ? '#ffe047' : '#c8c6d4',
          outline: true,
        });

        this.drawButton(
          ctx,
          `opt_kb_${entry.field}`,
          rx + colW - 54,
          ry,
          54,
          rowH - 2,
          keyText,
          () => ({ type: 'begin_rebind', field: entry.field }),
          { font: 'fntSmall', focused: isListening || isRowFocused, accent: '#ffe047' },
        );
      }

      // Informative status banner filling lower region cleanly (with prominent ESC TO CANCEL!)
      const noteY = y + 4 + 4 * (rowH + 6) + 4;
      ctx.fillStyle = rebindingField ? 'rgba(64, 48, 18, 0.72)' : 'rgba(12, 10, 18, 0.72)';
      ctx.fillRect(contentX, noteY, contentW, 20);
      drawPixelBorder(
        ctx,
        contentX,
        noteY,
        contentW,
        20,
        rebindingField ? '#ffe047' : 'rgba(104, 96, 128, 0.45)',
        1,
      );
      const kbHint = rebindingField
        ? '@yLISTENING FOR KEY - PRESS ESC TO CANCEL'
        : '@dCLICK OR ENTER TO REBIND - CONFLICTS AUTO-SWAP - ESC TO CANCEL';
      this.fonts.draw(ctx, kbHint, cx, noteY + 6, 'fntSmall', {
        align: 'center',
        maxWidth: contentW - 8,
        outline: Boolean(rebindingField),
      });

      this.drawButton(
        ctx,
        'opt_kb_reset',
        cx - 58,
        modalY + panelH - 28,
        116,
        17,
        'RESET DEFAULTS',
        () => ({ type: 'reset_keybinds' }),
        { font: 'fntSmall', accent: '#ff8a38', focused: this.focusedIndex === 8 },
      );
    }
  }

  // --------------------------------------------------------------------------
  // 6. GAME OVER & VICTORY SUMMARY
  // --------------------------------------------------------------------------

  private renderEndScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
    victory: boolean,
  ): void {
    const { width, height, simState, save } = mctx;
    const cx = Math.round(width * 0.5);

    // Clean opaque dark backdrop so gameplay arena never bleeds brightly through corners!
    ctx.fillStyle = victory ? 'rgba(16, 14, 9, 0.96)' : 'rgba(15, 7, 10, 0.96)';
    ctx.fillRect(0, 0, width, height);

    const areaCode = simState?.areaCode ?? save.bestArea;
    const loopNum = simState?.loop ?? 0;
    const muts = simState?.player.mutations ?? [];
    const ultra = simState?.player.ultra ?? null;
    const hasMutRow = muts.length > 0 || Boolean(ultra);

    // Dynamically size card height so 0-mutation Game Over never leaves a giant empty black void!
    const cardW = Math.min(292, width - 18);
    const cardH = hasMutRow ? 148 : 118;
    const totalBlockH = 38 + cardH + 10 + 22;
    const topY = Math.max(6, Math.round((height - totalBlockH) * 0.5));
    const cardX = Math.round((width - cardW) * 0.5);
    const cardY = topY + 36;

    // Header
    this.fonts.draw(
      ctx,
      victory ? 'VICTORY!' : 'GAME OVER',
      cx,
      topY,
      'fntL',
      { align: 'center', color: victory ? '#ffe047' : '#ff4242', outline: true },
    );

    const sub = victory
      ? '@yYOU REACHED THE KRUNKED THRONE'
      : loopNum > 0
        ? '@yTHE STRUGGLE CONTINUES'
        : areaCode.startsWith('7-')
          ? '@rYOU ALMOST REACHED THE KRUNKED THRONE'
          : '@dYOU DID NOT REACH THE KRUNKED THRONE';
    this.fonts.draw(ctx, sub, cx, topY + 20, 'fntSmall', { align: 'center', outline: true });

    // Summary Card
    drawWastelandPlate(ctx, cardX, cardY, cardW, cardH, {
      fill: 'rgba(14, 11, 22, 0.97)',
      border: victory ? '#ffe047' : '#c92a3c',
      topAccent: victory ? '#ffe047' : '#c92a3c',
      rivetColor: victory ? '#fff299' : '#ff7d8a',
    });

    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);
    const areaText = simState
      ? simState.loop > 0
        ? `L${simState.loop} ${simState.areaCode}`
        : simState.areaCode
      : save.bestArea;
    const kills = simState?.stats.kills ?? 0;
    const isNewBest = kills > 0 && kills >= save.bestKills && save.totalRuns > 0;
    const bosses = simState?.stats.bossesDefeated ?? [];
    const mins = Math.floor(((simState?.stats.timeTicks ?? 0) / 30) / 60);
    const secs = Math.floor(((simState?.stats.timeTicks ?? 0) / 30) % 60);
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    // Left sprite box: killer sprite on Game Over (skipping blank dissolve / white frame 0!), portrait on Victory
    const boxX = cardX + 10;
    const boxY = cardY + 10;
    const boxSize = 52;
    ctx.fillStyle = '#0c0912';
    ctx.fillRect(boxX, boxY, boxSize, boxSize);
    drawPixelBorder(ctx, boxX, boxY, boxSize, boxSize, '#524863', 1);

    const endSkin: 'a' | 'b' = simState?.player.skin ?? save.selectedSkins[mutant.id] ?? 'a';
    if (victory) {
      const portSprName =
        endSkin === 'b' && mutant.sprites.bPortrait && this.sprites.hasSprite(mutant.sprites.bPortrait)
          ? mutant.sprites.bPortrait
          : mutant.sprites.portrait;
      const portDef = this.sprites.getSprite(portSprName);
      const portraitFrame = computePortraitFrame(
        mutant.raceIndex,
        endSkin,
        portDef?.frames.length ?? 24,
      );
      const drew = this.sprites.drawInBox(
        ctx,
        portSprName,
        portraitFrame,
        boxX + 2,
        boxY + 2,
        boxSize - 4,
        boxSize - 4,
      );
      if (!drew) {
        this.drawSpriteIntegerCentered(ctx, mutant.sprites.idle, 0, boxX + 4, boxY + 4, boxSize - 8, boxSize - 8, {
          allow2x: true,
        });
      }
    } else {
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

      let drew = false;
      if (hasValidKiller) {
        const killerDef = this.sprites.getSprite(rawKiller);
        const killerFrame = resolveDisplaySpriteFrame(killerDef, rawKiller);
        drew = this.drawSpriteIntegerCentered(
          ctx,
          rawKiller,
          killerFrame,
          boxX + 4,
          boxY + 4,
          boxSize - 8,
          boxSize - 8,
          { allow2x: true },
        );
      }
      if (!drew) {
        const deadDef = this.sprites.getSprite(deadSpr);
        const deadFrame = resolveDisplaySpriteFrame(deadDef, deadSpr);
        drew = this.drawSpriteIntegerCentered(
          ctx,
          deadSpr,
          deadFrame,
          boxX + 4,
          boxY + 4,
          boxSize - 8,
          boxSize - 8,
          { allow2x: true },
        );
      }
      if (!drew) {
        this.drawSpriteIntegerCentered(ctx, 'sprBanditIdle', 0, boxX + 4, boxY + 4, boxSize - 8, boxSize - 8, {
          allow2x: true,
        });
      }
    }

    // Stats column
    const sx = boxX + boxSize + 10;
    const statsW = cardW - boxSize - 26;
    if (!victory) {
      const cause = (simState?.player.lastDamageCause || 'WASTELAND').toUpperCase();
      this.fonts.draw(ctx, `@rKILLED BY: @w${cause}`, sx, cardY + 10, 'fntSmall', {
        maxWidth: statsW,
        outline: true,
      });
    } else {
      this.fonts.draw(ctx, `@yMUTANT: @w${mutant.name}`, sx, cardY + 10, 'fntSmall', {
        outline: true,
      });
    }

    this.fonts.draw(
      ctx,
      `@dAREA: @w${areaText}   @dTIME: @w${timeStr}${isNewBest ? '  @yNEW BEST!' : ''}`,
      sx,
      cardY + 23,
      'fntSmall',
      { outline: true },
    );
    this.fonts.draw(
      ctx,
      `@dKILLS: @y${kills}   @dLV: @g${simState?.player.level ?? 1}   @dBEST: @w${save.bestKills}`,
      sx,
      cardY + 35,
      'fntSmall',
      { outline: true },
    );

    // Carried Weapons & Active Crown row
    const wepRowY = cardY + 48;
    if (simState) {
      let wx = sx;
      for (let s = 0; s < 2; s++) {
        const slot = simState.player.weapons[s];
        if (!slot) continue;
        const wSpr = resolveWeaponSpriteName(slot.weaponId, this.data);
        ctx.fillStyle = 'rgba(24, 20, 34, 0.85)';
        ctx.fillRect(wx, wepRowY, 26, 13);
        drawPixelBorder(ctx, wx, wepRowY, 26, 13, slot.cursed ? '#b94aff' : '#524863', 1);
        this.drawSpriteIntegerCentered(ctx, wSpr, 0, wx + 2, wepRowY + 1, 22, 11);
        wx += 30;
      }
      if (simState.crown !== 'none') {
        const cDef = this.data.getCrown(simState.crown);
        this.drawSpriteIntegerCentered(ctx, cDef.spriteIdle, 0, wx + 1, wepRowY, 16, 14);
        wx += 18;
      }
      if (bosses.length > 0) {
        const bossLabel = bosses
          .map((b) => (b === 'nuclear_throne' ? 'THRONE' : b.replace(/_/g, ' ').toUpperCase()))
          .join(', ');
        this.fonts.draw(ctx, `@dBOSS: @w${bossLabel}`, wx + 2, wepRowY + 3, 'fntSmall', {
          maxWidth: cardX + cardW - wx - 8,
          shadow: true,
        });
      }
    }

    // Iconic NT Horizontal Area Progression Map (with Vault support, clear Loop L1/L2 labels & clean 7-3 spacing!)
    const mapY = cardY + 75;
    const mapLeft = cardX + 18;
    const mapRight = cardX + cardW - 22;
    const nodeCount = MAIN_PATH_AREAS.length;
    const progressIdx = victory ? nodeCount - 1 : resolveRunProgressIndex(areaCode);

    ctx.fillStyle = 'rgba(10, 8, 16, 0.84)';
    ctx.fillRect(cardX + 8, mapY - 8, cardW - 16, 26);
    drawPixelBorder(ctx, cardX + 8, mapY - 8, cardW - 16, 26, '#3b344a', 1);

    // Base road rail + completed emerald/gold path
    ctx.fillStyle = '#3e394a';
    ctx.fillRect(mapLeft, mapY + 1, mapRight - mapLeft, 2);
    const reachX = Math.round(mapLeft + ((mapRight - mapLeft) * progressIdx) / Math.max(1, nodeCount - 1));
    ctx.fillStyle = victory ? '#ffe047' : '#52e864';
    ctx.fillRect(mapLeft, mapY + 1, Math.max(2, reachX - mapLeft), 2);

    for (let n = 0; n < nodeCount; n++) {
      const nx = Math.round(mapLeft + ((mapRight - mapLeft) * n) / Math.max(1, nodeCount - 1));
      const reached = n <= progressIdx;
      const isBossArea = MAIN_PATH_AREAS[n]!.endsWith('-3');
      if (n === nodeCount - 1) {
        // Positioned at mapY - 4..mapY + 4 -> crisp 4px vertical gap above "7-3" label at mapY + 8!
        const drewThrone = this.drawSpriteIntegerCentered(ctx, 'sprGameOverThrone', 0, nx - 4, mapY - 4, 9, 8);
        if (!drewThrone) {
          ctx.fillStyle = reached ? '#ffe047' : '#635c75';
          ctx.fillRect(nx - 3, mapY - 3, 6, 6);
        }
      } else {
        const dotSize = isBossArea ? 4 : 3;
        ctx.fillStyle = reached ? (isBossArea ? '#ffe047' : '#52e864') : '#524b61';
        ctx.fillRect(nx - Math.floor(dotSize / 2), mapY + 2 - Math.floor(dotSize / 2), dotSize, dotSize);
      }
    }

    // Reached area skull marker (cleanly above road rail)
    if (!victory) {
      const drewSkull = this.drawSpriteIntegerCentered(ctx, 'sprGameOverSkull', 0, reachX - 4, mapY - 7, 8, 6);
      if (!drewSkull) {
        ctx.fillStyle = '#ff4242';
        ctx.fillRect(reachX - 2, mapY - 6, 4, 4);
      }
    }

    // Clear Loop L1/L2 labels on BOTH ends + Vault/Secret tag when applicable, spaced cleanly below Throne!
    const leftLabel = loopNum > 0 ? `@yL${loopNum} @d1-1` : '1-1';
    const rightLabel = loopNum > 0 ? `@yL${loopNum} @d7-3` : '7-3';
    this.fonts.draw(ctx, leftLabel, mapLeft - 4, mapY + 8, 'fntSmall', { color: '#8f8b9e' });
    if (areaCode === 'vault') {
      this.fonts.draw(ctx, '@gVAULT', reachX, mapY + 8, 'fntSmall', { align: 'center' });
    } else if (loopNum > 0) {
      this.fonts.draw(ctx, `@yLOOP ${loopNum}`, cx, mapY + 8, 'fntSmall', { align: 'center' });
    }
    this.fonts.draw(ctx, rightLabel, mapRight + 6, mapY + 8, 'fntSmall', {
      align: 'right',
      color: '#8f8b9e',
    });

    // Acquired mutations & Ultra strip (only expands card when mutations/ultra exist!)
    if (hasMutRow) {
      this.fonts.draw(
        ctx,
        `@dMUTATIONS (${muts.length}${ultra ? '+U' : ''}):`,
        cardX + 10,
        cardY + 99,
        'fntSmall',
        { outline: true },
      );
      const maxShownMuts = Math.min(muts.length, 15);
      for (let i = 0; i < maxShownMuts; i++) {
        const def = this.data.getMutation(muts[i]!);
        const mx = cardX + 10 + i * 17;
        const my = cardY + 110;
        const drew = def
          ? this.drawSpriteIntegerCentered(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, mx, my, 16, 16)
          : false;
        if (!drew) {
          ctx.fillStyle = '#4de862';
          ctx.fillRect(mx + 2, my + 2, 12, 12);
        }
      }
      if (ultra) {
        const uDef = this.data.getUltra(ultra);
        const egHudDef = this.sprites.getSprite('sprEGIconHUD');
        const uFrame = uDef
          ? computeUltraIconFrame(mutant.raceIndex, uDef.slot, egHudDef?.frames.length ?? 24)
          : 0;
        const ux = cardX + 10 + maxShownMuts * 17;
        const uy = cardY + 109;
        const drew = uDef
          ? this.drawSpriteIntegerCentered(ctx, 'sprEGIconHUD', uFrame, ux, uy, 18, 18)
          : false;
        if (!drew) {
          ctx.fillStyle = '#ffe047';
          ctx.fillRect(ux + 2, uy + 2, 12, 12);
        }
      }
    }

    // Punchy NT-style wasteland tip tucked cleanly along bottom edge of summary card
    const endTip = selectLoadingTip(
      simState?.biome ?? 'desert',
      areaCode,
      loopNum,
      (simState?.seed ?? 1) + kills,
    );
    this.fonts.draw(ctx, `@d${endTip}`, cx, cardY + cardH - 12, 'fntSmall', {
      align: 'center',
      maxWidth: cardW - 16,
    });

    // Bottom buttons: RETRY & CAMPFIRE
    const endMode = mctx.inputMode ?? 'kbm';
    const g = getGamepadGlyphs(mctx.gamepadFamily ?? 'generic');
    const retryBtnLabel =
      endMode === 'gamepad'
        ? victory
          ? `NEW RUN [${g.retry}]`
          : `RETRY [${g.retry}]`
        : endMode === 'touch'
          ? victory
            ? 'NEW RUN'
            : 'RETRY'
          : victory
            ? 'NEW RUN [R]'
            : 'RETRY [R]';
    const campBtnLabel = endMode === 'gamepad' ? `CAMPFIRE [${g.back}]` : 'CAMPFIRE';

    const btnY = cardY + cardH + 10;
    const btnW = 104;
    const btnH = 22;
    this.drawButton(
      ctx,
      'end_retry',
      cx - btnW - 8,
      btnY,
      btnW,
      btnH,
      retryBtnLabel,
      () => ({ type: 'restart' }),
      { accent: '#52e864', focused: this.focusedIndex === 0, font: 'fntSmall' },
    );
    this.drawButton(
      ctx,
      'end_campfire',
      cx + 8,
      btnY,
      btnW,
      btnH,
      campBtnLabel,
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { accent: '#ffe047', focused: this.focusedIndex === 1, font: 'fntSmall' },
    );
  }
}
