# STOCK AUTOMÁTICO Y RECETAS — Diseño de Tickets

**Página:** `/saas/vertical/delivery/stock`  
**Objetivo:** Descontar ingredientes y consumibles automáticamente con cada venta, usando recetas como nexo entre productos vendidos y stock real.

---

## Estado actual del sistema

### Ya implementado (backend)

- **Catálogo** (`catalog_item`): CRUD completo con `stockQuantity`, `minStock`, `reorderQuantity`, `autoReorder`, `supplierId`, `articles[]` (composición BOM ligera: `articleId`, `articleName`, `quantity`, `unit` — sin merma, sin rendimiento, sin costes).
- **Proveedores** (`supplier`): CRUD completo.
- **Pedidos de compra** (`purchase_order`): CRUD, estados, recepción parcial/total que suma stock.
- **Alertas**: Motor `alertEngine.js` con `low_stock`, `out_of_stock`, facturas vencidas (ciclo 1h).
- **Auto-pedido**: `autoOrderService.js` detecta `stockQuantity < minStock` + `autoReorder`, crea PO draft cada 2h.
- **Previsión de demanda**: `getSalesForecast` cruza delivery orders con catálogo.
- **SSE / Push**: Infraestructura de notificaciones en tiempo real.
- **Centros de trabajo**: `WorkCenter` con `centerType` (oficina, punto_de_venta, almacén).

### Ya implementado (frontend)

- **`/saas/costing`** (`CostingPage.tsx`): Escandallo completo con `Recipe`, `RecipeIngredient` (incluye merma %). **Persiste en `localStorage`**, no en CouchDB. No conecta con ventas ni descuenta stock.
- **`/saas/articles`** (`ArticlesPage`): Vista de stock con KPIs y ajuste manual.
- **`/saas/catalog`** (`CatalogPage`): Gestión del catálogo de venta.
- **`/saas/delivery-catalog`** (`DeliveryCatalog`): Todo-en-uno catálogo delivery.
- **`src-delivery/`** (prototipos no integrados):
  - `DemoEscandallo.tsx` + `DetalleEscandallo.tsx` + `CrearEscandalloWizard.tsx`: UI de escandallo con datos mock.
  - `AjusteStockModal.tsx`: Ajuste de stock por ubicación con motivo — usa datos mock.
  - `TransferirStockModal.tsx`: Transferencia entre almacenes — usa datos mock.
  - `MermaPorPDVModal.tsx`: Gráfico de merma por punto de venta — usa datos mock (Recharts).
  - `DetalleArticulo.tsx` / `DetalleArticuloRediseñado.tsx`: Ficha de artículo con secciones de stock.
  - `ComprasInventario.tsx`: Panel de configuración compras/inventario.

### Dependencias con tickets existentes (COMPRAS-STOCK-TICKETS.md)

| Ticket CS | Relación con esta página |
|-----------|--------------------------|
| CS-01 (Warehouse) | Stock por sede/almacén → esta página consume almacenes |
| CS-02 (Stock Movement / Kardex) | Historial de movimientos → esta página lo visualiza y lo alimenta via recetas |
| CS-03 (Multi-almacén catálogo) | Stock desglosado por almacén → esta página lee ese desglose |
| CS-04 (Venta resta stock) | Descuento de stock al vender → esta página lo extiende con descuento por receta |
| CS-05 (Consumo interno) | Mermas y consumo → esta página amplía con mermas formales |
| CS-08 (Alerta stock negativo) | Alertas → esta página añade alertas específicas de recetas |
| CS-10 (Página unificada) | Compras y Stock Core → esta página es el módulo "delivery" que se conecta |

### Brechas detectadas

1. **No existe entidad `recipe` en CouchDB** — Solo `localStorage` en `CostingPage` y `articles[]` sin semántica de receta.
2. **No hay descuento por receta al vender** — CS-04 descuenta el producto vendido, pero no sus ingredientes.
3. **No hay categorías de stock diferenciadas** — Ingredientes, bebidas, envases, limpieza y consumibles se mezclan.
4. **No hay merma como proceso formal** — Solo hay el campo `waste` (%) en `CostingPage` (localStorage) y textos en prototipos.
5. **No hay reconciliación stock teórico vs real** — El inventario físico no se compara con el esperado.
6. **No hay alerta "merma alta"** ni "producto crítico para hoy".
7. **No hay perfiles diferenciados** — No existe vista gerente vs trabajador para stock/recetas.
8. **No hay cálculo de stock teórico** — Cuánto debería haber según ventas y compras vs cuánto hay realmente.
9. **No existe la ruta `/saas/vertical/delivery/stock`** — No hay página ni vertical delivery registrado en routes.tsx.

---

## TICKETS

---

### TICKET STK-01: Modelo de datos — Entidad `recipe` (Receta / Escandallo)

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna  

**Descripción:**  
Crear la entidad `recipe` en CouchDB como documento de primer nivel, sustituyendo el almacenamiento en `localStorage` actual y el array `articles[]` del `catalog_item` (que es insuficiente al carecer de merma, rendimiento, costes y categoría).

Una receta vincula un producto del catálogo con N artículos/ingredientes, definiendo la cantidad exacta que se consume de cada uno al producir/vender una unidad de ese producto.

**Tareas:**

1. **Crear `buildRecipeDocument` en `services/couchdb.js`:**
   - `type: 'recipe'`
   - Campos:
     - `_id`, `_rev`, `user_id`
     - `name` — Nombre de la receta (ej: "Hamburguesa Clásica")
     - `catalogItemId` — Ref al producto vendido (`catalog_item`) que dispara esta receta
     - `catalogItemName` — Denormalizado para consulta
     - `category` — Categoría de la receta (ej: "Platos principales", "Postres", "Bebidas preparadas")
     - `portions` — Número de raciones/unidades que produce la receta (default 1)
     - `active` — Boolean (default true)
     - `ingredients[]` — Array de ingredientes:
       - `catalogItemId` — Ref al artículo/ingrediente en catálogo
       - `catalogItemName` — Denormalizado
       - `quantity` — Cantidad bruta necesaria por receta completa
       - `unit` — Unidad de medida (kg, g, L, ml, ud, etc.)
       - `wastePercent` — % de merma técnica (ej: 10% = se pierde un 10% al preparar)
       - `netQuantity` — Cantidad neta aprovechable (calculado: `quantity * (1 - wastePercent/100)`)
       - `costPerUnit` — Coste unitario del ingrediente
       - `totalCost` — Coste total de esta línea (calculado: `quantity * costPerUnit`)
       - `stockCategory` — Categoría del ingrediente: `ingredient` | `beverage` | `packaging` | `cleaning` | `consumable` | `other`
       - `optional` — Boolean: si es true, no bloquea la venta si falta stock
       - `substitutes[]` — Array de `{ catalogItemId, catalogItemName, conversionFactor }` para sustitutos
     - `totalCost` — Coste total de la receta (suma de `ingredients[].totalCost`)
     - `costPerPortion` — Coste por ración (`totalCost / portions`)
     - `notes` — Notas de preparación
     - `preparationTime` — Minutos estimados de preparación
     - `tags[]` — Etiquetas libres
     - `createdAt`, `updatedAt`
   - Función `sanitizeRecipe` con validación:
     - `catalogItemId` obligatorio
     - Al menos 1 ingrediente con `catalogItemId` y `quantity > 0`
     - `portions >= 1`
     - `wastePercent` entre 0 y 100

