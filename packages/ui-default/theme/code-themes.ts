/**
 * 代码高亮主题清单 —— 全站唯一一处，Prism 与 monaco 共用。
 *
 * `<html>` 上挂 `code--<id>`，色值只在 `theme/palettes/code.css` 里以 `--hl-*` 给出；
 * `follow` 不定义色值，直接映射到当前配色方案的 `--c-*`，随配色与深浅一起变。
 * 新增：在 code.css 加一段 `:root.code--<id>` → 这里加一项。
 */
export interface CodeThemeMeta {
  readonly id: string;
  readonly label: string;
  /** 固定深色底（monaco 以 vs-dark 为基础）；follow 由 mode--dark 决定 */
  readonly dark?: boolean;
}

export const CODE_THEMES: readonly CodeThemeMeta[] = [
  { id: 'follow', label: 'Follow Color Scheme' },
  { id: 'github', label: 'GitHub', dark: false },
  { id: 'one-dark', label: 'One Dark', dark: true },
  { id: 'dracula', label: 'Dracula', dark: true },
  { id: 'monokai', label: 'Monokai', dark: true },
  { id: 'solarized-light', label: 'Solarized Light', dark: false },
  { id: 'solarized-dark', label: 'Solarized Dark', dark: true },
  { id: 'nord', label: 'Nord', dark: true },
  { id: 'tomorrow-night', label: 'Tomorrow Night', dark: true },
  { id: 'tokyo-night', label: 'Tokyo Night', dark: true },
  { id: 'tokyo-night-day', label: 'Tokyo Night Day', dark: false },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', dark: true },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', dark: false },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', dark: true },
  { id: 'gruvbox-light', label: 'Gruvbox Light', dark: false },
  { id: 'one-light', label: 'One Light', dark: false },
  { id: 'github-dark', label: 'GitHub Dark', dark: true },
  { id: 'everforest', label: 'Everforest', dark: true },
  { id: 'kanagawa', label: 'Kanagawa', dark: true },
  { id: 'rose-pine', label: 'Rosé Pine', dark: true },
];

export const DEFAULT_CODE_THEME = 'follow';

export function resolveCodeTheme(id?: string): CodeThemeMeta {
  return CODE_THEMES.find((t) => t.id === id) || CODE_THEMES[0];
}

export function isCodeThemeId(id?: string): boolean {
  return CODE_THEMES.some((t) => t.id === id);
}

type UserLike = { _udoc?: { codeTheme?: string } };
type Cookies = { get(name: string): string };

export function pickCodeTheme(user?: UserLike, cookies?: Cookies): string {
  return resolveCodeTheme(user?._udoc?.codeTheme || cookies?.get('codeTheme')).id;
}
