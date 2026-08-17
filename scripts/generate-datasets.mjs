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

// CAS numbers live under different keys per SSOT shape. Index metadata
// (facts, not copyrightable expression) — carried for restricted datasets too.
function casOf(doc) {
  const v = doc.identifiers?.cas_number
    || doc.identifiers?.cas_rn
    || doc.source_meta?.cas_rn
    || doc.chemistry?.cas_rn
    || doc.definition?.cas_registry_number
    || doc.cas_rn
    || doc.casNumber
  return typeof v === 'string' && /^\d{2,7}-\d{2}-\d$/.test(v.trim()) ? v.trim() : null
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
  // Single-file list corpora (e.g. ICH Q4B equivalence table)
  if (cfg.generate.kind === 'ich-methods') {
    return buildIchMethods(id, cfg)
  }
  const repoDir = path.resolve(ROOT, cfg.generate.repo)
  const globs = Array.isArray(cfg.generate.glob) ? cfg.generate.glob : [cfg.generate.glob]
  // { file, base } pairs — the glob's static base dir is what categoryOf
  // must be relative to, or container dirs ('semantic-yaml', edition dirs)
  // leak in as categories.
  const files = []
  for (const g of globs) {
    const baseDir = path.join(repoDir, g.split('**')[0].replace(/\/[^/]*\*[^/]*$/, '/').replace(/\/[^/]*\.yaml$/, ''))
    for (const f of walk(baseDir, g.replace(/^[^*]*\*\//, '**/'), cfg.generate.exclude)) {
      files.push({ file: f, base: baseDir })
    }
  }
  const graph = []
  let skipped = 0

  for (const { file, base } of files) {
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
    const rel = path.relative(base, file)
    const docEdition = typeof doc.edition === 'string' ? doc.edition : null
    const labels = labelsOf(doc)
    const sectionId = doc.classification?.section_id
    const entry = {
      '@id': `https://www.openphar.org/data/${id}/monographs/${slug}`,
      '@type': cfg.rights === 'title-only' ? 'TitleIndexEntry' : 'IndexedMonograph',
      prefLabel: cfg.rights === 'title-only' ? { en: Object.values(labels)[0] } : labels,
      monographId: (typeof sectionId === 'string' || typeof sectionId === 'number') ? String(sectionId) : (typeof doc.monographId === 'string' ? doc.monographId : undefined),
      edition: docEdition || cfg.edition,
      category: (typeof doc.category === 'string' && doc.category) || categoryOf(rel),
      ...(casOf(doc) ? { casNumber: casOf(doc) } : {})
    }

    if (cfg.rights !== 'title-only') {
      const chem = doc.chemistry || {}
      if (chem.molecular_formula) entry.molecularFormula = chem.molecular_formula
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

// ICH Q4B harmonized-method equivalence table → one entry per method concept,
// with per-publisher chapter codes as sections.
function buildIchMethods(id, cfg) {
  const file = path.resolve(ROOT, cfg.generate.repo, cfg.generate.file)
  const rows = yamlLoad(fs.readFileSync(file, 'utf-8'))
  const graph = rows.map(r => {
    const slug = String(r.concept).replace(/_/g, '-').toLowerCase()
    const chapters = (r.chapters || []).map(c => ({
      name: `${c.publisher} ${c.code || ''}`.trim(),
      text: `Chapter ${c.code} (${c.publisher}) — ${c.source === 'ich_official' ? 'ICH Q4B official equivalence' : `${c.source} (confidence: ${c.confidence || 'n/a'})`}`
    }))
    return {
      '@id': `https://www.openphar.org/data/${id}/methods/${slug}`,
      '@type': 'IndexedMonograph',
      prefLabel: { en: r.name_en },
      edition: cfg.edition,
      category: 'methods',
      harmonisationStatus: r.harmonisation_status,
      ichAnnex: r.ich_annex,
      definition: {
        en: `${r.name_en} — ICH Q4B harmonised analytical method (${r.ich_annex}, ${r.harmonisation_status}). Equivalent chapters: ${chapters.map(c => c.name).join(' · ')}.`
      },
      sections: chapters
    }
  })

  // Guideline + annex documents (Q4A, Q4B R1, FAQs, per-annex texts)
  for (const g of cfg.generate.docs_globs || []) {
    const dir = path.join(path.resolve(ROOT, cfg.generate.repo), path.dirname(g))
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.yaml'))) {
      let doc
      try { doc = yamlLoad(fs.readFileSync(path.join(dir, name), 'utf-8')) } catch { continue }
      if (!doc?.title || !doc.canonical_iri) continue
      const cat = doc.document_type === 'q4b_annex' ? 'annexes' : 'guidelines'
      const sections = (doc.sections || []).map(s => ({
        name: String(s.name || s.number || ''),
        text: String(s.text || '').slice(0, MAX_SECTION_CHARS)
      })).filter(x => x.text)
      for (const rc of doc.regional_chapters || []) {
        sections.push({ name: `${rc.pharmacopoeia} ${rc.chapter_code}`, text: rc.chapter_title || '' })
      }
      graph.push({
        '@id': `https://www.openphar.org/data/${id}/methods/${slugify(doc.canonical_iri.split('/').pop())}`,
        '@type': 'IndexedMonograph',
        prefLabel: { en: doc.title },
        monographId: doc.code,
        edition: cfg.edition,
        category: cat,
        harmonisationStatus: doc.status,
        ichAnnex: doc.code,
        definition: doc.method ? { en: String(doc.method) } : undefined,
        sections: sections.length ? sections : undefined
      })
    }
  }
  return { graph, skipped: 0, total: rows.length }
}

function slugify(t) {
  const base = String(t).toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  if (!base) return 'entry'
  // CJK slugs must stay under ext4's 255-byte filename limit (CI runners);
  // 60 chars ≈ ≤180 UTF-8 bytes, with a stable hash suffix to avoid collisions.
  if (base.length <= 60) return base
  let h = 0
  for (const ch of base) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return base.slice(0, 60).replace(/-+$/, '') + '-' + h.toString(36)
}

// KP aggregate corpora: one YAML per section, each holding a list of documents
// (methods / articles / dosage forms / chapters) plus clause-based notices.
function buildKpCorpora(corpora, repoDir, edition) {
  const entries = []
  for (const g of corpora.globs || []) {
    const dir = path.join(repoDir, path.dirname(g))
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.yaml'))) {
      let doc
      try { doc = yamlLoad(fs.readFileSync(path.join(dir, name), 'utf-8')) } catch { continue }
      if (!doc) continue
      const lang = typeof doc.language === 'string' ? doc.language : 'ko'
      const labels = (en, ko, fallback) => {
        const out = {}
        if (en) out.en = en
        if (ko) out.ko = ko
        if (!Object.keys(out).length && fallback) out.ko = fallback
        return out
      }

      for (const m of doc.methods || []) {
        const pl = labels(m.title_en, m.title_ko, m.title)
        if (!Object.keys(pl).length) continue
        entries.push({
          '@id': `https://www.openphar.org/data/kp/monographs/${slugify(m.title_en || m.title_ko || m.title)}`,
          '@type': 'IndexedMonograph',
          prefLabel: pl,
          monographId: m.number != null ? String(m.number) : undefined,
          edition, category: 'general-tests',
          definition: m.body ? { [lang]: String(m.body).slice(0, MAX_DEF_CHARS) } : undefined
        })
      }
      for (const a of doc.articles || []) {
        const pl = labels(a.title_en, a.title_ko, a.title)
        if (!Object.keys(pl).length) continue
        entries.push({
          '@id': `https://www.openphar.org/data/kp/monographs/${slugify(a.title_en || a.title_ko || a.title)}`,
          '@type': 'IndexedMonograph',
          prefLabel: pl,
          edition, category: 'general-information',
          definition: a.body ? { [lang]: String(a.body).slice(0, MAX_DEF_CHARS) } : undefined
        })
      }
      for (const d of [...(doc.dosage_forms || []), ...(doc.chapters || [])]) {
        const pl = labels(d.title_en, d.title_ko, d.title)
        if (!Object.keys(pl).length) continue
        entries.push({
          '@id': `https://www.openphar.org/data/kp/monographs/${slugify(d.title_en || d.title_ko || d.title)}`,
          '@type': 'IndexedMonograph',
          prefLabel: pl,
          monographId: d.number != null ? String(d.number) : undefined,
          edition, category: 'dosage-forms',
          sections: (d.clauses || []).map(c => ({
            name: String(c.number || c.title || ''),
            text: String(c.text || c.body || '').slice(0, MAX_SECTION_CHARS)
          })).filter(x => x.text)
        })
      }
      // clause-based aggregate (General Notices) stays one entry with sections
      if (doc.clauses && !doc.methods && !doc.articles && !doc.dosage_forms) {
        const t = doc.title || {}
        const pl = labels(t.en, t.ko)
        if (Object.keys(pl).length) entries.push({
          '@id': `https://www.openphar.org/data/kp/monographs/${slugify(t.en || t.ko)}`,
          '@type': 'IndexedMonograph',
          prefLabel: pl,
          edition, category: 'general-notices',
          sections: doc.clauses.map(c => ({
            name: String(c.number || ''),
            text: String(c.text || '').slice(0, MAX_SECTION_CHARS)
          })).filter(x => x.text)
        })
      }
    }
  }
  // distinct @ids: repeated method titles across parts get a number suffix
  const seen = new Set()
  const out = []
  for (const e of entries) {
    if (!e.prefLabel || !Object.values(e.prefLabel).some(Boolean)) continue
    let id = e['@id']
    if (seen.has(id)) id = `${id}-${e.monographId || out.length}`
    if (seen.has(id)) continue
    seen.add(id)
    e['@id'] = id
    out.push(e)
  }
  return out
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
    if (cfg.generate.corpora) {
      graph.push(...buildKpCorpora(cfg.generate.corpora, path.resolve(ROOT, cfg.generate.repo), cfg.edition))
    }
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

// Slim cross-dataset search index (titles only — no restricted body fields)
// plus a cross-dataset link index: entries sharing a normalized title across
// two or more datasets link to each other (open and restricted alike).
function normTitle(t) {
  return String(t).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const groups = new Map() // normTitle -> [{d, s, c, t, k}]
for (const e of registryOut) {
  const f = path.join(DATA_DIR, e.id, `${e.id}-monographs.jsonld`)
  if (!fs.existsSync(f)) continue
  const g = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
  const restricted = e.rights === 'title-only'
  for (const m of g.filter(isEntry)) {
    const label = m.prefLabel || {}
    const title = label.en || label.ja || label.la || Object.values(label)[0]
    if (!title) continue
    const s = m['@id'].split('/').pop()
    // category must match the route generator (vite.config.js): explicit field,
    // else the second path segment of @id (/data/{d}/{category}/{slug})
    const cat = (typeof m.category === 'string' && m.category)
      || ((m['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//) || [])[1]
      || 'monographs'
    const native = Object.entries(label).find(([lang]) => lang !== 'en')?.[1] || ''
    const cas = typeof m.casNumber === 'string' ? m.casNumber : null
    const member = { d: e.id, s, c: cat, t: String(title), k: restricted ? 0 : 1 }
    searchIndex.push({
      d: e.id, s, c: cat, t: String(title), k: restricted ? 0 : 1,
      ...(native && native !== title ? { n: String(native), l: Object.keys(label).find(x => label[x] === native) } : {}),
      ...(cas ? { x: cas } : {})
    })
    const keys = Object.values(label).map(normTitle).filter(Boolean)
    if (cas) keys.push('cas:' + cas)
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, [])
      if (!groups.get(key).some(x => x.d === e.id && x.s === s)) {
        groups.get(key).push(member)
      }
    }
  }
}

const crossLinks = {}
for (const members of groups.values()) {
  const datasets = new Set(members.map(m => m.d))
  if (datasets.size < 2) continue
  for (const m of members) {
    const key = `${m.d}/${m.s}`
    const rest = members.filter(x => !(x.d === m.d && x.s === m.s))
    ;(crossLinks[key] ||= []).push(...rest)
  }
}
for (const key of Object.keys(crossLinks)) {
  const seen = new Set()
  crossLinks[key] = crossLinks[key].filter(x => {
    const id = x.d + '/' + x.s
    if (seen.has(id)) return false
    seen.add(id)
    return true
  }).sort((a, b) => a.k === b.k ? a.d.localeCompare(b.d) : b.k - a.k)
}
fs.writeFileSync(path.join(DATA_DIR, 'cross-links.json'), JSON.stringify(crossLinks))
console.log(`✓ cross-links.json (${Object.keys(crossLinks).length} linked entries)`)

fs.writeFileSync(path.join(DATA_DIR, 'registry.json'), JSON.stringify(registryOut))
fs.writeFileSync(path.join(DATA_DIR, 'search-index.json'), JSON.stringify(searchIndex))
console.log(`✓ registry.json (${registryOut.length} datasets), search-index.json (${searchIndex.length} titles)`)
