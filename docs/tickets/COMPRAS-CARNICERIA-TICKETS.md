# COMPRAS Y ENTRADA DE MERCANCÍA (Carnicería) — Plan de Tickets

**Página:** `/saas/vertical/carniceria/compras`
**Objetivo:** Registrar compras y entradas reales de mercancía en el vertical de carnicería.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona (backend + frontend)

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Pedidos de compra CRUD | Completo | `purchaseOrderController.js`, `purchaseOrderRouter.js` — BD catálogo, `type: 'purchase_order'` |
| Recepción de pedidos (suma stock) | Completo | `markOrderReceived` en `purchaseOrderController.js` — suma `stockQuantity` al `catalog_item` |
| Envío de pedidos (email/WhatsApp/portal) | Completo | `sendPurchaseOrder` en `purchaseOrderController.js` |
| Auto-pedidos (stock bajo) | Completo | `autoOrderService.js` — detecta `stockQuantity < minStock` y crea PO draft cada 2h |
| Previsión de demanda | Completo | `getSalesForecast` — cruza delivery_orders con catálogo (4 semanas) |
| Proveedores CRUD | Completo | `deliveryController.js` — `type: 'supplier'` en BD catálogo |
| Facturas de compra CRUD | Completo | `type: 'purchase_invoice'` — con campos `ocrData`, `ocrImageBase64` |
| OCR de documentos financieros | Completo | `POST /api/ocr/scan` — OpenAI Vision (gpt-4o), extrae JSON |
| Catálogo de productos CRUD | Completo | `type: 'catalog_item'` con `stockQuantity`, `minStock`, `costPrice`, `supplierId` |
| Alertas (stock bajo, facturas vencidas) | Completo | `alertEngine.js` — ciclo cada 1h, alertas `low_stock`, `out_of_stock`, `overdue_purchase` |
| Finanzas (cobros/pagos) | Completo | `financeController.js` — BD `pay`, `type: 'cobro'`/`'pago'` |
| Documentos CRUD | Completo | `documentsController.js` — `type: 'document'` |
| Puntos de venta / Tiendas | Completo | `type: 'point_of_sale'` — CRUD en `deliveryController.js` |
| `PurchaseOrdersPage.tsx` | Completo pero NO registrada en router | `src/app/pages/saas/PurchaseOrdersPage.tsx` — listado, wizard, recepción, envío |
| `RecepcionMaterialModal.tsx` (delivery) | Completo (UI mock) | Wizard 4 pasos: tipo recepción → líneas → validación → confirmación |
| `ComprasInventario.tsx` (config delivery) | Completo (UI config) | Config OCR, clasificación centro coste, stock, método costes |
| API client pedidos de compra | Completo | `src/app/lib/purchaseOrderApi.ts` |

### Páginas de carnicería existentes (NO conectadas al backend)

| Página | Estado | Problema |
|---|---|---|
| `ButcherProducts.tsx` → `/saas/butcher-products` | UI local (useState) | Sin persistencia, no usa `catalog_item` del backend |
| `ButcherOrders.tsx` → `/saas/butcher-orders` | UI local (useState) | Pedidos a cliente, no pedidos de compra; sin backend |
| `ButcherInventory.tsx` → `/saas/butcher-inventory` | UI local (useState) | Stock con lote/caducidad/zona, pero sin persistencia |
| `ButcherSuppliers.tsx` → `/saas/butcher-suppliers` | UI local (useState) | No usa `supplier` del backend |
| `ButcherTraceability.tsx` → `/saas/butcher-traceability` | UI local (useState) | Trazabilidad con lote, sin backend |
| `ButcherSales.tsx` → `/saas/butcher-sales` | UI local (useState) | Ventas locales, sin backend |

### Brechas detectadas para la página de Compras

| # | Brecha | Impacto |
|---|---|---|
| 1 | **No existe la ruta** `/saas/vertical/carniceria/compras` | La página no es accesible |
| 2 | **No existe entidad `lot`** (lote) persistente en CouchDB | Sin trazabilidad de lotes ni caducidad persistente |
| 3 | **No hay campo `warehouseId`/tienda destino** en la compra/recepción | No se sabe dónde va la mercancía |
| 4 | **No se actualiza coste medio** al recibir mercancía | `costPrice` del catálogo no se recalcula |
| 5 | **No se genera lote automáticamente** al dar entrada | Los lotes se manejan solo en `ButcherTraceability` (estado local) |
| 6 | **Las facturas de compra y las recepciones están desconectadas** | Una compra puede no tener factura y nadie lo detecta |
| 7 | **No hay vinculación OCR → entrada de mercancía** | El OCR crea factura pero no crea la entrada de stock |
| 8 | **No hay archivo automático del documento** asociado a la compra | Los documentos no se enlazan a la compra |
| 9 | **No hay alertas específicas** de carnicería para compras | Sin alertas de coste anómalo, lote sin caducidad, mercancía incompleta |
| 10 | **No hay permisos diferenciados** gerente vs trabajador para compras | Cualquiera con acceso puede hacer todo |
| 11 | **No hay conexión compra → finanzas** | Las compras no generan movimientos financieros |
| 12 | **La mercancía no queda "disponible para elaboración"** | No hay concepto de disponibilidad separado (venta vs elaboración/obrador) |

---

## Tickets

---

### CC-01 — Ruta, layout y estructura de la página

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto
La URL `/saas/vertical/carniceria/compras` no existe. Las páginas de carnicería actuales están en `/saas/butcher-*` con estado local. Necesitamos una página nueva, bien estructurada, que sea el hub central de compras para carnicería.

#### Qué hacer

**1. Crear `src/app/pages/saas/ButcherPurchasesPage.tsx`**

Layout de la página con:

- Header con título "Compras y Entrada de Mercancía" + icono `ShoppingCart` + breadcrumb
- Barra de KPIs:
  - Compras del mes (€)
  - Entradas del mes (kg)
  - Coste medio/kg (€/kg)
  - Alertas activas (count)
  - Pedidos pendientes de recibir (count)
  - Último lote generado (código)
- Navegación por pestañas con URL param `?tab=`:

| Tab | Key | Contenido |
|---|---|---|
| Registro de compra | `registro` | Formulario para registrar nueva compra/entrada (CC-05) |
| Historial | `historial` | Listado de compras/entradas con filtros (CC-06) |
| Pedidos a proveedor | `pedidos` | Reusar `PurchaseOrdersPage` como componente embebido |
| Recepciones | `recepciones` | Lista de recepciones de mercancía completadas |
| Lotes | `lotes` | Gestión de lotes activos, caducidades, trazabilidad |
| Facturas compra | `facturas` | Facturas de proveedor con OCR integrado |

- Footer con accesos rápidos: "Nueva compra" (botón principal), "Escanear factura" (OCR), "Ver stock"

**2. Registrar ruta en `routes.tsx`**

```typescript
{ path: 'vertical/carniceria/compras', Component: ButcherPurchasesPage },
```

**3. Actualizar `Sidebar.tsx`**

- En el grupo `butcherShop`, añadir item:

```typescript
{ id: 'butcher-purchases', navKey: 'butcherPurchases', icon: <ShoppingCart className="w-5 h-5" />, path: '/saas/vertical/carniceria/compras' },
```

- Actualizar `itemIds` del grupo:

```typescript
{ id: 'butcherShop', icon: <Beef />, itemIds: ['butcher-purchases', 'butcher-products', 'butcher-orders', 'butcher-inventory', 'butcher-suppliers', 'butcher-traceability', 'butcher-sales'] },
```

