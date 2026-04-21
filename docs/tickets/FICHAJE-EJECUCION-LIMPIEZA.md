# FICHAJE Y EJECUCIÓN DEL SERVICIO (Limpieza) — Plan de Tickets

**Página:** `/saas/cleaning-execution`
**Objetivo:** Confirmar que el servicio se ha realizado y registrar la ejecución real.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de servicios de limpieza | Completo | `CleaningServices.tsx`, `cleaningApi.ts`, `cleaningController.js` — DB `*-cleaning` |
| Modelo con campos `checkInAt`, `checkOutAt` | Parcial | `couchdb.js` → `buildCleaningServiceDocument` — campos existen pero no se usan en UI |
| Campos `photosBefore`, `photosAfter` | Parcial | Modelo los tiene pero no hay UI para capturar ni visualizar fotos |
| Campo `employeeNotes` | Parcial | Modelo lo tiene pero no hay input en la vista del trabajador |
| Estados del servicio (pending → assigned → in_progress → completed → cancelled) | Completo | `cleaningApi.ts` — `CleaningServiceStatus` |
| Tareas/checklist por servicio | Completo | `CleaningServices.tsx` + `WorkerTpvCleaning.tsx` — toggle `task.done` |
| Campo `duration` (horas previstas) | Completo | Se guarda en el servicio al crearlo |
| Campo `price` | Completo | Se guarda en el servicio |
| Sistema de fichajes genérico (clockins) | Completo | `Clockins.tsx`, `clockinsApi.ts`, `clockinsController.js` — DB `*-clockins` |
| Fichaje con geolocalización | Completo | `clockinsApi.ts` — `GeoLocation`, `useGeolocation` hook |
| Estadísticas de fichajes (minutos, descansos, por miembro) | Completo | `clockinsController.js` → `getStats` |
| Rendimiento cruzado (fichajes × ventas) | Completo | `clockinsController.js` → `getPerformance` |
| Roles (Admin/Gerente ven todo, trabajador ve lo suyo) | Completo | `clockinsController.js` — `ADMIN_ROLES`, organigrama |
| Vista trabajador de limpieza | Completo | `WorkerTpvCleaning.tsx` — lista servicios, checklist, cambio de estado |
| Vista trabajador de fichaje | Completo | `WorkerClock.tsx` — clock in/out, descansos, timer en vivo |
| Calidad y puntuación | Completo | `CleaningQuality.tsx` — `qualityOk`, `qualityRating`, `qualityNotes` |
| Reseñas de cliente | Completo | `CleaningReviews.tsx` — `clientRating`, `clientReview` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Página unificada de fichaje + ejecución del servicio | No existe |
| Vincular fichaje (clock in/out) a un servicio concreto de limpieza | No implementado — clockins y cleaning son DBs separadas sin vínculo |
| Geolocalización al fichar entrada/salida del servicio | No implementado en el flujo de limpieza |
| Captura de fotos (antes/después) desde UI del trabajador | No implementado — campos existen en modelo |
| Campo de observaciones del trabajador al ejecutar | No implementado en UI |
| Registro de incidencias vinculado al servicio | No existe — ni modelo ni UI |
| Cálculo de horas reales vs horas contratadas por servicio | No implementado |
| Comparación visual previsto vs real | No implementado |
| Alertas: no fichado, servicio incompleto, retraso, salida sin entrada, exceso de tiempo | No implementado |
| Vista de gerente para validar ejecuciones | No existe |
| Alimentar productividad y coste real desde la ejecución | No implementado |
| Guardar evidencia fotográfica | No implementado — falta upload y almacenamiento |
| Conexión con Dashboard e Informes | No implementado |

---

## Tickets

---

### FE-01 — Modelo de datos: Ejecución del servicio

**Tipo:** Backend (modelo CouchDB)
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto
Actualmente `buildCleaningServiceDocument` tiene campos `checkInAt` y `checkOutAt` como strings simples. Necesitamos ampliar el modelo para soportar todo el ciclo de ejecución: geolocalización, horas reales, incidencias, observaciones y evidencia fotográfica. Los campos `photosBefore` y `photosAfter` ya existen como arrays vacíos, pero falta infraestructura para poblarlos.

#### Cambios en el modelo `cleaning_service`

Añadir estos campos al documento en `buildCleaningServiceDocument` (en `services/couchdb.js`):

```js
// ── Ejecución ──
execution: {
  checkInAt: '',            // ISO string — momento real de fichaje de entrada
  checkInGeo: null,         // { latitude, longitude, accuracy } | null
  checkOutAt: '',           // ISO string — momento real de fichaje de salida
  checkOutGeo: null,        // { latitude, longitude, accuracy } | null
  realMinutes: 0,           // minutos reales trabajados (calculado)
  plannedMinutes: 0,        // minutos previstos (parseado de duration al fichar)
  deviationMinutes: 0,      // realMinutes - plannedMinutes
  status: 'not_started',    // 'not_started' | 'checked_in' | 'in_progress' | 'paused' | 'completed' | 'validated'
  workerNotes: '',          // observaciones del trabajador
  photosBefore: [],         // [{ url, timestamp, geo? }]
  photosAfter: [],          // [{ url, timestamp, geo? }]
  incidents: [],            // [{ id, type, description, severity, timestamp, photoUrl?, resolvedAt? }]
  pauseLog: [],             // [{ startAt, endAt, reason? }] — para pausas durante el servicio
  validatedBy: '',          // user_id del gerente que validó
  validatedAt: '',          // ISO string
  validationNotes: '',      // notas del gerente
},
```

