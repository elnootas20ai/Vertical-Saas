# CLIENTES Y CONTRATOS ACTIVOS (Vertical Limpieza) — Plan de Tickets

**Página:** `/saas/vertical/limpieza/clientes`
**Objetivo:** Consultar el estado real de cada cliente dentro de la vertical limpieza — con visión 360° de ubicaciones, servicios contratados, incidencias, facturación, rentabilidad y estado del contrato.
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

~47% completado (49/105 criterios). Backend muy avanzado: `cleaningClientsController.js` implementa lista agregada, perfil 360°, stats, alertas (6/7 tipos), rentabilidad con 3 modelos de precio y CRUD de ubicaciones. Frontend `CleaningClientsPage.tsx` completo: cards/tabla, filtros en URL, paginación, CSV, banner de alertas, drawer con 7 pestañas y panel de cartera. **Fallos reales detectados:** el perfil backend no devuelve `serviceStats`/`incidentStats`/`invoiceStats`/`revenueHistory` que el drawer espera (romperá las pestañas de stats), el endpoint de cartera responde `profitability` pero la API lee `portfolio` (panel sin datos), y los servicios generados desde contrato NO heredan `clientId`. Faltan: modal de nuevo cliente, CRUD de ubicaciones/notas en UI, filtrado por trabajador (CLI-09), conexión CRM↔limpieza (CLI-10) y widget de Dashboard (CLI-11).

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD genérico de clientes CRM (back) | Completo | `clientsRouter.js`, `clientsController.js` — endpoints `GET/POST/PUT/DELETE /api/clients/:userId` |
| Modelo de datos `client` en CouchDB | Completo | `couchdb.js` — `buildClientDocument`, `sanitizeClient` — DB `*-clients` |
| Campos del cliente CRM | Completo | `name`, `phone`, `email`, `dni`, `address`, `city`, `postalCode`, `status`, `responsible`, `clientType`, `addresses[]`, `contacts[]`, `tags[]`, `notes` |
| Notas de cliente (`client_note`) | Completo | `couchdb.js` — `buildClientNoteDocument`, `sanitizeClientNote`, `listClientNotesByClient` |
| Promociones de cliente (`client_promotion`) | Completo | `couchdb.js` — `buildClientPromotionDocument` |
| Facturas de cliente (`client_invoice`) | Completo | `clientInvoicesApi.ts` — CRUD completo con líneas, pagos, estados, envío por email |
| Página CRM Clientes (UI genérica) | Completo | `ClientsPage.tsx` — tabs leads/clients/billing/alerts, tabla con columnas, modales, segmentación |
| Contratos de compraventa | Completo | `contractsApi.ts` — tipo `venta`/`reserva`/`compra` (vertical automoción, NO limpieza) |
| CRUD de servicios de limpieza (back) | Completo | `cleaningRouter.js`, `cleaningController.js` — endpoints `GET/POST/PUT/DELETE /api/cleaning/services/:userId` |
| Modelo `CleaningService` | Completo | `cleaningApi.ts` — con `clientName`, `clientPhone`, `clientEmail`, `address`, `assignedTo`, `price`, `invoiceId` |
| CRUD de incidencias de limpieza (back) | Completo | `cleaningRouter.js` — endpoints `GET/POST/PUT/DELETE /api/cleaning/incidents/:userId` |
| Modelo `CleaningIncident` | Completo | `cleaningApi.ts` — con `clientId`, `clientName`, `serviceId`, `priority`, `status`, `responsibleId` |
| Página incidencias limpieza (UI) | Completo | `CleaningIncidents.tsx` — lista con filtros, estados, drawer detalle |
| Rutas de limpieza (back) | Completo | `cleaningRouter.js` — CRUD + generación + reordenar + reasignar |
| Motor de alertas genérico | Completo | `alertEngine.js` — sistema de alertas con reglas configurables |
| Dashboard KPIs | Completo | `/api/dashboard/kpis/:userId` — estructura extensible para añadir sección cleaning |
| Facturación automática (guideline) | Existe plan | `FACTURACION_AUTOMATICA_LIMPIEZA.md` — guía de diseño, no implementada |
| Sidebar vertical limpieza | Completo | `Sidebar.tsx` — grupo `cleaning` con 5 ítems |
| Sistema de roles y permisos | Completo | `businessRouter.js` — `business.members` con roles (`owner`, `admin`, `manager`, `worker`, etc.) |
| Contrato de servicio recurrente (plan) | Pendiente | `SERVICIOS-CONTRATOS-LIMPIEZA.md` — ticket SVC-01 define `service_contract` |
| Trabajadores de limpieza (plan) | Pendiente | `TRABAJADORES-LIMPIEZA.md` — ticket define `cleaning_worker` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Página dedicada `/saas/vertical/limpieza/clientes` | No existe |
| Vista 360° del cliente en contexto limpieza (servicios + incidencias + facturas + contrato) | No existe |
| Vinculación `CleaningService.clientId` → entidad CRM | No implementada — `clientName` es texto libre sin `clientId` |
| Vinculación `CleaningIncident.clientId` → entidad CRM | Parcial — campo `clientId` existe pero no se usa como FK real |
| Agregación de ubicaciones (direcciones) por cliente | No existe — cada servicio tiene `address` como texto libre |
| Vista de servicios contratados por cliente con frecuencia y precio | No existe — requiere `service_contract` (SVC-01) |
| Historial de incidencias por cliente (agrupadas, con tendencia) | No existe |
| Historial de facturas por cliente vinculadas a limpieza | No existe — facturas genéricas CRM no distinguen vertical |
| Cálculo de rentabilidad por cliente (ingresos – costes laborales) | No existe |
| Detección automática de cliente poco rentable | No existe |
| Indicador de renovación próxima de contrato por cliente | No existe — requiere `service_contract` con `endDate` |
| Alerta: contrato por vencer | No existe (planeada en SVC-07 de SERVICIOS-CONTRATOS) |
| Alerta: cliente con impagos | No existe |
| Alerta: cliente con incidencias repetidas | No existe |
| Alerta: cliente sin responsable asignado | No existe |
| Conexión bidireccional: ficha cliente CRM ↔ vista limpieza | No existe |
| Perfil gerente: cartera completa + rentabilidad | No existe — todos ven lo mismo |
| Perfil trabajador: solo clientes asignados, info operativa | No existe |
| Resumen/KPIs de cartera de clientes de limpieza | No existe |
| Notas del cliente específicas de la vertical limpieza | No existe — notas CRM genéricas, sin contexto de limpieza |
| Campo `responsable comercial` diferenciado del `trabajador asignado` al servicio | No existe |

---

## Relación con otros tickets

Este plan depende de y se coordina con los tickets de `SERVICIOS-CONTRATOS-LIMPIEZA.md`:

| Ticket externo | Relación |
|---|---|
| **SVC-01** (Modelo contrato de servicio) | Dependencia directa — sin `service_contract` no hay contratos que mostrar por cliente |
| **SVC-02** (Vinculación CRM) | Dependencia directa — la vinculación `clientId` en contratos es la base de esta página |
| **SVC-06** (Facturación automática) | Complemento — las facturas generadas se muestran en la vista del cliente |
| **SVC-07** (Alertas de servicios) | Complemento — varias alertas aplican también a la vista de clientes |
| **TRB-\*** (Trabajadores limpieza) | Complemento — coste/hora del trabajador se usa para calcular rentabilidad |

---

## Tickets

---

### CLI-01 — Backend: Endpoint de cliente enriquecido para limpieza

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** SVC-01 (modelo `service_contract`), SVC-02 (vinculación CRM)

#### Contexto

La página de clientes necesita mostrar una visión 360° de cada cliente en el contexto de limpieza. Hoy el cliente CRM vive en la DB `*-clients` y los datos de limpieza en `*-cleaning`. No existe un endpoint que cruce ambas fuentes para devolver el perfil completo del cliente de limpieza con sus contratos, servicios, incidencias y facturas. Sin este endpoint, el frontend tendría que hacer 5-6 llamadas separadas por cliente, lo cual no escala.

#### Qué hacer

**1. Nuevo endpoint en `cleaningRouter.js`**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/clients/:userId` | GET | Lista de clientes de limpieza con datos agregados. Query: `?status=active&responsible=X&zone=Z&search=texto` |
| `/api/cleaning/clients/:userId/:clientId` | GET | Perfil completo de un cliente de limpieza |
| `/api/cleaning/clients/:userId/:clientId/summary` | GET | Resumen ligero para cards/tabla (sin historial completo) |
| `/api/cleaning/clients/:userId/stats` | GET | Estadísticas globales de cartera de clientes |

**2. Lógica del endpoint de lista `/api/cleaning/clients/:userId`**

Pasos internos:
1. Obtener todos los `service_contract` del usuario (DB `*-cleaning`, tipo `service_contract`)
2. Extraer los `clientId` únicos (filtrar los que son texto libre sin vínculo CRM)
3. Para cada `clientId`: obtener la entidad `client` de la DB `*-clients`
4. Para cada cliente: contar contratos activos, sumar facturación mensual estimada, contar incidencias abiertas
5. Incluir también los clientes CRM que tienen servicios (`cleaning_service`) pero sin contrato formal (migración suave)
6. Devolver lista enriquecida con datos agregados

Respuesta por cliente en la lista:
```typescript
export interface CleaningClientListItem {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientType: string;

