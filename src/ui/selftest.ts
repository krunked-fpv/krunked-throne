import assert from 'node:assert/strict';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH_16_9,
  LOGICAL_WIDTH_4_3,
  SIM_DT,
  type KeyBindings,
} from '@/contracts';
import { createFallbackManifest, loadManifestNode } from '@/assets';
import {
  CAMERA_KICK_DECAY,
  CAMERA_MAX_LOOKAHEAD,
  CAMERA_MAX_SHAKE_PX,
  CameraController,
  GlowStampCache,
  NT_COLOR_TOKENS,
  computeShadowPassAlpha,
  measureText,
  parseMarkupLines,
  snapGlowRadius,
  stripMarkup,
} from '@/render';
import { InputManager, clientToLogicalCanvas } from '@/input';
import {
  ALL_MUTANT_IDS,
  LEGACY_SAVE_STORAGE_KEY,
  MenuSystem,
  SAVE_STORAGE_KEY,
  SaveManager,
  computePortraitFrame,
  computeTitleLogoFrame,
  createDefaultSaveData,
  cycleTargetFps,
  formatTargetFpsLabel,
  resolveCorpseFrame,
  resolveHealthFillFrame,
  validateSaveData,
  type StorageLike,
} from './index';
import { createFallbackBundle } from '@/assets';

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

