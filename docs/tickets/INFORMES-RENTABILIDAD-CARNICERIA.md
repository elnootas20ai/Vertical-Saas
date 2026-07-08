# Informes y Rentabilidad — Carnicería

**Página:** `/saas/vertical/carniceria/informes`  
**Objetivo:** Ver el resultado real del negocio: ventas, márgenes, merma, compras y beneficio por periodo, tienda y trabajador.  
**Vertical:** `butcherShop`  
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

**~55% hecho a nivel de código, ~15% funcional.** Existe la tríada completa `ButcherReports.tsx` (8 pestañas, filtros con presets, exportación CSV/Excel/PDF por pestaña, polling con `visibilityState`, skeleton, banner y restricción de pestañas para trabajador) + `butcherReportsApi.ts` (6 funciones) + `controllers/butcherReportsController.js` con los 6 endpoints (KPIs, ventas-trabajador con clockins, top-productos, evolución, categorías, tiendas) y `routers/butcherReportsRouter.js`. i18n `butcherReports` en 5 idiomas y acceso rápido en ButcherHub.
**Bloqueadores críticos:** el router NO está montado en `index.js` (la API `/api/butcher-reports` es inaccesible) y la ruta `/saas/vertical/carniceria/informes` redirige a `/saas/reports` en `routes.tsx`, por lo que la página es inalcanzable. No hay ítem "Informes" en el Sidebar. **Falta además:** modelos IC-01 tal cual (no hay `butcher_store` ni `butcherService.js`; las ventas `butcher_sale` dependen de `butcherSalesRouter`, también sin montar), permiso `butcher_reports` en `TEAM_PERMISSION_KEYS` y enforcement backend por rol, alertas de margen bajo/caída de ventas/producto estrella, SSE en la página, filtro de producto con autocomplete y filtros en URL.

---

## Auditoría de lo existente

### Ya implementado

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Dashboard operativo (ButcherHub) con KPIs mock: ventas hoy, ticket medio, merma, stock crítico, pedidos, equipo, caja, lotes | ✅ UI completa (datos mock) | `src/app/pages/saas/ButcherHub.tsx` — `/saas/butcher-hub` |
| Toggle Gerente / Trabajador en ButcherHub | ✅ Frontend | `ButcherHub.tsx` — `role` state |
| Filtros de tienda, turno y trabajador en ButcherHub | ✅ Frontend (solo gerente) | `ButcherHub.tsx` — `filterTienda`, `filterTurno`, `filterTrabajador` |
| Alertas mock en ButcherHub: stock bajo, lote caducidad, merma alta, precio desactualizado, caja pendiente | ✅ Frontend mock | `ButcherHub.tsx` — `alerts[]` |
| Rendimiento por trabajador mock: ventas, ingresos, tickets, merma kg, hora entrada | ✅ Frontend mock | `ButcherHub.tsx` — `workers[]` |
| Ventas por hora (mini-chart) | ✅ Frontend mock | `ButcherHub.tsx` — `hourlySales[]` |
| Merma semanal (mini-chart) | ✅ Frontend mock | `ButcherHub.tsx` — `dailyWaste[]` |
| CRUD Ventas con stats básicas (ventas hoy, ingresos hoy, ticket medio, ventas mes) | ✅ UI local | `ButcherSales.tsx` — `/saas/butcher-sales` |
| CRUD Merma con categorías (vacuno, cerdo, pollo, cordero, elaborados), motivos, lote, responsable | ✅ UI local | `ButcherWaste.tsx` — `/saas/butcher-waste` |
| CRUD Inventario por zona (cámara frío, congelador, mostrador, obrador), lotes, caducidad, temperatura | ✅ UI local | `ButcherInventory.tsx` — `/saas/butcher-inventory` |
| Productos y cortes con precio/kg, stock, conservación | ✅ UI local | `ButcherProducts.tsx` — `/saas/butcher-products` |
| Proveedores / Compras | ✅ UI local | `ButcherSuppliers.tsx` — `/saas/butcher-suppliers` |
| Pedidos | ✅ UI local | `ButcherOrders.tsx` — `/saas/butcher-orders` |
| Trazabilidad | ✅ UI local | `ButcherTraceability.tsx` — `/saas/butcher-traceability` |
| Trabajadores carnicería | ✅ UI local | `ButcherWorkers.tsx` — `/saas/butcher-workers` |
| TPV Carnicería | ✅ UI local | `ButcherTpvPage.tsx` — `/saas/butcher-tpv` |
| Motor de alertas genérico (SSE + Web Push + dedup + quietHours) | ✅ Backend | `services/alertEngine.js` |
| API métricas de ventas genérica (revenue, cost, margin, top products, trend 12 meses) | ✅ Backend | `controllers/salesMetricsController.js` — `GET /api/sales-metrics/:userId` |
| API dashboard KPIs genérica | ✅ Backend | `index.js` — `GET /api/dashboard/kpis/:userId` |
| API movimientos financieros | ✅ Backend | `routers/financeRouter.js` — `GET /api/finance/:userId/movements` |
| API stock movements + summary | ✅ Backend | `routers/stockMovementRouter.js` — `GET /api/stock-movements/:userId/summary` |
| API fichajes + stats | ✅ Backend | `routers/clockinsRouter.js` — `GET /api/clockins/:businessId/stats` |
| Sidebar con navegación carnicería (9 ítems: hub, productos, pedidos, inventario, proveedores, trazabilidad, ventas, merma, trabajadores) | ✅ Frontend | `Sidebar.tsx` — grupo `butcherShop` |
| i18n: claves `butcherHub`...`butcherWaste` en ES, EN, PT, FR, IT | ✅ | `lib/i18n.ts` |
| Patrón Reports.tsx genérico con KPICard, ChartCard, filtros, exportación Excel/PDF/CSV | ✅ Referencia | `Reports.tsx` (orientado a compraventa) |
| Patrón InformeTicketMedio del módulo delivery (niveles Base/Normal/Pro, filtros, responsive) | ✅ Referencia | `src-delivery/app/components/informes/` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe la página `/saas/vertical/carniceria/informes`** — No hay ruta, componente ni entrada en sidebar para informes de carnicería | El gerente no tiene ningún lugar donde ver la rentabilidad del negocio |
| 2 | **No existen modelos CouchDB para carnicería** — Todas las páginas Butcher* trabajan con estado local / datos mock | Ningún dato es persistente; no se puede hacer reporting real |
| 3 | **No existe API de reporting para carnicería** — `salesMetricsController.js` está orientado a vehículos (`vehicleName`, `stage: sold/delivered`) | No se pueden agregar ventas, merma, compras ni márgenes de carnicería |
| 4 | **No hay cruce entre ventas, compras, merma y horas trabajadas** — Cada página es un silo independiente con su propio estado | Imposible calcular el beneficio real ni el coste real por trabajador |
| 5 | **No existe cálculo de margen por producto ni por categoría** — No hay relación precioVenta - precioCompra en los modelos actuales | El gerente no sabe qué productos son rentables y cuáles no |
| 6 | **No hay alertas backend específicas de carnicería** — `alertEngine.js` tiene reglas para vehículos/facturas pero ninguna para merma, margen o stock de carnicería | No se detectan automáticamente problemas del negocio |
| 7 | **No hay control de permisos en informes** — El toggle gerente/trabajador de ButcherHub es solo UI, no filtra datos reales | Un trabajador podría acceder a datos sensibles de rentabilidad |
| 8 | **No hay actualización en tiempo real en informes** — ButcherHub simula "en vivo" con un timer visual pero no tiene SSE ni polling real | Los datos quedan estancados hasta recarga manual |
| 9 | **No hay evolución por categoría** — Las categorías (vacuno, cerdo, pollo, cordero, elaborados) existen en ButcherWaste pero no se agregan en ningún informe | No se puede ver qué categoría aporta más o menos al negocio |
| 10 | **No hay evolución por tienda** — El filtro de tienda en ButcherHub es decorativo (valores hardcoded "Central", "Norte") | No se puede comparar rendimiento entre puntos de venta |
| 11 | **Falta enlace "Informes" en sidebar de carnicería** — No hay ítem de navegación para acceder a la página de reporting | La página no es descubrible desde la interfaz |
| 12 | **No hay exportación de datos de carnicería** — Reports.tsx tiene exportación pero solo para datos de compraventa | El gerente no puede descargar informes de su carnicería |

