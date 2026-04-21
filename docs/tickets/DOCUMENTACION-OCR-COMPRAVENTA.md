# DOCUMENTACIÓN Y OCR — Vertical Compraventa — Plan de Tickets

**Tipo:** Página completa
**URL:** `/saas/documents` (actualmente genérica) → especializar para compraventa
**Vertical:** Compraventa de vehículos (`carDealership`)
**Objetivo:** Centralizar la documentación del vehículo y de la operación con OCR inteligente, vinculación automática, archivo por expediente e histórico documental.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo de documento CouchDB (`type: 'document'`) | Completo | `services/couchdb.js` — `buildDocumentRecord` (líneas 2419–2453) |
| Campos del documento: `clientId`, `vehicleId`, `saleId`, `name`, `category`, `status`, `content`, `fileUrl`, `mimeType`, `tags`, `notes` | Completo | `services/couchdb.js` — `buildDocumentRecord` |
| Versionado de documento (`version`, `previousVersionId`) | Completo | `services/couchdb.js` — líneas 2439–2440 |
| Estados de documento: `draft`, `pending_signature`, `signed`, `rejected`, `expired` | Completo | `services/couchdb.js` — `normalizeDocumentStatus` |
| CRUD backend de documentos (`list`, `create`, `update`, `delete`) | Completo | `controllers/documentsController.js`, `routers/documentsRouter.js` |
| Filtrado por `clientId`, `saleId`, `vehicleId`, `status` en listado | Completo | `controllers/documentsController.js` — `listDocuments` (líneas 37–43) |
| CRUD frontend de documentos (API client) | Completo | `src/app/lib/documentsApi.ts` |
| Página `DocumentsPage` con tabs por categoría | Completo | `src/app/pages/saas/DocumentsPage.tsx` |
| Página `DocumentDetail` con histórico mock | Parcial (usa datos mock) | `src/app/pages/saas/DocumentDetail.tsx` |
| Modal de subida de documento (`SAAS__UploadDocumentModal`) | Completo | `src/app/components/design-system/SAAS__UploadDocumentModal.tsx` |
| Modal generar desde plantilla (`SAAS__GenerateFromTemplateModal`) | Completo | `src/app/components/design-system/SAAS__GenerateFromTemplateModal.tsx` |
| Modal OCR scan con IA (`SAAS__OcrScanModal`) | Completo | `src/app/components/design-system/SAAS__OcrScanModal.tsx` |
| Endpoint OCR con OpenAI Vision (GPT-4o) | Completo | `index.js` — `/api/ocr/scan` (línea 1056+) |
| OCR extrae: tipo, emisor, receptor, fecha, nº documento, líneas, subtotal, IVA, total | Completo | `index.js` — prompt OCR |
| Modal firma de documento (`SAAS__SignDocumentModal`) | Completo | Componente importado en `DocumentsPage` |
| Modal envío a gestoría (`SAAS__SendToAgencyModal`) | Completo | Componente importado en `DocumentsPage` |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Activity logging en operaciones de documentos | Completo | `controllers/documentsController.js` — `logAccountActivity` |
| Sidebar: grupo `documentacion` visible en `carDealership` | Completo | `Sidebar.tsx` — línea 451 |
| Ruta `/saas/documents` y `/saas/documents/:id` | Completo | `routes.tsx` — líneas 432–433 |
| Búsqueda básica por nombre de documento y nombre de vehículo | Completo | `DocumentsPage.tsx` — líneas 192–199 |

### Lo que FALTA (gap con los requisitos)

| Funcionalidad | Estado |
|---|---|
| **Categorías específicas compraventa**: permiso circulación, ficha técnica, contrato compra, contrato venta, factura, ITV, reparaciones, justificantes, docs cliente, anexos | No existe — categorías actuales son genéricas (`society`, `contracts`, `licenses`, `financial`, `user-expenses`, `other`) |
| **Búsqueda avanzada**: por matrícula, bastidor (VIN), cliente o proveedor | No existe — búsqueda actual solo filtra por nombre y vehículo (texto libre) |
| **Vinculación automática** documento → vehículo + cliente | Parcial — se puede vincular manualmente en OCR modal, pero no hay auto-vinculación por matrícula/NIF detectado |
| **Archivado por expediente**: agrupar docs por vehículo como "expediente" | No existe — documentos son listados planos sin agrupación |
| **Histórico documental** real (no mock) | No existe — `DocumentDetail` usa datos mock |
| **Documentos obligatorios faltantes**: checklist de docs requeridos por vehículo | No existe |
| **Alerta ITV caducada o próxima** | No existe en alertEngine |
| **Alerta contrato pendiente de firmar** | No existe en alertEngine |
| **Alerta OCR incompleto** (datos parciales extraídos) | No existe |
| **OCR enriquecido**: extraer matrícula, bastidor, NIF desde permiso/ficha técnica | No existe — OCR actual solo extrae datos financieros (facturas, gastos) |
| **Perfil gerente vs trabajador**: permisos diferenciados en documentación | No existe — todos ven lo mismo |
| **Conexión con Gastos de preparación** | No existe directamente |
| **Conexión con Reservas** | No existe directamente |
| **Conexión con Cierre de venta** | Solo `saleId` como campo, sin UI de conexión |

---

## Tickets

---

### DOC-01 — Modelo de datos: Categorías documentales de compraventa

**Tipo:** Backend + CouchDB
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto

El modelo actual (`buildDocumentRecord` en `services/couchdb.js`) usa un campo `category` de texto libre. Las categorías actuales del frontend (`society`, `contracts`, `licenses`, `financial`, `user-expenses`, `other`) son genéricas para cualquier vertical. La vertical de compraventa necesita categorías específicas del sector automoción para organizar correctamente el expediente documental de cada vehículo.

#### Qué hacer

**1. Ampliar el schema de categorías en `services/couchdb.js`**

Añadir un campo `docSubCategory` al `buildDocumentRecord` que permita la clasificación fina dentro del vertical, manteniendo las categorías base (`category`) para retrocompatibilidad.

