/**
 * Valencia geography + feature vocabulary shared by the query parser (to detect
 * mentions) and the SQL filter builder (to match listings written in Spanish,
 * Valencian, or English).
 */

export interface Area {
  /** canonical display name */
  name: string;
  /** lowercase spelling variants as they appear in listings and queries */
  variants: string[];
}

export const AREAS: Area[] = [
  // Valencia city districts & barrios
  { name: 'Russafa', variants: ['russafa', 'ruzafa'] },
  { name: 'El Carmen', variants: ['el carmen', 'el carme', 'carmen'] },
  { name: 'Ciutat Vella', variants: ['ciutat vella', 'ciudad vieja', 'old town'] },
  { name: 'Eixample', variants: ['eixample', 'ensanche', "l'eixample"] },
  { name: 'Gran Vía', variants: ['gran vía', 'gran via'] },
  { name: 'Pla del Remei', variants: ['pla del remei'] },
  { name: 'Sant Francesc', variants: ['sant francesc', 'san francisco'] },
  { name: 'La Xerea', variants: ['xerea'] },
  { name: 'El Mercat', variants: ['el mercat', 'el mercado'] },
  { name: 'La Seu', variants: ['la seu'] },
  { name: 'El Pilar', variants: ['el pilar', 'velluters'] },
  { name: 'Benimaclet', variants: ['benimaclet'] },
  { name: 'El Cabanyal', variants: ['cabanyal', 'cabañal', 'canyamelar'] },
  { name: 'La Malvarrosa', variants: ['malvarrosa', 'malva-rosa', 'malvarosa'] },
  { name: 'Poblats Marítims', variants: ['poblats marítims', 'poblados marítimos', 'poblats maritims'] },
  { name: 'Campanar', variants: ['campanar'] },
  { name: 'Patraix', variants: ['patraix'] },
  { name: 'Jesús', variants: ['jesús', 'jesus'] },
  { name: 'Extramurs', variants: ['extramurs'] },
  { name: 'La Petxina', variants: ['petxina'] },
  { name: 'Arrancapins', variants: ['arrancapins'] },
  { name: 'Nou Moles', variants: ['nou moles'] },
  { name: "L'Olivereta", variants: ['olivereta'] },
  { name: 'El Pla del Real', variants: ['pla del real'] },
  { name: 'Mestalla', variants: ['mestalla'] },
  { name: 'Exposició', variants: ['exposició', 'exposicion'] },
  { name: 'Algirós', variants: ['algirós', 'algiros'] },
  { name: 'Aiora', variants: ['aiora', 'ayora'] },
  { name: 'Camins al Grau', variants: ['camins al grau'] },
  { name: 'Penya-roja', variants: ['penya-roja', 'penya roja', 'peñarroja'] },
  { name: 'Quatre Carreres', variants: ['quatre carreres'] },
  { name: 'Montolivet', variants: ['montolivet', 'monteolivete'] },
  { name: 'En Corts', variants: ['en corts'] },
  { name: 'Malilla', variants: ['malilla'] },
  { name: 'La Torre', variants: ['la torre'] },
  { name: 'La Saïdia', variants: ['saïdia', 'saidia'] },
  { name: 'Morvedre', variants: ['morvedre'] },
  { name: 'Tormos', variants: ['tormos'] },
  { name: 'Benicalap', variants: ['benicalap'] },
  { name: 'Rascanya', variants: ['rascanya', 'rascaña'] },
  { name: 'Orriols', variants: ['orriols'] },
  { name: 'Torrefiel', variants: ['torrefiel'] },
  { name: 'Benimàmet', variants: ['benimàmet', 'benimamet'] },
  { name: 'Marxalenes', variants: ['marxalenes', 'marchalenes'] },
  { name: 'Na Rovella', variants: ['na rovella'] },
  { name: "L'Hort de Senabre", variants: ['hort de senabre'] },
  { name: 'Ciutat Jardí', variants: ['ciutat jardí', 'ciutat jardi', 'ciudad jardín', 'ciudad jardin'] },
  { name: 'La Creu del Grau', variants: ['creu del grau', 'cruz del grao'] },
  { name: 'La Llum', variants: ['la llum', 'la luz'] },
  { name: 'Sant Isidre', variants: ['sant isidre', 'san isidro'] },
  { name: 'La Raïosa', variants: ['raïosa', 'raiosa'] },
  { name: 'Safranar', variants: ['safranar'] },
  { name: 'Natzaret', variants: ['natzaret', 'nazaret'] },
  { name: 'La Punta', variants: ['la punta'] },
  { name: 'Vara de Quart', variants: ['vara de quart'] },
  { name: 'Beteró', variants: ['beteró', 'betero'] },
  { name: 'Albors', variants: ['albors'] },
  { name: 'Camí Fondo', variants: ['camí fondo', 'cami fondo'] },
  { name: 'La Roqueta', variants: ['la roqueta'] },
  { name: 'Sant Marcel·lí', variants: ['sant marcel·lí', 'sant marcelli', 'san marcelino'] },
  { name: 'Tres Forques', variants: ['tres forques'] },
  { name: 'La Fontsanta', variants: ['fontsanta'] },
  { name: 'La Patacona', variants: ['patacona'] },
  // metro municipalities
  { name: 'Alboraya', variants: ['alboraya', 'alboraia'] },
  { name: 'Mislata', variants: ['mislata'] },
  { name: 'Burjassot', variants: ['burjassot', 'burjasot'] },
  { name: 'Paterna', variants: ['paterna'] },
  { name: 'Godella', variants: ['godella'] },
  { name: 'Rocafort', variants: ['rocafort'] },
  { name: 'Torrent', variants: ['torrent', 'torrente'] },
  { name: 'Picanya', variants: ['picanya', 'picaña'] },
  { name: 'Paiporta', variants: ['paiporta'] },
  { name: 'Quart de Poblet', variants: ['quart de poblet'] },
  { name: 'Manises', variants: ['manises'] },
  { name: 'Xirivella', variants: ['xirivella', 'chirivella'] },
  { name: 'Sedaví', variants: ['sedaví', 'sedavi'] },
  { name: 'Alfafar', variants: ['alfafar'] },
  { name: 'Benetússer', variants: ['benetússer', 'benetusser'] },
  { name: 'Tavernes Blanques', variants: ['tavernes blanques'] },
  { name: 'Moncada', variants: ['moncada', 'montcada'] },
  { name: 'Puçol', variants: ['puçol', 'puzol'] },
  { name: 'El Puig', variants: ['el puig'] },
  { name: 'Bétera', variants: ['bétera', 'betera'] },
  { name: 'La Cañada', variants: ['la cañada', 'la canyada'] },
  { name: 'Sagunto', variants: ['sagunto', 'sagunt', 'puerto de sagunto'] },
];

