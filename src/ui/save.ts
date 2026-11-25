import type {
  AreaCode,
  AudioSettings,
  ControlSettings,
  CrownId,
  KeyBindings,
  MutantId,
  MutantSaveProgress,
  RenderSettings,
  SaveData,
  TargetFps,
  TouchControlsMode,
} from '@/contracts';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEYBINDINGS,
  MAX_GAMEPAD_DEADZONE,
  MIN_GAMEPAD_DEADZONE,
} from '@/input';
import { ALL_AREA_CODES, ALL_CROWN_IDS, ALL_MUTANT_IDS } from './data-provider';

export const SAVE_STORAGE_KEY = 'krunked_throne_save_v1';
export const LEGACY_SAVE_STORAGE_KEY = 'nt_cleanroom_save_v1';
export const SAVE_SCHEMA_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class InMemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const MUTANT_SET = new Set<string>(ALL_MUTANT_IDS);
const CROWN_SET = new Set<string>(ALL_CROWN_IDS);
const AREA_SET = new Set<string>(ALL_AREA_CODES);

const AREA_RANK: Record<AreaCode, number> = {
  '1-1': 1,
  '1-2': 2,
  '1-3': 3,
  '1-?': 3.5,
  '2-1': 4,
  '2-?': 4.5,
  '3-1': 5,
  '3-2': 6,
  '3-3': 7,
  '3-?': 7.5,
  '4-1': 8,
  '4-?': 8.5,
  '5-1': 9,
  '5-2': 10,
  '5-3': 11,
  '5-?': 11.5,
  '6-1': 12,
  '7-1': 13,
  '7-2': 14,
  '7-3': 15,
  '0-1': 16,
  vault: 8.2,
  'hq-1': 17,
};

function compareProgress(
  loopA: number,
  areaA: AreaCode,
  loopB: number,
  areaB: AreaCode,
): number {
  if (loopA !== loopB) return loopA - loopB;
  return (AREA_RANK[areaA] ?? 0) - (AREA_RANK[areaB] ?? 0);
}

function clamp01(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(1, val));
}

function nonNegInt(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.floor(val));
}

function boolVal(val: unknown, fallback: boolean): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

function keyCodeVal(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0 && val.length <= 32) {
    return val.trim();
  }
  return fallback;
}

function isMutantId(v: unknown): v is MutantId {
  return typeof v === 'string' && MUTANT_SET.has(v);
}

function isCrownId(v: unknown): v is CrownId {
  return typeof v === 'string' && CROWN_SET.has(v);
}

function isAreaCode(v: unknown): v is AreaCode {
  return typeof v === 'string' && AREA_SET.has(v);
}

function isTargetFps(v: unknown): v is TargetFps {
  return v === 30 || v === 60 || v === 120;
}

function isTouchControlsMode(v: unknown): v is TouchControlsMode {
  return v === 'auto' || v === 'off';
}

function clampDeadzone(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  const clamped = Math.max(MIN_GAMEPAD_DEADZONE, Math.min(MAX_GAMEPAD_DEADZONE, val));
  return Math.round(clamped * 100) / 100;
}

export function createDefaultMutantProgress(id: MutantId): MutantSaveProgress {
  return {
    unlocked: true, // All 12 mutants unlocked by default for full-roster play
    bSkinUnlocked: true,
    goldenWeapon: id === 'yv' ? 'golden_revolver' : null,
    crownsUnlocked: [...ALL_CROWN_IDS],
    bestArea: '1-1',
    bestLoop: 0,
    bestKills: 0,
    runs: 0,
  };
}

