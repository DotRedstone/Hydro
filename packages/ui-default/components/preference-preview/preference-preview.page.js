import { AutoloadPage } from 'vj/misc/Page';
import { THEMES } from 'vj/theme/themes';
import { i18n } from 'vj/utils';
import { applyCodeTheme, applyMode, applyTheme } from 'vj/components/theme/theme.page';

// 偏好设置实时预览：改字体 / 主题 / 圆角时立刻作用到当前页面，
// 只改 DOM，不写 cookie、不发请求——真正生效仍以“保存”为准，
// 不保存直接离开，下一页由服务端按已保存的值重新渲染，自然还原。

const ROUNDED = 'preference-preview--rounded';

function quote(name) {
  return `"${String(name).replace(/["\\]/g, '')}"`;
}

function previewFont(select, variable, fallback) {
  if (!select) return;
  const apply = () => {
    // html5.html 把这两个变量挂在 body 上，这里也写在 body，优先级一致
    document.body.style.setProperty(variable, `${quote(select.value)}, var(${fallback})`);
  };
  select.addEventListener('change', apply);
}

function previewTheme(select) {
  if (!select) return;
  // 只预览不持久化：保存前离开页面，服务端会按已保存的值还原
  select.addEventListener('change', () => applyTheme(select.value, false));
}

function previewMode(select) {
  if (!select) return;
  select.addEventListener('change', () => applyMode(select.value, false));
}

function previewCodeTheme(select) {
  if (!select) return;
  select.addEventListener('change', () => applyCodeTheme(select.value, false));
}

// 配色色块：点击即改下拉框并触发 change（预览照常走 previewTheme），下拉框保留作无 JS 兜底
function buildSwatches(select) {
  if (!select) return;
  const row = document.createElement('div');
  row.className = 'theme-swatches';
  row.setAttribute('role', 'group');
  const sync = () => row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === select.value)));
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-swatch';
    btn.dataset.theme = t.id;
    const chips = document.createElement('span');
    chips.className = 'theme-swatch__chips';
    for (const c of t.swatch) {
      const chip = document.createElement('span');
      chip.style.background = c; // 色值来自 themes.ts 清单，不是样式表字面量
      chips.append(chip);
    }
    const label = document.createElement('span');
    label.textContent = i18n(t.label);
    btn.append(chips, label);
    btn.addEventListener('click', () => {
      select.value = t.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    row.append(btn);
  }
  select.addEventListener('change', sync);
  select.parentElement.insertBefore(row, select);
  sync();
}

function previewRounded(checkbox) {
  if (!checkbox) return;
  const apply = () => document.documentElement.classList.toggle(ROUNDED, checkbox.checked);
  checkbox.addEventListener('change', apply);
  apply();
}

export default new AutoloadPage('preference-preview', () => {
  const card = document.querySelector('[data-preference-preview]');
  if (!card) return;
  const form = card.closest('form') || document;
  previewFont(form.querySelector('select[name="fontFamily"]'), '--font-family', '--font-ui');
  previewFont(form.querySelector('select[name="codeFontFamily"]'), '--code-font-family', '--font-code');
  previewTheme(form.querySelector('select[name="theme"]'));
  buildSwatches(form.querySelector('select[name="theme"]'));
  previewMode(form.querySelector('select[name="colorMode"]'));
  previewCodeTheme(form.querySelector('select[name="codeTheme"]'));
  previewRounded(form.querySelector('input[type="checkbox"][name="rounded"]'));
});
