# TODO 04 — Restricted publishers: title-only linking (USP / Ph. Eur. / BP)

Status: **first cut live** (2026-08-16/17): title-index entries for us/eu/uk render as restricted cards with counterpart links; cross-dataset links match by normalized title across all label languages AND by CAS number (closes the INN-alias gap: US "Acetaminophen" ↔ "Paracetamol"). CAS is index metadata (a fact), carried for restricted entries. Remaining: richer crosswalks from ICH Q4B method equivalence at monograph level, curated alias table for name variants without shared CAS.
Depends on: TODO 02 (registry `rights.mode: title-only`), TODO 03 (public browsers to link into)

## Principle

USP–NF, Ph. Eur., and British Pharmacopoeia content is copyrighted and **must never be deployed** to public pages. What we *can* publish:

- Monograph titles and index metadata (user-confirmed: "show monograph title but no content")
- Monograph identifiers/edition info
- ICH Q4B harmonization status (ICH documents are freely available)
- Links to the official source and to **counterpart monographs in public pharmacopoeias** (JP, ChP, KP, IP, Ph.Int., …)

## Data model

Grow `open-pharmacopoeia/data/cross-publisher/` into the crosswalk dataset:

```jsonld
{
  "@id": "https://www.openphar.org/data/cross-publisher/paracetamol",
  "@type": "CrossPublisherEntry",
  "title": "Acetaminophen / Paracetamol",
  "counterpart": [
    { "dataset": "jp", "monograph": "…/data/jp/chemicals/acetaminophen", "edition": "JP18" },
    { "dataset": "phint", "monograph": "…/data/phint/monographs/paracetamol", "edition": "Ph.Int. 13" }
  ],
  "restrictedSource": [
    { "dataset": "us",  "title": "Acetaminophen",     "edition": "USP–NF", "officialUrl": "https://doi.org/…", "harmonization": "ICH Q4B <621>…" },
    { "dataset": "eu",  "title": "Paracetamol",        "edition": "Ph. Eur. 11", "officialUrl": "…" }
  ]
}
```

Extraction sources for restricted publishers: title/index lists + ICH Q4B equivalence tables (`data-ich-q4` `equivalence/methods.yaml` — the JP browser already enriches JP methods against it; generalize that logic into the crosswalk builder). **No body text at any stage.**

## UI

- Main site and public browsers render restricted entries as **linked index cards**: title + edition + "Restricted — full text available from the publisher" + official link + counterpart links into public browsers + ICH Q4B badge where harmonized.
- Compare view may show a restricted monograph **only** as a column of titles/status, never content.

## Enforcement (defense in depth)

1. Registry: `rights.contentDeployable: false` for us/eu/uk (TODO 02).
2. Build: crosswalk generator whitelists fields (`linkage.expose`); anything else is dropped at generation.
3. CI: assertion step in every public deployment — scan built artifacts for restricted dataset body fields (`definition`, `testSpecification`, … from us/eu/uk sources) and fail the build if present.
4. Review: PRs touching `data-us-pharmacopoeia`, `data-eu-pharmacopoeia`, `data-uk-pharmacopoeia` require explicit note that no content ships.

## Deliverables

- [ ] Crosswalk builder producing `cross-publisher.jsonld` from ICH Q4B + public counterparts + restricted title indexes
- [ ] Linked index cards in main site + browsers
- [ ] CI guard against restricted content in public artifacts
- [ ] Registry entries for us/eu/uk with `mode: title-only`
