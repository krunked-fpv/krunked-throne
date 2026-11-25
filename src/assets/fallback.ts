import type {
  AssetManifest,
  ObjectDef,
  SoundDef,
  TexturePageDef,
} from '@/contracts';
import { AREAS } from '@/data/areas';
import { ENEMIES } from '@/data/enemies';
import { MUTANTS } from '@/data/mutants';
import { WEAPONS } from '@/data/weapons';
import type { AssetBundle, TextureImageSource } from './loader';
import {
  ATLAS_PAGE_HEIGHT,
  ATLAS_PAGE_WIDTH,
  type DrawCtx,
  FallbackAtlasBuilder,
  type PlacedDrawOp,
  registerFallbackFonts,
} from './fallback-fonts';
import { registerFallbackEntities } from './fallback-entities';
import { registerFallbackUi } from './fallback-ui';
import { registerFallbackWorld } from './fallback-world';

const FALLBACK_GENERATED_AT = '1970-01-01T00:00:00.000Z';

interface BuiltFallback {
  manifest: AssetManifest;
  drawOps: PlacedDrawOp[];
  pageCount: number;
}

function collectFallbackSoundNames(): string[] {
  const names = new Set<string>([
    'sndPistol',
    'sndShotgun',
    'sndMachinegun',
    'sndCrossbow',
    'sndGrenade',
    'sndLaser',
    'sndPlasma',
    'sndWrench',
    'sndSword',
    'sndExplosion',
    'sndEnemyHit',
    'sndEnemyDie',
    'sndPickupRad',
    'sndPickupAmmo',
    'sndPickupHP',
    'sndPickupWeapon',
    'sndWeaponPickup',
    'sndPortalOpen',
    'sndPortalEnter',
    'sndLevelUp',
    'sndClick',
    'sndHover',
    'sndEmpty',
    'sndUltraEmpty',
    'sndEnemyAlert',
    'sndHitConfirm',
    'sndCorpseImpact',
    'sndMeleeDeflect',
    'sndRoll',
    'sndCrystalShield',
    'sndCorpseExplo',
    'sndBossIntro',
    'sndBigBanditIntro',
    'sndBigDogIntro',
    'sndLilHunterAppear',
    'sndNothingStart',
    'sndNothing2Appear',
    'sndIDPDPortalSpawn',
    'sndVanPortal',
    'sndVanWarning',
  ]);

  for (const w of Object.values(WEAPONS)) {
    if (w.fireSound) names.add(w.fireSound);
  }
  for (const m of Object.values(MUTANTS)) {
    for (const s of Object.values(m.sounds)) {
      if (s) names.add(s);
    }
  }
  for (const e of Object.values(ENEMIES)) {
    for (const s of Object.values(e.sounds)) {
      if (s) names.add(s);
    }
  }

  return Array.from(names).sort();
}

