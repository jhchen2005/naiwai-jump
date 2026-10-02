// Presentation values only: physical dimensions and the contact point stay in config.js.
import { SETTINGS } from './runtime-settings.js';
export const CHARACTER_MOTION = Object.freeze({
  height: SETTINGS.character.height, transition: .12, turnDuration: .14, turnResponse: 14, turnCompression: .08, maxLean: .20,
  durations: { idle: 2.4, steer: 1.1, jump: .65, fall: .8, land: .22, spring: 1, hat: 1.2, rocket: 1.2, fail: 1.2 },
});
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const mix = (a, b, t) => a + (b - a) * t;

// Hermite easing gives continuous velocity at authored pose boundaries.
function poseCurve(time, points) {
  for (let i = 1; i < points.length; i++) {
    const [end, x, y] = points[i], [start, px, py] = points[i - 1];
    if (time <= end) {
      const t = clamp((time - start) / (end - start)), smooth = t * t * (3 - 2 * t);
      return { sx: mix(px, x, smooth), sy: mix(py, y, smooth) };
    }
  }
  const [, sx, sy] = points.at(-1);
  return { sx, sy };
}

export function characterPose(clip, elapsed, { vy = 0, anticipation = 0 } = {}, reduced = false) {
  // Keep the pear-shaped body full even at the fastest part of a jump.
  const pose = { sx: 1.04, sy: 1, rotation: 0 };
  if (reduced) return pose;
  const t = Math.max(0, elapsed), wave = Math.sin(t * Math.PI * 2 / CHARACTER_MOTION.durations[clip]);
  if (clip === 'land') {
    Object.assign(pose, poseCurve(t, [[0, 1.18, .85], [.045, 1.23, .79], [.13, 1.045, 1.025], [.22, 1.04, 1]]));
  } else if (clip === 'jump') {
    const thrust = vy ? clamp(vy / 720) : Math.exp(-t * 2.5);
    pose.sy = 1 + .025 * thrust; pose.sx = 1.04 + .015 * thrust;
  } else if (clip === 'fall') {
    const falling = vy ? clamp(-vy / 1000) : .7;
    pose.sy = 1 + .015 * falling - .14 * anticipation;
    pose.sx = 1.04 + .01 * falling + .13 * anticipation;
  } else if (clip === 'steer') {
    pose.sx = 1.065; pose.sy = .98; pose.rotation = -.045;
  } else if (clip === 'idle') {
    pose.sx += .024 * wave; pose.sy -= .018 * wave;
  } else if (clip === 'spring') {
    pose.sx = 1.04 - .018 * wave; pose.sy = 1 + .018 * wave;
  } else if (clip === 'hat') {
    pose.rotation = .035 * wave;
  } else if (clip === 'rocket') {
    pose.sy = .98 + .012 * wave; pose.sx = 1.06; pose.rotation = -.055 + .025 * wave;
  } else if (clip === 'fail') {
    const fall = 1 - Math.exp(-6 * t);
    pose.sx = 1.04 + .045 * fall; pose.sy = 1 - .035 * fall; pose.rotation = .38 * fall;
  }
  return pose;
}

export function blendPose(from, to, weight) {
  return Object.fromEntries(Object.keys(to).map(key => [key, mix(from[key], to[key], weight)]));
}

export function sampleFrames(frames, elapsed, duration, reduced = false) {
  const position = reduced ? 0 : ((Math.max(0, elapsed) / duration) % 1) * frames.length;
  const index = Math.floor(position);
  return { from: frames[index], to: frames[(index + 1) % frames.length], weight: position - index, index };
}
