# CENTRO OPERATIVO DELIVERY / RESTAURANTE — Diseño de Tickets

**Página:** `/saas/vertical/delivery`  
**Objetivo:** Concentrar en una sola pantalla la operativa diaria de delivery y restaurante.

---

## Estado auditado (08/07/2026)

~85% implementado (este ticket no usa checkboxes; auditoría por bloques). Hecho: DL-01 (`delivery_config` + CRUD en `deliveryRouter`), DL-02 (`salesPointId`/`salesPointName` en pedidos), DL-03 (`GET /api/delivery/ops-center/:userId` con filtros PDV/canal/franja/fecha), DL-04 (eventos SSE `delivery:order_created`/`order_status_changed`/`incident_*` + motor `deliveryAlertEngine.js`), DL-05/06/07 (página `DeliveryOpsCenter.tsx` con FiltersBar, Pipeline clicable y SSE + fallback), DL-09 a DL-16 (widgets de alertas, métricas, cocina, montaje, reparto, caja, incidencias y mesas). Desviaciones: la ruta final es `/saas/delivery-ops` (no `/saas/vertical/delivery`); el motor de alertas es por eventos + barrido cada 15 min (no polling 60s); no hay filtro por sede/`workCenterId` en el endpoint. DL-18 se implementó distinto: los trabajadores reciben 403 en ops-center y se les redirige a sus páginas operativas (cocina/TPV/reparto), no una vista limitada del centro.

---

## Estado actual del sistema

### Ya implementado (backend + frontend)

**Backend (API + datos CouchDB):**
- **Pedidos delivery** (`delivery_order`): CRUD completo en `deliveryController.js` + `deliveryApi.ts`. Estados: `pending → preparing → kitchen → assembly → delivery → delivered | cancelled | incident`. Campos de timestamps por fase (`kitchenStartedAt`, `kitchenCompletedAt`, `assemblyStartedAt`, `assemblyCompletedAt`). Stage history con trazabilidad de usuario.
- **Catálogo** (`catalog_item`): CRUD completo con `stockQuantity`, `minStock`, precios, alérgenos, imágenes, canales de venta, vinculación proveedor.
- **Puntos de venta** (`point_of_sale`): CRUD con terminales, datáfonos, impresoras. Relación con sesiones TPV.
- **Sesiones de caja TPV** (`tpv_register_session`): Apertura/cierre, conteo de denominaciones, transacciones, resumen por método de pago.
- **Sesiones de caja repartidor** (`driver_cash_session`): Apertura/cierre, fondo inicial, transacciones de cobro/gasto/ajuste.
- **Proveedores** (`supplier`): CRUD completo.
- **Facturas de compra** (`purchase_invoice`): CRUD, OCR, vínculo con PO.
- **SSE global**: `sseService.js` con `broadcastToUser` y `broadcastToBusiness`. Hook `useSSE.ts` en cliente.
- **Alertas**: Motor en `alertEngine.js` con alertas `low_stock`, `out_of_stock`, facturas vencidas. Dashboard alerts (`DashboardAlert[]`).
- **Centros de trabajo**: `WorkCenter` con `centerType` (oficina, `punto_de_venta`, almacén). API `workCentersApi.ts` y hook `useWorkCenters`.
- **Dashboard KPIs**: Endpoint `/api/dashboard/kpis/:userId` con datos agregados.

**Frontend (`/saas/delivery` — `Delivery.tsx`, ~2157 líneas):**
- Página monolítica con 8 tabs: Pedidos, Cocina, Montaje, Reparto, Caja, Puntos de Venta, Incidencias, Historial.
- KPIs por estado (pendientes, cocina, montaje, reparto, entregados, incidencias) — solo conteos.
- Wizard de creación de pedido (5 pasos): cliente, tipo, productos, pago, confirmación.
- Drawer de detalle de pedido con historial de fases.
- Gestión de incidencias: reportar y resolver con tipo y notas.
- Asignación de repartidor a pedidos.
- Registro de cobro con método de pago.
- Tab Cocina: tarjetas por pedido con tiempo transcurrido y botón "Listo para montaje".
- Tab Montaje: checklist configurable (bolsa, platos, bebidas, complementos, etc.) con botón "Listo para reparto".
- Tab Reparto: lista de pedidos en camino con repartidor y tiempo estimado.
- Tab Caja repartidor: apertura/cierre de sesiones, transacciones, diferencia de caja.
- Tab PDV: CRUD de puntos de venta con terminales.
- Tab Incidencias: lista filtrada de pedidos con `status: 'incident'`.
- Tab Historial: pedidos entregados/cancelados.

**Módulo legacy (`src-delivery/`, ~343 archivos, NO integrado):**
- Componentes avanzados paralelos: `CocinaTabNew`, `RepartoTabNew`, `PedidosTab`, `MontajeTab`, `IncidenciasTab`, `HistorialTab`.
- `OperativaDinamica.tsx`: Sistema de tabs dinámicos por tipo de negocio (delivery, taller, PDV/retail, etc.).
- `DashboardResponsive.tsx`: Dashboard con gráficos Recharts, KPIs financieros, rankings top 10, alertas, pedidos activos por hora.
- Secciones de CRM, Finanzas, Equipo, Informes, Presupuestos, Facturas.
- Datos mock extensos (`mockData.ts`).

### Páginas frontend existentes relacionadas
- `/saas/delivery` — Página monolítica actual (`Delivery.tsx`)
- `/saas/delivery-catalog` — Todo-en-uno catálogo delivery (`DeliveryCatalog.tsx`)
- `/saas/tpv` — Página TPV con selección de PDV y terminales
- `/saas/tpv-mode` — Modo TPV completo con provider
- `/saas/tpv/punto/:salesPointId` — TPV por punto de venta
- `/saas/catalog` — Catálogo de venta
- `/saas/articles` — Stock de artículos
- `/saas/orders` — Facturas de compra
- `/saas/dashboard` — Dashboard general con widget "Operativa del negocio"

### Brechas detectadas

1. **No hay "centro operativo"** — La página `/saas/delivery` es una gestión de pedidos, no un dashboard operativo. No ofrece visión panorámica de toda la operativa del día.
2. **No hay actualización en tiempo real** — Los pedidos se cargan una vez al montar y no se refrescan. No se usan SSE ni polling para delivery.
3. **No hay filtros por sede, PDV, canal ni franja horaria** — La página muestra todos los pedidos del usuario sin posibilidad de segmentar.
4. **No hay soporte multi-PDV real** — Aunque existen puntos de venta, los pedidos no se filtran por PDV. El `salesPointId` en `DeliveryOrder` no existe todavía.
5. **No hay concepto de "sala" ni mesas** — No existe entidad `table` ni `room`; si el negocio tiene mesas físicas (restaurante con comedor), no hay forma de gestionarlas.
6. **No hay métricas rápidas** — No se muestra facturación del día, ticket medio, tiempo medio de preparación, ni otras métricas operativas en contexto.
7. **No hay alertas operativas** — No hay alertas de pedidos retrasados, cocina saturada, caja pendiente de cierre, stock crítico integradas en la operativa.
8. **No hay diferenciación gerente/trabajador** — Todos ven lo mismo; no hay perfil limitado para trabajadores.
9. **No hay widget dinámico según capacidades** — No se adapta según si el negocio tiene mesas, reparto propio, o solo trabaja con plataformas.
10. **No hay accesos rápidos** — No hay panel de navegación rápida a TPV, Cocina, Montaje, Sala, Reparto, Caja desde la pantalla operativa.
11. **El pedido no tiene `salesPointId`** — No se puede vincular un pedido a un PDV concreto.
12. **No hay entidad para la configuración de delivery del negocio** — No existe un documento que indique si el negocio tiene mesas, reparto propio, plataformas externas, etc.

