import { AutoloadPage } from 'vj/misc/Page';

/**
 * 原生下拉框的候选面板。
 *
 * <select> 的弹出层由操作系统绘制，样式完全不受控制：浅色主题里是一块系统灰，
 * 深色主题里还是白的，和右键菜单完全是两种东西。这个组件把候选列表接管成
 * 和右键菜单同一套面板（components/menu-panel），只在有精确指针的设备上生效，
 * 触屏仍然交回系统原生的选择器。
 *
 * 真正的 <select> 元素保留在 DOM 里，选中后派发 input / change 事件，
 * 表单提交、页面脚本的联动都不用改。
 */

const PANEL_CLASS = 'menu-panel menu-panel--select';

export default new AutoloadPage('selectmenu', () => {
  // 纯触屏设备保留系统选择器（它有原生滚轮与辅助功能）；
  // 和右键菜单用同一条判断，避免两处对“桌面”的定义不一致
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  if (coarse && !fine) return;

  const panel = document.createElement('div');
  panel.className = PANEL_CLASS;
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute('role', 'listbox');
  document.body.appendChild(panel);

  let current: HTMLSelectElement | null = null;
  let activeIndex = -1;

  const items = () => Array.from(panel.querySelectorAll<HTMLButtonElement>('.menu-panel__item'));

  const setActive = (index: number) => {
    const list = items();
    list.forEach((el) => el.classList.remove('is-active'));
    const el = list[index];
    if (!el) return;
    el.classList.add('is-active');
    activeIndex = index;
    el.scrollIntoView({ block: 'nearest' });
  };

  const moveActive = (step: number) => {
    const list = items().filter((el) => !el.disabled);
    if (!list.length) return;
    const currentEl = items()[activeIndex];
    const pos = currentEl && !currentEl.disabled ? list.indexOf(currentEl as HTMLButtonElement) : -1;
    const next = (pos + step + list.length) % list.length;
    setActive(items().indexOf(list[next]));
  };

  const close = (refocus = true) => {
    if (panel.hidden) return;
    const select = current;
    panel.hidden = true;
    panel.textContent = '';
    current = null;
    activeIndex = -1;
    if (select) select.setAttribute('aria-expanded', 'false');
    if (refocus && select) select.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    const select = current;
    if (!select) return;
    const option = select.options[index];
    if (!option || option.disabled) return;
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      // 页面脚本多半监听的是 change（jQuery 绑定），两个都派发
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  };

  const place = () => {
    const select = current;
    if (!select) return;
    const rect = select.getBoundingClientRect();
    // 先按内容算出高度，再决定向上还是向下展开
    panel.style.maxHeight = '';
    const panelHeight = panel.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const flip = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.minWidth = `${Math.round(rect.width)}px`;
    // 上限和 .menu-panel 的 320px 对齐，否则长列表会铺满整屏
    const room = flip ? spaceAbove : spaceBelow;
    panel.style.maxHeight = `${Math.round(Math.min(320, Math.max(120, room)))}px`;
    if (flip) {
      panel.style.top = 'auto';
      panel.style.bottom = `${Math.round(window.innerHeight - rect.top + 4)}px`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${Math.round(rect.bottom + 4)}px`;
    }
  };

  const render = (select: HTMLSelectElement) => {
    panel.textContent = '';
    Array.from(select.options).forEach((option, index) => {
      if (option.hidden) return;
      const parent = option.parentElement;
      if (parent instanceof HTMLOptGroupElement && parent.firstElementChild === option) {
        const label = document.createElement('div');
        label.className = 'menu-panel__group-label';
        label.textContent = parent.label;
        panel.appendChild(label);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'menu-panel__item';
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      if (option.disabled) {
        item.disabled = true;
        item.classList.add('is-disabled');
      }
      if (index === select.selectedIndex) item.setAttribute('aria-selected', 'true');
      const text = document.createElement('span');
      text.className = 'menu-panel__label';
      text.textContent = option.textContent.trim();
      item.appendChild(text);
      if (index === select.selectedIndex) {
        const check = document.createElement('span');
        check.className = 'icon icon-check menu-panel__check';
        check.setAttribute('aria-hidden', 'true');
        item.appendChild(check);
      }
      // 保住 select 的焦点，键盘还能接着用
      item.addEventListener('mousedown', (ev) => ev.preventDefault());
      item.addEventListener('click', () => choose(index));
      panel.appendChild(item);
    });
  };

  const open = (select: HTMLSelectElement) => {
    if (current === select) return;
    close(false);
    current = select;
    render(select);
    panel.hidden = false;
    select.setAttribute('aria-expanded', 'true');
    place();
    const selected = items().findIndex((el) => el.getAttribute('aria-selected') === 'true');
    setActive(selected >= 0 ? selected : items().findIndex((el) => !el.disabled));
  };

  const isSelect = (el: EventTarget | null): el is HTMLSelectElement => el instanceof HTMLSelectElement
    && el.classList.contains('select')
    && !el.multiple
    && el.size <= 1
    && !el.dataset.nativeMenu
    && !el.disabled;

  document.addEventListener('mousedown', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest('.menu-panel--select')) return;
    if (isSelect(ev.target)) {
      // 拦掉系统弹出层，用自己的面板
      ev.preventDefault();
      const select = ev.target as HTMLSelectElement;
      select.focus({ preventScroll: true });
      open(select);
      return;
    }
    close(false);
  }, true);

  document.addEventListener('keydown', (ev) => {
    const openPanel = !panel.hidden && current;
    if (!openPanel) {
      if (!isSelect(ev.target)) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        open(ev.target as HTMLSelectElement);
      }
      return;
    }
    switch (ev.key) {
      case 'Escape':
        ev.preventDefault();
        close();
        break;
      case 'ArrowDown':
        ev.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        ev.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        ev.preventDefault();
        setActive(items().findIndex((el) => !el.disabled));
        break;
      case 'End': {
        ev.preventDefault();
        const list = items();
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (!list[i].disabled) {
            setActive(i);
            break;
          }
        }
        break;
      }
      case 'Enter':
      case ' ':
        ev.preventDefault();
        if (activeIndex >= 0) choose(activeIndex);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  }, true);

  window.addEventListener('scroll', () => {
    if (panel.hidden) return;
    place();
  }, true);

  window.addEventListener('resize', () => {
    if (panel.hidden) return;
    place();
  });

  // 页面用 innerHTML 换掉内容时（DiffDOM 的局部刷新）面板要跟着关掉
  document.addEventListener('vjContentRemove', () => {
    if (!panel.hidden) close(false);
  });
});
