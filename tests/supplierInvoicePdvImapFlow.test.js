/**
 * Flujo correo facturas por PDV: listar targets, mensaje sin IMAP, poll con PDF.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fakePdv = {
  _id: 'pdv_tiana',
  type: 'point_of_sale',
  name: 'LOCAL TIANA',
  active: true,
  user_id: 'user-pau',
  workCenterId: 'wc1',
  businessId: 'biz1',
  supplierInvoiceConfig: {
    enabled: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapUser: 'facturas.tiana@gmail.com',
    imapPassword: 'app-pass-real',
    imapTls: true,
    imapCursorUid: 10,
    imapSyncFrom: '2026-08-01T00:00:00.000Z',
  },
};

const putDocument = vi.fn(async (_r, _db, id, doc) => ({ id, rev: '1-x' }));
const connectAndFetchNewEmails = vi.fn(async () => {
  const emails = [];
  emails._imapCursorUid = 11;
  return emails;
});

vi.mock('../services/couchdb.js', () => ({
  ACCOUNTS_DB: 'accounts',
  ensureDatabase: vi.fn(async () => {}),
  getDocument: vi.fn(async () => ({ _id: 'inv_user-pau_1', _rev: '1-x', type: 'purchase_invoice' })),
  putDocument,
  getAllDocuments: vi.fn(async () => []),
  findAccountByUserId: vi.fn(async () => ({
    _id: 'acc-pau',
    userId: 'user-pau',
    type: 'account',
    supplierInvoiceConfig: {},
  })),
  listPointsOfSaleByUser: vi.fn(async () => [fakePdv]),
  pdvDocMatchesUser: () => true,
  resolveDataOwnerUserId: vi.fn(async (_req, userId) => ({
    ownerUserId: userId,
    account: null,
    isInvited: false,
  })),
  getDeliveryDbName: () => 'delivery',
  getCatalogDbName: () => 'catalog',
  buildPurchaseInvoiceDocument: vi.fn((userId, data) => ({
    _id: `inv_${userId}_1`,
    type: 'purchase_invoice',
    user_id: userId,
    ...data,
  })),
  listPurchaseInvoicesByUser: vi.fn(async () => []),
  findDuplicatePurchaseInvoice: vi.fn(async () => null),
  assignPurchaseInvoiceNumber: vi.fn(async () => 'F-1'),
  listSuppliersByUser: vi.fn(async () => []),
  couchRequest: vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
}));

vi.mock('../services/imapService.js', () => ({
  isImapConfigured: (ov = {}) => Boolean(ov.host && ov.user && ov.pass),
  connectAndFetchNewEmails,
  testImapConnection: vi.fn(async () => ({ ok: true, folders: ['INBOX'], totalMessages: 3 })),
}));

vi.mock('../services/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/purchaseInvoiceReconcile.js', () => ({
  reconcilePurchaseInvoiceFromOcr: vi.fn(async () => ({})),
}));

describe('supplier invoice PDV IMAP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectAndFetchNewEmails.mockImplementation(async () => {
      const emails = [];
      emails._imapCursorUid = 11;
      return emails;
    });
  });

  it('lista el buzón del PDV cuando está enabled + host/user/pass', async () => {
    const { listSupplierInvoiceImapTargets } = await import('../services/supplierInvoiceProcessor.js');
    const targets = await listSupplierInvoiceImapTargets('user-pau');
    expect(targets).toHaveLength(1);
    expect(targets[0].host).toBe('imap.gmail.com');
    expect(targets[0].user).toBe('facturas.tiana@gmail.com');
    expect(targets[0].pass).toBe('app-pass-real');
    expect(targets[0]._pdvId).toBe('pdv_tiana');
  });

  it('sin targets devuelve mensaje claro (no silencio)', async () => {
    const couch = await import('../services/couchdb.js');
    couch.listPointsOfSaleByUser.mockResolvedValueOnce([]);
    couch.findAccountByUserId.mockResolvedValueOnce({
      _id: 'acc',
      userId: 'user-empty',
      supplierInvoiceConfig: {},
    });
    const { processIncomingEmails } = await import('../services/supplierInvoiceProcessor.js');
    const summary = await processIncomingEmails('user-empty');
    expect(summary.created).toBe(0);
    expect(String(summary.message || '')).toMatch(/No hay correo/i);
  });

  it('con PDV listo hace poll sin error (0 emails nuevos)', async () => {
    const { processIncomingEmails } = await import('../services/supplierInvoiceProcessor.js');
    const summary = await processIncomingEmails('user-pau');
    expect(summary.errors || 0).toBe(0);
    expect(summary.message || '').not.toMatch(/No hay correo/i);
  });

  it('poll lee email con PDF (hasValidAttachments) sin tumbar el ciclo', async () => {
    connectAndFetchNewEmails.mockImplementation(async () => {
      const emails = [
        {
          messageId: '<msg-1@test>',
          from: 'proveedor@example.com',
          subject: 'Factura FAC-9999',
          date: '2026-08-20T10:00:00.000Z',
          hasValidAttachments: true,
          attachments: [
            {
              filename: 'fac-9999.pdf',
              mimeType: 'application/pdf',
              size: 1200,
              content: Buffer.from('%PDF-1.4 fake'),
            },
          ],
        },
      ];
      emails._imapCursorUid = 12;
      return emails;
    });

    const { processIncomingEmails } = await import('../services/supplierInvoiceProcessor.js');
    const summary = await processIncomingEmails('user-pau');
    expect(summary.processed).toBe(1);
    // Sin OCR real no hay importe usable → 0 created (regla de negocio). El punto es que no pete.
    expect(summary.errors || 0).toBe(0);
  });

  it('router expone GET /config/:userId/pdvs', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'routers/supplierInvoiceRouter.js'), 'utf8');
    expect(src).toMatch(/config\/:userId\/pdvs/);
    expect(src).toMatch(/listPdvEmailConfigs/);
  });
});