**4. Traducciones en `i18n.ts`**

- Añadir clave `nav.butcherPurchases: 'Compras'` en ES
- Añadir clave `nav.butcherPurchases: 'Purchases'` en EN

#### Criterios de aceptación
- [ ] La página carga en `/saas/vertical/carniceria/compras`
- [ ] Aparece en el sidebar del vertical carnicería como primera opción
- [ ] Las pestañas navegan correctamente con `?tab=`
- [ ] KPIs se renderizan con skeleton/placeholder
- [ ] Deep linking funciona: `/saas/vertical/carniceria/compras?tab=lotes` abre la pestaña correcta
- [ ] Responsive: funciona en tablet y móvil
- [ ] Consistente con el design system existente (Layout, dark mode, bordes, tipografía)

---

### CC-02 — Modelo de datos: Entidad `purchase_entry` (entrada de mercancía)

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto
Actualmente `markOrderReceived` en `purchaseOrderController.js` suma stock directamente al `catalog_item` sin crear una entidad de "entrada de mercancía" con sus datos específicos (kg, coste/kg, lote, caducidad, almacén, documento). Para carnicería necesitamos un registro formal de cada entrada con todos los campos de trazabilidad.

#### Qué hacer

**1. Definir documento CouchDB en la BD catálogo (`getCatalogDbName()`)**

```typescript
export interface PurchaseEntry {
  _id: string;                    // purchase_entry:{user_id}:{uuid}
  _rev?: string;
  type: 'purchase_entry';
  user_id: string;

  // Proveedor
  supplierId: string;             // Ref a supplier
  supplierName: string;           // Desnormalizado para listado rápido
  supplierCif?: string;           // CIF del proveedor (para alertas si no identificado)

  // Producto
  catalogItemId: string;          // Ref a catalog_item
  catalogItemName: string;        // Desnormalizado
  catalogItemSku?: string;        // SKU/Referencia

  // Cantidades
  quantityPurchased: number;      // Kg (o unidades) comprados según factura/pedido
  quantityReceived: number;       // Kg (o unidades) realmente recibidos
  unit: 'kg' | 'unidades' | 'litros' | 'cajas'; // Unidad de medida
  isComplete: boolean;            // quantityReceived >= quantityPurchased

  // Costes
  costPerUnit: number;            // Coste por kg (o por unidad)
  totalCost: number;              // Coste total = costPerUnit * quantityReceived
  previousAvgCost?: number;       // Coste medio anterior (snapshot para auditoría)
  newAvgCost?: number;            // Nuevo coste medio calculado

  // Fechas
  entryDate: string;              // Fecha de entrada real de la mercancía (ISO)
  purchaseDate?: string;          // Fecha de la compra/pedido (puede ser anterior a entryDate)

  // Lote y trazabilidad
  lotId?: string;                 // Ref a lot (CC-03)
  lotCode?: string;               // Código de lote desnormalizado
  expirationDate?: string;        // Fecha de caducidad (ISO), obligatorio si aplica al producto
  expirationRequired: boolean;    // true si el producto requiere caducidad (derivado de config)

  // Destino
  warehouseId?: string;           // Ref a warehouse o point_of_sale
  warehouseName?: string;         // "Tienda Centro", "Almacén Frío", "Obrador"
  warehouseType?: 'store' | 'cold_storage' | 'workshop' | 'general';

  // Documento asociado
  invoiceId?: string;             // Ref a purchase_invoice
  invoiceNumber?: string;         // Número de factura desnormalizado
  purchaseOrderId?: string;       // Ref a purchase_order (si viene de un pedido)
  purchaseOrderNumber?: string;   // Número del pedido
  documentIds: string[];          // IDs de documentos asociados (albarán, factura, foto...)
  ocrData?: object;               // Datos extraídos por OCR si aplica

  // Trazabilidad carnicería
  animalType?: 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otro';
  origin?: string;                // Origen/granja
  slaughterhouse?: string;        // Matadero
  healthGuideNumber?: string;     // Nº guía sanitaria
  temperatureOnArrival?: number;  // Temperatura al recibir (°C)

  // Estado
  status: 'draft' | 'confirmed' | 'validated';
  confirmedBy?: string;           // userId de quien confirmó la entrada
  validatedBy?: string;           // userId del gerente que validó
  confirmedAt?: string;
  validatedAt?: string;

  // Meta
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

**2. Crear `buildPurchaseEntryDocument` y `sanitizePurchaseEntry` en `services/couchdb.js`**

- Generar `_id` con formato `purchase_entry:{user_id}:{uuidv4()}`
- Validar campos obligatorios: `supplierId`, `catalogItemId`, `quantityReceived`, `costPerUnit`, `entryDate`
- Calcular `totalCost = costPerUnit * quantityReceived`
- Calcular `isComplete = quantityReceived >= quantityPurchased`
- Si `expirationRequired === true` y no hay `expirationDate`, marcar para alerta
- Añadir `listPurchaseEntriesByUser(req, userId)` con filtro `type: 'purchase_entry'`

**3. Crear `src/app/lib/purchaseEntryApi.ts`**

| Función | Descripción |
|---|---|
| `listPurchaseEntries(userId, filters?)` | Listar entradas con filtros (proveedor, producto, fecha, estado, almacén) |
| `getPurchaseEntry(userId, entryId)` | Obtener una entrada por ID |
| `createPurchaseEntry(userId, data)` | Crear nueva entrada de mercancía |
| `updatePurchaseEntry(userId, entryId, data)` | Actualizar entrada (solo en estado `draft`) |
| `deletePurchaseEntry(userId, entryId)` | Soft-delete |
| `confirmPurchaseEntry(userId, entryId)` | Confirmar entrada (trigger automations) |
| `validatePurchaseEntry(userId, entryId)` | Gerente valida la entrada |
| `getPurchaseEntryStats(userId, dateRange?)` | KPIs: total compras €, total kg, coste medio/kg, entradas mes |

**4. Crear `controllers/purchaseEntryController.js`**

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/purchase-entries/:userId` | GET | Listar entradas (con query params para filtros) |
| `/api/purchase-entries/:userId` | POST | Crear entrada |
| `/api/purchase-entries/:userId/:entryId` | PUT | Actualizar entrada |
| `/api/purchase-entries/:userId/:entryId` | DELETE | Eliminar entrada (soft) |
| `/api/purchase-entries/:userId/:entryId/confirm` | POST | Confirmar entrada (trigger automations) |
| `/api/purchase-entries/:userId/:entryId/validate` | POST | Gerente valida |
| `/api/purchase-entries/:userId/stats` | GET | KPIs y estadísticas |

**5. Crear `routers/purchaseEntryRouter.js`**

- Montar en `index.js` con `requireAuth`
- Registrar bajo `/api/purchase-entries` y `/api/v2/purchase-entries`

#### Criterios de aceptación
- [ ] Documento `purchase_entry` se persiste en la BD catálogo
- [ ] CRUD completo funcional vía API y API client
- [ ] Campos obligatorios se validan en el backend
- [ ] `totalCost` se calcula automáticamente
- [ ] `isComplete` se evalúa comparando cantidad recibida vs comprada
- [ ] Endpoint de stats devuelve KPIs correctos
- [ ] Soft-delete funciona sin romper historial

---

### CC-03 — Modelo de datos: Entidad `lot` (lote con trazabilidad)

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** CC-02

#### Contexto
Los lotes en `ButcherTraceability.tsx` son estado local React. Para cumplir normativa de trazabilidad cárnica y vincular compras con caducidades, necesitamos la entidad `lot` persistente en CouchDB. Un lote agrupa mercancía del mismo producto, proveedor y fecha de entrada, con su caducidad y trazabilidad.

