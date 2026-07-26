import { listClientsPageRequest, type Client } from './crmApi';
import { prevCalendarMonthKey } from './portfolioMetrics';

/** Evita descargar carteras enormes (Pau ~6k) al calcular altas del mes en Dashboard/portfolio. */
export const CLIENT_ACQUISITION_SAMPLE_PAGE_SIZE = 500;
export const CLIENT_ACQUISITION_SAMPLE_MAX_PAGES = 3;

function createdAtMs(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Total real vía meta + muestra reciente (orden -createdAt) para métricas de altas.
 * Nunca pagina toda la cartera.
 */
export async function fetchClientAcquisitionSample(
  userId: string,
  options: {
    monthKey: string;
    businessId?: string;
    maxPages?: number;
    pageSize?: number;
    signal?: AbortSignal;
  },
): Promise<{ totalClients: number; sample: Client[] }> {
  const pageSize = options.pageSize ?? CLIENT_ACQUISITION_SAMPLE_PAGE_SIZE;
  const maxPages = Math.max(1, options.maxPages ?? CLIENT_ACQUISITION_SAMPLE_MAX_PAGES);
  const prevMonthStartMs = Date.parse(`${prevCalendarMonthKey(options.monthKey)}-01T00:00:00.000Z`);
  const sample: Client[] = [];
  let skip = 0;
  let totalClients = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const { clients, meta } = await listClientsPageRequest(userId, {
      limit: pageSize,
      skip,
      lite: true,
      businessId: options.businessId,
      sort: '-createdAt',
      signal: options.signal,
    });
    if (page === 0) totalClients = Number(meta?.total || 0);
    if (!clients.length) break;
    sample.push(...clients);

    const oldestMs = createdAtMs(clients[clients.length - 1]?.createdAt);
    const reachedPrevMonth = Number.isFinite(oldestMs) && oldestMs < prevMonthStartMs;
    if (!meta.hasMore || reachedPrevMonth) break;
    skip += pageSize;
  }

  return { totalClients: totalClients || sample.length, sample };
}
