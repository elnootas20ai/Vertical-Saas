# ALERTAS BACKEND LIMPIEZA — Diseño de Tickets

**Módulo:** Backend — Motor de Alertas Limpieza  
**Tipo:** Backend puro (sin frontend)  
**Objetivo:** Generar alertas automáticas específicas de la vertical limpieza que detecten problemas operativos en tiempo real, los prioricen por impacto operativo o económico, y los distribuyan al dashboard, al centro de alertas core, a los responsables por rol y a la pantalla correspondiente.

---

## Estado auditado (08/07/2026)

~64% completado (61/95 criterios). Núcleo hecho: `services/cleaningAlertEngine.js` existe con ciclo de 120s, dedup de 5 min, escalado 15/30 min, las 9 reglas (ALLP-04..12), constantes/categorías en `alertConstants.js`, bloque `cleaning` en `getAlertConfig()`, arranque en `index.js`, alertas reactivas desde `cleaningController.js` (7 eventos) y los 6 endpoints del Cleaning Hub (`/api/cleaning/hub/*`, frontend alineado). Falta de verdad: resolución automática de alertas persistidas (ALLP-13), routing real por rol trabajador y push dirigido al trabajador (ALLP-14), 3 de los 5 eventos SSE (escalated/acknowledged/summary) y endpoint de acknowledge (ALLP-15), escritura del bloque `cleaning` vía PUT config (falta en `allowedKeys`), sección cleaning en el summary core y conteo en dashboard global (ALLP-18).

---

## Estado actual del sistema

### Ya implementado

**Motor de alertas genérico (`alertEngine.js`):**
- Ciclo periódico cada **60 min** (`ALERT_INTERVAL_MS = 3_600_000`).
- Reglas activas: `low_stock`, `out_of_stock`, `parts_low_stock`, `overdue_purchase`, `high_payables`, `stale_web_order`, `stale_delivery`, `vehicle_stock_aging`, `stale_work_order`, `low_sales_velocity`, `worker_no_clockin`, `contract_expiring`, `client_payment_overdue`, `negative_cash_flow`, `fleet_itv_expiring`, `fleet_insurance_expiring`, `purchase_order_delayed`.
- Deduplicación por ID diario (`alert:{category}:{dedupKey}:{fecha}`).
- Emisión: guarda notificación en CouchDB (`notifications` DB), broadcast SSE (`broadcastToUser`), push web (`sendPushToUser`).
- **No incluye ninguna regla específica de limpieza.**

**Motor de alertas delivery (`deliveryAlertEngine.js`) — Referencia de patrón:**
- Ciclo rápido cada **60 s** independiente del motor genérico.
- Deduplicación con ventana corta (5 min) vía `Map` en memoria.
- Escalado automático de prioridad (15 min → medium, 30 min → high).
- Clasificación por tipo con `defaultPriority` y `escalable`.
- Broadcast SSE por negocio (`broadcastToBusiness`).
- **Este patrón es el modelo a seguir para el motor de alertas de limpieza.**

**Infraestructura disponible:**
- **SSE:** `sseService.js` con `broadcastToUser(userId, event, data)` y `broadcastToBusiness(businessId, event, data, excludeUserId)`.
- **Push web:** `pushService.js` con `sendPushToUser(req, userId, payload)`.
- **Notificaciones:** `buildNotificationDocument` en `couchdb.js` — doc `type: 'notification'` en `NOTIFICATIONS_DB` con campos `level`, `priority`, `status`, `source`, `category`, `channels`, `assignedTo`, `entityId`, `entityType`, `route`, `metadata`.
- **Configuración alertas:** `account.alertConfig` con toggles y umbrales por usuario, gestionado en `alertController.js`.
- **Constantes:** `alertConstants.js` con `ALERT_PRIORITIES`, `ALERT_STATUSES`, `ALERT_SOURCES`, `ALERT_CHANNELS`, `CATEGORY_TO_SOURCE`.

**Vertical de limpieza (`cleaningController.js` + `cleaningRouter.js`):**
- CRUD completo de servicios (`cleaning_service`) con estados `pending → assigned → in_progress → completed → cancelled`.
- Ejecución de servicio: check-in/out, pausa/reanudación, fotos antes/después, validación, incidencias en ejecución.
- Rutas (`cleaning_route`): generación automática por trabajador/fecha, reordenación, reasignación; entradas con `estimatedStartTime`, `estimatedEndTime`, `actualStartTime`, `actualEndTime`, `travelTimeMin`, `overlap`.
- Incidencias (`cleaning_incident`): tipos `falta_limpieza`, `rotura`, `ausencia`, `queja_cliente`, `urgencia_extra`, `material_faltante`, `acceso_no_permitido`; campos `priority`, `status`, `history`.
- Función local `generateExecutionAlerts()` que detecta: `NO_CHECKIN`, `INCOMPLETE_SERVICE`, `LATE_START`, `OVERTIME`, `UNRESOLVED_INCIDENT`, `NO_PHOTOS` — pero **solo se usa en `getExecutionSummary()`**, no se integra con el motor global de alertas ni se emite por SSE/push.

**Módulos conectados (datos disponibles):**
- **Fichajes:** DB `getClockinsDbName()`, docs `type: 'clockin'` con `entries[]` (`clock_in`, `clock_out`, `totalMinutes`), `status` (`active|break|completed`).
- **Alertas de fichaje:** `clockinAlertsController.js` genera `clockin_alert` con tipos `no_clockin`, `late`, `excess_hours`, `incomplete`.
- **Materiales de limpieza:** En `couchdb.js` existen builders para `material_delivery`, `material_return`, `material_request`, `material_inventory_count` y constantes `MATERIAL_TYPES`.
- **Facturación:** `client_invoice` en `getInvoicesDbName()`; movimientos `cobro`/`pago` en `getFinanceDbName()` — regla existente `client_payment_overdue`.
- **Equipo:** `business.members[]` con `user_id`, `name`, `status`, `contractEndDate`, `role`.
- **Horarios:** DB `*-schedules` con documentos `schedule` (horario semanal por miembro).
- **Vacaciones:** DB `*-vacations` con `vacation_request`.

**Frontend Cleaning Hub (`cleaningHubApi.ts`):**
- Define tipos `CleaningAlertType`: `service_uncovered`, `worker_absent`, `clockin_pending`, `incident_open`, `material_critical`, `service_delayed`, `billing_pending`.
- Llama a endpoints **`/api/cleaning-hub/kpis|today|alerts|workers|materials|metrics/:userId`**.
- **Estos endpoints NO existen en el backend** — no hay router ni controller para `/api/cleaning-hub`.

**Controller de alertas existente (`alertController.js`):**
- `GET /api/alerts/:userId` — resumen calculado on-demand (`getAlertSummary`).
- `POST /api/alerts/:userId/check` — disparo manual del motor.
- `GET/PUT /api/alerts/:userId/config` — lectura/escritura de `alertConfig`.

### Brechas detectadas

1. **No existe motor de alertas para limpieza** — El `alertEngine.js` no importa datos de la DB de limpieza ni tiene reglas cleaning. Las alertas locales de `generateExecutionAlerts()` no se emiten a SSE/push ni se persisten en notificaciones.
2. **No hay alerta de servicio sin cubrir** — No se detecta un servicio con `status: 'pending'` sin `assignedTo` cuya fecha es hoy o mañana.
3. **No hay alerta de trabajador ausente** — No se cruzan servicios asignados del día con fichajes/check-ins para detectar ausencias.
4. **No hay alerta de fichaje pendiente** — No se verifica que el trabajador asignado haya fichado entrada en su servicio antes de la hora prevista.
5. **No hay alerta de incidencia abierta** — No se detectan `cleaning_incident` con `status !== 'resolved'` que llevan abiertas más de X horas, ni incidencias críticas recién creadas.
6. **No hay alerta de impago de cliente (en contexto limpieza)** — La regla `client_payment_overdue` existe pero es genérica. No se contextualiza por cliente de limpieza ni se vincula al contrato del servicio.
7. **No hay alerta de contrato próximo a renovar** — Los servicios de limpieza con recurrencia y fecha de fin de contrato/recurrencia no generan alerta de renovación.
8. **No hay alerta de material crítico** — No se cruza el stock de materiales de limpieza con los servicios planificados para detectar insuficiencia.
9. **No hay alerta de retraso en ruta** — Las rutas tienen `estimatedStartTime` y `actualStartTime` pero no se comparan en tiempo real para detectar retrasos acumulados.
10. **No hay alerta de exceso de horas** — No se acumula el tiempo trabajado (check-in/out de servicios + fichajes) para detectar exceso sobre la jornada legal/contractual.
11. **El ciclo de 60 min es demasiado lento para limpieza** — Un servicio sin cubrir a las 8:00 necesita alerta antes de las 7:30, no en la próxima ejecución del motor genérico.
12. **No hay routing por rol** — Las alertas genéricas van al `userId` del owner. No se envían alertas operativas al trabajador ni alertas de rentabilidad al gerente de forma diferenciada.
13. **No existen los endpoints `/api/cleaning-hub/*`** — El frontend los llama pero el backend devuelve 404.
14. **No hay categorías de limpieza en `alertConstants.js`** — No existen las categorías `cleaning_*` en `CATEGORY_TO_SOURCE`.
15. **No hay bloque `cleaning` en `getAlertConfig()`** — La configuración de alertas no tiene toggles ni umbrales para la vertical de limpieza.

---

## TICKETS

---

### TICKET ALLP-01: Constantes y categorías — Registro de alertas de limpieza

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

**Descripción:**  
Registrar todas las categorías de alerta de limpieza en `alertConstants.js` y añadir `'limpieza'` como fuente válida en el sistema. Esto es la base sobre la que se construyen todos los demás tickets.

**Tareas:**

1. **Añadir `'limpieza'` a `ALERT_SOURCES` en `alertConstants.js`:**

   ```javascript
   export const ALERT_SOURCES = [
     'finanzas',
     'stock',
     'equipo',
     'documentacion',
     'verticales',
     'delivery',
     'limpieza',       // ← NUEVO
     'ocr',
     'conciliacion',
     'crm',
     'taller',
     'sistema',
   ];
   ```

2. **Añadir categorías cleaning a `CATEGORY_TO_SOURCE`:**

   ```javascript
   // Limpieza
   cleaning_service_uncovered: 'limpieza',
   cleaning_worker_absent: 'limpieza',
   cleaning_clockin_pending: 'limpieza',
   cleaning_incident_open: 'limpieza',
   cleaning_incident_critical: 'limpieza',
   cleaning_client_unpaid: 'limpieza',
   cleaning_contract_renewal: 'limpieza',
   cleaning_material_critical: 'limpieza',
   cleaning_material_depleted: 'limpieza',
   cleaning_route_delayed: 'limpieza',
   cleaning_excess_hours: 'limpieza',
   cleaning_service_overtime: 'limpieza',
   cleaning_no_photos: 'limpieza',
   cleaning_incomplete_checklist: 'limpieza',
   ```

