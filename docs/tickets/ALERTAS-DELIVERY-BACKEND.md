# ALERTAS BACKEND DELIVERY / RESTAURANTE — Diseño de Tickets

**Módulo:** Backend — Motor de Alertas Delivery  
**Tipo:** Backend puro (sin frontend)  
**Objetivo:** Generar alertas automáticas específicas de la vertical delivery/restaurante que detecten problemas operativos en tiempo real, los prioricen y los distribuyan al dashboard, al centro de alertas core, a los responsables por rol y a la pantalla operativa.

---

## ✅ ESTADO: IMPLEMENTADO (auditado contra código el 08/07/2026)

El motor vive en `services/deliveryAlertEngine.js` + `controllers/deliveryAlertController.js` + `routers/deliveryAlertRouter.js` (montado en `/api/delivery/alerts`). Decisión de diseño que sustituye al polling de 60s del diseño original: **motor por eventos** (alertas reactivas en cada escritura de pedido/caja/stock) + **barrido de seguridad cada 15 min**, con umbrales configurables por el CEO (`deliveryOperationalAlertConfig.js`).

| Ticket | Estado | Dónde |
|--------|--------|-------|
| ALDV-01 Configuración | ✅ Hecho | `resolveDeliveryAlertConfig()` en `deliveryOperationalAlertConfig.js`, GET/PUT `/api/delivery/alerts/:userId/config` |
| ALDV-02 Motor independiente | ✅ Hecho (eventos + barrido 15 min, no polling 60s) | `startDeliveryAlertEngine()`, dedup 5 min en `Map`, arrancado en `index.js` |
| ALDV-03 Pedido retrasado por fase | ✅ Hecho | `checkDelayedOrders()` + `deliveryAlertStatusUtils.js` (fases/es-en, `stageHistory`) |
| ALDV-04 Cocina saturada | ✅ Hecho (incluye cola desbordada `delivery_queue_overflow`) | `checkKitchenSaturation()` |
| ALDV-05 Producto agotado en servicio | ✅ Hecho (ciclo + reactivo en `stock_updated`) | `checkDeliveryStock()` + `triggerReactiveAlert` en `deliveryController` |
| ALDV-06 Rider saturado | ✅ Hecho (incluye `delivery_no_active_riders` y `delivery_unassigned_order`) | `checkRiderSaturation()` |
| ALDV-07 Caja pendiente de cierre | ✅ Hecho (incluye caja olvidada, caja sin abrir `delivery_register_not_opened` y descuadre repartidor `delivery_driver_mismatch` reactivo) | `checkCashPendingClose()`, `checkRegisterNotOpened()` |
| ALDV-08 Canal con caída | ✅ Hecho (respeta franjas activas) | `checkChannelHealth()` |
| ALDV-09 Margen bajo | ✅ Hecho (1 de cada 15 ciclos) | `checkLowMargin()` |
| ALDV-10 Fallidas / sin cobro / reincidentes | ✅ Hecho | `checkFailedDeliveries()`, `checkUnpaidOrders()`, `checkRepeatIncidentClients()` |
| ALDV-11 Priorización + escalado | ✅ Hecho (escalado 15/30 min, resolución automática con `reconcileDeliveryAlerts()`) | `ALERT_CLASSIFICATION`, `applyEscalation()` |
| ALDV-12 Routing por rol | ✅ Hecho vía `emitGlobalAlert()` (roles/canales/quietHours por negocio, `alertRulesCatalog.js`) | `services/alertEmitter.js` |
| ALDV-13 SSE tiempo real | ✅ Hecho — `delivery:alert_triggered`, `delivery:alert_resolved`, `delivery:alert_escalated`, `delivery:alert_acknowledged`, `delivery:alerts_summary` | engine + controller |
| ALDV-14 Endpoints API | ✅ Hecho — list, active, config, check, stats, history, acknowledge, dismiss | `deliveryAlertRouter.js` |
| ALDV-15 Integración ecosistema | ✅ Hecho — resumen core (`getAlertSummary().delivery`), dashboard KPIs (`deliveryAlerts`), centro de alertas | `alertEngine.js`, `index.js` |
| ALDV-16 Alertas reactivas | ✅ Hecho — `triggerReactiveAlert()` en crear/actualizar pedido, stock y sesiones de caja (fire-and-forget) | `deliveryController.js` |

Notas vs diseño original: los estados usan la nomenclatura real en español (`nuevo/cocina/listo/en_reparto/entregado`) normalizada en `deliveryAlertStatusUtils.js`; las alertas se persisten como notificaciones del centro global (id estable `alert:{category}:{dedupKey}`) en vez de colección propia; acknowledge/dismiss operan sobre esas notificaciones.

---

## Estado actual del sistema

### Ya implementado

**Motor de alertas genérico (`alertEngine.js`):**
- Ciclo periódico cada **60 min** (`ALERT_INTERVAL_MS = 3_600_000`).
- Reglas activas: `low_stock`, `out_of_stock`, `parts_low_stock`, `overdue_purchase`, `high_payables`, `stale_web_order`, `stale_delivery`, `vehicle_stock_aging`, `stale_work_order`, `low_sales_velocity`.
- Deduplicación por ID diario (`alert:{category}:{dedupKey}:{fecha}`).
- Emisión: guarda notificación en CouchDB (`notifications` DB), broadcast SSE (`broadcastToUser`), push web (`sendPushToUser`).

**Regla `stale_delivery` existente:**
- Detecta pedidos con `status ∈ {pending, preparing, kitchen, assembly}` y `createdAt` > `staleDeliveryMinutes` (default: **60 min**).
- Solo mira el tiempo desde creación, no el tiempo en cada fase.
- No distingue entre fases ni severidad. No detecta saturación, caídas de canal, márgenes, cajas ni riders.

**Infraestructura disponible:**
- **SSE:** `sseService.js` con `broadcastToUser(userId, event, data)` y `broadcastToBusiness(businessId, event, data, excludeUserId)`.
- **Push web:** `pushService.js` con `sendPushToUser(req, userId, payload)`.
- **Notificaciones:** `notificationController.js` CRUD + broadcast al crear.
- **Configuración alertas:** `account.alertConfig` con toggles y umbrales por usuario, gestionado en `alertController.js`.
- **Datos delivery:** `delivery_order` (CRUD completo), `tpv_register_session`, `driver_cash_session`, `catalog_item` (con `stockQuantity`, `minStock`), `point_of_sale`.
- **Estados pedido:** `pending → preparing → kitchen → assembly → delivery → delivered | cancelled | incident`.
- **Timestamps por fase:** `kitchenStartedAt`, `kitchenCompletedAt`, `assemblyStartedAt`, `assemblyCompletedAt`.

**Controller de alertas (`alertController.js`):**
- `GET /api/alerts/:userId` — resumen calculado on-demand (`getAlertSummary`).
- `POST /api/alerts/:userId/check` — disparo manual del motor.
- `GET/PUT /api/alerts/:userId/config` — lectura/escritura de `alertConfig`.

### Brechas detectadas

1. **El motor corre cada 60 min** — Para delivery, donde un pedido retrasado 20 min ya es crítico, el ciclo es demasiado lento. Se necesita un ciclo rápido (60s–120s) específico para alertas delivery.
2. **No hay alertas por fase** — Solo se mide tiempo total desde `createdAt`. No se detecta un pedido atascado en cocina 25 min aunque lleve solo 30 min desde creación.
3. **No hay alerta de cocina saturada** — No se cuenta el número de pedidos simultáneos en `kitchen` vs capacidad.
4. **No hay alerta de rider saturado** — No se mide la ratio pedidos en reparto / riders activos.
5. **No hay alerta de caja sin cerrar** — No se revisan sesiones TPV ni de repartidor abiertas pasada la hora de cierre.
6. **No hay alerta de canal con caída** — No se detecta si un canal (Glovo, web, etc.) deja de recibir pedidos durante un periodo anormal.
7. **No hay alerta de margen bajo** — No se calcula el margen bruto del día vs umbral.
8. **No hay alerta de entregas fallidas** — No se contabilizan pedidos que pasan a `incident` o `cancelled` tras haber estado en `delivery`.
9. **No hay alerta de pedidos sin cobro** — No se detectan pedidos `delivered` sin registro de pago.
10. **No hay alerta de clientes con incidencias repetidas** — No se agrupa por cliente para detectar patrones.
11. **No hay sistema de prioridades** — Las alertas solo tienen `level` (warning/alert) pero no `priority` (alta/media/baja) con lógica de escalado.
12. **No hay routing por rol** — Todas las alertas van al `userId` del owner. No se envían al gerente, al cocinero o al repartidor según corresponda.
13. **No hay integración con dashboard operativo** — Las alertas no se publican en un canal específico para el centro operativo de delivery.
14. **No hay alerta de producto agotado en contexto delivery** — La regla `out_of_stock` existe pero no se dispara en tiempo real cuando un producto se agota durante el servicio.

