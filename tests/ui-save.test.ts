import { describe, expect, it } from 'vitest';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  SIM_DT,
  type KeyBindings,
  type TargetFps,
} from '@/contracts';
import {
  CAMERA_KICK_DECAY,
  CAMERA_MAX_LOOKAHEAD,
  CAMERA_MAX_SHAKE_PX,
  CameraController,
} from '@/render';
import { InputManager, clientToLogicalCanvas } from '@/input';
import {
  ALL_MUTANT_IDS,
  LEGACY_SAVE_STORAGE_KEY,
  SAVE_STORAGE_KEY,
  SaveManager,
  createDefaultSaveData,
  cycleTargetFps,
  formatTargetFpsLabel,
  validateSaveData,
  type StorageLike,
} from '@/ui';

class MockStorage implements StorageLike {
  readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('ui-save: SaveManager Persistence & Corruption Recovery', () => {
  it('persists full save round-trip, tracks runs/bests, recovers corrupted JSON, and sanitizes invalid fields', () => {
    const def = createDefaultSaveData();
    expect(Object.keys(def.mutants)).toHaveLength(12);
    for (const id of ALL_MUTANT_IDS) {
      expect(def.mutants[id].unlocked).toBe(true);
    }

    const storage = new MockStorage();
    const sm1 = new SaveManager(storage);
    sm1.setSelectedMutant('melting');
    sm1.setSelectedSkin('melting', 'b');
    sm1.setSelectedCrown('blood');
    sm1.setUseGoldenWeapon(true);
    sm1.updateAudio({ masterVolume: 0.55, musicVolume: 0.25, muted: true });
    sm1.updateRender({
      widescreen: true,
      classic30Fps: true,
      screenShakeScale: 0.4,
      crosshairStyle: 5,
      showFps: true,
    });
    sm1.updateKeybinds({ up: 'KeyI', swap: 'KeyF' });
    sm1.updateControls({
      gamepadAimAssist: false,
      gamepadRumble: false,
      gamepadDeadzone: 0.24,
      touchMode: 'off',
    });
    sm1.recordRunStart('melting');
    sm1.recordRunEnd({
      mutant: 'melting',
      areaCode: '5-3',
      loop: 1,
      kills: 412,
      victory: true,
      crown: 'blood',
      goldenWeapon: 'golden_wrench',
    });

    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeTruthy();

    // Reload from same storage
    const sm2 = new SaveManager(storage);
    expect(sm2.wasRecoveredFromCorruption()).toBe(false);
    const loaded = sm2.getData();
    expect(loaded.selectedMutant).toBe('melting');
    expect(sm2.getSelectedSkin('melting')).toBe('b');
    expect(loaded.selectedCrown).toBe('blood');
    expect(loaded.useGoldenWeapon).toBe(true);
    expect(loaded.audio.masterVolume).toBe(0.55);
    expect(loaded.audio.muted).toBe(true);
    expect(loaded.render.widescreen).toBe(true);
    expect(loaded.render.crosshairStyle).toBe(5);
    expect(loaded.keybinds.up).toBe('KeyI');
    expect(loaded.keybinds.swap).toBe('KeyF');
    expect(loaded.controls).toEqual({
      gamepadAimAssist: false,
      gamepadRumble: false,
      gamepadDeadzone: 0.24,
      touchMode: 'off',
    });
    expect(loaded.totalRuns).toBe(1);
    expect(loaded.totalKills).toBe(412);
    expect(loaded.bestArea).toBe('5-3');
    expect(loaded.bestLoop).toBe(1);
    expect(loaded.mutants.melting.goldenWeapon).toBe('golden_wrench');

    // Corrupted JSON recovery
    storage.setItem(SAVE_STORAGE_KEY, '{not_valid_json!!!');
    const smCorrupt = new SaveManager(storage);
    expect(smCorrupt.wasRecoveredFromCorruption()).toBe(true);
    expect(smCorrupt.getData().selectedMutant).toBe('fish');
    expect(Object.keys(smCorrupt.getData().mutants)).toHaveLength(12);

    // Schema sanitization
    const sanitized = validateSaveData({
      selectedMutant: 'bogus_mutant',
      selectedCrown: 'bogus_crown',
      audio: { masterVolume: 99, sfxVolume: -5, musicVolume: Number.NaN },
      render: { crosshairStyle: 999, screenShakeScale: -10 },
      controls: {
        gamepadAimAssist: 'yes',
        gamepadRumble: 123,
        gamepadDeadzone: 0.99,
        touchMode: 'always_on',
      },
      totalKills: -42,
      mutants: { fish: { unlocked: false, bestKills: 77, bestArea: '7-3', bestLoop: 2 } },
    });
    expect(sanitized.selectedMutant).toBe('fish');
    expect(sanitized.selectedCrown).toBe('none');
    expect(sanitized.audio.masterVolume).toBe(1);
    expect(sanitized.audio.sfxVolume).toBe(0);
    expect(sanitized.audio.musicVolume).toBe(def.audio.musicVolume);
    expect(sanitized.render.crosshairStyle).toBe(6);
    expect(sanitized.render.screenShakeScale).toBe(0);
    expect(sanitized.controls).toEqual({
      gamepadAimAssist: true,
      gamepadRumble: true,
      gamepadDeadzone: 0.35,
      touchMode: 'auto',
    });
    expect(sanitized.totalKills).toBe(0);
    expect(sanitized.mutants.fish.unlocked).toBe(true);
    expect(sanitized.mutants.fish.bestKills).toBe(77);

    // Default headless Node storage fallback
    const smNode = new SaveManager();
    smNode.setSelectedMutant('yv');
    expect(smNode.getData().selectedMutant).toBe('yv');
  });

  it('uses krunked_throne_save_v1 storage key and defaults to 120 FPS (classic30Fps=false)', () => {
    expect(SAVE_STORAGE_KEY).toBe('krunked_throne_save_v1');
    expect(LEGACY_SAVE_STORAGE_KEY).toBe('nt_cleanroom_save_v1');

    const def = createDefaultSaveData();
    expect(def.render.targetFps).toBe(120);
    expect(def.render.classic30Fps).toBe(false);

    const storage = new MockStorage();
    const sm = new SaveManager(storage);
    expect(sm.getData().render.targetFps).toBe(120);
    expect(sm.getData().render.classic30Fps).toBe(false);
    expect(sm.wasRecoveredFromCorruption()).toBe(false);
  });

  it('cycles and updates targetFps across 30/60/120 with synced classic30Fps and storage round-trip', () => {
    const storage = new MockStorage();
    const sm = new SaveManager(storage);

    expect(formatTargetFpsLabel(30)).toContain('30');
    expect(formatTargetFpsLabel(60)).toContain('60');
    expect(formatTargetFpsLabel(120)).toContain('120');

    // Full cycle starting from default 120: 120 -> 30 -> 60 -> 120
    const expectedSequence: TargetFps[] = [30, 60, 120];
    let current = sm.getData().render.targetFps;
    expect(current).toBe(120);

    for (const expectedFps of expectedSequence) {
      current = cycleTargetFps(current);
      expect(current).toBe(expectedFps);

      const updated = sm.updateRender({ targetFps: current });
      expect(updated.targetFps).toBe(expectedFps);
      expect(updated.classic30Fps).toBe(expectedFps === 30);

      // Verify persisted JSON under krunked_throne_save_v1 and fresh SaveManager round-trip
      const raw = storage.getItem(SAVE_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const reloaded = new SaveManager(storage);
      expect(reloaded.wasRecoveredFromCorruption()).toBe(false);
      expect(reloaded.getData().render.targetFps).toBe(expectedFps);
      expect(reloaded.getData().render.classic30Fps).toBe(expectedFps === 30);
    }

    // Legacy classic30Fps toggle still stays synced with targetFps
    sm.updateRender({ classic30Fps: true });
    expect(sm.getData().render.targetFps).toBe(30);
    expect(sm.getData().render.classic30Fps).toBe(true);

    sm.updateRender({ classic30Fps: false });
    expect(sm.getData().render.targetFps).toBe(120);
    expect(sm.getData().render.classic30Fps).toBe(false);

    // Invalid targetFps values in untrusted payloads sanitize cleanly
    expect(validateSaveData({ render: { targetFps: 90 } }).render).toMatchObject({
      targetFps: 120,
      classic30Fps: false,
    });
    expect(
      validateSaveData({ render: { targetFps: 144, classic30Fps: true } }).render,
    ).toMatchObject({
      targetFps: 30,
      classic30Fps: true,
    });
  });

  it('migrates seamlessly from legacy nt_cleanroom_save_v1 key with classic30Fps: true -> targetFps: 30', () => {
    const storage = new MockStorage();
    storage.setItem(
      'nt_cleanroom_save_v1',
      JSON.stringify({
        version: 1,
        selectedMutant: 'robot',
        selectedCrown: 'haste',
        render: {
          widescreen: true,
          classic30Fps: true,
          screenShakeScale: 0.75,
          crosshairStyle: 3,
          showFps: true,
          pixelSnap: true,
        },
        totalRuns: 7,
        totalKills: 512,
        bestKills: 180,
        bestArea: '7-3',
        bestLoop: 1,
      }),
    );

    const sm = new SaveManager(storage);
    expect(sm.wasRecoveredFromCorruption()).toBe(false);
    const migrated = sm.getData();
    expect(migrated.selectedMutant).toBe('robot');
    expect(migrated.selectedCrown).toBe('haste');
    expect(migrated.render.widescreen).toBe(true);
    expect(migrated.render.targetFps).toBe(30);
    expect(migrated.render.classic30Fps).toBe(true);
    expect(migrated.bestArea).toBe('7-3');
    expect(migrated.bestLoop).toBe(1);
    expect(migrated.totalKills).toBe(512);

    // Subsequent saves write to krunked_throne_save_v1 and take precedence over legacy storage
    sm.updateRender({ targetFps: 60 });
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeTruthy();

    const reloaded = new SaveManager(storage);
    expect(reloaded.getData().render.targetFps).toBe(60);
    expect(reloaded.getData().render.classic30Fps).toBe(false);
    expect(reloaded.getData().selectedMutant).toBe('robot');

    // Legacy key with classic30Fps: false defaults to targetFps: 120
    const storage120 = new MockStorage();
    storage120.setItem(
      LEGACY_SAVE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        render: { classic30Fps: false },
      }),
    );
    const sm120 = new SaveManager(storage120);
    expect(sm120.wasRecoveredFromCorruption()).toBe(false);
    expect(sm120.getData().render.targetFps).toBe(120);
    expect(sm120.getData().render.classic30Fps).toBe(false);
  });
});