2. **CRUD en controlador (`controllers/recipeController.js`):**
   - `listRecipes(userId, filters?)` — Listar recetas con filtro por categoría, producto, activa/inactiva
   - `getRecipe(userId, recipeId)` — Detalle de receta con costes calculados
   - `createRecipe(userId, data)` — Crear receta
   - `updateRecipe(userId, recipeId, data)` — Actualizar receta
   - `deleteRecipe(userId, recipeId)` — Soft delete (`active: false`)
   - `duplicateRecipe(userId, recipeId)` — Clonar receta con nuevo nombre
   - `getRecipeByCatalogItem(userId, catalogItemId)` — Obtener receta(s) de un producto vendido
   - `recalculateCosts(userId, recipeId?)` — Recalcular costes con precios actuales del catálogo
   - Validación: no permitir recetas circulares (producto A usa B que usa A)

3. **Router (`routers/recipeRouter.js`):**
   - `GET    /api/recipes/:userId` — Listar
   - `GET    /api/recipes/:userId/:recipeId` — Detalle
   - `POST   /api/recipes/:userId` — Crear
   - `PUT    /api/recipes/:userId/:recipeId` — Actualizar
   - `DELETE /api/recipes/:userId/:recipeId` — Eliminar (soft)
   - `POST   /api/recipes/:userId/:recipeId/duplicate` — Duplicar
   - `GET    /api/recipes/:userId/by-product/:catalogItemId` — Receta(s) por producto
   - `POST   /api/recipes/:userId/recalculate-costs` — Recalcular todos los costes
   - Montar en `index.js` con `requireAuth`

4. **Cliente TypeScript (`src/app/lib/recipeApi.ts`):**
   - Tipos: `Recipe`, `RecipeIngredient`, `StockCategory`
   - Funciones: `listRecipes`, `getRecipe`, `createRecipe`, `updateRecipe`, `deleteRecipe`, `duplicateRecipe`, `getRecipeByProduct`, `recalculateCosts`

5. **Migración de datos existentes:**
   - Script para importar recetas de `localStorage` (CostingPage) a CouchDB:
     - Leer `saas-costing-recipes` del frontend y enviar al API
     - Mapear `RecipeIngredient.catalogItemId` al `catalog_item` correspondiente
   - Para `catalog_item.articles[]` existentes:
     - Crear receta automática si el item tiene `articles.length > 0`
     - Transferir `articleId → catalogItemId`, `quantity`, `unit`
     - Marcar con `tags: ['migrada-desde-articles']`

**Criterios de aceptación:**
- CRUD funcional vía API con validación completa
- Las recetas vinculan producto vendido ↔ ingredientes con cantidades, merma y costes
- Se pueden buscar recetas por producto vendido (para la automatización de descuento)
- Los costes se recalculan con precios actuales del catálogo
- Los datos existentes se migran sin pérdida

---

### TICKET STK-02: Categorización de artículos de stock

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Añadir un sistema de categorías específicas para artículos que se gestionan como stock (ingredientes, bebidas, envases, limpieza, consumibles), diferenciándolos de los productos de venta. Esto permite filtrar, alertar y reportar por tipo de artículo de stock.

**Tareas:**

1. **Ampliar `catalog_item` con campo `stockCategory`:**
   - Nuevo campo: `stockCategory` — enum:
     - `ingredient` — Ingrediente (harina, carne, verdura, especias...)
     - `beverage` — Bebida (refrescos, cervezas, vinos, zumos, agua...)
     - `packaging` — Envase/embalaje (cajas, bolsas, film, vasos, tapas...)
     - `cleaning` — Limpieza (detergente, lejía, papel, guantes...)
     - `consumable` — Consumible operativo (gas butano, tinta, papel térmico...)
     - `finished_product` — Producto terminado listo para venta directa
     - `other` — Otros
   - Default: `other` (retrocompatible con ítems existentes)
   - Actualizar `buildCatalogItemDocument` y `sanitizeCatalogItem`

2. **Subcategorías opcionales por stockCategory:**
   - Nuevo campo: `stockSubcategory` — String libre
   - Ejemplos por categoría:
     - `ingredient` → "Cárnico", "Lácteo", "Vegetal", "Seco", "Congelado", "Fresco"
     - `beverage` → "Alcohólica", "Sin alcohol", "Caliente", "Fría"
     - `packaging` → "Desechable", "Reutilizable", "Isotérmico"
   - Endpoint `GET /api/stock-categories/:userId/subcategories?category=X` que devuelve subcategorías existentes (autocompletado dinámico)

3. **Filtros en endpoints existentes:**
   - `listCatalogItems`: añadir filtro `stockCategory` y `stockSubcategory`
   - `getLowStockReport`: añadir desglose por `stockCategory`
   - Dashboard KPIs: valor de stock por categoría

4. **Campo `isStockItem` (boolean):**
   - Distinguir artículos que son puro stock (ingredientes, envases) de productos que se venden directamente
   - Un producto de venta puede tener `isStockItem: false` pero tener una receta que consume artículos con `isStockItem: true`
   - Un ingrediente puro tiene `isStockItem: true` y normalmente `webVisible: false`

5. **Actualizar `buildCatalogItemDocument`:**
   - Incluir `stockCategory`, `stockSubcategory`, `isStockItem`
   - Actualizar `sanitizeCatalogItem` para exponer estos campos

**Criterios de aceptación:**
- Todos los artículos de stock se pueden clasificar por categoría
- Los filtros funcionan en listados y reportes
- La distinción `isStockItem` permite separar ingredientes de productos de venta
- Retrocompatible: ítems existentes quedan como `stockCategory: 'other'`

---

### TICKET STK-03: Descuento automático por receta al vender

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** STK-01, CS-02 (stock_movement)  

**Descripción:**  
Implementar el descuento automático de ingredientes según la receta del producto vendido. Cuando se vende una "Hamburguesa Clásica", el sistema busca su receta y descuenta: 200g de carne, 1 pan, 50g de lechuga, etc. Si el producto no tiene receta, se descuenta el propio producto (comportamiento actual CS-04).

**Tareas:**

1. **Servicio `services/recipeStockService.js`:**
   - `deductByRecipe(userId, catalogItemId, quantitySold, warehouseId?, referenceId?, referenceType?)`:
     1. Buscar receta activa para `catalogItemId`
     2. Si existe receta:
        - Por cada ingrediente: calcular `cantidadADescontar = (ingredient.quantity / recipe.portions) * quantitySold`
        - Aplicar merma técnica si `wastePercent > 0`: `cantidadReal = cantidadADescontar / (1 - wastePercent/100)`
        - Llamar a `stockMovementService.recordMovement` con:
          - `movementType: 'recipe_consumption'`
          - `catalogItemId`: el del ingrediente
          - `quantity`: cantidadReal
          - `referenceId`: el del documento de venta original
          - `referenceType`: el tipo de venta (`delivery_order`, `tpv_sale`, etc.)
          - `recipeId`: referencia a la receta usada
          - `parentItemId`: el producto vendido que disparó el consumo
        - Registrar un `stock_movement` padre de tipo `sale` para el producto vendido (trazabilidad)
     3. Si NO existe receta:
        - Descontar el propio producto (fallback al comportamiento CS-04)
        - Log de warning: "Producto X vendido sin receta — descuento directo"
     4. Retornar resumen: `{ deducted: [...items], warnings: [...], blocked: false }`

2. **Añadir `movementType: 'recipe_consumption'` a stock_movement:**
   - Nuevo tipo en el enum de movimientos (extender CS-02)
   - Campos adicionales en el movimiento: `recipeId`, `parentItemId`, `parentItemName`
   - Esto permite filtrar en el kardex: "movimientos por consumo de receta"

3. **Verificación de stock antes de vender (pre-check):**
   - `checkRecipeStock(userId, catalogItemId, quantity, warehouseId?)`:
     - Busca receta y calcula necesidades
     - Devuelve por cada ingrediente: `{ catalogItemId, name, required, available, sufficient, shortage }`
     - Devuelve `canProduce: boolean` y `maxProducible: number`
   - Este endpoint se llama antes de confirmar venta para alertar o bloquear

