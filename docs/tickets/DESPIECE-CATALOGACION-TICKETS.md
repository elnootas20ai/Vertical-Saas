# DESPIECE Y CATALOGACIÓN — Diseño de Tickets

**Página:** `/saas/vertical/desguaces/despiece`  
**Objetivo:** Convertir vehículos en piezas vendibles de forma ordenada, con catalogación completa, trazabilidad y conexión con el resto de módulos del desguace.  
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

**~80% hecho y operativo.** Este módulo SÍ está montado y accesible (a diferencia de otros verticales): `scrapyardRouter` está montado en `index.js` bajo `/api/scrapyard` (piezas CRUD + bulk + despiece + workers + tasks), la ruta `/saas/vertical/desguaces/despiece(/:vehicleId)` existe en `routes.tsx` y el ítem `scrapyard-dismantling` está en el Sidebar.

- **Completo (verificado):** DP-01 (`buildScrapyardPartDocument`, `normalizePartCategory/Status`, `generatePartCode`, CRUD + `bulkCreateParts` en `scrapyardController.js`, cliente `scrapyardApi.ts`), DP-02 (estados desguace en vehículo, `normalizeScrapyardOrigin`, `dismantlingProgress`/`totalPartsExtracted`, `PATCH .../dismantling-status`), DP-03 (`buildDismantlingSession`, `DEFAULT_DISMANTLING_TEMPLATE`, 8 endpoints de despiece), DP-04 (`ScrapyardVehicles.tsx` usa `listVehiclesRequest`/create/update/delete reales y muestra estados de despiece), DP-05 (`ScrapyardDismantling.tsx` completo: checklist, extraer, no-aplica, pieza custom, pausar/reanudar/completar), DP-08 (las 5 alertas `checkPartsWithoutPrice/Location/DuplicateReferences/WithoutPhotos/IncompleteDismantling` integradas en `alertEngine.js` con config por cuenta), DP-11 (ruta + sidebar).
- **Parcial:** DP-06 (`ScrapyardParts.tsx` conectado a API real, vista tabla/grid y acción "Vender pieza"; falta verificar filtro por vehículo origen), DP-07 (endpoint `search-compatible` montado y editor de compatibilidades dentro de la página de despiece; sin vista CouchDB `by_compatibility` dedicada), DP-09 (piezas↔despiece↔vehículos conectados; pero `ScrapyardSales.tsx` y `ScrapyardInventory.tsx` usan el API genérico `verticalApiFactory`, no el modelo `scrapyard_part`).
- **Pendiente de verdad:** DP-10 — `useScrapyardPermissions.ts` existe pero con permisos de entrada/documentación (`scrapyard.entry.*`), no los granulares de despiece (`set_part_price`, `complete_dismantling`, `validate_cataloging`); no hay verificación de permisos por endpoint en backend ni flujo de validación gerente con badge. Tampoco existen las vistas CouchDB propuestas (`by_vehicle`, `by_referencia`, `by_dismantling_status`); los listados filtran en memoria.

---

## Auditoría de lo existente

### Ya implementado (frontend — solo UI mock, sin backend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Página `ScrapyardParts` (Piezas Recuperadas) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardParts.tsx` |
| Página `ScrapyardVehicles` (Vehículos de desguace) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardVehicles.tsx` |
| Página `ScrapyardInventory` (Inventario) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardInventory.tsx` |
| Página `ScrapyardSales` (Ventas de Piezas) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardSales.tsx` |
| Página `ScrapyardDeregistrations` (Bajas) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardDeregistrations.tsx` |
| Página `ScrapyardEnvironment` (Medioambiental) | UI mock — estado local, sin persistencia | `src/app/pages/saas/ScrapyardEnvironment.tsx` |
| Rutas en `routes.tsx` | Completo | `scrapyard-vehicles`, `scrapyard-parts`, `scrapyard-inventory`, `scrapyard-deregistrations`, `scrapyard-sales`, `scrapyard-environment` |
| Sidebar con grupo `scrapyard` | Completo | `Sidebar.tsx` línea 447 — 6 ítems visibles para `businessType: 'scrapyard'` |
| VERTICAL_GROUPS para `scrapyard` | Completo | Sidebar.tsx línea 472 — incluye clientesCrm, equipo, catalogProviders, finanzas, documentacion, scrapyard |

### Ya implementado (backend — módulo vehículos compraventa, reutilizable)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo vehículo CouchDB (`type: 'car'`) | Completo | `services/couchdb.js` — `buildVehicleDocument` |
| Normalización de estado: `available`, `reserved`, `sold`, `workshop`, `scrapped` | Completo | `services/couchdb.js` — `normalizeStatus` |
| CRUD vehículos (backend) | Completo | `controllers/vehicleController.js`, `routers/vehicleRouter.js` |
| Costes asociados | Completo | `vehicleController.js` — `addAssociatedCost` |
| Validación de imágenes | Completo | `vehicleController.js` — `validateVehicleImages` |
| Motor de alertas con dedup + SSE + Push | Completo | `services/alertEngine.js` |
| Sistema de notificaciones in-app | Completo | `services/couchdb.js` — `buildNotificationDocument` |
| OCR genérico (facturas) | Completo | `POST /api/ocr/scan` — OpenAI Vision |
| Sistema de documentos (`type: 'document'`) | Completo | `controllers/documentsController.js` |
| Roles y permisos | Completo | `services/couchdb.js` — `ROLE_DEFINITIONS`, `TEAM_PERMISSION_KEYS` |
| Catálogo de roles frontend | Completo | `src/app/lib/roleCatalog.ts` |
| Activity logging | Completo | `vehicleController.js` — `logAccountActivity`, `writeChangelog` |
| Movimientos de stock genérico | Completo | `services/stockMovementService.js`, `controllers/stockMovementController.js` |

### Brechas detectadas

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe backend para piezas de desguace** — No hay modelo `type: 'scrapyard_part'`, ni controlador, ni router | Las 6 páginas de scrapyard son solo UI vacía con `useState` local; no persiste nada |
| 2 | **No existe concepto de "despiece"** — No hay proceso que vincule vehículo → piezas | No se puede desmontar un vehículo en piezas de forma trazable |
| 3 | **`ScrapyardParts.tsx` tiene campos insuficientes** — Solo: referencia, nombre, vehículoOrigen (texto libre), categoría, estado, precioVenta, ubicación | Faltan: fotos, compatibilidades, observaciones, código interno auto-generado, vinculación real al vehículo, historial |
| 4 | **`ScrapyardVehicles.tsx` no enlaza con el modelo real `type: 'car'`** — Usa interfaz local `Vehicle` con campos distintos al modelo backend | Los vehículos de desguace no se integran con el sistema existente |
| 5 | **Las categorías de piezas son genéricas** — Solo 7 categorías: Motor, Carrocería, Electricidad, Suspensión, Interior, Transmisión, Frenos | Faltan las categorías específicas del requisito: caja de cambios, puertas, faros, paragolpes, llantas, centralitas, retrovisores, radiadores |
| 6 | **No hay estados de despiece en el vehículo** — El modelo de vehículo solo tiene: available, reserved, sold, workshop, scrapped | Falta el flujo: Recibido → En despiece → Despiezado (parcial) → Despiezado (completo) → Compactado |
| 7 | **No hay alertas de desguace** — El motor de alertas no tiene reglas para piezas ni despiece | No se detecta: pieza sin precio, sin ubicación, referencia duplicada, sin fotos, despiece incompleto |
| 8 | **No hay generación de código interno** — Ni para piezas ni para vinculación de despiece | Sin trazabilidad automatizada |
| 9 | **No hay histórico de desmontaje** — No se registra cuándo se desmontó cada pieza, quién lo hizo, ni en qué orden | Sin auditoría del proceso de despiece |
| 10 | **No hay campo de compatibilidades** — Las piezas no indican para qué vehículos/modelos sirven | Sin búsqueda cruzada de compatibilidad |
| 11 | **No existe la ruta `/saas/vertical/desguaces/despiece`** — Las rutas actuales son `scrapyard-parts`, `scrapyard-vehicles`, etc. | La URL solicitada no existe; hay que decidir si es una página nueva o una refactorización |
| 12 | **Permisos no distinguen gerente/trabajador para desguace** — `roleCatalog.ts` tiene permisos genéricos de `vehicles` pero no de despiece | Sin control granular de quién desmonta vs. quién revisa/valida |

### Mapa de dependencias

```
DP-01 (Modelo de pieza backend)
  └── DP-03 (Proceso de despiece — necesita piezas para crearlas)
  └── DP-05 (Página de despiece — necesita API de piezas)
  └── DP-08 (Alertas — valida campos de piezas)

DP-02 (Estados de vehículo desguace)
  └── DP-03 (Proceso de despiece — cambia estado del vehículo)
  └── DP-04 (Refactor ScrapyardVehicles — muestra estados)

DP-03 (Proceso de despiece)
  └── DP-05 (Página de despiece — usa el proceso)
  └── DP-06 (Histórico — registra cada acción)
  └── DP-09 (Conexiones — vincula con stock y ventas)

DP-04 (Refactor ScrapyardVehicles) — paralelo a DP-01 y DP-02
DP-07 (Compatibilidades) — después de DP-01
DP-08 (Alertas) — después de DP-01 y DP-03
DP-10 (Permisos) — después de DP-05
DP-11 (Ruta /despiece + Sidebar) — después de DP-05
```

