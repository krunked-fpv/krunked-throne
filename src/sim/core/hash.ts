import type { SimState, WorldMap } from '@/contracts';

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

const floatBuf = new ArrayBuffer(8);
const floatView = new DataView(floatBuf);
const floatBytes = new Uint8Array(floatBuf);

/**
 * Streaming 64-bit FNV-1a hasher for deterministic simulation state digests.
 */
export class Fnv1a64 {
  private h: bigint = FNV64_OFFSET_BASIS;

  writeByte(b: number): void {
    this.h = ((this.h ^ BigInt(b & 0xff)) * FNV64_PRIME) & FNV64_MASK;
  }

  writeBytes(bytes: Uint8Array): void {
    let h = this.h;
    for (let i = 0; i < bytes.length; i++) {
      h = ((h ^ BigInt(bytes[i]!)) * FNV64_PRIME) & FNV64_MASK;
    }
    this.h = h;
  }

  writeBool(v: boolean | undefined): void {
    this.writeByte(v ? 1 : 0);
  }

  writeUint32(v: number): void {
    const u = v >>> 0;
    let h = this.h;
    h = ((h ^ BigInt(u & 0xff)) * FNV64_PRIME) & FNV64_MASK;
    h = ((h ^ BigInt((u >>> 8) & 0xff)) * FNV64_PRIME) & FNV64_MASK;
    h = ((h ^ BigInt((u >>> 16) & 0xff)) * FNV64_PRIME) & FNV64_MASK;
    h = ((h ^ BigInt((u >>> 24) & 0xff)) * FNV64_PRIME) & FNV64_MASK;
    this.h = h;
  }

  writeNumber(v: number): void {
    // Normalize -0 -> +0 and NaN -> 0 for strict cross-runtime determinism.
    const normalized = Number.isNaN(v) || v === 0 ? 0 : v;
    floatView.setFloat64(0, normalized, true);
    let h = this.h;
    for (let i = 0; i < 8; i++) {
      h = ((h ^ BigInt(floatBytes[i]!)) * FNV64_PRIME) & FNV64_MASK;
    }
    this.h = h;
  }

  writeString(s: string | null | undefined): void {
    if (s == null) {
      this.writeUint32(0xffffffff);
      return;
    }
    this.writeUint32(s.length);
    let h = this.h;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      h = ((h ^ BigInt(code & 0xff)) * FNV64_PRIME) & FNV64_MASK;
      if (code > 0xff) {
        h = ((h ^ BigInt((code >>> 8) & 0xff)) * FNV64_PRIME) & FNV64_MASK;
      }
    }
    this.h = h;
  }

  digestHex(): string {
    return this.h.toString(16).padStart(16, '0');
  }
}

/**
 * Computes a deterministic 64-bit FNV-1a hex digest of a WorldMap layout.
 */
export function hashWorldMap(map: WorldMap): string {
  const hasher = new Fnv1a64();
  hasher.writeUint32(map.width);
  hasher.writeUint32(map.height);
  hasher.writeUint32(map.tileSize);
  hasher.writeNumber(map.spawnX);
  hasher.writeNumber(map.spawnY);
  hasher.writeString(map.biome);
  hasher.writeString(map.areaCode);
  hasher.writeUint32(map.loop);
  hasher.writeNumber(map.darkness);
  hasher.writeUint32(map.walkableCount);
  hasher.writeBytes(map.tiles);
  hasher.writeBytes(map.floorVariants);
  hasher.writeBytes(map.wallMask);
  return hasher.digestHex();
}

/**
 * Computes a deterministic 64-bit FNV-1a hex hash of the full simulation state,
 * covering tick, rngState, areaCode, loop, player, enemies, projectiles,
 * pickups, portal, kills, and map walkableCount.
 */
