/**
 * Catálogo de Informes Delivery — solo metadatos (sin fetch).
 * Los informes `live` reutilizan paneles existentes; `skeleton` = UI pendiente de definir.
 * Listas alineadas a las capturas del hub Informes (Finanzas, Clientes…).
 */

export type DeliveryInformeCategoryId =
  | 'finanzas'
  | 'negocio'
  | 'clientes'
  | 'stock'
  | 'equipo'
  | 'facturacion'
  | 'ocr';

export type DeliveryInformeNivel = 'base' | 'normal' | 'pro';

export type DeliveryInformeKind = 'live' | 'skeleton';

/** ids live = paneles actuales de DeliveryReports */
export type DeliveryInformeLiveId =
  | 'resumen'
  | 'canales'
  | 'rendimiento'
  | 'incidencias'
  | 'productos'
  | 'tiendas';

export type DeliveryInformeId =
  | DeliveryInformeLiveId
  | 'negocio-ticket-medio'
  | 'negocio-volumen'
  | 'negocio-embudo'
  | 'negocio-ciclo'
  | 'negocio-conversiones'
  | 'negocio-prevision'
  | 'clientes-activos'
  | 'clientes-nuevos-vs-recurrentes'
  | 'clientes-ingresos'
  | 'clientes-frecuencia-compra'
  | 'clientes-en-riesgo'
  | 'clientes-ltv'
  | 'clientes-productos-top'
  | 'clientes-proporcion-ticket'
  | 'clientes-evolucion-ticket'
  | 'clientes-frecuencia'
  | 'clientes-inactivos'
  | 'clientes-concentracion'
  | 'finanzas-ingresos'
  | 'finanzas-gastos'
  | 'finanzas-margen'
  | 'finanzas-flujo-caja'
  | 'finanzas-cuenta-resultados'
  | 'finanzas-resultado-ytd'
  | 'finanzas-presupuesto-vs-real'
  | 'finanzas-rentabilidad-centro'
  | 'finanzas-ebitda'
  | 'finanzas-caja'
  | 'equipo-fichajes'
  | 'equipo-horas'
  | 'equipo-asistencia'
  | 'equipo-consumos'
  | 'equipo-productividad'
  | 'equipo-rendimiento-depto'
  | 'equipo-coste-hora'
  | 'equipo-impacto-resultados'
  | 'equipo-ventas-trabajador'
  | 'facturacion-emitida'
  | 'facturacion-recibida'
  | 'facturacion-pendientes'
  | 'facturacion-dias-cobro'
  | 'facturacion-conciliacion'
  | 'facturacion-desviaciones'
  | 'facturacion-exportacion'
  | 'stock-estado'
  | 'stock-alertas'
  | 'stock-rotacion'
  | 'stock-compras-proveedor'
  | 'stock-dependencia-proveedores'
  | 'stock-punto-pedido'
  | 'stock-escandallo'
  | 'stock-reductores';

export type DeliveryInformeEntry = {
  id: DeliveryInformeId;
  category: DeliveryInformeCategoryId;
  title: string;
  description: string;
  nivel?: DeliveryInformeNivel;
  kind: DeliveryInformeKind;
  /** Oculto en lista/contador del hub (sigue abrible por id / live). */
  hubHidden?: boolean;
};

export type DeliveryInformeCategory = {
  id: DeliveryInformeCategoryId;
  label: string;
};

export const DELIVERY_INFORMES_CATEGORIES: DeliveryInformeCategory[] = [
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'stock', label: 'Stock y proveedores' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'facturacion', label: 'Facturación y contabilidad' },
  { id: 'ocr', label: 'OCR y digitalización' },
];

