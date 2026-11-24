import $ from 'jquery';
import { renderLanguageSelect } from 'vj/components/languageselect';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, getAvailableLangs, i18n, tpl,
} from 'vj/utils';

async function initCodeLangHelper() {
  const $el = $(tpl`<div class="row" id="codelang-select"></div>`);
  $('[name="codeLang"]')
    .parent().parent().parent()
    .parent()
    .hide()
    .after($el);

  const main = {};
  for (const key in window.LANGS) {
    if (!key.includes('.') && !window.LANGS[key].hidden) main[key] = window.LANGS[key].display;
  }

  await delay(50);
  renderLanguageSelect(
    document.getElementById('codelang-select'),
    $('[name="codeLang"]'),
    getAvailableLangs(),
    main,
    [$('[name="codeLang"]').val()],
  );
}

function supportFontFamily(f) {
  const h = 'Arial';
  if (f.toLowerCase() === h.toLowerCase()) return true;
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';
  const g = (j) => {
    ctx.clearRect(0, 0, 100, 100);
    ctx.font = `100px ${j}, ${h}`;
    ctx.fillText('a', 50, 50);
    const k = ctx.getImageData(0, 0, 100, 100).data;
    return [].slice.call(k).filter((l) => l !== 0);
  };
  return g(h).join('') !== g(f).join('');
}

const page = new NamedPage('home_preference', () => {
  initCodeLangHelper();
  // @fontsource 字体按需下载：先强制加载再检测，检测不到标“未安装”，不再隐藏
  const options = $('[name="fontFamily"] option, [name="codeFontFamily"] option');
  options.each(function () {
    this.style.fontFamily = this.getAttribute('value');
    this.textContent = i18n(this.textContent.trim());
    this.dataset.label = this.textContent;
  });
  const mark = () => options.each(function () {
    const ok = this.value === 'sans' || supportFontFamily(`"${this.value}"`);
    this.textContent = ok ? this.dataset.label : `${this.dataset.label}（${i18n('Not Installed')}）`;
  });
  Promise.allSettled(options.toArray().map((o) => document.fonts.load(`16px "${o.value}"`))).then(mark);
  function updateFont() {
    this.style.fontFamily = $(this).val();
  }
  $('[name="fontFamily"], [name="codeFontFamily"]').on('change', updateFont).each(updateFont);
});

export default page;