#### Actualizar `sanitizeCleaningService` para incluir el objeto `execution` en la respuesta.

#### Actualizar `CleaningService` type en `cleaningApi.ts` para reflejar el nuevo modelo.

#### Criterios de aceptación
- [x] El campo `execution` se crea vacío al crear un nuevo servicio
- [x] Los campos legacy (`checkInAt`, `checkOutAt`, `employeeNotes`, `photosBefore`, `photosAfter`) se migran al leer docs antiguos
- [x] `sanitizeCleaningService` expone `execution` correctamente
- [x] El tipo TypeScript `CleaningService` tiene la interfaz `ServiceExecution`
- [x] Tests unitarios validan la estructura del documento

---

### FE-02 — Modelo de datos: Incidencias del servicio

**Tipo:** Backend (modelo + tipos)
**Prioridad:** Alta
**Dependencias:** FE-01

#### Contexto
Las incidencias son eventos que el trabajador registra durante la ejecución: falta de material, acceso denegado, daños encontrados, etc. Se almacenan dentro del array `execution.incidents` del servicio.

#### Definir la interfaz `ServiceIncident`

En `cleaningApi.ts`:

```ts
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType =
  | 'material_missing'     // falta material/producto
  | 'access_denied'        // no se pudo acceder
  | 'damage_found'         // daños encontrados
  | 'client_absent'        // cliente ausente
  | 'equipment_failure'    // fallo de equipo
  | 'safety_hazard'        // riesgo de seguridad
  | 'scope_change'         // cambio de alcance pedido por cliente
  | 'other';               // otro

export interface ServiceIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  photoUrl: string;
  timestamp: string;
  resolvedAt: string;
  resolvedBy: string;
  resolutionNotes: string;
}
```

#### Criterios de aceptación
- [x] Tipos definidos y exportados desde `cleaningApi.ts`
- [x] El backend acepta y persiste el array de incidencias al actualizar un servicio
- [x] Cada incidencia tiene un `id` generado con `uuid`

---

### FE-03 — API endpoints: Ejecución del servicio

**Tipo:** Backend (controller + router)
**Prioridad:** Crítica
**Dependencias:** FE-01

#### Contexto
Actualmente `cleaningController.js` solo tiene CRUD genérico. Necesitamos endpoints específicos para las acciones de ejecución que el trabajador y el gerente necesitan.

#### Nuevos endpoints en `cleaningController.js`

| Método | Ruta | Acción | Permisos |
|---|---|---|---|
| `POST` | `/api/cleaning/services/:userId/:serviceId/check-in` | Registrar entrada al servicio | Trabajador asignado |
| `POST` | `/api/cleaning/services/:userId/:serviceId/check-out` | Registrar salida del servicio | Trabajador asignado |
| `POST` | `/api/cleaning/services/:userId/:serviceId/pause` | Pausar servicio | Trabajador asignado |
| `POST` | `/api/cleaning/services/:userId/:serviceId/resume` | Reanudar servicio | Trabajador asignado |
| `POST` | `/api/cleaning/services/:userId/:serviceId/incident` | Reportar incidencia | Trabajador asignado |
| `PUT` | `/api/cleaning/services/:userId/:serviceId/incident/:incidentId` | Resolver incidencia | Gerente/Admin |
| `POST` | `/api/cleaning/services/:userId/:serviceId/photo` | Subir foto de evidencia | Trabajador asignado |
| `PUT` | `/api/cleaning/services/:userId/:serviceId/validate` | Validar ejecución | Gerente/Admin |
| `GET` | `/api/cleaning/services/:userId/execution-summary` | Resumen de ejecuciones (hoy/rango) | Gerente/Admin |

#### Lógica de `check-in`
```
1. Validar que el servicio existe y está asignado a este trabajador
2. Validar que execution.status === 'not_started' o 'checked_in' (no duplicar)
3. Guardar execution.checkInAt = now, execution.checkInGeo = body.geo
4. Calcular execution.plannedMinutes desde service.duration
5. Cambiar execution.status = 'checked_in', service.status = 'in_progress'
6. Retornar servicio actualizado
```

#### Lógica de `check-out`
```
1. Validar que execution.status === 'checked_in' o 'in_progress' (no check-out sin check-in → alerta)
2. Guardar execution.checkOutAt = now, execution.checkOutGeo = body.geo
3. Calcular execution.realMinutes = diff(checkOutAt - checkInAt) - pausas
4. Calcular execution.deviationMinutes = realMinutes - plannedMinutes
5. Guardar body.workerNotes en execution.workerNotes
6. Cambiar execution.status = 'completed', service.status = 'completed'
7. Retornar servicio actualizado
```

