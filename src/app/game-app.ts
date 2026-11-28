import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  SIM_DT,
  SIM_HZ,
  type AreaCode,
  type BossId,
  type CrownId,
  type DebugBridge,
  type GamepadFamily,
  type GameScreen,
  type InputDeviceMode,
  type InputFrame,
  type KeyBindings,
  type MutantId,
  type MutationId,
  type PlaytestTelemetry,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type TargetFps,
} from '@/contracts';
import {
  clearCachedLocalAssets,
  createFallbackBundle,
  getAssetModePreference,
  hasCachedLocalAssets,
  loadAssets,
  loadCachedLocalBundle,
  loadLocalAssetsFromFiles,
  saveCachedLocalAssets,
  setAssetModePreference,
  type AssetBundle,
} from '@/assets';
import { AudioEngine } from '@/audio';
import {
  InputManager,
  clientToLogicalCanvas,
  getGamepadGlyphs,
  type GamepadDisconnectInfo,
  type RumblePreset,
} from '@/input';
import { GameRenderer } from '@/render';
import { stepSimulation, warpToArea } from '@/sim/ai';
import { createRunState, populateAreaEntities, spawnBossEntity } from '@/sim/entities';
import { applyDamageToEnemy } from '@/sim/combat';
import { SeededRng, drainEvents, hashSimState } from '@/sim/core';
import {
  addRads,
  applyMutationSelection,
  givePlayerWeapon,
  grantMutationById,
} from '@/sim/progression';
import {
  HudRenderer,
  MenuSystem,
  SaveManager,
  type HudRenderContext,
  type MenuAction,
  type MenuRenderContext,
} from '@/ui';
import { createGameDataProvider } from './data-adapter';
import { DevPlaytestOverlay } from './debug-overlay';

declare global {
  interface Window {
    __NT_DEBUG__?: DebugBridge;
  }
}

const CORE_PRELOAD_SFX = [
  // Menu, Campfire & UI SFX (warmed on boot so first hover/select/confirm NEVER falls back to synth)
  'sndClick',
  'sndClickBack',
  'sndHover',
  'sndMutHover',
  'sndMenuASkin',
  'sndMenuBSkin',
  'sndMenuCrown',
  'sndMenuGoldwep',
  // All 12 Campfire mutant select & confirm voices
  'sndMutant1Slct', 'sndMutant2Slct', 'sndMutant3Slct', 'sndMutant4Slct',
  'sndMutant5Slct', 'sndMutant6Slct', 'sndMutant7Slct', 'sndMutant8Slct',
  'sndMutant9Slct', 'sndMutant10Slct', 'sndMutant11Slct', 'sndMutant12Slct',
  'sndMutant1Cnfm', 'sndMutant2Cnfm', 'sndMutant3Cnfm', 'sndMutant4Cnfm',
  'sndMutant5Cnfm', 'sndMutant6Cnfm', 'sndMutant7Cnfm', 'sndMutant8Cnfm',
  'sndMutant9Cnfm', 'sndMutant10Cnfm', 'sndMutant11Cnfm', 'sndMutant12Cnfm',
  // Common chests & pickups
  'sndWeaponChest',
  'sndAmmoChest',
  'sndBigWeaponChest',
  'sndCursedChest',
  'sndRadChest',
  'sndHealthChest',
  'sndChestOpen',
  'sndPickupDisappear',
  'sndRadPickup',
  'sndAmmoPickup',
  'sndHPPickup',
  'sndHPPickupBig',
  'sndWeaponPickup',
  'sndCursedPickup',
  // Common weapon swaps & reload completion clicks
  'sndSwapPistol',
  'sndSwapShotgun',
  'sndSwapMachinegun',
  'sndSwapSword',
  'sndSwapBow',
  'sndSwapExplosive',
  'sndSwapEnergy',
  'sndSwapFlame',
  'sndSwapHammer',
  'sndSwapGold',
  'sndSwapMotorized',
  'sndSwapCursed',
  'sndShotReload',
  'sndCrossReload',
  'sndNadeReload',
  'sndPlasmaReload',
  'sndLightningReload',
  // Core combat, portal, boss, mutation & loop SFX
  'sndPistol',
  'sndShotgun',
  'sndMachinegun',
  'sndCrossbow',
  'sndLaser',
  'sndExplosion',
  'sndHitFlesh',
  'sndHitWall',
  'sndEmpty',
  'sndMeleeFlip',
  'sndPortalOpen',
  'sndPortalClose',
  'sndPortalLoop',
  'sndBossIntroIn',
  'sndMutAppear',
  'sndLevelUp',
  'sndLevelUltra',
  'sndMutant1Hurt',
  'sndBanditHit',
  'sndBanditDie',
  'sndRogueAim',
  'sndPortalStrikeLoop',
  'sndChickenHeadlessLoop',
];

