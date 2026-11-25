/**
 * Self-verification test suite for Nuclear Throne Clean-Room Audio Engine.
 * Verifies all 5 Acceptance Criteria:
 * 1. Per-sound micro-cooldown suppresses rapid duplicate triggers within 35ms.
 * 2. Per-sound polyphony cap (4) and global cap (24) prevent voice overflow.
 * 3. Distance attenuation & stereo panning compute accurate left/right pan and zero volume past falloff.
 * 4. Music/ambience state transitions & pause ducking update cleanly.
 * 5. Headless fallback works with zero uncaught errors.
 */

import {
  AudioEngine,
  calculateSpatial,
  classifySound,
  playSynthSound,
  resolveMusicRoute,
  PAUSE_DUCKING_FACTOR,
} from './index';
import type { SimEvent } from '@/contracts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('--- STARTING AUDIO ENGINE SELFTEST ---');

// ============================================================================
// TEST 1: Per-sound cooldown suppresses rapid duplicate triggers within 35ms
// ============================================================================
console.log('\n[Test 1] Verifying per-sound cooldown (35 ms)...');
{
  let mockTime = 1000;
  const engine = new AudioEngine({
    cooldownMs: 35,
    timeProvider: () => mockTime,
  });

  // First trigger should succeed
  const t1 = engine.playSfx('sndShotgun', 0, 0);
  assert(t1 === true, 'First sound trigger should succeed');
  assert(engine.getStats().suppressedByCooldown === 0, 'No cooldown suppression yet');

  // Trigger 10ms later (< 35ms) -> must be suppressed
  mockTime += 10;
  const t2 = engine.playSfx('sndShotgun', 0, 0);
  assert(t2 === false, 'Duplicate trigger at +10ms should be suppressed');
  assert(engine.getStats().suppressedByCooldown === 1, 'Suppressed count should be 1');

  // Trigger 20ms later (+30ms total from t1, < 35ms) -> must be suppressed
  mockTime += 20;
  const t3 = engine.playSfx('sndShotgun', 0, 0);
  assert(t3 === false, 'Duplicate trigger at +30ms should be suppressed');
  assert(engine.getStats().suppressedByCooldown === 2, 'Suppressed count should be 2');

  // Trigger different sound key at +30ms -> should succeed (cooldown is per-sound)
  const tDiff = engine.playSfx('sndRevolver', 0, 0);
  assert(tDiff === true, 'Different sound key should trigger independently');

  // Advance time past 35ms from t1 (+40ms from t1) -> 'sndShotgun' should now succeed
  mockTime = 1040;
  const t4 = engine.playSfx('sndShotgun', 0, 0);
  assert(t4 === true, 'Trigger after 40ms should succeed');
  assert(engine.getStats().suppressedByCooldown === 2, 'Suppressed count remains 2');

  console.log('✅ PASS: Per-sound micro-cooldown successfully suppresses rapid duplicate triggers.');
}