#### Lógica de `validate` (gerente)
```
1. Validar que execution.status === 'completed'
2. Guardar execution.validatedBy, execution.validatedAt, execution.validationNotes
3. Cambiar execution.status = 'validated'
4. Retornar servicio actualizado
```

#### Actualizar `cleaningRouter.js` con las nuevas rutas.

#### Criterios de aceptación
- [x] Todos los endpoints respetan permisos (trabajador solo sus servicios, gerente puede validar)
- [x] `check-in` rechaza si ya hay un check-in activo
- [x] `check-out` calcula minutos reales descontando pausas
- [x] `validate` solo disponible para Admin/Gerente
- [x] Cada acción logea con `logAccountActivity`
- [x] Tests para cada endpoint

---

### FE-04 — API Client: funciones de ejecución en frontend

**Tipo:** Frontend (lib)
**Prioridad:** Crítica
**Dependencias:** FE-03

#### Contexto
Extender `cleaningApi.ts` con las funciones que llaman a los nuevos endpoints.

#### Funciones a añadir en `cleaningApi.ts`

```ts
// ── Ejecución ──
export async function checkInService(userId: string, serviceId: string, geo?: GeoLocation): Promise<CleaningService>;
export async function checkOutService(userId: string, serviceId: string, data: { geo?: GeoLocation; workerNotes?: string }): Promise<CleaningService>;
export async function pauseService(userId: string, serviceId: string, reason?: string): Promise<CleaningService>;
export async function resumeService(userId: string, serviceId: string): Promise<CleaningService>;
export async function reportIncident(userId: string, serviceId: string, incident: Omit<ServiceIncident, 'id' | 'timestamp' | 'resolvedAt' | 'resolvedBy' | 'resolutionNotes'>): Promise<CleaningService>;
export async function resolveIncident(userId: string, serviceId: string, incidentId: string, resolution: { resolvedBy: string; resolutionNotes: string }): Promise<CleaningService>;
export async function uploadServicePhoto(userId: string, serviceId: string, data: { phase: 'before' | 'after'; url: string; geo?: GeoLocation }): Promise<CleaningService>;
export async function validateExecution(userId: string, serviceId: string, data: { validatedBy: string; validationNotes?: string }): Promise<CleaningService>;
export async function fetchExecutionSummary(userId: string, params?: { date?: string; from?: string; to?: string }): Promise<ExecutionSummary>;
```

#### Tipo `ExecutionSummary`

```ts
export interface ExecutionSummary {
  totalServices: number;
  completed: number;
  validated: number;
  pending: number;
  inProgress: number;
  withIncidents: number;
  totalPlannedMinutes: number;
  totalRealMinutes: number;
  deviationMinutes: number;
  avgCompletionRate: number; // % de tareas completadas
  byWorker: {
    memberId: string;
    memberName: string;
    services: number;
    realMinutes: number;
    plannedMinutes: number;
    incidents: number;
  }[];
}
```

#### Criterios de aceptación
- [x] Todas las funciones exportadas y tipadas
- [x] Manejan errores con mensajes descriptivos
- [x] Geo es siempre opcional

---

### FE-05 — Hook: `useGeolocation` (verificar / extender)

**Tipo:** Frontend (hook)
**Prioridad:** Media
**Dependencias:** Ninguna

#### Contexto
Ya existe `useGeolocation` en `src/hooks/useGeolocation.ts` (usado por `WorkerClock.tsx`). Verificar que expone lo necesario para el flujo de limpieza.

#### Verificar que el hook devuelve

```ts
{
  position: { latitude: number; longitude: number; accuracy: number } | null;
  error: string | null;
  loading: boolean;
  requestPosition: () => Promise<GeoLocation | null>; // pide posición bajo demanda
  isSupported: boolean;
}
```

Si falta `requestPosition()` (obtención bajo demanda en lugar de watch continuo), añadirlo. El fichaje de ejecución necesita capturar la posición en el momento exacto del click, no un watch continuo.

#### Criterios de aceptación
- [x] `requestPosition()` disponible y devuelve una promesa con la posición actual
- [x] Funciona en mobile (Capacitor) y web
- [x] Retorna `null` sin error si el usuario deniega permiso (geo es opcional)
- [x] `isMobileDevice()` sigue funcionando correctamente

---

### FE-06 — Upload de fotos: servicio de almacenamiento

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** FE-01

#### Contexto
Los campos `photosBefore` y `photosAfter` ya existen en el modelo, pero no hay mecanismo para subir y almacenar fotos. Necesitamos un flujo completo: captura → upload → URL → persistir en el servicio.

#### Backend: endpoint de upload

Añadir en `cleaningController.js` (o un controller dedicado):

```
POST /api/cleaning/services/:userId/:serviceId/upload
Content-Type: multipart/form-data
Body: { file, phase: 'before' | 'after' }
Response: { ok: true, url: string }
```