#### Qué hacer

**1. Definir documento CouchDB en la BD catálogo**

```typescript
export interface Lot {
  _id: string;                    // lot:{user_id}:{lotCode}
  _rev?: string;
  type: 'lot';
  user_id: string;

  lotCode: string;                // Código de lote (auto o manual): "LOT-20260414-VAC-001"
  catalogItemId: string;          // Producto asociado
  catalogItemName: string;

  // Trazabilidad
  supplierId: string;
  supplierName: string;
  animalType?: 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otro';
  origin?: string;                // Granja/origen
  slaughterhouse?: string;        // Matadero
  healthGuideNumber?: string;     // Nº guía sanitaria
  slaughterDate?: string;         // Fecha de sacrificio

  // Cantidades
  initialQuantity: number;        // Kg de entrada original
  currentQuantity: number;        // Kg restantes (se descuenta al vender/consumir)
  unit: 'kg' | 'unidades' | 'litros' | 'cajas';

  // Fechas
  entryDate: string;              // Fecha de entrada del lote
  expirationDate?: string;        // Fecha de caducidad
  expirationStatus: 'ok' | 'near_expiry' | 'expired'; // Calculado dinámicamente

  // Ubicación
  warehouseId?: string;
  warehouseName?: string;
  zone?: 'camara_frio' | 'congelador' | 'mostrador' | 'obrador'; // Específico carnicería

  // Vinculación
  purchaseEntryId: string;        // Ref a purchase_entry que originó este lote
  purchaseOrderId?: string;       // Ref a purchase_order si aplica

  // Control
  temperatureOnArrival?: number;  // °C al recibir
  healthStatus: 'conforme' | 'incidencia' | 'retirado';
  healthNotes?: string;

  // Estado
  active: boolean;                // false cuando currentQuantity = 0 o retirado
  status: 'available' | 'reserved' | 'consumed' | 'expired' | 'withdrawn';

  // Meta
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

**2. Generación automática de código de lote**

Formato: `LOT-{YYYYMMDD}-{ANIMAL_CODE}-{SEQ}`

- `YYYYMMDD`: fecha de entrada
- `ANIMAL_CODE`: `VAC` (vacuno), `CER` (cerdo), `POL` (pollo), `COR` (cordero), `ELA` (elaborados), `OTR` (otro)
- `SEQ`: secuencial del día con padding de 3 dígitos (001, 002...)

Ejemplo: `LOT-20260414-VAC-003`

Para generar el secuencial:
- Consultar `lots` del usuario con `entryDate` del mismo día y mismo `animalType`
- `seq = count + 1`

**3. Crear `buildLotDocument` y `sanitizeLot` en `services/couchdb.js`**

- Validaciones: `catalogItemId`, `supplierId`, `entryDate`, `initialQuantity` obligatorios
- Si `expirationDate` proporcionada, calcular `expirationStatus`:
  - `>7 días` → `ok`
  - `≤7 días y >0` → `near_expiry`
  - `≤0 días` → `expired`
- Añadir `listLotsByUser(req, userId)`
- Añadir `getLotsByProduct(req, userId, catalogItemId)`
- Añadir `getActiveLots(req, userId)` — solo `active: true`

**4. Crear `controllers/lotController.js` y `routers/lotRouter.js`**

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/lots/:userId` | GET | Listar lotes (filtros: producto, proveedor, estado, caducidad, almacén) |
| `/api/lots/:userId` | POST | Crear lote |
| `/api/lots/:userId/:lotId` | PUT | Actualizar lote |
| `/api/lots/:userId/:lotId` | DELETE | Retirar/eliminar lote |
| `/api/lots/:userId/:lotId/consume` | POST | Registrar consumo de lote (descuenta `currentQuantity`) |
| `/api/lots/:userId/generate-code` | GET | Generar siguiente código de lote (preview) |
| `/api/lots/:userId/expiring` | GET | Lotes próximos a caducar (próximos 7 días) |

**5. Crear `src/app/lib/lotApi.ts`**

Tipos `Lot`, `LotStatus`, funciones `list/get/create/update/delete/consumeLotRequest`, `generateLotCodeRequest`, `getExpiringLotsRequest`.

**6. Tarea periódica: actualizar `expirationStatus`**

- En `alertEngine.js` o como cron separado, recorrer lotes activos cada 24h y actualizar `expirationStatus`
- Generar alertas para lotes `near_expiry` y `expired`

#### Criterios de aceptación
- [ ] Documento `lot` persiste en BD catálogo
- [ ] Código de lote se genera automáticamente con formato correcto
- [ ] No se repiten códigos de lote para el mismo día/animal
- [ ] `expirationStatus` se calcula correctamente
- [ ] Los lotes se pueden filtrar por producto, estado, caducidad
- [ ] Al consumir de un lote, `currentQuantity` se reduce
- [ ] Cuando `currentQuantity = 0`, el lote pasa a `consumed`

---

### CC-04 — Frontend: Formulario de registro de compra y entrada

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** CC-01, CC-02, CC-03

#### Contexto
El formulario de registro es el corazón de la página. Debe permitir al usuario registrar una compra/entrada de mercancía de forma rápida e intuitiva, con todos los campos necesarios y validaciones en tiempo real.

#### Qué hacer

**1. Crear componente `ButcherPurchaseForm.tsx`**

Diseño: formulario en pasos (wizard) o formulario continuo con secciones colapsables. Recomendación: **formulario continuo con secciones** (más rápido para uso diario que un wizard) pero con opción de "modo rápido" (solo campos esenciales) y "modo completo" (todos los campos).

**Secciones del formulario:**

**A. Proveedor** (sección 1, siempre visible)
- Selector de proveedor (combobox con búsqueda, carga desde `/api/delivery/suppliers/:userId`)
- Si el proveedor no existe: botón "Crear proveedor" que abre modal inline
- Mostrar info rápida del proveedor seleccionado: CIF, teléfono, email
- Badge de estado: "Verificado" / "No verificado" (si falta CIF → alerta CC-12)

**B. Producto** (sección 2)
- Selector de producto (combobox con búsqueda, carga desde `/api/delivery/catalog/:userId`)
- Filtro por categoría: vacuno, cerdo, pollo, cordero, elaborados, otros
- Si el producto no existe: botón "Crear producto" que abre modal inline
- Mostrar info del producto seleccionado: precio actual, stock actual, coste medio actual

**C. Cantidades y costes** (sección 3)
- `Kg comprados` (input numérico, label dinámico según unidad del producto)
- `Kg recibidos` (input numérico, default = kg comprados; si difiere → icono warning con tooltip "Mercancía incompleta")
- `Coste por kg` (input numérico, formato €/kg)
  - Al lado: indicador "↑12% vs coste medio" o "↓5% vs coste medio" con color rojo/verde
  - Si supera el umbral (>20% default, configurable) → warning visual
- `Coste total` (calculado automáticamente: `costPerUnit × quantityReceived`, editable para corrección)
- `Unidad` (selector: kg, unidades, litros, cajas)

**D. Fecha y lote** (sección 4)
- `Fecha de entrada` (date picker, default: hoy)
- `Lote` (campo texto con auto-generación):
  - Botón "Generar automáticamente" (llama a `/api/lots/:userId/generate-code`) → pre-rellena
  - O input manual si el proveedor proporciona lote propio
