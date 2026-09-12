import { describe, expect, it } from 'vitest';
import {
  isRetailWorkCenterType,
  prepareBusinessWorkCenterCreate,
  WorkCenterProvisionError,
} from '../src/app/lib/deliverySetup.ts';

const business = {
  business_id: 'business:badalona',
  owner_user_id: 'owner-1',
  businessType: 'restaurant',
  name: 'Badalona',
  members: [{ user_id: 'member-1' }],
};

const basePayload = {
  name: 'Badalona',
  centerType: 'punto_de_venta',
  ownership: 'propiedad',
  active: true,
};

describe('retail stores core', () => {
  it('crea el centro bajo el titular y la empresa activa aunque opere un miembro', () => {
    const prepared = prepareBusinessWorkCenterCreate(
      { user_id: 'member-1' },
      business,
      basePayload,
    );

    expect(prepared.dataUserId).toBe('owner-1');
    expect(prepared.payload.businessId).toBe('badalona');
  });

  it('punto de venta y almacén completan PDV; oficina y custom no', () => {
    expect(isRetailWorkCenterType({ centerType: 'punto_de_venta' })).toBe(true);
    expect(isRetailWorkCenterType({ centerType: 'almacen' })).toBe(true);
    expect(isRetailWorkCenterType({ centerType: 'oficina' })).toBe(false);
    expect(isRetailWorkCenterType({ centerType: 'custom' })).toBe(false);
  });

  it('expone el centro creado cuando falla su configuración posterior', () => {
    const workCenter = { _id: 'wc-badalona', name: 'Badalona' };
    const error = new WorkCenterProvisionError(workCenter, new Error('PDV no disponible'));

    expect(error.workCenter).toBe(workCenter);
    expect(error.message).toContain('se creó');
    expect(error.message).toContain('PDV no disponible');
  });

  it('rechaza altas sin empresa activa', () => {
    expect(() =>
      prepareBusinessWorkCenterCreate({ user_id: 'owner-1' }, null, basePayload),
    ).toThrow('No hay empresa activa');
  });
});
