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
import { createVendoredRegistryJoin } from './registry-join.mjs'
import { selectThaiEditions, preserveThaiLegacy, thaiCategory, validateThaiAliases } from './thai-editions.mjs'
import { labelsOf, nativeLabelOf, titleLabelOf } from './native-labels.mjs'
import { projectIdentity, createCurrentIdentityJoin } from './public-identities.mjs'
import { projectSearchIndex, reindexVendoredSearch } from './search-policy.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_FILE = path.join(ROOT, 'registry/datasets.yml')
const registry = yamlLoad(fs.readFileSync(REGISTRY_FILE, 'utf-8'))
const datasets = registry.datasets
// Reapply the public search projection to approved vendored inputs only.
if (process.argv.includes('--reindex-search')) {
  if (process.argv.length !== 3) throw new Error('Unknown generator arguments')
  reindexVendoredSearch(ROOT, datasets)
  process.exit(0)
}
// Selected regeneration preserves unrelated vendored scientific graphs. Overrides are invocation-only; private workspace paths never enter data.
const options = { sources: new Map(), selected: null, registryDir: null, evidenceDir: null, refreshIdentities: false }
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i], value = process.argv[i + 1]
  if (!value) throw new Error(`Missing value for ${flag}`)
  if (flag === '--datasets') options.selected = new Set(value.split(','))
  else if (flag === '--source') {
    const split = value.indexOf('=')
    if (split < 1) throw new Error('Expected --source dataset=directory')
    options.sources.set(value.slice(0, split), path.resolve(value.slice(split + 1)))
  } else if (flag === '--registry-dir') options.registryDir = path.resolve(value)
  else if (flag === '--identity-redirects-file') options.identityRedirectsFile = path.resolve(value)
  else if (flag === '--refresh-identities' && value === 'true') options.refreshIdentities = true
  else if (flag === '--evidence-dir') options.evidenceDir = path.resolve(value)
  else throw new Error(`Unknown generator arguments: ${flag}`)
}
const registryDir = options.registryDir || path.resolve(ROOT, '../substance-registry/registry')
const sourceDir = (id, cfg) => options.sources.get(id) || path.resolve(ROOT, cfg.generate.repo)
// Cross-publisher substance identity (openphar/substance-registry). Optional
// sibling: when absent (e.g. CI without private checkouts) counterpart
// matching falls back to title/CAS only.
const ENTRY_TO_SUBSTANCE_FILE = path.join(registryDir, 'entry-to-substance.json')
const entryToSubstance = fs.existsSync(ENTRY_TO_SUBSTANCE_FILE)
  ? JSON.parse(fs.readFileSync(ENTRY_TO_SUBSTANCE_FILE, 'utf-8'))
  : {}
