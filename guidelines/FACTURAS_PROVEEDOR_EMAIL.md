# Facturas de Proveedor por Email — Diseño Técnico y Tickets

**Módulo:** Backend  
**Prioridad:** Alta  
**Fecha:** Abril 2026  
**Estado:** Implementado (Backend completo)

---

## Contexto del Proyecto

### Lo que YA existe y vamos a reutilizar

| Componente | Estado | Ruta / Referencia |
|------------|--------|-------------------|
| **Proveedores** (`type: 'supplier'`) | Implementado | `services/couchdb.js` → `buildSupplierDocument` — Incluye `name`, `cif`, `email`, `phone` |
| **Pedidos de compra** (`type: 'purchase_order'`) | Implementado | `services/couchdb.js` → `buildPurchaseOrderDocument` — Vinculado a `supplierId` |
| **OCR con GPT-4o Vision** | Implementado | `index.js` → `POST /api/ocr/scan` — Extrae JSON estructurado de facturas (emisor, receptor, líneas, importes, IVA) |
| **Motor de alertas** | Implementado | `services/alertEngine.js` → `emitAlert()` — Dedup 24h + SSE + Web Push |
| **Finanzas** (`type: 'cobro' / 'pago'`) | Implementado | `services/couchdb.js` → `buildFinanceDocument` — Con categoría, base, IVA, total |
| **Email de salida** (Resend / SMTP) | Implementado | `services/email.js` — Para notificaciones al usuario |
| **Documentos** (`type: 'document'`) | Implementado | `services/couchdb.js` → `buildDocumentRecord` — Con `fileUrl`, `mimeType` |
| **Facturas cliente** (`type: 'client_invoice'`) | Implementado | `controllers/invoicesController.js` — Modelo de referencia para la nueva entidad |

### Lo que NO existe y hay que construir

| Componente | Descripción |
|------------|-------------|
| **Lectura de email entrante (IMAP)** | No hay nada de IMAP, POP3 ni lectura de buzón |
| **Factura de proveedor** (`supplier_invoice`) | No existe como tipo de documento diferenciado |
| **Servicio de polling de emails** | No hay cron/polling para emails (solo `setInterval` para otras tareas) |
| **Matching automático de proveedor** | No hay lógica de identificación por email/CIF |
| **Cola de procesamiento** | Se usará `setInterval` siguiendo el patrón existente del proyecto |

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUJO COMPLETO                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐             │
│  │  BUZÓN   │───▶│  SERVICIO    │───▶│  EXTRACCIÓN   │             │
│  │  IMAP    │    │  POLLING     │    │  ADJUNTOS     │             │
│  └──────────┘    └──────────────┘    └───────┬───────┘             │
│                                              │                      │
│                         ┌────────────────────┤                      │
│                         ▼                    ▼                      │
│                  ┌─────────────┐     ┌──────────────┐              │
│                  │  SIN ADJUNTO│     │  PDF/IMAGEN  │              │
│                  │  → ALERTA   │     │  DETECTADO   │              │
│                  └─────────────┘     └──────┬───────┘              │
│                                             │                       │
│                                             ▼                       │
│                                     ┌──────────────┐               │
│                                     │   OCR GPT-4o │               │
│                                     │   (existente) │               │
│                                     └──────┬───────┘               │
│                                            │                        │
│                              ┌─────────────┼──────────────┐        │
│                              ▼             ▼              ▼        │
│                     ┌─────────────┐ ┌───────────┐ ┌────────────┐  │
│                     │  MATCHING   │ │ DETECCIÓN │ │ BORRADOR   │  │
│                     │  PROVEEDOR  │ │ DUPLICADO │ │ FACTURA    │  │
│                     └──────┬──────┘ └─────┬─────┘ └─────┬──────┘  │
│                            │              │              │          │
│                            ▼              ▼              ▼          │
│                     ┌───────────────────────────────────────────┐  │
│                     │         BANDEJA PENDIENTE VALIDAR         │  │
│                     │  (supplier_invoice status: pending_review) │  │
│                     └──────────────────┬────────────────────────┘  │
│                                        │                           │
│                                        ▼                           │
│                              ┌──────────────────┐                  │
│                              │  VALIDACIÓN      │                  │
│                              │  MANUAL/HUMANA   │                  │
│                              └────────┬─────────┘                  │
│                                       │                            │
│                            ┌──────────┼──────────┐                 │
│                            ▼          ▼          ▼                 │
│                     ┌──────────┐ ┌────────┐ ┌──────────┐          │
│                     │ APROBADA │ │ RECHAZ.│ │ CORREGIDA│          │
│                     └────┬─────┘ └────────┘ └────┬─────┘          │
│                          │                        │                 │
│                          ▼                        ▼                 │
│                   ┌─────────────────────────────────────┐          │
│                   │  REGISTRO EN FINANZAS (pago)        │          │
│                   │  + Propuesta de gasto y estado pago  │          │
│                   └─────────────────────────────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Datos: `supplier_invoice`