### Mapa de dependencias

```
IC-01 (Modelos CouchDB carnicería) ← Base de todo
  ├── IC-02 (API reporting carnicería) ← Necesita modelos
  │     ├── IC-03 (Página Informes frontend) ← Necesita API
  │     │     ├── IC-04 (Filtros avanzados) ← Enriquece la página
  │     │     ├── IC-05 (Evolución por categoría y tienda) ← Necesita datos agregados
  │     │     ├── IC-06 (Exportación) ← Necesita datos de la página
  │     │     └── IC-07 (Navegación cruzada) ← Necesita página completa
  │     └── IC-08 (Alertas backend carnicería) ← Necesita API + modelos
  ├── IC-09 (Permisos y visibilidad por rol) ← Necesita modelos + API
  └── IC-10 (Actualización en tiempo real) ← Necesita API + SSE

IC-11 (Sidebar + ruta) ← Independiente, ejecutar primero
```

---

## TICKETS

---

### TICKET IC-01: Modelos CouchDB para carnicería

**Tipo:** Feature — Backend  
**Prioridad:** Crítica (bloquea todo lo demás)  
**Dependencias:** Ninguna  
**Archivos:** `services/couchdb.js`, nuevo `services/butcherService.js`

#### Contexto

Todas las páginas Butcher* usan estado local con datos mock o `useState`. Para poder hacer reporting real necesitamos persistir ventas, productos, merma, compras e inventario en CouchDB. Los modelos deben usar el patrón existente de `couchdb.js` con funciones `getButcherDbName()` y tipos de documento diferenciados.

#### Cambios requeridos

1. **Nueva base de datos `getButcherDbName(userId)`** en `services/couchdb.js`:
   - Patrón: `butcher_{userId}` (como `getSalesDbName`, `getFinanceDbName`)
   - Exportar la función

2. **Documentos tipo `butcher_product`** — Un producto del catálogo de la carnicería:
   ```
   {
     _id: "prod_{uuid}",
     type: "butcher_product",
     nombre: "Solomillo de ternera",
     categoria: "vacuno" | "cerdo" | "pollo" | "cordero" | "elaborados" | "otros",
     precioVentaKg: 32.00,
     precioCompraKg: 18.50,
     stockActual: 12.5,
     stockMinimo: 5.0,
     unidad: "kg" | "unidades",
     proveedor: "Cárnicas del Norte S.L.",
     proveedorId: "sup_{uuid}",
     conservacion: "refrigerado" | "congelado" | "ambiente",
     activo: true,
     tiendaId: "store_{uuid}" | null,
     createdAt: "2026-04-14T10:00:00Z",
     updatedAt: "2026-04-14T10:00:00Z"
   }
   ```

3. **Documentos tipo `butcher_sale`** — Un ticket de venta cerrado:
   ```
   {
     _id: "sale_{uuid}",
     type: "butcher_sale",
     ticket: "CARN-20260414-0034",
     fecha: "2026-04-14",
     hora: "13:42",
     lineas: [
       { productoId: "prod_{uuid}", nombre: "Chuletón", cantidad: 1.2, unidad: "kg",
         precioUnitario: 28.00, precioCompra: 15.50, subtotal: 33.60 }
     ],
     total: 33.60,
     costeTotal: 18.60,
     margen: 15.00,
     metodoPago: "efectivo" | "tarjeta" | "bizum" | "mixto",
     trabajadorId: "worker_{uuid}",
     trabajadorNombre: "Carlos García",
     tiendaId: "store_{uuid}",
     tiendaNombre: "Tienda Central",
     estado: "completada" | "pendiente" | "anulada",
     createdAt: "2026-04-14T13:42:00Z"
   }
   ```

4. **Documentos tipo `butcher_waste`** — Registro de merma:
   ```
   {
     _id: "waste_{uuid}",
     type: "butcher_waste",
     fecha: "2026-04-14",
     productoId: "prod_{uuid}",
     productoNombre: "Solomillo de ternera",
     categoria: "vacuno",
     lote: "LOT-2026-0408",
     cantidad: 1.2,
     unidad: "kg",
     costeEstimado: 22.20,
     motivo: "caducidad" | "deterioro" | "corte" | "devolucion" | "rotura_frio" | "otro",
     responsableId: "worker_{uuid}",
     responsableNombre: "Carlos García",
     tiendaId: "store_{uuid}",
     observaciones: "Lote caducado",
     createdAt: "2026-04-14T09:00:00Z"
   }
   ```

5. **Documentos tipo `butcher_purchase`** — Una compra al proveedor:
   ```
   {
     _id: "purchase_{uuid}",
     type: "butcher_purchase",
     fecha: "2026-04-14",
     proveedorId: "sup_{uuid}",
     proveedorNombre: "Cárnicas del Norte S.L.",
     lineas: [
       { productoId: "prod_{uuid}", nombre: "Solomillo de ternera", cantidad: 20,
         unidad: "kg", precioUnitario: 18.50, subtotal: 370.00 }
     ],
     total: 370.00,
     estado: "recibida" | "pendiente" | "parcial",
     tiendaId: "store_{uuid}",
     createdAt: "2026-04-14T07:30:00Z"
   }
   ```

6. **Documentos tipo `butcher_store`** — Punto de venta:
   ```
   {
     _id: "store_{uuid}",
     type: "butcher_store",
     nombre: "Tienda Central",
     direccion: "Calle Mayor 5, Madrid",
     activa: true,
     createdAt: "2026-01-01T00:00:00Z"
   }
   ```

7. **Nuevo servicio `services/butcherService.js`** con funciones CRUD:
   - `createButcherDoc(req, userId, doc)` → Crea documento en la DB
   - `listButcherDocs(req, userId, type, filters?)` → Lista documentos por tipo con filtros opcionales
   - `getButcherDoc(req, userId, docId)` → Obtiene un documento
   - `updateButcherDoc(req, userId, docId, updates)` → Actualiza
   - `deleteButcherDoc(req, userId, docId)` → Soft-delete (marca `deletedAt`)

#### Criterios de aceptación

- [x] La función `getButcherDbName` existe y la base se crea automáticamente con `ensureDatabase` *(DB global `{prefix}-butcher`, no `butcher_{userId}`)*
- [ ] Se pueden crear, listar, actualizar y soft-delete documentos de los 5 tipos *(existen builders para `butcher_product`, `butcher_batch`, `butcher_waste`, `butcher_purchase_entry`; NO existe `butcher_store` ni `services/butcherService.js`; `butcher_sale` se gestiona en `butcherSalesController.js` pero su router no está montado)*
- [ ] `listButcherDocs` acepta filtro por `type`, rango de `fecha`, `tiendaId`, `trabajadorId`, `categoria`
- [ ] Los documentos se validan: campos obligatorios, tipos numéricos > 0, fechas válidas
- [ ] El campo `margen` en `butcher_sale` se calcula automáticamente a partir de `total - costeTotal`
- [ ] Tests unitarios para validación de cada tipo de documento

---

### TICKET IC-02: API de Reporting para Carnicería

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** IC-01 (modelos CouchDB)  
**Archivos:** nuevo `controllers/butcherReportsController.js`, nuevo `routers/butcherReportsRouter.js`, `index.js`

