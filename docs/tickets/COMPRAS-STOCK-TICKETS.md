# COMPRAS Y STOCK — Diseño de Tickets

**Página:** `/saas/compras-stock`  
**Objetivo:** Controlar catálogo, compras, stock y almacenes desde una página unificada.

---

## Estado actual del sistema

### Ya implementado (backend + frontend)
- **Catálogo** (`catalog_item`): CRUD completo con `stockQuantity`, `minStock`, `reorderQuantity`, `autoReorder`, `supplierId`
- **Proveedores** (`supplier`): CRUD completo
- **Pedidos de compra** (`purchase_order`): CRUD, estados, envío email/WhatsApp, recepción parcial/total
- **Facturas de compra** (`purchase_invoice`): CRUD, OCR, vínculo con PO
- **Recepción de pedido**: Suma stock al catálogo al marcar recibido
- **Auto-pedido**: Servicio que detecta `stockQuantity < minStock` + `autoReorder`, crea PO draft cada 2h
- **Previsión de demanda**: `getSalesForecast` cruza delivery orders entregados con catálogo
- **Alertas**: `low_stock`, `out_of_stock`, `parts_low_stock`, facturas vencidas (motor cada 1h)
- **Dashboard KPIs**: `criticalStockCount`
- **Repuestos taller** (`part`): CRUD con stock

### Páginas frontend existentes (dispersas)
- `/saas/catalog` — Catálogo de venta
- `/saas/articles` — Stock de artículos (KPIs, ajuste manual)
- `/saas/suppliers` — Proveedores
- `/saas/orders` — Facturas de compra
- `/saas/supplier-billing` — Facturación proveedor + OCR
- `/saas/costing` — Escandallo
- `/saas/delivery-catalog` — Todo-en-uno delivery
- `PurchaseOrdersPage.tsx` — **Existe pero NO está registrada en routes.tsx**

### Brechas detectadas
1. **No hay entidad almacén** — Solo `location` como texto libre en repuestos
2. **No hay movimientos de stock** (kardex) — Solo se actualiza `stockQuantity` directamente
3. **No se descuenta stock al vender/entregar**
4. **No hay consumo interno** ni mermas
5. **No hay alerta de "pedido pendiente de recibir"**
6. **No hay alerta de "stock negativo"**
7. **No hay página unificada** `/saas/compras-stock`
8. **La previsión no alimenta al auto-pedido** — Son sistemas paralelos

---

## TICKETS

---

### TICKET CS-01: Modelo de datos — Entidad `warehouse` (Almacén)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Crear la entidad `warehouse` en CouchDB para gestionar almacenes/ubicaciones de stock. Actualmente no existe ninguna entidad de almacén; solo hay un campo `location` (texto libre) en repuestos.

**Tareas:**

1. **Crear `buildWarehouseDocument` en `services/couchdb.js`:**
   - `type: 'warehouse'`
   - Campos: `_id`, `user_id`, `name`, `code` (código corto único), `address`, `isDefault` (boolean), `active` (boolean), `notes`, `contactPerson`, `phone`, `email`, `type` (enum: `general`, `store`, `workshop`, `cold`, `external`), `createdAt`, `updatedAt`
   - Función `sanitizeWarehouse` con validación de campos obligatorios (`name`, `code`)

2. **Crear `getWarehouseDbName()` o usar BD catálogo existente** (`getCatalogDbName()`):
   - Evaluar: meter en BD catálogo (mismo dominio) o BD separada
   - Recomendación: misma BD catálogo (`getCatalogDbName()`) — mantiene coherencia con `catalog_item` y `supplier`

3. **CRUD en controlador:**
   - `listWarehouses(userId)` — Listar almacenes activos
   - `createWarehouse(userId, data)` — Crear almacén
   - `updateWarehouse(userId, warehouseId, data)` — Actualizar
   - `deleteWarehouse(userId, warehouseId)` — Soft delete (`active: false`)
   - Validar: no permitir eliminar almacén por defecto si tiene stock

4. **Router:**
   - Crear `routers/warehouseRouter.js`
   - Rutas bajo `/api/warehouses/:userId`
   - Montar en `index.js` con `requireAuth`

5. **Cliente TypeScript:**
   - Crear `src/app/lib/warehouseApi.ts` con tipos e interfaces
   - Tipo `Warehouse`, funciones `list/create/update/deleteWarehouseRequest`

**Criterios de aceptación:**
- CRUD funcional vía API
- Al crear la primera cuenta, se crea un almacén por defecto ("Almacén principal")
- No se puede eliminar el último almacén activo
- Tests de endpoint con Postman/curl

---