```json
{
  "_id": "sinv-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "type": "supplier_invoice",
  "user_id": "user-xxx",

  "source": "email",
  "sourceEmailId": "<message-id-imap>",
  "sourceEmailFrom": "facturacion@proveedor.com",
  "sourceEmailSubject": "Factura Enero 2026",
  "sourceEmailDate": "2026-04-14T10:30:00.000Z",

  "supplierId": "sup-xxx",
  "supplierName": "Materiales Pérez S.L.",
  "supplierCif": "B12345678",
  "supplierMatched": true,
  "supplierMatchMethod": "email",

  "invoiceNumber": "FP-2026-0042",
  "date": "2026-04-10",
  "dueDate": "2026-05-10",

  "lines": [
    {
      "description": "Cemento Portland 25kg",
      "quantity": 50,
      "unitPrice": 4.50,
      "total": 225.00
    }
  ],

  "subtotal": 225.00,
  "taxRate": 21,
  "taxAmount": 47.25,
  "total": 272.25,
  "currency": "EUR",

  "status": "pending_review",
  "paymentStatus": "unpaid",
  "proposedCategory": "materiales",
  "proposedPayMethod": "",

  "linkedPurchaseOrderId": "",
  "linkedFinanceId": "",

  "attachments": [
    {
      "filename": "factura-042.pdf",
      "mimeType": "application/pdf",
      "size": 102400,
      "couchAttachmentId": "factura-042.pdf"
    }
  ],

  "ocrRaw": {},
  "ocrConfidence": "high",

  "flags": {
    "duplicate": false,
    "duplicateOf": "",
    "noAttachment": false,
    "supplierNotFound": false,
    "ocrFailed": false,
    "manualReview": false
  },

  "reviewNotes": "",
  "reviewedBy": "",
  "reviewedAt": null,

  "createdAt": "2026-04-14T10:32:00.000Z",
  "updatedAt": "2026-04-14T10:32:00.000Z",
  "deletedAt": null
}
```

### Estados del ciclo de vida (`status`)

| Estado | Descripción |
|--------|-------------|
| `pending_review` | Recién llegada desde email, pendiente de que un humano la valide |
| `approved` | Validada por el usuario, datos correctos |
| `rejected` | Rechazada (spam, no es factura, error grave) |
| `corrected` | El usuario corrigió datos del OCR y aprobó |
| `paid` | Factura pagada (vinculada a movimiento en Finanzas) |

### Estados de pago (`paymentStatus`)

| Estado | Descripción |
|--------|-------------|
| `unpaid` | Pendiente de pago |
| `partial` | Parcialmente pagada |
| `paid` | Totalmente pagada |
| `overdue` | Vencida sin pago |

---

## Variables de Entorno Necesarias

```bash
# ─── Buzón IMAP dedicado para recepción de facturas ───
SUPPLIER_INVOICE_IMAP_HOST=imap.tudominio.com
SUPPLIER_INVOICE_IMAP_PORT=993
SUPPLIER_INVOICE_IMAP_USER=facturas@tudominio.com
SUPPLIER_INVOICE_IMAP_PASSWORD=xxxxx
SUPPLIER_INVOICE_IMAP_TLS=true

# ─── Base de datos CouchDB para facturas proveedor ───
SUPPLIER_INVOICES_DB=supplier-invoices

# ─── Configuración del polling ───
SUPPLIER_INVOICE_POLL_INTERVAL_MS=300000     # 5 minutos
SUPPLIER_INVOICE_POLL_ENABLED=true

# ─── Límites de seguridad ───
SUPPLIER_INVOICE_MAX_ATTACHMENT_SIZE_MB=25
SUPPLIER_INVOICE_ALLOWED_MIME_TYPES=application/pdf,image/png,image/jpeg,image/webp
```

---

## TICKETS DE DESARROLLO

---

### TICKET 1 — Modelo de datos `supplier_invoice` en CouchDB

**Tipo:** Backend — Data Layer  
**Prioridad:** Crítica (bloqueante para todo lo demás)  
**Estimación:** 2-3 horas  
**Dependencias:** Ninguna

#### Objetivo

Crear el tipo de documento `supplier_invoice` en CouchDB con todas las funciones de construcción, sanitización y consulta, siguiendo el patrón existente de `buildInvoiceDocument`, `buildFinanceDocument`, etc.

#### Tareas

- [ ] Crear `buildSupplierInvoiceDocument(userId, data, existing)` en `services/couchdb.js`
  - ID con prefijo `sinv-{uuid}`
  - Todos los campos definidos en el modelo de datos de arriba
  - Cálculo automático de `taxAmount` y `total` a partir de `subtotal` y `taxRate`
  - Campo `source` por defecto `"email"`
- [ ] Crear `sanitizeSupplierInvoice(doc)` en `services/couchdb.js`
  - Misma filosofía defensiva que `sanitizeFinance` (valores por defecto, tipos forzados)
- [ ] Crear `normalizeSupplierInvoiceStatus(value)` con valores permitidos: `pending_review`, `approved`, `rejected`, `corrected`, `paid`
- [ ] Crear `normalizePaymentStatus(value)` con valores permitidos: `unpaid`, `partial`, `paid`, `overdue`
- [ ] Crear `getSupplierInvoicesDbName()` que lea de `SUPPLIER_INVOICES_DB` o use default `supplier-invoices`
- [ ] Crear `listSupplierInvoicesByUser(req, userId)` — filtrar por `type === 'supplier_invoice'`, excluir `deletedAt`, ordenar por fecha descendente
- [ ] Crear `findDuplicateSupplierInvoice(req, userId, invoiceNumber, supplierId, total)` — buscar facturas existentes con mismo número + proveedor + importe para detección de duplicados