```typescript
export type CompraventaDocCategory =
  | 'permiso_circulacion'     // Permiso de circulación
  | 'ficha_tecnica'           // Ficha técnica del vehículo
  | 'contrato_compra'         // Contrato de compra al proveedor/particular
  | 'contrato_venta'          // Contrato de venta al cliente
  | 'factura_compra'          // Factura de compra
  | 'factura_venta'           // Factura de venta
  | 'itv'                     // Inspección Técnica de Vehículos
  | 'reparacion'              // Documentos de reparación / taller
  | 'justificante'            // Justificantes de pago, transferencia, etc.
  | 'doc_cliente'             // DNI, NIE, CIF, mandato SEPA del cliente
  | 'anexo'                   // Cualquier anexo adicional
  | 'seguro'                  // Póliza de seguro temporal o transferencia
  | 'informe_trafico'         // Informe de tráfico / DGT
  | 'otro';                   // Otros

export interface CompraventaDocFields {
  docSubCategory: CompraventaDocCategory;
  registrationPlate?: string;   // Matrícula vinculada
  vin?: string;                 // Número de bastidor
  itvExpiryDate?: string;       // Fecha caducidad ITV (ISO)
  isRequired?: boolean;         // true si es obligatorio para la operación
  ocrData?: OcrData;            // Datos extraídos por OCR
  ocrConfidence?: number;       // 0-100 confianza del OCR
  supplierId?: string;          // Proveedor vinculado
  supplierName?: string;        // Nombre del proveedor (desnormalizado)
}
```

**2. Actualizar `buildDocumentRecord` en `services/couchdb.js`**

Añadir los campos nuevos al builder, preservando los existentes:

```javascript
// Dentro de buildDocumentRecord, añadir:
docSubCategory: String(data.docSubCategory || 'otro'),
registrationPlate: String(data.registrationPlate || ''),
vin: String(data.vin || ''),
itvExpiryDate: String(data.itvExpiryDate || ''),
isRequired: Boolean(data.isRequired || false),
ocrData: data.ocrData || null,
ocrConfidence: Number(data.ocrConfidence || 0),
supplierId: String(data.supplierId || ''),
supplierName: String(data.supplierName || '').trim(),
```

**3. Actualizar `sanitizeDocumentRecord` en `services/couchdb.js`**

Incluir los campos nuevos en la sanitización para que el frontend los reciba:

```javascript
// Dentro de sanitizeDocumentRecord, añadir:
docSubCategory: doc.docSubCategory || 'otro',
registrationPlate: doc.registrationPlate || '',
vin: doc.vin || '',
itvExpiryDate: doc.itvExpiryDate || '',
isRequired: doc.isRequired || false,
ocrData: doc.ocrData || null,
ocrConfidence: doc.ocrConfidence || 0,
supplierId: doc.supplierId || '',
supplierName: doc.supplierName || '',
```

**4. Actualizar `documentsApi.ts` (frontend)**

Ampliar la interfaz `DocumentRecord` con los campos nuevos:

```typescript
export interface DocumentRecord {
  // ... campos existentes ...
  docSubCategory?: string;
  registrationPlate?: string;
  vin?: string;
  itvExpiryDate?: string;
  isRequired?: boolean;
  ocrData?: OcrData;
  ocrConfidence?: number;
  supplierId?: string;
  supplierName?: string;
}
```

#### Criterios de aceptación

- [ ] `buildDocumentRecord` acepta y persiste los nuevos campos sin romper documentos existentes
- [ ] Los documentos existentes sin los campos nuevos devuelven valores por defecto seguros
- [ ] `sanitizeDocumentRecord` expone todos los campos nuevos al frontend
- [ ] `DocumentRecord` en `documentsApi.ts` refleja los campos nuevos
- [ ] Tests unitarios validan que documentos legacy se normalizan correctamente

---

### DOC-02 — Búsqueda avanzada: matrícula, bastidor, cliente y proveedor

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** DOC-01

#### Contexto

La búsqueda actual en `DocumentsPage.tsx` (líneas 192–199) solo filtra client-side por `name` y `vehicleName`. Los requisitos exigen poder buscar por matrícula, bastidor (VIN), nombre de cliente o nombre de proveedor. Además, el backend (`documentsController.js` líneas 37–43) filtra por IDs exactos pero no por texto parcial.

#### Qué hacer

**1. Backend: Ampliar filtros en `listDocuments` (`controllers/documentsController.js`)**

Añadir un parámetro `q` (query text) al endpoint `GET /api/documents/:userId` que busque en múltiples campos:

```javascript
if (req.query.q) {
  const q = String(req.query.q).toLowerCase().trim();
  docs = docs.filter((d) =>
    (d.name || '').toLowerCase().includes(q) ||
    (d.registrationPlate || '').toLowerCase().includes(q) ||
    (d.vin || '').toLowerCase().includes(q) ||
    (d.clientName || '').toLowerCase().includes(q) ||
    (d.supplierName || '').toLowerCase().includes(q) ||
    (d.vehicleName || '').toLowerCase().includes(q) ||
    (d.docSubCategory || '').toLowerCase().includes(q)
  );
}
```

Añadir filtro por `docSubCategory`:

```javascript
if (req.query.docSubCategory) {
  docs = docs.filter((d) => d.docSubCategory === req.query.docSubCategory);
}
```

**2. Frontend: Actualizar `DocumentsPage.tsx`**

Reemplazar el filtro local simplificado por un buscador que:

- Tenga un input de búsqueda unificado (matrícula, bastidor, cliente, proveedor, nombre doc)
- Muestre sugerencias debajo del input agrupadas por tipo (matrícula encontrada, cliente encontrado, etc.)
- Permita filtrar por `docSubCategory` con un dropdown o chips

```typescript
const filtered = useMemo(() => {
  if (!searchQuery) return byTab;
  const q = searchQuery.toLowerCase();
  return byTab.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.vehicleName?.toLowerCase().includes(q) ||
    d.registrationPlate?.toLowerCase().includes(q) ||
    d.vin?.toLowerCase().includes(q) ||
    d.clientName?.toLowerCase().includes(q) ||
    d.supplierName?.toLowerCase().includes(q)
  );
}, [byTab, searchQuery]);
```

**3. Frontend: Añadir barra de filtros rápidos bajo la barra de búsqueda**

Chips filtrables por subcategoría con contadores:

```
[Todos (24)] [Permisos (3)] [Fichas téc. (3)] [Contratos compra (2)] [ITV (3)] [Facturas (5)] ...
```

#### Criterios de aceptación

