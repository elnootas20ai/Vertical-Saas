# TRABAJADORES Y OPERATIVA (Desguaces) — Plan de Tickets

**Página:** `/saas/vertical/desguaces/trabajadores`
**Objetivo:** Controlar personal, tareas y productividad del desguace. Gestionar fichas de trabajadores, asignación de tareas operativas (recepción, desmontaje, catalogación, almacén, venta, expedición), tiempos dedicados y rendimiento individual.
**Tipo:** Módulo dentro de la vertical Desguaces.
**Fecha:** 2026-04-15

---

## Estado auditado (08/07/2026)

**~55% hecho; el backend está completo y montado, pero la página está desactivada por routing.** `routes.tsx` redirige tanto `/saas/scrapyard-workers` como `/saas/vertical/desguaces/trabajadores` a `/saas/team` con el comentario "ScrapyardWorkers removed (duplicate of Team)", y no hay ítem `scrapyard-workers` en el Sidebar.

- **Completo (verificado):** SW-01 (`buildScrapyardWorkerDocument` y `buildScrapyardTaskDocument` en `couchdb.js`), SW-02 (CRUD de workers y tasks + start/pause/resume/complete + `getWorkerProductivity` en `scrapyardController.js`, montados en `/api/scrapyard/workers|tasks` vía `scrapyardRouter` en `index.js`), SW-03 (`listScrapyardWorkers`, `listScrapyardTasks`, `startScrapyardTask`, etc. en `scrapyardApi.ts`), SW-08 (las 6 alertas de trabajadores implementadas en `checkScrapyardWorkerAlerts` de `alertEngine.js`: no_clockin, overtime, doc_expired, low_perf, task_pending_overdue, task_unassigned).
- **Parcial:** SW-05/SW-06 — `ScrapyardWorkers.tsx` existe con pestañas, filtros y modal, pero usa el API genérico `createVerticalApi('scrapyard-ops','workers')` en vez de `/api/scrapyard/workers`, y las tareas/alertas están vacías ("hasta integración" según comentario del propio código). Además la página es inaccesible por la redirección.
- **Pendiente de verdad:** SW-04 (reactivar ruta + sidebar, decisión de producto pendiente: se consolidó en Equipo core), SW-07 (conectar la página al API real de workers/tasks/productividad), SW-09 (conexiones cruzadas: ScrapyardHub sigue enlazando a `/saas/team`; ScrapyardReports con datos mock). Las alertas de SW-08 enlazan a `/saas/vertical/desguaces/trabajadores`, que hoy redirige a `/saas/team`.

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Equipo de empresa (miembros, roles, permisos) | Completo | `businessRouter.js` — `business.members` con roles |
| Fichajes con schedule vinculado | Completo | `clockinsRouter.js` — `ClockinRecord` con `scheduled_start/end`, `totalMinutes` |
| Horarios semanales por miembro | Completo | `Schedules.tsx`, `schedulesApi.ts` — DB `*-schedules` |
| Login de equipo (modo worker) | Completo | `TeamLogin.tsx` + rutas `/saas/worker/*` |
| TPV Trabajador Desguace | UI mock | `WorkerTpvScrapyard.tsx` — lista vehículos/piezas, sin API real |
| ScrapyardHub con tabla rendimiento trabajadores | UI mock | `ScrapyardHub.tsx` — datos mock, enlaza a `/saas/team` genérico |
| ScrapyardReports pestaña Trabajadores | UI mock | `ScrapyardReports.tsx` — `WorkerProductivity` con datos mock |
| Sesión de despiece con campo `trabajadores` | Parcial | `couchdb.js` `buildDismantlingSession` — `trabajadores: string[]` (solo nombres) |
| Piezas con campo `desmontadoPor` | Parcial | `couchdb.js` `buildScrapyardPartDocument` — string plano |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Motor de alertas genérico equipo (worker_no_clockin) | Completo | `alertEngine.js` — `checkWorkerNoClockIn` |
| Rendimiento fichajes vs ventas | Parcial | `clockinsController.js` `getPerformance` — solo ventas genéricas, no desguace |
| Vacaciones y ausencias | Completo | `Vacations.tsx`, `vacationsApi.ts` — DB `*-vacations` |
| Nóminas y gastos de personal | Completo | `Team.tsx` tabs payroll + staff-expenses |
| Sidebar con grupo Desguace | Completo | `Sidebar.tsx` líneas 346–356 — 10 ítems (sin trabajadores) |
| Rutas desguace en `routes.tsx` | Completo | 15 rutas desguace (sin `/trabajadores`) |
| Patrón ButcherWorkers (referencia de diseño) | Completo | `ButcherWorkers.tsx` — 1378 líneas con KPIs, equipo, rendimiento, alertas |
| Patrón CleaningWorkers (referencia de diseño) | Completo | `CleaningWorkers.tsx` — 1328 líneas |
| Patrón ConstructionWorkers (referencia backend) | Completo | `constructionController.js` — CRUD `construction_worker` |
| Worker Performance API | Completo | `workerPerformanceApi.ts` — KPIs por trabajador (ventas, leads, tareas) |
| Scrapyard Controller (piezas y despiece) | Completo | `scrapyardController.js` — CRUD piezas, sesiones de despiece |
| ScrapyardDashboard | Completo | `ScrapyardDashboard.tsx` — widgets operativos |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Entidad `ScrapyardWorker` como documento propio (no solo string en despiece) | No existe |
| Ficha completa de trabajador de desguace (nombre, horario, permisos, zona, documentación, coste/hora) | No existe |
| Página independiente `/saas/vertical/desguaces/trabajadores` | No existe |
| Componente `ScrapyardWorkers.tsx` | No existe |
| CRUD backend de trabajadores de desguace | No existe |
| Entidad `ScrapyardTask` como documento propio | No existe |
| Tipos de tarea operativa (recepción, desmontaje, catalogación, almacén, venta, expedición) | No existe |
| Estado de tarea y tracking de tiempos dedicados | No existe |
| Asignación de tareas a trabajadores con referencia a vehículos y piezas | No existe |
| Cálculo de piezas procesadas por trabajador (con datos reales del backend) | No existe |
| Cálculo de ventas atendidas por trabajador | No existe |
| Cálculo de horas trabajadas (cruce fichajes + tareas) | No existe |
| Cálculo de productividad por puesto/zona | No existe |
| Alerta: tarea pendiente sin asignar o sin iniciar | No existe |
| Alerta: trabajador sin fichar (horario asignado) | No existe |
| Alerta: exceso de horas (acumulado semanal) | No existe |
| Alerta: documentación caducada (PRL, EPI, carnet, contrato) | No existe |
| Alerta: bajo rendimiento (por debajo de umbral configurable) | No existe |
| Conexión bidireccional con Equipo Core (`business.members`) | No implementada |
| Conexión con Fichajes (cruce horas fichadas vs horas tarea) | No implementada |
| Conexión con Despiece (sesiones y piezas extraídas por trabajador) | Solo string plano |
| Conexión con Stock piezas (piezas catalogadas por trabajador) | No implementada |
| Conexión con Ventas (tickets y pedidos atendidos) | No implementada |
| Conexión con Dashboard (KPIs de personal en ScrapyardDashboard) | No implementada |
| Vista gerente: rendimiento, costes laborales, ranking, comparativas | Solo datos mock |
| Vista trabajador: sus tareas, fichajes y avisos del turno | No existe |
| Sidebar: ítem `scrapyard-workers` en grupo Desguace | No existe |
| Ruta en `routes.tsx` | No existe |

