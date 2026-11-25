import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AssetManifest,
  FontDef,
  FontGlyph,
  ObjectDef,
  SoundDef,
  SoundSourceType,
  SpriteDef,
  TexturePageDef,
  TpagRect,
} from '@/contracts';
import { DEFAULT_STEAM_DIR, dumpOracle } from './oracle-dump';

interface ChunkSlice {
  name: string;
  start: number;
  size: number;
}

interface TginGroup {
  name: string;
  dir: string;
  ext: string;
  loadType: number;
  texPageIds: number[];
}

interface AudoMeta {
  id: number;
  ext: string;
  sourceType: SoundSourceType;
  relPath: string;
  byteLength: number;
}

export interface ExtractOptions {
  steamDir?: string;
  outDir?: string;
  allowMissing?: boolean;
  quiet?: boolean;
}

export interface ExtractSummary {
  manifest: AssetManifest;
  brokenTpagRefs: number;
  unresolvedExternalSounds: number;
  copiedTextures: number;
  audoWavCount: number;
  audoOggCount: number;
  looseCounts: { mus: number; snd: number; amb: number };
  oracleObjectCount: number;
  oracleScriptCount: number;
}

function parseFormChunks(buf: Buffer): Map<string, ChunkSlice> {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'FORM') {
    throw new Error('Invalid data.win: missing FORM IFF header');
  }
  const declaredLen = buf.readUInt32LE(4);
  const endLimit = Math.min(buf.length, 8 + declaredLen);
  const chunks = new Map<string, ChunkSlice>();

  let offset = 8;
  while (offset + 8 <= endLimit) {
    const name = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buf.length) {
      throw new Error(`Chunk ${name} at offset ${offset} exceeds buffer bounds (${start + size} > ${buf.length})`);
    }
    chunks.set(name, { name, start, size });
    offset = start + size;
  }

  return chunks;
}

function requireChunk(chunks: Map<string, ChunkSlice>, name: string): ChunkSlice {
  const chunk = chunks.get(name);
  if (!chunk) {
    throw new Error(`Required chunk "${name}" not found in data.win`);
  }
  return chunk;
}

/**
 * Reads a null-terminated UTF-8 string pointed to inside STRG.
 * Stopping at the first 0x00 byte handles Vlambeer's NUL-patched external paths
 * (e.g. "amb/0\0gg" -> "amb/0").
 */
function readCString(buf: Buffer, ptr: number): string {
  if (ptr <= 0 || ptr >= buf.length) return '';
  let maxEnd = buf.length;
  if (ptr >= 4) {
    const strgLen = buf.readUInt32LE(ptr - 4);
    if (strgLen > 0 && strgLen < 0x100000 && ptr + strgLen <= buf.length) {
      maxEnd = ptr + strgLen;
    }
  }
  const nulIdx = buf.indexOf(0, ptr);
  const end = nulIdx >= 0 && nulIdx < maxEnd ? nulIdx : maxEnd;
  return buf.toString('utf8', ptr, end);
}

function parseTgin(buf: Buffer, chunk: ChunkSlice): TginGroup[] {
  const version = buf.readUInt32LE(chunk.start);
  const count = buf.readUInt32LE(chunk.start + 4);
  if (version !== 1) {
    throw new Error(`Unexpected TGIN version ${version} (expected 1)`);
  }

  const groups: TginGroup[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = buf.readUInt32LE(chunk.start + 8 + i * 4);
    const name = readCString(buf, buf.readUInt32LE(ptr));
    const dir = readCString(buf, buf.readUInt32LE(ptr + 4));
    const ext = readCString(buf, buf.readUInt32LE(ptr + 8));
    const loadType = buf.readUInt32LE(ptr + 12);
    const texListPtr = buf.readUInt32LE(ptr + 16);
    const texCount = buf.readUInt32LE(texListPtr);
    const texPageIds: number[] = [];
    for (let k = 0; k < texCount; k++) {
      texPageIds.push(buf.readUInt32LE(texListPtr + 4 + k * 4));
    }
    groups.push({ name, dir, ext, loadType, texPageIds });
  }
  return groups;
}

