# ALERTAS BACKEND COMPRAVENTA — Diseño de Tickets

**Módulo:** Backend — Motor de Alertas Compraventa  
**Tipo:** Backend puro (sin frontend)  
**Vertical:** `carDealership` (Compraventa de vehículos)  
**Objetivo:** Generar alertas automáticas específicas de la vertical compraventa que detecten problemas documentales, comerciales, económicos y operativos, los prioricen y los distribuyan al dashboard, al centro de alertas core, a los responsables por rol y a las pantallas operativas correspondientes.

---

## Estado actual del sistema

### Ya implementado

**Motor de alertas genérico (`alertEngine.js`):**
- Ciclo periódico cada **60 min** (`ALERT_INTERVAL_MS = 3_600_000`).
- Reglas activas relacionadas con compraventa: `vehicle_stock_aging` (vehículos demasiados días en stock), `low_sales_velocity` (velocidad de ventas baja vs media 3 meses).
- Deduplicación por ID diario (`alert:{category}:{dedupKey}:{fecha}`).
- Emisión: guarda notificación en CouchDB (`notifications` DB), broadcast SSE (`broadcastToUser`), push web (`sendPushToUser`).

**Datos de vehículo (`buildVehicleDocument` en `couchdb.js`):**
- Campos: `status` (`available`, `reserved`, `sold`, `workshop`, `scrapped`), `purchasePrice`, `salePrice`, `associatedCosts[]`, `purchaseDate`, `soldAt`, `daysInStock`, `registrationPlate`, `vin`, `brand`, `model`, `year`, `fuel`, `mileage`, `supplierName`, `origin`.
- Base CouchDB: `VEHICLES_DB`, documentos `type: 'car'`.

**Datos de venta (`buildSaleDocument` en `couchdb.js`):**
- Campos: `stage` (`interested` → `reserved` → `documentation` → `sold` → `delivered`), `totalPrice`, `purchasePrice`, `depositPaid`, `financingAmount`, `financingBank`, `paymentMethod`, `expectedDelivery`, `deliveredAt`, `responsible`, `minimumPrice`, `clientId`, `clientName`, `vehicleId`, `vehiclePlate`.
- Arrays: `stageHistory[]`, `paymentHistory[]`, `generatedDocuments[]`, `priceHistory[]`, `deliveryChecklist[]`, `internalNotes[]`.
- Base CouchDB: `getSalesDbName()`, documentos `type: 'sale'`.

**Datos de leads/CRM:**
- `leadsController.js`, `crmController.js`, `leadAssignmentController.js`, `leadScoring.js`.
- Campos clave: `status`, `source`, `responsible`, `budget`, `lastContactAt`, `nextFollowUpDate`.

**Datos de documentación:**
- `documentsController.js` con `type: 'document'`, filtros por `vehicleId`, `saleId`, `clientId`.
- Categorías específicas compraventa definidas en ticket DOC-01: `permiso_circulacion`, `ficha_tecnica`, `contrato_compra`, `contrato_venta`, `factura_compra`, `factura_venta`, `itv`, etc.

**Datos de finanzas:**
- `financeController.js` con movimientos `type: 'cobro'` y `type: 'pago'`.
- Campos: `totalAmount`, `date`, `status`, `dueDate`, `category`, `linkedEntityId`, `linkedEntityType`.

**Datos de gastos de preparación:**
- `associatedCosts[]` dentro de cada vehículo (compuesto por items con `concept`, `amount`, `date`, `invoiceId?`).
- No hay base de datos separada para gastos de preparación; están embebidos en el documento del vehículo.

**Infraestructura disponible:**
- **SSE:** `sseService.js` con `broadcastToUser(userId, event, data)` y `broadcastToBusiness(businessId, event, data, excludeUserId)`.
- **Push web:** `pushService.js` con `sendPushToUser(req, userId, payload)`.
- **Notificaciones:** `notificationController.js` CRUD + broadcast al crear.
- **Configuración alertas:** `account.alertConfig` con toggles y umbrales por usuario, gestionado en `alertController.js`.
- **Roles:** `Admin`, `Gerente`, `Comercial`, `Administración`, `Taller`, `Usuario` en `roleCatalog.ts`; permisos por área (`vehicles`, `clients`, `sales`, `documents`, `finance`, `team`).

### Brechas detectadas

| # | Brecha | Impacto |
|---|--------|---------|
| 1 | **No hay alerta de vehículo sin documentación obligatoria** — El vehículo se puede publicar sin permiso de circulación, ficha técnica ni ITV vigente | Riesgo legal y documental; venta sin documentación completa |
| 2 | **No hay alerta de reserva sin contrato** — Una reserva puede permanecer indefinidamente sin contrato firmado | Riesgo jurídico: señales cobradas sin cobertura contractual |
| 3 | **No hay alerta de venta sin cobro completo** — Se puede cerrar venta (stage `sold`) sin que el cobro esté completo | Pérdida económica: vehículo entregado sin cobro total |
| 4 | **Solo existe `vehicle_stock_aging` para vehículos parados** — No se diferencia por antigüedad (30/60/90 días) ni se relaciona con precio/margen | El gerente no detecta inmovilizaciones a tiempo para actuar |
| 5 | **No hay alerta de gasto de preparación sin factura** — Los gastos se registran en `associatedCosts[]` pero no se verifica si tienen factura vinculada | Riesgo fiscal: gastos no deducibles sin soporte documental |
| 6 | **No hay alerta de precio de venta por debajo del mínimo** — `minimumPrice` existe pero el motor de alertas no lo evalúa | Ventas con pérdida sin visibilidad automática |
| 7 | **No hay alerta de oportunidad/lead sin seguimiento** — No se monitoriza `nextFollowUpDate` ni `lastContactAt` en CRM | Leads abandonados = ventas perdidas |
| 8 | **No hay alerta de entrega pendiente** — Ventas cerradas (`sold`) sin entrega tras X días sin control | Vehículos vendidos inmovilizados sin gestión |
| 9 | **No hay routing por rol** — Todas las alertas van al `userId` del owner; los comerciales no reciben alertas de sus operaciones | Sin distribución operativa por perfil |
| 10 | **No hay clasificación de prioridad por naturaleza** — Las alertas no distinguen entre prioridad comercial, económica o documental | No se puede filtrar ni actuar por urgencia de tipo |
| 11 | **Las alertas no se integran con el dashboard de compraventa** — No hay sección de alertas en KPIs del concesionario | El gerente no ve un resumen visual de alertas del negocio |
| 12 | **No hay conexión bidireccional Sales ↔ Vehicle ↔ CRM** — Cerrar una venta no actualiza automáticamente el estado del vehículo ni del lead | Datos desincronizados entre módulos |
| 13 | **Reserva vencida no genera alerta** — Una reserva con señal cobrada puede permanecer indefinida sin notificación | Capital inmovilizado sin gestión activa |
| 14 | **ITV caducada o próxima del vehículo en stock no genera alerta** — Solo se alerta ITV de flota (`fleet_vehicle`), no de stock de compraventa | Vehículo en stock con ITV caducada = no se puede vender legalmente |

---

## Arquitectura propuesta

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   COMPRAVENTA ALERT ENGINE                               │
│                 services/compraventaAlertEngine.js                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Vehículo sin │ │ Reserva sin  │ │ Venta sin    │ │ Vehículo     │  │
│  │ documentación│ │ contrato     │ │ cobro total  │ │ inmovilizado │  │
│  │ (documental) │ │ (documental) │ │ (económica)  │ │ (comercial)  │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │
│         │                │                │                 │           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Gasto sin    │ │ Precio bajo  │ │ Lead sin     │ │ Entrega      │  │
│  │ factura      │ │ mínimo       │ │ seguimiento  │ │ pendiente    │  │
│  │ (documental) │ │ (económica)  │ │ (comercial)  │ │ (comercial)  │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │
│         │                │                │                 │           │
│         └────────────────┴────────┬───────┴─────────────────┘          │
│                                   ▼                                     │
│                       classifyByPriority()                              │
│                    comercial / económica / documental                   │
│                                   │                                     │
│                ┌──────────────────┼──────────────────┐                 │
│                ▼                  ▼                  ▼                  │
│          ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│          │emitGlobal│      │broadcast │      │broadcast │             │
│          │Alert     │      │ToUser    │      │ToBusiness│             │
│          │(CouchDB) │      │(SSE)     │      │(SSE)     │             │
│          └────┬─────┘      └────┬─────┘      └────┬─────┘             │
│               │                 │                  │                   │
│               ▼                 ▼                  ▼                   │
│       ┌─────────────────────────────────────────────────┐             │
│       │           CANALES DE DISTRIBUCIÓN                │             │
│       ├─────────────┬──────────┬──────────┬─────────────┤             │
│       │  Dashboard  │ Alertas  │ Pantalla │  Push Web   │             │
│       │  concesion. │  Core    │ operativa│  (alta      │             │
│       │  (gerente)  │(sistema) │(comercial)│  prioridad) │             │
│       └─────────────┴──────────┴──────────┴─────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flujo por perfil

