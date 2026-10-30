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

## Method mappings remain a required gap

The supplied method information consists of chapter citations. No authorized
harmonized method concept, applicability scope, mapping rationale or
interchangeability assertion is supplied by this projection. Citations do not
satisfy the required method-mapping acceptance criterion. That criterion stays
open pending a specific decision on the public fields and suitable verified
source inputs. No association is inferred from a test name, matching chapter
number or another edition.

The projection reader and publication checker reject extra mapping fields at
every supported payload layer. A future mapping feature must add an explicit
publication contract and source/edition/applicability checks before exporting
facts. The present implementation does not pre-authorize that extension.

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
