# FACTURAS PROVEEDOR — Página Completa

**Tipo:** Página  
**URL objetivo:** `/saas/compras-stock/facturas-proveedor`  
**URL actual:** `/saas/supplier-billing`  
**Fecha:** 14 abril 2026  
**Estado:** Planificación

---

## Análisis del estado actual

### Lo que YA existe

| Capa | Archivo | Qué hace | Limitaciones |
|------|---------|----------|--------------|
| **Backend — modelo** | `services/couchdb.js` → `buildPurchaseInvoiceDocument` | Doc CouchDB `type: 'purchase_invoice'` con invoiceNumber, supplier, dates, lines, totals, status, OCR, linked PO, cost center | No tiene campo `validatedAt`, `validatedBy`, `pdfUrl`, `documentId`, `linkedExpenseId`, `linkedTaxEntryId`. Status solo `pending`/`paid` |
| **Backend — CRUD** | `controllers/deliveryController.js` → `create/update/list/removePurchaseInvoice` | CRUD completo con soft delete | No genera gasto ni impuesto soportado al crear/validar. No detecta duplicados. No adjunta PDF como attachment |
| **Backend — rutas** | `routers/deliveryRouter.js` → `/api/delivery/invoices/:userId` | GET, POST, PUT, DELETE | Sin endpoint de validación, ni de duplicados, ni de generación automática de gasto/impuesto |
| **Backend — alertas** | `services/alertEngine.js` → `checkOverdueInvoices`, `checkHighPayables` | Alerta si factura vencida (dueDate pasada y no pagada). Alerta si deuda total alta | No hay alerta de duplicado, ni de pendiente validar, ni de factura sin documento |
| **Backend — OCR** | `index.js` → `POST /api/ocr/scan` | OpenAI GPT-4o con visión, soporta imagen y PDF (pdftoppm) | El PDF se guarda como base64 inline en el documento, no como adjunto ni URL persistente |
| **Frontend — página** | `src/app/pages/saas/SupplierBillingPage.tsx` | Página completa: modal OCR/manual, KPIs (total, pendiente, pagada, importe), filtros (mes, centro coste, proveedor), tabla con acciones, CSV export, comparativa pedido-factura | Solo toggle `pending`↔`paid`. No hay tab "pendientes validar". No hay PDF viewer. No enlaza con documentos ni finanzas |
| **Frontend — API** | `src/app/lib/deliveryApi.ts` | `PurchaseInvoice` interface, CRUD requests | No expone `validationStatus`, ni `pdfUrl`, ni `linkedExpenseId`, ni `linkedTaxEntryId`, ni `linkedDocumentId` |
| **Frontend — ruta** | `routes.tsx` → `supplier-billing` | Monta `SupplierBillingPage` en `/saas/supplier-billing` | La URL objetivo es `/saas/compras-stock/facturas-proveedor` |
| **Frontend — sidebar** | `Sidebar.tsx` | Incluye enlace a `supplier-billing` en grupo catálogo/proveedores | Debe apuntar a la nueva ruta |
| **Finanzas** | `IncomeExpensesPage.tsx`, `financeApi.ts` | Movimientos financieros con `createFinanceMovementInCouch` | Sin referencia a `purchase_invoice`. No se genera gasto automático desde factura |
| **Impuestos** | `TaxesPage.tsx` | Libro IVA construido desde movimientos financieros (`buildVatBook`) | IVA soportado sale de gastos en finanzas, no de facturas de proveedor |
| **Documentos** | `DocumentsPage.tsx` | Gestión de documentos con categorías | Sin vinculación a facturas de proveedor |

### Lo que FALTA

1. **Flujo de validación** con estados: `pending_validation` → `validated` → `paid` / `pending_payment`
2. **Adjunto PDF** como archivo real (URL persistente), no solo base64 inline
3. **Generación automática de gasto** en Finanzas al validar factura
4. **Generación automática de impuesto soportado** (IVA soportado) al validar factura
5. **Vinculación con módulo de Documentos** (crear/enlazar documento desde factura)
6. **Alerta de factura duplicada** (mismo proveedor + mismo número de factura + mismo importe)
7. **Alerta de factura pendiente validar** (llevan X días sin validarse)
8. **Alerta de factura sin documento** (factura validada sin PDF adjunto)
9. **Ruta actualizada** a `/saas/compras-stock/facturas-proveedor`
10. **Tabs de estado** ampliados: Todas | Pendientes validar | Validadas | Pagadas | Pendientes pago | Vencidas

---

## TICKETS

---

### TICKET 1 — Backend: Ampliar modelo `purchase_invoice` con nuevos campos

**Prioridad:** Alta  
**Esfuerzo:** Medio (1h)  
**Módulo:** Backend → `services/couchdb.js`

#### Objetivo
Añadir los campos necesarios para soportar el flujo de validación, PDF adjunto, y vinculaciones con Finanzas y Documentos.

#### Cambios requeridos

