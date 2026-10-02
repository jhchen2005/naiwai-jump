import { Game } from './game.js';
import { Controls } from './controls.js';
import { Preferences } from './storage.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { CONFIG, clamp } from './config.js';
import { GAME_VERSION } from './version.js';
import { regionAtHeight } from './world.js';

/** Mount one independent game. Import its stylesheet separately. No homepage dependencies. */
export function createNaiwaGame(root, options = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError('需要一个挂载游戏的 HTMLElement');
  const preferences = new Preferences(); const audio = new Audio(preferences);
  let destroyed = false, result = null, resultPlaybackAllowed = false, requestId = 0, frameId = 0, lastTime = performance.now(), landscape = false;
  let resultWarmup;
  const abort = new AbortController();
  function notify(event) { root.dispatchEvent(new CustomEvent(`naiwa:${event.type}`, { detail: event, bubbles: true })); options.onEvent?.(event); }
  const game = new Game({ onEvent(event) {
    if (event.type === 'fall-start' || event.type === 'gameover') audio.silence();
    if (event.type === 'gameover') {
      result = { score: event.score, newRecord: preferences.record(event.score) };
      if (!result.newRecord) audio.effect('gameover', game.score, event);
    } else audio.effect(event.type, game.score, event);
    if (event.type === 'state') {
      resultPlaybackAllowed = event.state === 'over';
      controls.setActive(event.state === 'running');
      if (event.state !== 'running') { if (event.state !== 'over') audio.silence(); ui.hideHint(); }
      ui.status('');
      ui.show(event.state === 'paused' ? 'pause' : event.state === 'over' ? 'over' : event.state === 'dying' ? 'dying' : '', preferences.get(), result);
      if (event.state === 'over' && result?.newRecord) resumeResultSound();
      if (event.reason === 'sensor') ui.status('传感器数据已中断，请重新校准，或切换按键操控。', false, true);
      if (event.reason === 'background') ui.status('页面离开前已暂停，准备好后再继续。');
    }
    if (['bounce', 'break', 'spring', 'pickup'].includes(event.type)) renderer.burst(event.type, event.x, event.y);
    notify(event);
  } });
  // Game's constructor uses a muted reset; all events below run after the UI is mounted.
  const ui = new UI(root, {
    start: () => api.start().catch(() => {}), pause: () => api.pause(), resume: () => api.resume().catch(() => {}),
    restart: () => api.restart().catch(() => {}), home: () => api.returnToStart(),
    leaderboard: () => api.openLeaderboard(),
    fallback: () => api.setControlMode('buttons').catch(() => {}),
    calibrate: () => api.calibrate().catch(() => {}),
    mode: (mode, context) => {
      if (context === 'entry') { requestId++; controls.setMode(mode); game.player.vx = 0; ui.status(''); ui.show('entry', preferences.get()); notify({ type: 'controlmode', mode }); }
      else api.setControlMode(mode).catch(() => {});
    },
    setting: (key, value) => api.setSettings({ [key]: value }),
  }, { hasHomepage: typeof options.onReturnToStart === 'function', leaderboardAvailable: typeof options.onOpenLeaderboard === 'function' });
  const renderer = options.rendererFactory ? options.rendererFactory(ui.canvas) : new Renderer(ui.canvas);
  audio.onResultPlayback = playback => ui.resultPlayer.setClock(playback ? () => playback.currentTime : null);
  game.reducedMotion = renderer.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const controls = new Controls(root, preferences);
  game.height = renderer.resize();
  function blocked() { return destroyed || landscape || document.hidden; }
  function resumeResultSound() {
    const id = requestId;
    if (blocked() || !resultPlaybackAllowed || game.state !== 'over' || !result?.newRecord || !preferences.data.sound) return;
    Promise.all([audio.unlock().then(() => audio.prepareRecord()), ui.resultMediaReady]).then(([, playing]) => {
      if (playing && !ui.resultPlayer.paused && !ui.resultPlayer.canvas.hidden && id === requestId && !blocked() && resultPlaybackAllowed && game.state === 'over' && result?.newRecord && preferences.data.sound) {
        audio.effect('record', game.score, { resume: true, offset: ui.resultPlayer.currentTime });
      }
    });
  }
  async function prepare(force = false) {
    const audioReady = Promise.all([audio.unlock(), audio.prepare()]);
    controls.clear(); game.player.vx = 0;
    if (controls.mode !== 'tilt' || (!force && !controls.stale)) { await audioReady; return; }
    ui.status('请以舒适角度竖握手机并保持稳定，正在授权与校准…', true);
    await controls.prepareTilt();
    await audioReady;
    ui.status('校准完成。轻轻左右倾斜即可移动。');
  }
  function hint() {
    const key = controls.mode === 'tilt' ? 'tilt' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    if (!preferences.data.hints[key]) {
      ui.hint({ tilt: '左右倾斜手机控制方向。', touch: '按住左右按钮控制方向。', keyboard: '使用 A / D 或 ← / → 控制方向。' }[key]);
      preferences.set({ hints: { ...preferences.data.hints, [key]: true } });
    }
  }
  async function guarded(fn, force = false) {
    const id = ++requestId;
    try { await prepare(force); await renderer.prepare?.(); if (id !== requestId || destroyed) return false; if (blocked()) { ui.status('请回到当前页面，并以竖屏继续。'); return false; } fn(); return true; }
    catch (error) { if (id === requestId && !destroyed) ui.status(error.message, false, true); throw error; }
  }
  const api = {
    async start({ mode, seed } = {}) {
      if (destroyed) throw new Error('游戏实例已销毁');
      resultPlaybackAllowed = false;
      audio.silence();
      if (game.state === 'running' || game.state === 'dying') game.pause();
      if (mode) controls.setMode(mode);
      ui.show(ui.view || 'entry', preferences.get(), result);
      ui.stopResultMedia();
      clearTimeout(resultWarmup);
      return guarded(() => {
        result = null; renderer.particles.length = 0; game.reset(seed); hint();
        // Only after gameplay has started: celebration downloads neither block
        // the homepage nor the first jump, and are usually ready before results.
        resultWarmup = setTimeout(() => {
          if (!destroyed && game.state !== 'idle' && !ui.reducedMotion.matches) ui.resultPlayer.prepare({ priority: 'low' }).catch(() => {});
        }, 1500);
      }, true);
    },
    pause(reason = 'manual') { requestId++; controls.clear(); game.pause(reason); audio.silence(); },
    async resume() { if (game.state !== 'paused') return false; return guarded(() => { game.resume(); if (game.state === 'running') hint(); }); },
    async restart() { return api.start(); },
    async setControlMode(mode) {
      api.pause(); requestId++; controls.setMode(mode); game.player.vx = 0; ui.status(''); ui.show(ui.view || 'entry', preferences.get(), result);
      notify({ type: 'controlmode', mode });
      if (mode === 'tilt') return guarded(() => {}, true);
      return true;
    },
    async calibrate() { api.pause(); if (controls.mode !== 'tilt') return false; return guarded(() => {}, true); },
    setSettings(patch) {
      const clean = {};
      if (Number.isFinite(patch.sensitivity)) clean.sensitivity = clamp(patch.sensitivity, .5, 2);
      for (const key of ['music', 'sound']) if (typeof patch[key] === 'boolean') clean[key] = patch[key];
      preferences.set(clean); audio.unlock();
      if (patch.sound === false || patch.music === false) audio.silence();
      if (patch.sound === true || patch.music === false) resumeResultSound();
      const output = ui.panel.querySelector('output'); if (output) output.textContent = `${preferences.data.sensitivity.toFixed(1)}×`;
      notify({ type: 'settings', settings: preferences.get() }); return preferences.get();
    },
    getSettings: () => preferences.get(), getBestRecord: () => preferences.data.best,
    openLeaderboard() {
      if (destroyed || game.state !== 'over' || typeof options.onOpenLeaderboard !== 'function') return false;
      const detail = { type: 'leaderboard', score: result?.score ?? game.score, best: preferences.data.best };
      notify(detail); options.onOpenLeaderboard(detail); return true;
    },
    getState: () => ({ ...game.snapshot(), world: { id: regionAtHeight(game.score).id, name: regionAtHeight(game.score).name }, mode: controls.mode, storageAvailable: preferences.available, version: GAME_VERSION }),
    returnToStart() { clearTimeout(resultWarmup); requestId++; controls.generation++; controls.clear(); controls.setActive(false); audio.silence(); game.state = 'idle'; renderer.particles.length = 0; ui.hideHint(); ui.status(''); ui.show('entry', preferences.get()); notify({ type: 'return' }); options.onReturnToStart?.(); },
    destroy() { if (destroyed) return; destroyed = true; clearTimeout(resultWarmup); requestId++; cancelAnimationFrame(frameId); observer.disconnect(); abort.abort(); controls.destroy(); audio.destroy(); ui.destroy(); },
  };
  function updateSize() {
    if (destroyed) return;
    landscape = matchMedia('(pointer: coarse)').matches && innerWidth > innerHeight;
    if (landscape) api.pause('orientation');
    ui.landscape(landscape); game.height = renderer.resize();
  }
  const observer = new ResizeObserver(updateSize); observer.observe(ui.canvas);
  window.addEventListener('resize', updateSize, { signal: abort.signal });
  window.addEventListener('blur', () => api.pause('background'), { signal: abort.signal });
  window.addEventListener('focus', resumeResultSound, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause('background'); else resumeResultSound(); }, { signal: abort.signal });
  window.addEventListener('pagehide', () => api.pause('background'), { signal: abort.signal });
  function frame(now) {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000, CONFIG.maxFrame); lastTime = now;
    if (game.state === 'running' && controls.mode === 'tilt' && controls.stale) api.pause('sensor');
    if (!(game.state === 'idle' && typeof options.onReturnToStart === 'function')) {
      game.advance(dt, controls.value(dt)); renderer.render(game, dt); ui.tick(game); audio.update(dt, game.state === 'running');
    }
    frameId = requestAnimationFrame(frame);
  }
  ui.show('entry', preferences.get()); updateSize(); frameId = requestAnimationFrame(frame);
  // Only explicitly enabled test builds expose mutable internals.
  if (options.debug === true) api.debug = { game, controls, renderer, preferences, ui, audio };
  notify({ type: 'ready', apiVersion: 1 });
  return api;
}
