/**
 * 复制管线：站点上所有“把文字放进剪贴板”的动作都经过这里。
 *
 * 默认只做一件事：给正文里的复制结果补一行来源。需要别的行为（例如比赛模式的水印、
 * 记录复制行为做反作弊）时，注册一个 handler 即可，不需要改这里：
 *
 *   import { registerCopyHandler } from 'vj/components/copy/copy';
 *   registerCopyHandler('contest-guard', (payload) => {
 *     payload.options.attribution = false;      // 比赛里不再追加来源
 *     payload.text = watermark(payload.text);   // 或者加上水印
 *   }, 100);
 *
 * 优先级高的先执行；handler 返回 false 表示放弃这次复制，返回对象表示替换 payload。
 * 所有 handler 跑完后会用最终文本写剪贴板，并派发一次 `hydro/copy` 事件，供只观察不修改
 * 的监听者使用（例如把复制行为上报给服务器）。
 */

export type CopySource = 'selection' | 'menu' | 'code';

export interface CopyContext {
    /** 页面标题，用作来源名称 */
    title: string;
    /** 页面地址，用作来源链接 */
    url: string;
    /** 路由对应的 page 名，例如 problem_detail */
    page: string;
    domainId?: string;
    problemId?: number;
    contestId?: string;
    trainingId?: string;
}

export interface CopyOptions {
    /** 正文复制是否追加来源 */
    attribution: boolean;
    /** 代码块复制是否追加来源（默认关闭：附加注释会破坏代码） */
    attributionCode: boolean;
    /** 来源模板，含 {0} 标题与 {1} 链接两个占位符 */
    suffix: string;
}

export interface CopyPayload {
    /** 纯文本，最终写进剪贴板 */
    text: string;
    /** 富文本，可为空字符串表示只写纯文本 */
    html: string;
    source: CopySource;
    target: Element | null;
    context: CopyContext;
    options: CopyOptions;
}

export type CopyHandler = (payload: CopyPayload) => void | CopyPayload | false;

interface Entry {
    name: string;
    priority: number;
    handler: CopyHandler;
}

const entries: Entry[] = [];

export function registerCopyHandler(name: string, handler: CopyHandler, priority = 0) {
    const entry: Entry = { name, priority, handler };
    entries.push(entry);
    entries.sort((a, b) => b.priority - a.priority);
    return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
    };
}

const DEFAULT_OPTIONS: CopyOptions = {
    attribution: true,
    attributionCode: false,
    suffix: '— Source: {0} ({1})',
};

function readContext(): CopyContext {
    const holder = document.querySelector('[data-copy-context]') as HTMLElement | null;
    const data = holder?.dataset || ({} as DOMStringMap);
    const toNumber = (value?: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };
    // 页面标题通常是「具体内容 - 站点名」，来源里不需要重复站点名
    const siteName = data.siteName || '';
    let title = document.title;
    if (siteName && title.endsWith(` - ${siteName}`)) title = title.slice(0, -(siteName.length + 3));
    return {
        title: data.title || title,
        url: window.location.href,
        page: data.page || document.documentElement.dataset.page || '',
        domainId: data.domain,
        problemId: toNumber(data.problem),
        contestId: data.contest,
        trainingId: data.training,
    };
}

function readOptions(): CopyOptions {
    const holder = document.querySelector('[data-copy-context]') as HTMLElement | null;
    const data = holder?.dataset || ({} as DOMStringMap);
    return {
        attribution: data.copyAttribution ? data.copyAttribution !== 'off' : DEFAULT_OPTIONS.attribution,
        attributionCode: data.copyAttributionCode ? data.copyAttributionCode === 'on' : DEFAULT_OPTIONS.attributionCode,
        suffix: data.copySuffix || DEFAULT_OPTIONS.suffix,
    };
}

/** 把模板里的 {0} {1} 换成标题与链接 */
export function formatSuffix(suffix: string, context: CopyContext) {
    return suffix.replace(/\{0\}/g, context.title).replace(/\{1\}/g, context.url);
}

function attributionText(payload: CopyPayload) {
    return `\n\n${formatSuffix(payload.options.suffix, payload.context)}`;
}

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attributionHtml(payload: CopyPayload) {
    // 富文本版本把标题做成链接，粘到别处仍能点回来
    const label = escapeHtml(payload.options.suffix)
        .replace(/\{0\}/g, `<a href="${escapeHtml(payload.context.url)}">${escapeHtml(payload.context.title)}</a>`)
        .replace(/\{1\}/g, escapeHtml(payload.context.url));
    const source = `<p data-hydro-source="1" style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8A8578">${label}</p>`;
    return `${payload.html}${source}`;
}

/** 默认的来源追加：优先级最低，前面的 handler 可以把它关掉或替换内容 */
export const attributionHandler: CopyHandler = (payload) => {
    if (!payload.options.attribution) return;
    if (payload.source === 'code' && !payload.options.attributionCode) return;
    payload.text += attributionText(payload);
    if (payload.html) payload.html = attributionHtml(payload);
};

function prepare(text: string, html: string, source: CopySource, target: Element | null): CopyPayload {
    const payload: CopyPayload = {
        text,
        html,
        source,
        target,
        context: readContext(),
        options: readOptions(),
    };
    for (const entry of entries) {
        let result: void | CopyPayload | false;
        try {
            result = entry.handler(payload);
        } catch (e) {
            // 一个 handler 出错不应该阻断真正的复制动作
            console.error(`[copy] handler ${entry.name} failed`, e);
            continue;
        }
        if (result === false) return { ...payload, text: '', html: '' };
        if (result) Object.assign(payload, result);
    }
    return payload;
}

function execCommandCopy(text: string) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        ok = false;
    } finally {
        area.remove();
    }
    return ok;
}

async function writeClipboard(payload: CopyPayload) {
    if (!payload.text) return false;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(payload.text);
            return true;
        } catch (e) {
            // 文档没有焦点或权限被拒时继续走兜底
        }
    }
    return execCommandCopy(payload.text);
}

function announce(payload: CopyPayload) {
    document.dispatchEvent(new CustomEvent('hydro/copy', { detail: payload }));
}

/**
 * 由站点自己的界面（右键菜单等）触发的复制：走同一条处理链，
 * 这样比赛模式可以统一记录所有复制行为。
 */
export async function copyFromSite(text: string, source: CopySource = 'menu', html = '') {
    const payload = prepare(text, html, source, null);
    const ok = await writeClipboard(payload);
    if (ok) announce(payload);
    return ok;
}

export function copyContext() {
    return readContext();
}

export function copyOptions() {
    return readOptions();
}

export function transformForCopy(text: string, html: string, source: CopySource, target: Element | null) {
    return prepare(text, html, source, target);
}

export function announceCopy(payload: CopyPayload) {
    announce(payload);
}
