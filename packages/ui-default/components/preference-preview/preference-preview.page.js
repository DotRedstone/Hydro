import { AutoloadPage } from 'vj/misc/Page';
import { THEMES } from 'vj/theme/themes';
import { i18n } from 'vj/utils';
import { applyCodeTheme, applyMode, applyTheme } from 'vj/components/theme/theme.page';

// 偏好设置：任何一项改动立刻作用到当前页面，并在 400ms 内自动提交保存；
// 配色 / 深浅 / 代码主题同时写 cookie 并广播给其它标签页（见 theme.page.ts）。

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
  select.addEventListener('change', () => applyTheme(select.value));
}

function previewMode(select) {
  if (!select) return;
  select.addEventListener('change', () => applyMode(select.value));
}

function previewCodeTheme(select) {
  if (!select) return;
  select.addEventListener('change', () => applyCodeTheme(select.value));
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

function previewVar(el, variable, map) {
  if (!el) return;
  const apply = () => document.body.style.setProperty(variable, map(el));
  el.addEventListener('change', apply);
}


// 自动保存：表单原样 POST（含 booleanKeys），失败给出提示，不静默
function autosave(form, status) {
  let timer;
  let seq = 0;
  const show = (text, state) => {
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  };
  const save = async () => {
    const id = ++seq;
    show(i18n('Saving...'), 'pending');
    try {
      const res = await fetch(form.getAttribute('action') || window.location.href, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      if (id === seq) show(i18n('All changes saved'), 'ok');
    } catch (e) {
      if (id === seq) show(i18n('Save failed, please retry'), 'error');
    }
  };
  form.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearTimeout(timer);
    save();
  });
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
  previewVar(form.querySelector('select[name="codeFontSize"]'), '--code-font-size', (el) => `${parseInt(el.value, 10) || 14}px`);
  previewVar(form.querySelector('input[type="checkbox"][name="codeLigatures"]'), '--code-ligatures', (el) => (el.checked ? 'normal' : 'none'));
  if (form !== document) autosave(form, card.querySelector('[data-preference-status]'));
});
