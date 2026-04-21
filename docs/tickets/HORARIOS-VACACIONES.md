# HORARIOS Y VACACIONES — Plan de Tickets

**Página:** `/saas/equipo/horarios-vacaciones`
**Objetivo:** Planificar disponibilidad del equipo desde una vista unificada.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Horarios semanales por miembro | Completo | `Schedules.tsx`, `schedulesApi.ts` — DB `*-schedules` |
| Plantillas de turno (ShiftTemplate) | Completo | `schedulesApi.ts` — CRUD con color, nombre, weekly |
| Reglas de auto-asignación | Completo | `schedulesApi.ts` — por rol/departamento/puesto |
| Asignación masiva de plantilla | Completo | `Schedules.tsx` — modal bulk assign |
| Comparación horario vs fichaje | Completo | `Schedules.tsx` tab "comparison" |
| Solicitudes de vacaciones (CRUD) | Completo | `Vacations.tsx`, `vacationsApi.ts` — DB `*-vacations` |
| Workflow aprobación/rechazo | Completo | `vacationsApi.ts` — reviewVacation() |
| Balance de vacaciones por equipo | Completo | `Vacations.tsx` tab "balance" |
| Tipos de ausencia (vacation, personal, sick, other) | Completo | `vacationsApi.ts` — LeaveType |
| Configuración días/año (global e individual) | Completo | `vacationsApi.ts` — VacationSettings |
| Fichajes con schedule vinculado | Completo | `clockinsApi.ts` — lee scheduled_start/end del horario |
| Horario comercial de negocio | Completo | `settingsController.js` — business-hours con holidays[] |
| Filtro por centro de trabajo | Completo | `Schedules.tsx` — useWorkCenters |
| Navegación por semana | Completo | `Schedules.tsx` — weekOffset, prev/next |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Festivos de empresa integrados con horarios de empleado | No existe como entidad propia para empleados |
| Bloqueos de disponibilidad (libre configuración) | No existe |
| Vacaciones bloquean automáticamente asignaciones de horario | No implementado |
| Cruce vacaciones + fichajes (alertar si fichó en vacaciones) | No implementado |
| Cruce horarios + rutas (si vertical lo requiere) | No implementado |
| Detección de solapamientos (vacaciones entre miembros) | No implementado |
| Alerta: turno sin cubrir | No implementado |
| Alerta: vacaciones solapadas entre miembros | No implementado |
| Alerta: miembro sin horario definido | No implementado |
| Página unificada `/saas/equipo/horarios-vacaciones` | No existe |
| Conexión bidireccional Dashboard ↔ Horarios/Vacaciones | No implementado |
| Conexión Verticales (turnos específicos por tipo de negocio) | No implementado |

---

## Tickets

---

### HV-01 — Modelo de datos: Festivos de empresa (empleado)

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto
Los festivos actualmente solo existen en `settingsController.js` como parte del horario comercial del negocio (`business-hours.holidays[]`). Son festivos de apertura/cierre del local, NO festivos laborales del empleado. Necesitamos una entidad separada para festivos laborales que afecten a los horarios y la disponibilidad del equipo.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-schedules`**

```typescript
export interface CompanyHoliday {
  _id: string;            // company_holiday:{business_id}:{timestamp}
  _rev?: string;
  type: 'company_holiday';
  business_id: string;
  date: string;           // YYYY-MM-DD
  name: string;           // "Navidad", "Día de la Constitución"
  recurring: boolean;     // true = se repite cada año (solo MM-DD importa)
  scope: 'all' | 'work_center' | 'department';
  scope_value?: string;   // ID del centro o nombre del departamento (si scope != 'all')
  halfDay: boolean;       // true = solo media jornada festiva
  halfDayPeriod?: 'morning' | 'afternoon';
  createdAt: string;
  updatedAt: string;
}
```

**2. Crear `src/app/lib/companyHolidaysApi.ts`**

| Función | Descripción |
|---|---|
| `listCompanyHolidays(businessId, year?)` | Listar festivos de la empresa, incluyendo recurrentes |
| `saveCompanyHoliday(businessId, data, existing?)` | Crear/editar festivo |
| `deleteCompanyHoliday(holiday)` | Eliminar festivo |
| `isHoliday(date, businessId, holidays[])` | Helper: comprobar si una fecha es festiva |
| `getHolidaysInRange(start, end, holidays[])` | Helper: festivos en un rango de fechas |
| `PRESET_HOLIDAYS_ES` | Constante: festivos nacionales de España precargados |

**3. Presets de festivos nacionales**
Incluir un preset de festivos nacionales de España (1 enero, 6 enero, Viernes Santo, 1 mayo, 15 agosto, 12 octubre, 1 noviembre, 6 diciembre, 8 diciembre, 25 diciembre) como datos iniciales que el admin pueda importar con un click.

#### Criterios de aceptación
- [ ] Documento `company_holiday` se persiste en la DB `*-schedules`
- [ ] CRUD completo desde API client
- [ ] Helper `isHoliday()` devuelve true/false correctamente con festivos recurrentes
- [ ] Soporte para scope por centro de trabajo o departamento
- [ ] Preset de festivos nacionales españoles disponible para importar

---

### HV-02 — Modelo de datos: Bloqueos de disponibilidad

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto
No existe ningún mecanismo para bloquear la disponibilidad de un miembro fuera de las vacaciones formales. Ejemplos: formación externa, visita médica puntual, guardia en otro centro, permiso sin solicitud formal, reserva de disponibilidad para proyecto especial.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-schedules`**

