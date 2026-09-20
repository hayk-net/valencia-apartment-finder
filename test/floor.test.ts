import { describe, expect, it } from 'vitest';
import { elevatorFromText, extractFloor, isHouseText, yearFromText } from '../src/sources/helpers.js';

describe('extractFloor — Spanish floor grammar', () => {
  it('reads explicit ordinal floors', () => {
    expect(extractFloor('Piso reformado en 4ª planta con ascensor').floor).toBe(4);
    expect(extractFloor('vivienda situada en la planta 12 con vistas').floor).toBe(12);
    expect(extractFloor('bonito tercer piso sin ascensor').floor).toBe(3);
    expect(extractFloor('se vende piso en planta séptima').floor).toBe(7);
    expect(extractFloor('estupendo 5º piso exterior').floor).toBe(5);
  });

  it('reads named floors', () => {
    expect(extractFloor('planta baja con patio de 30m2').floor).toBe(0);
    expect(extractFloor('amplio entresuelo reformado').floor).toBe(1);
  });

  it('detects áticos and última planta as top floor', () => {
    const atico = extractFloor('Ático con terraza de 20 m2 y vistas');
    expect(atico.topFloor).toBe(true);
    expect(atico.floor).toBeNull();
    expect(extractFloor('luminoso piso en última planta').topFloor).toBe(true);
  });

  it('never mistakes a story count for a floor', () => {
    expect(extractFloor('edificio de 5 plantas con ascensor').floor).toBeNull();
    expect(extractFloor('casa distribuida en 3 plantas', true).floor).toBeNull();
    expect(extractFloor('adosado de 2 plantas mas terraza', true).floor).toBeNull();
  });

  it('ignores bare "piso N" (piso = the flat itself)', () => {
    expect(extractFloor('piso 3 habitaciones cerca del centro').floor).toBeNull();
  });

  it('skips floor extraction for houses entirely', () => {
    const casa = extractFloor('casa con la planta primera dedicada a dormitorios', true);
    expect(casa.floor).toBeNull();
  });
});

describe('isHouseText', () => {
  it('flags houses', () => {
    expect(isHouseText('Magnífica vivienda adosada unifamiliar en Valencia')).toBe(true);
    expect(isHouseText('chalet independiente con piscina')).toBe(true);
    expect(isHouseText('piso luminoso en Russafa')).toBe(false);
  });
});

describe('yearFromText / elevatorFromText', () => {
  it('reads construction years in common phrasings', () => {
    expect(yearFromText('finca con ascensor. Construido en 1964.')).toBe(1964);
    expect(yearFromText('Año de construcción: 1995')).toBe(1995);
    expect(yearFromText('edificio del año 1930 rehabilitado')).toBe(1930);
    expect(yearFromText('sin datos del edificio')).toBeNull();
  });

  it('reads elevator, with "sin ascensor" winning', () => {
    expect(elevatorFromText('finca con ascensor')).toBe(true);
    expect(elevatorFromText('tercera planta sin ascensor')).toBe(false);
    expect(elevatorFromText('bonito piso exterior')).toBeNull();
  });
});