- `Fecha de caducidad` (date picker):
  - Si el producto requiere caducidad y no se proporciona → warning visual "⚠ Lote sin caducidad"
  - Calcular y mostrar "X días hasta caducidad"
- Campos de trazabilidad carnicería (colapsable, expand si `animalType` del producto está definido):
  - Tipo de animal (select, pre-rellenado del producto)
  - Origen/granja (texto)
  - Matadero (texto)
  - Nº guía sanitaria (texto)
  - Fecha de sacrificio (date)
  - Temperatura al recibir (input numérico °C)

**E. Destino** (sección 5)
- Selector de tienda/almacén:
  - Si existen `point_of_sale` → mostrar como opciones
  - Si no → campo texto libre con opción "Crear punto de venta"
  - Opciones especiales para carnicería: Cámara de frío, Congelador, Mostrador, Obrador
- Nota: si solo hay un punto de venta, pre-seleccionar automáticamente

**F. Documento asociado** (sección 6)
- `Nº Factura` (input texto, opcional — si vacío → alerta "Compra sin factura")
- Selector "Vincular factura existente" (busca en `purchase_invoice` del proveedor)
- Botón "Escanear factura" → abre `SAAS__OcrScanModal` → pre-rellena datos
- Zona de subida de documentos (drag & drop, múltiple):
  - Aceptar: PDF, JPG, PNG
  - Preview inline de la imagen/PDF
  - Cada documento se guarda como `document` y se referencia en `documentIds[]`
- Selector "Vincular a pedido de compra" (busca en `purchase_order` del proveedor con status `sent`/`partial`)

**G. Notas** (sección 7)
- Textarea para observaciones libres

**2. Barra de acciones (sticky bottom)**

- **Guardar borrador** — estado `draft`, no ejecuta automatizaciones
- **Confirmar entrada** — estado `confirmed`, ejecuta automatizaciones (CC-07, CC-08, CC-09)
- **Cancelar** — cierra formulario

**3. Validaciones en tiempo real**

| Campo | Regla | Feedback visual |
|---|---|---|
| Proveedor | Obligatorio | Borde rojo + mensaje |
| Producto | Obligatorio | Borde rojo + mensaje |
| Kg recibidos | > 0 | Borde rojo + mensaje |
| Coste por kg | > 0 | Borde rojo + mensaje |
| Fecha entrada | ≤ hoy | Borde rojo + "Fecha futura no permitida" |
| Caducidad | Si `expirationRequired` → obligatorio | Warning amarillo |
| Factura | Recomendado (no obligatorio) | Warning amarillo discreto |

**4. Modo rápido vs completo**

Toggle en la esquina superior derecha:
- **Modo rápido**: Solo secciones A (proveedor), B (producto), C (cantidades) y botón confirmar
- **Modo completo**: Todas las secciones

#### Criterios de aceptación
- [ ] El formulario carga proveedores y productos del backend
- [ ] Los campos calculados se actualizan en tiempo real
- [ ] El indicador de coste vs media funciona correctamente
- [ ] La generación de lote devuelve un código único
- [ ] El OCR pre-rellena campos al escanear factura
- [ ] Los documentos se pueden subir y previsualizar
- [ ] Las validaciones impiden guardar datos incorrectos
- [ ] El modo rápido/completo funciona y se recuerda la preferencia
- [ ] Funciona en tablet (uso típico en la trastienda de una carnicería)

---

### CC-05 — Frontend: Listado, filtros y dashboard de compras

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CC-01, CC-02

#### Contexto
La pestaña "Historial" de la página necesita mostrar todas las entradas de mercancía registradas, con filtros potentes y visión rápida del estado de las compras.

#### Qué hacer

**1. Componente `ButcherPurchaseList.tsx`**

**Barra de filtros superior:**
- Búsqueda global (producto, proveedor, lote, factura)
- Filtro por proveedor (multi-select)
- Filtro por producto / categoría animal
- Filtro por rango de fechas (date range picker)
- Filtro por estado (draft, confirmed, validated)
- Filtro por almacén/tienda destino
- Filtro por alertas activas (compra sin factura, coste anómalo, etc.)
- Botón "Limpiar filtros"
- Toggle vista: tabla / tarjetas

**Tabla (vista por defecto):**

| Columna | Contenido | Ordenable |
|---|---|---|
| Fecha | `entryDate` formateada | Sí |
| Proveedor | `supplierName` con badge si no verificado | Sí |
| Producto | `catalogItemName` + categoría animal | Sí |
| Kg recibidos | `quantityReceived` + unidad | Sí |
| €/kg | `costPerUnit` + indicador vs media (↑↓) | Sí |
| Total | `totalCost` formateado | Sí |
| Lote | `lotCode` como link a la pestaña lotes | No |
| Caducidad | `expirationDate` con semáforo (verde/amarillo/rojo) | Sí |
| Destino | `warehouseName` | Sí |
| Factura | `invoiceNumber` o badge "Sin factura" | No |
| Estado | Badge `draft`/`confirmed`/`validated` | Sí |
| Acciones | Ver, Editar (si draft), Validar (si gerente), Eliminar | No |

**Vista tarjetas:**
- Tarjeta por entrada con: proveedor, producto, kg, €/kg, total, lote, estado
- Semáforo de alertas en la esquina superior derecha de cada tarjeta

**2. Paginación y rendimiento**

- Paginación server-side (25 por página)
- Skeleton loading
- Caché en memory para la sesión

**3. Acciones en lote**

- Selección múltiple con checkbox
- Acciones: "Validar seleccionados" (gerente), "Exportar seleccionados" (CSV)

**4. Exportación**

- Botón "Exportar" → CSV con todas las columnas
- Nombre del archivo: `compras-carniceria-{YYYY-MM-DD}.csv`

#### Criterios de aceptación
- [ ] Los filtros funcionan correctamente y se combinan entre sí
- [ ] La tabla se ordena por cualquier columna sortable
- [ ] Las dos vistas (tabla/tarjetas) muestran la misma información
- [ ] Las alertas visuales se muestran correctamente
- [ ] La paginación funciona
- [ ] La exportación CSV genera un archivo correcto
- [ ] La acción "Validar" solo aparece para el perfil gerente (CC-13)

---

### CC-06 — Automatización: Sumar stock y disponibilidad

**Tipo:** Backend
**Prioridad:** Crítica
**Dependencias:** CC-02

#### Contexto
Al confirmar una entrada de mercancía, el stock del producto debe incrementarse automáticamente. Además, la mercancía debe quedar disponible para venta (mostrador/TPV) o para elaboración (obrador).

#### Qué hacer

**1. Hook en `confirmPurchaseEntry`**

Al llamar a `POST /api/purchase-entries/:userId/:entryId/confirm`:

```
1. Leer purchase_entry
2. Leer catalog_item (por catalogItemId)
3. Calcular nuevo stock: currentStock + quantityReceived
4. Actualizar catalog_item.stockQuantity = nuevoStock
5. Si warehouseStock[] existe: sumar a la entrada del warehouseId correspondiente
6. Guardar catalog_item con _rev (retry en 409 Conflict)
7. Actualizar purchase_entry.status = 'confirmed'
```

**2. Disponibilidad para elaboración**

- Si el `warehouseType` del destino es `workshop` (obrador):
  - Marcar en el `catalog_item` o en el `lot` que ese stock está destinado a elaboración
  - Añadir campo `availableForSale` y `availableForProcessing` al lote
  - Si destino es `store`/`general` → `availableForSale = quantityReceived`
  - Si destino es `workshop` → `availableForProcessing = quantityReceived`

**3. Crear `stock_movement` si existe el servicio (conexión con CS-02)**

