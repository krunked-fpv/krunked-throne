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
  | 'hit_confirm'
  | 'death'
  | 'pickup'
  | 'portal'
  | 'level_up'
  | 'empty'
  | 'alert'
  | 'boss_intro'
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

  // 0. Crisp Hit-Confirm Tick (checked before ui_click so 'sndHitConfirm' doesn't match 'confirm')
  if (name.includes('hitconfirm') || name.includes('hit_confirm') || name.includes('crithit')) {
    return 'hit_confirm';
  }

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
    name.includes('levelultra') ||
    name.includes('skill') ||
    name.includes('mutation') ||
    (name.includes('ultra') && !name.includes('empty'))
  ) {
    return 'level_up';
  }

  // 2b. Dry-Fire / Empty Magazine Click
  if (name.includes('empty') || name.includes('dryfire') || name.includes('corpseexplodead')) {
    return 'empty';
  }

  // 2c. Boss Roars, Intros & Dramatic Stings
  if (
    name.includes('bossintro') ||
    name.includes('banditintro') ||
    name.includes('dogintro') ||
    name.includes('dogtaunt') ||
    name.includes('lilhunterappear') ||
    name.includes('nothingstart') ||
    name.includes('nothing2appear') ||
    name.includes('bossroar')
  ) {
    return 'boss_intro';
  }

  // 2d. Enemy Alert / Warning Cues
  if (name.includes('alert') || name.includes('warning') || name.includes('spot')) {
    return 'alert';
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
          rawLower.includes('rifle') ||
          rawLower.includes('machinegun');

        // 1. Punchy square/saw body snap (with subtle waveshaper grit on heavy rifles/MGs)
        const osc = ctx.createOscillator();
        osc.type = isHeavy ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime((isHeavy ? 360 : 560) * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(38, (isHeavy ? 56 : 88) * pitchRate),
          now + (isHeavy ? 0.115 : 0.082)
        );

        const bodyFilter = ctx.createBiquadFilter();
        bodyFilter.type = 'lowpass';
        bodyFilter.frequency.setValueAtTime((isHeavy ? 2800 : 3200) * pitchRate, now);
        bodyFilter.frequency.exponentialRampToValueAtTime(380, now + 0.095);

        gainNode.gain.setValueAtTime((isHeavy ? 0.5 : 0.42) * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.125 : 0.092));

        osc.connect(bodyFilter);
        if (isHeavy) {
          const shaper = ctx.createWaveShaper();
          shaper.curve = getCrunchCurve(ctx);
          bodyFilter.connect(shaper);
          shaper.connect(gainNode);
          activeNodes.push(shaper);
        } else {
          bodyFilter.connect(gainNode);
        }

        // 2. Razor-crisp 15ms muzzle transient crack (makes revolvers & rifles snap through the mix!)
        const snapSrc = ctx.createBufferSource();
        snapSrc.buffer = getNoiseBuffer(ctx);
        const snapHp = ctx.createBiquadFilter();
        snapHp.type = 'highpass';
        snapHp.frequency.setValueAtTime((isHeavy ? 2400 : 3400) * pitchRate, now);
        const snapGain = ctx.createGain();
        snapGain.gain.setValueAtTime((isHeavy ? 0.42 : 0.38) * volume, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
        snapSrc.connect(snapHp);
        snapHp.connect(snapGain);
        snapGain.connect(voiceOut);

        // 3. Mid-band powder bark
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const crackFilter = ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime((isHeavy ? 1750 : 2500) * pitchRate, now);
        crackFilter.Q.setValueAtTime(0.95, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime((isHeavy ? 0.45 : 0.34) * volume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.072 : 0.048));

        noiseSrc.connect(crackFilter);
        crackFilter.connect(noiseGain);
        noiseGain.connect(voiceOut);

        // 4. Tight chest sub-thump body
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime((isHeavy ? 148 : 180) * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(isHeavy ? 38 : 46, now + 0.068);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime((isHeavy ? 0.54 : 0.38) * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.078);
        sub.connect(subGain);
        subGain.connect(voiceOut);

        activeNodes.push(
          osc,
          bodyFilter,
          snapSrc,
          snapHp,
          snapGain,
          noiseSrc,
          crackFilter,
          noiseGain,
          sub,
          subGain
        );
        osc.start(now);
        snapSrc.start(now, Math.random() * 0.5);
        noiseSrc.start(now, Math.random() * 0.4);
        sub.start(now);
        osc.stop(now + 0.135);
        snapSrc.stop(now + 0.03);
        noiseSrc.stop(now + 0.08);
        sub.stop(now + 0.085);
        break;
      }

      case 'shell': {
        // Vlambeer-style shotgun blast: saturating cannon boom + razor powder crack + chest sub-drop
        const isDouble = rawLower.includes('double') || rawLower.includes('super') || rawLower.includes('flak');
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCrunchCurve(ctx);
        shaper.connect(gainNode);

        // 1. Roaring filtered noise blast
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime((isDouble ? 3200 : 2800) * pitchRate, now);
        lp.frequency.exponentialRampToValueAtTime(Math.max(70, 190 * pitchRate), now + (isDouble ? 0.3 : 0.25));
        lp.Q.setValueAtTime(1.5, now);

        noiseSrc.connect(lp);
        lp.connect(shaper);

        // 2. High-energy initial powder crack
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = getNoiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(3600 * pitchRate, now);
        hp.Q.setValueAtTime(0.65, now);
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime((isDouble ? 0.54 : 0.48) * volume, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
        crackSrc.connect(hp);
        hp.connect(crackGain);
        crackGain.connect(voiceOut);

        // 3. Heavy chest-punching sub-cannon drop
        const sub = ctx.createOscillator();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime((isDouble ? 160 : 175) * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(Math.max(24, 30 * pitchRate), now + (isDouble ? 0.25 : 0.2));

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime((isDouble ? 0.72 : 0.65) * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + (isDouble ? 0.27 : 0.22));
        sub.connect(subGain);
        subGain.connect(voiceOut);

        gainNode.gain.setValueAtTime((isDouble ? 0.7 : 0.64) * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isDouble ? 0.32 : 0.27));

        activeNodes.push(shaper, noiseSrc, lp, crackSrc, hp, crackGain, sub, subGain);
        noiseSrc.start(now, Math.random() * 0.3);
        crackSrc.start(now, Math.random() * 0.5);
        sub.start(now);
        noiseSrc.stop(now + 0.33);
        crackSrc.stop(now + 0.055);
        sub.stop(now + 0.28);
        break;
      }

      case 'bolt': {
        // Crossbow / Disc thwip: snappy tensioned string twang + metallic overtone + high-speed air zip
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(820 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(68, 138 * pitchRate), now + 0.11);

        const overtone = ctx.createOscillator();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(1640 * pitchRate, now);
        overtone.frequency.exponentialRampToValueAtTime(Math.max(180, 310 * pitchRate), now + 0.07);
        const overGain = ctx.createGain();
        overGain.gain.setValueAtTime(0.24 * volume, now);
        overGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

        gainNode.gain.setValueAtTime(0.48 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gainNode);
        overtone.connect(overGain);
        overGain.connect(voiceOut);

        // Crisp air-whistle zip
        const zipSrc = ctx.createBufferSource();
        zipSrc.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3800 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(920 * pitchRate, now + 0.09);
        bp.Q.setValueAtTime(3.0, now);
        const zipGain = ctx.createGain();
        zipGain.gain.setValueAtTime(0.32 * volume, now);
        zipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        zipSrc.connect(bp);
        bp.connect(zipGain);
        zipGain.connect(voiceOut);

        activeNodes.push(osc, overtone, overGain, zipSrc, bp, zipGain);
        osc.start(now);
        overtone.start(now);
        zipSrc.start(now, Math.random() * 0.4);
        osc.stop(now + 0.14);
        overtone.stop(now + 0.085);
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
          carrier.frequency.exponentialRampToValueAtTime(Math.max(70, 130 * pitchRate), now + 0.22);
          mod.type = 'sine';
          mod.frequency.setValueAtTime(52 * pitchRate, now);
          modGain.gain.setValueAtTime(360 * pitchRate, now);
          modGain.gain.exponentialRampToValueAtTime(25, now + 0.2);

          // Fat plasma discharge sub-thump
          const pSub = ctx.createOscillator();
          pSub.type = 'sine';
          pSub.frequency.setValueAtTime(165 * pitchRate, now);
          pSub.frequency.exponentialRampToValueAtTime(44, now + 0.16);
          const pSubGain = ctx.createGain();
          pSubGain.gain.setValueAtTime(0.42 * volume, now);
          pSubGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          pSub.connect(pSubGain);
          pSubGain.connect(voiceOut);
          activeNodes.push(pSub, pSubGain);
          pSub.start(now);
          pSub.stop(now + 0.19);
        } else {
          // Razor-sharp sci-fi laser FM zap + brief crisp ignition click
          carrier.type = 'sine';
          carrier.frequency.setValueAtTime(1920 * pitchRate, now);
          carrier.frequency.exponentialRampToValueAtTime(Math.max(90, 200 * pitchRate), now + 0.15);
          mod.type = 'triangle';
          mod.frequency.setValueAtTime(680 * pitchRate, now);
          mod.frequency.exponentialRampToValueAtTime(110 * pitchRate, now + 0.14);
          modGain.gain.setValueAtTime(680 * pitchRate, now);
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

      case 'hit_confirm': {
        // Ultra-crisp tactile hit-confirm tick that cuts cleanly through loud gunfire
        const tickOsc = ctx.createOscillator();
        tickOsc.type = 'triangle';
        tickOsc.frequency.setValueAtTime(1750 * pitchRate, now);
        tickOsc.frequency.exponentialRampToValueAtTime(2450 * pitchRate, now + 0.022);

        gainNode.gain.setValueAtTime(0.32 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
        tickOsc.connect(gainNode);

        // Tight low-mid tactile click body
        const pop = ctx.createOscillator();
        pop.type = 'sine';
        pop.frequency.setValueAtTime(320 * pitchRate, now);
        pop.frequency.exponentialRampToValueAtTime(110, now + 0.028);
        const popGain = ctx.createGain();
        popGain.gain.setValueAtTime(0.28 * volume, now);
        popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
        pop.connect(popGain);
        popGain.connect(voiceOut);

        activeNodes.push(tickOsc, pop, popGain);
        tickOsc.start(now);
        pop.start(now);
        tickOsc.stop(now + 0.042);
        pop.stop(now + 0.038);
        break;
      }

      case 'hit': {
        const isHardSurface =
          rawLower.includes('wall') || rawLower.includes('metal') || rawLower.includes('armor');
        const isCorpseSlam = rawLower.includes('corpse') || rawLower.includes('impwrist');

        // Juicy crunchy impact: tight mid-low thump + snappy bandpassed grit crack
        const osc = ctx.createOscillator();
        osc.type = isHardSurface ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(
          (isHardSurface ? 620 : isCorpseSlam ? 210 : 320) * pitchRate,
          now
        );
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(36, (isHardSurface ? 160 : isCorpseSlam ? 42 : 64) * pitchRate),
          now + (isCorpseSlam ? 0.11 : 0.068)
        );

        gainNode.gain.setValueAtTime((isCorpseSlam ? 0.62 : 0.52) * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isCorpseSlam ? 0.12 : 0.078));
        osc.connect(gainNode);

        // Crunchy flesh/armor/stone slap transient
        const crunch = ctx.createBufferSource();
        crunch.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime((isHardSurface ? 2600 : 1550) * pitchRate, now);
        bp.Q.setValueAtTime(isHardSurface ? 2.2 : 1.1, now);
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.38 * volume, now);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

        crunch.connect(bp);
        bp.connect(cGain);
        cGain.connect(voiceOut);

        activeNodes.push(osc, crunch, bp, cGain);
        osc.start(now);
        crunch.start(now, Math.random() * 0.5);
        osc.stop(now + 0.13);
        crunch.stop(now + 0.058);
        break;
      }

      case 'death': {
        // Chunky kill crunch: waveshaped descending splatter + punchy finality sub-thud
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCrunchCurve(ctx);

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(360 * pitchRate, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(28, 42 * pitchRate), now + 0.24);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800 * pitchRate, now);
        lp.frequency.exponentialRampToValueAtTime(210, now + 0.24);

        gainNode.gain.setValueAtTime(0.54 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        osc.connect(lp);
        lp.connect(shaper);
        shaper.connect(gainNode);

        // Wet crunch burst
        const splat = ctx.createBufferSource();
        splat.buffer = getNoiseBuffer(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1080 * pitchRate, now);
        bp.frequency.exponentialRampToValueAtTime(300 * pitchRate, now + 0.16);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.38 * volume, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        splat.connect(bp);
        bp.connect(sGain);
        sGain.connect(voiceOut);

        // Finality chest thud
        const thud = ctx.createOscillator();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(135 * pitchRate, now);
        thud.frequency.exponentialRampToValueAtTime(36, now + 0.12);
        const thudGain = ctx.createGain();
        thudGain.gain.setValueAtTime(0.45 * volume, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        thud.connect(thudGain);
        thudGain.connect(voiceOut);

        activeNodes.push(shaper, osc, lp, splat, bp, sGain, thud, thudGain);
        osc.start(now);
        splat.start(now, Math.random() * 0.4);
        thud.start(now);
        osc.stop(now + 0.27);
        splat.stop(now + 0.19);
        thud.stop(now + 0.14);
        break;
      }

      case 'empty': {
        // Tactile mechanical dry-fire click-clack (never confused with gunfire!)
        const makeClick = (offset: number, freq: number, amp: number): void => {
          const n = ctx.createBufferSource();
          n.buffer = getNoiseBuffer(ctx);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(freq * pitchRate, now + offset);
          bp.Q.setValueAtTime(4.2, now + offset);
          const g = ctx.createGain();
          g.gain.setValueAtTime(amp * volume, now + offset);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.018);
          n.connect(bp);
          bp.connect(g);
          g.connect(voiceOut);
          activeNodes.push(n, bp, g);
          n.start(now + offset, Math.random() * 0.5);
          n.stop(now + offset + 0.022);
        };
        makeClick(0, 2600, 0.42);
        makeClick(0.024, 1850, 0.3);

        const pin = ctx.createOscillator();
        pin.type = 'square';
        pin.frequency.setValueAtTime(1400 * pitchRate, now);
        pin.frequency.exponentialRampToValueAtTime(620 * pitchRate, now + 0.02);
        gainNode.gain.setValueAtTime(0.18 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        pin.connect(gainNode);
        activeNodes.push(pin);
        pin.start(now);
        pin.stop(now + 0.03);
        break;
      }

      case 'alert': {
        // Sharp two-tone hostile spot chirp / exclamation cue
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520 * pitchRate, now);
        osc.frequency.setValueAtTime(860 * pitchRate, now + 0.038);
        osc.frequency.exponentialRampToValueAtTime(720 * pitchRate, now + 0.095);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2400, now);

        gainNode.gain.setValueAtTime(0.26 * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.105);

        osc.connect(lp);
        lp.connect(gainNode);
        activeNodes.push(osc, lp);
        osc.start(now);
        osc.stop(now + 0.115);
        break;
      }

      case 'boss_intro': {
        // Dramatic wasteland boss roar / low brassy horn sting + metallic gong hit
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCrunchCurve(ctx);

        const horn1 = ctx.createOscillator();
        const horn2 = ctx.createOscillator();
        horn1.type = 'sawtooth';
        horn2.type = 'sawtooth';
        horn1.frequency.setValueAtTime(98 * pitchRate, now);
        horn1.frequency.exponentialRampToValueAtTime(64 * pitchRate, now + 0.62);
        horn2.frequency.setValueAtTime(146.8 * pitchRate, now);
        horn2.frequency.exponentialRampToValueAtTime(96 * pitchRate, now + 0.62);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1600, now);
        lp.frequency.exponentialRampToValueAtTime(340, now + 0.65);
        lp.Q.setValueAtTime(3.2, now);

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.52 * volume, now + 0.025);
        gainNode.gain.setValueAtTime(0.46 * volume, now + 0.35);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

        horn1.connect(lp);
        horn2.connect(lp);
        lp.connect(shaper);
        shaper.connect(gainNode);

        // Deep cinematic sub impact
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(78 * pitchRate, now);
        sub.frequency.exponentialRampToValueAtTime(30, now + 0.55);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.65 * volume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
        sub.connect(subGain);
        subGain.connect(voiceOut);

        // Metallic sting transient
        const clang = ctx.createOscillator();
        clang.type = 'triangle';
        clang.frequency.setValueAtTime(620 * pitchRate, now);
        clang.frequency.exponentialRampToValueAtTime(410 * pitchRate, now + 0.38);
        const clangGain = ctx.createGain();
        clangGain.gain.setValueAtTime(0.24 * volume, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        clang.connect(clangGain);
        clangGain.connect(voiceOut);

        activeNodes.push(shaper, horn1, horn2, lp, sub, subGain, clang, clangGain);
        horn1.start(now);
        horn2.start(now);
        sub.start(now);
        clang.start(now);
        horn1.stop(now + 0.74);
        horn2.stop(now + 0.74);
        sub.stop(now + 0.64);
        clang.stop(now + 0.44);
        break;
      }

      case 'pickup': {
        const isRad = rawLower.includes('rad') || rawLower.includes('canister');
        const isWeapon = rawLower.includes('weapon');
        const isHp = rawLower.includes('hp') || rawLower.includes('health');
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = isWeapon ? 'square' : 'sine';
        osc2.type = isRad ? 'triangle' : 'sine';

        if (isRad) {
          // Luminous crystalline rad chime (shines cleanly with ascending streak pitch!)
          osc1.frequency.setValueAtTime(760 * pitchRate, now);
          osc1.frequency.exponentialRampToValueAtTime(1520 * pitchRate, now + 0.08);
          osc1.frequency.exponentialRampToValueAtTime(1240 * pitchRate, now + 0.14);

          osc2.frequency.setValueAtTime(1140 * pitchRate, now);
          osc2.frequency.exponentialRampToValueAtTime(2280 * pitchRate, now + 0.1);
        } else if (isWeapon) {
          // Chunky weapon cock-rack + confirm ping
          osc1.frequency.setValueAtTime(340 * pitchRate, now);
          osc1.frequency.setValueAtTime(520 * pitchRate, now + 0.045);
          osc2.frequency.setValueAtTime(1040 * pitchRate, now + 0.055);
        } else if (isHp) {
          // Warm restorative ascending medkit chime
          osc1.frequency.setValueAtTime(523.25 * pitchRate, now);
          osc1.frequency.setValueAtTime(659.25 * pitchRate, now + 0.05);
          osc2.frequency.setValueAtTime(783.99 * pitchRate, now + 0.09);
        } else {
          // Crisp two-step ammo chime
          osc1.frequency.setValueAtTime(660 * pitchRate, now);
          osc1.frequency.setValueAtTime(990 * pitchRate, now + 0.05);
          osc2.frequency.setValueAtTime(1320 * pitchRate, now + 0.05);
        }

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.55, now);

        gainNode.gain.setValueAtTime((isRad ? 0.34 : 0.36) * volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.175);

        osc1.connect(gainNode);
        osc2.connect(osc2Gain);
        osc2Gain.connect(gainNode);

        activeNodes.push(osc1, osc2, osc2Gain);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.185);
        osc2.stop(now + 0.185);
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
