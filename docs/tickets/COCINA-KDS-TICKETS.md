# COCINA / KDS — Diseño de Tickets

**Página:** `/saas/vertical/delivery/cocina`  
**Objetivo:** Gestionar la producción de pedidos de forma visual y rápida con una vista tipo Kitchen Display System.

---

## Estado auditado (08/07/2026)

~75% implementado (este ticket no usa checkboxes; auditoría por bloques). Hecho: KDS-01/02 (items con `extras`, `allergens`, `ingredients`, `outOfStock`, `catalogItemId` y pedido con `takenBy/takenByName/takenAt`, `salesPointId`, `kitchenNotes`, `kitchenPriority` en `buildDeliveryOrderDocument`), KDS-03 (auto-timestamps por transición + `stageHistory`), KDS-07/08/09/10/11/12 (página `DeliveryKitchen.tsx` con Kanban, `KitchenOrderCard`, `KanbanColumn`, acciones tomar/listo/incidencia, modal de incidencia, toggle Kanban/lista), KDS-13 (tiempo real vía `useDeliveryOrdersLive`: SSE + fallback polling 30s), KDS-16 parcial (sonido de nuevo pedido con toggle persistido) y KDS-17 (marcar agotado desde tarjeta con confirmación). Desviaciones: ruta final `/saas/delivery-kitchen` (no `/saas/vertical/delivery/cocina`; `/saas/cocina` va al KDS de restaurante). Falta de verdad: KDS-04 no tiene endpoints dedicados `out-of-stock` (el frontend lo hace con updates genéricos de catálogo/pedidos), KDS-06 no existe (`/kitchen-metrics` sin implementar) y las alertas de cocina viven en `deliveryAlertEngine.js` (saturación/retraso) sin las reglas `kitchen_queue_high`/`kitchen_overload` como tales.

---

## Estado actual del sistema

### Ya implementado (backend)

- **Documento `delivery_order`** en CouchDB con CRUD completo (`deliveryRouter.js` → `deliveryController.js` → `couchdb.js`).
- **Estados del pedido:** `nuevo` → `cocina` → `listo` → `entregado` | `cancelled` | `incident` (migrados a español).
- **Campos de timestamps cocina:** `kitchenStartedAt`, `kitchenCompletedAt`, `assemblyStartedAt`, `assemblyCompletedAt`.
- **`stageHistory`:** Array de `{ status, date, user, notes }` para trazabilidad de transiciones.
- **`incidentNotes`** e **`incidentType`:** campos de texto plano para incidencias.
- **Catálogo** (`catalog_item`): incluye `allergens[]`, `available` (boolean), `stockQuantity`, `category`, `salesPointId`.
- **Puntos de venta** (`point_of_sale`): CRUD con `name`, `code`, `address`, `terminals[]`.
- **Motor de alertas** (`alertEngine.js`): regla `stale_delivery` que avisa de pedidos retrasados (`staleDeliveryMinutes`).
- **SSE** (`sseRouter.js` + `sseService.js`): `broadcastToUser` / `broadcastToBusiness` para notificaciones en tiempo real.
- **Push web:** `sendPushToUser` integrado con el motor de alertas.

### Ya implementado (frontend)

- **`/saas/delivery`** (`Delivery.tsx` — ~2100 líneas): página monolítica con pestañas Cocina / Montaje / Reparto / Historial / Sesiones / PDV. Incluye avance de estados, wizard de crear pedido, KPIs básicos, checklist de montaje, gestión de sesiones de caja y PDV.
- **`/saas/worker/tpv`** (`WorkerTpvDelivery.tsx` — 490 líneas): vista trabajador con pestañas Cocina / Montaje / Reparto / Todos. Tarjetas de pedido con avance de estado, búsqueda, contadores, polling cada 30s.
- **`src-delivery/CocinaTabNew.tsx`** (prototipo no integrado): UI KDS con columnas por estado (`en_cola`, `preparando`, `listo`), filtros por sede, ingredientes por item, incidencias por item, notas rápidas — usa **datos mock**, no está conectado al API real.
- **Sidebar:** grupo `delivery` con items `tpv`, `tpv-locales`, `delivery`, `delivery-catalog`, `web-orders`, `web-config`.
- **Hook SSE:** `useSSE.ts` disponible para suscripción a eventos del servidor.

### Brechas detectadas

1. **No existe ruta `/saas/vertical/delivery/cocina`** — La cocina es solo una pestaña dentro de `Delivery.tsx`, no una página dedicada.
2. **`DeliveryOrderItem` carece de campos clave para KDS:** no tiene `extras`, `allergens`, `ingredients`, `category` ni `catalogItemId` (enlace al catálogo).
3. **No hay campo `takenBy` / `assignedCook`** — No se registra quién toma un pedido en cocina.
4. **No hay filtrado por sede/PDV** en la vista de cocina actual (`Delivery.tsx` muestra todos los pedidos del negocio).
5. **No hay "producto agotado" en directo** — No se puede marcar un item como no disponible desde la cocina y propagarlo al catálogo.
6. **No hay alertas específicas de cocina:** cola alta, demasiados pedidos acumulados, incidencia de cocina.
7. **No hay métricas de tiempos medios de producción** — Los timestamps existen pero no se calculan ni muestran promedios.
8. **No hay auto-enrutamiento Sala vs Reparto** — Al marcar "Listo" siempre va a `assembly`; no distingue entre pedidos de sala (recogida en local) y reparto (domicilio).
9. **No hay acción "Tomar pedido"** diferenciada — Pasar a `kitchen` y registrar el cocinero responsable.
10. **El prototipo `src-delivery/CocinaTabNew.tsx`** tiene buena UX pero usa datos mock y no está integrado.

---

## TICKETS

---

### TICKET KDS-01: Modelo de datos — Ampliar `DeliveryOrderItem` con campos KDS

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna

**Descripción:**  
El `DeliveryOrderItem` actual solo tiene `id`, `name`, `quantity`, `unitPrice`, `total`, `notes`. Para que la cocina pueda trabajar eficazmente, cada línea de pedido necesita mostrar extras, alérgenos, ingredientes clave y enlazarse con el catálogo.

**Tareas:**

