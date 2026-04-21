# FIRMA DIGITAL — Plan de Tickets

**Tipo:** Modal / Acción
**Desde:** Documentación, CRM, Verticales
**Objetivo:** Permitir firma digital de documentos con trazabilidad completa, múltiples firmantes y conexión a proveedores de eSignature.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo de documento CouchDB (`type: 'document'`) | Completo | `services/couchdb.js` — `buildDocumentRecord` (líneas 2419–2453) |
| Estados de documento: `draft`, `pending_signature`, `signed`, `rejected`, `expired` | Completo | `services/couchdb.js` — `normalizeDocumentStatus` (líneas 2414–2417) |
| Campos de firma básicos: `signedAt`, `signedByClientAt`, `expiresAt` | Completo | `services/couchdb.js` — `buildDocumentRecord` (líneas 2441–2445) |
| Campos de archivo: `fileUrl`, `fileSize`, `mimeType` | Completo | `services/couchdb.js` — `buildDocumentRecord` (líneas 2448–2450) |
| CRUD de documentos (backend) | Completo | `controllers/documentsController.js`, `routers/documentsRouter.js` |
| CRUD de documentos (frontend API) | Completo | `src/app/lib/documentsApi.ts` |
| Versionado de documento (`version`, `previousVersionId`) | Completo | `services/couchdb.js` — `buildDocumentRecord` (líneas 2439–2440) |
| Activity logging en operaciones de documento | Completo | `controllers/documentsController.js` — `logAccountActivity` |
| Catálogo de tokens eSignature (DocuSign, HelloSign, Yousign, Signaturit) | Completo (solo UI de config) | `src/plugin/components/TokensTab.tsx` (líneas 957–961) |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Sistema de notificaciones (in-app + SSE + Web Push) | Completo | `services/couchdb.js` — `buildNotificationDocument` / `saveNotification` |
| Documentos inline en ficha de cliente | Completo | `src/app/pages/saas/ClientDetail.tsx` — pestaña "Documentos" |
| Texto UX sobre firma de consentimientos RGPD | Completo (copy, no funcional) | `src/app/pages/saas/ClientsPage.tsx` (línea 224, 470) |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Entidad `signature_request` (solicitud de firma) | No existe |
| Modelo de firmantes (`signers[]`) con estado individual | No existe |
| Flujo de envío de documento a firma | No existe |
| Integración real con proveedor de eSignature (DocuSign, Signaturit, etc.) | No existe (solo tokens/config) |
| Webhook/callback para recibir eventos del proveedor | No existe |
| Archivo final firmado (PDF con certificado) almacenado | No existe |
| Histórico de eventos por solicitud de firma | No existe |
| Alertas: documento pendiente, firma rechazada, firma caducada | No existe |
| Vinculación de firma a cliente, proveedor o trabajador | No existe (solo `clientId` en documento) |
| Modal/página de gestión de firma digital | No existe |
| Vista de estado de firma desde CRM, Equipo y Verticales | No existe |

---

## Tickets

---

### FD-01 — Modelo de datos: Solicitud de firma (`signature_request`)

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto

El modelo de documento actual (`type: 'document'`) tiene campos básicos de firma (`signedAt`, `signedByClientAt`, `status`), pero no soporta múltiples firmantes, ni flujo de envío, ni trazabilidad del proceso. Necesitamos una entidad separada `signature_request` que represente una solicitud de firma sobre un documento, con su propio ciclo de vida, firmantes y eventos.

El documento original (`type: 'document'`) permanece como está. La `signature_request` es un registro vinculado que orquesta el proceso de firma.

#### Qué hacer

**1. Definir tipo de documento CouchDB en la DB `*-documents`**

```typescript
export type SignatureRequestStatus =
  | 'draft'              // Borrador — aún no enviado
  | 'pending'            // Enviado a firmantes, esperando firmas
  | 'partially_signed'   // Al menos un firmante ha firmado, quedan más
  | 'completed'          // Todos los firmantes han firmado
  | 'rejected'           // Al menos un firmante rechazó
  | 'expired'            // Expiró sin completar todas las firmas
  | 'cancelled';         // Cancelada por el remitente

export type SignerRole =
  | 'signer'             // Firma obligatoria
  | 'reviewer'           // Solo revisa (no firma, pero aprueba)
  | 'cc';                // Copia — recibe el documento final pero no firma

export type SignerStatus =
  | 'pending'            // No ha actuado
  | 'viewed'             // Abrió el documento
  | 'signed'             // Firmó
  | 'rejected'           // Rechazó firmar
  | 'expired';           // Se le venció el plazo

export type EntityType =
  | 'client'             // Cliente del CRM
  | 'supplier'           // Proveedor
  | 'team_member'        // Miembro del equipo
  | 'external';          // Persona externa (solo email)

export interface Signer {
  id: string;                  // signer:{uuid}
  name: string;
  email: string;
  phone?: string;
  role: SignerRole;
  status: SignerStatus;
  order: number;               // Orden de firma (1, 2, 3...) — 0 = todos en paralelo
  entityType: EntityType;
  entityId: string;            // ID del cliente/proveedor/miembro vinculado
  signedAt?: string;           // ISO — cuándo firmó
  rejectedAt?: string;         // ISO — cuándo rechazó
  viewedAt?: string;           // ISO — cuándo abrió el documento
  rejectionReason?: string;    // Motivo de rechazo (texto libre)
  ipAddress?: string;          // IP desde la que firmó (auditoría)
  userAgent?: string;          // Navegador/dispositivo (auditoría)
  signatureImageUrl?: string;  // URL de la imagen de firma capturada
}

export interface SignatureEvent {
  id: string;                  // event:{uuid}
  timestamp: string;           // ISO
  action: string;              // 'created' | 'sent' | 'viewed' | 'signed' | 'rejected' | 'expired' | 'cancelled' | 'reminder_sent' | 'completed' | 'downloaded'
  actorName: string;           // Quién realizó la acción
  actorEmail?: string;
  signerId?: string;           // Si aplica, qué firmante
  details?: string;            // Texto descriptivo libre
  metadata?: Record<string, unknown>;
}

export interface SignatureRequest {
  _id: string;                       // sigreq:{user_id}:{uuid}
  _rev?: string;
  type: 'signature_request';
  user_id: string;                   // Propietario de la cuenta
  documentId: string;                // Referencia al documento original (type: 'document')
  documentName: string;              // Nombre del documento (desnormalizado para queries)

  status: SignatureRequestStatus;
  signers: Signer[];
  signingOrder: 'parallel' | 'sequential';  // parallel = todos a la vez, sequential = en orden

  // Configuración
  message?: string;                  // Mensaje personalizado para los firmantes
  expiresAt: string;                 // ISO — fecha límite para firmar
  reminderEnabled: boolean;          // Enviar recordatorios automáticos
  reminderIntervalDays: number;      // Cada cuántos días (default: 3)
  lastReminderAt?: string;           // ISO — cuándo se envió el último recordatorio

  // Archivo
  sourceFileUrl: string;             // URL del archivo original enviado a firma
  sourceFileName: string;
  sourceMimeType: string;
  sourceFileSize: number;
  signedFileUrl?: string;            // URL del archivo final firmado
  signedFileName?: string;
  signedMimeType?: string;
  signedFileSize?: number;

  // Vinculación a entidad (a quién pertenece el documento)
  linkedEntityType?: EntityType;     // client | supplier | team_member
  linkedEntityId?: string;           // ID de la entidad vinculada
  linkedEntityName?: string;         // Nombre desnormalizado

  // Proveedor de firma
  provider?: string;                 // 'internal' | 'docusign' | 'signaturit' | 'yousign' | 'hellosign'
  providerRequestId?: string;        // ID de la solicitud en el proveedor externo
  providerData?: Record<string, unknown>;  // Datos adicionales del proveedor

  // Histórico
  events: SignatureEvent[];

  // Metadatos
  tags: string[];
  notes?: string;
  createdBy: string;                 // user_id del creador
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;              // ISO — cuándo se completó (todos firmaron)
  cancelledAt?: string;              // ISO — cuándo se canceló
}
```