- [ ] Se puede buscar por matrícula parcial (ej: "1234" encuentra "1234 ABC")
- [ ] Se puede buscar por VIN parcial
- [ ] Se puede buscar por nombre de cliente
- [ ] Se puede buscar por nombre de proveedor
- [ ] Se puede filtrar por subcategoría documental
- [ ] La búsqueda es instantánea (client-side) con datos ya cargados
- [ ] Funciona en desktop y en móvil

---

### DOC-03 — Tabs por categoría de compraventa (reemplazo de tabs genéricos)

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** DOC-01

#### Contexto

Los tabs actuales de `DocumentsPage.tsx` (líneas 97–104) son genéricos: `Sociedad`, `Contratos y alquileres`, `Licencias`, `Impuestos`, `Gastos del usuario`, `Otros`. La vertical de compraventa necesita tabs propios que reflejen la operativa real: documentación del vehículo, contratos, facturas, ITV/inspecciones, documentos del cliente, etc.

Hay que detectar la vertical activa y mostrar tabs diferentes según el `businessType`.

#### Qué hacer

**1. Definir tabs para compraventa**

```typescript
const COMPRAVENTA_TAB_DEFS: TabDef[] = [
  { id: 'vehiculo',   label: 'Vehículo',          subtitle: 'Permiso, ficha técnica, informe tráfico',
    subCategories: ['permiso_circulacion', 'ficha_tecnica', 'informe_trafico'] },
  { id: 'contratos',  label: 'Contratos',          subtitle: 'Compra, venta y reserva',
    subCategories: ['contrato_compra', 'contrato_venta'] },
  { id: 'facturas',   label: 'Facturas',           subtitle: 'Facturas de compra y venta',
    subCategories: ['factura_compra', 'factura_venta'] },
  { id: 'itv',        label: 'ITV y seguro',       subtitle: 'Inspecciones y pólizas',
    subCategories: ['itv', 'seguro'] },
  { id: 'reparacion', label: 'Reparaciones',       subtitle: 'Informes de taller y preparación',
    subCategories: ['reparacion'] },
  { id: 'cliente',    label: 'Docs cliente',       subtitle: 'DNI, NIE, CIF, mandato SEPA',
    subCategories: ['doc_cliente', 'justificante'] },
  { id: 'anexos',     label: 'Anexos',             subtitle: 'Documentación adicional',
    subCategories: ['anexo', 'otro'] },
];
```

**2. Detectar la vertical activa**

Usar `useBusiness()` para obtener el `businessType` y renderizar los tabs correspondientes:

```typescript
const { currentBusiness } = useBusiness();
const isCompraventa = currentBusiness?.businessType === 'carDealership';
const tabDefs = isCompraventa ? COMPRAVENTA_TAB_DEFS : GENERIC_TAB_DEFS;
```

**3. Actualizar el filtrado**

Los tabs de compraventa filtran por `docSubCategory` en lugar de `category`:

```typescript
const byTab = useMemo(() => {
  const currentTab = tabDefs.find(t => t.id === activeTab);
  if (!currentTab?.subCategories) return allDocuments;
  return allDocuments.filter(d =>
    currentTab.subCategories.includes(d.docSubCategory)
  );
}, [allDocuments, activeTab, tabDefs]);
```

**4. Actualizar el Sidebar**

Reemplazar los items `doc-society`, `doc-contracts`, etc. por items específicos de compraventa cuando la vertical es `carDealership`. Mantener los genéricos como fallback para otras verticales.

#### Criterios de aceptación

- [ ] En vertical `carDealership`, los tabs son los de compraventa
- [ ] En otras verticales, se mantienen los tabs genéricos actuales
- [ ] El conteo de documentos por tab es correcto
- [ ] Los tabs son scrollables horizontalmente en móvil
- [ ] La URL refleja el tab activo (`?tab=vehiculo`, `?tab=contratos`, etc.)
- [ ] El Sidebar muestra ítems coherentes con los tabs de compraventa

---

### DOC-04 — Vista de expediente por vehículo

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** DOC-01, DOC-03

#### Contexto

Actualmente los documentos se listan en un listado plano. En compraventa, la unidad natural de agrupación es el vehículo: cada coche tiene su "expediente" con todos los documentos asociados. Se necesita una vista alternativa que agrupe documentos por vehículo, mostrando un resumen del estado documental de cada uno.

#### Qué hacer

**1. Crear componente `VehicleDocDossier`**

Un panel expandible por vehículo que muestre:

- Cabecera: foto miniatura del vehículo, matrícula, marca/modelo, estado documental (completo/incompleto)
- Barra de progreso: X de Y documentos obligatorios presentes
- Lista de documentos agrupados por subcategoría
- Botón "Subir documento" vinculado al vehículo
- Badge de alerta si faltan documentos obligatorios

```
┌─────────────────────────────────────────────────────────┐
│ 🚗 1234 ABC · BMW Serie 3 2021         [██████░░] 6/8  │
│ ⚠ Falta: Ficha técnica, ITV                            │
├─────────────────────────────────────────────────────────┤
│  📄 Permiso circulación         ✅ Firmado    14/03/26  │
│  📄 Contrato de compra          ✅ Firmado    10/03/26  │
│  📄 Contrato de venta           ⏳ Pendiente  12/04/26  │
│  📄 Factura compra              ✅ Completado 10/03/26  │
│  📄 Factura venta               ⏳ Borrador   —         │
│  📄 Seguro temporal             ✅ Completado 11/03/26  │
│                                                         │
│  [+ Subir documento]  [📷 OCR]  [📋 Generar plantilla] │
└─────────────────────────────────────────────────────────┘
```

**2. Añadir toggle de vista en `DocumentsPage`**

Un toggle `Lista / Expedientes` en la toolbar que alterne entre:
- Vista actual (lista plana con tabs)
- Vista expediente (agrupado por vehículo)

**3. Integrar el checklist de docs obligatorios**

Para cada vehículo, definir la lista de documentos obligatorios basada en el tipo de operación:

```typescript
const REQUIRED_DOCS_COMPRAVENTA: CompraventaDocCategory[] = [
  'permiso_circulacion',
  'ficha_tecnica',
  'contrato_compra',
  'contrato_venta',
  'factura_compra',
  'factura_venta',
  'itv',
  'doc_cliente',
];
```