export function hashSimState(state: SimState): string {
  const h = new Fnv1a64();

  // Core simulation header
  h.writeUint32(state.tick);
  h.writeUint32(state.rngState);
  h.writeString(state.phase);
  h.writeString(state.areaCode);
  h.writeString(state.biome);
  h.writeUint32(state.loop);
  h.writeString(state.crown);
  h.writeUint32(state.hitstopTicks);
  h.writeUint32(state.chestSkipStreak);
  h.writeUint32(state.generatorsRemaining);
  h.writeUint32(state.portalTransitionTicks);

  // Kills & run stats
  h.writeUint32(state.stats.kills);
  h.writeUint32(state.levelKills);
  h.writeUint32(state.stats.radsCollected);
  h.writeUint32(state.stats.areasCleared);

  // Map summary (O(1))
  h.writeUint32(state.map.width);
  h.writeUint32(state.map.height);
  h.writeUint32(state.map.walkableCount);
  h.writeNumber(state.map.spawnX);
  h.writeNumber(state.map.spawnY);

  // Player state
  const p = state.player;
  h.writeUint32(p.id);
  h.writeString(p.mutant);
  h.writeNumber(p.x);
  h.writeNumber(p.y);
  h.writeNumber(p.vx);
  h.writeNumber(p.vy);
  h.writeNumber(p.aimAngle);
  h.writeUint32(p.facing + 2);
  h.writeNumber(p.hp);
  h.writeNumber(p.maxHp);
  h.writeUint32(p.iframes);
  h.writeUint32(p.rads);
  h.writeUint32(p.level);
  h.writeUint32(p.radsToNextLevel);
  h.writeUint32(p.activeSlot);
  h.writeUint32(p.activeCooldown);
  h.writeUint32(p.activeTimer);
  h.writeBool(p.shielding);
  h.writeBool(p.rolling);
  h.writeBool(p.telekinesisActive);
  h.writeUint32(p.headlessTicks);
  h.writeUint32(p.gunWarrantTicks);
  h.writeUint32(p.portalStrikes);
  h.writeBool(p.strongSpiritReady);
  h.writeBool(p.strongSpiritRecharging);
  h.writeUint32(p.hammerheadTicks);
  h.writeBool(p.alive);

  // Ammo pools (fixed canonical key order)
  h.writeUint32(p.ammo.melee);
  h.writeUint32(p.ammo.bullet);
  h.writeUint32(p.ammo.shell);
  h.writeUint32(p.ammo.bolt);
  h.writeUint32(p.ammo.explosive);
  h.writeUint32(p.ammo.energy);

  // Weapons
  for (let i = 0; i < 2; i++) {
    const slot = p.weapons[i];
    if (!slot) {
      h.writeByte(0);
    } else {
      h.writeByte(1);
      h.writeString(slot.weaponId);
      h.writeUint32(slot.reloadTicks);
      h.writeUint32(slot.burstRemaining);
      h.writeUint32(slot.burstTimer);
      h.writeBool(slot.cursed);
    }
  }

  // Mutations & ultra
  h.writeUint32(p.mutations.length);
  for (let i = 0; i < p.mutations.length; i++) {
    h.writeString(p.mutations[i]);
  }
  h.writeString(p.ultra);

  // Enemies
  h.writeUint32(state.enemies.length);
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    h.writeUint32(e.id);
    h.writeString(e.defId);
    h.writeNumber(e.x);
    h.writeNumber(e.y);
    h.writeNumber(e.vx);
    h.writeNumber(e.vy);
    h.writeNumber(e.hp);
    h.writeNumber(e.maxHp);
    h.writeString(e.aiState);
    h.writeUint32(e.aiTimer);
    h.writeUint32(e.aiPhase);
    h.writeUint32(e.attackCooldown);
    h.writeUint32(e.snaredTicks);
    h.writeBool(e.friendly);
    h.writeBool(e.isBoss);
  }

  // Projectiles
  h.writeUint32(state.projectiles.length);
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i]!;
    h.writeUint32(pr.id);
    h.writeString(pr.kind);
    h.writeString(pr.team);
    h.writeNumber(pr.x);
    h.writeNumber(pr.y);
    h.writeNumber(pr.vx);
    h.writeNumber(pr.vy);
    h.writeNumber(pr.damage);
    h.writeUint32(pr.lifeTicks);
    h.writeUint32(pr.pierce);
    h.writeUint32(pr.bounce);
  }

  // Pickups
  h.writeUint32(state.pickups.length);
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i]!;
    h.writeUint32(pk.id);
    h.writeString(pk.kind);
    h.writeNumber(pk.x);
    h.writeNumber(pk.y);
    h.writeNumber(pk.vx);
    h.writeNumber(pk.vy);
    h.writeNumber(pk.value);
    h.writeString(pk.ammoType);
    h.writeString(pk.weaponId);
    h.writeUint32(pk.lifeTicks);
  }

  // Props (chests, canisters, generators, etc.)
  h.writeUint32(state.props.length);
  for (let i = 0; i < state.props.length; i++) {
    const prop = state.props[i]!;
    h.writeUint32(prop.id);
    h.writeString(prop.kind);
    h.writeNumber(prop.x);
    h.writeNumber(prop.y);
    h.writeNumber(prop.hp);
    h.writeBool(prop.opened);
  }

  // Portal
  const pt = state.portal;
  h.writeBool(pt.active);
  h.writeNumber(pt.x);
  h.writeNumber(pt.y);
  h.writeNumber(pt.radius);
  h.writeUint32(pt.timer);
  h.writeString(pt.targetArea);
  h.writeUint32(pt.nextLoop);
  h.writeBool(pt.entered);
  h.writeUint32(pt.enterTicks);
  h.writeBool(pt.carved);

  return h.digestHex();
}
