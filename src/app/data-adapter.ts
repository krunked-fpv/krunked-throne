import type {
  AreaCode,
  AreaDef,
  BiomeId,
  CrownDef,
  CrownId,
  EnemyDef,
  MutantDef,
  MutantId,
  MutationDef,
  MutationId,
  UltraDef,
  UltraId,
  WeaponDef,
} from '@/contracts';
import {
  AREAS,
  CROWNS,
  CROWN_IDS,
  ENEMIES,
  MUTANTS,
  MUTANT_IDS,
  MUTATIONS,
  MUTATION_IDS,
  ULTRAS,
  WEAPONS,
} from '@/data';
import type { UiDataProvider } from '@/ui/data-provider';

/**
 * Wires the complete verified `src/data/**` static registries (12 mutants,
 * 29 mutations, 24 ultras, 142 weapons, 50 enemies, 13 crowns, 23 areas)
 * into the decoupled `UiDataProvider` interface consumed by Renderer and UI.
 */
export function createGameDataProvider(): UiDataProvider {
  const mutantList: readonly MutantDef[] = MUTANT_IDS.map((id) => MUTANTS[id]);
  const mutationList: readonly MutationDef[] = MUTATION_IDS.map((id) => MUTATIONS[id]);
  const crownList: readonly CrownDef[] = CROWN_IDS.map((id) => CROWNS[id]);
  const areaByBiome = new Map<BiomeId, AreaDef>();
  for (const area of Object.values(AREAS)) {
    if (!areaByBiome.has(area.biome)) {
      areaByBiome.set(area.biome, area);
    }
  }

  return {
    getMutants(): readonly MutantDef[] {
      return mutantList;
    },
    getMutant(id: MutantId): MutantDef {
      return MUTANTS[id];
    },
    getMutations(): readonly MutationDef[] {
      return mutationList;
    },
    getMutation(id: MutationId): MutationDef | undefined {
      return MUTATIONS[id];
    },
    getUltra(id: UltraId): UltraDef | undefined {
      return ULTRAS[id];
    },
    getCrowns(): readonly CrownDef[] {
      return crownList;
    },
    getCrown(id: CrownId): CrownDef {
      return CROWNS[id];
    },
    getWeapon(id: string): WeaponDef | undefined {
      return WEAPONS[id];
    },
    getEnemy(id: string): EnemyDef | undefined {
      return ENEMIES[id];
    },
    getArea(code: AreaCode): AreaDef | undefined {
      return AREAS[code];
    },
    getAreaByBiome(biome: BiomeId): AreaDef | undefined {
      return areaByBiome.get(biome);
    },
  };
}