```
GERENTE (owner / admin / Gerente):
  Dashboard → alertas globales del negocio compraventa
  │ Documentación faltante en vehículos
  │ Vehículos inmovilizados (+30/60/90 días)
  │ Ventas con cobro pendiente
  │ Reservas sin contrato
  │ Gastos sin factura
  │ Márgenes bajo mínimo
  │ Leads abandonados (CRM global)
  │ Entregas pendientes globales
  │ Resumen económico de alertas

TRABAJADOR / COMERCIAL (Comercial / Usuario):
  Pantalla operativa → alertas de su cartera
  │ Leads asignados sin seguimiento
  │ Reservas asignadas sin contrato
  │ Ventas asignadas con cobro pendiente
  │ Entregas pendientes de sus operaciones
  │ Documentación faltante de sus vehículos asignados
```

---

## TICKETS

---

### TICKET ACV-01: Modelo de datos — Configuración de alertas compraventa

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

**Descripción:**  
Extender el sistema de configuración de alertas para incluir todos los umbrales y toggles específicos de la vertical compraventa. Esta configuración se almacena en `account.alertConfig` (existente) añadiendo un bloque `compraventa`.

**Tareas:**

1. **Ampliar `getAlertConfig()` en `alertEngine.js` con bloque `compraventa`:**

   ```javascript
   compraventa: {
     // ── Activación global ──
     enabled: cfg.compraventa?.enabled !== false,

     // ── Vehículo sin documentación obligatoria ──
     missingDocsEnabled: cfg.compraventa?.missingDocsEnabled !== false,
     requiredDocs: cfg.compraventa?.requiredDocs || [
       'permiso_circulacion', 'ficha_tecnica', 'itv', 'contrato_compra', 'factura_compra'
     ],
     missingDocsGraceDays: Number(cfg.compraventa?.missingDocsGraceDays || 3),

     // ── Reserva sin contrato ──
     reservationNoContractEnabled: cfg.compraventa?.reservationNoContractEnabled !== false,
     reservationNoContractDays: Number(cfg.compraventa?.reservationNoContractDays || 3),

     // ── Venta sin cobro completo ──
     saleUnpaidEnabled: cfg.compraventa?.saleUnpaidEnabled !== false,
     saleUnpaidDays: Number(cfg.compraventa?.saleUnpaidDays || 7),
     saleUnpaidCriticalDays: Number(cfg.compraventa?.saleUnpaidCriticalDays || 30),

     // ── Vehículo inmovilizado (parado demasiados días) ──
     vehicleStagnantEnabled: cfg.compraventa?.vehicleStagnantEnabled !== false,
     vehicleStagnantWarningDays: Number(cfg.compraventa?.vehicleStagnantWarningDays || 30),
     vehicleStagnantHighDays: Number(cfg.compraventa?.vehicleStagnantHighDays || 60),
     vehicleStagnantCriticalDays: Number(cfg.compraventa?.vehicleStagnantCriticalDays || 90),

     // ── Gasto de preparación sin factura ──
     expenseNoInvoiceEnabled: cfg.compraventa?.expenseNoInvoiceEnabled !== false,
     expenseNoInvoiceGraceDays: Number(cfg.compraventa?.expenseNoInvoiceGraceDays || 7),

     // ── Precio por debajo del mínimo ──
     priceBelowMinEnabled: cfg.compraventa?.priceBelowMinEnabled !== false,

     // ── Oportunidad / lead sin seguimiento ──
     leadNoFollowUpEnabled: cfg.compraventa?.leadNoFollowUpEnabled !== false,
     leadNoFollowUpDays: Number(cfg.compraventa?.leadNoFollowUpDays || 3),
     leadNoFollowUpCriticalDays: Number(cfg.compraventa?.leadNoFollowUpCriticalDays || 7),

     // ── Entrega pendiente (sold pero no delivered) ──
     pendingDeliveryEnabled: cfg.compraventa?.pendingDeliveryEnabled !== false,
     pendingDeliveryDays: Number(cfg.compraventa?.pendingDeliveryDays || 5),
     pendingDeliveryCriticalDays: Number(cfg.compraventa?.pendingDeliveryCriticalDays || 15),

     // ── Reserva vencida (señal cobrada pero inactiva demasiado tiempo) ──
     reservationExpiredEnabled: cfg.compraventa?.reservationExpiredEnabled !== false,
     reservationExpiredDays: Number(cfg.compraventa?.reservationExpiredDays || 15),

     // ── ITV del vehículo en stock ──
     stockItvEnabled: cfg.compraventa?.stockItvEnabled !== false,
     stockItvWarningDays: Number(cfg.compraventa?.stockItvWarningDays || 30),

     // ── Margen bajo global (alerta de negocio) ──
     lowAvgMarginEnabled: cfg.compraventa?.lowAvgMarginEnabled ?? false,
     lowAvgMarginThresholdPercent: Number(cfg.compraventa?.lowAvgMarginThresholdPercent || 10),
   }
   ```

2. **Actualizar `allowedKeys` en `alertController.js` → `updateAlertSettings()`:**
   - Añadir `compraventa` como clave permitida (objeto completo).
   - Validar tipos: booleanos son booleanos, números son positivos, arrays contienen strings válidos.
   - Merge profundo: `{ ...current.compraventa, ...body.compraventa }` para no borrar claves no enviadas.

3. **Actualizar `getAlertSummary()` en `alertEngine.js`:**
   - Incluir sección `compraventa` en la respuesta del summary con los conteos de cada tipo de alerta activa.

4. **Defaults inteligentes:**
   - Si el negocio tiene `businessType === 'carDealership'`, usar valores específicos del sector.
   - Si no, desactivar el bloque completo (`enabled: false`).
   - Los umbrales de documentación deben adaptarse según si el negocio ya tiene categorías documentales configuradas (DOC-01).

**Criterios de aceptación:**
- La configuración se lee y escribe correctamente vía `GET/PUT /api/alerts/:userId/config`.
- Los defaults se aplican automáticamente si no hay configuración previa.
- La migración es suave: cuentas sin bloque `compraventa` obtienen defaults sensatos.
- Solo se activa para negocios `carDealership`.
- Validación de tipos en la escritura.

---

### TICKET ACV-02: Motor de alertas compraventa — Integración en alertEngine

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ACV-01

**Descripción:**  
Crear las funciones de evaluación de alertas de compraventa e integrarlas en el motor existente `alertEngine.js`, ejecutándose cada 60 minutos (ciclo estándar). A diferencia de delivery (que necesita ciclo rápido de 60s), compraventa opera con datos de negocio diarios: vehículos en stock, ventas activas, leads abiertos. El ciclo de 60 minutos es adecuado.

**Tareas:**

1. **Crear `services/compraventaAlertEngine.js`:**

   ```javascript
   import { emitGlobalAlert } from './alertEmitter.js';
   import {
     VEHICLES_DB, getSalesDbName, getFinanceDbName, getDocumentsDbName,
     ensureDatabase, getAllDocuments, findAccountByUserId,
   } from './couchdb.js';
   import logger from './logger.js';

   export async function runCompraventaAlerts(ctx, config, vehicles, sales, leads, documents, financeDocs) { ... }
   export function getCompraventaAlertConfig(account) { ... }
   export async function getCompraventaAlertSummary(userId) { ... }
   ```

2. **Función `runCompraventaAlerts(ctx, config, ...)`:**
   - Recibe el contexto (`businessId`, `userId`), la configuración y los datos ya cargados.
   - Ejecuta las 8+2 reglas de detección (ACV-03 a ACV-10).
   - Devuelve array de alertas emitidas.

3. **Integrar en `runAlertsForBusiness()` y `runAlertsForUser()` de `alertEngine.js`:**
   - Detectar si la cuenta es `carDealership` o tiene el bloque `compraventa.enabled`.
   - Cargar datos adicionales: ventas (`type: 'sale'`), leads, documentos por vehículo.
   - Llamar a `runCompraventaAlerts()` con los datos.
   - Acumular resultados en el array `results`.

4. **Carga de datos:**
   ```javascript
   // En runAlertsForBusiness, añadir al Promise.all:
   const sales = await fetchAllDocsOfType(getSalesDbName(), 'sale')
     .then(d => d.filter(i => i.user_id === ownerId));
   const leads = await fetchAllDocsOfType(getCrmDbName(), 'lead')
     .then(d => d.filter(i => i.user_id === ownerId));
   const documents = await fetchAllDocs(getDocumentsDbName())
     .then(d => d.filter(i => i.user_id === ownerId && !i.deletedAt));
   ```

5. **Logging y observabilidad:**
   - Tag: `COMPRAVENTA_ALERT_ENGINE`.
   - Loguear número de alertas generadas por tipo si > 0.
   - Loguear tiempo de ejecución del bloque compraventa.

**Criterios de aceptación:**
- El motor se ejecuta automáticamente dentro del ciclo del `alertEngine` existente.
- Solo se ejecuta para usuarios/negocios con vertical `carDealership`.
- Los datos se cargan eficientemente (aprovechando los `Promise.all` existentes).
- El tiempo de ejecución del bloque compraventa es < 3 segundos.
- Los errores en alertas de compraventa no afectan al resto del motor.

---