**2. Añadir funciones en `services/couchdb.js`**

| Función | Descripción |
|---|---|
| `buildSignatureRequest(userId, data, existing?)` | Construye documento normalizado con defaults |
| `sanitizeSignatureRequest(doc)` | Limpia y devuelve campos seguros para el cliente |
| `normalizeSignatureStatus(value)` | Valida contra la lista de estados permitidos |
| `normalizeSignerStatus(value)` | Valida estado de firmante individual |
| `listSignatureRequestsByUser(req, userId)` | Listar solicitudes de firma de un usuario |
| `listSignatureRequestsByDocument(req, userId, documentId)` | Listar solicitudes de un documento concreto |
| `listSignatureRequestsByEntity(req, userId, entityType, entityId)` | Listar firmas vinculadas a un cliente/proveedor/trabajador |

**3. Crear `src/app/lib/signatureApi.ts`**

| Función | Descripción |
|---|---|
| `listSignatureRequests(userId, filters?)` | Listar solicitudes (con filtros por estado, entidad, fecha) |
| `getSignatureRequest(userId, requestId)` | Obtener detalle de una solicitud |
| `createSignatureRequest(userId, data)` | Crear borrador de solicitud |
| `updateSignatureRequest(userId, requestId, data)` | Actualizar solicitud (solo en draft) |
| `sendSignatureRequest(userId, requestId)` | Enviar a firma (cambia a `pending`) |
| `cancelSignatureRequest(userId, requestId, reason?)` | Cancelar solicitud activa |
| `resendToSigner(userId, requestId, signerId)` | Reenviar notificación a un firmante |
| `downloadSignedFile(userId, requestId)` | Descargar el archivo firmado final |
| `getSignatureHistory(userId, requestId)` | Obtener histórico de eventos |

**4. Actualizar `normalizeDocumentStatus` para sincronizar**

Cuando una `signature_request` cambie de estado, el documento original debe reflejar el cambio:

| Estado de `signature_request` | Estado del documento |
|---|---|
| `draft` | (sin cambio) |
| `pending` | `pending_signature` |
| `partially_signed` | `pending_signature` |
| `completed` | `signed` |
| `rejected` | `rejected` |
| `expired` | `expired` |
| `cancelled` | `draft` |

#### Criterios de aceptación
- [ ] Documento `signature_request` se persiste en la DB `*-documents`
- [ ] Soporta firmantes múltiples con orden secuencial o paralelo
- [ ] Cada firmante tiene estado individual (`pending`, `viewed`, `signed`, `rejected`, `expired`)
- [ ] Eventos de histórico se registran como array `events[]` dentro del documento
- [ ] Vinculación a cliente, proveedor o trabajador mediante `linkedEntityType` + `linkedEntityId`
- [ ] Archivo original y archivo firmado tienen campos separados
- [ ] CRUD completo desde API client (`signatureApi.ts`)
- [ ] Al cambiar estado de la solicitud, el documento original se actualiza automáticamente

---

### FD-02 — Backend API: Controlador y Router de firma digital

**Tipo:** Backend
**Prioridad:** Crítica
**Dependencias:** FD-01

#### Contexto

Los documentos ya tienen un CRUD básico en `documentsController.js` + `documentsRouter.js`. La firma digital necesita su propio controlador con lógica de negocio específica: envío, cancelación, actualización de firmantes, recordatorios, y sincronización con el documento original.

#### Qué hacer

**1. Crear `controllers/signatureController.js`**

| Endpoint | Método | Handler | Descripción |
|---|---|---|---|
| `/:userId` | GET | `listSignatureRequests` | Listar solicitudes del usuario (query: `status`, `documentId`, `entityType`, `entityId`, `from`, `to`) |
| `/:userId/:requestId` | GET | `getSignatureRequest` | Detalle de una solicitud con firmantes y eventos |
| `/:userId` | POST | `createSignatureRequest` | Crear borrador de solicitud de firma |
| `/:userId/:requestId` | PUT | `updateSignatureRequest` | Actualizar solicitud (solo en `draft`) |
| `/:userId/:requestId` | DELETE | `cancelSignatureRequest` | Cancelar solicitud (soft: cambia a `cancelled`) |
| `/:userId/:requestId/send` | POST | `sendSignatureRequest` | Enviar solicitud a los firmantes |
| `/:userId/:requestId/remind` | POST | `sendReminder` | Enviar recordatorio a firmantes pendientes |
| `/:userId/:requestId/signers/:signerId/resend` | POST | `resendToSigner` | Reenviar a un firmante específico |

**2. Crear `routers/signatureRouter.js`**

```javascript
import { Router } from 'express';
import {
  listSignatureRequests,
  getSignatureRequest,
  createSignatureRequest,
  updateSignatureRequest,
  cancelSignatureRequest,
  sendSignatureRequest,
  sendReminder,
  resendToSigner,
} from '../controllers/signatureController.js';

const signatureRouter = Router();

signatureRouter.get('/:userId', listSignatureRequests);
signatureRouter.get('/:userId/:requestId', getSignatureRequest);
signatureRouter.post('/:userId', createSignatureRequest);
signatureRouter.put('/:userId/:requestId', updateSignatureRequest);
signatureRouter.delete('/:userId/:requestId', cancelSignatureRequest);
signatureRouter.post('/:userId/:requestId/send', sendSignatureRequest);
signatureRouter.post('/:userId/:requestId/remind', sendReminder);
signatureRouter.post('/:userId/:requestId/signers/:signerId/resend', resendToSigner);

export { signatureRouter };
```

**3. Montar en `index.js`**

Añadir al bloque `internalRouters`:

```javascript
['signatures', signatureRouter],
```

Se montará como `/api/signatures/:userId` y `/api/v2/signatures/:userId`.

**4. Endpoint público para firmante externo**

Crear ruta pública (sin `requireAuth`) para que un firmante pueda ver y firmar desde el enlace de email:

