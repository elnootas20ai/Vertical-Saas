# Merma y Pérdidas — Carnicería

> **Módulo:** `butcherWaste`
> **Página:** `/saas/vertical/carniceria/merma`
> **Tipo:** Full-stack (Backend + Frontend)
> **Prioridad global:** Alta
> **Vertical:** `butcherShop`
> **Fecha:** 2026-04-14

---

## Índice

1. [Contexto y estado actual](#contexto-y-estado-actual)
2. [Arquitectura propuesta](#arquitectura-propuesta)
3. [Modelo de datos](#modelo-de-datos)
4. [Tickets](#tickets)
5. [Mapa de conexiones](#mapa-de-conexiones)
6. [Orden de ejecución](#orden-de-ejecución)

---

## Contexto y estado actual

### Objetivo del módulo

Registrar las pérdidas reales de producto (hueso, grasa, recortes, caducados, rotura, pérdida manual) para conocer el coste real del negocio. La merma es la diferencia entre el peso de la materia prima comprada y el peso del producto vendido — en una carnicería esta diferencia es significativa y varía por producto, trabajador y proceso.

### Lo que ya existe

| Componente | Estado | Ubicación |
|---|---|---|
| Página frontend `ButcherWaste.tsx` | ⚠️ Solo UI local (useState, datos mock) | `src/app/pages/saas/ButcherWaste.tsx` |
| Ruta `/saas/butcher-waste` | ✅ Registrada | `src/app/routes.tsx` línea 659 |
| Hub de carnicería con KPI merma | ⚠️ Solo UI local (datos mock) | `src/app/pages/saas/ButcherHub.tsx` |
| Motor de alertas genérico | ✅ Funcional | `services/alertEngine.js` |
| Sistema de notificaciones + SSE + Push | ✅ Funcional | `services/alertEmitter.js`, `sseService.js`, `pushService.js` |
| Stock movements (kardex) | ✅ Funcional | `services/stockMovementService.js` |
| Catálogo de productos | ✅ Funcional | `catalog_item` en BD catálogo |
| Finanzas (cobros/pagos) | ✅ Funcional | `controllers/financeController.js` |
| Roles y permisos | ✅ Funcional | `ROLE_DEFINITIONS`, `TEAM_PERMISSION_KEYS` en `couchdb.js` |
| Fichajes / trabajadores | ✅ Funcional | `clockinsController.js`, `orgchartController.js` |
| Constantes de alertas | ✅ Funcional | `services/alertConstants.js` |
| Modelo CouchDB `butcher_waste` | ❌ No existe | — |
| API REST de merma | ❌ No existe | — |
| Servicio de merma | ❌ No existe | — |
| Alertas específicas de merma | ❌ No existe | — |
| Descuento automático de stock por merma | ❌ No existe | — |
| Impacto en coste real (finanzas) | ❌ No existe | — |
| Cálculo de % merma por producto/periodo | ❌ No existe | — |
| Ruta `/saas/vertical/carniceria/merma` | ❌ No existe | — |

### Brechas vs requisitos

| # | Requisito | Estado actual | Brecha |
|---|---|---|---|
| 1 | Tipos de merma: hueso, grasa, recortes, caducado, rotura, pérdida manual | UI tiene: caducidad, deterioro, corte, devolucion, rotura_frio, otro | Tipos no coinciden con los requeridos |
| 2 | Campos: producto, peso, motivo, fecha, trabajador, lote, observaciones | UI tiene todos menos trabajador real (texto libre) y lote vinculado | No hay vinculación a catálogo ni a lotes reales |
| 3 | Descontar stock automáticamente | No existe | Falta servicio + hook |
| 4 | Actualizar coste real | No existe | Falta lógica de coste real |
| 5 | Guardar historial | No hay persistencia | Solo datos en memoria (useState) |
| 6 | Calcular % merma por producto y periodo | No existe | Falta servicio de analíticas |
| 7 | Alerta: merma elevada | No existe | Falta regla en motor de alertas |
| 8 | Alerta: merma repetida | No existe | Falta regla en motor de alertas |
| 9 | Alerta: producto caducado | No existe | Falta regla en motor de alertas |
| 10 | Alerta: lote con demasiada pérdida | No existe | Falta regla en motor de alertas |
| 11 | Conexión Stock | No existe | Falta integración bidireccional |
| 12 | Conexión Finanzas | No existe | Falta generación de movimiento financiero |
| 13 | Conexión Trabajadores | No existe | Falta vinculación con `user_id` de trabajadores |
| 14 | Conexión Informes | No existe | Falta endpoints de reporting |
| 15 | Conexión Alertas Core | No existe | Falta integración con `alertEngine` |
| 16 | Perfil gerente: revisa y analiza | No existe | UI no tiene vistas diferenciadas |
| 17 | Perfil trabajador: registra con motivo | No existe | No hay restricción por rol |

### Patrón de integración actual

El frontend de `ButcherWaste.tsx` usa `useState` con datos mock `INITIAL_DATA`. No hace ninguna llamada API. Los tipos de merma actuales (`MotivoMerma`) son: `caducidad`, `deterioro`, `corte`, `devolucion`, `rotura_frio`, `otro`.

El backend tiene `stockMovementService.js` con tipos válidos: `purchase_reception`, `sale`, `internal_consumption`, `adjustment_in`, `adjustment_out`, `transfer`, `return_supplier`, `return_customer`, `initial`. No incluye `waste` ni `merma`.

---

## Arquitectura propuesta

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MÓDULO MERMA Y PÉRDIDAS                              │
│                                                                          │
│  ┌─────────────────────┐      ┌──────────────────────┐                  │
│  │   FRONTEND          │      │     BACKEND           │                  │
│  │                     │      │                       │                  │
│  │  ButcherWaste.tsx   │ ──── │  butcherWasteRouter   │                  │
│  │  (refactored)       │ HTTP │  butcherWasteCtrl     │                  │
│  │                     │      │  butcherWasteService   │                  │
│  │  wasteApi.ts        │      │                       │                  │
│  │  (nuevo client)     │      │                       │                  │
│  └────────┬────────────┘      └───────────┬───────────┘                  │
│           │                               │                              │
│           │                     ┌─────────┴──────────┐                  │
│           │                     │                    │                    │
│           │              ┌──────▼───────┐    ┌───────▼───────┐          │
│           │              │   CouchDB    │    │  Automatización │          │
│           │              │              │    │                 │          │
│           │              │ butcher_waste│    │ ① Descontar    │          │
│           │              │ (documento)  │    │    stock        │          │
│           │              │              │    │ ② Actualizar    │          │
│           │              │ stock_movement│   │    coste real   │          │
│           │              │ (tipo: waste)│    │ ③ Registrar     │          │
│           │              │              │    │    historial    │          │
│           │              │ cobro/pago   │    │ ④ Calcular %   │          │
│           │              │ (gasto merma)│    │    merma        │          │
│           │              └──────────────┘    │ ⑤ Evaluar       │          │
│           │                                  │    alertas      │          │
│           │                                  └─────────────────┘          │
│           │                                                              │
│  ┌────────▼────────────────────────────────────────────────────────┐    │
│  │                    CONEXIONES                                    │    │
│  │                                                                  │    │
│  │  Stock ◄──► catalog_item.stockQuantity (descontar al registrar) │    │
│  │  Finanzas ◄──► movimiento tipo 'pago' con categoría 'merma'    │    │
│  │  Trabajadores ◄──► registeredBy = worker user_id               │    │
│  │  Informes ◄──► endpoints de analíticas/resumen                 │    │
│  │  Alertas Core ◄──► emitAlert() → notifications + SSE + Push    │    │
│  │  Lotes ◄──► batchId vincula merma a lote de trazabilidad       │    │
│  │  Hub Carnicería ◄──► KPIs de merma en ButcherHub.tsx           │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Flujo principal: registrar merma

```
Trabajador abre /saas/vertical/carniceria/merma
    │
    ├── Selecciona producto (del catálogo real vía API)
    ├── Introduce peso (kg / unidades)
    ├── Selecciona motivo (hueso, grasa, recortes, caducado, rotura, pérdida manual)
    ├── Fecha (default: hoy)
    ├── Lote (opcional, selector de lotes activos del producto)
    ├── Observaciones
    │
    └── [Registrar merma]
         │
         ├── ① Crear documento `butcher_waste` en CouchDB
         ├── ② Crear `stock_movement` tipo 'waste' (descuenta stockQuantity)
         ├── ③ Actualizar `catalog_item.stockQuantity` -= peso
         ├── ④ Si hay lote → actualizar `butcher_batch.currentWeightKg` -= peso
         ├── ⑤ Calcular coste estimado = peso × costPrice del producto
         ├── ⑥ Registrar gasto en finanzas (si configurado)
         ├── ⑦ Evaluar reglas de alerta:
         │    ├── ¿Merma del día supera umbral? → alerta merma elevada
         │    ├── ¿Mismo producto/motivo repetido? → alerta merma repetida
         │    ├── ¿Motivo = caducado? → alerta producto caducado
         │    └── ¿Lote acumula mucha pérdida? → alerta lote con pérdida alta
         └── ⑧ Emitir alerta vía SSE al gerente si aplica
```

### Flujo por perfil

```
GERENTE (Admin/Gerente):
  ├── Ve dashboard analítico completo (KPIs, gráficas, tendencias)
  ├── Filtra mermas por trabajador, producto, motivo, periodo
  ├── Revisa mermas pendientes de validación
  ├── Marca mermas como revisadas/aprobadas/disputadas
  ├── Configura umbrales de alertas de merma
  ├── Exporta informes de merma
  ├── Ve coste real por producto (incorporando merma)
  └── Ve ranking de merma por trabajador

TRABAJADOR (Usuario):
  ├── Registra mermas de productos (solo los autorizados)
  ├── Selecciona motivo obligatorio
  ├── Ve historial de SUS propias mermas
  ├── NO ve costes ni análisis financiero
  ├── NO puede editar ni eliminar mermas ya registradas
  └── NO configura alertas
```

---

## Modelo de datos

### Documento principal: `butcher_waste`

```json
{
  "_id": "butcher_waste:{user_id}:{uuid}",
  "_rev": "...",
  "type": "butcher_waste",
  "user_id": "owner-user-id",
  "business_id": "business-uuid",

  "catalogItemId": "catitem-uuid",
  "catalogItemName": "Solomillo de ternera",
  "catalogItemSku": "SOL-001",

  "batchId": "butcher_batch:uuid",
  "batchNumber": "LOT-2026-0412",

  "wasteType": "hueso",
  "weight": 2.3,
  "unit": "kg",

  "estimatedCost": 55.20,
  "costPriceAtTime": 24.00,

  "date": "2026-04-14",
  "registeredBy": "worker-user-id",
  "registeredByName": "Carlos García",

  "reviewStatus": "pending",
  "reviewedBy": null,
  "reviewedByName": null,
  "reviewedAt": null,
  "reviewNotes": null,

  "notes": "Hueso limpio de cadera, no aprovechable",

  "stockMovementId": "smov-uuid",
  "financeMovementId": null,

  "createdAt": "2026-04-14T10:00:00.000Z",
  "updatedAt": "2026-04-14T10:00:00.000Z",
  "deletedAt": null
}
```

### Tipos de merma (`wasteType`)

| Clave | Etiqueta | Descripción | Icono sugerido |
|---|---|---|---|
| `hueso` | Hueso | Peso del hueso al deshuesar piezas | 🦴 |
| `grasa` | Grasa | Grasa retirada durante el despiece | 💧 |
| `recortes` | Recortes | Recortes, nervios, fascias no vendibles | ✂️ |
| `caducado` | Caducado | Producto retirado por fecha de caducidad | 📅 |
| `rotura` | Rotura | Rotura de frío, embalaje dañado, accidente | 💥 |
| `perdida_manual` | Pérdida manual | Merma no clasificada, pérdida desconocida, hurto | ❓ |

### Extensiones a documentos existentes

**`stock_movement`** — Nuevo tipo de movimiento:

```javascript
// Añadir a VALID_MOVEMENT_TYPES en stockMovementService.js
'waste'

// Añadir a OUTBOUND_TYPES
'waste'
```

El `stock_movement` generado al registrar merma tendrá:
- `movementType: 'waste'`
- `referenceId`: ID del `butcher_waste`
- `referenceType: 'butcher_waste'`

**`alertConstants.js`** — Nuevas categorías:

```javascript
// Añadir a CATEGORY_TO_SOURCE
butcher_waste_high: 'stock',
butcher_waste_repeated: 'stock',
butcher_waste_expired_product: 'stock',
butcher_waste_batch_loss: 'stock',
```

---

## Tickets

---

### MRM-01 — Modelo CouchDB: `butcher_waste` + builder + sanitizer

**Tipo:** Backend / Infraestructura
**Prioridad:** 🔴 Crítica (bloqueante)
**Estimación:** 2-3h
**Archivo principal:** `services/couchdb.js`
**Dependencias:** Ninguna

#### Descripción

Crear el builder, sanitizer y helpers de consulta para el documento `butcher_waste` en `services/couchdb.js`. Este documento es el núcleo de todo el módulo — sin él no se puede persistir nada.

#### Tareas

- [ ] Crear `buildButcherWasteDocument({ userId, businessId, catalogItemId, catalogItemName, catalogItemSku, batchId, batchNumber, wasteType, weight, unit, estimatedCost, costPriceAtTime, date, registeredBy, registeredByName, notes })`:
  - Generar `_id` con formato `butcher_waste:{userId}:{uuidv4()}`
  - `type: 'butcher_waste'`
  - Validar `wasteType` contra enum: `hueso`, `grasa`, `recortes`, `caducado`, `rotura`, `perdida_manual`
  - Validar `weight > 0`
  - Validar `unit` contra: `kg`, `unidades`
  - Calcular `estimatedCost = weight × costPriceAtTime` si no se proporciona explícitamente
  - `reviewStatus: 'pending'` por defecto
  - `reviewedBy`, `reviewedByName`, `reviewedAt`, `reviewNotes`: null por defecto
  - `stockMovementId`, `financeMovementId`: vacío por defecto (se rellenan en el servicio)
  - Incluir `createdAt`, `updatedAt`, `deletedAt: null`
- [ ] Crear `sanitizeButcherWaste(doc)` — exponer campos seguros, eliminar `_rev`
- [ ] Crear `listButcherWasteByUser(req, userId)` — listar documentos `type: 'butcher_waste'` del usuario, filtrando `deletedAt: null`
- [ ] Crear vista CouchDB `butcher_waste_by_user_and_date` con emisión por `[user_id, date]` en `setupDatabaseIndexes()`
- [ ] Crear vista CouchDB `butcher_waste_by_product` con emisión por `[user_id, catalogItemId]`
- [ ] Crear vista CouchDB `butcher_waste_by_batch` con emisión por `[user_id, batchId]`

#### Criterios de aceptación

- El builder genera documentos con `_id` con prefijo `butcher_waste:`
- Los 6 tipos de merma se validan correctamente, cualquier otro valor se rechaza
- El sanitizer no expone `_rev` ni campos internos
- `estimatedCost` se calcula automáticamente si no se pasa
- Las vistas CouchDB permiten consultar por usuario+fecha, por producto y por lote

#### Conexiones

- **Stock:** `catalogItemId` referencia a `catalog_item`
- **Lotes:** `batchId` referencia a `butcher_batch` (si existe, del ticket CARN-ALR-01)
- **Trabajadores:** `registeredBy` es el `user_id` del trabajador

---

### MRM-02 — Servicio de merma: `butcherWasteService.js`

**Tipo:** Backend / Servicio
**Prioridad:** 🔴 Crítica (bloqueante)
**Estimación:** 4-5h
**Archivo principal:** `services/butcherWasteService.js` (nuevo)
**Dependencias:** MRM-01

#### Descripción

Crear el servicio central de merma que orquesta todo: persiste el registro, descuenta stock, calcula coste, genera historial, calcula porcentajes y evalúa alertas. Este servicio es invocado por el controlador y encapsula toda la lógica de negocio.

#### Tareas

**Registro de merma (`recordWaste`):**

- [ ] Crear función `recordWaste(req, userId, data)`:
  1. Validar que `catalogItemId` existe en el catálogo (fetch `catalog_item`)
  2. Si `batchId` proporcionado, validar que el lote existe y pertenece al producto
  3. Construir documento con `buildButcherWasteDocument`
  4. Persistir en CouchDB
  5. **Descontar stock:** llamar a `stockMovementService.recordMovement` con:
     - `movementType: 'waste'` (ampliar `VALID_MOVEMENT_TYPES` si no existe)
     - `catalogItemId`, `catalogItemName`, `sku`
     - `quantity: data.weight`
     - `referenceId: wasteDoc._id`
     - `referenceType: 'butcher_waste'`
     - `performedBy: data.registeredBy`
     - `notes: "Merma: {wasteType} — {notes}"`
  6. Guardar `stockMovementId` en el documento de merma
  7. Si hay lote (`batchId`) y el builder `butcher_batch` existe: actualizar `currentWeightKg -= weight`
  8. **Evaluar alertas** (llamar a `evaluateWasteAlerts` — ver MRM-05)
  9. Retornar el documento de merma sanitizado + resumen de acciones realizadas

**Listado y filtros (`listWaste`):**

- [ ] Crear función `listWaste(req, userId, filters)`:
  - Filtros soportados: `dateFrom`, `dateTo`, `wasteType`, `catalogItemId`, `batchId`, `registeredBy`, `reviewStatus`
  - Ordenar por `date` descendente (más recientes primero)
  - Paginar con `limit` y `skip`
  - Retornar `{ items: [...], total, page, pageSize }`

**Resumen analítico (`getWasteSummary`):**

- [ ] Crear función `getWasteSummary(req, userId, dateFrom, dateTo)`:
  - `totalWeight`: peso total de merma en el periodo (en kg)
  - `totalCost`: coste estimado total de merma
  - `byType`: desglose por tipo de merma `{ hueso: { weight, cost, count }, grasa: {...}, ... }`
  - `byProduct`: top 10 productos con más merma `[{ catalogItemId, name, weight, cost, count }]`
  - `byWorker`: merma por trabajador `[{ userId, name, weight, cost, count }]`
  - `byDay`: serie temporal diaria `[{ date, weight, cost }]`
  - `wastePctOverPurchases`: % de merma sobre el peso total comprado en el periodo (si hay datos de compras)

**Porcentaje de merma por producto (`getProductWasteRate`):**

- [ ] Crear función `getProductWasteRate(req, userId, catalogItemId, dateFrom, dateTo)`:
  - `totalPurchased`: kg comprados del producto en el periodo (desde `stock_movement` tipo `purchase_reception`)
  - `totalWasted`: kg de merma registrada del producto en el periodo
  - `wasteRate`: `(totalWasted / totalPurchased) * 100` — porcentaje de merma
  - `byType`: desglose de la merma del producto por tipo
  - `trend`: comparativa con el periodo anterior (subiendo/bajando/estable)

**Revisión de merma (`reviewWaste`):**

- [ ] Crear función `reviewWaste(req, userId, wasteId, reviewData)`:
  - Solo usuarios con rol `Admin` o `Gerente` pueden revisar
  - Actualizar `reviewStatus` a `reviewed` o `disputed`
  - Guardar `reviewedBy`, `reviewedByName`, `reviewedAt`, `reviewNotes`
  - Si `disputed`: no revertir stock pero generar notificación al trabajador

**Eliminación lógica (`deleteWaste`):**

- [ ] Crear función `deleteWaste(req, userId, wasteId)`:
  - Solo en estado `pending` (no se puede eliminar una merma ya revisada)
  - Solo el propio trabajador o un gerente pueden eliminar
  - Soft delete: `deletedAt = now`
  - **Revertir stock:** crear movimiento `adjustment_in` para devolver el peso al stock
  - Registrar nota en el movimiento: "Reversión por eliminación de merma {wasteId}"

#### Criterios de aceptación

- Al registrar merma, el stock del producto se reduce automáticamente
- Si hay lote, el peso del lote también se reduce
- El coste estimado se calcula con el `costPrice` del producto en ese momento
- Los filtros combinan correctamente (fecha + tipo + producto + trabajador)
- El resumen analítico calcula correctamente los totales y desgloses
- El % de merma por producto divide merma/compras del periodo
- Solo gerentes pueden revisar mermas
- Eliminar merma revierte el stock

#### Conexiones

- **Stock:** usa `stockMovementService.recordMovement` para descontar
- **Catálogo:** lee `catalog_item` para obtener `costPrice` y `stockQuantity`
- **Lotes:** actualiza `butcher_batch.currentWeightKg` si existe
- **Alertas:** llama a `evaluateWasteAlerts` al registrar

---

### MRM-03 — API REST: Router y controlador de merma

**Tipo:** Backend / API
**Prioridad:** 🔴 Crítica (bloqueante)
**Estimación:** 3-4h
**Archivos:** `routers/butcherWasteRouter.js` (nuevo), `controllers/butcherWasteController.js` (nuevo), `index.js`
**Dependencias:** MRM-01, MRM-02

#### Descripción

Exponer la API REST para gestionar mermas desde el frontend. Seguir el patrón existente: `router → controller → service → couchdb.js`.

#### Endpoints

| Método | Ruta | Handler | Descripción |
|---|---|---|---|
| `GET` | `/api/butcher-waste/:userId` | `listWaste` | Listar mermas con filtros (query params) |
| `POST` | `/api/butcher-waste/:userId` | `createWaste` | Registrar nueva merma |
| `GET` | `/api/butcher-waste/:userId/:wasteId` | `getWaste` | Detalle de una merma |
| `PUT` | `/api/butcher-waste/:userId/:wasteId` | `updateWaste` | Editar merma (solo si `pending`) |
| `DELETE` | `/api/butcher-waste/:userId/:wasteId` | `deleteWaste` | Eliminar merma (soft, solo si `pending`) |
| `PUT` | `/api/butcher-waste/:userId/:wasteId/review` | `reviewWaste` | Gerente revisa merma |
| `GET` | `/api/butcher-waste/:userId/summary` | `getSummary` | Resumen analítico (rango de fechas) |
| `GET` | `/api/butcher-waste/:userId/product-rate/:catalogItemId` | `getProductRate` | % merma por producto |
| `GET` | `/api/butcher-waste/:userId/by-worker` | `getByWorker` | Merma agrupada por trabajador |
| `GET` | `/api/butcher-waste/:userId/by-batch/:batchId` | `getByBatch` | Merma de un lote específico |

#### Query params para `GET /api/butcher-waste/:userId`

| Param | Tipo | Descripción |
|---|---|---|
| `dateFrom` | string (ISO) | Fecha inicio |
| `dateTo` | string (ISO) | Fecha fin |
| `wasteType` | string | Filtro por tipo de merma |
| `catalogItemId` | string | Filtro por producto |
| `batchId` | string | Filtro por lote |
| `registeredBy` | string | Filtro por trabajador |
| `reviewStatus` | string | `pending`, `reviewed`, `disputed` |
| `limit` | number | Tamaño de página (default: 25) |
| `skip` | number | Offset de paginación |

#### Tareas

- [ ] Crear `controllers/butcherWasteController.js` con handlers que invocan `butcherWasteService`:
  - `listWaste`: parsear query params, llamar al servicio, retornar `{ ok: true, items, total, page, pageSize }`
  - `createWaste`: validar body, llamar a `recordWaste`, retornar `{ ok: true, waste, actions }` donde `actions` describe las automatizaciones ejecutadas
  - `getWaste`: fetch por ID, retornar `{ ok: true, waste }`
  - `updateWaste`: solo si `reviewStatus === 'pending'`, retornar `{ ok: true, waste }`
  - `deleteWaste`: validar permisos, llamar al servicio, retornar `{ ok: true }`
  - `reviewWaste`: verificar rol Admin/Gerente, llamar al servicio, retornar `{ ok: true, waste }`
  - `getSummary`: parsear `dateFrom`/`dateTo` (default: mes actual), retornar `{ ok: true, summary }`
  - `getProductRate`: retornar `{ ok: true, rate }`
  - `getByWorker`: retornar `{ ok: true, workers: [...] }`
  - `getByBatch`: retornar `{ ok: true, items: [...], totals }`
- [ ] Crear `routers/butcherWasteRouter.js` con las rutas
- [ ] Montar en `index.js`:
  ```javascript
  ['/api/butcher-waste', requireAuth, burstLimiter, planAwareLimiter, butcherWasteRouter],
  ```
  (Se duplica automáticamente en `/api/v2/butcher-waste` por el bucle existente)
- [ ] Validar body del POST con comprobaciones manuales (patrón del proyecto):
  - `catalogItemId`: obligatorio, string no vacío
  - `weight`: obligatorio, number > 0
  - `wasteType`: obligatorio, uno de los 6 tipos válidos
  - `date`: obligatorio, formato ISO, no futuro
  - `registeredBy`: obligatorio (o inferir de `req.authUser`)
  - `batchId`: opcional
  - `notes`: opcional, string
  - `unit`: opcional, default `kg`

#### Criterios de aceptación

- Todos los endpoints retornan `{ ok: true/false, ... }`
- El POST ejecuta todas las automatizaciones (stock, lote, alertas)
- Los filtros se combinan correctamente
- Los endpoints de analítica devuelven datos calculados
- Soft delete con `deletedAt`
- La revisión solo es accesible para Admin/Gerente
- Respuestas de error con mensajes claros en español

---

### MRM-04 — Ampliar `stockMovementService` con tipo `waste`

**Tipo:** Backend / Integración
**Prioridad:** 🔴 Crítica
**Estimación:** 1h
**Archivo:** `services/stockMovementService.js`
**Dependencias:** Ninguna

#### Descripción

Añadir `waste` como tipo válido de movimiento de stock para que las mermas se registren en el kardex y descuenten stock automáticamente.

#### Tareas

- [ ] Añadir `'waste'` al array `VALID_MOVEMENT_TYPES`
- [ ] Añadir `'waste'` al `Set` `OUTBOUND_TYPES`
- [ ] Verificar que `recordMovement` descuenta `catalog_item.stockQuantity` correctamente para tipo `waste` (ya debería funcionar por ser outbound, pero confirmar)
- [ ] Añadir `'waste'` a `alertConstants.js` en `CATEGORY_TO_SOURCE`:
  ```javascript
  butcher_waste_high: 'stock',
  butcher_waste_repeated: 'stock',
  butcher_waste_expired_product: 'stock',
  butcher_waste_batch_loss: 'stock',
  ```

#### Criterios de aceptación

- `recordMovement` con `movementType: 'waste'` funciona sin error
- El stock del `catalog_item` se descuenta
- El movimiento aparece en el kardex del producto
- Las nuevas categorías de alerta están registradas en `alertConstants.js`

---

### MRM-05 — Motor de alertas de merma

**Tipo:** Backend / Servicio
**Prioridad:** 🟠 Alta
**Estimación:** 4-5h
**Archivos:** `services/butcherWasteService.js`, `services/alertEngine.js`
**Dependencias:** MRM-01, MRM-02, MRM-04

#### Descripción

Implementar 4 reglas de alerta que se evalúan tanto en tiempo real (al registrar merma) como en el ciclo periódico del motor de alertas.

#### Reglas de alerta

##### Regla 1: Merma elevada (`butcher_waste_high`)

- **Evaluación en tiempo real:** al registrar merma, sumar toda la merma del día para el usuario
- **Evaluación periódica:** en el ciclo del `alertEngine` (cada 1h)
- **Condición warning:** merma acumulada del día > umbral configurable (default: 5 kg)
- **Condición critical:** merma acumulada del día > umbral crítico (default: 10 kg)
- **Mensaje warning:** `"Merma del día: X.X kg (> umbral de Y kg). Coste estimado: Z €"`
- **Mensaje critical:** `"⚠ Merma crítica hoy: X.X kg (> umbral de Y kg). Coste: Z €. Revisar urgentemente."`
- **Nivel:** `warning` / `alert`
- **Ruta destino:** `/saas/vertical/carniceria/merma`
- **Destinatario:** Gerente
- **Dedup key:** `butcherwaste-high-{userId}-{fecha}`

##### Regla 2: Merma repetida (`butcher_waste_repeated`)

- **Evaluación:** en tiempo real + periódica
- **Condición:** el mismo producto + mismo tipo de merma se ha registrado >= N veces (default: 3) en los últimos 7 días
- **Mensaje:** `"Merma repetida: {producto} — {tipo} registrado {N} veces en 7 días (total: X.X kg, Y €)"`
- **Nivel:** `warning`
- **Ruta destino:** `/saas/vertical/carniceria/merma?catalogItemId={id}`
- **Destinatario:** Gerente
- **Dedup key:** `butcherwaste-repeated-{catalogItemId}-{wasteType}`

##### Regla 3: Producto caducado (`butcher_waste_expired_product`)

- **Evaluación:** en tiempo real (al registrar merma con `wasteType === 'caducado'`)
- **Condición:** cualquier registro de merma con tipo `caducado`
- **Mensaje:** `"Producto caducado retirado: {producto} — {weight} kg. Lote: {loteCode}. Coste: X €"`
- **Nivel:** `alert` (siempre crítica — un caducado es un problema sanitario)
- **Ruta destino:** `/saas/vertical/carniceria/merma?wasteType=caducado`
- **Destinatario:** Gerente + Trabajador (todos los del negocio)
- **Dedup key:** `butcherwaste-expired-{wasteDocId}`
- **Canales:** inApp + push (requiere atención inmediata)

##### Regla 4: Lote con demasiada pérdida (`butcher_waste_batch_loss`)

- **Evaluación:** en tiempo real (si la merma tiene `batchId`) + periódica
- **Condición:** la merma acumulada de un lote supera el X% del peso original del lote (default: 20%)
- **Precondición:** requiere que `butcher_batch` exista (del ticket CARN-ALR-01). Si no existe, esta regla se desactiva
- **Cálculo:** `totalWasteOnBatch / batch.receptionWeightKg * 100 > threshold`
- **Mensaje:** `"Lote {batchNumber} de {producto} con pérdida de {pct}% (merma: X.X kg de Y kg recibidos)"`
- **Nivel:** `warning` si > umbral, `alert` si > umbral × 2
- **Ruta destino:** `/saas/vertical/carniceria/merma?batchId={id}`
- **Destinatario:** Gerente
- **Dedup key:** `butcherwaste-batch-{batchId}`

#### Tareas

- [ ] Crear función `evaluateWasteAlerts(req, userId, wasteDoc)` en `butcherWasteService.js`:
  - Recibe el documento de merma recién creado
  - Ejecuta las 4 reglas en orden
  - Para cada regla disparada: llamar a `emitAlert()` del `alertEmitter.js`
  - Retornar array de alertas generadas (para informar al frontend en la respuesta del POST)
- [ ] Crear función `checkButcherWasteAlerts(userId)` para el ciclo periódico:
  - Consultar mermas del día y de los últimos 7 días
  - Ejecutar reglas 1 y 2 (las periódicas)
  - Usar dedup para no repetir alertas ya emitidas
- [ ] Integrar `checkButcherWasteAlerts` en el ciclo del `alertEngine.js`:
  - Solo para usuarios con `account.businessType === 'butcherShop'`
  - Ejecutar en cada ciclo (1h) junto con las demás reglas
- [ ] Configuración de umbrales (ver MRM-06)

#### Criterios de aceptación

- Al registrar merma que supera umbral diario → alerta inmediata al gerente
- Al registrar merma repetida (3+ veces en 7 días mismo producto+motivo) → alerta
- Al registrar merma tipo `caducado` → alerta crítica siempre, incluyendo push
- Al registrar merma en un lote que acumula >20% pérdida → alerta
- Las alertas se deduplican (no repetir la misma en 24h)
- Las alertas se distribuyen vía SSE + notificaciones + push según nivel
- El ciclo periódico (1h) también evalúa reglas sin necesidad de registrar merma nueva

---

### MRM-06 — Configuración de alertas y umbrales de merma

**Tipo:** Backend / Configuración
**Prioridad:** 🟠 Alta
**Estimación:** 1-2h
**Archivos:** `controllers/alertController.js`, `services/butcherWasteService.js`
**Dependencias:** MRM-05

#### Descripción

Extender la configuración de alertas (`account.alertConfig`) con los umbrales específicos de merma de carnicería.

#### Nuevos campos de configuración

```javascript
{
  // Merma — Umbral diario
  butcherWasteHighEnabled: true,
  butcherWasteHighThresholdKg: 5,
  butcherWasteHighCriticalKg: 10,

  // Merma — Repetida
  butcherWasteRepeatedEnabled: true,
  butcherWasteRepeatedCount: 3,
  butcherWasteRepeatedDays: 7,

  // Merma — Producto caducado
  butcherWasteExpiredEnabled: true,

  // Merma — Lote con pérdida alta
  butcherWasteBatchLossEnabled: true,
  butcherWasteBatchLossThresholdPct: 20,

  // Merma — Registro en finanzas
  butcherWasteAutoFinance: false,
  butcherWasteFinanceCategory: 'merma_carniceria',
}
```

#### Tareas

- [ ] Añadir las nuevas claves al array `allowedKeys` en `updateAlertSettings` del `alertController.js`
- [ ] Crear `getButcherWasteConfig(account)` en `butcherWasteService.js` que devuelve los valores con defaults
- [ ] Validar tipos: numéricos para umbrales (rechazar NaN, negativos), booleanos para toggles
- [ ] Documentar defaults en el código

#### Criterios de aceptación

- `GET /api/alerts/:userId/config` incluye los campos de merma con defaults
- `PUT /api/alerts/:userId/config` acepta cualquier subconjunto de campos de merma
- Valores inválidos (negativos, NaN, tipo incorrecto) retornan error 400
- Los defaults son razonables para una carnicería (5kg warning, 10kg critical, 3 repeticiones, 20% pérdida lote)

---

### MRM-07 — Conexión con Finanzas: registro de gasto por merma

**Tipo:** Backend / Integración
**Prioridad:** 🟠 Alta
**Estimación:** 2-3h
**Archivos:** `services/butcherWasteService.js`, `controllers/financeController.js`
**Dependencias:** MRM-02

#### Descripción

Cuando se registra una merma, el coste estimado representa una pérdida económica real. Si el negocio lo configura, se genera automáticamente un movimiento financiero tipo `pago` para reflejar este gasto en las cuentas.

#### Diseño

```
Merma registrada (X kg de Solomillo a 24 €/kg = 57.60 €)
    │
    ├── Si butcherWasteAutoFinance === true:
    │   │
    │   └── Crear movimiento financiero:
    │       type: 'pago'
    │       concept: "Merma: Solomillo de ternera — hueso (2.4 kg)"
    │       amountBase: 57.60
    │       category: 'merma_carniceria' (configurable)
    │       referenceId: butcher_waste._id
    │       referenceType: 'butcher_waste'
    │       date: fecha de la merma
    │       status: 'paid' (pérdida ya efectiva)
    │       linkedDocuments: [{ type: 'butcher_waste', id: wasteId }]
    │
    └── Si butcherWasteAutoFinance === false:
        └── No hacer nada (el gerente puede crear el gasto manualmente)
```

#### Tareas

- [ ] En `recordWaste`, después de crear el documento y descontar stock:
  - Leer config `butcherWasteAutoFinance`
  - Si `true`: crear movimiento financiero usando `buildFinanceDocument` de `couchdb.js`:
    - `type: 'pago'`
    - `concept`: `"Merma: {productName} — {wasteTypeLabel} ({weight} {unit})"`
    - `amountBase`: `estimatedCost`
    - `taxRate: 0` (la merma no tiene IVA)
    - `taxAmount: 0`
    - `totalAmount`: `estimatedCost`
    - `category`: valor de `butcherWasteFinanceCategory` en config
    - `date`: fecha de la merma
    - `status: 'paid'`
    - `source: 'butcher_waste'`
    - `sourceRef`: ID del `butcher_waste`
  - Guardar el `financeMovementId` en el documento de merma
- [ ] Si se elimina la merma (soft delete) y se había generado movimiento financiero: marcar el movimiento financiero con nota "Anulado por eliminación de merma" (no eliminarlo, para auditoría)
- [ ] En el endpoint `GET /api/butcher-waste/:userId/summary`: incluir `totalFinancialImpact` (suma de costes de merma del periodo)

#### Criterios de aceptación

- Si `butcherWasteAutoFinance === true`, al registrar merma se crea un movimiento financiero tipo `pago`
- El movimiento aparece en la lista de finanzas del usuario
- Si se elimina la merma, el movimiento financiero se anota como anulado
- Si `butcherWasteAutoFinance === false`, no se genera movimiento
- El resumen incluye el impacto financiero total del periodo

---

### MRM-08 — Actualización de coste real por merma

**Tipo:** Backend / Lógica
**Prioridad:** 🟠 Alta
**Estimación:** 2-3h
**Archivos:** `services/butcherWasteService.js`
**Dependencias:** MRM-02

#### Descripción

El coste real de un producto en carnicería no es solo el precio de compra (`costPrice`), sino el precio de compra ajustado por la merma real. Si compro 10 kg de solomillo a 20 €/kg y pierdo 2 kg en hueso/grasa, el coste real de los 8 kg vendibles es 25 €/kg. Este ticket implementa el cálculo y almacenamiento del coste real.

#### Fórmula

```
costeReal = costetotalCompra / pesoRealVendible
pesoRealVendible = pesoComprado - pesoMerma
costeReal = (pesoComprado × costPrice) / (pesoComprado - pesoMerma)
```

Ejemplo:
- Compro 10 kg a 20 €/kg = 200 €
- Merma acumulada: 2 kg (hueso + grasa)
- Peso vendible: 8 kg
- Coste real: 200 / 8 = 25 €/kg

#### Tareas

- [ ] Añadir campos al `catalog_item` (mediante update, no recrear el builder):
  - `realCostPrice`: coste real ajustado por merma (€/unidad)
  - `wasteRatePct`: % de merma histórica del producto
  - `lastWasteRateCalcAt`: fecha del último recálculo
- [ ] Crear función `recalculateRealCost(req, userId, catalogItemId)` en `butcherWasteService.js`:
  1. Obtener `catalog_item` (precio de compra actual: `costPrice`)
  2. Obtener merma acumulada del producto en los últimos 90 días (configurable)
  3. Obtener compras del producto en los últimos 90 días (de `stock_movement` tipo `purchase_reception`)
  4. Calcular `wasteRatePct = totalWaste / totalPurchased * 100`
  5. Calcular `realCostPrice = costPrice / (1 - wasteRatePct/100)`
  6. Actualizar `catalog_item` con los nuevos valores
  7. Retornar `{ realCostPrice, wasteRatePct, costPrice, margin }`
- [ ] Llamar a `recalculateRealCost` desde `recordWaste` (cada vez que se registra merma de un producto)
- [ ] Crear endpoint `GET /api/butcher-waste/:userId/real-costs` que devuelve la tabla de costes reales de todos los productos:
  - `[{ catalogItemId, name, costPrice, realCostPrice, wasteRatePct, margin }]`
  - Ordenable por `wasteRatePct` descendente (productos con más merma primero)

#### Criterios de aceptación

- Al registrar merma, el `realCostPrice` del producto se recalcula automáticamente
- El coste real refleja correctamente la merma acumulada
- El `wasteRatePct` es correcto (merma/compras × 100)
- El endpoint de costes reales devuelve la tabla completa
- Si no hay merma, `realCostPrice === costPrice`
- Si no hay compras en el periodo, no se divide por cero (mantener el valor anterior)

---

### MRM-09 — Cliente TypeScript: `butcherWasteApi.ts`

**Tipo:** Frontend / API Client
**Prioridad:** 🔴 Crítica
**Estimación:** 2h
**Archivo:** `src/app/lib/butcherWasteApi.ts` (nuevo)
**Dependencias:** MRM-03

#### Descripción

Crear el cliente HTTP TypeScript para consumir la API de merma desde el frontend. Seguir el patrón de los otros API clients del proyecto (`stockMovementApi.ts`, `purchaseOrderApi.ts`).

#### Tareas

- [ ] Definir tipos TypeScript:

```typescript
type WasteType = 'hueso' | 'grasa' | 'recortes' | 'caducado' | 'rotura' | 'perdida_manual';
type ReviewStatus = 'pending' | 'reviewed' | 'disputed';

interface ButcherWaste {
  _id: string;
  type: 'butcher_waste';
  user_id: string;
  business_id: string;
  catalogItemId: string;
  catalogItemName: string;
  catalogItemSku: string;
  batchId?: string;
  batchNumber?: string;
  wasteType: WasteType;
  weight: number;
  unit: 'kg' | 'unidades';
  estimatedCost: number;
  costPriceAtTime: number;
  date: string;
  registeredBy: string;
  registeredByName: string;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  notes: string;
  stockMovementId: string;
  financeMovementId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WasteSummary {
  totalWeight: number;
  totalCost: number;
  byType: Record<WasteType, { weight: number; cost: number; count: number }>;
  byProduct: Array<{ catalogItemId: string; name: string; weight: number; cost: number; count: number }>;
  byWorker: Array<{ userId: string; name: string; weight: number; cost: number; count: number }>;
  byDay: Array<{ date: string; weight: number; cost: number }>;
  wastePctOverPurchases?: number;
  totalFinancialImpact: number;
}

interface ProductWasteRate {
  catalogItemId: string;
  catalogItemName: string;
  totalPurchased: number;
  totalWasted: number;
  wasteRate: number;
  byType: Record<WasteType, number>;
  trend: 'up' | 'down' | 'stable';
}

interface WasteFilters {
  dateFrom?: string;
  dateTo?: string;
  wasteType?: WasteType;
  catalogItemId?: string;
  batchId?: string;
  registeredBy?: string;
  reviewStatus?: ReviewStatus;
  limit?: number;
  skip?: number;
}

interface RealCostEntry {
  catalogItemId: string;
  name: string;
  costPrice: number;
  realCostPrice: number;
  wasteRatePct: number;
  margin?: number;
}
```

- [ ] Implementar funciones:

| Función | Método | Ruta | Descripción |
|---|---|---|---|
| `listWaste(userId, filters?)` | GET | `/api/butcher-waste/:userId` | Listar mermas con filtros |
| `createWaste(userId, data)` | POST | `/api/butcher-waste/:userId` | Registrar merma |
| `getWaste(userId, wasteId)` | GET | `/api/butcher-waste/:userId/:wasteId` | Detalle de merma |
| `updateWaste(userId, wasteId, data)` | PUT | `/api/butcher-waste/:userId/:wasteId` | Editar merma |
| `deleteWaste(userId, wasteId)` | DELETE | `/api/butcher-waste/:userId/:wasteId` | Eliminar merma |
| `reviewWaste(userId, wasteId, data)` | PUT | `/api/butcher-waste/:userId/:wasteId/review` | Revisar merma |
| `getWasteSummary(userId, dateFrom?, dateTo?)` | GET | `/api/butcher-waste/:userId/summary` | Resumen analítico |
| `getProductWasteRate(userId, catalogItemId, dateFrom?, dateTo?)` | GET | `/api/butcher-waste/:userId/product-rate/:id` | % merma por producto |
| `getByWorker(userId, dateFrom?, dateTo?)` | GET | `/api/butcher-waste/:userId/by-worker` | Merma por trabajador |
| `getByBatch(userId, batchId)` | GET | `/api/butcher-waste/:userId/by-batch/:batchId` | Merma por lote |
| `getRealCosts(userId)` | GET | `/api/butcher-waste/:userId/real-costs` | Tabla de costes reales |

- [ ] Constantes exportadas:

```typescript
export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  hueso: 'Hueso',
  grasa: 'Grasa',
  recortes: 'Recortes',
  caducado: 'Caducado',
  rotura: 'Rotura',
  perdida_manual: 'Pérdida manual',
};

export const WASTE_TYPE_COLORS: Record<WasteType, string> = {
  hueso: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  grasa: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  recortes: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  caducado: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  rotura: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  perdida_manual: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pendiente',
  reviewed: 'Revisada',
  disputed: 'Disputada',
};
```

#### Criterios de aceptación

- Todos los tipos están correctamente definidos
- Todas las funciones devuelven datos tipados
- El manejo de errores es consistente con el resto de API clients del proyecto
- Las constantes de labels y colores están exportadas para uso en UI

---

### MRM-10 — Refactor completo de `ButcherWaste.tsx` (conectar con backend)

**Tipo:** Frontend / Refactor
**Prioridad:** 🔴 Crítica
**Estimación:** 6-8h
**Archivo:** `src/app/pages/saas/ButcherWaste.tsx`
**Dependencias:** MRM-09

#### Descripción

Refactorizar completamente la página `ButcherWaste.tsx` para que consuma datos reales del backend en vez de datos mock. Añadir la URL `/saas/vertical/carniceria/merma` como alias. Implementar la vista diferenciada por rol (gerente vs trabajador).

#### Estructura de la página refactorizada

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: "Merma y Pérdidas"                                      │
│  Subtítulo: rango de fechas activo + badge alertas activas        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │Merma │ │Coste │ │Merma │ │Coste │ │% merma│ │Alertas│         │
│  │hoy   │ │hoy   │ │mes   │ │mes   │ │global │ │activas│         │
│  │X.X kg│ │XX €  │ │XX kg │ │XXX € │ │X.X%  │ │  N   │         │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│  PESTAÑAS: [Registro] [Historial] [Análisis] [Costes reales]     │
│                        (solo gerente: Análisis, Costes reales)   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  (Contenido según pestaña activa)                                 │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

#### Pestañas

**Pestaña "Registro"** (ambos roles):
- Formulario de registro de merma (MRM-11)
- Lista de mermas de hoy (las más recientes primero)
- El trabajador ve solo las suyas; el gerente ve todas

**Pestaña "Historial"** (ambos roles, contenido diferenciado):
- Tabla completa de mermas con filtros
- Barra de filtros: búsqueda, tipo de merma, producto, trabajador (solo gerente), estado de revisión, rango de fechas
- Toggle vista: tabla / tarjetas
- Acciones por fila: ver detalle, editar (si pending), eliminar (si pending), revisar (solo gerente)
- Paginación server-side
- Exportar CSV (solo gerente)
- El trabajador solo ve sus propias mermas y no ve la columna de coste

**Pestaña "Análisis"** (solo gerente):
- Gráfica de merma diaria del mes (bar chart, coloreado por umbral)
- Gráfica de merma por tipo (donut chart)
- Ranking de productos con más merma (tabla top 10)
- Ranking de trabajadores con más merma (tabla)
- Comparativa periodo actual vs anterior (% cambio)
- Filtros de periodo: hoy, 7 días, 30 días, personalizado

**Pestaña "Costes reales"** (solo gerente):
- Tabla de productos con: nombre, costPrice (compra), realCostPrice (ajustado), wasteRatePct, diferencia
- Ordenable por % merma
- Semáforo: verde (<5%), amarillo (5-15%), rojo (>15%)
- Click en producto → desglose de merma del producto

#### Tareas

- [ ] Eliminar `INITIAL_DATA`, `useState<WasteEntry[]>` y toda la lógica local
- [ ] Sustituir tipo `MotivoMerma` por `WasteType` del API client (6 tipos nuevos)
- [ ] Sustituir tipo `CategoriaProducto` por categorías del catálogo real
- [ ] Añadir hooks:
  - `useWasteList(userId, filters)` — fetch de mermas con filtros
  - `useWasteSummary(userId, dateRange)` — fetch del resumen
  - `useRealCosts(userId)` — fetch de costes reales
- [ ] Implementar selector de producto conectado al catálogo (`catalog_item`) vía API existente
- [ ] Implementar selector de lote conectado a lotes del producto (si existe API de lotes)
- [ ] Implementar selector de trabajador conectado a miembros del negocio
- [ ] Implementar las 4 pestañas con contenido real
- [ ] Implementar diferenciación por rol (usar `useAuth` para obtener rol del usuario):
  - Si `accountType === 'user'` o rol === `'Usuario'` → vista trabajador
  - Si `accountType === 'company'` o rol === `'Admin'`/`'Gerente'` → vista gerente
- [ ] Mantener el design system existente (dark mode, bordes, tipografía, rounded-xl)
- [ ] Registrar ruta adicional en `routes.tsx`:
  ```typescript
  { path: 'vertical/carniceria/merma', Component: ButcherWaste },
  ```

#### Criterios de aceptación

- La página carga datos reales del backend
- El formulario registra mermas que se persisten
- Al registrar merma, los KPIs se actualizan automáticamente
- Los filtros funcionan correctamente combinados
- La vista gerente muestra análisis y costes reales
- La vista trabajador solo muestra registro e historial propio
- Dark mode funciona correctamente
- La tabla es responsive (scroll horizontal en mobile)
- Las URL `/saas/butcher-waste` y `/saas/vertical/carniceria/merma` cargan la misma página

---

### MRM-11 — Formulario de registro de merma (componente)

**Tipo:** Frontend / Componente
**Prioridad:** 🔴 Crítica
**Estimación:** 3-4h
**Archivo:** Componente dentro de `ButcherWaste.tsx` o extraído a `components/saas/ButcherWasteForm.tsx`
**Dependencias:** MRM-09, MRM-10

#### Descripción

El formulario de registro es la herramienta principal del trabajador. Debe ser rápido, intuitivo y funcionar bien en tablet/móvil (uso típico detrás del mostrador).

#### Diseño del formulario

```
┌──────────────────────────────────────────────────────────┐
│  Registrar merma                                    [X]   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Producto *                    Tipo de merma *             │
│  [▼ Buscar producto...    ]    [▼ Hueso            ▼]     │
│  (selector con búsqueda)       (selector con iconos)      │
│                                                            │
│  Peso (kg) *          Unidad          Fecha *              │
│  [  2.4     ]         [▼ kg ▼]        [📅 14/04/2026]     │
│                                                            │
│  Coste estimado (calculado automáticamente)                │
│  ┌──────────────────────────────────────────────┐         │
│  │  2.4 kg × 24.00 €/kg = 57.60 €              │         │
│  └──────────────────────────────────────────────┘         │
│                                                            │
│  Lote (opcional)                                           │
│  [▼ LOT-2026-0412 — Solomillo (exp: 20/04)    ▼]         │
│  (selector con lotes activos del producto)                │
│                                                            │
│  Observaciones                                             │
│  [                                                  ]      │
│  [  Hueso limpio de cadera, no aprovechable         ]      │
│  [                                                  ]      │
│                                                            │
├──────────────────────────────────────────────────────────┤
│                      [Cancelar]  [Registrar merma]        │
└──────────────────────────────────────────────────────────┘
```

#### Tareas

- [ ] **Selector de producto:**
  - Combobox con búsqueda (por nombre, SKU)
  - Carga productos del catálogo vía API existente (`/api/delivery/catalog/:userId`)
  - Al seleccionar: mostrar `costPrice` actual, stock actual, y cargar lotes disponibles
  - Si el producto tiene stock 0, mostrar warning "Este producto ya no tiene stock"
- [ ] **Selector de tipo de merma:**
  - 6 opciones con colores diferenciados
  - Vista de botones/chips en vez de select (más visual y táctil)
  - Los 6 tipos: hueso, grasa, recortes, caducado, rotura, pérdida manual
- [ ] **Campo peso:**
  - Input numérico con step 0.1
  - Validación: > 0
  - Validación: no puede superar el stock actual del producto (warning, no bloqueo)
  - Formato con 1-2 decimales
- [ ] **Cálculo de coste:**
  - Automático: peso × costPrice del producto seleccionado
  - Mostrar como campo calculado (no editable)
  - Si `realCostPrice` existe, mostrar ambos: "Coste compra: X € | Coste real: Y €"
- [ ] **Selector de lote:**
  - Solo aparece si el producto tiene lotes activos
  - Carga lotes vía API (si existe endpoint de lotes, sino ocultar el campo)
  - Muestra: código de lote, fecha de expiración, peso restante
  - Opcional: si no se selecciona lote, la merma se registra sin vinculación a lote
- [ ] **Campo fecha:**
  - Date picker, default: hoy
  - No permite fechas futuras
  - Permite registrar merma de días anteriores (máximo 7 días atrás)
- [ ] **Campo trabajador:**
  - Auto-rellenado con el usuario logueado (no editable para trabajadores)
  - El gerente puede seleccionar a quién atribuir la merma (selector de miembros del equipo)
- [ ] **Observaciones:**
  - Textarea libre, opcional
  - Placeholder con ejemplo según tipo de merma seleccionado:
    - hueso: "Ej: Hueso limpio de cadera"
    - grasa: "Ej: Grasa superficial retirada en despiece"
    - recortes: "Ej: Nervios y fascias no vendibles"
    - caducado: "Ej: Producto pasado de fecha en mostrador"
    - rotura: "Ej: Caída accidental, embalaje roto"
    - perdida_manual: "Ej: Falta detectada en inventario"
- [ ] **Feedback al registrar:**
  - Loading state en el botón
  - Al éxito: toast de confirmación con resumen ("Merma registrada: 2.4 kg de Solomillo — Hueso")
  - Si se generó alerta: mostrar badge de alerta en el toast
  - Limpiar formulario y recargar la lista de mermas del día

#### Criterios de aceptación

- El formulario carga productos y lotes del backend
- El coste se calcula automáticamente
- Las validaciones son claras y en español
- El formulario funciona bien en tablet (pantalla táctil)
- Al registrar, se ejecutan todas las automatizaciones (stock, finanzas, alertas)
- El feedback es inmediato y claro
- El formulario se reinicia tras un registro exitoso

---

### MRM-12 — Permisos de merma: gerente vs trabajador

**Tipo:** Backend + Frontend
**Prioridad:** 🟠 Alta
**Estimación:** 2-3h
**Archivos:** `services/couchdb.js`, `controllers/butcherWasteController.js`, `ButcherWaste.tsx`
**Dependencias:** MRM-03, MRM-10

#### Descripción

Implementar control de acceso diferenciado según el rol del usuario. El gerente tiene acceso total; el trabajador solo puede registrar mermas y ver su historial.

#### Matriz de permisos

| Acción | Gerente | Trabajador |
|---|---|---|
| Registrar merma | ✅ | ✅ |
| Ver sus propias mermas | ✅ | ✅ |
| Ver mermas de todos los trabajadores | ✅ | ❌ |
| Editar merma (si pending) | ✅ | Solo las suyas |
| Eliminar merma (si pending) | ✅ | Solo las suyas |
| Revisar/aprobar merma | ✅ | ❌ |
| Ver pestaña Análisis | ✅ | ❌ |
| Ver pestaña Costes reales | ✅ | ❌ |
| Ver columna coste estimado | ✅ | ❌ |
| Ver merma por trabajador | ✅ | ❌ |
| Exportar CSV | ✅ | ❌ |
| Configurar umbrales alertas | ✅ | ❌ |
| Seleccionar trabajador al registrar | ✅ (puede atribuir a otro) | ❌ (auto: él mismo) |

#### Tareas

**Backend:**
- [ ] En `listWaste` del controlador: si el usuario tiene rol `Usuario`, filtrar solo `registeredBy === req.authUser.userId`
- [ ] En `getByWorker`: rechazar con 403 si el usuario no es Admin/Gerente
- [ ] En `getSummary`: si es trabajador, devolver solo resumen de sus mermas
- [ ] En `getRealCosts`: rechazar con 403 si no es Admin/Gerente
- [ ] En `reviewWaste`: rechazar con 403 si no es Admin/Gerente
- [ ] En `updateWaste`/`deleteWaste`: si es trabajador, verificar que `registeredBy === req.authUser.userId`
- [ ] Si el usuario no tiene rol Admin/Gerente, omitir campos `estimatedCost`, `costPriceAtTime`, `financeMovementId` de la respuesta

**Frontend:**
- [ ] Usar `useAuth()` para obtener el rol y `accountType` del usuario
- [ ] Condicionar pestañas "Análisis" y "Costes reales" al rol gerente
- [ ] Ocultar columna "Coste est." en la tabla para trabajadores
- [ ] Ocultar botón "Revisar" para trabajadores
- [ ] Ocultar filtro "Trabajador" para trabajadores
- [ ] Ocultar botón "Exportar" para trabajadores
- [ ] En el formulario: deshabilitar selector de trabajador para trabajadores (auto: usuario actual)
- [ ] En la pestaña Historial para trabajadores: no mostrar mermas de otros

#### Criterios de aceptación

- El gerente ve todo y puede hacer todo
- El trabajador solo ve sus mermas y no ve costes
- Los endpoints protegen los datos a nivel de backend (no solo frontend)
- La UI se adapta limpiamente sin mostrar elementos deshabilitados (ocultar, no deshabilitar)

---

### MRM-13 — Integración con `ButcherHub.tsx` (KPIs de merma reales)

**Tipo:** Frontend / Integración
**Prioridad:** 🟡 Media
**Estimación:** 2h
**Archivo:** `src/app/pages/saas/ButcherHub.tsx`
**Dependencias:** MRM-09

#### Descripción

El Hub de carnicería (`ButcherHub.tsx`) muestra KPIs de merma con datos mock (`mermaHoyKg: 3.2`, `mermaMesPct: 2.1`). Conectar estos KPIs con datos reales de la API de merma.

#### Tareas

- [ ] Reemplazar `mermaHoyKg` y `mermaMesPct` en `generateMockData()` con llamadas a `getWasteSummary`
- [ ] Reemplazar `dailyWaste` (gráfica de merma semanal) con datos reales de `getWasteSummary` con rango de 7 días
- [ ] Reemplazar `workers[].mermaKg` con datos reales de `getByWorker`
- [ ] Reemplazar alerta mock `merma_alta` con alertas reales del sistema de notificaciones
- [ ] Mantener el enlace "Ver todo" de la gráfica de merma apuntando a `/saas/butcher-waste`

#### Criterios de aceptación

- Los KPIs de merma en el Hub muestran datos reales
- La gráfica de merma semanal usa datos reales
- La merma por trabajador en la tabla usa datos reales
- Si la API no tiene datos todavía, mostrar 0 (no crashear)

---

### MRM-14 — Integración con Informes: endpoint de reporting de merma

**Tipo:** Backend / Reporting
**Prioridad:** 🟡 Media
**Estimación:** 2-3h
**Archivos:** `services/butcherWasteService.js`
**Dependencias:** MRM-02

#### Descripción

Crear endpoints de reporting avanzado para la sección de Informes de la aplicación. Estos datos alimentan dashboards de gestión y análisis a largo plazo.

#### Endpoints adicionales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/butcher-waste/:userId/report/trends` | Tendencias de merma (semanal/mensual, últimos 12 meses) |
| `GET` | `/api/butcher-waste/:userId/report/by-type-period` | Merma por tipo de merma y periodo (para evolución temporal por tipo) |
| `GET` | `/api/butcher-waste/:userId/report/top-waste-products` | Top 20 productos con más merma (kg y €) en un rango |
| `GET` | `/api/butcher-waste/:userId/report/worker-comparison` | Comparativa de merma entre trabajadores (periodo configurable) |
| `GET` | `/api/butcher-waste/:userId/report/cost-impact` | Impacto total en costes: merma vs ventas, merma vs compras |

#### Tareas

- [ ] `getTrends(userId, period)`: agregar merma por semana o mes, devolver serie temporal con `{ period, weight, cost, count, avgPerDay }`
- [ ] `getByTypePeriod(userId, dateFrom, dateTo, groupBy)`: merma agrupada por `wasteType` y por periodo (día/semana/mes)
- [ ] `getTopWasteProducts(userId, dateFrom, dateTo, limit)`: productos ordenados por kg/€ de merma, con `wasteRatePct`
- [ ] `getWorkerComparison(userId, dateFrom, dateTo)`: por trabajador: total merma (kg, €), media diaria, tipo más frecuente, tendencia
- [ ] `getCostImpact(userId, dateFrom, dateTo)`:
  - `totalWasteCost`: coste total de merma
  - `totalPurchases`: total de compras en el periodo
  - `totalSales`: total de ventas (si disponible)
  - `wasteOverPurchasesPct`: merma/compras × 100
  - `wasteOverSalesPct`: merma/ventas × 100
  - `estimatedAnnualWaste`: proyección anualizada

#### Criterios de aceptación

- Los endpoints de tendencias devuelven series temporales correctas
- El desglose por tipo y periodo es coherente
- El top de productos está ordenado y limitado
- La comparativa por trabajador es justa (normalizada por días trabajados si hay datos de fichaje)
- El impacto en costes cruza correctamente merma con compras/ventas

---

## Mapa de conexiones

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MAPA DE CONEXIONES — MERMA                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                                                    │
│  │   STOCK      │◄─── Al registrar merma: catalog_item.stockQuantity │
│  │ (catalog_item│     se reduce. stock_movement tipo 'waste' creado  │
│  │  + movements)│     en el kardex del producto.                     │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  FINANZAS    │◄─── Si configurado: movimiento 'pago' automático  │
│  │ (cobros/pagos│     con categoría 'merma_carniceria'.             │
│  │  finance DB) │     Impacto visible en P&L y dashboard KPIs.      │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │ TRABAJADORES │◄─── registeredBy = worker user_id.                │
│  │ (accounts,   │     Ranking de merma por trabajador.              │
│  │  orgchart)   │     Conexión con fichajes para normalizar.        │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  INFORMES    │◄─── Endpoints de reporting: tendencias,           │
│  │ (Reports)    │     impacto en costes, top productos,             │
│  │              │     comparativa trabajadores, coste real.          │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │ ALERTAS CORE │◄─── 4 reglas: merma elevada, repetida,           │
│  │ (alertEngine,│     caducado, lote con pérdida alta.              │
│  │  notifications│    Via emitAlert() → SSE + Push + DB.            │
│  │  SSE, Push)  │                                                    │
│  └──────┬───────┘                                                    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │   LOTES      │◄─── Si batchId: actualizar currentWeightKg.      │
│  │(butcher_batch│     Alerta si lote acumula >20% pérdida.          │
│  │  si existe)  │     Requiere CARN-ALR-01 completado.              │
│  └──────────────┘                                                    │
│                                                                      │
│  ┌──────────────┐                                                    │
│  │ HUB CARNIC.  │◄─── KPIs de merma en ButcherHub.tsx              │
│  │(ButcherHub)  │     Gráfica de merma semanal, merma por trabajador│
│  └──────────────┘                                                    │
│                                                                      │
│  NAVEGACIÓN CRUZADA:                                                 │
│  • Desde Merma → "Ver en Stock" → /saas/butcher-inventory           │
│  • Desde Merma → "Ver lote" → /saas/butcher-traceability            │
│  • Desde Merma → "Ver en Finanzas" → /saas/finance                  │
│  • Desde Hub → "Merma" (acceso rápido) → /saas/butcher-waste        │
│  • Desde Stock → "Registrar merma" → /saas/butcher-waste            │
│  • Desde Alertas → link a merma → /saas/butcher-waste?wasteType=X   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Orden de ejecución

### Fase 1 — Cimientos backend (días 1-3)

| Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|
| MRM-01 | Modelo CouchDB `butcher_waste` | 🔴 Crítica | 2-3h |
| MRM-04 | Ampliar stockMovementService con tipo `waste` | 🔴 Crítica | 1h |
| MRM-02 | Servicio `butcherWasteService.js` | 🔴 Crítica | 4-5h |
| MRM-03 | API REST (router + controller) | 🔴 Crítica | 3-4h |

> **Resultado:** API funcional de merma con descuento automático de stock.

### Fase 2 — Frontend conectado (días 4-7)

| Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|
| MRM-09 | Cliente TypeScript `butcherWasteApi.ts` | 🔴 Crítica | 2h |
| MRM-11 | Formulario de registro de merma | 🔴 Crítica | 3-4h |
| MRM-10 | Refactor completo de `ButcherWaste.tsx` | 🔴 Crítica | 6-8h |

> **Resultado:** Página funcional conectada al backend, con registro y listado real.

### Fase 3 — Alertas y automatización (días 8-10)

| Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|
| MRM-05 | Motor de alertas de merma (4 reglas) | 🟠 Alta | 4-5h |
| MRM-06 | Configuración de umbrales de alertas | 🟠 Alta | 1-2h |
| MRM-07 | Conexión con Finanzas | 🟠 Alta | 2-3h |
| MRM-08 | Actualización de coste real | 🟠 Alta | 2-3h |

> **Resultado:** Sistema completo con alertas inteligentes, impacto financiero y coste real.

### Fase 4 — Permisos, integraciones y reporting (días 11-14)

| Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|
| MRM-12 | Permisos gerente vs trabajador | 🟠 Alta | 2-3h |
| MRM-13 | Integración con ButcherHub (KPIs reales) | 🟡 Media | 2h |
| MRM-14 | Endpoints de reporting avanzado | 🟡 Media | 2-3h |

> **Resultado:** Módulo completo con permisos, datos en el Hub y reporting.

### Diagrama de dependencias

```
MRM-01 (modelo CouchDB)
  │
  ├── MRM-04 (tipo waste en stock_movement) ── sin dependencia de MRM-01
  │
  ├── MRM-02 (servicio) ← MRM-01 + MRM-04
  │     │
  │     ├── MRM-03 (API REST) ← MRM-02
  │     │     │
  │     │     └── MRM-09 (API client TS) ← MRM-03
  │     │           │
  │     │           ├── MRM-11 (formulario) ← MRM-09
  │     │           ├── MRM-10 (refactor página) ← MRM-09 + MRM-11
  │     │           └── MRM-13 (Hub KPIs) ← MRM-09
  │     │
  │     ├── MRM-05 (alertas) ← MRM-02
  │     │     │
  │     │     └── MRM-06 (config alertas) ← MRM-05
  │     │
  │     ├── MRM-07 (finanzas) ← MRM-02
  │     ├── MRM-08 (coste real) ← MRM-02
  │     └── MRM-14 (reporting) ← MRM-02
  │
  └── MRM-12 (permisos) ← MRM-03 + MRM-10
```

---

## Estimación total

| Ticket | Estimación | Fase |
|---|---|---|
| MRM-01 | 2-3h | 1 |
| MRM-02 | 4-5h | 1 |
| MRM-03 | 3-4h | 1 |
| MRM-04 | 1h | 1 |
| MRM-05 | 4-5h | 3 |
| MRM-06 | 1-2h | 3 |
| MRM-07 | 2-3h | 3 |
| MRM-08 | 2-3h | 3 |
| MRM-09 | 2h | 2 |
| MRM-10 | 6-8h | 2 |
| MRM-11 | 3-4h | 2 |
| MRM-12 | 2-3h | 4 |
| MRM-13 | 2h | 4 |
| MRM-14 | 2-3h | 4 |
| **TOTAL** | **~36-48h** | **~14 días laborables** |

---

## Relación con otros tickets existentes

| Ticket MRM | Relacionado con | Nota |
|---|---|---|
| MRM-01 (modelo) | CARN-ALR-01 (modelos carnicería) | MRM-01 amplía el `butcher_waste` ya esbozado en CARN-ALR-01 con campos adicionales (reviewStatus, financeMovementId, registeredByName, etc.) |
| MRM-02 (servicio) | CARN-ALR-02 (CRUD API carnicería) | MRM-02 implementa el servicio especializado de merma; CARN-ALR-02 definía endpoints genéricos |
| MRM-04 (stock) | CS-05 (consumo interno) | Ambos descuentan stock, pero con tipos de movimiento distintos (`waste` vs `internal_consumption`) |
| MRM-05 (alertas) | CARN-ALR-03 regla 6 (merma anómala) | MRM-05 implementa 4 reglas detalladas; CARN-ALR-03 tenía solo 1 regla genérica |
| MRM-07 (finanzas) | CC-12 (conexiones módulos) | Mismo patrón de crear movimiento financiero automático |
| MRM-08 (coste real) | CC-07 (coste medio ponderado) | MRM-08 calcula el coste REAL (ajustado por merma); CC-07 calcula el coste medio (ajustado por compras) |
| MRM-12 (permisos) | CC-13 (permisos compras) | Mismo patrón de sub-permisos por módulo |
| MRM-14 (reporting) | STK-13 (informes stock delivery) | MRM-14 es el equivalente de STK-13 pero para la vertical carnicería |