**Archivo: `services/couchdb.js` → función `buildPurchaseInvoiceDocument`**

Añadir estos campos al documento construido (después de `entryMethod`):

```js
// Flujo de validación
validationStatus: String(data.validationStatus || existing?.validationStatus || 'pending_validation'),
validatedAt: data.validatedAt || existing?.validatedAt || '',
validatedBy: data.validatedBy || existing?.validatedBy || '',

// PDF adjunto
pdfUrl: data.pdfUrl || existing?.pdfUrl || '',
pdfFilename: data.pdfFilename || existing?.pdfFilename || '',

// Vinculación con Documentos
linkedDocumentId: data.linkedDocumentId || existing?.linkedDocumentId || '',

// Vinculación con Finanzas (gasto generado)
linkedExpenseId: data.linkedExpenseId || existing?.linkedExpenseId || '',

// Vinculación con Impuestos (IVA soportado generado)
linkedTaxEntryId: data.linkedTaxEntryId || existing?.linkedTaxEntryId || '',
```

**Archivo: `services/couchdb.js` → función `sanitizePurchaseInvoice`**

Añadir los mismos campos al objeto retornado para que la API los exponga.

#### Migración de datos existentes
No se requiere migración. Los documentos existentes sin los nuevos campos recibirán valores por defecto al ser actualizados gracias al patrón `|| existing?.field || ''`.

Los documentos existentes con `status: 'pending'` deben interpretarse como `validationStatus: 'pending_validation'` cuando el campo no exista — manejar en el controlador con fallback.

#### Criterios de aceptación
- [ ] `buildPurchaseInvoiceDocument` incluye todos los campos nuevos
- [ ] `sanitizePurchaseInvoice` expone todos los campos nuevos en la API
- [ ] Documentos existentes siguen funcionando sin errores (retrocompatibilidad)

---

### TICKET 2 — Backend: Nuevo flujo de estados con validación

**Prioridad:** Alta  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → `controllers/deliveryController.js`

#### Objetivo
Implementar la máquina de estados para facturas de proveedor:

```
              ┌─────────────────────┐
              │ pending_validation   │  (estado inicial al crear)
              └─────────┬───────────┘
                        │ acción: validar
                        ▼
              ┌─────────────────────┐
              │    validated         │  (aprobada, pendiente de pago)
              └─────────┬───────────┘
                        │
              ┌─────────┴───────────┐
              │                     │
              ▼                     ▼
  ┌───────────────────┐   ┌─────────────────┐
  │       paid        │   │ pending_payment  │  (vencida = pending_payment + dueDate pasada)
  └───────────────────┘   └─────────────────┘
```

#### Cambios requeridos

**Archivo: `controllers/deliveryController.js`**

1. **En `createPurchaseInvoice`**: forzar `status: 'pending_validation'` como estado inicial (ignorar lo que envíe el cliente), mantener `validationStatus: 'pending_validation'`.

2. **Nuevo endpoint `PUT /api/delivery/invoices/:userId/:invoiceId/validate`**:
   - Verifica que la factura esté en `pending_validation`
   - Cambia `status` a `validated` y `validationStatus` a `validated`
   - Guarda `validatedAt: new Date().toISOString()` y `validatedBy: userId`
   - **Dispara** la generación automática de gasto + impuesto soportado (TICKET 5)
   - **Dispara** la vinculación de documento si hay PDF adjunto (TICKET 6)
   - Retorna la factura actualizada

3. **En `updatePurchaseInvoice`**: el cambio de `status` a `paid` solo se permite si la factura está en `validated` o `pending_payment`. Al marcar como `paid`, guardar `paidAt`.

4. **Nuevo endpoint `PUT /api/delivery/invoices/:userId/:invoiceId/reject`**:
   - Devuelve la factura de `validated` a `pending_validation` (por si se validó por error)
   - Limpia `validatedAt`, `validatedBy`
   - Si se generó gasto/impuesto, marca como "revertido" (no borrado físico)

**Archivo: `routers/deliveryRouter.js`**

Añadir las nuevas rutas:
```js
router.put('/invoices/:userId/:invoiceId/validate', requireAuth, validatePurchaseInvoice);
router.put('/invoices/:userId/:invoiceId/reject', requireAuth, rejectPurchaseInvoice);
```

#### Criterios de aceptación
- [ ] Factura nueva siempre se crea en `pending_validation`
- [ ] Solo se puede validar una factura que esté en `pending_validation`
- [ ] Solo se puede pagar una factura que esté en `validated` o `pending_payment`
- [ ] La validación registra quién validó y cuándo
- [ ] Se puede rechazar (devolver a `pending_validation`) una factura validada
- [ ] Retrocompatibilidad: facturas existentes con `status: 'pending'` se tratan como `pending_validation`

---

### TICKET 3 — Backend: Upload de PDF y almacenamiento como adjunto

**Prioridad:** Alta  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → nuevo endpoint + servicio de archivos

