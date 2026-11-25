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
  nuclear_throne: ['mus/Boss4', 'musBoss4', 'mus/boss4', 'mus/Boss4A', 'musBoss4A'],
  throne_ii: ['mus/Boss5', 'musBoss5', 'mus/boss5', 'mus/Boss5A', 'musBoss5A'],
};

/** Candidate priority list for Biome / Area music */
export const BIOME_MUSIC_MAP: Record<BiomeId, readonly string[]> = {
  campfire: ['musThemeA', 'mus/100', 'musThemeB', 'mus100', 'musTheme'],
  desert: ['mus/1', 'mus1', 'musDesert', 'musThemeA'],
  sewers: ['mus/2', 'mus2', 'musSewers'],
  scrapyard: ['mus/3', 'mus3', 'musScrapyard'],
  caves: ['mus/4', 'mus4', 'musCaves'],
  frozen_city: ['mus/5', 'mus5', 'musFrozenCity'],
  labs: ['mus/6', 'mus6', 'musLabs'],
  palace: ['mus/7', 'mus7', 'musPalace'],
  vault: ['mus/102', 'mus102', 'musVault', 'mus/CrownVault'],
  oasis: ['mus/1b', 'mus/1', 'mus1', 'musOasis'],
  pizza_sewers: ['mus/2b', 'mus/2', 'mus2', 'musPizzaSewers'],
  mansion: ['mus/3b', 'mus/3', 'mus3', 'musMansion', 'musYV'],
  cursed_caves: ['mus/4b', 'mus/4', 'mus4', 'musCursedCaves'],
  jungle: ['mus/5b', 'mus/5', 'mus5', 'musJungle'],
  hq: ['mus/7', 'mus7', 'musHQ', 'mus/hq'],
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
  vault: ['amb/vault', 'ambVault', 'amb/CrownVault', 'amb/0'],
  oasis: ['amb/1', 'amb1', 'ambDesert'],
  pizza_sewers: ['amb/2', 'amb2', 'ambSewers'],
  mansion: ['amb/3', 'amb3', 'ambScrapyard'],
  cursed_caves: ['amb/4', 'amb4', 'ambCaves'],
  jungle: ['amb/5', 'amb5', 'ambFrozenCity'],
  hq: ['amb/7', 'amb7', 'ambPalace'],
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

  // Exact match first
  for (const candidate of candidates) {
    if (trackRegistry[candidate] !== undefined) {
      return candidate;
    }
  }

  // Normalized/loose match (e.g. ignoring 'mus/' prefix or case)
  const registryKeys = Object.keys(trackRegistry);
  for (const candidate of candidates) {
    const norm = candidate.toLowerCase().replace(/^mus\//, '').replace(/^amb\//, '');
    for (const key of registryKeys) {
      const normKey = key.toLowerCase().replace(/^mus\//, '').replace(/^amb\//, '');
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
  const { screen, areaCode, biome, bossId } = ctx;

  // 1. Screen overrides
  if (screen === 'title' || screen === 'campfire') {
    return resolveCandidateKey(
      ['musThemeA', 'mus/100', 'musThemeB', 'mus100'],
      manifest?.music
    );
  }

  if (screen === 'game_over') {
    return resolveCandidateKey(
      ['musGameOver', 'mus/GameOver', 'musDead'],
      manifest?.music
    );
  }

  if (screen === 'victory') {
    return resolveCandidateKey(
      ['musCredits', 'musThemeA', 'mus/Credits'],
      manifest?.music
    );
  }

  // 2. Active Boss overrides
  if (bossId && BOSS_MUSIC_MAP[bossId]) {
    const candidates = BOSS_MUSIC_MAP[bossId];
    return resolveCandidateKey(candidates, manifest?.music);
  }

  // 3. Biome / Area resolution
  let effectiveBiome = biome;
  if (!effectiveBiome && areaCode && AREA_CODE_TO_BIOME[areaCode]) {
    effectiveBiome = AREA_CODE_TO_BIOME[areaCode];
  }

  if (effectiveBiome && BIOME_MUSIC_MAP[effectiveBiome]) {
    const candidates = BIOME_MUSIC_MAP[effectiveBiome];
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
