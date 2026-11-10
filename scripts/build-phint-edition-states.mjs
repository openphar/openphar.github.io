#!/usr/bin/env node
// Builds public/data/phint-edition-diffs.json from the PhInt edition diffs in
// data-international-pharmacopoeia (data-edition-diffs/phint/<from>-to-<to>).
// Those diffs pair entries by substance identity and flag which top-level fields
// changed; they carry no reviewed before/after values. So every record is
// published as "unverified", like the KP pairs: the entry page says the pair
// exists and names the flagged fields, and withholds change details. Verified
// PhInt pairs stay in edition-diffs.json, which accepts verified records only.
//
// Only substance-matched pairs are projected: ambiguous groups are excluded, and
// a pair needs a current PhInt-13 hub entry that joins a registry substance,
// because entry pages match edition pairs by registry substance. A pair that
// already has a verified record is left to that record.
//
// Usage: node scripts/build-phint-edition-states.mjs --diffs DIR --source-commit SHA
//   DIR is the data-edition-diffs/phint directory (holding 11-to-12, 12-to-13).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEntrySelection } from '../src/lib/comparison-contract.js'
import { readEditionProjection } from '../src/lib/edition-diff.js'
import { entries, entrySlug, entryCategory, bindCurrentSubstanceIdentities } from '../src/lib/build-data.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PHINT_TRANSITIONS = ['11-to-12', '12-to-13']
export const PHINT_CURRENT = 'PhInt-13'
const FIELD = /^[a-z][a-z_]*$/
export const phintEntryId = (edition, slug) => `https://openphar.org/data/phint/${edition.toLowerCase()}/entry/${slug}`
const pairKey = (substanceId, from, to) => JSON.stringify([substanceId, ...[from, to].sort()])

// transitions: [{ name, summary, diffs: { [slug]: parsed diff YAML } }]
export function phintEditionDocument({ transitions, verifiedRecords, sourceCommit, graph, index }) {
  const bySlug = new Map(graph.map(e => [entrySlug(e), e]))
  const verified = new Set(verifiedRecords.filter(r => r.publisher === 'phint').map(r => pairKey(r.substanceId, r.from.edition, r.to.edition)))
  const records = [], skipped = []
  for (const { name, summary, diffs } of transitions) {
    if (summary.pairing !== 'substance-identity') throw new Error(`${name}: diffs are not paired by substance identity`)
    const ambiguous = new Set(summary.ambiguous_groups.flatMap(g => [...g.from.map(s => `from:${s}`), ...g.to.map(s => `to:${s}`)]))
    for (const slug of summary.changed_slugs) {
      const diff = diffs[slug]
      const skip = reason => skipped.push({ transition: name, slug, reason })
      if (!diff || diff.id !== slug || !diff.from_id) throw new Error(`${name}: missing or mismatched diff for ${slug}`)
      if (diff.match === 'ambiguous' || ambiguous.has(`to:${slug}`) || ambiguous.has(`from:${diff.from_id}`)) { skip('ambiguous'); continue }
      if (diff.to_edition !== PHINT_CURRENT) { skip('no PhInt-13 endpoint'); continue }
      const entry = bySlug.get(slug)
      if (!entry || entry.edition !== PHINT_CURRENT) { skip('no PhInt-13 hub entry'); continue }
      const selection = resolveEntrySelection(graph, index, { publisher: 'phint', slug, category: entryCategory(entry) })
      const substanceId = selection?.entry['@id'] === entry['@id'] && selection.entry.edition === PHINT_CURRENT ? selection.substanceId : null
      if (!substanceId) { skip('no registry substance join'); continue }
      if (verified.has(pairKey(substanceId, diff.from_edition, diff.to_edition))) { skip('verified pair exists'); continue }
      const fields = Object.keys(diff.diff || {}).sort()
      if (!fields.length || !fields.every(f => FIELD.test(f))) throw new Error(`${name}: diff for ${slug} names no usable changed field`)
      records.push({
        publisher: 'phint',
        substanceId,
        from: { edition: diff.from_edition, entryId: phintEntryId(diff.from_edition, diff.from_id), substanceId },
        to: { edition: PHINT_CURRENT, entryId: entry['@id'], substanceId },
        status: 'unverified',
        publication: { status: 'permitted', authority: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/' },
        evidence: `The International Pharmacopoeia ${diff.from_edition} to ${PHINT_CURRENT} edition diff, paired by substance (match: ${diff.match}), openphar/data-international-pharmacopoeia data-edition-diffs/phint/${name} at ${sourceCommit}; field-level change flags only, no reviewed change values.`,
        changes: [],
        comparedFields: fields,
      })
    }
  }
  const document = {
    schema: 'openphar-edition-diffs/v1',
    attribution: 'The International Pharmacopoeia, 11th ed. (2022), 12th ed. (2024), and 13th ed. (2025). Geneva: World Health Organization. Licence: CC BY-NC-SA 3.0 IGO. No WHO endorsement implied.',
    license: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/',
    adaptation: 'Adapted by Open Pharmacopoeia: the PhInt edition diffs pair entries by substance and flag which fields changed. The flags are shown as unverified edition pairs; change details are not shown.',
    endorsement: 'No endorsement by WHO is implied.',
    records,
  }
  readEditionProjection(document)
  return { document, skipped }
}

export async function readPhintDiffs(dir) {
  const { load: loadYaml } = await import('js-yaml')
  return PHINT_TRANSITIONS.map(name => {
    const summary = JSON.parse(fs.readFileSync(path.join(dir, name, '_summary.json')))
    const diffs = Object.fromEntries(summary.changed_slugs.map(slug => [slug, loadYaml(fs.readFileSync(path.join(dir, name, `${slug}.yaml`), 'utf8'))]))
    return { name, summary, diffs }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [flag1, diffsDir, flag2, sourceCommit] = process.argv.slice(2)
    if (flag1 !== '--diffs' || flag2 !== '--source-commit' || !diffsDir || !/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Usage: --diffs DIR --source-commit SHA (40 hex)')
    const index = bindCurrentSubstanceIdentities(JSON.parse(fs.readFileSync(path.join(root, 'data/search-index.json'))))
    const verifiedRecords = readEditionProjection(JSON.parse(fs.readFileSync(path.join(root, 'public/data/edition-diffs.json'))))
    const { document, skipped } = phintEditionDocument({ transitions: await readPhintDiffs(diffsDir), verifiedRecords, sourceCommit, graph: entries('phint'), index })
    fs.writeFileSync(path.join(root, 'public/data/phint-edition-diffs.json'), JSON.stringify(document, null, 2) + '\n')
    console.log(JSON.stringify({ exit: 0, records: document.records.length, skipped: skipped.length, skippedReasons: skipped.reduce((m, s) => ({ ...m, [`${s.transition} ${s.reason}`]: (m[`${s.transition} ${s.reason}`] || 0) + 1 }), {}) }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
