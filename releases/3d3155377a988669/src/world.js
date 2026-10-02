// Heights are displayed game metres, independent of difficulty and physics.
// Background art contains no playable platforms; every landing surface is drawn by art.js.
import { SETTINGS } from './runtime-settings.js';
export const WORLD_REGIONS = Object.freeze([
  { id: 'cave', name: '幽光矿洞', start: 0, sky: '#718172', haze: '#a6b29e', accent: '#53715b', top: '#c5cfb4', side: '#879780', shade: '#526653', cap: 'stone' },
  { id: 'forest', name: '青翠山林', start: 120, sky: '#c8ded5', haze: '#b7ccad', accent: '#4f7650', top: '#b9cc8f', side: '#96a080', shade: '#617554', cap: 'grass' },
  { id: 'mountain', name: '群山之巅', start: 280, sky: '#c3d8df', haze: '#edf0e7', accent: '#56716a', top: '#dddfcb', side: '#a0aba1', shade: '#6a7b73', cap: 'stone' },
  { id: 'snow', name: '寂静雪山', start: 460, sky: '#bed9e7', haze: '#f0f3ed', accent: '#567787', top: '#f4f7f0', side: '#a1b5bd', shade: '#687f8d', cap: 'snow' },
  { id: 'sky', name: '天际云海', start: 680, sky: '#94bfd4', haze: '#f6f4e8', accent: '#4c7481', top: '#e3e5d0', side: '#afbaa9', shade: '#768b7e', cap: 'cloud' },
  { id: 'space', name: '远古星河', start: 900, sky: '#233b4b', haze: '#364b60', accent: '#5d687d', top: '#b9b8c3', side: '#8a8c9f', shade: '#565f73', cap: 'ancient' },
].map((region, i) => Object.freeze({ ...region, ...SETTINGS.world[i] })));

export const WORLD_TRANSITION = 24;
const clamp01 = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t = clamp01(n); return t * t * (3 - 2 * t); };
const safeHeight = metres => Number.isFinite(metres) ? Math.max(0, metres) : 0;

export function regionAtHeight(metres) {
  const height = safeHeight(metres);
  return WORLD_REGIONS.findLast(region => height >= region.start) || WORLD_REGIONS[0];
}

// Stateless and reversible: replay/return/restart can never retain a previous scene.
export function worldBlendAtHeight(metres) {
  const height = safeHeight(metres);
  for (let i = 1; i < WORLD_REGIONS.length; i++) {
    const next = WORLD_REGIONS[i];
    if (height < next.start + WORLD_TRANSITION) {
      const mix = smooth((height - next.start + WORLD_TRANSITION) / (WORLD_TRANSITION * 2));
      return { from: WORLD_REGIONS[i - 1], to: next, mix };
    }
  }
  const last = WORLD_REGIONS.at(-1);
  return { from: last, to: last, mix: 0 };
}

function mixColor(a, b, t) {
  const rgb = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const aa = rgb(a), bb = rgb(b);
  return `rgb(${aa.map((n, i) => Math.round(n + (bb[i] - n) * t)).join(',')})`;
}

export function platformThemeAtHeight(metres) {
  const { from, to, mix } = worldBlendAtHeight(metres);
  const theme = { ...(mix < .5 ? from : to) };
  for (const key of ['top', 'side', 'shade']) theme[key] = mixColor(from[key], to[key], mix);
  return theme;
}

const imageEntries = new Map();
const artRoot = new URL('../assets/world/', import.meta.url);
function loadImage(id) {
  const current = imageEntries.get(id);
  if (current?.image) return Promise.resolve(current.image);
  if (current?.pending) return current.pending;
  const entry = { image: null, pending: null };
  imageEntries.set(id, entry);
  entry.pending = new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true; clearTimeout(timer); image.onload = image.onerror = null;
      entry.image = ok ? image : null; entry.pending = null;
      resolve(entry.image);
    };
    const timer = setTimeout(() => finish(false), 12000);
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    image.src = new URL(`${id}.webp`, artRoot).href;
  });
  return entry.pending;
}