3. **Documentar clasificación inicial de alertas:**

   | Categoría | Prioridad default | Escalable | Impacto |
   |-----------|-------------------|-----------|---------|
   | `cleaning_service_uncovered` | high | No | Operativo — servicio no se realiza |
   | `cleaning_worker_absent` | high | No | Operativo — trabajador no se presenta |
   | `cleaning_clockin_pending` | medium | Sí (→ high a los 15 min) | Operativo — fichaje no realizado |
   | `cleaning_incident_critical` | high | No | Operativo — incidencia grave abierta |
   | `cleaning_incident_open` | medium | Sí (→ high a las 4h) | Operativo — incidencia sin resolver |
   | `cleaning_client_unpaid` | medium | Sí (→ high a los 30 días) | Económico — impago de cliente |
   | `cleaning_contract_renewal` | medium | Sí (→ high a 7 días de vencimiento) | Económico — contrato expira |
   | `cleaning_material_critical` | medium | Sí (→ high si agotado) | Operativo — material insuficiente |
   | `cleaning_material_depleted` | high | No | Operativo — material agotado |
   | `cleaning_route_delayed` | medium | Sí (→ high a los 30 min) | Operativo — retraso acumulado |
   | `cleaning_excess_hours` | medium | Sí (→ high si > 120%) | Legal/económico — exceso jornada |
   | `cleaning_service_overtime` | low | Sí | Informativo — servicio duró más |
   | `cleaning_no_photos` | low | No | Calidad — sin evidencia fotográfica |
   | `cleaning_incomplete_checklist` | low | Sí | Calidad — tareas sin completar |

**Criterios de aceptación:**
- [x] `alertConstants.js` exporta las nuevas categorías y fuente `limpieza`.
- [x] `deriveSourceFromCategory('cleaning_service_uncovered')` devuelve `'limpieza'`.
- [x] `normalizeSource('limpieza')` devuelve `'limpieza'`.
- [x] El sistema arranca sin errores.

---

### TICKET ALLP-02: Modelo de datos — Configuración de alertas de limpieza

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-01

**Descripción:**  
Extender `getAlertConfig()` en `alertEngine.js` con un bloque `cleaning` que contenga todos los toggles y umbrales configurables para las alertas de la vertical limpieza. Esta configuración se almacena en `account.alertConfig` (existente) añadiendo el bloque `cleaning`.

**Tareas:**

1. **Ampliar `getAlertConfig()` en `alertEngine.js` con bloque `cleaning`:**

   ```javascript
   cleaning: {
     // ── Activación global ──
     enabled: cfg.cleaning?.enabled !== false,

     // ── Servicio sin cubrir ──
     serviceUncoveredEnabled: cfg.cleaning?.serviceUncoveredEnabled !== false,
     serviceUncoveredHoursBefore: Number(cfg.cleaning?.serviceUncoveredHoursBefore || 2),

     // ── Trabajador ausente ──
     workerAbsentEnabled: cfg.cleaning?.workerAbsentEnabled !== false,
     workerAbsentGraceMinutes: Number(cfg.cleaning?.workerAbsentGraceMinutes || 15),

     // ── Fichaje pendiente ──
     clockinPendingEnabled: cfg.cleaning?.clockinPendingEnabled !== false,
     clockinPendingMinutesBefore: Number(cfg.cleaning?.clockinPendingMinutesBefore || 10),

     // ── Incidencia abierta ──
     incidentOpenEnabled: cfg.cleaning?.incidentOpenEnabled !== false,
     incidentOpenEscalationHours: Number(cfg.cleaning?.incidentOpenEscalationHours || 4),
     incidentCriticalTypes: cfg.cleaning?.incidentCriticalTypes || [
       'ausencia', 'urgencia_extra', 'acceso_no_permitido',
     ],

     // ── Impago de cliente ──
     clientUnpaidEnabled: cfg.cleaning?.clientUnpaidEnabled !== false,
     clientUnpaidGraceDays: Number(cfg.cleaning?.clientUnpaidGraceDays || 15),
     clientUnpaidHighThresholdDays: Number(cfg.cleaning?.clientUnpaidHighThresholdDays || 30),

     // ── Contrato próximo a renovar ──
     contractRenewalEnabled: cfg.cleaning?.contractRenewalEnabled !== false,
     contractRenewalDays: Number(cfg.cleaning?.contractRenewalDays || 30),
     contractRenewalHighDays: Number(cfg.cleaning?.contractRenewalHighDays || 7),

     // ── Material crítico ──
     materialCriticalEnabled: cfg.cleaning?.materialCriticalEnabled !== false,
     materialCriticalDaysLookahead: Number(cfg.cleaning?.materialCriticalDaysLookahead || 7),

     // ── Retraso en ruta ──
     routeDelayEnabled: cfg.cleaning?.routeDelayEnabled !== false,
     routeDelayThresholdMinutes: Number(cfg.cleaning?.routeDelayThresholdMinutes || 15),
     routeDelayHighMinutes: Number(cfg.cleaning?.routeDelayHighMinutes || 30),

     // ── Exceso de horas ──
     excessHoursEnabled: cfg.cleaning?.excessHoursEnabled !== false,
     excessHoursWeeklyMax: Number(cfg.cleaning?.excessHoursWeeklyMax || 40),
     excessHoursDailyMax: Number(cfg.cleaning?.excessHoursDailyMax || 10),
     excessHoursWarningPercent: Number(cfg.cleaning?.excessHoursWarningPercent || 90),

     // ── Calidad (alertas informativas) ──
     noPhotosEnabled: cfg.cleaning?.noPhotosEnabled ?? false,
     incompleteChecklistEnabled: cfg.cleaning?.incompleteChecklistEnabled ?? false,
     serviceOvertimeEnabled: cfg.cleaning?.serviceOvertimeEnabled !== false,
     serviceOvertimeThresholdMinutes: Number(cfg.cleaning?.serviceOvertimeThresholdMinutes || 30),

     // ── Motor (intervalo en segundos) ──
     engineIntervalSeconds: Number(cfg.cleaning?.engineIntervalSeconds || 120),
   }
   ```

2. **Actualizar `allowedKeys` en `alertController.js` → `updateAlertSettings()`:**
   - Añadir `cleaning` como clave permitida (objeto completo).
   - Validar tipos: booleanos deben ser booleanos, números deben ser positivos, arrays deben contener strings válidos.
   - Merge profundo: `{ ...current.cleaning, ...body.cleaning }` para no borrar claves no enviadas.

3. **Actualizar `getAlertSummary()` en `alertEngine.js`:**
   - Incluir sección `cleaning` en la respuesta del summary con los conteos de cada tipo de alerta activa de limpieza.

4. **Defaults inteligentes:**
   - Si el negocio tiene servicios en la DB de limpieza (`getCleaningDbName()`), activar `cleaning.enabled: true` por defecto.
   - Si no hay datos de limpieza, mantener `cleaning.enabled: false` para no evaluar reglas innecesarias.

**Criterios de aceptación:**
- [ ] La configuración se lee y escribe correctamente vía `GET/PUT /api/alerts/:userId/config`. *(lectura sí — bloque `cleaning` en `getAlertConfig()` —, pero `allowedKeys` de `updateAlertSettings()` no incluye `cleaning`, así que no se puede escribir)*
- [x] Los defaults se aplican automáticamente si no hay configuración previa.
- [x] La migración es suave: cuentas sin bloque `cleaning` obtienen defaults sensatos.
- [ ] Validación de tipos en la escritura.
- [x] Un negocio sin vertical de limpieza no ejecuta reglas cleaning. *(`canEmitCleaningAlerts()` de `moduleAlertUtils.js`)*

---

### TICKET ALLP-03: Motor de alertas de limpieza — Ciclo rápido independiente

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-01, ALLP-02

**Descripción:**  
Crear un ciclo de evaluación rápido (cada 120 segundos por defecto, configurable) exclusivo para alertas de limpieza, separado del motor genérico de 60 minutos. Este motor revisa las condiciones operativas del día y emite alertas con prioridad y escalado. Sigue el patrón de `deliveryAlertEngine.js`.

**Tareas:**

1. **Crear `services/cleaningAlertEngine.js`:**

   ```javascript
   const TAG = 'CLEANING_ALERT_ENGINE';
   const DEFAULT_INTERVAL_MS = 120_000;
   const STARTUP_DELAY_MS = 25_000;
   const DEDUP_WINDOW_MS = 5 * 60_000;
   const ESCALATION_MEDIUM_MS = 15 * 60_000;
   const ESCALATION_HIGH_MS = 30 * 60_000;

   export function startCleaningAlertEngine() { ... }
   export function stopCleaningAlertEngine() { ... }
   export async function runCleaningAlerts() { ... }
   export async function getCleaningAlertSummary(userId) { ... }
   export async function triggerReactiveCleaningAlert(userId, eventType, payload) { ... }
   ```

2. **Método `runCleaningAlerts()`:**
   - Obtener todos los businesses con datos en la DB de limpieza.
   - Para cada business con `cleaning.enabled: true`:
     a. Obtener configuración de alertas cleaning (ALLP-02).
     b. Cargar servicios del día y de mañana (`cleaning_service`).
     c. Cargar rutas activas del día (`cleaning_route` con `status: 'active'`).
     d. Cargar incidencias abiertas (`cleaning_incident` con `status ∉ {resolved, cancelled}`).
     e. Cargar fichajes del día (`clockin` docs).
     f. Cargar materiales de limpieza con stock.
     g. Cargar movimientos financieros/facturas del cliente (para impagos).
     h. Cargar miembros del equipo (`business.members`).
     i. Ejecutar cada regla (ALLP-04 a ALLP-12).
     j. Emitir alertas via `emitGlobalAlert()`.

3. **Deduplicación con ventana corta:**
   - Ventana de 5 minutos (no 24h como el motor genérico).
   - `Map` en memoria para la dedup rápida.
   - Limpiar entradas del Map cada 30 minutos.

4. **Escalado automático de prioridad:**
   - Mismo patrón que `deliveryAlertEngine.js`: `Map<alertKey, firstSeenAt>`.
   - Si alerta `escalable: true` lleva activa > `ESCALATION_MEDIUM_MS` → subir un nivel.
   - Si prioridad `high` lleva activa > `ESCALATION_HIGH_MS` → marcar `escalated: true` y notificación adicional al owner.