// ============================================================================
// TEST 2: Per-sound polyphony cap (4) and global cap (24) prevent voice overflow
// ============================================================================
console.log('\n[Test 2] Verifying per-sound polyphony cap (4) and global cap (24)...');
{
  let mockTime = 1000;
  const engine = new AudioEngine({
    maxSoundVoices: 4,
    maxGlobalVoices: 24,
    cooldownMs: 35,
    timeProvider: () => mockTime,
  });

  // Trigger 'sndPop' 4 times with 40ms intervals (> 35ms cooldown)
  for (let i = 0; i < 4; i++) {
    mockTime += 40;
    const ok = engine.playSfx('sndPop', 0, 0);
    assert(ok === true, `Trigger ${i + 1} for sndPop should succeed`);
  }

  assert(engine.getStats().activeVoices === 4, 'Active voices for sndPop should be 4');
  assert(engine.getStats().suppressedByPolyphony === 0, 'No polyphony suppression yet');

  // 5th trigger for 'sndPop' within voice lifetime -> must be suppressed by per-sound cap
  mockTime += 40;
  const ok5 = engine.playSfx('sndPop', 0, 0);
  assert(ok5 === false, '5th trigger for sndPop must be suppressed by per-sound cap');
  assert(engine.getStats().suppressedByPolyphony === 1, 'suppressedByPolyphony should be 1');

  // Test global cap (24 voices)
  // Fill up remaining voices up to 24 with distinct keys (no per-sound or cooldown collisions)
  let spawnedKeys = 0;
  while (engine.getStats().activeVoices < 24) {
    mockTime += 1;
    const key = `snd_distinct_${spawnedKeys++}`;
    const ok = engine.playSfx(key, 0, 0);
    assert(ok === true, `Spawn distinct voice ${spawnedKeys} should succeed`);
  }

  assert(engine.getStats().activeVoices === 24, 'Active voices should reach max global 24');

  // Triggering the 25th voice must be suppressed by global polyphony cap
  mockTime += 1;
  const ok25 = engine.playSfx('snd_overflow_key', 0, 0);
  assert(ok25 === false, '25th global voice must be suppressed by global cap');
  assert(engine.getStats().suppressedByPolyphony === 2, 'suppressedByPolyphony should increment to 2');

  console.log('✅ PASS: Per-sound polyphony cap (4) and global cap (24) prevent voice overflow.');
}

// ============================================================================
// TEST 3: Distance attenuation & stereo panning
// ============================================================================
console.log('\n[Test 3] Verifying distance attenuation & stereo panning...');
{
  const falloff = 360;

  // 1. Center listener (0, 0) and center sound (0, 0)
  const center = calculateSpatial(0, 0, 0, 0, falloff);
  assert(center.volume === 1.0, 'Center sound volume should be 1.0');
  assert(center.pan === 0.0, 'Center sound pan should be 0.0');

  // 2. Sound at half distance left (-180, 0)
  const halfLeft = calculateSpatial(-180, 0, 0, 0, falloff);
  assert(Math.abs(halfLeft.volume - 0.5) < 0.001, 'Half distance volume should be ~0.5');
  assert(halfLeft.pan < 0, 'Left sound pan should be negative');

  // 3. Sound at half distance right (+180, 0)
  const halfRight = calculateSpatial(180, 0, 0, 0, falloff);
  assert(Math.abs(halfRight.volume - 0.5) < 0.001, 'Half distance volume should be ~0.5');
  assert(halfRight.pan > 0, 'Right sound pan should be positive');
  assert(Math.abs(halfLeft.pan + halfRight.pan) < 0.001, 'Left and right pan magnitudes should be symmetric');

  // 4. Sound at hard left pan limit (-270, 0)
  const hardLeft = calculateSpatial(-270, 0, 0, 0, falloff);
  assert(hardLeft.pan === -1.0, 'Hard left pan should clamp to -1.0');

  // 5. Sound at hard right pan limit (+270, 0)
  const hardRight = calculateSpatial(270, 0, 0, 0, falloff);
  assert(hardRight.pan === 1.0, 'Hard right pan should clamp to +1.0');

  // 6. Sound at exactly falloff distance (360, 0)
  const atFalloff = calculateSpatial(360, 0, 0, 0, falloff);
  assert(atFalloff.volume === 0.0, 'Sound at falloff distance should have volume 0.0');

  // 7. Sound beyond falloff distance (450, 0)
  const beyondFalloff = calculateSpatial(450, 0, 0, 0, falloff);
  assert(beyondFalloff.volume === 0.0, 'Sound beyond falloff distance should have volume 0.0');

  // 8. In engine: sound beyond falloff is dropped cleanly
  const engine = new AudioEngine({ falloffPx: 360 });
  const played = engine.playSfx('sndLaser', 500, 0, { listenerX: 0, listenerY: 0 });
  assert(played === false, 'AudioEngine should drop sounds past falloff');

  console.log('✅ PASS: Distance attenuation and stereo panning compute exact values and zero volume past falloff.');
}