| Endpoint | Método | Handler | Descripción |
|---|---|---|---|
| `/api/sign/view/:token` | GET | `viewSignaturePublic` | Ver documento para firmar (valida token JWT del firmante) |
| `/api/sign/accept/:token` | POST | `acceptSignaturePublic` | Registrar firma del firmante externo |
| `/api/sign/reject/:token` | POST | `rejectSignaturePublic` | Rechazar firma con motivo |

El `token` es un JWT firmado con los datos: `{ requestId, signerId, email, exp }`.

**5. Validación con Zod**

Crear esquemas de validación en el controller o en un archivo separado:

```javascript
const createSignatureSchema = z.object({
  documentId: z.string().min(1),
  signers: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    role: z.enum(['signer', 'reviewer', 'cc']),
    order: z.number().int().min(0).default(0),
    entityType: z.enum(['client', 'supplier', 'team_member', 'external']),
    entityId: z.string().default(''),
  })).min(1),
  signingOrder: z.enum(['parallel', 'sequential']).default('parallel'),
  message: z.string().optional(),
  expiresAt: z.string().min(1),
  reminderEnabled: z.boolean().default(true),
  reminderIntervalDays: z.number().int().min(1).max(30).default(3),
  linkedEntityType: z.enum(['client', 'supplier', 'team_member']).optional(),
  linkedEntityId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
```

**6. Lógica de negocio en `sendSignatureRequest`**

Al enviar a firma:
1. Validar que el documento existe y pertenece al usuario
2. Validar que todos los firmantes tienen email
3. Generar token JWT por firmante con expiración
4. Cambiar estado de la solicitud a `pending`
5. Cambiar estado del documento original a `pending_signature`
6. Registrar evento `sent` en el histórico
7. Enviar email a cada firmante (o al primero si `sequential`)
8. Registrar actividad con `logAccountActivity`

#### Criterios de aceptación
- [ ] Router montado en `/api/signatures` con `requireAuth`
- [ ] CRUD completo funcional con filtros por estado, documento, entidad y fecha
- [ ] Endpoint `send` cambia estado a `pending` y sincroniza el documento original
- [ ] Endpoint `cancel` cambia estado a `cancelled` y vuelve el documento a `draft`
- [ ] Endpoints públicos para firmante externo con token JWT
- [ ] Validación Zod en creación y actualización
- [ ] Activity logging en todas las operaciones
- [ ] Cada operación registra evento en `events[]` de la solicitud

---

### FD-03 — Servicio de firma: Integración con proveedores

**Tipo:** Backend (Servicio)
**Prioridad:** Alta
**Dependencias:** FD-01, FD-02

#### Contexto

El sistema ya tiene un catálogo de tokens para proveedores de eSignature en `TokensTab.tsx` (DocuSign, HelloSign, Yousign, Signaturit), pero no hay ninguna integración funcional. Necesitamos un servicio abstracto que permita usar un proveedor externo O un flujo interno de firma (captura de firma manuscrita en canvas).

#### Qué hacer

**1. Crear `services/signatureProviderService.js`**

Interfaz del proveedor (patrón Strategy):

```typescript
interface SignatureProvider {
  name: string;
  createRequest(signatureRequest: SignatureRequest): Promise<{ providerRequestId: string; signerUrls: Map<string, string> }>;
  cancelRequest(providerRequestId: string): Promise<void>;
  getStatus(providerRequestId: string): Promise<{ status: string; signers: { email: string; status: string }[] }>;
  downloadSignedDocument(providerRequestId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }>;
  sendReminder(providerRequestId: string, signerEmail: string): Promise<void>;
}
```

**2. Implementar proveedor `internal` (por defecto)**

Firma sin proveedor externo — el firmante abre un enlace, ve el documento y firma con canvas (dibujo de firma) o checkbox de conformidad:

| Paso | Descripción |
|---|---|
| 1. Envío | Se genera un JWT por firmante y se envía email con enlace `/sign/view/:token` |
| 2. Visualización | El firmante abre el enlace, ve el PDF/documento embebido |
| 3. Firma | El firmante dibuja su firma en un canvas o acepta con checkbox |
| 4. Registro | Se guarda la imagen de firma, IP, user agent, timestamp |
| 5. Completado | Cuando todos firman, se genera un PDF con las firmas embebidas y certificado |

**3. Implementar proveedor `signaturit` (ejemplo de proveedor externo)**

Signaturit es el proveedor español con eIDAS. Implementar como ejemplo y template para los demás:

| Función | API de Signaturit |
|---|---|
| `createRequest` | `POST /v3/signatures` — Crea solicitud con documento y firmantes |
| `cancelRequest` | `PATCH /v3/signatures/:id/cancel` |
| `getStatus` | `GET /v3/signatures/:id` |
| `downloadSignedDocument` | `GET /v3/signatures/:id/documents/:docId/download/signed` |
| `sendReminder` | `POST /v3/signatures/:id/reminder` |

**4. Factory de proveedores**

```javascript
export function getSignatureProvider(providerName, credentials) {
  switch (providerName) {
    case 'signaturit': return new SignaturitProvider(credentials);
    case 'docusign':   return new DocuSignProvider(credentials);
    case 'yousign':    return new YousignProvider(credentials);
    case 'hellosign':  return new HelloSignProvider(credentials);
    default:           return new InternalProvider();
  }
}
```

**5. Lectura de credenciales**

Las credenciales se leen desde los tokens almacenados por el plugin (`TokensTab.tsx`):
- La UI ya permite guardar API keys por servicio
- El servicio lee el token del proveedor configurado por el usuario
- Si no hay proveedor configurado, se usa `internal`

**6. Webhook para proveedores externos**

Crear endpoint público para recibir callbacks:

```
POST /api/webhooks/signature/:provider
```

Cada proveedor envía eventos (firmado, rechazado, expirado). El handler:
1. Valida la firma del webhook (cada proveedor tiene su mecanismo)
2. Busca la `signature_request` por `providerRequestId`
3. Actualiza estado del firmante
4. Registra evento en `events[]`
5. Si todos firmaron → marca como `completed`, descarga archivo firmado
6. Emite notificación al propietario

#### Criterios de aceptación
- [ ] Proveedor `internal` funcional con firma por canvas/checkbox y enlace por email
- [ ] Proveedor `signaturit` funcional como template de integración externa
- [ ] Factory selecciona proveedor según configuración del usuario
- [ ] Credenciales leídas desde tokens del plugin
- [ ] Webhook recibe y procesa eventos de proveedores externos
- [ ] Al completar firma, se descarga y almacena el archivo firmado
- [ ] Documentación inline de cómo añadir un nuevo proveedor

---

### FD-04 — Motor de automatización: Histórico, estados y recordatorios

**Tipo:** Backend (Servicio)
**Prioridad:** Alta
**Dependencias:** FD-01, FD-02

#### Contexto

La firma digital necesita automatizaciones que mantengan la coherencia del sistema: actualización de estados entre documentos y solicitudes, generación de histórico, expiración automática, y recordatorios periódicos.