  // Agregados
  activeContracts: number;
  totalContracts: number;
  locations: { address: string; zone: string; city: string }[];
  monthlyRevenue: number;           // Facturación mensual estimada (suma de contratos activos)
  totalInvoiced: number;            // Total facturado histórico
  unpaidAmount: number;             // Importe pendiente de cobro
  openIncidents: number;            // Incidencias abiertas
  totalIncidents: number;           // Incidencias totales históricas
  assignedResponsible: string;      // Responsable comercial (del CRM)
  assignedWorkers: { id: string; name: string }[];  // Trabajadores asignados (de contratos)
  nearestRenewal: string | null;    // Fecha de renovación más próxima
  contractStatus: 'all_active' | 'some_paused' | 'pending_renewal' | 'expired' | 'no_contracts';
  profitability: 'high' | 'medium' | 'low' | 'negative' | 'unknown';  // Calculado si hay datos de coste
  lastServiceDate: string | null;   // Fecha del último servicio completado
  lastIncidentDate: string | null;  // Fecha de la última incidencia
  createdAt: string;
}
```

**3. Lógica del endpoint de perfil `/api/cleaning/clients/:userId/:clientId`**

Respuesta completa:
```typescript
export interface CleaningClientProfile {
  // ── Datos del cliente CRM ──
  client: {
    id: string;
    name: string;
    phone: string;
    phonePrefix: string;
    email: string;
    dni: string;
    clientType: string;
    address: string;
    city: string;
    postalCode: string;
    legalName: string;
    fiscalId: string;
    fiscalAddress: string;
    status: string;
    responsible: string;
    tags: string[];
    notes: string;
    createdAt: string;
  };

  // ── Ubicaciones (extraídas de contratos + servicio) ──
  locations: {
    address: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    zone: string;
    coordinates: { lat: number; lng: number } | null;
    contractIds: string[];     // Contratos que usan esta ubicación
    servicesCount: number;     // Servicios realizados en esta ubicación
  }[];

  // ── Contratos de servicio ──
  contracts: {
    id: string;
    contractNumber: string;
    cleaningType: string;
    frequency: string;
    scheduleSummary: string;   // "L-M-V 09:00-12:00" formateado
    hoursPerMonth: number;
    pricingModel: string;
    monthlyPrice: number;      // Calculado según modelo
    assignedWorkerName: string;
    assignedWorkerId: string;
    contractStatus: string;
    startDate: string;
    endDate: string | null;
    renewalDate: string | null;
    autoRenew: boolean;
    address: string;
    zone: string;
  }[];

  // ── Servicios recientes ──
  recentServices: {
    id: string;
    serviceNumber: string;
    date: string;
    time: string;
    status: string;
    assignedToName: string;
    duration: string;
    contractNumber: string | null;
    qualityRating: number | null;
  }[];
  serviceStats: {
    totalCompleted: number;
    totalCancelled: number;
    avgQualityRating: number;
    totalHoursWorked: number;
    completionRate: number;       // % servicios completados vs programados
  };

  // ── Incidencias ──
  incidents: {
    id: string;
    incidentNumber: string;
    incidentType: string;
    date: string;
    priority: string;
    status: string;
    description: string;
    workerName: string;
    resolution: string;
    resolvedAt: string | null;
  }[];
  incidentStats: {
    total: number;
    open: number;
    resolvedAvgDays: number;      // Media de días para resolver
    repeatTypes: { type: string; count: number }[];  // Tipos más frecuentes
    trend: 'improving' | 'stable' | 'worsening';     // Tendencia últimos 3 meses
  };

  // ── Facturas ──
  invoices: {
    id: string;
    number: string;
    date: string;
    dueDate: string;
    total: number;
    paid: number;
    status: string;
    lines: { description: string; quantity: number; unitPrice: number; total: number }[];
  }[];
  invoiceStats: {
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    avgPaymentDays: number;       // Media de días para cobrar
    paymentHistory: { month: string; invoiced: number; paid: number }[];  // Últimos 12 meses
  };

  // ── Notas ──
  notes: {
    id: string;
    text: string;
    authorName: string;
    important: boolean;
    createdAt: string;
  }[];

  // ── Rentabilidad ──
  profitability: {
    monthlyRevenue: number;        // Ingresos mensuales (de contratos activos)
    monthlyCost: number;           // Coste mensual (horas trabajador × coste/hora)
    monthlyProfit: number;         // Beneficio = revenue - cost
    marginPercent: number;         // Margen = (profit / revenue) × 100
    classification: 'high' | 'medium' | 'low' | 'negative' | 'unknown';
    revenueHistory: { month: string; revenue: number; cost: number; profit: number }[];
  };

  // ── Alertas activas del cliente ──
  alerts: {
    type: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    actionLabel: string;
    actionRoute: string;
  }[];
}
```

**4. Endpoint de estadísticas globales `/api/cleaning/clients/:userId/stats`**

```typescript
export interface CleaningClientStats {
  totalClients: number;
  activeClients: number;           // Con al menos 1 contrato activo
  inactiveClients: number;         // Sin contratos activos
  newClientsThisMonth: number;
  totalMonthlyRevenue: number;
  totalMonthlyProfit: number;
  avgRevenuePerClient: number;
  clientsWithUnpaid: number;
  clientsWithOpenIncidents: number;
  clientsWithoutResponsible: number;
  contractsExpiringThisMonth: number;
  profitabilityDistribution: {
    high: number;
    medium: number;
    low: number;
    negative: number;
    unknown: number;
  };
}
```

**5. Crear `src/app/lib/cleaningClientsApi.ts`**

| Función | Descripción |
|---|---|
| `listCleaningClients(userId, filters?)` | Lista de clientes con datos agregados |
| `getCleaningClientProfile(userId, clientId)` | Perfil completo 360° |
| `getCleaningClientSummary(userId, clientId)` | Resumen ligero para cards |
| `getCleaningClientStats(userId)` | Estadísticas globales de cartera |

**6. Controller: `cleaningClientsController.js`**

Crear un controlador separado para mantener el código organizado (el `cleaningController.js` ya es grande). El nuevo controlador importa helpers de `couchdb.js` para cruzar datos entre las DBs `*-clients` y `*-cleaning`.

#### Criterios de aceptación

- [x] Endpoint de lista devuelve clientes con datos agregados de contratos, incidencias y facturación
- [x] Endpoint de perfil devuelve toda la información del cliente en una sola llamada — pero NO incluye `serviceStats`/`incidentStats`/`invoiceStats` que el frontend espera (devuelve `summary`)
- [x] Soporta filtros: estado, responsable, zona, búsqueda por texto
- [x] Datos de ubicaciones extraídos y deduplicados de contratos/servicios
- [ ] Estadísticas de incidencias calculan tendencia (mejorando/estable/empeorando)
- [ ] Estadísticas de facturación incluyen historial de pagos por mes
- [x] Rentabilidad calculada como ingresos – costes (si hay datos de coste/hora del trabajador)
- [x] Alertas del cliente calculadas y devueltas en el perfil
- [x] Endpoint de stats devuelve distribución de rentabilidad
- [x] API client TypeScript con tipos completos — los tipos declaran stats que el backend no devuelve
- [ ] Rendimiento: la lista debe cargar en < 2s para 100 clientes

---

### CLI-02 — Modelo de ubicaciones de cliente

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** SVC-01 (modelo `service_contract`)

#### Contexto

Un cliente de limpieza puede tener servicios en múltiples ubicaciones (p. ej. "Oficina central", "Almacén norte", "Tienda centro"). Hoy la dirección es un campo de texto libre en cada servicio. No existe concepto de "ubicación del cliente" como entidad que agrupe contratos y servicios. Sin esta agrupación, no se puede mostrar el desglose por ubicación ni planificar por zonas.

Las ubicaciones se extraen automáticamente de los contratos de servicio (`service_contract.address`), pero también se necesita la posibilidad de gestionar ubicaciones independientemente para clientes con múltiples sedes.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-cleaning`**

```typescript
export interface ClientLocation {
  _id: string;                  // cloc:{user_id}:{uuid}
  _rev?: string;
  type: 'cleaning_client_location';
  user_id: string;
  clientId: string;             // FK al cliente CRM

  name: string;                 // "Oficina central", "Almacén norte"
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  zone?: string;                // Zona operativa (Centro, Norte, Sur...)
  coordinates?: { lat: number; lng: number };

  contactName?: string;         // Persona de contacto en esta ubicación
  contactPhone?: string;
  contactEmail?: string;
  accessInstructions?: string;  // Cómo acceder (código puerta, llaves, etc.)
  parkingNotes?: string;        // Indicaciones de aparcamiento

  squareMeters?: number;        // Metros cuadrados a limpiar
  floors?: number;              // Número de plantas
  locationNotes?: string;       // Notas específicas de la ubicación

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

**2. Endpoints backend**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/clients/:userId/:clientId/locations` | GET | Listar ubicaciones del cliente |
| `/api/cleaning/clients/:userId/:clientId/locations` | POST | Crear ubicación |
| `/api/cleaning/clients/:userId/:clientId/locations/:locationId` | PUT | Actualizar ubicación |
| `/api/cleaning/clients/:userId/:clientId/locations/:locationId` | DELETE | Borrado lógico |

**3. Sincronización con contratos**

Cuando se crea un `service_contract` con una dirección nueva para un cliente:
- Comprobar si ya existe una `cleaning_client_location` con esa dirección (normalizada)
- Si no existe: crear automáticamente la ubicación a partir de los datos del contrato
- Si existe: vincular el contrato a la ubicación existente
- Campo `locationId` opcional en `service_contract` para vincular explícitamente

**4. API Client**

| Función | Descripción |
|---|---|
| `listClientLocations(userId, clientId)` | Listar ubicaciones |
| `saveClientLocation(userId, clientId, data, existing?)` | Crear/editar ubicación |
| `deleteClientLocation(userId, clientId, locationId)` | Borrado lógico |

**5. CouchDB builders**

- `buildClientLocationDocument(userId, clientId, data, existing?)` en `couchdb.js`
- `sanitizeClientLocation(doc)`
- `listClientLocationsByClient(req, userId, clientId)`

#### Criterios de aceptación