---

## TICKETS

---

### TICKET ALDV-01: Modelo de datos — Configuración de alertas delivery

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** DL-01 (configuración delivery del negocio)

**Descripción:**  
Extender el sistema de configuración de alertas para incluir todos los umbrales y toggles específicos de la vertical delivery/restaurante. Esta configuración se almacena en `account.alertConfig` (existente) añadiendo un bloque `delivery`.

**Tareas:**

1. **Ampliar `getAlertConfig()` en `alertEngine.js` con bloque `delivery`:**

   ```javascript
   delivery: {
     // ── Activación global ──
     enabled: cfg.delivery?.enabled !== false,

     // ── Pedido retrasado por fase ──
     delayedOrderEnabled: cfg.delivery?.delayedOrderEnabled !== false,
     delayThresholds: {
       pending:   Number(cfg.delivery?.delayThresholds?.pending   || 10),  // min
       preparing: Number(cfg.delivery?.delayThresholds?.preparing || 15),  // min
       kitchen:   Number(cfg.delivery?.delayThresholds?.kitchen   || 20),  // min
       assembly:  Number(cfg.delivery?.delayThresholds?.assembly  || 10),  // min
       delivery:  Number(cfg.delivery?.delayThresholds?.delivery  || 40),  // min
     },

     // ── Cocina saturada ──
     kitchenSaturationEnabled: cfg.delivery?.kitchenSaturationEnabled !== false,
     kitchenCapacity: Number(cfg.delivery?.kitchenCapacity || 10),
     kitchenWarningPercent: Number(cfg.delivery?.kitchenWarningPercent || 70),
     kitchenCriticalPercent: Number(cfg.delivery?.kitchenCriticalPercent || 90),

     // ── Producto agotado (delivery) ──
     productOutOfStockEnabled: cfg.delivery?.productOutOfStockEnabled !== false,

     // ── Rider / reparto saturado ──
     riderSaturationEnabled: cfg.delivery?.riderSaturationEnabled !== false,
     maxOrdersPerRider: Number(cfg.delivery?.maxOrdersPerRider || 4),
     riderWarningRatio: Number(cfg.delivery?.riderWarningRatio || 3),

     // ── Caja sin cerrar ──
     cashPendingCloseEnabled: cfg.delivery?.cashPendingCloseEnabled !== false,
     cashCloseDeadline: cfg.delivery?.cashCloseDeadline || '23:30',
     cashWarningMinutes: Number(cfg.delivery?.cashWarningMinutes || 30),

     // ── Canal con caída ──
     channelDownEnabled: cfg.delivery?.channelDownEnabled !== false,
     channelSilenceMinutes: Number(cfg.delivery?.channelSilenceMinutes || 60),
     monitoredChannels: cfg.delivery?.monitoredChannels || ['web', 'app', 'glovo', 'uber_eats', 'just_eat'],

     // ── Margen bajo ──
     lowMarginEnabled: cfg.delivery?.lowMarginEnabled !== false,
     lowMarginThresholdPercent: Number(cfg.delivery?.lowMarginThresholdPercent || 20),

     // ── Entregas fallidas ──
     failedDeliveryEnabled: cfg.delivery?.failedDeliveryEnabled !== false,
     failedDeliveryThreshold: Number(cfg.delivery?.failedDeliveryThreshold || 3),

     // ── Pedidos sin cobro ──
     unpaidOrderEnabled: cfg.delivery?.unpaidOrderEnabled !== false,
     unpaidGraceMinutes: Number(cfg.delivery?.unpaidGraceMinutes || 30),

     // ── Clientes con incidencias repetidas ──
     repeatIncidentEnabled: cfg.delivery?.repeatIncidentEnabled !== false,
     repeatIncidentThreshold: Number(cfg.delivery?.repeatIncidentThreshold || 3),
     repeatIncidentWindowDays: Number(cfg.delivery?.repeatIncidentWindowDays || 30),

     // ── Intervalo del motor delivery (segundos) ──
     engineIntervalSeconds: Number(cfg.delivery?.engineIntervalSeconds || 60),
   }
   ```

2. **Actualizar `allowedKeys` en `alertController.js` → `updateAlertSettings()`:**
   - Añadir `delivery` como clave permitida (objeto completo).
   - Validar tipos: los booleanos deben ser booleanos, los números deben ser positivos, los arrays deben contener strings válidos.
   - Merge profundo: `{ ...current.delivery, ...body.delivery }` para no borrar claves no enviadas.

3. **Actualizar `getAlertSummary()` en `alertEngine.js`:**
   - Incluir sección `delivery` en la respuesta del summary con los conteos de cada tipo de alerta activa.

4. **Defaults inteligentes:**
   - Si el negocio tiene `deliveryConfig` (DL-01), usar sus valores como base:
     - `kitchenCapacity` ← `deliveryConfig.maxKitchenCapacity`
     - `delayThresholds.kitchen` ← `deliveryConfig.delayThresholdMinutes`
     - `cashCloseDeadline` ← `deliveryConfig.cashCloseReminderTime`
   - Si no tiene `deliveryConfig`, usar los defaults del bloque.

**Criterios de aceptación:**
- La configuración se lee y escribe correctamente via `GET/PUT /api/alerts/:userId/config`.
- Los defaults se aplican automáticamente si no hay configuración previa.
- La migración es suave: cuentas sin bloque `delivery` obtienen defaults sensatos.
- Los valores de `deliveryConfig` (si existe) se usan como base.
- Validación de tipos en la escritura.

---

### TICKET ALDV-02: Motor de alertas delivery — Ciclo rápido independiente

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALDV-01

**Descripción:**  
Crear un ciclo de evaluación rápido (cada 60 segundos por defecto) exclusivo para alertas de delivery, separado del motor genérico de 60 minutos. Este motor revisa las condiciones operativas en tiempo real y emite alertas con prioridad.

**Tareas:**

1. **Crear `services/deliveryAlertEngine.js`:**

   ```javascript
   // Estructura del módulo
   const DELIVERY_ALERT_INTERVAL_MS = 60_000; // configurable via ALDV-01

   export function startDeliveryAlertEngine() { ... }
   export function stopDeliveryAlertEngine() { ... }
   export async function runDeliveryAlerts() { ... }
   export async function getDeliveryAlertSummary(userId) { ... }
   ```

2. **Método `runDeliveryAlerts()`:**
   - Obtener todos los `userId` activos con `delivery.enabled: true` en su `alertConfig`.
   - Para cada usuario:
     a. Obtener la configuración de alertas delivery (ALDV-01).
     b. Cargar pedidos activos del día (`delivery_order` con `status ∉ {delivered, cancelled}`).
     c. Cargar sesiones de caja abiertas (`tpv_register_session` y `driver_cash_session` con `status: 'open'`).
     d. Cargar catálogo activo (`catalog_item` con `active: true`).
     e. Ejecutar cada regla de detección (ALDV-03 a ALDV-10).
     f. Emitir alertas con prioridad (ALDV-11).
   - Logging: registrar ejecución con `logger.info` cada ciclo (condensado, solo si hay alertas).

3. **Deduplicación con ventana corta:**
   - Para el ciclo rápido, usar ventana de deduplicación de **5 minutos** (no 24h como el motor genérico).
   - Clave de dedup: `delivery_alert:{category}:{dedupKey}:{timestamp_5min_bucket}`.
   - Usar un `Map` en memoria para la dedup rápida (evitar consultar CouchDB cada 60s).
   - Limpiar entradas del Map cada 30 minutos.

4. **Caché de datos para eficiencia:**
   - Cachear pedidos activos y sesiones de caja en memoria entre ciclos.
   - Invalidar caché cuando llega un evento de escritura (nuevo pedido, cambio de estado, etc.).
   - Tiempo de vida máximo de la caché: 120 segundos (2 ciclos).

5. **Integración con `index.js`:**
   - Importar y arrancar en el startup del servidor (junto a `startAlertEngine()`).
   - Detener en shutdown.

6. **Observabilidad:**
   - Métrica: tiempo de ejecución del ciclo (log si > 5s).
   - Métrica: número de alertas emitidas por ciclo.
   - Health check: si el ciclo no se ejecuta en 5 minutos, registrar warning.

