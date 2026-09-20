import type { Listing } from './types';

/**
 * Google Maps linking. Precision order:
 *  1. real coordinates (fotocasa provides GPS) — exact pin
 *  2. street address (+ area) — good geocode
 *  3. neighborhood + municipality — area-level fallback
 */

function bestQuery(l: Listing): string {
  if (l.lat != null && l.lng != null) return `${l.lat},${l.lng}`;
  const parts: string[] = [];
  if (l.address) parts.push(l.address);
  if (l.neighborhood) parts.push(l.neighborhood);
  if (l.municipality) parts.push(l.municipality);
  parts.push('Valencia', 'España');
  // dedupe comma segments case-insensitively ("…, Valencia, Valencia, España")
  const seen = new Set<string>();
  const segments = parts
    .flatMap((p) => p.split(','))
    .map((s) => s.trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return segments.join(', ');
}

/** Full Google Maps in a new tab (official cross-platform URL scheme). */
export function mapsUrl(l: Listing): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bestQuery(l))}`;
}

/** Keyless embeddable mini-map for the in-card peek. */
export function mapsEmbedUrl(l: Listing): string {
  const zoom = l.lat != null && l.lng != null ? 17 : 15;
  return `https://maps.google.com/maps?q=${encodeURIComponent(bestQuery(l))}&z=${zoom}&hl=es&output=embed`;
}

/** Location text for the card: street address when we have it, else area. */
export function locationLabel(l: Listing): string {
  if (l.address) {
    const seen = new Set<string>();
    return l.address
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        const key = s.toLowerCase();
        if (!s || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(', ');
  }
  return [l.neighborhood, l.municipality].filter(Boolean).join(' · ');
}
