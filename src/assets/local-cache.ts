import type { AssetManifest } from '@/contracts';
import type { AssetBundle, TextureImageSource } from './loader';

export const DB_NAME = 'nt_local_assets_v1';
export const ASSET_MODE_STORAGE_KEY = 'nt_asset_mode_pref_v1';

const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_TEXTURES = 'textures';
const STORE_AUDIO = 'audio';
const META_KEY = 'current';

export type AssetModePreference = 'auto' | 'builtin' | 'local';

export interface CachedTextureEntry {
  id: number;
  blob: Blob;
}

export interface CachedAudioEntry {
  path: string;
  blob: Blob;
}

export interface CachedLocalAssetPayload {
  manifest: AssetManifest;
  textures: CachedTextureEntry[];
  audioFiles: CachedAudioEntry[];
  savedAt: string;
}

interface StoredMetaRecord {
  manifest: AssetManifest;
  savedAt: string;
  textureCount: number;
  audioCount: number;
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function revokeUrls(urls: readonly string[]): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore individual revocation failures
    }
  }
}

function loadImageFromBlob(blob: Blob, createdUrls: string[]): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (
      typeof Image === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      reject(new Error('Browser Image/URL APIs are unavailable'));
      return;
    }
    const url = URL.createObjectURL(blob);
    createdUrls.push(url);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode local texture PNG image'));
    img.src = url;
  });
}

/**
 * Hydrates a CachedLocalAssetPayload (manifest + texture PNG Blobs + audio Blobs)
 * into a live AssetBundle backed by in-memory HTMLImageElements and Blob Object URLs.
 * Provides `dispose()` to cleanly revoke all allocated Object URLs.
 */
export async function createLocalBundleFromPayload(
  payload: CachedLocalAssetPayload,
): Promise<AssetBundle> {
  const createdUrls: string[] = [];
  const textures = new Map<number, TextureImageSource>();
  const audioUrls = new Map<string, string>();
  const audioUrlsLower = new Map<string, string>();

  try {
    const canDecodeImages =
      typeof Image !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function';

    if (canDecodeImages && payload.textures.length > 0) {
      const decoded = await Promise.all(
        payload.textures.map(async (entry) => {
          const img = await loadImageFromBlob(entry.blob, createdUrls);
          return { id: entry.id, img };
        }),
      );
      for (const item of decoded) {
        textures.set(item.id, item.img);
      }
    }

    const canCreateObjectUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

    if (canCreateObjectUrl) {
      for (const entry of payload.audioFiles) {
        const normalized = normalizeRelPath(entry.path);
        if (!normalized) continue;
        const objectUrl = URL.createObjectURL(entry.blob);
        createdUrls.push(objectUrl);
        audioUrls.set(normalized, objectUrl);
        audioUrlsLower.set(normalized.toLowerCase(), objectUrl);
      }
    }
  } catch (err) {
    revokeUrls(createdUrls);
    throw err;
  }

  let disposed = false;
  const manifest = payload.manifest;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    revokeUrls(createdUrls);
    createdUrls.length = 0;
    audioUrls.clear();
    audioUrlsLower.clear();
    textures.clear();
  };

  return {
    manifest,
    textures,
    baseUrl: '',
    sourceMode: manifest.sourceMode,
    origin: 'steam-local',
    getSprite: (name: string) => manifest.sprites[name],
    getTexture: (textureId: number) => textures.get(textureId),
    getFont: (name: string) => manifest.fonts[name],
    getSound: (name: string) => manifest.sounds[name],
    getAudioUrl: (relPath: string) => {
      if (!relPath || disposed) return '';
      const normalized = normalizeRelPath(relPath);
      return audioUrls.get(normalized) ?? audioUrlsLower.get(normalized.toLowerCase()) ?? '';
    },
    dispose,
  };
}

function getIndexedDbFactory(): IDBFactory | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb || typeof idb.open !== 'function') return null;
    return idb;
  } catch {
    return null;
  }
}

