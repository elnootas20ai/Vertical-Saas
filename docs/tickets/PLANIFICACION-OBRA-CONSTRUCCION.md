# PLANIFICACIÓN DE OBRA (Construcción) — Plan de Tickets

**Página:** `/saas/construction-planning`
**URL pública:** `https://udaredge.com/saas/vertical/construccion/planificacion`
**Objetivo:** Organizar trabajadores, fechas, materiales, maquinaria y subcontratas de cada obra en una vista calendario y tabla con automatizaciones, alertas y diferenciación gerente/trabajador.
**Tipo:** Módulo dentro de la vertical Construcción.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de obras con estado (`planificación`, `en_obra`, `pausada`, `finalizada`), fechas inicio/fin, progreso | Completo | `constructionRouter.js` → tipo `construction_project` |
| Modelo `construction_project` con `fechaInicio`, `fechaFinPrevista`, `estado`, `progreso`, `horasEstimadas`, `horasAcumuladas`, `costeAcumulado` | Completo | `couchdb.js` → `buildConstructionProjectDocument` |
| CRUD de trabajadores con obra asignada, gremio, activo | Completo | `constructionRouter.js` → tipo `construction_worker` (`cwrk-*`) |
| CRUD de tareas de obra con trabajador, gremio, prioridad, estado, fechaLimite, fotos | Completo | `constructionRouter.js` → tipo `construction_task` (`ctsk-*`) |
| CRUD de gremios/subcontratas con precios (materiales, mano de obra, estructural) | Completo | `constructionRouter.js` → tipo `construction_guild` (`cgld-*`) |
| Presupuestos con partidas por gremio y control de pagos | Completo | `constructionRouter.js` → tipo `construction_budget` (`cbud-*`) |
| Sistema de fichajes genérico (`clockins`) con geolocalización y estadísticas | Completo | `clockinsRouter.js`, `clockinsController.js` |
| Horarios y vacaciones con plantillas, reglas de asignación, conflictos, bloques de disponibilidad | Completo | `SchedulesVacations.tsx`, `schedulesApi.ts`, `vacationsApi.ts`, `availabilityBlocksApi.ts` |
| Pedidos de compra y stock (`purchase-orders`) | Completo | `purchaseOrderRouter.js` |
| Catálogo vertical construcción (material de construcción, categorías, unidades m²/m³) | Completo | `verticalCatalog.js` → clave `construction` |
| Motor de alertas (estructura genérica) | Parcial | `alertConstants.js` — no integra planificación de obra |
| Partes diarios (`construction_daily_report`) con CRUD, envío, validación | Completo | `constructionRouter.js`, `constructionApi.ts` |
| Incidencias de obra (`construction_incident`) con CRUD y resolución | Completo | `constructionRouter.js`, `constructionApi.ts` |
| Maquinaria (`ConstructionMachinery.tsx`) | Solo UI local | Sin backend, sin `userId`, estado mock |
| Materiales (`ConstructionMaterials.tsx`) | Solo UI local | Sin backend, inventario mock |
| Documentación/Planos (`ConstructionPlans.tsx`) | Solo UI local | Sin backend, docs mock |
| Sidebar grupo Construcción | Completo | `Sidebar.tsx` — 6 items (proyectos, presupuestos, maquinaria, materiales, subcontratistas, planos) |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| **Entidad `construction_planning_entry` (asignación de recurso a obra con fechas)** | No existe |
| **Entidad `construction_milestone` (hito/fecha clave de obra)** | No existe |
| **Entidad `construction_material_need` (necesidad de material previsto por fecha)** | No existe |
| API REST para entradas de planificación (CRUD + filtros por obra/recurso/fecha) | No existe |
| API REST para hitos de obra (CRUD + filtros por obra/estado) | No existe |
| API REST para necesidades de material (CRUD + filtros + vinculación con compras) | No existe |
| Endpoint de datos agregados de planificación (calendario + tabla) | No existe |
| Página `/saas/construction-planning` con vistas calendario y tabla | No existe |
| Vista calendario con asignaciones de trabajadores, maquinaria y subcontratas | No existe |
| Vista tabla con todas las asignaciones y filtros avanzados | No existe |
| Drawer/modal de creación/edición de asignación planificada | No existe |
| Panel de hitos y fechas clave por obra | No existe |
| Panel de maquinaria asignada con disponibilidad | No existe |
| Panel de materiales previstos con estado de solicitud | No existe |
| Panel de subcontratas con confirmación de disponibilidad | No existe |
| Notas de gerencia y documentación interna vinculada a planificación | No existe |
| Automatización: asignar trabajadores y recursos | No existe |
| Automatización: bloquear conflictos de horario (recurso ya asignado a otra obra) | No existe |
| Automatización: avisar cambios de planificación a afectados | No existe |
| Automatización: activar próximas tareas al completar la anterior | No existe |
| Automatización: preparar necesidades de material con antelación | No existe |
| Alerta: obra sin planificar (en estado `planificación` sin entradas) | No existe |
| Alerta: trabajador no asignado a ninguna obra activa | No existe |
| Alerta: conflicto de fechas (mismo recurso solapado en dos obras) | No existe |
| Alerta: material no previsto (obra en curso sin necesidades de material registradas) | No existe |
| Alerta: subcontrata pendiente de confirmar | No existe |
| Diferenciación gerente (planifica/reasigna/controla) vs trabajador (consulta su planificación) | No existe |
| Conexiones con Obras, Equipo, Horarios y Vacaciones, Compras y Stock, Documentación, Dashboard | No existe |
| Ruta `/saas/construction-planning` en `routes.tsx` | No existe |
| Item `construction-planning` en Sidebar | No existe |

---

## Tickets

---

### PO-01 — Modelo de datos: Entrada de planificación

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

No existe una entidad para asignar recursos (trabajadores, maquinaria, subcontratas) a una obra con fechas concretas. Actualmente `construction_task` captura tareas con fecha límite, pero no tiene concepto de "bloque de planificación" con rango de fechas, horario, recurso asignado, tipo de recurso y estado de confirmación. `construction_worker` tiene `obraAsignada`, pero solo permite una obra y no gestiona fechas ni horarios. Necesitamos `construction_planning_entry` como documento de primer nivel en la DB `*-construction`.

#### Qué hacer

**1. Definir builder en `services/couchdb.js` (sección CONSTRUCTION)**

```javascript
export function buildConstructionPlanningEntryDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cple-${uuidv4()}`;
  const ref = existing?.referencia || `PLAN-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_planning_entry',
    id,
    user_id: userId,

    // ── Identificación ──
    referencia: ref,

    // ── Obra ──
    obraId:     String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),

    // ── Recurso asignado ──
    tipoRecurso: String(data.tipoRecurso || existing?.tipoRecurso || 'trabajador'),
    // 'trabajador' | 'subcontrata' | 'maquinaria'
    recursoId:     String(data.recursoId || existing?.recursoId || ''),
    recursoNombre: String(data.recursoNombre || existing?.recursoNombre || ''),
    gremio:        String(data.gremio || existing?.gremio || ''),

    // ── Tarea vinculada (opcional) ──
    tareaId:     String(data.tareaId || existing?.tareaId || ''),
    tareaNombre: String(data.tareaNombre || existing?.tareaNombre || ''),

    // ── Fechas y horario ──
    fechaInicio:  String(data.fechaInicio || existing?.fechaInicio || ''),
    fechaFin:     String(data.fechaFin || existing?.fechaFin || ''),
    horaInicio:   String(data.horaInicio || existing?.horaInicio || '08:00'),
    horaFin:      String(data.horaFin || existing?.horaFin || '17:00'),
    todoElDia:    Boolean(data.todoElDia ?? existing?.todoElDia ?? false),
    diasSemana:   Array.isArray(data.diasSemana) ? data.diasSemana : (existing?.diasSemana || [1, 2, 3, 4, 5]),
    // [0=dom, 1=lun, 2=mar, 3=mie, 4=jue, 5=vie, 6=sab]

    // ── Detalle ──
    descripcion: String(data.descripcion || existing?.descripcion || ''),
    prioridad:   String(data.prioridad || existing?.prioridad || 'media'),
    // 'baja' | 'media' | 'alta' | 'urgente'
    color:       String(data.color || existing?.color || ''),

    // ── Materiales necesarios para esta asignación ──
    materialesPrevistos: Array.isArray(data.materialesPrevistos) ? data.materialesPrevistos : (existing?.materialesPrevistos || []),
    // Cada elemento: { materialId, nombre, cantidad, unidad, fechaNecesaria, estado }

    // ── Estado ──
    estado: String(data.estado || existing?.estado || 'planificado'),
    // 'planificado' | 'confirmado' | 'en_curso' | 'completado' | 'cancelado'

    // ── Confirmación (subcontratas) ──
    requiereConfirmacion: Boolean(data.requiereConfirmacion ?? existing?.requiereConfirmacion ?? false),
    confirmado:           Boolean(data.confirmado ?? existing?.confirmado ?? false),
    confirmadoAt:         String(data.confirmadoAt || existing?.confirmadoAt || ''),
    confirmadoPor:        String(data.confirmadoPor || existing?.confirmadoPor || ''),

    // ── Responsable (gerente que planifica) ──
    responsableId:     String(data.responsableId || existing?.responsableId || ''),
    responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),

    // ── Notas ──
    notas:         String(data.notas || existing?.notas || ''),
    notasGerencia: String(data.notasGerencia || existing?.notasGerencia || ''),

    // ── Repetición (opcional para asignaciones recurrentes) ──
    esRecurrente:  Boolean(data.esRecurrente ?? existing?.esRecurrente ?? false),
    reglaRecurrencia: data.esRecurrente ? {
      tipo:       String(data.reglaRecurrencia?.tipo || existing?.reglaRecurrencia?.tipo || 'semanal'),
      // 'diaria' | 'semanal' | 'quincenal' | 'mensual'
      intervalo:  Number(data.reglaRecurrencia?.intervalo ?? existing?.reglaRecurrencia?.intervalo ?? 1),
      finRepeticion: String(data.reglaRecurrencia?.finRepeticion || existing?.reglaRecurrencia?.finRepeticion || ''),
    } : (existing?.reglaRecurrencia || null),

    // ── Conflictos detectados ──
    conflictos: Array.isArray(data.conflictos) ? data.conflictos : (existing?.conflictos || []),
    // Cada elemento: { tipo, mensaje, entryId, obraNombre, fechas }

    // ── Auditoría ──
    historial: Array.isArray(data.historial) ? data.historial : (existing?.historial || []),
    // Cada elemento: { accion, usuario, fecha, detalle }
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Crear `sanitizeConstructionPlanningEntry` junto al builder** con los mismos campos y defaults.

**3. Añadir tipos TypeScript en `src/app/lib/constructionApi.ts`**

```typescript
export interface PlanningMaterialPrevisto {
  materialId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  fechaNecesaria: string;
  estado: 'previsto' | 'solicitado' | 'recibido';
}