#### Objetivo
Permitir subir el PDF/imagen de la factura como archivo real con URL persistente de descarga, en lugar de guardarlo solo como base64 inline en el documento.

#### Cambios requeridos

**Archivo: `controllers/deliveryController.js`** — nuevo `uploadInvoicePdf`

1. Recibe un archivo vía `multipart/form-data` (usar `multer` — ya usado en otras partes del proyecto, verificar).
2. Guarda el archivo como **CouchDB attachment** en el documento `purchase_invoice` usando `db.attachment.insert()`.
3. Genera una URL de descarga: `GET /api/delivery/invoices/:userId/:invoiceId/pdf`.
4. Actualiza el documento con `pdfUrl` (la URL relativa) y `pdfFilename`.
5. Si ya existía un PDF anterior, lo reemplaza.

**Archivo: `controllers/deliveryController.js`** — nuevo `getInvoicePdf`

1. Endpoint `GET /api/delivery/invoices/:userId/:invoiceId/pdf`
2. Lee el attachment de CouchDB y lo devuelve con el `Content-Type` correcto (`application/pdf`, `image/jpeg`, etc.)
3. Header `Content-Disposition: inline; filename="factura-XXX.pdf"` para que se pueda ver en el navegador.

**Archivo: `routers/deliveryRouter.js`**

```js
router.post('/invoices/:userId/:invoiceId/pdf', requireAuth, upload.single('file'), uploadInvoicePdf);
router.get('/invoices/:userId/:invoiceId/pdf', requireAuth, getInvoicePdf);
```

#### Notas
- Al escanear con OCR, si el archivo original es un PDF, se sube automáticamente como adjunto (además de guardarse el base64 para OCR).
- Al crear factura manual, se ofrece un botón de "Adjuntar PDF".
- El campo `pdfUrl` se usa en el frontend para mostrar un botón de "Ver PDF" y un viewer integrado.

#### Criterios de aceptación
- [ ] Se puede subir un PDF/imagen como adjunto de la factura
- [ ] Se puede descargar/visualizar el PDF desde una URL estable
- [ ] El PDF se almacena como attachment de CouchDB (no base64 inline)
- [ ] Al subir un nuevo PDF, el anterior se reemplaza
- [ ] La URL del PDF se guarda en el campo `pdfUrl` del documento
- [ ] Al escanear con OCR un PDF, se sube automáticamente como adjunto

---

### TICKET 4 — Backend: Detección de facturas duplicadas

**Prioridad:** Media  
**Esfuerzo:** Medio (1h)  
**Módulo:** Backend → `controllers/deliveryController.js` + `services/alertEngine.js`

#### Objetivo
Detectar facturas duplicadas al crear/importar, basándose en la combinación de proveedor + número de factura + importe.

#### Cambios requeridos

**Archivo: `controllers/deliveryController.js`**

1. **En `createPurchaseInvoice`**, antes de guardar:
   - Buscar facturas existentes del mismo `user_id` donde:
     - `supplierId` o `supplierName` coincida (normalizado, case-insensitive)
     - **Y** `invoiceNumber` coincida (normalizado, sin espacios, case-insensitive)
   - Si hay coincidencia: retornar `409 Conflict` con `{ duplicate: true, existingInvoice: {...} }` y un mensaje claro
   - El frontend puede ofrecer "Crear igualmente" pasando un flag `forceDuplicate: true` en el body

2. **En `createPurchaseInvoice`**, si `body.forceDuplicate === true`: permitir la creación pero marcar el documento con `duplicateWarning: true` y `duplicateOf: existingInvoiceId`.

**Archivo: `services/alertEngine.js`**

3. Nueva regla **`duplicate_invoice`**:
   - Busca documentos con `duplicateWarning: true` que no hayan sido revisados (`duplicateReviewed: false` o ausente)
   - Genera alerta `entityType: 'purchase_invoice'`, `type: 'duplicate_invoice'`
   - Ruta: `/saas/compras-stock/facturas-proveedor`
   - Configuración en cuenta: `duplicateInvoiceAlertEnabled` (default: `true`)

#### Criterios de aceptación
- [ ] Al crear factura con mismo proveedor + mismo número de factura, se retorna 409
- [ ] El usuario puede forzar la creación con `forceDuplicate: true`
- [ ] La factura forzada se marca con `duplicateWarning: true`
- [ ] El motor de alertas genera aviso para facturas con `duplicateWarning` no revisadas
- [ ] La comparación de duplicados es case-insensitive y normaliza espacios

---

### TICKET 5 — Backend: Generación automática de gasto + impuesto soportado

**Prioridad:** Alta  
**Esfuerzo:** Alto (2h)  
**Módulo:** Backend → `controllers/deliveryController.js` + `services/couchdb.js`

#### Objetivo
Al validar una factura de proveedor, generar automáticamente:
1. Un **movimiento financiero de gasto** en el módulo de Finanzas (`type: 'finance_movement'`)
2. Una **entrada de IVA soportado** para el libro fiscal

