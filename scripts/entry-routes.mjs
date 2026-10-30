export const entryCategory = entry => entry.category || entry['@id']?.match(/\/data\/[^/]+\/([^/]+)\//)?.[1] || 'monographs'
export const counterpartKey = (dataset, category, slug) => dataset === 'ayp' ? `${dataset}/${category}/${slug}` : `${dataset}/${slug}`
export function findRouteEntry(entries, category, slug) {
  const matches = entries.filter(entry => entry['@id']?.split('/').pop() === slug && (!category || entryCategory(entry) === category))
  const distinct = new Map()
  for (const entry of matches) if (!distinct.has(entry['@id'])) distinct.set(entry['@id'], entry)
  return distinct.size === 1 ? distinct.values().next().value : null
}