---

## TICKETS

---

### TICKET DL-01: Modelo de datos — Configuración de delivery del negocio

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Crear o extender la configuración del negocio para almacenar las capacidades de delivery/restaurante. Esta configuración determina qué widgets y funcionalidades mostrar en el centro operativo.

**Tareas:**

1. **Añadir campo `deliveryConfig` a la entidad de negocio (o crear documento `delivery_config` en CouchDB):**
   ```json
   {
     "type": "delivery_config",
     "user_id": "...",
     "hasDineIn": true,
     "hasTakeaway": true,
     "hasOwnDelivery": true,
     "hasPlatformDelivery": true,
     "platforms": ["Glovo", "Uber Eats", "Just Eat"],
     "hasPhysicalTables": true,
     "tableCount": 20,
     "hasKitchen": true,
     "hasAssemblyStation": true,
     "hasCashRegister": true,
     "defaultPrepTime": 20,
     "maxKitchenCapacity": 15,
     "delayThresholdMinutes": 30,
     "kitchenSaturationThreshold": 10,
     "cashCloseReminder": true,
     "cashCloseReminderTime": "23:00",
     "activeChannels": ["direct", "phone", "web", "app", "glovo", "uber_eats", "just_eat"],
     "activeTimeSlots": [
       { "id": "lunch", "label": "Comida", "start": "12:00", "end": "16:00" },
       { "id": "dinner", "label": "Cena", "start": "19:00", "end": "23:30" }
     ],
     "createdAt": "...",
     "updatedAt": "..."
   }
   ```

2. **CRUD en `deliveryController.js`:**
   - `getDeliveryConfig(userId)` — Obtener configuración (crear con defaults si no existe)
   - `updateDeliveryConfig(userId, data)` — Actualizar configuración

3. **Router:**
   - `GET /api/delivery/config/:userId` — Obtener
   - `PUT /api/delivery/config/:userId` — Actualizar
   - Montar en rutas existentes de delivery

4. **Cliente TypeScript — Añadir a `deliveryApi.ts`:**
   - Tipo `DeliveryConfig`
   - Funciones `getDeliveryConfigRequest(userId)`, `updateDeliveryConfigRequest(userId, data)`

**Criterios de aceptación:**
- La configuración se crea con defaults sensatos al primer acceso
- Se puede activar/desactivar cada capacidad
- Los umbrales de alertas son configurables
- Las franjas horarias y canales activos son editables

---

### TICKET DL-02: Modelo de datos — Añadir `salesPointId` a pedidos delivery

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Los pedidos delivery (`delivery_order`) no tienen campo `salesPointId` ni `salesPointName`. Esto impide filtrar pedidos por punto de venta, que es esencial para el soporte multi-PDV.

**Tareas:**

1. **Añadir campos a `delivery_order` en `deliveryController.js`:**
   - `salesPointId` (string, opcional — vacío si no aplica)
   - `salesPointName` (string, denormalizado)
   - Actualizar `buildDeliveryOrderDocument` / sanitización

2. **Actualizar `DeliveryOrder` en `deliveryApi.ts`:**
   - Añadir `salesPointId?: string` y `salesPointName?: string` a la interfaz

3. **Actualizar endpoint de listado:**
   - `GET /api/delivery/orders/:userId?salesPointId=X` — Filtro opcional por PDV

4. **Migración suave:**
   - Los pedidos existentes sin `salesPointId` se tratan como "sin PDV asignado"
   - En la UI: se pueden filtrar como "Todos" o "Sin PDV"

5. **Actualizar wizard de creación (`CreateOrderModal`):**
   - Si hay más de 1 PDV activo, añadir selector de PDV en el paso 2 (Tipo) del wizard

**Criterios de aceptación:**
- Los pedidos nuevos pueden tener un PDV asignado
- El listado soporta filtro por `salesPointId`
- Los pedidos existentes sin PDV no se rompen
- El wizard de creación incluye selector de PDV cuando hay múltiples

---

### TICKET DL-03: Backend — Endpoint de datos operativos agregados

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** DL-01, DL-02  

**Descripción:**  
Crear un endpoint que devuelva todos los datos necesarios para el centro operativo en una sola llamada, con soporte de filtros. Actualmente la página de delivery hace múltiples llamadas independientes (`listDeliveryOrdersRequest`, `listCatalogItemsRequest`, `listDriverCashSessionsRequest`, `listPointsOfSaleRequest`) sin filtros.

**Tareas:**

1. **Crear endpoint `GET /api/delivery/ops-center/:userId`:**
   - **Query params (filtros):**
     - `salesPointId` — Filtrar por PDV (opcional, default: todos)
     - `workCenterId` — Filtrar por sede/centro de trabajo (opcional, default: todos)
     - `channel` — Filtrar por canal (opcional, default: todos)
     - `timeSlot` — Filtrar por franja horaria (opcional, `lunch`, `dinner`, o `custom:HH:MM-HH:MM`)
     - `date` — Fecha operativa (opcional, default: hoy). Formato: `YYYY-MM-DD`
   - **Response:**
     ```json
     {
       "ok": true,
       "date": "2026-04-14",
       "filters": { "salesPointId": null, "workCenterId": null, "channel": null, "timeSlot": null },
       "config": { /* DeliveryConfig completo */ },
       "kpis": {
         "totalOrders": 47,
         "byStatus": {
           "pending": 5,
           "preparing": 3,
           "kitchen": 8,
           "assembly": 2,
           "delivery": 6,
           "delivered": 21,
           "cancelled": 1,
           "incident": 1
         },
         "revenue": 2340.50,
         "averageTicket": 49.79,
         "avgPrepTimeMinutes": 18.5,
         "avgDeliveryTimeMinutes": 32.1,
         "deliveredOnTime": 18,
         "deliveredLate": 3,
         "onTimePercentage": 85.7
       },
       "activeOrders": [ /* delivery_order[] con status != delivered/cancelled, ordenados por createdAt */ ],
       "alerts": [
         { "id": "alert_1", "type": "delayed_order", "severity": "warning", "title": "Pedido #142 retrasado", "message": "35 min en cocina (umbral: 30 min)", "orderId": "...", "route": "/saas/delivery?tab=kitchen", "createdAt": "..." },
         { "id": "alert_2", "type": "kitchen_saturated", "severity": "critical", "title": "Cocina saturada", "message": "10 pedidos en cocina (umbral: 10)", "route": "/saas/delivery?tab=kitchen", "createdAt": "..." },
         { "id": "alert_3", "type": "cash_pending_close", "severity": "warning", "title": "Caja pendiente de cierre", "message": "Terminal T1 — PDV Centro abierta desde las 09:00", "sessionId": "...", "route": "/saas/delivery?tab=cash", "createdAt": "..." },
         { "id": "alert_4", "type": "critical_stock", "severity": "critical", "title": "Stock crítico: Harina", "message": "2 kg restantes (mínimo: 10 kg)", "itemId": "...", "route": "/saas/articles", "createdAt": "..." },
         { "id": "alert_5", "type": "open_incident", "severity": "warning", "title": "1 incidencia abierta", "message": "Pedido #138 — Dirección incorrecta", "orderId": "...", "route": "/saas/delivery?tab=incidents", "createdAt": "..." }
       ],
       "cashStatus": {
         "openSessions": [ /* TpvRegisterSession[] con status open */ ],
         "totalCashInRegisters": 1250.00,
         "pendingClose": 1
       },
       "kitchenStatus": {
         "ordersInKitchen": 8,
         "capacity": 15,
         "saturationPercent": 53.3,
         "oldestOrderMinutes": 22,
         "avgWaitMinutes": 12.3
       },
       "deliveryStatus": {
         "ordersInDelivery": 6,
         "driversActive": 3,
         "avgDeliveryMinutes": 28.5,
         "delayedCount": 1
       },
       "revenueByChannel": {
         "direct": 890.00,
         "phone": 320.50,
         "web": 540.00,
         "app": 210.00,
         "glovo": 180.00,
         "uber_eats": 200.00
       },
       "revenueByHour": [
         { "hour": "12:00", "revenue": 320.00, "orders": 8 },
         { "hour": "13:00", "revenue": 580.00, "orders": 12 }
       ],
       "pointsOfSale": [ /* PointOfSale[] activos */ ],
       "workCenters": [ /* WorkCenter[] del negocio */ ]
     }
     ```

