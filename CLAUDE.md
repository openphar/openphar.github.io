# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`openphar.github.io` is the org root site of the Open Pharmacopoeia project — a Vue 3 + vite-ssg static site deployed to GitHub Pages at **www.openphar.org**. It serves as:

- The project's purpose & documentation home (what Open Pharmacopoeia is: a non-profit, unified semantic structure for pharmacopoeias based on ICH Q4 harmonization).
- A cross-publisher monograph browser/search over JSON-LD data.
- The ontology browser for the harmonized base layer.

The actual ontology and data live in the sibling repo `open-pharmacopoeia` (checked out at `../open-pharmacopoeia`); this repo only contains the site code.

## Commands

```bash
npm run dev       # Vite dev server (data served from ../open-pharmacopoeia via middleware)
npm run build     # vite-ssg SSG build → dist/ (copies data + ontology into dist/)
npm run preview   # serve the built dist/
```

No test suite or linter is configured.

**Data sources:** the build needs `data/` + `ontology/`. Resolution order (see `getDataDir()`/`getOntologyDir()` in `vite.config.js`): sibling checkout `../open-pharmacopoeia/{data,ontology}` first (local dev, always fresher), then the vendored copies in this repo (`data/jp/jp-monographs.jsonld`, `data/phint/phint-monographs.jsonld`, `ontology/`) — the CI path, since `open-pharmacopoeia` is private and its `data/` is not committed to any remote branch. Vendored copies are interim until the declarative registry pipeline lands (`TODO.deploy/02-declarative-dataset-registry.md`). If data is missing, the build succeeds but produces a site with no monographs — always check that `dist/data/` and `dist/ontology/` exist after a build.

## Architecture

### Site pipeline

- Entry `src/main.js` exports `createApp = ViteSSG(App, { routes, base: '/' })` — static site generation via vite-ssg (SSR-prerendered HTML + hydration).
- `vite.config.js` contains a custom `dataPlugin()` that does two jobs:
  - **Dev:** middleware serving `/data/*` and `/ontology/*` directly from the sibling repo (no copying needed in dev).
  - **Build:** `closeBundle()` copies `../open-pharmacopoeia/data` → `dist/data` and `../open-pharmacopoeia/ontology` → `dist/ontology`. Data files are never imported through the bundler; they are fetched at runtime as static assets.
- Dynamic routes for SSG are enumerated in `ssgOptions.includedRoutes`: it parses `jp/jp-monographs.jsonld`, filters items whose `@type` ends with `Monograph`, and emits `/pharmacopoeia/jp/{category}/{slug}` per monograph by regex-matching the `@id`.
- Routes (`src/router/index.js`): `/`, `/pharmacopoeia/:publisher`, `/pharmacopoeia/:publisher/:category/:slug` (monograph detail), `/search`, `/compare`, `/api`, `/ontology`.
- Search (`src/composables/useSearch.js`): fetches `/data/jp/jp-monographs.jsonld` on first use, builds a module-level FlexSearch `Document` index (singleton across components), then filters by publisher/category in memory.

### Data model (JSON-LD)

- Datasets are JSON-LD with a top-level `@graph`; `@context` points at `https://www.openphar.org/ontology/context/pharmacopoeia.jsonld` (served from `/ontology/context/`).
- Identity scheme: `@id` = `https://www.openphar.org/data/{publisher}/{category}/{slug}` — publisher/category/slug are derived everywhere by regex on `@id` (see `useSearch.js`, `vite.config.js`). Adding a new publisher requires updating these parsers plus the `publisherInfo` map in views.
- Monographs are recognized by `@type` ending in `Monograph` (e.g. `AminoAcidMonograph`).
- Multilingual values are language maps (`{"en": ..., "ja": ...}`); `extractString()` handles them (duplicated in `useSearch.js` and `PharmacopoeiaView.vue` — keep in sync when changing).

### Ontology layering (project model)

The ontology in `open-pharmacopoeia/ontology/` is layered:
- `core/` — harmonized base layer (pharmacopoeia, substance form, identification, units) aligned with ICH Q4.
- `quality/` — test methods / specifications.
- `publisher/` — per-publisher extension layers (`jp`, `phint`, `chp`, `ahp`, `api`, `thp`, `who`, `hkcmms`).
- `context/` — JSON-LD contexts (served verbatim at `/ontology/context/`).
- `bibliographic/` — editions.

National/kind-specific (herbal, chemical, procedures) content extends the base layer via its own module — never by modifying core.

## Deployment model (GitHub Pages)

- This repo is the `openphar` org's root Pages repo: custom domain **www.openphar.org** is configured in repo Settings → Pages (verified, HTTPS enforced, `build_type: workflow`). Deploy is `.github/workflows/deploy.yml` on push to `main`. The build is **self-contained** (vendored data; no cross-repo checkout).
- **The deployment program lives in `TODO.deploy/`** — read `TODO.deploy/00-overview.md` first. Key decisions recorded there:
  - Org-wide stack mandate: **Astro 7 + Vite 8 + Vue islands + Tailwind 4** (`@tailwindcss/vite`). This site's current Vue/vite-ssg stack is interim until `TODO.deploy/01` lands.
  - Declarative dataset registry (`datasets.yml`) replaces convention/hard-coding for what deploys and with what rights (`TODO.deploy/02`).
  - USP / Ph. Eur. / BP content is **never deployed** — title-only cross-links against ICH Q4 and public pharmacopoeias (`TODO.deploy/04`).
  - Future Cloudflare Pages/Workers private tier for restricted datasets (`TODO.deploy/05`).
- **Sibling browsers deploy as project pages:** each public repo under the org with Pages enabled serves at `www.openphar.org/{repo-name}`. Those browsers need `base: '/{repo-name}/'` and static output. The org is on the **Free plan**: Pages only serves from public repos.

## Gotchas

- A successful build with missing data is silent — verify `dist/data/jp/jp-monographs.jsonld` exists.
- `base: '/'` in both `vite.config.js` and `ViteSSG(...)` must stay `/` for this repo (root org site). Subpath serving is only for the sibling project-page browsers.
- Astro browsers using `output: "server"` cannot deploy to GitHub Pages; they must be static.
- Several sibling repos have no git remote yet and/or no browser — see `../` when scoping deployment work.