function buildFallbackData(): BuiltFallback {
  const b = new FallbackAtlasBuilder();

  // 1. Razor-sharp native integer-scaled Krunked Throne pixel fonts (4x5 fntSmall + 5x7 fntM1/fntL)
  const fonts = registerFallbackFonts(b);

  // 2. Rich textured biomes, campfire, portals, chests, props, pickups & decals
  registerFallbackWorld(b);

  // 3. All 12 mutants (A+B), all 50 enemies, all 5 towering bosses, all 142 weapons & projectiles
  registerFallbackEntities(b);

  // 4. Krunked Throne title emblem, 24 bust portraits, char select, 29 mutations, 24 ultras, 13 crowns & HUD
  registerFallbackUi(b);

  // 5. Complete synthetic sound, music & ambience registries
  const soundNames = collectFallbackSoundNames();
  const sounds: Record<string, SoundDef> = {};
  const soundsById: string[] = [];
  soundNames.forEach((name, id) => {
    sounds[name] = {
      id,
      name,
      flags: 0,
      file: name,
      volume: 1,
      pitch: 1,
      groupId: 0,
      audioId: -1,
      sourceType: 'fallback-synth',
      path: '',
    };
    soundsById.push(name);
  });

  const musicKeys = new Set<string>([
    'mus/ThemeA', 'mus/ThemeB', 'mus/100', 'mus/100b',
    'mus/1', 'mus/1b', 'mus/2', 'mus/3', 'mus/3b',
    'mus/4', 'mus/5', 'mus/5b', 'mus/6', 'mus/7', 'mus/7b',
    'mus/Boss1', 'mus/Boss2', 'mus/Boss3', 'mus/Boss4A', 'mus/Boss4B', 'mus/Boss5',
  ]);
  const ambKeys = new Set<string>([
    'amb/0', 'amb/1', 'amb/2', 'amb/3', 'amb/4', 'amb/5', 'amb/6', 'amb/7', 'amb/100',
  ]);
  for (const area of Object.values(AREAS)) {
    if (area.musicTrack) musicKeys.add(area.musicTrack);
    if (area.musicTrackB) musicKeys.add(area.musicTrackB);
    if (area.bossMusicTrack) musicKeys.add(area.bossMusicTrack);
    if (area.ambienceTrack) ambKeys.add(area.ambienceTrack);
  }

  const music: Record<string, string> = {};
  for (const key of Array.from(musicKeys).sort()) music[key] = '';

  const ambience: Record<string, string> = {};
  for (const key of Array.from(ambKeys).sort()) ambience[key] = '';

  const looseSounds: Record<string, string> = {};

  const spriteIdOf = (name: string): number => b.sprites[name]?.id ?? 0;
  const objects: Record<string, ObjectDef> = {
    Player: { id: 0, name: 'Player', spriteId: spriteIdOf('sprMutant1Idle'), spriteName: 'sprMutant1Idle', visible: true, solid: false, depth: -2, persistent: true, parentId: -1, textureMaskId: -1 },
    Bandit: { id: 1, name: 'Bandit', spriteId: spriteIdOf('sprBanditIdle'), spriteName: 'sprBanditIdle', visible: true, solid: false, depth: -2, persistent: false, parentId: -1, textureMaskId: -1 },
    Portal: { id: 2, name: 'Portal', spriteId: spriteIdOf('sprPortal'), spriteName: 'sprPortal', visible: true, solid: false, depth: -5, persistent: false, parentId: -1, textureMaskId: -1 },
    WeaponChest: { id: 3, name: 'WeaponChest', spriteId: spriteIdOf('sprWeaponChest'), spriteName: 'sprWeaponChest', visible: true, solid: false, depth: -1, persistent: false, parentId: -1, textureMaskId: -1 },
    AmmoChest: { id: 4, name: 'AmmoChest', spriteId: spriteIdOf('sprAmmoChest'), spriteName: 'sprAmmoChest', visible: true, solid: false, depth: -1, persistent: false, parentId: -1, textureMaskId: -1 },
    RadChest: { id: 5, name: 'RadChest', spriteId: spriteIdOf('sprRadChest'), spriteName: 'sprRadChest', visible: true, solid: true, depth: -1, persistent: false, parentId: -1, textureMaskId: -1 },
    BigBandit: { id: 6, name: 'BigBandit', spriteId: spriteIdOf('sprBanditBossIdle'), spriteName: 'sprBanditBossIdle', visible: true, solid: false, depth: -3, persistent: false, parentId: -1, textureMaskId: -1 },
    BigDog: { id: 7, name: 'BigDog', spriteId: spriteIdOf('sprScrapBossIdle'), spriteName: 'sprScrapBossIdle', visible: true, solid: false, depth: -3, persistent: false, parentId: -1, textureMaskId: -1 },
    LilHunter: { id: 8, name: 'LilHunter', spriteId: spriteIdOf('sprLilHunter'), spriteName: 'sprLilHunter', visible: true, solid: false, depth: -3, persistent: false, parentId: -1, textureMaskId: -1 },
    Nothing: { id: 9, name: 'Nothing', spriteId: spriteIdOf('sprNothingOn'), spriteName: 'sprNothingOn', visible: true, solid: true, depth: -3, persistent: false, parentId: -1, textureMaskId: -1 },
    Nothing2: { id: 10, name: 'Nothing2', spriteId: spriteIdOf('sprNothing2Idle'), spriteName: 'sprNothing2Idle', visible: true, solid: false, depth: -3, persistent: false, parentId: -1, textureMaskId: -1 },
    BigGenerator: { id: 11, name: 'BigGenerator', spriteId: spriteIdOf('sprBigGenerator'), spriteName: 'sprBigGenerator', visible: true, solid: true, depth: -2, persistent: false, parentId: -1, textureMaskId: -1 },
  };

  // 6. Register every allocated 2048x2048 texture page (0, 1, 2, ...)
  const pageCount = b.getPageCount();
  const textures: TexturePageDef[] = [];
  for (let id = 0; id < pageCount; id++) {
    textures.push({
      id,
      groupName: 'fallback',
      file: id === 0 ? 'fallback_atlas.png' : `fallback_atlas_${id}.png`,
      width: ATLAS_PAGE_WIDTH,
      height: ATLAS_PAGE_HEIGHT,
      embedded: true,
    });
  }

  const manifest: AssetManifest = {
    version: 1,
    generatedAt: FALLBACK_GENERATED_AT,
    sourceMode: 'fallback',
    textures,
    sprites: b.sprites,
    spritesById: b.spritesById,
    sounds,
    soundsById,
    music,
    ambience,
    looseSounds,
    fonts,
    objects,
    shaders: [],
    lang: {
      Game: {
        Title: 'KRUNKED THRONE',
        Subtitle: 'CLEAN-ROOM 16-BIT WASTELAND EDITION',
      },
      Weapons: {
        '1:Name': 'REVOLVER',
        '2:Name': 'TRIPLE MACHINEGUN',
        '3:Name': 'WRENCH',
        '4:Name': 'MACHINEGUN',
        '5:Name': 'SHOTGUN',
        '6:Name': 'CROSSBOW',
        '7:Name': 'GRENADE LAUNCHER',
        '8:Name': 'DOUBLE SHOTGUN',
        '9:Name': 'MINIGUN',
        '10:Name': 'AUTO SHOTGUN',
      },
      Skills: {
        '1:Name': 'RHINO SKIN',
        '2:Name': 'EXTRA FEET',
        '3:Name': 'PLUTONIUM HUNGER',
        '4:Name': 'RABBIT PAW',
        '5:Name': 'THRONE BUTT',
      },
    },
    stats: {
      spriteCount: b.spritesById.length,
      tpagCount: b.tpagCount,
      objectCount: Object.keys(objects).length,
      soundCount: soundsById.length,
      audoCount: 0,
      fontCount: Object.keys(fonts).length,
      looseOggCount: 0,
    },
  };

  return { manifest, drawOps: b.drawOps, pageCount };
}

