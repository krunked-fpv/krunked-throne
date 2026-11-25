/**
 * Canonical shared TypeScript contracts for Krunked Throne.
 * Owned by @architect (see ARCHITECTURE.md & SPEC.md).
 * All modules import shared types from this file to guarantee zero interface drift.
 */

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const TILE_SIZE = 16;
export const LOGICAL_WIDTH_4_3 = 320;
export const LOGICAL_WIDTH_16_9 = 426;
export const LOGICAL_HEIGHT = 240;
export const PLAYER_IFRAMES = 10;

// ============================================================================
// 1. ASSET MANIFEST & ORACLE CONTRACTS (@extractor -> @renderer, @audio, @gameplay)
// ============================================================================

export interface TpagRect {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  boundW: number;
  boundH: number;
  textureId: number;
}

export interface TexturePageDef {
  id: number;
  groupName: string;
  file: string;
  width: number;
  height: number;
  embedded: boolean;
}

export interface SpriteDef {
  id: number;
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  bboxLeft: number;
  bboxRight: number;
  bboxTop: number;
  bboxBottom: number;
  bboxMode: number;
  sepMasks: number;
  playbackSpeed: number;
  playbackSpeedType: number;
  frames: TpagRect[];
}

export type SoundSourceType = 'audo-wav' | 'audo-ogg' | 'external-ogg' | 'fallback-synth';

export interface SoundDef {
  id: number;
  name: string;
  flags: number;
  file: string;
  volume: number;
  pitch: number;
  groupId: number;
  audioId: number;
  sourceType: SoundSourceType;
  path: string;
}

export interface FontGlyph {
  charCode: number;
  x: number;
  y: number;
  w: number;
  h: number;
  shift: number;
  offset: number;
}

export interface FontDef {
  id: number;
  name: string;
  displayName: string;
  tpag: TpagRect;
  scaleX: number;
  scaleY: number;
  lineHeight: number;
  ascender: number;
  glyphs: Record<number, FontGlyph>;
}

export interface ObjectDef {
  id: number;
  name: string;
  spriteId: number;
  spriteName: string | null;
  visible: boolean;
  solid: boolean;
  depth: number;
  persistent: boolean;
  parentId: number;
  textureMaskId: number;
}

export interface AssetManifestStats {
  spriteCount: number;
  tpagCount: number;
  objectCount: number;
  soundCount: number;
  audoCount: number;
  fontCount: number;
  looseOggCount: number;
}

export interface AssetManifest {
  version: number;
  generatedAt: string;
  sourceMode: 'steam' | 'fallback';
  textures: TexturePageDef[];
  sprites: Record<string, SpriteDef>;
  spritesById: string[];
  sounds: Record<string, SoundDef>;
  soundsById: string[];
  music: Record<string, string>;
  ambience: Record<string, string>;
  looseSounds: Record<string, string>;
  fonts: Record<string, FontDef>;
  objects: Record<string, ObjectDef>;
  shaders: string[];
  lang: Record<string, Record<string, string>>;
  stats: AssetManifestStats;
}

export interface OracleObjectEntry {
  name: string;
  parent: string | null;
  category: string;
  spriteName: string | null;
  depth: number | null;
  variables: string[];
  notes: string;
}

export interface OracleData {
  generatedAt: string;
  objectCount: number;
  objects: Record<string, OracleObjectEntry>;
  scripts: string[];
}

// ============================================================================
// 2. GAMEPLAY IDENTIFIERS & STATIC REGISTRIES (@gameplay)
// ============================================================================

export type MutantId =
  | 'fish'
  | 'crystal'
  | 'eyes'
  | 'melting'
  | 'plant'
  | 'yv'
  | 'steroids'
  | 'robot'
  | 'chicken'
  | 'rebel'
  | 'horror'
  | 'rogue';

export type AmmoType = 'melee' | 'bullet' | 'shell' | 'bolt' | 'explosive' | 'energy';