const DEFAULT_IDLE_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  aimWorldX: 0,
  aimWorldY: 0,
  fireHeld: false,
  firePressed: false,
  activeHeld: false,
  activePressed: false,
  swapPressed: false,
  pickupPressed: false,
  pausePressed: false,
};

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dataProvider = createGameDataProvider();
  private readonly saveManager = new SaveManager();

  private bundle!: AssetBundle;
  private audio!: AudioEngine;
  private input!: InputManager;
  private renderer!: GameRenderer;
  private hud!: HudRenderer;
  private menus!: MenuSystem;
  private devOverlay: DevPlaytestOverlay | null = null;

  private simState: SimState | null = null;
  private screen: GameScreen = 'title';
  private returnScreenFromOptions: GameScreen = 'title';
  private rebindingField: keyof KeyBindings | null = null;
  private runEndRecorded = false;
  private lastRunSeed = 1337;

  // Timing & telemetry
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private simAccumulator = 0;
  private renderAccumulator = 0;
  private presentationDt = 0;
  private hasRenderedFirstFrame = false;
  private timeSec = 0;
  private fpsFrameCount = 0;
  private fpsWindowStartMs = 0;
  private measuredFps = 120;
  private simStepCount = 0;
  private simWindowStartMs = 0;
  private measuredSimHz = SIM_HZ;
  private consoleErrors: string[] = [];

  // Last routed music context signature to avoid redundant routeContext churn
  private lastMusicSignature = '';
  private lastPlayerHp = 0;
  private lastLowHpWarnSec = -10;
  private lastBossMusicState = '';

  // Custom Pack / Built-In Krunked Art Pack switcher state
  private hasCachedLocal = false;
  private hasServerSteam = false;
  private assetLoading = false;
  private assetStatusText = '';
  private assetStatusUntilSec = 0;
  private lastPickerOpenMs = 0;
  private fileInputEl: HTMLInputElement | null = null;

  // Non-blocking pixel controller toast banner (connect / disconnect / rumble test)
  private controllerToastText = '';
  private controllerToastUntilSec = 0;
  private controllerToastAccent = '#52e864';

  // Audio unlock resilience across mouse, touch, keyboard, and gamepad
  private audioUnlockDone = false;
  private audioUnlockInFlight = false;

  // Bound event listeners
  private boundResize = () => this.handleResize();
  private boundVisibilityChange = () => this.handleVisibilityChange();
  private boundUnlock = () => this.tryUnlockAudio();
  private boundCanvasClick = (e: MouseEvent) => this.handleCanvasSyncClick(e);
  private boundWindowError = (e: ErrorEvent) => {
    this.consoleErrors.push(e.message || String(e.error ?? 'Unknown error'));
  };
  private boundRejection = (e: PromiseRejectionEvent) => {
    this.consoleErrors.push(`UnhandledRejection: ${String(e.reason)}`);
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  async init(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.boundWindowError);
      window.addEventListener('unhandledrejection', this.boundRejection);
    }

    // Determine preferred asset mode (supports ?assets=builtin / ?fallback=1 query params for instant testing)
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const forceBuiltinQuery =
      search.includes('assets=builtin') || search.includes('fallback=1');
    const modePreference = forceBuiltinQuery ? 'builtin' : getAssetModePreference();

    this.hasCachedLocal = await hasCachedLocalAssets();
    this.bundle = await loadAssets('/nt-assets', { modePreference });
    if (this.bundle.origin === 'steam-server') {
      this.hasServerSteam = true;
    } else {
      // Quietly probe `/nt-assets/manifest.json` even under `'builtin'` modePreference
      // so Title Screen keeps `USE CUSTOM PACK` clickable across page reloads whenever `.nt-assets/` exists!
      this.hasServerSteam = await this.probeServerSteamManifest('/nt-assets');
    }

    const save = this.saveManager.getData();

    this.audio = new AudioEngine({
      baseUrl: this.bundle.baseUrl || '/nt-assets',
      manifest: this.bundle.manifest,
      settings: save.audio,
      resolveAudioUrl: (relPath) => this.bundle.getAudioUrl(relPath),
    });
    // Pre-decode core Campfire voices, menu/chest/swap/reload SFX right on boot in Steam mode
    this.preloadCoreSteamAudio();

    this.input = new InputManager(save.keybinds, {
      controls: save.controls,
      onUserInteraction: () => this.tryUnlockAudio(),
      onGamepadConnect: (info) => this.handleGamepadConnected(info),
      onGamepadDisconnect: (info) => this.handleGamepadDisconnected(info),
    });
    this.renderer = new GameRenderer(this.bundle, this.dataProvider);
    this.hud = new HudRenderer(this.bundle, this.dataProvider);
    this.menus = new MenuSystem(this.bundle, this.dataProvider);

    this.applyResponsiveCanvasSize(save.render);
    const sz = this.renderer.getLogicalSize();
    this.input.setLogicalSize(sz.width, sz.height);
    this.input.attach(this.canvas);
    this.canvas.addEventListener('click', this.boundCanvasClick);
    this.canvas.tabIndex = 0;
    this.canvas.focus({ preventScroll: true });
    this.mountLocalFolderInput();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('orientationchange', this.boundResize);
      window.visualViewport?.addEventListener('resize', this.boundResize);
      if (typeof document !== 'undefined') {
        document.addEventListener('fullscreenchange', this.boundResize);
        document.addEventListener('visibilitychange', this.boundVisibilityChange);
      }
      window.addEventListener('pointerdown', this.boundUnlock);
      window.addEventListener('touchstart', this.boundUnlock, { passive: true });
      window.addEventListener('touchend', this.boundUnlock, { passive: true });
      window.addEventListener('mousedown', this.boundUnlock);
      window.addEventListener('keydown', this.boundUnlock);
      window.addEventListener('gamepadconnected', this.boundUnlock);
      const bridge = this.createDebugBridge();
      window.__NT_DEBUG__ = bridge;
      const isDevOrDebug =
        Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ||
        window.location.search.includes('debug=1');
      if (isDevOrDebug) {
        this.devOverlay = new DevPlaytestOverlay(bridge);
        this.devOverlay.mount();
      }
    }

    this.syncMusicRouting();
    this.startLoop();
  }

  destroy(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.input?.detach();
    this.canvas.removeEventListener('click', this.boundCanvasClick);
    this.fileInputEl?.remove();
    this.fileInputEl = null;
    this.bundle?.dispose?.();
    this.devOverlay?.destroy();
    this.audio?.dispose();
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.boundResize);
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('orientationchange', this.boundResize);
      window.visualViewport?.removeEventListener('resize', this.boundResize);
      this.removeAudioUnlockListeners();
      window.removeEventListener('error', this.boundWindowError);
      window.removeEventListener('unhandledrejection', this.boundRejection);
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      this.input?.resetHeldState();
      if (this.screen === 'playing') {
        this.screen = 'paused';
        this.input?.setGameplayActive(false);
        this.audio?.setPaused(true);
        this.simAccumulator = 0;
        this.presentationDt = 0;
        this.syncMusicRouting();
      }
      this.audio?.setBackgroundSuspended(true);
    } else {
      this.audio?.setBackgroundSuspended(false);
      this.lastFrameMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
  }

  private removeAudioUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.boundUnlock);
    window.removeEventListener('touchstart', this.boundUnlock);
    window.removeEventListener('touchend', this.boundUnlock);
    window.removeEventListener('mousedown', this.boundUnlock);
    window.removeEventListener('keydown', this.boundUnlock);
    window.removeEventListener('gamepadconnected', this.boundUnlock);
  }

  private applyResponsiveCanvasSize(renderSettings: RenderSettings): void {
    this.renderer.applyCanvasSize(this.canvas, renderSettings);
    if (typeof window === 'undefined') return;
    const { width: targetW, height: targetH } = this.renderer.getLogicalSize();
    const vv = window.visualViewport;
    let availW = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth));
    let availH = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight));

    // Respect parent container's inner content box (e.g. mobile safe-area padding)
    // so CSS max-width/max-height never squishes one axis and distorts aspect/aim!
    const parent = this.canvas.parentElement;
    if (parent && typeof window.getComputedStyle === 'function') {
      const cs = window.getComputedStyle(parent);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const innerW = Math.floor(parent.clientWidth - padX);
      const innerH = Math.floor(parent.clientHeight - padY);
      if (innerW > 0) availW = Math.min(availW, innerW);
      if (innerH > 0) availH = Math.min(availH, innerH);
    }

    const curW = parseFloat(this.canvas.style.width) || targetW;
    const curH = parseFloat(this.canvas.style.height) || targetH;
    if (curW > availW || curH > availH) {
      const scale = Math.min(availW / targetW, availH / targetH);
      this.canvas.style.width = `${Math.max(1, Math.floor(targetW * scale))}px`;
      this.canvas.style.height = `${Math.max(1, Math.floor(targetH * scale))}px`;
    }
  }

  private handleResize(): void {
    const save = this.saveManager.getData();
    this.applyResponsiveCanvasSize(save.render);
    const sz = this.renderer.getLogicalSize();
    this.input.setLogicalSize(sz.width, sz.height);
  }

  private async probeServerSteamManifest(baseUrl = '/nt-assets'): Promise<boolean> {
    if (typeof fetch !== 'function') return false;
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBase}/manifest.json`;
    try {
      const headRes = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      if (headRes.status === 405) {
        const getRes = await fetch(url, { method: 'GET', cache: 'no-cache' });
        if (getRes.status === 204 || !getRes.ok) return false;
        const ct = getRes.headers?.get?.('content-type')?.toLowerCase() ?? '';
        if (ct && ct.includes('text/html')) return false;
        const text = await getRes.text();
        if (!text || !text.trim()) return false;
        const parsed = JSON.parse(text) as { available?: boolean; sprites?: unknown };
        return Boolean(parsed && typeof parsed === 'object' && parsed.available !== false && parsed.sprites);
      }
      if (headRes.status === 204 || !headRes.ok) return false;
      const ct = headRes.headers?.get?.('content-type')?.toLowerCase() ?? '';
      if (ct && ct.includes('text/html')) return false;
      return true;
    } catch {
      return false;
    }
  }

  private preloadCoreSteamAudio(): void {
    if (!this.audio || this.bundle?.sourceMode !== 'steam') return;
    const validCore = CORE_PRELOAD_SFX.filter((k) => this.audio.hasManifestSound(k));
    if (validCore.length > 0) {
      void this.audio.preloadSounds(validCore);
    }
  }

  private tryUnlockAudio(): void {
    if (this.audioUnlockDone || this.audioUnlockInFlight || !this.audio) return;
    if (this.audio.getStats().unlocked) {
      this.audioUnlockDone = true;
      this.removeAudioUnlockListeners();
      return;
    }

    this.audioUnlockInFlight = true;
    void this.audio
      .unlock()
      .then((unlocked) => {
        if (unlocked) {
          this.audioUnlockDone = true;
          this.removeAudioUnlockListeners();
          if (this.bundle.sourceMode === 'steam') {
            this.preloadCoreSteamAudio();
            this.lastMusicSignature = '';
            this.syncMusicRouting();
          }
        }
      })
      .catch(() => {
        // Retry gracefully on next pointer, touch, key, or gamepad interaction
      })
      .finally(() => {
        this.audioUnlockInFlight = false;
      });
  }

  private startLoop(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastFrameMs = now;
    this.fpsWindowStartMs = now;
    this.simWindowStartMs = now;
    this.renderAccumulator = 0;
    this.presentationDt = 0;
    this.hasRenderedFirstFrame = false;
    const initRender = this.saveManager.getData().render;
    this.measuredFps = initRender.targetFps ?? (initRender.classic30Fps ? 30 : 120);

    const frame = (ts: number): void => {
      const rawDt = Math.max(0, (ts - this.lastFrameMs) / 1000);
      this.lastFrameMs = ts;
      const dt = Math.min(rawDt, 0.1);
      this.timeSec += dt;

      this.tickAndRender(dt, ts);

      if (typeof requestAnimationFrame === 'function') {
        this.rafId = requestAnimationFrame(frame);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(frame);
    }
  }

  private recordRenderedFrame(nowMs: number): void {
    this.fpsFrameCount += 1;
    const fpsElapsed = nowMs - this.fpsWindowStartMs;
    if (fpsElapsed >= 500) {
      this.measuredFps = Math.round((this.fpsFrameCount * 1000) / fpsElapsed);
      this.fpsFrameCount = 0;
      this.fpsWindowStartMs = nowMs;
    }
  }

  private consumeRenderSlot(dt: number, targetFps: TargetFps, force: boolean = false): boolean {
    const renderPeriod = 1 / targetFps;
    const tolerance = Math.min(0.002, renderPeriod * 0.12);
    this.renderAccumulator += dt;

    if (force || !this.hasRenderedFirstFrame || this.renderAccumulator + tolerance >= renderPeriod) {
      if (force || !this.hasRenderedFirstFrame || dt + tolerance >= renderPeriod) {
        this.renderAccumulator = 0;
      } else {
        this.renderAccumulator = Math.max(0, Math.min(renderPeriod, this.renderAccumulator - renderPeriod));
      }
      this.hasRenderedFirstFrame = true;
      return true;
    }
    return false;
  }

  private tickAndRender(dt: number, nowMs: number): void {
    const save = this.saveManager.getData();
    const targetFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
    const { width, height } = this.renderer.getLogicalSize();
    this.presentationDt += dt;
    let screenTransitioned = false;

    this.input.setGameplayActive(this.screen === 'playing');
    // Hide OS pointer during active combat for both KBM & Gamepad (game renders crisp sprCrosshair)
    this.canvas.classList.toggle(
      'hide-cursor',
      this.screen === 'playing' && this.input.getInputMode() !== 'touch',
    );

    if (this.screen === 'playing' && this.simState) {
      this.simAccumulator += dt;

      // Capture high-Hz (60/120 FPS) gamepad button taps even on frames without a 30 Hz sim step
      if (this.simAccumulator < SIM_DT) {
        this.input.pollGamepad();
        if (this.screen !== 'playing') {
          screenTransitioned = true;
        }
      }

      let stepsThisFrame = 0;
      const maxCatchupSteps = 4;

      while (this.screen === 'playing' && this.simAccumulator >= SIM_DT && stepsThisFrame < maxCatchupSteps) {
        let inputFrame: InputFrame;
        if (this.simState.hitstopTicks > 0) {
          // During hitstop freeze, preserve buffered fire/active/swap/pickup presses while honoring immediate pause
          if (this.input.consumePauseOnly()) {
            this.screen = 'paused';
            screenTransitioned = true;
            this.input.setGameplayActive(false);
            this.audio.setPaused(true);
            this.simAccumulator = 0;
            this.input.clearMenuLatches();
            this.syncMusicRouting();
            break;
          }
          if (this.screen !== 'playing') {
            screenTransitioned = true;
            break;
          }
          inputFrame = { ...DEFAULT_IDLE_INPUT };
        } else {
          inputFrame = this.input.consumeSimInput(
            this.renderer.getCamera(),
            this.simState.player.x,
            this.simState.player.y,
            { enemies: this.simState.enemies, map: this.simState.map },
          );

          if (this.screen !== 'playing') {
            screenTransitioned = true;
            break;
          }

          if (inputFrame.pausePressed) {
            this.screen = 'paused';
            screenTransitioned = true;
            this.input.setGameplayActive(false);
            this.audio.setPaused(true);
            this.simAccumulator = 0;
            this.input.clearMenuLatches();
            this.syncMusicRouting();
            break;
          }
        }

        this.runSingleSimTick(inputFrame);
        this.simAccumulator -= SIM_DT;
        stepsThisFrame += 1;
        this.simStepCount += 1;

        if (this.screen !== 'playing') {
          screenTransitioned = true;
          this.input.setGameplayActive(false);
          this.input.clearMenuLatches();
          this.simAccumulator = 0;
          break;
        }
      }

      // Clamp excess accumulator after max catch-up to prevent spiral-of-death lag spikes
      if (stepsThisFrame >= maxCatchupSteps && this.simAccumulator > SIM_DT) {
        this.simAccumulator = SIM_DT;
      }

      // Measure actual simHz over 500 ms windows while actively playing
      const simElapsed = nowMs - this.simWindowStartMs;
      if (simElapsed >= 500) {
        this.measuredSimHz = Math.round((this.simStepCount * 1000) / simElapsed);
        this.simStepCount = 0;
        this.simWindowStartMs = nowMs;
      }

      if (this.screen === 'playing' && this.simState) {
        if (!this.consumeRenderSlot(dt, targetFps, false)) {
          return;
        }
        const renderDt = this.presentationDt;
        this.presentationDt = 0;
        const interpAlpha =
          targetFps === 30 ? 1 : Math.max(0, Math.min(1, this.simAccumulator / SIM_DT));

        this.input.updatePresentation(renderDt);
        const p = this.simState.player;
        const interpPlayerX = p.prevX + (p.x - p.prevX) * interpAlpha;
        const interpPlayerY = p.prevY + (p.y - p.prevY) * interpAlpha;
        const aimWorld = this.input.updatePresentationAim(
          this.renderer.getCamera(),
          interpPlayerX,
          interpPlayerY,
          { enemies: this.simState.enemies, map: this.simState.map },
        );
        const pointer = this.input.getPointerLogical();
        this.renderer.updatePresentation(
          this.simState,
          aimWorld.x,
          aimWorld.y,
          renderDt,
          save.render,
          interpAlpha,
        );

        this.renderPlayingFrame(this.simState, save.render, interpAlpha, pointer, width, height);
        this.recordRenderedFrame(nowMs);
        return;
      }
    } else {
      // Keep simHz window fresh when not playing
      this.simStepCount = 0;
      this.simWindowStartMs = nowMs;
    }

    const activeStatusText =
      this.assetStatusText && (this.assetLoading || this.timeSec < this.assetStatusUntilSec)
        ? this.assetStatusText
        : undefined;

    const gpInfo = this.input.getGamepadInfo();
    const menuCtx: MenuRenderContext = {
      screen: this.screen,
      save: this.saveManager.getData(),
      simState: this.simState,
      width,
      height,
      timeSec: this.timeSec,
      returnScreenFromOptions: this.returnScreenFromOptions,
      rebindingField: this.rebindingField,
      hasCachedLocal: this.hasCachedLocal,
      hasServerSteam: this.hasServerSteam,
      assetStatusText: activeStatusText,
      assetLoading: this.assetLoading,
      inputMode: this.input.getInputMode(),
      gamepadConnected: gpInfo.connected,
      gamepadName: gpInfo.padName,
      gamepadProfile: gpInfo.profile,
      gamepadFamily: gpInfo.family,
      gamepadDebug: this.input.getGamepadDebugState(),
    };

    // Ensure hit regions are populated for this screen before sampling menu input
    if (this.menus.getHitRegions().length === 0) {
      this.applyHiBitFrameTransform(width, height);
      this.menus.render(this.ctx, menuCtx);
    }

    const menuInput = this.input.consumeMenuInput();
    const actions = this.menus.update(menuInput, menuCtx);
    for (let i = 0; i < actions.length; i++) {
      this.handleMenuAction(actions[i]!);
    }

    const latestSave = this.saveManager.getData();
    const nextTargetFps: TargetFps =
      latestSave.render.targetFps ?? (latestSave.render.classic30Fps ? 30 : 120);
    const shouldRender = this.consumeRenderSlot(
      dt,
      nextTargetFps,
      screenTransitioned || actions.length > 0,
    );
    if (!shouldRender) {
      return;
    }
    this.presentationDt = 0;

    // Render active menu or resumed gameplay screen cleanly
    const curSize = this.renderer.getLogicalSize();
    if (this.screen === 'playing' && this.simState) {
      const pointer = this.input.getPointerLogical();
      this.renderPlayingFrame(
        this.simState,
        latestSave.render,
        1,
        pointer,
        curSize.width,
        curSize.height,
      );
    } else {
      this.applyHiBitFrameTransform(curSize.width, curSize.height);
      const latestGp = this.input.getGamepadInfo();
      const curInputMode = this.input.getInputMode();
      if (this.simState && this.shouldRenderWorldBehindScreen(this.screen)) {
        this.renderWorldWithMode(
          this.simState,
          latestSave.render,
          1,
          undefined,
          curInputMode,
          latestGp.family,
        );
        if (this.shouldRenderHudBehindScreen(this.screen)) {
          this.renderHudWithMode(
            this.simState,
            latestSave.render,
            curSize.width,
            curSize.height,
            curInputMode,
            latestGp.family,
          );
        }
      } else if (this.screen === 'mutation_select' || this.screen === 'ultra_select') {
        // Solid NT void backdrop so stale portal loading cards or LEVEL UP text never bleed behind selection cards
        this.ctx.fillStyle = '#0a090e';
        this.ctx.fillRect(0, 0, curSize.width, curSize.height);
      }
      this.menus.render(this.ctx, {
        screen: this.screen,
        save: latestSave,
        simState: this.simState,
        width: curSize.width,
        height: curSize.height,
        timeSec: this.timeSec,
        returnScreenFromOptions: this.returnScreenFromOptions,
        rebindingField: this.rebindingField,
        hasCachedLocal: this.hasCachedLocal,
        hasServerSteam: this.hasServerSteam,
        assetStatusText: activeStatusText,
        assetLoading: this.assetLoading,
        inputMode: curInputMode,
        gamepadConnected: latestGp.connected,
        gamepadName: latestGp.padName,
        gamepadProfile: latestGp.profile,
        gamepadFamily: latestGp.family,
        gamepadDebug: this.input.getGamepadDebugState(),
      });
      this.renderControllerToast(curSize.width, curSize.height, false);
    }
    this.recordRenderedFrame(nowMs);
  }

  private renderWorldWithMode(
    state: SimState,
    renderSettings: RenderSettings,
    interpAlpha: number,
    pointerLogical: { x: number; y: number } | undefined,
    inputMode: InputDeviceMode,
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    this.renderer.renderWorld(
      this.ctx,
      state,
      renderSettings,
      interpAlpha,
      pointerLogical,
      inputMode,
      gamepadFamily,
    );
  }

  private renderHudWithMode(
    state: SimState,
    renderSettings: RenderSettings,
    width: number,
    height: number,
    inputMode: InputDeviceMode,
    gamepadFamily: GamepadFamily = 'generic',
  ): void {
    const hudCtx: HudRenderContext = {
      state,
      camera: this.renderer.getCamera(),
      renderSettings,
      fps: this.measuredFps,
      width,
      height,
      inputMode,
      gamepadFamily,
    };
    this.hud.render(this.ctx, hudCtx);
  }

  private hasNearbyInteractable(state: SimState): boolean {
    const p = state.player;
    if (!p.alive) return false;
    const maxDistSq = 34 * 34;
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (pk.kind !== 'weapon') continue;
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      if (dx * dx + dy * dy <= maxDistSq) return true;
    }
    for (let i = 0; i < state.props.length; i++) {
      const pr = state.props[i]!;
      const hasPrompt = Boolean(pr.interactPrompt);
      const isStandardInteractable =
        !pr.opened &&
        (pr.kind === 'weapon_chest' ||
          pr.kind === 'big_weapon_chest' ||
          pr.kind === 'ammo_chest' ||
          pr.kind === 'proto_statue');
      if (!hasPrompt && !isStandardInteractable) {
        continue;
      }
      const reach = hasPrompt ? Math.max(34, (pr.radius || 0) + 26) : 34;
      const dx = pr.x - p.x;
      const dy = pr.y - p.y;
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
    return false;
  }

  private applyHiBitFrameTransform(logicalW: number, logicalH: number): void {
    if (typeof this.ctx.setTransform === 'function') {
      const sx = logicalW > 0 ? this.canvas.width / logicalW : 1;
      const sy = logicalH > 0 ? this.canvas.height / logicalH : 1;
      this.ctx.setTransform(sx, 0, 0, sy, 0, 0);
    }
    this.ctx.imageSmoothingEnabled = false;
  }

  private renderPlayingFrame(
    state: SimState,
    renderSettings: RenderSettings,
    interpAlpha: number,
    pointer: { x: number; y: number },
    width: number,
    height: number,
  ): void {
    this.applyHiBitFrameTransform(width, height);
    const inputMode = this.input.getInputMode();
    const gpFamily = this.input.getGamepadInfo().family;
    this.renderWorldWithMode(state, renderSettings, interpAlpha, pointer, inputMode, gpFamily);
    this.renderHudWithMode(state, renderSettings, width, height, inputMode, gpFamily);
    // Strict visibility rule: renders ZERO pixels unless active touch mode is enabled
    this.input.renderTouchOverlay(
      this.ctx,
      width,
      height,
      this.hasNearbyInteractable(state),
      this.timeSec,
    );
    this.renderControllerToast(width, height, true);
  }

  private formatControllerLabel(family: GamepadFamily): string {
    const label = getGamepadGlyphs(family).familyLabel;
    return family === 'tesla' || family === 'generic' ? label : `${label} CONTROLLER`;
  }

  private showControllerToast(text: string, durationSec: number, accent = '#52e864'): void {
    this.controllerToastText = text;
    this.controllerToastUntilSec = this.timeSec + durationSec;
    this.controllerToastAccent = accent;
  }

  private handleGamepadConnected(info: {
    padIndex: number;
    padName: string | null;
    family: GamepadFamily;
  }): void {
    const label = this.formatControllerLabel(info.family);
    this.showControllerToast(`@g${label} CONNECTED`, 2.6, '#52e864');
  }

  private handleGamepadDisconnected(info: GamepadDisconnectInfo): void {
    const label = this.formatControllerLabel(info.family);
    if (this.screen === 'playing') {
      this.screen = 'paused';
      this.input.setGameplayActive(false);
      this.audio.setPaused(true);
      this.simAccumulator = 0;
      this.presentationDt = 0;
      this.input.clearMenuLatches();
      this.syncMusicRouting();
      this.showControllerToast(`@y${label} DISCONNECTED - PAUSED`, 3.6, '#ffe047');
    } else {
      this.showControllerToast(`@y${label} DISCONNECTED`, 2.5, '#ffe047');
    }
  }

  private renderControllerToast(width: number, height: number, isGameplay: boolean): void {
    if (!this.controllerToastText || this.timeSec >= this.controllerToastUntilSec) return;
    const remaining = this.controllerToastUntilSec - this.timeSec;
    const fadeAlpha = remaining < 0.35 ? Math.max(0, remaining / 0.35) : 1;
    const fonts = this.renderer.getFontRenderer();
    const measured = fonts.measure(this.controllerToastText, 'fntSmall');
    const pillW = Math.min(width - 12, measured.width + 14);
    const pillH = this.screen === 'options' ? 11 : 13;
    const px = Math.round((width - pillW) * 0.5);
    const py = this.screen === 'options' ? height - pillH - 1 : isGameplay ? 38 : 6;
    const textOffsetY = this.screen === 'options' ? 3 : 4;

    this.ctx.save();
    this.ctx.globalAlpha = fadeAlpha;
    this.ctx.fillStyle = 'rgba(10, 8, 18, 0.90)';
    this.ctx.fillRect(px, py, pillW, pillH);
    this.ctx.fillStyle = this.controllerToastAccent;
    this.ctx.fillRect(px, py, pillW, 1);
    this.ctx.fillRect(px, py + pillH - 1, pillW, 1);
    this.ctx.fillRect(px, py, 1, pillH);
    this.ctx.fillRect(px + pillW - 1, py, 1, pillH);
    this.ctx.fillRect(px + 2, py + 2, 2, pillH - 4);
    fonts.draw(this.ctx, this.controllerToastText, Math.round(width * 0.5) + 1, py + textOffsetY, 'fntSmall', {
      align: 'center',
      baseline: 'top',
      maxWidth: pillW - 10,
      shadow: true,
    });
    this.ctx.restore();
  }

  private shouldRenderHudBehindScreen(screen: GameScreen): boolean {
    // Keep Mutation/Ultra Select & Game Over crisp with zero HUD text bleed-through
    return screen === 'paused' || (screen === 'options' && this.returnScreenFromOptions === 'paused');
  }

  private shouldRenderWorldBehindScreen(screen: GameScreen): boolean {
    // Suppress world / portal loading card behind Mutation & Ultra Select so zero world text bleeds through
    if (screen === 'paused') {
      return true;
    }
    if (screen === 'game_over' || screen === 'victory') {
      return true;
    }
    if (screen === 'options' && this.returnScreenFromOptions === 'paused') {
      return true;
    }
    return false;
  }

  /**
   * Resets entity interpolation snapshots (`prevX/prevY`), camera tracking, and fixed-step
   * accumulator on area warps / portal loads / restarts so frame 0 never streaks across the map.
   */
  private resetInterpolationSnapshot(): void {
    this.simAccumulator = 0;
    this.presentationDt = 0;
    if (!this.simState) return;
    const st = this.simState;
    st.player.prevX = st.player.x;
    st.player.prevY = st.player.y;
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i]!;
      e.prevX = e.x;
      e.prevY = e.y;
    }
    for (let i = 0; i < st.projectiles.length; i++) {
      const pr = st.projectiles[i]!;
      pr.prevX = pr.x;
      pr.prevY = pr.y;
    }
    this.renderer.invalidateFloor();
    this.renderer.getCamera().snapTo(st.player.x, st.player.y);
  }

  private persistCarriedGoldenWeapon(state: SimState): void {
    const p = state.player;
    const goldenSlot = [p.weapons[0], p.weapons[1]].find((w) => {
      if (!w) return false;
      return Boolean(this.dataProvider.getWeapon(w.weaponId)?.golden);
    });
    if (!goldenSlot) return;
    const mp = this.saveManager.getData().mutants[p.mutant];
    if (mp && mp.goldenWeapon !== goldenSlot.weaponId) {
      mp.goldenWeapon = goldenSlot.weaponId;
      this.saveManager.save();
    }
  }

  private getBossMusicStatus(state: SimState | null): {
    activeBossId: BossId | null;
    bossDefeated: boolean;
  } {
    const boss = state?.boss;
    if (!boss || !state) {
      return { activeBossId: null, bossDefeated: false };
    }
    if (boss.defeated) {
      return { activeBossId: null, bossDefeated: true };
    }
    // Sleeping bosses (e.g. 3-3 Big Dog & 7-3 The Throne before wake) keep ambient/area music until awake
    const ent = state.enemies.find((e) => e.id === boss.entityId);
    if (ent && ent.aiState === 'sleep') {
      return { activeBossId: null, bossDefeated: false };
    }
    return { activeBossId: boss.bossId, bossDefeated: false };
  }

  private checkLowHpAudioCue(state: SimState): void {
    const p = state.player;
    if (!p.alive) {
      this.lastPlayerHp = 0;
      return;
    }
    const prevHp = this.lastPlayerHp;
    this.lastPlayerHp = p.hp;
    const criticalThreshold = p.maxHp <= 2 ? 1 : Math.min(2, Math.max(1, Math.floor(p.maxHp * 0.25)));
    const droppedIntoCritical = prevHp > 0 && p.hp < prevHp && p.hp <= criticalThreshold;
    if (droppedIntoCritical && this.timeSec - this.lastLowHpWarnSec >= 2.2) {
      this.lastLowHpWarnSec = this.timeSec;
      const mutantDef = this.dataProvider.getMutant(p.mutant);
      const lowHpKey = `sndMutant${mutantDef.raceIndex}LowH`;
      this.audio.playSfx(lowHpKey, p.x, p.y, {
        listenerX: p.x,
        listenerY: p.y,
        pitchJitter: 0.03,
        volume: 0.78,
      });
    }
  }

  private runSingleSimTick(inputFrame: InputFrame): void {
    if (!this.simState) return;
    stepSimulation(this.simState, inputFrame);
    // Sync phase -> screen first so flushSimEvents / syncMusicRouting never double-route stale playing music
    this.syncScreenWithSimPhase();
    this.flushSimEvents();
    this.checkLowHpAudioCue(this.simState);

    const bossStatus = this.getBossMusicStatus(this.simState);
    const bossSig = `${bossStatus.activeBossId ?? ''}:${bossStatus.bossDefeated ? 1 : 0}`;
    if (bossSig !== this.lastBossMusicState) {
      this.lastBossMusicState = bossSig;
      this.syncMusicRouting();
    }
  }

  private flushSimEvents(): void {
    if (!this.simState) return;
    const events = drainEvents(this.simState);
    if (events.length === 0) return;

    this.renderer.consumeEvents(events, this.simState);
    this.warmSteamAudioForEvents(events);

    const cam = this.renderer.getCamera();
    const listenX = Number.isFinite(cam.x) && (cam.x !== 0 || cam.y !== 0) ? cam.x : this.simState.player.x;
    const listenY = Number.isFinite(cam.y) && (cam.x !== 0 || cam.y !== 0) ? cam.y : this.simState.player.y;
    // GameApp.syncMusicRouting() is the single source of truth for music & ambience (eliminates area/boss double-fetches)
    this.audio.consumeEvents(events, listenX, listenY, { handleMusic: false });
    this.triggerRumbleForEvents(events);

    let areaChanged = false;
    let shouldSyncMusic = false;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'area_change') {
        areaChanged = true;
        shouldSyncMusic = true;
      } else if (ev.type === 'boss_intro' || ev.type === 'player_died') {
        shouldSyncMusic = true;
      }
    }

    if (areaChanged) {
      this.resetInterpolationSnapshot();
      if (this.simState.tick > 0) {
        this.persistCarriedGoldenWeapon(this.simState);
      }
      this.preloadAreaSteamAudio(this.simState);
    }

    if (shouldSyncMusic) {
      this.syncMusicRouting();
    }
  }

  private triggerRumbleForEvents(events: readonly SimEvent[]): void {
    const mode = this.input.getInputMode();
    if (mode !== 'gamepad' && mode !== 'touch') return;
    const pulse = (preset: RumblePreset): void => {
      if (mode === 'gamepad') {
        this.input.rumble(preset);
      } else {
        this.input.triggerTouchHapticForPreset(preset);
      }
    };
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as SimEvent | { type: string; killed?: boolean; speed?: number };
      if (ev.type === 'player_died') {
        pulse('death');
      } else if (ev.type === 'sfx') {
        const s = (ev as Extract<SimEvent, { type: 'sfx' }>).sound;
        if (s === 'sndExplosion') {
          pulse('explosion');
        } else if (s.startsWith('sndMutant') && s.endsWith('Hurt')) {
          pulse('hurt');
        } else if (mode === 'gamepad' && (s.endsWith('Die') || s === 'sndEnemyDie')) {
          this.input.rumble('kill');
        }
      } else if (ev.type === 'shake') {
        const sh = ev as Extract<SimEvent, { type: 'shake' }>;
        if (sh.trauma >= 0.48) {
          pulse('explosion');
        } else if ((sh.kick ?? 0) >= 3.5 || sh.trauma >= 0.24) {
          pulse('fire_heavy');
        } else if (mode === 'gamepad' && ((sh.kick ?? 0) > 0 || sh.trauma >= 0.08)) {
          this.input.rumble('fire_light');
        }
      } else if (ev.type === 'melee_deflect') {
        pulse('parry');
      } else if (mode === 'gamepad' && ev.type === 'hit_confirm' && (ev as { killed?: boolean }).killed) {
        this.input.rumble('kill');
      } else if (mode === 'gamepad' && ev.type === 'corpse_impact') {
        this.input.rumble('fire_light');
      }
    }
  }

  private warmSteamAudioForEvents(events: readonly SimEvent[]): void {
    if (this.bundle.sourceMode !== 'steam') return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'sfx' && this.audio.hasManifestSound(ev.sound)) {
        void this.audio.loadSound(ev.sound);
      }
    }
  }

  /**
   * Proactively preloads active mutant, equipped weapon, and current area enemy SFX
   * in Steam mode so first-shot/first-kill audio plays decoded WAVs instead of cold synth.
   */
  private preloadAreaSteamAudio(state: SimState): void {
    if (this.bundle.sourceMode !== 'steam') return;
    const keys = new Set<string>();
    const mutantDef = this.dataProvider.getMutant(state.player.mutant);
    if (mutantDef) {
      keys.add(mutantDef.sounds.hurt);
      keys.add(mutantDef.sounds.dead);
      keys.add(mutantDef.sounds.confirm);
      keys.add(`sndMutant${mutantDef.raceIndex}Slct`);
      if (mutantDef.sounds.active) keys.add(mutantDef.sounds.active);
      keys.add(`sndMutant${mutantDef.raceIndex}LowH`);
      // Warm Ultra speech looseSounds (e.g. snd/FishUltraA, snd/FishUltraB) if present
      const cleanName = mutantDef.name.replace(/[^A-Za-z]/g, '');
      if (cleanName) {
        keys.add(`snd/${cleanName}UltraA`);
        keys.add(`snd/${cleanName}UltraB`);
      }
    }
    for (const slot of state.player.weapons) {
      if (!slot) continue;
      const wep = this.dataProvider.getWeapon(slot.weaponId);
      if (wep?.fireSound) keys.add(wep.fireSound);
    }
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const def = this.dataProvider.getEnemy(e.defId);
      if (!def) continue;
      if (def.sounds.hurt) keys.add(def.sounds.hurt);
      if (def.sounds.dead) keys.add(def.sounds.dead);
      if (def.sounds.fire) keys.add(def.sounds.fire);
    }

    const valid = Array.from(keys).filter((k) => this.audio.hasManifestSound(k));
    if (valid.length > 0) {
      void this.audio.preloadSounds(valid);
    }
  }

  private syncScreenWithSimPhase(): void {
    if (!this.simState) return;
    switch (this.simState.phase) {
      case 'mutation_select':
        if (this.screen !== 'mutation_select') {
          this.screen = 'mutation_select';
          this.input.setGameplayActive(false);
          this.input.clearAllLatches();
          this.syncMusicRouting();
        }
        break;
      case 'ultra_select':
        if (this.screen !== 'ultra_select') {
          this.screen = 'ultra_select';
          this.input.setGameplayActive(false);
          this.input.clearAllLatches();
          this.syncMusicRouting();
        }
        break;
      case 'game_over':
        if (this.screen !== 'game_over') {
          this.screen = 'game_over';
          this.input.setGameplayActive(false);
          this.input.clearAllLatches();
          this.recordRunEndOnce(false);
          this.syncMusicRouting();
        }
        break;
      case 'victory_throne':
        if (this.screen !== 'victory') {
          this.screen = 'victory';
          this.input.setGameplayActive(false);
          this.input.clearAllLatches();
          this.recordRunEndOnce(true);
          this.syncMusicRouting();
        }
        break;
      default:
        break;
    }
  }

  private recordRunEndOnce(victory: boolean): void {
    if (this.runEndRecorded || !this.simState) return;
    this.runEndRecorded = true;
    const p = this.simState.player;
    const goldenSlot = [p.weapons[0], p.weapons[1]].find((w) => {
      if (!w) return false;
      return Boolean(this.dataProvider.getWeapon(w.weaponId)?.golden);
    });

    this.saveManager.recordRunEnd({
      mutant: p.mutant,
      kills: this.simState.stats.kills,
      areaCode: this.simState.areaCode,
      loop: this.simState.loop,
      victory,
      crown: this.simState.crown,
      goldenWeapon: goldenSlot?.weaponId ?? null,
    });
  }

  private syncMusicRouting(): void {
    const isMenuOptions =
      this.screen === 'options' &&
      (this.returnScreenFromOptions === 'title' || this.returnScreenFromOptions === 'campfire');
    const isPausedOrPauseOptions =
      this.screen === 'paused' ||
      (this.screen === 'options' && this.returnScreenFromOptions === 'paused');

    const effectiveScreen: GameScreen = isMenuOptions ? this.returnScreenFromOptions : this.screen;
    const inRunMusicContext =
      effectiveScreen !== 'title' &&
      effectiveScreen !== 'campfire' &&
      effectiveScreen !== 'mutation_select' &&
      effectiveScreen !== 'ultra_select' &&
      effectiveScreen !== 'game_over' &&
      effectiveScreen !== 'victory';

    const bossStatus = inRunMusicContext
      ? this.getBossMusicStatus(this.simState)
      : { activeBossId: null, bossDefeated: false };

    const areaCode = inRunMusicContext ? this.simState?.areaCode : undefined;
    const biome = inRunMusicContext ? this.simState?.biome : undefined;
    const loop = inRunMusicContext ? this.simState?.loop : 0;

    const sig = `${effectiveScreen}:${areaCode ?? ''}:${biome ?? ''}:${loop ?? 0}:${bossStatus.activeBossId ?? ''}:${bossStatus.bossDefeated ? 1 : 0}:${isPausedOrPauseOptions ? 1 : 0}`;
    if (sig === this.lastMusicSignature) return;
    this.lastMusicSignature = sig;

    this.audio.routeContext({
      screen: effectiveScreen,
      areaCode,
      biome,
      loop,
      bossId: bossStatus.activeBossId,
      bossDefeated: bossStatus.bossDefeated,
      paused: isPausedOrPauseOptions,
    });
  }

  private startNewRun(opts: {
    mutant: MutantId;
    skin: 'a' | 'b';
    crown: CrownId;
    useGoldenWeapon: boolean;
    seed?: number;
    playConfirmSfx?: boolean;
  }): void {
    const save = this.saveManager.getData();
    const mp = save.mutants[opts.mutant];
    const goldenWeapon = opts.useGoldenWeapon ? mp?.goldenWeapon ?? null : null;
    const seed =
      opts.seed !== undefined
        ? opts.seed >>> 0
        : ((Date.now() ^ Math.floor(this.timeSec * 1000) ^ (save.totalRuns * 2654435761)) >>> 0) || 1;

    this.lastRunSeed = seed;
    this.runEndRecorded = false;
    this.lastBossMusicState = '';
    this.lastLowHpWarnSec = -10;

    this.simState = createRunState({
      mutant: opts.mutant,
      seed,
      crown: opts.crown,
      skin: opts.skin,
      goldenWeapon,
    });
    this.lastPlayerHp = this.simState.player.hp;

    this.saveManager.recordRunStart(opts.mutant);
    // Respect frame-0 phase transitions (e.g. Crown of Destiny opening mutation_select immediately)
    // BEFORE flushing frame-0 events so music routes cleanly in a single pass with zero Campfire/combat bounce.
    this.screen = 'playing';
    this.syncScreenWithSimPhase();
    this.resetInterpolationSnapshot();
    this.preloadAreaSteamAudio(this.simState);
    this.flushSimEvents();

    if (opts.playConfirmSfx) {
      const confirmSnd = this.dataProvider.getMutant(opts.mutant)?.sounds.confirm;
      if (confirmSnd) {
        this.audio.playSfx(confirmSnd, 0, 0, { listenerX: 0, listenerY: 0, pitchJitter: 0.03 });
      }
    }

    this.input.setGameplayActive(this.screen === 'playing');
    this.input.clearAllLatches();
    this.audio.setPaused(false);
    this.renderAccumulator = 0;
    this.hasRenderedFirstFrame = false;
    this.syncMusicRouting();
  }

  private handleMenuAction(action: MenuAction): void {
    switch (action.type) {
      case 'open_screen': {
        if (action.screen === 'options') {
          this.returnScreenFromOptions = this.screen;
        } else if (
          (action.screen === 'campfire' || action.screen === 'title') &&
          this.screen === 'paused' &&
          this.simState &&
          !this.runEndRecorded &&
          (this.simState.stats.kills > 0 || this.simState.tick > 30)
        ) {
          this.recordRunEndOnce(false);
        }
        this.rebindingField = null;
        this.input.cancelKeyCapture();
        this.input.clearMenuLatches();
        this.screen = action.screen;
        const pauseAudio =
          this.screen === 'paused' ||
          (this.screen === 'options' && this.returnScreenFromOptions === 'paused');
        this.audio.setPaused(pauseAudio);
        this.syncMusicRouting();
        break;
      }

      case 'start_run': {
        this.startNewRun({
          mutant: action.mutant,
          skin: action.skin,
          crown: action.crown,
          useGoldenWeapon: action.useGoldenWeapon,
          playConfirmSfx: true,
        });
        break;
      }

      case 'resume': {
        if (this.simState) {
          this.screen = 'playing';
          this.simAccumulator = 0;
          this.presentationDt = 0;
          this.audio.setPaused(false);
          this.input.setGameplayActive(true);
          this.input.clearAllLatches();
          this.syncMusicRouting();
        }
        break;
      }

      case 'restart': {
        if (
          this.screen === 'paused' &&
          this.simState &&
          !this.runEndRecorded &&
          (this.simState.stats.kills > 0 || this.simState.tick > 30)
        ) {
          this.recordRunEndOnce(false);
        }
        const save = this.saveManager.getData();
        const mutant = this.simState?.player.mutant ?? save.selectedMutant;
        this.startNewRun({
          mutant,
          skin: this.saveManager.getSelectedSkin(mutant),
          crown: save.selectedCrown,
          useGoldenWeapon: save.useGoldenWeapon,
          playConfirmSfx: true,
        });
        break;
      }

      case 'select_mutant': {
        this.saveManager.setSelectedMutant(action.mutant);
        const mutantDef = this.dataProvider.getMutant(action.mutant);
        if (mutantDef) {
          this.audio.playSfx(`sndMutant${mutantDef.raceIndex}Slct`, 0, 0, {
            listenerX: 0,
            listenerY: 0,
            pitchJitter: 0.03,
            volume: 0.85,
          });
        }
        break;
      }

      case 'toggle_bskin': {
        const nextSkin = this.saveManager.toggleSelectedSkin(action.mutant);
        this.audio.playSfx(nextSkin === 'b' ? 'sndMenuBSkin' : 'sndMenuASkin', 0, 0, {
          listenerX: 0,
          listenerY: 0,
          pitchJitter: 0.02,
          volume: 0.85,
        });
        break;
      }

      case 'cycle_crown': {
        this.saveManager.setSelectedCrown(action.crown);
        this.audio.playSfx('sndMenuCrown', 0, 0, {
          listenerX: 0,
          listenerY: 0,
          pitchJitter: 0.02,
          volume: 0.85,
        });
        break;
      }

      case 'toggle_golden': {
        this.saveManager.setUseGoldenWeapon(action.enabled);
        this.audio.playSfx('sndMenuGoldwep', 0, 0, {
          listenerX: 0,
          listenerY: 0,
          pitchJitter: 0.02,
          volume: 0.85,
        });
        break;
      }

      case 'pick_mutation':
      case 'pick_ultra': {
        if (this.simState) {
          const rng = SeededRng.fromState(this.simState.rngState);
          const prevMap = this.simState.map;
          applyMutationSelection(this.simState, action.index, rng, populateAreaEntities);
          if (this.simState.map === prevMap) {
            this.simState.rngState = rng.getState();
          } else {
            this.resetInterpolationSnapshot();
          }
          this.flushSimEvents();
          if (this.simState.phase === 'playing') {
            this.screen = 'playing';
            this.simAccumulator = 0;
            this.presentationDt = 0;
            this.input.setGameplayActive(true);
            this.input.clearAllLatches();
            this.syncMusicRouting();
          } else {
            this.syncScreenWithSimPhase();
          }
        }
        break;
      }

      case 'update_audio': {
        const updated = this.saveManager.updateAudio(action.partial);
        this.audio.applySettings(updated);
        break;
      }

      case 'update_render': {
        const updated = this.saveManager.updateRender(action.partial);
        this.applyResponsiveCanvasSize(updated);
        const sz = this.renderer.getLogicalSize();
        this.input.setLogicalSize(sz.width, sz.height);
        if (action.partial.targetFps !== undefined || action.partial.classic30Fps !== undefined) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.renderAccumulator = 0;
          this.fpsFrameCount = 0;
          this.fpsWindowStartMs = now;
          this.hasRenderedFirstFrame = false;
        }
        break;
      }

      case 'update_controls': {
        const updated = this.saveManager.updateControls(action.partial);
        this.input.setControlSettings(updated);
        break;
      }

      case 'test_rumble': {
        const ctrl = this.saveManager.getData().controls;
        if (!ctrl.gamepadRumble) {
          this.showControllerToast('@dENABLE RUMBLE TO TEST', 2.0, '#78708a');
        } else {
          this.input.testRumble();
          this.showControllerToast('@gRUMBLE TEST', 2.0, '#52e864');
        }
        break;
      }

      case 'begin_rebind': {
        this.rebindingField = action.field;
        this.input.beginKeyCapture();
        break;
      }

      case 'cancel_rebind': {
        this.rebindingField = null;
        this.input.cancelKeyCapture();
        break;
      }

      case 'rebind_key': {
        // Cleanly swap bindings if the chosen key is already bound to another action (prevents duplicate-key softlocks!)
        const current = this.saveManager.getData().keybinds;
        const prevCode = current[action.field];
        const patch: Partial<KeyBindings> = { [action.field]: action.code };
        if (prevCode !== action.code) {
          const fields = Object.keys(current) as Array<keyof KeyBindings>;
          for (let i = 0; i < fields.length; i++) {
            const otherField = fields[i]!;
            if (otherField !== action.field && current[otherField] === action.code) {
              patch[otherField] = prevCode;
            }
          }
        }
        const updated = this.saveManager.updateKeybinds(patch);
        this.input.setKeybinds(updated);
        this.rebindingField = null;
        this.input.cancelKeyCapture();
        break;
      }

      case 'reset_keybinds': {
        const updated = this.saveManager.resetKeybinds();
        this.input.setKeybinds(updated);
        this.rebindingField = null;
        this.input.cancelKeyCapture();
        break;
      }

      case 'request_load_local': {
        this.openLocalFolderPicker();
        break;
      }

      case 'use_builtin_art': {
        this.switchToBuiltinAssets();
        break;
      }

      case 'use_local_art': {
        void this.switchToLocalAssets();
        break;
      }

      case 'clear_local_cache': {
        void clearCachedLocalAssets().then(() => {
          this.hasCachedLocal = false;
          this.switchToBuiltinAssets();
          this.setAssetStatus('@yCLEARED CUSTOM PACK CACHE - USING BUILT-IN ART', 4);
        });
        break;
      }

      case 'ui_sfx': {
        this.audio.playSfx(action.sound, 0, 0, { listenerX: 0, listenerY: 0, pitchJitter: 0.03 });
        break;
      }
    }
  }

  private setAssetStatus(text: string, durationSec = 5): void {
    this.assetStatusText = text;
    this.assetStatusUntilSec = this.timeSec + durationSec;
  }

  private mountLocalFolderInput(): void {
    if (typeof document === 'undefined' || this.fileInputEl) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
    input.addEventListener('change', () => {
      const files = input.files;
      if (files && files.length > 0) {
        void this.handleLocalFolderSelected(files);
      }
      input.value = '';
    });
    document.body.appendChild(input);
    this.fileInputEl = input;
  }

  /**
   * Fires synchronously inside the native DOM click gesture so browsers never block
   * opening the local OS folder picker for client-side Steam asset loading.
   */
  private handleCanvasSyncClick(e: MouseEvent): void {
    if (this.screen !== 'title' && this.screen !== 'options') return;
    if (this.assetLoading) return;
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = this.renderer.getLogicalSize();
    const pt = clientToLogicalCanvas(e.clientX, e.clientY, rect, width, height);
    const regions = this.menus.getHitRegions();
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i]!;
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
        if (r.id === 'title_load_local' || r.id === 'opt_load_local') {
          this.openLocalFolderPicker();
        }
        break;
      }
    }
  }

  private openLocalFolderPicker(): void {
    if (this.assetLoading) return;
    const now = Date.now();
    if (now - this.lastPickerOpenMs < 350) return;
    this.lastPickerOpenMs = now;
    this.mountLocalFolderInput();
    this.fileInputEl?.click();
  }

  private swapAssetBundle(nextBundle: AssetBundle): void {
    const prev = this.bundle;
    this.bundle = nextBundle;
    if (prev && prev !== nextBundle) {
      prev.dispose?.();
    }
    this.renderer.setBundle(nextBundle);
    this.hud.setBundle(nextBundle);
    this.menus.setBundle(nextBundle);
    // Defer track start to syncMusicRouting() below so live Built-In <-> Steam toggles never double-fetch mus/ThemeA
    this.audio.setAssetSource(nextBundle.manifest, {
      baseUrl: nextBundle.baseUrl || '/nt-assets',
      resolveAudioUrl: (relPath) => nextBundle.getAudioUrl(relPath),
      reestablishTracks: false,
    });
    if (nextBundle.sourceMode === 'steam') {
      this.preloadCoreSteamAudio();
      if (this.simState) {
        this.preloadAreaSteamAudio(this.simState);
      }
    }
    this.lastMusicSignature = '';
    this.syncMusicRouting();
  }

  private switchToBuiltinAssets(): void {
    setAssetModePreference('builtin');
    this.swapAssetBundle(createFallbackBundle());
    this.setAssetStatus(
      `@gKRUNKED ART PACK ACTIVE (${this.bundle.manifest.stats.spriteCount} SPRITES)`,
      4,
    );
  }

  private async switchToLocalAssets(): Promise<void> {
    if (this.assetLoading) return;
    this.assetLoading = true;
    this.setAssetStatus('@yLOADING CUSTOM PACK...', 10);
    try {
      setAssetModePreference('local');
      const cached = await loadCachedLocalBundle();
      if (cached) {
        this.hasCachedLocal = true;
        this.swapAssetBundle(cached);
        this.setAssetStatus(
          `@gCUSTOM PACK LOADED (${cached.manifest.stats.spriteCount} SPRITES)`,
          4,
        );
        return;
      }
      const fetched = await loadAssets('/nt-assets', { modePreference: 'local' });
      if (fetched.sourceMode === 'steam') {
        this.hasServerSteam = fetched.origin === 'steam-server';
        this.swapAssetBundle(fetched);
        this.setAssetStatus(
          `@gCUSTOM PACK LOADED (${fetched.manifest.stats.spriteCount} SPRITES)`,
          4,
        );
        return;
      }
      this.setAssetStatus('@ySELECT YOUR CUSTOM PACK FOLDER', 5);
      this.openLocalFolderPicker();
    } catch (err) {
      this.setAssetStatus(`@rCUSTOM PACK LOAD FAILED: ${String(err).slice(0, 40)}`, 6);
    } finally {
      this.assetLoading = false;
    }
  }

  private async handleLocalFolderSelected(files: FileList): Promise<void> {
    if (this.assetLoading) return;
    this.assetLoading = true;
    this.setAssetStatus('@yPARSING CUSTOM PACK...', 30);
    try {
      const result = await loadLocalAssetsFromFiles(files, (msg) => {
        this.setAssetStatus(`@y${msg.toUpperCase().slice(0, 48)}`, 30);
      });
      setAssetModePreference('local');
      this.swapAssetBundle(result.bundle);
      void saveCachedLocalAssets(result.rawCachePayload).then((ok) => {
        if (ok) this.hasCachedLocal = true;
      });
      this.setAssetStatus(
        `@gLOADED CUSTOM PACK (${result.bundle.manifest.stats.spriteCount} SPRITES)!`,
        5,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setAssetStatus(`@r${msg.toUpperCase().slice(0, 52)}`, 6);
    } finally {
      this.assetLoading = false;
    }
  }

  private createDebugBridge(): DebugBridge {
    return {
      getTelemetry: (): PlaytestTelemetry => {
        const st = this.simState;
        const save = this.saveManager.getData();
        const w = save.render.widescreen ? LOGICAL_WIDTH_16_9 : LOGICAL_WIDTH_4_3;
        const hostileAlive = st
          ? st.enemies.filter((e) => !e.friendly && e.hp > 0).length
          : 0;
        const boss = st?.boss;
        const bossId = boss && !boss.defeated ? boss.bossId : null;
        const targetFps: TargetFps = save.render.targetFps ?? (save.render.classic30Fps ? 30 : 120);
        const gpInfo = this.input.getGamepadInfo();
        return {
          fps: this.measuredFps,
          targetFps,
          simHz: this.measuredSimHz,
          tick: st?.tick ?? 0,
          screen: this.screen,
          phase: st?.phase ?? 'playing',
          areaCode: st?.areaCode ?? '1-1',
          biome: st?.biome ?? 'desert',
          loop: st?.loop ?? 0,
          mutant: st?.player.mutant ?? save.selectedMutant,
          hp: st?.player.hp ?? 0,
          maxHp: st?.player.maxHp ?? 0,
          rads: st?.player.rads ?? 0,
          level: st?.player.level ?? 1,
          kills: st?.stats.kills ?? 0,
          enemiesAlive: hostileAlive,
          projectilesActive: st?.projectiles.length ?? 0,
          pickupsCount: st?.pickups.length ?? 0,
          corpsesCount: st?.corpses.length ?? 0,
          casingsCount: st?.casings.length ?? 0,
          portalActive: st?.portal.active ?? false,
          portalX: st?.portal.x ?? 0,
          portalY: st?.portal.y ?? 0,
          playerX: st?.player.x ?? 0,
          playerY: st?.player.y ?? 0,
          bossId,
          bossHp: boss?.hp ?? 0,
          bossMaxHp: boss?.maxHp ?? 0,
          weapons: st
            ? [st.player.weapons[0].weaponId, st.player.weapons[1]?.weaponId ?? null]
            : ['revolver', null],
          activeSlot: st?.player.activeSlot ?? 0,
          ammo: st
            ? { ...st.player.ammo }
            : { melee: 0, bullet: 0, shell: 0, bolt: 0, explosive: 0, energy: 0 },
          mutations: st ? [...st.player.mutations] : [],
          ultra: st?.player.ultra ?? null,
          pendingMutations: st ? [...st.pendingMutations] : [],
          assetMode: this.bundle.sourceMode,
          loadedSpriteCount: Object.keys(this.bundle.manifest.sprites).length,
          loadedSoundCount: Object.keys(this.bundle.manifest.sounds).length,
          canvasWidth: w,
          canvasHeight: LOGICAL_HEIGHT,
          consoleErrors: [...this.consoleErrors],
          inputMode: this.input.getInputMode(),
          gamepadConnected: gpInfo.connected,
          gamepadName: gpInfo.padName,
          gamepadFamily: gpInfo.family,
          gamepadProfile: gpInfo.profile,
          touchOverlayVisible: this.input.isTouchOverlayVisible(),
        };
      },

      getStateHash: (): string => {
        return this.simState ? hashSimState(this.simState) : 'no-sim';
      },

      getScreen: (): GameScreen => this.screen,

      getLoadedAssets: () => ({
        mode: this.bundle.sourceMode,
        sprites: Object.keys(this.bundle.manifest.sprites).length,
        sounds: Object.keys(this.bundle.manifest.sounds).length,
        fonts: Object.keys(this.bundle.manifest.fonts).length,
      }),

      startRun: (mutant?: MutantId, seed?: number, crown?: CrownId): void => {
        const save = this.saveManager.getData();
        const chosenMutant = mutant ?? save.selectedMutant;
        this.startNewRun({
          mutant: chosenMutant,
          skin: this.saveManager.getSelectedSkin(chosenMutant),
          crown: crown ?? save.selectedCrown,
          useGoldenWeapon: save.useGoldenWeapon,
          seed: seed ?? this.lastRunSeed,
        });
      },

      warpArea: (areaCode: AreaCode, loop?: number): void => {
        if (!this.simState) {
          this.startNewRun({
            mutant: this.saveManager.getData().selectedMutant,
            skin: this.saveManager.getSelectedSkin(),
            crown: this.saveManager.getData().selectedCrown,
            useGoldenWeapon: false,
            seed: 1337,
          });
        }
        if (!this.simState) return;
        warpToArea(this.simState, areaCode, loop ?? this.simState.loop);
        this.lastBossMusicState = '';
        this.lastPlayerHp = this.simState.player.hp;
        this.resetInterpolationSnapshot();
        this.screen = 'playing';
        this.input.setGameplayActive(true);
        this.input.clearAllLatches();
        this.hasRenderedFirstFrame = false;
        this.flushSimEvents();
        this.syncMusicRouting();
      },

      spawnBoss: (bossId: BossId): void => {
        if (!this.simState) return;
        const rng = SeededRng.fromState(this.simState.rngState);
        spawnBossEntity(this.simState, bossId, rng);
        this.simState.rngState = rng.getState();
        this.flushSimEvents();
        this.syncMusicRouting();
      },

      giveWeapon: (weaponId: string, slot?: 0 | 1): void => {
        if (!this.simState) return;
        givePlayerWeapon(this.simState, weaponId, slot);
        this.preloadAreaSteamAudio(this.simState);
      },

      grantMutation: (mutationId: MutationId): void => {
        if (!this.simState) return;
        const rng = SeededRng.fromState(this.simState.rngState);
        grantMutationById(this.simState, mutationId, rng);
        this.simState.rngState = rng.getState();
        this.flushSimEvents();
      },

      grantRads: (amount: number): void => {
        if (!this.simState) return;
        const rng = SeededRng.fromState(this.simState.rngState);
        addRads(this.simState, amount, rng);
        this.simState.rngState = rng.getState();
        this.flushSimEvents();
      },

      pickMutation: (index: number): void => {
        if (!this.simState) return;
        const rng = SeededRng.fromState(this.simState.rngState);
        const prevMap = this.simState.map;
        applyMutationSelection(this.simState, index, rng, populateAreaEntities);
        if (this.simState.map === prevMap) {
          this.simState.rngState = rng.getState();
        } else {
          this.resetInterpolationSnapshot();
        }
        this.flushSimEvents();
        if (this.simState.phase === 'playing') {
          this.screen = 'playing';
          this.input.setGameplayActive(true);
          this.input.clearAllLatches();
          this.syncMusicRouting();
        } else {
          this.syncScreenWithSimPhase();
        }
      },

      setGodMode: (enabled: boolean): void => {
        if (!this.simState) return;
        this.simState.player.godMode = enabled;
      },

      clearEnemies: (): void => {
        if (!this.simState) return;
        // Run up to 3 passes so split-on-death enemies (maggot_nest / big_rat) also flush cleanly
        for (let pass = 0; pass < 3; pass++) {
          const hostiles = this.simState.enemies.filter((e) => !e.friendly && e.hp > 0);
          if (hostiles.length === 0) break;
          const rng = SeededRng.fromState(this.simState.rngState);
          for (let i = 0; i < hostiles.length; i++) {
            const e = hostiles[i]!;
            e.invulnerable = false;
            applyDamageToEnemy(this.simState, e, e.hp + 9999, 0, 0, rng);
          }
          this.simState.rngState = rng.getState();
          this.simState.hitstopTicks = 0;
          this.runSingleSimTick({ ...DEFAULT_IDLE_INPUT });
        }
      },

      stepTicks: (count: number, partialInput?: Partial<InputFrame>): void => {
        if (!this.simState) return;
        const n = Math.max(0, Math.min(3000, Math.floor(count)));
        for (let i = 0; i < n; i++) {
          const frame: InputFrame = {
            ...DEFAULT_IDLE_INPUT,
            aimWorldX: this.simState.player.x + 60,
            aimWorldY: this.simState.player.y,
            ...partialInput,
            firePressed: i === 0 ? Boolean(partialInput?.firePressed) : false,
            activePressed: i === 0 ? Boolean(partialInput?.activePressed) : false,
            swapPressed: i === 0 ? Boolean(partialInput?.swapPressed) : false,
            pickupPressed: i === 0 ? Boolean(partialInput?.pickupPressed) : false,
            pausePressed: i === 0 ? Boolean(partialInput?.pausePressed) : false,
          };
          this.runSingleSimTick(frame);
        }
      },

      setScreen: (screen: GameScreen): void => {
        this.screen = screen;
        this.input.setGameplayActive(screen === 'playing');
        this.input.clearAllLatches();
        this.hasRenderedFirstFrame = false;
        if (screen === 'game_over') {
          this.recordRunEndOnce(false);
        } else if (screen === 'victory') {
          this.recordRunEndOnce(true);
        }
        this.audio.setPaused(screen === 'paused');
        this.syncMusicRouting();
      },

      saveNow: (): void => {
        this.saveManager.save();
      },
    };
  }
}
