# PARTES DE TRABAJO Y EJECUCIÓN (Construcción) — Plan de Tickets

**Página:** `/saas/construction-execution`
**URL pública:** `https://udaredge.com/saas/vertical/construccion/ejecucion`
**Objetivo:** Registrar el trabajo diario de cada obra: quién hizo qué, cuántas horas, con qué materiales, fotos de evidencia y observaciones; validar partes como gerente.
**Tipo:** Módulo dentro de la vertical Construcción.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de obras (proyectos) con estado, progreso y fechas | Completo | `constructionRouter.js` → `constructionController.js` — tipo `construction_project` |
| Modelo `construction_project` con `estado` (`planificación`, `en_obra`, `pausada`, `finalizada`), `progreso` 0–100 | Completo | `couchdb.js` → `buildConstructionProjectDocument` |
| CRUD de trabajadores con obra asignada y gremio | Completo | `constructionRouter.js` → tipo `construction_worker` (`cwrk-*`) |
| Modelo `construction_worker` con `gremio`, `obraAsignada`, `obraNombre`, `documentos[]`, `activo` | Completo | `couchdb.js` → `buildConstructionWorkerDocument` |
| CRUD de tareas de obra con trabajador, gremio, fotos, notas | Completo | `constructionRouter.js` → tipo `construction_task` (`ctsk-*`) |
| Modelo `construction_task` con `obraId`, `trabajadorId`, `gremio`, `prioridad`, `estado`, `fotos[]`, `notasAdmin`, `notasTrabajador` | Completo | `couchdb.js` → `buildConstructionTaskDocument` |
| CRUD de gremios/subcontratas con precios (materiales, mano obra, estructural) | Completo | `constructionRouter.js` → tipo `construction_guild` (`cgld-*`) |
| Presupuestos con partidas por gremio y control de pagos | Completo | `constructionRouter.js` → tipo `construction_budget` (`cbud-*`) |
| Sistema de fichajes genérico (`clockins`) con geolocalización | Completo | `clockinsRouter.js`, `clockinsController.js` — DB `*-clockins` |
| Estadísticas de fichajes (minutos, descansos, por miembro) | Completo | `clockinsController.js` → `getStats` |
| Roles gerente/trabajador en fichajes (Admin ve todo, trabajador ve lo suyo) | Completo | `clockinsController.js` — `ADMIN_ROLES`, organigrama |
| Pedidos de compra y stock | Completo | `purchaseOrderRouter.js` — DB separada |
| Catálogo vertical construcción (material de construcción, categorías, unidades m²/m³) | Completo | `verticalCatalog.js` → clave `construction` |
| Motor de alertas (estructura) | Parcial | `alertConstants.js` — **no integra construcción** |
| Login de equipo (modo worker) + rutas `/saas/worker/*` | Completo | `TeamLogin.tsx`, rutas worker |
| TPV Trabajador Construcción | Completo | `WorkerTpvConstruction.tsx` |
| Dashboard de construcción | Parcial | `ConstructionDashboard.tsx` — estructura existe pero sin KPIs de partes |
| Sidebar grupo Construcción | Completo | `Sidebar.tsx` — 6 items (proyectos, presupuestos, maquinaria, materiales, subcontratistas, planos) |
| App móvil vía Capacitor | Completo | `capacitor.config.ts`, scripts `cap:sync` |
| Demo UI de partes (mock en src-delivery) | Solo mock | `src-delivery/…/PartesTab.tsx`, `ParteDrawer.tsx` — sin API ni datos reales |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| **Entidad `construction_daily_report` (parte diario de obra)** | No existe |
| **Entidad `construction_incident` (incidencia de obra)** | No existe |
| **Entidad `construction_material_usage` (consumo de material vinculado a parte)** | No existe |
| API REST para partes diarios (CRUD + validación + filtros por obra/trabajador/fecha) | No existe |
| API REST para incidencias de obra | No existe |
| Página `/saas/construction-execution` con listado de partes | No existe |
| Formulario de creación/edición de parte diario (trabajador, fecha, obra, gremio, tarea, horas, materiales, fotos, observaciones, incidencia) | No existe |
| Drawer de detalle de parte con tabs (Resumen, Datos, Materiales, Fotos, Aprobación, Historial) | No existe |
| Vista trabajador: registrar su parte desde móvil/web con fotos e incidencias | No existe |
| Vista gerente: ver, validar y analizar todos los partes | No existe |
| Flujo de aprobación (Borrador → Enviado → Validado / Rechazado) | No existe |
| Histórico de partes por obra | No existe |
| Histórico de partes por trabajador | No existe |
| Automatización: sumar horas del parte al progreso de obra | No existe |
| Automatización: registrar coste acumulado de mano de obra por obra | No existe |
| Automatización: crear incidencia automática si se informa en el parte | No existe |
| Automatización: descontar/registrar materiales consumidos en stock | No existe |
| Alerta: trabajador sin parte diario | No existe |
| Alerta: horas superiores a lo previsto en la tarea/obra | No existe |
| Alerta: tarea de obra sin ejecutar (asignada pero sin partes) | No existe |
| Alerta: incidencia sin revisar | No existe |
| Conexión parte → fichaje (cruce horas fichadas vs horas del parte) | No existe |
| KPIs de partes en Dashboard de construcción | No existe |
| Sidebar: item `construction-execution` en grupo Construcción | No existe |
| Ruta `/saas/construction-execution` en `routes.tsx` | No existe |

---

## Tickets

---

### CE-01 — Modelo de datos: Parte diario de obra

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

No existe una entidad para registrar el trabajo diario. Actualmente `construction_task` captura tareas asignadas con fotos y notas, pero no tiene concepto de "parte diario" con fecha, horas trabajadas, materiales consumidos, firma/validación ni observaciones del día. Necesitamos `construction_daily_report` como documento de primer nivel en la DB `*-construction`.

