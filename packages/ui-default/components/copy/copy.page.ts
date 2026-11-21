import { AutoloadPage } from 'vj/misc/Page';
import {
    announceCopy, attributionHandler, copyContext, registerCopyHandler, transformForCopy,
} from './copy';

// 这些地方的“复制”属于用户自己的编辑行为，不能改写内容
const EXCLUDED = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .monaco-editor, .md-editor';

function selectionHtml(range: Range) {
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    return holder.innerHTML;
}

function isCodeSelection(node: Node | null) {
    const element = node instanceof Element ? node : node?.parentElement;
    return !!element?.closest('pre, code');
}

export default new AutoloadPage('copy', () => {
    // 默认来源追加放在最低优先级，前面的 handler 可以关掉它
    registerCopyHandler('attribution', attributionHandler, -100);

    document.addEventListener('copy', (ev) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const target = ev.target instanceof Element ? ev.target : null;
        if (target?.closest(EXCLUDED)) return;
        const text = selection.toString();
        if (!text.trim()) return;

        const range = selection.getRangeAt(0);
        const source = isCodeSelection(range.startContainer) ? 'code' : 'selection';
        const payload = transformForCopy(text, selectionHtml(range), source, target);
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
