import Prism from 'prismjs'; // eslint-disable-line

import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/toolbar/prism-toolbar.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/plugins/line-highlight/prism-line-highlight';

import $ from 'jquery';
import components from 'prismjs/components';
import getLoader from 'prismjs/dependencies';
import { copyFromSite } from 'vj/components/copy/copy';
import Notification from 'vj/components/notification/index';
import { i18n } from 'vj/utils';
import languageMeta from './meta';

const files = require.context('prismjs/components/', true, /prism-[a-z0-9-]+\.js/);
const loadedLanguages = new Set();
function loadLanguages() {
  const languages = Object.keys(components.languages).filter((l) => l !== 'meta');
  const loaded = [...loadedLanguages, ...Object.keys(Prism.languages)];
  getLoader(components, languages, loaded).load((lang) => {
    files(`./prism-${lang}.js`);
    loadedLanguages.add(lang);
  });
}

const languageExtMap = {};
loadLanguages();
// Map possible language names to Prism language name
languageMeta.forEach((meta) => {
  for (let i = 0; i < meta.ext.length; ++i) {
    if (Prism.languages[meta.ext[i]] !== undefined) {
      meta.target = meta.ext[i];
      break;
    }
  }
  meta.ext.forEach((ext) => {
    languageExtMap[ext] = meta.target;
  });
});

// Copy to Clipboard
//
// 上游这里是一个写着 Copy 的纯文字链接，字体图标没加载时看起来就像退化了。
// 现在改成图标按钮：文字只留在 title / aria-label 里，复制动作走 components/copy 管线，
// 这样比赛模式（水印、禁用复制）也能接管代码块的复制。
Prism.plugins.toolbar.registerButton('copy-to-clipboard', (env) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-item__copy';
  button.title = i18n('Copy code');
  button.setAttribute('aria-label', i18n('Copy code'));

  const icon = document.createElement('span');
  icon.className = 'icon icon-copy';
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);

  let timer;
  button.addEventListener('click', async () => {
    const ok = await copyFromSite(env.code, 'code');
    if (!ok) {
      Notification.error(i18n('Copy failed :('));
      return;
    }
    Notification.success(i18n('Content copied to clipboard!'), 1000);
    icon.className = 'icon icon-check';
    button.classList.add('is-copied');
    clearTimeout(timer);
    timer = setTimeout(() => {
      icon.className = 'icon icon-copy';
      button.classList.remove('is-copied');
    }, 1200);
  });
  return button;
});

const invisibles = {
  tab: /\t/,
  crlf: /\r\n/,
  lf: /\n/,
  cr: /\r/,
  space: / /,
};

function addInvisibles(grammar) {
  if (!grammar || grammar.tab) return;
  for (const name in invisibles) {
    if (Object.hasOwn(invisibles, name)) {
      grammar[name] = invisibles[name];
    }
  }
  for (const name in grammar) {
    if (Object.hasOwn(grammar, name) && !invisibles[name]) {
      if (name === 'rest') addInvisibles(grammar.rest);
      else handlerInvisiblesToken(grammar, name); // eslint-disable-line ts/no-use-before-define
    }
  }
}

function handlerInvisiblesToken(tokens, name) {
  const value = tokens[name];
  if (!value) return;
  const type = Prism.util.type(value);
  if (type === 'RegExp') {
    const inside = {};
    tokens[name] = { pattern: value, inside };
    addInvisibles(inside);
  } else if (type === 'Array') {
    for (let i = 0, l = value.length; i < l; i++) handlerInvisiblesToken(value, i);
  } else {
    value.inside ||= {};
    addInvisibles(value.inside);
  }
}

Prism.hooks.add('before-highlight', (env) => {
  if (UserContext.showInvisibleChar) addInvisibles(env.grammar);
});

const prismjsApiWrap = {
  highlightBlocks: ($dom) => {
    $dom.find('pre code').get().forEach((code) => {
      const $code = $(code);
      const $pre = $code.parent();
      $pre.addClass('syntax-hl');
      const language = ($(code).attr('class') || '').trim();
      // try to map the language name
      const m = language.match(/language-([a-z]+)/);
      if (m && m[1]) {
        const languageName = m[1].toLowerCase();
        if (languageExtMap[languageName]) {
          $(code).attr('class', `language-${languageExtMap[languageName]}`);
        }
      }
      Prism.highlightElement(code);
    });
  },
  highlight: (text, grammar, language) => Prism.highlight(text, grammar, language),
  Prism,
};

export default prismjsApiWrap;
