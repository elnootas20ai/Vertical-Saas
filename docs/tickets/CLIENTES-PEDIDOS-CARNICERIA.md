# CLIENTES OPCIONALES Y PEDIDOS RÁPIDOS — Carnicería

**Página:** `/saas/vertical/carniceria/clientes-pedidos`  
**Ruta real (routes.tsx):** `/saas/butcher-clients`  
**Objetivo:** Permitir guardar clientes habituales y gestionar encargos simples (pedidos, reservas, encargos especiales, recogida) sin convertir la vertical en algo pesado. El cliente es siempre opcional; la carnicería puede funcionar 100% anónima o con clientes identificados.  
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

**~60% del código escrito, pero NO funcional en runtime.** Backend completo en `services/butcherShop.js` (builders/sanitizers de `butcher_client`, `butcher_order` con 3 tipos y numeración PED/RES/ENC, `butcher_sale` con contadores de cliente) + `butcherClientsController/OrdersController/SalesController` (incl. search, history, hábitos manuales, today, convert-sale, void, stats, link/unlink CRM) + los 3 routers. Frontend completo: `ButcherClients.tsx`, `ButcherOrders.tsx`, `ButcherSales.tsx` y `ButcherWorkerOrders.tsx` (Kanban) consumen la API real vía `butcherApi.ts`.
**Bloqueadores críticos:** los routers `butcherClientsRouter`, `butcherOrdersRouter` y `butcherSalesRouter` se importan en `index.js` pero **NO se montan** (`app.use` ausente) → toda la API `/api/butcher-clients|orders|sales` devuelve 404. En `routes.tsx`, `/saas/butcher-clients` redirige a `/saas/clients`, `/saas/butcher-orders` a `/saas/suppliers/ordenes-compra` y `/saas/butcher-sales` a `/saas/sales` → las páginas específicas son inalcanzables (solo `worker/butcher-orders` carga componente real). No hay ítem de clientes en el Sidebar. **Falta además:** alertas BCP-05 como notificaciones (existe `getButcherAlerts` en `alertEngine.js` pero solo alimenta un resumen, no emite `butcher_order_overdue_pickup`/`butcher_special_not_prepared`/`butcher_reservations_today`), trigger automático de hábitos tras venta (solo endpoint manual), reserva de stock (BCP-13, no existe `stock_reservation`), widgets de Dashboard (BCP-14) e identificación de cliente en TPV (BCP-12).

### Estado por ticket

| Ticket | Estado | Nota |
|---|---|---|
| BCP-01 Cliente backend | Código completo, API sin montar | Builders en `butcherShop.js`, no en `couchdb.js`; falta `findButcherClientByPhone` dedicada (la búsqueda cubre teléfono) |
| BCP-02 Pedidos backend | Código completo, API sin montar | 3 tipos + numeración + today + convert-sale implementados |
| BCP-03 Ventas backend | Código completo, API sin montar | Contadores de cliente y void con reversión; sin `paymentDetails` mixto detallado |
| BCP-04 Hábitos | Parcial | `analyzeButcherClientHabits` existe como endpoint manual; sin trigger post-venta ni `lastHabitAnalysis` |
| BCP-05 Alertas | No hecho como alertas | `getButcherAlerts` solo aporta resumen; no emite notificaciones |
| BCP-06 Página Clientes | Hecha pero inalcanzable | `ButcherClients.tsx` con KPIs, búsqueda, drawer; la ruta redirige al CRM |
| BCP-07 Pedidos frontend | Hecha pero inalcanzable | Conectada a API real; ruta redirige a órdenes de compra |
| BCP-08 Ventas frontend | Hecha pero inalcanzable | Conectada a API real + stats; ruta redirige a `/saas/sales` |
| BCP-09 Historial | Parcial | Historial en drawer vía `getButcherClientHistoryRequest`; sin página completa con gráficos |
| BCP-10 Routing/Sidebar | No hecho | Rutas redirigidas, sin ítem sidebar `butcher-clients` |
| BCP-11 CRM link | Parcial | Endpoints link/unlink existen (sin montar); sin UI ni sincronización de interacciones |
| BCP-12 TPV | No hecho | `WorkerTpvButcherShop` no identifica cliente |
| BCP-13 Reserva stock | No hecho | No existe `stock_reservation` |
| BCP-14 Dashboard widgets | No hecho | — |
| BCP-15 Vista trabajador | Hecha | `ButcherWorkerOrders.tsx` Kanban en `/saas/worker/butcher-orders` (sin SSE, sin drag & drop) |

---

## Auditoría de lo existente

### Vertical carnicería — Páginas actuales

| Página | Archivo | Ruta | Qué hace |
|---|---|---|---|
| Productos | `ButcherProducts.tsx` | `/saas/butcher-products` | CRUD de cortes (vacuno, cerdo, pollo, cordero, elaborados) con precio/kg, stock, conservación, origen |
| Pedidos | `ButcherOrders.tsx` | `/saas/butcher-orders` | CRUD de pedidos con estados (pendiente→preparando→listo→entregado→cancelado), cliente como texto libre, teléfono, productos (texto libre), peso, total, notas |
| Inventario | `ButcherInventory.tsx` | `/saas/butcher-inventory` | Entradas de stock por zona (cámara frío, congelador, mostrador, obrador), lote, caducidad, temperatura |
| Proveedores | `ButcherSuppliers.tsx` | `/saas/butcher-suppliers` | CRUD de proveedores con valoración, CIF, tipo producto, días entrega |
| Trazabilidad | `ButcherTraceability.tsx` | `/saas/butcher-traceability` | Registros sanitarios: lote, origen, matadero, guía sanitaria, temperatura, estado sanitario |
| Ventas | `ButcherSales.tsx` | `/saas/butcher-sales` | CRUD de ventas con ticket, cliente (texto libre), productos (texto libre), peso, pago (efectivo/tarjeta/bizum) |

### Sistema CRM/Clientes Core — Ya implementado

| Sistema | Ubicación | BD |
|---|---|---|
| Modelo `client` | `services/couchdb.js` → `buildClientDocument` | CouchDB `vertial-clients` |
| CRUD completo | `controllers/clientsController.js` + `routers/clientsRouter.js` | 18 endpoints |
| Detalle cliente | `getClientDetail` — resumen con ventas, documentos, actividad | CouchDB multi-BD |
| Notas sobre cliente | `clientNotes` — CRUD completo incrustado | CouchDB `vertial-clients` |
| Promociones cliente | `clientPromotions` — CRUD completo | CouchDB `vertial-clients` |
| CLV (Customer Lifetime Value) | `getClientCLV` — cálculo dinámico | CouchDB cruzado |
| Duplicados y merge | `checkClientDuplicates` / `mergeClient` | CouchDB `vertial-clients` |
| Portal del cliente | `generateClientPortalToken` | JWT |
| Actividad del cliente | `getClientActivity` — historial de interacciones | CouchDB |
| Leads + pipeline | `leadsController.js`, `crmController.js` | CouchDB |
| Alertas CRM | `getCrmAlerts` — leads sin contactar, presupuestos pendientes | CouchDB |
| Segmentos | `crmSegmentsController.js` | CouchDB |
| Importación masiva | `bulkCreateClients` + `CrmImportWizard.tsx` | CouchDB |

### Modelo `client` existente — Campos relevantes

