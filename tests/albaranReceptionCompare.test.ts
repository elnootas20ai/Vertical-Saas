import { describe, expect, it } from 'vitest';
import {
  applyManualAlbaranQty,
  buildAlbaranCompareRows,
  buildPendingOrderLinesFromCompare,
  buildReplenishPurchaseOrderPayload,
  invoiceIsAlbaran,
  isAlbaranInvoiceIncomplete,
  isPurchaseOrderWaitingAlbaran,
  nameMatchScore,
  summarizeCompareIssues,
  toggleCompareRowExcluded,
} from '../src/app/lib/albaranReceptionCompare.ts';

describe('albaranReceptionCompare', () => {
  it('detecta pedidos en espera', () => {
    expect(isPurchaseOrderWaitingAlbaran({ status: 'sent' })).toBe(true);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'partial' })).toBe(true);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'received' })).toBe(false);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'draft' })).toBe(true);
  });

  it('detecta documento albarán', () => {
    expect(invoiceIsAlbaran({ documentKind: 'albaran' })).toBe(true);
    expect(invoiceIsAlbaran({ documentKind: 'factura_proveedor', ocrData: { documentType: 'albaran' } as never })).toBe(true);
    expect(invoiceIsAlbaran({ documentKind: 'factura_proveedor' })).toBe(false);
  });

  it('compara pedido vs albarán y marca diferencias', () => {
    const rows = buildAlbaranCompareRows(
      {
        items: [
          {
            id: '1',
            catalogItemId: 'c1',
            sku: 'A1',
            name: 'Tomate triturado',
            quantity: 10,
            unitCost: 1.2,
            total: 12,
            received: 0,
            notes: '',
          },
          {
            id: '2',
            catalogItemId: 'c2',
            sku: 'A2',
            name: 'Mozzarella',
            quantity: 5,
            unitCost: 3,
            total: 15,
            received: 0,
            notes: '',
          },
        ],
      },
      {
        lines: [
          { id: 'l1', itemName: 'Tomate triturado', quantity: 8, unitPrice: 1.5, total: 12, catalogItemId: 'c1' },
          { id: 'l2', itemName: 'Aceite oliva', quantity: 2, unitPrice: 4, total: 8 },
        ],
      },
    );

    expect(rows.find((r) => r.catalogItemId === 'c1')?.status).toBe('both_diff');
    expect(rows.find((r) => r.catalogItemId === 'c2')?.status).toBe('missing_invoice');
    expect(rows.find((r) => r.catalogItemId === 'c2')?.receiveQty).toBe(0);
    expect(rows.find((r) => r.catalogItemId === 'c2')?.excluded).toBe(true);
    expect(rows.some((r) => r.status === 'extra_invoice' && r.name === 'Aceite oliva')).toBe(true);

    const summary = summarizeCompareIssues(rows);
    expect(summary.extras).toBe(1);
    expect(summary.issues).toBeGreaterThan(0);
  });

  it('sin factura deja filas listas para editar', () => {
    const rows = buildAlbaranCompareRows({
      items: [
        {
          id: '1',
          catalogItemId: 'c1',
          sku: '',
          name: 'Harina',
          quantity: 20,
          unitCost: 0.8,
          total: 16,
          received: 0,
          notes: '',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].receiveQty).toBe(20);
    expect(rows[0].invoiceQty).toBe(20);
    expect(rows[0].receiveUnitCost).toBe(0.8);
    expect(rows[0].excluded).toBe(false);
  });

  it('marca excluded y receiveQty 0 cuando falta en albarán OCR', () => {
    const rows = buildAlbaranCompareRows(
      {
        items: [
          {
            id: '2',
            catalogItemId: 'c2',
            sku: 'A2',
            name: 'Mozzarella',
            quantity: 5,
            unitCost: 3,
            total: 15,
            received: 0,
            notes: '',
          },
        ],
      },
      { lines: [] },
    );
    expect(rows[0].status).toBe('missing_invoice');
    expect(rows[0].receiveQty).toBe(0);
    expect(rows[0].excluded).toBe(true);
  });

  it('applyManualAlbaranQty excluye con cantidad 0', () => {
    const row = applyManualAlbaranQty(
      {
        catalogItemId: 'c1',
        name: 'Harina',
        sku: '',
        orderedQty: 20,
        orderedUnitCost: 0.8,
        invoiceQty: 20,
        invoiceUnitCost: 0,
        status: 'ok',
        receiveQty: 20,
        receiveUnitCost: 0.8,
        excluded: false,
      },
      0,
    );
    expect(row.excluded).toBe(true);
    expect(row.receiveQty).toBe(0);
    expect(row.status).toBe('missing_invoice');
  });

  it('buildPendingOrderLinesFromCompare lista quitados y cantidades parciales', () => {
    const rows = buildAlbaranCompareRows(
      {
        items: [
          {
            id: '1',
            catalogItemId: 'c1',
            sku: '',
            name: 'Harina',
            quantity: 10,
            unitCost: 1,
            total: 10,
            received: 0,
            notes: '',
          },
          {
            id: '2',
            catalogItemId: 'c2',
            sku: '',
            name: 'Aceite',
            quantity: 5,
            unitCost: 2,
            total: 10,
            received: 0,
            notes: '',
          },
        ],
      },
      null,
    );
    const excluded = toggleCompareRowExcluded(rows[1], true, 5);
    const partial = applyManualAlbaranQty(rows[0], 6);
    const pending = buildPendingOrderLinesFromCompare(
      {
        items: [
          { id: '1', catalogItemId: 'c1', sku: '', name: 'Harina', quantity: 10, unitCost: 1, total: 10, received: 0, notes: '' },
          { id: '2', catalogItemId: 'c2', sku: '', name: 'Aceite', quantity: 5, unitCost: 2, total: 10, received: 0, notes: '' },
        ],
      },
      [partial, excluded],
    );
    expect(pending).toHaveLength(2);
    expect(pending.find((p) => p.name === 'Aceite')?.pendingQty).toBe(5);
    expect(pending.find((p) => p.name === 'Harina')?.pendingQty).toBe(4);
  });

  it('isAlbaranInvoiceIncomplete detecta pedido parcial', () => {
    expect(
      isAlbaranInvoiceIncomplete(
        { flags: { orderIncomplete: true }, pendingOrderLines: [{ catalogItemId: 'c1', name: 'X', sku: '', orderedQty: 5, receivedQty: 0, pendingQty: 5 }] },
        { status: 'partial', items: [] },
      ),
    ).toBe(true);
  });

  it('buildReplenishPurchaseOrderPayload arma borrador con lo pendiente', () => {
    const payload = buildReplenishPurchaseOrderPayload(
      {
        orderNumber: 'PC-0003',
        supplierId: 'sup-1',
        supplierName: 'Makro',
        taxRate: 21,
        items: [
          {
            id: '1',
            catalogItemId: 'c1',
            sku: 'A1',
            name: 'Harina',
            quantity: 10,
            unitCost: 2,
            total: 20,
            received: 6,
            notes: '',
          },
          {
            id: '2',
            catalogItemId: 'c2',
            sku: '',
            name: 'Aceite',
            quantity: 5,
            unitCost: 4,
            total: 20,
            received: 0,
            notes: '',
            supplierId: 'sup-2',
            supplierName: 'Otro',
          },
        ],
      },
      [
        { catalogItemId: 'c1', name: 'Harina', sku: 'A1', orderedQty: 10, receivedQty: 6, pendingQty: 4 },
        { catalogItemId: 'c2', name: 'Aceite', sku: '', orderedQty: 5, receivedQty: 0, pendingQty: 5 },
      ],
    );
    expect(payload?.items).toHaveLength(2);
    expect(payload?.items?.[0].quantity).toBe(4);
    expect(payload?.items?.[1].supplierId).toBe('sup-2');
    expect(payload?.notes).toContain('PC-0003');
  });

  it('nameMatchScore reconoce nombres parecidos', () => {
    expect(nameMatchScore('Tomate triturado 5kg', 'Tomate triturado')).toBeGreaterThan(0.3);
    expect(nameMatchScore('Mozzarella', 'Aceite')).toBeLessThan(0.3);
  });
});
