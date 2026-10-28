import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { uiTags, uiOrigin } from '../scripts/ui-tags.js';

const CSS = new URL('../../oncloud-ui/dist/oncloud-ui.css', import.meta.url);

// The app's own hooks: styled in src/builder/builder.css or used only as selectors, never Tailwind classes.
const HOOKS = new Set(['toast', 'toasts', 'ok', 'bad']);

function classesInSource() {
  const files = ['src/main.js', 'src/ui.js', 'src/pickers.js', 'src/screens/host.js'];
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/class:\s*(['`])((?:(?!\1).)*)\1/g)) {
      for (const cls of m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) if (!HOOKS.has(cls)) found.set(cls, file);
    }
    // Class strings kept in constants (the picker's choice list).
    for (const m of text.matchAll(/^const [A-Z_]+ = '([^']+)'/gm)) for (const cls of m[1].split(/\s+/)) found.set(cls, file);
    for (const m of text.matchAll(/^\s+\+ '([^']+)'/gm)) for (const cls of m[1].split(/\s+/).filter(Boolean)) found.set(cls, file);
  }
  return found;
}

const selector = (cls) => `.${cls.replace(/[:/.[\]%!]/g, (c) => `\\${c}`)}`;

test('every Tailwind class the app writes is in @oncloud/ui\'s stylesheet', { skip: !existsSync(CSS) && 'needs ../oncloud-ui built' }, () => {
  const css = readFileSync(CSS, 'utf8');
  const missing = [...classesInSource()].filter(([cls]) => !css.includes(selector(cls))).map(([cls, file]) => `${cls} (${file})`);
  assert.deepEqual(missing, [], 'add them to the app kit in oncloud-ui, or use a component');
});

test('the builder\'s styles take the workspace\'s brand and the design system\'s fonts, and load nothing from elsewhere', () => {
  const css = readFileSync('src/builder/builder.css', 'utf8');
  assert.match(css, /--ember:var\(--color-brand-500/);
  assert.match(css, /--body:var\(--font-sans/);
  assert.doesNotMatch(css, /@import|url\(http|fonts\.googleapis|Anta|#ff7a3d/);
  const engine = readFileSync('src/builder/engine.js', 'utf8');
  assert.doesNotMatch(engine, /localStorage\.setItem\("oncloud\.proposals|ApexCharts|cdnjs|data:image\/jpeg;base64/);
});

test('the CDN lines: integrity and crossorigin for a pinned release, crossorigin only for a dev build', () => {
  const pinned = JSON.parse(readFileSync('ui.json', 'utf8'));
  const tags = uiTags(pinned);
  assert.ok(tags.includes(`href="${pinned.base}/oncloud-ui.css" integrity="${pinned.integrity.css}" crossorigin="anonymous"`));
  assert.ok(tags.includes(`<script type="module" src="${pinned.base}/oncloud-ui.js" integrity="${pinned.integrity.js}" crossorigin="anonymous">`));
  assert.doesNotMatch(uiTags({ base: 'http://localhost:8790/ui/dev/' }), /integrity/);
});

test('the page CSP lets in the CDN, the API and its storage, and no inline script', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const csp = Object.fromEntries(/Content-Security-Policy: (.+)/.exec(headers)[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  const cdn = uiOrigin(JSON.parse(readFileSync('ui.json', 'utf8')).base);
  assert.ok(csp['script-src'].includes(cdn));
  assert.ok(csp['style-src'].includes(cdn));
  const api = new URL(JSON.parse(readFileSync('public/config.json', 'utf8')).api_base).origin;
  for (const d of ['connect-src', 'img-src']) assert.ok(csp[d].includes(api), `${d} has ${api}`);
  // The storage the API's signed links point at (SPACES_ENDPOINT, path-style): images load from it, uploads go to it.
  const storage = csp['connect-src'].filter((o) => /^https:/.test(o) && o !== api);
  assert.ok(storage.length && storage.every((o) => csp['img-src'].includes(o)), 'img-src has the storage origin (images in the proposal)');
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
});
