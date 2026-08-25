/**
 * Datos de ejemplo para el dashboard vertical de carnicería
 * cuando la cuenta aún no tiene ventas/encargos reales.
 * Solo UI de preview — no se persisten ni sustituyen APIs Pro.
 */

export type ButcherDashHourly = { hora: string; importe: number; tickets: number };

export type ButcherDashOrder = {
  id: string;
  cliente: string;
  productos: string;
  hora: string;
  estado: 'pendiente' | 'preparando' | 'listo';
  total: number;
};

export type ButcherDashAlert = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  route: string;
};

export type ButcherDashTopCut = {
  nombre: string;
  kg: number;
  importe: number;
};

export type ButcherDashDemo = {
  revenue: number;
  tickets: number;
  pendingOrders: number;
  ticketMedio: number;
  mermaKg: number;
  mermaPct: number;
  clientsToday: number;
  stockCritico: number;
  lotesCaducan: number;
  hourly: ButcherDashHourly[];
  orders: ButcherDashOrder[];
  alerts: ButcherDashAlert[];
  topCuts: ButcherDashTopCut[];
  recentSales: { ticket: string; hora: string; total: number; productos: string }[];
};

export const BUTCHER_DASHBOARD_DEMO: ButcherDashDemo = {
  revenue: 1847.6,
  tickets: 47,
  pendingOrders: 6,
  ticketMedio: 39.31,
  mermaKg: 2.4,
  mermaPct: 1.8,
  clientsToday: 38,
  stockCritico: 3,
  lotesCaducan: 2,
  hourly: [
    { hora: '09:00', importe: 86, tickets: 3 },
    { hora: '10:00', importe: 142, tickets: 5 },
    { hora: '11:00', importe: 218, tickets: 7 },
    { hora: '12:00', importe: 312, tickets: 9 },
    { hora: '13:00', importe: 389, tickets: 11 },
    { hora: '14:00', importe: 267, tickets: 6 },
    { hora: '15:00', importe: 154, tickets: 3 },
    { hora: '16:00', importe: 98, tickets: 2 },
    { hora: '17:00', importe: 181, tickets: 1 },
  ],
  orders: [
    {
      id: 'ENC-2401',
      cliente: 'Laura Martín',
      productos: 'Chuletón 1,2 kg · Costillas cerdo',
      hora: '11:30',
      estado: 'preparando',
      total: 48.9,
    },
    {
      id: 'ENC-2402',
      cliente: 'Restaurante Can Toni',
      productos: 'Solomillo 3 kg · Entrecot 2 kg',
      hora: '12:00',
      estado: 'pendiente',
      total: 186.4,
    },
    {
      id: 'ENC-2403',
      cliente: 'Pablo Ruiz',
      productos: 'Pollo entero · Embutido surtido',
      hora: '12:45',
      estado: 'listo',
      total: 22.15,
    },
    {
      id: 'ENC-2404',
      cliente: 'Ana Gómez',
      productos: 'Picada ternera 1 kg · Hamburguesas ×8',
      hora: '13:15',
      estado: 'preparando',
      total: 31.8,
    },
    {
      id: 'ENC-2405',
      cliente: 'Hotel Marina',
      productos: 'Cordero pierna · Vacuno asado 5 kg',
      hora: '16:00',
      estado: 'pendiente',
      total: 142.0,
    },
    {
      id: 'ENC-2406',
      cliente: 'Mercè Soler',
      productos: 'Filetes pechuga · Jamón loncheado',
      hora: '17:30',
      estado: 'pendiente',
      total: 19.6,
    },
  ],
  alerts: [
    {
      id: 'a1',
      severity: 'error',
      message: 'Lote LOTE-VAC-118 caduca mañana · Chuletón Galicia (4,2 kg)',
      route: '/saas/butcher-traceability',
    },
    {
      id: 'a2',
      severity: 'warning',
      message: 'Stock crítico: Solomillo negro · 1,8 kg (mín. 4 kg)',
      route: '/saas/butcher-products',
    },
    {
      id: 'a3',
      severity: 'warning',
      message: 'Merma del día por encima del umbral (2,4 kg / 1,8 %)',
      route: '/saas/butcher-waste',
    },
    {
      id: 'a4',
      severity: 'info',
      message: 'Encargo Hotel Marina sin preparar · recogida 16:00',
      route: '/saas/butcher-orders',
    },
  ],
  topCuts: [
    { nombre: 'Chuletón Galicia', kg: 18.4, importe: 412.6 },
    { nombre: 'Picada ternera', kg: 22.1, importe: 286.3 },
    { nombre: 'Costillas cerdo', kg: 14.6, importe: 198.4 },
    { nombre: 'Pollo campero', kg: 31.2, importe: 174.9 },
    { nombre: 'Jamón loncheado', kg: 6.8, importe: 156.2 },
  ],
  recentSales: [
    { ticket: 'T-1847', hora: '13:42', total: 28.4, productos: 'Chuletón 0,65 kg' },
    { ticket: 'T-1846', hora: '13:38', total: 12.9, productos: 'Picada 0,8 kg' },
    { ticket: 'T-1845', hora: '13:31', total: 41.2, productos: 'Costillas + embutido' },
    { ticket: 'T-1844', hora: '13:22', total: 9.5, productos: 'Pollo muslos 1,1 kg' },
    { ticket: 'T-1843', hora: '13:15', total: 63.8, productos: 'Entrecot 1,4 kg' },
  ],
};
