import type { AreaCode, InputFrame, SimState } from '@/contracts';
import { CROWNS, CROWN_IDS } from '@/data';
import {
  SeededRng,
  emitEvent,
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
import { getAreaRuntime, getRunRuntime, populateAreaEntities } from '@/sim/entities';
import { openBossPortal, triggerThroneVictory } from './bosses';
import { stepEntitiesAndAi } from './enemies';

/**
 * Syncs prevX/prevY to current x/y across all interpolated entities so 60/120 FPS rendering
 * stays rock-solid frozen (zero sawtooth jitter) during hitstop frames and boss intro pauses.
 */
function syncPrevPositions(state: SimState): void {
  state.player.prevX = state.player.x;
  state.player.prevY = state.player.y;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    e.prevX = e.x;
    e.prevY = e.y;
  }
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i]!;
    pr.prevX = pr.x;
    pr.prevY = pr.y;
  }
  for (let i = 0; i < state.corpses.length; i++) {
    const c = state.corpses[i]!;
    c.prevX = c.x;
    c.prevY = c.y;
  }
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i]!;
    pk.prevX = pk.x;
    pk.prevY = pk.y;
  }
}

/**
 * Handles player [E] (`pickupPressed`) interactions with secret exits, Crown Vault pedestal, and broken Throne:
 * - 3-1 Fixed Golden Car -> Y.V.'s Mansion (3-?)
 * - 5-1 Ice Flower (with Last Wish, 4 HP feeds) -> The Jungle (5-?) + replacement mutation pick
 * - Loop 1+ Open IDPD Van -> I.D.P.D. HQ (hq-1)
 * - Crown Vault pedestal (after Crown Guardians cleared) -> cycle active Crown & apply/revert immediate hooks
 * - 7-3 Broken Throne (`sprThroneCorpseIdle`) -> sit on Throne (`victory_throne`)
 */
