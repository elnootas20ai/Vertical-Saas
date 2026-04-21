# Alertas Backend — Construcción

> **Módulo:** `constructionAlertEngine`
> **Tipo:** Backend
> **Prioridad global:** Alta
> **Vertical:** `construction`
> **Fecha:** 2026-04-14

---

## Índice

1. [Contexto y estado actual](#contexto-y-estado-actual)
2. [Arquitectura propuesta](#arquitectura-propuesta)
3. [Catálogo de alertas](#catálogo-de-alertas)
4. [Tickets](#tickets)
5. [Mapa de conexiones](#mapa-de-conexiones)
6. [Clasificación por prioridad y rol](#clasificación-por-prioridad-y-rol)
7. [Orden de implementación](#orden-de-implementación)

---

## Contexto y estado actual

### Lo que YA existe

| Componente | Estado | Ubicación |
|---|---|---|
| Motor de alertas genérico (ciclo 1h) | Funcional | `services/alertEngine.js` |
| Constantes de alertas globales | Funcional | `services/alertConstants.js` |
| Emisión unificada (`emitGlobalAlert`) | Funcional | `services/alertEngine.js` (import `alertEmitter`) |
| Centro de alertas (listado, filtros, bulk, asignar) | Funcional | `controllers/alertCenterController.js` |
| SSE tiempo real | Funcional | `services/sseService.js` |
| Web Push | Funcional | `services/pushService.js` |
| Router de alertas + configuración por cuenta | Funcional | `routers/alertRouter.js`, `controllers/alertController.js` |
| Dashboard KPIs + dashAlerts | Funcional | `index.js` (GET /api/dashboard/kpis) |
| Deduplicación diaria (24h) | Funcional | `alertEngine.js` → `DEDUP_WINDOW_MS` |
| CRUD Obras (`construction_project`) | Completo | `constructionController.js` — estado, progreso, fechas |
| CRUD Presupuestos (`construction_budget`) con pagos y plazos | Completo | `constructionController.js` — `acceptBudget`, `registerPayment` |
| CRUD Trabajadores (`construction_worker`) con obra y gremio | Completo | `constructionController.js` |
| CRUD Tareas de obra (`construction_task`) | Completo | `constructionController.js` |
| CRUD Gremios/subcontratas (`construction_guild`) | Completo | `constructionController.js` |
| CRUD Clientes (`construction_client`) | Completo | `constructionController.js` |
| BD dedicada `*-construction` con helpers CouchDB | Completo | `services/couchdb.js` → `getConstructionDbName()` |
| Fichajes con geolocalización | Completo | `clockinsController.js` |
| Catálogo vertical construcción (materiales) | Completo | `verticalCatalog.js` → clave `construction` |
| Modelo `construction_daily_report` (parte diario) | Planificado | `PARTES-EJECUCION-CONSTRUCCION.md` → CE-01 |
| Modelo `construction_incident` (incidencia) | Planificado | `PARTES-EJECUCION-CONSTRUCCION.md` → CE-02 |
| Alertas básicas de construcción (4 reglas) | Planificado | `PARTES-EJECUCION-CONSTRUCCION.md` → CE-08 |

### Lo que FALTA (lo que resuelve este documento)

| Funcionalidad | Estado |
|---|---|
| **Motor de alertas específico de construcción** | No existe |
| **Alerta: presupuesto sin respuesta** | No existe |
| **Alerta: obra sin responsable** | No existe |
| **Alerta: obra sin actividad (obra parada)** | No existe |
| **Alerta: trabajador sin parte diario** | No existe |
| **Alerta: cobro vencido** | No existe |
| **Alerta: pago vencido / sin justificar** | No existe |
| **Alerta: documento pendiente / falta de documentos** | No existe |
| **Alerta: incidencia crítica sin resolver** | No existe |
| **Alerta: coste disparado (desviación presupuestaria)** | No existe |
| **Alerta: obra finalizada sin cerrar** | No existe |
| Configuración de alertas de construcción en `alertConfig` | No existe |
| Distribución por perfil (gerente vs trabajador) | No existe |
| Integración con Dashboard de construcción | No existe |
| Integración con Centro de alertas core | No existe |
| Endpoint resumen de alertas de construcción | No existe |
| Source `construccion` en `ALERT_SOURCES` | No existe |
| Categorías `construction_*` en `CATEGORY_TO_SOURCE` | No existe |

### Patrón del motor actual

```
alertEngine.js:
  startAlertEngine() → setInterval(1h)
    → getAllBusinesses()
    → por cada negocio: runAlertsForBusiness(business)
      → getAlertConfig(account)
      → fetch datos de CouchDB (catálogo, finanzas, flota, etc.)
      → ejecutar reglas (checkLowStock, checkOverdueInvoices, etc.)
      → emit() → emitGlobalAlert() → CouchDB notifications + SSE + Push
```

### Modelo de datos de construcción existente

| Tipo CouchDB | Prefijo ID | Campos clave |
|---|---|---|
| `construction_project` | `cprj-` | `nombre`, `tipoObra`, `estado` (`planificación`/`en_obra`/`pausada`/`finalizada`), `progreso`, `responsable`, `responsableNombre`, `fechaInicio`, `fechaFin` |
| `construction_budget` | `cbud-` | `referencia`, `proyectoId`, `estado` (`borrador`/`enviado`/`aceptado`/`rechazado`), `totalConMargen`, `metodoPago`, `pagos[]` (cada uno con `pagado`, `fecha`, `importe`) |
| `construction_worker` | `cwrk-` | `nombre`, `gremio`, `obraAsignada`, `obraNombre`, `activo`, `documentos[]` |
| `construction_task` | `ctsk-` | `obraId`, `trabajadorId`, `estado`, `prioridad`, `fechaLimite` |
| `construction_guild` | `cgld-` | `nombre`, `tipo`, `precioManoObra`, `precioMaterial` |
| `construction_client` | `ccli-` | `nombre`, `telefono`, `email` |
| `construction_daily_report` | `cdrt-` | *(planificado)* `obraId`, `trabajadorId`, `fecha`, `horasTrabajadas`, `estado`, `tieneIncidencia` |
| `construction_incident` | `cinc-` | *(planificado)* `obraId`, `gravedad`, `estado` (`abierta`/`en_revision`/`resuelta`/`cerrada`) |

---

## Arquitectura propuesta

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   CONSTRUCTION ALERT ENGINE                                │
│                 services/constructionAlertEngine.js                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ Presupuesto    │  │ Obra sin       │  │ Obra sin       │               │
│  │ sin respuesta  │  │ responsable    │  │ actividad      │               │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘               │
│          │                   │                    │                        │
│  ┌───────┴────────┐  ┌──────┴─────────┐  ┌──────┴─────────┐              │
│  │ Trabajador sin │  │ Cobro vencido  │  │ Pago vencido / │              │
│  │ parte diario   │  │                │  │ sin justificar │              │
│  └───────┬────────┘  └──────┬─────────┘  └──────┬─────────┘              │
│          │                  │                    │                         │
│  ┌───────┴────────┐  ┌─────┴──────────┐  ┌─────┴──────────┐              │
│  │ Documento      │  │ Incidencia     │  │ Coste          │              │
│  │ pendiente      │  │ crítica        │  │ disparado      │              │
│  └───────┬────────┘  └─────┬──────────┘  └─────┬──────────┘              │
│          │                 │                    │                          │
│  ┌───────┴──────────────────────────────────────┘                         │
│  │                                                                        │
│  │  ┌────────────────┐                                                    │
│  │  │ Obra finalizada│                                                    │
│  │  │ sin cerrar     │                                                    │
│  │  └───────┬────────┘                                                    │
│  │          │                                                             │
│  └──────────┴───────────────────┐                                         │
│                                 ▼                                          │
│                        classifyByPriority()                                │
│                        classifyByRole()                                    │
│                                 │                                          │
│              ┌──────────────────┼──────────────────┐                      │
│              ▼                  ▼                   ▼                      │
│       ┌────────────┐   ┌────────────┐   ┌──────────────┐                  │
│       │emitGlobal  │   │broadcast   │   │broadcastTo   │                  │
│       │Alert       │   │ToUser      │   │Business      │                  │
│       │(CouchDB)   │   │(SSE)       │   │(SSE)         │                  │
│       └─────┬──────┘   └─────┬──────┘   └──────┬───────┘                  │
│             │                │                  │                          │
│             ▼                ▼                  ▼                          │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │              CANALES DE DISTRIBUCIÓN                  │                  │
│  ├──────────────┬──────────────┬────────────────────────┤                  │
│  │  Dashboard   │  Centro de   │   Pantalla de obra     │                  │
│  │ Construcción │  Alertas     │  (trabajador / móvil)  │                  │
│  │  (gerente)   │  Core        │                        │                  │
│  └──────────────┴──────────────┴────────────────────────┘                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Flujo por perfil

```
GERENTE (owner / admin / manager):
  Dashboard construcción → alertas globales de operación, dinero y documentación
  │ Presupuestos sin respuesta del cliente
  │ Obras sin responsable asignado
  │ Obras paradas sin actividad
  │ Cobros vencidos (plazos sin pagar)
  │ Pagos a proveedores vencidos o sin justificación
  │ Desviación de coste sobre presupuesto
  │ Documentación vencida o faltante de trabajadores/obra
  │ Incidencias críticas abiertas
  │ Obras finalizadas sin cierre administrativo
  │ Trabajadores sin parte diario

TRABAJADOR (worker / team member):
  Pantalla de obra → alertas de sus obras, partes y tareas
  │ Parte diario pendiente de registrar (hoy)
  │ Tareas asignadas vencidas o próximas a vencer
  │ Incidencia sin resolver en su obra
  │ Documentos personales próximos a caducar
```

---

## Catálogo de alertas

### Nuevas categorías de alerta

| Categoría (`category`) | Nivel | Prioridad | Source | Destinatario |
|---|---|---|---|---|
| `construction_budget_no_response` | `warning` | Media | `construccion` | Gerente |
| `construction_project_no_responsible` | `warning` | Alta | `construccion` | Gerente |
| `construction_project_inactive` | `warning` | Alta | `construccion` | Gerente |
| `construction_worker_no_report` | `warning` | Media | `construccion` | Gerente + Trabajador |
| `construction_collection_overdue` | `alert` | Alta | `construccion` | Gerente |
| `construction_payment_overdue` | `alert` | Alta | `construccion` | Gerente |
| `construction_payment_unjustified` | `warning` | Media | `construccion` | Gerente |
| `construction_document_pending` | `warning` | Media | `construccion` | Gerente + Trabajador |
| `construction_document_expired` | `alert` | Alta | `construccion` | Gerente + Trabajador |
| `construction_incident_critical` | `alert` | Critica | `construccion` | Gerente + Trabajador |
| `construction_incident_unreviewed` | `warning` | Alta | `construccion` | Gerente |
| `construction_cost_overrun` | `alert` | Alta | `construccion` | Gerente |
| `construction_cost_warning` | `warning` | Media | `construccion` | Gerente |
| `construction_project_unclosed` | `warning` | Media | `construccion` | Gerente |
| `construction_task_overdue` | `warning` | Media | `construccion` | Gerente + Trabajador |

---

## Tickets

---

### CONSTR-ALR-01 — Registro de `construccion` como source y categorías en alertConstants

**Tipo:** Infraestructura / Constantes
**Prioridad:** Critica (bloqueante)
**Estimación:** 1h
**Archivo:** `services/alertConstants.js`

#### Descripción

El source `construccion` no existe en `ALERT_SOURCES` ni en `CATEGORY_TO_SOURCE`. Sin este registro, el motor global no puede clasificar ni filtrar alertas de construcción. Es requisito previo para todo lo demás.

#### Tareas

- [ ] Añadir `'construccion'` al array `ALERT_SOURCES`
- [ ] Añadir las 15 categorías de construcción al mapa `CATEGORY_TO_SOURCE`:

```javascript
// ── Construcción ──
construction_budget_no_response: 'construccion',
construction_project_no_responsible: 'construccion',
construction_project_inactive: 'construccion',
construction_worker_no_report: 'construccion',
construction_collection_overdue: 'construccion',
construction_payment_overdue: 'construccion',
construction_payment_unjustified: 'construccion',
construction_document_pending: 'construccion',
construction_document_expired: 'construccion',
construction_incident_critical: 'construccion',
construction_incident_unreviewed: 'construccion',
construction_cost_overrun: 'construccion',
construction_cost_warning: 'construccion',
construction_project_unclosed: 'construccion',
construction_task_overdue: 'construccion',
```

#### Criterios de aceptación

- `normalizeSource('construccion')` devuelve `'construccion'` (no cae a `'sistema'`)
- `deriveSourceFromCategory('construction_budget_no_response')` devuelve `'construccion'`
- Las 15 categorías están registradas
- El centro de alertas puede filtrar por `source: 'construccion'`
- Sin regresión en las categorías existentes

---

### CONSTR-ALR-02 — Configuración de alertas de construcción

**Tipo:** Backend / Configuración
**Prioridad:** Critica (bloqueante)
**Estimación:** 2-3h
**Archivos:** `controllers/alertController.js`, `services/constructionAlertEngine.js`
**Depende de:** CONSTR-ALR-01

#### Descripción

Extender `account.alertConfig` con un bloque completo de toggles y umbrales para las alertas de construcción. El gerente puede activar/desactivar cada alerta y ajustar los umbrales desde la configuración.

#### Nuevos campos de configuración

```javascript
{
  // ── Construcción — Presupuestos ──
  constructionBudgetAlertEnabled: true,
  constructionBudgetNoResponseDays: 7,         // días sin respuesta del cliente tras envío

  // ── Construcción — Obras ──
  constructionProjectAlertEnabled: true,
  constructionProjectInactiveDays: 5,          // días sin partes ni actividad en obra activa
  constructionProjectUnclosedDays: 15,         // días tras finalización sin cierre administrativo

  // ── Construcción — Partes diarios ──
  constructionReportAlertEnabled: true,
  constructionReportCheckHour: 18,             // hora a partir de la cual alertar si no hay parte

  // ── Construcción — Cobros ──
  constructionCollectionAlertEnabled: true,
  constructionCollectionGraceDays: 3,          // días de gracia tras vencimiento del plazo

  // ── Construcción — Pagos ──
  constructionPaymentAlertEnabled: true,
  constructionPaymentOverdueDays: 7,           // días para pago vencido a proveedor/subcontrata
  constructionPaymentUnjustifiedDays: 15,      // días para pago sin justificante

  // ── Construcción — Documentación ──
  constructionDocumentAlertEnabled: true,
  constructionDocumentExpiryDays: 30,          // días antes de caducidad para warning
  constructionDocumentRequiredTypes: [          // tipos de documento obligatorios por trabajador
    'dni', 'seguridad_social', 'prevencion_riesgos',
    'seguro_responsabilidad', 'formacion_prl'
  ],

  // ── Construcción — Incidencias ──
  constructionIncidentAlertEnabled: true,
  constructionIncidentUnreviewedHours: 24,     // horas sin revisar una incidencia abierta

  // ── Construcción — Coste ──
  constructionCostAlertEnabled: true,
  constructionCostWarningPct: 80,              // % del presupuesto para warning
  constructionCostCriticalPct: 100,            // % del presupuesto para alerta critica

  // ── Construcción — Tareas ──
  constructionTaskAlertEnabled: true,
  constructionTaskOverdueDays: 2,              // días tras fecha límite para alertar
}
```

#### Tareas

- [ ] Añadir todas las claves al array `allowedKeys` en `updateAlertSettings()` de `alertController.js`
- [ ] Crear `getConstructionAlertConfig(account)` en `constructionAlertEngine.js` con defaults sensatos
- [ ] Validar tipos numéricos (parsear a `Number`, rechazar NaN y valores negativos)
- [ ] Validar que `constructionDocumentRequiredTypes` sea un array de strings
- [ ] Validar que `constructionReportCheckHour` esté entre 0 y 23

#### Criterios de aceptación

- `GET /api/alerts/:userId/config` devuelve todos los campos de construcción con defaults
- `PUT /api/alerts/:userId/config` acepta cualquier subconjunto de campos
- Valores fuera de rango se rechazan con 400 (ej: `constructionCostWarningPct: -5`)
- Cuentas sin configuración previa obtienen defaults automáticamente
- Sin regresión en la configuración existente de otras verticales

---

### CONSTR-ALR-03 — Motor de alertas de construcción (constructionAlertEngine)

**Tipo:** Backend / Servicio
**Prioridad:** Critica
**Estimación:** 8-10h
**Archivo principal:** `services/constructionAlertEngine.js`
**Depende de:** CONSTR-ALR-01, CONSTR-ALR-02

#### Descripción

Crear el motor de alertas específico de la vertical construcción como módulo independiente que se integra con el `alertEngine.js` genérico. Implementa las 10 reglas de detección requeridas, clasifica por prioridad y distribuye por rol.

#### Estructura del módulo

```javascript
// services/constructionAlertEngine.js

export function getConstructionAlertConfig(account) { ... }

// ── Reglas de detección ──
async function checkBudgetNoResponse(ctx, budgets, config) { ... }
async function checkProjectNoResponsible(ctx, projects, config) { ... }
async function checkProjectInactive(ctx, projects, reports, config) { ... }
async function checkWorkerNoReport(ctx, workers, projects, reports, config) { ... }
async function checkCollectionOverdue(ctx, budgets, config) { ... }
async function checkPaymentOverdue(ctx, budgets, projects, config) { ... }
async function checkDocumentPending(ctx, workers, projects, config) { ... }
async function checkIncidentCritical(ctx, incidents, config) { ... }
async function checkCostOverrun(ctx, projects, budgets, reports, config) { ... }
async function checkProjectUnclosed(ctx, projects, config) { ... }
async function checkTaskOverdue(ctx, tasks, reports, config) { ... }

// ── Orquestación ──
export async function runConstructionAlertsForBusiness(business) { ... }
export async function getConstructionAlertSummary(userId) { ... }
export function startConstructionAlertEngine() { ... }
export function stopConstructionAlertEngine() { ... }
```

#### Regla 1: Presupuesto sin respuesta (`construction_budget_no_response`)

```
Para cada construction_budget con estado === 'enviado':
  diasSinRespuesta = (hoy - updatedAt o fechaEnvio)

  Si diasSinRespuesta >= constructionBudgetNoResponseDays:
    → Alerta prioridad MEDIA
    → "Presupuesto [referencia] para obra [nombre] enviado hace X días sin respuesta del cliente."
    → Ruta: /saas/construction-budgets
    → Destinatario: Gerente
    → DedupKey: construction-budget-noresp-{budgetId}
```

#### Regla 2: Obra sin responsable (`construction_project_no_responsible`)

```
Para cada construction_project con estado ∈ {'planificación', 'en_obra'}:
  Si !responsable || responsable === '':
    → Alerta prioridad ALTA
    → "Obra [nombre] en estado [estado] no tiene responsable asignado."
    → Ruta: /saas/construction-projects
    → Destinatario: Gerente
    → DedupKey: construction-proj-noresp-{projectId}
```

#### Regla 3: Obra sin actividad / obra parada (`construction_project_inactive`)

```
Para cada construction_project con estado === 'en_obra':
  ultimoReporte = max(fecha) de construction_daily_report con obraId === projectId y estado === 'validado'
  diasSinActividad = (hoy - ultimoReporte)

  Si !ultimoReporte y diasDesdeCreacion >= constructionProjectInactiveDays:
    → Alerta prioridad ALTA
    → "Obra [nombre] en estado 'en obra' sin ningún parte registrado."

  Si ultimoReporte y diasSinActividad >= constructionProjectInactiveDays:
    → Alerta prioridad ALTA
    → "Obra [nombre] lleva X días sin actividad. Último parte: [fecha]."

  → Ruta: /saas/construction-projects
  → Destinatario: Gerente
  → DedupKey: construction-proj-inactive-{projectId}
```

#### Regla 4: Trabajador sin parte diario (`construction_worker_no_report`)

```
horaActual = new Date().getHours()
Si horaActual < constructionReportCheckHour: SKIP

Para cada construction_worker con activo === true:
  obraAsignada = buscar construction_project por obraAsignada del worker
  Si !obraAsignada || obraAsignada.estado !== 'en_obra': SKIP

  parteHoy = buscar construction_daily_report con trabajadorId === workerId y fecha === hoy
  Si !parteHoy:
    → Alerta prioridad MEDIA
    → "El trabajador [nombre] no ha registrado parte hoy en obra [obraNombre]."
    → Ruta: /saas/construction-execution
    → Destinatario: Gerente + Trabajador (el trabajador recibe solo la suya)
    → DedupKey: construction-noreport-{workerId}-{fecha}
```

#### Regla 5: Cobro vencido (`construction_collection_overdue`)

```
Para cada construction_budget con estado === 'aceptado':
  Para cada pago en budget.pagos[] con pagado === false:
    Si pago.fecha y (hoy - pago.fecha) > constructionCollectionGraceDays:
      diasVencido = (hoy - pago.fecha)
      importePendiente = pago.importe

      Si diasVencido > 30:
        → Alerta prioridad ALTA (level: 'alert')
      Si diasVencido > constructionCollectionGraceDays:
        → Alerta prioridad MEDIA (level: 'warning')

      → "Cobro de [importe]€ del presupuesto [referencia] (obra [nombre]) vencido hace X días."
      → Ruta: /saas/construction-budgets
      → Destinatario: Gerente
      → DedupKey: construction-collection-{budgetId}-{pagoId}
```

#### Regla 6: Pago vencido / sin justificar (`construction_payment_overdue`, `construction_payment_unjustified`)

```
PAGO VENCIDO:
Para cada construction_budget con estado === 'aceptado':
  Si tiene pagos a proveedores/subcontratas pendientes (campo pagosProveedor[] si existe,
  o extraído de las partidas del presupuesto con gremios vinculados):
    Si fechaVencimiento < hoy - constructionPaymentOverdueDays:
      → Alerta prioridad ALTA
      → "Pago pendiente a [gremio/proveedor] de X€ en obra [nombre] vencido hace Y días."
      → Ruta: /saas/construction-budgets
      → Destinatario: Gerente
      → DedupKey: construction-payoverdue-{budgetId}-{paymentRef}

PAGO SIN JUSTIFICAR:
Para cada pago registrado (pagos[] con pagado === true) que no tenga documentación adjunta:
  Si (hoy - pago.fecha) > constructionPaymentUnjustifiedDays:
    → Alerta prioridad MEDIA
    → "Pago de [importe]€ en presupuesto [referencia] registrado hace X días sin justificante."
    → Ruta: /saas/construction-budgets
    → Destinatario: Gerente
    → DedupKey: construction-payunjust-{budgetId}-{pagoId}
```

#### Regla 7: Documento pendiente / falta de documentos (`construction_document_pending`, `construction_document_expired`)

```
DOCUMENTOS DE TRABAJADOR:
Para cada construction_worker con activo === true:
  documentosActuales = worker.documentos || []
  documentosRequeridos = config.constructionDocumentRequiredTypes

  Para cada tipo en documentosRequeridos:
    docEncontrado = documentosActuales.find(d => d.tipo === tipo)

    Si !docEncontrado:
      → Alerta prioridad MEDIA — "Falta de documentos"
      → "Trabajador [nombre] no tiene [tipo de documento] registrado."
      → DedupKey: construction-docmissing-{workerId}-{tipo}

    Si docEncontrado y docEncontrado.fechaCaducidad:
      diasHastaCaducidad = (fechaCaducidad - hoy)

      Si diasHastaCaducidad < 0:
        → Alerta prioridad ALTA — "Documento caducado"
        → "[tipo] de [nombre] caducó hace X días."
        → DedupKey: construction-docexpired-{workerId}-{tipo}

      Si diasHastaCaducidad <= constructionDocumentExpiryDays y diasHastaCaducidad >= 0:
        → Alerta prioridad MEDIA — "Documento próximo a caducar"
        → "[tipo] de [nombre] caduca en X días ([fecha])."
        → DedupKey: construction-docexpiring-{workerId}-{tipo}

  → Ruta: /saas/construction-workers (o ficha del trabajador)
  → Destinatario: Gerente + Trabajador (el trabajador recibe solo las suyas)
```

#### Regla 8: Incidencia crítica (`construction_incident_critical`, `construction_incident_unreviewed`)

```
INCIDENCIA CRITICA:
Para cada construction_incident con gravedad === 'critica' y estado ∈ {'abierta', 'en_revision'}:
  → Alerta prioridad CRITICA
  → "Incidencia CRITICA [referencia] en obra [nombre]: [descripción corta]. Estado: [estado]."
  → Ruta: /saas/construction-execution (o ficha de incidencias)
  → Destinatario: Gerente + Trabajador asignado
  → DedupKey: construction-inc-critical-{incidentId}

INCIDENCIA SIN REVISAR:
Para cada construction_incident con estado === 'abierta':
  horasSinRevisar = (ahora - createdAt) / 3_600_000

  Si horasSinRevisar >= constructionIncidentUnreviewedHours:
    → Alerta prioridad ALTA
    → "Incidencia [referencia] en obra [nombre] lleva Xh sin revisar. Gravedad: [gravedad]."
    → Ruta: /saas/construction-execution
    → Destinatario: Gerente
    → DedupKey: construction-inc-unreviewed-{incidentId}
```

#### Regla 9: Coste disparado — desviación presupuestaria (`construction_cost_overrun`, `construction_cost_warning`)

```
Para cada construction_project con estado ∈ {'en_obra', 'finalizada'}:
  presupuesto = buscar construction_budget con proyectoId === projectId y estado === 'aceptado'
  Si !presupuesto: SKIP

  costePresupuestado = presupuesto.totalConMargen || 0
  Si costePresupuestado <= 0: SKIP

  costeAcumulado = project.costeAcumulado || 0
  porcentajeEjecucion = (costeAcumulado / costePresupuestado) * 100

  Si porcentajeEjecucion >= constructionCostCriticalPct:
    → Alerta prioridad ALTA (level: 'alert')
    → "Obra [nombre]: coste acumulado [X]€ SUPERA el presupuesto de [Y]€ (Z%)."
    → DedupKey: construction-costcritical-{projectId}

  Si porcentajeEjecucion >= constructionCostWarningPct y < constructionCostCriticalPct:
    → Alerta prioridad MEDIA (level: 'warning')
    → "Obra [nombre]: coste acumulado [X]€ alcanza el Z% del presupuesto de [Y]€."
    → DedupKey: construction-costwarn-{projectId}

  → Ruta: /saas/construction-budgets
  → Destinatario: Gerente
```

#### Regla 10: Obra finalizada sin cerrar (`construction_project_unclosed`)

```
Para cada construction_project con estado === 'finalizada':
  diasFinalizacion = (hoy - fechaFin o updatedAt cuando pasó a 'finalizada')

  Si diasFinalizacion >= constructionProjectUnclosedDays:
    cobrosCompletos = verificar que todos los pagos[] del presupuesto estén pagados
    documentacionCompleta = verificar documentos de cierre

    → Alerta prioridad MEDIA
    → "Obra [nombre] finalizada hace X días sin cierre administrativo."
    → Si !cobrosCompletos: añadir " Quedan Y cobros pendientes."
    → Si !documentacionCompleta: añadir " Falta documentación de cierre."
    → Ruta: /saas/construction-projects
    → Destinatario: Gerente
    → DedupKey: construction-unclosed-{projectId}
```

#### Regla 11 (bonus): Tarea de obra vencida (`construction_task_overdue`)

```
Para cada construction_task con estado ∈ {'pendiente', 'en_progreso'}:
  Si task.fechaLimite y (hoy - fechaLimite) > constructionTaskOverdueDays:
    diasVencida = (hoy - fechaLimite)

    → Alerta prioridad MEDIA
    → "Tarea [titulo] en obra [obraNombre] vencida hace X días. Asignada a [trabajadorNombre]."
    → Ruta: /saas/construction-execution
    → Destinatario: Gerente + Trabajador asignado
    → DedupKey: construction-taskoverdue-{taskId}
```

#### Orquestación principal

```javascript
export async function runConstructionAlertsForBusiness(business) {
  const ownerId = business.owner_user_id;
  const account = await findAccountByUserId(fakeReq, ownerId);
  const config = getConstructionAlertConfig(account);
  const businessId = business._id?.replace('business:', '') || '';
  const ctx = { businessId, userId: ownerId };

  // Cargar datos de la BD de construcción
  const [projects, budgets, workers, tasks, reports, incidents] = await Promise.all([
    fetchAllDocsOfType(getConstructionDbName(), 'construction_project', ownerId),
    fetchAllDocsOfType(getConstructionDbName(), 'construction_budget', ownerId),
    fetchAllDocsOfType(getConstructionDbName(), 'construction_worker', ownerId),
    fetchAllDocsOfType(getConstructionDbName(), 'construction_task', ownerId),
    fetchAllDocsOfType(getConstructionDbName(), 'construction_daily_report', ownerId),
    fetchAllDocsOfType(getConstructionDbName(), 'construction_incident', ownerId),
  ]);

  const results = [];

  results.push(...await checkBudgetNoResponse(ctx, budgets, config));
  results.push(...await checkProjectNoResponsible(ctx, projects, config));
  results.push(...await checkProjectInactive(ctx, projects, reports, config));
  results.push(...await checkWorkerNoReport(ctx, workers, projects, reports, config));
  results.push(...await checkCollectionOverdue(ctx, budgets, projects, config));
  results.push(...await checkPaymentOverdue(ctx, budgets, projects, config));
  results.push(...await checkDocumentPending(ctx, workers, config));
  results.push(...await checkIncidentCritical(ctx, incidents, projects, config));
  results.push(...await checkCostOverrun(ctx, projects, budgets, config));
  results.push(...await checkProjectUnclosed(ctx, projects, budgets, config));
  results.push(...await checkTaskOverdue(ctx, tasks, reports, config));

  return { businessId, alerts: results.filter(Boolean).length };
}
```

#### Criterios de aceptación

- Las 11 reglas tienen toggle on/off en configuración
- Cada regla tiene umbrales configurables
- Deduplicación diaria (24h, misma ventana que el motor genérico)
- Logs con tag `CONSTRUCTION_ALERT_ENGINE`
- Reglas que no encuentran datos no fallan ni emiten alertas vacías
- Las reglas de partes diarios e incidencias funcionan aunque CE-01/CE-02 no estén implementados aún (devuelven array vacío, sin error)
- Cada alerta incluye `entityId`, `entityType`, `route` y `metadata` contextuales

---

### CONSTR-ALR-04 — Distribución por perfil (gerente vs trabajador)

**Tipo:** Backend / Lógica
**Prioridad:** Alta
**Estimación:** 3-4h
**Archivos:** `services/constructionAlertEngine.js`, `services/sseService.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

Implementar la distribución diferenciada de alertas según el rol. El gerente recibe alertas globales de operación, dinero y documentación. El trabajador recibe solo alertas de sus obras, partes y tareas.

#### Diseño

```
ALERTA GENERADA
      │
      ├─── metadata.audience incluye 'manager'?
      │         │
      │         └── SÍ → emitGlobalAlert para userId del owner/admin
      │                   + broadcastToBusiness (evento 'construction_alert')
      │
      └─── metadata.audience incluye 'worker'?
                │
                └── SÍ → Para cada trabajador afectado:
                          emitGlobalAlert con userId del trabajador
                          + broadcastToUser (evento 'construction_alert')
```

#### Mapa de distribución

| Alerta | Gerente | Trabajador afectado |
|---|---|---|
| Presupuesto sin respuesta | SI | NO |
| Obra sin responsable | SI | NO |
| Obra sin actividad | SI | NO |
| Trabajador sin parte | SI | SI (solo el suyo) |
| Cobro vencido | SI | NO |
| Pago vencido | SI | NO |
| Pago sin justificar | SI | NO |
| Documento pendiente | SI | SI (solo los suyos) |
| Documento caducado | SI | SI (solo los suyos) |
| Incidencia critica | SI | SI (trabajador asignado/reportador) |
| Incidencia sin revisar | SI | NO |
| Coste disparado | SI | NO |
| Obra finalizada sin cerrar | SI | NO |
| Tarea vencida | SI | SI (trabajador asignado) |

#### Tareas

- [ ] Añadir campo `audience` al metadata de cada alerta: `['manager']`, `['worker']` o `['manager', 'worker']`
- [ ] Añadir campo `targetWorkerId` en alertas dirigidas a un trabajador específico
- [ ] Crear helper `getConstructionWorkerUserId(workerId)` que resuelve el `user_id` del trabajador (de la relación `construction_worker` → equipo del negocio)
- [ ] Modificar la emisión para iterar sobre destinatarios según `audience`
- [ ] Añadir evento SSE `construction_alert` diferenciado del `notification` genérico
- [ ] El trabajador solo recibe alertas de las últimas 24h (ventana operativa)
- [ ] No duplicar alertas si el gerente también es trabajador en una obra

#### Criterios de aceptación

- El gerente ve en su dashboard TODAS las alertas de construcción del negocio
- El trabajador solo ve: su parte pendiente, sus documentos, sus tareas vencidas, incidencias de su obra
- No se duplican alertas (si el gerente es el trabajador, no recibe doble)
- Evento SSE `construction_alert` con campo `audience` para que el frontend filtre

---

### CONSTR-ALR-05 — Integración con Dashboard de construcción (KPIs)

**Tipo:** Backend / API
**Prioridad:** Alta
**Estimación:** 3-4h
**Archivo:** `index.js` (handler GET /api/dashboard/kpis), `services/constructionAlertEngine.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

Extender el endpoint de KPIs del dashboard para incluir un bloque específico de alertas de construcción cuando el negocio sea de tipo constructora. Se integra con el array `dashAlerts` existente.

#### Nuevos KPIs

```javascript
constructionKpis: {
  // Obras
  obrasActivas: 3,                  // estado === 'en_obra'
  obrasPausadas: 1,                 // estado === 'pausada'
  obrasSinResponsable: 1,           // en_obra o planificación sin responsable
  obrasFinalizadasSinCerrar: 0,     // finalizadas hace > N días sin cierre

  // Presupuestos
  presupuestosPendientes: 2,        // estado === 'enviado'
  presupuestosSinRespuesta: 1,      // enviados hace > N días
  cobrosVencidos: 3,                // pagos[] con pagado === false y fecha vencida
  importeCobrosPendientes: 15000,   // Σ importe de cobros vencidos

  // Ejecución
  partesHoy: 4,                     // partes de hoy
  partesPendientesValidacion: 2,    // estado === 'enviado'
  trabajadoresSinParte: 3,          // activos en obra activa sin parte hoy
  incidenciasAbiertas: 1,           // estado === 'abierta'
  incidenciasCriticas: 0,           // gravedad === 'critica' y no cerrada

  // Costes
  obraConMayorDesviacion: {         // obra con mayor % de desviación
    nombre: 'Reforma local',
    presupuesto: 50000,
    costeAcumulado: 42000,
    porcentaje: 84,
  },

  // Documentación
  documentosFaltantes: 5,           // total de docs requeridos sin registrar
  documentosCaducados: 1,           // docs con fecha de caducidad pasada

  // Pagos
  pagosVencidos: 2,                 // pagos a proveedores/subcontratas vencidos
  importePagosVencidos: 8500,       // Σ importe de pagos vencidos
}
```

#### Nuevas dashAlerts (para negocio construcción)

```javascript
{ id: 'construction_collection_overdue', severity: 'error',
  type: 'construction_collection_overdue',
  message: '3 cobros vencidos — 15.000 € pendientes',
  count: 3, route: '/saas/construction-budgets' }

{ id: 'construction_incident_critical', severity: 'error',
  type: 'construction_incident_critical',
  message: 'Incidencia CRITICA en obra Reforma Local',
  count: 1, route: '/saas/construction-execution' }

{ id: 'construction_project_inactive', severity: 'warning',
  type: 'construction_project_inactive',
  message: '1 obra sin actividad en los últimos 5 días',
  count: 1, route: '/saas/construction-projects' }

{ id: 'construction_worker_no_report', severity: 'warning',
  type: 'construction_worker_no_report',
  message: '3 trabajadores sin parte hoy',
  count: 3, route: '/saas/construction-execution' }

{ id: 'construction_cost_overrun', severity: 'error',
  type: 'construction_cost_overrun',
  message: 'Obra "Reforma Local" supera presupuesto (112%)',
  count: 1, route: '/saas/construction-budgets' }

{ id: 'construction_document_expired', severity: 'warning',
  type: 'construction_document_expired',
  message: '1 documento caducado, 5 faltantes',
  count: 6, route: '/saas/construction-workers' }

{ id: 'construction_budget_no_response', severity: 'info',
  type: 'construction_budget_no_response',
  message: '1 presupuesto sin respuesta hace 12 días',
  count: 1, route: '/saas/construction-budgets' }

{ id: 'construction_project_unclosed', severity: 'info',
  type: 'construction_project_unclosed',
  message: '1 obra finalizada sin cierre administrativo',
  count: 1, route: '/saas/construction-projects' }
```

#### Tareas

- [ ] Detectar `account.businessType === 'construction'` (o vertical activa) en el handler de KPIs
- [ ] Fetch de datos: proyectos, presupuestos, trabajadores, partes del día, incidencias
- [ ] Calcular `constructionKpis` con los conteos y sumatorios
- [ ] Generar `dashAlerts` específicos según condiciones (solo los que apliquen)
- [ ] Incluir `constructionKpis` en el response solo para negocios de construcción
- [ ] Respetar caché existente (`TTL_PRESETS.KPI`)
- [ ] No alterar el comportamiento para otros tipos de negocio

#### Criterios de aceptación

- Endpoint `/api/dashboard/kpis/:userId` para negocio construcción devuelve campo `constructionKpis`
- Las dashAlerts de construcción aparecen junto a las genéricas
- KPIs reflejan datos en tiempo real (con caché de 5 min)
- No impactar performance para otros tipos de negocio

---

### CONSTR-ALR-06 — Endpoint resumen de alertas de construcción

**Tipo:** Backend / API
**Prioridad:** Alta
**Estimación:** 2-3h
**Archivos:** `controllers/constructionController.js`, `services/constructionAlertEngine.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

Crear un endpoint dedicado que devuelva el resumen completo de alertas activas de construcción, análogo a `getAlertSummary()` pero específico para la vertical. Se usa en el centro de alertas del frontend y en el dashboard de construcción.

#### Endpoint

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/construction/alerts/:userId/summary` | Resumen de alertas de construcción |

#### Response

```json
{
  "ok": true,
  "updatedAt": "2026-04-14T18:00:00Z",
  "config": { "...constructionAlertConfig..." },
  "totals": {
    "critical": 2,
    "warning": 8,
    "info": 3,
    "total": 13
  },
  "presupuestos": {
    "sinRespuesta": [
      { "id": "cbud-xxx", "referencia": "PRES-001", "obraNombre": "Reforma", "diasEnviado": 12 }
    ],
    "cobrosVencidos": [
      { "id": "cbud-xxx", "referencia": "PRES-002", "pagoId": 2, "importe": 5000, "diasVencido": 8 }
    ],
    "totalCobrosVencidos": 15000
  },
  "obras": {
    "sinResponsable": [
      { "id": "cprj-xxx", "nombre": "Nave industrial", "estado": "en_obra" }
    ],
    "sinActividad": [
      { "id": "cprj-xxx", "nombre": "Reforma local", "diasInactiva": 7, "ultimoParte": "2026-04-07" }
    ],
    "finalizadasSinCerrar": [
      { "id": "cprj-xxx", "nombre": "Chalet", "diasFinalizada": 20, "cobrosCompletos": false }
    ]
  },
  "ejecucion": {
    "trabajadoresSinParte": [
      { "workerId": "cwrk-xxx", "nombre": "Juan García", "obraNombre": "Reforma" }
    ],
    "incidenciasCriticas": [
      { "id": "cinc-xxx", "referencia": "INC-001", "obraNombre": "Nave", "gravedad": "critica", "horasAbierta": 5 }
    ],
    "incidenciasSinRevisar": [
      { "id": "cinc-xxx", "referencia": "INC-002", "obraNombre": "Reforma", "horasSinRevisar": 28 }
    ]
  },
  "costes": {
    "desviaciones": [
      { "projectId": "cprj-xxx", "nombre": "Reforma", "presupuesto": 50000, "costeAcumulado": 42000, "porcentaje": 84 }
    ],
    "superados": [
      { "projectId": "cprj-xxx", "nombre": "Nave", "presupuesto": 100000, "costeAcumulado": 112000, "porcentaje": 112 }
    ]
  },
  "documentacion": {
    "faltantes": [
      { "workerId": "cwrk-xxx", "nombre": "Pedro López", "tipoFaltante": "prevencion_riesgos" }
    ],
    "caducados": [
      { "workerId": "cwrk-xxx", "nombre": "Ana Ruiz", "tipo": "seguro_responsabilidad", "caducadoHace": 15 }
    ],
    "proximosACaducar": [
      { "workerId": "cwrk-xxx", "nombre": "Luis Torres", "tipo": "formacion_prl", "diasRestantes": 12 }
    ]
  },
  "pagos": {
    "vencidos": [
      { "budgetId": "cbud-xxx", "referencia": "PRES-001", "obraNombre": "Reforma", "importe": 3500, "diasVencido": 10 }
    ],
    "sinJustificar": [
      { "budgetId": "cbud-xxx", "referencia": "PRES-002", "pagoId": 1, "importe": 2000, "diasSinJustificar": 20 }
    ],
    "totalVencidos": 8500
  }
}
```

#### Tareas

- [ ] Crear `getConstructionAlertSummary(userId)` en `constructionAlertEngine.js`
- [ ] Crear handler `getConstructionAlerts` en `constructionController.js`
- [ ] Añadir ruta `GET /api/construction/alerts/:userId/summary` al `constructionRouter.js`
- [ ] Calcular todos los bloques con datos actuales (no usar caché para summary)
- [ ] Ordenar arrays por severidad/urgencia (más grave primero)

#### Criterios de aceptación

- El endpoint devuelve datos en tiempo real (sin caché o TTL corto de 60s)
- Todos los bloques son opcionales (si no hay incidencias, `ejecucion.incidenciasCriticas` es `[]`)
- Los totals reflejan la suma real de alertas por gravedad
- Compatible con los filtros del centro de alertas core

---

### CONSTR-ALR-07 — Integración con Centro de Alertas Core

**Tipo:** Backend / Integración
**Prioridad:** Alta
**Estimación:** 2h
**Archivos:** `services/alertEngine.js`, `controllers/alertCenterController.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

Las alertas de construcción deben aparecer en el centro de alertas unificado (`/api/alerts/:businessId/center`) junto a las de otras verticales. Al usar `emitGlobalAlert()`, las alertas ya se persisten en la DB de notificaciones, pero hay que asegurar que el resumen global (`getAlertSummary`) las incluye y que los filtros del centro las soportan.

#### Tareas

- [ ] Verificar que `emitGlobalAlert()` persiste correctamente las alertas de construcción en la DB `notifications`
- [ ] Verificar que las alertas emitidas incluyen `source: 'construccion'` para que `listAlertsByBusiness` las devuelva al filtrar por source
- [ ] Incluir conteo de alertas de construcción en `getAlertsSummary()`:
  ```javascript
  construccion: {
    total: X,
    byPriority: { high: X, medium: Y, low: Z },
    byCategory: {
      construction_collection_overdue: N,
      construction_incident_critical: N,
      // ... etc
    }
  }
  ```
- [ ] Verificar que el filtro `source=construccion` funciona en `GET /api/alerts/:businessId/center`
- [ ] Verificar que la asignación de alertas (`assignAlert`) funciona con alertas de construcción

#### Criterios de aceptación

- Las alertas de construcción aparecen en el listado del centro de alertas filtrando por `source=construccion`
- El resumen global incluye sección `construccion` con conteos
- Los filtros de prioridad, estado y fecha funcionan con alertas de construcción
- La asignación y cambio de estado funcionan correctamente
- Sin regresión en alertas de otras verticales

---

### CONSTR-ALR-08 — Arranque y registro del motor en index.js

**Tipo:** Backend / Integración
**Prioridad:** Alta
**Estimación:** 1h
**Archivo:** `index.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

Registrar el motor de alertas de construcción en el arranque del servidor y montar la ruta del endpoint de resumen.

#### Tareas

- [ ] Importar `startConstructionAlertEngine`, `stopConstructionAlertEngine` de `services/constructionAlertEngine.js`
- [ ] Añadir llamada en el bloque de arranque:
  ```javascript
  startConstructionAlertEngine();
  ```
- [ ] Montar ruta del endpoint de alertas en el router de construcción (ya montado como `/api/construction`)
- [ ] Asegurar delay de inicio posterior al del motor genérico (ej: 25s vs 15s)
- [ ] Añadir log: `Motor de alertas de construcción arrancado`
- [ ] Exportar `stopConstructionAlertEngine()` para shutdown limpio
- [ ] Intervalo del motor: cada 30 minutos (más frecuente que el genérico de 1h, porque construcción necesita detectar inactividad y vencimientos con agilidad)

#### Criterios de aceptación

- El motor arranca sin errores aunque no haya negocios de construcción
- Los logs muestran arranque con tag `CONSTRUCTION_ALERT_ENGINE`
- El motor se detiene limpiamente en shutdown
- No interfiere con el motor genérico ni con otros motores de vertical

---

### CONSTR-ALR-09 — Extensión del modelo de presupuesto para soportar alertas de pago

**Tipo:** Backend / Modelos
**Prioridad:** Media
**Estimación:** 2-3h
**Archivo:** `services/couchdb.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

El modelo actual de `construction_budget` tiene `pagos[]` para cobros al cliente, pero no tiene campos para pagos a proveedores/subcontratas ni para justificantes de pago. Necesitamos extender el modelo para que las reglas de "pago vencido" y "pago sin justificar" tengan datos sobre los que operar.

#### Campos nuevos en `buildConstructionBudgetDocument`

```javascript
// ── Pagos a proveedores/subcontratas ──
pagosProveedor: Array.isArray(data.pagosProveedor) ? data.pagosProveedor : (existing?.pagosProveedor || []),
// Cada elemento: {
//   id: Number,
//   gremioId: String,          // ID del gremio/subcontrata
//   gremioNombre: String,
//   concepto: String,          // 'Mano de obra fontanería', 'Material eléctrico', etc.
//   importe: Number,
//   fechaVencimiento: String,  // YYYY-MM-DD
//   pagado: Boolean,
//   fechaPago: String,         // YYYY-MM-DD (cuando se pagó)
//   justificante: String,     // URL o referencia del justificante
//   observaciones: String,
// }

// ── Justificantes en pagos al cliente (extender pagos[] existente) ──
// Cada pago existente pasa a incluir opcionalmente:
//   justificante: String,     // URL o referencia del justificante recibido
//   metodo: String,           // 'transferencia' | 'cheque' | 'efectivo' | 'otro'
```

#### Tareas

- [ ] Extender `buildConstructionBudgetDocument` con campo `pagosProveedor`
- [ ] Extender `sanitizeConstructionBudget` para incluir `pagosProveedor`
- [ ] Extender los objetos dentro de `pagos[]` con `justificante` y `metodo` opcionales
- [ ] Añadir al controller `registerSupplierPayment` (endpoint nuevo):
  ```
  POST /api/construction/budgets/:userId/:id/supplier-pay
  Body: { pagoProveedorId }
  ```
- [ ] Añadir al router la ruta correspondiente
- [ ] Actualizar tipo TS `ConstructionBudget` si existe

#### Criterios de aceptación

- `pagosProveedor` se persiste y se lee correctamente
- Los pagos existentes (`pagos[]`) aceptan `justificante` sin romper compatibilidad
- El endpoint `supplier-pay` marca un pago proveedor como pagado
- Los datos están disponibles para las reglas CONSTR-ALR-03 (reglas 5 y 6)

---

### CONSTR-ALR-10 — Extensión del modelo de trabajador para documentación obligatoria

**Tipo:** Backend / Modelos
**Prioridad:** Media
**Estimación:** 2h
**Archivo:** `services/couchdb.js`
**Depende de:** CONSTR-ALR-03

#### Descripción

El modelo `construction_worker` tiene `documentos[]` pero no está estructurado de forma que permita validar tipos obligatorios ni fechas de caducidad. Necesitamos estandarizar la estructura para que la regla de "documento pendiente" pueda evaluarla.

#### Estructura estandarizada de `documentos[]`

```javascript
documentos: Array.isArray(data.documentos) ? data.documentos.map(d => ({
  id: String(d.id || uuidv4()),
  tipo: String(d.tipo || ''),
  // Tipos conocidos: 'dni', 'seguridad_social', 'prevencion_riesgos',
  //   'seguro_responsabilidad', 'formacion_prl', 'contrato',
  //   'reconocimiento_medico', 'permiso_trabajo', 'otro'
  nombre: String(d.nombre || ''),
  url: String(d.url || ''),
  fechaEmision: String(d.fechaEmision || ''),
  fechaCaducidad: String(d.fechaCaducidad || ''),   // YYYY-MM-DD, vacío si no caduca
  verificado: Boolean(d.verificado ?? false),
  verificadoPor: String(d.verificadoPor || ''),
  verificadoAt: String(d.verificadoAt || ''),
  observaciones: String(d.observaciones || ''),
})) : (existing?.documentos || []),
```

#### Tareas

- [ ] Estandarizar la estructura de `documentos[]` en `buildConstructionWorkerDocument`
- [ ] Asegurar retrocompatibilidad (documentos existentes sin `tipo` no rompen)
- [ ] Añadir constante `CONSTRUCTION_REQUIRED_DOCUMENTS` con tipos obligatorios por defecto
- [ ] Actualizar `sanitizeConstructionWorker` para incluir la estructura completa
- [ ] Actualizar tipo TS si existe

#### Criterios de aceptación

- Cada documento tiene `tipo`, `fechaCaducidad` y `verificado`
- Los tipos obligatorios están definidos como constante
- Documentos existentes sin la nueva estructura no causan errores
- La regla CONSTR-ALR-03 (regla 7) puede evaluar documentación completa

---

## Mapa de conexiones

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MAPA DE CONEXIONES                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │Presupuestos │  │   Obras     │  │Planificación│  │  Ejecución  │            │
│  │construction │  │construction │  │construction │  │construction │            │
│  │  _budget    │  │  _project   │  │  _task      │  │_daily_report│            │
│  │(pagos,      │  │(estado,     │  │(fechaLimite,│  │(fecha,horas,│            │
│  │ cobros,     │  │ responsable,│  │ trabajador, │  │ materiales) │            │
│  │ proveedor)  │  │ progreso)   │  │ estado)     │  │             │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                 │                    │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐            │
│  │   Cobros    │  │Trabajadores │  │ Incidencias │  │   Fichajes  │            │
│  │ (pagos[]   │  │construction │  │construction │  │  clockins   │            │
│  │  del budget)│  │  _worker    │  │  _incident  │  │(verificación│            │
│  │             │  │(documentos, │  │(gravedad,   │  │  cruzada)   │            │
│  │             │  │ obra, grem.)│  │ estado)     │  │             │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘            │
│         │                │                │                                      │
│         └────────────────┼────────────────┘                                      │
│                          ▼                                                       │
│              ┌───────────────────────┐                                           │
│              │ constructionAlert     │                                           │
│              │    Engine.js          │                                           │
│              │ (11 reglas de alerta) │                                           │
│              └───────────┬───────────┘                                           │
│                          │                                                       │
│           ┌──────────────┼──────────────┬────────────────┐                      │
│           ▼              ▼              ▼                ▼                       │
│    ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐           │
│    │  Dashboard │ │  Centro de │ │   Push /   │ │    Pantalla      │           │
│    │Construcción│ │  Alertas   │ │    SSE     │ │   del trabajador │           │
│    │  (gerente) │ │   Core     │ │  (tiempo   │ │  (móvil / obra)  │           │
│    │            │ │(unificado) │ │   real)    │ │                  │           │
│    └────────────┘ └────────────┘ └────────────┘ └──────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Conexiones detalladas

| Fuente | Datos que lee el motor | Para qué regla |
|---|---|---|
| **Presupuestos** (`construction_budget`) | `estado`, `pagos[]`, `pagosProveedor[]`, `totalConMargen`, `proyectoId` | R1 (sin respuesta), R5 (cobro), R6 (pago), R9 (coste) |
| **Obras** (`construction_project`) | `estado`, `responsable`, `costeAcumulado`, `fechaFin`, `progreso` | R2 (sin responsable), R3 (inactiva), R9 (coste), R10 (sin cerrar) |
| **Trabajadores** (`construction_worker`) | `activo`, `obraAsignada`, `documentos[]` | R4 (sin parte), R7 (documentos) |
| **Tareas** (`construction_task`) | `estado`, `fechaLimite`, `trabajadorId` | R11 (tarea vencida) |
| **Partes diarios** (`construction_daily_report`) | `fecha`, `trabajadorId`, `obraId`, `estado` | R3 (inactiva), R4 (sin parte) |
| **Incidencias** (`construction_incident`) | `gravedad`, `estado`, `createdAt`, `obraId` | R8 (crítica, sin revisar) |
| **Fichajes** (`clockins`) | Verificación cruzada horas | Contexto adicional (no bloquea) |

| Destino | Cómo llegan las alertas |
|---|---|
| **Dashboard construcción** | `GET /api/dashboard/kpis/:userId` → `constructionKpis` + `dashAlerts` |
| **Centro de alertas core** | `emitGlobalAlert()` → DB `notifications` → `GET /api/alerts/:businessId/center?source=construccion` |
| **Endpoint resumen** | `GET /api/construction/alerts/:userId/summary` → resumen específico |
| **SSE tiempo real** | `broadcastToBusiness(businessId, 'construction_alert', data)` |
| **Push web** | `sendPushToUser()` para alertas de prioridad critica |
| **Pantalla trabajador** | SSE `construction_alert` filtrado por `audience: 'worker'` |

---

## Clasificación por prioridad y rol

### Matriz de prioridad

| Prioridad | Color | Nivel | Ejemplo | Acción esperada |
|---|---|---|---|---|
| **Critica** | Rojo | `alert` | Incidencia critica, coste superado | Acción inmediata, push notification |
| **Alta** | Naranja | `warning` | Cobro vencido >30d, obra sin responsable, incidencia sin revisar | Atender en el día |
| **Media** | Amarillo | `warning` | Presupuesto sin respuesta, trabajador sin parte, documento faltante | Revisar en 24-48h |
| **Informativa** | Verde | `info` | Obra finalizada sin cerrar, tarea próxima a vencer | Solo registro |

### Orden de ejecución por impacto

```
 1. 🔴 construction_incident_critical         — Riesgo de seguridad / paralización
 2. 🔴 construction_cost_overrun              — Pérdida económica directa
 3. 🔴 construction_collection_overdue (>30d) — Morosidad grave
 4. 🟠 construction_project_no_responsible    — Obra sin gobierno
 5. 🟠 construction_project_inactive          — Obra parada = dinero perdido
 6. 🟠 construction_payment_overdue           — Riesgo de incumplimiento
 7. 🟠 construction_incident_unreviewed       — Riesgo no gestionado
 8. 🟠 construction_document_expired          — Riesgo legal / laboral
 9. 🟡 construction_worker_no_report          — Falta de trazabilidad
10. 🟡 construction_collection_overdue (<30d) — Cobro pendiente
11. 🟡 construction_cost_warning              — Desviación en curso
12. 🟡 construction_budget_no_response        — Oportunidad perdida
13. 🟡 construction_document_pending          — Documentación incompleta
14. 🟡 construction_payment_unjustified       — Auditoría pendiente
15. 🟢 construction_project_unclosed          — Cierre administrativo
16. 🟢 construction_task_overdue              — Planificación retrasada
```

### Canales por tipo de alerta

| Alerta | Dashboard | Centro Alertas Core | SSE | Push | Trabajador |
|---|---|---|---|---|---|
| Incidencia critica | SI | SI | SI | SI | SI |
| Coste superado | SI | SI | SI | SI | NO |
| Cobro vencido >30d | SI | SI | SI | SI | NO |
| Obra sin responsable | SI | SI | SI | NO | NO |
| Obra parada | SI | SI | SI | NO | NO |
| Pago vencido | SI | SI | SI | NO | NO |
| Incidencia sin revisar | SI | SI | SI | NO | NO |
| Documento caducado | SI | SI | SI | NO | SI |
| Trabajador sin parte | SI | SI | SI | NO | SI |
| Cobro vencido <30d | SI | SI | SI | NO | NO |
| Coste warning | SI | SI | SI | NO | NO |
| Presupuesto sin respuesta | SI | SI | NO | NO | NO |
| Documento faltante | SI | SI | NO | NO | SI |
| Pago sin justificar | SI | SI | NO | NO | NO |
| Obra sin cerrar | SI | SI | NO | NO | NO |
| Tarea vencida | SI | SI | SI | NO | SI |

---

## Orden de implementación

```
Fase 1 — Cimientos (día 1-2)
  CONSTR-ALR-01  Constantes y categorías      ← Bloqueante para todo
  CONSTR-ALR-02  Configuración alertas         ← Bloqueante para motor

Fase 2 — Motor core (día 3-5)
  CONSTR-ALR-03  Motor constructionAlertEngine ← Core del módulo (11 reglas)
  CONSTR-ALR-08  Arranque en index.js          ← Poner en marcha

Fase 3 — Distribución y destinos (día 5-7)
  CONSTR-ALR-04  Distribución gerente/trabajador
  CONSTR-ALR-05  Dashboard KPIs
  CONSTR-ALR-06  Endpoint resumen
  CONSTR-ALR-07  Integración centro alertas core

Fase 4 — Modelos extendidos (día 7-8)
  CONSTR-ALR-09  Extensión presupuesto (pagos proveedor)
  CONSTR-ALR-10  Extensión trabajador (documentación)
```

### Diagrama de dependencias

```
CONSTR-ALR-01 (Constantes)
 └── CONSTR-ALR-02 (Configuración)
      └── CONSTR-ALR-03 (Motor — 11 reglas)  ←── núcleo
           ├── CONSTR-ALR-04 (Distribución por rol)
           ├── CONSTR-ALR-05 (Dashboard KPIs)
           ├── CONSTR-ALR-06 (Endpoint resumen)
           ├── CONSTR-ALR-07 (Centro alertas core)
           ├── CONSTR-ALR-08 (Arranque index.js)
           ├── CONSTR-ALR-09 (Extensión presupuesto)  ← mejora reglas 5,6
           └── CONSTR-ALR-10 (Extensión trabajador)    ← mejora regla 7
```

---

## Estimación total

| Ticket | Estimación | Fase |
|---|---|---|
| CONSTR-ALR-01 | 1h | 1 |
| CONSTR-ALR-02 | 2-3h | 1 |
| CONSTR-ALR-03 | 8-10h | 2 |
| CONSTR-ALR-04 | 3-4h | 3 |
| CONSTR-ALR-05 | 3-4h | 3 |
| CONSTR-ALR-06 | 2-3h | 3 |
| CONSTR-ALR-07 | 2h | 3 |
| CONSTR-ALR-08 | 1h | 2 |
| CONSTR-ALR-09 | 2-3h | 4 |
| CONSTR-ALR-10 | 2h | 4 |
| **TOTAL** | **~26-33h** | **~8 días** |

---

## Relación con otros tickets

| Ticket externo | Relación |
|---|---|
| **CE-01** (Modelo parte diario) | CONSTR-ALR-03 lee `construction_daily_report` para las reglas 3 y 4. Si CE-01 no está implementado, las reglas devuelven array vacío sin error. |
| **CE-02** (Modelo incidencia) | CONSTR-ALR-03 lee `construction_incident` para la regla 8. Misma tolerancia que CE-01. |
| **CE-03** (API partes) | Los endpoints de partes alimentan los datos que evalúa el motor. |
| **CE-07** (Automatizaciones) | CE-07 actualiza `costeAcumulado` y `horasAcumuladas` en la obra al validar partes. CONSTR-ALR-03 (regla 9) lee esos campos. |
| **CE-08** (Alertas básicas) | Este documento **amplía y reemplaza** CE-08 con un diseño mucho más completo (11 reglas vs 4, distribución por rol, dashboard, centro core). |
| **CARNICERIA-ALERTAS-BACKEND** | Mismo patrón de motor vertical independiente. Comparten `emitGlobalAlert()` via `alertEmitter.js`. |
| **ALERTAS-DELIVERY-BACKEND** | Mismo patrón. Delivery usa ciclo rápido (60s); construcción usa 30 min (es menos urgente que delivery). |

---

## Notas técnicas

### Naming conventions

- Archivo: `services/constructionAlertEngine.js`
- Tipos de alerta: prefijo `construction_` (ej: `construction_budget_no_response`)
- Eventos SSE: `construction_alert`
- IDs de dedup: `construction-{tipo}-{entityId}` (ej: `construction-budget-noresp-cbud-xxx`)
- Source: `construccion`
- Tag de logs: `CONSTRUCTION_ALERT_ENGINE`

### Eficiencia

- El motor se ejecuta cada 30 minutos (construcción es urgente pero no tanto como delivery)
- Una sola query a la BD `*-construction` cargando todos los documentos, filtrados en memoria por tipo
- `fetchAllDocsOfType` reutiliza el helper existente de `alertEngine.js`
- Deduplicación diaria (24h) alineada con el motor genérico

### Compatibilidad

- El motor genérico (`alertEngine.js`) sigue funcionando sin cambios
- Las alertas de construcción se emiten con `emitGlobalAlert()`, misma infraestructura
- Los endpoints existentes de `alertController.js` y `alertCenterController.js` soportan las nuevas alertas sin modificaciones (gracias al registro de source y categorías)
- Los modelos de CouchDB se extienden de forma retrocompatible (campos nuevos opcionales)
