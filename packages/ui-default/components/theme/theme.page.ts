import { AutoloadPage } from 'vj/misc/Page';
import {
  DEFAULT_THEME, isColorMode, resolveTheme, THEMES,
} from 'vj/theme/themes';

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ARROW_UP = `${SVG_OPEN}<path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>`;
const MOON = `${SVG_OPEN}<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;
const SUN = `${SVG_OPEN}<circle cx="12" cy="12" r="4"/>`
  + '<path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';

/** 当前配色方案：`<html>` 上只会挂一个 `theme--<id>`。 */
export function currentTheme() {
  const { classList } = document.documentElement;
  return THEMES.find((t) => classList.contains(`theme--${t.id}`))?.id || DEFAULT_THEME;
}

/** 当前是否深色：只看 `mode--dark`，与配色方案无关。 */
export function isDark() {
  return document.documentElement.classList.contains('mode--dark');
}

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function syncChrome() {
  const html = document.documentElement;
  const dark = isDark();
  const meta = resolveTheme(currentTheme());
  html.dataset.mantineColorScheme = dark ? 'dark' : 'light';
  localStorage.setItem('mantine-color-scheme-value', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? meta.dark : meta.light);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: meta.id, dark } }));
}

function setCookie(key: string, value: string) {
  document.cookie = `${key}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function hasCookie(key: string) {
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${key}=`));
}

// 多标签页同步：一处保存，其它已打开的页面就地跟上
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hydro-appearance') : null;
function broadcast(key: string, value: string) {
  channel?.postMessage({ key, value });
}

/** 就地切换配色方案；persist=false 只预览，不写 cookie。 */
export function applyTheme(theme: string, persist = true) {
  const meta = resolveTheme(theme);
  const html = document.documentElement;
  for (const item of THEMES) html.classList.remove(`theme--${item.id}`);
  html.classList.add(`theme--${meta.id}`);
  if (persist) {
    // 旧版 cookie 只有 theme=dark、没有 colorMode：深浅信息只能从 theme 推出，
    // 改写 theme 前先把服务端推导出的模式（data-color-mode）固化下来，否则深色会丢
    if (!hasCookie('colorMode') && isColorMode(html.dataset.colorMode)) {
      setCookie('colorMode', html.dataset.colorMode);
    }
    setCookie('theme', meta.id);
    broadcast('theme', meta.id);
  }
  syncChrome();
}

/** 就地切换深浅模式（auto 跟随系统）；persist=false 只预览。 */
export function applyMode(mode: string, persist = true) {
  const value = isColorMode(mode) ? mode : 'auto';
  const html = document.documentElement;
  html.dataset.colorMode = value;
  html.classList.toggle('mode--dark', value === 'dark' || (value === 'auto' && !!media?.matches));
  if (persist) {
    setCookie('colorMode', value);
    broadcast('colorMode', value);
  }
  syncChrome();
}

// 跟随系统时，系统切换深浅也实时跟上
media?.addEventListener?.('change', () => {
  if (document.documentElement.dataset.colorMode === 'auto') applyMode('auto', false);
});

/** 就地切换代码高亮主题；persist=false 只预览。 */
export function applyCodeTheme(id: string, persist = true) {
  const html = document.documentElement;
  for (const c of [...html.classList]) if (c.startsWith('code--')) html.classList.remove(c);
  if (id && id !== 'follow') html.classList.add(`code--${id}`);
  if (persist) {
    setCookie('codeTheme', id || 'follow');
    broadcast('codeTheme', id || 'follow');
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: { codeTheme: id } }));
}

channel?.addEventListener('message', (ev: MessageEvent) => {
  const { key, value } = ev.data || {};
  if (key === 'theme') applyTheme(value, false);
  else if (key === 'colorMode') applyMode(value, false);
  else if (key === 'codeTheme') applyCodeTheme(value, false);
});

function makeFab(className: string, label: string, html: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `fab ${className}`;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.innerHTML = html;
  return button;
}

/** 右下角一列：搜索、深浅切换、回到顶部。 */
function mountFloatingActions() {
  if (document.querySelector('.fab-stack')) return;
  const stack = document.createElement('div');
  stack.className = 'fab-stack';

  const search = document.querySelector('.omnibar-toggle') as HTMLElement | null;
  if (search) {
    search.classList.add('fab');
    stack.appendChild(search);
  }

  const top = makeFab('fab--top', '回到顶部', ARROW_UP);
  top.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 深浅切换：在深 / 浅之间翻转（“跟随系统”时按当前实际显示翻转），当场重绘并后台落库。
  // 图标表示“点了会变成什么”，与 title 一致：深色时显示太阳，浅色时显示月亮。
  const mode = makeFab('fab--theme', '', '');
  const syncMode = () => {
    const dark = isDark();
    const label = dark ? '切换到浅色' : '切换到深色';
    mode.innerHTML = dark ? SUN : MOON;
    mode.setAttribute('aria-label', label);
    mode.setAttribute('title', label);
  };
  // 连点时多个请求可能乱序到达，服务端最后落库的未必是最后一次点击；
  // 只保留最新一次请求，旧的直接中止
  let pending: AbortController | null = null;
  mode.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    applyMode(next);
    pending?.abort();
    const ctrl = new AbortController();
    pending = ctrl;
    fetch(`/set_mode/${next}`, { credentials: 'include', redirect: 'manual', signal: ctrl.signal })
      .catch(() => {})
      .finally(() => { if (pending === ctrl) pending = null; });
  });
  document.addEventListener('themechange', syncMode);
  syncMode();

  // column-reverse：先加入的在最下面
  stack.appendChild(mode);
  stack.appendChild(top);
  document.body.appendChild(stack);

  const syncTop = () => {
    top.classList.toggle('is-visible', window.scrollY > 320);
  };
  syncTop();
  window.addEventListener('scroll', syncTop, { passive: true });
}

export default new AutoloadPage('theme', () => {
  // 页脚的配色 / 深浅 / 代码主题链接：当场重绘，再后台请求服务端落库；无 JS 时链接照常跳转
  // 只拦截服务端真实存在的路由（见 index.ts 的 set_theme / set_mode）；
  // 代码主题走偏好页表单保存，没有 /set_code_theme 路由，拦了只会改 cookie、请求 404，登录用户刷新后又被偏好覆盖
  const APPLY: Record<string, (v: string) => void> = {
    set_theme: (v) => applyTheme(v),
    set_mode: (v) => applyMode(v),
  };
  document.addEventListener('click', (ev: MouseEvent) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const link = (ev.target as HTMLElement)?.closest?.('a[href^="/set_theme/"], a[href^="/set_mode/"]') as HTMLAnchorElement | null;
    if (!link) return;
    const [, route, value] = new URL(link.href, window.location.href).pathname.split('/');
    const apply = APPLY[route];
    if (!apply || !value) return;
    ev.preventDefault();
    apply(decodeURIComponent(value));
    fetch(link.href, { credentials: 'include', redirect: 'manual' }).catch(() => {});
  });

  mountFloatingActions();
});
