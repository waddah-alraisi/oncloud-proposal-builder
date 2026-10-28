// Turns one of this app's views into a screen OnCloud's runtime can show — a `kind: "app"` screen in the manifest,
// full page or as a record's tab. A view is `async (ctx) => Node`; ctx carries what the views always had.
import { el } from '../dom.js';
import { setLocale, t } from '../i18n.js';
import { toaster, UI } from '../ui.js';

let session = { me: null, settings: {} };
export const setSession = (next) => { session = next; };
export const currentSession = () => session;

let toastFn = null;
function toast(...args) {
  if (!toastFn) {
    const region = el('div', { class: 'toasts fixed bottom-4 end-4 z-10 flex flex-col gap-2 max-w-sm', 'aria-live': 'assertive' });
    document.body.append(region);
    toastFn = toaster(region);
  }
  return toastFn(...args);
}

// The app screens on the page now: a record's tabs, redrawn together when one changes something the others show.
const live = new Set();

export function appScreen(view) {
  return (cfg) => {
    const { ShellScreen, Shell } = UI();
    return class AppScreen extends ShellScreen {
      static ownsGroups = cfg.ownsGroups === true;

      async load(ctx) {
        this.shellCtx = ctx;
        this.node = await this.render();
      }

      async render() {
        const shellCtx = this.shellCtx ?? this.ctx ?? {};
        // The language the runtime settled on (the person's, else the workspace's), for this app's own words.
        if (document.documentElement.lang) setLocale(document.documentElement.lang);
        try {
          return await view({
            params: shellCtx.params ?? {},
            query: new URLSearchParams(location.search),
            me: session.me,
            settings: session.settings ?? {},
            cache: new Map(),
            toast,
            go: (path) => Shell.navigate(path),
            // refresh(): this screen. refreshAll(): as a record's tab, the whole record — for a change other tabs depend on
            // (a change other tabs show) — without redrawing a form someone is still typing in on every save.
            refresh: () => this.redraw(),
            refreshAll: async () => {
              for (const screen of [...live]) if (!screen.holder?.isConnected) live.delete(screen);
              await Promise.all([...live].map((screen) => screen.redraw()));
              if (!live.has(this)) await this.redraw();
              Shell.activeScreen?.refresh?.();
            },
            embedded: Boolean(shellCtx.embedded || shellCtx.withRecord),
            props: cfg.props ?? {},
          });
        } catch (e) {
          if (e.message === 'signed_out') throw e;
          return el('p', { class: 'text-sm text-red-700 dark:text-red-300' }, `${t('failed')} (${e.message})`);
        }
      }

      mount(holder) {
        this.holder = holder;
        // Typing in this screen's own forms (the builder) saves through this screen. It is not an edit
        // of the record around it, whose leave guard would otherwise ask to save a record nobody changed.
        if (!holder.dataset.appScreen) {
          for (const type of ['input', 'change']) holder.addEventListener(type, (e) => e.stopPropagation());
          holder.dataset.appScreen = '1';
        }
        holder.replaceChildren(this.node);
        live.add(this);
      }

      destroy() {
        live.delete(this);
        // A view that holds the page's listeners (the builder: resize, print, autosave) lets go of them here.
        this.node?.onDestroy?.();
      }

      async redraw() {
        this.node = await this.render();
        this.holder?.replaceChildren(this.node);
      }

      async refresh() {
        return this.redraw();
      }
    };
  };
}