### TICKET ACV-03: Regla — Vehículo sin documentación obligatoria

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar vehículos en stock (`status: 'available'` o `'reserved'`) que no tienen la documentación obligatoria completa. Un concesionario no puede vender legalmente un vehículo sin documentación al día.

**Lógica de detección:**

```
Para cada vehículo con status ∈ {available, reserved} y active !== false:
  1. Obtener documentos del módulo de documentación vinculados a este vehicleId
  2. Comprobar contra la lista de docs obligatorios (requiredDocs):
     - permiso_circulacion
     - ficha_tecnica
     - itv (vigente, no caducada)
     - contrato_compra (contrato de adquisición)
     - factura_compra (factura del proveedor)

  3. Calcular documentos faltantes = requiredDocs - documentos existentes

  4. Si hay faltantes y el vehículo lleva > missingDocsGraceDays desde su creación:
     - Si faltan >= 3 docs → prioridad ALTA
     - Si faltan 1-2 docs → prioridad MEDIA
     - Clasificación: DOCUMENTAL
```

**Alerta especial — ITV en stock:**
```
Para vehículos con itvDate o documento ITV:
  Si ITV caducada → prioridad ALTA (no se puede circular / entregar)
  Si ITV caduca en < stockItvWarningDays → prioridad MEDIA
```

**Tareas:**

1. **Implementar `checkVehicleMissingDocs(ctx, vehicles, documents, config)` en `compraventaAlertEngine.js`:**
   - Por cada vehículo activo en stock, filtrar documentos con `doc.vehicleId === vehicle._id`.
   - Comparar contra `config.compraventa.requiredDocs`.
   - Generar alerta tipo `cv_vehicle_missing_docs`:
     ```javascript
     {
       category: 'cv_vehicle_missing_docs',
       source: 'compraventa',
       priority: missingCount >= 3 ? 'high' : 'medium',
       level: missingCount >= 3 ? 'alert' : 'warning',
       title: 'Vehículo sin documentación completa',
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) — Faltan ${missingCount} documento(s): ${missingList.join(', ')}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vehicles/${vehicle._id}?tab=documents`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate, missingDocs: missingList,
         totalRequired: requiredDocs.length, daysInStock: days,
         classification: 'documental',
       },
     }
     ```

2. **Implementar `checkStockItvExpiry(ctx, vehicles, documents, config)` en `compraventaAlertEngine.js`:**
   - Para cada vehículo en stock, buscar campo `itvDate` en el vehículo o documento tipo `itv`.
   - Si ITV caducada: alerta `cv_stock_itv_expired` prioridad ALTA.
   - Si ITV caduca pronto: alerta `cv_stock_itv_expiring` prioridad MEDIA.
   - Ruta: `/saas/vehicles/${vehicle._id}?tab=documents`.

3. **Mapa de nombres legibles para documentos:**
   ```javascript
   const DOC_LABELS = {
     permiso_circulacion: 'Permiso de circulación',
     ficha_tecnica: 'Ficha técnica',
     itv: 'ITV vigente',
     contrato_compra: 'Contrato de compra',
     factura_compra: 'Factura de compra',
   };
   ```

**Criterios de aceptación:**
- Se detectan vehículos en stock sin documentación obligatoria.
- Se respeta el periodo de gracia (`missingDocsGraceDays`).
- Se detecta ITV caducada o próxima a caducar en vehículos de stock.
- La alerta incluye la lista de documentos faltantes.
- La prioridad escala según cantidad de documentos faltantes.
- Deduplicación: una alerta por vehículo por día.

---

### TICKET ACV-04: Regla — Reserva sin contrato

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar operaciones de venta en fase `reserved` que no tienen contrato generado y/o firmado pasado un plazo razonable. Una reserva con señal cobrada sin contrato es un riesgo jurídico.

**Lógica de detección:**

```
Para cada sale con stage === 'reserved':
  1. Calcular días desde que entró en reserved (buscar en stageHistory)
  2. Verificar si existe documento tipo 'contract' en generatedDocuments con status 'ok'
     O documento vinculado con category 'contrato_venta' en el módulo de documentación

  3. Si no tiene contrato y días > reservationNoContractDays:
     - Si depositPaid > 0 (señal cobrada sin contrato) → prioridad ALTA
     - Si depositPaid === 0 (solo reserva verbal) → prioridad MEDIA
     - Clasificación: DOCUMENTAL
```

**Alerta complementaria — Reserva vencida:**
```
Para cada sale con stage === 'reserved':
  Si días_en_reserva > reservationExpiredDays:
    → prioridad ALTA — "Reserva vencida: [vehículo] reservado por [cliente]
      hace X días. Señal: Y €. Ningún avance desde [fecha]."
    → Clasificación: COMERCIAL
```

**Tareas:**

1. **Implementar `checkReservationNoContract(ctx, sales, documents, config)` en `compraventaAlertEngine.js`:**
   - Filtrar ventas en stage `reserved`.
   - Para cada una, calcular días en reserva desde `stageHistory`.
   - Verificar existencia de contrato (en `generatedDocuments` o en docs vinculados al `saleId`).
   - Generar alerta tipo `cv_reservation_no_contract`:
     ```javascript
     {
       category: 'cv_reservation_no_contract',
       source: 'compraventa',
       priority: sale.depositPaid > 0 ? 'high' : 'medium',
       level: sale.depositPaid > 0 ? 'alert' : 'warning',
       title: 'Reserva sin contrato',
       message: `${sale.vehicleName} (${sale.vehiclePlate}) — Reservado por ${sale.clientName} hace ${days} días sin contrato.${sale.depositPaid > 0 ? ` Señal cobrada: ${sale.depositPaid.toFixed(2)} €.` : ''}`,
       entityId: sale._id,
       entityType: 'sale',
       route: `/saas/sales/${sale._id}?tab=documents`,
       metadata: {
         vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
         clientName: sale.clientName, daysInReserved: days,
         depositPaid: sale.depositPaid, hasContract: false,
         classification: 'documental',
       },
     }
     ```

2. **Implementar `checkExpiredReservations(ctx, sales, config)` en `compraventaAlertEngine.js`:**
   - Filtrar ventas en stage `reserved` con días > `reservationExpiredDays`.
   - Verificar que no ha habido movimiento reciente (sin nuevas entradas en `stageHistory`, `paymentHistory` ni `internalNotes` en los últimos X días).
   - Generar alerta tipo `cv_reservation_expired`:
     ```javascript
     {
       category: 'cv_reservation_expired',
       source: 'compraventa',
       priority: 'high',
       level: 'alert',
       title: 'Reserva vencida',
       message: `${sale.vehicleName} — Reservado por ${sale.clientName} hace ${days} días sin avance. Señal: ${sale.depositPaid.toFixed(2)} €. Vehículo bloqueado.`,
       entityId: sale._id,
       entityType: 'sale',
       route: `/saas/sales/${sale._id}`,
       metadata: {
         vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
         clientName: sale.clientName, daysInReserved: days,
         depositPaid: sale.depositPaid, lastActivity: lastActivityDate,
         classification: 'comercial',
       },
     }
     ```

**Criterios de aceptación:**
- Se detectan reservas sin contrato tras el periodo de gracia.
- La prioridad es mayor si hay señal cobrada.
- Se detectan reservas vencidas (inactivas demasiado tiempo).
- Las alertas incluyen datos del vehículo, cliente, señal y días.
- Deduplicación: una alerta por venta por día.

---

### TICKET ACV-05: Regla — Venta sin cobro completo

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Económica

**Descripción:**  
Detectar operaciones de venta en fases avanzadas (`documentation`, `sold`, `delivered`) donde el cobro total no se ha completado. Incluye la detección de impagos parciales y ventas entregadas sin cobro total.

**Lógica de detección:**

```
Para cada sale con stage ∈ {documentation, sold, delivered}:
  pendingAmount = totalPrice - depositPaid - financingAmount
  // (financingAmount se considera como "cobrado" porque lo paga el banco)

  Si pendingAmount > 0:
    daysInStage = días desde que entró en el stage actual

    Si stage === 'delivered' y pendingAmount > 0:
      → prioridad ALTA (vehículo ya entregado sin cobro total)
      → Clasificación: ECONÓMICA

    Si stage === 'sold' y daysInStage > saleUnpaidCriticalDays:
      → prioridad ALTA
      → Clasificación: ECONÓMICA

    Si stage === 'sold' y daysInStage > saleUnpaidDays:
      → prioridad MEDIA
      → Clasificación: ECONÓMICA

    Si stage === 'documentation' y daysInStage > saleUnpaidDays:
      → prioridad BAJA (informativa, la venta aún no está cerrada)
