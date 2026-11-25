import type { AreaCode, InputFrame, SimState } from '@/contracts';
import {
  SeededRng,
  rolloverPlayerRads,
  stepCasings,
  stepCorpses,
  stepParticles,
  stepPickups,
  stepPortal,
} from '@/sim/core';
import { stepPlayerAndCombat } from '@/sim/combat';
import {
  applyMutationSelection,
  checkPortalTrigger,
  loadAreaIntoState,
} from '@/sim/progression';
import { populateAreaEntities } from '@/sim/entities';
import { stepEntitiesAndAi } from './enemies';

function decayCameraEffects(state: SimState): void {
  state.cameraShake = Math.max(0, state.cameraShake * 0.85 - 0.01);
  if (state.cameraShake < 0.004) state.cameraShake = 0;
  // Exact Vlambeer kick decay: 0.72 per tick (SPEC.md)
  state.cameraKickX *= 0.72;
  state.cameraKickY *= 0.72;
  if (Math.abs(state.cameraKickX) < 0.02) state.cameraKickX = 0;
  if (Math.abs(state.cameraKickY) < 0.02) state.cameraKickY = 0;
}

function absorbShakeEvents(state: SimState, startIndex: number): void {
  for (let i = startIndex; i < state.events.length; i++) {
    const ev = state.events[i]!;
    if (ev.type === 'shake') {
      state.cameraShake = Math.min(1, state.cameraShake + ev.trauma);
      if (ev.kick && ev.dirX !== undefined && ev.dirY !== undefined) {
        state.cameraKickX += ev.dirX * ev.kick;
        state.cameraKickY += ev.dirY * ev.kick;
      }
    }
  }
}

/**
 * Canonical locked 30 Hz simulation tick for Nuclear Throne Clean-Room Engine.
 * 100% pure, DOM-free, deterministic (all randomness via SeededRng).
 */
export function stepSimulation(state: SimState, input: InputFrame): void {
  const eventStartIndex = state.events.length;

  // Clear one-shot floor rebuild flag after initial frame so FloorBuffer keeps battle scars
  if (state.tick > 0 && state.floorClearTrigger) {
    state.floorClearTrigger = false;
  }

  // 1. Always decay camera shake & directional weapon kick even during hitstop/menus
  decayCameraEffects(state);

  // 2. Terminal or menu-selection phases
  if (state.phase === 'game_over' || state.phase === 'victory_throne') {
    state.tick += 1;
    return;
  }

  if (state.phase === 'mutation_select' || state.phase === 'ultra_select') {
    if (input.selectIndex !== undefined) {
      const rng = SeededRng.fromState(state.rngState);
      const prevMap = state.map;
      state.rngState = rng.getState();
      applyMutationSelection(state, input.selectIndex, rng, populateAreaEntities);
      // Only overwrite rngState if applyMutationSelection didn't load a brand-new area
      if (state.map === prevMap) {
        state.rngState = rng.getState();
      }
    }
    state.tick += 1;
    absorbShakeEvents(state, eventStartIndex);
    return;
  }

  // 3. Hitstop freeze: keep screenshake decaying while freezing all entity motion!
  if (state.hitstopTicks > 0) {
    state.hitstopTicks -= 1;
    state.tick += 1;
    state.stats.timeTicks += 1;
    return;
  }

  // 4. Restore deterministic PRNG from SimState
  const rng = SeededRng.fromState(state.rngState);

  if (state.phase === 'playing') {
    // Player movement, aiming, weapons, mutant actives, snare traps, friendly allies, pickups & swept projectiles
    stepPlayerAndCombat(state, input, rng);

    // Hostile enemies, all 5 Bosses, special death payoffs, destructible props, IDPD waves & contact damage
    // (stepFriendlies=false because stepPlayerAndCombat already stepped Rebel Allies & Plant Saplings!)
    stepEntitiesAndAi(state, rng, { stepFriendlies: false });

    // Core world physics: pickups magnetism, sliding corpses, bouncing casings, particles, portal vortex
    stepPickups(state);
    stepCorpses(state);
    stepCasings(state);
    stepParticles(state);
    stepPortal(state);
  } else if (state.phase === 'portal_transition') {
    stepCorpses(state);
    stepCasings(state);
    stepParticles(state);
    stepPortal(state);
  }

  // Ensure any Portal-vacuumed (or otherwise accumulated) rads roll over into level-ups
  // immediately before portal transition evaluates `pendingLevelUps`.
  rolloverPlayerRads(state);

  // 5. Persist RNG state BEFORE checkPortalTrigger (which may invoke loadAreaIntoState!)
  state.rngState = rng.getState();
  const portalOutcome = checkPortalTrigger(state, rng, populateAreaEntities);
  if (portalOutcome !== 'area_loaded') {
    state.rngState = rng.getState();
  }

  // 6. Sync any emitted shake events & advance canonical 30 Hz clock
  absorbShakeEvents(state, eventStartIndex);
  state.tick += 1;
  state.stats.timeTicks += 1;
}

/**
 * Warps `state` cleanly into any AreaCode (and optional loop) using `loadAreaIntoState` + `populateAreaEntities`.
 */
export function warpToArea(
  state: SimState,
  areaCode: AreaCode,
  loop?: number,
): void {
  loadAreaIntoState(state, areaCode, loop, populateAreaEntities);
}
