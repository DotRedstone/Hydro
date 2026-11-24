import { AutoloadPage } from 'vj/misc/Page';
import {
  announceCopy, attributionHandler, copyContext, registerCopyHandler, transformForCopy,
} from './copy';

// 这些地方的“复制”属于用户自己的编辑行为，不能改写内容
const EXCLUDED = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .monaco-editor, .md-editor';

function elementOf(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement || null;
}

/**
 * KaTeX 默认同时输出隐藏的 MathML 与可见的 HTML，selection.toString() 会把两份都拼进来，
 * 粘贴出来就是 “x2x^2” 这样重复错位的文字。这里先把选区扩到完整公式，再把每个公式换回
 * LaTeX 源码，粘贴后既可读又能直接复用。
 */
function expandToFormulas(range: Range) {
  const expanded = range.cloneRange();
  const startKatex = elementOf(range.startContainer)?.closest('.katex');
  const endKatex = elementOf(range.endContainer)?.closest('.katex');
  if (startKatex) expanded.setStartBefore(startKatex.closest('.katex-display') || startKatex);
  if (endKatex) expanded.setEndAfter(endKatex.closest('.katex-display') || endKatex);
  return expanded;
}

function texOf(katexEl: Element) {
  return katexEl.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || '';
}

/** 把克隆片段里的公式替换成 LaTeX 文本；返回是否做过替换 */
function replaceFormulas(holder: HTMLElement) {
  const formulas = Array.from(holder.querySelectorAll('.katex'));
  for (const el of formulas) {
    const tex = texOf(el);
    const display = el.parentElement?.classList.contains('katex-display');
    const target = display ? el.parentElement! : el;
    const text = tex ? (display ? `$$${tex}$$` : `$${tex}$`) : (el.querySelector('.katex-html')?.textContent || '');
    target.replaceWith(document.createTextNode(display ? `\n${text}\n` : text));
  }
  // 扩展失败时可能残留半截 MathML，一并清掉
  holder.querySelectorAll('.katex-mathml, math').forEach((el) => el.remove());
  return formulas.length > 0;
}

/** 让分离的片段按真实排版计算 innerText（保留段落与换行） */
function renderedText(holder: HTMLElement, preformatted: boolean) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:800px;opacity:0;pointer-events:none;${
    preformatted ? 'white-space:pre;' : ''}`;
  host.appendChild(holder);
  document.body.appendChild(host);
  try {
    // 这里必须用 innerText：只有它按排版把段落、<br> 转成换行，textContent 会把内容挤成一团
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    return holder.innerText;
  } finally {
    host.remove();
  }
}

function serializeSelection(selection: Selection) {
  const original = selection.getRangeAt(0);
  const ancestor = elementOf(original.commonAncestorContainer);
  const isCode = !!ancestor?.closest('pre, code');
  const preformatted = !!ancestor?.closest('pre');
  const range = isCode ? original : expandToFormulas(original);

  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  const hadFormula = !isCode && replaceFormulas(holder);

  let html = holder.innerHTML;
  // cloneContents 不含外层 <pre>，富文本编辑器会把空白合并掉导致缩进错位
  if (preformatted && !holder.querySelector('pre')) html = `<pre>${html}</pre>`;

  const text = hadFormula ? renderedText(holder, preformatted) : selection.toString();
  return { text, html, source: isCode ? 'code' as const : 'selection' as const };
}

export default new AutoloadPage('copy', () => {
  // 默认来源追加放在最低优先级，前面的 handler 可以关掉它
  registerCopyHandler('attribution', attributionHandler, -100);

  document.addEventListener('copy', (ev) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const target = ev.target instanceof Element ? ev.target : null;
    if (target?.closest(EXCLUDED)) return;
    if (!selection.toString().trim()) return;

    let serialized: ReturnType<typeof serializeSelection>;
    try {
      serialized = serializeSelection(selection);
    } catch (e) {
      // 序列化失败时交回浏览器默认复制，宁可不加来源也不能复制失败
      console.error('[copy] serialize failed', e);
      return;
    }
    const payload = transformForCopy(serialized.text, serialized.html, serialized.source, target);
    if (!payload.text || !ev.clipboardData) return;

    ev.clipboardData.setData('text/plain', payload.text);
    if (payload.html) ev.clipboardData.setData('text/html', payload.html);
    ev.preventDefault();
    announceCopy(payload);
  });

  // 给后续的功能（比赛模式反作弊等）留的接口
  const Hydro = (window as any).Hydro || ((window as any).Hydro = {});
  Hydro.copy = {
    register: registerCopyHandler,
    context: copyContext,
    transform: transformForCopy,
  };
});
