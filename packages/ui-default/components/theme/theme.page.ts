import { AutoloadPage } from 'vj/misc/Page';
import {
  DEFAULT_THEME, isColorMode, resolveTheme, THEMES,
} from 'vj/theme/themes';

const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
const ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>';

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

/** 就地切换配色方案；persist=false 只预览，不写 cookie。 */
export function applyTheme(theme: string, persist = true) {
  const meta = resolveTheme(theme);
  const html = document.documentElement;
  for (const item of THEMES) html.classList.remove(`theme--${item.id}`);
  html.classList.add(`theme--${meta.id}`);
  if (persist) setCookie('theme', meta.id);
  syncChrome();
}

/** 就地切换深浅模式（auto 跟随系统）；persist=false 只预览。 */
export function applyMode(mode: string, persist = true) {
  const value = isColorMode(mode) ? mode : 'auto';
  const html = document.documentElement;
  html.dataset.colorMode = value;
  html.classList.toggle('mode--dark', value === 'dark' || (value === 'auto' && !!media?.matches));
  if (persist) setCookie('colorMode', value);
  syncChrome();
}

// 跟随系统时，系统切换深浅也实时跟上
media?.addEventListener?.('change', () => {
  if (document.documentElement.dataset.colorMode === 'auto') applyMode('auto', false);
});

/** 右下角按钮：只切深浅，不动配色方案。 */
export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  applyMode(next);
  fetch(`/set_mode/${next}`, { credentials: 'include' }).catch(() => {});
  return next;
}

function makeFab(className: string, label: string, html: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `fab ${className}`;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.innerHTML = html;
  return button;
}

/** One column in the bottom-right corner: search, theme, back to top. */
function mountFloatingActions() {
  if (document.querySelector('.fab-stack')) return;
  const stack = document.createElement('div');
  stack.className = 'fab-stack';

  const search = document.querySelector('.omnibar-toggle') as HTMLElement | null;
  if (search) {
    search.classList.add('fab');
    stack.appendChild(search);
  }

  const theme = makeFab('fab--theme', '切换深浅色', MOON);
  theme.addEventListener('click', toggleTheme);

  const top = makeFab('fab--top', '回到顶部', ARROW_UP);
  top.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // stack grows upward from the corner: theme above search, arrow above theme
  stack.appendChild(theme);
  stack.appendChild(top);
  document.body.appendChild(stack);

  const syncThemeIcon = () => {
    theme.innerHTML = isDark() ? SUN : MOON;
    theme.setAttribute('aria-pressed', String(isDark()));
  };
  syncThemeIcon();
  document.addEventListener('themechange', syncThemeIcon);

  const syncTop = () => {
    top.classList.toggle('is-visible', window.scrollY > 320);
  };
  syncTop();
  window.addEventListener('scroll', syncTop, { passive: true });
}

export default new AutoloadPage('theme', () => {
  document.addEventListener('click', (ev: MouseEvent) => {
    const link = (ev.target as HTMLElement)?.closest?.('a[href^="/set_theme/"]') as HTMLAnchorElement | null;
    if (!link) return;
    // switching a palette does not need a round trip: repaint now, persist after
    ev.preventDefault();
    const theme = link.getAttribute('href').split('/').pop();
    applyTheme(theme);
    fetch(link.href, { credentials: 'include' }).catch(() => {});
  });

  mountFloatingActions();
});
