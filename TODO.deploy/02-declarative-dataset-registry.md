# TODO 02 — Declarative dataset registry (explicit configuration, not convention)

Status: **in progress** — `registry/datasets.yml` + `scripts/generate-datasets.mjs` + `data/registry.json` are live in the main site repo and drive the site (2026-08-16). Remaining: JSON-Schema validation in CI, retirement of vendored jp/phint files in favor of registry-driven upstream fetch, promotion to a dedicated repo when the Cloudflare tier lands.
Depends on: TODO 01 (stack) — schema can be drafted in parallel
Unblocks: TODO 03 (what deploys where), TODO 04 (linking rights), TODO 05 (private tier)

## Problem

Today, what the sites build and deploy is determined by convention and hard-coded knowledge scattered across repos: `useSearch.js` hard-codes `/jp/` and `/phint/` URL sniffing, `PharmacopoeiaView.vue` hard-codes a `publisherInfo` map, `vite.config.js` hard-codes `../open-pharmacopoeia` paths, the JP browser hard-codes `JP15..JP19` editions and an optional `${ICH_Q4B_PATH}` sibling, and repo names imply publishers. Adding a dataset means touching N files in M repos, and there is no single place that answers "what data do we have, under what rights, served where, at what quality?"

## Requirement

> "A fully consistent way of using declarative/explicit configuration (not convention) on what datasets to improve."

One machine-readable registry declares every dataset. Every consumer (main site build, per-repo browser builds, deploy tooling, future Cloudflare worker) reads the registry and nothing else. **No inference from repo names, directory layouts, or file presence.**

## Location & distribution

- Authoritative file: `registry/datasets.yml` in **this repo** (public, already the hub every deployment links to).
- Validate with a JSON Schema (`registry/datasets.schema.json`) in CI on every push.
- Consumers fetch it at build time (raw GitHub URL or repo checkout). When the Cloudflare tier lands (TODO 05), promote it to a dedicated `openphar/registry` repo if cross-repo write access becomes a problem.

## Schema (draft)

```yaml
version: 1

datasets:
  jp:
    name: Japanese Pharmacopoeia
    publisher:
      id: jp
      organization: Ministry of Health, Labour and Welfare (PMDA)
      country: JP
      currentEdition: "18"
    source:
      official: https://www.pmda.go.jp/english/rs-sb-std/jp.html
      rights:
        mode: full                # full | title-only | none
        license: Japanese government publication; freely accessible online
        contentDeployable: true   # may appear on GitHub Pages
    repository:
      org: openphar
      name: data-japan-pharmacopia
      visibility: public          # required public for GH Pages (org Free plan)
    browser:
      path: /data-japan-pharmacopia/
      stack: astro7
      status: exists              # exists | template | missing
    harmonization:
      ontologyLayers: [core, quality, publisher/jp]
      ichQ4bCrosswalk: true
    pipeline:
      ingestion: complete         # none | raw | structured | harmonized | validated
      quality: [monographs ~2k extracted, bilingual ja/en]
    languages: [ja, en]

  us:
    name: United States Pharmacopeia–NF
    publisher: { id: us, organization: USP, country: US }
    source:
      official: https://www.usp.org
      rights:
        mode: title-only          # NEVER deploy body text
        contentDeployable: false
        license: Copyrighted; titles/index metadata + ICH Q4B mapping only
    repository: { org: openphar, name: data-us-pharmacopoeia, visibility: private }
    browser: null                 # private tier only (TODO 05)
    linkage:                      # consumed by TODO 04
      crosswalk: ich-q4b
      expose: [title, monographId, edition, harmonizationStatus, officialUrl, counterparts]
    pipeline:
      ingestion: partial
```

## Rules

1. **Every dataset is declared** — including empty ones (`data-american-pharmacopoeia`, `data-brazil-pharmacopoeia`) with `pipeline.ingestion: none`, so the registry is collectively exhaustive (MECE).
2. **Rights drive builds**: `rights.contentDeployable: false` ⇒ CI must strip/never include body content for that dataset in any public artifact. Add a CI assertion: public builds contain zero restricted-publisher body fields.
3. **The registry drives generation**: main site's publisher pages, nav links to `/{repo-name}` browsers, and each browser's edition/language lists are generated from the registry (delete the hard-coded `publisherInfo` map, `getPublisher()` URL sniffing, edition lists).
4. **Changes to datasets are code changes**: editing `datasets.yml` + CI validation replaces the current implicit "add a repo and hope" flow.
5. **Vendored-data retirement**: once `open-pharmacopoeia` publishes its `data/` (registry `repository` entries point at it), replace the vendored `data/` + `ontology/` in this repo with a registry-driven fetch/checkout at build time. Until then vendoring is the documented interim state.

## Deliverables

- [ ] `registry/datasets.yml` covering all 15 datasets in the TODO 00 matrix
- [ ] `registry/datasets.schema.json` + CI validation workflow
- [ ] Main site generates publisher routes/nav/stats from the registry
- [ ] CI guard: no restricted content in public artifacts
- [ ] Migration notes in each browser repo pointing at the registry