export const DELIVERY_INFORMES_CATALOG: DeliveryInformeEntry[] = [
  // ── Finanzas (esqueleto — captura hub) ───────────────────────────────────
  {
    id: 'finanzas-ingresos',
    category: 'finanzas',
    title: 'Ingresos',
    description: 'Ingresos del periodo por canal y PDV.',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-gastos',
    category: 'finanzas',
    title: 'Gastos',
    description: 'Gastos operativos y categorías de coste.',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-margen',
    category: 'finanzas',
    title: 'Margen',
    description: 'Margen bruto / neto del periodo.',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-flujo-caja',
    category: 'finanzas',
    title: 'Flujo de caja',
    description: 'Entradas, salidas y saldo de caja.',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-cuenta-resultados',
    category: 'finanzas',
    title: 'Cuenta de resultados',
    description: 'P&L del periodo.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-resultado-ytd',
    category: 'finanzas',
    title: 'Resultado acumulado (YTD)',
    description: 'Resultado acumulado del año en curso.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-presupuesto-vs-real',
    category: 'finanzas',
    title: 'Presupuesto vs real',
    description: 'Desviación presupuestaria.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-rentabilidad-centro',
    category: 'finanzas',
    title: 'Rentabilidad por centro',
    description: 'Rentabilidad por tienda / PDV.',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-ebitda',
    category: 'finanzas',
    title: 'EBITDA',
    description: 'EBITDA y evolución.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'finanzas-caja',
    category: 'finanzas',
    title: 'Caja y diferencias',
    description: 'Arqueos TPV / reparto y conciliación.',
    nivel: 'normal',
    kind: 'skeleton',
  },

  // ── Negocio (captura hub — 7) ────────────────────────────────────────────
  {
    id: 'resumen',
    category: 'negocio',
    title: 'Actividad del negocio',
    description: 'Vista general de actividad del periodo.',
    kind: 'live',
  },
  {
    id: 'negocio-ticket-medio',
    category: 'negocio',
    title: 'Ticket medio',
    description: 'Evolución y desglose del ticket medio.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'negocio-volumen',
    category: 'negocio',
    title: 'Volumen de operaciones',
    description: 'Cantidad de pedidos / operaciones del periodo.',
    kind: 'skeleton',
  },
  {
    id: 'negocio-embudo',
    category: 'negocio',
    title: 'Embudo comercial',
    description: 'Etapas del embudo y conversión entre fases.',
    kind: 'skeleton',
  },
  {
    id: 'negocio-ciclo',
    category: 'negocio',
    title: 'Ciclo de venta',
    description: 'Duración del ciclo desde contacto hasta pedido.',
    kind: 'skeleton',
  },
  {
    id: 'negocio-conversiones',
    category: 'negocio',
    title: 'Conversiones',
    description: 'Tasas de conversión por canal y periodo.',
    kind: 'skeleton',
  },
  {
    id: 'negocio-prevision',
    category: 'negocio',
    title: 'Previsión de ventas',
    description: 'Proyección de ventas del periodo.',
    nivel: 'pro',
    kind: 'skeleton',
  },

  // Live delivery (accesibles; no cuentan en el hub visual de la captura)
  {
    id: 'canales',
    category: 'negocio',
    title: 'Canales de venta',
    description: 'Ingresos, comisiones y margen por canal.',
    nivel: 'normal',
    kind: 'live',
    hubHidden: true,
  },
  {
    id: 'rendimiento',
    category: 'negocio',
    title: 'Rendimiento operativo',
    description: 'Tiempos de cocina, montaje y reparto.',
    kind: 'live',
    hubHidden: true,
  },
  {
    id: 'incidencias',
    category: 'negocio',
    title: 'Incidencias',
    description: 'Cancelados, retrasos e importe afectado.',
    kind: 'live',
    hubHidden: true,
  },
  {
    id: 'productos',
    category: 'negocio',
    title: 'Productos top',
    description: 'Ranking de productos por ingresos del periodo.',
    kind: 'live',
    hubHidden: true,
  },
  {
    id: 'tiendas',
    category: 'negocio',
    title: 'Rendimiento por tienda',
    description: 'Pedidos, ingresos y ticket por PDV.',
    nivel: 'normal',
    kind: 'live',
    hubHidden: true,
  },

  // ── Clientes (captura hub — 6) ───────────────────────────────────────────
  {
    id: 'clientes-activos',
    category: 'clientes',
    title: 'Clientes activos',
    description: 'Clientes con pedidos recientes en el periodo.',
    kind: 'skeleton',
  },
  {
    id: 'clientes-nuevos-vs-recurrentes',
    category: 'clientes',
    title: 'Clientes nuevos vs recurrentes',
    description: 'Comparativa de adquisición y repetición.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'clientes-ingresos',
    category: 'clientes',
    title: 'Ingresos por cliente',
    description: 'Facturación aportada por cada cliente.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'clientes-frecuencia-compra',
    category: 'clientes',
    title: 'Frecuencia de compra',
    description: 'Cada cuánto pide cada cliente.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'clientes-en-riesgo',
    category: 'clientes',
    title: 'Clientes en riesgo',
    description: 'Clientes que dejan de pedir o bajan el ticket.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'clientes-ltv',
    category: 'clientes',
    title: 'Valor del cliente (LTV)',
    description: 'Valor de vida del cliente a lo largo del tiempo.',
    nivel: 'pro',
    kind: 'skeleton',
  },

  // Pedidos delivery (los que pediste; fuera del contador de la captura)
  {
    id: 'clientes-productos-top',
    category: 'clientes',
    title: 'Productos más pedidos',
    description: 'Qué productos se venden más a cada cliente y en el conjunto.',
    kind: 'skeleton',
    hubHidden: true,
  },
  {
    id: 'clientes-proporcion-ticket',
    category: 'clientes',
    title: 'Proporción de ticket medio',
    description: 'Peso del ticket de cada cliente respecto al ticket medio del negocio.',
    nivel: 'normal',
    kind: 'skeleton',
    hubHidden: true,
  },
  {
    id: 'clientes-evolucion-ticket',
    category: 'clientes',
    title: 'Evolución de ticket (vs sí mismo)',
    description: 'Comparativa pedido a pedido: si el ticket sube o baja en el tiempo.',
    nivel: 'normal',
    kind: 'skeleton',
    hubHidden: true,
  },
  {
    id: 'clientes-frecuencia',
    category: 'clientes',
    title: 'Frecuencia de pedido (detalle)',
    description: 'Cada cuántos días pide cada cliente y si se está enfriando.',
    kind: 'skeleton',
    hubHidden: true,
  },
  {
    id: 'clientes-inactivos',
    category: 'clientes',
    title: 'Clientes inactivos',
    description: 'Quién dejó de pedir y desde cuándo (reactivación).',
    nivel: 'pro',
    kind: 'skeleton',
    hubHidden: true,
  },
  {
    id: 'clientes-concentracion',
    category: 'clientes',
    title: 'Concentración de ventas',
    description: 'Qué % de la facturación concentran los top clientes.',
    nivel: 'pro',
    kind: 'skeleton',
    hubHidden: true,
  },

  // ── Stock y proveedores (captura hub — 8) ────────────────────────────────
  {
    id: 'stock-estado',
    category: 'stock',
    title: 'Estado de stock',
    description: 'Visión actual del inventario.',
    kind: 'skeleton',
  },
  {
    id: 'stock-alertas',
    category: 'stock',
    title: 'Alertas de rotura / sobrestock',
    description: 'Avisos de rotura de stock y exceso.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'stock-rotacion',
    category: 'stock',
    title: 'Rotación de stock',
    description: 'Velocidad de salida de productos.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'stock-compras-proveedor',
    category: 'stock',
    title: 'Compras por proveedor',
    description: 'Volumen e importe de compras por proveedor.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'stock-dependencia-proveedores',
    category: 'stock',
    title: 'Dependencia de proveedores',
    description: 'Concentración de compras en pocos proveedores.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'stock-punto-pedido',
    category: 'stock',
    title: 'Punto de pedido óptimo',
    description: 'Cuándo y cuánto reponer.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'stock-escandallo',
    category: 'stock',
    title: 'Escandallo',
    description: 'Coste de receta / escandallo vs ventas.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'stock-reductores',
    category: 'stock',
    title: 'Reductores',
    description: 'Mermas, reductores y pérdidas de stock.',
    nivel: 'pro',
    kind: 'skeleton',
  },

  // ── Equipo (captura hub — 8) ─────────────────────────────────────────────
  {
    id: 'equipo-fichajes',
    category: 'equipo',
    title: 'Fichajes',
    description: 'Entradas y salidas del equipo.',
    kind: 'skeleton',
  },
  {
    id: 'equipo-horas',
    category: 'equipo',
    title: 'Horas trabajadas',
    description: 'Horas acumuladas por trabajador y periodo.',
    kind: 'skeleton',
  },
  {
    id: 'equipo-asistencia',
    category: 'equipo',
    title: 'Asistencia y absentismo',
    description: 'Asistencia, ausencias y tasas de absentismo.',
    kind: 'skeleton',
  },
  {
    id: 'equipo-consumos',
    category: 'equipo',
    title: 'Consumos internos',
    description: 'Consumos internos atribuidos al equipo.',
    kind: 'skeleton',
  },
  {
    id: 'equipo-productividad',
    category: 'equipo',
    title: 'Productividad del equipo',
    description: 'Productividad agregada del equipo.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'equipo-rendimiento-depto',
    category: 'equipo',
    title: 'Rendimiento por departamento',
    description: 'Comparativa de rendimiento entre departamentos.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'equipo-coste-hora',
    category: 'equipo',
    title: 'Coste por hora / servicio',
    description: 'Coste laboral por hora o servicio.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'equipo-impacto-resultados',
    category: 'equipo',
    title: 'Impacto del equipo en resultados',
    description: 'Cómo el equipo afecta a ventas y margen.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'equipo-ventas-trabajador',
    category: 'equipo',
    title: 'Ventas por trabajador',
    description: 'Pedidos y productividad atribuidos al equipo.',
    kind: 'skeleton',
    hubHidden: true,
  },

  // ── Facturación y contabilidad (captura hub — 7) ─────────────────────────
  {
    id: 'facturacion-emitida',
    category: 'facturacion',
    title: 'Facturación emitida',
    description: 'Facturas emitidas en el periodo.',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-recibida',
    category: 'facturacion',
    title: 'Facturación recibida',
    description: 'Facturas recibidas de proveedores.',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-pendientes',
    category: 'facturacion',
    title: 'Facturas pendientes',
    description: 'Pendientes de cobro o pago.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-dias-cobro',
    category: 'facturacion',
    title: 'Días medios de cobro',
    description: 'Plazo medio hasta el cobro.',
    nivel: 'normal',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-conciliacion',
    category: 'facturacion',
    title: 'Conciliación bancaria',
    description: 'Conciliación de movimientos bancarios.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-desviaciones',
    category: 'facturacion',
    title: 'Desviaciones contables',
    description: 'Desviaciones y discrepancias contables.',
    nivel: 'pro',
    kind: 'skeleton',
  },
  {
    id: 'facturacion-exportacion',
    category: 'facturacion',
    title: 'Exportación contable avanzada',
    description: 'Exportación contable para gestorías / ERP.',
    nivel: 'pro',
    kind: 'skeleton',
  },
];

export function countInformesInCategory(categoryId: DeliveryInformeCategoryId): number {
  return DELIVERY_INFORMES_CATALOG.filter((e) => e.category === categoryId && !e.hubHidden).length;
}

export function getInformesByCategory(categoryId: DeliveryInformeCategoryId): DeliveryInformeEntry[] {
  return DELIVERY_INFORMES_CATALOG.filter((e) => e.category === categoryId && !e.hubHidden);
}

export function getDeliveryInformeEntry(id: DeliveryInformeId): DeliveryInformeEntry | undefined {
  return DELIVERY_INFORMES_CATALOG.find((e) => e.id === id);
}

export function isLiveInformeId(id: DeliveryInformeId): id is DeliveryInformeLiveId {
  return ['resumen', 'canales', 'rendimiento', 'incidencias', 'productos', 'tiendas'].includes(id);
}