```
name, phone, email, dni, address, city, postalCode,
clientType (particular|empresa|autónomo|...),
status (active|inactive), responsible, notes,
tags[], interactions[], contacts[],
commercialStatus, consents (GDPR),
vehiclesPurchased[], vehiclesSold[], documentsCount
```

### Motor de alertas (`alertEngine.js`)

| Aspecto | Estado |
|---|---|
| Alertas genéricas (stock bajo, vencimientos) | Funcional — cada 1h |
| Alertas de carnicería (encargos, recogida) | **No existe** |
| Tipo `butcher_order_pickup` | **No existe** |
| Tipo `butcher_special_pending` | **No existe** |
| Push + SSE + in-app | Infraestructura lista |

### TPV existente

| Aspecto | Estado |
|---|---|
| `TpvModePage.tsx` / `TpvContext.tsx` | Funcional — genérico |
| `WorkerTpv.tsx` | Vista trabajador de TPV |
| Asociar venta a cliente | **Parcial** — texto libre, sin vínculo real |

### Dashboard (`Dashboard.tsx`)

| Aspecto | Estado |
|---|---|
| KPIs genéricos | Funcional |
| Widget encargos carnicería | **No existe** |
| Widget clientes frecuentes | **No existe** |

### Sidebar carnicería

```
butcher-products, butcher-orders, butcher-inventory,
butcher-suppliers, butcher-traceability, butcher-sales
```

**No hay** entrada para `butcher-clients`.

---

## Brechas detectadas (Gap Analysis)

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe entidad de cliente para carnicería.** `ButcherOrders.tsx` y `ButcherSales.tsx` usan `cliente` como texto libre (string) sin vínculo a ningún modelo | No se puede hacer historial de compras, ni hábitos, ni recuperar datos |
| 2 | **No hay página de clientes** específica para la vertical carnicería | El CRM genérico (`ClientsPage.tsx`) está orientado a leads/pipeline, demasiado pesado para una carnicería |
| 3 | **Los pedidos no distinguen tipo:** pedido simple, reserva, encargo especial — todos son "pedido" | No hay workflows diferenciados ni priorización |
| 4 | **No hay campo hora de recogida** en pedidos | El carnicero no sabe cuándo viene el cliente |
| 5 | **No hay historial de compra por cliente** | Si el cliente dice "ponme lo de siempre" no hay registro |
| 6 | **No hay hábitos de compra guardados** | No se puede automatizar "este cliente suele pedir X cada viernes" |
| 7 | **No hay alertas específicas de carnicería:** encargo pendiente, pedido sin preparar, cliente con reserva | Las alertas actuales solo cubren stock y leads genéricos |
| 8 | **No hay conexión pedido ↔ stock** | Crear un pedido no reserva stock |
| 9 | **No hay vista rápida del trabajador** para encargos del día | Solo hay tabla completa con filtro |
| 10 | **No hay backend** para los datos de Butcher* — todo es `useState` local | Los datos se pierden al refrescar |

---

## TICKETS

---

### TICKET BCP-01: Backend — Modelo de datos `butcher_client` (Cliente de carnicería)

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna  
**Estimación:** M (4-6h)

**Descripción:**  
Crear un modelo ligero de cliente específico para carnicería que reutilice la infraestructura de `couchdb.js` pero sea mucho más simple que el `client` genérico del CRM. El cliente de carnicería es **siempre opcional** — el negocio funciona sin él, pero cuando se identifica, se guardan sus datos y hábitos.

**Tareas:**

1. **Crear `buildButcherClientDocument` en `services/couchdb.js`:**
   - `type: 'butcher_client'`
   - Campos:
     - `_id` → `butcher_client-{uuid}`
     - `user_id` — propietario del negocio
     - `name` — nombre (obligatorio si se crea ficha)
     - `phone` — teléfono (campo principal de identificación rápida)
     - `email` — opcional
     - `observations` — texto libre para notas del carnicero ("le gusta fino", "alérgico a X")
     - `tags[]` — etiquetas rápidas: `habitual`, `encargos_frecuentes`, `mayorista`, `restaurante`
     - `preferences` — objeto con hábitos:
       - `usualProducts[]` — array de `{ productName, productId?, quantity?, unit?, frequency? }` (lo que suele pedir)
       - `preferredDay` — día habitual de compra (lunes, martes... o null)
       - `preferredTime` — franja horaria preferida ("mañana", "mediodía", "tarde")
       - `cuttingPreferences` — texto libre ("filetes finos", "para guisar", "deshuesado")
       - `packagingNotes` — texto libre ("envasado al vacío", "bolsa normal")
     - `linkedCrmClientId` — (opcional) referencia al `client` del CRM Core para negocios que quieran usar ambos sistemas
     - `totalOrders` — contador desnormalizado de pedidos
     - `totalSpent` — gasto total desnormalizado
     - `lastVisit` — fecha de última compra/encargo
     - `active` — boolean (soft delete)
     - `createdAt`, `updatedAt`
   - Función `sanitizeButcherClient` — validación y limpieza

2. **BD:** Usar `getButcherDbName()` → `vertial-butcher` (BD dedicada de la vertical, compartida con pedidos y ventas de carnicería)

3. **Funciones de consulta:**
   - `listButcherClientsByUser(req, userId)` — todos los clientes activos
   - `findButcherClientByPhone(req, userId, phone)` — búsqueda rápida por teléfono (caso de uso: el carnicero teclea un teléfono y aparece el cliente)
   - `searchButcherClients(req, userId, query)` — búsqueda por nombre o teléfono (para autocompletado)

4. **CRUD en controlador (`controllers/butcherClientsController.js`):**
   - `listButcherClients(req, res)` — listar con paginación y búsqueda
   - `createButcherClient(req, res)` — crear; solo `name` obligatorio
   - `getButcherClient(req, res)` — detalle con historial resumido
   - `updateButcherClient(req, res)` — actualizar datos + preferencias
   - `deleteButcherClient(req, res)` — soft delete (`active: false`)
   - `searchButcherClients(req, res)` — endpoint de autocompletado (respuesta < 200ms)
   - `getButcherClientHistory(req, res)` — pedidos + ventas del cliente (cruce con `butcher_order` y `butcher_sale`)

5. **Router (`routers/butcherClientsRouter.js`):**
   - `GET    /api/butcher-clients/:userId` — listar
   - `POST   /api/butcher-clients/:userId` — crear
   - `GET    /api/butcher-clients/:userId/search?q=` — autocompletado
   - `GET    /api/butcher-clients/:userId/:clientId` — detalle
   - `PUT    /api/butcher-clients/:userId/:clientId` — actualizar
   - `DELETE /api/butcher-clients/:userId/:clientId` — eliminar
   - `GET    /api/butcher-clients/:userId/:clientId/history` — historial

6. **Montar en `index.js`** con `requireAuth`

7. **Cliente TypeScript (`src/app/lib/butcherClientsApi.ts`):**
   - Interface `ButcherClient`, `ButcherClientPreferences`, `UsualProduct`
   - Funciones: `listButcherClientsRequest`, `createButcherClientRequest`, `updateButcherClientRequest`, `deleteButcherClientRequest`, `searchButcherClientsRequest`, `getButcherClientHistoryRequest`

**Criterios de aceptación:**
- CRUD funcional vía API
- Búsqueda por teléfono devuelve resultados en < 200ms
- Autocompletado por nombre/teléfono funciona con 3+ caracteres
- Soft delete no elimina datos, solo `active: false`
- El historial cruza pedidos y ventas vinculados al `butcher_client._id`

