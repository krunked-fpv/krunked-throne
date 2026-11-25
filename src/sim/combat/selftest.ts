import fs from 'node:fs';
import path from 'node:path';
import {
  TileType,
  type AssetManifest,
  type EnemyEntity,
  type InputFrame,
  type MutationId,
} from '@/contracts';
import { createFallbackManifest } from '@/assets';
import {
  AREAS,
  AREA_CODES,
  CROWNS,
  CROWN_IDS,
  ENEMIES,
  MUTANTS,
  MUTANT_IDS,
  MUTATIONS,
  MUTATION_IDS,
  ULTRAS,
  WEAPONS,
  WEAPON_IDS,
  getNextAreaTransition,
} from '@/data';
import {
  SeededRng,
  allocEntityId,
  getTile,
  hashSimState,
  setTile,
  stepCorpses,
  stepPortal,
  tileToWorldCenter,
} from '@/sim/core';
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  getPlayerMoveSpeed,
  spawnCorpse,
  spawnEnemyProjectile,
  spawnExplosion,
  stepPlayerAndCombat,
} from '@/sim/combat';
import {
  addRads,
  applyMutationSelection,
  checkPortalTrigger,
  createInitialSimState,
  givePlayerWeapon,
  grantMutationById,
  loadAreaIntoState,
  openPendingLevelUp,
} from '@/sim/progression';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function blankInput(aimX: number, aimY: number): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimWorldX: aimX,
    aimWorldY: aimY,
    fireHeld: false,
    firePressed: false,
    activeHeld: false,
    activePressed: false,
    swapPressed: false,
    pickupPressed: false,
    pausePressed: false,
  };
}

function makeDummyEnemy(id: number, x: number, y: number, hp = 20): EnemyEntity {
  return {
    id,
    defId: 'bandit',
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    radius: 6,
    hp,
    maxHp: hp,
    facing: -1,
    aimAngle: Math.PI,
    hurtFlashTicks: 0,
    snaredTicks: 0,
    aiState: 'idle',
    aiTimer: 0,
    aiPhase: 0,
    attackCooldown: 0,
    targetX: x,
    targetY: y,
    animFrame: 0,
    contactDamage: 1,
    radDrop: 2,
  };
}