- [x] CRUD completo de ubicaciones por cliente
- [x] Cada ubicación incluye: nombre, dirección completa, zona, contacto, acceso, m², notas
- [ ] Sincronización automática: crear contrato genera ubicación si no existe — solo se derivan al leer el perfil, no se crean documentos
- [ ] Campo `locationId` en `service_contract` para vincular a ubicación
- [ ] Deduplicación de direcciones (normalizar antes de comparar) — dedup por igualdad exacta, sin normalizar
- [x] Borrado lógico con `deletedAt`
- [x] API client TypeScript con tipos

---

### CLI-03 — Sistema de alertas de clientes de limpieza

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** CLI-01, SVC-01, SVC-07

#### Contexto

El gerente necesita alertas proactivas sobre el estado de su cartera de clientes. Las 4 alertas requeridas son: contrato por vencer, cliente con impagos, cliente con incidencias repetidas, y cliente sin responsable asignado. Estas alertas complementan las de SVC-07 (que son de servicios/contratos) con un enfoque centrado en el cliente.

#### Qué hacer

**1. Definir tipos de alerta de clientes**

```typescript
export type CleaningClientAlertType =
  | 'contract_expiring'           // Contrato por vencer (dentro de renewalNoticeDays)
  | 'client_unpaid_invoices'      // Cliente con facturas pendientes o vencidas
  | 'client_repeated_incidents'   // Cliente con 3+ incidencias del mismo tipo en últimos 90 días
  | 'client_no_responsible'       // Cliente sin responsable comercial asignado
  | 'client_inactive'             // Cliente activo sin servicios en los últimos 30 días
  | 'client_low_profitability'    // Cliente con rentabilidad negativa o < 10% margen
  | 'client_quality_drop';        // Media de calidad del cliente bajó >1 punto en el último mes

export interface CleaningClientAlert {
  id: string;
  type: CleaningClientAlertType;
  severity: 'critical' | 'warning' | 'info';
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  data: Record<string, unknown>;   // Datos adicionales según el tipo (contractId, invoiceIds, etc.)
  actionLabel: string;
  actionRoute: string;
  createdAt: string;
  dismissed: boolean;
}
```

**2. Reglas de detección**

| Alerta | Condición | Severidad | Ejemplo |
|---|---|---|---|
| Contrato por vencer | `service_contract` con `endDate` dentro de `renewalNoticeDays` y `autoRenew === false` | `warning` si >15 días; `critical` si ≤15 días | "El contrato CTR-0012 de Gimnasio FitBox vence en 12 días" |
| Impagos | Facturas del cliente con `status === 'overdue'` o con `status === 'pending'` y `dueDate` < hoy | `critical` si importe >500€ o >30 días vencida; `warning` en otros casos | "Gimnasio FitBox tiene 2 facturas vencidas por 1.230 €" |
| Incidencias repetidas | 3 o más `cleaning_incident` del mismo `incidentType` para el mismo `clientId` en los últimos 90 días | `warning` si 3-4; `critical` si ≥5 | "Oficina Acme tiene 4 incidencias de tipo 'falta_limpieza' en los últimos 3 meses" |
| Sin responsable | Campo `responsible` del cliente CRM vacío, igual a "Sin asignar", o inexistente | `warning` | "El cliente Nave Industrial Sur no tiene responsable comercial asignado" |
| Cliente inactivo | Cliente con contrato `active` pero sin servicios `completed` en los últimos 30 días | `warning` | "Comunidad Flores tiene contrato activo pero no se ha realizado ningún servicio en 30 días" |
| Baja rentabilidad | `profitability.marginPercent < 10` o `profitability.classification === 'negative'` | `info` si margen 0-10%; `warning` si negativo | "El margen del cliente Tienda Moda es solo del 5% (45 €/mes de beneficio)" |
| Caída de calidad | Media de `qualityRating` de servicios del mes actual < media del mes anterior - 1.0 | `warning` | "La calidad media en Oficina Acme bajó de 4.2 a 2.8 este mes" |

**3. Integración con `alertEngine.js`**

Añadir función `checkCleaningClientAlerts(userId)` en `alertEngine.js`:
- Lee contratos, incidencias, facturas y clientes
- Ejecuta las 7 reglas definidas
- Emite alertas con dedup (no duplicar alerta ya existente para el mismo cliente/tipo/período)
- Resultado accesible vía endpoint existente `/api/alerts/:userId` con filtro `category=cleaning_client`

**4. Endpoint dedicado**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/clients/:userId/alerts` | GET | Listar alertas activas de clientes. Query: `?severity=critical&type=contract_expiring` |
| `/api/cleaning/clients/:userId/alerts/:alertId/dismiss` | POST | Descartar alerta |

**5. API Client**

| Función | Descripción |
|---|---|
| `listCleaningClientAlerts(userId, filters?)` | Listar alertas con filtros opcionales |
| `dismissCleaningClientAlert(userId, alertId)` | Descartar alerta |
| `getCleaningClientAlertCount(userId)` | Contador para badge en sidebar |

#### Criterios de aceptación

- [ ] Se generan los 7 tipos de alerta definidos con las condiciones correctas — 6 de 7 implementados; falta `client_quality_drop`
- [ ] Cada alerta tiene severidad correcta según los umbrales definidos — falta el umbral de ">30 días vencida" en impagos
- [ ] Alertas integradas con `alertEngine.js` existente — se calculan bajo demanda en el endpoint, no vía motor
- [ ] Endpoint de alertas con filtros por severidad y tipo — endpoint existe pero sin query filters
- [x] Función dismiss funcional (alerta no reaparece hasta el siguiente período)
- [x] Deduplicación: no se repite alerta para el mismo cliente/tipo/semana — `alertId` estable por cliente/tipo
- [x] API client TypeScript completa
- [x] La alerta de impagos calcula el importe total pendiente
- [x] La alerta de incidencias repetidas incluye el tipo de incidencia y el conteo

---

### CLI-04 — Detección de rentabilidad y cliente poco rentable

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** CLI-01, SVC-01, SVC-06, TRB-* (coste/hora trabajador)

#### Contexto

El gerente necesita saber qué clientes son rentables y cuáles no. La rentabilidad se calcula como la diferencia entre los ingresos (facturación mensual del contrato) y los costes (horas del trabajador × coste/hora). Sin este cálculo, el gerente no puede tomar decisiones informadas sobre qué clientes mantener, renegociar o dejar ir.

#### Qué hacer

**1. Cálculo de rentabilidad por cliente**

```typescript
export interface ClientProfitability {
  clientId: string;
  period: string;                   // YYYY-MM
  monthlyRevenue: number;           // Suma de precios de contratos activos del cliente
  monthlyCost: number;              // Horas trabajadas × coste/hora del trabajador asignado
  monthlyProfit: number;            // revenue - cost
  marginPercent: number;            // (profit / revenue) × 100
  classification: 'high' | 'medium' | 'low' | 'negative' | 'unknown';
}
```

Umbrales de clasificación:
- **`high`**: margen ≥ 30%
- **`medium`**: margen 15-29%
- **`low`**: margen 1-14%
- **`negative`**: margen ≤ 0% (se pierde dinero con este cliente)
- **`unknown`**: no hay datos de coste del trabajador disponibles

**2. Cálculo de ingresos**

Según el modelo de precio del contrato:
- **Mensual (`monthly`)**: `monthlyPrice` del contrato
- **Por servicio (`per_service`)**: `pricePerService` × nº de servicios del mes
- **Por hora (`per_hour`)**: `pricePerHour` × horas reales trabajadas

Si un cliente tiene múltiples contratos, se suman todos.

**3. Cálculo de costes**

Para cada contrato del cliente:
- Obtener `assignedWorkerId` del contrato
- Obtener `costPerHour` del trabajador (del módulo de trabajadores TRB-*, o de `business.members` si existe)
- Calcular: horas_contratadas_mensuales × coste/hora
- Si hay datos de fichaje (`checkInAt` / `checkOutAt`): usar horas reales en vez de contratadas
- Sumar costes de todos los contratos del cliente

Si no hay datos de coste/hora del trabajador: clasificar como `unknown` y mostrar aviso "Configura el coste/hora de tus trabajadores para ver la rentabilidad".

**4. Función de cálculo**

```typescript
export async function calculateClientProfitability(
  userId: string,
  clientId: string,
  period?: string,   // YYYY-MM, default: mes actual
): Promise<ClientProfitability>

export async function calculatePortfolioProfitability(
  userId: string,
  period?: string,
): Promise<{
  clients: ClientProfitability[];
  totals: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    avgMargin: number;
  };
  distribution: Record<'high' | 'medium' | 'low' | 'negative' | 'unknown', number>;
}>
```

**5. Endpoint**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/clients/:userId/:clientId/profitability` | GET | Rentabilidad de un cliente. Query: `?period=2026-04` |
| `/api/cleaning/clients/:userId/profitability` | GET | Rentabilidad de toda la cartera. Query: `?period=2026-04` |

**6. Detección automática de cliente poco rentable**

En la generación de alertas (CLI-03):
- Si `classification === 'negative'`: alerta `warning` — "Estás perdiendo dinero con este cliente"
- Si `classification === 'low'` durante 3+ meses consecutivos: alerta `info` — "Margen bajo sostenido, considera renegociar"
- En la tabla de clientes: badge rojo para `negative`, amber para `low`

**7. Historial de rentabilidad**

Almacenar un snapshot mensual de la rentabilidad por cliente (o calcular bajo demanda a partir de los datos de servicios y facturas):
```typescript
export interface ProfitabilityHistory {
  month: string;        // YYYY-MM
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}
```

El perfil del cliente (CLI-01) incluye los últimos 12 meses de historial para la gráfica de evolución.

#### Criterios de aceptación

