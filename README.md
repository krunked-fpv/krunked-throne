# KRUNKED THRONE

**Krunked Throne** (`krunked-throne`) is a 100% original standalone 16-bit wasteland top-down action roguelike built with TypeScript, HTML5 Canvas 2D, and Web Audio API. It ships ready to play with a complete built-in pixel-art pack, procedural wasteland synth soundtrack, locked 30 Hz deterministic simulation, and selectable **30 / 60 / 120 FPS** interpolated rendering — plus an optional client-side **Custom Asset Pack** folder loader cached locally in IndexedDB.

> **100% Original Standalone IP:** Zero copyrighted third-party binaries, sprites, or audio files are included in this repository or published to GitHub Pages. Optional user-supplied custom asset packs stay strictly client-side in your browser's local IndexedDB (or gitignored `.nt-assets/` during local development).

## Highlights

- **Original 16-Bit Art & Synth Soundtrack:** Built-in Krunked Art Pack (818 original sprites across multi-page atlases) covering the animated Title emblem, 12 distinct mutants (A/B skins + 24 portraits), 29 mutations, 24 ultras, 13 crowns, 16 biome tile/wall sets, 142 weapons, 50 enemies, and 5 multi-phase bosses culminating in **The Krunked Throne**, paired with a 20-track original procedural Web Audio soundtrack & punchy retro SFX engine.
- **30 / 60 / 120 FPS Engine:** Deterministic 30 Hz combat simulation (`SIM_DT = 1 / 30`) decoupled from a true frame-paced **30 CLASSIC / 60 SMOOTH / 120 ULTRA** renderer (default **120 FPS**) with smooth entity/projectile/camera interpolation and cached offscreen radial glow stamps for silky-smooth plasma barrages.
- **Combat Juice & Visual Readability:** Projectile motion tracers, radial muzzle flash glows, expanding explosion shockwave rings, wall-stopped crimson laser sightlines, pulsing emerald carpet beam telegraphs on 7-3, subtle zero-GC biome ambient particles, and a high-contrast backed 5-ammo-pool HUD.
- **Optional Custom Pack Loader:** Click **`LOAD CUSTOM PACK`** on the Title screen to load a compatible local asset pack folder client-side, persist it in local IndexedDB, and hot-swap live between **`USE CUSTOM PACK`** and **`USE BUILT-IN ART`**.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Launch locally at http://localhost:4173/
npm run play
```

## Verification & Build Commands

```bash
npm run typecheck      # Strict TypeScript check
npm run test           # Vitest unit & determinism test suite
npm run verify:assets  # Asset manifest integrity & legal hygiene gate
npm run verify:sim     # Headless 16-area campaign soak (1-1..7-3, Throne II, Loop 1)
npm run verify         # Full verification suite
npm run build          # Production static bundle (dist/)
```

## Documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System topology, simulation/presentation decoupling, and module boundaries
- [SPEC.md](./SPEC.md) — 30 Hz simulation invariants, 30/60/120 FPS pacing, content matrix, and asset contracts
- [HANDOFF.md](./HANDOFF.md) — Concise sprint handoff & next-step roadmap
- [src/contracts/index.ts](./src/contracts/index.ts) — Canonical shared TypeScript interfaces