#### Contexto

Se necesita un endpoint unificado que agregue datos de ventas, compras, merma, stock e inventario para alimentar la página de informes. El endpoint debe cruzar datos de diferentes tipos de documentos y devolver KPIs pre-calculados, series temporales y rankings.

#### Cambios requeridos

1. **Nuevo router:** `routers/butcherReportsRouter.js`
   - Montar en `index.js` como `/api/butcher-reports`

2. **Endpoint `GET /api/butcher-reports/:userId/kpis`** — KPIs principales:
   - **Parámetros query:** `from`, `to`, `storeId?`, `workerId?`, `category?`
   - **Response:**
     ```json
     {
       "ok": true,
       "kpis": {
         "ventasHoy": { "total": 1847.30, "tickets": 34, "ticketMedio": 54.33,
                        "vsPrevDay": 14.0, "vsPrevWeek": 8.2 },
         "ventasPeriodo": { "total": 42300.00, "tickets": 812, "ticketMedio": 52.09,
                           "vsPrevPeriod": 5.3 },
         "margenEstimado": { "total": 14805.00, "pct": 35.0, "vsPrevPeriod": -2.1 },
         "mermaTotal": { "kg": 45.2, "coste": 890.50, "pctSobreVentas": 2.1,
                         "vsPrevPeriod": 12.0 },
         "stockCritico": { "productos": 4, "items": [...] },
         "comprasMes": { "total": 28500.00, "facturas": 23, "vsPrevMonth": 3.4 },
         "beneficioEstimado": { "total": 8200.00, "pctSobreVentas": 19.4,
                                "formula": "ventas - costeVentas - merma - gastosOp" },
         "trabajadoresActivos": { "count": 3, "horasTotales": 24.5 }
       }
     }
     ```

3. **Endpoint `GET /api/butcher-reports/:userId/ventas-trabajador`** — Ventas desglosadas por trabajador:
   - **Parámetros query:** `from`, `to`, `storeId?`
   - **Response:** Array de objetos con `trabajadorId`, `nombre`, `ventasTotal`, `tickets`, `ticketMedio`, `margen`, `mermaKg`, `horasTrabajadas`, `ventasPorHora`

4. **Endpoint `GET /api/butcher-reports/:userId/top-productos`** — Ranking de productos:
   - **Parámetros query:** `from`, `to`, `storeId?`, `limit?` (default 10)
   - **Response:** Array con `productoId`, `nombre`, `categoria`, `unidadesVendidas`, `ingresos`, `margen`, `margenPct`, `stockActual`, `stockMinimo`, `alertaStock`
   - Ordenar por `ingresos` descendente

5. **Endpoint `GET /api/butcher-reports/:userId/evolucion`** — Series temporales:
   - **Parámetros query:** `from`, `to`, `granularity` (day|week|month), `storeId?`, `workerId?`, `category?`
   - **Response:**
     ```json
     {
       "ok": true,
       "series": {
         "ventas": [{ "periodo": "2026-04-01", "total": 1520, "tickets": 28, "margen": 532 }],
         "merma": [{ "periodo": "2026-04-01", "kg": 3.2, "coste": 62.40 }],
         "compras": [{ "periodo": "2026-04-01", "total": 980 }]
       }
     }
     ```

6. **Endpoint `GET /api/butcher-reports/:userId/categorias`** — Evolución por categoría:
   - **Parámetros query:** `from`, `to`, `storeId?`
   - **Response:** Para cada categoría (vacuno, cerdo, pollo, cordero, elaborados, otros): `ventas`, `margen`, `mermaKg`, `mermaCoste`, `pctDelTotal`, evolución mensual

7. **Endpoint `GET /api/butcher-reports/:userId/tiendas`** — Comparativa por tienda:
   - **Parámetros query:** `from`, `to`
   - **Response:** Para cada tienda: `ventasTotal`, `tickets`, `ticketMedio`, `margen`, `margenPct`, `mermaKg`, `mermaCoste`, `compras`, `beneficio`, `trabajadores`, `ventasPorEmpleado`

8. **Cruce de datos en todos los endpoints:**
   - Ventas: filtrar `butcher_sale` con `estado === 'completada'`
   - Coste de ventas: sumar `costeTotal` de cada venta
   - Merma: sumar `butcher_waste` del periodo y cruzar con categoría/producto
   - Compras: sumar `butcher_purchase` del periodo
   - Horas trabajadas: consultar `clockins` DB y calcular horas por trabajador
   - Beneficio = Ventas - Coste ventas - Merma

#### Criterios de aceptación

> **Nota auditoría:** `controllers/butcherReportsController.js` y `routers/butcherReportsRouter.js` existen con los 6 endpoints, pero el router **no está montado en `index.js`** — la API `/api/butcher-reports` no es alcanzable en runtime.

- [ ] Los 6 endpoints responden correctamente con datos reales de CouchDB *(código completo, pero inaccesibles por falta de montaje)*
- [x] Todos los endpoints aceptan filtros de fecha (`from`, `to`), tienda y trabajador *(`parseRange` + `filterDoc` con storeId/workerId/category)*
- [x] Los cálculos de margen y beneficio son correctos: `margen = venta - coste`, `beneficio = ventas - costesVentas - merma`
- [x] Las variaciones porcentuales (`vsPrevPeriod`) comparan con el periodo anterior de igual duración *(`prevRange`)*
- [x] El endpoint `/tiendas` cruza correctamente ventas, merma y compras por `tiendaId`
- [x] El endpoint `/ventas-trabajador` cruza ventas con fichajes para calcular `ventasPorHora` *(usa `loadClockins`)*
- [ ] Rendimiento < 2s para un mes de datos con ~1000 ventas, ~100 mermas, ~50 compras *(no verificable; API sin montar)*
- [ ] Errores 400 si falta `userId` o las fechas son inválidas; errores 500 con log de error

---

### TICKET IC-03: Página de Informes y Rentabilidad (componente principal)

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** IC-02 (API reporting)  
**Archivos:** nuevo `src/app/pages/saas/ButcherReports.tsx`, `src/app/routes.tsx`, nuevo `src/app/lib/butcherReportsApi.ts`

#### Contexto

Se necesita una página dedicada en `/saas/vertical/carniceria/informes` que muestre todos los datos de reporting en un diseño atractivo y profesional. La página debe seguir los patrones de diseño existentes: Tailwind CSS con dark mode, componentes KPICard, gráficas Recharts, diseño responsive.

