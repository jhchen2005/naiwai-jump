import { CONFIG as C, clamp, wrappedDistance } from './config.js';
export class Items {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.flight = null;
    this.springActive = false;
    this.cooldown = 0;
  }
  // All item types share a lock. No refreshes, upgrades or spring-to-flight chains.
  get blocked() { return Boolean(this.flight) || this.springActive || this.cooldown > 0; }
  pickup(type, player) {
    const spec = C.items[type];
    if (!spec?.duration || this.blocked) return false;
    this.flight = { type, remaining: spec.duration };
    this.emit('pickup', { itemType: type, x: player.x, y: player.y + 20 });
    return true;
  }
  useSpring(player) {
    if (this.blocked) return false;
    this.springActive = true;
    this.emit('spring', { x: player.x, y: player.y });
    return true;
  }
  land() {
    // A spring is in use for the whole boosted jump, until the next landing.
    if (!this.springActive) return;
    this.springActive = false;
    this.cooldown = C.items.cooldown;
  }
  collect(player, platforms) {
    if (this.blocked) return;
    for (const b of platforms) {
      if (b.broken || !b.item || b.item.type === 'spring') continue;
      const iy = b.y + 27;
      const closeY = Math.max(player.prevY, player.y) + C.player.height >= iy - 16 && Math.min(player.prevY, player.y) <= iy + 16;
      if (closeY && Math.abs(wrappedDistance(player.x, b.x)) < 31 && this.pickup(b.item.type, player)) { b.item = null; return; }
    }
  }
  update(dt, player) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const f = this.flight; if (!f) return null;
    f.remaining = Math.max(0, f.remaining - dt);
    if (f.remaining <= 0) {
      // Resume gravity on the existing level. No landing shelves or rescue path.
      player.vy = Math.min(player.vy, C.items.exitVelocity);
      this.flight = null;
      this.cooldown = C.items.cooldown;
      this.emit('flight-end', {}); return null;
    }
    const blend = clamp(f.remaining / C.items.exitEase, 0, 1);
    return C.items.exitVelocity + (C.items[f.type].speed - C.items.exitVelocity) * blend;
  }
}
