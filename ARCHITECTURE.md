# Krunked Throne — Architecture

## 1. Mission & Standalone IP Boundary

**Krunked Throne** (`krunked-throne`) is a standalone TypeScript + HTML5 Canvas 2D + Web Audio 16-bit wasteland action roguelike engineered around a pure, deterministic 30 Hz combat simulation and a high-refresh **30 / 60 / 120 FPS** pixel renderer.

**Strict asset boundary:**
- Zero copyrighted third-party binaries, sprites, texture sheets, or audio buffers are staged, committed, or published to GitHub or GitHub Pages.
- Out of the box, `src/assets/` builds the complete original **Krunked Art Pack** (multi-page pixel-art atlases + 6 bitmap fonts) and `src/audio/` drives a 20-track original Web Audio synth soundtrack + SFX engine.
- Users may optionally load a compatible local custom asset pack strictly client-side via the Title screen **`LOAD CUSTOM PACK`** folder picker (cached in local IndexedDB) or local dev middleware (`/nt-assets/*` serving gitignored `.nt-assets/`).

## 2. Module Topology

```
src/
  contracts/index.ts       Canonical shared TypeScript interfaces & constants (30 Hz, 30/60/120 TargetFps, tile/canvas sizes)
  assets/                  Built-in Krunked Art Pack generator, browser custom pack parser, IndexedDB cache, AssetLoader
  audio/                   Web Audio SFX/Music/Ambience engine, pitch jitter, voice/cooldown caps, procedural synth sequencer
  data/                    Static registries: 12 mutants, 29 mutations, 24 ultras, 142 weapons, 50 enemies, 13 crowns, 23 areas
  sim/
    core/                  SeededRng (Mulberry32), FNV-1a state hash, corpse/casing/particle/pickup/portal physics
    collision/             Axis-separated circle-slide, DDA/substep sweptRayTile (zero tunnel), wall carving & 2.5D autotile
    worldgen/              Drunken-walker biome level generator (Areas 1-1..7-3, 0-1, Vault, Secrets, Loops) + BFS connectivity
    combat/                Player movement/abilities, firing/bursts, swept projectiles, melee deflection, explosions
    progression/           Run init, area transitions, rad XP/level-up, mutation/ultra decks, chests, crowns, portal triggers
    entities/              Safe area spawner, biome props, 4 Palace Generators, Mimics, IDPD wave scheduler
    ai/                    50-archetype enemy AI, 5 multi-phase bosses, canonical 30 Hz stepSimulation() & warpToArea()
  render/                  320x240 / 426x240 pixel renderer, GlowStampCache, persistent FloorBuffer, 2.5D walls, CameraController, LightingPass, BitmapFontRenderer
  input/                   WASD/Arrows, Mouse client->logical->world, Gamepad API, rebindable keys
  ui/                      HudRenderer, MenuSystem (Title/Campfire/Mutation/Pause/Options/GameOver/Victory), SaveManager (`krunked_throne_save_v1`), UiDataProvider
  app/                     GameApp fixed-step 30 Hz sim + 30/60/120 FPS frame-paced render loop, data-adapter, window.__NT_DEBUG__ bridge, dev-only F9 Playtest Drawer
  main.ts                  DOM bootstrap entry point

tools/                     Optional local CLI asset pack extractor & metadata dumper
tests/                     Vitest unit & integration suites (simcore, audio, assets, gameplay, ui-save)
scripts/verify/            Asset hygiene gate (verify-assets.ts) & headless 16-area campaign soak (verify-sim.ts)
.github/workflows/ci.yml   CI verification (hygiene, typecheck, tests, verify, build) + GitHub Pages deploy
```

## 3. Simulation vs. Presentation Separation

1. **`src/sim/**` and `src/data/**` are 100% pure and DOM-free.** Zero access to `window`, `document`, `CanvasRenderingContext2D`, `AudioContext`, or `Math.random()`.
2. **Locked 30 Hz Simulation:** `stepSimulation(state, input)` advances by `SIM_DT = 1 / 30` with frame-exact reloads, 10-tick iframes, 1–4 tick hitstop freeze, directional recoil kick decay (`0.72x/tick`), and corpse friction.
3. **Deterministic PRNG & Replay:** All randomness flows through `SeededRng` stored in `SimState.rngState`. Identical `(seed, mutant, crown, InputFrame[])` produces bit-for-bit identical `hashSimState()` outputs.
4. **Event Bus (`SimState.events`):** `GameApp` drains emitted `SimEvent[]` after each 30 Hz step and dispatches them to `GameRenderer` (floor scars, screenshake, radial muzzle flashes, explosion shockwaves, floating text, particles) and `AudioEngine` (spatial SFX, dynamic music/ambience).
5. **30 / 60 / 120 FPS Frame-Paced Rendering:** `GameApp` paces canvas draws to `save.render.targetFps` (`30 | 60 | 120`, default `120`) while keeping simulation locked at 30 Hz. At 60/120 FPS, player, enemies, bosses, projectiles, dynamic lights, and camera smoothly interpolate via `interpAlpha`; at 30 FPS, `interpAlpha` snaps to `1`. Pre-rendered `GlowStampCache` offscreen stamps eliminate per-frame `createRadialGradient` bottlenecks during dense plasma barrages.