#### Qué hacer

**1. Definir builder en `services/couchdb.js` (sección CONSTRUCTION)**

```javascript
export function buildConstructionDailyReportDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cdrt-${uuidv4()}`;
  const ref = existing?.referencia || `PARTE-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_daily_report',
    id,
    user_id: userId,

    // ── Identificación ──
    referencia: ref,
    fecha: String(data.fecha || existing?.fecha || now.slice(0, 10)),

    // ── Relaciones ──
    obraId:            String(data.obraId || existing?.obraId || ''),
    obraNombre:        String(data.obraNombre || existing?.obraNombre || ''),
    trabajadorId:      String(data.trabajadorId || existing?.trabajadorId || ''),
    trabajadorNombre:  String(data.trabajadorNombre || existing?.trabajadorNombre || ''),
    gremio:            String(data.gremio || existing?.gremio || ''),
    tareaId:           String(data.tareaId || existing?.tareaId || ''),
    tareaNombre:       String(data.tareaNombre || existing?.tareaNombre || ''),

    // ── Trabajo realizado ──
    descripcion:       String(data.descripcion || existing?.descripcion || ''),
    horasTrabajadas:   Number(data.horasTrabajadas ?? existing?.horasTrabajadas ?? 0),
    horasPrevistas:    Number(data.horasPrevistas ?? existing?.horasPrevistas ?? 0),
    tarifaHora:        Number(data.tarifaHora ?? existing?.tarifaHora ?? 0),
    costeTotal:        Number(data.costeTotal ?? existing?.costeTotal ?? 0),

    // ── Materiales consumidos ──
    materiales: Array.isArray(data.materiales) ? data.materiales : (existing?.materiales || []),
    // Cada elemento: { materialId, nombre, cantidad, unidad, costeUnitario, costeTotal }

    // ── Evidencia ──
    fotos: Array.isArray(data.fotos) ? data.fotos : (existing?.fotos || []),
    // Cada elemento: { id, url, base64, mimeType, descripcion, fecha }

    // ── Observaciones ──
    observaciones:     String(data.observaciones || existing?.observaciones || ''),

    // ── Incidencia (opcional) ──
    tieneIncidencia:   Boolean(data.tieneIncidencia ?? existing?.tieneIncidencia ?? false),
    incidencia: data.tieneIncidencia ? {
      tipo:        String(data.incidencia?.tipo || existing?.incidencia?.tipo || ''),
      descripcion: String(data.incidencia?.descripcion || existing?.incidencia?.descripcion || ''),
      gravedad:    String(data.incidencia?.gravedad || existing?.incidencia?.gravedad || 'media'),
      fotos:       Array.isArray(data.incidencia?.fotos) ? data.incidencia.fotos : (existing?.incidencia?.fotos || []),
      incidenciaId: String(data.incidencia?.incidenciaId || existing?.incidencia?.incidenciaId || ''),
    } : (existing?.incidencia || null),

    // ── Validación ──
    estado: String(data.estado || existing?.estado || 'borrador'),
    // 'borrador' | 'enviado' | 'validado' | 'rechazado'
    validadoPor:       String(data.validadoPor || existing?.validadoPor || ''),
    validadoPorNombre: String(data.validadoPorNombre || existing?.validadoPorNombre || ''),
    validadoAt:        String(data.validadoAt || existing?.validadoAt || ''),
    motivoRechazo:     String(data.motivoRechazo || existing?.motivoRechazo || ''),

    // ── Vínculo con fichaje ──
    clockinId:         String(data.clockinId || existing?.clockinId || ''),

    // ── Auditoría ──
    creadoPor:         String(data.creadoPor || existing?.creadoPor || ''),
    creadoPorNombre:   String(data.creadoPorNombre || existing?.creadoPorNombre || ''),
    historial: Array.isArray(data.historial) ? data.historial : (existing?.historial || []),
    // Cada elemento: { accion, usuario, fecha, detalle }
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Crear `sanitizeConstructionDailyReport` junto al builder** con los mismos campos y defaults.

**3. Añadir tipo TypeScript en `src/app/lib/constructionApi.ts`**

```typescript
export interface ReportMaterial {
  materialId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costeUnitario: number;
  costeTotal: number;
}

export interface ReportIncidencia {
  tipo: string;
  descripcion: string;
  gravedad: 'baja' | 'media' | 'alta' | 'critica';
  fotos: TaskFoto[];
  incidenciaId: string;
}

export interface ReportHistorial {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionDailyReport {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;

  referencia: string;
  fecha: string;

  obraId: string;
  obraNombre: string;
  trabajadorId: string;
  trabajadorNombre: string;
  gremio: string;
  tareaId: string;
  tareaNombre: string;

  descripcion: string;
  horasTrabajadas: number;
  horasPrevistas: number;
  tarifaHora: number;
  costeTotal: number;

  materiales: ReportMaterial[];
  fotos: TaskFoto[];
  observaciones: string;

  tieneIncidencia: boolean;
  incidencia: ReportIncidencia | null;

  estado: 'borrador' | 'enviado' | 'validado' | 'rechazado';
  validadoPor: string;
  validadoPorNombre: string;
  validadoAt: string;
  motivoRechazo: string;

  clockinId: string;

