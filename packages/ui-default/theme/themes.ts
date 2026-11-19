/**
 * 主题清单 —— 全站唯一一处。
 *
 * 服务端（`index.ts`）用它校验 `/set_theme/:theme`、生成设置项和页脚菜单，
 * 客户端（`components/theme/theme.page.ts`）用它做就地切换。
 * 新增一个主题只需要两步：
 *
 *   1. 在 `theme/palettes/` 加一个 `:root.theme--<id>` 的调色板文件，
 *      并在 `theme/default.js` 里 import；
 *   2. 在这个数组里加一项。
 *
 * 具体颜色仍然只写在调色板里；这里的 `color` 只是浏览器地址栏取色，
 * 必须与调色板的 `--c-bg` 保持一致。
 */
export interface ThemeMeta {
  readonly id: string;
  /** 显示名，取值会被 `_()` 翻译 */
  readonly label: string;
  /** 深色系：Mantine 组件与 `prefers-color-scheme` 只看这一档 */
  readonly dark: boolean;
  /** 等同调色板的 `--c-bg` */
  readonly color: string;
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'default', label: 'Light', dark: false, color: '#FAF9F5',
  },
  {
    id: 'dark', label: 'Dark', dark: true, color: '#262624',
  },
  {
    id: 'sepia', label: 'Sepia', dark: false, color: '#F4ECD9',
  },
];

export const DEFAULT_THEME = 'default';

/** 老版本的设置与 cookie 里存的是 `light`，统一落到默认主题上。 */
const ALIASES: Record<string, string> = {
  light: 'default',
};

export function resolveTheme(theme?: string): ThemeMeta {
  const id = ALIASES[theme] || theme;
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function isThemeId(theme?: string): boolean {
  return THEMES.some((t) => t.id === (ALIASES[theme] || theme));
}

export function isDarkTheme(theme?: string): boolean {
  return resolveTheme(theme).dark;
}

/**
 * 当前该用哪个主题：设置里存过就用存的，否则用 cookie 里的（访客期选的）。
 * 注意不能直接读 `user.theme` —— 偏好项会把默认值料化到 user 上，
 * 那样 cookie 就永远轮不到了。
 */
export function pickTheme(
  user?: { _udoc?: { theme?: string } },
  cookies?: { get(name: string): string },
): string {
  return resolveTheme(user?._udoc?.theme || cookies?.get('theme')).id;
}