Para cada vehículo, calcular cuántos de los obligatorios están presentes y cuáles faltan.

#### Criterios de aceptación

- [ ] Se puede alternar entre vista lista y vista expediente
- [ ] La vista expediente agrupa documentos por vehículo
- [ ] Cada expediente muestra la barra de progreso documental
- [ ] Se muestra claramente qué documentos faltan
- [ ] Se puede subir un documento directamente al expediente de un vehículo
- [ ] Vehículos sin documentos aparecen con expediente vacío y CTA para subir
- [ ] Documentos sin vehículo aparecen en sección "Sin asignar"
- [ ] Funciona en desktop (tabla expandible) y en móvil (acordeón)

---

### DOC-05 — OCR enriquecido para documentos de vehículo

**Tipo:** Backend (endpoint OCR)
**Prioridad:** Alta
**Dependencias:** DOC-01

#### Contexto

El endpoint OCR actual (`/api/ocr/scan` en `index.js`, línea 1056) está optimizado para documentos financieros (facturas, gastos, recibos). Su prompt de sistema pide extraer `documentType`, `emitter`, `receiver`, `date`, `documentNumber`, `subtotal`, `taxRate`, `taxAmount`, `total`, `lines`. Pero los requisitos de compraventa incluyen documentos que no son financieros: permisos de circulación, fichas técnicas, contratos, ITV. Necesitamos que el OCR detecte también matrícula, bastidor (VIN), titulares, fechas de caducidad, etc.

#### Qué hacer

**1. Crear un segundo prompt OCR para documentos de vehículo**

Añadir un parámetro `ocrMode` al endpoint (`financial` por defecto, `vehicle` para compraventa):

```javascript
app.post('/api/ocr/scan', requireAuth, sensitiveOpLimiter, async (req, res) => {
  const { imageBase64, mimeType, ocrMode } = req.body || {};
  // ...
  const systemPrompt = ocrMode === 'vehicle'
    ? VEHICLE_OCR_PROMPT
    : FINANCIAL_OCR_PROMPT;
  // ...
});
```

**2. Definir `VEHICLE_OCR_PROMPT`**

```
Eres un experto en OCR de documentos de automoción españoles (permisos de circulación, fichas técnicas, contratos de compraventa, ITV, facturas, seguros).
Analiza la imagen y extrae toda la información posible en formato JSON estricto.
Responde SOLO con JSON válido, sin markdown ni texto adicional.
El JSON debe tener esta estructura:
{
  "documentType": "permiso_circulacion" | "ficha_tecnica" | "contrato_compra" | "contrato_venta" | "factura_compra" | "factura_venta" | "itv" | "seguro" | "reparacion" | "doc_cliente" | "otro",
  "documentTypeLabel": "Descripción legible del tipo",
  "registrationPlate": "matrícula del vehículo (ej: 1234 ABC)" | null,
  "vin": "número de bastidor / VIN" | null,
  "vehicleBrand": "marca del vehículo" | null,
  "vehicleModel": "modelo del vehículo" | null,
  "vehicleYear": número o null,
  "ownerName": "nombre del titular / propietario" | null,
  "ownerNif": "NIF/NIE/CIF del titular" | null,
  "buyerName": "nombre del comprador (si contrato/factura)" | null,
  "buyerNif": "NIF/NIE/CIF del comprador" | null,
  "sellerName": "nombre del vendedor (si contrato/factura)" | null,
  "sellerNif": "NIF/NIE/CIF del vendedor" | null,
  "date": "fecha del documento en formato YYYY-MM-DD" | null,
  "expiryDate": "fecha de caducidad (ITV, seguro) en YYYY-MM-DD" | null,
  "documentNumber": "número de documento" | null,
  "total": importe total (número) | null,
  "currency": "EUR" | null,
  "notes": "cualquier dato adicional relevante" | null,
  "confidence": número 0–100 indicando confianza general en la extracción
}
Si no puedes extraer un campo, devuelve null.
```

**3. Actualizar `SAAS__OcrScanModal.tsx`**

- Añadir un selector de modo antes de escanear: "Documento financiero" / "Documento de vehículo"
- Si es modo vehículo, mostrar los campos extraídos relevantes (matrícula, bastidor, titular, fechas) en lugar de subtotal/líneas
- Auto-vincular al vehículo si se detecta matrícula coincidente en `vehicles`

**4. Auto-vinculación inteligente**

Tras recibir el resultado OCR, si se detecta `registrationPlate`:
- Buscar en la lista de vehículos del contexto (`vehicles`) uno que coincida
- Si se encuentra, pre-seleccionar automáticamente el `vehicleId`
- Si se detecta `buyerNif` o `buyerName`, buscar en `clients` y pre-seleccionar

#### Criterios de aceptación

- [ ] El endpoint acepta `ocrMode: 'vehicle'` y usa el prompt de vehículo
- [ ] El prompt de vehículo extrae matrícula, bastidor, titular, NIF, fecha caducidad
- [ ] El modal OCR permite elegir entre modo financiero y modo vehículo
- [ ] Si se detecta matrícula, se auto-vincula al vehículo existente
- [ ] Si se detecta nombre/NIF de cliente, se auto-vincula al cliente existente
- [ ] El campo `confidence` se guarda como `ocrConfidence` en el documento
- [ ] Los campos extraídos se guardan en `ocrData` del documento
- [ ] Funciona con permisos de circulación españoles
- [ ] Funciona con fichas técnicas
- [ ] Funciona con ITV (detecta fecha caducidad)
- [ ] Funciona con contratos de compraventa (detecta comprador/vendedor)

---

### DOC-06 — Vinculación automática documento → vehículo + cliente

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** DOC-01, DOC-05

#### Contexto

Actualmente, la vinculación de un documento a un vehículo o cliente se hace manualmente mediante selectores en el modal OCR y en el modal de subida. Los requisitos piden que la vinculación sea automática cuando sea posible: al subir un documento, si el OCR detecta una matrícula o un NIF, debe vincular automáticamente; si no hay OCR, ofrecer búsqueda por matrícula/bastidor.

#### Qué hacer

**1. Backend: Endpoint de búsqueda de vehículo por matrícula/VIN**

Añadir a `routers/vehicleRouter.js`:

```javascript
vehicleRouter.get('/:userId/search', async (req, res) => {
  const { q } = req.query;
  // Buscar por registrationPlate o vin (case-insensitive, parcial)
});
```

