// Rights enforcement gate: datasets marked `rights: title-only` (USP,
// Ph.Eur., BP — copyrighted) may appear in published output only as titles
// and index metadata. Run in CI, before the Pages build, and locally after
// `npm run generate`.
//
//   node scripts/assert-rights.mjs           # data/ and public/ (build inputs)
//   node scripts/assert-rights.mjs --dist    # also the built site in dist/
//   node scripts/assert-rights.mjs --dist <dir>
//
// Every JSON, JSON-LD and NDJSON file under data/, public/ and (with --dist)
// the build output is scanned at every nesting depth. A title-only record is
// recognised in each shape the generator publishes:
//
//   - JSON-LD: an object whose `@id` is under /data/{us,eu,uk}/ or the native
//     source paths /data/{usp,ep,bp}/ (registry pages, us-editions.json).
//   - Compact rows: an object whose `d` is a title-only dataset id
//     (search-index.json, cross-links.json, substances/*.json,
//     downloads/substances.ndjson, substance-history.json).
//   - Publisher projections: an object whose `publisher` names a title-only
//     publisher and that carries an entry identity (`entryId`/`substanceId`),
//     as in the Compare files under public/data/.
//
// Each such record may carry only the permitted identity/title fields below.
// Exits 1 with the file, record identity and field names of every violation;
// field values are never printed.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as yamlLoad } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// casNumber is allow-listed deliberately: CAS Registry Numbers are
// non-copyrightable factual identifiers (index metadata, not body text) and
// are required for cross-publisher counterpart matching. Everything else —
// definitions, sections, tests, any monograph body — must never appear.
export const ALLOWED = new Set(['@id', '@type', 'prefLabel', 'edition', 'category', 'casNumber'])
// Compact equivalents used by the generated indexes: d/s/c = dataset, slug and
// category (the @id route), t = prefLabel, k = rights marker, x = casNumber
// (scripts/search-policy.mjs TITLE_FIELDS), plus edition on substance entries
// (scripts/public-identities.mjs projectIdentity). Substance joins and pooled
// native aliases (sub, n, l, nn) are excluded for title-only rows by the
// search policy.
export const COMPACT_ALLOWED = new Set(['d', 's', 'c', 't', 'k', 'x', 'edition'])
// Publisher projections name the entry by these identity keys instead of @id.
export const PUBLISHER_ALLOWED = new Set([...ALLOWED, 'publisher', 'entryId', 'substanceId'])
// Native source path segments of the title-only publishers
// (generate-datasets.mjs HUB_TO_REGISTRY_PUB; public-identities.mjs).
const NATIVE_SEGMENTS = { us: ['usp'], eu: ['ep'], uk: ['bp'] }
// Publisher labels used for these datasets outside the registry `short` names.
const PUBLISHER_LABELS = { us: ['USP'], eu: ['EP', 'Ph.Eur.', 'PhEur'], uk: ['BP'] }
const JSON_FILE = /\.(json|jsonld|webmanifest)$/
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/

const normLabel = value => String(value).toLowerCase().replace(/[\s.]/g, '')

export function loadPolicy(root = ROOT) {
  const registry = yamlLoad(fs.readFileSync(path.join(root, 'registry/datasets.yml'), 'utf-8'))
  const titleOnly = new Set()
  const segments = new Set()
  const publishers = new Set()
  for (const [id, ds] of Object.entries(registry.datasets || {})) {
    if (ds.rights !== 'title-only') continue
    titleOnly.add(id)
    segments.add(id)
    for (const s of NATIVE_SEGMENTS[id] || []) segments.add(s)
    for (const label of [id, ds.short, ...(NATIVE_SEGMENTS[id] || []), ...(PUBLISHER_LABELS[id] || [])]) {
      if (label) publishers.add(normLabel(label))
    }
  }
  return { titleOnly, segments, publishers }
}

const isStringList = v => typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string'))
const isLangMap = v => typeof v === 'string'
  || (v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, x]) => LANG_TAG.test(k) && isStringList(x)))
const isOptString = v => v === null || typeof v === 'string'

// Permitted fields must hold plain identity/title values, so nothing can be
// nested inside an allowed key.
const VALUE_SHAPES = {
  '@id': v => typeof v === 'string',
  '@type': isStringList,
  prefLabel: isLangMap,
  edition: isOptString,
  category: v => typeof v === 'string',
  casNumber: v => typeof v === 'string',
  publisher: v => typeof v === 'string',
  entryId: v => typeof v === 'string',
  substanceId: isOptString,
  d: v => typeof v === 'string',
  s: v => typeof v === 'string',
  c: v => typeof v === 'string',
  t: v => typeof v === 'string',
  k: v => v === 0,
  x: v => typeof v === 'string'
}