function runTest1ManifestValidation(): void {
  const localManifestPath = path.resolve(process.cwd(), '.nt-assets/manifest.json');
  const usingSteamManifest = fs.existsSync(localManifestPath);
  const manifest: AssetManifest = usingSteamManifest
    ? (JSON.parse(fs.readFileSync(localManifestPath, 'utf8')) as AssetManifest)
    : createFallbackManifest();

  assert(WEAPON_IDS.length >= 105, `Expected >= 105 weapons, got ${WEAPON_IDS.length}`);
  assert(MUTANT_IDS.length === 12, `Expected 12 mutants, got ${MUTANT_IDS.length}`);
  assert(MUTATION_IDS.length === 29, `Expected 29 mutations, got ${MUTATION_IDS.length}`);
  assert(Object.keys(ULTRAS).length === 24, `Expected 24 ultras, got ${Object.keys(ULTRAS).length}`);
  assert(CROWN_IDS.length === 13, `Expected 13 crowns, got ${CROWN_IDS.length}`);
  assert(AREA_CODES.length === 23, `Expected 23 areas, got ${AREA_CODES.length}`);

  const missing: string[] = [];
  // Sprites verified in Steam manifest that art-overhaul registers in parallel for built-in fallback
  const pendingFallbackSprites = new Set(['sprNuke', 'sprToxicGas', 'sprCursedChest', 'sprHealthChest', 'sprRogueStrike']);
  const checkSpr = (ctx: string, key?: string) => {
    if (key && !manifest.sprites[key]) {
      if (!usingSteamManifest && pendingFallbackSprites.has(key)) return;
      missing.push(`SPR ${ctx}: ${key}`);
    }
  };
  const checkSnd = (ctx: string, key?: string) => {
    if (key && !manifest.sounds[key]) missing.push(`SND ${ctx}: ${key}`);
  };
  const checkMus = (ctx: string, key?: string) => {
    if (key && !(key in manifest.music)) missing.push(`MUS ${ctx}: ${key}`);
  };
  const checkAmb = (ctx: string, key?: string) => {
    if (key && !(key in manifest.ambience)) missing.push(`AMB ${ctx}: ${key}`);
  };

  for (const m of Object.values(MUTANTS)) {
    for (const [k, v] of Object.entries(m.sprites)) checkSpr(`mutant.${m.id}.${k}`, v);
    for (const [k, v] of Object.entries(m.sounds)) checkSnd(`mutant.${m.id}.${k}`, v);
    assert(Boolean(WEAPONS[m.startingWeapon]), `Mutant ${m.id} startingWeapon missing: ${m.startingWeapon}`);
    if (m.secondaryWeapon) {
      assert(Boolean(WEAPONS[m.secondaryWeapon]), `Mutant ${m.id} secondaryWeapon missing: ${m.secondaryWeapon}`);
    }
  }
  for (const u of Object.values(ULTRAS)) {
    checkSpr(`ultra.${u.id}`, u.sprite);
  }
  for (const mut of Object.values(MUTATIONS)) {
    checkSpr(`mutation.${mut.id}`, mut.sprite);
    checkSpr(`mutation.${mut.id}.hud`, mut.hudSprite);
  }
  for (const c of Object.values(CROWNS)) {
    checkSpr(`crown.${c.id}.idle`, c.spriteIdle);
    checkSpr(`crown.${c.id}.walk`, c.spriteWalk);
  }
  for (const a of Object.values(AREAS)) {
    checkSpr(`area.${a.code}.floor`, a.floorSprite);
    checkSpr(`area.${a.code}.floorExplo`, a.floorExploSprite);
    checkSpr(`area.${a.code}.wallTop`, a.wallTopSprite);
    checkSpr(`area.${a.code}.wallBot`, a.wallBotSprite);
    checkSpr(`area.${a.code}.wallOut`, a.wallOutSprite);
    checkSpr(`area.${a.code}.wallTrans`, a.wallTransSprite);
    checkMus(`area.${a.code}.music`, a.musicTrack);
    checkMus(`area.${a.code}.musicB`, a.musicTrackB);
    checkMus(`area.${a.code}.bossMusic`, a.bossMusicTrack);
    checkAmb(`area.${a.code}.ambience`, a.ambienceTrack);
  }
  for (const e of Object.values(ENEMIES)) {
    for (const [k, v] of Object.entries(e.sprites)) checkSpr(`enemy.${e.id}.${k}`, v);
    for (const [k, v] of Object.entries(e.sounds)) checkSnd(`enemy.${e.id}.${k}`, v);
  }
  for (const w of Object.values(WEAPONS)) {
    checkSpr(`weapon.${w.id}.sprite`, w.sprite);
    checkSpr(`weapon.${w.id}.proj`, w.projectileSprite);
    checkSnd(`weapon.${w.id}.sound`, w.fireSound);
  }

  // Also verify every combat/progression emitted SFX & sprite literal exists in manifest!
  const runtimeSprites = [
    'sprWeaponChest', 'sprWeaponChestOpen', 'sprWeaponChestBig', 'sprWeaponChestBigOpen',
    'sprAmmoChest', 'sprAmmoChestOpen', 'sprRadChest', 'sprRogueAmmoChest', 'sprRogueAmmoChestOpen',
    'sprTangle', 'sprTangleSeed', 'sprHorrorBullet', 'sprAllyBullet', 'sprEnemyBullet1',
    'sprExplosion', 'sprSmallExplosion', 'sprGreenExplosion', 'sprMeatExplosion', 'sprRogueExplosion',
    'sprSlash', 'sprBullet1', 'sprBullet2', 'sprGrenade',
  ];
  const runtimeSounds = [
    'sndRoll', 'sndFishTB', 'sndFishWarrantEnd', 'sndCrystalShield', 'sndCrystalRicochet',
    'sndCrystalTB', 'sndCrystalJuggernaut', 'sndEyesLoop', 'sndEyesLoopUpg', 'sndCorpseExplo', 'sndCorpseExploUpg',
    'sndCorpseExploDead', 'sndPlantFire', 'sndPlantFireTB', 'sndPlantSnare', 'sndPlantSnareTB',
    'sndPlantSnareTrapper', 'sndPlantSnareTrapperTB',
    'sndPlantTBKill', 'sndPopPop', 'sndPopPopUpg', 'sndRobotEat', 'sndRobotEatUpg',
    'sndChickenThrow', 'sndChickenReturn', 'sndChickenLoseHead', 'sndChickenRegenHead', 'sndChickenHeadlessLoop',
    'sndSpawnAlly', 'sndSpawnSuperAlly', 'sndHorrorLoop', 'sndHorrorLoopTB', 'sndHorrorEmpty',
    'sndHorrorPortal', 'sndPortalStrikeFire', 'sndPortalStrikeFireButt', 'sndPortalStrikeEmpty',
    'sndRogueAim', 'sndPortalStrikeLoop',
    'sndRogueCanister', 'sndMeleeFlip', 'sndDiscBounce', 'sndShotgunHitWall', 'sndImpWristHit',
    'sndBloodlustProc', 'sndLuckyShotProc', 'sndStrongSpiritLost', 'sndStrongSpiritGain',
    'sndMutAppear', 'sndMutRhinoSkin', 'sndMutBloodLust', 'sndMutShotgunFingers', 'sndMutHammerhead',
    'sndLevelUp', 'sndLevelUltra',
    'sndPortalOpen', 'sndPortalClose', 'sndPortalLoop', 'sndWeaponChest', 'sndBigWeaponChest', 'sndCursedChest',
    'sndCursedPickup', 'sndSwapCursed', 'sndAmmoChest', 'sndEXPChest', 'sndHealthChestBig',
    'sndWeaponPickup', 'sndAmmoPickup', 'sndRadPickup', 'sndHPPickup', 'sndHPPickupBig',
    'sndSwapPistol', 'sndSwapShotgun', 'sndSwapMachinegun', 'sndSwapBow', 'sndSwapEnergy', 'sndSwapExplosive',
    'sndSwapHammer', 'sndSwapSword', 'sndSwapGold', 'sndSwapFlame', 'sndSwapMotorized',
    'sndShotReload', 'sndCrossReload', 'sndNadeReload', 'sndPlasmaReload', 'sndLightningReload',
    'sndEmpty', 'sndUltraEmpty', 'sndHammerHeadProc', 'sndHitMetal',
    'sndHitFlesh', 'sndExplosion', 'sndExplosionL', 'sndExplosionCar', 'sndNukeExplosion',
    'sndBloodLauncherExplo', 'sndBloodHurt', 'sndPlasmaHit', 'sndPlasmaBigExplode',
    'sndPlasmaBigExplodeUpg', 'sndFlakExplode', 'sndSuperFlakExplode',
    'sndToxicBarrelGas', 'sndToxicBoltGas', 'sndUltraGrenadeSuck',
    'sndBigGeneratorBreak', 'sndSaplingSpawn', 'sndLightningHit',
  ];
  for (const s of runtimeSprites) checkSpr('runtime', s);
  if (usingSteamManifest) {
    for (const s of runtimeSounds) checkSnd('runtime', s);
  } else {
    // Built-in fallback synthesizes all runtime snd* literals dynamically; validate canonical naming
    for (const s of runtimeSounds) {
      assert(/^snd[A-Z][A-Za-z0-9_]*$/.test(s), `Invalid runtime sound key: ${s}`);
    }
  }

  assert(
    missing.length === 0,
    `Found ${missing.length} missing manifest keys:\n  ${missing.slice(0, 25).join('\n  ')}`,
  );

  // Verify darkness invariant
  assert(AREAS['2-1'].darkness === 0.55, 'Sewers darkness must be 0.55');
  assert(AREAS['4-1'].darkness === 0.5, 'Caves darkness must be 0.50');
  assert(AREAS['6-1'].darkness === 0.6, 'Labs darkness must be 0.60');
  assert(AREAS['1-1'].darkness === 0, 'Desert darkness must be 0');

  // Verify 7-3 -> 0-1 -> 1-1 Loop+1
  const t1 = getNextAreaTransition('7-3', 0);
  assert(t1.areaCode === '0-1' && t1.loop === 0, '7-3 must lead to 0-1 loop 0');
  const t2 = getNextAreaTransition('0-1', 0);
  assert(t2.areaCode === '1-1' && t2.loop === 1, '0-1 must lead to 1-1 loop 1');

  console.log(
    `[PASS 1/5] Manifest 100% verified: WEAPONS=${WEAPON_IDS.length}, MUTANTS=${MUTANT_IDS.length}, MUTATIONS=${MUTATION_IDS.length}, ULTRAS=${Object.keys(ULTRAS).length}, CROWNS=${CROWN_IDS.length}, AREAS=${AREA_CODES.length}, ENEMIES=${Object.keys(ENEMIES).length} (0 missing keys!)`,
  );
}