### TICKET CS-02: Modelo de datos — Entidad `stock_movement` (Movimiento de stock / Kardex)

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** CS-01  

**Descripción:**  
Crear la entidad `stock_movement` para mantener un historial auditable de todos los cambios de stock. Actualmente el sistema solo modifica `stockQuantity` directamente sin dejar rastro del motivo, origen ni destino.

**Tareas:**

1. **Crear `buildStockMovementDocument` en `services/couchdb.js`:**
   - `type: 'stock_movement'`
   - Campos:
     - `_id`, `user_id`
     - `catalogItemId` (ref a `catalog_item`)
     - `catalogItemName`, `sku` (denormalizados para consulta rápida)
     - `warehouseId` (ref a `warehouse`)
     - `warehouseToId` (solo para transferencias entre almacenes)
     - `movementType` — enum:
       - `purchase_reception` — Entrada por recepción de compra
       - `sale` — Salida por venta
       - `internal_consumption` — Consumo interno
       - `adjustment_in` — Ajuste positivo (inventario físico)
       - `adjustment_out` — Ajuste negativo (merma, rotura, caducidad)
       - `transfer` — Transferencia entre almacenes
       - `return_supplier` — Devolución a proveedor
       - `return_customer` — Devolución de cliente
       - `initial` — Stock inicial
     - `quantity` — Siempre positivo; el signo se deduce del tipo
     - `previousStock` — Stock antes del movimiento
     - `newStock` — Stock después del movimiento
     - `unitCost` — Coste unitario del movimiento
     - `totalCost` — Coste total
     - `referenceId` — ID del documento origen (pedido, venta, etc.)
     - `referenceType` — Tipo del documento origen (`purchase_order`, `delivery_order`, `work_order`, etc.)
     - `notes`
     - `performedBy` — Usuario que realizó el movimiento
     - `createdAt`
   - Función `sanitizeStockMovement`

2. **Servicio `services/stockMovementService.js`:**
   - `recordMovement(userId, movementData)` — Crea el documento y actualiza `stockQuantity` del `catalog_item` de forma atómica (leer → calcular → escribir con `_rev`)
   - `getMovementsByItem(userId, catalogItemId, dateRange?)` — Historial de un producto
   - `getMovementsByWarehouse(userId, warehouseId, dateRange?)` — Historial de un almacén
   - `getMovementsSummary(userId, dateRange?)` — Resumen: entradas, salidas, valoración
   - Manejo de conflictos CouchDB (`409 Conflict`) con retry

3. **Router y controlador:**
   - `routers/stockMovementRouter.js` bajo `/api/stock-movements/:userId`
   - Endpoints:
     - `GET /` — Listado con filtros (tipo, producto, almacén, rango fechas)
     - `GET /item/:catalogItemId` — Historial de producto
     - `GET /warehouse/:warehouseId` — Historial de almacén
     - `GET /summary` — Resumen valorado
     - `POST /adjustment` — Registrar ajuste manual (in/out)
     - `POST /transfer` — Transferencia entre almacenes
     - `POST /internal-consumption` — Consumo interno

4. **Cliente TypeScript:**
   - `src/app/lib/stockMovementApi.ts`
   - Tipos `StockMovement`, `MovementType`, funciones request

**Criterios de aceptación:**
- Todo cambio de stock pasa por `recordMovement` (nunca se modifica `stockQuantity` directamente)
- El historial muestra stock anterior y posterior en cada línea
- Filtros funcionales por tipo, producto, almacén y fechas
- El ajuste manual requiere campo `notes` obligatorio

---

### TICKET CS-03: Refactorizar stock del catálogo para soporte multi-almacén

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** CS-01, CS-02  

**Descripción:**  
Adaptar el modelo `catalog_item` para soportar stock por almacén, manteniendo retrocompatibilidad con `stockQuantity` como campo agregado.

**Tareas:**

1. **Añadir campo `warehouseStock` a `catalog_item`:**
   ```json
   {
     "stockQuantity": 150,
     "warehouseStock": [
       { "warehouseId": "wh_001", "warehouseName": "Principal", "quantity": 100 },
       { "warehouseId": "wh_002", "warehouseName": "Tienda", "quantity": 50 }
     ]
   }
   ```
   - `stockQuantity` sigue siendo la suma total (retrocompatible)
   - `warehouseStock` es el desglose por almacén

2. **Actualizar `buildCatalogItemDocument` y `sanitizeCatalogItem`:**
   - Incluir `warehouseStock` como campo opcional (array)
   - Si no se proporciona, asumir todo el stock en almacén por defecto

3. **Actualizar `stockMovementService.recordMovement`:**
   - Al registrar movimiento, actualizar tanto `warehouseStock[x].quantity` como el `stockQuantity` total
   - En transferencias: restar del origen, sumar al destino

