# DOCUMENTACIÓN Y OCR — Vertical Desguaces — Plan de Tickets

**Tipo:** Página completa  
**URL:** `/saas/vertical/desguaces/documentacion`  
**Vertical:** Desguace (`scrapyard`)  
**Objetivo:** Centralizar toda la documentación vinculada a vehículos, compras, bajas y ventas del desguace. Guardar documentos obligatorios del sector (permiso de circulación, ficha técnica, contrato de compra, factura, baja DGT, justificantes, documentos de retirada y reparación), con OCR inteligente, vinculación automática al expediente correcto e histórico documental completo.  
**Fecha:** 2026-04-15

---

## Estado auditado (08/07/2026)

**~75% hecho y operativo.** Este módulo está montado y accesible: la página `ScrapyardDocumentationPage.tsx` existe y está en `routes.tsx` (`/saas/vertical/desguaces/documentacion`, gated por permiso `scrapyard_docs`), el ítem `scrapyard-documentation` está en el Sidebar, y el backend de documentos soporta todo el modelo del desguace.

- **Completo (verificado):** DDOC-01 (subcategorías desguace en `VALID_DOC_SUB_CATEGORIES`, campos `partId`/`acquisitionId`/`deregistrationType`/`isScrapyard`/`documentHash` en `buildDocumentRecord` + `sanitizeDocumentRecord`, `getScrapyardRequiredDocs`, tipos en `documentsApi.ts`), DDOC-04 backend (filtro `q` multi-campo incl. pieza + filtros `partId`/`acquisitionId`/`isScrapyard`/`archived` en `listDocuments`), DDOC-05 (prompt OCR en `index.js` con bajas/certificados/albarán grúa, `OCR_TYPE_TO_SUB_CATEGORY` ampliado, propagación de `deregistrationDate/Type`), DDOC-09 parcial-alto (auto-categorización OCR, auto-link matrícula/VIN + adquisición abierta, detección de duplicados por hash con 409), DDOC-12 (página + ruta + sidebar + tabs + deep-link `?tab=`/dossier).
- **Parcial:** DDOC-02/03 (tabs desguace y `ScrapyardDocDossier` con fases existen, pero el checklist del dossier frontend es estático por fases, no dinámico por estado del vehículo), DDOC-07 (existen `scrapyard_pending_deregistration` y `scrapyard_vehicle_missing_docs` en `scrapyardAlertEngine.js`; NO hay alerta de OCR incompleto específica de desguace ni de documento duplicado), DDOC-08 (widget "Alertas documentales" existe en `dashboards/ScrapyardDashboard.tsx` con endpoint `/api/documents/:userId/alerts`; falta KPI de completitud), DDOC-10 (permiso `scrapyard_docs` existe y gatea la ruta, pero sin los 7 permisos granulares ni enforcement 403 en backend).
- **Pendiente de verdad:** DDOC-13 (el histórico de `DocumentDetail.tsx` sigue siendo sintético, generado desde el estado del documento, no consume activity log real), archivado automático al compactar (existe filtro `archived` pero no se encontró `archiveVehicleDocuments`), vinculación automática a pieza por código (solo manual), y permisos gerente/trabajador reales.

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo de documento CouchDB (`type: 'document'`) | Completo | `services/couchdb.js` — `buildDocumentRecord` |
| Campos del documento: `clientId`, `vehicleId`, `saleId`, `name`, `category`, `status`, `fileUrl`, `mimeType`, `tags`, `notes` | Completo | `services/couchdb.js` — `buildDocumentRecord` |
| Campo `docSubCategory` con tipos de automoción: `permiso_circulacion`, `ficha_tecnica`, `contrato_compra`, `contrato_venta`, `factura_compra`, `factura_venta`, `itv`, `seguro`, `informe_trafico`, `reparacion`, `justificante`, `doc_cliente`, `anexo`, `otro` | Completo | `services/couchdb.js` — `VALID_DOC_SUB_CATEGORIES` |
| Campos OCR en documento: `ocrData`, `ocrImageBase64`, `ocrConfidence`, `entryMethod` | Completo | `services/couchdb.js` — `buildDocumentRecord` |
| Campos de vínculo: `registrationPlate`, `vin`, `supplierId`, `supplierName`, `itvExpiryDate` | Completo | `services/couchdb.js` — `buildDocumentRecord` |
| Versionado de documento (`version`, `previousVersionId`) | Completo | `services/couchdb.js` |
| CRUD backend de documentos (`list`, `create`, `update`, `delete`, `alerts`, `history`) | Completo | `controllers/documentsController.js`, `routers/documentsRouter.js` |
| Filtrado por `clientId`, `saleId`, `vehicleId`, `status`, `docSubCategory` en listado | Completo | `controllers/documentsController.js` — `listDocuments` |
| Auto-vinculación por matrícula/VIN (`autoLinkByPlateOrVin`) | Completo | `controllers/documentsController.js` |
| Mapeo OCR tipo → subcategoría (`OCR_TYPE_TO_SUB_CATEGORY`) | Completo | `controllers/documentsController.js` |
| CRUD frontend de documentos (API client) | Completo | `src/app/lib/documentsApi.ts` |
| Página `DocumentsPage` con tabs por categoría | Completo | `src/app/pages/saas/DocumentsPage.tsx` |
| Página `DocumentDetail` con histórico | Parcial (datos mock) | `src/app/pages/saas/DocumentDetail.tsx` |
| Modal de subida de documento (`SAAS__UploadDocumentModal`) | Completo | `src/app/components/design-system/SAAS__UploadDocumentModal.tsx` |
| Modal OCR scan con IA (`SAAS__OcrScanModal`) — modo `vehicle` con prompt específico | Completo | `src/app/components/design-system/SAAS__OcrScanModal.tsx` |
| Endpoint OCR con OpenAI Vision (GPT-4o), modo `ocrMode === 'vehicle'` | Completo | `index.js` — `/api/ocr/scan` |
| OCR clasificador con ruta `documentacion` y `verticales` | Completo | `services/ocrClassifier.js` — `ROUTE_TABLE` |
| OCR orquestación: `processOcrResult`, `executeProposal` | Completo | `services/ocrRouter.js` |
| Componente `VehicleDocDossier` (expediente por vehículo) | Completo | `src/app/components/saas/VehicleDocDossier.tsx` |
| Motor de alertas con dedup + SSE + Push, regla `ocr_incomplete` | Completo | `services/alertEngine.js` |
| Sidebar: grupo `documentacion` visible en `scrapyard` via `VERTICAL_GROUPS` | Completo | `Sidebar.tsx` |
| Rutas `/saas/documents` y `/saas/documents/:id` | Completo | `routes.tsx` |
| Modelo vehículo con estados de desguace (`received`, `dismantling`, `fully_dismantled`, `compacted`) | Completo | `services/couchdb.js` — `normalizeStatus` |
| Página `ScrapyardDeregistrations` (bajas) | UI mock — sin backend | `src/app/pages/saas/ScrapyardDeregistrations.tsx` |
| Página `ScrapyardVehicles` | UI mock — sin backend | `src/app/pages/saas/ScrapyardVehicles.tsx` |
| Modelo `vehicle_acquisition` con `linkedDocumentIds` y `requiredDocsChecklist` | Diseñado | `docs/tickets/COMPRAS-RETIRADAS-DESGUACES.md` (CR-01) |

### Lo que FALTA (gap con los requisitos del desguace)

| # | Funcionalidad | Estado |
|---|---|---|
| 1 | **No existe la ruta `/saas/vertical/desguaces/documentacion`** — La documentación se accede desde `/saas/documents` que es genérica | No hay página específica ni ruta |
| 2 | **Faltan subcategorías documentales propias del desguace**: `baja_temporal`, `baja_definitiva`, `certificado_destruccion`, `certificado_descontaminacion`, `acta_retirada`, `albaran_grua`, `informe_medioambiental`, `doc_pieza` | Solo existen las de compraventa genérica |
| 3 | **No hay búsqueda por pieza** — Los documentos se buscan por matrícula, bastidor, cliente, proveedor, pero no por referencia o código de pieza de desguace | El desguace vincula documentos también a piezas |
| 4 | **No hay vista de expediente orientada al desguace** — `VehicleDocDossier` tiene `REQUIRED_DOCS` fijos de compraventa, no incluye baja, descontaminación, retirada | El checklist no refleja los obligatorios del desguace |
| 5 | **No hay alerta de "baja pendiente"** — No se detecta si un vehículo recibido lleva X días sin que se gestione la baja ante la DGT | Riesgo regulatorio |
| 6 | **No hay alerta de "documento duplicado"** — Si se sube dos veces el mismo permiso de circulación, no se detecta | Datos inconsistentes |
| 7 | **No hay vinculación documento ↔ adquisición** — Los documentos no se vinculan al expediente de compra/retirada (`vehicle_acquisition`) | El expediente de compra queda sin respaldo documental integrado |
| 8 | **No hay vinculación documento ↔ pieza** — Un documento (garantía, informe) no se puede vincular a una pieza extraída | Sin trazabilidad documental de la pieza |
| 9 | **Histórico documental usa datos mock** — `DocumentDetail.tsx` no consume datos reales de activity log | Sin auditoría real |
| 10 | **Permisos gerente vs trabajador no implementados en documentación** — Todo el mundo ve y hace lo mismo | Sin control de acceso |
| 11 | **No hay conexión bidireccional con módulos del desguace** — Desde `ScrapyardVehicles`, `ScrapyardDeregistrations`, `ScrapyardPurchasesPage` no se accede a la documentación del vehículo | Flujos rotos |
| 12 | **Los tabs de `DocumentsPage` son genéricos** — `society`, `contracts`, `licenses`, `financial` no son relevantes para un desguace | UI no adaptada al vertical |

### Mapa de dependencias