#### Qué hacer

**1. Sincronización de estados documento ↔ solicitud de firma**

Crear `services/signatureAutomation.js` con las siguientes funciones:

| Función | Trigger | Acción |
|---|---|---|
| `syncDocumentStatus(req, signatureRequest)` | Cambio de estado en solicitud | Actualiza `status`, `signedAt`, `signedByClientAt` del documento original |
| `updateRequestStatusFromSigners(req, requestId)` | Cambio de estado de un firmante | Recalcula estado global: si todos firmaron → `completed`, si uno rechazó → `rejected`, si hay mix → `partially_signed` |
| `expireOverdueRequests()` | Cron (cada hora, integrado en alertEngine) | Busca solicitudes `pending`/`partially_signed` con `expiresAt < now`, cambia a `expired`, notifica al propietario |
| `sendScheduledReminders()` | Cron (cada hora, integrado en alertEngine) | Busca solicitudes con `reminderEnabled` y `lastReminderAt` más de X días atrás, envía recordatorio a firmantes pendientes |

**2. Registro de eventos (histórico)**

Cada acción genera una entrada en `events[]`:

| Acción | `action` | Ejemplo de `details` |
|---|---|---|
| Creación | `created` | "Solicitud de firma creada por Juan García" |
| Envío | `sent` | "Documento enviado a 3 firmantes" |
| Visualización | `viewed` | "Ana López abrió el documento" |
| Firma | `signed` | "Ana López firmó el documento" |
| Rechazo | `rejected` | "Pedro Ruiz rechazó: 'Falta la cláusula 5'" |
| Recordatorio | `reminder_sent` | "Recordatorio enviado a María Gómez" |
| Expiración | `expired` | "La solicitud expiró sin completar todas las firmas" |
| Cancelación | `cancelled` | "Cancelada por Juan García: 'Documento incorrecto'" |
| Completada | `completed` | "Todos los firmantes han firmado — archivo final generado" |
| Descarga | `downloaded` | "Juan García descargó el archivo firmado" |

**3. Vincular al `logAccountActivity` existente**

Además de los eventos internos de la solicitud, registrar las acciones en el log de actividad de la cuenta (como ya hace `documentsController.js`):

```javascript
await logAccountActivity(req, {
  actorUserId: userId,
  actorName: account.fullName,
  targetUserId: userId,
  type: 'signature',
  action: `Envió a firma "${request.documentName}" a ${request.signers.length} firmantes`,
  entityId: request._id,
  entityLabel: request.documentName,
  metadata: { status: request.status, signersCount: request.signers.length },
});
```

**4. Integrar en el motor de alertas existente**

Añadir a `services/alertEngine.js` en la función `runAlertsForUser`:

```javascript
const signatureRequests = await fetchAllDocsOfType(getDocumentsDbName(), 'signature_request')
  .then(d => d.filter(i => i.user_id === userId));

results.push(...await checkPendingSignatures(userId, signatureRequests, config));
results.push(...await checkExpiredSignatures(userId, signatureRequests, config));
results.push(...await checkRejectedSignatures(userId, signatureRequests, config));
```

(Las funciones de check se detallan en FD-05.)

**5. Configuración de alertas**

Añadir a `getAlertConfig()` en `alertEngine.js`:

```javascript
signaturePendingEnabled: cfg.signaturePendingEnabled !== false,
signaturePendingDays: Number(cfg.signaturePendingDays || 3),
signatureExpiredEnabled: cfg.signatureExpiredEnabled !== false,
signatureRejectedEnabled: cfg.signatureRejectedEnabled !== false,
signatureReminderEnabled: cfg.signatureReminderEnabled !== false,
signatureReminderDays: Number(cfg.signatureReminderDays || 3),
```

#### Criterios de aceptación
- [ ] Al cambiar estado de firmante, el estado global de la solicitud se recalcula automáticamente
- [ ] Al cambiar estado de la solicitud, el documento original se sincroniza
- [ ] Cada operación genera un evento en `events[]` con timestamp, actor y detalles
- [ ] Las acciones se registran también en `logAccountActivity`
- [ ] Solicitudes expiradas se marcan automáticamente cada hora
- [ ] Recordatorios se envían automáticamente según la configuración
- [ ] Las funciones de automatización están integradas en `alertEngine.js`

---

### FD-05 — Sistema de alertas: Firma digital

**Tipo:** Backend + UI
**Prioridad:** Alta
**Dependencias:** FD-01, FD-04

#### Contexto

El motor de alertas existente (`alertEngine.js`) ya cubre stock, compras, ventas, vehículos y taller. Necesitamos añadir alertas de firma digital que notifiquen al usuario sobre documentos pendientes, firmas rechazadas y firmas caducadas.

#### Qué hacer

**1. Definir funciones de alerta en `alertEngine.js`**

**Alerta: Documento pendiente de firmar**

```javascript
async function checkPendingSignatures(userId, signatureRequests, config) {
  if (!config.signaturePendingEnabled) return [];
  const now = new Date();
  const alerts = [];

  const pending = signatureRequests.filter(sr =>
    ['pending', 'partially_signed'].includes(sr.status)
  );

  for (const sr of pending) {
    const daysSinceSent = daysBetween(
      sr.events.find(e => e.action === 'sent')?.timestamp || sr.createdAt,
      now
    );
    if (daysSinceSent < config.signaturePendingDays) continue;

    const pendingSigners = sr.signers.filter(s => s.status === 'pending' && s.role === 'signer');

    alerts.push(await emitAlert({
      userId,
      dedupKey: `sigpending-${sr._id}`,
      level: daysSinceSent > config.signaturePendingDays * 2 ? 'alert' : 'warning',
      category: 'signature_pending',
      title: 'Documento pendiente de firma',
      message: `"${sr.documentName}" lleva ${daysSinceSent} días pendiente. ${pendingSigners.length} firmante(s) sin firmar.`,
      entityId: sr._id,
      entityType: 'signature_request',
      route: `/saas/documents?signature=${sr._id}`,
      metadata: {
        documentName: sr.documentName,
        daysSinceSent,
        pendingSignersCount: pendingSigners.length,
        pendingSignerNames: pendingSigners.map(s => s.name).join(', '),
      },
    }));
  }

  return alerts.filter(Boolean);
}
```

**Alerta: Firma rechazada**

```javascript
async function checkRejectedSignatures(userId, signatureRequests, config) {
  if (!config.signatureRejectedEnabled) return [];
  const alerts = [];

  const rejected = signatureRequests.filter(sr => sr.status === 'rejected');

  for (const sr of rejected) {
    const rejectedSigner = sr.signers.find(s => s.status === 'rejected');
    if (!rejectedSigner) continue;

    alerts.push(await emitAlert({
      userId,
      dedupKey: `sigrejected-${sr._id}`,
      level: 'alert',
      category: 'signature_rejected',
      title: 'Firma rechazada',
      message: `"${sr.documentName}" fue rechazada por ${rejectedSigner.name}${rejectedSigner.rejectionReason ? `: "${rejectedSigner.rejectionReason}"` : ''}.`,
      entityId: sr._id,
      entityType: 'signature_request',
      route: `/saas/documents?signature=${sr._id}`,
      metadata: {
        documentName: sr.documentName,
        rejectedBy: rejectedSigner.name,
        reason: rejectedSigner.rejectionReason || '',
      },
    }));
  }

  return alerts.filter(Boolean);
}
```