**Criterios de aceptación:**
- El motor arranca automáticamente con el servidor.
- El ciclo se ejecuta cada 60 segundos (configurable).
- La deduplicación impide alertas repetidas en ventanas de 5 minutos.
- El tiempo de ejecución del ciclo es < 2 segundos con 200 pedidos activos.
- El motor no bloquea ni degrada el rendimiento del servidor Express.
- Se puede detener y reiniciar sin pérdida de estado.

---

### TICKET ALDV-03: Regla — Pedido retrasado por fase (+20 min)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar pedidos que llevan demasiado tiempo en una fase concreta, con umbrales configurables por fase. Reemplaza la regla `stale_delivery` genérica con una versión más granular y rápida.

**Lógica de detección:**

```
Para cada pedido con status ∈ {pending, preparing, kitchen, assembly, delivery}:
  1. Calcular tiempo_en_fase:
     - pending:   now - createdAt
     - preparing: now - (stageHistory[preparing].date || createdAt)
     - kitchen:   now - kitchenStartedAt
     - assembly:  now - assemblyStartedAt
     - delivery:  now - (stageHistory[delivery].date || assemblyCompletedAt)

  2. Comparar con umbral de la fase (delayThresholds[status]):
     - Si tiempo_en_fase >= umbral × 2 → prioridad ALTA
     - Si tiempo_en_fase >= umbral × 1.5 → prioridad MEDIA
     - Si tiempo_en_fase >= umbral → prioridad BAJA

  3. Emitir alerta tipo `delivery_delayed_order`.
```

**Tareas:**

1. **Implementar `checkDelayedOrders(userId, orders, config)` en `deliveryAlertEngine.js`:**
   - Iterar pedidos activos.
   - Para cada pedido, calcular el tiempo en su fase actual usando los timestamps disponibles.
   - Comparar con el umbral configurado para esa fase.
   - Generar alerta con:
     ```javascript
     {
       alertType: 'delivery_delayed_order',
       priority: 'high' | 'medium' | 'low',
       severity: 'critical' | 'warning' | 'info',
       orderId: order._id,
       orderNumber: order.orderNumber,
       phase: order.status,
       minutesInPhase: calculado,
       threshold: config.delayThresholds[order.status],
       route: '/saas/delivery',
       targetRoles: ['manager', 'owner', roleForPhase(order.status)],
     }
     ```
   - `roleForPhase`: `kitchen` → `kitchen`, `assembly` → `kitchen`, `delivery` → `driver`, otros → `manager`.

2. **Helper `getPhaseStartTime(order)`:**
   - Devuelve el timestamp de inicio de la fase actual del pedido.
   - Busca en `stageHistory`, luego en timestamps dedicados (`kitchenStartedAt`, etc.), y como fallback usa `createdAt`.

3. **Escenarios de prioridad:**

   | Fase | Umbral (default) | Baja | Media | Alta |
   |------|-------------------|------|-------|------|
   | pending | 10 min | ≥10 min | ≥15 min | ≥20 min |
   | preparing | 15 min | ≥15 min | ≥22 min | ≥30 min |
   | kitchen | 20 min | ≥20 min | ≥30 min | ≥40 min |
   | assembly | 10 min | ≥10 min | ≥15 min | ≥20 min |
   | delivery | 40 min | ≥40 min | ≥60 min | ≥80 min |

**Criterios de aceptación:**
- Se detectan pedidos retrasados en cada fase con umbrales independientes.
- La prioridad escala automáticamente según el retraso.
- Los timestamps de fase se calculan correctamente usando `stageHistory` o campos dedicados.
- La alerta incluye el número de pedido, la fase, el tiempo y el umbral.
- El destinatario de la alerta incluye el rol correspondiente a la fase.

---

### TICKET ALDV-04: Regla — Cocina saturada

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar cuando el número de pedidos simultáneos en estado `kitchen` supera los umbrales de capacidad configurados. Permite al negocio reaccionar antes de que la cocina colapse.

**Lógica de detección:**

```
ordersInKitchen = pedidos con status === 'kitchen'
saturationPercent = (ordersInKitchen / kitchenCapacity) × 100

Si saturationPercent >= kitchenCriticalPercent → prioridad ALTA
Si saturationPercent >= kitchenWarningPercent → prioridad MEDIA
Si ordersInKitchen >= kitchenCapacity → prioridad BAJA (al 100%)
```

**Tareas:**

1. **Implementar `checkKitchenSaturation(userId, orders, config)` en `deliveryAlertEngine.js`:**
   - Contar pedidos en estado `kitchen`.
   - Calcular porcentaje de saturación.
   - Generar alerta tipo `delivery_kitchen_saturated`:
     ```javascript
     {
       alertType: 'delivery_kitchen_saturated',
       priority: 'high' | 'medium' | 'low',
       severity: 'critical' | 'warning',
       ordersInKitchen: count,
       capacity: config.kitchenCapacity,
       saturationPercent: percent,
       oldestOrderMinutes: maxTimeInKitchen,
       route: '/saas/delivery?tab=kitchen',
       targetRoles: ['manager', 'owner', 'kitchen'],
     }
     ```

2. **Enriquecer con métricas adicionales:**
   - Incluir el pedido más antiguo en cocina (`oldestOrderMinutes`).
   - Incluir tiempo medio de espera en cocina (`avgWaitMinutes`).
   - Incluir tendencia: si la cola está creciendo (más entran que salen en los últimos 15 min).

3. **Cola de espera implícita:**
   - También contar pedidos en `preparing` como "en cola para cocina".
   - Si `ordersInKitchen + ordersInPreparing > kitchenCapacity × 1.5` → alerta adicional de "cola desbordada".

**Criterios de aceptación:**
- La saturación se calcula correctamente como ratio pedidos/capacidad.
- Se emiten alertas en los 3 niveles (70%, 90%, 100%).
- Se incluyen métricas adicionales (pedido más antiguo, media, tendencia).
- La alerta se envía al gerente y a los cocineros.

---

### TICKET ALDV-05: Regla — Producto agotado durante el servicio

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar productos del catálogo que se agotan (o caen por debajo del stock mínimo) durante el servicio activo. A diferencia de la regla genérica `out_of_stock` que se ejecuta cada hora, esta se ejecuta cada minuto y genera alertas inmediatas contextualizadas para cocina y TPV.

**Lógica de detección:**

```
Para cada catalog_item con active: true y minStock > 0:
  Si stockQuantity <= 0:
    → Alerta "producto_agotado" prioridad ALTA
    → Incluir pedidos activos que contienen este producto (impacto)

  Si stockQuantity > 0 y stockQuantity <= minStock:
    → Alerta "producto_stock_critico" prioridad MEDIA
    → Incluir estimación de unidades restantes vs pedidos pendientes
```

**Tareas:**

1. **Implementar `checkDeliveryStock(userId, catalogItems, activeOrders, config)` en `deliveryAlertEngine.js`:**
   - Filtrar productos activos con `minStock > 0`.
   - Para productos agotados:
     - Buscar pedidos activos que incluyan ese producto → calcular impacto.
     - Generar alerta tipo `delivery_product_out_of_stock`:
       ```javascript
       {
         alertType: 'delivery_product_out_of_stock',
         priority: 'high',
         severity: 'critical',
         itemId: item._id,
         itemName: item.name,
         itemSku: item.sku,
         stockQuantity: 0,
         minStock: item.minStock,
         impactedOrders: ordersWithItem.length,
         route: '/saas/catalog/' + item._id,
         targetRoles: ['manager', 'owner', 'kitchen'],
       }
       ```
   - Para productos en stock crítico:
     - Estimar unidades que demandan los pedidos pendientes (sumando cantidades en pedidos activos).
     - Si demanda pendiente > stock → escalar a prioridad ALTA.

2. **Alerta reactiva en escritura (complementaria):**
   - En `deliveryController.js`, al actualizar stock de un `catalog_item` (si baja de `minStock`), disparar alerta inmediata sin esperar al ciclo.
   - Esto cubre el caso de que un cocinero marca un producto como agotado desde la cocina (ticket KDS futuro).

**Criterios de aceptación:**
- Se detectan productos agotados y en stock crítico cada 60 segundos.
- La alerta incluye el impacto (pedidos activos afectados).
- La prioridad escala si la demanda pendiente supera el stock restante.
- Se envía a gerente y cocineros.
- La alerta reactiva en escritura es inmediata (< 2s).

---

### TICKET ALDV-06: Regla — Rider / reparto saturado

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar cuando la flota de reparto está saturada: demasiados pedidos por repartidor, repartidores sin sesión de caja activa, o pedidos en `delivery` sin repartidor asignado.