### Mapa de dependencias

```
                  ┌────────────────────┐
                  │  SW-01  Modelo de  │
                  │  datos trabajador  │
                  │  + tarea operativa │
                  └────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌────────────┐ ┌───────────────┐
     │  SW-02     │ │  SW-03     │ │  SW-04        │
     │  CRUD      │ │  API       │ │  Sidebar +    │
     │  Backend   │ │  Client TS │ │  Ruta         │
     └──────┬─────┘ └─────┬──────┘ └──────┬────────┘
            │             │               │
            └──────┬──────┘               │
                   ▼                      │
          ┌────────────────┐              │
          │  SW-05  Página │◄─────────────┘
          │  ScrapyardWorkers
          │  (Frontend)    │
          └──────┬─────────┘
                 │
       ┌─────────┼──────────┬──────────┐
       ▼         ▼          ▼          ▼
  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
  │ SW-06   │ │ SW-07    │ │ SW-08  │ │ SW-09    │
  │ Tareas  │ │ Produc-  │ │ Alertas│ │ Conexio- │
  │ Opera-  │ │ tividad  │ │ desgu. │ │ nes cruc.│
  │ tivas   │ │ y KPIs   │ │ worker │ │ módulos  │
  └─────────┘ └──────────┘ └────────┘ └──────────┘
```

---

## Tickets

---

### SW-01 — Modelo de datos: Entidad Trabajador de Desguace + Tarea Operativa

**Tipo:** Backend + API Client
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

Actualmente `trabajadores` en `buildDismantlingSession` es un `string[]` de nombres y `desmontadoPor` en piezas es un string plano. No hay entidad propia de trabajador de desguace, lo que impide:
- Gestionar datos personales, documentación, zona de trabajo o permisos del trabajador.
- Asignar tareas operativas (recepción, desmontaje, catalogación, almacén, venta, expedición) con trazabilidad.
- Calcular productividad individual, coste laboral ni rendimiento por puesto.
- Detectar documentación caducada, exceso de horas o bajo rendimiento.

El vertical de construcción ya tiene `construction_worker` como referencia de patrón. Necesitamos `scrapyard_worker` y `scrapyard_task` en la DB `*-scrapyard`.

#### Qué hacer

**1. Definir tipo de documento `scrapyard_worker` en CouchDB**

```typescript
export interface ScrapyardWorkerDocument {
  _id: string;                     // scwk-{uuid}
  _rev?: string;
  type: 'scrapyard_worker';
  id: string;
  user_id: string;                 // ID del owner del negocio

  // ── Datos personales ──────────────────────────────────
  name: string;                    // Nombre completo
  phone: string;
  email: string;
  avatar?: string;                 // Iniciales o URL
  address?: string;

  // ── Vínculo con equipo ────────────────────────────────
  teamMemberId?: string;           // Enlace con business.members

  // ── Puesto y zona ─────────────────────────────────────
  role: string;                    // Ej: "Desmontador", "Catalogador", "Almacenero", "Vendedor", "Recepcionista", "Expedidor"
  zone: string;                    // Ej: "Zona A - Desmontaje", "Zona B - Almacén", "Zona C - Ventas"
  specializations: string[];       // Ej: ["Motor", "Carrocería", "Electricidad"]

  // ── Documentación ─────────────────────────────────────
  documents: ScrapyardWorkerDoc[];

  // ── Contrato y costes ─────────────────────────────────
  contractType: 'full_time' | 'part_time' | 'temporary' | 'freelance';
  hourlyCost: number;              // Coste/hora para la empresa (€)
  weeklyHours: number;             // Horas contratadas por semana
  startDate: string;               // YYYY-MM-DD
  endDate?: string;                // Si temporal

  // ── Horario y turno ───────────────────────────────────
  shift: 'manana' | 'tarde' | 'completa' | 'rotativo';
  schedule: string;                // Ej: "07:00 – 15:00"
  scheduleDetails?: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
  };

  // ── Permisos ──────────────────────────────────────────
  permissions: string[];           // Ej: ["despiece", "catalogacion", "ventas", "almacen", "tpv", "expedicion"]

  // ── Estado ────────────────────────────────────────────
  status: 'active' | 'inactive' | 'vacation' | 'sick_leave';

  // ── Metadatos ─────────────────────────────────────────
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapyardWorkerDoc {
  type: string;        // "Contrato", "PRL", "EPI", "Carnet conducir", "Manipulador residuos", "DNI", "Nómina"
  status: 'valid' | 'pending' | 'expired';
  expiresAt?: string;  // YYYY-MM-DD
  fileUrl?: string;
  notes?: string;
}
```

