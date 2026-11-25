/**
 * 100% Original Procedural Wasteland Music & Ambience Sequencer.
 * Pure Web Audio API lookahead step-sequencer routed into AudioEngine's
 * musicDuckingGain and ambienceGain buses so Master/Music/Ambience volume,
 * Mute, and 0.35x Pause ducking all work seamlessly.
 *
 * ZERO copyrighted melodies — all chord progressions, basslines, drums,
 * and ambience textures are original procedural compositions.
 * 100% safe no-op in headless Node environments.
 */

export type SynthMusicThemeId =
  | 'campfire'
  | 'desert'
  | 'sewers'
  | 'scrapyard'
  | 'caves'
  | 'frozen'
  | 'labs'
  | 'palace'
  | 'boss1'
  | 'boss2'
  | 'boss3'
  | 'boss4'
  | 'boss5'
  | 'game_over';

export type SynthAmbienceKind =
  | 'campfire'
  | 'desert'
  | 'subterranean'
  | 'scrapyard'
  | 'caves'
  | 'frozen'
  | 'labs'
  | 'palace';

interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

const noiseBankCache = new WeakMap<AudioContext, NoiseBank>();
const driveCurveCache = new WeakMap<AudioContext, Float32Array<ArrayBuffer>>();

function getNoiseBank(ctx: AudioContext): NoiseBank {
  let bank = noiseBankCache.get(ctx);
  if (bank) return bank;

  const sampleRate = ctx.sampleRate || 44100;
  const length = sampleRate * 2; // 2 seconds seamless-ish buffer

  // White noise
  const white = ctx.createBuffer(1, length, sampleRate);
  const wData = white.getChannelData(0);
  for (let i = 0; i < length; i++) {
    wData[i] = Math.random() * 2 - 1;
  }

  // Pink noise (Paul Kellet's filter)
  const pink = ctx.createBuffer(1, length, sampleRate);
  const pData = pink.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    const val = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    pData[i] = Math.max(-1, Math.min(1, val));
  }

  // Brown noise (integrated white with gentle leak)
  const brown = ctx.createBuffer(1, length, sampleRate);
  const brData = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    brData[i] = Math.max(-1, Math.min(1, last * 3.2));
  }

  bank = { white, pink, brown };
  noiseBankCache.set(ctx, bank);
  return bank;
}

function getSoftDriveCurve(ctx: AudioContext): Float32Array<ArrayBuffer> {
  let curve = driveCurveCache.get(ctx);
  if (curve) return curve;

  const n = 256;
  curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 18;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  driveCurveCache.set(ctx, curve);
  return curve;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Resolves a music track key (e.g. 'mus/1', 'musThemeA', 'mus/Boss3') to an original synth theme.
 */
export function resolveSynthMusicTheme(trackKey: string): SynthMusicThemeId {
  const norm = trackKey
    .toLowerCase()
    .replace(/^mus[/_-]?/, '')
    .replace(/\.ogg$/, '')
    .trim();

  if (norm.includes('gameover') || norm === 'dead') return 'game_over';
  if (norm.startsWith('boss5')) return 'boss5';
  if (norm.startsWith('boss4')) return 'boss4';
  if (norm.startsWith('boss3')) return 'boss3';
  if (norm.startsWith('boss2')) return 'boss2';
  if (norm.startsWith('boss1') || norm.startsWith('boss')) return 'boss1';

  if (
    norm.includes('theme') ||
    norm === '100' ||
    norm === '102' ||
    norm.includes('campfire') ||
    norm.includes('credits') ||
    norm.includes('vault')
  ) {
    return 'campfire';
  }
  if (norm === '1' || norm === '1b' || norm.includes('desert') || norm.includes('oasis')) {
    return 'desert';
  }
  if (norm === '2' || norm === '2b' || norm.includes('sewer') || norm.includes('pizza')) {
    return 'sewers';
  }
  if (
    norm === '3' ||
    norm === '3b' ||
    norm.includes('scrap') ||
    norm.includes('mansion') ||
    norm === 'yv'
  ) {
    return 'scrapyard';
  }
  if (norm === '4' || norm === '4b' || norm.includes('cave')) {
    return 'caves';
  }
  if (norm === '5' || norm === '5b' || norm.includes('frozen') || norm.includes('jungle')) {
    return 'frozen';
  }
  if (norm === '6' || norm === '6b' || norm.includes('lab')) {
    return 'labs';
  }
  if (norm === '7' || norm === '7b' || norm.includes('palace') || norm === 'hq') {
    return 'palace';
  }

  return 'desert';
}

/**
 * Resolves an ambience key (e.g. 'amb/0', 'amb/5', 'ambSewers') to a procedural ambience profile.
 */
export function resolveSynthAmbienceKind(ambKey: string): SynthAmbienceKind {
  const norm = ambKey
    .toLowerCase()
    .replace(/^amb[/_-]?/, '')
    .replace(/\.ogg$/, '')
    .trim();

  if (norm === '0' || norm.includes('campfire')) return 'campfire';
  if (norm === '1' || norm.includes('desert') || norm.includes('oasis')) return 'desert';
  if (norm === '2' || norm.includes('sewer')) return 'subterranean';
  if (norm === '3' || norm.includes('scrap') || norm.includes('mansion')) return 'scrapyard';
  if (norm === '4' || norm.includes('cave')) return 'caves';
  if (norm === '5' || norm.includes('frozen') || norm.includes('jungle')) return 'frozen';
  if (norm === '6' || norm.includes('lab')) return 'labs';
  if (norm === '7' || norm.includes('palace') || norm.includes('vault') || norm === 'hq') {
    return 'palace';
  }
  return 'desert';
}

interface ThemeDefinition {
  bpm: number;
  steps: number; // 16th-note steps per loop (32 or 64)
  swing?: number; // 0..0.25 16th swing fraction
  stepFn: (
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    step: number,
    stepDur: number
  ) => void;
}

// ============================================================================
// SYNTH INSTRUMENT PRIMITIVES (stateless, self-disconnecting Web Audio voices)
// ============================================================================

function playKick(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  vol = 0.42,
  punchFreq = 135,
  tailDur = 0.16
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(punchFreq, time);
  osc.frequency.exponentialRampToValueAtTime(36, time + tailDur * 0.7);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + tailDur);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + tailDur + 0.02);
}

