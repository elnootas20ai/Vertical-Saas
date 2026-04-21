# ALERTAS BACKEND DESGUACES — Diseño de Tickets

**Módulo:** Backend — Motor de Alertas Desguaces  
**Tipo:** Backend puro (sin frontend)  
**Vertical:** `scrapyard` (Desguaces)  
**Objetivo:** Generar alertas automáticas específicas de la vertical desguaces que detecten problemas documentales, operativos, económicos y de stock, los prioricen y los distribuyan al dashboard, al centro de alertas core, a los responsables por rol y a las pantallas operativas correspondientes.  
**Fecha:** 2026-04-15

---

## Estado actual del sistema

### Ya implementado

**Motor de alertas genérico (`alertEngine.js`):**
- Ciclo periódico cada **60 min** (`ALERT_INTERVAL_MS = 3_600_000`).
- Deduplicación por ID diario (`alert:{category}:{dedupKey}:{fecha}`).
- Emisión: guarda notificación en CouchDB (`notifications` DB), broadcast SSE (`broadcastToUser`), push web (`sendPushToUser`), email opcional.

**Datos de vehículo (`buildVehicleDocument` en `couchdb.js`):**
- Campos: `status` (`available`, `reserved`, `sold`, `workshop`, `scrapped`), `purchasePrice`, `salePrice`, `purchaseDate`, `soldAt`, `daysInStock`, `registrationPlate`, `vin`, `brand`, `model`, `year`, `fuelType`, `mileage`.
- Campos de desguace: `dismantlingStartedAt`, `dismantlingCompletedAt`, `dismantlingProgress` (0–100), `totalPartsExpected`, `totalPartsExtracted`, `procedencia`, `entryDate`.
- Documentos embebidos: `documents[]` con `documentType` normalizado (`permiso_circulacion`, `ficha_tecnica`, `baja_temporal`, `baja_definitiva`, `factura_compra`, `contrato_compra`, `certificado_destruccion`, `informe_itv`, `otro`).
- Costes asociados: `associatedCosts[]` con categorías (preparacion, itv, limpieza, fotos, publicidad, otro).
- Base CouchDB: `VEHICLES_DB`, documentos `type: 'car'`.

**Datos de piezas (`buildScrapyardPartDocument` en `couchdb.js`):**
- Campos: `referencia`, `codigoInterno`, `nombre`, `categoria`, `subcategoria`, `vehiculoOrigenId`, `vehiculoOrigenLabel`, `vehiculoOrigenMatricula`.
- Campos comerciales: `estado` (disponible, reservada, vendida, defectuosa), `precioVenta`, `precioMinimo`.
- Campos de ubicación: `ubicacion`, `zona`, `estanteria`.
- Compatibilidades: `compatibilidades[]` con `marca`, `modelo`, `anio`.
- Base CouchDB: `getScrapyardDbName()` → `'scrapyard'`, documentos `type: 'scrapyard_part'`.

**Datos de sesión de despiece (`buildDismantlingSession` en `couchdb.js`):**
- Campos: `vehicleId`, `vehicleLabel`, `vehicleMatricula`, `status` (in_progress, completed), `piezasPrevistas[]`, `historial[]`, `trabajadores[]`.
- Base CouchDB: `'scrapyard'`, documentos `type: 'dismantling_session'`.

**Datos de ventas de piezas (`buildScrapyardSaleDocument` en `couchdb.js`):**
- Campos: `numVenta`, `canal` (mostrador, telefono, web, talleres, marketplace), `clientName`, `clientPhone`, `clientEmail`, `clientTipo` (particular, taller, empresa).
- Líneas: `lineas[]` con piezas vendidas.
- Económicos: `importeTotal`, `descuentoGlobal`, `importeNeto`, `importeConIva`, `iva`, `margen`.
- Pagos: `formaPago`, `estadoPago` (pendiente, parcial, cobrada), `pagos[]`.
- Logística: `entrega` (recogida, envio), `envio` (datos de envío), `estado` (borrador, confirmada, preparando, lista, enviada, entregada, cancelada).
- Otros: `responsable`, `garantia`, `documentos[]`, `historial[]`, `reservaExpira`.
- Base CouchDB: `getScrapyardSalesDbName()`, documentos `type: 'scrapyard_sale'`.

**Datos de finanzas:**
- `financeController.js` con movimientos `type: 'cobro'` y `type: 'pago'`.
- Campos: `totalAmount`, `date`, `status`, `dueDate`, `category`, `linkedEntityId`, `linkedEntityType`.

**Datos de documentación:**
- `documentsController.js` con `type: 'document'`, filtros por `vehicleId`.
- Categorías documentales del vehículo embebidas en `vehicle.documents[]`.

**Alertas de scrapyard ya registradas en `alertConstants.js`:**
- `scrapyard_order_pending_ship` → source `verticales`
- `scrapyard_sale_unpaid` → source `finanzas`
- `scrapyard_sold_not_delivered` → source `verticales`
- `scrapyard_reservation_expired` → source `stock`
- `acquisition_missing_docs` → source `adquisiciones`
- `acquisition_excessive_cost` → source `adquisiciones`
- `acquisition_unclosed` → source `adquisiciones`
- `acquisition_unjustified_expense` → source `adquisiciones`

**Función stub sin implementar:**
- `checkScrapyardSalesAlerts(ctx, scrapyardSales)` se invoca en `alertEngine.js` (línea 1424) pero **no existe** la definición de la función — falta todo el cuerpo de reglas.

**Infraestructura disponible:**
- **SSE:** `sseService.js` con `broadcastToUser(userId, event, data)` y `broadcastToBusiness(businessId, event, data, excludeUserId)`.
- **Push web:** `pushService.js` con `sendPushToUser(req, userId, payload)`.
- **Notificaciones:** `notificationController.js` CRUD + broadcast al crear.
- **Configuración alertas:** `account.alertConfig` con toggles y umbrales por usuario, gestionado en `alertController.js`.
- **Roles:** Catálogo de roles en `roleCatalog.ts` con permisos por área.

### Brechas detectadas

| # | Brecha | Impacto |
|---|--------|---------|
| 1 | **No hay motor de alertas de desguace** — `checkScrapyardSalesAlerts` se invoca pero no existe la función ni un archivo `scrapyardAlertEngine.js` | Ninguna alerta específica de desguace se genera |
| 2 | **No hay alerta de vehículo sin baja** — Un vehículo puede permanecer indefinidamente sin baja temporal ni definitiva tramitada | Riesgo legal: vehículo en desguace sin baja = responsabilidad del titular |
| 3 | **No hay alerta de pieza sin precio** — Una pieza extraída puede no tener `precioVenta` asignado | Pieza invisible para venta, pérdida de ingresos |
| 4 | **No hay alerta de pieza sin ubicación** — Una pieza puede carecer de `ubicacion`, `zona` o `estanteria` | Pieza "perdida" en el almacén, ineficiencia operativa |
| 5 | **No hay alerta de venta sin cobro** — Una venta confirmada con `estadoPago: 'pendiente'` puede permanecer sin cobrar | Pérdida económica directa |
| 6 | **No hay alerta de pedido sin enviar** — Una venta con `entrega: 'envio'` y `estado` distinto de `enviada`/`entregada` puede estancarse | Cliente insatisfecho, pieza bloqueada |
| 7 | **No hay alerta de stock parado** — Piezas en estado `disponible` demasiado tiempo sin venderse | Capital inmovilizado, depreciación |
| 8 | **No hay alerta de documento faltante** — Vehículo sin documentación obligatoria (baja, certificado destrucción, factura compra) | Riesgo legal y fiscal |
| 9 | **No hay alerta de compra sin justificar** — Gastos de adquisición sin factura o documentación soporte | Riesgo fiscal: gastos no deducibles |
| 10 | **No hay alerta de productividad anómala** — No se detecta despiece estancado, trabajadores sin actividad ni ritmo de extracción bajo | Ineficiencia operativa sin visibilidad |
| 11 | **No hay alerta de margen bajo** — Ventas de piezas con margen insuficiente o negativo | Rentabilidad deteriorada sin detección |
| 12 | **No hay routing por rol** — Las alertas de desguace no distinguen entre gerente y trabajador | Sin distribución operativa por perfil |
| 13 | **No hay integración con dashboard desguace** — `ScrapyardDashboard.tsx` no consume alertas reales | El gerente no ve alertas en su panel |
| 14 | **El source `desguaces` no existe** — Las categorías se reparten entre `verticales`, `finanzas`, `stock` y `adquisiciones` en vez de un source unificado | Dificulta filtrar alertas de la vertical |
| 15 | **La reserva expirada de pieza no se evalúa** — Existe la categoría `scrapyard_reservation_expired` pero sin lógica de evaluación | Piezas reservadas indefinidamente bloqueando stock |

---

## Arquitectura propuesta

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SCRAPYARD ALERT ENGINE                                │
│                  services/scrapyardAlertEngine.js                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Vehículo sin │ │ Pieza sin    │ │ Pieza sin    │ │ Venta sin    │  │
│  │ baja         │ │ precio       │ │ ubicación    │ │ cobro        │  │
│  │ (documental) │ │ (operativa)  │ │ (operativa)  │ │ (económica)  │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │
│         │                │                │                 │           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Pedido sin   │ │ Stock        │ │ Documento    │ │ Compra sin   │  │
│  │ enviar       │ │ parado       │ │ faltante     │ │ justificar   │  │
│  │ (operativa)  │ │ (comercial)  │ │ (documental) │ │ (documental) │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │
│         │                │                │                 │           │
│  ┌──────────────┐ ┌──────────────┐                                    │
│  │ Productividad│ │ Margen bajo  │                                    │
│  │ anómala      │ │ en ventas    │                                    │
│  │ (operativa)  │ │ (económica)  │                                    │
│  └──────┬───────┘ └──────┬───────┘                                    │
│         │                │                                             │
│         └────────────────┴────────────┬───────────────────────┘        │
│                                       ▼                                │
│                          classifyByPriority()                          │
│                    operativa / económica / documental                   │
│                                       │                                │
│                  ┌────────────────────┼────────────────────┐           │
│                  ▼                    ▼                    ▼            │
│            ┌──────────┐        ┌──────────┐        ┌──────────┐       │
│            │emitGlobal│        │broadcast │        │broadcast │       │
│            │Alert     │        │ToUser    │        │ToBusiness│       │
│            │(CouchDB) │        │(SSE)     │        │(SSE)     │       │
│            └────┬─────┘        └────┬─────┘        └────┬─────┘       │
│                 │                   │                    │              │
│                 ▼                   ▼                    ▼              │
│         ┌─────────────────────────────────────────────────────┐       │
│         │           CANALES DE DISTRIBUCIÓN                    │       │
│         ├─────────────┬──────────┬──────────┬─────────────────┤       │
│         │  Dashboard  │ Alertas  │ Pantalla │  Push Web       │       │
│         │  desguace   │  Core    │ operativa│  (alta          │       │
│         │  (gerente)  │(sistema) │(trabajad.)│  prioridad)    │       │
│         └─────────────┴──────────┴──────────┴─────────────────┘       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Flujo por perfil