export type MutationId =
  | 'rhino_skin'
  | 'extra_feet'
  | 'plutonium_hunger'
  | 'rabbit_paw'
  | 'throne_butt'
  | 'lucky_shot'
  | 'bloodlust'
  | 'gamma_guts'
  | 'second_stomach'
  | 'back_muscle'
  | 'scarier_face'
  | 'euphoria'
  | 'long_arms'
  | 'boiling_veins'
  | 'shotgun_shoulders'
  | 'recycle_gland'
  | 'laser_brain'
  | 'last_wish'
  | 'eagle_eyes'
  | 'impact_wrists'
  | 'bolt_marrow'
  | 'stress'
  | 'trigger_fingers'
  | 'sharp_teeth'
  | 'patience'
  | 'hammerhead'
  | 'strong_spirit'
  | 'open_mind'
  | 'heavy_heart';

export type UltraId = `${MutantId}_a` | `${MutantId}_b`;

export type CrownId =
  | 'none'
  | 'death'
  | 'life'
  | 'haste'
  | 'guns'
  | 'hatred'
  | 'blood'
  | 'destiny'
  | 'love'
  | 'risk'
  | 'curses'
  | 'luck'
  | 'protection';

export type BiomeId =
  | 'desert'
  | 'sewers'
  | 'scrapyard'
  | 'caves'
  | 'frozen_city'
  | 'labs'
  | 'palace'
  | 'campfire'
  | 'vault'
  | 'oasis'
  | 'pizza_sewers'
  | 'mansion'
  | 'cursed_caves'
  | 'jungle'
  | 'hq';

export type AreaCode =
  | '1-1'
  | '1-2'
  | '1-3'
  | '2-1'
  | '3-1'
  | '3-2'
  | '3-3'
  | '4-1'
  | '5-1'
  | '5-2'
  | '5-3'
  | '6-1'
  | '7-1'
  | '7-2'
  | '7-3'
  | '0-1'
  | '1-?'
  | '2-?'
  | '3-?'
  | '4-?'
  | '5-?'
  | 'vault'
  | 'hq-1';

export type BossId = 'big_bandit' | 'big_dog' | 'lil_hunter' | 'nuclear_throne' | 'throne_ii';

export type ProjectileKind =
  | 'bullet'
  | 'heavy_bullet'
  | 'shell'
  | 'slug'
  | 'flak'
  | 'flame'
  | 'bolt'
  | 'splinter'
  | 'toxic_bolt'
  | 'seeking_bolt'
  | 'disc'
  | 'grenade'
  | 'cluster_grenade'
  | 'rocket'
  | 'nuke'
  | 'blood_grenade'
  | 'laser'
  | 'plasma'
  | 'lightning'
  | 'rad_beam'
  | 'melee_slash'
  | 'thrown_weapon'
  | 'enemy_bullet'
  | 'enemy_flame'
  | 'enemy_laser'
  | 'enemy_plasma'
  | 'idpd_bullet'
  | 'boss_orb'
  | 'boss_missile'
  | 'snare';

export interface WeaponDef {
  id: string;
  numericId: number;
  name: string;
  ammoType: AmmoType;
  ammoCost: number;
  tier: number;
  reloadTicks: number;
  spreadDeg: number;
  kick: number;
  shake: number;
  burstCount: number;
  burstIntervalTicks: number;
  projectilesPerShot: number;
  damage: number;
  projectileSpeed: number;
  projectileKind: ProjectileKind;
  projectileLifeTicks: number;
  pierce: number;
  bounce: number;
  explosionRadius: number;
  meleeReach: number;
  meleeArcDeg: number;
  deflectsProjectiles: boolean;
  destroysProjectiles: boolean;
  auto: boolean;
  golden?: boolean;
  cursed?: boolean;
  ultra?: boolean;
  radCost?: number;
  sprite: string;
  projectileSprite?: string;
  fireSound: string;
  tip?: string;
}

export interface UltraDef {
  id: UltraId;
  mutant: MutantId;
  slot: 'a' | 'b';
  name: string;
  description: string;
  iconIndex: number;
  sprite: string;
}