```typescript
export type BlockReason =
  | 'training'       // Formación
  | 'medical'        // Médico
  | 'personal'       // Personal
  | 'guard'          // Guardia en otro centro
  | 'project'        // Reservado para proyecto
  | 'maternity'      // Maternidad/paternidad
  | 'union'          // Actividad sindical
  | 'other';         // Otro

export interface AvailabilityBlock {
  _id: string;            // block:{business_id}:{member_id}:{timestamp}
  _rev?: string;
  type: 'availability_block';
  business_id: string;
  member_id: string;
  member_name: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  startTime?: string;     // HH:MM — si es bloqueo parcial (ej: solo mañana)
  endTime?: string;       // HH:MM
  allDay: boolean;        // true = bloqueo de jornada completa
  reason: BlockReason;
  notes: string;
  recurring: boolean;     // true = se repite semanalmente
  recurringDays?: Weekday[]; // Si recurring, qué días de la semana
  createdBy: string;      // user_id de quien creó el bloqueo
  createdAt: string;
  updatedAt: string;
}
```

**2. Crear `src/app/lib/availabilityBlocksApi.ts`**

| Función | Descripción |
|---|---|
| `listBlocks(businessId, filters?)` | Listar bloqueos (por miembro, rango de fechas, razón) |
| `saveBlock(businessId, data, existing?)` | Crear/editar bloqueo |
| `deleteBlock(block)` | Eliminar bloqueo |
| `getMemberBlocksForDate(blocks[], memberId, date)` | Helper: bloqueos activos para un miembro en una fecha |
| `isMemberBlocked(blocks[], memberId, date, time?)` | Helper: check rápido de disponibilidad |

**3. Labels multiidioma**

```typescript
export const BLOCK_REASON_LABELS: Record<string, Record<BlockReason, string>> = {
  es: {
    training: 'Formación', medical: 'Médico', personal: 'Personal',
    guard: 'Guardia', project: 'Proyecto', maternity: 'Maternidad/Paternidad',
    union: 'Sindical', other: 'Otro',
  },
  en: { ... },
};
```

#### Criterios de aceptación
- [ ] Documento `availability_block` se persiste en la DB `*-schedules`
- [ ] Soporta bloqueos de jornada completa y parciales (franjas horarias)
- [ ] Soporta bloqueos recurrentes semanales
- [ ] Helper `isMemberBlocked()` funciona para comprobaciones rápidas
- [ ] CRUD completo desde API client
- [ ] Labels en es/en/pt/fr

---

### HV-03 — Motor de validación: Detección de solapamientos

**Tipo:** Servicio compartido (API Client)
**Prioridad:** Alta
**Dependencias:** HV-01, HV-02