**Alerta: Firma caducada**

```javascript
async function checkExpiredSignatures(userId, signatureRequests, config) {
  if (!config.signatureExpiredEnabled) return [];
  const now = new Date();
  const alerts = [];

  const expiring = signatureRequests.filter(sr => {
    if (sr.status !== 'pending' && sr.status !== 'partially_signed') return false;
    if (!sr.expiresAt) return false;
    const daysUntilExpiry = (new Date(sr.expiresAt).getTime() - now.getTime()) / 86_400_000;
    return daysUntilExpiry <= 2 && daysUntilExpiry > 0;
  });

  for (const sr of expiring) {
    const hoursLeft = Math.floor((new Date(sr.expiresAt).getTime() - now.getTime()) / 3_600_000);
    const pendingSigners = sr.signers.filter(s => s.status === 'pending' && s.role === 'signer');

    alerts.push(await emitAlert({
      userId,
      dedupKey: `sigexpiring-${sr._id}`,
      level: hoursLeft < 24 ? 'alert' : 'warning',
      category: 'signature_expiring',
      title: 'Firma a punto de caducar',
      message: `"${sr.documentName}" caduca en ${hoursLeft < 24 ? `${hoursLeft}h` : `${Math.ceil(hoursLeft / 24)} días`}. ${pendingSigners.length} firmante(s) pendiente(s).`,
      entityId: sr._id,
      entityType: 'signature_request',
      route: `/saas/documents?signature=${sr._id}`,
      metadata: {
        documentName: sr.documentName,
        hoursLeft,
        expiresAt: sr.expiresAt,
        pendingSignersCount: pendingSigners.length,
      },
    }));
  }

  const expired = signatureRequests.filter(sr => sr.status === 'expired');

  for (const sr of expired) {
    alerts.push(await emitAlert({
      userId,
      dedupKey: `sigexpired-${sr._id}`,
      level: 'alert',
      category: 'signature_expired',
      title: 'Firma caducada',
      message: `"${sr.documentName}" caducó el ${new Date(sr.expiresAt).toLocaleDateString('es-ES')} sin completar todas las firmas.`,
      entityId: sr._id,
      entityType: 'signature_request',
      route: `/saas/documents?signature=${sr._id}`,
      metadata: { documentName: sr.documentName, expiresAt: sr.expiresAt },
    }));
  }

  return alerts.filter(Boolean);
}
```

**2. Notificaciones en tiempo real**

Además de las alertas periódicas del motor, emitir notificaciones inmediatas vía SSE + Push:

| Evento | Nivel | Mensaje |
|---|---|---|
| Firmante firma | `info` | "Ana López firmó 'Contrato de servicio'" |
| Firmante rechaza | `alert` | "Pedro Ruiz rechazó firmar 'Contrato de servicio'" |
| Todos firman (completado) | `info` | "¡'Contrato de servicio' completamente firmado!" |
| Solicitud a punto de caducar (<24h) | `warning` | "'Contrato de servicio' caduca en 12h" |
| Solicitud caducada | `alert` | "'Contrato de servicio' ha caducado sin completar" |

Usar `broadcastToUser` (SSE) + `sendPushToUser` (Web Push) como hace el motor actual.

**3. Email al propietario en eventos críticos**

Usar `nodemailer` (ya configurado) para enviar email al propietario cuando:
- Un firmante rechaza
- La solicitud se completa (todos firmaron)
- La solicitud caduca

#### Criterios de aceptación
- [ ] Alerta `signature_pending`: se genera si lleva más de X días pendiente (configurable)
- [ ] Alerta `signature_rejected`: se genera inmediatamente al rechazar
- [ ] Alerta `signature_expiring`: se genera cuando quedan menos de 2 días para caducar
- [ ] Alerta `signature_expired`: se genera al caducar
- [ ] Alertas deduplicadas con el mismo patrón de 24h del motor existente
- [ ] Notificaciones inmediatas por SSE + Push en firma/rechazo/completado
- [ ] Email al propietario en rechazo, completado y caducidad
- [ ] Alertas configurables on/off desde `alertConfig` de la cuenta

---

### FD-06 — Frontend: Modal de envío a firma

**Tipo:** Frontend (Componente)
**Prioridad:** Crítica
**Dependencias:** FD-01, FD-02

#### Contexto

El modal de envío a firma es el punto de entrada principal. Se abre desde cualquier contexto donde haya un documento: pestaña de documentos del cliente, módulo de documentación, o verticales. Debe permitir configurar firmantes, orden, caducidad y mensaje personalizado, y luego enviar a firma.

#### Qué hacer

**1. Crear `src/app/components/SignatureRequestModal.tsx`**

Modal con Radix Dialog (`@radix-ui/react-dialog`), siguiendo el patrón de modales existentes:

```
┌─────────────────────────────────────────────────────────────────┐
│  ✍️  Enviar a firma                                      [✕]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Documento                                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 📄 Contrato-de-servicio-2026.pdf                    2.4 MB│  │
│  │    Vinculado a: Empresa ABC S.L. (cliente)                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Firmantes                                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. 👤 Ana López — ana@empresa.com        [Firma] [✕]     │  │
│  │ 2. 👤 Pedro Ruiz — pedro@empresa.com     [Firma] [✕]     │  │
│  │ 3. 👤 —                                   [CC]   [✕]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [+ Añadir firmante]                                             │
│                                                                  │
│  Opciones                                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Orden de firma:    (○) Todos a la vez  (●) Secuencial    │  │
│  │ Fecha límite:      [ 2026-04-28 ]                         │  │
│  │ Recordatorios:     [✓] Cada [ 3 ] días                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Mensaje para los firmantes (opcional)                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Por favor, revisen y firmen el contrato adjunto.          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                        [Cancelar]  [Enviar a firma →]           │
└─────────────────────────────────────────────────────────────────┘
```

**2. Selector de firmantes inteligente**

Al añadir un firmante, el modal ofrece autocompletar desde:
- Clientes del CRM (`listClientsByUser`)
- Proveedores (`listSuppliersByUser`)
- Miembros del equipo (orgchart)
- O entrada manual (email libre → `entityType: 'external'`)

Cada firmante tiene:
- Campo nombre (autocompletado o manual)
- Campo email (autocompletado o manual)
- Selector de rol: `Firma` / `Revisión` / `Copia`
- Drag handle para reordenar (si orden secuencial)
- Botón eliminar

**3. Previsualización del documento**

Si el documento tiene `fileUrl` (PDF), mostrar miniatura o botón "Ver documento". Si tiene `content` (HTML), mostrar preview inline.

