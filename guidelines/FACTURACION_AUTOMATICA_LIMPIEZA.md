# FACTURACIÓN AUTOMÁTICA — Vertical Limpieza

**Tipo:** Página  
**URL objetivo:** `/saas/vertical/limpieza/facturacion`  
**URL provisional (actual):** `/saas/cleaning-billing`  
**Fecha:** 14 abril 2026  
**Estado:** Planificación

---

## Objetivo

Cobrar servicios recurrentes y puntuales de forma automática o semiautomática dentro de la vertical de Limpieza.  
El gerente debe poder emitir, revisar y cobrar facturas con el mínimo esfuerzo manual.  
El trabajador no debe ver datos económicos globales salvo permiso específico.

---

## Análisis del estado actual

### Lo que YA existe

| Capa | Archivo | Qué hace | Limitaciones para facturación automática |
|------|---------|----------|------------------------------------------|
| **Backend — modelo factura** | `services/couchdb.js` → `buildInvoiceDocument` | Doc CouchDB `type: 'client_invoice'` con clientId, clientName, number, date, dueDate, total, paid, status (`draft`/`pending`/`paid`/`overdue`), paymentMethod, notes | No tiene: líneas de detalle (solo total), frecuencia de facturación, referencia a servicio/contrato de limpieza, IVA desglosado, campo `serviceIds[]`, campo `recurrence`, campo `sentAt`, campo `pdfUrl` |
| **Backend — CRUD factura** | `controllers/invoicesController.js` | CRUD completo (list/create/update/remove) con soft delete y activity log | No genera factura automáticamente. No envía email. No crea ingreso en Finanzas. No vincula con servicio de limpieza |
| **Backend — rutas factura** | `routers/invoicesRouter.js` | GET/POST/PUT/DELETE en `/api/invoices/:userId` | Sin endpoint de generación automática, ni envío, ni marcado de cobro |
| **Backend — modelo servicio limpieza** | `services/couchdb.js` → `buildCleaningServiceDocument` | Doc CouchDB `type: 'cleaning_service'` con clientName, price, invoiceId, status, date, cleaningType, tasks, etc. | Tiene `invoiceId` (relación 1:1 prevista) y `price`. No tiene: frecuencia recurrente (`recurrence`), contrato asociado, historial de precios, campo `billingStatus` |
| **Backend — CRUD limpieza** | `controllers/cleaningController.js` | CRUD completo list/create/update/remove | No factura automáticamente al completar servicio |
| **Backend — modelo finanzas** | `services/couchdb.js` → `buildFinanceDocument` | Doc `type: 'cobro'` o `'pago'` con amountBase, taxRate, taxAmount, totalAmount, concept, category, payMethod, date | Sin referencia a factura origen (`invoiceId`) ni a servicio de limpieza (`serviceId`) |
| **Backend — alertas** | `services/alertEngine.js` + `controllers/alertController.js` | Sistema de alertas con `overdueInvoicesEnabled`, `highPayablesEnabled`, etc. | No tiene alertas específicas para: factura pendiente de emitir, servicio prestado sin facturar, cobro vencido de limpieza |
| **Backend — email** | `controllers/emailController.js` | Envío de email vía Resend o SMTP con plantillas HTML. Funciones: `sendEmail`, `sendInviteEmail`, `sendDocumentSignatureEmail` | No tiene plantilla de envío de factura. No tiene función `sendInvoiceEmail` |
| **Frontend — Billing.tsx** | `src/app/pages/saas/Billing.tsx` | Redirect a `/saas/settings/facturacion` (facturación de la suscripción Udar, NO de clientes) | Es un redirect, no una página de facturación a clientes |
| **Frontend — FinanceView.tsx** | `src/app/pages/saas/FinanceView.tsx` | Página completa de finanzas: overview, dashboard, transacciones, reminders, VAT book. Genera PDF de facturas desde movimientos (`invoicePdfGenerator`) | Genera facturas PDF ad-hoc desde movimientos financieros, pero no desde servicios de limpieza ni con lógica recurrente |
| **Frontend — CleaningServices.tsx** | `src/app/pages/saas/CleaningServices.tsx` | Gestión de servicios de limpieza: crear, editar, asignar, estado (pending/assigned/in_progress/completed/cancelled), precio, tareas checklist | No tiene botón "Facturar servicio". No muestra estado de facturación. No genera factura desde servicio completado |
| **Frontend — InvoiceCreationModal** | `src/app/components/saas/InvoiceCreationModal.tsx` (29KB) | Modal completo para crear facturas manualmente con líneas de detalle | Orientado a concesionario (vehicleName, vehiclePlate). No incluye servicios de limpieza ni recurrencia |
| **Frontend — NewInvoiceModal** | `src/app/components/saas/NewInvoiceModal.tsx` (46KB) | Otro modal de facturación más avanzado | Igual que arriba, orientado a vehículos |
| **Frontend — invoicePdfGenerator** | `src/app/lib/invoicePdfGenerator.ts` | Genera PDF con jsPDF: issuer, recipient, lines[], notes, payMethod, número secuencial | Reutilizable. Ya soporta líneas de detalle, IVA, datos de emisor/receptor |
| **Frontend — invoiceXmlGenerator** | `src/app/lib/invoiceXmlGenerator.ts` | Genera XML (FacturaE) para facturas electrónicas | Reutilizable para cumplimiento legal |
| **Frontend — clientInvoicesApi** | `src/app/lib/clientInvoicesApi.ts` | API client: `ClientInvoiceRecord` con CRUD completo | No tiene campos para servicio vinculado, recurrencia, sentAt, pdfUrl |
| **Frontend — Sidebar** | `src/app/components/saas/Sidebar.tsx` L429 | Grupo `cleaning` con: `cleaning-services`, `cleaning-checklist`, `cleaning-quality`, `cleaning-reviews` | No incluye enlace a facturación de limpieza |
| **Frontend — rutas** | `src/app/routes.tsx` L483-486 | Rutas cleaning: `cleaning-services`, `cleaning-checklist`, `cleaning-quality`, `cleaning-reviews` | No existe ruta `cleaning-billing` ni `facturacion` para limpieza |
| **Frontend — permisos** | `src/app/lib/roleCatalog.ts` | Roles custom con permissions[]. Sidebar filtra por `permissionMap.finance` | Sin permiso granular `cleaning.billing.view` / `cleaning.billing.manage` |