---

## TICKETS

---

### TICKET DP-01: Modelo de pieza de desguace y CRUD backend

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

No existe backend para piezas de desguace. Todas las páginas `Scrapyard*` usan `useState` local con arrays vacíos. Necesitamos un modelo de datos persistente en CouchDB (`type: 'scrapyard_part'`) con CRUD completo, más rico que el interfaz actual de `ScrapyardParts.tsx`.

Las categorías deben cubrir todos los tipos del requisito: motor, caja de cambios, puertas, faros, paragolpes, llantas, interior, centralitas, retrovisores, radiadores y "otras".

#### Tareas

**1. Crear `buildScrapyardPartDocument` en `services/couchdb.js`:**

```javascript
function buildScrapyardPartDocument(data) {
  return {
    _id: data._id || `scrapyard_part:${generateId()}`,
    type: 'scrapyard_part',
    user_id: data.user_id,
    active: data.active !== false,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Identificación
    referencia: sanitizeString(data.referencia) || '',
    codigoInterno: sanitizeString(data.codigoInterno) || '',
    nombre: sanitizeString(data.nombre) || '',
    categoria: normalizePartCategory(data.categoria),
    subcategoria: sanitizeString(data.subcategoria) || '',

    // Vehículo origen (vinculación real)
    vehiculoOrigenId: sanitizeString(data.vehiculoOrigenId) || '',
    vehiculoOrigenLabel: sanitizeString(data.vehiculoOrigenLabel) || '',
    vehiculoOrigenMatricula: sanitizeString(data.vehiculoOrigenMatricula) || '',

    // Estado y precio
    estado: normalizePartStatus(data.estado),
    precioVenta: normalizePrice(data.precioVenta),
    precioMinimo: normalizePrice(data.precioMinimo),

    // Ubicación
    ubicacion: sanitizeString(data.ubicacion) || '',
    zona: sanitizeString(data.zona) || '',
    estanteria: sanitizeString(data.estanteria) || '',

    // Compatibilidades
    compatibilidades: Array.isArray(data.compatibilidades)
      ? data.compatibilidades.map(c => ({
          marca: sanitizeString(c.marca) || '',
          modelo: sanitizeString(c.modelo) || '',
          anioDesde: typeof c.anioDesde === 'number' ? c.anioDesde : null,
          anioHasta: typeof c.anioHasta === 'number' ? c.anioHasta : null,
          referenciasOEM: Array.isArray(c.referenciasOEM) ? c.referenciasOEM.map(sanitizeString) : [],
        }))
      : [],

    // Fotos
    fotos: Array.isArray(data.fotos)
      ? data.fotos.filter(Boolean).slice(0, 20)
      : [],

    // Observaciones y metadatos
    observaciones: sanitizeString(data.observaciones) || '',
    peso: typeof data.peso === 'number' ? data.peso : null,
    garantiaMeses: typeof data.garantiaMeses === 'number' ? data.garantiaMeses : 3,

    // Trazabilidad del despiece
    despieceId: sanitizeString(data.despieceId) || '',
    desmontadoPor: sanitizeString(data.desmontadoPor) || '',
    fechaDesmontaje: data.fechaDesmontaje || null,
    ordenDesmontaje: typeof data.ordenDesmontaje === 'number' ? data.ordenDesmontaje : 0,

    // Soft delete
    deletedAt: data.deletedAt || null,
  };
}
```

**2. Crear `normalizePartCategory` en `services/couchdb.js`:**

```javascript
function normalizePartCategory(cat) {
  const allowed = [
    'motor', 'caja_cambios', 'puertas', 'faros',
    'paragolpes', 'llantas', 'interior', 'centralitas',
    'retrovisores', 'radiadores', 'transmision', 'frenos',
    'suspension', 'electricidad', 'carroceria', 'escape',
    'direccion', 'climatizacion', 'otra'
  ];
  const normalized = String(cat || '').toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u');
  return allowed.includes(normalized) ? normalized : 'otra';
}
```

**3. Crear `normalizePartStatus` en `services/couchdb.js`:**

```javascript
function normalizePartStatus(status) {
  const allowed = [
    'disponible',    // En stock, a la venta
    'reservada',     // Reservada para un cliente
    'vendida',       // Ya vendida
    'defectuosa',    // No apta para venta, pendiente de reciclaje
    'en_revision',   // Pendiente de evaluación de calidad
    'desmontando',   // En proceso de extracción del vehículo
  ];
  return allowed.includes(String(status || '').toLowerCase().trim())
    ? String(status).toLowerCase().trim()
    : 'disponible';
}
```

**4. Crear `controllers/scrapyardPartController.js`:**

Funciones CRUD:

| Función | Método | Ruta | Descripción |
|---|---|---|---|
| `listParts` | GET | `/:userId` | Listar piezas con filtros (categoría, estado, vehículo, búsqueda texto) |
| `getPart` | GET | `/:userId/:partId` | Obtener detalle de una pieza |
| `createPart` | POST | `/:userId` | Crear pieza (valida campos obligatorios: nombre, categoría) |
| `updatePart` | PUT | `/:userId/:partId` | Actualizar pieza |
| `deletePart` | DELETE | `/:userId/:partId` | Soft delete |
| `bulkCreateParts` | POST | `/:userId/bulk` | Crear varias piezas a la vez (usado en despiece masivo) |

Validaciones en `createPart` y `updatePart`:
- `nombre` obligatorio y no vacío
- `categoria` debe estar en la lista de categorías permitidas
- `precioVenta` si se proporciona debe ser >= 0
- `fotos` si se proporcionan: validar formato (JPEG/PNG/WEBP, data URL o URL HTTP) — reutilizar patrón de `validateVehicleImages`
- `vehiculoOrigenId` si se proporciona: verificar que existe en la BD del usuario

**5. Crear `routers/scrapyardPartRouter.js`:**

```javascript
import express from 'express';
import * as ctrl from '../controllers/scrapyardPartController.js';

const router = express.Router();
router.get('/:userId', ctrl.listParts);
router.get('/:userId/:partId', ctrl.getPart);
router.post('/:userId', ctrl.createPart);
router.post('/:userId/bulk', ctrl.bulkCreateParts);
router.put('/:userId/:partId', ctrl.updatePart);
router.delete('/:userId/:partId', ctrl.deletePart);
export default router;
```

Registrar en `index.js`:
```javascript
app.use('/api/scrapyard-parts', requireAuth, scrapyardPartRouter);
```

**6. Vistas CouchDB para piezas:**

Añadir a un nuevo design document `scrapyard_parts`:

```javascript
by_vehicle: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt && doc.vehiculoOrigenId) {
      emit([doc.user_id, doc.vehiculoOrigenId], {
        _id: doc._id,
        nombre: doc.nombre,
        categoria: doc.categoria,
        estado: doc.estado,
        precioVenta: doc.precioVenta
      });
    }
  }`
},
by_category: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt) {
      emit([doc.user_id, doc.categoria], {
        _id: doc._id,
        nombre: doc.nombre,
        estado: doc.estado,
        precioVenta: doc.precioVenta,
        vehiculoOrigenLabel: doc.vehiculoOrigenLabel
      });
    }
  }`
},
by_status: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt) {
      emit([doc.user_id, doc.estado], 1);
    }
  }`,
  reduce: '_count'
},
by_referencia: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt && doc.referencia) {
      emit([doc.user_id, doc.referencia.toUpperCase()], {
        _id: doc._id,
        nombre: doc.nombre,
        vehiculoOrigenLabel: doc.vehiculoOrigenLabel
      });
    }
  }`
}
```

**7. Generación automática de código interno:**

En `createPart`, generar `codigoInterno` automáticamente si no se proporciona:

```javascript
function generatePartCode(categoria, sequenceNum) {
  const prefixes = {
    motor: 'MOT', caja_cambios: 'CCM', puertas: 'PTA', faros: 'FAR',
    paragolpes: 'PAR', llantas: 'LLA', interior: 'INT', centralitas: 'CEN',
    retrovisores: 'RET', radiadores: 'RAD', transmision: 'TRN', frenos: 'FRE',
    suspension: 'SUS', electricidad: 'ELE', carroceria: 'CAR', escape: 'ESC',
    direccion: 'DIR', climatizacion: 'CLI', otra: 'OTR'
  };
  const prefix = prefixes[categoria] || 'OTR';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const seq = String(sequenceNum).padStart(4, '0');
  return `${prefix}-${timestamp}-${seq}`;
}
```

**8. Cliente TypeScript — `src/app/lib/scrapyardApi.ts`:**

