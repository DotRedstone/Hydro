import { CODE_THEMES } from './theme/code-themes';
import {
  CODE_FONT_SIZES, CODE_FONTS, TEXT_FONTS, toRange,
} from './theme/fonts';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ContestModel, Context, Handler, ObjectId, param, PERM, PRIV, ProblemModel, Schema,
  SettingModel, SystemModel, Types, UserModel, yaml,
} from 'hydrooj';
import convert from 'schemastery-jsonschema';
import { presetRenderers } from './backendlib/contentRenderer';
import markdown from './backendlib/markdown';
import { TemplateService } from './backendlib/template';
import {
  COLOR_MODES, isColorMode, isThemeId, pickMode, pickTheme, resolveMode, resolveTheme, THEMES,
} from './theme/themes';

class WikiHelpHandler extends Handler {
  noCheckPermView = true;

  async get() {
    this.response.template = 'wiki_help.html';
  }
}

class WikiAboutHandler extends Handler {
  noCheckPermView = true;

  async get() {
    let raw = SystemModel.get('ui-default.about') || '';
    // TODO template engine
    raw = raw.replace(/\{\{ name \}\}/g, this.domain.ui?.name || SystemModel.get('server.name')).trim();
    const lines = raw.split('\n');
    const sections: { id: string, title: string, content: string }[] = [];
    for (const line of lines) {
      if (line.startsWith('# ')) {
        const id = line.split(' ')[1];
        sections.push({
          id,
          title: line.split(id)[1].trim(),
          content: '',
        });
      } else sections[sections.length - 1].content += `${line}\n`;
    }
    this.response.template = 'about.html';
    this.response.body = { sections };
  }
}

class ThemeGuideHandler extends Handler {
  noCheckPermView = true;

  async get() {
    this.response.template = 'theme_guide.html';
  }
}

/** 登录用户写进偏好；访客写 cookie，布局渲染时读取（见 layout/html5.html）。 */
async function persistAppearance(h: Handler, $set: Record<string, string>) {
  if (h.user.hasPriv(PRIV.PRIV_USER_PROFILE)) await UserModel.setById(h.user._id, $set);
  for (const [key, value] of Object.entries($set)) {
    h.context.cookies.set(key, value, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}

class SetThemeHandler extends Handler {
  noCheckPermView = true;

  async get({ theme }) {
    // 非法值不覆盖已存的设置，只跳回
    if (!isThemeId(theme)) {
      this.back();
      return;
    }
    const raw = theme;
    // 旧链接 /set_theme/dark、/set_theme/light 拆成“默认配色 + 对应深浅”
    const $set: Record<string, string> = { theme: resolveTheme(raw).id };
    if (raw === 'dark' || raw === 'light') $set.colorMode = resolveMode(undefined, raw);
    else {
      // 旧数据只有 theme=dark、没有 colorMode 时，深浅只能从 theme 推出；
      // 改写 theme 前先把推导结果固化，否则切一次配色深色就丢了
      const stored = this.user._udoc?.colorMode || this.context.cookies.get('colorMode');
      if (!isColorMode(stored)) $set.colorMode = pickMode(this.user, this.context.cookies);
    }
    await persistAppearance(this, $set);
    this.back();
  }
}

class SetModeHandler extends Handler {
  noCheckPermView = true;

  async get({ mode }) {
    if (isColorMode(mode)) await persistAppearance(this, { colorMode: mode });
    this.back();
  }
}

class LegacyModeHandler extends Handler {
  noCheckPermView = true;

  @param('legacy', Types.Boolean)
  @param('nohint', Types.Boolean)
  async get({ }, legacy = false, nohint = false) {
    this.session.legacy = legacy;
    this.session.nohint = nohint;
    this.back();
  }
}

class MarkdownHandler extends Handler {
  noCheckPermView = true;

  async post({ text, inline = false }) {
    this.response.body = inline
      ? markdown.renderInline(text)
      : markdown.render(text);
    this.response.type = 'text/html';
    this.response.status = 200;
  }
}

class SystemConfigSchemaHandler extends Handler {
  async get() {
    const schema = convert(Schema.intersect(this.ctx.setting.settings) as any, true);
    this.response.body = schema;
  }
}

class RichMediaHandler extends Handler {
  async renderUser(domainId, payload) {
    let d = payload.domainId || domainId;
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    if (!cur.hasPerm(PERM.PERM_VIEW)) d = domainId;
    const udoc = Number.isNaN(+payload.id) ? await UserModel.getByUname(d, payload.id) : await UserModel.getById(d, +payload.id);
    return await this.renderHTML('partials/user.html', { udoc });
  }

  async renderProblem(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    let pdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM)
      ? await ProblemModel.get(payload.domainId || domainId, payload.id) || ProblemModel.default
      : ProblemModel.default;
    if (pdoc.hidden && !cur.own(pdoc) && !cur.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = ProblemModel.default;
    return await this.renderHTML('partials/problem.html', { pdoc });
  }

  async renderContest(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    const tdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST)
      ? await ContestModel.get(payload.domainId || domainId, new ObjectId(payload.id))
      : null;
    if (tdoc) return await this.renderHTML('partials/contest.html', { tdoc });
    return '';
  }

  async renderHomework(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    const tdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_HOMEWORK)
      ? await ContestModel.get(payload.domainId || domainId, new ObjectId(payload.id))
      : null;
    if (tdoc) return await this.renderHTML('partials/homework.html', { tdoc });
    return '';
  }

  async post({ domainId, items }) {
    const res: any[] = [];
    for (const item of items || []) {
      if (item.domainId && item.domainId === domainId) delete item.domainId;
      if (item.type === 'user') res.push(this.renderUser(domainId, item).catch(() => ''));
      else if (item.type === 'problem') res.push(this.renderProblem(domainId, item).catch(() => ''));
      else if (item.type === 'contest') res.push(this.renderContest(domainId, item).catch(() => ''));
      else if (item.type === 'homework') res.push(this.renderHomework(domainId, item).catch(() => ''));
      else res.push('');
    }
    this.response.body = await Promise.all(res);
  }
}

