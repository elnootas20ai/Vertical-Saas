# MATERIALES Y CONSUMOS (Limpieza) — Plan de Tickets

**Página:** `/saas/vertical/limpieza/materiales`
**Objetivo:** Controlar productos de limpieza, consumibles y entregas al equipo de trabajo.
**Fecha:** 2026-04-14

---

## Estado auditado (08/07/2026)

~41% completado (32/78 criterios). Núcleo backend hecho: `cleaningMaterialsController.js` + `cleaningMaterialsRouter.js` con materiales (subtype `cleaning_material`), entregas, devoluciones, solicitudes, inventarios y consumo por servicio; `materialStockService.js` descuenta/suma stock vía kardex (`stockMovementService`); 3 de 4 alertas de materiales en `alertEngine.js`; permiso `cleaning_materials` en `TEAM_PERMISSION_KEYS`; página `CleaningMaterialsPage.tsx` con 7 pestañas y deep linking. Falta de verdad: vista trabajador de materiales (MAT-12, `WorkerTpvCleaning.tsx` sin nada de material), stock por ubicación/kits (MAT-06), pestañas Consumo y Compras, sugerencias de compra (MAT-08), vínculo compra→gasto financiero (MAT-09), ajuste de stock al aprobar inventario, idempotencia/rollback en movimientos, conexión con Dashboard (MAT-15) y con `CleaningServices.tsx` (MAT-16).

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Catálogo de productos (CRUD) | Completo | `CatalogPage.tsx`, `catalogController.js` — tipo `catalog_item` con `stockQuantity`, `minStock`, `reorderQuantity`, `autoReorder`, `supplierId` |
| Proveedores (CRUD) | Completo | `SuppliersPage.tsx`, `catalogController.js` — tipo `supplier` |
| Pedidos de compra (CRUD + envío + recepción) | Completo | `PurchaseOrdersPage.tsx` (existe pero **NO registrada en routes.tsx**), `purchaseOrderController.js` |
| Facturas de compra + OCR | Completo | `SupplierBillingPage.tsx` — tipo `purchase_invoice` con escaneo OCR |
| Auto-pedido (draft cada 2h si `stockQuantity < minStock`) | Completo | `autoOrderService.js` |
| Alertas stock bajo / agotado | Completo | `alertEngine.js` — reglas `low_stock`, `out_of_stock`, `parts_low_stock` |
| Servicios de limpieza (CRUD) | Completo | `CleaningServices.tsx`, `cleaningController.js` — tipo `cleaning_service` con `assignedTo`, `assignedToName`, `clientName`, `address` |
| Checklist de limpieza | Completo | `CleaningChecklist.tsx` — tareas por servicio |
| Calidad de limpieza | Completo | `CleaningQuality.tsx` — `qualityRating`, `qualityNotes` |
| Reseñas de clientes limpieza | Completo | `CleaningReviews.tsx` — `clientRating`, `clientReview` |
| Vista trabajador (TPV cleaning) | Completo | `WorkerTpvCleaning.tsx` — el trabajador ve sus servicios asignados, hace check-in/out, marca tareas |
| Sidebar limpieza | Completo | `Sidebar.tsx` — grupo `cleaning` con 4 items (services, checklist, quality, reviews) |
| Grupo `catalogProviders` en sidebar para cleaning | Completo | `Sidebar.tsx` — cleaning tiene acceso a `catalogProviders` |
| KPIs Dashboard con `criticalStockCount` | Parcial | `Dashboard.tsx` — solo cuenta general, sin desglose limpieza |
| Módulo Finanzas | Completo | `Finance.tsx`, `financeController.js` — movimientos cobro/pago, pero sin vínculo con materiales |
| Equipo/Trabajadores | Completo | Gestión de equipo con roles (`Admin`, `Gerente`, `user/worker`), permisos por clave, login de equipo |
| Horarios y fichajes | Completo | `Schedules.tsx`, `Clockins.tsx` — por miembro de equipo |
| SSE + Web Push | Completo | `sseService.js`, `pushService.js` — para alertas en tiempo real |
| i18n | Completo | `i18n.ts` — internacionalización con `react-i18next` |

### Lo que FALTA (específico para Materiales y Consumos de limpieza)

| Funcionalidad | Estado |
|---|---|
| Entidad `cleaning_material` (producto de limpieza con campos específicos del sector) | No existe |
| Entidad `material_delivery` (entrega de material a trabajador) | No existe |
| Entidad `material_return` (devolución de material del trabajador) | No existe |
| Stock por ubicación: almacén central vs vehículo de cada trabajador | No existe — el catálogo tiene `stockQuantity` global pero sin ubicaciones tipo `vehicle` |
| Entidad `warehouse` | No existe (ya contemplado en CS-01 de COMPRAS-STOCK) |
| Entidad `stock_movement` / Kardex | No existe (ya contemplado en CS-02 de COMPRAS-STOCK) |
| Consumo de material vinculado a servicio de limpieza | No existe — `cleaning_service` no tiene campo de materiales usados |
| Consumo de material vinculado a cliente | No existe |
| Historial de entregas y devoluciones por trabajador | No existe |
| Historial de consumo por cliente | No existe |
| Sugerencia de compra automática específica para materiales de limpieza | No existe como flujo diferenciado |
| Vinculación compra → gasto financiero para materiales | No implementado (contemplado en FIN-04/FIN-05 de FINANZAS) |
| Imputación de coste de material a servicio/cliente | No existe |
| Alerta: material no entregado (servicio con material pendiente) | No existe |
| Alerta: consumo anómalo (trabajador consume mucho más que la media) | No existe |
| Alerta: diferencia de inventario (esperado vs real) | No existe |
| Página unificada `/saas/vertical/limpieza/materiales` | No existe |
| Vista trabajador: consultar material asignado, registrar consumo permitido | No existe — `WorkerTpvCleaning.tsx` solo muestra servicios |
| Perfil gerente: panel de control de stock, ajustes, compras de materiales | No existe como vista diferenciada |

---

## Dependencias con otros módulos de tickets

| Módulo | Tickets relacionados | Impacto |
|---|---|---|
| **Compras y Stock Core** (COMPRAS-STOCK-TICKETS.md) | CS-01 (warehouse), CS-02 (stock_movement), CS-03 (multi-almacén), CS-04 (venta resta stock), CS-05 (consumo interno) | Materiales de limpieza reutiliza las entidades base de almacén y kardex; este módulo añade la capa vertical específica |
| **Finanzas** (FINANZAS.md) | FIN-04/FIN-05 (factura → movimiento financiero) | La compra de material genera gasto automático; el coste de material se imputa a servicio/cliente |
| **Horarios y Vacaciones** (HORARIOS-VACACIONES.md) | — | La planificación de entregas puede cruzar con los turnos del trabajador |

---

## Tickets

---

### MAT-01 — Modelo de datos: Entidad `cleaning_material`

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** CS-01 (warehouse) de COMPRAS-STOCK

#### Contexto

Actualmente los productos de limpieza se gestionan en el catálogo genérico (`catalog_item`), que no tiene campos específicos del sector limpieza: tipo de producto (desinfectante, detergente, utensilio…), dilución, ficha de seguridad, vida útil, etc. Se necesita una entidad especializada que extienda el catálogo con datos propios de la vertical, o bien un "subtipo" diferenciado dentro del catálogo existente.

**Decisión de diseño:** En lugar de crear una BD separada, se reutiliza la BD de catálogo (`getCatalogDbName()`) y se añade un campo `subtype: 'cleaning_material'` a los `catalog_item`. Esto permite que los materiales de limpieza participen del mismo stock, pedidos de compra y alertas del catálogo core, pero se puedan filtrar y enriquecer con campos extra.

#### Qué hacer

