/**
 * Origen comercial de un cliente respecto a métricas de “nuevos”.
 * - migration: ya existían en el negocio (Excel histórico / base previa) → NO cuentan como altas del mes
 * - organic: altas reales en Vertial (TPV, CRM, pedido, web…) → SÍ cuentan
 *
 * Solo el flujo de importación Excel/CSV fija `acquisitionKind`.
 * No hay heurísticas por volumen diario: 500 altas reales en un día cuentan igual.
 */
export type ClientAcquisitionKind = 'migration' | 'organic';

/** A partir de este volumen, el wizard de Excel preselecciona “existentes / migración”. */
export const CLIENT_IMPORT_MIGRATION_HINT_THRESHOLD = 500;

type ClientAcquisitionInput = {
  createdAt?: Date | string;
  stats?: {
    acquisitionKind?: string;
    createdFrom?: string;
    excludeFromNewMetrics?: boolean;
  } | null;
};

export function suggestClientImportAcquisitionKind(validRowCount: number): ClientAcquisitionKind {
  return validRowCount >= CLIENT_IMPORT_MIGRATION_HINT_THRESHOLD ? 'migration' : 'organic';
}

export function isMigrationClient(client: ClientAcquisitionInput): boolean {
  const stats = client?.stats;
  if (!stats) return false;
  if (stats.acquisitionKind === 'organic') return false;
  if (stats.excludeFromNewMetrics === true) return true;
  if (stats.acquisitionKind === 'migration') return true;
  return false;
}

/** Si false, no suma a “clientes nuevos del mes” (sí al total de cartera). */
export function countsTowardNewClientMetrics(client: ClientAcquisitionInput): boolean {
  return !isMigrationClient(client);
}
