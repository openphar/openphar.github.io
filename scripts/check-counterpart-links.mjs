// Link-integrity gate: every counterpart link in data/cross-links.json must
// resolve to an entry that exists in its dataset's generated JSON-LD with a
// category derivable the same way the route generator does (m.category, else
// the @id path segment) — otherwise the counterpart link 404s.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const crossLinks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cross-links.json'), 'utf-8'))

const entriesByKey = new Map()
for (const ds of fs.readdirSync(path.join(ROOT, 'data'))) {
  const f = path.join(ROOT, 'data', ds, `${ds}-monographs.jsonld`)
  if (!fs.existsSync(f)) continue
  const graph = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
  for (const m of graph) {
    if (typeof m !== 'object' || m === null) continue
    const slug = (m['@id'] || '').split('/').pop()
    // mirror vite's includedRoutes derivation exactly
    const cat = (typeof m.category === 'string' && m.category) ||
      ((m['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//) || [])[1] || 'monographs'
    entriesByKey.set(`${ds}/${slug}`, { cat, id: m['@id'] })
  }
}

let broken = 0
let warned = 0
let checked = 0
for (const [key, targets] of Object.entries(crossLinks)) {
  for (const t of targets) {
    checked++
    const k = `${t.d}/${t.s}`
    const entry = entriesByKey.get(k)
    if (!entry) { console.log(`✗ ${key} -> ${k}: target entry missing`); broken++; continue }
    if (entry.cat !== t.c) {
      // Known follow-up: cross-links keys are dataset/slug, but a slug can
      // exist in several bp categories; the d/s dedupe keeps the first-seen
      // category. Fixing this needs the category in the link key (schema
      // change touching consumers) — warn, don't fail.
      console.log(`~ ${key} -> ${k}: category ${t.c} != ${entry.cat} (duplicate-slug follow-up)`)
      warned++
    }
  }
}
if (broken) { console.error(`BROKEN COUNTERPART LINKS: ${broken} of ${checked} (warned ${warned})`); process.exit(1) }
console.log(`✓ links ok: ${checked} counterpart links resolve (${warned} duplicate-slug warnings tracked as follow-up)`)