**2. Backend: Endpoint de búsqueda de cliente por NIF/nombre**

Verificar si ya existe en el CRM controller; si no, añadir:

```javascript
crmRouter.get('/:userId/clients/search', async (req, res) => {
  const { q } = req.query;
  // Buscar por nif, name, email (case-insensitive, parcial)
});
```

**3. Frontend: Auto-vinculación post-OCR**

En `SAAS__OcrScanModal.tsx`, en el paso `result`:

```typescript
useEffect(() => {
  if (ocrResult?.registrationPlate) {
    const match = vehicles.find(v =>
      v.registrationPlate?.replace(/\s/g, '').toLowerCase() ===
      ocrResult.registrationPlate.replace(/\s/g, '').toLowerCase()
    );
    if (match) {
      setVehicleId(match.id);
      toast.info(`Vehículo detectado: ${match.brand} ${match.model}`);
    }
  }
  if (ocrResult?.buyerNif || ocrResult?.buyerName) {
    const match = clients.find(c =>
      c.nif === ocrResult.buyerNif ||
      c.name.toLowerCase() === ocrResult.buyerName?.toLowerCase()
    );
    if (match) {
      setClientId(match.id);
      toast.info(`Cliente detectado: ${match.name}`);
    }
  }
}, [ocrResult]);
```

**4. Frontend: Búsqueda manual mejorada en modales de subida**

Reemplazar los `<select>` planos de vehículo/cliente por un componente de búsqueda con autocomplete que busque por matrícula/bastidor/nombre:

```
┌──────────────────────────────────┐
│ 🔍 Buscar vehículo...           │
├──────────────────────────────────┤
│ 1234 ABC · BMW Serie 3 2021     │
│ 5678 DEF · Audi A4 2020        │
└──────────────────────────────────┘
```

#### Criterios de aceptación

- [ ] Tras OCR con matrícula detectada, el vehículo se pre-selecciona automáticamente
- [ ] Tras OCR con NIF/nombre, el cliente se pre-selecciona automáticamente
- [ ] Se muestra un toast informativo cuando se auto-vincula
- [ ] El usuario puede corregir la vinculación automática
- [ ] Los selectores de vehículo/cliente tienen búsqueda con autocomplete
- [ ] Se puede buscar vehículo por matrícula o bastidor
- [ ] Se puede buscar cliente por nombre o NIF

---

### DOC-07 — Histórico documental real (activity log)

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** DOC-01

#### Contexto

La página `DocumentDetail.tsx` (líneas 55–100) muestra un histórico mock con entradas fijas. El backend ya tiene activity logging (`logAccountActivity` en `documentsController.js`), pero el frontend no consume esos datos. Necesitamos que el histórico sea real y refleje cada acción sobre el documento.

#### Qué hacer

**1. Backend: Endpoint de histórico por documento**

Añadir a `routers/documentsRouter.js`:

```javascript
documentsRouter.get('/:userId/:documentId/history', getDocumentHistory);
```

En `documentsController.js`:

```javascript
export async function getDocumentHistory(req, res) {
  const { userId, documentId } = req.params;
  // Buscar en la DB de actividad todos los registros donde entityId === documentId
  // Ordenar por timestamp descendente
  // Devolver lista de eventos
}
```

**2. Frontend: Consumir histórico real en `DocumentDetail.tsx`**

Reemplazar el histórico mock por una llamada a la API:

```typescript
const [history, setHistory] = useState<HistoryEntry[]>([]);

useEffect(() => {
  if (document?.id) {
    fetchDocumentHistory(userId, document.id).then(setHistory);
  }
}, [document?.id]);
```

**3. Registrar más eventos en el activity log**

Asegurar que se logueen todos estos eventos:
- Documento creado (ya existe)
- Documento actualizado
- Documento firmado
- Documento enviado a gestoría
- Archivo adjuntado
- OCR ejecutado sobre el documento
- Vinculación a vehículo/cliente cambiada
- Documento eliminado
- Documento descargado
- Categoría o subcategoría cambiada

**4. UI del timeline**

Mostrar el histórico como una línea temporal visual con:
- Icono por tipo de evento (upload, edit, sign, send, ocr, link, delete)
- Actor (quién lo hizo)
- Timestamp relativo ("hace 2 horas") con tooltip de fecha exacta
- Descripción del evento

#### Criterios de aceptación

- [ ] El histórico muestra datos reales, no mock
- [ ] Cada acción sobre el documento genera una entrada de activity log
- [ ] El timeline se renderiza cronológicamente (más reciente arriba)
- [ ] Cada entrada muestra actor, acción, descripción y fecha
- [ ] El diseño del timeline es consistente con el resto de la UI
- [ ] Se muestra un estado vacío si el documento es nuevo y no tiene historial

---

### DOC-08 — Alertas: documento obligatorio faltante, ITV caducada, contrato pendiente, OCR incompleto

**Tipo:** Backend (alertEngine)
**Prioridad:** Alta
**Dependencias:** DOC-01, DOC-04

#### Contexto

El `alertEngine.js` ya tiene la infraestructura de alertas con deduplicación, SSE y Web Push. Las alertas se ejecutan periódicamente (cada 1h) y generan notificaciones. Hay que añadir reglas específicas para documentación de compraventa.

#### Qué hacer

**1. Regla: Documento obligatorio faltante**

Para cada vehículo con estado `available` o `reserved`, comprobar que tiene los documentos obligatorios. Si falta alguno, emitir alerta:

```javascript
async function checkMissingRequiredDocs(userId) {
  const vehicles = await fetchAllDocsOfType(VEHICLES_DB, 'vehicle');
  const documents = await fetchAllDocs(getDocumentsDbName());

  const REQUIRED = [
    'permiso_circulacion', 'ficha_tecnica', 'contrato_compra',
    'factura_compra', 'itv',
  ];

  for (const vehicle of vehicles) {
    if (!['available', 'reserved', 'in_preparation'].includes(vehicle.status)) continue;

    const vehicleDocs = documents.filter(d => d.vehicleId === vehicle._id);
    const presentCategories = new Set(vehicleDocs.map(d => d.docSubCategory));
    const missing = REQUIRED.filter(cat => !presentCategories.has(cat));

    if (missing.length > 0) {
      await emitAlert({
        userId,
        dedupKey: `missing-docs:${vehicle._id}`,
        level: 'warning',
        category: 'documentacion',
        title: `Documentos faltantes: ${vehicle.registrationPlate || vehicle._id}`,
        message: `Faltan ${missing.length} documentos obligatorios: ${missing.join(', ')}`,
        entityId: vehicle._id,
        entityType: 'vehicle',
        route: `/saas/documents?view=dossier&vehicle=${vehicle._id}`,
      });
    }
  }
}
```