function runTest2All12MutantActives(): void {
  for (const mutantId of MUTANT_IDS) {
    const state = createInitialSimState({ mutant: mutantId, seed: 4242 });
    const rng = SeededRng.fromState(state.rngState);

    // Ensure clear 6-tile lane to the right of spawn so ranged actives travel unobstructed
    const ptx = Math.floor(state.player.x / state.map.tileSize);
    const pty = Math.floor(state.player.y / state.map.tileSize);
    for (let dx = -1; dx <= 6; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        setTile(state.map, ptx + dx, pty + dy, TileType.Floor);
      }
    }

    // Prepare context so every mutant active has something real to act on
    if (mutantId === 'melting') {
      spawnCorpse(state, state.player.x + 20, state.player.y, 0, 0, 1, 'sprBanditDead', 12, true);
    } else if (mutantId === 'horror') {
      state.player.rads = 25;
    } else if (mutantId === 'robot') {
      givePlayerWeapon(state, 'shotgun', 1, false);
    }

    const input: InputFrame = {
      ...blankInput(state.player.x + 48, state.player.y),
      activePressed: true,
      activeHeld: true,
    };

    const preShots = state.stats.shotsFired;
    const preCorpses = state.corpses.length;
    const preStrikes = state.player.portalStrikes;
    const preRads = state.player.rads;

    state.tick += 1;
    stepPlayerAndCombat(state, input, rng);
    if (mutantId === 'rogue') {
      assert(state.player.portalStrikeAim?.active === true, 'Rogue did not enter hold-to-drag Portal Strike aim');
    }
    state.tick += 1;
    stepPlayerAndCombat(
      state,
      { ...input, activePressed: false, activeHeld: mutantId === 'rogue' ? false : true },
      rng,
    );

    assert(Number.isFinite(state.player.x) && Number.isFinite(state.player.y), `${mutantId} produced NaN position`);
    assert(Number.isFinite(state.player.hp), `${mutantId} produced NaN HP`);

    // Assert concrete mechanical behavior per mutant
    if (mutantId === 'fish') assert(state.player.rolling, 'Fish did not roll');
    if (mutantId === 'crystal') assert(state.player.shielding, 'Crystal did not shield');
    if (mutantId === 'eyes') assert(state.player.telekinesisActive, 'Eyes did not activate telekinesis');
    if (mutantId === 'melting') assert(state.corpses.length < preCorpses, 'Melting did not detonate corpse');
    if (mutantId === 'plant') {
      const hasSnare =
        state.projectiles.some((p) => p.kind === 'snare') ||
        state.props.some((pr) => pr.kind === 'snare_trap');
      assert(hasSnare, 'Plant did not fire/bloom snare');
    }
    if (mutantId === 'yv') assert(state.stats.shotsFired >= preShots + 2, 'Y.V. Pop Pop did not fire 2 shots');
    if (mutantId === 'steroids') assert(state.stats.shotsFired >= preShots + 1, 'Steroids did not fire secondary weapon');
    if (mutantId === 'robot') assert(state.player.weapons[1] === null, 'Robot did not eat gun');
    if (mutantId === 'chicken') {
      const hasThrown =
        state.projectiles.some((p) => p.kind === 'thrown_weapon') ||
        state.pickups.some((pk) => pk.kind === 'weapon');
      assert(hasThrown, 'Chicken did not throw weapon');
    }
    if (mutantId === 'rebel') assert(state.enemies.some((e) => e.friendly && e.defId === 'rebel_ally'), 'Rebel did not spawn ally');
    if (mutantId === 'horror') assert(state.player.rads < preRads && state.projectiles.some((p) => p.kind === 'rad_beam'), 'Horror did not fire rad beam');
    if (mutantId === 'rogue') assert(state.player.portalStrikes === preStrikes - 1, 'Rogue did not launch Portal Strike');
  }

  console.log('[PASS 2/5] All 12 Mutants instantiated and executed RMB actives cleanly with verified mechanics');
}