export interface MutantDef {
  id: MutantId;
  raceIndex: number;
  name: string;
  maxHp: number;
  moveSpeed: number;
  startingWeapon: string;
  secondaryWeapon?: string;
  passiveName: string;
  passiveDesc: string;
  activeName: string;
  activeDesc: string;
  throneButtDesc: string;
  ultras: [UltraDef, UltraDef];
  sprites: {
    idle: string;
    walk: string;
    hurt: string;
    dead: string;
    sit: string;
    goSit: string;
    bIdle?: string;
    bWalk?: string;
    bHurt?: string;
    bDead?: string;
    bSit?: string;
    portrait: string;
    bPortrait?: string;
    charSelect: string;
  };
  sounds: {
    hurt: string;
    dead: string;
    confirm: string;
    active?: string;
  };
}

export interface MutationDef {
  id: MutationId;
  skillIndex: number;
  name: string;
  description: string;
  tip: string;
  sprite: string;
  iconFrame: number;
  hudSprite: string;
}

export interface CrownDef {
  id: CrownId;
  crownIndex: number;
  name: string;
  description: string;
  tip: string;
  spriteIdle: string;
  spriteWalk: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  biomes: BiomeId[];
  maxHp: number;
  moveSpeed: number;
  contactDamage: number;
  radius: number;
  radDrop: number;
  aiArchetype:
    | 'bandit'
    | 'maggot'
    | 'maggot_nest'
    | 'scorpion'
    | 'rat'
    | 'big_rat'
    | 'gator'
    | 'ballguy'
    | 'raven'
    | 'sniper'
    | 'salamander'
    | 'assassin'
    | 'spider'
    | 'laser_crystal'
    | 'snowbot'
    | 'wolf'
    | 'snow_tank'
    | 'freak'
    | 'rhino_freak'
    | 'explo_freak'
    | 'necromancer'
    | 'turret'
    | 'guardian'
    | 'explo_guardian'
    | 'guardian_dog'
    | 'idpd_grunt'
    | 'idpd_inspector'
    | 'idpd_shielder'
    | 'idpd_van'
    | 'mimic'
    | 'boss';
  sprites: {
    idle: string;
    walk: string;
    hurt: string;
    dead: string;
    gun?: string;
    fire?: string;
    tell?: string;
  };
  sounds: {
    hurt: string;
    dead: string;
    fire?: string;
  };
  loopOnly?: boolean;
  isIdpd?: boolean;
  isBoss?: boolean;
}

export interface AreaDef {
  code: AreaCode;
  biome: BiomeId;
  name: string;
  nextArea: AreaCode;
  bossId?: BossId;
  darkness: number; // 0 = bright, 0..1 ambient shadow strength
  floorSprite: string;
  floorExploSprite: string;
  wallTopSprite: string;
  wallBotSprite: string;
  wallOutSprite: string;
  wallTransSprite?: string;
  musicTrack: string;
  musicTrackB?: string;
  ambienceTrack: string;
  bossMusicTrack?: string;
  targetFloors: number;
  walkerCount: number;
  enemyBudgetBase: number;
  weaponTierBase: number;
}

// ============================================================================
// 3. SIMULATION WORLD & ENTITY CONTRACTS (@simcore <-> @gameplay <-> @renderer)
// ============================================================================

export const enum TileType {
  Void = 0,
  Floor = 1,
  Wall = 2,
  FloorCracked = 3,
  Carpet = 4,
}

export interface WorldMap {
  width: number;
  height: number;
  tileSize: number;
  tiles: Uint8Array;
  floorVariants: Uint8Array;
  wallMask: Uint8Array; // bit0=N, bit1=E, bit2=S, bit3=W solid neighbors; bit4=hasFloorBelow (2.5D front face)
  spawnX: number;
  spawnY: number;
  biome: BiomeId;
  areaCode: AreaCode;
  loop: number;
  darkness: number;
  walkableCount: number;
}

