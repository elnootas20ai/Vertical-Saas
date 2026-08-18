import { describe, expect, it } from 'vitest';
import {
  buildEventsServicesImportWorkbook,
  EVENTS_SERVICES_SHEET_NAME,
  isEventsServicesExampleName,
  mapEventServiceCategory,
  mapEventServiceUnit,
  parseEventServicePrice,
} from '../src/app/lib/eventsServicesExcelTemplate';

describe('eventsServicesExcelTemplate', () => {
  it('mapea categoría y unidad en español', () => {
    expect(mapEventServiceCategory('Música / DJ')).toBe('musica');
    expect(mapEventServiceCategory('Catering')).toBe('catering');
    expect(mapEventServiceUnit('Por persona')).toBe('por_persona');
    expect(mapEventServiceUnit('Precio fijo')).toBe('fijo');
    expect(mapEventServiceUnit('Por hora')).toBe('por_hora');
  });

  it('parsea precio con formato ES', () => {
    expect(parseEventServicePrice('85,50')).toBe(85.5);
    expect(parseEventServicePrice('1.250,00')).toBe(1250);
    expect(parseEventServicePrice('650')).toBe(650);
  });

  it('la plantilla tiene hoja servicios y cabeceras en ES', () => {
    const wb = buildEventsServicesImportWorkbook();
    expect(wb.SheetNames[0]).toBe(EVENTS_SERVICES_SHEET_NAME);
    const ws = wb.Sheets[EVENTS_SERVICES_SHEET_NAME];
    expect(String(ws.A1?.v)).toBe('Nombre');
    expect(String(ws.B1?.v)).toBe('Categoría');
    expect(String(ws.C1?.v)).toBe('Precio');
    expect(String(ws.D1?.v)).toBe('Unidad');
  });

  it('ignora filas de ejemplo', () => {
    expect(isEventsServicesExampleName('Ejemplo · Banquete premium')).toBe(true);
    expect(isEventsServicesExampleName('Banquete premium')).toBe(false);
  });
});