Opciones de almacenamiento (elegir según infraestructura):
- **CouchDB attachment** — adjuntar la imagen al documento del servicio (sencillo, límite de tamaño)
- **Filesystem local** — guardar en `/public/uploads/cleaning/` y servir estáticamente
- **S3/compatible** — si ya hay bucket configurado

Para primera iteración, usar **CouchDB attachment** (el proyecto ya usa CouchDB para todo).

#### Frontend: componente `PhotoCapture`

Crear componente reutilizable que:
1. Usa `@capacitor/camera` en mobile
2. Usa `<input type="file" accept="image/*" capture="environment">` en web
3. Muestra preview y permite eliminar antes de guardar
4. Llama a `uploadServicePhoto()` al confirmar

#### Criterios de aceptación
- [x] El trabajador puede capturar fotos desde móvil (cámara) o web (galería)
- [x] Las fotos se almacenan y la URL se persiste en `execution.photosBefore` o `execution.photosAfter`
- [x] Preview inmediato tras captura
- [x] Se puede eliminar una foto antes de guardar
- [x] Límite de tamaño: 5MB por foto, máximo 10 fotos por fase

---

### FE-07 — Página: Vista del Trabajador — Fichaje y Ejecución

**Tipo:** Frontend (página principal)
**Prioridad:** Crítica
**Dependencias:** FE-04, FE-05, FE-06

#### Contexto
Esta es la vista que usa el trabajador para fichar, ejecutar, reportar y cerrar su servicio. Debe ser mobile-first ya que el trabajador estará en terreno. Se integra con `WorkerTpvCleaning.tsx` existente o lo reemplaza.

#### Ruta: `/saas/cleaning-execution`
#### Componente: `CleaningExecution.tsx`

#### Estructura de la página (mobile-first)

```
┌─────────────────────────────────────────────┐
│ ◀ Fichaje del Servicio          [Hoy 14 abr]│
├─────────────────────────────────────────────┤
│                                             │
│  [Servicio actual / Selector]               │
│  ┌────────────────────────────────────────┐ │
│  │ SVC-A8F2K1 · Oficinas Meridiana       │ │
│  │ 📍 C/ Aragón 234, Barcelona           │ │
│  │ 🕐 09:00–12:00 (3h previstas)         │ │
│  │ 🏷️ Oficinas · Limpieza general       │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ── Estado de ejecución ──                  │
│  ┌────────────────────────────────────────┐ │
│  │  ⏱ Timer en vivo: 01:23:45            │ │
│  │  Entrada: 09:02  │  Salida: --:--     │ │
│  │  Previsto: 3h 00m │  Real: 1h 23m     │ │
│  │                                       │ │
│  │  [████████░░░░░░] 46% del tiempo      │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ── Acciones ──                             │
│  ┌──────────┐  ┌──────────┐                │
│  │ 📸 Fotos │  │ 📝 Notas │                │
│  │  antes   │  │          │                │
│  └──────────┘  └──────────┘                │
│  ┌──────────┐  ┌──────────┐                │
│  │ ⚠️ Inci- │  │ ⏸ Pausar │                │
│  │  dencia  │  │          │                │
│  └──────────┘  └──────────┘                │
│                                             │
│  ── Checklist ──                            │
│  ☑ Aspirar moqueta                         │
│  ☑ Limpiar escritorios                     │
│  ☐ Limpiar baños                           │
│  ☐ Vaciar papeleras                        │
│  ☐ Limpiar cristales interiores            │
│  ☐ Desinfectar pomos                       │
│  3/6 completadas                           │
│                                             │
│  ── Fotos después ──                       │
│  [📷 +] [img1] [img2]                     │
│                                             │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐│
│  │  🔴 REGISTRAR SALIDA                   ││
│  │     + observaciones opcionales          ││
│  └─────────────────────────────────────────┘│
│  (o)                                        │
│  ┌─────────────────────────────────────────┐│
│  │  🟢 FICHAR ENTRADA                     ││
│  │     📍 Ubicación: capturando...         ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

#### Estados de la página

| Estado | Qué se muestra | Botón principal |
|---|---|---|
| `not_started` | Info del servicio, lista de servicios del día | **Fichar Entrada** (verde) |
| `checked_in` | Timer activo, acciones, checklist | **Registrar Salida** (rojo) |
| `in_progress` | Timer activo, acciones, checklist | **Registrar Salida** (rojo) |
| `paused` | Timer pausado, razón de pausa | **Reanudar** (azul) |
| `completed` | Resumen, horas previsto vs real, fotos | Texto "Servicio completado ✓" |
| `validated` | Resumen + badge de validación | Texto "Validado por [gerente]" |

#### Flujo del trabajador

```
1. Abre la página → ve servicios asignados para hoy
2. Selecciona servicio → ve detalle con botón "Fichar entrada"
3. Pulsa "Fichar entrada" → captura geolocalización (opcional) → arranca timer
4. Durante el servicio:
   - Marca tareas del checklist
   - Puede hacer fotos (antes/después)
   - Puede escribir observaciones
   - Puede reportar incidencia
   - Puede pausar/reanudar