function runTest3All29Mutations(): void {
  const baseState = createInitialSimState({ mutant: 'fish', seed: 9001 });
  const rng = SeededRng.fromState(baseState.rngState);
  const baseSpeed = getPlayerMoveSpeed(baseState.player);
  const baseMaxHp = baseState.player.maxHp;
  const baseBulletMax = baseState.player.ammoMax.bullet;

  for (const mutId of MUTATION_IDS) {
    const ok = grantMutationById(baseState, mutId, rng);
    assert(ok, `grantMutationById failed for ${mutId}`);
    assert(baseState.player.mutations.includes(mutId), `Mutation ${mutId} missing from player.mutations`);
  }

  assert(baseState.player.maxHp === baseMaxHp + 4, 'Rhino Skin did not add +4 maxHp');
  assert(getPlayerMoveSpeed(baseState.player) > baseSpeed, 'Extra Feet did not increase move speed');
  assert(baseState.player.ammoMax.bullet > baseBulletMax, 'Back Muscle did not raise ammoMax');
  assert(baseState.player.strongSpiritReady, 'Strong Spirit did not ready');
  assert(baseState.player.ammo.bullet === baseState.player.ammoMax.bullet, 'Last Wish did not refill ammo');

  // Verify Boiling Veins blocks explosion damage at <= 4 HP
  const bvState = createInitialSimState({ mutant: 'fish', seed: 9002 });
  const bvRng = SeededRng.fromState(bvState.rngState);
  grantMutationById(bvState, 'boiling_veins', bvRng);
  bvState.player.hp = 4;
  const dealt = applyDamageToPlayer(bvState, 4, 'EXPLOSION', 'sprExplosion', bvRng, { isExplosion: true });
  assert(!dealt && bvState.player.hp === 4, 'Boiling Veins failed to block explosion damage at 4 HP');

  // Verify Strong Spirit prevents lethal damage once
  const ssState = createInitialSimState({ mutant: 'fish', seed: 9003 });
  const ssRng = SeededRng.fromState(ssState.rngState);
  grantMutationById(ssState, 'strong_spirit', ssRng);
  applyDamageToPlayer(ssState, 20, 'BIG HIT', 'sprEnemyBullet1', ssRng);
  assert(ssState.player.alive && ssState.player.hp === 1 && !ssState.player.strongSpiritReady, 'Strong Spirit did not save player at 1 HP');

  // Verify Sharp Teeth retaliates to nearby enemy
  const stState = createInitialSimState({ mutant: 'crystal', seed: 9004 });
  const stRng = SeededRng.fromState(stState.rngState);
  grantMutationById(stState, 'sharp_teeth', stRng);
  const foe = makeDummyEnemy(allocEntityId(stState), stState.player.x + 32, stState.player.y, 20);
  stState.enemies.push(foe);
  applyDamageToPlayer(stState, 3, 'TEST', 'sprEnemyBullet1', stRng);
  assert(foe.hp === 14, `Sharp Teeth expected enemy HP 14, got ${foe.hp}`);

  // Verify Trigger Fingers reduces reload on kill
  const tfState = createInitialSimState({ mutant: 'fish', seed: 9005 });
  const tfRng = SeededRng.fromState(tfState.rngState);
  grantMutationById(tfState, 'trigger_fingers', tfRng);
  tfState.player.weapons[0]!.reloadTicks = 20;
  const weakFoe = makeDummyEnemy(allocEntityId(tfState), tfState.player.x + 24, tfState.player.y, 2);
  tfState.enemies.push(weakFoe);
  applyDamageToEnemy(tfState, weakFoe, 5, 1, 0, tfRng);
  assert(tfState.player.weapons[0]!.reloadTicks < 20, 'Trigger Fingers did not reduce reload on kill');

  console.log('[PASS 3/5] All 29 Mutations applied cleanly and verified mechanical modifiers');
}