2. **Lógica del endpoint en `deliveryController.js`:**
   - Obtener configuración delivery (DL-01)
   - Listar pedidos del día con filtros aplicados
   - Calcular KPIs a partir de los pedidos
   - Obtener sesiones de caja abiertas (filtrando por PDV si aplica)
   - Obtener alertas operativas (ver DL-09)
   - Obtener stock crítico cruzando con catálogo
   - Calcular métricas de cocina y reparto
   - Agregar facturación por canal y por hora

3. **Optimización:**
   - Usar vistas CouchDB (`_design/delivery/_view/orders_by_date_status`) para no escanear todos los documentos
   - Cachear configuración delivery en memoria (invalidar con `_changes`)
   - Tiempo de respuesta objetivo: < 500ms

**Criterios de aceptación:**
- Un solo endpoint devuelve todo lo necesario para el centro operativo
- Los filtros (PDV, sede, canal, franja) funcionan correctamente
- Los KPIs se calculan en tiempo real sobre los pedidos del día
- Las alertas se generan dinámicamente según umbrales configurados (DL-01)
- Response time < 500ms con 200 pedidos del día

---

### TICKET DL-04: Backend — Eventos SSE para operativa delivery en tiempo real

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Implementar eventos SSE específicos para la operativa de delivery, de forma que el centro operativo se actualice en tiempo real sin polling. El sistema SSE ya existe (`sseService.js`, `broadcastToBusiness`), pero no emite eventos de delivery.

**Tareas:**

1. **Definir eventos SSE de delivery en `sseService.js`:**
   - `delivery:order_created` — Nuevo pedido creado
   - `delivery:order_status_changed` — Cambio de estado de un pedido (incluye `orderId`, `oldStatus`, `newStatus`, `updatedBy`)
   - `delivery:order_assigned` — Repartidor asignado
   - `delivery:incident_reported` — Incidencia reportada
   - `delivery:incident_resolved` — Incidencia resuelta
   - `delivery:cash_session_opened` — Sesión de caja abierta
   - `delivery:cash_session_closed` — Sesión de caja cerrada
   - `delivery:alert_triggered` — Nueva alerta operativa (pedido retrasado, cocina saturada, etc.)

2. **Emitir eventos desde `deliveryController.js`:**
   - En cada operación de escritura (create, update, delete de pedidos), llamar a `broadcastToBusiness(businessId, eventType, payload)`
   - Incluir en el payload los datos mínimos para actualizar la UI sin nueva request:
     ```json
     {
       "event": "delivery:order_status_changed",
       "data": {
         "orderId": "...",
         "orderNumber": "#142",
         "oldStatus": "kitchen",
         "newStatus": "assembly",
         "salesPointId": "pdv_001",
         "updatedBy": "María López",
         "timestamp": "2026-04-14T14:32:00Z"
       }
     }
     ```

3. **Motor de alertas periódico (cada 60 segundos) en el servidor:**
   - Revisar pedidos activos y detectar:
     - Pedidos con más de `delayThresholdMinutes` en cualquier fase → `delivery:alert_triggered` tipo `delayed_order`
     - Pedidos en cocina > `kitchenSaturationThreshold` → `delivery:alert_triggered` tipo `kitchen_saturated`
   - Revisar sesiones de caja abiertas pasada la hora de cierre → `delivery:alert_triggered` tipo `cash_pending_close`
   - Revisar stock crítico de ítems activos del catálogo → `delivery:alert_triggered` tipo `critical_stock`
   - Deduplicar: no reenviar la misma alerta si ya se envió en los últimos 5 minutos

4. **Cliente — Crear hook `useDeliverySSE` en `src/app/hooks/`:**
   - Suscribirse a los eventos `delivery:*` usando `useSSE` existente
   - Exponer callbacks: `onOrderCreated`, `onStatusChanged`, `onAlertTriggered`, etc.
   - Incluir reconexión automática y estado de conexión (`connected` / `reconnecting` / `disconnected`)

**Criterios de aceptación:**
- Los cambios en pedidos se reflejan en < 2 segundos en otros clientes conectados
- Las alertas periódicas se emiten cada 60 segundos si hay condiciones activas
- El hook de cliente gestiona reconexión automática
- No se duplican alertas en ventanas de 5 minutos
- El indicador de conexión es visible en la UI

---

### TICKET DL-05: Frontend — Shell de la página y routing

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** DL-03  

**Descripción:**  
Crear el componente de la página del centro operativo y registrarlo en el router. Esta página será el "hub" principal para la operativa diaria.

**Tareas:**

1. **Crear `src/app/pages/saas/DeliveryOpsCenter.tsx`:**
   - Estructura general:
     ```
     ┌─────────────────────────────────────────────────────────┐
     │ HEADER: "Centro Operativo" + indicador tiempo real      │
     │ + indicador de sede/PDV activo + fecha operativa        │
     ├─────────────────────────────────────────────────────────┤
     │ BARRA DE FILTROS (DL-06)                                │
     ├─────────────────────────────────────────────────────────┤
     │ ALERTAS ACTIVAS (banner colapsable)                     │
     ├─────────────────────────────────────────────────────────┤
     │ PIPELINE DE ESTADOS (DL-07)                             │
     ├──────────────────────┬──────────────────────────────────┤
     │ ACCESOS RÁPIDOS      │ MÉTRICAS RÁPIDAS (DL-10)        │
     │ (DL-08)              │                                  │
     ├──────────────────────┴──────────────────────────────────┤
     │ WIDGETS OPERATIVOS (grid responsive 2-3 cols)           │
     │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
     │ │ Cocina      │ │ Montaje     │ │ Sala/Mesas* │       │
     │ │ (DL-11)     │ │ (DL-12)     │ │ (DL-13)     │       │
     │ ├─────────────┤ ├─────────────┤ ├─────────────┤       │
     │ │ Reparto     │ │ Caja        │ │ Incidencias │       │
     │ │ (DL-14)     │ │ (DL-15)     │ │ (DL-16)     │       │
     │ └─────────────┘ └─────────────┘ └─────────────┘       │
     └─────────────────────────────────────────────────────────┘
     * Solo si hasPhysicalTables = true
     ```
   - Usar `Layout` de `components/saas/Layout.tsx` con `title="Centro Operativo"` y `subtitle` dinámico según sede/PDV
   - Dark mode compatible (patrón `dark:bg-gray-XXX` como en el resto del proyecto)
   - Responsive: en móvil, los widgets pasan a 1 columna; los accesos rápidos se convierten en scroll horizontal