**2. Regla: ITV caducada o próxima (30 días)**

```javascript
async function checkItvExpiry(userId) {
  const documents = await fetchAllDocs(getDocumentsDbName());
  const now = new Date();

  const itvDocs = documents.filter(d => d.docSubCategory === 'itv' && d.itvExpiryDate);

  for (const doc of itvDocs) {
    const expiry = new Date(doc.itvExpiryDate);
    const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);

    if (daysUntil < 0) {
      await emitAlert({
        userId,
        dedupKey: `itv-expired:${doc.vehicleId}`,
        level: 'warning',
        category: 'documentacion',
        title: `ITV caducada: ${doc.registrationPlate || doc.vehicleId}`,
        message: `La ITV caducó hace ${Math.abs(daysUntil)} días`,
        entityId: doc.vehicleId,
        entityType: 'vehicle',
        route: `/saas/vehicles/${doc.vehicleId}`,
      });
    } else if (daysUntil <= 30) {
      await emitAlert({
        userId,
        dedupKey: `itv-expiring:${doc.vehicleId}`,
        level: 'info',
        category: 'documentacion',
        title: `ITV próxima a caducar: ${doc.registrationPlate || doc.vehicleId}`,
        message: `La ITV caduca en ${daysUntil} días (${doc.itvExpiryDate})`,
        entityId: doc.vehicleId,
        entityType: 'vehicle',
        route: `/saas/vehicles/${doc.vehicleId}`,
      });
    }
  }
}
```

**3. Regla: Contrato pendiente de firmar (> 48h)**

```javascript
async function checkPendingContracts(userId) {
  const documents = await fetchAllDocs(getDocumentsDbName());
  const now = new Date();

  const contracts = documents.filter(d =>
    ['contrato_compra', 'contrato_venta'].includes(d.docSubCategory) &&
    d.status === 'draft'
  );

  for (const doc of contracts) {
    const created = new Date(doc.createdAt);
    const hoursOld = (now.getTime() - created.getTime()) / 3_600_000;

    if (hoursOld > 48) {
      await emitAlert({
        userId,
        dedupKey: `contract-pending:${doc._id}`,
        level: 'warning',
        category: 'documentacion',
        title: `Contrato pendiente de firmar`,
        message: `"${doc.name}" lleva ${Math.floor(hoursOld / 24)} días sin firmar`,
        entityId: doc._id,
        entityType: 'document',
        route: `/saas/documents/${doc._id}`,
      });
    }
  }
}
```

**4. Regla: OCR incompleto (confidence < 60)**

```javascript
async function checkIncompleteOcr(userId) {
  const documents = await fetchAllDocs(getDocumentsDbName());
  const now = new Date();

  const recent = documents.filter(d =>
    d.ocrData &&
    d.ocrConfidence > 0 &&
    d.ocrConfidence < 60 &&
    daysBetween(d.createdAt, now) <= 7
  );

  for (const doc of recent) {
    await emitAlert({
      userId,
      dedupKey: `ocr-incomplete:${doc._id}`,
      level: 'info',
      category: 'documentacion',
      title: `OCR incompleto: ${doc.name}`,
      message: `La lectura automática tiene baja confianza (${doc.ocrConfidence}%). Revisa los datos manualmente.`,
      entityId: doc._id,
      entityType: 'document',
      route: `/saas/documents/${doc._id}`,
    });
  }
}
```

**5. Registrar las nuevas reglas en el ciclo de alertas**

En `alertEngine.js`, añadir las 4 funciones al ciclo `runAlertCycle`:

```javascript
await checkMissingRequiredDocs(userId);
await checkItvExpiry(userId);
await checkPendingContracts(userId);
await checkIncompleteOcr(userId);
```

#### Criterios de aceptación

- [ ] Se genera alerta cuando un vehículo activo tiene documentos obligatorios faltantes
- [ ] Se genera alerta cuando la ITV de un vehículo está caducada
- [ ] Se genera alerta cuando la ITV caduca en los próximos 30 días
- [ ] Se genera alerta cuando un contrato lleva > 48h sin firmar
- [ ] Se genera alerta cuando un OCR tiene confianza < 60%
- [ ] Las alertas tienen deduplicación de 24h (no se repiten)
- [ ] Las alertas se envían por SSE y Web Push
- [ ] Las alertas incluyen enlace directo al documento/vehículo afectado
- [ ] Las alertas aparecen en el panel de notificaciones existente

---

### DOC-09 — Panel de alertas documentales en Dashboard

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** DOC-08

#### Contexto

Las alertas se generan en el backend pero necesitan visibilidad inmediata en el Dashboard. Actualmente existe `CrmAlertsPanel` (`src/app/components/saas/CrmAlertsPanel.tsx`) que muestra alertas CRM. Necesitamos un panel similar o una sección dentro del Dashboard que muestre las alertas documentales.

#### Qué hacer

**1. Crear componente `DocumentAlertsWidget`**

Un widget para el Dashboard que muestre las alertas documentales activas, agrupadas por tipo:

```
┌─────────────────────────────────────────────────────┐
│ 📋 Documentación          ver todo →                │
├─────────────────────────────────────────────────────┤
│ ⚠️ 3 vehículos con documentos faltantes            │
│ 🔴 1 ITV caducada (2345 BCD · Renault Clio)        │
│ 🟡 2 ITVs próximas a caducar                       │
│ ⏳ 1 contrato pendiente de firmar (> 48h)           │
│ 🔍 1 OCR con baja confianza                        │
└─────────────────────────────────────────────────────┘
```

**2. Integrar en el Dashboard existente**

Añadir el widget al layout del `Dashboard.tsx` junto a los demás widgets operativos.

**3. Cada alerta es clickeable**

Al hacer click, navegar al documento o vehículo afectado usando la `route` de la alerta.