4. **Integrar con puntos de venta (hooks de venta):**
   - `deliveryController.js` — Al pasar a `delivered`:
     - Para cada línea del pedido: llamar a `deductByRecipe` en lugar de descontar directamente
   - TPV (`tpv_sale`):
     - Al registrar venta: llamar a `deductByRecipe` por cada producto
   - Web orders (`web_order`):
     - Al confirmar/completar: llamar a `deductByRecipe`
   - **Idempotencia**: verificar que no exista ya un movimiento con `referenceId + catalogItemId + movementType`

5. **Configuración por cuenta (`account.stockConfig`):**
   - `recipeDeductionEnabled` — Boolean (default: `true`): activa/desactiva descuento por receta
   - `blockSaleOnStockout` — Boolean (default: `false`): bloquear venta si falta stock de algún ingrediente no-opcional
   - `warnSaleOnLowStock` — Boolean (default: `true`): avisar (no bloquear) si hay ingredientes bajo mínimo
   - `deductionTrigger` — Enum: `on_delivery` | `on_preparation` | `on_order_confirmed` (cuándo descontar)

6. **Endpoint de pre-check para TPV/pedidos:**
   - `POST /api/recipes/:userId/check-stock`
   - Body: `{ items: [{ catalogItemId, quantity }], warehouseId? }`
   - Response: `{ canFulfill: boolean, details: [...], alternatives: [...] }`

**Criterios de aceptación:**
- Al vender un producto con receta, se descuentan sus ingredientes según la receta
- Al vender un producto sin receta, se descuenta el propio producto
- El descuento es idempotente (no duplica si se reintenta)
- Se puede verificar stock antes de vender
- El comportamiento es configurable (bloquear, avisar, permitir)
- Los movimientos de consumo por receta quedan en el kardex con referencia a la receta y al producto vendido
- El trigger de descuento es configurable (al entregar, al preparar, al confirmar)

---

### TICKET STK-04: Mermas — Sistema formal de registro y seguimiento

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CS-02 (stock_movement)  

**Descripción:**  
Crear un sistema formal de mermas que permita registrar, categorizar, analizar y alertar sobre pérdidas de stock. Actualmente solo existe `wastePercent` como campo teórico en recetas y un modal de demo (`MermaPorPDVModal.tsx`) con datos mock.

Las mermas se dividen en:
- **Merma técnica**: inherente al proceso productivo (definida en la receta, ya incluida en STK-01 vía `wastePercent`).
- **Merma operativa**: pérdidas reales por deterioro, caducidad, rotura, robo, error, etc. — esta es la que necesita registro formal.

**Tareas:**

1. **Crear entidad `waste_record` en CouchDB:**
   - `type: 'waste_record'`
   - Campos:
     - `_id`, `_rev`, `user_id`
     - `catalogItemId` — Artículo afectado
     - `catalogItemName` — Denormalizado
     - `warehouseId` — Almacén donde se produce la merma
     - `warehouseName` — Denormalizado
     - `quantity` — Cantidad perdida (siempre positiva)
     - `unit` — Unidad de medida
     - `wasteType` — Tipo de merma:
       - `expiry` — Caducidad
       - `breakage` — Rotura/daño
       - `spoilage` — Deterioro (temperatura, humedad...)
       - `theft` — Robo/hurto sospechado
       - `overproduction` — Sobreproducción
       - `preparation_error` — Error de preparación
       - `spillage` — Derrame
       - `return_unusable` — Devolución no reutilizable
       - `other` — Otros
     - `severity` — Nivel: `low` | `medium` | `high` | `critical`
     - `estimatedCost` — Coste estimado de la pérdida (`quantity * costPrice` del artículo)
     - `notes` — Descripción detallada
     - `evidence` — Array de URLs de fotos (opcional)
     - `reportedBy` — Usuario que registra
     - `reviewedBy` — Gerente que revisa (null si pendiente)
     - `reviewStatus` — `pending` | `reviewed` | `disputed`
     - `reviewNotes` — Notas de la revisión
     - `batchNumber` — Número de lote (opcional)
     - `expiryDate` — Fecha de caducidad del producto si aplica
     - `createdAt`, `updatedAt`

2. **Servicio `services/wasteService.js`:**
   - `recordWaste(userId, data)`:
     1. Crear `waste_record`
     2. Llamar a `stockMovementService.recordMovement` con `movementType: 'waste'` (nuevo tipo, extiende CS-02)
     3. Calcular coste estimado con el `costPrice` actual del artículo
     4. Evaluar si la merma supera umbrales → disparar alerta si procede
   - `listWasteRecords(userId, filters)` — Filtros: tipo, artículo, almacén, fecha, estado revisión, severidad
   - `reviewWaste(userId, wasteId, reviewData)` — Marcar como revisada/disputada
   - `getWasteSummary(userId, dateRange, groupBy?)` — Resumen agrupado:
     - Por tipo de merma: cuánto se pierde por caducidad vs rotura vs robo...
     - Por artículo: top 10 artículos con más merma
     - Por almacén/sede: comparativa entre sedes
     - Por período: evolución semanal/mensual
     - Coste total y % sobre compras
   - `getWasteRate(userId, catalogItemId, dateRange?)` — Tasa de merma de un artículo: `(merma / (compras + stock_inicial)) * 100`

3. **Router (`routers/wasteRouter.js`):**
   - `GET    /api/waste/:userId` — Listar mermas
   - `POST   /api/waste/:userId` — Registrar merma
   - `PUT    /api/waste/:userId/:wasteId/review` — Revisar merma
   - `GET    /api/waste/:userId/summary` — Resumen analítico
   - `GET    /api/waste/:userId/rate/:catalogItemId` — Tasa de merma por artículo
   - Montar en `index.js` con `requireAuth`

4. **Cliente TypeScript (`src/app/lib/wasteApi.ts`):**
   - Tipos: `WasteRecord`, `WasteType`, `WasteSeverity`, `WasteSummary`
   - Funciones: `listWaste`, `recordWaste`, `reviewWaste`, `getWasteSummary`, `getWasteRate`

5. **Añadir `movementType: 'waste'` a stock_movement:**
   - Nuevo tipo en el enum de movimientos (extender CS-02)
   - Campo `wasteRecordId` para vincular con el `waste_record`

**Criterios de aceptación:**
- Se pueden registrar mermas con tipo, cantidad, motivo y evidencia
- Cada merma genera un movimiento de stock en el kardex
- El gerente puede revisar mermas pendientes
- Los resúmenes permiten analizar mermas por tipo, artículo, sede y período
- Se calcula la tasa de merma por artículo
- El coste estimado se calcula automáticamente

---

### TICKET STK-05: Reconciliación stock teórico vs real (Inventario físico)

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CS-02 (stock_movement), STK-03  

**Descripción:**  
Implementar un sistema de inventario físico que permita comparar el stock teórico (según movimientos registrados) con el stock real (conteo físico), detectar diferencias y generar los ajustes necesarios automáticamente.

El **stock teórico** es lo que el sistema dice que debería haber basándose en: stock inicial + compras recibidas - ventas (por receta) - mermas - consumo interno - transferencias.
El **stock real** es lo que realmente hay tras un conteo físico.

**Tareas:**