- Si `stockMovementService` existe (de los tickets CS), usarlo:
  ```
  recordMovement({
    movementType: 'purchase_reception',
    catalogItemId,
    warehouseId,
    quantity: quantityReceived,
    unitCost: costPerUnit,
    referenceId: entryId,
    referenceType: 'purchase_entry',
  })
  ```
- Si no existe todavía: actualizar `stockQuantity` directamente (como hace `markOrderReceived` ahora) con TODO para migrar

**4. Idempotencia**

- No sumar stock dos veces si la misma entrada se confirma dos veces
- Verificar que `status` era `draft` antes de confirmar
- Registrar `confirmedAt` para auditoría

#### Criterios de aceptación
- [ ] Al confirmar entrada, `stockQuantity` del `catalog_item` se incrementa
- [ ] Si hay `warehouseStock`, se incrementa el almacén correcto
- [ ] El lote queda marcado como disponible para venta o elaboración según destino
- [ ] No se produce doble suma si se llama dos veces
- [ ] El movimiento de stock queda registrado (si el servicio existe)

---

### CC-07 — Automatización: Actualizar coste medio ponderado

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** CC-02, CC-06

#### Contexto
Actualmente el `costPrice` del `catalog_item` no se actualiza al recibir mercancía. Para una carnicería es fundamental que el coste medio refleje los precios reales de compra para calcular márgenes correctamente.

#### Qué hacer

**1. Recalcular coste medio al confirmar entrada**

Fórmula de media ponderada:

```
nuevoCosteMedio = (stockAnterior × costeAnterior + kgRecibidos × costePorKg) / nuevoStock
```

Ejecutar dentro del flujo de confirmación de CC-06 (mismo transaction):

```javascript
const previousStock = catItem.stockQuantity || 0;
const previousCost = catItem.costPrice || 0;
const newStock = previousStock + entry.quantityReceived;
const newAvgCost = newStock > 0
  ? ((previousStock * previousCost) + (entry.quantityReceived * entry.costPerUnit)) / newStock
  : entry.costPerUnit;

// Guardar en catalog_item
catItem.costPrice = Math.round(newAvgCost * 100) / 100;
catItem.lastPurchaseDate = entry.entryDate;
catItem.lastPurchasePrice = entry.costPerUnit;
catItem.lastSupplierId = entry.supplierId;
catItem.lastSupplierName = entry.supplierName;
```

**2. Registrar snapshot en la `purchase_entry`**

- `previousAvgCost`: coste medio antes de esta entrada
- `newAvgCost`: coste medio después de esta entrada
- Útil para auditoría y para el indicador visual del formulario

**3. Histórico de costes**

Nuevo campo en `catalog_item`:

```typescript
costHistory: Array<{
  date: string;
  cost: number;
  supplierId: string;
  supplierName: string;
  quantity: number;
  entryId: string;
}>;
```

- Añadir entrada al array por cada compra (máximo últimas 50 entradas)
- Útil para gráfico de evolución de costes en el detalle de producto

**4. Detección de coste anómalo (para alertas CC-12)**

Al confirmar entrada, calcular:
```
desviacion = |costPerUnit - costPrice| / costPrice
```

- Si `desviacion > umbralConfigurable` (default: 0.20 = 20%) → flag `costAnomaly: true` en la `purchase_entry`
- Este flag lo usa CC-12 para generar alerta

#### Criterios de aceptación
- [ ] Al confirmar entrada, `catalog_item.costPrice` se recalcula como media ponderada
- [ ] Se guardan `lastPurchaseDate`, `lastPurchasePrice`, `lastSupplierId`
- [ ] El snapshot de coste anterior/nuevo se guarda en la `purchase_entry`
- [ ] El `costHistory` se actualiza (últimas 50 entradas)
- [ ] El coste anómalo se detecta y se marca

---

### CC-08 — Automatización: Generar lote automáticamente

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** CC-02, CC-03, CC-06

#### Contexto
Al confirmar una entrada de mercancía, si no se proporcionó un lote manualmente, el sistema debe generar uno automáticamente con toda la información de trazabilidad.

#### Qué hacer

**1. En el flujo de `confirmPurchaseEntry`, si `lotId` está vacío:**

```
1. Generar código de lote (CC-03, formato LOT-{YYYYMMDD}-{ANIMAL}-{SEQ})
2. Crear documento lot con datos de la purchase_entry:
   - catalogItemId, catalogItemName del entry
   - supplierId, supplierName del entry
   - animalType, origin, slaughterhouse, healthGuideNumber del entry
   - initialQuantity = quantityReceived
   - currentQuantity = quantityReceived
   - entryDate del entry
   - expirationDate del entry (si aplica)
   - warehouseId, warehouseName del entry
   - zone del entry
   - temperatureOnArrival del entry
   - purchaseEntryId = entryId
   - purchaseOrderId del entry (si aplica)
   - status = 'available'
   - healthStatus = 'conforme' (default, editable después)
3. Guardar lot en BD
4. Actualizar purchase_entry.lotId y purchase_entry.lotCode con el lote creado
```

**2. Si `lotId` ya se proporcionó (lote manual):**

- Verificar que el lote existe
- Sumar `quantityReceived` a `lot.currentQuantity`
- Actualizar `lot.updatedAt`

**3. Configuración por producto**

Añadir campo `requiresLot` a `catalog_item` (boolean):
- Si `true`: siempre generar lote (o exigir que se proporcione)
- Si `false`: la generación de lote es opcional
- Default para carnicería: `true` para productos frescos, `false` para elaborados envasados

#### Criterios de aceptación
- [ ] Al confirmar entrada sin lote, se genera uno automáticamente
- [ ] El código de lote sigue el formato y no se repite
- [ ] El lote contiene todos los datos de trazabilidad de la entrada
- [ ] Si se proporciona lote existente, se actualiza la cantidad
- [ ] La configuración `requiresLot` funciona correctamente

---

### CC-09 — Integración OCR: Escaneo y vinculación de factura proveedor

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** CC-02, CC-04

#### Contexto
Ya existe `POST /api/ocr/scan` con OpenAI Vision y `SAAS__OcrScanModal.tsx`. Necesitamos que el OCR de una factura de proveedor pre-rellene el formulario de compra y cree/vincule la factura automáticamente.

#### Qué hacer

**1. Frontend: Integrar OCR en el formulario de compra**

En la sección "Documento asociado" (CC-04, sección F):

- Botón "Escanear factura" → abre `SAAS__OcrScanModal`
- Al recibir resultado OCR:
  - Mapear proveedor: buscar `supplier` por CIF o nombre (fuzzy match)
    - Si encontrado → pre-seleccionar en el combobox de proveedor
    - Si no encontrado → mostrar badge "⚠ Proveedor no identificado" + opción "Crear proveedor"
  - Mapear líneas de producto: para cada línea del OCR, buscar `catalog_item` por nombre/SKU
    - Si hay una sola línea de producto → pre-rellenar secciones B y C
    - Si hay múltiples líneas → crear múltiples `purchase_entry` (una por producto) con botón "Crear entradas por cada línea"
  - Pre-rellenar: coste por kg (o unitario), cantidad, total, fecha factura, número de factura
  - Guardar `ocrData` raw en la `purchase_entry` para auditoría

**2. Backend: Crear `purchase_invoice` automáticamente**

Al confirmar la entrada con datos OCR:
- Si no existe `invoiceId`:
  - Crear `purchase_invoice` con los datos del OCR
  - Vincular: `purchaseEntry.invoiceId = purchaseInvoice._id`
