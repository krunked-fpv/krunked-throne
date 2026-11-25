import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFallbackBundle, createFallbackManifest, loadManifestNode } from '@/assets';
import { AREAS, CROWNS, ENEMIES, MUTANTS, MUTATIONS, ULTRAS, WEAPONS } from '@/data';
import {
  BitmapFontRenderer,
  NT_COLOR_TOKENS,
  measureText,
  parseMarkupLines,
  stripMarkup,
  wrapMarkupText,
} from '@/render';

const CORE_FONTS = ['fntChat', 'fntL', 'fntM0', 'fntM1', 'fntM1x', 'fntSmall'] as const;

function findSteamAssetsRoot(): string | null {
  if (process.env.NT_FORCE_FALLBACK === '1') {
    return null;
  }
  const cwdCandidate = process.cwd();
  if (fs.existsSync(path.join(cwdCandidate, '.nt-assets', 'manifest.json'))) {
    return cwdCandidate;
  }
  return null;
}

describe('assets: Procedural Fallback Manifest Integrity', () => {
  it('builds a valid, self-consistent fallback manifest with in-bounds TPAGs and 6 bitmap fonts', () => {
    const manifest = createFallbackManifest();
    expect(manifest.sourceMode).toBe('fallback');
    expect(manifest.textures.length).toBeGreaterThanOrEqual(1);
    const tex = manifest.textures[0]!;
    expect(tex.width).toBeGreaterThan(0);
    expect(tex.height).toBeGreaterThan(0);

    const spriteKeys = Object.keys(manifest.sprites);
    expect(manifest.spritesById.length).toBe(spriteKeys.length);
    expect(manifest.stats.spriteCount).toBe(spriteKeys.length);

    for (const spr of Object.values(manifest.sprites)) {
      expect(spr.frames.length).toBeGreaterThan(0);
      for (const f of spr.frames) {
        expect(f.textureId).toBe(0);
        expect(f.srcX).toBeGreaterThanOrEqual(0);
        expect(f.srcY).toBeGreaterThanOrEqual(0);
        expect(f.srcX + f.srcW).toBeLessThanOrEqual(tex.width);
        expect(f.srcY + f.srcH).toBeLessThanOrEqual(tex.height);
      }
    }

    for (const fontName of CORE_FONTS) {
      const font = manifest.fonts[fontName];
      expect(font).toBeDefined();
      expect(font!.tpag.srcX + font!.tpag.srcW).toBeLessThanOrEqual(tex.width);
      expect(font!.tpag.srcY + font!.tpag.srcH).toBeLessThanOrEqual(tex.height);
      for (let code = 32; code <= 126; code++) {
        expect(font!.glyphs[code]).toBeDefined();
      }
    }

    for (const obj of Object.values(manifest.objects)) {
      if (obj.spriteName) {
        expect(manifest.sprites[obj.spriteName]).toBeDefined();
      }
    }

    const bundle = createFallbackBundle();
    expect(bundle.sourceMode).toBe('fallback');
    expect(bundle.getSprite('sprMutant1Idle')).toBeDefined();
    expect(bundle.getFont('fntM1')).toBeDefined();
  });
});

describe('assets: Steam Manifest Verification (when present locally)', () => {
  const steamRoot = findSteamAssetsRoot();

  it('loads Steam manifest and resolves all data registry sprites, sounds, music, ambience, and fonts', async () => {
    if (!steamRoot) {
      // CI without local Steam install gracefully exercises fallback path
      const fallback = await loadManifestNode(path.join(process.cwd(), '__nonexistent_dir__'));
      expect(fallback.sourceMode).toBe('fallback');
      return;
    }

    const manifest = await loadManifestNode(steamRoot);
    expect(manifest.sourceMode).toBe('steam');
    expect(manifest.stats.spriteCount).toBe(2113);
    expect(manifest.stats.tpagCount).toBe(11673);
    expect(manifest.stats.objectCount).toBe(564);
    expect(manifest.stats.soundCount).toBe(1245);
    expect(manifest.stats.fontCount).toBe(6);

    for (const w of Object.values(WEAPONS)) {
      expect(manifest.sprites[w.sprite], `Missing weapon sprite ${w.sprite}`).toBeDefined();
      if (w.projectileSprite) {
        expect(manifest.sprites[w.projectileSprite], `Missing proj sprite ${w.projectileSprite}`).toBeDefined();
      }
      expect(manifest.sounds[w.fireSound], `Missing weapon sound ${w.fireSound}`).toBeDefined();
    }
    for (const m of Object.values(MUTANTS)) {
      for (const spr of Object.values(m.sprites)) {
        if (spr) expect(manifest.sprites[spr], `Missing mutant sprite ${spr}`).toBeDefined();
      }
      for (const snd of Object.values(m.sounds)) {
        if (snd) expect(manifest.sounds[snd], `Missing mutant sound ${snd}`).toBeDefined();
      }
    }
    for (const mut of Object.values(MUTATIONS)) {
      expect(manifest.sprites[mut.sprite]).toBeDefined();
      expect(manifest.sprites[mut.hudSprite]).toBeDefined();
    }
    for (const u of Object.values(ULTRAS)) {
      expect(manifest.sprites[u.sprite]).toBeDefined();
    }
    for (const c of Object.values(CROWNS)) {
      expect(manifest.sprites[c.spriteIdle]).toBeDefined();
      expect(manifest.sprites[c.spriteWalk]).toBeDefined();
    }
    for (const a of Object.values(AREAS)) {
      expect(manifest.sprites[a.floorSprite]).toBeDefined();
      expect(manifest.sprites[a.wallTopSprite]).toBeDefined();
      expect(manifest.music[a.musicTrack]).toBeDefined();
      expect(manifest.ambience[a.ambienceTrack]).toBeDefined();
    }
    for (const e of Object.values(ENEMIES)) {
      for (const spr of Object.values(e.sprites)) {
        if (spr) expect(manifest.sprites[spr], `Missing enemy sprite ${spr}`).toBeDefined();
      }
      for (const snd of Object.values(e.sounds)) {
        if (snd) expect(manifest.sounds[snd], `Missing enemy sound ${snd}`).toBeDefined();
      }
    }
  });
});

