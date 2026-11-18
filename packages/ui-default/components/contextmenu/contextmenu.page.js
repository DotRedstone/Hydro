import { AutoloadPage } from 'vj/misc/Page';
import { copyFromSite } from 'vj/components/copy/copy';
import { applyTheme } from 'vj/components/theme/theme.page';

// 只有在“我们确实能提供更有用动作”的地方才接管右键：
// 输入框、可编辑区域、代码编辑器、按住 Shift 时一律交回浏览器原生菜单。
const NATIVE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .monaco-editor, .md-editor';

const prefersReduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 复制统一交给 components/copy 的管线：来源追加、比赛模式记录都在那里，
// 右键菜单这里只负责把文本交出去
async function copyText(text) {
  try {
    return await copyFromSite(text, 'menu');
  } catch (e) {
    return false;
  }
}

export default new AutoloadPage('contextmenu', () => {
  const menu = document.querySelector('[data-context-menu]');
  const toastEl = document.querySelector('[data-context-toast]');
  if (!menu || !toastEl) return;
  // 纯触屏设备没有右键，长按仍应保留系统菜单；只要存在精确指针就接管
  if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) return;

  const copiedMessage = toastEl.dataset.copied || 'Copied';
  const failedMessage = toastEl.dataset.copyFailed || 'Copy failed';
  const item = (action) => menu.querySelector(`[data-action="${action}"]`);
  const group = (name) => menu.querySelector(`[data-group="${name}"]`);
  const showItem = (action, visible) => {
    const el = item(action);
    if (el) el.hidden = !visible;
  };
  const enabledItems = () => [...menu.querySelectorAll('.context-menu__item')]
    .filter((el) => !el.hidden);
  const isHidden = (action) => {
    const el = item(action);
    return !el || el.hidden;
  };

  let context = {};
  let lastFocus = null;
  let toastTimer = 0;
  let closeTimer = 0;

  const say = (message) => {
    toastEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('context-menu__toast--show'));
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('context-menu__toast--show');
      window.setTimeout(() => { toastEl.hidden = true; }, 220);
    }, 1400);
  };

  const close = () => {
    if (menu.hidden) return;
    menu.classList.remove('context-menu--open');
    const finish = () => {
      menu.hidden = true;
      menu.style.removeProperty('left');
      menu.style.removeProperty('top');
    };
    clearTimeout(closeTimer);
    if (prefersReduce()) finish();
    else closeTimer = window.setTimeout(finish, 130);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  };

  const place = (x, y) => {
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    // 贴着哪条边就朝哪边展开，靠近右下角时不会显得“断开”
    menu.dataset.origin = `${top + rect.height >= window.innerHeight - margin ? 'bottom' : 'top'}-${left + rect.width >= window.innerWidth - margin ? 'right' : 'left'}`;
  };

  const open = (ev) => {
    const target = ev.target;
    if (!(target instanceof Element) || target.closest(NATIVE_SELECTOR)) return false;

    const selection = (window.getSelection()?.toString() || '').trim();
    const anchor = target.closest('a[href]');
    const image = target.closest('img[src]');
    const codeBlock = target.closest('pre, code');
    context = {
      href: anchor ? anchor.href : '',
      imageSrc: image ? image.src : '',
      code: codeBlock ? codeBlock.textContent : '',
      selection: selection.length && selection.length < 4000 ? selection : '',
    };

    showItem('copy-selection', !!context.selection);
    showItem('copy-link', !!context.href);
    showItem('copy-image', !!context.imageSrc);
    showItem('copy-code', !!context.code);
    showItem('open-link', !!context.href);
    showItem('open-image', !!context.imageSrc);
    showItem('back', window.history.length > 1);
    showItem('forward', window.history.length > 1);
    // “复制页面链接”一直在，所以剪贴板组不需要整体隐藏
    group('open').hidden = isHidden('open-link') && isHidden('open-image');

    lastFocus = document.activeElement;
    place(ev.clientX, ev.clientY);
    requestAnimationFrame(() => menu.classList.add('context-menu--open'));
    const first = menu.querySelector('.context-menu__item:not([hidden])');
    if (first) first.focus({ preventScroll: true });
    return true;
  };

  document.addEventListener('contextmenu', (ev) => {
    if (ev.shiftKey) return; // 需要原生菜单时按住 Shift
    if (open(ev)) ev.preventDefault();
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!menu.hidden && !menu.contains(ev.target)) close();
  }, true);
  window.addEventListener('scroll', close, { capture: true, passive: true });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);

  menu.addEventListener('keydown', (ev) => {
    const items = enabledItems();
    const index = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const step = ev.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus({ preventScroll: true });
    } else if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      items[ev.key === 'Home' ? 0 : items.length - 1]?.focus({ preventScroll: true });
    } else if (ev.key === 'Tab') {
      close();
    }
  });

  menu.addEventListener('click', async (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('[data-action]') : null;
    if (!button) return;
    const action = button.dataset.action;
    close();
    switch (action) {
      case 'back': window.history.back(); break;
      case 'forward': window.history.forward(); break;
      case 'top':
        window.scrollTo({ top: 0, left: 0, behavior: prefersReduce() ? 'auto' : 'smooth' });
        break;
      case 'reload': window.location.reload(); break;
      case 'copy-selection': say(await copyText(context.selection || '') ? copiedMessage : failedMessage); break;
      case 'copy-link': say(await copyText(context.href || '') ? copiedMessage : failedMessage); break;
      case 'copy-image': say(await copyText(context.imageSrc || '') ? copiedMessage : failedMessage); break;
      case 'copy-code': say(await copyText(context.code || '') ? copiedMessage : failedMessage); break;
      case 'copy-page': say(await copyText(window.location.href) ? copiedMessage : failedMessage); break;
      case 'open-link': if (context.href) window.open(context.href, '_blank', 'noopener'); break;
      case 'open-image': if (context.imageSrc) window.open(context.imageSrc, '_blank', 'noopener'); break;
      case 'search': {
        const trigger = document.querySelector('.omnibar-toggle');
        if (trigger instanceof HTMLElement) trigger.click();
        break;
      }
      case 'theme':
        applyTheme(document.documentElement.classList.contains('theme--dark') ? 'light' : 'dark');
        break;
      default: break;
    }
  });
});
