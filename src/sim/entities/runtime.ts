import type { BossId, EnemyEntity, SimState, WorldMap } from '@/contracts';

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
}

export interface AreaRuntimeState {
  mapRef: WorldMap;
  trackedSpecials: Map<number, TrackedSpecialEnemy>;
  enemyMemory: Map<number, EnemyAiMemory>;
  corpseHitTargets: Map<number, Set<number>>;
  processedCorpseIds: Set<number>;
  bossSummonIds: Set<number>;
  bossDeathHandled: boolean;
  throneWoken: boolean;
  throneLastGenCount: number;
  idpdWavesRemaining: number;
  idpdWaveTimer: number;
  revivedFreakCount: number;
}

const runtimeMap = new WeakMap<SimState, AreaRuntimeState>();

export const SPECIAL_DEATH_DEF_IDS: ReadonlySet<string> = new Set([
  'maggot_nest',
  'big_rat',
  'snow_tank',
  'gold_snow_tank',
  'explo_freak',
  'explo_guardian',
  'idpd_van',
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
    bossDeathHandled: false,
    throneWoken: false,
    throneLastGenCount: state.generatorsRemaining,
    idpdWavesRemaining: 0,
    idpdWaveTimer: 0,
    revivedFreakCount: 0,
  };
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