function handleSecretInteractions(state: SimState, input: InputFrame, rng: SeededRng): boolean {
  if (!input.pickupPressed || !state.player.alive) return false;
  const player = state.player;
  const rt = getAreaRuntime(state);

  // 0. 7-3 Broken Throne -> sit on Throne to claim victory!
  if (state.areaCode === '7-3' && rt.brokenThronePropId !== null) {
    const broken = state.props.find((p) => p.id === rt.brokenThronePropId);
    if (broken && Math.hypot(player.x - broken.x, player.y - broken.y) <= 44) {
      triggerThroneVictory(state, broken.x, broken.y, rng);
      return true;
    }
  }

  // 1. 3-1 Fixed Golden Car -> Y.V.'s Mansion (3-?)
  if (!state.portal.entered && state.areaCode === '3-1' && rt.venusCarFixed && rt.venusCarPropId !== null) {
    const car = state.props.find((p) => p.id === rt.venusCarPropId);
    if (car && Math.hypot(player.x - car.x, player.y - car.y) <= 34) {
      rt.venusCarPropId = null;
      car.interactPrompt = undefined;
      openBossPortal(state, car.x, car.y, '3-?', state.loop, "Y.V.'S MANSION!", true);
      return true;
    }
  }

  // 2. 5-1 Ice Flower (with Last Wish): feed 1 HP per [E], 4 feeds open Jungle (5-?) + grant replacement mutation!
  if (
    !state.portal.entered &&
    state.areaCode === '5-1' &&
    rt.jungleFlowerPropId !== null &&
    player.mutations.includes('last_wish')
  ) {
    const fIdx = state.props.findIndex((p) => p.id === rt.jungleFlowerPropId);
    if (fIdx !== -1) {
      const flower = state.props[fIdx]!;
      if (Math.hypot(player.x - flower.x, player.y - flower.y) <= 32 && player.hp > 1) {
        player.hp -= 1;
        rt.jungleFlowerFeeds += 1;
        emitEvent(state, { type: 'sfx', sound: 'sndMutAppear', x: flower.x, y: flower.y });
        emitEvent(state, { type: 'damage_number', x: player.x, y: player.y - 8, amount: 1 });
        emitEvent(state, {
          type: 'pickup_text',
          x: flower.x,
          y: flower.y - 16,
          text: `FEED FLOWER (${rt.jungleFlowerFeeds}/4)`,
          color: '#66ee77',
        });
        if (rt.jungleFlowerFeeds >= 4) {
          player.mutations = player.mutations.filter((m) => m !== 'last_wish');
          // Authentic NT Jungle (`junpick`): replacing Last Wish grants a replacement mutation pick!
          state.pendingLevelUps += 1;
          state.props.splice(fIdx, 1);
          rt.jungleFlowerPropId = null;
          openBossPortal(state, flower.x, flower.y, '5-?', state.loop, 'THE JUNGLE!', true);
        }
        return true;
      }
    }
  }

  // 3. Loop 1+ Open IDPD Van -> hijack to I.D.P.D. HQ (hq-1)
  if (!state.portal.entered && state.loop > 0) {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (e.defId === 'idpd_van' && e.hp > 0 && e.aiState === 'open') {
        if (Math.hypot(player.x - e.x, player.y - e.y) <= 44) {
          const boardPropId = rt.vanBoardPropIds.get(e.id);
          if (boardPropId !== undefined) {
            const pIdx = state.props.findIndex((p) => p.id === boardPropId);
            if (pIdx !== -1) state.props.splice(pIdx, 1);
            rt.vanBoardPropIds.delete(e.id);
          }
          emitEvent(state, { type: 'sfx', sound: 'sndVanPortal', x: e.x, y: e.y });
          openBossPortal(state, e.x, e.y, 'hq-1', state.loop, 'I.D.P.D. HQ!', true);
          return true;
        }
      }
    }
  }

  // 4. Crown Vault pedestal -> select/cycle active Crown & apply/revert immediate Crown stat hooks
  if (state.areaCode === 'vault') {
    const guardiansAlive = state.enemies.some((e) => !e.friendly && e.hp > 0);
    if (!guardiansAlive) {
      const pedestal = state.props.find((p) => p.kind === 'proto_statue' && p.hp > 0);
      if (pedestal && Math.hypot(player.x - pedestal.x, player.y - pedestal.y) <= 36) {
        const runRt = getRunRuntime(state);
        const prevCrown = state.crown;
        const curIdx = CROWN_IDS.indexOf(prevCrown);
        const nextCrown = CROWN_IDS[(curIdx + 1) % CROWN_IDS.length]!;

        // Revert previous Crown immediate effects (e.g. Crown of Death +1 maxHp restore)
        if (prevCrown === 'death' && runRt.crownDeathPenalty > 0) {
          player.maxHp += runRt.crownDeathPenalty;
          runRt.crownDeathPenalty = 0;
        }

        state.crown = nextCrown;

        // Apply new Crown immediate effects
        if (nextCrown === 'death') {
          const penalty = player.maxHp > 1 ? 1 : 0;
          player.maxHp -= penalty;
          player.hp = Math.min(player.hp, player.maxHp);
          runRt.crownDeathPenalty = penalty;
        } else if (nextCrown === 'destiny' && !runRt.destinyMutationGranted) {
          runRt.destinyMutationGranted = true;
          state.pendingLevelUps += 1;
          emitEvent(state, {
            type: 'pickup_text',
            x: pedestal.x,
            y: pedestal.y - 28,
            text: 'DESTINY MUTATION!',
            color: '#ffd700',
          });
        }

        emitEvent(state, { type: 'sfx', sound: 'sndCrownAppear', x: pedestal.x, y: pedestal.y });
        emitEvent(state, {
          type: 'pickup_text',
          x: pedestal.x,
          y: pedestal.y - 18,
          text: CROWNS[nextCrown].name,
          color: '#ffd700',
        });
        return true;
      }
    }
  }

  return false;
}

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

  // 3. Hitstop freeze: sync prevX/prevY (zero 60/120 FPS sawtooth jitter!) while keeping screenshake decaying
  if (state.hitstopTicks > 0) {
    syncPrevPositions(state);
    state.hitstopTicks -= 1;
    state.tick += 1;
    state.stats.timeTicks += 1;
    return;
  }

  // 3B. Boss Intro combat pause: freeze gameplay under the opaque Boss Intro splash so players are never killed unseen!
  if (state.phase === 'playing' && state.boss && !state.boss.defeated && state.boss.introTicks > 0) {
    syncPrevPositions(state);
    state.boss.introTicks -= 1;
    state.tick += 1;
    state.stats.timeTicks += 1;
    return;
  }

  // 4. Restore deterministic PRNG from SimState
  const rng = SeededRng.fromState(state.rngState);

  if (state.phase === 'playing') {
    // Check world [E] interactions (Broken Throne, Vault Pedestal, Golden Car, Ice Flower, IDPD Van)
    // first so pressing [E] on them never accidentally swaps a nearby floor weapon!
    const secretConsumedE = handleSecretInteractions(state, input, rng);

    if (state.phase === 'playing') {
      // Player movement, aiming, weapons, mutant actives, snare traps, friendly allies, pickups & swept projectiles
      stepPlayerAndCombat(
        state,
        secretConsumedE ? { ...input, pickupPressed: false } : input,
        rng,
      );

      // Hostile enemies, all 5 Bosses, special death payoffs, destructible props, IDPD waves & contact damage
      // (stepFriendlies=false because stepPlayerAndCombat already stepped Rebel Allies & Plant Saplings!)
      stepEntitiesAndAi(state, rng, { stepFriendlies: false });

      // Catch [E] interactions if player stepped into range during this tick
      if (!secretConsumedE && state.phase === 'playing') {
        handleSecretInteractions(state, input, rng);
      }

      // Core world physics: pickups magnetism, sliding corpses, bouncing casings, particles, portal vortex
      stepPickups(state);
      stepCorpses(state);
      stepCasings(state);
      stepParticles(state);
      stepPortal(state);
    }
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
  // Skip checkPortalTrigger while waiting for player to sit on 7-3 broken Throne (prevents unintended 0-1 portal!)
  state.rngState = rng.getState();
  const awaitingThroneSit = getAreaRuntime(state).brokenThronePropId !== null;
  const portalOutcome = awaitingThroneSit
    ? 'none'
    : checkPortalTrigger(state, rng, populateAreaEntities);
  if (portalOutcome !== 'area_loaded') {
    state.rngState = rng.getState();
  }

  // Apply immediate same-tick secret/vault portal destination overrides when checkPortalTrigger opens a portal
  if (state.portal.active && !state.portal.entered) {
    if (state.areaCode === '3-3' && state.portal.targetArea === '4-1') {
      if (state.player.weapons[0]?.cursed || state.player.weapons[1]?.cursed) {
        state.portal.targetArea = '4-?';
        emitEvent(state, {
          type: 'pickup_text',
          x: state.portal.x,
          y: state.portal.y - 18,
          text: 'CURSED CAVES!',
          color: '#d966ff',
        });
      }
    } else if (state.areaCode === 'vault' && state.portal.targetArea === '4-1') {
      const runRt = getRunRuntime(state);
      if (runRt.vaultReturnArea) {
        state.portal.targetArea = runRt.vaultReturnArea;
      }
    }
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