#### Criterios de aceptación

- El documento se crea correctamente con todos los campos
- Los campos numéricos siempre son números (nunca strings)
- Las fechas son ISO strings
- `sanitize` nunca retorna `undefined` en ningún campo
- La detección de duplicados funciona por combinación de `invoiceNumber` + `supplierId` + `total`

---

### TICKET 2 — API REST para Facturas de Proveedor (CRUD)

**Tipo:** Backend — API  
**Prioridad:** Crítica  
**Estimación:** 4-5 horas  
**Dependencias:** Ticket 1

#### Objetivo

Crear el router y controller completo para gestión de facturas de proveedor, con todas las operaciones CRUD y acciones específicas del flujo (aprobar, rechazar, vincular a finanzas).

#### Tareas

##### Router: `routers/supplierInvoiceRouter.js`

- [ ] `GET /:userId` — Listar facturas de proveedor del usuario
  - Query params opcionales: `?status=pending_review`, `?supplierId=xxx`, `?from=2026-01-01&to=2026-04-14`
- [ ] `GET /:userId/:invoiceId` — Obtener una factura específica
- [ ] `POST /:userId` — Crear factura de proveedor manual (no desde email)
- [ ] `PUT /:userId/:invoiceId` — Actualizar factura (editar datos del OCR, corregir campos)
- [ ] `DELETE /:userId/:invoiceId` — Soft delete (`deletedAt`)
- [ ] `POST /:userId/:invoiceId/approve` — Aprobar factura: cambiar `status` a `approved`
- [ ] `POST /:userId/:invoiceId/reject` — Rechazar factura: cambiar `status` a `rejected`
- [ ] `POST /:userId/:invoiceId/link-finance` — Crear movimiento `pago` en Finanzas a partir de la factura y vincular con `linkedFinanceId`
- [ ] `GET /:userId/stats` — Estadísticas: total pendientes, total aprobadas, importe total por estado

##### Controller: `controllers/supplierInvoiceController.js`

- [ ] Validar que la cuenta existe (`findAccountByUserId`)
- [ ] Validar campos requeridos en creación/edición
- [ ] Operación `approve`: verificar que el status actual es `pending_review` o `corrected`
- [ ] Operación `link-finance`: crear automáticamente un `buildFinanceDocument` de tipo `pago` con los datos de la factura del proveedor
- [ ] Log de actividad (`logAccountActivity`) en cada operación

##### Montar en `index.js`

- [ ] Importar `supplierInvoiceRouter`
- [ ] Montar en `/api/supplier-invoices`
- [ ] Proteger con `requireAuth`

#### Criterios de aceptación

- Todas las rutas devuelven JSON consistente `{ ok: true, data: ... }` o `{ error: "..." }`
- Soft delete funciona (no elimina físicamente)
- `approve` solo funciona desde estados válidos
- `link-finance` crea el movimiento y actualiza `linkedFinanceId` en la factura
- Filtros por fecha, estado y proveedor funcionan correctamente

---

### TICKET 3 — Servicio IMAP: Conexión y Lectura de Emails Entrantes

**Tipo:** Backend — Infraestructura  
**Prioridad:** Crítica  
**Estimación:** 5-6 horas  
**Dependencias:** Ninguna (puede ir en paralelo con Tickets 1 y 2)

#### Objetivo

Implementar un servicio de lectura de emails entrantes vía IMAP, capaz de conectarse a un buzón dedicado, leer nuevos mensajes y extraer información básica + adjuntos.

#### Dependencia NPM a instalar

```bash
npm install imapflow mailparser
```

- **`imapflow`**: Cliente IMAP moderno, basado en Promises, con soporte TLS nativo
- **`mailparser`**: Parser de emails MIME (extrae headers, body, adjuntos)

#### Tareas

##### Servicio: `services/imapService.js`

- [ ] Función `createImapClient()` — Crea y devuelve un cliente IMAP con las credenciales de las variables de entorno
  - Host, port, user, password, tls desde `SUPPLIER_INVOICE_IMAP_*`
  - Timeout de conexión configurable (30s default)
  - Logger integrado con el `logger` existente del proyecto
- [ ] Función `connectAndFetchNewEmails()` — Flujo principal:
  1. Conectar al buzón IMAP
  2. Abrir carpeta INBOX
  3. Buscar emails no leídos (`UNSEEN`)
  4. Para cada email:
     - Parsear con `mailparser` (headers, from, subject, date, body text/html)
     - Extraer adjuntos (`attachments` array)
     - Filtrar adjuntos por MIME type permitido (PDF, PNG, JPEG, WEBP)
     - Filtrar adjuntos por tamaño máximo (`SUPPLIER_INVOICE_MAX_ATTACHMENT_SIZE_MB`)
     - Devolver objeto estructurado:
       ```js
       {
         messageId: '<...>',
         from: 'facturacion@proveedor.com',
         fromName: 'Materiales Pérez',
         subject: 'Factura Enero 2026',
         date: '2026-04-14T10:30:00.000Z',
         textBody: '...',
         htmlBody: '...',
         attachments: [
           { filename: 'factura.pdf', mimeType: 'application/pdf', content: Buffer, size: 102400 }
         ],
         hasValidAttachments: true,
         uid: 12345
       }
       ```
  5. Marcar emails procesados como leídos (`\Seen`)
  6. Cerrar conexión limpiamente