#### Cambios requeridos

**Archivo: `services/couchdb.js`** — nueva función `generateExpenseFromInvoice(userId, invoice)`

1. Crea un documento `type: 'finance_movement'` con:
   ```js
   {
     type: 'finance_movement',
     user_id: userId,
     movementType: 'expense',
     category: 'compras_proveedor',
     subcategory: invoice.supplierName,
     description: `Factura ${invoice.invoiceNumber} — ${invoice.supplierName}`,
     amount: invoice.total,
     baseAmount: invoice.subtotal,
     taxAmount: invoice.taxAmount,
     taxRate: invoice.taxRate,
     date: invoice.date,
     reference: invoice.invoiceNumber,
     linkedPurchaseInvoiceId: invoice._id,
     costCenterId: invoice.costCenterId || '',
     costCenterName: invoice.costCenterName || '',
     status: 'confirmed',
     createdAt: new Date().toISOString(),
   }
   ```
2. Retorna el `_id` del movimiento creado.

**Archivo: `services/couchdb.js`** — nueva función `generateInputTaxFromInvoice(userId, invoice)`

1. Crea un documento `type: 'finance_movement'` (o un tipo dedicado `type: 'tax_entry'` si el módulo de impuestos lo requiere) con:
   ```js
   {
     type: 'finance_movement',
     user_id: userId,
     movementType: 'expense',
     category: 'iva_soportado',
     description: `IVA Soportado — Factura ${invoice.invoiceNumber} — ${invoice.supplierName}`,
     amount: invoice.taxAmount,
     taxRate: invoice.taxRate,
     baseAmount: invoice.subtotal,
     date: invoice.date,
     reference: invoice.invoiceNumber,
     linkedPurchaseInvoiceId: invoice._id,
     taxType: 'iva_soportado',
     status: 'confirmed',
     createdAt: new Date().toISOString(),
   }
   ```
2. Retorna el `_id` de la entrada creada.

**Archivo: `controllers/deliveryController.js`** — en `validatePurchaseInvoice` (TICKET 2)

3. Después de cambiar el status a `validated`:
   - Llamar a `generateExpenseFromInvoice(userId, invoice)`
   - Llamar a `generateInputTaxFromInvoice(userId, invoice)`
   - Guardar los IDs retornados en `linkedExpenseId` y `linkedTaxEntryId` del documento de factura
   - Si falla alguna generación: loguear error pero **no** bloquear la validación (los registros se pueden generar manualmente después)

#### Integración con TaxesPage
El `TaxesPage.tsx` ya construye el libro de IVA desde `listFinanceMovements`. Al crear movimientos con `category: 'iva_soportado'` y `taxType: 'iva_soportado'`, aparecerán automáticamente en el libro sin cambios en el frontend de impuestos, **siempre que `buildVatBook` ya filtre por `taxType`**. Verificar y ajustar si es necesario.

#### Integración con IncomeExpensesPage
El `IncomeExpensesPage.tsx` lista movimientos financieros. El gasto generado aparecerá automáticamente como movimiento de tipo `expense` con categoría `compras_proveedor`.

#### Criterios de aceptación
- [ ] Al validar factura se crea automáticamente un gasto en Finanzas
- [ ] Al validar factura se crea automáticamente una entrada de IVA soportado
- [ ] El gasto contiene referencia a la factura de origen (`linkedPurchaseInvoiceId`)
- [ ] La factura contiene referencia al gasto generado (`linkedExpenseId`) y a la entrada fiscal (`linkedTaxEntryId`)
- [ ] Los registros generados aparecen en IncomeExpensesPage y TaxesPage sin cambios en esas páginas
- [ ] Si la generación falla, la validación de la factura NO se bloquea
- [ ] Al rechazar una factura validada (TICKET 2), los registros generados se marcan como revertidos

---

### TICKET 6 — Backend: Vinculación con módulo de Documentos

**Prioridad:** Media  
**Esfuerzo:** Medio (1h)  
**Módulo:** Backend → `controllers/deliveryController.js` + `services/couchdb.js`

#### Objetivo
Al validar una factura que tiene PDF adjunto, crear automáticamente un documento en el módulo de Documentación (o vincular uno existente) para mantener un archivo organizado.

#### Cambios requeridos

**Archivo: `services/couchdb.js`** — nueva función `createDocumentFromInvoice(userId, invoice)`

1. Crea un documento `type: 'document'` con:
   ```js
   {
     type: 'document',
     user_id: userId,
     name: `Factura ${invoice.invoiceNumber} — ${invoice.supplierName}`,
     category: 'financial',
     subcategory: 'facturas_proveedor',
     description: `Factura de proveedor ${invoice.supplierName}, fecha ${invoice.date}, total ${invoice.total}€`,
     fileUrl: invoice.pdfUrl,
     linkedEntityType: 'purchase_invoice',
     linkedEntityId: invoice._id,
     tags: ['factura', 'proveedor', invoice.supplierName].filter(Boolean),
     date: invoice.date,
     status: 'active',
     createdAt: new Date().toISOString(),
   }
   ```