```
DDOC-01 (Subcategorías y modelo de datos desguace)
  ├── DDOC-02 (Tabs y vista adaptada — filtra por subcategorías)
  ├── DDOC-03 (Expediente desguace — usa checklist de subcategorías)
  ├── DDOC-04 (Búsqueda avanzada — busca en nuevos campos)
  ├── DDOC-05 (OCR desguace — clasifica en subcategorías)
  ├── DDOC-06 (Vinculación automática — usa vínculos nuevos)
  ├── DDOC-07 (Alertas — evalúa subcategorías y campos)
  └── DDOC-09 (Archivado automático — categoriza con subcategorías)

DDOC-02 (Tabs desguace) → DDOC-03 (Expediente desguace)
DDOC-05 (OCR desguace) → DDOC-06 (Vinculación automática) → DDOC-09 (Archivado)
DDOC-07 (Alertas) → DDOC-08 (Panel alertas Dashboard)
DDOC-10 (Permisos) — independiente, puede ir en paralelo
DDOC-11 (Conexiones módulos) — requiere DDOC-03 + DDOC-06
DDOC-12 (Estructura página + ruta) — requiere DDOC-02 + DDOC-03
DDOC-13 (Histórico documental) — requiere DDOC-01
DDOC-14 (UI Polish) — al final
```

---

## TICKETS

---

### DDOC-01 — Modelo de datos: subcategorías documentales del desguace

**Tipo:** Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

El modelo actual tiene `VALID_DOC_SUB_CATEGORIES` con tipos orientados a compraventa de vehículos (`permiso_circulacion`, `ficha_tecnica`, `contrato_compra`, `factura_compra`, etc.). El desguace maneja documentación adicional propia del sector: certificados de baja DGT (temporal y definitiva), certificados de destrucción, certificados de descontaminación CAT, actas de retirada, albaranes de grúa, informes medioambientales y documentación asociada a piezas.

Además, los documentos del desguace necesitan un campo `partId` para vincular documentación a piezas individuales (por ejemplo, un informe de garantía de una pieza vendida) y un campo `acquisitionId` para vincular al expediente de compra/retirada.

#### Qué hacer

**1. Ampliar `VALID_DOC_SUB_CATEGORIES` en `services/couchdb.js`**

Añadir las subcategorías específicas del desguace sin eliminar las existentes:

```javascript
const SCRAPYARD_DOC_SUB_CATEGORIES = [
  // Baja y destrucción
  'baja_temporal',                // Baja temporal en DGT
  'baja_definitiva',             // Baja definitiva en DGT
  'certificado_destruccion',     // Certificado de destrucción del vehículo
  'certificado_descontaminacion', // Certificado de descontaminación (CAT obligatorio)

  // Retirada y transporte
  'acta_retirada',               // Acta de entrega/retirada voluntaria
  'albaran_grua',                // Albarán del servicio de grúa
  'justificante_deposito',       // Justificante de depósito municipal

  // Medioambiental y regulatorio
  'informe_medioambiental',      // Informe medioambiental (residuos, fluidos)
  'licencia_actividad',          // Licencia de actividad del desguace (CAT)
  'registro_productor_residuos', // Registro como productor de residuos

  // Piezas
  'garantia_pieza',              // Documento de garantía de pieza vendida
  'informe_pieza',               // Informe técnico o de calidad de una pieza
  'albaran_venta_pieza',         // Albarán de venta de pieza

  // Compra de vehículo (complementarios a los existentes)
  'acta_adjudicacion',           // Acta de adjudicación en subasta
  'doc_tasacion',                // Documento de tasación / valoración
];
```

**2. Añadir campos nuevos a `buildDocumentRecord` en `services/couchdb.js`**

```javascript
partId: String(data.partId || ''),
partName: String(data.partName || '').trim(),
partCode: String(data.partCode || '').trim(),
acquisitionId: String(data.acquisitionId || ''),
deregistrationId: String(data.deregistrationId || ''),
deregistrationType: data.deregistrationType || null, // 'temporal' | 'definitiva'
deregistrationDate: data.deregistrationDate || null,
expiryDate: data.expiryDate || null, // fecha caducidad genérica (certificados)
isScrapyard: Boolean(data.isScrapyard || false), // flag para filtrar docs de desguace
documentHash: String(data.documentHash || ''), // hash SHA-256 del archivo para detectar duplicados
```

**3. Actualizar `sanitizeDocumentRecord` en `services/couchdb.js`**

Incluir los campos nuevos en la sanitización:

```javascript
partId: doc.partId || '',
partName: doc.partName || '',
partCode: doc.partCode || '',
acquisitionId: doc.acquisitionId || '',
deregistrationId: doc.deregistrationId || '',
deregistrationType: doc.deregistrationType || null,
deregistrationDate: doc.deregistrationDate || null,
expiryDate: doc.expiryDate || null,
isScrapyard: doc.isScrapyard || false,
documentHash: doc.documentHash || '',
```

**4. Crear helper `getScrapyardRequiredDocs(context)` en `services/couchdb.js`**

Define los documentos obligatorios según el contexto del vehículo de desguace:

```javascript
function getScrapyardRequiredDocs(vehicleStatus) {
  const BASE = [
    'permiso_circulacion',
    'ficha_tecnica',
    'contrato_compra',
  ];

  const POST_RECEPTION = [
    ...BASE,
    'certificado_descontaminacion',
  ];

  const POST_DEREGISTRATION = [
    ...POST_RECEPTION,
    'baja_definitiva',
    'certificado_destruccion',
  ];

  switch (vehicleStatus) {
    case 'received': return BASE;
    case 'dismantling':
    case 'partially_dismantled':
    case 'fully_dismantled':
      return POST_RECEPTION;
    case 'compacted':
      return POST_DEREGISTRATION;
    default: return BASE;
  }
}
```

**5. Actualizar `documentsApi.ts` (frontend)**

Ampliar la interfaz y los tipos:

```typescript
export type ScrapyardDocCategory =
  | CompraventaDocCategory
  | 'baja_temporal'
  | 'baja_definitiva'
  | 'certificado_destruccion'
  | 'certificado_descontaminacion'
  | 'acta_retirada'
  | 'albaran_grua'
  | 'justificante_deposito'
  | 'informe_medioambiental'
  | 'licencia_actividad'
  | 'registro_productor_residuos'
  | 'garantia_pieza'
  | 'informe_pieza'
  | 'albaran_venta_pieza'
  | 'acta_adjudicacion'
  | 'doc_tasacion';

export interface DocumentRecord {
  // ... campos existentes ...
  partId?: string;
  partName?: string;
  partCode?: string;
  acquisitionId?: string;
  deregistrationId?: string;
  deregistrationType?: 'temporal' | 'definitiva' | null;
  deregistrationDate?: string | null;
  expiryDate?: string | null;
  isScrapyard?: boolean;
  documentHash?: string;
}
```

**6. Crear mapa de labels e iconos para las nuevas subcategorías**

```typescript
export const SCRAPYARD_DOC_LABELS: Record<string, string> = {
  baja_temporal: 'Baja temporal DGT',
  baja_definitiva: 'Baja definitiva DGT',
  certificado_destruccion: 'Certificado de destrucción',
  certificado_descontaminacion: 'Certificado descontaminación',
  acta_retirada: 'Acta de retirada',
  albaran_grua: 'Albarán de grúa',
  justificante_deposito: 'Justificante depósito',
  informe_medioambiental: 'Informe medioambiental',
  licencia_actividad: 'Licencia de actividad CAT',
  registro_productor_residuos: 'Registro productor residuos',
  garantia_pieza: 'Garantía de pieza',
  informe_pieza: 'Informe de pieza',
  albaran_venta_pieza: 'Albarán venta pieza',
  acta_adjudicacion: 'Acta de adjudicación',
  doc_tasacion: 'Documento de tasación',
};

export const SCRAPYARD_DOC_ICONS: Record<string, string> = {
  baja_temporal: 'FileX',
  baja_definitiva: 'FileX2',
  certificado_destruccion: 'Trash2',
  certificado_descontaminacion: 'Droplets',
  acta_retirada: 'ClipboardCheck',
  albaran_grua: 'Truck',
  justificante_deposito: 'Building2',
  informe_medioambiental: 'Leaf',
  licencia_actividad: 'BadgeCheck',
  registro_productor_residuos: 'Recycle',
  garantia_pieza: 'ShieldCheck',
  informe_pieza: 'ClipboardList',
  albaran_venta_pieza: 'PackageCheck',
  acta_adjudicacion: 'Gavel',
  doc_tasacion: 'Calculator',
};
```

#### Criterios de aceptación

- [x] Las nuevas subcategorías se aceptan y persisten sin romper documentos existentes — `VALID_DOC_SUB_CATEGORIES` ampliada en `couchdb.js`
- [x] `buildDocumentRecord` acepta y persiste `partId`, `acquisitionId`, `deregistrationId`, `documentHash` y demás campos nuevos
- [x] Los documentos existentes sin los campos nuevos devuelven valores por defecto seguros
- [x] `sanitizeDocumentRecord` expone todos los campos nuevos al frontend
- [x] `getScrapyardRequiredDocs` devuelve la lista correcta de docs obligatorios según el estado del vehículo — `couchdb.js`
- [x] `documentsApi.ts` refleja todos los tipos e interfaces nuevos — `ScrapyardDocCategory`, `partId`, `documentHash`, etc.
- [ ] Tests unitarios validan retrocompatibilidad con documentos legacy

---

### DDOC-02 — Tabs por categoría adaptados al desguace

**Tipo:** Frontend  
**Prioridad:** Alta  
**Dependencias:** DDOC-01

#### Contexto

Los tabs actuales de `DocumentsPage.tsx` son genéricos: `Sociedad`, `Contratos y alquileres`, `Licencias`, `Impuestos`, `Gastos del usuario`, `Otros`. Estos no tienen sentido para un desguace. El vertical necesita tabs propios que reflejen la operativa real de un centro autorizado de tratamiento (CAT): documentación del vehículo, compra/retirada, baja y destrucción, medioambiental, piezas, y regulatorio.

La lógica debe detectar el `businessType` activo y renderizar tabs diferentes según sea `scrapyard` o no, manteniendo los genéricos para otras verticales.

#### Qué hacer

**1. Definir tabs específicos para desguace**