1. **Crear entidad `stock_count` (Inventario físico) en CouchDB:**
   - `type: 'stock_count'`
   - Campos:
     - `_id`, `_rev`, `user_id`
     - `name` — Nombre descriptivo (ej: "Inventario semanal Almacén Central - Semana 15")
     - `warehouseId` — Almacén inventariado
     - `warehouseName` — Denormalizado
     - `status` — `draft` | `in_progress` | `completed` | `cancelled`
     - `countType` — `full` (todo el almacén) | `partial` (solo ciertas categorías/artículos) | `spot_check` (muestreo rápido)
     - `filterCategories[]` — Categorías a contar si `partial` (ej: solo ingredientes)
     - `lines[]` — Líneas del conteo:
       - `catalogItemId`
       - `catalogItemName`
       - `sku`
       - `stockCategory`
       - `unit`
       - `theoreticalStock` — Lo que el sistema dice que debería haber (snapshot al iniciar)
       - `countedStock` — Lo que se cuenta físicamente (null hasta que se cuente)
       - `difference` — `countedStock - theoreticalStock`
       - `differencePercent` — `(difference / theoreticalStock) * 100`
       - `differenceValue` — `difference * costPrice`
       - `notes` — Notas por línea
       - `countedBy` — Quién contó esta línea
       - `countedAt` — Cuándo se contó
     - `totalTheoreticalValue` — Valor teórico total
     - `totalCountedValue` — Valor contado total
     - `totalDifferenceValue` — Diferencia total en valor
     - `adjustmentsGenerated` — Boolean: si ya se generaron ajustes
     - `startedAt`, `completedAt`
     - `startedBy`, `completedBy`
     - `notes`
     - `createdAt`, `updatedAt`

2. **Servicio `services/stockCountService.js`:**
   - `createStockCount(userId, data)`:
     1. Crear el documento `stock_count` en estado `draft`
     2. Prellenar `lines[]` con todos los artículos del almacén (o los filtrados)
     3. Calcular `theoreticalStock` para cada línea a partir de `catalog_item.stockQuantity` (o `warehouseStock[].quantity` si multi-almacén)
   - `updateCountLine(userId, countId, lineIndex, countedData)`:
     - Registrar `countedStock`, calcular diferencia
     - Cambiar status a `in_progress` si era `draft`
   - `completeStockCount(userId, countId)`:
     - Validar que todas las líneas tienen `countedStock` (o marcar las no contadas)
     - Calcular totales
     - Estado → `completed`
   - `generateAdjustments(userId, countId)`:
     - Por cada línea con diferencia ≠ 0:
       - Si `difference > 0`: crear movimiento `adjustment_in` (sobra stock)
       - Si `difference < 0`: crear movimiento `adjustment_out` (falta stock)
       - Notas automáticas: "Ajuste por inventario físico [countId] — Diferencia: X ud"
     - Marcar `adjustmentsGenerated: true`
   - `listStockCounts(userId, filters)` — Historial de inventarios
   - `getStockCountReport(userId, countId)` — Informe detallado de un inventario

3. **Router (`routers/stockCountRouter.js`):**
   - `GET    /api/stock-counts/:userId` — Listar inventarios
   - `POST   /api/stock-counts/:userId` — Crear inventario
   - `GET    /api/stock-counts/:userId/:countId` — Detalle
   - `PUT    /api/stock-counts/:userId/:countId/line/:lineIdx` — Actualizar línea
   - `POST   /api/stock-counts/:userId/:countId/complete` — Completar
   - `POST   /api/stock-counts/:userId/:countId/generate-adjustments` — Generar ajustes
   - Montar en `index.js` con `requireAuth`

4. **Cliente TypeScript (`src/app/lib/stockCountApi.ts`):**
   - Tipos: `StockCount`, `StockCountLine`, `CountType`
   - Funciones: `listStockCounts`, `createStockCount`, `updateCountLine`, `completeStockCount`, `generateAdjustments`

**Criterios de aceptación:**
- Se puede crear un inventario físico para un almacén
- El sistema pre-calcula el stock teórico por artículo
- Se pueden registrar cantidades reales línea por línea
- Las diferencias se calculan automáticamente (cantidad y valor)
- Se pueden generar ajustes de stock (movimientos en el kardex) a partir de las diferencias
- El historial de inventarios es consultable
- Soporta conteo completo, parcial y muestreo rápido

---

### TICKET STK-06: Alertas específicas de stock y recetas

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** STK-01, STK-03, STK-04, CS-08 (alertas base)  

**Descripción:**  
Ampliar el motor de alertas (`alertEngine.js`) con reglas específicas para el módulo de stock automático y recetas. Las alertas existentes (`low_stock`, `out_of_stock`, `negative_stock`) se complementan con alertas inteligentes basadas en recetas y mermas.

**Tareas:**

1. **Alerta `high_waste` — Merma alta:**
   - Lógica: para cada artículo, calcular tasa de merma en los últimos 30 días
   - Si tasa > umbral configurable (default 5%) → alerta `warning`
   - Si tasa > umbral crítico (default 15%) → alerta `critical`
   - Mensaje: "Merma alta en [producto]: X% en los últimos 30 días (Y unidades, Z€)"
   - Comparativa con media del sector si disponible
   - Configuración: `alertConfig.highWasteEnabled`, `alertConfig.highWasteThreshold`, `alertConfig.highWasteCriticalThreshold`

2. **Alerta `critical_product_today` — Producto crítico para hoy:**
   - Lógica:
     1. Estimar ventas de hoy por producto basándose en histórico (mismo día de la semana, media de las últimas 4 semanas)
     2. Para cada producto con receta: calcular ingredientes necesarios para cubrir las ventas estimadas
     3. Si el stock de algún ingrediente no cubre la demanda estimada → alerta
   - Nivel: `warning` si cubre < 80% de la demanda estimada, `critical` si cubre < 50%
   - Mensaje: "Stock insuficiente de [ingrediente] para la demanda estimada de hoy: necesitas X, tienes Y"
   - Incluir: productos afectados, cantidad faltante, proveedor del ingrediente
   - Ejecutar: al inicio de cada jornada laboral (configurable, ej: 6:00 AM) y cada 2 horas
   - Configuración: `alertConfig.criticalProductTodayEnabled`, `alertConfig.criticalProductHoursAhead`, `alertConfig.criticalProductWeeksHistory`

3. **Alerta `recipe_missing` — Producto sin receta:**
   - Lógica: detectar productos activos de venta que no tienen receta asociada
   - Nivel: `info` (informativa, no crítica)
   - Solo para productos con `itemType: 'product'` y `active: true` y `stockCategory !== 'finished_product'`
   - Mensaje: "X productos activos no tienen receta configurada — el stock no se descontará automáticamente"
   - Frecuencia: una vez al día
   - Configuración: `alertConfig.recipeMissingEnabled`

4. **Alerta `stock_discrepancy` — Discrepancia stock teórico vs real:**
   - Lógica: al completar un inventario físico (STK-05), si la diferencia total supera un umbral
   - Si `|totalDifferenceValue| > X€` (configurable) → alerta
   - Nivel: `warning` si < 5% del valor total, `critical` si >= 5%
   - Mensaje: "Inventario [nombre]: diferencia de X€ (Y%) entre stock teórico y real"
   - Configuración: `alertConfig.stockDiscrepancyEnabled`, `alertConfig.stockDiscrepancyThreshold`

5. **Alerta `ingredient_expiring` — Ingrediente próximo a caducar:**
   - Lógica: si el artículo tiene `expiryDate` y faltan < X días → alerta
   - Nivel: `warning` si < 7 días, `critical` si < 2 días
   - Solo aplica si el campo `expiryDate` existe en `catalog_item` (nuevo campo opcional)
   - Mensaje: "El ingrediente [nombre] caduca en X días (stock: Y unidades, valor: Z€)"
   - Configuración: `alertConfig.ingredientExpiringEnabled`, `alertConfig.ingredientExpiringDays`

6. **Integrar todas las alertas en `alertEngine.js`:**
   - Añadir las 5 nuevas reglas al ciclo de evaluación
   - Cada regla respeta su flag `enabled` en la configuración
   - Las alertas se envían por SSE y Push (infraestructura existente)