```

**Tareas:**

1. **Implementar `checkSaleUnpaid(ctx, sales, config)` en `compraventaAlertEngine.js`:**
   - Calcular `pendingAmount = totalPrice - depositPaid - financingAmount`.
   - Para ventas `delivered` con pendiente: alerta inmediata de prioridad ALTA.
   - Para ventas `sold` según días: escalar prioridad.
   - Generar alerta tipo `cv_sale_unpaid`:
     ```javascript
     {
       category: 'cv_sale_unpaid',
       source: 'compraventa',
       priority: priorityLevel,
       level: sale.stage === 'delivered' ? 'alert' : 'warning',
       title: sale.stage === 'delivered'
         ? 'Impago — Vehículo entregado sin cobro total'
         : 'Venta con cobro pendiente',
       message: `${sale.vehicleName} (${sale.vehiclePlate}) — ${sale.clientName}. Pendiente: ${pendingAmount.toFixed(2)} € de ${sale.totalPrice.toFixed(2)} €. Fase: ${stageLabel}.`,
       entityId: sale._id,
       entityType: 'sale',
       route: `/saas/sales/${sale._id}?tab=payments`,
       metadata: {
         vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
         clientName: sale.clientName, totalPrice: sale.totalPrice,
         depositPaid: sale.depositPaid, financingAmount: sale.financingAmount,
         pendingAmount, stage: sale.stage, daysInStage: days,
         classification: 'economica',
       },
     }
     ```

2. **Helper `getStageDays(sale, targetStage)`:**
   - Buscar en `stageHistory` la última transición al stage indicado.
   - Devolver días desde esa fecha hasta hoy.

3. **Labels legibles de stage:**
   ```javascript
   const STAGE_LABELS = {
     interested: 'Interesado',
     reserved: 'Reservado',
     documentation: 'Documentación',
     sold: 'Vendido',
     delivered: 'Entregado',
   };
   ```

**Criterios de aceptación:**
- Se detectan ventas con cobro pendiente en cada fase.
- La prioridad es ALTA si el vehículo ya fue entregado.
- La prioridad escala con los días de impago.
- Se excluyen ventas con `financingAmount` que cubre el pendiente.
- La alerta incluye importes exactos y días de retraso.

---

### TICKET ACV-06: Regla — Vehículo inmovilizado (parado demasiados días)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Comercial

**Descripción:**  
Reemplazar y ampliar la regla genérica `vehicle_stock_aging` para compraventa con una versión con 3 niveles de severidad, enriquecida con contexto de margen y depreciación estimada.

**Lógica de detección:**

```
Para cada vehículo con status === 'available' y active !== false:
  daysInStock = (now - (purchaseDate || createdAt)) / 86_400_000

  Si daysInStock >= vehicleStagnantCriticalDays (90 días):
    → prioridad ALTA
    → Incluir depreciación estimada: ~1% del precio de compra por cada 30 días

  Si daysInStock >= vehicleStagnantHighDays (60 días):
    → prioridad MEDIA

  Si daysInStock >= vehicleStagnantWarningDays (30 días):
    → prioridad BAJA

  Enriquecer con:
    - Margen estimado actual: salePrice - purchasePrice - Σ(associatedCosts)
    - Depreciación estimada: purchasePrice * 0.01 * Math.floor(daysInStock / 30)
    - Margen ajustado: margen estimado - depreciación
    - Si margen ajustado < 0 → escalar prioridad un nivel
```

**Tareas:**

1. **Implementar `checkVehicleStagnant(ctx, vehicles, config)` en `compraventaAlertEngine.js`:**
   - Iterar vehículos disponibles.
   - Calcular días en stock, margen estimado y depreciación.
   - Generar alerta tipo `cv_vehicle_stagnant`:
     ```javascript
     {
       category: 'cv_vehicle_stagnant',
       source: 'compraventa',
       priority: priorityLevel,
       level: daysInStock >= criticalDays ? 'alert' : 'warning',
       title: `Vehículo inmovilizado — ${daysInStock} días en stock`,
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) lleva ${daysInStock} días sin venderse. PV: ${vehicle.salePrice?.toFixed(0) || '—'} €. Margen estimado: ${estimatedMargin.toFixed(0)} €${depreciationNote}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vehicles/${vehicle._id}`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate, daysInStock,
         purchasePrice: vehicle.purchasePrice, salePrice: vehicle.salePrice,
         associatedCosts: totalCosts, estimatedMargin, depreciation,
         adjustedMargin: estimatedMargin - depreciation,
         classification: 'comercial',
       },
     }
     ```

2. **No ejecutar la regla genérica `vehicle_stock_aging` si `compraventa.vehicleStagnantEnabled` está activa:**
   - Evitar duplicación de alertas para el mismo vehículo.
   - En `runAlertsForBusiness`, condicionar: si tiene config compraventa activa, saltar `checkVehicleStockAging` y usar `checkVehicleStagnant` en su lugar.

**Criterios de aceptación:**
- 3 niveles de severidad: 30, 60 y 90 días.
- Cada alerta incluye el margen estimado y la depreciación.
- Si el margen ajustado es negativo, se escala la prioridad.
- Reemplaza `vehicle_stock_aging` para negocios compraventa (sin duplicar).
- Deduplicación diaria.

---

### TICKET ACV-07: Regla — Gasto de preparación sin factura

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Documental

**Descripción:**  
Detectar gastos de preparación registrados en los vehículos (`associatedCosts[]`) que no tienen factura asociada. Un gasto sin factura no es deducible fiscalmente.

**Lógica de detección:**

```
Para cada vehículo con associatedCosts no vacío:
  Para cada cost en associatedCosts:
    Si cost.invoiceId está vacío o null:
      Y cost.date tiene más de expenseNoInvoiceGraceDays días:
        → Acumular como gasto sin factura

  Si hay gastos sin factura:
    totalSinFactura = Σ(cost.amount) de gastos sin factura

    Si totalSinFactura > 500 → prioridad ALTA
    Si totalSinFactura > 0 → prioridad MEDIA
    Clasificación: DOCUMENTAL
```

**Tareas:**

1. **Implementar `checkExpenseNoInvoice(ctx, vehicles, config)` en `compraventaAlertEngine.js`:**
   - Iterar vehículos con `associatedCosts[]`.
   - Filtrar costes sin `invoiceId` ni `attachmentUrl` pasado el periodo de gracia.
   - Agrupar por vehículo (una alerta por vehículo, no por gasto individual).
   - Generar alerta tipo `cv_expense_no_invoice`:
     ```javascript
     {
       category: 'cv_expense_no_invoice',
       source: 'compraventa',
       priority: totalWithoutInvoice > 500 ? 'high' : 'medium',
       level: 'warning',
       title: 'Gastos de preparación sin factura',
       message: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate}) tiene ${count} gasto(s) sin factura por ${totalWithoutInvoice.toFixed(2)} €: ${conceptList}.`,
       entityId: vehicle._id,
       entityType: 'vehicle',
       route: `/saas/vehicles/${vehicle._id}?tab=costs`,
       metadata: {
         brand: vehicle.brand, model: vehicle.model,
         plate: vehicle.registrationPlate,
         expensesWithoutInvoice: count, totalAmount: totalWithoutInvoice,
         concepts: conceptList, classification: 'documental',
       },
     }
     ```

2. **Considerar también gastos en finanzas:**
   - Si existen movimientos `type: 'pago'` con `linkedEntityType: 'vehicle'` y sin `linkedDocuments`/`attachmentUrl`/`linkedInvoiceId`, incluirlos.

**Criterios de aceptación:**
- Se detectan gastos de preparación sin factura por vehículo.
- Se respeta el periodo de gracia.
- La prioridad escala según el importe acumulado.
- La alerta incluye la lista de conceptos sin factura.

---

### TICKET ACV-08: Regla — Precio de venta por debajo del mínimo

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Económica

**Descripción:**  
Detectar ventas activas cuyo `totalPrice` sea inferior al `minimumPrice` del `SaleRecord` o al `purchasePrice` del vehículo. Esto indica una venta con pérdida potencial que necesita revisión.

**Lógica de detección:**

```
Para cada sale con stage ∈ {reserved, documentation, sold} y NOT deletedAt:
  Si sale.totalPrice < sale.minimumPrice:
    margenVsMinimo = sale.totalPrice - sale.minimumPrice
    → prioridad ALTA
    → Mensaje: "Venta por debajo del mínimo"

  Si sale.totalPrice < sale.purchasePrice:
    → prioridad ALTA (venta con pérdida directa)
    → Mensaje: "Venta con pérdida"

  Si sale.totalPrice < sale.purchasePrice + totalAssociatedCosts:
    → prioridad MEDIA (margen negativo tras gastos)
    → Mensaje: "Margen negativo tras costes de preparación"