5. **Clasificación de alertas:**

   ```javascript
   const ALERT_CLASSIFICATION = {
     cleaning_service_uncovered:     { defaultPriority: 'high',   escalable: false },
     cleaning_worker_absent:         { defaultPriority: 'high',   escalable: false },
     cleaning_clockin_pending:       { defaultPriority: 'medium', escalable: true  },
     cleaning_incident_critical:     { defaultPriority: 'high',   escalable: false },
     cleaning_incident_open:         { defaultPriority: 'medium', escalable: true  },
     cleaning_client_unpaid:         { defaultPriority: 'medium', escalable: true  },
     cleaning_contract_renewal:      { defaultPriority: 'medium', escalable: true  },
     cleaning_material_critical:     { defaultPriority: 'medium', escalable: true  },
     cleaning_material_depleted:     { defaultPriority: 'high',   escalable: false },
     cleaning_route_delayed:         { defaultPriority: 'medium', escalable: true  },
     cleaning_excess_hours:          { defaultPriority: 'medium', escalable: true  },
     cleaning_service_overtime:      { defaultPriority: 'low',    escalable: true  },
     cleaning_no_photos:             { defaultPriority: 'low',    escalable: false },
     cleaning_incomplete_checklist:  { defaultPriority: 'low',    escalable: true  },
   };
   ```

6. **Integración con `index.js`:**
   - Importar `startCleaningAlertEngine` y arrancarlo en el startup (después de `startAlertEngine`).
   - Detener en shutdown con `stopCleaningAlertEngine`.
   - Timer: `startCleaningAlertEngine()` a los ~25s del arranque, luego cada `engineIntervalSeconds`.

7. **Observabilidad:**
   - Log `logger.info` con tag `CLEANING_ALERT_ENGINE` cada ciclo si hay alertas generadas.
   - Log `logger.warn` si el ciclo tarda > 10s.
   - Health check: si el ciclo no se ejecuta en 5 min, registrar warning.

**Criterios de aceptación:**
- [x] El motor arranca automáticamente con el servidor. *(`startCleaningAlertEngine()` en `index.js`)*
- [ ] El ciclo se ejecuta cada 120 segundos (configurable vía `alertConfig.cleaning.engineIntervalSeconds`). *(ciclo fijo de 120s; `engineIntervalSeconds` se lee en config pero el scheduler no lo usa)*
- [x] La deduplicación impide alertas repetidas en ventanas de 5 minutos.
- [x] El escalado automático de prioridad funciona a los 15 y 30 minutos. *(`applyEscalation()`)*
- [ ] El motor no bloquea ni degrada el rendimiento del servidor Express. *(no verificado con carga)*
- [x] Solo evalúa businesses con `cleaning.enabled: true`.
- [x] Se puede detener y reiniciar sin pérdida de estado. *(`stopCleaningAlertEngine()`)*

---

### TICKET ALLP-04: Regla — Servicio sin cubrir

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar servicios de limpieza con fecha de hoy o mañana que no tienen trabajador asignado (`assignedTo` vacío o nulo, o `status === 'pending'`). Un servicio sin cubrir es la alerta más crítica porque implica que un cliente no recibirá el servicio.

**Lógica de detección:**

```
Para cada cleaning_service con date === hoy o date === mañana:
  Si status === 'pending' y (!assignedTo o assignedTo === ''):
    horasHastaServicio = (fecha+hora servicio - now) en horas

    Si date === hoy y horasHastaServicio <= 0:
      → prioridad ALTA, "Servicio ahora sin trabajador asignado"
    Si date === hoy y horasHastaServicio <= serviceUncoveredHoursBefore:
      → prioridad ALTA, "Servicio en Xh sin trabajador asignado"
    Si date === mañana:
      → prioridad MEDIA, "Servicio mañana sin trabajador asignado"
```

**Tareas:**

1. **Implementar `checkServiceUncovered(ctx, services, config)` en `cleaningAlertEngine.js`:**
   - Filtrar servicios con `status === 'pending'` y sin `assignedTo`.
   - Calcular horas restantes hasta el servicio.
   - Generar alerta tipo `cleaning_service_uncovered`:
     ```javascript
     {
       category: 'cleaning_service_uncovered',
       source: 'limpieza',
       level: 'alert',
       title: 'Servicio sin cubrir',
       message: `Servicio ${svc.serviceNumber} para ${svc.clientName} (${svc.date} ${svc.time}) no tiene trabajador asignado.`,
       entityId: svc._id,
       entityType: 'cleaning_service',
       route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
       metadata: {
         serviceNumber: svc.serviceNumber,
         clientName: svc.clientName,
         address: svc.address,
         date: svc.date,
         time: svc.time,
         hoursUntilService: horasHastaServicio,
         cleaningType: svc.cleaningType,
       },
       dedupKey: `uncovered-${svc._id}`,
     }
     ```

2. **También detectar servicios con trabajador asignado pero cancelado/inactivo:**
   - Si `assignedTo` apunta a un miembro con `status === 'inactive'` en `business.members` → tratar como sin cubrir.
   - Si el trabajador tiene una `vacation_request` aprobada para esa fecha → tratar como sin cubrir.

3. **Destinatarios:**
   - Gerente/owner: siempre.
   - El propio trabajador: nunca (no tiene asignación).

**Criterios de aceptación:**
- [x] Se detectan servicios de hoy y mañana sin trabajador asignado.
- [x] La prioridad es alta si el servicio es hoy y queda poco tiempo.
- [ ] Se detectan servicios cuyo trabajador asignado está inactivo o de vacaciones. *(no se cruzan `business.members.status` ni `vacation_request`)*
- [x] La alerta incluye datos del servicio (número, cliente, dirección, hora).
- [x] Se navega al servicio afectado desde la alerta.

---

### TICKET ALLP-05: Regla — Trabajador ausente

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar trabajadores que tienen servicios asignados hoy pero no han realizado el check-in en su primer servicio del día tras el periodo de gracia configurado. Distingue entre un retraso (fichaje tardío) y una ausencia real (sin fichaje alguno y sin respuesta).

**Lógica de detección:**

```
Para cada trabajador con servicios asignados hoy:
  primerServicio = servicio con hora más temprana de hoy
  horaPrevista = primerServicio.date + primerServicio.time
  
  Si now > horaPrevista + workerAbsentGraceMinutes:
    Si primerServicio.execution.checkInAt existe:
      → No alertar (fichó aunque tarde — cubierto por ALLP-06)
    Si primerServicio.execution.status === 'not_started':
      // Verificar fichaje de empresa (clockin genérico)
      Si NO hay clockin del día para este user_id:
        → prioridad ALTA — "Trabajador ausente sin fichaje"
      Si hay clockin pero no check-in en servicio:
        → prioridad MEDIA — "Trabajador fichó en empresa pero no en servicio"
```

**Tareas:**

1. **Implementar `checkWorkerAbsent(ctx, services, clockins, members, config)` en `cleaningAlertEngine.js`:**
   - Agrupar servicios del día por `assignedTo`.
   - Para cada trabajador, obtener su primer servicio.
   - Verificar si hay check-in en la ejecución del servicio.
   - Verificar si hay clockin general del día.
   - Generar alerta tipo `cleaning_worker_absent`:
     ```javascript
     {
       category: 'cleaning_worker_absent',
       source: 'limpieza',
       level: 'alert',
       title: 'Trabajador ausente',
       message: `${workerName} no se ha presentado. Servicio ${svc.serviceNumber} para ${svc.clientName} a las ${svc.time} sin cubrir.`,
       entityId: svc.assignedTo,
       entityType: 'team_member',
       route: '/saas/clockins',
       metadata: {
         workerId: svc.assignedTo,
         workerName: svc.assignedToName,
         serviceId: svc._id,
         serviceNumber: svc.serviceNumber,
         clientName: svc.clientName,
         scheduledTime: svc.time,
         hasGeneralClockin: hasGeneralClockin,
         minutesOverdue: minutesLate,
         affectedServices: servicesOfWorkerToday.length,
       },
       dedupKey: `absent-${svc.assignedTo}-${today}`,
     }
     ```

2. **Impacto: calcular servicios afectados:**
   - Si un trabajador está ausente, todos sus servicios del día quedan comprometidos.
   - Incluir en `metadata.affectedServices` el número total de servicios.
   - Incluir en `metadata.affectedClients` los nombres de los clientes afectados.

3. **Destinatarios:**
   - Gerente/owner: siempre.
   - El propio trabajador: enviar push "¿Estás en camino? Tu servicio en {cliente} empezaba a las {hora}".

**Criterios de aceptación:**
- [x] Se detectan trabajadores que no se presentan tras la gracia.
- [x] Se distingue entre ausencia total (sin clockin) y ausencia parcial (clockin pero no check-in).
- [ ] Se calculan los servicios y clientes afectados. *(`affectedServices` sí; `affectedClients` no)*
- [ ] Se envía push al trabajador ausente como recordatorio. *(el motor no usa `sendPushToUser`; solo SSE)*
- [x] Se envía alerta al gerente con el impacto completo.

---

### TICKET ALLP-06: Regla — Fichaje pendiente (check-in no realizado)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar servicios asignados cuya hora de inicio se acerca y el trabajador aún no ha realizado el check-in. Es una alerta preventiva que se dispara ANTES de que el servicio debería haber empezado, para dar margen de reacción.

**Lógica de detección:**

```
Para cada cleaning_service con date === hoy y status === 'assigned':
  horaServicio = date + time
  minutosRestantes = (horaServicio - now) en minutos

  Si minutosRestantes <= clockinPendingMinutesBefore y minutosRestantes > 0:
    Si execution.status === 'not_started' y no hay check-in:
      → prioridad MEDIA — "Fichaje pendiente, servicio empieza en X min"

  Si minutosRestantes <= 0 y minutosRestantes > -workerAbsentGraceMinutes:
    Si execution.status === 'not_started':
      → prioridad MEDIA — "Hora de inicio pasada, fichaje pendiente"
      (Después de la gracia, ALLP-05 toma el relevo con prioridad ALTA)
```

**Tareas:**

1. **Implementar `checkClockinPending(ctx, services, config)` en `cleaningAlertEngine.js`:**
   - Filtrar servicios de hoy con `status === 'assigned'` y `execution.status === 'not_started'`.
   - Calcular minutos restantes hasta la hora del servicio.
   - Generar alerta tipo `cleaning_clockin_pending`:
     ```javascript
     {
       category: 'cleaning_clockin_pending',
       source: 'limpieza',
       level: 'warning',
       title: 'Fichaje pendiente',
       message: `${svc.assignedToName} no ha fichado entrada. Servicio ${svc.serviceNumber} en ${svc.clientName} empieza en ${minutosRestantes} min.`,
       entityId: svc._id,
       entityType: 'cleaning_service',
       route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
       metadata: {
         workerId: svc.assignedTo,
         workerName: svc.assignedToName,
         serviceNumber: svc.serviceNumber,
         clientName: svc.clientName,
         scheduledTime: svc.time,
         minutesUntilStart: minutosRestantes,
       },
       dedupKey: `clockin-${svc._id}`,
     }
     ```

2. **Escalado:**
   - Si la alerta lleva activa > 15 min → escalar a prioridad HIGH (esto ocurre automáticamente por el sistema de escalado de ALLP-03).
   - Cuando `minutosRestantes < -workerAbsentGraceMinutes`, la regla de ausencia (ALLP-05) toma el control.

