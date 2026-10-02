// Replace this renderer (or individual draw functions) without changing physics.
import { drawProp } from './prop-art.js';
import { platformThemeAtHeight } from './world.js';
export const PALETTE = { ink: '#263f3d', cream: '#fffdf1', green: '#b6d7b1', pink: '#f6b8c8', blue: '#addce4', yellow: '#f6d75d', orange: '#f1a468' };
function round(c, x, y, w, h, r, fill, stroke = PALETTE.ink) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } }
export function drawBaby(c, x, y, { vy = 0, bounce = 0, flight = null, time = 0, failed = false } = {}) {
  c.save(); c.translate(x, y - 21);
  const squish = bounce * .23;
  c.scale(1 + squish, 1 - squish + (vy > 200 ? .05 : 0)); c.rotate(Math.max(-.1, Math.min(.1, vy / 7000)));
  c.strokeStyle = PALETTE.ink; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-15, 9); c.lineTo(-22, flight ? -3 : 4); c.moveTo(15, 9); c.lineTo(22, flight ? -3 : 4); c.stroke();
  round(c, -16, -19, 32, 38, 14, PALETTE.cream);
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 13, 14, 7, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#a0bab1'; c.beginPath(); c.moveTo(-12, 11); c.quadraticCurveTo(0, 17, 12, 11); c.stroke();
  c.fillStyle = PALETTE.pink; c.beginPath(); c.ellipse(-10, -1, 4, 2.7, 0, 0, 7); c.ellipse(10, -1, 4, 2.7, 0, 0, 7); c.fill();
  c.strokeStyle = PALETTE.ink;
  if (failed) { for (const xx of [-6, 6]) { c.beginPath(); c.moveTo(xx - 2, -6); c.lineTo(xx + 2, -2); c.moveTo(xx + 2, -6); c.lineTo(xx - 2, -2); c.stroke(); } }
  else { c.fillStyle = PALETTE.ink; for (const xx of [-6, 6]) { c.beginPath(); c.ellipse(xx, -5, 1.7, 2.2, 0, 0, 7); c.fill(); } }
  c.beginPath(); c.arc(0, -1, 3, 0, Math.PI); c.stroke();
  c.beginPath(); c.moveTo(-2, -19); c.bezierCurveTo(-9, -30, 10, -29, 3, -20); c.stroke();
  c.beginPath(); c.moveTo(-8, 19); c.lineTo(-11, 22); c.moveTo(8, 19); c.lineTo(11, 22); c.stroke();
  if (flight === 'hat') drawItem(c, 'hat', 0, -26, time);
  if (flight === 'rocket') { c.save(); c.translate(24, 4); drawItem(c, 'rocket', 0, 0, time); c.restore(); }
  c.restore();
}
export function drawItem(c, type, x, y, time, compressed = 0) {
  return drawProp(c, type, x, y, time, compressed);
}
function drawPlatformDirection(c, x, y, vertical) {
  // Draw both directions from the same geometry. Unicode arrows can become
  // colored emoji on mobile, regardless of the requested font or fill color.
  c.save(); c.translate(x, y);
  if (vertical) c.rotate(Math.PI / 2);
  c.strokeStyle = '#285744'; c.lineWidth = 2;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0);
  c.moveTo(-2, -3); c.lineTo(-5, 0); c.lineTo(-2, 3);
  c.moveTo(2, -3); c.lineTo(5, 0); c.lineTo(2, 3);
  c.stroke(); c.restore();
}
export function drawPlatform(c, b, sy, time, reduced = false) {
  const theme = platformThemeAtHeight(((b.baseY ?? b.y) - 60) / 10);
  c.save();
  if (b.broken) { c.globalAlpha = Math.max(0, 1 - (time - b.brokenAt) * 5); sy += (time - b.brokenAt) * 90; }
  if (b.type === 'horizontal' || b.type === 'vertical') {
    c.strokeStyle = theme.id === 'cave' || theme.id === 'space' ? '#e9eed82c' : '#36594d30'; c.lineWidth = 1; c.setLineDash([2, 7]); c.beginPath();
    if (b.type === 'horizontal') { c.moveTo(b.baseX - b.amplitude - b.width / 2, sy + 7); c.lineTo(b.baseX + b.amplitude + b.width / 2, sy + 7); }
    else { const base = sy + b.y - b.baseY; c.moveTo(b.x, base - b.amplitude); c.lineTo(b.x, base + b.amplitude + 14); }
    c.stroke(); c.setLineDash([]);
  }
  drawWorldPlatform(c, b, sy, theme);
  if (b.type === 'horizontal' || b.type === 'vertical') drawPlatformDirection(c, b.x, sy + 11, b.type === 'vertical');
  if (b.item && !b.broken) drawItem(c, b.item.type, b.x, sy - (b.item.type === 'spring' ? 0 : 26), reduced ? 0 : time, reduced ? 0 : Math.max(0, 1 - (time - b.springAt) * 6));
  else if (!b.broken && time - b.springAt < .25) {
    // Brief compression/rebound of the consumed spring, not a reusable item.
    c.globalAlpha *= Math.max(0, 1 - (time - b.springAt) * 4);
    drawItem(c, 'spring', b.x, sy, reduced ? 0 : time, reduced ? 0 : Math.max(0, 1 - (time - b.springAt) * 6));
  }
  c.restore();
}