- [ ] Función `testImapConnection()` — Test de conectividad (para health-check y configuración inicial)
  - Conectar, listar carpetas, desconectar
  - Devolver `{ ok: true, folders: [...], totalMessages: N }` o `{ ok: false, error: '...' }`
- [ ] Manejo de errores robusto:
  - Reconexión automática si falla la conexión
  - Log claro de errores IMAP (credenciales incorrectas, timeout, certificado TLS)
  - No romper el polling si un email individual falla de parsear

##### Endpoint de test: `POST /api/supplier-invoices/test-imap`

- [ ] Solo accesible por admin
- [ ] Ejecuta `testImapConnection()` y devuelve resultado
- [ ] Útil para verificar que las credenciales están bien configuradas

#### Criterios de aceptación

- Se conecta correctamente a un buzón IMAP con TLS
- Extrae correctamente emails con 0, 1 o múltiples adjuntos
- Filtra por MIME types permitidos (ignora .exe, .zip, etc.)
- Marca como leídos solo los emails que se procesaron exitosamente
- No crashea si un email tiene formato malformado
- `testImapConnection` devuelve feedback útil sobre el estado de la conexión

---

### TICKET 4 — Motor de Procesamiento: Email → OCR → Borrador de Factura

**Tipo:** Backend — Core Business Logic  
**Prioridad:** Crítica  
**Estimación:** 6-8 horas  
**Dependencias:** Tickets 1, 2 y 3

#### Objetivo

Crear el servicio central que orquesta todo el pipeline: recibe emails parseados del servicio IMAP, extrae adjuntos, los envía al OCR, hace matching de proveedor, detecta duplicados, y crea borradores de factura de proveedor.

#### Tareas

##### Servicio: `services/supplierInvoiceProcessor.js`

- [ ] Función principal `processIncomingEmails(userId)`:
  1. Llamar a `connectAndFetchNewEmails()` del servicio IMAP
  2. Para cada email recibido, ejecutar `processSingleEmail(userId, email)`
  3. Retornar resumen: `{ processed: N, created: N, alerts: N, errors: N }`

- [ ] Función `processSingleEmail(userId, email)`:
  1. **Verificar adjuntos** — Si `email.hasValidAttachments === false`:
     - Emitir alerta `email_sin_adjunto` (ver Ticket 6)
     - Crear registro `supplier_invoice` con `flags.noAttachment = true` y status `pending_review`
     - Retornar early
  2. **Para cada adjunto válido**:
     - Convertir a base64
     - Llamar al **OCR existente** (`/api/ocr/scan` interno o reutilizar la función directamente)
     - Parsear respuesta OCR

- [ ] Función `matchSupplier(req, userId, ocrData, emailFrom)`:
  1. **Match por email**: Buscar en proveedores existentes uno cuyo `email` coincida con `emailFrom`
  2. **Match por CIF**: Si el OCR extrajo un CIF del emisor, buscar en proveedores por `cif`
  3. **Match por nombre**: Si el OCR extrajo nombre del emisor, buscar por coincidencia parcial en `name`
  4. Si no hay match → `supplierMatched: false`, `flags.supplierNotFound: true`
  5. Si hay match → rellenar `supplierId`, `supplierName`, `supplierCif`, `supplierMatchMethod`

- [ ] Función `detectDuplicate(req, userId, ocrData)`:
  1. Usar `findDuplicateSupplierInvoice` del Ticket 1
  2. Buscar por `invoiceNumber` + `supplierId` + `total`
  3. Si existe duplicado → `flags.duplicate: true`, `flags.duplicateOf: <id existente>`

- [ ] Función `proposeExpenseAndPayment(ocrData, supplier)`:
  1. Proponer **categoría de gasto** basada en:
     - Categoría del proveedor (`supplier.category`)
     - Palabras clave en las líneas de la factura (materiales, servicios, alquiler, etc.)
  2. Proponer **estado de pago** basada en:
     - `supplier.paymentTerms` (ej: "30 días" → calcular si ya venció)
     - Fecha de vencimiento de la factura si el OCR la detectó
  3. Retornar `{ proposedCategory, proposedPayMethod, paymentStatus }`

- [ ] Función `createDraftInvoice(req, userId, email, ocrData, matchResult, duplicateResult, proposal)`:
  1. Guardar el adjunto en CouchDB como attachment del documento
  2. Construir el documento `supplier_invoice` completo con:
     - Datos del email (`source`, `sourceEmailId`, `sourceEmailFrom`, etc.)
     - Datos del OCR (`invoiceNumber`, `date`, `lines`, importes, etc.)
     - Resultado del matching (`supplierId`, `supplierMatched`, etc.)
     - Flags de alertas (`duplicate`, `supplierNotFound`, etc.)
     - Propuesta de gasto y pago
     - Datos raw del OCR en `ocrRaw`
     - `status: 'pending_review'`
  3. Guardar en CouchDB
  4. Retornar documento creado

