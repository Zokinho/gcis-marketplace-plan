/**
 * Normalize a lab name for template matching.
 * Strips common suffixes (Labs, Inc, Ltd, etc.), lowercases, and collapses whitespace.
 *
 * Examples:
 *   "High North Labs" → "high north"
 *   "High North Laboratory Inc." → "high north"
 *   "Kaycha Labs, LLC" → "kaycha"
 *   "  Pro Verde  Laboratories  " → "pro verde"
 */
export function normalizeLabName(lab: string): string {
  return lab
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(labs?|laboratory|laboratories|inc\.?|ltd\.?|llc\.?|co\.?|corp\.?)\b/gi, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