export class WorldRenderer {
  constructor({ reduced = false } = {}) { this.reduced = reduced; this.images = new Map(); this.requests = new Map(); this.retryAt = new Map(); }
  ensure(region) {
    if (!region || this.images.has(region.id)) return Promise.resolve();
    if (this.requests.has(region.id)) return this.requests.get(region.id);
    if (performance.now() < (this.retryAt.get(region.id) || 0)) return Promise.resolve();
    const task = loadImage(region.id).then(image => {
      if (image) this.images.set(region.id, image);
      else this.retryAt.set(region.id, performance.now() + 5000);
    }).finally(() => this.requests.delete(region.id));
    this.requests.set(region.id, task); return task;
  }
  async prepare({ all = false } = {}) {
    this.retryAt.clear();
    await Promise.all((all ? WORLD_REGIONS : [WORLD_REGIONS[0]]).map(region => this.ensure(region)));
    return this;
  }
  drawPlate(c, region, width, height, metres) {
    const image = this.images.get(region.id);
    if (!image) { this.drawFallback(c, region, width, height); return; }
    // Cover without stretching. Overscan leaves room for slow, height-driven parallax.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * 1.07;
    const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
    const index = WORLD_REGIONS.indexOf(region), next = WORLD_REGIONS[index + 1];
    const progress = next ? smooth((metres - region.start + WORLD_TRANSITION) / (next.start - region.start + WORLD_TRANSITION * 2))
      : 1 - Math.exp(-Math.max(0, metres - region.start) / 900);
    const y = -(dh - height) * (this.reduced ? .5 : 1 - progress);
    c.drawImage(image, (width - dw) / 2, y, dw, dh);
  }
  drawFallback(c, region, width, height) {
    const gradient = c.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, region.sky); gradient.addColorStop(1, region.haze);
    c.fillStyle = gradient; c.fillRect(0, 0, width, height);
    // A missing illustration still leaves a legible, complete game with quiet scenery.
    c.fillStyle = region.shade; c.globalAlpha *= .3;
    if (region.id === 'space') {
      c.fillStyle = '#fff4d4';
      for (let i = 0; i < 30; i++) c.fillRect((i * 113 + 21) % width, (i * 157 + 39) % height, 2, 2);
    } else {
      for (const side of [0, 1]) {
        c.beginPath(); c.moveTo(side ? width : 0, 0);
        for (let y = 0, i = 0; y <= height + 100; y += 110, i++) c.lineTo(side ? width - 14 - (i % 3) * 12 : 14 + (i % 3) * 12, y);
        c.lineTo(side ? width : 0, height); c.closePath(); c.fill();
      }
    }
  }
  render(c, game, width, height) {
    const metres = game.maxHeight / 10;
    const { from, to, mix } = worldBlendAtHeight(metres);
    this.ensure(from);
    // Prefetch the approaching region; distant backgrounds never block startup.
    if (mix > 0 || metres >= to.start - 100) this.ensure(to);
    c.save(); this.drawPlate(c, from, width, height, metres); c.restore();
    if (mix > 0 && to !== from) { c.save(); c.globalAlpha = mix; this.drawPlate(c, to, width, height, metres); c.restore(); }
    if (!this.reduced) {
      c.save(); this.drawAtmosphere(c, from, game, width, height, 1 - mix); c.restore();
      if (mix > 0) { c.save(); this.drawAtmosphere(c, to, game, width, height, mix); c.restore(); }
    }
  }
  drawAtmosphere(c, region, game, width, height, opacity) {
    if (opacity <= .01) return;
    const count = region.id === 'snow' ? 22 : 10;
    for (let i = 0; i < count; i++) {
      const pace = region.id === 'snow' ? 11 : 3;
      const x = ((i * 107 + 31 + Math.sin(game.time * .25 + i) * 10) % width + width) % width;
      const y = ((i * 163 + game.camera * .12 + game.time * pace) % (height + 30)) - 15;
      c.globalAlpha = opacity * (region.id === 'snow' ? .55 : .25);
      c.fillStyle = region.id === 'cave' ? '#ffde99' : region.id === 'forest' ? '#d8f68c' : '#fff8df';
      c.beginPath(); c.ellipse(x, y, i % 3 === 0 ? 1.5 : .9, region.id === 'forest' ? 2.4 : 1.2, i, 0, Math.PI * 2); c.fill();
    }
  }
}