export function createDefaultSaveData(): SaveData {
  const mutants = {} as Record<MutantId, MutantSaveProgress>;
  for (const id of ALL_MUTANT_IDS) {
    mutants[id] = createDefaultMutantProgress(id);
  }

  return {
    version: SAVE_SCHEMA_VERSION,
    selectedMutant: 'fish',
    selectedSkins: {},
    selectedCrown: 'none',
    useGoldenWeapon: false,
    audio: {
      masterVolume: 0.8,
      sfxVolume: 0.9,
      musicVolume: 0.65,
      ambienceVolume: 0.5,
      muted: false,
    },
    render: {
      widescreen: false,
      targetFps: 120,
      classic30Fps: false,
      screenShakeScale: 1,
      crosshairStyle: 0,
      showFps: false,
      pixelSnap: true,
    },
    keybinds: { ...DEFAULT_KEYBINDINGS },
    controls: { ...DEFAULT_CONTROL_SETTINGS },
    mutants,
    totalRuns: 0,
    totalKills: 0,
    totalDeaths: 0,
    bestKills: 0,
    bestArea: '1-1',
    bestLoop: 0,
  };
}

/**
 * Validates and sanitizes an untrusted JSON object into a complete, schema-valid SaveData.
 * Always guarantees all 12 mutants exist and remain playable.
 */