4. **Migración suave de datos existentes:**
   - Crear script o lógica en lectura: si un `catalog_item` no tiene `warehouseStock`, inferir que todo está en almacén por defecto
   - No romper nada existente

5. **Actualizar endpoints que leen stock:**
   - `getLowStockReport`: desglosar por almacén opcionalmente
   - `getSalesForecast`: seguir usando total agregado
   - Dashboard KPIs: seguir usando total agregado

**Criterios de aceptación:**
- Un producto puede tener stock en N almacenes
- `stockQuantity` siempre refleja la suma total
- Los datos existentes sin `warehouseStock` siguen funcionando
- La UI puede mostrar desglose por almacén

---

### TICKET CS-04: Automatización — Venta resta stock

**Tipo:** Feature — Backend  
**Prioridad:** Crítica  
**Dependencias:** CS-02  

**Descripción:**  
Implementar la resta automática de stock cuando se completa una venta (delivery, TPV, web, etc.). Actualmente **no se descuenta stock al vender**, lo que significa que `stockQuantity` solo refleja entradas, no salidas.

**Tareas:**

1. **`deliveryController.js` — Al entregar pedido (`status: 'delivered'`):**
   - Para cada línea del `delivery_order`, llamar a `stockMovementService.recordMovement` con `movementType: 'sale'`
   - Vincular con `referenceId: deliveryOrderId`, `referenceType: 'delivery_order'`
   - Usar `catalogItemId` de la línea (si existe) para descuento preciso
   - Si solo hay nombre, intentar match por nombre/SKU (con log de warning)

2. **Pedidos web (`web_order`):**
   - Al confirmar/completar pedido web, descontar stock
   - Evaluar: descontar al confirmar pago o al marcar enviado (según política)
   - Registrar movimiento con `referenceType: 'web_order'`

3. **TPV / punto de venta:**
   - Al registrar venta en TPV, descontar stock de los artículos vendidos
   - Registrar movimiento con `referenceType: 'tpv_sale'`

4. **Prevención de stock negativo (configurable):**
   - Campo en `account.stockConfig`: `allowNegativeStock` (boolean, default: `true`)
   - Si `false`: rechazar la venta si no hay stock suficiente
   - Si `true`: permitir pero generar alerta `negative_stock`

5. **Idempotencia:**
   - No descontar dos veces si se actualiza el mismo pedido
   - Verificar que no exista ya un movimiento con el mismo `referenceId` y `movementType`

**Criterios de aceptación:**
- Al entregar un delivery_order, el stock se reduce automáticamente
- Al completar un web_order, el stock se reduce
- Al registrar venta TPV, el stock se reduce
- El movimiento queda registrado en el kardex con referencia al origen
- No se producen descuentos duplicados
- Configurable: permitir o bloquear venta sin stock

---

### TICKET CS-05: Automatización — Consumo interno resta stock

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** CS-02  

**Descripción:**  
Permitir registrar consumo interno de productos (uso propio, muestras, eventos, limpieza, etc.) que descuente stock correctamente.

**Tareas:**

1. **Endpoint `POST /api/stock-movements/:userId/internal-consumption`:**
   - Body: `{ catalogItemId, quantity, warehouseId?, reason, notes? }`
   - `reason` — enum: `internal_use`, `sample`, `breakage`, `expiry`, `event`, `other`
   - Registra movimiento tipo `internal_consumption`
   - Descuenta stock

2. **Consumo desde órdenes de trabajo (taller):**
   - Al usar repuestos en un `work_order`, registrar movimiento `internal_consumption` con `referenceType: 'work_order'`
   - Actualmente el taller tiene `part` como entidad separada; evaluar si los consumos de taller también pasan por este sistema o se mantienen separados

3. **Consumo desde escandallo/recetas:**
   - Si un producto es "combo" con receta, al vender el combo descontar los ingredientes
   - Opcional: Integrar con `CostingPage` para automatizar descuento de ingredientes

**Criterios de aceptación:**
- Se puede registrar consumo interno desde la UI
- El motivo es obligatorio
- El movimiento queda en el kardex
- El stock se actualiza correctamente

---

### TICKET CS-06: Automatización — Mejorar sugerencia de compra

**Tipo:** Enhancement — Backend  
**Prioridad:** Media  
**Dependencias:** CS-02, CS-04  

**Descripción:**  
Conectar la previsión de demanda (`getSalesForecast`) con el sistema de auto-pedido y mejorar la calidad de las sugerencias.

**Tareas:**

