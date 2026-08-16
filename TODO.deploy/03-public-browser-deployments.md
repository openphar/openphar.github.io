# TODO 03 — Public browser deployments on GitHub Pages

Status: planned
Depends on: TODO 02 (registry declares what deploys); stack fixes per repo
Goal: every deployable dataset serves at `https://www.openphar.org/{repo-name}/`

## Deployable datasets (rights: full content)

Japanese, International, Chinese, Korean, Thai, Indian (IP + API/AYP), HK CMMS, ICH Q4 — all freely accessible online sources. **Not** USP / Ph. Eur. / BP (TODO 04).

## Mechanics (GitHub Pages, org Free plan)

1. Repo must be **public** (Free plan: Pages = public repos only). Flip visibility per-repo as content is confirmed deployable.
2. Repo needs `.github/workflows/deploy-pages.yml` (template below), building the `browser/` subproject (or repo root for `chp-browser` / `openphar-browser`).
3. Enable Pages once: `gh api -X POST repos/openphar/{repo}/pages -f build_type=workflow` (no cname — project pages inherit the org's `www.openphar.org` domain automatically and serve at `/{repo-name}/`).
4. Browser Astro config must set `site: 'https://www.openphar.org'` and `base: '/{repo-name}/'`, `output: static` (JP browser currently has `output: 'server'` — incompatible with Pages).

### Workflow template (per repo)

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: browser/package-lock.json }
      - name: Build browser
        working-directory: browser
        run: |
          npm ci
          npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: browser/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`working-directory`/`path` become `.` for root-level browsers (`chp-browser`, `openphar-browser`).

## Per-repo work

| Order | Repo | Work |
|---|---|---|
| 1 | `data-japan-pharmacopia` | Fix `output: 'server'` → static; add `base`/`site`; workflow (self-contained — `load-data.mjs` reads the repo's own `data/`); ICH Q4B enrichment currently needs the sibling repo: vendor `equivalence/methods.yaml` or make `data-ich-q4` public + checkout; make repo public |
| 2 | `data-ich-q4` | Create browser (template: `openphar-browser`) exposing ICH Q4B equivalence tables; make public (source docs are free on ich.org) |
| 3 | `data-international-pharmacopoeia` | Create remote → push; create browser; make public |
| 4 | `data-korea-pharmacopoeia` | Create remote → push; fix `base`; workflow; make public |
| 5 | `data-thai-pharmacopoeia` | Create remote → push; create browser; make public |
| 6 | `chp-browser` + `data-china-pharmacopoeia` | **Consolidate**: either move `chp-browser`'s app into `data-china-pharmacopoeia/browser/` or keep two repos with distinct scopes — decide, then deploy under `/data-china-pharmacopoeia/` (chp-browser gets a remote first) |
| 7 | `data-india-pharmacopoeia` | Fix `base`; workflow; make public |
| 8 | `data-india-ayurvedic-pharmacopoeia` | Create remote → push; create browser; make public |
| 9 | `data-hkcmms` | Remote currently points at **sipmorg** org — move repo to `openphar` org; create browser; make public |

All created browsers use the mandated stack (Astro 7 / Vite 8 / Vue islands / Tailwind 4) and the `openphar-browser` repo as the template, reading dataset config from the registry (TODO 02).

## Main-site integration

- `HomeView`/nav gains a "Browsers" section linking each `https://www.openphar.org/{repo-name}/` (generated from the registry).
- Each browser's header links back to `www.openphar.org`.

## Acceptance (per repo)

- [ ] `https://www.openphar.org/{repo-name}/` serves the browser
- [ ] Subpath routing works (deep links, assets) — proves `base` is correct
- [ ] Repo public; workflow green; Pages build_type=workflow
- [ ] Linked from the main site