const defaultAbout = (yaml.load(readFileSync(join(__dirname, 'setting.yaml'), 'utf-8')) as any).about.value;

export const name = 'ui-default';
export const Config = Schema.object({
  serviceWorker: Schema.object({
    preload: Schema.string().default(''),
    assets: Schema.array(Schema.string()).default([]),
    domains: Schema.array(Schema.string()).default([]),
  }).description('Service worker optimization settings').experimental(),
});

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  for (const [ext, renderer] of Object.entries(presetRenderers)) {
    ctx.provideModule('contentRenderer', ext, renderer);
  }
  ctx.inject(['setting'], (c) => {
    c.setting.PreferenceSetting(
      SettingModel.Setting('setting_display', 'rounded', false, 'boolean', 'Rounded Corners'),
      SettingModel.Setting('setting_display', 'skipAnimate', false, 'boolean', 'Skip Animation'),
      SettingModel.Setting('setting_display', 'showTimeAgo', true, 'boolean', 'Enable Time Ago'),
      // 外观：配色、深浅、正文字体
      SettingModel.Setting('setting_display', 'theme', 'default',
        Object.fromEntries(THEMES.map((t) => [t.id, t.label])), 'Theme'),
      SettingModel.Setting('setting_display', 'colorMode', 'auto', { ...COLOR_MODES }, 'Color Mode'),
      SettingModel.Setting('setting_display', 'fontFamily', 'Inter', toRange(TEXT_FONTS), 'Font Family'),
      // 代码：高亮主题、代码字体与显示方式集中在一组，不用滑到页面底部
      SettingModel.Setting('setting_highlight', 'codeTheme', 'follow',
        Object.fromEntries(CODE_THEMES.map((t) => [t.id, t.label])), 'Code Theme'),
      SettingModel.Setting('setting_highlight', 'codeFontFamily', 'Source Code Pro', toRange(CODE_FONTS), 'Code Font Family'),
      SettingModel.Setting('setting_highlight', 'codeFontSize', '14', { ...CODE_FONT_SIZES }, 'Code Font Size'),
      SettingModel.Setting('setting_highlight', 'codeLigatures', false, 'boolean', 'Code Font Ligatures'),
      SettingModel.Setting('setting_markdown', 'preferredEditorType', 'sv', { sv: 'Split View', monaco: 'Monaco Editor' }, 'Preferred Editor Type'),
      SettingModel.Setting('setting_highlight', 'showInvisibleChar', false, 'boolean', 'Show Invisible Characters'),
      SettingModel.Setting('setting_highlight', 'formatCode', true, 'boolean', 'Auto Format Code'),
    );
    c.setting.SystemSetting(Schema.object({
      'ui-default': Schema.object({
        footer_extra_html: Schema.string().role('textarea').default(''),
        nav_logo_dark: Schema.string().default('/components/navigation/nav-logo-small_dark.png'),
        domainNavigation: Schema.boolean().default(true).description('Show Domain Navigation'),
        about: Schema.string().role('markdown').default(defaultAbout),
        enableScratchpad: Schema.boolean().default(true).description('Enable Scratchpad Mode'),
        copyAttribution: Schema.boolean().default(true)
          .description('Append the page source when copying text'),
        copyAttributionCode: Schema.boolean().default(false)
          .description('Append the page source when copying code blocks'),
      }),
    }));
    ctx.Route('config_schema', '/manage/config/schema.json', SystemConfigSchemaHandler, PRIV.PRIV_EDIT_SYSTEM);
  });
  if (process.env.HYDRO_CLI) return;
  ctx.Route('wiki_help', '/wiki/help', WikiHelpHandler);
  ctx.Route('wiki_about', '/wiki/about', WikiAboutHandler);
  ctx.Route('theme_guide', '/theme-guide', ThemeGuideHandler);
  ctx.Route('set_theme', '/set_theme/:theme', SetThemeHandler);
  ctx.Route('set_mode', '/set_mode/:mode', SetModeHandler);
  ctx.Route('set_legacy', '/legacy', LegacyModeHandler);
  ctx.Route('markdown', '/markdown', MarkdownHandler);
  ctx.Route('media', '/media', RichMediaHandler);
  ctx.on('handler/after/DiscussionRaw', async (that) => {
    if (that.args.render && that.response.type === 'text/markdown') {
      that.response.type = 'text/html';
      that.response.body = await markdown.render(that.response.body);
    }
  });
  // 设置页的“主题”下拉要显示当前生效的主题，否则保存其它偏好会把
  // 访客期在 cookie 里选的主题悄悄覆盖回默认值。
  ctx.on('handler/before/HomeSettings', async (that) => {
    that.user.theme = pickTheme(that.user, that.context.cookies);
    that.user.colorMode = pickMode(that.user, that.context.cookies);
  });
  ctx.on('handler/after', async (that) => {
    that.UiContext.SWConfig = {
      preload: config.serviceWorker.preload,
      hosts: [
        `http://${that.request.host}`,
        `https://${that.request.host}`,
        SystemModel.get('server.url'),
        SystemModel.get('server.cdn'),
      ],
      assets: config.serviceWorker.assets,
      domains: config.serviceWorker.domains,
    };
  });
  ctx.plugin(TemplateService);
  ctx.plugin(require('./backendlib/builder'));
}
