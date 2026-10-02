import { CONFIG as BASE } from './config-defaults.js';
import { SETTINGS } from './runtime-settings.js';

export const CONFIG = Object.freeze({
  ...BASE,
  player: { ...BASE.player, ...SETTINGS.player },
  difficulty: SETTINGS.difficulty,
  items: SETTINGS.items,
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const wrap = (n, width = CONFIG.width) => ((n % width) + width) % width;
export const wrappedDistance = (a, b, width = CONFIG.width) => wrap(a - b + width / 2, width) - width / 2;
export function seededRandom(seed = Date.now()) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