---

### TICKET BCP-02: Backend — Modelo de datos `butcher_order` mejorado (Pedidos, reservas y encargos)

**Tipo:** Enhancement — Backend  
**Prioridad:** Crítica  
**Dependencias:** BCP-01  
**Estimación:** L (6-8h)

**Descripción:**  
Refactorizar el modelo de pedidos de carnicería para soportar tres tipos diferenciados (pedido simple, reserva, encargo especial), vincular al cliente (opcional), añadir hora de recogida, y persistir en CouchDB en vez del `useState` actual.

**Tareas:**

1. **Crear `buildButcherOrderDocument` en `services/couchdb.js`:**
   - `type: 'butcher_order'`
   - Campos:
     - `_id` → `butcher_order-{uuid}`
     - `user_id`
     - `orderNumber` — auto-incremental por negocio (formato: `PED-0001`, `RES-0001`, `ENC-0001` según tipo)
     - `orderType` — enum:
       - `simple` — Pedido rápido ("ponme 2kg de chuletón para mañana")
       - `reservation` — Reserva de producto ("reservame un costillar para el sábado")
       - `special` — Encargo especial ("necesito un lechón entero para una comunión")
     - `clientId` — ref a `butcher_client._id` (opcional; null = venta anónima)
     - `clientName` — desnormalizado (para mostrar sin join)
     - `clientPhone` — desnormalizado
     - `items[]` — array de líneas de pedido:
       - `productId` — ref a producto del catálogo (opcional si se escribe a mano)
       - `productName` — nombre (obligatorio)
       - `quantity` — cantidad
       - `unit` — kg, unidades, piezas
       - `pricePerUnit` — precio por unidad/kg
       - `subtotal` — calculado
       - `notes` — notas de la línea ("filetes gruesos", "para barbacoa")
     - `total` — suma de subtotales
     - `pickupDate` — fecha de recogida (obligatorio para reservas y encargos)
     - `pickupTime` — hora estimada de recogida ("09:00", "mediodía", "antes de las 14:00")
     - `status` — enum:
       - `pending` — Pendiente de preparar
       - `preparing` — En preparación
       - `ready` — Listo para recoger
       - `picked_up` — Recogido/entregado
       - `cancelled` — Cancelado
     - `priority` — `normal`, `urgent` (para encargos de último momento)
     - `notes` — observaciones generales
     - `preparedBy` — quién lo preparó (ref a equipo, opcional)
     - `stockReserved` — boolean: si ya se ha reservado stock para este pedido
     - `linkedSaleId` — cuando el pedido se convierte en venta, ref a `butcher_sale`
     - `createdAt`, `updatedAt`

2. **Numeración automática:**
   - Crear función `getNextButcherOrderNumber(req, userId, orderType)` que lee el último número del tipo y devuelve el siguiente
   - Prefijos: `PED-` (simple), `RES-` (reserva), `ENC-` (encargo)

3. **CRUD en controlador (`controllers/butcherOrdersController.js`):**
   - `listButcherOrders(req, res)` — listar con filtros por tipo, estado, fecha, cliente
   - `createButcherOrder(req, res)` — crear pedido; si `clientId` se proporciona, desnormalizar nombre/teléfono y actualizar contadores del cliente
   - `getButcherOrder(req, res)` — detalle
   - `updateButcherOrder(req, res)` — actualizar (incluye cambio de estado)
   - `updateButcherOrderStatus(req, res)` — endpoint dedicado para cambio de estado rápido (ej: pasar de pendiente a preparando con un solo click)
   - `deleteButcherOrder(req, res)` — soft delete
   - `getButcherOrdersToday(req, res)` — todos los pedidos con recogida hoy (vista de operativa diaria)
   - `convertOrderToSale(req, res)` — convierte un pedido "recogido" en una venta registrada

4. **Router (`routers/butcherOrdersRouter.js`):**
   - `GET    /api/butcher-orders/:userId` — listar
   - `POST   /api/butcher-orders/:userId` — crear
   - `GET    /api/butcher-orders/:userId/today` — pedidos de hoy
   - `GET    /api/butcher-orders/:userId/:orderId` — detalle
   - `PUT    /api/butcher-orders/:userId/:orderId` — actualizar
   - `PATCH  /api/butcher-orders/:userId/:orderId/status` — cambio rápido de estado
   - `POST   /api/butcher-orders/:userId/:orderId/convert-sale` — convertir a venta
   - `DELETE /api/butcher-orders/:userId/:orderId` — eliminar

5. **Montar en `index.js`** con `requireAuth`

6. **Cliente TypeScript (`src/app/lib/butcherOrdersApi.ts`):**
   - Interfaces: `ButcherOrder`, `ButcherOrderItem`, `OrderType`, `OrderStatus`
   - Funciones request para cada endpoint

**Criterios de aceptación:**
- CRUD funcional con los tres tipos de pedido
- Numeración automática sin colisiones
- Vincular cliente es opcional; si se vincula, se desnormalizan nombre y teléfono
- Cambio de estado rápido funciona con un solo endpoint
- `getButcherOrdersToday` devuelve pedidos ordenados por hora de recogida
- Conversión a venta crea el documento de venta y actualiza `linkedSaleId`

---

### TICKET BCP-03: Backend — Modelo de datos `butcher_sale` mejorado (Ventas con vínculo a cliente)

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** BCP-01  
**Estimación:** M (4-6h)

**Descripción:**  
Refactorizar el modelo de ventas de carnicería para persistir en CouchDB, vincular al cliente (opcional), y mantener un registro que alimente el historial de compra.

**Tareas:**

1. **Crear `buildButcherSaleDocument` en `services/couchdb.js`:**
   - `type: 'butcher_sale'`
   - Campos:
     - `_id` → `butcher_sale-{uuid}`
     - `user_id`
     - `ticketNumber` — auto-incremental (formato: `TK-00001`)
     - `clientId` — ref a `butcher_client._id` (opcional)
     - `clientName` — desnormalizado
     - `clientPhone` — desnormalizado
     - `date` — fecha de la venta
     - `items[]` — líneas de venta:
       - `productId`, `productName`, `quantity`, `unit`, `pricePerUnit`, `subtotal`, `notes`
     - `totalWeight` — peso total (kg)
     - `total` — importe total
     - `paymentMethod` — `cash`, `card`, `bizum`, `mixed`
     - `paymentDetails` — si mixed: `{ cash: X, card: Y, bizum: Z }`
     - `status` — `completed`, `pending`, `voided`
     - `fromOrderId` — ref a `butcher_order` si viene de un pedido convertido
     - `soldBy` — trabajador que realizó la venta
     - `createdAt`, `updatedAt`

2. **Lógica post-venta:**
   - Si `clientId` está presente: actualizar `butcher_client.totalSpent`, `butcher_client.totalOrders`, `butcher_client.lastVisit`
   - Alimentar `preferences.usualProducts` si el producto se repite 3+ veces

3. **CRUD en controlador (`controllers/butcherSalesController.js`):**
   - `listButcherSales(req, res)` — listar con filtros
   - `createButcherSale(req, res)` — crear venta + actualizar cliente
   - `getButcherSale(req, res)` — detalle
   - `voidButcherSale(req, res)` — anular venta (revierte contadores del cliente)
   - `getButcherSalesToday(req, res)` — resumen del día
   - `getButcherSalesStats(req, res)` — KPIs: ventas del día, semana, mes; ticket medio; producto más vendido