**Lógica de detección:**

```
driversActive = número de driver_cash_session con status 'open'
ordersInDelivery = pedidos con status === 'delivery'
ordersWaitingPickup = pedidos con status === 'assembly' (esperando que un rider los recoja)

ratioOrdersPerDriver = ordersInDelivery / max(driversActive, 1)

Si ratioOrdersPerDriver >= maxOrdersPerRider → prioridad ALTA
Si ratioOrdersPerDriver >= riderWarningRatio → prioridad MEDIA
Si ordersWaitingPickup > 0 y driversActive === 0 → prioridad ALTA ("sin riders activos")
Si algún pedido en delivery no tiene driverName → prioridad MEDIA ("pedido sin rider")
```

**Tareas:**

1. **Implementar `checkRiderSaturation(userId, orders, driverSessions, config)` en `deliveryAlertEngine.js`:**
   - Contar drivers activos (sesiones de caja abiertas).
   - Contar pedidos en `delivery` y en `assembly` (cola de recogida).
   - Calcular ratio.
   - Generar alertas tipo `delivery_rider_saturated`:
     ```javascript
     {
       alertType: 'delivery_rider_saturated',
       priority: 'high' | 'medium',
       severity: 'critical' | 'warning',
       driversActive: count,
       ordersInDelivery: count,
       ordersWaitingPickup: count,
       ratioOrdersPerDriver: ratio,
       maxOrdersPerRider: config.maxOrdersPerRider,
       unassignedOrders: ordersWithoutDriver.map(o => o.orderNumber),
       route: '/saas/delivery?tab=delivery',
       targetRoles: ['manager', 'owner', 'driver'],
     }
     ```

2. **Caso especial: Sin riders activos:**
   - Si hay pedidos esperando reparto y no hay ningún rider con sesión abierta → alerta separada tipo `delivery_no_active_riders` con prioridad ALTA.

3. **Pedido sin repartidor asignado:**
   - Pedidos en `delivery` sin campo `driverName` o `driverName` vacío → alerta `delivery_unassigned_order` prioridad MEDIA.

**Criterios de aceptación:**
- La saturación se calcula como ratio pedidos/riders.
- Se detecta la ausencia total de riders activos.
- Se detectan pedidos sin repartidor asignado.
- Las alertas se envían al gerente y a los repartidores.

---

### TICKET ALDV-07: Regla — Caja pendiente de cierre

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar sesiones de caja (TPV y repartidor) que llevan abiertas más tiempo del esperado o que no se han cerrado pasada la hora límite configurada.

**Lógica de detección:**

```
Para cada tpv_register_session con status === 'open':
  horasAbierta = (now - openedAt) / 3_600_000
  horaActual = HH:MM

  Si horaActual > cashCloseDeadline:
    minutesPastDeadline = diff(horaActual, cashCloseDeadline)
    Si minutesPastDeadline > cashWarningMinutes × 2 → prioridad ALTA
    Si minutesPastDeadline > cashWarningMinutes → prioridad MEDIA
    Else → prioridad BAJA

  Si horasAbierta > 12 (sin cerrar en todo el día):
    → prioridad ALTA ("sesión olvidada")

Para cada driver_cash_session con status === 'open':
  Si el driver no tiene pedidos activos y la sesión lleva > 2h:
    → prioridad MEDIA ("sesión de caja repartidor sin actividad")
```

**Tareas:**

1. **Implementar `checkCashPendingClose(userId, tpvSessions, driverSessions, config)` en `deliveryAlertEngine.js`:**
   - Revisar sesiones TPV abiertas vs hora de cierre.
   - Revisar sesiones de repartidor sin actividad.
   - Generar alertas tipo `delivery_cash_pending_close`:
     ```javascript
     {
       alertType: 'delivery_cash_pending_close',
       priority: 'high' | 'medium' | 'low',
       severity: 'warning' | 'critical',
       sessionType: 'tpv' | 'driver',
       sessionId: session._id,
       pointOfSale: session.pointOfSaleName,
       terminalName: session.terminalName,
       openedBy: session.openedByName,
       openedAt: session.openedAt,
       hoursOpen: hours,
       deadline: config.cashCloseDeadline,
       route: '/saas/delivery?tab=driverCash',
       targetRoles: ['manager', 'owner', 'cashier'],
     }
     ```

2. **Alerta de diferencia de caja sospechosa:**
   - Si una sesión cerrada recientemente tiene `difference` (entre esperado y contado) > 5% del total → alerta `delivery_cash_discrepancy` prioridad MEDIA.
   - Esto se dispara reactivamente al cerrar la sesión (en el controller), no en el ciclo periódico.

**Criterios de aceptación:**
- Se detectan sesiones abiertas pasada la hora de cierre.
- La prioridad escala según el tiempo pasado del deadline.
- Se detectan sesiones de repartidor sin actividad.
- Se envía a gerente y cajeros.

---

### TICKET ALDV-08: Regla — Canal con caída

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** ALDV-02

**Descripción:**  
Detectar anomalías en el flujo de pedidos por canal. Si un canal que normalmente recibe pedidos deja de recibirlos durante un periodo inusual, se genera una alerta. Esto ayuda a detectar problemas de integración con plataformas (Glovo caído, web caída, tablet desconectada).

**Lógica de detección:**

```
Para cada canal en monitoredChannels:
  lastOrderFromChannel = max(createdAt) de pedidos del día con channel === canal
  minutesSinceLastOrder = (now - lastOrderFromChannel) / 60_000

  Si minutesSinceLastOrder >= channelSilenceMinutes:
    // Verificar que es horario activo (dentro de activeTimeSlots)
    Si está en franja horaria activa:
      → Alerta "delivery_channel_silent" prioridad MEDIA

  // Comparación con patrón histórico (opcional fase 2):
  Si el canal recibió < 50% de los pedidos habituales para esta franja:
    → Alerta "delivery_channel_underperforming" prioridad BAJA
```

**Tareas:**

1. **Implementar `checkChannelHealth(userId, orders, config, deliveryConfig)` en `deliveryAlertEngine.js`:**
   - Para cada canal monitorizado, buscar el pedido más reciente del día.
   - Calcular el silencio en minutos.
   - Verificar si estamos en franja horaria activa (usando `deliveryConfig.activeTimeSlots`).
   - Generar alerta tipo `delivery_channel_silent`:
     ```javascript
     {
       alertType: 'delivery_channel_silent',
       priority: 'medium',
       severity: 'warning',
       channel: channelName,
       channelLabel: 'Glovo' | 'Uber Eats' | 'Web' | ...,
       minutesSilent: minutes,
       threshold: config.channelSilenceMinutes,
       lastOrderAt: timestamp,
       timeSlot: currentSlotLabel,
       route: '/saas/delivery',
       targetRoles: ['manager', 'owner'],
     }
     ```

2. **Mapa de labels de canales:**
   ```javascript
   const CHANNEL_LABELS = {
     direct: 'Venta directa',
     phone: 'Teléfono',
     web: 'Web',
     app: 'App',
     glovo: 'Glovo',
     uber_eats: 'Uber Eats',
     just_eat: 'Just Eat',
   };
   ```

3. **Filtrado inteligente:**
   - No alertar fuera de horario activo.
   - No alertar si el canal no ha tenido pedidos nunca (es nuevo o no configurado).
   - No alertar si hoy es un día atípico (fase 2: comparar con histórico).

**Criterios de aceptación:**
- Se detecta silencio prolongado en canales monitorizados.
- Solo se alerta dentro de franjas horarias activas.
- La alerta incluye el canal, el tiempo de silencio y la franja horaria.
- Se envía solo al gerente/owner (los trabajadores no necesitan esta info).

---

### TICKET ALDV-09: Regla — Margen bajo del día

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** ALDV-02

**Descripción:**  
Calcular el margen bruto estimado del día (facturación - coste de productos) y alertar si está por debajo del umbral configurado. Permite al gerente tomar decisiones sobre promociones, precios o volumen.

**Lógica de detección:**

```
Para todos los pedidos del día con status ∈ {delivered, delivery}:
  totalRevenue = Σ order.total
  totalCost = Σ (item.costPrice * item.quantity) para cada item de cada pedido
  marginPercent = ((totalRevenue - totalCost) / totalRevenue) × 100

  Si marginPercent < lowMarginThresholdPercent → prioridad MEDIA
  Si marginPercent < lowMarginThresholdPercent / 2 → prioridad ALTA
```

**Tareas:**