```

**Tareas:**

1. **Implementar `checkPriceBelowMinimum(ctx, sales, vehicles, config)` en `compraventaAlertEngine.js`:**
   - Por cada venta activa, verificar contra `minimumPrice`, `purchasePrice` y costes asociados del vehículo.
   - Generar alerta tipo `cv_price_below_minimum`:
     ```javascript
     {
       category: 'cv_price_below_minimum',
       source: 'compraventa',
       priority: 'high',
       level: 'alert',
       title: isPurchaseLoss ? 'Venta con pérdida' : 'Precio por debajo del mínimo',
       message: `${sale.vehicleName} (${sale.vehiclePlate}) — PV: ${sale.totalPrice.toFixed(0)} €, mínimo: ${sale.minimumPrice.toFixed(0)} €, compra: ${sale.purchasePrice.toFixed(0)} €. Diferencia: ${difference.toFixed(0)} €.`,
       entityId: sale._id,
       entityType: 'sale',
       route: `/saas/sales/${sale._id}?tab=summary`,
       metadata: {
         vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
         totalPrice: sale.totalPrice, minimumPrice: sale.minimumPrice,
         purchasePrice: sale.purchasePrice, associatedCosts: totalCosts,
         netMargin: sale.totalPrice - sale.purchasePrice - totalCosts,
         classification: 'economica',
       },
     }
     ```

2. **Alerta adicional — Margen medio bajo (nivel negocio):**
   - Si `lowAvgMarginEnabled`, calcular el margen medio de las ventas cerradas del mes actual.
   - Si el margen medio es inferior a `lowAvgMarginThresholdPercent`: alerta `cv_low_avg_margin` prioridad MEDIA al gerente.

**Criterios de aceptación:**
- Se detectan ventas con precio bajo mínimo, con pérdida y con margen negativo.
- La alerta distingue claramente los 3 escenarios.
- El margen medio bajo se evalúa a nivel global del negocio.
- Solo se alerta una vez por venta por día.

---

### TICKET ACV-09: Regla — Oportunidad / lead sin seguimiento

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Comercial

**Descripción:**  
Detectar leads/oportunidades del CRM que no han recibido seguimiento en un plazo razonable. Un lead sin seguimiento es una venta potencial perdida.

**Lógica de detección:**

```
Para cada lead con status ∈ {new, contacted, follow_up, negotiation, visit_scheduled}:
  daysSinceContact = now - max(lastContactAt, lastActivityAt, createdAt)

  Si nextFollowUpDate existe y nextFollowUpDate < now:
    daysPastDue = now - nextFollowUpDate
    Si daysPastDue > leadNoFollowUpCriticalDays → prioridad ALTA
    Si daysPastDue > 0 → prioridad MEDIA
    Clasificación: COMERCIAL

  Si nextFollowUpDate no existe:
    Si daysSinceContact > leadNoFollowUpCriticalDays → prioridad ALTA
    Si daysSinceContact > leadNoFollowUpDays → prioridad MEDIA
    Clasificación: COMERCIAL

  Metadata: incluir lead.responsible para routing por comercial
```

**Tareas:**

1. **Implementar `checkLeadNoFollowUp(ctx, leads, config)` en `compraventaAlertEngine.js`:**
   - Filtrar leads activos (no `won`, `lost`, `archived`).
   - Calcular días desde último contacto y días pasados de `nextFollowUpDate`.
   - Generar alerta tipo `cv_lead_no_followup`:
     ```javascript
     {
       category: 'cv_lead_no_followup',
       source: 'compraventa',
       priority: priorityLevel,
       level: isOverdue ? 'alert' : 'warning',
       title: isOverdue
         ? `Seguimiento vencido — ${lead.name || lead.contactName}`
         : `Lead sin seguimiento — ${lead.name || lead.contactName}`,
       message: isOverdue
         ? `Seguimiento de ${lead.name} vencido hace ${daysPastDue} días (previsto: ${formatDate(lead.nextFollowUpDate)}). Asignado a: ${lead.responsible}.`
         : `${lead.name} lleva ${daysSinceContact} días sin contacto. Asignado a: ${lead.responsible}.`,
       entityId: lead._id,
       entityType: 'lead',
       route: `/saas/crm?leadId=${lead._id}`,
       metadata: {
         leadName: lead.name || lead.contactName,
         responsible: lead.responsible,
         daysSinceContact, nextFollowUpDate: lead.nextFollowUpDate,
         daysPastDue: daysPastDue || 0,
         source: lead.source, budget: lead.budget,
         classification: 'comercial',
       },
     }
     ```

2. **Incluir `responsible` para routing por rol (ACV-12):**
   - El campo `lead.responsible` permite enviar la alerta al comercial asignado, no solo al gerente.

**Criterios de aceptación:**
- Se detectan leads con seguimiento vencido (`nextFollowUpDate < now`).
- Se detectan leads sin contacto reciente (`daysSinceContact > threshold`).
- La prioridad escala según días de retraso.
- Se excluyen leads en estado terminal (`won`, `lost`, `archived`).
- La alerta incluye el comercial asignado para routing.

---

### TICKET ACV-10: Regla — Entrega pendiente

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02  
**Clasificación de prioridad:** Comercial

**Descripción:**  
Detectar ventas cerradas (`stage: 'sold'`) que no han completado la entrega del vehículo al cliente en un plazo razonable. Incluye la detección de entregas retrasadas respecto a la fecha prevista.

**Lógica de detección:**

```
Para cada sale con stage === 'sold' y NOT deliveredAt:
  daysSinceSold = días desde que entró en 'sold' (stageHistory)

  Si expectedDelivery existe y expectedDelivery < now:
    daysLate = now - expectedDelivery
    → prioridad ALTA — "Entrega retrasada"
    → Clasificación: COMERCIAL

  Si daysSinceSold > pendingDeliveryCriticalDays (15):
    → prioridad ALTA — "Vehículo vendido sin entregar"

  Si daysSinceSold > pendingDeliveryDays (5):
    → prioridad MEDIA — "Entrega pendiente"
