import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUrl, base64url, challengeFor, randomString } from '../src/pkce.js';

test('S256 challenge matches RFC 7636 Appendix B', async () => {
  assert.equal(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('verifiers are URL-safe and 43+ characters', () => {
  const v = randomString();
  assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(v, randomString());
});

test('base64url has no padding or +/', () => {
  assert.equal(base64url(new Uint8Array([251, 255, 254])), '-__-');
});

test('authorize URL names the connected door and S256', () => {
  const url = new URL(authorizeUrl({ apiBase: 'https://api.example/', clientId: 'c1', redirectUri: 'https://cv.example/callback', state: 's', challenge: 'x' }));
  assert.equal(url.pathname, '/connected/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.has('scope'), false);
});
