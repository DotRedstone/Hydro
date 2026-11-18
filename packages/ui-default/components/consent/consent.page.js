import { AutoloadPage } from 'vj/misc/Page';

// 记录用户是否已经做过选择；没有记录才显示卡片
const KEY = 'hydro.cookie-consent';
const OPEN = 'consent-bar--open';
const LEAVE = 'consent-bar--leaving';

function dismiss(bar: HTMLElement, choice: string) {
  try {
    localStorage.setItem(KEY, choice);
  } catch (e) {
    // 隐私模式下 localStorage 可能不可写，忽略即可，最多是下次再问一遍
  }
  bar.classList.remove(OPEN);
  bar.classList.add(LEAVE);
  const drop = () => bar.remove();
  bar.addEventListener('transitionend', drop, { once: true });
  // 兜底：动画被系统“减少动态效果”关掉时不会有 transitionend
  setTimeout(drop, 400);
}

export default new AutoloadPage('consent', () => {
  const bar = document.querySelector('[data-consent]') as HTMLElement | null;
  if (!bar) return;
  let decided = false;
  try {
    decided = !!localStorage.getItem(KEY);
  } catch (e) {
    decided = false;
  }
  if (decided) {
    bar.remove();
    return;
  }
  // 等一帧再加 class，保证初始位移能被过渡动画捕捉到
  requestAnimationFrame(() => bar.classList.add(OPEN));
  bar.querySelector('[data-consent-accept]')?.addEventListener('click', () => dismiss(bar, 'all'));
  bar.querySelector('[data-consent-essential]')?.addEventListener('click', () => dismiss(bar, 'essential'));
});
