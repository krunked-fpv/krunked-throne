/**
 * Music and ambience track routing and resolution for Nuclear Throne.
 * Maps screen, area, biome, boss, loop, and pause state to canonical audio asset keys.
 */

import type { AreaCode, AssetManifest, BiomeId, BossId, GameScreen } from '@/contracts';

export interface MusicRouteContext {
  screen?: GameScreen;
  areaCode?: AreaCode;
  biome?: BiomeId;
  loop?: number;
  bossId?: BossId | null;
  bossDefeated?: boolean;
  paused?: boolean;
}

export interface MusicRouteResult {
  musicTrack: string | null;
  ambienceTrack: string | null;
  duckingFactor: number;
}

/** Default pause ducking multiplier (reduces music volume by ~65%) */
export const PAUSE_DUCKING_FACTOR = 0.35;

/** Candidate priority list for Boss tracks */
export const BOSS_MUSIC_MAP: Record<BossId, readonly string[]> = {
  big_bandit: ['mus/Boss1', 'musBoss1', 'mus/boss1', 'mus/Boss1A', 'musBoss1A'],
  big_dog: ['mus/Boss2', 'musBoss2', 'mus/boss2', 'mus/Boss2A', 'musBoss2A'],
  lil_hunter: ['mus/Boss3', 'musBoss3', 'mus/boss3', 'mus/Boss3A', 'musBoss3A'],
  nuclear_throne: ['mus/Boss4', 'mus/Boss4A', 'musBoss4A', 'musBoss4', 'mus/boss4'],
  throne_ii: ['mus/Boss5', 'musBoss5', 'mus/boss5', 'mus/Boss5A', 'musBoss5A'],
};

/** Alternate Loop B-tracks for biomes that have B-side themes in Nuclear Throne */
export const BIOME_MUSIC_B_MAP: Partial<Record<BiomeId, readonly string[]>> = {
  desert: ['mus/1b', 'mus1b', 'mus/1', 'mus1'],
  scrapyard: ['mus/3b', 'mus3b', 'mus/3', 'mus3'],
  frozen_city: ['mus/5b', 'mus5b', 'mus/5', 'mus5'],
  palace: ['mus/7b', 'mus7b', 'mus/7', 'mus7'],
  vault: ['mus/100b', 'mus100b', 'mus/100', 'mus100'],
  hq: ['mus/106b', 'mus106b', 'mus/106', 'mus106'],
};

/** Candidate priority list for Biome / Area music */
export const BIOME_MUSIC_MAP: Record<BiomeId, readonly string[]> = {
  campfire: ['musThemeA', 'mus/ThemeA', 'mus/ThemeB', 'musThemeB', 'musTheme'],
  desert: ['mus/1', 'mus1', 'musDesert', 'musThemeA'],
  sewers: ['mus/2', 'mus2', 'musSewers'],
  scrapyard: ['mus/3', 'mus3', 'musScrapyard'],
  caves: ['mus/4', 'mus4', 'musCaves'],
  frozen_city: ['mus/5', 'mus5', 'musFrozenCity'],
  labs: ['mus/6', 'mus6', 'musLabs'],
  palace: ['mus/7', 'mus7', 'musPalace'],
  vault: ['mus/100', 'mus100', 'musVault', 'mus/CrownVault'],
  oasis: ['mus/101', 'mus101', 'mus/1b', 'mus/1', 'musOasis'],
  pizza_sewers: ['mus/102', 'mus102', 'mus/2', 'musPizzaSewers'],
  mansion: ['mus/103', 'mus103', 'mus/3b', 'mus/3', 'musMansion', 'musYV'],
  cursed_caves: ['mus/104', 'mus104', 'mus/4', 'musCursedCaves'],
  jungle: ['mus/105', 'mus105', 'mus/5b', 'mus/5', 'musJungle'],
  hq: ['mus/106', 'mus106', 'mus/7', 'musHQ', 'mus/hq'],
};