```typescript
const SCRAPYARD_TAB_DEFS: TabDef[] = [
  {
    id: 'vehiculo',
    label: 'Vehículo',
    subtitle: 'Permiso, ficha técnica, informe tráfico',
    subCategories: ['permiso_circulacion', 'ficha_tecnica', 'informe_trafico', 'seguro'],
    icon: 'Car',
  },
  {
    id: 'compra_retirada',
    label: 'Compra y retirada',
    subtitle: 'Contratos, facturas, albaranes de grúa, actas',
    subCategories: ['contrato_compra', 'factura_compra', 'acta_retirada', 'albaran_grua', 'justificante_deposito', 'acta_adjudicacion', 'doc_tasacion', 'justificante'],
    icon: 'ShoppingCart',
  },
  {
    id: 'baja_destruccion',
    label: 'Baja y destrucción',
    subtitle: 'Bajas DGT, certificados de destrucción, descontaminación',
    subCategories: ['baja_temporal', 'baja_definitiva', 'certificado_destruccion', 'certificado_descontaminacion'],
    icon: 'FileX2',
  },
  {
    id: 'medioambiental',
    label: 'Medioambiental',
    subtitle: 'Informes medioambientales, residuos',
    subCategories: ['informe_medioambiental', 'registro_productor_residuos'],
    icon: 'Leaf',
  },
  {
    id: 'piezas',
    label: 'Piezas',
    subtitle: 'Garantías, informes y albaranes de piezas',
    subCategories: ['garantia_pieza', 'informe_pieza', 'albaran_venta_pieza'],
    icon: 'Cog',
  },
  {
    id: 'regulatorio',
    label: 'Regulatorio',
    subtitle: 'Licencias de actividad, ITV, registros',
    subCategories: ['licencia_actividad', 'itv'],
    icon: 'BadgeCheck',
  },
  {
    id: 'otros',
    label: 'Otros',
    subtitle: 'Documentación adicional',
    subCategories: ['reparacion', 'doc_cliente', 'anexo', 'otro'],
    icon: 'MoreHorizontal',
  },
];
```

**2. Detectar vertical activa y renderizar tabs**

```typescript
const { currentBusiness } = useBusiness();
const isScrapyard = currentBusiness?.businessType === 'scrapyard';
const tabDefs = isScrapyard ? SCRAPYARD_TAB_DEFS : GENERIC_TAB_DEFS;
```

**3. Filtrado por tab usando `docSubCategory`**

```typescript
const byTab = useMemo(() => {
  const currentTab = tabDefs.find(t => t.id === activeTab);
  if (!currentTab?.subCategories) return allDocuments;
  return allDocuments.filter(d =>
    currentTab.subCategories.includes(d.docSubCategory)
  );
}, [allDocuments, activeTab, tabDefs]);
```

**4. Cada tab muestra conteo de documentos**

```
[Vehículo (8)] [Compra (4)] [Baja (2)] [Medioamb. (1)] [Piezas (12)] [Regul. (3)] [Otros (0)]
```

**5. Los tabs son scrollables horizontalmente en móvil**

Usar contenedor con `overflow-x-auto` y `scroll-snap` para tablets y móviles.

**6. La URL refleja el tab activo**

```
/saas/vertical/desguaces/documentacion?tab=baja_destruccion
```

#### Criterios de aceptación

- [x] En vertical `scrapyard`, los tabs son los definidos arriba — `SCRAPYARD_TAB_DEFS` en `ScrapyardDocumentationPage.tsx` (página dedicada, no en `DocumentsPage`)
- [x] En otras verticales, se mantienen los tabs genéricos o los de compraventa — `DocumentsPage.tsx` no se modificó
- [ ] El conteo de documentos por tab es correcto y se actualiza al añadir/eliminar (no verificado)
- [ ] Los tabs son scrollables horizontalmente en pantallas pequeñas (no verificado)
- [x] La URL refleja el tab activo con query param `?tab=`
- [ ] Al cambiar de tab hay transición suave (fade o slide)

---

### DDOC-03 — Vista de expediente por vehículo (adaptada al desguace)

**Tipo:** Frontend  
**Prioridad:** Alta  
**Dependencias:** DDOC-01, DDOC-02

#### Contexto

Ya existe el componente `VehicleDocDossier.tsx` con un checklist de `REQUIRED_DOCS` fijo para compraventa (permiso, ficha, contrato compra, factura compra, ITV). El desguace tiene un checklist diferente y progresivo: los documentos obligatorios cambian según el estado del vehículo. Un vehículo `received` necesita permiso + ficha + contrato; un vehículo `compacted` necesita además baja definitiva + certificado destrucción + certificado descontaminación.

La vista expediente debe mostrar el ciclo de vida documental completo del vehículo, desde la entrada hasta la compactación.

#### Qué hacer

**1. Crear componente `ScrapyardDocDossier.tsx`**

Extiende o reemplaza `VehicleDocDossier` para el vertical desguace:

```
┌───────────────────────────────────────────────────────────────────┐
│ 🚗 1234 ABC · SEAT León 2015          Estado: En despiece        │
│    [████████████░░░░] 5/7 docs obligatorios                      │
│    ⚠ Falta: Cert. descontaminación, Baja definitiva              │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ── ENTRADA Y COMPRA ─────────────────────────────                │
│  📄 Permiso de circulación        ✅ Completo    14/03/26        │
│  📄 Ficha técnica                 ✅ Completo    14/03/26  [OCR] │
│  📄 Contrato de compra            ✅ Firmado     10/03/26        │
│  📄 Albarán de grúa               ✅ Completo    10/03/26        │
│                                                                   │
│  ── DESCONTAMINACIÓN ─────────────────────────────                │
│  📄 Cert. descontaminación        ❌ Pendiente   —               │
│                                                                   │
│  ── BAJA ─────────────────────────────────────────                │
│  📄 Baja definitiva DGT           ❌ Pendiente   —               │
│  📄 Certificado destrucción       ❌ Pendiente   —               │
│                                                                   │
│  ── PIEZAS (3 docs) ─────────────────────────────                │
│  📄 Garantía motor 1.9 TDI        ✅ Emitida     20/03/26       │
│  📄 Albarán venta faro DI         ✅ Emitida     22/03/26       │
│  📄 Informe centralita ABS        ✅ Completo    18/03/26       │
│                                                                   │
│  [+ Subir documento]  [📷 OCR]  [📋 Ver histórico]              │
└───────────────────────────────────────────────────────────────────┘
```

**2. Checklist de obligatorios dinámico según estado del vehículo**

```typescript
const SCRAPYARD_REQUIRED_DOCS: Record<string, { sub: string; label: string; phase: string }[]> = {
  always: [
    { sub: 'permiso_circulacion', label: 'Permiso de circulación', phase: 'entrada' },
    { sub: 'ficha_tecnica', label: 'Ficha técnica', phase: 'entrada' },
    { sub: 'contrato_compra', label: 'Contrato de compra', phase: 'entrada' },
  ],
  post_dismantling: [
    { sub: 'certificado_descontaminacion', label: 'Certificado descontaminación', phase: 'descontaminacion' },
  ],
  post_compacted: [
    { sub: 'baja_definitiva', label: 'Baja definitiva DGT', phase: 'baja' },
    { sub: 'certificado_destruccion', label: 'Certificado de destrucción', phase: 'baja' },
  ],
};
```

Los obligatorios se acumulan progresivamente: un vehículo `compacted` debe tener los 6 documentos.

**3. Agrupación visual por fase**

Los documentos se agrupan en secciones visuales:
- **Entrada y compra**: permiso, ficha, contrato, factura, albarán grúa, acta retirada
- **Descontaminación**: certificado descontaminación
- **Baja**: baja temporal/definitiva, certificado destrucción
- **Piezas**: documentos vinculados a piezas extraídas de este vehículo
- **Otros**: cualquier documento adicional

**4. Barra de progreso con 2 niveles**

- Barra principal: documentos obligatorios presentes / total obligatorios (según estado)
- Barra secundaria (sutil): documentos totales del expediente

**5. Indicadores de urgencia**

- Si el vehículo lleva >7 días sin baja y está en `fully_dismantled` o `compacted`: badge rojo "Baja urgente"
- Si falta certificado descontaminación y ya se inició el despiece: badge naranja "Descontaminación pendiente"

**6. Toggle lista / expediente en la página principal**

Botón toggle en la toolbar para alternar entre:
- Vista lista plana (tabs + tabla)
- Vista expedientes (agrupado por vehículo)

#### Criterios de aceptación

- [x] Se puede alternar entre vista lista y vista expediente — `viewMode: 'list' | 'dossier'` en `ScrapyardDocumentationPage.tsx`
- [x] La vista expediente agrupa documentos por vehículo — componente `ScrapyardDocDossier.tsx`
- [ ] El checklist de obligatorios es dinámico según el estado del vehículo — en frontend `SCRAPYARD_REQUIRED_DOCS` es una lista estática por fases (el dinámico por estado solo existe en backend `getScrapyardRequiredDocs`)
- [x] Los documentos se agrupan por fase (entrada, descontaminación, baja, piezas) — `ScrapyardDocDossier.tsx` filtra por `phase`
- [ ] Se muestra badge de urgencia cuando la baja lleva demasiado tiempo pendiente (no verificado)
- [ ] Se puede subir un documento directamente al expediente de un vehículo (no verificado)
- [ ] Documentos de piezas del vehículo aparecen en una sección dedicada (no verificado)
- [ ] Vehículos sin documentos aparecen con expediente vacío y CTA para subir (no verificado)
- [ ] Documentos sin vehículo aparecen en sección "Sin asignar" (no verificado)
- [ ] Funciona en desktop (tabla expandible) y en móvil (acordeón) (no verificado)

---

### DDOC-04 — Búsqueda avanzada: matrícula, bastidor, proveedor, cliente y pieza

**Tipo:** Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** DDOC-01

#### Contexto

La búsqueda actual en `DocumentsPage.tsx` solo filtra client-side por `name` y `vehicleName`. El desguace necesita buscar documentos también por referencia de pieza, código interno de pieza, nombre de proveedor o cliente, matrícula y bastidor. Además, el backend filtra por IDs exactos pero no por texto parcial.

#### Qué hacer

