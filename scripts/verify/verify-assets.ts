import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AssetManifest, OracleData, TexturePageDef } from '@/contracts';
import { createFallbackManifest, loadManifestNode } from '@/assets';
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
} from '@/data';

interface GateReport {
  mode: 'steam' | 'fallback';
  assetsDir: string | null;
  trackedFilesCount: number;
  gitViolations: string[];
  registryCounts: {
    weapons: number;
    mutants: number;
    mutations: number;
    ultras: number;
    crowns: number;
    areas: number;
    enemies: number;
  };
  checkedSprites: number;
  checkedSounds: number;
  checkedMusic: number;
  checkedAmbience: number;
  checkedFonts: number;
  checkedDiskFiles: number;
  oracleSummary?: {
    oracleObjectCount: number;
    oracleScriptCount: number;
    manifestObjectCount: number;
    overlapCount: number;
    coveragePct: string;
    coreMatched: string[];
    coreMissing: string[];
  };
  errors: string[];
}

const FORBIDDEN_EXTENSIONS = /\.(win|exe|dll|ogg|wav|mp3|yytex)$/i;
const CORE_FONTS = ['fntChat', 'fntL', 'fntM0', 'fntM1', 'fntM1x', 'fntSmall'] as const;

const CORE_ORACLE_OBJECTS: ReadonlyArray<{ label: string; aliases: readonly string[] }> = [
  { label: 'Player', aliases: ['Player'] },
  { label: 'Bandit', aliases: ['Bandit'] },
  { label: 'BigBandit', aliases: ['BanditBoss', 'BigBandit'] },
  { label: 'BigDog', aliases: ['ScrapBoss', 'BigDog'] },
  { label: 'LilHunter', aliases: ['LilHunter'] },
  { label: 'Throne', aliases: ['Nothing', 'Throne'] },
  { label: 'Throne2', aliases: ['Nothing2', 'Throne2'] },
  { label: 'Generator', aliases: ['Generator', 'BigGenerator'] },
  { label: 'WeaponChest', aliases: ['WeaponChest'] },
  { label: 'AmmoChest', aliases: ['AmmoChest'] },
  { label: 'RadChest', aliases: ['RadChest'] },
  { label: 'Portal', aliases: ['Portal'] },
];