function openCacheDb(): Promise<IDBDatabase | null> {
  const idb = getIndexedDbFactory();
  if (!idb) {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
        if (!db.objectStoreNames.contains(STORE_TEXTURES)) {
          db.createObjectStore(STORE_TEXTURES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO)) {
          db.createObjectStore(STORE_AUDIO, { keyPath: 'path' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function isValidManifestShape(manifest: unknown): manifest is AssetManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const candidate = manifest as Partial<AssetManifest>;
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

/**
 * Reads the user's preferred asset mode from localStorage (`'auto' | 'builtin' | 'local'`).
 * Always safe in Node, private tabs, and restricted storage contexts.
 */
export function getAssetModePreference(): AssetModePreference {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    const raw = localStorage.getItem(ASSET_MODE_STORAGE_KEY);
    if (raw === 'auto' || raw === 'builtin' || raw === 'local') {
      return raw;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Persists the user's preferred asset mode into localStorage (`'auto' | 'builtin' | 'local'`).
 * Silently no-ops when localStorage is unavailable.
 */
export function setAssetModePreference(pref: AssetModePreference): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ASSET_MODE_STORAGE_KEY, pref);
  } catch {
    // Ignore quota / private browsing errors
  }
}

/**
 * Checks whether a complete local Steam asset bundle is cached in this browser's IndexedDB.
 * Returns `false` gracefully when IndexedDB is unavailable or empty.
 */
export async function hasCachedLocalAssets(): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;

  try {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const meta = (await readRequest(store.get(META_KEY))) as StoredMetaRecord | undefined;
    if (!meta || !isValidManifestShape(meta.manifest)) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Saves extracted user-owned local Steam assets into this browser's IndexedDB.
 * Returns `true` on success, or `false` cleanly on unavailable IndexedDB / quota errors.
 */
export async function saveCachedLocalAssets(payload: CachedLocalAssetPayload): Promise<boolean> {
  if (!isValidManifestShape(payload.manifest)) {
    return false;
  }

  const db = await openCacheDb();
  if (!db) return false;

  try {
    const tx = db.transaction([STORE_META, STORE_TEXTURES, STORE_AUDIO], 'readwrite');
    const metaStore = tx.objectStore(STORE_META);
    const texStore = tx.objectStore(STORE_TEXTURES);
    const audioStore = tx.objectStore(STORE_AUDIO);

    metaStore.clear();
    texStore.clear();
    audioStore.clear();

    const metaRecord: StoredMetaRecord = {
      manifest: payload.manifest,
      savedAt: payload.savedAt || new Date().toISOString(),
      textureCount: payload.textures.length,
      audioCount: payload.audioFiles.length,
    };
    metaStore.put(metaRecord, META_KEY);

    for (const tex of payload.textures) {
      texStore.put({ id: tex.id, blob: tex.blob });
    }

    for (const aud of payload.audioFiles) {
      const normalized = normalizeRelPath(aud.path);
      if (!normalized) continue;
      audioStore.put({ path: normalized, blob: aud.blob });
    }

    await waitForTransaction(tx);
    return true;
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Loads the cached local Steam AssetBundle from this browser's IndexedDB.
 * Returns `null` cleanly if unavailable, empty, or incomplete/corrupted.
 */
export async function loadCachedLocalBundle(): Promise<AssetBundle | null> {
  const db = await openCacheDb();
  if (!db) return null;

  try {
    const tx = db.transaction([STORE_META, STORE_TEXTURES, STORE_AUDIO], 'readonly');
    // Issue all requests synchronously on the same transaction turn to avoid Safari/WebKit auto-commit races
    const metaReq = tx.objectStore(STORE_META).get(META_KEY);
    const texReq = tx.objectStore(STORE_TEXTURES).getAll();
    const audioReq = tx.objectStore(STORE_AUDIO).getAll();

    const [meta, textures, audioFiles] = await Promise.all([
      readRequest(metaReq) as Promise<StoredMetaRecord | undefined>,
      readRequest(texReq) as Promise<CachedTextureEntry[]>,
      readRequest(audioReq) as Promise<CachedAudioEntry[]>,
    ]);

    if (!meta || !isValidManifestShape(meta.manifest)) {
      return null;
    }

    // Verify every required external texture page is present in cache
    const texIds = new Set<number>(textures.map((t) => t.id));
    for (const page of meta.manifest.textures) {
      if (!page.embedded && page.file && !texIds.has(page.id)) {
        return null;
      }
    }

    return await createLocalBundleFromPayload({
      manifest: meta.manifest,
      textures,
      audioFiles,
      savedAt: meta.savedAt,
    });
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Clears all locally cached Steam assets from this browser's IndexedDB.
 * Fails silently when IndexedDB is unavailable.
 */
export async function clearCachedLocalAssets(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_META, STORE_TEXTURES, STORE_AUDIO], 'readwrite');
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_TEXTURES).clear();
    tx.objectStore(STORE_AUDIO).clear();
    await waitForTransaction(tx);
  } catch {
    // Ignore storage errors
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}
