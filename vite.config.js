import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { uiTags } from './scripts/ui-tags.js';

const pinned = JSON.parse(readFileSync(new URL('./ui.json', import.meta.url), 'utf8'));
const LOCAL_UI = resolve('../oncloud-ui/dist');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml' };

// @oncloud/ui: the pinned CDN release in a build; in dev, VITE_UI_BASE or the sibling repo's local build.
function oncloudUi(mode, command) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const override = env.VITE_UI_BASE || process.env.VITE_UI_BASE;
  const local = command === 'serve' && !override && existsSync(join(LOCAL_UI, 'oncloud-ui.js'));
  const tags = override ? uiTags({ base: override }) : local ? uiTags({ base: '/__ui' }) : uiTags(pinned);

  return {
    name: 'oncloud-ui',
    transformIndexHtml: (html) => html.replace('<!-- oncloud-ui -->', tags),
    configureServer(server) {
      if (!local) return;
      server.middlewares.use('/__ui', (req, res, next) => {
        const file = normalize(join(LOCAL_UI, decodeURIComponent(req.url.split('?')[0])));
        if (!file.startsWith(LOCAL_UI) || !existsSync(file)) return next();
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}

// Static output only (ADR 0043): `dist/` is what Cloudflare Pages serves.
export default defineConfig(({ mode, command }) => ({
  plugins: [oncloudUi(mode, command)],
  build: { outDir: 'dist', sourcemap: false },
  // Its own port, so it never lands on another app's 5173; strict, so it never drifts to a port OnCloud does not know.
  server: { port: 5182, strictPort: true },
  preview: { port: 5182, strictPort: true },
}));