3. **Destinatarios:**
   - Gerente: siempre.
   - Trabajador: enviar push "Recuerda fichar entrada para tu servicio en {cliente} a las {hora}".

**Criterios de aceptación:**
- [x] Se detectan servicios cuyo check-in no se ha realizado a X minutos del inicio.
- [x] La alerta es preventiva (antes de la hora del servicio).
- [ ] Se envía push al trabajador como recordatorio.
- [x] No se duplica con ALLP-05 (son complementarias por ventana temporal).

---

### TICKET ALLP-07: Regla — Incidencia abierta / Incidencia crítica

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar incidencias de limpieza (`cleaning_incident`) que están abiertas sin resolver y escalar según antigüedad y tipo. Las incidencias de tipo crítico generan alerta inmediata; las no críticas escalan tras X horas sin resolución.

**Lógica de detección:**

```
Para cada cleaning_incident con status ∈ {open, in_progress, pending}:
  horasAbierta = (now - createdAt) en horas

  Si incidentType ∈ incidentCriticalTypes:
    → prioridad ALTA inmediata — "Incidencia crítica abierta"

  Si horasAbierta >= incidentOpenEscalationHours × 2:
    → prioridad ALTA — "Incidencia sin resolver desde hace X horas"
  Si horasAbierta >= incidentOpenEscalationHours:
    → prioridad MEDIA — "Incidencia abierta desde hace X horas"
  Si horasAbierta < incidentOpenEscalationHours:
    → prioridad BAJA (informativa)
```

**Tareas:**

1. **Implementar `checkIncidentsOpen(ctx, incidents, config)` en `cleaningAlertEngine.js`:**
   - Filtrar incidencias abiertas (no resueltas ni canceladas).
   - Clasificar por tipo (crítica vs normal) y antigüedad.
   - Generar dos tipos de alerta:
     - `cleaning_incident_critical` para tipos críticos.
     - `cleaning_incident_open` para incidencias que superan el umbral de horas.

   ```javascript
   // Incidencia crítica
   {
     category: 'cleaning_incident_critical',
     source: 'limpieza',
     level: 'alert',
     title: 'Incidencia crítica abierta',
     message: `Incidencia ${inc.incidentNumber} (${inc.incidentType}) en servicio para ${inc.clientName}. Prioridad: ${inc.priority}.`,
     entityId: inc._id,
     entityType: 'cleaning_incident',
     route: `/saas/vertical/limpieza/incidencias?incidentId=${inc._id}`,
     metadata: {
       incidentNumber: inc.incidentNumber,
       incidentType: inc.incidentType,
       priority: inc.priority,
       clientName: inc.clientName,
       workerName: inc.workerName,
       serviceId: inc.serviceId,
       hoursOpen: horasAbierta,
       description: inc.description?.slice(0, 200),
     },
     dedupKey: `incident-${inc._id}`,
   }
   ```

2. **También detectar incidencias de ejecución sin resolver:**
   - Buscar `cleaning_service` con `execution.incidents[]` donde algún incident tenga `resolvedAt === ''`.
   - Si el servicio ya está completado (`execution.status === 'completed'`) y hay incidencias sin resolver → alerta `cleaning_incident_open`.

3. **Destinatarios:**
   - Gerente/owner: siempre.
   - Trabajador asignado al servicio: si hay `workerId` en la incidencia.

**Criterios de aceptación:**
- [x] Incidencias de tipos críticos generan alerta inmediata con prioridad alta.
- [x] Incidencias normales escalan según las horas sin resolución.
- [ ] Se detectan también incidencias de ejecución sin resolver en servicios completados. *(solo se evalúan docs `cleaning_incident`, no `execution.incidents[]`)*
- [x] La alerta enlaza directamente a la incidencia.
- [ ] Se incluyen datos relevantes: tipo, prioridad, cliente, trabajador, descripción truncada. *(todo salvo la descripción truncada)*

---

### TICKET ALLP-08: Regla — Cliente con impago

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar clientes de limpieza con facturas o cobros pendientes que superan el periodo de gracia. Esta alerta contextualiza el impago dentro de la vertical de limpieza: vincula el impago al servicio recurrente del cliente y calcula el riesgo de continuar prestando el servicio sin cobro.

**Lógica de detección:**

```
Para cada cliente con servicios de limpieza activos (recurrentes o planificados):
  Buscar en financeDocs (tipo 'cobro') los cobros con status 'pending' y dueDate vencido
  Buscar en invoices (tipo 'client_invoice') las facturas impagadas

  Si díasDeRetraso >= clientUnpaidHighThresholdDays (default 30):
    → prioridad ALTA — "Impago grave: X días, Y€ pendiente"
  Si díasDeRetraso >= clientUnpaidGraceDays (default 15):
    → prioridad MEDIA — "Impago de cliente: X días"
```

**Tareas:**

1. **Implementar `checkClientUnpaid(ctx, services, financeDocs, invoices, config)` en `cleaningAlertEngine.js`:**
   - Obtener la lista de clientes únicos con servicios activos de limpieza.
   - Para cada cliente, buscar cobros/facturas pendientes vencidos.
   - Calcular importe total pendiente y días de retraso máximo.
   - Generar alerta tipo `cleaning_client_unpaid`:
     ```javascript
     {
       category: 'cleaning_client_unpaid',
       source: 'limpieza',
       level: daysLate > 30 ? 'alert' : 'warning',
       title: 'Cliente con impago',
       message: `${clientName} tiene ${totalPending.toFixed(2)}€ pendientes desde hace ${daysLate} días. Servicios activos: ${activeServicesCount}.`,
       entityId: clientId || clientName,
       entityType: 'client',
       route: '/saas/finance',
       metadata: {
         clientName,
         totalPending,
         daysLate,
         activeServicesCount,
         unpaidInvoices: unpaidInvoices.map(i => ({
           id: i._id,
           number: i.invoiceNumber,
           amount: i.total,
           dueDate: i.dueDate,
         })),
         nextScheduledService: nextService?.date,
       },
       dedupKey: `unpaid-${clientName}-${ctx.businessId}`,
     }
     ```

2. **Enriquecimiento con datos de servicios:**
   - Incluir cuántos servicios activos/recurrentes tiene el cliente.
   - Incluir la fecha del próximo servicio planificado.
   - Calcular el riesgo: `totalPending / facturación mensual del cliente`.

3. **Destinatarios:**
   - Gerente/owner: siempre (alerta económica).
   - Trabajador: nunca (no debe saber del impago).

**Criterios de aceptación:**
- [x] Se detectan clientes con impago que tienen servicios de limpieza activos.
- [x] Se calcula el importe total pendiente y los días de retraso.
- [x] La prioridad escala según los días de retraso.
- [ ] Se incluyen datos de facturas impagadas y próximos servicios. *(`unpaidItems` sí; `nextScheduledService` no)*
- [ ] Solo el gerente recibe esta alerta. *(`targetRoles` va en metadata pero el SSE es `broadcastToBusiness` sin filtrado backend por rol)*

---

### TICKET ALLP-09: Regla — Contrato próximo a renovar

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar servicios de limpieza con recurrencia cuya fecha de fin de contrato/recurrencia está próxima. Un contrato que vence sin renovación implica pérdida de cliente e ingresos. También detectar contratos laborales de trabajadores del equipo de limpieza próximos a vencer.

**Lógica de detección:**

```
// Contratos de servicio (recurrencia con fecha fin)
Para cada cleaning_service con recurrence.type !== 'none':
  Si recurrence.endDate existe:
    díasParaVencer = (endDate - now) en días

    Si díasParaVencer <= contractRenewalHighDays (default 7):
      → prioridad ALTA — "Contrato vence en X días"
    Si díasParaVencer <= contractRenewalDays (default 30):
      → prioridad MEDIA — "Contrato próximo a renovar"
    Si díasParaVencer <= 0:
      → prioridad ALTA — "Contrato vencido hace X días"

// Contratos laborales de trabajadores asignados a limpieza
Para cada miembro del equipo con servicios de limpieza asignados:
  Si member.contractEndDate existe:
    díasParaVencer = (contractEndDate - now) en días
    Si díasParaVencer <= contractRenewalHighDays:
      → prioridad ALTA — "Contrato laboral vence en X días"
    Si díasParaVencer <= contractRenewalDays:
      → prioridad MEDIA — "Contrato laboral próximo a vencer"
```

**Tareas:**

1. **Implementar `checkContractRenewal(ctx, services, members, config)` en `cleaningAlertEngine.js`:**
   - Buscar servicios recurrentes con `recurrence.endDate` próximo.
   - Buscar miembros del equipo con `contractEndDate` próximo que tengan servicios de limpieza asignados.
   - Generar alertas:

   ```javascript
   // Contrato de servicio
   {
     category: 'cleaning_contract_renewal',
     source: 'limpieza',
     level: daysLeft <= 7 ? 'alert' : 'warning',
     title: 'Contrato próximo a renovar',
     message: `El servicio recurrente para ${svc.clientName} (${svc.cleaningType}) vence en ${daysLeft} días (${svc.recurrence.endDate}).`,
     entityId: svc._id,
     entityType: 'cleaning_service',
     route: `/saas/vertical/limpieza/servicios?serviceId=${svc._id}`,
     metadata: {
       serviceNumber: svc.serviceNumber,
       clientName: svc.clientName,
       cleaningType: svc.cleaningType,
       recurrenceType: svc.recurrence.type,
       endDate: svc.recurrence.endDate,
       daysUntilExpiry: daysLeft,
       monthlyRevenue: estimatedMonthlyRevenue,
     },
     dedupKey: `renewal-${svc._id}`,
   }

   // Contrato laboral
   {
     category: 'cleaning_contract_renewal',
     source: 'limpieza',
     level: daysLeft <= 7 ? 'alert' : 'warning',
     title: 'Contrato laboral próximo a vencer',
     message: `El contrato de ${member.name} vence en ${daysLeft} días (${member.contractEndDate}). Tiene ${assignedServicesCount} servicios asignados.`,
     entityId: member.user_id,
     entityType: 'team_member',
     route: '/saas/team',
     metadata: {
       memberName: member.name,
       contractEndDate: member.contractEndDate,
       daysUntilExpiry: daysLeft,
       assignedServicesCount,
     },
     dedupKey: `contract-${member.user_id}`,
   }
   ```

2. **Cálculo de impacto económico:**
   - Para contratos de servicio: estimar ingresos mensuales del servicio recurrente (`price × frecuencia`).
   - Incluir en `metadata.monthlyRevenue` para que el gerente valore la urgencia.

3. **Destinatarios:**
   - Gerente/owner: siempre (decisión comercial/laboral).
   - Trabajador: solo si es su propio contrato laboral.

