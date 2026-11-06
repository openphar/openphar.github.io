# WCAG 2.1 AA on the major hub views

This note maps every WCAG 2.1 level A and AA success criterion to the hub's
major views and records the evidence for each one. The views are the home page,
publisher pages, monograph pages (full, title-only, native-language and
edition-change states), search, substance pages, the ontology page, the API
page and the Compare page. The Compare states are listed in
[COMPARE_ACCEPTANCE.md](COMPARE_ACCEPTANCE.md).

This is an engineering check of the views listed here. It is not a formal
conformance claim for every page the site generates, and it does not replace a
session with a human screen reader user.

## How to repeat the automated checks

```sh
npm ci
npm run build                              # full site into dist/, about 45 minutes
npm run check:a11y                         # all states, exits 1 on a blocking finding
```

For a faster check, build the sample site, which contains every page the
states below need, and point the script at it:

```sh
OPENPHAR_BUILD_SAMPLE=1 npm run build      # about 1 minute, output in .astro-sample/
node scripts/check-compare-a11y.mjs --dist .astro-sample --json a11y.json
```

`--only compare` or `--only hub` runs one group. The script needs a local
Chrome or Chromium (`CHROME_PATH` selects the binary). It is not part of CI
because CI does not install a browser.

For each state the script:

- runs axe-core (4.14.0) and fails on any serious or critical violation;
- presses Tab from the top of the page, up to 60 times or until focus returns
  to the first stop, and fails if any focus stop has no visible focus
  indicator (no outline and no box shadow);
- at 320px wide, fails if the page itself scrolls horizontally. Tables and code
  blocks may scroll inside their own keyboard-focusable region.

## Hub states

| State | Route | Width (px) |
|---|---|---|
| home | `/` | 1280 |
| home-reflow-320 | `/` | 320 |
| publisher-full | `/pharmacopoeia/phint/` | 1280 |
| publisher-title-only | `/pharmacopoeia/us/` | 1280 |
| publisher-native | `/pharmacopoeia/kp/` | 1280 |
| monograph-full | `/pharmacopoeia/jp/chemicals/acetaminophen/` | 1280 |
| monograph-edition-changes | `/pharmacopoeia/phint/monographs/6-1-375/?edition=PhInt-12` | 1280 |
| monograph-title-only | `/pharmacopoeia/us/monographs/acetaminophen/` | 1280 |
| monograph-native | `/pharmacopoeia/kp/part1/acyclovir/` | 1280 |
| monograph-reflow-320 | `/pharmacopoeia/phint/monographs/6-1-375/?edition=PhInt-12` | 320 |
| search-results | `/search/?q=acetaminophen` | 1280 |
| search-native | `/search/?q=` with a Japanese query | 1280 |
| search-reflow-320 | `/search/?q=acetaminophen` | 320 |
| substance | `/substance/paracetamol/` | 1280 |
| substance-reflow-320 | `/substance/paracetamol/` | 320 |
| ontology | `/ontology/` | 1280 |
| api | `/api/` | 1280 |
| api-reflow-320 | `/api/` | 320 |

The script also runs the nine Compare states, so one run covers 27 states.

## Results

The first run was against a full build of main at a6a6b036 (46,370 pages,
build exit 0). It found three blocking problems, all at 320px:

- The substance page scrolled sideways to 369px because the long substance IRI
  under the heading did not wrap.
- The API page scrolled sideways to 447px because the endpoints table and the
  file paths in the Ontology and Context list did not fit.
- On the API page at 320px, axe reported `scrollable-region-focusable`
  (serious): the example response block scrolls but could not be reached with
  the keyboard.

The fixes: the IRI and the file paths now break anywhere (`break-all`), the
endpoints table scrolls inside its own region, and that region and the example
response block are focusable named regions (`tabindex="0"`, `role="region"`,
`aria-label`).

After the fixes, a sample build of this branch passed all 27 states: no axe
violations of any impact, every focus stop showed an indicator, and no page
scrolled sideways at 320px. The script exited 0. The publisher pages have more
than 60 focus stops, so only their first 60 were checked.

## Criteria

"Checked again" means the automated run above covers the criterion on the
current pages. "Earlier review" means the evidence comes from the local review
at 34b64eb8 (2026-10-30), which used screenshots at 100, 200 and 400% zoom,
text-spacing overrides, contrast measurements of 90 flagged colour pairs (89
pass, 1 decorative separator, lowest text ratio 5.69:1) and Orca screen reader
observations on Linux. Since 34b64eb8 the changes to these views are the
substance history section, the API page wording, the Compare column labels and
the fixes above. None of them adds media, colour tokens, custom widgets or
timing.