- [ ] Función `linkToPurchaseOrder(req, userId, invoiceData)`:
  1. Si se detectó un proveedor, buscar pedidos de compra pendientes de ese proveedor
  2. Si hay un pedido cuyo importe coincida (con margen del 5%) → proponer vinculación
  3. Guardar `linkedPurchaseOrderId` en la factura

#### Criterios de aceptación

- Un email con PDF genera una factura borrador con datos del OCR
- Un email sin adjunto genera una factura con `flags.noAttachment` y una alerta
- Un proveedor se identifica correctamente por email, CIF o nombre
- Las facturas duplicadas se marcan como tal y se notifican
- La categoría de gasto se propone automáticamente
- El estado de pago se calcula correctamente según fechas de vencimiento
- Si el OCR falla, la factura se crea igualmente con `flags.ocrFailed = true`

---

### TICKET 5 — Servicio de Polling Periódico (Scheduler)

**Tipo:** Backend — Infraestructura  
**Prioridad:** Alta  
**Estimación:** 2-3 horas  
**Dependencias:** Ticket 4

#### Objetivo

Crear el servicio que ejecuta periódicamente la lectura de emails y el procesamiento de facturas, siguiendo el patrón existente del proyecto (`setInterval` en `index.js`).

#### Tareas

##### Servicio: `services/supplierInvoiceScheduler.js`

- [ ] Función `startSupplierInvoicePolling()`:
  1. Verificar que las variables IMAP están configuradas (`SUPPLIER_INVOICE_IMAP_HOST`, etc.)
  2. Si no están configuradas → log info y retornar sin error (feature deshabilitada)
  3. Si `SUPPLIER_INVOICE_POLL_ENABLED !== 'true'` → log info y retornar
  4. Ejecutar primera lectura tras `STARTUP_DELAY_MS` (20 segundos, como hace el alertEngine)
  5. Programar polling con `setInterval` cada `SUPPLIER_INVOICE_POLL_INTERVAL_MS` (default 5 min)
  6. Cada ejecución:
     - Obtener todos los `userId` activos que tengan IMAP configurado (o usar uno global)
     - Ejecutar `processIncomingEmails(userId)`
     - Log del resultado (procesados, creados, alertas, errores)
  7. Guard de concurrencia: no ejecutar si la ejecución anterior aún está en marcha

- [ ] Función `stopSupplierInvoicePolling()`:
  - Limpiar el `setInterval`
  - Desconectar cliente IMAP si está activo

##### Integración en `index.js`

- [ ] Importar `startSupplierInvoicePolling`
- [ ] Llamar junto a los otros schedulers existentes (`startAlertEngine`, `startBackupScheduler`, etc.)
- [ ] Seguir el mismo patrón:
  ```js
  startSupplierInvoicePolling();
  ```

##### Endpoint manual: `POST /api/supplier-invoices/:userId/poll-now`

- [ ] Permite forzar una lectura inmediata de emails sin esperar al polling
- [ ] Solo accesible por admin/gerente
- [ ] Retorna el resultado del procesamiento

#### Criterios de aceptación

- El polling arranca automáticamente al iniciar el servidor (si está configurado)
- No arranca si faltan las variables de entorno IMAP (falla silenciosamente)
- Respeta el intervalo configurado
- No ejecuta dos veces en paralelo (mutex/lock)
- Se puede forzar ejecución manual desde la API
- Los logs muestran claramente qué se procesó en cada ejecución

---

### TICKET 6 — Sistema de Alertas Específicas

**Tipo:** Backend — Alertas  
**Prioridad:** Alta  
**Estimación:** 3-4 horas  
**Dependencias:** Tickets 1 y 4

#### Objetivo

Integrar las alertas del módulo de facturas de proveedor en el motor de alertas existente (`alertEngine.js`), reutilizando `emitAlert()` con SSE + Web Push.

#### Alertas a implementar

##### 1. Factura Duplicada (`supplier_invoice_duplicate`)

- **Cuándo:** El procesador detecta una factura con mismo número + proveedor + total que una existente
- **Nivel:** `warning`
- **Categoría:** `supplier_invoice`
- **Título:** `Posible factura duplicada`
- **Mensaje:** `La factura {invoiceNumber} de {supplierName} por {total}€ podría estar duplicada. Revisa la bandeja de facturas pendientes.`
- **Dedup key:** `dup:{invoiceNumber}:{supplierId}`
- **Ruta de navegación:** `/saas/facturas-proveedor/{invoiceId}`
- **Metadata:** `{ duplicateOf: '<id factura original>', invoiceNumber, supplierName, total }`

##### 2. Email sin Adjunto (`supplier_invoice_no_attachment`)

- **Cuándo:** Llega un email al buzón de facturas pero no tiene PDF ni imagen adjunta
- **Nivel:** `info`
- **Categoría:** `supplier_invoice`
- **Título:** `Email recibido sin factura adjunta`
- **Mensaje:** `Se recibió un email de {fromEmail} con asunto "{subject}" pero no contenía ningún archivo PDF o imagen adjunta.`
- **Dedup key:** `noattach:{messageId}`
- **Ruta:** `/saas/facturas-proveedor`
- **Metadata:** `{ fromEmail, subject, emailDate }`