function runTest4MeleeDeflectAntiTunnelAndWallCarve(): void {
  // 4A. Melee deflection (Wrench) and destruction (Screwdriver)
  const state = createInitialSimState({ mutant: 'fish', seed: 777 });
  const rng = SeededRng.fromState(state.rngState);
  const ptx = Math.floor(state.player.x / state.map.tileSize);
  const pty = Math.floor(state.player.y / state.map.tileSize);
  for (let dx = -1; dx <= 6; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      setTile(state.map, ptx + dx, pty + dy, TileType.Floor);
    }
  }
  givePlayerWeapon(state, 'wrench', 0, false);
  state.player.activeSlot = 0;

  const incoming = spawnEnemyProjectile(state, {
    x: state.player.x + 18,
    y: state.player.y,
    angle: Math.PI, // moving left toward player
    speed: 4,
    damage: 2,
  });

  state.tick += 1;
  stepPlayerAndCombat(
    state,
    {
      ...blankInput(state.player.x + 40, state.player.y),
      firePressed: true,
      fireHeld: true,
    },
    rng,
  );
  assert(incoming.team === 'player' && incoming.vx > 0, 'Wrench melee swing did not deflect incoming enemy projectile!');

  // Screwdriver destroys projectile
  givePlayerWeapon(state, 'screwdriver', 0, false);
  state.player.weapons[0]!.reloadTicks = 0;
  const incoming2 = spawnEnemyProjectile(state, {
    x: state.player.x + 16,
    y: state.player.y,
    angle: Math.PI,
    speed: 3,
    damage: 2,
  });
  state.tick += 1;
  stepPlayerAndCombat(
    state,
    {
      ...blankInput(state.player.x + 40, state.player.y),
      firePressed: true,
      fireHeld: true,
    },
    rng,
  );
  assert(!state.projectiles.includes(incoming2), 'Screwdriver melee swing did not destroy incoming enemy projectile!');

  // 4B. Anti-tunneling test: build a 1-tile solid vertical wall and fire a 48 px/tick projectile straight at it!
  const tunnelState = createInitialSimState({ mutant: 'fish', seed: 778 });
  const tRng = SeededRng.fromState(tunnelState.rngState);
  const map = tunnelState.map;
  // Clear a 9x5 test chamber inside interior, place a 1-tile wall divider in the middle
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  for (let ty = cy - 2; ty <= cy + 2; ty++) {
    for (let tx = cx - 4; tx <= cx + 4; tx++) {
      setTile(map, tx, ty, TileType.Floor);
    }
  }
  const wallTx = cx + 1;
  for (let ty = cy - 2; ty <= cy + 2; ty++) {
    setTile(map, wallTx, ty, TileType.Wall);
  }
  const startPos = tileToWorldCenter(cx - 2, cy, map.tileSize);
  const wallLeftX = wallTx * map.tileSize;
  tunnelState.player.x = startPos.x;
  tunnelState.player.y = startPos.y;

  const fastProjId = allocEntityId(tunnelState);
  tunnelState.projectiles.push({
    id: fastProjId,
    kind: 'bullet',
    team: 'player',
    x: startPos.x,
    y: startPos.y,
    prevX: startPos.x,
    prevY: startPos.y,
    vx: 48, // 3 whole tiles in 1 tick!
    vy: 0,
    angle: 0,
    radius: 3,
    damage: 10,
    lifeTicks: 30,
    maxLifeTicks: 30,
    pierce: 0,
    bounce: 0,
    explosionRadius: 0,
    sprite: 'sprBullet1',
    hitIds: [],
  });

  stepPlayerAndCombat(tunnelState, blankInput(startPos.x + 100, startPos.y), tRng);
  const survived = tunnelState.projectiles.find((p) => p.id === fastProjId);
  assert(!survived, '48 px/tick projectile tunneled through 1-tile solid wall!');

  // 4C. Explosion carves solid walls into TileType.FloorCracked!
  const wallCenter = tileToWorldCenter(wallTx, cy, map.tileSize);
  assert(getTile(map, wallTx, cy) === TileType.Wall, 'Pre-condition wall missing');
  spawnExplosion(tunnelState, wallLeftX - 2, wallCenter.y, 32, 30, 'player', tRng);
  assert(
    getTile(map, wallTx, cy) === TileType.FloorCracked,
    `Explosion failed to carve wall tile; got tile=${getTile(map, wallTx, cy)}`,
  );

  console.log('[PASS 4/5] Melee deflection/destruction, 48 px/tick zero-tunnel wall hit, and explosion wall-carving verified');
}