1. **Ampliar `DeliveryOrderItem` en `buildDeliveryOrderDocument`** (`services/couchdb.js`, ~línea 3024):
   - Añadir campos opcionales que se preservan del catálogo al crear el pedido:
     - `catalogItemId: string` — referencia al `_id` del `catalog_item`
     - `category: string` — categoría del producto (e.g. "Principales", "Bebidas", "Postres")
     - `extras: string[]` — extras seleccionados (e.g. ["Extra queso", "Doble bacon"])
     - `allergens: string[]` — alérgenos del producto (copiados del catálogo al crear pedido)
     - `ingredients: Array<{ name: string; quantity: string }>` — ingredientes clave
     - `outOfStock: boolean` — marcado como agotado desde cocina (default `false`)
     - `outOfStockAt: string` — timestamp de cuando se marcó agotado
   - Sanitizar en `sanitizeDeliveryOrder`: preservar estos campos si existen, defaultear a valores vacíos.

2. **Ampliar tipo TypeScript** en `src/app/lib/deliveryApi.ts`:
   ```typescript
   export interface DeliveryOrderItem {
     id: string;
     name: string;
     quantity: number;
     unitPrice: number;
     total: number;
     notes?: string;
     catalogItemId?: string;
     category?: string;
     extras?: string[];
     allergens?: string[];
     ingredients?: { name: string; quantity: string }[];
     outOfStock?: boolean;
     outOfStockAt?: string;
   }
   ```

3. **Retrocompatibilidad:** Los pedidos existentes no tendrán estos campos; el frontend debe tratar `undefined` como ausente sin error.

**Criterio de aceptación:**
- Crear un pedido con items que incluyan `extras`, `allergens`, `ingredients` → se persisten en CouchDB.
- Leer un pedido antiguo (sin estos campos) → no rompe.
- El campo `outOfStock` se puede actualizar individualmente por item.

---

### TICKET KDS-02: Modelo de datos — Campos de cocina en `delivery_order`

**Tipo:** Feature — Backend  
**Prioridad:** Alta  
**Dependencias:** Ninguna

**Descripción:**  
Ampliar el documento `delivery_order` con campos que permitan registrar quién toma el pedido en cocina, a qué sede/PDV pertenece, y el flujo de salida (sala vs reparto).

**Tareas:**

1. **Nuevos campos en `buildDeliveryOrderDocument`** (`services/couchdb.js`):
   - `salesPointId: string` — ID del punto de venta origen
   - `salesPointName: string` — nombre del PDV (desnormalizado para búsqueda rápida)
   - `takenBy: string` — ID del trabajador que "toma" el pedido en cocina
   - `takenByName: string` — nombre del trabajador (desnormalizado)
   - `takenAt: string` — timestamp de cuando se tomó
   - `orderType: string` — `'sala' | 'domicilio' | 'recogida' | 'plataforma'` — determina el flujo de salida
   - `kitchenNotes: string` — notas internas de cocina (distintas de `notes` general)
   - `kitchenPriority: number` — prioridad numérica calculada para reordenamiento (0 = máx urgencia)

2. **Sanitizar todos los campos nuevos** en `sanitizeDeliveryOrder`.

3. **Ampliar tipo TypeScript** en `deliveryApi.ts`:
   ```typescript
   export interface DeliveryOrder {
     // ... campos existentes ...
     salesPointId: string;
     salesPointName: string;
     takenBy: string;
     takenByName: string;
     takenAt: string;
     orderType: string;
     kitchenNotes: string;
     kitchenPriority: number;
   }
   ```

4. **Retrocompatibilidad:** Los campos se defaultean a `''` / `0` para pedidos existentes.

**Criterio de aceptación:**
- Un pedido puede crearse con `salesPointId`, `orderType`, etc.
- `takenBy` y `takenAt` se pueden actualizar con una llamada PUT.
- Los pedidos existentes siguen funcionando sin estos campos.

---

### TICKET KDS-03: Backend — Lógica de transición de estados con auto-timestamps

**Tipo:** Enhancement — Backend  
**Prioridad:** Alta  
**Dependencias:** KDS-02

**Descripción:**  
Actualmente `kitchenStartedAt` se setea solo si el frontend lo envía. La lógica de negocio debe vivir en el backend: al cambiar a ciertos estados, los timestamps deben registrarse automáticamente.

**Tareas:**

1. **En `buildDeliveryOrderDocument`**, detectar transición de estado y setear timestamps automáticos:
   - Si `status` cambia a `'kitchen'` y `kitchenStartedAt` está vacío → `kitchenStartedAt = now`
   - Si `status` cambia a `'assembly'` y `kitchenCompletedAt` está vacío → `kitchenCompletedAt = now`
   - Si `status` cambia a `'assembly'` y `assemblyStartedAt` está vacío → `assemblyStartedAt = now`
   - Si `status` cambia a `'delivery'` o `'delivered'` (para sala/recogida) y `assemblyCompletedAt` está vacío → `assemblyCompletedAt = now`

2. **Auto-generar `stageHistory` entry** en cada transición:
   ```javascript
   if (existing && data.status && data.status !== existing.status) {
     stageHistory.push({
       status: data.status,
       date: now,
       user: data._transitionUser || userId,
       notes: data._transitionNotes || '',
     });
   }
   ```

3. **Auto-routing al marcar "Listo" en cocina:**
   - Si `orderType === 'sala'` o `orderType === 'recogida'` → el siguiente estado tras `kitchen` es `assembly` (montaje para entrega en sala).
   - Si `orderType === 'domicilio'` o `orderType === 'plataforma'` → sigue el flujo normal `kitchen` → `assembly` → `delivery`.
   - (Nota: el auto-routing no cambia el estado automáticamente aquí sino que el frontend lo decide; pero se documenta la regla en la API para que el front la use.)

**Criterio de aceptación:**
- Al PUT un pedido con `status: 'kitchen'`, se genera `kitchenStartedAt` automáticamente.
- Al PUT con `status: 'assembly'`, se genera `kitchenCompletedAt` y `assemblyStartedAt`.
- Cada transición agrega un entry en `stageHistory` con `user` y `date`.

---

### TICKET KDS-04: Backend — Endpoint de producto agotado en directo

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** KDS-01