##### 3. Proveedor No Identificado (`supplier_invoice_unknown_supplier`)

- **Cuándo:** No se pudo hacer match del emisor con ningún proveedor registrado
- **Nivel:** `warning`
- **Categoría:** `supplier_invoice`
- **Título:** `Proveedor no identificado`
- **Mensaje:** `Se recibió una factura desde {fromEmail} pero no se encontró un proveedor registrado con ese email, CIF ({cif}) o nombre ({emitterName}). Revisa y asigna manualmente.`
- **Dedup key:** `unknown:{fromEmail}:{invoiceNumber}`
- **Ruta:** `/saas/facturas-proveedor/{invoiceId}`
- **Metadata:** `{ fromEmail, emitterName, cif, ocrEmitter }`

##### 4. Error de OCR (`supplier_invoice_ocr_failed`)

- **Cuándo:** El OCR no pudo extraer datos del documento (respuesta vacía o error)
- **Nivel:** `warning`
- **Categoría:** `supplier_invoice`
- **Título:** `Error al leer factura automáticamente`
- **Mensaje:** `No se pudieron extraer los datos de una factura adjunta en el email de {fromEmail}. El documento requiere revisión manual.`
- **Dedup key:** `ocrfail:{messageId}:{filename}`
- **Ruta:** `/saas/facturas-proveedor/{invoiceId}`
- **Metadata:** `{ fromEmail, filename, errorReason }`

##### 5. Factura Vencida sin Pagar (`supplier_invoice_overdue`)

- **Cuándo:** Regla periódica (en el polling del alertEngine) — facturas aprobadas con `dueDate` pasada y `paymentStatus !== 'paid'`
- **Nivel:** `critical`
- **Categoría:** `supplier_invoice`
- **Título:** `Factura de proveedor vencida`
- **Mensaje:** `La factura {invoiceNumber} de {supplierName} por {total}€ venció el {dueDate} y está sin pagar.`
- **Dedup key:** `overdue:{invoiceId}`
- **Ruta:** `/saas/facturas-proveedor/{invoiceId}`
- **Metadata:** `{ invoiceNumber, supplierName, total, dueDate, daysPastDue }`

#### Tareas

- [ ] Crear función `emitSupplierInvoiceAlert(userId, alertType, data)` en `services/supplierInvoiceProcessor.js`
  - Wrapper que llama a `emitAlert()` con la configuración correcta según el tipo
- [ ] Integrar las alertas 1-4 en el flujo de `processSingleEmail` del Ticket 4
- [ ] Crear regla periódica `checkOverdueSupplierInvoices(userId)` para la alerta 5
- [ ] Registrar la regla de vencimiento en el `alertEngine.js` existente, dentro del ciclo principal de reglas
- [ ] Añadir configuración de umbrales en `getAlertConfig(account)`:
  - `supplierInvoiceDuplicateEnabled` (default `true`)
  - `supplierInvoiceNoAttachmentEnabled` (default `true`)
  - `supplierInvoiceUnknownSupplierEnabled` (default `true`)
  - `supplierInvoiceOcrFailedEnabled` (default `true`)
  - `supplierInvoiceOverdueEnabled` (default `true`)

#### Criterios de aceptación

- Cada tipo de alerta se genera correctamente en el escenario correspondiente
- Las alertas respetan la deduplicación 24h del motor existente
- Se reciben por SSE (in-app) y Web Push
- El usuario puede desactivar cada tipo de alerta individualmente desde su configuración
- Las alertas incluyen ruta de navegación directa a la factura afectada

---

### TICKET 7 — Vinculación con Módulo de Finanzas

**Tipo:** Backend — Integración  
**Prioridad:** Media-Alta  
**Estimación:** 3-4 horas  
**Dependencias:** Tickets 1 y 2

#### Objetivo

Conectar las facturas de proveedor aprobadas con el módulo de Finanzas existente, creando movimientos de tipo `pago` automáticamente y manteniendo la trazabilidad bidireccional.

#### Tareas

- [ ] Función `createFinanceFromSupplierInvoice(req, userId, supplierInvoice)`:
  1. Construir un `buildFinanceDocument` de tipo `pago` con:
     - `companyName`: nombre del proveedor
     - `concept`: `Factura {invoiceNumber} - {supplierName}`
     - `reference`: `invoiceNumber`
     - `category`: `proposedCategory` de la factura
     - `amountBase`: `subtotal`
     - `taxRate`: `taxRate`
     - `date`: fecha de la factura
     - `notes`: referencia a la factura de proveedor
  2. Guardar en la BD de finanzas
  3. Actualizar la factura de proveedor con `linkedFinanceId`
  4. Retornar ambos documentos actualizados

- [ ] Función `syncPaymentStatus(req, userId, supplierInvoiceId)`:
  - Si hay `linkedFinanceId`, verificar el estado del pago en Finanzas
  - Actualizar `paymentStatus` de la factura de proveedor en consecuencia

- [ ] Función `getSupplierInvoiceSummary(req, userId)`:
  - Estadísticas para el dashboard:
    - Total facturas pendientes de revisión
    - Total facturas aprobadas pendientes de pago
    - Importe total por pagar
    - Importe total vencido
    - Facturas procesadas este mes
  - Retornar como JSON para consumo del frontend

