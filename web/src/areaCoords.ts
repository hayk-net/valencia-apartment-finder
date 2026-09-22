import type { Listing } from './types';

/**
 * Approximate centroids for Valencia barrios & metro municipalities.
 *
 * Placement honesty rules:
 *  - real GPS → exact pin
 *  - known barrio / metro town → grouped into ONE area bubble at its centroid
 *    (never individual fake positions)
 *  - only "Valencia" (city-level) → NOT mapped at all; a city-center pile of
 *    markers is a lie. Those listings stay in the list view.
 */
const CENTROIDS: Record<string, [number, number]> = {
  // city center / old town
  'ciutat vella': [39.4744, -0.3792],
  'el carmen': [39.4791, -0.3797],
  'la seu': [39.4763, -0.3757],
  'la xerea': [39.475, -0.372],
  'el mercat': [39.4735, -0.3799],
  'el pilar': [39.472, -0.383],
  'sant francesc': [39.47, -0.377],
  // ensanche & west
  russafa: [39.4614, -0.3742],
  eixample: [39.4652, -0.3711],
  'gran via': [39.4636, -0.369],
  'pla del remei': [39.4699, -0.3679],
  extramurs: [39.47, -0.388],
  'la petxina': [39.474, -0.389],
  arrancapins: [39.464, -0.386],
  'la roqueta': [39.467, -0.383],
  'nou moles': [39.468, -0.4],
  olivereta: [39.466, -0.404],
  'tres forques': [39.462, -0.409],
  fontsanta: [39.464, -0.414],
  'la llum': [39.466, -0.409],
  'vara de quart': [39.462, -0.402],
  // north
  benimaclet: [39.4867, -0.3565],
  'la saidia': [39.485, -0.375],
  marxalenes: [39.485, -0.385],
  morvedre: [39.483, -0.377],
  tormos: [39.487, -0.381],
  benicalap: [39.49, -0.393],
  rascanya: [39.493, -0.368],
  orriols: [39.493, -0.364],
  torrefiel: [39.494, -0.376],
  benimamet: [39.503, -0.421],
  'sant llorenc': [39.497, -0.356],
  campanar: [39.483, -0.398],
  'pla del real': [39.478, -0.36],
  exposicio: [39.48, -0.363],
  trinitat: [39.482, -0.371],
  'sant antoni': [39.486, -0.372],
  // east / maritime
  mestalla: [39.474, -0.358],
  algiros: [39.474, -0.342],
  aiora: [39.465, -0.34],
  'camins al grau': [39.462, -0.345],
  'penya-roja': [39.459, -0.348],
  albors: [39.467, -0.348],
  'cami fondo': [39.464, -0.351],
  'ciutat jardi': [39.472, -0.348],
  'la creu del grau': [39.46, -0.343],
  'la carrasca': [39.478, -0.34],
  'illa perduda': [39.47, -0.339],
  cabanyal: [39.4697, -0.326],
  malvarrosa: [39.479, -0.3253],
  'poblats maritims': [39.462, -0.329],
  'el grau': [39.458, -0.331],
  betero: [39.476, -0.335],
  natzaret: [39.447, -0.332],
  'la punta': [39.444, -0.348],
  'ciutat de les arts': [39.457, -0.352],
  // south
  patraix: [39.457, -0.396],
  jesus: [39.456, -0.386],
  'la raiosa': [39.459, -0.389],
  safranar: [39.455, -0.399],
  'sant isidre': [39.459, -0.405],
  'sant marcel·li': [39.447, -0.395],
  'hort de senabre': [39.452, -0.39],
  'quatre carreres': [39.448, -0.362],
  montolivet: [39.459, -0.363],
  'en corts': [39.455, -0.37],
  malilla: [39.446, -0.376],
  'na rovella': [39.455, -0.356],
  'la fonteta': [39.451, -0.352],
  'la torre': [39.427, -0.387],
  favara: [39.459, -0.392],
  // metro municipalities (legitimate area-level placement)
  alboraya: [39.5, -0.352],
  patacona: [39.485, -0.323],
  mislata: [39.475, -0.418],
  burjassot: [39.51, -0.413],
  paterna: [39.503, -0.441],
  godella: [39.521, -0.411],
  rocafort: [39.531, -0.409],
  torrent: [39.437, -0.466],
  picanya: [39.436, -0.435],
  paiporta: [39.428, -0.418],
  'quart de poblet': [39.481, -0.442],
  manises: [39.491, -0.463],
  xirivella: [39.465, -0.423],
  sedavi: [39.426, -0.385],
  alfafar: [39.419, -0.388],
  benetusser: [39.423, -0.396],
  'tavernes blanques': [39.507, -0.366],
  moncada: [39.545, -0.395],
  pucol: [39.615, -0.305],
  'el puig': [39.59, -0.313],
  puig: [39.59, -0.313],
  betera: [39.592, -0.462],
  'la canada': [39.517, -0.468],
  sagunto: [39.68, -0.273],
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(el|la|els|les|los|las|l'|l |barrio de|barri de)\s*/, '')
    .trim();
}

function lookupKey(name: string | null): string | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  if (CENTROIDS[n]) return n;
  for (const key of Object.keys(CENTROIDS)) {
    if (key.length > 4 && (n.includes(key) || key.includes(n))) return key;
  }
  return null;
}

export type MapPos =
  | { kind: 'exact'; lat: number; lng: number }
  | { kind: 'area'; key: string; lat: number; lng: number }
  | { kind: 'none' };

export function resolveMapPos(l: Listing): MapPos {
  if (l.lat != null && l.lng != null) return { kind: 'exact', lat: l.lat, lng: l.lng };
  const byBarrio = lookupKey(l.neighborhood);
  if (byBarrio) {
    const [lat, lng] = CENTROIDS[byBarrio];
    return { kind: 'area', key: byBarrio, lat, lng };
  }
  // municipality-level is fine for metro towns, but "Valencia" alone is too
  // coarse — a giant city-center bubble would be exactly the mess we removed
  const mun = l.municipality && norm(l.municipality) !== 'valencia' ? lookupKey(l.municipality) : null;
  if (mun) {
    const [lat, lng] = CENTROIDS[mun];
    return { kind: 'area', key: mun, lat, lng };
  }
  return { kind: 'none' };
}
