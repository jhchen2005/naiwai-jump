// Replace this PNG with the author's payment code. Keep the original image intact.
export const AUTHOR_QR_URL = new URL('../assets/support/author-qr.png', import.meta.url).href;

export const supportHeart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.3 5.7a5.4 5.4 0 0 0-7.6 0L12 6.4l-.7-.7a5.4 5.4 0 0 0-7.6 7.6L12 21l8.3-7.7a5.4 5.4 0 0 0 0-7.6Z"/></svg>';

export class AuthorSupport {
  constructor(root) {
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'support-dialog';
    this.dialog.setAttribute('aria-labelledby', 'support-title');
    this.dialog.setAttribute('aria-describedby', 'support-description');
    this.dialog.innerHTML = `
      <button class="support-close" type="button" aria-label="关闭打赏窗口" data-support-close autofocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <div class="support-mark" aria-hidden="true">${supportHeart}</div>
      <p class="support-kicker">THANKS FOR PLAYING</p>
      <h2 id="support-title">请作者喝杯咖啡</h2>
      <p id="support-description" class="support-description">如果奶娃让你开心了一下，<br>欢迎随心打赏，支持作者继续创作。</p>
      <div class="support-code">
        <img class="support-qr" alt="作者收款二维码" hidden>
        <div class="support-placeholder" role="status">
          <span class="support-placeholder-icon" aria-hidden="true">${supportHeart}</span>
          <strong>收款码准备中</strong>
          <span>谢谢你愿意支持这份小小的创作</span>
        </div>
      </div>
      <p class="support-hint" hidden>微信扫码赞赏 · 金额随心<br>同一台手机可保存图片后，用微信扫一扫识别</p>
      <a class="support-save" download="作者收款码.png" hidden>保存收款码</a>
      <p class="support-note">自愿支持，来玩就已经很开心啦。</p>
      <button class="support-back" type="button" data-support-close>返回成绩页</button>`;
    root.append(this.dialog);
    this.image = this.dialog.querySelector('.support-qr');
    this.placeholder = this.dialog.querySelector('.support-placeholder');
    this.hint = this.dialog.querySelector('.support-hint');
    this.save = this.dialog.querySelector('.support-save');
    this.image.addEventListener('load', () => this.setReady(this.image.naturalWidth > 0), options);
    this.image.addEventListener('error', () => this.setReady(false), options);
    this.dialog.addEventListener('pointerdown', event => {
      this.backdropPressed = this.isBackdrop(event);
    }, options);
    this.dialog.addEventListener('click', event => {
      if (event.target.closest('[data-support-close]') || (this.backdropPressed && this.isBackdrop(event))) this.close();
      this.backdropPressed = false;
    }, options);
    this.dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const nodes = [...this.dialog.querySelectorAll('button, a[href]')].filter(node => !node.hidden && !node.disabled);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, options);
  }
  isBackdrop(event) {
    if (event.target !== this.dialog) return false;
    const rect = this.dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  setReady(ready) {
    this.ready = ready;
    this.dialog.dataset.ready = String(ready);
    this.image.hidden = !ready;
    this.placeholder.hidden = ready;
    this.hint.hidden = !ready;
    this.save.hidden = !ready;
    if (ready) this.save.href = this.image.src;
    else this.save.removeAttribute('href');
  }
  open() {
    if (this.dialog.open) return;
    // Retry a missing/replaced image on the next opening, even on cached static hosts.
    if (!this.ready) this.image.src = `${AUTHOR_QR_URL}?v=${Date.now()}`;
    this.dialog.showModal();
  }
  close() { if (this.dialog.open) this.dialog.close(); }
  destroy() { this.close(); this.abort.abort(); this.dialog.remove(); }
}