```typescript
export interface ScrapyardPart {
  _id: string;
  _rev?: string;
  type: 'scrapyard_part';
  user_id: string;
  referencia: string;
  codigoInterno: string;
  nombre: string;
  categoria: PartCategory;
  subcategoria: string;
  vehiculoOrigenId: string;
  vehiculoOrigenLabel: string;
  vehiculoOrigenMatricula: string;
  estado: PartStatus;
  precioVenta: number;
  precioMinimo: number;
  ubicacion: string;
  zona: string;
  estanteria: string;
  compatibilidades: PartCompatibility[];
  fotos: string[];
  observaciones: string;
  peso: number | null;
  garantiaMeses: number;
  despieceId: string;
  desmontadoPor: string;
  fechaDesmontaje: string | null;
  ordenDesmontaje: number;
  createdAt: string;
  updatedAt: string;
}

export type PartCategory =
  | 'motor' | 'caja_cambios' | 'puertas' | 'faros'
  | 'paragolpes' | 'llantas' | 'interior' | 'centralitas'
  | 'retrovisores' | 'radiadores' | 'transmision' | 'frenos'
  | 'suspension' | 'electricidad' | 'carroceria' | 'escape'
  | 'direccion' | 'climatizacion' | 'otra';

export type PartStatus =
  | 'disponible' | 'reservada' | 'vendida'
  | 'defectuosa' | 'en_revision' | 'desmontando';

export interface PartCompatibility {
  marca: string;
  modelo: string;
  anioDesde: number | null;
  anioHasta: number | null;
  referenciasOEM: string[];
}

export async function listScrapyardParts(userId: string, filters?: {
  categoria?: string;
  estado?: string;
  vehiculoId?: string;
  search?: string;
}): Promise<ScrapyardPart[]>;

export async function getScrapyardPart(userId: string, partId: string): Promise<ScrapyardPart>;
export async function createScrapyardPart(userId: string, data: Partial<ScrapyardPart>): Promise<ScrapyardPart>;
export async function updateScrapyardPart(userId: string, partId: string, data: Partial<ScrapyardPart>): Promise<ScrapyardPart>;
export async function deleteScrapyardPart(userId: string, partId: string): Promise<void>;
export async function bulkCreateScrapyardParts(userId: string, parts: Partial<ScrapyardPart>[]): Promise<ScrapyardPart[]>;
```

#### Criterios de aceptación

- Se pueden crear, listar, leer, actualizar y eliminar (soft delete) piezas de desguace
- Cada pieza tiene código interno auto-generado con prefijo de categoría
- Las 19 categorías cubren todos los tipos del requisito + extensiones
- Los 6 estados cubren el ciclo de vida de la pieza
- La vinculación al vehículo origen es por ID (no texto libre)
- Las compatibilidades permiten indicar marcas, modelos y años
- Se pueden almacenar hasta 20 fotos por pieza
- El `bulkCreateParts` funciona para despiece masivo
- Las vistas CouchDB permiten consultar por vehículo, categoría, estado y referencia

---

### TICKET DP-02: Estados de vehículo para desguace y extensión del modelo

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto

El modelo de vehículo (`normalizeStatus` en `couchdb.js`) solo tiene 5 estados: `available`, `reserved`, `sold`, `workshop`, `scrapped`. El flujo de desguace necesita estados intermedios que representen el progreso del despiece. Además, `ScrapyardVehicles.tsx` usa estados locales en español (`Recibido`, `En despiece`, `Despiezado`, `Compactado`) que no se mapean con el backend.

Hay que extender el modelo sin romper el flujo de compraventa existente.

#### Tareas

**1. Ampliar `normalizeStatus` en `services/couchdb.js`:**

Añadir estados específicos de desguace sin romper los existentes:

```javascript
function normalizeStatus(value) {
  const allowed = [
    // Estados compraventa (existentes)
    'available', 'reserved', 'sold', 'workshop', 'scrapped',
    // Estados desguace (nuevos)
    'received',            // Recibido en el desguace, pendiente de procesar
    'dismantling',         // En proceso de despiece activo
    'partially_dismantled', // Despiece parcial — quedan piezas por extraer
    'fully_dismantled',    // Despiece completo — todas las piezas extraídas
    'compacted',           // Compactado / enviado a chatarra
  ];
  return allowed.includes(String(value || '')) ? value : 'available';
}
```

**2. Añadir campos de desguace a `buildVehicleDocument` en `services/couchdb.js`:**

```javascript
// Campos de desguace (opcionales, solo para businessType: scrapyard)
dismantlingStatus: normalizeOptionalText(data.dismantlingStatus),
dismantlingStartedAt: data.dismantlingStartedAt || null,
dismantlingCompletedAt: data.dismantlingCompletedAt || null,
dismantlingProgress: typeof data.dismantlingProgress === 'number'
  ? Math.min(100, Math.max(0, data.dismantlingProgress))
  : null,
totalPartsExpected: typeof data.totalPartsExpected === 'number' ? data.totalPartsExpected : null,
totalPartsExtracted: typeof data.totalPartsExtracted === 'number' ? data.totalPartsExtracted : 0,
procedencia: normalizeScrapyardOrigin(data.procedencia),
fechaBaja: data.fechaBaja || null,
tipoBaja: data.tipoBaja || null,
```

**3. Crear `normalizeScrapyardOrigin` en `services/couchdb.js`:**

```javascript
function normalizeScrapyardOrigin(origin) {
  const allowed = ['particular', 'aseguradora', 'empresa', 'subasta', 'grua_municipal', 'otro'];
  return allowed.includes(String(origin || '').toLowerCase().trim())
    ? String(origin).toLowerCase().trim()
    : null;
}
```

**4. Crear vista CouchDB `by_dismantling_status`:**

```javascript
by_dismantling_status: {
  map: `function(doc) {
    if (doc.type === 'car' && doc.active !== false && !doc.deletedAt) {
      var scrapStatuses = ['received','dismantling','partially_dismantled','fully_dismantled','compacted'];
      if (scrapStatuses.indexOf(doc.status) !== -1) {
        emit([doc.user_id, doc.status], {
          _id: doc._id,
          brand: doc.brand,
          model: doc.model,
          registrationPlate: doc.registrationPlate,
          dismantlingProgress: doc.dismantlingProgress || 0,
          totalPartsExtracted: doc.totalPartsExtracted || 0
        });
      }
    }
  }`,
  reduce: '_count'
}
```

**5. Endpoint para cambiar estado de despiece:**

En `vehicleController.js`, añadir función `updateDismantlingStatus`:

```javascript
async function updateDismantlingStatus(req, res) {
  const { userId, vehicleId } = req.params;
  const { status, dismantlingProgress, totalPartsExpected } = req.body;

  // Validar transiciones permitidas:
  // received → dismantling
  // dismantling → partially_dismantled | fully_dismantled
  // partially_dismantled → dismantling | fully_dismantled
  // fully_dismantled → compacted
  // (no se puede retroceder de compacted)

  // Si status === 'dismantling' y dismantlingStartedAt es null: setear fecha
  // Si status === 'fully_dismantled': setear dismantlingCompletedAt
  // Actualizar dismantlingProgress según piezas extraídas
}
```

Ruta: `PATCH /api/vehicles/:userId/:vehicleId/dismantling-status`

**6. Mapa de transiciones de estado:**

```
received ──────► dismantling
                    │
                    ├──► partially_dismantled ──► dismantling (vuelta a despiece)
                    │                              │
                    └──► fully_dismantled ◄─────────┘
                              │
                              └──► compacted
```

Cada transición registra un `changelog` entry con `logAccountActivity`.

#### Criterios de aceptación

- Los 5 nuevos estados de desguace coexisten con los 5 estados de compraventa sin conflictos
- Los vehículos existentes (compraventa) no se ven afectados por la ampliación
- Las transiciones de estado están validadas (no se permite saltar pasos)
- Cada cambio de estado registra fecha, usuario y se guarda en changelog
- El porcentaje de progreso del despiece se calcula automáticamente
- `dismantlingStartedAt` se establece al pasar a `dismantling` por primera vez
- `dismantlingCompletedAt` se establece al llegar a `fully_dismantled`
- La vista `by_dismantling_status` permite consultar vehículos por estado de despiece

---

### TICKET DP-03: Proceso de despiece — crear piezas desde un vehículo

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Crítica  
**Dependencias:** DP-01, DP-02

#### Contexto

El proceso de despiece es el corazón de la funcionalidad: tomar un vehículo en estado `received` o `dismantling` y crear piezas a partir de él. Este proceso necesita:
- Una plantilla por tipo de vehículo con las piezas esperadas
- Un registro de qué piezas se han extraído, cuándo y por quién
- Actualización automática del progreso y estado del vehículo

#### Tareas

**1. Crear modelo de sesión de despiece `type: 'dismantling_session'`:**

