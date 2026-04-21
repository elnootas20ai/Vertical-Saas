# ENTRADA DE VEHÍCULO — Diseño de Tickets

**Página:** `/saas/vertical/compraventa/entrada-vehiculo`  
**Objetivo:** Dar de alta un vehículo de forma rápida y completa, capturando toda la información necesaria para su gestión posterior en stock.  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Ya implementado (backend + frontend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo de vehículo CouchDB (`type: 'car'`) | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Campos de identidad: `registrationPlate`, `brand`, `model`, `version`, `year`, `color`, `vin` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Campos técnicos: `fuelType`, `mileage`, `transmission`, `doors`, `power`, `bodyType` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Campos económicos: `purchasePrice`, `salePrice`, `purchaseDate`, `priceHistory` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Campos de origen: `origin`, `supplierName` | Completo | `services/couchdb.js` — `normalizeOrigin` (particular, empresa, subasta, permuta, otro) |
| Campos operativos: `status`, `location`, `images`, `notes`, `associatedCosts` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Normalización de estado: `available`, `reserved`, `sold`, `workshop`, `scrapped` | Completo | `services/couchdb.js` — `normalizeStatus` |
| CRUD de vehículos (backend) | Completo | `controllers/vehicleController.js`, `routers/vehicleRouter.js` |
| Costes asociados (backend) | Completo | `vehicleController.js` — `addAssociatedCost`, `deleteAssociatedCost` |
| Garantías (backend) | Completo | `vehicleController.js` — `addWarranty`, `updateWarranty`, `deleteWarranty` |
| Validación de imágenes | Completo | `vehicleController.js` — `validateVehicleImages` (JPEG/PNG/WEBP, data URL o URL HTTP) |
| Wizard de recepción (4 pasos) | Parcial | `src/app/components/design-system/SAAS__VehicleReceptionWizard.tsx` |
| Modal de alta rápida | Completo | `src/app/components/design-system/SAAS__VehicleQuickAddModal.tsx` |
| Ficha/edición completa de vehículo | Completo | `src/app/pages/saas/VehicleDetail.tsx` — `EditVehicleModal` (4 pestañas) |
| Listado de vehículos con filtros y vistas | Completo | `src/app/pages/saas/Vehicles.tsx` |
| Alerta de envejecimiento en stock | Completo | `services/alertEngine.js` — `checkVehicleStockAging` |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Sistema de notificaciones in-app | Completo | `services/couchdb.js` — `buildNotificationDocument` / `saveNotification` |
| OCR genérico (facturas/recibos) | Completo | `POST /api/ocr/scan` — OpenAI Vision (`gpt-4o`) |
| Sistema de documentos (`type: 'document'`) | Completo | `controllers/documentsController.js`, `routers/documentsRouter.js` |
| Adjuntos CouchDB (streaming) | Completo | `/api/couch/attachment/:dbName/:docId/:attachmentName` |
| Roles y permisos | Completo | `services/couchdb.js` — `ROLE_DEFINITIONS`, `TEAM_PERMISSION_KEYS` |
| Activity logging | Completo | `controllers/vehicleController.js` — `logAccountActivity`, `writeChangelog` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No hay detección de duplicados** — `createVehicle` no comprueba matrícula ni bastidor repetidos | Se pueden dar de alta vehículos duplicados sin aviso |
| 2 | **El wizard de recepción no sube fotos** — El paso 4 (Documentos) es solo UI; no guarda nada | Se pierde la documentación capturada en el momento de entrada |
| 3 | **El wizard no captura todos los campos** — Falta `transmission`, `notes`, `bodyType`, `doors`, `power`, `version` | La ficha queda incompleta y hay que editar después |
| 4 | **No hay array `documents` para coches de stock** — Solo existe en `fleet_vehicle` | No se puede vincular documentación (ficha técnica, ITV, contrato) al vehículo de stock |
| 5 | **El wizard fuerza `status: 'available'`** — No permite elegir estado inicial | Un vehículo que entra directo a taller no se puede marcar como tal |
| 6 | **El wizard no está conectado al menú** — `setShowReceptionWizard(true)` no se invoca desde ningún botón visible | El flujo de recepción es inaccesible para el usuario |
| 7 | **No hay alertas de entrada** — No se alerta si falta documentación, precio de compra o hay duplicados | Entran vehículos con datos incompletos sin que nadie lo detecte |
| 8 | **No hay OCR para documentación de vehículo** — El OCR solo parsea facturas/recibos financieros | No se puede extraer datos de ficha técnica, permiso de circulación, etc. |
| 9 | **No existe la página `/saas/vertical/compraventa/entrada-vehiculo`** — No hay ruta ni componente | La entrada de vehículo se hace desde modales parciales dentro de `/saas/vehicles` |
| 10 | **`saveVehicleCreationAlert` es código muerto** — Definida pero nunca invocada | No se genera ninguna alerta al crear un vehículo |

### Mapa de dependencias

```
EV-01 (Duplicados backend)
  └── EV-04 (Identificación — usa validación de duplicados en UI)
  └── EV-09 (Automatizaciones — bloquea guardado si duplicado)
  └── EV-10 (Alertas — genera alerta de duplicado)

EV-02 (Documentos vinculados)
  └── EV-07 (Documentación y OCR — necesita modelo de docs)
  └── EV-09 (Automatizaciones — vincula docs al guardar)
  └── EV-10 (Alertas — detecta vehículo sin docs)

EV-03 (Estructura página)
  └── EV-04 (Identificación)
  └── EV-05 (Origen y coste)
  └── EV-06 (Fotos)
  └── EV-07 (Documentación)
  └── EV-08 (Ubicación y estado)

EV-11 (Permisos) — independiente, puede ir en paralelo
EV-12 (Conexiones) — después de EV-09 y EV-10
```

---

## TICKETS

---

### TICKET EV-01: Detección de duplicados por matrícula y bastidor

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

Actualmente `createVehicle` en `vehicleController.js` no comprueba si ya existe un vehículo con la misma matrícula (`registrationPlate`) o bastidor (`vin`). Esto permite dar de alta duplicados sin control. El sistema de clientes sí tiene detección de duplicados (por email/teléfono); hay que replicar el patrón para vehículos.

#### Tareas

**1. Crear vista CouchDB para búsqueda rápida por matrícula y bastidor en `services/couchdb.js`:**

Añadir a `VEHICLES_DESIGN_VIEWS`:

```javascript
by_plate: {
  map: `function(doc) {
    if (doc.type === 'car' && doc.active !== false && !doc.deletedAt && doc.registrationPlate) {
      emit([doc.user_id, doc.registrationPlate.toUpperCase()], {
        _id: doc._id,
        brand: doc.brand,
        model: doc.model,
        status: doc.status
      });
    }
  }`
},
by_vin: {
  map: `function(doc) {
    if (doc.type === 'car' && doc.active !== false && !doc.deletedAt && doc.vin) {
      emit([doc.user_id, doc.vin.toUpperCase()], {
        _id: doc._id,
        brand: doc.brand,
        model: doc.model,
        registrationPlate: doc.registrationPlate,
        status: doc.status
      });
    }
  }`
}
```

**2. Crear función `checkVehicleDuplicates` en `vehicleController.js`:**

```javascript
async function checkVehicleDuplicates(userId, registrationPlate, vin, excludeVehicleId = null) {
  const db = getVehiclesDbName(userId);
  const duplicates = { plate: null, vin: null };

  if (registrationPlate) {
    const plateResult = await queryView(db, 'vehicles', 'by_plate', {
      key: [userId, registrationPlate.toUpperCase()],
      include_docs: false
    });
    const match = plateResult.rows.find(r => !excludeVehicleId || r.value._id !== excludeVehicleId);
    if (match) {
      duplicates.plate = {
        vehicleId: match.value._id,
        brand: match.value.brand,
        model: match.value.model,
        status: match.value.status
      };
    }
  }

  if (vin) {
    const vinResult = await queryView(db, 'vehicles', 'by_vin', {
      key: [userId, vin.toUpperCase()],
      include_docs: false
    });
    const match = vinResult.rows.find(r => !excludeVehicleId || r.value._id !== excludeVehicleId);
    if (match) {
      duplicates.vin = {
        vehicleId: match.value._id,
        brand: match.value.brand,
        model: match.value.model,
        registrationPlate: match.value.registrationPlate,
        status: match.value.status
      };
    }
  }

  return duplicates;
}
```

**3. Crear endpoint `POST /api/vehicles/:userId/check-duplicates`:**

- Recibe `{ registrationPlate?, vin? }`
- Devuelve `{ plate: null | { vehicleId, brand, model, status }, vin: null | { ... } }`
- Usado por el frontend para validación en tiempo real (al perder foco en el campo)

**4. Integrar en `createVehicle`:**

- Antes de guardar, llamar a `checkVehicleDuplicates`
- Si hay duplicado exacto: devolver `409 Conflict` con detalle del vehículo existente
- El frontend decide si mostrar aviso o bloquear (ver EV-04)

**5. Integrar en `updateVehicle`:**

- Al actualizar matrícula o bastidor, comprobar duplicados excluyendo el propio vehículo (`excludeVehicleId`)
- Si hay conflicto: devolver `409 Conflict`

**6. Cliente TypeScript — `src/app/lib/vehiclesApi.ts`:**

```typescript
interface DuplicateCheckResult {
  plate: { vehicleId: string; brand: string; model: string; status: string } | null;
  vin: { vehicleId: string; brand: string; model: string; registrationPlate: string; status: string } | null;
}

async function checkVehicleDuplicates(
  userId: string,
  data: { registrationPlate?: string; vin?: string }
): Promise<DuplicateCheckResult>
```

#### Criterios de aceptación

- Al crear un vehículo con matrícula existente → error 409 con datos del vehículo duplicado
- Al crear un vehículo con bastidor existente → error 409 con datos del vehículo duplicado
- El endpoint `/check-duplicates` responde en <200ms para validación en tiempo real
- Los vehículos eliminados (soft delete) no se consideran duplicados
- Al editar un vehículo, no se marca como duplicado de sí mismo
- Las comparaciones son case-insensitive (mayúsculas)

---

### TICKET EV-02: Documentos vinculados a vehículos de stock

**Tipo:** Feature — Backend + API Client  
**Prioridad:** Alta  
**Dependencias:** Ninguna

#### Contexto

El modelo `fleet_vehicle` en `couchdb.js` tiene un array `documents` para vincular documentación. Sin embargo, el modelo `car` (stock de compraventa) no incluye esta estructura. Necesitamos que los vehículos de stock puedan tener documentación vinculada: ficha técnica, permiso de circulación, ITV, seguro, contrato de compraventa, informe de historial, etc.

El sistema de documentos genérico (`type: 'document'`) ya existe con CRUD completo, pero no tiene un campo `vehicleId` que vincule con coches de stock (solo está preparado para `clientId`, `saleId`).

#### Tareas

**1. Extender `buildVehicleDocument` en `services/couchdb.js`:**

Añadir al documento `type: 'car'`:

```javascript
documents: Array.isArray(data.documents) ? data.documents.map(doc => ({
  id: doc.id || `vdoc:${generateId()}`,
  name: sanitizeString(doc.name) || '',
  documentType: normalizeVehicleDocType(doc.documentType),
  fileUrl: sanitizeString(doc.fileUrl) || '',
  fileName: sanitizeString(doc.fileName) || '',
  mimeType: sanitizeString(doc.mimeType) || '',
  fileSize: typeof doc.fileSize === 'number' ? doc.fileSize : 0,
  attachmentName: sanitizeString(doc.attachmentName) || '',
  notes: sanitizeString(doc.notes) || '',
  expiresAt: doc.expiresAt || null,
  uploadedAt: doc.uploadedAt || new Date().toISOString(),
  uploadedBy: sanitizeString(doc.uploadedBy) || ''
})) : []
```

**2. Crear `normalizeVehicleDocType` en `services/couchdb.js`:**

```javascript
function normalizeVehicleDocType(type) {
  const map = {
    ficha_tecnica: 'ficha_tecnica',
    technical_sheet: 'ficha_tecnica',
    permiso_circulacion: 'permiso_circulacion',
    registration_certificate: 'permiso_circulacion',
    itv: 'itv',
    mot: 'itv',
    seguro: 'seguro',
    insurance: 'seguro',
    contrato_compraventa: 'contrato_compraventa',
    purchase_contract: 'contrato_compraventa',
    informe_historial: 'informe_historial',
    history_report: 'informe_historial',
    factura_compra: 'factura_compra',
    purchase_invoice: 'factura_compra',
    otro: 'otro',
    other: 'otro'
  };
  return map[(type || '').toLowerCase().trim()] || 'otro';
}
```

**3. Endpoints para documentos de vehículo en `vehicleController.js`:**

- `addVehicleDocument(userId, vehicleId, documentData)` — Añadir documento al array
- `removeVehicleDocument(userId, vehicleId, documentId)` — Eliminar del array
- `updateVehicleDocument(userId, vehicleId, documentId, data)` — Actualizar metadatos (nombre, tipo, notas, fecha expiración)

**4. Rutas en `vehicleRouter.js`:**

```javascript
router.post('/:userId/:vehicleId/documents', vehicleController.addVehicleDocument);
router.put('/:userId/:vehicleId/documents/:documentId', vehicleController.updateVehicleDocument);
router.delete('/:userId/:vehicleId/documents/:documentId', vehicleController.removeVehicleDocument);
```

**5. Subida de archivos como adjuntos CouchDB:**

- Reutilizar el endpoint genérico `/api/couch/attachment/:dbName/:docId/:attachmentName` existente
- El flujo en frontend: subir archivo como attachment al doc del vehículo → guardar referencia en el array `documents` con `attachmentName`
- Alternativa: guardar como data URL en `fileUrl` (para archivos pequeños <2MB)

**6. Cliente TypeScript — `src/app/lib/vehiclesApi.ts`:**

```typescript
type VehicleDocType =
  | 'ficha_tecnica'
  | 'permiso_circulacion'
  | 'itv'
  | 'seguro'
  | 'contrato_compraventa'
  | 'informe_historial'
  | 'factura_compra'
  | 'otro';

interface VehicleDocument {
  id: string;
  name: string;
  documentType: VehicleDocType;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentName: string;
  notes: string;
  expiresAt: string | null;
  uploadedAt: string;
  uploadedBy: string;
}

function addVehicleDocumentRequest(userId: string, vehicleId: string, doc: Partial<VehicleDocument>): Promise<...>
function removeVehicleDocumentRequest(userId: string, vehicleId: string, documentId: string): Promise<...>
function updateVehicleDocumentRequest(userId: string, vehicleId: string, documentId: string, data: Partial<VehicleDocument>): Promise<...>
```

#### Criterios de aceptación

- Se pueden adjuntar documentos a vehículos de stock (`type: 'car'`)
- Cada documento tiene tipo clasificado (`ficha_tecnica`, `itv`, `seguro`, etc.)
- Los documentos con `expiresAt` se pueden usar luego para alertas de caducidad
- Los archivos se almacenan como adjuntos CouchDB o data URLs
- El array `documents` persiste correctamente en `buildVehicleDocument`
- Los documentos existentes no se pierden al actualizar el vehículo
- CRUD funcional vía API
- Los vehículos existentes sin campo `documents` funcionan sin error (array vacío por defecto)

---

### TICKET EV-03: Página "Entrada de Vehículo" — Estructura, navegación y layout

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

Actualmente la entrada de vehículos se realiza mediante modales desde `/saas/vehicles`: un wizard de recepción (incompleto y desconectado del menú) y un modal de alta rápida. No existe una página dedicada con URL propia.

El diseño debe ser una **página completa a pantalla** (no un modal) con un formulario tipo wizard/stepper que guíe al usuario sección por sección. Esto permite:
- URL directa compartible (`/saas/vertical/compraventa/entrada-vehiculo`)
- Más espacio para fotos y documentación
- Mejor UX en móvil (Capacitor)
- Posibilidad de guardar borradores

#### Tareas

**1. Crear componente de página `src/app/pages/saas/VehicleEntryPage.tsx`:**

- Layout: cabecera con título "Entrada de vehículo" + breadcrumb (Vehículos > Entrada)
- Stepper lateral (desktop) / horizontal (móvil) con 6 secciones:
  1. **Identificación** — Marca, modelo, versión, matrícula, bastidor, año, color
  2. **Datos técnicos** — Km, combustible, cambio, potencia, puertas, carrocería
  3. **Origen y coste** — Origen, proveedor/particular, precio compra, fecha entrada
  4. **Fotos** — Galería de imágenes del vehículo
  5. **Documentación** — Subida de documentos con tipo clasificado
  6. **Revisión y confirmación** — Resumen completo, ubicación, estado inicial, observaciones
- Barra inferior fija: botones "Anterior", "Siguiente", "Guardar borrador", "Dar de alta"
- Estado local con `useReducer` para el formulario completo
- Indicador visual de completitud por sección (check verde / warning amarillo / vacío gris)

**2. Registrar ruta en `src/app/routes.tsx`:**

```typescript
{
  path: 'vertical/compraventa/entrada-vehiculo',
  lazy: () => import('../pages/saas/VehicleEntryPage').then(m => ({ Component: m.default }))
}
```

Ubicar dentro del bloque de rutas `/saas/*`.

**3. Añadir entrada en el sidebar — `src/app/components/saas/Sidebar.tsx`:**

- Añadir ítem en el grupo `commercial` (concesionario):
  - `id: 'vehicleEntry'`
  - `label: 'Entrada vehículo'`
  - `path: '/saas/vertical/compraventa/entrada-vehiculo'`
  - `icon`: icono de entrada/plus-car (reutilizar icono existente del design system o Lucide `CarFront` / `CirclePlus`)
- Visible solo para `businessType` que incluya `carDealership` (ya filtrado por `VERTICAL_GROUPS`)

**4. Diseño responsive:**

- **Desktop (≥1024px):** Stepper vertical a la izquierda (ancho fijo 260px) + contenido del paso a la derecha. Barra de acciones inferior sticky.
- **Tablet (768–1023px):** Stepper horizontal colapsado (solo números/iconos) + contenido debajo.
- **Móvil (<768px):** Stepper horizontal minimal (dots/números) + contenido a ancho completo. Barra de acciones sticky con botones compactos.

**5. Skeleton de cada sección (componentes hijos):**

```
VehicleEntryPage.tsx
├── VehicleEntryStepIdentification.tsx
├── VehicleEntryStepTechnical.tsx
├── VehicleEntryStepOriginCost.tsx
├── VehicleEntryStepPhotos.tsx
├── VehicleEntryStepDocuments.tsx
└── VehicleEntryStepReview.tsx
```

Cada componente recibe `data` y `onChange` del estado global del formulario.

**6. Navegación entre pasos:**

- Se puede navegar libremente entre pasos (no bloquear avance)
- Al hacer clic en "Siguiente", validar el paso actual y mostrar errores inline si los hay
- Permitir ir a cualquier paso haciendo clic en el stepper
- El paso de revisión marca en rojo los campos obligatorios que faltan

#### Criterios de aceptación

- La página es accesible desde `/saas/vertical/compraventa/entrada-vehiculo`
- Aparece en el sidebar para negocios tipo `carDealership`
- El stepper muestra 6 secciones con indicador de estado
- La navegación entre pasos es fluida sin perder datos
- El diseño es responsive y funciona en móvil (Capacitor)
- El breadcrumb permite volver al listado de vehículos
- Lazy loading del componente (no incrementa el bundle inicial)

---

### TICKET EV-04: Sección Identificación del vehículo (con validación de duplicados)

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** EV-01, EV-03

#### Contexto

Primera sección del formulario de entrada. Captura los datos de identidad del vehículo y es donde se realiza la primera validación crítica: detección de duplicados por matrícula y bastidor en tiempo real.

#### Tareas

**1. Componente `VehicleEntryStepIdentification.tsx`:**

Campos del formulario:

| Campo | Tipo input | Obligatorio | Validación |
|---|---|---|---|
| Marca | Combobox con sugerencias (historial de marcas del usuario) | Sí | No vacío |
| Modelo | Combobox con sugerencias (filtrado por marca) | Sí | No vacío |
| Versión | Texto libre | No | — |
| Matrícula | Texto, auto-mayúsculas, formato libre | Sí | No vacío, check duplicados on blur |
| Bastidor (VIN) | Texto, auto-mayúsculas, 17 caracteres | No | Si se rellena: exactamente 17 caracteres alfanuméricos (sin I, O, Q), check duplicados on blur |
| Año | Numérico, 4 dígitos | Sí | Entre 1900 y año actual + 1 |
| Color | Combobox con colores frecuentes + texto libre | No | — |

**2. Validación de duplicados en tiempo real:**

- Al perder foco (on blur) en matrícula o bastidor, llamar a `checkVehicleDuplicates` (EV-01)
- Debounce de 300ms para evitar llamadas excesivas
- Si hay duplicado, mostrar **banner de aviso** debajo del campo:
  - Icono de advertencia amarillo/naranja
  - Texto: "Ya existe un vehículo con esta matrícula: **{brand} {model}** ({status})"
  - Enlace "Ver vehículo" que abre la ficha en nueva pestaña
  - **No bloquear** el formulario (el gerente puede decidir continuar si es una reentrada)
- Si hay duplicado por bastidor y matrícula distinta, el aviso es más fuerte (banner rojo):
  - "El bastidor {vin} ya está registrado en: **{brand} {model}** — matrícula **{plate}**"

**3. Autocompletado de marca y modelo:**

- Cargar marcas y modelos únicos de vehículos existentes del usuario (query al listado)
- Al seleccionar una marca, filtrar modelos por esa marca
- Permitir texto libre (marcas/modelos nuevos)
- Ordenar por frecuencia de uso

**4. Validación de bastidor (VIN):**

- Formato: 17 caracteres alfanuméricos, sin las letras I, O, Q (estándar ISO 3779)
- Mostrar helper text: "17 caracteres — se encuentra en la ficha técnica y en el parabrisas"
- Validación visual: check verde si formato válido, warning si parcial, error si inválido

**5. Matrícula — formato flexible:**

- Auto-mayúsculas al escribir
- No forzar formato específico (hay matrículas españolas, europeas, temporales, diplomáticas, históricas)
- Trim de espacios al inicio y final

#### Criterios de aceptación

- Los campos obligatorios (marca, modelo, matrícula, año) se validan al avanzar de paso
- La detección de duplicados funciona on blur con respuesta <300ms visual
- El banner de duplicado muestra datos del vehículo existente y enlace a su ficha
- El autocompletado de marca y modelo usa datos reales del stock del usuario
- El VIN se valida según ISO 3779 (17 chars, sin I/O/Q)
- Todos los campos preservan su valor al navegar entre pasos

---

### TICKET EV-05: Sección Origen, coste y fecha de entrada

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** EV-03

#### Contexto

Tercera sección del formulario. Captura la procedencia del vehículo, quién lo vende, el precio de compra y la fecha de entrada. Es información crítica para el control financiero y la trazabilidad.

#### Tareas

**1. Componente `VehicleEntryStepOriginCost.tsx`:**

Campos del formulario:

| Campo | Tipo input | Obligatorio | Validación |
|---|---|---|---|
| Origen del vehículo | Select: Particular, Empresa/Proveedor, Subasta, Permuta, Otro | Sí | No vacío |
| Nombre proveedor / particular | Texto con autocompletado (proveedores existentes del CRM) | Condicional | Obligatorio si origen ≠ "Particular" |
| CIF/NIF del proveedor | Texto | No | Formato válido si se rellena |
| Teléfono de contacto | Texto tipo tel | No | — |
| Precio de compra (€) | Numérico con decimales, formato moneda | Sí | > 0 |
| IVA incluido | Toggle (Sí/No) | No | Default: Sí |
| Precio sin IVA (calculado) | Numérico, solo lectura | No | Se calcula automáticamente si IVA incluido |
| Fecha de entrada | Date picker | Sí | No futura, default: hoy |
| Precio estimado de venta | Numérico con decimales | No | Si se rellena: > precio compra (warning, no bloqueo) |
| Margen estimado (calculado) | Solo lectura, con % | No | Se calcula automáticamente |

**2. Comportamiento condicional por origen:**

- **Particular:** No requiere nombre de proveedor; mostrar campos de contacto (nombre, teléfono, DNI)
- **Empresa / Proveedor:** Autocompletado del nombre desde proveedores del CRM; mostrar CIF; al seleccionar proveedor existente, auto-rellenar CIF y teléfono
- **Subasta:** Campo adicional "Nombre de subasta" + "Nº de lote" (opcionales)
- **Permuta:** Campo "Vehículo entregado" (texto libre, referencia informativa)
- **Otro:** Campo "Especificar origen" (texto libre)

**3. Cálculo de margen en tiempo real:**

- Si se rellena precio de compra y precio estimado de venta:
  - Margen = precio venta - precio compra
  - % Margen = (margen / precio compra) × 100
  - Mostrar en verde si positivo, rojo si negativo
- Helper text: "Este precio de venta es orientativo. Se puede modificar desde la ficha del vehículo."

**4. Autocompletado de proveedor desde CRM:**

- Buscar en la base de datos de proveedores/clientes del usuario
- Mostrar nombre + CIF en el dropdown
- Al seleccionar, auto-rellenar campos de contacto

#### Criterios de aceptación

- El origen es obligatorio y condiciona los campos visibles
- El precio de compra es obligatorio y se valida como número > 0
- El cálculo de margen se actualiza en tiempo real
- La fecha de entrada no permite fechas futuras
- El autocompletado de proveedor funciona con datos reales del CRM
- Los campos condicionales aparecen/desaparecen con transición suave

---

### TICKET EV-06: Sección Datos técnicos

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** EV-03

#### Contexto

Segunda sección del formulario. Captura las características técnicas del vehículo. Estos datos son importantes para la ficha de venta y los filtros de stock.

#### Tareas

**1. Componente `VehicleEntryStepTechnical.tsx`:**

Campos del formulario:

| Campo | Tipo input | Obligatorio | Validación |
|---|---|---|---|
| Kilómetros | Numérico con separador de miles | Sí | ≥ 0 |
| Combustible | Select: Gasolina, Diésel, Híbrido, Eléctrico, GLP, Otro | Sí | No vacío |
| Cambio | Select: Manual, Automático, Semiautomático | Sí | No vacío |
| Potencia (CV) | Numérico | No | Si se rellena: > 0 |
| Puertas | Select: 2, 3, 4, 5 | No | — |
| Carrocería | Select: Berlina, SUV, Todoterreno, Monovolumen, Coupé, Cabrio, Pickup, Furgoneta, Otro | No | — |

**2. Formateo de kilómetros:**

- Mostrar con separador de miles al perder foco (ej: 125.430 km)
- Input acepta solo dígitos
- Sufijo visual "km" al lado del campo

**3. Iconos visuales para combustible y carrocería:**

- Cada opción de combustible con icono representativo (⛽ gasolina, 🔋 eléctrico, etc.) usando iconos del design system existente
- Cada tipo de carrocería con silueta/icono si el design system lo permite; si no, solo texto

**4. Layout de la sección:**

- Grid de 2 columnas en desktop (km + combustible, cambio + potencia, puertas + carrocería)
- 1 columna en móvil
- Los campos más importantes (km, combustible, cambio) arriba y más grandes

#### Criterios de aceptación

- Km, combustible y cambio son obligatorios
- Los km se formatean con separador de miles
- El layout se adapta a desktop/móvil
- Los valores se mapean correctamente al modelo de datos (`fuelType`, `transmission`, etc.)

---

### TICKET EV-07: Sección Fotos del vehículo

**Tipo:** Feature — Full Stack  
**Prioridad:** Alta  
**Dependencias:** EV-03

#### Contexto

El wizard de recepción actual no sube fotos. La ficha de edición (`VehicleDetail.tsx`) sí gestiona imágenes (`images` array en el modelo), pero la validación (`validateVehicleImages`) solo acepta data URLs o URLs HTTP.

Para la entrada de vehículo necesitamos una experiencia de subida de fotos completa: desde el ordenador (drag & drop o selector) y desde el móvil (cámara directa o galería, via Capacitor).

#### Tareas

**1. Componente `VehicleEntryStepPhotos.tsx`:**

- **Zona de drop** prominente con texto "Arrastra las fotos aquí o haz clic para seleccionar"
- **Grid de previews** (thumbnails) de las fotos subidas, reordenables con drag & drop
- **Botón "Hacer foto"** (visible en móvil/Capacitor): abrir cámara nativa
- Cada preview con:
  - Miniatura de la imagen
  - Botón eliminar (X)
  - Indicador de foto principal (estrella, solo la primera o seleccionable)
  - Indicador de progreso si se está procesando
- **Límites:** máximo 30 fotos; cada una máximo 10MB; formatos JPEG, PNG, WEBP
- **Compresión client-side:** redimensionar a máximo 2048px de lado largo y comprimir a JPEG 85% antes de convertir a data URL o subir como attachment

**2. Almacenamiento de fotos:**

- **Opción A (data URL):** Convertir a data URL (base64) y guardar en el array `images` del vehículo — simple pero incrementa el tamaño del documento CouchDB
- **Opción B (attachment):** Subir como adjunto CouchDB al documento del vehículo — mejor para archivos grandes, requiere gestión de attachments
- **Recomendación:** Usar data URL para ≤5 fotos o fotos <1MB comprimidas; attachment para galería grande. Evaluar en implementación según rendimiento.

**3. Reordenamiento de fotos:**

- Drag & drop para cambiar el orden
- La primera foto del array es la foto principal (portada) del vehículo
- Botón "Marcar como principal" para promover una foto a primera posición

**4. Integración con Capacitor (móvil):**

- Usar `@capacitor/camera` si está disponible para captura directa
- Fallback a input `type="file" accept="image/*" capture="environment"` en móvil web
- Preview inmediata después de captura

**5. Validación:**

- Reutilizar `validateVehicleImages` del backend para consistencia
- Validar formato y tamaño antes de procesar
- Mostrar error si formato no soportado o tamaño excedido

#### Criterios de aceptación

- Se pueden subir fotos por drag & drop, selector de archivos y cámara (móvil)
- Las fotos se comprimen client-side antes de almacenar
- El grid muestra previews con opción de eliminar y reordenar
- La primera foto es la foto principal/portada
- Funciona en desktop y móvil (Capacitor)
- Se respetan los límites de formato y tamaño
- Las fotos se preservan al navegar entre pasos del formulario

---

### TICKET EV-08: Sección Documentación y OCR

**Tipo:** Feature — Full Stack  
**Prioridad:** Alta  
**Dependencias:** EV-02, EV-03

#### Contexto

El paso 4 del wizard actual tiene UI de subida de documentos pero **no persiste nada**. Necesitamos una sección funcional que permita adjuntar documentación clasificada por tipo y, opcionalmente, extraer datos del vehículo mediante OCR de la ficha técnica o permiso de circulación.

El OCR actual (`POST /api/ocr/scan`) usa OpenAI Vision para facturas/recibos. Hay que extender o crear un endpoint paralelo para documentación de vehículo.

#### Tareas

**1. Componente `VehicleEntryStepDocuments.tsx`:**

- **Lista de tipos de documento** con estado (subido / pendiente / no requerido):
  - Ficha técnica ⭐ (recomendado)
  - Permiso de circulación ⭐ (recomendado)
  - ITV vigente
  - Seguro
  - Contrato de compraventa
  - Factura de compra
  - Informe de historial (Carfax, DGT, etc.)
  - Otro
- Cada tipo: botón "Subir" + preview del archivo si ya está subido + botón eliminar
- Al subir un archivo, se clasifica automáticamente por el tipo seleccionado
- Zona de drag & drop genérica para subir múltiples docs a la vez (pedir clasificar después)
- Formatos aceptados: PDF, JPEG, PNG, WEBP
- Tamaño máximo por archivo: 20MB

**2. OCR de ficha técnica — Nuevo endpoint `POST /api/ocr/vehicle-doc`:**

```javascript
// En index.js o en un router dedicado
app.post('/api/ocr/vehicle-doc', requireAuth, sensitiveOpLimiter, async (req, res) => {
  // Recibe: { image: dataUrl, documentType: 'ficha_tecnica' | 'permiso_circulacion' }
  // Usa OpenAI Vision con prompt específico para documentos de vehículo
  // Devuelve: { extractedData: { brand, model, vin, year, registrationPlate, fuelType, power, color, ... }, confidence: number }
});
```

**3. Prompt de OCR para ficha técnica / permiso de circulación:**

```
Analiza esta imagen de un documento de vehículo ({documentType}).
Extrae los siguientes campos en formato JSON:
- registrationPlate: matrícula
- brand: marca
- model: modelo
- version: versión/variante
- vin: número de bastidor (VIN)
- year: año de primera matriculación
- fuelType: tipo de combustible
- power: potencia en CV
- color: color
- doors: número de puertas
- mileage: kilómetros (si aparece)

Devuelve SOLO un JSON válido. Si un campo no aparece en el documento, usa null.
Incluye un campo "confidence" de 0 a 1 indicando la fiabilidad general de la extracción.
```

**4. Flujo OCR en la UI:**

- Al subir ficha técnica o permiso de circulación, mostrar botón "Extraer datos con IA"
- Al pulsar: spinner + "Analizando documento..."
- Resultado: modal de confirmación con los datos extraídos vs. los ya rellenados
  - Campos nuevos (no rellenados): se marcan en verde para auto-rellenar
  - Campos con conflicto (ya rellenados con valor distinto): se marcan en amarillo, el usuario elige cuál mantener
  - Campos no detectados: se muestran en gris
- Botón "Aplicar datos" que actualiza el formulario

**5. Indicadores de completitud documental:**

- Badge en el stepper: "3/7 docs" o similar
- Los tipos marcados con ⭐ (recomendados) muestran warning si no se suben
- No bloquear el alta si faltan documentos (solo advertir)

#### Criterios de aceptación

- Se pueden subir documentos clasificados por tipo
- Los documentos se persisten correctamente (usa modelo de EV-02)
- El OCR extrae datos de ficha técnica y permiso de circulación con OpenAI Vision
- El usuario puede revisar y confirmar los datos extraídos antes de aplicarlos
- El OCR no sobrescribe datos ya rellenados sin confirmación del usuario
- Los formatos PDF, JPEG, PNG, WEBP son aceptados
- Se muestra indicador de qué documentos faltan (especialmente los recomendados)

---

### TICKET EV-09: Sección Revisión, ubicación, estado y observaciones

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** EV-03

#### Contexto

Última sección del formulario antes de confirmar el alta. Muestra un resumen de todo lo capturado, permite añadir ubicación, estado inicial y observaciones, y señala campos que faltan o tienen advertencias.

#### Tareas

**1. Componente `VehicleEntryStepReview.tsx`:**

- **Resumen visual** organizado por secciones (tarjetas colapsables):
  - Identificación: matrícula, marca, modelo, versión, año, color, VIN — con advertencias de duplicados si los hay
  - Datos técnicos: km, combustible, cambio, potencia, puertas, carrocería
  - Origen y coste: origen, proveedor, precio compra, fecha, margen estimado
  - Fotos: grid de thumbnails (count: "8 fotos")
  - Documentación: lista de docs subidos con tipo (count: "3/7 documentos")
- Cada sección con botón "Editar" que navega al paso correspondiente
- **Campos que se capturan en este paso:**

| Campo | Tipo input | Obligatorio | Validación |
|---|---|---|---|
| Ubicación | Select de ubicaciones del negocio (`locations`) + "Sin asignar" | No | — |
| Centro de trabajo | Select de centros (si multi-sede) | No | — |
| Estado inicial | Select: En stock (available), En taller (workshop), Reservado (reserved) | Sí | Default: En stock |
| Observaciones | Textarea multilínea, máximo 2000 caracteres | No | — |

**2. Panel de advertencias:**

Mostrar en la parte superior un panel con todas las advertencias/errores detectados:

- 🔴 **Errores (bloquean el alta):**
  - Campos obligatorios vacíos (marca, modelo, matrícula, año, km, combustible, cambio, precio compra, fecha entrada)
- 🟡 **Advertencias (no bloquean, se informan):**
  - Matrícula duplicada detectada
  - Bastidor duplicado detectado
  - Sin fotos adjuntas
  - Sin documentación (especialmente ficha técnica y permiso)
  - VIN no rellenado
  - Precio de venta no estimado
- 🟢 **Todo correcto:** "El vehículo está listo para dar de alta"

**3. Botón "Dar de alta":**

- Solo habilitado si no hay errores 🔴
- Al pulsar:
  1. Mostrar modal de confirmación con resumen compacto
  2. Si confirma: llamar a `createVehicle` con todos los datos
  3. Spinner durante la operación
  4. Si éxito: redirigir a la ficha del vehículo (`/saas/vehicles/{id}`) con toast "Vehículo dado de alta correctamente"
  5. Si error 409 (duplicado): mostrar modal de conflicto con opción de "Ver existente" o "Dar de alta igualmente" (si el rol lo permite)
  6. Si error genérico: mostrar toast de error y mantener el formulario

**4. Botón "Guardar borrador":**

- Guardar el estado del formulario en `localStorage` con clave `vehicle-entry-draft:{userId}`
- Al entrar en la página, comprobar si hay borrador y preguntar "Tienes un borrador sin terminar de {fecha}. ¿Quieres continuar o empezar de nuevo?"
- El borrador se elimina al completar el alta

#### Criterios de aceptación

- El resumen muestra todos los datos capturados organizados por sección
- Las advertencias y errores se clasifican por severidad (rojo/amarillo/verde)
- Los campos obligatorios faltantes se listan explícitamente
- El alta solo es posible si no hay errores bloqueantes
- El flujo post-alta redirige a la ficha del vehículo creado
- El borrador se persiste en localStorage y se recupera al volver a la página
- El modal de confirmación muestra un resumen compacto antes de confirmar

---

### TICKET EV-10: Automatizaciones post-entrada

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** EV-01, EV-02

#### Contexto

Al dar de alta un vehículo desde la página de entrada, el sistema debe ejecutar varias acciones automáticas más allá de simplemente guardar el documento. Estas automatizaciones garantizan que el vehículo queda correctamente integrado en todos los módulos del sistema.

Actualmente `createVehicle` guarda el documento y hace `logAccountActivity`, pero no ejecuta ninguna lógica adicional.

#### Tareas

**1. Crear ficha de vehículo completa (ya existe, refinar):**

- Asegurar que `buildVehicleDocument` recibe y persiste **todos** los campos del formulario de entrada, incluyendo los nuevos: `documents`, `transmission` (ya existe en modelo pero no en wizard), `notes`, `bodyType`, `doors`, `power`, `version`
- Verificar que los campos de `VehicleEntryPage` se mapean 1:1 con `buildVehicleDocument`

**2. Guardar coste inicial como primer `associatedCost`:**

Además del `purchasePrice` en el documento principal, crear automáticamente el primer registro de coste asociado:

```javascript
const initialCost = {
  id: `cost:${generateId()}`,
  type: 'purchase',
  description: 'Precio de compra',
  amount: purchasePrice,
  date: purchaseDate,
  supplierName: supplierName || '',
  origin: origin,
  createdAt: new Date().toISOString()
};
```

Insertar en el array `associatedCosts` del vehículo al crear. Esto alimenta el cálculo de coste total para el margen de venta.

**3. Vincular documentos subidos:**

- Los documentos subidos en el paso de documentación (EV-08) se guardan en el array `documents` del vehículo (modelo de EV-02)
- Si se usaron attachments CouchDB, vincular las referencias
- Mantener la clasificación por tipo de documento

**4. Marcar estado de entrada:**

- Guardar `entryStatus: 'complete' | 'partial'` según completitud:
  - `complete`: tiene todos los obligatorios + al menos 1 foto + al menos ficha técnica o permiso
  - `partial`: tiene los obligatorios mínimos pero faltan fotos o documentos
- Guardar `entryDate` (fecha de entrada, diferente de `purchaseDate` que es la fecha de compra)
- Guardar `enteredBy` con el ID del usuario que realizó la entrada (trazabilidad)

**5. Activar `saveVehicleCreationAlert` (código muerto actual):**

Conectar la función existente `saveVehicleCreationAlert` en `vehicleController.js`:

- Invocarla después de crear el vehículo
- Genera un registro en activity-logs para auditoría
- Sirve de trigger para las alertas de EV-11

**6. Detección de duplicados pre-guardado:**

- Antes de guardar, ejecutar `checkVehicleDuplicates` (EV-01)
- Si hay duplicado: no guardar; devolver 409 con detalle
- El frontend maneja la respuesta (ver EV-09, tarea 3)

**7. Log de actividad enriquecido:**

Extender el `logAccountActivity` actual para incluir:
- `action: 'vehicle_entry'` (diferenciado de un `vehicle_create` genérico)
- `entryChannel: 'entry_page' | 'quick_add' | 'wizard' | 'import' | 'ai'`
- `completeness: 'complete' | 'partial'`
- `duplicateWarnings: []` (si se forzó el alta con advertencias)

#### Criterios de aceptación

- Al crear un vehículo desde la página de entrada, se genera automáticamente el coste inicial en `associatedCosts`
- Los documentos subidos quedan vinculados al vehículo
- El `entryStatus` refleja correctamente si la entrada está completa o parcial
- Se registra quién realizó la entrada (`enteredBy`) y cuándo (`entryDate`)
- La detección de duplicados bloquea el guardado si hay conflicto
- El activity log diferencia entradas desde la página de entrada vs. otras vías
- `saveVehicleCreationAlert` se ejecuta correctamente (ya no es código muerto)

---

### TICKET EV-11: Alertas de entrada de vehículo

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** EV-01, EV-02, EV-10

#### Contexto

El motor de alertas (`alertEngine.js`) ya tiene reglas para vehículos (envejecimiento en stock, velocidad de ventas baja) y un sistema completo de notificaciones (in-app, SSE, Web Push). Necesitamos añadir alertas específicas de entrada que detecten problemas en los vehículos recién dados de alta.

#### Tareas

**1. Alerta: Vehículo sin documentación**

Añadir en `alertEngine.js`:

```javascript
async function checkVehiclesWithoutDocuments(userId, vehiclesDb) {
  // Buscar vehículos con status 'available' o 'workshop'
  // creados en los últimos 7 días
  // donde documents.length === 0 o no tiene ficha_tecnica ni permiso_circulacion
  // Generar notificación tipo 'vehicle_missing_docs'
  // Dedup: no repetir si ya se envió en las últimas 48h
}
```

- **Tipo de notificación:** `vehicle_missing_docs`
- **Mensaje:** "El vehículo {brand} {model} ({plate}) no tiene documentación adjunta"
- **Prioridad:** Media
- **Destinatarios:** Usuario propietario + usuarios con rol Gerente
- **Frecuencia:** Comprobar cada hora; no repetir en 48h por vehículo

**2. Alerta: Vehículo sin precio de compra**

```javascript
async function checkVehiclesWithoutPurchasePrice(userId, vehiclesDb) {
  // Buscar vehículos con status !== 'sold' y status !== 'scrapped'
  // donde purchasePrice es 0, null o undefined
  // Generar notificación tipo 'vehicle_missing_price'
}
```

- **Tipo de notificación:** `vehicle_missing_price`
- **Mensaje:** "El vehículo {brand} {model} ({plate}) no tiene precio de compra registrado"
- **Prioridad:** Alta
- **Frecuencia:** Comprobar cada hora; no repetir en 24h

**3. Alerta: Matrícula duplicada**

```javascript
async function checkDuplicatePlates(userId, vehiclesDb) {
  // Usar vista by_plate (EV-01) para detectar matrículas con más de 1 vehículo activo
  // Generar notificación tipo 'vehicle_duplicate_plate'
}
```

- **Tipo de notificación:** `vehicle_duplicate_plate`
- **Mensaje:** "La matrícula {plate} está registrada en más de un vehículo: {list}"
- **Prioridad:** Crítica
- **Frecuencia:** Comprobar cada 2 horas; no repetir en 7 días

**4. Alerta: Bastidor duplicado**

```javascript
async function checkDuplicateVins(userId, vehiclesDb) {
  // Usar vista by_vin (EV-01) para detectar VINs con más de 1 vehículo activo
  // Generar notificación tipo 'vehicle_duplicate_vin'
}
```

- **Tipo de notificación:** `vehicle_duplicate_vin`
- **Mensaje:** "El bastidor {vin} está registrado en más de un vehículo: {list}"
- **Prioridad:** Crítica
- **Frecuencia:** Comprobar cada 2 horas; no repetir en 7 días

**5. Integrar en el ciclo principal del motor de alertas:**

En la función principal de `alertEngine.js` (que se ejecuta periódicamente), añadir las 4 nuevas comprobaciones al bloque de verificaciones de vehículos existente (junto a `checkVehicleStockAging`).

**6. Configuración por cuenta:**

Añadir en la configuración de alertas del usuario:

```javascript
vehicleEntryAlertsEnabled: true,                    // Activar/desactivar alertas de entrada
vehicleMissingDocsAlertDays: 7,                      // Alertar si lleva X días sin docs
vehicleMissingPriceAlertEnabled: true,               // Alertar si falta precio
vehicleDuplicateAlertEnabled: true                   // Alertar si hay duplicados
```

#### Criterios de aceptación

- Se genera alerta cuando un vehículo lleva >7 días sin documentación
- Se genera alerta cuando un vehículo no tiene precio de compra
- Se genera alerta cuando se detectan matrículas duplicadas
- Se genera alerta cuando se detectan bastidores duplicados
- Las alertas respetan la ventana de deduplicación (no se repiten innecesariamente)
- Las alertas se envían por los 3 canales: in-app, SSE y Web Push
- Las alertas de duplicados tienen prioridad crítica
- Las alertas son configurables por cuenta (se pueden activar/desactivar)

---

### TICKET EV-12: Permisos por perfil (gerente / trabajador)

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** EV-03, EV-10

#### Contexto

El sistema de roles (`ROLE_DEFINITIONS` en `couchdb.js`) ya define permisos por módulo (`vehicles`, `clients`, etc.) para cada rol. La matriz de permisos del equipo (`TEAM_PERMISSION_KEYS`) permite configurar accesos granulares por miembro.

Para la página de entrada de vehículo, hay dos perfiles de uso definidos:
- **Gerente:** Crea, revisa y valida entradas (acceso total)
- **Trabajador:** Puede crear ficha y subir datos básicos si tiene permiso

#### Tareas

**1. Definir permisos granulares para entrada de vehículo:**

Añadir en `TEAM_PERMISSION_KEYS` (o en la lógica de permisos del módulo `vehicles`):

```javascript
vehicle_entry: {
  create: true,            // Puede dar de alta vehículos
  upload_photos: true,     // Puede subir fotos
  upload_docs: true,       // Puede subir documentación
  set_price: false,        // Puede establecer precio de compra
  set_sale_price: false,   // Puede establecer precio de venta
  override_duplicate: false // Puede forzar alta con duplicado detectado
}
```

**2. Configuración por defecto según rol:**

| Permiso | Admin | Gerente | Comercial | Taller | Usuario |
|---|---|---|---|---|---|
| `create` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `upload_photos` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `upload_docs` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `set_price` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `set_sale_price` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `override_duplicate` | ✅ | ✅ | ❌ | ❌ | ❌ |

**3. Aplicar permisos en el frontend:**

- Obtener permisos del usuario autenticado (ya disponible en `AppContext` o `authUser`)
- **Si no tiene `create`:** No mostrar la entrada "Entrada vehículo" en el sidebar; redirigir a `/saas/vehicles` si accede por URL directa
- **Si no tiene `set_price`:** Ocultar campos de precio de compra y precio de venta; el gerente los completará después
- **Si no tiene `override_duplicate`:** El aviso de duplicado es bloqueante (no puede continuar)
- **Si no tiene `upload_docs`:** Ocultar la sección de documentación (paso 5)

**4. Aplicar permisos en el backend:**

- En `createVehicle`: verificar que el usuario tiene permiso `vehicle_entry.create`
- Si envía `purchasePrice` sin permiso `set_price`: ignorar el campo (no error, simplemente no se guarda)
- Si intenta forzar alta con duplicado sin `override_duplicate`: error 403

**5. Validación de entrada del trabajador:**

- Cuando un trabajador da de alta un vehículo, marcar `entryValidated: false`
- El gerente ve en el listado de vehículos un badge "Pendiente de validar" en vehículos con `entryValidated: false`
- Al abrir la ficha, el gerente puede:
  - Completar datos faltantes (precio, documentos)
  - Pulsar "Validar entrada" → `entryValidated: true`, `validatedBy: userId`, `validatedAt: timestamp`

**6. Indicador visual de entradas pendientes de validación:**

- En el sidebar, junto a "Entrada vehículo", mostrar badge con número de entradas pendientes de validar (solo para gerentes)
- En el listado de vehículos, filtro rápido "Pendientes de validar"

#### Criterios de aceptación

- El gerente tiene acceso completo a todos los campos y funciones de entrada
- El trabajador (con permiso) puede crear ficha con datos básicos pero sin precios
- Las entradas de trabajadores quedan marcadas como "Pendiente de validar"
- El gerente puede validar entradas desde la ficha del vehículo
- Los permisos se verifican tanto en frontend (visibilidad) como en backend (seguridad)
- El sidebar muestra badge de entradas pendientes para gerentes
- Un usuario sin permiso `create` no puede acceder a la página de entrada

---

### TICKET EV-13: Conexiones con módulos existentes

**Tipo:** Feature — Full Stack  
**Prioridad:** Media  
**Dependencias:** EV-09, EV-10, EV-11

#### Contexto

La página de entrada de vehículo no es un módulo aislado. Debe conectarse con los módulos existentes del sistema para que el vehículo recién dado de alta sea inmediatamente operativo en todo el flujo de compraventa.

#### Tareas

**1. Conexión con Stock de vehículos (`/saas/vehicles`):**

- Al completar el alta, el vehículo aparece inmediatamente en el listado de stock
- El estado asignado en la entrada se refleja en los filtros de stock
- Los KPIs del listado se actualizan (conteo por estado, valor total de stock)
- Enlace directo desde la confirmación de entrada a la ficha del vehículo

**2. Conexión con Documentación (`/saas/documents` o sistema de documentos):**

- Los documentos subidos durante la entrada son accesibles desde el módulo de documentos general
- Crear registros `type: 'document'` en la BD de documentos con `vehicleId` vinculado (además del array `documents` del vehículo)
- El gerente puede ver documentos del vehículo desde la ficha del vehículo y desde el módulo de documentos

**3. Conexión con OCR:**

- Los datos extraídos por OCR durante la entrada (EV-08) se usan para auto-rellenar el formulario
- Si se sube un documento después (desde la ficha), el OCR sigue disponible
- Historial de extracciones OCR en el activity log

**4. Conexión con Gastos de preparación:**

- El coste inicial (precio de compra) creado en EV-10 es el primer gasto del vehículo
- Desde la ficha del vehículo, el usuario puede añadir más gastos de preparación (ya existe: `addAssociatedCost`)
- En la confirmación de entrada, mostrar enlace "Añadir gastos de preparación" que lleva a la ficha del vehículo en la pestaña de costes

**5. Conexión con Dashboard:**

- El dashboard de KPIs (`/api/dashboard/kpis/:userId`) ya incluye métricas de stock
- Añadir widget o métrica: "Entradas este mes" (count de vehículos con `entryDate` en el mes actual)
- Añadir a las alertas del dashboard: entradas pendientes de validar (para gerentes)
- Los vehículos recién entrados se reflejan inmediatamente en "Vehículos en stock" y "Valor de stock"

**6. Navegación cruzada:**

- Desde la ficha del vehículo: enlace "Ver entrada original" con fecha, quién la hizo y canal
- Desde el listado de vehículos: columna opcional "Fecha entrada" (usar `entryDate`)
- Desde el dashboard: clic en "Entradas este mes" lleva al listado filtrado

**7. Vista CouchDB para KPI de entradas:**

Añadir a `VEHICLES_DESIGN_VIEWS`:

```javascript
entries_by_month: {
  map: `function(doc) {
    if (doc.type === 'car' && doc.active !== false && !doc.deletedAt && doc.entryDate) {
      var d = new Date(doc.entryDate);
      emit([doc.user_id, d.getFullYear(), d.getMonth() + 1], {
        _id: doc._id,
        brand: doc.brand,
        model: doc.model,
        purchasePrice: doc.purchasePrice || 0,
        entryStatus: doc.entryStatus,
        entryValidated: doc.entryValidated
      });
    }
  }`,
  reduce: '_count'
}
```

#### Criterios de aceptación

- El vehículo creado aparece inmediatamente en el listado de stock con su estado correcto
- Los documentos subidos son accesibles desde el módulo de documentos
- El dashboard refleja las nuevas entradas en tiempo real
- El coste de compra aparece como primer gasto del vehículo
- La navegación cruzada entre módulos funciona correctamente
- Los KPIs de "entradas por mes" funcionan en el dashboard

---

## Resumen y orden de ejecución

### Fase 1 — Fundamentos backend (sin cambios en UI)

| Ticket | Descripción | Estimación |
|---|---|---|
| EV-01 | Detección de duplicados por matrícula y bastidor | 3–4h |
| EV-02 | Documentos vinculados a vehículos de stock | 2–3h |

### Fase 2 — Página de entrada (UI core)

| Ticket | Descripción | Estimación |
|---|---|---|
| EV-03 | Estructura, navegación y layout de la página | 4–5h |
| EV-04 | Sección Identificación (con duplicados UI) | 3–4h |
| EV-06 | Sección Datos técnicos | 2–3h |
| EV-05 | Sección Origen, coste y fecha | 3–4h |

### Fase 3 — Fotos, documentación y revisión

| Ticket | Descripción | Estimación |
|---|---|---|
| EV-07 | Sección Fotos del vehículo | 4–5h |
| EV-08 | Sección Documentación y OCR | 5–6h |
| EV-09 | Sección Revisión, ubicación, estado y observaciones | 3–4h |

### Fase 4 — Automatizaciones, alertas, permisos e integración

| Ticket | Descripción | Estimación |
|---|---|---|
| EV-10 | Automatizaciones post-entrada | 3–4h |
| EV-11 | Alertas de entrada de vehículo | 3–4h |
| EV-12 | Permisos por perfil (gerente/trabajador) | 3–4h |
| EV-13 | Conexiones con módulos existentes | 4–5h |

**Total estimado:** 40–55 horas

### Árbol de dependencias

```
Fase 1 (paralelo):
  EV-01 ──┐
  EV-02 ──┤
           │
Fase 2 (secuencial sobre EV-03):
  EV-03 ──┤
     ├── EV-04 (necesita EV-01)
     ├── EV-06
     └── EV-05
           │
Fase 3 (secuencial sobre Fase 2):
     ├── EV-07
     ├── EV-08 (necesita EV-02)
     └── EV-09
           │
Fase 4 (después de Fase 3):
  EV-10 (necesita EV-01, EV-02)
  EV-11 (necesita EV-01, EV-02, EV-10)
  EV-12 (necesita EV-03, EV-10)
  EV-13 (necesita EV-09, EV-10, EV-11)
```

### Conexiones con otros módulos

| Módulo | Tipo de conexión |
|---|---|
| Stock vehículos (`/saas/vehicles`) | El vehículo dado de alta aparece en el listado; comparte modelo `type: 'car'` |
| Documentación (`documentsController`) | Los documentos subidos se vinculan al vehículo y son accesibles desde el módulo general |
| OCR (`/api/ocr/vehicle-doc`) | Extracción de datos de ficha técnica para auto-rellenar el formulario |
| Gastos preparación (`associatedCosts`) | El precio de compra es el primer coste; se pueden añadir más desde la ficha |
| Dashboard (`/api/dashboard/kpis`) | KPI "Entradas este mes"; alertas de entradas incompletas o pendientes de validar |
| CRM / Proveedores | Autocompletado de proveedor desde la base de datos de contactos |
| Alertas (`alertEngine.js`) | 4 nuevas alertas: sin docs, sin precio, matrícula duplicada, bastidor duplicado |
| Activity Logs | Registro de quién dio de alta cada vehículo, cuándo y con qué nivel de completitud |
