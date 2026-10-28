// Public, explicitly authorized facts only. Source prose is never a fallback.
const restricted = new Set(['us', 'eu', 'uk'])
const held = new Set(['jp', 'chp'])
const eligible = new Set(['phint', 'thp', 'ayp', 'hk', 'ip', 'kp'])
const text = value => typeof value === 'string' && value.trim().length > 0
const decimal = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
const fail = message => { throw new Error(`Invalid comparison projection: ${message}`) }

export function publicEvidence(value) {
  return text(value) && !/(?:\.codex|\.claude|\/home\/|\/tmp\/|file:|localhost|127\.0\.0\.1|session.?id|private\/|workspace\/|semantic-yaml\/|data-canonical\/|-----BEGIN|\b(?:password|secret|token)\s*[:=])/i.test(value)
}

export function assertFields(object, allowed, context) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail(`${context} must be an object`)
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`unexpected ${context} field: ${key}`)
  for (const value of Object.values(object)) {
    if (typeof value === 'string' && !publicEvidence(value)) fail(`unsafe ${context} text`)
  }
}

export function detailAccess(publisher, rights) {
  if (restricted.has(publisher) || rights === 'title-only') return 'title-only'
  if (held.has(publisher)) return 'held'
  return eligible.has(publisher) ? 'eligible' : 'held'
}

export function validateFactEntry(entry) {
  assertFields(entry, ['publisher', 'entryId', 'substanceId', 'edition', 'publication', 'tests'], 'entry')
  if (!entry || !['publisher', 'entryId', 'substanceId', 'edition'].every(k => text(entry[k]))) fail('entry identity is required')
  if (detailAccess(entry.publisher) !== 'eligible') fail('publisher detail policy')
  assertFields(entry.publication, ['status', 'authority'], 'publication')
  if (entry.publication.status !== 'permitted' || !publicEvidence(entry.publication.authority)) fail('public publication authority is required')
  if (!Array.isArray(entry.tests)) fail('tests must be an array')
  const keys = new Set()
  for (const test of entry.tests) {
    assertFields(test, ['key', 'label', 'semanticKey', 'basis', 'unit', 'evidence', 'limit', 'method'], 'test')
    if (!test || !['key', 'label', 'semanticKey', 'basis', 'unit'].every(k => text(test[k])) || !publicEvidence(test.evidence)) fail('test semantics, unit and public evidence are required')
    if (keys.has(test.key)) fail('duplicate test key')
    keys.add(test.key)
    const limit = test.limit
    if (!limit || !['range', '<=', '>=', '=', '<', '>'].includes(limit.operator)) fail('limit operator')
    if (limit.operator === 'range') {
      assertFields(limit, ['operator', 'lower', 'upper'], 'range')
      if (!decimal(limit.lower) || !decimal(limit.upper) || compareDecimal(limit.lower, limit.upper) > 0) fail('ordered decimal range required')
    } else {
      assertFields(limit, ['operator', 'value'], 'limit')
      if (!decimal(limit.value)) fail('decimal limit value required')
    }
    if (test.method) {
      assertFields(test.method, ['publisher', 'chapter', 'label', 'evidence'], 'method')
      if (!['publisher', 'chapter', 'label'].every(k => text(test.method[k])) || !publicEvidence(test.method.evidence)) fail('public method evidence is required')
    }
  }
  return entry
}

export function readComparisonProjection(document) {
  assertFields(document, ['schema', 'attribution', 'license', 'adaptation', 'endorsement', 'entries'], 'document')
  if (document?.schema !== 'openphar-comparison/v1' || !Array.isArray(document.entries)) fail('schema or entries')
  const seen = new Set()
  for (const entry of document.entries) {
    validateFactEntry(entry)
    const key = JSON.stringify([entry.publisher, entry.entryId, entry.edition])
    if (seen.has(key)) fail('duplicate entry identity')
    seen.add(key)
  }
  return document.entries
}

