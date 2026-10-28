// The two lines that load @oncloud/ui, written into index.html at dev and build time (vite.config.js).
//   build:   ui.json's CDN base, with its integrity hashes — the pinned, released version
//   dev:     VITE_UI_BASE if set, else the sibling ../oncloud-ui/dist served at /__ui (npm run build there once)
// A base given by VITE_UI_BASE carries no integrity: it is a build under development, not a release.
export function uiTags({ base, integrity = null }) {
  const sri = (key) => (integrity?.[key] ? ` integrity="${integrity[key]}" crossorigin="anonymous"` : ' crossorigin="anonymous"');
  const b = base.replace(/\/+$/, '');
  return [
    `<link rel="stylesheet" href="${b}/oncloud-ui.css"${sri('css')}>`,
    `<script type="module" src="${b}/oncloud-ui.js"${sri('js')}></script>`,
  ].join('\n    ');
}

export function uiOrigin(base) {
  try { return new URL(base).origin; } catch { return null; }
}
