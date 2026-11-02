// Public, explicitly authorized facts only. Source prose is never a fallback.
import { validateComparisonCatalogReference } from '../../scripts/lib/ich-method-projection.mjs'
const restricted = new Set(['us', 'eu', 'uk'])
const held = new Set(['jp', 'chp'])
const eligible = new Set(['phint', 'thp', 'ayp', 'hk', 'ip', 'kp'])
const text = value => typeof value === 'string' && value.trim().length > 0
const known = value => text(value) && !/^(?:unknown|unspecified|unverified|not (?:known|stated|supplied|available)|n\/?a)$/i.test(value.trim())
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
  if (!entry || !text(entry.publisher) || !['entryId', 'substanceId', 'edition'].every(k => known(entry[k]))) fail('entry identity is required')
  if (detailAccess(entry.publisher) !== 'eligible') fail('publisher detail policy')
  assertFields(entry.publication, ['status', 'authority'], 'publication')
  if (entry.publication.status !== 'permitted' || !known(entry.publication.authority) || !publicEvidence(entry.publication.authority)) fail('public publication authority is required')
  if (!Array.isArray(entry.tests)) fail('tests must be an array')
  const keys = new Set()
  for (const test of entry.tests) {
    validateTest(test, entry.edition)
    if (keys.has(test.key)) fail('duplicate test key')
    keys.add(test.key)
  }
  return entry
}

export function validateTest(test, edition) {
  assertFields(test, ['key', 'label', 'semanticKey', 'basis', 'unit', 'evidence', 'limit', 'method'], 'test')
  if (!test || !['key', 'label', 'semanticKey', 'basis', 'unit', 'evidence'].every(k => known(test[k])) || !publicEvidence(test.evidence)) fail('test semantics, unit and public evidence are required')
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
    assertFields(test.method, ['publisher', 'chapter', 'label', 'evidence', 'catalog'], 'method')
    if (!['publisher', 'chapter', 'label'].every(k => text(test.method[k])) || !publicEvidence(test.method.evidence)) fail('public method evidence is required')
    if (Object.hasOwn(test.method, 'catalog')) validateComparisonCatalogReference(test.method.catalog, test.method, edition ?? test.method.catalog?.edition)
  }
  return test
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

const publicRouteKey = entry => JSON.stringify([entry.d, entry.s, entry.c])

