import { createNaiwaGame } from './api.js';
import { Preferences } from './storage.js';
import { SETTINGS } from './runtime-settings.js';
import { loadCharacter } from './character.js';
import { loadPropArt } from './prop-art.js';

// Reference video: 5 seconds at 24 fps. Type assembles first, then the faces
// react. Bodies stay fixed; pupils, eyelids and the final tongue gesture animate.
const OUT = 'cubic-bezier(.23,1,.32,1)';
const IN_OUT = 'cubic-bezier(.77,0,.175,1)';
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('is-capture');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const home = document.querySelector('#home');
const shell = document.querySelector('#game-shell');
const host = document.querySelector('#game-host');
const start = document.querySelector('#start-jump');
const status = document.querySelector('#home-status');
const sound = document.querySelector('#sound-toggle');
document.title = SETTINGS.home.title;
document.querySelector('#start-jump > span').textContent = SETTINGS.home.startLabel;
document.querySelector('#home-help').textContent = SETTINGS.home.help;
document.querySelector('h1').textContent = SETTINGS.home.title;
const tiltInput = document.querySelector('input[name="home-mode"][value="tilt"]');
tiltInput.disabled = !SETTINGS.home.tiltEnabled;
tiltInput.closest('label').hidden = !SETTINGS.home.tiltEnabled;
document.body.classList.toggle('tilt-enabled', SETTINGS.home.tiltEnabled);
let preferences = new Preferences();
let game = null;
let starting = false;
let animations = [];
let motionPaused = false;
let artworkReady = false;

function refreshSettings() {
  preferences = new Preferences();
  const { best, mode, sound: enabled } = preferences.get();
  document.querySelector('#home-record').textContent = best > 0 ? `最高纪录 ${best} m` : SETTINGS.home.tagline;
  // Saved tilt preferences must not select a temporarily unavailable entry.
  const modeInput = document.querySelector(`input[name="home-mode"][value="${mode}"]:not(:disabled)`)
    || document.querySelector('input[name="home-mode"][value="buttons"]');
  modeInput.checked = true;
  sound.setAttribute('aria-pressed', String(enabled));
  sound.textContent = enabled ? '声音开' : '声音关';
}
refreshSettings();