7. **Endpoint de resumen de alertas de stock:**
   - `GET /api/alerts/:userId/stock-summary`
   - Respuesta: `{ lowStock, outOfStock, negativeStock, highWaste, criticalToday, recipeMissing, discrepancies, expiringIngredients }`
   - Incluir en el header de la página de stock

**Criterios de aceptación:**
- Alerta de merma alta funcional con umbrales configurables
- Alerta de producto crítico para hoy basada en histórico de ventas + recetas
- Alerta de productos sin receta (informativa)
- Alerta de discrepancia al completar inventario
- Alerta de ingredientes próximos a caducar
- Todas las alertas configurables por cuenta
- Se envían por SSE/Push en tiempo real
- Endpoint de resumen agrupado disponible

---

### TICKET STK-07: Permisos y vistas por rol (Gerente vs Trabajador)

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** STK-01, STK-03, STK-04  

**Descripción:**  
Implementar dos niveles de acceso a la página de stock y recetas: el **gerente** tiene acceso total (configuración, recetas, ajustes, mermas, informes), y el **trabajador** solo puede consultar stock operativo y registrar los movimientos que se le permitan.

**Tareas:**

1. **Definir permisos en el modelo de roles:**
   - Permisos del módulo `stock_recipes`:
     - `stock.view` — Ver stock actual (ambos roles)
     - `stock.adjust` — Registrar ajustes manuales (gerente)
     - `stock.transfer` — Transferir entre almacenes (gerente)
     - `stock.count` — Hacer inventario físico (gerente, o trabajador supervisado)
     - `recipe.view` — Ver recetas (ambos roles)
     - `recipe.manage` — Crear, editar, eliminar recetas (gerente)
     - `waste.record` — Registrar merma (ambos roles)
     - `waste.review` — Revisar/aprobar mermas (gerente)
     - `waste.report` — Ver informes de mermas (gerente)
     - `config.stock` — Configurar mínimos, máximos, alertas (gerente)
     - `movements.view` — Ver historial de movimientos (gerente; trabajador solo los suyos)

2. **Perfil gerente — Acceso completo:**
   - Todas las pestañas visibles
   - Puede configurar recetas (crear, editar, eliminar, duplicar)
   - Puede configurar mínimos, máximos y políticas de stock
   - Puede registrar y revisar mermas
   - Puede hacer inventario físico y generar ajustes
   - Puede ver informes completos y exportar
   - Puede ver todos los movimientos de todos los usuarios

3. **Perfil trabajador — Acceso operativo restringido:**
   - **Ve**: stock actual por artículo/sede (solo lectura), recetas asociadas a productos (solo lectura)
   - **Puede hacer**: registrar merma (con tipo y motivo obligatorio), registrar conteo de inventario (si se le asigna)
   - **No puede**: editar recetas, ajustar stock manualmente, configurar mínimos, ver informes financieros, ver mermas de otros, exportar datos
   - Vista simplificada: tarjetas con semáforo de stock (verde/amarillo/rojo), buscador de producto con stock rápido, botón flotante "Registrar merma"

4. **Middleware de autorización en endpoints:**
   - Cada endpoint verifica el permiso correspondiente:
     - `POST /api/recipes/:userId` → requiere `recipe.manage`
     - `POST /api/waste/:userId` → requiere `waste.record`
     - `PUT /api/waste/:userId/:id/review` → requiere `waste.review`
     - `POST /api/stock-counts/:userId/:id/generate-adjustments` → requiere `stock.adjust`
     - etc.
   - Los endpoints de lectura (`GET`) verifican el permiso `*.view` correspondiente
   - El trabajador que hace `GET /api/stock-movements/:userId` solo recibe movimientos `performedBy: suUserId`

5. **Componente frontend de vista trabajador (`WorkerStockView`):**
   - Vista mobile-first optimizada para uso en cocina/almacén
   - Pantalla principal: lista de artículos con semáforo (stock OK / bajo / agotado)
   - Búsqueda rápida por nombre o escaneo de código de barras
   - Al tocar un artículo: stock actual, stock mínimo, última reposición, receta (si aplica)
   - Botón flotante: "Registrar merma" → formulario simplificado (artículo, cantidad, tipo, notas)
   - Sin gráficos, sin informes, sin configuración

**Criterios de aceptación:**
- El gerente tiene acceso completo a todas las funciones
- El trabajador solo ve stock operativo y puede registrar mermas
- Los endpoints validan permisos y devuelven 403 si no autorizado
- La vista trabajador está optimizada para móvil
- El trabajador no puede ver datos financieros (costes, valoración)

---

### TICKET STK-08: Página frontend `/saas/vertical/delivery/stock`

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** STK-01, STK-02, STK-03, STK-04, STK-05, STK-06, STK-07  

**Descripción:**  
Crear la página principal de Stock automático y recetas para el vertical delivery, accesible en `/saas/vertical/delivery/stock`. Esta página es el hub desde el que se gestiona todo el stock operativo del restaurante/delivery: recetas, ingredientes, mermas, inventario y alertas.

**Diseño general:**

- **Header fijo**: título, selector de almacén/sede activo, badge de alertas, botones de acción rápida
- **Barra de KPIs**: métricas clave en tiempo real
- **Navegación por pestañas**: 6 pestañas principales
- **Responsive**: funciona en desktop, tablet y móvil
- **Dark mode**: respetar configuración del sistema
- **URL params**: `?tab=X&itemId=Y&warehouseId=Z` para deep linking

**Tareas:**

1. **Crear estructura de rutas del vertical delivery:**
   - Registrar en `routes.tsx`:
     - `path: 'vertical/delivery/stock'` → `DeliveryStockPage`
   - Evaluar si crear un layout padre `vertical/delivery/*` para todas las páginas del vertical delivery (cocina, stock, pedidos, etc.)

2. **Crear `src/app/pages/saas/vertical/delivery/DeliveryStockPage.tsx`:**
   - Layout con header fijo y navegación por pestañas
   - Detectar rol del usuario (gerente/trabajador) y renderizar la vista correspondiente
   - Si trabajador → renderizar `WorkerStockView` (STK-07)
   - Si gerente → renderizar la página completa con pestañas

3. **Header de la página:**
   - Título: "Stock y Recetas"
   - Selector de sede/almacén activo (dropdown con almacenes del usuario)
   - Badge con conteo de alertas activas (click → abre panel lateral de alertas)
   - Botones de acción rápida: "Nueva receta", "Registrar merma", "Inventario rápido"
   - Breadcrumb: Delivery > Stock y Recetas

4. **Barra de KPIs (debajo del header):**
   - **Artículos totales**: conteo de artículos de stock activos
   - **Valor del stock**: suma de `stockQuantity * costPrice` del almacén seleccionado
   - **Bajo mínimo**: conteo con badge rojo, click filtra la pestaña stock
   - **Agotados**: conteo con badge negro
   - **Merma del mes**: valor en € y % sobre compras
   - **Recetas activas**: conteo de recetas activas
   - Los KPIs cambian al cambiar de almacén
   - Tooltip en cada KPI con tendencia vs mes anterior (↑↓)

5. **Pestaña "Stock" (default):**
   - **Tabla/lista de artículos** con columnas:
     - Nombre, SKU, Categoría de stock (icon + badge de color por tipo), Stock actual, Unidad, Stock mínimo, Estado (semáforo: verde/amarillo/rojo/negro), Coste unitario, Valor stock, Última reposición
   - **Filtros**: categoría de stock (ingrediente/bebida/envase/limpieza/consumible), estado (OK/bajo/agotado/negativo), búsqueda por nombre/SKU, proveedor
   - **Semáforo visual**:
     - 🟢 Verde: stock > minStock * 1.5
     - 🟡 Amarillo: stock > minStock pero < minStock * 1.5
     - 🔴 Rojo: stock <= minStock y stock > 0
     - ⚫ Negro: stock = 0 o negativo
   - **Acciones por artículo**: ver detalle, ajustar stock, ver movimientos, ver recetas donde se usa, registrar merma
   - **Vista tabla** (desktop) y **vista tarjetas** (mobile)
   - **Ordenación**: por nombre, stock, valor, estado
   - **Exportar a CSV**