```
GERENTE (owner / admin / Gerente):
  Dashboard → alertas globales del desguace
  │ Vehículos sin baja pendiente
  │ Piezas sin precio (no vendibles)
  │ Ventas con cobro pendiente
  │ Pedidos retrasados / sin enviar
  │ Stock de piezas parado (+30/60/90 días)
  │ Documentación faltante (vehículos y compras)
  │ Compras sin justificar
  │ Margen bajo en ventas
  │ Resumen de productividad (despieces estancados)
  │ KPIs económicos de alertas

TRABAJADOR (operario despiece / almacén / ventas):
  Pantalla operativa → alertas de su turno y tareas
  │ Despiece asignado estancado
  │ Piezas extraídas sin ubicar
  │ Piezas extraídas sin precio
  │ Pedidos asignados sin preparar / sin enviar
  │ Ventas asignadas con cobro pendiente
```

---

## TICKETS

---

### TICKET ADS-01: Modelo de datos — Configuración de alertas desguaces

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

**Descripción:**  
Extender el sistema de configuración de alertas para incluir todos los umbrales y toggles específicos de la vertical desguaces. Esta configuración se almacena en `account.alertConfig` (existente) añadiendo un bloque `scrapyard`.

**Tareas:**

1. **Ampliar `getAlertConfig()` en `alertEngine.js` con bloque `scrapyard`:**

   ```javascript
   scrapyard: {
     // ── Activación global ──
     enabled: cfg.scrapyard?.enabled !== false,

     // ── Vehículo sin baja pendiente ──
     pendingDeregistrationEnabled: cfg.scrapyard?.pendingDeregistrationEnabled !== false,
     pendingDeregistrationDays: Number(cfg.scrapyard?.pendingDeregistrationDays || 7),
     pendingDeregistrationCriticalDays: Number(cfg.scrapyard?.pendingDeregistrationCriticalDays || 30),

     // ── Pieza sin precio ──
     partNoPriceEnabled: cfg.scrapyard?.partNoPriceEnabled !== false,
     partNoPriceGraceDays: Number(cfg.scrapyard?.partNoPriceGraceDays || 2),

     // ── Pieza sin ubicación ──
     partNoLocationEnabled: cfg.scrapyard?.partNoLocationEnabled !== false,
     partNoLocationGraceDays: Number(cfg.scrapyard?.partNoLocationGraceDays || 1),

     // ── Venta sin cobro ──
     saleUnpaidEnabled: cfg.scrapyard?.saleUnpaidEnabled !== false,
     saleUnpaidDays: Number(cfg.scrapyard?.saleUnpaidDays || 3),
     saleUnpaidCriticalDays: Number(cfg.scrapyard?.saleUnpaidCriticalDays || 15),

     // ── Pedido sin enviar / retrasado ──
     orderPendingShipEnabled: cfg.scrapyard?.orderPendingShipEnabled !== false,
     orderPendingShipDays: Number(cfg.scrapyard?.orderPendingShipDays || 2),
     orderPendingShipCriticalDays: Number(cfg.scrapyard?.orderPendingShipCriticalDays || 7),

     // ── Stock parado (pieza demasiado tiempo sin vender) ──
     staleStockEnabled: cfg.scrapyard?.staleStockEnabled !== false,
     staleStockWarningDays: Number(cfg.scrapyard?.staleStockWarningDays || 30),
     staleStockHighDays: Number(cfg.scrapyard?.staleStockHighDays || 60),
     staleStockCriticalDays: Number(cfg.scrapyard?.staleStockCriticalDays || 90),

     // ── Documento faltante en vehículo ──
     vehicleMissingDocsEnabled: cfg.scrapyard?.vehicleMissingDocsEnabled !== false,
     vehicleRequiredDocs: cfg.scrapyard?.vehicleRequiredDocs || [
       'baja_temporal', 'factura_compra', 'permiso_circulacion', 'ficha_tecnica'
     ],
     vehicleMissingDocsGraceDays: Number(cfg.scrapyard?.vehicleMissingDocsGraceDays || 5),

     // ── Compra sin justificar (gasto sin factura / sin documento) ──
     unjustifiedPurchaseEnabled: cfg.scrapyard?.unjustifiedPurchaseEnabled !== false,
     unjustifiedPurchaseGraceDays: Number(cfg.scrapyard?.unjustifiedPurchaseGraceDays || 7),

     // ── Productividad anómala ──
     productivityEnabled: cfg.scrapyard?.productivityEnabled !== false,
     dismantlingStaleDays: Number(cfg.scrapyard?.dismantlingStaleDays || 5),
     dismantlingStaleExtractionPct: Number(cfg.scrapyard?.dismantlingStaleExtractionPct || 25),
     workerInactivityDays: Number(cfg.scrapyard?.workerInactivityDays || 2),

     // ── Margen bajo en ventas de piezas ──
     lowMarginEnabled: cfg.scrapyard?.lowMarginEnabled !== false,
     lowMarginThresholdPercent: Number(cfg.scrapyard?.lowMarginThresholdPercent || 15),
     lowMarginAbsoluteThreshold: Number(cfg.scrapyard?.lowMarginAbsoluteThreshold || 5),

     // ── Reserva de pieza expirada ──
     reservationExpiredEnabled: cfg.scrapyard?.reservationExpiredEnabled !== false,
     reservationExpiredDays: Number(cfg.scrapyard?.reservationExpiredDays || 7),
   }
   ```

2. **Actualizar `allowedKeys` en `alertController.js` → `updateAlertSettings()`:**
   - Añadir `scrapyard` como clave permitida (objeto completo).
   - Validar tipos: booleanos son booleanos, números son positivos, arrays contienen strings válidos.
   - Merge profundo: `{ ...current.scrapyard, ...body.scrapyard }` para no borrar claves no enviadas.

3. **Actualizar `getAlertSummary()` en `alertEngine.js`:**
   - Incluir sección `scrapyard` en la respuesta del summary con los conteos de cada tipo de alerta activa.

4. **Defaults inteligentes:**
   - Si el negocio tiene `businessType === 'scrapyard'`, usar valores específicos del sector.
   - Si no, desactivar el bloque completo (`enabled: false`).
   - Los umbrales de documentación deben incluir `baja_temporal` o `baja_definitiva` como obligatorio para desguaces.

**Criterios de aceptación:**
- La configuración se lee y escribe correctamente vía `GET/PUT /api/alerts/:userId/config`.
- Los defaults se aplican automáticamente si no hay configuración previa.
- La migración es suave: cuentas sin bloque `scrapyard` obtienen defaults sensatos.
- Solo se activa para negocios `scrapyard`.
- Validación de tipos en la escritura.

---

### TICKET ADS-02: Motor de alertas desguaces — Archivo principal e integración en alertEngine

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ADS-01

**Descripción:**  
Crear el archivo `services/scrapyardAlertEngine.js` con las funciones de evaluación de alertas e integrarlo en el motor existente `alertEngine.js`, ejecutándose cada 60 minutos (ciclo estándar). El desguace opera con datos de operación diaria: vehículos entrantes, piezas en stock, ventas activas, despieces en curso. El ciclo de 60 minutos es adecuado.

**Tareas:**

1. **Crear `services/scrapyardAlertEngine.js`:**

   ```javascript
   import { emitGlobalAlert } from './alertEmitter.js';
   import {
     VEHICLES_DB, getScrapyardDbName, getScrapyardSalesDbName,
     getFinanceDbName, getDocumentsDbName,
     ensureDatabase, getAllDocuments,
   } from './couchdb.js';
   import logger from './logger.js';

   export function getScrapyardAlertConfig(account) { ... }
   export async function runScrapyardAlerts(ctx, config, vehicles, parts, sessions, sales, documents) { ... }
   export async function getScrapyardAlertSummary(userId) { ... }
   ```

2. **Función `runScrapyardAlerts(ctx, config, ...)`:**
   - Recibe el contexto (`businessId`, `userId`), la configuración y los datos ya cargados.
   - Ejecuta las 10 reglas de detección (ADS-03 a ADS-12).
   - Devuelve array de alertas emitidas.

3. **Integrar en `runAlertsForBusiness()` de `alertEngine.js`:**
   - Detectar si la cuenta es `scrapyard` o tiene el bloque `scrapyard.enabled`.
   - Cargar datos adicionales: piezas (`type: 'scrapyard_part'`), sesiones de despiece (`type: 'dismantling_session'`), ventas (`type: 'scrapyard_sale'`), documentos por vehículo.
   - Llamar a `runScrapyardAlerts()` con los datos.
   - **Reemplazar** la llamada actual a `checkScrapyardSalesAlerts(ctx, scrapyardSales)` (stub sin implementar) por la llamada al motor completo.
   - Acumular resultados en el array `results`.

4. **Carga de datos:**
   ```javascript
   // En runAlertsForBusiness, dentro de bloque scrapyard:
   if (business.businessType === 'scrapyard') {
     try {
       const scrapConfig = getScrapyardAlertConfig(account);
       const [scrapParts, scrapSessions, scrapSales, scrapDocs] = await Promise.all([
         fetchAllDocsOfType(getScrapyardDbName(), 'scrapyard_part')
           .then(d => d.filter(i => i.user_id === ownerId)),
         fetchAllDocsOfType(getScrapyardDbName(), 'dismantling_session')
           .then(d => d.filter(i => i.user_id === ownerId)),
         fetchAllDocs(getScrapyardSalesDbName())
           .then(d => d.filter(i => i.type === 'scrapyard_sale' && i.user_id === ownerId && !i.deletedAt)),
         fetchAllDocsOfType(getDocumentsDbName(), 'document')
           .then(d => d.filter(i => i.user_id === ownerId && !i.deletedAt)),
       ]);
       results.push(...await runScrapyardAlerts(
         ctx, scrapConfig, vehicles, scrapParts, scrapSessions, scrapSales, scrapDocs
       ));
     } catch (err) {
       logger.warn({ tag: 'ALERT_ENGINE', err: err?.message, businessId },
         'Error ejecutando alertas desguace');
     }
   }
   ```

5. **Eliminar el stub actual:**
   - Borrar las líneas 1422–1424 de `alertEngine.js` (la carga de `scrapyardSales` y la llamada a `checkScrapyardSalesAlerts`) y sustituirlas por el bloque del punto 4.