function createCanvasSurface(w: number, h: number): { canvas: TextureImageSource; ctx: DrawCtx } | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    const ctx = el.getContext('2d');
    if (ctx) return { canvas: el, ctx };
  } else if (typeof OffscreenCanvas !== 'undefined') {
    const el = new OffscreenCanvas(w, h);
    const ctx = el.getContext('2d');
    if (ctx) return { canvas: el, ctx };
  }
  return null;
}

function renderFallbackPages(
  drawOps: readonly PlacedDrawOp[],
  pageCount: number,
): Map<number, TextureImageSource> {
  const textures = new Map<number, TextureImageSource>();
  const ctxByPage = new Map<number, DrawCtx>();

  for (let page = 0; page < pageCount; page++) {
    const surface = createCanvasSurface(ATLAS_PAGE_WIDTH, ATLAS_PAGE_HEIGHT);
    if (!surface) {
      // Headless Node environment without DOM/OffscreenCanvas: return empty texture map cleanly
      return textures;
    }
    surface.ctx.imageSmoothingEnabled = false;
    surface.ctx.clearRect(0, 0, ATLAS_PAGE_WIDTH, ATLAS_PAGE_HEIGHT);
    textures.set(page, surface.canvas);
    ctxByPage.set(page, surface.ctx);
  }

  for (let i = 0; i < drawOps.length; i++) {
    const op = drawOps[i]!;
    const ctx = ctxByPage.get(op.page);
    if (ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(op.x, op.y, op.w, op.h);
      ctx.clip();
      op.draw(ctx, op.x, op.y, op.w, op.h, op.frame);
      ctx.restore();
    }
  }

  return textures;
}

/**
 * Creates a deterministic clean-room procedural AssetManifest (`sourceMode: 'fallback'`).
 * Safe in both browser and headless Node environments.
 */
export function createFallbackManifest(): AssetManifest {
  return buildFallbackData().manifest;
}

/**
 * Creates a full clean-room AssetBundle backed by procedurally rendered 2048x2048
 * pixel-art atlas canvas page(s) in browser environments (or DOM-free in Node).
 */
export function createFallbackBundle(): AssetBundle {
  const { manifest, drawOps, pageCount } = buildFallbackData();
  const textures = renderFallbackPages(drawOps, pageCount);
  return {
    manifest,
    textures,
    baseUrl: '',
    sourceMode: 'fallback',
    getSprite: (name: string) => manifest.sprites[name],
    getTexture: (textureId: number) => textures.get(textureId),
    getFont: (name: string) => manifest.fonts[name],
    getSound: (name: string) => manifest.sounds[name],
    getAudioUrl: () => '',
  };
}