- Si ya existe `invoiceId`:
  - Actualizar la factura existente con datos OCR si están vacíos

**3. Backend: Archivar documento (imagen/PDF del escaneo)**

- El archivo escaneado (imagen base64 del OCR) se guarda como `document`:
  - `type: 'document'`
  - `category: 'purchase_invoice'`
  - `linkedEntryId: purchaseEntry._id`
  - `linkedInvoiceId: purchaseInvoice._id`
- El `documentId` se añade a `purchaseEntry.documentIds[]`

**4. Flujo completo OCR → Entrada**

```
[Escanear factura] → [OCR extrae datos] → [Match proveedor]
    → [Match productos] → [Pre-rellena formulario]
    → [Usuario valida/corrige] → [Confirmar entrada]
    → [Crea purchase_entry] → [Crea lot] → [Suma stock]
    → [Crea purchase_invoice] → [Archiva documento]
    → [Genera alertas si aplica]
```

#### Criterios de aceptación
- [ ] El OCR pre-rellena correctamente los campos del formulario
- [ ] El match de proveedor funciona por CIF y por nombre (fuzzy)
- [ ] El match de producto funciona por nombre y SKU
- [ ] Si múltiples líneas OCR, se permite crear entradas por lote
- [ ] La factura se crea automáticamente si no existía
- [ ] El documento escaneado se archiva y se vincula
- [ ] El flujo completo funciona end-to-end

---

### CC-10 — Automatización: Archivar documento asociado

**Tipo:** Backend
**Prioridad:** Media
**Dependencias:** CC-02

#### Contexto
Los documentos asociados a una compra (albarán, factura, foto de la mercancía, guía sanitaria) deben archivarse automáticamente vinculados a la entrada de mercancía.

#### Qué hacer

**1. Al subir documento en el formulario (CC-04, sección F):**

- Crear documento `type: 'document'` en la BD de documentos:
  ```javascript
  {
    type: 'document',
    user_id: userId,
    name: filename,
    category: 'purchase_document', // Nueva categoría
    subcategory: subtype,          // 'albaran', 'factura', 'foto_mercancia', 'guia_sanitaria'
    linkedTo: {
      type: 'purchase_entry',
      id: purchaseEntryId,
    },
    fileData: base64Content,       // O URL si se usa almacenamiento externo
    mimeType: 'application/pdf',   // o 'image/jpeg', etc.
    createdAt: now,
  }
  ```
- Añadir el `_id` del documento a `purchaseEntry.documentIds[]`

**2. Al confirmar entrada, vincular automáticamente:**

- Si hay `invoiceId`: crear link bidireccional factura ↔ entrada
- Si hay `purchaseOrderId`: crear link bidireccional pedido ↔ entrada