```javascript
function buildDismantlingSession(data) {
  return {
    _id: data._id || `dismantling_session:${generateId()}`,
    type: 'dismantling_session',
    user_id: data.user_id,
    vehicleId: sanitizeString(data.vehicleId),
    vehicleLabel: sanitizeString(data.vehicleLabel) || '',
    vehicleMatricula: sanitizeString(data.vehicleMatricula) || '',
    status: data.status || 'in_progress', // in_progress, paused, completed
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: data.completedAt || null,

    // Piezas previstas (checklist)
    piezasPrevistas: Array.isArray(data.piezasPrevistas)
      ? data.piezasPrevistas.map(p => ({
          categoria: normalizePartCategory(p.categoria),
          nombre: sanitizeString(p.nombre) || '',
          extraida: !!p.extraida,
          partId: sanitizeString(p.partId) || '',
          noAplica: !!p.noAplica,
          motivoNoAplica: sanitizeString(p.motivoNoAplica) || '',
        }))
      : [],

    // Histórico de acciones
    historial: Array.isArray(data.historial)
      ? data.historial
      : [],

    // Trabajadores involucrados
    trabajadores: Array.isArray(data.trabajadores) ? data.trabajadores : [],

    observaciones: sanitizeString(data.observaciones) || '',
  };
}
```

**2. Plantilla de piezas estándar por defecto:**

```javascript
const DEFAULT_DISMANTLING_TEMPLATE = [
  { categoria: 'motor', nombre: 'Motor completo' },
  { categoria: 'caja_cambios', nombre: 'Caja de cambios' },
  { categoria: 'puertas', nombre: 'Puerta delantera izquierda' },
  { categoria: 'puertas', nombre: 'Puerta delantera derecha' },
  { categoria: 'puertas', nombre: 'Puerta trasera izquierda' },
  { categoria: 'puertas', nombre: 'Puerta trasera derecha' },
  { categoria: 'puertas', nombre: 'Portón trasero / Maletero' },
  { categoria: 'faros', nombre: 'Faro delantero izquierdo' },
  { categoria: 'faros', nombre: 'Faro delantero derecho' },
  { categoria: 'faros', nombre: 'Piloto trasero izquierdo' },
  { categoria: 'faros', nombre: 'Piloto trasero derecho' },
  { categoria: 'paragolpes', nombre: 'Paragolpes delantero' },
  { categoria: 'paragolpes', nombre: 'Paragolpes trasero' },
  { categoria: 'llantas', nombre: 'Llanta + neumático DI' },
  { categoria: 'llantas', nombre: 'Llanta + neumático DD' },
  { categoria: 'llantas', nombre: 'Llanta + neumático TI' },
  { categoria: 'llantas', nombre: 'Llanta + neumático TD' },
  { categoria: 'interior', nombre: 'Asiento delantero izquierdo' },
  { categoria: 'interior', nombre: 'Asiento delantero derecho' },
  { categoria: 'interior', nombre: 'Asiento trasero completo' },
  { categoria: 'interior', nombre: 'Cuadro de instrumentos' },
  { categoria: 'interior', nombre: 'Volante + airbag' },
  { categoria: 'centralitas', nombre: 'Centralita motor (ECU)' },
  { categoria: 'centralitas', nombre: 'Centralita ABS' },
  { categoria: 'centralitas', nombre: 'Cuadro de fusibles' },
  { categoria: 'retrovisores', nombre: 'Retrovisor izquierdo' },
  { categoria: 'retrovisores', nombre: 'Retrovisor derecho' },
  { categoria: 'retrovisores', nombre: 'Retrovisor interior' },
  { categoria: 'radiadores', nombre: 'Radiador agua' },
  { categoria: 'radiadores', nombre: 'Radiador A/C (condensador)' },
  { categoria: 'escape', nombre: 'Catalizador' },
  { categoria: 'escape', nombre: 'Tubo de escape completo' },
  { categoria: 'direccion', nombre: 'Cremallera de dirección' },
  { categoria: 'suspension', nombre: 'Amortiguador delantero izquierdo' },
  { categoria: 'suspension', nombre: 'Amortiguador delantero derecho' },
  { categoria: 'transmision', nombre: 'Palier / transmisión izquierda' },
  { categoria: 'transmision', nombre: 'Palier / transmisión derecha' },
  { categoria: 'climatizacion', nombre: 'Compresor A/C' },
  { categoria: 'electricidad', nombre: 'Alternador' },
  { categoria: 'electricidad', nombre: 'Motor de arranque' },
];
```

**3. Crear `controllers/dismantlingController.js`:**

| Función | Método | Ruta | Descripción |
|---|---|---|---|
| `startDismantling` | POST | `/:userId/:vehicleId/start` | Inicia sesión de despiece: cambia vehículo a `dismantling`, crea `dismantling_session` con plantilla |
| `getSession` | GET | `/:userId/:vehicleId/session` | Obtiene la sesión activa de despiece de un vehículo |
| `extractPart` | POST | `/:userId/:vehicleId/extract` | Marca pieza como extraída: crea `scrapyard_part` + actualiza checklist + actualiza progreso vehículo |
| `markNotApplicable` | PATCH | `/:userId/:vehicleId/not-applicable` | Marca pieza como "No aplica" (ej: vehículo sin techo solar) |
| `addCustomPart` | POST | `/:userId/:vehicleId/custom-part` | Añadir pieza no prevista en la plantilla |
| `pauseDismantling` | PATCH | `/:userId/:vehicleId/pause` | Pausa la sesión (estado `paused`) |
| `resumeDismantling` | PATCH | `/:userId/:vehicleId/resume` | Reanuda la sesión |
| `completeDismantling` | PATCH | `/:userId/:vehicleId/complete` | Marca despiece como completo: cambia vehículo a `fully_dismantled` |

**4. Lógica de `extractPart`:**

```javascript
async function extractPart(req, res) {
  // 1. Recibir datos de la pieza extraída + index en la plantilla
  // 2. Crear documento scrapyard_part con:
  //    - vehiculoOrigenId = vehicleId
  //    - vehiculoOrigenLabel = marca + modelo del vehículo
  //    - vehiculoOrigenMatricula = matrícula
  //    - despieceId = dismantling_session._id
  //    - desmontadoPor = userId del request
  //    - fechaDesmontaje = ahora
  //    - estado = 'en_revision' (pendiente de catalogar precio, fotos, etc.)
  //    - codigoInterno = auto-generado
  // 3. Actualizar dismantling_session: marcar pieza como extraída, guardar partId
  // 4. Actualizar vehículo: totalPartsExtracted++, recalcular dismantlingProgress
  // 5. Añadir entrada al historial de la sesión:
  //    { action: 'extract', partName, partId, timestamp, userId }
  // 6. Si todas las piezas previstas están extraídas o marcadas "no aplica":
  //    sugerir completar despiece (no forzar)
}
```

**5. Ruta del router:**

```javascript
// routers/dismantlingRouter.js
router.post('/:userId/:vehicleId/start', ctrl.startDismantling);
router.get('/:userId/:vehicleId/session', ctrl.getSession);
router.post('/:userId/:vehicleId/extract', ctrl.extractPart);
router.patch('/:userId/:vehicleId/not-applicable', ctrl.markNotApplicable);
router.post('/:userId/:vehicleId/custom-part', ctrl.addCustomPart);
router.patch('/:userId/:vehicleId/pause', ctrl.pauseDismantling);
router.patch('/:userId/:vehicleId/resume', ctrl.resumeDismantling);
router.patch('/:userId/:vehicleId/complete', ctrl.completeDismantling);
```

Registrar: `app.use('/api/dismantling', requireAuth, dismantlingRouter);`

**6. Cliente TypeScript — añadir a `src/app/lib/scrapyardApi.ts`:**

```typescript
export interface DismantlingSession {
  _id: string;
  vehicleId: string;
  vehicleLabel: string;
  vehicleMatricula: string;
  status: 'in_progress' | 'paused' | 'completed';
  piezasPrevistas: DismantlingChecklistItem[];
  historial: DismantlingHistoryEntry[];
  trabajadores: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface DismantlingChecklistItem {
  categoria: PartCategory;
  nombre: string;
  extraida: boolean;
  partId: string;
  noAplica: boolean;
  motivoNoAplica: string;
}

export interface DismantlingHistoryEntry {
  action: 'start' | 'extract' | 'not_applicable' | 'add_custom' | 'pause' | 'resume' | 'complete';
  detail: string;
  partId?: string;
  timestamp: string;
  userId: string;
  userName: string;
}

export async function startDismantling(userId: string, vehicleId: string): Promise<DismantlingSession>;
export async function getDismantlingSession(userId: string, vehicleId: string): Promise<DismantlingSession | null>;
export async function extractPart(userId: string, vehicleId: string, data: { checklistIndex: number; partData: Partial<ScrapyardPart> }): Promise<ScrapyardPart>;
export async function completeDismantling(userId: string, vehicleId: string): Promise<void>;
```

#### Criterios de aceptación