2. **Estado global de la página:**
   - `filters`: { `salesPointId`, `workCenterId`, `channel`, `timeSlot`, `date` }
   - `opsData`: Respuesta completa de `GET /api/delivery/ops-center/:userId` (DL-03)
   - `loading` / `error` / `lastUpdated`
   - `sseConnected`: boolean indicando estado de conexión SSE
   - Polling de respaldo: cada 30 segundos re-fetch de los datos como fallback de SSE

3. **Lógica de carga:**
   - Al montar: fetch de `/api/delivery/ops-center/:userId` con filtros
   - Al cambiar filtro: re-fetch con debounce de 300ms
   - Al recibir evento SSE: actualizar optimistamente el estado local (ej: mover pedido de status, actualizar conteo)
   - Re-fetch completo cada 5 minutos para garantizar consistencia

4. **Registrar en `routes.tsx`:**
   - Importar `DeliveryOpsCenter` con lazy loading
   - Ruta: `{ path: 'vertical/delivery', Component: DeliveryOpsCenter }` dentro de `saas` children
   - Mantener ruta existente `/saas/delivery` → `Delivery.tsx` sin cambios (coexisten)

5. **Actualizar `Sidebar.tsx`:**
   - Para el vertical `delivery`: añadir entrada "Centro Operativo" como primer ítem del menú, con icono `LayoutDashboard` o `Activity`, ruta `/saas/vertical/delivery`
   - Distinguir visualmente (icono destacado o badge "Ops") de las demás entradas

**Criterios de aceptación:**
- La página carga en `/saas/vertical/delivery` dentro del SPA
- Se muestra correctamente en desktop, tablet y móvil
- Dark mode funcional
- El indicador de tiempo real muestra "En vivo" (verde) o "Reconectando" (amarillo) o "Sin conexión" (rojo)
- La fecha operativa se muestra y se puede cambiar (para revisar días anteriores)
- Los filtros persisten en la URL como query params (`?pdv=X&channel=Y`)
- Polling de respaldo funcional cuando SSE se desconecta

---

### TICKET DL-06: Frontend — Barra de filtros operativos

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05  

**Descripción:**  
Crear el componente de filtros que aparece debajo del header del centro operativo. Permite segmentar la vista por sede, punto de venta, canal de pedido y franja horaria.

**Tareas:**

1. **Crear componente `DeliveryOpsFilters` dentro de `DeliveryOpsCenter.tsx` (o extraer a archivo aparte si la página crece):**
   - **Diseño:** Barra horizontal con selects estilizados como pills/chips y un selector de fecha
   - **Filtros:**
     - **Sede / Centro de trabajo** — `<select>` con opciones de `useWorkCenters()`. Si solo hay 1 sede, ocultar este filtro. Opción "Todas las sedes".
     - **Punto de venta (PDV)** — `<select>` con opciones de `pointsOfSale[]` devueltos por el endpoint ops-center. Filtrado cascada: al seleccionar sede, solo mostrar PDVs de esa sede. Opción "Todos los PDV".
     - **Canal** — `<select>` multi o pills toggle con los canales activos de `deliveryConfig.activeChannels`. Mostrar etiqueta legible: Directo, Teléfono, Web, App, Glovo, Uber Eats, Just Eat, etc. Opción "Todos los canales".
     - **Franja horaria** — Pills toggle con franjas definidas en `deliveryConfig.activeTimeSlots` + opción "Todo el día". Al seleccionar una franja, solo muestra pedidos creados en ese rango horario.
     - **Fecha operativa** — Datepicker que por defecto muestra "Hoy" con botones rápidos "Ayer" / flecha izquierda/derecha. Formato: `dd/MM/yyyy`.
   - **Botón "Limpiar filtros":** Resetea todos a "Todos" / "Hoy"
   - **Responsive:** En móvil, la barra se convierte en un botón "Filtros (N activos)" que abre un sheet/drawer con todos los filtros apilados verticalmente

2. **Persistencia de filtros:**
   - Guardar filtros activos en `localStorage` con key `vertial_delivery_ops_filters:${userId}:${businessId}`
   - Reflejar filtros en URL query params para deep linking: `?pdv=pdv_001&channel=glovo&slot=lunch&date=2026-04-14`
   - Al entrar con query params, priorizar sobre localStorage

3. **Comportamiento cascada:**
   - Al cambiar sede → resetear PDV a "Todos"
   - Al cambiar PDV → no resetear canal ni franja
   - Al limpiar filtros → resetear todo

**Criterios de aceptación:**
- Los filtros se muestran inline en desktop y en drawer en móvil
- Filtro cascada sede → PDV funciona correctamente
- Los filtros se persisten en localStorage y URL
- El conteo de filtros activos es visible en el botón móvil
- Cambiar cualquier filtro re-fetcha los datos operativos (debounce 300ms)
- Si solo hay 1 sede o 1 PDV, ese filtro se oculta automáticamente

---

### TICKET DL-07: Frontend — Pipeline de estados con conteos automáticos

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** DL-05  

**Descripción:**  
Mostrar un pipeline visual horizontal con las fases del flujo de pedidos y sus conteos. Sirve como resumen rápido y como filtro: al hacer clic en una fase, la vista de pedidos se filtra a ese estado.

**Tareas:**

1. **Diseño del pipeline:**
   ```
   [Pendientes: 5] → [Preparando: 3] → [Cocina: 8] → [Montaje: 2] → [Reparto: 6] → [Entregados: 21]
       amber           blue             orange          indigo          cyan            green
   ```
   - Cada fase es un bloque/chip con:
     - Icono del estado (Clock, ChefHat, Package, Truck, CheckCircle2)
     - Nombre de la fase
     - Conteo numérico grande y bold
     - Color de fondo según `STATUS_CONFIG` existente
     - Flechas o conectores entre fases
   - **Estado activo:** Al hacer clic en una fase, se resalta (borde más grueso, sombra) y filtra los widgets de abajo para ese estado
   - **Fase "Incidencias"** se muestra separada a la derecha con estilo `danger` (rojo) y el conteo
   - **Fase "Cancelados"** se muestra como texto small debajo, sin protagonismo

2. **Animación de conteos:**
   - Cuando un conteo cambia (vía SSE), animar brevemente el número (scale up + color flash)
   - Si un conteo pasa de 0 a >0, añadir pulse sutil para llamar la atención

3. **Responsive:**
   - En desktop: horizontal con flechas entre fases
   - En tablet: horizontal con scroll si no caben
   - En móvil: grid 3×2 compacto sin flechas

4. **Datos:** Usar `opsData.kpis.byStatus` del endpoint DL-03

**Criterios de aceptación:**
- Los 6 estados activos se muestran con conteos correctos
- Los conteos se actualizan en tiempo real vía SSE
- Clic en una fase filtra la vista inferior
- Doble clic o clic en fase ya activa deselecciona el filtro (muestra todos)
- Animación sutil al cambiar conteos
- Incidencias separadas visualmente con rojo