function track(element, frames, options = {}) {
  if (!element) return;
  const animation = element.animate(frames, { duration: 5000, fill: 'both', ...options });
  animation.pause();
  animations.push(animation);
}
function faceTrack(element, points, transform, options = {}) {
  track(element, points.map(([milliseconds, ...values]) => ({
    offset: milliseconds / 5000,
    transform: transform(...values),
    easing: IN_OUT,
  })), { duration: 5000, iterations: Infinity, easing: 'linear', ...options });
  if (element.classList.contains('eye-lid')) {
    const crease = element.closest('.mascot-eye').querySelector('.eye-crease');
    track(crease, points.map(([milliseconds, amount]) => ({
      offset: milliseconds / 5000, opacity: amount > .9 ? 1 : 0, easing: IN_OUT,
    })), { duration: 5000, iterations: Infinity, easing: 'linear' });
  }
}
function createExpressions() {
  document.querySelectorAll('.mascot-eye').forEach(eye => {
    const character = eye.closest('[data-character]').dataset.character;
    const ry = Number(eye.dataset.ry);
    const range = Number(eye.dataset.pupilRange);
    const pupil = eye.querySelector('.eye-pupil');
    const lid = eye.querySelector('.eye-lid');
    const pupilTransform = (x, y) => `translate(${x * range}px, ${y * range}px)`;
    const lidTransform = amount => `translateY(${amount * (ry + 1)}px)`;
    if (character === 'left') {
      // Wide-eyed curiosity: watch the type, blink at 1.8 s, glance back.
      faceTrack(pupil, [
        [0, -.22, 0], [550, -.22, 0], [850, .42, -.12],
        [1060, .42, -.12], [1280, -.5, 0], [1610, -.5, 0],
        [2050, .1, -.16], [3020, .1, -.16], [3280, -.4, .1],
        [3830, -.3, .22], [4470, -.3, .22], [4800, -.22, 0], [5000, -.22, 0],
      ], pupilTransform);
      faceTrack(lid, [
        [0, -1.1], [1730, -1.1], [1800, 1.06], [1840, 1.06],
        [1980, -1.1], [3600, -1.1], [3690, 1.06], [3720, 1.06],
        [3820, -1.1], [5000, -1.1],
      ], lidTransform);
    } else if (character === 'center') {
      // Look left, then right, and settle on the viewer. Correct each pupil's
      // authored offset so the last look is centered, then hold it until replay.
      const pupilShape = pupil.querySelector('ellipse');
      const viewerX = -Number(pupilShape.getAttribute('cx')) / range;
      const viewerY = -Number(pupilShape.getAttribute('cy')) / range;
      faceTrack(pupil, [
        [0, -1.1, 0], [1450, -1.1, 0], [2050, 1.1, 0],
        [2720, 1.1, 0], [3350, viewerX, viewerY], [5000, viewerX, viewerY],
      ], pupilTransform, { iterations: 1 });
      faceTrack(lid, [
        [0, -1.1], [5000, -1.1],
      ], lidTransform);
    } else {
      // The three-quarter face looks ahead, steals a glance at the viewer,
      // then looks ahead again. The far pupil has less room in its narrow eye.
      const near = eye.dataset.eye === 'right-near';
      const aheadX = (near ? 3.6 : .8) / range;
      const peekX = (near ? -5.2 : -3.2) / range;
      const peekY = (near ? -1.6 : -.7) / range;
      faceTrack(pupil, [
        [0, aheadX, 0], [1850, aheadX, 0], [2260, peekX, peekY],
        [2810, peekX, peekY], [3550, aheadX, 0], [5000, aheadX, 0],
      ], pupilTransform);
      faceTrack(lid, [
        [0, -1.1], [2470, -1.1], [2560, 1.06], [2620, 1.06],
        [2780, -1.1], [3090, -1.1], [3180, 1.06], [3260, 1.06],
        [3420, -1.1], [5000, -1.1],
      ], lidTransform);
    }
  });
  // The closing joke happens once and stays visible; the eyes can keep looping.
  // Replay rebuilds these tracks, returning the mouth to its original expression.
  track(document.querySelector('.mouth-expression'), [
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: .70, easing: OUT },
    { opacity: 1, offset: .72 },
    { opacity: 1, offset: 1 },
  ], { duration: 5000, easing: 'linear' });
  track(document.querySelector('.tongue-motion'), [
    { transform: 'translateY(-55px)', offset: 0 },
    { transform: 'translateY(-55px)', offset: .70, easing: OUT },
    { transform: 'translateY(0)', offset: .76 },
    { transform: 'translateY(0)', offset: 1 },
  ], { duration: 5000, easing: 'linear' });
}
function createMotion() {
  animations.forEach(animation => animation.cancel());
  animations = [];
  if (reduced.matches && !capture) return;
  const letters = [...document.querySelectorAll('.title-letter')];
  letters.forEach((letter, i) => {
    const chinese = i < 2;
    const frames = chinese ? [
      { transform: 'translate(650px, 0)', opacity: 1, offset: 0, easing: OUT },
      { transform: 'translate(-11px, 0)', opacity: 1, offset: .73, easing: IN_OUT },
      { transform: 'translate(0, 0)', opacity: 1, offset: 1 },
    ] : [
      { transform: 'translate(0, 290px)', opacity: 1, offset: 0, easing: OUT },
      { transform: 'translate(0, -19px)', opacity: 1, offset: .65, easing: IN_OUT },
      { transform: 'translate(0, 0)', opacity: 1, offset: 1 },
    ];
    track(letter, frames, {
      delay: chinese ? 250 + i * 140 : 480 + (i - 2) * 90,
      duration: chinese ? 750 : 670, easing: 'linear',
    });
  });
  document.querySelectorAll('.sticker-wrap').forEach((element, i) => {
    track(element, [
      { transform: `translate(${i ? 95 : 0}px, ${i ? 35 : -22}px) rotate(${i ? 24 : -20}deg) scale(.95)`, opacity: 0, offset: 0, easing: OUT },
      { opacity: 1, offset: .12, easing: OUT },
      { transform: `translate(0, ${i ? -6 : 4}px) rotate(${i ? -6 : 6}deg) scale(1)`, opacity: 1, offset: .66, easing: IN_OUT },
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 1 },
    ], { delay: i ? 1170 : 640, duration: i ? 550 : 560, easing: 'linear' });
  });
  track(document.querySelector('.direction-mark'), [{ opacity: 0 }, { opacity: 1 }], { delay: 750, duration: 500, easing: OUT });
  createExpressions();
  animations.forEach(animation => { animation.currentTime = 0; });
  if (!capture && !motionPaused) playMotion();
}
function playMotion() {
  if (capture || reduced.matches || !artworkReady || document.hidden || home.hidden || motionPaused) return;
  animations.forEach(animation => animation.play());
}
function pauseMotion() { animations.forEach(animation => animation.pause()); }

// Deterministic seeking drives both QA screenshots and the exact 60 fps export.
window.homeMotion = {
  ready: false,
  duration: 5000,
  seek(milliseconds) {
    pauseMotion();
    animations.forEach(animation => { animation.currentTime = Math.max(0, milliseconds); });
  },
  replay() { motionPaused = false; createMotion(); },
  pause() { motionPaused = true; pauseMotion(); },
  play() { motionPaused = false; playMotion(); },
  getAnimations: () => animations.map(animation => ({ state: animation.playState, time: animation.currentTime })),
};

