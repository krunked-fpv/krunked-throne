import type {
  AreaCode,
  AreaDef,
  BiomeId,
  CrownDef,
  CrownId,
  EnemyDef,
  MutantDef,
  MutantId,
  MutationDef,
  MutationId,
  UltraDef,
  UltraId,
  WeaponDef,
} from '@/contracts';

/**
 * Decoupled static metadata interface consumed by src/render/** and src/ui/**.
 * Avoids hard-importing src/data/** directly so renderer/UI compile standalone
 * and wire cleanly to the full data registry in src/app/.
 */
export interface UiDataProvider {
  getMutants(): readonly MutantDef[];
  getMutant(id: MutantId): MutantDef;
  getMutations(): readonly MutationDef[];
  getMutation(id: MutationId): MutationDef | undefined;
  getUltra(id: UltraId): UltraDef | undefined;
  getCrowns(): readonly CrownDef[];
  getCrown(id: CrownId): CrownDef;
  getWeapon(id: string): WeaponDef | undefined;
  getEnemy(id: string): EnemyDef | undefined;
  getArea(code: AreaCode): AreaDef | undefined;
  getAreaByBiome(biome: BiomeId): AreaDef | undefined;
}

export const ALL_MUTANT_IDS: readonly MutantId[] = [
  'fish',
  'crystal',
  'eyes',
  'melting',
  'plant',
  'yv',
  'steroids',
  'robot',
  'chicken',
  'rebel',
  'horror',
  'rogue',
] as const;

export const ALL_CROWN_IDS: readonly CrownId[] = [
  'none',
  'death',
  'life',
  'haste',
  'guns',
  'hatred',
  'blood',
  'destiny',
  'love',
  'risk',
  'curses',
  'luck',
  'protection',
] as const;

export const ALL_AREA_CODES: readonly AreaCode[] = [
  '1-1',
  '1-2',
  '1-3',
  '2-1',
  '3-1',
  '3-2',
  '3-3',
  '4-1',
  '5-1',
  '5-2',
  '5-3',
  '6-1',
  '7-1',
  '7-2',
  '7-3',
  '0-1',
  '1-?',
  '2-?',
  '3-?',
  '4-?',
  '5-?',
  'vault',
  'hq-1',
] as const;

function makeMutantSprites(raceIndex: number): MutantDef['sprites'] {
  const p = `sprMutant${raceIndex}`;
  return {
    idle: `${p}Idle`,
    walk: `${p}Walk`,
    hurt: `${p}Hurt`,
    dead: `${p}Dead`,
    sit: `${p}Sit`,
    goSit: `${p}GoSit`,
    bIdle: `${p}BIdle`,
    bWalk: `${p}BWalk`,
    bHurt: `${p}BHurt`,
    bDead: raceIndex === 9 ? 'sprMutant9Dead' : `${p}BDead`,
    bSit: `${p}BSit`,
    portrait: 'sprBigPortrait',
    bPortrait: 'sprBigPortrait',
    charSelect: 'sprCharSelect',
  };
}

function makeMutantSounds(raceIndex: number): MutantDef['sounds'] {
  return {
    hurt: `sndMutant${raceIndex}Hurt`,
    dead: `sndMutant${raceIndex}Dead`,
    confirm: `sndMutant${raceIndex}Cnfm`,
  };
}