2. Retorna el `_id` del documento creado.

**Archivo: `controllers/deliveryController.js`** — en `validatePurchaseInvoice`

3. Si la factura tiene `pdfUrl` (hay PDF adjunto):
   - Llamar a `createDocumentFromInvoice(userId, invoice)`
   - Guardar el `_id` retornado en `linkedDocumentId` de la factura
4. Si la factura NO tiene PDF: no crear documento, pero generar la alerta "factura sin documento" (TICKET 7).

#### Criterios de aceptación
- [ ] Al validar factura con PDF adjunto, se crea documento en el módulo de Documentación
- [ ] El documento creado tiene categoría `financial` y subcategoría `facturas_proveedor`
- [ ] El documento tiene referencia bidireccional con la factura (`linkedEntityId` ↔ `linkedDocumentId`)
- [ ] Desde DocumentsPage se puede ver el documento enlazado
- [ ] Si la factura no tiene PDF, no se crea documento (se genera alerta)

---

### TICKET 7 — Backend: Alertas nuevas (pendiente validar, duplicada, sin documento)

**Prioridad:** Media  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Backend → `services/alertEngine.js`

#### Objetivo
Añadir tres nuevas reglas de alerta al motor existente, además de la ya existente `overdue_purchase`.

#### Cambios requeridos

**Archivo: `services/alertEngine.js`**

1. **Alerta `pending_validation_invoice`** — factura pendiente de validar demasiado tiempo:
   - Busca facturas con `status === 'pending_validation'` (o sin `validationStatus` para retrocompatibilidad)
   - Si `createdAt` hace más de X días (configurable, default: 3 días), genera alerta
   - Configuración en cuenta: `pendingValidationAlertEnabled` (default: `true`), `pendingValidationDays` (default: `3`)
   - Mensaje: `"Factura {invoiceNumber} de {supplierName} lleva {N} días sin validar"`
   - Ruta: `/saas/compras-stock/facturas-proveedor?tab=pending_validation`

2. **Alerta `duplicate_invoice`** (complemento del TICKET 4):
   - Busca facturas con `duplicateWarning === true` y `duplicateReviewed !== true`
   - Mensaje: `"Posible factura duplicada: {invoiceNumber} de {supplierName}"`
   - Ruta: `/saas/compras-stock/facturas-proveedor`

3. **Alerta `invoice_missing_document`** — factura validada sin PDF:
   - Busca facturas con `status === 'validated'` o `status === 'paid'` y sin `pdfUrl`
   - Mensaje: `"Factura {invoiceNumber} de {supplierName} no tiene documento adjunto"`
   - Configuración en cuenta: `missingDocumentAlertEnabled` (default: `true`)
   - Ruta: `/saas/compras-stock/facturas-proveedor`

4. **Actualizar alerta `overdue_purchase`** existente:
   - Ajustar para que solo considere facturas con `status === 'validated'` o `status === 'pending_payment'` (no las que aún están en `pending_validation`)
   - Actualizar ruta a `/saas/compras-stock/facturas-proveedor?tab=overdue`

**Archivo: `services/alertEngine.js`** → función `getAlertSummary`

5. Añadir contadores para las nuevas alertas en el resumen del dashboard.

#### Criterios de aceptación
- [ ] Se genera alerta cuando una factura lleva más de 3 días (configurable) sin validar
- [ ] Se genera alerta cuando se detecta factura duplicada no revisada
- [ ] Se genera alerta cuando una factura validada/pagada no tiene PDF adjunto
- [ ] La alerta de `overdue_purchase` ya existente se actualiza para respetar el nuevo flujo de estados
- [ ] Todas las alertas apuntan a la ruta correcta
- [ ] Cada alerta tiene su flag de activación/desactivación en configuración de cuenta

---

### TICKET 8 — Frontend: Actualizar tipo TypeScript `PurchaseInvoice`

**Prioridad:** Alta  
**Esfuerzo:** Bajo (30 min)  
**Módulo:** Frontend → `src/app/lib/deliveryApi.ts`

#### Objetivo
Ampliar la interfaz TypeScript `PurchaseInvoice` con los nuevos campos del backend.

#### Cambios requeridos

**Archivo: `src/app/lib/deliveryApi.ts`**

Añadir a la interfaz `PurchaseInvoice`:

```ts
// Flujo de validación
validationStatus: 'pending_validation' | 'validated' | 'paid' | 'pending_payment';
validatedAt?: string;
validatedBy?: string;

// PDF adjunto
pdfUrl?: string;
pdfFilename?: string;

// Vinculaciones
linkedDocumentId?: string;
linkedExpenseId?: string;
linkedTaxEntryId?: string;

// Duplicados
duplicateWarning?: boolean;
duplicateOf?: string;
duplicateReviewed?: boolean;
```

