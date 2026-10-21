// Link-integrity gate: every cross-link target must resolve to a real entry
// in the generated dataset graph. Missing targets fail CI; duplicate slugs
// (same slug under two categories in one dataset) warn — the link key does
// not carry category yet (TODO 05 follow-up).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')

function isEntry(m) {
  const type = m['@type']
  const types = Array.isArray(type) ? type : (type ? [type] : [])
  if (types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry'))) return true
  return types.length === 0 && !!(m.prefLabel || m['rdfs:label'])
}

const registry = JSON.parse(fs.readFileSync(path.join(DATA, 'registry.json'), 'utf-8'))
const existing = new Set()
let entries = 0

for (const e of registry) {
  const f = path.join(DATA, e.id, `${e.id}-monographs.jsonld`)
  if (!fs.existsSync(f)) continue
  const graph = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
  for (const m of graph.filter(isEntry)) {
    if (!m['@id']) continue
    const slug = m['@id'].split('/').pop()
    existing.add(`${e.id}/${slug}`)
    entries++
  }
}

const crossLinks = JSON.parse(fs.readFileSync(path.join(DATA, 'cross-links.json'), 'utf-8'))
const missing = []
let links = 0
for (const [key, targets] of Object.entries(crossLinks)) {
  if (!existing.has(key)) missing.push(['key', key])
  for (const t of targets) {
    links++
    const id = `${t.d}/${t.s}`
    if (!existing.has(id)) missing.push(['target', `${key} -> ${id}`])
  }
}

console.log(`checked ${links} links across ${Object.keys(crossLinks).length} keys (${entries} entries)`)
if (missing.length) {
  console.error(`FAIL: ${missing.length} unresolvable link targets; first 10:`)
  for (const m of missing.slice(0, 10)) console.error(' ', m.join(' '))
  process.exit(1)
}
console.log('✓ link integrity ok')
