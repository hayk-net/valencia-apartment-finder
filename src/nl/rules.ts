import type { Filters } from '../types.js';
import { AREAS, FEATURES } from './vocab.js';

/**
 * Rule-based parser for English apartment-search sentences, e.g.:
 *   "I am searching for 3 bedroom 2 bathroom, maximum 50 years old building,
 *    100 sqm not more then 330K euros, and above 3rd floor only"
 *
 * Strategy: run extractors from most-specific to least-specific pattern; each
 * extractor BLANKS the text it consumed so a number can't be claimed twice
 * (the "50" in "50 years old" must never become a price or a floor).
 */

const ORDINAL_WORDS: Record<string, number> = {
  ground: 0,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/** "330" -> 330, "330.000"/"330,000" -> 330000, "1.5" -> 1.5 */
function parseNum(s: string): number {
  const cleaned = s.trim().replace(/[.,]+$/, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/[.,]/g, ''));
  return Number(cleaned.replace(',', '.'));
}

/** Apply k / thousand / mil multipliers ("330" + "k" -> 330000). */
function amount(numStr: string, suffix?: string): number {
  let v = parseNum(numStr);
  const s = (suffix ?? '').toLowerCase();
  if (v < 10000 && (s.startsWith('k') || s.startsWith('thousand') || s === 'mil')) v *= 1_000;
  return Math.round(v);
}

const UNIT_SQM = String.raw`(?:sq\.?\s?m\.?|sqm|m2|m²|square\s+met(?:er|re)s?|metros?(?:\s+cuadrados)?)`;
const BEDS = String.raw`(?:bed(?:room)?s?\b|br\b|habs?\b|habitaci(?:on|ón)(?:es)?\b|dormitorios?\b)`;
const BATHS = String.raw`(?:bath(?:room)?s?\b|baños?\b|banos?\b)`;
const MAX_WORDS = String.raw`(?:not\s+more\s+than|no\s+more\s+than|max(?:imum)?|up\s+to|under|below|at\s+most|less\s+than|<=?)`;
// (?<!no?t?\s) keeps "more than"/"over" from matching inside "not more than" / "not over"
const MIN_WORDS = String.raw`(?:at\s+least|min(?:imum)?|(?<!not\s)(?<!no\s)more\s+than|(?<!not\s)over|starting\s+(?:at|from)|>=?)`;
const CUR = String.raw`(?:€|eur(?:os?)?\b)`;
const KMM = String.raw`(k\b|thousand\b|mil\b)`;
const MONEY_SIGNAL = /€|k\b|thousand|mil\b|euro/;
// digits with optional .,-separated groups; never ends on a separator
const NUM = String.raw`(\d+(?:[.,]\d+)*)`;