#### Estructura de la página

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: "Informes y Rentabilidad" + badge "En vivo" + Exportar        │
├─────────────────────────────────────────────────────────────────────────┤
│  Barra de filtros: Periodo | Tienda | Trabajador | Categoría | Producto│
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┬─────────┬──────────┬──────────┬──────────┬───────────┐    │
│  │ Ventas  │ Margen  │  Merma   │ Compras  │Beneficio │  Stock    │    │
│  │  hoy    │estimado │  total   │  del mes │estimado  │ crítico   │    │
│  │ 1.847€  │  35.0%  │  45.2kg  │ 28.500€  │ 8.200€  │  4 items  │    │
│  │ +14% ▲  │  -2.1%  │  +12% ▲  │  +3.4%  │ +5.8% ▲ │  ⚠ alerta │    │
│  └─────────┴─────────┴──────────┴──────────┴──────────┴───────────┘    │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ PESTAÑAS: Resumen | Ventas | Trabajadores | Categorías |        │   │
│  │           Tiendas | Merma | Compras | Márgenes                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ══ TAB RESUMEN ═══════════════════════════════════════════════════     │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │ Evolución ventas vs       │  │ Distribución por          │           │
│  │ margen (ComposedChart)    │  │ categoría (PieChart)      │           │
│  └──────────────────────────┘  └──────────────────────────┘            │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │ Top 5 productos           │  │ Alertas activas           │           │
│  │ (tabla ranking)           │  │ (lista con severidad)     │           │
│  └──────────────────────────┘  └──────────────────────────┘            │
│  ┌───────────────────────────────────────────────────────────┐         │
│  │ Cuenta de resultados del periodo                          │         │
│  │ Ventas - Coste ventas = Margen bruto                      │         │
│  │ - Merma - Gastos operativos = Beneficio estimado          │         │
│  └───────────────────────────────────────────────────────────┘         │
│                                                                         │
│  ══ TAB VENTAS ════════════════════════════════════════════════         │
│  KPIs: ventas período, tickets, ticket medio, vs periodo anterior      │
│  Chart: evolución diaria/semanal/mensual de ventas (AreaChart)         │
│  Chart: ventas por franja horaria (BarChart)                           │
│  Tabla: detalle de ventas con producto, cantidad, importe, trabajador  │
│                                                                         │
│  ══ TAB TRABAJADORES ══════════════════════════════════════════         │
│  Ranking de trabajadores por ventas, tickets, ticket medio             │
│  Chart: comparativa barras (ventas por trabajador)                     │
│  Tabla: trabajador | ventas | tickets | ticket medio | merma |         │
│         horas trabajadas | ventas/hora                                 │
│                                                                         │
│  ══ TAB CATEGORÍAS ════════════════════════════════════════════         │
│  Chart: distribución ventas por categoría (PieChart)                   │
│  Chart: evolución mensual por categoría (StackedAreaChart)             │
│  Tabla: categoría | ventas | % total | margen | merma | tendencia     │
│                                                                         │
│  ══ TAB TIENDAS ═══════════════════════════════════════════════         │
│  Chart: comparativa tiendas (BarChart agrupado)                        │
│  Tabla: tienda | ventas | tickets | margen | merma | beneficio |       │
│         trabajadores | venta/empleado                                  │
│                                                                         │
│  ══ TAB MERMA ═════════════════════════════════════════════════         │
│  KPIs: merma total kg, coste, % sobre ventas, motivo principal         │
│  Chart: evolución merma diaria (AreaChart)                             │
│  Chart: merma por motivo (PieChart)                                    │
│  Chart: merma por categoría (BarChart)                                 │
│  Tabla: ranking productos con más merma                                │
│                                                                         │
│  ══ TAB COMPRAS ═══════════════════════════════════════════════         │
│  KPIs: total compras mes, facturas, proveedor principal, vs mes ant.   │
│  Chart: evolución compras mensual (BarChart)                           │
│  Chart: compras por proveedor (PieChart)                               │
│  Tabla: proveedor | compras | facturas | % del total | tendencia       │
│                                                                         │
│  ══ TAB MÁRGENES ══════════════════════════════════════════════         │
│  KPIs: margen bruto total, %, mejor producto, peor producto            │
│  Chart: margen por producto top 10 (BarChart horizontal)               │
│  Chart: evolución margen mensual vs objetivo (LineChart con ref)       │
│  Tabla: producto | ventas | coste | margen | % | trend                 │
│  Alerta visual: productos con margen < 15% en rojo                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Cambios requeridos

1. **Nuevo archivo `src/app/lib/butcherReportsApi.ts`** — Cliente API:
   - `fetchButcherKpis(userId, filters)` → `GET /api/butcher-reports/:userId/kpis`
   - `fetchButcherVentasTrabajador(userId, filters)` → `GET /api/butcher-reports/:userId/ventas-trabajador`
   - `fetchButcherTopProductos(userId, filters)` → `GET /api/butcher-reports/:userId/top-productos`
   - `fetchButcherEvolucion(userId, filters)` → `GET /api/butcher-reports/:userId/evolucion`
   - `fetchButcherCategorias(userId, filters)` → `GET /api/butcher-reports/:userId/categorias`
   - `fetchButcherTiendas(userId, filters)` → `GET /api/butcher-reports/:userId/tiendas`
   - Tipo `ButcherReportFilters`: `{ from: string, to: string, storeId?: string, workerId?: string, category?: string, productId?: string }`

2. **Nuevo componente `ButcherReports.tsx`** (~1500-2000 líneas):
   - **Tipo de tabs:** `'resumen' | 'ventas' | 'trabajadores' | 'categorias' | 'tiendas' | 'merma' | 'compras' | 'margenes'`
   - **Estado principal:**
     - `tab` — pestaña activa
     - `filters` — filtros aplicados (periodo, tienda, trabajador, categoría, producto)
     - `kpis` — datos KPIs del endpoint
     - `loading` — estado de carga
     - `lastUpdate` — timestamp última actualización
   - **Carga de datos:** `useEffect` al montar y al cambiar filtros, llamando a los endpoints según la pestaña activa (lazy loading: solo cargar datos de la pestaña visible)
   - **Componentes internos:**
     - `ReportKPICard` — Card con valor, subtítulo, icono, color, trend con flecha y porcentaje
     - `ReportChartCard` — Wrapper de gráfica con título, badge de periodo y borde redondeado
     - `FilterBar` — Barra de filtros con presets de periodo, selects de tienda/trabajador/categoría
   - **Diseño:** Tailwind CSS, dark mode completo, border-radius `rounded-2xl`, gaps `gap-3`/`gap-5`, responsive `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` para KPIs

3. **Ruta en `routes.tsx`:**
   ```tsx
   { path: 'vertical/carniceria/informes', Component: ButcherReports },
   ```
   - Import lazy: `const ButcherReports = lazy(() => import('./pages/saas/ButcherReports').then(m => ({ default: m.ButcherReports })));`

4. **Gráficas Recharts por pestaña** (usar componentes existentes de Recharts ya importados en el proyecto):
   - **Resumen:** `ComposedChart` (barras ventas + línea margen), `PieChart` (categorías)
   - **Ventas:** `AreaChart` (evolución), `BarChart` (franjas horarias)
   - **Trabajadores:** `BarChart` (comparativa)
   - **Categorías:** `PieChart` + `StackedAreaChart`
   - **Tiendas:** `BarChart` agrupado
   - **Merma:** `AreaChart` + `PieChart` + `BarChart`
   - **Compras:** `BarChart` + `PieChart`
   - **Márgenes:** `BarChart` horizontal + `LineChart` con `ReferenceLine`

5. **Tab Resumen — Cuenta de resultados:**
   - Tabla estilizada tipo P&L (Profit & Loss):
     ```
     (+) Ventas del periodo          42.300,00 €
     (-) Coste de ventas            -27.495,00 €
     (=) Margen bruto                14.805,00 €    35,0%
     (-) Merma (coste estimado)        -890,50 €
     (-) Gastos operativos           -5.714,50 €
     (=) Beneficio estimado           8.200,00 €    19,4%
     ```
   - Colores: ingresos en verde, costes en rojo, totales en bold, porcentajes en badges

#### Criterios de aceptación

> **Nota auditoría:** `ButcherReports.tsx` y `butcherReportsApi.ts` existen y están completos a nivel de código (8 pestañas, KPIs, gráficas Recharts, skeleton), pero en `routes.tsx` la ruta `vertical/carniceria/informes` **redirige a `/saas/reports`**, así que el componente no es alcanzable. Además su API backend no está montada.