function tint(a, b, amount) {
  const rgb = color => color.startsWith('#')
    ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
    : color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const aa = rgb(a), bb = rgb(b);
  return `rgb(${aa.map((n, i) => Math.round(n + (bb[i] - n) * amount)).join(',')})`;
}

function slabPath(c, w, depth) {
  // Rounded ends hang below the collision surface; nothing rises above sy.
  c.beginPath(); c.moveTo(4, 0); c.lineTo(w - 4, 0);
  c.quadraticCurveTo(w, 0, w, 4); c.lineTo(w, depth - 6);
  c.quadraticCurveTo(w, depth - 1, w - 7, depth);
  c.bezierCurveTo(w * .7, depth + .6, w * .28, depth + .6, 7, depth);
  c.quadraticCurveTo(0, depth - 1, 0, depth - 6); c.lineTo(0, 4);
  c.quadraticCurveTo(0, 0, 4, 0); c.closePath();
}

function softCap(c, w, color, light, thickness) {
  const cap = c.createLinearGradient(0, 0, 0, thickness + 2);
  cap.addColorStop(0, light); cap.addColorStop(1, color);
  c.fillStyle = cap;
  c.beginPath(); c.moveTo(4, 0); c.lineTo(w - 4, 0);
  c.quadraticCurveTo(w, 0, w, 4); c.lineTo(w, thickness - 1);
  c.bezierCurveTo(w * .87, thickness + 3, w * .8, thickness - 1, w * .68, thickness);
  c.bezierCurveTo(w * .49, thickness + 3, w * .44, thickness - 1, w * .3, thickness);
  c.bezierCurveTo(w * .19, thickness + 2, w * .12, thickness - 1, 0, thickness + 1);
  c.lineTo(0, 4); c.quadraticCurveTo(0, 0, 4, 0); c.closePath(); c.fill();
}