**4. Validaciones en el modal**

| Validación | Mensaje |
|---|---|
| Sin firmantes | "Añade al menos un firmante" |
| Firmante sin email | "Todos los firmantes necesitan email" |
| Sin fecha límite | "Establece una fecha límite" |
| Fecha límite en el pasado | "La fecha límite debe ser futura" |
| Documento sin archivo | "El documento necesita un archivo adjunto para firmar" |

**5. Estados del botón de envío**

| Estado | Botón |
|---|---|
| Formulario incompleto | Deshabilitado + tooltip con el error |
| Listo para enviar | "Enviar a firma →" azul |
| Enviando | Spinner + "Enviando..." |
| Enviado con éxito | Toast verde "Solicitud de firma enviada a X firmantes" |
| Error | Toast rojo con el mensaje de error |

#### Criterios de aceptación
- [ ] Modal se abre con `document` como prop
- [ ] Firmantes autocompletados desde CRM, proveedores y equipo
- [ ] Soporte para entrada manual de firmante externo
- [ ] Roles: Firma, Revisión, Copia
- [ ] Orden secuencial con drag-and-drop
- [ ] Campo de fecha límite y recordatorios
- [ ] Mensaje personalizado opcional
- [ ] Validación completa antes de enviar
- [ ] Al enviar, llama a `createSignatureRequest` + `sendSignatureRequest`
- [ ] Toast de éxito/error
- [ ] Responsive en móvil (fullscreen en pantallas pequeñas)
- [ ] Dark mode

---

### FD-07 — Frontend: Panel de estado de firmas

**Tipo:** Frontend (Componente + Integración)
**Prioridad:** Alta
**Dependencias:** FD-01, FD-02, FD-06

#### Contexto

Más allá del modal de envío, necesitamos un panel donde el usuario pueda ver el estado de todas sus solicitudes de firma, el detalle de cada una (firmantes, eventos), y actuar sobre ellas (reenviar, cancelar, descargar).

#### Qué hacer

**1. Crear `src/app/components/SignaturePanel.tsx`**

Componente que se puede embeber como pestaña o sección en diferentes páginas:

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLICITUDES DE FIRMA                                            │
│                                                                  │
│  Filtros: [Todas ▾]  [Este mes ▾]  [Buscar...]                 │
│                                                                  │
│  ┌─ KPIs ──────────────────────────────────────────────────────┐│
│  │ 📨 Pendientes: 4  │ ✅ Completadas: 12  │ ❌ Rechazadas: 1 ││
│  │ ⏰ Por caducar: 2  │ 📊 Tasa firma: 85%                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─ Lista ─────────────────────────────────────────────────────┐│
│  │ 📄 Contrato servicio — Empresa ABC     🟡 Pendiente         ││
│  │    2/3 firmantes · Caduca 28/04/2026                         ││
│  │    [Ver detalle] [Recordar] [Cancelar]                       ││
│  │─────────────────────────────────────────────────────────────│ │
│  │ 📄 NDA Proveedor — Suministros XYZ    🟢 Completada         ││
│  │    3/3 firmantes · Completada 10/04/2026                     ││
│  │    [Ver detalle] [Descargar firmado ↓]                       ││
│  │─────────────────────────────────────────────────────────────│ │
│  │ 📄 Consentimiento RGPD — Ana López    🔴 Rechazada          ││
│  │    "No estoy de acuerdo con la cláusula 7"                   ││
│  │    [Ver detalle] [Reenviar modificado]                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**2. Crear `src/app/components/SignatureDetailDrawer.tsx`**

Drawer lateral (vaul) que muestra el detalle de una solicitud:

```
┌─────────────────────────────────────────────┐
│  DETALLE DE FIRMA                      [✕]  │
├─────────────────────────────────────────────┤
│  📄 Contrato de servicio 2026               │
│  Estado: 🟡 Pendiente (2 de 3 firmaron)     │
│  Creada: 14/04/2026 por Juan García         │
│  Caduca: 28/04/2026 (14 días)               │
│  Vinculado a: Empresa ABC (cliente)         │
│                                              │
│  ─── Firmantes ──────────────────────────── │
│                                              │
│  1. ✅ Ana López — ana@empresa.com           │
│     Firmó el 15/04/2026 a las 10:32         │
│                                              │
│  2. ✅ Pedro Ruiz — pedro@empresa.com        │
│     Firmó el 16/04/2026 a las 14:15         │
│                                              │
│  3. ⏳ María Gómez — maria@externo.com       │
│     Pendiente · Visto el 17/04/2026         │
│     [Enviar recordatorio]                    │
│                                              │
│  ─── Histórico ──────────────────────────── │
│                                              │
│  17/04 14:15 — Pedro Ruiz firmó              │
│  16/04 10:32 — Ana López firmó               │
│  16/04 10:30 — Ana López abrió el documento  │
│  14/04 09:00 — Enviado a 3 firmantes         │
│  14/04 08:55 — Solicitud creada              │
│                                              │
│  ─── Acciones ───────────────────────────── │
│                                              │
│  [Enviar recordatorio a todos]               │
│  [Cancelar solicitud]                        │
│  [Descargar documento original]              │
│                                              │
└─────────────────────────────────────────────┘
```

**3. Estados visuales de los firmantes**

| Estado | Icono | Color | Texto |
|---|---|---|---|
| `pending` | `Clock` | amber-500 | Pendiente |
| `viewed` | `Eye` | blue-500 | Visto |
| `signed` | `CheckCircle2` | emerald-500 | Firmado |
| `rejected` | `XCircle` | red-500 | Rechazado |
| `expired` | `AlertTriangle` | gray-500 | Caducado |

**4. Estados visuales de la solicitud**

| Estado | Badge | Color |
|---|---|---|
| `draft` | Borrador | `bg-gray-100 text-gray-600` |
| `pending` | Pendiente | `bg-amber-100 text-amber-700` |
| `partially_signed` | Firmando | `bg-blue-100 text-blue-700` |
| `completed` | Completada | `bg-emerald-100 text-emerald-700` |
| `rejected` | Rechazada | `bg-red-100 text-red-700` |
| `expired` | Caducada | `bg-gray-100 text-gray-500` |
| `cancelled` | Cancelada | `bg-gray-100 text-gray-400` |

**5. Acciones contextuales por estado**

| Estado | Acciones disponibles |
|---|---|
| `draft` | Editar, Enviar, Eliminar |
| `pending` | Recordar, Cancelar, Ver detalle |
| `partially_signed` | Recordar pendientes, Cancelar, Ver detalle |
| `completed` | Descargar firmado, Ver detalle |
| `rejected` | Reenviar (crea nueva solicitud), Ver detalle |
| `expired` | Reenviar (crea nueva solicitud), Ver detalle |
| `cancelled` | Reenviar (crea nueva solicitud), Ver detalle |