**3. Endpoint para consultar documentos de una entrada:**

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/purchase-entries/:userId/:entryId/documents` | GET | Listar documentos de una entrada |
| `/api/purchase-entries/:userId/:entryId/documents` | POST | Subir documento a la entrada |
| `/api/purchase-entries/:userId/:entryId/documents/:docId` | DELETE | Desvincular documento |

**4. Visualización en el listado (CC-05)**

- Icono 📎 con count de documentos en la columna "Factura"
- Click abre panel lateral con previews de documentos

#### Criterios de aceptación
- [ ] Los documentos se guardan con categoría `purchase_document`
- [ ] La vinculación bidireccional funciona (documento → entrada, entrada → documento)
- [ ] Se pueden subir múltiples documentos por entrada
- [ ] Los documentos se pueden previsualizar
- [ ] Al eliminar una entrada (soft), los documentos no se eliminan (son independientes)

---

### CC-11 — Alertas específicas de compras carnicería

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** CC-02, CC-03, CC-07

#### Contexto
El `alertEngine.js` ya tiene alertas genéricas (`low_stock`, `out_of_stock`, facturas vencidas). Necesitamos alertas específicas para el flujo de compras de carnicería.

#### Qué hacer

**1. Alerta: Compra sin factura**

```javascript
{
  name: 'purchase_no_invoice',
  category: 'purchase',
  level: 'warning',
  logic: `purchase_entry con status 'confirmed' y sin invoiceId, 
          creadas hace más de 48 horas`,
  message: 'Compra de {supplierName} ({entryDate}) sin factura asociada',
  link: '/saas/vertical/carniceria/compras?tab=historial&entryId={id}',
}
```

**2. Alerta: Coste superior al habitual**

```javascript
{
  name: 'purchase_cost_anomaly',
  category: 'purchase',
  level: 'warning',
  logic: `purchase_entry con costAnomaly: true (desviación > 20% sobre coste medio)`,
  message: 'Coste de {catalogItemName} de {supplierName}: {costPerUnit}€/kg (+{desviacion}% sobre media de {avgCost}€/kg)',
  link: '/saas/vertical/carniceria/compras?tab=historial&entryId={id}',
}
```

Configuración: `alertConfig.costAnomalyThreshold` (number, default: 0.20)

**3. Alerta: Mercancía incompleta**

```javascript
{
  name: 'purchase_incomplete_delivery',
  category: 'purchase',
  level: 'warning',
  logic: `purchase_entry con isComplete: false (quantityReceived < quantityPurchased)`,
  message: 'Entrega incompleta de {supplierName}: recibidos {quantityReceived}kg de {quantityPurchased}kg pedidos ({catalogItemName})',
  link: '/saas/vertical/carniceria/compras?tab=historial&entryId={id}',
}
```

**4. Alerta: Lote sin caducidad**

```javascript
{
  name: 'lot_no_expiration',
  category: 'traceability',
  level: 'critical',
  logic: `purchase_entry con expirationRequired: true y sin expirationDate,
          o lot con expirationDate vacío y producto que requiere caducidad`,
  message: 'Lote {lotCode} de {catalogItemName} sin fecha de caducidad',
  link: '/saas/vertical/carniceria/compras?tab=lotes&lotId={lotId}',
}
```

**5. Alerta: Proveedor no identificado**

```javascript
{
  name: 'purchase_unknown_supplier',
  category: 'purchase',
  level: 'warning',
  logic: `purchase_entry con supplierCif vacío o supplier con CIF vacío/inválido`,
  message: 'Proveedor "{supplierName}" sin CIF verificado en compra del {entryDate}',
  link: '/saas/vertical/carniceria/compras?tab=historial&entryId={id}',
}
```

**6. Implementar en `alertEngine.js`**

- Añadir función `checkPurchaseEntryAlerts(req, userId)` que ejecute las 5 reglas
- Llamar desde el ciclo principal del `alertEngine` (cada 1h)
- Las alertas 2 (coste anómalo) y 3 (mercancía incompleta) también se deben emitir en **tiempo real** al confirmar la entrada (no esperar 1h)

**7. Configuración por cuenta**

Añadir a `account.alertConfig`:

```typescript
purchaseAlerts: {
  noInvoiceEnabled: boolean;          // default: true
  noInvoiceGraceHours: number;        // default: 48
  costAnomalyEnabled: boolean;        // default: true
  costAnomalyThreshold: number;       // default: 0.20 (20%)
  incompleteDeliveryEnabled: boolean; // default: true
  lotNoExpirationEnabled: boolean;    // default: true
  unknownSupplierEnabled: boolean;    // default: true
}
```

**8. Frontend: Mostrar alertas en la página de compras**

- En el KPI header de CC-01: badge rojo con count de alertas activas
- En la pestaña historial (CC-05): icono de alerta en la fila correspondiente con tooltip descriptivo
- Panel de alertas lateral (drawer) accesible desde el badge del header

#### Criterios de aceptación
- [ ] Las 5 alertas se generan correctamente en el ciclo periódico
- [ ] Las alertas de coste anómalo y mercancía incompleta se emiten al confirmar
- [ ] Cada alerta lleva al registro correcto
- [ ] Las alertas son configurables por cuenta
- [ ] Las alertas se deduplican (una por entrada por día)
- [ ] Las alertas se muestran correctamente en la UI

---

### CC-12 — Conexiones con módulos existentes

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** CC-02, CC-03, CC-06, CC-07

#### Contexto
La página de compras debe integrarse con los módulos existentes: Proveedores, Facturas proveedor, OCR, Stock, Finanzas y Documentación. Algunas conexiones se cubren en otros tickets; aquí se detallan las que faltan.

#### Qué hacer

**1. Conexión Proveedores ↔ Compras**

- En la página de proveedores (`SuppliersPage.tsx` / `ButcherSuppliers.tsx`):
  - Añadir tab/sección "Historial de compras" por proveedor
  - Endpoint `GET /api/purchase-entries/:userId?supplierId={id}` (ya cubierto por filtros de CC-02)
  - Mostrar: total compras €, total kg, nº entradas, último coste medio, evolución de precios
- En el formulario de compra:
  - Al seleccionar proveedor, mostrar "Última compra: hace X días, Y€/kg"

**2. Conexión Facturas proveedor ↔ Compras**

- En `SupplierBillingPage.tsx`:
  - Por cada factura, mostrar "Entradas vinculadas" con links a la pestaña historial
  - Si la factura no tiene entradas vinculadas → badge "Sin recepción"
- En la entrada de compra:
  - Al vincular factura, validar que los totales coincidan (± margen configurable)
  - Si no coinciden → warning "Diferencia de X€ entre factura y entrada"

**3. Conexión Stock ↔ Compras**

Ya cubierto en CC-06 (sumar stock) y CC-08 (generar lote). Adicionalmente:
- En `ButcherInventory.tsx` / `ArticlesPage.tsx`:
  - Por cada producto, link "Ver compras" que navega a `?tab=historial&catalogItemId={id}`
  - Mostrar en el detalle del producto: "Última compra", "Coste medio ponderado", "Historial de costes" (gráfico)

**4. Conexión Finanzas ↔ Compras**

Al confirmar una entrada con factura:
- Crear movimiento financiero automáticamente:
  ```javascript
  {
    type: 'pago',
    concept: `Compra ${supplierName} - ${catalogItemName} (${quantityReceived}${unit})`,
    amount: totalCost,
    category: 'compras_mercancia',
    referenceId: purchaseEntry._id,
    referenceType: 'purchase_entry',
    date: entryDate,
  }
  ```
- Configurable: `account.financeConfig.autoCreatePurchasePayments` (boolean, default: `false`)
- Si `true`: crear movimiento automático
- Si `false`: solo mostrar sugerencia "¿Registrar pago de X€ en Finanzas?"

**5. Conexión Documentación ↔ Compras**

Ya cubierto en CC-10. Adicionalmente:
- En `DocumentsPage.tsx`:
  - Filtro por categoría `purchase_document`
  - Mostrar link a la entrada de compra vinculada

**6. Links cruzados en la UI**

| Desde | Link | Destino |
|---|---|---|
| Compra (historial) | "Ver proveedor" | `/saas/butcher-suppliers?id={supplierId}` |
| Compra (historial) | "Ver factura" | `SupplierBillingPage` con factura seleccionada |
| Compra (historial) | "Ver lote" | `?tab=lotes&lotId={lotId}` |
| Compra (historial) | "Ver en stock" | `/saas/butcher-inventory?product={catalogItemId}` |
| Proveedor (detalle) | "Ver compras" | `?tab=historial&supplierId={id}` |
| Factura (detalle) | "Ver entrada" | `?tab=historial&entryId={id}` |
| Stock (producto) | "Ver compras" | `?tab=historial&catalogItemId={id}` |
| Lote (detalle) | "Ver entrada" | `?tab=historial&entryId={purchaseEntryId}` |

#### Criterios de aceptación
- [ ] El historial de compras por proveedor muestra datos reales
- [ ] Las facturas se vinculan bidireccionalmente con entradas
- [ ] La validación factura vs entrada funciona (± margen)
- [ ] El movimiento financiero se crea correctamente (si configurado)
- [ ] Los documentos se filtran por categoría `purchase_document`
- [ ] Los links cruzados navegan correctamente

---

### CC-13 — Permisos: Perfil gerente y perfil trabajador

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** CC-01, CC-02

#### Contexto
La página tiene dos perfiles de uso:
- **Gerente**: Registra y valida compras, configura alertas, ve todo
- **Trabajador**: Registra entrada o recepción si tiene permiso, no puede validar ni ver costes

El sistema ya tiene permisos de equipo (`TEAM_PERMISSION_KEYS` en `couchdb.js`) y lógica de roles (`isAdmin`, `permissions[]`).

#### Qué hacer

**1. Añadir permiso `purchases` a `TEAM_PERMISSION_KEYS`**

En `services/couchdb.js`, añadir a la lista:

```javascript
'purchases'  // Acceso a Compras y entrada de mercancía
```

**2. Sub-permisos para compras**

Definir granularidad en la configuración del miembro de equipo:

```typescript
purchases: {
  canRegisterEntry: boolean;     // Registrar entrada de mercancía
  canConfirmEntry: boolean;      // Confirmar entrada (trigger automatizaciones)
  canValidateEntry: boolean;     // Validar entrada (solo gerente)
  canViewCosts: boolean;         // Ver costes (€/kg, totales, coste medio)
  canManageLots: boolean;        // Gestionar lotes (crear, editar, retirar)
  canViewHistory: boolean;       // Ver historial completo de compras
  canExport: boolean;            // Exportar datos
  canConfigureAlerts: boolean;   // Configurar umbrales de alertas
}
```

**3. Perfil gerente (default para admin)**

```typescript
purchases: {
  canRegisterEntry: true,
  canConfirmEntry: true,
  canValidateEntry: true,
  canViewCosts: true,
  canManageLots: true,
  canViewHistory: true,
  canExport: true,
  canConfigureAlerts: true,
}
```

**4. Perfil trabajador (default sugerido)**

```typescript
purchases: {
  canRegisterEntry: true,        // Puede registrar
  canConfirmEntry: true,         // Puede confirmar
  canValidateEntry: false,       // NO puede validar
  canViewCosts: false,           // NO ve costes (€/kg se oculta o se muestra como ***)
  canManageLots: false,          // NO gestiona lotes
  canViewHistory: false,         // NO ve historial completo (solo sus propias entradas)
  canExport: false,
  canConfigureAlerts: false,
}
```

**5. Frontend: Aplicar permisos**

| Elemento | Permiso | Comportamiento si NO tiene permiso |
|---|---|---|
| Pestaña "Registro" | `canRegisterEntry` | Pestaña oculta |
| Botón "Confirmar entrada" | `canConfirmEntry` | Botón deshabilitado + tooltip "Sin permiso" |
| Botón "Validar" en historial | `canValidateEntry` | No aparece |
| Columnas €/kg, Total, Coste medio | `canViewCosts` | Se muestran como "***" o se ocultan |
| Pestaña "Lotes" | `canManageLots` | Pestaña oculta |
| Pestaña "Historial" (completo) | `canViewHistory` | Solo muestra entradas del propio trabajador |
| Botón "Exportar" | `canExport` | No aparece |
| KPIs de costes en header | `canViewCosts` | Se ocultan, solo se muestra count de entradas |
| Pestaña "Facturas" | `canViewCosts` | Pestaña oculta |
| Config alertas | `canConfigureAlerts` | No aparece |

**6. Backend: Validar permisos en endpoints**

En el middleware de cada endpoint de `purchaseEntryController.js`:
- `POST /confirm`: verificar `canConfirmEntry`
- `POST /validate`: verificar `canValidateEntry`
- `GET / (stats)`: si no `canViewCosts`, omitir campos de coste en la respuesta
- Filtrar por `performedBy` si no `canViewHistory`

#### Criterios de aceptación
- [ ] El permiso `purchases` se puede asignar a miembros de equipo
- [ ] Los sub-permisos se pueden configurar por miembro
- [ ] La UI oculta/deshabilita elementos según permisos
- [ ] Los costes no se envían al frontend si el usuario no tiene permiso
- [ ] El trabajador solo ve sus propias entradas si no tiene `canViewHistory`
- [ ] El endpoint de validación rechaza si no es gerente

---

### CC-14 — Frontend: Pestaña Lotes con trazabilidad

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CC-01, CC-03

#### Contexto
La pestaña "Lotes" de la página debe permitir gestionar los lotes activos, ver caducidades, y tener trazabilidad completa (sustituyendo la funcionalidad local de `ButcherTraceability.tsx`).

#### Qué hacer

**1. Componente `ButcherLotsTab.tsx`**

**Barra de KPIs:**
- Lotes activos (count)
- Próximos a caducar (≤7 días)
- Caducados
- Kg totales en lotes activos

**Barra de filtros:**
- Búsqueda por código de lote, producto, proveedor
- Filtro por estado: `available`, `reserved`, `consumed`, `expired`, `withdrawn`
- Filtro por tipo de animal
- Filtro por almacén/zona
- Filtro por caducidad: todos, próximos a caducar, caducados
- Filtro por estado sanitario: conforme, incidencia, retirado

**Tabla de lotes:**

| Columna | Contenido |
|---|---|
| Lote | `lotCode` (clickable, abre detalle) |
| Producto | `catalogItemName` + badge categoría animal |
| Proveedor | `supplierName` |
| Entrada | `entryDate` formateada |
| Caducidad | `expirationDate` con semáforo + countdown "en X días" |
| Cantidad | `currentQuantity` / `initialQuantity` + barra de progreso |
| Zona | `zone` con icono (❄ frío, 🧊 congelador, 🥩 mostrador, 👨‍🍳 obrador) |
| Sanitario | Badge `conforme`/`incidencia`/`retirado` |
| Estado | Badge `available`/`consumed`/`expired`/`withdrawn` |
| Acciones | Ver detalle, Registrar consumo, Retirar |

**2. Detalle de lote (modal o panel lateral)**

- Toda la info del lote
- Historial: entrada original, consumos, ajustes
- Documentos asociados (del purchase_entry vinculado)
- Botón "Registrar consumo" → input kg consumidos
- Botón "Retirar lote" → motivo obligatorio
- Botón "Cambiar estado sanitario" → select con motivo

**3. Vista calendario de caducidades**

- Vista alternativa: calendario mensual con lotes por día de caducidad
- Días con lotes próximos a caducar: fondo amarillo
- Días con lotes caducados: fondo rojo
- Click en día → lista de lotes que caducan ese día

**4. Exportación**

- CSV con todos los campos del lote
- PDF de etiqueta de lote (para imprimir): código, producto, proveedor, fecha entrada, caducidad, origen, guía sanitaria

#### Criterios de aceptación
- [ ] Los lotes se cargan del backend con filtros funcionales
- [ ] El semáforo de caducidad funciona correctamente
- [ ] La barra de progreso de cantidad es visual y precisa
- [ ] El detalle de lote muestra toda la información
- [ ] Se puede registrar consumo y el `currentQuantity` se actualiza
- [ ] Se puede retirar un lote con motivo
- [ ] La vista calendario muestra caducidades correctamente
- [ ] La exportación CSV y PDF funciona

---

## Resumen y orden de ejecución

### Fase 1 — Fundamentos (semana 1-2)

| Ticket | Nombre | Prioridad | Esfuerzo estimado |
|---|---|---|---|
| CC-01 | Ruta, layout y estructura de la página | Crítica | 1-2 días |
| CC-02 | Modelo de datos `purchase_entry` | Crítica | 2-3 días |
| CC-03 | Modelo de datos `lot` | Alta | 2 días |
| CC-13 | Permisos gerente vs trabajador | Alta | 1 día |

### Fase 2 — Core funcional (semana 3-4)

| Ticket | Nombre | Prioridad | Esfuerzo estimado |
|---|---|---|---|
| CC-04 | Frontend: Formulario de registro de compra | Crítica | 3-4 días |
| CC-05 | Frontend: Listado, filtros y dashboard | Alta | 2-3 días |
| CC-06 | Automatización: Sumar stock | Crítica | 1-2 días |
| CC-07 | Automatización: Coste medio ponderado | Alta | 1 día |

### Fase 3 — Automatizaciones y trazabilidad (semana 5-6)

| Ticket | Nombre | Prioridad | Esfuerzo estimado |
|---|---|---|---|
| CC-08 | Automatización: Generar lote | Alta | 1-2 días |
| CC-09 | Integración OCR | Alta | 2-3 días |
| CC-10 | Archivar documentos | Media | 1-2 días |
| CC-14 | Frontend: Pestaña Lotes con trazabilidad | Alta | 2-3 días |

### Fase 4 — Alertas y conexiones (semana 7-8)

| Ticket | Nombre | Prioridad | Esfuerzo estimado |
|---|---|---|---|
| CC-11 | Alertas específicas de compras | Alta | 2 días |
| CC-12 | Conexiones con módulos existentes | Media | 3-4 días |

### Dependencias visuales

```
CC-01 (página base)
  ├── CC-04 (formulario) ← CC-02 (modelo entry) + CC-03 (modelo lot)
  ├── CC-05 (listado) ← CC-02
  ├── CC-14 (lotes) ← CC-03
  └── CC-13 (permisos)

