# CLAUDE.md — oncloud-proposal-builder

## Git

Only `main`. Pull `main` before starting; a session branch is merged into `main` the same day and deleted.

## What this is

OnCloud's Proposal Builder (README.md): a connected app on `@oncloud/ui`'s runtime, in its own repo so its releases
and bugs are its own, not the platform's. Screens are declared in `src/manifest.js` (checked by OnCloud's validator in
`npm test`); the builder is `src/builder/engine.js`, mounted by `src/views/builder.js`.

- Data: the app's own collections (`schema/proposal-builder.schema.json`) and, read-only, the workspace's contacts,
  products, quotes and exchange rates (`/connected/workspace/*`, ADR 0053 in `oncloud-documentations/platform/decisions/`).
- Costs live in `sensitive` fields (blind mode, `blind_exempt_key = products.costing.view`). Never send `internal` or
  `costing` for someone blind mode covers.
- Every app label in English and Arabic (`src/i18n.js`, the test checks both), Latin digits.
- No third-party script, font or stylesheet: the CSP allows OnCloud's CDN, API and storage only.
- Docs and reports live in `~/Desktop/Sites/oncloud-documentations/` (`modules/proposals/`).
