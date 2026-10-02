import { CHARACTER_MOTION as M, characterPose, blendPose, sampleFrames } from './character-motion.js';
import { wrappedDistance } from './config.js';

// The user's original geometry stays intact. Animation is foot-anchored and purely visual.
const assetRoot = new URL('../assets/character/confirmed-v1/', import.meta.url);
const actionRoot = new URL('../assets/props/enlarged-v2/', import.meta.url);
const propClips = { spring: 'pogo', hat: 'broom', rocket: 'jetpack' };
export const CHARACTER_CLIPS = ['idle', 'steer', 'jump', 'fall', 'land', 'spring', 'hat', 'rocket', 'fail'];
let assetsPromise;
const readImage = url => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('角色图片加载失败，请刷新重试。')); image.src = url.href;
});
const readData = url => fetch(url).then(r => { if (!r.ok) throw new Error('角色资源加载失败，请刷新重试。'); return r.json(); });
export function loadCharacter() {
  if (!assetsPromise) assetsPromise = Promise.all([
    readData(new URL('atlas.json', assetRoot)), readImage(new URL('atlas.png', assetRoot)),
    readData(new URL('actions.json', actionRoot)), readImage(new URL('actions.png', actionRoot)),
  ]).then(([data, image, actionData, actionImage]) => ({ data, image, actions: { data: actionData, image: actionImage } }))
    .catch(error => { assetsPromise = null; throw error; });
  return assetsPromise;
}

