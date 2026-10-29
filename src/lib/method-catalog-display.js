const asArray = value => value ? (Array.isArray(value) ? value : [value]) : []

// A projection marker identifies the export format, not source approval or
// regulatory equivalence. Legacy catalog prose omitted its qualifications.
export function methodCatalogDisplay(publisher, category, entry) {
  const legacy = publisher === 'ich' && category === 'methods' &&
    entry?.catalogProvenance?.kind !== 'method-family-association'
  return {
    legacy,
    definition: legacy
      ? { en: 'Analytical method catalog entry. Edition and source qualifications are unavailable in this legacy export. Consult the authoritative texts for applicability.' }
      : entry?.definition,
    sections: legacy ? [] : asArray(entry?.sections)
  }
}
