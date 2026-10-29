// Language-tagged labels from the various SSOT shapes (en preferred, kept
// alongside ko/zh/etc. when present)
export function labelsOf(doc, publisher) {
  const pick = (v) => (v && typeof v === 'string' ? v.trim() : null)
  const out = {}
  const set = (k, v) => { if (v && !out[k]) out[k] = v }

  if (typeof doc.title === 'string') {
    set('en', pick(doc.title))
  } else if (doc.title && typeof doc.title === 'object') {
    set('en', pick(doc.title.en) || pick(doc.title.english))
    set('la', pick(doc.title.latin))
    set('zh', pick(doc.title.zh))
    set('ko', pick(doc.title.ko))
  }

  const names = doc.names || {}
  set('en', pick(names.en))
  set('la', pick(names.la))
  set('zh', pick(names.zh))
  set('ko', pick(names.ko))
  if (['TP', 'THP'].includes(publisher) && /[\u0e00-\u0e7f]/u.test(pick(names.th) || '')) set('th', pick(names.th))
  if (Array.isArray(names.english)) set('en', pick(names.english[0]))
  if (names.canonical) {
    set('en', pick(names.canonical.en))
    set('la', pick(names.canonical.latin) || (publisher === 'API' ? null : pick(names.canonical.iast)))
    if (publisher === 'API') {
      set('sa-Latn', pick(names.canonical.iast))
      const status = names.native_name_sources?.devanagari?.status
      if (['source_confirmed', 'page_read_confirmed', 'page_read_source_variant'].includes(status)) {
        set('sa-Deva', pick(names.canonical.devanagari))
      }
    }
    set('zh', pick(names.canonical.zh))
  }
  return out
}

export function nativeLabelOf(labels) {
  if (labels.th) return labels.th
  if (labels['sa-Deva']) return labels['sa-Deva']
  return Object.entries(labels).find(([lang]) => lang !== 'en')?.[1] || ''
}

export function titleLabelOf(labels, publisher) {
  if (publisher === 'API') return labels.en || labels['sa-Latn'] || Object.values(labels)[0] || null
  return Object.values(labels)[0] || null
}
