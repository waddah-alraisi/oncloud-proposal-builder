# OnCloud Proposal Builder

A connected app on OnCloud: the proposal builder (`oncloud-proposal-builder.html`, schema v4) moved onto OnCloud's
runtime and data. A static single-page app (Vite + plain JavaScript) that signs in with OnCloud and keeps everything
in OnCloud through `/api/v1/connected/*`. No server, no secret: OnCloud is the backend.

- **Looks like OnCloud:** `@oncloud/ui` from OnCloud's CDN (`ui.json` pins the release): the same sidebar, lists,
  dialogs and buttons as OnCloud, in the workspace's brand colour and font. The workspace's logo is on the cover and in
  every page footer.
- **Linked to the workspace (read-only, ADR 0053):** pick the client from **Contacts**; add subscription and
  implementation lines from **Products** at their price in the proposal's currency; **build a proposal from a quote**
  (client, currency, validity, VAT and the quote's lines); load the costing's **exchange rates** from Sales. A link
  shows only when the app holds the scope and the person may read that module in OnCloud.
- **Costs stay internal:** a proposal's costing and the company's rate card live in fields OnCloud hides from anyone
  without the workspace's `products.costing.view` key (blind mode). They never print and never leave in a client export.
- **Prints as before:** A4 sheets, paginated in the browser; **Print / PDF** prints the sheets alone.

## Run it locally

```sh
npm install
npm run dev      # http://127.0.0.1:5182, against the OnCloud in public/config.json
npm test         # the manifest against OnCloud's validator, the builder in jsdom, the record mapping, the CSP
npm run build    # static output in dist/
```

Tests and `npm run dev` read `../oncloud-ui` when it is checked out beside this repo (`npm install && npm run build`
there once). Against a local OnCloud on port 8000:

```sh
# OnCloud's .env: CORS_ALLOWED_ORIGINS=…,http://127.0.0.1:5182 — then php artisan optimize:clear
ADMIN_EMAIL=sara@demo.oncloud.example ADMIN_PASSWORD=… python3 scripts/local-setup.py --sample
VITE_API_BASE=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

`local-setup.py` registers the app (or updates it), publishes `schema/proposal-builder.schema.json`, turns blind mode
on for costs, and with `--sample` adds a client, two priced products, a quote and a USD rate. It prints the client id
for `public/config.json`, and an app token: if sign-in cannot come back to `127.0.0.1`, paste it in the console on the
app's page — `sessionStorage.setItem('oc.token', '…'); location.reload();`.

`public/config.json` holds the only two settings, both public:

| Key | Value |
|---|---|
| `api_base` | OnCloud API origin, e.g. `https://api.oncloud.om` |
| `client_id` | the app's public client id (a connected app is a public client, ADR 0045: never a secret here) |

## Set it up in OnCloud

1. Register a connected app, tier **Full**, scopes `identity:read data:rw drive:rw contacts:r products:r sales:r`;
   allowed origin and redirect: this app's address and `…/callback`.
2. Publish `schema/proposal-builder.schema.json` (`PUT /connected-apps/{id}/schemas/draft`, then `…/schemas/{v}/publish`).
3. Costs: `PUT /connected-installs/{id}/settings {"blind_mode": true, "blind_exempt_key": "products.costing.view"}`.
   Without it, everyone who opens the app sees the costing.
   **Make a proposal** on a quote in OnCloud: the app's `record_links` —
   `[{"on": "sales.quote", "purpose": "proposal", "path": "/proposals/from-quote/{id}"}]` (ADR 0054). The route builds
   a draft from the quote, or opens the one already built from it.
4. To offer it to other workspaces: submit it for review; once public, the platform sells it in a package —
   `PUT /platform/connected-apps/{id}/package {"entitlement_key": "apps.proposal_builder"}` — and a plan, an add-on or
   a grant to one workspace (`POST /platform/tenants/{id}/entitlements`) decides who has it.
5. Deploy `dist/` on Cloudflare Pages (`npm run build`, output `dist`, `NODE_VERSION=22`). `public/_headers` and
   `public/config.json` point at production (`api.oncloud.om`, `cdn.oncloud.om`, `sgp1.digitaloceanspaces.com`).
   Production test steps: `oncloud-documentations/modules/proposals/RUNBOOK-production-test.md`.

## Where things are

| | |
|---|---|
| `src/builder/engine.js` | the builder itself: steps, costing, P&L, cash, the A4 document (the original script; its storage, chrome and images moved onto OnCloud) |
| `src/builder/links.js` | contacts, products, quotes and exchange rates as proposal data |
| `src/builder/form-ar.js`, `form-i18n.js` | the builder's form in Arabic, and what applies it as the form is drawn |
| `src/builder/builder.css` | the builder's styles, scoped under `.pb`, in the workspace's brand |
| `src/views/builder.js` | one proposal: loads it, hands the engine its `io`, saves on the record's revision |
| `src/record.js` | a proposal ⇄ a `proposal` row; the company profile ⇄ the `company` row |
| `src/manifest.js` | the app's screens in OnCloud's manifest format (the proposals list, the builder, the menu) |
| `schema/proposal-builder.schema.json` | the app's collections: `proposal`, `company` |

Languages: the whole app follows the reader's OnCloud language, English or Arabic (right to left). The app's own words
are in `src/i18n.js`; the builder's form — the 11 steps, the costing panel, the company profile, its messages — is
written in English in the engine and shown in Arabic from `src/builder/form-ar.js` (exact text, plus templates for
text with numbers or names). `test/form-ar.test.js` draws every step in three states and fails on any English left:
**a new or reworded English string in the engine needs its Arabic there.** The printed document is separate: it
prints in the proposal's language (English, Arabic or both), whatever the reader's.