Añadir nuevas funciones de API:

```ts
export async function validateInvoiceRequest(userId: string, invoiceId: string): Promise<PurchaseInvoice> { ... }
export async function rejectInvoiceRequest(userId: string, invoiceId: string): Promise<PurchaseInvoice> { ... }
export async function uploadInvoicePdfRequest(userId: string, invoiceId: string, file: File): Promise<PurchaseInvoice> { ... }
export function getInvoicePdfUrl(userId: string, invoiceId: string): string { ... }
```

#### Criterios de aceptación
- [ ] Interface `PurchaseInvoice` incluye todos los campos nuevos
- [ ] Nuevas funciones de API para validar, rechazar y subir PDF
- [ ] Función helper para construir la URL de descarga del PDF
- [ ] Tipos de `validationStatus` restringidos con union type

---

### TICKET 9 — Frontend: Nuevo sistema de tabs con flujo de validación

**Prioridad:** Alta  
**Esfuerzo:** Alto (2h)  
**Módulo:** Frontend → `src/app/pages/saas/SupplierBillingPage.tsx`

#### Objetivo
Reemplazar los tabs actuales (Todas/Pendientes/Pagadas/Vencidas) por el nuevo flujo de validación completo, y añadir acciones de validar/rechazar.

#### Cambios requeridos

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx`**

1. **Actualizar `STATUS_CONFIG`** con los nuevos estados:
   ```ts
   const STATUS_CONFIG = {
     pending_validation: { label: 'Pte. validar', badgeClass: 'bg-yellow-100 text-yellow-700 ...' },
     validated: { label: 'Validada', badgeClass: 'bg-blue-100 text-blue-700 ...' },
     pending_payment: { label: 'Pte. pago', badgeClass: 'bg-amber-100 text-amber-700 ...' },
     paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 ...' },
     overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 ...' },
   };
   ```

2. **Actualizar tabs**:
   ```ts
   const tabs = [
     { id: 'all', label: 'Todas', count: kpis.total },
     { id: 'pending_validation', label: 'Pte. validar', count: kpis.pendingValidationCount },
     { id: 'validated', label: 'Validadas', count: kpis.validatedCount },
     { id: 'paid', label: 'Pagadas', count: kpis.paidCount },
     { id: 'pending_payment', label: 'Pte. pago', count: kpis.pendingPaymentCount },
     { id: 'overdue', label: 'Vencidas', count: kpis.overdueCount },
   ];
   ```

3. **Acciones en la tabla** — añadir botones según estado:
   - `pending_validation`: botón **"Validar"** (icono `CheckCircle2`, verde) + **"Editar"** + **"Eliminar"**
   - `validated`: botón **"Marcar pagada"** + **"Rechazar"** (devuelve a `pending_validation`) + **"Editar"**
   - `pending_payment`/`overdue`: botón **"Marcar pagada"** + **"Editar"**
   - `paid`: botón **"Ver"** + (opción de desmarcar, convertir a `validated`)

4. **Actualizar `handleToggleStatus`** para las nuevas transiciones usando `validateInvoiceRequest` / `rejectInvoiceRequest`.

5. **Actualizar KPIs** para mostrar los nuevos contadores:
   - Total facturas
   - Importe pendiente validar
   - Importe pagado
   - Importe vencido

6. **Retrocompatibilidad**: facturas existentes sin `validationStatus` se tratan como `pending_validation` si `status === 'pending'`, como `paid` si `status === 'paid'`.

#### Criterios de aceptación
- [ ] Se ven 6 tabs: Todas, Pte. validar, Validadas, Pagadas, Pte. pago, Vencidas
- [ ] Cada tab filtra correctamente por estado
- [ ] Los KPIs muestran contadores para cada estado
- [ ] El botón "Validar" cambia la factura a `validated`
- [ ] El botón "Rechazar" devuelve la factura a `pending_validation`
- [ ] Facturas existentes se muestran correctamente (retrocompatibilidad)
- [ ] El badge de estado usa el color correcto para cada estado

---

### TICKET 10 — Frontend: Upload y visor de PDF en factura

**Prioridad:** Alta  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Frontend → `src/app/pages/saas/SupplierBillingPage.tsx`

#### Objetivo
Permitir adjuntar PDF a la factura desde el formulario, mostrar un visor inline, y un botón de descarga en la tabla.

#### Cambios requeridos

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx` → `InvoiceModal`**

1. **Sección "Documento adjunto"** en el formulario (después de las notas):
   - Zona de drag & drop para subir PDF/imagen (reutilizar patrón del OCR upload)
   - Si ya hay PDF (`pdfUrl`), mostrar miniatura o nombre de archivo con botones "Ver" y "Reemplazar"
   - Al guardar la factura, si hay archivo nuevo, llamar a `uploadInvoicePdfRequest` después de crear/actualizar