- [x] Rentabilidad calculada como ingresos – costes por cliente y período
- [x] Soporta los 3 modelos de precio (mensual, por servicio, por hora)
- [x] Coste calculado a partir de horas × coste/hora del trabajador (usa horas reales de fichaje si existen)
- [x] Si no hay coste/hora: clasificación `unknown` con aviso claro
- [x] Umbrales de clasificación: high (≥30%), medium (15-29%), low (1-14%), negative (≤0%)
- [x] Endpoint de rentabilidad individual y de cartera completa — OJO: responde clave `profitability` pero el API client lee `portfolio` (mismatch)
- [ ] Historial mensual de rentabilidad (últimos 12 meses)
- [x] Alerta automática para clientes con rentabilidad negativa
- [x] Distribución de rentabilidad en las estadísticas globales

---

### CLI-05 — Vinculación automática: Servicios ↔ Incidencias ↔ Facturas por cliente

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** CLI-01, SVC-01, SVC-02

#### Contexto

El requisito pide que se vinculen automáticamente servicios, incidencias y facturas con cada cliente. Hoy los datos están dispersos: los servicios de limpieza usan `clientName` como texto libre, las incidencias tienen `clientId` pero sin validación real, y las facturas del CRM no distinguen si son de la vertical de limpieza. Este ticket implementa las vinculaciones automáticas para que el perfil del cliente se construya correctamente.

#### Qué hacer

**1. Vinculación de servicios existentes con cliente CRM**

Ampliar `CleaningService` con campo `clientId` (aparte del `clientName` existente):
- Si el servicio fue generado desde un `service_contract` con `clientId`: hereda el `clientId`
- Si el servicio fue creado manualmente (sin contrato): intentar buscar cliente CRM por nombre/teléfono

Script de vinculación retroactiva (one-time):
```typescript
async function linkExistingServicesToClients(userId: string): Promise<{
  linked: number;
  unlinked: number;
  ambiguous: number;  // Nombre coincide con >1 cliente
}>
```

Endpoint: `POST /api/cleaning/clients/:userId/link-services` — ejecuta el proceso de vinculación retroactiva.

**2. Vinculación de incidencias**

Las incidencias ya tienen `clientId` en el modelo. Asegurar que:
- Al crear incidencia desde un servicio: heredar `clientId` del servicio o del contrato
- Al crear incidencia manual: buscador de cliente CRM (mismo que SVC-02)
- Las incidencias con `clientId` vacío y `clientName` relleno: candidatas a vinculación retroactiva

**3. Vinculación de facturas**

Las facturas CRM (`client_invoice`) ya tienen `clientId`. Para distinguir facturas de limpieza:
- Añadir campo `sourceVertical: 'cleaning' | 'general' | null` a `ClientInvoiceRecord`
- Las facturas generadas desde `service_contract` (SVC-06): marcan `sourceVertical = 'cleaning'`
- Las facturas manuales: el usuario puede marcar manualmente la vertical al crear

Actualizar `buildInvoiceDocument` en `couchdb.js`:
```javascript
sourceVertical: String(data.sourceVertical || existing?.sourceVertical || '').trim() || null,
```

**4. Query cruzada para el perfil del cliente**

En `cleaningClientsController.js`, las funciones de perfil (CLI-01) usan:
- Servicios: `cleaning_service` con `clientId === X` de DB `*-cleaning`
- Incidencias: `cleaning_incident` con `clientId === X` de DB `*-cleaning`
- Facturas: `client_invoice` con `clientId === X` y `sourceVertical === 'cleaning'` de DB `*-invoices` (o `*-clients` según la config)
- Notas: `client_note` con `clientId === X` de DB `*-clients`

**5. Trigger de vinculación automática en flujo normal**

Cuando se crea/actualiza un `service_contract`:
- Si tiene `clientId`: todos los servicios generados desde este contrato heredan `clientId`
- Si se cambia `clientId` en el contrato: actualizar los servicios futuros (no los pasados)

Cuando se genera una factura desde un contrato (SVC-06):
- La factura hereda `clientId` y se marca con `sourceVertical = 'cleaning'`

Cuando se crea una incidencia desde un servicio:
- La incidencia hereda `clientId` del servicio (que a su vez lo heredó del contrato)

#### Criterios de aceptación

- [x] Campo `clientId` añadido a `CleaningService` (opcional, retrocompatible)
- [ ] Servicios generados desde contrato heredan `clientId` automáticamente — `generateContractServices` NO pasa `clientId` al construir el servicio
- [ ] Incidencias creadas desde servicio heredan `clientId`
- [ ] Facturas de limpieza marcadas con `sourceVertical = 'cleaning'` — campo no existe en el modelo de factura
- [ ] Proceso de vinculación retroactiva funcional (link-services)
- [x] El perfil del cliente cruza datos de las 4 fuentes correctamente (servicios, incidencias, facturas, notas)
- [x] No se rompe la funcionalidad existente (campos opcionales)
- [ ] Campo `sourceVertical` añadido al modelo de factura sin romper facturas existentes

---

### CLI-06 — Página principal: Clientes y contratos activos

**Tipo:** Frontend (Página nueva)
**Prioridad:** Crítica
**Dependencias:** CLI-01, CLI-02, CLI-03, CLI-04, CLI-05

#### Contexto

Esta es la página principal que el usuario ve al acceder a `/saas/vertical/limpieza/clientes`. Debe ser un hub de consulta y gestión de la cartera de clientes de limpieza con una UX atractiva, moderna y eficiente. El diseño sigue el patrón de páginas SaaS del proyecto (Tailwind + MUI + dark mode).

#### Qué hacer

**1. Layout general de la página**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENTES Y CONTRATOS ACTIVOS                                               │
│  Consulta el estado real de cada cliente en tu vertical de limpieza         │
├─────────────────────────────────────────────────────────────────────────────┤
│  [⚠ 4 alertas activas · 1 crítica]  ← Banner colapsable (CLI-03)          │
├─────────────────────────────────────────────────────────────────────────────┤
│  📊 KPIs de cartera (6 cards)                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐│
│  │Clientes  │ │Fact.     │ │Beneficio │ │Impagos   │ │Incidencias│ │Renov.││
│  │activos   │ │mensual   │ │mensual   │ │pendientes│ │abiertas   │ │prox. ││
│  │  24      │ │ 12.300 € │ │ 4.200 €  │ │ 1.830 €  │ │   5       │ │  3   ││
│  │          │ │          │ │ 34% marg │ │ 2 clientes│ │           │ │      ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│  Controles:                                                                  │
│  [🔍 Buscar cliente...] [Estado ▾] [Responsable ▾] [Zona ▾]               │
│  [Rentabilidad ▾] [Ordenar ▾]        [+ Nuevo cliente] [⬇ Exportar]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TABLA / CARDS DE CLIENTES                                                  │
│                                                                              │
│  ┌─ Gimnasio FitBox ──────────────────────────────────────────────────────┐ │
│  │  📍 C/ Deportes 8, Madrid · Zona Centro                               │ │
│  │  🧹 2 contratos activos · 3×/sem + 1×/sem · 680 €/mes                │ │
│  │  👤 María García (responsable) · Ana López, Pedro Ruiz (trabajadores) │ │
│  │  📊 Margen 28% · ⚠ 1 incidencia abierta · 💰 0 € pendiente          │ │
│  │  📅 Renovación: 15/06/2026                           [Ver detalle →]  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ Oficina Acme S.L. ───────────────────────────────────────────────────┐ │
│  │  📍 C/ Mayor 15, Madrid · Zona Centro                                │ │
│  │  🧹 1 contrato activo · 5×/sem · 1.200 €/mes                         │ │
│  │  👤 Sin responsable ⚠ · María García (trabajadora)                    │ │
│  │  📊 Margen 42% · ✅ 0 incidencias · 💰 0 € pendiente                 │ │
│  │  📅 Contrato indefinido                               [Ver detalle →] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ Nave Industrial P.I. Sur ────────────────── 🔴 RENTABILIDAD BAJA ───┐ │
│  │  📍 P.I. Sur Nave 12, Getafe · Zona Sur                              │ │
│  │  🧹 1 contrato activo · Mensual · 280 €/mes                          │ │
│  │  👤 Juan Pérez (responsable) · Pedro Ruiz (trabajador)                │ │
│  │  📊 Margen -5% 🔴 · ⚠ 3 incidencias (patrón) · 💰 560 € pendiente  │ │
│  │  📅 Renovación: 01/05/2026 ⚠                         [Ver detalle →] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [Paginación: ← 1 2 3 4 ... 12 →]                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**2. Tabla de clientes — modo tabla (alternativo a cards)**

El usuario puede alternar entre vista de cards (arriba) y vista de tabla compacta:

| Columna | Contenido |
|---|---|
| Cliente | Nombre + badge tipo (empresa/particular) + icono alerta si hay |
| Ubicaciones | Nº de ubicaciones + ciudad principal |
| Contratos | "2 activos" / "1 pausado" con badge color |
| Servicios | Frecuencia resumen: "8×/sem", "2×/mes" |
| Facturación | "1.200 €/mes" o "80 €/servicio" |
| Rentabilidad | Badge: alta (verde), media (azul), baja (amber), negativa (rojo) |
| Impagos | Importe pendiente (rojo si > 0) |
| Incidencias | Nº abiertas (badge rojo si > 0) |
| Responsable | Nombre del responsable comercial |
| Renovación | Fecha o "Indefinido" (badge amber si próxima) |
| Acciones | Ver detalle, Editar, Nuevo contrato |

**3. Filtros y búsqueda**

| Filtro | Opciones |
|---|---|
| Búsqueda | Texto libre: busca en nombre, dirección, teléfono, email |
| Estado del contrato | Todos, Activo, Pausado, En renovación, Vencido, Sin contrato |
| Responsable | Lista de responsables del equipo + "Sin asignar" |
| Zona | Lista de zonas configuradas + "Sin zona" |
| Rentabilidad | Alta, Media, Baja, Negativa, Desconocida |
| Impagos | Todos, Con impagos, Sin impagos |
| Incidencias | Todos, Con incidencias abiertas, Sin incidencias |