6. **Logging y observabilidad:**
   - Tag: `SCRAPYARD_ALERT_ENGINE`.
   - Loguear número de alertas generadas por tipo si > 0.
   - Loguear tiempo de ejecución del bloque desguaces.

**Criterios de aceptación:**
- El motor se ejecuta automáticamente dentro del ciclo del `alertEngine` existente.
- Solo se ejecuta para usuarios/negocios con vertical `scrapyard`.
- Los datos se cargan eficientemente (aprovechando `Promise.all`).
- El tiempo de ejecución del bloque desguaces es < 3 segundos.
- Los errores en alertas de desguace no afectan al resto del motor.
- El stub `checkScrapyardSalesAlerts` queda eliminado y sustituido.

---

### TICKET ADS-03: Regla — Vehículo con baja pendiente

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar vehículos en el desguace que no tienen tramitada la baja temporal ni la baja definitiva. Un vehículo que entra en un centro autorizado de tratamiento (CAT) debe darse de baja en la DGT; no hacerlo es una infracción legal.

**Lógica de detección:**

```
Para cada vehículo con status ∈ {available, workshop} y procedencia no vacía (es vehículo de desguace):
  1. Buscar en vehicle.documents[] un documento con documentType ∈
     {'baja_temporal', 'baja_definitiva', 'certificado_destruccion'}
  2. Buscar en documentos externos vinculados al vehicleId con categoría
     de baja

  3. Si NO tiene ningún documento de baja:
     diasDesdeEntrada = now - (entryDate || purchaseDate || createdAt)

     Si diasDesdeEntrada > pendingDeregistrationCriticalDays (30):
       → prioridad ALTA — "Baja pendiente urgente"
     Si diasDesdeEntrada > pendingDeregistrationDays (7):
       → prioridad MEDIA — "Baja pendiente"
     Clasificación: DOCUMENTAL
```

**Alerta especial — Vehículo `scrapped` sin certificado de destrucción:**
```
Para vehículos con status === 'scrapped':
  Si NO tiene documento tipo 'certificado_destruccion':
    → prioridad ALTA — "Vehículo dado de baja sin certificado de destrucción"
    → Clasificación: DOCUMENTAL
```

**Tareas:**

1. **Implementar `checkPendingDeregistration(ctx, vehicles, documents, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar vehículos de desguace (con `procedencia` no vacía o `business.businessType === 'scrapyard'`).
   - Verificar existencia de documento de baja en `vehicle.documents[]` y en documentos externos.
   - Generar alerta tipo `scrapyard_pending_deregistration`:
     ```javascript
     {
       category: 'scrapyard_pending_deregistration',
       source: 'desguaces',
       priority: days > criticalDays ? 'high' : 'medium',
       level: days > criticalDays ? 'alert' : 'warning',
       title: 'Vehículo con baja pendiente',
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) lleva ${days} días sin tramitar la baja. Entrada: ${formatDate(entryDate)}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vertical/desguaces/vehiculos/${vehicle._id}?tab=documents`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate, vin: vehicle.vin,
         daysSinceEntry: days, entryDate,
         classification: 'documental',
       },
     }
     ```

2. **Implementar `checkScrappedWithoutCertificate(ctx, vehicles, documents, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar vehículos con `status === 'scrapped'` sin certificado de destrucción.
   - Generar alerta tipo `scrapyard_no_destruction_cert` prioridad ALTA.

**Criterios de aceptación:**
- Se detectan vehículos de desguace sin baja tramitada.
- Se respeta el periodo de gracia configurable.
- Se detectan vehículos dados de baja sin certificado de destrucción.
- La prioridad escala según días transcurridos.
- Deduplicación: una alerta por vehículo por día.

---

### TICKET ADS-04: Regla — Pieza sin precio

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Operativa

**Descripción:**  
Detectar piezas extraídas (`scrapyard_part`) en estado `disponible` que no tienen `precioVenta` asignado o lo tienen a 0. Una pieza sin precio no puede venderse ni aparecer en búsquedas con sentido comercial.

**Lógica de detección:**

```
Para cada pieza con estado === 'disponible' y active !== false:
  Si precioVenta es null, undefined, 0 o NaN:
    diasDesdeCreacion = now - createdAt

    Si diasDesdeCreacion > partNoPriceGraceDays (2):
      → prioridad MEDIA — "Pieza sin precio de venta"
      → Si la pieza tiene compatibilidades y es de categoría de alto valor
        (motores, cajas_cambio, centralitas) → prioridad ALTA
      → Clasificación: OPERATIVA