**1. Backend: Ampliar filtros en `listDocuments` (`controllers/documentsController.js`)**

Añadir parámetro `q` (query text) que busque en múltiples campos:

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
    (d.partName || '').toLowerCase().includes(q) ||
    (d.partCode || '').toLowerCase().includes(q) ||
    (d.docSubCategory || '').toLowerCase().includes(q)
  );
}
```

Añadir filtros adicionales:

```javascript
if (req.query.docSubCategory) {
  docs = docs.filter((d) => d.docSubCategory === req.query.docSubCategory);
}
if (req.query.partId) {
  docs = docs.filter((d) => d.partId === req.query.partId);
}
if (req.query.acquisitionId) {
  docs = docs.filter((d) => d.acquisitionId === req.query.acquisitionId);
}
if (req.query.isScrapyard !== undefined) {
  docs = docs.filter((d) => d.isScrapyard === (req.query.isScrapyard === 'true'));
}
```

**2. Frontend: Buscador unificado**

Input de búsqueda que busca simultáneamente en matrícula, bastidor, nombre de pieza, código de pieza, proveedor, cliente y nombre de documento. Mostrar resultados con indicación de por qué coincide (ej. "Matrícula: 1234 ABC" o "Pieza: MOT-A1B2-0003").

**3. Chips de filtro rápido bajo la barra de búsqueda**

```
[Todos (45)] [Permisos (6)] [Bajas (3)] [Descontaminación (4)] [Piezas (15)] [Facturas (8)] ...
```

Cada chip filtra por la subcategoría correspondiente con un contador.

**4. Filtro avanzado desplegable**

Botón "Filtros" que despliega panel con:
- Filtro por subcategoría (multi-select)
- Filtro por estado del documento (draft, pending, signed, completed)
- Filtro por fecha (rango)
- Filtro por vehículo (combobox)
- Filtro por pieza (combobox, solo desguace)
- Filtro por confianza OCR (slider min-max)

#### Criterios de aceptación

- [x] Se puede buscar por matrícula parcial (ej: "1234" encuentra "1234 ABC") — filtro `q` en `listDocuments` incluye `registrationPlate`
- [x] Se puede buscar por VIN parcial — filtro `q` incluye `vin`
- [x] Se puede buscar por nombre o código de pieza — filtro `q` incluye `partName` y `partCode`
- [x] Se puede buscar por nombre de proveedor o cliente — filtro `q` incluye `clientName` y `supplierName`
- [x] Se puede filtrar por subcategoría documental — filtro `docSubCategory` en backend + tabs por subcategorías en la página
- [ ] El filtro avanzado permite combinar múltiples criterios — no hay panel de filtro avanzado desplegable (multi-select, rango fechas, slider OCR)
- [ ] La búsqueda es instantánea (client-side con datos ya cargados) (no verificado)
- [ ] Funciona correctamente en desktop y en móvil (no verificado)

---

### DDOC-05 — OCR enriquecido para documentos de desguace

**Tipo:** Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** DDOC-01

#### Contexto

El endpoint OCR actual (`/api/ocr/scan`) ya tiene un modo `ocrMode === 'vehicle'` con prompt para documentos de automoción españoles (permiso, ficha técnica, contratos, ITV, facturas, seguros). Pero no cubre documentos específicos del desguace como bajas DGT, certificados de destrucción, certificados de descontaminación, albaranes de grúa o actas de retirada.

Hay que ampliar el prompt del modo vehículo para que reconozca estos tipos adicionales y extraiga los datos relevantes (fecha de baja, tipo de baja, número de expediente, centro de tratamiento, etc.).

#### Qué hacer

**1. Ampliar el prompt `VEHICLE_OCR_PROMPT` en `index.js`**

Extender la lista de `documentType` reconocidos y los campos extraíbles:

```
Eres un experto en OCR de documentos de automoción y desguaces españoles.
Analiza la imagen y extrae toda la información posible en formato JSON estricto.
Responde SOLO con JSON válido, sin markdown ni texto adicional.

Tipos de documento reconocidos:
- permiso_circulacion, ficha_tecnica, contrato_compra, contrato_venta
- factura_compra, factura_venta, itv, seguro, informe_trafico
- baja_temporal, baja_definitiva (documento de baja DGT)
- certificado_destruccion (certificado de destrucción de vehículo)
- certificado_descontaminacion (certificado de descontaminación CAT)
- acta_retirada (acta de entrega o retirada voluntaria)
- albaran_grua (albarán de servicio de grúa)
- doc_tasacion (documento de tasación o valoración)
- otro

