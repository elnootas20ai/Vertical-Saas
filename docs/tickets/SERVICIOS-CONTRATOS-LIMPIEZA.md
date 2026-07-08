# SERVICIOS Y CONTRATOS (Vertical Limpieza) — Plan de Tickets

**Página:** `/saas/vertical/limpieza/servicios`
**Objetivo:** Controlar qué servicio se presta, dónde, con qué frecuencia y por cuánto dinero.
**Fecha:** 2026-04-14

## Estado auditado (08/07/2026)

**~38% completado (38/99 criterios).** Backend prácticamente completo: modelo `service_contract` (SVC-01) con CRUD, activate/pause/cancel/renew, stats y motor de generación de servicios (SVC-04) en `cleaningController.js` + `cleaningRouter.js` (`/api/cleaning/service-contracts`). Facturación parcial vía `cleaningBillingEngine.js` y alertas vía `cleaningAlertEngine.js`. `ServiceContractsPage.tsx` existe con KPIs, tabla y modal, pero las pestañas Calendario y Servicios son placeholders ("Próximamente"), no hay wizard, ni detalle de contrato, ni selector CRM/equipo (cliente y trabajador siguen siendo texto libre), ni vista diferenciada trabajador. Faltan: SVC-02 (vínculo CRM), SVC-03 (selector equipo), SVC-05 (calendario), SVC-11 (dashboard) y la mayoría de conexiones frontend.

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de servicios de limpieza (back) | Completo | `cleaningController.js`, `cleaningRouter.js` — endpoints `GET/POST/PUT/DELETE /api/cleaning/services/:userId` |
| API client de servicios | Completo | `cleaningApi.ts` — `CleaningService`, `listCleaningServicesRequest`, `create/update/delete` |
| Modelo de datos `cleaning_service` | Completo | `couchdb.js` — `buildCleaningServiceDocument`, `sanitizeCleaningService` — DB `*-cleaning` |
| Página de gestión de servicios (UI) | Completo | `CleaningServices.tsx` — tabs por estado, búsqueda, modal crear/editar, detalle con cambio de estado |
| Tipos de servicio (cleaningType) | Completo | `CleaningServices.tsx` — general, oficinas, industrial, post-obra, cristales, desinfección, limpieza profunda |
| Tipos de cliente (clientType) | Parcial | `CleaningServices.tsx` — vivienda, oficina, comercio, industrial, comunidad (faltan: tienda, nave, gimnasio, domicilio, final de obra) |
| Checklist de tareas por tipo | Completo | `CleaningServices.tsx` — `DEFAULT_TASKS` con tareas predefinidas por tipo de limpieza |
| Estados del servicio | Completo | `cleaningApi.ts` — `pending`, `assigned`, `in_progress`, `completed`, `cancelled` |
| Campos de cliente | Parcial | `clientName`, `clientPhone`, `clientEmail`, `address` — texto libre, NO vinculado a CRM |
| Asignación de trabajador | Parcial | `assignedToName` como texto libre; `assignedTo` existe pero vacío — NO vinculado al equipo |
| Precio | Parcial | Campo `price` numérico único — NO diferencia mensual vs. por servicio |
| Fecha/hora | Parcial | `date` + `time` + `duration` — una sola fecha, NO frecuencia ni recurrencia |
| Check-in/out (modelo) | Existe sin usar | `checkInAt`, `checkOutAt` en modelo — la UI no los rellena sistemáticamente |
| Fotos antes/después (modelo) | Existe sin usar | `photosBefore[]`, `photosAfter[]` en modelo — la UI no los implementa |
| Calidad | Completo | `CleaningQuality.tsx` — `qualityRating`, `qualityNotes`, `qualityOk` |
| Opiniones de clientes | Completo | `CleaningReviews.tsx` — `clientRating`, `clientReview`, `clientReviewAt` |
| Checklist del trabajador | Completo | `CleaningChecklist.tsx` — toggles de tareas, progreso |
| TPV del trabajador | Completo | `WorkerTpvCleaning.tsx` — lista servicios hoy/pendientes/completados, inicio/fin, notas |
| Facturación (modelo) | Parcial | `invoiceId` como string — NO genera factura automáticamente |
| Incidencias (modelo back) | Existe sin API | `cleaning_incident` en `couchdb.js` — build/sanitize/list, pero sin endpoints en router |
| Sidebar vertical limpieza | Completo | `Sidebar.tsx` — grupo `cleaning` con 4 ítems: Servicios, Checklist, Calidad, Opiniones |
| Rutas SPA | Completo | `routes.tsx` — `cleaning-services`, `cleaning-checklist`, `cleaning-quality`, `cleaning-reviews` |
| Numeración automática | Completo | `serviceNumber` con prefijo `SVC-` + sufijo base36 |
| Borrado lógico | Completo | `softDeleteDocument` con campo `deletedAt` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Página unificada en `/saas/vertical/limpieza/servicios` | No existe — la actual está en `/saas/cleaning-services` sin concepto de "contrato" |
| Concepto de contrato/servicio recurrente | No existe — cada servicio es un evento puntual sin frecuencia |
| Campo frecuencia (semanal, quincenal, mensual, etc.) | No existe |
| Campo horas contratadas por servicio/mes | No existe — solo `duration` como texto libre |
| Modelo de precio mensual vs. precio por servicio | No existe — solo un campo `price` genérico |
| Campo horario estructurado (días + franjas) | No existe — solo `time` como texto simple |
| Vinculación con trabajador del equipo (ID + nombre) | No implementado — `assignedToName` es texto libre |
| Campo materiales necesarios | No existe |
| Campo observaciones de contrato vs. notas del servicio | No diferenciado — solo `notes` |
| Estado del contrato (activo, pausado, en renovación, finalizado) | No existe — solo estado de ejecución del servicio |
| Vinculación con CRM (cliente como entidad) | No implementado — cliente es texto libre |
| Generación automática de servicios recurrentes desde contrato | No implementado |
| Generación de calendario de servicios | No implementado |
| Vinculación automática servicio → cliente → facturación | No implementado |
| Alerta: servicio sin asignar | No implementado |
| Alerta: contrato próximo a renovar | No implementado |
| Alerta: servicio sin horario definido | No implementado |
| Alerta: cliente con servicio sin cubrir | No implementado |
| Conexión con Rutas (planificación por zona) | No existe |
| Conexión con Fichajes (check-in/out real del servicio) | Parcial — campos existen pero no se usan |
| Conexión bidireccional Dashboard ↔ Servicios | No implementado |
| Diferenciación perfil gerente vs. trabajador en la página | No implementado — todos ven lo mismo |
| Tipos de cliente ampliados (gimnasio, nave, tienda, domicilio) | Parcial — faltan varios tipos del requisito |

---

## Tickets

---

### SVC-01 — Modelo de datos: Contrato de servicio recurrente

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto
Actualmente `cleaning_service` representa un evento puntual de limpieza (una fecha, una hora, un precio). No existe concepto de "contrato de servicio" que defina la relación continua con un cliente: qué se limpia, con qué frecuencia, cuántas horas, a qué precio mensual, en qué horario, quién va y qué materiales se necesitan. Este documento es la piedra angular de toda la página de Servicios y Contratos.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-cleaning`**

```typescript
export type ServiceFrequency =
  | 'daily'          // Diario (L-V)
  | 'daily_all'      // Diario (L-S o L-D)
  | 'weekly_1'       // 1 vez/semana
  | 'weekly_2'       // 2 veces/semana
  | 'weekly_3'       // 3 veces/semana
  | 'weekly_4'       // 4 veces/semana
  | 'weekly_5'       // 5 veces/semana
  | 'biweekly'       // Quincenal
  | 'monthly'        // Mensual
  | 'on_demand'      // Bajo demanda (sin recurrencia)
  | 'custom';        // Personalizada

export type ServiceContractStatus =
  | 'draft'          // Borrador (aún no activo)
  | 'active'         // Activo y generando servicios
  | 'paused'         // Pausado temporalmente
  | 'pending_renewal'// Próximo a vencer
  | 'expired'        // Vencido sin renovar
  | 'cancelled';     // Cancelado

export type PricingModel = 'monthly' | 'per_service' | 'per_hour';