**2. Definir tipo de documento `scrapyard_task` en CouchDB**

```typescript
export interface ScrapyardTaskDocument {
  _id: string;                     // sctk-{uuid}
  _rev?: string;
  type: 'scrapyard_task';
  id: string;
  user_id: string;

  // ── Tipo de tarea ─────────────────────────────────────
  taskType: 'recepcion' | 'desmontaje' | 'catalogacion' | 'almacen' | 'venta' | 'expedicion';

  // ── Asignación ────────────────────────────────────────
  assignedWorkerId?: string;       // Ref a scrapyard_worker._id
  assignedWorkerName?: string;     // Desnormalizado para lectura rápida

  // ── Vínculos con entidades ────────────────────────────
  vehicleId?: string;              // Ref al vehículo (para recepción, desmontaje)
  vehiclePlate?: string;           // Desnormalizado
  vehicleModel?: string;           // Desnormalizado
  partIds?: string[];              // Ref a piezas (para catalogación, almacén)
  saleId?: string;                 // Ref a venta (para venta, expedición)
  orderId?: string;                // Ref a pedido (para expedición)

  // ── Contenido ─────────────────────────────────────────
  title: string;                   // Ej: "Recepción VW Golf VII - 8823 VWX"
  description?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  zone?: string;                   // Zona donde se ejecuta

  // ── Estado y tiempos ──────────────────────────────────
  status: 'pending' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  scheduledDate: string;           // YYYY-MM-DD
  scheduledStartTime?: string;     // HH:mm
  estimatedMinutes?: number;       // Tiempo estimado
  
  // ── Tracking de tiempo ────────────────────────────────
  timeEntries: TaskTimeEntry[];    // Registro de inicios/pausas/fin
  totalMinutes: number;            // Minutos reales acumulados

  // ── Resultado ─────────────────────────────────────────
  result?: {
    partsExtracted?: number;       // Para desmontaje: piezas extraídas
    partsCataloged?: number;       // Para catalogación: piezas catalogadas
    partsStored?: number;          // Para almacén: piezas almacenadas
    saleAmount?: number;           // Para venta: importe
    itemsShipped?: number;         // Para expedición: ítems enviados
    notes?: string;
  };

  // ── Metadatos ─────────────────────────────────────────
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskTimeEntry {
  action: 'start' | 'pause' | 'resume' | 'complete';
  timestamp: string;               // ISO 8601
  notes?: string;
}
```

**3. Añadir builders en `services/couchdb.js`**

Implementar `buildScrapyardWorkerDocument(userId, data, existing)` y `buildScrapyardTaskDocument(userId, data, existing)` siguiendo el patrón de `buildConstructionWorkerDocument` y `buildConstructionTaskDocument`.

**4. Añadir constantes para DB**

Asegurar que `getScrapyardDbName(userId)` existe y se usa para ambos tipos de documento (junto con `scrapyard_part` y `dismantling_session`).

**5. Añadir tipos al API client**

Crear `ScrapyardWorker` y `ScrapyardTask` en `src/app/lib/scrapyardApi.ts` con sus interfaces TypeScript correspondientes.

#### Criterios de aceptación

- [x] `buildScrapyardWorkerDocument` existe en `couchdb.js` con todos los campos.
- [x] `buildScrapyardTaskDocument` existe en `couchdb.js` con todos los campos.
- [x] Las interfaces `ScrapyardWorker`/`ScrapyardTask` están en `scrapyardApi.ts`.
- [ ] El campo `trabajadores` en `buildDismantlingSession` acepta objetos `{ workerId, workerName }` además del string plano (no verificado).
- [ ] El campo `desmontadoPor` en `buildScrapyardPartDocument` acepta `{ workerId, workerName }` (sigue siendo string plano).
- [ ] Tests manuales: crear, leer, actualizar documentos de ambos tipos en CouchDB.

---

### SW-02 — CRUD Backend: Trabajadores y Tareas de Desguace

**Tipo:** Backend (Express)
**Prioridad:** Crítica
**Dependencias:** SW-01

#### Contexto

Se necesitan endpoints REST para gestionar trabajadores y tareas operativas del desguace. Seguir el patrón de `constructionController.js` para trabajadores y `scrapyardController.js` para la estructura de router.

#### Qué hacer

**1. Endpoints de trabajadores en `scrapyardController.js`**

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/scrapyard/workers` | Listar todos los trabajadores del negocio |
| `GET` | `/api/scrapyard/workers/:id` | Obtener detalle de un trabajador |
| `POST` | `/api/scrapyard/workers` | Crear nuevo trabajador |
| `PUT` | `/api/scrapyard/workers/:id` | Actualizar trabajador |
| `DELETE` | `/api/scrapyard/workers/:id` | Eliminar trabajador (soft delete → status: 'inactive') |
| `GET` | `/api/scrapyard/workers/:id/stats` | KPIs del trabajador (piezas, ventas, horas, productividad) |

**2. Endpoints de tareas en `scrapyardController.js`**

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/scrapyard/tasks` | Listar tareas (filtrable por fecha, tipo, trabajador, estado) |
| `GET` | `/api/scrapyard/tasks/:id` | Detalle de tarea |
| `POST` | `/api/scrapyard/tasks` | Crear tarea |
| `PUT` | `/api/scrapyard/tasks/:id` | Actualizar tarea |
| `POST` | `/api/scrapyard/tasks/:id/start` | Iniciar tarea (añadir timeEntry 'start') |
| `POST` | `/api/scrapyard/tasks/:id/pause` | Pausar tarea |
| `POST` | `/api/scrapyard/tasks/:id/resume` | Reanudar tarea |
| `POST` | `/api/scrapyard/tasks/:id/complete` | Completar tarea (añadir timeEntry 'complete', calcular totalMinutes, guardar resultado) |
| `POST` | `/api/scrapyard/tasks/:id/assign` | Asignar tarea a trabajador |

