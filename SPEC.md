# Krunked Throne — Technical Specification

Canonical TypeScript contracts live in `src/contracts/index.ts`. All modules import shared types from `@/contracts`.

---

## 1. Simulation Constants & Action-Feel Invariants

- `SIM_HZ = 30`, `SIM_DT = 1 / 30`, `TILE_SIZE = 16`, `PLAYER_IFRAMES = 10`
- Logical canvas: `320x240` (4:3) or `426x240` (16:9 widescreen toggle), `imageSmoothingEnabled = false`, `image-rendering: pixelated`.
- Render frame pacing (`RenderSettings.targetFps: 30 | 60 | 120`, default `120`; `classic30Fps` synced as `targetFps === 30`):
  - **30 CLASSIC:** paced to `1/30 s` (~33.33 ms), `interpAlpha = 1`.
  - **60 SMOOTH:** paced to `1/60 s` (~16.67 ms), smooth `interpAlpha` across player, enemies, bosses, projectiles, lights, and camera.
  - **120 ULTRA:** paced up to `1/120 s` (~8.33 ms / native monitor rAF), smooth `interpAlpha`.
- Hitstop freeze: 1–4 ticks on crits/melee/kills/explosions while screenshake continues decaying.
- Camera look-ahead: `player + clamp((aimWorld - player) * 0.25, 48)` + directional recoil kick (`0.72x/tick` decay) + trauma-squared shake.
- Swept collision (`sweptRayTile`): zero wall tunneling at 40–120 px/tick; `moveCircleWithSlide`: zero wall embedding; `carveCircle`: dynamic wall destruction + autotile refresh.
- Portal vortex: carves safe radius, vacuums loose rads/pickups/weapons/chests, rolls over vacuumed rads into level-ups (`rolloverPlayerRads`), and transitions to `mutation_select` / `ultra_select` / next area.

---

## 2. Graphics Performance & Combat Juice Specification

- **Cached Offscreen Radial Glow Stamps (`src/render/glow-cache.ts`):** `GlowStampCache` pre-renders quantized radial glow stamps (`getGlowStamp(color, radius)`) and a reusable 128x128 darkness-carving mask stamp, replacing per-frame `createRadialGradient` calls in `LightingPass` and `GameRenderer` with hardware-accelerated `drawImage` blits.
- **Combat Juice & Telegraphs (`src/render/renderer.ts`, `src/ui/hud.ts`):**
  - Translucent dark pill backing (`rgba(10, 8, 16, 0.72)` + 1px border) behind the 5-ammo-pool HUD strip.
  - Directional projectile motion trails for bullets, shells, bolts, IDPD rounds, rockets, and glowing plasma/orbs.
  - Bright additive radial muzzle flash glows on ranged fire and expanding dual-ring explosion shockwaves.
  - Wall-stopped crimson laser sightlines for Sniper / Laser Crystal / Lightning Crystal aim telegraphs.
  - Pulsing emerald warning column with scrolling chevrons down the 7-3 carpet during **The Krunked Throne** mega-beam telegraph and beam wash.
  - Deterministic zero-GC screen-space biome ambient particles (desert dust motes, sewer drips, crystal cave sparkles, frozen snowflakes, lab sparks, palace rad embers).
- **Save Persistence (`src/ui/save.ts`):** Stored under `krunked_throne_save_v1` with automatic read fallback from legacy `nt_cleanroom_save_v1`, schema validation, corruption recovery, and bidirectional `targetFps` <-> `classic30Fps` synchronization.

---

## 3. Content Matrix & Custom Asset Pack Contract

- **12 Mutants (`src/data/mutants.ts`):** Fish, Crystal, Eyes, Melting, Plant, Y.V., Steroids, Robot, Chicken, Rebel, Horror, Rogue — full passives, actives, Throne Butt upgrades, A/B skins, and 24 Ultra Mutations.
- **29 Mutations & 13 Crowns (`src/data/mutations.ts`, `crowns.ts`):** Full roster with stacking synergies and crown modifiers.
- **142 Weapons (`src/data/weapons.ts`):** Melee + all 5 ammo pools (`bullet`, `shell`, `bolt`, `explosive`, `energy`), tiers 0–12, Golden, Cursed, and Ultra variants.
- **23 Areas, 50 Enemies & 5 Bosses (`src/data/areas.ts`, `enemies.ts`, `src/sim/ai/`):** Areas `1-1`..`7-3`, `0-1`, Vault, Secrets, Loops, dynamic darkness lighting, **Big Bandit (1-3)**, **Big Dog (3-3)**, **Lil' Hunter (5-3)**, **The Krunked Throne (7-3)** (internal id `nuclear_throne`; subtitle `THE END OF THE ROAD`; victory when generators intact vs `0-1` Loop portal when all 4 generators destroyed), and **Throne II (0-1 -> Loop 1-1)**.
- **Sprite Indexing Contracts:** `sprLogo` clamps permanently on final frame after intro; `sprBigPortrait` maps `(raceIndex - 1) * 2 + (skin === 'b' ? 1 : 0)`; `sprHealthFill` frame `0` = white hurt flash, frame `1` = crimson fill; Game Over fallback dead sprite uses final resting corpse frame (`frames.length - 1`).
- **Optional Custom Asset Packs (`src/assets/`):** Client-side folder picker parses compatible manifest/texture/audio layouts in-browser via `DataView`, caches in local IndexedDB, and toggles live on the Title screen.

---

## 4. Verification Commands & Debug Bridge

- `npm run play` / `npm run dev` — Local dev server at `http://localhost:4173/`.
- `npm run verify` — Runs `typecheck` + `test` + `verify:assets` + `verify:sim`.
- `npm run build` — Production static bundle (`dist/`, zero third-party assets).
- `window.__NT_DEBUG__` (`DebugBridge`) & dev-only `F9` Playtest Drawer (`src/app/debug-overlay.ts`): exposes live telemetry (`fps/targetFps`, `simHz`, entity counts), state hash, area warps, boss spawns, loadout/mutation helpers, god mode, `stepTicks`, and save controls.
