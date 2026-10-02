// All distances are logical pixels, time is seconds, world Y points up.
export const CONFIG = Object.freeze({
  width: 390, step: 1 / 120, maxFrame: .12,
  player: { width: 30, height: 40, gravity: 1600, jump: 720, speed: 270, response: 16, brake: 23, terminal: 1150 },
  camera: { follow: .55, recycle: 180, ahead: 360 },
  generation: {
    startY: 60, startWidth: 126,
    safeRows: 1, introGapMin: 90, introGapMax: 102,
    width: 78, jumpClearance: 22,
    shiftMax: 112, reactionTime: .14, travelFraction: .78,
    bonusMinRows: 4, bonusMinHeight: 650,
    amplitudeX: 44, amplitudeY: 30,
  },
  // Heights are displayed metres. Geometry/speed interpolate to the next row;
  // Permanent route type counts change at thresholds; fragile shortcuts are optional.
  difficulty: [
    { height: 0, name: '起步', width: 78, gapMin: 104, gapMax: 116, shiftMin: 50, amplitudeX: 44, amplitudeY: 30, frequency: .65, fixedCount: 2, bonusChance: .12 },
    { height: 100, name: '进阶', width: 70, gapMin: 112, gapMax: 128, shiftMin: 60, amplitudeX: 48, amplitudeY: 33, frequency: 1, fixedCount: 2, bonusChance: .16 },
    { height: 250, name: '挑战', width: 62, gapMin: 118, gapMax: 134, shiftMin: 70, amplitudeX: 52, amplitudeY: 36, frequency: 1.4, fixedCount: 1, bonusChance: .20 },
    { height: 500, name: '高难', width: 56, gapMin: 124, gapMax: 138, shiftMin: 78, amplitudeX: 56, amplitudeY: 39, frequency: 1.85, fixedCount: 1, bonusChance: .24 },
    { height: 800, name: '极限', width: 50, gapMin: 128, gapMax: 140, shiftMin: 86, amplitudeX: 60, amplitudeY: 42, frequency: 2.3, fixedCount: 1, bonusChance: .28 },
  ],
  items: { spring: { velocity: 1120, chance: .13 }, hat: { speed: 330, duration: 4, chance: .065 }, rocket: { speed: 760, duration: 3.5, chance: .035 }, cooldown: 3, exitVelocity: 230, exitEase: .5 },
  tilt: { deadzone: 2, fullAngle: 18, smoothing: 12, timeout: 4500, staleAfter: 2200, calibrationTime: 650 },
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const wrap = (n, width = CONFIG.width) => ((n % width) + width) % width;
export const wrappedDistance = (a, b, width = CONFIG.width) => wrap(a - b + width / 2, width) - width / 2;
export function seededRandom(seed = Date.now()) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
