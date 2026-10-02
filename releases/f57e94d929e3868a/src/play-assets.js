import { PLAY_DATA, PLAY_IMAGE } from './boot-assets.js';
import { assetGroup, readAssetImage } from './asset-loader.js';

let ready;
// The small first-play atlas travels inside the program. Once the start button
// works, character/prop rendering no longer needs another network round trip.
export function loadPlayAssets() {
  return ready ??= assetGroup('开局画面', async signal => ({
    ...PLAY_DATA, image: await readAssetImage(new URL(PLAY_IMAGE), signal, '开局画面'),
  })).catch(error => { ready = null; throw error; });
}