/** Candidate priority list for Biome / Area ambience */
export const BIOME_AMBIENCE_MAP: Record<BiomeId, readonly string[]> = {
  campfire: ['amb/0', 'amb0', 'ambCampfire', 'amb/Campfire'],
  desert: ['amb/1', 'amb1', 'ambDesert', 'amb/Desert'],
  sewers: ['amb/2', 'amb2', 'ambSewers', 'amb/Sewers'],
  scrapyard: ['amb/3', 'amb3', 'ambScrapyard', 'amb/Scrapyard'],
  caves: ['amb/4', 'amb4', 'ambCaves', 'amb/Caves'],
  frozen_city: ['amb/5', 'amb5', 'ambFrozenCity', 'amb/FrozenCity'],
  labs: ['amb/6', 'amb6', 'ambLabs', 'amb/Labs'],
  palace: ['amb/7', 'amb7', 'ambPalace', 'amb/Palace'],
  vault: ['amb/100', 'amb100', 'amb/vault', 'ambVault', 'amb/0'],
  oasis: ['amb/101', 'amb101', 'amb/1', 'amb1'],
  pizza_sewers: ['amb/102', 'amb102', 'amb/2', 'amb2'],
  mansion: ['amb/103', 'amb103', 'amb/3', 'amb3'],
  cursed_caves: ['amb/104', 'amb104', 'amb/4', 'amb4'],
  jungle: ['amb/105', 'amb105', 'amb/5', 'amb5'],
  hq: ['amb/106', 'amb106', 'amb/7', 'amb7'],
};

/** Candidate priority list for Area Codes */
export const AREA_CODE_TO_BIOME: Record<AreaCode, BiomeId> = {
  '1-1': 'desert',
  '1-2': 'desert',
  '1-3': 'desert',
  '2-1': 'sewers',
  '3-1': 'scrapyard',
  '3-2': 'scrapyard',
  '3-3': 'scrapyard',
  '4-1': 'caves',
  '5-1': 'frozen_city',
  '5-2': 'frozen_city',
  '5-3': 'frozen_city',
  '6-1': 'labs',
  '7-1': 'palace',
  '7-2': 'palace',
  '7-3': 'palace',
  '0-1': 'campfire',
  '1-?': 'oasis',
  '2-?': 'pizza_sewers',
  '3-?': 'mansion',
  '4-?': 'cursed_caves',
  '5-?': 'jungle',
  vault: 'vault',
  'hq-1': 'hq',
};

/**
 * Resolves a track candidate against the manifest record (e.g. manifest.music or manifest.ambience).
 * Checks exact match and normalized match in strict candidate priority order so higher-priority
 * tracks (like 'musThemeA' -> 'mus/ThemeA') are never shadowed by lower-priority exact keys.
 * If manifest is not provided or empty, returns candidates[0].
 */
export function resolveCandidateKey(
  candidates: readonly string[],
  trackRegistry?: Record<string, string>
): string | null {
  if (!candidates.length) return null;
  if (!trackRegistry || Object.keys(trackRegistry).length === 0) {
    return candidates[0] ?? null;
  }

  const registryKeys = Object.keys(trackRegistry).filter((key) => Boolean(trackRegistry[key]));
  if (registryKeys.length === 0) {
    return candidates[0] ?? null;
  }

  for (const candidate of candidates) {
    if (trackRegistry[candidate]) {
      return candidate;
    }
    const norm = candidate.toLowerCase().replace(/^mus[/_-]?/, '').replace(/^amb[/_-]?/, '');
    for (const key of registryKeys) {
      const normKey = key.toLowerCase().replace(/^mus[/_-]?/, '').replace(/^amb[/_-]?/, '');
      if (norm === normKey) {
        return key;
      }
    }
  }

  // Fallback to first candidate so caller knows the desired track name
  return candidates[0] ?? null;
}

/**
 * Returns the music track key for given context, resolving against manifest if available.
 */
