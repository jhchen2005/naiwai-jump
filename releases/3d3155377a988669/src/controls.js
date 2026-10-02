import { CONFIG as C, clamp } from './config.js';
export class Controls {
  constructor(root, preferences) {
    this.root = root; this.preferences = preferences; this.mode = preferences.data.mode;
    this.keys = new Set(); this.pointers = new Map(); this.contacts = new Map(); this.active = false;
    this.raw = 0; this.baseline = 0; this.filtered = 0; this.lastSample = -Infinity;
    this.calibrated = false; this.samples = []; this.generation = 0;
    this.abort = new AbortController(); const opts = { signal: this.abort.signal };
    const directions = new Map([['ArrowLeft', -1], ['KeyA', -1], ['ArrowRight', 1], ['KeyD', 1]]);
    window.addEventListener('keydown', e => {
      if (!this.active || this.mode !== 'buttons' || !root.contains(document.activeElement) || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (directions.has(e.code)) { e.preventDefault(); this.keys.add(e.code); }
    }, opts);
    window.addEventListener('keyup', e => { this.keys.delete(e.code); }, opts);
    for (const button of root.querySelectorAll('[data-direction]')) {
      button.addEventListener('pointerdown', e => {
        if (!this.active || this.mode !== 'buttons' || button.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault(); root.focus({ preventScroll: true });
        const contact = { direction: Number(button.dataset.direction), button };
        this.contacts.set(e.pointerId, contact); this.pointers.set(e.pointerId, contact); this.paint();
        // Input starts immediately, even if this browser cannot capture this pointer.
        try { button.setPointerCapture(e.pointerId); } catch { /* Window listeners still release it. */ }
      }, opts);
      button.addEventListener('contextmenu', e => e.preventDefault(), opts);
    }
    window.addEventListener('pointermove', e => {
      const contact = this.contacts.get(e.pointerId);
      if (!contact) return;
      const r = contact.button.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      // Sliding out releases input, but the same held finger can slide back in.
      // Keep capture until lift/cancel so a small slip does not require a new tap.
      if (inside === this.pointers.has(e.pointerId)) return;
      if (inside) this.pointers.set(e.pointerId, contact); else this.pointers.delete(e.pointerId);
      this.paint();
    }, opts);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, e => this.release(e.pointerId), opts);
    window.addEventListener('blur', () => this.clear(), opts);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, opts);
    this.orientationHandler = e => {
      if (typeof e.gamma !== 'number' || !Number.isFinite(e.gamma) || typeof e.beta !== 'number' || !Number.isFinite(e.beta)) return;
      const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
      this.raw = e.gamma * Math.cos(angle) + e.beta * Math.sin(angle);
      const now = performance.now(); this.lastSample = now;
      this.samples.push({ value: this.raw, time: now });
      this.samples = this.samples.filter(s => s.time >= now - C.tilt.calibrationTime);
    };
  }
  release(id) {
    const p = this.contacts.get(id); if (!p) return;
    this.contacts.delete(id); this.pointers.delete(id);
    if (p.button.hasPointerCapture(id)) p.button.releasePointerCapture(id);
    this.paint();
  }
  paint() { for (const b of this.root.querySelectorAll('[data-direction]')) b.classList.toggle('held', [...this.pointers.values()].some(p => p.button === b)); }
  clear() { this.keys.clear(); for (const id of [...this.contacts.keys()]) this.release(id); this.filtered = 0; }
  setMode(mode) { if (!['tilt', 'buttons'].includes(mode)) throw new Error('未知操控模式'); this.generation++; this.clear(); this.mode = mode; this.preferences.set({ mode }); }
  setActive(active) { this.active = active; if (!active) this.clear(); }
  get stale() { return !this.calibrated || performance.now() - this.lastSample > C.tilt.staleAfter; }
  async prepareTilt() {
    const token = ++this.generation; this.calibrated = false; this.clear();
    if (!window.isSecureContext) throw new Error('当前连接不安全，运动传感器需要 HTTPS。也可先使用按键操控。');
    if (!window.DeviceOrientationEvent) throw new Error('当前设备或浏览器不支持方向传感器。');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      let permission;
      try { permission = await DeviceOrientationEvent.requestPermission(); } catch { throw new Error('未能申请运动权限，请在浏览器中允许“运动与方向”访问。'); }
      if (permission !== 'granted') throw new Error('运动传感器权限被拒绝。请修改浏览器权限，或切换按键操控。');
    }
    if (token !== this.generation) throw new Error('校准已取消。');
    window.removeEventListener('deviceorientation', this.orientationHandler);
    window.addEventListener('deviceorientation', this.orientationHandler, { signal: this.abort.signal });
    this.samples = []; const start = performance.now();
    await new Promise((resolve, reject) => {
      const poll = () => {
        if (token !== this.generation) return reject(new Error('校准已取消。'));
        const now = performance.now();
        const fresh = this.samples.filter(s => now - s.time < C.tilt.calibrationTime);
        if (fresh.length >= 5 && fresh.at(-1).time - fresh[0].time >= C.tilt.calibrationTime * .65 && now - this.lastSample < 250) {
          const values = fresh.map(s => s.value);
          if (Math.max(...values) - Math.min(...values) < 9) {
            this.baseline = values.reduce((a, b) => a + b, 0) / values.length; this.calibrated = true; this.filtered = 0; return resolve();
          }
        }
        if (now - start > C.tilt.timeout) return reject(new Error(this.samples.length ? '校准未完成，请以舒适角度竖握手机并保持稳定，再试一次。' : '未收到有效的传感器数据。请检查设备支持与浏览器权限，或切换按键操控。'));
        setTimeout(poll, 40);
      }; poll();
    });
  }
  value(dt) {
    if (!this.active) return 0;
    if (this.mode === 'buttons') {
      const values = [...this.pointers.values()].map(p => p.direction);
      const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || values.includes(-1);
      const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || values.includes(1);
      return Number(right) - Number(left);
    }
    if (this.stale) return 0;
    const delta = this.raw - this.baseline;
    const target = Math.sign(delta) * clamp((Math.abs(delta) - C.tilt.deadzone) / (C.tilt.fullAngle - C.tilt.deadzone) * this.preferences.data.sensitivity, 0, 1);
    this.filtered += (target - this.filtered) * (1 - Math.exp(-C.tilt.smoothing * dt));
    return this.filtered;
  }
  destroy() { this.generation++; this.clear(); this.abort.abort(); }
}
