/**
 * Coerce a raw string value to its natural JS type.
 * "true"/"false" -> boolean, numeric strings -> number, else trimmed string.
 */
export function detectType(raw) {
  const trimmed = String(raw).trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (trimmed !== '' && !isNaN(num)) return num
  return trimmed
}