function playSnare(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  vol = 0.24,
  toneFreq = 190,
  dur = 0.14
): void {
  const bank = getNoiseBank(ctx);
  const noise = ctx.createBufferSource();
  noise.buffer = bank.white;

  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.setValueAtTime(1600, time);
  hp.Q.setValueAtTime(0.9, time);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol, time);
  nGain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  noise.connect(hp);
  hp.connect(nGain);
  nGain.connect(dest);
  noise.start(time, Math.random() * 0.5);
  noise.stop(time + dur + 0.02);

  // Body snap
  const body = ctx.createOscillator();
  const bGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(toneFreq, time);
  body.frequency.exponentialRampToValueAtTime(85, time + 0.07);
  bGain.gain.setValueAtTime(vol * 0.75, time);
  bGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.08);

  body.connect(bGain);
  bGain.connect(dest);
  body.start(time);
  body.stop(time + 0.09);
}

function playHat(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  vol = 0.09,
  open = false
): void {
  const bank = getNoiseBank(ctx);
  const noise = ctx.createBufferSource();
  noise.buffer = bank.white;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(open ? 5800 : 7500, time);

  const dur = open ? 0.16 : 0.045;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(time, Math.random() * 0.8);
  noise.stop(time + dur + 0.02);
}

function playMetalClang(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  freq = 440,
  vol = 0.16,
  dur = 0.18
): void {
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  carrier.type = 'square';
  carrier.frequency.setValueAtTime(freq, time);
  mod.type = 'triangle';
  mod.frequency.setValueAtTime(freq * 2.41, time);
  modGain.gain.setValueAtTime(freq * 1.6, time);
  modGain.gain.exponentialRampToValueAtTime(10, time + dur);

  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq * 2.2, time);
  bp.Q.setValueAtTime(3.2, time);

  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(bp);
  bp.connect(gain);
  gain.connect(dest);

  carrier.start(time);
  mod.start(time);
  carrier.stop(time + dur + 0.02);
  mod.stop(time + dur + 0.02);
}

function playPluck(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  midi: number,
  vol = 0.18,
  dur = 0.42,
  twang = 0.4
): void {
  const freq = midiToFreq(midi);
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, time);
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(freq * 1.003, time);

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(twang, time);

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(4800, freq * 7), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(260, freq * 1.6), time + dur * 0.75);
  lp.Q.setValueAtTime(1.8, time);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  osc1.connect(lp);
  osc2.connect(osc2Gain);
  osc2Gain.connect(lp);
  lp.connect(gain);
  gain.connect(dest);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + dur + 0.02);
  osc2.stop(time + dur + 0.02);
}

function playBass(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  midi: number,
  vol = 0.25,
  dur = 0.22,
  opts: {
    type?: OscillatorType;
    cutoff?: number;
    resonance?: number;
    drive?: boolean;
  } = {}
): void {
  const freq = midiToFreq(midi);
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = opts.type ?? 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq * 0.5, time);
  subGain.gain.setValueAtTime(0.45, time);

  const cutoff = opts.cutoff ?? 750;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff * 1.6, time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.45), time + dur);
  lp.Q.setValueAtTime(opts.resonance ?? 2.2, time);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  osc.connect(lp);
  sub.connect(subGain);
  subGain.connect(lp);

  if (opts.drive) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = getSoftDriveCurve(ctx);
    lp.connect(shaper);
    shaper.connect(gain);
  } else {
    lp.connect(gain);
  }
  gain.connect(dest);

  osc.start(time);
  sub.start(time);
  osc.stop(time + dur + 0.02);
  sub.stop(time + dur + 0.02);
}

function playPadChord(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  midis: readonly number[],
  vol = 0.08,
  dur = 1.4,
  opts: { type?: OscillatorType; cutoff?: number; attack?: number } = {}
): void {
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const attack = opts.attack ?? 0.14;

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(opts.cutoff ?? 1100, time);
  lp.Q.setValueAtTime(1.1, time);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + attack);
  gain.gain.setValueAtTime(vol * 0.85, time + Math.max(attack, dur * 0.65));
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  lp.connect(gain);
  gain.connect(dest);

  const perVoice = 1 / Math.max(1, midis.length);
  for (let i = 0; i < midis.length; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'triangle';
    const detune = i % 2 === 0 ? -4 : 4;
    osc.frequency.setValueAtTime(midiToFreq(midis[i]!), time);
    osc.detune.setValueAtTime(detune, time);
    g.gain.setValueAtTime(perVoice, time);
    osc.connect(g);
    g.connect(lp);
    osc.start(time);
    osc.stop(time + dur + 0.04);
  }
}

function playBell(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  midi: number,
  vol = 0.14,
  dur = 0.9
): void {
  const freq = midiToFreq(midi);
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const gain = ctx.createGain();

  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(freq, time);
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * 2.756, time);
  modGain.gain.setValueAtTime(freq * 0.85, time);
  modGain.gain.exponentialRampToValueAtTime(1, time + dur * 0.6);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(gain);
  gain.connect(dest);

  carrier.start(time);
  mod.start(time);
  carrier.stop(time + dur + 0.03);
  mod.stop(time + dur + 0.03);
}