**Descripción:**  
Permitir que desde cocina se marque un producto del catálogo como "agotado" y que se refleje en pedidos pendientes que contengan ese producto.

**Tareas:**

1. **Nuevo endpoint `POST /api/delivery/catalog/:userId/:itemId/out-of-stock`**:
   - Recibe `{ outOfStock: boolean }`.
   - Actualiza `catalog_item.available = !outOfStock` y `catalog_item.stockQuantity = 0` (si outOfStock = true).
   - Busca pedidos en estados `pending`, `preparing`, `kitchen` que contengan ese `catalogItemId` en sus items.
   - Para cada pedido afectado, marca el item como `outOfStock: true, outOfStockAt: now`.
   - Emite evento SSE `product_out_of_stock` con `{ catalogItemId, productName, affectedOrderIds }`.

2. **Nuevo endpoint `GET /api/delivery/catalog/:userId/out-of-stock`**:
   - Lista todos los productos del catálogo con `available === false`.

3. **Añadir al router** `deliveryRouter.js`:
   ```javascript
   deliveryRouter.post('/catalog/:userId/:itemId/out-of-stock', markProductOutOfStock);
   deliveryRouter.get('/catalog/:userId/out-of-stock', listOutOfStockProducts);
   ```

4. **Funciones cliente TS** en `deliveryApi.ts`:
   ```typescript
   export async function markProductOutOfStockRequest(
     userId: string, itemId: string, outOfStock: boolean
   ): Promise<{ ok: boolean; affectedOrders: string[] }>;
   
   export async function listOutOfStockProductsRequest(
     userId: string
   ): Promise<CatalogItem[]>;
   ```

**Criterio de aceptación:**
- Marcar un producto como agotado → se actualiza el catálogo → se marcan los items afectados en pedidos abiertos → se emite evento SSE.
- Desmarcar → se restaura `available: true` en el catálogo.
- La lista de agotados devuelve solo productos con `available === false`.

---

### TICKET KDS-05: Backend — Alertas específicas de cocina

**Tipo:** Feature — Backend  
**Prioridad:** Media  
**Dependencias:** KDS-02

**Descripción:**  
Ampliar `alertEngine.js` con reglas específicas de cocina que no existen actualmente.

**Tareas:**

1. **Nuevas reglas en `alertEngine.js`:**

   a. **Cola alta** (`kitchen_queue_high`):
   - Condición: más de `config.kitchenQueueHighThreshold` (default 10) pedidos en estados `pending` + `preparing` + `kitchen`.
   - Nivel: `warning`
   - Ruta: `/saas/vertical/delivery/cocina`
   
   b. **Demasiados pedidos acumulados** (`kitchen_overload`):
   - Condición: más de `config.kitchenOverloadThreshold` (default 20) pedidos no finalizados.
   - Nivel: `alert`
   - Ruta: `/saas/vertical/delivery/cocina`
   
   c. **Pedido fuera de tiempo en cocina** (`kitchen_order_overtime`):
   - Condición: pedido con `status === 'kitchen'` y `kitchenStartedAt` > `config.kitchenMaxMinutes` (default 20 min) sin pasar a assembly.
   - Nivel: `warning` si >20 min, `alert` si >40 min.
   - Ruta: `/saas/vertical/delivery/cocina`
   
   d. **Incidencia de cocina** (`kitchen_incident`):
   - Condición: pedido con `status === 'incident'` y `incidentType` contiene `kitchen_` o `cocina_`.
   - Se emite **inmediatamente** al registrar la incidencia (no polling), via SSE.
   - Nivel: `alert`
   
   e. **Producto agotado** (`product_out_of_stock`):
   - Se emite desde KDS-04 al marcar producto agotado.
   - Nivel: `warning`

2. **Nuevos campos de configuración** (existente en `config` del alert engine):
   ```javascript
   kitchenQueueHighEnabled: true,
   kitchenQueueHighThreshold: 10,
   kitchenOverloadEnabled: true,
   kitchenOverloadThreshold: 20,
   kitchenMaxMinutesEnabled: true,
   kitchenMaxMinutes: 20,
   ```

3. **Integrar en el ciclo de polling** de `alertEngine.js` (reglas a–c) y en el endpoint de KDS-04 (regla e).

**Criterio de aceptación:**
- Con 11+ pedidos en cola → se genera alerta `kitchen_queue_high`.
- Pedido con >20min en cocina → alerta `kitchen_order_overtime`.
- Marcación de producto agotado → alerta `product_out_of_stock` por SSE.
- Las alertas llegan al frontend vía SSE y notificación push.

---

### TICKET KDS-06: Backend — Endpoint de métricas de producción

**Tipo:** Feature — Backend  
**Prioridad:** Baja  
**Dependencias:** KDS-03

**Descripción:**  
Crear un endpoint que calcule métricas de producción basándose en los timestamps ya registrados.

**Tareas:**

1. **Nuevo endpoint `GET /api/delivery/kitchen-metrics/:userId`**:
   - Query params: `from`, `to` (rango de fechas), `salesPointId` (opcional).
   - Calcula a partir de los pedidos en rango:
     - `avgKitchenTime`: media de `kitchenCompletedAt - kitchenStartedAt` (en minutos).
     - `avgAssemblyTime`: media de `assemblyCompletedAt - assemblyStartedAt`.
     - `avgTotalTime`: media de `deliveredAt - createdAt`.
     - `totalOrders`: nro de pedidos entregados en el período.
     - `ordersByChannel`: desglose por canal.
     - `ordersBySalesPoint`: desglose por PDV.
     - `peakHour`: hora del día con más pedidos.
     - `incidentRate`: % de pedidos con incidencia.
     - `avgKitchenTimeByProduct`: top 10 productos más lentos en cocina.

2. **Añadir al router:**
   ```javascript
   deliveryRouter.get('/kitchen-metrics/:userId', getKitchenMetrics);
   ```

3. **Función cliente TS:**
   ```typescript
   export interface KitchenMetrics {
     avgKitchenTime: number;
     avgAssemblyTime: number;
     avgTotalTime: number;
     totalOrders: number;
     ordersByChannel: Record<string, number>;
     ordersBySalesPoint: Record<string, number>;
     peakHour: number;
     incidentRate: number;
     avgKitchenTimeByProduct: Array<{ name: string; avgMinutes: number }>;
   }
   
   export async function getKitchenMetricsRequest(
     userId: string,
     params?: { from?: string; to?: string; salesPointId?: string }
   ): Promise<KitchenMetrics>;
   ```

