#!/usr/bin/env node
// Generates public dataset files from the sibling data repos, driven by
// registry/datasets.yml (declarative — no repo-name or layout conventions).
//
// Outputs (all vendored into this repo):
//   data/{id}/{id}-monographs.jsonld  — per-dataset graph (mode-dependent depth)
//   data/registry.json                — machine-readable registry + entry counts
//   data/search-index.json            — slim cross-dataset title index
//
// Restricted datasets (rights: title-only) emit NOTHING beyond titles/edition/
// category — enforced here at generation time (TODO.deploy/04).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as yamlLoad } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_FILE = path.join(ROOT, 'registry/datasets.yml')
const DATA_DIR = path.join(ROOT, 'data')

const registry = yamlLoad(fs.readFileSync(REGISTRY_FILE, 'utf-8'))
const datasets = registry.datasets

const MAX_DEF_CHARS = 4000
const MAX_SECTION_CHARS = 6000

function titleOf(doc, file) {
  const pick = (v) => (v && typeof v === 'string' ? v.trim() : null)
  if (typeof doc.title === 'string') return pick(doc.title)
  if (doc.title && typeof doc.title === 'object') {
    const t = pick(doc.title.en) || pick(doc.title.english) || pick(doc.title.latin) || pick(doc.title.zh)
    if (t) return t
  }
  const names = doc.names || {}
  return pick(names.en)
    || pick(names.la)
    || pick(names.zh)
    || pick(names.ko)
    || pick(names.first)
    || (Array.isArray(names.english) ? pick(names.english[0]) : null)
    || (names.canonical ? (pick(names.canonical.en) || pick(names.canonical.iast) || pick(names.canonical.latin) || pick(names.canonical.zh)) : null)
}

function slugOf(doc, file) {
  const iri = doc.canonical_iri || ''
  if (iri) return iri.split('/').pop() || path.basename(file, '.yaml')
  return path.basename(file, '.yaml')
}

function categoryOf(relativePath) {
  const parts = relativePath.split(path.sep)
  // deepest dir under the glob base carries the category (uk: medicinal-…; ayp: metals)
  const dir = parts.length > 1 ? parts[parts.length - 2] : 'monographs'
  return dir.replace(/_/g, '-')
}

function sectionTexts(doc) {
  return (doc.sections || doc.raw_sections || [])
    .filter(s => s && s.name && s.text)
    .map(s => ({ name: String(s.name), text: String(s.text).trim() }))
}

function walk(globBase, pattern, exclude) {
  const files = []
  const re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\*\.\*/g, '.*'))
  const exRe = exclude ? new RegExp(exclude.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')) : null
  ;(function rec(dir) {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) rec(p)
      else if (e.name.endsWith('.yaml') && re.test(p) && !(exRe && exRe.test(e.name))) files.push(p)
    }
  })(globBase)
  return files
}