- Al iniciar un despiece, el vehículo cambia a estado `dismantling` y se crea una sesión con la plantilla de 40 piezas
- Cada pieza extraída crea un documento `scrapyard_part` vinculado al vehículo
- El progreso del despiece se actualiza automáticamente (piezas extraídas / piezas totales aplicables)
- El historial de la sesión registra cada acción con timestamp y usuario
- Se pueden marcar piezas como "No aplica" con motivo
- Se pueden añadir piezas que no estaban en la plantilla
- Al completar todas las piezas, el vehículo pasa a `fully_dismantled`
- Se puede pausar y reanudar el despiece
- El código interno de cada pieza se genera automáticamente

---

### TICKET DP-04: Refactor ScrapyardVehicles — conectar con backend real

**Tipo:** Refactor — Frontend + API Client  
**Prioridad:** Alta  
**Dependencias:** DP-02

#### Contexto

`ScrapyardVehicles.tsx` actualmente usa un `useState<Vehicle[]>([])` con una interfaz local que no coincide con el modelo real `type: 'car'` del backend. Los estados están hardcodeados en español. Necesitamos conectar esta página con el backend real y mostrar los estados de desguace.

#### Tareas

**1. Conectar `ScrapyardVehicles.tsx` con el API de vehículos real:**

- Usar `listVehiclesByUser` (ya existe en `vehiclesApi.ts`) filtrando por estados de desguace: `received`, `dismantling`, `partially_dismantled`, `fully_dismantled`, `compacted`
- Eliminar el `useState<Vehicle[]>([])` y los datos mock
- Usar `useEffect` + `useState` para cargar datos reales al montar

**2. Actualizar la interfaz a los campos reales del modelo `car`:**

Mapear la interfaz local a los campos reales:
- `matricula` → `registrationPlate`
- `marca` + `modelo` → `brand` + `model`
- `anio` → `year`
- `fechaEntrada` → `entryDate` o `purchaseDate`
- `estado` → `status` (con etiquetas traducidas)
- `procedencia` → `procedencia` (nuevo campo de DP-02) u `origin`
- `precioCompra` → `purchasePrice`

**3. Mostrar estados de desguace con etiquetas y colores:**

```typescript
const SCRAPYARD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  received:              { label: 'Recibido',          color: 'bg-blue-50 text-blue-700' },
  dismantling:           { label: 'En despiece',       color: 'bg-amber-50 text-amber-700' },
  partially_dismantled:  { label: 'Despiece parcial',  color: 'bg-orange-50 text-orange-700' },
  fully_dismantled:      { label: 'Despiezado',        color: 'bg-emerald-50 text-emerald-700' },
  compacted:             { label: 'Compactado',        color: 'bg-gray-100 text-gray-600' },
};
```

**4. Añadir columna de progreso de despiece:**

- Mostrar barra de progreso con % de piezas extraídas
- Visible solo para estados `dismantling` y `partially_dismantled`
- Formato: "12/38 piezas (32%)"

**5. Añadir botón "Iniciar despiece":**

- Visible en vehículos con estado `received`
- Al pulsar: llamar a `startDismantling` (DP-03) → navegar a la página de despiece
- Confirmar con modal si el vehículo tiene datos incompletos

**6. KPIs actualizados:**

- Vehículos recibidos (pendientes de despiece)
- En despiece activo
- Despiezados este mes
- Valor estimado piezas extraídas (suma de `precioVenta` de piezas vinculadas)

**7. Formulario de alta/edición actualizado:**

- Campos del modelo real con los nuevos campos de desguace
- Procedencia: Particular, Aseguradora, Empresa, Subasta, Grúa municipal, Otro
- Estado inicial por defecto: `received`
- Campos: matrícula, marca, modelo, año, VIN, combustible, km, precio compra, fecha entrada, procedencia, observaciones

#### Criterios de aceptación

- La página carga vehículos reales del backend
- Los estados de desguace se muestran con etiquetas en español y colores diferenciados
- El botón "Iniciar despiece" cambia el estado y navega al flujo de despiece
- Los KPIs reflejan datos reales
- El formulario de alta guarda vehículos persistentes con todos los campos del modelo
- La barra de progreso del despiece es visible y se actualiza
- No se rompe la funcionalidad existente del módulo de compraventa (los estados nuevos son adicionales)

---

### TICKET DP-05: Página "Despiece y catalogación" — UI completa

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** DP-01, DP-02, DP-03

#### Contexto

Esta es la página principal del flujo de despiece: `/saas/vertical/desguaces/despiece`. Permite al usuario ver un vehículo en proceso de despiece y gestionar la extracción de piezas de forma visual e intuitiva.

Será una página nueva distinta de `ScrapyardParts.tsx` (que es el listado de piezas ya catalogadas). La página de despiece muestra el proceso de conversión vehículo → piezas.

#### Tareas

**1. Crear componente `src/app/pages/saas/ScrapyardDismantling.tsx`:**

Layout principal dividido en 3 zonas:

```
┌─────────────────────────────────────────────────────────┐
│ Cabecera: [← Volver] Despiece - SEAT León (1234 ABC)   │
│           Estado: En despiece | Progreso: ████░░ 62%    │
├────────────────────┬────────────────────────────────────┤
│                    │                                    │
│  Panel izquierdo   │     Panel derecho                  │
│  (Checklist de     │     (Formulario de catalogación    │
│   piezas previstas │      de la pieza seleccionada)     │
│   agrupadas por    │                                    │
│   categoría)       │     - Nombre                       │
│                    │     - Estado de la pieza            │
│  ☑ Motor           │     - Precio venta                 │
│  ☐ Caja cambios    │     - Ubicación almacén            │
│  ☑ Puerta DI       │     - Fotos                        │
│  ☑ Puerta DD       │     - Compatibilidades             │
│  ☐ Puerta TI       │     - Observaciones                │
│  ...               │                                    │
│                    │                                    │
│  [+ Añadir pieza]  │     [Guardar pieza]                │
│                    │                                    │
├────────────────────┴────────────────────────────────────┤
│ Barra inferior: [Pausar] [Completar despiece]           │
└─────────────────────────────────────────────────────────┘
```

**2. Panel izquierdo — Checklist de piezas:**

- Piezas agrupadas por categoría con iconos
- Cada pieza muestra:
  - Checkbox (extraída sí/no)
  - Nombre
  - Estado: gris (pendiente), verde (extraída), naranja (en revisión), rojo (no aplica)
  - Al hacer clic: seleccionar para catalogar en el panel derecho
- Botón "No aplica" en hover/long-press (ej: pieza no existe en ese vehículo)
- Botón "+ Añadir pieza personalizada" al final de cada categoría o global
- Contador por categoría: "3/5 extraídas"
- Scroll vertical independiente del panel derecho

**3. Panel derecho — Formulario de catalogación:**

Cuando se selecciona una pieza del checklist:

| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre de la pieza | Texto (pre-rellenado de la plantilla) | Sí |
| Categoría | Select (pre-rellenado) | Sí |
| Referencia interna | Texto (auto-generado, editable) | No |
| Estado de la pieza | Select: Disponible, En revisión, Defectuosa | Sí |
| Precio de venta (€) | Numérico | No (genera alerta si vacío) |
| Precio mínimo (€) | Numérico | No |
| Ubicación almacén | Texto con autocompletado de ubicaciones existentes | No (genera alerta si vacío) |
| Zona | Select de zonas configuradas | No |
| Estantería | Texto | No |
| Fotos | Subida múltiple (drag&drop + cámara) | No (genera alerta si vacío) |
| Compatibilidades | Lista editable de marca + modelo + años | No |
| Observaciones | Textarea | No |
| Peso (kg) | Numérico | No |
| Garantía (meses) | Numérico (default: 3) | No |

**4. Botón "Extraer y guardar":**

- Llama a `extractPart` (DP-03)
- Crea la pieza en BD
- Actualiza el checklist (marca como extraída)
- Actualiza la barra de progreso
- Muestra toast de éxito con código interno generado
- Avanza automáticamente a la siguiente pieza no extraída

**5. Barra de progreso global:**

- Ancho completo debajo de la cabecera
- Muestra: "{extraídas}/{total aplicables} piezas — {porcentaje}%"
- Color que cambia según progreso: azul → verde
- Animación suave al avanzar

**6. Acciones de la barra inferior:**

- **Pausar despiece:** Guarda estado actual, cambia sesión a `paused`, permite salir sin perder progreso
- **Completar despiece:** Disponible cuando todas las piezas están extraídas o marcadas "no aplica". Cambia vehículo a `fully_dismantled`. Modal de confirmación con resumen.
- **Historial:** Botón para ver el timeline de acciones del despiece

**7. Diseño responsive:**

- **Desktop:** 2 paneles lado a lado (40% / 60%)
- **Tablet:** 2 paneles con panel izquierdo colapsable (icono hamburguesa)
- **Móvil:** Vista de lista (checklist) con navegación a formulario de catalogación al tocar una pieza. Botón flotante "Extraer pieza"

**8. Componentes hijos:**

