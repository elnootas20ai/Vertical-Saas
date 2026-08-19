import { describe, expect, it } from 'vitest';
import {
  buildAlbaranCompareRows,
  invoiceIsAlbaran,
  isPurchaseOrderWaitingAlbaran,
  nameMatchScore,
  summarizeCompareIssues,
} from '../src/app/lib/albaranReceptionCompare.ts';

describe('albaranReceptionCompare', () => {
  it('detecta pedidos en espera', () => {
    expect(isPurchaseOrderWaitingAlbaran({ status: 'sent' })).toBe(true);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'partial' })).toBe(true);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'received' })).toBe(false);
    expect(isPurchaseOrderWaitingAlbaran({ status: 'draft' })).toBe(false);
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
    expect(rows[0].receiveUnitCost).toBe(0.8);
  });

  it('nameMatchScore reconoce nombres parecidos', () => {
    expect(nameMatchScore('Tomate triturado 5kg', 'Tomate triturado')).toBeGreaterThan(0.3);
    expect(nameMatchScore('Mozzarella', 'Aceite')).toBeLessThan(0.3);
  });
});