function titleOnlyRecord(value, policy) {
  const id = typeof value['@id'] === 'string'
    ? value['@id'].match(/^https?:\/\/(?:www\.)?openphar\.org\/data\/([^/]+)\//)
    : null
  if (id && policy.segments.has(id[1])) return { kind: '@id', allowed: ALLOWED, label: value['@id'] }
  if (typeof value.d === 'string' && policy.titleOnly.has(value.d)) {
    return { kind: 'row', allowed: COMPACT_ALLOWED, label: [value.d, value.c, value.s].filter(x => typeof x === 'string').join('/') }
  }
  if (typeof value.publisher === 'string' && policy.publishers.has(normLabel(value.publisher))
    && (Object.hasOwn(value, 'entryId') || Object.hasOwn(value, 'substanceId'))) {
    const entry = typeof value.entryId === 'string' ? value.entryId : value.substanceId
    return { kind: 'publisher', allowed: PUBLISHER_ALLOWED, label: `${value.publisher} ${typeof entry === 'string' ? entry : '(no id)'}` }
  }
  return null
}

// Walks one parsed document; pushes { file, record, fields } per violation.
export function scanDocument(doc, file, policy, violations) {
  let records = 0
  const stack = [doc]
  while (stack.length) {
    const value = stack.pop()
    if (Array.isArray(value)) { stack.push(...value); continue }
    if (!value || typeof value !== 'object') continue
    const record = titleOnlyRecord(value, policy)
    if (record) {
      records++
      const fields = Object.keys(value).filter(k => !record.allowed.has(k))
      const malformed = Object.keys(value).filter(k => record.allowed.has(k) && VALUE_SHAPES[k] && !VALUE_SHAPES[k](value[k]))
      if (fields.length) violations.push({ file, record: record.label, fields, reason: 'restricted fields' })
      if (malformed.length) violations.push({ file, record: record.label, fields: malformed, reason: 'non-title values in permitted fields' })
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child)
  }
  return records
}

function listFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(p))
    else if (entry.isFile()) out.push(p)
  }
  return out.sort()
}

// Scans every JSON-family file under `dir`. Inside a data directory
// (`dataDir: true`, or any `data/` folder of a build output) a file the gate
// cannot parse fails closed: it is published but cannot be verified.
export function scanTree(dir, policy, { root = ROOT, dataDir = false } = {}) {
  const violations = []
  let files = 0
  let records = 0
  for (const file of listFiles(dir)) {
    const rel = path.relative(root, file)
    const inData = dataDir || path.relative(dir, file).split(path.sep)[0] === 'data'
    let docs
    try {
      if (file.endsWith('.ndjson')) {
        docs = fs.readFileSync(file, 'utf-8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
      } else if (JSON_FILE.test(file)) {
        docs = [JSON.parse(fs.readFileSync(file, 'utf-8'))]
      } else {
        if (inData) violations.push({ file: rel, record: '-', fields: [], reason: 'unverifiable file type in published data' })
        continue
      }
    } catch {
      violations.push({ file: rel, record: '-', fields: [], reason: 'unparseable published data file' })
      continue
    }
    files++
    for (const doc of docs) records += scanDocument(doc, rel, policy, violations)
  }
  return { files, records, violations }
}

// The title-only dataset graphs must exist and hold only TitleIndexEntry
// records (the field allow-list itself is enforced by scanTree).
export function checkTitleOnlyGraphs(policy, root = ROOT) {
  const violations = []
  for (const id of policy.titleOnly) {
    const rel = path.join('data', id, `${id}-monographs.jsonld`)
    const file = path.join(root, rel)
    if (!fs.existsSync(file)) {
      violations.push({ file: rel, record: id, fields: [], reason: 'title-only dataset has no generated file' })
      continue
    }
    const graph = JSON.parse(fs.readFileSync(file, 'utf-8'))['@graph'] || []
    for (const entry of graph) {
      if (typeof entry !== 'object' || entry === null) continue
      if (String(entry['@type'] || '') !== 'TitleIndexEntry') {
        violations.push({ file: rel, record: String(entry['@id']), fields: ['@type'], reason: 'must be TitleIndexEntry' })
      }
    }
  }
  return violations
}

export function assertRights({ root = ROOT, dist = null } = {}) {
  const policy = loadPolicy(root)
  const violations = checkTitleOnlyGraphs(policy, root)
  const summary = []
  const targets = [
    { dir: path.join(root, 'data'), dataDir: true },
    { dir: path.join(root, 'public'), dataDir: false }
  ]
  if (dist) {
    if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
      violations.push({ file: path.relative(root, dist) || dist, record: '-', fields: [], reason: 'build output missing' })
    } else targets.push({ dir: dist, dataDir: false })
  }
  for (const target of targets) {
    if (!fs.existsSync(target.dir)) continue
    const result = scanTree(target.dir, policy, { root, dataDir: target.dataDir })
    violations.push(...result.violations)
    summary.push({ dir: path.relative(root, target.dir) || '.', files: result.files, records: result.records })
  }
  return { violations, summary }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--dist')
  const sampleOut = process.env.OPENPHAR_BUILD_SAMPLE === '1' ? '.astro-sample' : 'dist'
  const dist = at === -1 ? null : path.resolve(ROOT, args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : sampleOut)
  const { violations, summary } = assertRights({ dist })
  for (const v of violations) {
    console.log(`✗ ${v.file}: ${v.record} — ${v.reason}${v.fields.length ? `: ${v.fields.join(', ')}` : ''}`)
  }
  const scanned = summary.map(s => `${s.dir}: ${s.records} restricted records in ${s.files} files`).join('; ')
  if (violations.length) {
    console.error(`\nRIGHTS VIOLATIONS: ${violations.length} (${scanned})`)
    process.exit(1)
  }
  console.log(`✓ rights ok — title-only records carry titles only (${scanned})`)
}