export type ServiceClientType =
  | 'office'          // Oficina
  | 'community'       // Comunidad de vecinos
  | 'shop'            // Tienda / comercio
  | 'warehouse'       // Nave industrial
  | 'gym'             // Gimnasio
  | 'home'            // Domicilio particular
  | 'post_construction'// Final de obra
  | 'restaurant'      // Restaurante / bar
  | 'clinic'          // Clínica / consultorio
  | 'hotel'           // Hotel / alojamiento
  | 'school'          // Centro educativo
  | 'other';          // Otro

export interface ServiceScheduleSlot {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
}

export interface ServiceContract {
  _id: string;                  // scontract:{user_id}:{uuid}
  _rev?: string;
  type: 'service_contract';
  user_id: string;
  contractNumber: string;       // CTR-XXXX (numeración configurable)

  // ── Cliente ──
  clientId?: string;            // ID de CRM client (si vinculado)
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientType: ServiceClientType;

  // ── Ubicación ──
  address: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  coordinates?: { lat: number; lng: number };
  zone?: string;                // Zona/ruta para agrupar servicios geográficamente

  // ── Servicio ──
  cleaningType: string;         // Reutiliza los tipos de CleaningServices.tsx
  frequency: ServiceFrequency;
  customFrequencyDays?: number[];  // Si frequency === 'custom': array de días del mes (1-31)
  scheduleDays?: ServiceScheduleSlot[];  // Días y horarios concretos
  contractedHoursPerVisit: number;  // Horas contratadas por visita
  contractedVisitsPerMonth?: number; // Visitas por mes (calculado o manual)

  // ── Precio ──
  pricingModel: PricingModel;
  monthlyPrice?: number;        // Si pricingModel === 'monthly'
  pricePerService?: number;     // Si pricingModel === 'per_service'
  pricePerHour?: number;        // Si pricingModel === 'per_hour'
  taxRate: number;              // % IVA (default 21)
  taxIncluded: boolean;         // true = el precio ya incluye IVA

  // ── Asignación ──
  assignedWorkerId?: string;    // ID del miembro del equipo
  assignedWorkerName?: string;
  backupWorkerId?: string;      // Trabajador suplente
  backupWorkerName?: string;

  // ── Materiales ──
  materials: string[];          // Lista de materiales necesarios (texto libre)
  materialsIncluded: boolean;   // true = la empresa aporta materiales; false = el cliente los tiene

  // ── Contrato ──
  contractStatus: ServiceContractStatus;
  startDate: string;            // YYYY-MM-DD inicio del contrato
  endDate?: string;             // YYYY-MM-DD fin (vacío = indefinido)
  renewalDate?: string;         // YYYY-MM-DD fecha de renovación
  autoRenew: boolean;           // Renovación automática al vencer
  renewalNoticeDays: number;    // Días antes de vencimiento para alertar (default: 30)

  // ── Observaciones ──
  observations: string;         // Notas internas sobre el contrato
  clientInstructions: string;   // Instrucciones específicas del cliente

  // ── Facturación ──
  billingEnabled: boolean;      // true = generar facturas automáticamente
  billingDay?: number;          // Día del mes para facturar (1-28)
  linkedInvoiceIds: string[];   // IDs de facturas generadas

