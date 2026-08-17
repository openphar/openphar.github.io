// Language-map helpers — the single implementation used by every view.
// LangString shapes: {en, ja, zh, ko, la, ...} or plain string.

const PREFERENCE = ['en', 'ja', 'zh', 'ko', 'la', '@value']

export function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    for (const key of PREFERENCE) {
      if (value[key]) return value[key]
    }
    return Object.values(value)[0] || ''
  }
  return String(value)
}

// [lang, text] pairs of non-empty labels, insertion order (en first when present)
export function labelPairs(labels) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return []
  return Object.entries(labels).filter(([, v]) => v && typeof v === 'string')
}

// Language of the value extractString() would return
export function primaryLang(value) {
  if (typeof value === 'string') return 'en'
  if (!value || typeof value !== 'object') return 'en'
  for (const key of PREFERENCE) {
    if (value[key]) return key === '@value' ? 'en' : key
  }
  const first = Object.keys(value)[0]
  return first || 'en'
}