export function validateSaveData(raw: unknown): SaveData {
  const def = createDefaultSaveData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return def;
  }
  const obj = raw as Record<string, unknown>;

  const audioRaw = (obj.audio && typeof obj.audio === 'object' ? obj.audio : {}) as Record<
    string,
    unknown
  >;
  const renderRaw = (obj.render && typeof obj.render === 'object' ? obj.render : {}) as Record<
    string,
    unknown
  >;
  const kbRaw = (obj.keybinds && typeof obj.keybinds === 'object' ? obj.keybinds : {}) as Record<
    string,
    unknown
  >;
  const ctrlRaw = (
    obj.controls && typeof obj.controls === 'object' ? obj.controls : {}
  ) as Record<string, unknown>;
  const skinsRaw = (
    obj.selectedSkins && typeof obj.selectedSkins === 'object' ? obj.selectedSkins : {}
  ) as Record<string, unknown>;
  const mutantsRaw = (
    obj.mutants && typeof obj.mutants === 'object' ? obj.mutants : {}
  ) as Record<string, unknown>;

  const selectedSkins: Partial<Record<MutantId, 'a' | 'b'>> = {};
  for (const id of ALL_MUTANT_IDS) {
    const s = skinsRaw[id];
    if (s === 'a' || s === 'b') {
      selectedSkins[id] = s;
    }
  }

  const mutants = {} as Record<MutantId, MutantSaveProgress>;
  for (const id of ALL_MUTANT_IDS) {
    const mDef = createDefaultMutantProgress(id);
    const mRaw = mutantsRaw[id];
    if (!mRaw || typeof mRaw !== 'object' || Array.isArray(mRaw)) {
      mutants[id] = mDef;
      continue;
    }
    const mr = mRaw as Record<string, unknown>;
    const rawCrowns = Array.isArray(mr.crownsUnlocked)
      ? mr.crownsUnlocked.filter(isCrownId)
      : mDef.crownsUnlocked;
    const crownSet = new Set<CrownId>(['none', ...rawCrowns]);

    mutants[id] = {
      unlocked: true, // Keep all 12 mutants unlocked for full-roster play
      bSkinUnlocked: true, // Keep all B-skins unlocked for immediate campfire toggling
      goldenWeapon:
        typeof mr.goldenWeapon === 'string' && mr.goldenWeapon.length > 0
          ? mr.goldenWeapon
          : mr.goldenWeapon === null
            ? null
            : mDef.goldenWeapon,
      crownsUnlocked: Array.from(crownSet),
      bestArea: isAreaCode(mr.bestArea) ? mr.bestArea : mDef.bestArea,
      bestLoop: nonNegInt(mr.bestLoop, mDef.bestLoop),
      bestKills: nonNegInt(mr.bestKills, mDef.bestKills),
      runs: nonNegInt(mr.runs, mDef.runs),
    };
  }

  const crosshairRaw =
    typeof renderRaw.crosshairStyle === 'number' && Number.isFinite(renderRaw.crosshairStyle)
      ? Math.max(0, Math.min(6, Math.floor(renderRaw.crosshairStyle)))
      : def.render.crosshairStyle;

  const targetFps: TargetFps = isTargetFps(renderRaw.targetFps)
    ? renderRaw.targetFps
    : typeof renderRaw.classic30Fps === 'boolean'
      ? (renderRaw.classic30Fps ? 30 : 120)
      : def.render.targetFps;

  return {
    version: SAVE_SCHEMA_VERSION,
    selectedMutant: isMutantId(obj.selectedMutant) ? obj.selectedMutant : def.selectedMutant,
    selectedSkins,
    selectedCrown: isCrownId(obj.selectedCrown) ? obj.selectedCrown : def.selectedCrown,
    useGoldenWeapon: boolVal(obj.useGoldenWeapon, def.useGoldenWeapon),
    audio: {
      masterVolume: clamp01(audioRaw.masterVolume, def.audio.masterVolume),
      sfxVolume: clamp01(audioRaw.sfxVolume, def.audio.sfxVolume),
      musicVolume: clamp01(audioRaw.musicVolume, def.audio.musicVolume),
      ambienceVolume: clamp01(audioRaw.ambienceVolume, def.audio.ambienceVolume),
      muted: boolVal(audioRaw.muted, def.audio.muted),
    },
    render: {
      widescreen: boolVal(renderRaw.widescreen, def.render.widescreen),
      targetFps,
      classic30Fps: targetFps === 30,
      screenShakeScale: clamp01(renderRaw.screenShakeScale, def.render.screenShakeScale),
      crosshairStyle: crosshairRaw,
      showFps: boolVal(renderRaw.showFps, def.render.showFps),
      pixelSnap: boolVal(renderRaw.pixelSnap, def.render.pixelSnap),
    },
    keybinds: {
      up: keyCodeVal(kbRaw.up, def.keybinds.up),
      down: keyCodeVal(kbRaw.down, def.keybinds.down),
      left: keyCodeVal(kbRaw.left, def.keybinds.left),
      right: keyCodeVal(kbRaw.right, def.keybinds.right),
      swap: keyCodeVal(kbRaw.swap, def.keybinds.swap),
      pickup: keyCodeVal(kbRaw.pickup, def.keybinds.pickup),
      pause: keyCodeVal(kbRaw.pause, def.keybinds.pause),
      activeAlt: keyCodeVal(kbRaw.activeAlt, def.keybinds.activeAlt),
    },
    controls: {
      gamepadAimAssist: boolVal(ctrlRaw.gamepadAimAssist, def.controls.gamepadAimAssist),
      gamepadRumble: boolVal(ctrlRaw.gamepadRumble, def.controls.gamepadRumble),
      gamepadDeadzone: clampDeadzone(ctrlRaw.gamepadDeadzone, def.controls.gamepadDeadzone),
      touchMode: isTouchControlsMode(ctrlRaw.touchMode)
        ? ctrlRaw.touchMode
        : def.controls.touchMode,
    },
    mutants,
    totalRuns: nonNegInt(obj.totalRuns, def.totalRuns),
    totalKills: nonNegInt(obj.totalKills, def.totalKills),
    totalDeaths: nonNegInt(obj.totalDeaths, def.totalDeaths),
    bestKills: nonNegInt(obj.bestKills, def.bestKills),
    bestArea: isAreaCode(obj.bestArea) ? obj.bestArea : def.bestArea,
    bestLoop: nonNegInt(obj.bestLoop, def.bestLoop),
  };
}

export interface RunSummaryInput {
  mutant: MutantId;
  areaCode: AreaCode;
  loop: number;
  kills: number;
  victory?: boolean;
  crown?: CrownId;
  goldenWeapon?: string | null;
}

function resolveDefaultStorage(): StorageLike {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      const ls = globalThis.localStorage;
      const probe = '__nt_storage_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // Fall back to safe in-memory store (Node or sandboxed browser)
  }
  return new InMemoryStorage();
}