5. Pulsa "Registrar salida" → captura geo → calcula horas reales → muestra resumen
6. El servicio queda como "completed" pendiente de validación del gerente
```

#### UX / Diseño

- **Mobile-first**: botones grandes, touch-friendly, mínimo scroll
- **Timer prominente**: números grandes, animación de pulso cuando activo
- **Color coding**: verde (on track), amarillo (cerca del límite), rojo (excede tiempo)
- **Barra de progreso dual**: tiempo transcurrido + tareas completadas
- **Feedback háptico** (Capacitor) en check-in/check-out
- **Modo offline-ready**: guardar estado localmente si pierde conexión (futura iteración)
- **Dark mode** compatible (seguir patrón existente con `dark:` classes)

#### Criterios de aceptación
- [x] Trabajador ve solo sus servicios asignados para hoy
- [x] Puede fichar entrada con geolocalización opcional
- [x] Timer en vivo muestra horas:minutos:segundos
- [x] Puede marcar tareas del checklist durante el servicio
- [x] Puede capturar fotos antes y después
- [x] Puede escribir observaciones
- [x] Puede reportar incidencia con tipo, severidad y descripción
- [x] Puede pausar/reanudar el servicio
- [x] Al fichar salida, calcula y muestra horas reales vs previstas
- [x] Estado del servicio se actualiza automáticamente
- [x] Funciona en móvil y desktop
- [x] Dark mode compatible

---

### FE-08 — Página: Vista del Gerente — Validación de Ejecuciones

**Tipo:** Frontend (página)
**Prioridad:** Crítica
**Dependencias:** FE-04

#### Contexto
El gerente necesita ver la ejecución completa de todos los servicios, validar que se realizaron correctamente, revisar incidencias y aprobar el cierre.

#### Ruta: `/saas/cleaning-execution` (misma ruta, diferente vista según rol)
#### Lógica: si `isAdmin || role === 'Gerente'` → vista gerente; si no → vista trabajador.

#### Estructura de la página (gerente)

```
┌───────────────────────────────────────────────────────────┐
│ Fichaje y Ejecución                              [Hoy ▾] │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ── KPIs del día ──                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Servicios│ │ En curso │ │Completad.│ │ Con      │   │
│  │ hoy: 12  │ │    3     │ │    7     │ │ inciden. │   │
│  │          │ │  🔵      │ │  🟢     │ │   2  🟡  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Horas    │ │ Horas    │ │Desviación│ │ Sin      │   │
│  │previstas │ │ reales   │ │  +1h 30m │ │ fichar   │   │
│  │  36h     │ │  37h 30m │ │  🔴      │ │   2  ⚠️  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                           │
│  ── Tabs ──                                              │
│  [En curso] [Pendientes validar] [Incidencias] [Todos]  │
│                                                           │
│  ── Lista de servicios ──                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ SVC-A8F2K1 · Oficinas Meridiana                    │ │
│  │ 👤 Ana López · 🕐 09:02–12:15 (3h 13m / 3h prev.) │ │
│  │ 📍 C/ Aragón 234 · ✅ 6/6 tareas                   │ │
│  │ Estado: completado │ Desviación: +13 min           │ │
│  │ [Ver detalle] [✓ Validar]                          │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ SVC-K2M9P3 · Comunidad Paseo de Gracia             │ │
│  │ 👤 Carlos Ruiz · 🕐 10:00–en curso (2h 45m / 4h)  │ │
│  │ 📍 Paseo de Gracia 80 · ⚠️ 1 incidencia           │ │
│  │ Estado: en curso │ ⏱ Timer: 02:45:12               │ │
│  │ [Ver detalle]                                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ── Alertas activas ──                                   │
│  🔴 Pedro García no ha fichado entrada (prev. 08:00)    │
│  🟡 Carlos Ruiz lleva +45 min sobre lo previsto         │
│  ⚠️ SVC-K2M9P3: incidencia "Acceso denegado" sin resol.│
│                                                           │
└───────────────────────────────────────────────────────────┘
```

#### Modal de detalle (gerente)

Al hacer click en un servicio:

```
┌─────────────────────────────────────────┐
│ SVC-A8F2K1 · Oficinas Meridiana    [X] │
├─────────────────────────────────────────┤
│ Trabajador: Ana López                   │
│ Dirección: C/ Aragón 234, Barcelona     │
│                                         │
│ ── Tiempos ──                           │
│ Previsto: 09:00 – 12:00 (3h)           │
│ Real:     09:02 – 12:15 (3h 13m)       │
│ Desviación: +13 min                     │
│ [═══════════════════░] +7%              │
│                                         │
│ ── Ubicación ──                         │
│ Check-in:  41.3928, 2.1647 ✅ (5m)     │
│ Check-out: 41.3930, 2.1645 ✅ (3m)     │
│                                         │
│ ── Checklist ──                         │
│ ☑ Aspirar moqueta                      │
│ ☑ Limpiar escritorios                  │
│ ☑ Limpiar baños                        │
│ ☑ Vaciar papeleras                     │
│ ☑ Limpiar cristales interiores         │
│ ☑ Desinfectar pomos                    │
│ 6/6 completadas ✅                     │
│                                         │
│ ── Fotos antes ──                      │
│ [img1] [img2]                          │
│ ── Fotos después ──                    │
│ [img1] [img2] [img3]                   │
│                                         │
│ ── Observaciones trabajador ──         │
│ "Sin novedad. Oficina estaba vacía."   │
│                                         │
│ ── Incidencias ──                      │
│ (ninguna)                              │
│                                         │
│ ── Validación ──                       │
│ [Notas del gerente:_______________]    │
│ [✓ Validar ejecución]  [✗ Rechazar]   │
└─────────────────────────────────────────┘
```

#### Criterios de aceptación
- [x] Gerente ve todos los servicios del día con estado de ejecución
- [x] KPIs: total, en curso, completados, con incidencias, horas previstas/reales, desviación, sin fichar
- [x] Tabs para filtrar: en curso, pendientes de validar, incidencias, todos
- [x] Modal de detalle muestra toda la ejecución: tiempos, geo, checklist, fotos, notas, incidencias
- [x] Puede validar o rechazar un servicio completado
- [x] Puede resolver incidencias desde el detalle
- [x] Lista de alertas activas visible
- [x] Filtro por fecha (hoy, rango)
- [x] Buscador por trabajador, servicio, dirección

---

### FE-09 — Sistema de alertas de ejecución

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** FE-03

#### Contexto
El gerente necesita alertas automáticas para detectar anomalías en la ejecución de servicios. Las alertas se generan al consultar el resumen de ejecuciones y se muestran en la vista de gerente.

#### Tipos de alerta

| Código | Tipo | Descripción | Severidad | Lógica |
|---|---|---|---|---|
| `NO_CHECKIN` | No fichado | Trabajador no ha fichado entrada y ya pasó la hora prevista | Alta | `now > service.time + 15min && execution.status === 'not_started'` |
| `INCOMPLETE_SERVICE` | Servicio incompleto | Fichó salida pero no completó todas las tareas del checklist | Media | `execution.status === 'completed' && tasks.some(t => !t.done)` |
| `LATE_START` | Retraso | Fichó entrada con más de 15 minutos de retraso | Media | `checkInAt > service.time + 15min` |
| `CHECKOUT_NO_CHECKIN` | Salida sin entrada | Intento de check-out sin check-in previo | Crítica | `execution.checkInAt === '' && intento de check-out` |
| `OVERTIME` | Exceso de tiempo | Tiempo real supera el previsto en más de 30 minutos | Media | `realMinutes > plannedMinutes + 30` |
| `UNRESOLVED_INCIDENT` | Incidencia abierta | Servicio completado con incidencias sin resolver | Alta | `execution.status === 'completed' && incidents.some(i => !i.resolvedAt)` |
| `NO_PHOTOS` | Sin evidencia | Servicio completado sin fotos (si la política lo requiere) | Baja | `execution.status === 'completed' && photosBefore.length === 0 && photosAfter.length === 0` |

#### Backend: generar alertas

Añadir función `generateExecutionAlerts(services)` en `cleaningController.js`:

```js
function generateExecutionAlerts(services, now = new Date()) {
  const alerts = [];
  for (const svc of services) {
    const exec = svc.execution || {};
    const scheduledStart = svc.date && svc.time
      ? new Date(`${svc.date}T${svc.time}:00`).getTime()
      : null;

    // NO_CHECKIN
    if (scheduledStart && now.getTime() > scheduledStart + 15 * 60000
        && exec.status === 'not_started') {
      alerts.push({
        type: 'NO_CHECKIN', severity: 'high',
        serviceId: svc._id, serviceNumber: svc.serviceNumber,
        workerName: svc.assignedToName,
        message: `${svc.assignedToName} no ha fichado entrada (previsto ${svc.time})`,
      });
    }
    // ... resto de alertas
  }
  return alerts;
}
```

Incluir alertas en la respuesta de `execution-summary`.

#### Frontend: componente `ExecutionAlerts`

- Panel colapsable en la vista de gerente
- Iconos por severidad: 🔴 alta/crítica, 🟡 media, ⚪ baja
- Click en alerta → navega al detalle del servicio
- Badge con contador en la tab de alertas

#### Criterios de aceptación
- [x] Se generan los 7 tipos de alerta definidos
- [x] Las alertas se devuelven en `execution-summary`
- [x] La vista de gerente muestra las alertas con color y acción
- [x] Se puede hacer click para ir al servicio afectado
- [x] Las alertas se recalculan al refrescar

---

### FE-10 — Comparación visual: Horas previstas vs reales

**Tipo:** Frontend (componente)
**Prioridad:** Alta
**Dependencias:** FE-04

#### Contexto
Tanto el trabajador (al terminar) como el gerente necesitan ver una comparación clara entre lo contratado y lo ejecutado.

#### Componente: `TimeComparison`

```tsx
interface TimeComparisonProps {
  plannedMinutes: number;
  realMinutes: number;
  checkInAt: string;
  checkOutAt: string;
  scheduledStart: string;  // HH:mm
  scheduledEnd: string;    // HH:mm
  pauseMinutes?: number;
  compact?: boolean; // para cards
}
```

#### Diseño visual

**Modo completo (detalle):**
```
┌────────────────────────────────────────┐
│ Previsto    09:00 ──────────── 12:00   │
│             ████████████████████████   │
│                    3h 00min            │
│                                        │
│ Real        09:02 ─────────── 12:15    │
│             █████████████████████████▓ │
│                  3h 13min (+13min)     │
│                                        │
│ Desviación                    +7.2%    │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓        │
│ ✅ Dentro de margen aceptable          │
└────────────────────────────────────────┘
```

**Modo compacto (card):**
```
🕐 3h 13m / 3h prev. (+13m · +7%)
[═══════════════════░] verde/amarillo/rojo
```

#### Color coding

| Desviación | Color | Icono |
|---|---|---|
| ≤ 0% (terminó antes o a tiempo) | Verde (`emerald-500`) | ✅ |
| 1–15% | Amarillo (`amber-500`) | ⚠️ |
| > 15% | Rojo (`red-500`) | 🔴 |

#### Criterios de aceptación
- [x] Componente reutilizable con modo compacto y completo
- [x] Barras de progreso visuales con colores por desviación
- [x] Muestra entrada/salida prevista y real
- [x] Muestra desviación en minutos y porcentaje
- [x] Dark mode compatible

---

### FE-11 — Conexión: Alimentar productividad y coste real

**Tipo:** Backend
**Prioridad:** Media
**Dependencias:** FE-03

#### Contexto
`clockinsController.js` → `getPerformance()` cruza fichajes con ventas. Necesitamos un equivalente para limpieza que cruce servicios ejecutados con horas reales, precio del servicio y coste del trabajador.

#### Nuevo endpoint

```
GET /api/cleaning/services/:userId/productivity
Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
```

#### Respuesta

```json
{
  "ok": true,
  "productivity": {
    "summary": {
      "totalServices": 45,
      "completedServices": 42,
      "totalPlannedHours": 135,
      "totalRealHours": 141.5,
      "totalRevenue": 8750,
      "avgRevenuePerHour": 61.84,
      "avgDeviationPercent": 4.8,
      "incidentRate": 6.7
    },
    "byWorker": [
      {
        "memberId": "...",
        "memberName": "Ana López",
        "services": 15,
        "plannedHours": 45,
        "realHours": 43.5,
        "revenue": 2900,
        "revenuePerHour": 66.67,
        "completionRate": 100,
        "avgDeviation": -3.3,
        "incidents": 0
      }
    ],
    "byDate": [...],
    "byCleaningType": [...]
  }
}
```

#### Criterios de aceptación
- [x] El endpoint calcula productividad cruzando `execution.realMinutes` con `price`
- [x] Agrupa por trabajador, fecha y tipo de limpieza
- [x] Solo accesible para Admin/Gerente
- [x] Los datos alimentan el Dashboard general

---

### FE-12 — Registro en ruta y navegación en el Sidebar

**Tipo:** Frontend (routing + sidebar)
**Prioridad:** Crítica
**Dependencias:** FE-07, FE-08

#### Contexto
La nueva página necesita registrarse en el sistema de rutas (`routes.tsx`) y aparecer en el sidebar dentro del grupo de Limpieza.

#### Cambios en `routes.tsx`

```tsx
import { CleaningExecution } from './pages/saas/CleaningExecution';