---

### TICKET DL-08: Frontend — Panel de accesos rápidos

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-01  

**Descripción:**  
Panel de botones/tarjetas que dan acceso directo a las secciones operativas del negocio. Los accesos visibles dependen de la configuración de delivery del negocio (DL-01).

**Tareas:**

1. **Diseño:** Grid de tarjetas compactas (tipo `getQuickAccessItems` del Dashboard existente):
   - Cada tarjeta: icono grande + nombre + badge con conteo/estado
   - **Accesos fijos:**
     - **TPV** → `/saas/tpv` — Icono: `Monitor`. Badge: sesiones abiertas
     - **Pedidos** → `/saas/delivery` — Icono: `ShoppingBag`. Badge: pedidos activos
     - **Cocina** → `/saas/delivery?tab=kitchen` o sección inline — Icono: `ChefHat`. Badge: pedidos en cocina
     - **Montaje** → `/saas/delivery?tab=assembly` — Icono: `Package`. Badge: pedidos en montaje
     - **Caja** → `/saas/delivery?tab=driverCash` — Icono: `Wallet`. Badge: sesiones abiertas + badge rojo si pendiente cierre
     - **Incidencias** → `/saas/delivery?tab=incidents` — Icono: `AlertTriangle`. Badge rojo: incidencias abiertas
   - **Accesos condicionales (según `deliveryConfig`):**
     - **Sala / Mesas** → futuro `/saas/sala` — Solo si `hasPhysicalTables: true`. Icono: `Armchair`. Badge: mesas ocupadas / total
     - **Reparto** → `/saas/delivery?tab=delivery` — Solo si `hasOwnDelivery: true`. Icono: `Truck`. Badge: pedidos en reparto
   - **Accesos complementarios:**
     - **Catálogo** → `/saas/catalog` — Icono: `BookOpen`
     - **Stock** → `/saas/articles` — Icono: `Boxes`. Badge rojo si stock crítico > 0
     - **CRM / Clientes** → `/saas/crm/clientes` — Icono: `Users`
     - **Finanzas** → `/saas/finance` — Icono: `Euro`

2. **Comportamiento:**
   - Clic navega a la ruta correspondiente
   - Long-press o hover muestra tooltip con info adicional (ej: "3 pedidos en cocina, 1 retrasado")
   - Los badges se actualizan en tiempo real

3. **Responsive:**
   - Desktop: grid 4-6 columnas
   - Tablet: grid 3-4 columnas
   - Móvil: scroll horizontal de tarjetas

**Criterios de aceptación:**
- Los accesos visibles dependen de `deliveryConfig`
- Cada acceso tiene badge con conteo en tiempo real
- Los badges rojos solo aparecen cuando hay alertas (incidencias, stock crítico, caja pendiente)
- La navegación funciona correctamente
- En móvil, el scroll horizontal es fluido

---

### TICKET DL-09: Frontend — Widget de alertas operativas

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** DL-03, DL-04  

**Descripción:**  
Banner/panel colapsable en la parte superior del centro operativo que muestra alertas activas en tiempo real. Las alertas se calculan en el endpoint (DL-03) y se actualizan vía SSE (DL-04).

**Tareas:**

1. **Tipos de alertas y diseño visual:**

   | Tipo | Icono | Color | Ejemplo de mensaje |
   |------|-------|-------|--------------------|
   | `delayed_order` | `Timer` | amber/warning | "Pedido #142 lleva 35 min en cocina (umbral: 30 min)" |
   | `kitchen_saturated` | `ChefHat` | red/critical | "Cocina saturada: 12/10 pedidos (capacidad superada)" |
   | `cash_pending_close` | `Lock` | amber/warning | "Caja T1 – PDV Centro abierta desde 09:00 sin cerrar" |
   | `critical_stock` | `AlertTriangle` | red/critical | "Stock crítico: Harina (2 kg, mín: 10 kg)" |
   | `open_incident` | `AlertCircle` | red/critical | "Incidencia abierta: Pedido #138 – Dirección incorrecta" |

2. **Layout del panel:**
   - Banner horizontal con fondo degradado según la alerta más grave (rojo si hay `critical`, amarillo si solo `warning`)
   - Contador: "3 alertas activas" con icono de campana
   - Botón colapsar/expandir
   - Expandido: lista de alertas con icono, mensaje, tiempo desde que se generó, y botón de acción (ej: "Ver pedido", "Ir a caja", "Ver stock")
   - Cada alerta es un link que navega a la sección correspondiente (`alert.route`)
   - Botón "Descartar" por alerta (solo oculta en la sesión, no elimina la condición)

3. **Sonido / vibración (opcional, configurable):**
   - Si `deliveryConfig.alertSoundEnabled`: reproducir un sonido breve al recibir alerta `critical`
   - En móvil: vibración corta con `navigator.vibrate(200)`

4. **Sin alertas:** El banner se oculta completamente; mostrar un indicador sutil "Sin alertas" en la barra de estado

**Criterios de aceptación:**
- Las alertas aparecen en < 2 segundos vía SSE
- Cada tipo tiene su icono y color distintivo
- Se puede colapsar/expandir
- Clic en una alerta navega a la sección correspondiente
- Se pueden descartar alertas individuales (solo UI, no server)
- El conteo se actualiza dinámicamente
- Si no hay alertas, el espacio se libera

---

### TICKET DL-10: Frontend — Widget de métricas rápidas del día

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-03  

**Descripción:**  
Panel de métricas clave del día que ofrece al gerente/operador una visión numérica rápida del rendimiento. Se alimenta de `opsData.kpis` y `opsData.revenueByChannel`.

**Tareas:**

1. **Métricas a mostrar (tarjetas tipo `KPICard` del Dashboard):**

   | Métrica | Valor | Icono | Formato | Trend |
   |---------|-------|-------|---------|-------|
   | Facturación del día | `kpis.revenue` | `Euro` | `€ 2.340,50` | ↑12% vs ayer |
   | Pedidos totales | `kpis.totalOrders` | `ShoppingBag` | `47` | ↑5 vs ayer |
   | Ticket medio | `kpis.averageTicket` | `Receipt` | `€ 49,79` | ↓2% vs ayer |
   | Tiempo medio preparación | `kpis.avgPrepTimeMinutes` | `Timer` | `18,5 min` | — |
   | Tiempo medio entrega | `kpis.avgDeliveryTimeMinutes` | `Truck` | `32,1 min` | — |
   | Puntualidad | `kpis.onTimePercentage` | `CheckCircle2` | `85,7%` | — |

2. **Diseño:**
   - Grid 3×2 en desktop, 2×3 en tablet, 1 columna en móvil
   - Cada tarjeta: valor grande + label + mini trend (flecha arriba/abajo + porcentaje) + icono sutil
   - Colores: verde si trend positivo, rojo si negativo, gris si neutro
   - Los trends se calculan comparando con datos del día anterior (el endpoint DL-03 puede aceptar `compareDate` param, o el frontend puede cachear datos del día anterior)

3. **Mini gráfico opcional:**
   - Debajo de las tarjetas: gráfico de barras por hora (`opsData.revenueByHour`) usando Recharts
   - Muestra facturación y número de pedidos por hora del día
   - Scroll horizontal en móvil