describe('ui-save: CameraController Look-Ahead, Kick & Inverse Transform', () => {
  it('clamps look-ahead to <= 48px, decays kick by 0.72/tick, scales shake, and inverts transforms exactly', () => {
    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(200, 150);

    const nearLead = CameraController.computeLookAhead(200, 150, 240, 150);
    expect(nearLead.x).toBeCloseTo(10, 5);
    expect(nearLead.y).toBeCloseTo(0, 5);

    const farCardinal = CameraController.computeLookAhead(200, 150, 1200, 150);
    expect(farCardinal.x).toBeCloseTo(CAMERA_MAX_LOOKAHEAD, 5);

    const farDiag = CameraController.computeLookAhead(200, 150, 900, -750);
    expect(Math.hypot(farDiag.x, farDiag.y)).toBeCloseTo(CAMERA_MAX_LOOKAHEAD, 4);

    // Recoil kick decay (* 0.72 per 30 Hz tick)
    cam.addShake(0, -1, 0, 10);
    expect(cam.kickX).toBeCloseTo(-10, 5);
    cam.update(200, 150, 200, 150, SIM_DT, { screenShakeScale: 1, pixelSnap: true });
    expect(cam.kickX).toBeCloseTo(-10 * CAMERA_KICK_DECAY, 4);

    // Trauma-squared shake & screenShakeScale=0 suppression
    cam.snapTo(200, 150);
    cam.addShake(0.8);
    cam.update(200, 150, 260, 180, SIM_DT, { screenShakeScale: 1, pixelSnap: false });
    const shakeMag = Math.hypot(cam.shakeOffsetX, cam.shakeOffsetY);
    expect(shakeMag).toBeGreaterThan(0);
    expect(shakeMag).toBeLessThanOrEqual(0.8 * 0.8 * CAMERA_MAX_SHAKE_PX * Math.SQRT2 + 0.01);

    cam.snapTo(200, 150);
    cam.addShake(0.9);
    cam.update(200, 150, 260, 180, SIM_DT, { screenShakeScale: 0, pixelSnap: true });
    expect(cam.shakeOffsetX).toBe(0);
    expect(cam.shakeOffsetY).toBe(0);

    // Exact inverse worldToScreen <-> screenToWorld across 4:3 and 16:9
    const modes: Array<[number, number, boolean]> = [
      [LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, true],
      [LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, true],
      [LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, false],
    ];
    for (const [vw, vh, snap] of modes) {
      cam.setViewport(vw, vh);
      cam.addShake(0.6, 0.6, 0.8, 7);
      cam.update(312.4, 245.7, 500, 100, SIM_DT, { screenShakeScale: 1, pixelSnap: snap });
      for (const pt of [
        { x: 0, y: 0 },
        { x: 200, y: 150 },
        { x: 357.5, y: 211.25 },
      ]) {
        const scr = cam.worldToScreen(pt.x, pt.y);
        const back = cam.screenToWorld(scr.x, scr.y);
        expect(back.x).toBeCloseTo(pt.x, 8);
        expect(back.y).toBeCloseTo(pt.y, 8);
      }
    }
  });
});

