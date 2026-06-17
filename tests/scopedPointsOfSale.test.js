import { describe, expect, it } from 'vitest';
import {
  filterPointsOfSaleLinkedToWorkCenters,
  findOrphanPointsOfSale,
} from '../services/couchdb.js';

describe('scoped points of sale', () => {
  const wcIds = new Set(['wc-1', 'wc-2']);

  const pdvs = [
    { _id: 'pdv-a', workCenterId: 'wc-1', name: 'Tienda A' },
    { _id: 'pdv-b', workCenterId: 'wc-deleted', name: 'Fantasma' },
    { _id: 'pdv-c', name: 'Sin centro' },
    { _id: 'pdv-d', workCenterId: 'wc-2', name: 'Tienda B' },
  ];

  it('filterPointsOfSaleLinkedToWorkCenters solo devuelve PDV con centro existente', () => {
    const scoped = filterPointsOfSaleLinkedToWorkCenters(pdvs, wcIds);
    expect(scoped.map((p) => p._id)).toEqual(['pdv-a', 'pdv-d']);
  });

  it('findOrphanPointsOfSale detecta huérfanos y PDV con centro borrado', () => {
    const orphans = findOrphanPointsOfSale(pdvs, wcIds);
    expect(orphans.map((p) => p._id).sort()).toEqual(['pdv-b', 'pdv-c']);
  });
});
