import type { AreaCode, BossId, EnemyEntity, SimState, WorldMap } from '@/contracts';

export interface TrackedSpecialEnemy {
  id: number;
  defId: string;
  bossId?: BossId;
  x: number;
  y: number;
  facing: 1 | -1;
}

export interface EnemyAiMemory {
  alerted: boolean;
  aggroTicks: number;
  lastSeenX: number;
  lastSeenY: number;
  homeX: number;
  homeY: number;
  burstLeft: number;
  burstGap: number;
  moveTicks: number;
  pauseTicks: number;
  strafeDir: 1 | -1;
  carryingCar: boolean;
  necroReviveTicks: number;
  necroTargetX: number;
  necroTargetY: number;
}

export interface LilHunterDeathSpiral {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ticksLeft: number;
  bounces: number;
}

export interface RunRuntimeState {
  vaultReturnArea: AreaCode | null;
}

export interface AreaRuntimeState {
  mapRef: WorldMap;
  trackedSpecials: Map<number, TrackedSpecialEnemy>;
  enemyMemory: Map<number, EnemyAiMemory>;
  corpseHitTargets: Map<number, Set<number>>;
  processedCorpseIds: Set<number>;
  bossSummonIds: Set<number>;
  populatingArea: boolean;
  bossDeathHandled: boolean;
  throneWoken: boolean;
  throneLastGenCount: number;
  idpdWavesRemaining: number;
  idpdWaveTimer: number;
  revivedFreakCount: number;
  earlyBigBanditSpawned: boolean;
  earlyBigBanditSpawnTick: number;
  pizzaManholePropId: number | null;
  venusCarPropId: number | null;
  venusCarFixed: boolean;
  jungleFlowerPropId: number | null;
  jungleFlowerFeeds: number;
  protoStatuePropId: number | null;
  protoStatueCharged: boolean;
  protoStatueX: number;
  protoStatueY: number;
  lastScannedEventIdx: number;
  lastLevelKills: number;
  lilHunterSpiral: LilHunterDeathSpiral | null;
}

const runtimeMap = new WeakMap<SimState, AreaRuntimeState>();
const runRuntimeMap = new WeakMap<SimState, RunRuntimeState>();

export const SPECIAL_DEATH_DEF_IDS: ReadonlySet<string> = new Set([
  'maggot_nest',
  'big_maggot',
  'big_rat',
  'ballguy',
  'snow_tank',
  'gold_snow_tank',
  'explo_freak',
  'explo_guardian',
  'idpd_van',
  'mimic',
  'weapon_mimic',
  'big_bandit',
  'big_dog',
  'lil_hunter',
  'nuclear_throne',
  'throne_ii',
]);

function makeFreshRuntime(state: SimState): AreaRuntimeState {
  return {
    mapRef: state.map,
    trackedSpecials: new Map(),
    enemyMemory: new Map(),
    corpseHitTargets: new Map(),
    processedCorpseIds: new Set(),
    bossSummonIds: new Set(),
    populatingArea: false,
    bossDeathHandled: false,
    throneWoken: false,
    throneLastGenCount: state.generatorsRemaining,
    idpdWavesRemaining: 0,
    idpdWaveTimer: 0,
    revivedFreakCount: 0,
    earlyBigBanditSpawned: false,
    earlyBigBanditSpawnTick: -1,
    pizzaManholePropId: null,
    venusCarPropId: null,
    venusCarFixed: false,
    jungleFlowerPropId: null,
    jungleFlowerFeeds: 0,
    protoStatuePropId: null,
    protoStatueCharged: false,
    protoStatueX: 0,
    protoStatueY: 0,
    lastScannedEventIdx: 0,
    lastLevelKills: state.levelKills,
    lilHunterSpiral: null,
  };
}

export function getRunRuntime(state: SimState): RunRuntimeState {
  let run = runRuntimeMap.get(state);
  if (!run) {
    run = { vaultReturnArea: null };
    runRuntimeMap.set(state, run);
  }
  return run;
}

export function getAreaRuntime(state: SimState): AreaRuntimeState {
  let rt = runtimeMap.get(state);
  if (!rt || rt.mapRef !== state.map) {
    rt = makeFreshRuntime(state);
    runtimeMap.set(state, rt);
  }
  return rt;
}

export function resetAreaRuntime(state: SimState): AreaRuntimeState {
  const rt = makeFreshRuntime(state);
  runtimeMap.set(state, rt);
  return rt;
}

export function getEnemyMemory(state: SimState, enemy: EnemyEntity): EnemyAiMemory {
  const rt = getAreaRuntime(state);
  let mem = rt.enemyMemory.get(enemy.id);
  if (!mem) {
    mem = {
      alerted: false,
      aggroTicks: 0,
      lastSeenX: enemy.x,
      lastSeenY: enemy.y,
      homeX: enemy.x,
      homeY: enemy.y,
      burstLeft: 0,
      burstGap: 0,
      moveTicks: 0,
      pauseTicks: 12,
      strafeDir: enemy.id % 2 === 0 ? 1 : -1,
      carryingCar: false,
      necroReviveTicks: 0,
      necroTargetX: enemy.x,
      necroTargetY: enemy.y,
    };
    rt.enemyMemory.set(enemy.id, mem);
  }
  return mem;
}

export function registerTrackedEnemy(
  state: SimState,
  enemy: EnemyEntity,
  isBossSummon: boolean = false,
): void {
  const rt = getAreaRuntime(state);
  if (isBossSummon) {
    rt.bossSummonIds.add(enemy.id);
  }
  if (enemy.isBoss || SPECIAL_DEATH_DEF_IDS.has(enemy.defId)) {
    rt.trackedSpecials.set(enemy.id, {
      id: enemy.id,
      defId: enemy.defId,
      bossId: enemy.bossId,
      x: enemy.x,
      y: enemy.y,
      facing: enemy.facing,
    });
  }
}