**3. Endpoint de productividad agregada**

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/scrapyard/workers/productivity` | KPIs agregados de todos los trabajadores para un periodo (query: `from`, `to`) |

Devuelve por cada trabajador:
- Horas trabajadas (de tareas completadas)
- Piezas extraídas (suma de `result.partsExtracted` en tareas de desmontaje)
- Piezas catalogadas (suma de `result.partsCataloged` en tareas de catalogación)
- Ventas atendidas (cuenta de tareas de venta completadas + suma de `result.saleAmount`)
- Expediciones (cuenta de tareas de expedición completadas)
- Productividad por hora (piezas/hora y €/hora)
- Coste laboral (horas × costeHora)
- Incidencias (tareas canceladas o con problemas)
- Tendencia vs periodo anterior

**4. Registrar rutas en `scrapyardRouter.js`**

Añadir todas las rutas nuevas al router existente con el middleware de autenticación estándar.

#### Criterios de aceptación

- [ ] CRUD completo de trabajadores funciona via API (crear, listar, obtener, actualizar, eliminar).
- [ ] CRUD completo de tareas funciona via API.
- [ ] El flujo de tiempo (start → pause → resume → complete) calcula correctamente `totalMinutes`.
- [ ] El endpoint `/workers/productivity` devuelve KPIs correctos cruzando tareas + fichajes.
- [ ] Los endpoints validan datos con sanitización (normalizeText, trim, etc.).
- [ ] Activity log se escribe en operaciones de escritura (logAccountActivity).
- [ ] Permisos: solo usuarios autenticados del negocio pueden acceder.

---

### SW-03 — API Client TypeScript

**Tipo:** Frontend (API layer)
**Prioridad:** Crítica
**Dependencias:** SW-02

#### Contexto

Se necesitan funciones en `scrapyardApi.ts` que conecten el frontend con los endpoints del backend. Seguir el patrón existente en el mismo archivo (las funciones de piezas y despiece ya están ahí).

#### Qué hacer

**1. Añadir en `src/app/lib/scrapyardApi.ts`**

```typescript
// ── Trabajadores ─────────────────────────────────────────
export async function listScrapyardWorkers(): Promise<ScrapyardWorker[]>
export async function getScrapyardWorker(id: string): Promise<ScrapyardWorker>
export async function createScrapyardWorker(data: Partial<ScrapyardWorker>): Promise<ScrapyardWorker>
export async function updateScrapyardWorker(id: string, data: Partial<ScrapyardWorker>): Promise<ScrapyardWorker>
export async function deleteScrapyardWorker(id: string): Promise<void>
export async function getScrapyardWorkerStats(id: string, from?: string, to?: string): Promise<WorkerStats>
export async function getScrapyardWorkersProductivity(from: string, to: string): Promise<WorkerProductivityReport[]>

// ── Tareas operativas ────────────────────────────────────
export async function listScrapyardTasks(filters?: TaskFilters): Promise<ScrapyardTask[]>
export async function getScrapyardTask(id: string): Promise<ScrapyardTask>
export async function createScrapyardTask(data: Partial<ScrapyardTask>): Promise<ScrapyardTask>
export async function updateScrapyardTask(id: string, data: Partial<ScrapyardTask>): Promise<ScrapyardTask>
export async function startScrapyardTask(id: string): Promise<ScrapyardTask>
export async function pauseScrapyardTask(id: string): Promise<ScrapyardTask>
export async function resumeScrapyardTask(id: string): Promise<ScrapyardTask>
export async function completeScrapyardTask(id: string, result?: TaskResult): Promise<ScrapyardTask>
export async function assignScrapyardTask(id: string, workerId: string): Promise<ScrapyardTask>
```

**2. Definir interfaces TypeScript completas**

Interfaces para: `ScrapyardWorker`, `ScrapyardWorkerDoc`, `ScrapyardTask`, `TaskTimeEntry`, `TaskResult`, `TaskFilters`, `WorkerStats`, `WorkerProductivityReport`.

#### Criterios de aceptación

- [ ] Todas las funciones están exportadas y tipadas.
- [ ] Las interfaces coinciden con el modelo de datos de SW-01.
- [ ] Se usa el patrón de peticiones existente (`apiClient.get`, `apiClient.post`, etc.).
- [ ] Los filtros de tareas soportan: `date`, `taskType`, `workerId`, `status`, `vehicleId`.

---

### SW-04 — Sidebar + Ruta: Trabajadores Desguace

**Tipo:** Frontend (Routing + Layout)
**Prioridad:** Crítica
**Dependencias:** Ninguna (puede ir en paralelo con SW-01/02/03)

#### Contexto

No existe entrada en el sidebar ni ruta en `routes.tsx` para la página de trabajadores del desguace. Hay que añadir ambas siguiendo el patrón existente de las demás páginas del vertical.

#### Qué hacer

**1. Añadir ruta en `src/app/routes.tsx`**

En el bloque Scrapyard (líneas 657–671), añadir:

```typescript
{ path: 'scrapyard-workers', Component: ScrapyardWorkers },
{ path: 'vertical/desguaces/trabajadores', Component: ScrapyardWorkers },
```

Añadir el import correspondiente:

```typescript
import { ScrapyardWorkers } from './pages/saas/ScrapyardWorkers';
```

**2. Añadir ítem en el sidebar (`Sidebar.tsx`)**

En el bloque de desguace (líneas 346–356), añadir antes de `scrapyard-reports`:

```typescript
{ id: 'scrapyard-workers', navKey: 'scrapyardWorkers', icon: <HardHat className="w-5 h-5" />, path: '/saas/vertical/desguaces/trabajadores' },
```

Usar el icono `HardHat` de lucide-react (o `Users` si `HardHat` no está disponible). El ítem debe aparecer entre "Expedición" e "Informes" en el menú.

**3. Añadir la `navKey` en las traducciones i18n**

Añadir `scrapyardWorkers: "Trabajadores"` en los archivos de traducción relevantes para que el sidebar muestre el label correcto.

#### Criterios de aceptación

- [ ] La URL `/saas/vertical/desguaces/trabajadores` carga el componente `ScrapyardWorkers`.
- [ ] La URL `/saas/scrapyard-workers` también carga el mismo componente (alias).
- [ ] El sidebar muestra "Trabajadores" con icono en el bloque de desguace.
- [ ] El ítem del sidebar se resalta correctamente cuando la ruta está activa.
- [ ] Navegación desde el sidebar funciona sin errores.

---

### SW-05 — Página ScrapyardWorkers.tsx (Frontend principal)

**Tipo:** Frontend (React)
**Prioridad:** Crítica
**Dependencias:** SW-03, SW-04

#### Contexto

Es la página central del módulo. Debe seguir el patrón de `ButcherWorkers.tsx` (que es la referencia más completa) adaptado al contexto del desguace. Inicialmente trabajará con datos mock hasta que el backend esté listo (SW-02), pero la estructura debe estar preparada para consumir la API real.

#### Qué hacer

**1. Estructura del componente**

- Layout con `<Layout title="Trabajadores y Operativa" subtitle="Desguace — Rendimiento del equipo">`
- Toggle de rol: Gerente / Trabajador (como en ButcherWorkers)
- 4 pestañas: **Resumen**, **Equipo**, **Rendimiento**, **Alertas**
- Indicador de estado en vivo con hora de última actualización
- Badge de alertas críticas visible en header

**2. Tipos e interfaces**

```typescript
type UserRole = 'gerente' | 'trabajador';
type TabId = 'resumen' | 'equipo' | 'rendimiento' | 'alertas';
type AlertSeverity = 'critical' | 'warning' | 'info';
type ShiftType = 'manana' | 'tarde' | 'completa' | 'rotativo';
type TaskType = 'recepcion' | 'desmontaje' | 'catalogacion' | 'almacen' | 'venta' | 'expedicion';
type WorkerZone = string;