export function getMusicTrack(
  ctx: MusicRouteContext,
  manifest?: AssetManifest
): string | null {
  const { screen, areaCode, biome, loop, bossId, bossDefeated } = ctx;

  // 1. Screen overrides
  if (screen === 'title' || screen === 'campfire') {
    return resolveCandidateKey(
      ['musThemeA', 'mus/ThemeA', 'mus/ThemeB', 'musThemeB'],
      manifest?.music
    );
  }

  if (screen === 'options' && !areaCode && !biome && !bossId) {
    return resolveCandidateKey(
      ['musThemeA', 'mus/ThemeA', 'mus/ThemeB', 'musThemeB'],
      manifest?.music
    );
  }

  if (screen === 'game_over') {
    return resolveCandidateKey(
      ['musGameOver', 'mus/BossDead', 'mus/ThemeB', 'mus/GameOver', 'musDead'],
      manifest?.music
    );
  }

  if (screen === 'victory') {
    return resolveCandidateKey(
      ['musCredits', 'mus/Credits', 'mus/ThemeA', 'musThemeA'],
      manifest?.music
    );
  }

  // Mutation / Ultra select: silence combat music cleanly so NT's mutation ambience (amb/0b) breathes
  if (screen === 'mutation_select' || screen === 'ultra_select') {
    return null;
  }

  // 2. Boss defeated wind-down (exits boss combat music cleanly once boss falls)
  if (bossDefeated && !bossId) {
    return resolveCandidateKey(
      ['mus/BossDead', 'musBossDead', 'mus/Boss4Silence'],
      manifest?.music
    );
  }

  // 3. Active Boss overrides (with B-side Throne track on odd loops)
  if (bossId && BOSS_MUSIC_MAP[bossId]) {
    const useLoopB = Boolean(loop && loop > 0 && loop % 2 === 1);
    const candidates =
      bossId === 'nuclear_throne' && useLoopB
        ? ['mus/Boss4B', 'musBoss4B', ...BOSS_MUSIC_MAP[bossId]]
        : BOSS_MUSIC_MAP[bossId];
    return resolveCandidateKey(candidates, manifest?.music);
  }

  // 4. Sleeping boss intros:
  //    - 3-3 Scrapyard before waking Big Dog: silent Scrapyard ambience (no music track until wake)
  //    - 7-3 Palace Throne carpet approach before waking The Throne: Boss4Silence
  if (areaCode === '3-3' && !bossId) {
    return null;
  }

  if (areaCode === '7-3' && !bossId) {
    return resolveCandidateKey(
      ['mus/Boss4Silence', 'musBoss4Silence'],
      manifest?.music
    );
  }

  // 5. Biome / Area resolution (with Loop B-side soundtrack variants on odd loops)
  let effectiveBiome = biome;
  if (!effectiveBiome && areaCode && AREA_CODE_TO_BIOME[areaCode]) {
    effectiveBiome = AREA_CODE_TO_BIOME[areaCode];
  }

  if (effectiveBiome && BIOME_MUSIC_MAP[effectiveBiome]) {
    const useLoopB = Boolean(loop && loop > 0 && loop % 2 === 1);
    const bCandidates = useLoopB ? BIOME_MUSIC_B_MAP[effectiveBiome] : undefined;
    const candidates = bCandidates ?? BIOME_MUSIC_MAP[effectiveBiome];
    return resolveCandidateKey(candidates, manifest?.music);
  }

  // Default fallback
  return resolveCandidateKey(['mus/1', 'mus1', 'musThemeA'], manifest?.music);
}

/**
 * Returns the ambience track key for given context, resolving against manifest if available.
 */
export function getAmbienceTrack(
  ctx: MusicRouteContext,
  manifest?: AssetManifest
): string | null {
  const { screen, areaCode, biome } = ctx;

  if (screen === 'title' || screen === 'campfire') {
    return resolveCandidateKey(
      ['amb/0', 'amb0', 'ambCampfire'],
      manifest?.ambience
    );
  }

  if (screen === 'options' && !areaCode && !biome) {
    return resolveCandidateKey(
      ['amb/0', 'amb0', 'ambCampfire'],
      manifest?.ambience
    );
  }

  if (screen === 'mutation_select' || screen === 'ultra_select') {
    return resolveCandidateKey(
      ['amb/0b', 'amb0b', 'amb/0', 'amb0', 'ambCampfire'],
      manifest?.ambience
    );
  }

  if (screen === 'game_over' || screen === 'victory') {
    return null;
  }

  let effectiveBiome = biome;
  if (!effectiveBiome && areaCode && AREA_CODE_TO_BIOME[areaCode]) {
    effectiveBiome = AREA_CODE_TO_BIOME[areaCode];
  }

  if (effectiveBiome && BIOME_AMBIENCE_MAP[effectiveBiome]) {
    const candidates = BIOME_AMBIENCE_MAP[effectiveBiome];
    return resolveCandidateKey(candidates, manifest?.ambience);
  }

  return resolveCandidateKey(['amb/1', 'amb1'], manifest?.ambience);
}

/**
 * Resolves full music and ambience route and ducking factor for current context.
 */
export function resolveMusicRoute(
  ctx: MusicRouteContext,
  manifest?: AssetManifest
): MusicRouteResult {
  const musicTrack = getMusicTrack(ctx, manifest);
  const ambienceTrack = getAmbienceTrack(ctx, manifest);
  const duckingFactor = ctx.paused || ctx.screen === 'paused' ? PAUSE_DUCKING_FACTOR : 1.0;

  return {
    musicTrack,
    ambienceTrack,
    duckingFactor,
  };
}