- [ ] Vincular factura de proveedor con pedido de compra cuando coincida:
  - Buscar `purchase_order` del mismo proveedor con importe similar (margen ±5%)
  - Si hay match, guardar `linkedPurchaseOrderId`
  - Log en actividad del pedido de compra

#### Criterios de aceptación

- Al aprobar una factura, se puede crear automáticamente un movimiento `pago` en Finanzas
- El movimiento de finanzas tiene referencia cruzada a la factura de proveedor
- Las estadísticas reflejan correctamente los estados y montos
- La vinculación con pedidos de compra funciona por proveedor + importe aproximado

---

### TICKET 8 — Almacenamiento de Adjuntos en CouchDB

**Tipo:** Backend — Storage  
**Prioridad:** Alta  
**Estimación:** 2-3 horas  
**Dependencias:** Ticket 1

#### Objetivo

Gestionar el almacenamiento de los archivos adjuntos de las facturas de proveedor (PDFs, imágenes) usando el sistema de attachments de CouchDB existente.

#### Tareas

- [ ] Función `saveAttachmentToInvoice(req, invoiceId, filename, buffer, mimeType)`:
  1. Subir el buffer como CouchDB attachment al documento de la factura
  2. Actualizar el array `attachments` del documento con metadata del archivo
  3. Retornar URL interna del attachment

- [ ] Función `getAttachmentFromInvoice(req, invoiceId, filename)`:
  1. Obtener el attachment de CouchDB
  2. Retornar stream/buffer + headers correctos (`Content-Type`, `Content-Disposition`)

- [ ] Endpoint `GET /api/supplier-invoices/:userId/:invoiceId/attachment/:filename`:
  - Descarga directa del adjunto
  - Headers para visualización inline en navegador (PDFs) o descarga

- [ ] Endpoint `POST /api/supplier-invoices/:userId/:invoiceId/attachment`:
  - Subida manual de adjunto (para cuando el usuario quiere añadir un documento extra)
  - Validar MIME type y tamaño máximo

- [ ] Función `extractAndStoreAttachments(req, invoiceId, emailAttachments)`:
  - Recibe los adjuntos del parser de email
  - Los guarda uno a uno en el documento CouchDB
  - Actualiza el array `attachments` del `supplier_invoice`

#### Criterios de aceptación

- Los PDFs se almacenan correctamente en CouchDB como attachments
- Se pueden descargar/visualizar desde la API
- El tamaño máximo se respeta (rechazar archivos > 25MB)
- Solo se aceptan MIME types permitidos
- Los adjuntos sobreviven a actualizaciones del documento (no se borran al hacer PUT)

---

### TICKET 9 — Re-procesamiento OCR Manual

**Tipo:** Backend — Feature  
**Prioridad:** Media  
**Estimación:** 2-3 horas  
**Dependencias:** Tickets 1, 2 y 8

#### Objetivo

Permitir que el usuario pueda re-ejecutar el OCR sobre un adjunto de una factura de proveedor si la lectura automática falló o fue imprecisa.

#### Tareas

- [ ] Endpoint `POST /api/supplier-invoices/:userId/:invoiceId/rescan`:
  1. Obtener la factura y su adjunto principal
  2. Convertir el adjunto a base64
  3. Llamar al OCR existente (reutilizar la lógica de `/api/ocr/scan`)
  4. Actualizar los campos de la factura con los nuevos datos del OCR
  5. Guardar `ocrRaw` actualizado
  6. No sobrescribir campos que el usuario ya haya editado manualmente (solo campos que sigan en `null` o con valor del OCR anterior)
  7. Re-ejecutar matching de proveedor con los nuevos datos
  8. Re-ejecutar detección de duplicados
  9. Retornar factura actualizada

- [ ] Endpoint `POST /api/supplier-invoices/:userId/:invoiceId/scan-new`:
  - Recibe un `imageBase64` nuevo (el usuario sube otra foto/scan del documento)
  - Reemplaza el adjunto existente
  - Ejecuta OCR completo y actualiza la factura

#### Criterios de aceptación

- El re-escaneo actualiza correctamente los datos de la factura
- Los campos editados manualmente NO se sobrescriben
- El matching de proveedor se recalcula con los datos nuevos
- Funciona tanto con PDFs como con imágenes

---

### TICKET 10 — Configuración del Módulo por Usuario

**Tipo:** Backend — Settings  
**Prioridad:** Media  
**Estimación:** 2-3 horas  
**Dependencias:** Ticket 5

#### Objetivo

Permitir que cada usuario/cuenta configure el comportamiento del módulo de facturas de proveedor desde su panel de ajustes.

#### Tareas

- [ ] Añadir campo `supplierInvoiceConfig` al documento de cuenta en CouchDB:
  ```json
  {
    "supplierInvoiceConfig": {
      "enabled": true,
      "imapHost": "",
      "imapPort": 993,
      "imapUser": "",
      "imapPassword": "",
      "imapTls": true,
      "pollIntervalMinutes": 5,
      "autoCreateFinance": false,
      "defaultCategory": "proveedores",
      "defaultPaymentTermsDays": 30,
      "maxAttachmentSizeMb": 25,
      "allowedMimeTypes": ["application/pdf", "image/png", "image/jpeg"],
      "alertConfig": {
        "duplicateEnabled": true,
        "noAttachmentEnabled": true,
        "unknownSupplierEnabled": true,
        "ocrFailedEnabled": true,
        "overdueEnabled": true
      }
    }
  }
  ```