1. **Implementar `checkLowMargin(userId, orders, catalogItems, config)` en `deliveryAlertEngine.js`:**
   - Calcular facturación del día.
   - Calcular coste estimado (requiere `costPrice` en `catalog_item`).
   - Calcular margen porcentual.
   - Si no hay `costPrice` en los productos, omitir esta regla y logear warning.
   - Generar alerta tipo `delivery_low_margin`:
     ```javascript
     {
       alertType: 'delivery_low_margin',
       priority: 'medium' | 'high',
       severity: 'warning' | 'critical',
       totalRevenue: amount,
       estimatedCost: amount,
       marginPercent: percent,
       threshold: config.lowMarginThresholdPercent,
       ordersAnalyzed: count,
       route: '/saas/finance',
       targetRoles: ['manager', 'owner'],
     }
     ```

2. **Limitaciones documentadas:**
   - El coste es estimado (se basa en `costPrice` del catálogo, no en el coste real de la compra).
   - Si un producto no tiene `costPrice`, se excluye del cálculo.
   - Solo se calcula 1 vez cada 15 minutos (no cada 60s) para eficiencia.

**Criterios de aceptación:**
- El margen se calcula correctamente sobre los pedidos del día.
- Se alerta si baja del umbral configurado.
- Se indica claramente que es una estimación.
- Solo gerentes/owners reciben esta alerta.

---

### TICKET ALDV-10: Regla — Entregas fallidas, pedidos sin cobro y clientes repetidores

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02

**Descripción:**  
Tres reglas agrupadas que detectan patrones problemáticos en el cierre de pedidos: entregas que fallan, pedidos entregados sin registro de pago, y clientes que acumulan incidencias.

**Regla 10a — Entregas fallidas:**

```
failedDeliveries = pedidos del día que pasaron de status 'delivery' a 'incident' o 'cancelled'
                   (buscar en stageHistory: alguna entrada con status 'delivery' seguida de 'incident'|'cancelled')

Si failedDeliveries.count >= failedDeliveryThreshold → prioridad ALTA
Si failedDeliveries.count >= 1 → prioridad BAJA (por cada entrega fallida individual)
```

**Regla 10b — Pedidos sin cobro:**

```
deliveredUnpaid = pedidos con status 'delivered' y (paymentStatus !== 'paid' o !paymentMethod)
                  y (now - deliveredAt) > unpaidGraceMinutes

Si deliveredUnpaid.count >= 5 → prioridad ALTA ("múltiples pedidos sin cobro")
Si deliveredUnpaid.count >= 1 → prioridad MEDIA (por pedido)
```

**Regla 10c — Clientes con incidencias repetidas:**

```
Para cada cliente con pedidos en los últimos repeatIncidentWindowDays:
  incidentCount = pedidos con status 'incident' de este cliente
  Si incidentCount >= repeatIncidentThreshold → prioridad MEDIA
```

**Tareas:**

1. **Implementar `checkFailedDeliveries(userId, orders, config)` en `deliveryAlertEngine.js`:**
   - Buscar pedidos cuyo `stageHistory` contenga una transición de `delivery` → `incident` o `cancelled`.
   - Generar alerta tipo `delivery_failed_delivery`:
     ```javascript
     {
       alertType: 'delivery_failed_delivery',
       priority: 'high' | 'low',
       severity: 'critical' | 'warning',
       failedOrders: [{ orderId, orderNumber, reason, driverName }],
       totalFailed: count,
       threshold: config.failedDeliveryThreshold,
       route: '/saas/delivery?tab=incidents',
       targetRoles: ['manager', 'owner', 'driver'],
     }
     ```

2. **Implementar `checkUnpaidOrders(userId, orders, config)` en `deliveryAlertEngine.js`:**
   - Filtrar pedidos `delivered` sin `paymentMethod` o con `paymentStatus !== 'paid'`.
   - Aplicar periodo de gracia (`unpaidGraceMinutes`).
   - Generar alerta tipo `delivery_unpaid_order`:
     ```javascript
     {
       alertType: 'delivery_unpaid_order',
       priority: 'high' | 'medium',
       severity: 'warning' | 'critical',
       unpaidOrders: [{ orderId, orderNumber, total, deliveredAt }],
       totalUnpaid: count,
       totalAmount: sumOfUnpaidTotals,
       route: '/saas/delivery?tab=cash',
       targetRoles: ['manager', 'owner', 'cashier'],
     }
     ```

3. **Implementar `checkRepeatIncidentClients(userId, orders, config)` en `deliveryAlertEngine.js`:**
   - Agrupar pedidos por `clientId` o `clientPhone`.
   - Filtrar clientes con >= `repeatIncidentThreshold` incidencias en la ventana.
   - Generar alerta tipo `delivery_repeat_incident_client`:
     ```javascript
     {
       alertType: 'delivery_repeat_incident_client',
       priority: 'medium',
       severity: 'warning',
       clientName: name,
       clientPhone: phone,
       incidentCount: count,
       windowDays: config.repeatIncidentWindowDays,
       recentIncidents: [{ orderId, orderNumber, date, incidentType }],
       route: '/saas/crm/clientes',
       targetRoles: ['manager', 'owner'],
     }
     ```

**Criterios de aceptación:**
- Se detectan entregas fallidas analizando `stageHistory`.
- Se detectan pedidos entregados sin registro de pago tras el periodo de gracia.
- Se detectan clientes con incidencias repetidas en la ventana temporal.
- Cada regla tiene su propia prioridad y destinatarios.

---

### TICKET ALDV-11: Sistema de priorización y severidad

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALDV-02

**Descripción:**  
Implementar un sistema unificado de priorización de alertas con tres niveles (alta/media/baja) y severidad (critical/warning/info), con lógica de escalado automático y clasificación para routing.

**Tareas:**

1. **Definir esquema de prioridad en `deliveryAlertEngine.js`:**

   ```javascript
   const PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
   const SEVERITY = { CRITICAL: 'critical', WARNING: 'warning', INFO: 'info' };

   const ALERT_CLASSIFICATION = {
     delivery_delayed_order:          { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: true  },
     delivery_kitchen_saturated:      { defaultPriority: 'high',   defaultSeverity: 'critical', escalable: false },
     delivery_product_out_of_stock:   { defaultPriority: 'high',   defaultSeverity: 'critical', escalable: false },
     delivery_product_low_stock:      { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: true  },
     delivery_rider_saturated:        { defaultPriority: 'high',   defaultSeverity: 'critical', escalable: false },
     delivery_no_active_riders:       { defaultPriority: 'high',   defaultSeverity: 'critical', escalable: false },
     delivery_cash_pending_close:     { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: true  },
     delivery_cash_discrepancy:       { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: false },
     delivery_channel_silent:         { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: false },
     delivery_low_margin:             { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: true  },
     delivery_failed_delivery:        { defaultPriority: 'high',   defaultSeverity: 'critical', escalable: false },
     delivery_unpaid_order:           { defaultPriority: 'medium', defaultSeverity: 'warning',  escalable: true  },
     delivery_repeat_incident_client: { defaultPriority: 'low',    defaultSeverity: 'info',     escalable: true  },
   };
   ```

2. **Lógica de escalado automático:**
   - Si una alerta `escalable: true` lleva activa más de **15 minutos** sin resolverse → subir prioridad un nivel (low→medium, medium→high).
   - Si una alerta de prioridad `high` lleva activa más de **30 minutos** → marcar como `escalated: true` y enviar notificación adicional al owner.
   - Tracking de escalado: usar un `Map<alertKey, firstSeenAt>` en memoria.

3. **Estructura unificada de alerta emitida:**

   ```javascript
   {
     id: 'dalert:{alertType}:{dedupKey}:{timestamp}',
     type: 'delivery_alert',
     alertType: 'delivery_delayed_order',
     priority: 'high',
     severity: 'critical',
     escalated: false,
     title: 'Pedido #142 retrasado en cocina',
     message: 'Lleva 35 min (umbral: 20 min). Prioridad alta.',
     data: { /* payload específico de la regla */ },
     route: '/saas/delivery?tab=kitchen',
     targetRoles: ['manager', 'owner', 'kitchen'],
     businessId: '...',
     userId: '...',
     createdAt: '...',
     resolvedAt: null,
     acknowledgedAt: null,
     acknowledgedBy: null,
   }
   ```

4. **Resolución automática:**
   - Cuando la condición que generó la alerta deja de cumplirse (pedido avanza de fase, stock se repone, caja se cierra), marcar la alerta como `resolvedAt: now`.
   - Emitir evento SSE `delivery:alert_resolved` para actualizar la UI.