```

**Tareas:**

1. **Implementar `checkPartNoPrice(ctx, parts, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar piezas disponibles con `precioVenta` vacío, null o 0.
   - Agrupar por vehículo de origen para una alerta resumen si hay muchas del mismo vehículo.
   - Generar alerta tipo `scrapyard_part_no_price`:
     ```javascript
     {
       category: 'scrapyard_part_no_price',
       source: 'desguaces',
       priority: isHighValueCategory ? 'high' : 'medium',
       level: 'warning',
       title: 'Pieza sin precio de venta',
       message: `${part.nombre} (${part.codigoInterno}) — Vehículo: ${part.vehiculoOrigenLabel}. Sin precio asignado desde hace ${days} días.`,
       entityId: part._id,
       entityType: 'scrapyard_part',
       route: `/saas/vertical/desguaces/piezas/${part._id}`,
       metadata: {
         partName: part.nombre, partCode: part.codigoInterno,
         category: part.categoria, vehicleOrigin: part.vehiculoOrigenLabel,
         daysSinceCreation: days,
         classification: 'operativa',
       },
     }
     ```

2. **Alerta agrupada — Muchas piezas sin precio:**
   - Si más de 10 piezas del mismo `vehiculoOrigenId` carecen de precio → una sola alerta resumen de prioridad ALTA:
     `"14 piezas del vehículo X sin precio de venta"`.

3. **Categorías de alto valor (prioridad escalada):**
   ```javascript
   const HIGH_VALUE_CATEGORIES = [
     'motores', 'cajas_cambio', 'centralitas', 'turbocompresores',
     'alternadores', 'compresores'
   ];
   ```

**Criterios de aceptación:**
- Se detectan piezas disponibles sin precio de venta.
- Se respeta el periodo de gracia configurable.
- Se agrupan por vehículo si hay muchas del mismo origen.
- Las piezas de alto valor escalan a prioridad alta.
- Deduplicación diaria.

---

### TICKET ADS-05: Regla — Pieza sin ubicación

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Operativa

**Descripción:**  
Detectar piezas en estado `disponible` que no tienen los campos de ubicación completos (`ubicacion`, `zona` o `estanteria` vacíos). Una pieza sin ubicar es una pieza "perdida" que ralentiza la preparación de pedidos.

**Lógica de detección:**

```
Para cada pieza con estado === 'disponible' y active !== false:
  Si ubicacion está vacía Y zona está vacía Y estanteria está vacía:
    diasDesdeCreacion = now - createdAt

    Si diasDesdeCreacion > partNoLocationGraceDays (1):
      → prioridad MEDIA — "Pieza sin ubicar"
      → Clasificación: OPERATIVA
```

**Tareas:**

1. **Implementar `checkPartNoLocation(ctx, parts, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar piezas disponibles donde `!part.ubicacion && !part.zona && !part.estanteria`.
   - Generar alerta tipo `scrapyard_part_no_location`:
     ```javascript
     {
       category: 'scrapyard_part_no_location',
       source: 'desguaces',
       priority: 'medium',
       level: 'warning',
       title: 'Pieza sin ubicar en almacén',
       message: `${part.nombre} (${part.codigoInterno}) — Sin ubicación asignada desde hace ${days} días. Vehículo origen: ${part.vehiculoOrigenLabel}.`,
       entityId: part._id,
       entityType: 'scrapyard_part',
       route: `/saas/vertical/desguaces/piezas/${part._id}`,
       metadata: {
         partName: part.nombre, partCode: part.codigoInterno,
         category: part.categoria, vehicleOrigin: part.vehiculoOrigenLabel,
         daysSinceCreation: days,
         classification: 'operativa',
       },
     }
     ```

2. **Alerta agrupada — Muchas piezas sin ubicar:**
   - Si más de 10 piezas sin ubicar del mismo `vehiculoOrigenId` → alerta resumen:
     `"16 piezas del despiece de X sin ubicar"`.

**Criterios de aceptación:**
- Se detectan piezas disponibles sin ubicación.
- Se respeta el periodo de gracia configurable.
- Se agrupan por vehículo de origen si hay muchas.
- Deduplicación diaria.

---

### TICKET ADS-06: Regla — Venta sin cobro

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Económica

**Descripción:**  
Detectar ventas de piezas (`scrapyard_sale`) confirmadas o en fases avanzadas con `estadoPago` distinto de `'cobrada'`. Incluye detección de impagos parciales y ventas entregadas sin cobro total.

**Lógica de detección:**

```
Para cada scrapyard_sale con estado ∈ {confirmada, preparando, lista, enviada, entregada}:
  Si estadoPago ∈ {pendiente, parcial}:
    diasDesdeCreacion = now - createdAt

    Si estado === 'entregada' y estadoPago !== 'cobrada':
      → prioridad ALTA — "Pieza entregada sin cobrar"
      → Clasificación: ECONÓMICA

    Si diasDesdeCreacion > saleUnpaidCriticalDays (15):
      → prioridad ALTA — "Venta con cobro pendiente"

    Si diasDesdeCreacion > saleUnpaidDays (3):
      → prioridad MEDIA — "Venta pendiente de cobro"

    Clasificación: ECONÓMICA

  Calcular importePendiente:
    totalCobrado = Σ(pagos[].importe)
    importePendiente = importeConIva - totalCobrado
```

**Tareas:**

1. **Implementar `checkScrapyardSaleUnpaid(ctx, sales, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar ventas con `estadoPago !== 'cobrada'` y `estado` no cancelada.
   - Calcular importe pendiente real a partir de `pagos[]`.
   - Generar alerta tipo `scrapyard_sale_unpaid`:
     ```javascript
     {
       category: 'scrapyard_sale_unpaid',
       source: 'desguaces',
       priority: priorityLevel,
       level: sale.estado === 'entregada' ? 'alert' : 'warning',
       title: sale.estado === 'entregada'
         ? 'Venta entregada sin cobrar'
         : 'Venta con cobro pendiente',
       message: `Venta ${sale.numVenta} — ${sale.clientName}. Pendiente: ${pendingAmount.toFixed(2)} € de ${sale.importeConIva.toFixed(2)} €. Estado: ${sale.estado}.`,
       entityId: sale._id,
       entityType: 'scrapyard_sale',
       route: `/saas/vertical/desguaces/ventas/${sale._id}`,
       metadata: {
         saleNumber: sale.numVenta, clientName: sale.clientName,
         clientType: sale.clientTipo, totalAmount: sale.importeConIva,
         pendingAmount, paymentStatus: sale.estadoPago,
         saleStatus: sale.estado, daysSinceCreation: days,
         responsible: sale.responsable,
         classification: 'economica',
       },
     }
     ```

**Criterios de aceptación:**
- Se detectan ventas con cobro pendiente en cada fase.
- La prioridad es ALTA si la pieza ya fue entregada.
- Se calcula el pendiente real a partir de los pagos registrados.
- Se incluye el responsable para routing.
- Deduplicación diaria.

---

### TICKET ADS-07: Regla — Pedido sin enviar / retrasado

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Operativa

**Descripción:**  
Detectar ventas con `entrega === 'envio'` que llevan demasiado tiempo sin avanzar en el flujo logístico: confirmadas pero sin preparar, preparadas pero sin enviar, o enviadas pero sin confirmar entrega.

**Lógica de detección:**

```
Para cada scrapyard_sale con entrega === 'envio' y estado ∉ {borrador, entregada, cancelada}:
  diasEnEstadoActual = now - última entrada en historial[] con el estado actual
  (si no hay historial, usar createdAt)

  Si estado === 'confirmada' y diasEnEstadoActual > orderPendingShipDays (2):
    → prioridad MEDIA — "Pedido confirmado sin preparar"

  Si estado === 'preparando' y diasEnEstadoActual > orderPendingShipDays (2):
    → prioridad MEDIA — "Pedido en preparación demasiado tiempo"

  Si estado === 'lista' y diasEnEstadoActual > orderPendingShipDays (2):
    → prioridad ALTA — "Pedido listo pero no enviado"

  Si estado === 'enviada' y diasEnEstadoActual > orderPendingShipCriticalDays (7):
    → prioridad ALTA — "Envío sin confirmar entrega"

  Clasificación: OPERATIVA

  Contexto adicional:
    - Si envio.numSeguimiento está vacío en estado 'enviada' → añadir nota
    - Si envio.transportista está vacío → añadir nota
```

**Tareas:**

1. **Implementar `checkOrderPendingShip(ctx, sales, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar ventas de envío no completadas ni canceladas.
   - Calcular días en estado actual desde `historial[]`.
   - Generar alerta tipo `scrapyard_order_pending_ship`:
     ```javascript
     {
       category: 'scrapyard_order_pending_ship',
       source: 'desguaces',
       priority: priorityLevel,
       level: sale.estado === 'lista' ? 'alert' : 'warning',
       title: titleByStatus,
       message: `Venta ${sale.numVenta} — ${sale.clientName}. Estado: ${sale.estado} desde hace ${days} días.${missingTracking ? ' Sin número de seguimiento.' : ''}`,
       entityId: sale._id,
       entityType: 'scrapyard_sale',
       route: `/saas/vertical/desguaces/ventas/${sale._id}`,
       metadata: {
         saleNumber: sale.numVenta, clientName: sale.clientName,
         status: sale.estado, daysInStatus: days,
         hasTracking: !!sale.envio?.numSeguimiento,
         carrier: sale.envio?.transportista || '',
         responsible: sale.responsable,
         classification: 'operativa',
       },
     }
     ```

2. **Helper `getDaysInCurrentStatus(sale)`:**
   - Buscar en `historial[]` la última entrada con el estado actual.
   - Si no hay historial, usar `createdAt` o `updatedAt`.

3. **Títulos por estado:**
   ```javascript
   const SHIP_ALERT_TITLES = {
     confirmada: 'Pedido confirmado sin preparar',
     preparando: 'Pedido en preparación demasiado tiempo',
     lista: 'Pedido listo pero no enviado',
     enviada: 'Envío sin confirmar entrega',
   };
   ```

**Criterios de aceptación:**
- Se detectan pedidos de envío estancados en cada fase del flujo logístico.
- Se escala prioridad según el estado (listo sin enviar → ALTA).
- Se detecta ausencia de número de seguimiento.
- Se incluye el responsable para routing.
- Deduplicación diaria.

---

### TICKET ADS-08: Regla — Stock parado (pieza sin vender demasiado tiempo)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Comercial

**Descripción:**  
Detectar piezas en estado `disponible` que llevan demasiado tiempo sin venderse. Una pieza parada ocupa espacio, se deprecia y representa capital inmovilizado. Se evalúa en 3 niveles de severidad (30/60/90 días) con contexto de precio y categoría.

**Lógica de detección:**

```
Para cada pieza con estado === 'disponible' y active !== false:
  diasEnStock = now - createdAt

  Si diasEnStock >= staleStockCriticalDays (90):
    → prioridad ALTA
    → Sugerencia: "Considerar rebaja o desecho"

  Si diasEnStock >= staleStockHighDays (60):
    → prioridad MEDIA

  Si diasEnStock >= staleStockWarningDays (30):
    → prioridad BAJA

  Enriquecer con:
    - precioVenta actual
    - Categoría de la pieza
    - Número de compatibilidades (más compatibilidades = más probable que se venda)
    - Si no tiene compatibilidades → escalar prioridad un nivel

  Clasificación: COMERCIAL
```

**Tareas:**

1. **Implementar `checkStalePartStock(ctx, parts, config)` en `scrapyardAlertEngine.js`:**
   - Iterar piezas disponibles.
   - Calcular días en stock.
   - Generar alerta tipo `scrapyard_stale_stock`:
     ```javascript
     {
       category: 'scrapyard_stale_stock',
       source: 'desguaces',
       priority: priorityLevel,
       level: days >= criticalDays ? 'alert' : 'warning',
       title: `Pieza parada — ${days} días en stock`,
       message: `${part.nombre} (${part.codigoInterno}) lleva ${days} días sin venderse. PV: ${part.precioVenta?.toFixed(0) || '—'} €. Categoría: ${part.categoria}.${noCompat ? ' Sin compatibilidades registradas.' : ''}`,
       entityId: part._id,
       entityType: 'scrapyard_part',
       route: `/saas/vertical/desguaces/piezas/${part._id}`,
       metadata: {
         partName: part.nombre, partCode: part.codigoInterno,
         category: part.categoria, daysInStock: days,
         price: part.precioVenta, compatCount: part.compatibilidades?.length || 0,
         vehicleOrigin: part.vehiculoOrigenLabel,
         classification: 'comercial',
       },
     }
     ```

2. **Alerta resumen a nivel de negocio (gerente):**
   - Si el total de piezas paradas (+30 días) supera el 40% del stock disponible → alerta de negocio prioridad ALTA:
     `"El 47% del stock de piezas lleva más de 30 días sin venderse (182 de 387 piezas)"`.

**Criterios de aceptación:**
- 3 niveles de severidad: 30, 60 y 90 días.
- Cada alerta incluye precio, categoría y compatibilidades.
- Si no tiene compatibilidades, se escala la prioridad.
- Alerta resumen si el % de stock parado es alto.
- Deduplicación diaria.

---

### TICKET ADS-09: Regla — Vehículo sin documentación obligatoria

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar vehículos de desguace que no tienen la documentación obligatoria completa. En un CAT, la documentación del vehículo es crítica para la trazabilidad legal y medioambiental.

**Lógica de detección:**

```
Para cada vehículo de desguace (procedencia no vacía) con status ∉ {scrapped}:
  1. Obtener documentos del vehículo (vehicle.documents[] + documentos externos vinculados)
  2. Comprobar contra la lista de docs obligatorios (vehicleRequiredDocs):
     - baja_temporal o baja_definitiva (al menos uno)
     - factura_compra (o contrato_compra)
     - permiso_circulacion
     - ficha_tecnica

  3. Calcular documentos faltantes

  4. Si hay faltantes y el vehículo lleva > vehicleMissingDocsGraceDays desde su entrada:
     - Si faltan >= 3 docs → prioridad ALTA
     - Si faltan 1-2 docs → prioridad MEDIA
     - Clasificación: DOCUMENTAL
```

**Tareas:**

1. **Implementar `checkVehicleMissingDocs(ctx, vehicles, documents, config)` en `scrapyardAlertEngine.js`:**
   - Para cada vehículo, filtrar documentos embebidos + externos.
   - Comparar contra `config.scrapyard.vehicleRequiredDocs`.
   - Generar alerta tipo `scrapyard_vehicle_missing_docs`:
     ```javascript
     {
       category: 'scrapyard_vehicle_missing_docs',
       source: 'desguaces',
       priority: missingCount >= 3 ? 'high' : 'medium',
       level: missingCount >= 3 ? 'alert' : 'warning',
       title: 'Vehículo sin documentación completa',
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) — Faltan ${missingCount} documento(s): ${missingList.join(', ')}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vertical/desguaces/vehiculos/${vehicle._id}?tab=documents`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate, missingDocs: missingList,
         totalRequired: requiredDocs.length, daysSinceEntry: days,
         classification: 'documental',
       },
     }
     ```

2. **Mapa de nombres legibles para documentos de desguace:**
   ```javascript
   const DOC_LABELS = {
     baja_temporal: 'Baja temporal',
     baja_definitiva: 'Baja definitiva',
     factura_compra: 'Factura de compra',
     contrato_compra: 'Contrato de compra',
     permiso_circulacion: 'Permiso de circulación',
     ficha_tecnica: 'Ficha técnica',
     certificado_destruccion: 'Certificado de destrucción',
   };
   ```

3. **Lógica especial para baja:**
   - El requisito de baja se cumple si tiene `baja_temporal` **o** `baja_definitiva` **o** `certificado_destruccion`.
   - No exigir los tres: basta con uno de ellos.

**Criterios de aceptación:**
- Se detectan vehículos de desguace sin documentación obligatoria.
- Se respeta el periodo de gracia.
- La baja se evalúa como "uno de tres" (temporal / definitiva / certificado).
- La prioridad escala según documentos faltantes.
- Deduplicación diaria.

---

### TICKET ADS-10: Regla — Compra sin justificar

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar gastos de adquisición de vehículos (costes asociados y movimientos financieros vinculados) que no tienen factura o documentación soporte. Un gasto sin justificante no es deducible fiscalmente y rompe la trazabilidad.

**Lógica de detección:**

```
Para cada vehículo de desguace:
  Para cada cost en associatedCosts[]:
    Si cost.invoiceId está vacío o null:
      Y cost.date tiene más de unjustifiedPurchaseGraceDays días:
        → Acumular como gasto sin justificar

  Para cada movimiento financiero con linkedEntityType === 'vehicle'
  y linkedEntityId === vehicle._id:
    Si no tiene linkedInvoiceId ni attachmentUrl:
      → Acumular como gasto sin justificar

  Si hay gastos sin justificar:
    totalSinJustificar = Σ(importes)

    Si totalSinJustificar > 1000 → prioridad ALTA
    Si totalSinJustificar > 0 → prioridad MEDIA
    Clasificación: DOCUMENTAL
```

**Tareas:**

1. **Implementar `checkUnjustifiedPurchase(ctx, vehicles, financeDocs, config)` en `scrapyardAlertEngine.js`:**
   - Iterar vehículos de desguace con `associatedCosts[]`.
   - Filtrar costes sin `invoiceId` ni `attachmentUrl` pasado el periodo de gracia.
   - Verificar movimientos financieros vinculados al vehículo sin soporte documental.
   - Agrupar por vehículo (una alerta por vehículo).
   - Generar alerta tipo `scrapyard_unjustified_purchase`:
     ```javascript
     {
       category: 'scrapyard_unjustified_purchase',
       source: 'desguaces',
       priority: totalWithout > 1000 ? 'high' : 'medium',
       level: 'warning',
       title: 'Compra sin justificar',
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) tiene ${count} gasto(s) sin justificante por ${totalWithout.toFixed(2)} €: ${conceptList}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vertical/desguaces/vehiculos/${vehicle._id}?tab=costs`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate,
         unjustifiedCount: count, totalAmount: totalWithout,
         concepts: conceptList,
         classification: 'documental',
       },
     }
     ```

**Criterios de aceptación:**
- Se detectan costes asociados sin factura/justificante por vehículo.
- Se verifican también movimientos financieros vinculados al vehículo.
- Se respeta el periodo de gracia.
- La prioridad escala según el importe acumulado.
- Deduplicación diaria.

---

### TICKET ADS-11: Regla — Productividad anómala

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Operativa

**Descripción:**  
Detectar anomalías de productividad en el desguace: sesiones de despiece estancadas, vehículos sin iniciar despiece tras muchos días, y ritmo de extracción de piezas excesivamente bajo.

**Lógica de detección:**

```
1. Despiece estancado:
   Para cada dismantling_session con status === 'in_progress':
     diasSinActividad = now - max(updatedAt, última entrada en historial[])

     Si diasSinActividad > dismantlingStaleDays (5):
       progreso = piezasPrevistas.filter(p => p.extraida).length / piezasPrevistas.length * 100

       Si progreso < dismantlingStaleExtractionPct (25%):
         → prioridad ALTA — "Despiece estancado con baja extracción"
       Si no:
         → prioridad MEDIA — "Despiece estancado"
       Clasificación: OPERATIVA