**Criterios de aceptación:**
- [x] Se detectan servicios recurrentes con fecha de fin próxima.
- [x] Se detectan contratos laborales de trabajadores de limpieza próximos a vencer.
- [x] La prioridad escala según los días restantes.
- [ ] Se incluye el impacto económico (ingresos mensuales en riesgo). *(sin `monthlyRevenue` en metadata)*
- [x] Se diferencia entre contrato de servicio y contrato laboral.

---

### TICKET ALLP-10: Regla — Material crítico / Material agotado

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar materiales de limpieza cuyo stock es insuficiente para cubrir los servicios planificados de los próximos días. Cruza el inventario actual con la demanda estimada basándose en los servicios planificados y el consumo medio por servicio.

**Lógica de detección:**

```
Para cada material de limpieza (catalog_item con subtype 'cleaning_material'):
  stockActual = stockQuantity
  serviciosProximos = servicios planificados en los próximos materialCriticalDaysLookahead días
  consumoEstimado = serviciosProximos.length × averageConsumptionPerService (o fallback: 1)
  cobertura = stockActual / max(consumoEstimado, 1)

  Si stockActual <= 0:
    → prioridad ALTA — "Material agotado"  (cleaning_material_depleted)
  Si stockActual > 0 y stockActual <= minStock:
    → prioridad MEDIA — "Material bajo mínimo" (cleaning_material_critical)
  Si cobertura < 1 (stock insuficiente para cubrir servicios planificados):
    → prioridad MEDIA — "Material insuficiente para X servicios"

  Si material.minStock > 0 y no existe catalog_item con subtype 'cleaning_material':
    // Fallback: revisar catalog_items genéricos marcados como materiales de limpieza
    Misma lógica con stockQuantity y minStock
```

**Tareas:**

1. **Implementar `checkMaterialCritical(ctx, materials, services, config)` en `cleaningAlertEngine.js`:**
   - Obtener materiales de limpieza (con `subtype === 'cleaning_material'` o de `MATERIAL_TYPES`).
   - Contar servicios planificados en los próximos N días.
   - Calcular cobertura estimada.
   - Generar alertas:

   ```javascript
   // Material agotado
   {
     category: 'cleaning_material_depleted',
     source: 'limpieza',
     level: 'alert',
     title: 'Material de limpieza agotado',
     message: `"${material.name}" está agotado. Hay ${upcomingServicesCount} servicios planificados en los próximos ${config.materialCriticalDaysLookahead} días.`,
     entityId: material._id,
     entityType: 'catalog_item',
     route: '/saas/vertical/limpieza/materiales',
     metadata: {
       materialName: material.name,
       sku: material.sku,
       stockQuantity: 0,
       minStock: material.minStock,
       upcomingServicesCount,
       coverageDays: 0,
     },
     dedupKey: `matdepleted-${material._id}`,
   }

   // Material bajo mínimo
   {
     category: 'cleaning_material_critical',
     source: 'limpieza',
     level: 'warning',
     title: 'Material de limpieza bajo mínimo',
     message: `"${material.name}" tiene ${stockActual} ${material.unit || 'ud'} (mínimo: ${material.minStock}). Cobertura estimada: ${coverageDays} días.`,
     entityId: material._id,
     entityType: 'catalog_item',
     route: '/saas/vertical/limpieza/materiales',
     metadata: {
       materialName: material.name,
       sku: material.sku,
       stockQuantity: stockActual,
       minStock: material.minStock,
       upcomingServicesCount,
       coverageDays,
       estimatedConsumption: consumoEstimado,
     },
     dedupKey: `matcritical-${material._id}`,
   }
   ```

2. **Destinatarios:**
   - Gerente/owner: siempre.
   - Trabajador: nunca (la gestión de compras es del gerente).

**Criterios de aceptación:**
- [x] Se detectan materiales agotados con prioridad alta.
- [x] Se detectan materiales bajo mínimo con prioridad media.
- [x] Se calcula la cobertura estimada basándose en servicios planificados.
- [x] Funciona tanto con `subtype: 'cleaning_material'` como con catálogo genérico. *(fallback por `materialType`)*
- [x] La alerta incluye la estimación de cobertura en días.

---

### TICKET ALLP-11: Regla — Retraso en ruta

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar rutas de limpieza activas donde el trabajador acumula retraso respecto a los tiempos estimados. Si una entrada de ruta debería haber empezado a las 10:00 y a las 10:15 no hay `actualStartTime`, hay retraso. El retraso se acumula: si el primer servicio termina 20 min tarde, todos los siguientes se retrasan.

**Lógica de detección:**

```
Para cada cleaning_route con status === 'active' y date === hoy:
  Para cada entry en route.entries (ordenadas por order):
    Si entry.status === 'pending' y entry.estimatedStartTime existe:
      retrasoMinutos = (now - entry.estimatedStartTime) en minutos

      Si retrasoMinutos >= routeDelayHighMinutes (default 30):
        → prioridad ALTA — "Retraso grave en ruta"
      Si retrasoMinutos >= routeDelayThresholdMinutes (default 15):
        → prioridad MEDIA — "Retraso en ruta"

    Si entry.actualStartTime y entry.estimatedStartTime:
      desfase = actualStartTime - estimatedStartTime
      Si desfase > routeDelayThresholdMinutes:
        // Propagar: ajustar estimaciones de entradas siguientes
        retrasoAcumulado += desfase

  Si retrasoAcumulado >= routeDelayHighMinutes:
    → prioridad ALTA — "Ruta con retraso acumulado de X min"
  Si retrasoAcumulado >= routeDelayThresholdMinutes:
    → prioridad MEDIA — "Ruta con retraso acumulado de X min"
```

**Tareas:**

1. **Implementar `checkRouteDelayed(ctx, routes, config)` en `cleaningAlertEngine.js`:**
   - Filtrar rutas activas del día.
   - Para cada ruta, recorrer entradas ordenadas por `order`.
   - Calcular retraso puntual y acumulado.
   - Generar alerta tipo `cleaning_route_delayed`:

   ```javascript
   {
     category: 'cleaning_route_delayed',
     source: 'limpieza',
     level: delayMinutes >= config.routeDelayHighMinutes ? 'alert' : 'warning',
     title: 'Retraso en ruta de limpieza',
     message: `Ruta de ${route.workerName}: retraso de ${delayMinutes} min. Servicio actual: ${currentEntry.clientName} (previsto ${currentEntry.estimatedStartTime}).`,
     entityId: route._id,
     entityType: 'cleaning_route',
     route: `/saas/vertical/limpieza/rutas?routeId=${route._id}`,
     metadata: {
       routeId: route._id,
       workerId: route.workerId,
       workerName: route.workerName,
       date: route.date,
       delayMinutes,
       accumulatedDelay: retrasoAcumulado,
       currentEntryIndex: currentIdx,
       currentClientName: currentEntry?.clientName,
       remainingEntries: remainingCount,
       estimatedFinishDelay: retrasoAcumulado,
     },
     dedupKey: `routedelay-${route._id}`,
   }
   ```

2. **Calcular impacto en servicios posteriores:**
   - Incluir cuántos servicios restantes se verán afectados por el retraso.
   - Estimar la hora real de finalización de la ruta.

3. **Destinatarios:**
   - Gerente/owner: siempre.
   - Trabajador de la ruta: enviar push "Tu ruta lleva X min de retraso".

**Criterios de aceptación:**
- [x] Se detecta el retraso en cada entrada de ruta.
- [x] Se calcula el retraso acumulado de la ruta completa.
- [x] La prioridad escala según los minutos de retraso.
- [x] Se incluye el impacto en servicios posteriores. *(`remainingEntries` en metadata)*
- [ ] Se envía push al trabajador con su retraso.

---

### TICKET ALLP-12: Regla — Exceso de horas

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03

**Descripción:**  
Detectar trabajadores que acumulan más horas de las permitidas (diaria o semanalmente). Cruza fichajes de empresa (clockins) con check-ins/outs de servicios de limpieza para calcular el tiempo trabajado real. Tiene implicaciones legales (cumplimiento de la jornada laboral) y económicas (horas extra no planificadas).

**Lógica de detección:**

```
Para cada trabajador con servicios de limpieza hoy:
  // Horas del día
  horasHoy = sumar todos los intervalos (checkIn → checkOut) de servicios completados hoy
           + sumar intervalos de clockins generales del día
           + sumar tiempo del servicio en curso (checkIn → now)

  Si horasHoy >= excessHoursDailyMax:
    → prioridad ALTA — "Exceso de jornada diaria"
  Si horasHoy >= excessHoursDailyMax × (excessHoursWarningPercent / 100):
    → prioridad MEDIA — "Jornada diaria al X%"

  // Horas de la semana (lunes a hoy)
  horasSemana = sumar horas de lunes a hoy (misma lógica)

  Si horasSemana >= excessHoursWeeklyMax:
    → prioridad ALTA — "Exceso de jornada semanal"
  Si horasSemana >= excessHoursWeeklyMax × (excessHoursWarningPercent / 100):
    → prioridad MEDIA — "Jornada semanal al X%"
```

**Tareas:**

1. **Implementar `checkExcessHours(ctx, services, clockins, members, config)` en `cleaningAlertEngine.js`:**
   - Calcular horas por trabajador del día y de la semana.
   - Combinar datos de ejecución de servicios con fichajes generales.
   - Evitar doble conteo: si el periodo de un clockin coincide con un check-in de servicio, tomar el mayor.
   - Generar alerta tipo `cleaning_excess_hours`:

   ```javascript
   {
     category: 'cleaning_excess_hours',
     source: 'limpieza',
     level: isWeeklyExcess ? 'alert' : 'warning',
     title: isWeeklyExcess ? 'Exceso de jornada semanal' : 'Exceso de jornada diaria',
     message: `${workerName} lleva ${hoursWorked.toFixed(1)}h ${period} (máximo: ${maxHours}h). ${percentUsed}% de la jornada.`,
     entityId: workerId,
     entityType: 'team_member',
     route: '/saas/clockins',
     metadata: {
       workerId,
       workerName,
       hoursToday: horasHoy,
       hoursWeek: horasSemana,
       dailyMax: config.excessHoursDailyMax,
       weeklyMax: config.excessHoursWeeklyMax,
       percentDailyUsed: Math.round((horasHoy / config.excessHoursDailyMax) * 100),
       percentWeeklyUsed: Math.round((horasSemana / config.excessHoursWeeklyMax) * 100),
       servicesCompleted: completedCount,
       period: isWeeklyExcess ? 'semanal' : 'diario',
     },
     dedupKey: `excess-${workerId}-${period}-${today}`,
   }
   ```

2. **Fuentes de datos combinadas:**
   - `cleaning_service.execution.checkInAt/checkOutAt` — tiempo en servicio.
   - `clockin.entries[].clock_in/clock_out` — fichaje de empresa.
   - Descontar pausas (`execution.pauseLog`, `clockin break_*`).

3. **Destinatarios:**
   - Gerente/owner: siempre (responsabilidad legal).
   - Trabajador: notificar cuando alcanza el 90% de su jornada.

