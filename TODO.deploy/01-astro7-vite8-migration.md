# TODO 01 — Migrate main site to Astro 7 + Vite 8 + Vue islands + Tailwind 4

Status: planned
Depends on: nothing
Unblocks: consistent org-wide stack; TODO 02/03 build conventions

## Why

The org mandate is one stack: **Astro 7, Vite 8, Vue islands, Tailwind 4 via `@tailwindcss/vite`**. The sibling browsers (e.g. `data-japan-pharmacopia/browser`) already use it. The main site is the outlier: Vue 3 + vue-router + vite-ssg + Vite 6 + Tailwind 3 + PostCSS. Migration removes vite-ssg (dead weight vs Astro static pages) and ships near-zero JS on content pages (Vue only where interactivity needs it — search, compare, ontology viewer).

## Target stack (pin to match sibling browsers)

```
astro ^7.1.6
vite ^8.2.0
@astrojs/vue ^7.0.2
vue ^3.5.41
tailwindcss ^4.3.3
@tailwindcss/vite ^4.3.3
```

Remove: `vite-ssg`, `@unhead/vue`, `vue-router`, `tailwindcss@3`, `postcss`, `autoprefixer`, `tailwind.config.js`, `postcss.config.js`.

## Configuration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import vue from '@astrojs/vue'

export default defineConfig({
  site: 'https://www.openphar.org',
  base: '/',              // org root site — stays '/' (only /{repo-name} browsers use subpaths)
  integrations: [vue()],
  vite: { plugins: [tailwindcss()] }
})
```

Styles move to CSS-first Tailwind 4: `@import "tailwindcss";` plus `@theme { … }` tokens replacing `tailwind.config.js`. Audit v3→v4 class renames (e.g. `shadow-sm`→`shadow-xs`, `bg-opacity-50`→ `bg-* /50`).

## Page mapping (vue-router → Astro static routes + islands)

| Current route | Astro page | Islands |
|---|---|---|
| `/` | `src/pages/index.astro` | none (stats baked at build) |
| `/pharmacopoeia/:publisher` | `src/pages/pharmacopoeia/[publisher].astro` with `getStaticPaths()` (jp, phint from registry, TODO 02) | category filter `<FilterBar client:load>` |
| `/pharmacopoeia/:publisher/:category/:slug` | `src/pages/pharmacopoeia/[publisher]/[category]/[slug].astro`, `getStaticPaths()` reads the vendored JSON-LD (replaces `ssgOptions.includedRoutes` in vite.config.js) | none |
| `/search` | `src/pages/search.astro` | `<SearchApp client:load>` (FlexSearch island) |
| `/compare` | `src/pages/compare.astro` | `<CompareApp client:load>` |
| `/ontology` | `src/pages/ontology.astro` | `<OntologyViewer client:load>` |
| `/api` | `src/pages/api.astro` | none |

- Keep the runtime `fetch('/data/...')` pattern for the 17 MB JP dataset (do NOT import it into the bundle); better: add a build step generating a slim search index (`name`, `@id`, formula, CAS) so the client downloads ~1 MB instead of 17 MB.
- `extractString()` LangString handling is duplicated in `useSearch.js`, `PharmacopoeiaView.vue`, `MonographDetailView.vue` — consolidate into one shared module during the port.
- Layout/header/footer become Astro components; meta via Astro `<head>`.
- Data vendoring stays as-is (`data/`, `ontology/` at repo root, copied into the build output); the vite `dataPlugin()` middleware is replaced by `public/` symlinks or a tiny dev middleware — decide during implementation, keep dev DX (no manual copying).

## Deploy workflow

`.github/workflows/deploy.yml` stays: `npm ci` → `npm run build` (Astro outputs to `dist/` by default) → `upload-pages-artifact path: dist`. Node 20+.

## Acceptance

- [ ] All existing routes return 200 with equivalent content
- [ ] Search and compare work as Vue islands
- [ ] `dist/` contains `data/` + `ontology/` and per-monograph HTML
- [ ] No vite-ssg / tailwind 3 / postcss artifacts remain in the repo
- [ ] Lighthouse performance ≥ current baseline on `/`