export interface PlanningConflicto {
  tipo: 'solapamiento_trabajador' | 'solapamiento_maquinaria' | 'solapamiento_subcontrata' | 'vacaciones' | 'festivo';
  mensaje: string;
  entryId: string;
  obraNombre: string;
  fechas: string;
}

export interface PlanningReglaRecurrencia {
  tipo: 'diaria' | 'semanal' | 'quincenal' | 'mensual';
  intervalo: number;
  finRepeticion: string;
}

export interface PlanningHistorial {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionPlanningEntry {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;

  obraId: string;
  obraNombre: string;

  tipoRecurso: 'trabajador' | 'subcontrata' | 'maquinaria';
  recursoId: string;
  recursoNombre: string;
  gremio: string;

  tareaId: string;
  tareaNombre: string;

  fechaInicio: string;
  fechaFin: string;
  horaInicio: string;
  horaFin: string;
  todoElDia: boolean;
  diasSemana: number[];

  descripcion: string;
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';
  color: string;

  materialesPrevistos: PlanningMaterialPrevisto[];

  estado: 'planificado' | 'confirmado' | 'en_curso' | 'completado' | 'cancelado';

  requiereConfirmacion: boolean;
  confirmado: boolean;
  confirmadoAt: string;
  confirmadoPor: string;

  responsableId: string;
  responsableNombre: string;

  notas: string;
  notasGerencia: string;

  esRecurrente: boolean;
  reglaRecurrencia: PlanningReglaRecurrencia | null;

  conflictos: PlanningConflicto[];

  historial: PlanningHistorial[];
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento en CouchDB con `type: 'construction_planning_entry'` y prefijo `cple-`
- [ ] `referencia` auto-generada (`PLAN-XXXXXX`)
- [ ] `tipoRecurso` soporta tres tipos: `trabajador`, `subcontrata`, `maquinaria`
- [ ] Rango de fechas (`fechaInicio` / `fechaFin`) + horario (`horaInicio` / `horaFin`) + días de la semana
- [ ] Materiales previstos como array embebido con estado por material
- [ ] Soporte para recurrencia (semanal, quincenal, mensual)
- [ ] Conflictos detectados almacenados como array
- [ ] Historial de acciones como array embebido
- [ ] Estado con flujo `planificado → confirmado → en_curso → completado`
- [ ] Confirmación específica para subcontratas (`requiereConfirmacion`, `confirmado`)
- [ ] Tipo TS completo exportado desde `constructionApi.ts`

---

### PO-02 — Modelo de datos: Hito de obra

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto

Las obras necesitan fechas clave (inicio de fase, entrega parcial, inspección, recepción de material, entrega final, etc.) que se muestran en el calendario y sirven como referencia temporal para planificar asignaciones. Actualmente `construction_project` solo tiene `fechaInicio` y `fechaFinPrevista`, pero no hitos intermedios. Necesitamos `construction_milestone` como entidad independiente vinculada a la obra.

#### Qué hacer

**1. Builder en `services/couchdb.js`**

```javascript
export function buildConstructionMilestoneDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cmst-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_milestone',
    id,
    user_id: userId,

    obraId:     String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),

    nombre:      String(data.nombre || existing?.nombre || ''),
    descripcion: String(data.descripcion || existing?.descripcion || ''),

    tipo: String(data.tipo || existing?.tipo || 'otro'),
    // 'inicio_obra' | 'fin_fase' | 'entrega_parcial' | 'recepcion_material' | 'inspeccion' | 'permiso' | 'entrega_final' | 'otro'

    fecha:           String(data.fecha || existing?.fecha || ''),
    fechaReal:       String(data.fechaReal || existing?.fechaReal || ''),
    fechaOriginal:   String(data.fechaOriginal || existing?.fechaOriginal || ''),

    estado: String(data.estado || existing?.estado || 'pendiente'),
    // 'pendiente' | 'cumplido' | 'retrasado' | 'cancelado'

    responsableId:     String(data.responsableId || existing?.responsableId || ''),
    responsableNombre: String(data.responsableNombre || existing?.responsableNombre || ''),

    diasRetraso:     Number(data.diasRetraso ?? existing?.diasRetraso ?? 0),
    motivoRetraso:   String(data.motivoRetraso || existing?.motivoRetraso || ''),

    dependeDe:       String(data.dependeDe || existing?.dependeDe || ''),
    // ID de otro milestone del que depende (cadena de hitos)
    dependeDeNombre: String(data.dependeDeNombre || existing?.dependeDeNombre || ''),

    documentos: Array.isArray(data.documentos) ? data.documentos : (existing?.documentos || []),
    // Cada elemento: { id, nombre, url, base64, mimeType, fecha }

    notas:    String(data.notas || existing?.notas || ''),
    color:    String(data.color || existing?.color || ''),
    icono:    String(data.icono || existing?.icono || ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Tipo TS en `constructionApi.ts`**

```typescript
export interface MilestoneDocumento {
  id: string;
  nombre: string;
  url: string;
  base64: string;
  mimeType: string;
  fecha: string;
}

export interface ConstructionMilestone {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;

  obraId: string;
  obraNombre: string;

  nombre: string;
  descripcion: string;

  tipo: 'inicio_obra' | 'fin_fase' | 'entrega_parcial' | 'recepcion_material' | 'inspeccion' | 'permiso' | 'entrega_final' | 'otro';

  fecha: string;
  fechaReal: string;
  fechaOriginal: string;

  estado: 'pendiente' | 'cumplido' | 'retrasado' | 'cancelado';

  responsableId: string;
  responsableNombre: string;

  diasRetraso: number;
  motivoRetraso: string;

  dependeDe: string;
  dependeDeNombre: string;

  documentos: MilestoneDocumento[];

  notas: string;
  color: string;
  icono: string;