```

**Tareas:**

1. **Implementar `checkPendingDelivery(ctx, sales, config)` en `compraventaAlertEngine.js`:**
   - Filtrar ventas `sold` sin `deliveredAt`.
   - Calcular días desde cierre y retraso vs `expectedDelivery`.
   - Generar alerta tipo `cv_pending_delivery`:
     ```javascript
     {
       category: 'cv_pending_delivery',
       source: 'compraventa',
       priority: priorityLevel,
       level: isLate ? 'alert' : 'warning',
       title: isLate
         ? `Entrega retrasada — ${sale.vehicleName}`
         : `Entrega pendiente — ${sale.vehicleName}`,
       message: isLate
         ? `${sale.vehicleName} (${sale.vehiclePlate}) — Entrega prevista el ${formatDate(sale.expectedDelivery)}, retrasada ${daysLate} días. Cliente: ${sale.clientName}.`
         : `${sale.vehicleName} (${sale.vehiclePlate}) vendido hace ${daysSinceSold} días sin entregar. Cliente: ${sale.clientName}.`,
       entityId: sale._id,
       entityType: 'sale',
       route: `/saas/sales/${sale._id}?tab=delivery`,
       metadata: {
         vehicleName: sale.vehicleName, plate: sale.vehiclePlate,
         clientName: sale.clientName, clientPhone: sale.clientPhone,
         daysSinceSold, expectedDelivery: sale.expectedDelivery,
         daysLate: daysLate || 0, responsible: sale.responsible,
         classification: 'comercial',
       },
     }
     ```

**Criterios de aceptación:**
- Se detectan ventas cerradas sin entrega.
- Se detectan entregas retrasadas vs fecha prevista con prioridad ALTA.
- La prioridad escala con los días.
- La alerta incluye datos de contacto del cliente.
- Se incluye el comercial asignado para routing.

---

### TICKET ACV-11: Sistema de priorización y clasificación

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ACV-02

**Descripción:**  
Implementar un sistema unificado de clasificación de alertas con tres ejes: **prioridad** (alta/media/baja), **severidad** (critical/warning/info) y **clasificación** (comercial/económica/documental). La clasificación permite filtrar alertas por naturaleza del problema.

**Tareas:**

1. **Definir constantes en `compraventaAlertEngine.js`:**

   ```javascript
   const CLASSIFICATION = {
     COMMERCIAL: 'comercial',
     ECONOMIC: 'economica',
     DOCUMENTARY: 'documental',
   };

   const ALERT_CLASSIFICATION = {
     cv_vehicle_missing_docs:     { defaultPriority: 'medium', classification: 'documental',  escalable: true  },
     cv_stock_itv_expired:        { defaultPriority: 'high',   classification: 'documental',  escalable: false },
     cv_stock_itv_expiring:       { defaultPriority: 'medium', classification: 'documental',  escalable: true  },
     cv_reservation_no_contract:  { defaultPriority: 'medium', classification: 'documental',  escalable: true  },
     cv_reservation_expired:      { defaultPriority: 'high',   classification: 'comercial',   escalable: false },
     cv_sale_unpaid:              { defaultPriority: 'medium', classification: 'economica',   escalable: true  },
     cv_vehicle_stagnant:         { defaultPriority: 'low',    classification: 'comercial',   escalable: true  },
     cv_expense_no_invoice:       { defaultPriority: 'medium', classification: 'documental',  escalable: false },
     cv_price_below_minimum:      { defaultPriority: 'high',   classification: 'economica',   escalable: false },
     cv_low_avg_margin:           { defaultPriority: 'medium', classification: 'economica',   escalable: true  },
     cv_lead_no_followup:         { defaultPriority: 'medium', classification: 'comercial',   escalable: true  },
     cv_pending_delivery:         { defaultPriority: 'medium', classification: 'comercial',   escalable: true  },
   };
   ```

2. **Incluir `metadata.classification` en todas las alertas (ACV-03 a ACV-10):**
   - Cada función de detección ya incluye `classification` en su metadata.
   - El frontend podrá filtrar alertas por clasificación.

3. **Lógica de escalado automático para alertas `escalable: true`:**
   - Si una alerta del mismo `dedupKey` lleva más de **3 días** sin resolverse → subir prioridad un nivel (low→medium, medium→high).
   - El escalado se aplica en la siguiente ejecución del motor comparando contra notificaciones previas en CouchDB.
   - Al escalar, añadir `metadata.escalated: true` y `metadata.escalatedAt`.

4. **Resolución automática:**
   - Si la condición que generó la alerta deja de cumplirse (vehículo vendido, contrato firmado, cobro completado, etc.), la alerta anterior ya no se re-emite gracias a la deduplicación.
   - Opcionalmente, marcar alertas antiguas como `resolvedAt: now` cuando la condición desaparece (requiere consultar alertas previas).

**Criterios de aceptación:**
- Todas las alertas tienen `classification` (comercial/económica/documental).
- El escalado automático sube prioridad tras 3 días sin resolución.
- La clasificación constante está definida y es consistente.
- Las alertas `escalable: true` marcan `escalated: true` al subir.

---

### TICKET ACV-12: Routing de alertas por rol y destino

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ACV-11

**Descripción:**  
Implementar la lógica de distribución de alertas a los destinatarios correctos según su rol. El gerente recibe todas las alertas del negocio; el comercial recibe solo las de sus operaciones asignadas.

**Destinos de cada alerta:**

| Canal de entrega | Descripción | Cuándo |
|------------------|-------------|--------|
| **Notificación in-app** | Documento en `notifications` DB | Siempre (todas las alertas) |
| **SSE** | Evento `compraventa:alert` | Siempre (tiempo real) |
| **Push web** | Push notification al dispositivo | Solo prioridad alta + usuario con push habilitado |
| **Dashboard** | Incluida en KPIs y centro de alertas | Siempre (leída on-demand) |
| **Centro de alertas core** | Incluida en `GET /api/alerts/:userId` | Siempre (resumen global) |

**Routing por rol:**

| Alerta | Gerente (owner/admin/Gerente) | Comercial (Comercial/Usuario) | Administración |
|--------|------|----------|----------------|
| Vehículo sin documentación | ✅ todos | ✅ solo vehículos de sus ventas | ✅ |
| ITV caducada/próxima en stock | ✅ | ❌ | ✅ |
| Reserva sin contrato | ✅ todas | ✅ solo sus operaciones | ✅ |
| Reserva vencida | ✅ | ✅ solo sus operaciones | ❌ |
| Venta sin cobro completo | ✅ todas | ✅ solo sus operaciones | ✅ |
| Vehículo inmovilizado | ✅ | ❌ | ❌ |
| Gasto sin factura | ✅ | ❌ | ✅ |
| Precio bajo mínimo | ✅ | ✅ si es su operación | ❌ |
| Margen medio bajo | ✅ | ❌ | ❌ |
| Lead sin seguimiento | ✅ todos | ✅ solo sus leads | ❌ |
| Entrega pendiente | ✅ todas | ✅ solo sus operaciones | ❌ |

**Tareas:**

1. **Definir `TARGET_ROLES` por tipo de alerta:**

   ```javascript
   const ALERT_TARGET_ROLES = {
     cv_vehicle_missing_docs:     { manager: true, assignedWorker: true, admin: true },
     cv_stock_itv_expired:        { manager: true, assignedWorker: false, admin: true },
     cv_stock_itv_expiring:       { manager: true, assignedWorker: false, admin: true },
     cv_reservation_no_contract:  { manager: true, assignedWorker: true, admin: true },
     cv_reservation_expired:      { manager: true, assignedWorker: true, admin: false },
     cv_sale_unpaid:              { manager: true, assignedWorker: true, admin: true },
     cv_vehicle_stagnant:         { manager: true, assignedWorker: false, admin: false },
     cv_expense_no_invoice:       { manager: true, assignedWorker: false, admin: true },
     cv_price_below_minimum:      { manager: true, assignedWorker: true, admin: false },
     cv_low_avg_margin:           { manager: true, assignedWorker: false, admin: false },
     cv_lead_no_followup:         { manager: true, assignedWorker: true, admin: false },
     cv_pending_delivery:         { manager: true, assignedWorker: true, admin: false },
   };
   ```

2. **Implementar `routeCompraventaAlert(alert, business)` en `compraventaAlertEngine.js`:**
   - Para cada alerta emitida:
     a. Siempre emitir al owner/admin del negocio (gerente recibe todo).
     b. Si `assignedWorker: true` y la alerta tiene `metadata.responsible`:
        - Buscar en `business.members` el userId del miembro cuyo nombre coincide con `responsible`.
        - Emitir alerta individual vía `broadcastToUser()`.
     c. Si `admin: true`:
        - Buscar miembros con rol `Administración`.
        - Emitir alerta.
     d. Emitir `broadcastToBusiness(businessId, 'compraventa:alert', alert)` para clientes conectados.

3. **Push selectivo:**
   - Solo enviar push web si `priority === 'high'` y el usuario tiene push habilitado.
   - Para alertas de prioridad media/baja: solo in-app + SSE.

4. **Campo `targetRoles` en metadata:**
   - Incluir `targetRoles: ['manager', 'assigned_worker', 'admin']` en cada alerta para que el frontend pueda filtrar por rol del usuario conectado.

**Criterios de aceptación:**
- El gerente recibe TODAS las alertas de compraventa.
- Los comerciales solo reciben alertas de sus operaciones asignadas.
- Administración recibe alertas documentales y económicas.
- Push solo se envía en prioridad alta.
- Las alertas se persisten en notificaciones y se incluyen en el resumen de alertas core.
- El SSE funciona con `broadcastToBusiness` para distribuir a todos los conectados.

---

### TICKET ACV-13: Endpoints API y emisión SSE

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-11, ACV-12

**Descripción:**  
Crear los endpoints REST y eventos SSE para que el frontend consuma las alertas de compraventa en el dashboard, el centro de alertas y las pantallas operativas.

**Endpoints API:**

1. **`GET /api/compraventa/alerts/:userId`** — Alertas activas con filtros
   - Query params: `classification` (comercial|economica|documental), `priority` (high|medium|low), `status` (active|resolved|acknowledged), `from`, `to`, `limit`, `offset`.
   - Response:
     ```json
     {
       "ok": true,
       "alerts": [],
       "total": 12,
       "summary": {
         "active": 8, "resolved": 4,
         "byPriority": { "high": 3, "medium": 5, "low": 4 },
         "byClassification": { "comercial": 4, "economica": 3, "documental": 5 },
         "byType": { "cv_vehicle_missing_docs": 3, "cv_sale_unpaid": 2, "..." : "..." }
       }
     }
     ```

2. **`GET /api/compraventa/alerts/:userId/summary`** — Resumen on-demand (calculado en tiempo real)
   - Equivalente a `getCompraventaAlertSummary()`: evalúa todas las reglas y devuelve conteos sin emitir alertas.
   - Response:
     ```json
     {
       "ok": true,
       "updatedAt": "...",
       "totals": { "critical": 3, "warning": 7, "info": 2 },
       "documentation": {
         "vehiclesWithMissingDocs": 4,
         "expiredItv": 1,
         "reservationsWithoutContract": 2,
         "expensesWithoutInvoice": 3
       },
       "commercial": {
         "stagnantVehicles": { "over30": 5, "over60": 2, "over90": 1 },
         "expiredReservations": 1,
         "leadsWithoutFollowUp": 6,
         "pendingDeliveries": 2
       },
       "economic": {
         "salesWithPendingPayment": 3,
         "totalPendingAmount": 15400,
         "salesBelowMinimum": 1,
         "avgMarginPercent": 14.2
       }
     }
     ```

3. **`PUT /api/compraventa/alerts/:alertId/acknowledge`** — Reconocer alerta
   - Marca la alerta como reconocida.
   - Emite SSE `compraventa:alert_acknowledged`.

4. **`PUT /api/compraventa/alerts/:alertId/dismiss`** — Descartar alerta
   - Descarta la alerta (no se muestra más pero sí en historial).

5. **`GET /api/compraventa/alerts/:userId/history`** — Historial de alertas (últimos 30 días)

**Eventos SSE:**

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `compraventa:alert` | Nueva alerta emitida | Alerta completa con metadata y classification |
| `compraventa:alert_resolved` | Condición resuelta | `{ alertId, alertType, resolvedAt }` |
| `compraventa:alert_escalated` | Alerta escalada de prioridad | `{ alertId, oldPriority, newPriority }` |
| `compraventa:alert_acknowledged` | Usuario reconoce alerta | `{ alertId, acknowledgedBy }` |
| `compraventa:alerts_summary` | Resumen periódico (cada 60 min) | `{ total, byPriority, byClassification }` |

**Tareas:**

1. **Crear `controllers/compraventaAlertController.js`** con los handlers.
2. **Crear `routers/compraventaAlertRouter.js`** con las rutas.
3. **Montar en `index.js`:** `app.use('/api/compraventa/alerts', requireAuth, burstLimiter, compraventaAlertRouter)`.
4. **Emitir eventos SSE** desde `routeCompraventaAlert()` (ACV-12).

**Criterios de aceptación:**
- Los 5 endpoints funcionan con auth.
- Filtrado por clasificación (comercial/económica/documental).
- Summary calculado en tiempo real.
- Los 5 eventos SSE se emiten correctamente.
- El endpoint de resumen responde en < 3 segundos.

---

### TICKET ACV-14: Conexiones — Integración con módulos del ecosistema

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** ACV-02, ACV-12, ACV-13

**Descripción:**  
Asegurar que el motor de alertas compraventa está correctamente integrado con todos los módulos de datos que lee y todos los destinos a los que escribe. Las alertas se alimentan de datos de múltiples fuentes y sus resultados se distribuyen a múltiples destinos.

**Mapa de conexiones:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     FUENTES DE DATOS (lectura)                            │
│                                                                          │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐            │
│  │ Vehículos  │  │  Ventas  │  │   CRM    │  │Documentos  │            │
│  │ VEHICLES_DB│  │ sales DB │  │ leads DB │  │ docs DB    │            │
│  │ type: car  │  │type: sale│  │type: lead│  │type: doc   │            │
│  └─────┬──────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘            │
│        │              │             │               │                    │
│  ┌─────┴──────┐  ┌────┴──────┐  ┌──┴──────────┐  ┌┴──────────────┐    │
│  │ Gastos     │  │ Finanzas  │  │ Reservas    │  │ Contratos     │    │
│  │associated  │  │finance DB │  │(stage =     │  │generated      │    │
│  │Costs[]     │  │cobro/pago │  │ reserved)   │  │Documents[]    │    │
│  └────────────┘  └───────────┘  └─────────────┘  └───────────────┘    │
│                                                                          │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                   ┌────────────┴────────────┐
                   │  COMPRAVENTA ALERT      │
                   │      ENGINE             │
                   │  (compraventaAlert      │
                   │   Engine.js)            │
                   └────────────┬────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────────────┐
│                     DESTINOS (escritura)                                   │
│                               │                                          │
│  ┌────────────┐  ┌──────────┐│  ┌──────────┐  ┌───────────────────┐    │
│  │ Dashboard  │  │ Alertas  ││  │ Push Web │  │ Pantalla          │    │
│  │ concesion. │  │  Core    ││  │ (VAPID)  │  │ operativa         │    │
│  │ (KPIs)     │  │(centro   ││  │          │  │ comercial         │    │
│  │            │  │ alertas) ││  │          │  │ (SSE compraventa:*)│    │
│  └────────────┘  └──────────┘│  └──────────┘  └───────────────────┘    │
│                               │                                          │
│  ┌───────────────────────────┐│  ┌───────────────────────────────────┐  │
│  │ Notificaciones in-app    ││  │ SSE (broadcastToBusiness /        │  │
│  │ (notifications DB)       ││  │      broadcastToUser)             │  │
│  └───────────────────────────┘│  └───────────────────────────────────┘  │
│                               │                                          │
└───────────────────────────────┴──────────────────────────────────────────┘
```