4. **Router (`routers/butcherSalesRouter.js`):**
   - `GET    /api/butcher-sales/:userId` — listar
   - `POST   /api/butcher-sales/:userId` — crear
   - `GET    /api/butcher-sales/:userId/today` — ventas de hoy
   - `GET    /api/butcher-sales/:userId/stats` — KPIs
   - `GET    /api/butcher-sales/:userId/:saleId` — detalle
   - `PATCH  /api/butcher-sales/:userId/:saleId/void` — anular
   - Montar en `index.js` con `requireAuth`

5. **Cliente TypeScript (`src/app/lib/butcherSalesApi.ts`):**
   - Interfaces: `ButcherSale`, `ButcherSaleItem`, `PaymentMethod`, `SalesStats`
   - Funciones request para cada endpoint

**Criterios de aceptación:**
- Crear venta con o sin cliente funciona correctamente
- Si hay `clientId`, se actualizan contadores del cliente automáticamente
- Anular venta revierte los contadores del cliente
- KPIs calculan correctamente ventas del día, semana, mes y ticket medio
- `getButcherSalesToday` devuelve totales parciales por método de pago

---

### TICKET BCP-04: Backend — Automatización de hábitos de compra

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** BCP-01, BCP-03  
**Estimación:** M (4-6h)

**Descripción:**  
Implementar la lógica que detecta patrones de compra de un cliente y los registra automáticamente en `preferences.usualProducts`. Si un cliente identificado compra el mismo producto 3 o más veces, ese producto se añade a sus hábitos. Esto permite al carnicero ver "lo de siempre" al identificar al cliente.

**Tareas:**

1. **Crear servicio `services/butcherHabitsService.js`:**
   - `analyzeClientHabits(req, userId, clientId)`:
     - Leer todas las ventas (`butcher_sale`) del cliente
     - Agrupar por `productName` (normalizado a lowercase)
     - Si un producto aparece en 3+ ventas distintas → añadir a `preferences.usualProducts` con:
       - `productName`, `productId` (si existe), `averageQuantity` (media de las cantidades), `unit`, `frequency` (calculada: semanal, quincenal, mensual)
     - Si un día de la semana concentra 60%+ de las visitas → escribir `preferences.preferredDay`
     - Actualizar `butcher_client` con las preferencias calculadas

2. **Trigger automático:**
   - Llamar a `analyzeClientHabits` después de cada venta si hay `clientId` (dentro de `createButcherSale`, asíncrono, no bloquea la respuesta)
   - Solo recalcular si han pasado 24h desde el último análisis (campo `lastHabitAnalysis` en el cliente)

3. **Endpoint manual de recálculo:**
   - `POST /api/butcher-clients/:userId/:clientId/recalculate-habits`
   - Para que el gerente pueda forzar un recálculo si ha importado ventas antiguas

4. **Cliente TypeScript:**
   - Añadir función `recalculateHabitsRequest` en `butcherClientsApi.ts`

**Criterios de aceptación:**
- Después de 3 ventas con el mismo producto, el producto aparece en `usualProducts`
- La frecuencia se calcula correctamente (diferencia media entre compras)
- El día preferido se detecta si 60%+ de visitas caen en el mismo día
- El recálculo no bloquea la creación de venta (asíncrono)
- El endpoint manual funciona para recálculos forzados

---

### TICKET BCP-05: Backend — Alertas específicas de carnicería

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** BCP-02  
**Estimación:** M (4-6h)

**Descripción:**  
Añadir tres nuevos tipos de alerta al motor de alertas (`alertEngine.js`) para cubrir los escenarios operativos de la carnicería: encargos pendientes de recoger, pedidos especiales sin preparar, y clientes con reserva para hoy.

**Tareas:**

1. **Añadir función `runButcherAlerts(accounts)` en `services/alertEngine.js`:**

   - **Alerta `butcher_order_overdue_pickup`** — Encargo/reserva cuya `pickupDate` ya pasó y `status` sigue en `ready` o `pending`:
     - Severidad: `high`
     - Título: "Encargo pendiente de recoger"
     - Descripción: "El pedido {orderNumber} de {clientName} tenía recogida para {pickupDate} y aún no se ha recogido"
     - Destinatario: gerente + trabajador asignado

   - **Alerta `butcher_special_not_prepared`** — Encargo especial (`orderType: 'special'`) con `pickupDate` a menos de 24h y `status` todavía en `pending`:
     - Severidad: `critical`
     - Título: "Encargo especial sin preparar"
     - Descripción: "El encargo {orderNumber} ({items resumen}) debe estar listo antes de {pickupDate} {pickupTime}"
     - Destinatario: gerente + trabajador asignado

   - **Alerta `butcher_reservations_today`** — Resumen matutino de todas las reservas/pedidos con `pickupDate` = hoy:
     - Severidad: `info`
     - Título: "Pedidos para hoy: {count}"
     - Descripción: listado resumido de pedidos con hora de recogida
     - Trigger: solo una vez al día (a las 07:00 o al primer login)
     - Destinatario: todos los trabajadores de la carnicería

2. **Registrar en `ALERT_RULES` o en el ciclo principal del alert engine:**
   - Filtrar solo cuentas con `businessType: 'butcherShop'`
   - Usar `getButcherDbName()` para leer pedidos

3. **Dedup:**
   - Respetar ventana de dedup de 24h existente
   - `butcher_reservations_today` tiene dedup especial: una vez al día, no repetir hasta mañana

4. **Tests:**
   - Crear datos de prueba: pedido con recogida ayer no recogido, encargo especial con recogida mañana sin preparar, 3 pedidos para hoy
   - Verificar que se generan exactamente las 3 alertas

**Criterios de aceptación:**
- Las tres alertas se generan correctamente según las condiciones
- No se duplican dentro de la ventana de 24h
- El resumen matutino solo se envía una vez al día
- Las alertas llegan por SSE + push si el usuario tiene push habilitado
- Solo se ejecutan para cuentas con `businessType: 'butcherShop'`

---

### TICKET BCP-06: Frontend — Página de Clientes de Carnicería (`ButcherClients.tsx`)

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** BCP-01  
**Estimación:** L (8-10h)

**Descripción:**  
Crear la página de gestión de clientes específica para carnicería. Debe ser ligera, rápida y pensada para el día a día de una carnicería: el carnicero tiene las manos ocupadas, necesita buscar un cliente rápido por teléfono o nombre, ver qué suele pedir, y crear fichas en segundos.