- [ ] La página carga en `/saas/vertical/carniceria/informes` y muestra los 6 KPIs principales *(la ruta redirige a `/saas/reports`)*
- [x] Las 8 pestañas renderizan datos correctos con gráficas interactivas *(tabs `resumen|ventas|trabajadores|categorias|tiendas|merma|compras|margenes` implementadas)*
- [x] Los gráficos tienen tooltips con formato euros (`€`) y porcentajes
- [x] El diseño es responsive: en móvil KPIs en 2 columnas, gráficas apiladas
- [x] Dark mode funciona en todos los elementos (tarjetas, gráficas, tablas, badges)
- [x] Loading skeleton mientras se cargan datos (no pantalla en blanco)
- [ ] La cuenta de resultados muestra cálculos correctos y se actualiza con los filtros *(no verificable en runtime: API sin montar)*
- [ ] Sin errores de TypeScript ni linter

---

### TICKET IC-04: Filtros avanzados (fecha, tienda, trabajador, producto, categoría)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** IC-03 (página principal)  
**Archivo principal:** `src/app/pages/saas/ButcherReports.tsx`

#### Contexto

La barra de filtros debe permitir segmentar todos los datos por múltiples dimensiones. Los filtros aplican de forma cruzada a todas las pestañas y se mantienen al cambiar de tab.

#### Cambios requeridos

1. **Filtro de periodo** — Presets rápidos + rango personalizado:
   - Presets: `Hoy`, `Ayer`, `Últimos 7 días`, `Este mes`, `Mes anterior`, `Últimos 30 días`, `Últimos 90 días`, `Este año`, `Personalizado`
   - Al seleccionar "Personalizado": mostrar dos inputs `date` (desde/hasta)
   - Diseño: botones pill horizontales, el activo con fondo sólido azul

2. **Filtro de tienda** — Select con las tiendas del negocio:
   - Valor "Todas las tiendas" por defecto
   - Opciones: listar `butcher_store` activas del usuario
   - Si solo hay 1 tienda: no mostrar el filtro (ocultar para simplificar)

3. **Filtro de trabajador** — Select con los trabajadores:
   - Valor "Todos los trabajadores" por defecto
   - Opciones: listar trabajadores del equipo (desde clockins o team)
   - Solo visible para rol `gerente`

4. **Filtro de categoría** — Select o chips multi-selección:
   - Opciones: Vacuno, Cerdo, Pollo, Cordero, Elaborados, Otros
   - Valor "Todas las categorías" por defecto
   - Diseño: chips de colores que se pueden activar/desactivar

5. **Filtro de producto** — Buscador con autocomplete:
   - Input con icono `Search`, al escribir filtra lista de productos
   - Selección múltiple con tags/chips
   - Solo visible en tabs relevantes (ventas, márgenes, merma)

6. **Comportamiento:**
   - Al cambiar cualquier filtro: re-fetch de los datos con los nuevos parámetros
   - Debounce de 300ms en el buscador de producto para evitar peticiones excesivas
   - Los filtros se serializan en query params de la URL para permitir compartir enlaces
   - Botón "Limpiar filtros" que resetea todo a valores por defecto

7. **Diseño responsive:**
   - Desktop: filtros en una fila horizontal con scroll si no caben
   - Móvil: botón "Filtros" que despliega un sheet/drawer con los filtros apilados
   - Badge con el número de filtros activos cuando están colapsados

#### Criterios de aceptación

- [ ] Los 5 filtros aparecen y funcionan correctamente *(hay 4: periodo con presets + personalizado, tienda, trabajador, categoría; NO hay filtro de producto)*
- [x] Cambiar cualquier filtro recarga los datos de la pestaña activa *(re-fetch vía `useMemo(filters)` + `useEffect`)*
- [x] Los filtros persisten al cambiar de pestaña *(estado a nivel de componente)*
- [x] El filtro de trabajador se oculta para perfil `trabajador` *(condicionado a `isGerente`)*
- [ ] La URL se actualiza con los query params de los filtros
- [ ] El buscador de producto tiene autocomplete con debounce 300ms
- [ ] Botón "Limpiar filtros" resetea todo a valores por defecto
- [ ] En móvil los filtros se muestran en un drawer/sheet desplegable

---

### TICKET IC-05: Evolución por categoría y por tienda

**Tipo:** Feature — Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** IC-03 (página principal), IC-02 (API reporting)  
**Archivos:** `ButcherReports.tsx`, `butcherReportsController.js`

#### Contexto

Dos de las pestañas clave del informe son "Categorías" y "Tiendas", que permiten al gerente ver cómo evoluciona cada segmento del negocio a lo largo del tiempo y comparar rendimiento entre puntos de venta.

#### Cambios requeridos — Tab Categorías

1. **KPIs por categoría** — 6 cards (una por categoría):
   - Cada card muestra: nombre, ventas del periodo, % del total, trend vs periodo anterior
   - Color del borde o icono según la categoría
   - Ordenadas de mayor a menor venta

2. **Gráfica de distribución** — `PieChart` o `DonutChart`:
   - 6 sectores, cada uno con el % de ventas por categoría
   - Colores consistentes: vacuno=#dc2626 (rojo), cerdo=#f59e0b (ámbar), pollo=#eab308 (amarillo), cordero=#84cc16 (lima), elaborados=#8b5cf6 (violeta), otros=#6b7280 (gris)
   - Tooltip con importe y porcentaje

3. **Evolución mensual** — `StackedAreaChart`:
   - Eje X: meses (últimos 6 o 12 según filtro)
   - Eje Y: importe en €
   - Áreas apiladas por categoría con los mismos colores
   - Leyenda interactiva (click para ocultar/mostrar categoría)

4. **Tabla detallada de categorías:**
   - Columnas: Categoría | Ventas (€) | % Total | Margen (€) | % Margen | Merma (kg) | Merma (€) | Tendencia (sparkline o badge ▲▼)
   - Fila total al final
   - Ordenable por cualquier columna (click en header)

#### Cambios requeridos — Tab Tiendas

5. **KPIs comparativas** — Cards por tienda:
   - Cada card: nombre tienda, ventas, margen %, badge "mejor" para la tienda líder

6. **Gráfica comparativa** — `BarChart` agrupado:
   - Eje X: tiendas
   - Barras agrupadas: Ventas, Costes, Merma, Beneficio
   - Tooltip con detalle de cada valor

7. **Tabla comparativa detallada:**
   - Columnas: Tienda | Ventas | Tickets | Ticket medio | Margen (€) | Margen % | Merma (kg) | Merma (€) | Compras | Beneficio | Empleados | Venta/Empleado
   - Resaltar en verde la mejor tienda y en rojo la peor en cada columna
   - Fila total consolidada

8. **Vista de evolución por tienda** — `LineChart`:
   - Una línea por tienda
   - Eje X: meses, Eje Y: ventas €
   - Leyenda interactiva

#### Criterios de aceptación

- [x] Tab Categorías muestra distribución PieChart + evolución StackedAreaChart + tabla detallada
- [ ] Tab Tiendas muestra comparativa BarChart agrupado + tabla detallada + evolución LineChart *(hay BarChart + tabla, sin LineChart de evolución por tienda)*
- [x] Los colores de categorías son consistentes en todas las gráficas y tablas *(`CAT_COLORS`)*
- [ ] Las tablas son ordenables por columna
- [x] Si solo hay 1 tienda, el tab Tiendas muestra un mensaje informativo "Añade más puntos de venta para comparar" con enlace a configuración
- [ ] Los datos se filtran correctamente al aplicar filtros de periodo, trabajador, etc. *(implementado, pero no verificable en runtime: API sin montar)*

---

### TICKET IC-06: Exportación de informes (Excel, PDF, CSV)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IC-03 (página principal)  
**Archivo:** `ButcherReports.tsx`

#### Contexto

El gerente necesita poder descargar los informes para compartirlos, archivarlos o procesarlos externamente. El patrón de exportación ya existe en `Reports.tsx` con `xlsx`, `jspdf` y funciones helper `exportToExcel`, `exportToPdf`, `exportToCsv`.

#### Cambios requeridos

