import type { FallbackAtlasBuilder } from './fallback-fonts';
import { registerAllEnemiesAndBosses } from './fallback-enemies';
import { registerAllMutants } from './fallback-mutants';
import { registerWeaponsAndProjectiles } from './fallback-weapons';

export { MUTANT_A_PALETTES, MUTANT_B_PALETTES, type MutantPalette } from './fallback-mutants';

export function registerFallbackEntities(b: FallbackAtlasBuilder): void {
  registerAllMutants(b);
  registerAllEnemiesAndBosses(b);
  registerWeaponsAndProjectiles(b);
}