El JSON debe tener esta estructura:
{
  "documentType": "<uno de los tipos de arriba>",
  "documentTypeLabel": "Descripción legible del tipo",
  "registrationPlate": "matrícula del vehículo" | null,
  "vin": "número de bastidor / VIN" | null,
  "vehicleBrand": "marca" | null,
  "vehicleModel": "modelo" | null,
  "vehicleYear": número | null,
  "ownerName": "nombre del titular / propietario" | null,
  "ownerNif": "NIF/NIE/CIF del titular" | null,
  "buyerName": "nombre del comprador" | null,
  "buyerNif": "NIF/NIE/CIF del comprador" | null,
  "sellerName": "nombre del vendedor" | null,
  "sellerNif": "NIF/NIE/CIF del vendedor" | null,
  "date": "fecha del documento YYYY-MM-DD" | null,
  "expiryDate": "fecha de caducidad YYYY-MM-DD" | null,
  "documentNumber": "número de documento / expediente" | null,
  "total": importe total (número) | null,
  "currency": "EUR" | null,

  // Campos específicos de baja y destrucción
  "deregistrationType": "temporal" | "definitiva" | null,
  "deregistrationDate": "fecha de baja YYYY-MM-DD" | null,
  "deregistrationReason": "motivo de la baja" | null,
  "treatmentCenter": "nombre del centro de tratamiento (CAT)" | null,
  "treatmentCenterCode": "código NIMA o identificador" | null,

  // Campos específicos de transporte
  "transportCompany": "empresa de grúa / transporte" | null,
  "originAddress": "dirección de recogida" | null,
  "deliveryNote": "número de albarán" | null,

  "notes": "cualquier dato adicional relevante" | null,
  "confidence": número 0–100
}
```

**2. Ampliar `OCR_TYPE_TO_SUB_CATEGORY` en `documentsController.js`**

Añadir los mapeos nuevos:

```javascript
const OCR_TYPE_TO_SUB_CATEGORY = {
  // Existentes...
  permiso_circulacion: 'permiso_circulacion',
  ficha_tecnica: 'ficha_tecnica',
  contrato_compra: 'contrato_compra',
  factura_compra: 'factura_compra',
  itv: 'itv',
  seguro: 'seguro',
  // Nuevos desguace
  baja_temporal: 'baja_temporal',
  baja_definitiva: 'baja_definitiva',
  certificado_destruccion: 'certificado_destruccion',
  certificado_descontaminacion: 'certificado_descontaminacion',
  acta_retirada: 'acta_retirada',
  albaran_grua: 'albaran_grua',
  doc_tasacion: 'doc_tasacion',
};
```

**3. Actualizar `SAAS__OcrScanModal.tsx` para modo desguace**

- Si el `businessType` es `scrapyard`, mostrar el modo de escaneo como "Documento de desguace" con icono de reciclaje
- Tras el escaneo, mostrar campos extraídos relevantes según el tipo:
  - Si `baja_*`: mostrar fecha de baja, tipo, motivo, centro de tratamiento
  - Si `certificado_descontaminacion`: mostrar centro de tratamiento, código NIMA
  - Si `albaran_grua`: mostrar empresa de grúa, dirección de recogida, nº albarán
  - Si documento de vehículo: mostrar matrícula, bastidor, titular (como ya existe)

**4. Guardar campos específicos en ocrData**

Los datos extraídos del OCR de documentos de desguace se guardan completos en `ocrData` y además se propagan a los campos del documento:

```javascript
if (ocrResult.deregistrationType) doc.deregistrationType = ocrResult.deregistrationType;
if (ocrResult.deregistrationDate) doc.deregistrationDate = ocrResult.deregistrationDate;
if (ocrResult.expiryDate) doc.expiryDate = ocrResult.expiryDate;
```

#### Criterios de aceptación

- [x] El prompt OCR reconoce documentos de baja DGT y extrae tipo y fecha — prompt en `index.js` incluye `baja_temporal`/`baja_definitiva`, `deregistrationType`
- [x] El prompt reconoce certificados de destrucción y descontaminación — incluye `certificado_destruccion`, `certificado_descontaminacion`, `treatmentCenter`
- [x] El prompt reconoce albaranes de grúa — incluye `albaran_grua` y `acta_retirada`
- [x] El mapeo `OCR_TYPE_TO_SUB_CATEGORY` incluye los tipos nuevos del desguace — `documentsController.js`
- [ ] El modal OCR muestra campos relevantes según el tipo detectado (no verificado en `SAAS__OcrScanModal.tsx`)
- [x] Los datos extraídos se propagan a los campos correspondientes del documento — `createDocument` propaga `deregistrationDate/Type`, `itvExpiryDate`, `docSubCategory`
- [x] El campo `confidence` se guarda como `ocrConfidence` — campo existente en `buildDocumentRecord`
- [ ] Funciona con documentos reales de baja DGT españoles (requiere prueba manual)
- [ ] Funciona con certificados de descontaminación (requiere prueba manual)

---

### DDOC-06 — Vinculación automática: documento → vehículo, proveedor, adquisición, pieza

**Tipo:** Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** DDOC-01, DDOC-05

#### Contexto

El sistema ya tiene `autoLinkByPlateOrVin` en `documentsController.js` que vincula documentos a vehículos por matrícula o bastidor. Pero el desguace necesita vinculaciones adicionales:
- Documento → adquisición/expediente de compra (por matrícula del vehículo)
- Documento → pieza (por código interno de pieza si aparece en el documento)
- Documento → proceso de baja (vincular baja DGT al vehículo y su registro de deregistración)

#### Qué hacer

**1. Backend: Ampliar `autoLinkByPlateOrVin` para incluir adquisición**

Tras vincular el documento a un vehículo, buscar si hay una adquisición abierta para ese vehículo:

```javascript
async function autoLinkToAcquisition(doc, vehicleId, userId) {
  const acquisitions = await listAcquisitionsByVehicle(userId, vehicleId);
  const openAcq = acquisitions.find(a =>
    !['cerrada', 'cancelada'].includes(a.status)
  );
  if (openAcq) {
    doc.acquisitionId = openAcq._id;
    openAcq.linkedDocumentIds = [...new Set([...openAcq.linkedDocumentIds, doc._id])];
    await updateAcquisition(openAcq);
  }
}
```

**2. Backend: Vinculación a pieza por código**

Si el documento tiene un campo `partCode` (extraído manualmente o por OCR) o si el nombre del documento contiene un código de pieza reconocible:

```javascript
async function autoLinkToPart(doc, userId) {
  if (!doc.partCode && !doc.partName) return;
  const parts = await listScrapyardParts(userId, {
    search: doc.partCode || doc.partName
  });
  if (parts.length === 1) {
    doc.partId = parts[0]._id;
    doc.partName = parts[0].nombre;
    doc.partCode = parts[0].codigoInterno;
  }
}
```

**3. Backend: Vinculación de baja a vehículo**

Cuando se crea un documento con `docSubCategory` de tipo `baja_temporal` o `baja_definitiva`:
- Vincular al vehículo por matrícula/bastidor
- Actualizar el vehículo: `fechaBaja = doc.deregistrationDate`, `tipoBaja = doc.deregistrationType`
- Si hay un registro de deregistración en `ScrapyardDeregistrations`, vincular con `deregistrationId`

**4. Frontend: Panel de vinculación post-OCR**

Tras un escaneo OCR exitoso, mostrar panel con las vinculaciones detectadas:

```
┌─────────────────────────────────────────────────┐
│ 🔗 Vinculaciones detectadas                     │
│                                                  │
│ ✅ Vehículo: SEAT León 2015 (1234 ABC)          │
│    Coincide por matrícula                        │
│                                                  │
│ ✅ Expediente compra: CR-2026-015                │
│    Adquisición abierta de este vehículo          │
│                                                  │
│ ⚠ Proveedor: "Grúas Martínez" no encontrado     │
│    [Crear proveedor]  [Ignorar]                  │
│                                                  │
│ [Confirmar vinculaciones]  [Editar manualmente]  │
└─────────────────────────────────────────────────┘
```

**5. Frontend: Selectores de vinculación en modal de subida**

En `SAAS__UploadDocumentModal`, cuando el negocio es `scrapyard`, añadir selectores:
- Vehículo (combobox con búsqueda por matrícula/marca/modelo)
- Pieza (combobox con búsqueda por código/nombre — solo si es doc de pieza)
- Expediente de compra (auto-detectado si se selecciona vehículo)

#### Criterios de aceptación

- [x] Tras OCR con matrícula detectada, el vehículo se pre-selecciona automáticamente — `autoLinkByPlateOrVin` en `documentsController.js`
- [x] Si el vehículo tiene adquisición abierta, se vincula automáticamente — `autoLinkByPlateOrVin` busca `vehicle_acquisition` abierta y asigna `acquisitionId`
- [ ] Documentos de baja actualizan `fechaBaja` y `tipoBaja` del vehículo — se guardan `deregistrationDate/Type` en el documento, pero no se encontró actualización del documento del vehículo
- [ ] La vinculación a pieza funciona por código interno — no existe `autoLinkToPart`; solo vinculación manual con `partId`
- [ ] Se muestra toast informativo cuando se auto-vincula (no verificado)
- [ ] El usuario puede corregir o rechazar las vinculaciones automáticas (no hay panel de vinculaciones post-OCR)
- [ ] Los selectores en el modal de subida tienen búsqueda con autocomplete (no verificado)
- [x] Se puede buscar vehículo por matrícula o bastidor — filtro `q` incluye `registrationPlate` y `vin`
- [x] Se puede buscar pieza por código o nombre — filtro `q` incluye `partName` y `partCode`

---

### DDOC-07 — Alertas: documento obligatorio faltante, baja pendiente, OCR incompleto, documento duplicado

**Tipo:** Backend (alertEngine)  
**Prioridad:** Alta  
**Dependencias:** DDOC-01, DDOC-03

#### Contexto

El `alertEngine.js` tiene la infraestructura de alertas con deduplicación, SSE y Web Push. Hay que añadir 4 reglas específicas para la documentación del desguace. La alerta de "baja pendiente" es especialmente crítica por las obligaciones regulatorias de los CAT (centros autorizados de tratamiento).

#### Qué hacer

**1. Regla: Documento obligatorio faltante**

Para cada vehículo con estado de desguace activo, comprobar que tiene los documentos obligatorios según su fase:

```javascript
async function checkScrapyardMissingDocs(userId) {
  const vehicles = await fetchVehiclesWithScrapyardStatus(userId);
  const documents = await fetchAllDocs(getDocumentsDbName());

  for (const vehicle of vehicles) {
    const required = getScrapyardRequiredDocs(vehicle.status);
    const vehicleDocs = documents.filter(d => d.vehicleId === vehicle._id);
    const presentSubs = new Set(vehicleDocs.map(d => d.docSubCategory));
    const missing = required.filter(sub => !presentSubs.has(sub));

    if (missing.length > 0) {
      await emitAlert({
        userId,
        dedupKey: `scrapyard-missing-docs:${vehicle._id}`,
        level: missing.length >= 3 ? 'alert' : 'warning',
        category: 'documentacion',
        source: 'desguace',
        title: `Docs faltantes: ${vehicle.registrationPlate || vehicle.brand + ' ' + vehicle.model}`,
        message: `Faltan ${missing.length} documentos obligatorios: ${missing.map(labelFor).join(', ')}`,
        entityId: vehicle._id,
        entityType: 'vehicle',
        route: `/saas/vertical/desguaces/documentacion?view=dossier&vehicle=${vehicle._id}`,
      });
    }
  }
}
```

**2. Regla: Baja pendiente**

Alerta regulatoria crítica: si un vehículo lleva más de X días en el desguace sin baja DGT tramitada:

```javascript
async function checkPendingDeregistrations(userId) {
  const vehicles = await fetchVehiclesWithScrapyardStatus(userId);
  const documents = await fetchAllDocs(getDocumentsDbName());
  const now = new Date();

  for (const vehicle of vehicles) {
    if (!['fully_dismantled', 'compacted'].includes(vehicle.status)) continue;

    const hasBaja = documents.some(d =>
      d.vehicleId === vehicle._id &&
      ['baja_temporal', 'baja_definitiva'].includes(d.docSubCategory)
    );

    if (!hasBaja) {
      const entryDate = new Date(vehicle.entryDate || vehicle.purchaseDate || vehicle.createdAt);
      const daysInYard = Math.floor((now - entryDate) / 86400000);

      if (daysInYard > 7) {
        await emitAlert({
          userId,
          dedupKey: `baja-pending:${vehicle._id}`,
          level: daysInYard > 30 ? 'alert' : 'warning',
          category: 'documentacion',
          source: 'desguace',
          title: `Baja pendiente: ${vehicle.registrationPlate}`,
          message: `El vehículo lleva ${daysInYard} días sin baja DGT. ${daysInYard > 30 ? 'Riesgo de sanción regulatoria.' : 'Se recomienda tramitar cuanto antes.'}`,
          entityId: vehicle._id,
          entityType: 'vehicle',
          route: `/saas/vertical/desguaces/documentacion?view=dossier&vehicle=${vehicle._id}`,
        });
      }
    }
  }
}
```

**3. Regla: Lectura OCR incompleta**

Documentos escaneados con confianza baja que requieren revisión manual:

```javascript
async function checkIncompleteOcrScrapyard(userId) {
  const documents = await fetchAllDocs(getDocumentsDbName());
  const now = new Date();

  const recent = documents.filter(d =>
    d.isScrapyard &&
    d.ocrData &&
    d.ocrConfidence > 0 &&
    d.ocrConfidence < 60 &&
    daysBetween(d.createdAt, now) <= 7
  );

  for (const doc of recent) {
    await emitAlert({
      userId,
      dedupKey: `ocr-incomplete-scrapyard:${doc._id}`,
      level: 'info',
      category: 'documentacion',
      source: 'desguace',
      title: `OCR incompleto: ${doc.name}`,
      message: `La lectura automática tiene baja confianza (${doc.ocrConfidence}%). Revisa los datos manualmente.`,
      entityId: doc._id,
      entityType: 'document',
      route: `/saas/documents/${doc._id}`,
    });
  }
}
```

**4. Regla: Documento duplicado**

Detectar documentos con el mismo `documentHash` (hash SHA-256 del archivo) para el mismo vehículo:

```javascript
async function checkDuplicateDocuments(userId) {
  const documents = await fetchAllDocs(getDocumentsDbName());

  const hashMap = {};
  for (const doc of documents) {
    if (!doc.documentHash || !doc.vehicleId) continue;
    const key = `${doc.vehicleId}:${doc.documentHash}`;
    if (!hashMap[key]) hashMap[key] = [];
    hashMap[key].push(doc);
  }

  for (const [key, docs] of Object.entries(hashMap)) {
    if (docs.length > 1) {
      const first = docs[0];
      await emitAlert({
        userId,
        dedupKey: `doc-duplicate:${key}`,
        level: 'info',
        category: 'documentacion',
        source: 'desguace',
        title: `Documento duplicado detectado`,
        message: `"${first.name}" está subido ${docs.length} veces para el vehículo ${first.registrationPlate || first.vehicleId}`,
        entityId: first.vehicleId,
        entityType: 'vehicle',
        route: `/saas/vertical/desguaces/documentacion?view=dossier&vehicle=${first.vehicleId}`,
      });
    }
  }
}
```

**5. Registrar las reglas en el ciclo de alertas**

En `alertEngine.js`, dentro del bloque condicional de desguace:

```javascript
if (businessType === 'scrapyard') {
  await checkScrapyardMissingDocs(userId);
  await checkPendingDeregistrations(userId);
  await checkIncompleteOcrScrapyard(userId);
  await checkDuplicateDocuments(userId);
}
```

**6. Configuración por cuenta**

```javascript
scrapyardDocAlertsConfig: {
  enabled: true,
  bajaPendingDaysThreshold: 7,
  bajaCriticalDaysThreshold: 30,
  ocrIncompleteConfidenceThreshold: 60,
  duplicateDetectionEnabled: true,
}
```

#### Criterios de aceptación

- [x] Se genera alerta cuando un vehículo de desguace tiene documentos obligatorios faltantes — `checkVehicleMissingDocs` (`scrapyard_vehicle_missing_docs`) en `scrapyardAlertEngine.js`, usa `getScrapyardRequiredDocs`
- [x] Se genera alerta cuando un vehículo despiezado/compactado lleva días sin baja DGT — `checkPendingDeregistration` (`scrapyard_pending_deregistration`)
- [ ] La alerta de baja pendiente sube a nivel `alert` (crítica) después de 30 días (escalado no verificado; existe flag `escalable: true`)
- [ ] Se genera alerta cuando un OCR tiene confianza <60% — no hay regla de OCR incompleto específica de desguace en `scrapyardAlertEngine.js`
- [ ] Se genera alerta cuando se detecta un documento duplicado — el duplicado se bloquea con 409 al subir, pero no hay alerta periódica de duplicados
- [x] Las alertas tienen deduplicación (no se repiten) — `dedupKey` en `emit` del motor
- [x] Las alertas se envían por SSE y Web Push — usa la infraestructura común de `alertEngine.js`/`alertEmitter`
- [x] Las alertas incluyen enlace directo al expediente del vehículo — campo `route` en las alertas
- [x] Los umbrales son configurables por cuenta — `getScrapyardAlertConfig` (`vehicleMissingDocsGraceDays`, etc.)

---

### DDOC-08 — Panel de alertas documentales en Dashboard del desguace

**Tipo:** Frontend  
**Prioridad:** Media  
**Dependencias:** DDOC-07

#### Contexto

Las alertas del DDOC-07 se generan en el backend pero necesitan visibilidad inmediata en el Dashboard del desguace (`ScrapyardDashboard.tsx`). Actualmente el dashboard tiene KPIs y accesos rápidos pero no muestra alertas documentales.

#### Qué hacer

**1. Crear componente `ScrapyardDocAlertsWidget`**

Widget para el dashboard que agrupa alertas documentales:

```
┌───────────────────────────────────────────────────┐
│ 📋 Documentación                   ver todo →     │
├───────────────────────────────────────────────────┤
│ 🔴 2 vehículos con baja pendiente (>30 días)     │
│ 🟡 3 vehículos con docs obligatorios faltantes    │
│ 🟡 1 baja pendiente (<30 días)                    │
│ 🔍 2 OCR con baja confianza                      │
│ 📎 1 documento duplicado detectado                │
├───────────────────────────────────────────────────┤
│ ✅ 12 vehículos con expediente completo           │
└───────────────────────────────────────────────────┘
```

**2. Integrar en `ScrapyardDashboard.tsx`**

Añadir el widget al layout del dashboard junto a los KPIs existentes, con posición destacada (es regulatorio).

**3. Cada línea de alerta es clickeable**

Navega al recurso afectado usando la `route` de la alerta.

**4. KPI de completitud documental**

Añadir a los KPIs del dashboard:
- "Expedientes completos" / "Total vehículos" con barra de progreso

#### Criterios de aceptación

- [x] El widget aparece en el Dashboard del vertical `scrapyard` — sección "Alertas documentales" en `dashboards/ScrapyardDashboard.tsx`, consume `/api/documents/:userId/alerts` filtrado por `isScrapyard`
- [x] Muestra recuento de alertas activas — badge con `docAlerts.length` y listado de hasta 8
- [ ] Las bajas pendientes >30 días se destacan en rojo (escalado visual no verificado)
- [x] Cada alerta es clickeable y lleva al recurso afectado — "ver todo" navega a `/saas/vertical/desguaces/documentacion`
- [ ] Si no hay alertas, muestra "Todo en orden" con check verde — el bloque se oculta si no hay alertas
- [ ] El KPI de completitud documental es correcto (no hay KPI "expedientes completos / total")
- [x] El diseño es consistente con los demás widgets del dashboard

---

### DDOC-09 — Archivado automático en expediente

**Tipo:** Backend  
**Prioridad:** Media  
**Dependencias:** DDOC-01, DDOC-05, DDOC-06

#### Contexto

Los requisitos piden "archivar automáticamente en el expediente correcto". Esto implica que al subir un documento (con o sin OCR), el sistema debe auto-categorizarlo, vincularlo al vehículo/adquisición/pieza correctos, y archivarlo en el expediente sin intervención manual. Además, cuando un vehículo se compacta y se cierra su expediente, la documentación debe marcarse como archivada.

#### Qué hacer

**1. Auto-categorización por OCR**

Al crear un documento con `ocrData`, asignar automáticamente:
- `docSubCategory` desde `OCR_TYPE_TO_SUB_CATEGORY`
- `isScrapyard: true` si el tipo pertenece a las categorías de desguace
- `deregistrationType` y `deregistrationDate` si es baja
- `expiryDate` si es ITV, seguro o certificado con caducidad

**2. Auto-vinculación en cascada**

Cuando se crea un documento para un negocio de tipo `scrapyard`:

```javascript
async function autoFileScrapyardDocument(doc, userId) {
  // 1. Vincular a vehículo por matrícula/VIN
  if (doc.registrationPlate || doc.vin) {
    const vehicle = await findVehicleByPlateOrVin(userId, doc.registrationPlate, doc.vin);
    if (vehicle) {
      doc.vehicleId = vehicle._id;
      doc.vehicleName = `${vehicle.brand} ${vehicle.model}`;
    }
  }

  // 2. Vincular a adquisición abierta del vehículo
  if (doc.vehicleId) {
    await autoLinkToAcquisition(doc, doc.vehicleId, userId);
  }

  // 3. Vincular a pieza si aplica
  if (doc.partCode) {
    await autoLinkToPart(doc, userId);
  }

  // 4. Si es baja, actualizar datos del vehículo
  if (['baja_temporal', 'baja_definitiva'].includes(doc.docSubCategory) && doc.vehicleId) {
    await updateVehicleDeregistration(userId, doc.vehicleId, {
      fechaBaja: doc.deregistrationDate,
      tipoBaja: doc.deregistrationType,
    });
  }

  // 5. Si es certificado descontaminación, marcar en el vehículo
  if (doc.docSubCategory === 'certificado_descontaminacion' && doc.vehicleId) {
    await updateVehicle(userId, doc.vehicleId, {
      descontaminacionCompleta: true,
      descontaminacionFecha: doc.date,
    });
  }

  // 6. Marcar como documento de desguace
  doc.isScrapyard = true;
}
```

**3. Hash de documento para detección de duplicados**

Al subir un archivo, calcular hash SHA-256 del contenido y guardarlo en `documentHash`. Antes de guardar, comprobar si ya existe un documento con el mismo hash para el mismo vehículo:

```javascript
if (doc.documentHash && doc.vehicleId) {
  const existing = await findDocByHash(userId, doc.vehicleId, doc.documentHash);
  if (existing) {
    return res.status(409).json({
      ok: false,
      error: 'duplicate',
      existingDocId: existing._id,
      existingDocName: existing.name,
      message: 'Este documento ya existe en el expediente del vehículo',
    });
  }
}
```

**4. Archivado al compactar vehículo**

Cuando un vehículo pasa a estado `compacted`, archivar su expediente documental:

```javascript
async function archiveVehicleDocuments(userId, vehicleId) {
  const docs = await listDocumentsByVehicle(userId, vehicleId);
  for (const doc of docs) {
    doc.archived = true;
    doc.archivedAt = new Date().toISOString();
    doc.archivedReason = 'vehicle_compacted';
    await updateDocument(userId, doc._id, doc);
  }
}
```

Los documentos archivados aparecen con estilo atenuado y badge "Archivado".

#### Criterios de aceptación

- [x] Documentos creados por OCR se auto-categorizan según el tipo detectado — `OCR_TYPE_TO_SUB_CATEGORY` en `createDocument`
- [x] Si el OCR detecta matrícula, se vincula automáticamente al vehículo — `autoLinkByPlateOrVin`
- [x] Si el vehículo tiene adquisición abierta, se vincula automáticamente — asigna `acquisitionId` en el auto-link
- [ ] Documentos de baja actualizan `fechaBaja` y `tipoBaja` del vehículo — solo se guardan en el documento, no en el vehículo
- [ ] Documentos de descontaminación marcan `descontaminacionCompleta` en el vehículo
- [x] Se detectan duplicados por hash antes de guardar (error 409) — `checkDuplicateDocument` + `documentHash` en `createDocument`
- [ ] Al compactar un vehículo, sus documentos se marcan como archivados — no existe `archiveVehicleDocuments` (sí existe el filtro `archived` en listado)
- [ ] Los documentos archivados son visibles pero con estilo diferenciado (no verificado)
- [ ] El flujo completo (subir → OCR → categorizar → vincular → archivar) funciona sin intervención manual — falta el paso de archivado automático

---

### DDOC-10 — Permisos por perfil: gerente vs trabajador

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** DDOC-01

#### Contexto

Dos perfiles:
- **Gerente:** ve y valida toda la documentación, puede eliminar, puede validar que un expediente está completo, ve documentos confidenciales (precios, contratos)
- **Trabajador:** sube documentos y consulta los permitidos para su tarea (ficha técnica, albaranes, certificados), no puede eliminar ni acceder a documentos financieros

#### Qué hacer

**1. Definir permisos en `TEAM_PERMISSION_KEYS`**

```javascript
'scrapyard_docs_view_all',       // Ver todos los documentos de desguace
'scrapyard_docs_create',         // Subir documentos
'scrapyard_docs_edit',           // Editar metadatos de documentos
'scrapyard_docs_delete',         // Eliminar documentos
'scrapyard_docs_validate',       // Validar expediente como completo
'scrapyard_docs_view_financial', // Ver documentos financieros (facturas, contratos con precios)
'scrapyard_docs_ocr',            // Usar OCR para escanear documentos
```

**2. Configuración por defecto**

| Permiso | Gerente (admin) | Trabajador (worker) |
|---|---|---|
| `scrapyard_docs_view_all` | Si | No (solo docs de vehículos asignados) |
| `scrapyard_docs_create` | Si | Si |
| `scrapyard_docs_edit` | Si | No |
| `scrapyard_docs_delete` | Si | No |
| `scrapyard_docs_validate` | Si | No |
| `scrapyard_docs_view_financial` | Si | No |
| `scrapyard_docs_ocr` | Si | Si |

**3. Backend: Middleware de permisos**

Verificar permisos en cada endpoint de documentos cuando `isScrapyard` es true.

**4. Frontend: Vista trabajador**

- Solo ve documentos de los vehículos en los que está trabajando (filtro por `assignedWorkers` si existe, o todos si no hay asignación)
- Puede subir documentos (certificados, albaranes, fotos)
- Puede escanear con OCR
- NO puede eliminar documentos
- NO puede ver facturas ni contratos con precios
- NO puede validar expedientes
- Banner informativo: "Para validar o eliminar documentos, contacta con tu responsable"

**5. Actualizar Sidebar**

El trabajador ve la sección "Documentación" en el sidebar pero con acceso limitado. No se oculta completamente porque necesita subir documentos.

#### Criterios de aceptación

- [ ] El gerente ve todos los documentos y tiene CRUD completo + validación — sin flujo de validación de expediente
- [ ] El trabajador ve solo documentos relevantes y puede crear + leer (no eliminar ni validar) — no hay filtrado por vehículos asignados
- [ ] Los botones de eliminar/validar no aparecen en la UI del trabajador (no verificado)
- [ ] El trabajador no ve documentos financieros (facturas con precios, contratos)
- [ ] El backend rechaza con 403 las acciones no permitidas — sin middleware de permisos por acción en `documentsRouter`
- [x] El trabajador tiene acceso a documentación en el Sidebar — existe permiso `scrapyard_docs` en `TEAM_PERMISSION_KEYS` y la ruta se gatea con `RequireWorkerPermission permission={['scrapyard_docs', 'documents']}`

---

### DDOC-11 — Conexiones con módulos del desguace

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** DDOC-03, DDOC-06

#### Contexto

La documentación del desguace debe estar conectada bidireccionalmente con todos los módulos operativos: entrada de vehículo, compras y retiradas, bajas, finanzas, piezas, medioambiental y dashboard.

#### Qué hacer

**1. Conexión con Entrada de vehículo (ScrapyardVehicles)**

En la ficha de un vehículo de desguace:
- Tab/sección "Documentación" con mini-expediente (`ScrapyardDocDossier` de DDOC-03)
- Barra de progreso de docs obligatorios según estado
- Botón rápido "Subir documento" y "OCR"
- Enlace "Ver expediente completo →" que lleva a `/saas/vertical/desguaces/documentacion?view=dossier&vehicle={id}`

**2. Conexión con Compras y retiradas (ScrapyardPurchasesPage)**

En el detalle de una adquisición:
- Sección "Documentación" con los documentos vinculados al `acquisitionId`
- Checklist de docs obligatorios de la compra (contrato, factura, albarán)
- Botón "Subir documento" que pre-rellena `vehicleId` y `acquisitionId`
- Al escanear una factura por OCR, se vincula automáticamente a la adquisición

**3. Conexión con Bajas (ScrapyardDeregistrations)**

En el listado de bajas:
- Columna "Documentación" con icono ✅/❌ indicando si el expediente de baja está completo
- Al registrar una baja, ofrecer "Subir documento de baja" con `docSubCategory` pre-seleccionada
- Al subir un documento de baja desde la página de documentación, vincular con el registro de deregistración

**4. Conexión con Finanzas**

Los documentos financieros (facturas, justificantes) vinculados a vehículos de desguace son accesibles desde el módulo de finanzas con filtro "Desguace".

**5. Conexión con Piezas (ScrapyardParts)**

En el detalle de una pieza:
- Sección "Documentos" con los docs vinculados al `partId`
- Botón "Adjuntar documento" (garantía, informe técnico)
- Los documentos de piezas aparecen en la sección "Piezas" del expediente del vehículo

**6. Conexión con Medioambiental (ScrapyardEnvironment)**

Desde la página medioambiental:
- Enlace a los certificados de descontaminación del vehículo
- Enlace a los informes medioambientales

**7. Navegación cruzada**

| Desde | Enlace a | Descripción |
|---|---|---|
| ScrapyardVehicles (ficha) | Documentación (expediente) | "Ver expediente documental" |
| ScrapyardPurchasesPage (detalle) | Documentación (filtrado) | "Ver documentos de esta compra" |
| ScrapyardDeregistrations (fila) | Documentación (filtrado) | "Ver documentos de baja" |
| ScrapyardParts (detalle pieza) | Documentación (filtrado) | "Ver documentos de esta pieza" |
| Documentación (expediente) | ScrapyardVehicles (ficha) | "Ver vehículo" |
| Documentación (doc vinculado) | ScrapyardPurchasesPage (detalle) | "Ver compra" |
| Dashboard (widget alertas) | Documentación (filtrado) | Clic lleva al recurso |

#### Criterios de aceptación

- [x] Desde la ficha del vehículo se accede al expediente documental — `ScrapyardVehicleDetail.tsx` usa `ScrapyardDocDossier`/enlace a documentación
- [ ] Desde la adquisición se ven los documentos vinculados — `ScrapyardPurchasesPage.tsx` no referencia el dossier documental (no verificado checklist de docs por adquisición)
- [x] Desde las bajas se ve el estado documental — `ScrapyardDeregistrations.tsx` enlaza con documentación
- [x] Desde las piezas se ven los documentos asociados — `ScrapyardParts.tsx` enlaza con documentación
- [ ] Todos los enlaces de navegación cruzada funcionan correctamente (verificados parcialmente: vehículos, bajas, piezas, medioambiental, dashboard)
- [ ] Se puede subir un documento desde cualquier módulo con contexto pre-rellenado (no verificado)

---

### DDOC-12 — Estructura de página `/saas/vertical/desguaces/documentacion`

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Dependencias:** DDOC-02, DDOC-03

#### Contexto

No existe una página dedicada para la documentación del desguace. La documentación genérica está en `/saas/documents` pero no está adaptada al vertical. Se necesita crear la página y registrarla en rutas y sidebar.

#### Qué hacer

**1. Crear `src/app/pages/saas/ScrapyardDocumentationPage.tsx`**

Layout de la página:

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: "Documentación"   [Lista | Expedientes]  [+ Subir] [OCR]│
├──────────────────────────────────────────────────────────────────┤
│ KPIs: 4 tarjetas                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │   45     │ │    3     │ │    2     │ │    1     │            │
│ │  Total   │ │  Bajas   │ │  Docs    │ │  OCR     │            │
│ │  docs    │ │ pendient.│ │ faltantes│ │ revisar  │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
├──────────────────────────────────────────────────────────────────┤
│ Búsqueda: [🔍 Buscar por matrícula, pieza, proveedor...]       │
│ Chips: [Todos] [Vehículo] [Compra] [Baja] [Medioamb.] [Piezas]│
├──────────────────────────────────────────────────────────────────┤
│ VISTA LISTA:                                                     │
│   Tabla con columnas: Nombre, Tipo, Vehículo, Pieza, Fecha,    │
│   Estado, OCR, Acciones                                          │
│                                                                  │
│ VISTA EXPEDIENTES:                                               │
│   Lista de ScrapyardDocDossier por vehículo                     │
│   + Sección "Sin asignar" al final                              │
├──────────────────────────────────────────────────────────────────┤
│ Panel lateral (drawer): Detalle del documento seleccionado       │
└──────────────────────────────────────────────────────────────────┘
```