1. **Botón de exportación en el header** — Dropdown con 3 opciones:
   - Exportar a Excel (.xlsx)
   - Exportar a PDF
   - Exportar a CSV
   - Icono `Download` de lucide-react

2. **Exportación contextual por pestaña activa:**
   - **Resumen:** Exporta cuenta de resultados + KPIs
   - **Ventas:** Exporta serie temporal de ventas + detalle por día
   - **Trabajadores:** Exporta tabla de rendimiento por trabajador
   - **Categorías:** Exporta distribución + evolución por categoría
   - **Tiendas:** Exporta tabla comparativa de tiendas
   - **Merma:** Exporta detalle de merma por producto y motivo
   - **Compras:** Exporta detalle de compras por proveedor
   - **Márgenes:** Exporta tabla de márgenes por producto

3. **Excel:** Usar `xlsx` (ya instalado). Header con nombre del informe, periodo, filtros aplicados. Columnas formateadas con formato euro y porcentaje.

4. **PDF:** Usar `jspdf` (ya instalado). Cabecera con logo/nombre negocio + periodo. Tabla principal. Pie con fecha de generación.

5. **CSV:** Separador `;` para compatibilidad con Excel español. BOM UTF-8 para caracteres especiales.

6. **Nombre de archivo:** `Informes_Carniceria_{Tab}_{FechaDesde}_{FechaHasta}.{ext}`

#### Criterios de aceptación

- [x] Los 3 formatos de exportación funcionan para las 8 pestañas *(dropdown Exportar con CSV/Excel/PDF contextual por pestaña; Excel cae a CSV si falla `xlsx`)*
- [ ] El Excel tiene formato numérico correcto (euros, porcentajes)
- [ ] El PDF tiene cabecera con nombre del negocio y periodo, tabla legible *(cabecera con título del informe, sin nombre del negocio)*
- [x] El CSV usa separador `;` y BOM UTF-8
- [ ] Los filtros aplicados se reflejan en la cabecera del informe exportado
- [ ] Si no hay datos, el botón muestra tooltip "No hay datos para exportar"

---

### TICKET IC-07: Navegación cruzada entre módulos

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** IC-03 (página principal)  
**Archivos:** `ButcherReports.tsx`, `ButcherHub.tsx`, `Sidebar.tsx`

#### Contexto

Los informes no deben ser un callejón sin salida. El gerente debe poder navegar desde un dato del informe hasta la entidad concreta (producto, trabajador, venta, etc.) y viceversa.

#### Cambios requeridos

1. **Desde Informes hacia otros módulos:**
   - Click en nombre de producto → navegar a `/saas/butcher-products` (con filtro si es posible)
   - Click en nombre de trabajador → navegar a `/saas/butcher-workers` o `/saas/clockins`
   - Click en nombre de tienda → navegar a la configuración de la tienda
   - Click en alerta → navegar a la ruta de la alerta (stock, merma, etc.)
   - Click en proveedor → navegar a `/saas/butcher-suppliers`
   - Diseño: texto clickable con icono `ChevronRight` sutil, color blue-600 al hover

2. **Desde otros módulos hacia Informes:**
   - **ButcherHub:** Añadir botón "Ver informes completos" en la sección de KPIs o accesos rápidos, enlace a `/saas/vertical/carniceria/informes`
   - **ButcherSales:** Añadir enlace "Ver análisis de ventas" → `/saas/vertical/carniceria/informes?tab=ventas`
   - **ButcherWaste:** Añadir enlace "Ver informe de merma" → `/saas/vertical/carniceria/informes?tab=merma`

3. **Sidebar — nueva entrada "Informes":**
   - Añadir en `Sidebar.tsx` ítem:
     ```
     { id: 'butcher-reports', navKey: 'butcherReports', icon: <BarChart3 />, path: '/saas/vertical/carniceria/informes' }
     ```
   - Añadir a `itemIds` del grupo `butcherShop`
   - Posición: después de `butcher-waste` y antes de `butcher-workers`

4. **i18n:** Añadir clave `butcherReports: 'Informes'` en `lib/i18n.ts` (ES, EN, PT, FR, IT)

5. **Breadcrumb en la página de informes:**
   - `Centro Operativo > Informes y Rentabilidad`
   - "Centro Operativo" clickable → `/saas/butcher-hub`

#### Criterios de aceptación

- [x] Desde cualquier tabla del informe se puede navegar al detalle del producto/trabajador/proveedor *(navigate a butcher-products/workers/suppliers/sales/waste/inventory en `ButcherReports.tsx`)*
- [ ] El sidebar muestra el ítem "Informes" dentro del grupo carnicería *(no existe ítem `butcher-reports` en `Sidebar.tsx`)*
- [ ] Los enlaces cruzados desde ButcherHub, ButcherSales y ButcherWaste funcionan *(solo existe el acceso rápido de ButcherHub, y su destino redirige a `/saas/reports`)*
- [x] El breadcrumb navega correctamente al Hub *("Centro Operativo" → `/saas/butcher-hub`)*
- [x] Las claves i18n están en los 5 idiomas *(`butcherReports` en ES/EN/PT/FR/IT)*

---

### TICKET IC-08: Alertas backend específicas de carnicería

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** IC-01 (modelos CouchDB)  
**Archivos:** `services/alertEngine.js` (o nuevo `services/butcherAlertEngine.js`), `ButcherReports.tsx`

#### Contexto

El motor de alertas actual (`alertEngine.js`) tiene reglas para vehículos, facturas y stock genérico, pero ninguna para el dominio de carnicería. Se necesitan 4 alertas específicas que se muestren tanto en notificaciones push como en un panel dentro de la página de informes.

#### Reglas de alerta requeridas

1. **ALERTA: Margen bajo en producto**
   - **Condición:** Margen % de un producto en los últimos 7 días < 15%
   - **Cálculo:** `(totalVentas - totalCoste) / totalVentas * 100`
   - **Nivel:** `warning` si < 15%, `alert` si < 5% o negativo
   - **Mensaje:** `"Margen bajo en {producto}: {margen}% (últimos 7 días)"`
   - **Ruta:** `/saas/vertical/carniceria/informes?tab=margenes`
   - **Dedup:** 1 alerta por producto por día

2. **ALERTA: Merma alta**
   - **Condición:** Merma del día (en kg) > umbral configurable (default: 2.5 kg por tienda)
   - **Cálculo:** Sumar `butcher_waste` del día actual por `tiendaId`
   - **Nivel:** `warning` si > umbral, `alert` si > 2× umbral
   - **Mensaje:** `"Merma alta en {tienda}: {kg} kg hoy (umbral: {umbral} kg)"`
   - **Ruta:** `/saas/vertical/carniceria/informes?tab=merma`
   - **Dedup:** 1 alerta por tienda por día
   - **Config:** `account.alertConfig.butcher.mermaUmbralKg` (default: 2.5)

3. **ALERTA: Caída de ventas**
   - **Condición:** Ventas de hoy a la hora actual < 70% de la media de los últimos 5 mismos días de la semana (ej: si hoy es martes, comparar con los 5 martes anteriores)
   - **Cálculo:** Comparar ventas acumuladas hasta la hora actual vs media histórica proporcional
   - **Nivel:** `warning` si < 70%, `alert` si < 50%
   - **Mensaje:** `"Ventas por debajo de la media: {ventasHoy} vs {media} habitual ({pct}%)"`
   - **Ruta:** `/saas/vertical/carniceria/informes?tab=ventas`
   - **Dedup:** 1 alerta por tienda por día
   - **Horario:** Solo evaluar entre 8:00 y 21:00