**Diseño de la página:**

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENTES                                          [+ Nuevo] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│  │ 👥 42  │ │ ⭐ 18  │ │ 📦 7   │ │ 💰 2.4k│                │
│  │Total   │ │Habitua-│ │Encargos│ │Gasto   │                │
│  │clientes│ │les     │ │activos │ │mes     │                │
│  └────────┘ └────────┘ └────────┘ └────────┘                │
│                                                              │
│  🔍 [Buscar por nombre o teléfono...    ]  [Etiqueta ▾]     │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ María García         📱 612 345 678     ⭐ Habitual      ││
│  │ Lo habitual: 2kg chuletón, 1kg chorizos                  ││
│  │ Última visita: hace 3 días  │  Total: 1.240 €  │ 23 ped ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ Bar El Rincón        📱 698 765 432     🏪 Restaurante   ││
│  │ Lo habitual: 5kg pollo, 3kg cerdo, 2kg ternera           ││
│  │ Última visita: ayer         │  Total: 4.800 €  │ 89 ped ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ Pedro López          📱 677 111 222     (sin etiqueta)   ││
│  │ Sin hábitos registrados                                   ││
│  │ Última visita: hace 2 sem   │  Total: 180 €    │  4 ped ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│                    [1] [2] [3] ... [5]                        │
└──────────────────────────────────────────────────────────────┘
```

**Tareas:**

1. **Crear `src/app/pages/saas/ButcherClients.tsx`:**
   - Layout con `<Layout title="Clientes" />`
   - 4 tarjetas KPI: total clientes, habituales (con tag `habitual`), encargos activos, gasto del mes
   - Barra de búsqueda con debounce (300ms) que llama a `/search?q=`
   - Filtro por etiqueta (habitual, restaurante, mayorista, todos)
   - Listado tipo card (no tabla) — cada card muestra:
     - Nombre + teléfono (click-to-call en móvil)
     - Tags/etiquetas con badge de color
     - "Lo habitual" si tiene `preferences.usualProducts` (máximo 3 productos, truncado)
     - Última visita (relative time: "hace 3 días", "ayer")
     - Total gastado + nº pedidos
   - Paginación (20 por página)
   - Click en card → abre drawer lateral de detalle

2. **Drawer de detalle del cliente:**
   ```
   ┌─────────────────────────────────┐
   │  ← María García        [Editar]│
   │  📱 612 345 678  [Llamar]      │
   │  📧 maria@email.com            │
   │  Tags: ⭐ Habitual              │
   │                                 │
   │  ── Observaciones ──            │
   │  Le gusta fino, sin nervio.     │
   │  Alérgica a mostaza.            │
   │                                 │
   │  ── Lo habitual ──              │
   │  • 2kg chuletón de ternera      │
   │  • 1kg chorizos criollos        │
   │  • 0.5kg morcilla               │
   │  Suele venir: viernes mañana    │
   │                                 │
   │  ── Preferencias ──             │
   │  Corte: filetes finos           │
   │  Envasado: al vacío             │
   │                                 │
   │  ── Últimos pedidos (5) ──      │
   │  15/04 PED-0042  32.50€  ✓     │
   │  08/04 ENC-0003  85.00€  ✓     │
   │  01/04 PED-0038  28.70€  ✓     │
   │  [Ver historial completo →]     │
   │                                 │
   │  ── Estadísticas ──             │
   │  Gasto total: 1.240 €           │
   │  Ticket medio: 53.91 €          │
   │  Frecuencia: semanal            │
   │  Cliente desde: ene 2025        │
   │                                 │
   │  [Crear pedido] [Crear encargo] │
   └─────────────────────────────────┘
   ```
   - Secciones: datos básicos, observaciones, hábitos, preferencias de corte/envasado, últimos pedidos, estadísticas
   - Botones de acción: "Crear pedido" (redirige a form de pedido con cliente precargado), "Crear encargo"

3. **Modal de crear/editar cliente:**
   - Campos: nombre*, teléfono, email, observaciones, tags (multiselect), preferencias de corte, envasado
   - Sección "Lo habitual" editable: lista de productos con nombre + cantidad + unidad (add/remove)
   - Validación: nombre obligatorio, teléfono formateado
   - Al guardar: llamar a API y refrescar listado

4. **Responsive:**
   - Móvil: cards apiladas, drawer se abre full-screen
   - Tablet: cards en grid 2 columnas, drawer lateral 400px
   - Desktop: cards en grid 3 columnas, drawer lateral 450px

5. **Integración con estado real (API):**
   - Usar `useEffect` + fetch para cargar datos del backend
   - Loading skeleton mientras carga
   - Toast de éxito/error en operaciones CRUD
   - Refetch tras crear/editar/eliminar

**Criterios de aceptación:**
- La página carga clientes del backend en < 500ms
- Búsqueda por teléfono muestra resultados en < 300ms
- Crear un cliente tarda < 3 clicks (nombre → guardar)
- El drawer muestra historial real de pedidos/ventas
- Funciona en móvil con buena experiencia táctil (botones grandes, click-to-call)
- Diseño consistente con el resto de páginas Butcher*

---

### TICKET BCP-07: Frontend — Refactorizar `ButcherOrders.tsx` (Pedidos con tipos, cliente vinculado y hora de recogida)

**Tipo:** Enhancement — Frontend  
**Prioridad:** Crítica  
**Dependencias:** BCP-02, BCP-06  
**Estimación:** L (8-10h)

**Descripción:**  
Refactorizar la página de pedidos de carnicería para: (1) conectar con el backend en vez de `useState`, (2) soportar tres tipos de pedido (simple, reserva, encargo), (3) vincular cliente opcionalmente, (4) añadir hora de recogida, (5) añadir vista de operativa diaria para el trabajador.

**Diseño — Vista principal (Gerente):**

```
┌──────────────────────────────────────────────────────────────┐
│  PEDIDOS Y ENCARGOS                          [+ Nuevo ▾]    │
│                                               ├ Pedido      │
│                                               ├ Reserva     │
│                                               └ Encargo esp.│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│  │ 🕐 5   │ │ 🔧 3   │ │ ✅ 2   │ │ ⚡ 1   │                │
│  │Pendien-│ │Prepar- │ │Listos  │ │Urgentes│                │
│  │tes     │ │ando    │ │recoger │ │        │                │
│  └────────┘ └────────┘ └────────┘ └────────┘                │
│                                                              │
│  [Todos] [Hoy ✨] [Pendientes] [Listos] [Tipo ▾] [🔍    ]  │
│                                                              │
│  ── Recogida: Hoy (6 pedidos) ──                             │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 🟡 PED-0045  María García  📱612345678                   ││
│  │ 2kg chuletón, 1kg chorizos      ⏰ 10:00   32.50€       ││
│  │ [Preparar ▶] [Editar] [Cancelar]                         ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🔴 ENC-0004  Bar El Rincón  📱698765432     ⚡ URGENTE   ││
│  │ 5kg pollo deshuesado, 3kg cerdo  ⏰ 11:30   124.00€     ││
│  │ Nota: "deshuesado, listo para cocinar"                    ││
│  │ [Preparar ▶] [Editar] [Cancelar]                         ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ 🟢 RES-0012  Pedro López  📱677111222                    ││
│  │ 1 costillar entero               ⏰ 14:00   45.00€      ││
│  │ [✓ Listo — Marcar recogido] [Editar]                     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ── Recogida: Mañana (2 pedidos) ──                          │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

**Tareas:**

1. **Refactorizar estado:**
   - Reemplazar `useState<Order[]>([])` por fetch al backend (`/api/butcher-orders/:userId`)
   - Implementar `useEffect` para carga inicial + refetch tras cambios
   - Añadir loading states y error handling

2. **Nuevo modal de creación/edición:**
   - Selector de tipo: Pedido simple / Reserva / Encargo especial (tabs o radio visual)
   - Campo cliente con autocompletado (búsqueda en `/api/butcher-clients/:userId/search?q=`):
     - Al escribir 3+ caracteres, muestra dropdown con sugerencias
     - Si selecciona cliente → rellena nombre + teléfono + muestra "Lo habitual" como sugerencia
     - Si no selecciona → escribe nombre/teléfono a mano (cliente anónimo)
     - Botón "Nuevo cliente" que abre el modal de crear cliente inline
   - Líneas de producto:
     - Campo con autocompletado del catálogo (`ButcherProducts`)
     - Cantidad + unidad (kg, uds, piezas)
     - Precio por unidad (precargado del catálogo si se selecciona producto)
     - Notas por línea
     - Botón [+ Añadir línea]
   - Fecha de recogida (datepicker) — obligatoria para reservas y encargos
   - Hora de recogida (input time o select con franjas: 09:00, 09:30... 14:00, 17:00... 20:00)
   - Prioridad: normal / urgente (toggle visible solo en encargos)
   - Notas generales
   - Total calculado automáticamente