**1. Ampliar `buildCatalogItemDocument` en `services/couchdb.js`**

Añadir campos opcionales que solo aplican cuando `subtype === 'cleaning_material'`:

```typescript
export interface CleaningMaterialFields {
  subtype: 'cleaning_material';
  materialType: 'detergent' | 'disinfectant' | 'degreaser' | 'glass_cleaner' | 'floor_cleaner' | 'utensil' | 'consumable' | 'protective' | 'other';
  dilutionRatio?: string;         // "1:10", "50ml por litro"
  safetySheetUrl?: string;        // URL ficha de seguridad
  usageInstructions?: string;     // Instrucciones de uso
  expirationMonths?: number;      // Vida útil en meses desde compra
  fragrance?: string;             // "Limón", "Neutro", "Lavanda"
  concentration?: string;         // "5%", "10%"
  applicationSurface?: string[];  // ["suelos", "cristales", "baños"]
  deliveryUnit?: string;          // Unidad en que se entrega al trabajador: "botella 1L", "pack 10ud"
  deliveryUnitQuantity?: number;  // Cantidad del producto por unidad de entrega
  maxPerDelivery?: number;        // Máximo que se puede entregar por vez
  requiresReturn?: boolean;       // true = utensilios que deben devolverse (fregona, cubo…)
  averageConsumptionPerService?: number; // Consumo medio estimado por servicio (en unidades base)
}
```

**2. Crear `src/app/lib/cleaningMaterialsApi.ts`**

| Función | Descripción |
|---|---|
| `listCleaningMaterials(userId)` | Listar `catalog_item` donde `subtype === 'cleaning_material'` |
| `getCleaningMaterial(userId, id)` | Obtener material por ID |
| `saveCleaningMaterial(userId, data, existing?)` | Crear/editar material (llama a API de catálogo con subtype) |
| `deleteCleaningMaterial(userId, id)` | Soft-delete |
| `getStockSummary(userId)` | Resumen: total materiales, valor stock, bajo mínimo, agotados |
| `getMaterialsByType(userId, materialType)` | Filtrar por tipo de material |
| `getMaterialConsumptionStats(userId, materialId, dateRange)` | Estadísticas de consumo de un material |

**3. Endpoint backend (`cleaningController.js` o nuevo `cleaningMaterialsController.js`)**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/materials/:userId` | GET | Listar materiales de limpieza (filtros: tipo, estado, stock) |
| `/api/cleaning/materials/:userId` | POST | Crear material |
| `/api/cleaning/materials/:userId/:materialId` | PUT | Editar material |
| `/api/cleaning/materials/:userId/:materialId` | DELETE | Soft-delete |
| `/api/cleaning/materials/:userId/summary` | GET | KPIs: total, valor, alertas |
| `/api/cleaning/materials/:userId/:materialId/consumption` | GET | Historial de consumo del material |

**4. Semilla de datos por defecto**

Al activar la vertical de limpieza, crear un catálogo base de materiales sugeridos:

| Material | Tipo | Unidad | deliveryUnit |
|---|---|---|---|
| Multiusos concentrado | detergent | litro | Botella 1L |
| Lejía | disinfectant | litro | Garrafa 5L |
| Limpiacristales | glass_cleaner | litro | Spray 750ml |
| Fregasuelos | floor_cleaner | litro | Garrafa 5L |
| Desengrasante | degreaser | litro | Spray 750ml |
| Bayetas microfibra | consumable | unidad | Pack 10ud |
| Guantes de látex | protective | par | Caja 100ud |
| Bolsas de basura 30L | consumable | unidad | Rollo 25ud |
| Estropajo verde | consumable | unidad | Pack 10ud |
| Fregona recambio | utensil | unidad | Unidad |

#### Criterios de aceptación

- [x] Los materiales de limpieza se crean como `catalog_item` con `subtype: 'cleaning_material'`
- [x] Los campos específicos de limpieza se guardan y recuperan correctamente
- [x] El listado filtra solo los materiales de limpieza (no todo el catálogo)
- [x] Compatibles con stock, pedidos de compra y alertas existentes del catálogo core
- [ ] Al dar de alta una empresa de limpieza, se sugiere el catálogo base

---

### MAT-02 — Modelo de datos: Entidad `material_delivery` (entrega de material)

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** MAT-01

#### Contexto

El núcleo del módulo es controlar qué material se entrega a cada trabajador, cuándo, en qué cantidad y para qué servicio/cliente. Actualmente no existe ningún registro de entrega de material. Los trabajadores reciben productos "de palabra" y no hay trazabilidad.

#### Qué hacer

**1. Definir tipo de documento en la DB de limpieza (`getCleaningDbName()`)**

```typescript
export interface MaterialDelivery {
  _id: string;                    // material_delivery:{user_id}:{uuid}
  _rev?: string;
  type: 'material_delivery';
  user_id: string;

  deliveryNumber: string;         // Número secuencial: ENT-001, ENT-002…
  date: string;                   // Fecha de la entrega
  time?: string;                  // Hora

  // Destinatario
  workerId: string;               // ID del miembro del equipo
  workerName: string;             // Nombre (desnormalizado)

  // Origen
  warehouseId?: string;           // Almacén de salida (si aplica CS-01)
  warehouseName?: string;
  vehicleId?: string;             // Si se entrega desde/al vehículo del trabajador

  // Destino (contexto de uso)
  serviceId?: string;             // Servicio de limpieza asociado (si aplica)
  serviceNumber?: string;
  clientId?: string;              // Cliente al que se imputa (si aplica)
  clientName?: string;

  // Líneas de entrega
  lines: MaterialDeliveryLine[];