4. **ALERTA: Producto estrella con falta de stock**
   - **Condición:** Un producto que está en el top 5 de ventas (últimos 30 días) tiene stock por debajo del mínimo
   - **Cálculo:** Cruzar `top-productos` con `butcher_product.stockActual < stockMinimo`
   - **Nivel:** `alert` si stock = 0, `warning` si stock < mínimo
   - **Mensaje:** `"¡{producto} (top ventas) con stock bajo! {stockActual}/{stockMinimo} {unidad}"`
   - **Ruta:** `/saas/butcher-inventory`
   - **Dedup:** 1 alerta por producto por día

#### Cambios en el panel de informes (frontend)

5. **Panel de alertas dentro de la página de informes:**
   - En el tab "Resumen", debajo de la cuenta de resultados
   - Card con lista de alertas activas, agrupadas por severidad
   - Badge con contador de alertas en la pestaña "Resumen"
   - Cada alerta clickable → navega a la ruta especificada
   - Colores: `alert` = rojo, `warning` = ámbar, `info` = azul

#### Cambios en el backend

6. **Nueva función `runButcherAlerts(userId)` en `alertEngine.js`:**
   - Ejecutar las 4 reglas anteriores
   - Solo para cuentas con `businessType === 'butcherShop'`
   - Integrar en `runAlertsForUser()` existente
   - Respetar `quietHours` y dedup existente

7. **Config por cuenta:** Añadir defaults en `alertConfig`:
   ```json
   {
     "butcher": {
       "mermaUmbralKg": 2.5,
       "margenMinimoProductoPct": 15,
       "ventasCaidaPct": 70,
       "enabled": true
     }
   }
   ```

#### Criterios de aceptación

> **Nota auditoría:** existe `services/butcherAlertEngine.js` (arranca en `index.js`) con ~20 reglas propias: merma alta/crítica/anómala (`butcher_waste_critical`, `butcher_waste_anomaly`, umbrales configurables por `alertConfig`), stock bajo/crítico/agotado, lotes caducados, precio sin actualizar, báscula, caja, tickets, inventario y compras. Pero de las 4 reglas de ESTE ticket solo está cubierta "merma alta"; **no hay** alerta de margen bajo por producto, ni de caída de ventas vs histórico, ni de producto estrella (top ventas × stock).

- [ ] Las 4 reglas de alerta se ejecutan cada hora para cuentas `butcherShop` *(solo merma alta; el motor corre cada 30 min filtrando `businessType === 'butcherShop'`)*
- [ ] Las alertas aparecen en notificaciones (SSE + Web Push) y en el panel de informes *(van al sistema de notificaciones; el panel de informes usa `stockCritico` de KPIs, no la lista de alertas)*
- [x] La deduplicación evita alertas repetidas el mismo día para el mismo producto/tienda *(dedupKey por regla en `alertEmitter`)*
- [x] Los umbrales son configurables por cuenta *(`alertConfig.butcherWasteWarningPct`/`butcherWasteCriticalPct` y similares; no con las claves `butcher.*` propuestas)*
- [ ] La alerta de caída de ventas solo se evalúa en horario comercial (8-21h) *(la regla no existe)*
- [ ] La alerta de producto estrella cruza correctamente top ventas con stock actual *(la regla no existe)*
- [x] Las alertas incluyen ruta para navegación directa al módulo afectado *(campo `route` en cada alerta)*

---

### TICKET IC-09: Control de permisos y visibilidad por rol

**Tipo:** Feature — Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** IC-02 (API), IC-03 (página)  
**Archivos:** `ButcherReports.tsx`, `butcherReportsController.js`

#### Contexto

El gerente ve toda la rentabilidad. El trabajador no debe ver márgenes, beneficios ni datos globales (solo los suyos propios), salvo que tenga permiso explícito. El sistema de permisos ya existe (`TEAM_PERMISSION_KEYS` en `couchdb.js`).

#### Cambios requeridos

1. **Nuevo permiso `butcher_reports`** en `TEAM_PERMISSION_KEYS`:
   - `'butcher_reports'` — Acceso a informes y rentabilidad de carnicería
   - Admins y gerentes lo tienen por defecto
   - Trabajadores no, salvo que se les conceda

2. **Backend — Middleware de permisos en `butcherReportsRouter.js`:**
   - Verificar que el usuario tiene permiso `butcher_reports` o es admin/gerente
   - Si es trabajador SIN permiso: solo devolver sus propios datos (filtrar por `trabajadorId`)
   - Endpoints afectados:
     - `/kpis` → Si trabajador: solo sus ventas, su merma
     - `/ventas-trabajador` → Si trabajador: solo su fila
     - `/top-productos` → Accesible para todos (no contiene datos sensibles de margen)
     - `/evolucion` → Si trabajador: filtrada a sus datos
     - `/categorias` → Accesible para todos
     - `/tiendas` → Solo gerente (403 para trabajador sin permiso)

3. **Frontend — Visibilidad condicional en `ButcherReports.tsx`:**
   - Detectar rol del usuario desde `useAuth()` → `user.role` o permisos del team member
   - **Gerente (o permiso `butcher_reports`):**
     - Ve todas las pestañas
     - Ve todos los KPIs (incluyendo margen, beneficio)
     - Ve filtro de trabajador
     - Ve comparativa por tienda
   - **Trabajador (sin permiso):**
     - Ve solo pestañas: Resumen (simplificado), Ventas (solo sus ventas), Categorías
     - NO ve pestañas: Trabajadores, Tiendas, Márgenes, Compras
     - KPIs visibles: Ventas (suyas), Tickets (suyos), Merma (suya)
     - KPIs ocultos: Margen, Beneficio, Compras mes
     - No ve filtro de trabajador
     - No ve cuenta de resultados
     - Banner informativo: "Estás viendo tus datos personales. Solicita acceso al gerente para ver datos globales."

4. **Diseño del banner de restricción:**
   - Fondo `bg-blue-50 dark:bg-blue-950/30`, borde `border-blue-200`
   - Icono `Shield` de lucide-react
   - Texto: "Vista trabajador — Mostrando solo tus datos personales"
   - Sin botón de acción (no puede auto-concederse permiso)

#### Criterios de aceptación

> **Nota auditoría:** el permiso `butcher_reports` NO existe en `TEAM_PERMISSION_KEYS` (hay `reports` genérico) y `butcherReportsRouter.js` no tiene middleware de permisos. La restricción por rol está solo en el frontend (`TABS_WORKER`, `isGerente`, envío de `workerId` propio).

- [x] Un gerente ve las 8 pestañas, todos los KPIs y todos los filtros
- [x] Un trabajador sin permiso ve solo 3 pestañas y sus propios datos *(`TABS_WORKER = ['resumen','ventas','categorias']`; solo restricción en cliente)*
- [ ] El backend filtra datos por `trabajadorId` cuando el usuario es trabajador *(el backend acepta `workerId` como filtro pero no lo impone según rol)*
- [ ] El endpoint `/tiendas` devuelve 403 para trabajador sin permiso
- [x] El banner de restricción aparece para el perfil trabajador *("Vista trabajador" con icono Shield)*
- [ ] Si al trabajador se le concede `butcher_reports`, ve todo como un gerente *(el permiso no existe)*
- [ ] No se puede acceder a datos de otros trabajadores manipulando la URL/API *(sin enforcement backend)*

---

### TICKET IC-10: Actualización en tiempo real

**Tipo:** Feature — Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** IC-02 (API), IC-03 (página)  
**Archivos:** `ButcherReports.tsx`, `index.js` (SSE)

#### Contexto

Los datos de la carnicería cambian constantemente durante el día (ventas, merma, fichajes). El gerente necesita ver los datos actualizados sin recargar la página manualmente. El sistema SSE ya existe (`services/sseService.js`) y se usa en alertas.

#### Cambios requeridos

