import { clamp } from './config.js';
const KEY = 'naiwa-jump.v1';
export const DEFAULTS = { mode: 'buttons', sensitivity: 1, music: false, sound: true, best: 0, hints: {} };
export class Preferences {
  constructor(storage) {
    this.available = true;
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.available = false; }
    let data = {};
    try { data = JSON.parse(this.storage?.getItem(KEY) || '{}') || {}; } catch { this.available = false; }
    this.data = { ...DEFAULTS, mode: data.mode === 'tilt' ? 'tilt' : 'buttons', sensitivity: clamp(Number(data.sensitivity) || 1, .5, 2), music: data.music === true, sound: data.sound !== false, best: Math.max(0, Math.floor(Number(data.best) || 0)), hints: data.hints && typeof data.hints === 'object' ? data.hints : {} };
  }
  set(patch) { Object.assign(this.data, patch); try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { this.available = false; } return this.get(); }
  get() { return { ...this.data, hints: { ...this.data.hints } }; }
  record(height) { const newRecord = height > this.data.best; if (newRecord) this.set({ best: height }); return newRecord; }
}