/** Known listing sources — used by the parser for "only fotocasa" style queries. */
export const SOURCE_NAMES = [
  'fotocasa',
  'habitaclia',
  'idealista',
  'thinkspain',
  'viviendasnuevas',
  'metrovacesa',
  'ficsa',
  'proyectos',
];

/** Look up an area by any variant; returns canonical name or null. */
export function findArea(textLower: string): Area | null {
  for (const a of AREAS) {
    if (a.variants.some((v) => v === textLower)) return a;
  }
  return null;
}

/**
 * Expand an area name into all spelling variants for LIKE-matching.
 * Unknown names (typed by hand in the filter form) pass through as-is.
 */
export function expandArea(name: string): string[] {
  const lower = name.toLowerCase();
  const area = AREAS.find((a) => a.name.toLowerCase() === lower || a.variants.includes(lower));
  return area ? area.variants : [lower];
}

/**
 * Feature keywords: English term → text fragments to match in listings
 * (listings are mostly Spanish; stems catch singular/plural/gender forms).
 */
export const FEATURES: Record<string, string[]> = {
  terrace: ['terraza', 'terrace', 'terrassa'],
  balcony: ['balcón', 'balcon', 'balcony'],
  garage: ['garaje', 'garage', 'parking', 'párking', 'plaza de aparcamiento'],
  pool: ['piscina', 'pool'],
  garden: ['jardín', 'jardin', 'garden'],
  'air conditioning': ['aire acondicionado', 'air conditioning', 'a/c'],
  storage: ['trastero', 'storage room'],
  furnished: ['amueblado', 'furnished'],
  views: ['vistas', 'views'],
};

export function expandFeature(keyword: string): string[] {
  return FEATURES[keyword.toLowerCase()] ?? [keyword.toLowerCase()];
}