6. **Pestaña "Recetas":**
   - **Lista de recetas** con:
     - Nombre, Producto vinculado, Nº ingredientes, Coste por ración, Precio venta, Margen (€ y %), Estado (activa/inactiva), Última modificación
   - **Filtros**: categoría, estado, margen (positivo/negativo), búsqueda
   - **Crear receta**: wizard de 3 pasos:
     1. Seleccionar producto del catálogo que dispara la receta
     2. Añadir ingredientes (buscar del catálogo, cantidad, unidad, merma %)
     3. Resumen con costes, margen y confirmación
   - **Detalle de receta**: tarjeta expandible con ingredientes, costes, margen, stock disponible de cada ingrediente, "¿Se puede producir?" con cantidad máxima producible
   - **Acciones**: editar, duplicar, activar/desactivar, eliminar
   - **Indicador visual**: si algún ingrediente está agotado, la receta se muestra con warning
   - Reutilizar/adaptar componentes de `src-delivery/CrearEscandalloWizard.tsx` y `DetalleEscandallo.tsx`

7. **Pestaña "Mermas":**
   - **Lista de mermas** con:
     - Fecha, Artículo, Cantidad, Tipo de merma (icon), Coste estimado, Sede, Registrado por, Estado revisión (pendiente/revisada/disputada)
   - **Filtros**: tipo, artículo, sede, fecha, estado revisión, severidad
   - **Registrar merma**: formulario rápido (artículo, cantidad, tipo, motivo, foto opcional)
   - **Revisión** (gerente): marcar como revisada, disputar, añadir notas
   - **Resumen analítico** (panel lateral o modal):
     - Merma total del mes (€ y %)
     - Top 5 artículos con más merma
     - Distribución por tipo de merma (donut chart)
     - Evolución semanal (line chart)
     - Comparativa entre sedes (bar chart)
   - Reutilizar/adaptar `src-delivery/MermaPorPDVModal.tsx` para gráficos por sede

8. **Pestaña "Inventario":**
   - **Lista de inventarios** realizados con: nombre, fecha, almacén, estado, diferencia total (€), conteo de discrepancias
   - **Crear inventario**: wizard:
     1. Seleccionar almacén y tipo (completo/parcial/muestreo)
     2. Si parcial: seleccionar categorías a contar
     3. Pantalla de conteo: lista de artículos con campo input para cantidad real, stock teórico visible, diferencia calculada en tiempo real
     4. Resumen: total de discrepancias, valor afectado, botón "Generar ajustes"
   - **Detalle de inventario**: tabla con líneas, colores por diferencia, exportar
   - Reutilizar/adaptar lógica de `src-delivery/AjusteStockModal.tsx` para la interfaz de conteo

9. **Pestaña "Movimientos":**
   - **Tabla cronológica** de movimientos (kardex):
     - Fecha/hora, Artículo, Tipo de movimiento (badge de color), Cantidad (+/-), Stock anterior → Stock posterior, Referencia (pedido/receta/merma/ajuste), Usuario, Almacén
   - **Filtros**: tipo de movimiento, artículo, almacén, fecha, usuario, referencia
   - **Colores por tipo**:
     - 🟢 Entrada: `purchase_reception`, `adjustment_in`, `return_customer`, `initial`
     - 🔴 Salida: `sale`, `recipe_consumption`, `waste`, `adjustment_out`, `internal_consumption`, `return_supplier`
     - 🔵 Transferencia: `transfer`
   - **Resumen del período**: total entradas, total salidas, balance neto, valoración
   - **Exportar a CSV/Excel**
   - Click en referencia → navega al documento origen (pedido, factura, merma, etc.)

10. **Pestaña "Configuración":**
    - **Configuración general** (solo gerente):
      - `recipeDeductionEnabled`: activar/desactivar descuento automático por receta
      - `blockSaleOnStockout`: bloquear venta si falta stock
      - `warnSaleOnLowStock`: avisar antes de vender con stock bajo
      - `deductionTrigger`: cuándo descontar (al entregar / al preparar / al confirmar pedido)
      - `allowNegativeStock`: permitir stock negativo
    - **Configuración de mínimos masiva**: tabla editable con artículo, mínimo, máximo, auto-reorder (reutilizar idea CS-17)
    - **Configuración de alertas**:
      - Habilitar/deshabilitar cada tipo de alerta
      - Umbrales de merma alta (%)
      - Horas de anticipación para "producto crítico"
      - Días para "ingrediente próximo a caducar"
    - **Importar artículos de stock**: wizard de importación desde CSV/Excel (reutilizar `ImportStockWizard`)
    - Reutilizar/adaptar `src-delivery/ComprasInventario.tsx`

11. **Panel lateral de alertas (drawer derecho):**
    - Se abre al pulsar el badge de alertas del header
    - Lista de alertas activas agrupadas por tipo:
      - Stock bajo, Agotados, Negativos, Merma alta, Críticos hoy, Sin receta, Caducidad próxima
    - Cada alerta: artículo, mensaje, nivel (icon color), acción rápida (ir al artículo, crear pedido de compra, etc.)
    - Botón "Marcar como leída" / "Resolver"

12. **Conexiones con otros módulos (navegación):**
    - Desde un artículo de stock → "Ver en Compras y Stock" → `/saas/compras-stock?tab=stock&itemId=X`
    - Desde una receta → "Ver producto en Catálogo" → `/saas/compras-stock?tab=catalogo&itemId=X`
    - Desde una alerta de stock bajo → "Crear pedido de compra" → `/saas/compras-stock?tab=pedidos&newOrder=true&itemId=X`
    - Desde un movimiento tipo `sale` → "Ver pedido" → `/saas/vertical/delivery?orderId=X`
    - Desde un movimiento tipo `recipe_consumption` → "Ver receta" → `?tab=recetas&recipeId=X`
    - Desde merma → "Ver informe de mermas" → `/saas/vertical/delivery/informes?section=mermas`
    - Header breadcrumb → Cocina / TPV / Pedidos / Informes (links a las otras páginas del vertical)

13. **Sidebar — Añadir entrada:**
    - En el grupo `delivery` del sidebar, añadir:
      - `{ id: 'delivery-stock', label: 'Stock y Recetas', icon: Package, path: '/saas/vertical/delivery/stock' }`
    - Posicionar después de "Catálogo Delivery" y antes de "Pedidos Web"

**Criterios de aceptación:**
- Página accesible en `/saas/vertical/delivery/stock`
- 6 pestañas funcionales con contenido real (no mock)
- KPIs actualizados en tiempo real
- Deep linking: `?tab=recetas&recipeId=123` abre la receta específica
- Responsive: desktop, tablet, móvil
- Vista gerente completa / vista trabajador simplificada
- Conexiones bidireccionales con Compras y Stock Core, Cocina, TPV, Pedidos, Informes
- Semáforo de stock visual e intuitivo
- Panel de alertas funcional con acciones rápidas
- Reutiliza componentes existentes de `src-delivery/` donde sea posible

---

### TICKET STK-09: Conexión Cocina (KDS) ↔ Stock automático

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** STK-03, KDS-01 (si existe)  

**Descripción:**  
Conectar el sistema de cocina/KDS con el stock automático para que la cocina pueda consultar disponibilidad de ingredientes y el sistema pueda bloquear o alertar sobre productos que no se pueden preparar.

**Tareas:**