interface ScrapyardWorkerUI {
  id: string;
  nombre: string;
  avatar: string;
  rol: string;                     // "Desmontador", "Catalogador", etc.
  email: string;
  telefono: string;
  zona: string;                    // "Zona A - Desmontaje", etc.
  turno: ShiftType;
  horario: string;
  costeHora: number;
  estado: 'fichado' | 'descanso' | 'sin_fichar' | 'libre';
  horaEntrada: string | null;
  permisos: string[];              // ["despiece", "catalogacion", "ventas", ...]
  especializaciones: string[];     // ["Motor", "Carrocería", ...]
  documentos: { tipo: string; estado: 'vigente' | 'pendiente' | 'caducado' }[];
  // KPIs diarios
  piezasDesmontadas: number;
  piezasCatalogadas: number;
  ventasAtendidas: number;
  ingresosHoy: number;
  expedicionesHoy: number;
  horasTrabajadas: number;
  tareasCompletadas: number;
  tareasPendientes: number;
  tareasEnCurso: number;
  incidencias: number;
  productividadHora: number;       // piezas/hora
  tendencia: number;               // % vs periodo anterior
}
```

**3. Datos mock (fase 1)**

Generar 6 trabajadores de desguace con datos realistas:
- **Juan Martínez** — Desmontador Senior, Zona A, turno mañana, especialización Motor+Transmisión
- **Ana Pérez** — Catalogadora, Zona B, turno mañana, especialización Electricidad+Interior
- **Carlos Ruiz** — Vendedor/Mostrador, Zona C, turno completa, permisos TPV+ventas
- **María García** — Almacenera, Zona B, turno mañana, especialización Carrocería
- **Pedro López** — Desmontador, Zona A, turno tarde, especialización Suspensión+Frenos
- **Laura Sánchez** — Recepcionista/Expedidora, Zona C, turno mañana, permisos recepción+expedición

**4. Pestaña RESUMEN — Vista Gerente**

KPIs (8 tarjetas en grid 2×4):
1. **Piezas procesadas** — total piezas desmontadas+catalogadas hoy por el equipo, trend vs ayer
2. **Ventas equipo** — importe total de ventas atendidas hoy, con nº tickets
3. **Productividad/h** — media de piezas por hora del equipo
4. **Equipo fichado** — X/Y trabajadores activos, click → fichajes
5. **Horas trabajadas** — total equipo hoy
6. **Coste laboral** — estimado hoy (horas × coste/hora), ratio sobre ventas
7. **Tareas pendientes** — nº de tareas sin iniciar hoy
8. **Alertas activas** — nº alertas con badge de críticas

Gráficas (2 columnas):
- **Productividad por hora** — AreaChart con piezas procesadas por franja horaria
- **Distribución por tipo de tarea** — BarChart horizontal: recepción, desmontaje, catalogación, almacén, venta, expedición (completadas vs pendientes)

Tabla **Ranking productividad** — trabajadores ordenados por productividad con medalla, nombre, estado, piezas, ventas, €/hora, tendencia.

Bloque **Conexiones rápidas** — 8 accesos: Dashboard, Despiece, Stock, Ventas, Expedición, Equipo Core, Fichajes, Informes.

**5. Pestaña RESUMEN — Vista Trabajador**

KPIs (4 tarjetas):
1. Mis piezas hoy (desmontadas/catalogadas según su rol)
2. Mis ventas/expediciones
3. Horas trabajadas
4. Hora de entrada

Bloque **Mis tareas de hoy** — lista de tareas asignadas con estado (pendiente/en_curso/completada), tipo, vehículo/pieza relacionados, y tiempo dedicado. Botones: Iniciar, Pausar, Completar.

Bloque **Mi horario** — horario del día, botones Fichar y Ver tareas.

**6. Pestaña EQUIPO**

- Barra de búsqueda (nombre o rol)
- Filtros: turno (mañana/tarde/completa), estado (fichado/descanso/sin_fichar/libre), zona (A/B/C)
- Barra de estados (contadores por estado con colores)
- Grid de **WorkerCards** (2 columnas) con:
  - Avatar + nombre + estado badge
  - Rol + zona + turno + horario
  - KPIs mini: piezas hoy, ventas €, horas
  - Coste/hora, permisos TPV, documentos pendientes
  - Tendencia de productividad
- Click en card abre **WorkerDetailModal**

**7. WorkerDetailModal**

- Header: avatar grande, nombre, estado, rol, zona, horario, turno, coste/hora
- Contacto: email, teléfono
- KPIs del día: piezas, ventas, horas, productividad/h (4 cards)
- **Radar de rendimiento** (RadarChart): Piezas, Ventas, Productividad, Tareas, Puntualidad
- **Tareas**: completadas vs pendientes (PieChart mini + contadores)
- **Incidencias hoy**
- **Coste laboral hoy** (horas × coste)
- **Especializaciones**: badges con categorías de piezas
- **Permisos**: badges con permisos asignados
- **Documentación**: lista de documentos con estado (vigente/pendiente/caducado)
- Acciones: Fichajes, Ficha completa (→ `/saas/team/:id`), Asignar tarea, Cerrar

**8. Pestaña RENDIMIENTO (solo gerente)**

Tabla detallada con columnas: Trabajador, Zona, Turno, Horas, Piezas desmontadas, Piezas catalogadas, Ventas nº, Ventas €, Expediciones, Piez/hora, €/hora, Coste laboral, Incidencias, Tareas completadas/total, Tendencia.

Fila de totales al final.

Gráfica **Ventas por hora del equipo** — BarChart con colores por intensidad.

**9. Pestaña ALERTAS**

Tarjetas resumen: Críticas, Avisos, Informativas (contadores).

Lista de alertas con:
- Icono por tipo
- Nombre del trabajador + badge de severidad
- Mensaje descriptivo
- Botón "Resolver" → navega a contexto

Tipos de alerta mock:
- `sin_fichar` (crítica): "Ana Pérez no ha fichado — Su turno empezaba a las 07:30"
- `baja_productividad` (aviso): "María García — Productividad 38% por debajo de la media"
- `exceso_horas` (aviso): "Juan Martínez — Acumula 4.5h extra esta semana"
- `documento_caducado` (aviso): "Pedro López — Certificado PRL caducado"
- `tarea_pendiente` (info): "3 tareas de catalogación pendientes sin asignar"

**10. Colores del vertical desguace**

Usar la paleta del desguace ya existente en ScrapyardHub/Reports:
- Gradientes de avatar: `from-blue-400 to-indigo-600` (azul industrial)
- Accent principal: azul (`#2563eb`)
- Gradient IDs únicos para evitar conflictos: `scrapWorkerProdGrad`, etc.