2. **En el flujo OCR**: al escanear un PDF, subir automáticamente el mismo archivo como adjunto (además de procesar con OCR). Así la factura queda con el PDF original adjunto.

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx` → tabla**

3. **Columna "PDF"** en la tabla (o iconito junto al número de factura):
   - Si la factura tiene `pdfUrl`: icono `FileText` con enlace que abre el PDF en nueva pestaña
   - Si no tiene: icono gris `FileText` con tooltip "Sin documento"

4. **Modal/drawer de visualización PDF**: al hacer clic en "Ver PDF", abrir un modal con `<iframe>` o `<embed>` apuntando a `getInvoicePdfUrl()`.

#### Criterios de aceptación
- [ ] Se puede adjuntar PDF/imagen desde el formulario de factura
- [ ] El PDF se sube al backend como attachment (no base64 inline)
- [ ] La tabla muestra icono de PDF con estado visual (adjunto / sin adjunto)
- [ ] Se puede ver el PDF en un visor inline sin descargar
- [ ] Se puede descargar el PDF
- [ ] Al escanear con OCR un PDF, se sube automáticamente como adjunto
- [ ] Se puede reemplazar un PDF existente por otro nuevo

---

### TICKET 11 — Frontend: Columna de base, IVA y total desglosados

**Prioridad:** Media  
**Esfuerzo:** Bajo (30 min)  
**Módulo:** Frontend → `src/app/pages/saas/SupplierBillingPage.tsx`

#### Objetivo
Mostrar en la tabla el desglose de base imponible, IVA e importe total (actualmente solo se muestra el total).

#### Cambios requeridos

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx`** — sección `<thead>` y `<tbody>`

1. Reemplazar la columna única "Total" por tres columnas:
   - **Base** → `invoice.subtotal`
   - **IVA** → `invoice.taxAmount` (con indicador del % entre paréntesis)
   - **Total** → `invoice.total` (en negrita)

2. Actualizar el `<tfoot>` para mostrar los tres totales sumados.

3. Actualizar el export CSV para incluir las tres columnas por separado (ya las incluye: `Subtotal;IVA;Total` — verificar que los datos son correctos).

#### Criterios de aceptación
- [ ] La tabla muestra tres columnas: Base, IVA, Total
- [ ] El IVA muestra el porcentaje entre paréntesis (ej: "220,50€ (21%)")
- [ ] El footer de la tabla suma las tres columnas
- [ ] El CSV exporta los tres valores correctamente

---

### TICKET 12 — Frontend: Indicador de alerta de factura duplicada en UI

**Prioridad:** Media  
**Esfuerzo:** Medio (1h)  
**Módulo:** Frontend → `src/app/pages/saas/SupplierBillingPage.tsx`

#### Objetivo
Gestionar la respuesta 409 del backend al crear factura duplicada, y mostrar warnings en la tabla para facturas marcadas como posibles duplicados.