3. **Vista de operativa diaria (tab "Hoy"):**
   - Muestra solo pedidos con `pickupDate` = hoy
   - Agrupados por franja horaria: mañana (antes 12:00), mediodía (12:00-15:00), tarde (después 15:00)
   - Cards con acciones rápidas de un click: [Preparar] → [Listo] → [Recogido]
   - Color coding por estado: amarillo pendiente, azul preparando, verde listo, gris recogido, rojo cancelado
   - Animación suave al cambiar estado (la card se mueve al grupo correspondiente)

4. **Filtros mejorados:**
   - Por tipo: todos, pedidos, reservas, encargos
   - Por estado: todos, pendientes, preparando, listos, recogidos
   - Por fecha: hoy, mañana, esta semana, rango personalizado
   - Búsqueda por nº pedido, cliente, producto

5. **Acciones rápidas:**
   - Botón de cambio de estado en cada card (usa `PATCH /status`)
   - Botón "Marcar recogido" convierte automáticamente a venta si así se desea (modal de confirmación con método de pago)

6. **Responsive:**
   - Móvil: cards apiladas, modal full-screen, botones de acción grandes
   - Swipe en card para acciones rápidas (preparar/listo/recogido)

**Criterios de aceptación:**
- Los tres tipos de pedido se crean y muestran correctamente
- Autocompletado de cliente funciona en < 300ms
- "Lo habitual" aparece como sugerencia al seleccionar un cliente habitual
- La vista "Hoy" muestra pedidos agrupados por franja horaria
- Cambio de estado con un solo click, sin recargar toda la página
- Modal de creación permite crear pedido completo en < 30 segundos
- Los datos persisten en CouchDB (no se pierden al refrescar)

---

### TICKET BCP-08: Frontend — Refactorizar `ButcherSales.tsx` (Ventas con cliente vinculado)

**Tipo:** Enhancement — Frontend  
**Prioridad:** Alta  
**Dependencias:** BCP-03, BCP-06  
**Estimación:** M (5-7h)

**Descripción:**  
Refactorizar la página de ventas para: (1) conectar con el backend, (2) vincular cliente opcionalmente, (3) mostrar KPIs reales, (4) permitir conversión de pedido a venta.

**Tareas:**

1. **Conectar con backend:**
   - Reemplazar `useState<Sale[]>([])` por fetch a `/api/butcher-sales/:userId`
   - Loading states + error handling

2. **Vincular cliente en ventas:**
   - Mismo componente de autocompletado de clientes que en pedidos (reutilizar)
   - Si se vincula → aparece badge del cliente en la fila
   - Si viene de un pedido → cliente precargado, campo bloqueado

3. **KPIs reales:**
   - Llamar a `/api/butcher-sales/:userId/stats`
   - Mostrar: ventas hoy, ingresos hoy, ventas del mes, ticket medio
   - Actualización automática tras cada nueva venta

4. **Conversión pedido → venta:**
   - Cuando un pedido se marca como "recogido" → modal para registrar como venta
   - Precargar datos del pedido (productos, cantidades, precios)
   - Solo pedir método de pago
   - Al confirmar: crear venta + marcar pedido como `picked_up` + vincular IDs

5. **Líneas de producto mejoradas:**
   - Campo con autocompletado del catálogo
   - Precio precargado del catálogo
   - Cálculo automático de subtotales y total

**Criterios de aceptación:**
- Ventas persisten en CouchDB
- KPIs reflejan datos reales
- Vincular cliente es opcional y funciona con autocompletado
- Conversión pedido → venta funciona sin re-teclear datos
- Métodos de pago incluyen mixto (efectivo + tarjeta)

---

### TICKET BCP-09: Frontend — Historial de compras del cliente

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BCP-06, BCP-07, BCP-08  
**Estimación:** M (4-6h)

**Descripción:**  
Crear una vista completa de historial de compras para un cliente de carnicería, accesible desde el drawer del cliente. Incluye timeline de pedidos y ventas, estadísticas de productos más comprados, frecuencia de visita, y evolución del gasto.

**Diseño:**

```
┌──────────────────────────────────────────────────────────────┐
│  ← Historial de María García                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ 1.240 €  │ │ 53.91 €  │ │ Semanal  │                     │
│  │ Total    │ │ Ticket   │ │ Frecuen- │                     │
│  │ gastado  │ │ medio    │ │ cia      │                     │
│  └──────────┘ └──────────┘ └──────────┘                     │
│                                                              │
│  ── Top productos ──                                         │
│  ████████████████████ Chuletón ternera    480€ (38%)        │
│  ████████████████     Chorizos criollos   320€ (26%)        │
│  ███████████          Morcilla            220€ (18%)        │
│  ██████               Otros               220€ (18%)        │
│                                                              │
│  ── Evolución mensual (gráfico de barras) ──                 │
│  ene  ▎▎▎▎▎     120€                                        │
│  feb  ▎▎▎▎▎▎    145€                                        │
│  mar  ▎▎▎▎▎▎▎▎  210€                                        │
│  abr  ▎▎▎▎▎▎    150€ (parcial)                              │
│                                                              │
│  ── Timeline ──                                              │
│  15 abr  TK-00089  Chuletón 2kg, chorizos 1kg   32.50€  ✓  │
│  08 abr  ENC-0003  Lechón entero (comunión)      85.00€  ✓  │
│  01 abr  TK-00076  Chuletón 2kg, morcilla 0.5   28.70€  ✓  │
│  25 mar  PED-0038  Pollo 3kg, cerdo 2kg          42.30€  ✓  │
│  ...                                                         │
│  [Cargar más]                                                │
└──────────────────────────────────────────────────────────────┘
```

**Tareas:**

1. **Crear componente `ButcherClientHistory.tsx`:**
   - Recibe `clientId` como prop
   - Llama a `/api/butcher-clients/:userId/:clientId/history`
   - Muestra: KPIs (total, ticket medio, frecuencia), top productos (barras horizontales con %), evolución mensual (gráfico con Recharts), timeline de transacciones

2. **Top productos:**
   - Agrupar todas las líneas de venta por `productName`
   - Calcular total gastado + porcentaje sobre total
   - Mostrar como barras horizontales con colores (top 5 + "otros")

3. **Evolución mensual:**
   - Gráfico de barras con Recharts (ya en dependencias)
   - Eje X: meses, Eje Y: gasto en €
   - Tooltip con detalle del mes

4. **Timeline unificado:**
   - Mezclar pedidos + ventas ordenados por fecha DESC
   - Iconos distintos: recibo para ventas, clipboard para pedidos
   - Estado visual (check verde completado, reloj amarillo pendiente)
   - Paginación infinita o "Cargar más" (20 items)

5. **Integración en drawer de cliente (BCP-06):**
   - En el drawer, sección "Últimos pedidos" muestra 5 más recientes
   - Botón "Ver historial completo" abre esta vista (full page o modal grande)