### Lo que FALTA

1. **Modelo de factura ampliado** con líneas de detalle, referencia a servicios, recurrencia, IVA, pdfUrl, sentAt
2. **Modelo de servicio ampliado** con recurrence (semanal/mensual/puntual), contractId, billingStatus, priceHistory
3. **Contratos de limpieza** — modelo nuevo para contratos recurrentes con cliente, servicios, precio, periodicidad, revisiones
4. **Motor de facturación automática** — genera facturas desde servicios completados y/o contratos activos
5. **Envío automático de factura** por email al cliente
6. **Creación automática de ingreso pendiente** en Finanzas al emitir factura
7. **Marcado automático de cobro vencido** cuando pasa la fecha de vencimiento
8. **Alertas específicas**: factura pendiente de emitir, impago, cobro vencido, servicio sin facturar
9. **Página de facturación** completa con tabla, filtros, KPIs, acciones masivas
10. **Permisos por rol**: gerente ve y gestiona todo; trabajador no ve datos económicos salvo permiso
11. **Conexiones**: vincular factura ↔ servicio ↔ cliente ↔ finanzas ↔ documentos ↔ dashboard

---

## TICKETS

---

### TICKET 1 — Backend: Ampliar modelo `client_invoice` para facturación de servicios

**Prioridad:** Alta  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → `services/couchdb.js`

#### Objetivo
Ampliar `buildInvoiceDocument` y `sanitizeInvoice` para soportar líneas de detalle, vinculación con servicios de limpieza, recurrencia, IVA desglosado, y metadatos de envío/PDF.

#### Cambios requeridos

**Archivo: `services/couchdb.js` → función `buildInvoiceDocument`**

Añadir estos campos al documento (mantener retro-compatibilidad con los existentes):

```js
// Nuevos campos en buildInvoiceDocument:
lines: Array.isArray(data.lines) ? data.lines.map((l, i) => ({
  id: l.id || `line-${i}`,
  description: String(l.description || ''),
  serviceId: String(l.serviceId || ''),        // Ref al cleaning_service
  quantity: Number(l.quantity || 1),
  unitPrice: Number(l.unitPrice || 0),
  taxRate: Number(l.taxRate || 21),
  subtotal: Number(l.quantity || 1) * Number(l.unitPrice || 0),
})) : (existing?.lines || []),
serviceIds: Array.isArray(data.serviceIds) ? data.serviceIds : (existing?.serviceIds || []),
contractId: String(data.contractId || existing?.contractId || ''),
recurrence: String(data.recurrence || existing?.recurrence || 'one_time'),   // 'weekly' | 'monthly' | 'one_time'
periodStart: String(data.periodStart || existing?.periodStart || ''),
periodEnd: String(data.periodEnd || existing?.periodEnd || ''),
subtotal: Number(data.subtotal || 0),
taxRate: Number(data.taxRate || 21),
taxAmount: Number(data.taxAmount || 0),
// total ya existe
clientEmail: String(data.clientEmail || existing?.clientEmail || ''),
clientPhone: String(data.clientPhone || existing?.clientPhone || ''),
clientAddress: String(data.clientAddress || existing?.clientAddress || ''),
clientNif: String(data.clientNif || existing?.clientNif || ''),
issuerName: String(data.issuerName || existing?.issuerName || ''),
issuerNif: String(data.issuerNif || existing?.issuerNif || ''),
issuerAddress: String(data.issuerAddress || existing?.issuerAddress || ''),
pdfUrl: String(data.pdfUrl || existing?.pdfUrl || ''),
sentAt: String(data.sentAt || existing?.sentAt || ''),
sentTo: String(data.sentTo || existing?.sentTo || ''),
paidAt: String(data.paidAt || existing?.paidAt || ''),
linkedFinanceId: String(data.linkedFinanceId || existing?.linkedFinanceId || ''),
origin: String(data.origin || existing?.origin || 'manual'),  // 'manual' | 'auto_service' | 'auto_contract'
vertical: String(data.vertical || existing?.vertical || ''),   // 'cleaning' | 'general' | ...
```

**Archivo: `services/couchdb.js` → función `sanitizeInvoice`**

Añadir los mismos campos al sanitizer con valores por defecto.

#### Criterios de aceptación
- [ ] Los documentos existentes siguen funcionando sin migración (todos los nuevos campos tienen defaults)
- [ ] `lines[]` se serializa/deserializa correctamente
- [ ] `serviceIds[]` puede contener 0..N IDs de servicios de limpieza
- [ ] `recurrence` solo acepta `'weekly'`, `'monthly'`, `'one_time'`
- [ ] `origin` solo acepta `'manual'`, `'auto_service'`, `'auto_contract'`

---

### TICKET 2 — Backend: Ampliar modelo `cleaning_service` con recurrencia y estado de facturación

**Prioridad:** Alta  
**Esfuerzo:** Medio (1h)  
**Módulo:** Backend → `services/couchdb.js`