```
ScrapyardDismantling.tsx
├── DismantlingHeader.tsx          (cabecera + progreso)
├── DismantlingChecklist.tsx       (panel izquierdo)
│   ├── ChecklistCategory.tsx      (grupo de categoría)
│   └── ChecklistItem.tsx          (pieza individual)
├── PartCatalogForm.tsx            (panel derecho — formulario)
│   ├── PartPhotoUploader.tsx      (subida de fotos)
│   └── CompatibilityEditor.tsx    (editor de compatibilidades)
├── DismantlingTimeline.tsx        (historial de acciones)
└── DismantlingCompleteModal.tsx   (modal de confirmación)
```

#### Criterios de aceptación

- La página muestra el checklist de piezas previstas agrupadas por categoría
- Al seleccionar una pieza, el formulario de catalogación se carga en el panel derecho
- El botón "Extraer y guardar" crea la pieza persistente y actualiza el checklist
- La barra de progreso se actualiza en tiempo real
- Se pueden añadir piezas que no estaban en la plantilla
- Se pueden marcar piezas como "No aplica"
- El historial muestra todas las acciones del despiece
- El despiece se puede pausar y reanudar sin perder datos
- Al completar el despiece, el vehículo cambia a `fully_dismantled`
- El diseño es responsive y funciona en móvil

---

### TICKET DP-06: Refactor ScrapyardParts — conectar con backend y campos completos

**Tipo:** Refactor — Frontend  
**Prioridad:** Alta  
**Dependencias:** DP-01

#### Contexto

`ScrapyardParts.tsx` es la página de listado de piezas ya catalogadas. Actualmente es un mock con `useState` local. Necesita conectarse al backend real (DP-01) y mostrar todos los campos del modelo enriquecido.

#### Tareas

**1. Conectar con el API real:**

- Reemplazar `useState<Part[]>([])` por carga desde `listScrapyardParts`
- Usar `useEffect` + `useState` + `useCallback` para carga y recarga
- Mantener los filtros existentes (categoría, estado) pero conectados con la API

**2. Ampliar la interfaz `Part` a `ScrapyardPart`:**

Importar el tipo desde `scrapyardApi.ts` en lugar de la interfaz local.

**3. Ampliar las categorías:**

Reemplazar las 7 categorías actuales por las 19 del modelo (DP-01). Agrupar en la UI:

```typescript
const CATEGORY_GROUPS = [
  { label: 'Mecánica', categories: ['motor', 'caja_cambios', 'transmision', 'escape', 'direccion', 'suspension', 'frenos'] },
  { label: 'Carrocería', categories: ['puertas', 'paragolpes', 'retrovisores', 'carroceria', 'llantas'] },
  { label: 'Iluminación', categories: ['faros'] },
  { label: 'Interior', categories: ['interior'] },
  { label: 'Electricidad y electrónica', categories: ['electricidad', 'centralitas'] },
  { label: 'Refrigeración', categories: ['radiadores', 'climatizacion'] },
  { label: 'Otras', categories: ['otra'] },
];
```

**4. Añadir columnas nuevas a la tabla:**

- **Código interno** (mono, gris, primera columna)
- **Fotos** (miniatura de la primera foto o icono "sin foto")
- **Vehículo origen** (enlace a ficha del vehículo, no texto libre)
- **Compatibilidades** (badge con número: "3 modelos")
- **Fecha desmontaje** (hidden en móvil)

**5. Añadir filtro por vehículo de origen:**

- Select/combobox con vehículos del desguace
- Permite filtrar todas las piezas extraídas de un vehículo específico

**6. Vista alternativa: tarjetas con fotos:**

- Botón de toggle: vista tabla / vista tarjetas (grid)
- Vista tarjetas: foto principal, nombre, categoría, estado, precio, ubicación
- Útil para explorar visualmente el inventario

**7. KPIs actualizados:**

- Piezas en stock (estado `disponible`)
- Vendidas este mes
- Valor total inventario (solo `disponible`)
- Categoría más demandada
- Sin precio asignado (warning, enlace a filtro)
- Sin ubicación (warning, enlace a filtro)

**8. Modal de edición ampliado:**

Reemplazar el modal actual (7 campos) por uno con todos los campos del modelo: foto principal, nombre, categoría, estado, precio, ubicación, compatibilidades, observaciones, peso, garantía.

**9. Acción rápida "Vender pieza":**

- Botón en la fila de la tabla (solo estado `disponible`)
- Abre mini-modal: cliente, precio real, forma de pago, fecha
- Cambia estado a `vendida`
- Conecta con el módulo de ventas (DP-09)

#### Criterios de aceptación

- La página carga piezas reales desde el backend
- Las 19 categorías están disponibles y agrupadas visualmente
- La tabla muestra todos los campos importantes con columnas responsive
- El filtro por vehículo de origen funciona correctamente
- La vista de tarjetas con fotos es funcional y atractiva
- Los KPIs reflejan datos reales
- El modal de edición permite modificar todos los campos del modelo
- La acción "Vender pieza" cambia el estado y crea un registro de venta básico

---

### TICKET DP-07: Compatibilidades de piezas

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** DP-01

#### Contexto

Las compatibilidades permiten saber para qué vehículos/modelos sirve una pieza extraída. Esto es crítico para la venta: un cliente busca un faro delantero para un Seat León 2018, y el sistema debe poder decirle si hay uno compatible.

#### Tareas

**1. Vista CouchDB para búsqueda por compatibilidad:**

