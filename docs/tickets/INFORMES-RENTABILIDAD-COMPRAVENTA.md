# INFORMES Y RENTABILIDAD — Diseño de Tickets

**Página:** `/saas/vertical/compraventa/informes`  
**Objetivo:** Ver el beneficio real del negocio por vehículo, comercial y periodo.  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Ya implementado (backend + frontend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Página de informes con 13 pestañas | Completo | `src/app/pages/saas/Reports.tsx` — ruta `/saas/reports` |
| Tab **Ventas**: KPIs (ventas período, ingresos, ticket medio, canceladas), gráficas ventas/mes e importe/margen | Completo | `Reports.tsx` — `tab === 'ventas'` |
| Tab **Inventario**: vehículos por marca, por estado, antigüedad de stock (0-30/31-60/61-90/+90 días) con impacto en margen | Completo | `Reports.tsx` — `tab === 'inventario'` |
| Tab **Rotación**: días medio venta por marca, por rango de precio, por modelo, marca más rápida/lenta | Completo | `Reports.tsx` — `tab === 'rotacion'` |
| Tab **CRM**: funnel de leads (captados → ganados), leads por origen y por estado | Completo | `Reports.tsx` — `tab === 'crm'` |
| Tab **Financiero**: cobros, pagos, balance, evolución mensual, desglose por categoría | Completo | `Reports.tsx` — `tab === 'financiero'` |
| Tab **Rentabilidad**: cuenta de resultados mensual (revenue, COGS, margen bruto, gastos operativos, EBITDA), YoY | Completo | `Reports.tsx` — `tab === 'rentabilidad'` |
| Tab **Margen Real**: margen real por vehículo = PVenta − PCompra − costes adicionales − comisiones, tabla detallada | Completo | `Reports.tsx` — `tab === 'margen'` |
| Tab **Comerciales**: rendimiento por agente CRM (leads, contactados, citas, cierres, conversión), timeline semanal | Completo | `Reports.tsx` — `tab === 'comerciales'` |
| Tab **Forecast**: pipeline activo, tasa histórica de cierre, previsión de unidades/revenue, escenarios | Completo | `Reports.tsx` — `tab === 'forecast'` |
| Tab **Comparativa**: interanual (ventas, ingresos, margen) + triple comparación (mes actual vs anterior vs mismo mes año pasado) | Completo | `Reports.tsx` — `tab === 'comparativa'` |
| Tab **Grupo**: KPIs consolidados multi-concesionario, funnel grupo, drill-down por sede | Completo | `Reports.tsx` — `tab === 'grupo'` |
| Tab **RGPD**: consentimientos, solicitudes de derechos, vencimientos | Completo | `Reports.tsx` — `tab === 'rgpd'` |
| Tab **Actividad**: heatmap día x hora de leads + ventas, pico de actividad | Completo | `Reports.tsx` — `tab === 'heatmap'` |
| Filtro de periodo (7d, 30d, 90d, 6m, 1y, custom) | Completo | `Reports.tsx` — `PRESETS`, `applyPreset` |
| Filtro por centro de trabajo / sede | Completo | `Reports.tsx` — `filterWorkCenter`, `useWorkCenters` |
| Exportación a Excel (xlsx), PDF (jsPDF), CSV por pestaña activa | Completo | `Reports.tsx` — `handleExportExcel`, `handleExportPdf`, `handleExportCsv` |
| KPICard con trend (subida/bajada), ChartCard con badge de periodo | Completo | `Reports.tsx` — sub-componentes `KPICard`, `ChartCard` |
| Gráficas Recharts (BarChart, LineChart, ComposedChart, PieChart, AreaChart, FunnelChart) | Completo | `Reports.tsx` — múltiples tabs |
| Motor de alertas con dedup + SSE + Web Push | Completo | `services/alertEngine.js` — 9 reglas activas |
| Alerta: vehículo demasiado tiempo en stock | Completo | `alertEngine.js` — `checkVehicleStockAging` (umbral configurable) |
| Alerta: velocidad de ventas baja (proyección vs media 3 meses) | Completo | `alertEngine.js` — `checkLowSalesVelocity` |
| Alerta: facturas de compra vencidas | Completo | `alertEngine.js` — `checkOverdueInvoices` |
| Alerta: cuentas por pagar elevadas | Completo | `alertEngine.js` — `checkHighPayables` |
| Roles: Admin, Gerente, Comercial, Administración, Taller, Usuario | Completo | `services/couchdb.js` — `ROLE_DEFINITIONS` |
| Permisos por módulo (`TEAM_PERMISSION_KEYS`) | Completo | `services/couchdb.js` — `['vehicles', 'clients', 'sales', 'documents', 'finance', 'ancove', 'team', 'fleet']` |
| Datos de vehículo: `purchasePrice`, `salePrice`, `associatedCosts[]`, `daysInStock`, `soldAt`, `supplierName`, `origin` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Datos de venta: `salePrice`, `status`, `responsible`, `vehicleId`, `createdAt` | Completo | `AppContext` — `sales` |
| Datos de leads: `responsible`, `budget`, `status`, `source`, `createdAt` | Completo | `AppContext` — `leads` |
| Movimientos financieros: `type` (cobro/pago), `category`, `totalAmount`, `date` | Completo | `lib/financeApi.ts` — `listFinanceMovements` |
| Comisiones: `commissionAmount`, `vehicleName`, `vehiclePlate` | Completo | `lib/commissionsApi.ts` — `listCommissions` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No hay filtros por comercial, proveedor, marca ni estado del vehículo** — Solo existe filtro de periodo y centro de trabajo | El gerente no puede segmentar datos por dimensiones clave del negocio |
| 2 | **No existe informe de compras agrupadas por proveedor** — No hay pestaña ni sección que muestre volumen de compra por proveedor | No se puede evaluar la relación con cada proveedor ni negociar condiciones |
| 3 | **Las ventas por trabajador solo muestran datos CRM (leads)** — Tab Comerciales muestra leads/conversiones pero no facturación directa ni margen por comercial | No se conoce el rendimiento económico real de cada vendedor |
| 4 | **No existe sección de "Top Vehículos"** — Tab Margen tiene tabla ordenada pero no hay ranking visual destacado top/flop | Falta vista rápida para operaciones estrella y operaciones con pérdida |
| 5 | **No hay vista de gastos de preparación acumulados** — `associatedCosts[]` se usa por vehículo pero no hay resumen global por categoría ni evolución temporal | No se puede controlar inversión en preparación ni detectar desviaciones |
| 6 | **No hay actualización en tiempo real** — Los datos se cargan al montar/cambiar pestaña pero no se refrescan vía SSE ni polling | Informes quedan desactualizados hasta recarga manual |
| 7 | **No hay control de permisos en Reports** — La página es accesible por cualquier usuario; no se filtran pestañas ni datos sensibles según el rol | Un comercial puede ver márgenes globales, comisiones de otros y rentabilidad |
| 8 | **Faltan alertas de margen medio bajo y exceso de gasto por vehículo** — El motor tiene 9 reglas pero ninguna evalúa margen medio ni gasto acumulado | No se detectan deterioros en la rentabilidad ni sobreinversiones |
| 9 | **No hay navegación cruzada** — Reports no enlaza a la ficha del vehículo, al detalle de venta ni al perfil del trabajador | El gerente ve datos pero no puede actuar directamente |
| 10 | **Falta previsión de cierre de mes en contexto de rentabilidad** — Forecast calcula unidades/revenue pero no proyecta margen bruto ni EBITDA al cierre | No se puede anticipar si el mes cerrará con beneficio o pérdida |

### Mapa de dependencias

```
IR-01 (Filtros avanzados)
  ├── IR-02 (Compras por proveedor — usa filtro proveedor)
  ├── IR-03 (Ventas por trabajador — usa filtro comercial)
  ├── IR-04 (Top vehículos — usa filtro marca/estado)
  └── IR-05 (Gastos acumulados — usa filtro fecha/proveedor)

IR-06 (Permisos y visibilidad)
  ├── IR-03 (Ventas por trabajador — restricción de datos)
  └── IR-07 (Panel de alertas — restricción por rol)

IR-07 (Panel de alertas en Reports)
  └── IR-08 (Alertas backend nuevas — consume las alertas)

IR-08 (Alertas backend) — independiente del frontend
IR-09 (Actualización en tiempo real) — independiente
IR-10 (Navegación cruzada) — después de IR-02..IR-05
IR-11 (Previsión cierre de mes) — independiente, enriquece tab rentabilidad
```

---

## TICKETS

---

### TICKET IR-01: Filtros avanzados (comercial, proveedor, marca, estado)

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

La barra de filtros actual solo tiene periodo (7d/30d/90d/6m/1y/custom) y centro de trabajo. Para compraventa se necesitan cuatro dimensiones adicionales: comercial/vendedor, proveedor, marca del vehículo y estado del vehículo. Estos filtros deben actuar de forma cruzada sobre todas las pestañas que contengan datos filtables por esas dimensiones.

#### Tareas

**1. Extraer listas únicas para los selectores a partir de los datos de `AppContext`:**

```typescript
const uniqueBrands = useMemo(() =>
  [...new Set(vehicles.map(v => v.brand).filter(Boolean))].sort(), [vehicles]);

const uniqueResponsibles = useMemo(() =>
  [...new Set([
    ...sales.filter(s => s.responsible).map(s => s.responsible!),
    ...leads.filter(l => l.responsible).map(l => l.responsible!),
  ])].sort(), [sales, leads]);

const uniqueSuppliers = useMemo(() =>
  [...new Set(vehicles.map(v => v.supplierName).filter(Boolean))].sort(), [vehicles]);

const VEHICLE_STATUSES = [
  { value: 'available', label: 'Disponible' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'sold', label: 'Vendido' },
  { value: 'workshop', label: 'Taller' },
];
```

**2. Añadir estados:**

```typescript
const [filterBrand, setFilterBrand] = useState<string>('all');
const [filterResponsible, setFilterResponsible] = useState<string>('all');
const [filterSupplier, setFilterSupplier] = useState<string>('all');
const [filterVehicleStatus, setFilterVehicleStatus] = useState<string>('all');
```

**3. Renderizar los selectores en la barra de filtros existente, después del selector de centro de trabajo.** Cada `<select>` sigue el mismo patrón visual que `filterWorkCenter`. Repetir para los 4 filtros. Colapsar en segunda fila en móvil con `flex-wrap`.

**4. Integrar los filtros en los `useMemo` existentes:**

- `filteredSales` → filtrar por `s.responsible` (comercial).
- `filteredLeads` → filtrar por `l.responsible` (comercial).
- Todos los `useMemo` que operan sobre `vehicles` (`vehiclesByBrand`, `vehiclesByStatus`, `stockAgeData`, `marginData`, `realMarginData`, `rotacionData`, `yearlyComparison`, `rentabilidadData`) → filtrar por `v.brand`, `v.status`, `v.supplierName`.
- `financeMovements` (tab financiero): no se filtra por marca/proveedor ya que son movimientos genéricos.

**5. Añadir botón "Limpiar filtros"** visible cuando algún filtro no sea "all".

**6. Mostrar chips/badges con los filtros activos** debajo de la barra para que el usuario vea qué tiene aplicado.

#### Criterios de aceptación

- [ ] Los 4 selectores se muestran en la barra de filtros, colapsan bien en móvil.
- [ ] Filtrar por marca filtra inventario, rotación, margen, rentabilidad, comparativa, ventas.
- [ ] Filtrar por comercial filtra ventas, leads, comerciales.
- [ ] Filtrar por proveedor filtra inventario, rotación, margen, compras por proveedor.
- [ ] Filtrar por estado filtra inventario, rotación, stock aging.
- [ ] Limpiar filtros resetea todos a "all".
- [ ] Los filtros persisten al cambiar de pestaña.
- [ ] Las exportaciones exportan datos filtrados, no el total.

---

### TICKET IR-02: Sección "Compras por proveedor"

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IR-01 (para que el filtro de proveedor se aplique)  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

No existe ningún informe que agrupe las compras de vehículos por proveedor. El campo `supplierName` y `origin` ya existen en el modelo de vehículo. Se necesita una sección que muestre: n.o de vehículos comprados a cada proveedor, coste total de compra, coste medio por vehículo, margen medio obtenido en las unidades ya vendidas, y días medio en stock.

#### Tareas

**1. Crear pestaña "Proveedores"** — añadir `'proveedores'` a `ReportTab` y al array `TABS` con icono `<Package>`. Insertarla entre "Comerciales" y "Forecast".

**2. Calcular `supplierData` con `useMemo`:** Agrupar `vehicles` por `supplierName || origin || 'Sin proveedor'`. Para cada proveedor calcular: total vehículos, inversión total (`purchasePrice`), vendidos, facturación (`salePrice`), margen total, días medio stock. Derivar: coste medio, margen medio, % margen medio.

**3. Renderizar 4 KPIs:** Proveedores activos | Inversión total en compras | Margen medio por proveedor | Mejor proveedor (mayor margen).

**4. Gráfico de barras horizontal** "Top 10 proveedores por margen": `<BarChart layout="vertical">` con barra verde si positivo, roja si negativo.

**5. Gráfico de barras agrupadas** "Volumen de compra vs margen por proveedor": dos barras (`totalCost` azul, `totalMargin` verde).

**6. Tabla detallada** con columnas: Proveedor | Vehículos | Inversión | Coste medio | Vendidos | Facturación | Margen total | % Margen | Días medio. Colores: verde >= 10%, ámbar >= 5%, rojo < 5%.

**7. Añadir exportaciones** (Excel, PDF, CSV) para el tab `proveedores` en los handlers existentes.

#### Criterios de aceptación

- [ ] La pestaña "Proveedores" aparece en el tab bar.
- [ ] Los 4 KPIs se calculan correctamente.
- [ ] El gráfico top 10 y la tabla muestran datos reales.
- [ ] El filtro de proveedor y de marca (IR-01) filtran los datos.
- [ ] Los 3 formatos de exportación funcionan.
- [ ] Estado vacío con icono y mensaje si no hay datos.

---

### TICKET IR-03: Ventas reales por trabajador / comercial (revenue + margen)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IR-01 (filtro comercial), IR-06 (restricción de visibilidad)  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

El tab "Comerciales" actual muestra métricas CRM (leads, contactados, conversión) pero no la facturación real ni el margen generado por cada comercial. Ya existe `commercialRevenueData` (línea ~957) que agrupa ventas completadas por `responsible`, pero no se renderiza de forma prominente. El gerente necesita ver datos de todos los comerciales; el trabajador solo los suyos (salvo permiso explícito).

#### Tareas

**1. Ampliar `commercialRevenueData`** para incluir: ticket medio, margen real (descontando `associatedCosts`), mejor operación por comercial, % margen. Aplicar filtro de periodo y comercial (IR-01).

**2. Añadir sección "Rendimiento económico" en la tab Comerciales,** debajo de la sección de actividad CRM existente, con `<SectionTitle>`.

**3. Renderizar 4 KPIs de facturación:** Facturación total equipo | Margen real total equipo | Ticket medio global | Mejor comercial (por margen).

**4. Gráfico de barras agrupadas** "Revenue vs Margen por comercial": `<BarChart>` con `revenue` (azul) y `realMargin` (verde/rojo).

**5. Tabla de rendimiento económico:** Comercial | Ventas | Facturación | Ticket medio | Margen bruto | Costes asoc. | Margen real | % Margen | Mejor operación. Cada fila enlaza al trabajador si se puede resolver el ID.

**6. Ampliar exportaciones** para incluir `commercialRevenueData`.

#### Criterios de aceptación

- [ ] La sección muestra la facturación real basada en `sales` completadas.
- [ ] El margen real descuenta costes asociados al vehículo.
- [ ] Filtro de comercial y periodo aplican correctamente.
- [ ] Exportaciones incluyen ambas tablas (CRM + rendimiento económico).
- [ ] Si el usuario es "trabajador" sin permiso, solo ve sus propios datos (depende de IR-06).

---

### TICKET IR-04: Top Vehículos (ranking visual estrella/flop)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IR-01 (filtros)  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

La tabla de margen real ya ordena vehículos por margen descendente, pero no hay un componente visual "Top/Flop" que resalte de un vistazo las mejores y peores operaciones.

#### Tareas

**1. Crear sub-componente `TopVehicleCard`:** Componente que muestra matrícula, marca/modelo, margen real, días en stock, y un indicador visual de posición (medallas para top 3). Versión "winner" (verde) y "loser" (rojo).

**2. Renderizar en la pestaña Margen Real, debajo de los KPIs y antes de los gráficos:** Dos columnas en `grid md:grid-cols-2 gap-5`: "Top 5 Ganadores" (mayor margen real) y "Top 5 Operaciones en riesgo" (menor margen / pérdida).

**3. Añadir 2 KPIs especiales:** Venta más rápida (vehículo vendido con menor `daysInStock`) | Mayor tiempo en stock actualmente (vehículo `available` con mayor `daysInStock`).

**4. Enlazar cada card del ranking** a la ficha del vehículo (`/saas/vehicles/${vehicle.id}`).

**5. Los filtros de marca, proveedor y periodo** (IR-01) deben afectar al ranking.

#### Criterios de aceptación

- [ ] Se muestran los Top 5 ganadores y Top 5 pérdidas.
- [ ] Cada card muestra: vehículo, matrícula, margen real, días en stock.
- [ ] KPIs de "venta más rápida" y "mayor tiempo en stock" son correctos.
- [ ] Al hacer clic se navega a la ficha del vehículo.
- [ ] Filtros afectan al ranking.

---

### TICKET IR-05: Gastos de preparación acumulados

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IR-01 (filtros)  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

Cada vehículo tiene un array `associatedCosts` con objetos `{ category, amount, description, date }` que representan gastos de preparación (ITV, limpieza, fotos, reparaciones, transporte, etc.). Actualmente estos datos solo se muestran a nivel de vehículo individual en la pestaña Margen. Falta un resumen global.

#### Tareas

**1. Calcular `preparationCostsData` con `useMemo`:** Iterar todos los vehículos (filtrados por marca, proveedor, estado según IR-01), extraer `associatedCosts`, agrupar por categoría. Calcular: gasto total, gasto medio por vehículo, desglose por categoría (total + count), top 10 vehículos con mayor gasto.

**2. Integrar como sección dentro de la tab Margen Real** (no crear nueva tab), con `<SectionTitle>Gastos de preparación acumulados</SectionTitle>`.

**3. Renderizar 4 KPIs:** Gasto total preparación | Gasto medio por vehículo | Vehículos con gastos | Categoría principal.

**4. PieChart** "Distribución por categoría de gasto": cada categoría como sector.

**5. BarChart horizontal** "Top 10 vehículos con mayor gasto de preparación".

**6. Tabla detallada por categoría:** Categoría | Operaciones | Gasto total | % del total | Media por operación.

**7. Ampliar exportaciones** para incluir `preparationCostsData` cuando `tab === 'margen'`.

#### Criterios de aceptación

- [ ] Los 4 KPIs se calculan correctamente a partir de `associatedCosts`.
- [ ] El PieChart muestra categorías con porcentaje.
- [ ] La tabla muestra todas las categorías encontradas.
- [ ] El gráfico Top 10 permite identificar vehículos con mayor gasto.
- [ ] Filtros de marca, proveedor y estado filtran los datos.
- [ ] Estado vacío con mensaje si no hay gastos.

---

### TICKET IR-06: Control de permisos (gerente vs trabajador)

**Tipo:** Feature — Frontend + Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna  
**Archivos:** `src/app/pages/saas/Reports.tsx`, `services/couchdb.js`

#### Contexto

La página de informes no aplica control de acceso. Todos los usuarios ven todas las pestañas. Según requisitos:
- **Gerente** (roles `Admin`, `Gerente`): ve toda la analítica y rentabilidad global.
- **Trabajador** (roles `Comercial`, `Administración`, `Taller`, `Usuario`): NO ve márgenes globales, rentabilidad, comisiones de otros, salvo permiso explícito.

#### Tareas

**1. Añadir `'reports'` a `TEAM_PERMISSION_KEYS`** en `services/couchdb.js`. Admin y Gerente ya tienen `['all']`, así que queda incluido automáticamente.

**2. Crear helpers de permisos en Reports.tsx:**

```typescript
const isManager = useMemo(() => {
  const role = authUser?.role;
  return role === 'Admin' || role === 'Gerente';
}, [authUser]);

const canViewFullReports = useMemo(() => {
  if (isManager) return true;
  return authUser?.permissions?.reports?.view === true;
}, [isManager, authUser]);
```

**3. Definir pestañas sensibles:** `['rentabilidad', 'margen', 'financiero', 'grupo']`. El resto son accesibles para todos.

**4. Filtrar `TABS` según permisos** para que solo se muestren las pestañas permitidas al usuario.

**5. En tab Comerciales, si no es manager**, filtrar `commercialData` y `commercialRevenueData` para mostrar solo los datos del usuario actual.

**6. Redirigir a tab base** si el usuario tiene seleccionado un tab restringido.

**7. Mostrar banner informativo** discreto si hay tabs ocultos: "Algunos informes están restringidos."

#### Criterios de aceptación

- [ ] Admin/Gerente ven todas las pestañas.
- [ ] Comercial/Taller/Usuario NO ven: Rentabilidad, Margen Real, Financiero, Grupo.
- [ ] Un comercial puede obtener acceso si se le activa `reports.view` en permisos de equipo.
- [ ] En tab Comerciales, un trabajador solo ve sus propias métricas.
- [ ] `TEAM_PERMISSION_KEYS` incluye `'reports'`.

---

### TICKET IR-07: Panel de alertas integrado en Reports

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IR-08 (alertas backend nuevas)  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

Las alertas del motor se muestran en el dashboard y como notificaciones push, pero no hay un resumen visual de alertas activas dentro de la propia página de informes.

#### Tareas

**1. Calcular `reportAlerts` localmente con `useMemo`** a partir de los datos ya disponibles:

- **Margen medio bajo**: si `marginStats.avgPct < 8` → warning; si `< 3` → alert.
- **Demasiados vehículos parados**: si `stockAgeStats.g90 >= 5` → warning; si `>= 10` → alert.
- **Exceso de gasto por vehículo**: si `preparationCostsData.avgPerVehicle > 1500` → warning; si `> 2500` → alert.
- **Caída de ventas**: si ventas mes actual vs anterior caen mas del 30% → warning; 50% → alert.

**2. Renderizar el panel entre filtros y pestañas** (solo si hay alertas y `canViewFullReports`). Cada alerta con color según nivel (rojo = alert, ámbar = warning). Incluir enlace "Ver" si hay ruta asociada.

**3. Hacer dismissable por sesión:** Botón × que oculta la alerta en un `Set<string>` local.

#### Criterios de aceptación

- [ ] El panel muestra 0-4 alertas según datos reales.
- [ ] Solo visible para usuarios con `canViewFullReports`.
- [ ] Se puede descartar individualmente cada alerta.
- [ ] Si no hay alertas activas, el panel no se renderiza.

---

### TICKET IR-08: Alertas backend — margen bajo y exceso de gasto

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** Ninguna  
**Archivo principal:** `services/alertEngine.js`

#### Contexto

El motor de alertas evalúa 9 reglas pero ninguna mide la rentabilidad. Se necesitan dos reglas nuevas:

1. **Margen medio bajo**: cuando el margen medio de los últimos N vehículos vendidos cae por debajo de un umbral.
2. **Exceso de gasto de preparación**: cuando el gasto medio por vehículo supera un umbral.

#### Tareas

**1. Añadir umbrales configurables en `getAlertConfig`:**

```javascript
lowMarginEnabled: cfg.lowMarginEnabled !== false,
lowMarginThreshold: Number(cfg.lowMarginThreshold || 8), // % mínimo
lowMarginWindow: Number(cfg.lowMarginWindow || 10), // últimos N vendidos
excessCostEnabled: cfg.excessCostEnabled !== false,
excessCostThreshold: Number(cfg.excessCostThreshold || 1500), // euros máximo medio
```

**2. Implementar `checkLowMargin`:** Obtener los últimos N vehículos vendidos con precio, calcular el margen real medio (descontando `associatedCosts`), y emitir alerta si cae por debajo del umbral.

**3. Implementar `checkExcessPreparationCost`:** Obtener vehículos con `associatedCosts`, calcular media de gasto por vehículo, y emitir alerta si supera el umbral.

**4. Añadir ambas reglas a `runAlertsForUser`** después de `checkLowSalesVelocity`.

**5. Ampliar `getAlertSummary`** con sección `profitability` que incluya `recentMarginPct` y `avgPreparationCost`.

#### Criterios de aceptación

- [ ] Alerta de margen bajo se genera cuando cae por debajo del umbral (default 8%).
- [ ] Alerta de exceso de gasto se genera cuando supera el umbral (default 1.500 euros).
- [ ] Ambas respetan dedup (1 por día).
- [ ] Se envían por SSE y Web Push.
- [ ] Los umbrales son configurables por cuenta en `alertConfig`.

---

### TICKET IR-09: Actualización en tiempo real (SSE refresh)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** Ninguna  
**Archivos:** `src/app/pages/saas/Reports.tsx`, `src/app/context/AppContext.tsx` (si aplica)

#### Contexto

Los datos se cargan al montar el componente y al cambiar de pestaña, pero no se actualizan si se registra una venta o gasto mientras el usuario está consultando. El backend ya emite eventos SSE.

#### Tareas

**1. Crear hook `useReportsRefresh`** que escuche eventos SSE relevantes (`vehicle_updated`, `sale_created`, `sale_updated`, `finance_movement`, `cost_added`).

**2. Implementar callback de refresh** que recargue datos de `AppContext` y datos lazy (finance, commissions).

**3. Añadir debounce** de 2 segundos para evitar múltiples recargas seguidas.

**4. Mostrar toast discreto** ("Datos actualizados") al recibir refresh.

**5. Añadir timestamp** "Última actualización" en la barra de filtros (`Act. HH:mm`).

#### Criterios de aceptación

- [ ] Al registrar una venta desde otro dispositivo, los datos se refrescan.
- [ ] El refresh tiene debounce de 2 segundos.
- [ ] Se muestra toast al actualizar.
- [ ] Se muestra hora de última actualización.

---

### TICKET IR-10: Navegación cruzada (deep links a módulos)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IR-02, IR-03, IR-04, IR-05  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

La página muestra datos de vehículos, ventas, comerciales, finanzas y gastos, pero no permite navegar directamente a los módulos relacionados.

#### Tareas

**1. En tablas de vehículos** (Margen, Inventario, Rotación, Gastos), enlazar la matrícula a la ficha del vehículo con `<Link to={/saas/vehicles/${v.id}}>`.

**2. En tablas de comerciales**, enlazar el nombre al perfil del trabajador o a ventas filtradas.

**3. En pestaña Proveedores** (IR-02), enlazar nombre del proveedor a vehículos filtrados.

**4. Añadir shortcuts de navegación** al pie de la barra de filtros: Dashboard, Vehículos, Ventas, Finanzas, Equipo.

**5. Importar `Link`** de `react-router-dom` en Reports.tsx.

#### Criterios de aceptación

- [ ] La matrícula en cualquier tabla es un enlace clicable a `/saas/vehicles/:id`.
- [ ] El nombre del comercial enlaza a su perfil o a ventas filtradas.
- [ ] El nombre del proveedor enlaza a vehículos filtrados por proveedor.
- [ ] Los shortcuts se muestran en la cabecera.

---

### TICKET IR-11: Previsión de cierre de mes (proyección rentabilidad)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  
**Archivo principal:** `src/app/pages/saas/Reports.tsx`

#### Contexto

El tab Forecast calcula unidades y revenue proyectados pero no estima el margen bruto ni EBITDA al cierre del mes. El gerente necesita saber si terminará con beneficio o pérdida.

#### Tareas

**1. Calcular `monthEndForecast` con `useMemo`:** A partir de `rentabilidadData.months[currentMonthIdx]`, obtener datos reales del mes hasta hoy. Proyectar linealmente al cierre (actual / % transcurrido). Calcular 3 escenarios:
- **Optimista**: proyección lineal + 30% del margen estimado del pipeline.
- **Conservador**: proyección lineal pura.
- **Pesimista**: 70% de la proyección lineal.

**2. Añadir sección "Previsión de cierre del mes" en la tab Rentabilidad**, después del gráfico YoY. Banner premium con gradiente indigo/azul, badge del día del mes y % transcurrido.

**3. Renderizar barra de progreso visual del mes** (0-100%).

**4. Tabla comparativa real vs proyectado:** Revenue | Margen bruto | Gastos operativos | EBITDA estimado — cada uno con valor real a hoy, proyección mes, y delta vs mes anterior.

**5. Renderizar los 3 escenarios** (optimista, conservador, pesimista) como cards con color verde/azul/rojo y EBITDA estimado.

**6. Incluir el pipeline como factor:** Mostrar "X leads activos con margen estimado de Y euros podrían aportar un Z% adicional al cierre."

#### Criterios de aceptación

- [ ] La sección aparece en la pestaña Rentabilidad.
- [ ] Muestra datos reales del mes vs proyección lineal al cierre.
- [ ] Los 3 escenarios se calculan y se muestran con colores diferenciados.
- [ ] La barra de progreso del mes es precisa.
- [ ] Solo visible para usuarios con `canViewFullReports`.
- [ ] Si no hay datos, se muestra "Sin datos suficientes".

---

## Resumen de implementación

| Ticket | Tipo | Prioridad | Esfuerzo |
|---|---|---|---|
| IR-01: Filtros avanzados | Frontend | Crítica | M |
| IR-02: Compras por proveedor | Frontend | Alta | M |
| IR-03: Ventas por trabajador | Frontend | Alta | M |
| IR-04: Top Vehículos | Frontend | Media | S |
| IR-05: Gastos preparación acumulados | Frontend | Alta | M |
| IR-06: Control de permisos | Front + Back | Crítica | M |
| IR-07: Panel de alertas en Reports | Frontend | Alta | S |
| IR-08: Alertas backend | Backend | Media | S |
| IR-09: Actualización en tiempo real | Frontend | Media | M |
| IR-10: Navegación cruzada | Frontend | Media | S |
| IR-11: Previsión cierre de mes | Frontend | Alta | M |

### Orden recomendado de ejecución

```
Fase 1 (base):     IR-01 → IR-06 → IR-08
Fase 2 (datos):    IR-02 → IR-03 → IR-05 → IR-11
Fase 3 (UX):       IR-04 → IR-07 → IR-10 → IR-09
```

---

## Conexiones con otros módulos

| Módulo | Relación | Datos que consume/publica |
|---|---|---|
| **Dashboard** (`/saas/dashboard`) | IR-07 y IR-08 alimentan alertas del dashboard | Alertas de margen bajo, exceso gasto |
| **Vehículos** (`/saas/vehicles`) | IR-10 enlaza matrículas a fichas | `vehicles[]`, `associatedCosts[]`, `daysInStock` |
| **Gastos preparación** (via `associatedCosts`) | IR-05 agrega datos de preparación | `vehicle.associatedCosts[].{category, amount, date}` |
| **Ventas** (`/saas/sales`) | IR-03 agrupa ventas por comercial | `sales[].{salePrice, responsible, vehicleId, status}` |
| **Trabajadores** (`/saas/team`) | IR-03 + IR-10 enlazan a perfiles | `responsible` (nombre comercial) |
| **Finanzas** (`/saas/finance`) | Tab Rentabilidad y Financiero | `financeMovements[].{type, totalAmount, category, date}` |
