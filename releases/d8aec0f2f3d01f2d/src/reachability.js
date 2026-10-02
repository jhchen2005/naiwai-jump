import { CONFIG as C } from './config.js';

// A link must work with an ordinary bounce, with no spring/flight item.
// Use the fixed-step flight time and keep response/turning room for the player.
export function ordinaryJumpLimits(rise) {
  const maximumRise = C.player.jump ** 2 / (2 * C.player.gravity) - C.generation.jumpClearance;
  const effectiveJump = C.player.jump - C.player.gravity * C.step / 2;
  const discriminant = effectiveJump ** 2 - 2 * C.player.gravity * rise;
  if (rise < 0 || rise > maximumRise + 1e-6 || discriminant < 0) return { maximumRise, horizontalReach: 0, reachable: false };
  const flightTime = (effectiveJump + Math.sqrt(discriminant)) / C.player.gravity;
  const horizontalReach = Math.min(C.generation.shiftMax, (flightTime - C.generation.reactionTime) * C.player.speed * C.generation.travelFraction);
  return { maximumRise, horizontalReach, reachable: true };
}

// Check launch and landing at either end of both platforms' movement ranges.
// This applies to every remaining foothold, regardless of its route metadata.
export function ordinaryJumpConnection(from, to) {
  const motionX = [from, to].reduce((sum, p) => sum + (p.type === 'horizontal' ? p.amplitude : 0), 0);
  const motionY = [from, to].reduce((sum, p) => sum + (p.type === 'vertical' ? p.amplitude : 0), 0);
  const rise = to.baseY - from.baseY + motionY;
  const distance = Math.abs(to.baseX - from.baseX) + motionX;
  const limits = ordinaryJumpLimits(rise);
  return { rise, distance, ...limits, reachable: !from.broken && !to.broken && to.baseY > from.baseY && limits.reachable && distance <= limits.horizontalReach + 1e-6 };
}
