/**
 * Deterministic Mulberry32 PRNG for the Nuclear Throne clean-room simulation.
 * 100% pure, DOM-free, zero Math.random() usage.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number = 1) {
    this.state = seed >>> 0;
  }

  static fromState(state: number): SeededRng {
    const rng = new SeededRng(0);
    rng.setState(state);
    return rng;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(s: number): void {
    this.state = s >>> 0;
  }

  clone(): SeededRng {
    return SeededRng.fromState(this.state);
  }

  /**
   * Advances Mulberry32 state and returns an unsigned 32-bit integer in [0, 2^32 - 1].
   */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * Returns a uniform float in [0, 1).
   */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Returns an inclusive integer in [min, max].
   */
  int(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    if (hi <= lo) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /**
   * Returns a uniform float in [min, max).
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns true with probability p in [0, 1].
   */
  chance(p: number): boolean {
    const u = this.next();
    if (p <= 0) return false;
    if (p >= 1) return true;
    return u < p;
  }

  /**
   * Uniformly picks one element from a non-empty array.
   */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('SeededRng.pick called on empty array');
    }
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx]!;
  }

  /**
   * Performs an in-place Fisher-Yates shuffle and returns the array.
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Derives a deterministic independent child PRNG from current state and salt
   * without mutating the parent stream.
   */
  fork(salt: number | string): SeededRng {
    let h = (this.state ^ 0x811c9dc5) >>> 0;
    if (typeof salt === 'number') {
      const v = salt >>> 0;
      h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193) >>> 0;
      h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193) >>> 0;
      h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193) >>> 0;
    } else {
      for (let i = 0; i < salt.length; i++) {
        h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
      }
    }
    // SplitMix32 avalanche finalizer
    h = (h + 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return new SeededRng(h);
  }
}