```javascript
by_compatibility: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt
        && doc.estado === 'disponible' && doc.compatibilidades) {
      doc.compatibilidades.forEach(function(c) {
        if (c.marca && c.modelo) {
          emit([doc.user_id, c.marca.toLowerCase(), c.modelo.toLowerCase()], {
            _id: doc._id,
            nombre: doc.nombre,
            categoria: doc.categoria,
            precioVenta: doc.precioVenta,
            fotos: doc.fotos ? doc.fotos.slice(0, 1) : [],
            anioDesde: c.anioDesde,
            anioHasta: c.anioHasta,
            referenciasOEM: c.referenciasOEM
          });
        }
      });
    }
  }`
}
```

**2. Endpoint de búsqueda por compatibilidad:**

`GET /api/scrapyard-parts/:userId/search-compatible?marca=seat&modelo=leon&anio=2018&categoria=faros`

- Busca piezas disponibles compatibles con la marca/modelo indicado
- Filtra opcionalmente por año (entre `anioDesde` y `anioHasta`)
- Filtra opcionalmente por categoría
- Devuelve resultados con foto, precio y ubicación

**3. Componente `CompatibilityEditor.tsx` (usado en DP-05 y DP-06):**

- Lista de compatibilidades editables
- Cada fila: marca (combobox), modelo (combobox filtrado por marca), año desde, año hasta, referencias OEM (chips)
- Botón "+ Añadir compatibilidad"
- Autocompletado de marcas/modelos desde vehículos existentes en el sistema
- Posibilidad de copiar compatibilidades de otra pieza similar

**4. Sugerencia automática de compatibilidad:**

- Al crear una pieza vinculada a un vehículo, pre-rellenar automáticamente la primera compatibilidad con marca/modelo/año del vehículo de origen
- Helper text: "Esta pieza es compatible al menos con {marca} {modelo} {año}"

**5. Búsqueda por referencia OEM:**

- Campo de búsqueda por referencia del fabricante (OEM)
- Busca en el array `referenciasOEM` de las compatibilidades
- Vista indexada para rendimiento

**6. Cliente TypeScript:**

```typescript
export async function searchCompatibleParts(userId: string, filters: {
  marca: string;
  modelo: string;
  anio?: number;
  categoria?: PartCategory;
}): Promise<ScrapyardPart[]>;
```

#### Criterios de aceptación

- Se pueden buscar piezas por marca, modelo y año del vehículo destino
- La búsqueda devuelve solo piezas disponibles compatibles
- La compatibilidad se pre-rellena con datos del vehículo de origen
- Se pueden añadir múltiples compatibilidades por pieza
- La búsqueda por referencia OEM funciona
- El editor de compatibilidades usa autocompletado de marcas y modelos

---

### TICKET DP-08: Alertas de despiece y catalogación

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** DP-01, DP-03

#### Contexto

El motor de alertas (`alertEngine.js`) necesita reglas específicas para el vertical de desguace. Las alertas solicitadas son: pieza sin precio, pieza sin ubicación, referencia duplicada, pieza sin fotos, despiece incompleto.

#### Tareas

**1. Alerta: Pieza sin precio de venta**

```javascript
async function checkPartsWithoutPrice(userId, db) {
  // Piezas con estado 'disponible' donde precioVenta es 0, null o undefined
  // Creadas hace más de 24 horas (dar tiempo a catalogar)
  // Notificación tipo: 'part_missing_price'
  // Mensaje: "La pieza {nombre} ({codigoInterno}) del vehículo {vehiculoOrigenLabel} no tiene precio de venta"
  // Prioridad: Media
  // Dedup: no repetir en 48h por pieza
}
```

**2. Alerta: Pieza sin ubicación**

```javascript
async function checkPartsWithoutLocation(userId, db) {
  // Piezas con estado 'disponible' donde ubicacion está vacío
  // Creadas hace más de 24 horas
  // Notificación tipo: 'part_missing_location'
  // Mensaje: "La pieza {nombre} ({codigoInterno}) no tiene ubicación asignada en el almacén"
  // Prioridad: Media
  // Dedup: no repetir en 48h por pieza
}
```

**3. Alerta: Referencia duplicada**

```javascript
async function checkDuplicatePartReferences(userId, db) {
  // Usar vista by_referencia para detectar referencias con más de 1 pieza activa
  // Solo si referencia no está vacía
  // Notificación tipo: 'part_duplicate_reference'
  // Mensaje: "La referencia {referencia} está asignada a más de una pieza: {lista}"
  // Prioridad: Alta
  // Dedup: no repetir en 7 días
}
```

**4. Alerta: Pieza sin fotos**

```javascript
async function checkPartsWithoutPhotos(userId, db) {
  // Piezas con estado 'disponible' donde fotos.length === 0
  // Creadas hace más de 48 horas
  // Notificación tipo: 'part_missing_photos'
  // Mensaje: "La pieza {nombre} ({codigoInterno}) no tiene fotos — dificulta la venta"
  // Prioridad: Baja
  // Dedup: no repetir en 7 días por pieza
}
```

**5. Alerta: Despiece incompleto**

```javascript
async function checkIncompleteDismantling(userId, db) {
  // Vehículos con estado 'dismantling' o 'partially_dismantled'
  // cuya sesión de despiece lleva más de 7 días sin actividad (último entry del historial)
  // Notificación tipo: 'dismantling_stalled'
  // Mensaje: "El despiece del vehículo {marca} {modelo} ({matrícula}) lleva {días} días parado"
  // Prioridad: Media
  // Dedup: no repetir en 3 días
}
```

**6. Integrar en el ciclo del motor de alertas:**

Añadir las 5 nuevas comprobaciones a `alertEngine.js`, agrupadas bajo un bloque condicional:

```javascript
if (businessType === 'scrapyard') {
  await checkPartsWithoutPrice(userId, db);
  await checkPartsWithoutLocation(userId, db);
  await checkDuplicatePartReferences(userId, db);
  await checkPartsWithoutPhotos(userId, db);
  await checkIncompleteDismantling(userId, db);
}
```

**7. Constantes de alerta en `services/alertConstants.js`:**

```javascript
SCRAPYARD_ALERTS: {
  PART_MISSING_PRICE: 'part_missing_price',
  PART_MISSING_LOCATION: 'part_missing_location',
  PART_DUPLICATE_REFERENCE: 'part_duplicate_reference',
  PART_MISSING_PHOTOS: 'part_missing_photos',
  DISMANTLING_STALLED: 'dismantling_stalled',
}
```

**8. Configuración por cuenta:**

```javascript
scrapyardAlertsEnabled: true,
partMissingPriceHours: 24,
partMissingLocationHours: 24,
partMissingPhotosHours: 48,
dismantlingStalledDays: 7,
```

#### Criterios de aceptación

- Se genera alerta cuando una pieza disponible lleva >24h sin precio
- Se genera alerta cuando una pieza disponible lleva >24h sin ubicación
- Se genera alerta cuando se detectan referencias duplicadas
- Se genera alerta cuando una pieza disponible lleva >48h sin fotos
- Se genera alerta cuando un despiece lleva >7 días parado
- Las alertas se envían por los 3 canales: in-app, SSE y Web Push
- Las alertas respetan la ventana de deduplicación
- Las alertas de referencia duplicada tienen prioridad Alta
- Las alertas solo se ejecutan para `businessType: 'scrapyard'`
- Los umbrales son configurables por cuenta

---

### TICKET DP-09: Conexiones con módulos existentes

**Tipo:** Feature — Full Stack  
**Prioridad:** Alta  
**Dependencias:** DP-03, DP-05, DP-06

#### Contexto

La página de despiece no es un módulo aislado. Debe conectarse bidireccional con: Entrada de vehículo, Stock de piezas, Ventas, Documentación y Dashboard.

#### Tareas

**1. Conexión con Entrada de vehículo (ScrapyardVehicles):**

- Desde la ficha de un vehículo en `ScrapyardVehicles`: botón "Iniciar despiece" que navega a `/saas/vertical/desguaces/despiece?vehicleId={id}`
- Al completar un despiece, el vehículo aparece como `fully_dismantled` en el listado
- Enlace desde el resumen del despiece al vehículo de origen

**2. Conexión con Stock piezas (ScrapyardParts + ScrapyardInventory):**

- Las piezas creadas durante el despiece aparecen inmediatamente en `ScrapyardParts`
- `ScrapyardInventory` refleja las cantidades actualizadas por categoría y zona
- Enlace desde cada pieza del inventario al despiece donde fue extraída

**3. Conexión con Ventas (ScrapyardSales):**

- Al vender una pieza (desde `ScrapyardParts` o desde `ScrapyardSales`): cambiar estado a `vendida`, registrar venta
- Desde `ScrapyardSales`: crear venta vinculando piezas del inventario
- La venta descuenta automáticamente la pieza del stock
- Enlace desde la venta a la pieza y al vehículo de origen

**4. Conexión con Documentación:**

- Los documentos del vehículo de desguace (ficha técnica, baja, etc.) son accesibles desde la página de despiece
- Enlace a documentos desde la cabecera del despiece

**5. Conexión con Dashboard:**

- Nuevo widget/KPI: "Despieces en curso" (vehículos en estado `dismantling`)
- Nuevo widget/KPI: "Piezas catalogadas este mes"
- Nuevo widget/KPI: "Piezas sin catalogar" (piezas en estado `en_revision`)
- Las alertas de despiece aparecen en el panel de alertas del dashboard

**6. Vista CouchDB para KPIs de despiece:**

```javascript
parts_by_month: {
  map: `function(doc) {
    if (doc.type === 'scrapyard_part' && doc.active !== false && !doc.deletedAt && doc.createdAt) {
      var d = new Date(doc.createdAt);
      emit([doc.user_id, d.getFullYear(), d.getMonth() + 1, doc.estado], 1);
    }
  }`,
  reduce: '_count'
}
```

**7. Navegación cruzada:**

| Desde | Enlace a | Descripción |
|---|---|---|
| ScrapyardVehicles (fila vehículo) | ScrapyardDismantling | "Ir a despiece" |
| ScrapyardDismantling (cabecera) | ScrapyardVehicles (ficha) | "Ver vehículo" |
| ScrapyardDismantling (pieza extraída) | ScrapyardParts (ficha pieza) | "Ver en catálogo" |
| ScrapyardParts (fila pieza) | ScrapyardDismantling | "Ver despiece de origen" |
| ScrapyardParts (fila pieza) | ScrapyardVehicles (ficha) | "Ver vehículo de origen" |
| ScrapyardSales (venta) | ScrapyardParts (piezas vendidas) | "Ver piezas" |
| Dashboard (KPI) | ScrapyardDismantling / ScrapyardParts | Clic lleva a la vista filtrada |

#### Criterios de aceptación

- La navegación entre módulos es fluida y bidireccional
- Las piezas extraídas aparecen en stock inmediatamente
- Las ventas de piezas actualizan el stock automáticamente
- Los KPIs del dashboard reflejan datos reales de despiece
- Los documentos del vehículo son accesibles desde el despiece
- Los enlaces cruzados funcionan correctamente
- No hay datos huérfanos (toda pieza tiene vehículo de origen, toda venta tiene pieza)

---

### TICKET DP-10: Permisos por perfil (gerente / trabajador)

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** DP-05

#### Contexto

Los dos perfiles de usuario son:
- **Gerente:** Define criterios de catalogación, revisa piezas, establece precios, valida despieces
- **Trabajador:** Desmonta, cataloga datos básicos, registra piezas según permisos

#### Tareas

**1. Definir permisos granulares para desguace:**

Añadir en `TEAM_PERMISSION_KEYS` o en `roleCatalog.ts`:

```javascript
scrapyard: {
  view_vehicles: true,          // Ver vehículos del desguace
  manage_vehicles: false,       // Crear/editar/eliminar vehículos
  start_dismantling: true,      // Iniciar un despiece
  extract_parts: true,          // Extraer y registrar piezas
  set_part_price: false,        // Establecer precio de venta
  set_part_location: true,      // Asignar ubicación
  upload_part_photos: true,     // Subir fotos de piezas
  complete_dismantling: false,  // Marcar despiece como completo
  sell_parts: false,            // Vender piezas
  manage_compatibility: false,  // Editar compatibilidades
  validate_cataloging: false,   // Validar catalogación de piezas
}
```

**2. Configuración por defecto según rol:**

| Permiso | Admin | Gerente | Trabajador desguace |
|---|---|---|---|
| `view_vehicles` | Si | Si | Si |
| `manage_vehicles` | Si | Si | No |
| `start_dismantling` | Si | Si | Si |
| `extract_parts` | Si | Si | Si |
| `set_part_price` | Si | Si | No |
| `set_part_location` | Si | Si | Si |
| `upload_part_photos` | Si | Si | Si |
| `complete_dismantling` | Si | Si | No |
| `sell_parts` | Si | Si | No |
| `manage_compatibility` | Si | Si | No |
| `validate_cataloging` | Si | Si | No |

**3. Aplicar permisos en el frontend:**

- Sin `manage_vehicles`: ocultar botón de alta/edición/eliminación de vehículos
- Sin `set_part_price`: ocultar campos de precio en el formulario de catalogación
- Sin `complete_dismantling`: ocultar botón "Completar despiece"
- Sin `sell_parts`: ocultar acción "Vender pieza"
- Sin `validate_cataloging`: ocultar botón "Validar catalogación"

**4. Aplicar permisos en el backend:**

- Verificar permisos en cada endpoint del controlador de piezas y despiece
- Si un trabajador crea una pieza sin precio: se guarda con `precioVenta: 0` y estado `en_revision`
- Las piezas catalogadas por un trabajador quedan en `en_revision` hasta que el gerente las valide

**5. Flujo de validación del gerente:**

- Cuando un trabajador extrae y registra una pieza, queda en estado `en_revision`
- El gerente ve un badge "Pendientes de validar" en el sidebar junto a "Piezas"
- Al abrir una pieza `en_revision`, el gerente puede:
  - Completar datos faltantes (precio, compatibilidades)
  - Cambiar estado a `disponible` (validada)
  - Cambiar estado a `defectuosa` (rechazada)

**6. Indicador visual:**

- Badge en el sidebar: "X piezas pendientes" (solo gerentes)
- Filtro rápido en `ScrapyardParts`: "Pendientes de validar" (estado `en_revision`)

#### Criterios de aceptación

- El gerente tiene acceso completo a todas las funciones
- El trabajador puede desmontar y registrar piezas pero no establecer precios
- Las piezas del trabajador quedan en estado `en_revision` pendiente de validación
- El gerente ve badge con pendientes de validar
- Los permisos se verifican en frontend (visibilidad) y backend (seguridad)
- La configuración de permisos es editable por el admin/gerente

---

### TICKET DP-11: Ruta `/saas/vertical/desguaces/despiece`, sidebar y navegación

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** DP-05

#### Contexto

La página de despiece necesita una ruta propia en la URL solicitada y aparecer en el sidebar del vertical de desguaces. También hay que considerar que el flujo de despiece puede arrancarse desde el listado de vehículos.

#### Tareas

**1. Registrar ruta en `src/app/routes.tsx`:**

```typescript
// Dentro del bloque de rutas Scrapyard, añadir:
{ path: 'vertical/desguaces/despiece', Component: ScrapyardDismantling },
{ path: 'vertical/desguaces/despiece/:vehicleId', Component: ScrapyardDismantling },
```

El parámetro opcional `vehicleId` permite abrir directamente el despiece de un vehículo.

Añadir el import:
```typescript
import { ScrapyardDismantling } from './pages/saas/ScrapyardDismantling';
```

**2. Añadir ítem en el sidebar — `Sidebar.tsx`:**

En la sección de `menuItemDefs`, añadir el nuevo ítem de despiece:

```typescript
{ id: 'scrapyard-dismantling', navKey: 'scrapyardDismantling', icon: <Wrench className="w-5 h-5" />, path: '/saas/vertical/desguaces/despiece', isNew: true },
```

En `sidebarGroupDefs`, actualizar el grupo `scrapyard`:

```typescript
{ id: 'scrapyard', icon: <Container className="w-4 h-4 shrink-0" />,
  itemIds: ['scrapyard-vehicles', 'scrapyard-dismantling', 'scrapyard-parts', 'scrapyard-inventory', 'scrapyard-deregistrations', 'scrapyard-sales', 'scrapyard-environment'] },
