// The app's only door to OnCloud: sign-in (Authorization Code + PKCE, public client, no secret) and /api/v1/connected/*.
// The access token is kept in memory and in sessionStorage (this tab only) so a reload keeps the session; the page's
// CSP allows no third-party script. Signing out revokes the token on the server.
import { authorizeUrl, challengeFor, randomString } from './pkce.js';

const KEY = { verifier: 'oc.pkce', state: 'oc.state', token: 'oc.token' };
let config = null;
let token = null;

export async function loadConfig() {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('config.json is missing');
  config = await res.json();
  // `npm run dev:fake` points the app at scripts/fake-oncloud.js instead of OnCloud.
  if (import.meta.env?.VITE_API_BASE) config = { ...config, api_base: import.meta.env.VITE_API_BASE, client_id: config.client_id || 'fake' };
  token = sessionStorage.getItem(KEY.token);
  return config;
}

const redirectUri = () => `${location.origin}/callback`;

// The loaded /config.json (api_base, client_id).
export const currentConfig = () => config;
// The access token, for OnCloud's runtime (startApp) — the same one api() sends.
export const currentToken = () => token;

export function signedIn() {
  return token !== null;
}

export async function signIn() {
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(KEY.verifier, verifier);
  sessionStorage.setItem(KEY.state, state);
  location.assign(authorizeUrl({
    apiBase: config.api_base,
    clientId: config.client_id,
    redirectUri: redirectUri(),
    state,
    challenge: await challengeFor(verifier),
  }));
}

// On /callback: check state, swap the code for a token, return to /. Returns true when it handled the page.
export async function handleCallback() {
  if (location.pathname !== '/callback') return false;

  const params = new URLSearchParams(location.search);
  const verifier = sessionStorage.getItem(KEY.verifier);
  const expected = sessionStorage.getItem(KEY.state);
  sessionStorage.removeItem(KEY.verifier);
  sessionStorage.removeItem(KEY.state);
  history.replaceState(null, '', '/');

  if (params.get('error')) throw new Error(params.get('error'));
  if (!params.get('code') || !verifier || params.get('state') !== expected) throw new Error('sign_in_state_mismatch');

  const res = await fetch(`${config.api_base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.client_id,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
      code: params.get('code'),
    }),
  });
  if (!res.ok) throw new Error('token_exchange_failed');

  token = (await res.json()).access_token;
  sessionStorage.setItem(KEY.token, token);
  return true;
}

// Tests and the local fake set these directly; the page reads them from /config.json.
export function configure(next, nextToken = null) {
  config = next;
  token = nextToken;
}

// The whole envelope ({data, meta}); api() below answers just its data.
export async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${config.api_base}/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    forget();
    throw new Error('signed_out');
  }

  const envelope = await res.json().catch(() => ({ success: false, code_key: 'request_failed' }));
  if (!envelope.success) {
    const error = new Error(envelope.code_key || 'request_failed');
    error.envelope = envelope;
    throw error;
  }
  return envelope;
}

export async function api(path, options) {
  return (await request(path, options)).data;
}

export async function signOut() {
  try {
    await api('/connected/logout', { method: 'POST' });
  } finally {
    forget();
  }
}

function forget() {
  token = null;
  sessionStorage.removeItem(KEY.token);
}