function playLeadStab(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  midi: number,
  vol = 0.15,
  dur = 0.18,
  opts: { type?: OscillatorType; cutoff?: number; slideFrom?: number } = {}
): void {
  const freq = midiToFreq(midi);
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = opts.type ?? 'sawtooth';
  if (opts.slideFrom !== undefined) {
    osc.frequency.setValueAtTime(midiToFreq(opts.slideFrom), time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + Math.min(0.045, dur * 0.35));
  } else {
    osc.frequency.setValueAtTime(freq, time);
  }

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(opts.cutoff ?? 2400, time);
  lp.frequency.exponentialRampToValueAtTime(520, time + dur);
  lp.Q.setValueAtTime(2.4, time);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(dest);

  osc.start(time);
  osc.stop(time + dur + 0.02);
}

// ============================================================================
// ORIGINAL WASTELAND THEME COMPOSITIONS
// ============================================================================

function createBossTheme(bpm: number, rootMidi: number, variant: number): ThemeDefinition {
  // Aggressive 32-step original chromatic boss riff + double-time drums + tense synth stabs
  const bassOffsets = [
    0, 0, 12, 0, 1, 0, 10, 0, 0, 0, 7, 6, 3, 0, 1, 0,
    0, 0, 12, 0, 3, 0, 10, 12, 6, 6, 5, 3, 1, 0, -2, -1,
  ];
  const stabIntervals = [
    [0, 3, 6],
    [1, 4, 7],
    [0, 6, 10],
    [-2, 1, 5],
  ];
  const leadScale = [0, 1, 3, 6, 7, 10, 12, 13];

  return {
    bpm,
    steps: 32,
    stepFn: (ctx, dest, time, step, stepDur) => {
      // Double-time kick & cracking snare
      if (step % 4 === 0 || step === 14 || step === 26 || (variant >= 3 && step % 8 === 6)) {
        playKick(ctx, dest, time, 0.44, 155, 0.13);
      }
      if (step % 8 === 4 || (step === 30 && variant % 2 === 0)) {
        playSnare(ctx, dest, time, 0.28, 220, 0.13);
      }
      // Relentless 16th hi-hats with open accents
      playHat(ctx, dest, time, step % 2 === 0 ? 0.11 : 0.055, step % 8 === 6);

      // Distorted pulsing bassline
      const bOff = bassOffsets[step % bassOffsets.length]!;
      playBass(ctx, dest, time, rootMidi + bOff, 0.26, stepDur * 0.9, {
        type: 'sawtooth',
        cutoff: 920 + (step % 4 === 0 ? 450 : 0),
        resonance: 3.4,
        drive: true,
      });

      // Tense chromatic synth stabs on syncopated accents
      if (step === 0 || step === 6 || step === 12 || step === 16 || step === 22 || step === 28) {
        const chordIdx = (Math.floor(step / 8) + variant) % stabIntervals.length;
        const chord = stabIntervals[chordIdx]!.map((iv) => rootMidi + 24 + iv);
        playPadChord(ctx, dest, time, chord, 0.11, stepDur * 1.8, {
          type: 'sawtooth',
          cutoff: 2200,
          attack: 0.008,
        });
      }

      // Urgent chromatic lead bursts in bars 2 and 4
      if ((step >= 8 && step < 16) || (step >= 24 && step < 32)) {
        if (step % 2 === 0 || step === 15 || step === 31) {
          const idx = (step * 3 + variant * 2) % leadScale.length;
          playLeadStab(ctx, dest, time, rootMidi + 24 + leadScale[idx]!, 0.13, stepDur * 1.3, {
            type: 'square',
            cutoff: 2600,
          });
        }
      }
    },
  };
}