describe('assets: Bitmap Font Markup & Width Measurement', () => {
  it('parses and strips Krunked Throne color and newline tokens accurately', () => {
    const sample = '@wHP @r2/8@s#@gRADS @y100 @bBLUE @pULTRA @dDIM@@100\\#1';
    expect(stripMarkup(sample)).toBe('HP 2/8\nRADS 100 BLUE ULTRA DIM@100#1');

    const lines = parseMarkupLines(sample, '#eeeeee');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.runs).toEqual([
      { text: 'HP ', color: NT_COLOR_TOKENS.w },
      { text: '2/8', color: NT_COLOR_TOKENS.r },
    ]);
    expect(lines[1]!.runs).toEqual([
      { text: 'RADS ', color: NT_COLOR_TOKENS.g },
      { text: '100 ', color: NT_COLOR_TOKENS.y },
      { text: 'BLUE ', color: NT_COLOR_TOKENS.b },
      { text: 'ULTRA ', color: NT_COLOR_TOKENS.p },
      { text: 'DIM@100#1', color: NT_COLOR_TOKENS.d },
    ]);

    const reset = parseMarkupLines('@rRED@sBASE', '#123456');
    expect(reset[0]!.runs).toEqual([
      { text: 'RED', color: NT_COLOR_TOKENS.r },
      { text: 'BASE', color: '#123456' },
    ]);
  });

  it('measures font hierarchy, zero-width markup, wrapping, and custom pack glyphs accurately', async () => {
    const fbBundle = createFallbackBundle();
    const fbRenderer = new BitmapFontRenderer(fbBundle);

    const fbSmall = fbRenderer.measure('KRUNKED', 'fntSmall');
    const fbM1 = fbRenderer.measure('KRUNKED', 'fntM1');
    const fbL = fbRenderer.measure('KRUNKED', 'fntL');
    expect(fbSmall.width).toBeLessThan(fbM1.width);
    expect(fbM1.width).toBeLessThan(fbL.width);

    // Markup tokens add zero rendered width
    expect(fbRenderer.measure('@rKRU@gNK@yED@s', 'fntM1').width).toBe(fbM1.width);

    // Multi-line '#' height check & word wrapping
    const twoLines = fbRenderer.measure('LINE1#LINE2', 'fntM1');
    expect(twoLines.lineWidths).toHaveLength(2);
    expect(twoLines.height).toBeGreaterThan(twoLines.lineHeight);

    const wrapped = wrapMarkupText(fbBundle.getFont('fntM1'), '@wTHE KRUNKED THRONE AWAITS', 60);
    expect(wrapped.length).toBeGreaterThan(1);

    // Undefined font monospace fallback
    expect(measureText(undefined, 'KRUNKED').width).toBe(7 * 6);

    // If local custom manifest exists, verify its bitmap font metrics too
    const steamRoot = findSteamAssetsRoot();
    if (steamRoot) {
      const steamManifest = await loadManifestNode(steamRoot);
      const sSmall = measureText(steamManifest.fonts.fntSmall, 'KRUNKED');
      const sM1 = measureText(steamManifest.fonts.fntM1, 'KRUNKED');
      const sL = measureText(steamManifest.fonts.fntL, 'KRUNKED');
      expect(sSmall.width).toBeLessThan(sM1.width);
      expect(sM1.width).toBeLessThan(sL.width);
      expect(measureText(steamManifest.fonts.fntM1, '@gKRU@wNKED').width).toBe(sM1.width);
    }
  });
});
