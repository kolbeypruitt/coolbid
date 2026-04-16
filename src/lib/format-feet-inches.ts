/**
 * Format a decimal-feet value as feet-and-inches, rounded to the nearest inch.
 *
 *   10.141509 → "10'-2\""
 *   19.436768 → "19'-5\""
 *   11.99     → "12'-0\""  (carries when rounded inches = 12)
 *   0         → "0'-0\""
 *
 * Returns "?" for NaN / undefined / null inputs so callers don't have to
 * guard at each call site.
 */
export function formatFeetInches(feet: number | null | undefined): string {
  if (feet == null || !Number.isFinite(feet)) return "?";
  if (feet < 0) return "?";

  const totalInches = Math.round(feet * 12);
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  return `${ft}'-${inch}"`;
}

/** Format a (width, length) pair as "W × L" with feet-inch precision. */
export function formatRoomDimensions(
  widthFt: number | null | undefined,
  lengthFt: number | null | undefined,
): string {
  return `${formatFeetInches(widthFt)} × ${formatFeetInches(lengthFt)}`;
}