- [ ] Endpoint `GET /api/supplier-invoices/:userId/config` — Obtener configuración actual
- [ ] Endpoint `PUT /api/supplier-invoices/:userId/config` — Actualizar configuración
  - Validar que el host IMAP no está vacío si `enabled: true`
  - Validar que el puerto es un número válido
  - Validar que el intervalo de polling es >= 1 minuto
  - No guardar la contraseña IMAP en texto plano en la respuesta GET (enmascarar)

- [ ] Endpoint `POST /api/supplier-invoices/:userId/config/test-connection` — Probar conexión IMAP con la config guardada
  - Usar `testImapConnection()` del Ticket 3
  - Retornar resultado de la prueba

- [ ] Modificar `startSupplierInvoicePolling()` (Ticket 5) para que:
  - Lea la configuración de cada usuario activo
  - Solo haga polling para usuarios con `enabled: true` y credenciales IMAP válidas
  - Use el intervalo personalizado de cada usuario

#### Criterios de aceptación

- Cada usuario puede configurar sus propias credenciales IMAP
- La contraseña IMAP se guarda encriptada o al menos no se expone en GET
- El test de conexión da feedback claro (éxito, error de credenciales, timeout, etc.)
- El polling respeta la configuración individual de cada usuario
- Un usuario puede desactivar el módulo sin afectar a otros

---

## Orden de Implementación Recomendado

```
FASE 1 — CIMIENTOS (Semana 1)
├─ Ticket 1: Modelo de datos                    [2-3h]  ◀── Primero
├─ Ticket 3: Servicio IMAP                      [5-6h]  ◀── En paralelo
└─ Ticket 2: API REST CRUD                      [4-5h]  ◀── Tras Ticket 1

FASE 2 — CORE (Semana 2)
├─ Ticket 8: Almacenamiento adjuntos            [2-3h]
├─ Ticket 4: Motor de procesamiento             [6-8h]  ◀── El más complejo
└─ Ticket 5: Scheduler/Polling                  [2-3h]

FASE 3 — INTELIGENCIA (Semana 3)
├─ Ticket 6: Sistema de alertas                 [3-4h]
├─ Ticket 7: Vinculación con Finanzas           [3-4h]
└─ Ticket 9: Re-procesamiento OCR               [2-3h]

FASE 4 — CONFIGURACIÓN (Semana 3-4)
└─ Ticket 10: Configuración por usuario         [2-3h]

──────────────────────────────────────────────────
TOTAL ESTIMADO: 32-42 horas (~4-5 días efectivos)
```

---

## Diagrama de Dependencias entre Tickets

```
  ┌──────────┐
  │ Ticket 1 │ Modelo de datos
  │ (CouchDB)│
  └────┬─────┘
       │
       ├────────────────┬────────────────┐
       ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Ticket 2 │    │ Ticket 8 │    │ Ticket 6 │
  │ (API)    │    │ (Storage)│    │ (Alertas)│
  └────┬─────┘    └────┬─────┘    └──────────┘
       │               │                ▲
       │               │                │
       ▼               ▼                │
  ┌──────────┐    ┌──────────┐         │
  │ Ticket 7 │    │ Ticket 3 │◄────────┘
  │(Finanzas)│    │ (IMAP)   │
  └──────────┘    └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
                  │ Ticket 4 │ Motor de procesamiento
                  │ (CORE)   │◄── Ticket 1 + 3 + 8
                  └────┬─────┘
                       │
               ┌───────┼───────┐
               ▼       ▼       ▼
          ┌────────┐ ┌────┐ ┌──────────┐
          │Ticket 5│ │T. 6│ │ Ticket 9 │
          │(Sched.)│ │    │ │(Re-OCR)  │
          └────┬───┘ └────┘ └──────────┘
               │
               ▼
          ┌──────────┐
          │Ticket 10 │
          │ (Config) │
          └──────────┘
```

---

## Checklist General del Módulo

- [ ] Variables de entorno documentadas en `.env.example`
- [ ] Dependencias NPM instaladas (`imapflow`, `mailparser`)
- [ ] Modelo de datos implementado y testeable
- [ ] API REST completa con autenticación
- [ ] Servicio IMAP funcional con test de conexión
- [ ] Pipeline completo email → OCR → borrador → bandeja
- [ ] Polling automático con guard de concurrencia
- [ ] 5 tipos de alertas integradas en alertEngine
- [ ] Vinculación bidireccional con Finanzas
- [ ] Almacenamiento de adjuntos en CouchDB
- [ ] Re-procesamiento OCR disponible
- [ ] Configuración por usuario
- [ ] Logs completos en cada paso del pipeline
- [ ] Errores manejados sin romper el servidor

---

**Documento creado:** Abril 2026  
**Versión:** 1.0  
**Proyecto:** Vertial — Módulo de Facturas de Proveedor por Email
