# Lighthouse performance on `/`: before and after the Astro migration

The Astro migration (TODO.deploy/01, merged in #20) requires that Lighthouse
performance on `/` is at least the pre-migration baseline. Measured locally on
2026-11-06, the median performance score was 66 before the migration and 68.5
after it, over 8 paired runs each. The candidate meets the baseline, but the
runs vary a lot (see Limits).

## What was compared

- Baseline: the GitHub Pages deployment artifact for main at c662017f (PR #11,
  2026-10-27), built with vite-ssg. It is the newest pre-migration deployment
  artifact still available; the one for 97b2c012, the last main commit before
  #20, is no longer listed by the Actions API. Between c662017f and 97b2c012 the home view did not change;
  7 shared files did (search, router and other views, 78 lines added and 25
  removed). `index.html` SHA-256 `67ec6621898af7ec8dc2dc872eebbac07b4bdfd36953009da6b8694cdded73b4`.
- Candidate: a full local build of main at a6a6b036 (`npm ci` and
  `npm run build` on Node 22.22.0, 46,370 pages, exit 0). `index.html` SHA-256
  `e47226d8edf105a5dcf8a27d3334ca7c91e0fee7fed7348cdf08d72f25a59a25`.

Both were served as static files from 127.0.0.1 by the same small Node server,
with no caching.

## How it was run

Lighthouse 13.0.1 on Node 22.22.0 with Google Chrome 157.0.8103.38 (headless),
on Ubuntu 22.04. Each run used a fresh Chrome profile:

```sh
lighthouse http://127.0.0.1:PORT/ --only-categories=performance \
  --form-factor=mobile --output=json --output-path=RUN.json --quiet \
  --chrome-flags="--headless=new --no-first-run --no-default-browser-check --disable-background-networking --user-data-dir=PROFILE"
```

This is the Lighthouse mobile default with simulated throttling. Baseline and
candidate runs alternated, and the order inside each pair swapped from one pair
to the next. There were two sessions, of 3 and 5 pairs.

## Results

| | Baseline (c662017f) | Candidate (a6a6b036) |
|---|---|---|
| Performance scores, sorted | 60, 61, 62, 65, 67, 69, 70, 70 | 48, 66, 66, 67, 70, 71, 74, 77 |
| Median performance | 66 | 68.5 |
| Median First Contentful Paint | 2,307 ms | 2,838 ms |
| Median Largest Contentful Paint | 2,307 ms | 2,935 ms |
| Median Total Blocking Time | 1,996 ms | 969 ms |
| Median Speed Index | 2,936 ms | 3,498 ms |
| Median Cumulative Layout Shift | 0.079 | 0.025 |
| Total transfer size | 162,966 bytes | 199,112 bytes |

Session medians were 62 and 66 (3 pairs), then 69 and 71 (5 pairs). Every run
exited 0 with no Lighthouse runtime error.

The candidate paints later (first and largest paint are about 0.5 s later) but
blocks the main thread about half as long and shifts less, which raises the
overall score.

## Limits

- The laptop was busy during the runs (load average about 18), which explains
  the wide spread, including one candidate run at 48. The comparison is between
  medians of alternating runs on the same machine, not absolute scores.
- The baseline is c662017f, not 97b2c012. The home view is the same in both,
  but shared code that the home page bundle may load changed.
- These are local static-file runs. They do not measure GitHub Pages, its CDN
  or real networks.