#### Objetivo
Ampliar `buildCleaningServiceDocument` y `sanitizeCleaningService` para soportar servicios recurrentes, contratos asociados, historial de precios y estado de facturación.

#### Cambios requeridos

**Archivo: `services/couchdb.js` → función `buildCleaningServiceDocument`**

Añadir campos (mantener retro-compatibilidad):

```js
// Nuevos campos:
recurrence: String(data.recurrence || existing?.recurrence || 'one_time'),  // 'weekly' | 'monthly' | 'one_time'
recurrenceDays: Array.isArray(data.recurrenceDays) ? data.recurrenceDays : (existing?.recurrenceDays || []),  // [1,3,5] = L,X,V
contractId: String(data.contractId || existing?.contractId || ''),
clientId: String(data.clientId || existing?.clientId || ''),               // Ref al CRM client
billingStatus: String(data.billingStatus || existing?.billingStatus || 'unbilled'),  // 'unbilled' | 'billed' | 'paid'
lastInvoiceDate: String(data.lastInvoiceDate || existing?.lastInvoiceDate || ''),
priceHistory: Array.isArray(data.priceHistory) ? data.priceHistory : (existing?.priceHistory || []),
// priceHistory item: { price: number, effectiveFrom: string, reason: string }
```

**Archivo: `services/couchdb.js` → función `sanitizeCleaningService`**

Añadir los mismos campos con defaults.

#### Criterios de aceptación
- [ ] Servicios existentes siguen funcionando (defaults para todos los campos nuevos)
- [ ] `recurrence` normalizado a valores permitidos
- [ ] `billingStatus` solo acepta `'unbilled'`, `'billed'`, `'paid'`
- [ ] `priceHistory` es array de `{ price, effectiveFrom, reason }`

---

### TICKET 3 — Backend: Nuevo modelo `cleaning_contract` para contratos recurrentes

**Prioridad:** Alta  
**Esfuerzo:** Alto (2h)  
**Módulo:** Backend → `services/couchdb.js` + `controllers/` + `routers/`

#### Objetivo
Crear modelo, controller y router para contratos de limpieza recurrentes. Un contrato define: cliente, servicios incluidos, frecuencia, precio, vigencia, y revisiones de precio.

#### Modelo de datos (nuevo)

**Archivo: `services/couchdb.js`**

Nuevas funciones: `getCleaningContractsDbName`, `buildCleaningContractDocument`, `sanitizeCleaningContract`, `listCleaningContractsByUser`

```js
// cleaning_contract document:
{
  _id: 'cc-{uuid}',
  type: 'cleaning_contract',
  user_id: string,
  contractNumber: string,           // 'CC-XXXXXX'
  clientId: string,                  // Ref al CRM client
  clientName: string,
  clientEmail: string,
  clientPhone: string,
  clientNif: string,
  clientAddress: string,
  services: [{                       // Servicios incluidos
    serviceTemplateId: string,       // Ref opcional a cleaning_service base
    description: string,             // Ej: "Limpieza oficina 3 veces/semana"
    cleaningType: string,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    daysOfWeek: number[],            // [1,3,5] = L,X,V
    unitPrice: number,
    quantity: number,                // Unidades por periodo
  }],
  billingFrequency: 'weekly' | 'monthly',
  billingDay: number,                // Día del mes (1-28) o día de la semana (1-7) para emisión
  startDate: string,
  endDate: string,                   // '' si indefinido
  autoRenew: boolean,
  totalMonthly: number,              // Precio total mensual calculado
  taxRate: number,                   // IVA (normalmente 21%)
  paymentMethod: string,
  notes: string,
  status: 'active' | 'paused' | 'cancelled' | 'expired',
  priceRevisions: [{                 // Historial de revisiones
    date: string,
    previousTotal: number,
    newTotal: number,
    reason: string,
    appliedBy: string,
  }],
  lastInvoiceDate: string,
  nextInvoiceDate: string,
  createdAt: string,
  updatedAt: string,
}
```

#### Controller

**Archivo nuevo: `controllers/cleaningContractController.js`**

Funciones: `listCleaningContracts`, `createCleaningContract`, `updateCleaningContract`, `removeCleaningContract`

Misma estructura que `cleaningController.js` con validaciones:
- `clientId` obligatorio
- `services[]` debe tener al menos 1 servicio
- `billingFrequency` obligatorio
- `status` normalizado

#### Router

**Archivo nuevo: `routers/cleaningContractRouter.js`**

```
GET    /api/cleaning/contracts/:userId
POST   /api/cleaning/contracts/:userId
PUT    /api/cleaning/contracts/:userId/:contractId
DELETE /api/cleaning/contracts/:userId/:contractId
```

**Archivo: `index.js`**

Registrar el nuevo router.

#### Criterios de aceptación
- [ ] CRUD completo funcional
- [ ] Activity log al crear/editar/eliminar contrato
- [ ] `contractNumber` generado automáticamente
- [ ] `totalMonthly` calculado automáticamente desde `services[].unitPrice * services[].quantity`
- [ ] `nextInvoiceDate` calculado al crear/editar según `billingFrequency` y `billingDay`
- [ ] Soft delete (no borrado físico)

---

### TICKET 4 — Backend: Motor de facturación automática

**Prioridad:** Alta  
**Esfuerzo:** Alto (3h)  
**Módulo:** Backend → nuevo `services/cleaningBillingEngine.js`

#### Objetivo
Crear un motor que genere facturas automáticamente desde dos fuentes:
1. **Servicios completados** sin facturar (`billingStatus: 'unbilled'` + `status: 'completed'`)
2. **Contratos activos** cuya `nextInvoiceDate` ha llegado

#### Lógica

**Archivo nuevo: `services/cleaningBillingEngine.js`**

