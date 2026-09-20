/** Shared plumbing for source adapters: polite fetching and text parsing. */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const DELAY_MS = Number(process.env.REALTOR_DELAY_MS ?? 2500);
let lastFetchAt = 0;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a page politely: real-browser headers, single-file pacing so we never
 * hit a site faster than one request every DELAY_MS, one retry on 5xx.
 */
export async function politeFetch(url: string): Promise<string> {
  const wait = lastFetchAt + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const attempt = async (): Promise<Response> =>
    fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

  let res = await attempt();
  if (res.status >= 500) {
    await sleep(5000);
    res = await attempt();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** "520.000 €" | "555 000 €" (nbsp groups) | "desde 330.500€" -> the amount */
export function parseEuro(text: string): number | null {
  const t = text.replace(/[  ]/g, ' ');
  const m = t.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*€/);
  if (!m) return null;
  return Number(m[1].replace(/[.,\s]/g, ''));
}

/** first integer following/preceding a token, e.g. intNear(text, /(\d+)\s*hab/) */
export function intFrom(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

/** lowercase + strip accents ("Ático" -> "atico", "4ª" -> "4a") so patterns stay simple */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD') // NFKD also folds the ordinal markers ª -> a, º -> o
    .replace(/[̀-ͯ]/g, '');
}

/** Best-effort extraction of the construction year from Spanish description text. */
export function yearFromText(text: string): number | null {
  const t = norm(text);
  const m =
    t.match(/construid[oa]\s+en(?:\s+el)?(?:\s+ano)?\s+(\d{4})/) ??
    t.match(/ano\s+de\s+construccion:?\s*(\d{4})/) ??
    t.match(/construccion\s+(?:de|del)(?:\s+ano)?\s+(\d{4})/) ??
    t.match(/(?:edificio|finca)\s+(?:de|del)(?:\s+ano)?\s+(\d{4})/) ??
    t.match(/\bdel?\s+ano\s+(\d{4})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1850 && y <= new Date().getFullYear() + 5 ? y : null;
}

/** Best-effort elevator detection from Spanish description text. */
export function elevatorFromText(text: string): boolean | null {
  const t = norm(text);
  if (/sin\s+ascensor/.test(t)) return false;
  if (/ascensor|elevator|\blift\b/.test(t)) return true;
  return null;
}

/** Does the text describe a house rather than an apartment? Houses have internal "plantas" that are NOT the unit's floor. */
export function isHouseText(text: string): boolean {
  return /\b(casa|chalet|adosad[oa]|unifamiliar|villa|masia|alqueria|bungalow)\b/.test(norm(text));
}

const ORD_F: Record<string, number> = { primera: 1, segunda: 2, tercera: 3, cuarta: 4, quinta: 5, sexta: 6, septima: 7, octava: 8, novena: 9, decima: 10 };
const ORD_M: Record<string, number> = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10 };

/**
 * Extract the unit's floor from Spanish free text — the field portals omit but
 * posters write into descriptions ("4ª planta", "en planta 12", "tercer piso",
 * "planta baja", "ático").
 *
 * Grammar traps handled: "3 plantas" / "distribuido en 3 plantas" is a house's
 * STORY COUNT, not a floor; "piso 4" alone is ambiguous ("piso" = flat) and is
 * ignored without an ordinal marker.
 */
export function extractFloor(text: string, isHouse = false): { floor: number | null; topFloor: boolean } {
  const t = norm(text);
  const topFloor = /\b(atico|sobreatico|penthouse)\b|ultima\s+planta/.test(t);
  if (isHouse) return { floor: null, topFloor: false };

  const valid = (n: number): number | null => (n >= 0 && n <= 30 ? n : null);
  let m: RegExpMatchArray | null;

  if (/planta\s+baja\b|\bbajo\s+(?:exterior|interior|reformado|con)\b/.test(t)) return { floor: 0, topFloor };
  if (/\bentresuelo\b/.test(t)) return { floor: 1, topFloor };

  // "4ª planta" / "en la 4 planta" — the \b after "planta" rejects the plural
  // "… 4 plantas" (a house's story count), the trap this grammar must avoid
  if ((m = t.match(/\b(\d{1,2})\s*a?\s+planta\b/)) || (m = t.match(/\b(\d{1,2})a\s*planta\b/))) {
    const n = valid(Number(m[1]));
    if (n !== null) return { floor: n, topFloor };
  }
  // "planta 4" / "planta 4ª"
  if ((m = t.match(/\bplanta\s+(\d{1,2})\b/))) {
    const n = valid(Number(m[1]));
    if (n !== null) return { floor: n, topFloor };
  }
  // "4º piso" / "piso 4º" (ordinal marker required — bare "piso 4" is ambiguous)
  if ((m = t.match(/\b(\d{1,2})\s*[o°]\s*piso\b/)) || (m = t.match(/\bpiso\s+(\d{1,2})\s*[o°]/))) {
    const n = valid(Number(m[1]));
    if (n !== null) return { floor: n, topFloor };
  }
  // word ordinals: "cuarta planta" / "planta cuarta" / "tercer piso"
  if ((m = t.match(new RegExp(String.raw`\b(${Object.keys(ORD_F).join('|')})\s+planta\b`)))) {
    return { floor: ORD_F[m[1]], topFloor };
  }
  if ((m = t.match(new RegExp(String.raw`\bplanta\s+(${Object.keys(ORD_F).join('|')})\b`)))) {
    return { floor: ORD_F[m[1]], topFloor };
  }
  if ((m = t.match(new RegExp(String.raw`\b(${Object.keys(ORD_M).join('|')})\s+piso\b`)))) {
    return { floor: ORD_M[m[1]], topFloor };
  }
  return { floor: null, topFloor };
}
