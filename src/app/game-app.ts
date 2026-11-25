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
import { InputManager, clientToLogicalCanvas } from '@/input';
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
  'sndClick',
  'sndHover',
  'sndPistol',
  'sndShotgun',
  'sndMachinegun',
  'sndCrossbow',
  'sndLaser',
  'sndExplosion',
  'sndHitFlesh',
  'sndHitWall',
  'sndPickupDisappear',
  'sndRadPickup',
  'sndAmmoPickup',
  'sndHealthPickup',
  'sndWeaponPickup',
  'sndPortalOpen',
  'sndLevelUp',
  'sndMutant1Hurt',
  'sndBanditHit',
  'sndBanditDie',
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

  // Custom Pack / Built-In Krunked Art Pack switcher state
  private hasCachedLocal = false;
  private hasServerSteam = false;
  private assetLoading = false;
  private assetStatusText = '';
  private assetStatusUntilSec = 0;
  private lastPickerOpenMs = 0;
  private fileInputEl: HTMLInputElement | null = null;

  // Audio unlock resilience across mouse, touch, keyboard, and gamepad
  private audioUnlockDone = false;
  private audioUnlockInFlight = false;

  // Bound event listeners
  private boundResize = () => this.handleResize();
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
    }

    const save = this.saveManager.getData();

    this.audio = new AudioEngine({
      baseUrl: this.bundle.baseUrl || '/nt-assets',
      manifest: this.bundle.manifest,
      settings: save.audio,
      resolveAudioUrl: (relPath) => this.bundle.getAudioUrl(relPath),
    });

    this.input = new InputManager(save.keybinds, {
      controls: save.controls,
      onUserInteraction: () => this.tryUnlockAudio(),
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
    this.audio?.stopMusic(0);
    this.audio?.stopAmbience(0);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('orientationchange', this.boundResize);
      window.visualViewport?.removeEventListener('resize', this.boundResize);
      this.removeAudioUnlockListeners();
      window.removeEventListener('error', this.boundWindowError);
      window.removeEventListener('unhandledrejection', this.boundRejection);
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
    const availW = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth));
    const availH = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight));
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
            const validCore = CORE_PRELOAD_SFX.filter((k) => Boolean(this.bundle.manifest.sounds[k]));
            void this.audio.preloadSounds(validCore);
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
    this.canvas.classList.toggle(
      'hide-cursor',
      this.screen === 'playing' && this.input.getInputMode() === 'gamepad',
    );

    if (this.screen === 'playing' && this.simState) {
      this.simAccumulator += dt;

      let stepsThisFrame = 0;
      const maxCatchupSteps = 4;

      while (this.simAccumulator >= SIM_DT && stepsThisFrame < maxCatchupSteps) {
        const inputFrame = this.input.consumeSimInput(
          this.renderer.getCamera(),
          this.simState.player.x,
          this.simState.player.y,
          { enemies: this.simState.enemies, map: this.simState.map },
        );

        if (inputFrame.pausePressed) {
          this.screen = 'paused';
          screenTransitioned = true;
          this.input.setGameplayActive(false);
          this.audio.setPaused(true);
          this.simAccumulator = 0;
          this.input.consumeMenuInput(); // clear simultaneous menuBack latch
          break;
        }

        this.runSingleSimTick(inputFrame);
        this.simAccumulator -= SIM_DT;
        stepsThisFrame += 1;
        this.simStepCount += 1;

        if (this.screen !== 'playing') {
          screenTransitioned = true;
          this.input.setGameplayActive(false);
          this.simAccumulator = 0;
          break;
        }
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
        const pointer = this.input.getPointerLogical();
        const aimWorld = this.renderer.getCamera().screenToWorld(pointer.x, pointer.y);
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
    };

    // Ensure hit regions are populated for this screen before sampling menu input
    if (this.menus.getHitRegions().length === 0) {
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
      const latestGp = this.input.getGamepadInfo();
      const curInputMode = this.input.getInputMode();
      if (this.simState && this.shouldRenderWorldBehindScreen(this.screen)) {
        this.renderWorldWithMode(this.simState, latestSave.render, 1, undefined, curInputMode);
        if (this.shouldRenderHudBehindScreen(this.screen)) {
          this.renderHudWithMode(
            this.simState,
            latestSave.render,
            curSize.width,
            curSize.height,
            curInputMode,
          );
        }
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
      });
    }
    this.recordRenderedFrame(nowMs);
  }

  private renderWorldWithMode(
    state: SimState,
    renderSettings: RenderSettings,
    interpAlpha: number,
    pointerLogical: { x: number; y: number } | undefined,
    inputMode: InputDeviceMode,
  ): void {
    const fn = this.renderer.renderWorld as (
      ctx: CanvasRenderingContext2D,
      state: SimState,
      settings: RenderSettings,
      interpAlpha: number,
      pointerLogical?: { x: number; y: number },
      inputMode?: InputDeviceMode,
    ) => void;
    fn.call(this.renderer, this.ctx, state, renderSettings, interpAlpha, pointerLogical, inputMode);
  }

  private renderHudWithMode(
    state: SimState,
    renderSettings: RenderSettings,
    width: number,
    height: number,
    inputMode: InputDeviceMode,
  ): void {
    const hudCtx: HudRenderContext & { inputMode?: InputDeviceMode } = {
      state,
      camera: this.renderer.getCamera(),
      renderSettings,
      fps: this.measuredFps,
      width,
      height,
      inputMode,
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
      if (
        pr.opened ||
        (pr.kind !== 'weapon_chest' &&
          pr.kind !== 'big_weapon_chest' &&
          pr.kind !== 'ammo_chest' &&
          pr.kind !== 'proto_statue')
      ) {
        continue;
      }
      const dx = pr.x - p.x;
      const dy = pr.y - p.y;
      if (dx * dx + dy * dy <= maxDistSq) return true;
    }
    return false;
  }

  private renderPlayingFrame(
    state: SimState,
    renderSettings: RenderSettings,
    interpAlpha: number,
    pointer: { x: number; y: number },
    width: number,
    height: number,
  ): void {
    const inputMode = this.input.getInputMode();
    this.renderWorldWithMode(state, renderSettings, interpAlpha, pointer, inputMode);
    this.renderHudWithMode(state, renderSettings, width, height, inputMode);
    // Strict visibility rule: renders ZERO pixels unless active touch mode is enabled
    this.input.renderTouchOverlay(
      this.ctx,
      width,
      height,
      this.hasNearbyInteractable(state),
      this.timeSec,
    );
  }

  private shouldRenderHudBehindScreen(screen: GameScreen): boolean {
    // Keep Mutation/Ultra Select & Game Over crisp with zero HUD text bleed-through
    return screen === 'paused' || (screen === 'options' && this.returnScreenFromOptions === 'paused');
  }

  private shouldRenderWorldBehindScreen(screen: GameScreen): boolean {
    if (screen === 'paused' || screen === 'mutation_select' || screen === 'ultra_select') {
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

  private runSingleSimTick(inputFrame: InputFrame): void {
    if (!this.simState) return;
    stepSimulation(this.simState, inputFrame);
    this.flushSimEvents();
    this.syncScreenWithSimPhase();
  }

  private flushSimEvents(): void {
    if (!this.simState) return;
    const events = drainEvents(this.simState);
    if (events.length === 0) return;

    this.renderer.consumeEvents(events, this.simState);
    this.warmSteamAudioForEvents(events);
    this.audio.consumeEvents(events, this.simState.player.x, this.simState.player.y);
    this.triggerRumbleForEvents(events);

    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'area_change' || ev.type === 'boss_intro' || ev.type === 'player_died') {
        this.syncMusicRouting();
      }
    }
  }

  private triggerRumbleForEvents(events: readonly SimEvent[]): void {
    if (this.input.getInputMode() !== 'gamepad') return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as SimEvent | { type: string; killed?: boolean; speed?: number };
      if (ev.type === 'player_died') {
        this.input.rumble('death');
      } else if (ev.type === 'sfx') {
        const s = (ev as Extract<SimEvent, { type: 'sfx' }>).sound;
        if (s === 'sndExplosion') {
          this.input.rumble('explosion');
        } else if (s.startsWith('sndMutant') && s.endsWith('Hurt')) {
          this.input.rumble('hurt');
        } else if (s.endsWith('Die') || s === 'sndEnemyDie') {
          this.input.rumble('kill');
        }
      } else if (ev.type === 'shake') {
        const sh = ev as Extract<SimEvent, { type: 'shake' }>;
        if (sh.trauma >= 0.48) {
          this.input.rumble('explosion');
        } else if ((sh.kick ?? 0) >= 3.5 || sh.trauma >= 0.24) {
          this.input.rumble('fire_heavy');
        } else if ((sh.kick ?? 0) > 0 || sh.trauma >= 0.08) {
          this.input.rumble('fire_light');
        }
      } else if (ev.type === 'melee_deflect') {
        this.input.rumble('parry');
      } else if (ev.type === 'hit_confirm' && (ev as { killed?: boolean }).killed) {
        this.input.rumble('kill');
      } else if (ev.type === 'corpse_impact') {
        this.input.rumble('fire_light');
      }
    }
  }

  private warmSteamAudioForEvents(events: readonly SimEvent[]): void {
    if (this.bundle.sourceMode !== 'steam') return;
    const sounds = this.bundle.manifest.sounds;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'sfx' && sounds[ev.sound]) {
        void this.audio.loadSound(ev.sound);
      } else if (ev.type === 'music' && ev.track) {
        this.preloadAndPlayTrack(ev.track, 'music');
        if (ev.ambience) {
          this.preloadAndPlayTrack(ev.ambience, 'ambience');
        }
      }
    }
  }

  private preloadAndPlayTrack(trackKey: string, kind: 'music' | 'ambience'): void {
    if (this.bundle.sourceMode !== 'steam') return;
    const relPath =
      kind === 'music'
        ? this.bundle.manifest.music[trackKey] ?? this.bundle.manifest.sounds[trackKey]?.path
        : this.bundle.manifest.ambience[trackKey] ?? this.bundle.manifest.sounds[trackKey]?.path;
    if (!relPath) return;

    // Ensure manifest.sounds has an alias or fetch via loadSound using direct key path
    void this.audio.loadSound(trackKey).then((buf) => {
      if (!buf) return;
      const stats = this.audio.getStats();
      if (kind === 'music' && stats.currentMusic === trackKey) {
        this.audio.stopMusic(0.05);
        this.audio.playMusic(trackKey, 0.4);
      } else if (kind === 'ambience' && stats.currentAmbience === trackKey) {
        this.audio.stopAmbience(0.05);
        this.audio.playAmbience(trackKey, 0.4);
      }
    });
  }

  private syncScreenWithSimPhase(): void {
    if (!this.simState) return;
    switch (this.simState.phase) {
      case 'mutation_select':
        if (this.screen !== 'mutation_select') {
          this.screen = 'mutation_select';
          this.input.clearSimLatches();
        }
        break;
      case 'ultra_select':
        if (this.screen !== 'ultra_select') {
          this.screen = 'ultra_select';
          this.input.clearSimLatches();
        }
        break;
      case 'game_over':
        if (this.screen !== 'game_over') {
          this.screen = 'game_over';
          this.recordRunEndOnce(false);
          this.syncMusicRouting();
        }
        break;
      case 'victory_throne':
        if (this.screen !== 'victory') {
          this.screen = 'victory';
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
    const bossId =
      this.simState?.boss && !this.simState.boss.defeated ? this.simState.boss.bossId : null;
    const sig = `${this.screen}:${this.simState?.areaCode ?? ''}:${this.simState?.biome ?? ''}:${this.simState?.loop ?? 0}:${bossId ?? ''}`;
    if (sig === this.lastMusicSignature) return;
    this.lastMusicSignature = sig;

    this.audio.routeContext({
      screen: this.screen,
      areaCode: this.simState?.areaCode,
      biome: this.simState?.biome,
      loop: this.simState?.loop,
      bossId,
      paused: this.screen === 'paused',
    });

    if (this.bundle.sourceMode === 'steam') {
      const st = this.audio.getStats();
      if (st.currentMusic) this.preloadAndPlayTrack(st.currentMusic, 'music');
      if (st.currentAmbience) this.preloadAndPlayTrack(st.currentAmbience, 'ambience');
    }
  }

  private startNewRun(opts: {
    mutant: MutantId;
    skin: 'a' | 'b';
    crown: CrownId;
    useGoldenWeapon: boolean;
    seed?: number;
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

    this.simState = createRunState({
      mutant: opts.mutant,
      seed,
      crown: opts.crown,
      skin: opts.skin,
      goldenWeapon,
    });

    this.saveManager.recordRunStart(opts.mutant);
    this.renderer.invalidateFloor();
    this.renderer.getCamera().snapTo(this.simState.player.x, this.simState.player.y);
    this.flushSimEvents();

    this.screen = 'playing';
    this.audio.setPaused(false);
    this.input.clearSimLatches();
    this.simAccumulator = 0;
    this.renderAccumulator = 0;
    this.hasRenderedFirstFrame = false;
    this.syncMusicRouting();
  }

  private handleMenuAction(action: MenuAction): void {
    switch (action.type) {
      case 'open_screen': {
        if (action.screen === 'options') {
          this.returnScreenFromOptions = this.screen;
        }
        this.rebindingField = null;
        this.input.cancelKeyCapture();
        this.screen = action.screen;
        this.audio.setPaused(this.screen === 'paused');
        this.syncMusicRouting();
        break;
      }

      case 'start_run': {
        this.startNewRun({
          mutant: action.mutant,
          skin: action.skin,
          crown: action.crown,
          useGoldenWeapon: action.useGoldenWeapon,
        });
        break;
      }

      case 'resume': {
        if (this.simState) {
          this.screen = 'playing';
          this.audio.setPaused(false);
          this.input.clearSimLatches();
          this.syncMusicRouting();
        }
        break;
      }

      case 'restart': {
        const save = this.saveManager.getData();
        const mutant = this.simState?.player.mutant ?? save.selectedMutant;
        this.startNewRun({
          mutant,
          skin: this.saveManager.getSelectedSkin(mutant),
          crown: save.selectedCrown,
          useGoldenWeapon: save.useGoldenWeapon,
        });
        break;
      }

      case 'select_mutant': {
        this.saveManager.setSelectedMutant(action.mutant);
        break;
      }

      case 'toggle_bskin': {
        this.saveManager.toggleSelectedSkin(action.mutant);
        break;
      }

      case 'cycle_crown': {
        this.saveManager.setSelectedCrown(action.crown);
        break;
      }

      case 'toggle_golden': {
        this.saveManager.setUseGoldenWeapon(action.enabled);
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
            this.renderer.invalidateFloor();
            this.renderer.getCamera().snapTo(this.simState.player.x, this.simState.player.y);
          }
          this.flushSimEvents();
          if (this.simState.phase === 'playing') {
            this.screen = 'playing';
            this.input.clearSimLatches();
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
        const updated = this.saveManager.updateKeybinds({ [action.field]: action.code });
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
    this.audio.setAssetSource(nextBundle.manifest, {
      baseUrl: nextBundle.baseUrl || '/nt-assets',
      resolveAudioUrl: (relPath) => nextBundle.getAudioUrl(relPath),
    });
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
          gamepadConnected: this.input.getGamepadInfo().connected,
          gamepadName: this.input.getGamepadInfo().padName,
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
        this.renderer.invalidateFloor();
        this.renderer.getCamera().snapTo(this.simState.player.x, this.simState.player.y);
        this.screen = 'playing';
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
          this.renderer.invalidateFloor();
          this.renderer.getCamera().snapTo(this.simState.player.x, this.simState.player.y);
        }
        this.flushSimEvents();
        if (this.simState.phase === 'playing') {
          this.screen = 'playing';
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
