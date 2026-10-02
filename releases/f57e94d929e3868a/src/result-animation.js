const MANIFEST = new URL('../assets/runtime/result-fast/animation.json', import.meta.url);

// Pages become usable independently. The first visible pose never waits for
// the final page, and a missing later page pauses BOTH the pose and its sound.
export class ResultAnimation {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'result-character result-laugh';
    this.canvas.setAttribute('aria-hidden', 'true'); this.canvas.hidden = true;
    this.ctx = this.canvas.getContext('2d');
    this.elapsed = 0; this.frame = -1; this.loopCount = 0; this.paused = true;
    this.generation = 0; this.images = []; this.destroyed = false;
    this.controller = new AbortController(); this.pageTasks = new Map(); this.retryAt = new Map();
    this.buffering = false; this.complete = false;
  }

  async request(url, consume, priority) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    try {
      if (this.destroyed) throw new Error('Result animation cancelled');
      const response = await fetch(url, { signal: controller.signal, priority });
      if (!response.ok) throw new Error('Result animation unavailable');
      return await consume(response);
    } finally {
      clearTimeout(timer); this.controller.signal.removeEventListener('abort', abort);
    }
  }

  async manifest(priority) {
    if (this.meta) return this.meta;
    if (!this.manifestTask) this.manifestTask = this.request(MANIFEST, response => response.json(), priority).then(meta => {
      if (this.destroyed) throw new Error('Result animation cancelled');
      this.meta = meta; this.canvas.width = this.canvas.height = meta.size;
      return meta;
    }).finally(() => { this.manifestTask = null; });
    return this.manifestTask;
  }

  loadPage(index, priority = 'low') {
    if (this.images[index]) return Promise.resolve(this.images[index]);
    if (this.pageTasks.has(index)) return this.pageTasks.get(index);
    const task = this.request(new URL(this.meta.pages[index], MANIFEST), async response => {
      const image = await createImageBitmap(await response.blob());
      if (this.destroyed) { image.close(); throw new Error('Result animation cancelled'); }
      this.images[index] = image; this.retryAt.delete(index);
      return image;
    }, priority).catch(error => {
      this.retryAt.set(index, performance.now() + 5000); throw error;
    }).finally(() => { this.pageTasks.delete(index); });
    this.pageTasks.set(index, task);
    return task;
  }

  async prime({ priority = 'high', pages = 1 } = {}) {
    await this.manifest(priority);
    await this.loadPage(0, priority);
    await Promise.all(Array.from({ length: Math.min(pages, this.meta.pages.length) - 1 }, (_, index) => this.loadPage(index + 1, priority)));
  }

  // Retain the public full-preparation contract for previews and verification.
  prepare({ priority = 'low' } = {}) {
    if (this.complete) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = (async () => {
      await this.prime({ priority });
      let next = 1;
      const workers = await Promise.allSettled(Array.from({ length: 2 }, async () => {
        while (next < this.meta.pages.length && !this.destroyed) await this.loadPage(next++, priority);
      }));
      const failure = workers.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (this.destroyed) throw new Error('Result animation cancelled');
      this.complete = this.meta.pages.every((_, index) => Boolean(this.images[index]));
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  reset() { this.pause(); this.buffering = false; this.canvas.dataset.buffering = 'false'; this.elapsed = 0; this.frame = -1; this.loopCount = 0; this.canvas.hidden = true; }
  get currentTime() {
    if (this.buffering) return this.elapsed;
    if (!this.paused && this.clock) return this.clock();
    return this.elapsed + (this.paused ? 0 : Math.max(0, (performance.now() - this.lastTime) / 1000));
  }
  setClock(clock) {
    this.elapsed = this.currentTime;
    this.lastTime = performance.now(); this.clock = clock;
  }

  frameAt(seconds) {
    const { fps, introFrames, loopFrames } = this.meta;
    const absolute = Math.floor(Math.max(0, seconds) * fps + 1e-6);
    return absolute >= introFrames ? introFrames + (absolute - introFrames) % loopFrames : absolute;
  }

  setBuffering(value) {
    if (this.buffering === value) return;
    this.buffering = value; this.canvas.dataset.buffering = String(value);
    this.onBuffering?.(value);
  }

  async resume() {
    const generation = this.generation;
    await this.prime();
    if (generation !== this.generation || this.destroyed) return false;
    if (!this.paused) return true;
    this.paused = false; this.canvas.dataset.playing = 'true';
    this.lastTime = performance.now(); this.draw(this.elapsed);
    this.prepare({ priority: 'high' }).catch(() => {});
    const tick = () => {
      if (this.paused || this.destroyed) return;
      const time = this.currentTime;
      const nextPage = this.buffering ? this.waitingPage : Math.floor(this.frameAt(time) / this.meta.framesPerPage);
      if (!this.images[nextPage]) {
        // elapsed is the last successfully painted position. Keep it while the
        // sound is stopped; neither source can run ahead of an invisible pose.
        this.waitingPage = nextPage; this.setBuffering(true);
        if (performance.now() >= (this.retryAt.get(nextPage) || 0)) this.loadPage(nextPage, 'high').catch(() => {});
      } else if (this.buffering) {
        this.lastTime = performance.now(); this.setBuffering(false);
      } else {
        this.elapsed = time; this.lastTime = performance.now(); this.draw(time);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  }

  draw(seconds) {
    if (!this.meta) return false;
    const { introFrames, loopFrames, framesPerPage, columns, size, loopPhase, fps } = this.meta;
    const frame = this.frameAt(seconds), page = Math.floor(frame / framesPerPage), cell = frame % framesPerPage;
    if (!this.images[page]) return false;
    const absolute = Math.floor(Math.max(0, seconds) * fps + 1e-6), looping = absolute >= introFrames;
    this.loopCount = looping ? Math.floor((absolute - introFrames) / loopFrames) : 0;
    this.canvas.dataset.phase = looping ? loopPhase || 'loop' : 'intro';
    if (frame === this.frame) return true;
    this.frame = frame; this.canvas.dataset.frame = String(frame);
    this.ctx.clearRect(0, 0, size, size);
    this.ctx.drawImage(this.images[page], (cell % columns) * size, Math.floor(cell / columns) * size, size, size, 0, 0, size, size);
    return true;
  }

  pause() {
    if (!this.paused) this.elapsed = this.currentTime;
    this.generation++; this.paused = true; cancelAnimationFrame(this.raf);
    this.canvas.dataset.playing = 'false';
  }
  destroy() {
    this.destroyed = true; this.pause(); this.controller.abort();
    this.images.forEach(image => image?.close()); this.images = []; this.meta = null;
  }
}