#### Cambios requeridos

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx`**

1. **En `handleSaveInvoice`**: si la API responde 409 (duplicado):
   - Mostrar un modal de confirmación: "Esta factura parece duplicada. Ya existe una factura con el mismo número ({invoiceNumber}) del proveedor {supplierName}. ¿Deseas crearla igualmente?"
   - Si el usuario confirma: reintentar con `forceDuplicate: true`
   - Si cancela: mantener el modal abierto para corregir

2. **En la tabla**: si `invoice.duplicateWarning === true`:
   - Mostrar un icono `AlertTriangle` naranja junto al número de factura
   - Tooltip: "Posible duplicado de factura {duplicateOf}"
   - Opción en acciones: "Marcar como revisado" → actualiza `duplicateReviewed: true`

3. **Banner de alerta** (similar al de "facturas vencidas"): si hay facturas con `duplicateWarning && !duplicateReviewed`, mostrar banner amarillo en la parte superior.

#### Criterios de aceptación
- [ ] Al crear factura duplicada, se muestra modal de confirmación
- [ ] El usuario puede forzar la creación o cancelar
- [ ] Facturas duplicadas se marcan visualmente en la tabla con icono de alerta
- [ ] Se puede marcar un duplicado como "revisado" para descartar la alerta
- [ ] Banner de aviso cuando hay duplicados no revisados

---

### TICKET 13 — Frontend/Ruta: Migrar URL a `/saas/compras-stock/facturas-proveedor`

**Prioridad:** Baja  
**Esfuerzo:** Bajo (30 min)  
**Módulo:** Frontend → `routes.tsx` + `Sidebar.tsx`

#### Objetivo
Actualizar la ruta de la página de Facturas Proveedor a la URL definitiva y mantener retrocompatibilidad.

#### Cambios requeridos

**Archivo: `src/app/routes.tsx`**

1. Añadir ruta anidada bajo `compras-stock`:
   ```tsx
   { path: 'compras-stock/facturas-proveedor', Component: SupplierBillingPage },
   ```

2. Mantener la ruta antigua como redirect:
   ```tsx
   { path: 'supplier-billing', element: <Navigate to="/saas/compras-stock/facturas-proveedor" replace /> },
   ```

**Archivo: `src/app/components/saas/Sidebar.tsx`**

3. Actualizar el enlace del sidebar para que apunte a `compras-stock/facturas-proveedor`.

**Archivo: `services/alertEngine.js`**

4. Actualizar todas las rutas de alertas de `/saas/supplier-billing` a `/saas/compras-stock/facturas-proveedor`.

#### Criterios de aceptación
- [ ] La página se accede correctamente en `/saas/compras-stock/facturas-proveedor`
- [ ] La URL antigua `/saas/supplier-billing` redirige a la nueva
- [ ] El sidebar apunta a la nueva URL
- [ ] Las alertas apuntan a la nueva URL

---

### TICKET 14 — Frontend: Conexiones visibles (Proveedores, Finanzas, Documentos)

**Prioridad:** Media  
**Esfuerzo:** Medio (1.5h)  
**Módulo:** Frontend → `src/app/pages/saas/SupplierBillingPage.tsx`

#### Objetivo
Hacer visibles y navegables las conexiones entre la factura y los módulos relacionados: Proveedor, Gasto en Finanzas, Entrada fiscal, Documento adjunto, Pedido de compra.

#### Cambios requeridos

**Archivo: `src/app/pages/saas/SupplierBillingPage.tsx`** — en la tabla

1. **Columna "Proveedor"**: ya existe como enlace a `/saas/suppliers`. Mantener y verificar que lleva al detalle del proveedor si hay `supplierId`.

2. **Columna "Vínculos"** (nueva columna, o expandir las existentes "Pedido" y "Centro coste"):
   - Si `linkedExpenseId`: chip `"Gasto"` con icono `DollarSign` que enlaza a `/saas/income-expenses?highlight={linkedExpenseId}`
   - Si `linkedTaxEntryId`: chip `"IVA"` con icono `Receipt` que enlaza a `/saas/taxes`
   - Si `linkedDocumentId`: chip `"Doc"` con icono `FileText` que enlaza a `/saas/documents/{linkedDocumentId}`
   - Si `linkedPurchaseOrderNumber`: chip del pedido (ya existe)

3. **Panel lateral / drawer de detalle**: al hacer clic en una factura, abrir un drawer lateral que muestre toda la información de la factura + todos los vínculos activos en una sección "Conexiones":
   - Proveedor → enlace
   - Pedido de compra → enlace (con comparativa si aplica)
   - Gasto generado → enlace
   - IVA soportado → enlace
   - Documento → enlace + visor PDF
   - Centro de coste → info

#### Criterios de aceptación
- [ ] Desde la factura se puede navegar al proveedor
- [ ] Desde la factura se puede navegar al gasto generado en Finanzas
- [ ] Desde la factura se puede navegar a la entrada de IVA en Impuestos
- [ ] Desde la factura se puede navegar al documento vinculado
- [ ] Desde la factura se puede navegar al pedido de compra vinculado
- [ ] Drawer de detalle muestra todas las conexiones en una sección dedicada

---

## Resumen de dependencias entre tickets

```
TICKET 1  (modelo)
   ├── TICKET 2  (flujo de estados)
   │      └── TICKET 5  (auto-gasto + IVA) ─── depende de TICKET 2
   │             └── TICKET 6  (vincular documento) ─── depende de TICKET 3
   ├── TICKET 3  (upload PDF) ─── depende de TICKET 1
   ├── TICKET 4  (duplicados)
   └── TICKET 7  (alertas) ─── depende de TICKET 2, 4, 6

TICKET 8  (tipos TS) ─── depende de TICKET 1, 2, 3
   ├── TICKET 9   (tabs validación) ─── depende de TICKET 8
   ├── TICKET 10  (visor PDF) ─── depende de TICKET 8, 3
   ├── TICKET 11  (desglose base/IVA/total)
   ├── TICKET 12  (UI duplicados) ─── depende de TICKET 8, 4
   └── TICKET 14  (conexiones) ─── depende de TICKET 8, 5, 6

TICKET 13 (ruta URL) ─── independiente, se puede hacer al principio o al final
```

## Orden de implementación recomendado

| Fase | Tickets | Descripción |
|------|---------|-------------|
| **Fase 1 — Cimientos** | 1, 8, 13 | Modelo ampliado + tipos TS + nueva ruta |
| **Fase 2 — Flujo core** | 2, 9 | Máquina de estados backend + tabs frontend |
| **Fase 3 — PDF** | 3, 10 | Upload/descarga PDF + visor frontend |
| **Fase 4 — Automatización** | 5, 6 | Gasto + IVA + documento automático |
| **Fase 5 — Integridad** | 4, 7, 12 | Duplicados + alertas + warnings UI |
| **Fase 6 — Polish** | 11, 14 | Desglose importes + conexiones visibles |