#### Criterios de aceptación

- [ ] La página carga en `/saas/vertical/desguaces/trabajadores` sin errores.
- [ ] Toggle gerente/trabajador cambia la vista correctamente.
- [ ] Las 4 pestañas (Resumen, Equipo, Rendimiento, Alertas) funcionan.
- [ ] Los KPIs muestran datos coherentes calculados a partir de los mock.
- [ ] Las gráficas (AreaChart, BarChart, RadarChart, PieChart) renderizan correctamente.
- [ ] La búsqueda y filtros de equipo funcionan.
- [ ] El modal de detalle del trabajador se abre y muestra toda la información.
- [ ] Las conexiones rápidas navegan correctamente a las páginas destino.
- [ ] El diseño es responsive (mobile-first) y sigue el design system existente.
- [ ] Dark mode funciona correctamente en toda la página.
- [ ] No hay errores de TypeScript ni warnings de React.

---

### SW-06 — Tareas Operativas: Pipeline visual en la página

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** SW-05

#### Contexto

Además de las pestañas del equipo, la página necesita un sistema visual de tareas operativas que muestre el pipeline del desguace: qué tareas están pendientes, en curso y completadas, con la relación con vehículos y piezas.

#### Qué hacer

**1. Añadir pestaña "Tareas" a la navegación**

Modificar `TabId` para incluir `'tareas'` como quinta pestaña (entre Resumen y Equipo):

```typescript
type TabId = 'resumen' | 'tareas' | 'equipo' | 'rendimiento' | 'alertas';
```

**2. Vista Gerente — Panel de tareas**

- **Filtros**: fecha (hoy / semana), tipo de tarea, trabajador asignado, estado, zona
- **Resumen visual por tipo** — 6 mini-cards en grid mostrando por cada tipo (recepción, desmontaje, catalogación, almacén, venta, expedición): icono + pendientes / en curso / completadas
- **Lista de tareas** — tabla con columnas: Tipo (badge color), Título, Vehículo/Pieza, Asignado a, Estado, Prioridad, Tiempo estimado vs real, Acciones (asignar / ver detalle)
- **Creación rápida de tarea** — botón "Nueva tarea" que abre un formulario inline o modal simple

Configuración de colores por tipo de tarea:
| Tipo | Color | Icono |
|---|---|---|
| `recepcion` | emerald | `Truck` |
| `desmontaje` | orange | `Wrench` |
| `catalogacion` | blue | `ClipboardList` |
| `almacen` | violet | `Boxes` |
| `venta` | emerald | `Receipt` |
| `expedicion` | cyan | `PackageCheck` |

**3. Vista Trabajador — Mis tareas**

- Lista de tareas asignadas al trabajador para hoy
- Cada tarea muestra: tipo, título, vehículo/pieza, prioridad, tiempo estimado
- Botones de acción: **Iniciar** (→ status in_progress, añade timeEntry start), **Pausar**, **Reanudar**, **Completar** (abre mini-formulario de resultado)
- Cronómetro visual cuando la tarea está en curso
- Resumen del día: tareas completadas, tiempo total, piezas procesadas

**4. Datos mock para tareas**

Generar 8-10 tareas de ejemplo para el día con variedad de tipos, estados y asignaciones. Incluir relaciones con vehículos y piezas existentes en los mock data.

#### Criterios de aceptación

- [ ] La pestaña "Tareas" aparece entre Resumen y Equipo.
- [ ] Vista gerente: los 6 tipos de tarea se muestran con contadores correctos.
- [ ] Vista gerente: la tabla de tareas se filtra correctamente.
- [ ] Vista trabajador: solo se ven las tareas asignadas al usuario.
- [ ] El flujo Iniciar → Pausar → Reanudar → Completar funciona visualmente.
- [ ] El cronómetro se actualiza en tiempo real cuando una tarea está en curso.
- [ ] El mini-formulario de resultado aparece al completar y captura datos según el tipo de tarea.
- [ ] Los vehículos y piezas relacionados son clickables y navegan a su detalle.

