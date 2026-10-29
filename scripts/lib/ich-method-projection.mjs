// Public-index metadata only. Source publication approval is a separate gate.
const SOURCES = new Set(['curated', 'ich_official'])
const CONFIDENCE = new Set(['high', 'medium', 'low'])
const CONCEPT_STATUSES = new Set(['harmonised', 'not_harmonised', 'partial'])
const QUALIFICATIONS = ['note', 'rationale', 'conditions', 'limitations']
const PRIVATE_LOCATION = /(?:file:\/\/|(?:^|[\s"'(])\/[^\s]+|(?:^|[\s"'(])\.\.?[\\/]|[A-Za-z]:[\\/]|\.codex-context|\.claude(?:\/|\\)|\.env(?:\b|\/)|(?:assistant|session)[_-](?:id|url|link)\b)/i

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`)
  }
  return value
}

function metadata(value, field, maximum = 256) {
  if (value == null) return undefined
  if (typeof value !== 'string' || !value.trim() || value.length > maximum ||
      /[\x00-\x1f\x7f]/.test(value) || PRIVATE_LOCATION.test(value)) {
    // Do not include the rejected value, which may itself be private.
    throw new TypeError(`${field} is not supported public index metadata`)
  }
  return value // Literal editions/codes are never trimmed, aliased or coerced.
}

function required(value, field, maximum) {
  const result = metadata(value, field, maximum)
  if (result === undefined) throw new TypeError(`${field} is required`)
  return result
}

function hasQualifications(value) {
  return QUALIFICATIONS.some(key => value[key] != null &&
    (typeof value[key] !== 'string' || value[key].trim() !== ''))
}

function validationOf(chapter) {
  if (!Object.hasOwn(chapter, 'source_validation')) return {}
  const validation = chapter.source_validation
  const status = validation && typeof validation === 'object' && !Array.isArray(validation)
    ? metadata(validation.status, 'source_validation.status', 64) : undefined
  return { sourceValidationStatus: status ?? 'unknown',
    rejected: status !== 'verified',
    qualificationsWithheld: !!(validation && typeof validation === 'object' &&
      (validation.reason != null || validation.evidence_ref != null)) }
}

export function projectIchChapter(chapter) {
  object(chapter, 'chapter')
  const publisher = required(chapter.publisher, 'publisher')
  const code = required(chapter.code, 'code')
  const source = metadata(chapter.source, 'source', 64)
  const edition = metadata(chapter.edition, 'edition')
  const confidence = metadata(chapter.confidence, 'confidence', 64)
  const validation = validationOf(chapter)
  const referenceStatus = SOURCES.has(source) && !validation.rejected ? 'reported' : 'unresolved'
  const qualificationsWithheld = hasQualifications(chapter) || !!validation.qualificationsWithheld
  const reference = { publisher, code, referenceStatus, applicabilityStatus: 'unresolved', qualificationsWithheld }
  if (source !== undefined) reference.source = source
  if (edition !== undefined) reference.edition = edition
  if (confidence !== undefined) reference.confidence = confidence
  if (validation.sourceValidationStatus !== undefined) reference.sourceValidationStatus = validation.sourceValidationStatus

  const sourceLabel = referenceStatus === 'unresolved' && SOURCES.has(source)
    ? `Declared source classification: ${source}; association unresolved`
    : source === 'curated' ? 'Curated method-family reference; not an ICH-official claim'
    : source === 'ich_official' ? 'Official-source catalog reference; provenance is not interchangeability'
      : `Source classification unresolved${source === undefined ? '' : ` (${source})`}`
  const editionLabel = edition === undefined ? 'Edition not supplied; no current-edition applicability inferred' : `Edition: ${edition}`
  const confidenceLabel = confidence === undefined ? 'Confidence not supplied'
    : `Confidence: ${confidence}${CONFIDENCE.has(confidence) ? '' : ' (unrecognised label)'}`
  const text = [`Chapter ${code} (${publisher})`, sourceLabel, editionLabel, confidenceLabel]
  if (referenceStatus === 'unresolved') text.push('Unresolved catalog reference; no positive association asserted')
  if (validation.sourceValidationStatus !== undefined) text.push(`Source validation: ${validation.sourceValidationStatus}`)
  if (qualificationsWithheld) text.push('Additional qualifying metadata is not exported; consult the original source before use')
  text.push('Applicability and conditions remain unresolved; this reference does not establish regulatory or scientific interchangeability')
  return { name: `${publisher} ${code}${edition === undefined ? '' : ` — ${edition}`}`,
    text: text.join('. ') + '.', chapterReference: reference }
}

export function projectIchMethods(rows, { datasetId, edition } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('method rows must be an array')
  const id = required(datasetId, 'datasetId', 64)
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) throw new TypeError('datasetId is not a path identifier')
  const catalogEdition = metadata(edition, 'catalog edition')
  return rows.map(row => {
    object(row, 'method')
    const concept = required(row.concept, 'concept')
    if (!/^[A-Za-z0-9_-]+$/.test(concept)) throw new TypeError('concept is not a path identifier')
    const name = required(row.name_en, 'name_en', 512)
    const status = metadata(row.harmonisation_status, 'harmonisation_status', 64)
    const annex = metadata(row.ich_annex, 'ich_annex')
    if (row.chapters != null && !Array.isArray(row.chapters)) throw new TypeError('chapters must be an array')
    const sections = (row.chapters ?? []).map(projectIchChapter)
    const qualificationsWithheld = hasQualifications(row) || sections.some(s => s.chapterReference.qualificationsWithheld)
    const statusLabel = status === undefined ? 'not supplied' : `${status}${CONCEPT_STATUSES.has(status) ? '' : ' (unrecognised label)'}`
    const entry = {
      '@id': `https://www.openphar.org/data/${id}/methods/${concept.replace(/_/g, '-').toLowerCase()}`,
      '@type': 'IndexedMonograph', prefLabel: { en: name }, category: 'methods',
      definition: { en: `${name} — method-family catalog. Catalog concept status: ${statusLabel}. ` +
        `Annex reference: ${annex ?? 'not supplied'}. Publisher references retain their declared source and edition. ` +
        'Reported catalog associations do not establish current-edition applicability, scientific equivalence or regulatory interchangeability.' +
        (qualificationsWithheld ? ' Additional qualifying metadata is not exported; consult the original source before use.' : '') },
      sections, qualificationsWithheld,
      catalogProvenance: { kind: 'method-family-association', statusMeaning: 'catalog-concept-claim', applicabilityStatus: 'unresolved' }
    }
    if (catalogEdition !== undefined) entry.edition = catalogEdition
    // Preserve the catalog's literal value; the view labels its meaning using
    // catalogProvenance, without turning it into an effective ICH claim.
    if (status !== undefined) entry.harmonisationStatus = status
    if (annex !== undefined) entry.ichAnnex = annex
    return entry
  })
}
