import { WORLD_REGIONS, regionAtHeight } from './world.js';

// Each world uses a different, ascending recording from the supplied video.
// Source time ranges and processing are recorded in assets/audio/manifest.json.
export const BING_SOUNDS = Object.freeze(WORLD_REGIONS.map((region, index) => Object.freeze({
  id: region.id, start: region.start,
  url: new URL(`../assets/audio/bing-${String(index + 1).padStart(2, '0')}.wav`, import.meta.url).href,
  fallbackFrequency: [469.72, 515.96, 561.84, 607.73, 653.96, 700.59][index],
})));

export const PROP_SOUNDS = Object.freeze([
  { id: 'spring', file: 'spring-duang.wav', volume: .70 },
  { id: 'hat', file: 'broom-whoosh.wav', volume: .75 },
  { id: 'rocket', file: 'jetpack-launch.wav', volume: .70 },
].map(sound => Object.freeze({ ...sound, url: new URL(`../assets/audio/props/${sound.file}`, import.meta.url).href })));

const RESULT_SOUNDS = [{ id: 'record', url: new URL('../assets/audio/results/record-laugh-standing.wav', import.meta.url).href }];
const STARTUP_AUDIO_WAIT_MS = 400;
const AUDIO_REQUEST_TIMEOUT_MS = 60000;
const AUDIO_RETRY_DELAY_MS = 5000;

export class Audio {
  constructor(preferences) {
    this.preferences = preferences; this.context = null; this.elapsed = 0; this.note = 0;
    this.nodes = new Set(); this.buffers = new Map(); this.loading = null;
    this.propNodes = new Set(); this.propBuffers = new Map();
    this.resultBuffers = new Map();
    this.resultNodes = new Set();
    this.assetTasks = new Map(); this.assetRetryAt = new Map(); this.resultPlayback = null;
    this.abort = new AbortController(); this.destroyed = false;
    this.retryAt = 0;
  }

