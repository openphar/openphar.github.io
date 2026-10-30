import { createHash } from 'node:crypto'

// Disambiguate distinct source identities, never copies of the same identity.
// Both grouping and suffixes depend on source data, not file/traversal order.
export function sourceRouteSlugs(rows, baseSlug) {
  const groups = new Map(), sources = new Set(), result = new Map(), used = new Set()
  for (const row of rows) {
    const iri = row.doc.canonical_iri
    if (iri && sources.has(iri)) throw new Error('Duplicate source identity')
    if (iri) sources.add(iri)
    const slug = baseSlug(row)
    if (!groups.has(slug)) groups.set(slug, [])
    groups.get(slug).push(row)
  }
  for (const [base, group] of groups) for (const row of group) {
    let slug = base
    if (group.length > 1) {
      const iri = row.doc.canonical_iri
      if (typeof iri !== 'string' || !/^https:\/\/openphar\.org\//.test(iri)) throw new Error('Collision requires a canonical source identity')
      slug += '--' + createHash('sha256').update(iri).digest('hex').slice(0, 16)
    }
    if (used.has(slug)) throw new Error('Source route collision')
    used.add(slug)
    result.set(row, slug)
  }
  return result
}
