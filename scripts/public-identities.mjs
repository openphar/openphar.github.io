// Public factual identity contract: PRODUCTION_SURFACE rights-audit §4.
// All channels share this projection; private evidence/advisory edges stay private.
const text = value => typeof value === 'string' && value.trim() ? value : undefined
const strings = values => [...new Set((Array.isArray(values) ? values : [values]).filter(text))]
const nameKeys = new Set(['en', 'inn', 'ja', 'ko', 'zh', 'th', 'la', 'iast', 'devanagari', 'zh-hans', 'zh-hant'])
function names(value, arrays) {
  return Object.fromEntries(Object.entries(value || {}).filter(([k]) => nameKeys.has(k))
    .flatMap(([k, v]) => arrays ? (strings(v).length ? [[k, strings(v)]] : []) : (text(v) ? [[k, v]] : [])))
}
export function projectIdentity(sub, entries, activeIds) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sub.id) || sub.canonical_iri !== `https://openphar.org/substance/${sub.id}`) throw new Error('Invalid identity')
  const identifiers = {}
  const cas = x => typeof x === 'string' && /^\d{2,7}-\d{2}-\d$/.test(x)
  if (cas(sub.identifiers?.cas_rn)) identifiers.cas_rn = sub.identifiers.cas_rn
  if (Array.isArray(sub.identifiers?.cas_rn_candidates)) identifiers.cas_rn_candidates = sub.identifiers.cas_rn_candidates.filter(cas)
  return {
    id: sub.id, iri: sub.canonical_iri,
    preferred_name: names(sub.preferred_name, false), names: names(sub.names, true),
    synonyms: strings(sub.synonyms), identifiers,
    match_basis: strings(sub.match_basis).filter(x => ['name', 'alias', 'synonym', 'cas', 'zh-bridge'].includes(x)),
    form_relations: (sub.form_relations || []).filter(r => activeIds.has(r.slug)
      && r.iri === `https://openphar.org/substance/${r.slug}`
      && ['salt-or-hydrate-of-this', 'this-is-salt-or-hydrate-of'].includes(r.relation))
      .map(({ slug, iri, relation }) => ({ slug, iri, relation })),
    entries: entries.map(({ d, s, c, t, k, edition }) => ({ d, s, c, t, k, edition }))
  }
}
const publishers = { eu: 'EP', uk: 'BP', us: 'USP', chp: 'ChP', hk: 'HKCMMS', jp: 'JP', kp: 'KP', ip: 'IP', phint: 'PhInt', ayp: 'API', tp: 'TP', thp: 'THP' }
const editionKey = value => typeof value === 'string' ? value.toLowerCase().replace(/^(\d+)(?:st|nd|rd|th) edition$/, 'phint-$1') : null
// Source-specific adapters only. A source occurrence must agree with its reverse
// mapping, publisher, edition and complete public route; ambiguous matches fail shut.
export function createCurrentIdentityJoin(substances, reverse) {
  const bySource = new Map()
  for (const sub of substances) for (const o of sub.occurrences || []) {
    if (reverse[o.entry] !== sub.id || !editionKey(o.edition)) continue
    const url = new URL(o.entry)
    if (url.origin !== 'https://openphar.org') continue
    const p = url.pathname.split('/').filter(Boolean)
    const sourcePublishers = { EP: ['ep'], BP: ['bp'], IP: ['ip'], USP: ['usp'], ChP: ['chp'], PhInt: ['phint'], HKCMMS: ['hkcmms', 'hkcmss'], JP: ['jp'], KP: ['kp'], TP: ['tp'], THP: ['thp'] }
    if (p[0] !== 'data' || !sourcePublishers[o.publisher]?.includes(p[1])) continue
    if (!['EP', 'BP', 'IP'].includes(o.publisher)) {
      const expected = editionKey(o.edition).replace(/^(tp|thp)-/, '')
      if (p[2] !== expected) continue
    }
    let slug
    if (['EP', 'BP', 'IP'].includes(o.publisher) && p.length === 4 && p[2] === 'entry') slug = p[3]
    else if (o.publisher === 'ChP' && p.length === 5 && p[3] === 'ouryao' && /^entry-/.test(p[4])) slug = p[4].slice(6)
    else if (['USP', 'ChP', 'PhInt', 'HKCMMS', 'TP', 'THP'].includes(o.publisher) && p.length === 5 && p[3] === 'entry') slug = p[4]
    else if (['JP', 'KP'].includes(o.publisher) && p.includes('monograph')) slug = p.at(-1)
    if (!slug) continue
    const key = JSON.stringify([o.publisher, editionKey(o.edition), slug])
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key).push({ id: sub.id, source: o.entry })
  }
  return (dataset, category, slug, edition) => {
    const publisher = publishers[dataset]
    // JP's category is carried by the vendored canonical graph. All other
    // adapters bind only monograph routes, not same-slug appendices/procedures.
    const allowed = dataset === 'jp' ? !['appendices', 'general-tests', 'general-notices'].includes(category)
      : dataset === 'kp' ? ['part1', 'part2', 'monographs'].includes(category)
      : dataset === 'uk' ? ['medicinal-and-pharmaceutical-substances', 'formulated-preparations', 'veterinary', 'monographs'].includes(category)
      : category === 'monographs'
    if (!allowed) return undefined
    const matches = bySource.get(JSON.stringify([publisher, editionKey(edition), slug])) || []
    return new Set(matches.map(x => x.id)).size === 1 ? { id: matches[0].id, sources: matches.map(x => x.source) } : undefined
  }
}