  creadoPor: string;
  creadoPorNombre: string;
  historial: ReportHistorial[];
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento en CouchDB con `type: 'construction_daily_report'` y prefijo `cdrt-`
- [ ] `referencia` auto-generada (`PARTE-XXXXXX`)
- [ ] Materiales como array embebido (cada uno con id de catálogo, cantidad, unidad y coste)
- [ ] Incidencia como objeto embebido opcional con tipo, gravedad y fotos propias
- [ ] Historial de acciones como array embebido (no documento separado)
- [ ] Estado con flujo `borrador → enviado → validado | rechazado`
- [ ] Tipo TS completo exportado desde `constructionApi.ts`

---

### CE-02 — Modelo de datos: Incidencia de obra

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Alta
**Dependencias:** CE-01

#### Contexto

Cuando un trabajador marca "tiene incidencia" en un parte, el sistema debe crear automáticamente un documento `construction_incident` independiente para que gerencia pueda gestionarla con su propio ciclo de vida (abierta → en revisión → resuelta → cerrada). La incidencia queda vinculada al parte y a la obra.

#### Qué hacer

**1. Builder en `services/couchdb.js`**

```javascript
export function buildConstructionIncidentDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cinc-${uuidv4()}`;
  const ref = existing?.referencia || `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_incident',
    id,
    user_id: userId,
    referencia: ref,

    // ── Relaciones ──
    obraId:           String(data.obraId || existing?.obraId || ''),
    obraNombre:       String(data.obraNombre || existing?.obraNombre || ''),
    parteId:          String(data.parteId || existing?.parteId || ''),
    parteReferencia:  String(data.parteReferencia || existing?.parteReferencia || ''),
    reportadoPor:     String(data.reportadoPor || existing?.reportadoPor || ''),
    reportadoPorNombre: String(data.reportadoPorNombre || existing?.reportadoPorNombre || ''),

    // ── Datos ──
    tipo: String(data.tipo || existing?.tipo || ''),
    // 'seguridad' | 'calidad' | 'material' | 'maquinaria' | 'accidente' | 'clima' | 'otro'
    descripcion:   String(data.descripcion || existing?.descripcion || ''),
    gravedad:      String(data.gravedad || existing?.gravedad || 'media'),
    // 'baja' | 'media' | 'alta' | 'critica'
    fotos: Array.isArray(data.fotos) ? data.fotos : (existing?.fotos || []),

    // ── Gestión ──
    estado: String(data.estado || existing?.estado || 'abierta'),
    // 'abierta' | 'en_revision' | 'resuelta' | 'cerrada'
    asignadoA:        String(data.asignadoA || existing?.asignadoA || ''),
    asignadoANombre:  String(data.asignadoANombre || existing?.asignadoANombre || ''),
    resolucion:       String(data.resolucion || existing?.resolucion || ''),
    fechaResolucion:  String(data.fechaResolucion || existing?.fechaResolucion || ''),

    // ── Auditoría ──
    historial: Array.isArray(data.historial) ? data.historial : (existing?.historial || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Sanitizer y tipo TS** siguiendo el mismo patrón que CE-01.

```typescript
export interface ConstructionIncident {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;

  obraId: string;
  obraNombre: string;
  parteId: string;
  parteReferencia: string;
  reportadoPor: string;
  reportadoPorNombre: string;

  tipo: 'seguridad' | 'calidad' | 'material' | 'maquinaria' | 'accidente' | 'clima' | 'otro';
  descripcion: string;
  gravedad: 'baja' | 'media' | 'alta' | 'critica';
  fotos: TaskFoto[];

  estado: 'abierta' | 'en_revision' | 'resuelta' | 'cerrada';
  asignadoA: string;
  asignadoANombre: string;
  resolucion: string;
  fechaResolucion: string;