1. **Mejorar `getSalesForecast` en `purchaseOrderController.js`:**
   - Cruzar por `catalogItemId` en lugar de solo por nombre normalizado (más fiable)
   - Ampliar fuentes de consumo: incluir `stock_movement` tipo `sale` + `internal_consumption` (no solo delivery orders)
   - Calcular tendencia (creciente/decreciente/estable) para ajustar sugerencia

2. **Conectar forecast con `autoOrderService.js`:**
   - Además del criterio `stockQuantity < minStock`, evaluar:
     - Si cobertura < X semanas (configurable, ej: 2), sugerir compra
     - Si tendencia creciente, aplicar factor de seguridad
   - Campo en `account.purchaseConfig`: `forecastWeeksAhead` (default: 2), `useForecasting` (boolean)

3. **Nuevo endpoint `GET /api/purchase-orders/:userId/suggestions`:**
   - Devuelve lista de productos que necesitan reposición con:
     - Stock actual, mínimo, consumo semanal promedio, cobertura estimada, cantidad sugerida, proveedor
   - Permite al usuario aceptar sugerencias y convertirlas en pedidos de compra

4. **Notificación de sugerencia:**
   - Si hay sugerencias pendientes, notificar al usuario (no crear pedido automáticamente a menos que `autoReorder` esté activo)

**Criterios de aceptación:**
- La sugerencia cruza por ID de producto (no solo nombre)
- El forecast incluye ventas + consumo interno
- El usuario puede ver sugerencias y convertirlas en PO con un clic
- El auto-pedido puede usar la previsión opcionalmente

---

### TICKET CS-07: Alertas — Pedido pendiente de recibir

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna  

**Descripción:**  
Añadir alerta en `alertEngine.js` para pedidos de compra que llevan demasiado tiempo sin recibirse.

**Tareas:**

1. **Nueva regla en `alertEngine.js`:**
   - Nombre: `pending_purchase_order`
   - Lógica: buscar `purchase_order` con `status` in (`sent`, `pending`, `partial`) donde:
     - `expectedDate` ha pasado y no se ha recibido completamente, **o**
     - Han pasado más de X días desde `sentAt` sin `expectedDate` (umbral configurable)
   - Categoría: `purchase_order`
   - Nivel: `warning` si < 7 días de retraso, `critical` si > 7 días

2. **Configuración en `alertConfig`:**
   - `pendingOrderEnabled` (boolean, default: `true`)
   - `pendingOrderDaysThreshold` (number, default: 7)

3. **Ruta de la notificación:**
   - Apuntar a la página de pedidos de compra: `/saas/compras-stock?tab=pedidos&orderId={id}`

4. **Incluir en `getAlertSummary`:**
   - Nuevo campo `pendingOrdersCount` en el resumen de alertas

**Criterios de aceptación:**
- Se genera alerta cuando un pedido enviado no se recibe en plazo
- La alerta lleva al detalle del pedido
- Configurable por cuenta
- Se deduplica correctamente (una alerta por pedido por día)

---

### TICKET CS-08: Alertas — Stock negativo

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** CS-04  

**Descripción:**  
Añadir alerta en `alertEngine.js` cuando un producto tiene `stockQuantity < 0`.

**Tareas:**

1. **Nueva regla en `alertEngine.js`:**
   - Nombre: `negative_stock`
   - Lógica: buscar `catalog_item` con `stockQuantity < 0`
   - Categoría: `stock`
   - Nivel: `critical`
   - Incluir en el mensaje: nombre del producto, cantidad negativa, último movimiento

2. **Configuración en `alertConfig`:**
   - `negativeStockEnabled` (boolean, default: `true`)

3. **Alerta inmediata (no solo periódica):**
   - En `stockMovementService.recordMovement`, si el `newStock` es negativo, emitir alerta inmediata vía SSE/Push además de dejarla para el motor periódico

4. **Ruta de la notificación:**
   - `/saas/compras-stock?tab=stock&itemId={id}`

**Criterios de aceptación:**
- Se detecta stock negativo tanto en el ciclo periódico como en tiempo real
- La alerta es nivel `critical`
- Incluye información del producto y la cantidad
- Se envía push/SSE inmediato al producirse

---

### TICKET CS-09: Registrar `PurchaseOrdersPage` en el router

**Tipo:** Bugfix — Frontend  
**Prioridad:** Crítica  
**Dependencias:** Ninguna  

**Descripción:**  
El componente `PurchaseOrdersPage.tsx` ya existe con funcionalidad completa (listar, crear, editar, enviar, recibir, auto-generar, stock bajo, wizard), pero **no está registrado en `routes.tsx`** y por tanto no es accesible.

**Tareas:**

1. **Registrar en `routes.tsx`:**
   - Importar `PurchaseOrdersPage`
   - Asignar a la ruta `/saas/purchase-orders` (temporal hasta que se construya la página unificada)