1. **Polling inteligente en el frontend:**
   - Cuando la pestaña del navegador está activa y la página visible: polling cada 30 segundos
   - Cuando la pestaña está en segundo plano: polling cada 5 minutos
   - Usar `document.visibilityState` para detectar visibilidad
   - Mostrar indicador visual "En vivo" con dot verde animado (ya existe el patrón en ButcherHub)
   - Al recibir datos nuevos: animación sutil de fade-in en los KPIs que cambiaron

2. **SSE para alertas:**
   - Suscribirse al canal SSE del usuario para recibir alertas en tiempo real
   - Al recibir una alerta de carnicería: actualizar el badge del panel de alertas
   - Mostrar toast/notification breve cuando llega una alerta nueva

3. **Indicador de última actualización:**
   - Texto "Actualizado hace X segundos/minutos" junto al badge "En vivo"
   - Al hacer click: forzar recarga inmediata de datos
   - Spinner de recarga mientras se procesan los datos

4. **Optimización de re-renders:**
   - Comparar datos nuevos con los anteriores antes de actualizar el estado (evitar re-render si no cambió nada)
   - Usar `useMemo` para cálculos derivados
   - Cancelar peticiones pendientes al cambiar de filtro/pestaña (`AbortController`)

#### Criterios de aceptación

- [x] Los KPIs se actualizan cada 30s cuando la página está visible *(polling con `setInterval` + `document.hidden`)*
- [x] El polling reduce a 5min cuando el navegador está en segundo plano
- [ ] El indicador "En vivo" muestra el estado correcto (activo/pausa)
- [ ] Las alertas SSE llegan en tiempo real y actualizan el panel *(no hay suscripción SSE en la página)*
- [ ] La animación de actualización es sutil (no distrae)
- [x] Las peticiones se cancelan correctamente al cambiar filtros rápido *(`AbortSignal` en todas las funciones del API client)*
- [ ] No hay memory leaks al desmontar el componente

---

### TICKET IC-11: Entrada en sidebar y ruta de navegación

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica (necesaria para descubrir la página)  
**Dependencias:** Ninguna (puede hacerse en paralelo con IC-01/IC-02)  
**Archivos:** `src/app/components/saas/Sidebar.tsx`, `src/app/routes.tsx`, `src/app/lib/i18n.ts`

#### Contexto

La página de informes necesita ser accesible desde la barra lateral y tener su ruta registrada en el router. Actualmente el grupo `butcherShop` en el sidebar tiene 9 ítems pero no incluye "Informes".

#### Cambios requeridos

1. **Sidebar.tsx — Nuevo ítem de navegación:**
   - Añadir entrada:
     ```tsx
     { id: 'butcher-reports', navKey: 'butcherReports', icon: <BarChart3 className="w-5 h-5" />, path: '/saas/vertical/carniceria/informes' }
     ```
   - Posición: añadir al array de ítems del vertical carnicería, después de `butcher-waste`
   - Añadir `'butcher-reports'` al array `itemIds` del grupo `butcherShop`

2. **routes.tsx — Nueva ruta:**
   ```tsx
   { path: 'vertical/carniceria/informes', Component: ButcherReports },
   ```
   - Añadir import del componente (lazy)
   - Posición: junto a las otras rutas `vertical/carniceria/*`

3. **i18n.ts — Nuevas claves:**
   - ES: `butcherReports: 'Informes'`
   - EN: `butcherReports: 'Reports'`
   - PT: `butcherReports: 'Relatórios'`
   - FR: `butcherReports: 'Rapports'`
   - IT: `butcherReports: 'Report'`

4. **ButcherHub.tsx — Acceso rápido:**
   - Añadir en `quickAccess[]`:
     ```tsx
     { label: 'Informes', icon: <BarChart3 className="w-5 h-5" />, route: '/saas/vertical/carniceria/informes', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' }
     ```
   - Posición: reemplazar el ítem "Dashboard" actual (último de la lista) o añadir como penúltimo

#### Criterios de aceptación

- [ ] El ítem "Informes" aparece en el sidebar dentro del grupo carnicería *(no existe en `Sidebar.tsx`)*
- [ ] La ruta `/saas/vertical/carniceria/informes` carga el componente correctamente *(en `routes.tsx` es un `<Navigate to="/saas/reports" />` — NO carga `ButcherReports`)*
- [x] El icono es `BarChart3` consistente con el patrón de informes existente *(en el acceso rápido de ButcherHub)*
- [x] Las claves i18n están en los 5 idiomas
- [ ] El acceso rápido desde ButcherHub navega correctamente *(existe el ítem, pero acaba en `/saas/reports` genérico por la redirección)*

---

## Resumen de priorización

| Orden | Ticket | Tipo | Prioridad | Bloquea |
|---|---|---|---|---|
| 1 | **IC-11** Sidebar + ruta | Frontend | Crítica | — |
| 2 | **IC-01** Modelos CouchDB | Backend | Crítica | IC-02, IC-08, IC-09 |
| 3 | **IC-02** API Reporting | Backend | Crítica | IC-03, IC-05, IC-10 |
| 4 | **IC-03** Página principal | Frontend | Crítica | IC-04, IC-05, IC-06, IC-07 |
| 5 | **IC-09** Permisos por rol | Full-stack | Alta | — |
| 6 | **IC-08** Alertas backend | Backend | Alta | — |
| 7 | **IC-04** Filtros avanzados | Frontend | Alta | — |
| 8 | **IC-05** Evolución cat./tienda | Full-stack | Alta | — |
| 9 | **IC-06** Exportación | Frontend | Media | — |
| 10 | **IC-07** Navegación cruzada | Frontend | Media | — |
| 11 | **IC-10** Tiempo real | Full-stack | Media | — |

**Estimación total:** ~11 tickets, ~3-4 sprints

---

## Mapa de conexiones

```
                    ┌─────────────┐
                    │  INFORMES   │
                    │/carniceria/ │
                    │  informes   │
                    └──────┬──────┘
                           │
          ┌────────┬───────┼───────┬────────┬─────────┐
          ▼        ▼       ▼       ▼        ▼         ▼
    ┌──────────┐ ┌─────┐ ┌─────┐ ┌──────┐ ┌───────┐ ┌──────────┐
    │Dashboard │ │ TPV │ │Stock│ │Compra│ │Finanz.│ │Trabajad. │
    │ButcherHub│ │     │ │Inv. │ │Provee│ │       │ │Clockins  │
    └──────────┘ └─────┘ └─────┘ └──────┘ └───────┘ └──────────┘
         ▲          │       │        │        │          │
         │          ▼       ▼        ▼        ▼          ▼
         │     ┌────────────────────────────────────────────┐
         └─────│              CouchDB (butcher DB)          │
               │  butcher_sale | butcher_waste | butcher_   │
               │  purchase | butcher_product | butcher_store│
               └────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Alert Engine│
                    │  (SSE/Push) │
                    └─────────────┘
```

## Diseño visual de referencia

La página debe seguir el lenguaje visual de **ButcherHub** (la mejor referencia del proyecto para carnicería):

- **Colores primarios:** Rojo `#dc2626` como acento de carnicería, gris neutro para fondos
- **Cards:** `bg-white dark:bg-gray-800`, `border-2 border-gray-200 dark:border-gray-700`, `rounded-2xl`
- **KPI Cards:** Icono en cuadrado redondeado con fondo semitransparente, valor en `text-2xl font-black`, trend con flecha + porcentaje
- **Gráficas:** Fondo limpio sin ejes densos, tooltips con fondo `bg-gray-900 text-white rounded-lg`, colores vivos pero armónicos
- **Tablas:** Rayas zebra sutiles (`hover:bg-gray-50/30`), bordes finos, header con `text-xs font-semibold text-gray-500 uppercase`
- **Dark mode:** Completo en todos los elementos
- **Responsive:** Mobile-first, KPIs en grid 2 cols mobile → 3/6 cols desktop
