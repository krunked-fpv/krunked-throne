import { describe, expect, it, vi } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  type AssetManifest,
  type SimEvent,
  type SimState,
} from '@/contracts';
import {
  AudioEngine,
  DEFAULT_COOLDOWN_MS,
  PAUSE_DUCKING_FACTOR,
  RAD_COOLDOWN_MS,
  classifySound,
  resolveMusicRoute,
  resolveSynthAmbienceKind,
  resolveSynthMusicTheme,
} from '@/audio';
import { createFallbackBundle } from '@/assets';
import { ENEMIES, MUTANTS, WEAPONS } from '@/data';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEYBINDINGS,
  InputManager,
  clientToLogicalCanvas,
  type GamepadLike,
} from '@/input';
import { CameraController } from '@/render';
import { MenuSystem, createDefaultSaveData, type MenuRenderContext } from '@/ui';
import { GameApp } from '@/app';
import { parseNttObjectsHtml, parseNttScriptingHtml } from '../tools/oracle-dump';

function makeSteamLikeManifest(): AssetManifest {
  const base = createFallbackBundle().manifest;
  return {
    ...base,
    sourceMode: 'steam',
    music: {
      'mus/ThemeA': 'audio/mus/ThemeA.ogg',
      'mus/ThemeB': 'audio/mus/ThemeB.ogg',
      'mus/Credits': 'audio/mus/Credits.ogg',
      'mus/BossDead': 'audio/mus/BossDead.ogg',
      'mus/Boss1': 'audio/mus/Boss1.ogg',
      'mus/Boss2': 'audio/mus/Boss2.ogg',
      'mus/Boss3': 'audio/mus/Boss3.ogg',
      'mus/Boss4A': 'audio/mus/Boss4A.ogg',
      'mus/Boss4B': 'audio/mus/Boss4B.ogg',
      'mus/Boss4Silence': 'audio/mus/Boss4Silence.ogg',
      'mus/Boss5': 'audio/mus/Boss5.ogg',
      'mus/1': 'audio/mus/1.ogg',
      'mus/1b': 'audio/mus/1b.ogg',
      'mus/2': 'audio/mus/2.ogg',
      'mus/3': 'audio/mus/3.ogg',
      'mus/3b': 'audio/mus/3b.ogg',
      'mus/4': 'audio/mus/4.ogg',
      'mus/5': 'audio/mus/5.ogg',
      'mus/5b': 'audio/mus/5b.ogg',
      'mus/6': 'audio/mus/6.ogg',
      'mus/7': 'audio/mus/7.ogg',
      'mus/7b': 'audio/mus/7b.ogg',
      'mus/100': 'audio/mus/100.ogg',
      'mus/100b': 'audio/mus/100b.ogg',
      'mus/101': 'audio/mus/101.ogg',
      'mus/102': 'audio/mus/102.ogg',
      'mus/103': 'audio/mus/103.ogg',
      'mus/104': 'audio/mus/104.ogg',
      'mus/105': 'audio/mus/105.ogg',
      'mus/106': 'audio/mus/106.ogg',
      'mus/106b': 'audio/mus/106b.ogg',
    },
    ambience: {
      'amb/0': 'audio/amb/0.ogg',
      'amb/1': 'audio/amb/1.ogg',
      'amb/2': 'audio/amb/2.ogg',
      'amb/3': 'audio/amb/3.ogg',
      'amb/4': 'audio/amb/4.ogg',
      'amb/5': 'audio/amb/5.ogg',
      'amb/6': 'audio/amb/6.ogg',
      'amb/7': 'audio/amb/7.ogg',
      'amb/100': 'audio/amb/100.ogg',
      'amb/101': 'audio/amb/101.ogg',
      'amb/102': 'audio/amb/102.ogg',
      'amb/103': 'audio/amb/103.ogg',
      'amb/104': 'audio/amb/104.ogg',
      'amb/105': 'audio/amb/105.ogg',
      'amb/106': 'audio/amb/106.ogg',
    },
    sounds: {
      sndPortalOpen: { id: 1, name: 'sndPortalOpen', flags: 0, file: 'sndPortalOpen', volume: 0.9, pitch: 1, groupId: 0, audioId: 1, sourceType: 'audo-wav', path: 'audio/audo/1.wav' },
      sndPortalClose: { id: 2, name: 'sndPortalClose', flags: 0, file: 'sndPortalClose', volume: 1.0, pitch: 1, groupId: 0, audioId: 2, sourceType: 'audo-wav', path: 'audio/audo/2.wav' },
      sndBossIntroIn: { id: 3, name: 'sndBossIntroIn', flags: 0, file: 'sndBossIntroIn', volume: 1.0, pitch: 1, groupId: 0, audioId: 3, sourceType: 'audo-wav', path: 'audio/audo/3.wav' },
      sndHPPickup: { id: 4, name: 'sndHPPickup', flags: 0, file: 'sndHPPickup', volume: 0.8, pitch: 1, groupId: 0, audioId: 4, sourceType: 'audo-wav', path: 'audio/audo/4.wav' },
      sndMeleeFlip: { id: 5, name: 'sndMeleeFlip', flags: 0, file: 'sndMeleeFlip', volume: 1.0, pitch: 1, groupId: 0, audioId: 5, sourceType: 'audo-wav', path: 'audio/audo/5.wav' },
      sndImpWristHit: { id: 6, name: 'sndImpWristHit', flags: 0, file: 'sndImpWristHit', volume: 1.0, pitch: 1, groupId: 0, audioId: 6, sourceType: 'audo-wav', path: 'audio/audo/6.wav' },
      sndHitFlesh: { id: 7, name: 'sndHitFlesh', flags: 0, file: 'sndHitFlesh', volume: 0.65, pitch: 1, groupId: 0, audioId: 7, sourceType: 'audo-wav', path: 'audio/audo/7.wav' },
    },
  };
}

