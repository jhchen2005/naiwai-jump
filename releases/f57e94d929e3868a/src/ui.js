import { GAME_VERSION } from './version.js';
import { regionAtHeight, WORLD_REGIONS } from './world.js';
import { ResultAnimation } from './result-animation.js';
import { RESULT_ART } from './result-art.js';
import { AuthorSupport, supportHeart } from './support-dialog.js';
const version = `<p class="build-version">试玩版 ${GAME_VERSION} · 从矿洞到星河</p>`;
const resultIcons = {
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v2a4 4 0 0 0 4 4m7-6h3v2a4 4 0 0 1-4 4m-3 1v6m-4 1h8"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9a8 8 0 1 1-.1 6M5 4v5h5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/></svg>',
};
const modes = (selected, context) => `<div class="mode-options" role="group" aria-label="操控方式">
  <button class="mode-card ${selected === 'tilt' ? 'selected' : ''}" data-mode="tilt" data-context="${context}" aria-pressed="${selected === 'tilt'}"><span class="mode-symbol" aria-hidden="true">◩</span><span><strong>倾斜操控</strong><small>左右倾斜手机，控制奶娃移动。</small></span><span class="selection" aria-hidden="true">${selected === 'tilt' ? '✓' : ''}</span></button>
  <button class="mode-card ${selected === 'buttons' ? 'selected' : ''}" data-mode="buttons" data-context="${context}" aria-pressed="${selected === 'buttons'}"><span class="mode-symbol arrows" aria-hidden="true">↔</span><span><strong>按键操控</strong><small>手机按住左右按钮，电脑使用 A / D 或 ← / →。</small></span><span class="selection" aria-hidden="true">${selected === 'buttons' ? '✓' : ''}</span></button>
</div>`;
export class UI {
  constructor(root, actions, { hasHomepage = false, leaderboardAvailable = false } = {}) {
    this.hasHomepage = hasHomepage;
    this.homeLabel = hasHomepage ? '返回首页' : '返回入口';
    this.resultHomeLabel = hasHomepage ? '主页' : '返回入口';
    this.leaderboardAvailable = leaderboardAvailable;
    this.root = root; this.actions = actions; this.view = ''; this.message = ''; this.busy = false; this.abort = new AbortController();
    root.classList.add('naiwa'); root.tabIndex = 0;
    root.innerHTML = `<div class="game-frame">
      <header class="brand-bar"><span class="wordmark">奶娃Jump</span><span class="edition">向上，再向上</span></header>
      <div class="playfield"><canvas aria-label="奶娃跳跃游戏画面"></canvas>
        <div class="hud" hidden><div class="height"><span>当前高度</span><strong data-height>0<small>m</small></strong><span class="world-label" data-world-name role="status">幽光矿洞</span><span class="world-stops" aria-hidden="true">${WORLD_REGIONS.map(r => `<i data-world-stop="${r.id}"></i>`).join('')}</span><span class="difficulty-label" data-difficulty role="status">起步</span></div><button class="pause-button" data-action="pause" aria-label="暂停游戏">Ⅱ</button></div>
        <div class="hint" hidden role="status"></div>
        <div class="overlay" hidden><section class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"></section></div>
      </div>
      <footer class="control-bar"><button class="direction-button" data-direction="-1" aria-label="向左移动">←</button><div class="control-caption"><strong>自动起跳</strong><span>按住方向 · 松手减速</span></div><button class="direction-button" data-direction="1" aria-label="向右移动">→</button></footer>
      <div class="orientation-cover" hidden role="alert"><span aria-hidden="true">↻</span><h2>竖过来，继续跳</h2><p>游戏已暂停。请将手机转回竖屏，<br>再点击继续游戏。</p></div>
    </div>`;
    this.canvas = root.querySelector('canvas'); this.panel = root.querySelector('.panel'); this.overlay = root.querySelector('.overlay');
    this.support = new AuthorSupport(root);
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.resultPlayer = new ResultAnimation();
    // Small portraits travel with the UI and decode while the game is mounted.
    // Reusing these exact nodes avoids a new request/decode at the moment of loss.
    this.resultPortraits = Object.fromEntries(Object.entries(RESULT_ART).map(([kind, source]) => {
      const image = new Image();
      image.className = `result-character result-${kind}`;
      image.alt = ''; image.draggable = false; image.decoding = 'async';
      image.src = source;
      return [kind, image];
    }));
    this.resultPortraitsReady = Promise.all(Object.values(this.resultPortraits).map(image => image.decode().catch(() => {})));
    document.addEventListener('visibilitychange', () => document.hidden ? this.suspendResultMedia() : this.resumeResultMedia(), { signal: this.abort.signal });
    window.addEventListener('blur', () => this.suspendResultMedia(), { signal: this.abort.signal });
    window.addEventListener('focus', () => this.resumeResultMedia(), { signal: this.abort.signal });
    this.reducedMotion.addEventListener('change', () => this.reducedMotion.matches ? this.suspendResultMedia() : this.resumeResultMedia(), { signal: this.abort.signal });
    root.addEventListener('click', e => {
      const target = e.target.closest('button'); if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
      if (target.dataset.action === 'support') { if (this.view === 'over') this.support.open(); }
      else if (target.dataset.mode) actions.mode(target.dataset.mode, target.dataset.context);
      else if (target.dataset.action) actions[target.dataset.action]?.();
    }, { signal: this.abort.signal });
    root.addEventListener('input', e => { if (e.target.dataset.setting) actions.setting(e.target.dataset.setting, e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value)); }, { signal: this.abort.signal });
    root.addEventListener('keydown', e => {
      // The native modal owns focus, Tab and Escape while it is open.
      if (this.support.dialog.open) return;
      if (e.code === 'Escape' && !this.busy) { e.preventDefault(); if (this.view === 'pause') actions.resume(); else if (!this.view) actions.pause(); }
      if (e.key === 'Tab' && this.view && !this.overlay.hidden) {
        const nodes = [...this.panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(n => n.offsetParent !== null);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || !this.panel.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !this.panel.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    }, { signal: this.abort.signal });
  }
  show(view, preferences, result = null) {
    if (view === 'entry' && this.hasHomepage) view = 'loading';
    this.loadingError = false;
    this.support.close();
    this.stopResultMedia();
    this.resultMediaReady = Promise.resolve(false);
    const changed = this.view !== view; this.view = view; this.preferences = preferences; this.result = result;
    this.root.dataset.view = view || 'playing';
    this.overlay.hidden = !view || view === 'dying';
    this.panel.classList.toggle('result-panel', view === 'over');
    this.panel.dataset.result = view === 'over' ? result?.newRecord ? 'record' : 'regular' : '';
    this.root.querySelector('.hud').hidden = ['entry', 'loading', 'dying', 'over'].includes(view);
    this.root.querySelector('.pause-button').disabled = Boolean(view);
    this.root.querySelector('.control-bar').hidden = view === 'over' || view === 'loading';
    this.root.querySelector('.control-bar').dataset.mode = preferences.mode;
    this.root.querySelectorAll('[data-direction]').forEach(b => b.disabled = Boolean(view));
    this.root.querySelector('.control-caption').innerHTML = preferences.mode === 'tilt' ? '<strong>轻轻倾斜手机</strong><span>自动起跳 · 自由向上</span>' : '<strong>自动起跳</strong><span>按住方向 · 松手减速</span>';
    if (!view || view === 'dying') { if (changed) this.root.focus({ preventScroll: true }); return; }
    const message = `<div class="notice" role="status" hidden></div>`;
    if (view === 'loading') this.panel.innerHTML = `<h2 id="panel-title">正在准备跳跃</h2><p class="panel-intro" data-loading-progress role="status">正在加载角色和道具…</p>${message}<button class="primary" data-action="start" hidden>重新加载</button><button class="secondary full" data-action="home">返回首页</button>`;
    if (view === 'entry') this.panel.innerHTML = `<p class="panel-kicker">临时试玩入口</p><h1 id="panel-title">选择操控方式</h1><p class="panel-intro">奶娃会自己跳起来，你来决定方向。</p>${modes(preferences.mode, 'entry')}${message}<button class="primary" data-action="start">开始跳跃 <span aria-hidden="true">↗</span></button><p class="best-line">最高纪录 <strong>${preferences.best} m</strong></p>`;
    if (view === 'pause') this.panel.innerHTML = `<p class="panel-kicker">歇一小会儿</p><h2 id="panel-title">已暂停</h2>${modes(preferences.mode, 'pause')}
      <div class="tilt-settings" ${preferences.mode === 'tilt' ? '' : 'hidden'}><label class="setting-label" for="sensitivity">倾斜灵敏度 <output>${preferences.sensitivity.toFixed(1)}×</output></label><input id="sensitivity" data-setting="sensitivity" type="range" min="0.5" max="2" step="0.1" value="${preferences.sensitivity}"><button class="text-button" data-action="calibrate">以当前握姿重新校准</button></div>
      <div class="sound-settings"><label>音乐<input type="checkbox" data-setting="music" ${preferences.music ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label><label>音效<input type="checkbox" data-setting="sound" ${preferences.sound ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label></div>${message}
      <button class="primary" data-action="resume">继续游戏 <span aria-hidden="true">↗</span></button><div class="button-row"><button class="secondary" data-action="restart">重新开始</button><button class="secondary" data-action="home">${this.homeLabel}</button></div>`;
    if (view === 'over') this.panel.innerHTML = `<div class="result-hero">
      <div class="result-heading"><p class="panel-kicker">${result?.newRecord ? 'NEW RECORD' : 'GAME OVER'}</p><h2 id="panel-title">${result?.newRecord ? '<span>打破</span><span>纪录啦！</span>' : '<span>再跳</span><span>高一点！</span>'}</h2></div>
      <div class="result-portrait" aria-hidden="true">${result?.newRecord ? '<span class="result-spark">✳</span>' : ''}</div>
    </div>
    <div class="result-stats">
      <div class="result-score-heading"><p class="result-label">你的分数</p>${result?.newRecord ? '<span class="result-record"><span aria-hidden="true">✦</span> 新纪录</span>' : ''}</div>
      <div class="result-score">${result?.score ?? 0}<span>m</span></div>
      <p class="result-best"><span>你的最高分数</span><strong>${preferences.best} m</strong></p>
    </div>
    <button class="result-leaderboard" data-action="leaderboard" aria-disabled="${!this.leaderboardAvailable}"><span class="result-leaderboard-icon">${resultIcons.trophy}</span><span class="result-leaderboard-label">高手排行榜</span><span class="result-leaderboard-state">${this.leaderboardAvailable ? '查看排行 <span aria-hidden="true">↗</span>' : '敬请期待'}</span></button>
    ${message}<div class="result-actions"><button class="primary" data-action="restart">${resultIcons.replay}<span>重玩</span></button><button class="secondary" data-action="home">${resultIcons.home}<span>${this.resultHomeLabel}</span></button></div>
    <button class="result-support" type="button" data-action="support" aria-haspopup="dialog">${supportHeart}<span>打赏作者</span><span class="result-support-note">请喝杯咖啡</span></button>`;
    if (view === 'entry' || view === 'pause') this.panel.insertAdjacentHTML('beforeend', version);
    if (view === 'over') {
      const portrait = this.resultPortraits[result?.newRecord ? 'poster' : 'sad'];
      portrait.hidden = false;
      this.panel.querySelector('.result-portrait').append(portrait);
    }
    if (view === 'over' && result?.newRecord && !this.reducedMotion.matches && !document.hidden) {
      this.panel.querySelector('.result-portrait').append(this.resultPlayer.canvas);
      this.resultPlayer.reset();
      this.resultMediaActive = true;
      this.resumeResultMedia();
    }
    this.status(this.message, this.busy, this.error);
    if (changed) (this.panel.querySelector(view === 'over' ? '[data-action="restart"]' : `button[data-mode="${preferences.mode}"]`) || this.panel.querySelector('button'))?.focus({ preventScroll: true });
  }
  stopResultMedia() {
    this.resultMediaActive = false;
    this.mediaGeneration = (this.mediaGeneration || 0) + 1;
    this.resultPlayer.pause(); this.resultPlayer.canvas.hidden = true;
    const poster = this.panel.querySelector('.result-poster'); if (poster) poster.hidden = false;
  }
  suspendResultMedia() {
    this.mediaGeneration = (this.mediaGeneration || 0) + 1;
    this.resultPlayer.pause();
  }
  resumeResultMedia() {
    const canvas = this.resultPlayer.canvas;
    if (!this.resultMediaActive || this.view !== 'over' || this.reducedMotion.matches || document.hidden || !canvas.isConnected) return Promise.resolve(false);
    const generation = this.mediaGeneration;
    const loadingMessage = '正在准备庆祝动画…';
    if (!this.resultPlayer.images[0]) this.status(loadingMessage);
    return this.resultMediaReady = this.resultPlayer.resume().then(playing => {
      if (!playing || generation !== this.mediaGeneration) return false;
      canvas.hidden = false;
      const poster = this.panel.querySelector('.result-poster'); if (poster) poster.hidden = true;
      if (this.message === loadingMessage) this.status('');
      return true;
    }).catch(() => {
      if (generation === this.mediaGeneration) {
        this.stopResultMedia();
        if (this.message === loadingMessage) this.status('庆祝动画暂未加载，仍可继续重玩。');
      }
      return false;
    });
  }
  resultBuffering(buffering) {
    if (!this.resultMediaActive || this.view !== 'over') return;
    const message = '正在准备后续动作…';
    if (buffering) this.status(message);
    else if (this.message === message) this.status('');
  }
  status(message = '', busy = false, error = false) {
    this.message = message; this.busy = busy; this.error = error;
    const notice = this.panel.querySelector('.notice');
    if (notice) { notice.hidden = !message; notice.classList.toggle('error', error); notice.textContent = message;
      if (error && this.preferences?.mode === 'tilt') { const b = document.createElement('button'); b.className = 'text-button'; b.dataset.action = 'fallback'; b.textContent = '切换按键操控'; notice.append(b); }
    }
    this.panel.querySelectorAll('.primary,[data-action="calibrate"],[data-action="restart"]').forEach(b => b.disabled = busy);
  }
  loadingProgress(message) {
    if (this.view !== 'loading' || this.loadingError) return;
    this.panel.querySelector('[data-loading-progress]').textContent = message;
  }
  loadingFailed(message) {
    this.loadingError = true;
    this.status('', false, false);
    this.panel.querySelector('#panel-title').textContent = '加载未完成';
    this.panel.querySelector('[data-loading-progress]').textContent = message;
    this.panel.querySelector('[data-action="start"]').hidden = false;
    if (this.preferences.mode === 'tilt' && !this.panel.querySelector('[data-action="fallback"]')) {
      const fallback = document.createElement('button');
      fallback.className = 'secondary full'; fallback.dataset.action = 'fallback';
      fallback.textContent = '切换按键操控';
      this.panel.querySelector('[data-action="start"]').after(fallback);
    }
  }
  tick(game) {
    const height = this.root.querySelector('[data-height]');
    if (height.dataset.score !== String(game.score)) { height.dataset.score = String(game.score); height.innerHTML = `${game.score}<small>m</small>`; }
    const region = regionAtHeight(game.score), regionLabel = this.root.querySelector('[data-world-name]');
    if (this.root.dataset.world !== region.id) {
      this.root.dataset.world = region.id;
      this.root.style.setProperty('--world-accent', region.accent);
      regionLabel.textContent = region.name;
      regionLabel.setAttribute('aria-label', `当前区域：${region.name}`);
      const index = WORLD_REGIONS.indexOf(region);
      this.root.querySelectorAll('[data-world-stop]').forEach((stop, i) => { stop.classList.toggle('reached', i <= index); stop.classList.toggle('current', i === index); });
    }
    const difficulty = game.difficulty, label = this.root.querySelector('[data-difficulty]');
    if (label.dataset.stage !== String(difficulty.stage)) {
      label.dataset.stage = String(difficulty.stage);
      label.textContent = difficulty.name;
      label.setAttribute('aria-label', `当前难度：${difficulty.name}`);
    }
  }
  hint(text) { clearTimeout(this.hintTimer); const hint = this.root.querySelector('.hint'); hint.textContent = text; hint.hidden = false; this.hintTimer = setTimeout(() => { hint.hidden = true; }, 3600); }
  hideHint() { clearTimeout(this.hintTimer); this.root.querySelector('.hint').hidden = true; }
  landscape(value) { this.root.querySelector('.orientation-cover').hidden = !value; }
  destroy() { clearTimeout(this.hintTimer); this.stopResultMedia(); this.support.destroy(); this.abort.abort(); this.resultPlayer.destroy(); this.root.innerHTML = ''; this.root.classList.remove('naiwa'); delete this.root.dataset.world; delete this.root.dataset.view; this.root.style.removeProperty('--world-accent'); }
}