**Criterios de aceptación:**
- [x] Se calcula correctamente las horas trabajadas combinando servicios y fichajes.
- [x] Se detecta el exceso diario y semanal con umbrales independientes.
- [ ] Se evita el doble conteo de horas. *(heurística con `Math.max`; el acumulado semanal desde clockins es dudoso)*
- [x] Se descuentan pausas y descansos. *(`pauseLog` y `break_start/break_end`)*
- [x] La alerta incluye el porcentaje de jornada consumida.
- [ ] Se envía notificación preventiva al trabajador al 90%. *(hay alerta warning al 90% pero dirigida a gerentes, sin push al trabajador)*

---

### TICKET ALLP-13: Sistema de priorización, escalado y resolución automática

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-03, ALLP-04 a ALLP-12

**Descripción:**  
Implementar la lógica transversal de priorización, escalado temporal y resolución automática de alertas de limpieza. Cuando la condición que generó la alerta deja de cumplirse, la alerta se marca como resuelta automáticamente.

**Tareas:**

1. **Resolución automática — Condiciones de resolución por tipo:**

   | Categoría | Se resuelve cuando... |
   |-----------|----------------------|
   | `cleaning_service_uncovered` | El servicio recibe `assignedTo` (se asigna un trabajador) |
   | `cleaning_worker_absent` | El trabajador hace check-in en el servicio |
   | `cleaning_clockin_pending` | El trabajador hace check-in o la ventana temporal expira (→ ausente) |
   | `cleaning_incident_open` | La incidencia se marca como `resolved` |
   | `cleaning_incident_critical` | La incidencia se marca como `resolved` |
   | `cleaning_client_unpaid` | El cobro/factura se marca como `paid` |
   | `cleaning_contract_renewal` | El contrato se renueva (nueva `endDate`) |
   | `cleaning_material_critical` | El stock sube por encima del mínimo |
   | `cleaning_material_depleted` | El stock sube por encima de 0 |
   | `cleaning_route_delayed` | La ruta se completa o el retraso se recupera |
   | `cleaning_excess_hours` | El día/semana cambia (reset natural) |

2. **Implementar `resolveCleaningAlerts(ctx, activeAlerts, currentConditions)` en `cleaningAlertEngine.js`:**
   - En cada ciclo, obtener las alertas activas de limpieza (de la DB de notificaciones).
   - Para cada alerta activa, verificar si la condición de resolución se cumple.
   - Si se cumple: actualizar `status: 'resolved'`, `resolvedAt: now`, `resolvedBy: 'system'`.
   - Emitir SSE `cleaning:alert_resolved`.

3. **Escalado temporal:**
   - Usar `ALERT_CLASSIFICATION[category].escalable` y el `Map<alertKey, firstSeenAt>`.
   - Si la alerta es escalable y lleva activa > `ESCALATION_MEDIUM_MS` (15 min): subir `priority`.
   - Si prioridad `high` y lleva activa > `ESCALATION_HIGH_MS` (30 min): marcar `escalated: true`, enviar push adicional al owner.
   - Emitir SSE `cleaning:alert_escalated`.

4. **Estructura unificada de alerta emitida:**

   ```javascript
   {
     id: 'calert:{category}:{dedupKey}:{timestamp}',
     type: 'cleaning_alert',
     category: 'cleaning_service_uncovered',
     priority: 'high',
     level: 'alert',
     escalated: false,
     title: 'Servicio sin cubrir',
     message: '...',
     entityId: '...',
     entityType: '...',
     route: '...',
     metadata: { ... },
     targetRoles: ['manager', 'owner'],
     businessId: '...',
     userId: '...',
     createdAt: '...',
     resolvedAt: null,
     resolvedBy: null,
     acknowledgedAt: null,
     acknowledgedBy: null,
   }
   ```

**Criterios de aceptación:**
- [ ] Cada tipo de alerta tiene una condición de resolución clara. *(no existe `resolveCleaningAlerts()`)*
- [ ] Las alertas se resuelven automáticamente en el mismo ciclo que detecta la resolución.
- [x] El escalado temporal funciona a los 15 y 30 minutos.
- [ ] Se emiten eventos SSE de resolución y escalado. *(`cleaning:alert_resolved` solo en el flujo reactivo; `cleaning:alert_escalated` no existe)*
- [ ] Las alertas resueltas mantienen historial con `resolvedAt`.

---

### TICKET ALLP-14: Routing de alertas por rol — Perfil gerente y perfil trabajador

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-13

**Descripción:**  
Implementar la distribución de alertas de limpieza según el rol del destinatario, con soporte para múltiples canales de entrega. El **perfil gerente** recibe alertas globales de operación y rentabilidad; el **perfil trabajador** recibe solo alertas de su turno y sus servicios.

**Destinos de cada alerta:**

| Canal | Descripción | Cuándo |
|-------|-------------|--------|
| **Notificación in-app** | Doc en `notifications` DB | Siempre (todas las alertas) |
| **SSE** | Evento `cleaning:alert_triggered` | Siempre (tiempo real) |
| **Push web** | Push notification al dispositivo | Solo prioridad alta + usuario con push habilitado |
| **Dashboard** | Incluida en KPIs del Cleaning Hub | Siempre (leída on-demand) |
| **Centro de alertas core** | Incluida en `GET /api/alerts/:userId` | Siempre (resumen global) |

**Routing por rol:**

| Alerta | Gerente (owner/admin/manager) | Trabajador (worker) |
|--------|-------------------------------|---------------------|
| Servicio sin cubrir | ✅ todos | ❌ |
| Trabajador ausente | ✅ todos | ✅ solo si es él (como recordatorio) |
| Fichaje pendiente | ✅ todos | ✅ solo su servicio |
| Incidencia crítica | ✅ todos | ✅ solo si es su servicio |
| Incidencia abierta | ✅ todos | ✅ solo si es su incidencia |
| Impago de cliente | ✅ | ❌ nunca |
| Contrato por renovar (servicio) | ✅ | ❌ |
| Contrato por renovar (laboral) | ✅ | ✅ solo su contrato |
| Material crítico/agotado | ✅ | ❌ |
| Retraso en ruta | ✅ todos | ✅ solo su ruta |
| Exceso de horas | ✅ todos | ✅ solo sus horas |

**Tareas:**

1. **Implementar `routeCleaningAlert(alert, business)` en `cleaningAlertEngine.js`:**
   - Recibir la alerta con `targetRoles` y `metadata` (que incluye `workerId` cuando aplica).
   - Obtener miembros del negocio con sus roles.
   - Filtrar destinatarios:
     - Roles gerente (`owner`, `admin`, `manager`): reciben todas las alertas.
     - Rol trabajador (`worker`, `user`): reciben solo si `alert.metadata.workerId === member.user_id`.
   - Para cada destinatario:
     a. Guardar notificación en CouchDB con `assignedTo.userIds` incluyendo al destinatario.
     b. Enviar por SSE: `broadcastToUser(userId, 'cleaning:alert_triggered', alert)`.
     c. Si prioridad alta y usuario tiene push: `sendPushToUser(req, userId, pushPayload)`.

2. **SSE por negocio:**
   - Usar `broadcastToBusiness(businessId, 'cleaning:alert_triggered', alert)` para alertas operativas (retraso, incidencia).
   - Incluir `targetRoles` en el payload para que el frontend filtre por rol del usuario conectado.

3. **Perfil gerente — Resumen agregado:**
   - El gerente ve: total alertas activas, por prioridad, por tipo.
   - Recibe push para alertas de prioridad alta.
   - Alertas económicas (impago, contrato, material) solo van a gerentes.

4. **Perfil trabajador — Alertas personalizadas:**
   - El trabajador solo ve alertas de sus servicios/ruta/horas.
   - Los mensajes se adaptan: "Tu servicio en {cliente}" en vez de "Servicio de {trabajador}".
   - Push al trabajador: tono de recordatorio, no de reproche.

**Criterios de aceptación:**
- [x] Las alertas llegan al gerente siempre. *(persistencia vía `emitGlobalAlert()` + SSE)*
- [ ] Los trabajadores solo reciben alertas de su turno y sus servicios. *(no hay `routeCleaningAlert()`; el filtrado por rol queda en manos del frontend vía `targetRoles`)*
- [ ] Push solo se envía en prioridad alta. *(el push depende de los canales del `alertEmitter`, sin regla específica por prioridad para limpieza)*
- [ ] Las alertas se persisten en notificaciones y se incluyen en el resumen de alertas core. *(se persisten con `source: 'limpieza'`, pero `getAlertSummary()` del motor genérico no tiene sección cleaning)*
- [x] El SSE funciona con `broadcastToBusiness` para distribuir a todos los conectados.
- [ ] Los mensajes se adaptan al perfil del destinatario.

---

### TICKET ALLP-15: Emisión SSE de alertas de limpieza en tiempo real

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-13, ALLP-14

**Descripción:**  
Definir y emitir los eventos SSE específicos de alertas de limpieza para que el frontend (dashboard, cleaning hub, vista trabajador) los reciba en tiempo real.

**Eventos SSE:**

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `cleaning:alert_triggered` | Se crea una nueva alerta | Alerta completa (estructura ALLP-13) |
| `cleaning:alert_resolved` | Condición resuelta automáticamente | `{ alertId, category, resolvedAt }` |
| `cleaning:alert_escalated` | Alerta sube de prioridad | `{ alertId, category, oldPriority, newPriority }` |
| `cleaning:alert_acknowledged` | Usuario reconoce una alerta | `{ alertId, acknowledgedBy, acknowledgedAt }` |
| `cleaning:alerts_summary` | Resumen periódico (cada 5 min) | `{ total, byPriority, byCategory }` |

**Tareas:**

1. **Emitir `cleaning:alert_triggered` desde `routeCleaningAlert()` (ALLP-14).**

2. **Emitir `cleaning:alert_resolved` desde la lógica de resolución automática (ALLP-13).**

3. **Emitir `cleaning:alert_escalated` desde la lógica de escalado (ALLP-13).**

4. **Endpoint de reconocimiento:**
   - `PUT /api/cleaning-hub/alerts/:alertId/acknowledge` — Marca la alerta como reconocida.
   - Emite `cleaning:alert_acknowledged` por SSE.

5. **Resumen periódico:**
   - Cada 5 minutos, emitir `cleaning:alerts_summary` con conteos por prioridad y tipo.
   - Permite actualizar badges del dashboard sin polling.

**Criterios de aceptación:**
- [ ] Los 5 eventos SSE se emiten correctamente. *(solo `cleaning:alert_triggered` y `cleaning:alert_resolved` reactivo; faltan escalated, acknowledged y alerts_summary)*
- [x] El payload incluye toda la información necesaria para actualizar la UI sin re-fetch.
- [ ] El evento `alert_triggered` se recibe en < 2 segundos. *(no medido)*
- [ ] La resolución automática emite `alert_resolved` en el mismo ciclo.
- [ ] El reconocimiento funciona y se propaga por SSE. *(no existe el endpoint de acknowledge)*