function makeMockAudioContext(initialState: AudioContextState = 'running') {
  let state: AudioContextState = initialState;
  const gainNodes: Array<{
    tag: string;
    gain: {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const startedBuffers: Array<{ loop: boolean; playbackRate: number; stop: ReturnType<typeof vi.fn> }> = [];
  const suspendSpy = vi.fn(async () => {
    state = 'suspended';
  });
  const resumeSpy = vi.fn(async () => {
    state = 'running';
  });

  const makeParam = (init = 1) => ({
    value: init,
    setValueAtTime: vi.fn((v: number) => {
      param.value = v;
    }),
    linearRampToValueAtTime: vi.fn((v: number) => {
      param.value = v;
    }),
    exponentialRampToValueAtTime: vi.fn((v: number) => {
      param.value = v;
    }),
    cancelScheduledValues: vi.fn(),
  });
  let param = makeParam(1);

  const ctx = {
    get state() {
      return state;
    },
    currentTime: 1.0,
    sampleRate: 44100,
    destination: { tag: 'destination' },
    suspend: suspendSpy,
    resume: resumeSpy,
    createGain: () => {
      const p = {
        value: 1,
        setValueAtTime: vi.fn(function (this: { value: number }, v: number) {
          this.value = v;
        }),
        linearRampToValueAtTime: vi.fn(function (this: { value: number }, v: number) {
          this.value = v;
        }),
        exponentialRampToValueAtTime: vi.fn(function (this: { value: number }, v: number) {
          this.value = v;
        }),
        cancelScheduledValues: vi.fn(),
      };
      const node = {
        tag: `gain_${gainNodes.length}`,
        gain: p,
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gainNodes.push(node);
      return node;
    },
    createDynamicsCompressor: () => ({
      threshold: makeParam(-9),
      knee: makeParam(12),
      ratio: makeParam(6),
      attack: makeParam(0.003),
      release: makeParam(0.12),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createStereoPanner: () => ({
      pan: makeParam(0),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBufferSource: () => {
      const stop = vi.fn();
      const rec = {
        buffer: null as AudioBuffer | null,
        loop: false,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => {
          startedBuffers.push({ loop: rec.loop, playbackRate: rec.playbackRate.value, stop });
        }),
        stop,
      };
      return rec;
    },
    createBuffer: (_ch: number, len: number) => ({
      duration: len / 44100,
      getChannelData: () => new Float32Array(len),
    }),
    decodeAudioData: vi.fn(async () => ({ duration: 2.5 } as unknown as AudioBuffer)),
  } as unknown as AudioContext;

  return { ctx, gainNodes, startedBuffers, suspendSpy, resumeSpy };
}

function makeFakeCanvas() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const classSet = new Set<string>();
  const ctx2d = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  const canvas = {
    width: LOGICAL_WIDTH_4_3,
    height: LOGICAL_HEIGHT,
    tabIndex: 0,
    style: { width: '640px', height: '480px' },
    parentElement: null,
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force === undefined) {
          if (classSet.has(name)) classSet.delete(name);
          else classSet.add(name);
        } else if (force) {
          classSet.add(name);
        } else {
          classSet.delete(name);
        }
      },
      contains: (name: string) => classSet.has(name),
    },
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
    focus: vi.fn(),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  } as unknown as HTMLCanvasElement;

  return { canvas, listeners, classSet };
}

describe('parity-app-audio: Sound Classifier 1:1 Nuclear Throne Fidelity', () => {
  it('classifies Ultra weapons, UI hover/swap/confirm, enemy hurts/deaths, flame, abilities, and procs accurately', () => {
    // Ultra weapons MUST play true weapon sounds, never the 5-note level_up fanfare!
    expect(classifySound('sndUltraCrossbow')).toBe('bolt');
    expect(classifySound('sndUltraGrenade')).toBe('explosive');
    expect(classifySound('sndUltraLaser')).toBe('energy');
    expect(classifySound('sndUltraPistol')).toBe('bullet');
    expect(classifySound('sndUltraShotgun')).toBe('shell');
    expect(classifySound('sndUltraShovel')).toBe('melee');

    // UI cues & weapon swaps MUST NEVER sound like pistol bullets
    expect(classifySound('sndHover')).toBe('ui_click');
    expect(classifySound('sndClick')).toBe('ui_click');
    expect(classifySound('sndClickBack')).toBe('ui_click');
    expect(classifySound('sndSwapPistol')).toBe('ui_click');
    expect(classifySound('sndMenuBSkin')).toBe('ui_click');
    expect(classifySound('sndMenuCrown')).toBe('ui_click');
    expect(classifySound('sndMenuGoldwep')).toBe('ui_click');
    for (let i = 1; i <= 12; i++) {
      expect(classifySound(`sndMutant${i}Cnfm`)).toBe('ui_click');
      expect(classifySound(`sndMutant${i}Slct`)).toBe('ui_click');
      expect(classifySound(`sndMutant${i}LowH`)).toBe('low_hp');
    }

    // Special enemy death/hurt edge cases
    expect(classifySound('sndRadMaggotDie')).toBe('death');
    expect(classifySound('sndExploFreakHurt')).toBe('hit');
    expect(classifySound('sndExploGuardianHurt')).toBe('hit');
    expect(classifySound('sndExploFreakDead')).toBe('explosion');
    expect(classifySound('sndExploGuardianDead')).toBe('explosion');

    // Mutation & proc cues
    expect(classifySound('sndMutLuckyShot')).toBe('pickup');
    expect(classifySound('sndBloodlustProc')).toBe('pickup');
    expect(classifySound('sndMutAppear')).toBe('level_up');
    expect(classifySound('sndLevelUltra')).toBe('level_up');
    expect(classifySound('sndBossWin')).toBe('level_up');

    // Flame, Explosive launchers, Energy shields/loops, Abilities, Telegraphs & Deflects
    expect(classifySound('sndFlameCannon')).toBe('flame');
    expect(classifySound('sndDragonStart')).toBe('flame');
    expect(classifySound('sndIncinerator')).toBe('flame');
    expect(classifySound('sndFireShotgun')).toBe('shell'); // Shotgun keeps shell boom
    expect(classifySound('sndClusterLauncher')).toBe('explosive');
    expect(classifySound('sndToxicLauncher')).toBe('explosive');
    expect(classifySound('sndHeavyNader')).toBe('explosive');
    expect(classifySound('sndCrystalShield')).toBe('energy');
    expect(classifySound('sndEyesLoop')).toBe('energy');
    expect(classifySound('sndHorrorLoop')).toBe('energy');
    expect(classifySound('sndCrystalRicochet')).toBe('melee');
    expect(classifySound('sndShielderDeflect')).toBe('melee');
    expect(classifySound('sndRoll')).toBe('ability');
    expect(classifySound('sndRobotEat')).toBe('ability');
    expect(classifySound('sndPlantSnare')).toBe('ability');
    expect(classifySound('sndSpawnAlly')).toBe('ability');
    expect(classifySound('sndSniperTarget')).toBe('alert');
    expect(classifySound('sndSnowTankPreShoot')).toBe('alert');
    expect(classifySound('sndNothingBeamWarn')).toBe('alert');
    expect(classifySound('sndBossIntroIn')).toBe('boss_intro');
    expect(classifySound('sndPortalOpen')).toBe('portal');
    expect(classifySound('sndPortalClose')).toBe('portal');
    expect(classifySound('sndHPPickup')).toBe('pickup');

    // Every single weapon, mutant, and enemy in static registries classifies cleanly
    for (const w of Object.values(WEAPONS)) {
      const kind = classifySound(w.fireSound);
      expect(kind).not.toBe('level_up');
      expect(kind).not.toBe('ui_click');
    }
    for (const m of Object.values(MUTANTS)) {
      expect(classifySound(m.sounds.hurt)).toBe('hit');
      expect(classifySound(m.sounds.dead)).toBe('death');
      expect(classifySound(m.sounds.confirm)).toBe('ui_click');
    }
    for (const e of Object.values(ENEMIES)) {
      expect(classifySound(e.sounds.hurt)).toBe('hit');
      expect(['death', 'explosion']).toContain(classifySound(e.sounds.dead));
    }
  });
});

describe('parity-app-audio: Music & Ambience Routing (Steam + Synth + Loop B-Tracks + Boss States)', () => {
  it('resolves exact NT Steam keys for Title, Options, Vault, all 5 Secrets, HQ, Throne, Victory & Game Over', () => {
    const steam = makeSteamLikeManifest();

    // Title & Campfire MUST pick mus/ThemeA, NEVER Crown Vault mus/100!
    expect(resolveMusicRoute({ screen: 'title' }, steam)).toMatchObject({
      musicTrack: 'mus/ThemeA',
      ambienceTrack: 'amb/0',
    });
    expect(resolveMusicRoute({ screen: 'campfire' }, steam)).toMatchObject({
      musicTrack: 'mus/ThemeA',
      ambienceTrack: 'amb/0',
    });
    // Options opened from Title/Campfire (no active run) stays on Title music, NOT Desert mus/1!
    expect(resolveMusicRoute({ screen: 'options' }, steam)).toMatchObject({
      musicTrack: 'mus/ThemeA',
      ambienceTrack: 'amb/0',
    });
    expect(resolveMusicRoute({ screen: 'victory' }, steam).musicTrack).toBe('mus/Credits');
    expect(resolveMusicRoute({ screen: 'game_over' }, steam).musicTrack).toBe('mus/BossDead');

    // Vault, all 5 Secret Biomes, and IDPD HQ match authentic NT track IDs
    expect(resolveMusicRoute({ areaCode: 'vault', biome: 'vault' }, steam)).toMatchObject({
      musicTrack: 'mus/100',
      ambienceTrack: 'amb/100',
    });
    expect(resolveMusicRoute({ areaCode: '1-?', biome: 'oasis' }, steam)).toMatchObject({
      musicTrack: 'mus/101',
      ambienceTrack: 'amb/101',
    });
    expect(resolveMusicRoute({ areaCode: '2-?', biome: 'pizza_sewers' }, steam)).toMatchObject({
      musicTrack: 'mus/102',
      ambienceTrack: 'amb/102',
    });
    expect(resolveMusicRoute({ areaCode: '3-?', biome: 'mansion' }, steam)).toMatchObject({
      musicTrack: 'mus/103',
      ambienceTrack: 'amb/103',
    });
    expect(resolveMusicRoute({ areaCode: '4-?', biome: 'cursed_caves' }, steam)).toMatchObject({
      musicTrack: 'mus/104',
      ambienceTrack: 'amb/104',
    });
    expect(resolveMusicRoute({ areaCode: '5-?', biome: 'jungle' }, steam)).toMatchObject({
      musicTrack: 'mus/105',
      ambienceTrack: 'amb/105',
    });
    expect(resolveMusicRoute({ areaCode: 'hq-1', biome: 'hq' }, steam)).toMatchObject({
      musicTrack: 'mus/106',
      ambienceTrack: 'amb/106',
    });

    // 7-3 before waking The Throne -> mus/Boss4Silence; awake -> mus/Boss4A; Loop 1 -> mus/Boss4B; defeated -> mus/BossDead
    expect(resolveMusicRoute({ areaCode: '7-3', biome: 'palace', bossId: null }, steam).musicTrack).toBe(
      'mus/Boss4Silence',
    );
    expect(
      resolveMusicRoute({ areaCode: '7-3', biome: 'palace', bossId: 'nuclear_throne', loop: 0 }, steam).musicTrack,
    ).toBe('mus/Boss4A');
    expect(
      resolveMusicRoute({ areaCode: '7-3', biome: 'palace', bossId: 'nuclear_throne', loop: 1 }, steam).musicTrack,
    ).toBe('mus/Boss4B');
    expect(
      resolveMusicRoute({ areaCode: '7-3', biome: 'palace', bossId: null, bossDefeated: true }, steam).musicTrack,
    ).toBe('mus/BossDead');

    // Loop 1 B-side biome tracks
    expect(resolveMusicRoute({ areaCode: '1-1', biome: 'desert', loop: 1 }, steam).musicTrack).toBe('mus/1b');
    expect(resolveMusicRoute({ areaCode: '3-1', biome: 'scrapyard', loop: 1 }, steam).musicTrack).toBe('mus/3b');
    expect(resolveMusicRoute({ areaCode: '5-1', biome: 'frozen_city', loop: 1 }, steam).musicTrack).toBe('mus/5b');
    expect(resolveMusicRoute({ areaCode: '7-1', biome: 'palace', loop: 1 }, steam).musicTrack).toBe('mus/7b');
    expect(resolveMusicRoute({ areaCode: 'vault', biome: 'vault', loop: 1 }, steam).musicTrack).toBe('mus/100b');
    expect(resolveMusicRoute({ areaCode: 'hq-1', biome: 'hq', loop: 1 }, steam).musicTrack).toBe('mus/106b');
  });

  it('maps numeric NT 100..106 & boss silence/dead keys accurately in SynthMusicSequencer', () => {
    expect(resolveSynthMusicTheme('mus/100')).toBe('caves');
    expect(resolveSynthMusicTheme('mus/101')).toBe('desert');
    expect(resolveSynthMusicTheme('mus/102')).toBe('sewers');
    expect(resolveSynthMusicTheme('mus/103')).toBe('scrapyard');
    expect(resolveSynthMusicTheme('mus/104')).toBe('caves');
    expect(resolveSynthMusicTheme('mus/105')).toBe('frozen');
    expect(resolveSynthMusicTheme('mus/106')).toBe('palace');
    expect(resolveSynthMusicTheme('mus/BossDead')).toBe('boss_dead');
    expect(resolveSynthMusicTheme('mus/Boss4Silence')).toBe('boss_dead');

    expect(resolveSynthAmbienceKind('amb/100')).toBe('palace');
    expect(resolveSynthAmbienceKind('amb/101')).toBe('desert');
    expect(resolveSynthAmbienceKind('amb/102')).toBe('subterranean');
    expect(resolveSynthAmbienceKind('amb/103')).toBe('scrapyard');
    expect(resolveSynthAmbienceKind('amb/104')).toBe('caves');
    expect(resolveSynthAmbienceKind('amb/105')).toBe('frozen');
    expect(resolveSynthAmbienceKind('amb/106')).toBe('labs');
  });
});

describe('parity-app-audio: AudioEngine Cooldown, Deduplication, Steam Unlock & Pause/Background Ducking', () => {
  it('allows 30 Hz 1-tick rapid fire (DEFAULT_COOLDOWN_MS < 33.3ms) and 15ms rad vacuum streaks', () => {
    expect(DEFAULT_COOLDOWN_MS).toBeLessThan(33);
    expect(RAD_COOLDOWN_MS).toBeLessThanOrEqual(16);

    let now = 1000;
    const engine = new AudioEngine({ timeProvider: () => now, maxSoundVoices: 8 });
    // Consecutive 30 Hz ticks (33.33ms apart) for Minigun must NEVER drop every second shot
    for (let i = 0; i < 4; i++) {
      expect(engine.playSfx('sndMinigun', 0, 0)).toBe(true);
      now += 33.4;
    }
    expect(engine.getStats().suppressedByCooldown).toBe(0);

    // Dense rad pickups at 16ms spacing climb cleanly without cooldown drop
    now += 300;
    expect(engine.playSfx('sndRadPickup', 0, 0, { pitchJitter: 0 })).toBe(true);
    now += 16;
    expect(engine.playSfx('sndRadPickup', 0, 0, { pitchJitter: 0 })).toBe(true);
    expect(engine.getRadStreakCount()).toBe(1);
    engine.dispose();
  });

  it('deduplicates companion semantic+sfx pairs in consumeEvents and preserves ambience on boss_intro', () => {
    let now = 5000;
    const engine = new AudioEngine({ timeProvider: () => now });
    engine.routeContext({ areaCode: '3-3', biome: 'scrapyard' });
    expect(engine.getStats().currentAmbience).toBe('amb/3');

    const batch: SimEvent[] = [
      { type: 'boss_intro', bossId: 'big_dog', name: 'BIG DOG', subtitle: 'GUARDIAN' },
      { type: 'sfx', sound: 'sndBigDogIntro', x: 0, y: 0 },
      { type: 'portal_open', x: 10, y: 10, targetArea: '4-1' },
      { type: 'sfx', sound: 'sndPortalOpen', x: 10, y: 10 },
      { type: 'level_up', level: 10, isUltra: true },
      { type: 'sfx', sound: 'sndLevelUltra', x: 0, y: 0 },
      { type: 'melee_deflect', x: 5, y: 5, angle: 0 },
      { type: 'sfx', sound: 'sndMeleeFlip', x: 5, y: 5 },
      { type: 'ammo_empty', x: 0, y: 0, ammoType: 'bullet' },
      { type: 'sfx', sound: 'sndEmpty', x: 0, y: 0 },
    ];
    engine.consumeEvents(batch, 0, 0);

    // Exactly 5 voices (one per explicit SFX), ZERO duplicate fallback cues!
    expect(engine.getStats().activeVoices).toBe(5);
    // Boss music started AND Scrapyard ambience preserved (never clobbered by boss_intro!)
    expect(engine.getStats().currentMusic).toBe('mus/Boss2');
    expect(engine.getStats().currentAmbience).toBe('amb/3');
    engine.dispose();
  });

  it('resolves Steam SOND aliases, ducks both music & ambience click-free on pause, and suspends/resumes on tab visibility', async () => {
    const steam = makeSteamLikeManifest();
    const { ctx, gainNodes, startedBuffers, suspendSpy, resumeSpy } = makeMockAudioContext('suspended');

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    })) as unknown as typeof fetch;

    try {
      const engine = new AudioEngine({ context: ctx, manifest: steam });
      expect(engine.resolveManifestSoundKey('sndPortal')).toBe('sndPortalOpen');
      expect(engine.resolveManifestSoundKey('sndPortalEnter')).toBe('sndPortalClose');
      expect(engine.resolveManifestSoundKey('sndBossIntro')).toBe('sndBossIntroIn');
      expect(engine.resolveManifestSoundKey('sndHealthPickup')).toBe('sndHPPickup');
      expect(engine.resolveManifestSoundKey('sndMeleeDeflect')).toBe('sndMeleeFlip');
      expect(engine.resolveManifestSoundKey('sndCorpseImpact')).toBe('sndImpWristHit');

      // Queue Steam music while suspended -> unlock() must actually start the Steam buffer!
      engine.playMusic('mus/ThemeA', 0.2);
      engine.playAmbience('amb/0', 0.2);
      await Promise.resolve();
      await Promise.resolve();
      expect(startedBuffers.length).toBe(0); // waited for unlock

      expect(await engine.unlock()).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(startedBuffers.length).toBe(2); // music + ambience both started seamlessly on unlock!

      // Pause ducking anchors current value and ramps BOTH musicDuckingGain (idx 3) & ambienceDuckingGain (idx 5)
      engine.setPaused(true);
      const musicDuck = gainNodes[3]!;
      const ambDuck = gainNodes[5]!;
      expect(musicDuck.gain.setValueAtTime).toHaveBeenCalled();
      expect(musicDuck.gain.linearRampToValueAtTime).toHaveBeenCalledWith(PAUSE_DUCKING_FACTOR, expect.any(Number));
      expect(ambDuck.gain.setValueAtTime).toHaveBeenCalled();
      expect(ambDuck.gain.linearRampToValueAtTime).toHaveBeenCalledWith(PAUSE_DUCKING_FACTOR, expect.any(Number));

      // Background tab suspend & resume
      engine.setBackgroundSuspended(true);
      expect(engine.isBackgroundSuspended()).toBe(true);
      expect(suspendSpy).toHaveBeenCalledTimes(1);
      engine.setBackgroundSuspended(false);
      expect(engine.isBackgroundSuspended()).toBe(false);
      expect(resumeSpy).toHaveBeenCalledTimes(2); // unlock + visibility resume

      engine.dispose();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('parity-app-audio: Input Buffering, Escape Keybind Cancel, Menu Latch Isolation & Aim Accuracy', () => {
  it('cancels keybind capture on FIRST Escape press without leaving Options (#16 P0 #1)', () => {
    const bundle = createFallbackBundle();
    const menus = new MenuSystem(bundle);
    const save = createDefaultSaveData();
    const input = new InputManager(DEFAULT_KEYBINDINGS, { controls: save.controls });
    input.setGameplayActive(false);

    input.beginKeyCapture();
    expect(input.isCapturingKey()).toBe(true);

    // Single Escape press cancels capture AND emits menuBack so MenuSystem emits cancel_rebind immediately
    input.simulateKeyDown('Escape');
    expect(input.isCapturingKey()).toBe(false);

    const snap = input.consumeMenuInput();
    expect(snap.back).toBe(true);
    expect(snap.capturedKeyCode).toBeUndefined();

    const optCtx: MenuRenderContext = {
      screen: 'options',
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
      rebindingField: 'up',
    };
    const actions = menus.update(snap, optCtx);
    expect(actions.some((a) => a.type === 'cancel_rebind')).toBe(true);
    expect(actions.some((a) => a.type === 'open_screen')).toBe(false);
  });

  it('prevents gameplay keys/clicks from leaking stale menu latches into Mutation Select or Game Over', () => {
    const input = new InputManager(DEFAULT_KEYBINDINGS);
    input.setGameplayActive(true);

    // Active combat inputs: shooting, Space active, WASD movement, R, Digit1
    input.simulateMouseButton(0, true);
    input.simulateKeyDown('Space');
    input.simulateKeyDown('KeyW');
    input.simulateKeyDown('KeyR');
    input.simulateKeyDown('Digit1');

    // Transition immediately to menu (e.g. mutation_select or game_over)
    input.setGameplayActive(false);
    const menuSnap = input.consumeMenuInput();
    expect(menuSnap.confirm).toBe(false);
    expect(menuSnap.pointer.clicked).toBe(false);
    expect(menuSnap.navUp).toBe(false);
    expect(menuSnap.retry).toBe(false);
    expect(menuSnap.selectIndex).toBeUndefined();
  });

  it('preserves fire/active/swap/pickup latches across hitstop ticks while honoring immediate pause', () => {
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 120);

    const input = new InputManager(DEFAULT_KEYBINDINGS);
    input.setGameplayActive(true);

    // Player clicks fire + presses swap + pickup during hitstop freeze
    input.simulateMouseButton(0, true);
    input.simulateMouseButton(0, false);
    input.simulateKeyDown('KeyQ');
    input.simulateKeyDown('KeyE');

    // Hitstop tick checks pause only -> must NOT consume gameplay latches!
    expect(input.consumePauseOnly()).toBe(false);

    // Next active post-hitstop tick receives EVERY buffered press!
    const frame = input.consumeSimInput(cam, 160, 120);
    expect(frame.firePressed).toBe(true);
    expect(frame.swapPressed).toBe(true);
    expect(frame.pickupPressed).toBe(true);

    // Pause during hitstop is honored immediately
    input.simulateKeyDown('Escape');
    expect(input.consumePauseOnly()).toBe(true);
  });

  it('guards rebound KeyP/KeyR, debounces wheel inertia, ignores sub-2px gamepad cursor jitter, and updates 120Hz aim cleanly', () => {
    let now = 1000;
    let pads: Array<GamepadLike | null> = [];
    const input = new InputManager(
      { ...DEFAULT_KEYBINDINGS, pickup: 'KeyP', swap: 'KeyR' },
      {
        controls: { ...DEFAULT_CONTROL_SETTINGS },
        nowMs: () => now,
        getGamepads: () => pads,
      },
    );
    const { canvas, listeners } = makeFakeCanvas();
    input.attach(canvas);
    input.setGameplayActive(true);

    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 120);

    // Rebound KeyP = pickup (NOT pause!), KeyR = swap (NOT retry!)
    input.simulateKeyDown('KeyP');
    input.simulateKeyDown('KeyR');
    const f1 = input.consumeSimInput(cam, 160, 120);
    expect(f1.pickupPressed).toBe(true);
    expect(f1.pausePressed).toBe(false);
    expect(f1.swapPressed).toBe(true);
    expect(input.consumeRetryPressed()).toBe(false);

    // Wheel debounce: rapid inertia tick 30ms later suppressed; intentional tick 100ms later triggers
    listeners.get('wheel')?.[0]?.({ deltaY: 120, preventDefault: () => {} });
    expect(input.consumeSimInput(cam, 160, 120).swapPressed).toBe(true);
    now += 30;
    listeners.get('wheel')?.[0]?.({ deltaY: 120, preventDefault: () => {} });
    expect(input.consumeSimInput(cam, 160, 120).swapPressed).toBe(false);
    now += 90;
    listeners.get('wheel')?.[0]?.({ deltaY: -120, preventDefault: () => {} });
    expect(input.consumeSimInput(cam, 160, 120).swapPressed).toBe(true);

    // Enter gamepad mode via poll, then dispatch a 1px synthetic pointermove -> stays in gamepad mode!
    pads = [
      {
        index: 0,
        id: 'Xbox Wireless Controller',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0.9, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      },
    ];
    input.pollGamepad();
    expect(input.getInputMode()).toBe('gamepad');

    // Smooth 120Hz presentation aim reflects interpolated player position immediately
    const aimA = input.updatePresentationAim(cam, 160, 120);
    const aimB = input.updatePresentationAim(cam, 164, 120);
    expect(aimB.x).toBeGreaterThan(aimA.x);

    // Exact client -> logical aim accuracy across arbitrary aspect/letterbox rects (4:3 & 16:9)
    const rectWide = { left: 100, top: 50, width: 1278, height: 720 };
    const topLeft = clientToLogicalCanvas(100, 50, rectWide, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    const center = clientToLogicalCanvas(100 + 639, 50 + 360, rectWide, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    const botRight = clientToLogicalCanvas(100 + 1278, 50 + 720, rectWide, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    expect(topLeft).toEqual({ x: 0, y: 0 });
    expect(center.x).toBeCloseTo(LOGICAL_WIDTH_16_9 * 0.5, 4);
    expect(center.y).toBeCloseTo(LOGICAL_HEIGHT * 0.5, 4);
    expect(botRight).toEqual({ x: LOGICAL_WIDTH_16_9, y: LOGICAL_HEIGHT });

    // Rescaling logical size 4:3 -> 16:9 preserves proportional crosshair position
    input.simulateMouseMoveLogical(LOGICAL_WIDTH_4_3 * 0.5, LOGICAL_HEIGHT * 0.5);
    input.setLogicalSize(LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    expect(input.getPointerLogical().x).toBeCloseTo(LOGICAL_WIDTH_16_9 * 0.5, 3);

    input.detach();
  });
});

describe('parity-app-audio: GameApp Loop Integration, Sleeping Boss Music, Cursor & Oracle Tooling', () => {
  it('syncs sleeping bosses, Options music, KBM hide-cursor, Crown of Destiny frame-0 phase, and warp snapshot reset', async () => {
    const { canvas, classSet } = makeFakeCanvas();
    const app = new GameApp(canvas);
    await app.init();

    // Access internals for headless verification without requiring DOM rAF loop
    const internal = app as unknown as {
      simState: SimState | null;
      audio: AudioEngine;
      input: InputManager;
      saveManager: { getData: () => ReturnType<typeof createDefaultSaveData> };
      screen: string;
      returnScreenFromOptions: string;
      syncMusicRouting: () => void;
      handleMenuAction: (action: unknown) => void;
      tickAndRender: (dt: number, nowMs: number) => void;
      createDebugBridge: () => {
        startRun: (m?: 'fish', seed?: number, crown?: 'none' | 'destiny') => void;
        warpArea: (area: '7-3' | '3-3' | '1-1', loop?: number) => void;
        getScreen: () => string;
      };
    };

    // 1. Opening Options from Title MUST keep Title/Campfire music (never switch to Desert mus/1!)
    expect(internal.audio.getStats().currentMusic).toBe('musThemeA');
    internal.handleMenuAction({ type: 'open_screen', screen: 'options' });
    expect(internal.audio.getStats().currentMusic).toBe('musThemeA');
    expect(internal.audio.getStats().currentAmbience).toBe('amb/0');

    // 2. Starting a run sets KBM hide-cursor ON during playing and OFF during pause
    const bridge = internal.createDebugBridge();
    bridge.startRun('fish', 1337, 'none');
    internal.tickAndRender(0.016, 16);
    expect(classSet.has('hide-cursor')).toBe(true);

    internal.handleMenuAction({ type: 'open_screen', screen: 'paused' });
    internal.tickAndRender(0.016, 32);
    expect(classSet.has('hide-cursor')).toBe(false);
    expect(internal.audio.isPaused()).toBe(true);

    // Pause -> Options stays ducked!
    internal.handleMenuAction({ type: 'open_screen', screen: 'options' });
    expect(internal.audio.isPaused()).toBe(true);

    // 3. Sleeping boss on 7-3 plays Boss4Silence until woken, then Boss4, then BossDead on defeat!
    bridge.warpArea('7-3', 0);
    expect(internal.simState).not.toBeNull();
    const st = internal.simState!;
    // Verify warp snapped prevX/prevY cleanly (zero 1-frame lerp streak)
    expect(st.player.prevX).toBe(st.player.x);
    expect(st.player.prevY).toBe(st.player.y);

    // Simulate sleeping Throne entity state (matches @world-ai #18 / @coordinator #22 contract)
    if (st.boss) {
      const throneEnt = st.enemies.find((e) => e.id === st.boss!.entityId);
      if (throneEnt) {
        throneEnt.aiState = 'sleep';
        internal.syncMusicRouting();
        expect(internal.audio.getStats().currentMusic).toBe('mus/Boss4Silence');

        // Wake Throne -> boss combat track
        throneEnt.aiState = 'idle';
        internal.syncMusicRouting();
        expect(internal.audio.getStats().currentMusic).toBe('mus/Boss4');

        // Defeat Throne -> BossDead wind-down
        st.boss.defeated = true;
        internal.syncMusicRouting();
        expect(internal.audio.getStats().currentMusic).toBe('mus/BossDead');
      }
    }

    // 4. Sleeping Big Dog on 3-3 keeps Scrapyard mus/3 until awake
    bridge.warpArea('3-3', 0);
    const st33 = internal.simState!;
    if (st33.boss) {
      const dogEnt = st33.enemies.find((e) => e.id === st33.boss!.entityId);
      if (dogEnt) {
        dogEnt.aiState = 'sleep';
        internal.syncMusicRouting();
        expect(internal.audio.getStats().currentMusic).toBe('mus/3');
        dogEnt.aiState = 'idle';
        internal.syncMusicRouting();
        expect(internal.audio.getStats().currentMusic).toBe('mus/Boss2');
      }
    }

    // 5. Frame-0 phase sync in startNewRun (Crown of Destiny compatibility)
    bridge.startRun('fish', 4242, 'destiny');
    expect(['playing', 'mutation_select']).toContain(bridge.getScreen());
    if (internal.simState!.phase === 'mutation_select') {
      expect(bridge.getScreen()).toBe('mutation_select');
    }

    app.destroy();
  });

  it('parses nested NTT-Objects.html and NTT-Scripting.html cleanly via tools/oracle-dump', () => {
    const sampleObjects = `
      <div id="doc">
        <div class="item">
          <span class="header">Enemies</span>
          <div class="content">
            <div class="item">
              <a class="header" id="Bandit">Bandit</a>
              <div class="content">
                <p>Desert raider enemy.</p>
                <p>Parent: <a>enemy</a></p>
                <p>Variables:</p>
                <ul><li><tt>my_health</tt></li><li><tt>raddrop</tt></li></ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const objs = parseNttObjectsHtml(sampleObjects);
    expect(objs.Bandit).toMatchObject({
      name: 'Bandit',
      parent: 'enemy',
      category: 'Enemies',
      variables: ['my_health', 'raddrop'],
    });

    const sampleScripts = `
      <div id="doc">
        <a class="header" id="sound_play">sound_play(sound)</a>
        <a class="header" id="sound_play_pitch">sound_play_pitch(sound, pitch)</a>
      </div>
    `;
    expect(parseNttScriptingHtml(sampleScripts)).toEqual([
      'sound_play(sound)',
      'sound_play_pitch(sound, pitch)',
    ]);
  });
});
