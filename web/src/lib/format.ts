/**
 * Display formatting for claim values.
 *
 * Values arrive verbatim from upstream ("138772", "year 1889", "2.5 km") so the
 * engine can compare them without losing precision. Only the presentation layer
 * groups digits, and only for values that are unambiguously plain integers.
 */
export function formatClaimValue(value: string): string {
  const trimmed = value.trim();

  // A bare integer, optionally signed. Anything with units, punctuation or
  // extra words is left exactly as published.
  if (!/^-?\d{4,}$/.test(trimmed)) return value;

  const negative = trimmed.startsWith('-');
  const digits = negative ? trimmed.slice(1) : trimmed;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}