// registry join: corpus canonical_iri -> built hub @id (the registry's
// entry-to-substance.json is keyed on canonical IRIs, hub @ids differ)
const corpusSubstance = new Map()
const corpusSources = new Map()
const resolveVendored = createVendoredRegistryJoin(entryToSubstance)
// fallback join for vendored graphs (jp, phint): publisher+slug -> substance
const HUB_TO_REGISTRY_PUB = { eu: 'ep', us: 'usp', uk: 'bp', hk: 'hkcmms', ayp: 'api' }
const pubSlugSubstance = new Map()
for (const [iri, slug0] of Object.entries(entryToSubstance)) {
  const m0 = iri.match(/^https:\/\/openphar\.org\/data\/([^/]+)\//)
  if (m0) pubSlugSubstance.set(`${m0[1]}/${iri.split('/').pop()}`, slug0)
}
const DATA_DIR = path.join(ROOT, 'data')
const substancesFile = path.join(registryDir, 'substances.json')
const currentSubstances = fs.existsSync(substancesFile) ? JSON.parse(fs.readFileSync(substancesFile, 'utf8')) : null
if (options.refreshIdentities && !currentSubstances) throw new Error('Identity refresh requires a registry')
const refreshIdentities = !!currentSubstances
if (!currentSubstances && fs.existsSync(path.join(DATA_DIR, 'downloads', 'substances.ndjson'))) throw new Error('Identity download requires a source registry projection')
const currentJoin = refreshIdentities ? createCurrentIdentityJoin(currentSubstances, entryToSubstance) : null
// The factual public download intentionally omits source occurrences. A pinned
// private redirect manifest preserves later merges without publishing provenance.
const identityRedirects = options.identityRedirectsFile
  ? JSON.parse(fs.readFileSync(options.identityRedirectsFile, 'utf8')) : {}
const currentIds = new Set((currentSubstances || []).map(sub => sub.id))
if (!identityRedirects || Array.isArray(identityRedirects) || typeof identityRedirects !== 'object'
  || Object.entries(identityRedirects).some(([from, to]) =>
    !/^[a-z0-9][a-z0-9-]*$/.test(from) || currentIds.has(from)
    || typeof to !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(to)
    || !currentIds.has(to))) throw new Error('Invalid identity redirect manifest')
const identityBindings = []


for (const id of [...(options.selected || []), ...options.sources.keys()]) {
  if (!datasets[id]?.generate) throw new Error(`Unknown generated dataset: ${id}`)
}
const thaiEvidence = { selection: {}, legacy: [] }
let routeAliases = null

const MAX_DEF_CHARS = 4000
const MAX_SECTION_CHARS = 6000

function titleOf(doc, publisher) {
  const labels = labelsOf(doc, publisher)
  return titleLabelOf(labels, publisher)
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
  const repoDir = sourceDir(id, cfg)
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
  function* parseRows() {
    for (const { file, base } of files) {
      let doc
      try { doc = yamlLoad(fs.readFileSync(file, 'utf-8')) }
      catch (error) {
        if (cfg.generate.edition_stack) throw error
        skipped++; continue
      }
      if (!doc || typeof doc !== 'object') { skipped++; continue }
      yield { doc, file, base }
    }
  }
  // Only edition stacking needs the complete source set in memory.
  let rows = cfg.generate.edition_stack ? [...parseRows()] : parseRows()
  if (cfg.generate.edition_stack) {
    const result = selectThaiEditions(rows, cfg.generate.edition_stack)
    rows = result.rows
    thaiEvidence.selection[id] = result.ledger
    if (cfg.generate.legacy_glob) {
      const legacyBase = path.join(repoDir, path.dirname(cfg.generate.legacy_glob))
      const legacyRows = walk(legacyBase, '*.yaml').map(file => ({
        file, base: legacyBase, doc: yamlLoad(fs.readFileSync(file, 'utf-8'))
      }))
      if (legacyRows.length !== cfg.generate.legacy_count) throw new Error('Thai legacy source count changed')
      const preserved = preserveThaiLegacy(rows, legacyRows)
      rows = preserved.rows
      routeAliases = preserved.aliases
      thaiEvidence.legacy = preserved.ledger
    }
  }
  for (const { doc, file, base, legacy } of rows) {
    const title = titleOf(doc, cfg.short)
    if (!title) {
      if (cfg.generate.edition_stack) throw new Error('Thai entry missing title')
      skipped++; continue
    }

    const slug = slugOf(doc, file)
    const rel = path.relative(base, file)
    const docEdition = typeof doc.edition === 'string' ? doc.edition : null
    const labels = labelsOf(doc, cfg.short)
    const category = cfg.generate.edition_stack ? (legacy ? 'monographs' : thaiCategory(doc)) : ((typeof doc.category === 'string' && doc.category) || categoryOf(rel))
    const sectionId = doc.classification?.section_id
    const entry = {
      '@id': `https://www.openphar.org/data/${id}/${cfg.generate.edition_stack ? category : 'monographs'}/${slug}`,
      '@type': cfg.rights === 'title-only' ? 'TitleIndexEntry' : 'IndexedMonograph',
      prefLabel: cfg.rights === 'title-only' ? { en: Object.values(labels)[0] } : labels,
      monographId: cfg.rights === 'title-only' ? undefined : (typeof sectionId === 'string' || typeof sectionId === 'number') ? String(sectionId) : (typeof doc.monographId === 'string' ? doc.monographId : undefined),
      edition: docEdition || cfg.edition,
      category,
      ...(casOf(doc) ? { casNumber: casOf(doc) } : {})
    }

    if (!legacy && doc.canonical_iri && entryToSubstance[doc.canonical_iri]) {
      corpusSubstance.set(entry['@id'], entryToSubstance[doc.canonical_iri])
      corpusSources.set(entry['@id'], doc.canonical_iri)
    }

    if (cfg.rights !== 'title-only') {
      const chem = doc.chemistry || {}
      if (chem.molecular_formula) entry.molecularFormula = chem.molecular_formula
      if (chem.molecular_weight) entry.molecularWeight = chem.molecular_weight
      // Preserve editorial-text language independently of display-name script tags.
      const defLang = (typeof doc.language === 'string' && doc.language) || Object.keys(labelsOf(doc))[0] || 'en'

      const sections = sectionTexts(doc).map(section => cfg.generate.edition_stack ? {
        name: section.name.replace(/^Source span .+$/, 'Source text'),
        text: section.text.replace(/!\[\]\(page=[^)]*\)/g, '').trim()
      } : section)
      const plainDef = typeof doc.definition === 'string' ? doc.definition.trim() : (cfg.generate.edition_stack && typeof doc.definition?.text === 'string' ? doc.definition.text.trim() : null)
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
  if (cfg.generate.edition_stack && new Set(graph.map(m => m['@id'])).size !== graph.length) throw new Error('Duplicate Thai hub identity')
  return { graph, skipped, total: files.length }
}

// ICH Q4B harmonized-method equivalence table → one entry per method concept,
// with per-publisher chapter codes as sections.
function buildIchMethods(id, cfg) {
  const file = path.join(sourceDir(id, cfg), cfg.generate.file)
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
    const dir = path.join(sourceDir(id, cfg), path.dirname(g))
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
const existingSearch = options.selected && fs.existsSync(path.join(DATA_DIR, 'search-index.json'))
  ? new Map(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'search-index.json'), 'utf-8')).map(r => [`${r.d}/${r.c}/${r.s}`, r]))
  : new Map()