4. **Desglose por canal:**
   - Sección compacta con barras de progreso horizontales mostrando `opsData.revenueByChannel`
   - Cada canal con su nombre, barra proporcional y monto

**Criterios de aceptación:**
- Las 6 métricas principales se muestran y actualizan en tiempo real
- El trend muestra comparativa vs día anterior (si hay datos)
- El gráfico por hora se va rellenando conforme avanza el día
- El desglose por canal muestra todos los canales activos
- Responsive correcto en los 3 breakpoints

---

### TICKET DL-11: Frontend — Widget de cocina

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-04  

**Descripción:**  
Widget compacto dentro del centro operativo que muestra el estado de la cocina. No es la tab completa de `Delivery.tsx`, sino un resumen visual con las métricas clave y los pedidos activos.

**Tareas:**

1. **Contenido del widget:**
   - **Header:** "Cocina" + icono ChefHat + badge con `kitchenStatus.ordersInKitchen` / `kitchenStatus.capacity`
   - **Barra de saturación:** Barra de progreso con color dinámico:
     - Verde: < 50% capacidad
     - Amarillo: 50-80% capacidad
     - Rojo: > 80% capacidad
     - Texto: `kitchenStatus.saturationPercent`%
   - **Métricas compactas:**
     - Pedido más antiguo: `kitchenStatus.oldestOrderMinutes` min (rojo si > umbral)
     - Espera media: `kitchenStatus.avgWaitMinutes` min
   - **Lista de pedidos en cocina (max 5 visibles, scroll si más):**
     - Cada pedido: #número, items principales (truncado), tiempo en cocina, botón rápido "Listo"
     - Ordenados por tiempo descendente (más antiguo arriba para atender primero)
   - **Footer:** Link "Ver cocina completa →" que navega a `/saas/delivery?tab=kitchen`

2. **Interacción:**
   - Botón "Listo" en cada pedido: avanza estado a `assembly` directamente desde el widget (llamada `updateDeliveryOrderRequest`)
   - Al hacer clic en un pedido: abre drawer de detalle (`OrderDetailDrawer`)

3. **Condición de visibilidad:** Siempre visible si `deliveryConfig.hasKitchen: true`. Oculto si `false`.

**Criterios de aceptación:**
- La barra de saturación refleja el estado real
- Los pedidos se actualizan en tiempo real vía SSE
- El botón "Listo" funciona y el pedido desaparece del widget
- El pedido más antiguo se resalta en rojo si supera el umbral
- El link "Ver cocina completa" navega correctamente

---

### TICKET DL-12: Frontend — Widget de montaje

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-04  

**Descripción:**  
Widget compacto del centro operativo que muestra los pedidos en fase de montaje. Incluye el checklist de preparación existente y botón de avance rápido.

**Tareas:**

1. **Contenido del widget:**
   - **Header:** "Montaje" + icono Package + badge con conteo de pedidos en `assembly`
   - **Lista de pedidos en montaje (max 5 visibles):**
     - Cada pedido: #número, tipo (domicilio/recogida), ítems, progreso del checklist (ej: "4/7 ✓")
     - Barra de progreso mini del checklist
     - Botón "Completado" (avanza a `delivery` si domicilio, o a `delivered` si recogida)
   - **Footer:** Link "Ver montaje completo →"

2. **Interacción:**
   - Clic en pedido: abre checklist expandido (como el actual de `Delivery.tsx` con `MONTAJE_CHECKLIST`)
   - El estado del checklist se persiste en `localStorage` (como actualmente en `Delivery.tsx`)

3. **Condición de visibilidad:** Siempre visible si `deliveryConfig.hasAssemblyStation: true`. Si `false`, oculto.

**Criterios de aceptación:**
- El checklist funciona igual que el actual
- El botón "Completado" diferencia entre domicilio (→ delivery) y recogida (→ delivered)
- Actualización en tiempo real

---

### TICKET DL-13: Frontend — Widget de sala / mesas (condicional)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** DL-05, DL-01  

**Descripción:**  
Widget condicional que solo se muestra si el negocio tiene mesas físicas (`deliveryConfig.hasPhysicalTables: true`). Muestra un mapa simplificado del estado de las mesas.

**Nota:** Este widget requiere un modelo de datos de mesas que no existe todavía. En la primera versión se puede mostrar un resumen estático con las mesas configuradas en `deliveryConfig.tableCount`, y se implementa el CRUD de mesas completo en un ticket posterior.

**Tareas:**

1. **Versión 1 (simplificada sin modelo de mesas):**
   - **Header:** "Sala" + icono `Armchair` + badge "X/Y ocupadas"
   - **Grid visual de mesas:** Cuadrícula de mini cuadrados/círculos numerados. Colores:
     - Gris: libre
     - Verde: ocupada (tiene pedido activo)
     - Amarillo: pendiente de cobro
     - Rojo: con incidencia
   - **Datos:** Se infiere del campo `tableNumber` en `delivery_order` (si existe) o se asigna en el wizard de creación
   - **Footer:** Link "Ver sala completa →" (futuro)

2. **Añadir campo `tableNumber` a `DeliveryOrder`:**
   - Campo opcional `tableNumber?: number` en interfaz y backend
   - Solo se muestra en el wizard si `deliveryConfig.hasPhysicalTables: true` y el tipo de pedido es "en sala"

3. **Nuevo tipo de pedido "en sala":**
   - Añadir `OrderType = 'domicilio' | 'recogida' | 'sala'`
   - Si "en sala": pedir número de mesa, no pedir dirección

4. **Condición de visibilidad:** Solo si `deliveryConfig.hasPhysicalTables: true`

**Criterios de aceptación:**
- El widget solo aparece si está configurado
- Las mesas se muestran con colores según estado
- Se puede crear un pedido "en sala" asignando mesa
- El grid es visualmente claro con hasta 40 mesas

---

### TICKET DL-14: Frontend — Widget de reparto

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-04  

**Descripción:**  
Widget compacto que muestra el estado del reparto: pedidos en camino, repartidores activos y tiempos. Solo visible si el negocio tiene reparto propio.

**Tareas:**

1. **Contenido del widget:**
   - **Header:** "Reparto" + icono Truck + badge con `deliveryStatus.ordersInDelivery`
   - **KPIs compactos en fila:**
     - Repartidores activos: `deliveryStatus.driversActive`
     - Tiempo medio entrega: `deliveryStatus.avgDeliveryMinutes` min
     - Retrasados: `deliveryStatus.delayedCount` (rojo si > 0)
   - **Lista de pedidos en reparto (max 5):**
     - Cada pedido: #número, repartidor, dirección (truncada), tiempo transcurrido, badge si retrasado
     - Botón rápido "Entregado" → avanza a `delivered`
   - **Footer:** Link "Ver reparto completo →"

2. **Condición de visibilidad:**
   - Si `deliveryConfig.hasOwnDelivery: true` → visible
   - Si solo `hasPlatformDelivery: true` y `hasOwnDelivery: false` → mostrar versión reducida: "X pedidos en plataformas" con iconos de cada plataforma y sus conteos

**Criterios de aceptación:**
- El widget muestra datos reales del reparto
- El botón "Entregado" funciona y actualiza el pipeline
- La versión "solo plataformas" muestra los pedidos agrupados por plataforma
- Actualización en tiempo real

---

### TICKET DL-15: Frontend — Widget de caja

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-03  