const THEMES: Record<SynthMusicThemeId, ThemeDefinition> = {
  // 1. Title / Campfire: Warm acoustic-plucked D minor pentatonic desert motif + sparse bass
  campfire: {
    bpm: 86,
    steps: 64,
    swing: 0.08,
    stepFn: (ctx, dest, time, step, stepDur) => {
      // Bar progression: Dm (0..15) -> C (16..31) -> Bb (32..47) -> A7sus4 (48..63)
      const bar = Math.floor(step / 16);
      const local = step % 16;
      const bassRoots = [38, 36, 34, 33]; // D2, C2, Bb1, A1
      const chords: readonly (readonly number[])[] = [
        [50, 57, 62, 65], // Dm
        [48, 55, 60, 64], // C
        [46, 53, 58, 62], // Bb
        [45, 52, 57, 61], // A
      ];

      // Sparse warm acoustic bass on beat 1 and dotted beat 3
      if (local === 0 || local === 10) {
        playBass(ctx, dest, time, bassRoots[bar]!, local === 0 ? 0.24 : 0.17, stepDur * 4.5, {
          type: 'triangle',
          cutoff: 420,
          resonance: 1.0,
        });
      }

      // Fingerpicked western desert guitar arpeggio pattern
      const arpSlots: Record<number, number> = {
        0: 0,
        3: 1,
        6: 2,
        8: 3,
        11: 2,
        14: 1,
      };
      const chord = chords[bar]!;
      if (arpSlots[local] !== undefined) {
        const note = chord[arpSlots[local]!]!;
        playPluck(ctx, dest, time, note, 0.16, stepDur * 3.2, 0.32);
      }

      // Original minor-pentatonic top melody (D5 F5 G5 A5 C6)
      const melody: Record<number, number> = {
        4: 69,
        12: 65,
        18: 67,
        24: 64,
        36: 65,
        42: 62,
        50: 64,
        56: 61,
        60: 62,
      };
      if (melody[step] !== undefined) {
        playPluck(ctx, dest, time, melody[step]!, 0.18, stepDur * 4.0, 0.45);
      }

      // Gentle dusty brush & soft pulse
      if (local === 0) {
        playKick(ctx, dest, time, 0.18, 95, 0.14);
      }
      if (local === 4 || local === 12) {
        playHat(ctx, dest, time, 0.045, false);
      }
    },
  },

  // 2. Desert: Driving dusty blues-rock E-minor groove + twangy syncopated melody
  desert: {
    bpm: 118,
    steps: 64,
    swing: 0.12,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;

      // Kick / Snare desert rock groove
      if (local === 0 || local === 6 || local === 10) {
        playKick(ctx, dest, time, local === 0 ? 0.4 : 0.32, 130, 0.15);
      }
      if (local === 4 || local === 12) {
        playSnare(ctx, dest, time, 0.24, 185, 0.13);
      }
      if (local % 2 === 0) {
        playHat(ctx, dest, time, local % 4 === 2 ? 0.095 : 0.06, local === 14);
      }

      // Driving dusty blues-rock bassline (Em -> Em -> G/A -> B7 turn)
      const bassBar0 = [40, -1, 40, 43, 45, -1, 43, -1, 40, -1, 38, 40, 43, -1, 40, -1];
      const bassBar2 = [43, -1, 43, 45, 47, -1, 45, -1, 45, -1, 43, 45, 47, -1, 43, -1];
      const bassBar3 = [47, -1, 45, -1, 43, -1, 42, -1, 40, -1, 43, 45, 47, -1, 45, 43];
      const pattern = bar < 2 ? bassBar0 : bar === 2 ? bassBar2 : bassBar3;
      const bNote = pattern[local]!;
      if (bNote > 0) {
        playBass(ctx, dest, time, bNote, 0.26, stepDur * 1.7, {
          type: 'sawtooth',
          cutoff: 880,
          resonance: 2.0,
        });
      }

      // Twangy syncopated wasteland guitar riff
      const riffA: Record<number, { n: number; s?: number }> = {
        2: { n: 64, s: 62 },
        5: { n: 67 },
        8: { n: 69, s: 67 },
        11: { n: 67 },
        14: { n: 64 },
      };
      const riffB: Record<number, { n: number; s?: number }> = {
        0: { n: 71, s: 69 },
        3: { n: 69 },
        6: { n: 67 },
        10: { n: 64 },
        12: { n: 62 },
        14: { n: 64 },
      };
      const riff = bar % 2 === 0 ? riffA : riffB;
      const hit = riff[local];
      if (hit) {
        playLeadStab(ctx, dest, time, hit.n, 0.14, stepDur * 2.1, {
          type: 'sawtooth',
          cutoff: 2100,
          slideFrom: hit.s,
        });
      }
    },
  },

  // 3. Sewers: Dark pulsing subterranean bass + moody pads + resonant sonar drips
  sewers: {
    bpm: 96,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;
      const roots = [36, 36, 35, 34]; // C2, C2, B1, Bb1

      // Muted subterranean thud
      if (local === 0 || local === 10) {
        playKick(ctx, dest, time, 0.32, 92, 0.22);
      }
      if (local === 8) {
        playSnare(ctx, dest, time, 0.14, 140, 0.16);
      }
      if (local % 4 === 2) {
        playHat(ctx, dest, time, 0.04, false);
      }

      // Pulsing dark sub-bass (8th-note pump)
      if (local % 2 === 0) {
        const oct = local === 6 || local === 14 ? 12 : 0;
        playBass(ctx, dest, time, roots[bar]! + oct, 0.24, stepDur * 1.8, {
          type: 'triangle',
          cutoff: 480 + (local % 4 === 0 ? 180 : 0),
          resonance: 3.5,
        });
      }

      // Moody dark synth pad on bar boundaries
      if (local === 0) {
        const padChords: readonly (readonly number[])[] = [
          [48, 51, 55], // Cm
          [48, 53, 55], // Csus4
          [47, 50, 55], // G/B
          [46, 51, 55], // Eb/Bb
        ];
        playPadChord(ctx, dest, time, padChords[bar]!, 0.095, stepDur * 14, {
          type: 'sawtooth',
          cutoff: 680,
          attack: 0.22,
        });
      }

      // Resonant sonar / drip echoes
      const drips: Record<number, number> = {
        3: 75,
        11: 72,
        20: 79,
        29: 74,
        38: 75,
        46: 70,
        54: 72,
        61: 67,
      };
      if (drips[step] !== undefined) {
        playBell(ctx, dest, time, drips[step]!, 0.11, 0.55);
      }
    },
  },

  // 4. Scrapyard: Industrial clanking percussion + gritty metallic riff
  scrapyard: {
    bpm: 126,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;

      // Heavy industrial percussion
      if (local === 0 || local === 3 || local === 8 || local === 11) {
        playKick(ctx, dest, time, 0.42, 145, 0.14);
      }
      if (local === 4 || local === 12) {
        playSnare(ctx, dest, time, 0.25, 210, 0.12);
        playMetalClang(ctx, dest, time, bar % 2 === 0 ? 520 : 620, 0.13, 0.16);
      }
      if (local === 6 || local === 14 || local === 15) {
        playMetalClang(ctx, dest, time, 880, 0.08, 0.09);
      }
      playHat(ctx, dest, time, local % 2 === 0 ? 0.08 : 0.04, local === 10);

      // Gritty F# minor industrial bass riff
      const riff0 = [42, -1, 42, 45, -1, 42, 47, -1, 42, -1, 40, 42, 45, 47, 45, -1];
      const riff1 = [42, -1, 45, -1, 47, 49, 47, 45, 44, -1, 42, -1, 40, -1, 41, -1];
      const note = (bar % 2 === 0 ? riff0 : riff1)[local]!;
      if (note > 0) {
        playBass(ctx, dest, time, note, 0.26, stepDur * 1.4, {
          type: 'sawtooth',
          cutoff: 1050,
          resonance: 2.8,
          drive: true,
        });
      }

      // Metallic lead stabs on syncopation
      if (local === 2 || local === 9 || (bar === 3 && local === 14)) {
        const stabMidi = bar < 2 ? 66 : bar === 2 ? 69 : 71;
        playLeadStab(ctx, dest, time, stabMidi, 0.13, stepDur * 1.6, {
          type: 'square',
          cutoff: 2300,
        });
      }
    },
  },

  // 5. Crystal Caves: Shimmering resonant harmonic bells + glassy drone bass
  caves: {
    bpm: 92,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;
      const roots = [43, 41, 39, 38]; // G2, F2, Eb2, D2

      // Deep resonant cavern bass
      if (local === 0 || local === 8) {
        playBass(ctx, dest, time, roots[bar]! - 12, local === 0 ? 0.24 : 0.16, stepDur * 6.5, {
          type: 'sine',
          cutoff: 360,
          resonance: 1.5,
        });
      }

      // Shimmering crystalline pad
      if (local === 0) {
        const pads: readonly (readonly number[])[] = [
          [55, 58, 62, 67], // Gm
          [53, 57, 60, 65], // F
          [51, 55, 58, 63], // Eb
          [50, 54, 57, 62], // D
        ];
        playPadChord(ctx, dest, time, pads[bar]!, 0.085, stepDur * 15, {
          type: 'triangle',
          cutoff: 1400,
          attack: 0.26,
        });
      }

      // Resonant harmonic bell pattern
      const bellNotes: readonly (readonly (number | null)[])[] = [
        [74, null, 70, null, 67, null, 74, null, 77, null, 74, null, 70, null, null, null],
        [72, null, 69, null, 65, null, 72, null, 74, null, 72, null, 69, null, null, null],
        [70, null, 67, null, 63, null, 70, null, 74, null, 70, null, 67, null, null, null],
        [69, null, 66, null, 62, null, 69, null, 72, null, 69, null, 66, null, 74, null],
      ];
      const bMidi = bellNotes[bar]![local];
      if (bMidi !== null && bMidi !== undefined) {
        playBell(ctx, dest, time, bMidi, 0.13, 0.95);
      }

      // Soft cave pulse
      if (local === 0 || local === 12) {
        playKick(ctx, dest, time, 0.2, 82, 0.2);
      }
    },
  },

  // 6. Frozen City: Crystalline icy minor arpeggios + crisp cold percussion
  frozen: {
    bpm: 112,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;

      // Crisp winter electronic drums
      if (local === 0 || local === 6 || local === 8) {
        playKick(ctx, dest, time, 0.34, 120, 0.15);
      }
      if (local === 4 || local === 12) {
        playSnare(ctx, dest, time, 0.22, 230, 0.14);
      }
      if (local % 2 === 1) {
        playHat(ctx, dest, time, 0.08, local === 15);
      }

      // Frosty Am -> F -> Dm -> E7 bass pulse
      const roots = [33, 29, 38, 40]; // A1, F1, D2, E2
      if (local % 2 === 0) {
        playBass(ctx, dest, time, roots[bar]! + (local % 4 === 2 ? 12 : 0), 0.22, stepDur * 1.5, {
          type: 'sawtooth',
          cutoff: 760,
          resonance: 2.4,
        });
      }

      // Crystalline icy 16th-note minor arpeggios
      const arps: readonly (readonly number[])[] = [
        [69, 72, 76, 81], // Am
        [65, 69, 72, 77], // F
        [62, 65, 69, 74], // Dm
        [64, 68, 71, 76], // E
      ];
      const arpNote = arps[bar]![local % 4]!;
      playBell(ctx, dest, time, arpNote, local % 4 === 0 ? 0.11 : 0.075, stepDur * 2.4);

      // Haunting high cold melody on bars 2 & 4
      if (bar === 1 && local === 0) playLeadStab(ctx, dest, time, 81, 0.1, stepDur * 6, { type: 'triangle', cutoff: 2600 });
      if (bar === 1 && local === 8) playLeadStab(ctx, dest, time, 79, 0.1, stepDur * 6, { type: 'triangle', cutoff: 2600 });
      if (bar === 3 && local === 0) playLeadStab(ctx, dest, time, 76, 0.11, stepDur * 6, { type: 'triangle', cutoff: 2600 });
      if (bar === 3 && local === 8) playLeadStab(ctx, dest, time, 75, 0.11, stepDur * 6, { type: 'triangle', cutoff: 2600 });
    },
  },

  // 7. Labs: Dark pulsing subterranean acid-bass + moody pads + eerie sonar/Geiger accents
  labs: {
    bpm: 104,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;

      // Tight mechanical pulse drums
      if (local === 0 || local === 8 || local === 14) {
        playKick(ctx, dest, time, 0.34, 118, 0.14);
      }
      if (local === 4 || local === 12) {
        playSnare(ctx, dest, time, 0.2, 240, 0.1);
      }
      if (local % 2 === 0) {
        playHat(ctx, dest, time, 0.065, false);
      }

      // Acid-modulated D# minor bassline
      const acid = [39, 39, 46, 39, 42, 39, 45, 42, 39, 39, 46, 49, 46, 42, 41, 39];
      const shift = bar === 2 ? -2 : bar === 3 ? -1 : 0;
      const sweep = 500 + ((step % 16) / 16) * 950;
      playBass(ctx, dest, time, acid[local]! + shift, 0.22, stepDur * 1.1, {
        type: 'sawtooth',
        cutoff: sweep,
        resonance: 4.5,
      });

      // Eerie lab synth pad
      if (local === 0) {
        const chords: readonly (readonly number[])[] = [
          [51, 54, 58], // D#m
          [51, 56, 58], // D#sus4
          [49, 54, 57], // C#dim-ish
          [50, 54, 58], // Daug-ish tension
        ];
        playPadChord(ctx, dest, time, chords[bar]!, 0.09, stepDur * 14, {
          type: 'sawtooth',
          cutoff: 820,
          attack: 0.18,
        });
      }

      // Sonar / bio-scanner bleeps
      if (local === 3 || local === 11) {
        const bleep = bar % 2 === 0 ? 78 : 82;
        playBell(ctx, dest, time, bleep, 0.09, 0.35);
      }
    },
  },

  // 8. Palace: Regal ominous organ-synth chord progression + marching percussion
  palace: {
    bpm: 110,
    steps: 64,
    stepFn: (ctx, dest, time, step, stepDur) => {
      const bar = Math.floor(step / 16);
      const local = step % 16;

      // Marching timpani & military snare cadence
      if (local === 0 || local === 8 || local === 12) {
        playKick(ctx, dest, time, 0.4, 115, 0.22);
      }
      if (local === 4 || local === 10 || local === 14 || local === 15) {
        playSnare(ctx, dest, time, local === 4 ? 0.24 : 0.14, 195, 0.12);
      }
      if (local % 4 === 2) {
        playHat(ctx, dest, time, 0.06, false);
      }

      // Regal ominous organ chords: Cm -> Ab -> Fm -> G7
      const roots = [36, 32, 29, 31];
      const organChords: readonly (readonly number[])[] = [
        [48, 55, 60, 63, 67], // Cm
        [44, 51, 56, 60, 63], // Ab
        [41, 48, 53, 56, 60], // Fm
        [43, 50, 55, 59, 62], // G
      ];
      if (local === 0 || local === 8) {
        playPadChord(ctx, dest, time, organChords[bar]!, 0.115, stepDur * 7.8, {
          type: 'sawtooth',
          cutoff: 1350,
          attack: 0.03,
        });
      }

      // Marching bass pedal
      if (local % 4 === 0 || local === 14) {
        playBass(ctx, dest, time, roots[bar]!, 0.27, stepDur * 2.4, {
          type: 'sawtooth',
          cutoff: 720,
          resonance: 1.8,
        });
      }

      // Solemn imperial brassy motif
      const motif: Record<number, number> = {
        0: 72,
        6: 75,
        8: 74,
        12: 72,
        16: 68,
        22: 72,
        24: 75,
        32: 77,
        38: 75,
        40: 72,
        48: 74,
        54: 71,
        56: 74,
        60: 79,
      };
      if (motif[step] !== undefined) {
        playLeadStab(ctx, dest, time, motif[step]!, 0.14, stepDur * 2.8, {
          type: 'square',
          cutoff: 1900,
        });
      }
    },
  },

  // 9. Boss Themes 1..5: High-tempo aggressive distorted bass + double-time drums + tense chromatic stabs
  boss1: createBossTheme(148, 40, 1), // Big Bandit (Em)
  boss2: createBossTheme(152, 38, 2), // Big Dog (Dm)
  boss3: createBossTheme(158, 42, 3), // Lil' Hunter (F#m)
  boss4: createBossTheme(154, 36, 4), // Nuclear Throne (Cm)
  boss5: createBossTheme(164, 37, 5), // Throne II (C#m)

  // 10. Game Over: Somber sparse wasteland dirge
  game_over: {
    bpm: 72,
    steps: 32,
    stepFn: (ctx, dest, time, step, stepDur) => {
      if (step === 0) {
        playPadChord(ctx, dest, time, [45, 48, 52], 0.09, stepDur * 14, {
          type: 'triangle',
          cutoff: 600,
          attack: 0.25,
        });
        playBass(ctx, dest, time, 33, 0.22, stepDur * 12, { type: 'sine', cutoff: 300 });
      } else if (step === 16) {
        playPadChord(ctx, dest, time, [41, 45, 48], 0.085, stepDur * 14, {
          type: 'triangle',
          cutoff: 520,
          attack: 0.25,
        });
        playBass(ctx, dest, time, 29, 0.22, stepDur * 12, { type: 'sine', cutoff: 280 });
      }
      const notes: Record<number, number> = { 4: 64, 10: 60, 20: 57, 26: 52 };
      if (notes[step] !== undefined) {
        playPluck(ctx, dest, time, notes[step]!, 0.13, stepDur * 4.5, 0.2);
      }
    },
  },
};