---

### TICKET ALLP-16: Endpoints API — Cleaning Hub (alertas + KPIs + datos)

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** ALLP-03, ALLP-13

**Descripción:**  
Crear el controller y router para `/api/cleaning-hub/*` que el frontend ya espera (`cleaningHubApi.ts`). Estos endpoints alimentan el dashboard de limpieza con KPIs en tiempo real, alertas activas, datos de trabajadores, materiales y métricas.

**Tareas:**

1. **Crear `controllers/cleaningHubController.js`:**

   ```javascript
   export async function getCleaningHubKpis(req, res) { ... }
   export async function getCleaningHubToday(req, res) { ... }
   export async function getCleaningHubAlerts(req, res) { ... }
   export async function getCleaningHubWorkers(req, res) { ... }
   export async function getCleaningHubMaterials(req, res) { ... }
   export async function getCleaningHubMetrics(req, res) { ... }
   ```

2. **Crear `routers/cleaningHubRouter.js`:**

   ```javascript
   cleaningHubRouter.get('/kpis/:userId', getCleaningHubKpis);
   cleaningHubRouter.get('/today/:userId', getCleaningHubToday);
   cleaningHubRouter.get('/alerts/:userId', getCleaningHubAlerts);
   cleaningHubRouter.get('/workers/:userId', getCleaningHubWorkers);
   cleaningHubRouter.get('/materials/:userId', getCleaningHubMaterials);
   cleaningHubRouter.get('/metrics/:userId', getCleaningHubMetrics);
   cleaningHubRouter.put('/alerts/:alertId/acknowledge', acknowledgeCleaningAlert);
   ```

3. **Montar en `index.js`:**
   ```javascript
   import { cleaningHubRouter } from './routers/cleaningHubRouter.js';
   app.use('/api/cleaning-hub', requireAuth, burstLimiter, cleaningHubRouter);
   ```

4. **Endpoint `GET /api/cleaning-hub/kpis/:userId`:**
   - Respuesta compatible con `CleaningHubKpis` de `cleaningHubApi.ts`:
   ```javascript
   {
     ok: true,
     data: {
       servicesToday,          // Total servicios del día
       servicesCompleted,      // Servicios completados
       servicesInProgress,     // En curso
       servicesPending,        // Pendientes
       servicesUncovered,      // Sin trabajador asignado
       activeWorkers,          // Trabajadores con check-in hoy
       totalWorkers,           // Total trabajadores de limpieza
       absentWorkers,          // Sin fichaje pasada la hora
       clockinsPending,        // Fichajes pendientes
       hoursWorkedToday,       // Horas totales trabajadas hoy
       openIncidents,          // Incidencias abiertas
       billingToday,           // Facturación del día
       billingPending,         // Cobros pendientes
       profitabilityAvg,       // Rentabilidad media (ingreso - coste)
       criticalMaterials,      // Materiales bajo mínimo o agotados
       recurrentServices,      // Servicios recurrentes activos
       oneTimeServices,        // Servicios puntuales del día
     }
   }
   ```

5. **Endpoint `GET /api/cleaning-hub/alerts/:userId`:**
   - Respuesta compatible con `CleaningHubAlert[]`:
   - Obtener alertas activas de limpieza del motor (ALLP-03) y/o de la DB de notificaciones filtradas por `source: 'limpieza'`.
   - Ordenar por severidad (error > warning > info) y luego por fecha.

6. **Endpoint `GET /api/cleaning-hub/workers/:userId`:**
   - Respuesta compatible con `CleaningHubWorker[]`:
   - Cruzar miembros del equipo con servicios del día, fichajes y ejecuciones.

7. **Endpoint `GET /api/cleaning-hub/materials/:userId`:**
   - Respuesta compatible con `CleaningMaterial[]`:
   - Materiales de limpieza con stock, mínimo y flag `isCritical`.

8. **Endpoint `GET /api/cleaning-hub/metrics/:userId`:**
   - Respuesta compatible con `CleaningHubMetrics`:
   - Cálculos de servicios por hora, rentabilidad por cliente, horas por trabajador, tendencia semanal.

**Criterios de aceptación:**
- [x] Los 6 endpoints responden con la estructura que espera `cleaningHubApi.ts`. *(montados en `/api/cleaning/hub`, frontend alineado)*
- [x] Los KPIs se calculan en tiempo real sobre datos del día.
- [x] Las alertas devueltas son las alertas activas del motor de limpieza. *(`getCleaningAlertSummary()`)*
- [x] Los trabajadores incluyen datos de fichaje y servicio actual.
- [x] Los materiales incluyen el flag `isCritical`.
- [x] Las métricas se calculan correctamente.
- [x] Todos los endpoints están protegidos con auth y rate limiting. *(`requireAuthAndEmailVerified` + `burstLimiter` + `planAwareLimiter`)*

---

### TICKET ALLP-17: Alertas reactivas en escritura (tiempo real sin esperar ciclo)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-04 a ALLP-12, ALLP-14

**Descripción:**  
Complementar el ciclo periódico de 120 segundos con alertas reactivas que se disparan inmediatamente al ocurrir ciertos eventos de escritura en el controller de limpieza. Esto reduce la latencia de detección a < 2 segundos para las condiciones más críticas.

**Eventos que disparan evaluación reactiva:**

| Evento de escritura | Reglas evaluadas | Desde dónde se dispara |
|---------------------|------------------|------------------------|
| Servicio creado sin `assignedTo` | Servicio sin cubrir | `cleaningController.createCleaningService()` |
| Servicio actualizado: `assignedTo` vacío | Servicio sin cubrir | `cleaningController.updateCleaningService()` |
| Servicio actualizado: `assignedTo` asignado | Resolver "servicio sin cubrir" | `cleaningController.updateCleaningService()` |
| Check-in en servicio | Resolver "fichaje pendiente" y "ausente" | `cleaningController.checkInService()` |
| Check-out en servicio | Evaluar exceso de horas y overtime | `cleaningController.checkOutService()` |
| Incidencia creada | Incidencia abierta/crítica | `cleaningController.createCleaningIncident()` |
| Incidencia resuelta | Resolver "incidencia abierta" | `cleaningController.updateCleaningIncident()` |
| Incidencia de ejecución reportada | Incidencia crítica | `cleaningController.reportServiceIncident()` |
| Incidencia de ejecución resuelta | Resolver incidencia | `cleaningController.resolveServiceIncident()` |
| Ruta generada | Evaluar servicios sin cubrir | `cleaningController.generateCleaningRoutes()` |
| Stock actualizado (material limpieza) | Material crítico/agotado | `catalogController.updateItem()` |

**Tareas:**

1. **Exportar `triggerReactiveCleaningAlert(userId, eventType, payload)` desde `cleaningAlertEngine.js`:**
   - Recibe el tipo de evento y datos relevantes.
   - Ejecuta solo las reglas afectadas (no todas).
   - Respeta la deduplicación (no emitir si ya se emitió en los últimos 5 min).
   - Asíncrona y no bloquea la respuesta al cliente (fire-and-forget con catch).

2. **Integrar en `cleaningController.js`:**
   - Tras cada operación de escritura exitosa, llamar a `triggerReactiveCleaningAlert()`.
   - Ejemplo en `checkInService`:
     ```javascript
     res.json({ ok: true, service: sanitizedService });
     triggerReactiveCleaningAlert(userId, 'service_checkin', {
       serviceId: doc._id,
       workerId: doc.assignedTo,
       businessId,
     }).catch(err => logger.warn({ tag: 'REACTIVE_CLEANING_ALERT', err: err?.message }));
     ```

3. **Mapeo evento → reglas:**
   ```javascript
   const EVENT_TO_RULES = {
     service_created_unassigned: ['checkServiceUncovered'],
     service_assigned:           ['resolveServiceUncovered'],
     service_checkin:            ['resolveClockinPending', 'resolveWorkerAbsent'],
     service_checkout:           ['checkExcessHours', 'checkServiceOvertime'],
     incident_created:           ['checkIncidentsOpen'],
     incident_resolved:          ['resolveIncidentOpen'],
     route_generated:            ['checkServiceUncovered'],
     stock_updated:              ['checkMaterialCritical'],
   };
   ```

**Criterios de aceptación:**
- [ ] Los eventos de escritura disparan alertas reactivas en < 2 segundos. *(7 eventos integrados en `cleaningController.js`; falta `stock_updated` desde el catálogo)*
- [x] Las alertas reactivas respetan la deduplicación.
- [x] La respuesta HTTP no se bloquea por la evaluación de alertas. *(fire-and-forget con `.catch()`)*
- [x] Solo se evalúan las reglas relevantes al evento. *(`EVENT_TO_RULES`)*
- [x] Los errores en alertas reactivas no afectan al flujo principal.
- [x] Las resoluciones reactivas emiten SSE `cleaning:alert_resolved`.

---

### TICKET ALLP-18: Conexiones — Integración con módulos del ecosistema

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** ALLP-03, ALLP-14, ALLP-16

**Descripción:**  
Asegurar que el motor de alertas de limpieza está correctamente integrado con todos los módulos que lee y con todos los destinos a los que escribe.

**Mapa de conexiones:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      FUENTES DE DATOS (lectura)                          │
│                                                                          │
│  ┌─────────────┐  ┌────────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  Servicios  │  │   Rutas    │  │ Fichajes │  │    Materiales     │   │
│  │  cleaning_  │  │  cleaning_ │  │ clockin  │  │   catalog_item    │   │
│  │  service    │  │  route     │  │          │  │   (cleaning_      │   │
│  │             │  │            │  │          │  │    material)      │   │
│  └──────┬──────┘  └─────┬──────┘  └────┬─────┘  └────────┬──────────┘   │
│         │               │              │                  │              │
│  ┌──────┴──────┐  ┌─────┴──────┐  ┌────┴──────┐  ┌───────┴──────────┐   │
│  │ Incidencias │  │  Equipo    │  │ Horarios  │  │   Facturación    │   │
│  │  cleaning_  │  │  business  │  │ schedules │  │  client_invoice  │   │
│  │  incident   │  │  .members  │  │           │  │  cobro/pago      │   │
│  └─────────────┘  └────────────┘  └───────────┘  └──────────────────┘   │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   CLEANING ALERT    │
                    │      ENGINE         │
                    │  (cleaningAlert     │
                    │   Engine.js)        │
                    └──────────┬──────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│                    DESTINOS (escritura)                                    │
