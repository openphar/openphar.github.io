# TODO 00 — Deployment Program Overview

Status: planned (2026-08-16)
Owner: openphar

## Goal

Deploy the Open Pharmacopoeia site network on GitHub Pages:

- `https://www.openphar.org` — main site (this repo): project purpose, documentation, harmonized ontology browser (base layer from ICH Q4 harmonization).
- `https://www.openphar.org/{repo-name}` — one browser per dataset repo under the `openphar` org, deployed from that repo's own Pages workflow.

## Principles

1. **One stack everywhere.** Astro 7 + Vite 8 + Vue islands + Tailwind 4 (`@tailwindcss/vite` via Vite 8). No vite-ssg, no per-repo framework drift.
2. **Declarative configuration, not convention.** Every dataset (publisher) is declared explicitly in a registry (`datasets.yml`). Nothing is inferred from repo names, directory layout, or file presence. The registry is the single input that drives ingestion, build content, deployment targets, and linking behavior. See TODO 02.
3. **Rights-driven content.** Public-domain / freely-available pharmacopoeias (Japanese, Thai, Korean, Chinese, Indian, International, plus HK CMMS and ICH Q4) deploy full content. Copyrighted pharmacopoeias (USP, Ph. Eur., BP) never deploy content — they appear as **title-only linked entries** cross-referenced against ICH Q4 and counterpart public monographs. See TODO 04.
4. **Public tier today, private tier later.** GitHub Pages is the public tier. A Cloudflare Pages/Workers tier will later serve logged-in users the restricted datasets, driven by the same registry. See TODO 05.

## Constraints (verified 2026-08-16)

- The `openphar` org is on the **GitHub Free plan**: Pages serves only from **public** repos. Any repo whose browser must deploy has to be public.
- `openphar/open-pharmacopoeia` (canonical ontology + data) is currently **private**, and its `data/` directory (80 MB) is **not committed to any remote branch** — it exists only on local disks. This is why the main site currently vendors a data subset.
- Custom domain `www.openphar.org` is configured and verified on `openphar/openphar.github.io` (workflow build type, HTTPS enforced). Project pages of public org repos automatically serve at `www.openphar.org/{repo-name}` — no extra DNS needed.
- Copyright: USP–NF, Ph. Eur., and BP text is licensed content. Titles/index metadata and ICH Q4B equivalence mapping are usable; full text is not deployable.

## Current state matrix

| Dataset | Repo | Remote | Browser | Rights | Action |
|---|---|---|---|---|---|
| Japanese (JP) | `data-japan-pharmacopia` | openphar (private) | yes (Astro) | full | TODO 03 |
| International (Ph.Int.) | `data-international-pharmacopoeia` | none | none | full | TODO 03 (create browser) |
| Chinese (ChP) | `chp-browser` + `data-china-pharmacopoeia` | none / openphar (private) | yes (chp-browser) / none | full | TODO 03 (consolidate the two repos) |
| Korean (KP) | `data-korea-pharmacopoeia` | none | yes (Astro) | full | TODO 03 |
| Thai (TP) | `data-thai-pharmacopoeia` | none | none | full | TODO 03 (create browser) |
| India (IP) | `data-india-pharmacopoeia` | openphar (private) | yes (Astro) | full | TODO 03 |
| India (API/AYP) | `data-india-ayurvedic-pharmacopoeia` | none | none | full | TODO 03 (create browser) |
| HK CMMS | `data-hkcmms` | **sipmorg** org | none | full | TODO 03 (move to openphar org) |
| ICH Q4 | `data-ich-q4` | openphar (private) | none | full | TODO 03 (create browser) |
| US (USP) | `data-us-pharmacopoeia` | openphar (private) | yes (Astro) | **restricted** | TODO 04 |
| EU (Ph. Eur.) | `data-eu-pharmacopoeia` | none | yes (Astro) | **restricted** | TODO 04 |
| UK (BP) | `data-uk-pharmacopoeia` | openphar (private) | none | **restricted** | TODO 04 |
| American / Brazil | `data-american-pharmacopoeia`, `data-brazil-pharmacopoeia` | none | none | — | out of scope (no data yet) |
| Generic browser template | `openphar-browser` | openphar (private) | yes (Astro) | — | template for TODO 03 browser creation |
| Harmonized core | `open-pharmacopoeia` | openphar (private) | (untracked legacy) | full | data/ontology home; see TODO 02 |

## Shipped state (2026-08-16)

- Main site live at www.openphar.org via GH Actions (self-contained build).
- **All 12 datasets surfaced** (second deploy, 2026-08-16): jp/phint full monographs; thp/chp/ip/ayp/hk indexed monographs generated from sibling repos (`npm run generate`, driven by `registry/datasets.yml`); us/eu/uk as title-only restricted entries; kp as raw-status page; ich as reference. ~26k prerendered pages; global search over 23k titles (`data/search-index.json`).
- Brand identity applied: Fraunces + IBM Plex, compendium green/brass/oxblood palette, three-circle harmonization mark, registry-wall home page.
- Main site still runs the interim Vue + vite-ssg stack; TODO 01 replaces it with Astro 7.

## Execution order

1. **TODO 01** — Astro 7 / Vite 8 / Vue islands / Tailwind 4 migration of the main site.
2. **TODO 02** — declarative dataset registry (blocks 03/04 doing this "properly").
3. **TODO 03** — public browser deployments, one repo at a time (JP first).
4. **TODO 04** — restricted-publisher linking (USP/Ph.Eur./BP ↔ ICH Q4 ↔ public monographs).
5. **TODO 05** — Cloudflare private tier (future; design informed by 02).