#### Criterios de aceptación
- [ ] Panel muestra lista de solicitudes con filtros por estado, fecha y búsqueda
- [ ] KPIs: pendientes, completadas, rechazadas, por caducar, tasa de firma
- [ ] Drawer de detalle con firmantes, estados individuales y timeline de eventos
- [ ] Acciones contextuales según estado de la solicitud
- [ ] Badge de estado con colores y iconos coherentes con el diseño existente
- [ ] Responsive + dark mode
- [ ] Animaciones suaves (Radix Dialog / Vaul drawer)

---

### FD-08 — Conexiones: Documentación, CRM, Equipo, Verticales

**Tipo:** Frontend (Integración)
**Prioridad:** Alta
**Dependencias:** FD-06, FD-07

#### Contexto

La firma digital no vive aislada; debe estar accesible desde todos los módulos que manejan documentos: la ficha del cliente, la ficha del proveedor, el detalle del miembro del equipo, el módulo de documentos y las verticales que generen documentos (contratos, presupuestos, consentimientos, etc.).

#### Qué hacer

**1. Integración en ClientDetail.tsx (CRM — Clientes)**

En la pestaña "Documentos" de la ficha del cliente:

| Cambio | Descripción |
|---|---|
| Botón "Enviar a firma" por documento | En cada ítem de la lista de documentos, añadir icono de firma (`Pen`) que abre el `SignatureRequestModal` con el documento y el cliente preseleccionado como firmante |
| Estado de firma en la tarjeta de documento | Si el documento tiene una `signature_request` activa, mostrar badge con estado de firma (pendiente, firmado, rechazado) |
| Sub-pestaña "Firmas" en la pestaña Documentos | Listar las solicitudes de firma vinculadas al cliente (`linkedEntityType: 'client'`, `linkedEntityId: clientId`) usando `SignaturePanel` filtrado |
| Columna de firma en la tabla de documentos | Añadir columna "Firma" con badge de estado junto al estado del documento |

**2. Integración en proveedores (si existe página de detalle)**

Misma lógica que clientes: botón de firma por documento, badge de estado, panel filtrado por `linkedEntityType: 'supplier'`.

Si no existe aún una página de detalle de proveedor, al menos:
- En la lista de proveedores, cada proveedor muestra un badge si tiene firmas pendientes

**3. Integración en equipo**

En el detalle del miembro del equipo (`TeamMemberDetail.tsx`):
- Sección "Documentos del empleado" con botón de firma
- Uso típico: contratos laborales, NDAs, políticas internas, certificados
- `linkedEntityType: 'team_member'`

**4. Integración en el módulo de documentación**

Si existe una página dedicada de documentos (`/saas/documents`):
- Pestaña "Firmas" o toggle que muestre las solicitudes de firma
- En la vista general de documentos, columna de estado de firma
- Botón "Enviar a firma" en la barra de acciones del documento

Si no existe como página separada, crear una ruta `/saas/documents` que muestre:
- Lista de todos los documentos del usuario
- Panel de solicitudes de firma
- Botón de creación de documento + envío a firma

**5. Integración en verticales**

Para verticales que generen documentos firmables:

| Vertical | Documento típico | Dónde integrar |
|---|---|---|
| Automoción | Contrato compraventa, transferencia | Detalle de venta / vehículo |
| Clínica | Consentimiento informado, ficha paciente | Detalle del paciente |
| Construcción | Presupuesto de obra, certificación | Detalle del proyecto |
| Inmobiliaria | Contrato arras, mandato de venta | Detalle del inmueble |
| Legal | Contratos, poderes, escrituras | Detalle del asunto |
| Todas | Presupuesto aceptado → firma de conformidad | Detalle del presupuesto |

Para cada vertical que aplique, añadir:
- Botón "Firmar" en el detalle del documento/presupuesto
- Uso del `SignatureRequestModal` con la entidad preseleccionada

**6. Dashboard — Widget de firmas**

Añadir widget en el Dashboard:

```
┌──────────────────────────────────────┐
│  ✍️ Firmas pendientes                │
│                                       │
│  Pendientes:        4                 │
│  Por caducar (<48h): 1                │
│  Completadas (mes):  8                │
│                                       │
│  📄 Contrato ABC — caduca en 2 días  │
│  📄 NDA Proveedor X — 1/2 firmaron   │
│                                       │
│  [Ver todas →]                        │
└──────────────────────────────────────┘
```

**7. Sidebar — Badge de firmas pendientes**

En el sidebar, junto al item de "Documentos" (o donde se ubique la gestión de firma), mostrar badge con el count de solicitudes pendientes, igual que se plantea en HV-06 para alertas de horarios.

#### Criterios de aceptación
- [ ] Botón "Enviar a firma" visible en la pestaña de documentos del cliente
- [ ] Badge de estado de firma en cada documento que tenga solicitud activa
- [ ] Panel de firmas filtrado por entidad en ClientDetail
- [ ] Integración en equipo para documentos del empleado
- [ ] Ruta `/saas/documents` con panel de firmas (si no existía, crearla)
- [ ] Al menos 2 verticales con botón de firma integrado
- [ ] Widget de firmas en el Dashboard
- [ ] Badge de firmas pendientes en el sidebar
- [ ] Todas las integraciones pasan el `document` y la entidad como props al modal

---

### FD-09 — Email de firma y página pública del firmante

**Tipo:** Backend + Frontend (página pública)
**Prioridad:** Crítica
**Dependencias:** FD-02, FD-03

#### Contexto

El firmante externo (cliente, proveedor, o persona externa) necesita recibir un email con un enlace seguro, y al abrirlo ver el documento, poder leerlo y firmarlo o rechazarlo. Esta es la experiencia más crítica del flujo — si no funciona bien, nadie firma.

#### Qué hacer

**1. Plantilla de email**

Crear plantilla HTML para el email de firma. Usar `nodemailer` (ya configurado):

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [Logo del negocio]                                             │
│                                                                  │
│  Hola Ana,                                                       │
│                                                                  │
│  Juan García de [Nombre del negocio] te ha enviado un            │
│  documento para firmar:                                          │
│                                                                  │
│  📄 Contrato de servicio 2026                                    │
│                                                                  │
│  "Por favor, revisen y firmen el contrato adjunto."              │
│                                                                  │
│  ┌─────────────────────────────┐                                │
│  │    Revisar y firmar →       │                                │
│  └─────────────────────────────┘                                │
│                                                                  │
│  Este enlace caduca el 28 de abril de 2026.                     │
│                                                                  │
│  Si tienes dudas, contacta con Juan García                      │
│  (juan@negocio.com)                                              │
│                                                                  │
│  ─────────────────────────────────                              │
│  Enviado mediante [Nombre de la plataforma]                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**2. Crear página pública `/sign/:token`**

