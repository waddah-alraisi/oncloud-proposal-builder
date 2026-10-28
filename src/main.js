// Proposal Builder: sign in with OnCloud (PKCE), then run on OnCloud's own runtime — the same sidebar, lists and
// records as OnCloud, in the workspace's brand and logo (@oncloud/ui startApp). The builder is src/views/builder.js.
import { el, fill } from './dom.js';
import { currentConfig, currentToken, handleCallback, loadConfig, request, signedIn, signIn, signOut } from './oncloud.js';
import { setLocale, t } from './i18n.js';
import { proposalManifest } from './manifest.js';
import { COMPONENTS } from './screens/index.js';
import { setSession } from './screens/host.js';
import { button, registerLatinNumbers, UI } from './ui.js';

const root = document.getElementById('app');

function plainPage(...content) {
  fill(root, el('main', { class: 'min-h-screen flex items-center justify-center p-6' },
    el('div', { class: 'w-full max-w-sm space-y-6 text-center' },
      el('h1', { class: UI().SECTION_HEADING }, t('title')),
      ...content)));
}

// Why the app could not start, in words a person can act on — and always a way to sign in again.
export function startFailure(e) {
  const key = e.message === 'generic.not_found' ? 'startNotFound'
    : e.message === 'appregistry.connected_refused' ? 'startRefused'
      : e.message === 'appregistry.origin_not_allowed' ? 'startOrigin'
        : e.message === 'appregistry.not_in_package' ? 'startPackage'
          : 'startFailed';
  return [
    el('p', { class: 'text-sm text-red-700 dark:text-red-300' }, t(key)),
    el('p', { class: 'text-xs text-gray-600 dark:text-gray-400', dir: 'ltr' }, `${currentConfig()?.api_base ?? ''} · ${e.message}`),
    button(t('signInAgain'), () => { signOut().catch(() => {}).finally(() => signIn()); }, { size: 'lg' }),
  ];
}

async function leave() {
  await signOut().catch(() => {});
  location.replace('/');
}

async function start() {
  if (!globalThis.OnCloudUI) {
    fill(root, el('main', {}, el('p', {}, 'OnCloud UI did not load. Check ui.json and the CDN.')));
    return;
  }
  try {
    await loadConfig();
    await handleCallback();
  } catch (e) {
    plainPage(el('p', { class: 'text-red-700' }, `${t('failed')} (${e.message})`));
    return;
  }

  if (!signedIn()) {
    plainPage(button(t('signIn'), () => signIn(), { size: 'lg' }));
    return;
  }

  let me;
  try {
    me = await request('/connected/me');
  } catch (e) {
    if (e.message === 'signed_out') return start();
    plainPage(...startFailure(e));
    return;
  }

  setLocale(me.data.user.locale);
  document.title = t('title');
  setSession({ me: me.data, settings: {} });
  fill(root);
  registerLatinNumbers();

  await UI().startApp({
    manifest: proposalManifest(),
    apiOrigin: currentConfig().api_base,
    token: currentToken(),
    me: me.data,
    components: COMPONENTS,
    onSignOut: leave,
    mount: root,
  });
}

start();