```
generateInvoicesFromCompletedServices(userId)
  → Busca servicios con status='completed' + billingStatus='unbilled'
  → Agrupa por clientId
  → Para cada cliente:
    → Crea factura con lines[] = servicios del cliente
    → Calcula subtotal, IVA, total
    → Genera número secuencial
    → Marca servicios como billingStatus='billed' + invoiceId
    → Crea factura con status='pending' y origin='auto_service'
  → Retorna facturas creadas

generateInvoicesFromContracts(userId)
  → Busca contratos con status='active' + nextInvoiceDate <= hoy
  → Para cada contrato:
    → Crea factura con lines[] = services del contrato
    → periodStart/periodEnd según billingFrequency
    → Calcula subtotal, IVA, total
    → Genera número secuencial
    → Actualiza contrato.lastInvoiceDate y contrato.nextInvoiceDate
    → Crea factura con status='pending' y origin='auto_contract'
  → Retorna facturas creadas

generatePendingFinanceEntry(userId, invoice)
  → Crea movimiento en Finanzas con type='cobro', status pendiente
  → Referencia: invoiceId
  → Concepto: "Factura {number} — {clientName}"
  → Categoría: "Servicio limpieza"

markOverdueInvoices(userId)
  → Busca facturas con status='pending' + dueDate < hoy
  → Cambia status a 'overdue'
  → Retorna facturas actualizadas

runCleaningBillingCycle(userId)
  → Ejecuta las 4 funciones en secuencia
  → Retorna resumen: { invoicesFromServices, invoicesFromContracts, financeEntries, overdueMarked }
```

#### Endpoints

**Archivo: `controllers/cleaningController.js`** (ampliar) o **nuevo `controllers/cleaningBillingController.js`**

```
POST /api/cleaning/billing/:userId/generate         → runCleaningBillingCycle
POST /api/cleaning/billing/:userId/generate-services → generateInvoicesFromCompletedServices
POST /api/cleaning/billing/:userId/generate-contracts → generateInvoicesFromContracts
POST /api/cleaning/billing/:userId/mark-overdue      → markOverdueInvoices
```

#### Criterios de aceptación
- [ ] Genera facturas correctas desde servicios completados sin facturar
- [ ] Genera facturas correctas desde contratos activos con nextInvoiceDate vencida
- [ ] No genera duplicados (idempotencia: si ya se facturó, no repite)
- [ ] Calcula IVA correctamente (21% por defecto, configurable por contrato)
- [ ] Crea ingreso pendiente en Finanzas por cada factura
- [ ] Marca facturas vencidas como `overdue`
- [ ] Activity log para cada factura generada
- [ ] Número de factura secuencial consistente (FAC-YYYY-NNNN)

---

### TICKET 5 — Backend: Envío automático de factura por email

**Prioridad:** Media  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → `controllers/emailController.js` + `services/cleaningBillingEngine.js`

#### Objetivo
Añadir función para enviar factura por email al cliente con PDF adjunto (generado con `invoicePdfGenerator`) tras la emisión.

#### Cambios requeridos

**Archivo: `controllers/emailController.js`**

Nueva función `sendInvoiceEmail`:

```
export async function sendInvoiceEmail(req, res) {
  // Recibe: userId, invoiceId
  // 1. Obtiene la factura
  // 2. Obtiene datos del emisor (account settings)
  // 3. Genera HTML del email con plantilla
  // 4. Genera PDF en base64 (reutilizando invoicePdfGenerator en servidor o recibiendo pdfBase64)
  // 5. Envía email con adjunto PDF
  // 6. Actualiza factura: sentAt = now, sentTo = clientEmail
  // Responde: { ok: true, sentTo }
}
```

**Archivo: `routers/emailRouter.js`**

```
POST /api/email/send-invoice
```

**Plantilla HTML del email:**

```html
Asunto: Factura {number} — {issuerName}
Cuerpo:
  - Saludo al cliente
  - "Adjuntamos la factura {number} correspondiente al periodo {periodStart} - {periodEnd}"
  - Resumen: total, fecha vencimiento, método de pago
  - "Para cualquier consulta, contacte con nosotros en {issuerEmail}"
  - PDF adjunto
```

#### Integración con billing engine

En `cleaningBillingEngine.js`, después de generar cada factura:
- Si el contrato/configuración tiene `autoSendInvoice: true` → llamar a `sendInvoiceEmail` automáticamente

#### Criterios de aceptación
- [ ] Email enviado con PDF adjunto legible
- [ ] Factura actualizada con `sentAt` y `sentTo`
- [ ] Plantilla profesional y responsive
- [ ] Funciona tanto con Resend como con SMTP (reutilizar `sendEmail` existente)
- [ ] No envía si el cliente no tiene email (retorna warning)

---

### TICKET 6 — Backend: Alertas específicas de facturación limpieza

**Prioridad:** Media  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → `services/alertEngine.js`

#### Objetivo
Añadir 4 tipos de alerta nuevos para facturación de limpieza.

#### Alertas a implementar

| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| `cleaning_invoice_pending_emit` | Contrato activo cuyo `nextInvoiceDate` ya pasó y no se ha generado factura | `warning` |
| `cleaning_unpaid_invoice` | Factura con `status: 'pending'` cuyo `dueDate` pasó hace > 7 días | `error` |
| `cleaning_overdue_payment` | Factura con `status: 'overdue'` | `error` |
| `cleaning_service_unbilled` | Servicio con `status: 'completed'` + `billingStatus: 'unbilled'` hace > 3 días | `warning` |

**Archivo: `services/alertEngine.js`**

Añadir funciones:
```
checkCleaningPendingInvoices(userId)
checkCleaningUnpaidInvoices(userId)
checkCleaningOverduePayments(userId)
checkCleaningUnbilledServices(userId)
```

