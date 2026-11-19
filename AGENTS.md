# Hydro Fork 协作指南

本仓库是 Hydro 的二开分支：前端统一走 `packages/ui-default` 的暖纸编辑风主题，
服务端保持与上游 `packages/hydrooj` 兼容。约定参考 dotfiles 仓库的同名规范，
针对本仓库做了收敛。

## 分支

- 改动从当前开发分支切出短生命周期分支，合并后删除。
- 命名 `<type>/<scope>-<subject>`，`type` 与提交类型一致，`scope` 用小写短词：
  `feat/auth-login-flow`、`fix/ui-dialog-close`、`docs/ui-conventions`。
- 不直接在共享分支上堆零散改动；一次功能一个分支。
- 只为交付某个修复而临时试验的分支用完即删，不在仓库里留死分支。

## 提交

- 采用 Conventional Commits，标题用中文写清“做了什么”：
  `feat(auth): 登录支持用户名或邮箱` / `fix(ui): 登录弹窗关闭改用图标按钮`。
- 类型只用 `feat` `fix` `chore` `docs` `security` `refactor` `test`；不写 emoji、不写
  “update”“fix bug”这类无信息标题。
- 标题控制在 50 字内，不加句号；细节写进正文：为什么改、影响哪些页面、如何验证。
- 纯文档、纯重构、行为改动分别提交，避免一个提交里既有格式化又有新功能。
- 一次提交只做一件事；跨 `ui-default` 模板与 `hydrooj` 服务端的行为改动可以在一个
  提交里，但要在正文里点明两侧都验证过。
- 不提交本地实例状态：`~/.hydro/addon.json`、`system` 集合里的站点设置、种子数据
  产物、截图与日志。

## 验证

改动后至少跑：

```bash
~/.local/bin/hydro-web ui                          # 重建前端资源并重启（Hydro 启动时快照资源清单）
node packages/ui-default/build/check-tokens.js     # 期望 design tokens: ok
```

- 改了 `locales/*.yaml`：确认没有重复键，否则整个 ui-default addon 加载失败、所有页面退回
  JSON。
- 改了模板：用浏览器（或 CDP 截图）确认目标页面 200 且控制台无异常，再截图对比。
- 改了服务端 handler：用 curl 或脚本覆盖成功、失败、限流三条路径。
- 只验证了其中一侧时，不要声称整体通过。

## 前端结构与交互约定

新增交互按固定位置放，避免同类逻辑散落在页面里：

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 交互逻辑 | `components/<feature>/<feature>.page.js` | 用 `AutoloadPage` 注册，不用模块副作用 |
| 交互样式 | `components/<feature>/<feature>.page.styl` | 与 `.page.js` 成对，`require.context` 自动打进样式包 |
| 标记与文案 | `templates/partials/<feature>.html` | 只放 HTML 与 `_()` 文案，动作在 JS 里按 `data-*` 查找 |
| 页面骨架 | `templates/layout/*.html` | 只做 include，不写逻辑 |
| 页面专属样式 | `pages/<page>.page.styl` | 只写该页面选择器，不放全局规则 |
| 全局层样式 | `theme/claude-*.styl` | `foundation` 基础排版与卡片、`navigation` 导航、`authoring` 编辑器与表单、`motion` 动效 |
| 文案 | `locales/*.yaml` | 新增键同时补 `ui-default` 与 `hydrooj` 两份，且不得重复 |

现有交互组件：`consent`（首次访问的 Cookie 说明）、`contextmenu`（右键菜单）、
`theme/fab`（右下角搜索/主题/回到顶部）、`signin`（登录页与登录弹窗）。

### 右键菜单

- 只在存在精确指针（`pointer: fine`）时接管；纯触屏设备保留系统长按菜单。
- 输入框、`contenteditable`、代码编辑器（`.cm-editor` / `.monaco-editor` / `.md-editor`）
  一律不接管；按住 Shift 右键同样交回浏览器原生菜单。
- 菜单项按组出现（历史 / 剪贴板 / 打开 / 视图 / 站点），没有可用动作的组整体隐藏。
- 键盘可用：打开后焦点落在第一项，`↑` `↓` `Home` `End` 移动，`Esc` 关闭。
- 复制失败要给出提示，不能静默失败。

### 复制管线

所有把文字放进剪贴板的动作都走 `components/copy`，不要在别处直接写 `clipboard.writeText`：

- 默认行为：复制正文追加一行来源（`ui-default.copyAttribution` 可关），代码块默认不追加
  （`ui-default.copyAttributionCode` 可开）；输入框、contenteditable、编辑器内不接管
- 需要新行为时注册 handler，而不是改核心：

```ts
import { registerCopyHandler } from 'vj/components/copy/copy';

registerCopyHandler('contest-guard', (payload) => {
  payload.options.attribution = false;      // 比赛里不追加来源
  payload.text = watermark(payload.text);   // 或者加水印
}, 100);                                    // 数字越大越先执行
```

- handler 返回 `false` 放弃本次复制，返回对象替换 payload；默认来源追加是优先级 -100 的
  普通 handler，不享受特权
- 管线结束后派发 `hydro/copy` 事件，`detail` 含 `text` / `html` / `source` /
  `context`（`domainId`、`problemId`、`contestId`）；只观察不改写的功能（上报、统计）用它
- 页面标识来自 `templates/partials/copy_context.html` 的 `data-copy-*`，不要在各页面里
  重复拼装标题与地址

## 目录边界

- `packages/ui-default/templates/`：Nunjucks 模板；页面专属 class 放在 `pages/*.page.styl`。
- `packages/ui-default/components/`：可复用片段，`*.page.js` 会被全局打包。
- `packages/ui-default/theme/`：设计令牌与主题；字面色值只允许出现在
  `theme/palettes/*.css`（默认 `claude.css`、深色同文件、额外的如 `sepia.css`）。
- 主题清单只有 `theme/themes.ts` 一份（id / 显示名 / 是否深色 / 地址栏取色）：
  加主题 = 一个调色板文件 + 那里加一项 + `theme/default.js` 里 import，
  服务端路由、设置项、页脚菜单、前端切换都从它派生，不要在别处再写死列表。
- `packages/hydrooj/src/handler/`、`src/model/`：服务端行为；改公共流程时同步检查 API 调用方。
- `packages/login-with-*`：OAuth provider，插件作用域就是配置键前缀。

## 认证相关配置

站点设置存在 `system` 集合的 `config` 文档（YAML 字符串），改动通过 `/manage/config` 或
`settings.setConfig` 完成，不要在库里手写零散键值。

| 键 | 作用 |
| --- | --- |
| `smtp.verify` / `smtp.user` / `smtp.pass` / `smtp.host` / `smtp.port` / `smtp.from` | 注册验证邮件 |
| `smtp.devOutbox` | 开发用：邮件写到 `~/.hydro/outbox/*.html`，不连 SMTP |
| `login-with-github.id` / `login-with-github.secret` | GitHub OAuth App；为空时登录页不显示该按钮 |

启用 addon 时注意 `~/.hydro/addon.json` 是**完整列表**，写入时会覆盖原有内容，
`@hydrooj/ui-default` 不能丢。
