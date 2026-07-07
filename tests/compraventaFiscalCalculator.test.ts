import { describe, expect, it } from 'vitest';
import {
  ORIGIN_OPTIONS,
  SALE_CLIENT_OPTIONS,
  SELLERS_BY_ORIGIN,
  computeFiscalResult,
  computeVehicleVatStatus,
  normalizeFiscalForm,
  type FiscalFormInput,
  type PurchaseOrigin,
  type SellerId,
} from '../src/app/lib/compraventaFiscalCalculator';

function baseForm(overrides: Partial<FiscalFormInput>): FiscalFormInput {
  return {
    origin: 'spain',
    seller: 'private',
    ccaa: 'ES-MD',
    vehicleId: '',
    acquisitionId: '',
    brand: 'Seat',
    model: 'León',
    plate: '',
    firstRegistration: '2019-03-01',
    mileage: '98000',
    purchasePrice: '8000',
    includeSale: false,
    saleClient: 'private_spain',
    salePrice: '',
    ...overrides,
  };
}

function usedVehicle(): Pick<FiscalFormInput, 'firstRegistration' | 'mileage'> {
  return { firstRegistration: '2019-03-01', mileage: '98000' };
}

function newVehicle(): Pick<FiscalFormInput, 'firstRegistration' | 'mileage'> {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return { firstRegistration: d.toISOString().slice(0, 10), mileage: '3500' };
}

describe('compraventaFiscalCalculator — casos reales del manual', () => {
  it('1 · España particular usado → REBU 347,11 € IVA', () => {
    const r = computeFiscalResult(baseForm({ includeSale: true, salePrice: '10000' }));
    expect(r.purchase?.rebuEligible).toBe(true);
    expect(r.purchase?.realPurchaseCost).toBe(8000);
    expect(r.purchase?.tpoEstimate).toBe(320);
    expect(r.sale?.regime).toBe('rebu');
    expect(r.sale?.margin).toBe(2000);
    expect(r.sale?.vatQuota303).toBe(347.11);
  });

  it('2 · UE particular km0 alemán → general 33.880 €', () => {
    const r = computeFiscalResult(
      baseForm({
        origin: 'eu',
        seller: 'eu_private',
        ...newVehicle(),
        purchasePrice: '25000',
        includeSale: true,
        saleClient: 'company_spain',
        salePrice: '28000',
      }),
    );
    expect(r.vatStatus).toBe('new');
    expect(r.purchase?.rebuEligible).toBe(false);
    expect(r.sale?.regime).toBe('general');
    expect(r.sale?.invoiceTotal).toBe(33880);
    expect(r.sale?.vatQuota303).toBe(5880);
  });

  it('3 · Compra REBU → venta empresa UE exenta', () => {
    const r = computeFiscalResult(
      baseForm({
        seller: 'reseller_rebu',
        firstRegistration: '2018-01-01',
        mileage: '112000',
        purchasePrice: '6000',
        includeSale: true,
        saleClient: 'eu_business',
        salePrice: '7500',
      }),
    );
    expect(r.sale?.regime).toBe('exempt_intra');
    expect(r.sale?.vatQuota303).toBe(0);
  });
});

describe('compraventaFiscalCalculator — matriz compra (todos los vendedores)', () => {
  const cases: {
    origin: PurchaseOrigin;
    seller: SellerId;
    rebu: boolean;
    label: string;
  }[] = [
    { origin: 'spain', seller: 'private', rebu: true, label: 'ES particular' },
    { origin: 'spain', seller: 'company_vat', rebu: false, label: 'ES empresa IVA' },
    { origin: 'spain', seller: 'company_exempt', rebu: true, label: 'ES empresa exenta' },
    { origin: 'spain', seller: 'reseller_rebu', rebu: true, label: 'ES revendedor REBU' },
    { origin: 'eu', seller: 'eu_private', rebu: true, label: 'UE particular usado' },
    { origin: 'eu', seller: 'eu_company_vat', rebu: false, label: 'UE empresa' },
    { origin: 'eu', seller: 'eu_reseller_margin', rebu: true, label: 'UE margen' },
    { origin: 'outside_eu', seller: 'import_any', rebu: false, label: 'Importación' },
  ];

  for (const c of cases) {
    it(`${c.label} → REBU ${c.rebu ? 'SÍ' : 'NO'}`, () => {
      const r = computeFiscalResult(
        baseForm({
          origin: c.origin,
          seller: c.seller,
          ...(c.origin === 'eu' && c.seller === 'eu_private' ? usedVehicle() : {}),
          purchasePrice: '15000',
        }),
      );
      expect(r.purchase).not.toBeNull();
      expect(r.purchase?.rebuEligible).toBe(c.rebu);
    });
  }

  it('UE particular NUEVO → sin REBU', () => {
    const r = computeFiscalResult(
      baseForm({
        origin: 'eu',
        seller: 'eu_private',
        ...newVehicle(),
        purchasePrice: '25000',
      }),
    );
    expect(r.purchase?.rebuEligible).toBe(false);
  });
});