**Tareas:**

1. **Conexión con Vehículos (`vehicleController.js`):**
   - Al crear vehículo → la próxima ejecución del motor evaluará docs faltantes.
   - Al cambiar `status` de vehículo → reevaluar alertas de inmovilización.
   - Considerar evaluación reactiva (opcional): al actualizar `associatedCosts`, disparar check de gastos sin factura.

2. **Conexión con Ventas (flujo de cierre/entrega — CV-07):**
   - Las alertas de CV-07 (`sale_pending_payment`, `pending_delivery`, `unsigned_contract`, `sold_not_delivered`) se reemplazan por las equivalentes de ACV-05 (`cv_sale_unpaid`), ACV-04 (`cv_reservation_no_contract`), ACV-10 (`cv_pending_delivery`).
   - Si CV-07 ya está implementado, unificar: las reglas de compraventa son la versión enriquecida con clasificación, routing por rol y escalado.

3. **Conexión con CRM / Leads:**
   - El motor lee leads activos y evalúa seguimiento (ACV-09).
   - Al completar un seguimiento (`lastContactAt` actualizado): la alerta deja de emitirse automáticamente.
   - Opcionalmente: hook reactivo al actualizar un lead que dispara evaluación inmediata.

4. **Conexión con Documentación (`documentsController.js`):**
   - Al subir/vincular un documento a un vehículo → la alerta de doc faltante se resuelve en el siguiente ciclo.
   - El motor lee `getDocumentsDbName()` para evaluar ACV-03.

5. **Conexión con Finanzas (`financeController.js`):**
   - Al registrar un cobro vinculado a una venta → la alerta de impago se resuelve.
   - El motor lee `getFinanceDbName()` para gastos sin factura.

6. **Conexión con Alertas Core (`alertController.js`):**
   - Incluir alertas compraventa en `getAlertSummary()`:
     ```javascript
     compraventa: {
       active: activeAlerts.length,
       byPriority: { high: X, medium: Y, low: Z },
       byClassification: { comercial: A, economica: B, documental: C },
       mostCritical: topAlert || null,
     }
     ```
   - El centro de alertas core (`/api/alerts/:userId`) agrega las alertas genéricas + compraventa.

7. **Conexión con Dashboard (`/api/dashboard/kpis/:userId`):**
   - Incluir campo `compraventaAlerts` en la respuesta de KPIs:
     ```javascript
     compraventaAlerts: {
       total: 12,
       critical: 3,
       warning: 7,
       byClassification: { comercial: 4, economica: 3, documental: 5 },
     }
     ```
   - Incluir en `dashAlerts`:
     ```javascript
     { id: 'cv_missing_docs', severity: 'warning', type: 'cv_missing_docs',
       message: '4 vehículos sin documentación completa', count: 4,
       route: '/saas/documents' }
     { id: 'cv_unpaid', severity: 'error', type: 'cv_unpaid',
       message: '3 ventas con cobro pendiente (15.400 €)', count: 3,
       route: '/saas/sales' }
     ```

**Criterios de aceptación:**
- Las alertas de compraventa se incluyen en el resumen de alertas core.
- El dashboard de KPIs incluye conteo y desglose de alertas compraventa.
- Las `dashAlerts` específicas aparecen para negocios `carDealership`.
- Los módulos que modifican datos (ventas, docs, cobros) resuelven alertas implícitamente en el siguiente ciclo.
- El diagrama de conexiones se cumple íntegramente.

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (Semana 1)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ACV-01 | Configuración de alertas compraventa | Backend | Crítica |
| ACV-02 | Motor de alertas — Integración en alertEngine | Backend | Crítica |
| ACV-11 | Sistema de priorización y clasificación | Backend | Crítica |

### Fase 2 — Reglas de detección principales (Semana 2)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ACV-03 | Vehículo sin documentación obligatoria + ITV stock | Backend | Alta |
| ACV-05 | Venta sin cobro completo (impago) | Backend | Alta |
| ACV-06 | Vehículo inmovilizado (30/60/90 días) | Backend | Alta |
| ACV-08 | Precio por debajo del mínimo / margen bajo | Backend | Alta |

### Fase 3 — Reglas de detección secundarias (Semana 3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ACV-04 | Reserva sin contrato + reserva vencida | Backend | Alta |
| ACV-07 | Gasto de preparación sin factura | Backend | Alta |
| ACV-09 | Oportunidad / lead sin seguimiento | Backend | Alta |
| ACV-10 | Entrega pendiente | Backend | Alta |

### Fase 4 — Distribución y API (Semana 4)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ACV-12 | Routing de alertas por rol y destino | Backend | Crítica |
| ACV-13 | Endpoints API y emisión SSE | Backend | Alta |

### Fase 5 — Integración (Semana 5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ACV-14 | Conexiones con módulos del ecosistema | Backend | Alta |

---

## MAPA DE ALERTAS — Referencia rápida

| # | Alerta | Categoría | Condición | Prioridad default | Clasificación | Destinatarios |
|---|--------|-----------|-----------|-------------------|---------------|---------------|
| 1 | Vehículo sin docs | `cv_vehicle_missing_docs` | Docs obligatorios faltantes > periodo gracia | media (escalable) | Documental | Gerente + Comercial asignado + Admin |
| 2 | ITV caducada stock | `cv_stock_itv_expired` | ITV caducada en vehículo de stock | alta | Documental | Gerente + Admin |
| 3 | ITV próxima stock | `cv_stock_itv_expiring` | ITV caduca en < 30 días | media (escalable) | Documental | Gerente + Admin |
| 4 | Reserva sin contrato | `cv_reservation_no_contract` | Reserva > X días sin contrato firmado | media (escalable) | Documental | Gerente + Comercial + Admin |
| 5 | Reserva vencida | `cv_reservation_expired` | Reserva > 15 días sin actividad | alta | Comercial | Gerente + Comercial |
| 6 | Venta sin cobro | `cv_sale_unpaid` | Venta en fase avanzada con pendiente > 0 | media (escalable) | Económica | Gerente + Comercial + Admin |
| 7 | Vehículo inmovilizado | `cv_vehicle_stagnant` | Vehículo available > 30/60/90 días | baja (escalable) | Comercial | Gerente |
| 8 | Gasto sin factura | `cv_expense_no_invoice` | Gasto preparación sin `invoiceId` > gracia | media | Documental | Gerente + Admin |
| 9 | Precio bajo mínimo | `cv_price_below_minimum` | `totalPrice < minimumPrice` o `< purchasePrice` | alta | Económica | Gerente + Comercial |
| 10 | Margen medio bajo | `cv_low_avg_margin` | Margen medio ventas mes < umbral % | media (escalable) | Económica | Gerente |
| 11 | Lead sin seguimiento | `cv_lead_no_followup` | Lead sin contacto > X días o seguimiento vencido | media (escalable) | Comercial | Gerente + Comercial asignado |
| 12 | Entrega pendiente | `cv_pending_delivery` | Venta `sold` sin `deliveredAt` > X días | media (escalable) | Comercial | Gerente + Comercial asignado |