Página sin autenticación, validada por JWT del firmante:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo del negocio]                  Solicitud de firma          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📄 Contrato de servicio 2026                                    │
│  Enviado por: Juan García — juan@negocio.com                    │
│  Fecha límite: 28 de abril de 2026                              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │               (Visor de PDF embebido)                      │  │
│  │              o contenido HTML del documento                │  │
│  │                                                            │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  He leído y acepto el contenido de este documento.              │
│                                                                  │
│  Firma:                                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │          (Canvas para dibujar firma)                       │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [Limpiar]                                                       │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────────────────┐        │
│  │   Rechazar  ✕    │  │   Firmar documento  ✓        │        │
│  └──────────────────┘  └──────────────────────────────┘        │
│                                                                  │
│  Al firmar, acepto que esta firma digital tiene validez          │
│  legal conforme al Reglamento eIDAS (UE 910/2014).             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**3. Canvas de firma**

Implementar componente `SignatureCanvas.tsx`:
- Canvas HTML5 para dibujar firma con mouse/dedo
- Botón "Limpiar" para borrar y reiniciar
- Al firmar, captura como PNG base64 y se envía al backend
- Tamaño responsive (full width en móvil)
- Tinta suave con suavizado de trazo (bezier curves)

**4. Flujo de rechazo**

Si el firmante rechaza:
- Modal con textarea para motivo de rechazo (obligatorio)
- Al confirmar, el backend:
  1. Marca el firmante como `rejected`
  2. Marca la solicitud como `rejected`
  3. Registra evento con el motivo
  4. Notifica al propietario (SSE + Push + email)

**5. Seguridad del enlace público**

| Medida | Implementación |
|---|---|
| Token JWT con expiración | `exp` = fecha límite de la solicitud |
| Datos en el token | `{ requestId, signerId, email }` — mínimo necesario |
| Rate limiting | Aplicar `burstLimiter` a las rutas `/sign/*` |
| Validación de email | El email del token debe coincidir con el email del firmante en la solicitud |
| HTTPS obligatorio | Validar en producción que la URL usa HTTPS |
| IP y User-Agent | Registrar en el evento de firma para auditoría |

**6. Página de confirmación post-firma**

Después de firmar:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    ✅ Documento firmado                          │
│                                                                  │
│  Tu firma ha sido registrada correctamente.                     │
│                                                                  │
│  📄 Contrato de servicio 2026                                    │
│  Firmado el 15/04/2026 a las 10:32                              │
│                                                                  │
│  Recibirás una copia del documento firmado por email             │
│  cuando todos los firmantes hayan firmado.                       │
│                                                                  │
│  ────────────────────────────                                   │
│  Enviado mediante [Nombre de la plataforma]                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**7. Email de confirmación al firmante**

Tras firmar, enviar email al firmante confirmando su firma:
- "Has firmado correctamente [Nombre del documento]"
- "Recibirás el documento final cuando todos firmen"

#### Criterios de aceptación
- [ ] Email de solicitud de firma con plantilla HTML profesional
- [ ] Página pública funcional con visor de PDF/HTML
- [ ] Canvas de firma responsive con trazo suavizado
- [ ] Botón de firma registra: imagen, IP, user-agent, timestamp
- [ ] Flujo de rechazo con motivo obligatorio
- [ ] Token JWT con expiración y validación de email
- [ ] Rate limiting en rutas públicas
- [ ] Página de confirmación post-firma
- [ ] Email de confirmación al firmante
- [ ] Responsive (mobile-first — muchos firmantes firmarán desde el móvil)
- [ ] Funciona sin autenticación (solo token)
- [ ] Soporte dark mode en la página pública (respeta preferencia del sistema)

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelo + API)
├── FD-01 Modelo de datos: signature_request
├── FD-02 Backend API: Controlador y Router
└── FD-09 Email + Página pública del firmante

Fase 2 — Automatización
├── FD-03 Integración con proveedores de firma
├── FD-04 Motor de automatización: histórico/estados/recordatorios
└── FD-05 Sistema de alertas

Fase 3 — Frontend
├── FD-06 Modal de envío a firma
└── FD-07 Panel de estado de firmas

Fase 4 — Conexiones
└── FD-08 Documentación, CRM, Equipo, Verticales
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| FD-01 Modelo de datos | Alta | 4-5h |
| FD-02 Backend API | Alta | 5-6h |
| FD-03 Proveedores de firma | Muy Alta | 8-10h |
| FD-04 Automatización | Alta | 5-6h |
| FD-05 Alertas | Media | 3-4h |
| FD-06 Modal de envío | Alta | 5-6h |
| FD-07 Panel de estado | Alta | 5-6h |
| FD-08 Conexiones | Alta | 6-8h |
| FD-09 Email + Página pública | Muy Alta | 8-10h |
| **Total** | | **~49-61h** |

---

## Notas técnicas

### Base de datos
Todos los documentos `signature_request` se almacenan en la DB `*-documents` de CouchDB, la misma que usa `type: 'document'`. Esto permite queries eficientes cruzando documentos con sus solicitudes de firma por `documentId`.

### Sin migraciones
CouchDB no requiere migraciones. Los nuevos documentos `signature_request` se crean al vuelo. Los documentos `type: 'document'` existentes no se modifican — la solicitud de firma es un documento separado vinculado.

### Retrocompatibilidad
- Los documentos existentes siguen funcionando tal cual
- Los estados `pending_signature`, `signed`, `rejected`, `expired` ya existen en `normalizeDocumentStatus`
- Las APIs de documentos (`documentsController.js`, `documentsApi.ts`) no cambian
- El campo `signedAt` del documento se actualiza automáticamente vía sincronización

### Proveedor por defecto
Si el usuario no tiene configurado ningún proveedor de eSignature (DocuSign, Signaturit, etc.), el sistema usa el proveedor `internal`:
- Firma por canvas (dibujo de firma manuscrita)
- Sin certificado digital avanzado, pero con trazabilidad completa (IP, timestamp, email)
- Válido como firma electrónica simple (SES) bajo eIDAS
- Para firma avanzada o cualificada, el usuario debe configurar un proveedor externo

### Tokens del plugin
Las credenciales de los proveedores de eSignature se leen desde el almacenamiento de tokens del plugin (`TokensTab.tsx`). La UI para configurarlos ya existe — solo falta el backend que los consuma.

### Seguridad
- Los enlaces de firma usan JWT con expiración alineada al `expiresAt` de la solicitud
- Los datos del token son mínimos: `requestId`, `signerId`, `email`
- Las rutas públicas (`/api/sign/*`, `/sign/:token`) tienen rate limiting
- Se registra IP y User-Agent en cada firma para auditoría
- Los archivos firmados se almacenan con acceso restringido al propietario de la cuenta

### i18n
Los textos del email, la página pública y los componentes de firma deben estar disponibles en los 4 idiomas existentes: es, en, pt, fr. El idioma de la página pública se determina por:
1. Parámetro `lang` en el token JWT (preferencia del remitente)
2. Header `Accept-Language` del navegador del firmante
3. Fallback: español

### Permisos
- Crear solicitud de firma: cualquier usuario con acceso al documento
- Enviar, cancelar, reenviar: solo el creador de la solicitud o Admin/Gerente
- Ver solicitudes: el creador ve las suyas; Admin/Gerente ve todas
- Firmar: cualquier persona con token válido (sin autenticación requerida)