1. **Enriquecer la vista de cocina con info de stock:**
   - Para cada item de un pedido en cocina, mostrar:
     - Semáforo de disponibilidad (basado en receta + stock actual)
     - Si algún ingrediente está agotado: badge "⚠ Falta stock" con detalle
   - Endpoint: `GET /api/recipes/:userId/check-stock` (de STK-03) reutilizado

2. **Acción "Marcar agotado" desde cocina:**
   - El cocinero puede marcar un producto como "agotado" desde el KDS
   - Esto actualiza `catalog_item.available = false` para que no se venda más
   - Genera alerta `out_of_stock` inmediata
   - Cuando se repone stock → el sistema puede reactivar automáticamente (`available = true`) si `stockQuantity > 0`

3. **Trigger de descuento en fase cocina (opcional):**
   - Si `deductionTrigger = 'on_preparation'`:
     - Al pasar pedido a estado `kitchen`/`preparing`, descontar ingredientes según receta
     - Ventaja: refleja consumo real en el momento de uso
     - Riesgo: si se cancela después de preparar, necesita devolución de stock

4. **Notificación de stock bajo durante producción:**
   - Si al descontar ingredientes un artículo queda bajo mínimo → push al gerente
   - Si queda en 0 → push al gerente + al cocinero (para que sepa que no hay más)

5. **Vista rápida de ingredientes por item (pop-up):**
   - En la tarjeta del pedido en cocina: botón "Ver ingredientes"
   - Muestra la receta del producto con stock actual de cada ingrediente
   - Visual: verde = hay, rojo = no hay

**Criterios de aceptación:**
- La cocina ve el estado de stock de ingredientes por producto
- Se puede marcar un producto como agotado desde cocina
- El descuento por receta puede configurarse para ejecutarse al preparar
- Las alertas llegan en tiempo real al cocinar/preparar

---

### TICKET STK-10: Conexión TPV ↔ Stock automático

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** STK-03  

**Descripción:**  
Integrar el punto de venta (TPV) con el descuento automático por receta, tanto para bloquear/alertar antes de vender como para ejecutar el descuento al cobrar.

**Tareas:**

1. **Pre-check de stock al añadir producto al carrito TPV:**
   - Al añadir un producto al ticket TPV, verificar stock de ingredientes vía `checkRecipeStock`
   - Si stock insuficiente y `blockSaleOnStockout = true`: impedir añadirlo con mensaje
   - Si stock insuficiente y `warnSaleOnLowStock = true`: permitir pero mostrar warning
   - Si hay stock: semáforo verde, vender normalmente

2. **Descuento al cobrar/cerrar ticket:**
   - Al confirmar el cobro de un ticket TPV: llamar a `deductByRecipe` para cada línea
   - `referenceType: 'tpv_sale'`, `referenceId: ticketId`
   - Idempotencia: no duplicar si el ticket se reintenta

3. **Indicador de stock en catálogo TPV:**
   - Al navegar por el catálogo en la pantalla TPV:
     - Productos con stock OK: borde/badge verde
     - Productos con stock bajo: borde/badge amarillo
     - Productos agotados: borde/badge rojo, opción de deshabilitar o tachar
   - Datos cacheados con refresh cada 60s o vía SSE

4. **Devolución desde TPV:**
   - Al registrar devolución de un producto vendido:
     - Si el producto tiene receta: el sistema pregunta si devolver ingredientes al stock
     - Si sí: crear movimientos `return_customer` por cada ingrediente de la receta
     - Si no: solo registrar la devolución financiera

**Criterios de aceptación:**
- El TPV verifica stock antes de vender
- El cobro descuenta ingredientes automáticamente vía receta
- El catálogo TPV muestra estado de stock visual
- Las devoluciones pueden revertir el descuento de ingredientes

---

### TICKET STK-11: Conexión Pedidos (Delivery/Web) ↔ Stock automático

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** STK-03  

**Descripción:**  
Integrar los pedidos delivery y web con el descuento automático por receta, incluyendo el ciclo completo de vida del pedido.

**Tareas:**

1. **Pre-validación al crear pedido delivery:**
   - Al crear `delivery_order`: verificar stock de ingredientes para todos los productos del pedido
   - Si no hay stock y `blockSaleOnStockout = true`: rechazar el pedido con detalle de qué falta
   - Si no hay stock y `blockSaleOnStockout = false`: aceptar pero generar alerta

2. **Descuento según trigger configurado:**
   - `on_order_confirmed`: al aceptar el pedido → descontar inmediatamente (reserva stock)
   - `on_preparation`: al pasar a cocina → descontar (ver STK-09)
   - `on_delivery`: al entregar → descontar (comportamiento más seguro; si se cancela antes no hay que revertir)

3. **Cancelación de pedido → reversión de stock:**
   - Si se cancela un pedido DESPUÉS de haber descontado stock:
     - Crear movimientos inversos: `movementType: 'sale_reversal'` (nuevo tipo)
     - Vincular con `referenceId` del pedido original
     - Restaurar `stockQuantity` de los ingredientes

4. **Pedidos web (`web_order`):**
   - Mismo flujo: pre-check al recibir pedido, descuento al confirmar/preparar/entregar
   - Si la web muestra stock en directo: endpoint público de disponibilidad

5. **Catálogo web — Disponibilidad en tiempo real:**
   - Endpoint `GET /api/delivery/:userId/availability` (público o semi-público):
     - Para cada producto activo: `{ catalogItemId, available: boolean, estimatedStock: number }`
     - `available` se calcula verificando que todos los ingredientes de la receta tienen stock suficiente para al menos 1 unidad
   - La web puede ocultar o marcar como "agotado" productos sin stock
   - Cache de 5 minutos o invalidar vía SSE al cambiar stock

**Criterios de aceptación:**
- Los pedidos delivery verifican stock al crearse
- El descuento se ejecuta según el trigger configurado
- Las cancelaciones revierten el descuento de stock
- Los pedidos web tienen el mismo flujo
- Hay un endpoint de disponibilidad para la web pública

---

### TICKET STK-12: Conexión Compras y Stock Core ↔ Stock automático

**Tipo:** Enhancement — Backend  
**Prioridad:** Media  
**Dependencias:** STK-01, CS-10 (página unificada), CS-11 (recepción)  

**Descripción:**  
Asegurar que la página de Compras y Stock Core (`/saas/compras-stock`) y la de Stock automático delivery (`/saas/vertical/delivery/stock`) comparten datos y se complementan sin duplicar funcionalidad.

**Tareas:**

1. **Datos compartidos (misma BD CouchDB):**
   - `catalog_item`, `recipe`, `stock_movement`, `waste_record`, `stock_count`, `warehouse` — todos en la misma BD catálogo
   - Ambas páginas leen y escriben los mismos documentos
   - No hay duplicación de datos

2. **Flujo compra → recepción → stock:**
   - Cuando se recibe un pedido de compra (CS-11) → el stock sube → la página de stock delivery lo refleja
   - Desde la página de stock delivery → "Pedir más de este ingrediente" → redirige a `/saas/compras-stock?tab=pedidos&newOrder=true&itemId=X`

3. **Sugerencias de compra basadas en recetas:**
   - Mejorar `getSalesForecast` (CS-06) para usar recetas:
     - En vez de solo prever cuánto se vende de cada producto, prever cuánto ingrediente se necesita
     - Para cada producto previsto → expandir receta → sumar ingredientes necesarios
     - Resultado: "Necesitas comprar 50kg de harina esta semana porque prevés vender 200 hamburguesas + 100 pizzas"
   - Endpoint: `GET /api/purchase-orders/:userId/recipe-based-forecast`

