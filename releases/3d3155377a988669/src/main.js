import { createNaiwaGame } from './api.js';
window.NaiwaGame = createNaiwaGame(document.querySelector('#naiwa-game'), {
  debug: new URLSearchParams(location.search).get('debug') === '1',
});