**Criterios de aceptación:**
- El historial carga correctamente para clientes con y sin compras
- El gráfico de evolución muestra datos reales
- Top productos refleja correctamente los porcentajes
- La timeline mezcla pedidos y ventas en orden cronológico
- Funciona correctamente para clientes con 100+ transacciones (paginado)

---

### TICKET BCP-10: Frontend + Sidebar — Registrar página y ruta `butcher-clients`

**Tipo:** Feature — Config/Routing  
**Prioridad:** Crítica  
**Dependencias:** BCP-06  
**Estimación:** S (1-2h)

**Descripción:**  
Registrar la nueva página de clientes en el sistema de rutas y en la barra lateral de la vertical carnicería.

**Tareas:**

1. **`src/app/routes.tsx`:**
   - Añadir import: `import { ButcherClients } from './pages/saas/ButcherClients';`
   - Añadir ruta en el bloque de carnicería:
     ```typescript
     { path: 'butcher-clients', Component: ButcherClients },
     ```

2. **`src/app/components/saas/Sidebar.tsx`:**
   - Añadir item en `menuItemDefs` dentro del bloque "Vertical: Carnicería":
     ```typescript
     { id: 'butcher-clients', navKey: 'butcherClients', icon: <Users className="w-5 h-5" />, path: '/saas/butcher-clients' },
     ```
   - Posición: **antes** de `butcher-orders` (el cliente se consulta antes de crear pedidos)
   - Actualizar `verticalGroupDefs` para incluir `butcher-clients` en el grupo `butcherShop`:
     ```typescript
     { id: 'butcherShop', icon: <Beef className="w-4 h-4 shrink-0" />, itemIds: ['butcher-clients', 'butcher-products', 'butcher-orders', 'butcher-inventory', 'butcher-suppliers', 'butcher-traceability', 'butcher-sales'] },
     ```

3. **`src/app/lib/i18n.ts`:**
   - Añadir traducción para `butcherClients`: "Clientes"

4. **`src/app/pages/saas/worker/WorkerHome.tsx`:**
   - Si existe sección de carnicería en la home del trabajador, añadir acceso directo a "Clientes"

**Criterios de aceptación:**
- La ruta `/saas/butcher-clients` carga la página correctamente
- Aparece en el sidebar como primer item de la vertical carnicería (antes de productos)
- El icono es `Users` (consistente con la sección de clientes del CRM genérico)
- La navegación entre páginas de carnicería funciona sin recargas

---

### TICKET BCP-11: Conexión con CRM Core (vínculo opcional)

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Baja  
**Dependencias:** BCP-01, BCP-06  
**Estimación:** M (4-6h)

**Descripción:**  
Permitir vincular un `butcher_client` con un `client` del CRM genérico para negocios que quieran usar ambos sistemas. El vínculo es siempre opcional — muchas carnicerías nunca usarán el CRM Core.

**Tareas:**

1. **Backend — Endpoint de vinculación:**
   - `POST /api/butcher-clients/:userId/:clientId/link-crm` — recibe `{ crmClientId }` y actualiza `linkedCrmClientId`
   - `POST /api/butcher-clients/:userId/:clientId/unlink-crm` — desvincula
   - Al vincular: sincronizar nombre y teléfono si son distintos (prioridad al CRM Core)

2. **Backend — Sincronización de datos:**
   - Al crear una venta vinculada a un `butcher_client` que tiene `linkedCrmClientId`:
     - Registrar la interacción en el `client` del CRM Core (`interactions[]`)
     - Actualizar contadores del CRM Core si aplica

3. **Frontend — En el drawer del cliente:**
   - Si no está vinculado: botón "Vincular con CRM" → modal de búsqueda de clientes del CRM Core
   - Si está vinculado: badge "Vinculado con CRM" + link al detalle del CRM Core
   - Botón "Desvincular"

4. **Frontend — En `ClientsPage.tsx` (CRM genérico):**
   - Si un cliente del CRM tiene un `butcher_client` vinculado: mostrar badge de "Cliente carnicería" en la ficha
   - Acceso directo al historial de carnicería desde el CRM

**Criterios de aceptación:**
- Vincular/desvincular funciona sin perder datos en ningún lado
- Las ventas de carnicería aparecen en la actividad del CRM Core si están vinculadas
- La vinculación es opcional y no interfiere con el flujo normal de la carnicería
- Un `butcher_client` puede existir sin `linkedCrmClientId`

---

### TICKET BCP-12: Conexión con TPV — Identificar cliente en punto de venta

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** BCP-01, BCP-03  
**Estimación:** M (4-6h)

**Descripción:**  
Integrar el sistema de clientes de carnicería con el TPV existente para que el carnicero pueda identificar al cliente durante una venta rápida en mostrador, y que esa venta quede asociada al cliente.

**Tareas:**

1. **En `WorkerTpv.tsx` (o el componente de TPV de la vertical):**
   - Añadir campo "Cliente" en la cabecera de la venta (opcional)
   - Campo con autocompletado (mismo componente que en pedidos)
   - Si se identifica al cliente → la venta se crea con `clientId`
   - Botón rápido "Último cliente" para repetir el mismo cliente

2. **En la pantalla de pago del TPV:**
   - Mostrar nombre del cliente si está identificado
   - Mostrar "Lo habitual" como sugerencia rápida para añadir productos
   - Botón "Cargar lo habitual" → añade todos los productos de `usualProducts` al ticket

3. **Backend:**
   - Asegurar que `createButcherSale` puede recibir `clientId` desde el flujo del TPV
   - Los mismos triggers de actualización de cliente (contadores, hábitos) se ejecutan

**Criterios de aceptación:**
- Identificar cliente en TPV es rápido (< 3 segundos)
- "Cargar lo habitual" añade productos con cantidades correctas
- La venta queda asociada al cliente en el historial
- Si no se identifica cliente, el TPV funciona exactamente igual que antes (sin regresiones)

---

### TICKET BCP-13: Conexión con Stock — Reserva de stock por pedido

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** BCP-02  
**Estimación:** M (4-6h)

**Descripción:**  
Al crear un pedido/reserva/encargo con productos del catálogo, reservar automáticamente el stock necesario para evitar vender dos veces el mismo producto. La reserva se libera si el pedido se cancela, y se convierte en salida de stock cuando se completa la venta.

**Tareas:**

1. **Lógica de reserva en `createButcherOrder`:**
   - Si las líneas del pedido tienen `productId` (enlazado al catálogo):
     - Verificar que hay stock suficiente
     - Crear `stock_reservation` temporal: reduce stock "disponible" pero no `stockQuantity`
     - Marcar `order.stockReserved = true`
   - Si no hay stock suficiente: advertir pero permitir crear el pedido (el carnicero puede pedir al proveedor)

2. **Modelo `stock_reservation`:**
   - `type: 'stock_reservation'`
   - Campos: `_id`, `user_id`, `orderId`, `productId`, `quantity`, `status` (reserved|released|consumed), `createdAt`, `expiresAt`
   - Al cancelar pedido → liberar reserva (`status: 'released'`)
   - Al convertir a venta → consumir reserva (`status: 'consumed'`) y descontar `stockQuantity`

3. **Nuevo campo calculado en catálogo:**
   - `availableStock = stockQuantity - reservedStock`
   - Mostrar en `ButcherProducts.tsx` y `ButcherInventory.tsx`