Filtros persistentes en URL query params (para compartir links filtrados).

**4. Ordenación**

| Campo | Dirección |
|---|---|
| Nombre del cliente | A-Z / Z-A |
| Facturación mensual | Mayor a menor / menor a mayor |
| Rentabilidad | Mayor a menor |
| Impagos | Mayor a menor |
| Incidencias abiertas | Mayor a menor |
| Fecha de renovación | Más próxima primero |
| Fecha de alta | Más reciente primero |

**5. KPIs de cabecera**

| KPI | Cálculo | Indicador secundario |
|---|---|---|
| Clientes activos | Count de clientes con ≥1 contrato `active` | +N este mes |
| Facturación mensual | Suma `monthlyRevenue` de todos los contratos activos | vs. mes anterior (%) |
| Beneficio mensual | Suma `monthlyProfit` de toda la cartera | Margen medio (%) |
| Impagos pendientes | Suma de facturas `overdue` + `pending` vencidas | Nº de clientes afectados |
| Incidencias abiertas | Count de `cleaning_incident` con `status` in (`open`, `in_progress`) | Tendencia vs. mes anterior |
| Renovaciones próximas | Count de contratos con `endDate` en los próximos 30 días | Fecha más cercana |

**6. Acciones rápidas**

- **"+ Nuevo cliente"**: Abre modal de creación de cliente CRM adaptado a limpieza (campos relevantes pre-seleccionados, tipo de cliente = opciones de limpieza)
- **"Exportar"**: CSV/Excel con todos los datos de la tabla
- **Click en card/fila**: Navega al detalle del cliente (CLI-07)
- **Botón contextual "Nuevo contrato"**: Abre el wizard de contrato (SVC-08) pre-rellenado con el cliente

**7. Registrar ruta y navegación**

| Archivo | Cambio |
|---|---|
| `routes.tsx` | Añadir `{ path: 'vertical/limpieza/clientes', Component: CleaningClientsPage }` |
| `Sidebar.tsx` | En grupo `cleaning`, añadir ítem "Clientes" como primer ítem con icono `Users`, ruta `/saas/vertical/limpieza/clientes`. Los 5 ítems existentes quedan debajo. |
| `Sidebar.tsx` | Añadir badge de alertas junto al ítem (counter rojo si hay alertas críticas) |
| `Sidebar.tsx` | Actualizar `isActive` para reconocer `vertical/limpieza/clientes` |

**8. Responsive y dark mode**

- **Desktop**: Vista tabla o cards a pantalla completa, KPIs en fila de 6
- **Tablet**: KPIs en 2 filas de 3, tabla con scroll horizontal o cards apiladas
- **Móvil**: KPIs en scroll horizontal, solo vista cards apiladas, filtros como bottom sheet
- **Dark mode**: Coherente con el sistema de diseño actual (tokens de `ClientsPage.tsx`)

#### Criterios de aceptación

- [x] Página accesible en `/saas/vertical/limpieza/clientes`
- [x] Toggle vista cards / vista tabla
- [x] 6 KPIs calculados y visibles en la cabecera con indicadores secundarios
- [ ] Filtros por: búsqueda, estado, responsable, zona, rentabilidad, impagos, incidencias — faltan los filtros de impagos e incidencias
- [x] Filtros persistentes en URL query params
- [x] Ordenación por 7 campos con dirección ascendente/descendente
- [x] Paginación (20 clientes por página)
- [x] Cards de cliente con: ubicación, contratos, frecuencia, precio, rentabilidad, alertas
- [x] Tabla de cliente con todas las columnas definidas
- [ ] Botón "+ Nuevo cliente" con modal adaptado a limpieza
- [x] Botón "Exportar" a CSV
- [ ] Sidebar actualizado con nuevo ítem + badge de alertas — el ítem existe pero sin badge
- [x] Responsive en 3 breakpoints
- [x] Dark mode completo
- [x] Banner de alertas colapsable con acciones (descartar, ver cliente)
- [ ] Carga lazy para rendimiento — filtrado/paginación client-side sobre la lista completa

---

### CLI-07 — Detalle del cliente: Vista 360°

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06

#### Contexto

Cuando el gerente hace click en un cliente de la lista, accede a la vista completa del cliente con toda la información relevante organizada en secciones/pestañas. Esta vista es el corazón de la página de clientes — donde se toman decisiones de gestión.

#### Qué hacer

**1. Layout del detalle del cliente**

Se implementa como drawer lateral (panel deslizante desde la derecha, 60-70% del ancho en desktop) o como sub-página `/saas/vertical/limpieza/clientes/:clientId`. Preferir drawer para mantener contexto de la lista.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Volver a clientes                                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GIMNASIO FITBOX                          [Editar] [···] │  │
│  │  📱 +34 612 345 678  ·  📧 admin@fitbox.es              │  │
│  │  🏢 Empresa  ·  CIF: B12345678                           │  │
│  │  👤 Responsable: María García                             │  │
│  │  📅 Cliente desde: 15/01/2024                            │  │
│  │  ● Activo — 2 contratos activos                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────── RESUMEN RÁPIDO ──────────────────────────┐  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│  │
│  │  │680 €   │ │ 28%    │ │ 0 €    │ │  1     │ │ 4.2★   ││  │
│  │  │/mes    │ │margen  │ │impagos │ │incid.  │ │calidad ││  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Tabs:                                                           │
│  [Contratos] [Ubicaciones] [Servicios] [Incidencias]            │
│  [Facturas] [Rentabilidad] [Notas]                              │
│                                                                  │
│  (contenido de la pestaña activa)                               │
└─────────────────────────────────────────────────────────────────┘
```

**2. Cabecera del detalle**

Siempre visible (sticky top):
- Nombre del cliente (grande, bold)
- Datos de contacto: teléfono (con link `tel:`), email (con link `mailto:`)
- Tipo: badge "Empresa" o "Particular"
- CIF/NIF si es empresa
- Responsable comercial con link a su perfil
- Fecha de alta como cliente
- Estado global: badge con color
- Menú "···": Editar en CRM, Crear contrato, Crear incidencia, Archivar cliente

**3. Resumen rápido (mini-KPIs)**

5 cards horizontales siempre visibles debajo de la cabecera:
- **Facturación**: "680 €/mes" (suma de contratos activos)
- **Margen**: "28%" con color (verde >30%, azul 15-30%, amber 5-15%, rojo <5%)
- **Impagos**: "0 €" en verde o "1.230 €" en rojo
- **Incidencias**: "1 abierta" en amber, "0" en verde
- **Calidad**: "4.2 ★" media de servicios del último mes

**4. Pestaña "Contratos"**

Lista de contratos del cliente con:

```
┌──────────────────────────────────────────────────────────────┐
│  CTR-0012 · Limpieza general                    ● Activo    │
│  📍 C/ Deportes 8, Madrid (Zona Centro)                     │
│  🔄 3 veces/semana · L-M-V 09:00-12:00 · 3h/visita        │
│  💰 450 €/mes (mensual, IVA incl.)                          │
│  👷 Ana López · Suplente: Pedro Ruiz                        │
│  📅 Inicio: 01/02/2024 · Fin: indefinido                    │
│  📦 Materiales: empresa                                      │
│                                                               │
│  [Editar] [Pausar] [Generar servicios] [Ver calendario →]   │
├──────────────────────────────────────────────────────────────┤
│  CTR-0018 · Desinfección                    ● Activo         │
│  📍 C/ Deportes 8, Madrid (Zona Centro)                     │
│  🔄 1 vez/semana · Sábados 08:00-10:00 · 2h/visita         │
│  💰 230 €/mes (mensual, IVA incl.)                          │
│  👷 Pedro Ruiz                                               │
│  📅 Inicio: 01/03/2025 · Renovación: 01/03/2026            │
│                                                               │
│  [Editar] [Renovar] [Generar servicios] [Ver calendario →]  │
└──────────────────────────────────────────────────────────────┘

[+ Nuevo contrato para este cliente]
```

Cada contrato:
- Número + tipo de limpieza + badge estado
- Ubicación + zona
- Frecuencia detallada + horario + horas por visita
- Precio con modelo e IVA
- Trabajador principal + suplente
- Fechas de inicio/fin/renovación
- Materiales (empresa o cliente)
- Acciones: Editar, Pausar/Activar, Renovar, Generar servicios, Ver en calendario

**5. Pestaña "Ubicaciones"**

```
┌──────────────────────────────────────────────────────────────┐
│  📍 Sede principal                                           │
│  C/ Deportes 8, 28001 Madrid · Zona Centro                  │
│  Contacto: Laura Gómez · 612 345 679                        │
│  Acceso: Código portero 1234, llave en recepción            │
│  120 m² · 2 plantas                                          │
│  Contratos activos: CTR-0012, CTR-0018                      │
│  Servicios realizados: 142                                   │
│                                                [Editar]     │
├──────────────────────────────────────────────────────────────┤
│  📍 Almacén norte                                            │
│  Pol. Ind. Norte Nave 5, 28100 Alcobendas · Zona Norte      │
│  Contacto: Miguel Santos · 612 345 680                      │
│  Acceso: Puerta lateral, avisar antes                        │
│  250 m² · 1 planta                                           │
│  Contratos activos: (ninguno)                                │
│  Servicios realizados: 12                                    │
│                                         [Editar] [Archivar] │
└──────────────────────────────────────────────────────────────┘