export function publicEntryCategory(entry) {
  return entry.category || (entry['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//)?.[1] || 'monographs'
}

// Category is part of identity. Neither ordinal IDs nor a first matching slug
// can resolve conflicting graph/index records.
export function resolveEntrySelection(graph, index, { publisher, slug, category }) {
  const matches = graph.filter(e => (e['@id'] || '').split('/').pop() === slug && (!category || publicEntryCategory(e) === category))
  const identities = new Set(matches.map(e => JSON.stringify([e['@id'], e.edition || '', publicEntryCategory(e)])))
  if (identities.size !== 1) return null
  const entry = matches[0]
  const actualCategory = publicEntryCategory(entry)
  const rows = index.filter(row => row.d === publisher && row.s === slug && row.c === actualCategory)
  const substances = new Set(rows.map(row => row.sub).filter(text))
  if (!rows.length || substances.size > 1) return null
  return { entry, category: actualCategory, substanceId: substances.size === 1 ? [...substances][0] : null }
}

export function comparisonMatrix(columns) {
  const semantics = [...new Set(columns.flatMap(c => c.facts?.tests.map(t => t.semanticKey) || []))]
  return semantics.map(semantic => {
    const cells = columns.map(column => {
      const matches = column.facts?.tests.filter(test => test.semanticKey === semantic) || []
      return { column, test: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 }
    })
    const populated = cells.filter(cell => cell.test)
    const baseline = populated[0]
    return { semantic, label: baseline?.test.label || semantic, cells: cells.map(cell => ({ ...cell,
      comparison: !cell.test ? null : populated.length < 2 ? { status: 'incomparable', reason: 'Only one verified value; comparison unavailable.' } :
        cell === baseline ? { status: 'reference', reason: 'Reference value for this comparison.' } : compareTests(baseline.column.facts, baseline.test, cell.column.facts, cell.test)
    })) }
  })
}

export function findFacts(entries, identity) {
  if (!identity?.substanceId || detailAccess(identity.publisher, identity.rights) !== 'eligible') return null
  return entries.find(e => e.publisher === identity.publisher && e.entryId === identity.entryId && e.edition === identity.edition && e.substanceId === identity.substanceId) || null
}

// Decimal strings avoid binary floating point rounding and implicit conversions.
export function compareDecimal(a, b) {
  const parts = value => {
    const negative = value.startsWith('-')
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
    return { negative, whole: whole.replace(/^0+(?=\d)/, ''), fraction }
  }
  const x = parts(a), y = parts(b)
  const width = Math.max(x.fraction.length, y.fraction.length)
  const signed = p => BigInt(p.whole + p.fraction.padEnd(width, '0')) * (p.negative ? -1n : 1n)
  const left = signed(x), right = signed(y)
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareTests(leftEntry, left, rightEntry, right) {
  if (!leftEntry || !rightEntry || leftEntry.substanceId !== rightEntry.substanceId) return { status: 'incomparable', reason: 'Different or unavailable substance identity.' }
  if (left.semanticKey !== right.semanticKey || left.basis !== right.basis || left.unit !== right.unit) return { status: 'incomparable', reason: 'Test meaning, measurement basis or exact unit differs.' }
  if (left.limit.operator !== right.limit.operator) return { status: 'incomparable', reason: 'Limit operators differ.' }
  const fields = left.limit.operator === 'range' ? ['lower', 'upper'] : ['value']
  const equal = fields.every(key => compareDecimal(left.limit[key], right.limit[key]) === 0)
  return { status: equal ? 'same' : 'different', reason: equal ? 'Same explicit numeric limit.' : 'Explicit numeric limits differ.' }
}

export function formatLimit(test) {
  const l = test.limit
  return `${l.operator === 'range' ? `${l.lower}–${l.upper}` : `${l.operator} ${l.value}`} ${test.unit}`
}