---

### SW-07 — Automatización: Cálculos de productividad y KPIs reales

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** SW-02, SW-05

#### Contexto

Una vez el backend de trabajadores y tareas esté listo (SW-02), hay que conectar la página con datos reales y calcular las métricas de productividad automáticamente.

#### Qué hacer

**1. Reemplazar datos mock por llamadas a API**

En `ScrapyardWorkers.tsx`, sustituir `generateMockData()` por:
- `listScrapyardWorkers()` — lista de trabajadores
- `getScrapyardWorkersProductivity(from, to)` — KPIs agregados
- `listScrapyardTasks({ date: today })` — tareas del día
- Cruce con datos de fichajes vía `clockinsApi`

**2. Cálculos de productividad (backend — endpoint `/workers/productivity`)**

Para cada trabajador, el backend debe cruzar:

| Métrica | Fuente |
|---|---|
| Piezas desmontadas | Tareas de tipo `desmontaje` completadas → `result.partsExtracted` |
| Piezas catalogadas | Tareas de tipo `catalogacion` completadas → `result.partsCataloged` |
| Ventas atendidas | Tareas de tipo `venta` completadas → count + `result.saleAmount` |
| Expediciones | Tareas de tipo `expedicion` completadas → `result.itemsShipped` |
| Horas trabajadas | Suma de `totalMinutes` de todas las tareas completadas del periodo, cruzado con fichajes |
| Productividad/hora | (piezas desmontadas + catalogadas) / horas trabajadas |
| €/hora | ventas € / horas trabajadas |
| Coste laboral | horas × `hourlyCost` del trabajador |
| Ratio coste/ingreso | coste laboral / ventas generadas × 100 |
| Tendencia | Comparar con el mismo periodo anterior (semana ant., mes ant.) |

**3. Productividad por puesto/zona**

El endpoint acepta agrupación por `zone` o `role` para que el gerente pueda comparar zonas y puestos.

**4. Relación tareas → vehículos y piezas**

Al completar una tarea, actualizar la entidad relacionada:
- Tarea de desmontaje completada → actualizar `desmontadoPor` en las piezas extraídas con `{ workerId, workerName }`
- Tarea de catalogación completada → las piezas catalogadas registran quién las catalogó
- Tarea de venta completada → la venta referencia al trabajador que la atendió

#### Criterios de aceptación

- [ ] La página funciona con datos reales del backend (no mock).
- [ ] Los KPIs se calculan correctamente a partir de tareas y fichajes.
- [ ] La productividad por zona/puesto se puede consultar.
- [ ] Al completar una tarea, las entidades relacionadas se actualizan.
- [ ] La tendencia se calcula comparando con el periodo anterior.
- [ ] Loading states y error handling están implementados.

---

### SW-08 — Alertas de trabajadores de desguace

**Tipo:** Backend (Alert Engine)
**Prioridad:** Alta
**Dependencias:** SW-02

#### Contexto

El motor de alertas (`alertEngine.js`) ya tiene infraestructura para dedup, SSE y push. Necesitamos reglas específicas para el módulo de trabajadores del desguace.

#### Qué hacer

**1. Añadir constantes en `alertConstants.js`**

```javascript
// Scrapyard Workers
scrapyard_worker_no_clockin:     { severity: 'critical', ttl: 3600 },
scrapyard_worker_overtime:       { severity: 'warning',  ttl: 7200 },
scrapyard_worker_doc_expired:    { severity: 'warning',  ttl: 86400 },
scrapyard_worker_low_perf:       { severity: 'warning',  ttl: 14400 },
scrapyard_task_pending_overdue:  { severity: 'warning',  ttl: 3600 },
scrapyard_task_unassigned:       { severity: 'info',     ttl: 7200 },
```

**2. Implementar función `checkScrapyardWorkerAlerts` en `alertEngine.js`**

| Regla | Condición | Severidad |
|---|---|---|
| `scrapyard_worker_no_clockin` | Trabajador activo con turno que debería haber empezado hace >15 min y no tiene fichaje del día | critical |
| `scrapyard_worker_overtime` | Trabajador acumula >X horas extra en la semana (umbral configurable, default 5h) | warning |
| `scrapyard_worker_doc_expired` | Algún documento del trabajador tiene `status: 'expired'` o `expiresAt` < hoy | warning |
| `scrapyard_worker_low_perf` | Productividad del trabajador en los últimos 7 días es <50% de la media del equipo | warning |
| `scrapyard_task_pending_overdue` | Tarea con `status: 'pending'` y `scheduledDate` < hoy (o `scheduledStartTime` pasado >30 min) | warning |
| `scrapyard_task_unassigned` | Tarea con `scheduledDate` = hoy y sin `assignedWorkerId` | info |

**3. Registrar en el loop de alertas**

Añadir `checkScrapyardWorkerAlerts` al ciclo de ejecución del motor de alertas, condicionado a que el negocio sea de tipo `scrapyard`.

**4. Conectar con el frontend**

Las alertas generadas por el motor se muestran en:
- Pestaña "Alertas" de `ScrapyardWorkers.tsx`
- Badge de notificaciones en el header
- Widget de alertas en `ScrapyardDashboard.tsx`

#### Criterios de aceptación

- [ ] Las 6 reglas de alerta están implementadas y se ejecutan periódicamente.
- [ ] Las alertas se deduplican correctamente (no se repiten mientras la condición persista).
- [ ] Las alertas aparecen en la pestaña "Alertas" de la página de trabajadores.
- [ ] Las alertas se envían por SSE/Push si el usuario tiene la app abierta.
- [ ] Los umbrales son configurables (overtime hours, performance threshold, clockin grace period).

---

### SW-09 — Conexiones cruzadas con otros módulos

**Tipo:** Frontend + Backend (integración)
**Prioridad:** Media
**Dependencias:** SW-05, SW-07

