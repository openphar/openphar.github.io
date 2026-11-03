import { assertFields, publicEvidence, resolveEntrySelection } from './comparison-contract.js'
const keys = ['@id', '@type', 'prefLabel', 'edition', 'category', 'casNumber']
const fail = reason => { throw new Error(`Invalid title-only edition index: ${reason}`) }
export function readTitleOnlyEditions(document) {
  assertFields(document, ['schema', 'bySubstance'], 'title index')
  if (document.schema !== 'openphar-title-only-editions/v1' || !document.bySubstance || typeof document.bySubstance !== 'object' || Array.isArray(document.bySubstance)) fail('schema or identity dictionary')
  for (const [substance, records] of Object.entries(document.bySubstance)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(substance) || !Array.isArray(records) || !records.length) fail('stable identity and nonempty records required')
    const seen = new Set()
    for (const record of records) {
      assertFields(record, keys, 'title-only record')
      if (record['@type'] !== 'TitleIndexEntry' || !/^https:\/\/openphar\.org\/data\/usp\/[^/]+\/entry\/[^/]+$/.test(record['@id'] || '')) fail('explicit native USP identity required')
      assertFields(record.prefLabel, ['en'], 'title label')
      if (!publicEvidence(record.prefLabel.en) || !publicEvidence(record.edition)) fail('title and edition required')
      for (const field of ['category', 'casNumber']) if (field in record && !publicEvidence(record[field])) fail('invalid optional metadata')
      const key = JSON.stringify([record['@id'], record.edition])
      if (seen.has(key)) fail('duplicate native identity/edition')
      seen.add(key)
    }
  }
  return document
}
export function titleEditionsFor(document, identity, context) {
  if (identity?.publisher !== 'us' || !identity.substanceId || !identity.entryId || !identity.edition) return []
  const records = Object.hasOwn(document.bySubstance, identity.substanceId) ? document.bySubstance[identity.substanceId] : []
  if (!records?.length || !Array.isArray(context?.graph) || !Array.isArray(context?.index)) return []
  const resolved=resolveEntrySelection(context.graph,context.index,{publisher:'us',slug:identity.entryId.split('/').pop(),category:identity.category})
  if(!resolved||resolved.entry['@id']!==identity.entryId||resolved.entry.edition!==identity.edition||resolved.substanceId!==identity.substanceId)return []
  return records.some(record => record.edition === identity.edition) ? records : []
}