**2. Registrar ruta en `routes.tsx`**

```typescript
{ path: 'vertical/desguaces/documentacion', Component: ScrapyardDocumentationPage },
```

**3. Actualizar Sidebar (`Sidebar.tsx`)**

Añadir ítem en el grupo del desguace:

```typescript
{ id: 'scrapyard-documentation', navKey: 'scrapyardDocumentation', icon: <FileText className="w-5 h-5" />, path: '/saas/vertical/desguaces/documentacion' },
```

Insertar en el grupo `scrapyard` de `menuGroupDefs`, después de ventas y antes de medioambiental. El ítem del grupo `documentacion` genérico se puede mantener para documentación de sociedad, pero el enlace principal para el desguace será este.

**4. Añadir traducción i18n**

```json
{
  "nav": {
    "scrapyardDocumentation": "Documentación"
  }
}
```

**5. Deep linking**

- `?view=list|dossier` — alterna entre vista lista y expedientes
- `?vehicle={vehicleId}` — filtra por vehículo y lo expande en vista expediente
- `?tab=baja_destruccion` — activa tab específico
- `?docId={documentId}` — abre el drawer de detalle de ese documento

**6. Responsive**

- Desktop (>1024px): Tabla + drawer lateral
- Tablet (768–1024px): Tabla compacta + drawer overlay
- Móvil (<768px): Vista tarjetas + página completa de detalle