function buildGraph(id, cfg) {
  const repoDir = path.resolve(ROOT, cfg.generate.repo)
  const globRoot = path.join(repoDir, cfg.generate.glob.split('/**')[0].replace(/\/[^/]*\.yaml$/, ''))
  // derive the static base dir of the glob (strip ** and file patterns)
  const baseDir = path.join(repoDir, cfg.generate.glob.split('**')[0].replace(/\/[^/]*\*[^/]*$/, '/').replace(/\/[^/]*\.yaml$/, ''))
  const files = walk(baseDir, cfg.generate.glob.replace(/^[^*]*\*\//, '**/'), cfg.generate.exclude)
  const graph = []
  let skipped = 0

  for (const file of files) {
    let doc
    try {
      doc = yamlLoad(fs.readFileSync(file, 'utf-8'))
    } catch {
      skipped++
      continue
    }
    if (!doc || typeof doc !== 'object') { skipped++; continue }

    const title = titleOf(doc, file)
    if (!title) { skipped++; continue }

    const slug = slugOf(doc, file)
    const rel = path.relative(globRoot, file)
    const docEdition = typeof doc.edition === 'string' ? doc.edition : null
    const entry = {
      '@id': `https://www.openphar.org/data/${id}/monographs/${slug}`,
      '@type': cfg.rights === 'title-only' ? 'TitleIndexEntry' : 'IndexedMonograph',
      prefLabel: { en: title },
      edition: docEdition || cfg.edition,
      category: (typeof doc.category === 'string' && doc.category) || categoryOf(rel)
    }

    if (cfg.rights !== 'title-only') {
      const sections = sectionTexts(doc)
      const plainDef = typeof doc.definition === 'string' ? doc.definition.trim() : null
      if (sections.length) {
        const def = sections.find(s => /definition/i.test(s.name)) || sections[0]
        entry.definition = { en: (plainDef || def.text).slice(0, MAX_DEF_CHARS) }
        if (cfg.generate.mode === 'full') {
          entry.sections = sections.slice(0, 20).map(s => ({
            name: s.name, text: s.text.slice(0, MAX_SECTION_CHARS)
          }))
        }
      } else if (plainDef) {
        entry.definition = { en: plainDef.slice(0, MAX_DEF_CHARS) }
      }
    }
    graph.push(entry)
  }
  return { graph, skipped, total: files.length }
}

// ---- run ----
const registryOut = []
const searchIndex = []

for (const [id, cfg] of Object.entries(datasets)) {
  const entry = {
    id,
    name: cfg.name,
    short: cfg.short,
    nativeName: cfg.nativeName || null,
    country: cfg.country,
    organization: cfg.organization,
    edition: cfg.edition,
    rights: cfg.rights,
    status: cfg.status,
    sourceUrl: cfg.source?.url || null,
    restriction: cfg.restriction || null,
    browserPath: cfg.browser?.path || null,
    count: 0
  }

  if (cfg.generate) {
    const { graph, skipped, total } = buildGraph(id, cfg)
    const outFile = path.join(DATA_DIR, id, `${id}-monographs.jsonld`)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify({
      '@context': 'https://www.openphar.org/ontology/context/pharmacopoeia.jsonld',
      '@graph': graph
    }))
    entry.count = graph.length
    console.log(`✓ ${id}: ${graph.length} entries (${skipped} skipped of ${total} files) -> ${path.relative(ROOT, outFile)}`)
  } else {
    // vendored upstream datasets (jp, phint) — count from their existing files
    for (const vendored of ['jp', 'phint']) {
      if (id !== vendored) continue
      const f = path.join(DATA_DIR, vendored, `${vendored}-monographs.jsonld`)
      if (fs.existsSync(f)) {
        const g = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
        entry.count = g.filter(m => {
          const t = m['@type']
          return Array.isArray(t) ? t.some(x => String(x).endsWith('Monograph')) : String(t).endsWith('Monograph')
        }).length
      }
    }
  }

  registryOut.push(entry)
}

// slim cross-dataset search index (titles only — no restricted body fields)
for (const e of registryOut) {
  const f = path.join(DATA_DIR, e.id, `${e.id}-monographs.jsonld`)
  if (!fs.existsSync(f)) continue
  const g = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
  for (const m of g) {
    const label = m.prefLabel || {}
    const title = label.en || label.ja || label.la || Object.values(label)[0]
    if (!title) continue
    searchIndex.push({ d: e.id, s: m['@id'].split('/').pop(), c: m.category || 'monographs', t: String(title), k: e.rights === 'title-only' ? 0 : 1 })
  }
}

fs.writeFileSync(path.join(DATA_DIR, 'registry.json'), JSON.stringify(registryOut))
fs.writeFileSync(path.join(DATA_DIR, 'search-index.json'), JSON.stringify(searchIndex))
console.log(`✓ registry.json (${registryOut.length} datasets), search-index.json (${searchIndex.length} titles)`)