  historial: ReportHistorial[];
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento con `type: 'construction_incident'`, prefijo `cinc-`
- [ ] Referencia auto-generada `INC-XXXXXX`
- [ ] Tipos de incidencia: seguridad, calidad, material, maquinaria, accidente, clima, otro
- [ ] Gravedades: baja, media, alta, crítica
- [ ] Estados: abierta → en_revision → resuelta → cerrada
- [ ] Vinculada a parte (`parteId`) y obra (`obraId`)
- [ ] Tipo TS exportado

---

### CE-03 — API REST: CRUD de partes diarios

**Tipo:** Backend (Router + Controller)
**Prioridad:** Crítica
**Dependencias:** CE-01

#### Contexto

Necesitamos endpoints REST bajo `/api/construction/daily-reports/:userId` siguiendo el mismo patrón que `projects`, `workers` y `tasks`. Filtros por obra, trabajador y rango de fechas son esenciales para el rendimiento en móvil.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listDailyReports(req, res)` | Leer todos los docs `type === 'construction_daily_report'` del usuario. Soportar `query.projectId`, `query.workerId`, `query.dateFrom`, `query.dateTo`, `query.estado` para filtrar. Devolver `{ ok: true, reports: [...] }` |
| `createDailyReport(req, res)` | `buildConstructionDailyReportDocument(userId, req.body.report)`. Calcular `costeTotal = horasTrabajadas × tarifaHora + Σ materiales[].costeTotal`. Añadir al historial: `{ accion: 'creado', usuario, fecha }`. Devolver `{ ok: true, report }` |
| `updateDailyReport(req, res)` | Obtener existente, merge con `buildConstructionDailyReportDocument(userId, data, existing)`. Recalcular coste. Añadir al historial: `{ accion: 'editado', usuario, fecha, detalle }`. Devolver `{ ok: true, report }` |
| `removeDailyReport(req, res)` | Solo si `estado === 'borrador'`. Devolver 403 si está enviado/validado. |

**2. Endpoints especiales**

| Función | Endpoint | Lógica |
|---|---|---|
| `submitDailyReport` | `POST .../daily-reports/:userId/:id/submit` | Cambiar `estado` a `enviado`. Validar que haya `obraId`, `trabajadorId`, `horasTrabajadas > 0`, `descripcion`. Añadir historial. |
| `validateDailyReport` | `POST .../daily-reports/:userId/:id/validate` | Cambiar `estado` a `validado`. Guardar `validadoPor`, `validadoAt`. Añadir historial. **Disparar automatizaciones** (CE-07). |
| `rejectDailyReport` | `POST .../daily-reports/:userId/:id/reject` | Cambiar `estado` a `rechazado`. Guardar `motivoRechazo`. Añadir historial. |

**3. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/daily-reports/:userId', listDailyReports);
constructionRouter.post('/daily-reports/:userId', createDailyReport);
constructionRouter.put('/daily-reports/:userId/:id', updateDailyReport);
constructionRouter.delete('/daily-reports/:userId/:id', removeDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/submit', submitDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/validate', validateDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/reject', rejectDailyReport);
```

**4. Funciones en `constructionApi.ts`**

```typescript
export async function listDailyReports(
  userId: string,
  filters?: { projectId?: string; workerId?: string; dateFrom?: string; dateTo?: string; estado?: string }
): Promise<ConstructionDailyReport[]>;

export async function createDailyReport(userId: string, data: Partial<ConstructionDailyReport>): Promise<ConstructionDailyReport>;
export async function updateDailyReport(userId: string, report: ConstructionDailyReport): Promise<ConstructionDailyReport>;
export async function deleteDailyReport(userId: string, reportId: string): Promise<void>;
export async function submitDailyReport(userId: string, reportId: string): Promise<ConstructionDailyReport>;
export async function validateDailyReport(userId: string, reportId: string, validadoPor: string, validadoPorNombre: string): Promise<ConstructionDailyReport>;
export async function rejectDailyReport(userId: string, reportId: string, motivoRechazo: string): Promise<ConstructionDailyReport>;
```

#### Criterios de aceptación

- [ ] CRUD completo en `/api/construction/daily-reports/:userId`
- [ ] Filtros por `projectId`, `workerId`, `dateFrom`, `dateTo`, `estado` (query params)
- [ ] `costeTotal` calculado automáticamente en create/update
- [ ] Borrar solo en estado `borrador`
- [ ] Endpoints de submit/validate/reject con validaciones y registro de historial
- [ ] Funciones tipadas en `constructionApi.ts`

---

### CE-04 — API REST: CRUD de incidencias de obra

**Tipo:** Backend (Router + Controller)
**Prioridad:** Alta
**Dependencias:** CE-02

#### Contexto

Incidencias como recurso independiente: las crea el sistema al guardar un parte con incidencia (CE-07), pero gerencia necesita listarlas, asignarlas, resolver y cerrar.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listIncidents(req, res)` | Leer `type === 'construction_incident'`. Filtrar por `query.projectId`, `query.estado`, `query.gravedad`. |
| `createIncident(req, res)` | `buildConstructionIncidentDocument(userId, req.body.incident)`. |
| `updateIncident(req, res)` | Merge estándar. Añadir historial. |
| `resolveIncident` | `POST .../incidents/:userId/:id/resolve` — Cambiar `estado` a `resuelta`, guardar `resolucion` y `fechaResolucion`. |
| `removeIncident(req, res)` | Solo si `estado === 'abierta'`. |

**2. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/incidents/:userId', listIncidents);
constructionRouter.post('/incidents/:userId', createIncident);
constructionRouter.put('/incidents/:userId/:id', updateIncident);
constructionRouter.post('/incidents/:userId/:id/resolve', resolveIncident);
constructionRouter.delete('/incidents/:userId/:id', removeIncident);
```

**3. Funciones tipadas en `constructionApi.ts`**

#### Criterios de aceptación

- [ ] CRUD en `/api/construction/incidents/:userId`
- [ ] Filtros por obra, estado y gravedad
- [ ] Endpoint `resolve` con resolución y fecha
- [ ] Solo borrable en estado `abierta`
- [ ] Funciones tipadas en client TS

---

### CE-05 — Página principal: `/saas/construction-execution`

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** CE-03

#### Contexto

Es la pantalla central de "Ejecución". Debe mostrar todos los partes diarios con dos vistas (cards y tabla), KPIs colapsables y acceso rápido a crear un nuevo parte. Seguir los patrones de UI de `PartesTab.tsx` (src-delivery) pero adaptado a construcción.

#### Qué hacer

**1. Crear `src/app/pages/saas/ConstructionExecution.tsx`**

**2. Registrar en `routes.tsx`**

```typescript
{ path: '/saas/construction-execution', element: <ConstructionExecution /> }
```

**3. Barra superior**

- Título: **"Partes de obra"**
- Icono info con tooltip: "Registro diario de trabajo, horas, materiales e incidencias por obra y trabajador"
- Toggle **"Mostrar resumen"** (OFF por defecto)
- Selector de vista: **Cards** | **Tabla** (iconos `LayoutGrid` / `TableIcon`)
- Botón primario: **"+ Nuevo parte"**

**4. KPIs (resumen, oculto por defecto)**

4 tarjetas compactas:

| KPI | Cálculo | Icono | Color |
|---|---|---|---|
| Horas del mes | Σ `horasTrabajadas` de partes del mes actual | `Clock` | Azul |
| Coste mano de obra (mes) | Σ `costeTotal` del mes | `Euro` | Verde |
| Partes pendientes de validación | Count `estado === 'enviado'` | `AlertTriangle` | Naranja |
| Incidencias abiertas | Count incidencias `estado === 'abierta'` | `AlertCircle` | Rojo |

**5. Vista Cards (mobile-first)**

- **Buscador**: placeholder "Buscar por PARTE-xxx, obra, trabajador o gremio…"
- **Chips de filtro** (scroll horizontal): Estado | Obra | Trabajador | Gremio | Fecha (rango) | `Limpiar todo`
- **Card de parte**:
  - Header: `PARTE-XXXXXX` + badge Estado (`borrador` gris, `enviado` azul, `validado` verde, `rechazado` rojo) + menú `⋯`
  - Título: Descripción de la tarea realizada (truncar a 2 líneas)
  - Contexto: Nombre de obra + gremio
  - Meta: Avatar trabajador + nombre · Fecha · Horas
  - Footer: Coste total € + icono fotos con contador (`📎 3`) + icono incidencia si aplica (`⚠`)
  - Tap → abre drawer (CE-06)

**6. Vista Tabla (modo pro)**

- Sin filtros globales (filtros en cabeceras de columna)
- Columnas:

| Columna | Filtrable | Tipo filtro |
|---|---|---|
| REF | Sí | Multi + búsqueda |
| FECHA | Sí | Rango |
| OBRA | Sí | Multi + búsqueda |
| TRABAJADOR | Sí | Multi + búsqueda |
| GREMIO | Sí | Multi |
| TAREA | No | — |
| HORAS | No | — |
| COSTE € | No | — |
| MATERIALES | No | — (solo contador) |
| ESTADO | Sí | Multi |
| INCIDENCIA | Sí | Sí/No |
| ACCIONES | No | Ver / `⋯` |

- Click en fila → abre drawer
- Menú `⋯`: Editar, Duplicar, Enviar, Eliminar (según estado)

#### Criterios de aceptación

- [ ] Página renderiza en `/saas/construction-execution`
- [ ] Carga datos de `listDailyReports` al montar
- [ ] Vista cards con filtros en chips y búsqueda
- [ ] Vista tabla con filtros por columna
- [ ] KPIs calculados desde los datos cargados
- [ ] Botón "Nuevo parte" abre formulario (CE-06)
- [ ] Responsive: en móvil se muestra cards por defecto, tabla solo desktop

---

### CE-06 — Drawer de detalle y formulario de parte

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** CE-03, CE-05

#### Contexto

El drawer se abre tanto para **ver/editar** un parte existente como para **crear** uno nuevo. Es la pieza clave de la UX de registro diario. Debe ser cómodo en móvil (se abre full-width en pantallas pequeñas) y en desktop (600px de ancho).

#### Qué hacer

**1. Crear `src/app/pages/saas/components/DailyReportDrawer.tsx`**

**2. Header del drawer**

- Modo edición: `PARTE-XXXXXX — Nombre de obra`
- Modo creación: "Nuevo parte de trabajo"
- Botón cerrar (`X`)

**3. Tabs internas**

| Tab | Contenido |
|---|---|
| **Resumen** | Chips (estado, obra, trabajador, gremio, fecha). KPIs: horas, tarifa, coste total. Links: Ir a obra, Ir a tarea (si existe). Alertas contextuales. |
| **Datos** | Formulario 2 columnas (responsive a 1 en móvil) |
| **Materiales** | Lista de materiales consumidos + botón añadir. Selector de material del catálogo, cantidad, unidad, coste. Subtotal calculado. |
| **Fotos** | Galería con upload (cámara en móvil). Cada foto con descripción y fecha. Grid de thumbnails. Preview al tap. |
| **Incidencia** | Toggle "¿Hay incidencia?". Si ON: tipo (dropdown), descripción, gravedad, fotos específicas. |
| **Aprobación** | Flujo visual: Borrador → Enviado → Validado/Rechazado. Botones según rol y estado. Campo de comentario al rechazar. |
| **Historial** | Timeline de acciones (creación, edición, envío, validación, fotos añadidas, etc.). |

**4. Tab Datos — campos del formulario**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Obra | Selector (lista `construction_project`) | Sí | Al seleccionar, autocompletar `obraId`/`obraNombre` |
| Trabajador | Selector (lista `construction_worker`, filtrado por obra si está seleccionada) | Sí | Autocompletar `trabajadorId`/`trabajadorNombre` |
| Fecha | Date picker | Sí | Default: hoy |
| Gremio | Selector (lista de gremios de la obra/trabajador) | Sí | Autocompletar desde el trabajador si tiene uno asignado |
| Tarea vinculada | Selector (lista `construction_task` filtrada por obra) | No | Autocompletar `tareaId`/`tareaNombre` |
| Descripción | Textarea (3 líneas) | Sí | Texto libre de lo realizado |
| Horas trabajadas | Input numérico (step 0.5) | Sí | — |
| Horas previstas | Input numérico (readonly si hay tarea vinculada) | No | Se hereda de la tarea si existe |
| Tarifa €/h | Input numérico | Sí | Prellenar desde gremio `precioManoObra` / horas |
| Coste total | Calculado (readonly) | Auto | `horasTrabajadas × tarifaHora + Σ materiales` |
| Observaciones | Textarea (2 líneas) | No | — |

**5. Tab Materiales**

- Botón **"+ Añadir material"** abre mini-form inline o modal:
  - Selector de material (buscar en catálogo `construction` de `verticalCatalog`)
  - Cantidad (numérico)
  - Unidad (auto desde catálogo: m², m³, kg, unidades, etc.)
  - Coste unitario (numérico)
  - Coste total (calculado)
- Tabla inline editable con fila por material
- Subtotal de materiales visible abajo

**6. Tab Fotos**

- Botón "Añadir foto" → input file (acepta cámara en móvil vía `capture="environment"`)
- Cada foto: thumbnail, descripción editable, fecha auto, botón eliminar
- Preview full-screen al tap (lightbox simple)
- Límite sugerido: 10 fotos, 5MB cada una (compresión client-side)

**7. Acciones del footer**

| Estado | Perfil Trabajador | Perfil Gerente |
|---|---|---|
| (nuevo) | Guardar borrador, Guardar y enviar | Guardar borrador, Guardar y enviar |
| borrador | Editar, Enviar, Eliminar | Editar, Enviar, Eliminar |
| enviado | Solo ver | Validar, Rechazar |
| validado | Solo ver | Solo ver |
| rechazado | Editar y reenviar | Solo ver |

#### Criterios de aceptación

- [ ] Drawer con 7 tabs funcionales
- [ ] Formulario crea/edita partes vía API
- [ ] Selectores de obra/trabajador/tarea cargados desde API
- [ ] Materiales con selector de catálogo y cálculo de coste
- [ ] Fotos con upload y preview
- [ ] Incidencia toggle con campos condicionales
- [ ] Flujo de aprobación con botones según rol/estado
- [ ] Historial muestra timeline de acciones
- [ ] Responsive: full-width en móvil, 600px en desktop
- [ ] Al guardar, recalcula `costeTotal` automáticamente

---

### CE-07 — Automatizaciones al guardar/validar parte

**Tipo:** Backend (Controller)
**Prioridad:** Alta
**Dependencias:** CE-03, CE-04

#### Contexto

Al guardar y al validar un parte deben dispararse varias acciones automáticas. Estas son la clave para que el gerente no tenga que actualizar manualmente el progreso de la obra ni el stock.

#### Qué hacer

**1. Al CREAR o ACTUALIZAR un parte:**

| Automatización | Detalle |
|---|---|
| Calcular `costeTotal` | `horasTrabajadas × tarifaHora + Σ materiales[].costeTotal` |
| Guardar historial | Push `{ accion, usuario, fecha, detalle }` al array `historial` |

**2. Al ENVIAR un parte (submit):**

| Automatización | Detalle |
|---|---|
| Crear incidencia | Si `tieneIncidencia === true`, llamar a `buildConstructionIncidentDocument` con los datos de `parte.incidencia`, guardar en DB y almacenar `incidencia.incidenciaId` en el parte |

**3. Al VALIDAR un parte:**

| Automatización | Detalle |
|---|---|
| Sumar horas a obra | Leer el `construction_project` por `obraId`. Sumar `horasTrabajadas` a un campo acumulado. Recalcular `progreso` si hay horas totales estimadas. Guardar proyecto. |
| Registrar coste acumulado | En el proyecto, sumar `costeTotal` del parte a un campo `costeAcumulado`. |
| Actualizar stock de materiales | Por cada `materiales[]` del parte, buscar el artículo en el catálogo (`*-catalog` DB) y descontar `cantidad` del stock disponible. Si stock resultante < mínimo, marcar como stock bajo. |
| Marcar tarea como en progreso | Si el parte tiene `tareaId` y la tarea está en `pendiente`, cambiar su `estado` a `en_progreso`. |

**4. Campos nuevos en `construction_project` (añadir a builder)**

```javascript
horasAcumuladas: Number(data.horasAcumuladas ?? existing?.horasAcumuladas ?? 0),
costeAcumulado: Number(data.costeAcumulado ?? existing?.costeAcumulado ?? 0),
horasEstimadas: Number(data.horasEstimadas ?? existing?.horasEstimadas ?? 0),
```

#### Criterios de aceptación

- [ ] `costeTotal` se recalcula en cada create/update
- [ ] Incidencia se crea automáticamente al enviar un parte con incidencia
- [ ] Al validar, `horasAcumuladas` y `costeAcumulado` se actualizan en la obra
- [ ] Al validar, stock de materiales consumidos se descuenta del catálogo
- [ ] Al validar, tarea vinculada pasa a `en_progreso` si estaba `pendiente`
- [ ] `progreso` de obra se recalcula: `(horasAcumuladas / horasEstimadas) × 100`

---

### CE-08 — Alertas de construcción

**Tipo:** Backend (Alert Engine)
**Prioridad:** Alta
**Dependencias:** CE-03, CE-04

#### Contexto

El motor de alertas (`alertConstants.js`) no integra construcción. Necesitamos 4 alertas nuevas que se evalúen periódicamente (o al consultar el dashboard).

#### Qué hacer

**1. Añadir constantes en `services/alertConstants.js`**

```javascript
// ── Construcción ──
CONSTRUCTION_WORKER_NO_REPORT: {
  id: 'construction_worker_no_report',
  label: 'Trabajador sin parte diario',
  description: 'Un trabajador activo asignado a una obra en estado "en_obra" no ha registrado parte hoy',
  severity: 'warning',
  category: 'construction',
},
CONSTRUCTION_HOURS_EXCEEDED: {
  id: 'construction_hours_exceeded',
  label: 'Horas superiores a lo previsto',
  description: 'Las horas acumuladas de una tarea o una obra superan las horas estimadas',
  severity: 'warning',
  category: 'construction',
},
CONSTRUCTION_TASK_NOT_EXECUTED: {
  id: 'construction_task_not_executed',
  label: 'Tarea de obra sin ejecutar',
  description: 'Una tarea asignada con fecha límite pasada no tiene ningún parte asociado',
  severity: 'warning',
  category: 'construction',
},
CONSTRUCTION_INCIDENT_UNREVIEWED: {
  id: 'construction_incident_unreviewed',
  label: 'Incidencia sin revisar',
  description: 'Una incidencia de obra lleva más de 24 horas en estado "abierta" sin asignar',
  severity: 'high',
  category: 'construction',
},
```

**2. Implementar evaluadores**

| Alerta | Lógica |
|---|---|
| Trabajador sin parte | Para cada `construction_worker` con `activo === true` y obra en `en_obra`: comprobar si existe un `construction_daily_report` con su `trabajadorId` y `fecha === hoy`. Si no, generar alerta. |
| Horas superiores | Para cada `construction_task` (o proyecto) con `horasEstimadas > 0`: si Σ horas de partes validados > `horasEstimadas`, generar alerta. |
| Tarea sin ejecutar | Para cada `construction_task` con `estado === 'pendiente'` y `fechaLimite < hoy`: comprobar si hay al menos un parte con `tareaId`. Si no, generar alerta. |
| Incidencia sin revisar | Para cada `construction_incident` con `estado === 'abierta'` y `createdAt < hace 24h`: generar alerta. |

**3. Exponer en endpoint de alertas (si existe) o en nuevo endpoint**

```
GET /api/construction/alerts/:userId
```

Devuelve `{ ok: true, alerts: [...] }` con cada alerta y su contexto (obra, trabajador, tarea, incidencia).

#### Criterios de aceptación

- [ ] 4 tipos de alerta definidos en `alertConstants.js`
- [ ] Evaluadores consultan DB `*-construction` y calculan condiciones
- [ ] Endpoint devuelve alertas activas con contexto (IDs y nombres de las entidades)
- [ ] Severidad diferenciada: incidencia sin revisar = `high`, resto = `warning`

---

### CE-09 — Vista trabajador: registro rápido de parte

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** CE-03, CE-06

#### Contexto

El trabajador necesita registrar su parte diario de forma rápida desde el móvil. Debe acceder desde el TPV de trabajador (`WorkerTpvConstruction.tsx`) o desde una ruta directa `/saas/worker/construction-report`.

#### Qué hacer

**1. Crear ruta trabajador**

```typescript
{ path: '/saas/worker/construction-report', element: <WorkerConstructionReport /> }
```

**2. Pantalla `WorkerConstructionReport.tsx`**

- **Header simplificado**: "Mi parte de hoy" + fecha actual
- **Obra pre-seleccionada** (si el trabajador solo tiene una asignada; si tiene varias, selector)
- **Gremio pre-rellenado** desde el perfil del trabajador
- **Formulario secuencial** (wizard de 4 pasos, ideal para móvil):
  - **Paso 1 — Trabajo**: Tarea (selector o "otra"), descripción, horas
  - **Paso 2 — Materiales**: Lista rápida de materiales usados (opcional, saltar)
  - **Paso 3 — Fotos**: Cámara directa + galería (mínimo obligatorio configurable)
  - **Paso 4 — Revisión**: Resumen del parte + toggle incidencia + observaciones + botones "Guardar borrador" / "Enviar"
- **Feedback**: Toast de confirmación, animación de check

**3. Enlace desde WorkerTpvConstruction.tsx**

- Añadir botón "Registrar parte" en el TPV del trabajador de construcción que navegue a `/saas/worker/construction-report`

#### Criterios de aceptación

- [ ] Ruta `/saas/worker/construction-report` registrada
- [ ] Wizard de 4 pasos fluido en móvil
- [ ] Obra y gremio prellenados cuando sea posible
- [ ] Fotos vía cámara (nativa en Capacitor, input file en web)
- [ ] Parte se crea vía `createDailyReport` y opcionalmente se envía con `submitDailyReport`
- [ ] Enlace accesible desde `WorkerTpvConstruction.tsx`

---

### CE-10 — Vista gerente: validación y análisis

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** CE-05, CE-06, CE-08

#### Contexto

El gerente ve la página principal `/saas/construction-execution` con funcionalidad extra: validación masiva, alertas visibles y filtros avanzados.

#### Qué hacer

**1. Panel de alertas**

- Sección colapsable arriba de la tabla/cards con las alertas activas (CE-08)
- Cada alerta: icono severidad + texto + link a la entidad afectada
- Badge en el sidebar con el número de alertas sin resolver

**2. Acciones de validación**

- En vista tabla: checkbox de selección múltiple → botón "Validar seleccionados" (bulk validate)
- En drawer: botones Validar / Rechazar con campo de comentario

**3. Filtros extra gerente**

- Filtro por estado `enviado` preactivado (pendientes primero)
- Filtro "Solo con incidencias"
- Ordenar por fecha descendente por defecto

**4. Resumen analítico (ampliado para gerente)**

Además de los 4 KPIs de CE-05, mostrar:

| KPI extra | Cálculo |
|---|---|
| Horas por obra (barras) | Agrupar `horasTrabajadas` por `obraId` |
| Coste por gremio (donut) | Agrupar `costeTotal` por `gremio` |
| Partes por trabajador (ranking) | Contar partes por `trabajadorId` |

Implementar como componente aparte: `DailyReportAnalytics.tsx` (se muestra al expandir "Resumen").

#### Criterios de aceptación

- [ ] Alertas visibles en la parte superior con link a entidad
- [ ] Validación masiva (checkbox + botón bulk)
- [ ] Filtro preactivado "enviados primero" para gerente
- [ ] 3 gráficos analíticos (barras, donut, ranking)
- [ ] Badge de alertas en sidebar

---

### CE-11 — Histórico por obra y por trabajador

**Tipo:** Frontend (React)
**Prioridad:** Media
**Dependencias:** CE-03, CE-05

#### Contexto

Requisito explícito: poder consultar el histórico de partes filtrando por obra o por trabajador. Debe ser accesible desde la página de ejecución y desde las fichas de obra/trabajador.

#### Qué hacer

**1. Filtro persistente en la página de ejecución**

- Si se llega desde la ficha de una obra (`/saas/construction-projects`), preseleccionar esa obra en los filtros
- Si se llega desde la ficha de un trabajador, preseleccionar ese trabajador
- Usar query params: `/saas/construction-execution?obraId=cprj-xxx` o `?trabajadorId=cwrk-xxx`

**2. Pestaña "Partes" en ficha de obra (ConstructionProjects.tsx)**

- Dentro del detalle de un proyecto, añadir tab "Partes" que muestre la lista filtrada de partes de esa obra
- Mostrar KPIs: horas totales, coste total, partes validados/pendientes
- Botón "Ver todos" → navega a `/saas/construction-execution?obraId=...`

**3. Pestaña "Partes" en ficha de trabajador**

- En el detalle de un worker, añadir tab "Partes" con sus partes
- Mostrar: horas totales del mes, partes del mes, coste generado
- Botón "Ver todos" → navega a `/saas/construction-execution?trabajadorId=...`

#### Criterios de aceptación

- [ ] Query params `obraId` y `trabajadorId` preseleccionan filtros en la página
- [ ] Tab "Partes" funcional en ficha de obra con KPIs
- [ ] Tab "Partes" funcional en ficha de trabajador con KPIs
- [ ] Navegación bidireccional entre ficha y página de ejecución

---

### CE-12 — Conexión con Fichajes

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** CE-03

#### Contexto

El sistema de fichajes (`clockins`) ya registra horas por miembro de empresa. Queremos cruzar las horas fichadas con las horas declaradas en los partes para detectar inconsistencias.

#### Qué hacer

**1. Vincular `clockinId` al parte**

- Al crear un parte, buscar en la DB `*-clockins` si el trabajador (vía `teamMemberId` del `construction_worker`) tiene un fichaje para la fecha del parte
- Si existe, guardar `clockinId` en el parte
- Si no existe fichaje, avisar al usuario (warning, no bloquear)

**2. Comparación visual en el drawer**

- En la tab "Resumen" del drawer, mostrar:
  - Horas fichadas (del clockin): X h
  - Horas del parte: Y h
  - Diferencia: +/- Z h
  - Si la diferencia > 1h, mostrar badge warning

**3. Endpoint de cruce**

```
GET /api/construction/daily-reports/:userId/clockin-match?date=YYYY-MM-DD&workerId=cwrk-xxx
```

Devuelve `{ clockin: ClockinRecord | null, report: ConstructionDailyReport | null, deviation: number }`.

#### Criterios de aceptación

- [ ] `clockinId` se vincula automáticamente si hay fichaje del día
- [ ] Warning si no hay fichaje para el trabajador en esa fecha
- [ ] Comparación visual horas fichadas vs horas parte en drawer
- [ ] Badge warning si diferencia > 1 hora
- [ ] Endpoint de cruce funcional

---

### CE-13 — Sidebar y navegación

**Tipo:** Frontend (Config)
**Prioridad:** Media
**Dependencias:** CE-05

#### Contexto

Falta el enlace en el sidebar y la definición del item en el grupo de construcción.

#### Qué hacer

**1. Añadir item en `Sidebar.tsx`**

```typescript
// En el array de items, sección Constructora:
{ id: 'construction-execution', navKey: 'constructionExecution', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/construction-execution' },
```

**2. Añadir al grupo de construcción**

```typescript
// En GROUPS, grupo 'construction':
itemIds: ['construction-projects', 'construction-execution', 'construction-budgets', 'construction-machinery', 'construction-materials', 'construction-subcontractors', 'construction-plans']
```

Nota: `construction-execution` va segundo, justo después de proyectos, porque es la operativa diaria.

**3. Añadir traducción/navKey en `sectorTerminology.ts`** si aplica.

#### Criterios de aceptación

- [ ] Item visible en sidebar bajo grupo Construcción
- [ ] Icono `ClipboardCheck` (lucide)
- [ ] Posición: segundo item (después de Obras)
- [ ] Navega correctamente a `/saas/construction-execution`

---

### CE-14 — KPIs de partes en Dashboard de Construcción

**Tipo:** Frontend + Backend
**Prioridad:** Baja
**Dependencias:** CE-03, CE-04

#### Contexto

`ConstructionDashboard.tsx` existe pero no muestra datos de partes ni incidencias. El endpoint `/api/dashboard/kpis/:userId` no incluye métricas de construcción.

#### Qué hacer

**1. Endpoint o ampliación**

Opción A: Ampliar `/api/dashboard/kpis/:userId` para incluir sección `construction`.
Opción B: Crear `/api/construction/stats/:userId` específico.

Métricas a devolver:

| KPI | Cálculo |
|---|---|
| `reportsTodayCount` | Partes de hoy |
| `reportsMonthCount` | Partes del mes |
| `hoursMonth` | Σ horas del mes |
| `costMonth` | Σ coste del mes |
| `pendingValidation` | Partes en `enviado` |
| `openIncidents` | Incidencias en `abierta` |
| `workersWithoutReport` | Trabajadores activos sin parte hoy |
| `projectsInProgress` | Obras en `en_obra` |
| `topProjectByCost` | Obra con más coste acumulado |

**2. Mostrar en `ConstructionDashboard.tsx`**

- Tarjetas de KPIs principales
- Mini-tabla de obras activas con progreso y coste
- Lista de alertas recientes

#### Criterios de aceptación

- [ ] Endpoint devuelve 9 métricas de construcción
- [ ] Dashboard muestra KPIs de partes, incidencias y alertas
- [ ] Datos actualizados en tiempo real al cargar

---

## Resumen de dependencias

```
CE-01 (Modelo parte)
 ├── CE-02 (Modelo incidencia)
 │    └── CE-04 (API incidencias)
 ├── CE-03 (API partes) ←── bloquea la mayoría
 │    ├── CE-05 (Página principal)
 │    │    ├── CE-06 (Drawer detalle/formulario)
 │    │    ├── CE-10 (Vista gerente)
 │    │    ├── CE-11 (Histórico)
 │    │    └── CE-13 (Sidebar)
 │    ├── CE-07 (Automatizaciones)
 │    ├── CE-08 (Alertas)
 │    ├── CE-09 (Vista trabajador)
 │    ├── CE-12 (Conexión fichajes)
 │    └── CE-14 (Dashboard KPIs)
```

## Orden de ejecución recomendado

| Fase | Tickets | Descripción |
|---|---|---|
| **1. Modelos** | CE-01, CE-02 | Definir documentos CouchDB y tipos TS |
| **2. APIs** | CE-03, CE-04 | Endpoints REST completos |
| **3. UI Core** | CE-05, CE-06, CE-13 | Página, drawer y sidebar |
| **4. Automatizaciones** | CE-07 | Lógica de negocio al validar |
| **5. Alertas** | CE-08 | Motor de alertas de construcción |
| **6. Perfiles** | CE-09, CE-10 | Vistas trabajador y gerente |
| **7. Integraciones** | CE-11, CE-12, CE-14 | Histórico, fichajes y dashboard |
