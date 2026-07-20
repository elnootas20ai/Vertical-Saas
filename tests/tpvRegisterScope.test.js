import { describe, expect, it } from 'vitest';
import {
  businessScopeIdFromRawId,
  businessScopeIdFromTabletBinding,
  evaluateTpvRegisterLoadGate,
  isTpvTabletSession,
  resolveTpvCatalogBusinessId,
  resolveTpvRegisterBidAtStart,
  resolveTpvRegisterScope,
  shouldApplyTpvRegisterLoadResult,
  shouldAutoSwitchToDeliveryBusiness,
  resolveRetailOpsWriteBusinessId,
} from '../src/app/lib/tpvRegisterScope.ts';

describe('tpvRegisterScope — regresión caja tablet', () => {
  it('isTpvTabletSession exige pdvId y businessId', () => {
    expect(isTpvTabletSession(null)).toBe(false);
    expect(isTpvTabletSession({ pdvId: 'p1' })).toBe(false);
    expect(isTpvTabletSession({ businessId: 'b1' })).toBe(false);
    expect(isTpvTabletSession({ pdvId: 'p1', businessId: 'b1' })).toBe(true);
  });

  it('businessScopeIdFromRawId normaliza ids de tablet', () => {
    expect(businessScopeIdFromRawId('empresa-correcta')).toBe('empresa-correcta');
    expect(businessScopeIdFromRawId('')).toBe('');
  });

  it('businessScopeIdFromTabletBinding normaliza el id', () => {
    expect(businessScopeIdFromTabletBinding({ businessId: 'biz-abc' })).toBe('biz-abc');
    expect(businessScopeIdFromTabletBinding({ businessId: '' })).toBe('');
  });

  it('en tablet manda el binding aunque currentBusiness sea otra empresa cacheada', () => {
    const r = resolveTpvRegisterScope({
      currentBusiness: { business_id: 'empresa-vieja', id: 'empresa-vieja' },
      tabletBinding: {
        pdvId: 'pdv-nueva',
        businessId: 'empresa-tablet',
        dataUserId: 'owner-tablet',
      },
      authUser: { user_id: 'worker-1' },
      pathname: '/saas/worker/tpv/delivery',
    });
    expect(r.scopeBusinessId).toBe('empresa-tablet');
    expect(r.effectiveDataUserId).toBe('owner-tablet');
    expect(r.isTabletSession).toBe(true);
    expect(r.shouldSyncBusinessFromTablet).toBe(true);
  });

  it('binding tablet en /saas/caja/tpv no activa sesión tablet (gerente restaurante)', () => {
    const r = resolveTpvRegisterScope({
      currentBusiness: { business_id: 'rest-1', id: 'rest-1', owner_user_id: 'owner-1' },
      tabletBinding: {
        pdvId: 'pdv-nueva',
        businessId: 'empresa-tablet',
        dataUserId: 'owner-tablet',
      },
      authUser: { user_id: 'owner-1' },
      pathname: '/saas/caja/tpv',
    });
    expect(r.scopeBusinessId).toBe('rest-1');
    expect(r.isTabletSession).toBe(false);
    expect(r.shouldSyncBusinessFromTablet).toBe(false);
  });

  it('sin tablet usa currentBusiness y dataUserId del titular si es miembro', () => {
    const r = resolveTpvRegisterScope({
      currentBusiness: {
        business_id: 'biz-1',
        id: 'biz-1',
        owner_user_id: 'owner-1',
        members: [{ user_id: 'worker-1' }],
      },
      tabletBinding: null,
      authUser: { user_id: 'worker-1' },
    });
    expect(r.scopeBusinessId).toBe('biz-1');
    expect(r.effectiveDataUserId).toBe('owner-1');
    expect(r.shouldSyncBusinessFromTablet).toBe(false);
  });

  it('evaluateTpvRegisterLoadGate: tablet carga sin esperar lista de empresas', () => {
    const r = evaluateTpvRegisterLoadGate({
      businessLoading: false,
      businessesFetchSettled: false,
      isTabletSession: true,
      dataUserId: 'owner-1',
      scopeBusinessId: 'biz-1',
    });
    expect(r.canLoad).toBe(true);
    expect(r.shouldClearLoading).toBe(false);
  });

  it('evaluateTpvRegisterLoadGate: tablet carga aunque businessLoading sea true', () => {
    const r = evaluateTpvRegisterLoadGate({
      businessLoading: true,
      businessesFetchSettled: false,
      isTabletSession: true,
      dataUserId: 'owner-1',
      scopeBusinessId: 'biz-1',
    });
    expect(r.canLoad).toBe(true);
    expect(r.shouldClearLoading).toBe(false);
  });

  it('evaluateTpvRegisterLoadGate: gerente espera businessesFetchSettled', () => {
    expect(
      evaluateTpvRegisterLoadGate({
        businessLoading: false,
        businessesFetchSettled: false,
        isTabletSession: false,
        dataUserId: 'owner-1',
        scopeBusinessId: 'biz-1',
      }).canLoad,
    ).toBe(false);

    expect(
      evaluateTpvRegisterLoadGate({
        businessLoading: false,
        businessesFetchSettled: true,
        isTabletSession: false,
        dataUserId: 'owner-1',
        scopeBusinessId: 'biz-1',
      }).canLoad,
    ).toBe(true);
  });

  it('shouldApplyTpvRegisterLoadResult: tablet aplica aunque activeBid difiera', () => {
    expect(
      shouldApplyTpvRegisterLoadResult({
        isTabletSession: true,
        bidAtStart: 'biz-tablet',
        activeBid: 'biz-cache',
      }),
    ).toBe(true);
    expect(
      shouldApplyTpvRegisterLoadResult({
        isTabletSession: false,
        bidAtStart: 'biz-a',
        activeBid: 'biz-b',
      }),
    ).toBe(false);
  });

  it('resolveTpvRegisterBidAtStart fija el id de la carga en tablet', () => {
    expect(
      resolveTpvRegisterBidAtStart({
        isTabletSession: true,
        tabletBinding: { businessId: 'biz-tablet' },
        scopeBusinessId: 'biz-cache',
      }),
    ).toBe('biz-tablet');
  });

  it('resolveTpvCatalogBusinessId usa delivery si el selector no es delivery ops', () => {
    const businesses = [
      { business_id: 'clean-1', businessType: 'cleaning' },
      { business_id: 'del-1', businessType: 'delivery' },
    ];
    expect(resolveTpvCatalogBusinessId('clean-1', businesses)).toBe('del-1');
    expect(resolveTpvCatalogBusinessId('del-1', businesses)).toBe('del-1');
  });

  it('resolveTpvCatalogBusinessId mantiene restaurante activo (no redirige a delivery)', () => {
    const businesses = [
      { business_id: 'rest-1', businessType: 'restaurant' },
      { business_id: 'del-1', businessType: 'delivery' },
    ];
    expect(resolveTpvCatalogBusinessId('rest-1', businesses)).toBe('rest-1');
  });

  it('shouldAutoSwitchToDeliveryBusiness no cambia si el selector es restaurante', () => {
    const businesses = [
      { business_id: 'rest-1', businessType: 'restaurant' },
      { business_id: 'del-1', businessType: 'delivery' },
    ];
    expect(
      shouldAutoSwitchToDeliveryBusiness({ business_id: 'rest-1', businessType: 'restaurant' }, businesses),
    ).toBe(null);
  });

  it('shouldAutoSwitchToDeliveryBusiness pide cambio si el selector no es delivery ops', () => {
    const businesses = [
      { business_id: 'clean-1', businessType: 'cleaning' },
      { business_id: 'del-1', businessType: 'delivery' },
    ];
    expect(shouldAutoSwitchToDeliveryBusiness({ business_id: 'clean-1', businessType: 'cleaning' }, businesses)).toBe('del-1');
    expect(shouldAutoSwitchToDeliveryBusiness({ business_id: 'del-1', businessType: 'delivery' }, businesses)).toBe(null);
    expect(shouldAutoSwitchToDeliveryBusiness(null, businesses)).toBe(null);
  });

  it('resolveRetailOpsWriteBusinessId no escribe en limpieza cuando hay delivery', () => {
    const businesses = [
      { business_id: 'clean-1', businessType: 'cleaning' },
      { business_id: 'del-1', businessType: 'delivery' },
    ];
    expect(resolveRetailOpsWriteBusinessId('clean-1', businesses)).toBe('del-1');
    expect(resolveRetailOpsWriteBusinessId('del-1', businesses)).toBe('del-1');
    expect(resolveTpvCatalogBusinessId('clean-1', businesses)).toBe('del-1');
  });
});
