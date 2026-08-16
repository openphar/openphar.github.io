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
npm run dev       # Vite dev server (data served from ./data via middleware)
npm run generate  # regenerate data/{id}/*.jsonld + registry.json + search-index.json
                  # from sibling data repos, driven by registry/datasets.yml
npm run build     # vite-ssg SSG build → dist/ (copies data + ontology into dist/)
npm run preview   # serve the built dist/
```

No test suite or linter is configured.

**Data pipeline:** `registry/datasets.yml` is the declarative source of truth for every dataset (publisher, rights, repo, extraction glob). `npm run generate` walks the sibling repos (`../data-*`) per the registry and writes `data/{id}/{id}-monographs.jsonld`, `data/registry.json`, `data/search-index.json` — all committed (vendored). `./data` is canonical for builds; `../open-pharmacopoeia/{data,ontology}` are dev-time fallbacks only. Regenerate + commit after changing sibling data or the registry.

**Rights enforcement:** datasets with `rights: title-only` (USP, Ph. Eur., BP — copyrighted) are generated as `TitleIndexEntry` records containing only title/edition/category. The generator drops everything else; never add body fields for those datasets (TODO.deploy/04).

## Architecture

### Site pipeline

- Entry `src/main.js` exports `createApp = ViteSSG(App, { routes, base: '/' })` — static site generation via vite-ssg (SSR-prerendered HTML + hydration).
- `vite.config.js` `dataPlugin()` serves `/data/*` + `/ontology/*` from `./data`/`./ontology` in dev and copies them into `dist/` at build. Data is fetched at runtime as static assets, never bundled.
- `ssgOptions.includedRoutes` generates `/pharmacopoeia/{id}` + `/pharmacopoeia/{id}/{category}/{slug}` routes for every dataset file and every registry dataset (including `status: raw` ones with no data yet) — ~26k pages.
- Routes (`src/router/index.js`): `/`, `/pharmacopoeia/:publisher`, `/pharmacopoeia/:publisher/:category/:slug`, `/search`, `/compare`, `/api`, `/ontology`.
- `src/lib/registry.js` — shared fetch/cache of `/data/registry.json`; drives HomeView's dataset grid + spine wall, PharmacopoeiaView headers/banners, and restricted-entry cards.
- Search (`src/composables/useSearch.js`) loads the slim `/data/search-index.json` (titles only, all datasets) into a FlexSearch singleton; monograph detail pages fetch the full per-dataset JSON-LD on open.
- Branding: Fraunces Variable (display), IBM Plex Sans/Mono; palette + tokens in `tailwind.config.js` and `src/styles/main.css`; logo `src/components/BrandMark.vue` (three converging circles = ICH Q4 trio → harmonized layer).

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
