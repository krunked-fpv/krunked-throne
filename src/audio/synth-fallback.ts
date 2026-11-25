/**
 * Procedural Web Audio retro sound synthesizer for fallback mode.
 * Activates when manifest.sourceMode === 'fallback' or when sound files cannot be decoded.
 * Synthesizes Vlambeer-style punchy gunfire, explosions, hits, deaths, pickups,
 * portal swirls, celebratory level-up fanfares, and crisp UI clicks.
 */

export type SynthSoundKind =
  | 'bullet'
  | 'shell'
  | 'bolt'
  | 'explosive'
  | 'energy'
  | 'melee'
  | 'explosion'
  | 'hit'
  | 'death'
  | 'pickup'
  | 'portal'
  | 'level_up'
  | 'ui_click';

export interface SynthVoice {
  stop: () => void;
  kind: SynthSoundKind;
  startTime: number;
}

export interface SynthOptions {
  volume?: number;
  pitchRate?: number;
  pan?: number;
}

/**
 * Classifies a sound identifier or name into one of the procedural synthesizer kinds.
 */
export function classifySound(soundName: string): SynthSoundKind {
  const name = soundName.toLowerCase();

  // 1. UI Clicks & Navigation
  if (
    name.includes('click') ||
    name.includes('select') ||
    name.includes('confirm') ||
    name.includes('button') ||
    name.includes('cursor') ||
    name.includes('pause') ||
    name.startsWith('ui')
  ) {
    return 'ui_click';
  }

  // 2. Level Up / Mutations / Ultras
  if (
    name.includes('levelup') ||
    name.includes('level_up') ||
    name.includes('skill') ||
    name.includes('mutation') ||
    name.includes('ultra')
  ) {
    return 'level_up';
  }

  // 3. Explosions & Blasts
  if (
    name.includes('explo') ||
    name.includes('blast') ||
    name.includes('boom') ||
    name.includes('barrel') ||
    name.includes('detonate')
  ) {
    return 'explosion';
  }

  // 4. Portal & Vortex
  if (
    name.includes('portal') ||
    name.includes('rift') ||
    name.includes('vortex') ||
    name.includes('warp')
  ) {
    return 'portal';
  }

  // 5. Pickups / Rads / Chests
  if (
    name.includes('rad') ||
    name.includes('pickup') ||
    name.includes('chest') ||
    name.includes('ammo') ||
    name.includes('hp') ||
    name.includes('canister') ||
    name.includes('gem')
  ) {
    return 'pickup';
  }

  // 6. Deaths
  if (
    name.includes('dead') ||
    name.includes('die') ||
    name.includes('death') ||
    name.includes('kill')
  ) {
    return 'death';
  }

  // 7. Hits & Hurts
  if (
    name.includes('hurt') ||
    name.includes('hit') ||
    name.includes('damage') ||
    name.includes('impact') ||
    name.includes('armor')
  ) {
    return 'hit';
  }

  // 8. Specific Gunfire Classes
  // Melee & Deflect
  if (
    name.includes('wrench') ||
    name.includes('sword') ||
    name.includes('hammer') ||
    name.includes('shovel') ||
    name.includes('screwdriver') ||
    name.includes('katana') ||
    name.includes('slash') ||
    name.includes('melee') ||
    name.includes('swing') ||
    name.includes('deflect') ||
    name.includes('reflect')
  ) {
    return 'melee';
  }

  // Energy / Laser / Plasma / Lightning
  if (
    name.includes('laser') ||
    name.includes('plasma') ||
    name.includes('lightning') ||
    name.includes('energy') ||
    name.includes('ion') ||
    name.includes('beam') ||
    name.includes('spark')
  ) {
    return 'energy';
  }

  // Explosive weaponry (Rocket / Grenade / Missile)
  if (
    name.includes('rocket') ||
    name.includes('grenade') ||
    name.includes('nuke') ||
    name.includes('missile') ||
    name.includes('bazooka')
  ) {
    return 'explosive';
  }

  // Bolt / Crossbow / Splinter / Disc
  if (
    name.includes('bolt') ||
    name.includes('crossbow') ||
    name.includes('splinter') ||
    name.includes('disc') ||
    name.includes('arrow')
  ) {
    return 'bolt';
  }

  // Shell / Shotgun / Flak
  if (
    name.includes('shotgun') ||
    name.includes('flak') ||
    name.includes('shell') ||
    name.includes('slug') ||
    name.includes('eraser')
  ) {
    return 'shell';
  }

  // Bullet / Pistol / Machinegun / Revolver (default gunfire fallback)
  if (
    name.includes('bullet') ||
    name.includes('pistol') ||
    name.includes('revolver') ||
    name.includes('rifle') ||
    name.includes('machinegun') ||
    name.includes('minigun') ||
    name.includes('smg') ||
    name.includes('pop') ||
    name.includes('fire') ||
    name.includes('shoot') ||
    name.includes('gun')
  ) {
    return 'bullet';
  }

  // Catch-all default
  return 'bullet';
}