2. Vehículo sin iniciar despiece:
   Para cada vehículo de desguace con status ∈ {available, workshop}:
     Si dismantlingStartedAt es null Y el vehículo lleva > 10 días desde entrada:
       → prioridad BAJA — "Vehículo pendiente de despiece"
       → Si lleva > 20 días → prioridad MEDIA
       Clasificación: OPERATIVA

3. Ritmo bajo de extracción (nivel negocio):
   totalExtraidasSemana = piezas creadas en últimos 7 días
   totalEsperadas = Σ(sessions activas).totalPartsExpected

   Si totalExtraidasSemana < totalEsperadas * 0.1 y hay sesiones activas:
     → prioridad MEDIA — "Ritmo de extracción bajo"
     Clasificación: OPERATIVA
```

**Tareas:**

1. **Implementar `checkStaleDismantling(ctx, sessions, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar sesiones `in_progress` con días de inactividad.
   - Calcular porcentaje de progreso real.
   - Generar alerta tipo `scrapyard_dismantling_stale`:
     ```javascript
     {
       category: 'scrapyard_dismantling_stale',
       source: 'desguaces',
       priority: progress < threshold ? 'high' : 'medium',
       level: progress < threshold ? 'alert' : 'warning',
       title: `Despiece estancado — ${vehicle.registrationPlate}`,
       message: `Despiece de ${session.vehicleLabel} (${session.vehicleMatricula}) lleva ${inactiveDays} días sin actividad. Progreso: ${progress.toFixed(0)}% (${extracted}/${total} piezas).`,
       entityId: session._id,
       entityType: 'dismantling_session',
       route: `/saas/vertical/desguaces/despiece/${session._id}`,
       metadata: {
         vehicleLabel: session.vehicleLabel, plate: session.vehicleMatricula,
         progress, extracted, total: session.piezasPrevistas?.length || 0,
         inactiveDays, workers: session.trabajadores,
         classification: 'operativa',
       },
     }
     ```

2. **Implementar `checkVehiclePendingDismantling(ctx, vehicles, sessions, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar vehículos sin `dismantlingStartedAt` con muchos días desde entrada.
   - Cruzar con sesiones para verificar que no existe sesión en curso.
   - Generar alerta tipo `scrapyard_pending_dismantling`.

3. **Implementar `checkLowExtractionRate(ctx, parts, sessions, config)` (nivel negocio):**
   - Contar piezas creadas en últimos 7 días vs esperadas.
   - Generar alerta tipo `scrapyard_low_extraction_rate` si el ratio es bajo.

**Criterios de aceptación:**
- Se detectan despieces sin actividad reciente.
- Se detectan vehículos que no han iniciado despiece.
- Se evalúa el ritmo de extracción a nivel global.
- La prioridad escala según progreso e inactividad.
- Se incluyen los trabajadores asignados para routing.
- Deduplicación diaria.

---

### TICKET ADS-12: Regla — Margen bajo en ventas

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02  
**Clasificación de prioridad:** Económica

**Descripción:**  
Detectar ventas de piezas con margen insuficiente o negativo, y monitorizar el margen medio del negocio. En desguace, el margen de cada pieza debe cubrir la parte proporcional del coste de adquisición del vehículo.

**Lógica de detección:**

```
1. Venta individual con margen bajo:
   Para cada scrapyard_sale con estado ∈ {confirmada, preparando, lista, enviada, entregada}:
     Si sale.margen es conocido y sale.importeNeto > 0:
       margenPct = (sale.margen / sale.importeNeto) * 100

       Si margenPct < lowMarginAbsoluteThreshold (5%):
         → prioridad ALTA — "Venta con margen muy bajo"
       Si margenPct < lowMarginThresholdPercent (15%):
         → prioridad MEDIA — "Venta con margen bajo"
       Clasificación: ECONÓMICA

     Si sale.margen < 0:
       → prioridad ALTA — "Venta con pérdida"
       Clasificación: ECONÓMICA

2. Margen medio bajo (nivel negocio):
   ventasMes = ventas del mes actual con estado 'entregada' o 'cobrada'
   margenMedio = Σ(margen) / count

   Si margenMedio < lowMarginThresholdPercent de la media de importes:
     → prioridad MEDIA — "Margen medio del mes bajo"
     Clasificación: ECONÓMICA
```

**Tareas:**

1. **Implementar `checkLowMarginSales(ctx, sales, config)` en `scrapyardAlertEngine.js`:**
   - Filtrar ventas activas con margen conocido.
   - Calcular porcentaje de margen.
   - Generar alerta tipo `scrapyard_low_margin`:
     ```javascript
     {
       category: 'scrapyard_low_margin',
       source: 'desguaces',
       priority: isLoss ? 'high' : (marginPct < absThreshold ? 'high' : 'medium'),
       level: isLoss ? 'alert' : 'warning',
       title: isLoss ? 'Venta con pérdida' : 'Venta con margen bajo',
       message: `Venta ${sale.numVenta} — ${sale.clientName}. Importe: ${sale.importeNeto.toFixed(2)} €, margen: ${sale.margen.toFixed(2)} € (${marginPct.toFixed(1)}%).`,
       entityId: sale._id,
       entityType: 'scrapyard_sale',
       route: `/saas/vertical/desguaces/ventas/${sale._id}`,
       metadata: {
         saleNumber: sale.numVenta, clientName: sale.clientName,
         totalAmount: sale.importeNeto, margin: sale.margen,
         marginPercent: marginPct, responsible: sale.responsable,
         classification: 'economica',
       },
     }
     ```

2. **Implementar `checkAvgMarginLow(ctx, sales, config)` (nivel negocio):**
   - Calcular margen medio del mes de ventas completadas.
   - Generar alerta tipo `scrapyard_avg_margin_low` al gerente.

**Criterios de aceptación:**
- Se detectan ventas con margen bajo o negativo.
- Se calcula el margen medio mensual a nivel de negocio.
- La prioridad escala según severidad del margen.
- Deduplicación diaria.

---

### TICKET ADS-13: Sistema de priorización, clasificación y reservas expiradas

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ADS-02

**Descripción:**  
Implementar un sistema unificado de clasificación de alertas con tres ejes: **prioridad** (alta/media/baja), **nivel** (alert/warning/info) y **clasificación** (operativa/económica/documental/comercial). Incluye la detección de reservas de piezas expiradas y el escalado automático.

**Tareas:**

1. **Definir constantes en `scrapyardAlertEngine.js`:**

   ```javascript
   const CLASSIFICATION = {
     OPERATIONAL: 'operativa',
     ECONOMIC: 'economica',
     DOCUMENTARY: 'documental',
     COMMERCIAL: 'comercial',
   };

   const ALERT_CLASSIFICATION = {
     scrapyard_pending_deregistration:  { defaultPriority: 'medium', classification: 'documental',  escalable: true  },
     scrapyard_no_destruction_cert:     { defaultPriority: 'high',   classification: 'documental',  escalable: false },
     scrapyard_part_no_price:           { defaultPriority: 'medium', classification: 'operativa',   escalable: true  },
     scrapyard_part_no_location:        { defaultPriority: 'medium', classification: 'operativa',   escalable: true  },
     scrapyard_sale_unpaid:             { defaultPriority: 'medium', classification: 'economica',   escalable: true  },
     scrapyard_order_pending_ship:      { defaultPriority: 'medium', classification: 'operativa',   escalable: true  },
     scrapyard_stale_stock:             { defaultPriority: 'low',    classification: 'comercial',   escalable: true  },
     scrapyard_vehicle_missing_docs:    { defaultPriority: 'medium', classification: 'documental',  escalable: true  },
     scrapyard_unjustified_purchase:    { defaultPriority: 'medium', classification: 'documental',  escalable: false },
     scrapyard_dismantling_stale:       { defaultPriority: 'medium', classification: 'operativa',   escalable: true  },
     scrapyard_pending_dismantling:     { defaultPriority: 'low',    classification: 'operativa',   escalable: true  },
     scrapyard_low_extraction_rate:     { defaultPriority: 'medium', classification: 'operativa',   escalable: true  },
     scrapyard_low_margin:              { defaultPriority: 'medium', classification: 'economica',   escalable: false },
     scrapyard_avg_margin_low:          { defaultPriority: 'medium', classification: 'economica',   escalable: true  },
     scrapyard_reservation_expired:     { defaultPriority: 'high',   classification: 'comercial',   escalable: false },
     scrapyard_sold_not_delivered:      { defaultPriority: 'high',   classification: 'operativa',   escalable: false },
   };
   ```

2. **Implementar `checkExpiredReservations(ctx, parts, sales, config)` en `scrapyardAlertEngine.js`:**
   - Detectar piezas en estado `reservada` cuya venta vinculada tiene `reservaExpira` pasada, o que llevan más de `reservationExpiredDays` sin avanzar.
   - Generar alerta tipo `scrapyard_reservation_expired`:
     ```javascript
     {
       category: 'scrapyard_reservation_expired',
       source: 'desguaces',
       priority: 'high',
       level: 'alert',
       title: 'Reserva de pieza expirada',
       message: `${part.nombre} (${part.codigoInterno}) reservada para ${sale?.clientName || 'desconocido'} desde hace ${days} días. La reserva expiró el ${formatDate(sale?.reservaExpira)}.`,
       entityId: part._id,
       entityType: 'scrapyard_part',
       route: `/saas/vertical/desguaces/piezas/${part._id}`,
       metadata: {
         partName: part.nombre, partCode: part.codigoInterno,
         clientName: sale?.clientName, saleId: sale?._id,
         reservationDays: days, expiryDate: sale?.reservaExpira,
         classification: 'comercial',
       },
     }
     ```

3. **Implementar `checkSoldNotDelivered(ctx, sales, config)` en `scrapyardAlertEngine.js`:**
   - Detectar ventas con `entrega === 'recogida'` en estado `confirmada`/`preparando`/`lista` que llevan > `orderPendingShipDays` días.
   - Generar alerta tipo `scrapyard_sold_not_delivered`.

4. **Lógica de escalado automático para alertas `escalable: true`:**
   - Si una alerta del mismo `dedupKey` lleva más de **3 días** sin resolverse → subir prioridad un nivel (low→medium, medium→high).
   - Al escalar, añadir `metadata.escalated: true` y `metadata.escalatedAt`.

5. **Incluir `metadata.classification` en todas las alertas (ADS-03 a ADS-12).**

**Criterios de aceptación:**
- Todas las alertas tienen `classification` en su metadata.
- Se detectan reservas de piezas expiradas.
- Se detectan ventas de recogida no recogidas.
- El escalado automático sube prioridad tras 3 días sin resolución.
- La clasificación constante es consistente.

---

### TICKET ADS-14: Routing de alertas por rol y destino

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ADS-13

**Descripción:**  
Implementar la lógica de distribución de alertas a los destinatarios correctos según su rol. El gerente recibe todas las alertas del desguace; el trabajador recibe solo las de sus tareas, turno y pedidos asignados.

**Destinos de cada alerta:**

| Canal de entrega | Descripción | Cuándo |
|------------------|-------------|--------|
| **Notificación in-app** | Documento en `notifications` DB | Siempre (todas las alertas) |
| **SSE** | Evento `scrapyard:alert` | Siempre (tiempo real) |
| **Push web** | Push notification al dispositivo | Solo prioridad alta + usuario con push habilitado |
| **Dashboard** | Incluida en KPIs y centro de alertas | Siempre (leída on-demand) |
| **Centro de alertas core** | Incluida en `GET /api/alerts/:userId` | Siempre (resumen global) |

**Routing por rol:**

| Alerta | Gerente (owner/admin) | Trabajador (operario) | Administración |
|--------|----------------------|----------------------|----------------|
| Vehículo baja pendiente | ✅ todos | ❌ | ✅ |
| Sin certificado destrucción | ✅ | ❌ | ✅ |
| Pieza sin precio | ✅ todas | ✅ piezas de su despiece | ❌ |
| Pieza sin ubicación | ✅ todas | ✅ piezas de su despiece | ❌ |
| Venta sin cobro | ✅ todas | ✅ solo sus ventas | ✅ |
| Pedido sin enviar | ✅ todas | ✅ solo sus pedidos | ❌ |
| Stock parado | ✅ | ❌ | ❌ |
| Vehículo sin docs | ✅ todos | ❌ | ✅ |
| Compra sin justificar | ✅ | ❌ | ✅ |
| Despiece estancado | ✅ todos | ✅ si es su despiece | ❌ |
| Vehículo pendiente despiece | ✅ | ❌ | ❌ |
| Ritmo extracción bajo | ✅ | ❌ | ❌ |
| Margen bajo | ✅ | ❌ | ❌ |
| Margen medio bajo | ✅ | ❌ | ❌ |
| Reserva expirada | ✅ | ✅ si es su venta | ❌ |
| Vendida no entregada | ✅ | ✅ si es su venta | ❌ |

**Tareas:**

1. **Definir `TARGET_ROLES` por tipo de alerta:**

   ```javascript
   const ALERT_TARGET_ROLES = {
     scrapyard_pending_deregistration:  { manager: true, assignedWorker: false, admin: true  },
     scrapyard_no_destruction_cert:     { manager: true, assignedWorker: false, admin: true  },
     scrapyard_part_no_price:           { manager: true, assignedWorker: true,  admin: false },
     scrapyard_part_no_location:        { manager: true, assignedWorker: true,  admin: false },
     scrapyard_sale_unpaid:             { manager: true, assignedWorker: true,  admin: true  },
     scrapyard_order_pending_ship:      { manager: true, assignedWorker: true,  admin: false },
     scrapyard_stale_stock:             { manager: true, assignedWorker: false, admin: false },
     scrapyard_vehicle_missing_docs:    { manager: true, assignedWorker: false, admin: true  },
     scrapyard_unjustified_purchase:    { manager: true, assignedWorker: false, admin: true  },
     scrapyard_dismantling_stale:       { manager: true, assignedWorker: true,  admin: false },
     scrapyard_pending_dismantling:     { manager: true, assignedWorker: false, admin: false },
     scrapyard_low_extraction_rate:     { manager: true, assignedWorker: false, admin: false },
     scrapyard_low_margin:              { manager: true, assignedWorker: false, admin: false },
     scrapyard_avg_margin_low:          { manager: true, assignedWorker: false, admin: false },
     scrapyard_reservation_expired:     { manager: true, assignedWorker: true,  admin: false },
     scrapyard_sold_not_delivered:      { manager: true, assignedWorker: true,  admin: false },
   };
   ```

2. **Implementar `routeScrapyardAlert(alert, business)` en `scrapyardAlertEngine.js`:**
   - Para cada alerta emitida:
     a. Siempre emitir al owner/admin del negocio (gerente recibe todo).
     b. Si `assignedWorker: true` y la alerta tiene `metadata.workers` o `metadata.responsible`:
        - Buscar en `business.members` el userId del miembro que coincida.
        - Emitir alerta individual vía `broadcastToUser()`.
     c. Si `admin: true`:
        - Buscar miembros con rol `Administración`.
        - Emitir alerta.
     d. Emitir `broadcastToBusiness(businessId, 'scrapyard:alert', alert)` para clientes conectados.

3. **Push selectivo:**
   - Solo enviar push web si `priority === 'high'` y el usuario tiene push habilitado.
   - Para alertas de prioridad media/baja: solo in-app + SSE.

4. **Campo `targetRoles` en metadata:**
   - Incluir `targetRoles: ['manager', 'assigned_worker', 'admin']` en cada alerta para que el frontend pueda filtrar por rol del usuario conectado.

**Criterios de aceptación:**
- El gerente recibe TODAS las alertas de desguaces.
- Los trabajadores solo reciben alertas de sus tareas/pedidos/despieces asignados.
- Administración recibe alertas documentales y económicas.
- Push solo se envía en prioridad alta.
- Las alertas se persisten en notificaciones y se incluyen en el resumen de alertas core.
- El SSE funciona con `broadcastToBusiness` para distribuir a todos los conectados.

---

### TICKET ADS-15: Endpoints API y emisión SSE

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-13, ADS-14

**Descripción:**  
Crear los endpoints REST y eventos SSE para que el frontend consuma las alertas de desguaces en el dashboard, el centro de alertas y las pantallas operativas.

**Endpoints API:**

1. **`GET /api/scrapyard/alerts/:userId`** — Alertas activas con filtros
   - Query params: `classification` (operativa|economica|documental|comercial), `priority` (high|medium|low), `status` (active|resolved|acknowledged), `from`, `to`, `limit`, `offset`.
   - Response:
     ```json
     {
       "ok": true,
       "alerts": [],
       "total": 18,
       "summary": {
         "active": 14, "resolved": 4,
         "byPriority": { "high": 5, "medium": 7, "low": 6 },
         "byClassification": { "operativa": 6, "economica": 4, "documental": 5, "comercial": 3 },
         "byType": { "scrapyard_part_no_price": 8, "scrapyard_sale_unpaid": 3, "..." : "..." }
       }
     }
     ```

2. **`GET /api/scrapyard/alerts/:userId/summary`** — Resumen on-demand (calculado en tiempo real)
   - Equivalente a `getScrapyardAlertSummary()`: evalúa todas las reglas y devuelve conteos sin emitir alertas.
   - Response:
     ```json
     {
       "ok": true,
       "updatedAt": "...",
       "totals": { "critical": 5, "warning": 9, "info": 4 },
       "documentation": {
         "vehiclesPendingDeregistration": 3,
         "vehiclesWithMissingDocs": 2,
         "unjustifiedPurchases": 4,
         "missingDestructionCerts": 1
       },
       "operations": {
         "partsWithoutPrice": 12,
         "partsWithoutLocation": 8,
         "ordersPendingShip": 3,
         "staleDismantlings": 2,
         "vehiclesPendingDismantling": 4
       },
       "economic": {
         "salesUnpaid": 5,
         "totalPendingAmount": 3420,
         "lowMarginSales": 2,
         "avgMarginPercent": 22.5
       },
       "commercial": {
         "staleStock": { "over30": 45, "over60": 18, "over90": 7 },
         "expiredReservations": 3
       }
     }
     ```

3. **`PUT /api/scrapyard/alerts/:alertId/acknowledge`** — Reconocer alerta
   - Marca la alerta como reconocida.
   - Emite SSE `scrapyard:alert_acknowledged`.

4. **`PUT /api/scrapyard/alerts/:alertId/dismiss`** — Descartar alerta
   - Descarta la alerta (no se muestra más pero sí en historial).

5. **`GET /api/scrapyard/alerts/:userId/history`** — Historial de alertas (últimos 30 días)

**Eventos SSE:**

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `scrapyard:alert` | Nueva alerta emitida | Alerta completa con metadata y classification |
| `scrapyard:alert_resolved` | Condición resuelta | `{ alertId, alertType, resolvedAt }` |
| `scrapyard:alert_escalated` | Alerta escalada de prioridad | `{ alertId, oldPriority, newPriority }` |
| `scrapyard:alert_acknowledged` | Usuario reconoce alerta | `{ alertId, acknowledgedBy }` |
| `scrapyard:alerts_summary` | Resumen periódico (cada 60 min) | `{ total, byPriority, byClassification }` |

**Tareas:**

1. **Crear `controllers/scrapyardAlertController.js`** con los handlers.
2. **Crear `routers/scrapyardAlertRouter.js`** con las rutas.
3. **Montar en `index.js`:** `app.use('/api/scrapyard/alerts', requireAuth, burstLimiter, scrapyardAlertRouter)`.
4. **Emitir eventos SSE** desde `routeScrapyardAlert()` (ADS-14).

**Criterios de aceptación:**
- Los 5 endpoints funcionan con auth.
- Filtrado por clasificación (operativa/económica/documental/comercial).
- Summary calculado en tiempo real.
- Los 5 eventos SSE se emiten correctamente.
- El endpoint de resumen responde en < 3 segundos.

---

### TICKET ADS-16: Conexiones — Integración con módulos del ecosistema

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** ADS-02, ADS-14, ADS-15

**Descripción:**  
Asegurar que el motor de alertas desguaces está correctamente integrado con todos los módulos de datos que lee y todos los destinos a los que escribe.

**Mapa de conexiones:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       FUENTES DE DATOS (lectura)                              │
│                                                                              │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│  │ Entrada de    │ │   Despiece    │ │ Stock piezas  │ │   Ventas      │   │
│  │ vehículo      │ │               │ │               │ │   piezas      │   │
│  │ VEHICLES_DB   │ │ scrapyard DB  │ │ scrapyard DB  │ │ scrapyard-    │   │
│  │ type: car     │ │ type:         │ │ type:         │ │ sales DB      │   │
│  │ (procedencia, │ │ dismantling_  │ │ scrapyard_    │ │ type:         │   │
│  │  entryDate,   │ │ session       │ │ part          │ │ scrapyard_    │   │
│  │  documents[]) │ │               │ │               │ │ sale          │   │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └───────┬───────┘   │
│          │                 │                  │                  │           │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                     │
│  │ Compras y     │ │Documentación  │ │   Finanzas    │                     │
│  │ retiradas     │ │               │ │               │                     │
│  │ (associated   │ │ documents DB  │ │ finance DB    │                     │
│  │  Costs[],     │ │ type: document│ │ type:         │                     │
│  │  purchasePrice│ │               │ │ cobro/pago    │                     │
│  │  procedencia) │ │               │ │               │                     │
│  └───────────────┘ └───────────────┘ └───────────────┘                     │
│                                                                              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │  SCRAPYARD ALERT        │
                  │      ENGINE             │
                  │  (scrapyardAlert        │
                  │   Engine.js)            │
                  └────────────┬────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────────┐
│                    DESTINOS (escritura)                                        │
│                              │                                                │
│  ┌──────────────┐ ┌─────────┴──┐ ┌──────────────┐ ┌────────────────────┐   │
│  │  Dashboard   │ │  Alertas   │ │  Push Web    │ │ Pantalla           │   │
│  │  desguace    │ │   Core     │ │  (VAPID)     │ │ operativa          │   │
│  │  (KPIs)      │ │ (centro    │ │              │ │ trabajador         │   │
│  │              │ │  alertas)  │ │              │ │ (SSE scrapyard:*)  │   │
│  └──────────────┘ └────────────┘ └──────────────┘ └────────────────────┘   │
│                              │                                                │
│  ┌───────────────────────────┴┐ ┌───────────────────────────────────────┐   │
│  │ Notificaciones in-app      │ │ SSE (broadcastToBusiness /            │   │
│  │ (notifications DB)         │ │      broadcastToUser)                 │   │
│  └────────────────────────────┘ └───────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Tareas:**

1. **Conexión con Entrada de vehículo (`vehicleController.js`):**
   - Al crear vehículo con `procedencia` de desguace → la próxima ejecución del motor evaluará baja pendiente y docs faltantes.
   - Al cambiar `status` de vehículo a `scrapped` → el motor evaluará certificado de destrucción.

2. **Conexión con Despiece (`scrapyardController.js`):**
   - Al completar una sesión de despiece → las alertas de despiece estancado se resuelven.
   - Al extraer piezas → el motor reevalúa piezas sin precio y sin ubicación.

3. **Conexión con Stock piezas:**
   - Al asignar precio/ubicación a una pieza → la alerta correspondiente se resuelve en el siguiente ciclo.
   - Al marcar pieza como `vendida` o `defectuosa` → deja de evaluarse para stock parado.

4. **Conexión con Ventas (`scrapyardSalesController.js`):**
   - Al registrar un pago → alerta de impago se reevalúa.
   - Al cambiar estado de venta → alertas de pedido se reevalúan.
   - Al cancelar venta → piezas reservadas se liberan y alertas de reserva se resuelven.

5. **Conexión con Compras y retiradas:**
   - Al vincular factura a un coste → alerta de compra sin justificar se resuelve.
   - Al registrar nuevos costes → se evalúan en el siguiente ciclo.

6. **Conexión con Documentación (`documentsController.js`):**
   - Al subir documento vinculado a vehículo → alerta de doc faltante se resuelve.
   - Al subir baja/certificado → alerta de baja pendiente se resuelve.

7. **Conexión con Finanzas (`financeController.js`):**
   - Al registrar cobro vinculado a venta de piezas → alerta de impago se resuelve.
   - Gastos sin factura vinculados a vehículos.

8. **Conexión con Alertas Core (`alertController.js`):**
   - Incluir alertas desguaces en `getAlertSummary()`:
     ```javascript
     scrapyard: {
       active: activeAlerts.length,
       byPriority: { high: X, medium: Y, low: Z },
       byClassification: { operativa: A, economica: B, documental: C, comercial: D },
       mostCritical: topAlert || null,
     }
     ```

9. **Conexión con Dashboard (`/api/dashboard/kpis/:userId`):**
   - Incluir campo `scrapyardAlerts` en la respuesta de KPIs:
     ```javascript
     scrapyardAlerts: {
       total: 18,
       critical: 5,
       warning: 9,
       byClassification: { operativa: 6, economica: 4, documental: 5, comercial: 3 },
     }
     ```
   - Incluir en `dashAlerts`:
     ```javascript
     { id: 'scrap_pending_baja', severity: 'error', type: 'scrapyard_pending_deregistration',
       message: '3 vehículos sin baja tramitada', count: 3,
       route: '/saas/vertical/desguaces/vehiculos' }
     { id: 'scrap_parts_no_price', severity: 'warning', type: 'scrapyard_part_no_price',
       message: '12 piezas sin precio de venta', count: 12,
       route: '/saas/vertical/desguaces/piezas' }
     { id: 'scrap_unpaid', severity: 'error', type: 'scrapyard_sale_unpaid',
       message: '5 ventas con cobro pendiente (3.420 €)', count: 5,
       route: '/saas/vertical/desguaces/ventas' }
     ```

**Criterios de aceptación:**
- Las alertas de desguaces se incluyen en el resumen de alertas core.
- El dashboard de KPIs incluye conteo y desglose de alertas desguaces.
- Las `dashAlerts` específicas aparecen para negocios `scrapyard`.
- Los módulos que modifican datos resuelven alertas implícitamente en el siguiente ciclo.
- El diagrama de conexiones se cumple íntegramente.

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (Semana 1)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-01 | Configuración de alertas desguaces | Backend | Crítica |
| ADS-02 | Motor de alertas — Archivo principal e integración | Backend | Crítica |
| ADS-13 | Sistema de priorización, clasificación y reservas | Backend | Crítica |

### Fase 2 — Reglas de detección documentales (Semana 2)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-03 | Vehículo con baja pendiente | Backend | Alta |
| ADS-09 | Vehículo sin documentación obligatoria | Backend | Alta |
| ADS-10 | Compra sin justificar | Backend | Alta |

### Fase 3 — Reglas de detección operativas (Semana 3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-04 | Pieza sin precio | Backend | Alta |
| ADS-05 | Pieza sin ubicación | Backend | Alta |
| ADS-07 | Pedido sin enviar / retrasado | Backend | Alta |
| ADS-11 | Productividad anómala | Backend | Alta |

### Fase 4 — Reglas económicas y comerciales (Semana 4)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-06 | Venta sin cobro | Backend | Alta |
| ADS-08 | Stock parado | Backend | Alta |
| ADS-12 | Margen bajo en ventas | Backend | Alta |

### Fase 5 — Distribución y API (Semana 5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-14 | Routing de alertas por rol y destino | Backend | Crítica |
| ADS-15 | Endpoints API y emisión SSE | Backend | Alta |

### Fase 6 — Integración (Semana 6)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ADS-16 | Conexiones con módulos del ecosistema | Backend | Alta |

---

## MAPA DE ALERTAS — Referencia rápida

| # | Alerta | Categoría | Condición | Prioridad default | Clasificación | Destinatarios |
|---|--------|-----------|-----------|-------------------|---------------|---------------|
| 1 | Baja pendiente | `scrapyard_pending_deregistration` | Vehículo sin baja > X días | media (escalable) | Documental | Gerente + Admin |
| 2 | Sin certificado destrucción | `scrapyard_no_destruction_cert` | Vehículo `scrapped` sin certificado | alta | Documental | Gerente + Admin |
| 3 | Pieza sin precio | `scrapyard_part_no_price` | Pieza disponible con precioVenta vacío/0 | media (escalable) | Operativa | Gerente + Trabajador asignado |
| 4 | Pieza sin ubicación | `scrapyard_part_no_location` | Pieza disponible sin ubicacion/zona/estanteria | media (escalable) | Operativa | Gerente + Trabajador asignado |
| 5 | Venta sin cobro | `scrapyard_sale_unpaid` | Venta confirmada+ con estadoPago pendiente/parcial | media (escalable) | Económica | Gerente + Trabajador + Admin |
| 6 | Pedido retrasado | `scrapyard_order_pending_ship` | Venta de envío estancada en flujo logístico | media (escalable) | Operativa | Gerente + Trabajador asignado |
| 7 | Stock parado | `scrapyard_stale_stock` | Pieza disponible > 30/60/90 días | baja (escalable) | Comercial | Gerente |
| 8 | Vehículo sin docs | `scrapyard_vehicle_missing_docs` | Docs obligatorios faltantes > gracia | media (escalable) | Documental | Gerente + Admin |
| 9 | Compra sin justificar | `scrapyard_unjustified_purchase` | Gasto sin factura/justificante > gracia | media | Documental | Gerente + Admin |
| 10 | Despiece estancado | `scrapyard_dismantling_stale` | Sesión in_progress sin actividad > X días | media (escalable) | Operativa | Gerente + Trabajador asignado |
| 11 | Vehículo pendiente despiece | `scrapyard_pending_dismantling` | Vehículo sin dismantlingStartedAt > X días | baja (escalable) | Operativa | Gerente |
| 12 | Ritmo extracción bajo | `scrapyard_low_extraction_rate` | Piezas extraídas/semana < 10% de esperadas | media (escalable) | Operativa | Gerente |
| 13 | Margen bajo | `scrapyard_low_margin` | Venta con margen < umbral % | media | Económica | Gerente |
| 14 | Margen medio bajo | `scrapyard_avg_margin_low` | Margen medio mensual < umbral | media (escalable) | Económica | Gerente |
| 15 | Reserva expirada | `scrapyard_reservation_expired` | Pieza reservada + reserva vencida | alta | Comercial | Gerente + Trabajador |
| 16 | Vendida no entregada | `scrapyard_sold_not_delivered` | Venta recogida no recogida > X días | alta | Operativa | Gerente + Trabajador |

---

## CLASIFICACIÓN POR NATURALEZA

### Prioridad Documental
Alertas relacionadas con documentación faltante, bajas no tramitadas o gastos sin justificar. Impacto legal, fiscal y medioambiental.

| Alerta | Impacto |
|--------|---------|
| Baja pendiente | Responsabilidad legal del titular anterior; infracción DGT |
| Sin certificado destrucción | Vehículo dado de baja sin trazabilidad medioambiental |
| Vehículo sin docs | No se puede demostrar la procedencia legal del vehículo |
| Compra sin justificar | Gasto no deducible fiscalmente |

### Prioridad Económica
Alertas relacionadas con impagos y márgenes. Impacto directo en la rentabilidad.

| Alerta | Impacto |
|--------|---------|
| Venta sin cobro | Pérdida económica directa (pieza entregada sin cobrar) |
| Margen bajo | Venta con rentabilidad insuficiente |
| Margen medio bajo | Deterioro de la rentabilidad del negocio |

### Prioridad Operativa
Alertas relacionadas con productividad, preparación de pedidos y catalogación. Impacto en eficiencia.

| Alerta | Impacto |
|--------|---------|
| Pieza sin precio | Pieza no vendible, ingresos perdidos |
| Pieza sin ubicación | Pieza "perdida" en almacén, retrasa pedidos |
| Pedido retrasado | Cliente insatisfecho, reputación dañada |
| Despiece estancado | Vehículo ocupando espacio sin generar piezas vendibles |
| Vehículo pendiente despiece | Capital parado sin iniciar proceso de valor |
| Ritmo extracción bajo | Productividad del equipo insuficiente |
| Vendida no entregada | Pieza comprometida sin liberar |

### Prioridad Comercial
Alertas relacionadas con stock inmovilizado y oportunidades bloqueadas.

| Alerta | Impacto |
|--------|---------|
| Stock parado | Capital inmovilizado y depreciación |
| Reserva expirada | Pieza bloqueada sin avance comercial |

---

## CANALES POR TIPO DE ALERTA

| Alerta | Dashboard | Notificación Core | SSE | Push Web | Pantalla operativa |
|--------|-----------|-------------------|-----|----------|-------------------|
| Baja pendiente | ✅ | ✅ | ✅ | ✅ (si > 30d) | ❌ |
| Sin certificado destrucción | ✅ | ✅ | ✅ | ✅ | ❌ |
| Pieza sin precio | ✅ | ✅ | ✅ | ❌ | ✅ |
| Pieza sin ubicación | ✅ | ✅ | ✅ | ❌ | ✅ |
| Venta sin cobro | ✅ | ✅ | ✅ | ✅ (si entregada) | ✅ |
| Pedido retrasado | ✅ | ✅ | ✅ | ✅ (si lista) | ✅ |
| Stock parado | ✅ | ✅ | ✅ | ❌ | ❌ |
| Vehículo sin docs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compra sin justificar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Despiece estancado | ✅ | ✅ | ✅ | ✅ (si baja extr.) | ✅ |
| Vehículo pendiente despiece | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ritmo extracción bajo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Margen bajo | ✅ | ✅ | ✅ | ✅ (si pérdida) | ❌ |
| Margen medio bajo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reserva expirada | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vendida no entregada | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## REFERENCIAS CRUZADAS CON OTROS TICKETS

| Ticket externo | Relación con este módulo |
|---------------|--------------------------|
| **ENTRADA-VEHICULO-TICKETS** | ADS-03 evalúa vehículos que entran al desguace. Los campos `entryDate`, `procedencia`, `documents[]` son las fuentes de ADS-03 y ADS-09. |
| **DESPIECE-CATALOGACION-TICKETS** | ADS-04 y ADS-05 evalúan piezas creadas en el despiece. ADS-11 evalúa el progreso de sesiones de despiece (`dismantling_session`). |
| **COMPRAS-RETIRADAS-DESGUACES** | ADS-10 evalúa los costes de adquisición (`associatedCosts[]`, `purchasePrice`) y su justificación documental. Si se crea la entidad `vehicle_acquisition` (COMPRAS-RETIRADAS, brecha 1), las alertas ADS-10 deberán migrar a esa entidad. |
| **ALERTAS-COMPRAVENTA-BACKEND** | Patrón de referencia: ADS sigue la misma arquitectura de motor + reglas + routing + SSE que ACV. Comparten `emitGlobalAlert()` de `alertEmitter.js`. |
| **ALERTAS-DELIVERY-BACKEND** | Patrón de referencia: el motor delivery usa ciclo rápido (60s); desguaces usa ciclo estándar (60min). Comparten el sistema de escalado y dedup. |
| **ALERTAS-CONSTRUCCION-BACKEND** | Patrón de referencia: ambos módulos crean un motor vertical que se integra en el `alertEngine.js` existente. |

---

## NOTAS TÉCNICAS

### Naming conventions
- Archivos: `scrapyardAlertEngine.js`, `scrapyardAlertController.js`, `scrapyardAlertRouter.js`
- Tipos de alerta: prefijo `scrapyard_` (ej: `scrapyard_pending_deregistration`, `scrapyard_part_no_price`)
- Eventos SSE: prefijo `scrapyard:` (ej: `scrapyard:alert`, `scrapyard:alert_resolved`)
- Source en alertConstants: `'desguaces'` (añadir a `ALERT_SOURCES`)
- Categorías en `CATEGORY_TO_SOURCE`: añadir todas las categorías `scrapyard_*` → `'desguaces'`

### Nuevas constantes a registrar en `alertConstants.js`

```javascript
// Añadir a ALERT_SOURCES:
'desguaces',

// Añadir a CATEGORY_TO_SOURCE:
scrapyard_pending_deregistration: 'desguaces',
scrapyard_no_destruction_cert: 'desguaces',
scrapyard_part_no_price: 'desguaces',
scrapyard_part_no_location: 'desguaces',
scrapyard_sale_unpaid: 'desguaces',         // migrar de 'finanzas' → 'desguaces'
scrapyard_order_pending_ship: 'desguaces',  // migrar de 'verticales' → 'desguaces'
scrapyard_stale_stock: 'desguaces',
scrapyard_vehicle_missing_docs: 'desguaces',
scrapyard_unjustified_purchase: 'desguaces',
scrapyard_dismantling_stale: 'desguaces',
scrapyard_pending_dismantling: 'desguaces',
scrapyard_low_extraction_rate: 'desguaces',
scrapyard_low_margin: 'desguaces',
scrapyard_avg_margin_low: 'desguaces',
scrapyard_reservation_expired: 'desguaces', // migrar de 'stock' → 'desguaces'
scrapyard_sold_not_delivered: 'desguaces',  // migrar de 'verticales' → 'desguaces'
```

**Nota sobre migración de sources:** 4 categorías existentes (`scrapyard_order_pending_ship`, `scrapyard_sale_unpaid`, `scrapyard_sold_not_delivered`, `scrapyard_reservation_expired`) están actualmente asignadas a sources genéricos (`verticales`, `finanzas`, `stock`). En ADS-02 se migran al source unificado `desguaces` para consistencia. Las alertas antiguas en `notifications` DB conservan su source original; las nuevas usarán `desguaces`.

### Eficiencia
- El motor se ejecuta dentro del ciclo existente de 60 minutos (no crea un ciclo propio).
- Los datos de vehículos ya se cargan en `runAlertsForBusiness`; solo se añaden piezas, sesiones, ventas de desguace y documentos al `Promise.all`.
- La deduplicación usa la misma ventana de 24h del motor genérico.
- El escalado consulta alertas previas solo para alertas `escalable: true`.

### Compatibilidad
- El motor genérico (`alertEngine.js`) sigue funcionando sin cambios para no-`scrapyard`.
- Para `scrapyard`: las 4 categorías existentes se migran al source `desguaces` y se evalúan con lógica enriquecida.
- Los endpoints de `alertController.js` siguen funcionando y agregan las alertas desguaces en el summary.
- Los tipos de notificación existentes se reutilizan añadiendo `classification` como campo nuevo en metadata.

### Base de datos
- No se crean nuevas bases de datos: se leen las existentes (vehicles, scrapyard, scrapyard-sales, documents, finance).
- Las alertas se persisten como notificaciones en `notifications` DB (infraestructura existente).
- Los documentos de alerta incluyen `metadata.classification` como campo nuevo.

---

## ESTIMACIÓN DE ESFUERZO

| Ticket | Nombre | Complejidad | Estimación |
|--------|--------|-------------|------------|
| ADS-01 | Configuración de alertas | Media | 2-3h |
| ADS-02 | Motor de alertas — Integración | Alta | 4-5h |
| ADS-03 | Vehículo con baja pendiente | Alta | 3-4h |
| ADS-04 | Pieza sin precio | Media | 2-3h |
| ADS-05 | Pieza sin ubicación | Media | 2-3h |
| ADS-06 | Venta sin cobro | Media-Alta | 3-4h |
| ADS-07 | Pedido sin enviar / retrasado | Media-Alta | 3-4h |
| ADS-08 | Stock parado | Media | 3-4h |
| ADS-09 | Vehículo sin documentación | Alta | 3-4h |
| ADS-10 | Compra sin justificar | Media | 2-3h |
| ADS-11 | Productividad anómala | Alta | 4-5h |
| ADS-12 | Margen bajo en ventas | Media | 2-3h |
| ADS-13 | Priorización, clasificación y reservas | Media | 3-4h |
| ADS-14 | Routing por rol y destino | Alta | 4-5h |
| ADS-15 | Endpoints API y SSE | Alta | 4-5h |
| ADS-16 | Conexiones ecosistema | Alta | 4-5h |
| **TOTAL** | | | **~48-64h (~6-7 semanas)** |