**Descripción:**  
Widget compacto que muestra el estado de las cajas registradoras (sesiones TPV) y las cajas de repartidor.

**Tareas:**

1. **Contenido del widget:**
   - **Header:** "Caja" + icono Wallet + badge con sesiones abiertas
   - **Sesiones de caja TPV abiertas:**
     - Cada sesión: PDV + Terminal, abierta por, hora apertura, total acumulado
     - Indicador visual: verde (abierta OK), amarillo (abierta > X horas), rojo (debería haberse cerrado)
   - **Sesiones de caja repartidor abiertas:**
     - Cada sesión: nombre repartidor, fondo, cobros, saldo actual
   - **KPIs compactos:**
     - Total en cajas: `cashStatus.totalCashInRegisters`
     - Pendientes de cierre: `cashStatus.pendingClose`
   - **Footer:** Link "Ir a Caja →" → `/saas/delivery?tab=driverCash`

2. **Alerta visual:** Si hay cajas pendientes de cierre (pasada la hora configurada en `deliveryConfig.cashCloseReminderTime`), mostrar borde rojo pulsante

**Criterios de aceptación:**
- Se muestran todas las sesiones abiertas (TPV + repartidor)
- El indicador de tiempo es correcto
- El total en cajas se actualiza en tiempo real
- La alerta visual de cierre pendiente es clara

---

### TICKET DL-16: Frontend — Widget de incidencias

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-04  

**Descripción:**  
Widget compacto que muestra las incidencias abiertas con acceso rápido para resolverlas.

**Tareas:**

1. **Contenido del widget:**
   - **Header:** "Incidencias" + icono AlertCircle + badge rojo con conteo
   - **Lista de incidencias abiertas:**
     - Cada una: #pedido, tipo de incidencia, notas, tiempo abierta, cliente
     - Botón "Resolver" → abre `ResolveIncidentModal` existente
   - **Si no hay incidencias:** Mostrar check verde "Sin incidencias abiertas"
   - **Footer:** Link "Ver todas →" → `/saas/delivery?tab=incidents`

2. **Prioridad visual:**
   - Incidencias ordenadas por antigüedad (más antigua primero)
   - Badge de tipo: "Dirección incorrecta", "Producto erróneo", "Retraso excesivo", "Otro"

**Criterios de aceptación:**
- Las incidencias aparecen en tiempo real
- El botón "Resolver" funciona y actualiza la lista
- El estado "Sin incidencias" es visualmente positivo (verde)

---

### TICKET DL-17: Frontend — Visibilidad dinámica de widgets según configuración

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-01, DL-05, DL-08, DL-11, DL-12, DL-13, DL-14, DL-15, DL-16  

**Descripción:**  
Implementar la lógica que muestra u oculta widgets según la configuración del negocio (`deliveryConfig`). Tres escenarios principales:

**Tareas:**

1. **Definir escenarios de visibilidad:**

   | Widget | `hasPhysicalTables` | `hasOwnDelivery` | `hasPlatformDelivery` | Solo delivery |
   |--------|--------------------|--------------------|----------------------|---------------|
   | Cocina | ✅ si `hasKitchen` | ✅ si `hasKitchen` | ✅ si `hasKitchen` | ✅ |
   | Montaje | ✅ si `hasAssemblyStation` | ✅ si `hasAssemblyStation` | ✅ si `hasAssemblyStation` | ✅ |
   | Sala/Mesas | ✅ | ❌ | ❌ | ❌ |
   | Reparto | según config | ✅ | versión reducida | ✅ reducida |
   | Caja | ✅ | ✅ | ✅ | ✅ |
   | Incidencias | ✅ | ✅ | ✅ | ✅ |
   | Métricas | ✅ | ✅ | ✅ | ✅ |
   | Accesos rápidos | adaptar ítems | adaptar ítems | adaptar ítems | adaptar ítems |

2. **Perfiles tipo:**
   - **Restaurante completo** (`hasPhysicalTables` + `hasOwnDelivery` + `hasKitchen`):
     Cocina + Montaje + Sala + Reparto + Caja + Incidencias + Métricas (7 widgets, grid 3×3)
   - **Solo delivery** (`hasOwnDelivery` + `hasKitchen`, sin mesas):
     Cocina + Montaje + Reparto + Caja + Incidencias + Métricas (6 widgets, grid 3×2)
   - **Solo plataformas** (`hasPlatformDelivery`, sin reparto propio, sin mesas):
     Cocina + Montaje + Reparto(reducido) + Caja + Incidencias + Métricas (6 widgets con reparto simplificado)
   - **Dark kitchen** (`hasKitchen`, sin mesas, sin reparto propio):
     Cocina + Montaje + Caja + Incidencias + Métricas (5 widgets, grid 3×2)

3. **Implementación:**
   - Función `getVisibleWidgets(config: DeliveryConfig): WidgetDefinition[]`
   - Devuelve array ordenado de widgets visibles con su ancho preferido (1col, 2col)
   - El grid se reorganiza automáticamente según los widgets visibles
   - Usar CSS Grid con `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))` para layout automático

4. **Personalización manual (fase 2):**
   - Permitir al gerente ocultar/mostrar widgets adicionales (como `PersonalizePanel` del Dashboard)
   - Persistir en `localStorage` con key `vertial_delivery_ops_widgets:${userId}:${businessId}`

**Criterios de aceptación:**
- Los widgets se muestran/ocultan correctamente según la configuración
- Los 4 perfiles tipo funcionan correctamente
- El grid se reorganiza sin espacios vacíos
- El acceso rápido adapta sus ítems según configuración
- El centro operativo nunca queda vacío (siempre hay al menos Caja + Incidencias + Métricas)

---

### TICKET DL-18: Frontend — Diferenciación de perfiles gerente vs trabajador

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DL-05, DL-06  

**Descripción:**  
Implementar dos experiencias diferenciadas según el rol del usuario: el gerente ve la operativa completa de la empresa (todas las sedes y todos los PDV), mientras que el trabajador ve solo la operativa de su turno, su sede y las acciones que tiene permitidas.

**Tareas:**

1. **Detectar perfil del usuario:**
   - Usar sistema de roles existente (`useAuth().user.role` o `listRoles`)
   - Definir mapping de roles a perfil operativo:
     - `owner`, `admin`, `manager` → Perfil **gerente**
     - `worker`, `employee`, `driver`, `kitchen`, `cashier` → Perfil **trabajador**
   - Fallback: si no hay roles configurados, asumir gerente para el owner y trabajador para invitados

2. **Perfil gerente — ve todo:**
   - Todos los filtros disponibles (sede, PDV, canal, franja)
   - Todos los widgets visibles según config
   - Métricas financieras completas (facturación, ticket medio, desglose por canal)
   - Puede cambiar configuración (`deliveryConfig`)
   - Puede ver todas las sedes y todos los PDV
   - Botón "Configurar centro operativo" → abre panel de ajustes (DL-01)