// Build a private in-memory join from the already public identity download.
// The compact search index deliberately omits stable-substance joins.
export function bindPublicIdentitySearchIndex(index, substances) {
  if (!Array.isArray(index) || !Array.isArray(substances)) throw new TypeError('Public identity inputs must be arrays')
  const owners = new Map()
  for (const substance of substances) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(substance?.id || '') || !Array.isArray(substance.entries)) continue
    for (const entry of substance.entries) {
      if (![entry.d, entry.s, entry.c, entry.edition].every(value => typeof value === 'string' && value.trim())) continue
      const key = publicRouteKey(entry)
      if (!owners.has(key)) owners.set(key, new Map())
      const editions = owners.get(key).get(substance.id) || new Set()
      editions.add(entry.edition)
      owners.get(key).set(substance.id, editions)
    }
  }
  return index.map(row => {
    const key = publicRouteKey(row)
    const identities = owners.get(key)
    if (!identities || identities.size !== 1) return { ...row, sub: '', identityEditions: [] }
    const [substanceId, editions] = identities.entries().next().value
    if (row.sub && row.sub !== substanceId) return { ...row, sub: '', identityEditions: [] }
    return { ...row, sub: substanceId, identityEditions: [...editions] }
  })
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
  if (rows.some(row => Array.isArray(row.identityEditions) && !row.identityEditions.includes(entry.edition || ''))) return null
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
    const methodCells = cells.filter(cell => cell.test?.method)
    const methodBaseline = methodCells[0]
    return { semantic, label: baseline?.test.label || semantic, cells: cells.map(cell => ({ ...cell,
      comparison: !cell.test ? { status: 'unknown', reason: cell.ambiguous ? 'Multiple test variants; comparison unavailable.' : 'Verified typed test unavailable.' } : populated.length < 2 ? { status: 'incomparable', reason: 'Only one verified value; comparison unavailable.' } :
        cell === baseline ? { status: 'reference', reason: 'Reference value for this comparison.' } : compareTests(baseline.column.facts, baseline.test, cell.column.facts, cell.test),
      methodComparison: !cell.test?.method || methodCells.length < 2 ? { status: 'unknown', reason: 'Two explicit method citations are required.' } :
        cell === methodBaseline ? { status: 'reference', reason: 'Reference citation for this comparison.' } : compareMethods(methodBaseline.column.facts, methodBaseline.test, cell.column.facts, cell.test)
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
  // The exported comparator also fails closed for callers outside the validated
  // projection reader. Two missing identities are never proof of equality.
  try {
    for (const entry of [leftEntry, rightEntry]) validateFactEntry(entry)
    for (const test of [left, right]) validateTest(test)
  } catch {
    return { status: 'unknown', reason: 'Verified identity, edition, publication scope or typed datum unavailable.' }
  }
  if (leftEntry.substanceId !== rightEntry.substanceId) return { status: 'incomparable', reason: 'Different substance identities.' }
  if (left.semanticKey !== right.semanticKey || left.basis !== right.basis || left.unit !== right.unit) return { status: 'incomparable', reason: 'Test meaning, measurement basis or exact unit differs.' }
  if (left.limit.operator !== right.limit.operator) return { status: 'incomparable', reason: 'Limit operators differ.' }
  const fields = left.limit.operator === 'range' ? ['lower', 'upper'] : ['value']
  const equal = fields.every(key => compareDecimal(left.limit[key], right.limit[key]) === 0)
  return { status: equal ? 'same' : 'different', reason: equal ? 'Same explicit numeric limit.' : 'Explicit numeric limits differ.' }
}

export function compareMethods(leftEntry, left, rightEntry, right) {
  try {
    for (const entry of [leftEntry, rightEntry]) validateFactEntry(entry)
    validateTest(left, leftEntry.edition); validateTest(right, rightEntry.edition)
  } catch {
    return { status: 'unknown', reason: 'Verified method context unavailable.' }
  }
  if (leftEntry.substanceId !== rightEntry.substanceId || left.semanticKey !== right.semanticKey ||
      left.basis !== right.basis) return { status: 'incomparable', reason: 'Substance, test meaning or measurement basis differs.' }
  if (!left.method || !right.method) return { status: 'unknown', reason: 'Two explicit method citations are required.' }
  if (left.method.publisher !== right.method.publisher) return { status: 'incomparable', reason: 'Publisher-specific chapter numbers cannot establish a method difference.' }
  return left.method.chapter === right.method.chapter
    ? { status: 'same-citation', reason: 'Same chapter citation; unchanged procedure or interchangeability is not established.' }
    : { status: 'different-citation', reason: 'Different explicitly cited methods; applicability and interchangeability remain unresolved.' }
}

export function formatLimit(test) {
  const l = test.limit
  return `${l.operator === 'range' ? `${l.lower}–${l.upper}` : `${l.operator} ${l.value}`} ${test.unit}`
}

// Adapter for the declared CanonicalLimit JSON mapping. Semantic context is
// explicit caller-reviewed input; subject/qualifier are never silently dropped.
export function fromCanonicalLimit(canonical, context) {
  assertFields(canonical, ['limit_operator','limit_value','lower_limit','upper_limit','limit_unit','limit_subject','limit_qualifier'], 'canonical limit')
  assertFields(context, ['key','label','semanticKey','basis','evidence','method','expectedSubject','expectedQualifier'], 'canonical context')
  for (const [field, expected] of [['limit_subject','expectedSubject'],['limit_qualifier','expectedQualifier']]) {
    if (canonical[field] !== undefined && canonical[field] !== context[expected]) fail('canonical subject or qualifier lacks matching explicit context')
  }
  const operator=canonical.limit_operator
  if(operator==='range'&&Object.hasOwn(canonical,'limit_value')||operator!=='range'&&(Object.hasOwn(canonical,'lower_limit')||Object.hasOwn(canonical,'upper_limit')))fail('conflicting canonical scalar/range fields')
  const limit=operator==='range'?{operator,lower:canonical.lower_limit,upper:canonical.upper_limit}:{operator,value:canonical.limit_value}
  const test={key:context.key,label:context.label,semanticKey:context.semanticKey,basis:context.basis,unit:canonical.limit_unit,limit,evidence:context.evidence}
  if(context.method)test.method=context.method
  return validateTest(test)
}