Integrar en `getAlertSummary` y `runAlertEngine`.

**Archivo: `controllers/alertController.js`**

Añadir claves de configuración:
```
'cleaningPendingInvoiceEnabled'
'cleaningUnpaidInvoiceEnabled'
'cleaningOverduePaymentEnabled'
'cleaningUnbilledServiceEnabled'
```

#### Criterios de aceptación
- [ ] Las 4 alertas aparecen en el panel de alertas existente
- [ ] Configurables (activar/desactivar) desde settings de alertas
- [ ] Incluyen datos: nombre cliente, número factura, importe, días vencido
- [ ] No generan falsos positivos con facturas ya pagadas o servicios ya facturados

---

### TICKET 7 — Frontend: API client para facturación y contratos de limpieza

**Prioridad:** Alta  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Frontend → `src/app/lib/`

#### Objetivo
Crear los módulos API client para consumir los endpoints de facturación y contratos de limpieza.

#### Archivos nuevos

**Archivo: `src/app/lib/cleaningBillingApi.ts`**

```typescript
// Types
export type BillingRecurrence = 'weekly' | 'monthly' | 'one_time';
export type InvoiceOrigin = 'manual' | 'auto_service' | 'auto_contract';
export type CleaningBillingStatus = 'unbilled' | 'billed' | 'paid';

export interface CleaningInvoiceLine {
  id: string;
  description: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
}

export interface CleaningInvoice extends ClientInvoiceRecord {
  lines: CleaningInvoiceLine[];
  serviceIds: string[];
  contractId: string;
  recurrence: BillingRecurrence;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientNif: string;
  issuerName: string;
  issuerNif: string;
  issuerAddress: string;
  pdfUrl: string;
  sentAt: string;
  sentTo: string;
  paidAt: string;
  linkedFinanceId: string;
  origin: InvoiceOrigin;
  vertical: string;
}

// Functions
listCleaningInvoices(userId): Promise<CleaningInvoice[]>
createCleaningInvoice(userId, data): Promise<CleaningInvoice>
updateCleaningInvoice(userId, invoice): Promise<CleaningInvoice>
deleteCleaningInvoice(userId, invoiceId): Promise<void>
generateBillingCycle(userId): Promise<BillingCycleResult>
generateFromServices(userId): Promise<CleaningInvoice[]>
generateFromContracts(userId): Promise<CleaningInvoice[]>
markOverdueInvoices(userId): Promise<CleaningInvoice[]>
sendInvoiceEmail(userId, invoiceId): Promise<{ sentTo: string }>
```

**Archivo: `src/app/lib/cleaningContractsApi.ts`**

```typescript
export type ContractStatus = 'active' | 'paused' | 'cancelled' | 'expired';
export type ContractBillingFrequency = 'weekly' | 'monthly';

export interface ContractService {
  serviceTemplateId: string;
  description: string;
  cleaningType: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[];
  unitPrice: number;
  quantity: number;
}

export interface PriceRevision {
  date: string;
  previousTotal: number;
  newTotal: number;
  reason: string;
  appliedBy: string;
}

export interface CleaningContract {
  _id: string;
  _rev?: string;
  type: 'cleaning_contract';
  id: string;
  user_id: string;
  contractNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientNif: string;
  clientAddress: string;
  services: ContractService[];
  billingFrequency: ContractBillingFrequency;
  billingDay: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  totalMonthly: number;
  taxRate: number;
  paymentMethod: string;
  notes: string;
  status: ContractStatus;
  priceRevisions: PriceRevision[];
  lastInvoiceDate: string;
  nextInvoiceDate: string;
  createdAt: string;
  updatedAt: string;
}

// Functions
listCleaningContracts(userId): Promise<CleaningContract[]>
createCleaningContract(userId, data): Promise<CleaningContract>
updateCleaningContract(userId, contract): Promise<CleaningContract>
deleteCleaningContract(userId, contractId): Promise<void>
```

#### Criterios de aceptación
- [ ] Tipos TypeScript estrictos para todos los modelos
- [ ] Manejo de errores consistente con el resto de la app
- [ ] Normalización de userId (strip `account:` prefix)
- [ ] Headers CouchDB incluidos automáticamente

---

### TICKET 8 — Frontend: Página de facturación automática `/saas/cleaning-billing`

**Prioridad:** Alta  
**Esfuerzo:** Alto (4h)  
**Módulo:** Frontend → `src/app/pages/saas/CleaningBilling.tsx`

#### Objetivo
Crear la página principal de facturación automática para la vertical de limpieza. Diseño moderno, atractivo, con toda la funcionalidad de gestión.

#### Estructura de la página

**Layout:** Usa `<Layout>` existente (como todas las páginas saas).

**Cabecera:**
- Título: "Facturación" con icono Receipt
- Subtítulo: "Gestiona facturas automáticas y manuales de tus servicios de limpieza"
- Botones: "Nueva factura" (manual), "Generar facturas" (automático), "Exportar"

**KPI Cards (4 tarjetas en fila):**
1. **Total facturado** — suma de todas las facturas del periodo — icono TrendingUp — color verde
2. **Pendiente de cobro** — suma de facturas pending + overdue — icono Clock — color amber
3. **Facturas emitidas** — count total del periodo — icono FileText — color blue
4. **Vencidas** — count de facturas overdue — icono AlertTriangle — color red

**Panel de alertas (colapsable):**
- Si hay alertas activas (de TICKET 6), mostrar banner con:
  - Facturas pendientes de emitir (contratos)
  - Servicios sin facturar
  - Cobros vencidos
  - Impagos
- Cada alerta con acción directa (ej: "Generar factura", "Enviar recordatorio")

