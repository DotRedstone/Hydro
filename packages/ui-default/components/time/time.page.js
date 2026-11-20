import $ from 'jquery';
import * as timeago from 'timeago.js';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

// timeago ships en_US and zh_CN built in; the rest live behind the package's
// `./lib/*` export map, which a directory-wide require.context cannot resolve.
// List the locales this UI ships explicitly so each one stays a real module.
const timeagoLocaleLoaders = {
  ko: () => import('timeago.js/lib/lang/ko'),
  zh_TW: () => import('timeago.js/lib/lang/zh_TW'),
  en_US: () => import('timeago.js/lib/lang/en_US'),
  zh_CN: () => import('timeago.js/lib/lang/zh_CN'),
};

const localeName = i18n('timeago_locale');
const loadLocale = timeagoLocaleLoaders[localeName];
if (loadLocale) {
  loadLocale()
    .then((mod) => timeago.register(localeName, mod.default || mod))
    .catch(() => {});
}
function runRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') !== undefined) return;
    $element.attr('data-tooltip', $element.text());
    $element.attr('datetime', ($element.attr('data-timestamp') || 0) * 1000);
    $element.attr('data-has-timeago', '1');
    timeago.render(element, i18n('timeago_locale'));
  });
}

function cancelRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') === undefined) {
      return;
    }
    $element.removeAttr('data-has-timeago');
    timeago.cancel(element);
  });
}

const relativeTimePage = new AutoloadPage('relativeTimePage', () => {
  if (!UserContext.showTimeAgo) return;
  runRelativeTime($('body'));
  $(document).on('vjContentNew', (e) => runRelativeTime($(e.target)));
  $(document).on('vjContentRemove', (e) => cancelRelativeTime($(e.target)));
});

export default relativeTimePage;
