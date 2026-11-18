import { AutoloadPage } from 'vj/misc/Page';

const THEMES = ['light', 'dark', 'default'] as const;
type Theme = typeof THEMES[number];

const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
const ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>';

function normalizeTheme(theme: string): Theme {
  return (THEMES as readonly string[]).includes(theme) ? theme as Theme : 'default';
}

function isDark() {
  return document.documentElement.classList.contains('theme--dark');
}

/** Apply a palette switch in place — the theme is one class on <html>. */
export function applyTheme(theme: string) {
  const next = normalizeTheme(theme);
  const dark = next === 'dark';
  const html = document.documentElement;
  html.classList.toggle('theme--dark', dark);
  html.classList.toggle('theme--light', !dark);
  html.dataset.mantineColorScheme = dark ? 'dark' : 'light';
  localStorage.setItem('mantine-color-scheme-value', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', dark ? '#262624' : '#FAF9F5',
  );
  // remember the choice for the next server render (works without an account)
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
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
  theme.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    applyTheme(next);
    fetch(`/set_theme/${next}`, { credentials: 'include' }).catch(() => {});
  });

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
