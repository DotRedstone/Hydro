/**
 * 字体清单 —— 全站唯一一处。bundled=true 的随站点打包（theme/default.js 里 @fontsource），
 * 其余依赖用户系统；偏好页检测不到时标“未安装”，不隐藏。
 */
export interface FontMeta { readonly id: string; readonly label: string; readonly bundled?: boolean }

export const TEXT_FONTS: readonly FontMeta[] = [
  { id: 'Inter', label: 'Inter', bundled: true },
  { id: 'Source Serif 4', label: 'Source Serif 4', bundled: true },
  { id: 'Noto Serif SC', label: 'Noto Serif SC', bundled: true },
  { id: 'PingFang SC', label: 'PingFang SC' },
  { id: 'Hiragino Sans GB', label: 'Hiragino Sans GB' },
  { id: 'Microsoft Yahei', label: 'Microsoft Yahei' },
  { id: 'Segoe UI', label: 'Segoe UI' },
  { id: 'Open Sans', label: 'Open Sans' },
  { id: 'WenQuanYi Micro Hei', label: 'WenQuanYi Micro Hei' },
  { id: 'XiaoLai SC', label: '小赖 SC' },
  { id: 'sans', label: 'System Default' },
];

export const CODE_FONTS: readonly FontMeta[] = [
  { id: 'JetBrains Mono', label: 'JetBrains Mono', bundled: true },
  { id: 'Source Code Pro', label: 'Source Code Pro', bundled: true },
  { id: 'Fira Code', label: 'Fira Code', bundled: true },
  { id: 'Roboto Mono', label: 'Roboto Mono', bundled: true },
  { id: 'Inconsolata', label: 'Inconsolata', bundled: true },
  { id: 'Ubuntu Mono', label: 'Ubuntu Mono', bundled: true },
  { id: 'PT Mono', label: 'PT Mono', bundled: true },
  { id: 'DM Mono', label: 'DM Mono', bundled: true },
];

export const CODE_FONT_SIZES = { 12: '12px', 13: '13px', 14: '14px', 15: '15px', 16: '16px', 18: '18px' };

export const toRange = (list: readonly FontMeta[]) => Object.fromEntries(list.map((f) => [f.id, f.label]));
