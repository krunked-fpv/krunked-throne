import type {
  AudioSettings,
  ControlSettings,
  CrownId,
  GameScreen,
  InputDeviceMode,
  KeyBindings,
  MutantId,
  MutationId,
  RenderSettings,
  SaveData,
  SimState,
  TargetFps,
  UltraId,
} from '@/contracts';
import type { AssetBundle } from '@/assets';
import {
  MAX_GAMEPAD_DEADZONE,
  MIN_GAMEPAD_DEADZONE,
  type MenuInputSnapshot,
} from '@/input';
import { BitmapFontRenderer } from '@/render/bitmap-font';
import { SpriteRenderer } from '@/render/sprites';
import {
  ALL_CROWN_IDS,
  DEFAULT_UI_DATA_PROVIDER,
  type UiDataProvider,
} from './data-provider';

export interface HitRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onActivate: () => MenuAction | null;
  onDrag?: (normX: number) => MenuAction | null;
}

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
  | { type: 'begin_rebind'; field: keyof KeyBindings }
  | { type: 'cancel_rebind' }
  | { type: 'rebind_key'; field: keyof KeyBindings; code: string }
  | { type: 'reset_keybinds' }
  | { type: 'request_load_local' }
  | { type: 'use_builtin_art' }
  | { type: 'use_local_art' }
  | { type: 'clear_local_cache' }
  | { type: 'ui_sfx'; sound: 'sndHover' | 'sndClick' };

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
 * hover feedback, slider dragging, and keyboard navigation across all screens:
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
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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

    // Pointer hover detection (update only when pointer actually moved, clicked, or is dragging,
    // or when moved is omitted by legacy headless test callers)
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
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
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
        if (act.type !== 'ui_sfx') {
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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

        // Instant shoulder/face shortcuts work cleanly from either focus row
        if (input.prevTab) {
          actions.push({ type: 'toggle_bskin', mutant: selectedId });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }
        if (input.nextTab) {
          actions.push({ type: 'cycle_crown', crown: this.cycleCrownFrom(ctx.save.selectedCrown, 1) });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }
        if (input.secondary) {
          actions.push({ type: 'toggle_golden', enabled: !ctx.save.useGoldenWeapon });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }

        // Up/Down switches between 12-Mutant Roster and Loadout Action Bar
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
            actions.push({ type: 'ui_sfx', sound: 'sndHover' });
          } else if (input.navRight) {
            const next = mutants[(curIdx + 1) % mutants.length]!;
            actions.push({ type: 'select_mutant', mutant: next.id });
            actions.push({ type: 'ui_sfx', sound: 'sndHover' });
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
                actions.push({ type: 'toggle_golden', enabled: !ctx.save.useGoldenWeapon });
                break;
              case 3:
                actions.push({
                  type: 'start_run',
                  mutant: selectedId,
                  skin: ctx.save.selectedSkins[selectedId] ?? 'a',
                  crown: ctx.save.selectedCrown,
                  useGoldenWeapon: ctx.save.useGoldenWeapon,
                });
                break;
              case 4:
                actions.push({ type: 'open_screen', screen: 'title' });
                break;
            }
          } else {
            actions.push({
              type: 'start_run',
              mutant: selectedId,
              skin: ctx.save.selectedSkins[selectedId] ?? 'a',
              crown: ctx.save.selectedCrown,
              useGoldenWeapon: ctx.save.useGoldenWeapon,
            });
          }
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (input.back) {
          actions.push({ type: 'open_screen', screen: 'title' });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
          break;
        }
        if (input.navLeft) {
          this.focusedIndex = (this.focusedIndex - 1 + list.length) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navRight) {
          this.focusedIndex = (this.focusedIndex + 1) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.confirm) {
          const idx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));
          actions.push({ type: 'pick_mutation', index: idx, mutationId: list[idx]! });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
          break;
        }
        if (input.navLeft || input.navRight) {
          this.focusedIndex = (this.focusedIndex + 1) % list.length;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.confirm) {
          const idx = Math.max(0, Math.min(list.length - 1, this.focusedIndex));
          actions.push({ type: 'pick_ultra', index: idx, ultraId: list[idx]! });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        }
        break;
      }

      case 'paused': {
        if (input.back) {
          actions.push({ type: 'resume' });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (input.retry) {
          actions.push({ type: 'restart' });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (input.navUp) {
          this.focusedIndex = (this.focusedIndex - 1 + 4) % 4;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.navDown) {
          this.focusedIndex = (this.focusedIndex + 1) % 4;
          actions.push({ type: 'ui_sfx', sound: 'sndHover' });
        } else if (input.confirm) {
          const map: MenuAction[] = [
            { type: 'resume' },
            { type: 'open_screen', screen: 'options' },
            { type: 'restart' },
            { type: 'open_screen', screen: 'campfire' },
          ];
          actions.push(map[this.focusedIndex] ?? { type: 'resume' });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (input.confirm) {
          if (this.focusedIndex === 1) {
            actions.push({ type: 'open_screen', screen: 'campfire' });
          } else {
            actions.push({ type: 'restart' });
          }
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
        } else if (input.back) {
          actions.push({ type: 'open_screen', screen: 'campfire' });
          actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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
      actions.push({ type: 'ui_sfx', sound: 'sndClick' });
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
            partial: { crosshairStyle: (save.render.crosshairStyle + 1) % 7 },
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
  // Reusable UI Primitives
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
    const isFocused = Boolean(opts.focused);
    const hovered = this.hoveredId === id || isFocused;
    const accent = opts.accent ?? '#ffe047';

    // Crisp pulsing outer pixel glow when focused via gamepad/keyboard or hovered
    if (hovered) {
      const pulse = 0.24 + 0.14 * Math.sin(this.renderTimeSec * 7.5);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      ctx.restore();
    }

    ctx.fillStyle = hovered ? 'rgba(46, 36, 62, 0.96)' : 'rgba(18, 15, 24, 0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hovered ? accent : '#5a5268';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (hovered) {
      ctx.fillStyle = accent;
      ctx.fillRect(x + 2, y + 2, 2, h - 4);
      if (isFocused) {
        ctx.fillRect(x + w - 4, y + 2, 2, h - 4);
      }
    }

    this.fonts.draw(
      ctx,
      label,
      x + w * 0.5 + (opts.labelOffsetX ?? 0),
      y + h * 0.5,
      opts.font ?? 'fntM1',
      {
        align: 'center',
        baseline: 'middle',
        color: hovered ? '#ffffff' : '#c8c6d4',
        outline: true,
      },
    );

    this.regions.push({ id, x, y, w, h, onActivate });
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
    const barW = 86;
    const barH = 8;
    const barX = x + w - barW - 30;
    const barY = y + 3;

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

    ctx.fillStyle = '#120e18';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hovered ? '#ffe047' : '#52e864';
    ctx.fillRect(
      barX + 1,
      barY + 1,
      Math.round((barW - 2) * Math.max(0, Math.min(1, value))),
      barH - 2,
    );
    ctx.strokeStyle = hovered ? '#ffffff' : '#6b637a';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    const pct = opts.valueText ?? `${Math.round(value * 100)}%`;
    this.fonts.draw(ctx, pct, x + w, y + 2, 'fntSmall', {
      align: 'right',
      color: hovered ? '#ffe047' : '#ffffff',
      outline: true,
    });

    this.regions.push({
      id,
      x: barX - 4,
      y: y,
      w: barW + 8,
      h: 13,
      onActivate: () => onChange(value),
      onDrag: (normX: number) => onChange(Math.round(normX * 20) / 20),
    });
  }

  // --------------------------------------------------------------------------
  // 1. TITLE SCREEN
  // --------------------------------------------------------------------------

  private renderTitleScreen(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, timeSec, save } = mctx;
    const cx = Math.round(width * 0.5);

    // Wasteland night gradient backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#130e1c');
    grad.addColorStop(0.58, '#291722');
    grad.addColorStop(1, '#3d2219');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Horizon dunes silhouette
    ctx.fillStyle = '#1d1216';
    ctx.fillRect(0, height - 42, width, 42);
    ctx.fillStyle = '#29191c';
    ctx.fillRect(0, height - 34, width, 34);

    // Animated floating ash embers
    for (let i = 0; i < 18; i++) {
      const ex = ((i * 47 + Math.floor(timeSec * (12 + (i % 4) * 5))) % (width + 16)) - 8;
      const ey = height - ((i * 29 + Math.floor(timeSec * (16 + (i % 3) * 6))) % height);
      ctx.fillStyle = i % 3 === 0 ? '#ffe047' : '#ff6b35';
      ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
    }

    // Logo (sprLogoGlow softly pulsing behind sprLogo; intro clamps permanently at frame 7)
    const logoY = 60;
    const hasLogo = this.sprites.hasSprite('sprLogo');
    if (hasLogo) {
      if (this.sprites.hasSprite('sprLogoGlow')) {
        const glowPulse = 0.22 + 0.12 * Math.sin(timeSec * 3.0);
        this.sprites.draw(ctx, 'sprLogoGlow', cx, logoY, { alpha: glowPulse, pixelSnap: true });
      }
      const logoSpr = this.sprites.getSprite('sprLogo');
      const logoFrame = computeTitleLogoFrame(timeSec, logoSpr?.frames.length ?? 8);
      this.sprites.draw(ctx, 'sprLogo', cx, logoY, {
        frame: logoFrame,
        pixelSnap: true,
      });
    } else {
      // Crisp pixel-art clean-room title emblem
      ctx.fillStyle = 'rgba(255, 110, 40, 0.22)';
      ctx.fillRect(cx - 118, 22, 236, 62);
      ctx.fillStyle = '#160f1c';
      ctx.fillRect(cx - 114, 26, 228, 54);
      ctx.strokeStyle = '#ff9838';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 114, 26, 228, 54);

      this.fonts.draw(ctx, 'KRUNKED', cx, 35, 'fntL', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
      this.fonts.draw(ctx, 'THRONE', cx, 55, 'fntL', {
        align: 'center',
        color: '#ff5238',
        outline: true,
      });
    }

    // Subtitle
    this.fonts.draw(ctx, '@dORIGINAL 16-BIT WASTELAND ACTION', cx, 108, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    // Primary buttons
    const btnW = 116;
    const btnH = 20;
    this.drawButton(
      ctx,
      'title_play',
      cx - Math.floor(btnW / 2),
      121,
      btnW,
      btnH,
      'PLAY',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { accent: '#52e864', focused: this.focusedIndex === 0 },
    );

    this.drawButton(
      ctx,
      'title_options',
      cx - Math.floor(btnW / 2),
      145,
      btnW,
      btnH,
      'OPTIONS',
      () => ({ type: 'open_screen', screen: 'options' }),
      { accent: '#ffe047', focused: this.focusedIndex === 1 },
    );

    // Custom Pack / Built-In Krunked Art Pack Toggle Row
    const isCustomPack = this.bundle.sourceMode === 'steam';
    const toggleY = 170;
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

    // Best run footer
    if (save.totalRuns > 0) {
      const best =
        save.bestLoop > 0
          ? `@dBEST: @yL${save.bestLoop} ${save.bestArea}@d  KILLS: @w${save.bestKills}`
          : `@dBEST: @w${save.bestArea}@d  KILLS: @w${save.bestKills}`;
      this.fonts.draw(ctx, best, cx, 195, 'fntSmall', { align: 'center', outline: true });
    } else if (mctx.inputMode === 'gamepad' || mctx.gamepadConnected) {
      this.fonts.draw(
        ctx,
        '@gCONTROLLER READY  @d[LS/DPAD] MOVE  [A] SELECT',
        cx,
        195,
        'fntSmall',
        { align: 'center', outline: true },
      );
    }

    // Subtle top-right connected controller badge when active
    if (mctx.gamepadConnected) {
      this.fonts.draw(ctx, '@gPAD READY', width - 6, 5, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }

    // Asset mode / live status badge at bottom
    const badgeText = mctx.assetStatusText
      ? mctx.assetStatusText
      : isCustomPack
        ? `@gCUSTOM PACK: ${this.bundle.manifest.stats.spriteCount} SPRITES`
        : `@gKRUNKED ART PACK: ${this.bundle.manifest.stats.spriteCount} SPRITES`;
    this.fonts.draw(ctx, badgeText, cx, height - 13, 'fntSmall', {
      align: 'center',
      outline: true,
    });
  }

  // --------------------------------------------------------------------------
  // 2. CAMPFIRE MUTANT SELECT (ALL 12 MUTANTS)
  // --------------------------------------------------------------------------

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

    // Dark campfire night wasteland background
    ctx.fillStyle = '#141018';
    ctx.fillRect(0, 0, width, height);

    // Warm flickering firelight pool around campfire (spaced cleanly clear of right info card)
    const isWide = width >= 380;
    const infoW = isWide ? 138 : 128;
    const infoX = width - infoW - (isWide ? 8 : 4);
    const fireX = isWide ? Math.round(width * 0.5) - 10 : 146;
    const fireY = 92;
    const flicker = Math.sin(timeSec * 13) * 4 + Math.cos(timeSec * 23) * 2;
    const fireGrad = ctx.createRadialGradient(fireX, fireY, 6, fireX, fireY, 96 + flicker);
    fireGrad.addColorStop(0, 'rgba(255, 145, 45, 0.42)');
    fireGrad.addColorStop(0.5, 'rgba(180, 70, 25, 0.16)');
    fireGrad.addColorStop(1, 'rgba(20, 16, 24, 0)');
    ctx.fillStyle = fireGrad;
    ctx.fillRect(0, 0, width, height);

    // Ground circle around fire (sized cleanly so right mutant card never overlaps campfire ring)
    const groundRx = isWide ? 56 : 38;
    ctx.fillStyle = '#33251e';
    ctx.beginPath();
    ctx.ellipse(fireX, fireY + 8, groundRx, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated Campfire sprite
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

    // Selected mutant idle sprite sitting/standing beside the campfire
    const idleSpr =
      skin === 'b' && selected.sprites.bIdle && this.sprites.hasSprite(selected.sprites.bIdle)
        ? selected.sprites.bIdle
        : selected.sprites.idle;
    this.sprites.draw(ctx, idleSpr, fireX - 24, fireY + 8, {
      frame: Math.floor(timeSec * 6),
      scaleX: 1.5,
      scaleY: 1.5,
      pixelSnap: true,
    });

    // Live Big Portrait (left side, using pixel-verified 2-frame-per-mutant A/B indexing)
    const portX = 8;
    const portY = 24;
    const portW = 74;
    const portH = 92;
    ctx.fillStyle = 'rgba(12, 10, 18, 0.72)';
    ctx.fillRect(portX, portY, portW, portH);
    ctx.strokeStyle = skin === 'b' ? '#ffe047' : '#524863';
    ctx.lineWidth = 1;
    ctx.strokeRect(portX + 0.5, portY + 0.5, portW - 1, portH - 1);

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
    const drewPort = this.sprites.drawInBox(
      ctx,
      portSpriteName,
      portraitFrame,
      portX + 3,
      portY + 3,
      portW - 6,
      portH - 6,
    );
    if (!drewPort) {
      this.sprites.drawInBox(ctx, idleSpr, Math.floor(timeSec * 4), portX + 12, portY + 16, 48, 48);
    }

    // Right-side Mutant Details Panel (positioned cleanly clear of the campfire stone ring)
    const infoY = 22;
    const infoH = 112;
    ctx.fillStyle = 'rgba(12, 10, 18, 0.82)';
    ctx.fillRect(infoX, infoY, infoW, infoH);
    ctx.strokeStyle = '#524863';
    ctx.lineWidth = 1;
    ctx.strokeRect(infoX + 0.5, infoY + 0.5, infoW - 1, infoH - 1);

    this.fonts.draw(ctx, selected.name, infoX + 6, infoY + 5, 'fntM1', {
      color: '#ffe047',
      outline: true,
    });
    this.fonts.draw(ctx, `@r${selected.maxHp} HP`, infoX + infoW - 6, infoY + 6, 'fntSmall', {
      align: 'right',
      outline: true,
    });

    this.fonts.draw(ctx, `@wPASSIVE: @s${selected.passiveDesc}`, infoX + 6, infoY + 19, 'fntSmall', {
      maxWidth: infoW - 12,
      shadow: true,
    });
    this.fonts.draw(ctx, `@gACTIVE: @s${selected.activeDesc}`, infoX + 6, infoY + 46, 'fntSmall', {
      maxWidth: infoW - 12,
      shadow: true,
    });
    this.fonts.draw(ctx, `@pTB: @s${selected.throneButtDesc}`, infoX + 6, infoY + 74, 'fntSmall', {
      maxWidth: infoW - 12,
      shadow: true,
    });

    if (mProg && mProg.runs > 0) {
      this.fonts.draw(
        ctx,
        `@dBEST ${mProg.bestLoop > 0 ? `L${mProg.bestLoop} ` : ''}${mProg.bestArea} | ${mProg.bestKills}K`,
        infoX + 6,
        infoY + infoH - 11,
        'fntSmall',
        { shadow: false },
      );
    }

    // Header & Top-Left Back button
    const inActions = this.campfireRow === 'actions';
    const inputMode = mctx.inputMode ?? 'kbm';
    this.drawButton(
      ctx,
      'camp_back',
      6,
      4,
      46,
      15,
      inputMode === 'gamepad' ? 'BACK [B]' : 'BACK',
      () => ({
        type: 'open_screen',
        screen: 'title',
      }),
      {
        font: 'fntSmall',
        accent: '#ff8a38',
        focused: inActions && this.campfireActionIndex === 4,
      },
    );

    this.fonts.draw(ctx, 'SELECT MUTANT', width * 0.5, 6, 'fntM1', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    // Loadout Action Row: SKIN A/B | CROWN | GOLDEN | PLAY/GO!
    const rowY = 140;
    this.drawButton(
      ctx,
      'camp_skin',
      8,
      rowY,
      54,
      18,
      skin === 'b' ? '@ySKIN: B' : 'SKIN: A',
      () => ({ type: 'toggle_bskin', mutant: selected.id }),
      {
        font: 'fntSmall',
        accent: '#ffe047',
        focused: inActions && this.campfireActionIndex === 0,
      },
    );

    const crownLabel =
      crown.id === 'none' ? 'CROWN: NONE' : crown.name.replace('CROWN OF ', 'CRN: ');
    this.drawButton(
      ctx,
      'camp_crown',
      66,
      rowY,
      86,
      18,
      crownLabel.slice(0, 14),
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

    const hasGold = Boolean(mProg?.goldenWeapon) || selected.id === 'yv';
    this.drawButton(
      ctx,
      'camp_golden',
      156,
      rowY,
      68,
      18,
      save.useGoldenWeapon ? '@yGOLD: ON' : hasGold ? 'GOLD: OFF' : '@dGOLD: OFF',
      () => ({ type: 'toggle_golden', enabled: !save.useGoldenWeapon }),
      {
        font: 'fntSmall',
        accent: '#ffe047',
        focused: inActions && this.campfireActionIndex === 2,
      },
    );

    const goLabel =
      inputMode === 'gamepad'
        ? '@gGO! [A]'
        : inputMode === 'touch'
          ? '@gGO!'
          : '@gGO! [ENTER]';
    this.drawButton(
      ctx,
      'camp_go',
      width - 82,
      rowY - 2,
      74,
      22,
      goLabel,
      () => ({
        type: 'start_run',
        mutant: selected.id,
        skin,
        crown: save.selectedCrown,
        useGoldenWeapon: save.useGoldenWeapon,
      }),
      {
        font: 'fntSmall',
        accent: '#52e864',
        focused: !inActions || this.campfireActionIndex === 3,
      },
    );

    // Bottom 12-Mutant Roster Strip (clickable + keyboard arrow navigable)
    const count = mutants.length;
    const slotGap = 3;
    const slotW = Math.min(24, Math.floor((width - 16 - (count - 1) * slotGap) / count));
    const slotH = 30;
    const stripW = count * slotW + (count - 1) * slotGap;
    const stripX = Math.round((width - stripW) * 0.5);
    const stripY = height - slotH - 18;

    const charSelectSpr = this.sprites.getSprite('sprCharSelect');

    for (let i = 0; i < count; i++) {
      const m = mutants[i]!;
      const sx = stripX + i * (slotW + slotGap);
      const isSelected = m.id === selected.id;
      const rid = `camp_mutant_${m.id}`;
      const hovered = this.hoveredId === rid;

      ctx.fillStyle = isSelected
        ? 'rgba(72, 54, 30, 0.95)'
        : hovered
          ? 'rgba(42, 36, 56, 0.9)'
          : 'rgba(18, 15, 24, 0.85)';
      ctx.fillRect(sx, stripY, slotW, slotH);
      ctx.strokeStyle = isSelected ? '#ffe047' : hovered ? '#ffffff' : '#4a4358';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(sx + 0.5, stripY + 0.5, slotW - 1, slotH - 1);

      // Draw character portrait/sprite inside slot (sprCharSelect or live mutant idle)
      const useCharSelect =
        charSelectSpr &&
        charSelectSpr.frames.length >= 12 &&
        this.sprites.hasSprite('sprCharSelect');
      let drewCard = false;
      if (useCharSelect) {
        const frame = charSelectSpr.frames.length >= 13 ? m.raceIndex : i;
        drewCard = this.sprites.drawInBox(ctx, 'sprCharSelect', frame, sx + 2, stripY + 2, slotW - 4, slotH - 6);
      }
      if (!drewCard) {
        this.sprites.drawInBox(ctx, m.sprites.idle, 0, sx + 2, stripY + 4, slotW - 4, slotH - 8);
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
        ? `@y[A] @w${selected.name}  @d[LB]SKIN [RB]CRN [Y]GOLD [UP]BAR`
        : inputMode === 'touch'
          ? `@w${selected.name}  @dTAP MUTANT OR GO TO PLAY`
          : `@y< A / D > @w${selected.name}  @d(UP/DOWN LOADOUT - ENTER PLAY)`;
    this.fonts.draw(
      ctx,
      campHint,
      width * 0.5,
      height - 11,
      'fntSmall',
      { align: 'center', outline: true },
    );
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

    // Rich dark backdrop so mutation cards & headers pop cleanly with zero bleed-through
    ctx.fillStyle = 'rgba(10, 9, 14, 0.92)';
    ctx.fillRect(0, 0, width, height);

    this.fonts.draw(ctx, '@gMUTATION', width * 0.5, 16, 'fntL', {
      align: 'center',
      outline: true,
    });
    const mutInputMode = mctx.inputMode ?? 'kbm';
    const mutPrompt =
      mutInputMode === 'gamepad'
        ? '@dCHOOSE ONE  ([LS/DPAD] BROWSE  [A] PICK)'
        : mutInputMode === 'touch'
          ? '@dTAP A MUTATION TO SELECT'
          : '@dCHOOSE ONE  (CLICK OR KEYS 1-' + Math.max(1, list.length) + ')';
    this.fonts.draw(ctx, mutPrompt, width * 0.5, 36, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    if (list.length === 0) return;

    const cardW = list.length >= 5 ? 54 : 62;
    const cardH = 82;
    const gap = list.length >= 5 ? 6 : 10;
    const totalW = list.length * cardW + (list.length - 1) * gap;
    const startX = Math.round((width - totalW) * 0.5);
    const cardY = 58;

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

      ctx.fillStyle = isFocused ? 'rgba(34, 52, 38, 0.96)' : 'rgba(20, 22, 28, 0.92)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = isFocused ? '#52e864' : '#535766';
      ctx.lineWidth = isFocused ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);

      // Key badge [1]..[5]
      this.fonts.draw(ctx, `@y[${i + 1}]`, x + 4, y + 4, 'fntSmall', { outline: true });

      // Mutation sprSkillIcon card
      const drewIcon = def
        ? this.sprites.drawInBox(
            ctx,
            def.sprite || 'sprSkillIcon',
            def.iconFrame,
            x + Math.floor((cardW - 30) / 2),
            y + 15,
            30,
            38,
          )
        : false;
      if (!drewIcon) {
        ctx.fillStyle = '#4de862';
        ctx.fillRect(x + 16, y + 20, cardW - 32, 28);
      }

      const name = def ? def.name : mutId.replace(/_/g, ' ').toUpperCase();
      this.fonts.draw(ctx, name, x + cardW * 0.5, y + 58, 'fntSmall', {
        align: 'center',
        maxWidth: cardW - 6,
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

    // Selected mutation detail box at bottom
    const focusedDef = this.data.getMutation(list[activeIdx]!);
    const descBoxW = Math.min(300, width - 24);
    const descX = Math.round((width - descBoxW) * 0.5);
    const descY = height - 62;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.9)';
    ctx.fillRect(descX, descY, descBoxW, 46);
    ctx.strokeStyle = '#52e864';
    ctx.lineWidth = 1;
    ctx.strokeRect(descX + 0.5, descY + 0.5, descBoxW - 1, 45);

    if (focusedDef) {
      this.fonts.draw(ctx, `@y${focusedDef.name}`, width * 0.5, descY + 6, 'fntM1', {
        align: 'center',
        outline: true,
      });
      this.fonts.draw(ctx, focusedDef.description, width * 0.5, descY + 20, 'fntSmall', {
        align: 'center',
        maxWidth: descBoxW - 16,
        outline: true,
      });
      this.fonts.draw(ctx, `@d"${focusedDef.tip}"`, width * 0.5, descY + 34, 'fntSmall', {
        align: 'center',
      });
    }
  }

  private renderUltraSelect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState } = mctx;
    const list = simState?.pendingUltras ?? [];

    ctx.fillStyle = 'rgba(10, 9, 14, 0.92)';
    ctx.fillRect(0, 0, width, height);

    this.fonts.draw(ctx, '@yULTRA MUTATION', width * 0.5, 16, 'fntL', {
      align: 'center',
      outline: true,
    });
    this.fonts.draw(ctx, '@gLEVEL ULTRA REACHED - CHOOSE YOUR PATH', width * 0.5, 36, 'fntSmall', {
      align: 'center',
      outline: true,
    });

    if (list.length === 0) return;

    const cardW = 122;
    const cardH = 112;
    const gap = 18;
    const totalW = list.length * cardW + (list.length - 1) * gap;
    const startX = Math.round((width - totalW) * 0.5);
    const cardY = 62;

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

      ctx.fillStyle = isFocused ? 'rgba(54, 42, 24, 0.96)' : 'rgba(22, 18, 30, 0.92)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = isFocused ? '#ffe047' : '#635978';
      ctx.lineWidth = isFocused ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);

      this.fonts.draw(ctx, `@y[${i + 1}] ULTRA ${i === 0 ? 'A' : 'B'}`, x + cardW * 0.5, y + 6, 'fntSmall', {
        align: 'center',
        outline: true,
      });

      const drewIcon = def
        ? this.sprites.drawInBox(ctx, def.sprite || 'sprEGSkillIcon', def.iconIndex, x + Math.floor((cardW - 34) / 2), y + 20, 34, 42)
        : false;
      if (!drewIcon) {
        ctx.fillStyle = '#ffe047';
        ctx.fillRect(x + 44, y + 24, 34, 34);
      }

      const title = def ? def.name : ultraId.toUpperCase();
      this.fonts.draw(ctx, title, x + cardW * 0.5, y + 68, 'fntM1', {
        align: 'center',
        color: '#ffe047',
        outline: true,
      });
      if (def) {
        this.fonts.draw(ctx, def.description, x + cardW * 0.5, y + 84, 'fntSmall', {
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
  }

  // --------------------------------------------------------------------------
  // 4. PAUSE OVERLAY
  // --------------------------------------------------------------------------

  private renderPauseOverlay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    mctx: MenuRenderContext,
  ): void {
    const { width, height, simState } = mctx;
    const cx = Math.round(width * 0.5);

    ctx.fillStyle = 'rgba(8, 6, 14, 0.78)';
    ctx.fillRect(0, 0, width, height);

    const panelW = 168;
    const panelH = 164;
    const px = cx - Math.floor(panelW / 2);
    const py = Math.round((height - panelH) * 0.5);

    ctx.fillStyle = 'rgba(18, 14, 24, 0.94)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = '#ffe047';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

    this.fonts.draw(ctx, 'PAUSED', cx, py + 10, 'fntL', {
      align: 'center',
      color: '#ffffff',
      outline: true,
    });

    if (simState) {
      const info = `@y${simState.loop > 0 ? `L${simState.loop} ` : ''}${simState.areaCode}  @wKILLS: ${simState.stats.kills}  @gLV ${simState.player.level}`;
      this.fonts.draw(ctx, info, cx, py + 32, 'fntSmall', { align: 'center', outline: true });
    }

    const btnW = 128;
    const btnH = 20;
    const bx = cx - Math.floor(btnW / 2);

    this.drawButton(ctx, 'pause_resume', bx, py + 48, btnW, btnH, 'RESUME', () => ({ type: 'resume' }), {
      accent: '#52e864',
      focused: this.focusedIndex === 0,
      font: 'fntSmall',
    });
    this.drawButton(
      ctx,
      'pause_options',
      bx,
      py + 73,
      btnW,
      btnH,
      'OPTIONS',
      () => ({ type: 'open_screen', screen: 'options' }),
      { accent: '#ffe047', focused: this.focusedIndex === 1, font: 'fntSmall' },
    );
    const pauseMode = mctx.inputMode ?? 'kbm';
    const restartLabel =
      pauseMode === 'gamepad'
        ? 'RESTART [BACK]'
        : pauseMode === 'touch'
          ? 'RESTART'
          : 'RESTART [R]';
    this.drawButton(ctx, 'pause_restart', bx, py + 98, btnW, btnH, restartLabel, () => ({ type: 'restart' }), {
      accent: '#ff8a38',
      focused: this.focusedIndex === 2,
      font: 'fntSmall',
    });
    this.drawButton(
      ctx,
      'pause_campfire',
      bx,
      py + 123,
      btnW,
      btnH,
      'CAMPFIRE',
      () => ({ type: 'open_screen', screen: 'campfire' }),
      { accent: '#ff4242', focused: this.focusedIndex === 3, font: 'fntSmall' },
    );
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
    const cx = Math.round(width * 0.5);

    ctx.fillStyle = 'rgba(12, 10, 18, 0.94)';
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(296, width - 16);
    const panelH = height - 16;
    const px = Math.round((width - panelW) * 0.5);
    const modalY = 8;

    ctx.fillStyle = 'rgba(20, 17, 28, 0.96)';
    ctx.fillRect(px, modalY, panelW, panelH);
    ctx.strokeStyle = '#6b6080';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, modalY + 0.5, panelW - 1, panelH - 1);

    // Top row: BACK button on top-left + OPTIONS header centered cleanly at modalY + 8
    this.drawButton(
      ctx,
      'opt_back',
      px + 6,
      modalY + 5,
      48,
      15,
      inputMode === 'gamepad' ? 'BACK [B]' : 'BACK',
      () => ({
        type: 'open_screen',
        screen: returnScreenFromOptions,
      }),
      { font: 'fntSmall' },
    );

    this.fonts.draw(ctx, 'OPTIONS', cx, modalY + 8, 'fntM1', {
      align: 'center',
      color: '#ffe047',
      outline: true,
    });

    if (inputMode === 'gamepad') {
      this.fonts.draw(ctx, '@d[LB/RB]', px + panelW - 8, modalY + 9, 'fntSmall', {
        align: 'right',
        outline: true,
      });
    }

    // 3-Tab Row below header (VIDEO/AUDIO | CONTROLS | KEYBINDS) — fits 320x240 & 426x240 cleanly
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

      // Crosshair style + Show FPS + Mute row
      const thirdW = Math.floor((contentW - 8) / 3);
      this.drawButton(
        ctx,
        'opt_crosshair',
        contentX,
        y,
        thirdW,
        16,
        `AIM ${save.render.crosshairStyle + 1}`,
        () => ({
          type: 'update_render',
          partial: { crosshairStyle: (save.render.crosshairStyle + 1) % 7 },
        }),
        { font: 'fntSmall', labelOffsetX: -10, focused: this.focusedIndex === 2 },
      );
      this.sprites.draw(ctx, 'sprCrosshair', contentX + thirdW - 12, y + 8, {
        frame: save.render.crosshairStyle,
        scaleX: 0.7,
        scaleY: 0.7,
        pixelSnap: true,
      });

      this.drawButton(
        ctx,
        'opt_showfps',
        contentX + thirdW + 4,
        y,
        thirdW,
        16,
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
        16,
        save.audio.muted ? '@rMUTED' : '@gAUDIO ON',
        () => ({ type: 'update_audio', partial: { muted: !save.audio.muted } }),
        {
          font: 'fntSmall',
          accent: save.audio.muted ? '#ff4242' : '#52e864',
          focused: this.focusedIndex === 4,
        },
      );
      y += 22;

      // Sliders: Screen Shake + Master / SFX / Music / Ambience volumes
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
          ? '@d[UP/DN] SELECT  [L/R] SLIDER  [A] TOGGLE  [B] BACK'
          : '@dCLICK, DRAG, OR ARROWS - SETTINGS AUTO-SAVE';
      this.fonts.draw(ctx, genFooter, cx, modalY + panelH - 12, 'fntSmall', { align: 'center' });
    } else if (this.optionsTab === 'controls') {
      // Dedicated Controls Tab (PC + Tesla Controller & Touch Controls)
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
          ? 'TOUCH CONTROLS: @gAUTO (TOUCH ONLY)'
          : 'TOUCH CONTROLS: @dOFF',
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
      y += 24;

      // Live PC / Tesla Controller Status & Compact Legend Card
      const boxH = 54;
      ctx.fillStyle = 'rgba(12, 10, 18, 0.85)';
      ctx.fillRect(contentX, y, contentW, boxH);
      ctx.strokeStyle = mctx.gamepadConnected ? '#52e864' : '#4a4358';
      ctx.lineWidth = 1;
      ctx.strokeRect(contentX + 0.5, y + 0.5, contentW - 1, boxH - 1);

      const rawName = (mctx.gamepadName ?? '').trim().toUpperCase();
      const shortName = rawName.length > 26 ? `${rawName.slice(0, 25)}.` : rawName;
      const profileTag =
        mctx.gamepadProfile === 'standard'
          ? 'STD'
          : mctx.gamepadProfile === 'linux-xpad' || mctx.gamepadProfile === 'sony-hid'
            ? 'EVDEV'
            : mctx.gamepadProfile
              ? 'COMPAT'
              : '';
      const padLine = mctx.gamepadConnected
        ? `@gCONNECTED: @w${shortName || 'CONTROLLER'} @d(${profileTag})`
        : '@dNO CONTROLLER DETECTED - PRESS ANY PAD BUTTON';
      this.fonts.draw(ctx, padLine, cx, y + 7, 'fntSmall', {
        align: 'center',
        maxWidth: contentW - 10,
        outline: true,
      });

      this.fonts.draw(
        ctx,
        '@yLS@w MOVE  @yRS@w AIM  @yRT/RB@w FIRE  @yLT/LB@w ACT',
        cx,
        y + 24,
        'fntSmall',
        { align: 'center', outline: true },
      );
      this.fonts.draw(
        ctx,
        '@yY@w SWAP  @yA/X@w USE  @ySTART@w PAUSE  @yBACK@w RETRY',
        cx,
        y + 38,
        'fntSmall',
        { align: 'center', outline: true },
      );

      const ctrlFooter =
        inputMode === 'gamepad'
          ? '@d[LB/RB] TABS  [L/R] ADJUST  [A] TOGGLE  [B] BACK'
          : '@dPC & TESLA GAMEPAD + TOUCH AUTO-DETECT';
      this.fonts.draw(ctx, ctrlFooter, cx, modalY + panelH - 12, 'fntSmall', {
        align: 'center',
      });
    } else {
      // Keybind Rebinding Table
      const rowH = 19;
      const colW = Math.floor((contentW - 8) / 2);

      for (let i = 0; i < KEYBIND_LABELS.length; i++) {
        const entry = KEYBIND_LABELS[i]!;
        const col = i % 2;
        const row = Math.floor(i / 2);
        const rx = contentX + col * (colW + 8);
        const ry = y + row * (rowH + 4);
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

      this.drawButton(
        ctx,
        'opt_kb_reset',
        cx - 56,
        modalY + panelH - 26,
        112,
        16,
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

    ctx.fillStyle = victory ? 'rgba(20, 18, 10, 0.90)' : 'rgba(18, 8, 12, 0.90)';
    ctx.fillRect(0, 0, width, height);

    // Header
    this.fonts.draw(
      ctx,
      victory ? 'VICTORY!' : 'GAME OVER',
      cx,
      14,
      'fntL',
      { align: 'center', color: victory ? '#ffe047' : '#ff4242', outline: true },
    );

    const sub = victory
      ? '@yYOU REACHED THE KRUNKED THRONE'
      : '@dYOU DID NOT REACH THE KRUNKED THRONE';
    this.fonts.draw(ctx, sub, cx, 35, 'fntSmall', { align: 'center', outline: true });

    // Summary Card
    const cardW = Math.min(276, width - 24);
    const cardH = 122;
    const cardX = Math.round((width - cardW) * 0.5);
    const cardY = 48;

    ctx.fillStyle = 'rgba(14, 12, 20, 0.92)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = victory ? '#ffe047' : '#a82838';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

    const mutant = this.data.getMutant(simState?.player.mutant ?? save.selectedMutant);
    const areaText = simState
      ? simState.loop > 0
        ? `L${simState.loop} ${simState.areaCode}`
        : simState.areaCode
      : save.bestArea;
    const kills = simState?.stats.kills ?? 0;
    const bosses = simState?.stats.bossesDefeated ?? [];
    const mins = Math.floor(((simState?.stats.timeTicks ?? 0) / 30) / 60);
    const secs = Math.floor(((simState?.stats.timeTicks ?? 0) / 30) % 60);
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    // Left sprite box: killer sprite on Game Over, triumphant mutant portrait on Victory
    const boxX = cardX + 10;
    const boxY = cardY + 12;
    const boxSize = 54;
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(boxX, boxY, boxSize, boxSize);
    ctx.strokeStyle = '#524863';
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1);

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
        this.sprites.drawInBox(ctx, mutant.sprites.idle, 0, boxX + 8, boxY + 8, boxSize - 16, boxSize - 16);
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
        drew = this.sprites.drawInBox(ctx, rawKiller, 0, boxX + 6, boxY + 6, boxSize - 12, boxSize - 12);
      }
      if (!drew) {
        const deadDef = this.sprites.getSprite(deadSpr);
        const deadFrame = resolveCorpseFrame(deadDef?.frames.length ?? 1);
        drew = this.sprites.drawInBox(ctx, deadSpr, deadFrame, boxX + 8, boxY + 8, boxSize - 16, boxSize - 16);
      }
      if (!drew) {
        this.sprites.drawInBox(ctx, 'sprBanditIdle', 0, boxX + 6, boxY + 6, boxSize - 12, boxSize - 12);
      }
    }

    // Stats column
    const sx = boxX + boxSize + 12;
    if (!victory) {
      const cause = (simState?.player.lastDamageCause || 'WASTELAND').toUpperCase();
      this.fonts.draw(ctx, `@rKILLED BY: @w${cause}`, sx, cardY + 12, 'fntSmall', {
        maxWidth: cardW - boxSize - 30,
        outline: true,
      });
    } else {
      this.fonts.draw(ctx, `@yMUTANT: @w${mutant.name}`, sx, cardY + 12, 'fntSmall', {
        outline: true,
      });
    }

    this.fonts.draw(ctx, `@dAREA: @w${areaText}    @dTIME: @w${timeStr}`, sx, cardY + 28, 'fntSmall', {
      outline: true,
    });
    this.fonts.draw(
      ctx,
      `@dKILLS: @y${kills}    @dLEVEL: @g${simState?.player.level ?? 1}`,
      sx,
      cardY + 41,
      'fntSmall',
      { outline: true },
    );
    const bossListStr =
      bosses.length > 0
        ? bosses
            .map((b) =>
              (this.data.getEnemy(b)?.name ?? (b === 'nuclear_throne' ? 'THE KRUNKED THRONE' : b.replace(/_/g, ' '))).toUpperCase(),
            )
            .join(', ')
        : 'NONE';
    this.fonts.draw(ctx, `@dBOSSES: @w${bossListStr}`, sx, cardY + 54, 'fntSmall', {
      maxWidth: cardW - boxSize - 30,
      outline: true,
    });

    // Acquired mutations strip inside summary card
    const muts = simState?.player.mutations ?? [];
    this.fonts.draw(ctx, `@dMUTATIONS (${muts.length}):`, cardX + 10, cardY + 76, 'fntSmall', {
      outline: true,
    });
    for (let i = 0; i < Math.min(muts.length, 14); i++) {
      const def = this.data.getMutation(muts[i]!);
      const mx = cardX + 10 + i * 16;
      const my = cardY + 89;
      const drew = def
        ? this.sprites.drawInBox(ctx, def.hudSprite || 'sprSkillIconHUD', def.iconFrame, mx, my, 13, 13)
        : false;
      if (!drew) {
        ctx.fillStyle = '#4de862';
        ctx.fillRect(mx, my, 12, 12);
      }
    }

    // Bottom buttons: RETRY & CAMPFIRE (100% gamepad/keyboard/touch focusable)
    const endMode = mctx.inputMode ?? 'kbm';
    const retryBtnLabel =
      endMode === 'gamepad'
        ? victory
          ? 'NEW RUN [BACK]'
          : 'RETRY [BACK]'
        : endMode === 'touch'
          ? victory
            ? 'NEW RUN'
            : 'RETRY'
          : victory
            ? 'NEW RUN [R]'
            : 'RETRY [R]';
    const campBtnLabel = endMode === 'gamepad' ? 'CAMPFIRE [B]' : 'CAMPFIRE';

    const btnY = cardY + cardH + 14;
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