/**
 * Manages Krunked Throne SaveData persistence in localStorage ('krunked_throne_save_v1',
 * with seamless read fallback from legacy 'nt_cleanroom_save_v1') with strict schema
 * validation, corrupted JSON recovery, progress tracking across all 12 mutants, and
 * safe in-memory fallback in Node.
 */
export class SaveManager {
  private readonly storage: StorageLike;
  private readonly key: string;
  private data: SaveData;
  private recoveredFromCorruption = false;

  constructor(storage?: StorageLike, key: string = SAVE_STORAGE_KEY) {
    this.storage = storage ?? resolveDefaultStorage();
    this.key = key;
    this.data = this.load();
  }

  wasRecoveredFromCorruption(): boolean {
    return this.recoveredFromCorruption;
  }

  load(): SaveData {
    this.recoveredFromCorruption = false;
    try {
      let raw = this.storage.getItem(this.key);
      if (!raw && this.key === SAVE_STORAGE_KEY) {
        raw = this.storage.getItem(LEGACY_SAVE_STORAGE_KEY);
      }
      if (!raw) {
        this.data = createDefaultSaveData();
        return this.data;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.recoveredFromCorruption = true;
        this.data = createDefaultSaveData();
        this.save();
        return this.data;
      }
      this.data = validateSaveData(parsed);
      return this.data;
    } catch {
      this.recoveredFromCorruption = true;
      this.data = createDefaultSaveData();
      this.save();
      return this.data;
    }
  }