#### Contexto
Actualmente no existe ninguna validación cruzada entre horarios, vacaciones, festivos y bloqueos. Un admin puede asignar un turno a alguien que está de vacaciones, o aprobar vacaciones solapadas entre miembros del mismo departamento sin recibir aviso.

#### Qué hacer

**1. Crear `src/app/lib/overlapDetector.ts`**

Servicio puro (sin dependencias de React) que recibe datos y devuelve conflictos:

```typescript
export type ConflictType =
  | 'vacation_vs_schedule'      // Vacación aprobada solapa con horario asignado
  | 'vacation_vs_vacation'      // Dos miembros con vacaciones solapadas
  | 'block_vs_schedule'         // Bloqueo solapa con horario asignado
  | 'holiday_vs_schedule'       // Festivo pero hay turno asignado
  | 'vacation_vs_clockin'       // Fichó estando de vacaciones
  | 'block_vs_clockin'          // Fichó estando bloqueado
  | 'schedule_overlap'          // Mismo miembro con dos horarios solapados
  | 'shift_uncovered';          // Turno que nadie cubre

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  memberId: string;
  memberName: string;
  date: string;
  description: string;          // Texto legible para la UI
  relatedMemberId?: string;     // Para vacaciones solapadas entre miembros
  relatedMemberName?: string;
  meta: Record<string, any>;    // Datos extra para debugging o detalle
}
```

**2. Funciones del detector**

| Función | Entrada | Salida |
|---|---|---|
| `detectVacationVsSchedule(vacations, schedules, dateRange)` | Vacaciones aprobadas + horarios | Conflictos donde hay turno asignado en días de vacación |
| `detectVacationOverlaps(vacations, members, options?)` | Vacaciones aprobadas/pendientes | Pares de miembros con vacaciones solapadas (con filtro opcional por departamento/centro) |
| `detectBlockVsSchedule(blocks, schedules, dateRange)` | Bloqueos + horarios | Conflictos donde hay turno en bloqueo |
| `detectHolidayVsSchedule(holidays, schedules, dateRange)` | Festivos + horarios | Turnos asignados en días festivos |
| `detectVacationVsClockin(vacations, clockins)` | Vacaciones aprobadas + fichajes | Fichajes realizados durante período de vacaciones |
| `detectUncoveredShifts(schedules, members, date)` | Horarios + miembros activos | Turnos que deberían estar cubiertos pero no lo están |
| `detectAllConflicts(data)` | Todos los datos | Ejecución completa de todos los detectores |

**3. Opciones de configuración**

```typescript
export interface DetectorOptions {
  dateRange: { start: string; end: string };
  departmentFilter?: string;
  workCenterFilter?: string;
  minOverlapDays?: number;        // Mínimo días de solapamiento para alertar (default: 1)
  maxVacationOverlapPercent?: number; // % máximo de equipo de vacaciones simultáneas (default: 30%)
}
```

#### Criterios de aceptación
- [ ] Detecta los 7 tipos de conflicto definidos
- [ ] Cada conflicto incluye severity, descripción legible y datos del miembro
- [ ] `detectAllConflicts()` ejecuta todos los detectores en una sola llamada
- [ ] Configurable por departamento/centro de trabajo
- [ ] Sin dependencias de React (servicio puro)
- [ ] Funciones unitariamente testables (reciben datos, devuelven conflictos)

---

### HV-04 — Automatización: Vacaciones bloquean asignaciones

**Tipo:** Lógica de negocio (API Client + UI)
**Prioridad:** Alta
**Dependencias:** HV-03

#### Contexto
Cuando se aprueba una solicitud de vacaciones, nada impide que un manager asigne un turno a ese miembro durante sus vacaciones. La automatización debe actuar en dos puntos: prevención (al asignar horario, avisar del conflicto) y reacción (al aprobar vacaciones, desactivar los turnos afectados).

#### Qué hacer

**1. Hook en `reviewVacation()` — Post-aprobación**

Modificar `vacationsApi.ts` para que al aprobar una vacación:
- Buscar horarios (`schedules`) del miembro que solapan con el rango de la vacación
- Para cada día de vacación, desactivar el turno (`enabled: false`) en el `weekly` del schedule correspondiente
- Registrar un log/nota en la solicitud: "Turnos desactivados automáticamente: Lun 21/4, Mar 22/4..."