**Tabs de filtrado:**
- Todas | Borradores | Pendientes | Pagadas | Vencidas
- Cada tab con counter badge

**Barra de filtros:**
- Búsqueda por texto (nombre cliente, nº factura)
- Filtro por cliente (dropdown)
- Filtro por periodo (mes/semana selector)
- Filtro por origen (manual / automático servicio / automático contrato)
- Filtro por rango de fechas
- Ordenar por: fecha, importe, vencimiento, cliente

**Tabla de facturas:**

| Columna | Contenido |
|---------|-----------|
| Nº Factura | `FAC-2026-0001` con badge de origen (manual/auto) |
| Cliente | Nombre + avatar iniciales |
| Servicios | Badges con tipo de limpieza |
| Periodo | "01/04 — 30/04" |
| Importe | Total con desglose IVA en tooltip |
| F. Emisión | Fecha emisión |
| Vencimiento | Fecha vencimiento + badge si vencida |
| Estado | Badge: Borrador (gris), Pendiente (amber), Pagada (verde), Vencida (rojo) |
| Acciones | Ver PDF, Enviar email, Marcar pagada, Editar, Eliminar |

**Acciones por fila:**
- **Ver/Descargar PDF** — genera con `invoicePdfGenerator` y descarga
- **Enviar por email** — llama endpoint sendInvoiceEmail, muestra toast confirmación
- **Marcar como pagada** — actualiza status + crea/actualiza movimiento en finanzas + input fecha cobro
- **Editar** — abre modal de edición
- **Eliminar** — confirmación + soft delete
- **Ver detalle** — expande fila con líneas de detalle, historial de envíos, movimiento de finanzas vinculado

**Acciones masivas (selección múltiple):**
- Enviar todas por email
- Marcar todas como pagadas
- Exportar selección a CSV/Excel
- Generar PDFs en ZIP

**Modal "Nueva factura manual":**
- Selector de cliente (del CRM)
- Líneas de detalle: descripción, cantidad, precio unitario, IVA
- Botón "Importar servicios sin facturar" → carga servicios completados sin facturar del cliente
- Fecha emisión, fecha vencimiento
- Método de pago
- Notas
- Preview del PDF antes de guardar
- Opciones: "Guardar borrador" / "Emitir y enviar"

**Modal "Generar facturas automáticas":**
- Resumen de lo que se va a generar:
  - X servicios completados sin facturar (lista con detalles)
  - X contratos activos con factura pendiente (lista con detalles)
- Toggle: "Enviar automáticamente por email al generar"
- Toggle: "Crear ingreso pendiente en Finanzas"
- Botón "Generar X facturas"
- Progress bar durante generación
- Resumen de resultado con links a facturas creadas

#### Diseño visual

- Seguir design tokens existentes en `DesignTokens.ts`
- Fondo: `bg-gray-50` con cards `bg-white rounded-2xl shadow-sm border`
- KPI cards: gradiente sutil, icono circular con fondo de color
- Tabla: hover states, zebra striping sutil
- Badges de estado: colores consistentes con el resto de la app
- Animaciones con `motion` (ya instalado): fade-in cards, slide-in modales
- Responsive: stack KPIs en 2x2 en tablet, 1 columna en móvil
- Empty state ilustrado cuando no hay facturas

#### Criterios de aceptación
- [ ] Carga listado de facturas filtradas por vertical 'cleaning'
- [ ] KPIs calculados correctamente
- [ ] Filtros y búsqueda funcionales
- [ ] Modal de creación manual genera factura válida
- [ ] Modal de generación automática ejecuta billing cycle
- [ ] PDF se genera y descarga correctamente
- [ ] Envío de email funcional con feedback visual
- [ ] Acciones masivas funcionales
- [ ] Panel de alertas muestra alertas activas
- [ ] Responsive en móvil y tablet
- [ ] Empty state atractivo

---

### TICKET 9 — Frontend: Pestaña "Contratos" en facturación o página separada

**Prioridad:** Alta  
**Esfuerzo:** Alto (3h)  
**Módulo:** Frontend → `src/app/pages/saas/CleaningBilling.tsx` (tab) o `CleaningContracts.tsx` (página)

#### Objetivo
Interfaz para gestionar contratos de limpieza recurrentes. Se recomienda implementar como una tab "Contratos" dentro de la página de facturación.

#### Estructura

**Tab "Contratos" en la página de facturación:**

**KPI Cards (3):**
1. **Contratos activos** — count status='active' — color verde
2. **Facturación mensual** — suma totalMonthly de contratos activos — color blue
3. **Próximas renovaciones** — contratos con endDate en próximos 30 días — color amber

**Tabla de contratos:**

| Columna | Contenido |
|---------|-----------|
| Nº Contrato | `CC-XXXXXX` |
| Cliente | Nombre + teléfono |
| Servicios | Count + descripción resumida |
| Frecuencia facturación | Semanal / Mensual |
| Total mensual | Importe con IVA |
| Próxima factura | Fecha + badge "hoy" si es hoy |
| Estado | Active (verde), Paused (amber), Cancelled (gris), Expired (rojo) |
| Acciones | Editar, Pausar/Reactivar, Revisión precio, Ver historial, Cancelar |

**Modal "Nuevo contrato":**
- Selector de cliente (del CRM, con autocompletado)
- Sección "Servicios incluidos":
  - Añadir servicio: tipo limpieza, descripción, frecuencia (semanal/quincenal/mensual), días semana, precio unitario, cantidad
  - Tabla editable con servicios añadidos
  - Total mensual calculado en tiempo real