function checkGitTrackedFiles(errors: string[]): { trackedFilesCount: number; violations: string[] } {
  let stdout = '';
  try {
    stdout = execFileSync('git', ['ls-files'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    errors.push(`git ls-files failed: ${err instanceof Error ? err.message : String(err)}`);
    return { trackedFilesCount: 0, violations: [] };
  }

  const files = stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter((line) => line.length > 0);

  const violations: string[] = [];
  for (const file of files) {
    if (
      file === '.nt-assets' ||
      file.startsWith('.nt-assets/') ||
      file.includes('/.nt-assets/') ||
      FORBIDDEN_EXTENSIONS.test(file)
    ) {
      violations.push(file);
    }
  }

  if (violations.length > 0) {
    errors.push(
      `LEGAL BOUNDARY VIOLATION: ${violations.length} copyrighted/extracted file(s) tracked in git: ${violations.slice(0, 10).join(', ')}`,
    );
  }

  return { trackedFilesCount: files.length, violations };
}

async function resolveManifestAndAssetsDir(
  forceFallback: boolean,
): Promise<{ manifest: AssetManifest; assetsDir: string | null }> {
  if (forceFallback) {
    return { manifest: createFallbackManifest(), assetsDir: null };
  }

  const localRoot = process.cwd();
  const localAssetsDir = path.join(localRoot, '.nt-assets');
  if (fs.existsSync(path.join(localAssetsDir, 'manifest.json'))) {
    const manifest = await loadManifestNode(localRoot);
    return {
      manifest,
      assetsDir: manifest.sourceMode === 'steam' ? localAssetsDir : null,
    };
  }

  const manifest = await loadManifestNode(localRoot);
  return {
    manifest,
    assetsDir: manifest.sourceMode === 'steam' ? localAssetsDir : null,
  };
}

function verifyDataRegistryIntegrity(errors: string[]): GateReport['registryCounts'] {
  const counts = {
    weapons: WEAPON_IDS.length,
    mutants: MUTANT_IDS.length,
    mutations: MUTATION_IDS.length,
    ultras: Object.keys(ULTRAS).length,
    crowns: CROWN_IDS.length,
    areas: AREA_CODES.length,
    enemies: Object.keys(ENEMIES).length,
  };

  if (counts.weapons !== 142 || Object.keys(WEAPONS).length !== 142) {
    errors.push(`Expected 142 WEAPONS, got WEAPON_IDS=${counts.weapons}, Object.keys=${Object.keys(WEAPONS).length}`);
  }
  if (counts.mutants !== 12) {
    errors.push(`Expected 12 MUTANTS, got ${counts.mutants}`);
  }
  if (counts.mutations !== 29) {
    errors.push(`Expected 29 MUTATIONS, got ${counts.mutations}`);
  }
  if (counts.ultras !== 24) {
    errors.push(`Expected 24 ULTRAS, got ${counts.ultras}`);
  }
  if (counts.crowns !== 13) {
    errors.push(`Expected 13 CROWNS, got ${counts.crowns}`);
  }
  if (counts.areas !== 23) {
    errors.push(`Expected 23 AREAS, got ${counts.areas}`);
  }
  if (counts.enemies !== 50) {
    errors.push(`Expected 50 ENEMIES, got ${counts.enemies}`);
  }

  for (const mutant of Object.values(MUTANTS)) {
    if (!WEAPONS[mutant.startingWeapon]) {
      errors.push(`Mutant ${mutant.id} references unknown startingWeapon "${mutant.startingWeapon}"`);
    }
    if (mutant.secondaryWeapon && !WEAPONS[mutant.secondaryWeapon]) {
      errors.push(`Mutant ${mutant.id} references unknown secondaryWeapon "${mutant.secondaryWeapon}"`);
    }
  }

  for (const area of Object.values(AREAS)) {
    if (!AREAS[area.nextArea]) {
      errors.push(`Area ${area.code} references unknown nextArea "${area.nextArea}"`);
    }
    if (area.bossId && !ENEMIES[area.bossId]) {
      errors.push(`Area ${area.code} references unknown bossId "${area.bossId}"`);
    }
  }

  return counts;
}

function collectDataAssetReferences(): {
  sprites: Array<{ ctx: string; key: string; minFrameIndex?: number }>;
  sounds: Array<{ ctx: string; key: string }>;
  music: Array<{ ctx: string; key: string }>;
  ambience: Array<{ ctx: string; key: string }>;
} {
  const sprites: Array<{ ctx: string; key: string; minFrameIndex?: number }> = [];
  const sounds: Array<{ ctx: string; key: string }> = [];
  const music: Array<{ ctx: string; key: string }> = [];
  const ambience: Array<{ ctx: string; key: string }> = [];

  for (const w of Object.values(WEAPONS)) {
    sprites.push({ ctx: `weapon.${w.id}.sprite`, key: w.sprite });
    if (w.projectileSprite) {
      sprites.push({ ctx: `weapon.${w.id}.projectileSprite`, key: w.projectileSprite });
    }
    sounds.push({ ctx: `weapon.${w.id}.fireSound`, key: w.fireSound });
  }

  for (const m of Object.values(MUTANTS)) {
    for (const [field, val] of Object.entries(m.sprites)) {
      if (val) sprites.push({ ctx: `mutant.${m.id}.sprites.${field}`, key: val });
    }
    for (const [field, val] of Object.entries(m.sounds)) {
      if (val) sounds.push({ ctx: `mutant.${m.id}.sounds.${field}`, key: val });
    }
  }

  for (const mut of Object.values(MUTATIONS)) {
    sprites.push({ ctx: `mutation.${mut.id}.sprite`, key: mut.sprite, minFrameIndex: mut.iconFrame });
    sprites.push({ ctx: `mutation.${mut.id}.hudSprite`, key: mut.hudSprite, minFrameIndex: mut.iconFrame });
  }

  for (const u of Object.values(ULTRAS)) {
    sprites.push({ ctx: `ultra.${u.id}.sprite`, key: u.sprite, minFrameIndex: u.iconIndex });
  }

  for (const c of Object.values(CROWNS)) {
    sprites.push({ ctx: `crown.${c.id}.spriteIdle`, key: c.spriteIdle });
    sprites.push({ ctx: `crown.${c.id}.spriteWalk`, key: c.spriteWalk });
  }

  for (const a of Object.values(AREAS)) {
    sprites.push({ ctx: `area.${a.code}.floorSprite`, key: a.floorSprite });
    sprites.push({ ctx: `area.${a.code}.floorExploSprite`, key: a.floorExploSprite });
    sprites.push({ ctx: `area.${a.code}.wallTopSprite`, key: a.wallTopSprite });
    sprites.push({ ctx: `area.${a.code}.wallBotSprite`, key: a.wallBotSprite });
    sprites.push({ ctx: `area.${a.code}.wallOutSprite`, key: a.wallOutSprite });
    if (a.wallTransSprite) {
      sprites.push({ ctx: `area.${a.code}.wallTransSprite`, key: a.wallTransSprite });
    }
    music.push({ ctx: `area.${a.code}.musicTrack`, key: a.musicTrack });
    if (a.musicTrackB) {
      music.push({ ctx: `area.${a.code}.musicTrackB`, key: a.musicTrackB });
    }
    if (a.bossMusicTrack) {
      music.push({ ctx: `area.${a.code}.bossMusicTrack`, key: a.bossMusicTrack });
    }
    ambience.push({ ctx: `area.${a.code}.ambienceTrack`, key: a.ambienceTrack });
  }

  for (const e of Object.values(ENEMIES)) {
    for (const [field, val] of Object.entries(e.sprites)) {
      if (val) sprites.push({ ctx: `enemy.${e.id}.sprites.${field}`, key: val });
    }
    for (const [field, val] of Object.entries(e.sounds)) {
      if (val) sounds.push({ ctx: `enemy.${e.id}.sounds.${field}`, key: val });
    }
  }

  return { sprites, sounds, music, ambience };
}

function checkTpagInTextureBounds(
  tpag: { srcX: number; srcY: number; srcW: number; srcH: number; textureId: number },
  texById: Map<number, TexturePageDef>,
  ctx: string,
  errors: string[],
): TexturePageDef | null {
  const tex = texById.get(tpag.textureId);
  if (!tex) {
    errors.push(`${ctx}: TPAG references missing textureId ${tpag.textureId}`);
    return null;
  }
  if (
    tpag.srcW <= 0 ||
    tpag.srcH <= 0 ||
    tpag.srcX < 0 ||
    tpag.srcY < 0 ||
    tpag.srcX + tpag.srcW > tex.width ||
    tpag.srcY + tpag.srcH > tex.height
  ) {
    errors.push(
      `${ctx}: TPAG rect (${tpag.srcX},${tpag.srcY},${tpag.srcW}x${tpag.srcH}) out of texture #${tex.id} bounds (${tex.width}x${tex.height})`,
    );
  }
  return tex;
}

function verifyDiskFile(
  assetsDir: string,
  relPath: string,
  ctx: string,
  checkedDiskCache: Map<string, boolean>,
  errors: string[],
): void {
  const normalized = relPath.replace(/^\/+/, '');
  if (!normalized) {
    errors.push(`${ctx}: empty asset path`);
    return;
  }
  const fullPath = path.resolve(assetsDir, normalized);
  const cached = checkedDiskCache.get(fullPath);
  if (cached !== undefined) {
    if (!cached) {
      errors.push(`${ctx}: backing file missing or empty on disk: ${fullPath}`);
    }
    return;
  }
  try {
    const stat = fs.statSync(fullPath);
    const ok = stat.isFile() && stat.size > 0;
    checkedDiskCache.set(fullPath, ok);
    if (!ok) {
      errors.push(`${ctx}: backing file is not a non-empty file: ${fullPath}`);
    }
  } catch {
    checkedDiskCache.set(fullPath, false);
    errors.push(`${ctx}: backing file missing on disk: ${fullPath}`);
  }
}

function verifySteamMode(
  manifest: AssetManifest,
  assetsDir: string | null,
  report: GateReport,
): void {
  const errors = report.errors;
  if (!assetsDir || !fs.existsSync(assetsDir)) {
    errors.push(`Steam manifest loaded but assets directory not found on disk: ${String(assetsDir)}`);
    return;
  }

  const checkedDiskCache = new Map<string, boolean>();
  const texById = new Map<number, TexturePageDef>();

  for (const tex of manifest.textures) {
    texById.set(tex.id, tex);
    if (tex.width <= 0 || tex.height <= 0) {
      errors.push(`Texture page #${tex.id} (${tex.groupName}) has invalid dimensions ${tex.width}x${tex.height}`);
    }
    if (!tex.embedded) {
      verifyDiskFile(assetsDir, tex.file, `texture#${tex.id}(${tex.groupName})`, checkedDiskCache, errors);
    }
  }

  const refs = collectDataAssetReferences();
  const uniqueSprites = new Set<string>();
  const uniqueSounds = new Set<string>();
  const uniqueMusic = new Set<string>();
  const uniqueAmbience = new Set<string>();

  // 1. Verify every referenced sprite + TPAG bounds + backing texture PNG
  for (const ref of refs.sprites) {
    uniqueSprites.add(ref.key);
    const spr = manifest.sprites[ref.key];
    if (!spr) {
      errors.push(`Missing sprite "${ref.key}" referenced by ${ref.ctx}`);
      continue;
    }
    if (spr.frames.length === 0) {
      errors.push(`Sprite "${ref.key}" (${ref.ctx}) has 0 frames`);
      continue;
    }
    if (ref.minFrameIndex !== undefined && ref.minFrameIndex >= spr.frames.length) {
      errors.push(
        `Sprite "${ref.key}" (${ref.ctx}) has ${spr.frames.length} frames, but requires index ${ref.minFrameIndex}`,
      );
    }
    for (let f = 0; f < spr.frames.length; f++) {
      const frame = spr.frames[f]!;
      const tex = checkTpagInTextureBounds(frame, texById, `${ref.ctx}:${ref.key}[${f}]`, errors);
      if (tex && !tex.embedded) {
        verifyDiskFile(assetsDir, tex.file, `${ref.ctx}:${ref.key}[${f}]`, checkedDiskCache, errors);
      }
    }
  }

  // 2. Verify every referenced sound + backing audio file on disk
  for (const ref of refs.sounds) {
    uniqueSounds.add(ref.key);
    const snd = manifest.sounds[ref.key];
    if (!snd) {
      errors.push(`Missing sound "${ref.key}" referenced by ${ref.ctx}`);
      continue;
    }
    verifyDiskFile(assetsDir, snd.path, `${ref.ctx}:${ref.key}`, checkedDiskCache, errors);
  }

  // 3. Verify every referenced music track + backing OGG on disk
  for (const ref of refs.music) {
    uniqueMusic.add(ref.key);
    const relPath = manifest.music[ref.key];
    if (!relPath) {
      errors.push(`Missing music key "${ref.key}" referenced by ${ref.ctx}`);
      continue;
    }
    verifyDiskFile(assetsDir, relPath, `${ref.ctx}:${ref.key}`, checkedDiskCache, errors);
  }

  // 4. Verify every referenced ambience track + backing OGG on disk
  for (const ref of refs.ambience) {
    uniqueAmbience.add(ref.key);
    const relPath = manifest.ambience[ref.key];
    if (!relPath) {
      errors.push(`Missing ambience key "${ref.key}" referenced by ${ref.ctx}`);
      continue;
    }
    verifyDiskFile(assetsDir, relPath, `${ref.ctx}:${ref.key}`, checkedDiskCache, errors);
  }

  // 5. Verify all 6 bitmap fonts & their texture bounds
  let validFonts = 0;
  for (const fontName of CORE_FONTS) {
    const font = manifest.fonts[fontName];
    if (!font) {
      errors.push(`Missing required Steam font "${fontName}"`);
      continue;
    }
    const glyphCount = Object.keys(font.glyphs).length;
    if (glyphCount === 0) {
      errors.push(`Font "${fontName}" has 0 glyphs`);
      continue;
    }
    const tex = checkTpagInTextureBounds(font.tpag, texById, `font.${fontName}`, errors);
    if (tex && !tex.embedded) {
      verifyDiskFile(assetsDir, tex.file, `font.${fontName}`, checkedDiskCache, errors);
    }
    validFonts += 1;
  }

  // 6. Load & cross-check oracle.json
  const oraclePath = path.join(assetsDir, 'oracle.json');
  if (!fs.existsSync(oraclePath)) {
    errors.push(`Missing oracle.json at ${oraclePath}`);
  } else {
    try {
      const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8')) as OracleData;
      if (!oracle || typeof oracle !== 'object' || !oracle.objects || !Array.isArray(oracle.scripts)) {
        errors.push(`Invalid oracle.json structure at ${oraclePath}`);
      } else {
        const coreMatched: string[] = [];
        const coreMissing: string[] = [];
        for (const core of CORE_ORACLE_OBJECTS) {
          const hit = core.aliases.find((alias) => Boolean(oracle.objects[alias]));
          if (hit) {
            coreMatched.push(`${core.label}(${hit})`);
          } else {
            coreMissing.push(`${core.label}[${core.aliases.join('|')}]`);
            errors.push(`Oracle missing core object ${core.label} (checked: ${core.aliases.join(', ')})`);
          }
        }

        const manifestObjNames = Object.keys(manifest.objects);
        let overlapCount = 0;
        for (const objName of manifestObjNames) {
          if (oracle.objects[objName]) {
            overlapCount += 1;
          }
        }
        const coveragePct =
          manifestObjNames.length > 0
            ? ((overlapCount / manifestObjNames.length) * 100).toFixed(1)
            : '0.0';

        report.oracleSummary = {
          oracleObjectCount: oracle.objectCount,
          oracleScriptCount: oracle.scripts.length,
          manifestObjectCount: manifestObjNames.length,
          overlapCount,
          coveragePct,
          coreMatched,
          coreMissing,
        };
      }
    } catch (err) {
      errors.push(`Failed parsing oracle.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  report.checkedSprites = uniqueSprites.size;
  report.checkedSounds = uniqueSounds.size;
  report.checkedMusic = uniqueMusic.size;
  report.checkedAmbience = uniqueAmbience.size;
  report.checkedFonts = validFonts;
  report.checkedDiskFiles = checkedDiskCache.size;
}

function verifyFallbackMode(manifest: AssetManifest, report: GateReport): void {
  const errors = report.errors;

  if (manifest.version !== 1) {
    errors.push(`Fallback manifest unexpected version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.textures) || manifest.textures.length === 0) {
    errors.push('Fallback manifest missing textures');
    return;
  }

  const texById = new Map<number, TexturePageDef>();
  for (const tex of manifest.textures) {
    texById.set(tex.id, tex);
    if (tex.width <= 0 || tex.height <= 0) {
      errors.push(`Fallback texture #${tex.id} has invalid dimensions ${tex.width}x${tex.height}`);
    }
  }

  // Validate every sprite & TPAG rect fits within texture bounds
  const spriteNames = Object.keys(manifest.sprites);
  if (manifest.spritesById.length !== spriteNames.length) {
    errors.push(
      `Fallback spritesById length (${manifest.spritesById.length}) !== sprites count (${spriteNames.length})`,
    );
  }
  for (const name of manifest.spritesById) {
    if (!manifest.sprites[name]) {
      errors.push(`Fallback spritesById references missing sprite "${name}"`);
    }
  }
  for (const [name, spr] of Object.entries(manifest.sprites)) {
    if (spr.frames.length === 0) {
      errors.push(`Fallback sprite "${name}" has 0 frames`);
      continue;
    }
    for (let f = 0; f < spr.frames.length; f++) {
      checkTpagInTextureBounds(spr.frames[f]!, texById, `fallback.sprite.${name}[${f}]`, errors);
    }
  }

  // Validate sounds & music/ambience registries
  if (manifest.soundsById.length !== Object.keys(manifest.sounds).length) {
    errors.push(
      `Fallback soundsById length (${manifest.soundsById.length}) !== sounds count (${Object.keys(manifest.sounds).length})`,
    );
  }
  for (const name of manifest.soundsById) {
    if (!manifest.sounds[name]) {
      errors.push(`Fallback soundsById references missing sound "${name}"`);
    }
  }

  // Validate all 6 fonts & ASCII 32..126 glyphs
  let validFonts = 0;
  for (const fontName of CORE_FONTS) {
    const font = manifest.fonts[fontName];
    if (!font) {
      errors.push(`Fallback manifest missing required font "${fontName}"`);
      continue;
    }
    checkTpagInTextureBounds(font.tpag, texById, `fallback.font.${fontName}`, errors);
    for (let code = 32; code <= 126; code++) {
      const glyph = font.glyphs[code];
      if (!glyph) {
        errors.push(`Fallback font "${fontName}" missing ASCII glyph ${code}`);
        break;
      }
      if (glyph.shift <= 0 || glyph.w <= 0 || glyph.h <= 0) {
        errors.push(`Fallback font "${fontName}" glyph ${code} has invalid metrics`);
        break;
      }
    }
    validFonts += 1;
  }

  // Validate object sprite references
  for (const [objName, obj] of Object.entries(manifest.objects)) {
    if (obj.spriteName && !manifest.sprites[obj.spriteName]) {
      errors.push(`Fallback object "${objName}" references missing sprite "${obj.spriteName}"`);
    }
  }

  // Validate stats consistency
  if (manifest.stats.spriteCount !== spriteNames.length) {
    errors.push(`Fallback stats.spriteCount (${manifest.stats.spriteCount}) !== actual (${spriteNames.length})`);
  }
  if (manifest.stats.soundCount !== manifest.soundsById.length) {
    errors.push(`Fallback stats.soundCount (${manifest.stats.soundCount}) !== actual (${manifest.soundsById.length})`);
  }
  if (manifest.stats.fontCount !== Object.keys(manifest.fonts).length) {
    errors.push(`Fallback stats.fontCount (${manifest.stats.fontCount}) !== actual (${Object.keys(manifest.fonts).length})`);
  }

  // Verify core fallback assets exist for gameplay rendering
  for (let i = 1; i <= 12; i++) {
    for (const suffix of ['Idle', 'Walk', 'Hurt', 'Dead']) {
      const key = `sprMutant${i}${suffix}`;
      if (!manifest.sprites[key]) {
        errors.push(`Fallback missing core mutant sprite "${key}"`);
      }
    }
  }
  for (const coreKey of ['sprPortal', 'sprCrosshair', 'sprSkillIcon', 'sprSkillIconHUD', 'sprRevolver', 'sprBullet1']) {
    if (!manifest.sprites[coreKey]) {
      errors.push(`Fallback missing core sprite "${coreKey}"`);
    }
  }

  report.checkedSprites = spriteNames.length;
  report.checkedSounds = manifest.soundsById.length;
  report.checkedMusic = Object.keys(manifest.music).length;
  report.checkedAmbience = Object.keys(manifest.ambience).length;
  report.checkedFonts = validFonts;
  report.checkedDiskFiles = 0;
}

async function main(): Promise<void> {
  const forceFallback =
    process.argv.includes('--fallback') || process.env.NT_FORCE_FALLBACK === '1';

  const errors: string[] = [];
  const gitCheck = checkGitTrackedFiles(errors);
  const registryCounts = verifyDataRegistryIntegrity(errors);
  const { manifest, assetsDir } = await resolveManifestAndAssetsDir(forceFallback);

  const report: GateReport = {
    mode: manifest.sourceMode,
    assetsDir,
    trackedFilesCount: gitCheck.trackedFilesCount,
    gitViolations: gitCheck.violations,
    registryCounts,
    checkedSprites: 0,
    checkedSounds: 0,
    checkedMusic: 0,
    checkedAmbience: 0,
    checkedFonts: 0,
    checkedDiskFiles: 0,
    errors,
  };

  if (manifest.sourceMode === 'steam') {
    verifySteamMode(manifest, assetsDir, report);
  } else {
    verifyFallbackMode(manifest, report);
  }

  console.log('========================================================================');
  console.log(`GATE A — ASSET & LEGAL BOUNDARY VERIFICATION (${report.mode.toUpperCase()} MODE)`);
  console.log('========================================================================');
  console.log(
    `[Legal]      git ls-files scanned: ${report.trackedFilesCount} files | copyrighted violations: ${report.gitViolations.length}`,
  );
  console.log(
    `[Registries] WEAPONS=${registryCounts.weapons}, MUTANTS=${registryCounts.mutants}, MUTATIONS=${registryCounts.mutations}, ULTRAS=${registryCounts.ultras}, CROWNS=${registryCounts.crowns}, AREAS=${registryCounts.areas}, ENEMIES=${registryCounts.enemies}`,
  );
  if (report.mode === 'steam') {
    console.log(`[AssetsDir]  ${report.assetsDir}`);
    console.log(
      `[Manifest]   sprites=${manifest.stats.spriteCount}, tpags=${manifest.stats.tpagCount}, objects=${manifest.stats.objectCount}, sounds=${manifest.stats.soundCount}, audos=${manifest.stats.audoCount}, fonts=${manifest.stats.fontCount}, looseOggs=${manifest.stats.looseOggCount}`,
    );
    console.log(
      `[Resolved]   unique sprites=${report.checkedSprites}, sounds=${report.checkedSounds}, music=${report.checkedMusic}, ambience=${report.checkedAmbience}, fonts=${report.checkedFonts}, disk files verified=${report.checkedDiskFiles}`,
    );
    if (report.oracleSummary) {
      const o = report.oracleSummary;
      console.log(
        `[Oracle]     objects=${o.oracleObjectCount}, scripts=${o.oracleScriptCount} | manifest overlap=${o.overlapCount}/${o.manifestObjectCount} (${o.coveragePct}%) | core=${o.coreMatched.length}/${CORE_ORACLE_OBJECTS.length} [${o.coreMatched.join(', ')}]`,
      );
    }
  } else {
    console.log(
      `[Fallback]   textures=${manifest.textures.length}, sprites=${report.checkedSprites}, sounds=${report.checkedSounds}, music=${report.checkedMusic}, ambience=${report.checkedAmbience}, fonts=${report.checkedFonts}`,
    );
  }

  if (report.errors.length > 0) {
    console.error(`\n[GATE A FAILED] ${report.errors.length} error(s):`);
    for (const err of report.errors.slice(0, 40)) {
      console.error(`  - ${err}`);
    }
    if (report.errors.length > 40) {
      console.error(`  ... and ${report.errors.length - 40} more`);
    }
    process.exit(1);
  }

  console.log('[GATE A PASS] All legal boundary, registry, asset, and oracle assertions passed.');
}

main().catch((err) => {
  console.error('[GATE A CRASH]', err);
  process.exit(1);
});
