import { describe, expect, it } from 'vitest';
import {
  filterDocsForBusiness,
  filterCatalogDocsByBusinessScope,
  stampOpsDoc,
  normalizeOpsBusinessId,
  resolveBusinessIdFromRequest,
} from '../shared/scope/opsScope.js';
import { assertUserScope } from '../middleware/assertUserScope.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('opsScope CORE', () => {
  it('stampOpsDoc sella owner, empresa, tienda y vertical', () => {
    const doc = stampOpsDoc(
      { name: 'Mozzarella' },
      {
        ownerUserId: 'account:u1',
        businessId: 'business:biz-a',
        salesPointId: 'pdv-1',
        vertical: 'Restaurant',
      },
    );
    expect(doc.user_id).toBe('u1');
    expect(doc.business_id).toBe('biz-a');
    expect(doc.businessId).toBe('biz-a');
    expect(doc.salesPointId).toBe('pdv-1');
    expect(doc.vertical).toBe('restaurant');
  });

  it('en multi-empresa no comparte docs legacy sin business_id', () => {
    const docs = [
      { _id: 'a', business_id: 'biz-a' },
      { _id: 'b', businessId: 'biz-b' },
      { _id: 'legacy' },
    ];
    expect(filterDocsForBusiness(docs, 'biz-a', { multiEmpresa: true }).map((d) => d._id)).toEqual(['a']);
    expect(filterCatalogDocsByBusinessScope(docs, 'biz-a', 2).map((d) => d._id)).toEqual(['a']);
    expect(filterCatalogDocsByBusinessScope(docs, 'biz-a', 1).map((d) => d._id).sort()).toEqual([
      'a',
      'legacy',
    ]);
  });

  it('normalizeOpsBusinessId quita prefijo', () => {
    expect(normalizeOpsBusinessId('business:xyz')).toBe('xyz');
  });

  it('resolveBusinessIdFromRequest lee query', () => {
    expect(
      resolveBusinessIdFromRequest({ query: { businessId: 'business:b1' }, body: {}, params: {} }),
    ).toBe('b1');
  });
});

describe('IDOR cuenta', () => {
  it('JWT user A no opera sobre :userId de B', async () => {
    const req = { authUser: { userId: 'owner-a' } };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-b')).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('JWT user A sí opera sobre su :userId', async () => {
    const req = { authUser: { userId: 'owner-a' } };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-a')).toBe(true);
  });
});
