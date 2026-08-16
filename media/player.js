(() => {
  "use strict";

  const vscode = acquireVsCodeApi();
  const title = document.getElementById("title");
  const artist = document.getElementById("artist");
  const toggle = document.getElementById("toggle");
  const stopButton = document.getElementById("stop");
  const volumeInput = document.getElementById("volume");
  const audioGate = document.getElementById("audioGate");
  const status = document.getElementById("status");
  const persisted = vscode.getState() ?? {};

  let audioContext;
  let masterInput;
  let masterGain;
  let currentScene;
  let currentTrack;
  let paused = false;
  let targetVolume = typeof persisted.volume === "number" ? persisted.volume : 0.45;
  let noiseBuffer;
  let impulseBuffer;
  volumeInput.value = String(targetVolume);

  const midiToHz = (note) => 440 * Math.pow(2, (note - 69) / 12);
  const diagnostic = (message) => vscode.postMessage({ type: "diagnostic", message });

  function reflectAudioState() {
    const running = Boolean(audioContext && audioContext.state === "running");
    audioGate.classList.toggle("visible", !running);
    document.body.classList.toggle("playing", running && Boolean(currentTrack) && !paused);
    status.textContent = running
      ? "Audio is playing locally."
      : "Playback is blocked. Click Enable Audio once to continue.";
    diagnostic(`AudioContext ${audioContext?.state ?? "not-created"}`);
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass({ latencyHint: "playback" });
      masterInput = audioContext.createGain();
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.02;
      compressor.release.value = 0.3;
      masterGain = audioContext.createGain();
      masterGain.gain.value = targetVolume;
      masterInput.connect(compressor).connect(masterGain).connect(audioContext.destination);
      audioContext.addEventListener("statechange", reflectAudioState);
    }
    reflectAudioState();
    void audioContext.resume().then(reflectAudioState).catch((error) => {
      diagnostic(`Audio resume failed: ${String(error)}`);
      reflectAudioState();
    });
    return audioContext;
  }

  function createNoiseBuffer(context) {
    if (noiseBuffer) return noiseBuffer;
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 1_234_567;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 16_807) % 2_147_483_647;
      data[index] = (seed / 1_073_741_823.5 - 1) * 0.35;
    }
    return noiseBuffer;
  }

  function createImpulseBuffer(context) {
    if (impulseBuffer) return impulseBuffer;
    const length = Math.floor(context.sampleRate * 1.8);
    impulseBuffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulseBuffer.getChannelData(channel);
      let seed = 91_337 + channel;
      for (let index = 0; index < length; index += 1) {
        seed = (seed * 48_271) % 2_147_483_647;
        const random = seed / 1_073_741_823.5 - 1;
        data[index] = random * Math.pow(1 - index / length, 2.8);
      }
    }
    return impulseBuffer;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  function envelope(gain, at, peak, duration, attack = 0.04) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(attack, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  function scheduleNote(scene, note, at, duration, peak, type = "sine", pan = 0) {
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const panner = audioContext.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.value = midiToHz(note);
    oscillator.detune.value = (scene.random() - 0.5) * scene.synth.humanize * 20;
    filter.type = "lowpass";
    filter.frequency.value = scene.synth.lowpassHz;
    filter.Q.value = 0.55;
    panner.pan.value = pan;
    envelope(gain, at, peak, duration, scene.synth.texture === "air" ? 0.32 : 0.035);
    oscillator.connect(filter).connect(gain).connect(panner).connect(scene.input);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.1);
  }

  function scheduleChord(scene, chord, at, duration) {
    chord.forEach((interval, index) => {
      const octave = scene.synth.texture === "air" ? 0 : 12;
      const type = scene.synth.texture === "brushes" ? "triangle" : "sine";
      scheduleNote(scene, scene.synth.rootMidi + octave + interval, at, duration, 0.038, type, (index - 1.5) * 0.18);
    });
  }

  function schedulePercussion(scene, at) {
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    source.buffer = createNoiseBuffer(audioContext);
    filter.type = "highpass";
    filter.frequency.value = scene.synth.texture === "brushes" ? 2_400 : 1_100;
    envelope(gain, at, scene.synth.texture === "brushes" ? 0.026 : 0.038, 0.08, 0.005);
    source.connect(filter).connect(gain).connect(scene.input);
    source.start(at);
    source.stop(at + 0.1);
  }

  function createScene(track, fadeMs, startAt) {
    const context = ensureAudio();
    const synth = track.synthesis;
    const input = context.createGain();
    const sceneGain = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = context.createConvolver();
    convolver.buffer = createImpulseBuffer(context);
    dry.gain.value = 1 - synth.reverb * 0.35;
    wet.gain.value = synth.reverb * 0.45;
    input.connect(dry).connect(sceneGain);
    input.connect(convolver).connect(wet).connect(sceneGain);
    sceneGain.connect(masterInput);
    const fadeSeconds = Math.max(0.02, fadeMs / 1_000);
    sceneGain.gain.setValueAtTime(0.0001, startAt);
    sceneGain.gain.exponentialRampToValueAtTime(0.76, startAt + fadeSeconds);

    const beat = 60 / synth.tempoBpm;
    const scene = {
      track,
      synth,
      input,
      gain: sceneGain,
      dry,
      wet,
      convolver,
      random: seededRandom(synth.variationSeed),
      stopped: false,
      timer: undefined,
      step: 0,
      nextAt: startAt,
      startedAt: startAt,
      beat,
      barDuration: beat * 4,
    };

    const schedule = () => {
      if (scene.stopped) return;
      while (scene.nextAt < context.currentTime + 1.2) {
        const chord = synth.chordProgression[Math.floor(scene.step / 8) % synth.chordProgression.length];
        if (scene.step % 8 === 0) scheduleChord(scene, chord, scene.nextAt, beat * 3.85);
        if (synth.texture !== "air" && scene.step % 2 === 0) {
          scheduleNote(scene, synth.rootMidi - 12 + chord[0], scene.nextAt, beat * 0.82, 0.105, synth.texture === "brushes" ? "triangle" : "sine");
        }
        if (scene.random() < synth.melodyDensity * 0.3) {
          const interval = synth.scale[(scene.step * 3 + Math.floor(scene.random() * synth.scale.length)) % synth.scale.length];
          scheduleNote(scene, synth.rootMidi + 12 + interval, scene.nextAt, beat * 1.45, 0.034, synth.texture === "tape" ? "sine" : "triangle", scene.random() * 0.6 - 0.3);
        }
        if (synth.texture !== "air" && scene.random() < synth.rhythmDensity * 0.68) {
          schedulePercussion(scene, scene.nextAt);
        }
        const swingDirection = scene.step % 2 === 0 ? 1 : -1;
        const humanize = (scene.random() - 0.5) * synth.humanize * beat;
        scene.nextAt += beat / 2 + swingDirection * synth.swing * beat * 0.22 + humanize;
        scene.step += 1;
      }
    };
    schedule();
    scene.timer = setInterval(schedule, 180);
    return scene;
  }

  function transitionBoundary(scene) {
    if (!scene || !audioContext || audioContext.state !== "running") return audioContext?.currentTime ?? 0;
    const now = audioContext.currentTime;
    const elapsed = Math.max(0, now - scene.startedAt);
    const nextBeat = scene.startedAt + Math.ceil(elapsed / scene.beat) * scene.beat;
    return Math.max(now + 0.04, nextBeat);
  }

  function stopScene(scene, fadeMs, at = audioContext?.currentTime ?? 0) {
    if (!scene || scene.stopped) return;
    scene.stopped = true;
    if (scene.timer) clearInterval(scene.timer);
    const fadeSeconds = Math.max(0.02, fadeMs / 1_000);
    scene.gain.gain.cancelScheduledValues(at);
    scene.gain.gain.setValueAtTime(Math.max(scene.gain.gain.value, 0.0001), at);
    scene.gain.gain.exponentialRampToValueAtTime(0.0001, at + fadeSeconds);
    const delay = Math.max(0, (at - audioContext.currentTime) * 1_000) + fadeMs + 150;
    setTimeout(() => {
      for (const node of [scene.input, scene.dry, scene.wet, scene.convolver, scene.gain]) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    }, delay);
  }

  function play(track, fadeMs) {
    ensureAudio();
    const previous = currentScene;
    const startAt = transitionBoundary(previous);
    currentTrack = track;
    currentScene = createScene(track, fadeMs, startAt);
    if (previous) stopScene(previous, fadeMs, startAt);
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(targetVolume, 0.0001), now + Math.max(0.02, fadeMs / 1_000));
    paused = false;
    title.textContent = track.title;
    artist.textContent = `${track.artist} · generated locally`;
    toggle.textContent = "Pause";
    vscode.setState({ volume: targetVolume, lastTrackId: track.id });
    diagnostic(`Queued ${track.id} at audio time ${startAt.toFixed(2)}`);
    reflectAudioState();
  }

  function setPaused(nextPaused, fadeMs) {
    paused = nextPaused;
    toggle.textContent = paused ? "Resume" : "Pause";
    if (!audioContext || !masterGain) {
      reflectAudioState();
      return;
    }
    const now = audioContext.currentTime;
    const seconds = Math.max(0.02, fadeMs / 1_000);
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
    masterGain.gain.exponentialRampToValueAtTime(paused ? 0.0001 : Math.max(targetVolume, 0.0001), now + seconds);
    reflectAudioState();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "play") play(message.track, message.fadeDurationMs);
    if (message.type === "pause") setPaused(true, message.fadeDurationMs);
    if (message.type === "resume") { ensureAudio(); setPaused(false, message.fadeDurationMs); }
    if (message.type === "stop") {
      stopScene(currentScene, message.fadeDurationMs);
      currentScene = undefined;
      currentTrack = undefined;
      document.body.classList.remove("playing");
      title.textContent = "Session stopped";
      status.textContent = "Start another session from the Command Palette.";
    }
    if (message.type === "volume") {
      targetVolume = Math.max(0, Math.min(1, message.volume));
      volumeInput.value = String(targetVolume);
      vscode.setState({ ...(vscode.getState() ?? {}), volume: targetVolume });
      if (masterGain && !paused) masterGain.gain.setTargetAtTime(Math.max(targetVolume, 0.0001), audioContext.currentTime, 0.08);
    }
  });

  window.addEventListener("error", (event) => diagnostic(`Player error: ${event.message}`));
  toggle.addEventListener("click", () => vscode.postMessage({ type: "control", action: paused ? "resume" : "pause" }));
  stopButton.addEventListener("click", () => vscode.postMessage({ type: "control", action: "stop" }));
  volumeInput.addEventListener("input", () => vscode.postMessage({ type: "control", action: "setVolume", value: Number(volumeInput.value) }));
  audioGate.addEventListener("click", () => {
    ensureAudio();
    if (currentTrack && paused) vscode.postMessage({ type: "control", action: "resume" });
  });
  vscode.postMessage({ type: "ready" });
})();
