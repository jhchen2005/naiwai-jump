// Bound the whole group, including response bodies and image decoding. A hung
// mobile connection must never leave the start screen waiting indefinitely.
export const ASSET_TIMEOUT_MS = 15000;
export async function assetGroup(label, load) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      load(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label}加载超时，请检查网络后重试。`));
          controller.abort();
        }, ASSET_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    controller.abort();
    throw error;
  } finally { clearTimeout(timer); }
}

export async function readAssetData(url, signal, label, priority = 'high') {
  const response = await fetch(url, { signal, priority });
  if (!response.ok) throw new Error(`${label}资源加载失败，请重试。`);
  return response.json();
}

export function readAssetImage(url, signal, label, priority = 'high') {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', cancel);
      if (error) { image.src = ''; reject(error); }
      else resolve(image);
    };
    const cancel = () => finish(new Error(`${label}加载已取消，请重试。`));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    image.fetchPriority = priority; image.decoding = 'async';
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      decoded.then(() => finish(), () => finish(new Error(`${label}图片解码失败，请重试。`)));
    };
    image.onerror = () => finish(new Error(`${label}图片加载失败，请重试。`));
    image.src = url.href;
  });
}
