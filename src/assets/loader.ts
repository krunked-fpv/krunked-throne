import type { AssetManifest, FontDef, SoundDef, SpriteDef } from '@/contracts';
import { createFallbackBundle, createFallbackManifest } from './fallback';
import {
  getAssetModePreference,
  loadCachedLocalBundle,
  type AssetModePreference,
} from './local-cache';

export type TextureImageSource = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;
export type AssetBundleOrigin = 'steam-server' | 'steam-local' | 'fallback';

export interface AssetBundle {
  manifest: AssetManifest;
  textures: Map<number, TextureImageSource>;
  baseUrl: string;
  sourceMode: 'steam' | 'fallback';
  origin?: AssetBundleOrigin;
  getSprite(name: string): SpriteDef | undefined;
  getTexture(textureId: number): TextureImageSource | undefined;
  getFont(name: string): FontDef | undefined;
  getSound(name: string): SoundDef | undefined;
  getAudioUrl(relPath: string): string;
  dispose?(): void;
}

export interface LoadAssetsOptions {
  modePreference?: AssetModePreference;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function createFallbackBundleWithOrigin(): AssetBundle {
  const bundle = createFallbackBundle();
  bundle.origin = 'fallback';
  return bundle;
}

function createBundleFromManifest(
  manifest: AssetManifest,
  textures: Map<number, TextureImageSource>,
  baseUrl: string,
  origin: AssetBundleOrigin,
): AssetBundle {
  const cleanBase = normalizeBaseUrl(baseUrl);
  return {
    manifest,
    textures,
    baseUrl: cleanBase,
    sourceMode: manifest.sourceMode,
    origin,
    getSprite: (name: string) => manifest.sprites[name],
    getTexture: (textureId: number) => textures.get(textureId),
    getFont: (name: string) => manifest.fonts[name],
    getSound: (name: string) => manifest.sounds[name],
    getAudioUrl: (relPath: string) => {
      if (!relPath) return '';
      const trimmed = relPath.replace(/^\/+/, '');
      return cleanBase ? `${cleanBase}/${trimmed}` : trimmed;
    },
  };
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error(`Image constructor unavailable while loading ${url}`));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load texture image: ${url}`));
    img.src = url;
  });
}

/**
 * Browser asset loader:
 * - Honors `opts.modePreference ?? getAssetModePreference()`:
 *   - `'builtin'`: immediately returns the procedural clean-room fallback bundle (zero network calls).
 *   - `'local'` / `'auto'`: checks the browser's IndexedDB local Steam cache first (`origin: 'steam-local'`),
 *     then tries fetching `${baseUrl}/manifest.json` (`origin: 'steam-server'`), seamlessly falling back
 *     to the procedural clean-room AssetBundle (`origin: 'fallback'`) on 404 or error.
 */
export async function loadAssets(
  baseUrl = '/nt-assets',
  opts?: LoadAssetsOptions,
): Promise<AssetBundle> {
  const preference: AssetModePreference = opts?.modePreference ?? getAssetModePreference();
  if (preference === 'builtin') {
    return createFallbackBundleWithOrigin();
  }

  // Prefer user's locally cached Steam assets from IndexedDB when available
  const cachedLocal = await loadCachedLocalBundle();
  if (cachedLocal) {
    return cachedLocal;
  }

  const cleanBase = normalizeBaseUrl(baseUrl);
  if (typeof fetch !== 'function') {
    return createFallbackBundleWithOrigin();
  }

  try {
    const res = await fetch(`${cleanBase}/manifest.json`, { cache: 'no-cache' });
    if (res.status === 204 || !res.ok) {
      return createFallbackBundleWithOrigin();
    }
    const rawText = await res.text();
    if (!rawText || !rawText.trim()) {
      return createFallbackBundleWithOrigin();
    }
    const manifest = JSON.parse(rawText) as AssetManifest & { available?: boolean };
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      manifest.available === false ||
      !Array.isArray(manifest.textures) ||
      !manifest.sprites
    ) {
      return createFallbackBundleWithOrigin();
    }

    const externalPages = manifest.textures.filter((page) => !page.embedded && Boolean(page.file));
    const textures = new Map<number, TextureImageSource>();

    if (externalPages.length > 0 && typeof Image !== 'undefined') {
      const loaded = await Promise.all(
        externalPages.map(async (page) => {
          const url = `${cleanBase}/${page.file.replace(/^\/+/, '')}`;
          const img = await loadImageElement(url);
          return { id: page.id, img };
        }),
      );
      for (const item of loaded) {
        textures.set(item.id, item.img);
      }
    }

    const origin: AssetBundleOrigin = manifest.sourceMode === 'steam' ? 'steam-server' : 'fallback';
    return createBundleFromManifest(manifest, textures, cleanBase, origin);
  } catch {
    return createFallbackBundleWithOrigin();
  }
}

/**
 * Node asset manifest loader for scripts, tests, and verification gates.
 * Reads `${rootDir}/.nt-assets/manifest.json` (or `${rootDir}/manifest.json`),
 * falling back to `createFallbackManifest()` if not present.
 * Uses Vite-ignored dynamic Node imports so browser bundles remain 100% DOM-safe.
 */
export async function loadManifestNode(rootDir?: string): Promise<AssetManifest> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return createFallbackManifest();
  }

  try {
    const fsModName = 'node:fs/promises';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as typeof import('node:fs/promises');
    const path = (await import(/* @vite-ignore */ pathModName)) as typeof import('node:path');

    const base = rootDir ? path.resolve(rootDir) : process.cwd();
    const candidates = [
      path.join(base, '.nt-assets', 'manifest.json'),
      path.join(base, 'manifest.json'),
    ];

    for (const candidate of candidates) {
      try {
        const raw = await fs.readFile(candidate, 'utf8');
        const parsed = JSON.parse(raw) as AssetManifest;
        if (parsed && typeof parsed === 'object' && parsed.sprites && Array.isArray(parsed.textures)) {
          return parsed;
        }
      } catch {
        // Try next candidate
      }
    }
  } catch {
    // Fall through to procedural fallback manifest
  }

  return createFallbackManifest();
}
