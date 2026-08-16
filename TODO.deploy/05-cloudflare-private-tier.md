# TODO 05 — Cloudflare private tier (logged-in access to restricted pharmacopoeias)

Status: future / design notes (do not implement yet)
Depends on: TODO 02 (registry is the entitlements source), TODO 04 (linking model)

## Goal

A private, logged-in version of the browser network that shows the restricted datasets (USP, Ph. Eur., BP full text) to entitled users, while the public GitHub Pages tier continues serving everything else. Same frontends, same registry — different data plane.

## Architecture sketch

```
                    ┌─ Public tier  ── GitHub Pages (www.openphar.org, /{repo})
users ──► Cloudflare┤
                    └─ Private tier ── Cloudflare Pages (app/private.openphar.org)
                                         │
                                         ▼
                                    Worker (data plane)
                                    /data/{dataset}/*
                                    ├── session → CF Access / OIDC
                                    ├── entitlements ← registry (rights.visibility: private)
                                    └── origin ← private data repos (never public)
```

- **Cloudflare Pages** hosts the same Astro builds (public snapshot). Deploy target: `private.openphar.org` or `app.openphar.org`.
- **Worker** fronts `/data/*` (and any restricted page payloads): validates session (Cloudflare Access, or OIDC against an org IdP), maps `session → entitled datasets` from the registry, and serves restricted JSON-LD from private storage (R2 / private repo mirror). Public datasets pass through or are baked into the Pages build as today.
- **Build-time vs runtime**: public tier keeps build-time filtering (TODO 04 CI guard); private tier adds runtime authorization. One codebase; the registry decides which datasets each tier may see.
- **Git hygiene**: restricted data repos stay private forever; the Worker holds deployment credentials, nothing public ever references them.

## Why Cloudflare

GitHub Pages (Free plan) cannot do auth; the user has already chosen CF Pages/Workers. Pages deploys the Astro output unchanged; Workers give per-request entitlement checks without running a separate app server.

## Open questions (answer before implementation)

- Auth: Cloudflare Access (zero-code) vs OIDC integration with an existing IdP?
- User store for entitlements (registry `rights.entitledGroups`? per-user grants?)
- Data storage for restricted JSON-LD: R2 bucket vs Worker KV vs direct private-repo fetch at deploy time
- Does the private tier also serve non-public *drafts* of public pharmacopoeias (pre-release harmonization work)?
- Custom domain strategy (`private.openphar.org` on the same CF zone as `www.openphar.org`)

## Deliverables (when scheduled)

- [ ] CF Pages project wired to the browser builds
- [ ] Worker with session + entitlement enforcement reading the registry
- [ ] Restricted data pipeline into private storage
- [ ] Registry schema extension: `rights.visibility: public|private`, entitlement groups
- [ ] Fail-closed tests: unauthenticated / unentitled requests get no restricted bytes