│                              │                                            │
│  ┌──────────┐  ┌──────────┐ │ ┌──────────┐  ┌────────────────────────┐   │
│  │Dashboard │  │ Alertas  │ │ │ Push Web │  │ Cleaning Hub           │   │
│  │  global  │  │   Core   │ │ │  (VAPID) │  │ (SSE cleaning:*)      │   │
│  │ /api/    │  │ /api/    │ │ │          │  │ /api/cleaning-hub/*    │   │
│  │ dashboard│  │ alerts   │ │ │          │  │                        │   │
│  └──────────┘  └──────────┘ │ └──────────┘  └────────────────────────┘   │
│                              │                                            │
│  ┌────────────────────────┐  │  ┌────────────────────────────────────┐    │
│  │ Notificaciones in-app │  │  │ SSE (broadcastToBusiness /        │    │
│  │ (notifications DB)    │  │  │      broadcastToUser)             │    │
│  └────────────────────────┘  │  └────────────────────────────────────┘    │
│                              │                                            │
└──────────────────────────────┴───────────────────────────────────────────┘
```

**Tareas:**

1. **Conexión con Alertas Core (`alertController.js`):**
   - Incluir alertas de limpieza en `getAlertSummary()`:
     ```javascript
     cleaning: {
       active: activeCleaningAlerts.length,
       byPriority: { high: X, medium: Y, low: Z },
       byCategory: { cleaning_service_uncovered: N, cleaning_worker_absent: N, ... },
       mostCritical: topAlert || null,
     }
     ```
   - El centro de alertas core (`/api/alerts/:userId`) agrega alertas genéricas + limpieza.

2. **Conexión con Dashboard global (`/api/dashboard/kpis/:userId`):**
   - Incluir campo `cleaningAlerts` en la respuesta de KPIs del dashboard:
     ```javascript
     cleaningAlerts: {
       total: 5,
       critical: 2,
       warning: 3,
     }
     ```

3. **Conexión con Servicios (`cleaningController.js`):**
   - Los endpoints de ejecución (check-in, check-out, incidencias) disparan alertas reactivas (ALLP-17).

4. **Conexión con Fichajes (`clockinsController.js`):**
   - El motor lee los fichajes del día para calcular horas y detectar ausencias.
   - Si se usa `clockinAlertsController.generateAlerts()`, coordinar para no duplicar alertas de tipo `no_clockin`.

5. **Conexión con Facturación (`financeController.js` / `invoicesController.js`):**
   - El motor lee cobros/facturas pendientes para la regla de impago.
   - Si un cobro se marca como pagado → disparar resolución de alerta `cleaning_client_unpaid`.

6. **Conexión con Materiales:**
   - El motor lee `catalog_item` con datos de stock para la regla de material crítico.
   - Si el stock se actualiza → disparar evaluación reactiva de `checkMaterialCritical`.

7. **Conexión con Equipo (`business.members`):**
   - El motor lee los miembros para obtener `contractEndDate`, `status`, `role`.
   - Coordinar con la regla `contract_expiring` del motor genérico para no duplicar alertas de contrato laboral.

**Criterios de aceptación:**
- [ ] Las alertas de limpieza se incluyen en el resumen de alertas core. *(`getAlertSummary()` no agrega sección cleaning)*
- [ ] El dashboard global incluye conteo de alertas de limpieza. *(no existe campo `cleaningAlerts` en los KPIs del dashboard)*
- [ ] Los eventos de escritura en servicios, fichajes, facturas y stock disparan evaluación reactiva. *(solo servicios/incidencias/rutas; fichajes, facturas y stock no)*
- [ ] No se duplican alertas entre el motor genérico y el de limpieza. *(el motor genérico tiene `checkCleaningRouteAlerts` con categoría `cleaning_route` que solapa con `cleaning_route_delayed`; sin coordinación explícita)*
- [ ] El diagrama de conexiones se cumple íntegramente.

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (Semana 1)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALLP-01 | Constantes y categorías de limpieza | Backend | Crítica |
| ALLP-02 | Configuración de alertas cleaning | Backend | Crítica |
| ALLP-03 | Motor de alertas — Ciclo rápido independiente | Backend | Crítica |
| ALLP-13 | Sistema de priorización, escalado y resolución | Backend | Crítica |

### Fase 2 — Reglas de detección operativas (Semanas 2-3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALLP-04 | Regla — Servicio sin cubrir | Backend | Crítica |
| ALLP-05 | Regla — Trabajador ausente | Backend | Crítica |
| ALLP-06 | Regla — Fichaje pendiente | Backend | Alta |
| ALLP-07 | Regla — Incidencia abierta / crítica | Backend | Alta |
| ALLP-11 | Regla — Retraso en ruta | Backend | Alta |
| ALLP-12 | Regla — Exceso de horas | Backend | Alta |

### Fase 3 — Reglas económicas (Semana 3)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALLP-08 | Regla — Cliente con impago | Backend | Alta |
| ALLP-09 | Regla — Contrato próximo a renovar | Backend | Alta |
| ALLP-10 | Regla — Material crítico / agotado | Backend | Alta |

### Fase 4 — Distribución y tiempo real (Semana 4)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALLP-14 | Routing de alertas por rol (gerente vs trabajador) | Backend | Crítica |
| ALLP-15 | Emisión SSE de alertas en tiempo real | Backend | Alta |
| ALLP-16 | Endpoints API — Cleaning Hub | Backend | Crítica |

### Fase 5 — Integración y optimización (Semana 5)

| Ticket | Nombre | Tipo | Prioridad |
|--------|--------|------|-----------|
| ALLP-17 | Alertas reactivas en escritura | Backend | Alta |
| ALLP-18 | Conexiones con módulos del ecosistema | Backend | Alta |

---

## MAPA DE ALERTAS — Referencia rápida

| # | Alerta | Condición | Prioridad default | Destinatarios |
|---|--------|-----------|-------------------|---------------|
| 1 | Servicio sin cubrir | `pending` sin `assignedTo`, hoy/mañana | alta | Gerente |
| 2 | Trabajador ausente | Sin check-in tras gracia, servicio asignado hoy | alta | Gerente + trabajador (push) |
| 3 | Fichaje pendiente | Servicio asignado, check-in no realizado a X min del inicio | media (escalable) | Gerente + trabajador (push) |
| 4 | Incidencia crítica | `cleaning_incident` tipo crítico sin resolver | alta | Gerente + trabajador del servicio |
| 5 | Incidencia abierta | `cleaning_incident` abierta > X horas | media (escalable) | Gerente + trabajador del servicio |
| 6 | Impago de cliente | Cobro/factura vencido > X días, cliente con servicios activos | media (escalable) | Solo gerente |
| 7 | Contrato por renovar | Recurrencia con `endDate` < X días / contrato laboral < X días | media (escalable) | Gerente (+ trabajador si es su contrato) |
| 8 | Material agotado | `stockQuantity <= 0` en material de limpieza | alta | Solo gerente |
| 9 | Material crítico | `stockQuantity <= minStock` o cobertura < servicios planificados | media (escalable) | Solo gerente |
| 10 | Retraso en ruta | Desfase actual vs estimado > X min en ruta activa | media (escalable) | Gerente + trabajador de la ruta |
| 11 | Exceso de horas | Horas día > máx diario o horas semana > máx semanal | media (escalable) | Gerente + trabajador (notificación al 90%) |

---

## REFERENCIAS CRUZADAS CON OTROS TICKETS

| Ticket externo | Relación con este módulo |
|---------------|--------------------------|
| **TRABAJADORES-LIMPIEZA** (CW-*) | ALLP-05 y ALLP-12 necesitan la entidad `CleaningWorker` (CW-01) para datos de contrato, coste/hora y zona. Si CW-01 no está implementado, se usan `business.members` como fallback. |
| **MATERIALES-CONSUMOS** (MAT-*) | ALLP-10 usa los materiales de limpieza definidos en MAT-01. MAT-10 define alertas propias de materiales que complementan (no duplican) a ALLP-10: `material_not_delivered`, `abnormal_consumption`, `inventory_discrepancy`, `material_expiring`. |
| **FICHAJE-EJECUCION-LIMPIEZA** | ALLP-06 complementa el flujo de check-in/out. La función `generateExecutionAlerts()` en `cleaningController.js` se integra con el motor global en vez de quedarse local. |
| **SERVICIOS-CONTRATOS-LIMPIEZA** | ALLP-09 necesita datos de recurrencia y fecha de fin de contrato que se definen en este módulo. |
| **ALERTAS-DELIVERY-BACKEND** (ALDV-*) | Patrón de referencia. `cleaningAlertEngine.js` sigue la misma arquitectura que `deliveryAlertEngine.js`. Comparten `emitGlobalAlert()` del `alertEmitter.js`. |
| **HORARIOS-VACACIONES** | ALLP-04 (servicio sin cubrir) consulta vacaciones aprobadas para detectar conflictos con servicios asignados. |
| **FINANZAS** | ALLP-08 (impago) lee de `getFinanceDbName()` y `getInvoicesDbName()` — mismas fuentes que las reglas financieras del motor genérico. |

---

## NOTAS TÉCNICAS

### Naming conventions
- Archivo motor: `services/cleaningAlertEngine.js`
- Archivo controller: `controllers/cleaningHubController.js`
- Archivo router: `routers/cleaningHubRouter.js`
- Categorías de alerta: prefijo `cleaning_` (ej: `cleaning_service_uncovered`)
- Eventos SSE: prefijo `cleaning:alert_` (ej: `cleaning:alert_triggered`)
- IDs de alerta: `calert:{category}:{dedupKey}:{timestamp}`
- Source en notificaciones: `'limpieza'`

### Eficiencia
- El ciclo rápido (120s) debe completarse en < 5 segundos con 500 servicios y 50 trabajadores.
- Deduplicación rápida usa `Map` en memoria (no CouchDB cada 120s).
- Caché de datos entre ciclos (TTL: 240s) para evitar re-leer toda la DB cada vez.
- Las alertas reactivas son fire-and-forget y no bloquean respuestas HTTP.
- Solo se evalúan businesses con datos de limpieza (`cleaning.enabled: true`).

### Compatibilidad
- El motor genérico (`alertEngine.js`) sigue funcionando sin cambios.
- Las reglas genéricas `worker_no_clockin` y `contract_expiring` siguen activas — coordinar con ALLP-05/ALLP-09 para evitar duplicación (el motor cleaning filtra solo trabajadores con servicios de limpieza; el genérico cubre el resto).
- Los tipos de notificación existentes (`notification` en CouchDB) se reutilizan añadiendo `source: 'limpieza'` y las categorías `cleaning_*`.
- Los endpoints de `alertController.js` siguen funcionando y agregan las alertas de limpieza en el summary global.

### Imports necesarios en `cleaningAlertEngine.js`
```javascript
import {
  getCleaningDbName,
  getClockinsDbName,
  getFinanceDbName,
  getInvoicesDbName,
  getCatalogDbName,
  ACCOUNTS_DB,
  BUSINESSES_DB,
  ensureDatabase,
  getAllDocuments,
  findAccountByUserId,
  listCleaningServicesByUser,
  listCleaningServicesByDate,
  listCleaningRoutesByDate,
  listCleaningIncidentsByUser,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { broadcastToBusiness, broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';
```