4. **Alertas:**
   - Si `availableStock < minStock` → alerta de stock bajo (ya existe lógica, adaptar cálculo)

**Criterios de aceptación:**
- Crear un pedido con productos del catálogo reserva stock automáticamente
- Cancelar un pedido libera el stock reservado
- Completar una venta consume la reserva y descuenta stock real
- `availableStock` se muestra correctamente en productos e inventario
- Pedidos sin productos del catálogo (texto libre) no intentan reservar stock

---

### TICKET BCP-14: Widget de carnicería en Dashboard

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** BCP-02, BCP-05  
**Estimación:** S (3-4h)

**Descripción:**  
Añadir un widget específico de carnicería al Dashboard principal para que el gerente vea de un vistazo los encargos del día, alertas pendientes y top clientes.

**Tareas:**

1. **Widget "Encargos de hoy":**
   - Llamar a `/api/butcher-orders/:userId/today`
   - Mostrar lista compacta con: hora recogida, nombre cliente, resumen productos, estado (dot color)
   - Click en encargo → navega a la página de pedidos con filtro "hoy"

2. **Widget "Alertas carnicería":**
   - Filtrar alertas de tipo `butcher_*` del motor de alertas
   - Mostrar las últimas 5 alertas no leídas
   - Click → navega al pedido o al recurso relacionado

3. **Widget "Top 5 clientes del mes":**
   - Llamar a endpoint de estadísticas (o calcular en frontend a partir de ventas del mes)
   - Mostrar: nombre, gasto del mes, nº pedidos
   - Click → navega al detalle del cliente

4. **Condicionalidad:**
   - Solo mostrar estos widgets si `businessType === 'butcherShop'`
   - Usar el sistema de widgets dinámico del Dashboard si existe, o añadir sección condicional

**Criterios de aceptación:**
- Los widgets aparecen solo para negocios de tipo carnicería
- Los datos se cargan desde el backend (no mock)
- La información es útil y accionable (click lleva a la acción)
- Los widgets no rompen el layout del Dashboard para otras verticales

---

### TICKET BCP-15: Vista trabajador — Encargos del día

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** BCP-02, BCP-07  
**Estimación:** M (4-6h)

**Descripción:**  
Crear una vista optimizada para el trabajador (modo trabajador del sidebar) que muestre los encargos del día en un formato tipo Kanban o timeline, con acciones de un solo toque para cambiar estado.

**Diseño:**

```
┌──────────────────────────────────────────────────────────────┐
│  HOY — Viernes 14 abril                                      │
│  6 pedidos • 3 pendientes • 2 preparando • 1 listo          │
├────────────────┬─────────────────┬───────────────────────────┤
│  PENDIENTES (3)│  PREPARANDO (2) │  LISTOS (1)               │
│  ┌────────────┐│  ┌────────────┐ │  ┌────────────┐           │
│  │ 🕐 10:00   ││  │ 🔧 10:30   │ │  │ ✅ 09:00   │           │
│  │ María G.   ││  │ Bar Rincón │ │  │ Pedro L.   │           │
│  │ 2kg chulet.││  │ 5kg pollo  │ │  │ 1 costill. │           │
│  │            ││  │ 3kg cerdo  │ │  │            │           │
│  │ [Preparar] ││  │ [Listo ✓]  │ │  │ [Entregado]│           │
│  └────────────┘│  └────────────┘ │  └────────────┘           │
│  ┌────────────┐│  ┌────────────┐ │                           │
│  │ 🕐 11:30   ││  │ 🔧 12:00   │ │                           │
│  │ Anónimo    ││  │ Rosa M.    │ │                           │
│  │ 1kg chori. ││  │ ENC lechón │ │                           │
│  │ [Preparar] ││  │ [Listo ✓]  │ │                           │
│  └────────────┘│  └────────────┘ │                           │
│  ...           │                 │                           │
└────────────────┴─────────────────┴───────────────────────────┘
```

**Tareas:**

1. **Crear `src/app/pages/saas/worker/WorkerButcherOrders.tsx`:**
   - Vista Kanban con 3 columnas: Pendientes, Preparando, Listos
   - Cards compactas con: hora, cliente, resumen de productos, botón de acción
   - Al pulsar acción: cambio de estado inmediato (optimistic update + API call)
   - Drag & drop opcional entre columnas (React DnD, ya en dependencias)

2. **Actualización en tiempo real:**
   - SSE listener para cambios en pedidos (el gerente puede crear un pedido desde su vista)
   - Al recibir evento → refetch o actualización parcial
   - Sonido/vibración opcional al llegar nuevo pedido

3. **Registrar ruta y sidebar:**
   - Ruta: `/saas/worker/butcher-orders`
   - Sidebar trabajador: añadir item "Encargos del día"

4. **Responsive:**
   - Móvil: columnas en scroll horizontal (tipo Trello) o tabs (Pendientes | Preparando | Listos)
   - Botones grandes y táctiles (mínimo 44px)

**Criterios de aceptación:**
- La vista muestra solo pedidos de hoy
- Cambio de estado funciona con un solo toque
- Nuevo pedido aparece automáticamente (SSE o polling cada 30s)
- Funciona fluido en móvil (el trabajador puede usar el teléfono con una mano)
- El drag & drop entre columnas funciona en tablet/desktop

---

## Resumen de dependencias

```
BCP-01 (Cliente)
  ├── BCP-04 (Hábitos de compra) — necesita clientes + ventas
  ├── BCP-06 (Frontend Clientes) — necesita API de clientes
  │     ├── BCP-09 (Historial) — necesita página de clientes + pedidos + ventas
  │     └── BCP-10 (Routing) — necesita el componente de la página
  ├── BCP-11 (CRM Core) — necesita clientes de carnicería
  └── BCP-12 (TPV) — necesita búsqueda de clientes

BCP-02 (Pedidos mejorados)
  ├── BCP-05 (Alertas) — necesita modelo de pedidos
  ├── BCP-07 (Frontend Pedidos) — necesita API de pedidos
  │     └── BCP-15 (Vista trabajador) — necesita frontend de pedidos
  ├── BCP-13 (Reserva stock) — necesita modelo de pedidos
  └── BCP-14 (Dashboard widgets) — necesita datos de pedidos

BCP-03 (Ventas mejoradas)
  ├── BCP-04 (Hábitos) — necesita ventas vinculadas
  └── BCP-08 (Frontend Ventas) — necesita API de ventas
```

## Orden de implementación recomendado

| Fase | Tickets | Objetivo |
|---|---|---|
| **Fase 1 — Cimientos** | BCP-01, BCP-02, BCP-03 | Modelos de datos en CouchDB + APIs |
| **Fase 2 — Interfaz principal** | BCP-06, BCP-07, BCP-08, BCP-10 | Páginas frontend + routing |
| **Fase 3 — Inteligencia** | BCP-04, BCP-05, BCP-09 | Hábitos + alertas + historial |
| **Fase 4 — Integraciones** | BCP-11, BCP-12, BCP-13, BCP-14, BCP-15 | CRM, TPV, Stock, Dashboard, Worker |

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5, CouchDB |
| Frontend | React 18, TailwindCSS 4, Radix UI, Recharts, React DnD, Lucide icons |
| Estado | `useState` + `useEffect` + fetch (sin estado global extra) |
| Notificaciones | SSE (`sseService.js`) + Web Push (`pushService.js`) |
| Alertas | `alertEngine.js` (cron cada 1h) |
| Validación | Zod (disponible en deps) |
