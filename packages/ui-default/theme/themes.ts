/**
 * 配色方案与深浅模式清单 —— 全站唯一一处。
 *
 * 两个维度互相独立，任意组合：
 *   - 配色方案（theme）：`<html>` 上挂 `theme--<id>`，调色板在 `theme/palettes/<id>.css`，
 *     同一个文件里写浅色（`:root.theme--<id>`）和深色（`:root.theme--<id>.mode--dark`）两版；
 *   - 深浅模式（colorMode）：`auto` / `light` / `dark`，深色时 `<html>` 上多一个 `mode--dark`。
 *
 * 服务端（`index.ts`、`backendlib/template.ts`）用它校验路由、生成设置项和页脚菜单，
 * 客户端（`components/theme/theme.page.ts`）用它就地切换。
 * 新增配色方案：加一个调色板文件 → 在 `theme/default.js` 里 import → 在 THEMES 里加一项。
 * `light` / `dark` 是地址栏取色，必须分别等于调色板两版的 `--c-bg`。
 */
export interface ThemeMeta {
  readonly id: string;
  /** 显示名，取值会被 `_()` 翻译 */
  readonly label: string;
  /** 浅色版 `--c-bg` */
  readonly light: string;
  /** 深色版 `--c-bg` */
  readonly dark: string;
  /** 设置页色块缩略图：底色 / 卡片 / 强调色（浅色版） */
  readonly swatch: readonly [string, string, string];
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'default', label: 'Warm Paper', light: '#FAF9F5', dark: '#1B1B1A', swatch: ['#FAF9F5', '#FFFFFF', '#C2603F'],
  },
  {
    id: 'sepia', label: 'Sepia', light: '#E8DFCB', dark: '#1E1A14', swatch: ['#E8DFCB', '#F4ECD9', '#B9663C'],
  },
  {
    id: 'nord', label: 'Nord', light: '#ECEFF4', dark: '#2E3440', swatch: ['#ECEFF4', '#FFFFFF', '#5E81AC'],
  },
  {
    id: 'solarized', label: 'Solarized', light: '#FDF6E3', dark: '#002B36', swatch: ['#FDF6E3', '#EEE8D5', '#268BD2'],
  },
  {
    id: 'github', label: 'GitHub', light: '#F6F8FA', dark: '#0D1117', swatch: ['#F6F8FA', '#FFFFFF', '#0969DA'],
  },
  {
    id: 'rosepine', label: 'Rosé Pine', light: '#FAF4ED', dark: '#191724', swatch: ['#FAF4ED', '#FFFAF3', '#907AA9'],
  },
];

export const DEFAULT_THEME = 'default';

export type ColorMode = 'auto' | 'light' | 'dark';
export const COLOR_MODES: Record<ColorMode, string> = {
  auto: 'Follow System',
  light: 'Light',
  dark: 'Dark',
};
export const DEFAULT_MODE: ColorMode = 'auto';

/** 老版本把“深色”当成一套主题存：`theme=dark` 迁移成默认配色 + 深色模式。 */
const LEGACY: Record<string, { theme: string, mode?: ColorMode }> = {
  light: { theme: 'default', mode: 'light' },
  dark: { theme: 'default', mode: 'dark' },
};

export function resolveTheme(theme?: string): ThemeMeta {
  const id = LEGACY[theme]?.theme || theme;
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function isThemeId(theme?: string): boolean {
  return !!LEGACY[theme] || THEMES.some((t) => t.id === theme);
}

export function isColorMode(mode?: string): mode is ColorMode {
  return Object.prototype.hasOwnProperty.call(COLOR_MODES, mode || '');
}

export function resolveMode(mode?: string, legacyTheme?: string): ColorMode {
  if (isColorMode(mode)) return mode;
  return LEGACY[legacyTheme]?.mode || DEFAULT_MODE;
}

type UserLike = { _udoc?: { theme?: string, colorMode?: string } };
type Cookies = { get(name: string): string };

/**
 * 当前配色方案：设置里存过就用存的，否则用 cookie（访客期选的）。
 * 不能直接读 `user.theme` —— 偏好项会把默认值料化到 user 上，cookie 就永远轮不到了。
 */
export function pickTheme(user?: UserLike, cookies?: Cookies): string {
  return resolveTheme(user?._udoc?.theme || cookies?.get('theme')).id;
}

/** 当前深浅模式；兼容旧的 `theme=dark`。 */
export function pickMode(user?: UserLike, cookies?: Cookies): ColorMode {
  const legacy = user?._udoc?.theme || cookies?.get('theme');
  return resolveMode(user?._udoc?.colorMode || cookies?.get('colorMode'), legacy);
}

/** 服务端渲染时能确定的深浅：`auto` 先按浅色出，首帧前由内联脚本按系统偏好修正。 */
export function isDarkMode(mode: ColorMode, systemDark = false): boolean {
  return mode === 'dark' || (mode === 'auto' && systemDark);
}
