# Compare view: acceptance evidence

This note records the acceptance evidence for the Compare view described in
[COMPARE_V2.md](COMPARE_V2.md). The requirement was to keep the publisher
identity and title columns for the five required publishers in the
acetaminophen example, to show test details only where publication is
explicitly permitted, and to check that numeric and method differences are
visible in a real browser.

USP, Ph.Eur. and BP entries stay title-only throughout. This note names
publisher codes, routes, states and counts. It does not quote monograph text or
limit values.

## Build on the integrated tree

The integrated Compare tree was built twice from a clean checkout with Node
26.1.0. The first run used commit `22be0b76`. The second run used `81eb138e`,
the head of PR #20 as merged. Both runs produced the same output counts.

| Step | Command | 22be0b76 | 81eb138e |
| --- | --- | --- | --- |
| Comparison projections | `npm run check:comparison` | exit 0 | exit 0 |
| Title-only editions | `npm run check:title-editions` | exit 0 | exit 0 |
| Rights assertion | `node scripts/assert-rights.mjs` | exit 0 | exit 0 |
| Counterpart links | `node scripts/check-counterpart-links.mjs` | exit 0 | exit 0 |
| Site build | `npm run build` | exit 0 | exit 0 |
| Built title-only datasets | allow-listed keys only in `dist/data/{us,eu,uk}` | exit 0 | exit 0 |
| Built Compare routes | `dist/compare/index.html` and both Compare data files present | exit 0 | exit 0 |

| Output | Count |
| --- | --- |
| Files in `dist` | 41,207 |
| HTML routes | 35,573 |
| JSON files | 5,526 |

The check on the built title-only datasets covered the US, EU and UK datasets,
10,139 records in total, with no record holding a key outside the title-only
allow list.

## Browser acceptance

The built site from the `81eb138e` run was served locally and opened in Google
Chrome with a fresh, isolated profile. The script captured ten states. The
current acetaminophen state was captured twice with identical results, so nine
distinct states were checked.

| State | Route | Width |
| --- | --- | --- |
| acetaminophen-current | `/compare?entry=us/acetaminophen` | 1280 |
| acetaminophen-keyboard-editions | `/compare?entry=us/acetaminophen&uspEdition=2015-USP38-NF33&edition=PhInt-12` | 1280 |
| albendazole-historical | `/compare?entry=phint/6-1-7&edition=PhInt-11` | 1280 |
| acetaminophen-narrow | `/compare?entry=us/acetaminophen&edition=PhInt-12` | 375 |
| acetaminophen-narrow-spacing | `/compare?entry=us/acetaminophen&edition=PhInt-12` | 375 |
| acetaminophen-reflow-320 | `/compare?entry=us/acetaminophen&edition=PhInt-12` | 320 |
| zidovudine-current | `/compare?entry=phint/6-1-375` | 1280 |
| zidovudine-keyboard-differences | `/compare?entry=phint/6-1-375&edition=PhInt-12` | 1280 |
| zidovudine-reflow-320 | `/compare?entry=phint/6-1-375&edition=PhInt-12` | 320 |

Across the run there were no page exceptions, no console errors and no
application HTTP errors. All 265 requests went to the local server, and none
were blocked as non-local. axe reported no violations in any state. The only
failed request was Chrome's own request for `/favicon.ico`, which the layout
does not advertise; it returned 404 and is recorded as an expected miss.

### Publisher columns

In the current acetaminophen state the table shows eight publisher columns:
US, CHP, IP, JP, KP, PHINT, EU and UK. The five required publishers (US, EU,
UK, JP and PHINT) are all present with their monograph titles. Each header
shows the publisher code, the edition where one is known, and the title. No
JP edition is recorded, so the JP header reads "JP" with no edition.

US, EU and UK cells show that limits and methods are restricted. The three
title-only datasets the page loaded contained only title index records: 3,908
for US, 2,631 for EU and 3,600 for UK.

### Differences

The Albendazole state compares PhInt-13 with the earlier PhInt-11 limits and
highlights the differing bound. The Zidovudine state with PhInt-12 shows a
"Different cited method" cell on screen. The highlighted cell text measured a
contrast ratio of 13.25 against its background, and the difference is also
stated in words, not only by color. The soft checks for the category route,
the Albendazole historical state and the Zidovudine method states all passed.

### Keyboard

The edition selectors and the scrollable table region can be reached with Tab,
and Shift+Tab returns focus to the earlier-edition selector. Keyboard
scrolling moved the table region from 0 to 186 pixels.

### Limits of this evidence

The accessibility checks used the accessibility tree and scripted key presses.
They are not a new session with a human screen reader user. A catalog family
shown next to a cited method is a lookup. It does not show that the method
applies to a given test or that two methods are interchangeable.

## Restored routes

The move to Astro had dropped some routes that the earlier build produced.
PR #22 restored 24 retired substance pages, 91 THP alias pages and the
`/ich/annexes/r1` alias. Its full build produced 5,542 substance pages, and the
route verification found no missing routes. The repository tests
(`node --test scripts/*.test.mjs`, 86 passing), the rights assertion, the
counterpart link check and both Compare checks all exited 0. CI passed on the
PR.

## No new exported fields

Comparing the hub data from `97b2c012` to `ce33e8a9`, no field was added to
or removed from any existing JSON file. Compare adds three new public files:

| File | Gate |
| --- | --- |
| `public/data/comparison-facts.json` | `npm run check:comparison` |
| `public/data/edition-diffs.json` | `npm run check:comparison` |
| `public/data/us-editions.json` | `npm run check:title-editions` |

Both gates exited 0 in the build runs above.