  // Called synchronously from the start/resume gesture, before any asset awaits.
  async unlock() {
    if (this.destroyed) return;
    let timer;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state !== 'running') await Promise.race([
        this.context.resume(), new Promise(resolve => { timer = setTimeout(resolve, 1000); }),
      ]);
    } catch { /* Unsupported or blocked audio never prevents gameplay. */ }
    finally { clearTimeout(timer); }
  }

  prepare() {
    // Start/resume only waits briefly; slow recordings continue downloading.
    // A user gesture may retry immediately after a previous network failure.
    this.retryAt = 0;
    const loading = this.load();
    let timer;
    return Promise.race([
      loading,
      new Promise(resolve => { timer = setTimeout(resolve, STARTUP_AUDIO_WAIT_MS); }),
    ]).finally(() => clearTimeout(timer));
  }

  load() {
    if (!this.context || this.destroyed) return Promise.resolve();
    if (this.loading) return this.loading;
    if (Date.now() < this.retryAt) return Promise.resolve();
    // The long celebration recording is requested separately after gameplay
    // starts, so it cannot compete with the character's first visible frames.
    const assets = [[BING_SOUNDS, this.buffers], [PROP_SOUNDS, this.propBuffers]].flatMap(([sounds, buffers]) =>
      sounds.filter(sound => !buffers.has(sound.id)).map(sound => ({ sound, buffers })));
    if (!assets.length) return Promise.resolve();
    this.loading = Promise.allSettled(assets.map(({ sound, buffers }) => this.loadAsset(sound, buffers, true))).finally(() => {
      this.loading = null;
      this.retryAt = Date.now() + AUDIO_RETRY_DELAY_MS;
    });
    return this.loading;
  }

  loadAsset(sound, buffers, force = false) {
    if (!this.context || this.destroyed || buffers.has(sound.id)) return Promise.resolve();
    const pending = this.assetTasks.get(sound.id);
    if (pending) return pending;
    if (!force && Date.now() < (this.assetRetryAt.get(sound.id) || 0)) return Promise.resolve();
    const task = (async () => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      this.abort.signal.addEventListener('abort', abort, { once: true });
      let timer;
      try {
        // Resolving a request only caches it: never replay a stale game event.
        const buffer = await Promise.race([
          (async () => {
            const response = await fetch(sound.url, { signal: controller.signal, priority: 'low' });
            if (!response.ok) throw new Error(`Audio ${response.status}`);
            return this.context.decodeAudioData(await response.arrayBuffer());
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Audio load timeout')); }, AUDIO_REQUEST_TIMEOUT_MS); }),
        ]);
        if (!this.destroyed) buffers.set(sound.id, buffer);
        this.assetRetryAt.delete(sound.id);
      } catch (error) {
        this.assetRetryAt.set(sound.id, Date.now() + AUDIO_RETRY_DELAY_MS);
        throw error;
      } finally {
        clearTimeout(timer); this.abort.signal.removeEventListener('abort', abort);
        this.assetTasks.delete(sound.id);
      }
    })();
    this.assetTasks.set(sound.id, task);
    return task;
  }

  prepareRecord() {
    // Independent of the gameplay batch: a slow jump sound cannot hold up a
    // celebration request or its retry, and concurrent callers share one task.
    return this.loadAsset(RESULT_SOUNDS[0], this.resultBuffers).catch(() => {});
  }

  track(source, gain, group = null) {
    source.connect(gain); gain.connect(this.context.destination); this.nodes.add(source);
    group?.add(source);
    source.onended = () => {
      if (!this.nodes.delete(source)) return;
      if (this.resultPlayback?.source === source) {
        this.onResultPlayback?.(null);
        this.resultPlayback = null;
      }
      group?.delete(source); source.onended = null; source.disconnect(); gain.disconnect();
    };
  }

  tone(frequency, duration = .12, volume = .035, end = frequency, type = 'sine') {
    const c = this.context; if (this.destroyed || !c || c.state !== 'running') return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(frequency, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, end), c.currentTime + duration);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(volume, c.currentTime + .004);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + duration);
    this.track(o, g); o.start(); o.stop(c.currentTime + duration);
  }

  playBuffer(buffer, volume, group = null, playback = {}) {
    const c = this.context; if (this.destroyed || !c || c.state !== 'running') return;
    const source = c.createBufferSource(), gain = c.createGain();
    source.buffer = buffer; gain.gain.value = volume;
    if (playback.loop) { source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration; }
    this.track(source, gain, group);
    const startedAt = c.currentTime;
    source.start(startedAt, playback.offset || 0);
    return { source, startedAt };
  }

  startRecord(offset = 0) {
    if (this.resultNodes.size) return;
    const buffer = this.resultBuffers.get('record');
    if (!buffer) return;
    const absolute = Number.isFinite(offset) ? Math.max(0, offset) : 0;
    const started = this.playBuffer(buffer, .55, this.resultNodes, { loop: true, offset: absolute % buffer.duration });
    if (!started) return;
    const c = this.context;
    let position = absolute;
    this.resultPlayback = {
      ...started, offset: absolute,
      get currentTime() {
        // An interrupted/suspended audio device freezes both sound and pose.
        if (c.state !== 'running') return position;
        let outputTime;
        try {
          const stamp = c.getOutputTimestamp?.();
          if (stamp?.performanceTime > 0 && stamp.contextTime > 0) {
            outputTime = stamp.contextTime + Math.max(0, (performance.now() - stamp.performanceTime) / 1000);
          }
        } catch { /* Older browsers use the context clock and reported latency. */ }
        outputTime ??= c.currentTime - (c.outputLatency || 0) - (c.baseLatency || 0);
        position = Math.max(position, absolute + Math.max(0, Math.min(c.currentTime, outputTime) - started.startedAt));
        return position;
      },
    };
    this.onResultPlayback?.(this.resultPlayback);
  }

  bing(height = 0, volume = .65) {
    const c = this.context; if (this.destroyed || !c || c.state !== 'running') return;
    const sound = BING_SOUNDS.find(sound => sound.id === regionAtHeight(height).id);
    const buffer = this.buffers.get(sound.id);
    if (!buffer) { this.load(); this.tone(sound.fallbackFrequency, .22, .055 * volume / .65); return; }
    this.playBuffer(buffer, volume);
  }

  prop(id) {
    const spec = PROP_SOUNDS.find(sound => sound.id === id);
    if (!spec) return;
    this.stopNodes(this.propNodes);
    const buffer = this.propBuffers.get(id);
    if (buffer) { this.playBuffer(buffer, spec.volume, this.propNodes); return; }
    this.load();
    // Brief, distinct fallbacks keep each item identifiable if a WAV is missing.
    const c = this.context; if (this.destroyed || !c || c.state !== 'running') return;
    const shapes = {
      spring: { type: 'triangle', duration: .70, frequencies: [310, 100, 245, 130, 185, 115, 100] },
      hat: { type: 'sine', duration: .85, frequencies: [370, 600, 1150, 1600, 1250, 800, 420] },
      rocket: { type: 'sawtooth', duration: 1.05, frequencies: [110, 120, 130, 140, 155, 165, 175] },
    };
    const shape = shapes[id], source = c.createOscillator(), gain = c.createGain();
    source.type = shape.type; source.frequency.setValueAtTime(shape.frequencies[0], c.currentTime);
    shape.frequencies.slice(1).forEach((frequency, index) => source.frequency.exponentialRampToValueAtTime(frequency, c.currentTime + (index + 1) * shape.duration / (shape.frequencies.length - 1)));
    gain.gain.setValueAtTime(0, c.currentTime); gain.gain.linearRampToValueAtTime(.055, c.currentTime + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, c.currentTime + shape.duration);
    this.track(source, gain, this.propNodes); source.start(); source.stop(c.currentTime + shape.duration);
  }

  effect(type, height = 0, detail = {}) {
    if (type === 'flight-end') { this.stopNodes(this.propNodes); return; }
    if (!this.preferences.data.sound) return;
    if (type === 'record') {
      if (this.resultNodes.size) return;
      if (this.resultBuffers.has('record')) this.startRecord(detail.offset);
      else this.prepareRecord();
      return;
    }
    if (['jump-start', 'bounce'].includes(type)) { this.bing(height); return; }
    if (type === 'spring') { this.bing(height, .28); this.prop('spring'); return; }
    if (type === 'pickup') { this.prop(detail.itemType); return; }
    const notes = { break: [150, .18, .035, 45], gameover: [320, .5, .04, 70] };
    if (notes[type]) this.tone(...notes[type]);
  }

  update(dt, running) {
    if (!running || !this.preferences.data.music) return;
    this.elapsed += dt;
    if (this.elapsed > .38) { this.elapsed = 0; const tune = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66]; this.tone(tune[this.note++ % tune.length], .3, .014); }
  }

  stopNodes(nodes) {
    for (const node of [...nodes]) {
      try { node.stop(); } catch {}
      node.onended?.();
    }
  }
  silence() { this.stopNodes(this.nodes); }
  destroy() {
    this.destroyed = true; this.abort.abort(); this.silence(); this.buffers.clear();
    this.propBuffers.clear();
    this.resultBuffers.clear();
    this.assetRetryAt.clear();
    this.context?.close().catch(() => {});
  }
}
