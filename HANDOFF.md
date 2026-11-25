# Krunked Throne — Project Checkpoint & Handoff

**Status:** Paused cleanly at user request (`2026-11-25`) — **98% through Round 2 (Mass Playtest + Visual & 1:1 Nuclear Throne Polish Pass)**.  
**Active Branch:** `main` (local commits ahead of `origin/main`; nothing pushed).  
**Local Steam Assets:** Extracted into gitignored `.nt-assets/` (`2,113` sprites, `11,673` TPAGs, `1,245` sounds, `6` bitmap fonts, `580` oracle objects) from `C:\Program Files (x86)\Steam\steamapps\common\Nuclear Throne` — **0 tracked IP violations** (`npm run verify:assets` passes in both default Steam mode and `--fallback` Built-In Art mode).

---

## 1. Completed & Merged on `main`

### Round 1 — Core 1:1 Mechanical & Structural Parity (`0f367f4..d2051f1`)
- Audited all 4 domains against local Steam `data.win`, `NTT-Objects.html`, and `lang-example.ini`.
- Fixed P0 exploits & broken mechanics (weapon drop/pickup infinite ammo/HP, Robot last-weapon dupe, Chicken throw dupe & headless death, Eyes inverted Monster Style, Y.V. Pop Pop/Back 2 Bizniz, Crystal shield beam reflection, Portal vacuum deleting pickups, Trigger Fingers both slots, Crown of Destiny frame-0 select, recursive `spawnExplosion` / Big Bandit prop-smash crashes, drained-event 2-1 manhole scan).
- Wired all 7 secret exits & Crown Vault (`1-?` Oasis, `2-?` Pizza Sewers, `3-?` Y.V.'s Mansion, `4-?` Cursed Crystal Caves, `5-?` Jungle, `vault` Crown Vault, `hq-1` IDPD HQ), fixed 50 enemy archetypes & all 5 bosses, fixed Steam `mus/`/`amb/`/`SOND` routing, added HTTP `204` dev middleware for optional `.nt-assets/manifest.json`, and fixed Options `Escape` rebind cancel + KBM cursor hide.

### Round 2 — Wave 1 (6-Playtester Live Assault) + Wave 2 (Full Visual/Art/Sim/Audio Overhaul) + Wave 3 (Live Re-Playtest) (`e0400ac..2d5cc68`)
All 6 Wave 2 overhaul branches merged cleanly with zero conflicts and re-verified live in Chromium across **both** Steam Pack (`2,113` sprites) and Built-In Art (`866` sprites) modes (`150/150` Vitest tests, `5/5` standalone selftests, Gate A Steam + Fallback, Gate B 5/5 soak pillars, production build, 0 console/page/network errors):
- **16-Bit Built-In Art Overhaul (`a83a457`)**:
  - Fixed `fntSmall` `V` vs `U` (`ACTIVE`/`PASSIVE`/`LV1`/`VOL`) and `Q` vs `0` glyphs.
  - Replaced noisy 16x16 grid/polka-dot tiles across all 16 biomes with calm **32x32** multi-variant slabs + seamless fused wall tops (eliminated Palace yellow-dot checkerboard & random red squares, Desert Lego studs, Scrapyard orange rust squares, Caves Venetian blinds, Frozen subway tiles, Campfire `(3,3)` dots, Vault neon-green `T`s, Pizza Sewers cyan puddles).
  - Authored **24 bespoke pixel-art Ultra icons**, **12 distinct mutant `sprCharSelect` silhouettes**, crisp 8x8 `sprKillsIcon`, neon-green Energy Sword, seamless `sprNothingBeam`, 2.5D fluted columns, carved emerald-rune Proto Statue, and 30+ missing biome/secret/portal/chest sprites (`866` sprites total on 1 texture page).
- **Renderer, 2.5D Depth, Lighting & Steam Sprite Parity (`d4071fb`)**:
  - Deleted 8px wall-top double-stamping and added solid wall-island masking + **true 2.5D wall/entity Y-sorting** (entities & props now tuck behind south wall roof overhangs).
  - Fixed chests flashing white `frame 1` nonstop (now idle `frame 0` with periodic glint), fixed `7-3` single clipped `sprCarpet` + composite Nuclear Throne (`sprNothingBack`/`Pipes`/`Leg`) + inward-facing East/West `sprBigGenerator` + sleeping `sprNothingOff`/`sprScrapBossSleep`.
  - Cured additive `lighter` bloom washout with clamped radial falloff & crisp pixel-stepped blast rings/smoke puffs; unified Throne Mega-Beam, hitscan lasers (`beamOriginX/Y`, 5-beam green `ultra_laser_pistol`), and ramped Horror Rad Beam.
  - Deduplicated & HUD-clamped floating text (`y >= 42`), suppressed portal loading card behind menus, added distinct secret portals (`1-?` blue, `vault` green `sprProtoPortal`, `hq-1` blue `sprPopoPortal`), fixed Melting 2/2 HP false low-HP vignette, and stabilized `camera.screenToWorld` under recoil/shake (`0.000px` drift).
- **UI, Campfire, HUD, Boss Intro & Menus Redesign (`03a1835`)**:
  - Redesigned Campfire with atmospheric tiled wasteland campsite, `1.0x` integer mutants (fixing 0.5x Horror & 0.75x mixels), dynamic non-overlapping details layout (Rogue/Horror fixed), tight `96x80` portrait, full Crown name + effect bar, and Golden Weapon display.
  - Fixed black-wiped Rad Canister (`sprExpBarLevel` now drawn *behind* `sprExpBar`), added opaque full-screen Boss Intro splash hiding HUD during intro, secondary Steroids HUD reload bar, readable 0-ammo icons, `PORTAL_INDICATOR_PAD_TOP = 44`, keybind conflict swap, Pause keyboard mutation inspect, and authentic Game Over killer portrait/Vault/Loop road map.
- **Combat, Cause-of-Death, Weapons, Secrets, Vault & Bosses (`26d7ede`, `de9fc10`)**:
  - Animated enemy corpses (`stepCorpses` advances to dark resting frame 5; zero pure-white frame-0 corpses) + `prevX/prevY` 60/120 FPS interpolation + hitstop `syncPrevPositions` (zero sawtooth jitter).
  - Authentic killer names & sprites across all ranged, explosive, melee, hazard, and boss deaths (no more generic `PROJECTILE`/`EXPLOSION` or Ammo Mimic -> `ASSASSIN`); restored lethal `isRad` boss/toxic explosions (honoring Boiling Veins).
  - Fixed Shovel/Ultra Shovel 3x/5x multi-hit via shared `hitIds`, Horror TB odd-tick heal & immediate post-beam rad attraction, solid prop collisions, biome terrain traction (`extra_feet` immunity), Steroids TB infinite-ammo exploit, Shotgun Shoulders enemy guard, enemy weapon drop tiers, Crown of Life + Steroids B heal softlock, Gamma Guts contact reliability, Scarier Face boss HUD sync, `collectPickupsAndChests` splice crash, 3-1 Golden Car screwdriver protection, Proto Statue `210px` rad suction, 5-1 Ice Flower `sprIceFlowerIdle` + replacement mutation, Vault immediate Crown effects + North Alcove exit portal, authentic biome props across all 16 biomes, Lil' Hunter delayed drop-in + visible lethal `death_spiral`, Boss Intro 45-tick combat pause, and intact-gen broken Throne sit-to-win (`sprThroneCorpseIdle`).
- **Audio, Input & GameApp (`5daf081`)**:
  - Fixed Chromium W3C PointerEvents chorded LMB+RMB drop & stuck-button bug (`PointerEvent.buttons` bitmask) — Steroids dual-wield verified rock-solid live.
  - Fixed Built-In Art reload probe (`HEAD /nt-assets/manifest.json`), removed false `sndEnemyAlert -> sndSniperTarget` alias, preloaded Campfire/menu/swap/reload SFX + lazy-loaded `manifest.looseSounds` (`snd/*.ogg`), eliminated music double-fetches, added `3-3` silent sleep & `mutation_select` `amb/0b` routing, deduplicated player death SFX, buffered rapid menu nav keys, and trimmed Built-In Synth headroom to `<= 0.65` peak (`0` clipped samples).

### Round 2 — Wave 3.5 Surgical Polish (5 of 6 Merged onto `main` @ `8621f8e`)
- **`af006f4` (`art-overhaul`)**: Fixed P0 Built-In Title `PLAY` 8px upward offset (`fntL` `lineHeight: 8, ascender: 7`), brightened Built-In `sprEnergySlash`/`sprSlash` with pure-white rim + emerald core, softened `0-1`/Caves floor craters & `sprWall3/6/7Top` dash rhythm.
- **`4d46b77` (`render-vfx-polish`)**: Fixed `buildWallRenderMask` Pass-1-first BFS (seals enclosed `1x2` sewer wall pockets), renders Built-In `sprPalacePillar` in Palace/Vault while keeping Steam `sprPillar`, guarded Vault `sprCrownPedIdle` against `sprProtoStatueHurt` flash, fixed `WARPING TO CROWN VAULT` text, scaled `sprRogueStrike` reticle 1:1 to blast span, and skipped empty `prop.sprite === ''` draws.
- **`64c073e` (`sim-combat-polish`)**: Lengthened Rogue Portal Strike telegraph (`15 + b * 4` ticks) + un-dragged `safeStandoff` (eliminating 90ms close-cursor self-damage), and excluded `'vault'` from spawning extra regular chests.
- **`ee0aef7` (`sim-world-polish`)**: Gated Vault `[E] SWITCH CROWN` prompt until both Crown Guardians are defeated, extended Loop 1 `idpd_van` open boarding window to `150` ticks (5s) with prompt-only `sprite: ''` anchor, tightened `7-3` sleeping Throne wake distance (`150px` so silent `sprNothingOff` is visible on screen), and removed stray `hq-1` carpet.
- **`5952e9b` (`audio-input-app`)**: Deferred buffered menu `confirm` when a directional nav fires on the same frame (`3x ArrowDown + Enter` now executes cleanly), added safe `CROWNS[id] ?? CROWNS.none` / `MUTANTS[id] ?? MUTANTS.fish` fallbacks in `data-adapter.ts`, and aligned `tests/input-controls.test.ts` Campfire `Y` golden-weapon test.
- Verified `npm run typecheck` (`tsc --noEmit`) **PASS (0 errors)** on `8621f8e`.

---

## 2. In-Flight / Remaining Work When You Return

### Step 1 — Finish & Merge the 1 Remaining Wave 3.5 Branch (`ui-menus-polish`)
Worker `ui-menus-polish` had already modified `src/ui/hud.ts`, `src/ui/menus.ts`, and `tests/parity-render-ui.test.ts` inside its preserved share worktree (`C:\Users\alexg\.gemini\antigravity\worktrees\03c82d5a-031a-4562-bce5-7df9487d5ae1\swarm-ui-menus-polish-8edb959e`) for the final 5 UI polish items from Wave 3:
1. Built-In Boss Intro (`src/ui/hud.ts:1280, 1308-1310`): cap nameplate `bandW`, shift `bossSprX`, draw boss after splat so Big Bandit isn't sliced in half.
2. HUD active weapon label (`src/ui/hud.ts:600-638`): prevent `TRIPLE MACHINEG.` from touching the left yellow accent stripe, and hide top HUD during `portal_transition && portal.entered`.
3. 16:9 Steam Title `bakMenu` (`src/ui/menus.ts`): extend sky/horizon left & right of 320px center to eliminate black vertical widescreen pillar bars.
4. 4:3 Campfire Crown bar (`src/ui/menus.ts:2310-2325`): keep `statusInfo` strictly 1 line inside the 11px bar so `[GOLDEN ...]` never wraps out of bounds.
5. Options Keybinds `ESC TO CANCEL` hint box 2–3px bottom padding + Campfire gamepad `Y` `hasGold` guard (`src/ui/menus.ts:677`).

*(Note: verify `ui-menus-polish`'s uncommitted diff, run tests, commit, and merge into `main`!)*

### Step 2 — Full Integrated Verification & Wave 4 Targeted Live Re-Check
1. Run full gates on `main` after landing `ui-menus-polish`:
   - `npm run verify` (`tsc --noEmit`, all 10 Vitest files, Gate A Steam, Gate B 5/5 soak)
   - `npx tsx scripts/verify/verify-assets.ts --fallback`
   - All 5 standalone selftests (`src/sim/core/selftest.ts`, `combat/selftest.ts`, `ai/selftest.ts`, `ui/selftest.ts`, `audio/selftest.ts`)
   - `npm run build`
2. Quick live Chromium spot-check in **both** Steam Pack & Built-In Art modes confirming all Wave 3.5 fixes visually (Title `PLAY` alignment + 16:9 `bakMenu` full-bleed, Built-In Boss Intro, 4:3 Campfire Crown bar, HUD weapon label, Sewers enclosed wall pocket, Built-In Palace pillars, Vault pedestal prompt gating & `WARPING TO CROWN VAULT`, Loop 1 5s van boarding, 7-3 visible sleeping Throne wake, Rogue 90ms click + aligned `sprRogueStrike`, rapid `3x ArrowDown + Enter`).

### Step 3 — Optional Deep-Parity Backlog (If You Want Another Pass Later)
- **Visual P2s**: Snugger Steam Campfire `sprLogMenu` seating, brighter Game Over metallic weapon card backing, splat-styled Title secondary buttons.
- **Content Expansion**: Playable **Y.V.'s Crib (`Area 107` / `$$$`)** with Yung Cuz & Giant Chests, Horror's 3rd Ultra (`MELTDOWN`), multi-floor IDPD HQ (`hq-2`/`hq-3` + Captain), and Loop-exclusive bosses/enemies (Mom, Hyper Crystal, Technomancer, Snow Bandit, Jock, Bonefish, Crab, Jungle Fly, Elite IDPD).

---

## 3. Useful Commands
```bash
npm run play                                    # Local dev server at http://localhost:4173/ (uses .nt-assets/ if present, toggleable on Title)
npm run verify                                  # Typecheck + Vitest + Gate A (asset hygiene) + Gate B (16-area campaign soak)
npx tsx scripts/verify/verify-assets.ts --fallback  # Verify Built-In Art Pack (866 sprites, 0 violations)
npm run build                                   # Production static bundle (dist/)
```
