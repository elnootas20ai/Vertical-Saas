import { normalizeBusinessScopeId } from './deliverySetup';

/** Solo documentos de la empresa activa (legacy sin businessId → una sola empresa). */
export function filterPurchaseDocsByBusinessScope<T extends { businessId?: string; business_id?: string }>(
  docs: T[],
  businessId: string | null | undefined,
  accountBusinessCount = 1,
): T[] {
  const bid = normalizeBusinessScopeId(businessId || '');
  if (!bid) return docs;
  return docs.filter((doc) => {
    const docBid = normalizeBusinessScopeId(String(doc.businessId || doc.business_id || ''));
    if (!docBid) return accountBusinessCount <= 1;
    return docBid === bid;
  });
}

export const PURCHASE_LIST_DEFAULT_LIMIT = 400;

export function purchaseListQuery(
  businessId?: string | null,
  accountBusinessCount?: number,
  limit = PURCHASE_LIST_DEFAULT_LIMIT,
): string {
  const params = new URLSearchParams();
  const bid = normalizeBusinessScopeId(businessId || '');
  if (bid) {
    params.set('businessId', bid);
    if (accountBusinessCount != null && accountBusinessCount > 0) {
      params.set('accountBusinessCount', String(accountBusinessCount));
    }
  }
  if (limit > 0) {
    params.set('limit', String(limit));
  }
  return `?${params.toString()}`;
}
