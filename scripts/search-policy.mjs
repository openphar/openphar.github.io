import fs from 'node:fs'
import path from 'node:path'

// Compact equivalents of identity/route, prefLabel, category and casNumber.
// Substance joins and pooled/source aliases are internal computation; a
// title-only entry cannot distribute them through the search payload.
const TITLE_FIELDS = new Set(['d', 's', 'c', 't', 'k', 'x'])

export function projectSearchIndex(rows, datasets) {
  if (!datasets || typeof datasets !== 'object' || Array.isArray(datasets) || !Object.keys(datasets).length) throw new Error('Missing dataset policy')
  for (const [id, cfg] of Object.entries(datasets)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !['full', 'title-only'].includes(cfg?.rights)) throw new Error('Invalid dataset policy')
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('Missing search rows')
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !Object.hasOwn(datasets, row.d) || !datasets[row.d]?.rights) throw new Error('Unknown search dataset policy')
    if (['d', 's', 'c', 't'].some(key => typeof row[key] !== 'string' || !row[key].trim())) throw new Error('Invalid search identity/title')
    if (Object.hasOwn(row, 'x') && (typeof row.x !== 'string' || !row.x.trim())) throw new Error('Invalid search CAS')
    const restricted = datasets[row.d].rights === 'title-only'
    if (row.k !== (restricted ? 0 : 1)) throw new Error('Search rights marker disagrees with policy')
    return restricted ? Object.fromEntries(Object.entries(row).filter(([key]) => TITLE_FIELDS.has(key))) : row
  })
}

function isEntry(m) {
  const types = Array.isArray(m['@type']) ? m['@type'] : (m['@type'] ? [m['@type']] : [])
  return types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry'))
    || (!types.length && !!(m.prefLabel || m['rdfs:label']))
}

export function reindexVendoredSearch(root, datasets) {
  const data = path.join(root, 'data')
  const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'))
  const rows = read('search-index.json')
  const projected = projectSearchIndex(rows, datasets)
  const registry = read('registry.json')
  if (!Array.isArray(registry) || !registry.length) throw new Error('Missing vendored registry')
  if (new Set(registry.map(e => e.id)).size !== registry.length
    || registry.length !== Object.keys(datasets).length) throw new Error('Incomplete vendored registry')
  const routes = new Map()
  for (const entry of registry) {
    if (!Object.hasOwn(datasets, entry.id) || datasets[entry.id].rights !== entry.rights
      || !Number.isInteger(entry.count) || entry.count <= 0) throw new Error('Invalid vendored dataset policy/count')
    const file = `${entry.id}/${entry.id}-monographs.jsonld`
    const graph = read(file)['@graph']
    if (!Array.isArray(graph) || !graph.length) throw new Error('Missing vendored graph')
    const entries = graph.filter(isEntry)
    if (entries.length !== entry.count) throw new Error('Vendored graph count disagrees with registry')
    for (const m of entries) {
      if (typeof m['@id'] !== 'string') throw new Error('Missing vendored graph identity')
      const slug = m['@id'].split('/').pop()
      const cat = (typeof m.category === 'string' && m.category)
        || (m['@id'].match(/\/data\/[^/]+\/([^/]+)\//) || [])[1] || 'monographs'
      const key = JSON.stringify([entry.id, slug, cat])
      routes.set(key, (routes.get(key) || 0) + 1)
    }
  }
  for (const row of rows) {
    const key = JSON.stringify([row.d, row.s, row.c])
    const count = routes.get(key)
    if (!count) throw new Error('Search row has no vendored graph route')
    if (count === 1) routes.delete(key)
    else routes.set(key, count - 1)
  }
  if (routes.size) throw new Error('Search index is incomplete for vendored graphs')
  // All validation and projection finishes before the only write in this mode.
  fs.writeFileSync(path.join(data, 'search-index.json'), JSON.stringify(projected))
  console.log(`✓ reindexed search-index.json (${projected.length} titles; vendored inputs only)`)
}