**Criterios de aceptación:**
- Todas las alertas tienen `priority` (high/medium/low) y `severity` (critical/warning/info).
- El escalado automático funciona tras 15 y 30 minutos.
- Las alertas se resuelven automáticamente cuando la condición desaparece.
- La estructura es consistente para todas las reglas.

---

### TICKET ALDV-12: Routing de alertas por rol y destino

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALDV-11

**Descripción:**  
Implementar la lógica de distribución de alertas a los destinatarios correctos según su rol, con soporte para múltiples canales de entrega: notificación in-app, SSE, push web, y persistencia para el dashboard.

**Destinos de cada alerta:**

| Canal de entrega | Descripción | Cuándo |
|------------------|-------------|---------|
| **Notificación in-app** | Documento en `notifications` DB | Siempre (todas las alertas) |
| **SSE** | Evento `delivery:alert_triggered` | Siempre (tiempo real) |
| **Push web** | Push notification al dispositivo | Solo prioridad alta + usuario con push habilitado |
| **Dashboard delivery** | Incluida en `GET /api/delivery/ops-center` (DL-03) | Siempre (leída on-demand) |
| **Centro de alertas core** | Incluida en `GET /api/alerts/:userId` | Siempre (resumen global) |

**Routing por rol:**

| Alerta | Gerente (owner/admin/manager) | Cocinero (kitchen) | Repartidor (driver) | Cajero (cashier) | Trabajador genérico |
|--------|------|---------|------------|--------|------------|
| Pedido retrasado | ✅ todas las fases | ✅ solo fase kitchen/assembly | ✅ solo fase delivery | ❌ | ❌ |
| Cocina saturada | ✅ | ✅ | ❌ | ❌ | ❌ |
| Producto agotado | ✅ | ✅ | ❌ | ❌ | ❌ |
| Rider saturado | ✅ | ❌ | ✅ | ❌ | ❌ |
| Caja sin cerrar | ✅ | ❌ | ❌ | ✅ | ❌ |
| Canal caído | ✅ | ❌ | ❌ | ❌ | ❌ |
| Margen bajo | ✅ | ❌ | ❌ | ❌ | ❌ |
| Entregas fallidas | ✅ | ❌ | ✅ | ❌ | ❌ |
| Pedidos sin cobro | ✅ | ❌ | ❌ | ✅ | ❌ |
| Cliente reincidente | ✅ | ❌ | ❌ | ❌ | ❌ |

**Tareas:**

1. **Implementar `routeAlert(alert, businessMembers)` en `deliveryAlertEngine.js`:**
   - Recibir la alerta con `targetRoles`.
   - Obtener miembros del negocio (del equipo/roles configurados).
   - Filtrar miembros cuyos roles coincidan con `targetRoles`.
   - Para cada destinatario:
     a. Guardar notificación en CouchDB con `userId` del destinatario.
     b. Enviar por SSE: `broadcastToUser(userId, 'delivery:alert_triggered', alert)`.
     c. Si prioridad alta y usuario tiene push: `sendPushToUser(req, userId, pushPayload)`.

2. **Obtener miembros del negocio:**
   - Usar el campo `businessId` de la cuenta.
   - Buscar cuentas con el mismo `businessId` (o relación owner/team en la estructura existente).
   - Si no hay equipo configurado, enviar solo al owner.

3. **Perfil gerente:**
   - Roles `owner`, `admin`, `manager` → reciben TODAS las alertas delivery.
   - En el resumen global de alertas (`GET /api/alerts/:userId`) se incluyen las alertas delivery.

4. **Perfil trabajador:**
   - Roles `kitchen`, `driver`, `cashier`, `worker` → reciben solo alertas relevantes a su rol.
   - El centro de alertas del trabajador solo muestra sus alertas filtradas.

5. **SSE por negocio:**
   - Usar `broadcastToBusiness(businessId, 'delivery:alert_triggered', alert)` para alertas que afectan a todo el equipo.
   - Filtrar en el cliente según el rol del usuario conectado (no enviar datos financieros a trabajadores).

**Criterios de aceptación:**
- Las alertas llegan al gerente siempre.
- Los trabajadores solo reciben alertas de su rol.
- Push solo se envía en prioridad alta.
- Las alertas se persisten en notificaciones y se incluyen en el resumen de alertas core.
- El SSE funciona con `broadcastToBusiness` para distribuir a todos los conectados.

---

### TICKET ALDV-13: Emisión de alertas delivery por SSE en tiempo real

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-11, ALDV-12

**Descripción:**  
Definir y emitir los eventos SSE específicos de alertas delivery para que el frontend (dashboard, centro operativo, pantalla de cocina, etc.) los reciba en tiempo real.

**Eventos SSE a emitir:**

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `delivery:alert_triggered` | Se crea una nueva alerta delivery | Alerta completa (ALDV-11) |
| `delivery:alert_resolved` | Una condición se resuelve automáticamente | `{ alertId, alertType, resolvedAt }` |
| `delivery:alert_escalated` | Una alerta sube de prioridad | `{ alertId, alertType, oldPriority, newPriority }` |
| `delivery:alert_acknowledged` | Un usuario reconoce una alerta | `{ alertId, acknowledgedBy, acknowledgedAt }` |
| `delivery:alerts_summary` | Resumen periódico (cada 5 min) | `{ total, byPriority, byType }` |

**Tareas:**

1. **Emitir `delivery:alert_triggered` desde `routeAlert()` (ALDV-12):**
   - Usar `broadcastToBusiness(businessId, 'delivery:alert_triggered', alert)` para que todos los clientes conectados del negocio reciban la alerta.
   - Incluir campo `targetRoles` en el payload para que el frontend filtre por rol.

2. **Emitir `delivery:alert_resolved` desde la lógica de resolución automática (ALDV-11):**
   - Cuando una alerta se marca como resuelta, emitir evento para que el frontend la retire.

3. **Emitir `delivery:alert_escalated` desde la lógica de escalado (ALDV-11):**
   - Cuando una alerta sube de prioridad, emitir evento para que el frontend actualice la UI.

4. **Endpoint de reconocimiento de alerta:**
   - `PUT /api/delivery/alerts/:alertId/acknowledge` — Marca la alerta como reconocida por el usuario.
   - Emite `delivery:alert_acknowledged` por SSE.
   - Campos actualizados: `acknowledgedAt`, `acknowledgedBy`.

5. **Resumen periódico:**
   - Cada 5 minutos, emitir `delivery:alerts_summary` con conteos por prioridad y tipo.
   - Esto permite al dashboard actualizar badges sin hacer polling al endpoint.

**Criterios de aceptación:**
- Los 5 eventos SSE se emiten correctamente.
- El payload incluye toda la información necesaria para actualizar la UI sin re-fetch.
- El evento `alert_triggered` se recibe en < 2 segundos.
- La resolución automática emite `alert_resolved` en el mismo ciclo que detecta la resolución.
- El reconocimiento funciona y se propaga por SSE.

---

### TICKET ALDV-14: Endpoints API de alertas delivery

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-11, ALDV-12

**Descripción:**  
Crear endpoints REST específicos para las alertas de delivery, separados del endpoint genérico de alertas (`/api/alerts`). Estos endpoints alimentan el centro operativo (DL-09), el dashboard y el centro de alertas core.

**Tareas:**

1. **Crear `controllers/deliveryAlertController.js`:**

   ```javascript
   // GET /api/delivery/alerts/:userId
   export async function getDeliveryAlerts(req, res) { ... }

   // GET /api/delivery/alerts/:userId/active
   export async function getActiveDeliveryAlerts(req, res) { ... }

   // PUT /api/delivery/alerts/:alertId/acknowledge
   export async function acknowledgeDeliveryAlert(req, res) { ... }

   // PUT /api/delivery/alerts/:alertId/dismiss
   export async function dismissDeliveryAlert(req, res) { ... }

   // GET /api/delivery/alerts/:userId/history
   export async function getDeliveryAlertHistory(req, res) { ... }

   // GET /api/delivery/alerts/:userId/stats
   export async function getDeliveryAlertStats(req, res) { ... }
   ```

2. **Endpoint `GET /api/delivery/alerts/:userId`:**
   - **Query params:** `priority`, `alertType`, `status` (active|resolved|acknowledged), `from`, `to`, `limit`, `offset`.
   - **Response:**
     ```json
     {
       "ok": true,
       "alerts": [ /* Array de alertas con estructura ALDV-11 */ ],
       "total": 15,
       "summary": {
         "total": 15,
         "active": 8,
         "resolved": 5,
         "acknowledged": 2,
         "byPriority": { "high": 3, "medium": 7, "low": 5 },
         "byType": {
           "delivery_delayed_order": 4,
           "delivery_kitchen_saturated": 1,
           "delivery_cash_pending_close": 2,
           "delivery_unpaid_order": 3,
           "delivery_product_low_stock": 5
         }
       }
     }
     ```