| Criterion | Level | Result | Evidence |
|---|---|---|---|
| 1.1.1 Non-text content | A | Pass | Brand and icon graphics are decorative next to text. axe image and name rules pass (checked again). |
| 1.2.1 Audio-only and video-only | A | Not applicable | No audio or video on these views. |
| 1.2.2 Captions (prerecorded) | A | Not applicable | No audio or video. |
| 1.2.3 Audio description or media alternative | A | Not applicable | No video. |
| 1.2.4 Captions (live) | AA | Not applicable | No live media. |
| 1.2.5 Audio description (prerecorded) | AA | Not applicable | No video. |
| 1.3.1 Info and relationships | A | Pass | Headings, landmarks, labelled fields, table captions and header cells. axe structure rules pass (checked again); Orca read the same structure (earlier review). |
| 1.3.2 Meaningful sequence | A | Pass | DOM order matches visual order; Tab order follows it (checked again). |
| 1.3.3 Sensory characteristics | A | Pass | Instructions use text labels, not shape or position. |
| 1.3.4 Orientation | AA | Pass | No orientation lock; layouts work from 320px to 1280px (checked again). |
| 1.3.5 Identify input purpose | AA | Not applicable | No fields collect personal data. |
| 1.4.1 Use of colour | A | Pass | Access level, status and differences are also stated in words. |
| 1.4.2 Audio control | A | Not applicable | No audio. |
| 1.4.3 Contrast (minimum) | AA | Pass | axe colour-contrast passes (checked again); manual measurement of flagged pairs, lowest text ratio 5.69:1 (earlier review). |
| 1.4.4 Resize text | AA | Pass | 200% browser zoom keeps content and controls usable (earlier review). |
| 1.4.5 Images of text | AA | Pass | The wordmark and labels are real text. |
| 1.4.10 Reflow | AA | Pass after fix | No page scrolls sideways at 320px; tables and code scroll inside focusable regions (checked again, fixed on this branch). |
| 1.4.11 Non-text contrast | AA | Pass | Input borders 3.59:1, focus outline 14.5:1 (earlier review). |
| 1.4.12 Text spacing | AA | Pass | The Compare narrow-spacing state applies the WCAG spacing overrides with no violations (checked again); other views were checked with the same overrides (earlier review). |
| 1.4.13 Content on hover or focus | AA | Pass | No custom pop-ups; the home page publisher hints use the native title, which stays readable (earlier review). |
| 2.1.1 Keyboard | A | Pass after fix | Every control and scroll region is reachable with Tab; the API example block was not and is now (checked again). |
| 2.1.2 No keyboard trap | A | Pass | Tab moves through each page and back to the start; no focus trap (checked again). |
| 2.1.4 Character key shortcuts | A | Not applicable | No single-key shortcuts. |
| 2.2.1 Timing adjustable | A | Not applicable | No time limits. |
| 2.2.2 Pause, stop, hide | A | Pass | No auto-updating or moving content beyond brief loading indicators; reduced-motion rules apply. |
| 2.3.1 Three flashes | A | Pass | No flashing content. |
| 2.4.1 Bypass blocks | A | Pass | Main landmark and a descriptive first heading; Orca landmark and heading navigation works (earlier review). |
| 2.4.2 Page titled | A | Pass | Each view has a descriptive title. axe `document-title` passes (checked again). |
| 2.4.3 Focus order | A | Pass | Tab order follows the reading order (checked again). |
| 2.4.4 Link purpose (in context) | A | Pass | Link text names the publisher, entry or action. axe `link-name` passes (checked again). |
| 2.4.5 Multiple ways | AA | Pass | Entries are reachable by search, publisher browsing and substance cross-links. |
| 2.4.6 Headings and labels | AA | Pass | Headings and field labels describe their content. |
| 2.4.7 Focus visible | AA | Pass | Every focus stop in all 27 states has a visible outline (checked again). |
| 2.5.1 Pointer gestures | A | Not applicable | No path or multipoint gestures. |
| 2.5.2 Pointer cancellation | A | Pass | Actions run on click, not on pointer down. |
| 2.5.3 Label in name | A | Pass | Accessible names contain the visible labels. axe `label` rules pass (checked again). |
| 2.5.4 Motion actuation | A | Not applicable | No motion input. |
| 3.1.1 Language of page | A | Pass | Pages declare `lang`. axe `html-has-lang` passes (checked again). |
| 3.1.2 Language of parts | AA | Pass | Native-language titles are marked with their language where the data gives it; proper names and codes fall under the criterion's exceptions (earlier review). |
| 3.2.1 On focus | A | Pass | Focus never navigates or changes the page (checked again). |
| 3.2.2 On input | A | Pass | Changing a filter or edition updates results and the URL without navigating away. |
| 3.2.3 Consistent navigation | AA | Pass | The shared header and footer keep the same order on every view. |
| 3.2.4 Consistent identification | AA | Pass | Search, publisher, edition and restriction controls are named the same everywhere. |
| 3.3.1 Error identification | A | Pass | Search has no format rules; failed loads and empty results are stated in text. |
| 3.3.2 Labels or instructions | A | Pass | Every search, filter and edition field has a visible label. |
| 3.3.3 Error suggestion | AA | Not applicable | No inputs with a required format. |
| 3.3.4 Error prevention | AA | Not applicable | No legal, financial or data-changing submissions. |
| 4.1.1 Parsing | A | Pass | Treated as always met for HTML in the current WCAG 2.1 errata; removed in 2.2. |
| 4.1.2 Name, role, value | A | Pass | Native controls with labels; axe ARIA and name rules pass (checked again); Orca read the widget states (earlier review). |
| 4.1.3 Status messages | AA | Pass | Result counts and edition selection use live regions; Orca announced them (earlier review). |

Result count: 37 pass and 13 not applicable, out of 50 criteria.

## Limits

- The automated checks run in headless Chrome on Linux. Screen reader, zoom and
  contrast evidence comes from the earlier review at 34b64eb8 and was not
  repeated for this note.
- The checks cover the states listed above, one page per template. Other pages
  built from the same templates are expected to behave the same but were not
  each checked.