// Body images are native inline-SVG resources, discovered before any JS executes.
// Decoding verifies readiness; it does not create three large base64 copies.
function decodeCharacter(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ''; reject(new Error('角色图片加载超时。')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('角色图片加载失败。')); };
    image.src = url;
  });
}
let artworkLoading = null;
async function loadCharacters() {
  if (artworkLoading) return artworkLoading;
  const errorBox = document.querySelector('#art-error');
  errorBox.hidden = true;
  artworkLoading = (async () => {
    const results = await Promise.allSettled([...document.querySelectorAll('.mascot-slot')].map(async slot => {
      if (slot.dataset.artReady === 'true') return;
      const element = slot.querySelector('image');
      const original = element.dataset.source || element.getAttribute('href');
      element.dataset.source = original;
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        const url = new URL(original, document.baseURI);
        if (attempt || slot.dataset.artFailed) url.searchParams.set('retry', String(Date.now()));
        try {
          await decodeCharacter(url.href);
          element.setAttribute('href', url.href);
          slot.dataset.artReady = 'true'; slot.style.visibility = ''; delete slot.dataset.artFailed;
          return;
        } catch (error) { lastError = error; }
      }
      slot.dataset.artFailed = 'true'; slot.style.visibility = 'hidden'; throw lastError;
    }));
    errorBox.hidden = results.every(result => result.status === 'fulfilled');
    // Healthy characters remain visible even if one download needs a retry.
    artworkReady = true;
    createMotion(); window.homeMotion.ready = true;
  })().finally(() => { artworkLoading = null; });
  return artworkLoading;
}
loadCharacters().then(() => {
  // Once the three homepage portraits are visible, use idle time to prepare the
  // small mandatory game assets. Starting the game reuses these same promises.
  if (capture) return;
  const warm = () => { if (!home.hidden) Promise.allSettled([loadCharacter({ full: false }), loadPropArt()]); };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1200 });
  else setTimeout(warm, 300);
});
document.querySelector('#retry-art').addEventListener('click', loadCharacters);
document.querySelector('#replay').addEventListener('click', () => window.homeMotion.replay());
document.querySelector('#how-to').addEventListener('click', event => {
  const help = document.querySelector('#home-help');
  help.hidden = !help.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!help.hidden));
});
sound.addEventListener('click', () => {
  const enabled = !preferences.get().sound;
  preferences.set({ sound: enabled });
  sound.setAttribute('aria-pressed', String(enabled));
  sound.textContent = enabled ? '声音开' : '声音关';
});
document.querySelectorAll('input[name="home-mode"]').forEach(input => input.addEventListener('change', () => {
  preferences.set({ mode: input.value });
  status.textContent = '';
}));

function showHome() {
  game?.destroy(); game = null;
  starting = false;
  shell.hidden = true; host.hidden = true; home.hidden = false;
  start.disabled = false;
  refreshSettings();
  playMotion();
  start.focus({ preventScroll: true });
}
start.addEventListener('click', async () => {
  if (starting || capture) return;
  starting = true; start.disabled = true; status.textContent = '';
  const mode = document.querySelector('input[name="home-mode"]:checked').value;
  // Mount synchronously inside the click. Do not await an exit animation before
  // start(): sensor permission must retain the original user activation.
  home.hidden = true; shell.hidden = false; host.hidden = false;
  pauseMotion();
  game = createNaiwaGame(host, { debug: params.get('debug') === '1', onReturnToStart: showHome });
  const activeGame = game;
  try {
    const started = await activeGame.start({ mode });
    if (game !== activeGame) return;
    if (!started) {
      activeGame.returnToStart();
      status.textContent = '请回到当前页面，并以竖屏开始。';
    } else host.focus({ preventScroll: true });
  } catch (error) {
    if (game !== activeGame) return;
    // Keep the recoverable loading screen and its retry button visible.
    // Returning home remains available; do not silently bounce the player back.
  } finally {
    if (game === activeGame || !game) { starting = false; start.disabled = false; }
  }
});
document.querySelector('#game-back').addEventListener('click', () => game?.returnToStart());
document.addEventListener('visibilitychange', () => document.hidden ? pauseMotion() : playMotion());
reduced.addEventListener('change', () => { if (artworkReady) createMotion(); });
window.addEventListener('pagehide', pauseMotion);
window.addEventListener('pageshow', playMotion);
window.NaiwaHome = { getState: () => game?.getState() ?? { state: 'home' }, returnToStart: () => game?.returnToStart() };
