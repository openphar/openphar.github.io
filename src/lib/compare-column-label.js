// Header label for a comparison column: "KP · KP13", or just "JP" when the public entry has no edition.
export function compareColumnLabel(column) {
  const publisher = String(column?.d ?? '').toUpperCase()
  const edition = typeof column?.edition === 'string' ? column.edition.trim() : ''
  return edition ? `${publisher} · ${edition}` : publisher
}
