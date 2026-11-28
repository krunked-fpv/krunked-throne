import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/contracts';
import {
  AudioEngine,
  PAUSE_DUCKING_FACTOR,
  RAD_STREAK_MAX,
  RAD_STREAK_WINDOW_MS,
  calculateSpatial,
  classifySound,
  playSynthSound,
  resolveMusicRoute,
} from '@/audio';

describe('audio: Cooldown Gating & Polyphony Caps', () => {
  it('suppresses rapid duplicate triggers within per-sound 35ms cooldown independently per key', () => {
    let now = 1000;
    const engine = new AudioEngine({
      cooldownMs: 35,
      timeProvider: () => now,
    });

    expect(engine.playSfx('sndShotgun', 0, 0)).toBe(true);
    expect(engine.getStats().suppressedByCooldown).toBe(0);

    now += 10;
    expect(engine.playSfx('sndShotgun', 0, 0)).toBe(false);
    expect(engine.getStats().suppressedByCooldown).toBe(1);

    now += 20; // +30ms total
    expect(engine.playSfx('sndShotgun', 0, 0)).toBe(false);
    expect(engine.getStats().suppressedByCooldown).toBe(2);

    // Independent sound key triggers immediately
    expect(engine.playSfx('sndPistol', 0, 0)).toBe(true);

    // Past 35ms cooldown
    now = 1040;
    expect(engine.playSfx('sndShotgun', 0, 0)).toBe(true);
    expect(engine.getStats().suppressedByCooldown).toBe(2);
  });

  it('enforces per-sound (4) and global (24) polyphony caps and prunes expired voices', () => {
    let now = 1000;
    const engine = new AudioEngine({
      maxSoundVoices: 4,
      maxGlobalVoices: 24,
      cooldownMs: 35,
      timeProvider: () => now,
    });

    for (let i = 0; i < 4; i++) {
      now += 40;
      expect(engine.playSfx('sndPopPop', 0, 0)).toBe(true);
    }
    expect(engine.getStats().activeVoices).toBe(4);

    // 5th concurrent voice for same sound key must be suppressed
    now += 40;
    expect(engine.playSfx('sndPopPop', 0, 0)).toBe(false);
    expect(engine.getStats().suppressedByPolyphony).toBe(1);

    // Fill up to 24 global voices with distinct keys
    let keyIdx = 0;
    while (engine.getStats().activeVoices < 24) {
      now += 1;
      expect(engine.playSfx(`snd_unique_${keyIdx++}`, 0, 0)).toBe(true);
    }
    expect(engine.getStats().activeVoices).toBe(24);

    // 25th global voice suppressed
    now += 1;
    expect(engine.playSfx('snd_global_overflow', 0, 0)).toBe(false);
    expect(engine.getStats().suppressedByPolyphony).toBe(2);

    // Advance past 250ms voice duration -> voices prune cleanly
    now += 500;
    expect(engine.getStats().activeVoices).toBe(0);
    expect(engine.playSfx('snd_after_prune', 0, 0)).toBe(true);
  });
});

describe('audio: Spatial Attenuation & Stereo Panning', () => {
  it('computes accurate distance attenuation, symmetric stereo pan, hard clamps, and falloff cutoff', () => {
    const falloff = 360;

    const center = calculateSpatial(0, 0, 0, 0, falloff);
    expect(center.volume).toBe(1);
    expect(center.pan).toBe(0);

    const halfLeft = calculateSpatial(-180, 0, 0, 0, falloff);
    const halfRight = calculateSpatial(180, 0, 0, 0, falloff);
    expect(halfLeft.volume).toBeCloseTo(0.5, 4);
    expect(halfRight.volume).toBeCloseTo(0.5, 4);
    expect(halfLeft.pan).toBeLessThan(0);
    expect(halfRight.pan).toBeGreaterThan(0);
    expect(halfLeft.pan + halfRight.pan).toBeCloseTo(0, 4);

    expect(calculateSpatial(-270, 0, 0, 0, falloff).pan).toBe(-1);
    expect(calculateSpatial(270, 0, 0, 0, falloff).pan).toBe(1);

    expect(calculateSpatial(360, 0, 0, 0, falloff).volume).toBe(0);
    expect(calculateSpatial(500, 0, 0, 0, falloff).volume).toBe(0);

    const engine = new AudioEngine({ falloffPx: 360 });
    expect(engine.playSfx('sndLaser', 500, 0, { listenerX: 0, listenerY: 0 })).toBe(false);
    expect(engine.playSfx('sndLaser', 120, 0, { listenerX: 0, listenerY: 0 })).toBe(true);
  });
});

