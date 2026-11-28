import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  type BossId,
  type BossState,
  type MutantId,
  type RenderSettings,
  type SimState,
} from '@/contracts';
import { createFallbackBundle } from '@/assets';
import { GameApp, evaluateRunUnlocks } from '@/app/game-app';
import { BitmapFontRenderer, CameraController } from '@/render';
import { createRunState } from '@/sim/entities';
import {
  ALL_MUTANT_IDS,
  DEFAULT_UI_DATA_PROVIDER,
  HudRenderer,
  MenuSystem,
  SaveManager,
  computeUltraIconFrame,
  createDefaultSaveData,
} from '@/ui';
import {
  BOSS_INTRO_MAX_TICKS,
  BOSS_INTRO_SUBTITLES,
  computeBossIntroAnimState,
  computePortalGeneratingPercent,
  resolveBossDisplayName,
  resolveBossSubtitle,
  resolveUltraRadCap,
} from '@/ui/hud';
import {
  BSKIN_UNLOCK_HINTS,
  MUTANT_UNLOCK_HINTS,
  computeLevelUpTextLayout,
  computePauseLayout,
  computePortraitFrame,
  isBSkinUnlockedInSave,
  isCrownUnlockedInSave,
  isHardModeUnlockedInSave,
  isMutantUnlockedInSave,
  resolveBigPortraitSprite,
  resolveRunProgressIndex,
} from '@/ui/menus';
import type { MenuInputSnapshot } from '@/input';

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
}

interface DrawImageCall {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  alpha: number;
  img: unknown;
}

function createRecordingCtx() {
  const fillRects: RectCall[] = [];
  const drawCalls: DrawImageCall[] = [];
  let curFill = '#000000';
  let curAlpha = 1;
  const alphaStack: number[] = [];
  const noop = (): void => {};

  const ctx = {
    imageSmoothingEnabled: false,
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '8px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    globalCompositeOperation: 'source-over',
    get fillStyle(): string {
      return curFill;
    },
    set fillStyle(v: string | object) {
      if (typeof v === 'string') curFill = v;
    },
    get globalAlpha(): number {
      return curAlpha;
    },
    set globalAlpha(v: number) {
      curAlpha = v;
    },
    save: () => {
      alphaStack.push(curAlpha);
    },
    restore: () => {
      const prev = alphaStack.pop();
      if (prev !== undefined) curAlpha = prev;
    },
    beginPath: noop,
    rect: noop,
    clip: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    clearRect: noop,
    strokeRect: noop,
    fillText: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, style: curFill });
    },
    drawImage: (...args: unknown[]) => {
      if (args.length >= 9) {
        drawCalls.push({
          img: args[0],
          dx: Number(args[5]),
          dy: Number(args[6]),
          dw: Number(args[7]),
          dh: Number(args[8]),
          alpha: curAlpha,
        });
      } else if (args.length >= 5) {
        drawCalls.push({
          img: args[0],
          dx: Number(args[1]),
          dy: Number(args[2]),
          dw: Number(args[3]),
          dh: Number(args[4]),
          alpha: curAlpha,
        });
      }
    },
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillRects,
    drawCalls,
  };
}

function makeFakeCanvas() {
  const rec = createRecordingCtx();
  const canvas = {
    width: LOGICAL_WIDTH_4_3,
    height: LOGICAL_HEIGHT,
    tabIndex: 0,
    style: { width: '320px', height: '240px', imageRendering: 'pixelated' },
    classList: { toggle: () => {} },
    parentElement: null,
    getContext: () => rec.ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {},
  } as unknown as HTMLCanvasElement;
  return { canvas, rec };
}

function makeMenuInput(partial: Partial<MenuInputSnapshot> = {}): MenuInputSnapshot {
  return {
    navUp: false,
    navDown: false,
    navLeft: false,
    navRight: false,
    confirm: false,
    back: false,
    prevTab: false,
    nextTab: false,
    secondary: false,
    tertiary: false,
    retry: false,
    pointer: {
      logicalX: 0,
      logicalY: 0,
      moved: false,
      down: false,
      clicked: false,
      rightClicked: false,
    },
    ...partial,
  };
}

const DEFAULT_RENDER: RenderSettings = {
  widescreen: false,
  targetFps: 120,
  classic30Fps: false,
  screenShakeScale: 1,
  crosshairStyle: 0,
  showFps: false,
  pixelSnap: true,
};