4. **Enlace bidireccional en la UI:**
   - Desde Compras y Stock Core → pestaña Stock → link "Ver recetas" → `/saas/vertical/delivery/stock?tab=recetas&itemId=X`
   - Desde Stock delivery → pestaña Recetas → link "Ver en catálogo" → `/saas/compras-stock?tab=catalogo&itemId=X`
   - Desde Stock delivery → alerta "Stock bajo" → link "Crear pedido" → `/saas/compras-stock?tab=pedidos&newOrder=true`

**Criterios de aceptación:**
- Los datos son consistentes entre ambas páginas
- Las recepciones de compra actualizan el stock visible en la página delivery
- Las sugerencias de compra consideran las recetas para prever ingredientes
- La navegación cruzada entre módulos es fluida

---

### TICKET STK-13: Conexión Informes ↔ Stock automático

**Tipo:** Feature — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** STK-01, STK-03, STK-04, STK-05  

**Descripción:**  
Crear endpoints e interfaces para informes analíticos de stock y recetas que se integren con la sección de informes del vertical delivery.

**Tareas:**

1. **Informe de consumo por receta:**
   - Período configurable (día/semana/mes)
   - Por cada receta: veces usada, ingredientes consumidos, coste total, margen generado
   - Top recetas más rentables y menos rentables
   - Tendencia de uso (creciente/decreciente/estable)

2. **Informe de mermas:**
   - Merma total (€ y %)
   - Desglose por tipo (caducidad, rotura, robo...)
   - Top artículos con más merma
   - Comparativa entre sedes
   - Evolución temporal
   - Ratio merma/compras

3. **Informe de rotación de stock:**
   - Rotación = coste de ventas / stock medio
   - Artículos de alta rotación (se mueven rápido) vs baja rotación (stock muerto)
   - Días de cobertura por artículo: stock actual / consumo diario medio
   - Artículos sin movimiento en X días

4. **Informe de precisión de inventario:**
   - Basado en inventarios físicos (STK-05)
   - Precisión global: `1 - (|diferencias| / valor_total)`
   - Evolución de precisión en el tiempo
   - Artículos con más discrepancias recurrentes

5. **Informe de coste de recetas vs precio venta:**
   - Food cost ratio por producto: `coste_receta / precio_venta * 100`
   - Objetivo: < 30% (configurable)
   - Productos por encima del objetivo resaltados
   - Evolución del food cost medio

6. **Endpoint unificado:**
   - `GET /api/reports/:userId/stock?type=consumption|waste|rotation|accuracy|food-cost&period=day|week|month&from=X&to=Y`
   - Respuesta adaptada al tipo de informe

7. **Integración con `src-delivery/InformeStock.tsx`:**
   - Adaptar/reutilizar el componente existente
   - Conectar con datos reales en lugar de mock

**Criterios de aceptación:**
- 5 tipos de informe funcionales con datos reales
- Filtros por período, almacén, categoría
- Gráficos visuales (Recharts, ya integrado)
- Exportar a CSV/Excel
- Accesible desde la página de stock delivery y desde informes

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos de datos (semanas 1-2)

| Ticket | Nombre | Prioridad | Tipo |
|--------|--------|-----------|------|
| STK-01 | Entidad `recipe` en CouchDB | Crítica | Backend |
| STK-02 | Categorización artículos de stock | Alta | Backend |

> **Prerequisitos de otros tickets:** CS-01 (Warehouse) y CS-02 (Stock Movement) deben estar completados o en progreso. Si no lo están, se deben priorizar antes de Fase 2.

### Fase 2 — Automatización core (semanas 3-4)

| Ticket | Nombre | Prioridad | Tipo |
|--------|--------|-----------|------|
| STK-03 | Descuento automático por receta | Crítica | Backend |
| STK-04 | Sistema formal de mermas | Alta | Backend |
| STK-05 | Reconciliación stock teórico vs real | Alta | Backend |

### Fase 3 — Alertas y permisos (semana 5)

| Ticket | Nombre | Prioridad | Tipo |
|--------|--------|-----------|------|
| STK-06 | Alertas específicas stock/recetas | Alta | Backend |
| STK-07 | Permisos gerente vs trabajador | Alta | Backend + Frontend |

### Fase 4 — Página frontend (semanas 6-8)

| Ticket | Nombre | Prioridad | Tipo |
|--------|--------|-----------|------|
| STK-08 | Página `/saas/vertical/delivery/stock` | Crítica | Frontend |

### Fase 5 — Conexiones entre módulos (semanas 9-11)

| Ticket | Nombre | Prioridad | Tipo |
|--------|--------|-----------|------|
| STK-09 | Conexión Cocina ↔ Stock | Alta | Backend |
| STK-10 | Conexión TPV ↔ Stock | Alta | Backend |
| STK-11 | Conexión Pedidos ↔ Stock | Alta | Backend |
| STK-12 | Conexión Compras Core ↔ Stock | Media | Backend |
| STK-13 | Conexión Informes ↔ Stock | Media | Backend + Frontend |

---

## DIAGRAMA DE DEPENDENCIAS

```
CS-01 (Warehouse)  ──────────────────────────────────────┐
CS-02 (Stock Movement) ──────────────────────────────────┤
                                                          │
STK-01 (Recipe entity) ──────────┐                        │
STK-02 (Stock categories) ──────┤                        │
                                  ▼                        ▼
                        STK-03 (Descuento por receta) ◄── CS-02
                        STK-04 (Mermas) ◄──────────────── CS-02
                        STK-05 (Inventario físico) ◄───── CS-02
                                  │
                                  ▼
                        STK-06 (Alertas) ◄─── STK-01 + STK-03 + STK-04
                        STK-07 (Permisos) ◄── STK-01 + STK-03 + STK-04
                                  │
                                  ▼
                        STK-08 (Página frontend) ◄── todos los anteriores
                                  │
                                  ▼
                        STK-09 (Cocina) ◄─── STK-03
                        STK-10 (TPV) ◄────── STK-03
                        STK-11 (Pedidos) ◄── STK-03
                        STK-12 (Compras) ◄── STK-01 + CS-10
                        STK-13 (Informes) ◄─ STK-01 + STK-03 + STK-04 + STK-05
```

---

## NOTAS TÉCNICAS

### Reutilización de componentes `src-delivery/`

| Componente existente | Reutilizar en |
|---------------------|---------------|
| `CrearEscandalloWizard.tsx` | STK-08 → pestaña Recetas (wizard de creación) |
| `DetalleEscandallo.tsx` | STK-08 → pestaña Recetas (tarjeta de detalle) |
| `AjusteStockModal.tsx` | STK-08 → pestaña Stock (ajuste manual) + STK-05 (conteo inventario) |
| `TransferirStockModal.tsx` | STK-08 → pestaña Stock (transferencias) |
| `MermaPorPDVModal.tsx` | STK-08 → pestaña Mermas (gráficos comparativos por sede) |
| `DetalleArticuloRediseñado.tsx` | STK-08 → pestaña Stock (detalle de artículo) |
| `ComprasInventario.tsx` | STK-08 → pestaña Configuración |
| `InformeStock.tsx` | STK-13 → Informes de stock |

### Migración de `CostingPage.tsx` (localStorage → CouchDB)

La `CostingPage` actual tiene un sistema de recetas funcional pero almacenado en `localStorage`. Con STK-01:
1. Las recetas se persisten en CouchDB
2. La `CostingPage` se puede mantener como "calculadora de costes" y enlazar a la gestión real de recetas
3. O se puede redirigir `/saas/costing` a `/saas/vertical/delivery/stock?tab=recetas`

### Nuevo `movementType` para CS-02

STK-03 y STK-04 introducen nuevos tipos de movimiento que deben añadirse al enum de `stock_movement` (CS-02):
- `recipe_consumption` — Consumo por receta al vender
- `waste` — Merma registrada
- `sale_reversal` — Reversión de venta (cancelación de pedido)
