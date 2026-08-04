/**
 * Features Pro carnicería — deben mostrar datos reales (no mock).
 * Ver .cursor/rules/pro-features-connected.mdc
 */
export const BUTCHER_PRO_FEATURES = [
  {
    id: 'butcher_margin',
    label: 'Margen objetivo €/kg',
    description: 'Precio sugerido desde coste real de compras',
    dataSource: 'butcherTargetMarginPct + bt_catalog.costePorKg',
  },
  {
    id: 'butcher_waste',
    label: 'Merma y caducidad',
    description: 'kg y coste desde butcher_waste + bt_lote FEFO',
    dataSource: '/api/butcher/waste + butcher-ops bt_lote',
  },
  {
    id: 'butcher_caja',
    label: 'Caja del día',
    description: 'Desglose efectivo/tarjeta/bizum desde ventas cobradas',
    dataSource: 'byMethodToday en /api/butcher-sales/:userId/stats',
  },
  {
    id: 'butcher_crm',
    label: 'Clientes mostrador',
    description: 'totalSpent / hábitos desde butcher_client + CRM sync',
    dataSource: 'butcherClientSync + butcher_client counters',
  },
] as const;