[+ Añadir ubicación]
```

Cada ubicación:
- Nombre descriptivo
- Dirección completa + zona
- Contacto específico de la ubicación
- Instrucciones de acceso
- Metros cuadrados + plantas
- Contratos vinculados a esta ubicación
- Nº de servicios realizados
- Acciones: Editar, Archivar

**6. Pestaña "Servicios"**

Timeline de los últimos servicios realizados + próximos programados:

```
┌──────────────────────────────────────────────────────────────┐
│  PRÓXIMOS                                                     │
│  Mié 16/04 · 09:00-12:00 · Limpieza general · Ana López    │
│  ● Asignado · CTR-0012 · C/ Deportes 8                      │
│                                                               │
│  Sáb 19/04 · 08:00-10:00 · Desinfección · Pedro Ruiz       │
│  ● Asignado · CTR-0018 · C/ Deportes 8                      │
│                                                               │
│  REALIZADOS                                                   │
│  Lun 14/04 · 09:00-12:00 · Limpieza general · Ana López    │
│  ✅ Completado · 2h 55min · ★ 4.5 · CTR-0012                │
│                                                               │
│  Vie 11/04 · 09:00-12:00 · Limpieza general · Ana López    │
│  ✅ Completado · 3h 05min · ★ 4.0 · CTR-0012                │
│                                                               │
│  Mié 09/04 · 09:00-12:00 · Limpieza general · Ana López    │
│  ❌ Cancelado · Motivo: Festivo local                        │
│  ...                                                          │
├──────────────────────────────────────────────────────────────┤
│  Resumen del mes: 12 servicios · 10 completados · 1 cancel. │
│  Horas: 32h reales / 36h contratadas (89%)                  │
│  Calidad media: ★ 4.2                                        │
│                              [Ver todos →] [Ver calendario →] │
└──────────────────────────────────────────────────────────────┘
```

**7. Pestaña "Incidencias"**

```
┌──────────────────────────────────────────────────────────────┐
│  ABIERTAS                                                     │
│  🔴 INC-0089 · Falta de limpieza · Alta · 10/04/2026       │
│  "Baños no limpiados en la visita del viernes"               │
│  Asignada a: María García · Vence: 14/04/2026              │
│                                       [Ver detalle] [Resolver]│
│                                                               │
│  RESUELTAS (últimas 10)                                      │
│  ✅ INC-0082 · Rotura · Media · 28/03/2026                  │
│  Resuelta en 2 días por Ana López                            │
│  ...                                                          │
├──────────────────────────────────────────────────────────────┤
│  Resumen: 15 totales · 1 abierta · Tiempo medio resolución: │
│  2.3 días · Tipo más frecuente: Falta de limpieza (6)       │
│  Tendencia: ↗ Empeorando (3 meses)                          │
│                                [Ver todas →] [+ Nueva incidencia]│
└──────────────────────────────────────────────────────────────┘
```

Incluye:
- Incidencias abiertas con detalle y acciones
- Historial de incidencias resueltas
- Resumen estadístico: total, abiertas, tiempo medio resolución
- Tipo más frecuente (patrón)
- Tendencia trimestral (mejorando/estable/empeorando)
- Botón para crear nueva incidencia pre-vinculada al cliente

**8. Pestaña "Facturas"**

```
┌──────────────────────────────────────────────────────────────┐
│  FAC-2026-042 · 01/04/2026 · 680,00 € · ✅ Cobrada         │
│  Servicios marzo 2026 (limpieza general + desinfección)      │
│  Cobrada el 05/04/2026 por transferencia                     │
│                                       [Ver PDF] [Enviar]    │
│                                                               │
│  FAC-2026-031 · 01/03/2026 · 680,00 € · ✅ Cobrada         │
│  Servicios febrero 2026                                       │
│  Cobrada el 08/03/2026 por transferencia                     │
│                                                               │
│  FAC-2026-018 · 01/02/2026 · 680,00 € · 🟡 Pendiente      │
│  Servicios enero 2026                                         │
│  Vence: 28/02/2026 (45 días de retraso) ⚠                  │
│                              [Ver PDF] [Registrar cobro] [Enviar recordatorio]│
│  ...                                                          │
├──────────────────────────────────────────────────────────────┤
│  Total facturado: 8.160 € · Cobrado: 7.480 € · Pendiente:  │
│  680 € · Media de cobro: 6 días                             │
│                              [Ver todas →] [+ Generar factura]│
└──────────────────────────────────────────────────────────────┘
```

Incluye:
- Lista de facturas con estado, importe, fecha, método de cobro
- Facturas pendientes/vencidas destacadas con acciones de cobro
- Resumen: total facturado, cobrado, pendiente, media de días de cobro
- Acciones: Ver PDF, Enviar por email, Registrar cobro, Generar factura manual
- Botón "Generar factura" para facturación manual del período actual

**9. Pestaña "Rentabilidad"**

```
┌──────────────────────────────────────────────────────────────┐
│  RENTABILIDAD — Últimos 12 meses                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  📈 Gráfica de evolución                                ││
│  │  (línea: ingresos verde, costes rojo, beneficio azul)   ││
│  │  Eje X: meses · Eje Y: euros                            ││
│  │                                                          ││
│  │  May Jun Jul Ago Sep Oct Nov Dic Ene Feb Mar Abr        ││
│  │  ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───      ││
│  │  [gráfica de barras/líneas con Recharts]                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  DESGLOSE DEL MES ACTUAL (Abril 2026)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Ingresos:  680,00 €/mes (2 contratos)                  ││
│  │    · CTR-0012: 450,00 €  (limpieza general)             ││
│  │    · CTR-0018: 230,00 €  (desinfección)                 ││
│  │                                                          ││
│  │  Costes:    489,60 € estimados                          ││
│  │    · Ana López: 12h/sem × 4.3 sem × 8,00 €/h = 412,80 €││
│  │    · Pedro Ruiz: 2h/sem × 4.3 sem × 9,00 €/h = 77,40 € ││
│  │                                                          ││
│  │  Beneficio: 190,40 €/mes                                ││
│  │  Margen:    28,0%  ● MEDIO                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ⓘ El coste/hora de los trabajadores se configura en        │
│    Equipo > Trabajadores. Si no está configurado, la         │
│    rentabilidad aparece como "Desconocida".                  │
└──────────────────────────────────────────────────────────────┘
```

Incluye:
- Gráfica de evolución (Recharts): ingresos, costes, beneficio — 12 meses
- Desglose detallado del mes actual: contratos + costes por trabajador
- Badge de clasificación con color
- Nota informativa si no hay datos de coste del trabajador

**10. Pestaña "Notas"**

```
┌──────────────────────────────────────────────────────────────┐
│  + Añadir nota                                                │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  [Escribe una nota sobre este cliente...]        [Guardar]││
│  │  ☐ Marcar como importante                                ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ⚠ IMPORTANTE · María García · 10/04/2026                   │
│  "El cliente pidió que no se use lejía en los suelos de      │
│  madera. Usar producto especial azul del almacén."           │
│                                              [Editar] [Eliminar]│
│                                                               │
│  · Ana López · 05/04/2026                                    │
│  "Contacto nuevo para acceso: Laura Gómez 612345679"        │
│                                                               │
│  · Sistema · 01/04/2026                                      │
│  "Factura FAC-2026-042 generada automáticamente (680 €)"    │
│                                                               │
│  ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

Incluye:
- Formulario de nueva nota inline (sin modal)
- Toggle "Marcar como importante"
- Notas importantes destacadas (border amber, icono warning)
- Notas del sistema (actividad automática: facturas, cambios de estado, etc.)
- Editar/eliminar notas propias

#### Criterios de aceptación

- [x] Drawer/sub-página con cabecera sticky del cliente
- [ ] Mini-KPIs siempre visibles: facturación, margen, impagos, incidencias, calidad — UI hecha pero el backend no devuelve `invoiceStats`/`serviceStats` (datos rotos)
- [ ] 7 pestañas funcionales: Contratos, Ubicaciones, Servicios, Incidencias, Facturas, Rentabilidad, Notas — las 7 pestañas existen, pero Servicios/Incidencias/Facturas dependen de stats que el backend no devuelve
- [ ] Pestaña Contratos: lista completa con acciones (editar, pausar, renovar, generar) — lista completa pero sin acciones
- [ ] Pestaña Ubicaciones: CRUD con datos de contacto y acceso — solo lectura (muestra contacto, acceso, m²)
- [ ] Pestaña Servicios: timeline próximos + realizados con estadísticas — solo recientes, sin sección "próximos"
- [ ] Pestaña Incidencias: abiertas + historial + tendencia + patrón — UI de tendencia hecha, backend no la calcula
- [ ] Pestaña Facturas: lista con estados + acciones de cobro + resumen — tabla sin acciones de cobro
- [ ] Pestaña Rentabilidad: gráfica 12 meses + desglose + clasificación — gráfica Recharts hecha, backend no devuelve `revenueHistory`
- [ ] Pestaña Notas: CRUD inline + notas importantes + notas del sistema — solo lectura con destacado de importantes
- [ ] Cada pestaña carga datos bajo demanda (lazy) — todo viene en la llamada única de perfil
- [ ] Acciones del menú "···": Editar en CRM, Crear contrato, Crear incidencia, Archivar
- [x] Responsive + dark mode
- [ ] Links cruzados funcionales (contrato → calendario, factura → PDF, incidencia → detalle)

---

### CLI-08 — Perfil gerente: Cartera completa y rentabilidad

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CLI-06, CLI-07, CLI-04

#### Contexto

El perfil gerente (`owner`, `admin`, `manager`) tiene acceso completo a la cartera de clientes con datos financieros, rentabilidad y todas las acciones de gestión. Este ticket asegura que la experiencia del gerente sea completa y que la información financiera sea accesible y accionable.

#### Qué hacer

**1. Vista exclusiva del gerente: Panel de rentabilidad global**

Accesible desde un botón "📊 Análisis de cartera" en la cabecera de la página de clientes (o como pestaña adicional):

