# Operations: checks that guard www.openphar.org

The site has three automated checks. The link check and the build budgets are
gates: a pull request cannot pass `ci` and a push to `main` cannot deploy
while either fails. The uptime check watches the live site after deployment.

| Check | Script | Runs in | Fails when |
| --- | --- | --- | --- |
| Counterpart link integrity | `scripts/check-counterpart-links.mjs` | `ci.yml`, `deploy.yml` (before the build) | a cross-link in `data/cross-links.json` points at an entry that does not exist |
| Build budgets | `scripts/check-build-budgets.mjs` + `scripts/build-budgets.json` | `ci.yml`, `deploy.yml` (after the build) | build time or `dist/` size is outside its limits, or a metric is missing |
| Uptime | `scripts/check-uptime.mjs` | `uptime.yml` (every 6 hours and on demand) | a key route on www.openphar.org does not answer 200 or lacks its expected content |

All three run on Node 22.22.0, the version pinned in the workflows.

## Counterpart link integrity

Every key in `data/cross-links.json` maps an entry to its same-substance
counterparts in other pharmacopoeias. The check loads every dataset graph
listed in `data/registry.json` and fails if any link target is not a real
entry. Duplicate slugs within one dataset only warn.

Run it locally after `npm run generate` or any change to `data/`:

```bash
node scripts/check-counterpart-links.mjs
```

A failure lists the missing targets. Fix the generator or the source data and
regenerate; do not hand-edit `data/cross-links.json`.

## Build budgets

`ci.yml` and `deploy.yml` time `npm run build` with `date +%s` on the GitHub
`ubuntu-latest` runner and pass the seconds to the budget check, which also
measures `dist/` (files, HTML pages, files under `data/`, total bytes, largest
file). Each metric must sit inside the `min`/`max` in
`scripts/build-budgets.json`; a missing metric fails too. Every run writes a
table of the measured values and limits to the job summary, so the build time
of each CI and deploy run is on record.

Current limits and where they come from:

| Metric | Limit | Measured | Headroom |
| --- | --- | --- | --- |
| `build_seconds` | max 420 | 141 s on ubuntu-latest (CI run 42246951732) | 3x the CI build |
| `dist.files` | 45,000 to 65,000 | 52,039 | room for the 6,000-identity registry target |
| `dist.html_pages` | 40,000 to 58,000 | 46,370 | about one page per new identity |
| `dist.data_files` | 5,000 to 7,500 | 5,575 | 6,000 identities is about 6,050 files |
| `dist.bytes` | max 950,000,000 | 721,576,144 | GitHub Pages caps a site at 1 GB |
| `dist.largest_file.bytes` | max 50,000,000 | 33,838,525 | GitHub rejects files over 100 MB |

The GitHub runner is the authority for build time. Local machines differ: a
full build of 05919ed on a 4-CPU WSL machine took 364 s (2026-11-17), inside
the limit but much slower than the runner. If the time check fails only on a
local machine, check the CI job summary before acting. If it fails in CI,
find out what made the build slower; raise a limit only with a new
measurement from CI, and record that run in the `why` field of
`scripts/build-budgets.json`.

Run it locally the same way CI does:

```bash
start=$(date +%s); npm run build; secs=$(( $(date +%s) - start ))
node scripts/check-build-budgets.mjs --build-seconds "$secs" --out /tmp/budgets.json
```

## Uptime

`.github/workflows/uptime.yml` runs at minute 23 every 6 hours and from the
Actions tab (`workflow_dispatch`). It sends read-only GET requests, uses no
secrets and only needs `contents: read`. It checks:

| Route | Expected |
| --- | --- |
| `/` | 200, title contains "Open Pharmacopoeia" |
| `/compare/` | 200, title "Compare Monographs" |
| `/substance/caffeine/` | 200, title "Caffeine" |
| `/pharmacopoeia/jp/` | 200, title "Japanese Pharmacopoeia" |
| `/data/registry.json` | 200, a JSON array that includes the `jp` dataset |
| `/data/downloads/substances.ndjson` | 200, at least 1,000 lines, each JSON with `id` and `iri` |

Redirects are not followed: each route is canonical and must answer 200
itself. A failed route is retried once after 30 seconds, so a single network
error does not fail the run.

The workflow creates no issues and sends no messages. A failed run shows as a
red run in the Actions tab, and GitHub sends its usual failed-workflow email
to whoever last changed the schedule, according to their notification
settings. GitHub turns off scheduled workflows in a public repository after 60
days without repository activity; re-enable it from the Actions tab if that
happens.

Run it locally, or against a local preview:

```bash
node scripts/check-uptime.mjs
node scripts/check-uptime.mjs --base http://localhost:4321 --retries 0
```

If you rename or remove one of these routes, update `ROUTES` in
`scripts/check-uptime.mjs` in the same change. Its unit tests
(`scripts/check-uptime.test.mjs`) run offline in `ci.yml`.

## Not in place

There is no staging deployment. It is waiting on a hosting decision by the
owner, and nothing here adds a service, account or cost.