  createdAt: string;
  updatedAt: string;
}
```

**3. Auto-generación de hitos base al crear obra**

Al crear un `construction_project`, generar hitos por defecto según tipo de obra:

| Tipo obra | Hitos auto-generados |
|---|---|
| casa / promoción | inicio_obra, fin_fase (cimentación), fin_fase (estructura), fin_fase (cerramientos), fin_fase (instalaciones), fin_fase (acabados), inspeccion, entrega_final |
| piso / reforma | inicio_obra, fin_fase (demolición), fin_fase (instalaciones), fin_fase (acabados), inspeccion, entrega_final |
| local / oficina | inicio_obra, fin_fase (adecuación), fin_fase (instalaciones), fin_fase (acabados), entrega_final |
| colegio / gimnasio | inicio_obra, permiso, fin_fase (estructura), fin_fase (instalaciones), inspeccion, entrega_final |

Fechas: distribuir proporcionalmente entre `fechaInicio` y `fechaFinPrevista` del proyecto.

#### Criterios de aceptación

- [ ] Documento con `type: 'construction_milestone'`, prefijo `cmst-`
- [ ] 8 tipos de hito: inicio_obra, fin_fase, entrega_parcial, recepcion_material, inspeccion, permiso, entrega_final, otro
- [ ] 4 estados: pendiente, cumplido, retrasado, cancelado
- [ ] Fechas: prevista (`fecha`), real (`fechaReal`), original (`fechaOriginal`) para trackear retrasos
- [ ] Dependencia entre hitos (`dependeDe` → id de otro milestone)
- [ ] `diasRetraso` calculado automáticamente: `max(0, hoy - fecha)` si `estado !== 'cumplido'`
- [ ] Documentos adjuntos (actas, certificados, etc.)
- [ ] Auto-generación de hitos base al crear obra según tipo
- [ ] Tipo TS exportado

---

### PO-03 — Modelo de datos: Necesidad de material

**Tipo:** Backend (CouchDB + API Client TS)
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto

La planificación de obra requiere anticipar qué materiales se necesitan, en qué cantidad y para qué fecha. Actualmente `construction_materials` es solo una UI local sin backend, y los partes diarios registran materiales consumidos _a posteriori_ pero no _previstos_. Necesitamos `construction_material_need` para:
1. El gerente prevea materiales por obra y fecha
2. Se vincule automáticamente a pedidos de compra (`purchase_order`)
3. Se crucen con el stock disponible del catálogo
4. Se muestren en el calendario de planificación

#### Qué hacer

**1. Builder en `services/couchdb.js`**

```javascript
export function buildConstructionMaterialNeedDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `cmnd-${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'construction_material_need',
    id,
    user_id: userId,

    obraId:     String(data.obraId || existing?.obraId || ''),
    obraNombre: String(data.obraNombre || existing?.obraNombre || ''),

    planningEntryId: String(data.planningEntryId || existing?.planningEntryId || ''),

    materialId:     String(data.materialId || existing?.materialId || ''),
    materialNombre: String(data.materialNombre || existing?.materialNombre || ''),
    categoria:      String(data.categoria || existing?.categoria || ''),

    cantidad:       Number(data.cantidad ?? existing?.cantidad ?? 0),
    unidad:         String(data.unidad || existing?.unidad || 'unidades'),
    costeEstimado:  Number(data.costeEstimado ?? existing?.costeEstimado ?? 0),

    fechaNecesaria: String(data.fechaNecesaria || existing?.fechaNecesaria || ''),
    fechaSolicitud: String(data.fechaSolicitud || existing?.fechaSolicitud || ''),
    fechaRecepcion: String(data.fechaRecepcion || existing?.fechaRecepcion || ''),

    estado: String(data.estado || existing?.estado || 'previsto'),
    // 'previsto' | 'solicitado' | 'pedido' | 'recibido' | 'cancelado'

    pedidoCompraId: String(data.pedidoCompraId || existing?.pedidoCompraId || ''),
    proveedorId:    String(data.proveedorId || existing?.proveedorId || ''),
    proveedorNombre: String(data.proveedorNombre || existing?.proveedorNombre || ''),

    stockDisponible: Number(data.stockDisponible ?? existing?.stockDisponible ?? 0),
    requiereCompra:  Boolean(data.requiereCompra ?? existing?.requiereCompra ?? true),

    notas: String(data.notas || existing?.notas || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}
```

**2. Tipo TS en `constructionApi.ts`**

```typescript
export interface ConstructionMaterialNeed {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;

  obraId: string;
  obraNombre: string;
  planningEntryId: string;

  materialId: string;
  materialNombre: string;
  categoria: string;

  cantidad: number;
  unidad: string;
  costeEstimado: number;

  fechaNecesaria: string;
  fechaSolicitud: string;
  fechaRecepcion: string;

  estado: 'previsto' | 'solicitado' | 'pedido' | 'recibido' | 'cancelado';

  pedidoCompraId: string;
  proveedorId: string;
  proveedorNombre: string;

  stockDisponible: number;
  requiereCompra: boolean;

  notas: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Criterios de aceptación

- [ ] Documento con `type: 'construction_material_need'`, prefijo `cmnd-`
- [ ] Vinculación a obra (`obraId`) y opcionalmente a entrada de planificación (`planningEntryId`)
- [ ] 5 estados: previsto, solicitado, pedido, recibido, cancelado
- [ ] Fecha necesaria para el calendario + fecha de solicitud y recepción real
- [ ] Vinculación con pedido de compra (`pedidoCompraId`) y proveedor
- [ ] Campo `stockDisponible` para cruce automático con catálogo
- [ ] Flag `requiereCompra` calculable: `cantidad > stockDisponible`
- [ ] Tipo TS exportado

---

### PO-04 — API REST: CRUD de entradas de planificación

**Tipo:** Backend (Router + Controller)
**Prioridad:** Crítica
**Dependencias:** PO-01

#### Contexto

Endpoints REST bajo `/api/construction/planning/:userId` siguiendo el mismo patrón del router existente. Los filtros por obra, tipo de recurso, recurso concreto y rango de fechas son esenciales para alimentar tanto la vista calendario como la vista tabla.

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listPlanningEntries(req, res)` | Leer todos los docs `type === 'construction_planning_entry'` del usuario. Soportar `query.projectId`, `query.tipoRecurso`, `query.recursoId`, `query.estado`, `query.dateFrom`, `query.dateTo` para filtrar. Devolver `{ ok: true, entries: [...] }` |
| `createPlanningEntry(req, res)` | `buildConstructionPlanningEntryDocument(userId, req.body.entry)`. **Antes de guardar: ejecutar detección de conflictos (PO-08).** Añadir al historial: `{ accion: 'creado', usuario, fecha }`. Devolver `{ ok: true, entry }` |
| `updatePlanningEntry(req, res)` | Obtener existente, merge con `buildConstructionPlanningEntryDocument(userId, data, existing)`. **Re-ejecutar detección de conflictos.** Añadir al historial: `{ accion: 'editado', usuario, fecha, detalle }`. Devolver `{ ok: true, entry }` |
| `removePlanningEntry(req, res)` | Solo si `estado === 'planificado'` o `estado === 'cancelado'`. Si está `confirmado` o `en_curso`, devolver 403. |

**2. Endpoints especiales**

| Función | Endpoint | Lógica |
|---|---|---|
| `confirmPlanningEntry` | `POST .../planning/:userId/:id/confirm` | Cambiar `estado` a `confirmado`. Guardar `confirmado: true`, `confirmadoAt`, `confirmadoPor`. Añadir historial. |
| `startPlanningEntry` | `POST .../planning/:userId/:id/start` | Cambiar `estado` a `en_curso`. Validar que `fechaInicio <= hoy`. Si tiene `tareaId`, cambiar la tarea a `en_progreso`. Añadir historial. |
| `completePlanningEntry` | `POST .../planning/:userId/:id/complete` | Cambiar `estado` a `completado`. Si tiene `tareaId`, actualizar progreso de la tarea. **Activar siguiente planificación si hay cadena (PO-08).** Añadir historial. |
| `cancelPlanningEntry` | `POST .../planning/:userId/:id/cancel` | Cambiar `estado` a `cancelado`. Liberar recurso. Añadir historial. |
| `duplicatePlanningEntry` | `POST .../planning/:userId/:id/duplicate` | Copiar la entrada con nuevas fechas (shift temporal). Generar nuevo ID y referencia. Estado: `planificado`. |

**3. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/planning/:userId', listPlanningEntries);
constructionRouter.post('/planning/:userId', createPlanningEntry);
constructionRouter.put('/planning/:userId/:id', updatePlanningEntry);
constructionRouter.delete('/planning/:userId/:id', removePlanningEntry);
constructionRouter.post('/planning/:userId/:id/confirm', confirmPlanningEntry);
constructionRouter.post('/planning/:userId/:id/start', startPlanningEntry);
constructionRouter.post('/planning/:userId/:id/complete', completePlanningEntry);
constructionRouter.post('/planning/:userId/:id/cancel', cancelPlanningEntry);
constructionRouter.post('/planning/:userId/:id/duplicate', duplicatePlanningEntry);
```

**4. Funciones en `constructionApi.ts`**

```typescript
export async function listPlanningEntries(
  userId: string,
  filters?: { projectId?: string; tipoRecurso?: string; recursoId?: string; estado?: string; dateFrom?: string; dateTo?: string }
): Promise<ConstructionPlanningEntry[]>;

export async function createPlanningEntry(userId: string, data: Partial<ConstructionPlanningEntry>): Promise<ConstructionPlanningEntry>;
export async function updatePlanningEntry(userId: string, entry: ConstructionPlanningEntry): Promise<ConstructionPlanningEntry>;
export async function deletePlanningEntry(userId: string, entryId: string): Promise<void>;
export async function confirmPlanningEntry(userId: string, entryId: string, confirmadoPor: string): Promise<ConstructionPlanningEntry>;
export async function startPlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry>;
export async function completePlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry>;
export async function cancelPlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry>;
export async function duplicatePlanningEntry(userId: string, entryId: string, newDates: { fechaInicio: string; fechaFin: string }): Promise<ConstructionPlanningEntry>;
```

#### Criterios de aceptación

- [ ] CRUD completo en `/api/construction/planning/:userId`
- [ ] Filtros por `projectId`, `tipoRecurso`, `recursoId`, `estado`, `dateFrom`, `dateTo` (query params)
- [ ] Detección de conflictos al crear/editar (almacenados en campo `conflictos`)
- [ ] Borrar solo en estado `planificado` o `cancelado`
- [ ] Endpoints confirm/start/complete/cancel con transiciones de estado y registro de historial
- [ ] Endpoint duplicate para copiar entradas con fechas desplazadas
- [ ] Funciones tipadas en `constructionApi.ts`

---

### PO-05 — API REST: CRUD de hitos de obra

**Tipo:** Backend (Router + Controller)
**Prioridad:** Alta
**Dependencias:** PO-02

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listMilestones(req, res)` | Leer `type === 'construction_milestone'`. Filtrar por `query.projectId`, `query.estado`, `query.tipo`. Calcular `diasRetraso` en vuelo: si `estado !== 'cumplido'` y `fecha < hoy`, `diasRetraso = diffDays(hoy, fecha)`. Devolver `{ ok: true, milestones: [...] }` |
| `createMilestone(req, res)` | `buildConstructionMilestoneDocument(userId, req.body.milestone)`. Guardar `fechaOriginal = fecha` (primera vez). |
| `updateMilestone(req, res)` | Merge. Si `fecha` cambia y es diferente de `fechaOriginal`, registrar como retraso. |
| `completeMilestone` | `POST .../milestones/:userId/:id/complete` | Cambiar `estado` a `cumplido`, guardar `fechaReal = hoy`. Si tiene `dependeDe`, buscar hitos dependientes y notificar. |
| `removeMilestone(req, res)` | Solo si `estado === 'pendiente'`. |

**2. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/milestones/:userId', listMilestones);
constructionRouter.post('/milestones/:userId', createMilestone);
constructionRouter.put('/milestones/:userId/:id', updateMilestone);
constructionRouter.post('/milestones/:userId/:id/complete', completeMilestone);
constructionRouter.delete('/milestones/:userId/:id', removeMilestone);
```

**3. Funciones tipadas en `constructionApi.ts`**

```typescript
export async function listMilestones(userId: string, filters?: { projectId?: string; estado?: string; tipo?: string }): Promise<ConstructionMilestone[]>;
export async function createMilestone(userId: string, data: Partial<ConstructionMilestone>): Promise<ConstructionMilestone>;
export async function updateMilestone(userId: string, milestone: ConstructionMilestone): Promise<ConstructionMilestone>;
export async function completeMilestone(userId: string, milestoneId: string): Promise<ConstructionMilestone>;
export async function deleteMilestone(userId: string, milestoneId: string): Promise<void>;
```

#### Criterios de aceptación

- [ ] CRUD en `/api/construction/milestones/:userId`
- [ ] Filtros por obra, estado y tipo
- [ ] `diasRetraso` calculado dinámicamente en el listado
- [ ] `fechaOriginal` se preserva para trackear cambios de fecha
- [ ] Al completar un hito, se guarda `fechaReal` y se notifican dependientes
- [ ] Solo borrable en estado `pendiente`
- [ ] Funciones tipadas en client TS

---

### PO-06 — API REST: CRUD de necesidades de material

**Tipo:** Backend (Router + Controller)
**Prioridad:** Alta
**Dependencias:** PO-03

#### Qué hacer

**1. Añadir al `constructionController.js`**

| Función | Lógica |
|---|---|
| `listMaterialNeeds(req, res)` | Leer `type === 'construction_material_need'`. Filtrar por `query.projectId`, `query.estado`, `query.dateFrom`, `query.dateTo`. **Enriquecer con stock actual**: para cada material, consultar artículo en DB de catálogo y escribir `stockDisponible`. Calcular `requiereCompra = cantidad > stockDisponible`. Devolver `{ ok: true, needs: [...] }` |
| `createMaterialNeed(req, res)` | `buildConstructionMaterialNeedDocument(userId, req.body.need)`. Buscar stock actual y rellenar `stockDisponible`/`requiereCompra`. |
| `updateMaterialNeed(req, res)` | Merge estándar. Recalcular stock. |
| `removeMaterialNeed(req, res)` | Solo si `estado === 'previsto'`. |
| `requestMaterialNeed` | `POST .../material-needs/:userId/:id/request` | Cambiar `estado` a `solicitado`. Guardar `fechaSolicitud = hoy`. Si hay proveedor preferente en catálogo, prerellenar `proveedorId`/`proveedorNombre`. |

**2. Registrar en `constructionRouter.js`**

```javascript
constructionRouter.get('/material-needs/:userId', listMaterialNeeds);
constructionRouter.post('/material-needs/:userId', createMaterialNeed);
constructionRouter.put('/material-needs/:userId/:id', updateMaterialNeed);
constructionRouter.delete('/material-needs/:userId/:id', removeMaterialNeed);
constructionRouter.post('/material-needs/:userId/:id/request', requestMaterialNeed);
```

**3. Funciones tipadas en `constructionApi.ts`**

```typescript
export async function listMaterialNeeds(userId: string, filters?: { projectId?: string; estado?: string; dateFrom?: string; dateTo?: string }): Promise<ConstructionMaterialNeed[]>;
export async function createMaterialNeed(userId: string, data: Partial<ConstructionMaterialNeed>): Promise<ConstructionMaterialNeed>;
export async function updateMaterialNeed(userId: string, need: ConstructionMaterialNeed): Promise<ConstructionMaterialNeed>;
export async function deleteMaterialNeed(userId: string, needId: string): Promise<void>;
export async function requestMaterialNeed(userId: string, needId: string): Promise<ConstructionMaterialNeed>;
```

#### Criterios de aceptación

- [ ] CRUD en `/api/construction/material-needs/:userId`
- [ ] Filtros por obra, estado y rango de fechas
- [ ] Stock disponible enriquecido desde catálogo en cada consulta
- [ ] `requiereCompra` calculado automáticamente
- [ ] Endpoint `request` para marcar como solicitado con fecha
- [ ] Solo borrable en estado `previsto`
- [ ] Funciones tipadas en client TS

---

### PO-07 — Endpoint de datos agregados de planificación

**Tipo:** Backend (Controller)
**Prioridad:** Crítica
**Dependencias:** PO-04, PO-05, PO-06

#### Contexto

La página de planificación necesita cargar datos de múltiples entidades en una sola llamada. Este endpoint alimenta tanto la vista calendario como la vista tabla, los KPIs y los paneles laterales.

#### Qué hacer

**Endpoint:** `GET /api/construction/planning-overview/:userId`

**Query params:** `projectId`, `dateFrom`, `dateTo`, `tipoRecurso`, `recursoId`.

**Response:**

```json
{
  "ok": true,
  "resumen": {
    "totalEntradas": 0,
    "entradasPlanificadas": 0,
    "entradasConfirmadas": 0,
    "entradasEnCurso": 0,
    "entradasCompletadas": 0,
    "totalConflictos": 0,
    "hitosProximos": 0,
    "hitosRetrasados": 0,
    "materialesPendientes": 0,
    "materialesRequierenCompra": 0,
    "trabajadoresAsignados": 0,
    "maquinariaAsignada": 0,
    "subcontratasPendientesConfirmar": 0,
    "obrasActivas": 0
  },
  "entries": [],
  "milestones": [],
  "materialNeeds": [],
  "obras": [],
  "trabajadores": [],
  "maquinaria": [],
  "subcontratas": [],
  "conflictos": [],
  "alertas": []
}
```

**Detalle de cada campo:**

| Campo | Contenido |
|---|---|
| `entries[]` | Todas las `construction_planning_entry` filtradas. Incluir `recursoNombre`, `obraNombre` denormalizados. |
| `milestones[]` | Todos los `construction_milestone` del rango. Con `diasRetraso` calculado. |
| `materialNeeds[]` | Todos los `construction_material_need` del rango. Con `stockDisponible` y `requiereCompra` actualizados. |
| `obras[]` | Lista de `construction_project` activos (estado ≠ finalizada). Solo id, nombre, estado, fechaInicio, fechaFinPrevista, progreso, color. |
| `trabajadores[]` | Lista de `construction_worker` activos. Solo id, nombre, gremio, obraAsignada. Enriquecido con: `entradasSemana` (count entradas en el rango), `horasSemana`, `disponible` (si no tiene entrada para algún día del rango). |
| `maquinaria[]` | Lista de maquinaria (si existe backend; si no, array vacío hasta que se implemente). |
| `subcontratas[]` | Lista de `construction_guild`. Enriquecido con: `entradasPendientesConfirmar` (count entradas con `requiereConfirmacion && !confirmado`). |
| `conflictos[]` | Todos los conflictos detectados entre entradas (solapamientos). |
| `alertas[]` | Alertas de planificación activas (PO-09). |

**Optimización:** Paralelizar queries CouchDB con `Promise.all`. Response < 800ms con 20 obras y 200 entradas.

#### Criterios de aceptación

- [ ] Endpoint `GET /api/construction/planning-overview/:userId` funcional
- [ ] Filtros por obra, rango de fechas, tipo de recurso, recurso concreto
- [ ] Resumen con 14 métricas calculadas
- [ ] Entries, milestones y material needs filtrados por rango
- [ ] Trabajadores enriquecidos con disponibilidad y carga semanal
- [ ] Subcontratas enriquecidas con entradas pendientes de confirmar
- [ ] Conflictos cruzados entre todas las entradas del rango
- [ ] Alertas de planificación incluidas
- [ ] Response < 800ms con 20 obras

---

### PO-08 — Automatizaciones de planificación

**Tipo:** Backend (Controller)
**Prioridad:** Alta
**Dependencias:** PO-04, PO-05, PO-06

#### Contexto

Las automatizaciones son el motor inteligente de la planificación: detectan conflictos, preparan materiales, activan tareas siguientes y notifican cambios. Se ejecutan al crear/editar entradas y periódicamente (cada 5 minutos).

#### Qué hacer

**1. Detección de conflictos de horario (al crear/editar entrada)**

| Tipo conflicto | Lógica |
|---|---|
| `solapamiento_trabajador` | Buscar otras entradas con mismo `recursoId` (trabajador) que se solapen en fechas Y horas. Excluir canceladas/completadas. |
| `solapamiento_maquinaria` | Igual para `tipoRecurso === 'maquinaria'`. |
| `solapamiento_subcontrata` | Igual para `tipoRecurso === 'subcontrata'`. |
| `vacaciones` | Cruzar con DB `*-vacations`: buscar vacaciones aprobadas del recurso que solapen con las fechas de la entrada. |
| `festivo` | Cruzar con `company_holidays`: verificar si algún día de la entrada cae en festivo. |

**Resultado:** Array de `PlanningConflicto` almacenado en `entry.conflictos[]`. **No bloquear** el guardado; solo informar. Opcionalmente el frontend puede mostrar warning o bloquear según severidad.

**2. Activar próximas tareas (al completar una entrada)**

| Condición | Acción |
|---|---|
| La entrada completada tiene `tareaId` | Buscar si la tarea tiene estado `en_progreso`. Si todas las entradas de esa tarea están completadas, cambiar tarea a `completada`. |
| Hay otra entrada `planificado` del mismo proyecto con `fechaInicio` = día siguiente al `fechaFin` completado | Cambiar su estado a `confirmado` (activar cadena). |
| Hay un milestone dependiente de la tarea completada | Si el milestone tiene `dependeDe` que apunta al milestone asociado a la tarea, notificar que ya puede empezar. |

**3. Preparar necesidades de material (motor periódico)**

| Condición | Acción |
|---|---|
| Entrada confirmada con `materialesPrevistos[]` y `fechaInicio` en los próximos 7 días | Para cada material previsto sin `construction_material_need` existente, crear automáticamente un `construction_material_need` con `estado: 'previsto'` y `fechaNecesaria = fechaInicio de la entrada`. |
| `construction_material_need` con `estado === 'previsto'` y `fechaNecesaria` en los próximos 3 días | Cambiar a `solicitado`. Generar alerta `material_urgente`. |

**4. Notificar cambios (SSE)**

Usar `sseService.js` existente para emitir:

| Evento | Cuándo |
|---|---|
| `construction:planning_created` | Al crear entrada |
| `construction:planning_updated` | Al editar entrada (incluye cambio de fecha, recurso, estado) |
| `construction:planning_conflict` | Al detectar conflicto nuevo |
| `construction:planning_completed` | Al completar entrada |
| `construction:milestone_approaching` | Motor periódico: hito a menos de 3 días |
| `construction:material_needed` | Al crear necesidad de material automática |

#### Criterios de aceptación

- [ ] Detección de 5 tipos de conflicto (solapamiento x3, vacaciones, festivo) al crear/editar
- [ ] Conflictos almacenados en el documento pero no bloquean el guardado
- [ ] Al completar, se activan tareas/entradas siguientes en cadena
- [ ] Motor periódico crea necesidades de material para entradas a 7 días
- [ ] Necesidades de material pasan a `solicitado` cuando faltan 3 días
- [ ] 6 tipos de eventos SSE emitidos desde el controller
- [ ] Cruce con vacaciones y festivos del sistema existente

---

### PO-09 — Alertas de planificación

**Tipo:** Backend (Alert Engine)
**Prioridad:** Alta
**Dependencias:** PO-04, PO-05, PO-06

#### Contexto

5 alertas específicas de planificación que se evalúan en el endpoint de alertas existente (`/api/construction/alerts/:userId`) o en un endpoint nuevo dedicado.

#### Qué hacer

**1. Definir alertas**

| ID | Label | Descripción | Severidad |
|---|---|---|---|
| `planning_obra_sin_planificar` | Obra sin planificar | Obra en estado `planificación` o `en_obra` sin ninguna `construction_planning_entry` activa (no cancelada/completada) | `high` |
| `planning_trabajador_no_asignado` | Trabajador no asignado | Trabajador activo (`activo === true`) que no tiene ninguna `construction_planning_entry` para la semana en curso | `warning` |
| `planning_conflicto_fechas` | Conflicto de fechas | Hay al menos una `construction_planning_entry` con array `conflictos` no vacío y `estado !== 'cancelado'` | `high` |
| `planning_material_no_previsto` | Material no previsto | Obra en estado `en_obra` con menos de 5 días de `construction_material_need` registradas para las próximas 2 semanas (obra sin previsión de materiales) | `warning` |
| `planning_subcontrata_pendiente` | Subcontrata pendiente confirmar | `construction_planning_entry` con `tipoRecurso === 'subcontrata'` y `requiereConfirmacion === true` y `confirmado === false` y `fechaInicio` en los próximos 7 días | `high` |

**2. Evaluadores**

| Alerta | Lógica |
|---|---|
| Obra sin planificar | Para cada `construction_project` con `estado in ['planificación', 'en_obra']`: buscar al menos una `construction_planning_entry` activa (`estado in ['planificado', 'confirmado', 'en_curso']`) vinculada a esa obra. Si no hay, generar alerta con datos de la obra. |
| Trabajador no asignado | Para cada `construction_worker` con `activo === true`: buscar entradas de planificación para esta semana (lunes a viernes) con ese `recursoId`. Si no hay ninguna, generar alerta. |
| Conflicto de fechas | Leer todas las entradas no canceladas. Filtrar las que tengan `conflictos.length > 0`. Por cada una, generar alerta con detalle del conflicto. |
| Material no previsto | Para cada obra en `en_obra`: contar `construction_material_need` con `fechaNecesaria` en los próximos 14 días. Si hay menos de 5 registros, generar alerta. |
| Subcontrata pendiente | Leer entradas tipo `subcontrata` no confirmadas con `fechaInicio` en próximos 7 días. Por cada una, generar alerta con datos de la subcontrata y la obra. |

**3. Integrar en endpoint de alertas**

Añadir los 5 evaluadores al endpoint existente `GET /api/construction/alerts/:userId`. Categoría: `'planning'`.

#### Criterios de aceptación

- [ ] 5 tipos de alerta definidos con severidad y categoría
- [ ] Evaluadores consultan entradas, hitos y necesidades de material
- [ ] Cruce con obras activas y trabajadores activos
- [ ] Subcontratas pendientes consideran ventana de 7 días
- [ ] Integradas en el endpoint de alertas existente con categoría `planning`
- [ ] Cada alerta incluye contexto: obraId, obraNombre, recursoId, recursoNombre, fechas

---

### PO-10 — Frontend: Shell de la página, routing y sidebar

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PO-07

#### Contexto

Crear `ConstructionPlanning.tsx` como página principal de planificación con estructura de layout, routing, sidebar y estado global.

#### Qué hacer

**1. Crear `src/app/pages/saas/ConstructionPlanning.tsx`**

**2. Registrar en `routes.tsx`**

```typescript
{ path: 'construction-planning', Component: ConstructionPlanning },
```

En la sección de Construction, después de `construction-execution`.

**3. Registrar en `Sidebar.tsx`**

Añadir al array de items:
```typescript
{ id: 'construction-planning', navKey: 'constructionPlanning', icon: <CalendarRange className="w-5 h-5" />, path: '/saas/construction-planning' },
```

Añadir al grupo `construction` en `sidebarGroupDefs`:
```typescript
itemIds: ['construction-projects', 'construction-planning', 'construction-execution', 'construction-budgets', 'construction-machinery', 'construction-materials', 'construction-subcontractors', 'construction-plans']
```

Posición: segundo item (después de Obras, antes de Ejecución), porque planificación es el paso previo a la ejecución.

**4. Estructura de la página**

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│ "Planificación de Obra" + CalendarRange icon                    │
│ Toggle: Gerente / Trabajador (solo gerentes)                    │
│ Indicador tiempo real (●) + Última actualización                │
├─────────────────────────────────────────────────────────────────┤
│ BARRA DE FILTROS (PO-11)                                        │
│ Obra | Tipo recurso | Recurso | Estado | Fecha (rango)          │
├─────────────────────────────────────────────────────────────────┤
│ ALERTAS colapsables (PO-19)                                     │
│ [!] Obra sin planificar  [!] Conflicto de fechas  [!] ...       │
├─────────────────────────────────────────────────────────────────┤
│ 6 KPIs (tarjetas)                                               │
│ Asignaciones | Conflictos | Hitos próx | Materiales | Subcontr  │
├─────────────────────────────────────────────────────────────────┤
│ TOGGLE VISTA: [📅 Calendario] [📋 Tabla]                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VISTA CALENDARIO (PO-11) o VISTA TABLA (PO-12)                 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ PANELES LATERALES / INFERIORES (grid 2 cols desktop)            │
│ ┌─────────────────────┐ ┌─────────────────────┐                │
│ │ Hitos y fechas clave│ │ Materiales previstos│                │
│ │ (PO-14)             │ │ (PO-16)             │                │
│ ├─────────────────────┤ ├─────────────────────┤                │
│ │ Subcontratas        │ │ Notas y Docs        │                │
│ │ (PO-17)             │ │ (PO-18)             │                │
│ └─────────────────────┘ └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

**5. Estado**

```typescript
const [view, setView] = useState<'calendar' | 'table'>('calendar');
const [filters, setFilters] = useState({ projectId: '', tipoRecurso: '', recursoId: '', estado: '', dateFrom: '', dateTo: '' });
const [planningData, setPlanningData] = useState<PlanningOverview | null>(null);
const [loading, setLoading] = useState(true);
const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
const isManager = ['Admin', 'Gerente', 'owner', 'admin', 'manager'].includes(user?.role || '');
const [viewAs, setViewAs] = useState<'gerente' | 'trabajador'>('gerente');
```

**6. Carga de datos**

- Fetch `planning-overview` al montar + re-fetch al cambiar filtro (debounce 300ms)
- Polling 60s como fallback
- Futuramente: SSE con `useConstructionSSE` (PO-08)

**7. KPIs (6 tarjetas)**

| # | Métrica | Fuente | Icono | Color |
|---|---|---|---|---|
| 1 | Asignaciones activas | `resumen.entradasPlanificadas + entradasConfirmadas + entradasEnCurso` | CalendarRange | sky |
| 2 | Conflictos | `resumen.totalConflictos` | AlertTriangle | red(>0)/gray(0) |
| 3 | Hitos próximos | `resumen.hitosProximos` | Flag | amber |
| 4 | Hitos retrasados | `resumen.hitosRetrasados` | Clock | red(>0)/gray(0) |
| 5 | Materiales pendientes | `resumen.materialesPendientes` | Package | orange(>0)/gray(0) |
| 6 | Subcontratas sin confirmar | `resumen.subcontratasPendientesConfirmar` | UserX | red(>0)/gray(0) |

Cada tarjeta clicable (scroll a sección correspondiente). Patrón UI: mismo que `ConstructionProjects.tsx` KPI cards.

**8. Layout y responsive**

- `Layout` de `components/saas/Layout`
- Dark mode obligatorio
- Grid: 1 col móvil, 2 cols tablet, layout completo desktop
- Iconos: `lucide-react`
- Convenciones: `rounded-xl/2xl`, `border-2 border-gray-200 dark:border-gray-700`, `shadow-sm` en hover

#### Criterios de aceptación

- [ ] Página renderiza en `/saas/construction-planning`
- [ ] Registrada en `routes.tsx` sección Construction
- [ ] Item visible en Sidebar con icono `CalendarRange`, segundo en grupo Construction
- [ ] Layout con header, filtros, alertas, KPIs, toggle de vista, paneles
- [ ] 6 tarjetas KPI con datos del endpoint de overview
- [ ] Toggle Calendario/Tabla funcional
- [ ] Toggle Gerente/Trabajador solo visible para roles gerente
- [ ] Carga datos de `planning-overview` al montar con debounce en filtros
- [ ] Responsive: 1 col en móvil
- [ ] Dark mode

---

### PO-11 — Frontend: Vista calendario

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PO-10

#### Contexto

El calendario es la vista principal y más valiosa de la planificación. Debe mostrar las asignaciones como bloques de color en un timeline semanal/mensual, con soporte para drag & drop, múltiples recursos en filas y marcadores de hitos.

#### Qué hacer

**1. Componente `PlanningCalendar.tsx`**

Crear en `src/app/pages/saas/components/PlanningCalendar.tsx`.

**2. Modos de visualización**

| Modo | Descripción | Navegación |
|---|---|---|
| **Semana** | 7 columnas (Lun-Dom). Filas = recursos (trabajadores + maquinaria + subcontratas). Cada asignación = bloque horizontal coloreado. | ← Semana anterior / Semana siguiente → / Hoy |
| **Mes** | Cuadrícula 7×5. Cada celda = día con mini-bloques apilados. Hitos como diamantes ◆. | ← Mes anterior / Mes siguiente → / Hoy |
| **Línea de tiempo (Gantt)** | Eje X = días/semanas. Filas = obras. Cada obra muestra sus asignaciones como barras horizontales. Hitos como marcadores ▼. | Scroll horizontal + zoom (botones +/-) |

**3. Vista Semana (default)**

```
         Lun 14    Mar 15    Mié 16    Jue 17    Vie 18    Sáb 19    Dom 20
┌────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Juan P.│ ████████████████████████████│         │         │         │         │
│ (Albañ)│ Obra Centro - Cimentación   │         │         │         │         │
├────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ María G│         │ ████████████████████████████████████████│         │         │
│ (Elect)│         │ Obra Norte - Instalaciones              │         │         │
├────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Grúa 1 │████████████████████│         │         │████████████████████│         │
│ (Maqui)│ Obra Centro        │         │         │ Obra Sur           │         │
├────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ ElecPro│         │         │ ████████████████████████████████████████│         │
│ (Subco)│         │         │ Obra Norte - Cuadro eléctrico  ⚠ PEND │         │
└────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
                              ◆ Hito: Inspección cimentación
```

**Filas:**
- Agrupadas por tipo: Trabajadores → Maquinaria → Subcontratas (con separadores de grupo)
- Columna izquierda fija: Avatar/icono + nombre + gremio/tipo
- Filtrable: ocultar/mostrar tipos de recurso

**Bloques de asignación:**
- Color por obra (cada obra tiene un color asignado, configurable)
- Texto: nombre de obra + tarea (si hay)
- Badge de estado: planificado (borde punteado), confirmado (borde sólido), en_curso (relleno sólido), completado (opacidad 50%)
- Indicadores: ⚠ conflicto (borde rojo), 📦 materiales (icono), ⏳ pendiente confirmar
- Hover: tooltip con detalle (obra, fechas, horas, estado)
- Click: abre drawer de detalle (PO-13)

**Hitos:**
- Marcadores ◆ en la línea del día correspondiente
- Color por tipo de hito (inicio=verde, fin_fase=azul, entrega=purple, inspección=amber)
- Hover: tooltip con nombre + obra + estado
- Click: abre mini-modal de hito

**Drag & Drop (solo gerente):**
- Arrastrar bloque horizontalmente = cambiar fechas
- Arrastrar bloque verticalmente = reasignar recurso
- Al soltar: confirmar cambio con modal, detectar conflictos, guardar vía API
- Visual: sombra del bloque original, ghost en nueva posición

**4. Vista Mes**

- Cada celda del día muestra max 3 mini-bloques apilados (color + nombre corto)
- "+N más" si hay más de 3
- Hitos como diamantes ◆ con color
- Click en celda: expande a vista semana de esa semana
- Click en bloque: abre drawer

**5. Vista Línea de tiempo (Gantt)**

- Eje X: escalable (días / semanas / meses)
- Filas: una por obra activa
- Barra base: rango `fechaInicio` → `fechaFinPrevista` del proyecto (color claro)
- Barras superpuestas: cada asignación como segmento coloreado por tipo de recurso
- Hitos: marcadores ▼ en la línea temporal
- Progreso: overlay de progreso sobre la barra base (% completado)
- Scroll horizontal + botones de zoom

**6. Interacciones comunes**

| Acción | Resultado |
|---|---|
| Click en celda vacía del calendario (solo gerente) | Abre drawer de creación con fecha/recurso prellenados |
| Click en bloque existente | Abre drawer de detalle/edición |
| Doble click en bloque | Abre drawer directamente en modo edición |
| Click derecho en bloque | Menú contextual: Editar, Duplicar, Confirmar, Completar, Cancelar, Eliminar |
| Click en hito ◆ | Mini-modal: nombre, fecha, estado, botón completar/editar |
| Hover en conflicto ⚠ | Tooltip con detalle del conflicto |

**7. Responsive**

- Desktop (≥1024px): calendario completo con filas de recursos
- Tablet (≥768px): solo vista semana, filas colapsables
- Móvil (<768px): vista día/lista vertical, swipe para cambiar día

#### Criterios de aceptación

- [ ] 3 modos: semana, mes, línea de tiempo (Gantt)
- [ ] Vista semana con filas por recurso, bloques coloreados por obra y marcadores de hitos
- [ ] Vista mes con mini-bloques apilados y hitos
- [ ] Vista Gantt con barras por obra, segmentos por asignación y marcadores de hitos
- [ ] Bloques con colores, badges de estado, indicadores de conflicto/materiales/confirmación
- [ ] Drag & drop para mover asignaciones (fechas y recurso) con detección de conflictos
- [ ] Click en celda vacía → crear nueva asignación
- [ ] Click en bloque → drawer de detalle
- [ ] Menú contextual con acciones según estado
- [ ] Navegación temporal (anterior/siguiente/hoy) en cada modo
- [ ] Responsive: vista día/lista en móvil
- [ ] Tooltips informativos en hover

---

### PO-12 — Frontend: Vista tabla

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-10

#### Contexto

La vista tabla complementa al calendario para operaciones masivas: filtrado avanzado, ordenación, selección múltiple y acciones bulk. Es la vista preferida por gerentes que gestionan muchas obras simultáneamente.

#### Qué hacer

**1. Componente `PlanningTable.tsx`**

Crear en `src/app/pages/saas/components/PlanningTable.tsx`.

**2. Columnas**

| Columna | Filtrable | Tipo filtro | Ordenable |
|---|---|---|---|
| Checkbox (selección) | No | — | No |
| REF (PLAN-xxx) | Sí | Búsqueda | Sí |
| OBRA | Sí | Multi-select + búsqueda | Sí |
| TIPO RECURSO | Sí | Pills (Trabajador / Maquinaria / Subcontrata) | Sí |
| RECURSO | Sí | Multi-select + búsqueda | Sí |
| GREMIO | Sí | Multi-select | Sí |
| FECHA INICIO | Sí | Rango de fechas | Sí (default desc) |
| FECHA FIN | Sí | Rango de fechas | Sí |
| HORARIO | No | — | No |
| TAREA | No | — | No |
| ESTADO | Sí | Pills (5 estados) | Sí |
| CONFLICTOS | Sí | Sí/No | Sí |
| CONFIRMADO | Sí | Sí/No/N/A | No |
| MATERIALES | No | — | No |
| ACCIONES | No | — | No |

**3. Badges y colores de estado**

| Estado | Color |
|---|---|
| planificado | `bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300` (borde punteado) |
| confirmado | `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400` |
| en_curso | `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400` |
| completado | `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400` |
| cancelado | `bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400` |

**4. Badges de tipo recurso**

| Tipo | Icono | Color |
|---|---|---|
| trabajador | `HardHat` | amber |
| maquinaria | `Truck` | sky |
| subcontrata | `UsersRound` | violet |

**5. Columna Conflictos**

- Si `conflictos.length > 0`: badge rojo con número + icono `AlertTriangle`
- Click → popover con lista de conflictos detallada
- Si 0 conflictos: `—` gris

**6. Columna Materiales**

- Si `materialesPrevistos.length > 0`: badge con número + icono `Package`
- Click → popover con lista de materiales y estado de cada uno
- Colores: previsto=gray, solicitado=amber, pedido=blue, recibido=green

**7. Acciones por fila (menú `⋯`)**

| Estado | Acciones disponibles |
|---|---|
| planificado | Editar, Confirmar, Duplicar, Eliminar |
| confirmado | Editar, Iniciar, Cancelar, Duplicar |
| en_curso | Editar, Completar, Cancelar |
| completado | Ver, Duplicar |
| cancelado | Ver, Duplicar, Eliminar |

**8. Acciones bulk (selección múltiple)**

- "Confirmar seleccionados" (solo `planificado`)
- "Cancelar seleccionados" (solo `planificado`/`confirmado`)
- "Eliminar seleccionados" (solo `planificado`/`cancelado`)
- "Cambiar obra" (reasignar a otra obra)
- "Cambiar recurso" (reasignar a otro trabajador/maquinaria/subcontrata)

**9. Barra superior de la tabla**

- Buscador: "Buscar por PLAN-xxx, obra, recurso, gremio..."
- Botón "Exportar" (futuro: CSV/PDF)
- Botón "+ Nueva asignación" → abre drawer (PO-13)
- Indicador: "Mostrando X de Y asignaciones"

**10. Responsive**

- Desktop: tabla completa con todas las columnas
- Tablet: ocultar HORARIO, TAREA, MATERIALES
- Móvil: vista cards (como en ConstructionTasks.tsx pattern)

#### Criterios de aceptación

- [ ] Tabla con 15 columnas definidas
- [ ] Filtros por columna: búsqueda, multi-select, pills, rango de fechas
- [ ] Ordenación por columnas clicables
- [ ] Badges de estado, tipo de recurso, conflictos y materiales con colores correctos
- [ ] Menú de acciones por fila según estado
- [ ] Selección múltiple con checkbox + acciones bulk
- [ ] Buscador global
- [ ] Responsive: cards en móvil
- [ ] Click en fila → abre drawer de detalle

---

### PO-13 — Frontend: Drawer de entrada de planificación

**Tipo:** Feature Frontend
**Prioridad:** Crítica
**Dependencias:** PO-04, PO-10

#### Contexto

El drawer es el formulario central para crear, editar y consultar asignaciones de planificación. Se abre desde el calendario (click en celda vacía o en bloque) o desde la tabla. Debe soportar los tres tipos de recurso (trabajador, maquinaria, subcontrata) con campos condicionales.

#### Qué hacer

**1. Crear `src/app/pages/saas/components/PlanningEntryDrawer.tsx`**

**2. Header del drawer**

- Modo creación: "Nueva asignación de planificación"
- Modo edición: `PLAN-XXXXXX — Nombre de obra — Recurso`
- Badge de estado con color
- Botón cerrar (`X`)

**3. Tabs internas**

| Tab | Contenido |
|---|---|
| **Datos** | Formulario principal (ver punto 4) |
| **Materiales** | Lista de materiales previstos + botón añadir (ver punto 5) |
| **Conflictos** | Lista de conflictos detectados con detalle y acciones (ver punto 6) |
| **Notas** | Notas generales + notas de gerencia (solo gerente) + documentación vinculada |
| **Historial** | Timeline de acciones (creación, edición, confirmación, etc.) |

**4. Tab Datos — campos del formulario**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Obra | Selector (`construction_project` activos) | Sí | Al seleccionar: autocompletar `obraId`/`obraNombre`, filtrar recursos disponibles |
| Tipo de recurso | Pills: Trabajador / Maquinaria / Subcontrata | Sí | Cambia los campos del selector de recurso |
| Recurso | Selector dinámico según tipo | Sí | Trabajador: lista `construction_worker` filtrada por obra. Maquinaria: lista de maquinaria. Subcontrata: lista `construction_guild`. Mostrar disponibilidad (badge verde/rojo). |
| Gremio | Selector (auto desde trabajador/subcontrata si aplica) | Sí (trabajador/subcontrata) | Prellenar desde el perfil del recurso |
| Tarea vinculada | Selector (`construction_task` filtrada por obra) | No | Autocompletar `tareaId`/`tareaNombre` |
| Fecha inicio | Date picker | Sí | Default: fecha clicada en calendario o hoy |
| Fecha fin | Date picker | Sí | Default: fecha inicio + 1 día |
| Todo el día | Toggle | No | Si ON, ocultar hora inicio/fin |
| Hora inicio | Time picker (step 30min) | No | Default: 08:00. Oculto si "todo el día" |
| Hora fin | Time picker (step 30min) | No | Default: 17:00. Oculto si "todo el día" |
| Días de la semana | Checkbox group (L M X J V S D) | No | Default: L-V. Para asignaciones de varios días |
| Descripción | Textarea (3 líneas) | No | |
| Prioridad | Select: Baja / Media / Alta / Urgente | Sí | Default: Media |
| Color | Color picker (8 colores predefinidos) | No | Default: color de la obra |
| Responsable | Selector (equipo gerente) | Sí | Default: usuario actual |
| ¿Requiere confirmación? | Toggle | No | Default: ON si tipo = subcontrata |
| ¿Es recurrente? | Toggle | No | Si ON, mostrar regla de recurrencia |
| Regla recurrencia | Select (diaria/semanal/quincenal/mensual) + intervalo + fecha fin | Condicional | Solo si recurrente = ON |
| Notas | Textarea (2 líneas) | No | |
| Notas gerencia | Textarea (2 líneas, solo gerente) | No | Solo visible para gerentes |

**Validaciones al guardar:**
- Obra, recurso, fecha inicio y fecha fin son obligatorios
- `fechaFin >= fechaInicio`
- Si hay conflictos detectados: mostrar modal de confirmación "Se han detectado N conflictos. ¿Guardar igualmente?"
- Si subcontrata sin confirmar: mostrar aviso

**5. Tab Materiales**

- Botón "**+ Añadir material previsto**" abre mini-form inline:
  - Selector de material (buscar en catálogo `construction` de `verticalCatalog`)
  - Cantidad (numérico)
  - Unidad (auto desde catálogo: m², m³, kg, unidades)
  - Fecha necesaria (date picker, default = fecha inicio de la asignación)
  - Estado: previsto (auto)
- Tabla inline editable con fila por material
- Por cada material: badge de stock actual (verde si suficiente, rojo si insuficiente)
- Subtotal de coste estimado
- Botón "Crear necesidades de compra" → genera `construction_material_need` para todos los que requieren compra

**6. Tab Conflictos**

- Si no hay conflictos: mensaje verde "✓ Sin conflictos detectados"
- Si hay conflictos: lista con:
  - Icono de tipo (solapamiento=rojo, vacaciones=amber, festivo=blue)
  - Mensaje descriptivo: "Juan Pérez ya está asignado a Obra Norte del 14/04 al 18/04"
  - Botón "Ver asignación conflictiva" → navegar o abrir drawer de la otra entrada
  - Botón "Resolver" → opciones: reasignar recurso, cambiar fechas, ignorar

**7. Acciones del footer**

| Estado | Perfil Gerente | Perfil Trabajador |
|---|---|---|
| (nuevo) | Guardar (planificado), Guardar y confirmar | No puede crear |
| planificado | Editar, Confirmar, Duplicar, Eliminar | Solo ver |
| confirmado | Editar, Iniciar, Cancelar | Solo ver |
| en_curso | Editar, Completar | Solo ver |
| completado | Solo ver, Duplicar | Solo ver |

#### Criterios de aceptación

- [ ] Drawer con 5 tabs funcionales
- [ ] Formulario dinámico según tipo de recurso (campos condicionales)
- [ ] Selectores de obra/recurso/tarea cargados desde API con filtrado cruzado
- [ ] Disponibilidad del recurso visible en el selector (badge verde/rojo)
- [ ] Materiales previstos con selector de catálogo, stock actual y cálculo de coste
- [ ] Conflictos mostrados con detalle y acciones de resolución
- [ ] Notas de gerencia solo visibles para gerentes
- [ ] Recurrencia configurable con regla y fecha fin
- [ ] Validaciones: campos obligatorios, fechas coherentes, confirmación si hay conflictos
- [ ] Acciones del footer según estado y rol
- [ ] Responsive: full-width en móvil, 640px en desktop

---

### PO-14 — Frontend: Panel de hitos y fechas clave

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-05, PO-10

#### Qué hacer

**1. Componente `PlanningMilestones.tsx`**

Card con header "Hitos y Fechas Clave" + icono `Flag` + badge con total.

**2. KPIs (3 mini-tarjetas)**

| KPI | Cálculo | Color |
|---|---|---|
| Próximos 7 días | Count milestones con `fecha` en próximos 7 días y `estado === 'pendiente'` | amber |
| Retrasados | Count milestones con `estado === 'retrasado'` o `fecha < hoy && estado === 'pendiente'` | red |
| Cumplidos este mes | Count milestones con `estado === 'cumplido'` y `fechaReal` en mes actual | emerald |

**3. Lista de hitos (max 8, ordenados por fecha)**

Cada hito:
- Icono según tipo (inicio_obra=🏗️, fin_fase=🔨, entrega=📦, inspeccion=🔍, permiso=📋, entrega_final=🏁)
- Nombre del hito + nombre de la obra
- Fecha prevista + badge de estado (pendiente=gris, cumplido=verde, retrasado=rojo, cancelado=gris tachado)
- Si retrasado: "⏰ X días de retraso" en rojo
- Si próximo (≤3 días): borde izquierdo amber
- Si tiene dependencia: icono de cadena 🔗 con tooltip "Depende de: [nombre del milestone padre]"
- Botón "Completar" (solo gerente, solo si pendiente)

**4. Botón "Ver todos" → futuro: modal con tabla completa de hitos**

**5. Botón "+ Nuevo hito" (solo gerente) → modal de creación rápida**

Modal con: obra, nombre, tipo, fecha, responsable, descripción.

#### Criterios de aceptación

- [ ] Card con 3 KPIs de hitos
- [ ] Lista de hasta 8 hitos ordenados por fecha
- [ ] Iconos y colores por tipo y estado
- [ ] Indicador de retraso con días
- [ ] Indicador de dependencias entre hitos
- [ ] Botón completar hito (solo gerente)
- [ ] Botón crear hito con modal rápido
- [ ] Datos cargados desde `planningData.milestones`

---

### PO-15 — Frontend: Panel de maquinaria y recursos

**Tipo:** Feature Frontend
**Prioridad:** Media
**Dependencias:** PO-10

#### Contexto

La maquinaria actualmente no tiene backend (`ConstructionMachinery.tsx` usa estado local). Este panel muestra la disponibilidad de maquinaria en el contexto de la planificación, usando los datos locales existentes o una futura API.

#### Qué hacer

**1. Componente `PlanningMachinery.tsx`**

Card con header "Maquinaria y Recursos" + icono `Truck` + badge.

**2. Contenido**

- Lista de maquinaria con:
  - Nombre + tipo (excavadora, grúa, hormigonera, etc.)
  - Estado: disponible (verde), en uso (azul), mantenimiento (amber), avería (rojo)
  - Obra asignada actual (si en uso)
  - Próxima asignación planificada (si hay `construction_planning_entry` tipo `maquinaria`)
  - Indicador de conflicto si está asignada a dos obras simultáneamente

**3. Modo degradado**

Mientras no haya backend de maquinaria:
- Mostrar solo las entradas de planificación tipo `maquinaria` del overview
- Agrupar por nombre de recurso
- Mostrar rango de fechas asignado

**4. Botón "+ Asignar maquinaria" → abre drawer PO-13 con tipo = maquinaria prellenado**

#### Criterios de aceptación

- [ ] Card de maquinaria con lista de recursos
- [ ] Estado de disponibilidad con colores
- [ ] Próxima asignación planificada visible
- [ ] Funciona en modo degradado (sin backend de maquinaria)
- [ ] Botón de asignación rápida

---

### PO-16 — Frontend: Panel de materiales previstos

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-06, PO-10

#### Qué hacer

**1. Componente `PlanningMaterials.tsx`**

Card con header "Materiales Previstos" + icono `Package` + badge.

**2. KPIs (3 mini-tarjetas)**

| KPI | Cálculo | Color |
|---|---|---|
| Pendientes | Count `estado === 'previsto'` | amber |
| Requieren compra | Count `requiereCompra === true` | red |
| Recibidos este mes | Count `estado === 'recibido'` y `fechaRecepcion` en mes actual | emerald |

**3. Lista de necesidades (max 8, ordenadas por fecha necesaria)**

Cada necesidad:
- Material: nombre + categoría
- Obra: nombre
- Cantidad + unidad
- Fecha necesaria + badge de urgencia (≤3 días = rojo, ≤7 días = amber, >7 días = gris)
- Estado: previsto (gris), solicitado (amber), pedido (blue), recibido (green)
- Stock actual: badge verde si `stockDisponible >= cantidad`, rojo si `stockDisponible < cantidad`
- Botón "Solicitar" (cambiar estado a `solicitado`)
- Botón "Marcar recibido" (cambiar estado a `recibido`)

**4. Botón "+ Prever material"**

Abre modal rápido: obra, material (selector catálogo), cantidad, unidad, fecha necesaria.

**5. Conexión con Compras**

- Botón "Crear pedido de compra" para materiales con `requiereCompra === true`: navegar a `/saas/purchase-orders` con datos prellenados (futuro: crear pedido vía API y vincular `pedidoCompraId`)

#### Criterios de aceptación

- [ ] Card con 3 KPIs de materiales
- [ ] Lista de hasta 8 necesidades ordenadas por fecha
- [ ] Badges de urgencia, estado y stock
- [ ] Botones solicitar y marcar recibido funcionales (API)
- [ ] Modal rápido para crear necesidad
- [ ] Conexión navegacional con módulo de Compras
- [ ] Datos cargados desde `planningData.materialNeeds`

---

### PO-17 — Frontend: Panel de subcontratas

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-04, PO-10

#### Qué hacer

**1. Componente `PlanningSubcontractors.tsx`**

Card con header "Subcontratas y Gremios" + icono `UsersRound` + badge.

**2. KPIs (2 mini-tarjetas)**

| KPI | Cálculo | Color |
|---|---|---|
| Pendientes confirmar | Count entradas tipo `subcontrata` con `requiereConfirmacion && !confirmado` | red |
| Activas esta semana | Count entradas tipo `subcontrata` con `estado in ['confirmado', 'en_curso']` y fechas en semana actual | emerald |

**3. Lista de subcontratas con asignaciones**

Cada subcontrata (agrupada por `construction_guild`):
- Nombre + tipo de gremio + contacto
- Asignaciones pendientes de confirmar: lista con obra + fechas + botón "Confirmar"
- Asignaciones confirmadas: lista con obra + fechas + estado
- Indicador: precio acordado (desde guild `precioTotal`)

**4. Botón "Confirmar" por asignación**

Ejecuta `confirmPlanningEntry` vía API. Cambia `confirmado: true`, `estado: 'confirmado'`. Actualiza lista.

**5. Botón "+ Asignar subcontrata" → abre drawer PO-13 con tipo = subcontrata prellenado**

#### Criterios de aceptación

- [ ] Card con 2 KPIs de subcontratas
- [ ] Lista agrupada por subcontrata/gremio
- [ ] Asignaciones pendientes de confirmar con botón de acción
- [ ] Asignaciones confirmadas con estado
- [ ] Botón confirmar funcional (API)
- [ ] Botón de asignación rápida

---

### PO-18 — Frontend: Panel de notas de gerencia y documentación

**Tipo:** Feature Frontend
**Prioridad:** Media
**Dependencias:** PO-10

#### Qué hacer

**1. Componente `PlanningNotes.tsx`**

Card con header "Notas y Documentación" + icono `FileText` + badge.

**2. Notas de gerencia**

- Textarea editable en tiempo real (auto-save con debounce 1s)
- Vinculada a la obra seleccionada en filtros (o general si no hay obra seleccionada)
- Solo editable por gerente
- Historial de notas (ver quién y cuándo escribió)
- Markdown básico soportado (negrita, listas)

**3. Documentación interna**

- Lista de documentos vinculados a la planificación:
  - Desde la obra: documentos del proyecto (si se implementa `construction_document` de CO-02)
  - Desde los hitos: documentos adjuntos a hitos
  - Desde las asignaciones: notas y materiales previstos
- Cada documento: nombre + tipo + fecha + botón descargar/ver
- Botón "+ Añadir documento" (upload)

**4. Conexión con módulo de Documentación**

- Link "Ver documentación completa" → `/saas/construction-plans` o `/saas/doc-society` según contexto

**5. Solo gerente**

- El trabajador NO ve este panel (se oculta completamente en vista trabajador)

#### Criterios de aceptación

- [ ] Card con textarea de notas editable (solo gerente)
- [ ] Auto-save con debounce
- [ ] Lista de documentos internos vinculados
- [ ] Upload de documentos
- [ ] Link a módulo de documentación
- [ ] Oculto para trabajadores

---

### PO-19 — Frontend: Panel de alertas de planificación

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-09, PO-10

#### Qué hacer

**1. Componente `PlanningAlerts.tsx`**

Panel colapsable (patrón alertas del CO-10 Centro Operativo).

**2. Tipos de alerta y visualización**

| Tipo | Icono | Severidad | Color borde |
|---|---|---|---|
| `planning_obra_sin_planificar` | `CalendarX` | high | red |
| `planning_trabajador_no_asignado` | `UserX` | warning | amber |
| `planning_conflicto_fechas` | `AlertTriangle` | high | red |
| `planning_material_no_previsto` | `PackageX` | warning | amber |
| `planning_subcontrata_pendiente` | `UserCheck` | high | red |

**3. Estructura**

- Header: icono Bell + "Alertas de Planificación" + badge con total + desglose (X críticas, Y avisos)
- Botón collapse/expand
- Lista de alertas:
  - Borde izquierdo coloreado (red/amber)
  - Icono + mensaje descriptivo + recurso/obra afectada
  - Botón "Ver" → navega o abre drawer de la entidad afectada
  - Botón "Resolver" → acciones según tipo (asignar, planificar, confirmar)
- Si no hay alertas: ocultar panel, mostrar indicador verde "✓ Planificación al día"

**4. Acciones de resolución rápida**

| Alerta | Acción "Resolver" |
|---|---|
| Obra sin planificar | Abre drawer de creación con obra prellenada |
| Trabajador no asignado | Abre drawer de creación con trabajador prellenado |
| Conflicto de fechas | Abre drawer de la entrada conflictiva en tab Conflictos |
| Material no previsto | Abre modal de creación de necesidad de material con obra prellenada |
| Subcontrata pendiente | Ejecuta confirmación directa o abre drawer para revisar |

#### Criterios de aceptación

- [ ] Panel colapsable con iconos y colores por tipo de alerta
- [ ] Badge con total y desglose de severidades
- [ ] Botón "Ver" navega a la entidad afectada
- [ ] Botón "Resolver" ejecuta acción rápida según tipo
- [ ] Oculto si no hay alertas, con indicador verde
- [ ] Datos cargados desde `planningData.alertas`

---

### PO-20 — Frontend: Diferenciación gerente vs trabajador

**Tipo:** Feature Frontend
**Prioridad:** Alta
**Dependencias:** PO-10 a PO-19

#### Qué hacer

**1. Detección de rol**

```typescript
const { user } = useAuth();
const isManager = ['Admin', 'Gerente', 'owner', 'admin', 'manager'].includes(user?.role || '');
```

Toggle manual en header (igual que patrón ButcherHub) solo para gerentes.

**2. Vista Gerente (completa)**

| Elemento | Comportamiento |
|---|---|
| **Header** | "Planificación de Obra" + toggle Gerente/Trabajador |
| **Filtros** | Todos: obra, tipo recurso, recurso, estado, fechas |
| **Alertas** | Todas las 5 alertas |
| **KPIs** | Los 6 KPIs completos |
| **Calendario** | 3 vistas (semana/mes/Gantt). Drag & drop habilitado. Click en celda vacía crea asignación. Menú contextual completo. |
| **Tabla** | Todas las columnas. Acciones bulk. Selección múltiple. |
| **Drawer** | Crear/editar/confirmar/completar/cancelar. Notas gerencia. |
| **Hitos** | Ver todos + crear + completar |
| **Materiales** | Ver todos + crear necesidad + solicitar |
| **Subcontratas** | Ver todas + confirmar |
| **Notas** | Editar notas + ver documentación |

**3. Vista Trabajador (simplificada)**

| Elemento | Comportamiento |
|---|---|
| **Header** | "Mi Planificación" + "Hola, [nombre]" + gremio + obra actual |
| **Filtros** | Solo: obra (sus obras asignadas) + fechas |
| **Alertas** | Ocultas (el trabajador no necesita ver alertas de planificación global) |
| **KPIs** | 3 KPIs: Mis asignaciones esta semana / Mis próximas tareas / Cambios recientes |
| **Calendario** | Solo vista semana. Solo sus asignaciones (filtrado por `recursoId = su ID`). Sin drag & drop. Sin crear. Click en bloque → ver detalle (solo lectura). |
| **Tabla** | Solo sus asignaciones. Sin acciones bulk. Solo ver detalle. |
| **Drawer** | Solo lectura. Sin tabs de conflictos ni notas gerencia. |
| **Hitos** | Ver hitos de sus obras (sin crear ni completar) |
| **Materiales** | Ver materiales de sus asignaciones (sin crear ni solicitar) |
| **Subcontratas** | Oculto |
| **Notas** | Oculto |

**4. Carga de datos filtrada**

- Trabajador: el endpoint `planning-overview` se llama con filtro `recursoId = workerIdDelUsuario`
- Mapeo trabajador ↔ usuario: buscar `construction_worker` cuyo perfil coincida con el usuario logueado (por email o por `teamMemberId` del sistema de equipo)

#### Criterios de aceptación

- [ ] Rol detectado desde `useAuth().user.role`
- [ ] Toggle Gerente/Trabajador solo visible para gerentes
- [ ] Gerente: acceso completo a todas las funcionalidades
- [ ] Trabajador: vista limitada a sus asignaciones, sin crear/editar/confirmar
- [ ] Trabajador: header personalizado con nombre, gremio y obra
- [ ] Trabajador: calendario solo semana, sin drag & drop
- [ ] Trabajador: paneles de subcontratas y notas ocultos
- [ ] Datos filtrados por recursoId del trabajador

---

### PO-21 — Frontend: Conexiones bidireccionales

**Tipo:** Enhancement Frontend
**Prioridad:** Media
**Dependencias:** PO-10

#### Qué hacer

**1. Desde la página de Planificación**

| Destino | Cómo |
|---|---|
| **Obras** (`/saas/construction-projects`) | Click en nombre de obra en calendario, tabla o paneles |
| **Equipo** (`/saas/team`) | Click en nombre de trabajador en calendario o tabla |
| **Horarios y Vacaciones** (`/saas/equipo/horarios-vacaciones`) | Link en panel de notas + tooltip en conflictos tipo `vacaciones` |
| **Compras y Stock** (`/saas/purchase-orders`) | Botón "Crear pedido" en panel de materiales |
| **Documentación** (`/saas/construction-plans`) | Link en panel de notas y documentación |
| **Dashboard** (`/saas/dashboard`) | Breadcrumb o botón de vuelta |
| **Ejecución** (`/saas/construction-execution`) | Link "Ver partes de esta obra" en drawer de asignación |
| **Tareas** (`/saas/construction-tasks`) | Click en tarea vinculada en drawer |
| **Presupuestos** (`/saas/construction-budgets`) | Link en hitos tipo `entrega_parcial` o `entrega_final` |

**2. Desde otros módulos hacia Planificación**

| Origen | Cómo |
|---|---|
| **ConstructionProjects.tsx** | Botón "Planificar obra" en cada proyecto → navega a `/saas/construction-planning?projectId=cprj-xxx` |
| **ConstructionTasks.tsx** | Botón "Ver en planificación" en cada tarea → navega con filtro de tarea |
| **ConstructionWorkers.tsx** | Botón "Ver planificación" en ficha de trabajador → navega con filtro de recurso |
| **ConstructionSubcontractors.tsx** | Botón "Ver asignaciones" → navega con filtro tipo `subcontrata` + recurso |
| **ConstructionDashboard.tsx** | Acceso rápido "Planificación de obra" (botón prominente) |
| **ConstructionExecution.tsx** | Link "Ver planificación de esta obra" |

**3. Query params soportados**

La página de planificación debe leer y aplicar query params al montar:

| Param | Efecto |
|---|---|
| `projectId` | Preseleccionar obra en filtros |
| `recursoId` | Preseleccionar recurso en filtros |
| `tipoRecurso` | Preseleccionar tipo de recurso |
| `dateFrom` / `dateTo` | Preseleccionar rango de fechas |
| `view` | Forzar vista (calendar / table) |

#### Criterios de aceptación

- [ ] Links desde planificación a 9 destinos diferentes
- [ ] Botones "Planificar"/"Ver planificación" en 6 módulos origen
- [ ] Query params funcionales: projectId, recursoId, tipoRecurso, dateFrom, dateTo, view
- [ ] Navegación bidireccional fluida sin pérdida de contexto

---

## Resumen de dependencias

```
PO-01 (Modelo planning entry)
 ├── PO-04 (API planning entries)
 │    ├── PO-07 (Endpoint agregado) ←── bloquea frontend
 │    │    ├── PO-10 (Shell, routing, sidebar) ←── bloquea toda la UI
 │    │    │    ├── PO-11 (Vista calendario)
 │    │    │    ├── PO-12 (Vista tabla)
 │    │    │    ├── PO-13 (Drawer entrada)
 │    │    │    ├── PO-14 (Panel hitos)
 │    │    │    ├── PO-15 (Panel maquinaria)
 │    │    │    ├── PO-16 (Panel materiales)
 │    │    │    ├── PO-17 (Panel subcontratas)
 │    │    │    ├── PO-18 (Panel notas/docs)
 │    │    │    ├── PO-19 (Panel alertas)
 │    │    │    ├── PO-20 (Gerente vs trabajador)
 │    │    │    └── PO-21 (Conexiones bidireccionales)
 │    ├── PO-08 (Automatizaciones)
 │    └── PO-09 (Alertas)
 │
PO-02 (Modelo milestone)
 └── PO-05 (API milestones)
 │
PO-03 (Modelo material need)
 └── PO-06 (API material needs)
```

## Orden de ejecución recomendado

### Fase 1 — Modelos de datos (semana 1)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-01 | Modelo planning entry | Backend | Crítica |
| PO-02 | Modelo milestone | Backend | Alta |
| PO-03 | Modelo material need | Backend | Alta |

### Fase 2 — APIs REST (semana 2)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-04 | API planning entries | Backend | Crítica |
| PO-05 | API milestones | Backend | Alta |
| PO-06 | API material needs | Backend | Alta |
| PO-07 | Endpoint agregado | Backend | Crítica |

### Fase 3 — Backend inteligente (semana 3)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-08 | Automatizaciones | Backend | Alta |
| PO-09 | Alertas planificación | Backend | Alta |

### Fase 4 — Shell y vistas principales (semanas 4-5)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-10 | Shell, routing, sidebar | Frontend | Crítica |
| PO-11 | Vista calendario | Frontend | Crítica |
| PO-12 | Vista tabla | Frontend | Alta |
| PO-13 | Drawer entrada planificación | Frontend | Crítica |

### Fase 5 — Paneles y widgets (semanas 6-7)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-14 | Panel hitos y fechas clave | Frontend | Alta |
| PO-15 | Panel maquinaria | Frontend | Media |
| PO-16 | Panel materiales previstos | Frontend | Alta |
| PO-17 | Panel subcontratas | Frontend | Alta |
| PO-18 | Panel notas y documentación | Frontend | Media |
| PO-19 | Panel alertas planificación | Frontend | Alta |

### Fase 6 — Perfiles y conexiones (semana 8)
| Ticket | Nombre | Tipo | Prioridad |
|---|---|---|---|
| PO-20 | Gerente vs trabajador | Frontend | Alta |
| PO-21 | Conexiones bidireccionales | Frontend | Media |

---

## Notas de diseño

### Paleta de colores
- Asignaciones trabajador: amber/orange
- Asignaciones maquinaria: sky/cyan
- Asignaciones subcontrata: violet/purple
- Hitos: emerald (cumplido), amber (próximo), red (retrasado)
- Conflictos: red
- Materiales: orange/amber
- Estados: planificado=gray, confirmado=blue, en_curso=green, completado=emerald, cancelado=red

### Convenciones UI
- `Layout` de `components/saas/Layout`
- Dark mode obligatorio
- Iconos: `lucide-react`
- `rounded-xl/2xl`
- `border-2 border-gray-200 dark:border-gray-700`
- `shadow-sm` en hover
- `transition-all 150-200ms`
- Fechas: `dd/MM/yyyy` con `toLocaleDateString('es-ES')`
- Moneda: `toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })`

### Patrón estado/fetching
- `useState` + `useMemo` + `useCallback` (sin Redux/Zustand)
- `constructionApi.ts` para todas las llamadas HTTP
- `useAuth()` para userId/role
- Polling 60s como fallback
- Debounce 300ms en filtros
- `useModalClose` para drawers y modals

### Referencia visual
Mismo patrón que `ConstructionProjects.tsx` para KPIs y layout general. Calendario inspirado en `SchedulesVacations.tsx` (vista calendario semanal con filas por recurso). Tabla con filtros en cabecera como `ConstructionTasks.tsx`. Drawer tipo `DailyReportDrawer.tsx` con tabs.

### Librería de calendario
No introducir dependencia externa pesada (FullCalendar, etc.). Construir calendario custom con CSS Grid siguiendo el patrón de `SchedulesVacations.tsx` que ya implementa un calendario semanal con drag. Para la vista Gantt, usar `div` + CSS con `overflow-x: auto` y escalado por botones de zoom.