- Frecuencia de facturación: semanal / mensual
- Día de facturación (si mensual: día 1-28; si semanal: lunes-domingo)
- Fecha inicio, fecha fin (opcional, checkbox "Indefinido")
- Auto-renovación (toggle)
- IVA (selector: 0%, 4%, 10%, 21%)
- Método de pago preferido
- Notas

**Modal "Revisión de precio":**
- Precio actual
- Nuevo precio
- Motivo de la revisión
- Fecha de aplicación
- Preview del cambio

**Historial del contrato (drawer lateral):**
- Timeline con: creación, revisiones de precio, facturas emitidas, pausas/reactivaciones
- Cada evento con fecha, acción, usuario que ejecutó

#### Criterios de aceptación
- [ ] CRUD completo de contratos
- [ ] Cálculo automático de totalMonthly
- [ ] Cálculo automático de nextInvoiceDate
- [ ] Revisión de precio con historial
- [ ] Historial visual tipo timeline
- [ ] Validación: al menos 1 servicio, cliente obligatorio
- [ ] Se puede pausar/reactivar sin perder datos

---

### TICKET 10 — Frontend: Integrar facturación en CleaningServices.tsx

**Prioridad:** Media  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Frontend → `src/app/pages/saas/CleaningServices.tsx`

#### Objetivo
Mostrar estado de facturación en la lista de servicios y añadir acciones de facturación directa.

#### Cambios requeridos

**En la tabla de servicios — nueva columna "Facturación":**

| billingStatus | Badge | Acción |
|---------------|-------|--------|
| `unbilled` | "Sin facturar" (gris) | Botón "Facturar" |
| `billed` | "Facturada" (amber) con nº factura | Link a la factura |
| `paid` | "Cobrada" (verde) con nº factura | Link a la factura |

**En el formulario de edición de servicio:**
- Nuevo campo `recurrence` (dropdown: Puntual / Semanal / Mensual)
- Nuevo campo `recurrenceDays[]` (multi-select de días, visible si recurrence != 'one_time')
- Nuevo campo `contractId` (selector de contrato existente, opcional)
- Nuevo campo `clientId` (selector de cliente CRM, autocompletado desde clientName)

**Nuevo botón en la cabecera:**
- "Facturar servicios completados" → abre modal de generación rápida (solo desde servicios, sin contratos)

**Indicador visual en tarjeta de servicio (vista cards):**
- Si completado + sin facturar: badge naranja parpadeante "Pendiente facturar"
- Si completado + facturado: badge verde "Facturada — FAC-2026-XXXX"

#### Criterios de aceptación
- [ ] Columna de facturación visible en tabla
- [ ] Badges correctos según billingStatus
- [ ] Botón "Facturar" genera factura individual
- [ ] Link a factura abre detalle
- [ ] Campos de recurrencia funcionales en formulario
- [ ] Botón masivo "Facturar servicios completados" funcional

---

### TICKET 11 — Frontend: Navegación, rutas y permisos

**Prioridad:** Alta  
**Esfuerzo:** Medio (1h)  
**Módulo:** Frontend → `routes.tsx`, `Sidebar.tsx`, `roleCatalog.ts`

#### Objetivo
Integrar la facturación de limpieza en la navegación, rutas y sistema de permisos.

#### Cambios requeridos

**Archivo: `src/app/routes.tsx`**

Añadir rutas:
```
{ path: 'cleaning-billing', Component: CleaningBilling }
```

Con import lazy:
```tsx
const CleaningBilling = lazy(() => import('./pages/saas/CleaningBilling').then(m => ({ default: m.CleaningBilling })));
```

**Archivo: `src/app/components/saas/Sidebar.tsx`**

1. En `sidebarItemDefs`, añadir:
```js
{ id: 'cleaning-billing', navKey: 'cleaningBilling', icon: <Receipt className="w-5 h-5" />, path: '/saas/cleaning-billing' },
```

2. En `sidebarGroupDefs`, añadir `'cleaning-billing'` al grupo `cleaning`:
```js
{ id: 'cleaning', icon: ..., itemIds: ['cleaning-services', 'cleaning-billing', 'cleaning-checklist', 'cleaning-quality', 'cleaning-reviews'] },
```

3. En la lógica de active state, añadir:
```js
(item.id === 'cleaning-billing' && location.pathname.startsWith('/saas/cleaning-billing'))
```

**Archivo: `src/app/lib/roleCatalog.ts`**

No se necesita cambio estructural; los permisos se gestionan por `permissionMap.finance`. La restricción de trabajador se implementa en la página:

**En `CleaningBilling.tsx`:**
```tsx
// Si el usuario es trabajador sin permiso 'finance', redirigir o mostrar acceso denegado
const { user } = useAuth();
const hasFinanceAccess = user?.role === 'admin' || user?.role === 'gerente' || user?.permissions?.includes('finance');
if (!hasFinanceAccess) return <AccessDenied />;
```

#### Criterios de aceptación
- [ ] Ruta `/saas/cleaning-billing` funcional
- [ ] Aparece en sidebar dentro del grupo "Limpieza" (solo vertical cleaning)
- [ ] Icono Receipt coherente
- [ ] Active state correcto en sidebar
- [ ] Gerente/admin accede sin restricción
- [ ] Trabajador sin permiso `finance` ve página denegada
- [ ] Trabajador con permiso `finance` puede acceder

---

### TICKET 12 — Frontend: Widget de facturación en Dashboard

**Prioridad:** Baja  
**Esfuerzo:** Bajo (1h)  
**Módulo:** Frontend → `src/app/pages/saas/Dashboard.tsx`

#### Objetivo
Añadir widget de resumen de facturación de limpieza en el dashboard principal (solo si la vertical es `cleaning`).

#### Widget a añadir

**Card "Facturación Limpieza"** (dentro del dashboard, zona de KPIs o como sección):