**Criterio de aceptación:**
- La petición devuelve métricas correctas basadas en los timestamps existentes.
- Filtrado por PDV y rango de fechas funciona.
- Si no hay datos, devuelve zeros sin error.

---

### TICKET KDS-07: Frontend — Ruta y estructura de la página KDS

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** Ninguna (puede empezar en paralelo con backend)

**Descripción:**  
Crear la página dedicada de Cocina/KDS como componente independiente con su propia ruta, separada de `Delivery.tsx`.

**Tareas:**

1. **Crear archivo** `src/app/pages/saas/DeliveryKitchen.tsx`:
   - Exportar componente `DeliveryKitchen`.
   - Estructura general:
     ```
     ┌─────────────────────────────────────────────────┐
     │ HEADER: Título + KPIs + Filtros + Alertas       │
     ├────────────┬────────────┬────────────────────────┤
     │ COLUMNA 1  │ COLUMNA 2  │ COLUMNA 3             │
     │ En Cola    │ Preparando │ Listos                 │
     │ (pending/  │ (kitchen)  │ (assembly - recién     │
     │  preparing)│            │  completados)          │
     │            │            │                        │
     │ [tarjetas] │ [tarjetas] │ [tarjetas]             │
     └────────────┴────────────┴────────────────────────┘
     ```
   - **Layout tipo Kanban** con 3 columnas scrollables verticalmente.
   - **Responsive:** En móvil, cambia a vista de tabs (una columna a la vez, como `CocinaTabNew.tsx` del prototipo).

2. **Registrar ruta** en `routes.tsx`:
   ```typescript
   import { DeliveryKitchen } from './pages/saas/DeliveryKitchen';
   // Dentro de children de 'saas':
   { path: 'vertical/delivery/cocina', Component: DeliveryKitchen },
   ```

3. **Añadir al Sidebar** (`Sidebar.tsx`):
   - Nuevo item en la sección delivery:
     ```typescript
     { id: 'delivery-kitchen', navKey: 'deliveryKitchen', icon: <ChefHat className="w-5 h-5" />, path: '/saas/vertical/delivery/cocina' },
     ```
   - Añadir al grupo `delivery` en `GROUPS`.
   - Añadir detección de ruta activa.

4. **Usar `<Layout>` wrapper** igual que el resto de páginas SaaS.

5. **State management:**
   - `useState` + `useCallback` + `useMemo` (patrón estándar del proyecto, no Redux).
   - `useAuth` para obtener usuario y permisos.
   - Polling con `setInterval` cada 15s (más frecuente que las 30s del worker, ya que la cocina requiere más inmediatez).
   - Hook `useSSE` para recibir eventos en tiempo real (`product_out_of_stock`, `notification`).

**Criterio de aceptación:**
- Navegar a `/saas/vertical/delivery/cocina` muestra la página KDS.
- Aparece en el sidebar bajo el grupo Delivery.
- La página carga pedidos reales del API.
- En móvil, la UI se adapta a una sola columna con tabs.

---

### TICKET KDS-08: Frontend — Header KDS con KPIs, filtros y barra de alertas

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** KDS-07, KDS-02

**Descripción:**  
El header de la página KDS debe mostrar información clave de un vistazo y permitir filtrar la vista.

**Tareas:**

1. **Barra de KPIs** (siempre visible, parte superior):
   - **En cola:** Nro de pedidos `pending` + `preparing` — fondo ámbar.
   - **En cocina:** Nro de pedidos `kitchen` — fondo naranja.
   - **Listos:** Nro de pedidos recién pasados a `assembly` (últimos 30 min) — fondo verde.
   - **Tiempo medio:** Media de (`kitchenCompletedAt - kitchenStartedAt`) de los pedidos completados hoy — fondo azul.
   - **Incidencias:** Nro de pedidos con `status === 'incident'` hoy — fondo rojo.
   - Diseño: tarjetas compactas en fila horizontal con número grande y label pequeño. Igual que el patrón de `WorkerTpvDelivery.tsx` líneas 393-405, pero con más métricas.

2. **Fila de filtros:**
   - **Selector de sede/PDV:** Dropdown con los `PointOfSale` del negocio. Opción "Todas" por defecto. Solo visible si hay >1 PDV. Usa `listPointsOfSaleRequest`.
   - **Buscador:** Input de búsqueda por número de pedido, nombre de cliente o nombre de producto.
   - **Botón refrescar:** Forzar recarga manual.
   - **Toggle vista:** Kanban (columnas) / Lista (una sola columna tipo tabla).

3. **Barra de alertas** (visible solo si hay alertas activas):
   - Franja horizontal debajo de los filtros, con fondo rojo/ámbar según severidad.
   - Muestra: "Cola alta: 15 pedidos pendientes", "Pedido #PED-X3F fuera de tiempo (25 min)", "Producto agotado: Hamburguesa Classic".
   - Auto-dismiss tras 30s o al hacer clic en "X".
   - Se alimenta de los eventos SSE y del motor de alertas.

**Diseño visual:**
- KPIs: `grid grid-cols-5 gap-3`, tarjetas con `rounded-2xl`, número en `text-3xl font-bold`, label en `text-xs uppercase tracking-wider`.
- Filtros: `flex items-center gap-3` con select y search estilizados con bordes redondeados.
- Alertas: `animate-pulse` suave en iconos, slide-in desde arriba.

**Criterio de aceptación:**
- Los KPIs reflejan los datos reales y se actualizan con cada polling/SSE.
- Filtrar por PDV filtra las 3 columnas.
- La barra de alertas aparece cuando hay alertas activas.
- El buscador filtra en tiempo real entre los pedidos cargados.

---

### TICKET KDS-09: Frontend — Tarjeta de pedido KDS (componente `KitchenOrderCard`)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** KDS-01, KDS-07

**Descripción:**  
Componente tarjeta optimizado para el entorno de cocina. Debe ser legible a distancia (pantalla montada en cocina), con información densa pero jerarquizada.