#### Criterios de aceptación

- [ ] El widget aparece en el Dashboard de la vertical `carDealership`
- [ ] Muestra el recuento de alertas activas por tipo
- [ ] Cada alerta es clickeable y lleva al recurso afectado
- [ ] Si no hay alertas, muestra estado "Todo en orden" con check verde
- [ ] El diseño es consistente con los demás widgets del Dashboard

---

### DOC-10 — Permisos por perfil: gerente vs trabajador

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** DOC-01, DOC-03

#### Contexto

Los requisitos especifican dos perfiles:
- **Gerente**: ve y valida toda la documentación (CRUD completo + validación)
- **Trabajador**: sube documentos y consulta los necesarios para la operación (crear + leer, no borrar ni validar)

Actualmente el Sidebar ya diferencia entre `workerMode` y modo normal (línea 799 del Sidebar: `ADMIN_ONLY_GROUPS` incluye `documentacion`). Pero el trabajador necesita acceso parcial a documentación, no cero acceso.

#### Qué hacer

**1. Backend: Añadir middleware de permisos documentales**

```javascript
function docPermission(action) {
  return (req, res, next) => {
    const userRole = req.userRole; // 'admin' | 'manager' | 'worker'
    const allowed = {
      read:     ['admin', 'manager', 'worker'],
      create:   ['admin', 'manager', 'worker'],
      update:   ['admin', 'manager'],
      delete:   ['admin', 'manager'],
      validate: ['admin', 'manager'],
    };
    if (!allowed[action]?.includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Sin permisos' });
    }
    next();
  };
}
```

**2. Frontend: Vista trabajador de documentación**

Crear una versión simplificada de la página de documentación para el modo trabajador:

- Solo puede ver documentos de los vehículos asignados a él (o todos si no hay asignación)
- Puede subir documentos (crear)
- Puede ver el estado del expediente
- NO puede eliminar documentos
- NO puede validar/firmar documentos
- NO puede cambiar el estado de un documento
- Ve un banner informativo: "Para firmar o validar, contacta con tu responsable"

**3. Actualizar Sidebar para trabajador**

Sacar `documentacion` de `ADMIN_ONLY_GROUPS` y crear un grupo limitado para trabajadores con solo las acciones permitidas:

```typescript
// Opción: añadir item específico para worker
{ id: 'worker-documents', navKey: 'workerDocuments', icon: <FileText />, path: '/saas/worker/documents' }
```

O bien permitir que el worker acceda a `/saas/documents` pero con UI limitada basada en su rol.

#### Criterios de aceptación

- [ ] El gerente ve todos los documentos y puede CRUD completo + validar
- [ ] El trabajador ve los documentos relevantes y solo puede crear + leer
- [ ] El trabajador no puede eliminar ni validar documentos
- [ ] Los botones de eliminar/validar no aparecen en la UI del trabajador
- [ ] El backend rechaza con 403 las acciones no permitidas para el rol
- [ ] El trabajador tiene acceso a la sección de documentación en el Sidebar

---

### DOC-11 — Conexión con módulos: Vehículos, Gastos, Reservas, Cierre de venta

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** DOC-01, DOC-04

#### Contexto

Los requisitos piden conexión con: Vehículos, Gastos preparación, Reservas, Cierre de venta, Dashboard. Actualmente el modelo ya tiene `vehicleId`, `clientId`, `saleId`, pero la UI no aprovecha estas relaciones de forma visual ni navegable.

#### Qué hacer

**1. Tab de documentación en `VehicleDetail.tsx`**

El `VehicleDetail` (ya tiene ~4500 líneas) debe incluir una pestaña/sección "Documentación" que muestre:

- Mini-expediente del vehículo (usando `VehicleDocDossier` de DOC-04)
- Barra de progreso de docs obligatorios
- Botón rápido "Subir documento" y "OCR"
- Enlace "Ver expediente completo →" que lleva a `/saas/documents?view=dossier&vehicle={id}`

**2. Vinculación desde Gastos de preparación**

En la sección de gastos asociados del vehículo (`AssociatedCost` en VehicleDetail), añadir:
- Botón "Adjuntar justificante" que abre el modal de subida con `vehicleId` pre-rellenado y `docSubCategory: 'justificante'`
- Si el gasto tiene un documento adjunto, mostrar icono de clip con enlace al documento

**3. Vinculación desde la operación de venta**

En `SaleDetail.tsx`, añadir sección "Documentación de la operación":
- Listar documentos vinculados al `saleId`
- Estado del expediente (checklist de docs obligatorios para cerrar venta)
- Bloquear cierre de venta si faltan documentos obligatorios (warning, no hard block)

**4. Conexión desde el Dashboard**

Ya cubierto en DOC-09 (widget de alertas documentales).

#### Criterios de aceptación

- [ ] `VehicleDetail` muestra pestaña "Documentación" con mini-expediente
- [ ] Se puede subir un documento directamente desde el detalle del vehículo
- [ ] Los gastos del vehículo permiten adjuntar justificante documental
- [ ] `SaleDetail` muestra los documentos vinculados a la operación
- [ ] Si faltan docs obligatorios para cerrar venta, se muestra warning visible
- [ ] Cada enlace navega correctamente al documento o expediente

---

### DOC-12 — Archivado automático en expediente y cleanup

**Tipo:** Backend
**Prioridad:** Media
**Dependencias:** DOC-01, DOC-05, DOC-06

#### Contexto

Los requisitos piden "archivar automáticamente en el expediente". Esto significa que cuando se sube un documento y el OCR o el usuario asigna un vehículo/cliente, el documento debe quedar categorizado y vinculado sin intervención manual adicional. También hay que manejar el ciclo de vida: cuando se cierra una venta, el expediente documental debe marcarse como "archivado".

#### Qué hacer

**1. Auto-categorización por OCR**

Cuando el OCR devuelve `documentType`, asignar automáticamente el `docSubCategory`:

```javascript
function mapOcrTypeToSubCategory(ocrType) {
  const MAP = {
    'permiso_circulacion': 'permiso_circulacion',
    'ficha_tecnica': 'ficha_tecnica',
    'contrato_compra': 'contrato_compra',
    'contrato_venta': 'contrato_venta',
    'factura_compra': 'factura_compra',
    'factura_venta': 'factura_venta',
    'itv': 'itv',
    'seguro': 'seguro',
    'reparacion': 'reparacion',
    'doc_cliente': 'doc_cliente',
    'factura': 'factura_compra',
    'gasto': 'justificante',
    'recibo': 'justificante',
  };
  return MAP[ocrType] || 'otro';
}
```