export function parseWithRules(text: string): Filters {
  const f: Filters = {};
  // normalize: lowercase, pad, fix the eternal then/than mixup
  let t = ` ${text.toLowerCase()} `
    .replace(/[’']/g, '')
    .replace(/not\s+more\s+then/g, 'not more than')
    .replace(/\s+/g, ' ');

  /** replace first match with spaces; returns true if it matched */
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void): boolean => {
    const m = re.exec(t);
    if (!m) return false;
    fn(m);
    t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
    return true;
  };
  const takeAll = (re: RegExp, fn: (m: RegExpExecArray) => void): void => {
    while (take(re, fn)) {
      /* keep consuming */
    }
  };

  // ---- 1. building age / construction year (must run before price & floor) ----
  take(/built\s+(?:after|since|from)\s+(\d{4})/, (m) => {
    f.minBuildingYear = Number(m[1]);
  });
  take(
    new RegExp(String.raw`(?:${MAX_WORDS}\s*)?(\d{1,3})\s*(?:years?|yrs?)[\s-]*old(?:\s+building)?`),
    (m) => {
      f.maxBuildingAgeYears = Number(m[1]);
    },
  );

  // ---- 2. surface (needs an explicit m² unit) ----
  take(
    new RegExp(String.raw`(?:between\s+)?(\d{2,4})\s*(?:-|–|to|and)\s*(\d{2,4})\s*${UNIT_SQM}`),
    (m) => {
      f.minSqm = Number(m[1]);
      f.maxSqm = Number(m[2]);
    },
  );
  take(new RegExp(String.raw`${MAX_WORDS}\s*(?:of\s*)?(\d{2,4})\s*${UNIT_SQM}`), (m) => {
    f.maxSqm = Number(m[1]);
  });
  take(new RegExp(String.raw`(?:${MIN_WORDS}\s*|above\s*)?(\d{2,4})\s*${UNIT_SQM}`), (m) => {
    f.minSqm = Number(m[1]);
  });

  // ---- 3. floor ----
  const ord = String.raw`(\d{1,2})(?:st|nd|rd|th)?|(${Object.keys(ORDINAL_WORDS).join('|')})`;
  const ordVal = (m: RegExpExecArray, i: number): number =>
    m[i] !== undefined ? Number(m[i]) : ORDINAL_WORDS[m[i + 1]];
  take(new RegExp(String.raw`(?:above|over|higher\s+than)\s+(?:the\s+)?(?:${ord})\s+floor`), (m) => {
    f.minFloor = ordVal(m, 1) + 1;
  });
  take(new RegExp(String.raw`(?:${ord})\s+floor\s+(?:or|and)\s+(?:above|higher|up(?:wards)?)`), (m) => {
    f.minFloor = ordVal(m, 1);
  });
  take(new RegExp(String.raw`(?:at\s+least|from|min(?:imum)?)\s+(?:the\s+)?(?:${ord})\s+floor`), (m) => {
    f.minFloor = ordVal(m, 1);
  });
  take(/(?:not?|no|without|avoid|excluding?)\s+(?:the\s+)?ground\s+floor/, () => {
    f.minFloor = Math.max(f.minFloor ?? 0, 1);
  });

  // ---- 4. bedrooms & bathrooms ----
  take(new RegExp(String.raw`(\d{1,2})\s*(?:-|–|to|or)\s*(\d{1,2})\s*\+?\s*${BEDS}`), (m) => {
    f.minRooms = Number(m[1]);
    f.maxRooms = Number(m[2]);
  });
  take(new RegExp(String.raw`${MAX_WORDS}\s*(\d{1,2})\s*${BEDS}`), (m) => {
    f.maxRooms = Number(m[1]);
  });
  take(new RegExp(String.raw`(\d{1,2})\s*\+?\s*${BEDS}`), (m) => {
    f.minRooms = Number(m[1]);
  });
  if (/\bstudio\b/.test(t)) {
    f.minRooms = 0;
    f.maxRooms = 0;
    t = t.replace(/\bstudio\b/, ' ');
  }
  take(new RegExp(String.raw`(\d{1,2})\s*\+?\s*${BATHS}`), (m) => {
    f.minBathrooms = Number(m[1]);
  });

  // ---- 5. price (needs a currency signal: €, k/m suffix, or "euros") ----
  take(
    new RegExp(
      String.raw`(?:between\s+)?${CUR}?\s*${NUM}\s*${KMM}?\s*(?:-|–|to|and)\s*${CUR}?\s*${NUM}\s*${KMM}?\s*${CUR}?`,
    ),
    (m) => {
      const signal = MONEY_SIGNAL.test(m[0]);
      const lo = amount(m[1], m[2] ?? m[4]);
      const hi = amount(m[3], m[4]);
      // ignore number pairs with no money context (leftover "2 to 4" noise)
      if (!signal && (lo < 10000 || hi < 10000)) return;
      f.minPrice = Math.min(lo, hi);
      f.maxPrice = Math.max(lo, hi);
    },
  );
  // takeAll: a repeated phrase ("max 330k … max 330k") must be fully consumed,
  // or its leftovers get misread by the next rule
  takeAll(new RegExp(String.raw`${MAX_WORDS}\s*(?:of\s*)?${CUR}?\s*${NUM}\s*${KMM}?\s*${CUR}?`), (m) => {
    const v = amount(m[1], m[2]);
    if ((MONEY_SIGNAL.test(m[0].replace(m[1], '')) || v >= 10000) && f.maxPrice === undefined) f.maxPrice = v;
  });
  takeAll(new RegExp(String.raw`${MIN_WORDS}\s*${CUR}?\s*${NUM}\s*${KMM}?\s*${CUR}?`), (m) => {
    const v = amount(m[1], m[2]);
    if ((MONEY_SIGNAL.test(m[0].replace(m[1], '')) || v >= 10000) && f.minPrice === undefined) f.minPrice = v;
  });
  // bare amount with a currency signal → treat as the budget ceiling
  takeAll(
    new RegExp(String.raw`${CUR}\s*${NUM}\s*${KMM}?|${NUM}\s*${KMM}\s*${CUR}?|${NUM}\s*${CUR}`),
    (m) => {
      const numStr = m[1] ?? m[3] ?? m[5];
      const suffix = m[2] ?? m[4];
      const v = amount(numStr, suffix);
      if (v >= 10000 && f.maxPrice === undefined) f.maxPrice = v;
    },
  );

  // ---- 6. features & flags ----
  if (/\b(elevator|lift|ascensor)\b/.test(t)) f.mustHaveElevator = true;
  if (/\b(new[\s-]?build(?:ing)?s?|new\s+construction|obra\s+nueva|brand\s+new)\b/.test(t)) {
    f.newBuildOnly = true;
  }
  // future projects: buying before/while it's built (usually cheaper)
  if (/sobre\s+plano|en\s+construcci[oó]n|under\s+construction|off[\s-]?plan|pre[\s-]?(?:sale|venta)|future\s+projects?|still\s+being\s+(?:built|constructed)|not\s+(?:yet\s+)?finished/.test(t)) {
    f.futureOnly = true;
  }
  const keywords: string[] = [];
  for (const feature of Object.keys(FEATURES)) {
    if (new RegExp(String.raw`\b${feature.replace(/\s+/g, String.raw`\s+`)}\b`).test(t)) {
      keywords.push(feature);
    }
  }
  if (keywords.length > 0) f.keywords = keywords;

  // ---- 7. neighborhoods / municipalities (dictionary scan) ----
  const areas: string[] = [];
  for (const area of AREAS) {
    for (const v of area.variants) {
      if (new RegExp(String.raw`\b${v.replace(/[-\s]+/g, String.raw`[-\s]+`)}\b`).test(t)) {
        if (!areas.includes(area.name)) areas.push(area.name);
        break;
      }
    }
  }
  if (areas.length > 0) f.neighborhoods = areas;

  // sanity: swap crossed ranges
  if (f.minRooms !== undefined && f.maxRooms !== undefined && f.minRooms > f.maxRooms) {
    [f.minRooms, f.maxRooms] = [f.maxRooms, f.minRooms];
  }
  if (f.minSqm !== undefined && f.maxSqm !== undefined && f.minSqm > f.maxSqm) {
    [f.minSqm, f.maxSqm] = [f.maxSqm, f.minSqm];
  }
  return f;
}