export const DEFAULT_MUTANTS: readonly MutantDef[] = [
  {
    id: 'fish',
    raceIndex: 1,
    name: 'FISH',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'MORE AMMO',
    passiveDesc: 'GETS @y+25% AMMO@s FROM PICKUPS',
    activeName: 'ROLL',
    activeDesc: 'COMBAT ROLL WITH MOMENTUM',
    throneButtDesc: '@yWATER BOOST:@s HOLD RMB TO BOOST',
    ultras: [
      { id: 'fish_a', mutant: 'fish', slot: 'a', name: 'CONFISCATE', description: 'ENEMIES SOMETIMES DROP @yCHESTS@s', iconIndex: 0, sprite: 'sprEGSkillIcon' },
      { id: 'fish_b', mutant: 'fish', slot: 'b', name: 'GUN WARRANT', description: '@yINFINITE AMMO@s FOR 7 SECONDS AFTER PORTAL', iconIndex: 1, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(1),
    sounds: { ...makeMutantSounds(1), active: 'sndRoll' },
  },
  {
    id: 'crystal',
    raceIndex: 2,
    name: 'CRYSTAL',
    maxHp: 10,
    moveSpeed: 3.8,
    startingWeapon: 'revolver',
    passiveName: 'CRYSTAL SKIN',
    passiveDesc: 'HIGHER MAX HP (@r10 HP@s)',
    activeName: 'CRYSTAL SHIELD',
    activeDesc: 'BLOCK DAMAGE AND REFLECT @yPROJECTILES@s',
    throneButtDesc: '@pTELEPORT@s TO CURSOR ON SHIELD RELEASE',
    ultras: [
      { id: 'crystal_a', mutant: 'crystal', slot: 'a', name: 'FORTRESS', description: '@r+6 MAX HP@s', iconIndex: 2, sprite: 'sprEGSkillIcon' },
      { id: 'crystal_b', mutant: 'crystal', slot: 'b', name: 'JUGGERNAUT', description: 'MOVE WHILE @pSHIELDING@s', iconIndex: 3, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(2),
    sounds: { ...makeMutantSounds(2), active: 'sndCrystalShield' },
  },
  {
    id: 'eyes',
    raceIndex: 3,
    name: 'EYES',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'NIGHT VISION',
    passiveDesc: 'SEES BETTER IN @bDARK BIOMES@s',
    activeName: 'TELEKINESIS',
    activeDesc: 'PULL PICKUPS AND ENEMIES, PUSH @bBULLETS@s',
    throneButtDesc: '@bSTRONGER@s TELEKINESIS FORCE',
    ultras: [
      { id: 'eyes_a', mutant: 'eyes', slot: 'a', name: 'PROJECTILE STYLE', description: 'TELEKINESIS HOLDS YOUR @bPROJECTILES@s', iconIndex: 4, sprite: 'sprEGSkillIcon' },
      { id: 'eyes_b', mutant: 'eyes', slot: 'b', name: 'MONSTER STYLE', description: 'PUSHES NEARBY @rENEMIES@s AWAY WHEN NOT USING TELEKINESIS', iconIndex: 5, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(3),
    sounds: makeMutantSounds(3),
  },
  {
    id: 'melting',
    raceIndex: 4,
    name: 'MELTING',
    maxHp: 2,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'TIRED',
    passiveDesc: 'LESS HP (@r2 MAX@s), MORE @gRADS@s',
    activeName: 'CORPSE EXPLOSION',
    activeDesc: 'DETONATE @rCORPSES@s FOR MASSIVE BLAST',
    throneButtDesc: 'BIGGER @rCORPSE EXPLOSIONS@s',
    ultras: [
      { id: 'melting_a', mutant: 'melting', slot: 'a', name: 'BRAIN CAPACITY', description: 'BLOW UP @rLOW-HP@s LIVING ENEMIES', iconIndex: 6, sprite: 'sprEGSkillIcon' },
      { id: 'melting_b', mutant: 'melting', slot: 'b', name: 'DETACHMENT', description: '@g+3 MUTATIONS@s, HALVES MAX HP', iconIndex: 7, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(4),
    sounds: { ...makeMutantSounds(4), active: 'sndCorpseExplo' },
  },
  {
    id: 'plant',
    raceIndex: 5,
    name: 'PLANT',
    maxHp: 8,
    moveSpeed: 4.5,
    startingWeapon: 'revolver',
    passiveName: 'SWIFT',
    passiveDesc: '@gFASTER@s MOVEMENT SPEED',
    activeName: 'SNARE',
    activeDesc: 'FIRE A @gSNARE@s THAT ROOTS ENEMIES',
    throneButtDesc: 'SNARE KILLS ENEMIES UNDER @r33% HP@s',
    ultras: [
      { id: 'plant_a', mutant: 'plant', slot: 'a', name: 'TRAPPER', description: '@gHUGE@s SNARE RADIUS', iconIndex: 8, sprite: 'sprEGSkillIcon' },
      { id: 'plant_b', mutant: 'plant', slot: 'b', name: 'KILLER', description: 'SNARE KILLS SPAWN @gSAPLINGS@s', iconIndex: 9, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(5),
    sounds: makeMutantSounds(5),
  },
  {
    id: 'yv',
    raceIndex: 6,
    name: 'Y.V.',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'golden_revolver',
    passiveName: 'GUN GOD',
    passiveDesc: '@y+20% HIGHER@s RATE OF FIRE',
    activeName: 'POP POP',
    activeDesc: 'FIRE @y2 SHOTS@s AT ONCE',
    throneButtDesc: '@yBRRRAP:@s FIRE 4 SHOTS AT ONCE',
    ultras: [
      { id: 'yv_a', mutant: 'yv', slot: 'a', name: 'IMA GUN GOD', description: '@y+40% EXTRA@s FIRE RATE', iconIndex: 10, sprite: 'sprEGSkillIcon' },
      { id: 'yv_b', mutant: 'yv', slot: 'b', name: 'BACK 2 BIZNIZ', description: 'FREE @yPOP POP@s UPGRADE + VISIT @yY.V. CRIB@s', iconIndex: 11, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(6),
    sounds: makeMutantSounds(6),
  },
  {
    id: 'steroids',
    raceIndex: 7,
    name: 'STEROIDS',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    secondaryWeapon: 'revolver',
    passiveName: 'DUAL WIELD',
    passiveDesc: 'ALL GUNS @yAUTO-FIRE@s, LESS ACCURATE',
    activeName: 'OFFHAND FIRE',
    activeDesc: 'FIRE @ySECONDARY WEAPON@s SIMULTANEOUSLY',
    throneButtDesc: 'FIRING REFILLS @yOTHER WEAPON@s AMMO',
    ultras: [
      { id: 'steroids_a', mutant: 'steroids', slot: 'a', name: 'AMBIDEXTROUS', description: '@yDOUBLE@s WEAPON CHESTS', iconIndex: 12, sprite: 'sprEGSkillIcon' },
      { id: 'steroids_b', mutant: 'steroids', slot: 'b', name: 'GET LOADED', description: 'AMMO CHESTS REFILL @yALL POOLS@s', iconIndex: 13, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(7),
    sounds: makeMutantSounds(7),
  },
  {
    id: 'robot',
    raceIndex: 8,
    name: 'ROBOT',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'BETTER TECH',
    passiveDesc: 'FINDS @yHIGHER-TIER@s WEAPONS EARLIER',
    activeName: 'EAT WEAPON',
    activeDesc: 'CONSUME EQUIPPED GUN FOR @rHP@s AND @yAMMO@s',
    throneButtDesc: 'EATING GUNS GIVES @gBONUS@s HP AND AMMO',
    ultras: [
      { id: 'robot_a', mutant: 'robot', slot: 'a', name: 'REFINED TASTE', description: 'AUTO-EAT LOW TIER GUNS, @yBETTER DROPS@s', iconIndex: 14, sprite: 'sprEGSkillIcon' },
      { id: 'robot_b', mutant: 'robot', slot: 'b', name: 'REGURGITATE', description: 'EATING GUNS CAN DROP @yCHESTS@s', iconIndex: 15, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(8),
    sounds: makeMutantSounds(8),
  },
  {
    id: 'chicken',
    raceIndex: 9,
    name: 'CHICKEN',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'chicken_sword',
    passiveName: 'HEADLESS',
    passiveDesc: 'SURVIVE @rLETHAL DAMAGE@s FOR 5 SECONDS',
    activeName: 'THROW WEAPON',
    activeDesc: 'HURL EQUIPPED WEAPON AT @yENEMIES@s',
    throneButtDesc: 'THROWN WEAPONS @yPIERCE AND BOUNCE@s',
    ultras: [
      { id: 'chicken_a', mutant: 'chicken', slot: 'a', name: 'HARDER TO KILL', description: 'KILLS EXTEND @rHEADLESS@s TIMER', iconIndex: 16, sprite: 'sprEGSkillIcon' },
      { id: 'chicken_b', mutant: 'chicken', slot: 'b', name: 'DETERMINATION', description: 'THROWN WEAPONS @yTELEPORT BACK@s', iconIndex: 17, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(9),
    sounds: makeMutantSounds(9),
  },
  {
    id: 'rebel',
    raceIndex: 10,
    name: 'REBEL',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'PORTAL HEAL',
    passiveDesc: 'HEALS @r50% MISSING HP@s ON PORTAL',
    activeName: 'SPAWN ALLY',
    activeDesc: 'SPEND @rHP@s TO SUMMON AN ALLY SOLDIER',
    throneButtDesc: 'ALLIES FIRE AT @yDOUBLE SPEED@s',
    ultras: [
      { id: 'rebel_a', mutant: 'rebel', slot: 'a', name: 'PERSONAL GUARD', description: 'START EACH LEVEL WITH @g2 ALLIES@s', iconIndex: 18, sprite: 'sprEGSkillIcon' },
      { id: 'rebel_b', mutant: 'rebel', slot: 'b', name: 'RIOT', description: 'SPAWN @g2 ALLIES@s PER ACTIVE USE', iconIndex: 19, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(10),
    sounds: makeMutantSounds(10),
  },
  {
    id: 'horror',
    raceIndex: 11,
    name: 'HORROR',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'revolver',
    passiveName: 'EXTRA MUTATION',
    passiveDesc: '@g+1 EXTRA@s MUTATION CHOICE ON LEVEL UP',
    activeName: 'RAD BEAM',
    activeDesc: 'SPEND @gRADS@s TO FIRE DESTRUCTIVE BEAM',
    throneButtDesc: 'BEAM GROWS @gFASTER@s AND HEALS ON USE',
    ultras: [
      { id: 'horror_a', mutant: 'horror', slot: 'a', name: 'STALKER', description: 'ENEMIES EXPLODE IN @gRADS@s ON DEATH', iconIndex: 20, sprite: 'sprEGSkillIcon' },
      { id: 'horror_b', mutant: 'horror', slot: 'b', name: 'ANOMALY', description: '@pPORTALS@s OPEN EARLIER, LEVEL UP FASTER', iconIndex: 21, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(11),
    sounds: makeMutantSounds(11),
  },
  {
    id: 'rogue',
    raceIndex: 12,
    name: 'ROGUE',
    maxHp: 8,
    moveSpeed: 4,
    startingWeapon: 'rogue_rifle',
    passiveName: 'BLAST ARMOR',
    passiveDesc: 'EXPLOSIVE @bRETALIATION@s ON HIT; IDPD HUNT',
    activeName: 'PORTAL STRIKE',
    activeDesc: 'CALL @bCARPET EXPLOSION@s THAT CARVES WALLS',
    throneButtDesc: '@bDOUBLE@s PORTAL STRIKE POWER',
    ultras: [
      { id: 'rogue_a', mutant: 'rogue', slot: 'a', name: 'SUPER PORTAL STRIKE', description: '@bMASSIVE@s STRIKES AND EXTRA CANISTERS', iconIndex: 22, sprite: 'sprEGSkillIcon' },
      { id: 'rogue_b', mutant: 'rogue', slot: 'b', name: 'SUPER BLAST ARMOR', description: '@bHUGE@s RETALIATION BLAST ON DAMAGE', iconIndex: 23, sprite: 'sprEGSkillIcon' },
    ],
    sprites: makeMutantSprites(12),
    sounds: makeMutantSounds(12),
  },
];

export const DEFAULT_MUTATIONS: readonly MutationDef[] = [
  { id: 'rhino_skin', skillIndex: 1, name: 'RHINO SKIN', description: '@r+4 MAX HP@s', tip: 'THICK SKIN', sprite: 'sprSkillIcon', iconFrame: 1, hudSprite: 'sprSkillIconHUD' },
  { id: 'extra_feet', skillIndex: 2, name: 'EXTRA FEET', description: 'MORE @gSPEED@s AND WALK ON ROUGH GROUND', tip: 'NEVER SLOW DOWN', sprite: 'sprSkillIcon', iconFrame: 2, hudSprite: 'sprSkillIconHUD' },
  { id: 'plutonium_hunger', skillIndex: 3, name: 'PLUTONIUM HUNGER', description: 'ATTRACT @gRADS@s AND PICKUPS FROM FARTHER', tip: 'MAGNETIC', sprite: 'sprSkillIcon', iconFrame: 3, hudSprite: 'sprSkillIconHUD' },
  { id: 'rabbit_paw', skillIndex: 4, name: 'RABBIT PAW', description: 'MORE @rHP@s AND @yAMMO@s DROPS FROM ENEMIES', tip: 'LUCKY CHARM', sprite: 'sprSkillIcon', iconFrame: 4, hudSprite: 'sprSkillIconHUD' },
  { id: 'throne_butt', skillIndex: 5, name: 'THRONE BUTT', description: 'UPGRADES YOUR @pSPECIAL ABILITY@s', tip: 'MUTATION SYNERGY', sprite: 'sprSkillIcon', iconFrame: 5, hudSprite: 'sprSkillIconHUD' },
  { id: 'lucky_shot', skillIndex: 6, name: 'LUCKY SHOT', description: 'KILLS HAVE CHANCE TO RESTORE @yAMMO@s', tip: 'NEVER DRY', sprite: 'sprSkillIcon', iconFrame: 6, hudSprite: 'sprSkillIconHUD' },
  { id: 'bloodlust', skillIndex: 7, name: 'BLOODLUST', description: 'KILLS HAVE CHANCE TO RESTORE @rHP@s', tip: 'DRINK DEEP', sprite: 'sprSkillIcon', iconFrame: 7, hudSprite: 'sprSkillIconHUD' },
  { id: 'gamma_guts', skillIndex: 8, name: 'GAMMA GUTS', description: 'ENEMIES TAKE @gDAMAGE@s ON CONTACT', tip: 'RADIOACTIVE', sprite: 'sprSkillIcon', iconFrame: 8, hudSprite: 'sprSkillIconHUD' },
  { id: 'second_stomach', skillIndex: 9, name: 'SECOND STOMACH', description: 'MORE @rHP@s FROM MEDKITS', tip: 'FULL BELLY', sprite: 'sprSkillIcon', iconFrame: 9, hudSprite: 'sprSkillIconHUD' },
  { id: 'back_muscle', skillIndex: 10, name: 'BACK MUSCLE', description: 'HIGHER @yAMMO@s MAX CAPACITY', tip: 'HEAVY PACK', sprite: 'sprSkillIcon', iconFrame: 10, hudSprite: 'sprSkillIconHUD' },
  { id: 'scarier_face', skillIndex: 11, name: 'SCARIER FACE', description: 'LESS @rENEMY HP@s ACROSS ALL AREAS', tip: 'TERRIFYING', sprite: 'sprSkillIcon', iconFrame: 11, hudSprite: 'sprSkillIconHUD' },
  { id: 'euphoria', skillIndex: 12, name: 'EUPHORIA', description: 'SLOWER @rENEMY BULLETS@s', tip: 'BULLET TIME', sprite: 'sprSkillIcon', iconFrame: 12, hudSprite: 'sprSkillIconHUD' },
  { id: 'long_arms', skillIndex: 13, name: 'LONG ARMS', description: 'LONGER @yMELEE@s REACH', tip: 'KEEP DISTANCE', sprite: 'sprSkillIcon', iconFrame: 13, hudSprite: 'sprSkillIconHUD' },
  { id: 'boiling_veins', skillIndex: 14, name: 'BOILING VEINS', description: 'NO @rFIRE/EXPLOSION@s DEATH AT <=4 HP', tip: 'HEAT PROOF', sprite: 'sprSkillIcon', iconFrame: 14, hudSprite: 'sprSkillIconHUD' },
  { id: 'shotgun_shoulders', skillIndex: 15, name: 'SHOTGUN SHOULDERS', description: '@ySHELLS@s BOUNCE FARTHER', tip: 'RICOCHET', sprite: 'sprSkillIcon', iconFrame: 15, hudSprite: 'sprSkillIconHUD' },
  { id: 'recycle_gland', skillIndex: 16, name: 'RECYCLE GLAND', description: 'HITTING WITH @yBULLETS@s REFUNDS AMMO', tip: 'RECLAIM', sprite: 'sprSkillIcon', iconFrame: 16, hudSprite: 'sprSkillIconHUD' },
  { id: 'laser_brain', skillIndex: 17, name: 'LASER BRAIN', description: '@bENERGY@s WEAPONS DEAL MORE DAMAGE', tip: 'OVERCLOCKED', sprite: 'sprSkillIcon', iconFrame: 17, hudSprite: 'sprSkillIconHUD' },
  { id: 'last_wish', skillIndex: 18, name: 'LAST WISH', description: 'FULL @rHP@s AND @yAMMO@s IMMEDIATELY', tip: 'ONE LAST TIME', sprite: 'sprSkillIcon', iconFrame: 18, hudSprite: 'sprSkillIconHUD' },
  { id: 'eagle_eyes', skillIndex: 19, name: 'EAGLE EYES', description: 'MUCH BETTER @yACCURACY@s', tip: 'DEADEYE', sprite: 'sprSkillIcon', iconFrame: 19, hudSprite: 'sprSkillIconHUD' },
  { id: 'impact_wrists', skillIndex: 20, name: 'IMPACT WRISTS', description: 'CORPSES FLY AND DAMAGE @rENEMIES@s', tip: 'BOWLING', sprite: 'sprSkillIcon', iconFrame: 20, hudSprite: 'sprSkillIconHUD' },
  { id: 'bolt_marrow', skillIndex: 21, name: 'BOLT MARROW', description: 'HOMING @gBOLTS@s', tip: 'SEEKING', sprite: 'sprSkillIcon', iconFrame: 21, hudSprite: 'sprSkillIconHUD' },
  { id: 'stress', skillIndex: 22, name: 'STRESS', description: 'HIGHER @yFIRE RATE@s AS HP GETS LOWER', tip: 'ADRENALINE', sprite: 'sprSkillIcon', iconFrame: 22, hudSprite: 'sprSkillIconHUD' },
  { id: 'trigger_fingers', skillIndex: 23, name: 'TRIGGER FINGERS', description: 'KILLS REDUCE @yWEAPON RELOAD@s TIME', tip: 'FAST HANDS', sprite: 'sprSkillIcon', iconFrame: 23, hudSprite: 'sprSkillIconHUD' },
  { id: 'sharp_teeth', skillIndex: 24, name: 'SHARP TEETH', description: 'TAKING DAMAGE HURTS @rALL ENEMIES@s', tip: 'BITING BACK', sprite: 'sprSkillIcon', iconFrame: 24, hudSprite: 'sprSkillIconHUD' },
  { id: 'patience', skillIndex: 25, name: 'PATIENCE', description: '@gMUTATE@s LATER', tip: 'WAIT FOR IT', sprite: 'sprSkillIcon', iconFrame: 25, hudSprite: 'sprSkillIconHUD' },
  { id: 'hammerhead', skillIndex: 26, name: 'HAMMERHEAD', description: 'WALK INTO @yWALLS@s TO BREAK THEM', tip: 'MAKE A DOOR', sprite: 'sprSkillIcon', iconFrame: 26, hudSprite: 'sprSkillIconHUD' },
  { id: 'strong_spirit', skillIndex: 27, name: 'STRONG SPIRIT', description: 'PREVENT @bDEATH@s ONCE PER LEVEL', tip: 'HOLD ON', sprite: 'sprSkillIcon', iconFrame: 27, hudSprite: 'sprSkillIconHUD' },
  { id: 'open_mind', skillIndex: 28, name: 'OPEN MIND', description: '@yEXTRA CHEST@s SPAWNS EVERY LEVEL', tip: 'CURIOUS', sprite: 'sprSkillIcon', iconFrame: 28, hudSprite: 'sprSkillIconHUD' },
  { id: 'heavy_heart', skillIndex: 29, name: 'HEAVY HEART', description: 'MORE @yWEAPON DROPS@s', tip: 'ARSENAL', sprite: 'sprSkillIcon', iconFrame: 29, hudSprite: 'sprSkillIconHUD' },
];

export const DEFAULT_CROWNS: readonly CrownDef[] = [
  { id: 'none', crownIndex: 1, name: 'NO CROWN', description: 'STANDARD WASTELAND RULES', tip: 'PURE RUN', spriteIdle: 'sprCrown1Idle', spriteWalk: 'sprCrown1Walk' },
  { id: 'death', crownIndex: 2, name: 'CROWN OF DEATH', description: 'BIGGER @rEXPLOSIONS@s, -1 MAX HP', tip: 'BOOM', spriteIdle: 'sprCrown2Idle', spriteWalk: 'sprCrown2Walk' },
  { id: 'life', crownIndex: 3, name: 'CROWN OF LIFE', description: 'NO @rHP@s DROPS, BIG MEDKIT CHESTS', tip: 'FEAST OR FAMINE', spriteIdle: 'sprCrown3Idle', spriteWalk: 'sprCrown3Walk' },
  { id: 'haste', crownIndex: 4, name: 'CROWN OF HASTE', description: 'PICKUPS WORTH MORE, @yFADE FASTER@s', tip: 'GRAB QUICK', spriteIdle: 'sprCrown4Idle', spriteWalk: 'sprCrown4Walk' },
  { id: 'guns', crownIndex: 5, name: 'CROWN OF GUNS', description: 'NO @yAMMO@s DROPS, MORE GUN DROPS', tip: 'SWITCH OFTEN', spriteIdle: 'sprCrown5Idle', spriteWalk: 'sprCrown5Walk' },
  { id: 'hatred', crownIndex: 6, name: 'CROWN OF HATRED', description: 'TAKE @rDAMAGE@s OPENING CHESTS FOR RADS', tip: 'BITTER POWER', spriteIdle: 'sprCrown6Idle', spriteWalk: 'sprCrown6Walk' },
  { id: 'blood', crownIndex: 7, name: 'CROWN OF BLOOD', description: '@rMORE ENEMIES@s, LESS RADS EACH', tip: 'SLAUGHTER', spriteIdle: 'sprCrown7Idle', spriteWalk: 'sprCrown7Walk' },
  { id: 'destiny', crownIndex: 8, name: 'CROWN OF DESTINY', description: 'FREE @gMUTATION@s, ONLY 1 CHOICE LATER', tip: 'FATED', spriteIdle: 'sprCrown8Idle', spriteWalk: 'sprCrown8Walk' },
  { id: 'love', crownIndex: 9, name: 'CROWN OF LOVE', description: 'ALL CHESTS ARE @yAMMO CHESTS@s', tip: 'ENDLESS AMMO', spriteIdle: 'sprCrown9Idle', spriteWalk: 'sprCrown9Walk' },
  { id: 'luck', crownIndex: 10, name: 'CROWN OF LUCK', description: 'START LEVELS AT @r1 HP@s, ENEMIES WEAKER', tip: 'ONE HIT', spriteIdle: 'sprCrown10Idle', spriteWalk: 'sprCrown10Walk' },
  { id: 'curses', crownIndex: 11, name: 'CROWN OF CURSES', description: 'MORE @pCURSED@s WEAPON CHESTS', tip: 'DARK GEAR', spriteIdle: 'sprCrown11Idle', spriteWalk: 'sprCrown11Walk' },
  { id: 'risk', crownIndex: 12, name: 'CROWN OF RISK', description: 'MORE DROPS AT @rFULL HP@s, FEWER HURT', tip: 'STAY CLEAN', spriteIdle: 'sprCrown12Idle', spriteWalk: 'sprCrown12Walk' },
  { id: 'protection', crownIndex: 13, name: 'CROWN OF PROTECTION', description: 'WEAPONS CONTAIN @rHP@s INSTEAD OF AMMO', tip: 'STURDY', spriteIdle: 'sprCrown13Idle', spriteWalk: 'sprCrown13Walk' },
];

/**
 * Clean-room original short punchy wasteland loading tips (Nuclear Throne style).
 * Indexed by biome and general fallback for portal transition loading cards.
 */
export const BIOME_LOADING_TIPS: Readonly<Partial<Record<BiomeId, readonly string[]>>> = {
  desert: [
    'SCORCHING SUN',
    'WATCH OUT FOR MAGGOTS',
    'BANDITS LOVE EXPLOSIVE BARRELS',
    'THE WASTELAND CALLS YOU',
  ],
  sewers: [
    'NEVER DRINK THE SEWER WATER',
    'SO MANY RATS DOWN HERE',
    'SLUDGE EVERYWHERE',
    'KEEP YOUR LIGHT CLOSE',
  ],
  scrapyard: [
    'PORTALS CAN DETONATE CARS',
    'WATCH THE RED LASER SIGHT',
    'RUST AND SCRAP AS FAR AS YOU SEE',
    'FEIGNING ASSASSINS STRIKE FAST',
  ],
  caves: [
    'CRYSTAL REFLECTIONS ON EVERY WALL',
    'SPIDERS HUNT IN PACKS',
    'ALMOST HALFWAY THERE',
    'MIND THE LASER CRYSTALS',
  ],
  frozen_city: [
    'PACK A SCARF',
    'SNOWBOTS THROW CARS',
    'LISTEN FOR JETPACKS OVERHEAD',
    'THE FROST NEVER MELTS',
  ],
  labs: [
    'DO NOT PUSH ANY BUTTONS',
    'NECROMANCERS RAISE THE FALLEN',
    'KEEP MOVING THROUGH THE DARK',
    'BIO-CONTAINMENT BREACHED',
  ],
  palace: [
    'THE THRONE IS GETTING CLOSER',
    'STAY OFF THE RED CARPET BEAM',
    'DESTROY ALL FOUR GENERATORS TO LOOP',
    'ANCIENT GUARDIANS STAND WATCH',
  ],
  campfire: [
    'YOUR FRIENDS WERE HERE',
    'THE SKY IS TEARING OPEN',
    'ONE FINAL HURDLE BEFORE THE LOOP',
  ],
  vault: ['CHOOSE YOUR CROWN WISELY', 'DO NOT WAKE THE GUARDIANS'],
  oasis: ['HOLD YOUR BREATH', 'QUIET BENEATH THE SANDS'],
  pizza_sewers: ['SMELLS LIKE WARM CRUST', 'WATCH OUT FOR SHELLS'],
  mansion: ['SO MUCH GOLD', 'VERIFY YOUR GUN GOD'],
  cursed_caves: ['CURSED GEAR STICKS WITH YOU', 'DARKER THAN THE CAVES'],
  jungle: ['SOMETHING MOVES IN THE CANOPY', 'THICK ROOTS EVERYWHERE'],
  hq: ['I.D.P.D. ON FULL ALERT', 'NO ESCAPE FROM HEADQUARTERS'],
};

export const GENERAL_LOADING_TIPS: readonly string[] = [
  'FISH CAN ROLL',
  '@yEXPLOSIVES@s CARVE NEW DOORS',
  '@wMELEE SWINGS@s DEFLECT BULLETS',
  '@ySHELLS@s HIT HARDEST UP CLOSE',
  'CRYSTAL CAN SHIELD',
  'KEEP ONE EYE ON YOUR @yAMMO@s',
  'PICK YOUR @gMUTATIONS@s WISELY',
  'SKIP CHESTS FOR A @yBIG WEAPON CHEST@s',
  'THE @gKRUNKED THRONE@s DEFINITELY EXISTS',
  'TRY NOT TO GET HIT',
];

export function selectLoadingTip(
  biome: BiomeId,
  areaCode: AreaCode,
  loop: number,
  seed: number,
): string {
  const biomePool = BIOME_LOADING_TIPS[biome];
  const hash = Math.abs(
    Math.imul(seed ^ (loop * 37), 2654435761) +
      areaCode.charCodeAt(0) * 131 +
      areaCode.charCodeAt(areaCode.length - 1) * 17,
  );
  if (biomePool && biomePool.length > 0 && hash % 3 !== 0) {
    return biomePool[hash % biomePool.length]!;
  }
  return GENERAL_LOADING_TIPS[hash % GENERAL_LOADING_TIPS.length]!;
}

const DEFAULT_WEAPONS_LIST: readonly WeaponDef[] = [
  {
    id: 'revolver',
    numericId: 1,
    name: 'REVOLVER',
    ammoType: 'bullet',
    ammoCost: 1,
    tier: 0,
    reloadTicks: 6,
    spreadDeg: 4,
    kick: 2,
    shake: 0.14,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 3,
    projectileSpeed: 16,
    projectileKind: 'bullet',
    projectileLifeTicks: 40,
    pierce: 0,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprRevolver',
    projectileSprite: 'sprBullet1',
    fireSound: 'sndPistol',
  },
  {
    id: 'golden_revolver',
    numericId: 39,
    name: 'GOLDEN REVOLVER',
    ammoType: 'bullet',
    ammoCost: 1,
    tier: 1,
    reloadTicks: 4,
    spreadDeg: 3,
    kick: 2,
    shake: 0.16,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 3,
    projectileSpeed: 18,
    projectileKind: 'bullet',
    projectileLifeTicks: 40,
    pierce: 0,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    golden: true,
    sprite: 'sprGoldRevolver',
    projectileSprite: 'sprBullet1',
    fireSound: 'sndPistol',
  },
  {
    id: 'chicken_sword',
    numericId: 58,
    name: 'CHICKEN SWORD',
    ammoType: 'melee',
    ammoCost: 0,
    tier: 0,
    reloadTicks: 10,
    spreadDeg: 0,
    kick: 2,
    shake: 0.18,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 14,
    projectileSpeed: 0,
    projectileKind: 'melee_slash',
    projectileLifeTicks: 4,
    pierce: 99,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 24,
    meleeArcDeg: 110,
    deflectsProjectiles: true,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprSword',
    projectileSprite: 'sprSlash',
    fireSound: 'sndChickenSword',
  },
  {
    id: 'rogue_rifle',
    numericId: 107,
    name: 'ROGUE RIFLE',
    ammoType: 'bullet',
    ammoCost: 1,
    tier: 0,
    reloadTicks: 4,
    spreadDeg: 5,
    kick: 2,
    shake: 0.16,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 3,
    projectileSpeed: 18,
    projectileKind: 'idpd_bullet',
    projectileLifeTicks: 40,
    pierce: 0,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: true,
    sprite: 'sprRogueRifle',
    projectileSprite: 'sprIDPDBullet',
    fireSound: 'sndPistol',
  },
  {
    id: 'shotgun',
    numericId: 5,
    name: 'SHOTGUN',
    ammoType: 'shell',
    ammoCost: 1,
    tier: 1,
    reloadTicks: 18,
    spreadDeg: 22,
    kick: 5,
    shake: 0.35,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 6,
    damage: 3,
    projectileSpeed: 14,
    projectileKind: 'shell',
    projectileLifeTicks: 18,
    pierce: 0,
    bounce: 1,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprShotgun',
    projectileSprite: 'sprBullet2',
    fireSound: 'sndShotgun',
  },
  {
    id: 'crossbow',
    numericId: 6,
    name: 'CROSSBOW',
    ammoType: 'bolt',
    ammoCost: 1,
    tier: 1,
    reloadTicks: 20,
    spreadDeg: 1,
    kick: 4,
    shake: 0.25,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 20,
    projectileSpeed: 22,
    projectileKind: 'bolt',
    projectileLifeTicks: 50,
    pierce: 2,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprCrossbow',
    projectileSprite: 'sprBolt',
    fireSound: 'sndCrossbow',
  },
  {
    id: 'grenade_launcher',
    numericId: 7,
    name: 'GRENADE LAUNCHER',
    ammoType: 'explosive',
    ammoCost: 1,
    tier: 2,
    reloadTicks: 24,
    spreadDeg: 4,
    kick: 5,
    shake: 0.38,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 14,
    projectileSpeed: 10,
    projectileKind: 'grenade',
    projectileLifeTicks: 35,
    pierce: 0,
    bounce: 2,
    explosionRadius: 36,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprNader',
    projectileSprite: 'sprGrenade',
    fireSound: 'sndGrenade',
  },
  {
    id: 'laser_pistol',
    numericId: 12,
    name: 'LASER PISTOL',
    ammoType: 'energy',
    ammoCost: 1,
    tier: 2,
    reloadTicks: 10,
    spreadDeg: 1,
    kick: 2,
    shake: 0.2,
    burstCount: 1,
    burstIntervalTicks: 0,
    projectilesPerShot: 1,
    damage: 8,
    projectileSpeed: 40,
    projectileKind: 'laser',
    projectileLifeTicks: 12,
    pierce: 3,
    bounce: 0,
    explosionRadius: 0,
    meleeReach: 0,
    meleeArcDeg: 0,
    deflectsProjectiles: false,
    destroysProjectiles: false,
    auto: false,
    sprite: 'sprLaserGun',
    projectileSprite: 'sprLaser',
    fireSound: 'sndLaser',
  },
];

function makeAreaDef(
  code: AreaCode,
  biome: BiomeId,
  name: string,
  nextArea: AreaCode,
  num: number,
  darkness: number,
  bossId?: AreaDef['bossId'],
): AreaDef {
  return {
    code,
    biome,
    name,
    nextArea,
    bossId,
    darkness,
    floorSprite: `sprFloor${num}`,
    floorExploSprite: `sprFloor${num}Explo`,
    wallTopSprite: `sprWall${num}Top`,
    wallBotSprite: `sprWall${num}Bot`,
    wallOutSprite: `sprWall${num}Out`,
    wallTransSprite: `sprWall${num}Trans`,
    musicTrack: `mus/${num}`,
    ambienceTrack: `amb/${num}`,
    targetFloors: 250,
    walkerCount: 3,
    enemyBudgetBase: 12,
    weaponTierBase: Math.min(10, num),
  };
}

export const DEFAULT_AREAS: readonly AreaDef[] = [
  makeAreaDef('1-1', 'desert', 'DESERT', '1-2', 1, 0),
  makeAreaDef('1-2', 'desert', 'DESERT', '1-3', 1, 0),
  makeAreaDef('1-3', 'desert', 'DESERT', '2-1', 1, 0, 'big_bandit'),
  makeAreaDef('2-1', 'sewers', 'SEWERS', '3-1', 2, 0.52),
  makeAreaDef('3-1', 'scrapyard', 'SCRAPYARD', '3-2', 3, 0),
  makeAreaDef('3-2', 'scrapyard', 'SCRAPYARD', '3-3', 3, 0),
  makeAreaDef('3-3', 'scrapyard', 'SCRAPYARD', '4-1', 3, 0, 'big_dog'),
  makeAreaDef('4-1', 'caves', 'CRYSTAL CAVES', '5-1', 4, 0.46),
  makeAreaDef('5-1', 'frozen_city', 'FROZEN CITY', '5-2', 5, 0),
  makeAreaDef('5-2', 'frozen_city', 'FROZEN CITY', '5-3', 5, 0),
  makeAreaDef('5-3', 'frozen_city', 'FROZEN CITY', '6-1', 5, 0, 'lil_hunter'),
  makeAreaDef('6-1', 'labs', 'LABS', '7-1', 6, 0.6),
  makeAreaDef('7-1', 'palace', 'THE PALACE', '7-2', 7, 0.12),
  makeAreaDef('7-2', 'palace', 'THE PALACE', '7-3', 7, 0.15),
  makeAreaDef('7-3', 'palace', 'KRUNKED THRONE', '0-1', 7, 0.15, 'nuclear_throne'),
  makeAreaDef('0-1', 'campfire', 'CAMPFIRE', '1-1', 0, 0.08, 'throne_ii'),
  makeAreaDef('vault', 'vault', 'CROWN VAULT', '1-1', 100, 0.25),
  makeAreaDef('1-?', 'oasis', 'OASIS', '3-3', 101, 0),
  makeAreaDef('2-?', 'pizza_sewers', 'PIZZA SEWERS', '3-1', 102, 0.45),
  makeAreaDef('3-?', 'mansion', "Y.V.'S MANSION", '4-1', 103, 0.05),
  makeAreaDef('4-?', 'cursed_caves', 'CURSED CAVES', '5-1', 104, 0.58),
  makeAreaDef('5-?', 'jungle', 'JUNGLE', '6-1', 105, 0.22),
  makeAreaDef('hq-1', 'hq', 'IDPD HQ', '1-1', 106, 0.1),
];

export const BIOME_SPRITE_NUMBER: Record<BiomeId, number> = {
  campfire: 0,
  desert: 1,
  sewers: 2,
  scrapyard: 3,
  caves: 4,
  frozen_city: 5,
  labs: 6,
  palace: 7,
  vault: 100,
  oasis: 101,
  pizza_sewers: 102,
  mansion: 103,
  cursed_caves: 104,
  jungle: 105,
  hq: 106,
};

export interface BiomeFallbackPalette {
  voidBg: string;
  floor: string;
  floorAlt: string;
  floorCracked: string;
  wallTop: string;
  wallBot: string;
  wallEdge: string;
  darkTint: string;
}

export const BIOME_FALLBACK_PALETTES: Record<BiomeId, BiomeFallbackPalette> = {
  campfire: { voidBg: '#161113', floor: '#5c4b3c', floorAlt: '#4e3f32', floorCracked: '#3b2f24', wallTop: '#3e3028', wallBot: '#291f1a', wallEdge: '#7a624f', darkTint: '14, 10, 12' },
  desert: { voidBg: '#241712', floor: '#c9975b', floorAlt: '#bc8a4f', floorCracked: '#8f6336', wallTop: '#9c5a3c', wallBot: '#6b3926', wallEdge: '#d9ab73', darkTint: '16, 12, 10' },
  sewers: { voidBg: '#0b140d', floor: '#4f6b4b', floorAlt: '#435e40', floorCracked: '#2d402b', wallTop: '#334d39', wallBot: '#1f3024', wallEdge: '#6b8f64', darkTint: '6, 14, 8' },
  scrapyard: { voidBg: '#1c1512', floor: '#695c54', floorAlt: '#5d514a', floorCracked: '#423833', wallTop: '#7d4d38', wallBot: '#4d2d20', wallEdge: '#9e6f56', darkTint: '14, 12, 12' },
  caves: { voidBg: '#12091c', floor: '#4a3261', floorAlt: '#3f2954', floorCracked: '#2c1b3d', wallTop: '#7c42a8', wallBot: '#4a216b', wallEdge: '#b874eb', darkTint: '12, 6, 22' },
  frozen_city: { voidBg: '#121b26', floor: '#9dbbd4', floorAlt: '#8cadc7', floorCracked: '#6283a1', wallTop: '#4c6580', wallBot: '#2f4157', wallEdge: '#cfe6f7', darkTint: '10, 16, 26' },
  labs: { voidBg: '#091416', floor: '#496e6c', floorAlt: '#3f615f', floorCracked: '#2a4241', wallTop: '#2f494d', wallBot: '#1c2d30', wallEdge: '#73a6a3', darkTint: '4, 14, 16' },
  palace: { voidBg: '#0e1121', floor: '#455078', floorAlt: '#3b4569', floorCracked: '#28304d', wallTop: '#2c3557', wallBot: '#1b2138', wallEdge: '#c9a64d', darkTint: '8, 10, 24' },
  vault: { voidBg: '#11141c', floor: '#606875', floorAlt: '#535b69', floorCracked: '#3a404c', wallTop: '#465266', wallBot: '#2b3342', wallEdge: '#8a99b5', darkTint: '10, 14, 20' },
  oasis: { voidBg: '#0c2124', floor: '#3e8077', floorAlt: '#357068', floorCracked: '#23524c', wallTop: '#2a5966', wallBot: '#193942', wallEdge: '#66baa8', darkTint: '6, 18, 22' },
  pizza_sewers: { voidBg: '#1a120e', floor: '#615442', floorAlt: '#544838', floorCracked: '#3d3327', wallTop: '#733e32', wallBot: '#4a251d', wallEdge: '#a66d4f', darkTint: '16, 10, 8' },
  mansion: { voidBg: '#211015', floor: '#7a4552', floorAlt: '#6b3b47', floorCracked: '#4d2731', wallTop: '#b5923e', wallBot: '#785e22', wallEdge: '#f0ce73', darkTint: '18, 10, 14' },
  cursed_caves: { voidBg: '#17071e', floor: '#3d214a', floorAlt: '#321a3d', floorCracked: '#22102b', wallTop: '#9c2d73', wallBot: '#5c1743', wallEdge: '#e063b2', darkTint: '16, 4, 22' },
  jungle: { voidBg: '#0b170a', floor: '#395e36', floorAlt: '#30522e', floorCracked: '#20381e', wallTop: '#2b4a26', wallBot: '#192e16', wallEdge: '#649c56', darkTint: '6, 16, 6' },
  hq: { voidBg: '#0b1224', floor: '#384b6e', floorAlt: '#304161', floorCracked: '#202c45', wallTop: '#243554', wallBot: '#141f33', wallEdge: '#6ca0e6', darkTint: '6, 12, 26' },
};

const MUTANT_BY_ID = new Map<MutantId, MutantDef>(DEFAULT_MUTANTS.map((m) => [m.id, m]));
const MUTATION_BY_ID = new Map<MutationId, MutationDef>(DEFAULT_MUTATIONS.map((m) => [m.id, m]));
const ULTRA_BY_ID = new Map<UltraId, UltraDef>(
  DEFAULT_MUTANTS.flatMap((m) => m.ultras.map((u) => [u.id, u] as const)),
);
const CROWN_BY_ID = new Map<CrownId, CrownDef>(DEFAULT_CROWNS.map((c) => [c.id, c]));
const WEAPON_BY_ID = new Map<string, WeaponDef>(DEFAULT_WEAPONS_LIST.map((w) => [w.id, w]));
const AREA_BY_CODE = new Map<AreaCode, AreaDef>(DEFAULT_AREAS.map((a) => [a.code, a]));
const AREA_BY_BIOME = new Map<BiomeId, AreaDef>();
for (const area of DEFAULT_AREAS) {
  if (!AREA_BY_BIOME.has(area.biome)) {
    AREA_BY_BIOME.set(area.biome, area);
  }
}

export const DEFAULT_UI_DATA_PROVIDER: UiDataProvider = {
  getMutants: () => DEFAULT_MUTANTS,
  getMutant: (id: MutantId) => MUTANT_BY_ID.get(id) ?? DEFAULT_MUTANTS[0]!,
  getMutations: () => DEFAULT_MUTATIONS,
  getMutation: (id: MutationId) => MUTATION_BY_ID.get(id),
  getUltra: (id: UltraId) => ULTRA_BY_ID.get(id),
  getCrowns: () => DEFAULT_CROWNS,
  getCrown: (id: CrownId) => CROWN_BY_ID.get(id) ?? DEFAULT_CROWNS[0]!,
  getWeapon: (id: string) => WEAPON_BY_ID.get(id),
  getEnemy: () => undefined,
  getArea: (code: AreaCode) => AREA_BY_CODE.get(code),
  getAreaByBiome: (biome: BiomeId) => AREA_BY_BIOME.get(biome),
};

/**
 * Helper to resolve a readable weapon name even when UiDataProvider doesn't have an entry.
 */
export function resolveWeaponLabel(weaponId: string, data: UiDataProvider): string {
  const def = data.getWeapon(weaponId);
  if (def) return def.name.toUpperCase();
  return weaponId.replace(/_/g, ' ').toUpperCase();
}

/**
 * Helper to resolve a weapon sprite name from weaponId with safe fallback naming.
 */
export function resolveWeaponSpriteName(weaponId: string, data: UiDataProvider): string {
  const def = data.getWeapon(weaponId);
  if (def && def.sprite) return def.sprite;
  // Convert snake_case id -> sprPascalCase
  const pascal = weaponId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `spr${pascal}`;
}

/**
 * Resolves enemy sprite prefix when EnemyDef is not supplied by data provider.
 */
const ENEMY_ID_TO_SPRITE_PREFIX: Record<string, string> = {
  bandit: 'sprBandit',
  maggot: 'sprMaggot',
  rad_maggot: 'sprRadMaggot',
  big_maggot: 'sprBigMaggot',
  maggot_nest: 'sprMaggotSpawn',
  scorpion: 'sprScorpion',
  gold_scorpion: 'sprGoldScorpion',
  golden_scorpion: 'sprGoldScorpion',
  rat: 'sprRat',
  big_rat: 'sprRatking',
  green_rat: 'sprRat',
  gator: 'sprGator',
  buff_gator: 'sprBuffGator',
  ballguy: 'sprBallguy',
  raven: 'sprRaven',
  sniper: 'sprSniper',
  salamander: 'sprSalamander',
  assassin: 'sprAssassin',
  spider: 'sprSpider',
  crystal_spider: 'sprSpider',
  laser_crystal: 'sprLaserCrystal',
  lightning_crystal: 'sprLightningCrystal',
  snowbot: 'sprSnowBot',
  wolf: 'sprWolf',
  snow_wolf: 'sprWolf',
  snow_tank: 'sprSnowTank',
  gold_snow_tank: 'sprGoldSnowTank',
  golden_snow_tank: 'sprGoldSnowTank',
  freak: 'sprFreak1',
  rhino_freak: 'sprRhinoFreak',
  explo_freak: 'sprExploFreak',
  necromancer: 'sprNecromancer',
  turret: 'sprTurret',
  guardian: 'sprGuardian',
  palace_guardian: 'sprGuardian',
  explo_guardian: 'sprExploGuardian',
  guardian_dog: 'sprGuardianDog',
  idpd_grunt: 'sprGrunt',
  grunt: 'sprGrunt',
  idpd_inspector: 'sprInspector',
  inspector: 'sprInspector',
  idpd_shielder: 'sprShielder',
  shielder: 'sprShielder',
  idpd_van: 'sprVan',
  mimic: 'sprMimic',
  ally: 'sprAlly',
  rebel_ally: 'sprAlly',
  sapling: 'sprSapling',
  big_bandit: 'sprBanditBoss',
  big_dog: 'sprScrapBoss',
  lil_hunter: 'sprLilHunter',
  nuclear_throne: 'sprNothing',
  throne_ii: 'sprNothing2',
};

export function resolveEnemySpritePrefix(defId: string, bossId?: string): string {
  if (bossId && ENEMY_ID_TO_SPRITE_PREFIX[bossId]) {
    return ENEMY_ID_TO_SPRITE_PREFIX[bossId]!;
  }
  const direct = ENEMY_ID_TO_SPRITE_PREFIX[defId];
  if (direct) return direct;
  const pascal = defId
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return `spr${pascal}`;
}
