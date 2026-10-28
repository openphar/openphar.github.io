import { detailAccess, publicEvidence, assertFields } from './comparison-contract.js'
const text = v => typeof v === 'string' && v.trim().length > 0
const fail = message => { throw new Error(`Invalid edition projection: ${message}`) }

export function readEditionProjection(document) {
  assertFields(document, ['schema', 'attribution', 'license', 'adaptation', 'endorsement', 'records'], 'edition document')
  if (document?.schema !== 'openphar-edition-diffs/v1' || !Array.isArray(document.records)) fail('schema or records')
  const seen = new Set()
  for (const record of document.records) {
    assertFields(record, ['publisher', 'substanceId', 'from', 'to', 'status', 'publication', 'evidence', 'changes', 'comparedFields'], 'edition record')
    if (!record || !['publisher', 'substanceId'].every(k => text(record[k])) || !publicEvidence(record.evidence)) fail('identity and public evidence required')
    if (detailAccess(record.publisher) !== 'eligible') fail('publisher detail policy')
    if (!['verified', 'unverified'].includes(record.status)) fail('verification status')
    assertFields(record.publication, ['status', 'authority'], 'publication')
    if (record.publication.status !== 'permitted' || !publicEvidence(record.publication.authority)) fail('public publication authority required')
    for (const endpoint of [record.from, record.to]) {
      assertFields(endpoint, ['edition', 'entryId', 'substanceId'], 'endpoint')
      if (!endpoint || !['edition', 'entryId', 'substanceId'].every(k => text(endpoint[k]))) fail('edition endpoint identity required')
      if (endpoint.substanceId !== record.substanceId) fail('cross-substance edition pair')
    }
    if (record.from.edition === record.to.edition) fail('distinct editions required')
    if (!Array.isArray(record.changes)) fail('change list required')
    if (record.comparedFields && (!Array.isArray(record.comparedFields) || !record.comparedFields.length || !record.comparedFields.every(publicEvidence))) fail('compared field scope required')
    if (!record.changes.length && !record.comparedFields?.length) fail('empty changes require explicit compared field scope')
    if (record.status === 'unverified' && record.changes.length) fail('unverified changes cannot be published')
    for (const change of record.changes) {
      assertFields(change, ['field', 'kind', 'before', 'after', 'evidence'], 'change')
      if (!text(change.field) || !publicEvidence(change.evidence) || !['added', 'removed', 'changed'].includes(change.kind)) fail('public change evidence required')
      if (change.kind !== 'added' && !text(change.before)) fail('before value required')
      if (change.kind !== 'removed' && !text(change.after)) fail('after value required')
    }
    const key = JSON.stringify([record.publisher, record.substanceId, ...[record.from.edition, record.to.edition].sort()])
    if (seen.has(key)) fail('duplicate edition pair')
    seen.add(key)
  }
  return document.records
}

export function editionsForEntry(records, identity) {
  if (!identity?.substanceId || detailAccess(identity.publisher, identity.rights) !== 'eligible') return []
  return records.filter(r => r.publisher === identity.publisher && r.substanceId === identity.substanceId &&
    [r.from, r.to].some(e => e.entryId === identity.entryId && e.edition === identity.edition && e.substanceId === identity.substanceId))
}
