# 🥩 Alertas Backend — Carnicería

> **Módulo:** `butcherAlertEngine`
> **Tipo:** Backend
> **Prioridad global:** Alta
> **Vertical:** `butcherShop`
> **Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

**~85% hecho.** El backend está prácticamente completo: modelos CouchDB (`butcher_product/batch/waste/scale_status/inventory_count` en `couchdb.js`), CRUD montado en `/api/butcher` (`butcherRouter.js`), motor `butcherAlertEngine.js` arrancado en `index.js` (ciclo 30 min + básculas cada 5 min), configuración en `alertController.js`, KPIs y dashAlerts de carnicería en el dashboard, endpoint resumen `/api/butcher/alerts/:userId/summary` y módulo compartido `alertEmitter.js`.
**Falta de verdad:** la distribución fina por perfil (CARN-ALR-05): no hay evento SSE `butcher_alert` dedicado, ni helpers `getActiveWorkerUserIds`/ventana de 12h para trabajadores (la distribución se hace por roles configurados en `alertEmitter.resolveRecipients`). Tampoco hay vistas CouchDB dedicadas (se usa `fetchAllDocsOfType`), ni evento de reconexión de báscula, ni rate-limit específico del ping.

---

## Índice

1. [Contexto y estado actual](#contexto-y-estado-actual)
2. [Arquitectura propuesta](#arquitectura-propuesta)
3. [Modelo de datos](#modelo-de-datos)
4. [Tickets](#tickets)
5. [Mapa de conexiones](#mapa-de-conexiones)
6. [Prioridades y clasificación](#prioridades-y-clasificación)

---

## Contexto y estado actual

### Lo que ya existe

| Componente | Estado | Ubicación |
|---|---|---|
| Motor de alertas genérico | ✅ Funcional | `services/alertEngine.js` |
| Sistema de notificaciones | ✅ Funcional | `controllers/notificationController.js` |
| SSE (tiempo real) | ✅ Funcional | `services/sseService.js` |
| Web Push | ✅ Funcional | `services/pushService.js` |
| Router de alertas | ✅ Funcional | `routers/alertRouter.js` |
| Dashboard KPIs + alertas | ✅ Funcional | `index.js` (GET /api/dashboard/kpis) |
| Deduplicación diaria | ✅ Funcional | `emitAlert()` en alertEngine.js |
| Configuración por cuenta | ✅ Funcional | `account.alertConfig` |
| Páginas UI carnicería | ⚠️ Solo frontend local | `src/app/pages/saas/Butcher*.tsx` |
| TPV carnicería | ⚠️ Solo frontend local | `WorkerTpvButcherShop.tsx` |
| Modelos CouchDB carnicería | ❌ No existen | — |
| Alertas específicas carnicería | ❌ No existen | — |
| Trazabilidad backend | ❌ No existe | — |
| Merma backend | ❌ No existe | — |
| Integración báscula | ❌ No existe | — |

### Patrón del motor actual

```
alertEngine.js:
  startAlertEngine() → setInterval(1h)
    → getAllUserIds()
    → por cada usuario: runAlertsForUser(userId)
      → getAlertConfig(account)
      → fetch datos de CouchDB
      → ejecutar reglas (checkLowStock, checkOverdueInvoices, etc.)
      → emitAlert() → CouchDB notifications + SSE + Web Push
```

### Niveles de alerta existentes

| Nivel | Uso actual |
|---|---|
| `alert` | Crítico (stock agotado, factura >30 días) |
| `warning` | Advertencia (stock bajo, pedido retrasado) |
| `info` | Informativo |

---

## Arquitectura propuesta

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BUTCHER ALERT ENGINE                              │
│                  services/butcherAlertEngine.js                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Stock    │ │ Lotes /  │ │  Merma   │ │ Precios  │              │
│  │ Crítico  │ │Caducidad │ │ Anómala  │ │Obsoletos │              │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │
│       │            │            │             │                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Báscula  │ │  Caja    │ │ Producto │ │Inventario│              │
│  │Desconect.│ │Pendiente │ │ Agotado  │ │Diferencia│              │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │
│       │            │            │             │                     │
│       └────────────┴─────┬──────┴─────────────┘                    │
│                          ▼                                          │
│                   classifyByPriority()                              │
│                          │                                          │
│           ┌──────────────┼──────────────┐                          │
│           ▼              ▼              ▼                           │
│     ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│     │ emitAlert│  │broadcast │  │broadcastTo│                      │
│     │(CouchDB) │  │ToUser    │  │Business   │                      │
│     │          │  │(SSE)     │  │(SSE)      │                      │
│     └────┬─────┘  └────┬─────┘  └─────┬────┘                      │
│          │             │              │                             │
│          ▼             ▼              ▼                             │
│  ┌─────────────────────────────────────────┐                       │
│  │        CANALES DE DISTRIBUCIÓN          │                       │
│  ├─────────────┬──────────┬────────────────┤                       │
│  │  Dashboard  │ Alertas  │   Pantalla     │                       │
│  │   (KPIs)    │  Core    │  Operativa     │                       │
│  │  (gerente)  │(sistema) │ (trabajador)   │                       │
│  └─────────────┴──────────┴────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Flujo por perfil

```
GERENTE (owner/admin):
  Dashboard → alertas globales de tienda
  │ Stock crítico global
  │ Merma acumulada anómala
  │ Diferencias de inventario
  │ Lotes caducados/próximos
  │ Precios sin actualizar
  │ Resumen de caja

TRABAJADOR (employee):
  Pantalla operativa → alertas del turno
  │ Báscula desconectada
  │ Producto agotado en mostrador
  │ Caja pendiente de cierre
  │ Lote caducado en vitrina
  │ Ticket sin cobro
```

---

## Modelo de datos

### Nuevos tipos de documento CouchDB (Base: delivery)

#### `butcher_product` — Producto de carnicería

```json
{
  "_id": "butcher_product:uuid",
  "type": "butcher_product",
  "user_id": "xxx",
  "business_id": "xxx",
  "name": "Chuletón de ternera",
  "category": "vacuno",
  "subcategory": "chuletón",
  "sku": "CHUL-001",
  "pricePerKg": 24.90,
  "priceUpdatedAt": "2026-04-10T10:00:00Z",
  "stockKg": 12.5,
  "minStockKg": 5.0,
  "unit": "kg",
  "active": true,
  "conservation": "refrigerado",
  "createdAt": "2026-01-15T08:00:00Z",
  "updatedAt": "2026-04-14T08:00:00Z"
}
```

#### `butcher_batch` — Lote / Trazabilidad

```json
{
  "_id": "butcher_batch:uuid",
  "type": "butcher_batch",
  "user_id": "xxx",
  "business_id": "xxx",
  "productId": "butcher_product:uuid",
  "batchNumber": "LOT-2026-0412",
  "origin": "Ganadería El Prado",
  "slaughterhouse": "Matadero Municipal",
  "healthGuide": "GS-2026-1234",
  "animalId": "ES080012345678",
  "receptionDate": "2026-04-12T06:00:00Z",
  "expirationDate": "2026-04-20T23:59:59Z",
  "receptionWeightKg": 120.0,
  "currentWeightKg": 95.5,
  "status": "active",
  "temperature": 2.5,
  "healthStatus": "approved",
  "zone": "cámara_1",
  "createdAt": "2026-04-12T06:00:00Z",
  "updatedAt": "2026-04-14T08:00:00Z"
}
```

#### `butcher_waste` — Registro de merma

```json
{
  "_id": "butcher_waste:uuid",
  "type": "butcher_waste",
  "user_id": "xxx",
  "business_id": "xxx",
  "productId": "butcher_product:uuid",
  "batchId": "butcher_batch:uuid",
  "date": "2026-04-14",
  "wasteKg": 2.3,
  "reason": "recorte",
  "category": "proceso",
  "notes": "",
  "registeredBy": "worker-user-id",
  "createdAt": "2026-04-14T10:00:00Z"
}
```

#### `butcher_scale_status` — Estado de la báscula

```json
{
  "_id": "butcher_scale_status:business-id:scale-1",
  "type": "butcher_scale_status",
  "business_id": "xxx",
  "scaleId": "scale-1",
  "name": "Báscula mostrador 1",
  "connected": true,
  "lastPingAt": "2026-04-14T12:30:00Z",
  "ip": "192.168.1.50",
  "model": "Epelsa Neptune",
  "location": "mostrador",
  "createdAt": "2026-04-01T08:00:00Z"
}
```

#### `butcher_inventory_count` — Conteo de inventario

```json
{
  "_id": "butcher_inventory_count:uuid",
  "type": "butcher_inventory_count",
  "user_id": "xxx",
  "business_id": "xxx",
  "date": "2026-04-14",
  "countedBy": "worker-user-id",
  "status": "completed",
  "items": [
    {
      "productId": "butcher_product:uuid",
      "expectedKg": 12.5,
      "countedKg": 11.8,
      "differenceKg": -0.7,
      "differencePct": -5.6
    }
  ],
  "totalDifferenceKg": -0.7,
  "createdAt": "2026-04-14T07:00:00Z"
}
```

### Extensión del documento `tpv_register_session` existente

Se añade al tipo existente en la BD delivery:

```json
{
  "type": "tpv_register_session",
  "vertical": "butcherShop",
  "pendingTickets": 2,
  "lastTicketAt": "2026-04-14T11:45:00Z",
  "closedAt": null
}
```

### Nuevas categorías de alerta

| Categoría (category) | Nivel | Prioridad | Destinatario |
|---|---|---|---|
| `butcher_batch_expired` | `alert` | 🔴 Crítica | Gerente + Trabajador |
| `butcher_batch_expiring_soon` | `warning` | 🟠 Alta | Gerente + Trabajador |
| `butcher_stock_critical` | `alert` | 🔴 Crítica | Gerente + Trabajador |
| `butcher_stock_low` | `warning` | 🟠 Alta | Gerente |
| `butcher_product_out_of_stock` | `alert` | 🔴 Crítica | Gerente + Trabajador |
| `butcher_waste_anomaly` | `warning` | 🟠 Alta | Gerente |
| `butcher_waste_critical` | `alert` | 🔴 Crítica | Gerente |
| `butcher_price_stale` | `warning` | 🟡 Media | Gerente |
| `butcher_scale_disconnected` | `alert` | 🔴 Crítica | Trabajador |
| `butcher_register_pending` | `warning` | 🟠 Alta | Trabajador + Gerente |
| `butcher_ticket_unpaid` | `warning` | 🟠 Alta | Trabajador |
| `butcher_inventory_discrepancy` | `warning` | 🟠 Alta | Gerente |
| `butcher_inventory_critical_discrepancy` | `alert` | 🔴 Crítica | Gerente |

---

## Tickets

---

### CARN-ALR-01 — Modelos CouchDB para carnicería

**Tipo:** Infraestructura / Modelos
**Prioridad:** 🔴 Crítica (bloqueante)
**Estimación:** 3-4h
**Archivo principal:** `services/couchdb.js`

#### Descripción

Crear los builders, sanitizers y helpers CRUD en `couchdb.js` para los nuevos tipos de documento de carnicería. Sin estos modelos, ninguna regla de alerta puede funcionar.

#### Tareas

- [x] Crear `getButcherDbName()` que devuelva el nombre de la BD de carnicería (o reusar `getDeliveryDbName()` si se decide compartir)
- [x] Crear `buildButcherProductDocument({ userId, businessId, name, category, subcategory, sku, pricePerKg, stockKg, minStockKg, unit, conservation })` → documento con `type: 'butcher_product'`
- [x] Crear `sanitizeButcherProduct(doc)` → exponer campos seguros
- [x] Crear `buildButcherBatchDocument({ userId, businessId, productId, batchNumber, origin, slaughterhouse, healthGuide, animalId, receptionDate, expirationDate, receptionWeightKg, currentWeightKg, temperature, healthStatus, zone })` → `type: 'butcher_batch'`
- [x] Crear `sanitizeButcherBatch(doc)`
- [x] Crear `buildButcherWasteDocument({ userId, businessId, productId, batchId, date, wasteKg, reason, category, notes, registeredBy })` → `type: 'butcher_waste'`
- [x] Crear `sanitizeButcherWaste(doc)`
- [x] Crear `buildButcherScaleStatusDocument({ businessId, scaleId, name, connected, ip, model, location })` → `type: 'butcher_scale_status'`
- [x] Crear `sanitizeButcherScaleStatus(doc)`
- [x] Crear `buildButcherInventoryCountDocument({ userId, businessId, date, countedBy, items })` → `type: 'butcher_inventory_count'`, calcular `totalDifferenceKg` y `differencePct` por item
- [x] Crear `sanitizeButcherInventoryCount(doc)`
- [ ] Crear vistas CouchDB (`ensureDesignDocument`) para consultas frecuentes:
  - `butcher_products_by_user` (emisión por `user_id`)
  - `butcher_batches_by_user` (emisión por `user_id`)
  - `butcher_batches_by_expiration` (emisión por `expirationDate`)
  - `butcher_waste_by_user_and_date` (emisión por `[user_id, date]`)
  - `butcher_scales_by_business` (emisión por `business_id`)
  - `butcher_inventory_by_user` (emisión por `user_id`)

#### Criterios de aceptación

- Todos los builders generan `_id` con prefijo de tipo (ej: `butcher_product:uuid`)
- Todos los documentos incluyen `createdAt`, `updatedAt`, `type`
- Los sanitizers eliminan `_rev` y campos internos
- Las vistas CouchDB se crean en `setupDatabaseIndexes()`

#### Conexiones

- **Stock:** `butcher_product.stockKg`, `butcher_product.minStockKg`
- **Trazabilidad:** `butcher_batch` completo
- **Merma:** `butcher_waste` completo
- **Caja/TPV:** extensión de `tpv_register_session`

---

### CARN-ALR-02 — CRUD API de productos, lotes, merma, básculas e inventario

**Tipo:** API / Endpoints
**Prioridad:** 🔴 Crítica (bloqueante)
**Estimación:** 5-6h
**Archivos:** `routers/butcherRouter.js`, `controllers/butcherController.js`
**Depende de:** CARN-ALR-01

#### Descripción

Exponer endpoints REST para gestionar los datos de carnicería que alimentarán las alertas. Seguir el patrón `router → controller → couchdb.js`.

#### Endpoints

**Productos:**
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/products/:userId` | Listar productos del usuario |
| `POST` | `/api/butcher/products/:userId` | Crear producto |
| `PUT` | `/api/butcher/products/:userId/:productId` | Actualizar producto (stock, precio…) |
| `DELETE` | `/api/butcher/products/:userId/:productId` | Borrado lógico |

**Lotes / Trazabilidad:**
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/batches/:userId` | Listar lotes (filtro por estado, producto) |
| `POST` | `/api/butcher/batches/:userId` | Crear lote (recepción de mercancía) |
| `PUT` | `/api/butcher/batches/:userId/:batchId` | Actualizar lote (peso, estado, temperatura) |
| `DELETE` | `/api/butcher/batches/:userId/:batchId` | Borrado lógico |

**Merma:**
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/waste/:userId` | Listar registros de merma (filtro por fecha, producto) |
| `POST` | `/api/butcher/waste/:userId` | Registrar merma |
| `GET` | `/api/butcher/waste/:userId/summary` | Resumen de merma (período, % sobre recepción) |

**Básculas:**
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/scales/:businessId` | Listar básculas registradas |
| `POST` | `/api/butcher/scales/:businessId` | Registrar báscula |
| `PUT` | `/api/butcher/scales/:businessId/:scaleId` | Actualizar estado/ping |
| `POST` | `/api/butcher/scales/:businessId/:scaleId/ping` | Heartbeat de la báscula (la báscula llama este endpoint periódicamente) |

**Inventario:**
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/inventory/:userId` | Listar conteos |
| `POST` | `/api/butcher/inventory/:userId` | Registrar conteo de inventario |
| `GET` | `/api/butcher/inventory/:userId/discrepancies` | Listar discrepancias detectadas |

#### Tareas

- [x] Crear `routers/butcherRouter.js` con todas las rutas
- [x] Crear `controllers/butcherController.js` con handlers
- [x] Montar en `index.js`: `app.use('/api/butcher', requireAuth, burstLimiter, planAwareLimiter, butcherRouter)` + alias `/api/v2/butcher`
- [x] Validar body con comprobaciones manuales (como el resto del proyecto) o Zod si ya se usa
- [x] El endpoint de ping de báscula actualiza `lastPingAt` y `connected: true`
- [x] El endpoint de resumen de merma calcula `totalWasteKg`, `wastePct` (sobre peso de recepción del lote) para un rango de fechas
- [x] El endpoint de discrepancias devuelve ítems con `|differencePct| > umbral` (configurable, por defecto 3%)

#### Criterios de aceptación

- Todos los endpoints devuelven `{ ok: true, ... }` / `{ ok: false, error: '...' }`
- Borrado lógico con `deletedAt`
- Invalidación de caché en escrituras (`invalidateOnWrite`)
- Ping de báscula responde en <100ms (es un heartbeat)

#### Conexiones

- **TPV:** los productos se consultan desde WorkerTpvButcherShop
- **Compras:** la creación de lote puede vincularse a una orden de compra
- **Trazabilidad:** lotes completos con origen animal
- **Stock:** actualización de `stockKg` al vender/registrar merma

---

### CARN-ALR-03 — Motor de alertas de carnicería (butcherAlertEngine)

**Tipo:** Backend / Servicio
**Prioridad:** 🔴 Crítica
**Estimación:** 6-8h
**Archivo principal:** `services/butcherAlertEngine.js`
**Depende de:** CARN-ALR-01, CARN-ALR-02

#### Descripción

Crear el motor de alertas específico de carnicería como módulo independiente que se integra con el `alertEngine.js` existente. Implementa las 8 reglas de detección requeridas.

#### Reglas de alerta

##### Regla 1: Stock crítico (`butcher_stock_critical`)
- **Condición:** `producto.stockKg <= producto.minStockKg * 0.5` (menos de la mitad del mínimo)
- **Nivel:** `alert`
- **Prioridad:** 🔴 Crítica
- **Mensaje:** `"[nombre] tiene solo X.X kg (mínimo: Y kg). Reponer urgentemente."`
- **Ruta:** `/saas/butcher-inventory`
- **Destinatario:** Gerente + Trabajador
- **Dedup key:** `butcherstock-critical-{productId}`

##### Regla 2: Stock bajo (`butcher_stock_low`)
- **Condición:** `producto.stockKg <= producto.minStockKg` y `stockKg > minStockKg * 0.5`
- **Nivel:** `warning`
- **Prioridad:** 🟠 Alta
- **Mensaje:** `"[nombre] tiene X.X kg (mínimo: Y kg). Considere reponer."`
- **Ruta:** `/saas/butcher-inventory`
- **Destinatario:** Gerente
- **Dedup key:** `butcherstock-low-{productId}`

##### Regla 3: Producto agotado (`butcher_product_out_of_stock`)
- **Condición:** `producto.stockKg <= 0` y `producto.active === true`
- **Nivel:** `alert`
- **Prioridad:** 🔴 Crítica
- **Mensaje:** `"[nombre] está AGOTADO. Sin stock disponible."`
- **Ruta:** `/saas/butcher-products`
- **Destinatario:** Gerente + Trabajador
- **Dedup key:** `butcherstock-out-{productId}`

##### Regla 4: Lote caducado (`butcher_batch_expired`)
- **Condición:** `lote.expirationDate < ahora` y `lote.status === 'active'`
- **Nivel:** `alert`
- **Prioridad:** 🔴 Crítica
- **Mensaje:** `"Lote [batchNumber] de [producto] CADUCADO desde el [fecha]. Retirar inmediatamente."`
- **Ruta:** `/saas/butcher-traceability`
- **Destinatario:** Gerente + Trabajador
- **Dedup key:** `butcherbatch-expired-{batchId}`

##### Regla 5: Lote próximo a caducar (`butcher_batch_expiring_soon`)
- **Condición:** `lote.expirationDate` dentro de los próximos N días (configurable, defecto: 3 días) y `lote.status === 'active'`
- **Nivel:** `warning`
- **Prioridad:** 🟠 Alta
- **Mensaje:** `"Lote [batchNumber] de [producto] caduca en X días ([fecha]). Priorizar venta."`
- **Ruta:** `/saas/butcher-traceability`
- **Destinatario:** Gerente + Trabajador
- **Dedup key:** `butcherbatch-expiring-{batchId}`

##### Regla 6: Merma anómala (`butcher_waste_anomaly` / `butcher_waste_critical`)
- **Condición normal:** merma acumulada del día > umbral % del peso recepcionado (configurable, defecto: 8%)
- **Condición crítica:** merma acumulada del día > umbral crítico (configurable, defecto: 15%)
- **Nivel:** `warning` / `alert`
- **Prioridad:** 🟠 Alta / 🔴 Crítica
- **Mensaje:** `"Merma del día: X.X kg (Y% sobre recepción). Umbral: Z%."`
- **Ruta:** `/saas/butcher-inventory`
- **Destinatario:** Gerente
- **Dedup key:** `butcherwaste-{userId}-{fecha}`

##### Regla 7: Precio sin actualizar (`butcher_price_stale`)
- **Condición:** `producto.priceUpdatedAt` hace más de N días (configurable, defecto: 30 días)
- **Nivel:** `warning`
- **Prioridad:** 🟡 Media
- **Mensaje:** `"[nombre] lleva X días sin actualizar precio (último: [fecha])."`
- **Ruta:** `/saas/butcher-products`
- **Destinatario:** Gerente
- **Dedup key:** `butcherprice-{productId}`

##### Regla 8: Báscula desconectada (`butcher_scale_disconnected`)
- **Condición:** `bascula.lastPingAt` hace más de N minutos (configurable, defecto: 5 min) o `bascula.connected === false`
- **Nivel:** `alert`
- **Prioridad:** 🔴 Crítica
- **Mensaje:** `"Báscula [nombre] desconectada desde [hora]. Último ping: [hora]."`
- **Ruta:** `/saas/butcher-products`
- **Destinatario:** Trabajador
- **Dedup key:** `butcherscale-{scaleId}`
- **Nota:** Esta regla se ejecuta con mayor frecuencia (cada 5 min) a diferencia del ciclo estándar de 1h

##### Regla 9: Caja/sesión TPV pendiente de cierre (`butcher_register_pending`)
- **Condición:** sesión TPV de carnicería (`vertical: 'butcherShop'`) abierta hace más de N horas (configurable, defecto: 10h) sin cerrar
- **Nivel:** `warning`
- **Prioridad:** 🟠 Alta
- **Mensaje:** `"Sesión de caja abierta desde [hora] sin cerrar. Pendiente: X tickets."`
- **Ruta:** `/saas/worker`
- **Destinatario:** Trabajador + Gerente
- **Dedup key:** `butcherregister-{sessionId}`

##### Regla 10: Ticket sin cobro (`butcher_ticket_unpaid`)
- **Condición:** ticket de carnicería con `status: 'pending'` hace más de N minutos (configurable, defecto: 30 min)
- **Nivel:** `warning`
- **Prioridad:** 🟠 Alta
- **Mensaje:** `"Ticket [número] pendiente de cobro desde hace X min. Total: Y €."`
- **Ruta:** `/saas/worker`
- **Destinatario:** Trabajador
- **Dedup key:** `butcherticket-{ticketId}`

##### Regla 11: Diferencia de inventario (`butcher_inventory_discrepancy`)
- **Condición:** último conteo de inventario con `|differencePct| > umbral` (configurable, defecto: 3%)
- **Condición crítica:** `|differencePct| > umbral crítico` (configurable, defecto: 8%)
- **Nivel:** `warning` / `alert`
- **Prioridad:** 🟠 Alta / 🔴 Crítica
- **Mensaje:** `"Diferencia de inventario en [producto]: esperado X kg, contado Y kg (Z%)."`
- **Ruta:** `/saas/butcher-inventory`
- **Destinatario:** Gerente
- **Dedup key:** `butcherinv-{countId}-{productId}`

#### Tareas

- [x] Crear `services/butcherAlertEngine.js` con la estructura:
  - `getButcherAlertConfig(account)` → devuelve umbrales con defaults
  - `checkButcherStock(userId, products, config)` → reglas 1, 2, 3
  - `checkButcherBatches(userId, batches, products, config)` → reglas 4, 5
  - `checkButcherWaste(userId, wasteRecords, batches, config)` → regla 6
  - `checkButcherPrices(userId, products, config)` → regla 7
  - `checkButcherScales(userId, scales, config)` → regla 8
  - `checkButcherRegister(userId, tpvSessions, config)` → regla 9
  - `checkButcherTickets(userId, tickets, config)` → regla 10
  - `checkButcherInventory(userId, counts, config)` → regla 11
  - `runButcherAlertsForUser(userId)` → orquesta todas las reglas
  - `startButcherAlertEngine()` → scheduler propio
- [x] Reutilizar `emitAlert()` del `alertEngine.js` existente (exportarla o extraerla a un módulo compartido `services/alertEmitter.js`)
- [x] Ejecutar las reglas de báscula cada 5 minutos (ciclo rápido independiente)
- [x] Ejecutar el resto de reglas cada 30 minutos (más frecuente que el motor genérico de 1h, porque carnicería es perecedera)
- [x] Filtrar solo usuarios con `account.businessType === 'butcherShop'`

#### Criterios de aceptación

- Cada regla tiene toggle on/off en configuración
- Cada regla tiene umbral configurable
- Deduplicación diaria (no repetir la misma alerta en 24h)
- Logs con tag `BUTCHER_ALERT_ENGINE`
- Las reglas que no encuentran datos (negocio sin productos de carnicería) no fallan ni emiten alertas vacías
- Báscula con ciclo de 5 min separado del ciclo principal de 30 min

#### Conexiones

- **Alertas Core:** usa `emitAlert()` → persiste en `notifications` DB → SSE + Push
- **Stock:** lee `butcher_product.stockKg` y `minStockKg`
- **Trazabilidad:** lee `butcher_batch.expirationDate`
- **Merma:** lee `butcher_waste` del día
- **Compras:** precio de producto vs precio de proveedor
- **TPV/Caja:** lee `tpv_register_session` con `vertical: 'butcherShop'`

---

### CARN-ALR-04 — Configuración de alertas de carnicería

**Tipo:** Backend / API
**Prioridad:** 🟠 Alta
**Estimación:** 2-3h
**Archivos:** `controllers/alertController.js`, `services/butcherAlertEngine.js`
**Depende de:** CARN-ALR-03

#### Descripción

Extender la configuración de alertas (`account.alertConfig`) para incluir los umbrales específicos de carnicería, y exponer su lectura/escritura a través de la API existente.

#### Nuevos campos de configuración

```javascript
{
  // Carnicería — Stock
  butcherStockAlertEnabled: true,           // Toggle global stock carnicería
  butcherStockCriticalPct: 50,              // % del mínimo para nivel crítico (default 50)

  // Carnicería — Lotes
  butcherBatchAlertEnabled: true,           // Toggle alertas de lote
  butcherBatchExpiringDays: 3,              // Días antes de caducidad para warning

  // Carnicería — Merma
  butcherWasteAlertEnabled: true,           // Toggle alertas de merma
  butcherWasteWarningPct: 8,               // % merma para warning
  butcherWasteCriticalPct: 15,             // % merma para critical

  // Carnicería — Precios
  butcherPriceAlertEnabled: true,           // Toggle alertas de precio
  butcherPriceStaleDays: 30,               // Días sin actualizar para alertar

  // Carnicería — Báscula
  butcherScaleAlertEnabled: true,           // Toggle alertas de báscula
  butcherScaleTimeoutMinutes: 5,            // Minutos sin ping = desconectada

  // Carnicería — Caja
  butcherRegisterAlertEnabled: true,        // Toggle alertas de caja
  butcherRegisterMaxHours: 10,              // Horas máx. de sesión abierta
  butcherTicketUnpaidMinutes: 30,           // Minutos para ticket sin cobro

  // Carnicería — Inventario
  butcherInventoryAlertEnabled: true,       // Toggle alertas de inventario
  butcherInventoryWarningPct: 3,            // % diferencia para warning
  butcherInventoryCriticalPct: 8,           // % diferencia para critical
}
```

#### Tareas

- [x] Añadir las nuevas claves al array `allowedKeys` en `updateAlertSettings` del `alertController.js`
- [x] Añadir defaults en `getButcherAlertConfig()` del `butcherAlertEngine.js`
- [ ] Documentar los campos con comentarios en el código
- [ ] Validar tipos numéricos (parsear a `Number`, rechazar NaN) y booleanos

#### Criterios de aceptación

- `GET /api/alerts/:userId/config` devuelve todos los campos de carnicería con defaults
- `PUT /api/alerts/:userId/config` acepta cualquier subconjunto de campos de carnicería
- Valores fuera de rango razonable se rechazan con error 400 (ej: `butcherBatchExpiringDays: -5`)

---

### CARN-ALR-05 — Distribución por perfil (gerente vs trabajador)

**Tipo:** Backend / Lógica
**Prioridad:** 🟠 Alta
**Estimación:** 3-4h
**Archivos:** `services/butcherAlertEngine.js`, `services/sseService.js`
**Depende de:** CARN-ALR-03

#### Descripción

Implementar la distribución diferenciada de alertas según el rol del usuario (gerente/owner vs trabajador/employee). El gerente recibe todas las alertas; el trabajador solo las operativas de su turno.

#### Diseño

```
ALERTA GENERADA
      │
      ├─── metadata.audience incluye 'manager'?
      │         │
      │         └── SÍ → emitAlert para userId del owner/admin del negocio
      │                   + broadcastToBusiness (evento 'butcher_alert')
      │
      └─── metadata.audience incluye 'worker'?
                │
                └── SÍ → broadcastToBusiness con filtro a users con rol worker
                          que tengan sesión TPV activa (turno actual)
```

#### Tareas

- [x] Añadir campo `audience` al metadata de cada alerta: `['manager']`, `['worker']`, o `['manager', 'worker']`
- [ ] Crear helper `getBusinessOwnerUserId(businessId)` que devuelve el userId del propietario del negocio
- [ ] Crear helper `getActiveWorkerUserIds(businessId)` que devuelve los userIds de trabajadores con sesión TPV activa
- [ ] Modificar el flujo de emisión para que, además de `emitAlert()` al userId original, también emita a los userIds de los roles correspondientes según `audience`
- [ ] Añadir evento SSE `butcher_alert` diferenciado del `notification` genérico, para que el frontend pueda filtrar
- [ ] Los trabajadores solo reciben alertas de las últimas 12h (ventana de turno)

#### Criterios de aceptación

- El gerente ve en su dashboard TODAS las alertas de carnicería del negocio
- El trabajador solo ve alertas operativas: báscula, producto agotado, ticket sin cobro, lote caducado, caja pendiente
- No se duplican alertas (si el gerente también es el usuario que genera la alerta, no recibe doble)
- Evento SSE `butcher_alert` con campo `audience` para que el frontend filtre

---

### CARN-ALR-06 — Integración con Dashboard (KPIs de carnicería)

**Tipo:** Backend / API
**Prioridad:** 🟠 Alta
**Estimación:** 3-4h
**Archivo:** `index.js` (handler GET /api/dashboard/kpis)
**Depende de:** CARN-ALR-03

#### Descripción

Extender el endpoint de KPIs del dashboard para incluir un bloque específico de alertas de carnicería cuando el negocio es `butcherShop`. Se integra con el array `dashAlerts` existente.

#### Nuevos KPIs

```javascript
// Dentro del handler GET /api/dashboard/kpis/:userId
// Solo si account.businessType === 'butcherShop'

butcherKpis: {
  totalProducts: 45,
  outOfStockProducts: 2,
  lowStockProducts: 5,
  activeBatches: 12,
  expiringBatches: 3,
  expiredBatches: 1,
  todayWasteKg: 4.2,
  todayWastePct: 3.5,
  connectedScales: 2,
  disconnectedScales: 0,
  openRegisterSessions: 1,
  unpaidTickets: 0,
  lastInventoryDate: '2026-04-13',
  inventoryDiscrepancies: 1,
  stalePriceProducts: 3,
}
```

#### Nuevas dashAlerts (para negocio carnicería)

```javascript
// Se añaden al array dashAlerts existente

{ id: 'butcher_expired', severity: 'error', type: 'butcher_expired',
  message: '1 lote caducado — Retirar inmediatamente', count: 1,
  route: '/saas/butcher-traceability' }

{ id: 'butcher_out_of_stock', severity: 'error', type: 'butcher_out_of_stock',
  message: '2 productos agotados', count: 2,
  route: '/saas/butcher-products' }

{ id: 'butcher_expiring', severity: 'warning', type: 'butcher_expiring',
  message: '3 lotes caducan en menos de 3 días', count: 3,
  route: '/saas/butcher-traceability' }

{ id: 'butcher_low_stock', severity: 'warning', type: 'butcher_low_stock',
  message: '5 productos con stock bajo', count: 5,
  route: '/saas/butcher-inventory' }

{ id: 'butcher_scale_down', severity: 'error', type: 'butcher_scale_down',
  message: 'Báscula mostrador 1 desconectada', count: 1,
  route: '/saas/butcher-products' }

{ id: 'butcher_waste_high', severity: 'warning', type: 'butcher_waste_high',
  message: 'Merma del día: 4.2 kg (3.5%)', count: 1,
  route: '/saas/butcher-inventory' }
```

#### Tareas

- [x] Detectar `account.businessType === 'butcherShop'` en el handler de KPIs
- [x] Fetch de datos: productos, lotes, merma del día, básculas, sesiones TPV, último inventario
- [x] Calcular `butcherKpis` con los conteos
- [x] Generar `dashAlerts` específicos según condiciones
- [x] Incluir `butcherKpis` en el response solo para negocios carnicería
- [x] No alterar el comportamiento para otros tipos de negocio

#### Criterios de aceptación

- Endpoint `/api/dashboard/kpis/:userId` para `butcherShop` devuelve campo `butcherKpis`
- Las dashAlerts de carnicería aparecen junto a las genéricas (impagos, fichajes, etc.)
- Respetar caché existente (`cacheService.TTL_PRESETS.KPI`)
- No impactar performance para otros tipos de negocio

---

### CARN-ALR-07 — Endpoint resumen de alertas de carnicería

**Tipo:** Backend / API
**Prioridad:** 🟡 Media
**Estimación:** 2-3h
**Archivos:** `controllers/alertController.js`, `services/butcherAlertEngine.js`
**Depende de:** CARN-ALR-03

#### Descripción

Crear un endpoint dedicado que devuelva el resumen completo de alertas activas de carnicería, similar a `getAlertSummary()` pero específico para la vertical. Se usa en el centro de alertas del frontend.

#### Endpoint

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher/alerts/:userId/summary` | Resumen completo de alertas de carnicería |

#### Response

```json
{
  "ok": true,
  "updatedAt": "2026-04-14T12:00:00Z",
  "config": { "...butcherAlertConfig..." },
  "totals": {
    "critical": 4,
    "warning": 8,
    "info": 0,
    "total": 12
  },
  "stock": {
    "outOfStock": [{ "id": "...", "name": "Solomillo", "stockKg": 0, "minStockKg": 3 }],
    "lowStock": [{ "id": "...", "name": "Chuletón", "stockKg": 2.1, "minStockKg": 5 }],
    "critical": [{ "id": "...", "name": "Pechuga", "stockKg": 0.8, "minStockKg": 4 }]
  },
  "batches": {
    "expired": [{ "id": "...", "batchNumber": "LOT-001", "product": "Costillas", "expirationDate": "2026-04-12", "daysExpired": 2 }],
    "expiringSoon": [{ "id": "...", "batchNumber": "LOT-005", "product": "Chuletón", "expirationDate": "2026-04-16", "daysLeft": 2 }]
  },
  "waste": {
    "todayKg": 4.2,
    "todayPct": 3.5,
    "weekAvgKg": 3.1,
    "isAnomaly": true,
    "threshold": 8
  },
  "prices": {
    "staleProducts": [{ "id": "...", "name": "Lomo", "lastUpdate": "2026-03-01", "daysSinceUpdate": 44 }]
  },
  "scales": {
    "connected": 2,
    "disconnected": [{ "scaleId": "scale-1", "name": "Báscula mostrador 1", "lastPing": "2026-04-14T11:50:00Z", "minutesAgo": 15 }]
  },
  "register": {
    "pendingSessions": [{ "sessionId": "...", "openedAt": "2026-04-14T07:00:00Z", "hoursOpen": 5, "pendingTickets": 2 }]
  },
  "inventory": {
    "lastCountDate": "2026-04-13",
    "discrepancies": [{ "productId": "...", "name": "Costillas", "expectedKg": 15, "countedKg": 13.5, "differencePct": -10 }]
  }
}
```

#### Tareas

- [x] Crear `getButcherAlertSummary(userId)` en `butcherAlertEngine.js`
- [x] Crear handler `getButcherAlerts` en `butcherController.js`
- [x] Añadir ruta `GET /api/butcher/alerts/:userId/summary` al `butcherRouter.js`
- [x] Calcular promedios semanales de merma para comparación
- [ ] Incluir flag `isAnomaly` calculado contra la media semanal *(existe `isAnomaly`, pero se calcula contra el umbral configurado, no contra la media semanal)*

#### Criterios de aceptación

- El endpoint devuelve datos en tiempo real (sin caché o con TTL corto de 60s)
- Todos los bloques son opcionales (si no hay datos de merma, `waste` tiene valores a 0)
- Los arrays están ordenados por severidad (más crítico primero)

---

### CARN-ALR-08 — Arranque y registro del motor en index.js

**Tipo:** Backend / Integración
**Prioridad:** 🟠 Alta
**Estimación:** 1h
**Archivo:** `index.js`
**Depende de:** CARN-ALR-03

#### Descripción

Registrar el motor de alertas de carnicería en el arranque del servidor, junto al motor genérico existente.

#### Tareas

- [x] Importar `startButcherAlertEngine` en `index.js`
- [x] Añadir llamada en el bloque de arranque (junto a `startAlertEngine()`):
  ```javascript
  // Butcher alert engine — ciclo de 30 min + báscula cada 5 min
  startButcherAlertEngine();
  ```
- [x] Asegurar que el delay de inicio es posterior al del motor genérico (ej: 20s vs 15s)
- [x] Añadir log de inicio: `Motor de alertas de carnicería arrancado`
- [x] Exportar `stopButcherAlertEngine()` para shutdown limpio

#### Criterios de aceptación

- El motor arranca sin errores aunque no haya negocios de carnicería
- Los logs muestran el arranque con tag `BUTCHER_ALERT_ENGINE`
- El motor se puede detener limpiamente (clearInterval)

---

### CARN-ALR-09 — Extracción de emitAlert a módulo compartido

**Tipo:** Refactor
**Prioridad:** 🟡 Media
**Estimación:** 1-2h
**Archivos:** `services/alertEmitter.js` (nuevo), `services/alertEngine.js`, `services/butcherAlertEngine.js`
**Depende de:** CARN-ALR-03

#### Descripción

Extraer la función `emitAlert()` y helpers relacionados (`daysBetween`, `fetchAllDocsOfType`, `fetchAllDocs`) del `alertEngine.js` a un módulo compartido, para que tanto el motor genérico como el de carnicería lo usen sin duplicar código.

#### Tareas

- [x] Crear `services/alertEmitter.js` con:
  - `emitAlert({ userId, dedupKey, level, category, title, message, entityId, entityType, route, metadata })` *(implementado como `emitGlobalAlert`)*
  - `daysBetween(dateStr, now)`
  - `fetchAllDocsOfType(dbName, type)`
  - `fetchAllDocs(dbName)`
- [x] Modificar `alertEngine.js` para importar desde `alertEmitter.js`
- [x] El `butcherAlertEngine.js` importa desde `alertEmitter.js`
- [ ] Verificar que los tests existentes (si los hay) siguen pasando

#### Criterios de aceptación

- Zero cambio funcional en el motor genérico
- Ambos motores usan las mismas funciones de emisión
- Sin duplicación de código

---

### CARN-ALR-10 — Heartbeat de báscula y detección de desconexión

**Tipo:** Backend / Servicio
**Prioridad:** 🟠 Alta
**Estimación:** 2-3h
**Archivos:** `services/butcherAlertEngine.js`, `controllers/butcherController.js`
**Depende de:** CARN-ALR-02, CARN-ALR-03

#### Descripción

Implementar el sistema de heartbeat para básculas y la detección activa de desconexión con un ciclo rápido de verificación.

#### Diseño

```
BÁSCULA (software/driver local)
    │
    │  POST /api/butcher/scales/:businessId/:scaleId/ping
    │  cada 60 segundos
    │
    ▼
BACKEND
    │
    │  Actualiza lastPingAt + connected = true
    │
    ▼
CICLO RÁPIDO (cada 5 min)
    │
    │  Para cada báscula:
    │    if (now - lastPingAt > scaleTimeoutMinutes)
    │      → connected = false
    │      → emitAlert('butcher_scale_disconnected')
    │
    ▼
ALERTA → SSE a trabajadores del negocio
```

#### Tareas

- [x] Endpoint de ping: recibe `{ weight?: number, status?: string }` opcional (la báscula puede enviar peso actual y estado)
- [x] Actualizar `lastPingAt`, `connected: true`, y opcionalmente `lastWeight`, `lastStatus`
- [x] En el ciclo rápido del motor: marcar `connected: false` si timeout y emitir alerta
- [ ] Cuando la báscula vuelve a hacer ping tras desconexión: emitir evento SSE `butcher_scale_reconnected` (info, no alerta)
- [ ] Rate limiting específico para el ping (mayor que el normal: 100 req/min ya que es un heartbeat)

#### Criterios de aceptación

- El ping responde en <100ms
- La desconexión se detecta en un máximo de 5 minutos
- No se emiten alertas repetidas si la báscula sigue desconectada (dedup diaria)
- La reconexión genera un evento informativo (no alerta)

---

## Mapa de conexiones

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MAPA DE CONEXIONES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌─────────────────┐     ┌──────────────┐                 │
│  │   TPV   │────▶│ butcher_product  │◀────│   Compras    │                 │
│  │WorkerTpv│     │ (stock, precio)  │     │(órdenes comp)│                 │
│  └────┬────┘     └───────┬─────────┘     └──────┬───────┘                 │
│       │                  │                       │                         │
│       │           ┌──────▼─────────┐     ┌──────▼───────┐                 │
│       │           │ butcher_batch   │     │purchase_order│                 │
│       │           │ (trazabilidad)  │     │(proveedor)   │                 │
│       │           └──────┬─────────┘     └──────────────┘                 │
│       │                  │                                                 │
│       │           ┌──────▼─────────┐                                      │
│       │           │ butcher_waste   │                                      │
│       │           │ (merma)         │                                      │
│       │           └────────────────┘                                       │
│       │                                                                    │
│  ┌────▼──────────┐  ┌──────────────┐                                      │
│  │tpv_register   │  │butcher_scale │                                      │
│  │_session (caja)│  │_status       │                                      │
│  └────┬──────────┘  └──────┬───────┘                                      │
│       │                    │                                               │
│       └────────┬───────────┘                                               │
│                ▼                                                            │
│  ┌─────────────────────────┐                                               │
│  │  butcherAlertEngine.js  │                                               │
│  │  (11 reglas de alerta)  │                                               │
│  └────────────┬────────────┘                                               │
│               │                                                            │
│    ┌──────────┼──────────┬───────────────┐                                │
│    ▼          ▼          ▼               ▼                                 │
│ ┌──────┐ ┌────────┐ ┌────────┐  ┌──────────────┐                         │
│ │ SSE  │ │  Push  │ │CouchDB │  │  Dashboard   │                         │
│ │(real │ │(back-  │ │notif.  │  │  KPIs +      │                         │
│ │time) │ │ground) │ │(core)  │  │  dashAlerts  │                         │
│ └──┬───┘ └───┬────┘ └───┬────┘  └──────┬───────┘                         │
│    │         │          │               │                                  │
│    └─────────┴──────┬───┴───────────────┘                                 │
│                     ▼                                                      │
│         ┌─────────────────────┐                                           │
│         │   FRONTEND DESTINO  │                                           │
│         ├──────────┬──────────┤                                           │
│         │ Dashboard│ Pantalla │                                           │
│         │ (gerente)│operativa │                                           │
│         │          │(trabaj.) │                                           │
│         └──────────┴──────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prioridades y clasificación

### Matriz de prioridad

| Prioridad | Color | Nivel | Ejemplo | Acción esperada |
|---|---|---|---|---|
| 🔴 **Crítica** | Rojo | `alert` | Lote caducado, báscula caída, producto agotado | Acción inmediata, notificación push |
| 🟠 **Alta** | Naranja | `warning` | Stock bajo, lote próximo, merma anómala, caja abierta | Atender en el turno actual |
| 🟡 **Media** | Amarillo | `warning` | Precio obsoleto, diferencia inventario leve | Revisar en las próximas 24-48h |
| 🟢 **Informativa** | Verde | `info` | Báscula reconectada, inventario completado | Solo registro, sin acción |

### Orden de ejecución (por impacto en negocio)

```
1. 🔴 butcher_batch_expired        — Riesgo sanitario, retirada inmediata
2. 🔴 butcher_scale_disconnected   — Bloquea ventas por peso
3. 🔴 butcher_product_out_of_stock — Pérdida de ventas directa
4. 🔴 butcher_stock_critical       — A punto de agotar
5. 🟠 butcher_batch_expiring_soon  — Priorizar venta antes de perder
6. 🟠 butcher_waste_anomaly        — Pérdida económica en curso
7. 🟠 butcher_register_pending     — Riesgo de descuadre de caja
8. 🟠 butcher_ticket_unpaid        — Cobro pendiente
9. 🟠 butcher_stock_low            — Reponer pronto
10. 🟠 butcher_inventory_discrepancy — Investigar diferencias
11. 🟡 butcher_price_stale          — Revisar competitividad
```

### Canales por tipo de alerta

| Alerta | Dashboard | Notificación (Core) | SSE (real-time) | Push | Pantalla operativa |
|---|---|---|---|---|---|
| Lote caducado | ✅ | ✅ | ✅ | ✅ | ✅ |
| Báscula desconectada | ✅ | ✅ | ✅ | ❌ | ✅ |
| Producto agotado | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stock crítico | ✅ | ✅ | ✅ | ✅ | ❌ |
| Lote próximo a caducar | ✅ | ✅ | ✅ | ❌ | ✅ |
| Merma anómala | ✅ | ✅ | ✅ | ✅ | ❌ |
| Caja pendiente | ✅ | ✅ | ✅ | ❌ | ✅ |
| Ticket sin cobro | ❌ | ✅ | ✅ | ❌ | ✅ |
| Stock bajo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Diferencia inventario | ✅ | ✅ | ✅ | ✅ | ❌ |
| Precio obsoleto | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Orden de implementación recomendado

```
Fase 1 — Cimientos (semana 1)
  CARN-ALR-01  Modelos CouchDB           ← Bloqueante para todo
  CARN-ALR-09  Extraer emitAlert         ← Facilita CARN-ALR-03
  CARN-ALR-02  CRUD API                  ← Bloqueante para datos

Fase 2 — Motor de alertas (semana 2)
  CARN-ALR-03  Motor butcherAlertEngine  ← Core del módulo
  CARN-ALR-04  Configuración             ← Habilita personalización
  CARN-ALR-08  Arranque en index.js      ← Poner en marcha

Fase 3 — Distribución y dashboard (semana 2-3)
  CARN-ALR-05  Perfil gerente/trabajador ← Distribución por rol
  CARN-ALR-06  Dashboard KPIs            ← Visibilidad en panel
  CARN-ALR-07  Endpoint resumen          ← Centro de alertas

Fase 4 — Hardware y refinamiento (semana 3)
  CARN-ALR-10  Heartbeat báscula         ← Integración hardware
```

---

## Estimación total

| Ticket | Estimación | Fase |
|---|---|---|
| CARN-ALR-01 | 3-4h | 1 |
| CARN-ALR-02 | 5-6h | 1 |
| CARN-ALR-03 | 6-8h | 2 |
| CARN-ALR-04 | 2-3h | 2 |
| CARN-ALR-05 | 3-4h | 3 |
| CARN-ALR-06 | 3-4h | 3 |
| CARN-ALR-07 | 2-3h | 3 |
| CARN-ALR-08 | 1h | 2 |
| CARN-ALR-09 | 1-2h | 1 |
| CARN-ALR-10 | 2-3h | 4 |
| **TOTAL** | **~29-38h** | **~3 semanas** |