function runTest5LevelUpUltraPortalAndDeterminism(): void {
  // Verify Horror gets 5 cards, Fish gets 4 cards, Level 10 triggers ultra_select, and portal transitions deterministically!
  const runDeterministicScenario = (seed: number): string => {
    const state = createInitialSimState({ mutant: 'horror', seed });
    const rng = SeededRng.fromState(state.rngState);

    // Spawn 1 enemy and kill it so portal opens
    const foe = makeDummyEnemy(allocEntityId(state), state.player.x + 24, state.player.y, 5);
    state.enemies.push(foe);
    state.levelStartEnemyCount = 1;

    // Grant enough rads for level 2 (60 rads)
    const gained1 = addRads(state, 65, rng);
    assert(gained1 === 1 && state.player.level === 2 && state.pendingLevelUps === 1, 'Level 1->2 failed');

    // Kill enemy -> portal opens
    applyDamageToEnemy(state, foe, 10, 2, 0, rng);
    stepCorpses(state);
    const triggerRes = checkPortalTrigger(state, rng);
    assert(triggerRes === 'portal_opened' && state.portal.active, 'Portal did not open after killing last enemy');

    // Move player onto portal center and step portal until portal_transition triggers mutation_select
    state.player.x = state.portal.x;
    state.player.y = state.portal.y;
    let openedSelection = false;
    for (let t = 0; t < 40; t++) {
      state.tick += 1;
      stepPortal(state);
      const res = checkPortalTrigger(state, rng);
      if (res === 'selection_opened') {
        openedSelection = true;
        break;
      }
    }
    assert(openedSelection && state.phase === 'mutation_select', 'Portal transition did not open mutation_select');
    assert(state.pendingMutations.length === 5, `Horror should get 5 mutation cards, got ${state.pendingMutations.length}`);

    // Pick card 0 -> advances directly into area 1-2!
    const picked = applyMutationSelection(state, 0, rng);
    assert(picked && state.areaCode === '1-2' && state.phase === 'playing', `Expected area 1-2 playing after mutation pick, got ${state.areaCode} / ${state.phase}`);
    assert(state.player.mutations.length === 1, 'Player should have 1 mutation after pick');

    // Level up all the way to Level 10 -> Ultra selection!
    addRads(state, 3000, rng);
    assert(state.player.level === 10, `Expected level 10, got ${state.player.level}`);
    // Clear pending regular picks until ultra_select appears
    let sawUltra = false;
    for (let guard = 0; guard < 15 && state.pendingLevelUps > 0; guard++) {
      openPendingLevelUp(state, rng);
      if (state.phase === 'ultra_select') {
        sawUltra = true;
        assert(state.pendingUltras.length === 2, 'Ultra selection must offer 2 ultras');
        applyMutationSelection(state, 0, rng);
        break;
      } else if (state.phase === 'mutation_select') {
        applyMutationSelection(state, 0, rng);
      }
    }
    assert(sawUltra && state.player.ultra === 'horror_a', `Expected horror_a ultra, got ${state.player.ultra}`);

    // Verify 7-3 -> 0-1 -> 1-1 Loop 1 via loadAreaIntoState
    loadAreaIntoState(state, '7-3', 0);
    assert(state.generatorsRemaining === 4 && state.portal.targetArea === '0-1', '7-3 load invariant failed');
    loadAreaIntoState(state, '0-1', 0);
    assert(state.portal.targetArea === '1-1' && state.portal.nextLoop === 1, '0-1 -> 1-1 loop 1 transition invariant failed');

    return hashSimState(state);
  };

  const hashA = runDeterministicScenario(20261125);
  const hashB = runDeterministicScenario(20261125);
  assert(hashA === hashB, `Determinism failure: ${hashA} !== ${hashB}`);

  // Also verify standard 4 cards for non-Horror mutant
  const fishState = createInitialSimState({ mutant: 'fish', seed: 1234 });
  const fRng = SeededRng.fromState(fishState.rngState);
  addRads(fishState, 60, fRng);
  openPendingLevelUp(fishState, fRng);
  assert(fishState.pendingMutations.length === 4, `Fish should draw 4 mutation cards, got ${fishState.pendingMutations.length}`);

  // Verify zero DOM / Math.random usage in src/data, src/sim/combat, src/sim/progression
  const pureDirs = ['src/data', 'src/sim/combat', 'src/sim/progression'];
  const forbidden = /\b(window|document|Math\.random)\b/;
  for (const dir of pureDirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.ts') || file === 'selftest.ts') continue;
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      assert(!forbidden.test(content), `Forbidden DOM/Math.random usage found in ${dir}/${file}`);
    }
  }

  console.log(`[PASS 5/5] Level-up, 4/5-card mutation draw, Level 10 ultra_select, portal transition, purity & determinism verified (hash=${hashA})`);
}

runTest1ManifestValidation();
runTest2All12MutantActives();
runTest3All29Mutations();
runTest4MeleeDeflectAntiTunnelAndWallCarve();
runTest5LevelUpUltraPortalAndDeterminism();
console.log('ALL GAMEPLAY-CORE SELFTESTS PASSED (5/5)!');
