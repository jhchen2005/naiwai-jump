import { CONFIG as C } from './config.js';
import { drawPlatform, PALETTE } from './art.js';
import { Character } from './character.js';
import { loadPropArt } from './prop-art.js';
import { CHARACTER_MOTION } from './character-motion.js';
import { WorldRenderer } from './world.js';
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.particles = []; this.height = 650; this.scale = 1; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; this.character = new Character({ reduced: this.reduced, fast: true }); this.world = new WorldRenderer({ reduced: this.reduced }); }
  prepare(onProgress = () => {}) {
    let completed = 0;
    onProgress('正在加载角色和道具（0/2）…');
    const ready = name => { completed++; onProgress(`${name}已就绪（${completed}/2）…`); };
    // Background has a complete fallback; a slow illustration must not hold up
    // a playable character and visible pickups.
    this.world.prepare().catch(() => {});
    this.ready = Promise.all([
      this.character.ensureReady().then(() => ready('角色动作')),
      loadPropArt().then(() => ready('道具')),
    ]);
    // Preload errors are displayed by the API on start/resume; a later prepare
    // retries failed assets instead of retaining a rejected preload promise.
    this.ready.catch(() => {});
    return this.ready;
  }
  enhance() {
    this.character.enhance().catch(() => {});
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    if (r.width < 1 || r.height < 1) return this.height;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.scale = this.canvas.width / C.width; this.height = this.canvas.height / this.scale;
    return this.height;
  }
  burst(type, x, y) {
    if (this.reduced || !Number.isFinite(x)) return;
    const color = type === 'break' ? PALETTE.pink : type === 'pickup' || type === 'spring' ? PALETTE.yellow : '#fffdf1';
    const count = type === 'bounce' ? 5 : 14;
    for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (Math.random() - .5) * 160, vy: 30 + Math.random() * 140, life: .5, color, size: 2 + Math.random() * 3 });
    this.particles = this.particles.slice(-160);
  }
  render(game, dt) {
    const c = this.ctx, h = this.height;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0); c.clearRect(0, 0, C.width, h);
    this.world.render(c, game, C.width, h);
    for (const b of game.platforms) { const sy = h - (b.y - game.camera); if (sy > -65 && sy < h + 30) drawPlatform(c, b, sy, game.time, this.reduced); }
    for (const p of this.particles) {
      if (game.state === 'running' || game.state === 'dying') { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= dt * 400; }
      c.globalAlpha = Math.max(0, p.life * 2); c.fillStyle = p.color; c.fillRect(p.x, h - (p.y - game.camera), p.size, p.size);
    }
    c.globalAlpha = 1; this.particles = this.particles.filter(p => p.life > 0 && p.y > game.camera - 50);
    const p = game.player, sy = h - (p.y - game.camera);
    this.character.update(game);
    const margin = CHARACTER_MOTION.height;
    // Reduced motion substitutes a gentle fade for the longer falling exit.
    c.globalAlpha = this.reduced && game.death ? 1 - game.death.progress : 1;
    for (const offset of [-C.width, 0, C.width]) if (p.x + offset > -margin && p.x + offset < C.width + margin) this.character.draw(c, p.x + offset, sy);
    c.globalAlpha = 1;
  }
}