**Tareas:**

1. **Crear componente `KitchenOrderCard`** dentro de `DeliveryKitchen.tsx` (o fichero auxiliar si crece):
   
   **Información mostrada (de arriba a abajo):**
   
   a. **Cabecera:**
   - Número de pedido (`#PED-X3F`) — `text-xl font-bold font-mono`.
   - Tiempo transcurrido (timer en vivo, e.g. "12 min") — Se actualiza cada minuto. Colores:
     - Verde `<10 min`
     - Ámbar `10–20 min`
     - Rojo `>20 min`
   - Badge de canal (`Web`, `App`, `Teléfono`, `Directo`) — chip pequeño.
   - Badge de tipo (`Domicilio`, `Recogida`, `Sala`) — chip con icono.
   - Indicador urgente si `priority === 'urgent' || 'high'` — borde rojo pulsante.
   
   b. **Productos** (sección principal):
   - Agrupados por categoría (Principales, Complementos, Bebidas, Postres) si `item.category` existe.
   - Cada línea: `{quantity}x {name}` en bold + extras debajo en texto más pequeño.
   - Si `item.extras?.length > 0`: mostrar como chips o lista separada por comas debajo del nombre.
   - Si `item.allergens?.length > 0`: iconos/badges de alérgenos (gluten, lactosa, frutos secos, etc.) al lado del nombre.
   - Si `item.ingredients?.length > 0`: lista colapsable "Ingredientes" con nombre y cantidad.
   - Si `item.notes`: texto en ámbar (observaciones del cliente para ese producto).
   - Si `item.outOfStock`: línea tachada con badge "AGOTADO" en rojo.
   
   c. **Observaciones generales:**
   - Si `order.notes` tiene contenido: bloque con fondo ámbar, icono de mensaje, texto de notas.
   
   d. **Barra de acciones** (footer de la tarjeta):
   - Botones según el estado actual (ver KDS-10).

2. **Estilos y legibilidad:**
   - Fondo blanco con borde coloreado según urgencia/estado.
   - Pedidos urgentes: `border-l-4 border-red-500` + sutil `bg-red-50/30`.
   - Pedidos fuera de tiempo: `ring-2 ring-red-400 animate-pulse` (sutil).
   - Sombra suave `shadow-sm hover:shadow-md`.
   - Esquinas `rounded-2xl`.
   - Min-width adecuado para lectura (~320px en desktop, 100% en móvil).

3. **Timer en vivo:**
   - Usar `useEffect` con `setInterval(1000)` para actualizar cada segundo (o 10s para reducir renders).
   - Calcular `Math.floor((Date.now() - new Date(order.kitchenStartedAt || order.createdAt).getTime()) / 60000)`.
   - Mostrar formato: `Xmin` si <60, `Xh Ym` si ≥60.