```

El ítem `scrapyard-dismantling` se inserta entre vehículos y piezas (flujo natural: entras vehículo → despiezas → ves piezas).

**3. Breadcrumb en la página de despiece:**

```
Desguace > Vehículos > Despiece — {marca} {modelo} ({matrícula})
```

Con enlaces activos a los niveles superiores.

**4. Selector de vehículo si se accede sin `vehicleId`:**

Si el usuario llega a `/saas/vertical/desguaces/despiece` sin `vehicleId`:
- Mostrar un selector con los vehículos disponibles para despiece (estado `received` o `dismantling` con sesión activa)
- Tarjetas con: foto, marca, modelo, matrícula, estado, progreso
- Botón "Continuar despiece" para los que tienen sesión activa
- Botón "Iniciar despiece" para los que están en `received`
- Si no hay vehículos disponibles: mensaje "No hay vehículos pendientes de despiece" + enlace a alta de vehículo

**5. Navegación rápida entre despieces:**

- En la cabecera de la página de despiece: selector desplegable para cambiar de vehículo sin volver al listado
- Atajo: ← Anterior / Siguiente → (navegar por vehículos en despiece)

#### Criterios de aceptación

- La URL `/saas/vertical/desguaces/despiece` carga correctamente
- La URL `/saas/vertical/desguaces/despiece/:vehicleId` abre el despiece del vehículo indicado
- El ítem aparece en el sidebar del grupo `scrapyard` con badge "Nuevo"
- Sin `vehicleId`: se muestra selector de vehículos disponibles para despiece
- El breadcrumb permite navegar a niveles superiores
- El selector de vehículo en la cabecera permite cambiar sin volver al listado
- Lazy loading del componente

---

## Resumen y orden de ejecución

### Fase 1 — Fundamentos backend (sin cambios en UI)

| Ticket | Descripción | Estimación |
|---|---|---|
| DP-01 | Modelo de pieza de desguace y CRUD backend | 4–6h |
| DP-02 | Estados de vehículo para desguace y extensión del modelo | 2–3h |

### Fase 2 — Proceso de despiece (backend + API)

| Ticket | Descripción | Estimación |
|---|---|---|
| DP-03 | Proceso de despiece — crear piezas desde un vehículo | 5–7h |
| DP-07 | Compatibilidades de piezas | 3–4h |

### Fase 3 — Frontend: página de despiece y refactors

| Ticket | Descripción | Estimación |
|---|---|---|
| DP-04 | Refactor ScrapyardVehicles — conectar con backend real | 3–4h |
| DP-05 | Página "Despiece y catalogación" — UI completa | 8–10h |
| DP-06 | Refactor ScrapyardParts — conectar con backend y campos completos | 4–5h |
| DP-11 | Ruta /despiece, sidebar y navegación | 2–3h |

### Fase 4 — Alertas, permisos e integración

| Ticket | Descripción | Estimación |
|---|---|---|
| DP-08 | Alertas de despiece y catalogación | 3–4h |
| DP-09 | Conexiones con módulos existentes | 4–5h |
| DP-10 | Permisos por perfil (gerente/trabajador) | 3–4h |

**Total estimado:** 41–55 horas

### Árbol de dependencias

```
Fase 1 (paralelo):
  DP-01 ──┐
  DP-02 ──┤
           │
Fase 2 (necesita Fase 1):
  DP-03 ──┤ (necesita DP-01 + DP-02)
  DP-07 ──┤ (necesita DP-01)
           │
Fase 3 (paralelo tras DP-03):
  DP-04 ──┤ (necesita DP-02)
  DP-05 ──┤ (necesita DP-01 + DP-02 + DP-03)
  DP-06 ──┤ (necesita DP-01)
  DP-11 ──┤ (necesita DP-05)
           │
Fase 4 (después de Fase 3):
  DP-08 ── (necesita DP-01 + DP-03)
  DP-09 ── (necesita DP-03 + DP-05 + DP-06)
  DP-10 ── (necesita DP-05)
```

### Conexiones con otros módulos

| Módulo | Tipo de conexión |
|---|---|
| Entrada de vehículo (`ScrapyardVehicles`) | Vehículo se despieza; botón "Iniciar despiece"; estado actualizado |
| Stock piezas (`ScrapyardParts`) | Piezas extraídas aparecen en stock; CRUD completo |
| Inventario (`ScrapyardInventory`) | Cantidades por categoría y zona actualizadas automáticamente |
| Ventas (`ScrapyardSales`) | Pieza vendida → cambia estado; venta vinculada a pieza y vehículo |
| Documentación (`documents`) | Documentos del vehículo accesibles desde despiece |
| Bajas (`ScrapyardDeregistrations`) | Vehículo compactado → gestión de baja/descontaminación |
| Medioambiental (`ScrapyardEnvironment`) | Residuos generados durante despiece (aceite, batería, etc.) |
| Dashboard | KPIs: despieces en curso, piezas catalogadas, pendientes de validar |
| Alertas (`alertEngine.js`) | 5 nuevas alertas: sin precio, sin ubicación, ref. duplicada, sin fotos, despiece parado |
| Roles y permisos | Gerente valida y pone precios; trabajador desmonta y cataloga |