**7. KPIs en cabecera**

| KPI | Icono | Color | Fuente |
|---|---|---|---|
| Total documentos | FileText | Azul | Count total de docs de desguace |
| Bajas pendientes | FileX2 | Rojo | Vehículos despiezados/compactados sin baja DGT |
| Docs obligatorios faltantes | AlertTriangle | Ámbar | Sum de docs faltantes en todos los vehículos |
| OCR por revisar | ScanLine | Púrpura | Count de docs con ocrConfidence < 60 |

#### Criterios de aceptación

- [x] La página es accesible desde `/saas/vertical/desguaces/documentacion` — ruta en `routes.tsx` con gate `scrapyard_docs`
- [x] Aparece en el Sidebar del vertical desguace — ítem `scrapyard-documentation` en el grupo `scrapyard`
- [ ] Los KPIs reflejan datos reales (no verificado el detalle de los 4 KPIs)
- [x] Se puede alternar entre vista lista y vista expedientes — `viewMode` en la página
- [x] El deep linking funciona — lee `?tab=` y parámetro de vehículo para abrir dossier
- [ ] Es responsive en todos los breakpoints (no verificado)
- [ ] El i18n está configurado (no verificado `nav.scrapyardDocumentation`)

---

### DDOC-13 — Histórico documental real (activity log)