  // Estado
  status: 'draft' | 'delivered' | 'partial_return' | 'returned' | 'cancelled';
  deliveredBy: string;            // Quien entrega (gerente o encargado)
  deliveredByName: string;
  receivedConfirmation: boolean;  // El trabajador confirma recepción
  receivedAt?: string;            // Fecha/hora de confirmación
  workerSignature?: string;       // Firma digital (base64) — futuro

  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MaterialDeliveryLine {
  id: string;                     // uuid de la línea
  catalogItemId: string;          // Ref al catalog_item
  materialName: string;           // Nombre desnormalizado
  sku?: string;
  quantity: number;               // Cantidad entregada
  unit: string;                   // Unidad (litro, unidad, par…)
  deliveryUnit?: string;          // "Botella 1L", "Pack 10ud"
  deliveryUnitQty?: number;       // Cuántas unidades base por unidad de entrega
  requiresReturn: boolean;        // Si es un utensilio que debe devolverse
  returnedQuantity: number;       // Cantidad devuelta hasta ahora
  returnStatus: 'pending' | 'returned' | 'partial' | 'not_applicable';
  unitCost?: number;              // Coste unitario para imputación
  notes?: string;
}
```

**2. Crear en `services/couchdb.js`**

- `buildMaterialDeliveryDocument(userId, data, existing?)` — Construir documento con sanitización
- `sanitizeMaterialDelivery(doc)` — Limpiar para respuesta API
- `listMaterialDeliveriesByUser(req, userId)` — Todas las entregas
- `listMaterialDeliveriesByWorker(req, userId, workerId)` — Entregas de un trabajador
- `listMaterialDeliveriesByService(req, userId, serviceId)` — Entregas para un servicio

**3. Crear controlador `controllers/cleaningMaterialsController.js`**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/deliveries/:userId` | GET | Listar entregas (filtros: trabajador, servicio, cliente, fecha, estado) |
| `/api/cleaning/deliveries/:userId` | POST | Crear entrega |
| `/api/cleaning/deliveries/:userId/:deliveryId` | GET | Detalle de una entrega |
| `/api/cleaning/deliveries/:userId/:deliveryId` | PUT | Editar entrega (solo draft) |
| `/api/cleaning/deliveries/:userId/:deliveryId` | DELETE | Cancelar entrega |
| `/api/cleaning/deliveries/:userId/:deliveryId/confirm` | POST | Confirmar recepción por trabajador |
| `/api/cleaning/deliveries/:userId/worker/:workerId` | GET | Entregas de un trabajador |
| `/api/cleaning/deliveries/:userId/service/:serviceId` | GET | Entregas para un servicio |

**4. Lógica de negocio al crear entrega con `status: 'delivered'`**

- Descontar stock del almacén/vehículo de origen
- Registrar `stock_movement` tipo `internal_consumption` o nuevo tipo `worker_delivery` (si CS-02 está implementado) con `referenceType: 'material_delivery'`
- Si no hay stock suficiente y `allowNegativeStock === false`: rechazar
- Si no hay stock suficiente y `allowNegativeStock === true`: entregar y generar alerta
- Enviar notificación push al trabajador: "Te han asignado material: [lista]"

**5. Crear `src/app/lib/materialDeliveryApi.ts`**

Tipos `MaterialDelivery`, `MaterialDeliveryLine` y funciones request para todos los endpoints.

#### Criterios de aceptación

- [x] Se puede crear una entrega de material a un trabajador con N líneas
- [x] Al confirmar la entrega, el stock se descuenta automáticamente *(`processDeliveryStockDeduction` en `materialStockService.js`)*
- [ ] El trabajador recibe notificación push
- [x] El movimiento queda registrado en el kardex (si CS-02 existe; si no, actualiza `stockQuantity` directamente)
- [ ] Se puede filtrar por trabajador, servicio, cliente y fecha *(la UI solo tiene búsqueda por texto en catálogo)*
- [x] El trabajador puede confirmar recepción *(endpoint `/deliveries/:userId/:deliveryId/confirm`; sin UI de trabajador)*

---

### MAT-03 — Modelo de datos: Entidad `material_return` (devolución de material)

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** MAT-02

#### Contexto

Algunos productos de limpieza son utensilios reutilizables (fregonas, cubos, aspiradoras portátiles) que se entregan al trabajador y deben devolverse al terminar el servicio o periódicamente. También puede haber devoluciones de producto sobrante. Se necesita una entidad para registrar devoluciones y que el stock vuelva a sumarse.

#### Qué hacer

**1. Definir tipo de documento en DB de limpieza**

```typescript
export interface MaterialReturn {
  _id: string;                    // material_return:{user_id}:{uuid}
  _rev?: string;
  type: 'material_return';
  user_id: string;

  returnNumber: string;           // DEV-001, DEV-002…
  date: string;
  time?: string;

  workerId: string;
  workerName: string;

  deliveryId?: string;            // Entrega original de referencia
  deliveryNumber?: string;

  warehouseId?: string;           // Almacén de destino
  warehouseName?: string;

  lines: MaterialReturnLine[];

  status: 'pending' | 'inspected' | 'accepted' | 'partial' | 'rejected';
  inspectedBy?: string;           // Quien inspecciona la devolución
  inspectedByName?: string;
  inspectedAt?: string;

  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MaterialReturnLine {
  id: string;
  catalogItemId: string;
  materialName: string;
  quantityReturned: number;
  quantityOriginal: number;       // Cantidad que se entregó originalmente
  condition: 'good' | 'damaged' | 'unusable' | 'expired';
  reusable: boolean;              // Si se puede reusar / volver a stock
  notes?: string;
}
```

**2. Backend**

- `buildMaterialReturnDocument` / `sanitizeMaterialReturn` en `services/couchdb.js`
- Controlador con endpoints:

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/returns/:userId` | GET | Listar devoluciones |
| `/api/cleaning/returns/:userId` | POST | Crear devolución |
| `/api/cleaning/returns/:userId/:returnId` | PUT | Editar / inspeccionar |
| `/api/cleaning/returns/:userId/:returnId/accept` | POST | Aceptar devolución → suma stock |

**3. Lógica al aceptar devolución**

- Por cada línea con `reusable: true` y `condition !== 'unusable'`: sumar stock al almacén destino
- Registrar `stock_movement` tipo `return_customer` (o nuevo tipo `worker_return`) con `referenceType: 'material_return'`
- Actualizar `returnedQuantity` y `returnStatus` en la `material_delivery` original
- Si todas las líneas con `requiresReturn` están devueltas: cambiar delivery a `status: 'returned'`

**4. API Client `src/app/lib/materialReturnApi.ts`**

#### Criterios de aceptación

- [x] Se puede registrar la devolución de material desde una entrega previa
- [x] El stock se suma automáticamente al aceptar la devolución (solo si `reusable`)
- [x] La entrega original refleja el estado de devolución *(`updateDeliveryReturnQuantities`)*
- [x] Se registra el movimiento en el kardex
- [x] Material dañado/inutilizable no vuelve al stock pero queda registrado

---

### MAT-04 — Consumo de material vinculado a servicio de limpieza

**Tipo:** Enhancement — Backend + Frontend
**Prioridad:** Alta
**Dependencias:** MAT-01, MAT-02

#### Contexto

Actualmente `cleaning_service` no tiene ningún campo de materiales utilizados. El gerente no sabe cuánto material se consumió en cada servicio ni cuánto costó. Se necesita vincular el consumo de material al servicio para:
- Calcular el coste real del servicio (mano de obra + material)
- Controlar si un trabajador usa demasiado material
- Imputar coste de material al cliente cuando el contrato lo permita

#### Qué hacer

**1. Ampliar `cleaning_service` con campo de materiales**

Añadir a `buildCleaningServiceDocument` en `services/couchdb.js`:

```typescript
// Nuevos campos en cleaning_service
materialsUsed: ServiceMaterial[];  // Materiales consumidos en este servicio
materialCost: number;              // Coste total de materiales
totalCost: number;                 // materialCost + laborCost
laborCost: number;                 // Calculado: duración × tarifa/hora del trabajador

interface ServiceMaterial {
  catalogItemId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  addedBy: 'worker' | 'manager';  // Quién registró el consumo
  deliveryId?: string;             // Entrega desde la que se consumió
}
```

**2. Endpoint para registrar consumo en servicio**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/services/:userId/:serviceId/materials` | POST | Añadir material consumido al servicio |
| `/api/cleaning/services/:userId/:serviceId/materials/:lineId` | DELETE | Eliminar línea de material |
| `/api/cleaning/services/:userId/:serviceId/cost-summary` | GET | Resumen de costes del servicio |

**3. Lógica al añadir material consumido**

- Si el material proviene de una entrega (`deliveryId`): no descontar stock (ya se descontó al entregar)
- Si el consumo se registra directamente (sin entrega previa): descontar stock del almacén/vehículo del trabajador
- Recalcular `materialCost` y `totalCost` del servicio
- Registrar movimiento en kardex si procede

**4. Frontend — Pestaña "Materiales" en el detalle del servicio**

En `CleaningServices.tsx`, al abrir un servicio en modal de detalle, añadir una pestaña/sección "Materiales usados" donde:
- Se puede buscar y añadir materiales del catálogo
- Se muestra la cantidad usada y el coste
- Se ve el total de coste material del servicio

**5. Frontend — Vista trabajador**

En `WorkerTpvCleaning.tsx`, cuando el trabajador está en un servicio `in_progress`:
- Mostrar botón "Registrar material usado"
- El trabajador selecciona material de su stock asignado y la cantidad
- Solo puede registrar materiales que tiene asignados (vía entregas)

#### Criterios de aceptación

- [x] Se puede vincular materiales consumidos a un servicio de limpieza *(`registerServiceConsumption` + campos `materialsUsed`/`materialCost` en `cleaning_service`)*
- [x] Se calcula automáticamente el coste de material del servicio
- [ ] El trabajador puede registrar consumos desde su vista móvil *(`WorkerTpvCleaning.tsx` no tiene sección de materiales)*
- [ ] Los consumos se reflejan en el kardex *(`registerServiceConsumption` no registra movimiento ni descuenta stock)*
- [ ] El gerente ve un resumen de coste por servicio (mano de obra + material) *(solo agregado en informes; sin desglose en el detalle del servicio)*

---

### MAT-05 — Consumo de material imputado a cliente

**Tipo:** Feature — Backend
**Prioridad:** Media
**Dependencias:** MAT-04

#### Contexto

Algunos contratos de limpieza incluyen el suministro de materiales como parte del servicio; otros no. El gerente necesita saber cuánto material se ha consumido por cada cliente para:
- Facturar materiales aparte si el contrato lo exige
- Controlar el coste real por cliente
- Detectar clientes que consumen más material de lo esperado

#### Qué hacer

**1. Endpoint de consumo por cliente**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/materials/:userId/consumption/by-client` | GET | Consumo agregado por cliente (filtros: rango fechas, material) |
| `/api/cleaning/materials/:userId/consumption/by-client/:clientId` | GET | Detalle de consumo de un cliente |

**2. Lógica de agregación**

- Recorrer `material_delivery` y `cleaning_service.materialsUsed` agrupando por `clientId`
- Calcular: unidades consumidas, coste total, coste medio por servicio, top materiales
- Comparar con media general para detectar anomalías

**3. Campo `materialBilling` en cliente (CRM)**

Añadir al documento de cliente un campo de configuración:

```typescript
materialBilling: {
  includeInService: boolean;      // true = material incluido en precio del servicio
  billingType: 'included' | 'separate' | 'at_cost' | 'markup';
  markupPercentage?: number;      // Si markup: % sobre coste
}
```

**4. Informe de imputación de material a cliente**

- Vista que muestra para cada cliente: materiales consumidos, coste, si se factura incluido o aparte
- Botón "Generar factura de materiales" para clientes con `billingType !== 'included'`

#### Criterios de aceptación

- [x] Se puede consultar el consumo de material por cliente *(agregación `byClient` en el informe de materiales de `cleaningReportsController.js`; no existen los endpoints dedicados `consumption/by-client`)*
- [ ] El sistema distingue si el material se factura incluido o aparte
- [ ] Se puede generar una factura de materiales para un cliente
- [ ] El informe muestra comparativa vs media

---

### MAT-06 — Stock por ubicación: almacén central vs vehículo del trabajador

**Tipo:** Feature — Backend
**Prioridad:** Alta
**Dependencias:** MAT-01, CS-01 (warehouse)

#### Contexto

En una empresa de limpieza, el stock no está solo en un almacén central. Cada trabajador puede llevar materiales en su vehículo o mochila de trabajo. Se necesita distinguir:
- **Almacén central:** donde se almacena el grueso del stock
- **Vehículo/kit del trabajador:** stock móvil asignado a cada persona

Esto se implementa extendiendo la entidad `warehouse` (CS-01) con un tipo especial `vehicle` o `worker_kit`.

#### Qué hacer

**1. Ampliar tipos de `warehouse` para incluir vehículos/kits**

En el enum `type` de `warehouse`, añadir:
- `vehicle` — Vehículo de un trabajador
- `worker_kit` — Kit portátil de un trabajador (si no tiene vehículo)

Y nuevos campos:
```typescript
// Campos extra para warehouse tipo vehicle/worker_kit
assignedWorkerId?: string;    // Trabajador al que pertenece
assignedWorkerName?: string;
vehiclePlate?: string;        // Matrícula si es vehículo
```

**2. Al crear/invitar un trabajador en vertical de limpieza:**

- Crear automáticamente un `warehouse` tipo `worker_kit` con `assignedWorkerId` = ID del trabajador
- Si el trabajador tiene vehículo asignado, vincular el warehouse al vehículo

**3. Al crear entrega de material (`material_delivery`):**

- Si `vehicleId` o `warehouseId` destino es un kit de trabajador:
  - Descontar del almacén central
  - Sumar al kit del trabajador
  - Queda registrado en el kardex como `transfer`

**4. Endpoint para ver stock del trabajador**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/materials/:userId/worker-stock/:workerId` | GET | Stock asignado al trabajador (su kit/vehículo) |
| `/api/cleaning/materials/:userId/worker-stock` | GET | Resumen de stock por trabajador (todos) |

**5. Vista en la página de materiales**

- Tab o vista "Stock por trabajador" que muestra qué tiene cada persona
- Tabla: trabajador, material, cantidad, última entrega, próximo servicio

#### Criterios de aceptación

- [ ] Cada trabajador puede tener un "almacén virtual" (kit/vehículo) *(no existen los tipos `vehicle`/`worker_kit` en warehouse)*
- [ ] Las entregas transfieren stock del almacén central al kit del trabajador
- [ ] Se puede consultar el stock de cada trabajador *(no existen los endpoints `worker-stock`)*
- [ ] Al registrar consumo en servicio, se descuenta del kit del trabajador
- [ ] El gerente ve un resumen global de stock distribuido

---

### MAT-07 — Automatización: descontar entregas del stock

**Tipo:** Enhancement — Backend
**Prioridad:** Crítica
**Dependencias:** MAT-02, CS-02 (stock_movement)

#### Contexto

La pieza crítica del módulo: cuando se entrega material a un trabajador, el stock debe descontarse automáticamente. Y cuando se devuelve, sumarse. Este ticket asegura que la cadena completa es transaccional y auditable.

#### Qué hacer

**1. Hook en `material_delivery` al cambiar status a `delivered`**

En el controlador, al crear o actualizar una entrega con `status: 'delivered'`:

```
Por cada línea de la entrega:
  1. Leer catalog_item actual
  2. Verificar stock disponible (en almacén de origen)
  3. Si stock insuficiente → rechazar o alertar según config
  4. Registrar stock_movement:
     - movementType: 'transfer' (si va de almacén a kit de trabajador)
     - movementType: 'internal_consumption' (si no hay kit, es salida directa)
     - referenceId: delivery._id
     - referenceType: 'material_delivery'
     - warehouseId: almacén origen
     - warehouseToId: kit del trabajador (si transfer)
  5. Actualizar stockQuantity / warehouseStock del catalog_item
```

**2. Hook en `material_return` al cambiar status a `accepted`**

```
Por cada línea con reusable && condition !== 'unusable':
  1. Registrar stock_movement:
     - movementType: 'transfer' (del kit del trabajador al almacén)
     - o 'adjustment_in' si el almacén de destino es el central
  2. Actualizar stockQuantity
```

**3. Idempotencia**

- Verificar que no existe ya un `stock_movement` con el mismo `referenceId` y `movementType`
- Manejar conflictos CouchDB (`409 Conflict`) con retry

**4. Rollback en caso de cancelación de entrega**

- Si una entrega se cancela: registrar movimientos inversos (sumar stock al origen, restar del destino)
- Marcar los movimientos de cancelación con `notes: 'Cancelación de entrega ENT-XXX'`

#### Criterios de aceptación

- [x] Toda entrega confirmada descuenta stock automáticamente
- [x] Toda devolución aceptada suma stock automáticamente
- [x] Los movimientos quedan en el kardex con referencia a la entrega/devolución *(`referenceId`/`referenceType`)*
- [ ] No se producen descuentos duplicados *(sin verificación de idempotencia por `referenceId`)*
- [ ] La cancelación revierte los movimientos correctamente
- [ ] Si no hay stock suficiente, se puede configurar si se bloquea o se permite con alerta

---

### MAT-08 — Automatización: sugerir compra automática de materiales

**Tipo:** Enhancement — Backend
**Prioridad:** Media
**Dependencias:** MAT-01, CS-06 (sugerencia de compra)

#### Contexto

El auto-pedido existente (`autoOrderService.js`) ya detecta `stockQuantity < minStock` y crea PO draft. Este ticket lo especializa para materiales de limpieza, considerando:
- El consumo medio por servicio
- La planificación de servicios de los próximos días
- El stock distribuido entre almacén central y kits de trabajadores

#### Qué hacer

**1. Ampliar lógica de `autoOrderService.js`**

Para items con `subtype === 'cleaning_material'`:
- Calcular consumo medio semanal basado en `stock_movements` tipo `worker_delivery` / `internal_consumption` de las últimas 4 semanas
- Obtener servicios planificados para los próximos 7 días (status `pending` o `assigned`)
- Estimar consumo previsto = número de servicios × `averageConsumptionPerService`
- Si stock actual < consumo previsto de 2 semanas (configurable) → sugerir compra

**2. Nuevo endpoint**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/materials/:userId/purchase-suggestions` | GET | Sugerencias de compra basadas en consumo previsto |

Respuesta:
```typescript
interface PurchaseSuggestion {
  catalogItemId: string;
  materialName: string;
  currentStock: number;
  weeklyConsumption: number;
  coverageWeeks: number;           // stock / consumo semanal
  upcomingServicesCount: number;
  estimatedNeed: number;
  suggestedQuantity: number;
  supplierId?: string;
  supplierName?: string;
  estimatedCost: number;
  urgency: 'critical' | 'warning' | 'info';
}
```

**3. Acción "Convertir en pedido de compra"**

- Botón que toma las sugerencias seleccionadas y crea un `purchase_order` draft agrupado por proveedor
- Reutiliza la lógica existente de `createPurchaseOrder`

#### Criterios de aceptación

- [ ] Las sugerencias consideran consumo histórico y servicios planificados *(no existe el endpoint `purchase-suggestions` ni especialización cleaning en `autoOrderService.js`)*
- [ ] Se muestra la cobertura estimada en semanas
- [ ] Se puede convertir sugerencias en pedidos de compra con un clic
- [ ] La urgencia refleja la criticidad real (cobertura < 1 semana = critical)

---

### MAT-09 — Automatización: vincular compra de material con gasto financiero

**Tipo:** Enhancement — Backend
**Prioridad:** Media
**Dependencias:** MAT-01, FIN-04/FIN-05 (FINANZAS)

#### Contexto

Cuando se compra material de limpieza (factura de compra pagada), debe generarse automáticamente un movimiento financiero de tipo gasto. Actualmente las facturas de compra y los movimientos financieros están desconectados.

#### Qué hacer

**1. Hook al marcar factura de compra como pagada**

Si la factura de compra contiene líneas con `subtype === 'cleaning_material'`:
- Crear movimiento financiero de tipo `pago` con:
  - `concept`: "Material limpieza — [proveedor] — Factura [nº]"
  - `category`: `cleaning_material` (nueva categoría)
  - `amount`: total de la factura (o de las líneas de material si la factura es mixta)
  - `referenceId`: ID de la `purchase_invoice`
  - `referenceType`: `purchase_invoice`
- Configurable: `account.cleaningConfig.autoCreateExpenseOnPurchase` (boolean, default `true`)

**2. Categorías financieras específicas**

Añadir categorías de gasto:
- `cleaning_material` — Materiales de limpieza
- `cleaning_equipment` — Equipamiento (aspiradoras, fregadoras…)
- `cleaning_consumable` — Consumibles desechables

**3. Informe de gasto en materiales**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/materials/:userId/expense-report` | GET | Gasto en materiales por período, proveedor, tipo |

#### Criterios de aceptación

- [ ] La compra de material genera gasto financiero automáticamente
- [ ] Las categorías de gasto son específicas de limpieza
- [ ] Se puede consultar un informe de gasto en materiales *(no existe `expense-report`; el informe de costes de materiales de CleaningReports cubre consumo, no compras)*

---

### MAT-10 — Alertas específicas de materiales de limpieza

**Tipo:** Feature — Backend
**Prioridad:** Alta
**Dependencias:** MAT-02, MAT-04

#### Contexto

Además de las alertas genéricas de stock bajo/agotado (ya existentes en `alertEngine.js`), se necesitan alertas específicas del flujo de materiales de limpieza.

#### Qué hacer

**1. Nueva regla: `material_not_delivered`**

- **Lógica:** buscar `cleaning_service` con `status: 'assigned'` cuya fecha es mañana o hoy, y el trabajador asignado no tiene entregas de material recientes (últimos 3 días) ni stock suficiente en su kit
- **Categoría:** `cleaning_material`
- **Nivel:** `warning`
- **Mensaje:** "El trabajador [nombre] tiene el servicio [nº] mañana en [dirección] pero no tiene material asignado"
- **Ruta:** `/saas/vertical/limpieza/materiales?tab=entregas&workerId={id}`

**2. Nueva regla: `abnormal_consumption`**

- **Lógica:** por cada trabajador, calcular su consumo medio semanal (de las últimas 4 semanas). Si su consumo de la última semana es > 2× la media (configurable), alertar
- **Categoría:** `cleaning_material`
- **Nivel:** `warning`
- **Mensaje:** "El trabajador [nombre] ha consumido [X] unidades de [material] esta semana — 2.5× la media del equipo"
- **Ruta:** `/saas/vertical/limpieza/materiales?tab=consumo&workerId={id}`

**3. Nueva regla: `inventory_discrepancy`**

- **Lógica:** comparar stock teórico (según entregas - consumos - devoluciones) del kit de un trabajador con el stock reportado (cuando el trabajador hace inventario manual — ver MAT-14). Si la diferencia es > 10% (configurable), alertar
- **Categoría:** `cleaning_material`
- **Nivel:** si diferencia > 20% → `alert`; si 10-20% → `warning`
- **Mensaje:** "Diferencia de inventario para [trabajador]: teórico [X] vs real [Y] de [material] (diferencia: [Z])"
- **Ruta:** `/saas/vertical/limpieza/materiales?tab=inventario`

**4. Nueva regla: `material_expiring`**

- **Lógica:** si un `catalog_item` con `subtype: 'cleaning_material'` y `expirationMonths` tiene lotes cuya fecha de compra + `expirationMonths` es < 30 días vista
- **Categoría:** `cleaning_material`
- **Nivel:** `warning`
- **Mensaje:** "El producto [nombre] caduca en [X] días. Stock restante: [Y] unidades"
- **Ruta:** `/saas/vertical/limpieza/materiales?tab=stock&itemId={id}`

**5. Configuración en `alertConfig`**

```typescript
cleaningMaterialAlerts: {
  materialNotDeliveredEnabled: boolean;     // default: true
  abnormalConsumptionEnabled: boolean;      // default: true
  abnormalConsumptionThreshold: number;     // default: 2 (multiplicador sobre media)
  inventoryDiscrepancyEnabled: boolean;     // default: true
  inventoryDiscrepancyThreshold: number;   // default: 10 (porcentaje)
  materialExpiringEnabled: boolean;        // default: true
  materialExpiringDays: number;            // default: 30
}
```

#### Criterios de aceptación

- [ ] Las 4 alertas se ejecutan en el ciclo de `alertEngine.js` *(existen `material_not_delivered`, `abnormal_consumption` y `material_expiring`; falta `inventory_discrepancy`)*
- [x] Cada alerta tiene su configuración on/off y umbrales *(en `getAlertConfig()`)*
- [ ] Las alertas llevan a la pestaña correcta de la página de materiales
- [x] Se deduplican correctamente (una por entidad por ciclo de 24h)
- [x] Se envían por SSE + Web Push *(vía la emisión estándar del motor genérico)*

---

### MAT-11 — Página unificada `/saas/vertical/limpieza/materiales`

**Tipo:** Feature — Frontend
**Prioridad:** Crítica
**Dependencias:** MAT-01, MAT-02, MAT-03, MAT-06

#### Contexto

La página principal del módulo. Es la que el gerente usa para gestionar todo el ciclo de vida de materiales de limpieza. Debe ser visualmente atractiva, con KPIs claros y navegación por pestañas.

#### Diseño de pestañas

| Pestaña | Contenido | Icono |
|---------|-----------|-------|
| **Resumen** | KPIs + alertas + acciones rápidas | `LayoutDashboard` |
| **Catálogo** | Materiales de limpieza (CRUD) | `Package` |
| **Stock** | Inventario con desglose almacén/trabajador | `Boxes` |
| **Entregas** | Registro de entregas a trabajadores | `Truck` |
| **Devoluciones** | Registro de devoluciones | `ArrowLeftRight` |
| **Consumo** | Consumo por servicio, trabajador, cliente | `BarChart3` |
| **Compras** | Pedidos de compra de material + sugerencias | `ShoppingCart` |
| **Historial** | Kardex / movimientos de materiales | `History` |

#### Qué hacer

**1. Crear `src/app/pages/saas/CleaningMaterials.tsx`**

**2. Pestaña RESUMEN (landing)**

KPIs en tarjetas:
- Total materiales activos (count)
- Valor total del stock de materiales (€)
- Materiales bajo mínimo (count, badge rojo)
- Materiales agotados (count, badge rojo)
- Entregas pendientes de confirmar (count)
- Trabajadores sin material asignado (count)
- Gasto en materiales este mes (€)
- Servicios sin material registrado esta semana (count)

Acciones rápidas:
- "Nueva entrega de material" → abre modal
- "Registrar devolución" → abre modal
- "Ver sugerencias de compra" → va a tab compras
- "Hacer inventario" → va a tab stock con modo inventario

Alertas activas:
- Lista de alertas de categoría `cleaning_material` del último ciclo
- Cada alerta con acción directa (navegar al recurso afectado)

**3. Pestaña CATÁLOGO**

- Tabla de materiales de limpieza con columnas: nombre, tipo, SKU, stock, mínimo, unidad, coste, proveedor, estado
- Filtros: tipo de material, proveedor, estado (activo/inactivo), con/sin stock
- Vista tarjetas (cards) alternativa con imagen del producto
- Modal de crear/editar con todos los campos de `CleaningMaterialFields`
- Acción masiva: importar desde CSV/Excel
- Badge visual de stock: verde (OK), amarillo (bajo mínimo), rojo (agotado)

**4. Pestaña STOCK**

- Selector: "Almacén central" / "Por trabajador" / "Todos"
- Tabla: material, stock total, stock almacén, stock distribuido (suma de kits), mínimo, máximo, cobertura estimada
- Semáforo visual por fila
- Botón "Ajuste de stock" → modal para ajustar manualmente (requiere motivo)
- Botón "Inventario físico" → flujo de recuento (MAT-14)
- Gráfico de evolución de stock de los últimos 30 días (Recharts)

Subvista "Stock por trabajador":
- Tabla: trabajador, total items, valor, última entrega, próximo servicio
- Click en trabajador → detalle de su kit con cada material y cantidad

**5. Pestaña ENTREGAS**

- Tabla de entregas: número, fecha, trabajador, servicio, nº líneas, estado, acciones
- Filtros: trabajador, servicio, cliente, estado, rango fechas
- Botón "Nueva entrega" → wizard:
  1. Seleccionar trabajador (autocomplete del equipo)
  2. Seleccionar servicio (opcional, autocompletar servicios del trabajador)
  3. Seleccionar materiales (buscar en catálogo, ajustar cantidad)
  4. Seleccionar almacén de origen
  5. Confirmar y entregar
- Detalle de entrega en drawer/modal: líneas, estado, confirmación del trabajador, devoluciones vinculadas

**6. Pestaña DEVOLUCIONES**

- Tabla de devoluciones: número, fecha, trabajador, entrega original, estado, acciones
- Flujo de devolución:
  1. Seleccionar entrega original (o trabajador → listar sus entregas pendientes de devolver)
  2. Seleccionar materiales a devolver con cantidad y condición
  3. Inspeccionar y aceptar/rechazar

**7. Pestaña CONSUMO**

- Vista por servicio: tabla de servicios con columna "material usado" y "coste material"
- Vista por trabajador: agregado de consumo por trabajador, media por servicio, comparativa
- Vista por cliente: consumo total por cliente, media por servicio, tipo de facturación
- Gráficos: evolución de consumo mensual, top 5 materiales más consumidos, distribución por tipo

**8. Pestaña COMPRAS**

- Lista de sugerencias de compra (endpoint MAT-08)
- Por cada sugerencia: material, stock, consumo semanal, cobertura, cantidad sugerida, proveedor, urgencia
- Botón "Crear pedido de compra" → seleccionar sugerencias → genera PO draft
- Historial de pedidos de compra filtrado por materiales de limpieza

**9. Pestaña HISTORIAL**

- Kardex de movimientos filtrado por materiales de limpieza
- Tabla: fecha, material, tipo movimiento, cantidad, stock anterior, stock nuevo, referencia, usuario
- Filtros: material, tipo movimiento, trabajador, almacén, rango fechas
- Exportar a CSV/Excel

**10. Registrar ruta y sidebar**

- En `routes.tsx`: `{ path: 'vertical/limpieza/materiales', Component: CleaningMaterials }`
- En `Sidebar.tsx`: añadir `cleaning-materials` al grupo `cleaning` con icono `Boxes` y label "Materiales"

**11. Deep linking**

- `?tab=entregas&workerId=xxx` → abre pestaña entregas filtrada por trabajador
- `?tab=stock&itemId=xxx` → abre pestaña stock con producto seleccionado
- `?tab=consumo&view=client&clientId=xxx` → consumo del cliente

#### Criterios de aceptación

- [ ] Página accesible en `/saas/vertical/limpieza/materiales` *(implementada en `/saas/cleaning-materials`)*
- [ ] Todas las pestañas cargan y funcionan con datos reales *(7 pestañas: Resumen, Catálogo, Stock, Entregas, Devoluciones, Solicitudes, Historial; faltan Consumo y Compras)*
- [x] KPIs del resumen se calculan en tiempo real
- [x] Deep linking funcional *(`?tab=` vía `useSearchParams`)*
- [x] Responsive: funciona en tablet y móvil
- [x] Diseño coherente con el resto de páginas del SaaS (MUI + Tailwind + Lucide icons)
- [x] Aparece en el sidebar del grupo "Limpieza"

---

### MAT-12 — Vista trabajador: material asignado y registro de consumo

**Tipo:** Feature — Frontend
**Prioridad:** Alta
**Dependencias:** MAT-02, MAT-04

#### Contexto

Actualmente `WorkerTpvCleaning.tsx` solo muestra los servicios asignados al trabajador. Necesita una sección para que el trabajador:
- Vea qué material tiene asignado (su kit)
- Confirme la recepción de entregas
- Registre material consumido durante un servicio
- Solicite material si le falta

#### Qué hacer

**1. Ampliar `WorkerTpvCleaning.tsx` con sección "Mi Material"**

Nueva pestaña o sección fija en la parte superior:
- Lista de materiales asignados con cantidad actual
- Badge "Pendiente de confirmar" si hay entregas sin confirmar
- Botón "Confirmar recepción" por cada entrega pendiente

**2. Dentro de un servicio `in_progress`: sección "Material usado"**

- Cuando el trabajador abre un servicio activo, aparece la sección "Material usado"
- Lista de materiales de su kit con botón "+" para añadir unidades consumidas
- Selector de cantidad (numérico, con incremento/decremento)
- Al guardar: registra el consumo en `cleaning_service.materialsUsed`

**3. Botón "Solicitar material"**

- Si el trabajador necesita algo que no tiene en su kit:
  - Abre formulario: seleccionar material del catálogo + cantidad + motivo
  - Crea una solicitud que llega al gerente como notificación
  - El gerente puede aprobar y crear la entrega desde la notificación

**4. Nuevo endpoint para solicitud de material del trabajador**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/material-requests/:userId` | POST | Crear solicitud de material |
| `/api/cleaning/material-requests/:userId` | GET | Listar solicitudes (filtro: estado, trabajador) |
| `/api/cleaning/material-requests/:userId/:requestId/approve` | POST | Aprobar solicitud → crea entrega |
| `/api/cleaning/material-requests/:userId/:requestId/reject` | POST | Rechazar solicitud |

**5. Ruta de trabajador**

- En `routes.tsx`, añadir: `{ path: 'worker/materials', Component: WorkerMaterials }`
- O bien integrar dentro de `WorkerTpvCleaning.tsx` como tab

#### Criterios de aceptación

- [ ] El trabajador ve su stock asignado *(`WorkerTpvCleaning.tsx` no tiene nada de materiales)*
- [ ] Puede confirmar recepciones de material *(endpoint backend existe, sin UI de trabajador)*
- [ ] Puede registrar consumos durante un servicio activo
- [ ] Puede solicitar material faltante *(los endpoints de `material-requests` existen en backend, sin UI de trabajador)*
- [ ] La UI es mobile-first y fácil de usar con guantes (botones grandes)
- [ ] Las solicitudes llegan al gerente como notificación

---

### MAT-13 — Perfiles de acceso: gerente vs trabajador

**Tipo:** Enhancement — Backend + Frontend
**Prioridad:** Alta
**Dependencias:** MAT-11, MAT-12

#### Contexto

Los permisos del sistema usan `TEAM_PERMISSION_KEYS` para controlar acceso. Se necesita añadir la clave `cleaning_materials` para que:
- **Gerente / Admin:** accede a la página completa con todas las pestañas (stock, compras, ajustes, entregas, informes)
- **Trabajador:** solo ve su material asignado, confirma recepciones, registra consumos permitidos y solicita material

#### Qué hacer

**1. Añadir clave de permiso**

En `services/couchdb.js`, añadir `'cleaning_materials'` a `TEAM_PERMISSION_KEYS`.

**2. Controlar acceso en el backend**

- Los endpoints de `/api/cleaning/materials/*` verifican que el usuario tiene permiso `cleaning_materials.view` (o es Admin/Gerente)
- Los endpoints de escritura verifican `cleaning_materials.edit`
- Excepción: los endpoints del trabajador (`/api/cleaning/material-requests`, confirmación de entrega, registro de consumo en servicio) son accesibles si el `workerId` coincide con el usuario autenticado

**3. Controlar visibilidad en el frontend**

- La página `/saas/vertical/limpieza/materiales` solo es visible si `cleaning_materials.view === true`
- Las pestañas de "Compras" y "Historial" (kardex) requieren `cleaning_materials.edit`
- El botón "Ajuste de stock" requiere `cleaning_materials.edit`

**4. Sidebar**

- Para workers: mostrar "Mi Material" en la sección worker del sidebar
- Para admin/gerente: mostrar "Materiales" en el grupo cleaning

#### Criterios de aceptación

- [x] El gerente tiene acceso completo a la gestión de materiales
- [ ] El trabajador solo ve su material asignado y puede registrar consumos/solicitudes *(no existe vista de trabajador)*
- [x] Los permisos se configuran desde la pantalla de equipo (Team) *(`cleaning_materials` en `TEAM_PERMISSION_KEYS`)*
- [x] Un gerente puede dar/quitar acceso a materiales a miembros individuales

---

### MAT-14 — Inventario físico de materiales

**Tipo:** Feature — Backend + Frontend
**Prioridad:** Media
**Dependencias:** MAT-06, MAT-10

#### Contexto

Periódicamente el gerente necesita hacer un recuento físico del stock y compararlo con el stock teórico del sistema. También el trabajador debería poder reportar su inventario real para detectar diferencias.

#### Qué hacer

**1. Entidad `material_inventory_count`**

```typescript
export interface MaterialInventoryCount {
  _id: string;
  _rev?: string;
  type: 'material_inventory_count';
  user_id: string;

  countNumber: string;          // INV-001
  date: string;
  countedBy: string;            // Quien realiza el conteo
  countedByName: string;

  warehouseId?: string;         // Almacén inventariado (central o kit de trabajador)
  warehouseName?: string;
  workerId?: string;            // Si es inventario del kit de un trabajador

  lines: InventoryCountLine[];

  status: 'in_progress' | 'completed' | 'approved';
  approvedBy?: string;
  approvedAt?: string;

  summary: {
    totalItems: number;
    matchingItems: number;
    discrepancyItems: number;
    totalDiscrepancyValue: number;
  };

  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCountLine {
  id: string;
  catalogItemId: string;
  materialName: string;
  sku?: string;
  expectedQuantity: number;     // Según el sistema
  actualQuantity: number;       // Conteo real
  discrepancy: number;          // actual - expected
  discrepancyPercentage: number;
  unitCost: number;
  discrepancyValue: number;     // discrepancy × unitCost
  notes?: string;
}
```

**2. Endpoints**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/cleaning/inventory/:userId` | GET | Listar inventarios |
| `/api/cleaning/inventory/:userId` | POST | Iniciar inventario (genera líneas con expected desde stock actual) |
| `/api/cleaning/inventory/:userId/:countId` | PUT | Actualizar conteo (guardar actual quantities) |
| `/api/cleaning/inventory/:userId/:countId/complete` | POST | Completar inventario → calcula discrepancias |
| `/api/cleaning/inventory/:userId/:countId/approve` | POST | Aprobar inventario → ajusta stock con movimientos de ajuste |

**3. Al aprobar inventario**

- Por cada línea con discrepancia:
  - Si `actual > expected`: registrar `stock_movement` tipo `adjustment_in`
  - Si `actual < expected`: registrar `stock_movement` tipo `adjustment_out`
  - Nota automática: "Ajuste por inventario físico INV-XXX"
- Disparar alerta `inventory_discrepancy` (MAT-10) si la discrepancia total supera el umbral

**4. UI: flujo de inventario**

En la pestaña "Stock" de MAT-11:
- Botón "Iniciar inventario"
- Wizard: seleccionar almacén/trabajador → lista de productos con campo "Cantidad real" → confirmar → resumen de discrepancias → aprobar ajuste
- Vista mobile para que el trabajador pueda hacer su propio inventario de kit

#### Criterios de aceptación

- [x] Se puede iniciar un inventario físico de un almacén o kit de trabajador *(endpoints de `inventory` en el router; sin kits)*
- [x] El sistema precarga las cantidades esperadas
- [ ] Al completar, muestra las discrepancias con detalle
- [ ] Al aprobar, ajusta el stock automáticamente con movimientos en el kardex *(`approveInventoryCount` solo cambia el estado, no ajusta stock)*
- [ ] Se dispara alerta si la discrepancia supera el umbral configurado *(la regla `inventory_discrepancy` no existe)*

---

### MAT-15 — Conexión con Dashboard

**Tipo:** Enhancement — Frontend
**Prioridad:** Media
**Dependencias:** MAT-01, MAT-10

#### Contexto

El Dashboard general (`Dashboard.tsx`) necesita reflejar el estado del módulo de materiales de limpieza para que el gerente tenga visión rápida sin entrar a la página de materiales.

#### Qué hacer

**1. Nuevos KPIs en endpoint de Dashboard**

En `dashboardController.js`, añadir al bloque de la vertical cleaning:

```typescript
cleaningMaterials: {
  totalMaterials: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingDeliveries: number;
  monthlyExpense: number;
  activeAlerts: number;
}
```

**2. Widget en Dashboard.tsx**

- Tarjeta "Materiales de limpieza" en el dashboard del vertical cleaning
- Muestra: stock total (€), bajo mínimo (count), entregas pendientes (count), gasto mensual (€)
- Click → navega a `/saas/vertical/limpieza/materiales`
- Mini-gráfico de gasto en materiales últimos 6 meses (sparkline)
- Semáforo: verde si todo OK, amarillo si hay alertas warning, rojo si hay alertas critical

**3. Alertas en panel de alertas**

- Las alertas de categoría `cleaning_material` aparecen en el panel general de alertas (`CrmAlertsPanel.tsx`)
- Con icono `Droplets` y color adecuado

#### Criterios de aceptación

- [ ] Dashboard muestra KPIs de materiales de limpieza *(sin bloque `cleaningMaterials` en `dashboardController.js`)*
- [ ] El widget navega a la página de materiales
- [ ] Las alertas de materiales aparecen en el panel general
- [ ] Los datos se actualizan en tiempo real

---

### MAT-16 — Conexión con Servicios de limpieza

**Tipo:** Enhancement — Frontend
**Prioridad:** Media
**Dependencias:** MAT-04

#### Contexto

La página `CleaningServices.tsx` necesita mostrar la información de materiales vinculada a cada servicio, y permitir gestionar materiales desde el contexto del servicio.

#### Qué hacer

**1. En la lista de servicios (`CleaningServices.tsx`)**

- Nueva columna (o badge): "Material" que muestra si el servicio tiene materiales registrados
- Icono verde si tiene materiales + coste; gris si no tiene
- Tooltip con resumen: "3 materiales, €12.50"

**2. En el modal/detalle del servicio**

- Nueva pestaña "Materiales" con:
  - Lista de materiales consumidos en el servicio
  - Coste total de material
  - Botón "Añadir material" (busca en catálogo)
  - Botón "Crear entrega para este servicio" → wizard de entrega pre-rellenado con trabajador y servicio

**3. En la vista de calidad (`CleaningQuality.tsx`)**

- Mostrar coste de material junto a la evaluación de calidad
- Útil para correlacionar: "¿se usó suficiente material?"

**4. Resumen de costes en servicio**

Al completar un servicio (`status: 'completed'`):
- Mostrar resumen: ingresos (precio) vs costes (mano de obra + material)
- Margen del servicio: `precio - laborCost - materialCost`

#### Criterios de aceptación

- [ ] Cada servicio muestra si tiene materiales asociados *(`CleaningServices.tsx` no referencia materiales)*
- [ ] Se puede añadir materiales desde el detalle del servicio
- [ ] Se calcula y muestra el margen del servicio
- [ ] La vista de calidad incluye información de material

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos de datos (semanas 1-2)

| Ticket | Nombre | Prioridad | Dependencia |
|--------|--------|-----------|-------------|
| MAT-01 | Entidad `cleaning_material` (subtype en catálogo) | Crítica | CS-01 |
| MAT-02 | Entidad `material_delivery` (entrega a trabajador) | Crítica | MAT-01 |
| MAT-03 | Entidad `material_return` (devolución) | Alta | MAT-02 |
| MAT-06 | Stock por ubicación: almacén vs vehículo/kit | Alta | MAT-01, CS-01 |

### Fase 2 — Automatización core (semanas 3-4)

| Ticket | Nombre | Prioridad | Dependencia |
|--------|--------|-----------|-------------|
| MAT-07 | Descontar entregas del stock automáticamente | Crítica | MAT-02, CS-02 |
| MAT-04 | Consumo de material vinculado a servicio | Alta | MAT-01, MAT-02 |
| MAT-10 | Alertas específicas de materiales de limpieza | Alta | MAT-02, MAT-04 |
| MAT-13 | Perfiles de acceso: gerente vs trabajador | Alta | — |

### Fase 3 — Página y vistas (semanas 5-7)

| Ticket | Nombre | Prioridad | Dependencia |
|--------|--------|-----------|-------------|
| MAT-11 | Página unificada `/saas/vertical/limpieza/materiales` | Crítica | MAT-01..03, MAT-06 |
| MAT-12 | Vista trabajador: material asignado y consumo | Alta | MAT-02, MAT-04 |
| MAT-16 | Conexión con Servicios de limpieza | Media | MAT-04 |

### Fase 4 — Integraciones y mejoras (semanas 8-10)

| Ticket | Nombre | Prioridad | Dependencia |
|--------|--------|-----------|-------------|
| MAT-05 | Consumo de material imputado a cliente | Media | MAT-04 |
| MAT-08 | Sugerencia de compra automática de materiales | Media | MAT-01, CS-06 |
| MAT-09 | Vincular compra de material con gasto financiero | Media | MAT-01, FIN-04/05 |
| MAT-14 | Inventario físico de materiales | Media | MAT-06, MAT-10 |
| MAT-15 | Conexión con Dashboard | Media | MAT-01, MAT-10 |

---

## Diagrama de dependencias

```
CS-01 (warehouse) ─────┬──→ MAT-01 (cleaning_material) ──→ MAT-02 (delivery) ──→ MAT-03 (return)
                        │         │                              │                       │
CS-02 (stock_movement) ─┤         ├──→ MAT-06 (stock ubicación) │                       │
                        │         │                              │                       │
                        │         ├──→ MAT-08 (sugerencia compra)│                       │
                        │         │                              │                       │
                        └─────────┤         MAT-07 (auto descuento stock) ←──────────────┘
                                  │              │
                                  │              ▼
                                  ├──→ MAT-04 (consumo → servicio) ──→ MAT-05 (consumo → cliente)
                                  │              │
                                  │              ├──→ MAT-10 (alertas)
                                  │              │
                                  │              ├──→ MAT-12 (vista trabajador)
                                  │              │
                                  │              └──→ MAT-16 (conexión servicios)
                                  │
                                  ├──→ MAT-09 (compra → finanzas)
                                  │
                                  ├──→ MAT-11 (página unificada) ──→ MAT-13 (permisos)
                                  │
                                  ├──→ MAT-14 (inventario físico)
                                  │
                                  └──→ MAT-15 (dashboard)
```

---

## Notas de diseño

### Patrón de reutilización

Este módulo **NO duplica** el sistema de catálogo/stock core. En su lugar:
- Los materiales de limpieza son `catalog_item` con `subtype: 'cleaning_material'`
- Los movimientos usan `stock_movement` del core (CS-02)
- Los almacenes usan `warehouse` del core (CS-01) con tipos `vehicle` / `worker_kit`
- Los pedidos de compra usan `purchase_order` del core
- Las alertas se añaden al `alertEngine.js` existente

### Diseño visual sugerido

- **Colores del módulo:** azul cielo / celeste (coherente con limpieza/agua)
- **Icono principal:** `Droplets` o `SprayCan` (consistente con sidebar actual)
- **Tarjetas de KPI:** fondo con gradiente suave, número grande, tendencia con flecha
- **Tablas:** bordes redondeados, hover suave, badges de estado con color
- **Semáforo de stock:** Verde (#22c55e) → OK | Amarillo (#eab308) → Bajo mínimo | Rojo (#ef4444) → Agotado | Negro (#1f2937) → Negativo
