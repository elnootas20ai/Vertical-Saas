# COMPRAS Y RETIRADAS — Vertical Desguaces — Plan de Tickets

**Página:** `/saas/vertical/desguaces/compras-retiradas`  
**Vertical:** Desguace (`scrapyard`)  
**Objetivo:** Controlar cómo se adquieren o retiran los vehículos: compra a particular, compra a empresa, subasta, retirada, grúa externa. Mantener un histórico económico completo por vehículo con trazabilidad total de costes.  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Ya implementado (backend + frontend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo de vehículo CouchDB (`type: 'car'`) | Completo | `services/couchdb.js` — `buildVehicleDocument` (línea 356) |
| Campos económicos del vehículo: `purchasePrice`, `salePrice`, `purchaseDate`, `priceHistory` | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Campo de origen: `origin` (particular, empresa, subasta, permuta, otro) | Completo | `services/couchdb.js` — `normalizeOrigin` |
| Campo proveedor: `supplierName` (texto libre) | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Costes asociados al vehículo: `associatedCosts[]` con categorías (preparacion, itv, limpieza, fotos, publicidad, otro) | Completo | `services/couchdb.js` — líneas 376–388 |
| CRUD de vehículos backend | Completo | `controllers/vehicleController.js`, `routers/vehicleRouter.js` |
| Endpoints de costes asociados: `addAssociatedCost`, `deleteAssociatedCost` | Completo | `controllers/vehicleController.js` |
| Ficha completa de vehículo (frontend) | Completo | `src/app/pages/saas/VehicleDetail.tsx` — pestaña de costes visible |
| Página `ScrapyardVehicles` (vertical desguace) | Parcial — datos mock, sin backend real | `src/app/pages/saas/ScrapyardVehicles.tsx` |
| Dashboard de desguace con KPIs | Parcial — valores a 0, sin backend | `src/app/pages/saas/dashboards/ScrapyardDashboard.tsx` |
| Listado general de vehículos con filtros | Completo | `src/app/pages/saas/Vehicles.tsx` |
| Módulo de Finanzas (`type: 'cobro'/'pago'`) | Completo | `services/couchdb.js`, `controllers/financeController.js`, `src/app/lib/financeTypes.ts` |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js`, `services/alertConstants.js` |
| Categorías de alerta existentes: `vehicle_stock_aging`, `out_of_stock`, `low_stock`, etc. | Completo | `services/alertConstants.js` — `CATEGORY_TO_SOURCE` |
| OCR genérico (facturas/recibos) con OpenAI Vision | Completo | `POST /api/ocr/scan`, `services/ocrClassifier.js`, `services/ocrEntityMatcher.js` |
| Modal OCR scan | Completo | `src/app/components/design-system/SAAS__OcrScanModal.tsx` |
| Facturas de compra (`purchase_invoice`) + vínculo con PO | Completo | `controllers/supplierInvoiceController.js`, `routers/supplierInvoiceRouter.js` |
| Proveedores (`supplier`) CRUD | Completo | Backend + `src/app/pages/saas/SuppliersPage.tsx` |
| Documentos vinculados a vehículo (`vehicleId` en documento) | Completo | `controllers/documentsController.js` — filtro por `vehicleId` |
| Roles y permisos (`ROLE_DEFINITIONS`, `TEAM_PERMISSION_KEYS`) | Completo | `services/couchdb.js` |
| Activity logging + changelog | Completo | `controllers/vehicleController.js` — `logAccountActivity`, `writeChangelog` |
| Sidebar grupo `scrapyard` con 6 items | Completo | `src/app/components/saas/Sidebar.tsx` — línea 447 |
| Rutas del vertical desguace: scrapyard-vehicles, parts, inventory, deregistrations, sales, environment | Completo | `src/app/routes.tsx` — líneas 594–599 |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe entidad `vehicle_acquisition`** — La información de compra/retirada está dispersa en campos sueltos del vehículo (`purchasePrice`, `origin`, `supplierName`, `purchaseDate`) | No se puede registrar una adquisición como proceso independiente con su propio ciclo de vida, estados y documentación |
| 2 | **No hay tipos de adquisición específicos de desguace** — `origin` solo contempla particular/empresa/subasta/permuta/otro; faltan "retirada" y "grúa externa" | El desguace no puede clasificar correctamente cómo recibe sus vehículos |
| 3 | **No hay campos de costes desglosados** — No existen `costTransporte`, `costGestoria`, `costDocumentacion` como campos diferenciados | El desguace no puede saber cuánto le costó exactamente el transporte, la gestoría o la documentación de cada vehículo |
| 4 | **Las categorías de `associatedCosts` son de compraventa** — (preparacion, itv, limpieza, fotos, publicidad, otro) — No incluyen categorías de desguace | No se pueden registrar costes específicos como transporte, grúa, gestoría de baja, descontaminación, compactación |
| 5 | **No hay campo `formaPago`** en el vehículo ni en la adquisición | No se registra cómo se pagó al proveedor/particular (efectivo, transferencia, cheque, aplazado) |
| 6 | **No hay estado/ciclo de vida de la adquisición** — La compra se registra como dato estático sin flujo | No se puede hacer seguimiento: pendiente → aprobada → pagada → documentada → cerrada |
| 7 | **No hay vínculo proveedor ↔ vehículo** — Solo hay `supplierName` como texto libre | No se puede consultar el historial de compras a un proveedor ni vincular facturas automáticamente |
| 8 | **No se suman los costes automáticamente** — `purchasePrice` y `associatedCosts` son independientes | El coste total real del vehículo (compra + transporte + gestoría + documentación) no se calcula ni se muestra |
| 9 | **No hay OCR vinculado a la compra** — El OCR solo parsea facturas genéricas | Al subir una factura de compra de vehículo no se vincula automáticamente al vehículo ni se extraen los costes |
| 10 | **No hay histórico económico completo** — Solo existe `priceHistory` (cambios de precio de venta) y `associatedCosts` (sin timestamps de modificación) | No se puede ver una línea temporal de todos los movimientos económicos del vehículo |
| 11 | **No existen alertas de compra/retirada** — No hay alertas para: compra sin documentos, coste excesivo, retirada sin cerrar, gasto sin justificar | Pueden quedar operaciones abiertas o incompletas sin que nadie lo detecte |
| 12 | **No hay permisos diferenciados** para gerente (aprueba compras, revisa costes) vs trabajador (registra retirada/recepción) | Cualquier usuario con acceso puede hacer cualquier operación sin control de aprobación |
| 13 | **No existe la página `/saas/vertical/desguaces/compras-retiradas`** — No hay ruta, componente ni enlace en el sidebar | La funcionalidad no es accesible |
| 14 | **`ScrapyardVehicles.tsx` usa datos mock** — `MOCK_VEHICLES: Vehicle[] = []`, sin conexión al backend | La página de vehículos de desguace es solo una maqueta |
| 15 | **El Dashboard de desguace no refleja compras** — KPIs y acciones rápidas no incluyen "compras/retiradas" | El gerente no tiene visibilidad de las adquisiciones desde el panel principal |

### Mapa de dependencias

```
CR-01 (Modelo de datos vehicle_acquisition)
  ├── CR-03 (Formulario de registro — usa el modelo)
  ├── CR-04 (Listado y filtros — consulta el modelo)
  ├── CR-05 (Detalle de adquisición — lee el modelo)
  ├── CR-06 (Automatización costes — opera sobre el modelo)
  ├── CR-07 (OCR vinculado — enriquece el modelo)
  ├── CR-08 (Histórico económico — lee el modelo)
  └── CR-09 (Alertas — evalúa el modelo)

CR-02 (Ampliar categorías de coste para desguace)
  ├── CR-03 (Formulario usa las nuevas categorías)
  └── CR-06 (Automatización opera con ellas)

CR-03 (Formulario de registro)
  └── CR-05 (Detalle permite editar desde aquí)

CR-04 (Listado + Filtros)
  └── CR-05 (Detalle accesible desde el listado)

CR-06 (Automatización costes)
  └── CR-08 (Histórico económico alimentado por la automatización)
  └── CR-11 (Conexión con Finanzas genera movimiento)

CR-07 (OCR vinculado)
  └── CR-06 (OCR alimenta costes que se automatizan)

CR-09 (Alertas) — requiere CR-01
CR-10 (Permisos) — independiente, puede ir en paralelo
CR-11 (Conexiones) — requiere CR-06, CR-08
CR-12 (Estructura de página) — requiere CR-03, CR-04, CR-05
```

---

## TICKETS

---

### TICKET CR-01: Modelo de datos — Entidad `vehicle_acquisition`

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

Actualmente la información de adquisición de un vehículo está dispersa en campos del propio vehículo (`purchasePrice`, `origin`, `supplierName`, `purchaseDate`). Para el vertical de desguace se necesita una entidad independiente que represente el proceso completo de adquisición/retirada, con su propio ciclo de vida, costes desglosados, documentación vinculada y trazabilidad.

#### Qué hacer

**1. Crear `buildVehicleAcquisitionDocument` en `services/couchdb.js`:**

```javascript
{
  _id: 'vacq:<uuid>',
  type: 'vehicle_acquisition',
  user_id: '<userId>',
  business_id: '<businessId>',
  vehicleId: '<vehicleId>',              // ref a car._id — obligatorio
  registrationPlate: 'ABC1234',          // denormalizado para búsqueda rápida

  // ── Tipo de adquisición ──
  acquisitionType: 'compra_particular',  // enum: ver abajo
  
  // ── Datos del vendedor/origen ──
  sellerType: 'particular',              // 'particular' | 'empresa' | 'aseguradora' | 'subasta' | 'organismo'
  sellerName: 'Juan Pérez',
  sellerNif: '12345678A',
  sellerPhone: '+34 600 000 000',
  sellerEmail: 'juan@email.com',
  sellerAddress: 'Calle Mayor 1, Madrid',
  supplierId: null,                      // ref a supplier._id si es empresa/proveedor habitual

  // ── Costes desglosados ──
  costCompra: 500,                       // Precio pagado por el vehículo
  costTransporte: 80,                    // Coste del transporte / grúa
  costGestoria: 45,                      // Coste de gestoría (baja, transferencia)
  costDocumentacion: 20,                 // Tasas, certificados, informes DGT
  costDescontaminacion: 0,               // Coste de descontaminación (CAT obligatorios)
  costOtros: 0,                          // Otros costes no clasificados
  costOtrosDetalle: '',                  // Descripción de "otros"
  costTotal: 645,                        // Suma automática de todos los costes

  // ── Pago ──
  paymentMethod: 'transferencia',        // 'efectivo' | 'transferencia' | 'cheque' | 'aplazado' | 'compensacion' | 'otro'
  paymentReference: 'TR-2026-001',       // Número de transferencia, cheque, etc.
  paymentDate: '2026-04-14',             // Fecha del pago
  paymentStatus: 'pagado',              // 'pendiente' | 'parcial' | 'pagado'
  paymentNotes: '',

  // ── Estado del proceso ──
  status: 'documentada',                 // ver ciclo de vida abajo
  statusHistory: [                       // Log de cambios de estado
    { status: 'borrador', date: '2026-04-14T10:00:00Z', userId: 'usr_001', note: '' },
    { status: 'aprobada', date: '2026-04-14T11:00:00Z', userId: 'usr_002', note: 'Aprobada por gerente' },
  ],
  approvedBy: 'usr_002',                 // userId del gerente que aprobó
  approvedAt: '2026-04-14T11:00:00Z',

  // ── Documentación vinculada ──
  linkedDocumentIds: ['doc_001', 'doc_002'],  // refs a documents
  linkedInvoiceIds: ['pinv_001'],             // refs a purchase_invoice
  hasRequiredDocs: true,                      // flag calculado: ¿tiene todos los docs obligatorios?
  requiredDocsChecklist: [
    { docType: 'contrato_compra', present: true, documentId: 'doc_001' },
    { docType: 'ficha_tecnica', present: true, documentId: 'doc_002' },
    { docType: 'permiso_circulacion', present: false, documentId: null },
    { docType: 'justificante_pago', present: false, documentId: null },
  ],

  // ── OCR ──
  ocrData: null,                          // Datos extraídos por OCR de la factura
  ocrImageBase64: null,                   // Imagen original escaneada

  // ── Fechas ──
  acquisitionDate: '2026-04-14',          // Fecha de la compra/retirada
  receptionDate: '2026-04-15',            // Fecha de recepción física del vehículo
  closedAt: null,                         // Fecha de cierre del expediente

  // ── Notas ──
  notes: '',
  internalNotes: '',                      // Notas internas (solo gerente)

  // ── Metadatos ──
  createdBy: 'usr_001',
  createdAt: '2026-04-14T10:00:00Z',
  updatedAt: '2026-04-14T11:00:00Z',
}
```

**2. Enum `acquisitionType`:**

| Valor | Descripción |
|---|---|
| `compra_particular` | Compra directa a un particular |
| `compra_empresa` | Compra a empresa / concesionario / aseguradora |
| `subasta` | Adquisición en subasta (judicial, pública, privada) |
| `retirada` | Retirada voluntaria (el propietario entrega el vehículo) |
| `grua_externa` | Llegada mediante grúa externa (depósito municipal, aseguradora, etc.) |

**3. Ciclo de vida `status`:**

```
borrador → pendiente_aprobacion → aprobada → en_transito → recibida → documentada → cerrada
                                                                          ↑
                                                                     rechazada
                                                                     cancelada
```

| Estado | Descripción | Quién puede mover |
|---|---|---|
| `borrador` | Registro inicial, datos incompletos | Trabajador, Gerente |
| `pendiente_aprobacion` | Enviada para aprobación del gerente | Trabajador |
| `aprobada` | Gerente aprueba la compra/retirada | Gerente |
| `rechazada` | Gerente rechaza (con motivo) | Gerente |
| `en_transito` | Vehículo en camino (grúa solicitada) | Trabajador, Gerente |
| `recibida` | Vehículo físicamente en el desguace | Trabajador, Gerente |
| `documentada` | Toda la documentación está completa | Sistema (automático) |
| `cerrada` | Expediente cerrado, costes finalizados | Gerente |
| `cancelada` | Operación cancelada | Gerente |

**4. Función `sanitizeVehicleAcquisition`:**
- Validar campos obligatorios: `vehicleId`, `acquisitionType`, `sellerName`, `costCompra`
- Recalcular `costTotal` como suma de todos los `cost*` numéricos
- Normalizar `paymentMethod`, `paymentStatus`, `status`
- Sanitizar `sellerNif` (formato válido o null)

**5. Función `recalcAcquisitionTotalCost(doc)`:**
- Suma: `costCompra + costTransporte + costGestoria + costDocumentacion + costDescontaminacion + costOtros`
- Retorna el `costTotal` calculado
- Se invoca siempre antes de guardar

#### Criterios de aceptación

- El documento se crea y persiste correctamente en CouchDB
- `costTotal` se recalcula automáticamente al crear/actualizar
- Los campos obligatorios se validan (error 400 si faltan)
- La función `sanitize` normaliza datos sucios sin fallar
- El ciclo de vida `statusHistory` registra cada transición con fecha y usuario

---

### TICKET CR-02: Ampliar categorías de coste para vertical desguace

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna

#### Contexto

Las categorías actuales de `associatedCosts` del vehículo son de compraventa: `preparacion`, `itv`, `limpieza`, `fotos`, `publicidad`, `otro`. El desguace necesita categorías propias para clasificar los costes de adquisición y tratamiento del vehículo.

#### Qué hacer

**1. Ampliar `COST_CATEGORIES` en `services/couchdb.js` (línea 376):**

Cambiar de array fijo a mapa por vertical:

```javascript
const BASE_COST_CATEGORIES = ['preparacion', 'itv', 'limpieza', 'fotos', 'publicidad', 'otro'];

const SCRAPYARD_COST_CATEGORIES = [
  'compra',              // Precio de adquisición del vehículo
  'transporte',          // Grúa, transporte propio, portes
  'gestoria',            // Gestoría de baja, transferencia, trámites
  'documentacion',       // Tasas DGT, informes, certificados
  'descontaminacion',    // Retirada de fluidos, materiales peligrosos (obligatorio)
  'compactacion',        // Coste de prensado/compactación
  'almacenamiento',      // Coste de espacio/almacén si procede
  'reparacion_pieza',    // Coste de reparar una pieza para reventa
  'otro',
];
```

**2. Crear helper `getCostCategoriesForVertical(businessType)` en `services/couchdb.js`:**
- Si `businessType === 'scrapyard'` → retorna `SCRAPYARD_COST_CATEGORIES`
- Si `businessType === 'carDealership'` → retorna `BASE_COST_CATEGORIES`
- Default → retorna `BASE_COST_CATEGORIES`

**3. Actualizar `buildVehicleDocument` para aceptar categorías extendidas:**
- En línea 384, en lugar de validar contra `COST_CATEGORIES` fijo, usar `getCostCategoriesForVertical` pasando el `businessType` del usuario
- Si la categoría no está en ninguna lista, usar `'otro'`

**4. Crear mapa de labels en español para el frontend:**

```typescript
export const SCRAPYARD_COST_CATEGORY_LABELS: Record<string, string> = {
  compra: 'Compra del vehículo',
  transporte: 'Transporte / Grúa',
  gestoria: 'Gestoría',
  documentacion: 'Documentación / Tasas',
  descontaminacion: 'Descontaminación',
  compactacion: 'Compactación',
  almacenamiento: 'Almacenamiento',
  reparacion_pieza: 'Reparación de pieza',
  otro: 'Otro',
};
```

**5. Crear mapa de iconos para el frontend:**

Cada categoría con su icono de `lucide-react`:
- `compra` → `ShoppingCart`
- `transporte` → `Truck`
- `gestoria` → `FileText`
- `documentacion` → `ScrollText`
- `descontaminacion` → `Droplets`
- `compactacion` → `Container`
- `almacenamiento` → `Warehouse`
- `reparacion_pieza` → `Wrench`
- `otro` → `MoreHorizontal`

#### Criterios de aceptación

- Las categorías de desguace se usan cuando el `businessType` es `scrapyard`
- Los costes existentes con categorías de compraventa siguen funcionando (retrocompatibilidad)
- El frontend muestra las categorías correctas según el vertical
- Los iconos y labels son coherentes

---

### TICKET CR-03: Backend — CRUD de adquisiciones

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** CR-01

#### Contexto

Se necesita un controlador y router completos para gestionar el ciclo de vida de las adquisiciones de vehículos.

#### Qué hacer

**1. Crear `controllers/vehicleAcquisitionController.js`:**

| Función | Método | Ruta | Descripción |
|---|---|---|---|
| `listAcquisitions` | GET | `/api/vehicle-acquisitions/:userId` | Listar con filtros: status, acquisitionType, sellerType, dateRange, paymentStatus |
| `getAcquisition` | GET | `/api/vehicle-acquisitions/:userId/:id` | Detalle de una adquisición |
| `createAcquisition` | POST | `/api/vehicle-acquisitions/:userId` | Crear nueva adquisición |
| `updateAcquisition` | PUT | `/api/vehicle-acquisitions/:userId/:id` | Actualizar datos/costes |
| `changeStatus` | PATCH | `/api/vehicle-acquisitions/:userId/:id/status` | Cambiar estado (valida transiciones) |
| `deleteAcquisition` | DELETE | `/api/vehicle-acquisitions/:userId/:id` | Soft delete (solo si es `borrador` o `cancelada`) |
| `getAcquisitionsByVehicle` | GET | `/api/vehicle-acquisitions/:userId/vehicle/:vehicleId` | Adquisiciones de un vehículo |
| `getAcquisitionsBySeller` | GET | `/api/vehicle-acquisitions/:userId/seller/:sellerId` | Historial de un proveedor |
| `getAcquisitionStats` | GET | `/api/vehicle-acquisitions/:userId/stats` | KPIs: total compras mes, coste medio, por tipo, pendientes |
| `approveAcquisition` | POST | `/api/vehicle-acquisitions/:userId/:id/approve` | Gerente aprueba (cambia a `aprobada`) |
| `rejectAcquisition` | POST | `/api/vehicle-acquisitions/:userId/:id/reject` | Gerente rechaza (con motivo obligatorio) |

**2. Lógica de `createAcquisition`:**
- Validar que el `vehicleId` existe y está activo
- Validar campos obligatorios según `acquisitionType`:
  - `compra_particular`: `sellerName`, `sellerNif`, `costCompra` obligatorios
  - `compra_empresa`: `sellerName`, `sellerNif`, `costCompra`, `supplierId` obligatorios
  - `subasta`: `sellerName`, `costCompra` obligatorios
  - `retirada`: `sellerName` obligatorio, `costCompra` puede ser 0
  - `grua_externa`: `sellerName`, `costTransporte` obligatorios
- Calcular `costTotal`
- Crear `statusHistory` con entrada inicial
- Registrar `logAccountActivity` y `writeChangelog`

**3. Lógica de `changeStatus`:**
- Validar transiciones permitidas (ver grafo en CR-01)
- Body: `{ newStatus, note? }`
- Añadir entrada a `statusHistory`
- Si `newStatus === 'aprobada'` → registrar `approvedBy` y `approvedAt`
- Si `newStatus === 'cerrada'` → registrar `closedAt`, verificar que `hasRequiredDocs === true`
- Si `newStatus === 'recibida'` → actualizar `receptionDate`
- Emitir evento SSE al cambiar estado

**4. Lógica de `approveAcquisition`:**
- Verificar que el usuario tiene rol `gerente` o permiso `approve_purchases`
- Solo desde estado `pendiente_aprobacion`
- Registrar log de actividad con tipo `acquisition_approved`

**5. Crear `routers/vehicleAcquisitionRouter.js`:**
- Montar en `index.js` con `requireAuth`
- Ruta base: `/api/vehicle-acquisitions`

**6. Crear `src/app/lib/vehicleAcquisitionApi.ts`:**

```typescript
export type AcquisitionType = 'compra_particular' | 'compra_empresa' | 'subasta' | 'retirada' | 'grua_externa';
export type AcquisitionStatus = 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'en_transito' | 'recibida' | 'documentada' | 'cerrada' | 'cancelada';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'aplazado' | 'compensacion' | 'otro';
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado';

export interface VehicleAcquisition {
  id: string;
  _rev?: string;
  vehicleId: string;
  registrationPlate: string;
  acquisitionType: AcquisitionType;
  sellerType: string;
  sellerName: string;
  sellerNif?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerAddress?: string;
  supplierId?: string;
  costCompra: number;
  costTransporte: number;
  costGestoria: number;
  costDocumentacion: number;
  costDescontaminacion: number;
  costOtros: number;
  costOtrosDetalle?: string;
  costTotal: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentDate?: string;
  paymentStatus: PaymentStatus;
  paymentNotes?: string;
  status: AcquisitionStatus;
  statusHistory: { status: string; date: string; userId: string; note: string }[];
  approvedBy?: string;
  approvedAt?: string;
  linkedDocumentIds: string[];
  linkedInvoiceIds: string[];
  hasRequiredDocs: boolean;
  requiredDocsChecklist: { docType: string; present: boolean; documentId: string | null }[];
  ocrData?: any;
  acquisitionDate: string;
  receptionDate?: string;
  closedAt?: string;
  notes?: string;
  internalNotes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Funciones: list, get, create, update, changeStatus, approve, reject, delete, getByVehicle, getBySeller, getStats
```

#### Criterios de aceptación

- CRUD completo funcional vía API
- Las transiciones de estado se validan y se rechazan las no permitidas (400)
- Solo gerentes pueden aprobar/rechazar
- El `costTotal` se recalcula en cada save
- El activity log registra todas las operaciones
- Los filtros del listado funcionan combinados (status + tipo + fecha + pago)

---

### TICKET CR-04: Frontend — Listado de compras y retiradas con filtros

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** CR-01, CR-03

#### Contexto

Necesitamos un listado principal de todas las adquisiciones del desguace, con filtros potentes, KPIs en cabecera y acceso rápido a cada expediente.

#### Qué hacer

**1. Crear componente `AcquisitionsList` (parte del `ScrapyardPurchasesPage`):**

**KPIs en cabecera (4 tarjetas):**

| KPI | Icono | Color | Fuente |
|---|---|---|---|
| Compras del mes | `ShoppingCart` | Azul | Count de adquisiciones del mes actual |
| Inversión total mes | `DollarSign` | Púrpura | Sum de `costTotal` del mes actual |
| Pendientes de cierre | `AlertTriangle` | Ámbar | Count de `status` NOT IN (`cerrada`, `cancelada`) |
| Coste medio por vehículo | `TrendingUp` | Esmeralda | Avg de `costTotal` del mes actual |

**Barra de filtros:**
- Búsqueda por texto (matrícula, nombre vendedor, NIF)
- Filtro por `acquisitionType` (compra particular, compra empresa, subasta, retirada, grúa externa)
- Filtro por `status` (multi-select con badges de color)
- Filtro por `paymentStatus` (pendiente, parcial, pagado)
- Filtro por rango de fechas (`acquisitionDate`)
- Filtro por rango de coste total (min-max)
- Botón "Limpiar filtros"

**Tabla principal:**

| Columna | Contenido |
|---|---|
| Matrícula | `registrationPlate` — link al detalle del vehículo |
| Tipo | Badge con icono del `acquisitionType` |
| Vendedor | `sellerName` + tipo (particular/empresa) |
| Fecha | `acquisitionDate` formateada |
| Coste compra | `costCompra` €  |
| Coste total | `costTotal` € (en negrita) |
| Forma pago | Badge del `paymentMethod` |
| Estado pago | Badge del `paymentStatus` (rojo/amarillo/verde) |
| Estado | Badge del `status` con color semántico |
| Acciones | Ver detalle, Editar, Aprobar (si gerente), Eliminar |

**Vistas:**
- Vista tabla (por defecto)
- Vista tarjetas (compact cards para mobile)

**Acciones:**
- Botón "Nueva compra/retirada" → abre formulario (CR-03)
- Botón "Exportar" → CSV/Excel con los filtros aplicados
- Selección múltiple para acciones en lote (cambiar estado, exportar seleccionados)

**2. Colores por estado:**

```typescript
const STATUS_COLORS: Record<AcquisitionStatus, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  pendiente_aprobacion: 'bg-amber-50 text-amber-700',
  aprobada: 'bg-blue-50 text-blue-700',
  rechazada: 'bg-red-50 text-red-700',
  en_transito: 'bg-indigo-50 text-indigo-700',
  recibida: 'bg-cyan-50 text-cyan-700',
  documentada: 'bg-emerald-50 text-emerald-700',
  cerrada: 'bg-green-50 text-green-700',
  cancelada: 'bg-gray-200 text-gray-500',
};
```

**3. Colores por tipo de adquisición:**

```typescript
const TYPE_COLORS: Record<AcquisitionType, string> = {
  compra_particular: 'bg-blue-50 text-blue-700',
  compra_empresa: 'bg-purple-50 text-purple-700',
  subasta: 'bg-amber-50 text-amber-700',
  retirada: 'bg-teal-50 text-teal-700',
  grua_externa: 'bg-orange-50 text-orange-700',
};
```

**4. Empty state:**
- Si no hay adquisiciones: ilustración + texto "No hay compras ni retiradas registradas" + CTA "Registrar primera compra"

#### Criterios de aceptación

- Listado carga datos reales del backend (no mock)
- Todos los filtros funcionan combinados
- La tabla es ordenable por columna (fecha, coste, estado)
- Los KPIs se actualizan al cambiar filtros
- Responsive en tablet y móvil (vista tarjetas automática en <768px)
- Empty state visible cuando no hay datos

---

### TICKET CR-05: Frontend — Formulario de registro de compra/retirada

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** CR-01, CR-02, CR-03

#### Contexto

Se necesita un formulario completo para registrar una nueva adquisición o retirada de vehículo, adaptado al contexto del desguace.

#### Qué hacer

**1. Crear formulario en modal o drawer (lateral derecho):**

El formulario se organiza en secciones colapsables:

**Sección 1 — Tipo de operación:**
- Selector visual con 5 tarjetas (compra particular, compra empresa, subasta, retirada, grúa externa)
- Al seleccionar, los campos obligatorios se adaptan dinámicamente

**Sección 2 — Vehículo:**
- Selector de vehículo existente (combobox con búsqueda por matrícula/marca/modelo)
- O botón "Crear vehículo nuevo" → abre `VehicleQuickAddModal` y al crear vincula automáticamente
- Si se selecciona vehículo existente: mostrar mini-ficha (matrícula, marca, modelo, año, foto si hay)

**Sección 3 — Vendedor / Origen:**
- Condicional según `acquisitionType`:
  - `compra_particular`: Nombre*, NIF*, Teléfono, Email, Dirección
  - `compra_empresa`: Selector de proveedor existente (combobox) + Nombre*, NIF*, Teléfono, Email
  - `subasta`: Nombre de la subasta/entidad*, Referencia/Lote, Fecha subasta
  - `retirada`: Nombre del propietario*, NIF, Teléfono, Motivo de retirada
  - `grua_externa`: Empresa de grúa*, Teléfono, Nº albarán, Procedencia (depósito municipal, aseguradora, etc.)

**Sección 4 — Costes:**
- Desglose visual con campos numéricos:
  - Coste de compra* (€) — campo grande, destacado
  - Coste de transporte (€)
  - Coste de gestoría (€)
  - Coste de documentación (€)
  - Coste de descontaminación (€)
  - Otros costes (€) + campo de detalle
- **Barra de coste total** — calculada en tiempo real, siempre visible, con tipografía grande
- Validación: coste de compra obligatorio para compras; coste de transporte obligatorio para grúa externa

**Sección 5 — Pago:**
- Forma de pago (select: efectivo, transferencia, cheque, aplazado, compensación, otro)
- Referencia de pago (nº transferencia, nº cheque, etc.)
- Fecha de pago
- Estado del pago (pendiente, parcial, pagado)
- Notas de pago

**Sección 6 — Fechas:**
- Fecha de adquisición* (date picker, por defecto hoy)
- Fecha de recepción (date picker, puede ser futura si está en tránsito)

**Sección 7 — Documentación (opcional en creación):**
- Checklist de documentos obligatorios (según tipo):
  - Compra particular: contrato de compra, copia DNI vendedor, justificante de pago, ficha técnica
  - Compra empresa: factura de compra, albarán, ficha técnica
  - Subasta: acta de adjudicación, justificante de pago
  - Retirada: acta de entrega voluntaria, ficha técnica
  - Grúa externa: albarán de grúa, informe de origen
- Botón "Subir documento" por cada tipo → abre upload
- Botón "Escanear con OCR" → abre `SAAS__OcrScanModal`

**Sección 8 — Notas:**
- Notas generales (textarea)
- Notas internas — solo visible para gerente (textarea con borde distinto)

**2. Botones de acción:**
- "Guardar como borrador" → `status: 'borrador'`
- "Guardar y enviar a aprobación" → `status: 'pendiente_aprobacion'` (solo si todos los campos obligatorios)
- "Cancelar" → cierra sin guardar

**3. Validaciones en tiempo real:**
- Campos obligatorios marcados con *
- NIF con formato válido (regex)
- Costes no negativos
- Fecha de adquisición no futura (a menos que sea subasta programada)
- Mostrar mensajes de error inline bajo cada campo

**4. Modo edición:**
- El mismo formulario se usa para editar una adquisición existente
- Si el estado es >= `aprobada`, los campos de coste y vendedor se bloquean (solo gerente puede desbloquear)

#### Criterios de aceptación

- El formulario crea una adquisición real en backend
- Los campos se adaptan según el tipo de operación
- El coste total se recalcula en tiempo real al modificar cualquier coste
- La validación impide enviar datos incompletos
- El modo edición carga datos existentes correctamente
- El selector de vehículo funciona con búsqueda en tiempo real
- El selector de proveedor (compra empresa) trae proveedores del backend

---

### TICKET CR-06: Frontend — Detalle de adquisición / Expediente

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** CR-04, CR-05

#### Contexto

Al hacer clic en una adquisición del listado, se abre una vista de detalle que muestra toda la información del expediente con capacidad de acción según el rol del usuario.

#### Qué hacer

**1. Crear vista de detalle (página o drawer ancho):**

**Cabecera:**
- Badge de tipo de adquisición (con icono y color)
- Matrícula + marca/modelo/año del vehículo (link a la ficha del vehículo)
- Badge de estado actual (grande, con color)
- Fecha de adquisición
- Botón "Editar" (si estado permite)
- Botón de acción principal según estado:
  - Borrador → "Enviar a aprobación"
  - Pendiente aprobación → "Aprobar" / "Rechazar" (solo gerente)
  - Aprobada → "Marcar en tránsito" / "Marcar recibida"
  - Recibida → "Marcar documentada"
  - Documentada → "Cerrar expediente"

**Sección — Resumen económico (card destacada):**
- Desglose visual de costes en barras horizontales proporcionales:
  ```
  Compra          ████████████████████  500 €  (77.5%)
  Transporte      ████                  80 €   (12.4%)
  Gestoría        ██                    45 €   (7.0%)
  Documentación   █                     20 €   (3.1%)
  ─────────────────────────────────────────────
  TOTAL                                 645 €
  ```
- Forma de pago + estado de pago
- Referencia de pago

**Sección — Datos del vendedor:**
- Nombre, NIF, teléfono, email, dirección
- Si es proveedor habitual → link a la ficha del proveedor
- Historial de compras a este vendedor (mini-tabla con últimas 5)

**Sección — Documentación:**
- Checklist visual de documentos obligatorios (✅/❌ por cada tipo)
- Lista de documentos vinculados con acciones: ver, descargar, desvincular
- Botón "Subir documento" + "Escanear OCR"
- Barra de progreso documental: "3 de 5 documentos completados"

**Sección — Línea temporal (timeline):**
- Historial de `statusHistory` visualizado como timeline vertical
- Cada entrada: estado, fecha/hora, usuario, nota
- Iconos diferentes por tipo de transición

**Sección — Notas:**
- Notas generales (editables)
- Notas internas (editables, solo gerente, con fondo distinto)

**2. Acciones del gerente (condicionales a rol):**
- Botón "Aprobar" con modal de confirmación
- Botón "Rechazar" con campo de motivo obligatorio
- Botón "Desbloquear edición" cuando estado >= aprobada
- Ver notas internas

**3. Acciones del trabajador (condicionales a rol):**
- Editar solo si estado es `borrador`
- Subir documentación en cualquier estado (excepto cancelada/cerrada)
- Marcar recepción (si tiene permiso)

#### Criterios de aceptación

- El detalle muestra toda la información del expediente
- Los botones de acción cambian según el estado actual y el rol del usuario
- La timeline refleja todo el historial de estados
- La documentación muestra el estado de completitud
- Los datos del vendedor se cargan correctamente (incluyendo el historial si es proveedor)

---

### TICKET CR-07: Automatización — Suma de costes al vehículo

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** CR-01, CR-02, CR-03

#### Contexto

Cuando se crea o actualiza una adquisición, los costes deben propagarse al vehículo vinculado para que su ficha refleje el coste real total. Actualmente `purchasePrice` del vehículo y `associatedCosts` son independientes y no se actualizan automáticamente.

#### Qué hacer

**1. Hook post-save en el controlador de adquisiciones:**

Al crear/actualizar una `vehicle_acquisition`:
1. Recalcular `costTotal` de la adquisición
2. Actualizar el vehículo vinculado:
   - `purchasePrice` = `costCompra` de la adquisición
   - `purchaseDate` = `acquisitionDate` de la adquisición
   - `origin` = mapear `acquisitionType` a `origin`:
     - `compra_particular` → `particular`
     - `compra_empresa` → `empresa`
     - `subasta` → `subasta`
     - `retirada` → `otro`
     - `grua_externa` → `otro`
   - `supplierName` = `sellerName` de la adquisición
   - Sincronizar `associatedCosts[]` del vehículo con los costes de la adquisición:
     - Cada coste (`costTransporte`, `costGestoria`, etc.) se crea/actualiza como entry en `associatedCosts[]`
     - Usar un `id` determinístico basado en `acquisitionId + category` para evitar duplicados
     - Formato: `{ id: 'acq:<acquisitionId>:transporte', category: 'transporte', description: 'Transporte - Adquisición CR-XXX', amount: 80, date: acquisitionDate }`

**2. Crear campo calculado `totalInvestment` en la respuesta del vehículo:**

```javascript
function calculateVehicleTotalInvestment(vehicle) {
  const purchasePrice = vehicle.purchasePrice || 0;
  const costsTotal = (vehicle.associatedCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
  return purchasePrice + costsTotal;
}
```

- Añadir `totalInvestment` al `sanitizeVehicle` como campo calculado (no persistido)
- Mostrar en la ficha del vehículo

**3. Crear endpoint `GET /api/vehicles/:userId/:vehicleId/economic-summary`:**

Retorna:
```json
{
  "purchasePrice": 500,
  "acquisitionCosts": {
    "transporte": 80,
    "gestoria": 45,
    "documentacion": 20
  },
  "totalAcquisition": 645,
  "preparationCosts": {
    "descontaminacion": 30,
    "reparacion_pieza": 50
  },
  "totalPreparation": 80,
  "totalInvestment": 725,
  "partsRevenue": 0,
  "scrapRevenue": 0,
  "totalRevenue": 0,
  "profitLoss": -725
}
```

**4. Prevención de inconsistencias:**
- Si se elimina la adquisición → revertir los cambios en el vehículo (limpiar associatedCosts generados)
- Si se modifica un coste → actualizar la entrada correspondiente en el vehículo
- Usar transacción lógica: leer vehículo con `_rev` → modificar → guardar (retry en conflicto 409)

#### Criterios de aceptación

- Al guardar una adquisición, el `purchasePrice` del vehículo se actualiza automáticamente
- Los costes desglosados aparecen como `associatedCosts` del vehículo
- El `totalInvestment` se calcula correctamente sumando todo
- No se generan costes duplicados al editar la adquisición múltiples veces
- Si se elimina la adquisición, los costes propagados se limpian

---

### TICKET CR-08: Automatización — Vinculación OCR con compra

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CR-01, CR-03

#### Contexto

Al subir una factura o albarán mediante OCR desde la página de compras/retiradas, el sistema debe:
1. Extraer los datos relevantes (emisor, importe, matrícula si aparece)
2. Intentar vincular automáticamente a un vehículo y a una adquisición
3. Pre-rellenar los costes correspondientes

#### Qué hacer

**1. Ampliar el prompt OCR en `index.js` (endpoint `/api/ocr/scan`):**

Añadir instrucciones específicas para facturas de compra de vehículos:
- Extraer: matrícula del vehículo, bastidor/VIN, NIF del vendedor, importe total, concepto (compra, transporte, gestoría, etc.)
- Campo adicional en respuesta OCR: `vehicleRegistrationPlate`, `vehicleVin`, `documentPurpose` (enum: purchase, transport, gestoria, decontamination, other)

**2. Crear `services/ocrAcquisitionMatcher.js`:**

Lógica de vinculación automática:
1. Si OCR extrae `vehicleRegistrationPlate` → buscar vehículo por matrícula
2. Si encuentra vehículo → buscar adquisiciones abiertas (status !== cerrada/cancelada) de ese vehículo
3. Si encuentra adquisición:
   - Vincular el documento a la adquisición (`linkedDocumentIds` / `linkedInvoiceIds`)
   - Sugerir mapeo de coste según `documentPurpose`:
     - `purchase` → `costCompra`
     - `transport` → `costTransporte`
     - `gestoria` → `costGestoria`
     - etc.
4. Retornar sugerencia al frontend para confirmación del usuario

**3. Frontend — Flujo OCR en el formulario de adquisición:**
- Botón "Escanear factura" en la sección de Documentación
- Al escanear:
  1. Se abre `SAAS__OcrScanModal`
  2. Al completar, se muestra un panel de "Datos extraídos" con:
     - Emisor detectado → mapeo a vendedor
     - Importe detectado → sugerencia de campo de coste
     - Matrícula detectada → confirmación de vehículo
  3. Botón "Aplicar datos" → rellena los campos del formulario
  4. Botón "Solo vincular documento" → solo adjunta sin rellenar

**4. Frontend — Indicador OCR en el detalle:**
- Si la adquisición tiene `ocrData` → mostrar badge "OCR" junto al documento
- Tooltip con los datos extraídos

#### Criterios de aceptación

- Al escanear una factura de compra, se extraen los datos del vehículo (matrícula, VIN)
- El sistema sugiere vinculación con vehículo y adquisición existentes
- Los importes se pre-rellenan en los campos de coste correctos
- El usuario confirma/rechaza las sugerencias antes de aplicar
- El documento escaneado queda vinculado a la adquisición

---

### TICKET CR-09: Histórico económico completo del vehículo

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CR-07

#### Contexto

El desguace necesita ver toda la historia económica de un vehículo en una sola vista: desde la compra/retirada, pasando por todos los costes, hasta la venta de piezas o chatarra. Actualmente solo existe `priceHistory` (cambios de precio de venta) y `associatedCosts` (sin timeline).

#### Qué hacer

**1. Backend — Endpoint `GET /api/vehicles/:userId/:vehicleId/economic-history`:**

Retorna una lista cronológica unificada de todos los movimientos económicos del vehículo:

```json
[
  {
    "id": "eh_001",
    "date": "2026-04-14",
    "type": "acquisition",
    "category": "compra",
    "concept": "Compra a particular — Juan Pérez",
    "amount": -500,
    "balance": -500,
    "sourceType": "vehicle_acquisition",
    "sourceId": "vacq_001"
  },
  {
    "id": "eh_002",
    "date": "2026-04-14",
    "type": "acquisition_cost",
    "category": "transporte",
    "concept": "Transporte por grúa",
    "amount": -80,
    "balance": -580,
    "sourceType": "vehicle_acquisition",
    "sourceId": "vacq_001"
  },
  {
    "id": "eh_003",
    "date": "2026-04-15",
    "type": "cost",
    "category": "descontaminacion",
    "concept": "Descontaminación CAT",
    "amount": -30,
    "balance": -610,
    "sourceType": "associated_cost",
    "sourceId": "cost_003"
  },
  {
    "id": "eh_004",
    "date": "2026-04-20",
    "type": "sale",
    "category": "venta_pieza",
    "concept": "Motor 1.9 TDI — Venta #V-2026-015",
    "amount": 450,
    "balance": -160,
    "sourceType": "scrapyard_sale",
    "sourceId": "sale_015"
  }
]
```

Fuentes de datos a unificar:
- `vehicle_acquisition` → compra y costes desglosados (gastos)
- `associatedCosts[]` del vehículo → costes de preparación (gastos)
- Ventas de piezas del desguace (ingresos) — `ScrapyardSales`
- Movimientos financieros vinculados al vehículo (`financeMovement` con ref)
- Facturas de compra vinculadas (`purchase_invoice`)

**2. Frontend — Pestaña "Histórico económico" en el detalle de adquisición y en VehicleDetail:**

- Tabla cronológica con columnas: Fecha, Tipo (badge), Concepto, Gasto/Ingreso (rojo/verde), Saldo acumulado
- Gráfico de evolución del saldo (line chart) — eje X = tiempo, eje Y = balance
- Resumen en cabecera:
  - Total invertido (suma de gastos)
  - Total recuperado (suma de ingresos)
  - Balance (diferencia)
  - ROI si hay ingresos: `(ingresos - gastos) / gastos * 100`

**3. Código de colores por tipo:**

| Tipo | Color | Dirección |
|---|---|---|
| Compra / Adquisición | Rojo | Gasto (negativo) |
| Coste transporte | Naranja | Gasto (negativo) |
| Coste gestoría | Naranja | Gasto (negativo) |
| Coste preparación | Ámbar | Gasto (negativo) |
| Venta de pieza | Verde | Ingreso (positivo) |
| Venta de chatarra | Esmeralda | Ingreso (positivo) |
| Factura proveedor | Rojo | Gasto (negativo) |

**4. Exportación:**
- Botón "Exportar" → PDF con el resumen económico del vehículo
- Botón "Exportar CSV" → Tabla en formato CSV

#### Criterios de aceptación

- La timeline muestra todos los movimientos económicos cronológicamente
- El saldo acumulado se calcula correctamente
- Se puede acceder desde el detalle de la adquisición y desde VehicleDetail
- El gráfico de evolución es interactivo (hover muestra detalle)
- Los datos se cargan del backend (no mock)

---

### TICKET CR-10: Alertas — Compra sin documentos, coste excesivo, retirada sin cerrar, gasto sin justificar

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** CR-01, CR-03

#### Contexto

El sistema de alertas (`services/alertEngine.js`) necesita 4 nuevas reglas específicas para el módulo de compras y retiradas del desguace.

#### Qué hacer

**1. Registrar nuevas categorías en `services/alertConstants.js`:**

Añadir al mapa `CATEGORY_TO_SOURCE`:
```javascript
acquisition_missing_docs: 'stock',
acquisition_excessive_cost: 'finanzas',
acquisition_unclosed: 'stock',
acquisition_unjustified_expense: 'finanzas',
```

Añadir `'adquisiciones'` a `ALERT_SOURCES`.

**2. Crear función `checkAcquisitionAlerts(userId)` en `services/alertEngine.js`:**

**Alerta 1 — Compra sin documentos:**
- Condición: `vehicle_acquisition` con `status` IN (`recibida`, `aprobada`) AND `hasRequiredDocs === false` AND antigüedad > 3 días desde `acquisitionDate`
- Nivel: `warning` (3-7 días), `alert` (> 7 días)
- Mensaje: "La compra del vehículo {matricula} lleva {N} días sin documentación completa"
- Ruta: `/saas/vertical/desguaces/compras-retiradas?id={acquisitionId}`
- Dedup key: `acquisition_missing_docs:{acquisitionId}`

**Alerta 2 — Coste excesivo:**
- Condición: `vehicle_acquisition` con `costTotal` > umbral configurable (default: percentil 90 de las últimas 50 compras del mismo `acquisitionType`)
- Alternativa simple: `costTotal` > `account.scrapyardConfig.maxAcquisitionCost` (configurable, default: 3000 €)
- Nivel: `warning`
- Mensaje: "La compra del vehículo {matricula} tiene un coste de {costTotal}€, superior al umbral de {umbral}€"
- Ruta: `/saas/vertical/desguaces/compras-retiradas?id={acquisitionId}`
- Dedup key: `acquisition_excessive_cost:{acquisitionId}`

**Alerta 3 — Retirada sin cerrar:**
- Condición: `vehicle_acquisition` con `status` NOT IN (`cerrada`, `cancelada`) AND antigüedad > X días desde `acquisitionDate` (X configurable, default: 15)
- Nivel: `warning` (15-30 días), `alert` (> 30 días)
- Mensaje: "La retirada/compra del vehículo {matricula} lleva {N} días sin cerrar"
- Ruta: `/saas/vertical/desguaces/compras-retiradas?id={acquisitionId}`
- Dedup key: `acquisition_unclosed:{acquisitionId}`

**Alerta 4 — Gasto sin justificar:**
- Condición: `vehicle_acquisition` con `costTotal > 0` AND (`linkedDocumentIds.length === 0` AND `linkedInvoiceIds.length === 0`) AND antigüedad > 5 días
- Es decir: hay gasto registrado pero no hay ningún documento ni factura que lo respalde
- Nivel: `warning`
- Mensaje: "La compra del vehículo {matricula} tiene {costTotal}€ en gastos sin ningún justificante adjunto"
- Ruta: `/saas/vertical/desguaces/compras-retiradas?id={acquisitionId}`
- Dedup key: `acquisition_unjustified_expense:{acquisitionId}`

**3. Integrar en el ciclo de ejecución de `alertEngine.js`:**
- Añadir `checkAcquisitionAlerts` al loop principal
- Condición: solo ejecutar si el `businessType` del usuario es `scrapyard`
- Frecuencia: cada 2 horas (junto con el resto de alertas)

**4. Configuración en `account.scrapyardConfig`:**
```json
{
  "acquisitionMissingDocsDaysThreshold": 3,
  "acquisitionExcessiveCostThreshold": 3000,
  "acquisitionUnclosedDaysThreshold": 15,
  "acquisitionUnjustifiedDaysThreshold": 5,
  "acquisitionAlertsEnabled": true
}
```

**5. Alerta inmediata al aprobar (complementaria):**
- Al aprobar una adquisición (`status: 'aprobada'`), verificar inmediatamente si tiene documentación completa
- Si `hasRequiredDocs === false` → emitir alerta SSE inmediata (no esperar al ciclo de 2h)

#### Criterios de aceptación

- Las 4 alertas se generan cuando se cumplen las condiciones
- Las alertas se deduplicican correctamente (una por adquisición por tipo por día)
- Los umbrales son configurables por cuenta
- Las alertas llevan a la adquisición específica
- Se envían por los canales habituales (inApp, push, email según config)
- Solo se ejecutan para cuentas con `businessType === 'scrapyard'`

---

### TICKET CR-11: Permisos — Perfil gerente vs trabajador

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CR-03

#### Contexto

El sistema ya tiene `ROLE_DEFINITIONS` y `TEAM_PERMISSION_KEYS` en `services/couchdb.js`. Se necesitan permisos específicos para diferenciar lo que puede hacer un gerente (aprobar compras, revisar costes, ver notas internas) de lo que puede hacer un trabajador (registrar retirada o recepción operativa).

#### Qué hacer

**1. Añadir permisos en `TEAM_PERMISSION_KEYS` (`services/couchdb.js`):**

```javascript
'view_acquisitions',      // Ver listado de compras/retiradas
'create_acquisitions',    // Crear nueva compra/retirada
'edit_acquisitions',      // Editar datos de una compra
'approve_acquisitions',   // Aprobar/rechazar compras
'close_acquisitions',     // Cerrar expedientes
'view_acquisition_costs', // Ver costes detallados
'edit_acquisition_costs', // Editar costes (desbloquear)
'view_internal_notes',    // Ver notas internas
'delete_acquisitions',    // Eliminar compras
```

**2. Asignar permisos por defecto en `ROLE_DEFINITIONS`:**

| Permiso | Gerente (owner/admin) | Trabajador (worker) |
|---|---|---|
| `view_acquisitions` | ✅ | ✅ |
| `create_acquisitions` | ✅ | ✅ |
| `edit_acquisitions` | ✅ | ❌ (solo borradores propios) |
| `approve_acquisitions` | ✅ | ❌ |
| `close_acquisitions` | ✅ | ❌ |
| `view_acquisition_costs` | ✅ | ❌ |
| `edit_acquisition_costs` | ✅ | ❌ |
| `view_internal_notes` | ✅ | ❌ |
| `delete_acquisitions` | ✅ | ❌ |

**3. Backend — Middleware de validación:**
- En cada endpoint del `vehicleAcquisitionController`, verificar permisos del usuario
- `approve` y `reject` → requiere `approve_acquisitions`
- `changeStatus` a `cerrada` → requiere `close_acquisitions`
- `update` cuando status >= aprobada → requiere `edit_acquisition_costs`
- `delete` → requiere `delete_acquisitions`
- Retornar 403 si no tiene permiso

**4. Frontend — Ocultar/deshabilitar según permisos:**
- En el listado: ocultar botones de acción si no tiene permiso
- En el detalle: ocultar botón "Aprobar"/"Rechazar" si no es gerente
- En el formulario: deshabilitar campos de coste si status >= aprobada y no tiene `edit_acquisition_costs`
- Notas internas: no renderizar sección si no tiene `view_internal_notes`
- Usar hook `useAuth` para leer permisos del usuario actual

**5. Trabajador — Flujo reducido:**
- El trabajador puede:
  1. Crear una nueva adquisición como `borrador`
  2. Enviarla a aprobación (`pendiente_aprobacion`)
  3. Subir documentación en cualquier estado
  4. Marcar recepción si tiene permiso (`create_acquisitions` basta)
- NO puede: aprobar, rechazar, cerrar, editar costes tras aprobación, ver notas internas, eliminar

#### Criterios de aceptación

- Los permisos se verifican en cada endpoint del backend (403 si falta)
- La UI oculta/deshabilita los elementos según el perfil
- Un trabajador puede crear y enviar a aprobación sin errores
- Un gerente puede aprobar, rechazar y cerrar
- Los permisos son configurables por usuario desde la sección de equipo

---

### TICKET CR-12: Conexiones — Entrada de vehículo, Finanzas, Facturas proveedor, Dashboard

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** CR-07, CR-09

#### Contexto

La página de compras y retiradas debe estar conectada con el resto del sistema: al dar entrada a un vehículo debería poder crear la adquisición desde ahí; los pagos deben reflejarse en finanzas; las facturas del proveedor deben vincularse; y el dashboard debe mostrar KPIs de compras.

#### Qué hacer

**1. Conexión con Entrada de vehículo:**
- En el flujo de entrada de vehículo (tickets `EV-*`, `VehicleReceptionWizard`):
  - Añadir paso opcional "Datos de compra/retirada"
  - Si el usuario rellena datos de compra → crear `vehicle_acquisition` automáticamente al finalizar el wizard
  - Si no → solo crea el vehículo (como ahora)
- En `ScrapyardVehicles`:
  - Al crear un vehículo desde la página de desguace → ofrecer flujo combinado "Alta + Compra"

**2. Conexión con Finanzas:**
- Al cambiar `paymentStatus` a `pagado` en una adquisición:
  - Crear automáticamente un movimiento financiero (`type: 'pago'`) con:
    - `concept`: "Compra vehículo {matricula} — {sellerName}"
    - `amount`: `costTotal`
    - `category`: `vehicle_purchase`
    - `source`: `vehicle_acquisition`
    - `sourceRef`: `acquisitionId`
  - Configurable: `account.financeConfig.autoCreateAcquisitionPayments` (boolean, default: true)
- Si el pago se registra primero en Finanzas → vincular con la adquisición (bidireccional)

**3. Conexión con Facturas proveedor:**
- Desde el detalle de la adquisición:
  - Botón "Crear factura de compra" → abre formulario pre-rellenado con datos del proveedor y el importe
  - La factura creada se vincula automáticamente a la adquisición (`linkedInvoiceIds`)
- Desde `SupplierBillingPage`:
  - Si se crea una factura de compra de vehículo → sugerir vincular a adquisición existente
  - Filtro: "Facturas vinculadas a compras de vehículos"

**4. Conexión con Dashboard (ScrapyardDashboard):**

Añadir los siguientes KPIs y acciones al dashboard de desguace:

| KPI | Fuente |
|---|---|
| Compras del mes | Count de `vehicle_acquisition` del mes |
| Inversión del mes | Sum de `costTotal` del mes |
| Pendientes de cerrar | Count de status abiertos |
| Coste medio | Avg de `costTotal` del mes |

Acciones rápidas:
- "Registrar compra" → abre formulario CR-05
- Enlace "Ver compras" → `/saas/vertical/desguaces/compras-retiradas`

Widget de últimas adquisiciones:
- Mini-tabla con las 5 últimas adquisiciones (matrícula, tipo, coste, estado)

**5. Conexión con Documentación (tickets `DOC-*`):**
- Los documentos subidos desde la adquisición se crean con:
  - `vehicleId` = vehículo vinculado
  - `category` = categoría documental correspondiente (según `DOC-01`)
  - `tags` = ['adquisicion', `acquisitionType`]
- Al visualizar documentos de un vehículo → los de la adquisición aparecen agrupados bajo "Expediente de compra"

#### Criterios de aceptación

- Al dar entrada a un vehículo se puede crear la adquisición en el mismo flujo
- Al marcar pagada una adquisición, se crea movimiento financiero automáticamente
- Las facturas de proveedor se vinculan a la adquisición
- El Dashboard de desguace muestra KPIs de compras
- Los documentos de la adquisición aparecen en la ficha documental del vehículo

---

### TICKET CR-13: Estructura de página — `/saas/vertical/desguaces/compras-retiradas`

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** CR-04, CR-05, CR-06

#### Contexto

Se necesita crear la página principal y registrarla en el sistema de rutas y navegación.

#### Qué hacer

**1. Crear `src/app/pages/saas/ScrapyardPurchasesPage.tsx`:**

Estructura de la página:

```
┌──────────────────────────────────────────────────────────────┐
│ Header: "Compras y Retiradas"  [+ Nueva compra]  [Exportar] │
├──────────────────────────────────────────────────────────────┤
│ KPIs: 4 tarjetas (CR-04)                                    │
├──────────────────────────────────────────────────────────────┤
│ Pestañas: [Todas] [Compras] [Retiradas] [Subastas] [Grúa]  │
├──────────────────────────────────────────────────────────────┤
│ Filtros: Búsqueda | Estado | Pago | Fechas | Coste          │
├──────────────────────────────────────────────────────────────┤
│ Tabla/Tarjetas de adquisiciones (CR-04)                      │
├──────────────────────────────────────────────────────────────┤
│ Panel lateral (drawer): Detalle de adquisición (CR-06)       │
│ O: Formulario de nueva compra (CR-05)                        │
└──────────────────────────────────────────────────────────────┘
```

Las pestañas filtran por `acquisitionType`:
- **Todas** → sin filtro
- **Compras** → `compra_particular` + `compra_empresa`
- **Retiradas** → `retirada`
- **Subastas** → `subasta`
- **Grúa externa** → `grua_externa`

**2. Registrar ruta en `routes.tsx`:**

```typescript
// Scrapyard purchases
{ path: 'vertical/desguaces/compras-retiradas', Component: ScrapyardPurchasesPage },
```

Importar el componente en la sección de imports de Scrapyard.

**3. Actualizar Sidebar (`Sidebar.tsx`):**

Añadir nuevo item en el menú de desguace:

```typescript
{ id: 'scrapyard-purchases', navKey: 'scrapyardPurchases', icon: <ShoppingCart className="w-5 h-5" />, path: '/saas/vertical/desguaces/compras-retiradas' },
```

Añadir al grupo `scrapyard` en `menuGroupDefs`:
```typescript
{ id: 'scrapyard', icon: <Container />, itemIds: [
  'scrapyard-purchases',  // NUEVO — primera posición
  'scrapyard-vehicles',
  'scrapyard-parts',
  'scrapyard-inventory',
  'scrapyard-deregistrations',
  'scrapyard-sales',
  'scrapyard-environment',
] },
```

**4. Añadir traducción i18n:**

En el sistema de traducciones (`src/app/lib/i18n.ts` o archivos de locale):
```json
{
  "nav": {
    "scrapyardPurchases": "Compras y Retiradas"
  }
}
```

**5. Deep linking:**
- `?id={acquisitionId}` → abre el detalle de esa adquisición
- `?tab=compras|retiradas|subastas|grua` → activa la pestaña correspondiente
- `?new=true&type=compra_particular` → abre el formulario pre-configurado

**6. Responsive:**
- Desktop (>1024px): Tabla + drawer lateral
- Tablet (768-1024px): Tabla compacta + drawer overlay
- Mobile (<768px): Vista tarjetas + página completa de detalle

#### Criterios de aceptación

- La página es accesible por URL directa: `/saas/vertical/desguaces/compras-retiradas`
- Aparece en el Sidebar del vertical desguace como primer item
- Las pestañas filtran correctamente por tipo
- El deep linking funciona (abrir directamente un expediente por URL)
- Es responsive en todos los breakpoints
- El i18n está configurado

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (semana 1-2)

| Ticket | Nombre | Prioridad | Tipo |
|---|---|---|---|
| CR-01 | Modelo de datos `vehicle_acquisition` | Crítica | Backend |
| CR-02 | Ampliar categorías de coste para desguace | Alta | Backend |
| CR-03 | CRUD de adquisiciones | Crítica | Backend |
| CR-11 | Permisos gerente vs trabajador | Alta | Backend |

### Fase 2 — Frontend core (semana 3-4)

| Ticket | Nombre | Prioridad | Tipo |
|---|---|---|---|
| CR-13 | Estructura de página + ruta + sidebar | Crítica | Frontend |
| CR-04 | Listado con filtros y KPIs | Crítica | Frontend |
| CR-05 | Formulario de registro | Crítica | Frontend |
| CR-06 | Detalle de adquisición / Expediente | Alta | Frontend |

### Fase 3 — Automatizaciones (semana 5-6)

| Ticket | Nombre | Prioridad | Tipo |
|---|---|---|---|
| CR-07 | Automatización — Suma de costes al vehículo | Alta | Backend |
| CR-08 | Automatización — OCR vinculado a compra | Alta | Backend + Frontend |
| CR-09 | Histórico económico completo | Alta | Backend + Frontend |

### Fase 4 — Alertas y conexiones (semana 7-8)

| Ticket | Nombre | Prioridad | Tipo |
|---|---|---|---|
| CR-10 | Alertas (sin docs, coste excesivo, sin cerrar, sin justificar) | Alta | Backend |
| CR-12 | Conexiones (Entrada vehículo, Finanzas, Facturas, Dashboard) | Media | Full-stack |

---

## DEPENDENCIAS CON OTROS MÓDULOS DE TICKETS

| Este módulo necesita de… | Para… |
|---|---|
| **EV-*** (Entrada de vehículo) | CR-12 usa el wizard de recepción para crear adquisición combinada |
| **DOC-*** (Documentación y OCR) | CR-08 extiende el OCR; CR-12 vincula docs al expediente |
| **CS-*** (Compras y Stock) | CR-12 usa finanzas; conceptos compartidos de factura proveedor |
| **Modelo `supplier`** | CR-05 usa selector de proveedor para compra a empresa |
| **`alertEngine.js`** | CR-10 extiende el motor de alertas |
| **`ROLE_DEFINITIONS`** | CR-11 extiende el sistema de permisos |

| …y alimenta a… | Cómo… |
|---|---|
| **ScrapyardDashboard** | CR-12 añade KPIs y widgets de compras |
| **VehicleDetail** | CR-07 sincroniza costes; CR-09 añade timeline económica |
| **FinanceView** | CR-12 genera movimientos financieros automáticos |
| **SupplierBillingPage** | CR-12 vincula facturas de proveedor bidireccional |
| **DocumentsPage** | CR-12 agrupa docs de adquisición en expediente del vehículo |
