import type { PortfolioBusiness } from '../../hooks/usePortfolioOverview';
import type { Business, BusinessType } from '../../lib/businessApi';
import { isDeliveryBusinessType, normalizeBusinessScopeId } from '../../lib/deliverySetup';

export type GateBusinessSnapshot = {
  employeeCount: number;
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryValue: number;
  tertiaryLabel: string;
  tertiaryValue: number;
  /** Para ordenar por beneficio en la rejilla. */
  profitValue: number;
  contextLine?: string;
  alerts: Array<{ id: string; type: 'warning' | 'info' | 'error'; message: string }>;
};

function snapshotKey(businessId: string): string {
  return normalizeBusinessScopeId(businessId);
}

export function buildGateSnapshotMap(rows: PortfolioBusiness[]): Map<string, GateBusinessSnapshot> {
  const map = new Map<string, GateBusinessSnapshot>();
  for (const row of rows) {
    const snap = rowToSnapshot(row);
    map.set(snapshotKey(row.businessId), snap);
    map.set(row.businessId, snap);
  }
  return map;
}

function rowToSnapshot(row: PortfolioBusiness): GateBusinessSnapshot {
  const employeeCount = row.memberCount || row.business.members?.length || 1;
  const alerts: GateBusinessSnapshot['alerts'] = [];

  if (row.metrics.activeOrders > 0) {
    alerts.push({
      id: 'active-orders',
      type: 'info',
      message: `${row.metrics.activeOrders} pedido(s) en curso`,
    });
  }
  if (row.finance.profitMonth < 0) {
    alerts.push({
      id: 'negative-profit',
      type: 'error',
      message: 'Beneficio negativo este mes',
    });
  }
  if (row.finance.pendingAmount > 0) {
    alerts.push({
      id: 'pending-invoices',
      type: 'warning',
      message: `${formatCompactEuro(row.finance.pendingAmount)} pendiente(s) de cobro`,
    });
  }
  if (row.team.pendingVacationRequests > 0) {
    alerts.push({
      id: 'vacations',
      type: 'warning',
      message: `${row.team.pendingVacationRequests} solicitud(es) de vacaciones`,
    });
  }

  if (row.isDelivery) {
    const storePart =
      row.storeCount > 0 ? `${row.storeCount} tienda${row.storeCount === 1 ? '' : 's'}` : null;
    const pdvPart =
      row.pdvCount > 0 ? `${row.pdvCount} PDV` : null;
    const ordersPart =
      row.metrics.deliveredMonth > 0
        ? `${row.metrics.deliveredMonth} pedido${row.metrics.deliveredMonth === 1 ? '' : 's'} este mes`
        : null;
    const contextLine = [storePart, pdvPart, ordersPart].filter(Boolean).join(' · ') || undefined;

    return {
      employeeCount,
      primaryLabel: 'Ventas mes',
      primaryValue: row.metrics.revenueMonth,
      secondaryLabel: 'Pedidos',
      secondaryValue: row.metrics.deliveredMonth,
      tertiaryLabel: 'Activos',
      tertiaryValue: row.metrics.activeOrders,
      profitValue: row.metrics.revenueMonth,
      contextLine,
      alerts,
    };
  }

  const income = row.finance.incomeMonth;
  const expenses = row.finance.expensesMonth;
  const profit = row.finance.profitMonth || income - expenses;

  if (row.business.businessType === 'carDealership') {
    const clientPart =
      row.clients.totalClients > 0
        ? `${row.clients.totalClients} cliente${row.clients.totalClients === 1 ? '' : 's'}`
        : null;
    const newClientsPart =
      row.clients.newClientsMonth > 0
        ? `+${row.clients.newClientsMonth} nuevos este mes`
        : null;
    const incomePart = income > 0 ? `${formatCompactEuro(income)} ingresos` : null;
    const contextLine = [incomePart, clientPart, newClientsPart].filter(Boolean).join(' · ') || undefined;

    return {
      employeeCount,
      primaryLabel: 'Ingresos',
      primaryValue: income,
      secondaryLabel: 'Gastos',
      secondaryValue: expenses,
      tertiaryLabel: 'Beneficio',
      tertiaryValue: profit,
      profitValue: profit,
      contextLine,
      alerts,
    };
  }

  const contextParts: string[] = [];
  if (row.storeCount > 0) contextParts.push(`${row.storeCount} sede${row.storeCount === 1 ? '' : 's'}`);
  if (row.brandCount > 0) contextParts.push(`${row.brandCount} marca${row.brandCount === 1 ? '' : 's'}`);
  if (row.clients.totalClients > 0) {
    contextParts.push(`${row.clients.totalClients} clientes`);
  }

  return {
    employeeCount,
    primaryLabel: 'Ingresos',
    primaryValue: income,
    secondaryLabel: 'Gastos',
    secondaryValue: expenses,
    tertiaryLabel: 'Beneficio',
    tertiaryValue: profit,
    profitValue: profit,
    contextLine: contextParts.length > 0 ? contextParts.join(' · ') : undefined,
    alerts,
  };
}

export function resolveGateSnapshot(
  business: Business,
  snapshots?: Map<string, GateBusinessSnapshot>,
): GateBusinessSnapshot | undefined {
  if (!snapshots) return undefined;
  return (
    snapshots.get(business.business_id) ||
    snapshots.get(snapshotKey(business.business_id))
  );
}

export function fallbackGateSnapshot(business: Business): GateBusinessSnapshot {
  const employeeCount = business.members?.length || 1;
  const branchCount = business.branches?.length ?? 0;
  const isDelivery = isDeliveryBusinessType(business.businessType);

  return {
    employeeCount,
    primaryLabel: isDelivery ? 'Ventas mes' : 'Ingresos',
    primaryValue: 0,
    secondaryLabel: isDelivery ? 'Pedidos' : 'Gastos',
    secondaryValue: 0,
    tertiaryLabel: isDelivery ? 'Activos' : 'Beneficio',
    tertiaryValue: 0,
    profitValue: 0,
    contextLine:
      branchCount > 0
        ? `${branchCount} sede${branchCount === 1 ? '' : 's'}`
        : businessTypeHint(business.businessType),
    alerts: [],
  };
}

function businessTypeHint(type: BusinessType): string | undefined {
  const hints: Partial<Record<BusinessType, string>> = {
    delivery: 'Delivery · entra al panel para ver ventas',
    carDealership: 'Compraventa · entra al panel para ver stock',
    workshop: 'Taller · entra al panel para ver operativa',
  };
  return hints[type];
}

function formatCompactEuro(amount: number): string {
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}k €`;
  return `${amount.toLocaleString('es-ES')} €`;
}