**2. Validación preventiva en `saveSchedule()`**

Modificar `schedulesApi.ts` para que al guardar un horario:
- Consultar vacaciones aprobadas del miembro en la semana
- Consultar bloqueos de disponibilidad del miembro en la semana
- Consultar festivos de la empresa en la semana
- Si hay conflicto:
  - Retornar un `warnings[]` junto con el schedule guardado
  - NO bloquear el guardado (el admin decide), pero mostrar advertencia clara

**3. Validación en asignación masiva**

Modificar `applyTemplateToMembers()` y `autoAssignByRules()`:
- Antes de asignar, comprobar conflictos para cada miembro
- Retornar resumen: `{ applied, skipped, warnings: Conflict[] }`
- En la UI, mostrar qué miembros se saltaron y por qué

**4. Bandera visual en la tabla de horarios**

En la vista de calendario semanal de `Schedules.tsx`:
- Si un día tiene vacación aprobada: mostrar badge "Vacaciones" en vez del turno
- Si un día tiene bloqueo: mostrar badge con el motivo
- Si un día es festivo: fondo diferente + tooltip con el nombre del festivo

#### Criterios de aceptación
- [ ] Al aprobar vacación, los turnos afectados se desactivan automáticamente
- [ ] Al asignar horario, se muestra advertencia si hay vacación/bloqueo/festivo
- [ ] La asignación masiva salta miembros con conflicto y reporta cuáles
- [ ] La tabla semanal muestra indicadores visuales de vacaciones/bloqueos/festivos
- [ ] El admin puede ignorar la advertencia y asignar igualmente (decisión suya)

---

### HV-05 — Automatización: Cruce con fichajes y rutas

**Tipo:** Lógica de negocio (Backend + API Client)
**Prioridad:** Media
**Dependencias:** HV-03

#### Contexto
La comparación horario vs fichaje ya existe en la pestaña "comparison" de `Schedules.tsx`, pero es manual y limitada a un día. Falta: cruce con vacaciones (fichó estando de vacaciones), cruce con bloqueos, y cruce con rutas para verticales que las usen (delivery, taxi, comerciales de ruta).

#### Qué hacer

**1. Ampliar la API de fichajes para incluir estado de disponibilidad**

Añadir endpoint o lógica en `clockinsController.js`:

```
GET /api/clockins/:businessId/cross-check?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Respuesta:
```json
{
  "anomalies": [
    {
      "type": "clockin_during_vacation",
      "member_id": "...",
      "member_name": "...",
      "date": "2026-04-20",
      "detail": "Fichaje a las 09:00 pero tiene vacaciones aprobadas del 18/04 al 25/04"
    },
    {
      "type": "no_clockin_scheduled",
      "member_id": "...",
      "date": "2026-04-20",
      "detail": "Turno 09:00-17:00 asignado pero no fichó"
    },
    {
      "type": "clockin_on_holiday",
      "member_id": "...",
      "date": "2026-05-01",
      "detail": "Fichaje registrado en día festivo (Día del Trabajo)"
    }
  ]
}
```

**2. Integración con rutas (si aplica a la vertical)**

Para verticales con rutas (delivery, taxi, comerciales):
- Leer las asignaciones de ruta del día (`deliveryRouter` / datos de vertical)
- Comprobar si el miembro asignado a una ruta tiene:
  - Vacación aprobada ese día
  - Bloqueo de disponibilidad
  - Sin horario definido
- Generar anomalía `route_assigned_unavailable`

**3. Vista de cruce en la UI**

Crear sub-pestaña "Anomalías" dentro de la página unificada:
- Tabla con anomalías de la semana/mes
- Filtros por tipo, miembro, fecha
- Acción rápida: "Ver fichaje" / "Ver solicitud" / "Asignar horario"

#### Criterios de aceptación
- [ ] Endpoint de cross-check funcional para rango de fechas
- [ ] Detecta: fichaje en vacaciones, turno sin fichaje, fichaje en festivo
- [ ] Si la vertical tiene rutas, detecta asignación de ruta a miembro no disponible
- [ ] Vista UI con tabla de anomalías filtrable
- [ ] Acciones rápidas para navegar al recurso conflictivo

---

### HV-06 — Sistema de alertas: Horarios y Vacaciones

**Tipo:** Backend + UI
**Prioridad:** Alta
**Dependencias:** HV-03

#### Contexto
No existe ningún sistema de alertas proactivas para horarios y vacaciones. El admin solo descubre problemas si va a mirar manualmente.

#### Qué hacer

**1. Definir tipos de alerta**

```typescript
export type ScheduleAlertType =
  | 'shift_uncovered'          // Turno sin cubrir (día/hora sin nadie asignado)
  | 'vacation_overlap'         // Vacaciones solapadas entre miembros del mismo dept/centro
  | 'schedule_undefined'       // Miembro activo sin horario definido para la próxima semana
  | 'vacation_pending_review'  // Solicitud pendiente > 48h sin revisar
  | 'holiday_with_shifts'      // Festivo con turnos asignados
  | 'block_conflict';          // Bloqueo creado que conflicta con horario existente

