# Compare v2: verified public scope

`/compare?entry=us/acetaminophen` retains the publisher identity and title
columns, including USP, Ph.Eur., BP, JP and Ph.Int. Additional registry-linked
publishers remain visible. Restricted publishers carry title metadata only in
the downloadable datasets as well as the rendered page.

The table compares supplied, explicitly authorized WHO typed limits. A shaded
cell and the text **Different limit** identify a difference; **Same limit**,
**Reference**, **Incomparable** and **Unknown** have separate meanings. The
headers include the publisher, edition and monograph title. Color is never the
only indication of a difference.

- Substance identity, edition, publication authority and complete typed data
  must be available. Missing or unknown context yields **Unknown**.
- Test semantics, measurement basis, literal unit and operator must agree.
  Mismatches are **Incomparable**. No unit or basis conversion is performed.
- Decimal strings are compared exactly. Literal inequalities and range bounds
  retain their supplied precision and operators.
- One verified datum is insufficient for a comparison. Multiple variants of the
  same semantic test remain unavailable rather than selecting a convenient one.

## Source-backed examples

`/compare?entry=phint/6-1-7&edition=PhInt-11` compares supplied Albendazole
limits: PhInt-13 has a 99.0–101.0% range and the captured PhInt-11 material has
98.0–101.0%, on the same dried-substance basis. The earlier edition's lower
bound is highlighted as different.

`/compare?entry=us/acetaminophen&edition=PhInt-12` compares supplied Paracetamol
limits across PhInt-12 and PhInt-13. Their selected limits are the same.
Sulfated ash remains `<= 1.0 mg/g`; loss on drying remains `<= 5.0 mg/g`.
Those units are not converted to percent. Historical columns show selected
typed facts; they do not claim publication of historical monograph bodies or
that the entire monograph is unchanged. The retained attribution describes the
captured historical material and its authentication limits.

The edition selector updates the shareable URL. The USP selector changes title
and edition metadata only; it never exposes restricted edition differences.

## Catalog families and method differences

Explicit citations can carry a reviewed catalog family, with the exact
publisher, chapter, edition and curated classification. The public projection
contains five reviewed scope bindings: non-aqueous titration (PhInt-11/13,
2.6), nitrite titration (PhInt-12/13, 2.7), and UV/visible absorption
spectrophotometry (PhInt-12, 1.6). The private resolver and source review supply
the build evidence; source notes, rationale, proof, paths, hashes and effective
ICH claims are excluded from every public field. A catalog family is a lookup
attached to an explicit citation. It does not prove per-test applicability or
scientific/regulatory interchangeability. Applicability always remains
**unresolved**.

`/compare?entry=phint/6-1-375&edition=PhInt-12` demonstrates a genuine difference
in captured WHO Zidovudine records. The dried-substance assay range changes
from 97.0–103.0% to 97.0–102.0%. The earlier assay explicitly measures absorbance
under chapter 1.6; the current assay explicitly cites HPLC under 1.14.1. The
table separately marks **Different limit** and **Different cited method**.
The shared chromatography component guard keeps the current catalog family
unresolved; the explicit HPLC citation is preserved. It is never forced into a
positive family merely to complete a demonstration.

The exact native edition records, formula, CAS identity, definition and own
assay paragraphs were checked against pinned source Git objects. Original raw
captures for this added pair were unavailable locally; the adaptation and
public evidence identify this as a captured-native comparison, without claiming
independent original-source authentication. This limitation applies to the new
pair and does not upgrade or invalidate the earlier source evidence.

A matching chapter citation is labelled **Same chapter citation**, never proof
of an unchanged procedure. Different publishers' chapter numbers alone are
incomparable. Missing citations, conflicting identities/bases, missing editions,
unreviewed family bindings and component/procedure ambiguity remain explicit.
The original numeric comparator and its unit/basis/operator safeguards remain
separate.

The generated artifact has 11 current and three historical entries, 18 typed
limits and 11 explicit citations: nine reported catalog-family lookups and two
unresolved references. The original 16 numeric facts and nine citations retain
their literal values; catalog annotations are the only additions to those
facts. The five required acetaminophen publisher identities/titles and all
additional registry columns remain visible; restricted publishers gain no
limits or methods. New IP numeric or procedure output is excluded from this
package; no permission is inferred from its existing public body data.

The generator and publication checker enforce the bounded catalog allowlist,
exact edition/citation binding, unresolved applicability, source notices and
strict nested fields. These are local implementation and captured-source
results. They do not close every source05.1 requirement, authorize publication,
waive merged prerequisites, or establish complete method applicability.

## Local validation

Use the Node version in CI and the resolved lockfile dependencies:

```sh
node --test scripts/comparison-contract.test.mjs scripts/comparison-projections.test.mjs
node scripts/check-comparison-projections.mjs
node scripts/check-title-only-editions.mjs
node scripts/assert-rights.mjs
node scripts/check-counterpart-links.mjs
npm run build
```

Validate the resulting production Astro artifact in the browser, including both
examples, edition selection, keyboard access, table accessibility semantics and
actual JSON responses. Recheck restricted payloads and compare vendored asset
hashes. Passing local tests or this numeric feature does not close the full
Compare v2 source requirement, authorize publication or waive merged prerequisites.