2. **Añadir entrada en `Sidebar.tsx`:**
   - Ya existe `id: 'purchase-orders'` en el grupo `catalogProviders`, pero falta el `menuItemDef`
   - Crear entrada con icono adecuado (ej: `ShoppingCart` o `ClipboardList`), ruta `/saas/purchase-orders`, key i18n `nav.purchaseOrders`

3. **Verificar que `OrderReceptionView.tsx` y `NewOrderWizard.tsx` funcionan correctamente** al navegar desde la página registrada

**Criterios de aceptación:**
- La página es accesible desde el sidebar y por URL directa
- Todas las funcionalidades existentes (CRUD, envío, recepción, wizard) operan correctamente
- Aparece en el grupo "Catálogo y Proveedores" del menú

---

### TICKET CS-10: Página unificada `/saas/compras-stock`

**Tipo:** Feature — Frontend  
**Prioridad:** Crítica  
**Dependencias:** CS-01, CS-02, CS-09  

**Descripción:**  
Crear la página hub `/saas/compras-stock` que unifique todo el módulo de compras y stock en una sola interfaz con navegación por pestañas.

**Diseño de pestañas:**

| Pestaña | Contenido | Fuente actual |
|---------|-----------|---------------|
| **Catálogo** | Productos y servicios del catálogo | `CatalogPage` (adaptar) |
| **Stock** | Inventario con desglose por almacén, KPIs, ajustes | `ArticlesPage` (adaptar) |
| **Almacenes** | CRUD de almacenes, stock por ubicación | Nuevo (CS-01) |
| **Proveedores** | Gestión de proveedores | `SuppliersPage` (adaptar) |
| **Pedidos** | Órdenes de compra, envío, recepción | `PurchaseOrdersPage` (adaptar) |
| **Recepciones** | Recepción de mercancía, validación, entrada al almacén | `OrderReceptionView` (adaptar) |
| **Movimientos** | Kardex, historial de movimientos, filtros | Nuevo (CS-02) |
| **Facturación** | Facturas de compra, OCR | `SupplierBillingPage` (adaptar) |

**Tareas:**

1. **Crear `src/app/pages/saas/ComprasStockPage.tsx`:**
   - Layout con header: título, KPIs rápidos (productos totales, valor stock, alertas activas, pedidos pendientes)
   - Navegación por pestañas (tabs) — URL param `?tab=catalogo|stock|almacenes|proveedores|pedidos|recepciones|movimientos|facturacion`
   - Cada pestaña carga su contenido de forma lazy

2. **KPIs del header (barra superior):**
   - Total productos activos
   - Valor total del stock (sum de `stockQuantity * costPrice`)
   - Productos bajo mínimo (count)
   - Productos agotados (count)
   - Pedidos pendientes de recibir (count)
   - Último movimiento de stock (fecha)

3. **Pestaña Catálogo:**
   - Reusar lógica de `CatalogPage` como componente embebido
   - Filtros: categoría, proveedor, estado (activo/inactivo), tipo (producto/servicio/combo)
   - Acciones: crear, editar, importar, IA
   - Vista tabla y vista tarjetas

4. **Pestaña Stock:**
   - Reusar lógica de `ArticlesPage` como componente embebido
   - Añadir selector de almacén para filtrar
   - Semáforo visual: verde (OK), amarillo (bajo mínimo), rojo (agotado), negro (negativo)
   - Acciones: ajuste de stock, transferencia entre almacenes
   - Gráfico de evolución de stock por producto

5. **Pestaña Almacenes:**
   - CRUD de almacenes (CS-01)
   - Por cada almacén: listado de productos con stock, valor total
   - Mapa o layout visual (opcional, fase 2)

6. **Pestaña Proveedores:**
   - Reusar lógica de `SuppliersPage` como componente embebido
   - Añadir: productos vinculados, historial de pedidos, valoración

7. **Pestaña Pedidos:**
   - Reusar lógica de `PurchaseOrdersPage` como componente embebido
   - Tabs internos: Borradores, Pendientes, Enviados, Parciales, Recibidos, Cancelados
   - Botón "Sugerencia de compra" (CS-06)
   - Botón "Auto-generar pedidos"

8. **Pestaña Recepciones:**
   - Lista de pedidos pendientes de recibir
   - Flujo de recepción: escanear/seleccionar pedido → validar líneas → confirmar cantidades → entrada a almacén
   - Historial de recepciones

9. **Pestaña Movimientos:**
   - Tabla de movimientos con filtros: tipo, producto, almacén, fecha, usuario
   - Exportar a CSV/Excel
   - Resumen: entradas vs salidas, valoración del período

