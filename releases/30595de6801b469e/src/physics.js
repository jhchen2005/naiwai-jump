import { CONFIG as C, wrap, wrappedDistance } from './config.js';
export function movePlayer(p, dt, input, flightVelocity = null) {
  p.prevX = p.x; p.prevY = p.y;
  const target = input * C.player.speed;
  p.vx += (target - p.vx) * (1 - Math.exp(-(input ? C.player.response : C.player.brake) * dt));
  if (Math.abs(p.vx) < .05) p.vx = 0;
  p.unwrappedX = p.x + p.vx * dt;
  p.x = wrap(p.unwrappedX);
  if (flightVelocity !== null) p.vy += (flightVelocity - p.vy) * (1 - Math.exp(-9 * dt));
  else p.vy = Math.max(-C.player.terminal, p.vy - C.player.gravity * dt);
  p.y += p.vy * dt;
}
// Swept feet vs. moving platform top. Earliest relative crossing wins.
// The player's upward movement is always pass-through, even on descending platforms.
export function findLanding(p, platforms) {
  if (p.vy > 0) return null;
  let hit = null;
  for (const b of platforms) {
    if (b.broken) continue;
    const before = p.prevY - b.prevY, after = p.y - b.y;
    if (before < -.001 || after > 0 || before - after <= 0) continue;
    const t = before / (before - after);
    const px = p.prevX + (p.unwrappedX - p.prevX) * t;
    const bx = b.prevX + (b.x - b.prevX) * t;
    if (Math.abs(wrappedDistance(px, bx)) > (b.width + C.player.width) / 2 - 3) continue;
    if (!hit || t < hit.t) hit = { platform: b, t };
  }
  return hit;
}
export function updatePlatforms(platforms, time) {
  for (const b of platforms) {
    b.prevX = b.x; b.prevY = b.y;
    if (b.type === 'horizontal') b.x = b.baseX + Math.sin(time * b.frequency + b.phase) * b.amplitude;
    if (b.type === 'vertical') b.y = b.baseY + Math.sin(time * b.frequency + b.phase) * b.amplitude;
  }
}
