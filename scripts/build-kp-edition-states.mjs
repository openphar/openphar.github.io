#!/usr/bin/env node
// Builds public/data/kp-edition-diffs.json from the KP12 -> KP13 edition diff in
// data-korea-pharmacopoeia (data-edition-diffs/kp/kp12-to-kp13). That diff only
// flags which sections changed; it carries no reviewed before/after values. So
// every record is published as "unverified": the entry page says the pair exists
// and names the sections the diff flags, and withholds change details.
// Only changed entries whose KP13 hub entry joins a registry substance get a
// record, because entry pages match edition pairs by registry substance.
//
// Usage: node scripts/build-kp-edition-states.mjs --diffs DIR --summary-sha SHA256 --source-commit SHA
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import { resolveEntrySelection } from '../src/lib/comparison-contract.js'
import { readEditionProjection } from '../src/lib/edition-diff.js'
import { entries, entrySlug, entryCategory, bindCurrentSubstanceIdentities } from '../src/lib/build-data.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const KP_SOURCE = 'https://www.mfds.go.kr/brd/m_211/view.do?seq=14975'
export const KP_FROM = 'KP12'
export const KP_TO = 'KP13'
// KP13 diffs name changed sections by their Korean heading; earlier diffs used
// English keys. Both map to one English field name, and an unknown heading fails
// the build instead of reaching the page.
export const KP_SECTION_FIELDS = {
  정량법: 'assay', assay: 'assay',
  순도시험: 'purity', purity: 'purity',
  확인시험: 'identification', identification: 'identification',
  수분: 'water', water: 'water',
  제법: 'manufacture', manufacture: 'manufacture',
}
export function kpSectionFields(diff) {
  const sections = Object.keys(diff?.sections || {}).map(key => {
    const field = KP_SECTION_FIELDS[key]
    if (!field) throw new Error(`Unmapped KP section heading: ${key}`)
    return field
  })
  return [...(diff?.definition_changed === true ? ['definition'] : []), ...[...new Set(sections)].sort()]
}
export const kp12EntryId = slug => `https://openphar.org/data/kp/kp12/ko/monograph/${slug}`

export function kpEditionDocument({ summary, sectionsBySlug, sourceCommit, graph, index }) {
  const bySlug = new Map(graph.map(e => [entrySlug(e), e]))
  const records = [], skipped = []
  for (const slug of summary.changed_slugs) {
    const entry = bySlug.get(slug)
    if (!entry || entry.edition !== KP_TO) { skipped.push({ slug, reason: 'no KP13 hub entry' }); continue }
    const selection = resolveEntrySelection(graph, index, { publisher: 'kp', slug, category: entryCategory(entry) })
    const substanceId = selection?.entry['@id'] === entry['@id'] && selection.entry.edition === KP_TO ? selection.substanceId : null
    if (!substanceId) { skipped.push({ slug, reason: 'no registry substance join' }); continue }
    const sections = sectionsBySlug[slug]
    if (!sections?.length) throw new Error(`Diff document for ${slug} names no changed section`)
    records.push({
      publisher: 'kp',
      substanceId,
      from: { edition: KP_FROM, entryId: kp12EntryId(slug), substanceId },
      to: { edition: KP_TO, entryId: entry['@id'], substanceId },
      status: 'unverified',
      publication: { status: 'permitted', authority: 'Korean Pharmacopoeia dataset published with full rights in the Open Pharmacopoeia registry' },
      evidence: `Korean Pharmacopoeia KP12 to KP13 edition diff, openphar/data-korea-pharmacopoeia data-edition-diffs/kp/kp12-to-kp13 at ${sourceCommit}; section-level change flags only, no reviewed change values.`,
      changes: [],
      comparedFields: sections,
    })
  }
  const document = {
    schema: 'openphar-edition-diffs/v1',
    attribution: 'Korean Pharmacopoeia, 12th and 13th editions. Ministry of Food and Drug Safety, Republic of Korea.',
    license: KP_SOURCE,
    adaptation: 'Adapted by Open Pharmacopoeia: the KP12 to KP13 edition diff flags which sections of an entry changed. The flags are shown as an unverified edition pair; change details are not shown.',
    endorsement: 'No endorsement by the Ministry of Food and Drug Safety is implied.',
    records,
  }
  readEditionProjection(document)
  return { document, skipped }
}

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--diffs', '--summary-sha', '--source-commit'].includes(argv[i]) || !argv[i + 1]) throw new Error('Usage: --diffs DIR --summary-sha SHA256 --source-commit SHA')
    opts[argv[i].slice(2)] = argv[i + 1]
  }
  if (!opts.diffs || !/^[a-f0-9]{64}$/.test(opts['summary-sha'] || '') || !/^[a-f0-9]{40}$/.test(opts['source-commit'] || '')) throw new Error('Supply --diffs, a 64-hex --summary-sha and a 40-hex --source-commit')
  return opts
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const bytes = fs.readFileSync(path.join(opts.diffs, '_summary.json'))
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== opts['summary-sha']) throw new Error('Summary SHA256 mismatch')
    const summary = JSON.parse(bytes)
    const sectionsBySlug = {}
    for (const slug of summary.changed_slugs) {
      const diff = loadYaml(fs.readFileSync(path.join(opts.diffs, `${slug}.yaml`), 'utf8'))
      if (diff.id !== slug || diff.from_edition !== KP_FROM || diff.to_edition !== KP_TO) throw new Error(`Unexpected diff identity for ${slug}`)
      sectionsBySlug[slug] = kpSectionFields(diff.diff)
    }
    const index = bindCurrentSubstanceIdentities(JSON.parse(fs.readFileSync(path.join(root, 'data/search-index.json'))))
    const { document, skipped } = kpEditionDocument({ summary, sectionsBySlug, sourceCommit: opts['source-commit'], graph: entries('kp'), index })
    fs.writeFileSync(path.join(root, 'public/data/kp-edition-diffs.json'), JSON.stringify(document, null, 2) + '\n')
    console.log(JSON.stringify({ exit: 0, changed: summary.changed_slugs.length, common: summary.common, records: document.records.length, skipped: skipped.length, skippedReasons: skipped.reduce((m, s) => ({ ...m, [s.reason]: (m[s.reason] || 0) + 1 }), {}) }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
