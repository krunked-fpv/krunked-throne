# Krunked Throne — Sprint Handoff

## Shipped Capabilities
**Krunked Throne** (`krunked-throne`) is a 100% original standalone 16-bit wasteland action roguelike (TypeScript + Vite + HTML5 Canvas 2D + Web Audio API) featuring a locked 30 Hz deterministic simulation, selectable **30 / 60 / 120 FPS** interpolated rendering, built-in pixel art and procedural synth music, and an optional client-side custom pack loader.

- **Original Art, Audio & Rebrand (`src/assets/`, `src/audio/`, `src/ui/`, `src/data/enemies.ts`):** Rebranded across Title (`KRUNKED THRONE`, `ORIGINAL 16-BIT WASTELAND ACTION`), End screens, Boss 7-3 (`THE KRUNKED THRONE` / `THE END OF THE ROAD`), `package.json`, `index.html`, and `SaveManager` (`krunked_throne_save_v1` with legacy key migration). Includes Game Over resting corpse-frame fix and clean custom-pack Title toggle (`LOAD CUSTOM PACK` / `USE CUSTOM PACK` / `USE BUILT-IN ART` / `LOAD FOLDER`).
- **30 / 60 / 120 FPS Engine (`src/contracts/`, `src/ui/save.ts`, `src/ui/menus.ts`, `src/app/game-app.ts`):** Added `RenderSettings.targetFps: 30 | 60 | 120` (default `120`, synced bidirectionally with `classic30Fps`), 3-state Options toggle (`30 CLASSIC` / `60 SMOOTH` / `120 ULTRA`), true frame-paced rendering decoupled from fixed 30 Hz simulation, and `fps/targetFps` reporting in HUD and `F9` telemetry.
- **120 FPS Render Performance & Combat Juice (`src/render/glow-cache.ts`, `lighting.ts`, `renderer.ts`, `src/ui/hud.ts`):** Replaced per-frame `createRadialGradient` calls with cached offscreen glow/mask stamps (`GlowStampCache`), added smooth interpolation across entities/projectiles/lights/camera, translucent backed 5-ammo-pool HUD pill, projectile motion trails, radial muzzle flashes, expanding explosion shockwaves, wall-stopped crimson Sniper/Crystal laser sightlines, pulsing emerald 7-3 carpet beam warning column, and zero-GC biome ambient particles.

## Commands
```bash
npm install
npm run play      # Launch locally at http://localhost:4173/
npm run verify    # Typecheck + Vitest + asset hygiene + 16-area sim soak
npm run build     # Production static bundle (dist/)
```

## Next-Sprint Opportunities
- Online lockstep co-op netcode, Daily/Weekly seeded runs, mod/pack scripting API, and expanded biome secrets.
