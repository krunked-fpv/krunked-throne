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
import type { AssetBundle } from './loader';
import {
  createLocalBundleFromPayload,
  type CachedAudioEntry,
  type CachedLocalAssetPayload,
  type CachedTextureEntry,
} from './local-cache';

export type { CachedLocalAssetPayload } from './local-cache';

export interface LocalAssetResult {
  bundle: AssetBundle;
  rawCachePayload: CachedLocalAssetPayload;
}

export interface DataWinParseResult {
  manifest: AssetManifest;
  audoEntries: CachedAudioEntry[];
  embeddedTextures: CachedTextureEntry[];
  brokenTpagRefs: number;
  unresolvedExternalSounds: number;
  audoWavCount: number;
  audoOggCount: number;
}

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

interface LooseAudioCollection {
  music: Record<string, string>;
  ambience: Record<string, string>;
  looseSounds: Record<string, string>;
  lookupByFileKey: Map<string, string>;
  audioEntries: CachedAudioEntry[];
  counts: { mus: number; snd: number; amb: number };
}

interface IndexedFile {
  file: File;
  normPath: string;
  lowerPath: string;
  segments: string[];
  baseName: string;
  baseNameLower: string;
}

const utf8Decoder = new TextDecoder('utf-8');

function normalizePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.byteLength, offset + length);
  for (let i = offset; i < end; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function parseFormChunks(bytes: Uint8Array, view: DataView): Map<string, ChunkSlice> {
  if (bytes.byteLength < 8 || readAscii(bytes, 0, 4) !== 'FORM') {
    throw new Error('Invalid data.win: missing FORM IFF header');
  }
  const declaredLen = view.getUint32(4, true);
  const endLimit = Math.min(bytes.byteLength, 8 + declaredLen);
  const chunks = new Map<string, ChunkSlice>();

  let offset = 8;
  while (offset + 8 <= endLimit) {
    const name = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.byteLength) {
      throw new Error(
        `Chunk ${name} at offset ${offset} exceeds buffer bounds (${start + size} > ${bytes.byteLength})`,
      );
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
function readCString(bytes: Uint8Array, view: DataView, ptr: number): string {
  if (ptr <= 0 || ptr >= bytes.byteLength) return '';
  let maxEnd = bytes.byteLength;
  if (ptr >= 4) {
    const strgLen = view.getUint32(ptr - 4, true);
    if (strgLen > 0 && strgLen < 0x100000 && ptr + strgLen <= bytes.byteLength) {
      maxEnd = ptr + strgLen;
    }
  }
  let end = ptr;
  while (end < maxEnd && bytes[end] !== 0) {
    end++;
  }
  return utf8Decoder.decode(bytes.subarray(ptr, end));
}

function parseTgin(bytes: Uint8Array, view: DataView, chunk: ChunkSlice): TginGroup[] {
  const version = view.getUint32(chunk.start, true);
  const count = view.getUint32(chunk.start + 4, true);
  if (version !== 1) {
    throw new Error(`Unexpected TGIN version ${version} (expected 1)`);
  }

  const groups: TginGroup[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = view.getUint32(chunk.start + 8 + i * 4, true);
    const name = readCString(bytes, view, view.getUint32(ptr, true));
    const dir = readCString(bytes, view, view.getUint32(ptr + 4, true));
    const ext = readCString(bytes, view, view.getUint32(ptr + 8, true));
    const loadType = view.getUint32(ptr + 12, true);
    const texListPtr = view.getUint32(ptr + 16, true);
    const texCount = view.getUint32(texListPtr, true);
    const texPageIds: number[] = [];
    for (let k = 0; k < texCount; k++) {
      texPageIds.push(view.getUint32(texListPtr + 4 + k * 4, true));
    }
    groups.push({ name, dir, ext, loadType, texPageIds });
  }
  return groups;
}

function extractEmbeddedPngBlob(bytes: Uint8Array<ArrayBuffer>, offset: number): Blob | null {
  if (offset <= 0 || offset + 8 >= bytes.byteLength) return null;
  // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[offset] !== 0x89 ||
    bytes[offset + 1] !== 0x50 ||
    bytes[offset + 2] !== 0x4e ||
    bytes[offset + 3] !== 0x47 ||
    bytes[offset + 4] !== 0x0d ||
    bytes[offset + 5] !== 0x0a ||
    bytes[offset + 6] !== 0x1a ||
    bytes[offset + 7] !== 0x0a
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = offset + 8;
  while (pos + 12 <= bytes.byteLength) {
    const chunkLen = view.getUint32(pos, false);
    const type = readAscii(bytes, pos + 4, 4);
    pos += 12 + chunkLen;
    if (pos > bytes.byteLength) return null;
    if (type === 'IEND') {
      return new Blob([bytes.subarray(offset, pos)], { type: 'image/png' });
    }
  }
  return null;
}

function parseTxtr(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  chunk: ChunkSlice,
  groups: readonly TginGroup[],
): { textures: TexturePageDef[]; embeddedTextures: CachedTextureEntry[] } {
  const groupByPageId = new Map<number, { group: TginGroup; indexInGroup: number }>();
  for (const group of groups) {
    for (let idx = 0; idx < group.texPageIds.length; idx++) {
      const pageId = group.texPageIds[idx];
      if (pageId !== undefined) {
        groupByPageId.set(pageId, { group, indexInGroup: idx });
      }
    }
  }

  const count = view.getUint32(chunk.start, true);
  const textures: TexturePageDef[] = [];
  const embeddedTextures: CachedTextureEntry[] = [];

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const width = view.getUint32(ptr + 12, true);
    const height = view.getUint32(ptr + 16, true);
    const rawIndexInGroup = view.getUint32(ptr + 20, true);
    const blobPtr = view.getUint32(ptr + 24, true);

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
    } else if (blobPtr !== 0) {
      const pngBlob = extractEmbeddedPngBlob(bytes, blobPtr);
      if (pngBlob) {
        embeddedTextures.push({ id, blob: pngBlob });
      }
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

  return { textures, embeddedTextures };
}

function parseTpag(view: DataView, chunk: ChunkSlice): Map<number, TpagRect> {
  const count = view.getUint32(chunk.start, true);
  const map = new Map<number, TpagRect>();
  for (let i = 0; i < count; i++) {
    const ptr = view.getUint32(chunk.start + 4 + i * 4, true);
    map.set(ptr, {
      srcX: view.getUint16(ptr + 0, true),
      srcY: view.getUint16(ptr + 2, true),
      srcW: view.getUint16(ptr + 4, true),
      srcH: view.getUint16(ptr + 6, true),
      targetX: view.getUint16(ptr + 8, true),
      targetY: view.getUint16(ptr + 10, true),
      targetW: view.getUint16(ptr + 12, true),
      targetH: view.getUint16(ptr + 14, true),
      boundW: view.getUint16(ptr + 16, true),
      boundH: view.getUint16(ptr + 18, true),
      textureId: view.getUint16(ptr + 20, true),
    });
  }
  return map;
}

function parseSprt(
  bytes: Uint8Array,
  view: DataView,
  chunk: ChunkSlice,
  tpagMap: Map<number, TpagRect>,
): { sprites: Record<string, SpriteDef>; spritesById: string[]; brokenTpagRefs: number } {
  const count = view.getUint32(chunk.start, true);
  const sprites: Record<string, SpriteDef> = {};
  const spritesById: string[] = new Array<string>(count);
  let brokenTpagRefs = 0;

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const name = readCString(bytes, view, view.getUint32(ptr + 0, true));
    const width = view.getUint32(ptr + 4, true);
    const height = view.getUint32(ptr + 8, true);
    const bboxLeft = view.getInt32(ptr + 12, true);
    const bboxRight = view.getInt32(ptr + 16, true);
    const bboxBottom = view.getInt32(ptr + 20, true);
    const bboxTop = view.getInt32(ptr + 24, true);
    const bboxMode = view.getUint32(ptr + 40, true);
    const sepMasks = view.getUint32(ptr + 44, true);
    const originX = view.getInt32(ptr + 48, true);
    const originY = view.getInt32(ptr + 52, true);
    const playbackSpeed = view.getFloat32(ptr + 68, true);
    const playbackSpeedType = view.getUint32(ptr + 72, true);
    const tpagCount = view.getUint32(ptr + 84, true);

    const frames: TpagRect[] = [];
    for (let f = 0; f < tpagCount; f++) {
      const tpagPtr = view.getUint32(ptr + 88 + f * 4, true);
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

function parseAudo(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  chunk: ChunkSlice,
): {
  audoById: Map<number, AudoMeta>;
  audoEntries: CachedAudioEntry[];
  count: number;
  wavCount: number;
  oggCount: number;
} {
  const count = view.getUint32(chunk.start, true);
  const audoById = new Map<number, AudoMeta>();
  const audoEntries: CachedAudioEntry[] = [];
  let wavCount = 0;
  let oggCount = 0;

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const len = view.getUint32(ptr, true);
    const dataStart = ptr + 4;
    if (dataStart + len > bytes.byteLength) {
      throw new Error(`AUDO[${id}] payload exceeds data.win bounds (${dataStart + len} > ${bytes.byteLength})`);
    }
    const magic = len >= 4 ? readAscii(bytes, dataStart, 4) : '';

    let ext: string;
    let mime: string;
    let sourceType: SoundSourceType;
    if (magic === 'RIFF') {
      ext = 'wav';
      mime = 'audio/wav';
      sourceType = 'audo-wav';
      wavCount++;
    } else if (magic === 'OggS') {
      ext = 'ogg';
      mime = 'audio/ogg';
      sourceType = 'audo-ogg';
      oggCount++;
    } else {
      throw new Error(`AUDO[${id}] has unrecognized audio magic "${magic}" (len=${len})`);
    }

    const relPath = `audio/audo/${id}.${ext}`;
    const blob = new Blob([bytes.subarray(dataStart, dataStart + len)], { type: mime });
    audoById.set(id, { id, ext, sourceType, relPath, byteLength: len });
    audoEntries.push({ path: relPath, blob });
  }

  return { audoById, audoEntries, count, wavCount, oggCount };
}

function parseSond(
  bytes: Uint8Array,
  view: DataView,
  chunk: ChunkSlice,
  audoById: Map<number, AudoMeta>,
  looseLookup: Map<string, string>,
): { sounds: Record<string, SoundDef>; soundsById: string[]; unresolvedExternalSounds: number } {
  const count = view.getUint32(chunk.start, true);
  const sounds: Record<string, SoundDef> = {};
  const soundsById: string[] = new Array<string>(count);
  let unresolvedExternalSounds = 0;

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const name = readCString(bytes, view, view.getUint32(ptr + 0, true));
    const flags = view.getUint32(ptr + 4, true);
    const file = readCString(bytes, view, view.getUint32(ptr + 12, true)).replace(/\\/g, '/');
    const volume = view.getFloat32(ptr + 20, true);
    const pitch = view.getFloat32(ptr + 24, true);
    const groupId = view.getUint32(ptr + 28, true);
    const audioId = view.getInt32(ptr + 32, true);

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
  bytes: Uint8Array,
  view: DataView,
  chunk: ChunkSlice,
  tpagMap: Map<number, TpagRect>,
): { fonts: Record<string, FontDef>; brokenFontTpags: number } {
  const count = view.getUint32(chunk.start, true);
  const fonts: Record<string, FontDef> = {};
  let brokenFontTpags = 0;

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const name = readCString(bytes, view, view.getUint32(ptr + 0, true));
    const displayName = readCString(bytes, view, view.getUint32(ptr + 4, true));
    const tpagOffset = view.getUint32(ptr + 28, true);
    const scaleX = view.getFloat32(ptr + 32, true);
    const scaleY = view.getFloat32(ptr + 36, true);
    const rawAscender = view.getUint32(ptr + 44, true);
    const rawLineHeight = view.getUint32(ptr + 52, true);
    const glyphCount = view.getUint32(ptr + 56, true);

    const tpag = tpagMap.get(tpagOffset);
    if (!tpag) {
      brokenFontTpags++;
      continue;
    }

    const glyphs: Record<number, FontGlyph> = {};
    let maxGlyphH = 0;
    for (let g = 0; g < glyphCount; g++) {
      const gPtr = view.getUint32(ptr + 60 + g * 4, true);
      const charCode = view.getUint16(gPtr + 0, true);
      const x = view.getUint16(gPtr + 2, true);
      const y = view.getUint16(gPtr + 4, true);
      const w = view.getUint16(gPtr + 6, true);
      const h = view.getUint16(gPtr + 8, true);
      const shift = view.getUint16(gPtr + 10, true);
      const offset = view.getUint16(gPtr + 12, true);
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
  bytes: Uint8Array,
  view: DataView,
  chunk: ChunkSlice,
  spritesById: readonly string[],
): Record<string, ObjectDef> {
  const count = view.getUint32(chunk.start, true);
  const objects: Record<string, ObjectDef> = {};

  for (let id = 0; id < count; id++) {
    const ptr = view.getUint32(chunk.start + 4 + id * 4, true);
    const name = readCString(bytes, view, view.getUint32(ptr + 0, true));
    const spriteId = view.getInt32(ptr + 4, true);
    const visible = view.getUint32(ptr + 8, true) !== 0;
    // +12 is GMS2022.5+ `managed` uint32
    const solid = view.getUint32(ptr + 16, true) !== 0;
    const depth = view.getInt32(ptr + 20, true);
    const persistent = view.getUint32(ptr + 24, true) !== 0;
    const parentId = view.getInt32(ptr + 28, true);
    const textureMaskId = view.getInt32(ptr + 32, true);

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

function parseShdr(bytes: Uint8Array, view: DataView, chunk: ChunkSlice): string[] {
  const count = view.getUint32(chunk.start, true);
  const shaders: string[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = view.getUint32(chunk.start + 4 + i * 4, true);
    shaders.push(readCString(bytes, view, view.getUint32(ptr + 0, true)));
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

/**
 * Parses Nuclear Throne's `lang/lang.csv` localization table into `group -> key -> text`.
 */
export function parseLangCsvText(raw: string): Record<string, Record<string, string>> {
  const lang: Record<string, Record<string, string>> = {};
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

/**
 * Pure browser/ES2022 GMS2.3+ `data.win` FORM/IFF parser.
 * Extracts textures metadata, TPAGs, sprites, embedded AUDO Blobs, sounds, fonts, objects, and shaders
 * directly from an in-memory `ArrayBuffer`.
 */
export function parseDataWinArrayBuffer(
  buffer: ArrayBuffer,
  options: {
    looseAudio?: Pick<
      LooseAudioCollection,
      'music' | 'ambience' | 'looseSounds' | 'lookupByFileKey' | 'counts'
    >;
    lang?: Record<string, Record<string, string>>;
  } = {},
): DataWinParseResult {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const chunks = parseFormChunks(bytes, view);

  // Verify STRG exists (all C-string pointers resolve into it)
  requireChunk(chunks, 'STRG');

  const tginGroups = parseTgin(bytes, view, requireChunk(chunks, 'TGIN'));
  const { textures, embeddedTextures } = parseTxtr(
    bytes,
    view,
    requireChunk(chunks, 'TXTR'),
    tginGroups,
  );
  const tpagMap = parseTpag(view, requireChunk(chunks, 'TPAG'));
  const { sprites, spritesById, brokenTpagRefs: brokenSpriteTpags } = parseSprt(
    bytes,
    view,
    requireChunk(chunks, 'SPRT'),
    tpagMap,
  );
  const audo = parseAudo(bytes, view, requireChunk(chunks, 'AUDO'));

  const looseLookup = options.looseAudio?.lookupByFileKey ?? new Map<string, string>();
  const { sounds, soundsById, unresolvedExternalSounds } = parseSond(
    bytes,
    view,
    requireChunk(chunks, 'SOND'),
    audo.audoById,
    looseLookup,
  );

  const { fonts, brokenFontTpags } = parseFont(bytes, view, requireChunk(chunks, 'FONT'), tpagMap);
  const objects = parseObjt(bytes, view, requireChunk(chunks, 'OBJT'), spritesById);
  const shaders = parseShdr(bytes, view, requireChunk(chunks, 'SHDR'));

  const brokenTpagRefs = brokenSpriteTpags + brokenFontTpags;
  const looseCounts = options.looseAudio?.counts ?? { mus: 0, snd: 0, amb: 0 };
  const looseOggCount = looseCounts.mus + looseCounts.snd + looseCounts.amb;

  const manifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceMode: 'steam',
    textures,
    sprites,
    spritesById,
    sounds,
    soundsById,
    music: options.looseAudio?.music ?? {},
    ambience: options.looseAudio?.ambience ?? {},
    looseSounds: options.looseAudio?.looseSounds ?? {},
    fonts,
    objects,
    shaders,
    lang: options.lang ?? {},
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

  return {
    manifest,
    audoEntries: audo.audoEntries,
    embeddedTextures,
    brokenTpagRefs,
    unresolvedExternalSounds,
    audoWavCount: audo.wavCount,
    audoOggCount: audo.oggCount,
  };
}

function indexFiles(files: readonly File[]): IndexedFile[] {
  const result: IndexedFile[] = [];
  for (const file of files) {
    const rawPath =
      typeof file.webkitRelativePath === 'string' && file.webkitRelativePath.length > 0
        ? file.webkitRelativePath
        : file.name;
    const normPath = normalizePath(rawPath);
    if (!normPath) continue;
    const segments = normPath.split('/').filter((s) => s.length > 0);
    const baseName = segments[segments.length - 1] ?? file.name;
    result.push({
      file,
      normPath,
      lowerPath: normPath.toLowerCase(),
      segments,
      baseName,
      baseNameLower: baseName.toLowerCase(),
    });
  }
  return result;
}

function getRootPrefix(entry: IndexedFile): string {
  if (entry.segments.length <= 1) return '';
  return `${entry.segments.slice(0, -1).join('/')}/`;
}

function buildRelativeFileMaps(
  indexed: readonly IndexedFile[],
  rootPrefix: string,
): {
  exact: Map<string, File>;
  lower: Map<string, { relPath: string; file: File }>;
  entries: Array<{ relPath: string; lowerPath: string; file: File }>;
} {
  const prefixLower = rootPrefix.toLowerCase();
  const exact = new Map<string, File>();
  const lower = new Map<string, { relPath: string; file: File }>();
  const entries: Array<{ relPath: string; lowerPath: string; file: File }> = [];

  for (const item of indexed) {
    if (prefixLower && !item.lowerPath.startsWith(prefixLower)) continue;
    const relPath = item.normPath.slice(rootPrefix.length);
    if (!relPath) continue;
    const lowerPath = relPath.toLowerCase();
    exact.set(relPath, item.file);
    lower.set(lowerPath, { relPath, file: item.file });
    entries.push({ relPath, lowerPath, file: item.file });
  }

  return { exact, lower, entries };
}

function lookupRelativeFile(
  maps: { exact: Map<string, File>; lower: Map<string, { relPath: string; file: File }> },
  relPath: string,
): File | undefined {
  const normalized = normalizePath(relPath);
  return maps.exact.get(normalized) ?? maps.lower.get(normalized.toLowerCase())?.file;
}

async function fileToBlob(file: File, mimeType: string): Promise<Blob> {
  const buf = await file.arrayBuffer();
  return new Blob([buf], { type: mimeType });
}

async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batchOut = await Promise.all(slice.map(worker));
    results.push(...batchOut);
  }
  return results;
}

function inferAudioMime(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

function isValidManifestObject(parsed: unknown): parsed is AssetManifest {
  if (!parsed || typeof parsed !== 'object') return false;
  const candidate = parsed as Partial<AssetManifest>;
  return (
    Array.isArray(candidate.textures) &&
    typeof candidate.sprites === 'object' &&
    candidate.sprites !== null &&
    typeof candidate.sounds === 'object' &&
    candidate.sounds !== null &&
    typeof candidate.fonts === 'object' &&
    candidate.fonts !== null
  );
}

async function loadFromExtractedManifest(
  manifestFile: File,
  manifest: AssetManifest,
  rootPrefix: string,
  indexed: readonly IndexedFile[],
  onProgress?: (msg: string) => void,
): Promise<LocalAssetResult> {
  void manifestFile;
  const maps = buildRelativeFileMaps(indexed, rootPrefix);

  onProgress?.('Loading extracted texture pages...');
  const externalPages = manifest.textures.filter((t) => !t.embedded && Boolean(t.file));
  const textureBlobs: CachedTextureEntry[] = [];

  for (const page of externalPages) {
    const file = lookupRelativeFile(maps, page.file);
    if (!file) {
      throw new Error(
        `Missing texture file "${page.file}" in the selected .nt-assets folder. Make sure you selected the entire folder containing manifest.json and tex/.`,
      );
    }
    textureBlobs.push({
      id: page.id,
      blob: await fileToBlob(file, 'image/png'),
    });
  }

  onProgress?.('Loading extracted audio files...');
  const pendingAudio: Array<{ path: string; file: File }> = [];
  const seenAudioLower = new Set<string>();

  const queueAudioPath = (canonicalPath: string): void => {
    const normalized = normalizePath(canonicalPath);
    if (!normalized) return;
    const keyLower = normalized.toLowerCase();
    if (seenAudioLower.has(keyLower)) return;
    const file = lookupRelativeFile(maps, normalized);
    if (!file) return;
    seenAudioLower.add(keyLower);
    pendingAudio.push({ path: normalized, file });
  };

  // Register every path explicitly referenced in manifest
  for (const snd of Object.values(manifest.sounds)) {
    if (snd.path) {
      queueAudioPath(snd.path);
    }
  }
  for (const rel of Object.values(manifest.music)) {
    if (rel) queueAudioPath(rel);
  }
  for (const rel of Object.values(manifest.ambience)) {
    if (rel) queueAudioPath(rel);
  }
  for (const rel of Object.values(manifest.looseSounds)) {
    if (rel) queueAudioPath(rel);
  }

  // Also include any additional wav/ogg files under audio/
  for (const entry of maps.entries) {
    if (
      entry.lowerPath.startsWith('audio/') &&
      (entry.lowerPath.endsWith('.wav') || entry.lowerPath.endsWith('.ogg')) &&
      !seenAudioLower.has(entry.lowerPath)
    ) {
      seenAudioLower.add(entry.lowerPath);
      pendingAudio.push({ path: entry.relPath, file: entry.file });
    }
  }

  const audioFiles = await mapInBatches(pendingAudio, 32, async ({ path, file }) => ({
    path,
    blob: await fileToBlob(file, inferAudioMime(path)),
  }));

  const normalizedManifest: AssetManifest = {
    ...manifest,
    sourceMode: 'steam',
  };

  const rawCachePayload: CachedLocalAssetPayload = {
    manifest: normalizedManifest,
    textures: textureBlobs,
    audioFiles,
    savedAt: new Date().toISOString(),
  };

  onProgress?.('Decoding texture atlases...');
  const bundle = await createLocalBundleFromPayload(rawCachePayload);
  onProgress?.('Local assets ready!');
  return { bundle, rawCachePayload };
}

async function collectLooseSteamOggs(
  entries: ReadonlyArray<{ relPath: string; lowerPath: string; file: File }>,
): Promise<LooseAudioCollection> {
  const music: Record<string, string> = {};
  const ambience: Record<string, string> = {};
  const looseSounds: Record<string, string> = {};
  const lookupByFileKey = new Map<string, string>();
  const audioEntries: CachedAudioEntry[] = [];
  const counts = { mus: 0, snd: 0, amb: 0 };

  const candidates: Array<{ folder: 'mus' | 'snd' | 'amb'; fileName: string; file: File }> = [];
  for (const entry of entries) {
    const parts = entry.relPath.split('/');
    if (parts.length !== 2) continue;
    const folderRaw = parts[0]!.toLowerCase();
    if (folderRaw !== 'mus' && folderRaw !== 'snd' && folderRaw !== 'amb') {
      continue;
    }
    const fileName = parts[1]!;
    if (fileName === '__README.txt' || fileName.toLowerCase().endsWith('.txt')) {
      continue;
    }
    candidates.push({ folder: folderRaw, fileName, file: entry.file });
  }

  const decoded = await mapInBatches(candidates, 32, async (cand) => {
    const buf = await cand.file.arrayBuffer();
    if (buf.byteLength < 4) return null;
    const header = new Uint8Array(buf, 0, 4);
    if (
      header[0] !== 0x4f || // 'O'
      header[1] !== 0x67 || // 'g'
      header[2] !== 0x67 || // 'g'
      header[3] !== 0x53 // 'S'
    ) {
      return null;
    }
    return { ...cand, buf };
  });

  for (const item of decoded) {
    if (!item) continue;
    const baseName = item.fileName.toLowerCase().endsWith('.ogg')
      ? item.fileName.slice(0, -4)
      : item.fileName;
    const outFilename = `${baseName}.ogg`;
    const relPath = `audio/${item.folder}/${outFilename}`;
    const key = `${item.folder}/${baseName}`;

    lookupByFileKey.set(key, relPath);
    lookupByFileKey.set(key.toLowerCase(), relPath);

    if (item.folder === 'mus') {
      music[key] = relPath;
      counts.mus++;
    } else if (item.folder === 'amb') {
      ambience[key] = relPath;
      counts.amb++;
    } else {
      looseSounds[key] = relPath;
      counts.snd++;
    }

    audioEntries.push({
      path: relPath,
      blob: new Blob([item.buf], { type: 'audio/ogg' }),
    });
  }

  return { music, ambience, looseSounds, lookupByFileKey, audioEntries, counts };
}

async function loadFromSteamFolder(
  dataWinFile: File,
  rootPrefix: string,
  indexed: readonly IndexedFile[],
  onProgress?: (msg: string) => void,
): Promise<LocalAssetResult> {
  const maps = buildRelativeFileMaps(indexed, rootPrefix);

  onProgress?.('Scanning loose music & ambience tracks...');
  const loose = await collectLooseSteamOggs(maps.entries);

  onProgress?.('Reading lang/lang.csv...');
  const langFile = lookupRelativeFile(maps, 'lang/lang.csv');
  const lang = langFile ? parseLangCsvText(await langFile.text()) : {};

  onProgress?.('Reading data.win...');
  const dataWinBuffer = await dataWinFile.arrayBuffer();

  onProgress?.('Parsing data.win sprites, fonts, and embedded audio...');
  const parsed = parseDataWinArrayBuffer(dataWinBuffer, { looseAudio: loose, lang });
  if (parsed.brokenTpagRefs > 0) {
    throw new Error(
      `Failed to parse data.win: detected ${parsed.brokenTpagRefs} broken TPAG sprite/font references.`,
    );
  }

  onProgress?.('Loading external texture pages (tex/*.png)...');
  const externalPages = parsed.manifest.textures.filter((t) => !t.embedded && Boolean(t.file));
  const textureBlobs: CachedTextureEntry[] = [...parsed.embeddedTextures];

  for (const page of externalPages) {
    const texFile = lookupRelativeFile(maps, page.file);
    if (!texFile) {
      throw new Error(
        `Missing required texture file "${page.file}" in the selected custom asset folder. Make sure you selected the full folder containing data.win and tex/.`,
      );
    }
    textureBlobs.push({
      id: page.id,
      blob: await fileToBlob(texFile, 'image/png'),
    });
  }

  const audioFiles: CachedAudioEntry[] = [...parsed.audoEntries, ...loose.audioEntries];
  const rawCachePayload: CachedLocalAssetPayload = {
    manifest: parsed.manifest,
    textures: textureBlobs,
    audioFiles,
    savedAt: new Date().toISOString(),
  };

  onProgress?.('Decoding texture atlases...');
  const bundle = await createLocalBundleFromPayload(rawCachePayload);
  onProgress?.('Custom asset pack loaded!');

  return { bundle, rawCachePayload };
}

/**
 * 100% client-side local asset loader for browser `<input type="file" webkitdirectory>`
 * or File arrays. Automatically detects both:
 * - Layout A: Pre-extracted `.nt-assets/` folder (`manifest.json`, `tex/*.png`, `audio/**`)
 * - Layout B: Local custom pack folder (`data.win`, `tex/*.png`, optional `mus/`, `snd/`, `amb/`, `lang/lang.csv`)
 */
export async function loadLocalAssetsFromFiles(
  files: FileList | readonly File[],
  onProgress?: (msg: string) => void,
): Promise<LocalAssetResult> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    throw new Error(
      'No files were selected. Please select a custom asset folder (containing data.win and tex/) or a pre-extracted manifest folder (containing manifest.json).',
    );
  }

  onProgress?.('Scanning selected folder...');
  const indexed = indexFiles(fileArray);

  const dataWinCandidates = indexed
    .filter((f) => f.baseNameLower === 'data.win')
    .sort((a, b) => a.segments.length - b.segments.length);

  const manifestCandidates = indexed
    .filter((f) => f.baseNameLower === 'manifest.json')
    .sort((a, b) => a.segments.length - b.segments.length);

  const topDataWin = dataWinCandidates[0];
  const topManifest = manifestCandidates[0];

  // Prefer Layout A (pre-extracted .nt-assets) if a valid manifest.json is at equal or shallower depth than data.win
  if (topManifest && (!topDataWin || topManifest.segments.length <= topDataWin.segments.length)) {
    try {
      const rawText = await topManifest.file.text();
      const parsed = JSON.parse(rawText) as unknown;
      if (isValidManifestObject(parsed)) {
        return await loadFromExtractedManifest(
          topManifest.file,
          parsed,
          getRootPrefix(topManifest),
          indexed,
          onProgress,
        );
      }
    } catch (err) {
      // If there's no data.win fallback, surface a helpful manifest error
      if (!topDataWin) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Selected folder's manifest.json could not be loaded: ${detail}`);
      }
    }
  }

  // Layout B: Local custom asset pack folder (data.win + tex/)
  if (topDataWin) {
    return await loadFromSteamFolder(
      topDataWin.file,
      getRootPrefix(topDataWin),
      indexed,
      onProgress,
    );
  }

  throw new Error(
    'Could not find a valid custom asset pack in the selected folder. Please select a folder containing data.win and tex/, or a pre-extracted manifest folder containing manifest.json.',
  );
}