```
┌─────────────────────────────────────────────────────────────────┐
│  ANÁLISIS DE CARTERA — Abril 2026                    [Mes ▾]   │
│                                                                  │
│  Ingresos mensuales: 12.300 €  ·  Costes: 8.100 €             │
│  Beneficio: 4.200 €  ·  Margen medio: 34%                     │
│                                                                  │
│  ┌─ Distribución de rentabilidad ──────────────────────────┐   │
│  │  🟢 Alta (>30%):    8 clientes  ·  5.800 €/mes         │   │
│  │  🔵 Media (15-30%): 10 clientes ·  4.200 €/mes         │   │
│  │  🟡 Baja (1-14%):   4 clientes  ·  1.800 €/mes         │   │
│  │  🔴 Negativa (≤0%): 2 clientes  ·  -300 €/mes          │   │
│  │  ⚪ Desconocida:     0 clientes                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Top 5 clientes más rentables ──────────────────────────┐   │
│  │  1. Oficina Acme      1.200 €/mes  margen 42%          │   │
│  │  2. Gimnasio FitBox     680 €/mes  margen 28%          │   │
│  │  3. Comunidad Flores    350 €/mes  margen 45%          │   │
│  │  ...                                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Clientes problemáticos (requieren acción) ─────────────┐   │
│  │  🔴 Nave P.I. Sur      280 €/mes  margen -5%  ⚠ impago│   │
│  │  🔴 Tienda Moda S.L.   150 €/mes  margen -12%         │   │
│  │  🟡 Restaurante Central 400 €/mes  margen 8%  ⚠ 3 inc.│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Evolución mensual ─────────────────────────────────────┐   │
│  │  [Gráfica de barras: ingresos vs costes por mes, 12m]   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Exportar informe PDF] [Exportar datos Excel]                  │
└─────────────────────────────────────────────────────────────────┘
```

**2. Acciones exclusivas del gerente**

| Acción | Descripción |
|---|---|
| Crear cliente | Modal completo con todos los campos CRM + tipo limpieza |
| Editar cliente | Acceso a todos los campos |
| Crear contrato | Wizard de 5 pasos (SVC-08) |
| Pausar/Cancelar contrato | Con confirmación y motivo |
| Ver rentabilidad | Pestaña rentabilidad en detalle + panel global |
| Ver precios y facturación | Todos los datos financieros visibles |
| Reasignar responsable | Cambiar responsable comercial del cliente |
| Generar factura | Manual o verificar las automáticas |
| Exportar datos | CSV/Excel/PDF con toda la información |
| Configurar alertas | Activar/desactivar tipos de alerta por umbral |
| Archivar cliente | Desactivar cliente sin eliminarlo |

**3. Acciones masivas sobre clientes**

En la tabla/cards de la lista:
- Checkbox por cliente + barra de acciones masivas
- Acciones: Asignar responsable, Exportar selección, Etiquetar (tags)

**4. Resumen de renovaciones**

Widget dedicado en el análisis de cartera:
- Lista de contratos que vencen en los próximos 60 días
- Ordenados por fecha de vencimiento
- Acción rápida: "Renovar" directamente desde aquí

#### Criterios de aceptación

- [x] Panel "Análisis de cartera" accesible solo para roles gerente
- [x] Distribución de rentabilidad con colores y totales (gráfica de barras Recharts) — OJO: el endpoint responde `profitability` y la API espera `portfolio`, el panel no recibe datos
- [x] Top 5 clientes más rentables
- [ ] Lista de clientes problemáticos (rentabilidad negativa + incidencias + impagos) — solo por rentabilidad, sin cruzar incidencias/impagos
- [ ] Gráfica de evolución mensual (Recharts) — el panel no tiene gráfica de evolución temporal
- [ ] Exportación PDF e Excel del informe
- [ ] Acciones masivas: asignar responsable, exportar, etiquetar
- [ ] Widget de renovaciones próximas con acción rápida — solo KPI contador, sin listado ni acción
- [x] Todos los datos financieros visibles (precios, márgenes, costes)
- [ ] Configuración de umbrales de alertas

---

### CLI-09 — Perfil trabajador: Consulta operativa de clientes asignados

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CLI-06, CLI-07

#### Contexto

El trabajador (`worker`, o cualquier rol que no sea `owner`/`admin`/`manager`) debe poder consultar la información operativa de los clientes a los que tiene servicios asignados. La vista está filtrada y simplificada: solo los clientes donde trabaja, sin datos financieros ni acciones de gestión.

#### Qué hacer

**1. Detección de perfil y filtrado**

```typescript
const isManager = ['owner', 'admin', 'manager'].includes(currentUser.role);
```

Si `isManager === false`:
- Obtener los contratos asignados al trabajador (por `assignedWorkerId` o `backupWorkerId`)
- Extraer los `clientId` únicos de esos contratos
- Filtrar la lista de clientes a solo esos `clientId`

**2. Vista del trabajador en la lista**

```
┌─────────────────────────────────────────────────────────────────┐
│  MIS CLIENTES · Ana López                                        │
│  Clientes donde tienes servicios asignados                      │
├─────────────────────────────────────────────────────────────────┤
│  📊 Resumen                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Clientes  │ │Servicios │ │Horas     │ │Próximo   │          │
│  │asignados │ │esta sem. │ │esta sem. │ │servicio  │          │
│  │   4      │ │   12     │ │   28h    │ │Hoy 14:00 │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Gimnasio FitBox ─────────────────────────────────────────┐ │
│  │  📍 C/ Deportes 8, Madrid                                 │ │
│  │  🧹 Limpieza general · L-M-V 09:00-12:00                 │ │
│  │  📞 Contacto: Laura Gómez · 612 345 679                  │ │
│  │  🔑 Código portero 1234, llave en recepción              │ │
│  │  📋 Próximo servicio: Hoy 14:00                          │ │
│  │                                        [Ver servicios →]  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Comunidad Flores ────────────────────────────────────────┐ │
│  │  📍 Av. Libertad 42, Madrid                               │ │
│  │  🧹 Limpieza general · M-J 10:00-12:00                   │ │
│  │  📞 Contacto: Paco Moreno · 612 345 681                  │ │
│  │  🔑 Llamar al portero antes de llegar                     │ │
│  │  📋 Próximo servicio: Mañana 10:00                       │ │
│  │                                        [Ver servicios →]  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**3. Información visible para el trabajador**

Para cada cliente:
- Nombre del cliente
- Dirección/ubicación donde trabaja
- Tipo de servicio y frecuencia
- Horario de sus servicios
- Contacto de la ubicación (nombre + teléfono)
- Instrucciones de acceso
- Próximo servicio programado
- Link a Google Maps (para navegación)

**4. Información OCULTA para el trabajador**

- Precios y facturación (ni mensuales ni por servicio)
- Rentabilidad y márgenes
- Facturas y estados de cobro
- Responsable comercial
- CIF/NIF y datos fiscales
- Otros contratos que no están asignados al trabajador
- Otros trabajadores asignados al mismo cliente
- Panel de análisis de cartera

**5. Detalle del cliente para el trabajador**

Al hacer click en un cliente, drawer simplificado con solo:
- **Pestaña "Servicios"**: solo los servicios asignados al trabajador (no los de otros)
- **Pestaña "Ubicación"**: dirección, contacto, acceso, notas de la ubicación
- **Pestaña "Instrucciones"**: observaciones del contrato + instrucciones del cliente
- **Pestaña "Incidencias"**: incidencias del cliente donde el trabajador puede crear nuevas
- Sin pestañas de: Contratos (detalle), Facturas, Rentabilidad

**6. KPIs del trabajador**

4 cards en la cabecera:
- **Clientes asignados**: Nº de clientes donde tiene servicios
- **Servicios esta semana**: Nº de servicios programados
- **Horas esta semana**: Suma de horas programadas
- **Próximo servicio**: "Hoy 14:00 — Gimnasio FitBox"

**7. Responsive (prioridad móvil)**

El trabajador usa principalmente el móvil:
- Cards grandes y legibles
- Botones de acción amplios (iniciar servicio, ver dirección)
- Datos de contacto con links clickables (`tel:`, Google Maps)
- Scroll sencillo, sin tablas complejas

#### Criterios de aceptación

- [ ] El trabajador solo ve clientes donde tiene servicios asignados — la lista no se filtra por trabajador; solo cambia el título a "Mis Clientes"
- [ ] Cards de cliente con: ubicación, horario, contacto, acceso, próximo servicio
- [x] NO muestra: precios, facturas, rentabilidad, CIF, responsable comercial — pestañas Facturas/Rentabilidad y columnas financieras ocultas para no-gerentes
- [ ] Detalle simplificado con 4 pestañas: Servicios, Ubicación, Instrucciones, Incidencias — ve las pestañas generales sin financieras, no el set simplificado
- [ ] KPIs adaptados: clientes, servicios semana, horas semana, próximo servicio
- [ ] Links funcionales: teléfono (`tel:`), dirección (Google Maps)
- [ ] Responsive optimizado para móvil
- [x] Dark mode
- [ ] Si el trabajador no tiene clientes asignados: empty state con mensaje claro

---

### CLI-10 — Conexión: CRM Core ↔ Clientes limpieza

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** CLI-01, CLI-06, SVC-02

#### Contexto

El módulo CRM genérico (`ClientsPage.tsx`, `/saas/crm/clientes`) y la nueva página de clientes de limpieza deben estar conectados bidireccionalmente. Un cliente CRM que tiene contratos de limpieza debe poder navegar a la vista de limpieza, y viceversa.

#### Qué hacer

**1. En la ficha del cliente CRM genérico: sección de limpieza**

Si el cliente tiene contratos/servicios de limpieza vinculados, mostrar sección o pestaña en `ClientsPage.tsx`:

```
┌──────────────────────────────────────────────────────┐
│  🧹 Vertical Limpieza                                │
│                                                       │
│  Contratos activos: 2                                │
│  Facturación mensual: 680 €                          │
│  Incidencias abiertas: 1                             │
│                                                       │
│  [Ver en Clientes Limpieza →]                        │
└──────────────────────────────────────────────────────┘
```

**2. En la cabecera del detalle del cliente de limpieza: link al CRM**

Botón "Ver en CRM →" que navega a `/saas/crm/clientes?client=X` o abre el drawer del cliente CRM.

**3. Sincronización de datos del cliente**

Cuando se edita un cliente desde la vista de limpieza (nombre, teléfono, email, dirección):
- La edición se guarda en la entidad `client` de CRM (fuente de verdad)
- La vista de limpieza siempre lee los datos del CRM en tiempo real

Cuando se edita un cliente desde el CRM genérico:
- Los datos actualizados se reflejan automáticamente en la vista de limpieza (misma fuente de datos)

**4. Creación de cliente desde limpieza**

El modal "+ Nuevo cliente" en la página de limpieza:
- Crea un `client` en la DB CRM (`*-clients`)
- Campos pre-configurados para limpieza: `clientType` = opciones de limpieza, campos de dirección visibles por defecto
- Opción de vincular inmediatamente a un nuevo contrato de limpieza

**5. Endpoint para verificar vinculación**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/clients/:userId/check-crm-link/:clientId` | GET | Verifica si un cliente CRM tiene datos de limpieza (contratos, servicios) |

