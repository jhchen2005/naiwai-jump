// Platform pickups rendered directly from the user's three approved prop models.
// Internal item IDs stay stable so rendering never changes gameplay rules.
const assetRoot = new URL('../assets/props/enlarged-v2/', import.meta.url);
export const PROP_VISUAL_SCALE = 1.6;
const models = { spring: 'pogo', hat: 'broom', rocket: 'jetpack' };
let assetsPromise;
let assets;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('道具图片加载失败，请重新点击开始重试。'));
    image.src = new URL(file, assetRoot).href;
  });
}

export function loadPropArt() {
  if (!assetsPromise) {
    assetsPromise = fetch(new URL('icons.json', assetRoot))
      .then(response => {
        if (!response.ok) throw new Error('道具资源加载失败，请重新点击开始重试。');
        return response.json();
      })
      .then(async data => {
        const entries = await Promise.all(Object.values(models).map(async slug => {
          const icon = data.icons?.[slug];
          if (!icon || typeof icon.file !== 'string' || !Array.isArray(icon.bounds) || icon.bounds.length !== 4 || !icon.bounds.every(Number.isFinite)) {
            throw new Error('道具资源清单不完整，请刷新后重试。');
          }
          const image = await readImage(icon.file);
          const [left, top, right, bottom] = icon.bounds;
          if (left < 0 || top < 0 || right < left || bottom < top || right >= image.naturalWidth || bottom >= image.naturalHeight) {
            throw new Error('道具图片范围无效，请刷新后重试。');
          }
          return [slug, { image, x: left, y: top, width: right - left + 1, height: bottom - top + 1 }];
        }));
        assets = Object.fromEntries(entries);
        return assets;
      })
      .catch(error => {
        assetsPromise = null;
        throw error;
      });
  }
  return assetsPromise;
}

/** x/y is the spring's ground contact, or the center of a floating pickup. */
export function drawProp(ctx, type, x, y, time = 0, compressed = 0) {
  const icon = assets?.[models[type]];
  if (!icon) return false;
  const phase = Number.isFinite(time) ? time : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(PROP_VISUAL_SCALE, PROP_VISUAL_SCALE);
  let height;
  let bottom;
  if (type === 'spring') {
    // Keep the rubber tip on its platform during the brief contact/rebound cue.
    const compression = Math.min(1, Math.max(0, Number.isFinite(compressed) ? compressed : 0));
    height = 36 * (1 - compression * .20);
    bottom = 0;
  } else if (type === 'hat') {
    // The broom's original long axis is vertical; show its complete silhouette
    // flying horizontally, with the wooden handle forward and bristles behind.
    ctx.translate(0, Math.sin(phase * 2.6) * 1.6);
    ctx.rotate(Math.PI / 2 + Math.sin(phase * 2) * .045);
    height = 35;
    bottom = height / 2;
  } else {
    ctx.translate(0, Math.sin(phase * 2.8) * 1.5);
    height = Math.min(32, 28 * icon.height / icon.width);
    bottom = height / 2;
  }
  const width = (type === 'spring' ? 36 : height) * icon.width / icon.height;
  ctx.drawImage(icon.image, icon.x, icon.y, icon.width, icon.height,
    -width / 2, bottom - height, width, height);
  ctx.restore();
  return true;
}