  save(): boolean {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  getData(): SaveData {
    return this.data;
  }

  getSelectedSkin(mutant: MutantId = this.data.selectedMutant): 'a' | 'b' {
    return this.data.selectedSkins[mutant] ?? 'a';
  }

  setSelectedMutant(mutant: MutantId): void {
    this.data.selectedMutant = mutant;
    this.save();
  }

  setSelectedSkin(mutant: MutantId, skin: 'a' | 'b'): void {
    this.data.selectedSkins[mutant] = skin;
    this.save();
  }

  toggleSelectedSkin(mutant: MutantId = this.data.selectedMutant): 'a' | 'b' {
    const next: 'a' | 'b' = this.getSelectedSkin(mutant) === 'a' ? 'b' : 'a';
    this.setSelectedSkin(mutant, next);
    return next;
  }

  setSelectedCrown(crown: CrownId): void {
    this.data.selectedCrown = crown;
    this.save();
  }

  setUseGoldenWeapon(enabled: boolean): void {
    this.data.useGoldenWeapon = enabled;
    this.save();
  }

  updateAudio(partial: Partial<AudioSettings>): AudioSettings {
    this.data.audio = {
      masterVolume: clamp01(partial.masterVolume ?? this.data.audio.masterVolume, this.data.audio.masterVolume),
      sfxVolume: clamp01(partial.sfxVolume ?? this.data.audio.sfxVolume, this.data.audio.sfxVolume),
      musicVolume: clamp01(partial.musicVolume ?? this.data.audio.musicVolume, this.data.audio.musicVolume),
      ambienceVolume: clamp01(partial.ambienceVolume ?? this.data.audio.ambienceVolume, this.data.audio.ambienceVolume),
      muted: partial.muted !== undefined ? Boolean(partial.muted) : this.data.audio.muted,
    };
    this.save();
    return this.data.audio;
  }

  updateRender(partial: Partial<RenderSettings>): RenderSettings {
    const nextCrosshair =
      partial.crosshairStyle !== undefined
        ? Math.max(0, Math.min(6, Math.floor(partial.crosshairStyle)))
        : this.data.render.crosshairStyle;

    let nextTargetFps: TargetFps = this.data.render.targetFps;
    if (isTargetFps(partial.targetFps)) {
      nextTargetFps = partial.targetFps;
    } else if (partial.classic30Fps !== undefined) {
      nextTargetFps = partial.classic30Fps
        ? 30
        : this.data.render.targetFps === 30
          ? 120
          : this.data.render.targetFps;
    }

    this.data.render = {
      widescreen: partial.widescreen !== undefined ? Boolean(partial.widescreen) : this.data.render.widescreen,
      targetFps: nextTargetFps,
      classic30Fps: nextTargetFps === 30,
      screenShakeScale: clamp01(
        partial.screenShakeScale ?? this.data.render.screenShakeScale,
        this.data.render.screenShakeScale,
      ),
      crosshairStyle: nextCrosshair,
      showFps: partial.showFps !== undefined ? Boolean(partial.showFps) : this.data.render.showFps,
      pixelSnap: partial.pixelSnap !== undefined ? Boolean(partial.pixelSnap) : this.data.render.pixelSnap,
    };
    this.save();
    return this.data.render;
  }

  updateKeybinds(partial: Partial<KeyBindings>): KeyBindings {
    this.data.keybinds = {
      up: keyCodeVal(partial.up, this.data.keybinds.up),
      down: keyCodeVal(partial.down, this.data.keybinds.down),
      left: keyCodeVal(partial.left, this.data.keybinds.left),
      right: keyCodeVal(partial.right, this.data.keybinds.right),
      swap: keyCodeVal(partial.swap, this.data.keybinds.swap),
      pickup: keyCodeVal(partial.pickup, this.data.keybinds.pickup),
      pause: keyCodeVal(partial.pause, this.data.keybinds.pause),
      activeAlt: keyCodeVal(partial.activeAlt, this.data.keybinds.activeAlt),
    };
    this.save();
    return this.data.keybinds;
  }

  resetKeybinds(): KeyBindings {
    this.data.keybinds = { ...DEFAULT_KEYBINDINGS };
    this.save();
    return this.data.keybinds;
  }

  updateControls(partial: Partial<ControlSettings>): ControlSettings {
    this.data.controls = {
      gamepadAimAssist:
        partial.gamepadAimAssist !== undefined
          ? Boolean(partial.gamepadAimAssist)
          : this.data.controls.gamepadAimAssist,
      gamepadRumble:
        partial.gamepadRumble !== undefined
          ? Boolean(partial.gamepadRumble)
          : this.data.controls.gamepadRumble,
      gamepadDeadzone: clampDeadzone(
        partial.gamepadDeadzone ?? this.data.controls.gamepadDeadzone,
        this.data.controls.gamepadDeadzone,
      ),
      touchMode:
        partial.touchMode && isTouchControlsMode(partial.touchMode)
          ? partial.touchMode
          : this.data.controls.touchMode,
    };
    this.save();
    return this.data.controls;
  }

  recordRunStart(mutant: MutantId): void {
    this.data.totalRuns += 1;
    const mp = this.data.mutants[mutant];
    if (mp) {
      mp.runs += 1;
    }
    this.save();
  }

  recordRunEnd(summary: RunSummaryInput): void {
    const kills = Math.max(0, Math.floor(summary.kills));
    const loop = Math.max(0, Math.floor(summary.loop));
    this.data.totalKills += kills;
    if (!summary.victory) {
      this.data.totalDeaths += 1;
    }
    if (kills > this.data.bestKills) {
      this.data.bestKills = kills;
    }
    if (compareProgress(loop, summary.areaCode, this.data.bestLoop, this.data.bestArea) > 0) {
      this.data.bestLoop = loop;
      this.data.bestArea = summary.areaCode;
    }

    const mp = this.data.mutants[summary.mutant];
    if (mp) {
      if (kills > mp.bestKills) mp.bestKills = kills;
      if (compareProgress(loop, summary.areaCode, mp.bestLoop, mp.bestArea) > 0) {
        mp.bestLoop = loop;
        mp.bestArea = summary.areaCode;
      }
      if (summary.victory) {
        mp.bSkinUnlocked = true;
      }
      if (summary.crown && !mp.crownsUnlocked.includes(summary.crown)) {
        mp.crownsUnlocked.push(summary.crown);
      }
      if (summary.goldenWeapon) {
        mp.goldenWeapon = summary.goldenWeapon;
      }
    }

    this.save();
  }

  resetAll(): SaveData {
    this.data = createDefaultSaveData();
    this.save();
    return this.data;
  }
}