**Tipo:** Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** DDOC-01

#### Contexto

La página `DocumentDetail.tsx` muestra un histórico mock. El backend ya tiene activity logging (`logAccountActivity` en `documentsController.js`) y un endpoint `getDocumentHistory`. Pero el frontend no consume datos reales. Necesitamos que el histórico sea real y refleje cada acción sobre el documento, especialmente importante en el desguace por la trazabilidad regulatoria.

#### Qué hacer

**1. Backend: Verificar que `getDocumentHistory` devuelve datos reales**

El endpoint ya existe en `documentsRouter.js`. Verificar que:
- Devuelve todos los registros de `logAccountActivity` donde `entityId === documentId`
- Ordenados por timestamp descendente
- Incluye: acción, usuario, fecha, detalle

**2. Frontend: Consumir histórico real en `DocumentDetail.tsx`**

Reemplazar el histórico mock por llamada a la API.

**3. Registrar más eventos en el activity log**

Asegurar que se logueen todos estos eventos para documentos de desguace:
- Documento creado
- Documento actualizado
- Archivo adjuntado/reemplazado
- OCR ejecutado sobre el documento
- Vinculación a vehículo/pieza/adquisición cambiada
- Subcategoría cambiada
- Documento archivado (por compactación del vehículo)
- Documento eliminado
- Documento descargado
- Expediente validado por gerente

**4. UI del timeline**

Mostrar el histórico como línea temporal visual con:
- Icono por tipo de evento (upload, edit, ocr, link, archive, delete)
- Actor (quién lo hizo)
- Timestamp relativo con tooltip de fecha exacta
- Descripción del evento
- Si fue acción automática (OCR, archivado): badge "Automático"

#### Criterios de aceptación

- [ ] El histórico muestra datos reales, no mock — `DocumentDetail.tsx` sigue generando el histórico sintéticamente desde el estado del documento (no consume activity log)
- [ ] Cada acción sobre el documento genera una entrada de activity log (no verificado que se consuma)
- [x] El timeline se renderiza cronológicamente (más reciente arriba) — UI de timeline existente
- [x] Cada entrada muestra actor, acción, descripción y fecha — pero con datos sintéticos
- [ ] Las acciones automáticas se distinguen de las manuales
- [ ] Se muestra estado vacío si el documento es nuevo (no verificado)

---

### DDOC-14 — UI Polish: diseño coherente, iconografía y micro-interacciones

**Tipo:** Frontend (UI/UX)  
**Prioridad:** Baja  
**Dependencias:** DDOC-02, DDOC-03, DDOC-12

#### Contexto

Una vez implementada la funcionalidad, pulir la UI para que sea profesional y atractiva. Seguir el design system existente (Radix + Tailwind, bordes `rounded-2xl`, badges con punto de color, paleta existente).

#### Qué hacer

**1. Iconos por subcategoría**

Asignar iconos Lucide diferenciados por tipo de documento, incluyendo los nuevos del desguace:

| Subcategoría | Icono Lucide | Color del badge |
|---|---|---|
| `permiso_circulacion` | `IdCard` | Azul |
| `ficha_tecnica` | `ClipboardList` | Azul |
| `contrato_compra` | `FileSignature` | Púrpura |
| `factura_compra` | `Receipt` | Púrpura |
| `baja_temporal` | `FileX` | Ámbar |
| `baja_definitiva` | `FileX2` | Rojo |
| `certificado_destruccion` | `Trash2` | Rojo |
| `certificado_descontaminacion` | `Droplets` | Esmeralda |
| `acta_retirada` | `ClipboardCheck` | Cyan |
| `albaran_grua` | `Truck` | Naranja |
| `informe_medioambiental` | `Leaf` | Verde |
| `garantia_pieza` | `ShieldCheck` | Esmeralda |
| `informe_pieza` | `ClipboardList` | Teal |
| `albaran_venta_pieza` | `PackageCheck` | Esmeralda |
| `itv` | `ShieldCheck` | Azul |
| `seguro` | `Shield` | Azul |

**2. Animaciones**

- Fade-in al cambiar de tab
- Skeleton loaders mientras se cargan documentos
- Animación de progreso al subir archivo
- Confetti o check animado al completar expediente (todos los obligatorios presentes)
- Transición suave al expandir/colapsar expedientes

**3. Responsive**

- Desktop: tabla completa con todas las columnas
- Tablet: tabla con columnas reducidas
- Móvil: cards con información principal, acordeón para expediente

**4. Empty states contextuales**

Cada tab vacío con empty state específico:
- Tab "Baja": "No hay documentos de baja. Sube el certificado de baja DGT para cumplir la normativa."
- Tab "Piezas": "No hay documentos de piezas. Los documentos se vinculan automáticamente al extraer piezas."
- Tab "Medioambiental": "Sube el certificado de descontaminación para completar el expediente."

**5. Badge "OCR" en documentos escaneados**

Los documentos que tienen `ocrData` muestran un badge pequeño "IA" con tooltip que muestra la confianza del OCR y los datos extraídos.

#### Criterios de aceptación

- [ ] Cada subcategoría tiene su icono y color diferenciados
- [ ] Las transiciones entre tabs son suaves
- [ ] Hay skeleton loaders durante la carga
- [ ] El responsive funciona en 3 breakpoints
- [ ] Los empty states son contextuales con CTA claro
- [ ] El badge OCR/IA muestra la confianza de la extracción

---

## Resumen y orden de ejecución

### Fase 1 — Fundamentos (semana 1)

| Orden | Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|---|
| 1 | DDOC-01 | Modelo de datos: subcategorías y campos desguace | Crítica | 3–4h |
| 2 | DDOC-05 | OCR enriquecido para documentos de desguace | Alta | 4–5h |

### Fase 2 — Frontend core (semana 2-3)

| Orden | Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|---|
| 3 | DDOC-02 | Tabs por categoría adaptados al desguace | Alta | 3–4h |
| 4 | DDOC-04 | Búsqueda avanzada (+ pieza) | Alta | 3–4h |
| 5 | DDOC-03 | Vista de expediente por vehículo (adaptada desguace) | Alta | 5–6h |
| 6 | DDOC-12 | Estructura de página + ruta + sidebar | Crítica | 4–5h |

### Fase 3 — Vinculación y automatización (semana 4)

| Orden | Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|---|
| 7 | DDOC-06 | Vinculación automática → vehículo, adquisición, pieza | Alta | 4–5h |
| 8 | DDOC-09 | Archivado automático en expediente | Media | 3–4h |
| 9 | DDOC-13 | Histórico documental real | Media | 3–4h |

### Fase 4 — Alertas, permisos y conexiones (semana 5-6)

| Orden | Ticket | Nombre | Prioridad | Estimación |
|---|---|---|---|---|
| 10 | DDOC-07 | Alertas (docs faltantes, baja pendiente, OCR incompleto, duplicado) | Alta | 4–5h |
| 11 | DDOC-08 | Panel alertas en Dashboard desguace | Media | 2–3h |
| 12 | DDOC-10 | Permisos gerente vs trabajador | Media | 3–4h |
| 13 | DDOC-11 | Conexiones con módulos (Vehículos, Compras, Bajas, Piezas, Finanzas) | Media | 4–5h |
| 14 | DDOC-14 | UI Polish y micro-interacciones | Baja | 3–4h |

**Total estimado:** 44–58 horas de desarrollo

### Árbol de dependencias

```
Fase 1 (paralelo):
  DDOC-01 ──┬──→ DDOC-05
            ├──→ DDOC-02 ──→ DDOC-03 ──→ DDOC-12
            ├──→ DDOC-04
            ├──→ DDOC-06 ──→ DDOC-09
            ├──→ DDOC-07 ──→ DDOC-08
            ├──→ DDOC-10
            └──→ DDOC-13

  DDOC-03 + DDOC-06 ──→ DDOC-11
  DDOC-02 + DDOC-03 ──→ DDOC-14 (al final)
```

---

## Dependencias con otros módulos de tickets

| Este módulo necesita de… | Para… |
|---|---|
| **CR-*** (Compras y Retiradas) | DDOC-06 vincula documentos al expediente de adquisición; DDOC-11 conecta con la página de compras |
| **DP-*** (Despiece y Catalogación) | DDOC-01 usa `partId` para vincular a piezas; DDOC-04 busca por código de pieza; DDOC-11 conecta con piezas |
| **EV-*** (Entrada de Vehículo) | DDOC-11 conecta la documentación con la entrada de vehículos de desguace |
| **DOC-*** (Documentación Compraventa) | DDOC-01 extiende el modelo base; DDOC-05 extiende el OCR; comparten `DocumentsPage` y `DocumentDetail` |
| **`alertEngine.js`** | DDOC-07 extiende el motor de alertas con reglas del desguace |
| **`ROLE_DEFINITIONS`** | DDOC-10 extiende el sistema de permisos |
| **`ScrapyardDeregistrations`** | DDOC-06 vincula bajas con documentos; DDOC-07 alerta baja pendiente |

| …y alimenta a… | Cómo… |
|---|---|
| **ScrapyardDashboard** | DDOC-08 añade widget de alertas documentales y KPI de completitud |
| **ScrapyardVehicles** | DDOC-11 añade tab de documentación en la ficha del vehículo |
| **ScrapyardPurchasesPage** | DDOC-11 muestra docs vinculados al expediente de compra |
| **ScrapyardDeregistrations** | DDOC-06 actualiza datos de baja; DDOC-11 muestra estado documental |
| **ScrapyardParts** | DDOC-11 muestra docs vinculados a cada pieza |
| **ScrapyardEnvironment** | DDOC-11 enlaza certificados de descontaminación e informes medioambientales |