// Cached 1-second white noise buffer & saturation curve per AudioContext
const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();
const crunchCurveCache = new WeakMap<AudioContext, Float32Array<ArrayBuffer>>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBufferCache.get(ctx);
  if (!buffer) {
    const sampleRate = ctx.sampleRate || 44100;
    buffer = ctx.createBuffer(1, sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleRate; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBufferCache.set(ctx, buffer);
  }
  return buffer;
}

function getCrunchCurve(ctx: AudioContext): Float32Array<ArrayBuffer> {
  let curve = crunchCurveCache.get(ctx);
  if (!curve) {
    const samples = 256;
    curve = new Float32Array(new ArrayBuffer(samples * 4));
    const drive = 24;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * (1 + drive * 0.14));
    }
    crunchCurveCache.set(ctx, curve);
  }
  return curve;
}

/**
 * Plays a procedurally synthesized retro sound effect using Web Audio API nodes.
 * Safe in Node / headless environments (returns a no-op voice).
 */
export function playSynthSound(
  ctx: AudioContext | null,
  soundNameOrKind: string,
  destination?: AudioNode | null,
  options: SynthOptions = {}
): SynthVoice {
  const kind = classifySound(soundNameOrKind);
  const rawLower = soundNameOrKind.toLowerCase();
  const now = ctx ? ctx.currentTime : Date.now() / 1000;
  const volume = Math.max(0, Math.min(2, options.volume ?? 1.0));
  const pitchRate = Math.max(0.2, Math.min(5, options.pitchRate ?? 1.0));
  const pan = Math.max(-1, Math.min(1, options.pan ?? 0));

  // In headless Node or when AudioContext is absent/closed
  if (!ctx || ctx.state === 'closed') {
    return {
      stop: () => {},
      kind,
      startTime: now,
    };
  }

  try {
    const targetDest = destination || ctx.destination;
    const activeNodes: Array<{ stop?: (when?: number) => void; disconnect: () => void }> = [];

    // Voice output bus (supports stereo panning across all synth layers)
    let voiceOut: AudioNode = targetDest;
    if (Math.abs(pan) > 0.001 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      panner.connect(targetDest);
      activeNodes.push(panner);
      voiceOut = panner;
    }

    const gainNode = ctx.createGain();
    gainNode.connect(voiceOut);
    activeNodes.push(gainNode);

    const safeStop = () => {
      try {
        for (const node of activeNodes) {
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
      } catch {
        // ignore
      }
    };

    switch (kind) {
      case 'bullet': {
        const isHeavy =
          rawLower.includes('heavy') ||
          rawLower.includes('minigun') ||
          rawLower.includes('bouncer') ||
          rawLower.includes('rifle');

        // 1. Punchy square-body snap
        const osc = ctx.createOscillator();
        osc.type = isHeavy ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime((isHeavy ? 340 : 520) * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, (isHeavy ? 62 : 95) * pitchRate),
          now + (isHeavy ? 0.11 : 0.08)
        );

        const bodyFilter = ctx.createBiquadFilter();
        bodyFilter.type = 'lowpass';
        bodyFilter.frequency.setValueAtTime(2600 * pitchRate, now);
        bodyFilter.frequency.exponentialRampToValueAtTime(420, now + 0.09);

        gainNode.gain.setValueAtTime((isHeavy ? 0.48 : 0.4) * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.12 : 0.09));

        osc.connect(bodyFilter);
        bodyFilter.connect(gainNode);

        // 2. Crisp filtered muzzle crack
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const crackFilter = ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime((isHeavy ? 1800 : 2600) * pitchRate, now);
        crackFilter.Q.setValueAtTime(0.9, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime((isHeavy ? 0.44 : 0.34) * volume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.065 : 0.042));

        noiseSrc.connect(crackFilter);
        crackFilter.connect(noiseGain);
        noiseGain.connect(voiceOut);

        // 3. Chest sub-thump transient
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime((isHeavy ? 155 : 185) * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(48, now + 0.055);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime((isHeavy ? 0.48 : 0.32) * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        sub.connect(subGain);
        subGain.connect(voiceOut);

        activeNodes.push(osc, bodyFilter, noiseSrc, crackFilter, noiseGain, sub, subGain);
        osc.start(now);
        noiseSrc.start(now, Math.random() * 0.4);
        sub.start(now);
        osc.stop(now + 0.13);
        noiseSrc.stop(now + 0.075);
        sub.stop(now + 0.075);
        break;
      }

      case 'shell': {
        // Vlambeer-style shotgun blast: saturating sub-thump + wide crack + lowpass cannon tail
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCrunchCurve(ctx);
        shaper.connect(gainNode);

        // 1. Roaring filtered noise blast
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2800 * pitchRate, now);
        lp.frequency.exponentialRampToValueAtTime(Math.max(80, 210 * pitchRate), now + 0.25);
        lp.Q.setValueAtTime(1.4, now);

        noiseSrc.connect(lp);
        lp.connect(shaper);

        // 2. High-energy initial powder crack
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = getNoiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(3400 * pitchRate, now);
        hp.Q.setValueAtTime(0.7, now);
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.45 * volume, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        crackSrc.connect(hp);
        hp.connect(crackGain);
        crackGain.connect(voiceOut);

        // 3. Heavy chest-punching sub-thump
        const sub = ctx.createOscillator();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(175 * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(Math.max(28, 36 * pitchRate), now + 0.2);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.62 * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        sub.connect(subGain);
        subGain.connect(voiceOut);

        gainNode.gain.setValueAtTime(0.64 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

        activeNodes.push(shaper, noiseSrc, lp, crackSrc, hp, crackGain, sub, subGain);
        noiseSrc.start(now, Math.random() * 0.3);
        crackSrc.start(now, Math.random() * 0.5);
        sub.start(now);
        noiseSrc.stop(now + 0.28);
        crackSrc.stop(now + 0.055);
        sub.stop(now + 0.23);
        break;
      }

      case 'bolt': {
        // Crossbow / Disc thwip: snappy string twang + high-speed air zip
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(760 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(70, 150 * pitchRate), now + 0.11);

        gainNode.gain.setValueAtTime(0.46 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gainNode);

        // Crisp air-whistle zip
        const zipSrc = ctx.createBufferSource();
        zipSrc.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3600 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(900 * pitchRate, now + 0.09);
        bp.Q.setValueAtTime(3.2, now);
        const zipGain = ctx.createGain();
        zipGain.gain.setValueAtTime(0.28 * volume, now);
        zipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        zipSrc.connect(bp);
        bp.connect(zipGain);
        zipGain.connect(voiceOut);

        activeNodes.push(osc, zipSrc, bp, zipGain);
        osc.start(now);
        zipSrc.start(now, Math.random() * 0.4);
        osc.stop(now + 0.14);
        zipSrc.stop(now + 0.11);
        break;
      }

      case 'explosive': {
        // Rocket / Grenade launcher: resonant hollow tube "thoomp" + propellant hiss
        const tube = ctx.createOscillator();
        tube.type = 'sine';
        tube.frequency.setValueAtTime(210 * pitchRate, now);
        tube.frequency.exponentialRampToValueAtTime(Math.max(42, 58 * pitchRate), now + 0.16);

        gainNode.gain.setValueAtTime(0.62 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        tube.connect(gainNode);

        const hiss = ctx.createBufferSource();
        hiss.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(950 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(2600 * pitchRate, now + 0.16);
        bp.Q.setValueAtTime(1.4, now);
        const hissGain = ctx.createGain();
        hissGain.gain.setValueAtTime(0.36 * volume, now);
        hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        hiss.connect(bp);
        bp.connect(hissGain);
        hissGain.connect(voiceOut);

        activeNodes.push(tube, hiss, bp, hissGain);
        tube.start(now);
        hiss.start(now, Math.random() * 0.3);
        tube.stop(now + 0.2);
        hiss.stop(now + 0.24);
        break;
      }

      case 'explosion': {
        // Massive multi-layered detonation: crunch waveshaper + sub boom + bright crack + rumble
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCrunchCurve(ctx);
        shaper.connect(gainNode);

        // 1. Main sweeping lowpass roar
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200 * pitchRate, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(45, 75 * pitchRate), now + 0.56);
        filter.Q.setValueAtTime(1.8, now);
        noiseSrc.connect(filter);
        filter.connect(shaper);

        // 2. Razor-sharp shockwave crack
        const crack = ctx.createBufferSource();
        crack.buffer = getNoiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1600, now);
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.55 * volume, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        crack.connect(hp);
        hp.connect(crackGain);
        crackGain.connect(voiceOut);

        // 3. Earth-shaking sub-bass drop
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(125 * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(Math.max(22, 26 * pitchRate), now + 0.48);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.76 * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        sub.connect(subGain);
        subGain.connect(voiceOut);

        gainNode.gain.setValueAtTime(0.82 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        activeNodes.push(shaper, noiseSrc, filter, crack, hp, crackGain, sub, subGain);
        noiseSrc.start(now, Math.random() * 0.25);
        crack.start(now, Math.random() * 0.5);
        sub.start(now);
        noiseSrc.stop(now + 0.62);
        crack.stop(now + 0.065);
        sub.stop(now + 0.54);
        break;
      }

      case 'energy': {
        const isLightning = rawLower.includes('lightning') || rawLower.includes('spark');
        const isPlasma = rawLower.includes('plasma');

        // Distinct zappy FM sweep tailored for laser / plasma / lightning
        const carrier = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();

        if (isLightning) {
          carrier.type = 'sawtooth';
          carrier.frequency.setValueAtTime(2200 * pitchRate, now);
          carrier.frequency.exponentialRampToValueAtTime(Math.max(120, 260 * pitchRate), now + 0.16);
          mod.type = 'square';
          mod.frequency.setValueAtTime(95 * pitchRate, now);
          modGain.gain.setValueAtTime(900 * pitchRate, now);
          modGain.gain.exponentialRampToValueAtTime(60, now + 0.16);

          // High-voltage crackle noise
          const zapNoise = ctx.createBufferSource();
          zapNoise.buffer = getNoiseBuffer(ctx);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(4200 * pitchRate, now);
          bp.Q.setValueAtTime(2.5, now);
          const zGain = ctx.createGain();
          zGain.gain.setValueAtTime(0.32 * volume, now);
          zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          zapNoise.connect(bp);
          bp.connect(zGain);
          zGain.connect(voiceOut);
          activeNodes.push(zapNoise, bp, zGain);
          zapNoise.start(now, Math.random() * 0.5);
          zapNoise.stop(now + 0.15);
        } else if (isPlasma) {
          carrier.type = 'sawtooth';
          carrier.frequency.setValueAtTime(920 * pitchRate, now);
          carrier.frequency.exponentialRampToValueAtTime(Math.max(70, 140 * pitchRate), now + 0.22);
          mod.type = 'sine';
          mod.frequency.setValueAtTime(48 * pitchRate, now);
          modGain.gain.setValueAtTime(340 * pitchRate, now);
          modGain.gain.exponentialRampToValueAtTime(25, now + 0.2);
        } else {
          // Razor-sharp sci-fi laser FM zap
          carrier.type = 'sine';
          carrier.frequency.setValueAtTime(1850 * pitchRate, now);
          carrier.frequency.exponentialRampToValueAtTime(Math.max(90, 210 * pitchRate), now + 0.15);
          mod.type = 'triangle';
          mod.frequency.setValueAtTime(640 * pitchRate, now);
          mod.frequency.exponentialRampToValueAtTime(110 * pitchRate, now + 0.14);
          modGain.gain.setValueAtTime(650 * pitchRate, now);
          modGain.gain.exponentialRampToValueAtTime(20, now + 0.14);
        }

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(isPlasma ? 2400 : 4200, now);
        lp.frequency.exponentialRampToValueAtTime(480, now + 0.18);
        lp.Q.setValueAtTime(isPlasma ? 4.5 : 2.2, now);

        const dur = isPlasma ? 0.23 : 0.17;
        gainNode.gain.setValueAtTime(0.5 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);

        mod.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(lp);
        lp.connect(gainNode);

        activeNodes.push(carrier, mod, modGain, lp);
        carrier.start(now);
        mod.start(now);
        carrier.stop(now + dur + 0.02);
        mod.stop(now + dur + 0.02);
        break;
      }

      case 'melee': {
        // Tactile air whoosh + crisp metallic clang (inharmonic FM partials)
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(2600 * pitchRate, now);
        bandpass.frequency.exponentialRampToValueAtTime(Math.max(220, 460 * pitchRate), now + 0.13);
        bandpass.Q.setValueAtTime(1.8, now);

        noiseSrc.connect(bandpass);
        bandpass.connect(gainNode);

        // Crisp metallic ring (dual inharmonic partials for wrench/sword/deflect)
        const clangBase = (rawLower.includes('deflect') || rawLower.includes('reflect') ? 1480 : 980) * pitchRate;
        const metal1 = ctx.createOscillator();
        const metal2 = ctx.createOscillator();
        metal1.type = 'triangle';
        metal2.type = 'sine';
        metal1.frequency.setValueAtTime(clangBase, now);
        metal1.frequency.exponentialRampToValueAtTime(clangBase * 0.78, now + 0.14);
        metal2.frequency.setValueAtTime(clangBase * 2.76, now);
        metal2.frequency.exponentialRampToValueAtTime(clangBase * 2.1, now + 0.12);

        const metalGain = ctx.createGain();
        metalGain.gain.setValueAtTime(0.36 * volume, now);
        metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        metal1.connect(metalGain);
        metal2.connect(metalGain);
        metalGain.connect(voiceOut);

        gainNode.gain.setValueAtTime(0.5 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        activeNodes.push(noiseSrc, bandpass, metal1, metal2, metalGain);
        noiseSrc.start(now, Math.random() * 0.4);
        metal1.start(now);
        metal2.start(now);
        noiseSrc.stop(now + 0.16);
        metal1.stop(now + 0.16);
        metal2.stop(now + 0.14);
        break;
      }

      case 'hit': {
        // Juicy crunchy impact: tight mid-low thump + snappy bandpassed grit crack
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(42, 68 * pitchRate), now + 0.065);

        gainNode.gain.setValueAtTime(0.52 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        osc.connect(gainNode);

        // Crunchy flesh/armor slap transient
        const crunch = ctx.createBufferSource();
        crunch.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1450 * pitchRate, now);
        bp.Q.setValueAtTime(1.2, now);
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.36 * volume, now);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        crunch.connect(bp);
        bp.connect(cGain);
        cGain.connect(voiceOut);

        activeNodes.push(osc, crunch, bp, cGain);
        osc.start(now);
        crunch.start(now, Math.random() * 0.5);
        osc.stop(now + 0.085);
        crunch.stop(now + 0.055);
        break;
      }

      case 'death': {
        // Crunchy descending splatter + punchy finality thud
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(340 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, 44 * pitchRate), now + 0.24);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1600 * pitchRate, now);
        lp.frequency.exponentialRampToValueAtTime(220, now + 0.24);

        gainNode.gain.setValueAtTime(0.52 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        osc.connect(lp);
        lp.connect(gainNode);

        // Wet crunch burst
        const splat = ctx.createBufferSource();
        splat.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(980 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(320 * pitchRate, now + 0.16);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.34 * volume, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        splat.connect(bp);
        bp.connect(sGain);
        sGain.connect(voiceOut);

        activeNodes.push(osc, lp, splat, bp, sGain);
        osc.start(now);
        splat.start(now, Math.random() * 0.4);
        osc.stop(now + 0.27);
        splat.stop(now + 0.19);
        break;
      }

      case 'pickup': {
        const isRad = rawLower.includes('rad') || rawLower.includes('canister');
        // Bubbly glowing rad ping (FM shimmer + harmonic sparkle) or crisp two-step item chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = isRad ? 'triangle' : 'sine';

        if (isRad) {
          osc1.frequency.setValueAtTime(740 * pitchRate, now);
          osc1.frequency.exponentialRampToValueAtTime(1480 * pitchRate, now + 0.085);
          osc1.frequency.exponentialRampToValueAtTime(1180 * pitchRate, now + 0.15);

          osc2.frequency.setValueAtTime(1110 * pitchRate, now);
          osc2.frequency.exponentialRampToValueAtTime(2220 * pitchRate, now + 0.11);
        } else {
          osc1.frequency.setValueAtTime(660 * pitchRate, now);
          osc1.frequency.setValueAtTime(990 * pitchRate, now + 0.055);
          osc2.frequency.setValueAtTime(1320 * pitchRate, now + 0.055);
        }

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.55, now);

        gainNode.gain.setValueAtTime(0.36 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc1.connect(gainNode);
        osc2.connect(osc2Gain);
        osc2Gain.connect(gainNode);

        activeNodes.push(osc1, osc2, osc2Gain);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.19);
        osc2.stop(now + 0.19);
        break;
      }

      case 'portal': {
        // Dimensional vortex swirl + shimmering ascending harmonic arpeggio
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(360 * pitchRate, now + 0.28);
        osc.frequency.exponentialRampToValueAtTime(220 * pitchRate, now + 0.65);

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(9.5, now);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(38, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gainNode.gain.setValueAtTime(0.42 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gainNode);

        // Swirling air vortex noise
        const swirl = ctx.createBufferSource();
        swirl.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(350 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(2400 * pitchRate, now + 0.35);
        bp.frequency.exponentialRampToValueAtTime(600 * pitchRate, now + 0.68);
        bp.Q.setValueAtTime(3.2, now);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.24 * volume, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
        swirl.connect(bp);
        bp.connect(sGain);
        sGain.connect(voiceOut);

        // Shimmering portal arpeggio chimes
        const portalChimes = [440, 554.37, 659.25, 880];
        for (let i = 0; i < portalChimes.length; i++) {
          const t = now + i * 0.085;
          const chime = ctx.createOscillator();
          chime.type = 'triangle';
          chime.frequency.setValueAtTime(portalChimes[i]! * pitchRate, t);
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(0.2 * volume, t);
          cg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          chime.connect(cg);
          cg.connect(voiceOut);
          activeNodes.push(chime, cg);
          chime.start(t);
          chime.stop(t + 0.3);
        }

        activeNodes.push(osc, lfo, lfoGain, swirl, bp, sGain);
        osc.start(now);
        lfo.start(now);
        swirl.start(now, Math.random() * 0.3);
        osc.stop(now + 0.72);
        lfo.stop(now + 0.72);
        swirl.stop(now + 0.72);
        break;
      }

      case 'level_up': {
        // Celebratory triumphant 5-note retro fanfare arpeggio with octave shimmer
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
        const stepTime = 0.068;

        for (let i = 0; i < notes.length; i++) {
          const isFinal = i === notes.length - 1;
          const noteTime = now + i * stepTime;
          const dur = isFinal ? 0.34 : stepTime * 1.7;

          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(notes[i]! * pitchRate, noteTime);

          const shimmer = ctx.createOscillator();
          shimmer.type = 'triangle';
          shimmer.frequency.setValueAtTime(notes[i]! * 2 * pitchRate, noteTime);

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(3400, noteTime);

          const noteGain = ctx.createGain();
          noteGain.gain.setValueAtTime((isFinal ? 0.34 : 0.26) * volume, noteTime);
          noteGain.gain.exponentialRampToValueAtTime(0.001, noteTime + dur);

          const shimGain = ctx.createGain();
          shimGain.gain.setValueAtTime(0.35, noteTime);

          osc.connect(lp);
          shimmer.connect(shimGain);
          shimGain.connect(lp);
          lp.connect(noteGain);
          noteGain.connect(voiceOut);

          activeNodes.push(osc, shimmer, shimGain, lp, noteGain);
          osc.start(noteTime);
          shimmer.start(noteTime);
          osc.stop(noteTime + dur + 0.02);
          shimmer.stop(noteTime + dur + 0.02);
        }
        break;
      }

      case 'ui_click':
      default: {
        // Crisp tactile arcade UI pip
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1050 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(180, 420 * pitchRate), now + 0.032);

        gainNode.gain.setValueAtTime(0.28 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.042);

        osc.connect(gainNode);
        activeNodes.push(osc);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }
    }

    return {
      stop: safeStop,
      kind,
      startTime: now,
    };
  } catch {
    return {
      stop: () => {},
      kind,
      startTime: now,
    };
  }
}
