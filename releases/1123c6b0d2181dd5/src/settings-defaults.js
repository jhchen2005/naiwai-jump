import { CONFIG } from './config-defaults.js';

// Public game values only. Credentials and revision history live outside src/.
export const DEFAULT_SETTINGS = {
  home: {
    title: '奶娃Jump', tagline: '向上，再向上。', startLabel: '开始跳跃',
    help: '奶娃会自动跳跃。电脑用 A / D 或左右方向键；手机按住左右按钮。',
    tiltEnabled: false,
  },
  player: Object.fromEntries(['gravity', 'jump', 'speed', 'response', 'brake'].map(key => [key, CONFIG.player[key]])),
  character: { height: 78 },
  difficulty: structuredClone(CONFIG.difficulty),
  items: structuredClone(CONFIG.items),
  world: [
    { name: '幽光矿洞', start: 0 }, { name: '青翠山林', start: 120 },
    { name: '群山之巅', start: 280 }, { name: '寂静雪山', start: 460 },
    { name: '天际云海', start: 680 }, { name: '远古星河', start: 900 },
  ],
};
