import { norm } from '../sources/helpers.js';
import type { Listing } from '../types.js';

/**
 * Deterministic gem score (1–99) — used whenever a listing has no Claude
 * analysis yet, so "✨ Gems first" is sensible even before an AI run.
 *
 * The owner's definition of a gem (verbatim spirit):
 *   "what I am looking for, in the near price range but cheaper than it
 *    should have been — or same price as others but in a good area, or
 *    renovated. NOT the lowest-price wrecks and occupied buildings."
 *
 * Translated into rules:
 *  - value vs the area median has a SWEET SPOT (~5–30% below). A discount
 *    beyond ~40% is a warning sign, not a gem — wrecks, okupas, auctions.
 *  - structured source flags (ocupada, subasta, nuda propiedad, inquilino)
 *    are deal-breakers and sink the score outright.
 *  - "para reformar"/ruina text sinks; "reformado"/quality signals lift.
 */

const TRAP_TEXT =
  /(?:para|a|necesitan?|pendiente de)\s+reformar|reforma\s+(?:integral|total|completa)|derribo|\bruina\b|mal estado|sin cedula|\bokupa|ocupad[oa]|activo ocupado|nuda propiedad|\bsubasta\b|judicial|alquilad[oa]\s+con\s+inquilin|con inquilino|\bposesion\b/;

const RENOVATED_TEXT = /\b(?:reformad[oa]s?|renovad[oa]s?|rehabilitad[oa]s?|semi ?nuev[oa]|a estrenar)\b/;

/** Valencia capital vs the rest of the province — the owner's standing rule:
 *  city listings ALWAYS rank above province/metro ones. */
export function isValenciaCity(l: Pick<Listing, 'municipality'>): boolean {
  const m = norm(l.municipality ?? '');
  return m === 'valencia' || m === 'valencia capital';
}

/** Gem ordering: Valencia city first (hard tier), then score, value, price. */
export function compareGems(
  a: { l: Listing; score: number },
  b: { l: Listing; score: number },
): number {
  return (
    Number(isValenciaCity(b.l)) - Number(isValenciaCity(a.l)) ||
    b.score - a.score ||
    (b.l.valuePct ?? -999) - (a.l.valuePct ?? -999) ||
    a.l.price - b.l.price
  );
}

export function heuristicGemScore(l: Listing): number {
  let s = 50;
  const text = norm(`${l.title} ${l.description ?? ''}`);

  // --- value vs. the area's own median: sweet spot, not "cheapest wins" ---
  const v = l.valuePct;
  if (v !== null && v !== undefined) {
    if (v >= 45) s -= 35; // way below market = almost certainly a catch
    else if (v >= 35) s -= 15;
    else if (v >= 25) s += 16;
    else if (v >= 12) s += 22; // the sweet spot: clearly cheap, still credible
    else if (v >= 5) s += 12;
    else if (v >= -8) s += 2; // fair price — quality signals decide
    else if (v >= -18) s -= 10;
    else s -= 20; // clearly overpriced
  }

  // --- textual trap markers ---
  if (TRAP_TEXT.test(text)) s -= 30;

  // --- quality signals ("same price as others, but better") ---
  if (RENOVATED_TEXT.test(text) && !/(?:para|a)\s+reformar/.test(text)) s += 10;
  if (l.hasElevator === true) s += 4;
  if (/terraza|balcon/.test(text)) s += 4;
  if (/\bexterior\b|luminos[oa]/.test(text)) s += 3;
  if (l.isNewBuild) s += 5;
  else if (l.buildingYear !== null && l.buildingYear >= 2005) s += 4;
  if (l.floor !== null || l.isTopFloor) s += 2; // complete data reads as trustworthy

  s = Math.max(1, Math.min(99, Math.round(s)));
  // structured source flags (ocupada, subasta, nuda propiedad, con inquilino)
  // are deal-breakers: they CAP the score — no bonus can buy a trap back up
  if (l.flags.length > 0) s = Math.min(s, l.flags.length > 1 ? 10 : 20);
  return s;
}