**Criterio de aceptación:**
- La tarjeta muestra toda la información especificada.
- Items con extras y alérgenos se muestran correctamente.
- El timer se actualiza en vivo.
- Pedidos urgentes y fuera de tiempo son visualmente distinguibles.
- El diseño es legible en una pantalla de cocina (24-32").

---

### TICKET KDS-10: Frontend — Acciones de cocina (tomar, preparar, listo, incidencia, agotado)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** KDS-02, KDS-03, KDS-04, KDS-09

**Descripción:**  
Implementar todas las acciones que se pueden realizar desde la tarjeta de pedido en la vista KDS.

**Tareas:**

1. **Acciones según estado del pedido:**

   | Estado actual | Acciones disponibles |
   |---|---|
   | `pending` | **Tomar pedido** (pasa a `preparing`, registra `takenBy/takenAt`) |
   | `preparing` | **Pasar a Cocina** (pasa a `kitchen`, registra `kitchenStartedAt`) |
   | `kitchen` | **Marcar Listo** (pasa a `assembly`, registra `kitchenCompletedAt`) |
   | `kitchen` | **Registrar incidencia** (abre modal) |
   | Cualquiera | **Marcar producto agotado** (por item, abre confirmación) |

2. **Botón "Tomar pedido"** (`pending` → `preparing`):
   - Botón primario azul en la tarjeta.
   - Al hacer clic: `updateDeliveryOrderRequest(userId, { ...order, status: 'preparing', takenBy: user.id, takenByName: user.name, takenAt: new Date().toISOString() })`.
   - Toast de confirmación: "Pedido #X tomado".
   - Animación: la tarjeta se desplaza suavemente de columna "En Cola" a "Preparando".

3. **Botón "A Cocina"** (`preparing` → `kitchen`):
   - Botón naranja: "Enviar a cocina".
   - El backend auto-genera `kitchenStartedAt` (KDS-03).
   - La tarjeta pasa a la columna "En Cocina".

4. **Botón "Listo"** (`kitchen` → `assembly`):
   - Botón verde grande y prominente: "✓ Listo".
   - El backend auto-genera `kitchenCompletedAt` y `assemblyStartedAt` (KDS-03).
   - Si `orderType === 'sala'`: toast "Pedido #X listo para Sala".
   - Si `orderType === 'domicilio'`: toast "Pedido #X listo para Montaje → Reparto".
   - La tarjeta desaparece de la vista KDS (pasa a assembly/montaje).

5. **Botón "Incidencia"** (disponible en `kitchen`):
   - Botón rojo outline: "⚠ Incidencia".
   - Abre modal (ver KDS-11).

6. **Acción "Producto agotado"** (por item):
   - Icono de "ban" / "prohibido" al lado de cada item en la tarjeta (solo visible en hover en desktop, siempre visible en mobile).
   - Al hacer clic: dialog de confirmación "¿Marcar '{nombre}' como agotado? Se notificará y afectará a otros pedidos."
   - Llama a `markProductOutOfStockRequest` (KDS-04).
   - Actualiza visualmente el item en todas las tarjetas que lo contengan.

7. **Feedback visual:**
   - Todos los botones muestran spinner (`Loader2 animate-spin`) durante la petición.
   - Se deshabilitan mientras hay una acción en curso.
   - Transiciones suaves con `transition-all duration-300`.

**Criterio de aceptación:**
- Cada acción actualiza el pedido vía API y refleja el cambio en la UI inmediatamente (optimistic update).
- Los botones se deshabilitan durante la petición.
- "Tomar pedido" registra el cocinero y timestamp.
- "Marcar Listo" hace desaparecer la tarjeta de la vista KDS.
- "Producto agotado" afecta el catálogo y otros pedidos abiertos.

---

### TICKET KDS-11: Frontend — Modal de incidencia de cocina

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** KDS-10

**Descripción:**  
Modal para registrar incidencias desde cocina, con tipos predefinidos y campo de notas.

**Tareas:**

1. **Crear componente `KitchenIncidentModal`:**
   - Props: `order: DeliveryOrder`, `onClose`, `onSubmit`.
   - Campos:
     - **Tipo de incidencia** (select): `falta_ingrediente`, `error_preparacion`, `cambio_solicitado`, `producto_agotado`, `equipo_averiado`, `otro`.
     - **Item afectado** (select opcional): dropdown con los items del pedido.
     - **Descripción** (textarea): texto libre obligatorio.
     - **Severidad**: `baja`, `media`, `alta` (radio buttons).
   
2. **Al enviar:**
   - Actualiza el pedido:
     - `status: 'incident'`
     - `incidentType: tipoSeleccionado`
     - `incidentNotes: descripción`
   - Agrega a `stageHistory`:
     ```json
     { "status": "incident", "date": "...", "user": "userId", "notes": "tipo: falta_ingrediente | descripción..." }
     ```
   - Emite alerta SSE `kitchen_incident` (KDS-05).

3. **Diseño:**
   - Modal centrado con overlay blur.
   - Estilo consistente con `OrderDetail` existente.
   - Botón "Registrar" rojo prominente.
   - Botón "Cancelar" gris.

**Criterio de aceptación:**
- Se puede registrar una incidencia con tipo, item afectado y descripción.
- El pedido pasa a estado `incident`.
- La incidencia queda registrada en `stageHistory`.
- Se emite alerta en tiempo real.

---

### TICKET KDS-12: Frontend — Columnas Kanban con drag-and-drop y reordenamiento

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** KDS-07, KDS-09

**Descripción:**  
La vista principal del KDS son 3 columnas tipo Kanban. Cada columna tiene su cabecera con contador y las tarjetas se reordenan automáticamente.

**Tareas:**

1. **Estructura de 3 columnas:**

   | Columna | Estados incluidos | Color cabecera | Icono |
   |---|---|---|---|
   | En Cola | `pending`, `preparing` | Ámbar | `Clock` |
   | En Cocina | `kitchen` | Naranja | `ChefHat` |
   | Listos | `assembly` (solo últimos 30 min, para dar feedback visual) | Verde | `CheckCircle2` |

2. **Cabecera de columna:**
   - Nombre + icono + contador de pedidos (badge circular).
   - Fondo degradado sutil acorde al color.
   - Si la columna está vacía: placeholder con icono gris y texto "Sin pedidos".

3. **Ordenamiento automático dentro de cada columna:**
   - **Primero:** Pedidos con `priority === 'urgent'` o `'high'`.
   - **Segundo:** Pedidos fuera de tiempo (> umbral configurable).
   - **Tercero:** Ordenar por `createdAt` ascendente (más antiguo arriba = más urgente).
   - Indicador visual de posición: el pedido más urgente tiene un borde superior más grueso o un badge de posición.

4. **Scroll vertical independiente** por columna:
   - Cada columna es un `div` con `overflow-y-auto` y altura calculada (`calc(100vh - header)`).
   - Smooth scroll.

5. **Animaciones:**
   - Al cambiar de columna: `transition-all duration-300` con fade-out/slide.
   - Nuevos pedidos: aparecen con animación de slide-in desde arriba.

6. **Vista móvil (< 768px):**
   - Cambiar a sistema de tabs (igual que `CocinaTabNew.tsx` prototipo).
   - 3 tabs: "En Cola (X)", "En Cocina (X)", "Listos (X)".
   - Scroll vertical en la pestaña activa.
   - Swipe horizontal para cambiar de tab (si es posible sin librería extra).

**Criterio de aceptación:**
- Las 3 columnas se muestran side-by-side en desktop.
- Los pedidos se reordenan automáticamente por urgencia y tiempo.
- En mobile, se usa vista de tabs.
- Al cambiar de estado un pedido, se mueve de columna con animación.

---

### TICKET KDS-13: Frontend — Integración tiempo real (SSE + Polling)

**Tipo:** Feature — Frontend  
**Prioridad:** Alta  
**Dependencias:** KDS-07, KDS-05

**Descripción:**  
La cocina necesita la mayor inmediatez posible. Combinar polling frecuente con SSE para actualizaciones instantáneas.

**Tareas:**

1. **Polling base:**
   - `setInterval` cada 15 segundos para `listDeliveryOrdersRequest`.
   - Si la pestaña no está visible (`document.hidden`), reducir a cada 60s.
   - Al volver a estar visible, forzar recarga inmediata.

2. **Suscripción SSE:**
   - Usar `useSSE` hook existente.
   - Escuchar eventos:
     - `delivery_order_updated`: refrescar la lista de pedidos (o actualizar individualmente si el payload incluye el pedido).
     - `product_out_of_stock`: actualizar items afectados en todas las tarjetas + mostrar alerta banner.
     - `notification` con `category` en `['kitchen_queue_high', 'kitchen_overload', 'kitchen_order_overtime', 'kitchen_incident']`: mostrar alerta en la barra superior.
   
3. **Optimistic updates:**
   - Al ejecutar una acción (tomar, avanzar, listo), actualizar el estado local inmediatamente antes de que el servidor responda.
   - Si el servidor responde con error: revertir y mostrar toast de error.

4. **Indicador de conexión:**
   - Pequeño dot verde/rojo en el header que indica si la conexión SSE está activa.
   - Si se pierde la conexión: fallback a polling cada 10s + dot rojo + toast "Conexión perdida, reintentando...".

**Criterio de aceptación:**
- Los pedidos se actualizan en <2s cuando otro usuario cambia un estado (via SSE).
- Si SSE falla, el polling sigue funcionando como fallback.
- Indicador visual de estado de conexión.
- Los optimistic updates hacen la UI sentirse instantánea.

---

### TICKET KDS-14: Frontend — Perfiles de usuario (Gerente vs Trabajador)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** KDS-07, KDS-08

**Descripción:**  
La página debe comportarse diferente según el perfil del usuario: gerente ve todo, trabajador ve solo su sede/turno.

**Tareas:**

1. **Detección del perfil:**
   - Usar `useAuth()` → `user.role` y `user.permissions`.
   - Si `role === 'admin'` o `role === 'owner'` o tiene permiso `kitchen_manage`: modo **gerente**.
   - Si `role === 'worker'` o tiene permiso `kitchen_operate`: modo **trabajador**.

2. **Modo Gerente:**
   - Ve **todas** las cocinas/sedes → puede filtrar por PDV.
   - Ve las **métricas** completas (KDS-08 KPIs + KDS-06 métricas avanzadas).
   - Puede **reasignar** pedidos entre cocineros.
   - Ve el botón "Ver informes" que enlaza a `/saas/reports`.
   - Puede configurar umbrales de alertas (enlace a configuración).

3. **Modo Trabajador:**
   - Ve solo pedidos de **su sede** (`salesPointId` matching con su PDV asignado).
   - Si no tiene PDV asignado: mostrar mensaje "No tienes un punto de venta asignado. Contacta al gerente."
   - No ve el filtro de sede (ya está pre-filtrado).
   - Puede ejecutar las acciones permitidas: tomar, preparar, listo, incidencia, agotado.
   - No puede reasignar pedidos.
   - Ve KPIs simplificados (solo cola, en cocina, listos de su sede).

4. **UI diferenciada:**
   - Gerente: header completo con selector de sedes, métricas globales, enlace a informes.
   - Trabajador: header simplificado con nombre de su sede, métricas locales, botón de refrescar.

**Criterio de aceptación:**
- Un usuario con rol admin ve todas las sedes y métricas completas.
- Un usuario trabajador solo ve los pedidos de su sede asignada.
- Las acciones están correctamente limitadas según perfil.
- Un trabajador sin sede asignada ve un mensaje claro.

---

### TICKET KDS-15: Frontend — Modal de detalle de pedido expandido

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** KDS-09

**Descripción:**  
Al hacer clic en una tarjeta, se abre un modal con toda la información del pedido, la línea temporal de estados y las acciones disponibles.

**Tareas:**

1. **Crear componente `KitchenOrderDetailModal`:**
   - Usa el patrón de `OrderDetail` existente en `WorkerTpvDelivery.tsx`.
   - Secciones:
     
     a. **Cabecera:** Número, estado badge, tiempo transcurrido, canal, tipo.
     
     b. **Cliente:** Nombre, teléfono (con botón llamar), dirección (si aplica).
     
     c. **Productos** (lista completa):
     - Agrupados por categoría.
     - Cada item: cantidad, nombre, extras, alérgenos (con iconos), ingredientes expandibles, notas del item.
     - Checkbox de "preparado" por item (estado local, para que el cocinero lleve control visual sin persistir).
     
     d. **Observaciones:** Bloque destacado con `order.notes` + `order.kitchenNotes`.
     
     e. **Línea temporal (`stageHistory`):**
     - Timeline vertical con cada transición: estado, fecha/hora, usuario, notas.
     - Destaca visualmente el estado actual.
     
     f. **Acciones:** Mismas acciones que la tarjeta (KDS-10) pero con botones más grandes.
     
     g. **Info adicional:** PDV, cocinero asignado (`takenByName`), hora de creación.

2. **Interacción:**
   - Cierre con clic fuera, botón X, o tecla Escape (`useModalClose`).
   - Scroll interno si el contenido es largo.
   - Responsive: en mobile ocupa pantalla completa.

**Criterio de aceptación:**
- Al hacer clic en una tarjeta se abre el modal con toda la información.
- La línea temporal muestra el historial de estados.
- Las acciones funcionan igual que desde la tarjeta.
- Se cierra correctamente con Escape, clic fuera o botón X.

---

### TICKET KDS-16: Frontend — Sonido y notificaciones visuales

**Tipo:** Enhancement — Frontend  
**Prioridad:** Baja  
**Dependencias:** KDS-13

**Descripción:**  
En un entorno de cocina real, las notificaciones sonoras son críticas para no perder pedidos nuevos.

**Tareas:**

1. **Sonido de nuevo pedido:**
   - Al llegar un nuevo pedido (detectado por polling/SSE que no existía en la lista previa): reproducir sonido corto de "ding" / "bell".
   - Usar Web Audio API o un `<audio>` element con fichero `.mp3`/`.wav` embebido.
   - Botón toggle en header para silenciar/activar sonido.
   - Respetar preferencia del usuario en `localStorage`.

2. **Sonido de alerta:**
   - Si hay pedido fuera de tiempo >30 min: sonido de alarma más insistente (diferente al de nuevo pedido), repetido cada 60s hasta que se actúe.

3. **Flash visual:**
   - Al llegar nuevo pedido: la columna "En Cola" hace un flash breve (`animate-flash` custom) para llamar la atención.
   - Pedidos fuera de tiempo: parpadeo sutil continuo del timer (no agresivo pero notable).

4. **Notificación del navegador:**
   - Si la pestaña no está en foco: usar `Notification API` para enviar notificación del navegador "Nuevo pedido #X en cocina".
   - Pedir permiso al usuario la primera vez.

**Criterio de aceptación:**
- Suena un "ding" cuando llega un nuevo pedido.
- Se puede silenciar con un botón.
- Pedidos fuera de tiempo tienen alarma sonora periódica.
- Si la pestaña está en segundo plano, llega una notificación del navegador.

---

### TICKET KDS-17: Frontend — Producto agotado desde KDS (UI)

**Tipo:** Feature — Frontend  
**Prioridad:** Media  
**Dependencias:** KDS-04, KDS-09

**Descripción:**  
Interfaz para que el cocinero pueda marcar un producto como agotado directamente desde la tarjeta del pedido.

**Tareas:**

1. **Botón/icono por item:**
   - Junto a cada item en la tarjeta KDS, mostrar un icono `Ban` (prohibido) tenue que se vuelve prominente en hover.
   - En mobile: siempre visible como botón pequeño.

2. **Dialog de confirmación:**
   - "¿Marcar '{nombre del producto}' como agotado?"
   - "Esto notificará a todos los puestos y afectará a X pedidos pendientes."
   - Mostrar cuántos pedidos se verán afectados (calcular en frontend filtrando los pedidos cargados que contengan ese `catalogItemId`).
   - Botones: "Sí, agotado" (rojo) / "Cancelar" (gris).

3. **Efecto visual tras marcar:**
   - El item queda **tachado** con línea y badge "AGOTADO" en rojo.
   - Se aplica a **todas** las tarjetas visibles que tengan ese producto (actualización en cascada en el state local).

4. **Panel lateral de productos agotados** (opcional, para gerente):
   - Botón en el header "Agotados (X)" que abre un drawer lateral.
   - Lista de productos actualmente agotados con botón "Restaurar disponibilidad".
   - Al restaurar: llama a `markProductOutOfStockRequest(userId, itemId, false)`.

**Criterio de aceptación:**
- Se puede marcar un producto como agotado desde cualquier tarjeta.
- Se muestra confirmación con nro de pedidos afectados.
- Todos los items de ese producto en todas las tarjetas se actualizan visualmente.
- Se puede restaurar la disponibilidad desde el panel de agotados.

---

### TICKET KDS-18: Conexiones — Links y navegación entre módulos

**Tipo:** Enhancement — Frontend  
**Prioridad:** Baja  
**Dependencias:** KDS-07

**Descripción:**  
La página KDS debe tener navegación clara hacia los módulos conectados.

**Tareas:**

1. **Links desde el KDS:**
   - Botón "Ver Pedidos" → `/saas/delivery` (pestaña pedidos).
   - Botón "Montaje" → `/saas/delivery` (pestaña montaje) — o futura ruta dedicada.
   - Botón "Sala / Reparto" → `/saas/delivery` (pestaña reparto) — o futura ruta dedicada.
   - Botón "Stock" → `/saas/articles` o `/saas/delivery-catalog`.
   - Botón "Informes" → `/saas/reports`.
   - Botón "Alertas" → drawer de notificaciones (`SAAS__NotificationsDrawer`).

2. **Links hacia el KDS:**
   - En `Delivery.tsx`, en la pestaña Cocina, añadir banner/botón: "Abrir vista KDS completa →" que enlaza a `/saas/vertical/delivery/cocina`.
   - En alertas de `stale_delivery` y `kitchen_*`, cambiar la ruta de navegación a `/saas/vertical/delivery/cocina`.

3. **Breadcrumb** (opcional):
   - Si el Layout soporta breadcrumbs: "Delivery > Cocina / KDS".

**Criterio de aceptación:**
- Desde KDS se puede navegar a todos los módulos conectados.
- Desde `Delivery.tsx` se puede abrir el KDS con un clic.
- Las alertas de cocina enlazan al KDS.

---

## Resumen de dependencias

```
KDS-01 (Items model)  ──────────────────────> KDS-09 (Tarjeta)
KDS-02 (Order model)  ──> KDS-03 (Auto-ts) ─> KDS-10 (Acciones)
                       ──> KDS-05 (Alertas) ─> KDS-13 (SSE)
KDS-04 (Agotado API)  ──────────────────────> KDS-17 (Agotado UI)
KDS-06 (Métricas API) ──────────────────────> KDS-08 (KPIs header)

KDS-07 (Ruta/Struct)  ──> KDS-08 (Header)
                       ──> KDS-09 (Tarjeta)  ──> KDS-15 (Detalle modal)
                       ──> KDS-12 (Columnas)
                       ──> KDS-13 (SSE)
                       ──> KDS-14 (Perfiles)
                       ──> KDS-16 (Sonido)
                       ──> KDS-18 (Links)
```

## Orden de implementación sugerido

| Fase | Tickets | Descripción |
|------|---------|-------------|
| **Fase 1 — Backend base** | KDS-01, KDS-02, KDS-03 | Modelo de datos ampliado + auto-timestamps |
| **Fase 2 — Frontend core** | KDS-07, KDS-09, KDS-12, KDS-10 | Página + tarjetas + columnas + acciones básicas |
| **Fase 3 — Tiempo real** | KDS-13, KDS-08 | SSE + header con KPIs y filtros |
| **Fase 4 — Producto agotado** | KDS-04, KDS-17 | Backend endpoint + UI de agotados |
| **Fase 5 — Alertas y perfiles** | KDS-05, KDS-14, KDS-11 | Motor alertas cocina + perfiles + incidencias |
| **Fase 6 — Métricas y polish** | KDS-06, KDS-15, KDS-16, KDS-18 | Métricas + detalle modal + sonidos + links |

---

## Notas de diseño visual

**Paleta de colores de la cocina:**
- En cola: Ámbar (`amber-50/100/500/700`)
- En cocina / preparando: Naranja (`orange-50/100/500/700`)
- Listo: Verde (`green-50/100/500/700`)
- Urgente: Rojo (`red-50/100/500/700`)
- Incidencia: Rojo intenso
- Agotado: Gris tachado con badge rojo

**Tipografía KDS (legible a distancia):**
- Número de pedido: `text-xl font-bold font-mono` (24px+)
- Productos: `text-base font-semibold` (16px)
- Extras/notas: `text-sm` (14px)
- Timer: `text-lg font-bold tabular-nums` (con color dinámico)

**Referencia de alérgenos (iconos/emojis sugeridos):**
- Gluten: 🌾
- Lácteos: 🥛
- Huevos: 🥚
- Frutos secos: 🥜
- Pescado: 🐟
- Marisco: 🦐
- Soja: 🫘
- Apio: 🥬
- Mostaza: 🟡
- Sésamo: ⚪
- Sulfitos: 🍷
- Altramuces: 🌸
- Moluscos: 🐚

**Patrón de componentes Tailwind + Radix:**
- Seguir el estilo de `WorkerTpvDelivery.tsx` para tarjetas (`rounded-2xl border-2 p-4`).
- Usar `sonner` para toasts de feedback.
- Modales con overlay `backdrop-blur-sm`.
- Botones con hover states claros y `disabled:opacity-50`.
