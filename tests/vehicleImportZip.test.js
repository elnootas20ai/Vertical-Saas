import { describe, expect, it } from 'vitest';
import {
  normalizeVehicleMediaKey,
  parseZipImagePath,
  resolveVehicleImagesFromZip,
} from '../src/app/lib/vehicleImportZip.ts';

describe('vehicleImportZip', () => {
  it('normaliza matrícula para emparejar', () => {
    expect(normalizeVehicleMediaKey('1234-ABC')).toBe('1234abc');
    expect(normalizeVehicleMediaKey(' 1234 ABC ')).toBe('1234abc');
  });

  it('parsea sufijo _1 _2 en nombre de archivo', () => {
    expect(parseZipImagePath('1234ABC_1.jpg')).toEqual({ groupKey: '1234abc', order: 1 });
    expect(parseZipImagePath('1234ABC.jpg')).toEqual({ groupKey: '1234abc', order: 0 });
  });

  it('usa carpeta del ZIP como matrícula', () => {
    expect(parseZipImagePath('5678DEF/exterior.jpg')).toEqual({ groupKey: '5678def', order: 0 });
  });

  it('resuelve fotos por matrícula o bastidor', () => {
    const groups = new Map([
      ['1234abc', ['data:img1', 'data:img2']],
      ['vin123', ['data:vin']],
    ]);
    expect(resolveVehicleImagesFromZip({ registrationPlate: '1234 ABC' }, groups)).toEqual([
      'data:img1',
      'data:img2',
    ]);
    expect(resolveVehicleImagesFromZip({ registrationPlate: '', vin: 'VIN123' }, groups)).toEqual(['data:vin']);
    expect(resolveVehicleImagesFromZip({ registrationPlate: '9999ZZZ' }, groups)).toEqual([]);
  });
});