export interface ScheduleAlert {
  id: string;
  type: ScheduleAlertType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  memberIds: string[];
  date?: string;
  actionLabel: string;      // "Asignar horario", "Revisar solicitud", etc.
  actionRoute: string;      // Ruta para resolver la alerta
  createdAt: string;
  dismissed: boolean;
}
```

**2. Crear `src/app/lib/scheduleAlertsApi.ts`**

| Función | Descripción |
|---|---|
| `generateAlerts(businessId, data)` | Genera alertas en base a los datos actuales (schedules, vacations, blocks, holidays, members) |
| `getUncoveredShifts(schedules, members, weekStart)` | Miembros activos sin turno para la semana indicada |
| `getVacationOverlaps(vacations, members, threshold?)` | Solapamientos de vacaciones con % configurable |
| `getUndefinedSchedules(schedules, members, weekStart)` | Miembros sin horario para la próxima semana |
| `getPendingVacations(vacations, maxHours?)` | Solicitudes pendientes más de X horas (default: 48h) |

**3. Componente de alertas en la UI**

Banner de alertas en la parte superior de la página unificada:

| Alerta | Severity | Ejemplo de texto |
|---|---|---|
| Turno sin cubrir | `critical` | "3 miembros sin turno asignado para la semana del 21/04" |
| Vacaciones solapadas | `warning` | "Juan García y Ana López tienen vacaciones solapadas del 1-5 mayo (Dept. Ventas)" |
| Horario no definido | `warning` | "Pedro Ruiz no tiene horario definido para la próxima semana" |
| Solicitud pendiente | `info` | "2 solicitudes de vacaciones llevan más de 48h sin revisar" |
| Festivo con turnos | `warning` | "Hay 4 turnos asignados el 1 de mayo (Día del Trabajo)" |
| Conflicto de bloqueo | `warning` | "María tiene formación el miércoles pero tiene turno 09:00-17:00" |

**4. Diseño visual del banner**

- Alertas `critical`: borde rojo, icono `AlertTriangle`, fondo `red-50`
- Alertas `warning`: borde amber, icono `AlertCircle`, fondo `amber-50`
- Alertas `info`: borde azul, icono `Info`, fondo `blue-50`
- Cada alerta tiene botón de acción ("Resolver") y botón de dismiss ("Ignorar")
- Contador de alertas activas en la pestaña del sidebar
- Alertas colapsables: mostrar resumen con "Ver 3 más..."

#### Criterios de aceptación
- [ ] Se generan los 6 tipos de alerta definidos
- [ ] Banner visible en la página unificada con diseño correcto por severity
- [ ] Botón de acción lleva al contexto correcto para resolver la alerta
- [ ] Alertas dismissables (se guardan en localStorage para no repetir)
- [ ] Contador de alertas activas en el sidebar junto a "Horarios y Vacaciones"
- [ ] Generación de alertas no bloquea el renderizado (lazy/async)

---

### HV-07 — Página unificada: Horarios y Vacaciones

**Tipo:** Frontend (Página nueva)
**Prioridad:** Crítica
**Dependencias:** HV-01, HV-02, HV-03, HV-06

#### Contexto
Actualmente horarios y vacaciones son páginas separadas (`/saas/schedules` y `/saas/vacations`). El requisito es una página unificada en `/saas/equipo/horarios-vacaciones` que combine toda la funcionalidad con una UX superior.

#### Qué hacer

**1. Crear `src/app/pages/saas/SchedulesVacations.tsx`**

Página con pestañas unificadas:

```
┌─────────────────────────────────────────────────────────────────┐
│  HORARIOS Y VACACIONES                                          │
│  Planifica la disponibilidad de tu equipo                       │
├─────────────────────────────────────────────────────────────────┤
│  [⚠ 3 alertas activas]  ← Banner colapsable (HV-06)           │
├─────────────────────────────────────────────────────────────────┤
│  📊 KPIs rápidos (4 cards)                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │Con horio│ │En vacac.│ │Turnos   │ │Alertas  │             │
│  │  12/15  │ │   2     │ │sin cubri│ │   3     │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
├─────────────────────────────────────────────────────────────────┤
│  Tabs:                                                          │
│  [Calendario] [Vacaciones] [Festivos] [Bloqueos] [Plantillas]  │
│  [Reglas] [Comparación] [Anomalías]                            │
│                                                                  │
│  (contenido de la pestaña activa)                               │
└─────────────────────────────────────────────────────────────────┘
```

**2. Pestaña "Calendario" (pestaña principal)**

Vista semanal mejorada que integra TODA la info del miembro por día:

| Información | Visual |
|---|---|
| Turno asignado | `09:00 - 17:00` (texto principal) |
| En vacaciones | Badge verde "Vacaciones" sustituyendo al turno |
| Bloqueo | Badge naranja "Formación" / "Médico" / etc. |
| Festivo | Fondo especial + nombre del festivo en tooltip |
| Fichaje del día | Punto verde/rojo debajo del turno (fichó / no fichó) |
| Sin horario | Celda vacía con "—" y borde discontinuo |

Controles:
- Navegación semanal (prev/next/hoy) — ya existe
- Filtro por centro de trabajo — ya existe
- Filtro por departamento — NUEVO
- Toggle vista: "Semana" / "Mes" — NUEVO (vista mensual simplificada)

**3. Pestaña "Vacaciones"**

Reutilizar la lógica de `Vacations.tsx` actual pero integrada:
- Sub-pestañas: "Solicitudes" / "Balance" / "Ajustes"
- Si es trabajador (no admin): solo ve sus propias solicitudes y puede solicitar
- Si es admin: ve todo el equipo + pendientes + balance + ajustes

**4. Pestaña "Festivos"**

| Elemento | Descripción |
|---|---|
| Lista de festivos del año | Tabla con fecha, nombre, scope, recurrente |
| Botón "Importar festivos nacionales" | Carga preset España |
| Crear festivo manual | Modal: fecha, nombre, scope, halfDay |
| Mini-calendario anual | Visualización de festivos en un calendario compacto |

**5. Pestaña "Bloqueos"**

| Elemento | Descripción |
|---|---|
| Lista de bloqueos activos/futuros | Tabla: miembro, fechas, motivo, tipo |
| Crear bloqueo | Modal: miembro, rango, motivo, allDay/parcial, recurrente |
| Filtro por miembro/motivo | Dropdowns |
| Timeline visual | Línea temporal con bloqueos por miembro (próximos 30 días) |

**6. Pestañas "Plantillas", "Reglas", "Comparación"**

Reutilizar el contenido actual de las pestañas de `Schedules.tsx`:
- Plantillas de turno (ShiftTemplate) — sin cambios en funcionalidad
- Reglas automáticas (AssignmentRule) — sin cambios
- Comparación horario vs fichaje — sin cambios

**7. Pestaña "Anomalías" (nueva)**

Contenido del cruce de HV-05:
- Tabla de anomalías detectadas
- Filtros por tipo/miembro/rango
- Acciones rápidas por anomalía

**8. Registrar ruta y navegación**

| Archivo | Cambio |
|---|---|
| `routes.tsx` | Añadir `{ path: 'equipo/horarios-vacaciones', Component: SchedulesVacations }` |
| `Sidebar.tsx` | Dentro del grupo `equipo`, reemplazar los items `schedules` y `vacations` por uno solo `horarios-vacaciones` con el label "Horarios y Vacaciones". Mantener las rutas antiguas como redirects. |
| `routes.tsx` | Añadir redirects: `schedules` → `equipo/horarios-vacaciones`, `vacations` → `equipo/horarios-vacaciones` |

**9. Diseño responsive y dark mode**

- Mobile: pestañas como dropdown o scroll horizontal
- Tabla semanal: scroll horizontal con columna de miembro fija (sticky)
- Cards de KPI: 2 columnas en mobile, 4 en desktop
- Dark mode: coherente con el diseño actual (gray-800, amber accents)

#### Vista del trabajador (no admin)

Si el usuario no es Admin/Gerente, la página muestra una vista simplificada:
- Su horario semanal personal (solo lectura)
- Sus vacaciones (solicitar + ver historial)
- Sus bloqueos (solo ver)
- Festivos del año
- Sin pestañas de plantillas, reglas ni comparación

#### Criterios de aceptación
- [ ] Página accesible en `/saas/equipo/horarios-vacaciones`
- [ ] 8 pestañas funcionales (las últimas 3 solo para admin)
- [ ] Calendario semanal integra turnos + vacaciones + bloqueos + festivos + fichajes
- [ ] Vista mensual simplificada funcional
- [ ] Redirects desde `/saas/schedules` y `/saas/vacations`
- [ ] Sidebar actualizado con el nuevo item
- [ ] Vista reducida para trabajador no-admin
- [ ] Responsive + dark mode
- [ ] Carga lazy de pestañas pesadas (comparación, anomalías)

---

### HV-08 — Integración: Dashboard

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** HV-06, HV-07

#### Contexto
El Dashboard actual (`Dashboard.tsx`) tiene accesos directos al equipo pero no muestra KPIs de horarios ni vacaciones. La conexión bidireccional permitiría al manager ver el estado de disponibilidad del equipo de un vistazo.

#### Qué hacer

**1. Widget "Disponibilidad del equipo" en Dashboard**

Card resumen en el Dashboard:

```
┌──────────────────────────────────────┐
│  👥 Disponibilidad hoy               │
│                                       │
│  Trabajando:  8 / 12                 │
│  Vacaciones:  2                       │
│  Ausencia:    1                       │
│  Sin turno:   1                       │
│                                       │
│  ⚠ 2 alertas activas                │
│  [Ver horarios →]                    │
└──────────────────────────────────────┘
```

**2. KPIs para Dashboard API**

Añadir al endpoint de KPIs (o crear sub-endpoint) los datos:

| KPI | Cálculo |
|---|---|
| `team.working_today` | Miembros con turno hoy Y fichaje activo |
| `team.on_vacation` | Miembros con vacación aprobada que incluye hoy |
| `team.absent` | Miembros con bloqueo activo hoy |
| `team.no_schedule` | Miembros activos sin turno definido hoy |
| `team.alerts_count` | Número de alertas activas (HV-06) |
| `team.next_week_coverage` | % de miembros con horario definido para la próxima semana |

**3. Feed de actividad**

En el feed del Dashboard, incluir eventos de horarios/vacaciones:
- "Juan García solicitó vacaciones del 1 al 5 de mayo"
- "María López: turno asignado automáticamente (Regla: Comerciales → Turno mañana)"
- "3 miembros sin horario para la próxima semana"

#### Criterios de aceptación
- [ ] Widget de disponibilidad visible en Dashboard
- [ ] KPIs calculados correctamente en tiempo real
- [ ] Feed de actividad incluye eventos relevantes
- [ ] Click en widget navega a la página unificada
- [ ] Widget respeta dark mode y responsive

---

### HV-09 — Integración: Equipo, Fichajes y Verticales

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** HV-07

#### Contexto
La página de equipo (`Team.tsx`), el detalle del miembro (`TeamMemberDetail.tsx`), los fichajes (`Clockins.tsx`) y las verticales necesitan estar conectados bidireccionalmente con la página unificada de Horarios y Vacaciones.

#### Qué hacer

**1. TeamMemberDetail — Pestaña de disponibilidad**

En el detalle del miembro del equipo, añadir o mejorar:
- Resumen de su horario actual (solo lectura, con link a editar en la página unificada)
- Balance de vacaciones (días asignados / usados / restantes)
- Bloqueos activos y futuros
- Link directo: "Ver en Horarios y Vacaciones →"

**2. Clockins — Banner de contexto**

En la página de fichajes, mostrar banner contextual si:
- Hay miembros fichando que están en vacaciones → Banner warning
- Hay miembros con turno pero sin fichaje hoy → Banner info

**3. Verticales — Turnos específicos**

Algunas verticales ya tienen sus propios turnos (ej: `TaxiShifts.tsx` con turnos mañana/tarde/noche). La integración debe:
- Respetar los turnos específicos de la vertical si los tiene
- Ofrecer un link a la vista general de horarios para esa vertical
- No duplicar funcionalidad sino complementarla

**4. Sidebar — Navegación coherente**

Asegurar que en el grupo "Equipo" del sidebar:
- "Horarios y Vacaciones" aparezca como item principal con icono `CalendarRange`
- Si hay alertas activas, mostrar badge con el count
- "Fichajes" sigue como item separado (ya existe)
- Los links antiguos (`/saas/schedules`, `/saas/vacations`) redirigen

#### Criterios de aceptación
- [ ] TeamMemberDetail muestra resumen de disponibilidad del miembro
- [ ] Clockins muestra banner si hay anomalías de disponibilidad
- [ ] Verticales con turnos propios tienen link cruzado a horarios generales
- [ ] Sidebar refleja la nueva estructura con badge de alertas
- [ ] Todas las rutas antiguas redirigen correctamente

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelos + motor)
├── HV-01 Festivos de empresa
├── HV-02 Bloqueos de disponibilidad
└── HV-03 Motor de solapamientos

Fase 2 — Automatización
├── HV-04 Vacaciones bloquean asignaciones
├── HV-05 Cruce fichajes/rutas
└── HV-06 Sistema de alertas

Fase 3 — Página unificada
└── HV-07 Página Horarios y Vacaciones

Fase 4 — Integraciones
├── HV-08 Dashboard
└── HV-09 Equipo, Fichajes, Verticales
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| HV-01 Festivos | Media | 3-4h |
| HV-02 Bloqueos | Media | 3-4h |
| HV-03 Solapamientos | Alta | 5-6h |
| HV-04 Vacaciones → bloqueo | Alta | 4-5h |
| HV-05 Cruce fichajes/rutas | Media-Alta | 4-5h |
| HV-06 Alertas | Alta | 5-6h |
| HV-07 Página unificada | Muy Alta | 8-10h |
| HV-08 Dashboard | Media | 3-4h |
| HV-09 Equipo/Fichajes/Vert. | Media | 3-4h |
| **Total** | | **~38-48h** |

---

## Notas técnicas

### Base de datos
Todos los documentos nuevos (`company_holiday`, `availability_block`) se almacenan en la DB `*-schedules` de CouchDB, que ya contiene `schedule`, `shift_template` y `assignment_rule`. Esto mantiene coherencia y permite queries eficientes.

### Sin migraciones
CouchDB no requiere migraciones de esquema. Los nuevos tipos de documento se crean al vuelo.

### Retrocompatibilidad
- Las rutas `/saas/schedules` y `/saas/vacations` siguen funcionando como redirects
- Los datos existentes de schedules y vacations no se modifican
- Los APIs existentes (`schedulesApi.ts`, `vacationsApi.ts`) se amplían pero no rompen

### Acceso y permisos
- La lógica de roles (`MANAGER_ROLES`) ya existe en `Schedules.tsx` y `Vacations.tsx`
- Se reutiliza la misma lógica: Admin/Gerente ven todo, el resto ve lo suyo
- Los bloqueos solo los puede crear Admin/Gerente
- Los festivos solo los puede gestionar Admin/Gerente

### i18n
Todos los labels nuevos deben incluirse en los 4 idiomas existentes: es, en, pt, fr. Seguir el patrón de `WEEKDAY_LABELS`, `LEAVE_TYPE_LABELS`, etc.
