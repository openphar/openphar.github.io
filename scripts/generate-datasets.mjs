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

// Language-tagged labels from the various SSOT shapes (en preferred, kept
// alongside ko/zh/etc. when present)
function labelsOf(doc) {
  const pick = (v) => (v && typeof v === 'string' ? v.trim() : null)
  const out = {}
  const set = (k, v) => { if (v && !out[k]) out[k] = v }

  if (typeof doc.title === 'string') {
    set('en', pick(doc.title))
  } else if (doc.title && typeof doc.title === 'object') {
    set('en', pick(doc.title.en) || pick(doc.title.english))
    set('la', pick(doc.title.latin))
    set('zh', pick(doc.title.zh))
    set('ko', pick(doc.title.ko))
  }

  const names = doc.names || {}
  set('en', pick(names.en))
  set('la', pick(names.la))
  set('zh', pick(names.zh))
  set('ko', pick(names.ko))
  if (Array.isArray(names.english)) set('en', pick(names.english[0]))
  if (names.canonical) {
    set('en', pick(names.canonical.en))
    set('la', pick(names.canonical.latin) || pick(names.canonical.iast))
    set('zh', pick(names.canonical.zh))
  }
  return out
}

function titleOf(doc) {
  const labels = labelsOf(doc)
  return Object.values(labels)[0] || null
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
    .filter(s => s && (s.name || s.label || s.key) && s.text)
    .map(s => ({ name: String(s.name || s.label || s.key), text: String(s.text).trim() }))
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
    const labels = labelsOf(doc)
    const entry = {
      '@id': `https://www.openphar.org/data/${id}/monographs/${slug}`,
      '@type': cfg.rights === 'title-only' ? 'TitleIndexEntry' : 'IndexedMonograph',
      prefLabel: cfg.rights === 'title-only' ? { en: Object.values(labels)[0] } : labels,
      edition: docEdition || cfg.edition,
      category: (typeof doc.category === 'string' && doc.category) || categoryOf(rel)
    }

    if (cfg.rights !== 'title-only') {
      const chem = doc.chemistry || {}
      if (chem.molecular_formula) entry.molecularFormula = chem.molecular_formula
      if (chem.cas_rn) entry.casNumber = chem.cas_rn
      if (chem.molecular_weight) entry.molecularWeight = chem.molecular_weight
      const defLang = (typeof doc.language === 'string' && doc.language) || Object.keys(labels)[0] || 'en'

      const sections = sectionTexts(doc)
      const plainDef = typeof doc.definition === 'string' ? doc.definition.trim() : null
      if (sections.length) {
        const def = sections.find(s => /definition/i.test(s.name)) || sections[0]
        entry.definition = { [defLang]: (plainDef || def.text).slice(0, MAX_DEF_CHARS) }
        if (cfg.generate.mode === 'full') {
          entry.sections = sections.slice(0, 20).map(s => ({
            name: s.name, text: s.text.slice(0, MAX_SECTION_CHARS)
          }))
        }
      } else if (plainDef) {
        entry.definition = { [defLang]: plainDef.slice(0, MAX_DEF_CHARS) }
      }
    }
    graph.push(entry)
  }
  return { graph, skipped, total: files.length }
}

// An indexable entry: a monograph type, a generated entry type, or
// (phint SSOT shape) a node without @type that still carries a label.
function isEntry(m) {
  const type = m['@type']
  const types = Array.isArray(type) ? type : (type ? [type] : [])
  if (types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry'))) return true
  return types.length === 0 && !!(m.prefLabel || m['rdfs:label'])
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
        entry.count = g.filter(isEntry).length
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
  for (const m of g.filter(isEntry)) {
    const label = m.prefLabel || {}
    const title = label.en || label.ja || label.la || Object.values(label)[0]
    if (!title) continue
    searchIndex.push({ d: e.id, s: m['@id'].split('/').pop(), c: m.category || 'monographs', t: String(title), k: e.rights === 'title-only' ? 0 : 1 })
  }
}

fs.writeFileSync(path.join(DATA_DIR, 'registry.json'), JSON.stringify(registryOut))
fs.writeFileSync(path.join(DATA_DIR, 'search-index.json'), JSON.stringify(searchIndex))
console.log(`✓ registry.json (${registryOut.length} datasets), search-index.json (${searchIndex.length} titles)`)