Contenido:
- Facturado este mes: X€
- Pendiente de cobro: X€
- Servicios sin facturar: N
- Próxima factura contrato: fecha
- Mini gráfico sparkline de facturación últimos 6 meses

**Acciones rápidas:**
- "Generar facturas pendientes" → link a cleaning-billing con modal auto-open
- "Ver facturas" → link a cleaning-billing

#### Criterios de aceptación
- [ ] Solo visible en vertical `cleaning`
- [ ] Datos reales desde API
- [ ] Link funcional a facturación
- [ ] Sparkline con datos reales

---

### TICKET 13 — Backend: Vincular factura con Finanzas automáticamente

**Prioridad:** Media  
**Esfuerzo:** Medio (1h)  
**Módulo:** Backend → `services/cleaningBillingEngine.js`

#### Objetivo
Al emitir una factura (manual o automática), crear automáticamente un movimiento de tipo `cobro` en Finanzas con estado pendiente. Al marcar la factura como pagada, actualizar el movimiento.

#### Lógica

**Al crear factura (status = 'pending'):**
```
→ Crear movimiento en Finance DB:
  type: 'cobro'
  concept: "Factura {number} — {clientName}"
  category: "Servicio limpieza"
  categoryIcon: "🧹"
  categoryColor: "#10b981"
  amountBase: invoice.subtotal
  taxRate: invoice.taxRate
  taxAmount: invoice.taxAmount
  totalAmount: invoice.total
  date: invoice.date
  payMethod: invoice.paymentMethod || ''
  notes: "Generada automáticamente desde factura {number}"
→ Guardar linkedFinanceId en la factura
```

**Al marcar factura como pagada:**
```
→ Si tiene linkedFinanceId:
  → Actualizar movimiento: date = paidAt, payMethod = método real
→ Si NO tiene linkedFinanceId:
  → Crear movimiento nuevo como arriba
```

#### Criterios de aceptación
- [ ] Cada factura emitida tiene su movimiento en Finanzas
- [ ] El movimiento se actualiza al cobrar
- [ ] `linkedFinanceId` bidireccional (factura → finanza, finanza tiene ref a factura)
- [ ] No duplica movimientos

---

### TICKET 14 — Frontend: Integrar facturación en detalle de cliente (CRM)

**Prioridad:** Baja  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Frontend → `src/app/pages/saas/ClientDetail.tsx` o `ClientsPage.tsx`

#### Objetivo
En la ficha de detalle de un cliente, mostrar pestaña/sección con sus facturas de limpieza, contratos activos, y estado de cuenta.

#### Contenido

**Sección/Pestaña "Facturación limpieza" en detalle del cliente:**

1. **Resumen de cuenta:**
   - Total facturado histórico
   - Pendiente de cobro
   - Última factura: fecha + importe
   - Contrato activo: Sí/No + detalle

2. **Lista de facturas del cliente:**
   - Tabla resumida con: número, fecha, importe, estado
   - Acciones: ver PDF, enviar, marcar pagada

3. **Contratos del cliente:**
   - Tabla resumida con: número, servicios, frecuencia, total mensual, estado

4. **Acciones rápidas:**
   - "Nueva factura para este cliente"
   - "Nuevo contrato para este cliente"

#### Criterios de aceptación
- [ ] Se muestra solo para clientes con servicios/facturas de limpieza
- [ ] Datos reales desde API
- [ ] Acciones funcionales
- [ ] Respeta permisos (gerente vs trabajador)

---

## Orden de implementación recomendado

```
Fase 1 — Cimientos (TICKETS 1, 2, 3, 7)
  Modelos backend + API clients frontend
  ↓
Fase 2 — Motor (TICKETS 4, 5, 6, 13)
  Billing engine + email + alertas + finanzas
  ↓
Fase 3 — UI Principal (TICKETS 8, 9, 11)
  Página facturación + contratos + navegación
  ↓
Fase 4 — Integraciones (TICKETS 10, 12, 14)
  Cleaning services + dashboard + CRM
```

---

## Conexiones entre módulos

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Servicios   │────▶│   FACTURACIÓN    │────▶│   Finanzas   │
│  Limpieza    │     │   AUTOMÁTICA     │     │  (Ingresos)  │
└──────────────┘     └──────────────────┘     └──────────────┘
       │                    │    │                     │
       ▼                    ▼    ▼                     ▼
┌──────────────┐     ┌──────┐ ┌──────┐        ┌──────────────┐
│  Contratos   │────▶│ PDF  │ │Email │        │  Dashboard   │
│  Limpieza    │     └──────┘ └──────┘        │   (Widget)   │
└──────────────┘            │                  └──────────────┘
       │                    ▼
       ▼             ┌──────────────┐
┌──────────────┐     │   CRM        │
│   Alertas    │     │  (Clientes)  │
└──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │Documentación │
                     └──────────────┘
```

---

## Notas técnicas

- **PDF:** Reutilizar `invoicePdfGenerator.ts` existente que ya soporta líneas de detalle, IVA, issuer/recipient
- **Email:** Reutilizar infraestructura de `emailController.js` (Resend + SMTP)
- **Base de datos:** CouchDB sin migraciones, los campos nuevos se añaden con defaults → retro-compatible
- **IVA:** 21% por defecto, configurable por contrato (0%, 4%, 10%, 21%)
- **Numeración:** Reutilizar `buildInvoiceNumber` existente con secuencia por usuario
- **Exportación:** Ya existe `exportAccountingToExcel` en finanzas, reutilizar patrón para CSV/Excel
- **XML FacturaE:** Ya existe `invoiceXmlGenerator.ts` para factura electrónica, integrar opcionalmente
