import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('blindajes críticos TPV restaurante', () => {
  it('no permite mutar libremente pedido ni comanda', () => {
    const controller = source('controllers/salaController.js');
    expect(controller).toMatch(/const allowedFields = new Set/);
    expect(controller).toMatch(/Campos no permitidos en la actualización/);
    expect(controller).toMatch(/Solo se permite anular líneas desde esta operación/);
    expect(controller).toMatch(/prepareComandaFromCatalog/);
    expect(controller).toMatch(/CATALOG_PRICE_MISMATCH/);
  });

  it('protege descuentos, anulaciones y cierre forzado por rol', () => {
    const controller = source('controllers/salaController.js');
    expect(controller).toMatch(/requireOrderManager/);
    expect(controller).toMatch(/No se puede anular una cuenta con cobros/);
    expect(controller).toMatch(/if \(force && !\(await requireOrderManager/);
  });

  it('usa id estable y bloquea cobros fuera de caja o por encima del pendiente', () => {
    const controller = source('controllers/salaController.js');
    const client = source('src/app/lib/restaurantDiningTpv.ts');
    expect(client).toMatch(/id: String\(params\.payment\.id \|\| uuidv4\(\)\)/);
    expect(controller).toMatch(/paymentAlreadyRecorded/);
    expect(controller).toMatch(/El importe del cobro supera el pendiente/);
    expect(controller).toMatch(/deben registrarse siempre en una caja abierta/);
    expect(controller).toMatch(/validateDiningCajaTarget/);
  });

  it('cruza empresa de cuenta y caja y calcula finanzas con IVA incluido', () => {
    const caja = source('services/diningCajaService.js');
    const finance = source('services/diningOrderFinanceService.js');
    expect(caja).toMatch(/business_mismatch/);
    expect(finance).toMatch(/calcLinesTaxBreakdown/);
    expect(finance).toMatch(/pricesIncludeTax: true/);
    expect(finance).not.toMatch(/taxRate:\s*21,/);
  });
});