export interface InputFrame {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimWorldX: number;
  aimWorldY: number;
  fireHeld: boolean;
  firePressed: boolean;
  activeHeld: boolean;
  activePressed: boolean;
  swapPressed: boolean;
  pickupPressed: boolean;
  pausePressed: boolean;
  selectIndex?: number; // for mutation/ultra pick
}

export interface WeaponSlotState {
  weaponId: string;
  reloadTicks: number;
  maxReloadTicks: number;
  burstRemaining: number;
  burstTimer: number;
  kickOffset: number;
  cursed?: boolean;
}

export interface PlayerState {
  id: number;
  mutant: MutantId;
  skin: 'a' | 'b';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  aimAngle: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  iframes: number;
  hurtFlashTicks: number;
  rads: number;
  level: number;
  radsToNextLevel: number;
  mutations: MutationId[];
  ultra: UltraId | null;
  strongSpiritReady: boolean;
  strongSpiritRecharging: boolean;
  ammo: Record<AmmoType, number>;
  ammoMax: Record<AmmoType, number>;
  weapons: [WeaponSlotState, WeaponSlotState | null];
  activeSlot: 0 | 1;
  activeCooldown: number;
  activeTimer: number;
  shielding: boolean;
  rolling: boolean;
  rollDirX: number;
  rollDirY: number;
  telekinesisActive: boolean;
  radBeamTicks: number;
  headlessTicks: number;
  headlessDeaths: number;
  gunWarrantTicks: number;
  portalStrikes: number;
  hammerheadTicks: number;
  hammerheadWallTicks: number;
  allyCount: number;
  animFrame: number;
  godMode: boolean;
  alive: boolean;
  lastDamageCause: string;
  lastKillerSprite: string;
}

export interface EnemyEntity {
  id: number;
  defId: string;
  bossId?: BossId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  aimAngle: number;
  hurtFlashTicks: number;
  snaredTicks: number;
  aiState: string;
  aiTimer: number;
  aiPhase: number;
  attackCooldown: number;
  targetX: number;
  targetY: number;
  animFrame: number;
  contactDamage: number;
  radDrop: number;
  friendly?: boolean;
  isBoss?: boolean;
  invulnerable?: boolean;
  elevated?: boolean; // e.g., Lil' Hunter airborne / Raven flying
  elevZ?: number;
}

export interface ProjectileEntity {
  id: number;
  kind: ProjectileKind;
  team: 'player' | 'enemy';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  damage: number;
  lifeTicks: number;
  maxLifeTicks: number;
  pierce: number;
  bounce: number;
  explosionRadius: number;
  sprite: string;
  weaponId?: string;
  hitIds: number[];
  deflectsProjectiles?: boolean;
  destroysProjectiles?: boolean;
  meleeArcDeg?: number;
  meleeReach?: number;
  canHitPlayer?: boolean;
  isUltra?: boolean;
}

export type PickupKind = 'rad' | 'big_rad' | 'ammo' | 'hp' | 'weapon' | 'portal_strike';

export interface PickupEntity {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  ammoType?: AmmoType;
  weaponId?: string;
  cursed?: boolean;
  lifeTicks: number;
  animFrame: number;
}

export type PropKind =
  | 'weapon_chest'
  | 'big_weapon_chest'
  | 'ammo_chest'
  | 'rad_canister'
  | 'idpd_canister'
  | 'car'
  | 'barrel'
  | 'toxic_barrel'
  | 'proto_statue'
  | 'throne_generator'
  | 'cactus'
  | 'bone_pile'
  | 'pillar'
  | 'snare_trap';

export interface PropEntity {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  solid: boolean;
  opened: boolean;
  hurtFlashTicks: number;
  sprite: string;
  openSprite?: string;
  mimic?: boolean;
  radsStored?: number;
  lifeTicks?: number;
}

export interface CorpseEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  sprite: string;
  frame: number;
  baked: boolean;
  explodable: boolean;
  size: number;
}

export interface CasingEntity {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  vAngle: number;
  kind: 'bullet' | 'shell' | 'bolt' | 'energy' | 'debris';
  baked: boolean;
}

