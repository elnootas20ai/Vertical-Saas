import { describe, expect, it } from 'vitest';
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

describe('assertUserScope', () => {
  it('lee userId del JWT (no user_id) y permite match exacto', async () => {
    const req = { authUser: { userId: 'owner-1' } };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-1')).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('fail closed si no hay authUser.userId', async () => {
    const req = { authUser: { role: 'Admin' } };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-1')).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('rechaza :userId de otro owner', async () => {
    const req = { authUser: { userId: 'owner-a' } };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-b')).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('permite worker vía callerUserId (remap deliveryRouter)', async () => {
    const req = {
      authUser: { userId: 'worker-1' },
      callerUserId: 'worker-1',
    };
    const res = mockRes();
    expect(await assertUserScope(req, res, 'owner-1')).toBe(true);
  });
});

describe('filterCatalogDocsByBusinessScope suppliers', () => {
  it('filtra por empresa y legacy solo con 1 empresa', async () => {
    const { filterCatalogDocsByBusinessScope } = await import('../services/couchdb.js');
    const docs = [
      { _id: 's1', business_id: 'biz-a', name: 'A' },
      { _id: 's2', businessId: 'biz-b', name: 'B' },
      { _id: 's3', name: 'Legacy' },
    ];
    expect(filterCatalogDocsByBusinessScope(docs, 'biz-a', 2).map((d) => d._id)).toEqual(['s1']);
    expect(filterCatalogDocsByBusinessScope(docs, 'biz-a', 1).map((d) => d._id).sort()).toEqual([
      's1',
      's3',
    ]);
  });
});
