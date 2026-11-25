/**
 * Clean-Room Audio Engine for Nuclear Throne.
 * Engineered for 1-to-1 Vlambeer audio feel:
 * - Vlambeer crunch: pitch randomization (default ±8%), per-sound polyphony cap (4),
 *   global cap (24), per-sound micro-cooldown (35ms).
 * - Distance attenuation & stereo panning (-1..1) with ~360 px falloff.
 * - Dynamic music & ambience playback with smooth crossfades, pause ducking (0.35x),
 *   100% original procedural synth music/ambience in fallback mode, and live hot-swapping
 *   between Built-In Synth and Local Steam Audio (including Blob Object URLs).
 * - Seamless dual-mode execution: Web Audio API in browser, safe zero-dependency tracker in Node.
 */

import type {
  AmmoType,
  AssetManifest,
  AudioSettings,
  SimEvent,
} from '@/contracts';
import { playSynthSound } from './synth-fallback';
import { SynthMusicSequencer } from './synth-music';
import {
  MusicRouteContext,
  resolveMusicRoute,
  PAUSE_DUCKING_FACTOR,
} from './music-router';

type ExtendedAudioSimEvent =
  | SimEvent
  | { type: 'enemy_alert'; entityId: number; x: number; y: number; defId: string }
  | { type: 'hit_confirm'; x: number; y: number; damage: number; killed: boolean; crit?: boolean; melee?: boolean }
  | { type: 'corpse_impact'; x: number; y: number; speed: number; targetId?: number; killed?: boolean }
  | { type: 'melee_deflect'; x: number; y: number; angle: number }
  | { type: 'ammo_empty'; x: number; y: number; ammoType: AmmoType };

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.7,
  ambienceVolume: 0.6,
  muted: false,
};

export const MAX_SOUND_VOICES = 4;
export const MAX_GLOBAL_VOICES = 24;
export const DEFAULT_COOLDOWN_MS = 22; // < 1 sim tick (33.3ms) so 1-tick rapid fire never drops every 2nd shot
export const RAD_COOLDOWN_MS = 15; // smooth ascending rad-vacuum pitch streaks
export const DEFAULT_FALLOFF_PX = 360;
export const DEFAULT_PITCH_JITTER = 0.08; // ±8%
export const RAD_STREAK_WINDOW_MS = 460;
export const RAD_STREAK_MAX = 14;
export const RAD_STREAK_STEP = 0.045;

/**
 * Canonical Steam SOND aliases used when a semantic or clean-room sound key
 * is absent from a loaded Steam manifest, ensuring real Steam WAV/OGG playback
 * instead of silently dropping or falling back to synth.
 */
const STEAM_SOUND_ALIASES: Record<string, readonly string[]> = {
  sndPortal: ['sndPortalOpen', 'sndPortalAppear'],
  sndPortalEnter: ['sndPortalClose', 'sndPortalOpen'],
  sndBossIntro: ['sndBossIntroIn', 'sndBigBanditIntro'],
  sndHealthPickup: ['sndHPPickup', 'sndHPPickupBig'],
  sndPickupHP: ['sndHPPickup', 'sndHPPickupBig'],
  sndPickupRad: ['sndRadPickup'],
  sndPickupAmmo: ['sndAmmoPickup'],
  sndPickupWeapon: ['sndWeaponPickup'],
  sndMeleeDeflect: ['sndMeleeFlip'],
  sndCorpseImpact: ['sndImpWristHit', 'sndHitFlesh'],
  sndEnemyHit: ['sndHitFlesh', 'sndBanditHit'],
  sndEnemyHurt: ['sndHitFlesh', 'sndBanditHit'],
  sndEnemyAlert: ['sndSniperTarget'],
  sndHitConfirm: ['sndHitFlesh'],
  sndLowHpHeartbeat: ['sndGunGodLowHP'],
};

export interface SpatialResult {
  volume: number; // 0..1
  pan: number; // -1..1
}

/**
 * Calculates distance attenuation and stereo panning relative to a listener.
 * Sounds at or beyond falloffDistance return volume 0.
 * Pan ranges from -1 (hard left) to +1 (hard right).
 */
export function calculateSpatial(
  soundX: number,
  soundY: number,
  listenerX: number,
  listenerY: number,
  falloffDistance: number = DEFAULT_FALLOFF_PX
): SpatialResult {
  // If no spatial position is provided (both at 0,0) -> 2D center full volume
  if (soundX === 0 && soundY === 0 && listenerX === 0 && listenerY === 0) {
    return { volume: 1.0, pan: 0 };
  }

  const dx = soundX - listenerX;
  const dy = soundY - listenerY;
  const dist = Math.hypot(dx, dy);

  if (dist >= falloffDistance) {
    const pan = Math.max(-1, Math.min(1, dx / (falloffDistance * 0.75)));
    return { volume: 0, pan };
  }

  // Linear distance attenuation
  const volume = Math.max(0, 1 - dist / falloffDistance);
  const pan = Math.max(-1, Math.min(1, dx / (falloffDistance * 0.75)));

  return { volume, pan };
}

