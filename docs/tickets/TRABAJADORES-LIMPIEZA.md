# TRABAJADORES Y PRODUCTIVIDAD (Limpieza) — Plan de Tickets

**Página:** `/saas/cleaning-workers`
**Objetivo:** Controlar el personal de limpieza, sus asignaciones, horas, documentación y rendimiento.
**Tipo:** Módulo dentro de la vertical Limpieza.
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

~54% completado (38/71 criterios). Bloques sólidos: modelo `cleaning_worker` + CRUD completo (CW-01), página `CleaningWorkers.tsx` con 3 tabs, KPIs, filtros, drawer de 4 pestañas (CW-02/03), endpoint de productividad con retrasos/absentismo/coste por cliente (CW-05 parcial), panel de productividad (CW-06) y las 5 alertas de trabajador en `alertEngine.js` (CW-07). Falta de verdad: selector de trabajador en el formulario de `CleaningServices.tsx` (sigue texto libre), drag & drop en asignación diaria, cruce con fichajes (`clockedHours`/eficiencia), vista "Mi jornada" del trabajador con mapa (CW-08), conexiones con Equipo/Fichajes/Finanzas/Dashboard (CW-09) y sistema de permisos granular (CW-10; solo existe `workerPermissions` en el modelo).

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de servicios de limpieza (backend) | Completo | `cleaningRouter.js` → `cleaningController.js` — DB `*-cleaning` |
| Modelo `CleaningService` con `assignedTo` / `assignedToName` | Parcial | `cleaningApi.ts` — son strings planos, no referencia a entidad |
| Estados del servicio (`pending → assigned → in_progress → completed → cancelled`) | Completo | `couchdb.js` `normalizeCleaningServiceStatus` |
| Check-in / check-out por servicio | Completo | `cleaningApi.ts` — `checkInAt`, `checkOutAt` en `CleaningService` |
| Notas del empleado por servicio | Completo | `cleaningApi.ts` — `employeeNotes` |
| Calidad y rating por servicio | Completo | `cleaningApi.ts` — `qualityOk`, `qualityRating`, `clientRating` |
| Equipo de empresa (miembros, roles, permisos) | Completo | `businessRouter.js` — `business.members` con roles |
| Organigrama | Completo | `orgchartRouter.js` — nodos con `user_id` |
| Fichajes con schedule vinculado | Completo | `clockinsRouter.js` — `ClockinRecord` con `scheduled_start/end`, `totalMinutes` |
| Horarios semanales por miembro | Completo | `Schedules.tsx`, `schedulesApi.ts` — DB `*-schedules` |
| Rendimiento fichajes vs ventas | Completo | `clockinsController.js` `getPerformance` — solo ventas, no servicios de limpieza |
| Motor de alertas | Parcial | `alertEngine.js` — catálogo, vehículos, delivery; **no integra limpieza** |
| Login de equipo (modo worker) | Completo | `TeamLogin.tsx` + rutas `/saas/worker/*` |
| TPV Trabajador Limpieza | Completo | `WorkerTpvCleaning.tsx` — lista servicios, check-in, temporizador, finalizar y cobrar |
| Trabajadores de construcción (referencia de patrón) | Completo | `constructionController.js` — entidad `construction_worker` con CRUD independiente |
| Sidebar con grupo Limpieza | Completo | `Sidebar.tsx` — 4 items: services, checklist, quality, reviews |
| Vacaciones y ausencias | Completo | `Vacations.tsx`, `vacationsApi.ts` — DB `*-vacations` |
| Nóminas y gastos de personal | Completo | `Team.tsx` tabs payroll + staff-expenses |
| Catálogo vertical limpieza | Completo | `verticalCatalog.js` — `staffRequired`, `duration` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Entidad `CleaningWorker` como documento propio (no solo string en servicio) | No existe |
| Ficha completa de trabajador (documentación, contrato, coste/hora, zona, vehículo, materiales) | No existe |
| Página independiente `/saas/cleaning-workers` | No existe |
| CRUD backend de trabajadores de limpieza | No existe |
| Asignación diaria de trabajador a servicio/cliente/ubicación/horario con entidad referenciada | No existe (es texto libre) |
| Cálculo de horas trabajadas por trabajador (servicios completados, check-in/out acumulado) | No existe |
| Cálculo de servicios realizados por trabajador por período | No existe |
| Detección de retrasos (check-in tarde vs hora programada) | No existe |
| Cálculo de absentismo (servicios asignados sin check-in) | No existe |
| Coste laboral por cliente (suma de horas × coste/hora por cliente) | No existe |
| Productividad por trabajador (servicios/hora, ingresos/hora, rating medio) | No existe |
| Alerta: trabajador sin asignación | No existe |
| Alerta: exceso de horas | No existe |
| Alerta: ausencia (no check-in a servicio asignado) | No existe |
| Alerta: documentación caducada | No existe |
| Alerta: baja productividad | No existe |
| Vista gerente: costes, rendimiento y asignaciones | No existe |
| Vista trabajador: su jornada, sus servicios, su documentación básica | No existe |
| Conexión bidireccional con Equipo Core (`business.members`) | No implementada |
| Conexión con Fichajes (cruce horas fichadas vs horas servicio) | No implementada |
| Conexión con Rutas (optimización desplazamientos) | No existe |
| Conexión con Finanzas (coste laboral en P&L) | No existe |
| Conexión con Dashboard (KPIs de personal limpieza) | No existe |
| Sidebar: item `cleaning-workers` en grupo Limpieza | No existe |

---

## Tickets

---

### CW-01 — Modelo de datos: Entidad Trabajador de Limpieza

**Tipo:** Backend + API Client
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

Actualmente `assignedTo` / `assignedToName` en `CleaningService` son strings planos. No hay entidad propia, por lo que no se puede:
- Gestionar datos de contacto, documentación o tipo de contrato del trabajador.
- Calcular coste laboral por trabajador ni por cliente.
- Saber su disponibilidad real, zona asignada o si tiene vehículo propio.
- Llevar control de materiales asignados.
- Detectar documentación caducada.
- Medir productividad individual.

La vertical de construcción ya tiene `construction_worker` como referencia de patrón. Necesitamos `cleaning_worker` en la DB `*-cleaning` como entidad de primer nivel.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-cleaning`**

```typescript
export interface CleaningWorkerDocument {
  _id: string;                     // clwk-{uuid}
  _rev?: string;
  type: 'cleaning_worker';
  id: string;
  user_id: string;                 // ID de la cuenta (owner del negocio)

  // ── Datos personales ──────────────────────────────────
  name: string;                    // Nombre completo
  phone: string;
  email: string;
  avatar?: string;                 // URL o base64 miniatura
  address?: string;                // Dirección personal

  // ── Vínculo con equipo ────────────────────────────────
  teamMemberId?: string;           // Enlace con business.members (opcional)

