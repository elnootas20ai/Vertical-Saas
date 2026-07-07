import { describe, expect, it } from 'vitest';
import { workerCanAccessPdvForTablet } from '../services/couchdb.js';

const business = {
  business_id: 'biz-1',
  owner_user_id: 'owner-1',
  members: [
    { user_id: 'owner-1' },
    { user_id: 'pau-1' },
  ],
};

const pdv = {
  _id: 'pdv-1',
  workCenterId: 'wc-1',
};

describe('workerCanAccessPdvForTablet', () => {
  it('el titular siempre puede activar el TPV de su tienda', () => {
    expect(
      workerCanAccessPdvForTablet({ user_id: 'owner-1', role: 'Admin' }, business, pdv),
    ).toBe(true);
  });

  it('admin miembro sin tienda asignada puede activar cualquier PDV de la empresa', () => {
    expect(
      workerCanAccessPdvForTablet(
        { user_id: 'admin-1', role: 'Admin', employment: {} },
        { ...business, members: [...business.members, { user_id: 'admin-1' }] },
        pdv,
      ),
    ).toBe(true);
  });

  it('trabajador solo accede al PDV asignado', () => {
    expect(
      workerCanAccessPdvForTablet(
        { user_id: 'pau-1', role: 'Worker', employment: { salesPointId: 'pdv-1' } },
        business,
        pdv,
      ),
    ).toBe(true);
    expect(
      workerCanAccessPdvForTablet(
        { user_id: 'pau-1', role: 'Worker', employment: { salesPointId: 'pdv-otro' } },
        business,
        pdv,
      ),
    ).toBe(false);
  });
});