function testSaveManager(): void {
  // 1. Default SaveData integrity across all 12 mutants
  const def = createDefaultSaveData();
  assert.equal(Object.keys(def.mutants).length, 12, 'Expected 12 mutants in default SaveData');
  for (const id of ALL_MUTANT_IDS) {
    const m = def.mutants[id];
    assert.ok(m, `Missing mutant progress for ${id}`);
    assert.equal(m.unlocked, true, `Mutant ${id} should be unlocked by default`);
    assert.equal(m.bestArea, '1-1');
    assert.equal(m.bestLoop, 0);
  }

  // 2. Serialization & reload round-trip
  const storage = new MockStorage();
  const sm1 = new SaveManager(storage);
  sm1.setSelectedMutant('melting');
  sm1.setSelectedSkin('melting', 'b');
  sm1.setSelectedCrown('blood');
  sm1.setUseGoldenWeapon(true);
  sm1.updateAudio({ masterVolume: 0.55, musicVolume: 0.25, muted: true });
  sm1.updateRender({ widescreen: true, classic30Fps: true, screenShakeScale: 0.4, crosshairStyle: 5, showFps: true });
  sm1.updateKeybinds({ up: 'KeyI', swap: 'KeyF' });
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

  const rawJson = storage.getItem(SAVE_STORAGE_KEY);
  assert.equal(SAVE_STORAGE_KEY, 'krunked_throne_save_v1');
  assert.ok(rawJson && rawJson.length > 50, 'SaveManager must persist JSON under krunked_throne_save_v1');

  const sm2 = new SaveManager(storage);
  assert.equal(sm2.wasRecoveredFromCorruption(), false);
  const loaded = sm2.getData();
  assert.equal(loaded.selectedMutant, 'melting');
  assert.equal(sm2.getSelectedSkin('melting'), 'b');
  assert.equal(loaded.selectedCrown, 'blood');
  assert.equal(loaded.useGoldenWeapon, true);
  assert.equal(loaded.audio.masterVolume, 0.55);
  assert.equal(loaded.audio.musicVolume, 0.25);
  assert.equal(loaded.audio.muted, true);
  assert.equal(loaded.render.widescreen, true);
  assert.equal(loaded.render.targetFps, 30);
  assert.equal(loaded.render.classic30Fps, true);
  assert.equal(loaded.render.screenShakeScale, 0.4);
  assert.equal(loaded.render.crosshairStyle, 5);
  assert.equal(loaded.render.showFps, true);
  assert.equal(loaded.keybinds.up, 'KeyI');
  assert.equal(loaded.keybinds.swap, 'KeyF');
  assert.equal(loaded.totalRuns, 1);
  assert.equal(loaded.totalKills, 412);
  assert.equal(loaded.bestArea, '5-3');
  assert.equal(loaded.bestLoop, 1);
  assert.equal(loaded.mutants.melting.bestKills, 412);
  assert.equal(loaded.mutants.melting.goldenWeapon, 'golden_wrench');

  // 2b. Default 120 FPS & bidirectional targetFps <-> classic30Fps sync + legacy key fallback
  assert.equal(def.render.targetFps, 120, 'Default targetFps must be 120');
  assert.equal(def.render.classic30Fps, false, 'Default classic30Fps must be false');

  sm2.updateRender({ targetFps: 60 });
  assert.equal(sm2.getData().render.targetFps, 60);
  assert.equal(sm2.getData().render.classic30Fps, false);

  sm2.updateRender({ targetFps: 120 });
  assert.equal(sm2.getData().render.targetFps, 120);
  assert.equal(sm2.getData().render.classic30Fps, false);

  sm2.updateRender({ classic30Fps: true });
  assert.equal(sm2.getData().render.targetFps, 30);
  assert.equal(sm2.getData().render.classic30Fps, true);

  const legacyStorage = new MockStorage();
  legacyStorage.setItem(
    LEGACY_SAVE_STORAGE_KEY,
    JSON.stringify({ selectedMutant: 'eyes', render: { classic30Fps: true } }),
  );
  const smLegacy = new SaveManager(legacyStorage);
  assert.equal(smLegacy.getData().selectedMutant, 'eyes');
  assert.equal(smLegacy.getData().render.targetFps, 30);
  assert.equal(smLegacy.getData().render.classic30Fps, true);

  // 3. Corrupted JSON recovery
  storage.setItem(SAVE_STORAGE_KEY, '{corrupted_json_!!!');
  const smCorrupt = new SaveManager(storage);
  assert.equal(smCorrupt.wasRecoveredFromCorruption(), true, 'Corrupted JSON should flag recovery');
  assert.equal(smCorrupt.getData().selectedMutant, 'fish');
  assert.equal(Object.keys(smCorrupt.getData().mutants).length, 12);
  for (const id of ALL_MUTANT_IDS) {
    assert.equal(smCorrupt.getData().mutants[id].unlocked, true);
  }

  // 4. Schema sanitization on partial/invalid object
  const sanitized = validateSaveData({
    selectedMutant: 'invalid_mutant',
    selectedCrown: 'fake_crown',
    audio: { masterVolume: 99, sfxVolume: -5, musicVolume: Number.NaN },
    render: { crosshairStyle: 999, screenShakeScale: -10 },
    totalKills: -42,
    mutants: { fish: { unlocked: false, bestKills: 77, bestArea: '7-3', bestLoop: 2 } },
  });
  assert.equal(sanitized.selectedMutant, 'fish');
  assert.equal(sanitized.selectedCrown, 'none');
  assert.equal(sanitized.audio.masterVolume, 1);
  assert.equal(sanitized.audio.sfxVolume, 0);
  assert.equal(sanitized.audio.musicVolume, def.audio.musicVolume);
  assert.equal(sanitized.render.crosshairStyle, 8);
  assert.equal(sanitized.render.screenShakeScale, 0);
  assert.equal(sanitized.totalKills, 0);
  assert.equal(sanitized.mutants.fish.unlocked, true, 'All 12 mutants remain unlocked');
  assert.equal(sanitized.mutants.fish.bestKills, 77);
  assert.equal(sanitized.mutants.fish.bestArea, '7-3');
  assert.equal(sanitized.mutants.fish.bestLoop, 2);

  // 5. Headless Node default storage fallback (no StorageLike passed)
  const smNode = new SaveManager();
  smNode.setSelectedMutant('yv');
  assert.equal(smNode.getData().selectedMutant, 'yv');

  console.log('[PASS] 1. SaveManager: 12-mutant defaults, serialization round-trip, corrupted JSON recovery & schema validation');
}