// ============================================================================
// TEST 4: Music/ambience state transitions & pause ducking
// ============================================================================
console.log('\n[Test 4] Verifying music/ambience state transitions & pause ducking...');
{
  // 1. Campfire screen
  const campfireRoute = resolveMusicRoute({ screen: 'campfire' });
  assert(campfireRoute.musicTrack === 'musThemeA', 'Campfire should route to musThemeA');
  assert(campfireRoute.ambienceTrack === 'amb/0', 'Campfire should route to amb/0');
  assert(campfireRoute.duckingFactor === 1.0, 'Unpaused ducking should be 1.0');

  // 2. Biomes & Areas
  const desertRoute = resolveMusicRoute({ areaCode: '1-1', biome: 'desert' });
  assert(desertRoute.musicTrack === 'mus/1', 'Desert should route to mus/1');
  assert(desertRoute.ambienceTrack === 'amb/1', 'Desert ambience should be amb/1');

  const sewersRoute = resolveMusicRoute({ areaCode: '2-1', biome: 'sewers' });
  assert(sewersRoute.musicTrack === 'mus/2', 'Sewers should route to mus/2');
  assert(sewersRoute.ambienceTrack === 'amb/2', 'Sewers ambience should be amb/2');

  const scrapyardRoute = resolveMusicRoute({ areaCode: '3-1', biome: 'scrapyard' });
  assert(scrapyardRoute.musicTrack === 'mus/3', 'Scrapyard should route to mus/3');

  const cavesRoute = resolveMusicRoute({ areaCode: '4-1', biome: 'caves' });
  assert(cavesRoute.musicTrack === 'mus/4', 'Caves should route to mus/4');

  const frozenRoute = resolveMusicRoute({ areaCode: '5-1', biome: 'frozen_city' });
  assert(frozenRoute.musicTrack === 'mus/5', 'Frozen City should route to mus/5');

  const labsRoute = resolveMusicRoute({ areaCode: '6-1', biome: 'labs' });
  assert(labsRoute.musicTrack === 'mus/6', 'Labs should route to mus/6');

  const palaceRoute = resolveMusicRoute({ areaCode: '7-1', biome: 'palace' });
  assert(palaceRoute.musicTrack === 'mus/7', 'Palace should route to mus/7');

  // 3. Boss tracks
  const boss1 = resolveMusicRoute({ bossId: 'big_bandit' });
  assert(boss1.musicTrack === 'mus/Boss1', 'Big Bandit should route to mus/Boss1');

  const boss2 = resolveMusicRoute({ bossId: 'big_dog' });
  assert(boss2.musicTrack === 'mus/Boss2', 'Big Dog should route to mus/Boss2');

  const boss3 = resolveMusicRoute({ bossId: 'lil_hunter' });
  assert(boss3.musicTrack === 'mus/Boss3', 'Lil Hunter should route to mus/Boss3');

  const boss4 = resolveMusicRoute({ bossId: 'nuclear_throne' });
  assert(boss4.musicTrack === 'mus/Boss4', 'Nuclear Throne should route to mus/Boss4');

  const boss5 = resolveMusicRoute({ bossId: 'throne_ii' });
  assert(boss5.musicTrack === 'mus/Boss5', 'Throne II should route to mus/Boss5');

  // 4. Pause ducking
  const pausedRoute = resolveMusicRoute({ areaCode: '1-1', paused: true });
  assert(pausedRoute.duckingFactor === PAUSE_DUCKING_FACTOR, `Paused ducking factor should be ${PAUSE_DUCKING_FACTOR}`);

  // 5. AudioEngine state updates
  const engine = new AudioEngine();
  engine.routeContext({ screen: 'campfire' });
  assert(engine.getStats().currentMusic === 'musThemeA', 'Engine tracks campfire music');
  assert(engine.getStats().currentAmbience === 'amb/0', 'Engine tracks campfire ambience');

  engine.routeContext({ areaCode: '1-1', biome: 'desert' });
  assert(engine.getStats().currentMusic === 'mus/1', 'Engine updates to desert music');
  assert(engine.getStats().currentAmbience === 'amb/1', 'Engine updates to desert ambience');

  assert(engine.isPaused() === false, 'Initially unpaused');
  engine.setPaused(true);
  assert(engine.isPaused() === true, 'Engine paused state updates');
  engine.setPaused(false);
  assert(engine.isPaused() === false, 'Engine unpaused state updates');

  console.log('✅ PASS: Music & ambience routing and pause ducking update cleanly.');
}

