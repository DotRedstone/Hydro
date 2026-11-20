import { browserSupportsWebAuthnAutofill, startAuthentication } from '@simplewebauthn/browser';
import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import DomDialog from 'vj/components/dialog/DomDialog';
import { alert } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, mediaQuery, request } from 'vj/utils';

const signinDialogPage = new AutoloadPage('signinDialogPage', null, () => {
  const signInDialog = DomDialog.getOrConstruct($('.dialog--signin'), {
    cancelByClickingBack: true,
    cancelByEsc: true,
  });

  let authnInitialized = false;

  async function initPasskey() {
    if (authnInitialized || !window.isSecureContext) return;
    authnInitialized = true;
    // WebAuthn rejects IP literals and single-label hosts as RP ids; probing them
    // throws a SecurityError and used to surface as a red toast on every page load.
    const host = window.location.hostname;
    if (/^[\d.]+$/.test(host) || !host.includes('.')) return;
    const support = await browserSupportsWebAuthnAutofill();
    if (!support) return;
    const authnInfo = await request.get('/user/webauthn', { login: true });
    if (!authnInfo.authOptions) return;
    const result = await startAuthentication({ optionsJSON: authnInfo.authOptions, useBrowserAutofill: true })
      .catch((e) => {
        console.warn('[webauthn] authentication unavailable:', e);
        return null;
      });
    if (!result) return;
    try {
      const authn = await request.post('/user/webauthn', {
        result,
      });
      if (authn.url) window.location.href = authn.url;
      else if (authn.error) throw new Error(authn.error);
    } catch (err) {
      Notification.error(err.message);
      console.error(err);
    }
  }

  if (window.location.href.endsWith('/login')) initPasskey();

  function show() {
    signInDialog.show();
    initPasskey();
  }

  // don't show quick login dialog if in mobile
  if ($('[name="nav_login"]').length > 0) {
    // nav
    $('[name="nav_login"]').on('click', (ev) => {
      if (mediaQuery.isBelow(responsiveCutoff.mobile)) return;
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      show();
      ev.preventDefault();
    });
  }

  if ($('.dialog--signin').length > 0) {
    // dialog
    $('[name="dialog--signin__close"]').on('click', () => {
      signInDialog.hide();
    });
  }

  window.showSignInDialog = () => {
    if (mediaQuery.isBelow(responsiveCutoff.mobile)) {
      if ($('[name="nav_login"]').length > 0) {
        window.location.href = $('[name="nav_login"]').attr('href');
        return;
      }
    }
    show();
  };

  $('[data-lostpass]').on('click', (e) => {
    e.preventDefault();
    alert(i18n('Relax and try to remember your password.'));
  });
});

export default signinDialogPage;
