const MANIFEST = new URL('../assets/character/results-model-v2/animation.json', import.meta.url);

// A single clock plays an optional lead-in and then repeats the complete
// authored action. The manifest defines the loop's pose and frame boundaries.
export class ResultAnimation {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'result-character result-laugh';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.ctx = this.canvas.getContext('2d');
    this.elapsed = 0; this.frame = -1; this.loopCount = 0; this.paused = true;
    this.generation = 0; this.images = []; this.destroyed = false;
  }

  prepare() {
    if (this.meta) return Promise.resolve();
    if (this.loading) return this.loading;
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 6000);
    this.loading = (async () => {
      const response = await fetch(MANIFEST, { signal: controller.signal });
      if (!response.ok) throw new Error('Result animation unavailable');
      const meta = await response.json();
      const images = [];
      try {
        // Sequential decode keeps failures and bitmap ownership straightforward.
        for (const file of meta.pages) {
          const result = await fetch(new URL(file, MANIFEST), { signal: controller.signal });
          if (!result.ok) throw new Error('Result frame page unavailable');
          images.push(await createImageBitmap(await result.blob()));
        }
        if (this.destroyed || controller.signal.aborted) throw new Error('Result animation cancelled');
        this.images = images; this.meta = meta;
        this.canvas.width = meta.size; this.canvas.height = meta.size;
      } catch (error) { images.forEach(image => image.close()); throw error; }
    })().finally(() => { clearTimeout(timer); this.loading = null; });
    return this.loading;
  }

  reset() { this.pause(); this.elapsed = 0; this.frame = -1; this.loopCount = 0; this.canvas.hidden = true; }

  async resume() {
    const generation = this.generation;
    await this.prepare();
    if (generation !== this.generation || this.destroyed) return false;
    if (!this.paused) return true;
    this.paused = false; this.canvas.dataset.playing = 'true';
    this.lastTime = performance.now();
    this.draw(this.elapsed);
    const tick = now => {
      if (this.paused || this.destroyed) return;
      // Skipped rendering frames must not slow a long audio-backed action.
      // Background suspension is handled explicitly by pause()/resume().
      this.elapsed += Math.max((now - this.lastTime) / 1000, 0); this.lastTime = now;
      this.draw(this.elapsed); this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  }

  draw(seconds) {
    if (!this.meta) return;
    const { fps, introFrames, loopFrames, framesPerPage, columns, size, loopPhase } = this.meta;
    const absolute = Math.floor(Math.max(0, seconds) * fps + 1e-6);
    const looping = absolute >= introFrames;
    const frame = looping ? introFrames + (absolute - introFrames) % loopFrames : absolute;
    this.loopCount = looping ? Math.floor((absolute - introFrames) / loopFrames) : 0;
    this.canvas.dataset.phase = looping ? loopPhase || 'loop' : 'intro';
    if (frame === this.frame) return;
    this.frame = frame; this.canvas.dataset.frame = String(frame);
    const page = Math.floor(frame / framesPerPage), cell = frame % framesPerPage;
    this.ctx.clearRect(0, 0, size, size);
    this.ctx.drawImage(this.images[page], (cell % columns) * size, Math.floor(cell / columns) * size, size, size, 0, 0, size, size);
  }

  pause() { this.generation++; this.paused = true; cancelAnimationFrame(this.raf); this.canvas.dataset.playing = 'false'; }
  destroy() {
    this.destroyed = true; this.pause(); this.controller?.abort();
    this.images.forEach(image => image.close()); this.images = []; this.meta = null;
  }
}
