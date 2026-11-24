import $ from 'jquery';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';

const highlighterPage = new AutoloadPage('highlighterPage', () => {
  import('./prismjs').then(({ default: prismjs }) => {
    // 从 Codeforces 等站点导入的题面常把样例写成 <pre>1<br /></pre>：没有 <code>、换行靠 <br>，
    // 高亮与复制按钮都只认 pre code，于是样例没有按钮；导入时还会残留空的 <pre><code></code></pre>，
    // 反而多出几个空复制按钮。这里只在题面（.richmedia）里把两种情况规整掉，不动编辑器等其它区域。
    function normalizeBlocks($container) {
      const $scope = $container.is('.richmedia') ? $container : $container.find('.richmedia');
      $scope.find('pre').add($container.filter('.richmedia pre')).get().forEach((pre) => {
        if (pre.closest('.cm-editor, .monaco-editor, .md-editor, [contenteditable]')) return;
        const code = pre.querySelector(':scope > code');
        if (code) {
          if (!code.textContent.trim()) pre.remove();
          return;
        }
        if (pre.querySelector('*:not(br)')) return; // 带其它标记的预排版内容保持原样
        pre.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        const text = pre.textContent.replace(/\n$/, '');
        if (!text.trim()) {
          pre.remove();
          return;
        }
        const wrapper = document.createElement('code');
        wrapper.textContent = text;
        pre.replaceChildren(wrapper);
      });
    }

    function runHighlight($container) {
      normalizeBlocks($container);
      $container.find('pre code').get().forEach((code) => {
        const language = ($(code).attr('class') || '').trim();
        if (language.includes('line-numbers')) $(code).parent().addClass('line-numbers');
        const m = language.match(/language-([a-z0-9]+)(\|[\d,-]+)/);
        if (m?.[2]) {
          $(code).parent().attr('data-line', m[2].substring(1));
          $(code).attr('class', `language-${m[1]}`);
        }
      });
      prismjs.highlightBlocks($container);
      $container.find('pre code').get().forEach((code) => {
        const $code = $(code);
        const $root = $code.parent().parent();
        const $typo = $code.closest('.richmedia');
        const language = ($(code).attr('class') || '').trim();
        const m = language.match(/language-input([0-9]+)/);
        if (m?.[1]) {
          const id = +m[1];
          if (Number.isSafeInteger(id)) {
            const $output = ($typo.length ? $typo : $container).find(`pre.language-output${id}`);
            if ($output.length) {
              const $c = $(document.createElement('div')).addClass('row');
              $root.after($c);
              $root.prepend($(tpl`<h2>${i18n('Sample Input')} ${id}</h2>`))
                .addClass('medium-6 columns sample').appendTo($c);
              $output.parent().prepend($(tpl`<h2>${i18n('Sample Output')} ${id}</h2>`))
                .addClass('medium-6 columns sample').appendTo($c);
            }
            if ($root.find('.scratchpad-fill-button').length) return;
            const $toolbar = $root.find('.toolbar');
            const $button = $(tpl`
              <div class="toolbar-item scratchpad-fill-button">
                <a href="javascript:;">${i18n('Fill to Pretest')}</a>
              </div>
            `);
            $button.on('click', (e) => {
              const store = (window as any).store;
              if (!store) return;
              e.preventDefault();
              try {
                store.dispatch({
                  type: 'SCRATCHPAD_PRETEST_DATA_CHANGE',
                  payload: {
                    type: 'input',
                    value: $code.text(),
                  },
                });
                Notification.success(i18n('Input filled to pretest!'), 2000);
              } catch (err) {
                Notification.error(i18n('Failed to fill input'));
              }
            });
            $toolbar.append($button);
          }
        }
      });
    }

    runHighlight($('body'));
    $(document).on('vjContentNew', (e) => runHighlight($(e.target)));
  });
});

export default highlighterPage;