function parseTxtrAndCopyPngs(
  buf: Buffer,
  chunk: ChunkSlice,
  groups: TginGroup[],
  steamDir: string,
  outDir: string,
): { textures: TexturePageDef[]; copiedTextures: number } {
  const groupByPageId = new Map<number, { group: TginGroup; indexInGroup: number }>();
  for (const group of groups) {
    for (let idx = 0; idx < group.texPageIds.length; idx++) {
      const pageId = group.texPageIds[idx];
      if (pageId !== undefined) {
        groupByPageId.set(pageId, { group, indexInGroup: idx });
      }
    }
  }

  const count = buf.readUInt32LE(chunk.start);
  const textures: TexturePageDef[] = [];
  let copiedTextures = 0;

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const width = buf.readUInt32LE(ptr + 12);
    const height = buf.readUInt32LE(ptr + 16);
    const rawIndexInGroup = buf.readUInt32LE(ptr + 20);
    const blobPtr = buf.readUInt32LE(ptr + 24);

    const groupInfo = groupByPageId.get(id);
    const groupName = groupInfo?.group.name ?? `page_${id}`;
    const embedded = blobPtr !== 0 || (groupInfo?.group.loadType ?? 0) === 0;

    let file = '';
    if (!embedded && groupInfo) {
      const dirPart = groupInfo.group.dir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const extPart = groupInfo.group.ext || '.png';
      const idx = rawIndexInGroup || groupInfo.indexInGroup;
      const filename = `${groupInfo.group.name}_${idx}${extPart}`;
      file = dirPart ? `${dirPart}/${filename}` : filename;

      const srcPath = path.join(steamDir, ...file.split('/'));
      const dstPath = path.join(outDir, ...file.split('/'));
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Missing external texture page: ${srcPath}`);
      }
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
      copiedTextures++;
    }

    textures.push({
      id,
      groupName,
      file,
      width,
      height,
      embedded,
    });
  }

  return { textures, copiedTextures };
}

function parseTpag(buf: Buffer, chunk: ChunkSlice): Map<number, TpagRect> {
  const count = buf.readUInt32LE(chunk.start);
  const map = new Map<number, TpagRect>();
  for (let i = 0; i < count; i++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + i * 4);
    map.set(ptr, {
      srcX: buf.readUInt16LE(ptr + 0),
      srcY: buf.readUInt16LE(ptr + 2),
      srcW: buf.readUInt16LE(ptr + 4),
      srcH: buf.readUInt16LE(ptr + 6),
      targetX: buf.readUInt16LE(ptr + 8),
      targetY: buf.readUInt16LE(ptr + 10),
      targetW: buf.readUInt16LE(ptr + 12),
      targetH: buf.readUInt16LE(ptr + 14),
      boundW: buf.readUInt16LE(ptr + 16),
      boundH: buf.readUInt16LE(ptr + 18),
      textureId: buf.readUInt16LE(ptr + 20),
    });
  }
  return map;
}

function parseSprt(
  buf: Buffer,
  chunk: ChunkSlice,
  tpagMap: Map<number, TpagRect>,
): { sprites: Record<string, SpriteDef>; spritesById: string[]; brokenTpagRefs: number } {
  const count = buf.readUInt32LE(chunk.start);
  const sprites: Record<string, SpriteDef> = {};
  const spritesById: string[] = new Array<string>(count);
  let brokenTpagRefs = 0;

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const name = readCString(buf, buf.readUInt32LE(ptr + 0));
    const width = buf.readUInt32LE(ptr + 4);
    const height = buf.readUInt32LE(ptr + 8);
    const bboxLeft = buf.readInt32LE(ptr + 12);
    const bboxRight = buf.readInt32LE(ptr + 16);
    const bboxBottom = buf.readInt32LE(ptr + 20);
    const bboxTop = buf.readInt32LE(ptr + 24);
    const bboxMode = buf.readUInt32LE(ptr + 40);
    const sepMasks = buf.readUInt32LE(ptr + 44);
    const originX = buf.readInt32LE(ptr + 48);
    const originY = buf.readInt32LE(ptr + 52);
    const playbackSpeed = buf.readFloatLE(ptr + 68);
    const playbackSpeedType = buf.readUInt32LE(ptr + 72);
    const tpagCount = buf.readUInt32LE(ptr + 84);

    const frames: TpagRect[] = [];
    for (let f = 0; f < tpagCount; f++) {
      const tpagPtr = buf.readUInt32LE(ptr + 88 + f * 4);
      const rect = tpagMap.get(tpagPtr);
      if (!rect) {
        brokenTpagRefs++;
      } else {
        frames.push(rect);
      }
    }

    const def: SpriteDef = {
      id,
      name,
      width,
      height,
      originX,
      originY,
      bboxLeft,
      bboxRight,
      bboxTop,
      bboxBottom,
      bboxMode,
      sepMasks,
      playbackSpeed,
      playbackSpeedType,
      frames,
    };

    sprites[name] = def;
    spritesById[id] = name;
  }

  return { sprites, spritesById, brokenTpagRefs };
}

function extractAudo(
  buf: Buffer,
  chunk: ChunkSlice,
  outDir: string,
): { audoById: Map<number, AudoMeta>; count: number; wavCount: number; oggCount: number } {
  const count = buf.readUInt32LE(chunk.start);
  const audoDir = path.join(outDir, 'audio', 'audo');
  fs.mkdirSync(audoDir, { recursive: true });

  const audoById = new Map<number, AudoMeta>();
  let wavCount = 0;
  let oggCount = 0;

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const len = buf.readUInt32LE(ptr);
    const dataStart = ptr + 4;
    const payload = buf.subarray(dataStart, dataStart + len);
    const magic = len >= 4 ? payload.toString('ascii', 0, 4) : '';

    let ext: string;
    let sourceType: SoundSourceType;
    if (magic === 'RIFF') {
      ext = 'wav';
      sourceType = 'audo-wav';
      wavCount++;
    } else if (magic === 'OggS') {
      ext = 'ogg';
      sourceType = 'audo-ogg';
      oggCount++;
    } else {
      throw new Error(`AUDO[${id}] has unrecognized audio magic "${magic}" (len=${len})`);
    }

    const relPath = `audio/audo/${id}.${ext}`;
    fs.writeFileSync(path.join(audoDir, `${id}.${ext}`), payload);
    audoById.set(id, { id, ext, sourceType, relPath, byteLength: len });
  }

  return { audoById, count, wavCount, oggCount };
}

function copyLooseOggs(
  steamDir: string,
  outDir: string,
): {
  music: Record<string, string>;
  ambience: Record<string, string>;
  looseSounds: Record<string, string>;
  lookupByFileKey: Map<string, string>;
  counts: { mus: number; snd: number; amb: number };
} {
  const music: Record<string, string> = {};
  const ambience: Record<string, string> = {};
  const looseSounds: Record<string, string> = {};
  const lookupByFileKey = new Map<string, string>();
  const counts = { mus: 0, snd: 0, amb: 0 };

  const folders: Array<'mus' | 'snd' | 'amb'> = ['mus', 'snd', 'amb'];
  for (const folder of folders) {
    const srcFolder = path.join(steamDir, folder);
    if (!fs.existsSync(srcFolder)) continue;

    const dstFolder = path.join(outDir, 'audio', folder);
    fs.mkdirSync(dstFolder, { recursive: true });

    const entries = fs.readdirSync(srcFolder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name === '__README.txt' || entry.name.toLowerCase().endsWith('.txt')) continue;

      const srcPath = path.join(srcFolder, entry.name);
      const fd = fs.openSync(srcPath, 'r');
      const header = Buffer.alloc(4);
      const bytesRead = fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);

      if (bytesRead < 4 || header.toString('ascii', 0, 4) !== 'OggS') {
        continue;
      }

      const baseName = entry.name.toLowerCase().endsWith('.ogg')
        ? entry.name.slice(0, -4)
        : entry.name;
      const outFilename = `${baseName}.ogg`;
      const relPath = `audio/${folder}/${outFilename}`;
      fs.copyFileSync(srcPath, path.join(dstFolder, outFilename));

      const key = `${folder}/${baseName}`;
      lookupByFileKey.set(key, relPath);
      lookupByFileKey.set(key.toLowerCase(), relPath);

      if (folder === 'mus') {
        music[key] = relPath;
        counts.mus++;
      } else if (folder === 'amb') {
        ambience[key] = relPath;
        counts.amb++;
      } else {
        looseSounds[key] = relPath;
        counts.snd++;
      }
    }
  }

  return { music, ambience, looseSounds, lookupByFileKey, counts };
}

function parseSond(
  buf: Buffer,
  chunk: ChunkSlice,
  audoById: Map<number, AudoMeta>,
  looseLookup: Map<string, string>,
): { sounds: Record<string, SoundDef>; soundsById: string[]; unresolvedExternalSounds: number } {
  const count = buf.readUInt32LE(chunk.start);
  const sounds: Record<string, SoundDef> = {};
  const soundsById: string[] = new Array<string>(count);
  let unresolvedExternalSounds = 0;

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const name = readCString(buf, buf.readUInt32LE(ptr + 0));
    const flags = buf.readUInt32LE(ptr + 4);
    const file = readCString(buf, buf.readUInt32LE(ptr + 12)).replace(/\\/g, '/');
    const volume = buf.readFloatLE(ptr + 20);
    const pitch = buf.readFloatLE(ptr + 24);
    const groupId = buf.readUInt32LE(ptr + 28);
    const audioId = buf.readInt32LE(ptr + 32);

    let sourceType: SoundSourceType;
    let relPath: string;

    if (audioId >= 0) {
      const audo = audoById.get(audioId);
      if (!audo) {
        throw new Error(`SOND[${id}] "${name}" references missing AUDO id ${audioId}`);
      }
      sourceType = audo.sourceType;
      relPath = audo.relPath;
    } else {
      const normalized = file.replace(/\.(ogg|wav)$/i, '');
      const matched = looseLookup.get(normalized) ?? looseLookup.get(normalized.toLowerCase());
      if (!matched) {
        unresolvedExternalSounds++;
        sourceType = 'fallback-synth';
        relPath = '';
      } else {
        sourceType = 'external-ogg';
        relPath = matched;
      }
    }

    const def: SoundDef = {
      id,
      name,
      flags,
      file,
      volume,
      pitch,
      groupId,
      audioId,
      sourceType,
      path: relPath,
    };

    sounds[name] = def;
    soundsById[id] = name;
  }

  return { sounds, soundsById, unresolvedExternalSounds };
}

function parseFont(
  buf: Buffer,
  chunk: ChunkSlice,
  tpagMap: Map<number, TpagRect>,
): { fonts: Record<string, FontDef>; brokenFontTpags: number } {
  const count = buf.readUInt32LE(chunk.start);
  const fonts: Record<string, FontDef> = {};
  let brokenFontTpags = 0;

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const name = readCString(buf, buf.readUInt32LE(ptr + 0));
    const displayName = readCString(buf, buf.readUInt32LE(ptr + 4));
    const tpagOffset = buf.readUInt32LE(ptr + 28);
    const scaleX = buf.readFloatLE(ptr + 32);
    const scaleY = buf.readFloatLE(ptr + 36);
    const rawAscender = buf.readUInt32LE(ptr + 44);
    const rawLineHeight = buf.readUInt32LE(ptr + 52);
    const glyphCount = buf.readUInt32LE(ptr + 56);

    const tpag = tpagMap.get(tpagOffset);
    if (!tpag) {
      brokenFontTpags++;
      continue;
    }

    const glyphs: Record<number, FontGlyph> = {};
    let maxGlyphH = 0;
    for (let g = 0; g < glyphCount; g++) {
      const gPtr = buf.readUInt32LE(ptr + 60 + g * 4);
      const charCode = buf.readUInt16LE(gPtr + 0);
      const x = buf.readUInt16LE(gPtr + 2);
      const y = buf.readUInt16LE(gPtr + 4);
      const w = buf.readUInt16LE(gPtr + 6);
      const h = buf.readUInt16LE(gPtr + 8);
      const shift = buf.readUInt16LE(gPtr + 10);
      const offset = buf.readUInt16LE(gPtr + 12);
      if (h > maxGlyphH) maxGlyphH = h;
      glyphs[charCode] = { charCode, x, y, w, h, shift, offset };
    }

    const lineHeight = rawLineHeight > 0 ? rawLineHeight : Math.max(maxGlyphH, 8);
    const ascender = rawAscender > 0 ? rawAscender : lineHeight;

    fonts[name] = {
      id,
      name,
      displayName,
      tpag,
      scaleX,
      scaleY,
      lineHeight,
      ascender,
      glyphs,
    };
  }

  return { fonts, brokenFontTpags };
}

function parseObjt(
  buf: Buffer,
  chunk: ChunkSlice,
  spritesById: string[],
): Record<string, ObjectDef> {
  const count = buf.readUInt32LE(chunk.start);
  const objects: Record<string, ObjectDef> = {};

  for (let id = 0; id < count; id++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + id * 4);
    const name = readCString(buf, buf.readUInt32LE(ptr + 0));
    const spriteId = buf.readInt32LE(ptr + 4);
    const visible = buf.readUInt32LE(ptr + 8) !== 0;
    // +12 is GMS2022.5+ `managed` uint32
    const solid = buf.readUInt32LE(ptr + 16) !== 0;
    const depth = buf.readInt32LE(ptr + 20);
    const persistent = buf.readUInt32LE(ptr + 24) !== 0;
    const parentId = buf.readInt32LE(ptr + 28);
    const textureMaskId = buf.readInt32LE(ptr + 32);

    const spriteName =
      spriteId >= 0 && spriteId < spritesById.length ? (spritesById[spriteId] ?? null) : null;

    objects[name] = {
      id,
      name,
      spriteId,
      spriteName,
      visible,
      solid,
      depth,
      persistent,
      parentId,
      textureMaskId,
    };
  }

  return objects;
}

function parseShdr(buf: Buffer, chunk: ChunkSlice): string[] {
  const count = buf.readUInt32LE(chunk.start);
  const shaders: string[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = buf.readUInt32LE(chunk.start + 4 + i * 4);
    shaders.push(readCString(buf, buf.readUInt32LE(ptr + 0)));
  }
  return shaders;
}

/**
 * RFC-4180 CSV parser supporting UTF-8 BOM, quoted fields, embedded commas/newlines, and escaped `""`.
 */
function parseCsvRows(raw: string): string[][] {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseLangCsv(steamDir: string): Record<string, Record<string, string>> {
  const csvPath = path.join(steamDir, 'lang', 'lang.csv');
  const lang: Record<string, Record<string, string>> = {};
  if (!fs.existsSync(csvPath)) return lang;

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvRows(raw);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;
    const group = (row[0] ?? '').trim();
    const key = (row[1] ?? '').trim();
    const text = row[2] ?? '';
    if (!group || !key) continue;
    let bucket = lang[group];
    if (!bucket) {
      bucket = {};
      lang[group] = bucket;
    }
    bucket[key] = text;
  }
  return lang;
}

export function extractAssets(options: ExtractOptions = {}): ExtractSummary | null {
  const steamDir = options.steamDir ?? process.env.NT_STEAM_DIR ?? DEFAULT_STEAM_DIR;
  const outDir = options.outDir ?? path.resolve(process.cwd(), '.nt-assets');
  const dataWinPath = path.join(steamDir, 'data.win');

  if (!fs.existsSync(dataWinPath)) {
    if (options.allowMissing) {
      if (!options.quiet) {
        console.log(
          `[extract-assets] Steam Nuclear Throne data.win not found at "${dataWinPath}" (--allow-missing set; exiting cleanly).`,
        );
      }
      return null;
    }
    throw new Error(
      `[extract-assets] Nuclear Throne data.win not found at "${dataWinPath}". Set NT_STEAM_DIR to your Steam Nuclear Throne folder or pass --allow-missing.`,
    );
  }

  const startTime = Date.now();
  fs.mkdirSync(outDir, { recursive: true });

  const buf = fs.readFileSync(dataWinPath);
  const chunks = parseFormChunks(buf);

  const tginGroups = parseTgin(buf, requireChunk(chunks, 'TGIN'));
  const { textures, copiedTextures } = parseTxtrAndCopyPngs(
    buf,
    requireChunk(chunks, 'TXTR'),
    tginGroups,
    steamDir,
    outDir,
  );
  const tpagMap = parseTpag(buf, requireChunk(chunks, 'TPAG'));
  const { sprites, spritesById, brokenTpagRefs: brokenSpriteTpags } = parseSprt(
    buf,
    requireChunk(chunks, 'SPRT'),
    tpagMap,
  );
  const audo = extractAudo(buf, requireChunk(chunks, 'AUDO'), outDir);
  const loose = copyLooseOggs(steamDir, outDir);
  const { sounds, soundsById, unresolvedExternalSounds } = parseSond(
    buf,
    requireChunk(chunks, 'SOND'),
    audo.audoById,
    loose.lookupByFileKey,
  );
  const { fonts, brokenFontTpags } = parseFont(buf, requireChunk(chunks, 'FONT'), tpagMap);
  const objects = parseObjt(buf, requireChunk(chunks, 'OBJT'), spritesById);
  const shaders = parseShdr(buf, requireChunk(chunks, 'SHDR'));
  const lang = parseLangCsv(steamDir);

  const brokenTpagRefs = brokenSpriteTpags + brokenFontTpags;
  const looseOggCount = loose.counts.mus + loose.counts.snd + loose.counts.amb;

  const manifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceMode: 'steam',
    textures,
    sprites,
    spritesById,
    sounds,
    soundsById,
    music: loose.music,
    ambience: loose.ambience,
    looseSounds: loose.looseSounds,
    fonts,
    objects,
    shaders,
    lang,
    stats: {
      spriteCount: spritesById.length,
      tpagCount: tpagMap.size,
      objectCount: Object.keys(objects).length,
      soundCount: soundsById.length,
      audoCount: audo.count,
      fontCount: Object.keys(fonts).length,
      looseOggCount,
    },
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  const oracle = dumpOracle({
    steamDir,
    outDir,
    manifestObjects: objects,
    allowMissing: true,
    quiet: options.quiet,
  });

  if (brokenTpagRefs > 0) {
    throw new Error(`[extract-assets] Verification failed: ${brokenTpagRefs} broken TPAG references detected.`);
  }
  if (unresolvedExternalSounds > 0) {
    throw new Error(
      `[extract-assets] Verification failed: ${unresolvedExternalSounds} external SOND entries failed to match loose OGGs.`,
    );
  }

  const elapsedMs = Date.now() - startTime;
  if (!options.quiet) {
    console.log(`[extract-assets] Extraction complete in ${elapsedMs}ms -> ${outDir}`);
    console.log(`  Textures : ${textures.length} pages (${copiedTextures} external PNGs copied, ${textures.filter((t) => t.embedded).length} embedded)`);
    console.log(`  TPAGs    : ${manifest.stats.tpagCount} (0 broken refs)`);
    console.log(`  Sprites  : ${manifest.stats.spriteCount}`);
    console.log(`  Sounds   : ${manifest.stats.soundCount} (${audo.count} AUDO: ${audo.wavCount} wav + ${audo.oggCount} ogg; ${looseOggCount} loose OGGs: ${loose.counts.mus} mus + ${loose.counts.snd} snd + ${loose.counts.amb} amb)`);
    console.log(`  Fonts    : ${manifest.stats.fontCount} (${Object.keys(fonts).join(', ')})`);
    console.log(`  Objects  : ${manifest.stats.objectCount}`);
    console.log(`  Shaders  : ${shaders.length} (${shaders.join(', ')})`);
    console.log(`  Lang     : ${Object.keys(lang).length} groups`);
    if (oracle) {
      console.log(`  Oracle   : ${oracle.objectCount} objects, ${oracle.scripts.length} scripting entries`);
    }
  }

  return {
    manifest,
    brokenTpagRefs,
    unresolvedExternalSounds,
    copiedTextures,
    audoWavCount: audo.wavCount,
    audoOggCount: audo.oggCount,
    looseCounts: loose.counts,
    oracleObjectCount: oracle?.objectCount ?? 0,
    oracleScriptCount: oracle?.scripts.length ?? 0,
  };
}

function parseCliArgs(argv: string[]): ExtractOptions {
  const opts: ExtractOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--allow-missing') {
      opts.allowMissing = true;
    } else if (arg === '--quiet') {
      opts.quiet = true;
    } else if (arg === '--steam-dir' && argv[i + 1]) {
      opts.steamDir = argv[++i];
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = argv[++i];
    }
  }
  return opts;
}

const isMain =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    extractAssets(parseCliArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