  // ── Meta ──
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

**2. Crear `src/app/lib/serviceContractsApi.ts`**

| Función | Descripción |
|---|---|
| `listServiceContracts(userId)` | Listar contratos de servicio del usuario |
| `getServiceContract(userId, contractId)` | Obtener un contrato por ID |
| `saveServiceContract(userId, data, existing?)` | Crear/editar contrato |
| `deleteServiceContract(userId, contractId)` | Borrado lógico |
| `activateContract(userId, contractId)` | Cambiar status a `active` |
| `pauseContract(userId, contractId)` | Cambiar status a `paused` |
| `cancelContract(userId, contractId, reason?)` | Cambiar status a `cancelled` |
| `renewContract(userId, contractId, newEndDate?)` | Renovar contrato (extiende `endDate`, actualiza `renewalDate`) |
| `getContractsByClient(userId, clientId)` | Contratos de un cliente CRM |
| `getContractsByWorker(userId, workerId)` | Contratos asignados a un trabajador |
| `getContractsByZone(userId, zone)` | Contratos por zona geográfica |
| `getContractStats(userId)` | Resumen: activos, pausados, por renovar, facturación estimada mensual |

**3. Endpoints backend en `cleaningRouter.js`**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/contracts/:userId` | GET | Listar contratos (soporta query: `?status=active&clientId=X&workerId=Y&zone=Z`) |
| `/api/cleaning/contracts/:userId` | POST | Crear contrato |
| `/api/cleaning/contracts/:userId/:contractId` | GET | Obtener un contrato |
| `/api/cleaning/contracts/:userId/:contractId` | PUT | Actualizar contrato |
| `/api/cleaning/contracts/:userId/:contractId` | DELETE | Borrado lógico |
| `/api/cleaning/contracts/:userId/:contractId/activate` | POST | Activar contrato |
| `/api/cleaning/contracts/:userId/:contractId/pause` | POST | Pausar contrato |
| `/api/cleaning/contracts/:userId/:contractId/cancel` | POST | Cancelar contrato |
| `/api/cleaning/contracts/:userId/:contractId/renew` | POST | Renovar contrato |
| `/api/cleaning/contracts/:userId/stats` | GET | Estadísticas globales |

**4. CouchDB: builders y sanitizers en `couchdb.js`**

- `buildServiceContractDocument(data, existing?)` — Construye el documento con defaults y validaciones
- `sanitizeServiceContract(doc)` — Sanitiza para respuesta al cliente
- `listServiceContractsByUser(req, userId, filters?)` — Lista con filtros opcionales

**5. Numeración configurable**

Añadir tipo `service_contract` a `DEFAULT_NUMBERING` en `settingsController.js` con prefijo `CTR-` y mismo patrón que `contract`.

#### Criterios de aceptación
- [x] Documento `service_contract` se persiste en la DB `*-cleaning`
- [x] CRUD completo funcional desde API client y endpoints REST
- [x] Soporta los 12 tipos de cliente definidos
- [x] Soporta 3 modelos de precio (mensual, por servicio, por hora)
- [x] Soporta frecuencias desde diario hasta bajo demanda + personalizada
- [x] Horario definido como array de slots (día + hora inicio + hora fin)
- [ ] Trabajador asignado vinculado por ID del equipo (no texto libre) — el modelo tiene `assignedWorkerId` pero la UI solo guarda el nombre
- [x] Materiales como array de strings con flag de quién los aporta
- [x] Estado del contrato independiente del estado de ejecución del servicio
- [x] Numeración automática con prefijo `CTR-`
- [x] Borrado lógico con `deletedAt`

---

### SVC-02 — Vinculación con CRM: Cliente como entidad

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** SVC-01

#### Contexto
Actualmente los datos del cliente en `cleaning_service` son texto libre (`clientName`, `clientPhone`, etc.). No hay vínculo con la entidad `client` del CRM (`clientsController.js`, `clientsApi.ts`). El contrato de servicio necesita poder vincularse a un cliente existente del CRM para heredar datos, facturar correctamente y dar visibilidad cruzada.

#### Qué hacer

**1. Selector de cliente CRM en el formulario de contrato**

En el modal de creación/edición de contrato:
- Campo "Cliente" con buscador autocompletable que busca en clientes CRM del usuario
- Al seleccionar un cliente: rellena automáticamente `clientId`, `clientName`, `clientPhone`, `clientEmail`, `address`
- Opción "Cliente nuevo": abre mini-formulario inline para crear un cliente CRM al vuelo y vincularlo
- Opción "Sin vincular": permite rellenar datos a mano (retrocompatibilidad)
- Si se selecciona un cliente existente, los campos de contacto se muestran en solo lectura con link "Editar en CRM →"

**2. Vista de servicios/contratos desde ficha del cliente CRM**

En `ClientDetail.tsx` (o equivalente), añadir pestaña o sección:

```
┌────────────────────────────────────────┐
│  🧹 Servicios de limpieza              │
│                                         │
│  Contratos activos: 2                  │
│                                         │
│  CTR-0012 · Oficina C/ Mayor 15        │
│  3 veces/semana · 450 €/mes · María G. │
│  Estado: Activo                         │
│                                         │
│  CTR-0015 · Nave P.I. Sur              │
│  Semanal · 80 €/servicio · Pedro R.    │
│  Estado: Activo                         │
│                                         │
│  [+ Nuevo contrato para este cliente]  │
│  [Ver todos los servicios →]           │
└────────────────────────────────────────┘
```

**3. Sincronización de datos**

- Si se actualiza el teléfono/email del cliente en CRM, los contratos vinculados reflejan los datos actualizados (leídos en tiempo real desde CRM, no duplicados)
- El campo `clientName` en el contrato se usa solo como cache para listados rápidos; el dato maestro está en CRM
- Si se elimina un cliente del CRM, los contratos vinculados muestran aviso "Cliente eliminado" sin romper

#### Criterios de aceptación
- [ ] Selector autocompletable de clientes CRM en el formulario de contrato
- [ ] Al seleccionar cliente, se rellena `clientId` + datos de contacto
- [ ] Opción de crear cliente CRM al vuelo desde el formulario
- [ ] Opción de no vincular (datos manuales)
- [ ] Pestaña/sección de servicios visible en la ficha del cliente CRM
- [ ] El resumen muestra contratos activos con datos clave
- [ ] Link directo desde ficha del cliente a la página de servicios filtrada

---

### SVC-03 — Vinculación con equipo: Asignación de trabajador

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** SVC-01

#### Contexto
La asignación actual es un campo de texto libre `assignedToName` sin conexión con los miembros del equipo. El contrato necesita asignar un trabajador por su ID real del sistema para que luego se pueda: generar calendario, vincular con fichajes, asignar a rutas, y que el trabajador vea sus servicios asignados en su TPV.

#### Qué hacer

**1. Selector de trabajador del equipo en el formulario**

- Dropdown que lista miembros del equipo del usuario (vía `listTeamMembersRequest` o endpoint existente `/api/orgchart/:userId`)
- Al seleccionar: guarda `assignedWorkerId` + `assignedWorkerName` (denormalizado)
- Mostrar avatar + nombre + rol del trabajador
- Opción "Sin asignar" (queda como `pending` y genera alerta SVC-07)
- Segundo selector opcional: "Trabajador suplente" → `backupWorkerId`/`backupWorkerName`

**2. Vista de servicios asignados en el perfil del trabajador**

En `TeamMemberDetail.tsx`, añadir sección:

```
┌────────────────────────────────────────┐
│  🧹 Servicios asignados                │
│                                         │
│  Contratos: 4 activos                  │
│  Horas semanales: 28h                  │
│                                         │
│  Lun 09:00-12:00 · Oficina Acme        │
│  Lun 14:00-17:00 · Comunidad Flores    │
│  Mar 08:00-11:00 · Tienda Moda S.L.    │
│  Mar 12:00-14:00 · Gimnasio FitBox     │
│  ...                                    │
│                                         │
│  [Ver agenda completa →]               │
└────────────────────────────────────────┘
```

**3. Validación de disponibilidad**

Al asignar un trabajador a un contrato:
- Comprobar si el trabajador tiene conflicto de horario con otros contratos asignados
- Si hay conflicto: mostrar advertencia "María García ya tiene servicio L-M-V 09:00-12:00 en Oficina Acme" con opción de continuar o cambiar horario
- Calcular carga semanal total del trabajador (sumando horas de todos sus contratos)

**4. Migración de datos existentes**

Los `cleaning_service` existentes con `assignedToName` relleno pero sin `assignedTo`:
- En la UI, mostrar aviso: "Este servicio tiene trabajador por nombre pero sin vincular al equipo"
- Ofrecer botón "Vincular" que abre el selector y actualiza el registro

#### Criterios de aceptación
- [ ] Selector de trabajadores del equipo real (no texto libre)
- [ ] Guarda `assignedWorkerId` + `assignedWorkerName` — el modelo lo soporta, pero el formulario solo envía el nombre
- [x] Soporte para trabajador suplente
- [ ] Validación de conflicto horario al asignar
- [ ] Carga semanal visible (horas totales del trabajador)
- [ ] Sección en TeamMemberDetail con servicios asignados
- [ ] Migración suave de datos existentes con aviso y botón vincular

---

### SVC-04 — Motor de generación de servicios recurrentes

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** SVC-01

#### Contexto
Un contrato define QUÉ se hace, DÓNDE, CUÁNDO y QUIÉN. Pero el servicio puntual (`cleaning_service`) es lo que realmente se ejecuta día a día. Necesitamos un motor que, a partir de un contrato activo, genere automáticamente los `cleaning_service` individuales para el período deseado (semana, mes).

#### Qué hacer

**1. Crear `src/app/lib/serviceGeneratorEngine.ts`**

```typescript
export interface GenerationOptions {
  contractId: string;
  fromDate: string;          // YYYY-MM-DD
  toDate: string;            // YYYY-MM-DD
  skipExisting: boolean;     // No duplicar si ya existe un servicio para esa fecha/hora
}

export interface GenerationResult {
  generated: number;
  skipped: number;
  errors: string[];
  services: CleaningService[];
}
```

| Función | Descripción |
|---|---|
| `generateServicesFromContract(userId, contract, options)` | Genera servicios individuales para el rango de fechas según la frecuencia y horario del contrato |
| `generateWeeklyServices(userId, contractId)` | Atajo: genera servicios para la semana que viene |
| `generateMonthlyServices(userId, contractId)` | Atajo: genera servicios para el mes que viene |
| `getNextServiceDates(contract, fromDate, toDate)` | Calcula las fechas en que toca servicio según la frecuencia |
| `hasServiceForDate(userId, contractId, date)` | Comprueba si ya existe un servicio generado para esa fecha |

**2. Lógica de cálculo de fechas**

Para cada frecuencia:
- `daily` / `daily_all`: lunes a viernes / lunes a sábado o domingo
- `weekly_N`: N días de la semana según `scheduleDays[]`
- `biweekly`: mismo día cada 2 semanas
- `monthly`: mismo día del mes (o último si el mes tiene menos días)
- `on_demand`: no genera automáticamente (solo manual)
- `custom`: usa `customFrequencyDays[]` como días del mes

**3. Generación automática del `cleaning_service`**

Cada servicio generado incluye:
```typescript
{
  type: 'cleaning_service',
  contractId: contract._id,       // NUEVO CAMPO: vinculación al contrato
  contractNumber: contract.contractNumber,
  clientName: contract.clientName,
  clientPhone: contract.clientPhone,
  clientEmail: contract.clientEmail,
  address: contract.address,
  clientType: contract.clientType,
  date: calculatedDate,           // Fecha calculada por el motor
  time: slot.startTime,           // Del scheduleDays del contrato
  duration: contract.contractedHoursPerVisit.toString(),
  cleaningType: contract.cleaningType,
  assignedTo: contract.assignedWorkerId,
  assignedToName: contract.assignedWorkerName,
  status: contract.assignedWorkerId ? 'assigned' : 'pending',
  tasks: defaultTasksForType(contract.cleaningType),
  price: calculateServicePrice(contract),
  notes: contract.clientInstructions,
}
```

**4. Campo `contractId` en `CleaningService` existente**

Ampliar `CleaningService` en `cleaningApi.ts`:
```typescript
export interface CleaningService {
  // ... campos existentes ...
  contractId?: string;          // ID del contrato que generó este servicio
  contractNumber?: string;      // Número del contrato (desnormalizado)
}
```

Actualizar `buildCleaningServiceDocument` y `sanitizeCleaningService` en `couchdb.js` para incluir `contractId` y `contractNumber`.

**5. Endpoint de generación**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/contracts/:userId/:contractId/generate` | POST | Body: `{ fromDate, toDate, skipExisting }`. Genera servicios para el rango. |
| `/api/cleaning/contracts/:userId/generate-all` | POST | Body: `{ fromDate, toDate }`. Genera servicios para TODOS los contratos activos. |

**6. Generación batch programable**

Función en el servidor que se ejecuta automáticamente (cron o al iniciar semana):
- Buscar contratos activos con `scheduleDays` definidos
- Para cada contrato: generar servicios de la semana siguiente si no existen
- Log de la generación para trazabilidad

#### Criterios de aceptación
- [x] Los servicios individuales se generan correctamente según frecuencia y horario
- [x] No se duplican servicios para la misma fecha/hora/contrato
- [x] Los servicios generados incluyen `contractId` para trazabilidad
- [x] Soporta todas las frecuencias definidas en SVC-01
- [x] El endpoint `generate` funciona para un contrato y para todos
- [ ] Los servicios generados heredan: cliente, dirección, tipo, trabajador, tareas, precio — todo salvo las tareas (no se copian las `tasks` por tipo)
- [x] El precio por servicio se calcula correctamente según el modelo (mensual/por servicio/por hora)
- [ ] Generación batch automática para la semana siguiente — solo bajo demanda vía endpoint, sin cron

---

### SVC-05 — Calendario de servicios

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** SVC-01, SVC-04

#### Contexto
No existe una vista de calendario para los servicios de limpieza. El gerente necesita ver de un vistazo qué servicios hay cada día de la semana, quién va, a qué hora y dónde. El calendario es la herramienta principal para la planificación operativa diaria.

#### Qué hacer

**1. Vista semanal (principal)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CALENDARIO DE SERVICIOS                    < Semana 16 (14-20 Abr) >      │
│  [Semana] [Mes] [Día]    Filtros: [Trabajador ▾] [Cliente ▾] [Zona ▾]     │
├─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬──────────────┤
│  Lunes  │  Martes │ Miérc.  │  Jueves │ Viernes │  Sábado │   Domingo    │
│  14/04  │  15/04  │  16/04  │  17/04  │  18/04  │  19/04  │    20/04     │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼──────────────┤
│ 08:00   │         │ 08:00   │         │ 08:00   │ 09:00   │              │
│ ┌─────┐ │         │ ┌─────┐ │         │ ┌─────┐ │ ┌─────┐ │              │
│ │Acme │ │         │ │Acme │ │         │ │Acme │ │ │Nave │ │              │
│ │María│ │         │ │María│ │         │ │María│ │ │Pedro│ │              │
│ │3h   │ │         │ │3h   │ │         │ │3h   │ │ │4h   │ │              │
│ └─────┘ │         │ └─────┘ │         │ └─────┘ │ └─────┘ │              │
│ 12:00   │ 09:00   │ 12:00   │ 09:00   │ 12:00   │         │              │
│ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │         │              │
│ │Gym  │ │ │Comun│ │ │Gym  │ │ │Comun│ │ │Gym  │ │         │              │
│ │Ana  │ │ │Ana  │ │ │Ana  │ │ │Ana  │ │ │Ana  │ │         │              │
│ │2h   │ │ │2h   │ │ │2h   │ │ │2h   │ │ │2h   │ │         │              │
│ └─────┘ │ └─────┘ │ └─────┘ │ └─────┘ │ └─────┘ │         │              │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴──────────────┘
```

Cada tarjeta de servicio:
- Color según estado: pendiente (amber), asignado (indigo), en progreso (blue), completado (verde), cancelado (gris)
- Nombre del cliente (truncado)
- Nombre del trabajador
- Duración
- Click abre detalle del servicio
- Drag & drop para reasignar fecha (opcional, fase 2)

**2. Vista mensual (resumen)**

Calendario clásico mes completo:
- Cada día muestra número de servicios como badges con color
- Click en un día abre la vista del día con el listado completo
- Días con servicios sin asignar: borde rojo punteado

**3. Vista diaria (detalle)**

Timeline vertical del día:
- Eje vertical: horas (07:00 a 22:00)
- Bloques por trabajador agrupados en columnas
- Cada bloque: cliente, dirección, tipo, estado
- Hueco sin servicio: celda vacía

**4. Filtros del calendario**

| Filtro | Opciones |
|---|---|
| Trabajador | Lista del equipo; "Todos" / "Sin asignar" |
| Cliente | Buscador autocompletable |
| Zona | Lista de zonas configuradas |
| Estado | Pendiente, Asignado, En progreso, Completado, Cancelado |
| Tipo de servicio | Lista de tipos de limpieza |

**5. Acciones rápidas desde el calendario**

- Click en celda vacía: crear servicio manual para esa fecha
- Click en servicio: abrir detalle
- Botón "Generar semana" → llama `generateWeeklyServices` para todos los contratos activos
- Botón "Generar mes" → llama `generateMonthlyServices`
- Indicador visual si la semana/mes ya tiene servicios generados

**6. Responsive**

- Desktop: vista semanal completa con 7 columnas
- Tablet: vista semanal con scroll horizontal
- Móvil: vista diaria como lista vertical + selector de día

#### Criterios de aceptación
- [ ] Vista semanal con servicios posicionados por día/hora
- [ ] Vista mensual con resumen de servicios por día
- [ ] Vista diaria con timeline por trabajador
- [ ] Filtros por trabajador, cliente, zona, estado, tipo
- [ ] Tarjetas con color por estado y datos clave
- [ ] Botones de generación de servicios (semana/mes)
- [ ] Click en servicio abre detalle
- [ ] Navegación entre semanas/meses/días
- [ ] Responsive en los 3 breakpoints
- [ ] Dark mode

---

### SVC-06 — Vinculación automática: Servicio → Cliente → Facturación

**Tipo:** Lógica de negocio (Backend + API Client)
**Prioridad:** Alta
**Dependencias:** SVC-01, SVC-04

#### Contexto
El contrato de servicio debe poder generar facturas automáticamente para el cliente. Actualmente `invoiceId` existe en `cleaning_service` como texto, pero no hay automatización. El ciclo completo es: contrato define precio → servicios se ejecutan → al final del período se genera factura con los servicios realizados.

#### Qué hacer

**1. Generación de factura desde contrato**

Crear `src/app/lib/serviceBillingEngine.ts`:

| Función | Descripción |
|---|---|
| `generateInvoiceFromContract(userId, contractId, period)` | Genera factura para los servicios completados del período |
| `getInvoiceableServices(userId, contractId, fromDate, toDate)` | Servicios completados sin facturar del período |
| `calculateInvoiceAmount(contract, services[])` | Calcula importe según modelo de precio |
| `markServicesAsInvoiced(userId, serviceIds[], invoiceId)` | Marca servicios como facturados |

**2. Lógica de cálculo según modelo de precio**

- **Mensual (`monthly`)**: factura por el importe fijo `monthlyPrice`, independientemente de cuántos servicios se realizaron. Si hubo cancelaciones, se puede aplicar descuento proporcional.
- **Por servicio (`per_service`)**: factura = `pricePerService` × número de servicios `completed` en el período.
- **Por hora (`per_hour`)**: factura = `pricePerHour` × suma de horas reales de los servicios `completed` (si hay check-in/out, usa esas horas; si no, usa `duration` del servicio).

**3. Líneas de factura detalladas**

La factura generada incluye líneas de detalle:
```typescript
{
  description: `Servicio limpieza ${contract.cleaningType} — ${service.date}`,
  quantity: 1,              // o horas si es por hora
  unitPrice: pricePerUnit,
  taxRate: contract.taxRate,
  total: lineTotal,
}
```

**4. Factura se crea vía `clientInvoicesApi.ts`**

- Usa `createClientInvoiceRequest` existente
- Vincula la factura al `clientId` del contrato (requiere SVC-02)
- Guarda los IDs de factura en `contract.linkedInvoiceIds[]`
- Marca cada servicio con `invoiceId`
- Si la automatización FIN-04 está activa (de FINANZAS.md), el cobro de la factura genera movimiento financiero automáticamente

**5. Configuración de facturación en el contrato**

En el formulario del contrato:
- Toggle "Facturación automática" (`billingEnabled`)
- Selector "Día de facturación" (`billingDay`): 1-28 del mes
- Si activado: el sistema genera factura el día indicado de cada mes con los servicios del mes anterior

**6. UI de facturación en la página de servicios**

En el detalle del contrato, pestaña/sección "Facturación":
- Historial de facturas generadas (número, fecha, importe, estado)
- Botón "Generar factura ahora" para generación manual
- Indicador de servicios pendientes de facturar
- Link a cada factura en la vista de facturación del CRM

#### Criterios de aceptación
- [ ] Se puede generar factura desde un contrato para un período — `cleaningBillingEngine.js` factura desde `cleaning_contract`, no desde `service_contract` (no lee `billingEnabled`/`billingDay`)
- [ ] El cálculo respeta el modelo de precio (mensual/servicio/hora)
- [x] La factura se crea vía el sistema de facturas de cliente (`client_invoice`) con líneas detalladas
- [x] Los servicios facturados se marcan con `invoiceId`
- [ ] La facturación automática genera factura el día configurado — solo bajo demanda vía endpoints `/api/cleaning/billing`
- [ ] Historial de facturas visible en el detalle del contrato
- [x] No se duplican facturas para el mismo período (`billingStatus`/`nextInvoiceDate`)
- [x] Compatible con la automatización FIN-04 de Finanzas (`generatePendingFinanceEntry`)

---

### SVC-07 — Sistema de alertas: Servicios y Contratos

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** SVC-01, SVC-04

#### Contexto
No existe ninguna alerta proactiva para servicios de limpieza. Los 4 tipos de alerta requeridos son: servicio sin asignar, contrato próximo a renovar, servicio sin horario definido, y cliente con servicio sin cubrir.

#### Qué hacer

**1. Definir tipos de alerta**

```typescript
export type CleaningAlertType =
  | 'service_unassigned'        // Servicio generado sin trabajador asignado
  | 'contract_renewal_due'      // Contrato próximo a vencer (dentro de renewalNoticeDays)
  | 'service_no_schedule'       // Contrato activo sin horario definido (scheduleDays vacío)
  | 'client_service_uncovered'  // Cliente con contrato activo pero servicios no generados para la semana siguiente
  | 'contract_expired'          // Contrato vencido sin renovar
  | 'service_not_started';      // Servicio asignado para hoy pero no marcado como in_progress

export interface CleaningAlert {
  id: string;
  type: CleaningAlertType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  contractId?: string;
  serviceId?: string;
  clientName: string;
  workerName?: string;
  date?: string;
  actionLabel: string;
  actionRoute: string;
  createdAt: string;
  dismissed: boolean;
}
```

**2. Reglas de alertas en `alertEngine.js`**

| Alerta | Condición | Severity | Ejemplo |
|---|---|---|---|
| Servicio sin asignar | `cleaning_service` con `status === 'pending'` y `date` dentro de los próximos 3 días | `critical` | "Servicio el 16/04 para Oficina Acme sin trabajador asignado" |
| Contrato próximo a renovar | `service_contract` con `endDate` dentro de `renewalNoticeDays` y `autoRenew === false` | `warning` | "Contrato CTR-0012 (Gimnasio FitBox) vence en 15 días" |
| Servicio sin horario | `service_contract` con `contractStatus === 'active'` y `scheduleDays` vacío o sin definir | `warning` | "Contrato CTR-0018 (Comunidad Flores) activo pero sin horario definido" |
| Cliente sin cubrir | `service_contract` con `contractStatus === 'active'` pero sin servicios generados para la próxima semana | `critical` | "Cliente Acme S.L. no tiene servicios generados para la semana del 21/04" |
| Contrato vencido | `service_contract` con `endDate` pasado y `contractStatus !== 'cancelled'` | `critical` | "Contrato CTR-0009 venció el 31/03 sin renovar" |
| Servicio no iniciado | `cleaning_service` con `date === hoy` y `status === 'assigned'` y hora actual > `time` + 30 min | `warning` | "Servicio de las 09:00 en Tienda Moda no se ha iniciado (09:45)" |

**3. Integración con alertEngine existente**

Añadir función `checkCleaningAlerts(userId, contracts[], services[], config)` en `alertEngine.js`:
- Ejecutar las 6 reglas anteriores
- Usar `emitAlert()` con dedup por `_id` para evitar duplicados
- Respetar configuración de activación/desactivación por regla

**4. Banner de alertas en la página de servicios**

Mismo patrón que HORARIOS-VACACIONES.md (HV-06):
- Banner colapsable en la parte superior de la página
- Alertas `critical`: borde rojo, icono `AlertTriangle`
- Alertas `warning`: borde amber, icono `AlertCircle`
- Cada alerta con botón de acción que lleva al recurso correspondiente
- Contador de alertas en el sidebar junto a "Servicios"

#### Criterios de aceptación
- [ ] Se generan los 6 tipos de alerta definidos — el motor `cleaningAlertEngine.js` cubre `service_uncovered` y `contract_renewal` (+9 reglas más), pero faltan `service_no_schedule`, `client_service_uncovered` y `contract_expired` como tales
- [x] Las alertas se integran en el sistema de alertas global (motor dedicado `cleaningAlertEngine` + `emitGlobalAlert`)
- [ ] Banner visible en la página de servicios con diseño correcto por severity
- [ ] Cada alerta tiene botón de acción funcional
- [ ] Alertas dismissables (localStorage)
- [ ] Contador de alertas en el sidebar
- [x] Configuración de activación/desactivación por regla (`getCleaningAlertConfig`)

---

### SVC-08 — Página unificada: Servicios y Contratos

**Tipo:** Frontend (Página nueva)
**Prioridad:** Crítica
**Dependencias:** SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-07

#### Contexto
La página actual `/saas/cleaning-services` es un CRUD básico con tabs por estado. El requisito es una página unificada en `/saas/vertical/limpieza/servicios` que integre contratos, servicios, calendario, alertas y KPIs con una UX superior para gerentes. Es el hub central de la operativa de servicios de limpieza.

#### Qué hacer

**1. Crear `src/app/pages/saas/ServiceContractsPage.tsx`**

Layout general:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SERVICIOS Y CONTRATOS                                                    │
│  Controla qué servicio se presta, dónde, con qué frecuencia              │
│  y por cuánto dinero                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  [⚠ 3 alertas activas]  ← Banner colapsable (SVC-07)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  📊 KPIs rápidos (5 cards)                                               │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │Contratos  │ │Servicios  │ │Facturación│ │Horas      │ │Alertas    │ │
│  │activos    │ │esta semana│ │mensual est│ │semanales  │ │activas    │ │
│  │  18       │ │   42      │ │ 8.450 €   │ │  126h     │ │   3       │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│  Tabs:                                                                    │
│  [Contratos] [Calendario] [Servicios] [Mapa de zonas]                    │
│                                                                           │
│  (contenido de la pestaña activa)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**2. Pestaña "Contratos" (pestaña principal)**

Lista de contratos con tabla rica:

| Columna | Contenido |
|---|---|
| # Contrato | CTR-0012 (link al detalle) |
| Cliente | Nombre + badge de tipo (Oficina, Comunidad...) |
| Ubicación | Dirección truncada + zona |
| Frecuencia | "3×/semana", "Quincenal", "Mensual" |
| Horario | "L-M-V 09:00-12:00" resumido |
| Horas/mes | "36h" calculado |
| Precio | "450 €/mes" o "80 €/servicio" según modelo |
| Trabajador | Nombre + avatar mini |
| Estado | Badge de color (activo verde, pausado amber, etc.) |
| Acciones | Editar, Pausar/Activar, Renovar, Eliminar |

Controles:
- Búsqueda global por cliente, dirección, trabajador
- Filtros: estado, tipo de cliente, trabajador asignado, zona
- Ordenar por: fecha inicio, precio, cliente
- Botón "+ Nuevo contrato" → abre modal de creación

**3. Pestaña "Calendario"**

Integra el componente de SVC-05:
- Vista semanal como principal
- Toggle semana/mes/día
- Filtros por trabajador, zona, cliente
- Botones de generación

**4. Pestaña "Servicios"**

Reutiliza y mejora la lógica de `CleaningServices.tsx` actual:
- Lista de servicios individuales (generados o manuales)
- Tabs por estado: Todos, Pendientes, Asignados, En progreso, Completados
- Cada servicio muestra: contrato vinculado (si existe), cliente, fecha, hora, trabajador, estado
- Click en servicio: abre detalle con checklist, cambio de estado, notas

**5. Pestaña "Mapa de zonas" (opcional, fase 2)**

Vista de mapa con los servicios/contratos agrupados por zona:
- Pin por ubicación de contrato
- Color por estado del contrato
- Click en pin muestra resumen del contrato
- Permite planificar rutas visualmente

**6. Modal de contrato (crear/editar)**

Formulario en pasos (wizard):

**Paso 1 — Cliente y ubicación:**
- Selector de cliente CRM (SVC-02) o datos manuales
- Tipo de cliente (dropdown con los 12 tipos)
- Dirección completa (calle, nº, ciudad, CP)
- Zona (dropdown de zonas configuradas + opción "Nueva zona")

**Paso 2 — Servicio y frecuencia:**
- Tipo de limpieza (dropdown)
- Frecuencia (dropdown)
- Días y horario (multi-selector de días + hora inicio/fin por día)
- Horas por visita (input numérico)
- Materiales necesarios (tags input + toggle "los aporta la empresa")

**Paso 3 — Precio y facturación:**
- Modelo de precio (radio: mensual / por servicio / por hora)
- Importe según modelo
- IVA (default 21%)
- Toggle "IVA incluido"
- Toggle "Facturación automática" + día de facturación

**Paso 4 — Asignación y contrato:**
- Trabajador principal (selector de equipo, SVC-03)
- Trabajador suplente (opcional)
- Fecha inicio
- Fecha fin (o indefinido)
- Renovación automática (toggle + días aviso)
- Observaciones internas
- Instrucciones del cliente

**Paso 5 — Resumen y confirmación:**
- Resumen visual de todos los datos
- Estimación de servicios que se generarán
- Botón "Crear contrato" / "Crear y generar servicios"

**7. Detalle del contrato**

Drawer o página interna con:
- Resumen del contrato (todos los campos)
- Timeline de servicios generados (últimos + próximos)
- Historial de facturas
- Indicadores: servicios completados/cancelados del mes, horas reales vs. contratadas
- Acciones: editar, pausar, renovar, cancelar, generar servicios

**8. KPIs**

| KPI | Cálculo |
|---|---|
| Contratos activos | Count de `service_contract` con `contractStatus === 'active'` |
| Servicios esta semana | Count de `cleaning_service` con `date` en semana actual |
| Facturación mensual estimada | Suma de `monthlyPrice` de contratos activos + (servicios estimados × precio para los de tipo per_service/per_hour) |
| Horas semanales | Suma de `contractedHoursPerVisit` × visitas/semana de todos los contratos activos |
| Alertas activas | Count de alertas no dismissed (SVC-07) |

**9. Registrar ruta y navegación**

| Archivo | Cambio |
|---|---|
| `routes.tsx` | Añadir `{ path: 'vertical/limpieza/servicios', Component: ServiceContractsPage }` |
| `Sidebar.tsx` | En el grupo `cleaning`, añadir ítem "Servicios y Contratos" como primer ítem con icono `FileStack` o `ClipboardList`, ruta `/saas/vertical/limpieza/servicios`. Mantener los 4 items existentes debajo. |
| `routes.tsx` | Redirect: `cleaning-services` → `vertical/limpieza/servicios?tab=services` |

**10. Responsive y dark mode**

- Mobile: tabs como dropdown o scroll horizontal; tabla de contratos como cards apiladas
- Tablet: tabla con scroll horizontal, sidebar colapsable
- Desktop: layout completo
- Dark mode: coherente con el diseño actual del proyecto

#### Vista del trabajador (no admin)

Si el usuario no es gerente, la página muestra vista simplificada:
- Solo la pestaña "Servicios" con los servicios asignados a él
- Solo lectura en contratos (no puede crear ni editar)
- Puede ver el calendario filtrado a sus servicios
- Puede cambiar estado de servicio (in_progress, completed)
- No ve KPIs financieros (precio, facturación)
- Header: "Mis servicios asignados"

#### Criterios de aceptación
- [x] Página accesible en `/saas/vertical/limpieza/servicios`
- [ ] 4 pestañas funcionales (Contratos, Calendario, Servicios, Mapa de zonas) — solo Contratos funciona; Calendario y Servicios son placeholders, Mapa no existe
- [x] KPIs calculados y visibles en la cabecera
- [ ] Modal de creación de contrato con wizard de 5 pasos — modal de una sola vista con secciones
- [ ] Detalle del contrato con timeline + facturas + acciones
- [ ] Tabla de contratos con filtros, búsqueda y ordenación — hay búsqueda y filtro por estado, falta ordenación
- [ ] Redirect desde `/saas/cleaning-services` — sigue mostrando `CleaningServices.tsx`
- [x] Sidebar actualizado con nuevo ítem
- [ ] Vista reducida para trabajador no-admin
- [x] Responsive + dark mode
- [ ] Carga lazy de pestañas pesadas (calendario, mapa)

---

### SVC-09 — Conexión: Fichajes ↔ Servicios

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** SVC-01, SVC-03

#### Contexto
Los campos `checkInAt` y `checkOutAt` existen en `cleaning_service` pero no se rellenan desde la UI. El fichaje del trabajador (`clockinsApi.ts`) está totalmente desconectado de los servicios. La conexión permitiría: registrar inicio/fin real del servicio, comparar horas contratadas vs. reales, y detectar anomalías.

#### Qué hacer

**1. Vincular check-in/out del servicio con fichajes**

Cuando un trabajador inicia un servicio (status → `in_progress`):
- Registrar `checkInAt` con la fecha/hora actual
- Si el módulo de fichajes está activo: buscar si el trabajador tiene fichaje abierto
- Si no tiene: ofrecer opción de fichar entrada automáticamente (crear clockin vinculado al servicio)

Cuando completa el servicio (status → `completed`):
- Registrar `checkOutAt` con la fecha/hora actual
- Calcular `realDuration` = diferencia entre check-in y check-out

**2. Campo `clockinId` en servicio**

```typescript
export interface CleaningService {
  // ... existentes ...
  clockinId?: string;       // ID del fichaje vinculado
  realDuration?: number;    // Horas reales (calculadas de checkIn/Out)
}
```

**3. Comparativa horas contratadas vs. reales**

En el detalle del contrato:
- Widget "Horas" con dos barras:
  - Horas contratadas (del contrato)
  - Horas reales (sumando `realDuration` de servicios completados del período)
- Porcentaje: "92% de cumplimiento" (verde si >90%, amber si 70-90%, rojo si <70%)

**4. En WorkerTpvCleaning: activar check-in/out**

Modificar `WorkerTpvCleaning.tsx` para:
- Al pulsar "Iniciar servicio": registrar `checkInAt` y opcionalmente crear clockin
- Al pulsar "Finalizar servicio": registrar `checkOutAt`
- Mostrar cronómetro durante el servicio
- Opción de añadir fotos antes/después (activar los campos `photosBefore`/`photosAfter` que ya existen)

#### Criterios de aceptación
- [x] `checkInAt` y `checkOutAt` se registran al iniciar/finalizar servicio (endpoints `check-in`/`check-out` + `CleaningExecution.tsx`)
- [ ] `realDuration` calculada automáticamente
- [ ] Opción de crear fichaje automáticamente al iniciar servicio
- [ ] Comparativa horas contratadas vs. reales en detalle del contrato
- [x] Cronómetro visible en el TPV del trabajador durante el servicio
- [ ] Fotos antes/después funcionales en el TPV del trabajador — existen en `CleaningExecution.tsx`, no en `WorkerTpvCleaning.tsx`

---

### SVC-10 — Conexión: Rutas ↔ Servicios

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** SVC-01, SVC-05

#### Contexto
No existe un módulo de planificación de rutas para limpieza. Cuando un trabajador tiene varios servicios en un día, el gerente necesita optimizar el orden de visitas para minimizar desplazamientos. Las zonas del contrato (`zone`) son la base para agrupar servicios geográficamente.

#### Qué hacer

**1. Modelo de zona/ruta**

```typescript
export interface CleaningZone {
  _id: string;                // czone:{user_id}:{uuid}
  _rev?: string;
  type: 'cleaning_zone';
  user_id: string;
  name: string;               // "Centro", "Zona Norte", "Polígono Sur"
  color: string;              // Color para el mapa y calendario
  description?: string;
  postalCodes?: string[];     // CPs incluidos en la zona
  createdAt: string;
  updatedAt: string;
}

export interface CleaningRoute {
  _id: string;                // croute:{user_id}:{date}:{worker_id}
  _rev?: string;
  type: 'cleaning_route';
  user_id: string;
  date: string;               // YYYY-MM-DD
  workerId: string;
  workerName: string;
  serviceIds: string[];        // IDs de servicios en orden de visita
  estimatedKm?: number;
  estimatedMinutes?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

**2. CRUD de zonas**

| Función | Descripción |
|---|---|
| `listCleaningZones(userId)` | Listar zonas |
| `saveCleaningZone(userId, data, existing?)` | Crear/editar zona |
| `deleteCleaningZone(userId, zoneId)` | Eliminar zona |

**3. Generación de ruta diaria**

| Función | Descripción |
|---|---|
| `generateDailyRoute(userId, workerId, date)` | Busca servicios del trabajador para ese día, ordena por hora y genera ruta |
| `reorderRoute(userId, routeId, newServiceIds)` | Permite reordenar manualmente los servicios en la ruta |
| `getWorkerRoutesForWeek(userId, workerId, weekStart)` | Rutas de la semana para un trabajador |

**4. Vista de ruta del día (UI)**

En la pestaña "Calendario" o como sub-pestaña:
- Seleccionar trabajador + fecha
- Lista ordenada de servicios del día: hora, cliente, dirección, duración, estado
- Drag & drop para reordenar
- Estimación de tiempo total + km (si hay coordenadas)
- Botón "Enviar ruta al trabajador" (futuro: notificación)

**5. Vista del trabajador**

En `WorkerTpvCleaning.tsx`:
- Pestaña "Mi ruta de hoy" con la lista de servicios en orden
- Botón "Siguiente servicio" que marca el actual como completado y abre el siguiente
- Dirección con link a Google Maps para navegación

#### Criterios de aceptación
- [ ] CRUD de zonas funcional — `zone` es un string libre en el contrato, no existe la entidad `cleaning_zone`
- [x] Los contratos pueden asignarse a una zona
- [x] Se puede generar ruta diaria para un trabajador (`generateCleaningRoutes` + `CleaningRoutes.tsx`)
- [x] La ruta ordena los servicios del día (con reordenación vía `reorderCleaningRoute`)
- [ ] Drag & drop para reordenar servicios en la ruta
- [ ] Vista "Mi ruta de hoy" en el TPV del trabajador
- [ ] Link a Google Maps para navegación
- [ ] Zonas visibles como filtro en el calendario (SVC-05) — hay filtro de zona en `CleaningRoutes.tsx`, pero el calendario no existe

---

### SVC-11 — Conexión: Dashboard ↔ Servicios

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** SVC-01, SVC-07

#### Contexto
El Dashboard no muestra información de servicios de limpieza. El gerente necesita ver de un vistazo el estado de la operativa de limpieza desde el panel principal.

#### Qué hacer

**1. Widget "Servicios de limpieza" en Dashboard**

```
┌──────────────────────────────────────────┐
│  🧹 Servicios de limpieza                │
│                                           │
│  Contratos activos:    18                │
│  Servicios hoy:         6  (3 completados)│
│  Servicios mañana:      8                │
│  Facturación mes:   8.450 €             │
│                                           │
│  ⚠ 2 servicios sin asignar              │
│  ⚠ 1 contrato próximo a renovar         │
│                                           │
│  [Ver servicios →]                       │
└──────────────────────────────────────────┘
```

**2. Ampliar endpoint `/api/dashboard/kpis/:userId`**

Añadir sección `cleaning`:

```javascript
cleaning: {
  activeContracts: 18,
  todayServices: 6,
  todayCompleted: 3,
  tomorrowServices: 8,
  monthlyRevenue: 8450.00,
  weeklyHours: 126,
  unassignedCount: 2,
  renewalDueCount: 1,
  alerts: [
    { type: 'service_unassigned', count: 2 },
    { type: 'contract_renewal_due', count: 1 },
  ],
}
```

**3. Feed de actividad**

En el feed del Dashboard, incluir eventos de servicios:
- "Servicio completado: Oficina Acme (María García, 3h)"
- "Contrato CTR-0025 creado para Gimnasio FitBox (450 €/mes)"
- "2 servicios sin asignar para mañana"

#### Criterios de aceptación
- [ ] Widget visible en Dashboard para vertical `cleaning`
- [ ] KPIs calculados correctamente
- [ ] Alertas de servicios visibles dentro del widget
- [ ] Click en widget navega a `/saas/vertical/limpieza/servicios`
- [ ] Feed de actividad incluye eventos de servicios
- [ ] Responsive + dark mode

---

### SVC-12 — Perfil gerente: Gestión completa de servicios

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** SVC-08

#### Contexto
El perfil gerente (owner, admin, manager) tiene acceso completo a la página. Este ticket asegura que todas las acciones de gestión estén correctamente implementadas y que la UX sea óptima.

#### Qué hacer

**1. Acciones del gerente sobre contratos**

| Acción | Descripción | Dónde |
|---|---|---|
| Crear contrato | Wizard completo de 5 pasos (SVC-08) | Botón "+ Nuevo contrato" |
| Editar contrato | Misma estructura que crear, pre-rellenado | Botón "Editar" en tabla/detalle |
| Activar contrato | Cambia status draft/paused → active | Botón en detalle + dropdown en tabla |
| Pausar contrato | Cambia status active → paused (deja de generar servicios) | Dropdown en tabla |
| Cancelar contrato | Cambia status → cancelled + motivo | Dropdown con confirmación |
| Renovar contrato | Extiende endDate, actualiza renewalDate | Botón "Renovar" en detalle |
| Duplicar contrato | Crea uno nuevo con los mismos datos (nuevo cliente o misma config) | Dropdown en tabla |
| Generar servicios | Genera servicios para semana/mes seleccionado | Botones en detalle y cabecera |
| Desactivar servicio | Cancela un servicio individual generado | Desde tabla de servicios |
| Reasignar trabajador | Cambia el trabajador de un contrato (afecta futuros servicios) | Editar contrato |
| Reasignar servicio | Cambia el trabajador de un servicio individual | Desde detalle del servicio |
| Ver facturación | Accede al historial de facturas del contrato | Pestaña facturación en detalle |
| Generar factura | Genera factura manual para un período | Botón en detalle |
| Configurar alertas | Activa/desactiva tipos de alerta | Settings de la vertical |

**2. Acciones masivas**

En la tabla de contratos:
- Checkbox por fila + barra de acciones masivas
- Acciones masivas: Activar, Pausar, Generar servicios semana, Exportar CSV

**3. Exportación de datos**

- Exportar contratos a CSV/Excel: todos los campos
- Exportar servicios del período a CSV/Excel
- Exportar informe: horas contratadas vs. reales por trabajador

**4. Configuración de la vertical**

En la sección de Settings, para vertical limpieza:
- Tipos de cliente (añadir/editar custom)
- Zonas configuradas
- Materiales frecuentes (sugerencias)
- Configuración de alertas (activar/desactivar cada tipo)
- Plantillas de tareas por tipo de limpieza (editar DEFAULT_TASKS)

#### Criterios de aceptación
- [ ] Todas las acciones de gestión funcionan correctamente — crear/editar/activar/pausar/cancelar/renovar/eliminar sí; faltan duplicar, generar servicios desde la UI, generar factura manual
- [ ] Acciones masivas sobre contratos (activar, pausar, generar)
- [ ] Exportación CSV/Excel funcional
- [ ] Configuración de la vertical accesible desde Settings
- [x] Historial de actividad registrado para auditoría (`logAccountActivity` en todas las acciones de contrato)
- [ ] Confirmación en acciones destructivas (cancelar, eliminar) — solo eliminar pide confirmación

---

### SVC-13 — Perfil trabajador: Consulta de servicios asignados

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** SVC-08, SVC-09

#### Contexto
El trabajador debe poder consultar los servicios asignados a su turno o ruta desde la misma página de Servicios y Contratos, con una vista simplificada y adaptada a su rol.

#### Qué hacer

**1. Detección de perfil**

Reutilizar la lógica de roles:
- `owner`, `admin`, `manager` → perfil gerente (SVC-12)
- Cualquier otro rol → perfil trabajador

**2. Vista del trabajador en la página**

```
┌─────────────────────────────────────────────────────────┐
│  MIS SERVICIOS · María García                            │
│  Semana del 14 al 20 de abril de 2026                   │
├─────────────────────────────────────────────────────────┤
│  📊 Resumen semanal                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Servicios │ │Horas     │ │Completados│ │Pendientes│  │
│  │esta sem. │ │esta sem. │ │           │ │          │  │
│  │   12     │ │   28h    │ │    5      │ │    7     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│  Tabs: [Hoy] [Esta semana] [Calendario]                 │
│                                                          │
│  HOY — Lunes 14 de abril                                │
│                                                          │
│  09:00 - 12:00 · Oficina Acme S.L.                     │
│  📍 C/ Mayor 15, Madrid · 🧹 General · 3h              │
│  Estado: ● Asignado  [Iniciar servicio]                 │
│                                                          │
│  14:00 - 16:00 · Comunidad Flores                      │
│  📍 Av. Libertad 42, Madrid · 🧹 General · 2h          │
│  Estado: ● Asignado  [Iniciar servicio]                 │
│                                                          │
│  17:00 - 18:30 · Gimnasio FitBox                       │
│  📍 C/ Deportes 8, Madrid · 🧹 Desinfección · 1.5h     │
│  Estado: ● Pendiente (sin horario confirmado)           │
└─────────────────────────────────────────────────────────┘
```

**3. Funcionalidades del trabajador**

| Acción | Descripción |
|---|---|
| Ver servicios de hoy | Lista ordenada por hora con todos los datos necesarios |
| Ver servicios de la semana | Calendario simplificado (vista de lista por día) |
| Iniciar servicio | Cambia status a `in_progress`, registra `checkInAt` |
| Finalizar servicio | Cambia status a `completed`, registra `checkOutAt` |
| Añadir notas | Campo de texto `employeeNotes` |
| Ver checklist | Lista de tareas con toggles |
| Fotos antes/después | Cámara o galería, se suben a `photosBefore`/`photosAfter` |
| Ver ruta del día | Si existe ruta generada (SVC-10), ver en orden |
| Navegación GPS | Link a Google Maps con la dirección del servicio |

**4. Lo que el trabajador NO puede hacer**

- No puede crear/editar/eliminar contratos
- No puede ver precios ni facturación
- No puede cambiar trabajador asignado
- No puede generar servicios
- No puede ver servicios de otros trabajadores
- No puede acceder a KPIs financieros

**5. Integración con WorkerTpvCleaning**

`WorkerTpvCleaning.tsx` ya existe como vista del trabajador. La nueva página de servicios en modo trabajador debe ofrecer una experiencia más completa pero coherente:
- Si el trabajador accede por `/saas/vertical/limpieza/servicios` → vista completa del trabajador (descrita arriba)
- Si accede por `/saas/worker/tpv` → `WorkerTpvCleaning` existente (modo más compacto para el día a día)
- Ambas vistas comparten la misma API y datos

#### Criterios de aceptación
- [ ] El trabajador ve solo sus servicios asignados — `WorkerTpvCleaning.tsx` no filtra por trabajador
- [x] Vista "Hoy" con servicios ordenados por hora (`WorkerTpvCleaning.tsx`)
- [ ] Vista "Esta semana" con servicios agrupados por día
- [x] Botones "Iniciar" y "Finalizar" funcionales con registro de check-in/out (`CleaningExecution.tsx`)
- [x] Checklist de tareas con toggles (`CleaningChecklist.tsx`)
- [ ] Campo de notas del empleado
- [x] Fotos antes/después funcionales (`CleaningExecution.tsx` + endpoints de foto)
- [ ] Link a Google Maps
- [ ] No ve precios, facturación ni servicios de otros — el TPV muestra ingresos por servicio
- [x] Responsive optimizado para móvil (uso principal)

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelo de datos)
├── SVC-01 Modelo de datos: Contrato de servicio recurrente
├── SVC-02 Vinculación con CRM: Cliente como entidad
└── SVC-03 Vinculación con equipo: Asignación de trabajador

Fase 2 — Motor y automatización
├── SVC-04 Motor de generación de servicios recurrentes
├── SVC-06 Vinculación automática: Servicio → Cliente → Facturación
└── SVC-07 Sistema de alertas

Fase 3 — Interfaz principal
├── SVC-05 Calendario de servicios
└── SVC-08 Página unificada: Servicios y Contratos

Fase 4 — Conexiones
├── SVC-09 Conexión: Fichajes ↔ Servicios
├── SVC-10 Conexión: Rutas ↔ Servicios
└── SVC-11 Conexión: Dashboard ↔ Servicios

Fase 5 — Perfiles
├── SVC-12 Perfil gerente: Gestión completa
└── SVC-13 Perfil trabajador: Consulta de servicios
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| SVC-01 Modelo contrato de servicio | Alta | 5-6h |
| SVC-02 Vinculación CRM | Media | 3-4h |
| SVC-03 Vinculación equipo | Media | 3-4h |
| SVC-04 Motor de generación recurrente | Muy Alta | 8-10h |
| SVC-05 Calendario de servicios | Alta | 6-8h |
| SVC-06 Facturación automática | Alta | 5-6h |
| SVC-07 Sistema de alertas | Alta | 5-6h |
| SVC-08 Página unificada | Muy Alta | 10-12h |
| SVC-09 Fichajes ↔ Servicios | Media | 3-4h |
| SVC-10 Rutas ↔ Servicios | Media-Alta | 5-6h |
| SVC-11 Dashboard ↔ Servicios | Media | 3-4h |
| SVC-12 Perfil gerente | Media | 3-4h |
| SVC-13 Perfil trabajador | Media | 4-5h |
| **Total** | | **~63-79h** |

---

## Notas técnicas

### Base de datos
Todos los documentos nuevos (`service_contract`, `cleaning_zone`, `cleaning_route`) se almacenan en la DB `*-cleaning` de CouchDB, que ya contiene `cleaning_service` y `cleaning_incident`. Esto mantiene coherencia y permite queries eficientes por `user_id`.

### Sin migraciones
CouchDB no requiere migraciones de esquema. Los nuevos tipos de documento se crean al vuelo. Los `cleaning_service` existentes sin `contractId` siguen funcionando (campo opcional).

### Retrocompatibilidad
- La ruta `/saas/cleaning-services` sigue funcionando como redirect a la nueva página
- Los servicios existentes sin contrato vinculado se muestran en la pestaña "Servicios" como servicios manuales
- Los datos de `assignedToName` existentes no se rompen; simplemente faltará el `assignedWorkerId`
- Las 4 páginas existentes (Checklist, Calidad, Opiniones) siguen funcionando independientemente; la nueva página las complementa, no las reemplaza

### Acceso y permisos
- La lógica de roles existente se reutiliza: `MANAGER_ROLES` para gerente, el resto para trabajador
- Los contratos solo los pueden crear/editar/eliminar roles de gerente
- Los trabajadores solo ven sus servicios asignados
- Los precios y datos de facturación están ocultos para el trabajador

### Relación entre contrato y servicio
El `service_contract` es la definición del acuerdo con el cliente (frecuencia, precio, horario). El `cleaning_service` es la ejecución concreta de una visita (una fecha, un check-in, un check-out, un checklist completado). Un contrato genera N servicios. Un servicio siempre tiene `contractId` si fue generado desde un contrato, o `null` si fue creado manualmente.

### Campos existentes reutilizados
Los campos `checkInAt`, `checkOutAt`, `photosBefore`, `photosAfter`, `employeeNotes` ya existen en el modelo `cleaning_service` pero no se usan en la UI. Este plan los activa completamente (SVC-09, SVC-13).

### i18n
Todos los labels nuevos deben incluirse en los 4 idiomas existentes: es, en, pt, fr. Los tipos de cliente, frecuencias y estados del contrato son traducibles. Seguir el patrón de `STATUS_CONFIG`, `CLEANING_TYPES`, `CLIENT_TYPES`.

### Numeración
El contrato usa el sistema de numeración configurable existente (`settingsController.js` — `DEFAULT_NUMBERING`). Se añade el tipo `service_contract` con prefijo `CTR-` configurable por el usuario.
