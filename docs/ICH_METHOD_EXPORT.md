# Qualified method-catalog projection

`scripts/lib/ich-method-projection.mjs` projects method-catalog metadata for the ICH dataset builder. It does not establish scientific equivalence, current-edition applicability or regulatory interchangeability. Source publication approval is a separate gate; this code change does not authorize generating or publishing data.

The helper preserves the existing method ID rule (`https://www.openphar.org/data/{dataset}/methods/{concept}`, with underscores replaced by hyphens and lowercase), labels, `IndexedMonograph` type, category and catalog edition. It retains the native `harmonisationStatus` value as a catalog claim. Explicit `catalogProvenance` identifies its meaning as a method-family catalog association with unresolved applicability. The detail view consequently displays **Catalog status**, including for `not_harmonised`, `partial` and unknown literal statuses. Existing guideline/annex entries without that marker keep their existing label and producer behavior.

Each chapter remains a separate section. The section heading/text and its structured `chapterReference` retain the publisher, code, exact supplied edition, source classification and confidence. For example, JP `2.02` in `JP15` and `JP16` remains two references. An `ep-10` reference never becomes EP11/current. The catalog edition is not substituted for a missing publisher-chapter edition. Missing values are explicitly unspecified, and unknown scalar labels are retained without being promoted to recognized provenance or confidence.

## Metadata contract

The helper uses explicit construction rather than spreading source rows. Its output permits these fields:

- Method: `@id`, `@type`, `prefLabel.en`, `edition`, `category`, `harmonisationStatus`, `ichAnnex`, `definition.en`, `sections`, `qualificationsWithheld` and the fixed `catalogProvenance` meaning marker.
- Section: `name`, `text`, `chapterReference`.
- Chapter reference: `publisher`, `code`, optional literal `edition`, `source`, `confidence`, `sourceValidationStatus`, plus `referenceStatus`, `applicabilityStatus` and `qualificationsWithheld`.

`referenceStatus: reported` describes a catalog association from a recognized `curated` or `ich_official` source label. It is not authentication, a resolved scientific equivalence or approval to apply a chapter. An explicit source-validation object must say `verified`; contradicted, unverified, unknown, missing-status or malformed explicit validation remains `unresolved`, with no positive association asserted. Unknown/absent source classifications are also unresolved. Applicability is always unresolved in this projection.

`ich_official` is retained as source provenance, not transformed into “official equivalence.” Curated entries remain labelled curated and are never upgraded to official claims. A concept's harmonisation status is not copied onto each publisher chapter as its effective status. Confidence is a literal catalog label, not a computed equivalence score.

Free-form `note`, `rationale`, `conditions`, `limitations` and source-validation reason/evidence details are not exported or parsed into scientific policy. Nonblank/present qualifying metadata produces a visible notice and `qualificationsWithheld: true`. This means additional qualifying metadata was not exported; it does **not** mean that the mere existence of a source-proof note establishes a scientific restriction. The original source must be consulted before use. Where full conditions are unavailable in the public projection, no applicability or interchangeability conclusion is asserted.

Raw bodies, source prose, local paths, source pointers, assistant/session metadata and arbitrary extensions never become output fields. Selected public index metadata must be strings of the supported bounded lengths; blank values, control characters and recognizable private/local paths are rejected without echoing the rejected value. Codes and editions are not coerced, normalized or silently truncated. These field/type/path checks are not a comprehensive data-loss-prevention system or a substitute for reviewing source rights and content.

## Verification without public generation

Use the existing pinned Node runtime and project dependencies:

```sh
node --test scripts/tests/ich-method-projection.test.mjs
```

The tests exercise the pure helper, execute the actual builder function against tiny synthetic filesystem/YAML fixtures, and compile/render the actual detail-view badge subtree with Vue SSR. They cover curated/official provenance, all catalog statuses, edition separation, absent/unknown metadata, rejected validation, nonmutation, stable identity and forbidden-field/path exclusion. The fixture builder also verifies that a synthetic guideline/annex follows the unchanged existing producer. The generator's top-level public-data-writing loop is never imported by the tests.

The helper integration changes only method-catalog projection. It does not change the guideline/annex document pipeline, registry rights descriptor, publication policy, source ledger, vendored graphs, compiled artifacts or routes. Existing vendored data has not been refreshed by this code delivery; old artifacts without the new marker are not retroactively repaired or reverified.

## Remaining publication gate

`registry/datasets.yml` currently declares ICH `rights: full`. That declaration is not new publication authority for the qualified catalog or its underlying source texts. The task keeps all public generation, refresh and deployment blocked; this helper does not introduce an approval switch or certify public output safe. Full conditions/source review, rights, links, coverage and snapshot checks remain necessary before any authorized refresh, including for the unchanged guideline/annex text pipeline.

An unapplied follow-up proposal is to require an explicitly reviewed input digest and projection-contract identifier in the ICH dataset descriptor, and have the writer abort when either is absent or mismatched. That requires a separate descriptor/policy ownership decision. No descriptor, runtime publication flag or full writer guard is added here. A withholding marker is neither a rights grant nor a replacement for full scientific/source qualification.
