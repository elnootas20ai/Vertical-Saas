/** Abre la revisión de stock embebida en el shell TPV (sin salir a /saas/worker/stock-review). */
export const TPV_OPEN_STOCK_REVIEW_EVENT = 'vertial:tpv-open-stock-review';

export const TPV_STOCK_REVIEW_QUERY = 'stockReview';

export function requestTpvStockReviewOpen(): void {
  window.dispatchEvent(new CustomEvent(TPV_OPEN_STOCK_REVIEW_EVENT));
}

export function tpvPathWithStockReview(path: string): string {
  const base = path.split('?')[0] || path;
  const existing = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
  const params = new URLSearchParams(existing);
  params.set(TPV_STOCK_REVIEW_QUERY, '1');
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/** Lee ?stockReview=1 y limpia la URL (para redirecciones desde la ruta worker). */
export function consumeTpvStockReviewLaunch(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(TPV_STOCK_REVIEW_QUERY) !== '1') return false;
    params.delete(TPV_STOCK_REVIEW_QUERY);
    const q = params.toString();
    const path = window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
    window.history.replaceState(null, '', path);
    return true;
  } catch {
    return false;
  }
}