describe('Wave 2B Wiki UI, Campfire, Options & HUD Polish', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it('Options General tab exposes UNLOCK ALL toggle and keyboard/click actions', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);
    const save = createDefaultSaveData();
    const { ctx } = createRecordingCtx();

    menus.render(ctx, {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 0.5,
      returnScreenFromOptions: 'title',
    });

    const regions = menus.getHitRegions();
    const unlockReg = regions.find((r) => r.id === 'opt_unlock_all');
    expect(unlockReg).toBeDefined();
    expect(unlockReg!.y + unlockReg!.h).toBeLessThanOrEqual(214);
    expect(unlockReg!.onActivate()).toEqual({ type: 'set_unlock_all', enabled: true });

    // Every general option row must sit cleanly without overlapping neighbors
    const generalRowIds = [
      'opt_widescreen',
      'opt_fps',
      'opt_crosshair',
      'opt_showfps',
      'opt_mute',
      'opt_shake',
      'opt_vol_master',
      'opt_vol_sfx',
      'opt_vol_music',
      'opt_vol_amb',
      'opt_unlock_all',
    ];
    let prevBottom = 0;
    for (const id of generalRowIds) {
      const r = regions.find((reg) => reg.id === id);
      expect(r, `missing options row ${id}`).toBeDefined();
      expect(r!.y).toBeGreaterThanOrEqual(prevBottom);
      prevBottom = r!.y + r!.h;
    }

    // Bug #13: slider readout must be drawn to the RIGHT of the slider track (never overlapping thumb at <= 25%)
    const fontSpy = vi.spyOn(
      (menus as unknown as { fonts: BitmapFontRenderer }).fonts,
      'draw',
    );
    save.render.screenShakeScale = 0.15;
    menus.render(ctx, {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 0.5,
      returnScreenFromOptions: 'title',
    });
    const shakeReg = menus.getHitRegions().find((r) => r.id === 'opt_shake')!;
    const barRightEdge = shakeReg.x + 4 + 72; // barX = reg.x + 4, barW = 72
    const pctCall = fontSpy.mock.calls.find((call) => call[1] === '15%');
    expect(pctCall).toBeDefined();
    expect(Number(pctCall![2])).toBeGreaterThanOrEqual(barRightEdge + 4);
  });

  it('Bug #4: Options Keybinds PRESS KEY... highlight box uses measured bitmap font width', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);
    menus.setOptionsTab('keybinds');
    const save = createDefaultSaveData();
    const rec = createRecordingCtx();

    const fonts = (menus as unknown as { fonts: BitmapFontRenderer }).fonts;
    const expectedWidth = Math.max(24, fonts.measure('PRESS KEY...', 'fntM1').width + 6);

    menus.render(rec.ctx, {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      rebindingField: 'up',
    });

    const yellowHighlight = rec.fillRects.find((r) => r.style === '#ffe047' && r.h === 11);
    expect(yellowHighlight).toBeDefined();
    expect(yellowHighlight!.w).toBe(expectedWidth);
  });

  it('Campfire supports all 14 mutants cleanly on 4:3 and 16:9 with lock gating, Hard Mode & Proto Chest', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);

    for (const width of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const save = createDefaultSaveData();
      save.protoChestWeaponId = 'auto_crossbow';
      save.selectedMutant = 'skeleton'; // locked by default
      const rec = createRecordingCtx();

      menus.render(rec.ctx, {
        screen: 'campfire',
        save,
        simState: null,
        width,
        height: LOGICAL_HEIGHT,
        timeSec: 1,
        returnScreenFromOptions: 'title',
      });

      const regions = menus.getHitRegions();
      // All 14 mutants present & strictly within screen bounds with zero horizontal overlap
      const cards = ALL_MUTANT_IDS.map((id) => regions.find((r) => r.id === `camp_mutant_${id}`));
      expect(cards.every(Boolean)).toBe(true);
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i]!;
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(width);
        if (i > 0) {
          expect(c.x).toBeGreaterThan(cards[i - 1]!.x + cards[i - 1]!.w);
        }
      }

      // Locked Skeleton cannot start run (emits sndClickBack instead of start_run)
      const goBtn = regions.find((r) => r.id === 'camp_go')!;
      expect(goBtn.onActivate()).toEqual({ type: 'ui_sfx', sound: 'sndClickBack' });

      // Hard Mode toggle hidden when locked
      expect(regions.find((r) => r.id === 'camp_hard_mode')).toBeUndefined();

      // Enable UNLOCK ALL -> Skeleton & Hard Mode become available!
      save.unlockAll = true;
      save.hardModeEnabled = true;
      menus.render(rec.ctx, {
        screen: 'campfire',
        save,
        simState: null,
        width,
        height: LOGICAL_HEIGHT,
        timeSec: 1.5,
        returnScreenFromOptions: 'title',
      });

      const unlockedRegions = menus.getHitRegions();
      const hardBtn = unlockedRegions.find((r) => r.id === 'camp_hard_mode');
      expect(hardBtn).toBeDefined();
      expect(hardBtn!.onActivate()).toEqual({ type: 'toggle_hard_mode', enabled: false });

      const goUnlocked = unlockedRegions.find((r) => r.id === 'camp_go')!;
      expect(goUnlocked.onActivate()).toEqual({
        type: 'start_run',
        mutant: 'skeleton',
        skin: 'a',
        crown: 'none',
        useGoldenWeapon: false,
        hardMode: true,
      });
    }

    // Unlock helper checks
    const defaultSave = createDefaultSaveData();
    expect(isMutantUnlockedInSave(defaultSave, 'fish')).toBe(true);
    expect(isMutantUnlockedInSave(defaultSave, 'skeleton')).toBe(false);
    expect(isMutantUnlockedInSave(defaultSave, 'frog')).toBe(false);
    expect(isBSkinUnlockedInSave(defaultSave, 'fish')).toBe(false);
    expect(isBSkinUnlockedInSave(defaultSave, 'skeleton')).toBe(false);
    expect(isCrownUnlockedInSave(defaultSave, 'fish', 'blood')).toBe(false);
    expect(isHardModeUnlockedInSave(defaultSave)).toBe(false);

    defaultSave.unlockAll = true;
    expect(isMutantUnlockedInSave(defaultSave, 'skeleton')).toBe(true);
    expect(isMutantUnlockedInSave(defaultSave, 'frog')).toBe(true);
    expect(isBSkinUnlockedInSave(defaultSave, 'fish')).toBe(true);
    expect(isBSkinUnlockedInSave(defaultSave, 'skeleton')).toBe(false); // Skeleton/Frog have no B-skins
    expect(isCrownUnlockedInSave(defaultSave, 'fish', 'blood')).toBe(true);
    expect(isHardModeUnlockedInSave(defaultSave)).toBe(true);

    // Every unlock hint is pure ASCII and ampersand-free
    for (const id of ALL_MUTANT_IDS) {
      expect(MUTANT_UNLOCK_HINTS[id]).toMatch(/^[\x20-\x7e]+$/);
      expect(MUTANT_UNLOCK_HINTS[id]).not.toContain('&');
      expect(BSKIN_UNLOCK_HINTS[id]).toMatch(/^[\x20-\x7e]+$/);
      expect(BSKIN_UNLOCK_HINTS[id]).not.toContain('&');
    }
  });

  it('Portraits map Built-In (28f) & Steam (64f) Skeleton/Frog frames and special Rebel B Hooded / Headless Chicken', () => {
    // Built-In 28-frame layout
    expect(computePortraitFrame(14, 'a', 28)).toBe(24);
    expect(computePortraitFrame(15, 'a', 28)).toBe(26);
    // Steam 64-frame layout (24..25 is blank Big Dog slot)
    expect(computePortraitFrame(14, 'a', 64)).toBe(26);
    expect(computePortraitFrame(15, 'a', 64)).toBe(28);

    const bundle = createFallbackBundle();
    const hasSpr = (n: string) => Boolean(bundle.manifest.sprites[n]);
    const getFc = (n: string) => bundle.manifest.sprites[n]?.frames.length ?? 0;

    // Rebel B in Frozen City (5-1..5-3) -> sprBigPortraitRebelBHooded
    const rebel = DEFAULT_UI_DATA_PROVIDER.getMutant('rebel');
    const rebelFrozenState = createRunState({ mutant: 'rebel', skin: 'b', seed: 7 });
    rebelFrozenState.areaCode = '5-2';
    rebelFrozenState.biome = 'frozen_city';
    expect(resolveBigPortraitSprite(rebel, 'b', rebelFrozenState, 0, hasSpr, getFc)).toEqual({
      spriteName: 'sprBigPortraitRebelBHooded',
      frame: 0,
    });

    // Rebel A in Frozen City keeps standard sprBigPortrait
    expect(resolveBigPortraitSprite(rebel, 'a', rebelFrozenState, 0, hasSpr, getFc).spriteName).toBe(
      'sprBigPortrait',
    );

    // Headless Chicken -> sprBigPortraitChickenHeadless
    const chicken = DEFAULT_UI_DATA_PROVIDER.getMutant('chicken');
    const chickenState = createRunState({ mutant: 'chicken', seed: 9 });
    chickenState.player.headlessTicks = 90;
    const headlessPort = resolveBigPortraitSprite(chicken, 'a', chickenState, 0.5, hasSpr, getFc);
    expect(headlessPort.spriteName).toBe('sprBigPortraitChickenHeadless');
    expect(headlessPort.frame).toBeGreaterThanOrEqual(0);
    expect(headlessPort.frame).toBeLessThan(getFc('sprBigPortraitChickenHeadless'));
  });

  it('Horror 3-card Ultra Select, Skeleton/Frog Ultra frames (24..28), and navLeft/navRight wrapping', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);
    const save = createDefaultSaveData();
    const state = createRunState({ mutant: 'horror', seed: 42 });
    state.phase = 'ultra_select';
    state.pendingUltras = ['horror_a', 'horror_b', 'horror_c'];

    // Ultra icon frames across Built-In 29f & Steam 48f/52f
    expect(computeUltraIconFrame(11, 'c', 29)).toBe(24); // Horror Meltdown
    expect(computeUltraIconFrame(14, 'a', 29)).toBe(25); // Skeleton Redemption
    expect(computeUltraIconFrame(14, 'b', 29)).toBe(26); // Skeleton Damnation
    expect(computeUltraIconFrame(15, 'a', 29)).toBe(27); // Frog Distance
    expect(computeUltraIconFrame(15, 'b', 29)).toBe(28); // Frog Intimacy

    for (const width of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const rec = createRecordingCtx();
      menus.render(rec.ctx, {
        screen: 'ultra_select',
        save,
        simState: state,
        width,
        height: LOGICAL_HEIGHT,
        timeSec: 1,
        returnScreenFromOptions: 'title',
      });

      const cards = [0, 1, 2].map((i) => menus.getHitRegions().find((r) => r.id === `ultra_card_${i}`));
      expect(cards.every(Boolean)).toBe(true);
      expect(cards[0]!.x).toBeGreaterThanOrEqual(4);
      expect(cards[2]!.x + cards[2]!.w).toBeLessThanOrEqual(width - 4);
      expect(cards[1]!.x).toBeGreaterThan(cards[0]!.x + cards[0]!.w);
      expect(cards[2]!.x).toBeGreaterThan(cards[1]!.x + cards[1]!.w);
    }

    // Verify 3-way navLeft wraps 0 -> 2 and navRight wraps 2 -> 0
    const mctx = {
      screen: 'ultra_select' as const,
      save,
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title' as const,
    };
    menus.update(makeMenuInput({ navLeft: true }), mctx);
    expect(menus.getFocusedIndex()).toBe(2);
    menus.update(makeMenuInput({ navRight: true }), mctx);
    expect(menus.getFocusedIndex()).toBe(0);
  });

  it('Bug #5 & Bug #16: Level Up clears 2-line description above lifted card and omits empty top-right splat', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);
    const fonts = new BitmapFontRenderer(bundle);
    const baseCardY = LOGICAL_HEIGHT - 34;

    // Multi-line description clearance
    const layout = computeLevelUpTextLayout(
      fonts,
      'OPEN MIND',
      'EXTRA CHEST SPAWNS ON EVERY SINGLE LEVEL ACROSS THE ENTIRE WASTELAND LOOP',
      LOGICAL_WIDTH_4_3 - 24,
      baseCardY,
    );
    expect(layout.descBottomY).toBeLessThanOrEqual(baseCardY - 12);
    expect(layout.titleY + layout.titleHeight).toBeLessThanOrEqual(layout.descY - 3);

    // Bug #16: with 0 owned mutations/ultra/crown, top-right black ink splat must NOT be painted
    const state = createRunState({ mutant: 'fish', seed: 11 });
    state.phase = 'mutation_select';
    state.pendingMutations = ['rhino_skin', 'strong_spirit', 'rabbit_paw', 'scarier_face'];
    state.player.mutations = [];
    state.player.ultra = null;
    state.crown = 'none';

    const rec = createRecordingCtx();
    menus.render(rec.ctx, {
      screen: 'mutation_select',
      save: createDefaultSaveData(),
      simState: state,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
    });

    const topRightBlackRects = rec.fillRects.filter(
      (r) => r.style === '#000000' && r.y >= 0 && r.y < 24 && r.x >= LOGICAL_WIDTH_4_3 - 60 && r.w >= 16,
    );
    expect(topRightBlackRects.length).toBe(0);
  });

  it('HUD Level 10 sprUltraLevel + 600/1200 rad cap, Vault Proto Chest, Bug #3, Bug #6, Bug #12 & Bug #15b', () => {
    // Rad cap 600 vs Horror Meltdown 1200
    expect(resolveUltraRadCap(null)).toBe(600);
    expect(resolveUltraRadCap('horror_a')).toBe(600);
    expect(resolveUltraRadCap('horror_c')).toBe(1200);

    // Bug #15b: Portal GENERATING... scales smoothly across ticksIn = 4..24
    expect(computePortalGeneratingPercent(0)).toBe(0);
    expect(computePortalGeneratingPercent(4)).toBe(0);
    expect(computePortalGeneratingPercent(5)).toBe(5);
    expect(computePortalGeneratingPercent(14)).toBe(50);
    expect(computePortalGeneratingPercent(24)).toBe(100);
    expect(computePortalGeneratingPercent(30)).toBe(100);

    // Bug #6: Boss Intro animation normalized against INTRO_MAX_TICKS = 45
    expect(BOSS_INTRO_MAX_TICKS).toBe(45);
    const startAnim = computeBossIntroAnimState(45);
    expect(startAnim.slideIn).toBe(1);
    expect(startAnim.slideOffsetX).toBe(68);
    expect(startAnim.flash).toBeGreaterThan(0);
    expect(startAnim.splatFrame).toBe(0);

    const midSlide = computeBossIntroAnimState(41);
    expect(midSlide.slideIn).toBeCloseTo(0.5, 2);
    expect(midSlide.splatFrame).toBe(1);

    const settled = computeBossIntroAnimState(33);
    expect(settled.slideIn).toBe(0);
    expect(settled.slideOffsetX).toBe(0);
    expect(settled.flash).toBe(0);
    expect(settled.splatFrame).toBe(3);

    const fadeHalf = computeBossIntroAnimState(6);
    expect(fadeHalf.fadeOut).toBeCloseTo(0.5, 2);

    // All 9 Boss Intro Splashes render cleanly with canonical subtitles
    const allBosses: BossId[] = [
      'big_bandit',
      'big_dog',
      'lil_hunter',
      'nuclear_throne',
      'throne_ii',
      'mom',
      'hyper_crystal',
      'technomancer',
      'captain',
    ];
    expect(BOSS_INTRO_SUBTITLES.mom).toBe('MATRIARCH OF THE SEWERS');
    expect(BOSS_INTRO_SUBTITLES.hyper_crystal).toBe('PRISM OF THE CAVES');
    expect(BOSS_INTRO_SUBTITLES.technomancer).toBe('MACHINE GOD');
    expect(BOSS_INTRO_SUBTITLES.captain).toBe('I.D.P.D. COMMANDER');

    const bundle = createFallbackBundle();
    const hud = new HudRenderer(bundle, DEFAULT_UI_DATA_PROVIDER);
    const cam = new CameraController();

    for (const bossId of allBosses) {
      const st = createRunState({ mutant: 'fish', seed: 5 });
      st.boss = {
        bossId,
        entityId: 99,
        name: resolveBossDisplayName(bossId, bossId.replace(/_/g, ' '), false),
        subtitle: resolveBossSubtitle(bossId),
        hp: 400,
        maxHp: 400,
        introTicks: 42,
        defeated: false,
      } as BossState;
      const rec = createRecordingCtx();
      hud.render(rec.ctx, {
        state: st,
        camera: cam,
        renderSettings: DEFAULT_RENDER,
        fps: 120,
        width: LOGICAL_WIDTH_4_3,
        height: LOGICAL_HEIGHT,
      });
      expect(rec.fillRects.length).toBeGreaterThan(0);
    }

    // Level 10 HUD rad cap (900/1200) + Vault Proto Chest indicator
    const hudFontSpy = vi.spyOn(
      (hud as unknown as { fonts: BitmapFontRenderer }).fonts,
      'draw',
    );
    const lvl10State = createRunState({ mutant: 'horror', seed: 13 });
    lvl10State.areaCode = 'vault';
    lvl10State.player.level = 10;
    lvl10State.player.ultra = 'horror_c';
    lvl10State.player.rads = 900;
    const vaultRec = createRecordingCtx();
    hud.render(vaultRec.ctx, {
      state: lvl10State,
      camera: cam,
      renderSettings: DEFAULT_RENDER,
      fps: 120,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      protoChestWeaponId: 'heavy_crossbow',
    });
    const vaultTexts = hudFontSpy.mock.calls.map((c) => String(c[1]));
    expect(vaultTexts.some((t) => t.includes('900/1200'))).toBe(true);
    expect(vaultTexts.some((t) => t.includes('PROTO CHEST:'))).toBe(true);

    // Portal Generating screen: Bug #12 top-left y=40 backing & Bug #15b smooth % scaling
    hudFontSpy.mockClear();
    lvl10State.portal.active = true;
    lvl10State.portal.entered = true;
    lvl10State.portal.enterTicks = 12;
    lvl10State.portalTransitionTicks = 18;
    const portalRec = createRecordingCtx();
    hud.render(portalRec.ctx, {
      state: lvl10State,
      camera: cam,
      renderSettings: DEFAULT_RENDER,
      fps: 120,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      protoChestWeaponId: 'heavy_crossbow',
    });
    expect(
      portalRec.fillRects.some((r) => r.style === '#000000' && r.x === 0 && r.y === 28 && r.h >= 12),
    ).toBe(true);
    expect(hudFontSpy.mock.calls.some((c) => String(c[1]) === 'GENERATING... 070%')).toBe(true);

    // Bug #3: Empty/unequipped ammo icons in Steam mode draw #262430 1px silhouette outline + #3a3848 underlay
    const fakeTex = { width: 512, height: 512 } as unknown as HTMLCanvasElement;
    const steamLikeBundle = {
      ...bundle,
      sourceMode: 'steam' as const,
      getTexture: () => fakeTex,
    };
    const steamHud = new HudRenderer(steamLikeBundle, DEFAULT_UI_DATA_PROVIDER);
    const spriteRenderer = (
      steamHud as unknown as {
        sprites: {
          draw: (...args: unknown[]) => boolean;
          drawInBox: (...args: unknown[]) => boolean;
        };
      }
    ).sprites;
    const spriteDrawSpy = vi.spyOn(spriteRenderer, 'draw');
    const spriteDrawInBoxSpy = vi.spyOn(spriteRenderer, 'drawInBox');
    const ammoState = createRunState({ mutant: 'fish', seed: 21 });
    ammoState.player.ammo.shell = 0;
    ammoState.player.ammo.bolt = 0;
    const ammoRec = createRecordingCtx();
    steamHud.render(ammoRec.ctx, {
      state: ammoState,
      camera: cam,
      renderSettings: DEFAULT_RENDER,
      fps: 120,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
    });
    const allTintColors: string[] = [
      ...spriteDrawSpy.mock.calls.map(
        (call) => ((call[4] as { tintColor?: string } | undefined)?.tintColor ?? ''),
      ),
      ...spriteDrawInBoxSpy.mock.calls.map(
        (call) => ((call[7] as { tintColor?: string } | undefined)?.tintColor ?? ''),
      ),
    ];
    expect(allTintColors.filter((c) => c === '#262430').length).toBeGreaterThanOrEqual(4);
    expect(allTintColors.filter((c) => c === '#3a3848').length).toBeGreaterThanOrEqual(1);
  });

  it('Bug #12, Bug #14, Bug #22a, resolveRunProgressIndex & Victory END2 (I.D.P.D. Captain)', () => {
    // New area progress mappings
    expect(resolveRunProgressIndex('$$$')).toBe(10);
    expect(resolveRunProgressIndex('hq-2')).toBe(14);
    expect(resolveRunProgressIndex('hq-3')).toBe(14);

    // Bug #14: Pause layout keeps tooltip ink splat (including -22px left spikes) strictly right of portrait zone
    for (const width of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
      const pLayout = computePauseLayout(width);
      expect(pLayout.portTopY).toBeGreaterThanOrEqual(42);
      expect(pLayout.tipX - 22).toBeGreaterThan(pLayout.portZoneW);
      expect(pLayout.leftSplatX - 22).toBeGreaterThan(pLayout.portZoneW);
    }

    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle, DEFAULT_UI_DATA_PROVIDER);
    const fontSpy = vi.spyOn(
      (menus as unknown as { fonts: BitmapFontRenderer }).fonts,
      'draw',
    );

    // Bug #12: Pause top-left ink backing extends down to y = 40
    const pauseRec = createRecordingCtx();
    const pauseState = createRunState({ mutant: 'fish', seed: 3 });
    menus.render(pauseRec.ctx, {
      screen: 'paused',
      save: createDefaultSaveData(),
      simState: pauseState,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 2,
      returnScreenFromOptions: 'playing',
    });
    expect(
      pauseRec.fillRects.some((r) => r.style === '#000000' && r.x === 0 && r.y === 29 && r.h >= 11),
    ).toBe(true);

    // Ending 2 Victory screen (Captain defeated) renders END2 & Captain headline
    fontSpy.mockClear();
    const capState = createRunState({ mutant: 'rogue', seed: 4 });
    capState.areaCode = 'hq-3';
    capState.endingType = 'captain';
    capState.phase = 'victory_throne';
    const vicRec = createRecordingCtx();
    menus.render(vicRec.ctx, {
      screen: 'victory',
      save: createDefaultSaveData(),
      simState: capState,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 3,
      returnScreenFromOptions: 'title',
    });
    const drawnTexts = fontSpy.mock.calls.map((c) => String(c[1]));
    expect(drawnTexts).toContain('YOU DEFEATED THE I.D.P.D. CAPTAIN');
    expect(drawnTexts).toContain('END2');
    expect(drawnTexts.some((t) => t.includes('ENDING 2'))).toBe(true);

    // Bug #22a: Game Over shifts killer sprite box to badgeY + 17 (103) and lower timer badge to badgeY + 44 (130)
    fontSpy.mockClear();
    const deadState = createRunState({ mutant: 'fish', seed: 5 });
    deadState.player.alive = false;
    deadState.player.lastDamageCause = 'THE THRONE';
    deadState.player.lastKillerSprite = 'sprThroneIdle';
    const goRec = createRecordingCtx();
    menus.render(goRec.ctx, {
      screen: 'game_over',
      save: createDefaultSaveData(),
      simState: deadState,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 4,
      returnScreenFromOptions: 'title',
    });
    // Timer badge text sits at timeBadgeY + 3 = (86 + 44) + 3 = 133 (was 131 before Bug #22a fix)
    const timerCall = fontSpy.mock.calls.find((c) => String(c[1]) === '00:00.00');
    expect(timerCall).toBeDefined();
    expect(Number(timerCall![3])).toBe(133);
  });

  it('evaluateRunUnlocks handles all 12 B-skins, Skeleton, Frog, Hard Mode, Crowns & Proto Chest sync', () => {
    const saveMgr = new SaveManager();
    saveMgr.resetAll();

    // 1. Skeleton transform + Proto Chest sync + Frog unlock
    const s1 = createRunState({ mutant: 'melting', seed: 1 });
    s1.player.skeletonTransformed = true;
    (s1 as SimState & { protoChestWeaponId?: string | null }).protoChestWeaponId =
      'golden_frog_pistol';
    const u1 = evaluateRunUnlocks(s1, saveMgr);
    expect(saveMgr.isMutantUnlocked('skeleton')).toBe(true);
    expect(saveMgr.isMutantUnlocked('frog')).toBe(true);
    expect(saveMgr.getProtoChestWeapon()).toBe('golden_frog_pistol');
    expect(u1).toContain('SKELETON UNLOCKED!');
    expect(u1).toContain('FROG UNLOCKED!');

    // 2. Hard Mode (Loop 2) + Crown unlock
    const s2 = createRunState({ mutant: 'fish', crown: 'blood', seed: 2 });
    s2.loop = 2;
    evaluateRunUnlocks(s2, saveMgr);
    expect(saveMgr.isHardModeUnlocked()).toBe(true);
    expect(saveMgr.isCrownUnlocked('fish', 'blood')).toBe(true);

    // 3. Individual B-skin unlock checks
    const triggerBSkin = (
      mutant: MutantId,
      setup: (st: SimState) => void,
      opts: { victory?: boolean; ateHyperWeapon?: boolean } = {},
    ) => {
      const st = createRunState({ mutant, seed: 3 });
      setup(st);
      evaluateRunUnlocks(st, saveMgr, opts);
      expect(saveMgr.isBSkinUnlocked(mutant), `${mutant} B-skin should unlock`).toBe(true);
    };

    triggerBSkin('crystal', (st) => {
      st.areaCode = '4-?';
    });
    triggerBSkin('eyes', (st) => {
      st.areaCode = '2-?';
    });
    triggerBSkin('melting', (st) => {
      st.areaCode = '7-3';
      st.player.mutations = ['trigger_fingers'];
    });
    triggerBSkin('plant', (st) => {
      st.areaCode = '7-3';
      st.stats.timeTicks = 12000;
    });
    triggerBSkin('steroids', (st) => {
      st.stats.bossesDefeated.push('technomancer');
    });
    triggerBSkin('robot', () => {}, { ateHyperWeapon: true });
    triggerBSkin('chicken', (st) => {
      st.hardMode = true;
      st.areaCode = '2-1';
    });
    triggerBSkin('rebel', (st) => {
      st.stats.bossesDefeated.push('mom');
    });
    triggerBSkin('horror', (st) => {
      st.stats.bossesDefeated.push('hyper_crystal');
    });
    triggerBSkin(
      'rogue',
      (st) => {
        st.endingType = 'captain';
      },
      { victory: true },
    );

    // Fish B (all 12 core looped) & Y.V. B (all 12 core golden)
    const saveData = saveMgr.getData();
    const core12: MutantId[] = [
      'fish',
      'crystal',
      'eyes',
      'melting',
      'plant',
      'yv',
      'steroids',
      'robot',
      'chicken',
      'rebel',
      'horror',
      'rogue',
    ];
    for (const m of core12) {
      saveData.mutants[m].bestLoop = 1;
      saveData.mutants[m].goldenWeapon = 'golden_wrench';
    }
    evaluateRunUnlocks(createRunState({ mutant: 'fish', seed: 9 }), saveMgr);
    expect(saveMgr.isBSkinUnlocked('fish')).toBe(true);
    expect(saveMgr.isBSkinUnlocked('yv')).toBe(true);
  });

  it('Bug #19: GameApp skips HEAD /nt-assets/manifest.json startup probe when ?assets=builtin is set', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    (globalThis as { window?: unknown }).window = {
      location: { search: '?assets=builtin' },
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const { canvas } = makeFakeCanvas();
    const app = new GameApp(canvas);
    const internal = app as unknown as {
      hasServerSteam: boolean;
      simState: SimState | null;
      saveManager: SaveManager;
      handleMenuAction: (action: unknown) => void;
    };

    await app.init();
    expect(internal.hasServerSteam).toBe(false);
    const manifestHeadCalls = fetchSpy.mock.calls.filter(
      (call) => String(call[0]).includes('/nt-assets/manifest.json'),
    );
    expect(manifestHeadCalls.length).toBe(0);

    // Also verify GameApp handles set_unlock_all & toggle_hard_mode -> start_run with hardMode=true
    internal.handleMenuAction({ type: 'set_unlock_all', enabled: true });
    expect(internal.saveManager.isUnlockAll()).toBe(true);
    internal.handleMenuAction({ type: 'toggle_hard_mode', enabled: true });
    expect(internal.saveManager.isHardModeActive()).toBe(true);
    internal.handleMenuAction({
      type: 'start_run',
      mutant: 'frog',
      skin: 'a',
      crown: 'blood',
      useGoldenWeapon: false,
      hardMode: true,
    });
    expect(internal.simState?.player.mutant).toBe('frog');
    expect(internal.simState?.hardMode).toBe(true);

    app.destroy();
  });
});
