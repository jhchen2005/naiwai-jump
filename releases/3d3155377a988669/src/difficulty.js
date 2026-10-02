import { CONFIG as C, clamp } from './config.js';

// One source of truth for generation, HUD labels, integration and verification.
export function difficultyAtHeight(height) {
  const metres = Math.max(0, Number.isFinite(height) ? height : 0);
  let stage = 0;
  while (stage + 1 < C.difficulty.length && metres >= C.difficulty[stage + 1].height) stage++;
  const current = C.difficulty[stage], next = C.difficulty[stage + 1] ?? current;
  const t = current === next ? 0 : clamp((metres - current.height) / (next.height - current.height), 0, 1);
  const profile = { ...current, stage };
  for (const key of ['width', 'gapMin', 'gapMax', 'shiftMin', 'amplitudeX', 'amplitudeY', 'frequency', 'bonusChance']) {
    profile[key] += (next[key] - current[key]) * t;
  }
  return profile;
}

export function routeTypesFor(profile) {
  return [
    ...Array(profile.fixedCount).fill('fixed'),
    ...Array(4).fill('vertical'),
    ...Array(6 - profile.fixedCount).fill('horizontal'),
  ];
}