// Restricted search rows cannot carry identity joins. Recover internal joins
// from the approved occurrence channel using complete routes, never slug guesses.
const approvedOccurrenceSubstances = new Map()
const approvedDir = path.join(DATA_DIR, 'substances')
if (options.selected && fs.existsSync(approvedDir)) {
  for (const name of fs.readdirSync(approvedDir).filter(n => n.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(approvedDir, name), 'utf8'))
    for (const entry of doc.entries || []) {
      const key = JSON.stringify([entry.d, entry.c, entry.s])
      if (!approvedOccurrenceSubstances.has(key)) approvedOccurrenceSubstances.set(key, new Set())
      approvedOccurrenceSubstances.get(key).add(doc.id)
    }
  }
}

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

  if (cfg.generate && (!options.selected || options.selected.has(id))) {
    const { graph, skipped, total } = buildGraph(id, cfg)
    if (cfg.generate.corpora) {
      graph.push(...buildKpCorpora(cfg.generate.corpora, sourceDir(id, cfg), cfg.edition))
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
    // Count existing graphs without regenerating unrelated datasets.
    const f = path.join(DATA_DIR, id, `${id}-monographs.jsonld`)
    if (fs.existsSync(f)) {
      const g = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
      entry.count = g.filter(isEntry).length
    }
  }

  registryOut.push(entry)
}

