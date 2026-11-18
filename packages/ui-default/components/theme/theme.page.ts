import { AutoloadPage } from 'vj/misc/Page';

const THEMES = ['light', 'dark', 'default'] as const;
type Theme = typeof THEMES[number];

function normalizeTheme(theme: string): Theme {
  return (THEMES as readonly string[]).includes(theme) ? theme as Theme : 'default';
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
});