---

## CLASIFICACIÓN POR NATURALEZA

### Prioridad Documental
Alertas relacionadas con documentación faltante, caducada o incompleta. Impacto legal y fiscal.

| Alerta | Impacto |
|--------|---------|
| Vehículo sin docs | No se puede vender legalmente sin documentación completa |
| ITV caducada/próxima | No se puede circular ni entregar el vehículo |
| Reserva sin contrato | Señal cobrada sin cobertura jurídica |
| Gasto sin factura | Gasto no deducible fiscalmente |

### Prioridad Económica
Alertas relacionadas con pérdidas, impagos o márgenes. Impacto directo en la rentabilidad.

| Alerta | Impacto |
|--------|---------|
| Venta sin cobro | Pérdida económica directa (vehículo entregado sin cobrar) |
| Precio bajo mínimo | Venta con pérdida o margen insuficiente |
| Margen medio bajo | Deterioro de la rentabilidad del negocio |

### Prioridad Comercial
Alertas relacionadas con operaciones estancadas o pérdida de oportunidades. Impacto en productividad y facturación.

| Alerta | Impacto |
|--------|---------|
| Vehículo inmovilizado | Capital parado y depreciación acumulada |
| Reserva vencida | Vehículo bloqueado sin avance comercial |
| Lead sin seguimiento | Oportunidad de venta perdida |
| Entrega pendiente | Cliente insatisfecho y vehículo sin liberar |

---

## CANALES POR TIPO DE ALERTA

| Alerta | Dashboard | Notificación Core | SSE | Push Web | Pantalla comercial |
|--------|-----------|-------------------|-----|----------|-------------------|
| Vehículo sin docs | ✅ | ✅ | ✅ | ❌ | ✅ (si asignado) |
| ITV caducada | ✅ | ✅ | ✅ | ✅ | ❌ |
| ITV próxima | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reserva sin contrato | ✅ | ✅ | ✅ | ❌ | ✅ |
| Reserva vencida | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venta sin cobro | ✅ | ✅ | ✅ | ✅ (si delivered) | ✅ |
| Vehículo inmovilizado | ✅ | ✅ | ✅ | ❌ | ❌ |
| Gasto sin factura | ✅ | ✅ | ❌ | ❌ | ❌ |
| Precio bajo mínimo | ✅ | ✅ | ✅ | ✅ | ✅ |
| Margen medio bajo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Lead sin seguimiento | ✅ | ✅ | ✅ | ❌ | ✅ |
| Entrega pendiente | ✅ | ✅ | ✅ | ✅ (si late) | ✅ |

---

## REFERENCIAS CRUZADAS CON OTROS TICKETS

| Ticket externo | Relación con este módulo |
|---------------|--------------------------|
| **CV-01** (Modelo cierre venta) | ACV-05 evalúa `closureData` y `paymentHistory` para detectar impagos. ACV-10 evalúa `deliveredAt` y `expectedDelivery`. |
| **CV-04** (Vehículo bloqueado) | ACV-06 complementa: si un vehículo `available` lleva 90 días, la alerta sugiere revisar precio. Si `reserved`, ACV-04 evalúa el contrato. |
| **CV-07** (Alertas cierre/entrega) | ACV-05 y ACV-10 son la versión enriquecida de las alertas de CV-07 con clasificación, escalado y routing por rol. Se deben unificar. |
| **DOC-01** (Categorías documentales) | ACV-03 usa las categorías de DOC-01 (`permiso_circulacion`, `ficha_tecnica`, etc.) para evaluar documentos faltantes por vehículo. |
| **IR-08** (Alertas backend informes) | IR-08 define alertas de margen y gasto excesivo. ACV-08 (`cv_price_below_minimum`, `cv_low_avg_margin`) cubre parcialmente. Coordinar para no duplicar. |
| **ALERTAS-DELIVERY-BACKEND** | Patrón de referencia: ACV sigue la misma arquitectura de motor + reglas + routing + SSE que ALDV. Comparten `emitGlobalAlert()` de `alertEmitter.js`. |
| **CARNICERIA-ALERTAS-BACKEND** | Patrón de referencia: ambos módulos crean un motor vertical que se integra en el `alertEngine.js` existente. Comparten `alertEmitter.js` (CARN-ALR-09). |
| **INFORMES-RENTABILIDAD-COMPRAVENTA** | ACV-06 (vehículo inmovilizado) enriquece con depreciación estimada que es la misma lógica del tab "Inventario" de informes (antigüedad de stock con impacto en margen). |

---

## NOTAS TÉCNICAS

### Naming conventions
- Archivos: `compraventaAlertEngine.js`, `compraventaAlertController.js`, `compraventaAlertRouter.js`
- Tipos de alerta: prefijo `cv_` (ej: `cv_vehicle_missing_docs`, `cv_sale_unpaid`)
- Eventos SSE: prefijo `compraventa:` (ej: `compraventa:alert`, `compraventa:alert_resolved`)
- Source en alertConstants: `'compraventa'` (añadir a `ALERT_SOURCES`)
- Categorías en `CATEGORY_TO_SOURCE`: añadir todas las categorías `cv_*` → `'compraventa'`

### Nuevas constantes a registrar en `alertConstants.js`

```javascript
// Añadir a ALERT_SOURCES:
'compraventa',

// Añadir a CATEGORY_TO_SOURCE:
cv_vehicle_missing_docs: 'compraventa',
cv_stock_itv_expired: 'compraventa',
cv_stock_itv_expiring: 'compraventa',
cv_reservation_no_contract: 'compraventa',
cv_reservation_expired: 'compraventa',
cv_sale_unpaid: 'compraventa',
cv_vehicle_stagnant: 'compraventa',
cv_expense_no_invoice: 'compraventa',
cv_price_below_minimum: 'compraventa',
cv_low_avg_margin: 'compraventa',
cv_lead_no_followup: 'compraventa',
cv_pending_delivery: 'compraventa',
```

### Eficiencia
- El motor se ejecuta dentro del ciclo existente de 60 minutos (no crea un ciclo propio).
- Los datos de vehículos ya se cargan en `runAlertsForBusiness`; solo se añaden ventas, leads y documentos al `Promise.all`.
- La deduplicación usa la misma ventana de 24h del motor genérico.
- El escalado consulta alertas previas solo para alertas `escalable: true`.

### Compatibilidad
- El motor genérico (`alertEngine.js`) sigue funcionando sin cambios para no-`carDealership`.
- Para `carDealership`: `vehicle_stock_aging` se reemplaza por `cv_vehicle_stagnant` (más granular).
- Los endpoints de `alertController.js` siguen funcionando y agregan las alertas compraventa en el summary.
- Los tipos de notificación existentes se reutilizan añadiendo `classification` como campo nuevo en metadata.

### Base de datos
- No se crean nuevas bases de datos: se leen las existentes (vehicles, sales, documents, finance, CRM/leads).
- Las alertas se persisten como notificaciones en `notifications` DB (infraestructura existente).
- Los documentos de alerta incluyen `metadata.classification` como campo nuevo.

---

## ESTIMACIÓN DE ESFUERZO

| Ticket | Nombre | Complejidad | Estimación |
|--------|--------|-------------|------------|
| ACV-01 | Configuración de alertas | Media | 2-3h |
| ACV-02 | Motor de alertas — Integración | Alta | 4-5h |
| ACV-03 | Vehículo sin documentación + ITV | Alta | 4-5h |
| ACV-04 | Reserva sin contrato + vencida | Media-Alta | 3-4h |
| ACV-05 | Venta sin cobro completo | Media-Alta | 3-4h |
| ACV-06 | Vehículo inmovilizado (30/60/90) | Media | 3-4h |
| ACV-07 | Gasto sin factura | Media | 2-3h |
| ACV-08 | Precio bajo mínimo + margen bajo | Media | 3-4h |
| ACV-09 | Lead sin seguimiento | Media | 3-4h |
| ACV-10 | Entrega pendiente | Media | 2-3h |
| ACV-11 | Priorización y clasificación | Media | 2-3h |
| ACV-12 | Routing por rol y destino | Alta | 4-5h |
| ACV-13 | Endpoints API y SSE | Alta | 4-5h |
| ACV-14 | Conexiones ecosistema | Alta | 4-5h |
| **TOTAL** | | | **~44-58h (~5-6 semanas)** |