function drawWorldPlatform(c, b, sy, theme) {
  const w = b.width, seed = Math.abs(Number(b.id) || 0), depth = 18 + seed % 3;
  const moving = b.type === 'horizontal' || b.type === 'vertical';
  const fragile = b.type === 'fragile';
  let { top, side, shade } = theme;
  if (moving) {
    top = tint(top, '#dce4bc', .72); side = tint(side, '#a9b793', .76);
    shade = tint(shade, '#6d806b', .66);
  } else if (fragile) {
    top = tint(top, '#ede3c6', .8); side = tint(side, '#bcb18f', .8);
    shade = tint(shade, '#8f876f', .72);
  }
  c.save(); c.translate(b.x - w / 2, sy);
  // A small ambient shadow gives depth without a heavy ink outline.
  const ambient = c.createRadialGradient(w * .5, depth, 1, w * .5, depth, w * .5);
  ambient.addColorStop(0, '#203a3023'); ambient.addColorStop(1, '#203a3000');
  c.fillStyle = ambient; c.beginPath(); c.ellipse(w * .5, depth + 1.5, w * .54, 4, 0, 0, Math.PI * 2); c.fill();

  c.save(); slabPath(c, w, depth); c.clip();
  const stone = c.createLinearGradient(0, 0, 0, depth);
  stone.addColorStop(0, top); stone.addColorStop(.32, side); stone.addColorStop(.76, tint(side, shade, .3)); stone.addColorStop(1, shade);
  c.fillStyle = stone; c.fillRect(0, 0, w, depth + 1);
  const light = c.createLinearGradient(0, 0, w, depth);
  light.addColorStop(0, '#fffce932'); light.addColorStop(.55, '#fffce900'); light.addColorStop(1, '#263a3616');
  c.fillStyle = light; c.fillRect(0, 0, w, depth + 1);

  // Broad, low-contrast mineral patches stay legible at the actual phone scale.
  // Stable geometry avoids texture shimmer while platforms move.
  const count = Math.max(3, Math.round(w / 17));
  for (let i = 0; i < count; i++) {
    const x = i * w / count + 2, span = w / count;
    const y = 6 + ((seed + i * 7) % 4), lower = depth - 3 + (i % 2);
    c.fillStyle = tint(side, i % 2 ? top : shade, .085);
    c.beginPath(); c.moveTo(x + 2, y);
    c.quadraticCurveTo(x + span * .35, y - 1, x + span * .63, y + .4);
    c.lineTo(x + span - 1, y + 2); c.quadraticCurveTo(x + span + 1, y + 4, x + span - 2, lower - 1);
    c.lineTo(x + span * .42, lower + .4); c.lineTo(x + 1, lower - 1);
    c.quadraticCurveTo(x - 1, y + 4, x + 2, y); c.fill();
    c.strokeStyle = tint(side, shade, .34); c.lineWidth = .55;
    c.beginPath(); c.moveTo(x + span - 2, y + 1);
    c.quadraticCurveTo(x + span + 1, y + 4, x + span - 1, lower - 1); c.stroke();
    c.strokeStyle = tint(side, top, .4); c.lineWidth = .6;
    c.beginPath(); c.moveTo(x + 3, y + .4); c.quadraticCurveTo(x + span * .5, y - 1.5, x + span - 4, y + .3); c.stroke();
  }
  // Soft bevel, with the top of the stone at the exact landing height.
  softCap(c, w, tint(top, side, .4), tint(top, '#fffef1', .25), 4);
  c.strokeStyle = '#fffef168'; c.lineWidth = .8;
  c.beginPath(); c.moveTo(5, 1); c.quadraticCurveTo(w * .5, 1.8, w - 5, 1); c.stroke();

  if (!fragile && !moving && theme.cap === 'grass') {
    softCap(c, w, '#83945e', '#c0cd8b', 4.8);
    c.strokeStyle = '#d2daa077'; c.lineWidth = .9; c.lineCap = 'round';
    for (let i = 0; i < Math.floor(w / 10); i++) {
      const x = 5 + i * 10 + seed % 3;
      c.beginPath(); c.moveTo(x, 3.5); c.lineTo(x + 1, 1.5); c.moveTo(x + 1, 3.5); c.lineTo(x + 3, 2.4); c.stroke();
    }
  }
  if (!fragile && !moving && theme.cap === 'snow') {
    softCap(c, w, '#d9e5e7', '#fffff9', 6.6);
  }
  if (moving) {
    // Quiet inset surface keeps the direction glyph readable in every biome.
    const inset = c.createLinearGradient(0, 6, 0, 16);
    inset.addColorStop(0, '#e3e9c575'); inset.addColorStop(1, '#d6dfb42b');
    c.fillStyle = inset; c.beginPath(); c.roundRect(w * .5 - 13, 5, 26, 12, 5); c.fill();
  }
  if (theme.cap === 'ancient' && !moving && !fragile) {
    const x = w * .52, y = 12;
    const star = offset => {
      c.beginPath(); c.moveTo(x, y - 4 + offset); c.quadraticCurveTo(x + 1, y - 1 + offset, x + 4, y + offset);
      c.quadraticCurveTo(x + 1, y + 1 + offset, x, y + 4 + offset); c.quadraticCurveTo(x - 1, y + 1 + offset, x - 4, y + offset);
      c.quadraticCurveTo(x - 1, y - 1 + offset, x, y - 4 + offset); c.closePath();
    };
    c.lineWidth = .7; c.strokeStyle = tint(side, shade, .65); star(0); c.stroke();
    c.strokeStyle = tint(side, '#ede8d3', .45); star(.65); c.stroke();
  }
  if (fragile) {
    const crack = offset => {
      c.beginPath(); c.moveTo(w * .54 + offset, 0); c.lineTo(w * .49 + offset, 5);
      c.lineTo(w * .55 + offset, 10); c.lineTo(w * .47 + offset, 15); c.lineTo(w * .5 + offset, depth + 1);
      c.moveTo(w * .55 + offset, 10); c.lineTo(w * .62 + offset, 8);
    };
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#f8edcf'; c.lineWidth = 1.7; crack(.85); c.stroke();
    c.strokeStyle = '#6b6850'; c.lineWidth = 1.35; crack(0); c.stroke();
  }
  c.restore();

  if (!fragile && !moving && theme.cap === 'snow') {
    for (const [i, x] of [w * .18, w * .78].entries()) {
      const bottom = depth + 6 + ((seed + i) % 4);
      const ice = c.createLinearGradient(x - 2, 0, x + 3, 0);
      ice.addColorStop(0, '#c1d6dd'); ice.addColorStop(.5, '#e4f1f1'); ice.addColorStop(1, '#a9c4ce');
      c.fillStyle = ice; c.beginPath(); c.moveTo(x - 2, depth - 1); c.lineTo(x + 3, depth - 1);
      c.quadraticCurveTo(x + 1.5, bottom - 2, x, bottom); c.closePath(); c.fill();
    }
  }
  if (!fragile && !moving && theme.cap === 'cloud') {
    c.fillStyle = '#fcfdf1a6'; c.beginPath(); c.ellipse(w * .28, depth, w * .16, 3, 0, 0, Math.PI * 2);
    c.ellipse(w * .48, depth + 1, w * .14, 4, 0, 0, Math.PI * 2); c.ellipse(w * .68, depth, w * .15, 2.5, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