10. **Pestaña Facturación:**
    - Reusar lógica de `SupplierBillingPage` como componente embebido
    - Flujo OCR integrado

11. **Registrar ruta en `routes.tsx`:**
    - `path: 'compras-stock'`, componente `ComprasStockPage`
    - Mantener rutas antiguas como redirects para no romper enlaces

12. **Actualizar `Sidebar.tsx`:**
    - Reemplazar grupo `catalogProviders` por una sola entrada: "Compras y Stock" → `/saas/compras-stock`
    - O bien: mantener grupo con subitems que apunten a `?tab=X`

**Criterios de aceptación:**
- Página accesible en `/saas/compras-stock`
- Todas las pestañas cargan y funcionan
- KPIs del header se actualizan en tiempo real
- Deep linking: `?tab=stock&itemId=123` abre la pestaña stock con el producto seleccionado
- Responsive: funciona en tablet y móvil
- Las rutas antiguas (`/saas/catalog`, `/saas/articles`, etc.) redirigen a la pestaña correspondiente

---

### TICKET CS-11: Refactorizar recepción de pedidos como flujo formal

**Tipo:** Enhancement — Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** CS-02, CS-03  

**Descripción:**  
Mejorar el flujo de recepción para que sea un proceso formal con trazabilidad completa, soporte multi-almacén y registro en el kardex.

**Tareas:**

1. **Backend — Actualizar `markOrderReceived` en `purchaseOrderController.js`:**
   - En lugar de actualizar `stockQuantity` directamente, llamar a `stockMovementService.recordMovement` por cada línea
   - Parámetro obligatorio: `warehouseId` destino
   - Registrar movimiento tipo `purchase_reception` con `referenceId: purchaseOrderId`
   - Soportar recepción parcial: permitir recibir menos cantidad de la pedida → estado `partial`
   - Soportar recepción en múltiples almacenes (una línea puede ir a distintos almacenes)

2. **Backend — Crear entidad de recepción (`purchase_reception`) en CouchDB:**
   - `type: 'purchase_reception'`
   - Campos: `purchaseOrderId`, `receivedBy`, `receivedAt`, `lines[]` (con `catalogItemId`, `quantityReceived`, `warehouseId`, `notes`, `qualityStatus`), `notes`, `attachments` (fotos del albarán)
   - Esto da historial de recepciones separado del pedido

3. **Frontend — Mejorar `OrderReceptionView.tsx`:**
   - Selector de almacén destino por línea
   - Campo de cantidad recibida vs cantidad pedida (con visual de discrepancia)
   - Estado de calidad por línea: `ok`, `damaged`, `wrong_item`, `short`
   - Botón de foto/adjunto para el albarán
   - Resumen antes de confirmar

4. **Backend — Endpoint `GET /api/purchase-orders/:userId/receptions`:**
   - Listar todas las recepciones con filtros por pedido, proveedor, fecha
   - Incluir en la pestaña "Recepciones" de CS-10

**Criterios de aceptación:**
- La recepción genera movimientos de stock en el kardex
- Se puede recibir en almacén específico
- Las recepciones parciales se registran individualmente
- El pedido refleja el total acumulado de recepciones
- Hay historial de recepciones consultable

---

### TICKET CS-12: Integrar descuento de stock con recepción de compra mejorada

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** CS-02, CS-11  

**Descripción:**  
Asegurar que la cadena completa "compra → recepción → stock" queda reflejada correctamente en el kardex y actualiza todos los campos necesarios.

**Tareas:**

1. **Actualizar coste medio del producto al recibir:**
   - Al recibir unidades, recalcular `costPrice` del `catalog_item` como media ponderada:
     ```
     nuevoCosteMedio = (stockAnterior * costeAnterior + cantidadRecibida * costeCompra) / stockNuevo
     ```
   - Guardar en `catalog_item.costPrice`

2. **Actualizar `lastPurchaseDate` y `lastPurchasePrice` del `catalog_item`:**
   - Útil para informes y para la UI de stock

3. **Si `autoReorder` está activo y el stock ya supera el mínimo:**
   - Cancelar o cerrar pedidos automáticos (`source: 'auto'`, `status: 'draft'`) del mismo proveedor para ese producto
   - Evitar acumulación de borradores obsoletos

**Criterios de aceptación:**
- El coste medio se recalcula automáticamente al recibir
- Se registran `lastPurchaseDate` y `lastPurchasePrice`
- Los borradores automáticos obsoletos se limpian

---

### TICKET CS-13: Conexión con Finanzas

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** CS-02, CS-11  

**Descripción:**  
Integrar los movimientos de compra y stock con el módulo de Finanzas (`/api/finance`).

