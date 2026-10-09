// Rights enforcement gate: datasets marked `rights: title-only` (USP,
// Ph.Eur., BP — copyrighted) must emit ONLY TitleIndexEntry records with
// the allow-listed fields. Run in CI and locally after `npm run generate`.
//
//   node scripts/assert-rights.mjs
//
// Exits 1 with specifics on any violation.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as yamlLoad } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registry = yamlLoad(fs.readFileSync(path.join(ROOT, 'registry/datasets.yml'), 'utf-8'))
// casNumber is allow-listed deliberately: CAS Registry Numbers are
// non-copyrightable factual identifiers (index metadata, not body text) and
// are required for cross-publisher counterpart matching. Everything else —
// definitions, sections, tests, any monograph body — must never appear.
const ALLOWED = new Set(['@id', '@type', 'prefLabel', 'edition', 'category', 'casNumber'])

let violations = 0
let checked = 0

for (const [id, ds] of Object.entries(registry.datasets || {})) {
  if (ds.rights !== 'title-only') continue
  const file = path.join(ROOT, 'data', id, `${id}-monographs.jsonld`)
  if (!fs.existsSync(file)) {
    console.log(`✗ ${id}: title-only dataset has no generated file`)
    violations++
    continue
  }
  const graph = JSON.parse(fs.readFileSync(file, 'utf-8'))['@graph'] || []
  for (const entry of graph) {
    if (typeof entry !== 'object' || entry === null) continue
    checked++
    const type = String(entry['@type'] || '')
    if (type !== 'TitleIndexEntry') {
      console.log(`✗ ${id}: entry ${entry['@id']} is @type ${type}, must be TitleIndexEntry`)
      violations++
      continue
    }
    const extra = Object.keys(entry).filter(k => !ALLOWED.has(k))
    if (extra.length) {
      console.log(`✗ ${id}: entry ${entry['@id']} exposes restricted fields: ${extra.join(', ')}`)
      violations++
    }
  }
}

if (violations) {
  console.error(`\nRIGHTS VIOLATIONS: ${violations} (checked ${checked} restricted entries)`)
  process.exit(1)
}
console.log(`✓ rights ok: ${checked} restricted entries carry titles only`)