function testCamera(): void {
  const cam = new CameraController();
  cam.setViewport(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
  cam.snapTo(200, 150);

  // 1. Look-ahead exact scaling within range & <= 48px clamping for far aims
  const nearLead = CameraController.computeLookAhead(200, 150, 240, 150);
  assert.ok(Math.abs(nearLead.x - 10) < 1e-6 && Math.abs(nearLead.y) < 1e-6, 'Near lead should be 0.25 * delta');

  const farCardinal = CameraController.computeLookAhead(200, 150, 1200, 150);
  assert.ok(Math.hypot(farCardinal.x, farCardinal.y) <= CAMERA_MAX_LOOKAHEAD + 1e-6);
  assert.ok(Math.abs(farCardinal.x - 48) < 1e-6);

  const farDiag = CameraController.computeLookAhead(200, 150, 900, -750);
  const diagLen = Math.hypot(farDiag.x, farDiag.y);
  assert.ok(diagLen <= CAMERA_MAX_LOOKAHEAD + 1e-6, `Diagonal look-ahead ${diagLen} exceeded 48px`);
  assert.ok(Math.abs(diagLen - CAMERA_MAX_LOOKAHEAD) < 1e-5, 'Diagonal look-ahead should clamp cleanly to 48px');

  // 2. Recoil kick multiplicative decay (* 0.72 per 30 Hz tick)
  cam.addShake(0, -1, 0, 10);
  assert.ok(Math.abs(cam.kickX - -10) < 1e-6);
  cam.update(200, 150, 200, 150, SIM_DT, { screenShakeScale: 1, pixelSnap: true });
  assert.ok(
    Math.abs(cam.kickX - -10 * CAMERA_KICK_DECAY) < 1e-4,
    `Expected kickX=${-10 * CAMERA_KICK_DECAY}, got ${cam.kickX}`,
  );
  const kickAfter1 = Math.abs(cam.kickX);
  for (let i = 0; i < 15; i++) {
    cam.update(200, 150, 200, 150, SIM_DT, { screenShakeScale: 1, pixelSnap: true });
  }
  assert.ok(Math.abs(cam.kickX) < kickAfter1 * 0.05, 'Recoil kick must decay rapidly toward zero');

  // 3. Trauma-squared screenshake scaled by screenShakeScale
  cam.snapTo(200, 150);
  cam.addShake(0.8);
  cam.update(200, 150, 260, 180, SIM_DT, { screenShakeScale: 1, pixelSnap: false });
  const shakeMagFull = Math.hypot(cam.shakeOffsetX, cam.shakeOffsetY);
  const maxExpected = 0.8 * 0.8 * CAMERA_MAX_SHAKE_PX * Math.SQRT2 + 0.01;
  assert.ok(shakeMagFull > 0, 'Trauma screenshake should displace camera when scale=1');
  assert.ok(shakeMagFull <= maxExpected, `Shake ${shakeMagFull} exceeded trauma^2 bound ${maxExpected}`);

  cam.snapTo(200, 150);
  cam.addShake(0.9);
  cam.update(200, 150, 260, 180, SIM_DT, { screenShakeScale: 0, pixelSnap: true });
  assert.equal(cam.shakeOffsetX, 0, 'screenShakeScale=0 must suppress horizontal shake');
  assert.equal(cam.shakeOffsetY, 0, 'screenShakeScale=0 must suppress vertical shake');

  // 4. Exact inverse worldToScreen <-> screenToWorld across both 4:3 and 16:9
  const viewports: Array<[number, number, boolean]> = [
    [LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, true],
    [LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, true],
    [LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, false],
  ];
  const sampleWorldPts = [
    { x: 0, y: 0 },
    { x: 200, y: 150 },
    { x: 357.5, y: 211.25 },
    { x: -42, y: 512 },
  ];
  for (const [vw, vh, snap] of viewports) {
    cam.setViewport(vw, vh);
    cam.addShake(0.6, 0.6, 0.8, 7);
    cam.update(312.4, 245.7, 500, 100, SIM_DT, { screenShakeScale: 1, pixelSnap: snap });
    for (const pt of sampleWorldPts) {
      const scr = cam.worldToScreen(pt.x, pt.y);
      const back = cam.screenToWorld(scr.x, scr.y);
      assert.ok(
        Math.abs(back.x - pt.x) < 1e-9 && Math.abs(back.y - pt.y) < 1e-9,
        `Inverse mismatch (${vw}x${vh}, snap=${snap}): (${pt.x},${pt.y}) -> (${back.x},${back.y})`,
      );
    }
  }

  console.log('[PASS] 2. CameraController: <=48px look-ahead clamp, 0.72x kick decay, trauma^2 shake & exact screen<->world inverse');
}

async function testBitmapFont(): Promise<void> {
  // 1. Markup token stripping & colorization
  const sample = '@wHP @r2/8@s#@gRADS @y100 @bBLUE @pULTRA @dDIM@@100\\#1';
  const stripped = stripMarkup(sample);
  assert.equal(stripped, 'HP 2/8\nRADS 100 BLUE ULTRA DIM@100#1');

  const lines = parseMarkupLines(sample, '#eeeeee');
  assert.equal(lines.length, 2, 'Expected 2 lines split on #');
  assert.deepEqual(lines[0]!.runs, [
    { text: 'HP ', color: NT_COLOR_TOKENS.w },
    { text: '2/8', color: NT_COLOR_TOKENS.r },
  ]);
  assert.deepEqual(lines[1]!.runs, [
    { text: 'RADS ', color: NT_COLOR_TOKENS.g },
    { text: '100 ', color: NT_COLOR_TOKENS.y },
    { text: 'BLUE ', color: NT_COLOR_TOKENS.b },
    { text: 'ULTRA ', color: NT_COLOR_TOKENS.p },
    { text: 'DIM@100#1', color: NT_COLOR_TOKENS.d },
  ]);

  // Verify @s reset restores base color
  const resetLines = parseMarkupLines('@rRED@sBASE', '#123456');
  assert.deepEqual(resetLines[0]!.runs, [
    { text: 'RED', color: NT_COLOR_TOKENS.r },
    { text: 'BASE', color: '#123456' },
  ]);

  // 2. Measure against manifest fonts in current workspace (fallback or custom pack)
  const manifest = await loadManifestNode(process.cwd());
  const fntM1 = manifest.fonts['fntM1'];
  const fntSmall = manifest.fonts['fntSmall'];
  const fntL = manifest.fonts['fntL'];
  const fntM0 = manifest.fonts['fntM0'];
  assert.ok(fntM1 && fntSmall && fntL && fntM0, 'Expected fntM1, fntSmall, fntL, fntM0 in manifest');

  const testWord = 'KRUNKED';
  const mSmall = measureText(fntSmall, testWord);
  const mM1 = measureText(fntM1, testWord);
  const mM0 = measureText(fntM0, testWord);
  const mL = measureText(fntL, testWord);

  // Verify exact glyph shift widths against manifest data
  const expectedM1 = [...testWord].reduce((acc, ch) => acc + fntM1.glyphs[ch.charCodeAt(0)]!.shift * fntM1.scaleX, 0);
  const expectedSmall = [...testWord].reduce((acc, ch) => acc + fntSmall.glyphs[ch.charCodeAt(0)]!.shift * fntSmall.scaleX, 0);
  const expectedL = [...testWord].reduce((acc, ch) => acc + fntL.glyphs[ch.charCodeAt(0)]!.shift * fntL.scaleX, 0);

  assert.equal(mM1.width, Math.round(expectedM1));
  assert.equal(mSmall.width, Math.round(expectedSmall));
  assert.equal(mL.width, Math.round(expectedL));
  assert.ok(mSmall.width < mM1.width && mM1.width < mL.width, 'Expected fntSmall < fntM1 < fntL widths');

  // Verify markup tokens do NOT inflate measured width
  const mMarked = measureText(fntM1, '@rKRU@gNK@yED@s');
  assert.equal(mMarked.width, mM1.width, 'Markup tokens must have zero rendered width');

  // Verify multi-line height with '#'
  const mTwoLines = measureText(fntM1, 'LINE1#LINE2');
  assert.equal(mTwoLines.lineWidths.length, 2);
  assert.ok(mTwoLines.height > fntM1.lineHeight, 'Two lines must be taller than one line');

  // 3. Measure against procedural fallback manifest fonts & undefined monospace fallback
  const fbManifest = createFallbackManifest();
  const fbM1 = measureText(fbManifest.fonts['fntM1'], testWord);
  const fbSmall = measureText(fbManifest.fonts['fntSmall'], testWord);
  const fbL = measureText(fbManifest.fonts['fntL'], testWord);
  assert.ok(fbSmall.width < fbM1.width && fbM1.width < fbL.width, 'Fallback font scale hierarchy should hold');
  const undefM = measureText(undefined, testWord);
  assert.equal(undefM.width, testWord.length * 6, 'Undefined font fallback width should be 6px/char');

  console.log(
    `[PASS] 3. BitmapFont: markup parse/strip + exact Steam measurements (fntSmall=${mSmall.width}px, fntM0=${mM0.width}px, fntM1=${mM1.width}px, fntL=${mL.width}px) & fallback measurements (fntSmall=${fbSmall.width}px, fntM1=${fbM1.width}px, fntL=${fbL.width}px)`,
  );
}

function testInputManager(): void {
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

  // Client -> Logical -> World conversion check (e.g. 2x scaled canvas centered at (100, 50))
  const mapped = clientToLogicalCanvas(
    100 + 320, // center X of 640px wide canvas
    50 + 240, // center Y of 480px tall canvas
    { left: 100, top: 50, width: 640, height: 480 },
    LOGICAL_WIDTH_4_3,
    LOGICAL_HEIGHT,
  );
  assert.equal(mapped.x, 160);
  assert.equal(mapped.y, 120);

  input.simulateMouseMoveClient(100 + 480, 50 + 120, { left: 100, top: 50, width: 640, height: 480 });
  // Logical = (240, 60), view origin = (0, 0) -> world = (240, 60)

  // Press custom movement (diagonal up+right), fire LMB, active ShiftLeft, swap KeyF, pickup KeyG, pause KeyH, select Digit3, retry KeyR
  input.simulateKeyDown('KeyI');
  input.simulateKeyDown('KeyL');
  input.simulateKeyDown('KeyF');
  input.simulateKeyDown('KeyG');
  input.simulateKeyDown('KeyH');
  input.simulateKeyDown('ShiftLeft');
  input.simulateKeyDown('Digit3');
  input.simulateKeyDown('KeyR');
  input.simulateMouseButton(0, true);

  // Tick 1: edge-triggered latches MUST fire, movement diagonal normalized
  const f1 = input.consumeSimInput(cam);
  assert.ok(f1.moveX > 0 && f1.moveY < 0, 'Custom KeyI + KeyL should move up-right');
  assert.ok(Math.abs(Math.hypot(f1.moveX, f1.moveY) - 1) < 1e-6, 'Diagonal movement vector must be unit normalized');
  assert.equal(f1.aimWorldX, 240);
  assert.equal(f1.aimWorldY, 60);
  assert.equal(f1.fireHeld, true);
  assert.equal(f1.firePressed, true);
  assert.equal(f1.activeHeld, true);
  assert.equal(f1.activePressed, true);
  assert.equal(f1.swapPressed, true);
  assert.equal(f1.pickupPressed, true);
  assert.equal(f1.pausePressed, true);
  assert.equal(f1.selectIndex, 2);
  assert.equal(input.consumeRetryPressed(), true);
  assert.equal(input.consumeRetryPressed(), false, 'Retry latch must clear after consume');

  // Tick 2 (keys/buttons still held, no new presses): held stays true, ALL edge latches MUST clear!
  const f2 = input.consumeSimInput(cam);
  assert.equal(f2.fireHeld, true, 'fireHeld should remain true while LMB down');
  assert.equal(f2.activeHeld, true, 'activeHeld should remain true while ShiftLeft down');
  assert.equal(f2.firePressed, false, 'firePressed latch must clear after sim step');
  assert.equal(f2.activePressed, false, 'activePressed latch must clear after sim step');
  assert.equal(f2.swapPressed, false, 'swapPressed latch must clear after sim step');
  assert.equal(f2.pickupPressed, false, 'pickupPressed latch must clear after sim step');
  assert.equal(f2.pausePressed, false, 'pausePressed latch must clear after sim step');
  assert.equal(f2.selectIndex, undefined, 'selectIndex latch must clear after sim step');

  // Wheel triggers swapPressed edge latch; releasing buttons clears held flags
  input.simulateMouseButton(0, false);
  input.simulateKeyUp('ShiftLeft');
  input.simulateKeyUp('KeyI');
  input.simulateKeyUp('KeyL');
  input.simulateWheel(120);
  const f3 = input.consumeSimInput(cam);
  assert.equal(f3.moveX, 0);
  assert.equal(f3.moveY, 0);
  assert.equal(f3.fireHeld, false);
  assert.equal(f3.activeHeld, false);
  assert.equal(f3.swapPressed, true, 'Mouse wheel should trigger swapPressed');

  // Arrow keys work alongside custom keybinds
  input.simulateKeyDown('ArrowLeft');
  const f4 = input.consumeSimInput(cam);
  assert.equal(f4.moveX, -1);
  assert.equal(f4.swapPressed, false);

  console.log('[PASS] 4. InputManager: custom keybinds, arrows, mouse->world transform & edge-triggered latch clearing');
}

function createMockCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  fillStyles: string[];
  fillRects: Array<{ x: number; y: number; w: number; h: number; style: string }>;
  clipCount: number;
  fillTexts: string[];
} {
  const fillStyles: string[] = [];
  const fillRects: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  const fillTexts: string[] = [];
  const state = { clipCount: 0 };
  let curFill = '#000000';
  const noop = (): void => {};
  const grad = { addColorStop: noop };
  const mock = {
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000000',
    font: '8px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    get fillStyle(): string {
      return curFill;
    },
    set fillStyle(v: string | object) {
      if (typeof v === 'string') {
        curFill = v;
        fillStyles.push(v);
      }
    },
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    strokeRect: noop,
    clearRect: noop,
    drawImage: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    clip: () => {
      state.clipCount += 1;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRects.push({ x, y, w, h, style: curFill });
    },
    fillText: (text: string) => {
      fillTexts.push(text);
    },
  };
  return {
    ctx: mock as unknown as CanvasRenderingContext2D,
    fillStyles,
    fillRects,
    get clipCount() {
      return state.clipCount;
    },
    fillTexts,
  };
}