// Dentro del array de rutas saas:
{ path: 'cleaning-execution', Component: CleaningExecution },
```

#### Cambios en `Sidebar.tsx`

1. Añadir item en el array de `sidebarItems`:
```tsx
{ id: 'cleaning-execution', navKey: 'cleaningExecution', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/cleaning-execution' },
```

2. Añadir a `itemIds` del grupo `cleaning`:
```tsx
{ id: 'cleaning', icon: <Droplets className="w-4 h-4 shrink-0" />, itemIds: ['cleaning-services', 'cleaning-execution', 'cleaning-checklist', 'cleaning-quality', 'cleaning-reviews'] },
```

3. Añadir detección de ruta activa:
```tsx
(item.id === 'cleaning-execution' && location.pathname.startsWith('/saas/cleaning-execution'))
```

#### Criterios de aceptación
- [x] La ruta `/saas/cleaning-execution` renderiza el componente correcto
- [x] Aparece en el sidebar bajo el grupo "Limpieza"
- [x] Se marca como activa al navegar
- [x] El orden en el sidebar es: Servicios → **Fichaje y Ejecución** → Checklist → Calidad → Reseñas

---

### FE-13 — Conexiones con módulos existentes

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** FE-07, FE-08

#### Contexto
La página de fichaje y ejecución debe conectarse con el ecosistema existente:
- **Fichajes Core** (`Clockins.tsx`): al fichar entrada/salida en un servicio, opcionalmente crear un clockin vinculado
- **Dashboard** (`GeneralDashboard.tsx`): mostrar KPIs de ejecución del día
- **Informes**: datos de ejecución disponibles para exportación/reporting
- **Trabajadores** (`Team.tsx`): ver historial de ejecuciones del miembro
- **Incidencias**: las incidencias de ejecución deben ser visibles desde el panel de alertas

#### Sub-tareas

**A) Vincular con Fichajes Core (opcional)**
Al hacer check-in en un servicio, crear un `ClockinRecord` en `*-clockins` con referencia al servicio:
```js
{
  ...clockinRecord,
  cleaning_service_id: serviceId,  // campo nuevo
  cleaning_service_number: serviceNumber,
}
```
Esto permite que las estadísticas de fichaje incluyan los servicios de limpieza.

**B) KPIs en Dashboard**
Añadir un widget en `GeneralDashboard.tsx` (si la vertical es `cleaning`):
```
Servicios hoy: 12 | Completados: 7 | Pendientes: 3 | Con alerta: 2
```

**C) Historial en perfil del trabajador**
En `TeamMemberDetail.tsx`, añadir tab "Ejecuciones" que muestre los servicios ejecutados por ese miembro.

**D) Alertas en panel global**
Las alertas de ejecución (`NO_CHECKIN`, `OVERTIME`, etc.) deben poder aparecer en `CrmAlertsPanel.tsx` si está configurado.

#### Criterios de aceptación
- [x] Al fichar entrada en servicio, se crea clockin vinculado (configurable)
- [x] Dashboard muestra widget de ejecuciones del día para vertical limpieza
- [x] Perfil del trabajador muestra historial de ejecuciones
- [x] Las alertas de ejecución aparecen en el panel de alertas global

---

### FE-14 — Tests y QA

**Tipo:** Testing
**Prioridad:** Alta
**Dependencias:** Todos los anteriores

#### Tests unitarios (Vitest)

| Test | Archivo |
|---|---|
| `buildCleaningServiceDocument` genera `execution` correctamente | `tests/cleaningModel.test.js` |
| `generateExecutionAlerts` genera alertas correctas | `tests/cleaningAlerts.test.js` |
| Cálculo de `realMinutes` con pausas | `tests/cleaningExecution.test.js` |
| `deviationMinutes` correcto para over/under | `tests/cleaningExecution.test.js` |
| `TimeComparison` renderiza colores correctos | `tests/TimeComparison.test.tsx` |

#### Tests de integración

| Escenario | Pasos |
|---|---|
| Flujo completo trabajador | Seleccionar servicio → Check-in → Marcar tareas → Foto → Check-out → Verificar horas |
| Check-out sin check-in | Intentar check-out → Error 400 |
| Gerente valida servicio | Login gerente → Ver ejecuciones → Validar → Status cambia a `validated` |
| Alerta de retraso | Servicio con hora 09:00, check-in a 09:20 → Alerta `LATE_START` |
| Incidencia + resolución | Trabajador reporta → Gerente resuelve → Incidencia marcada como resuelta |

#### Criterios de aceptación
- [x] Cobertura mínima: cálculos de tiempo, generación de alertas, validaciones
- [x] Tests pasan en CI

---

## Orden de implementación recomendado

```
Fase 1 — Fundamentos (modelo + API)
├── FE-01  Modelo de datos (execution)
├── FE-02  Modelo de incidencias
├── FE-03  Endpoints de ejecución
├── FE-04  API Client frontend
└── FE-05  Hook geolocalización

Fase 2 — Infraestructura
├── FE-06  Upload de fotos
└── FE-10  Componente TimeComparison

Fase 3 — Páginas principales
├── FE-07  Vista trabajador
├── FE-08  Vista gerente
├── FE-09  Sistema de alertas
└── FE-12  Routing + Sidebar

Fase 4 — Conexiones y polish
├── FE-11  Productividad / coste real
├── FE-13  Conexiones con módulos existentes
└── FE-14  Tests y QA
```

---

## Notas de diseño

- **Paleta**: seguir los tokens de `DesignTokens.ts`. Acento cyan (`cyan-500/600`) para limpieza, consistente con `CleaningServices.tsx`
- **Tipografía**: seguir `TYPOGRAPHY.md`
- **Componentes**: usar Radix UI + Tailwind, consistente con el design system existente
- **Iconos**: Lucide React (ya importado en todo el proyecto)
- **Toasts**: Sonner (`toast.success/error`)
- **Formularios**: react-hook-form + zod para validación (ya en dependencias)
- **Gráficos**: Recharts para comparaciones visuales (ya en dependencias)
- **Mobile**: Capacitor para cámara (`@capacitor/camera` ya instalado) y geolocalización
- **i18n**: usar `useTranslation` como en `Clockins.tsx` (ya configurado)