// ============================================================================
// SYNTH MUSIC & AMBIENCE SEQUENCER
// ============================================================================

interface AmbienceSession {
  bus: GainNode;
  sources: Array<{ stop?: (when?: number) => void; disconnect: () => void }>;
  intervalId: ReturnType<typeof setInterval> | null;
}

export class SynthMusicSequencer {
  private readonly ctx: AudioContext | null;
  private readonly musicDest: AudioNode | null;
  private readonly ambienceDest: AudioNode | null;

  private disposed = false;

  // Music state
  private currentMusicKey: string | null = null;
  private currentThemeId: SynthMusicThemeId | null = null;
  private musicBus: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  // Ambience state
  private currentAmbienceKey: string | null = null;
  private ambienceSession: AmbienceSession | null = null;
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  private readonly lookaheadMs = 25;
  private readonly scheduleAheadSec = 0.12;

  constructor(
    ctx: AudioContext | null,
    musicDest: AudioNode | null,
    ambienceDest: AudioNode | null
  ) {
    this.ctx = ctx;
    this.musicDest = musicDest;
    this.ambienceDest = ambienceDest;
  }

  private scheduleCleanup(fn: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      this.pendingTimeouts.delete(id);
      fn();
    }, delayMs);
    this.pendingTimeouts.add(id);
  }

  public getCurrentMusic(): string | null {
    return this.currentMusicKey;
  }

  public getCurrentAmbience(): string | null {
    return this.currentAmbienceKey;
  }

  public isPlayingMusic(): boolean {
    return this.musicTimer !== null && !this.disposed;
  }

  public isPlayingAmbience(): boolean {
    return this.ambienceSession !== null && !this.disposed;
  }

  /**
   * Starts playing an original procedural wasteland theme for the given trackKey.
   * Safe no-op in headless Node or when AudioContext is absent/closed.
   */
  public playMusic(trackKey: string, fadeSec: number = 0.35): void {
    if (this.disposed) return;

    const themeId = resolveSynthMusicTheme(trackKey);
    if (this.currentMusicKey === trackKey && this.musicTimer !== null) {
      return;
    }

    // Stop any previous sequence cleanly
    this.stopMusic(Math.min(0.25, fadeSec));

    this.currentMusicKey = trackKey;
    this.currentThemeId = themeId;

    if (!this.ctx || !this.musicDest || this.ctx.state === 'closed') {
      return;
    }

    try {
      const now = this.ctx.currentTime;
      const bus = this.ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(0.85, now + Math.max(0.02, fadeSec));
      bus.connect(this.musicDest);

      this.musicBus = bus;
      this.stepIndex = 0;
      this.nextStepTime = now + 0.04;

      const theme = THEMES[themeId];
      const stepDur = 60 / theme.bpm / 4; // 16th note duration

      const scheduleTick = () => {
        if (this.disposed || !this.ctx || !this.musicBus || this.ctx.state === 'closed') {
          this.stopMusic(0);
          return;
        }
        // Wait cleanly without drifting if context is still suspended
        if (this.ctx.state !== 'running') {
          this.nextStepTime = this.ctx.currentTime + 0.05;
          return;
        }

        const currentTime = this.ctx.currentTime;
        // Catch up cleanly after tab backgrounding so we never burst dozens of notes
        if (this.nextStepTime < currentTime - 0.25) {
          this.nextStepTime = currentTime + 0.04;
        }

        while (this.nextStepTime < currentTime + this.scheduleAheadSec) {
          const swingOffset =
            theme.swing && this.stepIndex % 2 === 1 ? stepDur * theme.swing : 0;
          try {
            theme.stepFn(
              this.ctx,
              this.musicBus,
              this.nextStepTime + swingOffset,
              this.stepIndex,
              stepDur
            );
          } catch {
            // Keep scheduler resilient
          }
          this.stepIndex = (this.stepIndex + 1) % theme.steps;
          this.nextStepTime += stepDur;
        }
      };

      scheduleTick();
      this.musicTimer = setInterval(scheduleTick, this.lookaheadMs);
    } catch {
      this.stopMusic(0);
    }
  }

  /**
   * Stops procedural music playback and clears all timers/buses cleanly.
   */
  public stopMusic(fadeSec: number = 0.25): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    const oldBus = this.musicBus;
    this.musicBus = null;
    this.currentMusicKey = null;
    this.currentThemeId = null;

    if (oldBus && this.ctx && this.ctx.state !== 'closed' && fadeSec > 0.01) {
      try {
        const now = this.ctx.currentTime;
        oldBus.gain.cancelScheduledValues(now);
        oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), now);
        oldBus.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        this.scheduleCleanup(() => {
          try {
            oldBus.disconnect();
          } catch {
            // ignore
          }
        }, Math.ceil((fadeSec + 0.06) * 1000));
        return;
      } catch {
        // Fall through to immediate disconnect
      }
    }

    if (oldBus) {
      try {
        oldBus.disconnect();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Alias for playAmbience() for ergonomic API parity.
   */
  public startAmbience(ambKey: string, fadeSec: number = 0.6): void {
    this.playAmbience(ambKey, fadeSec);
  }

  /**
   * Starts procedural environmental ambience routed into ambienceGain.
   * Safe no-op in headless Node or when AudioContext is absent/closed.
   */
  public playAmbience(ambKey: string, fadeSec: number = 0.6): void {
    if (this.disposed) return;

    if (this.currentAmbienceKey === ambKey && this.ambienceSession !== null) {
      return;
    }

    this.stopAmbience(Math.min(0.3, fadeSec));
    this.currentAmbienceKey = ambKey;

    if (!this.ctx || !this.ambienceDest || this.ctx.state === 'closed') {
      return;
    }

    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const kind = resolveSynthAmbienceKind(ambKey);
      const bank = getNoiseBank(ctx);

      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(0.45, now + Math.max(0.05, fadeSec));
      bus.connect(this.ambienceDest);

      const sources: Array<{ stop?: (when?: number) => void; disconnect: () => void }> = [bus];
      let intervalId: ReturnType<typeof setInterval> | null = null;

      if (kind === 'campfire') {
        // Warm low fire rumble + soft periodic ember crackles
        const noise = ctx.createBufferSource();
        noise.buffer = bank.brown;
        noise.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(240, now);

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.45, now);

        noise.connect(lp);
        lp.connect(rumbleGain);
        rumbleGain.connect(bus);
        noise.start(now);
        sources.push(noise, lp, rumbleGain);

        intervalId = setInterval(() => {
          if (this.disposed || ctx.state !== 'running') return;
          if (Math.random() > 0.58) return;
          try {
            const t = ctx.currentTime + Math.random() * 0.08;
            const crackle = ctx.createBufferSource();
            crackle.buffer = bank.white;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(1800 + Math.random() * 3400, t);
            bp.Q.setValueAtTime(3.5, t);
            const g = ctx.createGain();
            const dur = 0.012 + Math.random() * 0.025;
            g.gain.setValueAtTime(0.12 + Math.random() * 0.18, t);
            g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
            crackle.connect(bp);
            bp.connect(g);
            g.connect(bus);
            crackle.start(t, Math.random() * 1.2);
            crackle.stop(t + dur + 0.01);
          } catch {
            // ignore
          }
        }, 180);
      } else if (kind === 'desert' || kind === 'scrapyard') {
        // Filtered pink/brown wind with slow gust LFO
        const noise = ctx.createBufferSource();
        noise.buffer = kind === 'desert' ? bank.pink : bank.brown;
        noise.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(kind === 'desert' ? 420 : 320, now);
        bp.Q.setValueAtTime(1.6, now);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.14, now);
        lfoGain.gain.setValueAtTime(180, now);
        lfo.connect(lfoGain);
        lfoGain.connect(bp.frequency);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.38, now);

        noise.connect(bp);
        bp.connect(g);
        g.connect(bus);
        noise.start(now);
        lfo.start(now);
        sources.push(noise, bp, lfo, lfoGain, g);
      } else if (kind === 'frozen') {
        // Cold howling arctic wind (dual filtered pink noise + eerie whistle LFO)
        const noise = ctx.createBufferSource();
        noise.buffer = bank.pink;
        noise.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(980, now);
        bp.Q.setValueAtTime(4.2, now);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.11, now);
        lfoGain.gain.setValueAtTime(340, now);
        lfo.connect(lfoGain);
        lfoGain.connect(bp.frequency);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32, now);

        noise.connect(bp);
        bp.connect(g);
        g.connect(bus);
        noise.start(now);
        lfo.start(now);
        sources.push(noise, bp, lfo, lfoGain, g);
      } else {
        // Subterranean / Caves / Labs / Palace: deep lowpass drone + subtle resonant rumble
        const noise = ctx.createBufferSource();
        noise.buffer = bank.brown;
        noise.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(kind === 'palace' ? 210 : 180, now);

        const drone1 = ctx.createOscillator();
        const drone2 = ctx.createOscillator();
        const droneGain = ctx.createGain();
        const baseFreq = kind === 'palace' ? 55 : kind === 'caves' ? 61.74 : 49;
        drone1.type = 'sine';
        drone1.frequency.setValueAtTime(baseFreq, now);
        drone2.type = 'triangle';
        drone2.frequency.setValueAtTime(baseFreq * 1.498, now);
        droneGain.gain.setValueAtTime(0.18, now);

        const droneLp = ctx.createBiquadFilter();
        droneLp.type = 'lowpass';
        droneLp.frequency.setValueAtTime(160, now);

        noise.connect(lp);
        lp.connect(bus);
        drone1.connect(droneLp);
        drone2.connect(droneLp);
        droneLp.connect(droneGain);
        droneGain.connect(bus);

        noise.start(now);
        drone1.start(now);
        drone2.start(now);
        sources.push(noise, lp, drone1, drone2, droneLp, droneGain);

        // Occasional subtle cave/sewer water drip
        if (kind === 'subterranean' || kind === 'caves') {
          intervalId = setInterval(() => {
            if (this.disposed || ctx.state !== 'running') return;
            if (Math.random() > 0.35) return;
            try {
              const t = ctx.currentTime + 0.02;
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              const f0 = 700 + Math.random() * 650;
              osc.type = 'sine';
              osc.frequency.setValueAtTime(f0, t);
              osc.frequency.exponentialRampToValueAtTime(f0 * 1.55, t + 0.08);
              g.gain.setValueAtTime(0.08, t);
              g.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
              osc.connect(g);
              g.connect(bus);
              osc.start(t);
              osc.stop(t + 0.14);
            } catch {
              // ignore
            }
          }, 950);
        }
      }

      this.ambienceSession = { bus, sources, intervalId };
    } catch {
      this.stopAmbience(0);
    }
  }

  /**
   * Stops procedural ambience and cleans up all nodes and timers.
   */
  public stopAmbience(fadeSec: number = 0.35): void {
    const session = this.ambienceSession;
    this.ambienceSession = null;
    this.currentAmbienceKey = null;

    if (!session) return;
    if (session.intervalId !== null) {
      clearInterval(session.intervalId);
    }

    const cleanupNodes = () => {
      for (const node of session.sources) {
        if (node.stop) {
          try {
            node.stop();
          } catch {
            // ignore
          }
        }
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
    };

    if (this.ctx && this.ctx.state !== 'closed' && fadeSec > 0.01) {
      try {
        const now = this.ctx.currentTime;
        session.bus.gain.cancelScheduledValues(now);
        session.bus.gain.setValueAtTime(Math.max(0.0001, session.bus.gain.value), now);
        session.bus.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        this.scheduleCleanup(cleanupNodes, Math.ceil((fadeSec + 0.06) * 1000));
        return;
      } catch {
        // Fall through to immediate cleanup
      }
    }

    cleanupNodes();
  }

  /**
   * Permanently disposes all timers and audio nodes with zero leaks.
   */
  public dispose(): void {
    this.disposed = true;
    this.stopMusic(0);
    this.stopAmbience(0);
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts.clear();
  }
}