function testVisualUiParityFixes(): void {
  // RT-01: Title logo animation clamps permanently at frame 7 (complete title emblem)
  assert.equal(computeTitleLogoFrame(0, 8), 0);
  assert.equal(computeTitleLogoFrame(0.5, 8), 6);
  assert.equal(computeTitleLogoFrame(1.0, 8), 7);
  assert.equal(computeTitleLogoFrame(60.0, 8), 7, 'Logo must never loop back to partial frames');

  // RT-02: Portrait indexing formula (raceIndex - 1) * 2 + (skin === 'b' ? 1 : 0) across all 12 mutants
  for (let r = 1; r <= 12; r++) {
    assert.equal(computePortraitFrame(r, 'a', 64), (r - 1) * 2);
    assert.equal(computePortraitFrame(r, 'b', 64), (r - 1) * 2 + 1);
  }
  assert.equal(computePortraitFrame(1, 'a', 64), 0); // Fish A
  assert.equal(computePortraitFrame(1, 'b', 64), 1); // Fish B
  assert.equal(computePortraitFrame(12, 'a', 64), 22); // Rogue A
  assert.equal(computePortraitFrame(12, 'b', 64), 23); // Rogue B

  // RT-02: validateSaveData keeps bSkinUnlocked=true even on older saves with false
  const oldSave = validateSaveData({ mutants: { fish: { unlocked: false, bSkinUnlocked: false } } });
  assert.equal(oldSave.mutants.fish.bSkinUnlocked, true);

  // RT-03: sprHealthFill frame polarity (0 = white hurt flash, 1 = red normal fill)
  assert.equal(resolveHealthFillFrame(0), 1);
  assert.equal(resolveHealthFillFrame(6), 0);

  // RT-05: Bitmap font multi-pass outline alpha stays strictly below foreground alpha when fading
  assert.equal(computeShadowPassAlpha(1, 5), 1);
  for (const a of [0.2, 0.5, 0.8]) {
    const passA = computeShadowPassAlpha(a, 5);
    const compounded = 1 - Math.pow(1 - passA, 5);
    assert.ok(compounded < a, `Compounded outline alpha ${compounded} must stay below foreground ${a}`);
  }

  // RT-02, RT-06, RT-07: MenuSystem headless layout & interaction verification in 320x240 and 426x240
  const bundle = createFallbackBundle();
  const menus = new MenuSystem(bundle);
  const save = createDefaultSaveData();

  // Campfire: clicking SKIN: A emits toggle_bskin cleanly
  const campMock = createMockCanvasContext();
  menus.render(campMock.ctx, {
    screen: 'campfire',
    save,
    simState: null,
    width: LOGICAL_WIDTH_4_3,
    height: LOGICAL_HEIGHT,
    timeSec: 1.5,
    returnScreenFromOptions: 'title',
  });
  const skinBtn = menus.getHitRegions().find((r) => r.id === 'camp_skin');
  assert.ok(skinBtn, 'Expected camp_skin hit region on campfire');
  const toggleAct = skinBtn.onActivate();
  assert.deepEqual(toggleAct, { type: 'toggle_bskin', mutant: 'fish' });

  // RT-06: mutation_select & ultra_select dark backdrop
  for (const scr of ['mutation_select', 'ultra_select'] as const) {
    const mMock = createMockCanvasContext();
    menus.render(mMock.ctx, {
      screen: scr,
      save,
      simState: null,
      width: LOGICAL_WIDTH_4_3,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
    });
    assert.equal(mMock.fillRects[0]?.style, 'rgba(10, 9, 14, 0.92)', `${scr} must use dark backdrop`);
  }

  // RT-07: Options modal non-overlapping header/tabs & single-line AIM button in both 320x240 and 426x240
  for (const vw of [LOGICAL_WIDTH_4_3, LOGICAL_WIDTH_16_9]) {
    const optMock = createMockCanvasContext();
    menus.render(optMock.ctx, {
      screen: 'options',
      save,
      simState: null,
      width: vw,
      height: LOGICAL_HEIGHT,
      timeSec: 1,
      returnScreenFromOptions: 'title',
    });
    const regions = menus.getHitRegions();
    const back = regions.find((r) => r.id === 'opt_back');
    const tabGen = regions.find((r) => r.id === 'opt_tab_general');
    const tabCtrl = regions.find((r) => r.id === 'opt_tab_controls');
    const wide = regions.find((r) => r.id === 'opt_widescreen');
    const fpsBtn = regions.find((r) => r.id === 'opt_fps');
    assert.ok(back && tabGen && tabCtrl && wide && fpsBtn, `Expected options regions at width=${vw}`);
    assert.ok(tabGen.y >= back.y + back.h, `Tabs must sit below BACK/OPTIONS row at width=${vw}`);
    assert.ok(tabCtrl.x >= tabGen.x + tabGen.w, `KEYBINDS tab must sit cleanly right of VIDEO/AUDIO at width=${vw}`);
    assert.ok(wide.y >= tabGen.y + tabGen.h, `Controls must sit cleanly below tab row at width=${vw}`);
    assert.ok(
      !optMock.fillTexts.some((t) => t.includes('#')),
      'Options AIM button must not contain raw # newline markup',
    );
    // Default save has targetFps=120 -> clicking cycles 120 -> 30
    assert.deepEqual(fpsBtn.onActivate(), {
      type: 'update_render',
      partial: { targetFps: 30, classic30Fps: true },
    });
  }

  // 3-state FPS cycling & formatting
  assert.equal(cycleTargetFps(30), 60);
  assert.equal(cycleTargetFps(60), 120);
  assert.equal(cycleTargetFps(120), 30);
  assert.equal(formatTargetFpsLabel(30), 'FPS: @y30 CLASSIC');
  assert.equal(formatTargetFpsLabel(60), 'FPS: @g60 SMOOTH');
  assert.equal(formatTargetFpsLabel(120), 'FPS: @b120 ULTRA');

  // Game Over fallback corpse frame resolves to last frame (never frame 0 flash when multi-frame)
  assert.equal(resolveCorpseFrame(1), 0);
  assert.equal(resolveCorpseFrame(5), 4);
  assert.equal(resolveCorpseFrame(0), 0);

  // GlowStampCache radius bucketing & headless safety
  assert.equal(snapGlowRadius(6), 8);
  assert.equal(snapGlowRadius(20), 24);
  assert.equal(snapGlowRadius(50), 64);
  const glowCache = new GlowStampCache(32);
  assert.equal(glowCache.getGlowStamp('rgba(80,255,115,0.3)', 24), null); // headless Node safe

  console.log('[PASS] 5. Visual, 30/60/120 FPS & Krunked Throne UI Checks: logo clamp, A/B portraits, HP polarity, corpse frame, 3-state FPS, glow cache & options layout');
}

async function main(): Promise<void> {
  testSaveManager();
  testCamera();
  await testBitmapFont();
  testInputManager();
  testVisualUiParityFixes();
  console.log('ALL RENDERER/UI/INPUT SELF-TESTS PASSED');
}

main().catch((err) => {
  console.error('SELFTEST FAILED:', err);
  process.exit(1);
});