describe('compraventaFiscalCalculator — matriz venta', () => {
  it('REBU elegible + particular ES → factura total sin desglose', () => {
    const r = computeFiscalResult(baseForm({ includeSale: true, salePrice: '12000' }));
    expect(r.sale?.regime).toBe('rebu');
    expect(r.sale?.invoiceTotal).toBe(12000);
  });

  it('sin REBU + particular ES → base + 21%', () => {
    const r = computeFiscalResult(
      baseForm({
        seller: 'company_vat',
        purchasePrice: '10000',
        includeSale: true,
        salePrice: '15000',
      }),
    );
    expect(r.sale?.regime).toBe('general');
    expect(r.sale?.invoiceTotal).toBe(18150);
    expect(r.sale?.vatQuota303).toBe(3150);
  });

  it('exportación → exenta 0 € IVA', () => {
    const r = computeFiscalResult(
      baseForm({ includeSale: true, saleClient: 'outside_eu', salePrice: '9000' }),
    );
    expect(r.sale?.regime).toBe('exempt_export');
    expect(r.sale?.vatQuota303).toBe(0);
  });

  it('particular UE + coche NUEVO → exenta art. 25.Dos', () => {
    const r = computeFiscalResult(
      baseForm({
        origin: 'eu',
        seller: 'eu_company_vat',
        ...newVehicle(),
        purchasePrice: '20000',
        includeSale: true,
        saleClient: 'eu_private',
        salePrice: '22000',
      }),
    );
    expect(r.sale?.regime).toBe('exempt_new_eu');
    expect(r.sale?.vatQuota303).toBe(0);
  });

  it('particular UE + coche USADO + REBU → margen', () => {
    const r = computeFiscalResult(
      baseForm({
        origin: 'eu',
        seller: 'eu_private',
        ...usedVehicle(),
        purchasePrice: '9000',
        includeSale: true,
        saleClient: 'eu_private',
        salePrice: '11000',
      }),
    );
    expect(r.sale?.regime).toBe('rebu');
    expect(r.sale?.margin).toBe(2000);
  });
});

describe('compraventaFiscalCalculator — importación y TPO', () => {
  it('importación 20.000 € → 26.620 € coste real', () => {
    const r = computeFiscalResult(
      baseForm({ origin: 'outside_eu', seller: 'import_any', purchasePrice: '20000' }),
    );
    expect(r.purchase?.tariffEstimate).toBe(2000);
    expect(r.purchase?.vatSupported).toBe(4620);
    expect(r.purchase?.realPurchaseCost).toBe(26620);
  });

  it('TPO Valencia 6% ≠ Madrid 4%', () => {
    const madrid = computeFiscalResult(baseForm({ purchasePrice: '10000', ccaa: 'ES-MD' }));
    const valencia = computeFiscalResult(baseForm({ purchasePrice: '10000', ccaa: 'ES-VC' }));
    expect(madrid.purchase?.tpoEstimate).toBe(400);
    expect(valencia.purchase?.tpoEstimate).toBe(600);
    expect(madrid.purchase?.realPurchaseCost).toBe(10000);
    expect(valencia.purchase?.realPurchaseCost).toBe(10000);
  });

  it('acepta precio con formato español 25.000', () => {
    const r = computeFiscalResult(baseForm({ purchasePrice: '25.000' }));
    expect(r.purchase?.realPurchaseCost).toBe(25000);
  });
});

describe('compraventaFiscalCalculator — nuevo/usado (art. 13.2ª)', () => {
  it('6000 km = NUEVO aunque sea antiguo', () => {
    expect(computeVehicleVatStatus('2010-01-01', '6000').status).toBe('new');
  });

  it('6001 km + más de 6 meses = USADO', () => {
    expect(computeVehicleVatStatus('2019-01-01', '6001').status).toBe('used');
  });

  it('sin km/fecha = pendiente, sin REBU en UE particular', () => {
    const r = computeFiscalResult(
      baseForm({
        origin: 'eu',
        seller: 'eu_private',
        firstRegistration: '',
        mileage: '',
        purchasePrice: '12000',
      }),
    );
    expect(r.vatStatus).toBe('unknown');
    expect(r.purchase?.rebuEligible).toBe(false);
  });
});

describe('compraventaFiscalCalculator — robustez', () => {
  it('corrige vendedor incompatible con origen', () => {
    expect(normalizeFiscalForm(baseForm({ origin: 'spain', seller: 'eu_private' })).seller).toBe('private');
    expect(normalizeFiscalForm(baseForm({ origin: 'eu', seller: 'private' })).seller).toBe('eu_private');
  });

  it('nunca devuelve purchase null con precio válido en cualquier origen', () => {
    for (const origin of ORIGIN_OPTIONS) {
      for (const seller of SELLERS_BY_ORIGIN[origin.id]) {
        const r = computeFiscalResult(
          baseForm({
            origin: origin.id,
            seller: seller.id,
            ...(origin.id === 'eu' ? usedVehicle() : {}),
            purchasePrice: '5000',
          }),
        );
        expect(r.purchase, `${origin.id}/${seller.id}`).not.toBeNull();
      }
    }
  });

  it('margen REBU nunca negativo', () => {
    const r = computeFiscalResult(
      baseForm({ includeSale: true, salePrice: '5000' }),
    );
    expect(r.sale?.margin).toBe(0);
    expect(r.sale?.vatQuota303).toBe(0);
  });
});