export interface AudioStats {
  activeVoices: number;
  suppressedByCooldown: number;
  suppressedByPolyphony: number;
  currentMusic: string | null;
  currentAmbience: string | null;
  unlocked: boolean;
}

export interface AssetSourceOptions {
  baseUrl?: string;
  resolveAudioUrl?: (relPath: string) => string;
}

export interface AudioEngineOptions {
  baseUrl?: string;
  manifest?: AssetManifest;
  resolveAudioUrl?: (relPath: string) => string;
  settings?: Partial<AudioSettings>;
  context?: AudioContext;
  maxGlobalVoices?: number;
  maxSoundVoices?: number;
  cooldownMs?: number;
  falloffPx?: number;
  timeProvider?: () => number;
}

interface ActiveVoice {
  id: number;
  soundKey: string;
  startTimeMs: number;
  durationMs: number;
  stop: () => void;
}

interface WebAudioNodes {
  ctx: AudioContext;
  limiter: DynamicsCompressorNode | null;
  masterGain: GainNode;
  sfxGain: GainNode;
  musicGain: GainNode;
  ambienceGain: GainNode;
  musicDuckingGain: GainNode;
  ambienceDuckingGain: GainNode;
}

export class AudioEngine {
  public baseUrl: string;
  public manifest?: AssetManifest;
  public readonly settings: AudioSettings;

  public readonly maxGlobalVoices: number;
  public readonly maxSoundVoices: number;
  public readonly cooldownMs: number;
  public readonly falloffPx: number;

  private resolveAudioUrl?: (relPath: string) => string;
  private timeProvider: () => number;
  private nextVoiceId = 1;
  private assetGeneration = 0;

  // State
  private unlocked = false;
  private paused = false;
  private backgroundSuspended = false;
  private currentMusic: string | null = null;
  private currentAmbience: string | null = null;

  // Stats
  private suppressedByCooldownCount = 0;
  private suppressedByPolyphonyCount = 0;

  // Active voice, cooldown & rad pickup streak tracking
  private activeVoices: ActiveVoice[] = [];
  private lastTriggerTimeMs = new Map<string, number>();
  private radStreakCount = 0;
  private lastRadPickupMs = -Infinity;
  private lastPitchRate = 1.0;

  // Buffer cache
  private bufferCache = new Map<string, AudioBuffer>();
  private pendingLoads = new Map<string, Promise<AudioBuffer | null>>();