  // ── Documentación ─────────────────────────────────────
  documents: CleaningWorkerDoc[];  // DNI, contrato, PRL, carnet conducir, etc.

  // ── Contrato y costes ─────────────────────────────────
  contractType: 'full_time' | 'part_time' | 'temporary' | 'freelance' | 'internship';
  hourlyCost: number;              // Coste/hora para la empresa (€)
  hourlyRate?: number;             // Tarifa de facturación al cliente si aplica
  weeklyHours: number;             // Horas contratadas por semana
  startDate: string;               // Fecha inicio contrato (YYYY-MM-DD)
  endDate?: string;                // Fecha fin contrato (si temporal)
  socialSecurityNumber?: string;

  // ── Disponibilidad y zona ─────────────────────────────
  availability: WorkerAvailability;
  zones: string[];                 // Zonas asignadas (códigos postales, barrios, ciudades)
  preferredZone?: string;          // Zona preferente

  // ── Vehículo ──────────────────────────────────────────
  hasOwnVehicle: boolean;
  vehicleType?: 'coche' | 'moto' | 'bicicleta' | 'transporte_publico' | 'a_pie';
  vehicleOwnership?: 'own' | 'company';  // Propio o de empresa
  licensePlate?: string;

  // ── Materiales asignados ──────────────────────────────
  assignedMaterials: AssignedMaterial[];

  // ── Estado y notas ────────────────────────────────────
  status: 'active' | 'inactive' | 'on_leave' | 'trial';
  specializations: string[];       // Ej: cristales, desinfección, limpieza profunda
  languages?: string[];
  notes: string;