3. **Endpoint `GET /api/delivery/alerts/:userId/active`:**
   - Versión ligera: solo alertas activas (no resueltas ni descartadas), ordenadas por prioridad (high primero) y luego por antigüedad.
   - Diseñado para el banner de alertas del centro operativo (DL-09).

4. **Endpoint `PUT /api/delivery/alerts/:alertId/acknowledge`:**
   - Marca la alerta como reconocida (el usuario la vio y la acepta).
   - No la resuelve, solo indica que alguien la está gestionando.
   - Emite SSE `delivery:alert_acknowledged`.

5. **Endpoint `PUT /api/delivery/alerts/:alertId/dismiss`:**
   - Descarta la alerta (el usuario decide ignorarla).
   - Campo `dismissedAt`, `dismissedBy`.
   - No aparece más en la lista activa, pero sí en el historial.

6. **Endpoint `GET /api/delivery/alerts/:userId/history`:**
   - Alertas resueltas/descartadas de los últimos N días (default: 7).
   - Para auditoría y análisis de patrones.

7. **Endpoint `GET /api/delivery/alerts/:userId/stats`:**
   - Estadísticas agregadas: alertas por tipo por día, tiempo medio de resolución, alertas más frecuentes.
   - Periodo: último mes.

8. **Montar rutas en `deliveryRouter.js` o crear `deliveryAlertRouter.js` separado:**
   - Registrar en `index.js` bajo `/api/delivery/alerts` y alias `/api/v2/delivery/alerts`.
   - Auth: `requireAuth` + `burstLimiter`.

**Criterios de aceptación:**
- Los 6 endpoints funcionan correctamente con auth.
- Las alertas se filtran, paginan y ordenan correctamente.
- El summary incluye conteos por prioridad y tipo.
- Acknowledge y dismiss actualizan el estado y emiten SSE.
- El historial permite auditoría de los últimos 7 días.

---

### TICKET ALDV-15: Conexiones — Integración con módulos del ecosistema

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-02, ALDV-12, ALDV-14

**Descripción:**  
Asegurar que el motor de alertas delivery está correctamente integrado con todos los módulos que lee y con todos los destinos a los que escribe. Las alertas no viven aisladas: se alimentan de datos de múltiples fuentes y sus resultados se distribuyen a múltiples destinos.

**Mapa de conexiones:**

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FUENTES DE DATOS (lectura)                        │
│                                                                      │
│  ┌──────────┐  ┌──────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐  │
│  │ Pedidos  │  │ TPV  │  │ Cocina  │  │ Montaje │  │ Catálogo/  │  │
│  │ delivery │  │      │  │(estado) │  │(estado) │  │   Stock    │  │
│  │ _order   │  │      │  │         │  │         │  │ catalog_   │  │
│  │          │  │      │  │         │  │         │  │   item     │  │
│  └─────┬────┘  └──┬───┘  └────┬────┘  └────┬────┘  └─────┬──────┘  │
│        │          │           │             │              │         │
│  ┌─────┴────┐  ┌──┴────────┐ │  ┌──────────┴──┐  ┌───────┴──────┐  │
│  │ Reparto  │  │ Caja TPV  │ │  │    Sala     │  │  Finanzas    │  │
│  │ driver_  │  │ tpv_      │ │  │ (tableNum)  │  │  (márgenes)  │  │
│  │ cash_    │  │ register_ │ │  │             │  │              │  │
│  │ session  │  │ session   │ │  │             │  │              │  │
│  └──────────┘  └───────────┘ │  └─────────────┘  └──────────────┘  │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  DELIVERY ALERT     │
                    │     ENGINE          │
                    │  (deliveryAlert     │
                    │   Engine.js)        │
                    └──────────┬──────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│                    DESTINOS (escritura)                              │
