// Thai publications are independent. Edition order is declared in the registry;
// source directories remain private and are never inferred as route categories.
export const THAI_CATEGORIES = {
  monograph: 'monographs', appendix: 'appendices',
  'general-notice': 'general-notices', index: 'indexes'
}

export function thaiCategory(doc) {
  const category = THAI_CATEGORIES[doc.classification?.publisher_type]
  if (!category) throw new Error(`Unknown Thai entry type: ${doc.classification?.publisher_type}`)
  return category
}

export function selectThaiEditions(rows, cfg) {
  const ranks = new Map(cfg.editions.map((edition, i) => [edition, i]))
  const excluded = new Set(cfg.exclude_editions || [])
  for (const edition of ranks.keys()) {
    if (!rows.some(row => row.doc.edition === edition)) throw new Error(`Missing Thai edition: ${edition}`)
  }
  const selected = new Map()
  const ledger = []
  const seen = new Set()
  for (const row of rows) {
    const doc = row.doc
    const match = doc.canonical_iri?.match(/^https:\/\/openphar\.org\/data\/(tp|thp)\/([^/]+)\/entry\/([^/]+)$/)
    if (!match || match[1] !== cfg.publisher.toLowerCase() || doc.publisher !== cfg.publisher) {
      throw new Error('Thai source publisher/identity mismatch')
    }
    if (seen.has(doc.canonical_iri)) throw new Error('Duplicate Thai source identity')
    seen.add(doc.canonical_iri)
    thaiCategory(doc)
    if (excluded.has(doc.edition)) {
      ledger.push({ iri: doc.canonical_iri, disposition: 'duplicate-edition-excluded' })
      continue
    }
    if (!ranks.has(doc.edition)) throw new Error(`Undeclared Thai edition: ${doc.edition}`)
    const key = match[3]
    const previous = selected.get(key)
    if (previous && previous.doc.edition === doc.edition) throw new Error('Duplicate Thai slug within edition')
    if (!previous || ranks.get(doc.edition) > ranks.get(previous.doc.edition)) selected.set(key, row)
  }
  for (const row of rows) {
    if (excluded.has(row.doc.edition)) continue
    const winner = selected.get(row.doc.canonical_iri.split('/').pop())
    ledger.push({ iri: row.doc.canonical_iri, selected: winner.doc.canonical_iri,
      disposition: winner === row ? 'selected' : 'superseded' })
  }
  return { rows: [...selected.values()].sort((a, b) => a.doc.canonical_iri.localeCompare(b.doc.canonical_iri)), ledger }
}

export function preserveThaiLegacy(selected, legacyRows) {
  const bySlug = new Map(selected.map(row => [row.doc.canonical_iri.split('/').pop(), row]))
  const rows = [...selected]
  const aliases = { routes: {}, identities: {} }
  const ledger = []
  for (const row of legacyRows) {
    const slug = row.doc.canonical_iri?.split('/').pop()
    if (!slug || row.doc.publisher !== 'THP' || row.doc.edition !== 'THP-1') throw new Error('Unexpected Thai legacy identity')
    const replacement = bySlug.get(slug)
    const category = replacement ? thaiCategory(replacement.doc) : 'monographs'
    const from = `/pharmacopoeia/thp/monographs/${slug}`
    const to = `/pharmacopoeia/tp/${category}/${slug}`
    const oldId = `https://www.openphar.org/data/thp/monographs/${slug}`
    const newId = `https://www.openphar.org/data/tp/${category}/${slug}`
    if (!replacement) rows.push({ ...row, legacy: true, doc: { ...row.doc, publisher: 'TP', edition: 'TP II 2011 (legacy extraction)' } })
    aliases.routes[from] = to
    aliases.identities[oldId] = newId
    ledger.push({ oldId, newId, from, to, disposition: replacement ? 'replaced-by-current-tp' : 'retained-legacy-tp',
      source: row.doc.canonical_iri, selected: replacement?.doc.canonical_iri || row.doc.canonical_iri })
  }
  return { rows, aliases, ledger }
}

// A future herbal slug must never silently take over a historical TP URL.
export function validateThaiAliases(aliases, routes) {
  for (const [from, to] of Object.entries(aliases.routes)) {
    if (routes.has(from)) throw new Error(`Thai legacy route collision: ${from}`)
    if (!routes.has(to)) throw new Error(`Missing Thai legacy target: ${to}`)
  }
}