Respuesta:
```typescript
{
  hasCleaningData: boolean;
  activeContracts: number;
  totalServices: number;
  linkUrl: string;  // URL a la vista de limpieza
}
```

#### Criterios de aceptación

- [ ] Sección "Vertical Limpieza" visible en la ficha del cliente CRM (si tiene datos de limpieza)
- [ ] Link "Ver en CRM →" desde la vista de limpieza al CRM genérico
- [x] Datos del cliente siempre sincronizados (fuente única en `*-clients`) — el perfil lee el `client` del CRM en tiempo real
- [ ] Modal de creación de cliente adaptado a limpieza
- [ ] Endpoint de verificación de vinculación funcional — `check-crm-link` no existe
- [ ] Navegación bidireccional fluida entre CRM y vista limpieza

---

### CLI-11 — Conexión: Dashboard ↔ Clientes limpieza

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** CLI-01, CLI-03

#### Contexto

El Dashboard principal del SaaS no muestra información sobre la cartera de clientes de limpieza. El gerente necesita ver de un vistazo el estado de sus clientes desde el panel principal.

#### Qué hacer

**1. Widget "Cartera de clientes" en Dashboard**

```
┌────────────────────────────────────────────┐
│  👥 Cartera clientes limpieza              │
│                                             │
│  Clientes activos:       24                │
│  Facturación mensual: 12.300 €            │
│  Margen medio:           34%              │
│                                             │
│  ⚠ 2 clientes con impagos (1.830 €)      │
│  ⚠ 3 contratos por renovar               │
│  ⚠ 1 cliente con incidencias repetidas    │
│                                             │
│  [Ver clientes →]                          │
└────────────────────────────────────────────┘
```

**2. Ampliar endpoint `/api/dashboard/kpis/:userId`**

Añadir sección `cleaningClients` al JSON de respuesta:
```javascript
cleaningClients: {
  activeClients: 24,
  monthlyRevenue: 12300.00,
  monthlyProfit: 4200.00,
  avgMargin: 34,
  clientsWithUnpaid: 2,
  unpaidAmount: 1830.00,
  contractsExpiringCount: 3,
  clientsWithRepeatedIncidents: 1,
  alertCount: 6,
}
```

**3. Feed de actividad**

En el feed del Dashboard, incluir eventos de clientes de limpieza:
- "Nuevo cliente: Restaurante La Plaza (contrato 450 €/mes)"
- "Factura cobrada: Gimnasio FitBox — 680 €"
- "3 contratos por renovar este mes"

#### Criterios de aceptación

- [ ] Widget visible en Dashboard para vertical `cleaning` — no existe sección `cleaningClients` en el dashboard
- [ ] KPIs de cartera calculados: clientes, facturación, margen, alertas
- [ ] Alertas de clientes visibles dentro del widget
- [ ] Click en widget navega a `/saas/vertical/limpieza/clientes`
- [x] Feed de actividad incluye eventos de clientes de limpieza — `logAccountActivity` registra ubicaciones, alertas descartadas y generación de servicios
- [ ] Responsive + dark mode

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (backend y datos)
├── CLI-01 Backend: Endpoint de cliente enriquecido
├── CLI-02 Modelo de ubicaciones de cliente
└── CLI-05 Vinculación automática: Servicios ↔ Incidencias ↔ Facturas

Fase 2 — Inteligencia de negocio
├── CLI-03 Sistema de alertas de clientes
└── CLI-04 Detección de rentabilidad y cliente poco rentable

Fase 3 — Interfaz principal
├── CLI-06 Página principal: Clientes y contratos activos
└── CLI-07 Detalle del cliente: Vista 360°

Fase 4 — Perfiles y acceso
├── CLI-08 Perfil gerente: Cartera completa y rentabilidad
└── CLI-09 Perfil trabajador: Consulta operativa

Fase 5 — Conexiones
├── CLI-10 Conexión: CRM Core ↔ Clientes limpieza
└── CLI-11 Conexión: Dashboard ↔ Clientes limpieza
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| CLI-01 Endpoint cliente enriquecido | Muy Alta | 8-10h |
| CLI-02 Modelo ubicaciones de cliente | Media | 3-4h |
| CLI-03 Sistema de alertas de clientes | Alta | 5-6h |
| CLI-04 Rentabilidad y cliente poco rentable | Alta | 5-6h |
| CLI-05 Vinculación automática servicios/incidencias/facturas | Alta | 5-6h |
| CLI-06 Página principal: Clientes y contratos activos | Muy Alta | 10-12h |
| CLI-07 Detalle del cliente: Vista 360° | Muy Alta | 12-15h |
| CLI-08 Perfil gerente: Cartera completa | Alta | 5-6h |
| CLI-09 Perfil trabajador: Consulta operativa | Media-Alta | 4-5h |
| CLI-10 Conexión CRM Core | Media | 3-4h |
| CLI-11 Conexión Dashboard | Media | 3-4h |
| **Total** | | **~63-78h** |

---

## Notas técnicas

### Base de datos

Los datos del cliente viven en la DB `*-clients` (CRM). Los datos de limpieza (contratos, servicios, incidencias, ubicaciones) viven en `*-cleaning`. Las facturas viven en `*-invoices` (o la DB que use `invoicesController`). El endpoint de CLI-01 cruza las 3 bases de datos.

Las ubicaciones de cliente (`cleaning_client_location`) se almacenan en `*-cleaning` porque son específicas de la vertical.

### Sin duplicación de datos del cliente

La fuente de verdad del cliente es siempre `*-clients` (CRM). La vista de limpieza lee del CRM y no duplica nombre/teléfono/email. Los campos desnormalizados en contratos/servicios (`clientName`) son cache para búsqueda rápida y listados, no para edición.

### Retrocompatibilidad

- Los servicios existentes sin `clientId` siguen funcionando; aparecen con aviso "Cliente no vinculado"
- Las facturas sin `sourceVertical` no aparecen en la vista de limpieza (solo las que están vinculadas a un `clientId` que tenga contratos de limpieza, o las marcadas como `cleaning`)
- Las incidencias con `clientId` ya rellenado se vinculan automáticamente

### Rendimiento

El endpoint de lista (CLI-01) debe manejar hasta 200 clientes con datos agregados de contratos, incidencias y facturas. Estrategias:
- Calcular los agregados en servidor (no enviar todos los documentos crudos al frontend)
- Usar paginación (20 por página)
- Las pestañas del detalle cargan bajo demanda (lazy)
- Cache de estadísticas globales con TTL de 5 minutos

### Permisos

| Dato | Gerente | Trabajador |
|---|---|---|
| Lista de clientes | Todos | Solo asignados |
| Datos de contacto | Sí | Solo ubicación |
| Precios/facturación | Sí | No |
| Rentabilidad | Sí | No |
| CIF/datos fiscales | Sí | No |
| Incidencias | Todas | Solo las de sus servicios |
| Notas | Todas | Solo las marcadas como operativas |
| Crear/editar/borrar | Sí | No |
| Exportar | Sí | No |

### i18n

Todos los labels nuevos deben incluirse en los 4 idiomas existentes: es, en, pt, fr. Los tipos de alerta, clasificaciones de rentabilidad y estados se definen como objetos traducibles siguiendo el patrón `STATUS_CONFIG`, `CLEANING_TYPES`, etc.

### Dependencias externas

Este plan depende de que `service_contract` (SVC-01 de SERVICIOS-CONTRATOS-LIMPIEZA.md) esté implementado. Sin contratos, la página puede funcionar en modo degradado mostrando clientes CRM con servicios de limpieza (sin datos de contrato, frecuencia ni precio contractual). El plan contempla esta degradación:
- Si no hay `service_contract` implementado: mostrar servicios por cliente con los datos actuales (`cleaning_service`)
- Los campos de frecuencia, horario estructurado y precio mensual solo aparecen cuando existen contratos

### Relación con las 4 páginas existentes de limpieza

Las páginas existentes (`CleaningServices`, `CleaningChecklist`, `CleaningQuality`, `CleaningReviews`, `CleaningIncidents`) siguen funcionando independientemente. La nueva página de clientes las complementa con una vista centrada en el cliente en vez de en el servicio. Links cruzados:
- Desde el detalle del cliente → servicios (pestaña) → click en servicio → `CleaningServices` o detalle del servicio
- Desde el detalle del cliente → incidencias (pestaña) → click en incidencia → `CleaningIncidents` o detalle
- Desde `CleaningServices` → click en nombre del cliente → drawer del cliente en la nueva página