// ============================================================================
// TEST 5: Headless fallback works with zero uncaught errors
// ============================================================================
console.log('\n[Test 5] Verifying headless fallback with zero uncaught errors...');
{
  const engine = new AudioEngine({
    baseUrl: '/nt-assets',
    settings: { masterVolume: 0.9, sfxVolume: 0.8, musicVolume: 0.7, muted: false },
  });

  // Verify sound classifier
  assert(classifySound('sndShotgun') === 'shell', 'sndShotgun classified as shell');
  assert(classifySound('sndRevolver') === 'bullet', 'sndRevolver classified as bullet');
  assert(classifySound('sndCrossbow') === 'bolt', 'sndCrossbow classified as bolt');
  assert(classifySound('sndRocket') === 'explosive', 'sndRocket classified as explosive');
  assert(classifySound('sndLaser') === 'energy', 'sndLaser classified as energy');
  assert(classifySound('sndWrench') === 'melee', 'sndWrench classified as melee');
  assert(classifySound('sndExplosion') === 'explosion', 'sndExplosion classified as explosion');
  assert(classifySound('sndEnemyHurt') === 'hit', 'sndEnemyHurt classified as hit');
  assert(classifySound('sndBanditDead') === 'death', 'sndBanditDead classified as death');
  assert(classifySound('sndRadPickup') === 'pickup', 'sndRadPickup classified as pickup');
  assert(classifySound('sndPortalOpen') === 'portal', 'sndPortalOpen classified as portal');
  assert(classifySound('sndLevelUp') === 'level_up', 'sndLevelUp classified as level_up');
  assert(classifySound('sndButtonClick') === 'ui_click', 'sndButtonClick classified as ui_click');

  // Verify procedural synth runs in headless mode without crashing
  const voice = playSynthSound(null, 'bullet');
  assert(typeof voice.stop === 'function', 'Synth voice has callable stop function');
  voice.stop();

  // Test full SimEvent bus consumption in headless mode
  const mockEvents: SimEvent[] = [
    { type: 'sfx', sound: 'sndShotgun', x: 20, y: 15, pitchJitter: 0.1, volume: 1.0 },
    { type: 'music', track: 'mus/1', ambience: 'amb/1' },
    { type: 'portal_open', x: 100, y: 120, targetArea: '2-1' },
    { type: 'area_change', areaCode: '2-1', biome: 'sewers', loop: 0 },
    { type: 'boss_intro', bossId: 'big_bandit', name: 'Big Bandit', subtitle: 'DEATH FROM ABOVE' },
    { type: 'level_up', level: 3, isUltra: false },
    { type: 'player_died', cause: 'Maggot', killerSprite: 'sprMaggot', areaCode: '1-1', loop: 0, kills: 12 },
  ];

  engine.consumeEvents(mockEvents, 20, 15);

  // Apply settings
  engine.applySettings({ masterVolume: 0.5, muted: true });
  assert(engine.settings.muted === true, 'Settings applied');

  // Verify unlock
  const unlocked = await engine.unlock();
  assert(unlocked === true, 'Headless engine unlock returns true');

  console.log('✅ PASS: Headless fallback operates cleanly with zero errors.');
}

console.log('\n🎉 ALL AUDIO SELFTESTS PASSED SUCCESSFULLY! (5/5)');