CC-06 (sumar stock) ← CC-02
CC-07 (coste medio) ← CC-02 + CC-06
CC-08 (generar lote) ← CC-02 + CC-03 + CC-06
CC-09 (OCR) ← CC-02 + CC-04
CC-10 (documentos) ← CC-02
CC-11 (alertas) ← CC-02 + CC-03 + CC-07
CC-12 (conexiones) ← CC-02 + CC-03 + CC-06 + CC-07
```

### Relación con tickets existentes (COMPRAS-STOCK-TICKETS.md)

| Ticket CC | Relacionado con CS | Nota |
|---|---|---|
| CC-02 (purchase_entry) | CS-02 (stock_movement) | CC-02 usa `stock_movement` si existe, sino actualiza stock directamente |
| CC-03 (lot) | CS-02 | Los lotes se vinculan a movimientos de stock |
| CC-06 (sumar stock) | CS-11 (refactorizar recepción) | CC-06 es la implementación específica para carnicería de la recepción |
| CC-07 (coste medio) | CS-12 (coste medio en recepción) | CC-07 implementa el mismo concepto para `purchase_entry` |
| CC-12 (conexión finanzas) | CS-13 (conexión finanzas) | Reusan el mismo mecanismo |
| CC-13 (permisos) | — | Nuevo, específico para esta página |
| CC-14 (lotes) | CS-16 (verticales) | Implementación específica del vertical carnicería |