  // ── Timestamps ────────────────────────────────────────
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CleaningWorkerDoc {
  id: string;                      // uuid
  name: string;                    // "DNI", "Contrato", "PRL", "Carnet conducir"
  documentType: 'dni' | 'contract' | 'prl' | 'driving_license' | 'social_security' | 'medical' | 'certification' | 'other';
  url: string;                     // URL al archivo
  expiresAt?: string;              // Fecha de caducidad (YYYY-MM-DD)
  uploadedAt: string;
  verified: boolean;               // Verificado por gerente
}

export interface WorkerAvailability {
  monday:    DayAvailability;
  tuesday:   DayAvailability;
  wednesday: DayAvailability;
  thursday:  DayAvailability;
  friday:    DayAvailability;
  saturday:  DayAvailability;
  sunday:    DayAvailability;
}

export interface DayAvailability {
  available: boolean;
  startTime?: string;   // "08:00"
  endTime?: string;     // "16:00"
  breakStart?: string;  // "13:00"
  breakEnd?: string;    // "14:00"
}

export interface AssignedMaterial {
  id: string;
  name: string;                    // "Kit limpieza general", "Aspiradora industrial"
  catalogItemId?: string;          // Referencia al catálogo si existe
  quantity: number;
  assignedAt: string;
  returnedAt?: string;
  condition?: 'good' | 'fair' | 'poor' | 'needs_replacement';
  notes?: string;
}
```

**2. Añadir a `services/couchdb.js`**

- Función `buildCleaningWorkerDocument(userId, data, existing)` — Construye documento con todos los campos y valores por defecto seguros. Seguir el patrón exacto de `buildConstructionWorkerDocument`.
- Función `sanitizeCleaningWorker(doc)` — Proyección segura para respuestas API.
- Función `listCleaningWorkersByUser(db, userId)` — Filtra por `type === 'cleaning_worker'`, sin `deletedAt`, ordena por `name`.

**3. Crear CRUD backend**

Router: `routers/cleaningRouter.js` (extender el existente)

| Método | Ruta | Controlador |
|---|---|---|
| `GET` | `/api/cleaning/workers/:userId` | `listCleaningWorkers` |
| `POST` | `/api/cleaning/workers/:userId` | `createCleaningWorker` |
| `GET` | `/api/cleaning/workers/:userId/:workerId` | `getCleaningWorker` |
| `PUT` | `/api/cleaning/workers/:userId/:workerId` | `updateCleaningWorker` |
| `DELETE` | `/api/cleaning/workers/:userId/:workerId` | `removeCleaningWorker` |

Controlador: extender `controllers/cleaningController.js` con las 5 funciones. Cada operación:
- Valida `userId` y busca cuenta con `findAccountByUserId`.
- En create/update: `buildCleaningWorkerDocument` + `putDocument`.
- En delete: `softDeleteDocument`.
- Registra actividad con `logAccountActivity` tipo `cleaning_worker`.

**4. Crear API client `src/app/lib/cleaningWorkersApi.ts`**

| Función | Descripción |
|---|---|
| `listCleaningWorkers(userId)` | Lista todos los trabajadores activos (no eliminados) |
| `getCleaningWorker(userId, workerId)` | Obtiene un trabajador por ID |
| `createCleaningWorker(userId, data)` | Crea un nuevo trabajador |
| `updateCleaningWorker(userId, worker)` | Actualiza un trabajador existente |
| `deleteCleaningWorker(userId, workerId)` | Elimina (soft delete) un trabajador |

Reutilizar los helpers `getApiBase`, `normalizeUserId`, `getCouchHeaders`, `request<T>` de `cleaningApi.ts` (extraer a un helper compartido o duplicar el patrón).

**5. Ampliar `CleaningService` con referencia a trabajador**

Añadir a `buildCleaningServiceDocument` y a la interfaz `CleaningService`:

```typescript
workerId?: string;                // ID del documento cleaning_worker (reemplaza assignedTo como referencia)
assignedTo: string;               // Mantener para retrocompatibilidad (ID textual)
assignedToName: string;           // Mantener para retrocompatibilidad (nombre)
```

Migración suave: servicios existentes sin `workerId` siguen mostrando `assignedToName` como fallback.

**6. Montar en `index.js`**

No hace falta nueva entrada en `internalRouters`: las rutas se añaden al `cleaningRouter` existente que ya está montado en `/api/cleaning`.

#### Criterios de aceptación
- [x] Documento `cleaning_worker` se persiste en DB `*-cleaning`
- [x] CRUD completo (5 endpoints) funcional
- [x] API client con tipos TypeScript exportados (`cleaningWorkersApi.ts`)
- [x] `sanitizeCleaningWorker` no expone `_rev` ni campos internos de CouchDB
- [x] `CleaningService` acepta `workerId` opcional con fallback a `assignedToName`
- [x] Soft delete funciona correctamente (no aparece en listados)
- [x] Log de actividad en creación, actualización y eliminación

---

### CW-02 — Página: Lista de Trabajadores con KPIs

**Tipo:** Frontend
**Prioridad:** Crítica (bloquea todo lo visual)
**Dependencias:** CW-01

#### Contexto

No existe ninguna página que muestre los trabajadores de limpieza. Solo aparecen como texto libre al asignar un servicio. Necesitamos una página principal `/saas/cleaning-workers` que sea el centro de control del personal.

#### Qué hacer

**1. Crear `src/app/pages/saas/CleaningWorkers.tsx`**

Layout principal con `<Layout title="Trabajadores" subtitle="Personal y productividad">`.

**2. Barra superior de KPIs (4 tarjetas)**

| KPI | Cálculo | Icono |
|---|---|---|
| Total activos | Count de workers con `status === 'active'` | Users |
| En servicio hoy | Count de workers con servicios `in_progress` hoy | Briefcase |
| Sin asignación hoy | Count de workers activos sin servicios asignados para hoy | AlertTriangle |
| Horas hoy | Suma de horas trabajadas hoy (check-in/out de servicios completados + en progreso) | Clock |

**3. Filtros y búsqueda**

- Input de búsqueda: filtra por nombre, teléfono, zona, especialización.
- Filtro por estado: `active`, `inactive`, `on_leave`, `trial`, todos.
- Filtro por zona: dropdown con zonas únicas extraídas de los workers.
- Filtro por disponibilidad hoy: toggle "Disponibles hoy" que filtra según `availability[dayOfWeek].available`.
- Filtro por contrato: `full_time`, `part_time`, `temporary`, `freelance`, todos.

**4. Vista toggle: tarjetas / tabla**

**Modo tarjetas (default):**
Cada tarjeta muestra:
- Avatar o iniciales con fondo de color.
- Nombre y teléfono.
- Badge de estado (`active` → verde, `inactive` → gris, `on_leave` → amarillo, `trial` → azul).
- Badge de contrato (`full_time` → sólido, `part_time` → outline, etc.).
- Zona(s) asignada(s).
- Servicios hoy: `N servicios` con color según carga (0 → rojo si activo, 1-3 → verde, 4+ → naranja).
- Icono de vehículo (coche, moto, etc.) con badge propio/empresa.
- Icono de alerta si tiene documentación caducada (rojo pulsante).
- Click → abre ficha detalle (CW-03).

**Modo tabla:**
Columnas: nombre, teléfono, estado, contrato, zona, coste/hora, servicios hoy, horas semana, vehículo, alertas, acciones.
Sortable por todas las columnas numéricas.

**5. Botón "Nuevo trabajador"**

Abre modal/drawer de creación (CW-03).

**6. Acciones rápidas por trabajador (menú contextual)**

- Ver ficha completa
- Editar
- Asignar servicio (abre el asignador CW-04)
- Desactivar / Activar
- Eliminar (con confirmación)

**7. Registrar ruta y sidebar**

- Añadir en `routes.tsx`: `{ path: 'cleaning-workers', Component: CleaningWorkers }`.
- Añadir en `Sidebar.tsx`: item `cleaning-workers` con icono `<HardHat>` (o `<UserCog>`) en el grupo `cleaning`, antes de `cleaning-services`.
- Actualizar `itemIds` del grupo cleaning: `['cleaning-workers', 'cleaning-services', 'cleaning-checklist', 'cleaning-quality', 'cleaning-reviews']`.
- Añadir el active path check.

#### Criterios de aceptación
- [x] Página accesible en `/saas/cleaning-workers`
- [x] 4 KPIs calculados en tiempo real desde datos de trabajadores y servicios
- [x] Búsqueda y filtros funcionan combinados (búsqueda + estado + contrato + zona; falta el toggle "Disponibles hoy")
- [x] Toggle tarjetas/tabla persiste en localStorage
- [x] Badge de documentación caducada visible
- [x] Responsive: stack de tarjetas 1 col en móvil, 2 en tablet, 3-4 en desktop
- [x] Sidebar muestra el item con highlight cuando está activo
- [x] Diseño consistente con las demás páginas de la vertical (CleaningServices, CleaningQuality)

---

### CW-03 — Ficha completa del trabajador (Drawer/Modal)

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CW-01, CW-02

#### Contexto

No existe una ficha detallada de trabajador. Necesitamos un drawer lateral (o página de detalle) que muestre toda la información del trabajador organizada en secciones con pestañas.

#### Qué hacer

**1. Componente `CleaningWorkerDetail`**

Drawer lateral derecho (ancho ~600px, fullscreen en móvil) que se abre al hacer click en un trabajador desde CW-02 o desde cualquier servicio que lo referencie.

**2. Cabecera del drawer**

- Avatar grande (80px) con iniciales como fallback y badge de estado.
- Nombre completo en tipografía `text-xl font-semibold`.
- Badge de estado y badge de tipo de contrato.
- Teléfono con enlace `tel:` y botón WhatsApp (`https://wa.me/`).
- Email con enlace `mailto:`.
- Botón "Editar" (abre formulario inline o modal de edición) y menú "..." con "Desactivar" y "Eliminar".
- Indicador de "Disponible ahora" en base a `availability[hoy]` y rango horario actual.

**3. Pestañas del drawer**

**Tab 1 — Información**

Formulario editable con secciones visuales:

*Sección "Datos personales":*
- Nombre, teléfono, email, dirección.

*Sección "Contrato":*
- Tipo de contrato (select), coste/hora (input numérico €), horas semanales, fecha inicio, fecha fin (si temporal), número SS.

*Sección "Disponibilidad semanal":*
- Tabla 7 días: toggle activo + inputs hora inicio/fin + descanso inicio/fin.
- Color de fondo verde si disponible, gris si no.

*Sección "Zona y transporte":*
- Zonas asignadas (chips con autocompletado, pudiendo añadir nuevas).
- Zona preferente (select de entre las asignadas).
- ¿Tiene vehículo propio? (toggle).
- Tipo de vehículo (select).
- Propiedad: propio / empresa (radio).
- Matrícula (si aplica).

*Sección "Especializaciones":*
- Tags seleccionables entre los tipos de limpieza del catálogo: `limpieza general`, `limpieza profunda`, `cristales`, `desinfección`, `mantenimiento`, `productos`, `otros`.
- Posibilidad de añadir tags personalizados.

*Sección "Vínculo con equipo":*
- Select para vincular con un miembro existente de `business.members` (por `teamMemberId`).
- Si está vinculado, mostrar badge "Vinculado al equipo" con enlace a `/saas/team`.
- Si no está vinculado, mostrar botón "Vincular con miembro del equipo".

*Sección "Notas":*
- Textarea libre.

**Tab 2 — Documentación**

- Lista de documentos con nombre, tipo (badge con color), fecha de subida, fecha de caducidad, estado verificado (check verde / pendiente amarillo).
- Badge rojo pulsante en documentos caducados (fecha caducidad < hoy).
- Badge naranja en documentos que caducan en los próximos 30 días.
- Botón "Añadir documento" → modal con: nombre, tipo (select: DNI, Contrato, PRL, Carnet conducir, Seguridad Social, Médico, Certificación, Otro), archivo (file upload), fecha caducidad (opcional), notas.
- Acciones por documento: ver/descargar, verificar (toggle), editar, eliminar.
- Barra superior: conteo "N documentos | N caducados | N por caducar".

**Tab 3 — Servicios**

- Lista de servicios asignados a este trabajador (filtro por `workerId` en `CleaningService`).
- Filtros rápidos: hoy, esta semana, este mes, todos.
- Cada servicio muestra: fecha, hora, cliente, dirección, tipo, estado (badge), duración real vs estimada.
- Click en servicio → navega a CleaningServices con ese servicio seleccionado.
- Resumen arriba: total servicios en período, completados, cancelados, horas acumuladas.

**Tab 4 — Materiales**

- Lista de materiales asignados con: nombre, cantidad, fecha de asignación, estado (en uso / devuelto), condición (badge: buena/regular/mala/reemplazar).
- Botón "Asignar material" → modal con: nombre (autocompletado del catálogo si existe), cantidad, notas.
- Acción "Devolver" → marca `returnedAt` con fecha actual.
- Acción "Actualizar estado" → cambia condición.

**Tab 5 — Productividad** (conecta con CW-06)

Placeholder que se completa en CW-06 con métricas individuales.

#### Criterios de aceptación
- [x] Drawer se abre y cierra con animación suave
- [x] Todos los campos se guardan con `updateCleaningWorker` al pulsar "Guardar"
- [x] Documentación muestra alertas visuales por caducidad (badges caducados/por caducar)
- [ ] Tab servicios muestra histórico filtrable — lista de servicios sin filtros de período
- [ ] Tab materiales permite asignar y devolver — devolver funciona; no hay modal de "Asignar material"
- [x] Responsive: drawer ocupa 100% ancho en móvil
- [x] Formulario de creación reutiliza el mismo componente con campos vacíos (modal "Editar/Nuevo trabajador")

---

### CW-04 — Asignación diaria: Trabajador → Servicio

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CW-01

#### Contexto

Actualmente asignar un trabajador a un servicio de limpieza es escribir un nombre en texto libre. No hay selección inteligente, ni validación de disponibilidad, ni vista de quién hace qué cada día. Necesitamos un sistema de asignación que referencie la entidad real del trabajador y una vista de planificación diaria.

#### Qué hacer

**1. Selector de trabajador en formulario de servicio (`CleaningServices.tsx`)**

Reemplazar el input de texto `assignedToName` por un componente `WorkerSelector`:
- Dropdown con búsqueda que lista trabajadores activos.
- Cada opción muestra: avatar + nombre + zona + servicios ya asignados hoy (carga).
- Color de carga: 0 servicios → gris, 1-2 → verde, 3 → naranja, 4+ → rojo.
- Indicador de disponibilidad hoy (según `availability`).
- Al seleccionar: rellena `workerId`, `assignedTo` y `assignedToName` automáticamente.
- Opción "Sin asignar" para dejar pendiente.
- Opción de texto libre como fallback (si el trabajador no tiene entidad, ej. subcontratado puntual).

**2. Vista de asignación diaria (nueva tab o sección en CleaningWorkers)**

Panel que muestra una planificación visual del día:

*Eje Y:* Trabajadores activos (ordenados por zona o nombre).
*Eje X:* Franja horaria del día (8:00 → 20:00 por defecto, ajustable).
*Bloques:* Servicios asignados como bloques de color dentro de la franja horaria del trabajador.
- Color del bloque por estado: pendiente (gris), asignado (azul), en progreso (naranja), completado (verde), cancelado (rojo).
- Cada bloque muestra: hora, cliente, dirección (truncada), tipo de limpieza.
- Tooltip al hover: detalle completo del servicio.
- Clic en bloque: abre el detalle del servicio.
- Fila del trabajador muestra a la izquierda: avatar, nombre, zona, nº servicios, horas estimadas.

*Servicios sin asignar:*
- Panel lateral o inferior con servicios del día sin `workerId`.
- Drag & drop a la fila de un trabajador para asignar (actualiza `workerId`, `assignedTo`, `assignedToName` vía API).

*Navegación:*
- Selector de fecha con flechas anterior/siguiente día.
- Botón "Hoy" para volver al día actual.

**3. Endpoint de asignación rápida (backend)**

Nuevo endpoint en `cleaningRouter.js`:

```
PATCH /api/cleaning/services/:userId/:serviceId/assign
Body: { workerId: string }
```

El controlador:
- Busca el worker por `workerId` en DB `*-cleaning`.
- Actualiza el servicio con `workerId`, `assignedTo: worker._id`, `assignedToName: worker.name`, `status: 'assigned'` (si estaba `pending`).
- Registra actividad.
- Devuelve servicio actualizado.

**4. Endpoint de servicios por trabajador (backend)**

```
GET /api/cleaning/workers/:userId/:workerId/services?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Devuelve servicios filtrados por `workerId` y rango de fechas. Usado por la ficha del trabajador (CW-03 tab servicios) y por la vista de asignación.

**5. API client: funciones de asignación**

Añadir a `cleaningWorkersApi.ts`:

| Función | Descripción |
|---|---|
| `assignWorkerToService(userId, serviceId, workerId)` | Asigna un trabajador a un servicio |
| `listWorkerServices(userId, workerId, from?, to?)` | Lista servicios de un trabajador en rango |
| `listUnassignedServices(userId, date)` | Lista servicios sin trabajador asignado para una fecha |

#### Criterios de aceptación
- [ ] Selector de trabajador funciona en el formulario de creación y edición de servicio — `CleaningServices.tsx` sigue usando input de texto libre
- [ ] Selector muestra carga y disponibilidad en tiempo real
- [x] Vista de asignación diaria muestra planificación visual (tab "Asignación diaria" con servicios por trabajador + sin asignar; no es grid horario)
- [ ] Drag & drop de servicios sin asignar a trabajadores funciona
- [x] Endpoint PATCH assign actualiza servicio y vincula trabajador
- [x] Endpoint GET services por worker filtra por rango de fechas
- [x] Retrocompatibilidad: servicios sin `workerId` siguen mostrando `assignedToName`

---

### CW-05 — Automatización: Cálculos de horas, retrasos, absentismo y coste laboral

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** CW-01, CW-04

#### Contexto

No existe lógica que cruce datos de servicios, fichajes y trabajadores para calcular métricas operativas de la vertical de limpieza. El `getPerformance` de fichajes solo cruza con ventas (`type: 'sale'`), no con servicios de limpieza.

#### Qué hacer

**1. Endpoint de productividad de limpieza (backend)**

```
GET /api/cleaning/workers/:userId/productivity?from=YYYY-MM-DD&to=YYYY-MM-DD
```

**Autorización:** solo miembros con rol Admin o Gerente.

**Lógica:** Para cada `cleaning_worker` activo:

*a) Horas trabajadas:*
- Fuente primaria: `checkInAt` / `checkOutAt` de los `cleaning_service` asignados con `workerId`.
- Suma de diferencias `(checkOutAt - checkInAt)` de servicios `completed` en rango.
- Fuente secundaria (si el trabajador está vinculado con `teamMemberId`): `ClockinRecord` del miembro en rango de fichajes.
- Devolver ambas métricas: `serviceHours` (horas de servicio real) y `clockedHours` (horas fichadas totales).

*b) Servicios realizados:*
- Count de servicios con `workerId` en rango por estado: completados, cancelados, pendientes, total.

*c) Retrasos:*
- Para cada servicio asignado al trabajador en el rango: comparar `checkInAt` con `time` (hora programada del servicio).
- Si `checkInAt > time + 15min`: contar como retraso. Umbral configurable.
- Devolver: `lateArrivals` (count), `avgDelayMinutes` (media de minutos de retraso en los que llegó tarde).

*d) Absentismo:*
- Servicios asignados al trabajador en rango con estado `assigned` cuya fecha ya pasó y no tienen `checkInAt` → contar como ausencia.
- Cruce opcional con `VacationRequest` si `teamMemberId` está vinculado (descartar ausencias justificadas).
- Devolver: `absences` (count), `unjustifiedAbsences` (ausencias sin vacación/baja aprobada).

*e) Coste laboral por cliente:*
- Agrupar servicios por `clientName` (o futuro `clientId`).
- Por cada grupo: `sum(serviceHours) × worker.hourlyCost`.
- Devolver array: `[{ clientName, totalHours, laborCost, servicesCount }]`.

*f) Productividad:*
- `servicesPerHour` = `completedServices / serviceHours` (si horas > 0).
- `revenuePerHour` = `sum(price de servicios completed) / serviceHours`.
- `avgQualityRating` = media de `qualityRating` de servicios completed con rating > 0.
- `avgClientRating` = media de `clientRating` de servicios completed con rating > 0.
- `efficiency` = `serviceHours / clockedHours × 100` (% del tiempo fichado que fue de servicio efectivo).

**Respuesta del endpoint:**

```typescript
interface CleaningProductivityResponse {
  ok: boolean;
  period: { from: string; to: string };
  workers: WorkerProductivity[];
  totals: {
    totalWorkers: number;
    totalServiceHours: number;
    totalClockedHours: number;
    totalServicesCompleted: number;
    totalRevenue: number;
    totalLaborCost: number;
    avgServicesPerHour: number;
    avgRevenuePerHour: number;
    avgEfficiency: number;
  };
  costByClient: ClientLaborCost[];
}

interface WorkerProductivity {
  workerId: string;
  workerName: string;
  status: string;
  serviceHours: number;
  clockedHours: number;
  completedServices: number;
  cancelledServices: number;
  totalServices: number;
  lateArrivals: number;
  avgDelayMinutes: number;
  absences: number;
  unjustifiedAbsences: number;
  servicesPerHour: number;
  revenuePerHour: number;
  avgQualityRating: number;
  avgClientRating: number;
  efficiency: number;
  totalRevenue: number;
  laborCost: number;
  profitability: number;     // totalRevenue - laborCost
}

interface ClientLaborCost {
  clientName: string;
  totalHours: number;
  laborCost: number;
  servicesCount: number;
  avgCostPerService: number;
  workers: string[];          // Nombres de workers que atendieron al cliente
}
```

**2. Endpoint de stats rápido por trabajador (backend)**

```
GET /api/cleaning/workers/:userId/:workerId/stats?period=today|week|month
```

Devuelve un subset de las métricas solo para un trabajador. Usado por la ficha (CW-03 tab productividad) y por las tarjetas de KPI.

**3. API client: funciones de productividad**

Añadir a `cleaningWorkersApi.ts`:

| Función | Descripción |
|---|---|
| `getCleaningProductivity(userId, from, to)` | Productividad global de todos los trabajadores |
| `getWorkerStats(userId, workerId, period)` | Stats rápido de un trabajador individual |

#### Criterios de aceptación
- [ ] Endpoint productividad calcula las 6 categorías de métricas correctamente — 5 de 6; falta cruce con fichajes (`clockedHours`/`efficiency`)
- [ ] Retrasos se detectan con umbral de 15 min (configurable) — umbral de 15 min hardcodeado, no configurable
- [ ] Absentismo descuenta vacaciones aprobadas si worker está vinculado a equipo — no cruza con `VacationRequest`
- [x] Coste laboral por cliente se agrega correctamente (usa coste/hora medio del equipo, no del worker exacto)
- [x] Respuesta incluye `totals` globales y detalle por worker
- [ ] Solo accesible por Admin/Gerente — sin control de rol en el endpoint
- [x] Endpoint de stats individual funciona con períodos today/week/month

---

### CW-06 — Panel de Productividad (vista gerente)

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CW-02, CW-05

#### Contexto

El gerente necesita ver de un vistazo cómo rinde su equipo de limpieza, dónde se gasta más en personal, y qué trabajadores necesitan atención. No existe ninguna vista de productividad orientada a la vertical de limpieza.

#### Qué hacer

**1. Tab "Productividad" dentro de CleaningWorkers**

Implementar como una tab del componente `CleaningWorkers.tsx` junto a la lista de trabajadores. Tabs: `Equipo` | `Asignación` (CW-04) | `Productividad`.

**2. Selector de período**

- Botones rápidos: Hoy, Esta semana, Este mes, Último mes.
- Selector de rango personalizado (date-range picker).
- El cambio de período recalcula todas las métricas.

**3. Fila de KPIs principales (6 tarjetas)**

| KPI | Dato | Color |
|---|---|---|
| Horas de servicio | `totals.totalServiceHours` | Azul |
| Servicios completados | `totals.totalServicesCompleted` | Verde |
| Ingresos generados | `totals.totalRevenue` formateado € | Verde |
| Coste laboral | `totals.totalLaborCost` formateado € | Rojo |
| Rentabilidad | `totalRevenue - totalLaborCost` formateado € | Verde si positivo, rojo si negativo |
| Eficiencia media | `totals.avgEfficiency`% | Verde >80%, naranja 60-80%, rojo <60% |

**4. Ranking de trabajadores**

Tabla ordenable con columnas:
- Posición (#)
- Nombre (con avatar)
- Servicios completados
- Horas de servicio
- Servicios/hora
- Ingresos/hora
- Retrasos (con badge rojo si > 2)
- Ausencias (con badge rojo si > 0 injustificadas)
- Rating calidad (estrellas)
- Rating cliente (estrellas)
- Eficiencia (barra de progreso con color)
- Rentabilidad (ingresos - coste)

Default ordenado por `profitability` descendente. Click en fila → abre ficha trabajador (CW-03).

Barras de progreso visual en columnas numéricas para facilitar comparación rápida.

**5. Gráfico de coste laboral por cliente**

Gráfico de barras horizontal: eje Y = clientes, eje X = coste en €.
Cada barra muestra: horas, coste, nº servicios.
Colores: top 3 clientes más costosos en rojo, resto en azul.
Datos desde `costByClient` del endpoint.

**6. Gráficos de tendencia**

Si hay datos para > 7 días en el período seleccionado, mostrar:
- Gráfico de líneas: servicios completados por día.
- Gráfico de líneas: horas de servicio por día.
- Gráfico de áreas: ingresos vs coste laboral por día.

Usar datos agregados por fecha desde los servicios.

**7. Sección "Necesita atención"**

Tarjetas de alerta visual (estilo warning cards) que destacan:
- Trabajadores con eficiencia < 50%.
- Trabajadores con > 2 retrasos en el período.
- Trabajadores con ausencias injustificadas.
- Trabajadores con rating calidad < 3.

Cada tarjeta: nombre del trabajador, métrica problemática, botón "Ver ficha".

#### Criterios de aceptación
- [x] Todas las métricas se refrescan al cambiar período (Hoy/Semana/Mes/Personalizado con rango)
- [ ] Ranking ordenable por cualquier columna — tabla de ranking existe pero sin ordenación por click
- [x] Gráfico de coste laboral por cliente legible con hover tooltips — barras de progreso con top 3 en rojo, sin tooltips
- [ ] Gráficos de tendencia se ocultan si período < 7 días — no hay gráficos de tendencia
- [x] Sección "Necesita atención" vacía si todo va bien (muestra mensaje positivo)
- [x] Responsive: gráficos se apilan en móvil, tabla scroll horizontal
- [ ] Loading states con skeletons mientras se cargan datos — spinner genérico, no skeletons

---

### CW-07 — Alertas de Trabajadores en Motor de Alertas

**Tipo:** Backend
**Prioridad:** Media-Alta
**Dependencias:** CW-01, CW-05

#### Contexto

El motor de alertas (`alertEngine.js`) evalúa reglas de negocio cada hora y emite notificaciones vía CouchDB + SSE + Web Push. Actualmente cubre catálogo, vehículos, delivery, órdenes de taller. **No integra la vertical de limpieza ni trabajadores**. Necesitamos 5 tipos de alerta para el personal.

#### Qué hacer

**1. Crear función `checkCleaningWorkerAlerts(userId, account, db)` en `alertEngine.js`**

Se invoca dentro de `runAlertsForUser` si el negocio tiene `businessType === 'cleaning'` (o siempre, si tiene workers de limpieza).

**2. Alerta: Trabajador sin asignación**

```
Categoría: cleaning_worker
Tipo: worker_no_assignment
Condición: Worker activo + sin servicios asignados para mañana (fecha = hoy + 1 día)
Dedup key: worker_no_assignment:{workerId}:{fecha_mañana}
Prioridad: warning
Mensaje: "🧹 {workerName} no tiene servicios asignados para mañana ({fecha})"
```

**3. Alerta: Exceso de horas**

```
Categoría: cleaning_worker
Tipo: worker_hours_excess
Condición: Horas de servicio esta semana > weeklyHours × 1.1 (10% por encima del contrato)
Dedup key: worker_hours_excess:{workerId}:{semana_iso}
Prioridad: warning
Mensaje: "⏰ {workerName} lleva {actualHours}h esta semana ({weeklyHours}h contratadas)"
```

**4. Alerta: Ausencia (no check-in)**

```
Categoría: cleaning_worker
Tipo: worker_absence
Condición: Servicio asignado a worker con fecha = hoy, hora programada ya pasó + 30min, sin checkInAt
Dedup key: worker_absence:{workerId}:{serviceId}
Prioridad: critical
Mensaje: "🚨 {workerName} no se ha presentado al servicio en {address} (programado a las {time})"
```

**5. Alerta: Documentación caducada**

```
Categoría: cleaning_worker
Tipo: worker_doc_expired
Condición: Algún documento del worker tiene expiresAt < hoy
Dedup key: worker_doc_expired:{workerId}:{documentId}
Prioridad: critical
Mensaje: "📄 Documento '{docName}' de {workerName} caducó el {expiresAt}"
```

```
Tipo: worker_doc_expiring
Condición: Algún documento tiene expiresAt entre hoy y hoy+30 días
Dedup key: worker_doc_expiring:{workerId}:{documentId}
Prioridad: warning
Mensaje: "📄 Documento '{docName}' de {workerName} caduca el {expiresAt} (en {daysLeft} días)"
```

**6. Alerta: Baja productividad**

```
Categoría: cleaning_worker
Tipo: worker_low_productivity
Condición: Eficiencia del worker en los últimos 7 días < 40% Y ha tenido al menos 3 servicios
Dedup key: worker_low_productivity:{workerId}:{semana_iso}
Prioridad: warning
Mensaje: "📉 {workerName} tiene una eficiencia del {efficiency}% en la última semana"
```

**7. Añadir configuración de alertas**

Extender la configuración de alertas existente para que el admin pueda activar/desactivar cada tipo y ajustar umbrales:

```typescript
cleaningWorkerAlerts: {
  noAssignment: { enabled: boolean };
  hoursExcess: { enabled: boolean; thresholdPercent: number };  // default 10
  absence: { enabled: boolean; graceMinutes: number };          // default 30
  docExpired: { enabled: boolean };
  docExpiring: { enabled: boolean; daysAhead: number };         // default 30
  lowProductivity: { enabled: boolean; thresholdPercent: number; minServices: number }; // default 40%, 3
}
```

#### Criterios de aceptación
- [x] Las 5 categorías de alertas se evalúan cada ciclo del alert engine (`checkCleaningWorkerAlerts`)
- [x] Solo se evalúan si `businessType === 'cleaning'` o existen workers de limpieza (return si no hay workers)
- [x] Dedup funciona: la misma alerta no se duplica en el mismo período (dedupKeys por worker/fecha/semana/doc)
- [x] Alertas se emiten por SSE y Web Push (vía `emitAlert` estándar del motor)
- [ ] Umbrales configurables por el admin — 10%, 30 min, 30 días y 40%/3 están hardcodeados
- [ ] Alerta de ausencia respeta gracia de 30 min (configurable) — gracia de 30 min fija, no configurable
- [x] Alerta de documentación cubre tanto caducados como próximos a caducar

---

### CW-08 — Vista del trabajador: Mi jornada y servicios

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** CW-01, CW-04

#### Contexto

El trabajador actualmente ve sus servicios en `WorkerTpvCleaning.tsx`, pero es una vista tipo TPV enfocada en cobro y checklist. Necesitamos una vista más completa donde el trabajador vea su jornada planificada, sus servicios del día con mapa de ubicaciones, su documentación básica (si se autoriza) y su historial.

#### Qué hacer

**1. Ampliar `WorkerTpvCleaning.tsx` o crear componente `WorkerCleaningDashboard`**

Añadir una vista "Mi jornada" accesible desde el home del trabajador (antes del TPV). Se monta cuando el worker tiene `cleaning_worker` vinculado por `teamMemberId`.

**2. Sección "Mi jornada de hoy"**

- Timeline vertical con los servicios del día ordenados por hora.
- Cada item del timeline muestra: hora, cliente, dirección, tipo de limpieza, duración estimada, estado.
- Estado visual: completado (check verde), en progreso (pulsante naranja), próximo (azul), pendiente (gris).
- Hora actual marcada con línea horizontal roja.
- Click en servicio → abre detalle inline (checklist, notas, botones de check-in/check-out).

**3. Mini mapa del día**

- Mapa con marcadores de las ubicaciones de los servicios del día.
- Línea conectando servicios en orden cronológico (ruta del día).
- Marcador diferente por estado (colores como el timeline).
- Click en marcador → scroll al servicio en el timeline.

Implementación: usar iframe de Google Maps con parámetros de waypoints o librería `leaflet` (más ligera, sin API key). Si se usa Maps: `https://www.google.com/maps/dir/?api=1&waypoints=...`.

**4. Resumen rápido del día**

Tarjetas en la parte superior:
- Servicios hoy: N total, N completados, N pendientes.
- Horas estimadas: suma de `duration` de servicios del día.
- Próximo servicio: nombre del cliente + hora + dirección (si hay).
- Ingresos del día: suma de `price` de servicios completados.

**5. Tab "Mi documentación" (opcional, controlado por permiso)**

- Si el gerente autoriza (`workerCanViewDocs: true` en configuración o en el documento del worker):
  - Lista de documentos propios (solo lectura): nombre, tipo, estado (vigente/caducado).
  - Alerta visual si algún documento está caducado: "Contacta con tu empresa para renovar".
- Si no autorizado: tab oculto.

**6. Tab "Mi historial"**

- Lista de servicios completados en los últimos 30 días.
- Resumen: total servicios, total horas, rating medio recibido.
- Cada item: fecha, cliente, duración, rating.

#### Criterios de aceptación
- [ ] Timeline de jornada muestra servicios del día ordenados por hora — `WorkerTpvCleaning.tsx` sigue siendo vista TPV, sin "Mi jornada"
- [ ] Hora actual visible como referencia en el timeline
- [ ] Mini mapa muestra ubicaciones de servicios con ruta
- [ ] Resumen rápido calcula en tiempo real
- [ ] Tab documentación respeta permiso del gerente
- [ ] Tab historial muestra últimos 30 días
- [ ] Funciona correctamente en modo worker (tras team login)
- [ ] Responsive: diseño optimizado para móvil (trabajador usa el teléfono)

---

### CW-09 — Conexiones: Equipo, Fichajes, Finanzas, Dashboard

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** CW-01, CW-05

#### Contexto

La página de trabajadores de limpieza necesita estar conectada con los módulos transversales existentes. Actualmente no hay ninguna conexión bidireccional.

#### Qué hacer

**1. Conexión con Equipo Core (`Team.tsx`)**

*En Team.tsx:*
- Si `businessType === 'cleaning'` y el miembro tiene `cleaningWorkerId` (campo nuevo en member object), mostrar badge "Trabajador limpieza" con enlace a la ficha del worker.
- En el detalle del miembro (`TeamMemberDetail`): sección "Limpieza" con link a la ficha y resumen rápido (servicios esta semana, horas, rating).

*En CleaningWorkers:*
- Al crear un worker, si se vincula con `teamMemberId`, guardar también `cleaningWorkerId` en el miembro del equipo (actualizar `business.members`).
- Al desvincular, limpiar la referencia bidireccional.

**2. Conexión con Fichajes (`Clockins.tsx`)**

*En pestaña "Rendimiento" de Clockins:*
- Si `businessType === 'cleaning'`: añadir columna "Servicios limpieza" al lado de las métricas de ventas.
- Para cada miembro con `cleaningWorkerId`: mostrar `completedServices` y `serviceHours` del período.
- Nuevo indicador: "Eficiencia servicio" = `serviceHours / clockedHours × 100`.

*Backend:*
- Extender `getPerformance` en `clockinsController.js` para que, si la DB de limpieza existe, cruce también con servicios de limpieza completados (no solo ventas).
- Añadir campos `cleaningServices`, `cleaningHours`, `cleaningEfficiency` a la respuesta.

**3. Conexión con Finanzas**

*Si existe módulo de finanzas:*
- Exponer `totalLaborCost` por período como categoría de gasto.
- Endpoint: `GET /api/cleaning/workers/:userId/labor-cost?from=&to=` devuelve coste laboral total y desglose por worker.
- Integrar como fuente de datos en el módulo de finanzas existente.

**4. Conexión con Dashboard (`Dashboard.tsx` / `GeneralDashboard.tsx`)**

*Widget "Personal limpieza" en Dashboard si `businessType === 'cleaning'`:*
- KPIs: trabajadores activos, servicios hoy, completados hoy, % eficiencia hoy.
- Alertas: nº de alertas activas de tipo `cleaning_worker`.
- Link "Ver equipo" → `/saas/cleaning-workers`.

*Backend:*
- Endpoint: `GET /api/cleaning/workers/:userId/dashboard-summary` — devuelve los 4 KPIs y count de alertas.
- Cacheado con TTL de 5 minutos para no sobrecargar.

**5. Conexión con Rutas (preparación futura)**

No implementar funcionalidad de rutas completa ahora. Solo preparar la infraestructura:
- Campo `routeOrder?: number` en `CleaningService` (orden del servicio en la ruta del día).
- Campo `estimatedTravelMinutes?: number` entre servicios.
- Placeholder en la vista de asignación (CW-04): "Ruta optimizada: próximamente".

#### Criterios de aceptación
- [ ] Badge "Trabajador limpieza" aparece en Team.tsx si el miembro está vinculado
- [ ] Fichajes muestra métricas de limpieza junto a ventas para negocios de limpieza
- [ ] Dashboard muestra widget de personal limpieza
- [ ] Endpoint de labor-cost devuelve coste laboral del período — no existe
- [ ] Dashboard-summary cacheable y liviano — no existe
- [x] Campos de ruta preparados en CleaningService (el módulo de rutas `cleaning_route` ya existe y va más allá)

---

### CW-10 — Permisos y control de acceso por perfil

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** CW-01, CW-02, CW-03, CW-08

#### Contexto

La especificación define dos perfiles de uso:
- **Gerente:** ve costes, rendimiento, asignaciones, documentación completa, puede editar todo.
- **Trabajador:** ve su jornada, sus servicios y su documentación básica (si se autoriza).

El sistema de roles ya existe (`ROLE_DEFINITIONS` en `couchdb.js`), pero no hay control granular para la vertical de limpieza.

#### Qué hacer

**1. Definir permisos específicos de limpieza**

Añadir a `TEAM_PERMISSION_KEYS` o al sistema de roles existente:

```typescript
const CLEANING_PERMISSIONS = {
  cleaning_workers_view: 'Ver lista de trabajadores',
  cleaning_workers_manage: 'Crear, editar y eliminar trabajadores',
  cleaning_workers_costs: 'Ver costes y datos económicos',
  cleaning_workers_docs: 'Gestionar documentación de trabajadores',
  cleaning_workers_assign: 'Asignar trabajadores a servicios',
  cleaning_workers_productivity: 'Ver panel de productividad',
  cleaning_worker_own_docs: 'Trabajador puede ver su propia documentación',
};
```

**2. Mapa de permisos por rol**

| Permiso | Admin | Gerente | Comercial | Trabajador |
|---|---|---|---|---|
| `cleaning_workers_view` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_workers_manage` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_workers_costs` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_workers_docs` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_workers_assign` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_workers_productivity` | ✅ | ✅ | ❌ | ❌ |
| `cleaning_worker_own_docs` | ✅ | ✅ | ❌ | ✅ (solo los suyos) |

**3. Backend: middleware de permisos**

En los endpoints de `cleaningRouter.js`:
- `GET /workers/:userId`: requiere `cleaning_workers_view`.
- `POST/PUT/DELETE /workers/:userId/:workerId`: requiere `cleaning_workers_manage`.
- `GET /workers/:userId/productivity`: requiere `cleaning_workers_productivity`.
- `GET /workers/:userId/:workerId/stats`: requiere `cleaning_workers_view` O ser el propio worker (check `teamMemberId === req.user.memberId`).

**4. Frontend: control de visibilidad**

- En `CleaningWorkers.tsx`: si no tiene `cleaning_workers_view`, redirigir o mostrar "Sin permisos".
- En `CleaningWorkerDetail`: ocultar tab "Productividad" si no tiene `cleaning_workers_productivity`. Ocultar coste/hora si no tiene `cleaning_workers_costs`. Ocultar botones de edición si no tiene `cleaning_workers_manage`.
- En `WorkerCleaningDashboard` (vista trabajador): mostrar solo sus datos. Tab documentación solo si `cleaning_worker_own_docs`.
- En sidebar: ocultar `cleaning-workers` si no tiene ningún permiso de limpieza de workers.

**5. Configuración de "worker puede ver docs"**

Añadir campo al `cleaning_worker`:
```typescript
workerPermissions: {
  canViewOwnDocs: boolean;      // default false
  canViewOwnStats: boolean;     // default false
  canViewOwnSchedule: boolean;  // default true
}
```

Editable por el gerente desde la ficha del trabajador (CW-03, sección "Permisos").

#### Criterios de aceptación
- [ ] Endpoints protegidos por permisos específicos de limpieza — las claves `cleaning_workers_*` no existen
- [x] Gerente ve todo: costes, productividad, documentación, asignaciones (la ruta está protegida con `RequireBusinessOwner`)
- [ ] Trabajador solo ve su jornada y sus servicios
- [ ] Tab documentación del worker respeta `canViewOwnDocs` — el campo `workerPermissions` existe en el modelo pero no se usa en UI
- [ ] Sidebar oculta `cleaning-workers` para roles sin permiso
- [ ] Un trabajador no puede ver datos de otro trabajador
- [ ] Permisos integrados con sistema de roles existente (`ROLE_DEFINITIONS`)

---

## Resumen de dependencias

```
CW-01  Modelo de datos (bloquea todo)
  ├── CW-02  Lista de trabajadores
  │     ├── CW-03  Ficha completa (drawer)
  │     └── CW-06  Panel de productividad
  ├── CW-04  Asignación diaria
  │     └── CW-08  Vista trabajador
  ├── CW-05  Automatización (cálculos)
  │     ├── CW-06  Panel de productividad
  │     ├── CW-07  Alertas
  │     └── CW-09  Conexiones
  ├── CW-07  Alertas en alert engine
  ├── CW-09  Conexiones (equipo, fichajes, finanzas, dashboard)
  └── CW-10  Permisos y acceso
```

---

## Orden de implementación recomendado

### Fase 1 — Fundación (backend + estructura) — ~16-20h
1. **CW-01** — Modelo de datos y CRUD backend (~8-10h)
2. **CW-02** — Página lista de trabajadores (~8-10h)

### Fase 2 — Gestión del trabajador — ~14-18h
3. **CW-03** — Ficha completa del trabajador (~8-10h)
4. **CW-04** — Asignación diaria (~6-8h)

### Fase 3 — Inteligencia operativa — ~16-20h
5. **CW-05** — Automatización de cálculos (~8-10h)
6. **CW-06** — Panel de productividad (~8-10h)

### Fase 4 — Alertas, permisos y conexiones — ~14-18h
7. **CW-07** — Alertas en motor (~4-6h)
8. **CW-10** — Permisos por perfil (~4-6h)
9. **CW-08** — Vista del trabajador (~4-6h)
10. **CW-09** — Conexiones con otros módulos (~4-6h)

**Total estimado: ~60-76 horas**

---

## Notas técnicas

- **DB:** Todos los documentos de workers van en la misma DB `*-cleaning` (junto con los servicios). No se crea DB nueva.
- **Prefijo IDs:** `clwk-{uuid}` para workers (evita colisiones con `csvc-{uuid}` de servicios).
- **Sin migraciones:** CouchDB no requiere migraciones. Servicios existentes sin `workerId` siguen funcionando (lectura de `assignedToName` como fallback).
- **Retrocompatibilidad:** El campo `assignedToName` se mantiene siempre actualizado al asignar un worker, para que vistas antiguas no se rompan.
- **i18n:** Todas las cadenas de UI deben pasar por `t()` (i18next). Preparar claves para es, en, pt, fr.
- **Permisos:** Integrar con `ROLE_DEFINITIONS` y `TEAM_PERMISSION_KEYS` existentes en `couchdb.js`.
- **Patrón de referencia:** La implementación debe seguir de cerca el patrón de `construction_worker` (CouchDB builder/sanitizer → controller CRUD → router → API client → página React), adaptando los campos al dominio de limpieza.
- **Testing:** Cada endpoint CRUD debe tener tests mínimos con Vitest (pattern en `package.json`).
- **Catálogo:** Las especializaciones del worker pueden alimentarse desde las categorías de `verticalCatalog.js` → `cleaning.categories`.