3. **Perfil trabajador — vista limitada:**
   - **Filtros:** Sede y PDV prefijados a los del trabajador (no puede cambiarlos). Solo puede filtrar por canal y franja.
   - **Widgets visibles:** Solo los relevantes a su rol:
     - Rol `kitchen` → Solo widget Cocina + Pipeline de estados + Alertas de cocina
     - Rol `driver` → Solo widget Reparto + Caja repartidor + Mapa de pedidos
     - Rol `cashier` → Solo widget Caja + Pipeline + Métricas
     - Rol `worker` (genérico) → Todos los widgets pero sin métricas financieras
   - **Métricas:** Sin facturación, sin ticket medio, sin desglose por canal. Solo métricas operativas (conteos, tiempos).
   - **Acciones permitidas:**
     - Puede avanzar estados de pedidos (botones "Listo", "Entregado", etc.)
     - NO puede crear/eliminar PDV
     - NO puede cambiar configuración
     - NO puede ver métricas financieras
   - **Header:** Muestra "Turno de [nombre]" + sede + PDV asignado

4. **Implementación de restricciones:**
   - Componente wrapper `<RoleGate allowedRoles={['owner','admin','manager']}>{children}</RoleGate>` para ocultar secciones
   - Los widgets se filtran con `getVisibleWidgets(config, userRole)`
   - Los filtros de sede/PDV se pre-setean y se deshabilitan para trabajadores

**Criterios de aceptación:**
- El gerente ve todas las sedes, todos los PDV y todas las métricas
- El trabajador ve solo su sede/PDV y las secciones permitidas
- No se pueden ver métricas financieras sin rol de gerente
- Los botones de acción (avanzar estado, resolver incidencia) están disponibles para ambos perfiles
- La configuración solo es editable por gerentes
- El header refleja correctamente el perfil y contexto del usuario

---

### TICKET DL-19: Conexiones — Navegación bidireccional con otros módulos

**Tipo:** Enhancement — Frontend  
**Prioridad:** Media  
**Dependencias:** DL-05  

**Descripción:**  
Garantizar que el centro operativo tiene enlaces claros hacia todos los módulos relacionados y que esos módulos tienen un enlace de vuelta al centro operativo.

**Tareas:**

1. **Desde el centro operativo → otros módulos (ya cubierto parcialmente por DL-08):**
   - Dashboard core: `/saas/dashboard` — Botón "Ir al Dashboard" en header o acceso rápido
   - Pedidos: `/saas/delivery` — Acceso rápido "Pedidos"
   - TPV: `/saas/tpv` — Acceso rápido "TPV"
   - Cocina: `/saas/delivery?tab=kitchen` — Widget + acceso rápido
   - Montaje: `/saas/delivery?tab=assembly` — Widget + acceso rápido
   - Sala: futuro `/saas/sala` — Widget condicional
   - Reparto: `/saas/delivery?tab=delivery` — Widget + acceso rápido
   - Caja: `/saas/delivery?tab=driverCash` — Widget + acceso rápido
   - Compras y Stock: `/saas/articles` (o futuro `/saas/compras-stock`) — Acceso rápido + link desde alertas de stock
   - Finanzas: `/saas/finance` — Acceso rápido
   - CRM: `/saas/crm/clientes` — Acceso rápido

2. **Desde otros módulos → centro operativo:**
   - **Dashboard** (`Dashboard.tsx`): En el widget "Operativa del negocio" para vertical delivery, añadir botón "Abrir Centro Operativo →" que navegue a `/saas/vertical/delivery`
   - **Delivery** (`Delivery.tsx`): Añadir botón "Centro Operativo" en el header o breadcrumb
   - **TPV** (`TpvPage.tsx`): Añadir link "Volver al Centro Operativo" en la barra superior
   - **Sidebar** (`Sidebar.tsx`): Entrada destacada "Centro Operativo" para el vertical delivery (ya cubierto en DL-05)

3. **Breadcrumbs contextuales:**
   - En las páginas de destino (Cocina, Montaje, etc.), mostrar breadcrumb: `Centro Operativo > Cocina`
   - Clic en "Centro Operativo" vuelve a `/saas/vertical/delivery`

**Criterios de aceptación:**
- Desde el centro operativo se puede llegar a cualquier módulo relacionado en 1 clic
- Desde cualquier módulo operativo se puede volver al centro en 1 clic
- Los links son correctos y funcionan con los filtros activos (pasar filtros como query params si es útil)
- El breadcrumb es visible y funcional

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos de datos y API (semana 1-2)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| DL-01 | Configuración delivery del negocio | Backend | Alta |
| DL-02 | Añadir `salesPointId` a pedidos | Backend | Alta |
| DL-03 | Endpoint de datos operativos agregados | Backend | Crítica |
| DL-04 | Eventos SSE para tiempo real | Backend | Alta |

### Fase 2 — Shell de la página y estructura (semana 3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| DL-05 | Shell de la página y routing | Frontend | Crítica |
| DL-06 | Barra de filtros operativos | Frontend | Alta |
| DL-07 | Pipeline de estados con conteos | Frontend | Crítica |

### Fase 3 — Widgets operativos (semanas 4-5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| DL-08 | Panel de accesos rápidos | Frontend | Alta |
| DL-09 | Widget de alertas operativas | Frontend | Crítica |
| DL-10 | Widget de métricas rápidas | Frontend | Alta |
| DL-11 | Widget de cocina | Frontend | Alta |
| DL-12 | Widget de montaje | Frontend | Alta |
| DL-14 | Widget de reparto | Frontend | Alta |
| DL-15 | Widget de caja | Frontend | Alta |
| DL-16 | Widget de incidencias | Frontend | Alta |

### Fase 4 — Widget condicional y personalización (semana 6)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| DL-13 | Widget de sala / mesas (condicional) | Frontend | Media |
| DL-17 | Visibilidad dinámica de widgets | Frontend | Alta |

### Fase 5 — Perfiles y conexiones (semana 7)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| DL-18 | Diferenciación gerente vs trabajador | Frontend | Alta |
| DL-19 | Navegación bidireccional con otros módulos | Frontend | Media |

---

## NOTAS DE DISEÑO

### Paleta de colores por sección
- **Cocina:** naranja (`orange-50` a `orange-700`) — consistente con `STATUS_CONFIG.kitchen`
- **Montaje:** índigo (`indigo-50` a `indigo-700`) — consistente con `STATUS_CONFIG.assembly`
- **Reparto:** cian (`cyan-50` a `cyan-700`) — consistente con `STATUS_CONFIG.delivery`
- **Sala:** esmeralda (`emerald-50` a `emerald-700`) — nuevo, asociado a "zona verde"
- **Caja:** violeta (`violet-50` a `violet-700`) — distingue de las fases de pedido
- **Incidencias:** rojo (`red-50` a `red-700`) — consistente con `STATUS_CONFIG.incident`
- **Métricas:** gris/azul neutro — no compite con los colores de estado

### Convenciones de UI
- Usar componentes de `components/ui/` (Button, Card, Tabs) con estilos Tailwind
- Dark mode obligatorio en todos los widgets (`dark:bg-gray-XXX`, `dark:text-gray-XXX`)
- Iconos de `lucide-react` exclusivamente
- Bordes redondeados `rounded-xl` o `rounded-2xl` (patrón del proyecto)
- Sombras sutiles `shadow-sm` a `shadow-md`
- Animaciones con `transition-all` y duración corta (150-200ms)
- Gráficos con Recharts (librería ya instalada)

### Patron de estado y data fetching
- Estado local con `useState` + `useMemo` (patrón actual del proyecto)
- No hay Redux ni Zustand — no introducir state management global
- Data fetching con `authFetch` via `deliveryApi.ts`
- SSE con `useSSE` / `useDeliverySSE` (nuevo hook)
- Polling de respaldo cada 30s si SSE se desconecta