describe('audio: Music Routing, Pause Ducking & Headless Fallback', () => {
  it('routes all biomes, bosses, menus, and pause ducking accurately', () => {
    const campfire = resolveMusicRoute({ screen: 'campfire' });
    expect(campfire.musicTrack).toBe('musThemeA');
    expect(campfire.ambienceTrack).toBe('amb/0');
    expect(campfire.duckingFactor).toBe(1);

    expect(resolveMusicRoute({ areaCode: '1-1', biome: 'desert' })).toMatchObject({
      musicTrack: 'mus/1',
      ambienceTrack: 'amb/1',
    });
    expect(resolveMusicRoute({ areaCode: '2-1', biome: 'sewers' })).toMatchObject({
      musicTrack: 'mus/2',
      ambienceTrack: 'amb/2',
    });
    expect(resolveMusicRoute({ areaCode: '3-1', biome: 'scrapyard' }).musicTrack).toBe('mus/3');
    expect(resolveMusicRoute({ areaCode: '4-1', biome: 'caves' }).musicTrack).toBe('mus/4');
    expect(resolveMusicRoute({ areaCode: '5-1', biome: 'frozen_city' }).musicTrack).toBe('mus/5');
    expect(resolveMusicRoute({ areaCode: '6-1', biome: 'labs' }).musicTrack).toBe('mus/6');
    expect(resolveMusicRoute({ areaCode: '7-1', biome: 'palace' }).musicTrack).toBe('mus/7');

    expect(resolveMusicRoute({ bossId: 'big_bandit' }).musicTrack).toBe('mus/Boss1');
    expect(resolveMusicRoute({ bossId: 'big_dog' }).musicTrack).toBe('mus/Boss2');
    expect(resolveMusicRoute({ bossId: 'lil_hunter' }).musicTrack).toBe('mus/Boss3');
    expect(resolveMusicRoute({ bossId: 'nuclear_throne' }).musicTrack).toBe('mus/Boss4A');
    expect(resolveMusicRoute({ bossId: 'throne_ii' }).musicTrack).toBe('mus/Boss4B');
    expect(resolveMusicRoute({ bossId: 'mom' }).musicTrack).toBe('mus/Boss5');
    expect(resolveMusicRoute({ bossId: 'hyper_crystal' }).musicTrack).toBe('mus/Boss6');
    expect(resolveMusicRoute({ areaCode: '4-?', biome: 'cursed_caves', bossId: 'hyper_crystal' }).musicTrack).toBe('mus/Boss6B');
    expect(resolveMusicRoute({ bossId: 'technomancer' }).musicTrack).toBe('mus/Boss7');
    expect(resolveMusicRoute({ bossId: 'captain' }).musicTrack).toBe('mus/Boss8');
    expect(resolveMusicRoute({ areaCode: '$$$', biome: 'crib' }).musicTrack).toBe('mus/107');
    expect(resolveMusicRoute({ areaCode: 'hq-1', biome: 'hq', loop: 1, mutant: 'fish' }).musicTrack).toBe('mus/106');
    expect(resolveMusicRoute({ areaCode: 'hq-1', biome: 'hq', loop: 1, mutant: 'rogue' }).musicTrack).toBe('mus/106b');

    const paused = resolveMusicRoute({ areaCode: '1-1', paused: true });
    expect(paused.duckingFactor).toBe(PAUSE_DUCKING_FACTOR);

    const engine = new AudioEngine();
    engine.routeContext({ screen: 'campfire' });
    expect(engine.getStats().currentMusic).toBe('musThemeA');
    expect(engine.getStats().currentAmbience).toBe('amb/0');

    engine.routeContext({ areaCode: '4-1', biome: 'caves', paused: true });
    expect(engine.getStats().currentMusic).toBe('mus/4');
    expect(engine.isPaused()).toBe(true);
    engine.setPaused(false);
    expect(engine.isPaused()).toBe(false);
  });

  it('handles SimEvent consumption, sound classification, and synth fallback cleanly in headless Node', async () => {
    const engine = new AudioEngine();
    expect(await engine.unlock()).toBe(true);

    expect(classifySound('sndShotgun')).toBe('shell');
    expect(classifySound('sndPistol')).toBe('bullet');
    expect(classifySound('sndCrossbow')).toBe('bolt');
    expect(classifySound('sndRocket')).toBe('explosive');
    expect(classifySound('sndLaser')).toBe('energy');
    expect(classifySound('sndWrench')).toBe('melee');
    expect(classifySound('sndExplosion')).toBe('explosion');

    const synth = playSynthSound(null, 'bullet');
    expect(typeof synth.stop).toBe('function');
    synth.stop();

    const events: SimEvent[] = [
      { type: 'sfx', sound: 'sndShotgun', x: 10, y: 10, pitchJitter: 0.08, volume: 1 },
      { type: 'music', track: 'mus/1', ambience: 'amb/1' },
      { type: 'portal_open', x: 40, y: 40, targetArea: '1-2' },
      { type: 'area_change', areaCode: '2-1', biome: 'sewers', loop: 0 },
      { type: 'boss_intro', bossId: 'big_bandit', name: 'BIG BANDIT', subtitle: 'KING OF THE WASTELAND' },
      { type: 'level_up', level: 2, isUltra: false },
      { type: 'player_died', cause: 'BANDIT', killerSprite: 'sprBanditIdle', areaCode: '1-1', loop: 0, kills: 5 },
    ];
    expect(() => engine.consumeEvents(events, 10, 10)).not.toThrow();
    expect(engine.getStats().currentMusic).toBe('musGameOver');
    engine.applySettings({ masterVolume: 0.5, muted: true });
    expect(engine.settings.muted).toBe(true);
  });

  it('classifies empty/alert/boss_intro/hit_confirm cues, climbs rad pickup streak pitch, and consumes additive combat hooks', () => {
    expect(classifySound('sndEmpty')).toBe('empty');
    expect(classifySound('sndUltraEmpty')).toBe('empty');
    expect(classifySound('sndEnemyAlert')).toBe('alert');
    expect(classifySound('sndBossIntro')).toBe('boss_intro');
    expect(classifySound('sndBigBanditIntro')).toBe('boss_intro');
    expect(classifySound('sndNothingStart')).toBe('boss_intro');
    expect(classifySound('sndHitConfirm')).toBe('hit_confirm');
    expect(classifySound('sndCorpseImpact')).toBe('hit');
    expect(classifySound('sndMeleeDeflect')).toBe('melee');

    let now = 2000;
    const engine = new AudioEngine({
      cooldownMs: 35,
      timeProvider: () => now,
    });

    // Rapid rad pickup streak climbs pitch monotonically and caps cleanly
    expect(engine.playSfx('sndRadPickup', 0, 0, { pitchJitter: 0 })).toBe(true);
    expect(engine.getRadStreakCount()).toBe(0);
    const pitch0 = engine.getLastPitchRate();

    let prevPitch = pitch0;
    for (let i = 1; i <= RAD_STREAK_MAX + 3; i++) {
      now += 60;
      expect(engine.playSfx('sndRadPickup', 0, 0, { pitchJitter: 0 })).toBe(true);
      const curPitch = engine.getLastPitchRate();
      if (i <= RAD_STREAK_MAX) {
        expect(curPitch).toBeGreaterThan(prevPitch);
      } else {
        expect(curPitch).toBeCloseTo(prevPitch, 5);
      }
      prevPitch = curPitch;
    }
    expect(engine.getRadStreakCount()).toBe(RAD_STREAK_MAX);

    // Idle gap beyond RAD_STREAK_WINDOW_MS resets rad streak back to 0
    now += RAD_STREAK_WINDOW_MS + 50;
    expect(engine.playSfx('sndRadPickup', 0, 0, { pitchJitter: 0 })).toBe(true);
    expect(engine.getRadStreakCount()).toBe(0);
    expect(engine.getLastPitchRate()).toBeCloseTo(1.0, 5);

    // Additive combat hooks (from @encounters) trigger voices cleanly without throwing
    now += 100;
    const extendedEvents = [
      { type: 'enemy_alert', entityId: 7, x: 40, y: 10, defId: 'bandit' },
      { type: 'hit_confirm', x: 30, y: 10, damage: 12, killed: true, crit: true },
      { type: 'corpse_impact', x: 25, y: 12, speed: 7.5, killed: false },
      { type: 'melee_deflect', x: 12, y: 8, angle: 0.4 },
      { type: 'ammo_empty', x: 0, y: 0, ammoType: 'shell' },
    ] as unknown as SimEvent[];
    const beforeVoices = engine.getStats().activeVoices;
    expect(() => engine.consumeEvents(extendedEvents, 0, 0)).not.toThrow();
    expect(engine.getStats().activeVoices).toBeGreaterThan(beforeVoices);
  });

  it('wires a master dynamics compressor limiter when supported by AudioContext', () => {
    const connected: Array<{ from: string; to: string }> = [];
    const makeParam = () => ({
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      cancelScheduledValues: () => {},
    });
    const makeNode = (tag: string) => ({
      tag,
      gain: makeParam(),
      threshold: makeParam(),
      knee: makeParam(),
      ratio: makeParam(),
      attack: makeParam(),
      release: makeParam(),
      connect(dest: { tag?: string }) {
        connected.push({ from: tag, to: dest.tag ?? 'destination' });
      },
    });
    let gainIdx = 0;
    const mockCtx = {
      state: 'running',
      currentTime: 0,
      destination: { tag: 'destination' },
      createGain: () => makeNode(`gain_${gainIdx++}`),
      createDynamicsCompressor: () => makeNode('limiter'),
    } as unknown as AudioContext;

    const engine = new AudioEngine({ context: mockCtx });
    expect(engine.getStats().unlocked).toBe(true);
    // gain_0 = masterGain -> destination; limiter -> gain_0; sfx/music/ambience -> limiter
    expect(connected).toContainEqual({ from: 'limiter', to: 'gain_0' });
    expect(connected).toContainEqual({ from: 'gain_1', to: 'limiter' });
    engine.dispose();
  });
});