│                              │                                      │
│  ┌──────────┐  ┌─────────┐  │  ┌──────────┐  ┌──────────────────┐  │
│  │Dashboard │  │Alertas  │  │  │ Push Web │  │ Pantalla         │  │
│  │ delivery │  │  Core   │  │  │ (VAPID)  │  │ operativa        │  │
│  │(DL-03)   │  │(alertas │  │  │          │  │ (SSE delivery:*) │  │
│  │          │  │ genéric)│  │  │          │  │                  │  │
│  └──────────┘  └─────────┘  │  └──────────┘  └──────────────────┘  │
│                              │                                      │
│  ┌──────────────────────────┐│  ┌──────────────────────────────────┐│
│  │ Notificaciones in-app   ││  │ SSE (broadcastToBusiness /      ││
│  │ (notifications DB)      ││  │      broadcastToUser)           ││
│  └──────────────────────────┘│  └──────────────────────────────────┘│
│                              │                                      │
└──────────────────────────────┴──────────────────────────────────────┘
```

**Tareas:**

1. **Conexión con Pedidos (`deliveryController.js`):**
   - Al crear/actualizar/cambiar estado de un pedido → disparar evaluación reactiva de alertas relevantes:
     - Nuevo pedido → evaluar saturación cocina.
     - Cambio a `incident` → evaluar entregas fallidas y clientes repetidores.
     - Cambio a `delivered` → evaluar pedidos sin cobro (tras gracia).
   - Implementar función `triggerDeliveryAlertCheck(userId, event, data)` que evalúa solo las reglas afectadas.

2. **Conexión con TPV / Caja (`deliveryController.js` — sesiones):**
   - Al abrir/cerrar sesión de caja → evaluar regla de caja pendiente.
   - Al cerrar sesión con diferencia → evaluar discrepancia de caja.

3. **Conexión con Cocina (estados de pedido):**
   - Al entrar un pedido en `kitchen` → evaluar saturación.
   - Al salir un pedido de `kitchen` → re-evaluar saturación.

4. **Conexión con Stock / Catálogo:**
   - Al actualizar `stockQuantity` de un `catalog_item` → evaluar stock agotado/crítico.
   - Esto se hace en el controller de catálogo existente.

5. **Conexión con Alertas Core (`alertController.js`):**
   - Incluir alertas delivery en `getAlertSummary()`:
     ```javascript
     delivery: {
       active: activeDeliveryAlerts.length,
       byPriority: { high: X, medium: Y, low: Z },
       byType: { ... },
       mostCritical: topAlert || null,
     }
     ```
   - El centro de alertas core (`/api/alerts/:userId`) debe agregar tanto las alertas genéricas como las de delivery.

6. **Conexión con Dashboard (`/api/dashboard/kpis/:userId`):**
   - Incluir campo `deliveryAlerts` en la respuesta de KPIs del dashboard:
     ```javascript
     deliveryAlerts: {
       total: 5,
       critical: 2,
       warning: 3,
     }
     ```

7. **Conexión con Centro Operativo (DL-03):**
   - El endpoint `GET /api/delivery/ops-center/:userId` incluirá las alertas activas llamando a `getActiveDeliveryAlerts()` internamente.

**Criterios de aceptación:**
- Los eventos de escritura en pedidos, cajas y stock disparan evaluación reactiva de alertas.
- Las alertas delivery se incluyen en el resumen de alertas core.
- El dashboard de KPIs incluye conteo de alertas delivery.
- El centro operativo consume las alertas directamente.
- El diagrama de conexiones se cumple íntegramente.

---

### TICKET ALDV-16: Alertas reactivas en escritura (tiempo real sin esperar ciclo)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALDV-03 a ALDV-10, ALDV-12

**Descripción:**  
Complementar el ciclo periódico de 60 segundos con alertas reactivas que se disparan inmediatamente al ocurrir ciertos eventos de escritura. Esto reduce la latencia de detección de 60 segundos a < 2 segundos para las condiciones más críticas.

**Eventos que disparan evaluación reactiva:**

| Evento de escritura | Reglas evaluadas | Desde dónde se dispara |
|---------------------|------------------|------------------------|
| Nuevo pedido creado | Cocina saturada, Canal con caída | `deliveryController.createOrder()` |
| Cambio de estado de pedido | Pedido retrasado (nueva fase), Cocina saturada, Rider saturado | `deliveryController.updateOrderStatus()` |
| Pedido marcado como `incident` | Entregas fallidas, Clientes repetidores | `deliveryController.reportIncident()` |
| Pedido marcado como `delivered` | Pedidos sin cobro (inicio de gracia) | `deliveryController.updateOrderStatus()` |
| Stock actualizado | Producto agotado/crítico | `catalogController.updateItem()` |
| Sesión de caja abierta/cerrada | Caja sin cerrar, Discrepancia | `deliveryController.openCashSession()` / `closeCashSession()` |

**Tareas:**

1. **Crear función `triggerReactiveAlert(userId, eventType, payload)` en `deliveryAlertEngine.js`:**
   - Recibe el tipo de evento y datos relevantes.
   - Ejecuta solo las reglas afectadas (no todas).
   - Respeta la deduplicación (no emitir si ya se emitió en los últimos 5 min).
   - Es asíncrona y no bloquea la respuesta al cliente (fire-and-forget con catch de errores).

2. **Integrar en `deliveryController.js`:**
   - Tras cada operación de escritura exitosa, llamar a `triggerReactiveAlert()`.
   - Usar `process.nextTick()` o `setImmediate()` para no bloquear la respuesta HTTP.
   - Ejemplo:
     ```javascript
     // En updateOrderStatus:
     res.json({ ok: true, order: updatedOrder });
     // Fire-and-forget
     triggerReactiveAlert(userId, 'order_status_changed', {
       orderId: order._id,
       oldStatus,
       newStatus,
       businessId,
     }).catch(err => logger.warn({ tag: 'REACTIVE_ALERT', err: err?.message }));
     ```

3. **Integrar en controllers de catálogo y caja:**
   - Similar al punto 2, tras actualizar stock o abrir/cerrar caja.

**Criterios de aceptación:**
- Los eventos de escritura disparan alertas reactivas en < 2 segundos.
- Las alertas reactivas respetan la deduplicación.
- La respuesta HTTP no se bloquea por la evaluación de alertas.
- Solo se evalúan las reglas relevantes al evento (no todas).
- Los errores en alertas reactivas no afectan al flujo principal.

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (Semana 1)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALDV-01 | Configuración de alertas delivery | Backend | Crítica |
| ALDV-02 | Motor de alertas delivery — Ciclo rápido | Backend | Crítica |
| ALDV-11 | Sistema de priorización y severidad | Backend | Crítica |

### Fase 2 — Reglas de detección (Semanas 2-3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALDV-03 | Pedido retrasado por fase (+20 min) | Backend | Alta |
| ALDV-04 | Cocina saturada | Backend | Alta |
| ALDV-05 | Producto agotado durante el servicio | Backend | Alta |
| ALDV-06 | Rider / reparto saturado | Backend | Alta |
| ALDV-07 | Caja pendiente de cierre | Backend | Alta |
| ALDV-10 | Entregas fallidas, sin cobro, cliente reincidente | Backend | Alta |

### Fase 3 — Reglas secundarias (Semana 3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALDV-08 | Canal con caída | Backend | Media |
| ALDV-09 | Margen bajo del día | Backend | Media |

### Fase 4 — Distribución y tiempo real (Semana 4)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALDV-12 | Routing de alertas por rol y destino | Backend | Crítica |
| ALDV-13 | Emisión SSE de alertas en tiempo real | Backend | Alta |
| ALDV-14 | Endpoints API de alertas delivery | Backend | Alta |

### Fase 5 — Integración y optimización (Semana 5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALDV-15 | Conexiones con módulos del ecosistema | Backend | Alta |
| ALDV-16 | Alertas reactivas en escritura | Backend | Alta |

---

## MAPA DE ALERTAS — Referencia rápida

| # | Alerta | Condición | Prioridad default | Destinatarios |
|---|--------|-----------|-------------------|---------------|
| 1 | Pedido retrasado | Pedido > umbral en fase | media (escalable) | Gerente + rol de fase |
| 2 | Cocina saturada | Pedidos en cocina > capacidad × % | alta | Gerente + cocineros |
| 3 | Producto agotado | `stockQuantity <= 0` en servicio | alta | Gerente + cocineros |
| 4 | Producto stock crítico | `stockQuantity <= minStock` | media (escalable) | Gerente + cocineros |
| 5 | Rider saturado | Ratio pedidos/rider > umbral | alta | Gerente + repartidores |
| 6 | Sin riders activos | 0 sesiones rider con pedidos en cola | alta | Gerente + repartidores |
| 7 | Caja sin cerrar | Sesión abierta pasado el deadline | media (escalable) | Gerente + cajeros |
| 8 | Discrepancia de caja | Diferencia esperado/contado > 5% | media | Gerente + cajeros |
| 9 | Canal silencioso | Sin pedidos de un canal > umbral min | media | Gerente |
| 10 | Margen bajo | Margen bruto del día < umbral % | media (escalable) | Gerente |
| 11 | Entrega fallida | Pedido delivery → incident/cancelled | alta | Gerente + repartidores |
| 12 | Pedido sin cobro | Entregado sin pago tras gracia | media (escalable) | Gerente + cajeros |
| 13 | Cliente reincidente | >= N incidencias en ventana de días | baja (escalable) | Gerente |

---

## REFERENCIAS CRUZADAS CON OTROS TICKETS

| Ticket externo | Relación con este módulo |
|---------------|--------------------------|
| **DL-01** (Config delivery negocio) | ALDV-01 lee `deliveryConfig` para defaults de umbrales (capacidad cocina, hora cierre caja, canales activos). |
| **DL-03** (Endpoint ops-center) | ALDV-15 inyecta alertas activas en la respuesta de `GET /api/delivery/ops-center/:userId`. |
| **DL-04** (SSE delivery) | ALDV-13 define y emite los eventos `delivery:alert_*` que DL-04 describe conceptualmente. ALDV-13 es la implementación backend de lo que DL-04 define como "Motor de alertas periódico". |
| **DL-09** (Widget alertas frontend) | ALDV-14 proporciona los endpoints que DL-09 consume para mostrar las alertas en el centro operativo. |
| **KDS-05** (Alertas cocina en alertEngine) | ALDV-04 reemplaza y amplía las reglas de cocina que KDS-05 planteaba añadir directamente en `alertEngine.js`. ALDV-04 es más completo (incluye cola desbordada, tendencia). |
| **CARNICERIA-ALERTAS-BACKEND** (Extracción alertEmitter.js) | Ambos módulos necesitan `emitAlert()`. La extracción a `services/alertEmitter.js` (propuesta en carnicería) beneficia a ALDV-02, que debe importar esa función compartida en vez de duplicarla. |
| **FLOTANTE-REPARTIDOR** (Alertas repartidor) | ALDV-06 y ALDV-07 cubren de forma más amplia las alertas de rider/caja que FLOTANTE-REPARTIDOR define para su scope. Se deben coordinar para no duplicar reglas. |
| **CAJA** (Alertas caja) | ALDV-07 complementa las alertas de caja definidas en CAJA-07, añadiendo el contexto delivery (hora de cierre, sesiones de repartidor inactivas). |
| **FINANZAS** (Alertas financieras) | ALDV-09 (margen bajo) se enfoca en margen delivery del día; FIN-07 cubre alertas financieras generales. No se solapan si ALDV-09 solo calcula margen sobre `delivery_order`. |
| **SALA-MESAS-TICKETS** (Alertas sala) | ALDV-02 no incluye alertas de sala/mesas directamente; esas se definen en SALA-MESAS como módulo independiente. El motor delivery las puede agregar en el futuro. |

---

## NOTAS TÉCNICAS

### Naming conventions
- Archivos: `deliveryAlertEngine.js`, `deliveryAlertController.js`
- Tipos de alerta: prefijo `delivery_` (ej: `delivery_delayed_order`)
- Eventos SSE: prefijo `delivery:alert_` (ej: `delivery:alert_triggered`)
- IDs de alerta: `dalert:{type}:{dedupKey}:{timestamp}`
- Categorías en notificaciones: reutilizar `category` del `buildNotificationDocument` existente

### Eficiencia
- El ciclo rápido (60s) debe completarse en < 2 segundos.
- Usar caché en memoria para pedidos activos y sesiones de caja (TTL: 120s).
- La deduplicación rápida usa `Map` en memoria (no CouchDB por cada ciclo).
- Las alertas reactivas son fire-and-forget y no bloquean respuestas HTTP.

### Compatibilidad
- El motor de alertas genérico (`alertEngine.js`) sigue funcionando sin cambios.
- La regla `stale_delivery` existente se puede deprecar o mantener como fallback de baja frecuencia.
- Los endpoints de `alertController.js` siguen funcionando y agregan las alertas delivery en el summary.
- Los tipos de notificación existentes (`notification` en CouchDB) se reutilizan añadiendo `alertType` y `priority` como campos nuevos.