const aliasesFile = path.join(DATA_DIR, 'route-aliases.json')
const aliasesToCheck = routeAliases || (fs.existsSync(aliasesFile) ? JSON.parse(fs.readFileSync(aliasesFile, 'utf-8')) : null)
if (aliasesToCheck) {
  const routes = new Set()
  for (const { id } of registryOut) {
    const file = path.join(DATA_DIR, id, `${id}-monographs.jsonld`)
    if (!fs.existsSync(file)) continue
    for (const m of (JSON.parse(fs.readFileSync(file, 'utf-8'))['@graph'] || []).filter(isEntry)) {
      const category = m.category || m['@id'].match(/\/data\/[^/]+\/([^/]+)\//)?.[1] || 'monographs'
      routes.add(`/pharmacopoeia/${id}/${category}/${m['@id'].split('/').pop()}`)
    }
  }
  validateThaiAliases(aliasesToCheck, routes)
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
const substanceEntries = new Map() // substance -> public route metadata

for (const e of registryOut) {
  const f = path.join(DATA_DIR, e.id, `${e.id}-monographs.jsonld`)
  if (!fs.existsSync(f)) continue
  const g = JSON.parse(fs.readFileSync(f, 'utf-8'))['@graph'] || []
  const restricted = e.rights === 'title-only'
  for (const m of g.filter(isEntry)) {
    const label = m.prefLabel || {}
    const title = label.en || label.ja || (e.id === 'ayp' && label['sa-Latn']) || label.la || Object.values(label)[0]
    if (!title) continue
    const s = m['@id'].split('/').pop()
    // category must match the route generator (vite.config.js): explicit field,
    // else the second path segment of @id (/data/{d}/{category}/{slug})
    const cat = (typeof m.category === 'string' && m.category)
      || ((m['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//) || [])[1]
      || 'monographs'
    const native = nativeLabelOf(label)
    const cas = typeof m.casNumber === 'string' ? m.casNumber : null
    const previousRow = options.selected && !options.selected.has(e.id) ? existingSearch.get(`${e.id}/${cat}/${s}`) : null
    const member = { d: e.id, s, c: cat, t: previousRow?.t || String(title), k: restricted ? 0 : 1 }
    const hubSlug = m['@id'].split('/').pop()
    const fallback = ['tp', 'thp'].includes(e.id) ? undefined : e.id === 'jp' || e.id === 'phint'
      ? resolveVendored(e.id, hubSlug, m.edition || e.edition)
      : pubSlugSubstance.get(`${HUB_TO_REGISTRY_PUB[e.id] || e.id}/${hubSlug}`)
    const approvedMatches = approvedOccurrenceSubstances.get(JSON.stringify([e.id, cat, s]))
    const approvedSubstance = approvedMatches?.size === 1 ? approvedMatches.values().next().value : undefined
    const binding = currentJoin?.(e.id, cat, s, m.edition || e.edition)
    const substance = refreshIdentities
      ? corpusSubstance.get(m['@id']) || entryToSubstance[m['@id']] || binding?.id
      : options.selected && !options.selected.has(e.id)
        ? previousRow?.sub || approvedSubstance
        : corpusSubstance.get(m['@id']) || entryToSubstance[m['@id']] || fallback
    if (refreshIdentities && substance) identityBindings.push({ d: e.id, c: cat, s, edition: m.edition || e.edition, id: substance, sources: corpusSources.has(m['@id']) ? [corpusSources.get(m['@id'])] : binding?.sources || (entryToSubstance[m['@id']] ? [m['@id']] : []) })
    if (substance) {
      if (!substanceEntries.has(substance)) substanceEntries.set(substance, [])
      const entries = substanceEntries.get(substance)
      if (!entries.some(x => x.d === member.d && x.s === member.s && x.c === member.c)) {
        entries.push({ ...member, edition: m.edition || e.edition || null })
      }
    }
    // Preserve unrelated index metadata; only the shared native-name pool is
    // recalculated. Its graph may have been emitted by a different producer.
    const { nn: previousPool, sub: previousSubstance, ...preservedRow } = previousRow || {}
    if (previousRow && (refreshIdentities ? substance : previousSubstance)) preservedRow.sub = refreshIdentities ? substance : previousSubstance
    searchIndex.push(previousRow ? preservedRow : {
      d: e.id, s, c: cat, t: String(title), k: restricted ? 0 : 1,
      ...(native && native !== title ? { n: String(native), l: Object.keys(label).find(x => label[x] === native) } : {}),
      ...(cas ? { x: cas } : {}),
      ...(substance ? { sub: substance } : {})
    })
    const keys = refreshIdentities ? [] : Object.values(label).map(normTitle).filter(Boolean)
    if (cas && !refreshIdentities) keys.push('cas:' + cas)
    if (substance) keys.push('sub:' + substance)
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
// Native cross-search: pool each substance's native names so any script
// variant finds every publisher's entry of the same identity.
{
  const nativesBySub = new Map()
  if (refreshIdentities) {
    const active = new Set(currentSubstances.map(sub => sub.id))
    for (const sub of currentSubstances) {
      const approved = projectIdentity(sub, [], active)
      const names = Object.entries(approved.names).filter(([lang]) => !['en', 'la'].includes(lang)).flatMap(([, values]) => values)
      if (names.length) nativesBySub.set(sub.id, new Set(names))
    }
  }
  for (const r of searchIndex) {
    if (!r.sub || !r.n) continue
    if (!nativesBySub.has(r.sub)) nativesBySub.set(r.sub, new Set())
    nativesBySub.get(r.sub).add(r.n)
  }
  let pooled = 0
  for (const r of searchIndex) {
    if (!r.sub) continue
    const pool = nativesBySub.get(r.sub)
    if (!pool) continue
    const extra = [...pool].filter(n => n !== r.n)
    if (!extra.length) continue
    r.nn = extra.join(' ')
    pooled++
  }
  console.log(`✓ native cross-search pool: ${pooled} rows`)
}

fs.writeFileSync(path.join(DATA_DIR, 'search-index.json'), JSON.stringify(projectSearchIndex(searchIndex, datasets)))

// Per-substance landing data (TODO 05): registry entry + the hub-visible
// monograph occurrences that map to it (title-only fields respected —
// restricted publishers carry titles, never body content).
if (!currentSubstances && options.selected) {
  // Without a source registry, approved vendored identity records remain the boundary.
  const dir = path.join(DATA_DIR, 'substances')
  if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const file = path.join(dir, name)
    const doc = JSON.parse(fs.readFileSync(file, 'utf-8'))
    doc.entries = [...(doc.entries || []).filter(e => !options.selected.has(e.d)),
      ...(substanceEntries.get(doc.id) || []).filter(e => options.selected.has(e.d))]
    const bytes = JSON.stringify(doc)
    if (bytes !== fs.readFileSync(file, 'utf-8')) fs.writeFileSync(file, bytes)
  }
} else if (currentSubstances) {
  const dir = path.join(DATA_DIR, 'substances')
  const active = new Set(currentSubstances.map(s => s.id))
  const historyFile = path.join(DATA_DIR, 'substance-history.json')
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : {}
  for (const [from, target] of Object.entries(identityRedirects)) history[from] = { status: 'redirect', target }
  // Old download occurrences provide source-backed route dispositions, never
  // new identity metadata. Unresolved/split identities remain explicit history.
  const download = path.join(DATA_DIR, 'downloads', 'substances.ndjson')
  const oldSources = new Map(fs.existsSync(download) ? fs.readFileSync(download, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const sub = JSON.parse(line)
    return [sub.id, (sub.occurrences || []).map(o => o.entry).filter(x => typeof x === 'string' && x.startsWith('https://openphar.org/data/'))]
  }) : [])
  fs.mkdirSync(dir, { recursive: true })
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json') && !active.has(n.slice(0, -5)))) {
    const old = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    const sources = oldSources.get(old.id) || []
    const targets = new Set(sources.map(iri => entryToSubstance[iri]))
    const target = (Object.hasOwn(identityRedirects, old.id) ? identityRedirects[old.id] : null)
      || (sources.length && targets.size === 1 && active.has([...targets][0]) ? [...targets][0] : null)
    history[old.id] = target ? { status: 'redirect', target } : { status: 'withdrawn', source_iris: sources,
      entries: (old.entries || []).map(({ d, s, c, t, k, edition }) => ({ d, s, c, t, k, edition })) }
    fs.unlinkSync(path.join(dir, name))
  }
  const docs = currentSubstances.map(sub => projectIdentity(sub, substanceEntries.get(sub.id) || [], active))
  for (const doc of docs) fs.writeFileSync(path.join(dir, `${doc.id}.json`), JSON.stringify(doc))
  fs.mkdirSync(path.dirname(download), { recursive: true })
  fs.writeFileSync(download, docs.map(doc => JSON.stringify(doc)).join('\n') + '\n')
  fs.writeFileSync(historyFile, JSON.stringify(history))
  console.log(`✓ data/substances (${docs.length} factual identities; ${Object.keys(history).length} historical routes)`)
}
console.log(`✓ registry.json (${registryOut.length} datasets), search-index.json (${searchIndex.length} titles)`)

if (routeAliases) fs.writeFileSync(path.join(DATA_DIR, 'route-aliases.json'), JSON.stringify(routeAliases))
if (options.evidenceDir) {
  fs.mkdirSync(options.evidenceDir, { recursive: true })
  if (refreshIdentities) fs.writeFileSync(path.join(options.evidenceDir, 'identity-bindings.json'), JSON.stringify(identityBindings, null, 2))
  fs.writeFileSync(path.join(options.evidenceDir, 'thai-selection.json'), JSON.stringify(thaiEvidence, null, 2))
}