describe('ui-save: InputManager Keybinds, Coordinate Mapping & Latches', () => {
  it('respects custom keybinds, normalizes diagonals, maps client->world, and clears edge latches', () => {
    const customBinds: KeyBindings = {
      up: 'KeyI',
      down: 'KeyK',
      left: 'KeyJ',
      right: 'KeyL',
      swap: 'KeyF',
      pickup: 'KeyG',
      pause: 'KeyH',
      activeAlt: 'ShiftLeft',
    };

    const cam = new CameraController();
    cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    cam.snapTo(160, 120); // view origin = (0, 0)

    const input = new InputManager(customBinds);
    input.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);

    const mapped = clientToLogicalCanvas(
      100 + 320,
      50 + 240,
      { left: 100, top: 50, width: 640, height: 480 },
      LOGICAL_WIDTH_4_3,
      LOGICAL_HEIGHT,
    );
    expect(mapped).toEqual({ x: 160, y: 120 });

    input.simulateMouseMoveClient(100 + 480, 50 + 120, { left: 100, top: 50, width: 640, height: 480 });
    input.simulateKeyDown('KeyI');
    input.simulateKeyDown('KeyL');
    input.simulateKeyDown('KeyF');
    input.simulateKeyDown('KeyG');
    input.simulateKeyDown('KeyH');
    input.simulateKeyDown('ShiftLeft');
    input.simulateKeyDown('Digit3');
    input.simulateKeyDown('KeyR');
    input.simulateMouseButton(0, true);

    // Tick 1: all edge latches fire
    const f1 = input.consumeSimInput(cam);
    expect(f1.moveX).toBeGreaterThan(0);
    expect(f1.moveY).toBeLessThan(0);
    expect(Math.hypot(f1.moveX, f1.moveY)).toBeCloseTo(1, 5);
    expect(f1.aimWorldX).toBe(240);
    expect(f1.aimWorldY).toBe(60);
    expect(f1.fireHeld).toBe(true);
    expect(f1.firePressed).toBe(true);
    expect(f1.activeHeld).toBe(true);
    expect(f1.activePressed).toBe(true);
    expect(f1.swapPressed).toBe(true);
    expect(f1.pickupPressed).toBe(true);
    expect(f1.pausePressed).toBe(true);
    expect(f1.selectIndex).toBe(2);
    expect(input.consumeRetryPressed()).toBe(true);
    expect(input.consumeRetryPressed()).toBe(false);

    // Tick 2: held flags stay true while edge latches clear
    const f2 = input.consumeSimInput(cam);
    expect(f2.fireHeld).toBe(true);
    expect(f2.activeHeld).toBe(true);
    expect(f2.firePressed).toBe(false);
    expect(f2.activePressed).toBe(false);
    expect(f2.swapPressed).toBe(false);
    expect(f2.pickupPressed).toBe(false);
    expect(f2.pausePressed).toBe(false);
    expect(f2.selectIndex).toBeUndefined();

    // Wheel triggers swap latch & key capture captures next key
    input.simulateMouseButton(0, false);
    input.simulateKeyUp('ShiftLeft');
    input.simulateKeyUp('KeyI');
    input.simulateKeyUp('KeyL');
    input.simulateWheel(120);
    const f3 = input.consumeSimInput(cam);
    expect(f3.swapPressed).toBe(true);
    expect(f3.fireHeld).toBe(false);

    input.beginKeyCapture();
    expect(input.isCapturingKey()).toBe(true);
    input.simulateKeyDown('KeyZ');
    expect(input.isCapturingKey()).toBe(false);
    const menuSnap = input.consumeMenuInput();
    expect(menuSnap.capturedKeyCode).toBe('KeyZ');
  });
});
