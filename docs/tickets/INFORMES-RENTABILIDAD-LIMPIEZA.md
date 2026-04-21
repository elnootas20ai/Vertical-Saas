# INFORMES Y RENTABILIDAD (Limpieza) — Diseño de Tickets

**Página:** `/saas/vertical/limpieza/informes`  
**Objetivo:** Medir el estado real del negocio de limpieza y la rentabilidad por cliente y trabajador.  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Ya implementado (backend + frontend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Página de informes general con 13 pestañas (compraventa) | Completo | `src/app/pages/saas/Reports.tsx` — ruta `/saas/reports` |
| KPICard, ChartCard, Recharts (BarChart, LineChart, PieChart…) | Completo | `Reports.tsx` — sub-componentes reutilizables |
| Exportación Excel (xlsx), PDF (jsPDF), CSV por pestaña | Completo | `Reports.tsx` — `handleExportExcel`, `handleExportPdf`, `handleExportCsv` |
| Filtro de periodo (7d, 30d, 90d, 6m, 1y, custom) | Completo | `Reports.tsx` — `PRESETS`, `applyPreset` |
| Filtro por centro de trabajo / sede | Completo | `Reports.tsx` — `filterWorkCenter`, `useWorkCenters` |
| Motor de alertas con dedup + SSE + Web Push | Completo | `services/alertEngine.js` — 9 reglas activas |
| CRUD de servicios de limpieza | Completo | `cleaningController.js`, `cleaningRouter.js` — DB `*-cleaning` |
| Modelo `cleaning_service` con ejecución completa | Completo | `couchdb.js` — `execution.checkInAt/Out`, `realMinutes`, `plannedMinutes`, `deviationMinutes`, `incidents[]`, `materialsUsed[]`, `materialCost`, `laborCost`, `totalCost` |
| Endpoint de resumen de ejecuciones | Completo | `cleaningRouter.js` — `GET /api/cleaning/services/:userId/execution-summary` |
| Check-in/out con geolocalización | Completo | `cleaningRouter.js` — endpoints `check-in`, `check-out`, `pause`, `resume` |
| Validación de gerente | Completo | `cleaningRouter.js` — `PUT /:serviceId/validate` |
| Incidencias del servicio (CRUD) | Completo | `cleaningRouter.js` — endpoints de incidents |
| Rutas de limpieza (CRUD + generar + reordenar) | Completo | `cleaningRouter.js` — endpoints de routes |
| Fichajes con stats, performance, absentismo, horas extra | Completo | `clockinsRouter.js` — `stats`, `performance`, `absenteeism`, `overtime`, `payroll-summary` |
| Catálogo de productos con stock, pedidos, alertas | Completo | `catalogController.js`, `purchaseOrderController.js` — `catalog_item` con `subtype: 'cleaning_material'` (planificado en MAT-01) |
| Facturación de clientes (CRUD) | Completo | `clientInvoicesApi.ts`, `clientsController.js` |
| Movimientos financieros (cobros/pagos) | Completo | `financeController.js` — `listFinanceMovements` |
| Roles y permisos por módulo | Completo | `couchdb.js` — `ROLE_DEFINITIONS`, `TEAM_PERMISSION_KEYS` |
| Datos de cliente CRM | Completo | `clientsController.js` — entidades `client` con contacto y dirección |
| Sistema de contratos de servicio (planificado en SVC-01) | Diseñado | `SERVICIOS-CONTRATOS-LIMPIEZA.md` — `service_contract` con frecuencia, precio, trabajador, zona |
| Entidad Trabajador de limpieza (planificada en CW-01) | Diseñada | `TRABAJADORES-LIMPIEZA.md` — `cleaning_worker` con `hourlyCost`, `zones`, `availability`, `documents` |
| Productividad de limpieza (planificada en CW-05) | Diseñada | `TRABAJADORES-LIMPIEZA.md` — endpoint `/api/cleaning/workers/:userId/productivity` |
| Materiales y consumos (planificado en MAT-01..16) | Diseñado | `MATERIALES-CONSUMOS-TICKETS.md` — entregas, devoluciones, consumo por servicio/cliente |
| Alertas de trabajadores de limpieza (planificada en CW-07) | Diseñada | `TRABAJADORES-LIMPIEZA.md` — 5 tipos de alerta |
| Alertas de materiales de limpieza (planificada en MAT-10) | Diseñada | `MATERIALES-CONSUMOS-TICKETS.md` — 4 tipos de alerta |
| Informes delivery con patrón completo (referencia UX) | Completo | `src-delivery/app/components/informes/` — `PlantillaInforme`, `KPICardInforme`, `InformesNivelAnalisis`, `InformesFilters`, `ChartControls` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe página de informes para la vertical de limpieza** — `/saas/vertical/limpieza/informes` no existe, ni como ruta ni como componente | No hay analítica del negocio de limpieza |
| 2 | **No hay endpoint de rentabilidad por cliente** — No existe agregación que cruce ingresos (precio servicio) con costes (horas × coste/hora trabajador + materiales) por cliente | El gerente no puede saber qué clientes son rentables |
| 3 | **No hay endpoint de rentabilidad por trabajador** — No existe agregación de ingresos generados vs coste laboral por trabajador | No se puede evaluar el rendimiento económico real de cada persona |
| 4 | **No hay resumen de absentismo específico de limpieza** — `clockinsController.getAbsenteeism` opera sobre fichajes genéricos; no cruza con servicios asignados sin check-in | No se detectan ausencias a servicios concretos de limpieza |
| 5 | **No hay resumen de incidencias agregado** — Las incidencias se listan por servicio pero no hay endpoint que las agregue por tipo, severidad, trabajador o cliente | No se pueden detectar patrones de incidencias |
| 6 | **No hay informe de coste de materiales** — `cleaning_service.materialCost` existe en modelo pero no hay agregación temporal ni por cliente/trabajador | No se puede controlar la inversión en materiales |
| 7 | **No hay informe de facturación mensual de limpieza** — No existe agregación que totalice facturación por mes para contratos/servicios de limpieza | No se puede medir la evolución de ingresos del negocio |
| 8 | **No hay comparativas por zona** — Los contratos tienen campo `zone` pero no hay agregación que compare rendimiento entre zonas | No se puede planificar expansión ni detectar zonas problemáticas |
| 9 | **No hay comparativas por tipo de servicio** — No existe agregación por `cleaningType` (oficinas, comunidad, cristales…) | No se puede saber qué tipo de servicio es más rentable |
| 10 | **No hay actualización en tiempo real** — Los datos se cargarían al montar pero no se refrescan vía SSE | Informes quedan desactualizados durante la sesión |
| 11 | **No hay alertas de rentabilidad** — El motor de alertas no evalúa cliente poco rentable, caída de productividad ni costes materiales elevados | No se detectan deterioros en el negocio automáticamente |
| 12 | **No hay control de permisos en informes de limpieza** — No existe lógica que restrinja pestañas/datos según rol | Un trabajador podría ver rentabilidad global |
| 13 | **No hay navegación cruzada desde informes** — Sin enlaces directos a fichas de cliente, trabajador, servicio o material | El gerente ve datos pero no puede actuar directamente |

### Mapa de dependencias

```
IRL-01 (Endpoints de analítica backend)
  ├── IRL-02 (Página principal con tabs y KPIs)
  ├── IRL-03 (Informe Clientes activos y Rentabilidad por cliente)
  ├── IRL-04 (Informe Servicios y Horas)
  ├── IRL-05 (Informe Rentabilidad por trabajador)
  ├── IRL-06 (Informe Absentismo e Incidencias)
  ├── IRL-07 (Informe Materiales y Costes)
  ├── IRL-08 (Informe Facturación mensual)
  └── IRL-09 (Informe Comparativas por zona y tipo)

IRL-10 (Permisos y visibilidad) — transversal
  ├── IRL-03..09 (restricción de datos por rol)
  └── IRL-12 (Panel de alertas — restricción por rol)

IRL-11 (Filtros avanzados) — transversal
  └── IRL-03..09 (todos los informes los usan)

IRL-12 (Alertas de rentabilidad) — backend + UI
  └── IRL-01 (consume datos de analítica)

IRL-13 (Actualización en tiempo real) — independiente
IRL-14 (Navegación cruzada) — después de IRL-03..09
```

### Dependencias con otros módulos de tickets

| Módulo | Tickets relacionados | Impacto |
|---|---|---|
| **Servicios y Contratos** (SERVICIOS-CONTRATOS-LIMPIEZA.md) | SVC-01 (contrato), SVC-04 (generación), SVC-06 (facturación) | Informes de facturación y servicios dependen de contratos; si aún no existen, se trabaja con `cleaning_service` directamente |
| **Trabajadores** (TRABAJADORES-LIMPIEZA.md) | CW-01 (entidad worker), CW-05 (productividad), CW-07 (alertas) | Rentabilidad por trabajador cruza datos de CW-05; si aún no existe, se calcula desde `cleaning_service.assignedTo` |
| **Materiales** (MATERIALES-CONSUMOS-TICKETS.md) | MAT-04 (consumo por servicio), MAT-05 (consumo por cliente), MAT-09 (compra → gasto) | Informe de materiales depende de `cleaning_service.materialsUsed` y entregas |
| **Fichaje y Ejecución** (FICHAJE-EJECUCION-LIMPIEZA.md) | FE-01..03 (modelo execution), FE-09 (alertas ejecución), FE-11 (productividad) | Horas reales, desviaciones y absentismo vienen del modelo `execution` |
| **Finanzas** (FINANZAS.md) | FIN-04/FIN-05 (factura → movimiento) | Facturación y cobros se cruzan con movimientos financieros |
| **Fichajes Core** (clockinsController) | `getAbsenteeism`, `getOvertime`, `getStats` | Horas fichadas vs horas de servicio |

---

## TICKETS

---

### TICKET IRL-01: Endpoints de analítica para informes de limpieza

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna (funciona con datos existentes de `cleaning_service`; se enriquece cuando CW-01, SVC-01, MAT-01 existan)  
**Archivo principal:** `controllers/cleaningController.js`, `routers/cleaningRouter.js`

#### Contexto

No existe ningún endpoint de agregación analítica para la vertical de limpieza. Los informes necesitan datos consolidados que crucen servicios, trabajadores, clientes, materiales, fichajes e incidencias. Este ticket crea el backend que alimentará todas las pestañas de la página de informes.

#### Nuevos endpoints

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/reports/:userId/overview` | GET | KPIs globales del negocio (clientes, servicios, horas, facturación, costes, rentabilidad) |
| `/api/cleaning/reports/:userId/profitability/clients` | GET | Rentabilidad por cliente: ingresos, costes laborales, costes materiales, margen |
| `/api/cleaning/reports/:userId/profitability/workers` | GET | Rentabilidad por trabajador: ingresos generados, coste, productividad, horas, absentismo |
| `/api/cleaning/reports/:userId/services-summary` | GET | Servicios completados, pendientes, cancelados, horas reales vs previstas, por periodo |
| `/api/cleaning/reports/:userId/absenteeism` | GET | Absentismo: servicios sin check-in, retrasos, por trabajador y fecha |
| `/api/cleaning/reports/:userId/incidents-summary` | GET | Incidencias agregadas por tipo, severidad, trabajador, cliente, resolución |
| `/api/cleaning/reports/:userId/materials-cost` | GET | Coste de materiales por periodo, cliente, trabajador, tipo de material |
| `/api/cleaning/reports/:userId/billing` | GET | Facturación mensual: emitida, cobrada, pendiente, por cliente |
| `/api/cleaning/reports/:userId/comparatives` | GET | Comparativas por zona y por tipo de servicio: volumen, rentabilidad, incidencias |

Todos los endpoints aceptan query params: `?from=YYYY-MM-DD&to=YYYY-MM-DD&clientId=X&workerId=Y&zone=Z&cleaningType=T`

#### Lógica de cada endpoint

**1. `overview`** — Resumen ejecutivo:

```typescript
interface CleaningOverview {
  period: { from: string; to: string };
  clients: {
    activeCount: number;           // Clientes con servicios completados en el periodo
    newCount: number;              // Clientes con primer servicio en el periodo
    lostCount: number;             // Clientes con contrato cancelado/expirado en el periodo
    totalContracts: number;        // Contratos activos
  };
  services: {
    total: number;
    completed: number;
    cancelled: number;
    pending: number;
    inProgress: number;
    completionRate: number;        // completed / (completed + cancelled) × 100
  };
  hours: {
    planned: number;               // Suma plannedMinutes / 60
    real: number;                  // Suma realMinutes / 60
    deviation: number;             // real - planned
    deviationPercent: number;
  };
  financial: {
    revenue: number;               // Suma de precios de servicios completados
    laborCost: number;             // Suma (realMinutes/60 × worker.hourlyCost)
    materialCost: number;          // Suma cleaning_service.materialCost
    totalCost: number;             // laborCost + materialCost
    grossMargin: number;           // revenue - totalCost
    grossMarginPercent: number;    // grossMargin / revenue × 100
    billedAmount: number;          // Total facturado (facturas emitidas)
    collectedAmount: number;       // Total cobrado
    pendingAmount: number;         // billedAmount - collectedAmount
  };
  operational: {
    avgServicesPerDay: number;
    avgRevenuePerService: number;
    avgRevenuePerHour: number;
    avgCostPerService: number;
    incidentCount: number;
    incidentRate: number;          // incidencias / servicios completados × 100
    absenteeismCount: number;      // Servicios asignados sin check-in con fecha pasada
    absenteeismRate: number;
  };
}
```

**2. `profitability/clients`** — Rentabilidad por cliente:

```typescript
interface ClientProfitability {
  clientName: string;
  clientId?: string;
  clientType?: string;
  zone?: string;
  servicesCompleted: number;
  hoursReal: number;
  revenue: number;                 // Suma precios servicios completados
  laborCost: number;               // Suma (horas reales × coste/hora del worker asignado)
  materialCost: number;            // Suma materialCost de servicios
  totalCost: number;
  grossMargin: number;
  grossMarginPercent: number;
  avgRevenuePerService: number;
  avgCostPerService: number;
  incidentCount: number;
  avgQualityRating: number;
  avgClientRating: number;
  trend: 'up' | 'down' | 'stable'; // Comparativa con periodo anterior
}
```

Lógica: agrupar `cleaning_service` completados por `clientName` (o `clientId` si vinculado con CRM). Para el `laborCost`: si existe `cleaning_worker` con `hourlyCost`, usar ese dato; si no, usar un coste/hora por defecto configurable. Para `materialCost`: leer `cleaning_service.materialCost` (campo del modelo). Para `trend`: comparar con mismo periodo anterior.

**3. `profitability/workers`** — Rentabilidad por trabajador:

```typescript
interface WorkerProfitability {
  workerName: string;
  workerId?: string;
  servicesCompleted: number;
  hoursPlanned: number;
  hoursReal: number;
  deviation: number;               // hoursReal - hoursPlanned
  revenue: number;                 // Suma precios servicios del worker
  laborCost: number;               // hoursReal × hourlyCost
  materialCost: number;
  profitability: number;           // revenue - laborCost - materialCost
  profitabilityPercent: number;
  revenuePerHour: number;
  servicesPerDay: number;
  lateArrivals: number;            // Check-in > hora programada + 15min
  absences: number;                // Servicios asignados sin check-in
  incidentCount: number;
  avgQualityRating: number;
  avgClientRating: number;
  efficiency: number;              // hoursPlanned / hoursReal × 100 (>100% = rápido)
  topClients: string[];            // Top 3 clientes por nº servicios
}
```

**4. `absenteeism`** — Detalle de absentismo:

```typescript
interface AbsenteeismReport {
  totalAssigned: number;
  totalAbsences: number;
  totalLateArrivals: number;
  absenteeismRate: number;
  byWorker: {
    workerName: string;
    assigned: number;
    absences: number;
    lateArrivals: number;
    avgDelayMinutes: number;
    rate: number;
  }[];
  byDate: {
    date: string;
    absences: number;
    lateArrivals: number;
  }[];
  details: {
    date: string;
    workerName: string;
    clientName: string;
    address: string;
    scheduledTime: string;
    checkInAt: string | null;
    delayMinutes: number | null;
    type: 'absence' | 'late';
  }[];
}
```

**5. `incidents-summary`** — Incidencias agregadas:

```typescript
interface IncidentsSummary {
  totalIncidents: number;
  resolved: number;
  unresolved: number;
  avgResolutionMinutes: number;
  byType: { type: string; count: number; avgResolutionMinutes: number }[];
  bySeverity: { severity: string; count: number }[];
  byWorker: { workerName: string; count: number; resolvedCount: number }[];
  byClient: { clientName: string; count: number }[];
  trend: { date: string; count: number }[];
}
```

**6. `materials-cost`** — Coste de materiales:

```typescript
interface MaterialsCostReport {
  totalCost: number;
  totalDeliveries: number;
  avgCostPerService: number;
  byClient: { clientName: string; cost: number; servicesCount: number; avgPerService: number }[];
  byWorker: { workerName: string; cost: number; servicesCount: number }[];
  byMaterial: { materialName: string; quantity: number; cost: number; servicesCount: number }[];
  trend: { month: string; cost: number; servicesCount: number }[];
}
```

**7. `billing`** — Facturación mensual:

```typescript
interface BillingReport {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  collectionRate: number;
  byMonth: { month: string; billed: number; collected: number; pending: number }[];
  byClient: { clientName: string; billed: number; collected: number; pending: number; servicesCount: number }[];
}
```

Fuentes: si existen `client_invoice` con referencia a servicio de limpieza, agregar desde ahí. Si no, estimar desde `cleaning_service.price` de servicios completados.

**8. `comparatives`** — Comparativas:

```typescript
interface ComparativeReport {
  byZone: {
    zone: string;
    servicesCount: number;
    revenue: number;
    laborCost: number;
    materialCost: number;
    grossMargin: number;
    grossMarginPercent: number;
    avgQualityRating: number;
    incidentCount: number;
    workersCount: number;
    clientsCount: number;
  }[];
  byCleaningType: {
    cleaningType: string;
    servicesCount: number;
    revenue: number;
    laborCost: number;
    materialCost: number;
    grossMargin: number;
    grossMarginPercent: number;
    avgDurationMinutes: number;
    avgRevenuePerHour: number;
    incidentCount: number;
  }[];
}
```

#### Fallbacks cuando los módulos planificados aún no existen

- Si `cleaning_worker` (CW-01) no existe: `laborCost` se calcula con `hourlyCost` por defecto configurable (ej: 12€/h).
- Si `service_contract` (SVC-01) no existe: "clientes activos" se calcula por `clientName` únicos en servicios completados.
- Si `cleaning_service.materialCost` es 0 para todos: la sección de materiales muestra "Sin datos de consumo de materiales" con link a configurar.
- Si no hay facturas vinculadas: la sección de facturación estima desde precios de servicios completados.

#### Criterios de aceptación

- [ ] Los 8 endpoints devuelven datos correctos con filtros de fecha, cliente, trabajador y zona.
- [ ] Los cálculos de rentabilidad cruzan correctamente ingresos con costes laborales y de materiales.
- [ ] Los endpoints funcionan con datos existentes de `cleaning_service` (sin necesitar módulos planificados).
- [ ] Cada endpoint tiene manejo de errores y respuesta `{ ok: false, error }` si falla.
- [ ] Solo accesible para Admin/Gerente (validación de rol).
- [ ] Rendimiento aceptable: < 3 segundos para 1000 servicios.

---

### TICKET IRL-02: Página principal — Estructura, KPIs y navegación

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** IRL-01  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

No existe ninguna página de informes para la vertical de limpieza. Se necesita una página nueva en `/saas/vertical/limpieza/informes` con estructura de pestañas, KPIs en la cabecera, filtros globales y diseño atractivo. Es el hub central de analítica del negocio.

#### Estructura de la página

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📊 INFORMES Y RENTABILIDAD                                              │
│  Mide el estado real de tu negocio de limpieza                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Filtros: [Periodo ▾] [Cliente ▾] [Trabajador ▾] [Zona ▾] [Tipo ▾]     │
│  Filtros activos: [Cliente: Acme ✕] [Zona: Centro ✕]   [Limpiar todo]  │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚠ Panel de alertas (colapsable): 3 alertas de rentabilidad activas     │
├─────────────────────────────────────────────────────────────────────────┤
│  📊 KPIs principales (6 tarjetas)                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │ Clientes │ │Servicios │ │ Horas    │ │Facturac. │ │ Coste    │ │ Margen   │
│  │ activos  │ │completad.│ │trabajadas│ │ mensual  │ │  total   │ │  bruto   │
│  │   24     │ │   186    │ │  412h    │ │ 14.200 € │ │ 8.340 € │ │ 41.3%   │
│  │  ↑ +3    │ │  ↑ +12%  │ │  ↑ +5%  │ │  ↑ +8%  │ │  ↓ -2%  │ │  ↑ +1.2 │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
├─────────────────────────────────────────────────────────────────────────┤
│  Tabs:                                                                    │
│  [Resumen] [Clientes] [Servicios] [Trabajadores] [Absentismo]            │
│  [Incidencias] [Materiales] [Facturación] [Comparativas]                 │
│                                                                           │
│  (contenido de la pestaña activa)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Exportar: [Excel] [PDF] [CSV]   Última actualización: 14:32            │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Qué hacer

**1. Crear `src/app/pages/saas/CleaningReports.tsx`**

Layout con `<Layout>`, título y subtítulo descriptivo.

**2. Registrar ruta en `routes.tsx`:**

```typescript
{ path: 'vertical/limpieza/informes', Component: CleaningReports },
```

**3. Registrar en `Sidebar.tsx`:**

Añadir item `cleaning-reports` al grupo `cleaning` con icono `<BarChart3>`, label "Informes", ruta `/saas/vertical/limpieza/informes`. Posicionar al final del grupo, después de las páginas operativas.

**4. Definir las 9 pestañas:**

```typescript
type CleaningReportTab =
  | 'resumen'       // Vista ejecutiva con gráficos de evolución
  | 'clientes'      // Clientes activos + rentabilidad por cliente
  | 'servicios'     // Servicios completados + horas trabajadas
  | 'trabajadores'  // Rentabilidad por trabajador
  | 'absentismo'    // Absentismo + retrasos
  | 'incidencias'   // Incidencias por tipo/severidad/trabajador
  | 'materiales'    // Coste de materiales
  | 'facturacion'   // Facturación mensual
  | 'comparativas'; // Por zona y por tipo de servicio
```

**5. Barra de filtros globales (afectan a todas las pestañas):**

| Filtro | Tipo | Fuente de datos |
|---|---|---|
| Periodo | Select presets + custom date range | Presets: hoy, 7d, 30d, 90d, 6m, 1y, personalizado |
| Cliente | Autocomplete searchable | Nombres únicos de clientes en servicios |
| Trabajador | Autocomplete searchable | Nombres de trabajadores asignados |
| Zona | Select | Zonas únicas de servicios/contratos |
| Tipo de servicio | Select | Tipos de limpieza (general, oficinas, industrial…) |

Chips/badges de filtros activos debajo de la barra. Botón "Limpiar filtros" visible cuando algún filtro no es "all". Los filtros persisten al cambiar de pestaña. Las exportaciones exportan datos filtrados.

**6. KPIs en la cabecera (6 tarjetas):**

| KPI | Dato | Trend |
|---|---|---|
| Clientes activos | `overview.clients.activeCount` | vs periodo anterior |
| Servicios completados | `overview.services.completed` | vs periodo anterior |
| Horas trabajadas | `overview.hours.real` | vs periodo anterior |
| Facturación mensual | `overview.financial.revenue` | vs periodo anterior |
| Coste total | `overview.financial.totalCost` | vs periodo anterior (rojo si sube) |
| Margen bruto | `overview.financial.grossMarginPercent` | vs periodo anterior |

Cada tarjeta con icono, valor grande, trend con flecha y color (verde subida positiva, rojo subida negativa en costes).

**7. Estado vacío:**

Si no hay datos para el periodo seleccionado, mostrar ilustración con mensaje: "No hay datos de servicios para el periodo seleccionado. Empieza creando servicios de limpieza." con botón "Ir a Servicios".

**8. Carga de datos:**

- Hook `useCleaningReports(userId, filters)` que llama a los endpoints de IRL-01 según la pestaña activa.
- Carga lazy: solo se llaman los endpoints de la pestaña visible.
- Loading states con skeleton en KPIs, gráficos y tablas.

**9. Responsive:**

- Desktop: filtros en fila + tabs horizontales.
- Tablet: filtros con wrap + tabs scroll horizontal.
- Móvil: filtros en dropdown colapsable + tabs como selector dropdown. KPIs en grid de 2 columnas.

**10. Diseño visual:**

- Paleta: gradiente indigo → cyan (tonos de limpieza/agua) para headers y acentos.
- Tarjetas KPI: fondo blanco con borde sutil, número grande `text-3xl font-bold`, trend con `text-sm` y color.
- Tabs: style pill con active state en indigo.
- Gráficos: Recharts con paleta coherente (indigo, cyan, emerald, amber, rose).
- Dark mode compatible.

#### Criterios de aceptación

- [ ] Página accesible en `/saas/vertical/limpieza/informes`.
- [ ] Aparece en el sidebar dentro del grupo "Limpieza".
- [ ] 9 pestañas visibles y navegables.
- [ ] 6 KPIs calculados y con trend comparativo.
- [ ] 5 filtros funcionan y persisten al cambiar de pestaña.
- [ ] Chips de filtros activos + botón "Limpiar".
- [ ] Exportaciones (Excel, PDF, CSV) por pestaña activa.
- [ ] Responsive en los 3 breakpoints.
- [ ] Dark mode compatible.
- [ ] Loading states con skeletons.
- [ ] Estado vacío con mensaje y CTA.

---

### TICKET IRL-03: Pestaña "Clientes" — Clientes activos y rentabilidad por cliente

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** IRL-01, IRL-02, IRL-11  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita saber cuántos clientes están activos, cuáles generan más ingresos, cuáles consumen más recursos y cuáles son rentables o deficitarios. No existe ninguna vista que muestre esta información.

#### Contenido de la pestaña

**1. KPIs de clientes (4 tarjetas):**

| KPI | Dato |
|---|---|
| Clientes activos | Count de clientes con servicio completado en periodo |
| Ingreso medio por cliente | revenue / clientsCount |
| Cliente más rentable | Nombre + margen % |
| Cliente menos rentable | Nombre + margen % (alerta roja si negativo) |

**2. Gráfico principal — "Top 15 clientes por rentabilidad":**

`<BarChart layout="vertical">` con barras horizontales: eje Y = nombre cliente, eje X = euros. Dos barras superpuestas: ingresos (indigo) y coste total (rose). Barra de margen derivada (verde si positivo, roja si negativo). Tooltip con desglose: laborCost, materialCost, margen, %.

**3. Gráfico secundario — "Distribución de ingresos":**

`<PieChart>` o `<Treemap>`: porcentaje de ingresos por cliente. Permite identificar concentración (si un cliente representa >40% de ingresos → alerta de riesgo).

**4. Tabla detallada de rentabilidad por cliente:**

| Columna | Contenido |
|---|---|
| Cliente | Nombre (link a ficha CRM si `clientId` existe) |
| Tipo | Badge: Oficina, Comunidad, Tienda… |
| Zona | Badge con color |
| Servicios | Count completados |
| Horas reales | Total horas |
| Ingresos | € |
| Coste laboral | € |
| Coste material | € |
| Margen bruto | € + color (verde ≥ 20%, amber ≥ 10%, rojo < 10%) |
| % Margen | Porcentaje + barra visual |
| Rating calidad | Estrellas |
| Rating cliente | Estrellas |
| Incidencias | Count con badge |
| Tendencia | Flecha ↑↓→ comparando con periodo anterior |

Sortable por todas las columnas numéricas. Default: ordenado por margen bruto descendente. Filas con margen negativo resaltadas en rojo claro.

**5. Indicador de concentración de ingresos:**

"Los 3 principales clientes representan el X% de tus ingresos." Si X > 60%: warning amber "Alta concentración de ingresos. Diversifica tu cartera."

**6. Exportaciones:** Excel, PDF, CSV con los datos de la tabla.

#### Criterios de aceptación

- [ ] Los 4 KPIs se calculan correctamente.
- [ ] El gráfico de barras muestra ingresos vs costes por cliente.
- [ ] El PieChart muestra distribución de ingresos.
- [ ] La tabla es sortable y muestra colores por margen.
- [ ] El indicador de concentración advierte si hay riesgo.
- [ ] Los filtros globales (periodo, zona, tipo) filtran los datos.
- [ ] Click en nombre del cliente navega a su ficha (si existe clientId).
- [ ] Estado vacío si no hay datos.

---

### TICKET IRL-04: Pestaña "Servicios" — Servicios completados y horas trabajadas

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

La pestaña muestra métricas operativas de los servicios: cuántos se han completado, cuántas horas se han trabajado, desviación entre previsto y real, y evolución temporal.

#### Contenido de la pestaña

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Servicios completados | `services.completed` + rate de completitud |
| Horas reales | `hours.real` (formatear en Xh Xm) |
| Desviación media | `hours.deviationPercent` (verde si ≤5%, amber ≤15%, rojo >15%) |
| Servicios por día | `services.completed / diasPeriodo` |

**2. Gráfico de evolución temporal:**

`<ComposedChart>` con:
- Línea: servicios completados por día/semana/mes (según periodo).
- Barras: horas reales vs horas previstas por periodo.
- Toggle para cambiar agrupación (diario/semanal/mensual).

**3. Gráfico de desviación "Horas previstas vs reales":**

`<BarChart>` agrupado por trabajador o por cliente (toggle):
- Barra azul: horas previstas.
- Barra verde/roja: horas reales (verde si ≤ previsto, rojo si > previsto).

**4. Gráfico de distribución por estado:**

`<PieChart>` con: completados, cancelados, pendientes, en progreso.

**5. Tabla de servicios recientes:**

Últimos 50 servicios del periodo: fecha, hora, cliente, trabajador, tipo, horas prev., horas real., desviación, estado, rating. Click en fila → navega a detalle del servicio.

**6. Rate de completitud:**

Barra de progreso visual: "X de Y servicios completados este mes (Z%)" con color por nivel.

#### Criterios de aceptación

- [ ] KPIs calculados con datos reales de `execution.realMinutes` y `execution.plannedMinutes`.
- [ ] Gráfico de evolución con toggle diario/semanal/mensual.
- [ ] Gráfico de desviación por trabajador o cliente.
- [ ] Tabla de servicios recientes navegable.
- [ ] Filtros globales aplican correctamente.
- [ ] Exportaciones funcionan.

---

### TICKET IRL-05: Pestaña "Trabajadores" — Rentabilidad por trabajador

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** IRL-01, IRL-02, IRL-10  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita saber qué trabajadores son más productivos y rentables. Cruza ingresos generados por cada trabajador con su coste laboral y de materiales.

#### Contenido de la pestaña

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Trabajadores activos | Count distintos con servicios en periodo |
| Ingreso medio por trabajador | totalRevenue / workersCount |
| Trabajador más rentable | Nombre + margen |
| Eficiencia media | hoursPlanned / hoursReal × 100 |

**2. Ranking de trabajadores — Tabla principal:**

| Columna | Contenido |
|---|---|
| # | Posición (por rentabilidad) |
| Trabajador | Nombre + avatar |
| Servicios | Count completados |
| Horas previstas | Total |
| Horas reales | Total |
| Eficiencia | % (barra de progreso con color) |
| Ingresos | € |
| Coste laboral | € |
| Coste material | € |
| Rentabilidad | € (ingresos - costes) + color |
| % Rentabilidad | Porcentaje |
| Retrasos | Count (badge rojo si > 2) |
| Ausencias | Count (badge rojo si > 0) |
| Rating calidad | Estrellas |
| €/hora | Ingresos por hora real |

Default ordenado por rentabilidad descendente. Barras de progreso en columnas numéricas para comparación rápida.

**3. Gráfico "Ingresos vs Costes por trabajador":**

`<BarChart>` agrupado: barra indigo = ingresos, barra rose = coste laboral, barra amber = coste material.

**4. Gráfico "Evolución de productividad":**

`<LineChart>` con líneas por trabajador mostrando €/hora a lo largo del tiempo (si periodo > 7 días).

**5. Sección "Necesita atención":**

Cards de alerta para trabajadores con:
- Rentabilidad negativa.
- Eficiencia < 50%.
- Más de 2 retrasos.
- Ausencias injustificadas.

Cada card: nombre, métrica problemática, botón "Ver ficha" (link a `/saas/cleaning-workers`).

**6. Restricción para rol trabajador (IRL-10):**

Si el usuario es trabajador: solo ve sus propias métricas, sin ranking ni datos de otros.

#### Criterios de aceptación

- [ ] Ranking completo con todas las columnas.
- [ ] Gráficos de barras y de evolución funcionales.
- [ ] Sección "Necesita atención" detecta problemas.
- [ ] Filtros globales aplican (especialmente filtro de trabajador individual).
- [ ] Un trabajador solo ve sus datos (IRL-10).
- [ ] Click en nombre del trabajador navega a su ficha.
- [ ] Exportaciones incluyen la tabla completa.

---

### TICKET IRL-06: Pestaña "Absentismo" + Pestaña "Incidencias"

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita medir el absentismo (servicios asignados donde el trabajador no se presentó o llegó tarde) y las incidencias (eventos registrados durante la ejecución). Son dos pestañas con patrones similares.

#### Pestaña "Absentismo"

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Tasa de absentismo | `absenteeismRate` % |
| Ausencias totales | Count |
| Retrasos (>15min) | Count |
| Retraso medio | Minutos |

**2. Gráfico de evolución:**

`<BarChart>` por día/semana: barras rojas = ausencias, barras amber = retrasos. Línea de tendencia.

**3. Tabla por trabajador:**

Trabajador, servicios asignados, ausencias, retrasos, tasa absentismo, retraso medio. Ordenable. Filas con tasa > 10% resaltadas.

**4. Tabla de detalle:**

Cada evento: fecha, hora programada, trabajador, cliente, dirección, tipo (ausencia/retraso), minutos retraso, estado.

#### Pestaña "Incidencias"

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Total incidencias | Count |
| Tasa resolución | resolved / total × 100 % |
| Tiempo medio resolución | Minutos |
| Incidencias / 100 servicios | incidentRate |

**2. Gráfico por tipo:**

`<PieChart>` o `<BarChart horizontal>` con distribución por tipo de incidencia (material_missing, access_denied, damage_found…).

**3. Gráfico por severidad:**

`<BarChart>` apilado: critical, high, medium, low por periodo.

**4. Tabla por trabajador:**

Trabajador, incidencias, resueltas, sin resolver, tiempo medio resolución. Badge rojo si tiene incidencias sin resolver.

**5. Tabla por cliente:**

Cliente, incidencias, tipos más frecuentes. Permite detectar clientes problemáticos.

**6. Tabla de detalle:**

Cada incidencia: fecha, servicio, cliente, trabajador, tipo, severidad, descripción, estado resolución, tiempo resolución.

#### Criterios de aceptación

- [ ] Ambas pestañas calculan KPIs correctos.
- [ ] Gráficos de evolución y distribución funcionales.
- [ ] Tablas por trabajador y por cliente con ordenación.
- [ ] Tabla de detalle con todos los campos.
- [ ] Filtros globales aplican.
- [ ] Exportaciones por pestaña.

---

### TICKET IRL-07: Pestaña "Materiales" — Coste de materiales

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita controlar cuánto gasta en materiales de limpieza: evolución mensual, distribución por cliente y por trabajador, y qué materiales cuestan más. Los datos vienen de `cleaning_service.materialCost` y `cleaning_service.materialsUsed[]`.

#### Contenido de la pestaña

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Gasto total materiales | € en periodo |
| Gasto medio por servicio | € |
| Material más consumido | Nombre + cantidad |
| Cliente mayor gasto | Nombre + € |

**2. Gráfico "Evolución del gasto en materiales":**

`<AreaChart>` mensual con línea de tendencia. Color amber/naranja.

**3. Gráfico "Top 10 materiales por coste":**

`<BarChart horizontal>` con nombre del material y coste total.

**4. Gráfico "Gasto por cliente":**

`<BarChart>` top 10 clientes por gasto en materiales.

**5. Tabla detallada:**

Por material: nombre, unidades consumidas, coste total, % sobre total, servicios donde se usó, coste medio por uso.
Por cliente: nombre, gasto total, servicios, gasto medio por servicio.
Por trabajador: nombre, gasto total, servicios, gasto medio por servicio.

Toggle para cambiar la vista de la tabla (por material / por cliente / por trabajador).

**6. Estado vacío:**

Si `materialCost === 0` en todos los servicios: "No hay datos de consumo de materiales. Vincula materiales a los servicios para controlar costes." con link a la página de materiales.

#### Criterios de aceptación

- [ ] KPIs calculados desde `cleaning_service.materialCost` y `materialsUsed[]`.
- [ ] Gráfico de evolución mensual.
- [ ] Top 10 materiales y top 10 clientes por gasto.
- [ ] Tabla con toggle por material/cliente/trabajador.
- [ ] Filtros globales aplican.
- [ ] Estado vacío con CTA a materiales.

---

### TICKET IRL-08: Pestaña "Facturación" — Facturación mensual

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita ver la evolución de la facturación: cuánto ha facturado, cuánto ha cobrado, cuánto queda pendiente, y cómo se distribuye por cliente.

#### Contenido de la pestaña

**1. KPIs (4 tarjetas):**

| KPI | Dato |
|---|---|
| Facturación total | € en periodo |
| Cobrado | € |
| Pendiente de cobro | € (rojo si > 20% del total) |
| Tasa de cobro | collectedAmount / billedAmount × 100 % |

**2. Gráfico "Evolución de facturación mensual":**

`<ComposedChart>` con:
- Barras: facturado por mes (indigo).
- Barras superpuestas: cobrado (emerald).
- Línea: pendiente acumulado (rose).

**3. Gráfico "Facturación por cliente":**

`<BarChart horizontal>` top 15 clientes por facturación. Cada barra dividida en cobrado (verde) y pendiente (rojo).

**4. Tabla detallada por cliente:**

Cliente, facturado, cobrado, pendiente, % cobro, servicios, facturas emitidas. Ordenable. Filas con pendiente > 0 resaltadas en amber.

**5. Tabla de facturas (si existen `client_invoice` vinculadas):**

Nº factura, fecha, cliente, importe, estado (pagada/pendiente/vencida), días desde emisión. Link a la factura.

#### Criterios de aceptación

- [ ] KPIs calculados correctamente.
- [ ] Gráfico de evolución mensual con facturado vs cobrado.
- [ ] Tabla de facturación por cliente con indicadores de cobro.
- [ ] Filtros globales aplican.
- [ ] Si no hay facturas reales, estima desde precios de servicios con nota explicativa.

---

### TICKET IRL-09: Pestaña "Comparativas" — Por zona y por tipo de servicio

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

El gerente necesita comparar el rendimiento entre zonas geográficas y entre tipos de servicio para decidir dónde expandir, qué tipos de servicio priorizar y dónde hay problemas.

#### Contenido de la pestaña

**1. Sub-toggle: "Por zona" / "Por tipo de servicio"**

**2. Vista "Por zona":**

KPIs: nº zonas activas, zona más rentable, zona con más incidencias.

Gráfico: `<BarChart>` agrupado por zona con barras de ingresos, coste laboral, coste material.

Tabla: zona, clientes, servicios, horas, ingresos, costes, margen, % margen, rating calidad, incidencias, trabajadores. Color de margen como semáforo.

Radar chart (opcional): comparar 3-5 zonas en dimensiones: volumen, rentabilidad, calidad, eficiencia.

**3. Vista "Por tipo de servicio":**

KPIs: nº tipos activos, tipo más rentable, tipo con mayor €/hora.

Gráfico: `<BarChart>` por tipo de servicio con ingresos vs costes.

Tabla: tipo, servicios, duración media, ingresos, costes, margen, % margen, €/hora, incidencias. Ordenable.

Gráfico de evolución: `<LineChart>` con ingresos por tipo de servicio a lo largo del periodo (si > 30 días).

**4. Insights automáticos:**

Calcular y mostrar frases tipo:
- "La zona Centro genera el 45% de tus ingresos pero tiene el margen más bajo (12%)."
- "Los servicios de desinfección tienen un €/hora 2.3× superior a la limpieza general."
- "La zona Norte tiene 0 incidencias en el periodo vs 8 en zona Sur."

Cada insight como card con icono de bombilla, texto descriptivo y datos concretos.

#### Criterios de aceptación

- [ ] Toggle entre "Por zona" y "Por tipo de servicio".
- [ ] Gráficos de barras comparativos funcionales.
- [ ] Tablas completas con semáforo de margen.
- [ ] Insights automáticos generados dinámicamente.
- [ ] Filtros globales aplican (excepto el propio filtro de zona/tipo que se desactiva en su vista).

---

### TICKET IRL-10: Control de permisos — Gerente vs Trabajador

**Tipo:** Feature — Frontend + Backend  
**Prioridad:** Crítica  
**Dependencias:** IRL-02  
**Archivos:** `src/app/pages/saas/CleaningReports.tsx`, `services/couchdb.js`

#### Contexto

La página de informes debe restringir contenido según el rol:
- **Gerente** (Admin, Gerente): ve toda la analítica y rentabilidad global.
- **Trabajador**: NO ve rentabilidad global, ni márgenes, ni costes de otros. Solo datos operativos propios si se autoriza.

#### Qué hacer

**1. Añadir `'cleaning_reports'` a `TEAM_PERMISSION_KEYS`** en `services/couchdb.js`.

**2. Crear helpers de permisos en `CleaningReports.tsx`:**

```typescript
const isManager = useMemo(() => {
  const role = authUser?.role;
  return role === 'Admin' || role === 'Gerente';
}, [authUser]);

const canViewFullReports = useMemo(() => {
  if (isManager) return true;
  return authUser?.permissions?.cleaning_reports?.view === true;
}, [isManager, authUser]);

const canViewFinancials = useMemo(() => {
  if (isManager) return true;
  return authUser?.permissions?.cleaning_reports?.financials === true;
}, [isManager, authUser]);
```

**3. Mapa de visibilidad por pestaña:**

| Pestaña | Gerente | Trabajador |
|---|---|---|
| Resumen | Completo (KPIs financieros + operativos) | Solo KPIs operativos (servicios, horas) |
| Clientes | Todo | NO visible |
| Servicios | Todo | Solo sus servicios |
| Trabajadores | Todo | Solo sus propias métricas |
| Absentismo | Todo | Solo sus datos |
| Incidencias | Todo | Solo incidencias de sus servicios |
| Materiales | Todo | NO visible |
| Facturación | Todo | NO visible |
| Comparativas | Todo | NO visible |

**4. Filtrar pestañas visibles** según permisos. Si el usuario es trabajador: solo muestra Resumen (limitado), Servicios (propios) y opcionalmente Absentismo (propio).

**5. En las pestañas accesibles al trabajador**, filtrar datos para mostrar solo los del `workerId` del usuario actual.

**6. En los endpoints backend**, si el caller no es Admin/Gerente y no tiene permiso `cleaning_reports.view`: devolver solo datos del worker vinculado al caller.

**7. Banner informativo** si hay tabs ocultos: "Algunos informes están restringidos a gerentes."

#### Criterios de aceptación

- [ ] Admin/Gerente ven las 9 pestañas completas.
- [ ] Trabajador solo ve: Resumen (limitado), Servicios (propios), opcionalmente Absentismo (propio).
- [ ] Trabajador NO ve: Clientes, Materiales, Facturación, Comparativas, ni KPIs financieros.
- [ ] En Trabajadores, un trabajador solo ve sus propias métricas.
- [ ] `TEAM_PERMISSION_KEYS` incluye `'cleaning_reports'`.
- [ ] Los endpoints backend validan permisos.

---

### TICKET IRL-11: Filtros avanzados reutilizables

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

Los 5 filtros globales (periodo, cliente, trabajador, zona, tipo de servicio) deben funcionar de forma cruzada sobre todas las pestañas y reflejarse en la URL para deep linking.

#### Qué hacer

**1. Componente `CleaningReportsFilters`:**

Props:
```typescript
interface CleaningReportsFiltersProps {
  filters: CleaningReportFilters;
  onChange: (filters: CleaningReportFilters) => void;
  clients: string[];
  workers: string[];
  zones: string[];
  cleaningTypes: string[];
}

interface CleaningReportFilters {
  from: string;
  to: string;
  preset: string;        // 'today' | '7d' | '30d' | '90d' | '6m' | '1y' | 'custom'
  clientId: string;      // 'all' o ID/nombre
  workerId: string;      // 'all' o ID/nombre
  zone: string;          // 'all' o nombre de zona
  cleaningType: string;  // 'all' o tipo
}
```

**2. Sincronizar filtros con URL query params:**

`?from=2026-03-01&to=2026-03-31&client=Acme&worker=Maria&zone=Centro&type=general`

Al cargar la página, leer filtros de la URL. Al cambiar filtros, actualizar la URL sin recargar.

**3. Persistencia de filtros** entre cambios de pestaña (estado local del componente padre).

**4. Chips de filtros activos** debajo de la barra: cada filtro activo como chip con nombre y botón × para deseleccionar. Chip "Limpiar todo" si hay 2+ filtros activos.

**5. Responsive:**

- Desktop: todos los filtros en una fila con select/autocomplete.
- Móvil: periodo visible + botón "Filtros" que despliega un panel drawer con badge de nº filtros activos.

**6. Los selectores de cliente, trabajador y zona** usan autocomplete con búsqueda. Las opciones se extraen de los datos cargados o de endpoints auxiliares.

#### Criterios de aceptación

- [ ] Los 5 filtros funcionan y se aplican a todas las pestañas.
- [ ] Filtros sincronizados con URL (deep linking).
- [ ] Chips visibles con filtros activos + botón limpiar.
- [ ] Responsive con panel colapsable en móvil.
- [ ] Autocomplete en selectores de cliente, trabajador y zona.

---

### TICKET IRL-12: Alertas de rentabilidad — Backend + Panel UI

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01  
**Archivos:** `services/alertEngine.js`, `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

Se necesitan 4 alertas específicas de rentabilidad del negocio de limpieza que se evalúen periódicamente en el motor de alertas y se muestren en un panel integrado en la página de informes.

#### Reglas de alerta

**1. Cliente poco rentable:**

```
Categoría: cleaning_reports
Tipo: client_low_profitability
Condición: Cliente con margen bruto < 5% en los últimos 90 días y al menos 5 servicios completados
Dedup key: client_low_profitability:{clientName}:{trimestre}
Severidad: warning (margen < 5%), critical (margen negativo)
Mensaje: "El cliente {clientName} tiene un margen del {margin}% en los últimos 3 meses ({servicesCount} servicios). Revisa tarifas o costes."
```

**2. Exceso de absentismo:**

```
Categoría: cleaning_reports
Tipo: high_absenteeism
Condición: Tasa de absentismo global > 8% en los últimos 30 días
Dedup key: high_absenteeism:{mes}
Severidad: warning (>8%), critical (>15%)
Mensaje: "La tasa de absentismo es del {rate}% este mes ({absences} ausencias en {totalAssigned} servicios asignados)."
```

**3. Caída de productividad:**

```
Categoría: cleaning_reports
Tipo: productivity_drop
Condición: Ingresos/hora del equipo en los últimos 30 días < 80% de los 30 días anteriores
Dedup key: productivity_drop:{mes}
Severidad: warning (caída >20%), critical (caída >40%)
Mensaje: "La productividad del equipo ha caído un {dropPercent}%: de {prevRevenuePerHour}€/h a {currentRevenuePerHour}€/h."
```

**4. Costes materiales elevados:**

```
Categoría: cleaning_reports
Tipo: high_material_costs
Condición: Coste de materiales por servicio en los últimos 30 días > 150% del promedio de los 3 meses anteriores
Dedup key: high_material_costs:{mes}
Severidad: warning (>150%), critical (>200%)
Mensaje: "El gasto medio en materiales por servicio es de {currentAvg}€, un {increasePercent}% por encima de la media ({historicAvg}€)."
```

#### Backend: implementar en `alertEngine.js`

**1. Crear función `checkCleaningReportAlerts(userId, account, db)`:**

- Calcular métricas de rentabilidad por cliente (últimos 90 días).
- Calcular tasa de absentismo (últimos 30 días).
- Calcular productividad actual vs anterior (últimos 60 días divididos en 2 periodos de 30).
- Calcular coste medio de materiales actual vs histórico.
- Emitir alertas con `emitAlert()` y dedup.

**2. Añadir a `runAlertsForUser`** si la cuenta tiene servicios de limpieza.

**3. Configuración de umbrales en `alertConfig`:**

```javascript
cleaningReportAlerts: {
  clientLowProfitabilityEnabled: true,
  clientLowProfitabilityThreshold: 5,        // % margen mínimo
  clientMinServices: 5,                       // Mínimo servicios para evaluar
  highAbsenteeismEnabled: true,
  highAbsenteeismThreshold: 8,               // % máximo
  productivityDropEnabled: true,
  productivityDropThreshold: 20,             // % caída mínima para alertar
  highMaterialCostsEnabled: true,
  highMaterialCostsThreshold: 150,           // % sobre media
}
```

#### Frontend: panel de alertas en la página

**1. Componente `CleaningReportAlerts`** renderizado entre filtros y pestañas (solo si hay alertas y `canViewFullReports`).

**2. Cada alerta** con: icono de severidad (rojo/amber), título, mensaje con datos concretos, botón "Ver detalle" que navega a la pestaña relevante.

**3. Dismissable** por sesión (Set<string> en state).

**4. Si no hay alertas activas**, el panel no se renderiza.

#### Criterios de aceptación

- [ ] Las 4 reglas de alerta se evalúan en el ciclo del alert engine.
- [ ] Cada alerta tiene su configuración on/off y umbrales.
- [ ] Las alertas respetan dedup (1 por entidad por periodo).
- [ ] Se envían por SSE + Web Push.
- [ ] El panel se muestra en la página de informes solo para gerentes.
- [ ] Se pueden descartar individualmente.
- [ ] Si no hay alertas, el panel no aparece.

---

### TICKET IRL-13: Actualización en tiempo real (SSE refresh)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

Los datos se cargan al montar el componente y al cambiar filtros, pero no se actualizan si se registra un servicio completado, un fichaje o un material mientras el gerente está consultando. El backend ya emite eventos SSE.

#### Qué hacer

**1. Crear hook `useCleaningReportsRefresh`** que escuche eventos SSE relevantes:

- `cleaning:service:completed` — Servicio completado → refrescar KPIs y pestaña activa.
- `cleaning:service:check_in` / `check_out` — Fichaje → refrescar horas.
- `cleaning:incident:created` — Incidencia → refrescar pestaña incidencias.
- `cleaning:material:consumed` — Material consumido → refrescar materiales.
- `cleaning:alert:triggered` — Alerta → refrescar panel de alertas.

**2. Debounce de 3 segundos** para evitar múltiples recargas seguidas.

**3. Toast discreto** ("Datos actualizados") al recibir refresh.

**4. Timestamp** "Última actualización: HH:mm" en el pie de la página.

**5. Indicador visual** (punto verde pulsante) junto al timestamp cuando hay conexión SSE activa.

#### Criterios de aceptación

- [ ] Al completar un servicio desde otro dispositivo, los datos se refrescan.
- [ ] Debounce de 3 segundos funciona.
- [ ] Toast al actualizar.
- [ ] Timestamp de última actualización visible.
- [ ] Indicador de conexión SSE.

---

### TICKET IRL-14: Navegación cruzada (deep links a módulos)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IRL-03, IRL-04, IRL-05, IRL-06, IRL-07, IRL-08, IRL-09  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

La página muestra datos de clientes, trabajadores, servicios, materiales y finanzas pero no permite navegar directamente a los módulos relacionados.

#### Qué hacer

**1. En tablas de clientes**, enlazar nombre del cliente a su ficha CRM (`/saas/clients/:clientId`) si tiene `clientId`. Si no, enlazar a servicios filtrados por nombre.

**2. En tablas de trabajadores**, enlazar nombre a la ficha del trabajador (`/saas/cleaning-workers?worker=:workerId`).

**3. En tablas de servicios**, enlazar nº servicio al detalle (`/saas/cleaning-services?service=:serviceId`).

**4. En pestaña Materiales**, enlazar nombre del material a la página de materiales (`/saas/vertical/limpieza/materiales?tab=stock&itemId=:id`).

**5. En pestaña Facturación**, enlazar nº factura a la vista de facturación.

**6. Barra de navegación rápida** en el pie de la cabecera:

Chips/botones de acceso directo: Dashboard, Servicios, Trabajadores, Fichajes, Materiales, Facturación, Finanzas. Cada chip con icono + texto corto. Solo se muestran los relevantes según la pestaña activa.

**7. Conexiones desde otros módulos hacia informes:**

- En Dashboard (widget de limpieza): link "Ver informes →" a `/saas/vertical/limpieza/informes`.
- En CleaningServices: botón "Ver analítica" en la cabecera → enlaza a informes con filtro de periodo actual.
- En CleaningWorkers: tab "Productividad" enlaza a informes tab trabajadores con filtro de trabajador.
- En CleaningMaterials: link "Ver informe de costes" → enlaza a informes tab materiales.

#### Criterios de aceptación

- [ ] Nombres de clientes en tablas son enlaces clickables.
- [ ] Nombres de trabajadores son enlaces clickables.
- [ ] Servicios enlazan al detalle.
- [ ] Materiales enlazan a la página de materiales.
- [ ] Facturas enlazan a la vista de facturación.
- [ ] Barra de navegación rápida funcional.
- [ ] Otros módulos tienen links hacia informes.

---

### TICKET IRL-15: Pestaña "Resumen" — Vista ejecutiva

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IRL-01, IRL-02  
**Archivo principal:** `src/app/pages/saas/CleaningReports.tsx`

#### Contexto

La pestaña Resumen es la landing por defecto de la página. Muestra una vista ejecutiva de alto nivel con los datos más importantes del negocio, gráficos de evolución y una foto rápida del estado actual.

#### Contenido de la pestaña

**1. Sección "Evolución del negocio" (gráfico principal):**

`<ComposedChart>` con evolución mensual (últimos 6-12 meses):
- Barras: ingresos por mes (indigo).
- Barras superpuestas: coste total por mes (rose, transparencia 60%).
- Línea: margen bruto % por mes (emerald).
- Tooltip con desglose completo.

**2. Sección "Estado actual" (6 mini-cards):**

Dos filas de 3 cards compactas:
- Servicios hoy: X completados / Y programados.
- Trabajadores activos hoy: X en servicio / Y totales.
- Incidencias abiertas: X (rojo si > 0).
- Próximos vencimientos: X contratos por renovar.
- Cobros pendientes: X € (amber si > 30 días).
- Eficiencia del equipo: X% (color según nivel).

**3. Sección "Top clientes del periodo" (mini ranking):**

Top 5 clientes por margen en una tabla compacta: nombre, servicios, margen, trend. Link "Ver todos →" a pestaña Clientes.

**4. Sección "Top trabajadores del periodo" (mini ranking):**

Top 5 trabajadores por rentabilidad en tabla compacta: nombre, servicios, €/hora, eficiencia. Link "Ver todos →" a pestaña Trabajadores.

**5. Sección "Previsión de cierre del mes":**

Si estamos a mitad del mes o más:
- Proyección lineal de ingresos al cierre del mes.
- Comparativa con mes anterior.
- 3 escenarios: optimista (+20%), conservador (lineal), pesimista (-20%).
- Barra de progreso del mes (días transcurridos / días totales).

Solo visible para `canViewFullReports`.

**6. Sección "Alertas activas" (duplica panel superior si hay):**

Lista compacta de alertas activas de rentabilidad con acciones rápidas.

#### Criterios de aceptación

- [ ] Gráfico de evolución mensual con ingresos, costes y margen.
- [ ] 6 mini-cards de estado actual calculadas.
- [ ] Mini rankings de clientes y trabajadores.
- [ ] Previsión de cierre de mes funcional.
- [ ] Alertas activas visibles.
- [ ] Responsive con cards apiladas en móvil.
- [ ] Para trabajador: solo ve mini-cards operativas (servicios, horas propias).

---

## Resumen de implementación

| Ticket | Tipo | Prioridad | Esfuerzo |
|---|---|---|---|
| IRL-01: Endpoints de analítica backend | Backend | Crítica | L |
| IRL-02: Página principal con tabs y KPIs | Frontend | Crítica | L |
| IRL-03: Clientes activos y rentabilidad | Frontend | Crítica | M |
| IRL-04: Servicios completados y horas | Frontend | Alta | M |
| IRL-05: Rentabilidad por trabajador | Frontend | Crítica | M |
| IRL-06: Absentismo e Incidencias | Frontend | Alta | M |
| IRL-07: Coste de materiales | Frontend | Alta | M |
| IRL-08: Facturación mensual | Frontend | Alta | M |
| IRL-09: Comparativas zona y tipo | Frontend | Alta | M |
| IRL-10: Control de permisos | Front + Back | Crítica | M |
| IRL-11: Filtros avanzados | Frontend | Alta | M |
| IRL-12: Alertas de rentabilidad | Front + Back | Alta | M |
| IRL-13: Actualización en tiempo real | Frontend | Media | S |
| IRL-14: Navegación cruzada | Frontend | Media | S |
| IRL-15: Pestaña Resumen (vista ejecutiva) | Frontend | Alta | M |

### Orden recomendado de ejecución

```
Fase 1 — Cimientos (backend + estructura)
├── IRL-01  Endpoints de analítica backend
├── IRL-10  Permisos y visibilidad
└── IRL-11  Filtros avanzados

Fase 2 — Página y core
├── IRL-02  Página principal con tabs y KPIs
├── IRL-15  Pestaña Resumen (vista ejecutiva)
└── IRL-03  Clientes activos y rentabilidad por cliente

Fase 3 — Pestañas principales
├── IRL-04  Servicios completados y horas
├── IRL-05  Rentabilidad por trabajador
├── IRL-06  Absentismo e Incidencias
└── IRL-08  Facturación mensual

Fase 4 — Pestañas complementarias
├── IRL-07  Coste de materiales
└── IRL-09  Comparativas por zona y tipo

Fase 5 — Alertas y UX
├── IRL-12  Alertas de rentabilidad
├── IRL-14  Navegación cruzada
└── IRL-13  Actualización en tiempo real
```

---

## Conexiones con otros módulos

| Módulo | Relación | Datos que consume/publica |
|---|---|---|
| **Dashboard** (`/saas/dashboard`) | IRL-14 enlaza desde widget | KPIs de limpieza: clientes, servicios, facturación, alertas |
| **Servicios** (`/saas/cleaning-services` / `vertical/limpieza/servicios`) | IRL-04, IRL-14 | `cleaning_service[]` con execution, precio, materiales |
| **Trabajadores** (`/saas/cleaning-workers`) | IRL-05, IRL-14 | `cleaning_worker[]` con hourlyCost, availability |
| **Fichajes** (`/saas/clockins`) | IRL-06 | `clockin_record[]`, `getAbsenteeism`, `getOvertime` |
| **Materiales** (`/saas/vertical/limpieza/materiales`) | IRL-07, IRL-14 | `cleaning_service.materialsUsed[]`, `material_delivery[]` |
| **Facturación** (`/saas/billing`) | IRL-08, IRL-14 | `client_invoice[]` vinculadas a servicios de limpieza |
| **Finanzas** (`/saas/finance`) | IRL-08, IRL-15 | `financeMovements[]` de categoría `cleaning_*` |

---

## Notas técnicas

### Fuentes de datos

Los informes cruzan datos de múltiples DBs de CouchDB:
- **`*-cleaning`**: `cleaning_service`, `cleaning_incident`, `cleaning_route`, `service_contract` (futuro), `cleaning_worker` (futuro)
- **`*-clockins`**: `clockin_record` para horas fichadas
- **`*-catalog`**: `catalog_item` con `subtype: 'cleaning_material'` para materiales
- **`*-invoices`**: `client_invoice` para facturación
- **`*-finance`**: movimientos financieros

### Rendimiento

- Los endpoints de analítica operan sobre documentos CouchDB. Para cuentas con >1000 servicios, considerar vistas/índices CouchDB.
- Carga lazy por pestaña: solo se llama al endpoint cuando el usuario accede a esa pestaña.
- Memoización de cálculos con `useMemo` en el frontend.
- Debounce al cambiar filtros (300ms).

### Fallbacks

Todos los tickets están diseñados para funcionar con lo que **ya existe** (`cleaning_service` con `execution`, `materialsUsed`, etc.). Cuando se implementen los módulos planificados (CW-01, SVC-01, MAT-01), los informes se enriquecen automáticamente al consumir los mismos endpoints.

### Diseño

- **Paleta módulo informes limpieza**: indigo (primario), cyan (secundario), emerald (positivo), rose (negativo), amber (warning).
- **Componentes reutilizables**: `KPICard`, `ChartCard` de `Reports.tsx`; también se pueden reutilizar patrones de `src-delivery/app/components/informes/`.
- **Gráficos**: Recharts (ya instalado). Tooltips consistentes con datos formateados.
- **Tablas**: con `overflow-x-auto` para scroll horizontal en móvil. Headers sticky. Sortable via state.
- **Responsive**: breakpoints `sm` (640px), `md` (768px), `lg` (1024px). KPIs en grid 2-3-6 columnas.
- **Dark mode**: coherente con el design system del proyecto.
- **i18n**: todas las cadenas con `useTranslation`. Preparar claves para es, en, pt, fr.

### Exportaciones

Reutilizar la infraestructura de `Reports.tsx`:
- **Excel**: `xlsx` con hoja por sección visible, cabeceras con formato.
- **PDF**: `jsPDF` + `html2canvas` para captura de gráficos, tabla formateada.
- **CSV**: solo datos tabulares de la pestaña activa.

El nombre del archivo incluye: `Informe_{tab}_{from}_{to}.{ext}`.