**Tareas:**

1. **Al registrar factura de compra pagada:**
   - Crear automáticamente un movimiento financiero (`type: 'pago'`) en `getFinanceDbName()` con:
     - `concept`: "Compra a [proveedor] - Factura [número]"
     - `amount`: total de la factura
     - `category`: `purchase` o `supplier_payment`
     - `referenceId`: ID de la `purchase_invoice`
   - Configurable: `account.financeConfig.autoCreatePayments` (boolean)

2. **Valoración de stock en Dashboard financiero:**
   - Endpoint `GET /api/finance/:userId/stock-valuation`:
     - Valor total del stock (sum `stockQuantity * costPrice`)
     - Valor por almacén
     - Valor por categoría
   - Incluir en KPIs del Dashboard

3. **Conciliación facturas compra ↔ pagos:**
   - Desde `SupplierBillingPage`, vincular factura con pago financiero
   - Estado de la factura: pendiente, parcialmente pagada, pagada
   - Alerta de facturas vencidas ya existe en `alertEngine.js` → verificar que funciona con el nuevo flujo

**Criterios de aceptación:**
- Las facturas de compra pagadas generan movimiento financiero automáticamente
- El dashboard muestra valoración del stock
- Las facturas pueden vincularse a pagos

---

### TICKET CS-14: Conexión con OCR

**Tipo:** Enhancement — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** CS-10  

**Descripción:**  
Mejorar la integración de OCR para automatizar la entrada de facturas de compra y pedidos.

**Tareas:**

1. **Flujo OCR → Factura de compra:**
   - Ya existe parcialmente (`purchase_invoice.ocrData`, `ocrImageBase64`, `/api/ocr/scan`)
   - Mejorar: al escanear una factura/albarán, pre-rellenar:
     - Proveedor (match por CIF/nombre)
     - Líneas de producto (match por nombre/SKU con catálogo)
     - Totales, impuestos, fecha
   - Botón "Validar y guardar" que crea la factura + opcionalmente el movimiento de stock

2. **Flujo OCR → Recepción de pedido:**
   - Escanear albarán de entrega → identificar pedido de compra asociado (por número de pedido, proveedor)
   - Pre-rellenar cantidades recibidas
   - Botón "Confirmar recepción" que ejecuta el flujo de recepción (CS-11)

3. **OCR en la pestaña Facturación de CS-10:**
   - Integrar scanner directamente en la pestaña
   - Flujo guiado: escanear → revisar → confirmar → registrar

**Criterios de aceptación:**
- El OCR identifica proveedor y productos del catálogo
- Pre-rellena formularios de factura y recepción
- El usuario solo necesita validar y confirmar

---

### TICKET CS-15: Conexión con Dashboard

**Tipo:** Enhancement — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** CS-02, CS-04  

**Descripción:**  
Ampliar los KPIs del Dashboard (`/api/dashboard/kpis/:userId`) con métricas de compras y stock.

**Tareas:**

1. **Nuevos KPIs en el endpoint de Dashboard:**
   - `stockValue` — Valor total del stock
   - `stockValueChange` — Variación respecto al mes anterior
   - `purchaseOrdersPending` — Pedidos pendientes de recibir
   - `purchaseOrdersOverdue` — Pedidos con retraso
   - `topMovingProducts` — Top 5 productos más vendidos (por movimientos de salida)
   - `slowMovingProducts` — Top 5 productos sin movimiento en X días
   - `stockTurnover` — Rotación de inventario (coste ventas / stock medio)
   - `purchasesMonth` — Total compras del mes

2. **Widgets en Dashboard.tsx:**
   - Tarjeta "Compras y Stock" con los KPIs principales
   - Click lleva a `/saas/compras-stock`
   - Mini gráfico de evolución de stock (últimos 30 días)
   - Semáforo de alertas de stock

3. **Actualizar `criticalStockCount` existente:**
   - Incluir desglose: bajo mínimo, agotados, negativos
   - Ruta del enlace: cambiar de `/saas/catalog` a `/saas/compras-stock?tab=stock`

**Criterios de aceptación:**
- Dashboard muestra métricas de stock y compras
- Los enlaces llevan a la pestaña correcta de Compras y Stock
- Los datos se actualizan en tiempo real

---

### TICKET CS-16: Conexión con Verticales

**Tipo:** Enhancement — Backend + Frontend  
**Prioridad:** Baja  
**Dependencias:** CS-10  

**Descripción:**  
Asegurar que la página de Compras y Stock se adapta a cada vertical de negocio usando la configuración de `verticalCatalog.js`.

**Tareas:**