export class Character {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced; this.assets = null; this.frameGroups = new Map();
    this.buffer = null; this.bufferKey = null; this.resetMotion();
    this.ready = this.load(); this.ready.catch(() => {});
  }
  resetMotion() {
    this.clip = 'idle'; this.elapsed = 0; this.facing = -1; this.lastTime = 0; this.lastBounce = 0;
    this.transition = null; this.turn = null; this.lean = 0; this.motion = { vx: 0, vy: 0, anticipation: 0 };
  }
  load() {
    return loadCharacter().then(assets => {
      this.assets = assets;
      for (const [clip, kind] of Object.entries(propClips)) {
        this.frameGroups.set(clip, assets.actions.data.frames.filter(f => f.kind === kind).sort((a, b) => a.frame - b.frame));
      }
      this.baseFrame = assets.data.frames.find(f => f.clip === 'idle' && f.frame === 0);
      this.bufferKey = null;
      return assets;
    });
  }
  ensureReady() { if (!this.assets) this.ready = this.load(); return this.ready; }
  duration(clip = this.clip) { return this.assets?.actions.data.animations?.[propClips[clip]]?.duration ?? M.durations[clip]; }
  select(clip, animate = false) {
    if (clip === this.clip) return;
    this.transition = animate && !this.reduced ? {
      clip: this.clip, elapsed: this.elapsed, remaining: M.transition, pose: this.currentPose(),
    } : null;
    this.clip = clip; this.elapsed = 0;
  }
  update(game) {
    const reset = game.time < this.lastTime;
    const dt = reset ? 0 : Math.max(0, game.time - this.lastTime);
    if (reset) this.resetMotion();
    this.lastTime = game.time;
    if (game.state === 'paused') return;
    const p = game.player;
    const facing = p.vx > 20 ? 1 : p.vx < -20 ? -1 : this.facing;
    if (facing !== this.facing) {
      this.turn = this.reduced ? null : { from: this.visibleFacing, remaining: M.turnDuration };
      this.facing = facing;
    }
    this.lean += (Math.max(-1, Math.min(1, p.vx / 270)) - this.lean) * (1 - Math.exp(-M.turnResponse * dt));
    const landing = p.bounce > this.lastBounce + .2;
    this.lastBounce = p.bounce;
    let anticipation = 0;
    if (game.state === 'running' && p.vy < 0 && !game.items.flight && !game.items.springActive) {
      for (const b of game.platforms ?? []) {
        const gap = p.y - b.y;
        if (!b.broken && gap >= 0 && gap < 65 && Math.abs(wrappedDistance(p.x, b.x)) < b.width / 2 + 12) {
          anticipation = Math.max(anticipation, 1 - gap / 65);
        }
      }
    }
    this.motion = { vx: p.vx, vy: p.vy, anticipation };
    const flight = game.items.flight?.type;
    let clip;
    if (game.state === 'dying' || game.state === 'over') clip = 'fail';
    else if (game.state === 'idle') clip = 'idle';
    else if (flight) clip = flight;
    else if (game.items.springActive) clip = 'spring';
    else if (landing || (this.clip === 'land' && this.elapsed + dt < M.durations.land)) clip = 'land';
    else if (p.vy < 0) clip = 'fall';
    else if (Math.abs(p.vx) > 70 && p.vy < 240) clip = 'steer';
    else clip = 'jump';
    this.select(clip, true); this.elapsed += dt;
    if (this.transition) {
      this.transition.remaining -= dt; this.transition.elapsed += dt;
      if (this.transition.remaining <= 0) this.transition = null;
    }
    if (this.turn) { this.turn.remaining -= dt; if (this.turn.remaining <= 0) this.turn = null; }
  }
  get visibleFacing() { return this.turn?.remaining > M.turnDuration / 2 ? this.turn.from : this.facing; }
  get frameIndex() {
    if (this.reduced) return 0;
    const frames = this.frameGroups.get(this.clip);
    return frames ? sampleFrames(frames, this.elapsed, this.duration()).index : Math.min(7, Math.floor(this.elapsed / M.durations[this.clip] * 8) % 8);
  }
  currentPose() {
    const target = characterPose(this.clip, this.elapsed, this.motion, this.reduced);
    if (!this.transition) return target;
    const t = 1 - this.transition.remaining / M.transition;
    return blendPose(this.transition.pose, target, 1 - (1 - t) ** 3);
  }
  draw(ctx, x, footY, height = M.height) {
    if (!this.assets) return;
    const pose = this.currentPose();
    const key = JSON.stringify([this.clip, this.elapsed, pose, this.transition, this.reduced]);
    if (key !== this.bufferKey) { this.compose(pose); this.bufferKey = key; }
    const mirror = this.visibleFacing === 1 ? -1 : 1;
    const turnWidth = this.turn ? 1 - M.turnCompression * Math.sin(Math.PI * (1 - this.turn.remaining / M.turnDuration)) : 1;
    const scale = height / 256;
    ctx.save(); ctx.translate(x, footY);
    ctx.rotate(this.reduced ? 0 : this.lean * M.maxLean);
    ctx.scale(mirror * turnWidth * scale, scale);
    ctx.drawImage(this.buffer, -384, -620);
    ctx.restore();
  }
  compose(pose) {
    if (!this.buffer) {
      this.buffer = document.createElement('canvas'); this.buffer.width = 768; this.buffer.height = 800;
    }
    const ctx = this.buffer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 768, 800);
    ctx.translate(384, 620); ctx.rotate(pose.rotation); ctx.scale(pose.sx, pose.sy);
    // Weighted premultiplied pixels keep the body opaque halfway between frames.
    // Isolate additive compositing from the game background.
    ctx.globalCompositeOperation = 'lighter';
    const transition = this.transition;
    const changingAsset = transition && (propClips[transition.clip] || propClips[this.clip]);
    if (changingAsset) {
      const weight = Math.max(0, Math.min(1, transition.remaining / M.transition));
      this.paintClip(ctx, transition.clip, transition.elapsed, weight);
      this.paintClip(ctx, this.clip, this.elapsed, 1 - weight);
    } else this.paintClip(ctx, this.clip, this.elapsed, 1);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  paintClip(ctx, clip, elapsed, opacity) {
    const kind = propClips[clip];
    const { data, image } = kind ? this.assets.actions : this.assets;
    const draw = (frame, weight) => {
      if (weight <= 0) return;
      const h = 256 * (frame.cameraHeight ?? data.cameraHeight) / (frame.modelHeight ?? data.modelHeight);
      const w = h * frame.w / frame.h;
      ctx.globalAlpha = opacity * weight;
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, -frame.anchor[0] * w, -frame.anchor[1] * h, w, h);
    };
    if (!kind) { draw(this.baseFrame, 1); return; }
    const sample = sampleFrames(this.frameGroups.get(clip), elapsed, this.duration(clip), this.reduced);
    draw(sample.from, 1 - sample.weight); draw(sample.to, sample.weight);
  }
}