  // Web Audio handles
  private webAudio: WebAudioNodes | null = null;
  private synthSequencer: SynthMusicSequencer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicSourceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceSourceGain: GainNode | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/nt-assets').replace(/\/+$/, '');
    this.manifest = options.manifest;
    this.resolveAudioUrl = options.resolveAudioUrl;
    this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...options.settings };

    this.maxGlobalVoices = options.maxGlobalVoices ?? MAX_GLOBAL_VOICES;
    this.maxSoundVoices = options.maxSoundVoices ?? MAX_SOUND_VOICES;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.falloffPx = options.falloffPx ?? DEFAULT_FALLOFF_PX;

    // Time provider for deterministic tests / simulation timing
    this.timeProvider =
      options.timeProvider ??
      (() => {
        if (this.webAudio) {
          return this.webAudio.ctx.currentTime * 1000;
        }
        return Date.now();
      });

    this.initWebAudio(options.context);
  }

  private initWebAudio(explicitCtx?: AudioContext): void {
    if (explicitCtx) {
      this.setupNodes(explicitCtx);
      return;
    }

    if (typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          const ctx = new AudioCtxClass();
          this.setupNodes(ctx);
        } catch {
          // Node or restricted environment without full Web Audio
        }
      }
    }
  }

  private setupNodes(ctx: AudioContext): void {
    try {
      this.synthSequencer?.dispose();
      this.synthSequencer = null;

      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      // Clean soft limiter / dynamics compressor on master bus so intense firefights
      // sound huge & cohesive without harsh digital clipping!
      let limiter: DynamicsCompressorNode | null = null;
      let mixTarget: AudioNode = masterGain;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-9, ctx.currentTime);
        limiter.knee.setValueAtTime(12, ctx.currentTime);
        limiter.ratio.setValueAtTime(6, ctx.currentTime);
        limiter.attack.setValueAtTime(0.003, ctx.currentTime);
        limiter.release.setValueAtTime(0.12, ctx.currentTime);
        limiter.connect(masterGain);
        mixTarget = limiter;
      }

      const sfxGain = ctx.createGain();
      sfxGain.connect(mixTarget);

      const musicGain = ctx.createGain();
      musicGain.connect(mixTarget);

      const musicDuckingGain = ctx.createGain();
      musicDuckingGain.connect(musicGain);

      const ambienceGain = ctx.createGain();
      ambienceGain.connect(mixTarget);

      const ambienceDuckingGain = ctx.createGain();
      ambienceDuckingGain.connect(ambienceGain);

      this.webAudio = {
        ctx,
        limiter,
        masterGain,
        sfxGain,
        musicGain,
        ambienceGain,
        musicDuckingGain,
        ambienceDuckingGain,
      };

      this.synthSequencer = new SynthMusicSequencer(ctx, musicDuckingGain, ambienceDuckingGain);

      this.applySettings(this.settings);
      this.unlocked = ctx.state === 'running';
    } catch {
      this.webAudio = null;
      this.synthSequencer = null;
    }
  }

  private isFallbackMode(): boolean {
    return !this.manifest || this.manifest.sourceMode === 'fallback';
  }

  private isWebAudioRunning(): boolean {
    return Boolean(this.webAudio && (this.unlocked || this.webAudio.ctx.state === 'running'));
  }

  /**
   * Hot-swaps the active asset manifest and URL resolver at runtime (e.g. toggling
   * between Built-In Synth Fallback and Local Steam Assets / Blob Object URLs).
   */
  public setAssetSource(manifest: AssetManifest, opts?: AssetSourceOptions): void {
    const prevMusic = this.currentMusic;
    const prevAmbience = this.currentAmbience;

    this.assetGeneration++;
    this.manifest = manifest;
    if (opts?.baseUrl !== undefined) {
      this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    }
    this.resolveAudioUrl = opts?.resolveAudioUrl;

    // Clear decoded buffer caches from previous asset source
    this.bufferCache.clear();
    this.pendingLoads.clear();

    // Stop active buffer playback and synth sequencer cleanly
    this.stopBufferMusic(0.15);
    this.stopBufferAmbience(0.15);
    this.synthSequencer?.stopMusic(0.15);
    this.synthSequencer?.stopAmbience(0.15);

    this.currentMusic = null;
    this.currentAmbience = null;

    // Immediately re-establish current music & ambience under the new source mode
    if (prevMusic) {
      this.playMusic(prevMusic, 0.35);
    }
    if (prevAmbience) {
      this.playAmbience(prevAmbience, 0.45);
    }
  }

  /**
   * Resumes Web Audio context on user interaction.
   * Immediately starts routed fallback synth music & ambience if queued before first gesture.
   */
  public async unlock(): Promise<boolean> {
    if (!this.webAudio) {
      this.unlocked = true;
      return true;
    }

    if (this.webAudio.ctx.state === 'suspended') {
      try {
        await this.webAudio.ctx.resume();
      } catch {
        // ignore
      }
    }

    this.unlocked = this.webAudio.ctx.state === 'running';

    if (this.unlocked) {
      if (this.isFallbackMode() && this.synthSequencer) {
        if (this.currentMusic && !this.synthSequencer.isPlayingMusic()) {
          this.synthSequencer.playMusic(this.currentMusic, 0.35);
        }
        if (this.currentAmbience && !this.synthSequencer.isPlayingAmbience()) {
          this.synthSequencer.playAmbience(this.currentAmbience, 0.5);
        }
      } else {
        // Steam mode: kick off any music/ambience queued before first gesture
        if (this.currentMusic && !this.musicSource) {
          this.ensureTrackStarted(this.currentMusic, 'music', 0.35);
        }
        if (this.currentAmbience && !this.ambienceSource) {
          this.ensureTrackStarted(this.currentAmbience, 'ambience', 0.5);
        }
      }
    }

    return this.unlocked;
  }

  /**
   * Returns current audio engine telemetry stats.
   */
  public getStats(): AudioStats {
    this.pruneFinishedVoices();
    return {
      activeVoices: this.activeVoices.length,
      suppressedByCooldown: this.suppressedByCooldownCount,
      suppressedByPolyphony: this.suppressedByPolyphonyCount,
      currentMusic: this.currentMusic,
      currentAmbience: this.currentAmbience,
      unlocked: this.unlocked,
    };
  }

  /**
   * Updates audio settings (volumes, muted status).
   */
  public applySettings(settings: Partial<AudioSettings>): void {
    Object.assign(this.settings, settings);

    if (!this.webAudio) return;
    const { ctx, masterGain, sfxGain, musicGain, ambienceGain } = this.webAudio;
    const now = ctx.currentTime;

    const masterVol = this.settings.muted ? 0 : this.settings.masterVolume;
    masterGain.gain.setValueAtTime(masterVol, now);
    sfxGain.gain.setValueAtTime(this.settings.sfxVolume, now);
    musicGain.gain.setValueAtTime(this.settings.musicVolume, now);
    ambienceGain.gain.setValueAtTime(this.settings.ambienceVolume, now);
  }

  /**
   * Sets paused state with click-free dynamic ducking (0.35x music & ambience volume).
   */
  public setPaused(paused: boolean): void {
    this.paused = paused;
    const ducking = paused ? PAUSE_DUCKING_FACTOR : 1.0;

    if (this.webAudio) {
      const now = this.webAudio.ctx.currentTime;
      const musicParam = this.webAudio.musicDuckingGain.gain;
      musicParam.cancelScheduledValues(now);
      musicParam.setValueAtTime(Math.max(0.0001, musicParam.value), now);
      musicParam.linearRampToValueAtTime(ducking, now + 0.08);

      const ambParam = this.webAudio.ambienceDuckingGain.gain;
      ambParam.cancelScheduledValues(now);
      ambParam.setValueAtTime(Math.max(0.0001, ambParam.value), now);
      ambParam.linearRampToValueAtTime(ducking, now + 0.08);
    }
  }

  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Cleanly suspends or resumes audio when browser tab visibility changes
   * so music never leaks in hidden tabs or bursts notes upon refocus.
   */
  public setBackgroundSuspended(suspended: boolean): void {
    if (this.backgroundSuspended === suspended) return;
    this.backgroundSuspended = suspended;
    this.synthSequencer?.setSuspended(suspended);

    if (!this.webAudio) return;
    const ctx = this.webAudio.ctx;
    try {
      if (suspended) {
        if (ctx.state === 'running' && typeof ctx.suspend === 'function') {
          void ctx.suspend().catch(() => {});
        }
      } else if (this.unlocked) {
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          void ctx.resume().catch(() => {});
        }
      }
    } catch {
      // ignore restricted AudioContext errors
    }
  }

  public isBackgroundSuspended(): boolean {
    return this.backgroundSuspended;
  }

  /**
   * Resolves a clean-room or semantic sound key to a matching Steam manifest key if available.
   */
  public resolveManifestSoundKey(key: string): string {
    if (!this.manifest || this.manifest.sourceMode !== 'steam') return key;
    if (
      this.manifest.sounds?.[key]?.path ||
      this.manifest.music?.[key] ||
      this.manifest.ambience?.[key] ||
      this.manifest.looseSounds?.[key]
    ) {
      return key;
    }
    const aliases = STEAM_SOUND_ALIASES[key];
    if (aliases) {
      for (let i = 0; i < aliases.length; i++) {
        const alt = aliases[i]!;
        if (this.manifest.sounds?.[alt]?.path) {
          return alt;
        }
      }
    }
    return key;
  }

  /**
   * Removes voices whose duration has expired.
   */
  private pruneFinishedVoices(): void {
    const nowMs = this.timeProvider();
    this.activeVoices = this.activeVoices.filter(
      (voice) => nowMs < voice.startTimeMs + voice.durationMs
    );
  }

  /**
   * Loads an AudioBuffer from the manifest, custom URL resolver, or base URL.
   */
  public async loadSound(key: string): Promise<AudioBuffer | null> {
    const resolvedKey = this.resolveManifestSoundKey(key);
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key)!;
    }
    if (resolvedKey !== key && this.bufferCache.has(resolvedKey)) {
      const aliased = this.bufferCache.get(resolvedKey)!;
      this.bufferCache.set(key, aliased);
      return aliased;
    }

    if (this.pendingLoads.has(resolvedKey)) {
      return this.pendingLoads.get(resolvedKey)!;
    }

    if (!this.webAudio || typeof fetch === 'undefined') {
      return null;
    }

    if (this.manifest?.sourceMode === 'fallback') {
      return null;
    }

    const relativePath =
      this.manifest?.sounds?.[resolvedKey]?.path ??
      this.manifest?.music?.[resolvedKey] ??
      this.manifest?.ambience?.[resolvedKey] ??
      this.manifest?.looseSounds?.[resolvedKey];

    if (this.manifest && !relativePath) {
      return null;
    }

    const cleanPath = (relativePath ?? `audio/${resolvedKey}.ogg`).replace(/^\/+/, '');
    const url = this.resolveAudioUrl
      ? this.resolveAudioUrl(cleanPath)
      : `${this.baseUrl}/${cleanPath}`;

    if (!url) {
      return null;
    }

    const generation = this.assetGeneration;

    const loadPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        if (!this.webAudio || generation !== this.assetGeneration) return null;
        const audioBuffer = await this.webAudio.ctx.decodeAudioData(arrayBuffer);
        if (generation !== this.assetGeneration) return null;
        this.bufferCache.set(resolvedKey, audioBuffer);
        if (resolvedKey !== key) {
          this.bufferCache.set(key, audioBuffer);
        }
        return audioBuffer;
      } catch {
        return null;
      } finally {
        if (generation === this.assetGeneration) {
          this.pendingLoads.delete(resolvedKey);
        }
      }
    })();

    this.pendingLoads.set(resolvedKey, loadPromise);
    return loadPromise;
  }

  /**
   * Preloads an array of sound keys in parallel.
   */
  public async preloadSounds(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.loadSound(k)));
  }

  public getRadStreakCount(): number {
    return this.radStreakCount;
  }

  public getLastPitchRate(): number {
    return this.lastPitchRate;
  }

  /**
   * Plays a sound effect with spatial panning, pitch jitter, ascending rad pickup pitch streak,
   * polyphony cap, micro-cooldown gate, and fallback procedural synth.
   */
  public playSfx(
    soundKey: string,
    soundX: number = 0,
    soundY: number = 0,
    options: {
      listenerX?: number;
      listenerY?: number;
      pitchJitter?: number;
      pitchBase?: number;
      volume?: number;
      falloffPx?: number;
    } = {}
  ): boolean {
    const nowMs = this.timeProvider();
    this.pruneFinishedVoices();

    // 1. Per-sound micro-cooldown check (22ms default < 1 sim tick; 15ms for rad streaks)
    const lowerKey = soundKey.toLowerCase();
    const isRadPickup = lowerKey === 'sndradpickup' || lowerKey === 'sndpickuprad';
    const effectiveCooldown = isRadPickup ? Math.min(this.cooldownMs, RAD_COOLDOWN_MS) : this.cooldownMs;
    const lastTime = this.lastTriggerTimeMs.get(soundKey);
    if (lastTime !== undefined && nowMs - lastTime < effectiveCooldown) {
      this.suppressedByCooldownCount++;
      return false;
    }

    // 2. Spatial attenuation & panning
    const listenerX = options.listenerX ?? 0;
    const listenerY = options.listenerY ?? 0;
    const maxFalloff = options.falloffPx ?? this.falloffPx;
    const spatial = calculateSpatial(soundX, soundY, listenerX, listenerY, maxFalloff);

    if (spatial.volume <= 0.0001) {
      // Sound is beyond listener falloff distance, drop silently
      return false;
    }

    // 3. Polyphony cap checks
    const currentSoundVoices = this.activeVoices.filter((v) => v.soundKey === soundKey);
    if (currentSoundVoices.length >= this.maxSoundVoices) {
      this.suppressedByPolyphonyCount++;
      return false;
    }

    if (this.activeVoices.length >= this.maxGlobalVoices) {
      this.suppressedByPolyphonyCount++;
      return false;
    }

    // Mark successful trigger for cooldown
    this.lastTriggerTimeMs.set(soundKey, nowMs);

    // 4. Calculate effective volume (respecting Steam SOND gain when present), rad streak climb & pitch jitter
    const resolvedKey = this.resolveManifestSoundKey(soundKey);
    const soundDefVol = this.manifest?.sounds?.[resolvedKey]?.volume;
    const manifestGain =
      typeof soundDefVol === 'number' && Number.isFinite(soundDefVol) && soundDefVol > 0
        ? Math.min(2.0, soundDefVol)
        : 1.0;
    const eventVolume = options.volume ?? 1.0;
    const effectiveVolume = spatial.volume * eventVolume * manifestGain;

    let streakBoost = 1.0;
    if (isRadPickup) {
      if (nowMs - this.lastRadPickupMs <= RAD_STREAK_WINDOW_MS) {
        this.radStreakCount = Math.min(RAD_STREAK_MAX, this.radStreakCount + 1);
      } else {
        this.radStreakCount = 0;
      }
      this.lastRadPickupMs = nowMs;
      streakBoost = 1.0 + this.radStreakCount * RAD_STREAK_STEP;
    }

    const jitterAmount = options.pitchJitter ?? DEFAULT_PITCH_JITTER;
    const pitchBase = (options.pitchBase ?? 1.0) * streakBoost;
    const pitchMultiplier = pitchBase * (1.0 + (Math.random() - 0.5) * 2 * jitterAmount);
    this.lastPitchRate = pitchMultiplier;

    // 5. Sound playback (Web Audio Buffer vs Synth Fallback vs Headless)
    const voiceId = this.nextVoiceId++;
    let voiceDurationMs = isRadPickup ? 160 : 250;
    let stopFn = () => {};

    if (this.webAudio) {
      const { ctx, sfxGain } = this.webAudio;
      const cachedBuffer = this.bufferCache.get(soundKey) ?? this.bufferCache.get(resolvedKey);

      if (cachedBuffer) {
        if (Number.isFinite(cachedBuffer.duration) && cachedBuffer.duration > 0) {
          voiceDurationMs = Math.max(
            60,
            Math.min(2000, (cachedBuffer.duration * 1000) / Math.max(0.25, pitchMultiplier)),
          );
        }
        try {
          const source = ctx.createBufferSource();
          source.buffer = cachedBuffer;
          source.playbackRate.value = pitchMultiplier;

          const voiceGain = ctx.createGain();
          voiceGain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

          source.connect(voiceGain);
          if (Math.abs(spatial.pan) > 0.001 && typeof ctx.createStereoPanner === 'function') {
            const panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(spatial.pan, ctx.currentTime);
            voiceGain.connect(panner);
            panner.connect(sfxGain);
          } else {
            voiceGain.connect(sfxGain);
          }

          source.start();
          stopFn = () => {
            try {
              source.stop();
              source.disconnect();
              voiceGain.disconnect();
            } catch {
              // ignore
            }
          };
          source.onended = () => {
            try {
              source.disconnect();
              voiceGain.disconnect();
            } catch {
              // ignore
            }
            this.activeVoices = this.activeVoices.filter((v) => v.id !== voiceId);
          };
        } catch {
          // If buffer play fails, fallback to synth
          const synth = playSynthSound(ctx, soundKey, sfxGain, {
            volume: effectiveVolume,
            pitchRate: pitchMultiplier,
            pan: spatial.pan,
          });
          if (synth) stopFn = synth.stop;
        }
      } else {
        if (
          this.manifest?.sourceMode === 'steam' &&
          !this.bufferCache.has(resolvedKey) &&
          Boolean(this.manifest.sounds && this.manifest.sounds[resolvedKey]?.path)
        ) {
          void this.loadSound(soundKey);
        }

        // Fallback procedural synthesis
        const synth = playSynthSound(ctx, soundKey, sfxGain, {
          volume: effectiveVolume,
          pitchRate: pitchMultiplier,
          pan: spatial.pan,
        });
        if (synth) stopFn = synth.stop;
      }
    }

    // Record voice
    this.activeVoices.push({
      id: voiceId,
      soundKey,
      startTimeMs: nowMs,
      durationMs: voiceDurationMs,
      stop: stopFn,
    });

    return true;
  }

  private stopBufferMusic(fadeDuration: number): void {
    const oldSource = this.musicSource;
    const oldGain = this.musicSourceGain;
    this.musicSource = null;
    this.musicSourceGain = null;

    if (!oldSource || !this.webAudio) return;
    const now = this.webAudio.ctx.currentTime;
    const fade = Math.max(0, fadeDuration);

    oldSource.onended = () => {
      try {
        oldSource.disconnect();
        oldGain?.disconnect();
      } catch {
        // ignore
      }
    };

    try {
      if (oldGain && fade > 0.01) {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + fade);
      }
      oldSource.stop(now + fade);
    } catch {
      try {
        oldSource.disconnect();
        oldGain?.disconnect();
      } catch {
        // ignore
      }
    }
  }

  private stopBufferAmbience(fadeDuration: number): void {
    const oldSource = this.ambienceSource;
    const oldGain = this.ambienceSourceGain;
    this.ambienceSource = null;
    this.ambienceSourceGain = null;

    if (!oldSource || !this.webAudio) return;
    const now = this.webAudio.ctx.currentTime;
    const fade = Math.max(0, fadeDuration);

    oldSource.onended = () => {
      try {
        oldSource.disconnect();
        oldGain?.disconnect();
      } catch {
        // ignore
      }
    };

    try {
      if (oldGain && fade > 0.01) {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + fade);
      }
      oldSource.stop(now + fade);
    } catch {
      try {
        oldSource.disconnect();
        oldGain?.disconnect();
      } catch {
        // ignore
      }
    }
  }

  private startBufferTrack(
    buffer: AudioBuffer,
    kind: 'music' | 'ambience',
    crossfadeSec: number
  ): void {
    if (!this.webAudio) return;
    const { ctx, musicDuckingGain, ambienceDuckingGain } = this.webAudio;
    const now = ctx.currentTime;
    const dest = kind === 'music' ? musicDuckingGain : ambienceDuckingGain;

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const trackGain = ctx.createGain();
      trackGain.gain.setValueAtTime(0.001, now);
      trackGain.gain.linearRampToValueAtTime(1.0, now + Math.max(0.02, crossfadeSec));

      source.connect(trackGain);
      trackGain.connect(dest);

      source.start(now);
      if (kind === 'music') {
        this.musicSource = source;
        this.musicSourceGain = trackGain;
      } else {
        this.ambienceSource = source;
        this.ambienceSourceGain = trackGain;
      }
    } catch {
      // ignore
    }
  }

  private ensureTrackStarted(
    trackKey: string,
    kind: 'music' | 'ambience',
    crossfadeSec: number
  ): void {
    if (!this.webAudio) return;
    const hasActiveSource = kind === 'music' ? Boolean(this.musicSource) : Boolean(this.ambienceSource);
    if (hasActiveSource) return;

    const buffer = this.bufferCache.get(trackKey);
    if (buffer) {
      if (kind === 'music') {
        this.synthSequencer?.stopMusic(Math.min(0.25, crossfadeSec));
      } else {
        this.synthSequencer?.stopAmbience(Math.min(0.3, crossfadeSec));
      }
      this.startBufferTrack(buffer, kind, crossfadeSec);
      return;
    }

    if (this.manifest?.sourceMode === 'steam') {
      const generation = this.assetGeneration;
      void this.loadSound(trackKey).then((buf) => {
        if (!this.webAudio || generation !== this.assetGeneration) return;
        const stillCurrent =
          kind === 'music' ? this.currentMusic === trackKey : this.currentAmbience === trackKey;
        const stillUnstarted = kind === 'music' ? !this.musicSource : !this.ambienceSource;
        if (!stillCurrent) return;
        if (buf) {
          if (stillUnstarted) {
            if (kind === 'music') {
              this.synthSequencer?.stopMusic(0.15);
            } else {
              this.synthSequencer?.stopAmbience(0.15);
            }
            this.startBufferTrack(buf, kind, crossfadeSec);
          }
        } else if (this.isWebAudioRunning() && this.synthSequencer && stillUnstarted) {
          if (kind === 'music') {
            this.synthSequencer.playMusic(trackKey, crossfadeSec);
          } else {
            this.synthSequencer.playAmbience(trackKey, crossfadeSec);
          }
        }
      });
    }
  }

  /**
   * Plays background music with smooth crossfade.
   * Uses procedural SynthMusicSequencer in fallback mode, or streams decoded Steam OGG buffers.
   */
  public playMusic(trackKey: string, crossfadeSec: number = 0.8): void {
    if (this.currentMusic === trackKey) {
      if (this.isFallbackMode()) {
        if (this.isWebAudioRunning() && this.synthSequencer && !this.synthSequencer.isPlayingMusic()) {
          this.synthSequencer.playMusic(trackKey, crossfadeSec);
        }
      } else if (this.isWebAudioRunning() && !this.musicSource) {
        this.ensureTrackStarted(trackKey, 'music', crossfadeSec);
      }
      return;
    }

    this.currentMusic = trackKey;

    if (!this.webAudio) return;

    // Crossfade out old buffer music
    this.stopBufferMusic(crossfadeSec);

    const buffer = this.bufferCache.get(trackKey);

    // Fallback mode (or missing buffer in fallback mode): play original procedural synth music
    if (this.isFallbackMode() && !buffer) {
      if (this.isWebAudioRunning() && this.synthSequencer) {
        this.synthSequencer.playMusic(trackKey, crossfadeSec);
      }
      return;
    }

    // Steam mode: ensure procedural synth music is stopped cleanly and start/load buffer
    this.synthSequencer?.stopMusic(Math.min(0.25, crossfadeSec));
    if (!this.isWebAudioRunning()) {
      // Queue async decode now; unlock() will start playback once AudioContext runs
      if (!buffer && this.manifest?.sourceMode === 'steam') {
        void this.loadSound(trackKey);
      }
      return;
    }
    this.ensureTrackStarted(trackKey, 'music', crossfadeSec);
  }

  /**
   * Plays environmental ambience with smooth crossfade.
   * Uses procedural SynthMusicSequencer ambience in fallback mode, or decoded Steam OGG buffers.
   */
  public playAmbience(trackKey: string, crossfadeSec: number = 1.0): void {
    if (this.currentAmbience === trackKey) {
      if (this.isFallbackMode()) {
        if (this.isWebAudioRunning() && this.synthSequencer && !this.synthSequencer.isPlayingAmbience()) {
          this.synthSequencer.playAmbience(trackKey, crossfadeSec);
        }
      } else if (this.isWebAudioRunning() && !this.ambienceSource) {
        this.ensureTrackStarted(trackKey, 'ambience', crossfadeSec);
      }
      return;
    }

    this.currentAmbience = trackKey;

    if (!this.webAudio) return;

    this.stopBufferAmbience(crossfadeSec);

    const buffer = this.bufferCache.get(trackKey);

    if (this.isFallbackMode() && !buffer) {
      if (this.isWebAudioRunning() && this.synthSequencer) {
        this.synthSequencer.playAmbience(trackKey, crossfadeSec);
      }
      return;
    }

    this.synthSequencer?.stopAmbience(Math.min(0.3, crossfadeSec));
    if (!this.isWebAudioRunning()) {
      if (!buffer && this.manifest?.sourceMode === 'steam') {
        void this.loadSound(trackKey);
      }
      return;
    }
    this.ensureTrackStarted(trackKey, 'ambience', crossfadeSec);
  }

  /**
   * Stops music with optional fade-out.
   */
  public stopMusic(fadeDuration: number = 0.5): void {
    this.currentMusic = null;
    this.stopBufferMusic(fadeDuration);
    this.synthSequencer?.stopMusic(fadeDuration);
  }

  /**
   * Stops ambience with optional fade-out.
   */
  public stopAmbience(fadeDuration: number = 0.5): void {
    this.currentAmbience = null;
    this.stopBufferAmbience(fadeDuration);
    this.synthSequencer?.stopAmbience(fadeDuration);
  }

  /**
   * Stops all active playback and disposes internal synth timers cleanly.
   */
  public dispose(): void {
    this.stopMusic(0);
    this.stopAmbience(0);
    for (const voice of this.activeVoices) {
      try {
        voice.stop();
      } catch {
        // ignore
      }
    }
    this.activeVoices = [];
    this.synthSequencer?.dispose();
    this.synthSequencer = null;
  }

  /**
   * Routes music and ambience based on current gameplay context.
   */
  public routeContext(ctx: MusicRouteContext): void {
    const route = resolveMusicRoute(ctx, this.manifest);
    if (route.musicTrack) {
      this.playMusic(route.musicTrack);
    } else {
      this.stopMusic();
    }

    if (route.ambienceTrack) {
      this.playAmbience(route.ambienceTrack);
    } else {
      this.stopAmbience();
    }

    if (ctx.paused !== undefined) {
      this.setPaused(ctx.paused);
    }
  }

  /**
   * Consumes an array of SimEvents emitted by the simulation fixed-step tick.
   * Deduplicates semantic fallback cues when the same tick batch already carries
   * an explicit companion `sfx` event so portal/boss/level-up/deflect/empty cues never double-fire.
   */
  public consumeEvents(
    events: readonly SimEvent[],
    listenerX: number = 0,
    listenerY: number = 0
  ): void {
    let hasPortalSfx = false;
    let hasBossIntroSfx = false;
    let hasLevelUpSfx = false;
    let hasDeflectSfx = false;
    let hasCorpseSfx = false;
    let hasEmptySfx = false;
    let hasExplicitMusic = false;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as ExtendedAudioSimEvent;
      if (ev.type === 'sfx') {
        const low = ev.sound.toLowerCase();
        if (low.includes('portalopen') || low.includes('horrorportal') || low.includes('oasisportal')) {
          hasPortalSfx = true;
        } else if (
          low.includes('bossintro') ||
          low.includes('banditintro') ||
          low.includes('dogintro') ||
          low.includes('lilhunterappear') ||
          low.includes('nothingstart') ||
          low.includes('nothing2appear')
        ) {
          hasBossIntroSfx = true;
        } else if (low === 'sndlevelup' || low === 'sndlevelultra') {
          hasLevelUpSfx = true;
        } else if (low === 'sndmeleeflip' || low === 'sndcrystalricochet' || low === 'sndshielderdeflect') {
          hasDeflectSfx = true;
        } else if (low === 'sndimpwristhit') {
          hasCorpseSfx = true;
        } else if (low === 'sndempty' || low === 'sndultraempty' || low === 'sndhorrorempty') {
          hasEmptySfx = true;
        }
      } else if (ev.type === 'music') {
        hasExplicitMusic = true;
      }
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i] as ExtendedAudioSimEvent;
      switch (event.type) {
        case 'sfx': {
          this.playSfx(event.sound, event.x, event.y, {
            listenerX,
            listenerY,
            pitchJitter: event.pitchJitter,
            volume: event.volume,
          });
          break;
        }

        case 'music': {
          if (event.track) {
            this.playMusic(event.track);
          }
          if (event.ambience) {
            this.playAmbience(event.ambience);
          }
          break;
        }

        case 'portal_open': {
          if (!hasPortalSfx) {
            this.playSfx('sndPortalOpen', event.x, event.y, {
              listenerX,
              listenerY,
              volume: 1.0,
            });
          }
          break;
        }

        case 'area_change': {
          this.radStreakCount = 0;
          if (!hasExplicitMusic) {
            this.routeContext({
              areaCode: event.areaCode,
              biome: event.biome,
              loop: event.loop,
            });
          }
          break;
        }

        case 'boss_intro': {
          if (!hasExplicitMusic) {
            const bossRoute = resolveMusicRoute({ bossId: event.bossId }, this.manifest);
            if (bossRoute.musicTrack) {
              this.playMusic(bossRoute.musicTrack);
            }
          }
          if (!hasBossIntroSfx) {
            this.playSfx('sndBossIntroIn', listenerX, listenerY, {
              listenerX,
              listenerY,
              volume: 1.0,
            });
          }
          break;
        }

        case 'level_up': {
          if (!hasLevelUpSfx) {
            this.playSfx(event.isUltra ? 'sndLevelUltra' : 'sndLevelUp', listenerX, listenerY, {
              listenerX,
              listenerY,
              volume: 1.0,
            });
          }
          break;
        }

        case 'enemy_alert': {
          this.playSfx('sndEnemyAlert', event.x, event.y, {
            listenerX,
            listenerY,
            pitchJitter: 0.1,
            volume: 0.72,
          });
          break;
        }

        case 'hit_confirm': {
          this.playSfx('sndHitConfirm', event.x, event.y, {
            listenerX,
            listenerY,
            pitchJitter: 0.05,
            pitchBase: event.killed ? 1.18 : event.crit ? 1.28 : 1.0,
            volume: event.killed || event.crit ? 0.85 : 0.62,
          });
          break;
        }

        case 'corpse_impact': {
          if (!hasCorpseSfx) {
            this.playSfx('sndCorpseImpact', event.x, event.y, {
              listenerX,
              listenerY,
              pitchJitter: 0.1,
              volume: Math.min(1, 0.55 + event.speed * 0.05),
            });
          }
          break;
        }

        case 'melee_deflect': {
          if (!hasDeflectSfx) {
            this.playSfx('sndMeleeDeflect', event.x, event.y, {
              listenerX,
              listenerY,
              pitchJitter: 0.08,
              volume: 0.9,
            });
          }
          break;
        }

        case 'ammo_empty': {
          if (!hasEmptySfx) {
            this.playSfx('sndEmpty', event.x, event.y, {
              listenerX,
              listenerY,
              pitchJitter: 0.04,
              volume: 0.88,
            });
          }
          break;
        }

        case 'player_died': {
          this.playSfx('sndPlayerDeath', listenerX, listenerY, {
            listenerX,
            listenerY,
            volume: 1.0,
          });
          this.routeContext({ screen: 'game_over' });
          break;
        }

        default:
          break;
      }
    }
  }
}