1. **Adaptar campos visibles por vertical:**
   - `verticalCatalog.js` ya define `hasStock`, `hasSupplier`, `hasAllergens`, etc. por tipo de negocio
   - La página Compras y Stock debe respetar estos flags:
     - Si `hasStock: false` → ocultar pestaña Stock y Almacenes
     - Si `hasSupplier: false` → ocultar pestaña Proveedores
     - Mostrar campos específicos del vertical (alérgenos para hostelería, compatibilidad para taller, etc.)

2. **Integrar repuestos de taller (`part`):**
   - Para el vertical taller, la pestaña Stock también debe mostrar repuestos (`/api/workshop/parts`)
   - Unificar vista: productos de catálogo + repuestos en una sola tabla con filtro de tipo
   - Los movimientos de stock de repuestos también pasan por el kardex (CS-02)

3. **Integrar stock de vehículos (concesionario):**
   - Para el vertical concesionario, añadir sub-pestaña o sección "Vehículos en stock"
   - Link a `/saas/vehicles` para gestión detallada

4. **Adaptar categorías y unidades por vertical:**
   - Las categorías del selector vienen de `verticalCatalog.js`
   - Las unidades de medida varían por vertical (kg, litros, unidades, metros, etc.)

**Criterios de aceptación:**
- La página se adapta visualmente al vertical del negocio
- Solo se muestran pestañas y campos relevantes
- Los repuestos de taller se integran en el flujo de stock
- Las categorías y unidades reflejan el vertical

---

### TICKET CS-17: Mínimos por producto — Configuración avanzada

**Tipo:** Enhancement — Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** CS-03, CS-06  

**Descripción:**  
Mejorar la configuración de mínimos de stock por producto, que actualmente es un campo simple (`minStock`).

**Tareas:**

1. **Mínimos por almacén:**
   - Ampliar `warehouseStock[]` con campo `minStock` por almacén:
     ```json
     {
       "warehouseStock": [
         { "warehouseId": "wh_001", "quantity": 100, "minStock": 20 },
         { "warehouseId": "wh_002", "quantity": 50, "minStock": 10 }
       ]
     }
     ```
   - El `minStock` general del producto es la referencia; el de almacén es opcional

2. **Stock máximo:**
   - Nuevo campo `maxStock` en `catalog_item`
   - Alerta si se supera (evita sobre-stock y costes de almacenaje)
   - Bloquear auto-pedido si stock > maxStock

3. **Mínimos dinámicos (fase 2):**
   - Opción de calcular `minStock` automáticamente basado en consumo medio semanal * semanas de cobertura deseadas
   - Campo `coverageWeeks` en `catalog_item`
   - Recalcular periódicamente con datos del kardex

4. **UI de configuración masiva:**
   - En la pestaña Stock de CS-10: botón "Configurar mínimos"
   - Tabla editable: producto, stock actual, mínimo actual, máximo, auto-reorder, semanas cobertura
   - Guardar cambios en lote

**Criterios de aceptación:**
- Se pueden configurar mínimos por almacén
- Se puede configurar stock máximo
- Los mínimos dinámicos se recalculan automáticamente
- Edición masiva funcional

---

## RESUMEN Y ORDEN DE EJECUCIÓN

### Fase 1 — Fundamentos (semanas 1-2)
| Ticket | Nombre | Prioridad |
|--------|--------|-----------|
| CS-09 | Registrar PurchaseOrdersPage en router | Crítica |
| CS-01 | Entidad warehouse | Alta |
| CS-02 | Entidad stock_movement (kardex) | Alta |
| CS-07 | Alerta pedido pendiente recibir | Alta |

### Fase 2 — Automatización core (semanas 3-4)
| Ticket | Nombre | Prioridad |
|--------|--------|-----------|
| CS-03 | Soporte multi-almacén en catálogo | Alta |
| CS-04 | Venta resta stock | Crítica |
| CS-08 | Alerta stock negativo | Alta |
| CS-11 | Refactorizar recepción | Alta |

### Fase 3 — Página unificada (semanas 5-7)
| Ticket | Nombre | Prioridad |
|--------|--------|-----------|
| CS-10 | Página unificada /saas/compras-stock | Crítica |
| CS-12 | Integrar coste medio en recepción | Alta |
| CS-05 | Consumo interno | Media |

### Fase 4 — Integraciones y mejoras (semanas 8-10)
| Ticket | Nombre | Prioridad |
|--------|--------|-----------|
| CS-06 | Mejorar sugerencia de compra | Media |
| CS-13 | Conexión con Finanzas | Media |
| CS-14 | Conexión con OCR | Media |
| CS-15 | Conexión con Dashboard | Media |
| CS-16 | Conexión con Verticales | Baja |
| CS-17 | Mínimos avanzados | Media |
