// Vendored JP and Ph.Int. graphs use different IRIs from their source feeds.
// A numeric Ph.Int. entry slug can denote different drugs in different editions.
function editionNumber(publisher, edition) {
  const value = String(edition || '').trim()
  if (publisher === 'jp') return value.match(/^jp[- ]?(\d+)$/i)?.[1]
  if (publisher === 'phint') {
    return value.match(/^phint[- ]?(\d+)$/i)?.[1]
      || value.match(/^(\d+)(?:st|nd|rd|th) edition$/i)?.[1]
  }
}

export function createVendoredRegistryJoin(mapping) {
  const identities = new Map()
  const namedJapaneseIdentities = new Map()
  for (const [iri, substance] of Object.entries(mapping)) {
    const match = iri.match(/^https:\/\/openphar\.org\/data\/(jp|phint)\/([^/]+)\/.+\/([^/]+)$/)
    if (!match) continue
    const [, publisher, edition, slug] = match
    const number = editionNumber(publisher, edition)
    if (!number) continue
    const key = `${publisher}/${number}/${slug}`
    if (!identities.has(key)) identities.set(key, new Set())
    identities.get(key).add(substance)
    if (publisher === 'jp') {
      if (!namedJapaneseIdentities.has(slug)) namedJapaneseIdentities.set(slug, new Set())
      namedJapaneseIdentities.get(slug).add(substance)
    }
  }
  return (publisher, slug, edition) => {
    const number = editionNumber(publisher, edition)
    // Preserve existing unique whole-name JP joins when that edition was not
    // harvested. Numbered Ph.Int. identifiers cannot use this fallback.
    const matches = number && (identities.get(`${publisher}/${number}/${slug}`)
      || (publisher === 'jp' && namedJapaneseIdentities.get(slug)))
    return matches?.size === 1 ? matches.values().next().value : undefined
  }
}
