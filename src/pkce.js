// PKCE (RFC 7636) and state for the Authorization Code flow. Pure, so Node can test it.

export function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteLength = 48) {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizeUrl({ apiBase, clientId, redirectUri, state, challenge, scope = '' }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  if (scope) params.set('scope', scope);
  return `${apiBase.replace(/\/+$/, '')}/connected/authorize?${params}`;
}