**2. Auto-vinculación por matrícula/VIN post-OCR**

En el controlador de creación de documento, si se recibe `ocrData` con `registrationPlate`:

```javascript
if (docData.ocrData?.registrationPlate && !docData.vehicleId) {
  const vehicle = await findVehicleByPlate(req, userId, docData.ocrData.registrationPlate);
  if (vehicle) {
    docData.vehicleId = vehicle._id;
    docData.vehicleName = `${vehicle.brand} ${vehicle.model}`;
    docData.registrationPlate = vehicle.registrationPlate;
    docData.vin = vehicle.vin || '';
  }
}
```

**3. Estado de expediente archivado**

Cuando una venta se marca como `completed`/`delivered`, todos los documentos vinculados al `saleId` se actualizan a un flag `archived: true`. Los documentos archivados aparecen con estilo atenuado y un badge "Archivado".

**4. Extracción automática de `itvExpiryDate`**

Si el OCR detecta un documento ITV con fecha de caducidad, guardar en `itvExpiryDate` del documento para alimentar las alertas de DOC-08.

#### Criterios de aceptación

- [ ] Documentos creados por OCR se auto-categorizan según el tipo detectado
- [ ] Si el OCR detecta matrícula, se vincula automáticamente al vehículo
- [ ] Si el OCR detecta fecha de caducidad ITV, se guarda en `itvExpiryDate`
- [ ] Al cerrar una venta, los documentos del expediente se marcan como archivados
- [ ] Los documentos archivados son visibles pero con estilo diferenciado
- [ ] El flujo completo (subir → OCR → categorizar → vincular → archivar) funciona sin intervención manual

---

### DOC-13 — UI Polish: diseño coherente y micro-interacciones

**Tipo:** Frontend (UI/UX)
**Prioridad:** Baja
**Dependencias:** DOC-03, DOC-04

#### Contexto

Una vez implementada toda la funcionalidad, hay que pulir la UI para que sea atractiva y profesional. Seguir el design system existente (Radix + Tailwind, bordes `rounded-2xl`, badges con punto de color, paleta amber/emerald/violet/blue).

#### Qué hacer

**1. KPIs en la cabecera de la página**

Reemplazar los stats actuales (Total, Pendientes, Firmados, Completados) por KPIs específicos de compraventa:

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│    24    │ │     3    │ │     2    │ │     1    │
│  Total   │ │  Faltan  │ │  ITV ⚠️  │ │  OCR ❓  │
│  docs    │ │  oblig.  │ │ próximas │ │ revisar  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**2. Iconos por subcategoría**

Asignar iconos Lucide diferenciados por tipo de documento:

| Subcategoría | Icono Lucide |
|---|---|
| `permiso_circulacion` | `IdCard` |
| `ficha_tecnica` | `ClipboardList` |
| `contrato_compra` | `FileSignature` |
| `contrato_venta` | `FileSignature` |
| `factura_compra` | `Receipt` |
| `factura_venta` | `Receipt` |
| `itv` | `ShieldCheck` |
| `reparacion` | `Wrench` |
| `justificante` | `FileCheck` |
| `doc_cliente` | `UserCheck` |
| `anexo` | `Paperclip` |
| `seguro` | `Shield` |

**3. Animaciones de transición**

- Fade-in al cambiar de tab
- Skeleton loaders mientras se cargan documentos
- Animación de progreso al subir archivo
- Confetti o check animado al completar expediente

**4. Responsive**

- Desktop: tabla completa con todas las columnas
- Tablet: tabla con columnas reducidas
- Móvil: cards con información principal, acordeón para expediente

**5. Empty states contextuales**

Cada tab vacío muestra un empty state con ilustración y CTA específico:
- Tab "Vehículo" vacío: "Sube el permiso de circulación para empezar el expediente"
- Tab "ITV" vacío: "Escanea la ITV con OCR para extraer la fecha de caducidad"

#### Criterios de aceptación

- [ ] Los KPIs reflejan el estado real de la documentación
- [ ] Cada subcategoría tiene su icono diferenciado
- [ ] Las transiciones entre tabs son suaves
- [ ] Hay skeleton loaders durante la carga
- [ ] El responsive funciona correctamente en los 3 breakpoints
- [ ] Los empty states son contextuales y tienen CTA claro

---

## Resumen y orden de ejecución

| Orden | Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|---|
| 1 | DOC-01 | Modelo de datos: categorías compraventa | Crítica | 3–4h |
| 2 | DOC-05 | OCR enriquecido para documentos de vehículo | Alta | 4–5h |
| 3 | DOC-02 | Búsqueda avanzada | Alta | 3–4h |
| 4 | DOC-03 | Tabs por categoría de compraventa | Alta | 3–4h |
| 5 | DOC-06 | Vinculación automática doc → vehículo + cliente | Alta | 4–5h |
| 6 | DOC-04 | Vista de expediente por vehículo | Alta | 5–6h |
| 7 | DOC-08 | Alertas documentales (4 reglas) | Alta | 4–5h |
| 8 | DOC-12 | Archivado automático en expediente | Media | 3–4h |
| 9 | DOC-07 | Histórico documental real | Media | 3–4h |
| 10 | DOC-09 | Panel alertas en Dashboard | Media | 2–3h |
| 11 | DOC-10 | Permisos gerente vs trabajador | Media | 3–4h |
| 12 | DOC-11 | Conexión con módulos (Vehículos, Gastos, Ventas) | Media | 4–5h |
| 13 | DOC-13 | UI Polish y micro-interacciones | Baja | 3–4h |

**Total estimado:** ~44–57 horas de desarrollo

### Dependencias críticas

```
DOC-01 ──┬──→ DOC-05 ──→ DOC-06 ──→ DOC-12
         ├──→ DOC-02
         ├──→ DOC-03 ──→ DOC-04 ──→ DOC-11
         ├──→ DOC-07
         ├──→ DOC-08 ──→ DOC-09
         └──→ DOC-10
                                     DOC-13 (independiente, al final)
```