#### Contexto

La página de trabajadores debe estar conectada bidireccionalmente con los módulos existentes del desguace y del core SaaS.

#### Qué hacer

**1. Conexión con Equipo Core (`/saas/team`)**

- Si el trabajador tiene `teamMemberId`, enlazar al perfil completo en `/saas/team/:id`
- En la página de Equipo Core, si el negocio es `scrapyard`, mostrar un enlace "Ver en Trabajadores Desguace" → `/saas/vertical/desguaces/trabajadores`
- Sincronizar datos básicos (nombre, email, teléfono) con `business.members`

**2. Conexión con Fichajes (`/saas/clockins`)**

- En el modal del trabajador, botón "Ver fichajes" → `/saas/clockins?worker=:id`
- Cruce de horas fichadas vs horas de tareas para detectar discrepancias
- En la página de Fichajes, si hay trabajadores de desguace, mostrar enlace cruzado

**3. Conexión con Despiece (`/saas/scrapyard-parts`)**

- Al completar tarea de desmontaje, actualizar piezas con `desmontadoPor: { workerId, workerName }`
- En el detalle de una pieza, mostrar quién la desmontó (clickable → modal trabajador)
- En la sesión de despiece, `trabajadores` pasa de `string[]` a `{ workerId, workerName }[]`

**4. Conexión con Stock piezas (`/saas/scrapyard-inventory`)**

- En el inventario, mostrar quién catalogó cada pieza
- Filtro por trabajador catalogador

**5. Conexión con Ventas (`/saas/scrapyard-sales`)**

- En cada venta/pedido, registrar qué trabajador la atendió
- En la tabla de ventas, columna "Atendido por"
- En el detalle de venta, enlace al trabajador

**6. Conexión con Dashboard (`ScrapyardDashboard.tsx`)**

- Widget "Equipo hoy" con miniatura de trabajadores fichados y sus KPIs
- Tabla de rendimiento por trabajador ya existe en ScrapyardHub — reemplazar mock data por datos reales
- Enlace "Ver más" → `/saas/vertical/desguaces/trabajadores`

**7. Conexión con Informes (`ScrapyardReports.tsx`)**

- Pestaña "Trabajadores" ya existe con datos mock — reemplazar por datos reales del endpoint `/workers/productivity`
- Gráfica comparativa ya existe — conectar a datos reales

**8. Actualizar ScrapyardHub.tsx**

- En la tabla "Rendimiento por trabajador", el botón "Ver equipo" debe apuntar a `/saas/vertical/desguaces/trabajadores` en vez de `/saas/team`
- Reemplazar datos mock de `WorkerPerf` por datos reales cuando el backend esté listo

#### Criterios de aceptación

- [ ] Desde la página de trabajadores se puede navegar a: Equipo, Fichajes, Despiece, Stock, Ventas, Dashboard, Informes.
- [ ] Desde cada módulo conectado se puede volver a la página de trabajadores.
- [ ] Los datos de trabajadores fluyen bidireccionalmente (lo que se crea en Trabajadores aparece en los módulos conectados).
- [ ] ScrapyardHub enlaza a `/saas/vertical/desguaces/trabajadores` en vez de `/saas/team`.
- [ ] ScrapyardReports pestaña Trabajadores consume datos reales.
- [ ] ScrapyardDashboard muestra widget de equipo con datos reales.

---

## Resumen de esfuerzo y prioridad

| Ticket | Título | Prioridad | Tipo | Esfuerzo estimado |
|---|---|---|---|---|
| **SW-01** | Modelo de datos: Trabajador + Tarea | Crítica | Backend | 3-4h |
| **SW-02** | CRUD Backend | Crítica | Backend | 6-8h |
| **SW-03** | API Client TypeScript | Crítica | Frontend | 2-3h |
| **SW-04** | Sidebar + Ruta | Crítica | Frontend | 30min |
| **SW-05** | Página ScrapyardWorkers (UI) | Crítica | Frontend | 8-10h |
| **SW-06** | Tareas Operativas (pipeline visual) | Alta | Frontend | 4-6h |
| **SW-07** | Automatización: KPIs reales | Alta | Full-stack | 6-8h |
| **SW-08** | Alertas de trabajadores | Alta | Backend | 3-4h |
| **SW-09** | Conexiones cruzadas con módulos | Media | Full-stack | 4-6h |

**Total estimado:** 37-50 horas

### Orden de ejecución recomendado

```
Fase 1 (MVP — página funcional con mock):
  SW-04 → SW-05 (en paralelo con SW-01)

Fase 2 (Backend):
  SW-01 → SW-02 → SW-03

Fase 3 (Integración):
  SW-06 → SW-07

Fase 4 (Automatización y conexiones):
  SW-08 → SW-09
```

---

## Decisiones de diseño

### ¿Por qué entidad separada `scrapyard_worker` y no reutilizar `business.members`?

1. **Campos específicos del vertical**: zona de trabajo, especializaciones de piezas, permisos de desguace, documentación específica (EPI, manipulador de residuos).
2. **Tareas operativas propias**: el modelo de tareas con tipos (recepción, desmontaje, catalogación, etc.) es exclusivo del desguace.
3. **Productividad por piezas**: las métricas de rendimiento son piezas/hora, no ventas genéricas.
4. **Consistencia con otros verticals**: construcción ya tiene `construction_worker`, limpieza tiene `cleaning_worker`.
5. **`teamMemberId` como puente**: se mantiene la conexión con el equipo core para datos compartidos (nóminas, vacaciones).

### ¿Por qué `scrapyard_task` como entidad separada?

1. **Trazabilidad**: cada tarea registra quién, cuándo, cuánto tiempo y con qué resultado.
2. **Timetracking**: el sistema de `timeEntries` permite pausas y reanudaciones con registro exacto.
3. **Vinculación**: las tareas conectan trabajadores con vehículos, piezas, ventas y expediciones.
4. **Pipeline visual**: los 6 tipos de tarea forman el pipeline operativo del desguace.
5. **Productividad calculable**: los resultados de cada tarea alimentan los KPIs automáticos.