export interface FloorDecal {
  kind: 'blood' | 'scorch' | 'rubble' | 'acid' | 'corpse' | 'casing' | 'footstep';
  x: number;
  y: number;
  angle: number;
  scale: number;
  color: string;
  sprite?: string;
  frame?: number;
  facing?: 1 | -1;
}

export interface ParticleEntity {
  id: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeTicks: number;
  maxLifeTicks: number;
  size: number;
  color: string;
  sprite?: string;
  alpha: number;
}

export interface PortalState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  timer: number;
  targetArea: AreaCode;
  nextLoop: number;
  entered: boolean;
  enterTicks: number;
  carved: boolean;
}

export interface BossState {
  bossId: BossId;
  entityId: number;
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  introTicks: number;
  defeated: boolean;
}

export type SimEvent =
  | { type: 'sfx'; sound: string; x: number; y: number; pitchJitter?: number; volume?: number }
  | { type: 'music'; track: string; ambience?: string; boss?: boolean }
  | { type: 'shake'; trauma: number; dirX?: number; dirY?: number; kick?: number }
  | { type: 'hitstop'; ticks: number }
  | { type: 'decal'; decal: FloorDecal }
  | { type: 'particle'; kind: string; x: number; y: number; vx: number; vy: number; color: string; size?: number; life: number; sprite?: string }
  | { type: 'damage_number'; x: number; y: number; amount: number; crit?: boolean; heal?: boolean }
  | { type: 'portal_open'; x: number; y: number; targetArea: AreaCode }
  | { type: 'area_change'; areaCode: AreaCode; biome: BiomeId; loop: number }
  | { type: 'boss_intro'; bossId: BossId; name: string; subtitle: string }
  | { type: 'level_up'; level: number; isUltra: boolean }
  | { type: 'pickup_text'; x: number; y: number; text: string; color: string }
  | { type: 'player_died'; cause: string; killerSprite: string; areaCode: AreaCode; loop: number; kills: number };

export type SimPhase =
  | 'playing'
  | 'mutation_select'
  | 'ultra_select'
  | 'portal_transition'
  | 'game_over'
  | 'victory_throne';

export interface RunStats {
  kills: number;
  shotsFired: number;
  damageDealt: number;
  damageTaken: number;
  radsCollected: number;
  bossesDefeated: BossId[];
  areasCleared: number;
  timeTicks: number;
}

export interface SimState {
  tick: number;
  seed: number;
  rngState: number;
  phase: SimPhase;
  areaCode: AreaCode;
  biome: BiomeId;
  loop: number;
  crown: CrownId;
  map: WorldMap;
  player: PlayerState;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  pickups: PickupEntity[];
  props: PropEntity[];
  corpses: CorpseEntity[];
  casings: CasingEntity[];
  decals: FloorDecal[];
  particles: ParticleEntity[];
  portal: PortalState;
  boss: BossState | null;
  hitstopTicks: number;
  cameraShake: number;
  cameraKickX: number;
  cameraKickY: number;
  events: SimEvent[];
  pendingMutations: MutationId[];
  pendingUltras: UltraId[];
  pendingLevelUps: number;
  chestSkipStreak: number;
  generatorsRemaining: number;
  idpdHeat: number;
  levelStartEnemyCount: number;
  levelKills: number;
  stats: RunStats;
  nextEntityId: number;
  portalTransitionTicks: number;
  floorClearTrigger: boolean;
}

// ============================================================================
// 4. AUDIO, RENDER, UI, SAVE & PLAYTEST BRIDGE CONTRACTS
// ============================================================================

export interface AudioSettings {
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  muted: boolean;
}

export type TargetFps = 30 | 60 | 120;

export interface RenderSettings {
  widescreen: boolean; // false = 320x240 (4:3), true = 426x240 (16:9)
  targetFps: TargetFps; // 30 = classic locked, 60 = smooth interpolated, 120 = ultra interpolated
  classic30Fps: boolean; // Kept synced as targetFps === 30 for backward compatibility
  screenShakeScale: number; // 0..1
  crosshairStyle: number; // 0..6
  showFps: boolean;
  pixelSnap: boolean;
}

