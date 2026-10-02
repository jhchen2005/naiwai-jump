import { CONFIG as C, wrap, wrappedDistance } from './config.js';
import { Generator } from './generator.js';
import { movePlayer, findLanding, updatePlatforms } from './physics.js';
import { Items } from './items.js';
import { difficultyAtHeight } from './difficulty.js';
export class Game {
  constructor({ onEvent = () => {}, height = 650, reducedMotion = false } = {}) {
    this.onEvent = () => {}; this.height = height; this.reducedMotion = reducedMotion; this.state = 'idle'; this.reset(1); this.state = 'idle'; this.onEvent = onEvent;
  }
  emit(type, detail = {}) { this.onEvent({ type, ...detail }); }
  clearItems() { for (const b of this.platforms) b.item = null; }
  reset(seed = Date.now()) {
    this.time = 0; this.camera = 0; this.maxHeight = 0; this.accumulator = 0; this.death = null; this.pausedFrom = null;
    this.generator = new Generator(seed); this.platforms = [this.generator.initial()];
    this.generator.generateUntil(this.height + C.camera.ahead, this.platforms);
    this.player = { x: C.width / 2, y: C.generation.startY, prevX: C.width / 2, prevY: C.generation.startY, unwrappedX: C.width / 2, vx: 0, vy: C.player.jump, bounce: 1 };
    this.items = new Items((type, detail) => {
      if (type === 'pickup' || type === 'spring') this.clearItems();
      this.emit(type, detail);
    });
    this.state = 'running'; this.emit('state', { state: this.state });
    this.emit('jump-start', { x: this.player.x, y: this.player.y });
  }
  pause(reason = 'manual') {
    if (this.state !== 'running' && this.state !== 'dying') return;
    this.pausedFrom = this.state; this.state = 'paused'; this.accumulator = 0;
    if (this.pausedFrom === 'running') this.player.vx = 0;
    this.emit('state', { state: this.state, reason });
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom || 'running'; this.pausedFrom = null; this.accumulator = 0;
    this.emit('state', { state: this.state });
  }
  advance(dt, input) {
    if (this.state !== 'running' && this.state !== 'dying') return;
    this.accumulator += Math.max(0, Math.min(dt, C.maxFrame));
    while (this.accumulator >= C.step && (this.state === 'running' || this.state === 'dying')) {
      this.accumulator -= C.step; this.step(C.step, input);
    }
  }
  step(dt, input) {
    if (this.state === 'dying') { this.stepFall(dt); return; }
    if (this.state !== 'running') return;
    this.time += dt; const p = this.player;
    updatePlatforms(this.platforms, this.time);
    const velocity = this.items.update(dt, p);
    if (this.items.blocked) this.clearItems();
    movePlayer(p, dt, input, velocity);
    this.items.collect(p, this.platforms);
    if (!this.items.flight) {
      const hit = findLanding(p, this.platforms);
      if (hit) {
        const b = hit.platform;
        p.y = b.y; p.vy = C.player.jump; p.bounce = 1;
        this.items.land();
        const spring = b.item?.type === 'spring' && Math.abs(wrappedDistance(p.x, b.x)) < 31 && this.items.useSpring(p);
        if (spring) { p.vy = C.items.spring.velocity; b.springAt = this.time; }
        else this.emit('bounce', { x: p.x, y: p.y, platformId: b.id });
        if (b.type === 'fragile') { b.broken = true; b.brokenAt = this.time; this.emit('break', { x: b.x, y: b.y }); }
      }
    }
    p.bounce = Math.max(0, p.bounce - dt * 5);
    this.maxHeight = Math.max(this.maxHeight, Math.max(0, p.y - C.generation.startY));
    this.camera = Math.max(this.camera, p.y - this.height * C.camera.follow);
    this.generator.generateUntil(this.camera + this.height + C.camera.ahead, this.platforms, { allowItems: !this.items.blocked, time: this.time });
    this.platforms = this.platforms.filter(b => b.y > this.camera - C.camera.recycle && (!b.broken || this.time - b.brokenAt < .6));
    if (this.hasFallen()) this.startFall();
  }
  hasFallen() {
    const p = this.player;
    if (p.y + C.player.height < this.camera) return true;
    if (p.vy >= 0 || this.items.flight || p.y > this.camera + 110) return false;
    // Keep every possible recovery alive, including partly visible platforms.
    // Vertical motion envelopes also preserve platforms that can move back
    // into the existing collision window before the player crosses the cutoff.
    // Waiting until the feet pass the lowest available top makes the loss final
    // without moving the camera or teleporting the character back into view.
    const lowestLanding = this.camera - C.player.height;
    return !this.platforms.some(b => {
      if (b.broken) return false;
      const low = b.type === 'vertical' ? b.baseY - b.amplitude : b.y;
      const high = b.type === 'vertical' ? b.baseY + b.amplitude : b.y;
      const canLand = low <= p.y && high >= lowestLanding;
      // Match the pickup overlap in Items.collect: a hat/rocket can still
      // rescue the upper body briefly after the feet have missed its platform.
      const canCollect = !this.items.blocked && C.items[b.item?.type]?.duration
        && low + 27 - 16 <= p.y + C.player.height && high + 27 + 16 >= lowestLanding;
      return canLand || canCollect;
    });
  }
  startFall() {
    if (this.state !== 'running') return;
    const p = this.player, score = this.score;
    this.death = { elapsed: 0, duration: this.reducedMotion ? .24 : .78, progress: 0, score };
    this.state = 'dying'; p.bounce = 0;
    this.emit('fall-start', { score, duration: this.death.duration, x: p.x, y: p.y });
    this.emit('state', { state: this.state });
  }
  stepFall(dt) {
    const p = this.player, fall = this.death;
    const elapsed = Math.min(dt, fall.duration - fall.elapsed);
    this.time += elapsed; fall.elapsed += elapsed; fall.progress = Math.min(1, fall.elapsed / fall.duration);
    // A brief slow-motion exit retains the existing position and momentum.
    // Only the actor advances: controls, pickups, scoring and camera are frozen.
    const motionDt = elapsed * (this.reducedMotion ? .18 : .35);
    p.prevX = p.x; p.prevY = p.y;
    p.vx *= Math.exp(-4 * motionDt);
    p.unwrappedX = p.x + p.vx * motionDt; p.x = wrap(p.unwrappedX);
    p.vy = Math.max(-C.player.terminal, p.vy - C.player.gravity * motionDt);
    p.y += p.vy * motionDt;
    if (fall.progress >= 1) {
      this.state = 'over'; this.accumulator = 0;
      this.emit('gameover', { score: fall.score }); this.emit('state', { state: this.state });
    }
  }
  get score() { return this.death?.score ?? Math.floor(this.maxHeight / 10); }
  get difficulty() { const p = difficultyAtHeight(this.score); return { stage: p.stage, name: p.name, minHeight: p.height }; }
  snapshot() { return { state: this.state, height: this.score, mode: this.mode, camera: this.camera, difficulty: this.difficulty, flight: this.items.flight ? { ...this.items.flight } : null, death: this.death ? { ...this.death } : null }; }
}
