/**
 * Nuclear Throne Clean-Room Audio Module.
 * Exports AudioEngine, music router utilities, procedural synth fallback,
 * procedural wasteland music/ambience sequencer, and spatial audio helpers.
 */

export {
  AudioEngine,
  calculateSpatial,
  DEFAULT_AUDIO_SETTINGS,
  MAX_SOUND_VOICES,
  MAX_GLOBAL_VOICES,
  DEFAULT_COOLDOWN_MS,
  RAD_COOLDOWN_MS,
  DEFAULT_FALLOFF_PX,
  DEFAULT_PITCH_JITTER,
  RAD_STREAK_WINDOW_MS,
  RAD_STREAK_MAX,
  RAD_STREAK_STEP,
  type AssetSourceOptions,
  type AudioEngineOptions,
  type AudioStats,
  type SpatialResult,
} from './engine';

export {
  resolveMusicRoute,
  getMusicTrack,
  getAmbienceTrack,
  resolveCandidateKey,
  PAUSE_DUCKING_FACTOR,
  BOSS_MUSIC_MAP,
  BIOME_MUSIC_MAP,
  BIOME_MUSIC_B_MAP,
  BIOME_AMBIENCE_MAP,
  AREA_CODE_TO_BIOME,
  type MusicRouteContext,
  type MusicRouteResult,
} from './music-router';

export {
  playSynthSound,
  classifySound,
  type SynthSoundKind,
  type SynthVoice,
  type SynthOptions,
} from './synth-fallback';

export {
  SynthMusicSequencer,
  resolveSynthMusicTheme,
  resolveSynthAmbienceKind,
  type SynthMusicThemeId,
  type SynthAmbienceKind,
} from './synth-music';