export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  swap: string;
  pickup: string;
  pause: string;
  activeAlt: string;
}

export type InputDeviceMode = 'kbm' | 'gamepad' | 'touch';

export type TouchControlsMode = 'auto' | 'off';

export interface ControlSettings {
  gamepadAimAssist: boolean; // subtle magnetic cone toward nearby LoS enemies when using gamepad
  gamepadRumble: boolean; // safe feature-detected dual-rumble haptic feedback
  gamepadDeadzone: number; // radial stick deadzone 0.08..0.35 (default 0.16)
  touchMode: TouchControlsMode; // 'auto' (strictly invisible until real touch) | 'off'
}

export interface MutantSaveProgress {
  unlocked: boolean;
  bSkinUnlocked: boolean;
  goldenWeapon: string | null;
  crownsUnlocked: CrownId[];
  bestArea: AreaCode;
  bestLoop: number;
  bestKills: number;
  runs: number;
}

export interface SaveData {
  version: number;
  selectedMutant: MutantId;
  selectedSkins: Partial<Record<MutantId, 'a' | 'b'>>;
  selectedCrown: CrownId;
  useGoldenWeapon: boolean;
  audio: AudioSettings;
  render: RenderSettings;
  keybinds: KeyBindings;
  controls: ControlSettings;
  mutants: Record<MutantId, MutantSaveProgress>;
  totalRuns: number;
  totalKills: number;
  totalDeaths: number;
  bestKills: number;
  bestArea: AreaCode;
  bestLoop: number;
}

export type GameScreen =
  | 'title'
  | 'campfire'
  | 'playing'
  | 'paused'
  | 'mutation_select'
  | 'ultra_select'
  | 'options'
  | 'game_over'
  | 'victory';

export interface PlaytestTelemetry {
  fps: number;
  targetFps: TargetFps;
  simHz: number;
  tick: number;
  screen: GameScreen;
  phase: SimPhase;
  areaCode: AreaCode;
  biome: BiomeId;
  loop: number;
  mutant: MutantId;
  hp: number;
  maxHp: number;
  rads: number;
  level: number;
  kills: number;
  enemiesAlive: number;
  projectilesActive: number;
  pickupsCount: number;
  corpsesCount: number;
  casingsCount: number;
  portalActive: boolean;
  portalX: number;
  portalY: number;
  playerX: number;
  playerY: number;
  bossId: BossId | null;
  bossHp: number;
  bossMaxHp: number;
  weapons: [string, string | null];
  activeSlot: 0 | 1;
  ammo: Record<AmmoType, number>;
  mutations: MutationId[];
  ultra: UltraId | null;
  pendingMutations: MutationId[];
  assetMode: 'steam' | 'fallback';
  loadedSpriteCount: number;
  loadedSoundCount: number;
  canvasWidth: number;
  canvasHeight: number;
  consoleErrors: string[];
  inputMode?: InputDeviceMode;
  gamepadConnected?: boolean;
  gamepadName?: string | null;
  touchOverlayVisible?: boolean;
}

export interface DebugBridge {
  getTelemetry(): PlaytestTelemetry;
  getStateHash(): string;
  getScreen(): GameScreen;
  getLoadedAssets(): { mode: 'steam' | 'fallback'; sprites: number; sounds: number; fonts: number };
  startRun(mutant?: MutantId, seed?: number, crown?: CrownId): void;
  warpArea(areaCode: AreaCode, loop?: number): void;
  spawnBoss(bossId: BossId): void;
  giveWeapon(weaponId: string, slot?: 0 | 1): void;
  grantMutation(mutationId: MutationId): void;
  grantRads(amount: number): void;
  pickMutation(index: number): void;
  setGodMode(enabled: boolean): void;
  clearEnemies(): void;
  stepTicks(count: number, input?: Partial<InputFrame>): void;
  setScreen(screen: GameScreen): void;
  saveNow(): void;
}
